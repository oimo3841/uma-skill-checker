// スキルの進化（C-145・C-146）の検査。画面にはまだつながっていないので、core の関数を直接呼んで確かめる。
//
//   node tests/evolution/run-evolution-tests.mjs
//
// 見るもの:
//   §1 受け入れ: 進化スキルが findSkill で引ける／検索の範囲（条件で検索・名前を入れて探す）に出ない／
//      OCR・貼り付けの照合の辞書（buildSkillTextIndex）に入らない（辞書の件数は受け入れ前の基準と同じ）／照合しても結果に出ない
//   §2 既定の決定関数（computeEvolutionPlan）を表で回す（C-149: 既定を自動で選ぶのはレースを選んだときだけ）: 全衣装 × 主なレース条件で、決まり（上限・指定なし・id 昇順・Aで進化したらBの対象外・同じ入力は同じ出力）が成り立つ
//   §3 手書きの期待値（オルフェーヴルの君臨・睥睨と3つの進化先／トレセン軒の6組／合成データの上限）
//   §4 ex-1606（距離が範囲と根幹距離の両方を持つ行）は、範囲に当たれば合う（根幹距離は判定に使わない。C-148）
//   §6 手で変えた選択（choices）と確認済みの候補（bSeen）を効かせる（段4の保存・つなぎ込み）
//   §5 新しい勝負服（uma-0271。2026-10-13）の受け入れ: ①の衣装の選択に出る・進化の既定・イベントで得られるスキル
//   §7 進化先を選べる条件（C-152・2026-10-14）: 進化先自身がそのレースで使えるなら選べる（説明文の＜…＞と、全体にかかる距離の限定だけを見る）。
//      元の金スキルの条件・追加の効果の条件は見ない。気炎万丈（長距離）・時中の妙（長距離）と、洗い出した行の代表・全行で狭くならないこと
//   §8 衣装の小窓（C-153・2026-10-14）: 進化先がある金スキルの上に進化先、下に前段の白（進化 → └ 金 → └ 白）。進化先がない金スキル・覚醒Lv7・シナリオの進化は出さない
//
//   §11 選べない進化先の強調（2026-10-24・案G）: 選べなくしている条件の語だけを強調する位置（＜…＞のAND・OR・全体の距離・conditions）。§12 小窓: 無効のラジオ・強調の見た目・閉じるの貼り付き・コントラスト
//   §10 conditions（2026-10-21a〜・段1）: 進化先の「使える条件」（レース場・回り・季節・バ場状態）を読む。合わない→選べない・判定できない→選べるが既定にならない・all が空の21件は現行と同じ
//
// 件数の基準（受け入れ前に測った値）: 辞書 = マスター445 ＋ 追加カタログ747 = 1192
//   （追加カタログ747 = シナリオ因子24 ＋ 遺伝子10 ＋ 拡張スキル713。進化スキル639行は含めない）。
//   2026-10-12: 辞書1189（追加カタログ744）／2026-10-13（新衣装ドゥラメンテ）: 進化でない新スキル3件（固有・金・白）が増えて1192（追加カタログ747）。
// スキル名・衣装名は「手書きの期待値」にだけ id で書く（表の側は名前を持たない。恒久ルール1）。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer, REPO_ROOT } from '../visual/lib/serve.mjs';

