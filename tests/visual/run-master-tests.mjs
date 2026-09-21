// UmaSkill Deck マスターデータ（uma-skill-deck-skills.json）とタグの軸の自動検証。
//
//   npm run test:master
//
// 2026-09-11 のマスターデータ拡張（3件）を対象にする:
//   ① 効果タイプ「持久力」を「持久力回復」(stamina) と「持久力減少」(stamina_down) に分割
//   ② 「〇〇の目覚め」系6件を追加（439→445件）
//   ③ 軸「その他」（当時は8本目。シナリオスキル）を新設
//
// 2026-09-21（70セッション目・段2）に足したもの:
//   ②(ア)A 6値を「能力上昇」(stat_up) へ統合／②(ア)D 2値を「デバフ」(debuff) へ統合
//   ⑥ レアリティ(rarity) ・ 共通/継承(inherited) のキーを先行投入（UIにはまだ出さない）
//   廃した値が残るカスタムスキルの読み替え（保存データは書き換えない）
//
// **軸の本数はこのファイルに書かない。** 8→10 のように増えるので、数を決め打ちすると
// 「増やしたこと自体」で落ちてしまい、取りこぼしを見るという狙いが果たせない。
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

/**
 * ①で「持久力減少」(stamina_down) へ付け替えた14件。
 *
 * **70セッション目・段2 で `stamina_down` という値そのものは無くなった**（`debuff` へ統合）。
 * それでも名簿を残しているのは、①の検査の意味 ――「サブ効果が持久力消費の14件は
 * 持久力回復を持たない」が**統合後も成り立っていること**を見るため。
 * `debuff` は速度ダウンも含む広い値なので、`debuff` 全体では回復と同時に持つ2件がある
 * （展開窺い・マイペース。どちらも元から `speed_down` ＋ `stamina` で、これは正しい）。
 * **だから①の意味は `debuff` では書けず、この名簿でしか書けない。**
 */
const STAMINA_DOWN = [
	'トリック（前）', 'トリック（後）',
	'逃げけん制', '逃げ焦り', '先行けん制', '先行焦り',
	'差しけん制', '差し焦り', '追込けん制', '追込焦り',
	'抜け駆け禁止', 'ささやき', 'スタミナイーター', '鋭い眼光',
];

/**
 * ②(ア)D で「デバフ」(debuff) へ統合した31件
 * （持久力減少 stamina_down の14件 ＋ 速度ダウン speed_down の17件。重なりは0件）。
 * 70セッション目・段2。
 */
const DEBUFF = [
	'展開窺い', 'トリック（前）', 'トリック（後）',
	'逃げけん制', '逃げ焦り', '逃げためらい', '先行けん制', '先行焦り', '先行ためらい',
	'差しけん制', '差し焦り', '差しためらい', '追込けん制', '追込焦り', '追込ためらい',
	'後方釘付', '抜け駆け禁止', 'スピードイーター', '束縛', 'ささやき', 'スタミナイーター',
	'鋭い眼光', 'まなざし', 'マイペース', '気迫を込めて', '土煙', '圧迫感', 'プレッシャー',
	'切り崩し', '鬼気迫って', '切り替え上手',
];

/** ②(ア)A で「能力上昇」(stat_up) へ統合した6つの値と、D で「デバフ」へ統合した2つの値。 */
const RETIRED_EFFECT_VALUES = [
	'speed_up', 'stamina_up', 'power_up', 'guts_up', 'wisdom_up', 'all_up',   // → stat_up
	'stamina_down', 'speed_down',                                             // → debuff
];

/**
 * ⑥で足した2軸（レアリティ／共通/継承）。
 *
 * 70セッション目・**段2 でキーだけマスターへ入れ**、**段3 でいったん TAG_AXES に出したが、
 * 段4 のあとに「この画面にこの2軸は要らない」と決まって外した**。
 * **マスターのキーは残したまま**（別の用途で要る分類なので消さない）、
 * **絞り込みの軸としては出さない**、という状態。
 *
 * だから **`TAG_AXES` とマスターの `tags` の軸は顔ぶれが一致しない。**
 * ここで見るのは (1) マスターにキーがあること (2) 値がまだ入っていないこと (3) UIには出ていないこと。
 * タグ付けを始めたら (2) が落ちるので、そのときに検査の意図ごと見直す。
 */
