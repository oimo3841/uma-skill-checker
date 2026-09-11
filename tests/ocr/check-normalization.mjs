// 文字正規化（js/common.js の CHAR_CONFUSION_MAP / HOMOGLYPH_MAP）の安全確認と、
// exam.html の組み込み133種（ID と名前の組）がマスターと食い違っていないかの見張り。
//
// 1. 正規化の安全確認
//   これらのマップは normalizeText() を通じて「OCRの読み取り結果」だけでなく
//   「スキル名そのもの」にも適用される。そのため、誤読対策のつもりで足した1文字が
//   別々のスキル名を同じ文字列に潰してしまうと、恒久的な誤検出になる。
//   CHAR_CONFUSION_MAP に追記したとき、およびスキルマスタ(uma-skill-deck-skills.json)を
//   更新したときは必ずこれを走らせること。common.js の各エントリのコメントにある
//   「マスタ更新時に再確認すること」を自動化したもの。
//
// 2. exam.html の組み込み133種の整合（2026-09-11・第2段階 手順1で追加）
//   exam.html は各スキルを { id: マスターID, name: exam の表示名 } で持つ。名前を
//   マスターから引かずに exam 内へ残しているため（表記を変えないため・単体で動くため）、
//   「exam の名前」と「マスターの名前」の二重持ちになる。ここでは
//     - 133件すべての id がマスターに存在し、normalizeText(exam の名前) === normalizeText(マスターの名前)
//     - sp70緑 17・緑59 59・実質53 の件数、sp70緑 ⊂ 緑59 ⊂ 133
//     - 目覚めペア6組の ID がマスター 440〜445 と対応元（1, 2, 17〜20）に一致
//   を見る。exam の名前とマスターが食い違ったら落ちる。
//
// 使い方:
//   npm run test:norm
//
// 衝突・食い違いが1件でもあれば exit 1。

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const master = JSON.parse(await fs.readFile(path.join(ROOT, 'uma-skill-deck-skills.json'), 'utf-8'));
const deckSkills = (master.skills || master).map((s) => ({ id: String(s.id), name: s.name }));
const deckNames = deckSkills.map((s) => s.name);

/** 目覚めペアの期待値（マスターID）。目覚め → 対応元 */
const EXPECTED_AWAKENING_PAIRS = {
	'441': '1',  // 右回りの目覚め → 右回り○
	'440': '2',  // 左回りの目覚め → 左回り○
	'442': '17', // 春の目覚め → 春ウマ娘○
	'443': '18', // 夏の目覚め → 夏ウマ娘○
	'444': '19', // 秋の目覚め → 秋ウマ娘○
	'445': '20', // 冬の目覚め → 冬ウマ娘○
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(ROOT, 'exam.html')).href, { waitUntil: 'load' });

const report = await page.evaluate(({ deckSkills, deckNames }) => {
	function collisionsIn(names) {
		const byNorm = {};
		names.forEach((n) => {
			const k = normalizeText(n);
			(byNorm[k] = byNorm[k] || []).push(n);
		});
		return Object.keys(byNorm)
			.filter((k) => new Set(byNorm[k]).size > 1)
			.map((k) => ({ norm: k, names: Array.from(new Set(byNorm[k])) }));
	}

	// スキル名の中に実際に現れるマップのキー = 「スキル名側も書き換わる」危険なエントリ。
	function riskyKeys(names) {
		const joined = names.join('');
		const hits = [];
		[['CHAR_CONFUSION_MAP', CHAR_CONFUSION_MAP], ['HOMOGLYPH_MAP', HOMOGLYPH_MAP]].forEach(([label, map]) => {
			Object.keys(map).forEach((k) => {
				if (joined.indexOf(k) !== -1) hits.push({ map: label, from: k, to: map[k] });
			});
		});
		return hits;
	}

	const examNames = EXAM_SKILL_LIST.map((s) => s.name);
	const masterById = {};
	deckSkills.forEach((s) => { masterById[s.id] = s.name; });

	// ID と名前の組がマスターと合っているか
	const idProblems = [];
	EXAM_SKILL_LIST.forEach((s, i) => {
		const m = masterById[s.id];
		if (m === undefined) idProblems.push({ index: i + 1, id: s.id, name: s.name, problem: 'マスターに無いID' });
		else if (normalizeText(m) !== normalizeText(s.name)) idProblems.push({ index: i + 1, id: s.id, name: s.name, master: m, problem: '正規化後の名前が不一致' });
	});
	const examIds = EXAM_SKILL_LIST.map((s) => s.id);
	const examIdSet = new Set(examIds);
	const green = new Set(GREEN_59_IDS);
	const equivalence = new Set(GREEN_59_IDS.map((id) => AWAKENING_PAIR_MAP[id] || id));

	return {
		version: COMMON_JS_VERSION,
		deck: { size: deckNames.length, collisions: collisionsIn(deckNames), risky: riskyKeys(deckNames) },
		exam: { size: examNames.length, collisions: collisionsIn(examNames), risky: riskyKeys(examNames) },
		ids: {
			size: EXAM_SKILL_LIST.length,
			uniqueIds: new Set(examIds).size,
			uniqueNames: new Set(examNames).size,
			problems: idProblems,
			// examSkillId() は normalizeText 後で引くので、マスター表記からも同じIDに着くこと
			lookupViaMasterName: EXAM_SKILL_LIST.filter((s) => examSkillId(masterById[s.id] || '') !== s.id).map((s) => s.id),
			sp70: SP70_GREEN_17_IDS.length,
			green59: GREEN_59_IDS.length,
			green59Unique: green.size,
			equivalenceMax: GREEN_59_EQUIVALENCE_MAX,
			equivalenceMaxRecomputed: equivalence.size,
			sp70NotInGreen: SP70_GREEN_17_IDS.filter((id) => !green.has(id)),
			greenNotInExam: GREEN_59_IDS.filter((id) => !examIdSet.has(id)),
			pairs: Object.assign({}, AWAKENING_PAIR_MAP),
		},
	};
}, { deckSkills, deckNames });