let fails = 0;
function assert(cond, label, extra) {
	if (!cond) fails++;
	console.log((cond ? '[OK] ' : '[NG] ') + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
// 件数は「いまの data/ から数えた値」（受け入れのたびに手で付け替えない）。進化スキル（rarity が evolved）は辞書に入れない、が守るもの。
const BASELINE_MASTER = readJson('uma-skill-deck-skills.json').skills.length;
const EVOLVED_IN_PT = new Set(readJson('data/skill-pt.json').entries.filter((p) => p.rarity === 'evolved').map((p) => p.skillId));
const BASELINE_EXTRA_WITHOUT_EVOLVED = readJson('data/scenario-inheritance-factors.json').entries.length + readJson('data/aptitude-genes.json').entries.length
	+ readJson('data/extended-skills.json').entries.filter((e) => !EVOLVED_IN_PT.has(e.id)).length;
const BASELINE_TEXT_INDEX = BASELINE_MASTER + BASELINE_EXTRA_WITHOUT_EVOLVED;   // マスター ＋ 追加カタログ（進化スキルを除く）

const evolutions = readJson('data/skill-evolutions.json');
const umas = readJson('data/training-umamusume.json').entries;
const pt = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
const races = readJson('data/upcoming-races.json').races;
const evolvedIds = [...pt.values()].filter((e) => e.rarity === 'evolved').map((e) => e.skillId);
const scenarioBases = evolutions.entries.filter((e) => e.kind === 'scenario').map((e) => e.baseSkillId);
const ownGold = (u) => {
	const s = new Set();
	['initialSkills', 'awakeningSkills'].forEach((k) => (u[k] || []).forEach((row) => (row.skills || []).forEach((x) => { if (pt.get(x.skillId) && pt.get(x.skillId).rarity === 'gold') s.add(x.skillId); })));
	return [...s];
};
const umaInputs = umas.map((u) => ({ id: u.id, gold: ownGold(u) }));

const srv = await startServer();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(srv.base + '/uma-skill-deck.html', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => !!window.UmaSkillDeckCore && window.UmaSkillDeckCore.getMasterSkills().length > 0);

/* ───────── §1 受け入れ ───────── */
console.log('\n=== §1 受け入れ（進化スキルは引けるが、検索にも辞書にも出ない） ===');
const before = await page.evaluate(() => {
	const C = window.UmaSkillDeckCore;
	return { master: C.getMasterSkills().length, extra: C.getExtraCatalog().length, indexBeforeLoad: C.getSkillTextIndexSize(), evolvedKnownBeforeLoad: C.isEvolvedSkillId('ex-1608') };
});
assert(before.master === BASELINE_MASTER, 'マスターの件数が受け入れ前と同じ', before.master);
assert(before.extra === BASELINE_EXTRA_WITHOUT_EVOLVED + evolvedIds.length, '追加カタログ = 進化スキルを除く ' + BASELINE_EXTRA_WITHOUT_EVOLVED + ' + 進化スキル' + evolvedIds.length + '行', before.extra);
assert(before.evolvedKnownBeforeLoad === false, '進化の対応を読む前は、進化スキルを区別しない（ページの読み込みでは取りに行かない）');
await page.evaluate(() => window.UmaSkillDeckCore.loadSkillEvolutions());
const st = await page.evaluate((ids) => {
	const C = window.UmaSkillDeckCore;
	const names = ids.map((id) => (C.findSkill(id) || {}).name);
	// 結果に進化スキルの id が現れた行の数。1文字違いの別スキルが候補に出るのは構わない（進化スキル自身が当たらないことを見る）
	const rows = C.matchPastedSkillText(names.filter(Boolean).join('\n')).rows || [];
	const exact = rows.filter((r) => (r.matchedId && C.isEvolvedSkillId(r.matchedId)) || (r.candidates || []).some((c) => C.isEvolvedSkillId(c.id))).length;
	return {
		found: ids.filter((id) => !!C.findSkill(id)).length,
		allEvolved: ids.every((id) => C.isEvolvedSkillId(id)),
		indexAll: C.getSkillTextIndexSize(),
		indexSearchable: C.getSkillTextIndexSize({ searchableOnly: true }),
		matchedRows: exact,
		fragmentHits: names.slice(0, 40).filter((n) => C.findSkillsByNameFragment(n, { searchableOnly: true }).length > 0).length,
		raceDistanceKeyKept: C.findSkill('ex-1606').raceDistance
	};
}, evolvedIds);
assert(st.found === evolvedIds.length, 'findSkill で進化スキルの id が全部引ける（' + evolvedIds.length + '件）', st.found);
assert(st.allEvolved, '進化の対応を読むと、進化スキルとして区別できる');
assert(st.indexAll === BASELINE_TEXT_INDEX, 'OCR・貼り付けの照合の辞書の件数が受け入れ前と同じ（' + BASELINE_TEXT_INDEX + '件）', st.indexAll);
assert(st.matchedRows === 0, '進化スキルの名前を照合させても、進化スキルが結果に出ない（' + evolvedIds.length + '件を貼り付け）', st.matchedRows);
assert(st.fragmentHits === 0, '「名前を入れて探す」にも出ない（先頭40件）', st.fragmentHits);
assert(st.raceDistanceKeyKept && st.raceDistanceKeyKept.standardDistanceScope === 'part', 'ex-1606 の raceDistance が standardDistanceScope ごと core に届く', st.raceDistanceKeyKept);
// special の因子の辞書: 因子カテゴリだけ（進化スキルは extendedSkill）
const cat = await page.evaluate(() => { const C = window.UmaSkillDeckCore; return { sf: C.getCatalogEntries('scenarioFactor').length, ge: C.getCatalogEntries('geneFactor').length }; });
assert(cat.sf === 24 && cat.ge === 10, '因子の辞書の元（シナリオ因子24・遺伝子10）は変わらない', cat);

/* ───────── §2 表で回す ───────── */
console.log('\n=== §2 既定の決定関数を表で回す（全' + umas.length + '衣装 × 主なレース条件） ===');
// 進化先が使える条件は説明文の＜…＞から読む（C-152）ので、説明文も読んでおく
await page.evaluate(() => Promise.all([window.UmaSkillDeckCore.loadSkillEffectLevels(), window.UmaSkillDeckCore.loadSkillDescriptions()]));
const raceRows = races.map((r) => ({ id: r.id, venue: r.venue, surface: r.surface, distance: r.distance, distanceCategory: r.distanceCategory, direction: r.direction, course: r.course, season: r.season, weather: r.weather, ground: r.ground, time: r.time, rule: r.rule, name: r.name }));
// 試験用のレース（レースの一覧に頼らず、距離の区分・バ場・距離を決めて作る）
const mkRace = (id, d, surface) => ({ id: id, name: '試験用', venue: null, surface: surface, distance: d, distanceCategory: d <= 1400 ? 'short' : d <= 1800 ? 'mile' : d <= 2400 ? 'medium' : 'long', direction: null, course: null, season: null, weather: null, ground: null, time: null, rule: null });
const synthRaces = [];
[['short', 1200], ['mile', 1600], ['medium', 2000], ['long', 3000]].forEach(([c, d]) => ['turf', 'dirt'].forEach((s) => synthRaces.push(mkRace('t-' + c + '-' + s, d, s))));
const table = await page.evaluate(({ umaInputs, scenarioBases, raceRows, synthRaces }) => {
	const C = window.UmaSkillDeckCore;
	const cats = ['short', 'mile', 'medium', 'long'], styles = ['nige', 'senko', 'sashi', 'oikomi'], surfs = ['turf', 'dirt'];
	// レースを選んでいない条件（C-149: 距離・脚質・バ場を手で指定していても、すべて「進化しない」）
	const conds = [{ name: '指定なし', filter: {}, race: null }];
	cats.forEach((c) => conds.push({ name: '距離=' + c, filter: { distance: c }, race: null }));
	styles.forEach((s) => conds.push({ name: '脚質=' + s, filter: { style: s }, race: null }));
	surfs.forEach((s) => conds.push({ name: 'バ場=' + s, filter: { surface: s }, race: null }));
	cats.forEach((c) => styles.forEach((s) => surfs.forEach((f) => conds.push({ name: c + '/' + s + '/' + f, filter: { distance: c, style: s, surface: f }, race: null }))));
	const noRaceCount = conds.length;
	// レースを選んだ条件: 試験用のレース（距離4×バ場2）× 脚質（指定なし・4通り）＋ 実際のレース6件 × 脚質（指定なし・差し）
	const raceConds = [];
	synthRaces.forEach((r) => [null].concat(styles).forEach((s) => { const f = { distance: r.distanceCategory, surface: r.surface }; if (s) f.style = s; raceConds.push({ name: r.id + (s ? '＋' + s : ''), filter: f, race: r }); }));
	raceRows.forEach((r) => [null, 'sashi'].forEach((s) => { const f = {}; if (r.distanceCategory) f.distance = r.distanceCategory; if (r.surface) f.surface = r.surface; if (s) f.style = s; raceConds.push({ name: 'レース ' + r.id + (s ? '＋' + s : ''), filter: f, race: r }); }));
	conds.push(...raceConds);
	const viol = [];
	const v = (label, ctx) => { if (viol.length < 30) viol.push(label + ' ' + JSON.stringify(ctx)); };
	let plans = 0, withEvolve = 0, bangs = 0, noRacePlans = 0, maxA = 0, maxTotal = 0, invalids = 0, styleSkipped = 0;
	for (const u of umaInputs) {
		for (const variant of [0, 1]) {
			const takenIds = variant === 0 ? u.gold : u.gold.concat(scenarioBases);
			for (let ci = 0; ci < conds.length; ci++) {
				const cd = conds[ci];
				const args = { umaId: u.id, takenIds: takenIds, filter: cd.filter, race: cd.race };
				const p = C.computeEvolutionPlan(args);
				const p2 = C.computeEvolutionPlan(args);
				plans++;
				const where = { uma: u.id, cond: cd.name, variant: variant };
				if (JSON.stringify(p) !== JSON.stringify(p2)) v('同じ入力で出力が違う', where);
				if (p.slots.a !== u.gold.length) v('slots.a が衣装自身の金スキルの数と違う', Object.assign({ a: p.slots.a, gold: u.gold.length }, where));
				if (p.slots.max !== p.slots.a + 2) v('max が A の枠＋2 でない', where);
				if (p.count.a > p.slots.a) v('A の進化の数が枠を超えた', where);
				if (p.count.b > 2) v('B の進化の数が2を超えた', where);
				if (p.count.a + p.count.b > p.slots.max) v('合計が最大を超えた', where);
				if (p.specified !== !!cd.race) v('specified がレースを選んでいるかと違う', where);
				maxA = Math.max(maxA, p.count.a); maxTotal = Math.max(maxTotal, p.count.a + p.count.b);
				const aEvolved = new Set(p.a.filter((e) => e.default !== 'none' && e.default !== 'invalid').map((e) => e.baseId));
				p.b.entries.forEach((e) => { if (aEvolved.has(e.baseId)) v('A で進化した金スキルが B の対象にいる', Object.assign({ base: e.baseId }, where)); });
				p.a.forEach((e) => { if (takenIds.indexOf(e.baseId) === -1) v('取得しない金スキルが A にいる', where); });
				if (!cd.race) {
					noRacePlans++;
					if (Object.keys(p.defaultChoices).some((k) => p.defaultChoices[k] !== 'none')) v('レース未選択なのに「進化しない」以外がある', where);
					if (p.b.bang || p.b.candidates.length > 0 || p.b.defaults.length > 0) v('レース未選択なのに B の候補・「！」が出た', where);
					if (p.a.concat(p.b.entries).some((e) => e.default === 'invalid')) v('レース未選択なのに無効の行がある', where);
				}
				const asc = p.b.candidates.slice().sort(C.compareSkillIds);
				if (JSON.stringify(asc) !== JSON.stringify(p.b.candidates)) v('B の候補が id の昇順でない', where);
				if (JSON.stringify(p.b.defaults) !== JSON.stringify(p.b.candidates.slice(0, 2))) v('B の既定が id 昇順の先頭2つでない', where);
				if (p.b.bang !== (!!cd.race && p.b.candidates.length >= 3)) v('「！」の条件が違う', where);
				if (p.b.bang) bangs++;
				p.a.concat(p.b.entries).forEach((e) => {
					if (e.default === 'invalid') {
						invalids++;
						// C-152: 無効は「どの進化先も使えない」だけ（元の金スキルの条件は見ない）
						if (e.targets.some((t) => t.fit !== 'no')) v('無効なのに使える進化先がある', Object.assign({ base: e.baseId }, where));
					} else if (e.default !== 'none') {
						const t = e.targets.find((x) => x.id === e.default);
						if (!t || t.fit !== 'must') v('既定の進化先が「必ず合う」でない', Object.assign({ base: e.baseId, def: e.default }, where));
						// 脚質が未指定のとき、脚質の限定がある進化先を自動で選ばない
						const sk = C.getEvolutionUsage(e.default);   // 使える脚質（説明文の＜…＞。C-152）
						if (!cd.filter.style && ((sk.tags && sk.tags.style) || []).length > 0) v('脚質が未指定なのに、脚質の限定がある進化先が既定になった', Object.assign({ base: e.baseId, def: e.default }, where));
						withEvolve++;
					} else if (cd.race && !cd.filter.style && e.targets.some((t) => t.fit === 'must' && ((C.getEvolutionUsage(t.id).tags || {}).style || []).length > 0)) styleSkipped++;
				});
				p.b.entries.forEach((e) => { if (e.default !== 'none' && e.default !== 'invalid' && p.b.defaults.indexOf(e.baseId) === -1) v('B の既定の2つ以外が進化する', where); });
				p.b.entries.forEach((e) => { if (scenarioBases.indexOf(e.baseId) === -1) v('シナリオの6組にない金スキルが B の行にある', where); });
			}
		}
	}
	return { plans, conds: conds.length, noRaceCount, raceCount: raceConds.length, viol, withEvolve, bangs, noRacePlans, maxA, maxTotal, invalids, styleSkipped };
}, { umaInputs, scenarioBases, raceRows, synthRaces });
assert(table.viol.length === 0, '決まりに反する出力が0件（' + table.plans + '通り: ' + umas.length + '衣装 × ' + table.conds + '条件〔レース未選択 ' + table.noRaceCount + '・レース選択 ' + table.raceCount + '〕 × 2）', table.viol);
assert(table.noRacePlans > 0 && table.bangs > 0 && table.withEvolve > 0 && table.styleSkipped > 0, '表が空振りしていない（レース未選択・「！」・進化あり・脚質未指定で見送った進化先がある）', { レース未選択: table.noRacePlans, 感嘆符あり: table.bangs, 進化あり: table.withEvolve, 脚質未指定で見送り: table.styleSkipped, 無効: table.invalids });
assert(table.maxTotal <= 5 && table.maxA <= 3, '進化の合計は最大5・A は最大3', { maxTotal: table.maxTotal, maxA: table.maxA });
const lv7 = umaInputs.filter((u) => u.gold.length === 3).length;
console.log('       覚醒Lv7（金スキル3つ）の衣装: ' + lv7 + '／通常（2つ）: ' + umaInputs.filter((u) => u.gold.length === 2).length);
assert(umaInputs.every((u) => u.gold.length === 2 || u.gold.length === 3), 'すべての衣装の金スキルが2つか3つ');

/* ───────── §3 手書きの期待値 ───────── */
console.log('\n=== §3 手書きの期待値 ===');
const plan = (args) => page.evaluate((a) => window.UmaSkillDeckCore.computeEvolutionPlan(a), args);
const entry = (p, baseId) => p.a.concat(p.b.entries).find((e) => e.baseId === baseId);
const ORFE = 'uma-0241', KINRIN = 'ex-0470', HEIGEI = 'ex-0484';
const orfeGold = [KINRIN, HEIGEI];
const orfe = umas.find((u) => u.id === ORFE);
const race1 = raceRows.find((r) => r.id === 'race-0001');   // 京都・芝・2200m（中距離）
assert(!!orfe && ownGold(orfe).length === 2, 'オルフェーヴル総攬（' + ORFE + '）が金スキル2つを持つ（君臨・睥睨）');
{
	const p = await plan({ umaId: ORFE, takenIds: orfeGold, filter: {}, race: null });
	assert(!p.specified && entry(p, KINRIN).default === 'none' && entry(p, HEIGEI).default === 'none' && !p.b.bang, 'レース未選択・指定なし: 君臨・睥睨とも「進化しない」', p.defaultChoices);
}
{
	// C-149: レースを選んでいなければ、距離・脚質・バ場を指定していても自動では選ばない（進化先の分類は出る）
	const p = await plan({ umaId: ORFE, takenIds: orfeGold, filter: { distance: 'medium', style: 'oikomi', surface: 'turf' }, race: null });
	const k = entry(p, KINRIN), h = entry(p, HEIGEI);
	assert(k.default === 'none' && h.default === 'none' && p.count.a === 0 && !p.specified, 'レース未選択・中距離・追込・芝を手で指定: 全部「進化しない」（自動で選ばない）', p.defaultChoices);
	assert(k.targets[0].id === 'ex-1608' && k.targets[0].fit === 'may' && h.targets.every((t) => t.fit === 'must'), '（進化先の内部の分類は出る）君臨→2000m以上の進化先は区分だけでは「合うことがある」・睥睨の2つは「必ず合う」', { k: k.targets, h: h.targets });
}
{
	const p = await plan({ umaId: ORFE, takenIds: orfeGold, filter: { distance: 'medium', surface: 'turf', style: 'oikomi' }, race: race1 });
	const k = entry(p, KINRIN), h = entry(p, HEIGEI);
	assert(k.default === 'ex-1608' && k.targets[0].fit === 'must', '京都 芝2200m・追込: 君臨→ex-1608（2000m以上・追込・芝）が既定', k);
	assert(h.default === 'ex-1609', '京都 芝2200m・追込: 睥睨→中距離だけの進化先（ex-1609）を、中距離/長距離の進化先（ex-1610）より先に既定にする', h);
	assert(p.count.a === 2 && p.slots.a === 2 && p.slots.max === 4, '進化は2、枠は2、最大は4', { count: p.count, slots: p.slots });
}
{
	// 脚質が未指定のとき、脚質の限定がある進化先は自動では選ばない（選び直しでは選べる）
	const p = await plan({ umaId: ORFE, takenIds: orfeGold, filter: { distance: 'medium', surface: 'turf' }, race: race1 });
	const k = entry(p, KINRIN), h = entry(p, HEIGEI);
	assert(k.default === 'none' && k.targets[0].fit === 'must' && k.visible === true, '京都 芝2200m・脚質未指定: 君臨→追込の限定がある ex-1608 は自動では選ばない（行は出す・選び直しでは選べる）', k);
	assert(h.default === 'ex-1609' && p.count.a === 1, '睥睨→脚質の限定がない ex-1609 は既定になる', h);
}
{
	const p = await plan({ umaId: ORFE, takenIds: orfeGold, filter: { distance: 'medium', surface: 'turf', style: 'nige' }, race: race1 });
	const k = entry(p, KINRIN), h = entry(p, HEIGEI);
	assert(k.default === 'invalid' && k.baseFit === 'no' && k.targets.every((t) => t.fit === 'no'), '京都 芝2200m・逃げ: 君臨（追込）も進化先も合わないので無効', k);
	assert(h.default === 'ex-1609' && p.count.a === 1, '京都 芝2200m・逃げ: 睥睨は2つの進化先とも合い、中距離だけの ex-1609 が既定', h);
}
{
	// トレセン軒の6組。衣装なし（パターンAなし）。試験用のレースで見る
	const pairs = { 'ex-0029': 'ex-1038', 'ex-0183': 'ex-1034', 'ex-0616': 'ex-1037', 'ex-0645': 'ex-1036', 'ex-0657': 'ex-1039', 'ex-0668': 'ex-1035' };
	assert(JSON.stringify(Object.fromEntries(evolutions.entries.filter((e) => e.kind === 'scenario').map((e) => [e.baseSkillId, e.evolvedSkillIds[0]]))) === JSON.stringify(pairs), 'データのトレセン軒の6組が手書きの対応と一致（ギアチェンジ→秘伝の味変アレンジ！ほか）');
	const all = Object.keys(pairs);
	const key = await page.evaluate(() => window.UmaSkillDeckCore.getEvolutionScenarioKey());
	assert(key === 'トレセン軒', 'ツールが使うシナリオの鍵が取れる', key);
	const mile = mkRace('t-mile', 1600, 'turf'), medium = mkRace('t-medium', 2000, 'turf');
	const p0 = await plan({ umaId: '', takenIds: all, filter: {}, race: null });
	assert(p0.b.candidates.length === 0 && !p0.b.bang && Object.values(p0.defaultChoices).every((x) => x === 'none') && p0.b.entries.length === 6, 'レース未選択: 6組とも「進化しない」・「！」なし（行は6つある）');
	const pn0 = await plan({ umaId: '', takenIds: all, filter: { distance: 'mile' }, race: null });
	assert(pn0.b.candidates.length === 0 && !pn0.b.bang && Object.values(pn0.defaultChoices).every((x) => x === 'none'), 'レース未選択・マイルを手で指定: 候補なし・「！」なし（自動で選ばない）');
	const pm = await plan({ umaId: '', takenIds: all, filter: { distance: 'mile', surface: 'turf' }, race: mile });
	// C-152: ex-0616（時中の妙）→ex-1037（湯切りの妙技）は、説明文に＜…＞が無い（「中距離レースで」は追加の効果の条件）ので、マイルでも候補に入る
	assert(JSON.stringify(pm.b.candidates) === JSON.stringify(['ex-0029', 'ex-0183', 'ex-0616', 'ex-0657']) && pm.b.bang === true, 'マイル（1600m）のレース: 候補は ex-0029・ex-0183・ex-0616・ex-0657（id 昇順・3つ以上なので「！」）', pm.b.candidates);
	assert(JSON.stringify(pm.b.defaults) === JSON.stringify(['ex-0029', 'ex-0183']) && pm.defaultChoices['ex-0029'] === 'ex-1038' && pm.defaultChoices['ex-0183'] === 'ex-1034' && pm.defaultChoices['ex-0616'] === 'none' && pm.defaultChoices['ex-0657'] === 'none', 'マイル: 既定は id 昇順の先頭2つ（ex-0029→ex-1038・ex-0183→ex-1034）。3つ目以降の ex-0616・ex-0657 は「進化しない」', pm.defaultChoices);
	assert(entry(pm, 'ex-0645').default === 'invalid' && entry(pm, 'ex-0668').default === 'invalid', 'マイル: 進化先がマイルでは使えない（説明文の＜…＞に無い）2組は無効', pm.b.entries.map((e) => e.baseId + '=' + e.default));
	const pd = await plan({ umaId: '', takenIds: all, filter: { distance: 'medium', surface: 'turf' }, race: medium });
	assert(JSON.stringify(pd.b.candidates) === JSON.stringify(['ex-0183', 'ex-0616', 'ex-0645', 'ex-0668']) && pd.b.bang === true && JSON.stringify(pd.b.defaults) === JSON.stringify(['ex-0183', 'ex-0616']), '中距離（2000m）のレース: 候補4つ（id 昇順）・「！」・既定は先頭2つ', { c: pd.b.candidates, d: pd.b.defaults });
	const pn = await plan({ umaId: '', takenIds: ['ex-0029', 'ex-0183'], filter: { distance: 'mile', surface: 'turf' }, race: mile });
	assert(pn.b.candidates.length === 2 && !pn.b.bang && pn.count.b === 2, '候補が2つなら「！」は出ず、2つとも進化する');
	const pt2 = await plan({ umaId: '', takenIds: ['ex-0029'], filter: { distance: 'mile' }, race: mile, scenarioKey: '別のシナリオ' });
	assert(pt2.b.entries.length === 0, 'ほかのシナリオの鍵では、トレセン軒の行を使わない');
}
{
	// A で進化した金スキルは、B の対象外（衣装自身の金スキルがシナリオの6組にも入っている衣装を探す）
	const hit = umaInputs.find((u) => u.gold.some((g) => scenarioBases.includes(g)));
	if (!hit) console.log('[--] 衣装自身の金スキルがシナリオの6組にも入る衣装は無い（この確認は行わない。表の検査は通っている）');
	else {
		const both = hit.gold.filter((g) => scenarioBases.includes(g));
		const p = await plan({ umaId: hit.id, takenIds: hit.gold.concat(scenarioBases), filter: { distance: 'mile', surface: 'dirt', style: 'senko' }, race: mkRace('t-mile-dirt', 1600, 'dirt') });
		const aEvolved = p.a.filter((e) => e.default !== 'none' && e.default !== 'invalid').map((e) => e.baseId);
		const overlap = both.filter((g) => aEvolved.includes(g));
		assert(overlap.length > 0 && overlap.every((g) => !p.b.entries.some((e) => e.baseId === g)), 'A で進化した金スキルは B の行に出ない（' + hit.id + '。A 進化=' + aEvolved.join() + '・重なり=' + overlap.join() + '）');
	}
}
{
	// 合成データ: 上限（A 3つ・B 候補5つ）と、id の昇順の定義（数字 → ex-、整数で比べる）
	const synth = {
		entries: [
			{ kind: 'uma', umaId: 'u1', baseSkillId: 'ex-0470', evolvedSkillIds: ['ex-1609'] },
			{ kind: 'uma', umaId: 'u1', baseSkillId: 'ex-0484', evolvedSkillIds: ['ex-1610'] },
			{ kind: 'uma', umaId: 'u1', baseSkillId: 'ex-0616', evolvedSkillIds: ['ex-1037'] },
			...['ex-0029', 'ex-0183', 'ex-0645', 'ex-0657', 'ex-0668'].map((b, i) => ({ kind: 'scenario', scenarioId: 'S', baseSkillId: b, evolvedSkillIds: ['ex-1034'] }))
		]
	};
	const p = await plan({ umaId: 'u1', takenIds: ['ex-0470', 'ex-0484', 'ex-0616', 'ex-0029', 'ex-0183', 'ex-0645', 'ex-0657', 'ex-0668'], filter: { distance: 'medium', surface: 'turf' }, race: mkRace('t-medium', 2000, 'turf'), evolutions: synth, scenarioKey: 'S' });
	assert(p.slots.a === 3 && p.slots.max === 5, '合成: A の枠3・最大5', p.slots);
	assert(p.count.a <= 3 && p.count.b === 2 && p.count.a + p.count.b <= 5, '合成: A は枠まで・B は2つまで・合計は最大5まで', p.count);
	const ids = await page.evaluate(() => ['ex-1000', 'ex-0985', '12', 'ex-0100', '5', 'zz', 'ex-0002'].sort(window.UmaSkillDeckCore.compareSkillIds));
	assert(JSON.stringify(ids) === JSON.stringify(['5', '12', 'ex-0002', 'ex-0100', 'ex-0985', 'ex-1000', 'zz']), 'id の昇順: 数字の id が先・ex- は整数として比べる（ex-0985 < ex-1000）・その他は最後', ids);
}

/* ───────── §4 ex-1606 ───────── */
console.log('\n=== §4 ex-1606（距離は範囲と根幹距離の両方を持つ）: 範囲に当たれば合う。根幹距離は判定に使わない（C-148） ===');
{
	// ex-1606 = { min: 1600, max: 2500, standardDistance: true, scope: 'all', standardDistanceScope: 'part' }（脚質は追込。指定しなければ見ない）
	const r = await page.evaluate(() => {
		const C = window.UmaSkillDeckCore;
		const ev = { entries: [{ kind: 'scenario', scenarioId: 'S', baseSkillId: 'x', evolvedSkillIds: ['ex-1606'] }] };
		const fitOf = (filter, race) => { const p = C.computeEvolutionPlan({ umaId: '', takenIds: ['x'], filter, race, evolutions: ev, scenarioKey: 'S' }); return p.b.entries.length ? p.b.entries[0].targets[0].fit : '(行なし)'; };
		const catOf = (d) => (d <= 1400 ? 'short' : d <= 1800 ? 'mile' : d <= 2400 ? 'medium' : 'long');
		const byDistance = {};
		[1500, 1600, 1700, 1800, 1900, 2000, 2200, 2400, 2500, 2600, 3000].forEach((d) => { byDistance[d] = fitOf({ distance: catOf(d) }, { id: 'r', distance: d, distanceCategory: catOf(d) }); });
		const byCategory = {};
		['short', 'mile', 'medium', 'long'].forEach((c) => { byCategory[c] = fitOf({ distance: c }, null); });
		return { byDistance, byCategory, rdKeep: C.findSkill('ex-1606').raceDistance };
	});
	const D = r.byDistance;
	assert(D[2200] === 'must' && D[2500] === 'must', '2200m・2500m（範囲に当たる・根幹距離ではない）は「合う」', { 2200: D[2200], 2500: D[2500] });
	assert(D[1700] === 'must' && D[1800] === 'must', '1700m・1800m（範囲に当たる・根幹距離ではない）は「合う」', { 1700: D[1700], 1800: D[1800] });
	assert(D[2000] === 'must' && D[2400] === 'must' && D[1600] === 'must', '1600m・2000m・2400m（根幹距離）は「合う」', { 1600: D[1600], 2000: D[2000], 2400: D[2400] });
	assert(D[1500] === 'no' && D[2600] === 'no' && D[3000] === 'no', '1500m・2600m・3000m（範囲の外）は「合わない」', { 1500: D[1500], 2600: D[2600], 3000: D[3000] });
	assert(r.byCategory.short === 'no' && r.byCategory.mile === 'may' && r.byCategory.medium === 'must' && r.byCategory.long === 'may', '距離の区分だけの指定: 短距離＝合わない・マイル＝合うことがある（1500mが範囲の外）・中距離＝必ず合う（1900〜2400m がすべて範囲内）・長距離＝合うことがある（2500mだけ範囲内）', r.byCategory);
	assert(r.rdKeep && r.rdKeep.standardDistanceScope === 'part', 'ex-1606 の raceDistance の中身は変わっていない', r.rdKeep);
}

/* ───────── §5 新しい勝負服（uma-0271。2026-10-13）の受け入れ ───────── */
console.log('\n=== §5 新しい勝負服（uma-0271）: ①の衣装の選択に出る・進化の既定が決定関数どおり・イベントで得られるスキルが①の表に出る ===');
{
	// 手書きの期待値（id で書く）: 金スキル2つ（ex-0226・ex-1672）。進化先は ex-0226→ex-1675、ex-1672→ex-1676（どちらも説明文の条件は＜差し/追込＞。中距離は追加の効果の条件）
	// ex-0226 は差し、ex-1672 は追込の限定がある。イベントで得られるスキル: 一歩ずつ前へ（290）・むきだしの情熱（272）
	const NEW_UMA = 'uma-0271', G1 = 'ex-0226', G2 = 'ex-1672', E1 = 'ex-1675', E2 = 'ex-1676';
	const r = await page.evaluate(async ({ NEW_UMA, G1, G2 }) => {
		const C = window.UmaSkillDeckCore;
		await C.loadTrainingSources(false);
		const mk = (d, s) => ({ id: 't', name: 't', venue: null, surface: s, distance: d, distanceCategory: d <= 1400 ? 'short' : d <= 1800 ? 'mile' : d <= 2400 ? 'medium' : 'long' });
		const plan = (race, style, dist) => C.computeEvolutionPlan({ umaId: NEW_UMA, takenIds: [G1, G2], filter: { distance: dist, style: style, surface: race && race.surface }, race: race });
		const res = C.computeRosterSkills({ umaId: NEW_UMA, cardIds: [] }, {});
		return {
			listed: ((C.getTrainingSources().trainingUmamusume || {}).entries || []).some((u) => u.id === NEW_UMA),
			rows: C.getEvolutionRowsOfUma(NEW_UMA),
			none: plan(null, undefined, undefined).defaultChoices,
			medSashi: plan(mk(2000, 'turf'), 'sashi', 'medium'),
			medOikomi: plan(mk(2000, 'turf'), 'oikomi', 'medium').defaultChoices,
			medNoStyle: plan(mk(2000, 'turf'), undefined, 'medium').defaultChoices,
			mileSashi: plan(mk(1600, 'turf'), 'sashi', 'mile').defaultChoices,
			longOikomi: plan(mk(3000, 'turf'), 'oikomi', 'long').defaultChoices,
			eventSkills: res.sources.filter((s) => s.kind === 'umaEvent').map((s) => s.skillId),
			itemIds: res.items.map((i) => i.skillId)
		};
	}, { NEW_UMA, G1, G2 });
	assert(r.listed, '新しい勝負服が①の衣装の選択（育成ウマ娘の一覧）に出る');
	assert(JSON.stringify(r.rows) === JSON.stringify([{ baseSkillId: G1, evolvedSkillIds: [E1] }, { baseSkillId: G2, evolvedSkillIds: [E2] }]), '進化の行は2つ（ex-0226→ex-1675・ex-1672→ex-1676）', r.rows);
	assert(r.none[G1] === 'none' && r.none[G2] === 'none', 'レース未選択: 2つとも「進化しない」', r.none);
	assert(r.medSashi.defaultChoices[G1] === E1 && r.medSashi.defaultChoices[G2] === E2 && r.medSashi.count.a === 2 && r.medSashi.slots.a === 2 && r.medSashi.slots.max === 4,
		'中距離 芝2000m・差し: 2つとも進化先が既定（進化 2／最大4）', r.medSashi.count);
	assert(r.medOikomi[G1] === E1 && r.medOikomi[G2] === E2, '中距離 芝2000m・追込: 2つとも進化先が既定（進化先は差し/追込の両方に合う）', r.medOikomi);
	assert(r.medNoStyle[G1] === 'none' && r.medNoStyle[G2] === 'none', '中距離 芝2000m・脚質未指定: 脚質の限定がある進化先は自動では選ばない', r.medNoStyle);
	// C-152: 進化先の説明文の条件は＜差し/追込＞だけ（「中距離レースで」は追加の効果の条件）。元の金スキルの脚質（差し・追込）も見ない
	assert(r.mileSashi[G1] === E1 && r.mileSashi[G2] === E2, 'マイル 芝1600m・差し: 2つとも進化先が既定（進化先は＜差し/追込＞。中距離は追加の効果の条件・元の金スキルの脚質は見ない）', r.mileSashi);
	assert(r.longOikomi[G1] === E1 && r.longOikomi[G2] === E2, '長距離 芝3000m・追込: 2つとも進化先が既定', r.longOikomi);
	assert(r.eventSkills.includes('290') && r.eventSkills.includes('272'), '①の表に、イベントで得られるスキル（一歩ずつ前へ・むきだしの情熱）が出る', r.eventSkills);
	assert(r.itemIds.includes('290') && r.itemIds.includes('272'), '①の表の行にも入る', r.itemIds);
}

/* ───────── §6 手で変えた選択（choices）と確認済みの候補（bSeen） ───────── */
console.log('\n=== §6 手で変えた選択（choices）・確認済みの候補（bSeen）を効かせる ===');
{
	const mkRace = (id, d, surface) => ({ id: id, name: '試験用', venue: null, surface: surface, distance: d, distanceCategory: d <= 1400 ? 'short' : d <= 1800 ? 'mile' : d <= 2400 ? 'medium' : 'long', direction: null, course: null, season: null, weather: null, ground: null, time: null, rule: null });
	const r = await page.evaluate(({ ORFE, KINRIN, HEIGEI, mile, medium }) => {
		const C = window.UmaSkillDeckCore;
		const gold = [KINRIN, HEIGEI];
		const A = (choices, extra) => C.computeEvolutionPlan(Object.assign({ umaId: ORFE, takenIds: gold, filter: { distance: 'medium', surface: 'turf', style: 'oikomi' }, race: medium, choices: choices }, extra || {}));
		const six = ['ex-0029', 'ex-0183', 'ex-0616', 'ex-0645', 'ex-0657', 'ex-0668'];
		const B = (choices, extra) => C.computeEvolutionPlan(Object.assign({ umaId: '', takenIds: six, filter: { distance: 'mile', surface: 'turf' }, race: mile, choices: choices }, extra || {}));
		const frozen = Object.freeze({ [KINRIN]: 'none' });
		const out = {};
		out.def = A(undefined);
		out.noneKin = A(frozen);
		out.alt = A({ [HEIGEI]: 'ex-1610' });
		out.junk = A({ [KINRIN]: 'ex-9999', [HEIGEI]: 'ex-1608' });   // 進化先でないもの・別の行の進化先 → 無効（既定で表示）
		out.noRace = C.computeEvolutionPlan({ umaId: ORFE, takenIds: gold, filter: {}, race: null, choices: { [KINRIN]: 'ex-1608' } });
		out.bDef = B(undefined, { bSeen: ['ex-0029', 'ex-0183', 'ex-0616', 'ex-0657'] });   // マイルの候補は4つ（C-152 で ex-0616 が入った）
		out.bSeenDiff = B(undefined, { bSeen: ['ex-0029', 'ex-0183'] });
		out.bSeenNone = B(undefined);
		out.bOneOnly = B({ 'ex-0029': 'none', 'ex-0183': 'none', 'ex-0657': 'ex-1039' });
		out.bMissing = B({ 'ex-0657': 'ex-1039' });
		out.bAll3 = B({ 'ex-0029': 'ex-1038', 'ex-0183': 'ex-1034', 'ex-0657': 'ex-1039' });
		out.bNoRace = C.computeEvolutionPlan({ umaId: '', takenIds: six, filter: {}, race: null, choices: { 'ex-0029': 'ex-1038', 'ex-0616': 'ex-1037' }, bSeen: [] });
		out.bStale = B({ 'ex-0029': 'ex-1034' });   // 別の行の進化先（無効）
		// A で進化させた金スキルは B の対象外。A を「進化しない」にしたら B に出る（B の既定の候補に入る）
		out.frozenKept = JSON.stringify(frozen);
		return out;
	}, { ORFE, KINRIN, HEIGEI, mile: mkRace('t-mile', 1600, 'turf'), medium: mkRace('t-medium', 2000, 'turf') });
	const ent = (p, id) => p.a.concat(p.b.entries).find((e) => e.baseId === id);
	assert(r.def.choices[KINRIN] === 'ex-1608' && r.def.choices[HEIGEI] === 'ex-1609' && r.def.count.a === 2, '保存なし: choices は既定と同じ', r.def.choices);
	assert(r.noneKin.choices[KINRIN] === 'none' && ent(r.noneKin, KINRIN).stored === 'none' && r.noneKin.count.a === 1 && r.noneKin.choices[HEIGEI] === 'ex-1609', '保存「進化しない」: 既定より優先し、進化の数も減る', r.noneKin.count);
	assert(r.noneKin.defaultChoices[KINRIN] === 'ex-1608', '（既定の決定そのものは変わらない）', r.noneKin.defaultChoices);
	assert(r.alt.choices[HEIGEI] === 'ex-1610' && ent(r.alt, HEIGEI).stored === 'ex-1610', '保存の進化先（既定とは別の進化先）が有効なら、それを使う', r.alt.choices);
	assert(r.junk.choices[KINRIN] === 'ex-1608' && ent(r.junk, KINRIN).stored === null && r.junk.choices[HEIGEI] === 'ex-1609' && ent(r.junk, HEIGEI).stored === null, '無効な保存値（その行の進化先でない）は既定で表示する', r.junk.choices);
	assert(r.frozenKept === JSON.stringify({ [KINRIN]: 'none' }), '渡した保存値は書き換えない');
	assert(r.noRace.choices[KINRIN] === 'ex-1608' && r.noRace.defaultChoices[KINRIN] === 'none' && r.noRace.count.a === 1, 'レース未選択でも、手で選んだ進化先は有効（既定は「進化しない」のまま）', r.noRace.choices);
	assert(r.bDef.b.bang === true && r.bDef.b.alert === false, '候補の組が確認済みと同じなら「！」は出ない', r.bDef.b.candidates);
	assert(r.bSeenDiff.b.alert === true && r.bSeenNone.b.alert === true, '候補の組が違う・未確認なら「！」が出る');
	assert(r.bOneOnly.count.b === 1 && r.bOneOnly.choices['ex-0657'] === 'ex-1039' && r.bOneOnly.choices['ex-0029'] === 'none', 'B: 3つの候補のうち2つを外して1つだけ選べる（既定の2つは「進化しない」へ）', r.bOneOnly.choices);
	assert(r.bMissing.count.b === 2 && r.bMissing.choices['ex-0657'] === 'ex-1039' && r.bMissing.choices['ex-0183'] === 'none' && r.bMissing.choices['ex-0029'] === 'ex-1038', 'B: 保存が1つだけでも合計は2つまで（既定で決まったもののうち id の大きいほうから戻す）', r.bMissing.choices);
	assert(r.bAll3.count.b === 2 && r.bAll3.choices['ex-0657'] === 'none' && r.bAll3.choices['ex-0029'] === 'ex-1038' && r.bAll3.choices['ex-0183'] === 'ex-1034', 'B: 保存した選択が3つあっても2つまで（id の大きいほうから戻す）', r.bAll3.choices);
	assert(r.bNoRace.b.bang === false && r.bNoRace.b.alert === false && r.bNoRace.count.b === 2 && r.bNoRace.choices['ex-0029'] === 'ex-1038' && r.bNoRace.choices['ex-0616'] === 'ex-1037', 'B: レース未選択なら「！」は出ず、手で選んだものは有効', r.bNoRace.choices);
	assert(r.bStale.choices['ex-0029'] === 'ex-1038' && ent(r.bStale, 'ex-0029').stored === null, 'B: 別の行の進化先を指す保存値は無効（既定で表示）', r.bStale.choices);
}

/* ───────── §7 進化先を選べる条件（C-152・段4の修正3・4） ───────── */
console.log('\n=== §7 進化先を選べる条件: 進化先自身が使えるレースなら選べる（元の金スキルの条件・追加の効果の条件は見ない） ===');
{
	const r = await page.evaluate(async ({ evRows, distances }) => {
		const C = window.UmaSkillDeckCore;
		await Promise.all([C.loadSkillEvolutions(), C.loadSkillDescriptions(), C.loadTrainingSources(false)]);
		const cat = (d) => (d <= 1400 ? 'short' : d <= 1800 ? 'mile' : d <= 2400 ? 'medium' : 'long');
		const mk = (d, s) => ({ id: 't-' + d + '-' + s, name: '試験用', venue: null, surface: s, distance: d, distanceCategory: cat(d) });
		// 1行だけの進化の対応で、進化先の fit を見る（mode 'old' = 説明文を使わない＝変更前の進化先の判定。元の金スキルの判定は baseFit）
		const one = (base, target, race, style, mode) => {
			const f = { distance: race.distanceCategory, surface: race.surface }; if (style) f.style = style;
			const a = { umaId: '', takenIds: [base], filter: f, race: race, evolutions: { entries: [{ kind: 'scenario', scenarioId: 'S', baseSkillId: base, evolvedSkillIds: [target] }] }, scenarioKey: 'S' };
			if (mode === 'old') a.descOf = () => null;
			const e = C.computeEvolutionPlan(a).b.entries[0];
			return { fit: e.targets[0].fit, baseFit: e.baseFit, def: e.default };
		};
		const plan = (umaId, takenIds, race, style) => { const f = { distance: race.distanceCategory, surface: race.surface }; if (style) f.style = style; return C.computeEvolutionPlan({ umaId, takenIds, filter: f, race }); };
		const out = {};
		// 3: [Adamant Sovereign]シンボリルドルフ（uma-0269）の気炎万丈（ex-0354・＜中距離＞）→ 大望は煌めきとなりて（ex-1146・＜中距離/長距離＞。芝は追加の効果の条件）
		const long3000 = mk(3000, 'turf'), longDirt = mk(2500, 'dirt');
		const rudolf = (C.getTrainingSources().trainingUmamusume.entries.find((u) => u.id === 'uma-0269') || {});
		const p3 = plan('uma-0269', ['ex-0354', 'ex-0633'], long3000, undefined);
		out.rudolf = { found: !!rudolf.id, row: p3.a.find((e) => e.baseId === 'ex-0354') || null, choice: p3.choices['ex-0354'] };
		out.rudolfDirt = one('ex-0354', 'ex-1146', longDirt, 'sashi', 'new');
		out.rudolfOld = one('ex-0354', 'ex-1146', long3000, undefined, 'old');
		// ①の表: 長距離のレースでは気炎万丈（中距離）は絞り込みで隠れるが、進化させるので表に出す（行は進化先・Pt は元のまま数える）
		out.rudolfTable = C.getRosterVisiblePart({ umaId: 'uma-0269', cardIds: [null, null, null, null, null, null], race: long3000 });
		out.rudolfTableNone = C.getRosterVisiblePart({ umaId: 'uma-0269', cardIds: [null, null, null, null, null, null], race: long3000, evolutionChoices: { 'ex-0354': 'none' } });
		// 4: トレセン軒の時中の妙（ex-0616）→ 湯切りの妙技（ex-1037。＜…＞なし。「中距離レースで」は追加の効果の条件）。長距離でも選べる
		const p4 = C.computeEvolutionPlan({ umaId: '', takenIds: ['ex-0616'], filter: { distance: 'long', surface: 'turf' }, race: long3000 });
		out.jichu = { entry: p4.b.entries.find((e) => e.baseId === 'ex-0616') || null, candidates: p4.b.candidates, old: one('ex-0616', 'ex-1037', long3000, undefined, 'old') };
		// 進化先自身が使えないレースは、選べないまま（＜作戦・先行＞の飛び出せSheepy!〔ex-1105〕を差しで）
		out.senkoOnly = { sashi: one('ex-0075', 'ex-1105', mk(1600, 'turf'), 'sashi', 'new'), senko: one('ex-0075', 'ex-1105', mk(3000, 'turf'), 'senko', 'new') };
		// 元の金スキルと進化先の条件が重ならず、これまで一度も選べなかった行（灰の怪物 ex-1084 ←怪物 ex-0050。進化先は＜先行・マイル＞）
		out.never = { now: one('ex-0050', 'ex-1084', mk(1600, 'turf'), 'senko', 'new'), old: one('ex-0050', 'ex-1084', mk(1600, 'turf'), 'senko', 'old') };
		// 距離の限定がスキル全体にかかる（scope "all"）ものは使う（滄海を越えしフーガ ex-1051 は 2200m のレースだけ）
		out.all2200 = { d2200: one('ex-0016', 'ex-1051', mk(2200, 'turf'), 'nige', 'new').fit, d2000: one('ex-0016', 'ex-1051', mk(2000, 'turf'), 'nige', 'new').fit };
		// ＜…＞に分類できない語（＜大逃げ・長距離＞）: 距離だけ読み、脚質は限定しない（「いつでも選べる」側。印が付く）
		out.oonige = { usage: C.getEvolutionUsage('ex-1415'), sashiLong: one('ex-0336', 'ex-1415', mk(3000, 'turf'), 'sashi', 'new').fit, sashiMile: one('ex-0336', 'ex-1415', mk(1600, 'turf'), 'sashi', 'new').fit };
		// 条件の文（＜…＞をそのまま）: 気炎万丈の進化先・湯切りの妙技
		out.usage1146 = C.getEvolutionUsage('ex-1146');
		out.usage1037 = C.getEvolutionUsage('ex-1037');
		// 全行: 変更後に、変更前より選べる範囲が狭くなった条件が0（試験用のレース: 実在する距離 × バ場2 × 脚質5）
		const styles = [undefined, 'nige', 'senko', 'sashi', 'oikomi'];
		let narrowed = 0, widened = 0, rows = 0, cells = 0;
		const seen = new Set();
		evRows.forEach((row) => row.evolvedSkillIds.forEach((t) => {
			const k = row.baseSkillId + '>' + t; if (seen.has(k)) return; seen.add(k); rows++;
			let w = false;
			distances.forEach((d) => ['turf', 'dirt'].forEach((s) => styles.forEach((st) => {
				cells++;
				const race = mk(d, s);
				const b = one(row.baseSkillId, t, race, st, 'old'), a = one(row.baseSkillId, t, race, st, 'new');
				const before = b.baseFit === 'must' && b.fit !== 'no', after = a.fit !== 'no';
				if (before && !after) narrowed++;
				if (!before && after) w = true;
			})));
			if (w) widened++;
		}));
		out.sweep = { rows, cells, narrowed, widened };
		return out;
	}, { evRows: evolutions.entries, distances: readJson('data/race-distances.json').distances.map((d) => d.distance) });

	assert(r.rudolf.found && r.rudolf.row && r.rudolf.row.baseFit === 'no' && r.rudolf.row.targets[0].fit === 'must' && r.rudolf.choice === 'ex-1146',
		'修正3: シンボリルドルフ（uma-0269）・長距離 芝3000m: 気炎万丈（＜中距離＞）は元の条件に合わないが、進化先の大望は煌めきとなりて（＜中距離/長距離＞）を選べる・既定になる', r.rudolf);
	assert(r.rudolfOld.baseFit === 'no', '修正3:（変更前は、元の気炎万丈が長距離で合わず、①の表から隠れて進化の行が無かった）', r.rudolfOld);
	assert(r.rudolfDirt.fit === 'must', '修正3: 長距離のダート（2500m）・差しでも選べる（「中央の芝レースなら」は追加の効果の条件）', r.rudolfDirt);
	assert(r.rudolfTable.visibleIds.includes('ex-0354') && r.rudolfTable.takenIds.includes('ex-0354') && r.rudolfTable.evoChoices['ex-0354'] === 'ex-1146',
		'修正3: ①の表: 長距離のレースでも、進化させる気炎万丈は表に出て取得に数える（Pt は元の金スキル）', { vis: r.rudolfTable.visibleIds.includes('ex-0354'), ev: r.rudolfTable.evoChoices });
	assert(!r.rudolfTableNone.visibleIds.includes('ex-0354') && !r.rudolfTableNone.takenIds.includes('ex-0354'),
		'修正3: ①の表: 「進化しない」を選べば、これまでどおり絞り込みで隠れる', r.rudolfTableNone.evoChoices);
	assert(r.jichu.entry && r.jichu.entry.targets[0].fit === 'must' && r.jichu.candidates.includes('ex-0616') && r.jichu.old.fit === 'must',
		'修正4: 時中の妙→湯切りの妙技: 長距離 芝3000m でも選べる・候補に入る（2026-10-17 のタグ整備で、タグ自体から追加の効果の条件の語〔中距離〕が外れたので、説明文を読まない旧い経路〔old〕でも同じ）', { entry: r.jichu.entry, old: r.jichu.old });
	assert(r.senkoOnly.sashi.fit === 'no' && r.senkoOnly.senko.fit === 'must',
		'進化先自身が使えないレース: ＜作戦・先行＞の進化先は、差しでは選べない（先行なら距離に関係なく選べる）', r.senkoOnly);
	assert(r.never.now.fit === 'must' && !(r.never.old.baseFit === 'must' && r.never.old.fit !== 'no'),
		'これまで一度も選べなかった行: 灰の怪物（＜先行・マイル＞）←怪物: マイル・先行で選べる', r.never);
	assert(r.all2200.d2200 === 'must' && r.all2200.d2000 === 'no', '距離の限定がスキル全体にかかるもの（2200m のレースだけ）は使う: 2200m＝選べる・2000m＝選べない', r.all2200);
	assert(r.oonige.usage && r.oonige.usage.tags.distance.join() === 'long' && r.oonige.usage.tags.style.length === 0 && r.oonige.usage.ignored.some((x) => /^bracket:/.test(x))
		&& r.oonige.sashiLong === 'must' && r.oonige.sashiMile === 'no',
		'＜大逃げ・長距離＞: 分類できない語（大逃げ）は脚質を限定しない（「いつでも選べる」側・印あり）。長距離は使う', r.oonige);
	assert(r.usage1146 && r.usage1146.bracket === '＜中距離/長距離＞' && r.usage1146.tags.surface.length === 0 && !r.usage1146.ignored.includes('surface'),
		'条件の文は説明文の＜…＞のまま（大望は煌めきとなりて＝＜中距離/長距離＞）。芝は追加の効果の条件で、タグにも無い（2026-10-17 のタグ整備後は、タグの側で外してあるので「無視した」印も付かない）', r.usage1146);
	assert(r.usage1037 && r.usage1037.bracket === '' && r.usage1037.tags.distance.length === 0 && !r.usage1037.ignored.includes('distance'),
		'湯切りの妙技: 説明文に＜…＞が無いので条件の文なし・距離の限定なし（中距離のタグはタグの側で外してあるので、「無視した」印も付かない）', r.usage1037);
	assert(r.sweep.narrowed === 0 && r.sweep.widened > 0,
		'全' + r.sweep.rows + '行 × ' + (r.sweep.cells / r.sweep.rows) + '条件: 変更前より選べる範囲が狭くなった条件は0・広がった行は ' + r.sweep.widened + '行', r.sweep);
}

/* ───────── §8 衣装の小窓に、進化 → 金 → 白 の関係を出す（C-153） ───────── */
console.log('\n=== §8 衣装の小窓（育成ウマ娘のイベントの小窓）: 進化先がある金スキルの上に進化先（パターンAだけ・レースで絞らない）、下に前段の白 ===');
{
	const { openPage } = await import('../visual/lib/fixtures.mjs');
	const SCEN = readJson('data/scenario-event-skills.json');
	const step = new Map(readJson('data/skill-step-up.json').entries.map((e) => [e.skillId, e.prevSkillIds || []]));
	const whitesOf = (g) => (step.get(g) || []).filter((id) => pt.get(id) && pt.get(id).rarity === 'white');
	const longRace = races.find((r) => r.distanceCategory === 'long');
	// 衣装の小窓を開いて、取得できるスキルの行（id・種類・└ の段）を読む。evoDoc を渡すと skill-evolutions.json をその中身にする
	const popRows = async (umaId, evoDoc) => {
		const sp = await openPage(browser, srv.base, 'special.html', { width: 390, height: 844 }, { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] });
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCEN) }));
		if (evoDoc) await sp.page.route('**/data/skill-evolutions.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(evoDoc) }));
		await sp.page.evaluate((ro) => { localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(ro)); localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '0'); },
			{ rosterId: 'r', name: '', umaId, star: 3, awakeningLevel: 5, cardIds: [null, null, null, null, null, null], race: longRace });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForFunction(() => window.UmaSkillDeckCore.getEvolutionRowsOfUma !== undefined && !!document.querySelector('#deck-roster-panel [data-usd-el="events-btn"][data-member-key="0"]'), null, { timeout: 15000 });
		await sp.page.waitForTimeout(800);
		await sp.page.click('#deck-roster-panel [data-usd-el="events-btn"][data-member-key="0"]');
		await sp.page.waitForTimeout(400);
		const rows = await sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="info-pop"] [data-usd-el="ev-skills"] > li')].map((li) => ({ id: li.getAttribute('data-skill-id'), el: li.getAttribute('data-usd-el'), depth: li.getAttribute('data-usd-evo-depth'), gold: li.getAttribute('data-usd-gold') === '1', pt: (li.querySelector('[data-usd-el="ev-skill-pt"]') || {}).textContent || null })));
		const errs = sp.errors.filter((m) => !/Failed to load resource/.test(m));
		await sp.ctx.close();
		return { rows, errs };
	};
	const evoRowsOf = (umaId, doc) => (doc || evolutions).entries.filter((e) => e.kind === 'uma' && e.umaId === umaId);
	// 進化先がある金スキルごとに、[進化先…] → 金（└1）→ 前段の白のうち一覧にあるもの（└2）の順か
	const groupOk = (rows, umaId, doc) => evoRowsOf(umaId, doc).every((er) => {
		const gi = rows.findIndex((r) => r.id === er.baseSkillId && r.el === 'ev-skill');
		if (gi < 0) return true;   // 一覧に無い金スキルは対象外
		const n = er.evolvedSkillIds.length;
		const above = rows.slice(gi - n, gi);
		if (above.length !== n || above.some((r, i) => r.el !== 'ev-skill-evo' || r.id !== er.evolvedSkillIds[i] || r.pt !== 'Pt 不要')) return false;
		if (rows[gi].depth !== '1') return false;
		const ws = whitesOf(er.baseSkillId).filter((w) => rows.some((r) => r.id === w));
		return ws.every((w, i) => rows[gi + 1 + i] && rows[gi + 1 + i].id === w && rows[gi + 1 + i].depth === '2');
	});
	// シンボリルドルフ（uma-0269）: 気炎万丈 ex-0354 → 大望は煌めきとなりて ex-1146（＋前段の白 172）・熾烈の極み ex-0633 → ex-1147（＋白 284）。長距離のレースでも出す
	const r1 = await popRows('uma-0269');
	const ids1 = r1.rows.map((r) => r.id);
	assert(groupOk(r1.rows, 'uma-0269') && ids1.indexOf('ex-1146') === ids1.indexOf('ex-0354') - 1 && ids1.indexOf('ex-1147') === ids1.indexOf('ex-0633') - 1,
		'衣装の小窓（シンボリルドルフ・長距離のレース）: 大望は煌めきとなりて → └ 気炎万丈 → └ その前段の白、熾烈の極みの進化先も同じ形（レースの条件で絞らない・Pt 不要）', r1.rows.map((r) => r.id + (r.depth ? '/' + r.depth : '') + (r.el === 'ev-skill-evo' ? '(進化)' : '')));
	assert(r1.rows.filter((r) => r.el === 'ev-skill-evo').length === evoRowsOf('uma-0269').reduce((a, e) => a + e.evolvedSkillIds.length, 0), '衣装の小窓（シンボリルドルフ）: 進化先の行の数＝その衣装の進化先の数（' + evoRowsOf('uma-0269').reduce((a, e) => a + e.evolvedSkillIds.length, 0) + '）');
	// 進化先がない金スキル（進化の対応から気炎万丈の行を外したもの）では、進化先も「└」も出さず、前段の白も動かさない
	const cut = { entries: evolutions.entries.filter((e) => !(e.kind === 'uma' && e.umaId === 'uma-0269' && e.baseSkillId === 'ex-0354')) };
	const r2 = await popRows('uma-0269', cut);
	const ids2 = r2.rows.map((r) => r.id);
	const k = r2.rows.find((r) => r.id === 'ex-0354');
	// 気炎万丈の前段の白（172）は、これまでの並び（金スキルの直下ではない位置）のまま。熾烈の極みは進化先があるので、これまでどおり組になる
	assert(!!k && !k.depth && k.gold && ids2.indexOf('ex-1146') === -1 && ids2.indexOf('172') !== ids2.indexOf('ex-0354') + 1 && !r2.rows.find((r) => r.id === '172').depth && groupOk(r2.rows, 'uma-0269', cut),
		'進化先がない金スキル: 進化先も「└」も出さず、前段の白も金スキルの直下へ動かさない（これまでの並び。金の強調はそのまま）', { gold: k, ids: ids2 });
	// 覚醒Lv7（金スキル3つ）の衣装: 進化先がある金スキルのすべてに出す
	const lv7 = umas.filter((u) => evoRowsOf(u.id).length === 3);
	const r3 = await popRows(lv7[0].id);
	const golds3 = evoRowsOf(lv7[0].id).map((e) => e.baseSkillId).filter((g) => r3.rows.some((r) => r.id === g));
	assert(lv7.length === 6 && golds3.length === 3 && groupOk(r3.rows, lv7[0].id) && golds3.every((g) => r3.rows.find((r) => r.id === g).depth === '1'),
		'覚醒Lv7の衣装（' + lv7[0].id + '）: 金スキル3つのすべてに進化先と「└」が出る', r3.rows.map((r) => r.id + (r.depth ? '/' + r.depth : '') + (r.el === 'ev-skill-evo' ? '(進化)' : '')));
	// シナリオの進化（パターンB）は出さない: uma-0009 の金スキル ex-0029 は、衣装の進化（ex-1061）とシナリオの進化（ex-1038）の両方を持つ
	const bTargets = evolutions.entries.filter((e) => e.kind === 'scenario').flatMap((e) => e.evolvedSkillIds);
	const r4 = await popRows('uma-0009');
	const ids4 = r4.rows.map((r) => r.id);
	assert(ids4.indexOf('ex-1061') === ids4.indexOf('ex-0029') - 1 && !ids4.some((id) => bTargets.includes(id)) && groupOk(r4.rows, 'uma-0009'),
		'シナリオの進化は出さない: uma-0009 のギアチェンジ（ex-0029）の上は衣装の進化先（ex-1061）だけで、シナリオの進化先（ex-1038 など）は無い', ids4);
	assert([r1, r2, r3, r4].every((x) => x.errs.length === 0), '§8 コンソールのエラー0', [r1, r2, r3, r4].map((x) => x.errs.slice(0, 2)));
}