const DATA_ONLY_AXES = ['rarity', 'inherited'];

/**
 * サブ効果が持久力消費のため、効果タイプから持久力を外した14件。
 * 「サブ効果の持久力消費は無視され、サブ効果の持久力回復は重要視される」という
 * ゲーム側の暗黙知に合わせている（2026-09-11）。ここが再び stamina を持ったら退行。
 */
const SUB_CONSUME_NO_STAMINA = [
	'二の矢', 'あやしげな作戦', 'フルスロットル', 'しゃかりき', 'がむしゃら', '惜しみなし', '後先恐れず',
	'アグレッシブ', 'ハイピッチ', 'なりふり構わず', '猛プッシュ', '大立ち回り', '元気バクハツ', 'レースの真髄・体',
];

/** サブ効果が持久力回復のため、持久力回復のまま残す9件（スタミナイーターはメインが減少なので別扱い） */
const SUB_RECOVER_KEEP = [
	'闘争心', '快速', 'バイブス上昇', '克己心', '裏腹なキモチ', '覇気十分', '張り切り', '存在感', '綺羅星',
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

	// 軸のキーが全件に揃っていること（軸を増やしたときの取りこぼし防止）。
	// **軸の顔ぶれをここに書かない**（70セッション目・段2 で 8→10 になった）。1件目から読んで、
	// 445件すべてが**同じ顔ぶれ**を持つかを見る。数を決め打ちすると、軸を足すたびに
	// 「足したこと自体」で落ちてしまい、取りこぼしを見るという狙いが果たせない。
	const AXIS_KEYS = Object.keys(master.skills[0].tags);
	const axisSig = AXIS_KEYS.slice().sort().join(',');
	const missing = master.skills.filter((s) => Object.keys(s.tags).slice().sort().join(',') !== axisSig);
	assert(missing.length === 0, '全445件が同じ軸（' + AXIS_KEYS.length + '本）のキーを持つ: ' + AXIS_KEYS.join('/'),
		missing.map((s) => s.name).slice(0, 5));
	const notArray = master.skills.filter((s) => AXIS_KEYS.some((k) => !Array.isArray(s.tags[k])));
	assert(notArray.length === 0, '全445件が全軸のタグを配列で持つ', notArray.map((s) => s.name).slice(0, 5));

	// ⑥ マスターだけが持つ2軸。**絞り込みには出さないが、キーは残す。** タグ付けはまだなので値は空。
	const dataOnlyPresent = DATA_ONLY_AXES.filter((k) => AXIS_KEYS.includes(k));
	assert(eq(dataOnlyPresent, DATA_ONLY_AXES), '⑥レアリティ／共通・継承のキーがマスターにある', dataOnlyPresent);
	const dataOnlyFilled = master.skills.filter((s) => DATA_ONLY_AXES.some((k) => (s.tags[k] || []).length > 0));
	assert(dataOnlyFilled.length === 0, '⑥その2軸はまだ空（タグ付けは未着手）', dataOnlyFilled.map((s) => s.name).slice(0, 5));

	// ① 持久力回復 ／ ②(ア)D デバフ
	const rec = master.skills.filter((s) => s.tags.effect.includes('stamina'));
	const dec = master.skills.filter((s) => s.tags.effect.includes('debuff'));
	assert(dec.length === 31, '②D デバフ(debuff)が31件（旧 持久力減少14＋速度ダウン17）', dec.length);
	assert(eq(dec.map((s) => s.name).sort(), DEBUFF.slice().sort()),
		'②D デバフの内訳が指定の31件と一致', dec.map((s) => s.name));
	assert(rec.length === 42, '①持久力回復(stamina)が42件（メイン回復33＋サブ回復9）', rec.length);
	const stillStamina = SUB_CONSUME_NO_STAMINA.filter((n) => byName.get(n).tags.effect.includes('stamina'));
	assert(stillStamina.length === 0, '①サブ効果が持久力消費の14件は持久力を持たない', stillStamina);
	const emptied = SUB_CONSUME_NO_STAMINA.filter((n) => byName.get(n).tags.effect.length === 0);
	assert(emptied.length === 0, '①持久力を外しても効果タイプが空にならない', emptied);
	const lostRecover = SUB_RECOVER_KEEP.filter((n) => !byName.get(n).tags.effect.includes('stamina'));
	assert(lostRecover.length === 0, '①サブ効果が持久力回復の9件は持久力回復のまま', lostRecover);
	// 統合後、①の「回復と減少を同時に持たない」は **debuff では書けない**（速度ダウンを含むため。
	// 展開窺い・マイペースは元から speed_down ＋ stamina で、これは正しい）。名簿の側で見る。
	const recAndDec = STAMINA_DOWN.filter((n) => byName.get(n).tags.effect.includes('stamina'));
	assert(recAndDec.length === 0, '①持久力減少だった14件は持久力回復を持たない（統合後も成り立つ）', recAndDec);

	// ②(ア)A 能力上昇への統合と、廃した8値が1件も残っていないこと
	const statUp = master.skills.filter((s) => s.tags.effect.includes('stat_up'));
	assert(statUp.length === 67, '②A 能力上昇(stat_up)が67件（6値を統合。2つ以上持っていた5件は1つに潰れる）', statUp.length);
	const retired = master.skills
		.filter((s) => s.tags.effect.some((v) => RETIRED_EFFECT_VALUES.includes(v)))
		.map((s) => s.name);
	assert(retired.length === 0, '②廃した8つの値がマスターに1件も残っていない', retired.slice(0, 5));
	const emptyEffect = master.skills.filter((s) => s.tags.effect.length === 0);
	assert(emptyEffect.length === 0, '②統合しても効果タイプが空になったスキルは無い', emptyEffect.map((s) => s.name).slice(0, 5));
	const dupEffect = master.skills.filter((s) => new Set(s.tags.effect).size !== s.tags.effect.length);
	assert(dupEffect.length === 0, '②統合で同じ値が二重に入ったスキルは無い', dupEffect.map((s) => s.name).slice(0, 5));

	// ② 目覚め系6件
	AWAKENINGS.forEach(([newName, srcName]) => {
		const a = byName.get(newName);
		const b = byName.get(srcName);
		assert(!!a, '②「' + newName + '」が存在する');
		assert(!!b, '②コピー元「' + srcName + '」が存在する');
		if (a && b) {
			assert(eq(a.tags, b.tags), '②「' + newName + '」のタグがコピー元「' + srcName + '」と一致', a.tags);
		}
	});
	const awakeIds = AWAKENINGS.map(([n]) => byName.get(n)).filter(Boolean).map((s) => Number(s.id));
	assert(eq(awakeIds, [440, 441, 442, 443, 444, 445]), '②新規6件のIDが既存の連番を引き継いでいる', awakeIds);

	// ③ シナリオスキル
	const scen = master.skills.filter((s) => s.tags.scenario.length > 0);
	assert(scen.length === 27, '③シナリオスキルが27件', scen.length);
	assert(eq(scen.map((s) => s.name).sort(), SCENARIO.slice().sort()),
		'③シナリオスキルの内訳が指定の27件と一致', scen.map((s) => s.name));
	assert(scen.every((s) => eq(s.tags.scenario, ['scenario'])), '③27件の値はいまのところ ["scenario"] だけ（シナリオ因子・遺伝子は未収録）');

	assert(master.masterVersion !== '2026-09-09a' && /^\d{4}-\d{2}-\d{2}[a-z]$/.test(master.masterVersion),
		'masterVersion が更新されている', master.masterVersion);
}

