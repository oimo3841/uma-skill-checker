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
// 3. 対象スキルの範囲（軸1）・シナリオ因子（軸2）・遺伝子（軸3）の整合
//   exam.html は 133種の足し引き（対象拡張の5種 EXPANDED_EXTRA_SKILL_LIST ／
//   絞り込みで外す12種 CURATED_EXCLUDED_IDS）と、シナリオ因子24種
//   （SCENARIO_INHERITANCE_FACTORS）・遺伝子10種（APTITUDE_GENES）を持つ。ここでは
//     - 足す5種の id がマスターにあり、normalizeText 後の名前が一致し、133種と重ならない
//     - 外す12種の id がすべて133種にあり、重複が無い
//     - シナリオ因子の写しが正本（data/scenario-inheritance-factors.json）と
//       1文字も違わない（並び・件数も同じ）
//     - 遺伝子の写しが正本（data/aptitude-genes.json）と 1文字も違わない（同上。段F）
//
// 4. 追加カタログ（data/）と uma-skill-deck-core.js の整合
//   正本の写しは exam.html（名前だけ）と core.js（id＋名前）の2か所にある。
//   3者がズレると、Deck 側で名前を解決できなくなったり、保存済みの比較シートが
//   行を見失ったりする。ここでは
//     - core の組み込みの写しが正本と 1文字も違わない（id・名前・並び・件数）
//     - id が一意で、マスターのID（1〜445）と衝突しない
//     - Deck 側で全件が findSkill() で引け、名前から同じ id へ解決する
//     - 「条件でスキルを検索」の母集団に入るのは、追加カタログのうちタグが付いたものだけ
//       （段1b で変わった。それまでは追加カタログを1件も入れていなかった）
//   を見る。Deck のページは http で開く（file:// だと JSON のフェッチが CORS で
//   落ちて組み込みの写しに落ち、正本との突き合わせにならないため）。
//     - シナリオ因子どうし・シナリオ因子とスキル名が、normalizeText 後に衝突しない
//     - 3つのモードの種数（133 / 138 / 121）
//   を見る。
//
// 使い方:
//   npm run test:norm
//
// 衝突・食い違いが1件でもあれば exit 1。

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../visual/lib/serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const master = JSON.parse(await fs.readFile(path.join(ROOT, 'uma-skill-deck-skills.json'), 'utf-8'));
const deckSkills = (master.skills || master).map((s) => ({ id: String(s.id), name: s.name }));
const deckNames = deckSkills.map((s) => s.name);

/** シナリオ因子の正本。exam.html が持つのはこの写し（file:// でも動かすため） */
const scenarioFile = path.join(ROOT, 'data', 'scenario-inheritance-factors.json');
const scenarioMaster = JSON.parse(await fs.readFile(scenarioFile, 'utf-8'));
const scenarioMasterEntries = scenarioMaster.entries || [];
const scenarioMasterNames = scenarioMasterEntries.map((f) => f.name);
const scenarioMasterIds = (scenarioMaster.entries || []).map((f) => f.id);

/** 遺伝子の正本。exam.html が持つのはこの写し（シナリオ因子とまったく同じ扱い。段F） */
const geneFile = path.join(ROOT, 'data', 'aptitude-genes.json');
const geneMaster = JSON.parse(await fs.readFile(geneFile, 'utf-8'));
const geneMasterNames = (geneMaster.entries || []).map((g) => g.name);

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

