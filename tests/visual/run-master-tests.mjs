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
/* **【74セッション目・第2回の段1】拡張スキルも読む。**
 * 「条件で検索」の母集団は製品の `taggedSkillPool()` が決めており、**マスターだけではない**
 * ―― タグが付いた拡張スキルも入る（`tagsPending` のものは入らない）。
 * 第2回でタグが入ると、マスター単独で組み立てた期待値は必ず食い違うので、
 * ここで材料を広げておく。**カテゴリ名も件数もこのファイルに書かない**（ファイルから読む）。 */
const extendedSkills = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/extended-skills.json'), 'utf8'));

/**
 * ①で「持久力減少」(stamina_down) へ付け替えた14件。
 *
 * **70セッション目・段2 で `stamina_down` という値そのものは無くなった**（`debuff` へ統合）。
 * それでも名簿を残しているのは、①の検査の意味 ――「サブ効果が持久力消費の14件は
 * 持久力回復を持たない」が**統合後も成り立っていること**を見るため。
 * `debuff` は速度ダウンも含む広い値なので、`debuff` 全体では回復と同時に持つ2件がある
 * （展開窺い・マイペース。どちらも元から `speed_down` ＋ `stamina` で、これは正しい）。
 * **だから①の意味は `debuff` では書けず、この名簿でしか書けない。**
 *
 * **第2回の段2 で 14→13件**。スタミナイーターは効果タイプが `debuff` → `stamina`
 * （持久力回復）に直ったので、この名簿（持久力回復を持たないもの）から外した。
 * 展開窺い・マイペースも `debuff` を外れたので、上の「回復と同時に持つ2件」は今は0件。
 */
const STAMINA_DOWN = [
	'トリック（前）', 'トリック（後）',
	'逃げけん制', '逃げ焦り', '先行けん制', '先行焦り',
	'差しけん制', '差し焦り', '追込けん制', '追込焦り',
	'抜け駆け禁止', 'ささやき', '鋭い眼光',
];

/**
 * ②(ア)D で「デバフ」(debuff) へ統合した31件
 * （持久力減少 stamina_down の14件 ＋ 速度ダウン speed_down の17件。重なりは0件）。
 * 70セッション目・段2。
 *
 * **第2回の段2（公開マスターのタグの修正）で 31→25件**。布石・リスタートを加え、
 * 展開窺い・スタミナイーター・マイペース・気迫を込めて・プレッシャー・切り崩し・
 * 鬼気迫って・切り替え上手を外した。
 */
