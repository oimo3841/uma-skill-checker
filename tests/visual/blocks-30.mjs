// ①のイベントの結果の切り替え（2026-10-16。設計は result-toggle-step0.md の案A）の検査。run-smoke.mjs の末尾から register30() で呼ばれる
// （塊の見出しはすべて「結果切替」で始まる。`npm run test:visual -- --only=結果切替` で回せる）。
//
// 決め: イベントごとに結果の位置を選べる（roster.resultPicks = { eventKey: 結果の位置（0始まり） }。既定は 0＝結果1＝成功）。
//   条件文のあるイベント（着順系）は対象外で常に結果1。選択肢が複数のイベントは、イベントに1つの位置を全選択肢に当て、結果の数が足りない選択肢は最後の結果にまるめる。
//   無効な保存値（知らない鍵・整数でない・負・結果数を超える）は結果1として読む（保存値は書き換えない）。
//
// (1) 計算の層（core を直接呼ぶ・画面なし）: 既定で出力が変わらない／固定の編成の前後の数／条件文のイベントが動かない／無効な値
// (2) 小窓・保存・リセット・元に戻す（段2）／(3) 列見出しの点（段3）

export async function register30(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const REAL = { umaId: 'uma-0001', cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'] };
	const VARY = { umaId: 'uma-0192', cardIds: ['card-0273', 'card-0288', 'card-0311', 'card-0346', 'card-0405', 'card-0248'] };

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, o.userData || EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		// シナリオの固定イベントは実データで（Step 0 の数は、シナリオの列を含む実際の画面の数）
		const scen = readJson('data/scenario-event-skills.json');
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(scen) }));
		const roster = Object.assign({ umaId: 'uma-0001', cardIds: REAL.cardIds }, o.roster || {});
		await sp.page.evaluate(({ roster }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { roster });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(700);
		return sp;
	};
	/** core を直接呼ぶ。picksOf(resultEvents) で resultPicks を作る（結果の切り替えを持つイベントを、その場で数える） */
	const probe = (page, roster, mode) => page.evaluate(async ({ roster, mode }) => {
		const C = UmaSkillDeckCore;
		await C.loadTrainingSources(); await C.loadSkillPtData(); await C.loadScenarioEvents(false);
		const first = C.computeRosterSkills(roster, { autoChoose: true });
		const picks = {};
		first.resultEvents.forEach((e) => {
			const isUma = e.kind === 'umaEvent';
			if ((mode === 'uma' && isUma) || (mode === 'card' && !isUma) || mode === 'both') picks[e.eventKey] = e.count - 1;
		});
		const r = Object.assign({}, roster, mode === 'none' ? {} : { resultPicks: picks });
		const res = C.computeRosterSkills(r, { autoChoose: true, resultPicks: r.resultPicks });
		const d = C.getRosterPtDetail(r);
		return { total: d.total, kinds: d.kinds, sure: res.items.filter((i) => i.sure).length, maybe: res.items.filter((i) => !i.sure).length,
			picks: Object.keys(picks).length, keys: first.resultEvents.map((e) => e.eventKey) };
	}, { roster, mode });

	await block('結果切替(1) 計算: 既定で出力が変わらない／固定の編成の前後の数（Step 0 の表）／条件文のイベントは動かない／無効な保存値は結果1', async () => {
		const sp = await openSp({ roster: REAL });
		// 固定の編成（実データ。◎に上げる既定が入った状態）。全イベントを最後の結果にしたときの数
		const EXPECT = {
			REAL: { roster: REAL, none: [8886, 67, 75, 10], uma: [8886, 67, 75, 10], card: [8935, 67, 75, 10], both: [8935, 67, 75, 10] },
			VARY: { roster: VARY, none: [7159, 54, 63, 15], uma: [7240, 54, 63, 15], card: [6815, 53, 58, 12], both: [6896, 53, 58, 12] }
		};
		for (const [name, ex] of Object.entries(EXPECT)) {
			for (const mode of ['none', 'uma', 'card', 'both']) {
				const r = await probe(sp.page, ex.roster, mode);
				assert(r.total === ex[mode][0] && r.kinds === ex[mode][1] && r.sure === ex[mode][2] && r.maybe === ex[mode][3],
					'結果切替(1) ' + name + '・' + ({ none: '基準（結果1）', uma: '育成ウマ娘のイベントだけ最後の結果', card: 'サポカ・共通イベントだけ最後の結果', both: '両方' })[mode] + ' → ' + ex[mode].join('Pt・種・●・△='), { got: [r.total, r.kinds, r.sure, r.maybe] });
			}
		}
		// (a) resultPicks が無い・空・すべて0・無効のとき、出力が従来と同一（総当たりの同一性は変更前後のハッシュで別に確認済み。ここは同じ呼び出しで同じになること）
		const same = await sp.page.evaluate(async ({ roster }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData(); await C.loadScenarioEvents(false);
			const keys = C.computeRosterSkills(roster, { autoChoose: true }).resultEvents.map((e) => e.eventKey);
			const j = (picks) => JSON.stringify(C.getRosterPtDetail(Object.assign({}, roster, picks === undefined ? {} : { resultPicks: picks })));
			const base = j(undefined);
			const zero = {}; keys.forEach((k) => { zero[k] = 0; });
			const bad = { 'no-such#1': 1, 'card:card-9999#0': 1, 'uma:uma-0001#999': 2 };
			keys.forEach((k, i) => { bad[k] = [-1, 1.5, '1', null, 99, true, NaN, 1e9, [1], { a: 1 }][i % 10]; });
			const alwaysZero = {}; Object.defineProperty(alwaysZero, '__proto__', { value: 1, enumerable: true });
			return { n: keys.length, empty: j({}) === base, zero: j(zero) === base, bad: j(bad) === base, proto: j(JSON.parse('{"__proto__":1}')) === base, arr: j([1, 1]) === base, str: j('x') === base };
		}, { roster: VARY });
		assert(same.n > 0 && same.empty && same.zero && same.bad && same.proto && same.arr && same.str,
			'結果切替(1) resultPicks が無い・空・すべて0・無効（知らない鍵・負・小数・文字・null・範囲外・配列・文字列）のとき、Pt の結果が基準と同一', same);
		// (c) 条件文のイベント（着順系）は、どの値でも動かない
		const TR = readJson('data/training-event-skills.json').entries;
		const withCond = TR.find((r) => r.events.some((e) => e.condition && e.choices.some((c) => Array.isArray(c.results))));
		const condKeys = [];
		withCond.events.forEach((e, i) => { if (e.condition && e.choices.some((c) => Array.isArray(c.results))) condKeys.push('uma:' + withCond.umaId + '#' + i); });
		const condRes = await sp.page.evaluate(async ({ umaId, condKeys }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const r0 = { umaId, cardIds: [] };
			const j = (picks) => JSON.stringify([C.getRosterPtDetail(Object.assign({}, r0, { resultPicks: picks })), C.computeRosterSkills(r0, { autoChoose: true, resultPicks: picks }).infoEvents]);
			const base = j({});
			const all = {};
			let same = true;
			[1, 2, 3].forEach((v) => { condKeys.forEach((k) => { all[k] = v; }); if (j(all) !== base) same = false; });
			const res = C.computeRosterSkills(r0, { autoChoose: true });
			return { same, inResultEvents: res.resultEvents.filter((e) => condKeys.indexOf(e.eventKey) !== -1).length };
		}, { umaId: withCond.umaId, condKeys });
		assert(condKeys.length > 0 && condRes.same && condRes.inResultEvents === 0,
			'結果切替(1) 条件文のあるイベント（' + withCond.umaId + ' の ' + condKeys.length + '件）は、結果の位置を何にしても動かず、切り替えの一覧にも出ない', condRes);
		assert(jsErrors(sp.errors).length === 0, '結果切替(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('結果切替(1b) 数: 切り替えを持つイベントの数が、データから独立に数えた値と一致する（育成ウマ娘・サポカ・共通イベント）', async () => {
		const TR = readJson('data/training-event-skills.json').entries;
		const SC = readJson('data/support-card-event-skills.json').entries;
		const CH = readJson('data/character-event-skills.json').entries;
		const keyOf = (l) => (l || []).map((r) => r.skillId + ':' + r.hintLevel).sort().join(',');
		const sw = (ev) => !ev.condition && ev.choices.some((c) => Array.isArray(c.results) && c.results.length >= 2 && c.results.some((r) => keyOf(r) !== keyOf(c.results[0])));
		const cnt = (rows, key) => { let single = 0, multi = 0; rows.filter((r) => r.status === 'done').forEach((r) => (r[key] || []).forEach((ev) => { if (sw(ev)) (ev.choices.length >= 2 ? multi++ : single++); })); return { single, multi }; };
		const exp = { uma: cnt(TR, 'events'), card: cnt(SC, 'chain'), chara: cnt(CH, 'events') };
		const sp = await openSp({ roster: REAL });
		const got = await sp.page.evaluate(async ({ umas, cards }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const tally = (list) => ({ single: list.filter((e) => !e.multi).length, multi: list.filter((e) => e.multi).length });
			const uma = [], card = [];
			umas.forEach((id) => { uma.push(...C.computeRosterSkills({ umaId: id, cardIds: [] }).resultEvents.filter((e) => e.kind === 'umaEvent')); });
			cards.forEach((id) => { card.push(...C.computeRosterSkills({ umaId: '', cardIds: [id] }).resultEvents.filter((e) => e.kind === 'event')); });
			return { uma: tally(uma), card: tally(card) };
		}, { umas: TR.map((r) => r.umaId), cards: SC.map((r) => r.cardId) });
		assert(JSON.stringify(got.uma) === JSON.stringify(exp.uma), '結果切替(1b) 育成ウマ娘: 切り替えを持つイベント 単一選択肢' + exp.uma.single + '＋複数選択肢' + exp.uma.multi, { got: got.uma, exp: exp.uma });
		assert(JSON.stringify(got.card) === JSON.stringify(exp.card), '結果切替(1b) サポカ: 切り替えを持つイベント 単一選択肢' + exp.card.single + '＋複数選択肢' + exp.card.multi, { got: got.card, exp: exp.card });
		console.log('  （参考）共通イベント（キャラクター）: 単一選択肢' + exp.chara.single + '＋複数選択肢' + exp.chara.multi);
		await sp.ctx.close();
	});
}