const report = await page.evaluate(({ deckSkills, deckNames, scenarioMasterNames, geneMasterNames }) => {
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
		scope: {
			// 対象拡張で足す5種
			extras: EXPANDED_EXTRA_SKILL_LIST.map((s) => ({ id: s.id, name: s.name })),
			extraProblems: EXPANDED_EXTRA_SKILL_LIST.map((s) => {
				const m = masterById[s.id];
				if (m === undefined) return { id: s.id, name: s.name, problem: 'マスターに無いID' };
				if (normalizeText(m) !== normalizeText(s.name)) return { id: s.id, name: s.name, master: m, problem: '正規化後の名前が不一致' };
				if (examIdSet.has(s.id)) return { id: s.id, name: s.name, problem: '既に133種にある' };
				return null;
			}).filter(Boolean),
			// 絞り込みで外す12種
			curatedSize: CURATED_EXCLUDED_IDS.length,
			curatedUnique: new Set(CURATED_EXCLUDED_IDS).size,
			curatedNotInExam: CURATED_EXCLUDED_IDS.filter((id) => !examIdSet.has(id)),
			curatedNames: CURATED_EXCLUDED_IDS.map((id) => EXAM_NAME_BY_ID[id] || null),
			// 3つのモードの種数（軸2 OFF の状態）
			counts: {
				default: scopeBaseNames('default').length,
				expanded: scopeBaseNames('expanded').length,
				curated: scopeBaseNames('curated').length,
			},
			// シナリオ因子（写し vs 正本）
			factorSize: SCENARIO_INHERITANCE_FACTORS.length,
			factorMismatch: (function () {
				const a = SCENARIO_INHERITANCE_FACTORS, b = scenarioMasterNames;
				if (a.length !== b.length) return [{ problem: '件数が違う', 写し: a.length, 正本: b.length }];
				return a.map((n, i) => (n === b[i] ? null : { index: i, 写し: n, 正本: b[i] })).filter(Boolean);
			})(),
			factorCollisions: collisionsIn(SCENARIO_INHERITANCE_FACTORS),
			// シナリオ因子とスキル名（133＋5）が正規化後にぶつかると、
			// どちらか一方が常にもう一方として検出されることになる
			factorVsSkill: (function () {
				const skillNorms = {};
				EXAM_SKILL_LIST.concat(EXPANDED_EXTRA_SKILL_LIST).forEach((s) => { skillNorms[normalizeText(s.name)] = s.name; });
				return SCENARIO_INHERITANCE_FACTORS
					.filter((n) => skillNorms[normalizeText(n)])
					.map((n) => ({ factor: n, skill: skillNorms[normalizeText(n)] }));
			})(),
			// シナリオ因子は白スキルのIDを持たない（sp70緑・緑59種の集計に混ざらない）
			factorWithSkillId: SCENARIO_INHERITANCE_FACTORS.filter((n) => examSkillId(n) !== null),

			// 遺伝子（軸3・段F）。シナリオ因子とまったく同じ4本を見る。
			geneSize: APTITUDE_GENES.length,
			geneMismatch: (function () {
				const a = APTITUDE_GENES, b = geneMasterNames;
				if (a.length !== b.length) return [{ problem: '件数が違う', 写し: a.length, 正本: b.length }];
				return a.map((n, i) => (n === b[i] ? null : { index: i, 写し: n, 正本: b[i] })).filter(Boolean);
			})(),
			geneCollisions: collisionsIn(APTITUDE_GENES),
			// 遺伝子とスキル名（133＋5）が正規化後にぶつかると、
			// どちらか一方が常にもう一方として検出されることになる
			geneVsSkill: (function () {
				const skillNorms = {};
				EXAM_SKILL_LIST.concat(EXPANDED_EXTRA_SKILL_LIST).forEach((s) => { skillNorms[normalizeText(s.name)] = s.name; });
				return APTITUDE_GENES
					.filter((n) => skillNorms[normalizeText(n)])
					.map((n) => ({ gene: n, skill: skillNorms[normalizeText(n)] }));
			})(),
			// 遺伝子は白スキルのIDを持たない（sp70緑・緑59種の集計に混ざらない）
			geneWithSkillId: APTITUDE_GENES.filter((n) => examSkillId(n) !== null),
			// 遺伝子とシナリオ因子が正規化後にぶつからないこと（別カテゴリなので混ざってはいけない）
			geneVsFactor: APTITUDE_GENES.filter((n) => SCENARIO_FACTOR_NORM_SET.has(normalizeText(n))),
		},
	};
}, { deckSkills, deckNames, scenarioMasterNames, geneMasterNames });

/* --- 追加カタログ（Deck 側）。core.js を読むページを http で開いて見る --- */
const server = await startServer(0);
const deckPage = await browser.newPage();
deckPage.on('pageerror', (e) => console.error('[pageerror:deck]', e.message));
await deckPage.goto(server.base + '/uma-skill-deck.html', { waitUntil: 'load' });
await deckPage.waitForFunction(() => window.UmaSkillDeckCore
	&& UmaSkillDeckCore.getMasterSkills().length > 0
	&& UmaSkillDeckCore.getExtraCatalog().length > 0, null, { timeout: 15000 });