const DEBUFF = [
	'トリック（前）', 'トリック（後）',
	'逃げけん制', '逃げ焦り', '逃げためらい', '先行けん制', '先行焦り', '先行ためらい',
	'差しけん制', '差し焦り', '差しためらい', '追込けん制', '追込焦り', '追込ためらい',
	'後方釘付', '抜け駆け禁止', 'スピードイーター', '束縛', 'ささやき',
	'鋭い眼光', 'まなざし', '土煙', '圧迫感', '布石', 'リスタート',
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

/**
 * サブ効果が持久力回復のため、持久力回復のまま残す9件（スタミナイーターはメインが減少なので別扱い）。
 * 第2回の段2 でスタミナイーターも持久力回復になったが、「サブ効果が回復」の9件とは理由が違うので、ここには入れない。
 */
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
	assert(dec.length === 25, '②D デバフ(debuff)が25件（統合時の31件から第2回の段2で +2 −8）', dec.length);
	assert(eq(dec.map((s) => s.name).sort(), DEBUFF.slice().sort()),
		'②D デバフの内訳が指定の25件と一致', dec.map((s) => s.name));
	assert(rec.length === 43, '①持久力回復(stamina)が43件（メイン回復33＋サブ回復9＋第2回の段2でスタミナイーター）', rec.length);
	const stillStamina = SUB_CONSUME_NO_STAMINA.filter((n) => byName.get(n).tags.effect.includes('stamina'));
	assert(stillStamina.length === 0, '①サブ効果が持久力消費の14件は持久力を持たない', stillStamina);
	const emptied = SUB_CONSUME_NO_STAMINA.filter((n) => byName.get(n).tags.effect.length === 0);
	assert(emptied.length === 0, '①持久力を外しても効果タイプが空にならない', emptied);
	const lostRecover = SUB_RECOVER_KEEP.filter((n) => !byName.get(n).tags.effect.includes('stamina'));
	assert(lostRecover.length === 0, '①サブ効果が持久力回復の9件は持久力回復のまま', lostRecover);
	// 統合後、①の「回復と減少を同時に持たない」は **debuff では書けない**（速度ダウンを含むため。
	// 展開窺い・マイペースは元から speed_down ＋ stamina で、これは正しい）。名簿の側で見る。
	const recAndDec = STAMINA_DOWN.filter((n) => byName.get(n).tags.effect.includes('stamina'));
	assert(recAndDec.length === 0, '①持久力減少だった13件は持久力回復を持たない（統合後も成り立つ）', recAndDec);

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

	/* 段8 ―― パッシブとバ場（マスターの生データ側） */
	const passiveSkills = master.skills.filter((s) => (s.tags.passive || []).length > 0);
	assert(passiveSkills.length === 67, '段8: パッシブが67件', passiveSkills.length);
	assert(passiveSkills.every((s) => eq(s.tags.passive, ['passive'])), '段8: パッシブの値は ["passive"] だけ');
	// 隠す2軸のタグは、いまパッシブの中だけに閉じている（段8 の実測。増えたら気づけるように固定する）
	for (const k of ['environment', 'trackVenue']) {
		const outside = master.skills.filter((s) => (s.tags.passive || []).length === 0 && (s.tags[k] || []).length > 0);
		assert(outside.length === 0, '段8: ' + k + ' のタグを持つのはパッシブだけ', outside.map((s) => s.name).slice(0, 5));
	}
	// バ場：値は turf / dirt だけ。芝とダートを両方持つスキルは無い。environment には残っていない
	const surfVals = new Set(master.skills.flatMap((s) => s.tags.surface || []));
	assert(eq([...surfVals].sort(), ['dirt', 'turf']), '段8: バ場の値は turf / dirt だけ', [...surfVals]);
	assert(master.skills.every((s) => !((s.tags.surface || []).includes('turf') && (s.tags.surface || []).includes('dirt'))),
		'段8: 芝とダートを両方持つスキルは無い');
	assert(master.skills.every((s) => !(s.tags.environment || []).some((v) => /^surface_/.test(v))),
		'段8: environment に surface_* が残っていない',
		master.skills.filter((s) => (s.tags.environment || []).some((v) => /^surface_/.test(v))).map((s) => s.name));
	// 能力上昇を持つ67件は、すべてパッシブ（＝選択肢から外した根拠）
	const statUpAll = master.skills.filter((s) => s.tags.effect.includes('stat_up'));
	assert(statUpAll.length === 67 && statUpAll.every((s) => (s.tags.passive || []).length > 0),
		'段8: 能力上昇を持つ67件はすべてパッシブ', statUpAll.filter((s) => (s.tags.passive || []).length === 0).map((s) => s.name));

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
	const axes = await page.evaluate(() => UmaSkillDeckCore.TAG_AXES.map((a) => ({
		key: a.key, label: a.label, flag: !!a.emptyMeansNone,
		exclusive: !!a.exclusive, hidden: !!a.hiddenAxis, poolExcluded: !!a.poolExcluded,
		opts: a.options.map((o) => o.v),
	})));
	// 利用者の絞り込みに出る軸（製品の pickableAxes()。検査に「どれを隠すか」を書き写さない）
	const uiAxes = await page.evaluate(() => UmaSkillDeckCore.pickableAxes().map((a) => a.key));
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
	/* 71セッション目・段8: 並びの検査を「バ場は脚質の次」に置き換えた。
	   もとは「コース位置 → レース環境 が地続き」だったが、レース環境を隠したので成り立たない。
	   見るのは利用者に出る並び（uiAxes）で、バ場が距離・脚質と同じ層にあることを固定する。 */
	assert(uiAxes.indexOf('surface') === uiAxes.indexOf('style') + 1,
		'段8: タブの並びは 脚質 → バ場 が地続き', uiAxes);
	assert(uiAxes[0] === 'distance' && uiAxes[1] === 'style',
		'段8: 先頭は 距離 → 脚質 のまま', uiAxes);

	/* ==========================================================
	 * 段8 ― 軸に付く印
	 *
	 * 印の付きかたそのものをここで固定する。**以降の件数の検査は、この印と
	 * マスターの生データから期待値を組み立てる**ので、ここがずれると全部ずれる。
	 *
	 * 71セッション目・段8 で「optIn」（門番）を廃し、「hiddenAxis」「poolExcluded」「exclusive」
	 * を足した。**「hiddenAxis」と「poolExcluded」は別物**で、まとめると
	 * 「隠す軸にタグを持つが、パッシブではないスキル」まで母集団から消える ―― それを下で固定する。
	 * ========================================================== */
	// 2026-09-25（C-89）: 効果タイプも空を「該当なし」と読むようにした（3本 → 4本）。
	const EMPTY_NONE_AXES = ['effect', 'phase', 'coursePos', 'scenario'];
	const HIDDEN_AXES = ['environment', 'trackVenue', 'passive'];
	const POOL_EXCLUDED_AXES = ['passive'];
	const EXCLUSIVE_AXES = ['surface'];
	const flagged = axes.filter((a) => a.flag).map((a) => a.key);
	const hidden = axes.filter((a) => a.hidden).map((a) => a.key);
	const excluded = axes.filter((a) => a.poolExcluded).map((a) => a.key);
	const exclusive = axes.filter((a) => a.exclusive).map((a) => a.key);
	assert(eq(flagged.slice().sort(), EMPTY_NONE_AXES.slice().sort()),
		'段8・C-89: 空を「該当なし」と読む軸は4本（効果タイプ・フェーズ・コース位置・その他）', flagged);
	assert(eq(hidden.slice().sort(), HIDDEN_AXES.slice().sort()),
		'段8: 絞り込みに出さない軸は3本（レース環境・レース場・パッシブ）', hidden);
	assert(eq(excluded.slice().sort(), POOL_EXCLUDED_AXES.slice().sort()),
		'段8: 母集団から外す軸はパッシブ1本だけ', excluded);
	assert(eq(exclusive.slice().sort(), EXCLUSIVE_AXES.slice().sort()),
		'段8: 軸内が許可リストなのはバ場1本だけ', exclusive);
	assert(axes.every((a) => a.optIn === undefined), '段8: optIn（段5 の門番）の印はもう無い',
		axes.filter((a) => a.optIn !== undefined).map((a) => a.key));
	/* **印を分けた目的そのもの** ―― 隠す軸のうち、母集団から外すのはパッシブだけ。
	   1つにまとめると environment / trackVenue にタグを持つスキルまで消える。 */
	assert(hidden.filter((k) => !excluded.includes(k)).length === 2,
		'段8: 隠すだけで母集団には居る軸が2本ある（hiddenAxis と poolExcluded を分けた目的）',
		hidden.filter((k) => !excluded.includes(k)));
	assert(eq(uiAxes.slice().sort(), axes.filter((a) => !a.hidden).map((a) => a.key).slice().sort()),
		'段8: 画面に出る軸＝隠す印が付いていない軸', { uiAxes, hidden });
	// バ場の選択肢
	const surfaceAxis = axes.find((a) => a.key === 'surface');
	assert(surfaceAxis && surfaceAxis.label === 'バ場' && eq(surfaceAxis.opts, ['turf', 'dirt']),
		'段8: バ場の軸があり、選択肢は 芝 / ダートの2つ', surfaceAxis);
	// 能力上昇は選択肢から外れている（値そのものは残す）
	const effOptsUi = await page.evaluate(() =>
		UmaSkillDeckCore.pickableOptions(UmaSkillDeckCore.TAG_AXES.find((a) => a.key === 'effect')).map((o) => o.v));
	const effOptsAll = axes.find((a) => a.key === 'effect').opts;
	assert(!effOptsUi.includes('stat_up'), '段8: 効果タイプの選択肢に「能力上昇」が出ない', effOptsUi);
	assert(effOptsAll.includes('stat_up'), '段8: それでも値としては残っている（データと tagLabel のため）', effOptsAll);
	const statUpLabel = await page.evaluate(() => UmaSkillDeckCore.tagLabel('effect', 'stat_up'));
	assert(statUpLabel === '能力上昇', '段8: tagLabel は「能力上昇」を返せる（生の値が画面に出ない）', statUpLabel);

	/* 期待値の組み立て。**製品の `matchesFilters()` は使わない** ――
	   使うと「製品が製品と一致する」だけの検査になる。マスターの生のJSONに対して、
	   §3-2 の仕様文をそのまま書き下す。**軸のキーは上の実測（axes）から取る**ので、
	   軸が増減しても追従する。 */
	const axisValues = (skill, key) => (skill.tags && skill.tags[key]) || [];
	// 1つの軸の絞り込み（軸内OR・「空＝該当なし」）。
	// **印は製品からではなく上の `EMPTY_NONE_AXES` / `OPT_IN_AXES` から読む** ――
	// 製品の印をそのまま使うと、印を外して壊しても期待値が一緒にずれて、件数の検査が通ってしまう。
	// 上の3つの assert が「製品の印がこの通りであること」を先に固定している。
	const axisHit = (skill, key, values) => {
		const vals = axisValues(skill, key);
		if (vals.length === 0) return !EMPTY_NONE_AXES.includes(key);
		// 許可リストの軸（バ場）は「持っている値が全部選ばれている」ものだけ通す
		return EXCLUSIVE_AXES.includes(key)
			? vals.every((v) => values.includes(v))
			: vals.some((v) => values.includes(v));
	};
	/** 「条件で検索」の母集団（パッシブを外したもの）。名簿ではなく印とタグから導く。 */
	const inPool = (s) => POOL_EXCLUDED_AXES.every((k) => axisValues(s, k).length === 0);
	/* **【74セッション目・第2回の段1】母集団の材料を「マスター＋タグ付きの拡張スキル」へ広げた。**
	 *
	 * 製品の `taggedSkillPool()` は マスター＋カスタムスキル＋**タグを持つ追加カタログ** を足す。
	 * それまでこのファイルは `master.skills` だけで期待値を組み立てていたので、
	 * **第2回で拡張スキルにタグが入った瞬間、件数も名簿も全部食い違って落ちる**状態だった。
	 *
	 * **検査は1つも弱めていない** ―― 突き合わせはこれまでどおり「完全一致」で、
	 * 材料が1種類増えただけ。マスター側だけを見たい検査（パッシブ67件・シナリオ27件など）は
	 * `MASTER_POOL` / `master.skills` を使い続ける。
	 * カスタムスキルは各塊が自分で仕込むので、そのつど +1 して数える（従来どおり）。 */
	const MASTER_POOL = master.skills.filter(inPool);
	/** タグが付いた拡張スキル（`tagsPending` の行は `tags` を持たないので自然に外れる）。 */
	const CATALOG_TAGGED = extendedSkills.entries.filter((e) => e.tags);
	const CATALOG_POOL = CATALOG_TAGGED.filter(inPool);
	const POOL = MASTER_POOL.concat(CATALOG_POOL);
	/** 仕様どおりに絞った期待値（名前の配列）。f は { 軸キー: [値…] }。 */
	const expectNames = (f) => {
		const keys = Object.keys(f).filter((k) => (f[k] || []).length > 0);
		return POOL.filter((s) => keys.every((k) => axisHit(s, k, f[k]))).map((s) => s.name);
	};
	assert(MASTER_POOL.length === 378 && master.skills.length - MASTER_POOL.length === 67,
		'段8: マスターの母集団は 445 − パッシブ67 = 378件',
		{ 母集団: MASTER_POOL.length, パッシブ: master.skills.length - MASTER_POOL.length });
	/* **拡張スキルのぶんが0件のときは、そう名乗る。** タグ付けは第2回の段3 なので、
	   いまは「マスターだけの母集団」を見て通っている状態（F-56: 0件だから通る検査と、
	   通ったことに意味がある検査を混ぜない）。 */
	console.log(CATALOG_TAGGED.length
		? '     [情報] タグ付きの拡張スキル ' + CATALOG_TAGGED.length + '件（うち母集団に入るのは '
			+ CATALOG_POOL.length + '件・パッシブは ' + (CATALOG_TAGGED.length - CATALOG_POOL.length) + '件）'
			+ ' → 母集団は ' + POOL.length + '件'
		: '     [情報] 拡張スキルはまだ1件もタグが付いていない（母集団はマスターの ' + POOL.length + '件だけ）');

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

	assert(await readCount() === POOL.length,
		'モーダルに母集団の ' + POOL.length + '件が表示される（パッシブは出ない）', await readCount());
	/* **パッシブ67件が1件も出ていないこと**（段8 の狙いそのもの）。
	   名簿を検査に書かず、マスターの生データから「パッシブの名前」を作って突き合わせる。 */
	{
		const listed = new Set(await listedNames());
		const passiveNames = master.skills.filter((s) => !inPool(s)).map((s) => s.name);
		const leaked = passiveNames.filter((n) => listed.has(n));
		assert(passiveNames.length === 67 && leaked.length === 0,
			'段8: パッシブ67件は「条件で検索」の一覧に1件も出ない', leaked.slice(0, 5));
		/* **第2回の段3: パッシブの見張りをタグ付きの拡張スキルへ広げた**（おいもさんの決定）。
		   パッシブを持つスキル（マスター＋タグ付きカタログ）は、どれも「条件で検索」の一覧に居らず、
		   どれも「緑スキルを追加」の一覧（getPoolExcludedSkills）に居る。件数はデータから数える。
		   **データの passive を外しても、この検査は落ちない**（期待値も同じデータから作るので一緒に動く）。
		   ここが守るのは「データと画面の食い違い」＝製品の側の壊れ。データの側の付け外しの誤りは、
		   能力上昇の検査（パッシブは能力上昇だけを持つ）と正本側の確認で見る。 */
		const passiveAll = master.skills.concat(CATALOG_TAGGED).filter((s) => !inPool(s));
		const greenNames = new Set(await page.evaluate(() => UmaSkillDeckCore.getPoolExcludedSkills().map((s) => s.name)));
		const passiveLeaked = passiveAll.filter((s) => listed.has(s.name)).map((s) => s.name);
		const passiveMissing = passiveAll.filter((s) => !greenNames.has(s.name)).map((s) => s.name);
		assert(passiveLeaked.length === 0 && passiveMissing.length === 0,
			'段3: パッシブ ' + passiveAll.length + '件（マスター ' + (master.skills.length - MASTER_POOL.length)
				+ '＋拡張 ' + (CATALOG_TAGGED.length - CATALOG_POOL.length) + '）は条件で検索に居らず、緑スキルの一覧に居る',
			{ 条件で検索に出た: passiveLeaked.slice(0, 5), 緑の一覧に無い: passiveMissing.slice(0, 5) });
		/* **隠す軸と母集団は別**であることの実データでの裏取り。
		   隠す軸（レース環境・レース場）にタグを持っていても、パッシブでなければ一覧に出る。
		   印を1つにまとめると、ここが必ず落ちる。 */
		const hiddenButInPool = POOL.filter((s) => ['environment', 'trackVenue']
			.some((k) => axisValues(s, k).length > 0));
		const alsoListed = hiddenButInPool.filter((s) => listed.has(s.name));
		assert(alsoListed.length === hiddenButInPool.length,
			'段8: 隠す軸にタグを持っていても、パッシブでなければ母集団に出る',
			{ 該当: hiddenButInPool.length, 出た: alsoListed.length });
	}

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

	/* ① 持久力回復 ／ ②D デバフ が別カテゴリとして効く
	 *
	 * **70セッション目・段5 で、ここの件数はマスターのタグの件数と一致しなくなった。**
	 * `effect` は `optIn` でない軸なので、チェックを入れると⑤の門番が働き、
	 * **レース環境・レース場のタグを持つスキルが落ちる**（例: 持久力回復は 42 → 39件）。
	 * 件数は書かずに `expectNames()`（マスターの生データ＋軸の印から組み立てる）から取る。
	 * §1 はマスター側の 43件／25件／67件をそのまま見ているので、**「データの件数」と
	 * 「絞り込んだときに出る件数」の両方が固定されている。** */
	await tick('effect', 'stamina');
	const recCount = await readCount();
	const recExpect = expectNames({ effect: ['stamina'] });
	assert(recCount === recExpect.length, '「持久力回復」で絞ると ' + recExpect.length + '件', recCount);
	await tick('effect', 'stamina');

	await tick('effect', 'debuff');
	const decCount = await readCount();
	const decNames = await listedNames();
	const decExpect = expectNames({ effect: ['debuff'] });
	assert(decCount === decExpect.length, '②D「デバフ」で絞ると ' + decExpect.length + '件', decCount);
	assert(eq(decNames.slice().sort(), decExpect.slice().sort()),
		'②D「デバフ」の内訳が25件と一致（デバフにパッシブは1件も無い）', decNames);
	await tick('effect', 'debuff');
	// 軸内OR。**重なりがあるので単純な和にはならない** ―― 闘争心・克己心などが両方に出る。
	// **第2回の段2 まではここを「持久力回復＋デバフ」で見ていた**（展開窺い・マイペースが重なっていた）。
	// 2件とも debuff を外れて重なりが0件になり、この検査の意味（重なるぶんを二重に数えない）が
	// 書けなくなったので、重なりのある「持久力回復＋目標速度」へ替えた。
	await tick('effect', 'target_speed_up');
	await tick('effect', 'stamina');
	const bothCount = await readCount();
	const tsuExpect = expectNames({ effect: ['target_speed_up'] });
	const bothExpect = expectNames({ effect: ['stamina', 'target_speed_up'] });
	assert(bothCount === bothExpect.length,
		'両方チェックすると軸内ORで ' + bothExpect.length + '件（重なるぶんは二重に数えない）', bothCount);
	assert(bothExpect.length < recExpect.length + tsuExpect.length,
		'両方チェックしたときの件数が単純な和より少ない（重なりがある）',
		{ 回復: recExpect.length, 目標速度: tsuExpect.length, 両方: bothExpect.length });
	await tick('effect', 'stamina');
	await tick('effect', 'target_speed_up');
	assert(await readCount() === POOL.length, 'チェックを外すと母集団の件数に戻る', await readCount());

	/* **C-89（2026-09-25）: 効果タイプも空を「該当なし」と読む。**
	   効果タイプを1つでも選ぶと、効果タイプが空のスキルは出ない。何も選ばなければ出る。
	   選ぶ値は製品の選択肢の先頭から取る（値を検査に書かない）。 */
	{
		const effPick = await page.evaluate(() => {
			const C = UmaSkillDeckCore;
			return C.pickableOptions(C.TAG_AXES.find((a) => a.key === 'effect'))[0].v;
		});

		// (a) 母集団で効果タイプが空のスキル（データから探す。いまは大逃げ1件）
		const effEmpty = POOL.filter((s) => axisValues(s, 'effect').length === 0).map((s) => s.name);
		if (effEmpty.length === 0) console.log('     [情報] C-89(a): 母集団に効果タイプが空のスキルは0件（この検査は空振り。(b) の仕込みで見る）');
		else console.log('     [情報] C-89(a): 母集団で効果タイプが空のスキル ' + effEmpty.length + '件: ' + effEmpty.join('、'));
		await tick('effect', effPick);
		const onA = new Set(await listedNames());
		await tick('effect', effPick);
		const offA = new Set(await listedNames());
		assert(effEmpty.every((n) => !onA.has(n)),
			'C-89(a): 効果タイプを1つ選ぶと、効果タイプが空のスキル（' + effEmpty.length + '件）は出ない',
			effEmpty.filter((n) => onA.has(n)));
		assert(effEmpty.every((n) => offA.has(n)),
			'C-89(a): 効果タイプの選択を外すと、それらは出る', effEmpty.filter((n) => !offA.has(n)));

		// (b) 効果タイプが空の検査用カスタムスキルを仕込む（全軸が空＝「名前を入れて探す」から作ったものと同じ形）。
		//     データが変わっても、印の意味そのものを見続けるため（段8 の隠す軸の検査と同じ作り）。
		const EFF_PROBE_ID = 'custom_effect_empty_probe';
		const EFF_PROBE_NAME = '効果タイプが空の検査用スキル';
		await page.evaluate(([id, name]) => {
			const data = UmaSkillDeckCore.getUserData();
			const tags = {};
			UmaSkillDeckCore.TAG_AXES.forEach((a) => { tags[a.key] = []; });
			data.customSkills = (data.customSkills || []).filter((c) => c.customId !== id);
			data.customSkills.push({ customId: id, name: name, tags: tags, createdAt: new Date().toISOString() });
			UmaSkillDeckCore.replaceUserData(data);
			UmaSkillDeckCore.openSkillPicker([], () => {});
		}, [EFF_PROBE_ID, EFF_PROBE_NAME]);
		await page.waitForTimeout(300);
		const offB = (await listedNames()).includes(EFF_PROBE_NAME);
		await tick('effect', effPick);
		const onB = (await listedNames()).includes(EFF_PROBE_NAME);
		await tick('effect', effPick);
		const offB2 = (await listedNames()).includes(EFF_PROBE_NAME);
		assert(offB === true, 'C-89(b): 効果タイプが空のカスタムスキルは、何も選ばなければ出る', offB);
		assert(onB === false, 'C-89(b): 効果タイプを1つ選ぶと、効果タイプが空のカスタムスキルは出ない', onB);
		assert(offB2 === true, 'C-89(b): 選択を外すと、また出る', offB2);
		await page.evaluate((id) => {
			const data = UmaSkillDeckCore.getUserData();
			data.customSkills = (data.customSkills || []).filter((c) => c.customId !== id);
			UmaSkillDeckCore.replaceUserData(data);
			UmaSkillDeckCore.openSkillPicker([], () => {});
		}, EFF_PROBE_ID);
		await page.waitForTimeout(300);
		assert(await readCount() === POOL.length, 'C-89(b): 検査用スキルを片付けると母集団の件数に戻る', await readCount());

		// (c) マスター分の結果は変わらない。マスターには効果タイプが空のスキルが無いので、
		//     「空＝万能」（変更前）と「空＝該当なし」（変更後）の読み方で、選択肢ごとの結果が一致する。
		//     あわせて、画面に出たマスター分が変更後の読み方と一致することを1つの値で確かめる。
		const effValues = await page.evaluate(() => {
			const C = UmaSkillDeckCore;
			return C.pickableOptions(C.TAG_AXES.find((a) => a.key === 'effect')).map((o) => o.v);
		});
		const differ = effValues.filter((v) => {
			const before = MASTER_POOL.filter((s) => axisValues(s, 'effect').length === 0 || axisValues(s, 'effect').includes(v)).length;
			const after = MASTER_POOL.filter((s) => axisValues(s, 'effect').includes(v)).length;
			return before !== after;
		});
		assert(differ.length === 0,
			'C-89(c): マスター分は、効果タイプの ' + effValues.length + '個の選択肢すべてで変更の前と後の結果が同じ', differ);
		await tick('effect', effPick);
		const masterNames = new Set(MASTER_POOL.map((s) => s.name));
		const shownMaster = (await listedNames()).filter((n) => masterNames.has(n));
		const expectMaster = MASTER_POOL.filter((s) => axisValues(s, 'effect').includes(effPick)).map((s) => s.name);
		await tick('effect', effPick);
		assert(eq(shownMaster.slice().sort(), expectMaster.slice().sort()),
			'C-89(c): 効果タイプ（' + effPick + '）で絞ったときのマスター分 ' + expectMaster.length + '件が期待値と一致',
			{ 画面: shownMaster.length, 期待: expectMaster.length });
		assert(await readCount() === POOL.length, 'C-89: 選択を外すと母集団の件数に戻る', await readCount());
	}

	/* ②A「能力上昇」の絞り込みは段8 で無くなった（選択肢から外した）。
	   押せるものが無いことを、チェックボックスの有無で見る。 */
	{
		const box = await page.$('[data-usd-el="filter-check"][data-axis="effect"][data-value="stat_up"]');
		assert(box === null, '段8: 「能力上昇」のチェックボックスが画面に無い');
		/* **第2回の段3 で根拠を置き換えた。** それまでは「母集団に能力上昇は0件」を根拠にしていたが、
		   パッシブでない拡張スキルに能力上昇を持つものが入った（おいもさんの決定で、選択肢は外したまま）。
		   新しい根拠は **「母集団で能力上昇を持つスキルは、どれも能力上昇以外の効果タイプを1つ以上持つ」**
		   ＝ 能力上昇で絞れなくても、他の効果タイプで見つかる。件数も名前も決め打ちせず、データから数える。
		   `expectNames()` を使わないのは、効果タイプが空のスキル（万能扱い）まで当たってしまうため。 */
		const statUpInPool = POOL.filter((s) => axisValues(s, 'effect').includes('stat_up'));
		const statUpOnly = statUpInPool.filter((s) => !axisValues(s, 'effect').some((v) => v !== 'stat_up'));
		console.log('     [情報] 母集団で能力上昇を持つスキル ' + statUpInPool.length + '件: '
			+ statUpInPool.map((s) => s.name).join('、'));
		assert(statUpOnly.length === 0,
			'段8: 母集団で能力上昇を持つ ' + statUpInPool.length + '件は、どれも他の効果タイプを持つ（選択肢から外した根拠）',
			statUpOnly.map((s) => s.name));
	}

	/* 段8 ―― バ場の排他 */
	{
		const surf = (s, v) => axisValues(s, 'surface').includes(v);
		const turfOnly = master.skills.filter((s) => surf(s, 'turf'));
		const dirtOnly = master.skills.filter((s) => surf(s, 'dirt'));
		assert(turfOnly.length > 0 && dirtOnly.length > 0,
			'段8: マスターに芝・ダートのタグを持つスキルが実在する', { 芝: turfOnly.length, ダート: dirtOnly.length });

		await tick('surface', 'turf');
		const turfNames = await listedNames();
		const turfExpect = expectNames({ surface: ['turf'] });
		assert(await readCount() === turfExpect.length,
			'段8: 「芝」で絞ると ' + turfExpect.length + '件', await readCount());
		assert(turfNames.every((n) => !dirtOnly.some((s) => s.name === n)),
			'段8: 「芝」を選ぶとダートのタグを持つスキルは1件も出ない',
			turfNames.filter((n) => dirtOnly.some((s) => s.name === n)).slice(0, 5));
		assert(turfNames.some((n) => POOL.some((s) => s.name === n && axisValues(s, 'surface').length === 0)),
			'段8: バ場のタグが無いスキルは「芝」でも出る（空を「該当なし」と読む軸ではない）');
		await tick('surface', 'turf');

		await tick('surface', 'dirt');
		const dirtNames = await listedNames();
		assert(dirtNames.every((n) => !turfOnly.some((s) => s.name === n)),
			'段8: 「ダート」を選ぶと芝のタグを持つスキルは1件も出ない',
			dirtNames.filter((n) => turfOnly.some((s) => s.name === n)).slice(0, 5));
		await tick('surface', 'dirt');

		await tick('surface', 'turf');
		await tick('surface', 'dirt');
		assert(await readCount() === POOL.length,
			'段8: 芝とダートを両方選ぶと、バ場では1件も落ちない', await readCount());
		await tick('surface', 'turf');
		await tick('surface', 'dirt');
	}

	assert(await readCount() === POOL.length, '段8: バ場のチェックを外すと母集団の件数に戻る', await readCount());

	/* 段8 ―― **排他が軸内ORと違うことを確かめる。**
	   いまのマスターでは、バ場のタグを持つスキルは必ず片方だけなので、
	   **some（軸内OR）と every（許可リスト）は同じ結果になる** ―― つまり上の検査だけでは、
	   排他を OR に戻して壊しても素通りする（破壊確認で実際にそうなった）。
	   両方のタグを持つスキルを仕込むと、初めて2つの規則が分かれる:
	     片方だけ選ぶ … OR なら出る／許可リストなら出ない
	     両方選ぶ     … どちらでも出る
	   **値も軸のキーも書かない**（製品の印から、排他の軸とその選択肢を引く）。 */
	{
		const EX_ID = 'custom_exclusive_probe';
		const EX_NAME = '排他の軸の値を両方持つ検査用スキル';
		const exAxis = axes.find((a) => a.exclusive && !a.hidden);
		assert(!!exAxis && exAxis.opts.length >= 2, '段8: 排他の軸と選択肢2つが実在する', exAxis && exAxis.key);

		const seedEx = await page.evaluate(([id, name, key]) => {
			const data = UmaSkillDeckCore.getUserData();
			const tags = {};
			UmaSkillDeckCore.TAG_AXES.forEach((a) => { tags[a.key] = []; });
			const axis = UmaSkillDeckCore.TAG_AXES.find((a) => a.key === key);
			tags[key] = axis.options.map((o) => o.v);      // その軸の値を**全部**持たせる
			data.customSkills = (data.customSkills || []).filter((c) => c.customId !== id);
			data.customSkills.push({ customId: id, name: name, tags: tags, createdAt: new Date().toISOString() });
			UmaSkillDeckCore.replaceUserData(data);
			UmaSkillDeckCore.openSkillPicker([], () => {});
			return tags[key];
		}, [EX_ID, EX_NAME, exAxis.key]);
		assert(seedEx.length === exAxis.opts.length && seedEx.length >= 2,
			'段8: 仕込んだスキルは排他の軸の値を全部持っている', seedEx);
		await page.waitForTimeout(300);

		const listedHas = async () => (await listedNames()).includes(EX_NAME);
		assert(await listedHas(), '段8: 条件なしなら、その仕込んだスキルは一覧に出る');

		// 片方だけ選ぶ → **出ない**（軸内ORに戻すと出てしまう＝壊れたことが分かる）
		await tick(exAxis.key, exAxis.opts[0]);
		assert(!(await listedHas()),
			'段8排他: 片方だけ選ぶと、両方の値を持つスキルは出ない（軸内ORとの違い）', { 選んだ: exAxis.opts[0], 一覧の件数: (await listedNames()).length });
		// 両方選ぶ → 出る
		await tick(exAxis.key, exAxis.opts[1]);
		assert(await listedHas(),
			'段8排他: 選択肢を全部選べば、両方の値を持つスキルも出る');
		await tick(exAxis.key, exAxis.opts[0]);
		await tick(exAxis.key, exAxis.opts[1]);

		// 後片付け
		await page.evaluate((id) => {
			const data = UmaSkillDeckCore.getUserData();
			data.customSkills = (data.customSkills || []).filter((c) => c.customId !== id);
			UmaSkillDeckCore.replaceUserData(data);
			UmaSkillDeckCore.openSkillPicker([], () => {});
		}, EX_ID);
		await page.waitForTimeout(300);
		assert(await readCount() === POOL.length, '段8排他: 検査用スキルを片付けると母集団の件数に戻る', await readCount());
	}

	// ③ シナリオスキルのフラグ絞り込み
	await tick('scenario', 'scenario');
	const scenCount = await readCount();
	const scenNames = await listedNames();
	// 「この軸だけ」ではなくなった（段5 で5本になった）。件数が27のままなのは、シナリオスキル27件が
	// レース環境・レース場のタグを1つも持たないから ―― 門番は働いているが落ちるものが無い。
	/* 71セッション目・段8: 27件 → 母集団に残るぶんだけになった（レースの真髄・心がパッシブ）。
	   件数は書かず、名簿からパッシブを引いたものと突き合わせる。
	   **第2回の段3: タグ付きの拡張スキルにもシナリオスキルがある**ので、画面と突き合わせる期待値は
	   `expectNames()` から作る（下の AND と同じ形）。**マスター側の26件は名簿で据え置き**にして、
	   「具体的にどれが出るか」の検査は失わない。 */
	const scenExpect = expectNames({ scenario: ['scenario'] });
	assert(scenCount === scenExpect.length,
		'⑧「シナリオスキル」で絞ると ' + scenExpect.length + '件（マスター・拡張スキルとも、パッシブを除く）', scenCount);
	const scenMasterExpect = SCENARIO.filter((n) => POOL.some((s) => s.name === n));
	assert(scenMasterExpect.length === 26, '段8: 27件のうち1件（レースの真髄・心）がパッシブになった', scenMasterExpect.length);
	const scenMaster = scenExpect.filter((n) => MASTER_POOL.some((s) => s.name === n));
	assert(eq(scenMaster.slice().sort(), scenMasterExpect.slice().sort()),
		'⑧シナリオスキルのうちマスター由来は名簿の26件と一致', scenMaster);
	assert(eq(scenNames.slice().sort(), scenExpect.slice().sort()), '⑧シナリオスキルの内訳が一致', scenNames.length);

	// 軸間ANDも壊れていないこと（シナリオ × 持久力回復）
	await tick('effect', 'stamina');
	const andCount = await readCount();
	const andNames = await listedNames();
	/* **74セッション目: 名前の決め打ちをやめ、期待値から作るようにした。**
	   タグ付きの拡張スキルが母集団に入ると、この組み合わせに当たるものが増えうるため。
	   **マスター側の2件（アオハル点火・体／綺羅星）は別の assert で据え置き**にしてあるので、
	   「具体的にどれが出るか」の検査は失っていない。 */
	const andExpect = expectNames({ scenario: ['scenario'], effect: ['stamina'] });
	assert(eq(andNames.slice().sort(), andExpect.slice().sort()),
		'⑧×③のAND絞り込みが効く（' + andExpect.length + '件）', { 画面: andNames, 期待: andExpect });
	assert(andCount === andExpect.length, '⑧シナリオ × 持久力回復 の件数が期待値と一致', andCount);
	const andMaster = andExpect.filter((n) => MASTER_POOL.some((s) => s.name === n));
	assert(eq(andMaster.slice().sort(), ['アオハル点火・体', '綺羅星'].sort()),
		'⑧×③ のうちマスター由来は2件（レースの真髄・体はサブ消費で外れた）', andMaster);
	await tick('effect', 'stamina');
	await tick('scenario', 'scenario');

	/* ==========================================================
	 * 段5 ―― ③④ フェーズ・コース位置の「空＝該当なし」
	 *
	 * **件数は書かない。** 「その軸のタグが空のスキルが1件も出ていない」という**性質**と、
	 * `expectNames()` が組み立てた期待値との突き合わせで見る。
	 * 母集団がマスターだけになるよう、ここまでにカスタムスキルは作っていない。
	 * ========================================================== */
	console.log('\n--- 段5 ③④ フェーズ・コース位置（空＝該当なし） ---');
	for (const key of ['phase', 'coursePos']) {
		const axis = axes.find((a) => a.key === key);
		const emptyNames = master.skills.filter((s) => axisValues(s, key).length === 0).map((s) => s.name);
		assert(emptyNames.length > 0, '段5③④ ' + axis.label + ' のタグが空のスキルがマスターに実在する', emptyNames.length + '件');

		// 例1: 1つ選ぶ
		const one = axis.opts[Math.min(1, axis.opts.length - 1)];   // 「中盤」「直線」相当（先頭以外を1つ）
		await tick(key, one);
		const gotOne = await listedNames();
		const wantOne = expectNames({ [key]: [one] });
		assert(eq(gotOne.slice().sort(), wantOne.slice().sort()),
			'段5③④ ' + axis.label + '＝' + one + ' の結果が仕様どおり（' + wantOne.length + '件）', gotOne.length);
		const leaked = gotOne.filter((n) => emptyNames.includes(n));
		assert(leaked.length === 0,
			'段5③④ ' + axis.label + ' を選ぶと、その軸のタグが空のスキルは1件も出ない', leaked.slice(0, 5));
		assert(gotOne.length < master.skills.length && gotOne.length > 0,
			'段5③④ ' + axis.label + ' の絞り込みが実際に効いている（全件でも0件でもない）', gotOne.length);

		// 例2: 2つ選ぶ（軸内OR。どちらも持たないものは、万能であっても出ない）
		const two = axis.opts.find((v) => v !== one);
		await tick(key, two);
		const gotTwo = await listedNames();
		const wantTwo = expectNames({ [key]: [one, two] });
		assert(eq(gotTwo.slice().sort(), wantTwo.slice().sort()),
			'段5③④ ' + axis.label + '＝' + one + '＋' + two + ' の結果が仕様どおり（' + wantTwo.length + '件）', gotTwo.length);
		assert(gotTwo.filter((n) => emptyNames.includes(n)).length === 0,
			'段5③④ 2つ選んでも、その軸のタグが空のスキルは出ない');
		assert(gotTwo.length > gotOne.length,
			'段5③④ 2つ目を足すと件数が増える（軸内ORが効いている）', { 1: gotOne.length, 2: gotTwo.length });
		await tick(key, two);
		await tick(key, one);
	}
	assert(await readCount() === POOL.length, '段5③④ チェックを全部外すと母集団の件数に戻る', await readCount());

	/* ==========================================================
	 * 段8 ―― 隠す軸（レース環境・レース場・パッシブ）
	 *
	 * **ここには 70セッション目・段5 の「⑤ オプトイン」と「決6」の2つの塊があった。**
	 * 71セッション目・段8 で **optIn（門番）の仕組みごと廃した**ので、検査も外した
	 * （黙って消さず、何をなぜ外したかをここに残す。恒久ルール20 と同じ扱い）。
	 *   - 外したもの: 「門番が効く組み合わせが実在する」「他の軸で絞るとオプトイン軸のタグを持つ
	 *     スキルが出ない」「明示的に選べば出てくる」「オプトイン軸単独でも絞れる」など計10項目
	 *   - なぜ: レース環境・レース場を**絞り込みから隠した**ので、そもそも選べない。
	 *     門番が働く前提（「その軸を明示的にチェックする」）が画面から無くなった。
	 * 代わりに、**隠れていること**と**母集団との関係**をここで見る。
	 * ========================================================== */
	console.log('\n--- 段8 隠す軸と母集団 ---');
	{
		// (1) 隠す軸は、タブにもパネルにもチェックボックスにも出ない
		for (const key of HIDDEN_AXES) {
			const found = await page.evaluate((k) => ({
				tab: !!document.querySelector('.usd-tab[data-usd-axis="' + k + '"]'),
				panel: !!document.querySelector('.usd-tabpanel[data-usd-axis="' + k + '"]'),
				checks: document.querySelectorAll('[data-usd-el="filter-check"][data-axis="' + k + '"]').length,
				custom: document.querySelectorAll('[data-usd-el="custom-tag"][data-axis="' + k + '"]').length,
			}), key);
			assert(!found.tab && !found.panel && found.checks === 0 && found.custom === 0,
				'段8: ' + key + ' は絞り込みにもカスタムスキル入力にも出ない', found);
		}
		// 出ている軸の数が pickableAxes() と合っている（隠したぶんだけ減っている）
		const shown = await page.evaluate(() => document.querySelectorAll('.usd-tab').length);
		assert(shown === uiAxes.length && shown === axes.length - HIDDEN_AXES.length,
			'段8: タブの数は 全軸 − 隠す軸', { タブ: shown, 全軸: axes.length, 隠す: HIDDEN_AXES.length });

		// (2) 隠しても、その軸のタグを持つスキルが母集団から消えるわけではない
		//     （**印を1つにまとめると、ここが落ちる**）
		const hiddenOnly = HIDDEN_AXES.filter((k) => !POOL_EXCLUDED_AXES.includes(k));
		const withHiddenTag = POOL.filter((s) => hiddenOnly.some((k) => axisValues(s, k).length > 0));
		const listedAll = new Set(await listedNames());
		const shownOfThem = withHiddenTag.filter((s) => listedAll.has(s.name));
		assert(shownOfThem.length === withHiddenTag.length,
			'段8: 隠す軸のタグを持っていても、パッシブでなければ一覧に出る',
			{ 該当: withHiddenTag.length, 出た: shownOfThem.length,
				出なかった: withHiddenTag.filter((s) => !listedAll.has(s.name)).map((s) => s.name).slice(0, 5) });

		// (3) 母集団から外す軸のスキルは、名前の索引からは引ける（段9 の入口が使う）
		const excludedSkills = await page.evaluate(() => UmaSkillDeckCore.getPoolExcludedSkills().map((s) => s.name));
		/* **74セッション目: 期待値に「タグ付きの拡張スキルのパッシブ」も足した。**
		   母集団と緑スキルの一覧は表と裏なので、母集団の材料を広げたらこちらも同じだけ広げる
		   （片方だけ直すと「どこからも選べないスキル」を見逃す）。 */
		const expectExcluded = master.skills.filter((s) => !inPool(s))
			.concat(CATALOG_TAGGED.filter((s) => !inPool(s))).map((s) => s.name);
		assert(eq(excludedSkills.slice().sort(), expectExcluded.slice().sort()),
			'段8: getPoolExcludedSkills() がパッシブ' + expectExcluded.length + '件をそのまま返す（段9 の一覧の母集団）',
			{ 製品: excludedSkills.length, 期待: expectExcluded.length });
		assert(excludedSkills.every((n) => !listedAll.has(n)),
			'段8: その67件は「条件で検索」の一覧には1件も出ていない');

		/* (4) **印を1つにまとめたら落ちる検査。**
		   いまのマスターでは、隠す軸にタグを持つスキルは**全部パッシブ**なので
		   （目覚め6種も決2 でパッシブに入った）、印をまとめて壊しても実データは何も変わらない。
		   ＝ (2) の検査は**いまは空振り**（該当0件）で、守りになっていない。
		   そこで「隠す軸のタグだけを持ち、パッシブではないもの」を**カスタムスキルとして仕込み**、
		   母集団に残ることを見る。**これは印の意味そのものの検査**で、データが変わっても効き続ける。 */
		const PROBE_ID = 'custom_hidden_axis_probe';
		const probe = await page.evaluate(([id, hiddenOnly]) => {
			const data = UmaSkillDeckCore.getUserData();
			const tags = {};
			UmaSkillDeckCore.TAG_AXES.forEach((a) => { tags[a.key] = []; });
			// 隠すだけの軸に、その軸の**最初の選択肢**を1つずつ入れる（値を検査に書かない）
			hiddenOnly.forEach((k) => {
				const axis = UmaSkillDeckCore.TAG_AXES.find((a) => a.key === k);
				tags[k] = [axis.options[0].v];
			});
			data.customSkills = (data.customSkills || []).filter((c) => c.customId !== id);
			data.customSkills.push({ customId: id, name: '隠す軸のタグだけを持つ検査用スキル', tags: tags, createdAt: new Date().toISOString() });
			UmaSkillDeckCore.replaceUserData(data);
			UmaSkillDeckCore.openSkillPicker([], () => {});
			return {
				name: '隠す軸のタグだけを持つ検査用スキル',
				tags: tags,
				出た: [...document.querySelectorAll('[data-usd-el="results"] .usd-row span')]
					.some((el) => el.textContent === '隠す軸のタグだけを持つ検査用スキル'),
			};
		}, [PROBE_ID, hiddenOnly]);
		assert(hiddenOnly.length > 0 && hiddenOnly.every((k) => probe.tags[k].length === 1),
			'段8: 仕込んだスキルは、隠すだけの軸にタグを持っている', { 軸: hiddenOnly, タグ: probe.tags });
		assert(probe.tags.passive.length === 0, '段8: 仕込んだスキルはパッシブではない', probe.tags.passive);
		assert(probe.出た === true,
			'段8: 隠す軸のタグだけを持つスキルは母集団に出る（印を1つにまとめたらここが落ちる）', probe);

		// 同じスキルにパッシブの印を足すと、今度は消える（poolExcluded 側が効いていることの裏取り）
		const probe2 = await page.evaluate((id) => {
			const data = UmaSkillDeckCore.getUserData();
			const c = data.customSkills.find((x) => x.customId === id);
			const axis = UmaSkillDeckCore.TAG_AXES.find((a) => a.poolExcluded);
			c.tags[axis.key] = [axis.options[0].v];
			UmaSkillDeckCore.replaceUserData(data);
			UmaSkillDeckCore.openSkillPicker([], () => {});
			return [...document.querySelectorAll('[data-usd-el="results"] .usd-row span')]
				.some((el) => el.textContent === '隠す軸のタグだけを持つ検査用スキル');
		}, PROBE_ID);
		assert(probe2 === false,
			'段8: 同じスキルにパッシブの印を足すと母集団から消える（母集団から外す側が効いている）', probe2);

		/* 72セッション目・段9 ―― **母集団から外したものは、必ず「緑スキルを追加」に出る。**
		   ここが成り立たないと、**どこからも選べないスキル**が生まれる。
		   いまのマスターでは実データで差が出ない（カスタムスキルにパッシブの印は付けられない
		   ＝段8 で隠す軸を手入力から外したため）ので、**上で仕込んだカスタムスキルで見る。**
		   段8 の時点では実際にここが抜けていて、この検査で見つかった。 */
		const probe3 = await page.evaluate((id) => {
			UmaSkillDeckCore.openPassiveSkillPicker([], () => {});
			const names = [...document.querySelectorAll('[data-usd-el="passive-results"] .usd-row span')]
				.map((el) => el.textContent);
			const c = UmaSkillDeckCore.getUserData().customSkills.find((x) => x.customId === id);
			return { listed: names.includes(c.name), fromHelper: UmaSkillDeckCore.getPoolExcludedSkills().some((s) => s.id === id) };
		}, PROBE_ID);
		assert(probe3.listed && probe3.fromHelper,
			'段9: 母集団から消えたスキルは「緑スキルを追加」の一覧に出る（どこからも選べないものを作らない）', probe3);
		await page.evaluate(() => UmaSkillDeckCore.closeSkillPicker());
		await page.waitForTimeout(200);

		// 後片付け（このあとの件数の検査に混ざらないよう必ず消す）
		await page.evaluate((id) => {
			const data = UmaSkillDeckCore.getUserData();
			data.customSkills = (data.customSkills || []).filter((c) => c.customId !== id);
			UmaSkillDeckCore.replaceUserData(data);
			UmaSkillDeckCore.openSkillPicker([], () => {});
		}, PROBE_ID);
		await page.waitForTimeout(300);
		assert(await readCount() === POOL.length, '段8: 検査用スキルを片付けると母集団の件数に戻る', await readCount());
	}

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
	/* 71セッション目・段8: 目覚め6種は**パッシブに入った**（決2）ので、
	   「条件で検索」の一覧には**並ばない**のが正しい姿になった。
	   タグがコピー元と一致していること（上の6項目）は変わらず見ている。 */
	const awakeListed = await page.evaluate((names) =>
		names.filter((n) => [...document.querySelectorAll('[data-usd-el="results"] .usd-row span')].some((el) => el.textContent === n)),
		AWAKENINGS.map(([n]) => n));
	assert(awakeListed.length === 0, '段8: 目覚め6件はパッシブなので一覧に並ばない', awakeListed);
	const awakeAllPassive = AWAKENINGS.map(([n]) => n)
		.filter((n) => (master.skills.find((s) => s.name === n).tags.passive || []).length === 0);
	assert(awakeAllPassive.length === 0, '段8: 目覚め6件はマスターでもパッシブ', awakeAllPassive);

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
	/* どちらも段2 で廃した値（2つとも同じ新値 debuff へ潰れる）。
	   **71セッション目・段8 で speed_up / power_up から替えた** ―― あちらの新値（stat_up）は
	   段8 で絞り込みの選択肢から外れたので、「読み替えた結果が絞り込みに出る」ことを確かめられない。 */
	const LEGACY_EFFECT = ['stamina_down', 'speed_down'];
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
		assert(allCount === POOL.length + 1,
			'②カスタムスキル1件を足したので母集団は ' + (POOL.length + 1) + '件', allCount);
		await tick('effect', seeded[0]);
		const hit = await listedNames();
		assert(hit.includes(LEGACY_NAME),
			'②旧値のままのカスタムスキルも、読み替え先の絞り込みに出る（読むときに読み替える）', hit.length);
		// マスター側の期待値（母集団から絞ったぶん）＋ 仕込んだカスタム1件
		const legacyExpect = expectNames({ effect: [seeded[0]] });
		assert((await readCount()) === legacyExpect.length + 1,
			'②その絞り込みは ' + legacyExpect.length + '件＋カスタム1件 の' + (legacyExpect.length + 1) + '件', await readCount());
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
