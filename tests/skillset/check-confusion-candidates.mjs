// 文字混同マップ（CHAR_CONFUSION_MAP）への読み替え候補を、機械的に検査する。
//
//   node tests/skillset/check-confusion-candidates.mjs --map=嵌=嵐,蓬=夢
//   node tests/skillset/check-confusion-candidates.mjs --from-report --min=8
//   node tests/skillset/check-confusion-candidates.mjs --from-report --min=8 --combined
//
// 後続フェーズ(b)で js/common.js を変えるたびに回す前提の常設ツール。
// **この段では common.js を一切変更しない。** 読み替えを外から差し込んで試す。
//
// 見るのは3つ:
//   1. 衝突 … その読み替えを足すと、別々のスキル名が正規化後に同じ文字列になってしまわないか
//      （マスター445種と exam.html の133種の両方で見る）
//   2. 食い違い … その字が既に別の字へ読み替えられていないか
//   3. 手元のOCR結果の変化 … 保存済みの生の読み（reports/ocr-*.json）を読み替え後の
//      正規化で照合し直して、判定がどう変わるかを数える。
//      **「一意に一致したが誤り」が増える候補は採用しない。**
//
// 注意: 既存の `npm run test:ocr`（因子画面の実画像）は test-images/ に画像がある環境でのみ
// 走る。ここでの3.は「同じ生の読みを別の正規化で照合し直す」検査なので、画像が無くても
// 回せるが、因子画面そのものの再OCRの代わりにはならない。両方を回すのが望ましい。

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { assetsRoot, assetsDir, relToAssets, REPO_ROOT } from './lib/assets.mjs';
import { common, normalizeWithExtraMap, loadMaster } from './lib/common-in-node.mjs';
import { buildMatcher, isAutoAccepted } from './lib/match.mjs';
import { combineReads } from './run-ocr-crops.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

async function examSkillNames() {
	// ソースを正規表現で拾わず、実際に exam.html を開いて定数を読む（tests/ocr と同じ方針）
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto(pathToFileURL(path.join(REPO_ROOT, 'exam.html')).href, { waitUntil: 'load' });
		return await page.evaluate(() => EXAM_SKILL_LIST.map((s) => (typeof s === 'string' ? s : s.name)));
	} finally {
		await browser.close();
	}
}

/** 読み替えを足したとき、別々の名前が同じ文字列に潰れないか。 */
function collisions(names, extra) {
	const before = new Map();
	const after = new Map();
	names.forEach((n) => {
		const b = common.normalizeText(n);
		const a = normalizeWithExtraMap(n, extra);
		if (!before.has(b)) before.set(b, []);
		before.get(b).push(n);
		if (!after.has(a)) after.set(a, []);
		after.get(a).push(n);
	});
	const newOnes = [];
	for (const [key, list] of after) {
		if (list.length < 2) continue;
		const uniq = [...new Set(list)];
		if (uniq.length < 2) continue;
		// 読み替えを足す前から潰れていたものは「新たに生まれた衝突」ではない
		const wasAlready = uniq.every((n) => {
			const b = common.normalizeText(n);
			return (before.get(b) || []).length > 1;
		});
		if (!wasAlready) newOnes.push({ normalized: key, names: uniq });
	}
	return newOnes;
}

/** 保存済みのOCR結果を、読み替えを足した正規化で照合し直す。 */
function replayReports(extra) {
	const reportsDir = path.join(assetsRoot(), 'reports');
	if (!fsSync.existsSync(reportsDir)) return null;
	const master = loadMaster();
	const base = buildMatcher(master);
	const withExtra = buildMatcher(master, extra);
	const files = fsSync.readdirSync(reportsDir).filter((f) => /^ocr-.+\.json$/.test(f));
	const truthCache = new Map();
	const diff = { rows: 0,改善: 0, 悪化: 0, 変化なし: 0, 誤りが増えた: [], 新たに一致: [] };
	for (const f of files) {
		const rep = JSON.parse(fsSync.readFileSync(path.join(reportsDir, f), 'utf-8'));
		if (!truthCache.has(rep.set)) {
			const tf = path.join(assetsRoot(), 'truth', `${rep.set}.json`);
			truthCache.set(rep.set, fsSync.existsSync(tf) ? JSON.parse(fsSync.readFileSync(tf, 'utf-8')) : null);
		}
		const truth = truthCache.get(rep.set);
		const nameById = truth ? new Map(truth.cards.map((c) => [c.id, c.skillName])) : new Map();
		const idById = truth ? new Map(truth.cards.map((c) => [c.id, c.skillId])) : new Map();
		rep.rows.forEach((row) => {
			const reads = (row.texts || [row.text]).map((t) => ({ text: t, confidence: 0 }));
			const a = combineReads(reads, base).chosen;
			const b = combineReads(reads, withExtra).chosen;
			diff.rows++;
			const truthId = idById.get(row.id) || null;
			const truthName = nameById.get(row.id) || null;
			const aOk = isAutoAccepted(a.category) && a.skill && a.skill.id === truthId;
			const bOk = isAutoAccepted(b.category) && b.skill && b.skill.id === truthId;
			const aWrong = isAutoAccepted(a.category) && (!a.skill || a.skill.id !== truthId);
			const bWrong = isAutoAccepted(b.category) && (!b.skill || b.skill.id !== truthId);
			if (!aOk && bOk) {
				diff.改善++;
				if (diff.新たに一致.length < 12) diff.新たに一致.push({ file: f, id: row.id, truth: truthName, text: row.text });
			} else if (aOk && !bOk) {
				diff.悪化++;
			} else {
				diff.変化なし++;
			}
			if (!aWrong && bWrong) {
				diff.誤りが増えた.push({ file: f, id: row.id, truth: truthName, matched: b.skill ? b.skill.name : null, text: row.text });
			}
		});
	}
	return diff;
}