/* ───────── §9 要るスキル（2026-10-18・skill-requires.json。大逃げ） ───────── */
{
	console.log('\n=== §9要るスキル（大逃げを取得しているときだけ、＜大逃げ＞を持つ進化先 ex-1415 を選べる） ===');
	const reqs = readJson('data/skill-requires.json');
	assert(reqs.entries.length === 1 && reqs.entries[0].skillId === 'ex-1415' && reqs.entries[0].requiresSkillIds.join() === 'ex-0601', 'skill-requires.json は ex-1415 → ex-0601 の1行', reqs.entries);
	await page.evaluate(() => window.UmaSkillDeckCore.loadSkillEvolutions());
	const longTurf = mkRace('t-long-turf', 3000, 'turf');
	const rows9 = await page.evaluate(({ longTurf }) => {
		const C = window.UmaSkillDeckCore;
		const out = [];
		for (const acq of [true, false]) for (const style of ['nige', 'senko', '']) for (const withRace of [false, true]) {
			// 大逃げが「取得している」のは、取得の切り替えで取得し、かつ脚質の絞り込みに合う（逃げ以外を選ぶと外れる）とき
			const reqTaken = acq && style !== 'senko' ? ['ex-0336', 'ex-0601'] : ['ex-0336'];
			const args = { umaId: 'uma-0154', takenIds: ['ex-0336', 'ex-0601'], requireTakenIds: reqTaken, filter: style ? { style } : {}, race: withRace ? longTurf : null, choices: { 'ex-0336': 'ex-1415' } };
			const p = C.computeEvolutionPlan(args);
			const row = p.a.find((e) => e.baseId === 'ex-0336');
			const t = row.targets.find((x) => x.id === 'ex-1415');
			out.push({ acq, style, withRace, choice: p.choices['ex-0336'], def: row.default, missing: t.missing || null, visible: row.visible, fit: t.fit });
		}
		return out;
	}, { longTurf });
	const bad9 = rows9.filter((r) => {
		const ok = r.acq && r.style !== 'senko';
		if ((r.choice === 'ex-1415') !== ok) return true;                      // 手で選んだ ex-1415 が有効になるのは、要るスキルを取得しているときだけ
		if (!ok && JSON.stringify(r.missing) !== '["ex-0601"]') return true;   // 取得していないときは進化先に要るスキルの印
		if (ok && r.missing) return true;
		if (!r.visible) return true;                                           // 行（元の金スキル）はどの場合も出す
		if (r.withRace && ok && r.style === 'nige' && r.def !== 'ex-1415') return true;   // レース固定・逃げ・取得ありは既定でも進化する
		if (r.withRace && !ok && r.def === 'ex-1415') return true;
		return false;
	});
	assert(rows9.length === 12 && bad9.length === 0, '大逃げ 取得あり／なし × 脚質（逃げ・先行・指定なし）× レース（なし・長距離・芝）の12通りで、ex-0336 → ex-1415 の選べる・選べないが期待どおり', { n: rows9.length, bad9 });
	// 本文の追加の効果の条件に「大逃げ」を持つ4件は、大逃げの有無に関わらず同じ（ex-1658 は uma-0263 の ex-0524 の進化先）
	const k2 = await page.evaluate(() => {
		const C = window.UmaSkillDeckCore;
		const run = (req) => { const p = C.computeEvolutionPlan({ umaId: 'uma-0263', takenIds: ['ex-0524', 'ex-0601'], requireTakenIds: req, filter: {}, race: null, choices: { 'ex-0524': 'ex-1658' } }); const row = p.a.find((e) => e.baseId === 'ex-0524'); return { choice: p.choices['ex-0524'], targets: row.targets }; };
		return [run(['ex-0524', 'ex-0601']), run(['ex-0524'])];
	});
	assert(JSON.stringify(k2[0]) === JSON.stringify(k2[1]) && k2[0].choice === 'ex-1658' && k2[0].targets.every((x) => !x.missing), '大逃げ ex-1658（本文の条件に大逃げ）は、大逃げの取得の有無に関わらず選べて、要るスキルの印が付かない', k2);
	// 破壊確認: 要るスキルの表を空にして渡すと、取得なしでも選べてしまう（この表が落ちる）
	const broken = await page.evaluate(() => { const C = window.UmaSkillDeckCore; const p = C.computeEvolutionPlan({ umaId: 'uma-0154', takenIds: ['ex-0336'], requireTakenIds: ['ex-0336'], filter: {}, race: null, choices: { 'ex-0336': 'ex-1415' }, requires: new Map() }); return p.choices['ex-0336']; });
	assert(broken === 'ex-1415', '大逃げ 破壊確認: 要るスキルの表を空にすると、取得していなくても ex-1415 が選べる（§9 の期待が落ちる）', broken);
}

