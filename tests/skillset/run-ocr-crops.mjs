// 切り出したカード画像をOCRし、マスター445種に照合して5分類に振り分ける。
//
//   node tests/skillset/run-ocr-crops.mjs --set=2026-09-11a
//   node tests/skillset/run-ocr-crops.mjs --set=2026-09-11a --conditions=sharp,fit56
//   node tests/skillset/run-ocr-crops.mjs --set=2026-09-12a --kind=frames --conditions=sharp
//   node tests/skillset/run-ocr-crops.mjs --set=... --psm=6      … 既定は 7（1行として読む）
//
// 正解（truth/<セット>.json）があれば、分類ごとの正誤も出す。
// 無ければ「正解の案」を作るための素材として結果だけを残す。
// 出力: reports/ocr-<セット>-<条件>.json

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetsRoot, assetsDir, listFiles, relToAssets } from './lib/assets.mjs';
import { openOcr, DEFAULT_PSM } from './lib/ocr.mjs';
import { fileToDataUrl } from './lib/browser.mjs';
import { loadMaster } from './lib/common-in-node.mjs';
import { buildMatcher, isAutoAccepted, CATEGORY_LABELS } from './lib/match.mjs';
import { resolveConditions } from './lib/conditions.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

export function loadTruth(setName) {
	const file = path.join(assetsRoot(), 'truth', `${setName}.json`);
	if (!fsSync.existsSync(file)) return null;
	const json = JSON.parse(fsSync.readFileSync(file, 'utf-8'));
	const byCrop = new Map();
	(json.cards || []).forEach((c) => byCrop.set(c.id, c));
	return { file, json, byCrop };
}

const RANK = { exact: 0, viaMap: 1, ambiguous: 2, unreadable: 3 };

/**
 * 1枚のカードについて、前処理の変種ごとに出たOCRの読みを1つの判定にまとめる。
 * 製品の matchAllSkills() も全変種の行をまとめて照合するので、それに合わせる。
 * 変種どうしが別々のスキルに一意一致したときは「確定させない」＝確認行きにする。
 */
export function combineReads(reads, matcher) {
	const classified = reads.map((r) => ({ read: r, cls: matcher.classify(r.text) }));
	const decided = classified.filter((c) => c.cls.skill);
	const ids = new Set(decided.map((c) => c.cls.skill.id));
	if (ids.size > 1) {
		return {
			chosen: {
				category: 'ambiguous',
				reason: '前処理の変種ごとに別のスキルへ一意一致した',
				candidates: decided.map((c) => ({ id: c.cls.skill.id, name: c.cls.skill.name, distance: 0 })),
				distance: 0,
				skill: null,
				text: decided[0].read.text,
				normStrict: decided[0].cls.normStrict,
				normFull: decided[0].cls.normFull
			},
			read: decided[0].read,
			classified
		};
	}
	classified.sort((a, b) => {
		const r = RANK[a.cls.category] - RANK[b.cls.category];
		if (r !== 0) return r;
		const da = a.cls.distance == null ? 99 : a.cls.distance;
		const db = b.cls.distance == null ? 99 : b.cls.distance;
		if (da !== db) return da - db;
		return (b.read.confidence || 0) - (a.read.confidence || 0);
	});
	return { chosen: classified[0].cls, read: classified[0].read, classified };
}

export async function ocrCondition(ocr, cropFiles, condition, matcher, truth) {
	const rows = [];
	for (const file of cropFiles) {
		const id = path.basename(file, '.png');
		const dataUrl = await fileToDataUrl(file);
		const res = await ocr.prepareAndRecognize(dataUrl, {
			scale: condition.scale == null ? 1 : condition.scale,
			quality: condition.quality,
			productLike: !!condition.productLike
		});
		const { chosen, read } = combineReads(res.reads, matcher);
		const t = truth ? truth.byCrop.get(id) : null;
		rows.push({
			id,
			text: chosen.text != null ? chosen.text : read.text,
			texts: res.reads.map((r) => r.text),
			confidence: read.confidence,
			inkHeight: res.ink,
			category: chosen.category,
			reason: chosen.reason,
			normStrict: chosen.normStrict,
			normFull: chosen.normFull,
			matchedId: chosen.skill ? chosen.skill.id : null,
			matchedName: chosen.skill ? chosen.skill.name : null,
			topCandidate: chosen.topCandidate || null,
			distance: chosen.distance,
			candidates: chosen.candidates,
			truthId: t ? t.skillId : null,
			truthName: t ? t.skillName : null,
			truthInMaster: t ? !!t.inMaster : null,
			correct: t ? (chosen.skill ? chosen.skill.id === t.skillId : null) : null
		});
	}
	return rows;
}

