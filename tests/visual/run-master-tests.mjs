// UmaSkill Deck マスターデータ（uma-skill-deck-skills.json）と8軸タグの自動検証。
//
//   npm run test:master
//
// 2026-09-11 のマスターデータ拡張（3件）を対象にする:
//   ① 効果タイプ「持久力」を「持久力回復」(stamina) と「持久力減少」(stamina_down) に分割
//   ② 「〇〇の目覚め」系6件を追加（439→445件）
//   ③ 8軸目「⑧その他3（シナリオスキル）」を新設
//
// 必ずHTTP経由で開く（startServer）。`file://` では fetch が禁止されていて
// マスターデータの取得に失敗し、組み込みサンプル3件へ黙ってフォールバックする（F-16）。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer, REPO_ROOT } from './lib/serve.mjs';
import { openPage } from './lib/fixtures.mjs';

let fails = 0;
function assert(cond, label, extra) {
	if (!cond) fails++;
	console.log((cond ? '[OK] ' : '[NG] ') + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const master = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'uma-skill-deck-skills.json'), 'utf8'));

/** ①で「持久力減少」へ付け替えた14件 */
const STAMINA_DOWN = [
	'トリック（前）', 'トリック（後）',
	'逃げけん制', '逃げ焦り', '先行けん制', '先行焦り',
	'差しけん制', '差し焦り', '追込けん制', '追込焦り',
	'抜け駆け禁止', 'ささやき', 'スタミナイーター', '鋭い眼光',
];

/** ③でシナリオスキルのフラグを立てた27件（公式ID 210xxx 番台に対応） */
const SCENARIO = [
	'アオハル点火・速', 'アオハル点火・体', 'アオハル点火・力', 'アオハル点火・根', 'アオハル点火・賢',
	'綺羅星', '夢の途中', '前だけ見据えて',
	'レースの真髄・速', 'レースの真髄・体', 'レースの真髄・力', 'レースの真髄・根', 'レースの真髄・賢', 'レースの真髄・心',
	'陽の加護', '海の加護', '地の加護',
	'想いを背負って', 'バーニングソウル', 'いつまでも健やかに', '食の極意', '夢の再生方法',
	'時代を変える者', 'あるがままに', '本気で休んで、もう一度', 'アメリカンドリーム', '恩返し、召し上がれ',
];

/** ②で追加した6件と、タグのコピー元 */
const AWAKENINGS = [
	['左回りの目覚め', '左回り○'],
	['右回りの目覚め', '右回り○'],
	['春の目覚め', '春ウマ娘○'],
	['夏の目覚め', '夏ウマ娘○'],
	['秋の目覚め', '秋ウマ娘○'],
	['冬の目覚め', '冬ウマ娘○'],
];

/* ============================================================
 * 1. マスターデータ（JSONそのもの）
 * ============================================================ */
console.log('=== 1. マスターデータ（uma-skill-deck-skills.json） ===');
{
	const byName = new Map(master.skills.map((s) => [s.name, s]));

	assert(master.skills.length === 445, 'スキルが445件ある', master.skills.length);

	const ids = master.skills.map((s) => s.id);
	assert(new Set(ids).size === ids.length, 'スキルIDに重複がない');
	const names = master.skills.map((s) => s.name);
	assert(new Set(names).size === names.length, 'スキル名に重複がない');

	// 8軸すべてのキーが全件に揃っていること（軸を増やしたときの取りこぼし防止）
	const AXIS_KEYS = ['distance', 'style', 'phase', 'coursePos', 'environment', 'trackVenue', 'effect', 'scenario'];
	const missing = master.skills.filter((s) => AXIS_KEYS.some((k) => !Array.isArray(s.tags[k])));
	assert(missing.length === 0, '全445件が8軸すべてのキーを配列で持つ', missing.map((s) => s.name).slice(0, 5));

	// ① 持久力回復 / 持久力減少
	const rec = master.skills.filter((s) => s.tags.effect.includes('stamina'));
	const dec = master.skills.filter((s) => s.tags.effect.includes('stamina_down'));
	assert(dec.length === 14, '①持久力減少(stamina_down)が14件', dec.length);
	assert(eq(dec.map((s) => s.name).sort(), STAMINA_DOWN.slice().sort()),
		'①持久力減少の内訳が指定の14件と一致', dec.map((s) => s.name));
	assert(rec.length === 56, '①持久力回復(stamina)が56件', rec.length);
	assert(!master.skills.some((s) => s.tags.effect.includes('stamina') && s.tags.effect.includes('stamina_down')),
		'①回復と減少を同時に持つスキルはない');

	// ② 目覚め系6件
	AWAKENINGS.forEach(([newName, srcName]) => {
		const a = byName.get(newName);
		const b = byName.get(srcName);
		assert(!!a, '②「' + newName + '」が存在する');
		assert(!!b, '②コピー元「' + srcName + '」が存在する');
		if (a && b) {
			assert(eq(a.tags, b.tags), '②「' + newName + '」の8軸タグがコピー元「' + srcName + '」と一致', a.tags);
		}
	});
	const awakeIds = AWAKENINGS.map(([n]) => byName.get(n)).filter(Boolean).map((s) => Number(s.id));
	assert(eq(awakeIds, [440, 441, 442, 443, 444, 445]), '②新規6件のIDが既存の連番を引き継いでいる', awakeIds);

	// ③ シナリオスキル
	const scen = master.skills.filter((s) => s.tags.scenario.length > 0);
	assert(scen.length === 27, '③シナリオスキルが27件', scen.length);
	assert(eq(scen.map((s) => s.name).sort(), SCENARIO.slice().sort()),
		'③シナリオスキルの内訳が指定の27件と一致', scen.map((s) => s.name));
	assert(scen.every((s) => eq(s.tags.scenario, ['scenario'])), '③フラグの値が単一値 ["scenario"]');

	assert(master.masterVersion !== '2026-09-09a' && /^\d{4}-\d{2}-\d{2}[a-z]$/.test(master.masterVersion),
		'masterVersion が更新されている', master.masterVersion);
}