/* ───────── §10 進化先の conditions（2026-10-21a〜・段1。2026-10-24） ───────── */
{
	console.log('\n=== §10 conditions: 進化先の「使える条件」（レース場・回り・季節・バ場状態）を読む。合わない→選べない・判定できない→選べるが既定にならない・all が空は現行と同じ ===');
	await page.evaluate(() => window.UmaSkillDeckCore.loadSkillEvolutions());
	// 進化先ごとの行（先頭の1行）と conditions（スキル名は持たない。表の側は data/ から読む）
	const tgt = new Map();
	evolutions.entries.forEach((e) => e.evolvedSkillIds.forEach((id) => {
		if (!tgt.has(id)) tgt.set(id, { id, row: e, cond: null });
		if (e.conditions && e.conditions[id]) tgt.get(id).cond = e.conditions[id].all || {};
	}));
	const withCond = [...tgt.values()].filter((t) => t.cond !== null);
	const nonEmpty = withCond.filter((t) => Object.keys(t.cond).length > 0);
	const emptyAll = withCond.filter((t) => Object.keys(t.cond).length === 0);
	assert(nonEmpty.length === 17 && emptyAll.length === 21, 'conditions を持つ進化先は38件（all あり17・all が空21。2026-10-25a）', { nonEmpty: nonEmpty.length, emptyAll: emptyAll.length });
	const mk10 = (o) => Object.assign({ id: 'c', name: '試験用', venue: null, surface: 'turf', distance: 2000, distanceCategory: 'medium', direction: null, course: null, season: null, weather: null, ground: null, time: null, rule: null }, o);
	// 試験用のレース: 全部決まっている／各項目が決まっていない／場だけ違う、など
	const T10 = [
		mk10({ id: 'full-kyoto-r-aut-good', venue: 'track_kyoto', direction: 'right_turn', season: 'season_autumn', ground: 'ground_good' }),
		mk10({ id: 'full-tokyo-l-spr-bad', venue: 'track_tokyo', direction: 'left_turn', season: 'season_spring', ground: 'ground_bad' }),
		mk10({ id: 'full-nakayama-r-win-good', venue: 'track_nakayama', direction: 'right_turn', season: 'season_winter', ground: 'ground_good' }),
		mk10({ id: 'null-all' }),
		mk10({ id: 'venue-only-kyoto', venue: 'track_kyoto' }),
		mk10({ id: 'dir-only-left', direction: 'left_turn' }),
		mk10({ id: 'season-only-winter', season: 'season_winter' }),
		mk10({ id: 'ground-only-bad', ground: 'ground_bad' }),
		mk10({ id: 'dist-short', distance: 1200, distanceCategory: 'short' }),
		mk10({ id: 'dist-mile', distance: 1600, distanceCategory: 'mile' }),
		mk10({ id: 'dist-medium', distance: 2000, distanceCategory: 'medium' }),
		mk10({ id: 'dist-long', distance: 3000, distanceCategory: 'long' }),
		mk10({ id: 'dist-null', distance: null, distanceCategory: null })
	];
	const allRaces = raceRows.concat(T10);
	// 各進化先を「conditions あり」と「conditions なし」で、同じレースに対して判定する（元の金スキルを取得している前提・脚質の指定なし）
	const res10 = await page.evaluate(({ items, races }) => {
		const C = window.UmaSkillDeckCore;
		const run = (it, race, withCond) => {
			// 進化先ごとに独立に判定する（同じ行の別の進化先の conditions を混ぜない）
			const e = Object.assign({}, it.row, { evolvedSkillIds: [it.id] });
			delete e.conditions;
			if (withCond) e.conditions = { [it.id]: { all: it.cond } };
			const filter = {}; if (race.distanceCategory) filter.distance = race.distanceCategory; if (race.surface) filter.surface = race.surface;
			const doc = { entries: [e] };
			const p = C.computeEvolutionPlan({ umaId: it.row.umaId || 'u-x', takenIds: [it.row.baseSkillId], filter, race, evolutions: doc, scenarioKey: it.row.scenarioId || null });
			const row = p.a.concat(p.b.entries).find((x) => x.baseId === it.row.baseSkillId);
			const t = row && row.targets.find((x) => x.id === it.id);
			return { fit: t ? t.fit : 'absent', def: row ? row.default : 'absent', vis: row ? row.visible : false };
		};
		return items.map((it) => ({ id: it.id, per: races.map((r) => ({ race: r.id, now: run(it, r, false), nw: run(it, r, true) })) }));
	}, { items: nonEmpty.concat(emptyAll).map((t) => ({ id: t.id, row: t.row, cond: t.cond })), races: allRaces });
	// 期待の組み立て（conditions の定義そのもの。ok／ng／unknown）
	const GROUPS = { direction: ['left_turn', 'right_turn'], season: ['season_spring', 'season_summer', 'season_autumn', 'season_winter'], ground: ['ground_good', 'ground_bad'] };
	const verdict = (cond, race) => {
		let unknown = false;
		if ((cond.trackVenue || []).length) { if (!race.venue) unknown = true; else if (cond.trackVenue.indexOf(race.venue) === -1) return 'ng'; }
		if ((cond.distance || []).length) { if (!race.distanceCategory) unknown = true; else if (cond.distance.indexOf(race.distanceCategory) === -1) return 'ng'; }
		const env = cond.environment || [];
		for (const f of Object.keys(GROUPS)) { const sv = env.filter((x) => GROUPS[f].indexOf(x) !== -1); if (!sv.length) continue; if (!race[f]) unknown = true; else if (sv.indexOf(race[f]) === -1) return 'ng'; }
		return unknown ? 'unknown' : 'ok';
	};
	const condById = new Map(withCond.map((t) => [t.id, t.cond]));
	const bad10 = [], tally = { ok: 0, ng: 0, unknown: 0 };
	let emptySame = 0;
	res10.forEach((r) => {
		const cond = condById.get(r.id);
		const isEmpty = Object.keys(cond).length === 0;
		r.per.forEach((c) => {
			if (isEmpty) { if (JSON.stringify(c.now) === JSON.stringify(c.nw)) emptySame++; else bad10.push({ id: r.id, race: c.race, why: 'all が空なのに現行と違う', now: c.now, nw: c.nw }); return; }
			const race = allRaces.find((x) => x.id === c.race);
			const v = verdict(cond, race);
			tally[v]++;
			const exp = v === 'ng' ? 'no' : (v === 'unknown' && c.now.fit === 'must') ? 'may' : c.now.fit;
			if (c.nw.fit !== exp) bad10.push({ id: r.id, race: c.race, v, now: c.now.fit, nw: c.nw.fit, exp });
			// 既定は、fit が must のときだけ（unknown は既定にならない・ng は選べない）
			if (v !== 'ok' && c.nw.def === r.id) bad10.push({ id: r.id, race: c.race, v, why: 'ok でないのに既定になった', def: c.nw.def });
			if (v === 'ok' && c.nw.def !== c.now.def) bad10.push({ id: r.id, race: c.race, v, why: 'ok なのに既定が現行と違う', now: c.now.def, nw: c.nw.def });
		});
	});
	assert(bad10.length === 0, 'all あり17件 × ' + allRaces.length + 'レース: ng→選べない・unknown→選べるが既定にならない・ok→現行どおり（期待は conditions から組み立て）', bad10.slice(0, 8));
	assert(tally.ok > 0 && tally.ng > 0 && tally.unknown > 0, '表が空振りしていない（ok・ng・unknown のどれも当たる）', tally);
	assert(emptySame === emptyAll.length * allRaces.length, 'all が空の21件は、どのレースでも現行と同じ（' + emptySame + '通り）', emptySame);
	// 手書きの期待（id で書く）: 淀の祝福 ex-1227（京都）、右回りの輪舞曲 ex-1424（右回り）、荒磯好みの黄金船 ex-1091（道悪）
	const fitOf = (id, raceId) => res10.find((r) => r.id === id).per.find((c) => c.race === raceId).nw.fit;
	assert(fitOf('ex-1227', 'race-0001') === 'must' && fitOf('ex-1227', 'race-0003') === 'no' && fitOf('ex-1227', 'race-0004') === 'no' && fitOf('ex-1227', 'race-0007') === 'may', '淀の祝福（京都）: 京都のレース＝選べて既定／中山・東京（race-0004 は 2026-10-25a で東京と決まった）＝選べない／場が未公開（race-0007）＝選べるが既定にならない', [fitOf('ex-1227', 'race-0001'), fitOf('ex-1227', 'race-0003'), fitOf('ex-1227', 'race-0004'), fitOf('ex-1227', 'race-0007')]);
	assert(fitOf('ex-1424', 'race-0001') === 'must' && fitOf('ex-1424', 'dir-only-left') === 'no' && fitOf('ex-1424', 'null-all') === 'may', '右回りの輪舞曲（右回り）: 右回り＝選べる／左回り＝選べない／未公開＝選べるが既定にならない', [fitOf('ex-1424', 'race-0001'), fitOf('ex-1424', 'dir-only-left'), fitOf('ex-1424', 'null-all')]);
	assert(fitOf('ex-1091', 'ground-only-bad') === 'must' && fitOf('ex-1091', 'race-0001') === 'no' && fitOf('ex-1091', 'race-0002') === 'may', '荒磯好みの黄金船（道悪）: 道悪＝選べる／良＝選べない／バ場状態が未公開＝選べるが既定にならない', [fitOf('ex-1091', 'ground-only-bad'), fitOf('ex-1091', 'race-0001'), fitOf('ex-1091', 'race-0002')]);
	// 誠心たる光燿 ex-1607（距離＝マイル／中距離）: 短距離・長距離＝選べない／マイル・中距離＝現行のまま／距離が無い＝選べるが既定にならない
	const nowOf = (id, raceId) => res10.find((r) => r.id === id).per.find((c) => c.race === raceId).now.fit;
	assert(['dist-short', 'dist-long'].every((r) => fitOf('ex-1607', r) === 'no') && ['dist-mile', 'dist-medium'].every((r) => fitOf('ex-1607', r) === nowOf('ex-1607', r) && fitOf('ex-1607', r) !== 'no') && fitOf('ex-1607', 'dist-null') !== 'no' && fitOf('ex-1607', 'dist-null') !== 'must', '誠心たる光燿（距離＝マイル／中距離）: 短距離・長距離＝選べない／マイル・中距離＝現行のまま／距離が無い＝選べるが既定にならない', ['dist-short', 'dist-mile', 'dist-medium', 'dist-long', 'dist-null'].map((r) => [r, nowOf('ex-1607', r), fitOf('ex-1607', r)]));
	// ng と unknown が混ざるとき（京都 かつ 左回り の合成の条件。場が未公開で回りが右回り→ng を優先）
	const mix = await page.evaluate((races) => {
		const C = window.UmaSkillDeckCore;
		const doc = { entries: [{ kind: 'uma', umaId: 'u-x', baseSkillId: 'ex-0470', evolvedSkillIds: ['ex-1146'], conditions: { 'ex-1146': { all: { trackVenue: ['track_kyoto'], environment: ['left_turn'] } } } }] };
		const f = (race) => { const p = C.computeEvolutionPlan({ umaId: 'u-x', takenIds: ['ex-0470'], filter: { distance: 'long' }, race, evolutions: doc }); const t = p.a[0] && p.a[0].targets[0]; return t ? t.fit : 'absent'; };
		return { ngUnknown: f(races[0]), unknownOnly: f(races[1]), ok: f(races[2]) };
	}, [mk10({ id: 'm1', direction: 'right_turn', distanceCategory: 'long', distance: 3000 }), mk10({ id: 'm2', direction: 'left_turn', distanceCategory: 'long', distance: 3000 }), mk10({ id: 'm3', venue: 'track_kyoto', direction: 'left_turn', distanceCategory: 'long', distance: 3000 })]);
	assert(mix.ngUnknown === 'no' && mix.unknownOnly === 'may' && mix.ok === 'must', 'ng と unknown が混ざるときは ng を優先（場が未公開・右回り→選べない／場が未公開・左回り→may／両方合う→must）', mix);
	// ignored: conditions を持つ進化先は trackVenue・environment を ignored に入れない／all が空は今までどおり入れる
	const ign = await page.evaluate(({ a, b }) => {
		const C = window.UmaSkillDeckCore;
		const f = (id) => (C.getEvolutionUsage(id).ignored || []).filter((k) => k === 'trackVenue' || k === 'environment');
		return { withCond: a.map((id) => [id, f(id)]).filter(([, v]) => v.length > 0), empty: b.map((id) => [id, f(id)]).filter(([, v]) => v.length > 0).length };
	}, { a: nonEmpty.map((t) => t.id), b: emptyAll.map((t) => t.id) });
	assert(ign.withCond.length === 0 && ign.empty === emptyAll.length, 'ignored: conditions を持つ17件は trackVenue・environment を入れない／all が空の21件は今までどおり入れる', ign);
}