/* 追加カタログは1カテゴリとは限らないので、**カテゴリの顔ぶれは core から受け取り**、
   正本はそれぞれのファイルから読む（カテゴリ名もファイル名もここには書かない）。 */
const catalogSources = await deckPage.evaluate(() => window.UmaSkillDeckCore.getExtraCatalogSources());
const catalogWant = {};
for (const src of catalogSources) {
	const json = JSON.parse(await fs.readFile(path.join(ROOT, src.path), 'utf-8'));
	catalogWant[src.category] = json.entries || [];
}

const catalogReport = await deckPage.evaluate(({ masterIds, wantByCategory }) => {
	const C = window.UmaSkillDeckCore;
	const cat = C.getExtraCatalog();
	const masterIdSet = new Set(masterIds);
	const wantTotal = Object.keys(wantByCategory).reduce((n, k) => n + wantByCategory[k].length, 0);
	return {
		meta: C.getExtraCatalogMeta(),
		sources: C.getExtraCatalogSources(),
		size: cat.length,
		wantTotal: wantTotal,
		uniqueIds: new Set(cat.map((e) => e.id)).size,
		categories: Array.from(new Set(cat.map((e) => e.category))),
		// 読み込んだ中身が正本と一致するか（id・名前・並び）。カテゴリごとに突き合わせる。
		mismatch: (function () {
			const out = [];
			Object.keys(wantByCategory).forEach((category) => {
				const want = wantByCategory[category];
				const got = cat.filter((e) => e.category === category);
				if (got.length !== want.length) {
					out.push({ category: category, problem: '件数が違う', core: got.length, 正本: want.length });
					return;
				}
				got.forEach((e, i) => {
					if (e.id !== want[i].id || e.name !== want[i].name) {
						out.push({ category: category, index: i, core: e.id + '/' + e.name, 正本: want[i].id + '/' + want[i].name });
					}
				});
			});
			return out;
		})(),
		collidesWithMaster: cat.filter((e) => masterIdSet.has(e.id)).map((e) => e.id),
		// 全件が findSkill() で引け、kind にカテゴリが付く
		findProblems: cat.filter((e) => {
			const sk = C.findSkill(e.id);
			return !sk || sk.name !== e.name || sk.kind !== e.category;
		}).map((e) => e.id),
		// 名前 → 同じ id へ解決する（OCRツールから渡ってきた名前が当たるか）
		resolveProblems: cat.filter((e) => {
			const row = C.matchPastedSkillText(e.name).rows[0];
			return !row || row.kind !== 'exact' || row.matchedId !== e.id;
		}).map((e) => e.name),
		// 「条件でスキルを検索」の母集団に入るのは**タグが付いたものだけ**（段1b）。
		// タグを持たないものを入れると、matchesFilters() で空配列を「万能」と読む軸
		// （70セッション目・段5 のあとは 距離・脚質・効果タイプ の3軸）では
		// どの条件にも当たる扱いになり、その3軸で絞るかぎり一覧に居座る。
		// 対象は「タグ未設定の拡張スキル（tagsPending）」と「そもそもタグを持たない
		// カテゴリ（シナリオ因子）」の2種類だが、どちらも tags の有無だけで判定できるので、
		// **このテストにもカテゴリ名を書かない**（恒久ルール1）。
		// 両方向を見る ―― タグ付きが入っていない場合も、タグ無しが入っている場合も落とす。
		pickerPoolProblems: (function () {
			C.openSkillPicker([], () => {});
			const ids = new Set(Array.from(document.querySelectorAll('[data-usd-el="skill-check"]')).map((el) => el.value));
			C.closeSkillPicker();
			return cat.filter((e) => !!e.tags !== ids.has(e.id))
				.map((e) => e.id + (e.tags ? '（タグ付きなのに母集団に無い）' : '（タグが無いのに母集団に居る）'));
		})(),
		// 内訳（情報。検査には使わない）。タグ付けの進み具合がここに出る。
		pickerPoolCounts: (function () {
			const tagged = cat.filter((e) => !!e.tags).length;
			return { カタログ: cat.length, タグ付き: tagged, タグ無し: cat.length - tagged };
		})(),
	};
}, { masterIds: deckSkills.map((s) => s.id), wantByCategory: catalogWant });

