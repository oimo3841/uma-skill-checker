// ①の育成ウマ娘のイベントの取得の切り替え（2026-10-17。データの acquireMode が "user"＝ユーザー選択次第のイベント）の検査。
// run-smoke.mjs の末尾から register34() で呼ばれる（塊の見出しはすべて「取得切替」で始まる。`npm run test:visual -- --only=取得切替` で回せる）。
//
// 決め: acquireMode が "user" のイベントは既定で未達成（roster.acquirePicks = { イベントの鍵: true } に入っていなければ、スキルを数えない）。
//   "fixed" と acquireMode の無いイベントは今までどおり。達成にしたときは結果の切り替え（resultPicks）に従う（条件文のあるイベントは常に結果1）。
//   確認済み（roster.acquireSeen = 確認した時点の umaId）: 今の umaId と同じときだけ。確認前は、達成にしていない user のイベントを「！」と「未選択N件」に数える。
//
// (1) 計算の層（core を直接呼ぶ・画面なし）: 全達成は従来と同一／既定は user の分だけ減る／無効な値は未達成／結果の切り替えに従う／数

export async function register34(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const REAL = { umaId: 'uma-0001', cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'] };
	const VARY = { umaId: 'uma-0192', cardIds: ['card-0273', 'card-0288', 'card-0311', 'card-0346', 'card-0405', 'card-0248'] };
	const TR = readJson('data/training-event-skills.json').entries;
	const userKeysOf = (e) => { const ks = []; e.events.forEach((ev, i) => { if (ev.acquireMode === 'user') ks.push('uma:' + e.umaId + '#' + i); }); return ks; };
	const allUser = TR.reduce((s, e) => s + userKeysOf(e).length, 0);

	/** special.html を開く。transform を渡すと、育成ウマ娘のイベントのデータをその関数で書き換えて読む（コピーに対して。ファイルは変えない） */
	const openCore = async (transform) => {
		const sp = await openPage(browser, base, 'special.html', { width: 390, height: 900 }, EMPTY);
		const scen = readJson('data/scenario-event-skills.json');
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(scen) }));
		if (transform) {
			const doc = JSON.parse(JSON.stringify({ dataVersion: 'test', category: 'trainingEventSkill', entries: TR }));
			transform(doc.entries);
			await sp.page.route('**/data/training-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(doc) }));
		}
		await sp.page.reload({ waitUntil: 'networkidle' });
		await sp.page.waitForTimeout(400);
		return sp;
	};
	/** 271衣装 × （単独・REAL・VARY）で、計算の出力の部分ごとのハッシュと数を返す。mode: 'all'＝user をすべて達成／'none'＝何も渡さない */
	const measure = (page, mode) => page.evaluate(async ({ umaIds, userKeys, REAL, VARY, mode }) => {
		const C = UmaSkillDeckCore;
		await C.loadTrainingSources(true); await C.loadSkillPtData(); await C.loadScenarioEvents(false);
		const h = (s) => { let a = 0xdeadbeef, b = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
			a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
			return (4294967296 * (2097151 & b) + (a >>> 0)).toString(16); };
		const rows = {};
		const sets = { solo: [], real: REAL.cardIds, vary: VARY.cardIds };
		for (const id of umaIds) {
			for (const [name, cards] of Object.entries(sets)) {
				const r = { umaId: id, cardIds: cards.slice() };
				if (mode === 'all' && userKeys[id].length) { r.acquirePicks = {}; userKeys[id].forEach((k) => { r.acquirePicks[k] = true; }); }
				const res = C.computeRosterSkills(r, { autoChoose: true, resultPicks: r.resultPicks, acquirePicks: r.acquirePicks });
				const d = C.getRosterPtDetail(r);
				rows[id + '/' + name] = { skills: h(JSON.stringify(res.skillIds)), items: h(JSON.stringify(res.items)), sources: h(JSON.stringify(res.sources)), events: h(JSON.stringify(res.events)),
					resultEvents: h(JSON.stringify(res.resultEvents)), members: h(JSON.stringify(res.members)), pt: h(JSON.stringify(d)),
					total: d.total, kinds: d.kinds, sure: res.items.filter((i) => i.sure).length, maybe: res.items.filter((i) => !i.sure).length };
			}
		}
		const fixed = {};
		for (const [n, ro] of [['REAL', REAL], ['VARY', VARY]]) {
			const r = Object.assign({}, ro);
			if (mode === 'all') { r.acquirePicks = {}; (userKeys[ro.umaId] || []).forEach((k) => { r.acquirePicks[k] = true; }); }
			const res = C.computeRosterSkills(r, { autoChoose: true, acquirePicks: r.acquirePicks });
			const d = C.getRosterPtDetail(r);
			fixed[n] = [d.total, d.kinds, res.items.filter((i) => i.sure).length, res.items.filter((i) => !i.sure).length];
		}
		return { rows, fixed };
	}, { umaIds: TR.map((e) => e.umaId), userKeys: Object.fromEntries(TR.map((e) => [e.umaId, userKeysOf(e)])), REAL, VARY, mode });
	const FIELDS = ['skills', 'items', 'sources', 'events', 'resultEvents', 'members', 'pt', 'total', 'kinds', 'sure', 'maybe'];
	const diffRows = (A, B, fields) => Object.keys(A.rows).filter((k) => fields.some((f) => A.rows[k][f] !== B.rows[k][f]));

	await block('取得切替(1) 計算: すべて達成にすると従来と同一（acquireMode を外したデータと一致）／既定は user の分だけ減る（user を空にしたデータと一致）／固定の編成の前後の数', async () => {
		// (a) 全達成 ＝ acquireMode の無いデータ（従来の数え方）。271衣装 × 3 の編成で、出力のハッシュがすべて一致する
		const spOld = await openCore((es) => es.forEach((e) => e.events.forEach((ev) => { delete ev.acquireMode; delete ev.acquireNote; })));
		const old = await measure(spOld.page, 'none');
		await spOld.ctx.close();
		const sp = await openCore(null);
		const all = await measure(sp.page, 'all');
		const bad = diffRows(old, all, FIELDS);
		assert(Object.keys(old.rows).length === TR.length * 3 && bad.length === 0, '取得切替(1) すべて達成: 271衣装×(単独・REAL・VARY)の出力（スキル・items・由来・Pt・イベントの一覧）が従来（acquireMode なし）と同一', { n: Object.keys(old.rows).length, bad: bad.slice(0, 5) });
		// (b) 既定（何も渡さない）＝ user のイベントのスキルを空にしたデータ。fixed・acquireMode の無いイベントの寄与は変わらない
		const spEmpty = await openCore((es) => es.forEach((e) => e.events.forEach((ev) => { if (ev.acquireMode === 'user') ev.choices = ev.choices.map(() => ({ skills: [] })); })));
		const empty = await measure(spEmpty.page, 'none');
		await spEmpty.ctx.close();
		const def = await measure(sp.page, 'none');
		const bad2 = diffRows(empty, def, ['skills', 'items', 'sources', 'pt', 'total', 'kinds', 'sure', 'maybe', 'members', 'resultEvents']);
		assert(bad2.length === 0, '取得切替(1) 既定（未達成）: user のイベントの分だけが減り、fixed・acquireMode の無いイベントの寄与は変わらない（user を空にしたデータと Pt・種・●・△が一致）', { bad: bad2.slice(0, 5) });
		// (c) 固定の編成の前後の数（Pt・種・●・△）。全達成は変更前の数（blocks-30 の基準）と同じ
		const EXPECT = { all: { REAL: [8886, 67, 75, 10], VARY: [7159, 54, 63, 15] }, none: { REAL: [8742, 66, 74, 10], VARY: [7042, 53, 62, 15] } };
		assert(JSON.stringify(all.fixed) === JSON.stringify(EXPECT.all), '取得切替(1) 固定の編成 全達成 = 変更前の数（REAL 8886Pt・67種・●75・△10／VARY 7159Pt・54種・●63・△15）', all.fixed);
		assert(JSON.stringify(def.fixed) === JSON.stringify(EXPECT.none), '取得切替(1) 固定の編成 既定（未達成） REAL 8742Pt・66種・●74・△10／VARY 7042Pt・53種・●62・△15', def.fixed);
		const sum = (M, name, f) => Object.keys(M.rows).filter((k) => k.endsWith('/' + name)).reduce((s, k) => s + M.rows[k][f], 0);
		console.log('  （参考）271衣装の合計 Pt 単独 ' + sum(all, 'solo', 'total') + '→' + sum(def, 'solo', 'total') + '／REAL ' + sum(all, 'real', 'total') + '→' + sum(def, 'real', 'total') + '／VARY ' + sum(all, 'vary', 'total') + '→' + sum(def, 'vary', 'total'));
		assert(jsErrors(sp.errors).length === 0, '取得切替(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('取得切替(1b) 計算: 無効な保存値は未達成／達成の鍵だけが効く／結果の切り替えに従う（条件文のあるイベントは常に結果1）', async () => {
		const sp = await openCore(null);
		const e0 = TR.find((e) => userKeysOf(e).length >= 2);
		const [k0, k1] = userKeysOf(e0);
		const r0 = { umaId: e0.umaId, cardIds: [] };
		const res = await sp.page.evaluate(async ({ r0, k0, k1 }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const j = (picks) => JSON.stringify(C.getRosterPtDetail(Object.assign({}, r0, picks === undefined ? {} : { acquirePicks: picks })));
			const base = j(undefined);
			const bad = { 'no-such#1': true, 'card:card-9999#0': true, 'uma:uma-0001#999': true };
						const invalid = [false, 1, 'true', null, 0, 'x', [true], { a: true }, NaN, 2];
			const allInvalid = invalid.every((v) => j({ [k0]: v, [k1]: v }) === base);
			const proto = JSON.parse('{"__proto__":true}');
			const one = j({ [k0]: true });
			const both = j({ [k0]: true, [k1]: true });
			const sk = (picks) => JSON.stringify(C.computeRosterSkills(r0, { autoChoose: true, acquirePicks: picks }).skillIds);
			const acq = (picks, seen) => C.computeRosterSkills(r0, { autoChoose: true, acquirePicks: picks, acquireSeen: seen }).acquireEvents.map((e) => [e.eventKey, e.acquired, e.unseen]);
			const out = { empty: j({}) === base, bad: j(bad) === base && allInvalid, proto: j(proto) === base, arr: j([true, true]) === base, str: j('x') === base, nul: j(null) === base,
				oneDiffers: one !== base, bothDiffers: both !== one, onlyKey: sk({ [k0]: true, 'uma:other#0': true }) === sk({ [k0]: true }),
				falseKey: j({ [k0]: false }) === base };
			out.acq0 = acq(undefined, false); out.acq1 = acq({ [k0]: true }, false); out.acq2 = acq({ [k0]: true }, true); out.acq3 = acq(undefined, true);
			return out;
		}, { r0, k0, k1 });
		assert(res.empty && res.bad && res.proto && res.arr && res.str && res.nul && res.falseKey,
			'取得切替(1b) 空・知らない鍵・true 以外（false・数・文字・null・配列・オブジェクト・NaN）・配列・文字列・null・__proto__ は、すべて未達成（既定と同一の Pt）', res);
		assert(res.oneDiffers && res.bothDiffers && res.onlyKey, '取得切替(1b) 達成にした鍵のイベントだけが数えられ、知らない鍵は何もしない', res);
		const flags = (a) => a.map((x) => (x[1] ? 'A' : '-') + (x[2] ? 'U' : '-'));
		const allOf = (a, v, from = 0) => a.slice(from).every((x) => x === v);
		assert(allOf(flags(res.acq0), '-U') && flags(res.acq1)[0] === 'A-' && allOf(flags(res.acq1), '-U', 1) && flags(res.acq2)[0] === 'A-' && allOf(flags(res.acq2), '--', 1) && allOf(flags(res.acq3), '--'),
			'取得切替(1b) acquireEvents: 未確認（unseen）は「達成にしていない」かつ「確認済みでない」ときだけ。達成にした／確認済みなら unseen でない', { acq0: flags(res.acq0).join(), acq1: flags(res.acq1).join(), acq2: flags(res.acq2).join(), acq3: flags(res.acq3).join() });
		// 結果の切り替えに従う: 条件文のないイベントを user にした合成データ（現行のデータには無い形）で、達成にしたとき resultPicks の位置が効く
		const target = TR.map((e) => ({ e, i: e.events.findIndex((ev) => !ev.condition && ev.choices.some((c) => Array.isArray(c.results) && c.results.length >= 2 && c.results.some((r, m) => JSON.stringify(r) !== JSON.stringify(c.results[0])))) })).find((x) => x.i >= 0);
		const tkey = 'uma:' + target.e.umaId + '#' + target.i;
		const spU = await openCore((es) => { es.find((e) => e.umaId === target.e.umaId).events[target.i].acquireMode = 'user'; es.find((e) => e.umaId === target.e.umaId).events[target.i].acquireNote = 'x'; });
		const spF = await openCore(null);
		const run = (page, roster, o) => page.evaluate(async ({ roster, o }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const res = C.computeRosterSkills(roster, o);
			return JSON.stringify([res.skillIds, res.sources.filter((s) => s.eventKey && s.eventKey.indexOf(roster.umaId) !== -1)]);
		}, { roster, o });
		const R = { umaId: target.e.umaId, cardIds: [] };
		for (const pos of [0, 1, 2]) {
			const picks = { [tkey]: pos };
			const want = await run(spF.page, R, { autoChoose: true, resultPicks: picks });
			const got = await run(spU.page, R, { autoChoose: true, resultPicks: picks, acquirePicks: { [tkey]: true } });
			const off = await run(spU.page, R, { autoChoose: true, resultPicks: picks });
			assert(got === want, '取得切替(1b) 達成にしたら結果の切り替えに従う（結果の位置 ' + pos + '＝従来の数え方と同一）', { tkey, pos });
			if (pos > 0) assert(off !== want, '取得切替(1b) 未達成なら結果の位置を何にしても数えない（位置 ' + pos + '）', { tkey });
		}
		await spU.ctx.close(); await spF.ctx.close();
		await sp.ctx.close();
	});

	await block('取得切替(1c) 数: user のイベント ' + allUser + '件（単一選択肢／複数選択肢）・衣装ごとの件数の分布が、データから独立に数えた値と一致する', async () => {
		const exp = { single: 0, multi: 0, perUma: {} };
		TR.forEach((e) => {
			let n = 0;
			e.events.forEach((ev) => { if (ev.acquireMode === 'user') { n++; if (ev.choices.length >= 2) exp.multi++; else exp.single++; } });
			exp.perUma[n] = (exp.perUma[n] || 0) + 1;
		});
		const sp = await openCore(null);
		const got = await sp.page.evaluate(async ({ umaIds }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const r = { single: 0, multi: 0, perUma: {}, infoUser: 0, unseenEach: 0, eventsPendingUser: 0 };
			umaIds.forEach((id) => {
				const res = C.computeRosterSkills({ umaId: id, cardIds: [] }, { autoChoose: true });
				const list = res.acquireEvents;
				r.perUma[list.length] = (r.perUma[list.length] || 0) + 1;
				list.forEach((e) => { if (e.multi) r.multi++; else r.single++; if (e.unseen) r.unseenEach++; });
			});
			return r;
		}, { umaIds: TR.map((e) => e.umaId) });
		assert(got.single === exp.single && got.multi === exp.multi && JSON.stringify(got.perUma) === JSON.stringify(exp.perUma) && got.unseenEach === exp.single + exp.multi,
			'取得切替(1c) acquireEvents: user のイベント ' + (exp.single + exp.multi) + '件（単一選択肢' + exp.single + '＋複数選択肢' + exp.multi + '）・衣装ごとの件数の分布 ' + JSON.stringify(exp.perUma) + '・未確認はすべて', { got, exp });
		console.log('  （参考）user のイベント ' + (exp.single + exp.multi) + '件: 単一選択肢' + exp.single + '／複数選択肢' + exp.multi + '。衣装ごとの件数の分布 {件数: 衣装数} ' + JSON.stringify(exp.perUma));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (2) 小窓: イベント欄の箱・ボタン・補足文・保存・「！」「未選択N件」・確認済み・元に戻す・リセット・インポート
	 * ==================================================================== */
	const P = '#deck-roster-panel ';
	const BAR = '#deck-set-bar ';
	const BAD_WORDS = /ヒント|必ず合う|合うことがある|合わない/;
	const CARDS6 = REAL.cardIds;
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, o.userData || EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		const scen = readJson('data/scenario-event-skills.json');
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(scen) }));
		const roster = Object.assign({ umaId: 'uma-0064', cardIds: CARDS6 }, o.roster || {});
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
	const rawDraft = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
	const draftR = async (page) => JSON.parse(await rawDraft(page));
	const bandTotal = (page) => page.evaluate(() => Number(document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]').textContent.replace(/[^0-9]/g, '')));
	const undoCount = (page) => page.evaluate(() => UmaSkillDeckCore.undoCount());
	// 小窓が開いていると「元に戻す」のボタンが隠れるので、閉じてから押す
	const undo = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(250); await page.click('#deck-undo-btn'); await page.waitForTimeout(350); };
	const ptTotal = (page, roster) => page.evaluate(async (roster) => { const C = UmaSkillDeckCore; await C.loadTrainingSources(); await C.loadSkillPtData(); return C.getRosterPtDetail(roster).total; }, roster);
	const badge = (page, key = 0) => page.evaluate((key) => { const b = document.querySelector('#deck-roster-panel [data-usd-el="events-btn"][data-member-key="' + key + '"]');
		return b && { text: b.textContent, un: Number(b.getAttribute('data-unselected')), dot: !!b.querySelector('[data-usd-el="result-dot"]'), acq: b.getAttribute('data-acquire-picked'), aria: b.getAttribute('aria-label') }; }, key);
	const openPop = async (page, member = 0) => { await page.click(P + '[data-usd-el="events-btn"][data-member-key="' + member + '"]'); await page.waitForTimeout(400); };
	const closePop = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(250); };
	const evsOf = (umaId) => TR.find((e) => e.umaId === umaId).events.map((ev, i) => ({ ev, i, key: 'uma:' + umaId + '#' + i }));
	/** 達成のボタンに出るはずの文字（全選択肢の分を、スキルごとに最大の Lv でまとめる。results があれば結果1） */
	const expectLabel = (ev) => {
		const m = new Map();
		ev.choices.forEach((c) => (Array.isArray(c.results) ? c.results[0] : c.skills).forEach((r) => { const cur = m.get(r.skillId); if (!cur || r.hintLevel > cur.hintLevel) m.set(r.skillId, r); }));
		return Array.from(m.values()).map((r) => r.name + ' Lv' + r.hintLevel);
	};
	const UMA_S = 'uma-0064';   // user 1件（単一選択肢）＋ fixed の読み取り専用 1件
	const UMA_M = 'uma-0196';   // user の複数選択肢のイベントを持つ
	const UMA_FIXED = 'uma-0040';   // ナリタブライアン（Maverick）: user のイベントが無い

	await block('取得切替(2) 小窓: user のイベントは補足文・ボタンの行つきの箱／fixed は読み取り専用のまま／複数選択肢は選択肢の箱の中に行を足す／既定は未達成・どちらも押せる', async () => {
		for (const umaId of [UMA_S, UMA_M]) {
			const sp = await openSp({ roster: { umaId } });
			const evs = evsOf(umaId);
			const users = evs.filter((x) => x.ev.acquireMode === 'user');
			await openPop(sp.page);
			const dom = await sp.page.evaluate(() => {
				const left = document.querySelector('[data-usd-el="events-pane-events"]');
				const boxes = Array.from(left.querySelectorAll('[data-usd-el="event-acquire"], [data-usd-el="event"], [data-usd-el="event-info"], [data-usd-el="event-result"]'));
				return { boxes: boxes.map((b) => ({ kind: b.getAttribute('data-usd-el'), key: b.getAttribute('data-event-key'), hasGroup: !!b.querySelector('[data-usd-el="acquire-group"]'),
					kids: Array.from(b.children).map((c) => c.getAttribute('data-usd-el') || c.className.split(' ')[0]),
					note: (b.querySelector('[data-usd-el="acquire-note"]') || {}).textContent || null, cond: (b.querySelector('[data-usd-el="event-cond"]') || {}).textContent || null,
					btns: Array.from(b.querySelectorAll('[data-usd-el="acquire-choice"]')).map((x) => ({ on: x.classList.contains('usd-roster-choice--on'), checked: x.getAttribute('aria-checked'), disabled: x.disabled, a: x.getAttribute('data-acquire'),
						text: x.querySelector('.usd-roster-choicelabel').textContent, skills: Array.from(x.querySelectorAll('.usd-roster-choiceskill')).map((s) => s.textContent) })) })),
					text: left.textContent };
			});
			const keyed = new Map(dom.boxes.map((b) => [b.key, b]));
			for (const u of users) {
				const b = keyed.get(u.key);
				const multi = u.ev.choices.length >= 2;
				assert(b && b.hasGroup && b.kind === (multi ? 'event' : 'event-acquire'), '取得切替(2) ' + umaId + ' ' + u.key + ' は' + (multi ? '選択肢のボタンの箱の中に' : '補足文とボタンの行だけの箱として') + '未達成／達成の行が出る', b);
				assert(b.note === u.ev.acquireNote && b.cond === u.ev.condition, '取得切替(2) ' + u.key + ' 条件文と補足文（acquireNote）がデータのまま出る', { note: b.note, cond: b.cond });
				const kids = b.kids;
				assert(kids.indexOf('event-cond') < kids.indexOf('acquire-note') && kids.indexOf('acquire-note') < kids.indexOf('acquire-group'), '取得切替(2) ' + u.key + ' 並びは 条件文 → 補足文 → ボタンの行', kids);
				assert(b.btns.length === 2 && b.btns[0].text === '未達成' && b.btns[1].text === '達成' && b.btns[0].on && b.btns[0].checked === 'true' && !b.btns[1].on && b.btns[1].checked === 'false',
					'取得切替(2) ' + u.key + ' ボタンは「未達成」「達成」の2つで、既定は未達成が選ばれている', b.btns);
				assert(b.btns.every((x) => !x.disabled) && b.btns[0].skills.length === 0, '取得切替(2) ' + u.key + ' どちらも押せる（無効にしない）。未達成にはスキルを添えない', b.btns);
				assert(JSON.stringify(b.btns[1].skills) === JSON.stringify(expectLabel(u.ev)), '取得切替(2) ' + u.key + ' 達成のボタンに得るスキル（スキル名 Lv。最大の段階のもの）が併記される', { got: b.btns[1].skills, exp: expectLabel(u.ev) });
			}
			// fixed（条件文のある単一選択肢）は読み取り専用のまま・ボタンの行も補足文も無い
			const fixedInfos = evs.filter((x) => x.ev.acquireMode === 'fixed' && x.ev.choices.length === 1 && x.ev.condition !== '');
			for (const f of fixedInfos) {
				const b = keyed.get(f.key);
				assert(b && b.kind === 'event-info' && !b.hasGroup && b.note === null, '取得切替(2) ' + umaId + ' ' + f.key + '（fixed）は今までの読み取り専用の行のまま（ボタンの行・補足文なし）', b);
			}
			assert(!BAD_WORDS.test(dom.text), '取得切替(2) ' + umaId + ' 小窓のイベント欄に「ヒント」「必ず合う／合うことがある／合わない」の語が出ない', dom.text.match(BAD_WORDS));
			// 並び: 箱は events の並び（位置）の順
			const idx = dom.boxes.map((b) => Number(b.key.split('#')[1]));
			assert(idx.every((v, i) => i === 0 || idx[i - 1] <= v), '取得切替(2) ' + umaId + ' 箱はイベントの並び（位置）の順', idx);
			assert(jsErrors(sp.errors).length === 0, '取得切替(2) ' + umaId + ' コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// fixed だけのキャラクター: ボタンの行も補足文も出ない・バッジは「！」でない
		const spF = await openSp({ roster: { umaId: UMA_FIXED } });
		const bF = await badge(spF.page);
		await openPop(spF.page);
		const none = await spF.page.evaluate(() => ({ groups: document.querySelectorAll('[data-usd-el="acquire-group"]').length, notes: document.querySelectorAll('[data-usd-el="acquire-note"]').length }));
		assert(none.groups === 0 && none.notes === 0 && bF.text !== '!' && !bF.dot, '取得切替(2) fixed だけのキャラクター（' + UMA_FIXED + '）の小窓にはボタンの行も補足文も出ない・「！」も点も出ない', { none, bF });
		await spF.ctx.close();
	});

	await block('取得切替(2b) 押す: 達成にすると保存・合計が変わる・右の「取得できるスキル」に出る／未達成に戻すと鍵も項目も消える／元に戻すは1操作で1回／結果1のまま', async () => {
		const sp = await openSp({ roster: { umaId: UMA_S } });
		const u = evsOf(UMA_S).find((x) => x.ev.acquireMode === 'user');
		const R = { umaId: UMA_S, cardIds: CARDS6 };
		const before = await bandTotal(sp.page);
		assert(before === (await ptTotal(sp.page, R)), '取得切替(2b) 前提: 既定の合計は、acquirePicks なしの計算と同じ', before);
		await openPop(sp.page);
		const rightBefore = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="ev-skills"] [data-usd-el="ev-skill"]')).map((x) => x.getAttribute('data-skill-id')));
		const u0 = await undoCount(sp.page);
		await sp.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="1"]');
		await sp.page.waitForTimeout(400);
		const d1 = await draftR(sp.page);
		const expTotal = await ptTotal(sp.page, Object.assign({}, R, { acquirePicks: { [u.key]: true } }));
		assert(JSON.stringify(d1.acquirePicks) === JSON.stringify({ [u.key]: true }), '取得切替(2b) 達成にすると acquirePicks に { 鍵: true } だけが保存される', d1.acquirePicks);
		assert((await bandTotal(sp.page)) === expTotal && expTotal > before, '取得切替(2b) 帯の合計が達成後の値になる（' + before + '→' + expTotal + '）', await bandTotal(sp.page));
		const rightAfter = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="ev-skills"] [data-usd-el="ev-skill"]')).map((x) => x.getAttribute('data-skill-id')));
		const gained = (Array.isArray(u.ev.choices[0].results) ? u.ev.choices[0].results[0] : u.ev.choices[0].skills).map((r) => r.skillId);
		assert(gained.every((id) => rightAfter.indexOf(id) !== -1 && rightBefore.indexOf(id) === -1), '取得切替(2b) 達成にすると、得るスキル（' + gained.join('・') + '）が右の「取得できるスキル」に出る（未達成では出ない）', { rightBefore: rightBefore.length, rightAfter: rightAfter.length });
		const btns = await sp.page.evaluate((k) => Array.from(document.querySelectorAll('[data-usd-el="acquire-choice"][data-event-key="' + k + '"]')).map((b) => b.classList.contains('usd-roster-choice--on')), u.key);
		assert(btns[1] && !btns[0], '取得切替(2b) 押したあと、小窓が描き直されて「達成」が選ばれている', btns);
		assert((await undoCount(sp.page)) === u0 + 1, '取得切替(2b) 切り替えは元に戻すに1回だけ積まれる', { u0, now: await undoCount(sp.page) });
		const dot = await badge(sp.page);
		assert(dot.dot && dot.acq === '1', '取得切替(2b) 達成にした列のバッジに点（data-acquire-picked=1）', dot);
		// 結果の切り替えに従う: 条件文のあるイベントは resultPicks を何にしても結果1
		assert((await ptTotal(sp.page, Object.assign({}, R, { acquirePicks: { [u.key]: true }, resultPicks: { [u.key]: 2 } }))) === expTotal, '取得切替(2b) 達成のイベントも結果の切り替えに従う（条件文のあるイベントは結果1のまま）', null);
		// 未達成に戻す → 鍵も項目も消える
		await sp.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="0"]');
		await sp.page.waitForTimeout(400);
		const d0 = await draftR(sp.page);
		assert(!('acquirePicks' in d0) && (await bandTotal(sp.page)) === before, '取得切替(2b) 未達成に戻すと、鍵が消えて acquirePicks は項目ごと消える・合計も最初に戻る', d0.acquirePicks);
		// 元に戻す: 1回で戻る（達成 → 未達成 の2操作を、2回で戻る）
		await undo(sp.page);
		assert(JSON.stringify((await draftR(sp.page)).acquirePicks) === JSON.stringify({ [u.key]: true }), '取得切替(2b) 「元に戻す」1回で、直前の1操作（未達成に戻したこと）だけが戻る', null);
		await undo(sp.page);
		assert(!('acquirePicks' in (await draftR(sp.page))), '取得切替(2b) もう1回で最初（未達成）に戻る', null);
		assert(jsErrors(sp.errors).length === 0, '取得切替(2b) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('取得切替(3) 確認済み: 開くまで「！」と「未選択N件」に数える／開くと数えず元に戻すに積まない／切り替えでも確認済み／別のキャラクターなら未確認に戻る／保存値は書き換えない', async () => {
		const expectedUnsel = (roster, seen) => openSp({ roster }).then(async (sp) => { const n = await sp.page.evaluate(async ({ roster, seen }) => {
			const C = UmaSkillDeckCore; await C.loadTrainingSources(); await C.loadSkillPtData(); await C.loadScenarioEvents(false);
			const r = C.computeRosterSkills(roster, { autoChoose: true, acquireSeen: seen });
			return r.events.filter((e) => e.memberKey === 0 && e.pending).length + r.acquireEvents.filter((e) => e.unseen).length; }, { roster, seen }); await sp.ctx.close(); return n; });
		const userN = evsOf(UMA_S).filter((x) => x.ev.acquireMode === 'user').length;
		const sp = await openSp({ roster: { umaId: UMA_S } });
		const b0 = await badge(sp.page);
		const n0 = await expectedUnsel({ umaId: UMA_S, cardIds: CARDS6 }, false);
		assert(b0.un === n0 && b0.un >= userN && b0.text === '!' && /未選択/.test(b0.aria), '取得切替(3) 開く前: user のイベント（' + userN + '件）が「！」と「未選択N件」に数えられる（' + b0.un + '件）', b0);
		const raw0 = await rawDraft(sp.page);
		const u0 = await undoCount(sp.page);
		await openPop(sp.page);
		const d1 = await draftR(sp.page);
		assert(d1.acquireSeen === UMA_S && !('acquirePicks' in d1), '取得切替(3) 開くと acquireSeen に今の umaId が入る（acquirePicks は触らない）', d1);
		assert((await undoCount(sp.page)) === u0, '取得切替(3) 小窓を開いて acquireSeen を書くことは、元に戻すに積まない', { u0, now: await undoCount(sp.page) });
		const b1 = await badge(sp.page);
		assert(b1.un === b0.un - userN, '取得切替(3) 開いたあとは user のイベントを数えない（' + b0.un + '→' + b1.un + '）', b1);
		const shownUnsel = await sp.page.evaluate(() => (document.querySelector('[data-usd-el="events-unselected"]') || {}).textContent);
		assert(shownUnsel === '未選択' + b1.un + '件', '取得切替(3) 小窓の「未選択N件」も、開いた時点で数えない', shownUnsel);
		await closePop(sp.page);
		// もう一度開いても何も書き換わらない
		const raw1 = await rawDraft(sp.page);
		await openPop(sp.page); await closePop(sp.page);
		assert((await rawDraft(sp.page)) === raw1, '取得切替(3) 2回目に開いても保存データは変わらない', null);
		await sp.ctx.close();
		// 開き直し（保存した確認済みを入れて開く）: 戻らない。別のキャラクターの確認済みなら、未確認に戻る（保存値は1バイトも変わらない）
		const spSeen = await openSp({ roster: { umaId: UMA_S, acquireSeen: UMA_S } });
		const bs = await badge(spSeen.page);
		assert(bs.un === b1.un, '取得切替(3) 確認済みを保存して開き直しても、user のイベントは数えない', bs);
		await spSeen.ctx.close();
		const other = { umaId: UMA_S, cardIds: CARDS6, acquireSeen: 'uma-0001' };
		const spOther = await openSp({ roster: other });
		const bo = await badge(spOther.page);
		assert(bo.un === b0.un, '取得切替(3) acquireSeen が別の umaId（別のキャラクターで確認した値）なら、未確認に戻って数える', bo);
		const rawOther = JSON.parse(await rawDraft(spOther.page));
		assert(rawOther.acquireSeen === 'uma-0001', '取得切替(3) 別の umaId の acquireSeen は、開いただけでは書き換えない', rawOther);
		await spOther.ctx.close();
		// 切り替えたときも確認済みにする（小窓を開かずに切り替えることはできないが、開いた時点で確認済み。切り替えのあとも同じ）
		const spT = await openSp({ roster: { umaId: UMA_S } });
		await openPop(spT.page);
		const u = evsOf(UMA_S).find((x) => x.ev.acquireMode === 'user');
		await spT.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="1"]');
		await spT.page.waitForTimeout(350);
		await undo(spT.page);
		assert((await draftR(spT.page)).acquireSeen === UMA_S, '取得切替(3) 切り替えを元に戻しても、確認済み（acquireSeen）は戻さない', await draftR(spT.page));
		await spT.ctx.close();
		// 未達成のまま確認済みにしたとき（開いただけ）、達成のイベントは「！」に数えない
		const spA = await openSp({ roster: { umaId: UMA_S, acquirePicks: { [u.key]: true } } });
		const ba = await badge(spA.page);
		assert(ba.un === b0.un - userN, '取得切替(3) 達成にしたイベントは、確認前でも未確認に数えない（' + ba.un + '件）', ba);
		await spA.ctx.close();
	});

	await block('取得切替(4) 保存・読み込み・リセット・元に戻す・インポート: 項目の無い保存は1バイトも変わらない／知らない鍵は残す／中身をすべて消すで両方消え元に戻すで戻る／インポート→元に戻すで書き換わらない（ルール28）', async () => {
		const SAVED = (extra) => ({ schemaVersion: 7, records: [], customSkills: [], templates: [
			{ templateId: 't1', name: 'S1', skillIds: [], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }],
			rosters: [Object.assign({ rosterId: 'r1', name: 'S1', umaId: UMA_S, star: 3, awakeningLevel: 5, cardIds: CARDS6.slice(), createdAt: 'x', updatedAt: 'x' }, extra || {})] });
		const rawUd = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
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
		const u = evsOf(UMA_S).find((x) => x.ev.acquireMode === 'user');
		const seed = SAVED();
		const sp = await open2(seed);
		assert((await rawUd(sp.page)) === JSON.stringify(seed), '取得切替(4)(a) acquirePicks・acquireSeen の無い保存データを開いてセットを選んでも、1バイトも変わらない（読み込み時に補わない・移行しない）', null);
		const base0 = await bandTotal(sp.page);
		assert(base0 === (await ptTotal(sp.page, seed.rosters[0])), '取得切替(4)(a) 保存済みの編成の合計は、既定（未達成）の値', base0);
		// (b) 小窓を開く → acquireSeen が保存される（schemaVersion は 7 のまま）。切り替える → acquirePicks
		await openPop(sp.page);
		const r1 = await rosterOf(sp.page);
		assert(r1.acquireSeen === UMA_S && !('acquirePicks' in r1) && JSON.parse(await rawUd(sp.page)).schemaVersion === 7, '取得切替(4)(b) 開くと保存済みの編成に acquireSeen だけが入る（schemaVersion は 7 のまま）', r1);
		await sp.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="1"]');
		await sp.page.waitForTimeout(350);
		await closePop(sp.page);
		const savedNow = await rawUd(sp.page);
		assert(JSON.stringify((await rosterOf(sp.page)).acquirePicks) === JSON.stringify({ [u.key]: true }), '取得切替(4)(b) 達成にすると rosters の acquirePicks に { 鍵: true } が入る', null);
		const total1 = await bandTotal(sp.page);
		const spR = await open2(JSON.parse(savedNow));
		assert((await bandTotal(spR.page)) === total1 && (await rawUd(spR.page)) === savedNow, '取得切替(4)(b) 開き直しても、合計が同じ（保存データも1バイトも変わらない）', { total1, now: await bandTotal(spR.page) });
		await spR.ctx.close();
		// (c) 元に戻す: 切り替えだけが戻る（acquireSeen は残る）
		await undo(sp.page);
		const r2 = await rosterOf(sp.page);
		assert(!('acquirePicks' in r2) && r2.acquireSeen === UMA_S && (await bandTotal(sp.page)) === base0, '取得切替(4)(c) 「元に戻す」で acquirePicks が項目ごと消え、合計も既定に戻る（acquireSeen は残る）', r2);
		// (d) リセット（中身をすべて消す）で、acquirePicks と acquireSeen の両方が消える。元に戻すで戻る。「取得しないスキルを戻す」は触らない
		await openPop(sp.page);
		await sp.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="1"]');
		await sp.page.waitForTimeout(350);
		await closePop(sp.page);
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click('[data-usd-el="roster-reset-off"]');
		await sp.page.waitForTimeout(300);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(250);
		const r3 = await rosterOf(sp.page);
		assert(JSON.stringify(r3.acquirePicks) === JSON.stringify({ [u.key]: true }) && r3.acquireSeen === UMA_S, '取得切替(4)(d) 「取得しないスキルを戻す」は acquirePicks・acquireSeen に触らない', r3);
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(400);
		const cleared = await rosterOf(sp.page);
		assert(!('acquirePicks' in cleared) && !('acquireSeen' in cleared) && cleared.umaId === '', '取得切替(4)(d) 「中身をすべて消す」で acquirePicks と acquireSeen の両方が消える', cleared);
		await undo(sp.page);
		const restored = await rosterOf(sp.page);
		assert(JSON.stringify(restored.acquirePicks) === JSON.stringify({ [u.key]: true }) && restored.acquireSeen === UMA_S && restored.umaId === UMA_S, '取得切替(4)(d) 「元に戻す」で、リセット前（acquirePicks・acquireSeen・衣装）に戻る', restored);
		assert(jsErrors(sp.errors).length === 0, '取得切替(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// (d2) acquireSeen だけの編成は「中身」と数えない（空の編成のリセットを押せるかは umaId・カード・acquirePicks など中身で決まる）
		const onlySeen = await openSp({ roster: { umaId: '', cardIds: [null, null, null, null, null, null], acquireSeen: UMA_S } });
		const hc = await onlySeen.page.evaluate(() => ({ resettable: !!document.querySelector('#deck-roster-panel [data-usd-el="roster-reset"]') && !document.querySelector('#deck-roster-panel [data-usd-el="roster-reset"]').disabled }));
		assert(hc.resettable === false, '取得切替(4)(d2) acquireSeen だけの編成は、リセットの対象（中身）に数えない', hc);
		await onlySeen.ctx.close();
		// (e) 知らない鍵・崩れた値の入った保存データは、開いただけでは1バイトも変わらない。未達成として数える。切り替えたのはその1つだけ
		const junk = { 'no-such#1': true, 'card:card-9999#0': true, [u.key]: 'yes' };
		const seed2 = SAVED({ acquirePicks: junk, acquireSeen: 12345 });
		const sp2 = await open2(seed2);
		assert((await rawUd(sp2.page)) === JSON.stringify(seed2), '取得切替(4)(e) 知らない鍵・true 以外の値・形の崩れた acquireSeen の入った保存データも、開いただけでは1バイトも変わらない', null);
		assert((await bandTotal(sp2.page)) === base0, '取得切替(4)(e) 無効な値は未達成として数える（合計は既定のまま）', await bandTotal(sp2.page));
		await openPop(sp2.page);
		await sp2.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="1"]');
		await sp2.page.waitForTimeout(300);
		const k2 = (await rosterOf(sp2.page)).acquirePicks;
		assert(JSON.stringify(k2) === JSON.stringify(Object.assign({}, junk, { [u.key]: true })), '取得切替(4)(e) 切り替えたのはその1つの鍵だけ（知らない鍵はそのまま残る）', k2);
		await sp2.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="0"]');
		await sp2.page.waitForTimeout(300);
		const k3 = (await rosterOf(sp2.page)).acquirePicks;
		assert(JSON.stringify(k3) === JSON.stringify({ 'no-such#1': true, 'card:card-9999#0': true }), '取得切替(4)(e) 未達成に戻すと、その1つの鍵だけを外す（知らない鍵は残る）', k3);
		await sp2.ctx.close();
		// (f) Deck: acquirePicks・acquireSeen つきの保存データを書き出し→取り込み→「元に戻す」で、取り込み前と一致する（ルール28）
		const seed3 = SAVED({ acquirePicks: { [u.key]: true, 'no-such#1': true }, acquireSeen: UMA_S });
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, seed3);
		await dk.page.click('#tab-btn-data');
		await dk.page.waitForTimeout(300);
		const state = () => dk.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const bef = await state();
		const exp = await dk.page.evaluate(() => { exportData(); return document.getElementById('export-textarea').value; });
		const er = JSON.parse(exp).rosters[0];
		assert(JSON.stringify(er.acquirePicks) === JSON.stringify({ [u.key]: true, 'no-such#1': true }) && er.acquireSeen === UMA_S, '取得切替(4)(f) 書き出しに acquirePicks・acquireSeen が入る（知らない鍵も含めてそのまま）', er);
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = JSON.stringify(v); const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, EMPTY);
		const un = await dk.page.evaluate(() => ({ ok: performUndo() }));
		await dk.page.waitForTimeout(300);
		assert(un.ok && (await state()) === bef, '取得切替(4)(f) 取り込み→「元に戻す」で、acquirePicks・acquireSeen つきのデータが取り込み前と一致する（移行で書き換わらない）', un);
		assert(dk.errors.length === 0, '取得切替(4)(f) Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
	});

	/* ====================================================================
	 * (5) スマホの小窓: 「イベント」「スキル」のタブ（①②③のタブと同じ部品・同じスワイプの決まり）
	 * ==================================================================== */
	/** sel の要素の上で、横 dx・縦 dy のタッチの動きを作る（Touch を合成して送る。blocks-18 の swipe と同じ作り） */
	const swipeOn = (page, sel, dx, dy) => page.evaluate(({ sel, dx, dy }) => {
		const el = document.querySelector(sel);
		const r = el.getBoundingClientRect();
		const x = r.left + Math.min(r.width / 2, 120), y = r.top + Math.min(r.height / 2, 40);
		const mk = (type, cx, cy) => {
			const t = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
			return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] });
		};
		el.dispatchEvent(mk('touchstart', x, y));
		el.dispatchEvent(mk('touchmove', x + dx / 2, y + dy / 2));
		el.dispatchEvent(mk('touchend', x + dx, y + dy));
		const a = document.querySelector('[data-usd-el="events-tab"][aria-selected="true"]');
		return a ? a.getAttribute('data-pane') : null;
	}, { sel, dx, dy });
	const tabView = (page) => page.evaluate(() => {
		const shown = (e) => !!e && e.getClientRects().length > 0;
		const pop = document.querySelector('[data-usd-el="info-pop"]');
		const tabs = pop.querySelector('[data-usd-el="events-tabs"]');
		const l = pop.querySelector('[data-usd-el="events-pane-events"]'), r = pop.querySelector('[data-usd-el="events-pane-skills"]');
		const tr = tabs.getBoundingClientRect();
		return { tabs: shown(tabs), left: shown(l), right: shown(r), sel: Array.from(pop.querySelectorAll('[data-usd-el="events-tab"]')).map((t) => t.getAttribute('aria-selected')).join(),
			tabIdx: Array.from(pop.querySelectorAll('[data-usd-el="events-tab"]')).map((t) => t.tabIndex).join(), tabH: tr.height, popH: pop.getBoundingClientRect().height,
			lr: l.getBoundingClientRect(), rr: r.getBoundingClientRect(), ox: document.documentElement.scrollWidth - document.documentElement.clientWidth };
	});

	await block('取得切替(5) スマホの小窓のタブ: 「イベント」「スキル」で2つの欄が切り替わる／左右スワイプ・←→でも切り替わる（端では変わらない）／縦の動きでは変わらない／閉じるが使える／PC幅（2列）は変わらない', async () => {
		for (const [w, scheme] of [[390, 'light'], [360, 'light'], [390, 'dark']]) {
			const sp = await openSp({ roster: { umaId: UMA_S }, w, scheme });
			await openPop(sp.page);
			const tag = '取得切替(5) ' + w + '/' + scheme + ' ';
			const v0 = await tabView(sp.page);
			assert(v0.tabs && v0.left && !v0.right && v0.sel === 'true,false' && v0.tabIdx === '0,-1', tag + '開いたときの既定は「イベント」のタブ（イベントの欄だけが見える）', v0);
			assert(v0.tabH <= 48, tag + '小窓に足した高さはタブの1行分（' + Math.round(v0.tabH) + 'px）', v0.tabH);
			// タブを押す
			await sp.page.click('[data-usd-el="events-tab"][data-pane="1"]');
			await sp.page.waitForTimeout(250);
			const v1 = await tabView(sp.page);
			assert(!v1.left && v1.right && v1.sel === 'false,true' && v1.tabIdx === '-1,0', tag + '「スキル」のタブで「取得できるスキル」の欄に切り替わる', v1);
			await sp.page.click('[data-usd-el="events-tab"][data-pane="0"]');
			await sp.page.waitForTimeout(250);
			assert((await tabView(sp.page)).left, tag + '「イベント」のタブで戻る', null);
			// 左右スワイプ（①②③と同じ決まり: 60px 以上・縦の2倍より大きい。左へ払うと次・右へ払うと前・端では何もしない）
			const sel = '[data-usd-el="events-panes"]';
			assert((await swipeOn(sp.page, sel, 30, 0)) === '0' && (await swipeOn(sp.page, sel, -100, 80)) === '0', tag + '短い動き（30px）・縦に大きい動きでは切り替わらない', null);
			assert((await swipeOn(sp.page, sel, 100, 0)) === '0', tag + '最初のタブで右へ払っても何も起きない（端）', null);
			assert((await swipeOn(sp.page, sel, -100, 10)) === '1', tag + '左へ払うと「スキル」に切り替わる', null);
			assert((await swipeOn(sp.page, sel, -100, 10)) === '1', tag + '最後のタブで左へ払っても何も起きない（端）', null);
			assert((await swipeOn(sp.page, sel, 100, 10)) === '0', tag + '右へ払うと「イベント」に戻る', null);
			// キー（←→・Home/End。①②③のタブと同じ）
			await sp.page.focus('[data-usd-el="events-tab"][data-pane="0"]');
			await sp.page.keyboard.press('ArrowRight');
			await sp.page.waitForTimeout(150);
			assert((await tabView(sp.page)).sel === 'false,true', tag + '→ キーで次のタブへ', null);
			await sp.page.keyboard.press('Home');
			await sp.page.waitForTimeout(150);
			assert((await tabView(sp.page)).sel === 'true,false', tag + 'Home キーで最初のタブへ', null);
			// 縦スクロール: イベントの欄は縦にスクロールできる（タブに妨げられない）
			const scroll = await sp.page.evaluate(() => { const l = document.querySelector('[data-usd-el="events-pane-events"]'); l.scrollTop = 40; return { st: l.scrollTop, can: l.scrollHeight > l.clientHeight, oy: getComputedStyle(l).overflowY }; });
			assert(!scroll.can || scroll.st > 0, tag + '縦スクロールできる（イベントの欄）', scroll);
			assert((await tabView(sp.page)).ox <= 0, tag + '横スクロールが出ない', await tabView(sp.page));
			// 閉じるボタン
			await sp.page.click('[data-usd-el="info-pop"] .uma-popover-close');
			await sp.page.waitForTimeout(300);
			assert(await sp.page.evaluate(() => { const p = document.querySelector('[data-usd-el="info-pop"]'); return !p || p.hidden || p.getClientRects().length === 0; }), tag + '閉じるボタンで小窓が閉じる（タブに隠れない）', null);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// PC幅（2列）: タブは出さず、2つの欄が並んだまま（これまでどおり）
		const pc = await openSp({ roster: { umaId: UMA_S }, w: 1280, h: 900 });
		await openPop(pc.page);
		const vp = await tabView(pc.page);
		assert(!vp.tabs && vp.left && vp.right && vp.rr.left >= vp.lr.right - 1 && vp.rr.left > vp.lr.left + 300, '取得切替(5) 1280px: タブは出ず、「イベント」「取得できるスキル」の2列が並んだまま', { tabs: vp.tabs, l: vp.lr.left, r: vp.rr.left });
		assert((await swipeOn(pc.page, '[data-usd-el="events-panes"]', -100, 0)) === '0', '取得切替(5) 1280px: 左右の動きでは何も切り替わらない（2列のまま）', null);
		await pc.ctx.close();
	});
}
