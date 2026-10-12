// スキルの進化（C-145・C-146）の検査。画面にはまだつながっていないので、core の関数を直接呼んで確かめる。
//
//   node tests/evolution/run-evolution-tests.mjs
//
// 見るもの:
//   §1 受け入れ: 進化スキルが findSkill で引ける／検索の範囲（条件で検索・名前を入れて探す）に出ない／
//      OCR・貼り付けの照合の辞書（buildSkillTextIndex）に入らない（辞書の件数は受け入れ前の基準と同じ）／照合しても結果に出ない
//   §2 既定の決定関数（computeEvolutionPlan）を表で回す: 全衣装 × 主なレース条件で、決まり（上限・指定なし・id 昇順・Aで進化したらBの対象外・同じ入力は同じ出力）が成り立つ
//   §3 手書きの期待値（オルフェーヴルの君臨・睥睨と3つの進化先／トレセン軒の6組／合成データの上限）
//   §4 ex-1606（距離が範囲と根幹距離の両方を持つ行）は、範囲に当たれば合う（根幹距離は判定に使わない。C-148）
//
// 件数の基準（受け入れ前に測った値。2026-10-12）: 辞書 = マスター445 ＋ 追加カタログ744 = 1189
//   （追加カタログ744 = シナリオ因子24 ＋ 遺伝子10 ＋ 拡張スキル710。進化スキル637行は含めない）。
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
const BASELINE_TEXT_INDEX = 1189;   // マスター445 ＋ 追加カタログ744
const BASELINE_MASTER = 445;
const BASELINE_EXTRA_WITHOUT_EVOLVED = 744;

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
assert(before.extra === BASELINE_EXTRA_WITHOUT_EVOLVED + evolvedIds.length, '追加カタログ = 受け入れ前の744 + 進化スキル' + evolvedIds.length + '行', before.extra);
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
await page.evaluate(() => Promise.all([window.UmaSkillDeckCore.loadSkillEffectLevels()]));
const raceRows = races.map((r) => ({ id: r.id, venue: r.venue, surface: r.surface, distance: r.distance, distanceCategory: r.distanceCategory, direction: r.direction, course: r.course, season: r.season, weather: r.weather, ground: r.ground, time: r.time, rule: r.rule, name: r.name }));
const table = await page.evaluate(({ umaInputs, scenarioBases, raceRows }) => {
	const C = window.UmaSkillDeckCore;
	const cats = ['short', 'mile', 'medium', 'long'], styles = ['nige', 'senko', 'sashi', 'oikomi'], surfs = ['turf', 'dirt'];
	const conds = [{ name: '指定なし', filter: {}, race: null }];
	cats.forEach((c) => conds.push({ name: '距離=' + c, filter: { distance: c }, race: null }));
	styles.forEach((s) => conds.push({ name: '脚質=' + s, filter: { style: s }, race: null }));
	surfs.forEach((s) => conds.push({ name: 'バ場=' + s, filter: { surface: s }, race: null }));
	cats.forEach((c) => styles.forEach((s) => surfs.forEach((f) => conds.push({ name: c + '/' + s + '/' + f, filter: { distance: c, style: s, surface: f }, race: null }))));
	raceRows.forEach((r) => {
		const f = {}; if (r.distanceCategory) f.distance = r.distanceCategory; if (r.surface) f.surface = r.surface;
		conds.push({ name: 'レース ' + r.id, filter: f, race: r });
		conds.push({ name: 'レース ' + r.id + '＋脚質', filter: Object.assign({}, f, { style: 'sashi' }), race: r });
	});
	const viol = [];
	const v = (label, ctx) => { if (viol.length < 30) viol.push(label + ' ' + JSON.stringify(ctx)); };
	let plans = 0, withEvolve = 0, bangs = 0, specifiedCount = 0, maxA = 0, maxTotal = 0, invalids = 0;
	const digest = [];
	for (const u of umaInputs) {
		for (const variant of [0, 1]) {
			const takenIds = variant === 0 ? u.gold : u.gold.concat(scenarioBases);
			for (const cd of conds) {
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
				maxA = Math.max(maxA, p.count.a); maxTotal = Math.max(maxTotal, p.count.a + p.count.b);
				const aEvolved = new Set(p.a.filter((e) => e.default !== 'none' && e.default !== 'invalid').map((e) => e.baseId));
				p.b.entries.forEach((e) => { if (aEvolved.has(e.baseId)) v('A で進化した金スキルが B の対象にいる', Object.assign({ base: e.baseId }, where)); });
				// A の進化元は、取得する（takenIds に入る）自前の金スキルだけ
				p.a.forEach((e) => { if (takenIds.indexOf(e.baseId) === -1) v('取得しない金スキルが A にいる', where); });
				if (!p.specified) {
					specifiedCount++;
					if (Object.keys(p.defaultChoices).some((k) => p.defaultChoices[k] !== 'none')) v('指定なしなのに「進化しない」以外がある', where);
					if (p.b.bang || p.b.candidates.length > 0 || p.b.defaults.length > 0) v('指定なしなのに B の候補・「！」が出た', where);
				}
				const asc = p.b.candidates.slice().sort(C.compareSkillIds);
				if (JSON.stringify(asc) !== JSON.stringify(p.b.candidates)) v('B の候補が id の昇順でない', where);
				if (JSON.stringify(p.b.defaults) !== JSON.stringify(p.b.candidates.slice(0, 2))) v('B の既定が id 昇順の先頭2つでない', where);
				if (p.b.bang !== (p.specified && p.b.candidates.length >= 3)) v('「！」の条件が違う', where);
				if (p.b.bang) bangs++;
				p.a.concat(p.b.entries).forEach((e) => {
					if (e.default === 'invalid') {
						invalids++;
						if (e.baseFit === 'must' || e.targets.some((t) => t.fit !== 'no')) v('無効なのに合う候補がある', Object.assign({ base: e.baseId }, where));
					} else if (e.default !== 'none') {
						const t = e.targets.find((x) => x.id === e.default);
						if (!t || t.fit !== 'must') v('既定の進化先が「必ず合う」でない', Object.assign({ base: e.baseId, def: e.default }, where));
						withEvolve++;
					}
				});
				p.b.entries.forEach((e) => { if (e.default !== 'none' && e.default !== 'invalid' && p.b.defaults.indexOf(e.baseId) === -1) v('B の既定の2つ以外が進化する', where); });
				p.b.entries.forEach((e) => { if (scenarioBases.indexOf(e.baseId) === -1) v('シナリオの6組にない金スキルが B の行にある', where); });
				digest.push(Object.keys(p.defaultChoices).sort().map((k) => k + '=' + p.defaultChoices[k]).join(',') + '|' + p.b.bang);
			}
		}
	}
	return { plans, conds: conds.length, viol, withEvolve, bangs, specifiedCount, maxA, maxTotal, invalids, digest: digest.join('\n').length, sample: digest.slice(0, 0) };
}, { umaInputs, scenarioBases, raceRows });
assert(table.viol.length === 0, '決まりに反する出力が0件（' + table.plans + '通り: ' + umas.length + '衣装 × ' + table.conds + '条件 × 2）', table.viol);
assert(table.specifiedCount > 0 && table.bangs > 0 && table.withEvolve > 0, '表が空振りしていない（指定なし・「！」・進化ありの出力がある）', { 指定なし: table.specifiedCount, 感嘆符あり: table.bangs, 進化あり: table.withEvolve, 無効: table.invalids });
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
assert(!!orfe && ownGold(orfe).length === 2, 'オルフェーヴル総攬（' + ORFE + '）が金スキル2つを持つ（君臨・睥睨）');
{
	const p = await plan({ umaId: ORFE, takenIds: orfeGold, filter: {}, race: null });
	assert(!p.specified && entry(p, KINRIN).default === 'none' && entry(p, HEIGEI).default === 'none' && !p.b.bang, '指定なし: 君臨・睥睨とも「進化しない」', p.defaultChoices);
}
{
	const p = await plan({ umaId: ORFE, takenIds: orfeGold, filter: { distance: 'medium', style: 'oikomi', surface: 'turf' }, race: null });
	const k = entry(p, KINRIN), h = entry(p, HEIGEI);
	assert(k.targets.length === 1 && k.targets[0].id === 'ex-1608' && k.targets[0].fit === 'may' && k.default === 'none', '中距離・追込・芝: 君臨→「2000m以上」の進化先は「合うことがある」（中距離に1900mがある）ので既定にせず「進化しない」', k);
	assert(h.targets.map((t) => t.id).join() === 'ex-1609,ex-1610' && h.targets.every((t) => t.fit === 'must') && h.default === 'ex-1609', '睥睨→中距離だけの進化先（ex-1609）を、中距離/長距離の進化先（ex-1610）より先に既定にする', h);
	assert(p.count.a === 1 && p.slots.a === 2 && p.slots.max === 4, '進化は1、枠は2、最大は4', { count: p.count, slots: p.slots });
}
{
	const race1 = raceRows.find((r) => r.id === 'race-0001');   // 芝・2200m（中距離）
	const p = await plan({ umaId: ORFE, takenIds: orfeGold, filter: { distance: 'medium', surface: 'turf' }, race: race1 });
	const k = entry(p, KINRIN);
	assert(k.targets[0].fit === 'must' && k.default === 'ex-1608', '2200m の芝のレース: 君臨→ex-1608（2000m以上）は「必ず合う」ので既定になる', k);
}
{
	const p = await plan({ umaId: ORFE, takenIds: orfeGold, filter: { style: 'nige' }, race: null });
	const k = entry(p, KINRIN), h = entry(p, HEIGEI);
	assert(k.default === 'invalid' && k.baseFit === 'no' && k.targets.every((t) => t.fit === 'no'), '逃げだけ指定: 君臨（追込）も進化先も合わないので無効', k);
	assert(h.default === 'ex-1610', '逃げだけ指定: 睥睨は2つの進化先とも距離の限定が指定外なので、同点→効果の段階が大きい（すごく）ex-1610', h);
	assert(p.count.a === 1, '進化は睥睨の1つだけ', p.count);
}
{
	// トレセン軒の6組。衣装なし（パターンAなし）
	const pairs = { 'ex-0029': 'ex-1038', 'ex-0183': 'ex-1034', 'ex-0616': 'ex-1037', 'ex-0645': 'ex-1036', 'ex-0657': 'ex-1039', 'ex-0668': 'ex-1035' };
	assert(JSON.stringify(Object.fromEntries(evolutions.entries.filter((e) => e.kind === 'scenario').map((e) => [e.baseSkillId, e.evolvedSkillIds[0]]))) === JSON.stringify(pairs), 'データのトレセン軒の6組が手書きの対応と一致（ギアチェンジ→秘伝の味変アレンジ！ほか）');
	const all = Object.keys(pairs);
	const key = await page.evaluate(() => window.UmaSkillDeckCore.getEvolutionScenarioKey());
	assert(key === 'トレセン軒' || typeof key === 'string', 'ツールが使うシナリオの鍵が取れる', key);
	const p0 = await plan({ umaId: '', takenIds: all, filter: {}, race: null });
	assert(p0.b.candidates.length === 0 && !p0.b.bang && Object.values(p0.defaultChoices).every((x) => x === 'none') && p0.b.entries.length === 6, '指定なし: 6組とも「進化しない」・「！」なし（行は6つある）');
	const pm = await plan({ umaId: '', takenIds: all, filter: { distance: 'mile' }, race: null });
	assert(JSON.stringify(pm.b.candidates) === JSON.stringify(['ex-0029', 'ex-0183', 'ex-0657']) && pm.b.bang === true, 'マイル: 候補は ex-0029・ex-0183・ex-0657（id 昇順・3つなので「！」）', pm.b.candidates);
	assert(JSON.stringify(pm.b.defaults) === JSON.stringify(['ex-0029', 'ex-0183']) && pm.defaultChoices['ex-0029'] === 'ex-1038' && pm.defaultChoices['ex-0183'] === 'ex-1034' && pm.defaultChoices['ex-0657'] === 'none', 'マイル: 既定は id 昇順の先頭2つ（ex-0029→ex-1038・ex-0183→ex-1034）。3つ目の ex-0657 は「進化しない」', pm.defaultChoices);
	assert(entry(pm, 'ex-0645').default === 'invalid' && entry(pm, 'ex-0668').default === 'invalid' && entry(pm, 'ex-0616').default === 'none', 'マイル: 中距離/長距離の2組は無効、ex-0616 は進化先が合わないので「進化しない」', pm.b.entries.map((e) => e.baseId + '=' + e.default));
	const pd = await plan({ umaId: '', takenIds: all, filter: { distance: 'medium' }, race: null });
	assert(JSON.stringify(pd.b.candidates) === JSON.stringify(['ex-0183', 'ex-0616', 'ex-0645', 'ex-0668']) && pd.b.bang === true && JSON.stringify(pd.b.defaults) === JSON.stringify(['ex-0183', 'ex-0616']), '中距離: 候補4つ（id 昇順）・「！」・既定は先頭2つ', { c: pd.b.candidates, d: pd.b.defaults });
	const pn = await plan({ umaId: '', takenIds: ['ex-0029', 'ex-0183'], filter: { distance: 'mile' }, race: null });
	assert(pn.b.candidates.length === 2 && !pn.b.bang && pn.count.b === 2, '候補が2つなら「！」は出ず、2つとも進化する');
	const pt2 = await plan({ umaId: '', takenIds: ['ex-0029'], filter: { distance: 'mile' }, race: null, scenarioKey: '別のシナリオ' });
	assert(pt2.b.entries.length === 0, 'ほかのシナリオの鍵では、トレセン軒の行を使わない');
}
{
	// A で進化した金スキルは、B の対象外（衣装自身の金スキルがシナリオの6組にも入っている衣装を探す）
	const hit = umaInputs.find((u) => u.gold.some((g) => scenarioBases.includes(g)));
	if (!hit) console.log('[--] 衣装自身の金スキルがシナリオの6組にも入る衣装は無い（この確認は行わない。表の検査は通っている）');
	else {
		const both = hit.gold.filter((g) => scenarioBases.includes(g));
		const p = await plan({ umaId: hit.id, takenIds: hit.gold.concat(scenarioBases), filter: { distance: 'mile', surface: 'dirt', style: 'senko' }, race: null });
		const aEvolved = p.a.filter((e) => e.default !== 'none' && e.default !== 'invalid').map((e) => e.baseId);
		const overlap = both.filter((g) => aEvolved.includes(g));
		assert(overlap.every((g) => !p.b.entries.some((e) => e.baseId === g)), 'A で進化した金スキルは B の行に出ない（' + hit.id + '。A 進化=' + aEvolved.join() + '・重なり=' + overlap.join() + '）');
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
	const p = await plan({ umaId: 'u1', takenIds: ['ex-0470', 'ex-0484', 'ex-0616', 'ex-0029', 'ex-0183', 'ex-0645', 'ex-0657', 'ex-0668'], filter: { distance: 'medium' }, race: null, evolutions: synth, scenarioKey: 'S' });
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

assert(errors.length === 0, 'コンソールエラーなし', errors);
await browser.close();
await srv.close();
console.log('\n' + (fails === 0 ? '=== 進化スキルの検査: 全項目OK ===' : '=== 進化スキルの検査: NG ' + fails + '件 ==='));
process.exit(fails === 0 ? 0 : 1);