/* core の組み込みの写し（フェッチできない環境で使う最後の砦）も、正本と突き合わせる。
   上の検査は http で読めた中身を見るので、写しがズレていても気づけない。 */
const coreSrc = await fs.readFile(path.join(ROOT, 'js/uma-skill-deck-core.js'), 'utf-8');
const embeddedBlock = /const EMBEDDED_EXTRA_CATALOG = \{([\s\S]*?)\n\t\};/.exec(coreSrc);
/** カテゴリごとの組み込みの写し。写しを持たないカテゴリはキーごと現れない。 */
const embeddedByCategory = {};
if (embeddedBlock) {
	for (const m of embeddedBlock[1].matchAll(/(\w+)\s*:\s*\[([\s\S]*?)\n\t\t\]/g)) {
		embeddedByCategory[m[1]] = [...m[2].matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*(?:'([^']*)'|"([^"]*)")\s*\}/g)]
			.map((x) => ({ id: x[1], name: x[2] !== undefined ? x[2] : x[3] }));
	}
}
/**
 * 組み込みの写しを**あえて持たない**カテゴリ。
 * 拡張スキルは件数が多く、写しを core.js に入れるとファイルが大きく膨らむので持たない（C-48 の7節）。
 * 代わりに、1件も読めなかったときは黙って進まずに知らせる（C-49）。
 * ここに無いカテゴリで写しが欠けていれば落とす ―― 新しいカテゴリを足した人に
 * 「写しを持たせるかどうか」を必ず1度考えさせるため。
 */
const CATEGORIES_WITHOUT_EMBEDDED_COPY = ['extendedSkill'];

await browser.close();
await server.close();

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

const scope = report.scope;
console.log('■ 対象スキルの範囲（軸1）と シナリオ因子（軸2）と 遺伝子（軸3）');
check(scope.extras.length === 5 && scope.extraProblems.length === 0,
	'対象拡張で足す5種が、マスターにあり・名前が一致し・133種と重ならない', scope.extraProblems);
console.log('    足す5種: ' + scope.extras.map((s) => `${s.name}(${s.id})`).join(' / '));
check(scope.curatedSize === 12 && scope.curatedUnique === 12,
	'絞り込みで外すのは12種（重複なし）', { size: scope.curatedSize, unique: scope.curatedUnique });
check(scope.curatedNotInExam.length === 0, '外す12種がすべて133種にある', scope.curatedNotInExam);
console.log('    外す12種: ' + scope.curatedNames.join(' / '));
check(scope.counts.default === 133 && scope.counts.expanded === 138 && scope.counts.curated === 121,
	'3つのモードの種数が 133 / 138 / 121', scope.counts);
check(scope.factorMismatch.length === 0,
	'exam.html のシナリオ因子が正本（data/scenario-inheritance-factors.json）と一致', scope.factorMismatch);
console.log(`    シナリオ因子: ${scope.factorSize}種`);
check(scope.factorCollisions.length === 0, 'シナリオ因子どうしが正規化後に衝突しない', scope.factorCollisions);
check(scope.factorVsSkill.length === 0, 'シナリオ因子とスキル名（133＋5）が正規化後に衝突しない', scope.factorVsSkill);
check(scope.factorWithSkillId.length === 0, 'シナリオ因子は白スキルのIDを持たない', scope.factorWithSkillId);
// 遺伝子（軸3・段F）。exam.html は core を読まないので写しを持つ ―― 正本とのズレはここで捕まえる。
check(scope.geneMismatch.length === 0,
	'exam.html の遺伝子が正本（data/aptitude-genes.json）と一致', scope.geneMismatch);
