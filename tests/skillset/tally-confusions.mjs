// 誤読を1文字ずつ突き合わせて集計し、文字混同マップ（CHAR_CONFUSION_MAP）への
// 読み替え候補を出す。
//
//   node tests/skillset/tally-confusions.mjs --set=2026-09-11a
//   node tests/skillset/tally-confusions.mjs --set=2026-09-11a --conditions=sharp,pc-q70
//   node tests/skillset/tally-confusions.mjs --sets=2026-09-11a,2026-09-12a
//
// 突き合わせるのは「混同マップを**通していない**正規化」どうし。
// マップを通したあとで比べると、既存のマップが直した誤読が見えなくなるため。
// 置き換え（a→b）と、抜け落ち・挿入は分けて数える（1文字置き換えのマップでは
// 抜け落ち・挿入は直せないので、候補にできない）。
//
// 出力: reports/confusions-<セット>.json

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { assetsRoot, assetsDir, relToAssets } from './lib/assets.mjs';
import { common, normalizeWithoutConfusion } from './lib/common-in-node.mjs';

// 正解とかけ離れた読み（別物としか言いようがないもの）は文字の対応づけに意味が無いので外す。
const MAX_RELATIVE_DISTANCE = 0.4;

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

/** 編集距離の経路をたどって、置き換え・抜け落ち・挿入を取り出す。 */
export function editOps(a, b) {
	const la = a.length, lb = b.length;
	const d = [];
	for (let i = 0; i <= la; i++) {
		d.push(new Int32Array(lb + 1));
		d[i][0] = i;
	}
	for (let j = 0; j <= lb; j++) d[0][j] = j;
	for (let i = 1; i <= la; i++) {
		for (let j = 1; j <= lb; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
		}
	}
	const ops = [];
	let i = la, j = lb;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
			if (a[i - 1] !== b[j - 1]) ops.push({ type: 'sub', from: a[i - 1], to: b[j - 1], at: j - 1 });
			i--; j--;
		} else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
			// OCR側にだけある文字＝余計に読まれた（挿入）
			ops.push({ type: 'ins', from: a[i - 1], at: j });
			i--;
		} else {
			// 正解にあってOCR側に無い文字＝読み落とし
			ops.push({ type: 'del', to: b[j - 1], at: j - 1 });
			j--;
		}
	}
	return { distance: d[la][lb], ops: ops.reverse() };
}

function bump(map, key) {
	map.set(key, (map.get(key) || 0) + 1);
}