/* ============================================================
 * 2. 画面（HTTP経由で実際に読み込ませる）
 * ============================================================ */
console.log('\n=== 2. スキル選択モーダル・8軸フィルター（HTTP経由） ===');
const { base, close } = await startServer();
const browser = await chromium.launch();
{
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');

	// F-16: file:// だと組み込みサンプル3件に落ちる。HTTP経由で本物を読めていることを先に確かめる。
	const meta = await page.evaluate(() => UmaSkillDeckCore.getMasterMeta());
	assert(meta.version === master.masterVersion,
		'HTTP経由でマスターデータを読めている（組み込みサンプルではない）', meta);

	// 8軸になっている
	const axes = await page.evaluate(() => UmaSkillDeckCore.TAG_AXES.map((a) => ({ key: a.key, label: a.label, flag: !!a.flagAxis })));
	assert(axes.length === 8, 'タグ軸が8本ある', axes.length);
	assert(axes[7] && axes[7].key === 'scenario' && axes[7].label === '⑧その他3（シナリオスキル）' && axes[7].flag,
		'8軸目が⑧その他3（シナリオスキル）でフラグ軸', axes[7]);

	// 効果タイプの選択肢に「持久力回復」「持久力減少」が別々に並ぶ
	const effectOpts = await page.evaluate(() =>
		UmaSkillDeckCore.TAG_AXES.find((a) => a.key === 'effect').options.map((o) => o.v + ':' + o.t));
	assert(effectOpts.includes('stamina:持久力回復'), '効果タイプに「持久力回復」がある', effectOpts.filter((o) => o.startsWith('stamina')));
	assert(effectOpts.includes('stamina_down:持久力減少'), '効果タイプに「持久力減少」がある');
	assert(!effectOpts.some((o) => o.endsWith(':持久力')), '旧ラベル「持久力」は残っていない');

	// --- スキル選択モーダルを、除外なし（新規テンプレート相当）で開く ---
	await page.evaluate(() => UmaSkillDeckCore.openSkillPicker([], () => {}));
	await page.waitForTimeout(600);
	assert(await page.isVisible('.usd-modal'), 'スキル選択モーダルが開く');

	const readCount = () => page.evaluate(() =>
		parseInt(document.querySelector('[data-usd-el="result-count"]').textContent, 10));
	const listedNames = () => page.evaluate(() =>
		[...document.querySelectorAll('[data-usd-el="results"] .usd-row span')].map((el) => el.textContent));

	assert(await readCount() === 445, 'モーダルに445件が表示される', await readCount());

	// フィルターのチェックボックスを実際にクリックして絞り込む（UIの配線ごと確かめる）
	// ④以降の軸は既定で畳まれている（⑧も⑥⑦に合わせて畳んである）ので、
	// 実際の操作と同じく開いてからチェックする。
	const tick = async (axis, value) => {
		await page.evaluate((a) => {
			const d = document.querySelector('details[data-usd-axis="' + a + '"]');
			if (d && !d.open) d.open = true;
		}, axis);
		await page.waitForTimeout(150);
		await page.click('[data-usd-el="filter-check"][data-axis="' + axis + '"][data-value="' + value + '"]');
		await page.waitForTimeout(300);
	};

	// ① 持久力回復 / 持久力減少 が別カテゴリとして効く
	await tick('effect', 'stamina');
	const recCount = await readCount();
	assert(recCount === 56, '「持久力回復」で絞ると56件', recCount);
	await tick('effect', 'stamina');

	await tick('effect', 'stamina_down');
	const decCount = await readCount();
	const decNames = await listedNames();
	assert(decCount === 14, '「持久力減少」で絞ると14件', decCount);
	assert(eq(decNames.slice().sort(), STAMINA_DOWN.slice().sort()),
		'「持久力減少」の内訳が指定の14件', decNames);
	// 回復側と減少側が排他（同じスキルが両方に出ない）
	await tick('effect', 'stamina');
	const bothCount = await readCount();
	assert(bothCount === 70, '両方チェックすると軸内ORで70件（56+14で重複なし）', bothCount);
	await tick('effect', 'stamina');
	await tick('effect', 'stamina_down');
	assert(await readCount() === 445, 'チェックを外すと445件に戻る', await readCount());

	// ③ シナリオスキルのフラグ絞り込み
	await tick('scenario', 'scenario');
	const scenCount = await readCount();
	const scenNames = await listedNames();
	assert(scenCount === 27, '⑧シナリオスキルで絞ると27件（タグ無しが万能扱いにならない）', scenCount);
	assert(eq(scenNames.slice().sort(), SCENARIO.slice().sort()), '⑧シナリオスキルの内訳が指定の27件', scenNames.length);

	// 軸間ANDも壊れていないこと（シナリオ × 持久力回復）
	await tick('effect', 'stamina');
	const andCount = await readCount();
	const andNames = await listedNames();
	assert(eq(andNames.slice().sort(), ['アオハル点火・体', 'レースの真髄・体', '綺羅星'].sort()),
		'⑧×③のAND絞り込みが効く', andNames);
	assert(andCount === 3, '⑧シナリオ × 持久力回復 は3件', andCount);
	await tick('effect', 'stamina');
	await tick('scenario', 'scenario');

	// ② 新規6件がモーダルに出て、タグがコピー元と一致している
	for (const [newName, srcName] of AWAKENINGS) {
		const same = await page.evaluate(([a, b]) => {
			const skills = UmaSkillDeckCore.getMasterSkills();
			const x = skills.find((s) => s.name === a);
			const y = skills.find((s) => s.name === b);
			if (!x || !y) return null;
			return { ok: JSON.stringify(UmaSkillDeckCore.getSkillTags(x.id)) === JSON.stringify(UmaSkillDeckCore.getSkillTags(y.id)), id: x.id };
		}, [newName, srcName]);
		assert(same && same.ok, '②画面上でも「' + newName + '」のタグがコピー元と一致', same);
	}
	const awakeListed = await page.evaluate((names) =>
		names.every((n) => [...document.querySelectorAll('[data-usd-el="results"] .usd-row span')].some((el) => el.textContent === n)),
		AWAKENINGS.map(([n]) => n));
	assert(awakeListed === true, '②新規6件がモーダルの一覧に並ぶ', awakeListed);

	// カスタムスキル入力欄にも8軸目が出る（TAG_AXES駆動になっていることの確認）
	const customScenario = await page.evaluate(() =>
		document.querySelectorAll('[data-usd-el="custom-tag"][data-axis="scenario"]').length);
	assert(customScenario === 1, 'カスタムスキル入力にも⑧の選択肢が出る', customScenario);

	await page.evaluate(() => UmaSkillDeckCore.closeSkillPicker());
	await page.waitForTimeout(300);

	assert(errors.length === 0, 'コンソールエラーなし', errors);
	await ctx.close();
}