console.log(`    遺伝子: ${scope.geneSize}種`);
check(scope.geneCollisions.length === 0, '遺伝子どうしが正規化後に衝突しない', scope.geneCollisions);
check(scope.geneVsSkill.length === 0, '遺伝子とスキル名（133＋5）が正規化後に衝突しない', scope.geneVsSkill);
check(scope.geneWithSkillId.length === 0, '遺伝子は白スキルのIDを持たない', scope.geneWithSkillId);
check(scope.geneVsFactor.length === 0, '遺伝子とシナリオ因子が正規化後に衝突しない', scope.geneVsFactor);
console.log('');

console.log('■ 追加カタログ（data/）と uma-skill-deck-core.js の整合');
console.log('    取得元: ' + catalogReport.sources.map((x) => `${x.category} ← ${x.path}`).join(' / '));
console.log('    読み込み: ' + catalogReport.meta.sources
	.map((x) => `${x.category} ${x.count}件（${x.from}${x.version ? '・' + x.version : ''}）`).join(' / '));
check(catalogReport.meta.sources.every((x) => x.from === '取得'),
	'正本のJSONを取得できている（キャッシュ・組み込みへ落ちていない）', catalogReport.meta.sources.map((x) => x.from));
check(catalogReport.size === catalogReport.wantTotal && catalogReport.uniqueIds === catalogReport.size,
	`Deck が読み込んだカタログは${catalogReport.wantTotal}件・id に重複なし`,
	{ size: catalogReport.size, uniqueIds: catalogReport.uniqueIds });
check(catalogReport.mismatch.length === 0, 'Deck が読み込んだ中身が正本と一致（id・名前・並び）', catalogReport.mismatch);
check(catalogReport.collidesWithMaster.length === 0,
	'カタログの id がマスターのID（1〜445）と衝突しない', catalogReport.collidesWithMaster);
// カテゴリ名は決め打ちしない。core が並べたぶんが全部読めていることだけを見る。
check(catalogReport.categories.slice().sort().join(',') === catalogSources.map((s) => s.category).sort().join(','),
	'読み込めたカテゴリが EXTRA_CATALOG_SOURCES と同じ顔ぶれ',
	{ 読み込めた: catalogReport.categories, 並べてある: catalogSources.map((s) => s.category) });
check(catalogReport.findProblems.length === 0,
	'全件が findSkill() で引け、kind にカテゴリが付く', catalogReport.findProblems);
check(catalogReport.resolveProblems.length === 0,
	'名前から同じ id へ解決する（OCRツールから渡った名前が当たる）', catalogReport.resolveProblems);
check(catalogReport.pickerPoolProblems.length === 0,
	'「条件でスキルを検索」の母集団に入るのはタグ付きのものだけ', catalogReport.pickerPoolProblems);
console.log('    母集団の内訳:', JSON.stringify(catalogReport.pickerPoolCounts));
// core の組み込みの写し（フェッチもキャッシュも駄目なときの最後の砦）。カテゴリごとに見る。
const embeddedDiff = [];
for (const src of catalogSources) {
	const want = catalogWant[src.category] || [];
	const copy = embeddedByCategory[src.category];
	if (copy === undefined) {
		if (CATEGORIES_WITHOUT_EMBEDDED_COPY.includes(src.category)) {
			console.log(`    ${src.category}: 組み込みの写しは持たない（意図どおり。読めなければ知らせる）`);
		} else {
			embeddedDiff.push({ category: src.category, problem: '写しが無い（持たせるか、意図して持たないなら CATEGORIES_WITHOUT_EMBEDDED_COPY に足す）' });
		}
		continue;
	}
	if (copy.length !== want.length) {
		embeddedDiff.push({ category: src.category, problem: '件数が違う', 写し: copy.length, 正本: want.length });
		continue;
	}
	copy.forEach((e, i) => {
		if (e.id !== want[i].id || e.name !== want[i].name) {
			embeddedDiff.push({ category: src.category, index: i, 写し: e.id + '/' + e.name, 正本: want[i].id + '/' + want[i].name });
		}
	});
}
check(embeddedDiff.length === 0,
	'core.js の組み込みの写し（EMBEDDED_EXTRA_CATALOG）が正本と一致', embeddedDiff);
console.log('');

if (failed > 0) {
	console.log('CHAR_CONFUSION_MAP の追記、スキルマスタの更新、または exam.html の組み込み133種で食い違いが発生しています。');
	process.exitCode = 1;
}
