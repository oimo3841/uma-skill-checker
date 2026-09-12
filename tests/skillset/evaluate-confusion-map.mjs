// 読み替え（CHAR_CONFUSION_MAP への追加案）を、採用の前後で同じ指標で測る。**採用ごとに回す。**
//
//   node tests/skillset/evaluate-confusion-map.mjs --sets=20260912_1-full,20260912_2-full,20260912_3-full --map=二=ー,ァ=ア
//   node tests/skillset/evaluate-confusion-map.mjs --sets=... --tier=1        … confusion-adoption-plan.json の第1段
//   node tests/skillset/evaluate-confusion-map.mjs --sets=... --tier=1+2      … 第1段＋第2段
//   node tests/skillset/evaluate-confusion-map.mjs --sets=... --map-file=<json>  … {"誤":"正",...}
//
// 出す指標（優先順）: 誤着地（1件でも増えたら却下）／完全一致率（exact と 確認なしで取り込める率）／確認に回る行。
// js/common.js は変更しない。読み替えは外から差し込んで照合し直す（lib/replay.mjs）。

import fsSync from 'node:fs';
import path from 'node:path';
import { assetsRoot } from './lib/assets.mjs';
import { common, loadMaster } from './lib/common-in-node.mjs';
import { loadCorpus, evaluate, diff, formatMetrics, expandExtra, rowMetricsWithOverlap } from './lib/replay.mjs';
import { collisions, examSkillNames } from './rank-confusion-candidates.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

function parseMap(arg) {
	const out = {};
	(arg || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((pair) => {
		const [from, to] = pair.split('=').map((s) => s.trim());
		if (from && to && [...from].length === 1 && [...to].length === 1) out[from] = to;
		else console.log(`※ 1文字＝1文字の形でないので飛ばします: ${pair}`);
	});
	return out;
}

function loadMap() {
	const tier = argValue('tier', null);
	if (tier) {
		const plan = JSON.parse(fsSync.readFileSync(path.join(assetsRoot(), 'reports', 'confusion-adoption-plan.json'), 'utf-8'));
		const map = {};
		tier.split('+').forEach((t) => Object.assign(map, plan.tiers[t.trim()] || {}));
		return { map, label: `計画の第${tier}段` };
	}
	const file = argValue('map-file', null);
	if (file) return { map: JSON.parse(fsSync.readFileSync(file, 'utf-8')), label: file };
	return { map: parseMap(argValue('map', '')), label: '--map' };
}

const OVERLAPS = [1, 2, 3];
function overlapLine(corpus, ev) {
	return OVERLAPS.map((k) => { const r = rowMetricsWithOverlap(corpus, ev, k); return `重なり${k}枚 ${r.check}／${r.rows}`; }).join('・');
}

async function main() {
	const sets = (argValue('sets', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
	if (!sets.length) throw new Error('--sets=<セット,...>（人の確認済みの正解を持つセット）を指定してください');
	// --baseline: 読み替えを足さず、いまの js/common.js のままの指標だけを出す
	// （CHAR_CONFUSION_MAP に足したあと、見積もりどおりになったかを実測で確かめるため）
	const baselineOnly = process.argv.includes('--baseline');
	const { map, label } = baselineOnly ? { map: {}, label: '（無し）' } : loadMap();
	if (!baselineOnly && !Object.keys(map).length) throw new Error('読み替えが空です（--map / --map-file / --tier / --baseline）');
	const corpus = loadCorpus(sets);
	console.log(`評価コーパス: ${corpus.sets.join(', ')} … カード ${corpus.cards.length}枚・行 ${corpus.rows.length}`);
	const masterNames = loadMaster().map((s) => s.name);
	let examNames = [];
	if (process.argv.includes('--exam')) {
		try { examNames = await examSkillNames(); } catch (e) { console.log(`※ exam.html の133種を読めませんでした（${String(e.message).split('\n')[0]}）`); }
	}
	const before = evaluate(corpus, {});
	if (baselineOnly) {
		console.log(`いまの common.js（${common.COMMON_JS_VERSION}・CHAR_CONFUSION_MAP ${Object.keys(common.CHAR_CONFUSION_MAP).length}件）での実測:`);
		console.log(`  ${formatMetrics(before)}`);
		console.log(`  ${overlapLine(corpus, before)}`);
		const cm = collisions(masterNames, {});
		console.log(`  衝突（いまのマップで潰れている別名の組）: マスター ${cm.length}${examNames.length ? ` / exam ${collisions(examNames, {}).length}` : ''}`);
		if (before.card.wrongs.length) before.card.wrongs.forEach((w) => console.log(`  ✗ 誤着地 ${w.set} ${w.id}: 正解 ${w.truth} → ${w.matched}  読み ${JSON.stringify(w.reads)}`));
		return;
	}
	console.log(`読み替え（${label}・${Object.keys(map).length}件）: ${Object.entries(map).map(([a, b]) => `${a}→${b}`).join(' ')}`);
	const expanded = expandExtra(map);
	console.log(`実際に足す項目（統一前の字に展開・${Object.keys(expanded).length}件）: ${Object.entries(expanded).map(([a, b]) => `${a}→${b}`).join(' ')}`);
	const col = collisions(masterNames, expanded);
	console.log(`衝突（マスター ${masterNames.length}）: ${col.length}件${col.length ? '  ' + col.map((x) => x.names.join('／')).join('、') : ''}`);
	let colExam = [];
	if (examNames.length) {
		colExam = collisions(examNames, expanded);
		console.log(`衝突（exam ${examNames.length}）: ${colExam.length}件${colExam.length ? '  ' + colExam.map((x) => x.names.join('／')).join('、') : ''}`);
	}
	const after = evaluate(corpus, map, before);
	const d = diff(before, after);
	console.log(`\n採用前: ${formatMetrics(before)}`);
	console.log(`        ${overlapLine(corpus, before)}`);
	console.log(`採用後: ${formatMetrics(after)}`);
	console.log(`        ${overlapLine(corpus, after)}`);
	console.log(`差分: 誤着地 ${d.autoWrongDelta >= 0 ? '+' : ''}${d.autoWrongDelta} / 完全一致(exact) ${d.exactDelta >= 0 ? '+' : ''}${d.exactDelta} / 確認なしで取り込める ${d.autoDelta >= 0 ? '+' : ''}${d.autoDelta} / 確認に回る行 ${d.checkDelta >= 0 ? '+' : ''}${d.checkDelta} / 行の誤確定 ${d.decidedWrongDelta >= 0 ? '+' : ''}${d.decidedWrongDelta}`);
	const newWrongs = after.card.wrongs.filter((w) => !before.card.wrongs.some((b) => b.set === w.set && b.id === w.id));
	if (newWrongs.length) {
		console.log('\n新たな誤着地:');
		newWrongs.forEach((w) => console.log(`  ✗ ${w.set} ${w.id}: 正解 ${w.truth} → ${w.matched}  読み ${JSON.stringify(w.reads)}`));
	}
	const verdict = d.autoWrongDelta > 0 || col.length || colExam.length ? '**却下**（誤着地が増える／衝突する）' : d.autoDelta > 0 ? '採用してよい（誤着地は増えない）' : '効果なし';
	console.log(`\n判定: ${verdict}`);
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
