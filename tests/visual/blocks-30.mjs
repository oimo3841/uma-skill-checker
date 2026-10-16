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

	/* ====================================================================
	 * (2) 小窓・保存・リセット・元に戻す（段2）
	 * ==================================================================== */
	const P = '#deck-roster-panel ';
	const BAR = '#deck-set-bar ';
	const rawDraft = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
	const draftR = async (page) => JSON.parse(await rawDraft(page));
	const rawUd = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
	const bandTotal = (page) => page.evaluate(() => Number(document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]').textContent.replace(/[^0-9]/g, '')));
	const undo = async (page) => { await page.click('#deck-undo-btn'); await page.waitForTimeout(350); };
	/** core から、切り替えを持つイベントの一覧（鍵・メンバー・単一か複数か・結果の数）と、選べるイベントの鍵を取る */
	const events = (page, roster) => page.evaluate(async (roster) => {
		const C = UmaSkillDeckCore;
		await C.loadTrainingSources(); await C.loadSkillPtData(); await C.loadScenarioEvents(false);
		const r = C.computeRosterSkills(roster, { autoChoose: true });
		return { re: r.resultEvents.map((e) => ({ key: e.eventKey, member: e.memberKey, multi: e.multi, count: e.count, kind: e.kind, byChoice: e.byChoice,
			names: e.byChoice.map((rs) => (rs ? rs.map((x) => x.map((s) => C.getSkillName(s.skillId) + (s.hintLevel !== null ? ' Lv' + s.hintLevel : ''))) : null)) })),
			evKeys: r.events.map((e) => e.eventKey), pending: r.events.filter((e) => e.pending).length };
	}, roster);
	const total = (page, roster) => page.evaluate(async (roster) => UmaSkillDeckCore.getRosterPtDetail(roster).total, roster);
	const openPop = async (page, member) => { await page.click(P + '[data-usd-el="events-btn"][data-member-key="' + member + '"]'); await page.waitForTimeout(350); };
	const resultBtns = (page, key) => page.evaluate((key) => Array.from(document.querySelectorAll('[data-usd-el="result-choice"][data-event-key="' + key + '"]')).map((b) => ({
		on: b.classList.contains('usd-roster-choice--on'), checked: b.getAttribute('aria-checked'), disabled: b.disabled, p: b.getAttribute('data-result'),
		skills: Array.from(b.querySelectorAll('.usd-roster-choiceskill')).map((s) => s.textContent) })), key);

	await block('結果切替(2) 小窓: 結果ボタンの箱（単一選択肢）・選択肢の箱の中の結果ボタン（複数選択肢）・押すと保存・合計が変わる・「！」「未選択N件」は変わらない・3段階は3ボタン', async () => {
		const sp = await openSp({ roster: VARY, w: 390 });
		const ev = await events(sp.page, VARY);
		const single = ev.re.find((e) => e.kind === 'event' && !e.multi && e.count === 2 && ev.evKeys.indexOf(e.key) === -1);
		let multi = null;
		for (const e of ev.re.filter((x) => x.kind === 'event' && x.multi && ev.evKeys.indexOf(x.key) !== -1)) {
			if ((await total(sp.page, Object.assign({}, VARY, { resultPicks: { [e.key]: e.count - 1 } }))) !== (await total(sp.page, VARY))) { multi = e; break; }
		}
		const three = ev.re.find((e) => e.count === 3 && e.kind === 'event');
		assert(single && multi && three, '結果切替(2) 前提: VARY に 単一選択肢・複数選択肢（選べるイベントにある）・3段階の切り替えがある', { single: !!single, multi: !!multi, three: !!three });
		const before = await bandTotal(sp.page);
		const unselBefore = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="events-btn"]')).map((b) => b.getAttribute('data-unselected')).join(','));
		// 単一選択肢: 結果ボタンだけの箱
		await openPop(sp.page, single.member);
		const boxes = await sp.page.evaluate((k) => ({ box: !!document.querySelector('[data-usd-el="event-result"][data-event-key="' + k + '"]'),
			unselText: (document.querySelector('[data-usd-el="events-unselected"]') || {}).textContent }), single.key);
		assert(boxes.box, '結果切替(2) 単一選択肢の結果が分かれるイベントが、結果ボタンだけの箱で小窓に出る', boxes);
		const b0 = await resultBtns(sp.page, single.key);
		assert(b0.length === single.count && b0[0].on && b0[0].checked === 'true' && !b0[1].on && b0.every((b) => !b.disabled), '結果切替(2) 結果の数だけボタンが出て、既定は1つ目が選ばれていて、すべて押せる（無効にしない）', b0);
		const flat = (p) => (single.names[0][p] || []).length ? single.names[0][p] : ['スキルなし'];
		assert(b0.every((b, i) => JSON.stringify(b.skills) === JSON.stringify(flat(i))), '結果切替(2) 各ボタンに中身（スキル名 Lv／スキルなし）が出る（名前〔大成功・成功・失敗〕は出ない）', { got: b0.map((b) => b.skills), exp: [flat(0), flat(1)] });
		assert(!(await sp.page.evaluate(() => /大成功|失敗/.test(document.querySelector('[data-usd-el="events-panes"]').textContent))), '結果切替(2) 小窓に「大成功」「失敗」の語は出ない', null);
		// 押す → 保存・合計・描き直し
		await sp.page.click('[data-usd-el="result-choice"][data-event-key="' + single.key + '"][data-result="1"]');
		await sp.page.waitForTimeout(350);
		const d1 = await draftR(sp.page);
		const expTotal = await total(sp.page, Object.assign({}, VARY, { resultPicks: { [single.key]: 1 } }));
		assert(JSON.stringify(d1.resultPicks) === JSON.stringify({ [single.key]: 1 }), '結果切替(2) 押すと resultPicks に { 鍵: 1 } だけが保存される', d1.resultPicks);
		assert((await bandTotal(sp.page)) === expTotal && expTotal !== before, '結果切替(2) 帯の合計が切り替え後の値になる（' + before + '→' + expTotal + '）', await bandTotal(sp.page));
		const b1 = await resultBtns(sp.page, single.key);
		assert(b1.length === single.count && !b1[0].on && b1[1].on && b1[1].checked === 'true', '結果切替(2) 押したあと、小窓が描き直されて2つ目が選ばれている', b1);
		const unselAfter = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="events-btn"]')).map((b) => b.getAttribute('data-unselected')).join(','));
		assert(unselAfter === unselBefore, '結果切替(2) 「！」「未選択N件」は結果ボタンを数えない（切り替えても変わらない）', { unselBefore, unselAfter });
		// 最初の結果に戻すと、鍵も項目も消える
		await sp.page.click('[data-usd-el="result-choice"][data-event-key="' + single.key + '"][data-result="0"]');
		await sp.page.waitForTimeout(350);
		const d0 = await draftR(sp.page);
		assert(!('resultPicks' in d0) && (await bandTotal(sp.page)) === before, '結果切替(2) 1つ目に戻すと、鍵が消えて resultPicks は項目ごと消える・合計も最初に戻る', d0.resultPicks);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(250);
		// 複数選択肢（選べるイベント）: 選択肢の箱の中に結果ボタン
		await openPop(sp.page, multi.member);
		const inBox = await sp.page.evaluate((k) => { const box = document.querySelector('[data-usd-el="event"][data-event-key="' + k + '"]'); return { has: !!box, groups: box ? box.querySelectorAll('[data-usd-el="result-group"]').length : 0, choices: box ? box.querySelectorAll('[data-usd-el="event-choice"]').length : 0 }; }, multi.key);
		assert(inBox.has && inBox.groups === 1 && inBox.choices >= 2, '結果切替(2) 選択肢が複数のイベントは、選択肢のボタンと別に、結果のボタンを1組（イベントに1組）', inBox);
		const expMulti = await total(sp.page, Object.assign({}, VARY, { resultPicks: { [multi.key]: multi.count - 1 } }));
		await sp.page.click('[data-usd-el="result-choice"][data-event-key="' + multi.key + '"][data-result="' + (multi.count - 1) + '"]');
		await sp.page.waitForTimeout(350);
		assert((await bandTotal(sp.page)) === expMulti && expMulti !== before, '結果切替(2) 複数選択肢のイベントも、押すと合計が切り替え後の値になる（' + before + '→' + expMulti + '）', { got: await bandTotal(sp.page), exp: expMulti });
		await sp.page.click('[data-usd-el="result-choice"][data-event-key="' + multi.key + '"][data-result="0"]');
		await sp.page.waitForTimeout(300);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(250);
		// 3段階
		await openPop(sp.page, three.member);
		const b3 = await resultBtns(sp.page, three.key);
		assert(b3.length === 3 && b3[0].on, '結果切替(2) 3段階のイベントは、結果ボタンが3つ（既定は1つ目）', b3);
		const exp3 = await total(sp.page, Object.assign({}, VARY, { resultPicks: { [three.key]: 2 } }));
		await sp.page.click('[data-usd-el="result-choice"][data-event-key="' + three.key + '"][data-result="2"]');
		await sp.page.waitForTimeout(350);
		const d3 = await draftR(sp.page);
		assert(JSON.stringify(d3.resultPicks) === JSON.stringify({ [three.key]: 2 }) && (await bandTotal(sp.page)) === exp3, '結果切替(2) 3つ目を選ぶと { 鍵: 2 } が保存され、合計が切り替え後の値になる', { d3: d3.resultPicks, exp3 });
		assert(jsErrors(sp.errors).length === 0, '結果切替(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('結果切替(3) 保存・読み込み・リセット・元に戻す: 項目の無い保存は1バイトも変わらない／知らない鍵は残す／開き直しで同じ／リセットで消え元に戻すで戻る／1操作で1回戻る', async () => {
		const SAVED = (extra) => ({ schemaVersion: 7, records: [], customSkills: [], templates: [
			{ templateId: 't1', name: 'S1', skillIds: [], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }],
			rosters: [Object.assign({ rosterId: 'r1', name: 'S1', umaId: VARY.umaId, star: 3, awakeningLevel: 5, cardIds: VARY.cardIds.slice(), createdAt: 'x', updatedAt: 'x' }, extra || {})] });
		const open2 = async (userData) => {
			const sp = await openPage(browser, base, 'special.html', { width: 390, height: 900 }, userData);
			await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(readJson('data/scenario-event-skills.json')) }));
			await sp.page.evaluate(() => { localStorage.removeItem('umaSkillDeck:draftRoster:special'); localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '0'); });
			await sp.page.reload({ waitUntil: 'networkidle' });
			for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
			await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
			await sp.page.click(BAR + '[data-usd-act="set-list"]');
			const already = await sp.page.evaluate(() => { const i = document.querySelector('[data-usd-el="set-list"] input[value="t1"]'); return !!i && i.checked; });
			if (already) await sp.page.keyboard.press('Escape'); else await sp.page.click('[data-usd-el="set-list"] input[value="t1"]');
			await sp.page.waitForTimeout(900);
			return sp;
		};
		const rosterOf = async (page) => JSON.parse(await rawUd(page)).rosters[0];
		const seed = SAVED();
		const seedRaw = JSON.stringify(seed);
		const sp = await open2(seed);
		assert((await rawUd(sp.page)) === seedRaw, '結果切替(3)(a) resultPicks の無い保存データを開いてセットを選んでも、1バイトも変わらない（読み込み時に補わない・移行しない）', (await rawUd(sp.page) || '').length);
		const base0 = await bandTotal(sp.page);
		assert(base0 === (await total(sp.page, VARY)), '結果切替(3)(a) 保存済みの編成の合計は、基準（結果1）の値のまま', base0);
		const ev = await events(sp.page, VARY);
		const A = ev.re.find((e) => e.kind === 'event' && !e.multi && e.count === 2);
		const B = ev.re.find((e) => e.kind === 'event' && !e.multi && e.count === 2 && e.key !== A.key && e.member !== A.member);
		const clickResult = async (e, p) => {
			await openPop(sp.page, e.member);
			await sp.page.click('[data-usd-el="result-choice"][data-event-key="' + e.key + '"][data-result="' + p + '"]');
			await sp.page.waitForTimeout(300);
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(200);
		};
		// (b) 2つ切り替える → 保存（schemaVersion は 7 のまま）→ 開き直しで同じ
		await clickResult(A, 1);
		await clickResult(B, 1);
		const d1 = JSON.parse(await rawUd(sp.page));
		assert(JSON.stringify(d1.rosters[0].resultPicks) === JSON.stringify({ [A.key]: 1, [B.key]: 1 }) && d1.schemaVersion === 7, '結果切替(3)(b) 2つ切り替えると rosters の resultPicks に { 鍵: 位置 } が入る（schemaVersion は 7 のまま）', d1.rosters[0].resultPicks);
		const total2 = await bandTotal(sp.page);
		const savedNow = await rawUd(sp.page);
		const spR = await open2(JSON.parse(savedNow));
		assert((await bandTotal(spR.page)) === total2 && (await rawUd(spR.page)) === savedNow, '結果切替(3)(b) 開き直しても、合計が同じ（保存データも1バイトも変わらない）', { total2, now: await bandTotal(spR.page) });
		await spR.ctx.close();
		// (c) 元に戻す: 1回の操作で1回
		await undo(sp.page);
		let k = (await rosterOf(sp.page)).resultPicks;
		assert(JSON.stringify(k) === JSON.stringify({ [A.key]: 1 }), '結果切替(3)(c) 「元に戻す」1回で、直前の1つだけが戻る', k);
		await undo(sp.page);
		const r0 = await rosterOf(sp.page);
		assert(!('resultPicks' in r0) && (await bandTotal(sp.page)) === base0, '結果切替(3)(c) もう1回で最初に戻る（resultPicks は項目ごと消え、合計も基準）', r0.resultPicks);
		// (d) リセット（中身をすべて消す）で消える。元に戻すで戻る。「取得しないスキルを戻す」は触らない
		await clickResult(A, 1);
		assert(JSON.stringify((await rosterOf(sp.page)).resultPicks) === JSON.stringify({ [A.key]: 1 }), '結果切替(3)(d) 前提: 切り替えた状態を保存できた', null);
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click('[data-usd-el="roster-reset-off"]');
		await sp.page.waitForTimeout(300);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(250);
		assert(JSON.stringify((await rosterOf(sp.page)).resultPicks) === JSON.stringify({ [A.key]: 1 }), '結果切替(3)(d) 「取得しないスキルを戻す」は resultPicks に触らない', null);
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(400);
		const cleared = await rosterOf(sp.page);
		assert(!('resultPicks' in cleared) && cleared.umaId === '', '結果切替(3)(d) 「中身をすべて消す」で resultPicks も消える', cleared.resultPicks);
		await undo(sp.page);
		const restored = await rosterOf(sp.page);
		assert(JSON.stringify(restored.resultPicks) === JSON.stringify({ [A.key]: 1 }) && restored.umaId === VARY.umaId, '結果切替(3)(d) 「元に戻す」で、リセット前（resultPicks も衣装も）に戻る', restored.resultPicks);
		assert(jsErrors(sp.errors).length === 0, '結果切替(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// (e) 知らない鍵・崩れた値の入った保存データは、開いただけでは1バイトも変わらない。結果1として数える。切り替えたのはその1つだけ（知らない鍵は残る）
		const junk = { 'no-such#1': 1, 'card:card-9999#0': 2 };
		junk[A.key] = 99;
		const seed2 = SAVED({ resultPicks: junk });
		const sp2 = await open2(seed2);
		assert((await rawUd(sp2.page)) === JSON.stringify(seed2), '結果切替(3)(e) 知らない鍵・範囲外の値の入った保存データも、開いただけでは1バイトも変わらない', null);
		assert((await bandTotal(sp2.page)) === base0, '結果切替(3)(e) 無効な値は結果1として数える（合計は基準のまま）', await bandTotal(sp2.page));
		await openPop(sp2.page, A.member);
		await sp2.page.click('[data-usd-el="result-choice"][data-event-key="' + A.key + '"][data-result="1"]');
		await sp2.page.waitForTimeout(300);
		const k2 = (await rosterOf(sp2.page)).resultPicks;
		assert(JSON.stringify(k2) === JSON.stringify(Object.assign({}, junk, { [A.key]: 1 })), '結果切替(3)(e) 切り替えたのはその1つだけ（知らない鍵はそのまま残る）', k2);
		await sp2.page.click('[data-usd-el="result-choice"][data-event-key="' + A.key + '"][data-result="0"]');
		await sp2.page.waitForTimeout(300);
		const k3 = (await rosterOf(sp2.page)).resultPicks;
		assert(JSON.stringify(k3) === JSON.stringify({ 'no-such#1': 1, 'card:card-9999#0': 2 }), '結果切替(3)(e) 最初の結果に戻すと、その1つの鍵だけを外す（知らない鍵は残る）', k3);
		await sp2.ctx.close();
	});

	/* ====================================================================
	 * (4) 列見出しのバッジの点（段3）
	 * ==================================================================== */
	const lum = (rgb) => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
	const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
	const badges = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="events-btn"]')).map((b) => {
		const r = b.getBoundingClientRect(); const d = b.querySelector('[data-usd-el="result-dot"]');
		const cs = getComputedStyle(b); const dcs = d ? getComputedStyle(d) : null; const dr = d ? d.getBoundingClientRect() : null;
		return { key: b.getAttribute('data-member-key'), text: b.textContent, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, aria: b.getAttribute('aria-label'), picked: b.getAttribute('data-result-picked'),
			dot: !!d, bg: cs.backgroundColor, dotBg: dcs && dcs.backgroundColor, ring: dcs && dcs.borderTopColor, dotW: dr && dr.width, dotInside: dr ? (dr.right <= r.right + 5 && dr.top >= r.top - 5) : null };
	}));
	const band = (page) => page.evaluate(() => Math.round(document.querySelector('#deck-roster-panel [data-usd-el="pt-sumrow"]').getBoundingClientRect().height));
	const docScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

	await block('結果切替(4) 列見出しの点: 切り替えがある列のバッジだけに付く・形と帯の高さは変わらない・「！」と区別できる・ライト／ダークで見える（PC・390・360）', async () => {
		for (const [w, scheme] of [[1280, 'light'], [390, 'light'], [390, 'dark'], [360, 'light']]) {
			const plain = await openSp({ roster: VARY, w, scheme });
			const ev = await events(plain.page, VARY);
			const a = ev.re.find((e) => e.kind === 'event' && !e.multi && e.count === 2);
			const bandPlain = await band(plain.page);
			const b0 = await badges(plain.page);
			assert(b0.every((b) => !b.dot && b.picked === null), '結果切替(4) ' + w + '/' + scheme + ' 切り替えが無いときは、どの列にも点が無い', b0.filter((b) => b.dot).length);
			await plain.ctx.close();
			const sp = await openSp({ roster: Object.assign({}, VARY, { resultPicks: { [a.key]: 1 } }), w, scheme });
			const b1 = await badges(sp.page);
			const dots = b1.filter((b) => b.dot);
			assert(dots.length === 1 && String(dots[0].key) === String(a.member) && dots[0].picked === '1' && /結果を切り替え中1件/.test(dots[0].aria),
				'結果切替(4) ' + w + '/' + scheme + ' 点は切り替えのある列（' + a.member + '）のバッジだけに付き、aria-label に「結果を切り替え中1件」', dots.map((d) => [d.key, d.picked, d.aria]));
			assert(b1.every((b, i) => b.w === b0[i].w && b.h === b0[i].h && b.text === b0[i].text), '結果切替(4) ' + w + '/' + scheme + ' バッジの幅・高さ・中の字は変わらない（点は角に添えるだけ）', b1.map((b, i) => [b.w - b0[i].w, b.h - b0[i].h]));
			assert((await band(sp.page)) === bandPlain, '結果切替(4) ' + w + '/' + scheme + ' 帯の高さは変わらない（' + bandPlain + 'px）', await band(sp.page));
			assert((await docScroll(sp.page)) <= 0, '結果切替(4) ' + w + '/' + scheme + ' 横スクロールが出ない', await docScroll(sp.page));
			const d = dots[0];
			assert(d.dotW >= 7 && d.dotW <= 9 && d.dotInside, '結果切替(4) ' + w + '/' + scheme + ' 点は約8pxで、バッジの右上の角に収まる', { w: d.dotW, inside: d.dotInside });
			// コントラスト: 点と縁取り（地の色）が3:1以上。「！」の赤いバッジの上でも、点の色は赤い地と違う色
			const cr = ratio(d.dotBg, d.ring);
			assert(cr >= 3, '結果切替(4) ' + w + '/' + scheme + ' 点と縁取りのコントラスト比 ' + cr.toFixed(2) + '（3:1以上）', { dot: d.dotBg, ring: d.ring });
			const alertB = b1.find((b) => b.text === '!');
			if (alertB) assert(ratio(d.dotBg, alertB.bg) >= 1.5 || d.dotBg !== alertB.bg, '結果切替(4) ' + w + '/' + scheme + ' 「！」の赤いバッジと点は別の色（赤い地の上でも縁取りで見分けがつく）', { dot: d.dotBg, alert: alertB.bg });
			assert(jsErrors(sp.errors).length === 0, '結果切替(4) ' + w + '/' + scheme + ' コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});
}