await browser.close();

console.log(`common.js 版: ${report.version}\n`);

let failed = 0;
for (const [label, r] of [
	['uma-skill-deck-skills.json', report.deck],
	['exam.html EXAM_SKILL_LIST', report.exam],
]) {
	console.log(`■ ${label} (${r.size}件)`);
	if (r.collisions.length === 0) {
		console.log('  ✓ 正規化後の衝突なし');
	} else {
		failed += r.collisions.length;
		console.log(`  ✗ 正規化後に同一文字列になるスキルが ${r.collisions.length} 組あります:`);
		for (const c of r.collisions) console.log(`    "${c.norm}" ← ${c.names.join(' / ')}`);
	}
	console.log(`  スキル名側も書き換わるマップのキー: ${r.risky.length}件`);
	for (const k of r.risky) console.log(`    ${k.map}: ${k.from} → ${k.to}`);
	console.log('');
}

function check(cond, label, detail) {
	if (!cond) failed++;
	console.log('  ' + (cond ? '✓ ' : '✗ ') + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
const ids = report.ids;
console.log('■ exam.html の組み込み133種（ID と名前の組）とマスターの整合');
check(ids.size === 133 && ids.uniqueIds === 133 && ids.uniqueNames === 133,
	'133件・ID と名前に重複なし', { size: ids.size, uniqueIds: ids.uniqueIds, uniqueNames: ids.uniqueNames });
check(ids.problems.length === 0, '133件すべての id がマスターにあり、normalizeText 後の名前が一致', ids.problems);
check(ids.lookupViaMasterName.length === 0, 'マスター表記の名前からも examSkillId() で同じ id に着く', ids.lookupViaMasterName);
check(ids.sp70 === 17, 'sp70緑は17件', ids.sp70);
check(ids.green59 === 59 && ids.green59Unique === 59, '緑59種は59件（重複なし）', { green59: ids.green59, unique: ids.green59Unique });
check(ids.equivalenceMax === 53 && ids.equivalenceMaxRecomputed === 53, '緑59種の実質は53種', { page: ids.equivalenceMax, recomputed: ids.equivalenceMaxRecomputed });
check(ids.sp70NotInGreen.length === 0, 'sp70緑 ⊂ 緑59種', ids.sp70NotInGreen);
check(ids.greenNotInExam.length === 0, '緑59種 ⊂ 133種', ids.greenNotInExam);
const pairKeys = Object.keys(ids.pairs).sort();
const pairOk = pairKeys.length === 6 && pairKeys.every((k) => ids.pairs[k] === EXPECTED_AWAKENING_PAIRS[k]);
check(pairOk, '目覚めペア6組の ID がマスター 440〜445 と対応元（1, 2, 17〜20）に一致', ids.pairs);
const pairNames = {};
for (const [a, b] of Object.entries(ids.pairs)) pairNames[deckSkills.find((s) => s.id === a)?.name] = deckSkills.find((s) => s.id === b)?.name;
console.log('    ' + Object.entries(pairNames).map(([a, b]) => `${a} → ${b}`).join(' / '));
console.log('');

if (failed > 0) {
	console.log('CHAR_CONFUSION_MAP の追記、スキルマスタの更新、または exam.html の組み込み133種で食い違いが発生しています。');
	process.exitCode = 1;
}