async function main() {
	const setsArg = argValue('sets', null);
	const sets = setsArg ? setsArg.split(',').map((s) => s.trim()) : [argValue('set', '2026-09-11a')];
	const conditionsArg = argValue('conditions', null);
	const reportsDir = path.join(assetsRoot(), 'reports');

	const subs = new Map(); // "誤読字→正字" → 回数
	const dels = new Map(); // 読み落とされた字
	const inss = new Map(); // 余計に読まれた字
	const perCondition = new Map();
	const examples = new Map();
	let usedReads = 0, skippedReads = 0, cards = 0;

	for (const setName of sets) {
		const truthFile = path.join(assetsRoot(), 'truth', `${setName}.json`);
		if (!fsSync.existsSync(truthFile)) {
			console.log(`※ truth/${setName}.json が無いので飛ばします`);
			continue;
		}
		const truth = JSON.parse(await fs.readFile(truthFile, 'utf-8'));
		const nameById = new Map(truth.cards.map((c) => [c.id, c.skillName]));
		const files = fsSync
			.readdirSync(reportsDir)
			.filter((f) => f.startsWith(`ocr-${setName}-`) && f.endsWith('.json'))
			.filter((f) => !conditionsArg || conditionsArg.split(',').some((c) => f === `ocr-${setName}-${c.trim()}.json`));
		for (const f of files) {
			const rep = JSON.parse(await fs.readFile(path.join(reportsDir, f), 'utf-8'));
			const key = rep.condition;
			if (!perCondition.has(key)) perCondition.set(key, { subs: 0, dels: 0, inss: 0, reads: 0, clean: 0 });
			const pc = perCondition.get(key);
			rep.rows.forEach((row) => {
				const name = nameById.get(row.id);
				if (!name) return;
				cards++;
				const target = normalizeWithoutConfusion(name);
				(row.texts || [row.text]).forEach((t) => {
					const read = normalizeWithoutConfusion(t);
					if (!read || !target) { skippedReads++; return; }
					const { distance, ops } = editOps(read, target);
					if (distance > Math.max(1, Math.round(target.length * MAX_RELATIVE_DISTANCE))) {
						skippedReads++;
						return;
					}
					usedReads++;
					pc.reads++;
					if (distance === 0) pc.clean++;
					ops.forEach((op) => {
						if (op.type === 'sub') {
							const k = `${op.from}→${op.to}`;
							bump(subs, k);
							pc.subs++;
							if (!examples.has(k)) examples.set(k, []);
							if (examples.get(k).length < 4) examples.get(k).push({ set: setName, condition: key, id: row.id, read: t, truth: name });
						} else if (op.type === 'del') {
							bump(dels, op.to);
							pc.dels++;
						} else {
							bump(inss, op.from);
							pc.inss++;
						}
					});
				});
			});
		}
	}

	const existing = common.CHAR_CONFUSION_MAP;
	const subList = [...subs.entries()]
		.map(([k, n]) => {
			const [from, to] = k.split('→');
			return { from, to, count: n, alreadyMapped: existing[from] === to, mappedTo: existing[from] || null, examples: examples.get(k) || [] };
		})
		.sort((a, b) => b.count - a.count);
	const delList = [...dels.entries()].map(([ch, n]) => ({ char: ch, count: n })).sort((a, b) => b.count - a.count);
	const insList = [...inss.entries()].map(([ch, n]) => ({ char: ch, count: n })).sort((a, b) => b.count - a.count);

	console.log(`対象カード ${cards}件 / 突き合わせた読み ${usedReads}件（かけ離れていて外した読み ${skippedReads}件）`);
	console.log('\n■ 置き換え（誤読字→正字）上位');
	subList.slice(0, 30).forEach((s) => {
		console.log(`  ${s.from} → ${s.to}   ${s.count}回` + (s.alreadyMapped ? '（既存マップにあり）' : s.mappedTo ? `（既存は ${s.from}→${s.mappedTo}）` : ''));
	});
	console.log('\n■ 読み落とし（正解にあってOCRに無い字）上位');
	delList.slice(0, 12).forEach((s) => console.log(`  ${s.char}   ${s.count}回`));
	console.log('\n■ 余計に読まれた字 上位');
	insList.slice(0, 12).forEach((s) => console.log(`  ${s.char}   ${s.count}回`));
	console.log('\n■ 条件ごとの誤りの内訳');
	for (const [k, v] of perCondition) {
		console.log(`  ${k}: 読み ${v.reads}（そのうち完全に一致 ${v.clean}） 置き換え ${v.subs} / 読み落とし ${v.dels} / 余計 ${v.inss}`);
	}

	const out = {
		sets,
		generatedAt: new Date().toISOString(),
		note: '混同マップを通していない正規化どうしで突き合わせた結果。置き換えだけが CHAR_CONFUSION_MAP の候補になる。',
		maxRelativeDistance: MAX_RELATIVE_DISTANCE,
		cards,
		usedReads,
		skippedReads,
		substitutions: subList,
		deletions: delList,
		insertions: insList,
		perCondition: Object.fromEntries(perCondition)
	};
	const outFile = path.join(assetsDir('reports'), `confusions-${sets.join('+')}.json`);
	await fs.writeFile(outFile, JSON.stringify(out, null, '\t'), 'utf-8');
	console.log(`\n→ ${relToAssets(outFile)}`);
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