/* ============================================================
 * 3. special.html 側（同じ共有モジュールを読む）でも445件見える
 * ============================================================ */
console.log('\n=== 3. special.html（Deck連携モード）でも同じマスターを読める ===');
{
	const { ctx, page, errors } = await openPage(browser, base, 'special.html');
	const meta = await page.evaluate(() => UmaSkillDeckCore.getMasterMeta());
	const count = await page.evaluate(() => UmaSkillDeckCore.getMasterSkills().length);
	// special.html は起動時にマスターを読まない場合があるので、読めていなければ明示的に読ませる。
	const loaded = count === 445 ? { meta, count } : await page.evaluate(async () => {
		await UmaSkillDeckCore.loadMasterSkills(true);
		return { meta: UmaSkillDeckCore.getMasterMeta(), count: UmaSkillDeckCore.getMasterSkills().length };
	});
	assert(loaded.count === 445, 'special.html でもマスター445件を読める', loaded);
	assert(loaded.meta.version === master.masterVersion, 'special.html の版が一致', loaded.meta.version);
	assert(errors.length === 0, 'コンソールエラーなし', errors);
	await ctx.close();
}

await browser.close();
await close();
console.log('\n' + (fails === 0 ? '=== マスターデータテスト: 全項目OK ===' : '=== マスターデータテスト: ' + fails + '件 NG ==='));
process.exit(fails === 0 ? 0 : 1);