export function summarize(rows) {
	const s = { total: rows.length, exact: 0, viaMap: 0, ambiguous: 0, unreadable: 0, autoAcceptedWrong: 0, autoAcceptedRight: 0, ambiguousTopWrong: 0, checked: 0, truthInMaster: 0, truthOutsideMaster: 0 };
	rows.forEach((r) => {
		s[r.category]++;
		if (r.truthName) {
			s.checked++;
			if (r.truthInMaster) s.truthInMaster++; else s.truthOutsideMaster++;
			// 正解がマスターに無いカードは「どのスキルにも一致しない」が正しい。
			// そこで一意に一致してしまうのは、確認を経ずに誤ったスキルが入る最も危険な形。
			if (isAutoAccepted(r.category)) {
				if (r.matchedId === r.truthId && r.truthId != null) s.autoAcceptedRight++;
				else s.autoAcceptedWrong++;
			}
			if (r.category === 'ambiguous' && r.topCandidate && r.topCandidate.id !== r.truthId) s.ambiguousTopWrong++;
		}
	});
	return s;
}

export function formatSummary(s) {
	const pct = (n) => (s.total ? ((n / s.total) * 100).toFixed(1) : '0.0');
	let line =
		`  完全一致 ${s.exact}（${pct(s.exact)}%） / マップ経由 ${s.viaMap} / ` +
		`曖昧 ${s.ambiguous} / 読めない ${s.unreadable}`;
	if (s.checked) {
		line +=
			`\n  正解照合 ${s.checked}件（うちマスターにある ${s.truthInMaster} / 無い ${s.truthOutsideMaster}）: ` +
			`確認なしで正しく入る ${s.autoAcceptedRight} / **一意に一致したが誤り ${s.autoAcceptedWrong}**`;
	}
	return line;
}

async function main() {
	const setName = argValue('set', '2026-09-11a');
	const kind = argValue('kind', 'images');
	const psm = argValue('psm', DEFAULT_PSM);
	const conditions = resolveConditions(argValue('conditions', null));
	const cropFiles = listFiles(path.join(assetsRoot(), 'crops', setName), ['.png']).filter(
		(f) => !f.endsWith('-badge.png')
	);
	if (!cropFiles.length) {
		console.error(`切り出し画像がありません（crops/${setName}）。先に run-extract-cards.mjs を実行してください`);
		process.exit(1);
	}
	const master = loadMaster();
	const matcher = buildMatcher(master);
	const truth = loadTruth(setName);
	console.log(`セット ${setName}（${kind}）  切り出し ${cropFiles.length}枚  マスター ${master.length}種  psm=${psm}`);
	console.log(truth ? `正解あり（${relToAssets(truth.file)}）` : '正解なし（結果は正解の案づくりに使う）');

	const ocr = await openOcr({ psm });
	const reportsDir = assetsDir('reports');
	try {
		for (const condition of conditions) {
			process.stdout.write(`\n[${condition.name}] ${condition.label}\n`);
			const t0 = Date.now();
			const rows = await ocrCondition(ocr, cropFiles, condition, matcher, truth);
			const s = summarize(rows);
			console.log(formatSummary(s));
			console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}秒)`);
			const out = {
				set: setName,
				kind,
				condition: condition.name,
				conditionLabel: condition.label,
				psm,
				generatedAt: new Date().toISOString(),
				summary: s,
				rows
			};
			await fs.writeFile(
				path.join(reportsDir, `ocr-${setName}-${condition.name}.json`),
				JSON.stringify(out, null, '\t'),
				'utf-8'
			);
		}
	} finally {
		await ocr.close();
	}
	console.log(`\n→ ${relToAssets(reportsDir)}/ocr-${setName}-*.json`);
	console.log(`分類の意味: ${Object.entries(CATEGORY_LABELS).map(([k, v]) => `${k}=${v}`).join(' / ')}`);
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch((e) => {
		console.error(e.stack || e.message || e);
		process.exit(1);
	});
}
