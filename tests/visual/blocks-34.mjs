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
}