/* ───────── §11 選べない進化先の強調（2026-10-24・案G。core の getEvolutionNgMarks） ─────────
 * 選べない進化先（fit が no）は、選べなくしている条件の語だけを強調する（赤字＋点線の下線）。判定は変えない。
 * ここは core の返す「強調する位置」を見る。画面（ラジオの無効・強調の見た目・閉じるの貼り付き）は §12。 */
{
	console.log('\n=== §11 強調する語: ＜…＞（AND・OR）・全体の距離・conditions（説明文にある語・無いときは末尾に足す）。合う・判定できないときは強調しない ===');
	await page.evaluate(() => Promise.all([window.UmaSkillDeckCore.loadSkillEvolutions(), window.UmaSkillDeckCore.loadSkillDescriptions(), window.UmaSkillDeckCore.loadTrainingSources(false)]));
	const descOfId = new Map(readJson('data/skill-descriptions.json').entries.map((e) => [e.skillId, e.text]));
	const marksOf = (id, filter, race) => page.evaluate(({ id, filter, race }) => window.UmaSkillDeckCore.getEvolutionNgMarks(id, filter, race), { id, filter, race });
	// 強調された文字（ranges の部分）を取り出す
	const wordsIn = (text, ranges) => ranges.map(([s, e]) => text.slice(s, e));
	const mk11 = (o) => Object.assign({ id: 'c', name: '試験用', venue: null, surface: 'turf', distance: 2000, distanceCategory: 'medium', direction: null, course: null, season: null, weather: null, ground: null, time: null, rule: null }, o);
	const RACE_NONE = mk11({ id: 'none', surface: null, distance: null, distanceCategory: null });

	// (1) ＜…＞の語: 「/」（OR）は、その軸が合わないときだけすべて強調。「・」でつながる別の軸（AND）は、合わない軸の語だけ
	{
		// OR: ＜先行/差し＞（ex-1040）
		const or = async (style) => { const m = await marksOf('ex-1040', { style }, null); return { line: wordsIn(m.line, m.lineRanges), desc: wordsIn(m.desc, m.descRanges), app: m.appended }; };
		const orIn = await or('senko'), orIn2 = await or('sashi'), orOut = await or('nige'), orOut2 = await or('oikomi');
		assert(orIn.line.length === 0 && orIn.desc.length === 0 && orIn2.line.length === 0 && orIn2.desc.length === 0, 'OR ＜先行/差し＞: 脚質が先行・差しのときは強調しない', [orIn, orIn2]);
		assert([orOut, orOut2].every((o) => JSON.stringify(o.line) === JSON.stringify(['先行', '差し']) && JSON.stringify(o.desc) === JSON.stringify(['先行', '差し']) && o.app.length === 0), 'OR ＜先行/差し＞: 脚質が逃げ・追込のときは、グループの語をすべて強調する（＜…＞の行と説明文の末尾の＜…＞）', [orOut, orOut2]);
		// AND: ＜追込・芝＞（ex-1607。距離は conditions なので、ここでは距離を決めない）
		const and = async (style, surface) => { const m = await marksOf('ex-1607', { style, surface }, null); return wordsIn(m.line, m.lineRanges); };
		assert(JSON.stringify(await and('oikomi', 'turf')) === '[]' && JSON.stringify(await and('nige', 'turf')) === JSON.stringify(['追込']) && JSON.stringify(await and('oikomi', 'dirt')) === JSON.stringify(['芝']) && JSON.stringify(await and('nige', 'dirt')) === JSON.stringify(['追込', '芝']),
			'AND ＜追込・芝＞: 合わない語だけ強調（追込も芝も合う→無し／脚質だけ違う→追込／バ場だけ違う→芝／両方違う→両方）', [await and('oikomi', 'turf'), await and('nige', 'turf'), await and('oikomi', 'dirt'), await and('nige', 'dirt')]);
		// 距離（OR）と脚質（AND）の組み合わせ: ＜先行・長距離＞（ex-1121。conditions は京都レース場だけ）
		const kyoto = mk11({ id: 'k', venue: 'track_kyoto', distance: 3000, distanceCategory: 'long' });
		const m1 = await marksOf('ex-1121', { style: 'nige', distance: 'long' }, kyoto);
		assert(JSON.stringify(wordsIn(m1.line, m1.lineRanges)) === JSON.stringify(['先行']) && m1.appended.length === 0 && JSON.stringify(wordsIn(m1.desc, m1.descRanges)) === JSON.stringify(['先行']), '＜先行・長距離＞ 京都・長距離・逃げ: 先行だけ強調（京都レース場は合う・長距離も合う）', m1);
	}
	// (2) スキル全体の距離の限定（ex-1051 は 2200m だけ・ex-1147 は 2000m 以上）
	{
		const r = async (id, race, filter) => { const m = await marksOf(id, filter, race); return { line: wordsIn(m.line, m.lineRanges), desc: wordsIn(m.desc, m.descRanges) }; };
		const a1 = await r('ex-1051', mk11({ distance: 2000, distanceCategory: 'medium' }), { distance: 'medium', style: 'nige' });
		const a2 = await r('ex-1051', mk11({ distance: 2200, distanceCategory: 'medium' }), { distance: 'medium', style: 'nige' });
		assert(JSON.stringify(a1.line) === JSON.stringify(['2200m']) && JSON.stringify(a1.desc) === JSON.stringify(['2200m']), '全体の距離 2200m: 2000m のレースでは、行の「2200m」と説明文の「2200m」を強調', a1);
		assert(a2.line.length === 0 && a2.desc.length === 0, '全体の距離 2200m: 2200m のレースでは強調しない', a2);
		const b1 = await r('ex-1147', mk11({ distance: 1600, distanceCategory: 'mile' }), { distance: 'mile', style: 'senko' });
		const b2 = await r('ex-1147', mk11({ distance: 2400, distanceCategory: 'medium' }), { distance: 'medium', style: 'senko' });
		assert(JSON.stringify(b1.line) === JSON.stringify(['2000m以上']) && JSON.stringify(b1.desc) === JSON.stringify(['2000m以上']), '全体の距離 2000m以上: 1600m のレースでは「2000m以上」を強調（行と説明文）', b1);
		assert(b2.line.length === 0 && b2.desc.length === 0, '全体の距離 2000m以上: 2400m のレースでは強調しない', b2);
	}
	// (3) conditions（17件の all あり）: 合わない軸の値すべてを、説明文の中から探して強調する。判定の期待は §10 と同じ
	const withAll = [];
	evolutions.entries.forEach((e) => Object.keys(e.conditions || {}).forEach((id) => { const all = e.conditions[id].all || {}; if (Object.keys(all).length && !withAll.some((x) => x.id === id)) withAll.push({ id, all }); }));
	assert(withAll.length === 17, 'conditions で all を持つ進化先は17件', withAll.length);
	const T11 = [
		mk11({ id: 't-kyoto-r-aut-good', venue: 'track_kyoto', direction: 'right_turn', season: 'season_autumn', ground: 'ground_good', distance: 1600, distanceCategory: 'mile' }),
		mk11({ id: 't-tokyo-l-spr-bad', venue: 'track_tokyo', direction: 'left_turn', season: 'season_spring', ground: 'ground_bad', distance: 1200, distanceCategory: 'short' }),
		mk11({ id: 't-nakayama-win', venue: 'track_nakayama', direction: 'right_turn', season: 'season_winter', ground: 'ground_good', distance: 3000, distanceCategory: 'long' }),
		RACE_NONE,
		mk11({ id: 't-venue-only', venue: 'track_kyoto', distance: null, distanceCategory: null }),
		mk11({ id: 't-kyoto-2400', venue: 'track_kyoto', distance: 2400, distanceCategory: 'medium' }),
		mk11({ id: 't-tokyo-2400', venue: 'track_tokyo', distance: 2400, distanceCategory: 'medium' })
	];
	// スキル全体の距離の限定（raceDistance。scope all）を持つ進化先: conditions が合っていても、距離が合わなければその表記を強調する
	const RD_ALL = new Map(readJson('data/extended-skills.json').entries.filter((e) => e.raceDistance && e.raceDistance.scope === 'all').map((e) => [e.id, e.raceDistance]));
	const rdText11 = (rd) => (rd.min != null && rd.max != null ? (rd.min === rd.max ? rd.min + 'm' : rd.min + '〜' + rd.max + 'm') : rd.min != null ? rd.min + 'm以上' : rd.max + 'm以下');
	const WORDS = { trackVenue: { track_kyoto: ['京都レース場', '京都'], track_tokyo: ['東京レース場', '東京'], track_nakayama: ['中山レース場', '中山'] }, distance: { short: ['短距離'], mile: ['マイル'], medium: ['中距離'], long: ['長距離'] },
		env: { left_turn: ['左回り'], right_turn: ['右回り'], season_spring: ['春'], season_summer: ['夏'], season_autumn: ['秋'], season_winter: ['冬'], ground_good: ['良'], ground_bad: ['稍重', '重', '不良'] } };
	const FIELDS = { direction: ['left_turn', 'right_turn'], season: ['season_spring', 'season_summer', 'season_autumn', 'season_winter'], ground: ['ground_good', 'ground_bad'] };
	// 期待: 合わない軸の値の語（説明文にあるものだけ）。全体を通して、強調した語が許す語の集合に収まる・合う／判定できないときは無い
	const badMarks = [], tallyM = { ngCases: 0, okCases: 0 };
	const listing = new Map();   // id → { found: [語], appended: [語] }（報告用）
	for (const t of withAll) for (const race of T11) {
		const m = await marksOf(t.id, {}, race);
		// この race で ng になる軸（§10 と同じ定義。ここでは conditions と race から自分で組む）
		const ngWords = [];
		let ngAny = false;
		if ((t.all.trackVenue || []).length && race.venue && t.all.trackVenue.indexOf(race.venue) === -1) { ngAny = true; t.all.trackVenue.forEach((v) => ngWords.push(...(WORDS.trackVenue[v] || []))); }
		if ((t.all.distance || []).length && race.distanceCategory && t.all.distance.indexOf(race.distanceCategory) === -1) { ngAny = true; t.all.distance.forEach((v) => ngWords.push(...WORDS.distance[v])); }
		for (const f of Object.keys(FIELDS)) {
			const sv = (t.all.environment || []).filter((x) => FIELDS[f].indexOf(x) !== -1);
			if (sv.length && race[f] && sv.indexOf(race[f]) === -1) { ngAny = true; sv.forEach((v) => ngWords.push(...WORDS.env[v])); }
		}
		const rd = RD_ALL.get(t.id);
		if (rd && race.distance != null && !((rd.min == null || race.distance >= rd.min) && (rd.max == null || race.distance <= rd.max))) { ngAny = true; ngWords.push(rdText11(rd)); }
		const shown = wordsIn(m.desc, m.descRanges).concat(m.appended);
		if (!ngAny) { tallyM.okCases++; if (m.lineRanges.length || m.descRanges.length || m.appended.length) badMarks.push({ id: t.id, race: race.id, why: '合う・判定できないのに強調がある', m }); continue; }
		tallyM.ngCases++;
		if (shown.length === 0) badMarks.push({ id: t.id, race: race.id, why: '合わないのに強調が無い' });
		// 強調した語は、合わない軸の値の語（か、説明文に無いときに足した語）だけ
		const allowed = new Set(ngWords.concat(['道悪', '京都レース場', '東京レース場', '中山レース場']));
		shown.forEach((w) => { if (!allowed.has(w)) badMarks.push({ id: t.id, race: race.id, why: '許さない語を強調', w }); });
		// ＜…＞（末尾）は conditions の語では強調しない（距離の条件で＜…＞の語が混ざらないこと）
		const bm = m.desc.match(/＜[^＞]*＞/);
		if (bm && m.descRanges.some(([s]) => s >= bm.index)) { if (!(t.all.distance || []).length) badMarks.push({ id: t.id, race: race.id, why: '＜…＞の中を強調した（脚質・バ場・距離を決めていないのに）' }); }
		const rec = listing.get(t.id) || { found: new Set(), appended: new Set() };
		wordsIn(m.desc, m.descRanges).forEach((w) => rec.found.add(w)); m.appended.forEach((w) => rec.appended.add(w));
		listing.set(t.id, rec);
	}
	assert(badMarks.length === 0, 'all あり17件 × ' + T11.length + 'レース: 合わない軸の語だけ強調（合う・判定できない→強調なし／強調した語は合わない軸の値の語に収まる）', badMarks.slice(0, 6));
	assert(tallyM.ngCases > 0 && tallyM.okCases > 0, '表が空振りしていない（合わない・合うのどちらも当たる）', tallyM);
	// 手書きの期待（id で書く）
	const spec = async (id, race) => { const m = await marksOf(id, {}, race); return wordsIn(m.desc, m.descRanges).concat(m.appended.map((w) => '+' + w)); };
	assert(JSON.stringify(await spec('ex-1324', T11[1])) === JSON.stringify(['秋', '冬']), '秋か冬（ex-1324）: 春のレースでは「秋」「冬」をどちらも強調', await spec('ex-1324', T11[1]));
	assert(JSON.stringify(await spec('ex-1324', T11[2])) === '[]' && JSON.stringify(await spec('ex-1324', T11[0])) === '[]', '秋か冬（ex-1324）: 冬・秋のレースでは強調しない（選べる）', [await spec('ex-1324', T11[2]), await spec('ex-1324', T11[0])]);
	assert(JSON.stringify(await spec('ex-1091', T11[0])) === JSON.stringify(['稍重', '重', '不良']) && JSON.stringify(await spec('ex-1296', T11[0])) === JSON.stringify(['重', '不良']) && JSON.stringify(await spec('ex-1091', T11[1])) === '[]', '道悪（ex-1091「稍重」「重」「不良」・ex-1296「重」「不良」）: 良のレースでは説明文にある語だけ強調／道悪のレースでは強調しない', [await spec('ex-1091', T11[0]), await spec('ex-1296', T11[0]), await spec('ex-1091', T11[1])]);
	assert(JSON.stringify(await spec('ex-1607', T11[1])) === JSON.stringify(['マイル', '中距離']) && JSON.stringify(await spec('ex-1607', T11[2])) === JSON.stringify(['マイル', '中距離']) && JSON.stringify(await spec('ex-1607', T11[0])) === '[]', '距離（ex-1607 マイル／中距離）: 短距離・長距離では「マイル」「中距離」を強調／マイルでは強調しない', [await spec('ex-1607', T11[1]), await spec('ex-1607', T11[2]), await spec('ex-1607', T11[0])]);
	assert(JSON.stringify(await spec('ex-1446', T11[5])) === JSON.stringify(['東京']) && JSON.stringify(await spec('ex-1446', T11[6])) === '[]' && JSON.stringify(await spec('ex-1446', T11[1])) === JSON.stringify(['2400m']), '東京の2400m（ex-1446 「東京の2400mの…」。東京は conditions・2400m は全体の距離の限定）: 京都・2400m では「東京」／東京・2400m では強調しない／東京・1200m では「2400m」を強調', [await spec('ex-1446', T11[5]), await spec('ex-1446', T11[6]), await spec('ex-1446', T11[1])]);
	assert(JSON.stringify(await spec('ex-1227', T11[1])) === JSON.stringify(['京都レース場']) && JSON.stringify(await spec('ex-1227', T11[4])) === '[]', '京都（ex-1227 「京都レース場なら」）: 東京では「京都レース場」を強調／京都では強調しない', [await spec('ex-1227', T11[1]), await spec('ex-1227', T11[4])]);
	assert(JSON.stringify(await spec('ex-1049', T11[0])) === JSON.stringify(['左回り']) && JSON.stringify(await spec('ex-1424', T11[1])) === JSON.stringify(['右回り']), '回り（ex-1049 左回り・ex-1424 右回り）: 合わない回りの語を強調', [await spec('ex-1049', T11[0]), await spec('ex-1424', T11[1])]);
	// 判定できない（レース未選択・項目が未公開）は強調しない
	const un = await Promise.all(withAll.map((t) => marksOf(t.id, {}, null)));
	assert(un.every((m) => !m.lineRanges.length && !m.descRanges.length && !m.appended.length), 'レース未選択: all あり17件のどれも強調しない', un.filter((m) => m.descRanges.length).length);
	// 説明文に見つからない条件の語は、説明文の末尾に足す（実データの17件は、説明文を読んで一覧にして報告に出す）
	console.log('       [一覧] all あり17件で、合わないレースのときに強調された語（説明文で見つかった語／見つからず末尾に足す語）');
	withAll.forEach((t) => { const r = listing.get(t.id) || { found: new Set(), appended: new Set() }; console.log('       [一覧] ' + t.id + ' 条件=' + JSON.stringify(t.all) + ' 見つかった=' + JSON.stringify([...r.found]) + ' 末尾に足す=' + JSON.stringify([...r.appended])); });
	assert(withAll.every((t) => (listing.get(t.id) || { appended: new Set() }).appended.size === 0), 'all あり17件の実データ: 探す語はすべて説明文で見つかる（末尾に足す語は無い）', withAll.filter((t) => (listing.get(t.id) || { appended: new Set() }).appended.size > 0).map((t) => t.id));
	// 見つからない場合は、合成のデータ（説明文に京都が無い進化先に、京都の条件を付ける）で、末尾に足す語を確かめる
	{
		const doc = JSON.parse(JSON.stringify(evolutions));
		const row = doc.entries.find((e) => e.evolvedSkillIds.includes('ex-1536'));
		row.conditions = { 'ex-1536': { all: { trackVenue: ['track_kyoto'] } } };
		const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const p2 = await ctx2.newPage();
		await p2.route('**/data/skill-evolutions.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) }));
		await p2.goto(srv.base + '/uma-skill-deck.html', { waitUntil: 'networkidle', timeout: 60000 });
		await p2.waitForFunction(() => !!window.UmaSkillDeckCore && window.UmaSkillDeckCore.getMasterSkills().length > 0);
		await p2.evaluate(() => Promise.all([window.UmaSkillDeckCore.loadSkillEvolutions(), window.UmaSkillDeckCore.loadSkillDescriptions(), window.UmaSkillDeckCore.loadTrainingSources(false)]));
		const syn = await p2.evaluate((race) => window.UmaSkillDeckCore.getEvolutionNgMarks('ex-1536', {}, race), T11[1]);
		assert(syn.appended.length === 1 && syn.appended[0] === '京都レース場' && syn.descRanges.length === 0 && !/京都/.test(syn.desc), '説明文に無い条件の語は末尾に足す（合成: 説明文に京都が無い進化先に京都レース場の条件・東京のレース）', syn);
		await ctx2.close();
	}
}

/* ───────── §12 進化スキルの小窓（2026-10-24・案G）: 選べない進化先は無効・強調・閉じるの貼り付き・コントラスト ───────── */
{
	console.log('\n=== §12 小窓: 選べない進化先のラジオは無効（トーストなし）／選べるものは有効／「進化しない」は常に選べる／強調の見た目／閉じるが見える／コントラスト ===');
	const { openPage } = await import('../visual/lib/fixtures.mjs');
	const SCEN = readJson('data/scenario-event-skills.json');
	// 実データから編成を探す: 選べる進化先と選べない進化先が同じ行にある（mixed）・金スキル3つで3行とも出る（three）
	const found = await page.evaluate(async ({ races }) => {
		const C = window.UmaSkillDeckCore;
		await C.loadSkillEvolutions(); await C.loadTrainingSources(false); await C.loadSkillPtData(false); await C.loadSkillEffectLevels(); await C.loadSkillDescriptions();
		const out = { mixed: null, three: null };
		for (const u of ((C.getTrainingSources().trainingUmamusume || {}).entries || [])) {
			const rows = C.getEvolutionRowsOfUma(u.id);
			if (rows.length === 0) continue;
			const res = C.computeRosterSkills({ umaId: u.id, cardIds: [] }, {});
			for (const race of races) for (const style of ['nige', 'senko', 'sashi', 'oikomi']) {
				const pl = C.computeEvolutionPlan({ umaId: u.id, takenIds: res.skillIds, filter: { distance: race.distanceCategory, surface: race.surface, style }, race });
				const vis = pl.a.filter((e) => e.choice !== 'invalid');
				if (!out.three && rows.length === 3 && vis.length === 3) out.three = { id: u.id, race: race.id, style };
				if (!out.mixed && vis.some((e) => e.targets.some((t) => t.fit === 'no') && e.targets.some((t) => t.fit !== 'no'))) out.mixed = { id: u.id, race: race.id, style };
			}
			if (out.mixed && out.three) break;
		}
		return out;
	}, { races });
	assert(!!found.mixed && !!found.three, '編成が見つかる（選べる・選べない進化先が混ざる行／金スキル3つで3行とも出る行）', found);
	const raceOf11 = (id) => races.find((r) => r.id === id);
	const open12 = async (sc, scheme, size) => {
		const sp = await openPage(browser, srv.base, 'special.html', size, { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] });
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCEN) }));
		await sp.page.emulateMedia({ colorScheme: scheme });
		await sp.page.evaluate(({ ro, scheme }) => { localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(ro)); localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '0'); localStorage.setItem('uma-tools-theme', scheme); }, { ro: { rosterId: 'r', name: '', umaId: sc.id, star: 3, awakeningLevel: 5, cardIds: [null, null, null, null, null, null], race: raceOf11(sc.race), skillFilter: { style: sc.style } }, scheme });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector('[data-usd-el="evo-btn"]', { state: 'visible', timeout: 15000 });
		await sp.page.waitForTimeout(500);
		await sp.page.click('[data-usd-el="evo-btn"]');
		await sp.page.waitForSelector('.usd-info-pop [data-usd-el="evo-sheet"]', { state: 'visible' });
		await sp.page.waitForTimeout(400);
		return sp;
	};
	const NG_SR = '（現在の条件に合いません）';
	const lumOf = (rgb) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
	const ratio = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const rgbOf = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
	for (const scheme of ['light', 'dark']) {
		const sp = await open12(found.mixed, scheme, { width: 390, height: 844 });
		const info = await sp.page.evaluate(() => {
			const rows = [...document.querySelectorAll('.usd-info-pop [data-usd-el="evo-target"]')];
			const cs = (el, k) => getComputedStyle(el)[k];
			return {
				rows: rows.map((r) => ({ v: r.getAttribute('data-evo-value'), ng: r.hasAttribute('data-evo-ng'), disabled: r.querySelector('input').disabled, pe: cs(r, 'pointerEvents'), cls: r.className, checked: r.querySelector('input').checked, radio: r.querySelector('input').getBoundingClientRect().width,
					name: cs(r.querySelector('.usd-evo-name'), 'fontSize') + '/' + cs(r.querySelector('.usd-evo-name'), 'fontWeight'), sub: (r.querySelector('.usd-evo-sub') ? cs(r.querySelector('.usd-evo-sub'), 'fontSize') : null), desc: r.querySelector('.usd-evo-desc') ? cs(r.querySelector('.usd-evo-desc'), 'fontSize') + '/' + cs(r.querySelector('.usd-evo-desc'), 'lineHeight') : null,
					descText: r.querySelector('.usd-evo-desc') ? r.querySelector('.usd-evo-desc').textContent : '', subText: r.querySelector('.usd-evo-sub') ? r.querySelector('.usd-evo-sub').textContent : '',
					marks: [...r.querySelectorAll('[data-usd-el="evo-ng"]')].map((m) => ({ t: m.textContent, color: cs(m, 'color'), deco: cs(m, 'textDecorationLine') + '/' + cs(m, 'textDecorationStyle'), thick: cs(m, 'textDecorationThickness'), off: cs(m, 'textUnderlineOffset'), weight: cs(m, 'fontWeight'), next: m.nextElementSibling ? m.nextElementSibling.textContent : null })),
					bg: cs(r, 'backgroundColor'), nameColor: cs(r.querySelector('.usd-evo-name'), 'color'), subColor: r.querySelector('.usd-evo-sub') ? cs(r.querySelector('.usd-evo-sub'), 'color') : null, descColor: r.querySelector('.usd-evo-desc') ? cs(r.querySelector('.usd-evo-desc'), 'color') : null })),
				nones: [...document.querySelectorAll('.usd-info-pop [data-usd-el="evo-none"]')].map((r) => ({ disabled: r.querySelector('input').disabled, h: Math.round(r.getBoundingClientRect().height), radio: r.querySelector('input').getBoundingClientRect().width })),
				arrow: !!document.querySelector('.usd-info-pop .usd-evo-arrow'), arrowText: document.querySelector('.usd-info-pop').textContent.includes('▼'),
				head: Math.round(document.querySelector('.usd-info-pop .uma-popover-head').getBoundingClientRect().height), title: getComputedStyle(document.querySelector('.usd-info-pop .uma-popover-title')).fontSize + '/' + getComputedStyle(document.querySelector('.usd-info-pop .uma-popover-title')).fontWeight,
				closeX: (() => { const r = document.querySelector('.usd-info-pop .uma-popover-close').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
				closeH: Math.round(document.querySelector('[data-usd-el="evo-close"]').getBoundingClientRect().height), closeHit: (() => { const b = document.querySelector('[data-usd-el="evo-close"]'); const r = b.getBoundingClientRect(); const a = getComputedStyle(b, '::after'); return { ph: parseFloat(a.height) || 0, top: parseFloat(a.top) }; })(),
				overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, base: (() => { const b = document.querySelector('.usd-info-pop .usd-evo-base'); const n = b.querySelector('.usd-evo-name'); return { h: Math.round(b.getBoundingClientRect().height), name: getComputedStyle(n).fontSize + '/' + getComputedStyle(n).fontWeight, barW: getComputedStyle(b).borderLeftWidth }; })()
			};
		});
		const L = scheme === 'light' ? 'ライト' : 'ダーク';
		const off = info.rows.filter((r) => r.ng), on = info.rows.filter((r) => !r.ng);
		assert(off.length > 0 && on.length > 0, L + ': 選べる進化先と選べない進化先が混ざる行がある', { off: off.length, on: on.length });
		assert(off.every((r) => r.disabled && r.pe === 'none' && /usd-evo-target--off/.test(r.cls) && !r.checked), L + ': 選べない進化先は、ラジオが無効（disabled）・行全体が押せない（pointer-events: none）・選ばれていない', off.map((r) => [r.v, r.disabled, r.pe]));
		assert(on.every((r) => !r.disabled && r.pe !== 'none'), L + ': 選べる進化先は無効でない・押せる', on.map((r) => [r.v, r.disabled, r.pe]));
		assert(info.nones.length > 0 && info.nones.every((n) => !n.disabled && n.h >= 28 && n.h <= 32 && n.radio === 16), L + ': 「進化しない」は常に選べる（無効でない）・1行（約30px）・ラジオ16px', info.nones);
		assert(info.rows.every((r) => r.radio === 16 && r.name === '13px/500' && (r.sub === null || r.sub === '11px') && /^11\.5px\//.test(r.desc || '11.5px/') && Math.abs(parseFloat((r.desc || '11.5px/16.675px').split('/')[1]) / 11.5 - 1.45) < 0.02), L + ': 進化先の行: ラジオ16px・名前13px/500・＜…＞11px・説明文11.5px（行間1.45）', info.rows.map((r) => [r.radio, r.name, r.sub, r.desc]));
		assert(info.rows.every((r) => r.descText.length > 0), L + ': すべての進化先で、説明文の全文を出す（選べる行・選べない行とも）', info.rows.map((r) => r.descText.length));
		assert(!info.arrow && !info.arrowText, L + ': ▼▼▼は出さない', info.arrowText);
		assert(info.head <= 36 && info.title === '14px/500' && info.closeX.w === 44 && info.closeX.h === 44, L + ': 見出しの高さ36px以下・タイトル14px/500・×の押せる範囲は44px', { head: info.head, title: info.title, closeX: info.closeX });
		assert(info.closeH === 32 && info.closeHit.ph + 2 >= 44, L + ': 閉じるは見た目の高さ32px・押せる範囲は44px', { h: info.closeH, hit: info.closeHit });
		assert(info.base.h >= 26 && info.base.h <= 30 && info.base.name === '13px/500' && info.base.barW === '4px', L + ': 金スキルの見出し: 名前13px/500・左4pxの縦バー', info.base);
		// 強調: 選べない進化先のどれかに、強調された語がある。見た目は赤字＋点線の下線（1.5px・offset 3px・500まで）。直後に画面に出さない文字
		const marks = off.flatMap((r) => r.marks);
		assert(marks.length > 0 && marks.every((m) => /underline/.test(m.deco) && /dotted/.test(m.deco) && m.thick === '1.5px' && m.off === '3px' && Number(m.weight) <= 500 && m.next === NG_SR), L + ': 強調は赤字＋点線の下線（1.5px・offset 3px・weight 500まで）・直後に画面に出さない文字', marks.slice(0, 3));
		assert(on.every((r) => r.marks.length === 0), L + ': 選べる進化先には強調が無い', on.map((r) => r.marks.length));
		// コントラスト（実際に描かれた色）: 無効行の名前・＜…＞・説明文・赤字の語 が、行の地の上で 4.5 以上
		const ratios = [];
		off.forEach((r) => { const bg = rgbOf(r.bg); [r.nameColor, r.subColor, r.descColor].filter(Boolean).forEach((c) => ratios.push(ratio(rgbOf(c), bg))); r.marks.forEach((m) => ratios.push(ratio(rgbOf(m.color), bg))); });
		assert(ratios.length > 0 && ratios.every((x) => x >= 4.5), L + ': 無効行の名前・＜…＞・説明文・赤字の語の文字と地のコントラストが 4.5 以上（最小 ' + Math.min(...ratios).toFixed(2) + '）', ratios.map((x) => Math.round(x * 100) / 100));
		assert(!info.overflowX, L + ': 横スクロールなし');
		// 押せない: 選べない行の位置をクリックしても、選ばれず・トーストも出ない。選べる行・進化しないは押せる
		const before = await sp.page.evaluate(() => [...document.querySelectorAll('.usd-info-pop [data-usd-el="evo-target"] input, .usd-info-pop [data-usd-el="evo-none"] input')].map((i) => i.checked).join());
		const box = await sp.page.locator('.usd-info-pop [data-evo-ng="1"]').first().boundingBox();
		await sp.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await sp.page.waitForTimeout(500);
		const after = await sp.page.evaluate(() => ({ checks: [...document.querySelectorAll('.usd-info-pop [data-usd-el="evo-target"] input, .usd-info-pop [data-usd-el="evo-none"] input')].map((i) => i.checked).join(), body: document.body.innerText.includes('では選べません'), open: !!document.querySelector('.usd-info-pop:not([hidden])') }));
		assert(after.checks === before && !after.body && after.open, L + ': 選べない行を押しても選ばれず、理由のトースト（「…では選べません」）も出ない', { before, after });
		// 進化しないは押せる（元のスキルが戻る）
		await sp.page.click('.usd-info-pop [data-usd-el="evo-none"]');
		await sp.page.waitForTimeout(300);
		const noneOn = await sp.page.evaluate(() => [...document.querySelectorAll('.usd-info-pop [data-usd-el="evo-none"] input')].some((i) => i.checked));
		assert(noneOn, L + ': 「進化しない」を押すと選べる');
		const errs = sp.errors.filter((m) => !/Failed to load resource/.test(m));
		assert(errs.length === 0, L + ': コンソールのエラー0', errs);
		await sp.page.context().close();
	}
	// 390px・360px: 本文だけがスクロールし、閉じるが常に見える（金スキル3つの衣装・画面の高さを低くして縦に伸ばす）
	for (const [w, h] of [[390, 560], [360, 520]]) for (const scheme of ['light', 'dark']) {
		const sp = await open12(found.three, scheme, { width: w, height: h });
		const m = await sp.page.evaluate(() => {
			const pop = document.querySelector('.usd-info-pop'), body = pop.querySelector('.uma-popover-body'), close = document.querySelector('[data-usd-el="evo-close"]'), head = pop.querySelector('.uma-popover-head');
			const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
			const scrolls = body.scrollHeight > body.clientHeight + 1;
			const topBefore = rect(close);
			body.scrollTop = 0;
			const atTop = { close: rect(close), head: rect(head), pop: rect(pop), scrolled: body.scrollTop };
			body.scrollTop = body.scrollHeight;
			const atBottom = { close: rect(close), head: rect(head), pop: rect(pop), scrolled: body.scrollTop };
			return { scrolls, atTop, atBottom, vh: window.innerHeight, popScrolls: pop.scrollHeight > pop.clientHeight + 1, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
		});
		const lab = w + 'px・' + (scheme === 'light' ? 'ライト' : 'ダーク');
		const visibleAt = (s) => s.close.top >= s.pop.top && s.close.bottom <= s.pop.bottom + 1 && s.close.bottom <= m.vh + 1 && s.close.top >= 0;
		assert(m.scrolls && m.atBottom.scrolled > 0, lab + ': 進化先が多いと、本文がスクロールする', { scrolls: m.scrolls, scrolled: m.atBottom.scrolled });
		assert(visibleAt(m.atTop) && visibleAt(m.atBottom), lab + ': 本文の先頭でも最後でも、閉じるが常に見える（小窓の中・画面の中）', { top: m.atTop.close, bottom: m.atBottom.close, pop: m.atTop.pop, vh: m.vh });
		assert(m.atTop.head.top === m.atBottom.head.top && !m.popScrolls && !m.overflowX, lab + ': 見出しは動かず、小窓全体はスクロールしない・横スクロールなし', { head: [m.atTop.head.top, m.atBottom.head.top], popScrolls: m.popScrolls });
		assert(sp.errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, lab + ': コンソールのエラー0');
		await sp.page.context().close();
	}
	// シナリオのタブ（パターンB）: 行は選べる行の作り（名前＋「元: …」＋説明文）。強調は出ない
	{
		const sp = await openPage(browser, srv.base, 'special.html', { width: 390, height: 844 }, { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] });
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCEN) }));
		await sp.page.evaluate((ro) => { localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(ro)); localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '0'); },
			{ rosterId: 'r', name: '', umaId: 'uma-0009', star: 3, awakeningLevel: 5, cardIds: ['card-0546', 'card-0543', 'card-0295', 'card-0499', 'card-0427', 'card-0518'], race: raceOf11('race-0001'), skillFilter: { style: 'sashi' } });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector('[data-usd-el="evo-bang"]', { state: 'visible', timeout: 15000 });
		await sp.page.click('[data-usd-el="evo-bang"]');
		await sp.page.waitForSelector('.usd-info-pop [data-usd-el="evo-brow"]', { state: 'visible' });
		const b = await sp.page.evaluate(() => ({ rows: [...document.querySelectorAll('.usd-info-pop [data-usd-el="evo-brow"]')].map((r) => ({ sub: r.querySelector('.usd-evo-sub').textContent, desc: r.querySelector('.usd-evo-desc') ? r.querySelector('.usd-evo-desc').textContent.length : 0, marks: r.querySelectorAll('[data-usd-el="evo-ng"]').length, name: getComputedStyle(r.querySelector('.usd-evo-name')).fontSize })), footer: !!document.querySelector('[data-usd-el="evo-footer"] [data-usd-el="evo-close"]') }));
		assert(b.rows.length >= 3 && b.rows.every((r) => /^元: /.test(r.sub) && r.desc > 0 && r.marks === 0 && r.name === '13px') && b.footer, 'シナリオのタブ: 行は名前（13px）・「元: …」・説明文の全文・強調なし／閉じるは下に貼り付く', b);
		await sp.page.context().close();
	}
}

assert(errors.length === 0, 'コンソールエラーなし', errors);
await browser.close();
await srv.close();
console.log('\n' + (fails === 0 ? '=== 進化スキルの検査: 全項目OK ===' : '=== 進化スキルの検査: NG ' + fails + '件 ==='));
process.exit(fails === 0 ? 0 : 1);