/* ============================================================
 * 2. 画面（HTTP経由で実際に読み込ませる）
 * ============================================================ */
console.log('\n=== 2. スキル選択モーダル・軸ごとのフィルター（HTTP経由） ===');
const { base, close } = await startServer();
const browser = await chromium.launch();
{
	const { ctx, page, errors } = await openPage(browser, base, 'uma-skill-deck.html');

	// F-16: file:// だと組み込みサンプル3件に落ちる。HTTP経由で本物を読めていることを先に確かめる。
	const meta = await page.evaluate(() => UmaSkillDeckCore.getMasterMeta());
	assert(meta.version === master.masterVersion,
		'HTTP経由でマスターデータを読めている（組み込みサンプルではない）', meta);

	// 軸の顔ぶれ。**本数を決め打ちしない**（70セッション目・段2 でマスターは10軸になった）。
	// 見るのは「`TAG_AXES` の軸がすべてマスターの tags に実在するか」＝**画面が
	// データに無い軸を出していないか**。逆向き（マスターにあってUIに出ていない軸）は、
	// データだけ先に入れる段があるので落とさず、§1 が「値が空か」で見張っている。
	const axes = await page.evaluate(() => UmaSkillDeckCore.TAG_AXES.map((a) => ({ key: a.key, label: a.label, flag: !!a.emptyMeansNone, opts: a.options.map((o) => o.v) })));
	const masterAxisKeys = Object.keys(master.skills[0].tags);
	const notInMaster = axes.filter((a) => !masterAxisKeys.includes(a.key)).map((a) => a.key);
	assert(axes.length > 0 && notInMaster.length === 0,
		'TAG_AXES の軸（' + axes.length + '本）がすべてマスターの tags に実在する', { notInMaster, masterAxisKeys });
	const notInUi = masterAxisKeys.filter((k) => !axes.some((a) => a.key === k));
	console.log(notInUi.length
		? '     （情報）マスターにあってUIにまだ出ていない軸: ' + notInUi.join(' / ')
		: '     （情報）マスターの軸とUIの軸は同じ顔ぶれ（先行しているものは無い）');

	// ⑥ レアリティ／共通/継承は**絞り込みの軸として出さない**（段4 のあとの決定）。
	// マスターにはキーが残っている（上の §1 で見た）ので、**「データにはあるがUIには出ない」**という
	// 食い違いが意図どおりであることを、両側から見て固定しておく。
	const inUi = DATA_ONLY_AXES.filter((k) => axes.some((a) => a.key === k));
	assert(inUi.length === 0, '⑥レアリティ／共通・継承は絞り込みのタブに出ない', inUi);
	// 並びは「コース位置 → レース環境」が地続き（間に何も挟まっていない）
	const order = axes.map((a) => a.key);
	assert(order.indexOf('environment') === order.indexOf('coursePos') + 1,
		'⑥ タブの並びは コース位置 → レース環境 が地続き', order);

	// 63セッション目（第2波）: ⑧を「その他」（入手経路）に広げ、値を3つにした。
	// **空配列の意味が他の軸と逆**（空＝該当なし）なのは変わらないので、印の名前だけ
	// flagAxis → emptyMeansNone に改めた（選択肢の数とは関係がない印なので）。
	// 軸のラベルからは通し番号と「その他N」を外した（タブで選ぶので番号が要らない）。
	// **添字（axes[7]）ではなく key で引く** ―― 軸を足すと並びが変わるため。
	const scenarioAxis = axes.find((a) => a.key === 'scenario');
	assert(scenarioAxis && scenarioAxis.label === 'その他' && scenarioAxis.flag,
		'「その他」の軸があり、空を「該当なし」と読む', scenarioAxis);
	assert(axes.every((a) => !/^[①-⑳]/.test(a.label)) && axes.every((a) => !/その他[0-9]/.test(a.label)),
		'軸のラベルに通し番号と「その他N」が残っていない', axes.map((a) => a.label));
	assert(eq(scenarioAxis.opts, ['scenario', 'scenario_factor', 'gene']),
		'「その他」の選択肢がシナリオスキル／シナリオ因子／遺伝子の3つ', scenarioAxis.opts);

	// 効果タイプの選択肢（70セッション目・段2 で 18 → 12 になった）
	const effectOpts = await page.evaluate(() =>
		UmaSkillDeckCore.TAG_AXES.find((a) => a.key === 'effect').options.map((o) => o.v + ':' + o.t));
	assert(effectOpts.includes('stamina:持久力回復'), '効果タイプに「持久力回復」がある', effectOpts.filter((o) => o.startsWith('stamina')));
	assert(effectOpts.includes('debuff:デバフ'), '②D 効果タイプに「デバフ」がある', effectOpts);
	assert(effectOpts.includes('stat_up:能力上昇'), '②A 効果タイプに「能力上昇」がある', effectOpts);
	assert(effectOpts.includes('target_speed_up:速度上昇') && effectOpts.includes('accel_up:加速度上昇'),
		'段1 ラベルが「速度上昇」「加速度上昇」になっている（キーは据え置き）', effectOpts.slice(0, 2));
	assert(!effectOpts.some((o) => o.endsWith(':持久力')), '旧ラベル「持久力」は残っていない');
	const retiredInUi = effectOpts.filter((o) => RETIRED_EFFECT_VALUES.includes(o.split(':')[0]));
	assert(retiredInUi.length === 0, '②廃した8つの値が選択肢に残っていない', retiredInUi);
	assert(effectOpts.length === 12, '②効果タイプの選択肢が12個（18個から6個減った）', effectOpts.length);

	// --- スキル選択モーダルを、除外なし（新規テンプレート相当）で開く ---
	await page.evaluate(() => UmaSkillDeckCore.openSkillPicker([], () => {}));
	await page.waitForTimeout(600);
	assert(await page.isVisible('.usd-modal'), 'スキル選択モーダルが開く');

	const readCount = () => page.evaluate(() =>
		parseInt(document.querySelector('[data-usd-el="result-count"]').textContent, 10));
	const listedNames = () => page.evaluate(() =>
		[...document.querySelectorAll('[data-usd-el="results"] .usd-row span')].map((el) => el.textContent));

	assert(await readCount() === 445, 'モーダルに445件が表示される', await readCount());

	// フィルターのチェックボックスを実際にクリックして絞り込む（UIの配線ごと確かめる）。
	// 軸はタブに分かれていて、選んでいないタブのパネルは visibility:hidden で
	// Playwright から押せない。実際の操作と同じく、該当タブを押してからチェックする。
	/* **その軸のタブを「選ばれていて、かつ開いている」状態にしてから**チェックする。
	   70セッション目・段4 の続きで、**選択中のタブをもう一度押すと選択肢パネルが閉じる**ように
	   なったので、無条件に押すと「開いている軸を押して閉じ、見えないチェックを押そうとする」
	   ことになる（実際にそれで止まった）。押すのは「まだ選ばれていない」か「閉じている」ときだけ。
	   ―― この判定は製品の属性（aria-selected / data-usd-open）をそのまま読むので、
	   検査の側に開閉の規則を書き写さずに済む。 */
	const ensureAxisOpen = async (axis) => {
		const st = await page.evaluate((a) => {
			const tab = document.querySelector('.usd-tab[data-usd-axis="' + a + '"]');
			const box = document.querySelector('[data-usd-el="axis-tabs"]');
			return {
				selected: tab.getAttribute('aria-selected') === 'true',
				open: box.getAttribute('data-usd-open') === 'true',
			};
		}, axis);
		if (st.selected && st.open) return;
		await page.click('.usd-tab[data-usd-axis="' + axis + '"]');
		await page.waitForTimeout(150);
	};
	const tick = async (axis, value) => {
		await ensureAxisOpen(axis);
		await page.click('[data-usd-el="filter-check"][data-axis="' + axis + '"][data-value="' + value + '"]');
		await page.waitForTimeout(300);
	};

	// ① 持久力回復 ／ ②D デバフ が別カテゴリとして効く
	await tick('effect', 'stamina');
	const recCount = await readCount();
	assert(recCount === 42, '「持久力回復」で絞ると42件', recCount);
	await tick('effect', 'stamina');

	await tick('effect', 'debuff');
	const decCount = await readCount();
	const decNames = await listedNames();
	assert(decCount === 31, '②D「デバフ」で絞ると31件', decCount);
	assert(eq(decNames.slice().sort(), DEBUFF.slice().sort()),
		'②D「デバフ」の内訳が指定の31件', decNames);
	// 軸内OR。**42+31=73 ではなく71** ―― 展開窺い・マイペースが両方に出る
	// （元から speed_down ＋ stamina を持つ。統合前の「回復と減少は排他」は
	//   持久力減少に限った話で、速度ダウンまで含む debuff では重なりうる）。
	await tick('effect', 'stamina');
	const bothCount = await readCount();
	assert(bothCount === 71, '両方チェックすると軸内ORで71件（42+31のうち2件が重なる）', bothCount);
	await tick('effect', 'stamina');
	await tick('effect', 'debuff');
	assert(await readCount() === 445, 'チェックを外すと445件に戻る', await readCount());

	// ②A 能力上昇（6値を統合したので、6つを別々に選んだときの和と同じ件数になる）
	await tick('effect', 'stat_up');
	const statUpCount = await readCount();
	assert(statUpCount === 67, '②A「能力上昇」で絞ると67件', statUpCount);
	await tick('effect', 'stat_up');

	// ③ シナリオスキルのフラグ絞り込み
	await tick('scenario', 'scenario');
	const scenCount = await readCount();
	const scenNames = await listedNames();
	assert(scenCount === 27, '⑧「シナリオスキル」で絞ると27件（この軸だけ、タグ無しが万能扱いにならない）', scenCount);
	assert(eq(scenNames.slice().sort(), SCENARIO.slice().sort()), '⑧シナリオスキルの内訳が指定の27件', scenNames.length);

	// 軸間ANDも壊れていないこと（シナリオ × 持久力回復）
	await tick('effect', 'stamina');
	const andCount = await readCount();
	const andNames = await listedNames();
	assert(eq(andNames.slice().sort(), ['アオハル点火・体', '綺羅星'].sort()),
		'⑧×③のAND絞り込みが効く', andNames);
	assert(andCount === 2, '⑧シナリオ × 持久力回復 は2件（レースの真髄・体はサブ消費で外れた）', andCount);
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

	// カスタムスキル入力欄にも「その他」の軸が出る（TAG_AXES駆動になっていることの確認）。
	// 件数は決め打ちせず、**製品の pickableOptions() から取る** ―― 選択肢が増えたとき、
	// UI が追随していることこそ見たいので、決め打ちだと「追随した」こと自体で落ちてしまう。
	//
	// **見る先を options から pickableOptions() へ変えた**（69セッション目）。
	// 段B（C-68 の3節）で `internalOnly` を入れ、**カスタムスキル入力から
	// `scenario_factor` と `gene` を隠した**ので、`options` をそのまま数えると必ず食い違う
	// （画面 1 / core 3 で落ちていた）。**隠したのは意図どおり**なので、直すのは検査の意図のほう。
	// 同じ規則をここに書き写すと片方が古くなるので、**製品の関数をそのまま借りる**。
	const customScenario = await page.evaluate(() => {
		const axis = UmaSkillDeckCore.TAG_AXES.find((a) => a.key === 'scenario');
		return {
			画面: document.querySelectorAll('[data-usd-el="custom-tag"][data-axis="scenario"]').length,
			選ばせる: UmaSkillDeckCore.pickableOptions(axis).length,
			軸の全部: axis.options.length,
		};
	});
	assert(customScenario.画面 === customScenario.選ばせる && customScenario.選ばせる > 0,
		'カスタムスキル入力の⑧の選択肢が pickableOptions() と同じ数（internalOnly は出さない）', customScenario);

	await page.evaluate(() => UmaSkillDeckCore.closeSkillPicker());
	await page.waitForTimeout(300);

	/* ==========================================================
	 * ② 廃した値が残るカスタムスキルの読み替え（70セッション目・段2）
	 *
	 * マスターは付け替え済みだが、**利用者が作ったカスタムスキル**には古い値が残る。
	 * 見るのは2つ ―― (1) 読み替えが効いて「能力上昇」の絞り込みに出てくること、
	 * (2) **localStorage の中身は1バイトも書き換わっていないこと**（このファイルの
	 * 「読み込み側は分岐せず、後から補わない」という原則を崩していないこと）。
	 *
	 * **読み替えの表は検査に書き写さない。** 仕込む旧値だけを書き、
	 * 読み替え先は製品の `withLegacyTagsMapped()` に聞く（pickableOptions と同じ考え方）。
	 * ========================================================== */
	const LEGACY_ID = 'custom_legacy_probe';
	const LEGACY_NAME = '旧値が残ったカスタムスキル（検査用）';
	const LEGACY_EFFECT = ['speed_up', 'power_up'];   // どちらも段2 で廃した値（2つとも同じ新値へ潰れる）
	{
		const seeded = await page.evaluate(([id, name, effect]) => {
			const data = UmaSkillDeckCore.getUserData();
			const tags = {};
			UmaSkillDeckCore.TAG_AXES.forEach((a) => { tags[a.key] = []; });
			tags.effect = effect.slice();
			data.customSkills = (data.customSkills || []).filter((c) => c.customId !== id);
			data.customSkills.push({ customId: id, name: name, tags: tags, createdAt: new Date().toISOString() });
			UmaSkillDeckCore.replaceUserData(data);
			return UmaSkillDeckCore.withLegacyTagsMapped(tags).effect;
		}, [LEGACY_ID, LEGACY_NAME, LEGACY_EFFECT]);
		// 6値→1値なので、2つの旧値は1つに潰れる（重複が残らないこと）
		assert(seeded.length === 1 && seeded[0] !== LEGACY_EFFECT[0],
			'②旧値2つが読み替えで1つに潰れる（withLegacyTagsMapped）', seeded);

		await page.evaluate(() => UmaSkillDeckCore.openSkillPicker([], () => {}));
		await page.waitForTimeout(500);
		const allCount = await readCount();
		assert(allCount === 446, '②カスタムスキル1件を足したので母集団は446件', allCount);
		await tick('effect', seeded[0]);
		const hit = await listedNames();
		assert(hit.includes(LEGACY_NAME),
			'②旧値のままのカスタムスキルも「能力上昇」の絞り込みに出る（読むときに読み替える）', hit.length);
		assert((await readCount()) === 68, '②その絞り込みは 67件＋カスタム1件 の68件', await readCount());
		await tick('effect', seeded[0]);
		await page.evaluate(() => UmaSkillDeckCore.closeSkillPicker());
		await page.waitForTimeout(300);

		// (2) 保存データは書き換わっていない
		const stored = await page.evaluate((id) => {
			const raw = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
			const c = (raw.customSkills || []).find((x) => x.customId === id);
			return c ? c.tags.effect : null;
		}, LEGACY_ID);
		assert(eq(stored, LEGACY_EFFECT),
			'②保存データの旧値はそのまま（読み込み時に書き換えていない）', stored);

		// 後片付け（この ctx はこのあと閉じるが、意図を残すために明示的に外す）
		await page.evaluate((id) => {
			const data = UmaSkillDeckCore.getUserData();
			data.customSkills = (data.customSkills || []).filter((c) => c.customId !== id);
			UmaSkillDeckCore.replaceUserData(data);
		}, LEGACY_ID);
	}

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