function parseMap(arg) {
	const out = {};
	(arg || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.forEach((pair) => {
			const [from, to] = pair.split('=').map((s) => s.trim());
			if (from && to && [...from].length === 1 && [...to].length === 1) out[from] = to;
			else console.log(`※ 1文字＝1文字の形でないので飛ばします: ${pair}`);
		});
	return out;
}

function candidatesFromReport(min) {
	const reportsDir = path.join(assetsRoot(), 'reports');
	const files = fsSync.readdirSync(reportsDir).filter((f) => /^confusions-.+\.json$/.test(f));
	if (!files.length) throw new Error('reports/confusions-*.json がありません（先に tally-confusions.mjs）');
	const merged = new Map();
	files.forEach((f) => {
		const rep = JSON.parse(fsSync.readFileSync(path.join(reportsDir, f), 'utf-8'));
		rep.substitutions.forEach((s) => {
			const k = `${s.from}=${s.to}`;
			merged.set(k, Math.max(merged.get(k) || 0, s.count));
		});
	});
	return [...merged.entries()]
		.filter(([, n]) => n >= min)
		.sort((a, b) => b[1] - a[1])
		.map(([k, n]) => ({ from: k.split('=')[0], to: k.split('=')[1], count: n }));
}

async function main() {
	const min = Number(argValue('min', '5'));
	const useReport = process.argv.includes('--from-report');
	const combined = process.argv.includes('--combined');
	const candidates = useReport
		? candidatesFromReport(min)
		: Object.entries(parseMap(argValue('map', ''))).map(([from, to]) => ({ from, to, count: null }));
	if (!candidates.length) {
		console.error('候補がありません。--map=誤=正,... か --from-report を指定してください');
		process.exit(1);
	}

	const masterNames = loadMaster().map((s) => s.name);
	let examNames = [];
	try {
		examNames = await examSkillNames();
	} catch (e) {
		console.log(`※ exam.html の133種を読めませんでした（${e.message}）。マスターだけで検査します`);
	}
	console.log(`候補 ${candidates.length}件 / マスター ${masterNames.length}種 / exam ${examNames.length}種\n`);

	const results = [];
	for (const c of candidates) {
		const extra = { [c.from]: c.to };
		const already = common.CHAR_CONFUSION_MAP[c.from];
		const colMaster = collisions(masterNames, extra);
		const colExam = examNames.length ? collisions(examNames, extra) : [];
		const replay = replayReports(extra);
		const verdict =
			already && already !== c.to
				? `見送り（既に ${c.from}→${already}）`
				: already === c.to
					? '既にある'
					: colMaster.length || colExam.length
						? '見送り（衝突あり）'
						: replay && replay.誤りが増えた.length
							? '見送り（誤りが増える）'
							: replay && replay.改善 > 0 && replay.悪化 === 0
								? '採用してよさそう'
								: replay && replay.悪化 > 0
									? '要検討（一部が悪化）'
									: '効果なし';
		console.log(
			`${c.from} → ${c.to}` +
				(c.count != null ? `（${c.count}回）` : '') +
				`  衝突: マスター ${colMaster.length} / exam ${colExam.length}` +
				(replay ? `  手元の再照合: 改善 ${replay.改善} / 悪化 ${replay.悪化} / 誤りが増えた ${replay.誤りが増えた.length}` : '') +
				`  → ${verdict}`
		);
		if (colMaster.length) {
			colMaster.slice(0, 3).forEach((x) => console.log(`    衝突(マスター): ${x.names.join(' ／ ')}`));
		}
		if (colExam.length) {
			colExam.slice(0, 3).forEach((x) => console.log(`    衝突(exam): ${x.names.join(' ／ ')}`));
		}
		results.push({ ...c, already: already || null, collisionsMaster: colMaster, collisionsExam: colExam, replay, verdict });
	}

	if (combined) {
		const extra = {};
		results.filter((r) => r.verdict === '採用してよさそう').forEach((r) => { extra[r.from] = r.to; });
		if (Object.keys(extra).length) {
			console.log(`\n■ 採用候補をまとめて足した場合（${Object.keys(extra).length}件）`);
			const colMaster = collisions(masterNames, extra);
			const colExam = examNames.length ? collisions(examNames, extra) : [];
			const replay = replayReports(extra);
			console.log(`  衝突: マスター ${colMaster.length} / exam ${colExam.length}`);
			console.log(`  手元の再照合: 改善 ${replay.改善} / 悪化 ${replay.悪化} / 誤りが増えた ${replay.誤りが増えた.length}`);
			colMaster.forEach((x) => console.log(`    衝突(マスター): ${x.names.join(' ／ ')}`));
			colExam.forEach((x) => console.log(`    衝突(exam): ${x.names.join(' ／ ')}`));
			results.push({ combined: true, map: extra, collisionsMaster: colMaster, collisionsExam: colExam, replay });
		} else {
			console.log('\n■ まとめて足せる候補はありませんでした');
		}
	}

	const outFile = path.join(assetsDir('reports'), 'confusion-candidates-check.json');
	await fs.writeFile(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), min, results }, null, '\t'), 'utf-8');
	console.log(`\n→ ${relToAssets(outFile)}`);
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
