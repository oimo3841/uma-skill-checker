import { reloadReady } from './lib/page-ready.mjs';
import { withEventScenarioFirst } from './lib/scenario-doc.mjs';
import { clickEvents } from './lib/col-menu.mjs';
// ①の育成ウマ娘のイベントの取得の切り替え（2026-10-17。データの acquireMode が "user"＝ユーザー選択次第のイベント）の検査。
// run-smoke.mjs の末尾から register34() で呼ばれる（塊の見出しはすべて「取得切替」で始まる。`npm run test:visual -- --only=取得切替` で回せる）。
//
// 決め: acquireMode が "user" のイベントは既定で未選択（roster.acquirePicks = { イベントの鍵: 段階の番号（0始まりの整数） } に有効な番号が入っていなければ、スキルを数えない）。
//   段階は acquireOptions の要素の番号（条件のゆるい順）。acquireOptions の無い user のイベントは番号0だけが有効（ボタン1つ）。true は番号0として読む（前の版の保存値との互換）。
//   範囲外・小数・負・文字列・配列・知らない鍵は無効（＝未選択）。選んだ段階のスキルだけを数える（acquireOptions があれば acquireOptions[番号].skills、無ければこれまでどおり choices・結果）。
//   "fixed" と acquireMode の無いイベントは今までどおり。
//   確認済み（roster.acquireSeen = 確認した時点の umaId）: 今の umaId と同じときだけ。確認前は、何も選んでいない user のイベントを「！」と「未選択N件」に数える。
//   acquireOptions を持つイベントは acquireOptions だけを選択のボタンにし、choices は出さず「選択肢の未選択」にも数えない。
//
// (1) 計算の層（core を直接呼ぶ・画面なし）: 最大の段階を選ぶと従来と同一／既定は user の分だけ減る／無効な値は未選択／段階ごとにその段階のスキルだけ／数

export async function register34(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const REAL = { umaId: 'uma-0001', cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'] };
	const VARY = { umaId: 'uma-0192', cardIds: ['card-0273', 'card-0288', 'card-0311', 'card-0346', 'card-0405', 'card-0248'] };
	const TR = readJson('data/training-event-skills.json').entries;
	const userKeysOf = (e) => { const ks = []; e.events.forEach((ev, i) => { if (ev.acquireMode === 'user') ks.push('uma:' + e.umaId + '#' + i); }); return ks; };
	/** user のイベントごとの、最大の段階の番号（acquireOptions があれば最後の要素、段階なしなら 0） */
	const maxStagesOf = (e) => { const m = {}; e.events.forEach((ev, i) => { if (ev.acquireMode === 'user') m['uma:' + e.umaId + '#' + i] = Array.isArray(ev.acquireOptions) ? ev.acquireOptions.length - 1 : 0; }); return m; };
	const allUser = TR.reduce((s, e) => s + userKeysOf(e).length, 0);
	const allStaged = TR.reduce((s, e) => s + e.events.filter((ev) => Array.isArray(ev.acquireOptions)).length, 0);
	/** 段階の有無を問わず、acquire 系の項目をすべて外した（従来の数え方の）データにする */
	const stripAcquire = (es) => es.forEach((e) => e.events.forEach((ev) => { delete ev.acquireMode; delete ev.acquireNote; delete ev.acquireOptions; }));

	/** special.html を開く。transform を渡すと、育成ウマ娘のイベントのデータをその関数で書き換えて読む（コピーに対して。ファイルは変えない） */
	const openCore = async (transform) => {
		const sp = await openPage(browser, base, 'special.html', { width: 390, height: 900 }, EMPTY);
		const scen = withEventScenarioFirst(readJson('data/scenario-event-skills.json'));
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(scen) }));
		if (transform) {
			const doc = JSON.parse(JSON.stringify({ dataVersion: 'test', category: 'trainingEventSkill', entries: TR }));
			transform(doc.entries);
			await sp.page.route('**/data/training-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(doc) }));
		}
		await reloadReady(sp.page);
		await sp.page.waitForTimeout(400);
		return sp;
	};
	/** 271衣装 × （単独・REAL・VARY）で、計算の出力の部分ごとのハッシュと数を返す。mode: 'all'＝user を最大の段階で選ぶ／'none'＝何も渡さない */
	const measure = (page, mode) => page.evaluate(async ({ umaIds, maxStages, REAL, VARY, mode }) => {
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
				if (mode === 'all' && Object.keys(maxStages[id]).length) r.acquirePicks = Object.assign({}, maxStages[id]);
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
			if (mode === 'all') r.acquirePicks = Object.assign({}, maxStages[ro.umaId] || {});
			const res = C.computeRosterSkills(r, { autoChoose: true, acquirePicks: r.acquirePicks });
			const d = C.getRosterPtDetail(r);
			fixed[n] = [d.total, d.kinds, res.items.filter((i) => i.sure).length, res.items.filter((i) => !i.sure).length];
		}
		return { rows, fixed };
	}, { umaIds: TR.map((e) => e.umaId), maxStages: Object.fromEntries(TR.map((e) => [e.umaId, maxStagesOf(e)])), REAL, VARY, mode });
	const FIELDS = ['skills', 'items', 'sources', 'events', 'resultEvents', 'members', 'pt', 'total', 'kinds', 'sure', 'maybe'];
	const diffRows = (A, B, fields) => Object.keys(A.rows).filter((k) => fields.some((f) => A.rows[k][f] !== B.rows[k][f]));
	// acquireOptions を持ちながら choices も2つ以上あるイベント（見込みはビコーペガサス「ターフの上のヒーロー」のみ）
	const stagedMulti = [];
	TR.forEach((e) => e.events.forEach((ev, i) => { if (Array.isArray(ev.acquireOptions) && ev.choices.length >= 2) stagedMulti.push({ umaId: e.umaId, key: 'uma:' + e.umaId + '#' + i, index: i, name: ev.eventName }); }));

	await block('取得切替(1) 計算: すべて最大の段階を選ぶと従来と同一（acquire 系を外したデータと一致。ビコーペガサス1件を除く）／既定は user の分だけ減る（user を空にしたデータと一致）／固定の編成の前後の数', async () => {
		// (a) 全部の user のイベントで最大の段階 ＝ acquire 系の項目の無いデータ（従来の数え方）。271衣装 × 3 の編成で、出力のハッシュが一致する。
		//     ビコーペガサスの「ターフの上のヒーロー」だけは、従来は「ゲーム内の選択肢が4つ」で選べず、段階を選ぶ今は1つに決まるため一致しない（(1d) で別に確かめる）
		const spOld = await openCore(stripAcquire);
		const old = await measure(spOld.page, 'none');
		await spOld.ctx.close();
		const sp = await openCore(null);
		const all = await measure(sp.page, 'all');
		const bad = diffRows(old, all, FIELDS);
		const exceptUmas = Array.from(new Set(stagedMulti.map((x) => x.umaId)));
		const badOther = bad.filter((k) => exceptUmas.indexOf(k.split('/')[0]) === -1);
		assert(Object.keys(old.rows).length === TR.length * 3 && badOther.length === 0, '取得切替(1) 最大の段階: 271衣装×(単独・REAL・VARY)の出力（スキル・items・由来・Pt・イベントの一覧）が従来（acquire 系なし）と同一（' + exceptUmas.join('・') + ' を除く）', { n: Object.keys(old.rows).length, bad: badOther.slice(0, 5) });
		assert(bad.length <= exceptUmas.length * 3, '取得切替(1) 最大の段階: 一致しないのは「acquireOptions を持ち choices も2つ以上のイベント」を持つ衣装（' + exceptUmas.join('・') + '）だけ', bad);
		// (b) 既定（何も渡さない）＝ user のイベントのスキルを空にしたデータ。fixed・acquireMode の無いイベントの寄与は変わらない
		//     （「events」＝選べるイベントの一覧は比べない: ゲーム内の選択肢が複数の user のイベントは、未選択でも選択肢のボタンを出すため、空のデータと一覧の中身が違う）
		const spEmpty = await openCore((es) => es.forEach((e) => e.events.forEach((ev) => { if (ev.acquireMode === 'user') ev.choices = ev.choices.map(() => ({ skills: [] })); })));
		const empty = await measure(spEmpty.page, 'none');
		await spEmpty.ctx.close();
		const def = await measure(sp.page, 'none');
		const bad2 = diffRows(empty, def, ['skills', 'items', 'sources', 'pt', 'total', 'kinds', 'sure', 'maybe', 'members', 'resultEvents']);
		assert(bad2.length === 0, '取得切替(1) 既定（未選択）: user のイベントの分だけが減り、fixed・acquireMode の無いイベントの寄与は変わらない（user を空にしたデータと Pt・種・●・△が一致）', { bad: bad2.slice(0, 5) });
		// (c) 固定の編成の前後の数（Pt・種・●・△）。最大の段階は変更前の数（blocks-30 の基準）と同じ
		const EXPECT = { all: { REAL: [8886, 67, 75, 10], VARY: [7159, 54, 63, 15] }, none: { REAL: [8742, 66, 74, 10], VARY: [7042, 53, 62, 15] } };
		assert(JSON.stringify(all.fixed) === JSON.stringify(EXPECT.all), '取得切替(1) 固定の編成 最大の段階 = 変更前の数（REAL 8886Pt・67種・●75・△10／VARY 7159Pt・54種・●63・△15）', all.fixed);
		assert(JSON.stringify(def.fixed) === JSON.stringify(EXPECT.none), '取得切替(1) 固定の編成 既定（未選択） REAL 8742Pt・66種・●74・△10／VARY 7042Pt・53種・●62・△15', def.fixed);
		const sum = (M, name, f) => Object.keys(M.rows).filter((k) => k.endsWith('/' + name)).reduce((s, k) => s + M.rows[k][f], 0);
		console.log('  （参考）271衣装の合計 Pt 単独 ' + sum(all, 'solo', 'total') + '→' + sum(def, 'solo', 'total') + '／REAL ' + sum(all, 'real', 'total') + '→' + sum(def, 'real', 'total') + '／VARY ' + sum(all, 'vary', 'total') + '→' + sum(def, 'vary', 'total'));
		assert(jsErrors(sp.errors).length === 0, '取得切替(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('取得切替(1b) 計算: 無効な保存値は未選択／true は番号0／段階の番号だけが効く（範囲外は無効）／選んだ段階のスキルだけを数える／結果の切り替えに従う', async () => {
		const sp = await openCore(null);
		const e0 = TR.find((e) => e.events.some((ev) => Array.isArray(ev.acquireOptions)) && userKeysOf(e).length >= 2);
		const sKey = 'uma:' + e0.umaId + '#' + e0.events.findIndex((ev) => Array.isArray(ev.acquireOptions));
		const sEv = e0.events[Number(sKey.split('#')[1])];
		const oKey = userKeysOf(e0).find((k) => k !== sKey);
		const r0 = { umaId: e0.umaId, cardIds: [] };
		const res = await sp.page.evaluate(async ({ r0, sKey, oKey, n }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const j = (picks) => JSON.stringify(C.getRosterPtDetail(Object.assign({}, r0, picks === undefined ? {} : { acquirePicks: picks })));
			const base = j(undefined);
			const invalid = [false, 1.5, -1, 'true', '0', '1', null, [0], [true], { a: 0 }, NaN, Infinity, 99, n];
			const allInvalid = invalid.every((v) => j({ [sKey]: v, [oKey]: v }) === base);
			const oneInvalid = j({ [oKey]: 1 }) === base && j({ [oKey]: 2 }) === base;   // 段階なしのイベントは番号0だけが有効
			const bad = { 'no-such#1': 0, 'card:card-9999#0': 0, 'uma:uma-0001#999': 0 };
			const proto = JSON.parse('{"__proto__":0}');
			const sk = (picks) => JSON.stringify(C.computeRosterSkills(r0, { autoChoose: true, acquirePicks: picks }).skillIds);
			const acq = (picks, seen) => C.computeRosterSkills(r0, { autoChoose: true, acquirePicks: picks, acquireSeen: seen }).acquireEvents.map((e) => [e.eventKey, e.acquired, e.unseen, e.stage]);
			// 段階ごとの由来（そのイベントの出現）
			const occ = (picks) => C.computeRosterSkills(r0, { autoChoose: true, acquirePicks: picks }).sources.filter((s) => s.eventKey === sKey).map((s) => [s.skillId, s.hintLevel, s.sure]);
			const stages = [];
			for (let s = 0; s < n; s++) stages.push(occ({ [sKey]: s }));
			return { empty: j({}) === base, bad: j(bad) === base, allInvalid, oneInvalid, proto: j(proto) === base, arr: j([0, 0]) === base, str: j('x') === base, nul: j(null) === base,
				trueIs0: j({ [sKey]: true, [oKey]: true }) === j({ [sKey]: 0, [oKey]: 0 }), oneDiffers: j({ [oKey]: 0 }) !== base, stageDiffers: j({ [sKey]: 0 }) !== base,
				onlyKey: sk({ [oKey]: 0, 'uma:other#0': 0 }) === sk({ [oKey]: 0 }), stages, none: occ(undefined),
				acq0: acq(undefined, false), acq1: acq({ [sKey]: n - 1 }, false), acq2: acq({ [sKey]: 0 }, true), acq3: acq(undefined, true), acqTrue: acq({ [oKey]: true }, false) };
		}, { r0, sKey, oKey, n: sEv.acquireOptions.length });
		assert(res.empty && res.bad && res.allInvalid && res.oneInvalid && res.proto && res.arr && res.str && res.nul,
			'取得切替(1b) 空・知らない鍵・範囲外・小数・負・文字列・null・配列・オブジェクト・NaN・Infinity・配列・文字列・null・__proto__ は、すべて未選択（既定と同一の Pt）。段階なしのイベントは番号1以上も無効', res);
		assert(res.trueIs0 && res.oneDiffers && res.stageDiffers && res.onlyKey, '取得切替(1b) true は番号0と同じ／選んだ鍵のイベントだけが数えられ、知らない鍵は何もしない', res);
		assert(res.none.length === 0, '取得切替(1b) 未選択の段階ありのイベントは、どの段階のスキルも数えない', res.none);
		sEv.acquireOptions.forEach((o, s) => {
			const want = o.skills.map((x) => x.skillId + ':' + x.hintLevel).sort().join(',');
			const got = res.stages[s].map((x) => x[0] + ':' + x[1]).sort().join(',');
			assert(want === got && res.stages[s].every((x) => x[2] === true), '取得切替(1b) 段階' + s + '（' + o.label + '）を選ぶと、その段階のスキルだけが（Lv・●のまま）数えられ、ほかの段階のスキルは数えない', { want, got });
		});
		const flags = (a) => a.map((x) => (x[1] ? 'A' : '-') + (x[2] ? 'U' : '-'));
		const allOf = (a, v, from = 0) => a.slice(from).every((x) => x === v);
		const iS = res.acq0.findIndex((x) => x[0] === sKey);
		assert(allOf(flags(res.acq0), '-U') && res.acq0.every((x) => x[3] === null) && res.acq1[iS][1] && res.acq1[iS][3] === sEv.acquireOptions.length - 1 && !res.acq1[iS][2]
			&& res.acq2[iS][3] === 0 && allOf(flags(res.acq3), '--') && res.acqTrue.find((x) => x[0] === oKey)[3] === 0,
			'取得切替(1b) acquireEvents: stage は選んだ番号（未選択は null・true は 0）／未確認（unseen）は「未選択」かつ「確認済みでない」ときだけ', res);
		// 結果の切り替えに従う: 条件文のないイベントを user にした合成データ（現行のデータには無い形）で、段階 0 を選んだとき resultPicks の位置が効く
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
			const got = await run(spU.page, R, { autoChoose: true, resultPicks: picks, acquirePicks: { [tkey]: 0 } });
			const off = await run(spU.page, R, { autoChoose: true, resultPicks: picks });
			assert(got === want, '取得切替(1b) 番号0を選んだら結果の切り替えに従う（結果の位置 ' + pos + '＝従来の数え方と同一）', { tkey, pos });
			if (pos > 0) assert(off !== want, '取得切替(1b) 未選択なら結果の位置を何にしても数えない（位置 ' + pos + '）', { tkey });
		}
		await spU.ctx.close(); await spF.ctx.close();
		await sp.ctx.close();
	});

	await block('取得切替(1c) 数: user のイベント ' + allUser + '件（段階あり ' + allStaged + '／段階なし ' + (allUser - allStaged) + '）・ゲーム内の選択肢が複数で段階なし・衣装ごとの件数の分布が、データから独立に数えた値と一致する', async () => {
		const exp = { staged: 0, plain: 0, plainMulti: 0, perUma: {}, stages: 0 };
		TR.forEach((e) => {
			let n = 0;
			e.events.forEach((ev) => {
				if (ev.acquireMode !== 'user') return;
				n++;
				if (Array.isArray(ev.acquireOptions)) { exp.staged++; exp.stages += ev.acquireOptions.length; } else { exp.plain++; if (ev.choices.length >= 2) exp.plainMulti++; }
			});
			exp.perUma[n] = (exp.perUma[n] || 0) + 1;
		});
		const sp = await openCore(null);
		const got = await sp.page.evaluate(async ({ umaIds }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const r = { staged: 0, plain: 0, plainMulti: 0, perUma: {}, stages: 0, unseenEach: 0, optionsOk: true, choicesPending: 0 };
			umaIds.forEach((id) => {
				const res = C.computeRosterSkills({ umaId: id, cardIds: [] }, { autoChoose: true });
				const list = res.acquireEvents;
				r.perUma[list.length] = (r.perUma[list.length] || 0) + 1;
				list.forEach((e) => {
					if (e.staged) { r.staged++; r.stages += e.options.length; } else { r.plain++; if (e.multi) r.plainMulti++; if (e.options.length !== 1) r.optionsOk = false; }
					if (e.unseen) r.unseenEach++;
					// 段階ありのイベントは、選択肢の箱（res.events）に出ない
					if (e.staged && res.events.some((x) => x.eventKey === e.eventKey)) r.choicesPending++;
				});
			});
			return r;
		}, { umaIds: TR.map((e) => e.umaId) });
		assert(got.staged === exp.staged && got.plain === exp.plain && got.plainMulti === exp.plainMulti && got.stages === exp.stages && JSON.stringify(got.perUma) === JSON.stringify(exp.perUma) && got.unseenEach === allUser && got.optionsOk && got.choicesPending === 0,
			'取得切替(1c) acquireEvents: user のイベント ' + allUser + '件（段階あり' + exp.staged + '＝段階の合計' + exp.stages + '／段階なし' + exp.plain + '＝うちゲーム内の選択肢が複数' + exp.plainMulti + '）・衣装ごとの件数の分布 ' + JSON.stringify(exp.perUma) + '・未確認はすべて・段階ありは選択肢の箱に出ない', { got, exp });
		assert(stagedMulti.length === 1 && stagedMulti[0].name === 'ターフの上のヒーロー', '取得切替(1c) acquireOptions を持ちながら choices が2つ以上あるイベントは「ターフの上のヒーロー」1件だけ', stagedMulti);
		console.log('  （参考）user のイベント ' + allUser + '件: 段階あり' + exp.staged + '（段階の合計' + exp.stages + '）／段階なし' + exp.plain + '（うちゲーム内の選択肢が複数' + exp.plainMulti + '）。衣装ごとの件数の分布 {件数: 衣装数} ' + JSON.stringify(exp.perUma));
		console.log('  （参考）acquireOptions を持ち choices が2つ以上のイベント: ' + JSON.stringify(stagedMulti));
		await sp.ctx.close();
	});

	await block('取得切替(1d) 計算: ビコーペガサス「ターフの上のヒーロー」は、段階 k を選ぶと従来の「ゲーム内の選択肢 k を選んだ」と同じ数え方になる', async () => {
		const m = stagedMulti[0];
		const ev = TR.find((e) => e.umaId === m.umaId).events[m.index];
		assert(ev.choices.length === ev.acquireOptions.length && ev.choices.every((c, k) => JSON.stringify(c.skills) === JSON.stringify(ev.acquireOptions[k].skills)),
			'取得切替(1d) 前提: choices と acquireOptions の中身が同じ', null);
		const spOld = await openCore(stripAcquire);
		const spNew = await openCore(null);
		const run = (page, o) => page.evaluate(async ({ umaId, o }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const r = { umaId, cardIds: [] };
			const res = C.computeRosterSkills(r, o);
			return JSON.stringify([res.skillIds, res.sources.filter((s) => s.eventKey && s.eventKey.indexOf(umaId) !== -1), C.getRosterPtDetail(Object.assign({}, r, { eventChoices: o.eventChoices, acquirePicks: o.acquirePicks })).total]);
		}, { umaId: m.umaId, o });
		for (let k = 0; k < ev.acquireOptions.length; k++) {
			const want = await run(spOld.page, { autoChoose: true, eventChoices: { [m.key]: k } });
			const got = await run(spNew.page, { autoChoose: true, acquirePicks: { [m.key]: k } });
			assert(want === got, '取得切替(1d) 段階' + k + '（' + ev.acquireOptions[k].label + '）＝従来の選択肢' + k + 'を選んだ数え方（スキル・由来・Pt が一致）', { k });
		}
		await spOld.ctx.close(); await spNew.ctx.close();
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
		const scen = withEventScenarioFirst(readJson('data/scenario-event-skills.json'));
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(scen) }));
		const roster = Object.assign({ umaId: 'uma-0064', cardIds: CARDS6 }, o.roster || {});
		await sp.page.evaluate(({ roster }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { roster });
		await reloadReady(sp.page);
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
	const badge = (page, key = 0) => page.evaluate((key) => { const b = document.querySelector('#deck-roster-panel [data-usd-el="events-btn"][data-member-key="' + key + '"], #deck-roster-panel [data-usd-el="col-menu-btn"][data-member-key="' + key + '"]');
		return b && { text: b.textContent, un: Number(b.getAttribute('data-unselected')), dot: !!b.querySelector('[data-usd-el="result-dot"]'), acq: b.getAttribute('data-acquire-picked'), aria: b.getAttribute('aria-label') }; }, key);
	const openPop = async (page, member = 0) => { await clickEvents(page, P, member); await page.waitForTimeout(400); };
	const closePop = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(250); };
	const evsOf = (umaId) => TR.find((e) => e.umaId === umaId).events.map((ev, i) => ({ ev, i, key: 'uma:' + umaId + '#' + i }));
	const UMA_S = 'uma-0215';   // コパノリッキー: user 1件（段階なし・選択肢1つ）＋ fixed の読み取り専用 1件
	const UMA_G = 'uma-0064';   // マンハッタンカフェ: user 1件（段階あり・3段階「疲れ知らずの怪」）
	const UMA_M = 'uma-0196';   // ジェンティルドンナ: user 2件（段階なし。うち1件はゲーム内の選択肢が2つ）
	const UMA_B = 'uma-0132';   // ビコーペガサス: 「ターフの上のヒーロー」（段階4つ。choices も4つ）
	const UMA_FIXED = 'uma-0040';   // ナリタブライアン（Maverick）: user のイベントが無い

	/** ボタンに出るはずの「スキル名 Lv」の並び（結果があれば結果1。全選択肢の分を、スキルごとに最大の Lv でまとめる） */
	const expectSkills = (ev) => {
		const m = new Map();
		ev.choices.forEach((c) => (Array.isArray(c.results) ? c.results[0] : c.skills).forEach((r) => { const cur = m.get(r.skillId); if (!cur || r.hintLevel > cur.hintLevel) m.set(r.skillId, r); }));
		return Array.from(m.values()).map((r) => r.name + ' Lv' + r.hintLevel);
	};
	const optSkills = (o) => o.skills.map((r) => r.name + ' Lv' + r.hintLevel);
	const BAD_SHOWN = /達成|ヒント|必ず合う|合うことがある|合わない/;

	await block('取得切替(2) 小窓: 段階ありは段階のボタン（条件文の灰色の行・補足文つき）／段階なしは条件を文にした1ボタン（灰色の行なし）／ゲーム内の選択肢が複数なら選択肢の下に別の段／choices は出ない／fixed は読み取り専用のまま／既定は何も選ばず押せる', async () => {
		for (const umaId of [UMA_S, UMA_G, UMA_M, UMA_B]) {
			const sp = await openSp({ roster: { umaId } });
			const evs = evsOf(umaId);
			const users = evs.filter((x) => x.ev.acquireMode === 'user');
			await openPop(sp.page);
			const dom = await sp.page.evaluate(() => {
				const left = document.querySelector('[data-usd-el="events-pane-events"]');
				const pop = document.querySelector('[data-usd-el="info-pop"]');
				const boxes = Array.from(left.querySelectorAll('[data-usd-el="event-acquire"], [data-usd-el="event"], [data-usd-el="event-info"], [data-usd-el="event-result"]'));
				return { boxes: boxes.map((b) => ({ kind: b.getAttribute('data-usd-el'), key: b.getAttribute('data-event-key'), hasGroup: !!b.querySelector('[data-usd-el="acquire-group"]'),
					kids: Array.from(b.children).map((c) => c.getAttribute('data-usd-el') || c.className.split(' ')[0]),
					note: (b.querySelector('[data-usd-el="acquire-note"]') || {}).textContent || null, cond: (b.querySelector('[data-usd-el="event-cond"]') || {}).textContent || null,
					gameChoices: b.querySelectorAll('[data-usd-el="event-choice"]').length,
					btns: Array.from(b.querySelectorAll('[data-usd-el="acquire-choice"]')).map((x) => ({ on: x.classList.contains('usd-roster-choice--on'), pressed: x.getAttribute('aria-pressed'), disabled: x.disabled, a: x.getAttribute('data-acquire'),
						label: (x.querySelector('.usd-roster-acquirelabel') || {}).textContent || null, skills: Array.from(x.querySelectorAll('.usd-roster-choiceskill')).map((s) => s.textContent) })) })),
					text: left.textContent, attrs: Array.from(pop.querySelectorAll('[aria-label],[title]')).map((e) => (e.getAttribute('aria-label') || '') + (e.getAttribute('title') || '')).join('|') };
			});
			const keyed = new Map(dom.boxes.map((b) => [b.key, b]));
			for (const u of users) {
				const b = keyed.get(u.key);
				const staged = Array.isArray(u.ev.acquireOptions);
				const multi = !staged && u.ev.choices.length >= 2;
				assert(b && b.hasGroup && b.kind === (multi ? 'event' : 'event-acquire'), '取得切替(2) ' + umaId + ' ' + u.key + ' は' + (multi ? '選択肢のボタンの箱の下に別の段として' : 'ボタンの行だけの箱として') + '出る', b);
				assert(b.note === u.ev.acquireNote, '取得切替(2) ' + u.key + ' 補足文（acquireNote）がデータのまま出る', { note: b.note });
				if (staged) {
					const n = u.ev.acquireOptions.length;
					assert(b.cond === u.ev.condition && b.gameChoices === 0, '取得切替(2) ' + u.key + ' 段階あり: 条件文は灰色の行に（データのまま）・ゲーム内の選択肢（choices）は出ない', { cond: b.cond, gameChoices: b.gameChoices });
					assert(b.kids.indexOf('event-cond') < b.kids.indexOf('acquire-note') && b.kids.indexOf('acquire-note') < b.kids.indexOf('acquire-group'), '取得切替(2) ' + u.key + ' 並びは 条件文 → 補足文 → ボタンの行', b.kids);
					assert(b.btns.length === n && b.btns.every((x, i) => x.label === u.ev.acquireOptions[i].label && JSON.stringify(x.skills) === JSON.stringify(optSkills(u.ev.acquireOptions[i]))),
						'取得切替(2) ' + u.key + ' 段階あり: acquireOptions の要素の数（' + n + '）だけボタンが並び、各ボタンは「ラベル スキル名 Lv」（選択肢と同じ作り）', b.btns);
				} else {
					assert(b.cond === null, '取得切替(2) ' + u.key + ' 段階なし: 灰色の条件文の行を出さない（条件文はボタンの文に含める）', b.cond);
					assert(b.btns.length === 1 && b.btns[0].label === u.ev.condition && JSON.stringify(b.btns[0].skills) === JSON.stringify(expectSkills(u.ev)),
						'取得切替(2) ' + u.key + ' 段階なし: ボタンは1つで「条件文 スキル名 Lv」', b.btns);
					if (multi) {
						assert(b.gameChoices === u.ev.choices.length && b.kids.indexOf('usd-roster-choices') < b.kids.indexOf('acquire-note') && b.kids.indexOf('acquire-note') < b.kids.indexOf('acquire-group'),
							'取得切替(2) ' + u.key + ' ゲーム内の選択肢が複数: 選択肢のボタン（' + b.gameChoices + '）の下に、補足文 → 条件のボタンが別の段で出る', b.kids);
					} else {
						assert(b.kids.indexOf('acquire-note') < b.kids.indexOf('acquire-group'), '取得切替(2) ' + u.key + ' 補足文はボタンの上', b.kids);
					}
				}
				assert(b.btns.every((x) => !x.on && x.pressed === 'false' && !x.disabled), '取得切替(2) ' + u.key + ' 既定は何も選ばれておらず、すべて押せる（無効にしない）', b.btns);
			}
			const fixedInfos = evs.filter((x) => x.ev.acquireMode === 'fixed' && x.ev.choices.length === 1 && x.ev.condition !== '');
			for (const f of fixedInfos) {
				const b = keyed.get(f.key);
				assert(b && b.kind === 'event-info' && !b.hasGroup && b.note === null, '取得切替(2) ' + umaId + ' ' + f.key + '（fixed）は今までの読み取り専用の行のまま（ボタンの行・補足文なし）', b);
			}
			assert(!BAD_SHOWN.test(dom.text) && !BAD_SHOWN.test(dom.attrs), '取得切替(2) ' + umaId + ' 小窓の文・aria-label・title に「達成／未達成」「ヒント」「必ず合う／合うことがある／合わない」の語が出ない', (dom.text + dom.attrs).match(BAD_SHOWN));
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

	await block('取得切替(2b) 押す（段階なし）: 押すと保存・合計が変わる・右の「取得できるスキル」に出る／もう一度押すと解除（鍵も項目も消える）／元に戻すは1操作で1回', async () => {
		const sp = await openSp({ roster: { umaId: UMA_S } });
		const u = evsOf(UMA_S).find((x) => x.ev.acquireMode === 'user');
		const R = { umaId: UMA_S, cardIds: CARDS6 };
		const before = await bandTotal(sp.page);
		assert(before === (await ptTotal(sp.page, R)), '取得切替(2b) 前提: 既定の合計は、acquirePicks なしの計算と同じ', before);
		await openPop(sp.page);
		const rightBefore = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="ev-skills"] [data-usd-el="ev-skill"]')).map((x) => x.getAttribute('data-skill-id')));
		const u0 = await undoCount(sp.page);
		const sel = '[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="0"]';
		await sp.page.click(sel);
		await sp.page.waitForTimeout(400);
		const d1 = await draftR(sp.page);
		const expTotal = await ptTotal(sp.page, Object.assign({}, R, { acquirePicks: { [u.key]: 0 } }));
		assert(JSON.stringify(d1.acquirePicks) === JSON.stringify({ [u.key]: 0 }), '取得切替(2b) 押すと acquirePicks に { 鍵: 0 } だけが保存される（段階なしは番号0）', d1.acquirePicks);
		assert((await bandTotal(sp.page)) === expTotal && expTotal > before, '取得切替(2b) 帯の合計が選んだあとの値になる（' + before + '→' + expTotal + '）', await bandTotal(sp.page));
		const rightAfter = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="ev-skills"] [data-usd-el="ev-skill"]')).map((x) => x.getAttribute('data-skill-id')));
		const gained = (Array.isArray(u.ev.choices[0].results) ? u.ev.choices[0].results[0] : u.ev.choices[0].skills).map((r) => r.skillId);
		assert(gained.every((id) => rightAfter.indexOf(id) !== -1 && rightBefore.indexOf(id) === -1), '取得切替(2b) 押すと、得るスキル（' + gained.join('・') + '）が右の「取得できるスキル」に出る（選ぶ前は出ない）', { rightBefore: rightBefore.length, rightAfter: rightAfter.length });
		const on1 = await sp.page.evaluate((s) => { const b = document.querySelector(s); return [b.classList.contains('usd-roster-choice--on'), b.getAttribute('aria-pressed')]; }, sel);
		assert(on1[0] && on1[1] === 'true', '取得切替(2b) 押したあと、小窓が描き直されて選んだ状態（--on・aria-pressed）になっている', on1);
		assert((await undoCount(sp.page)) === u0 + 1, '取得切替(2b) 切り替えは元に戻すに1回だけ積まれる', { u0, now: await undoCount(sp.page) });
		const dot = await badge(sp.page);
		assert(dot.dot && dot.acq === '1', '取得切替(2b) 選んだ列のバッジに点（data-acquire-picked=1）', dot);
		// 結果の切り替えに従う: 条件文のあるイベントは resultPicks を何にしても結果1
		assert((await ptTotal(sp.page, Object.assign({}, R, { acquirePicks: { [u.key]: 0 }, resultPicks: { [u.key]: 2 } }))) === expTotal, '取得切替(2b) 選んだイベントも結果の切り替えに従う（条件文のあるイベントは結果1のまま）', null);
		// もう一度押すと解除 → 鍵も項目も消える
		await sp.page.click(sel);
		await sp.page.waitForTimeout(400);
		const d0 = await draftR(sp.page);
		assert(!('acquirePicks' in d0) && (await bandTotal(sp.page)) === before, '取得切替(2b) もう一度押すと解除され、鍵が消えて acquirePicks は項目ごと消える・合計も最初に戻る', d0.acquirePicks);
		await undo(sp.page);
		assert(JSON.stringify((await draftR(sp.page)).acquirePicks) === JSON.stringify({ [u.key]: 0 }), '取得切替(2b) 「元に戻す」1回で、直前の1操作（解除）だけが戻る', null);
		await undo(sp.page);
		assert(!('acquirePicks' in (await draftR(sp.page))), '取得切替(2b) もう1回で最初（何も選んでいない）に戻る', null);
		assert(jsErrors(sp.errors).length === 0, '取得切替(2b) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('取得切替(2c) 押す（段階あり）: 選べるのは1つ（排他）で別の段階を押すと切り替わる／同じ段階をもう一度押すと解除／その段階のスキルだけが合計と右の欄に出る／ビコーペガサスは choices が出ない', async () => {
		for (const [umaId, label] of [[UMA_G, 'マンハッタンカフェ'], [UMA_B, 'ビコーペガサス']]) {
			const sp = await openSp({ roster: { umaId } });
			const u = evsOf(umaId).find((x) => Array.isArray(x.ev.acquireOptions));
			const n = u.ev.acquireOptions.length;
			const R = { umaId, cardIds: CARDS6 };
			const before = await bandTotal(sp.page);
			await openPop(sp.page);
			const stateOf = () => sp.page.evaluate((k) => Array.from(document.querySelectorAll('[data-usd-el="acquire-choice"][data-event-key="' + k + '"]')).map((b) => b.classList.contains('usd-roster-choice--on') + ':' + b.getAttribute('aria-pressed')), u.key);
			const rightIds = () => sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="ev-skills"] [data-usd-el="ev-skill"]')).map((x) => x.getAttribute('data-skill-id')));
			const tag = '取得切替(2c) ' + label + ' ';
			const click = async (i) => { await sp.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="' + i + '"]'); await sp.page.waitForTimeout(400); };
			const noneOn = Array.from({ length: n }, () => 'false:false');
			assert(JSON.stringify(await stateOf()) === JSON.stringify(noneOn), tag + '開いたとき、どの段階も選ばれていない', await stateOf());
			const gameChoices = await sp.page.evaluate((k) => document.querySelectorAll('[data-usd-el="event-choice"][data-event-key="' + k + '"]').length, u.key);
			assert(gameChoices === 0, tag + 'acquireOptions だけが選択のボタンで、choices のボタンは出ない', gameChoices);
			const u0 = await undoCount(sp.page);
			await click(n - 1);
			let d = await draftR(sp.page);
			const st = (i) => Array.from({ length: n }, (_, k) => (k === i ? 'true:true' : 'false:false'));
			assert(JSON.stringify(d.acquirePicks) === JSON.stringify({ [u.key]: n - 1 }) && JSON.stringify(await stateOf()) === JSON.stringify(st(n - 1)), tag + '最後の段階を押すと { 鍵: ' + (n - 1) + ' } が保存され、その段階だけが選ばれる', { d: d.acquirePicks, s: await stateOf() });
			const totalLast = await bandTotal(sp.page);
			assert(totalLast === (await ptTotal(sp.page, Object.assign({}, R, { acquirePicks: { [u.key]: n - 1 } }))) && totalLast > before, tag + '合計が最後の段階の値になる（' + before + '→' + totalLast + '）', totalLast);
			const ids = await rightIds();
			assert(u.ev.acquireOptions[n - 1].skills.every((s) => ids.indexOf(s.skillId) !== -1), tag + '右の「取得できるスキル」に選んだ段階のスキルが出る', ids.length);
			// 別の段階を押す: 切り替わる（排他）。元に戻すに1回積まれる
			await click(0);
			d = await draftR(sp.page);
			assert(JSON.stringify(d.acquirePicks) === JSON.stringify({ [u.key]: 0 }) && JSON.stringify(await stateOf()) === JSON.stringify(st(0)), tag + '別の段階（先頭）を押すと切り替わる（選べるのは1つ）。ほかの段階の選びは残らない', { d: d.acquirePicks, s: await stateOf() });
			const totalFirst = await bandTotal(sp.page);
			assert(totalFirst === (await ptTotal(sp.page, Object.assign({}, R, { acquirePicks: { [u.key]: 0 } }))), tag + '合計が先頭の段階の値になる（最後の段階の分は数えない）', { totalFirst, totalLast });
			assert((await undoCount(sp.page)) === u0 + 2, tag + '切り替えごとに元に戻すへ1回ずつ積まれる', { u0, now: await undoCount(sp.page) });
			// 同じ段階をもう一度押す: 解除
			await click(0);
			d = await draftR(sp.page);
			assert(!('acquirePicks' in d) && JSON.stringify(await stateOf()) === JSON.stringify(noneOn) && (await bandTotal(sp.page)) === before, tag + '選んでいる段階をもう一度押すと解除され、鍵も項目も消えて合計は最初に戻る', { d: d.acquirePicks, s: await stateOf() });
			await undo(sp.page);
			assert(JSON.stringify((await draftR(sp.page)).acquirePicks) === JSON.stringify({ [u.key]: 0 }), tag + '「元に戻す」で解除が戻り、先頭の段階を選んだ状態になる', null);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// ビコーペガサスは「選択肢の未選択」にも数えない（choices を数えない）。開く前の「！」は acquireEvents の未確認の分だけ
		const spB = await openSp({ roster: { umaId: UMA_B } });
		const bB = await badge(spB.page);
		const expB = await spB.page.evaluate(async ({ roster }) => {
			const C = UmaSkillDeckCore; await C.loadTrainingSources(); await C.loadSkillPtData(); await C.loadScenarioEvents(false);
			const r = C.computeRosterSkills(roster, { autoChoose: true, acquireSeen: false });
			return { pending: r.events.filter((e) => e.memberKey === 0 && e.pending).length, unseen: r.acquireEvents.filter((e) => e.unseen).length, bikoInEvents: r.events.some((e) => /uma-0132#2$/.test(e.eventKey)) };
		}, { roster: { umaId: UMA_B, cardIds: CARDS6 } });
		assert(!expB.bikoInEvents && bB.un === expB.pending + expB.unseen, '取得切替(2c) ビコーペガサス: 「ターフの上のヒーロー」の選択肢を「選択肢の未選択」に数えない（' + bB.un + '件＝選ぶ必要のあるイベント' + expB.pending + '＋未確認の取得' + expB.unseen + '）', { bB, expB });
		await spB.ctx.close();
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
		await spT.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="0"]');
		await spT.page.waitForTimeout(350);
		await undo(spT.page);
		assert((await draftR(spT.page)).acquireSeen === UMA_S, '取得切替(3) 切り替えを元に戻しても、確認済み（acquireSeen）は戻さない', await draftR(spT.page));
		await spT.ctx.close();
		// 未選択のまま確認済みにしたとき（開いただけ）、選択のイベントは「！」に数えない
		const spA = await openSp({ roster: { umaId: UMA_S, acquirePicks: { [u.key]: 0 } } });
		const ba = await badge(spA.page);
		assert(ba.un === b0.un - userN, '取得切替(3) 選んだイベントは、確認前でも未確認に数えない（' + ba.un + '件）', ba);
		await spA.ctx.close();
	});

	await block('取得切替(4) 保存・読み込み・リセット・元に戻す・インポート: 項目の無い保存は1バイトも変わらない／知らない鍵は残す／中身をすべて消すで両方消え元に戻すで戻る／インポート→元に戻すで書き換わらない（ルール28）', async () => {
		const SAVED = (extra) => ({ schemaVersion: 7, records: [], customSkills: [], templates: [
			{ templateId: 't1', name: 'S1', skillIds: [], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }],
			rosters: [Object.assign({ rosterId: 'r1', name: 'S1', umaId: UMA_S, star: 3, awakeningLevel: 5, cardIds: CARDS6.slice(), createdAt: 'x', updatedAt: 'x' }, extra || {})] });
		const rawUd = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
		const open2 = async (userData) => {
			const sp = await openPage(browser, base, 'special.html', { width: 390, height: 900 }, userData);
			await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(withEventScenarioFirst(readJson('data/scenario-event-skills.json'))) }));
			await sp.page.evaluate(() => { localStorage.removeItem('umaSkillDeck:draftRoster:special'); localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '0'); });
			await reloadReady(sp.page);
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
		assert(base0 === (await ptTotal(sp.page, seed.rosters[0])), '取得切替(4)(a) 保存済みの編成の合計は、既定（未選択）の値', base0);
		// (b) 小窓を開く → acquireSeen が保存される（schemaVersion は 7 のまま）。切り替える → acquirePicks
		await openPop(sp.page);
		const r1 = await rosterOf(sp.page);
		assert(r1.acquireSeen === UMA_S && !('acquirePicks' in r1) && JSON.parse(await rawUd(sp.page)).schemaVersion === 7, '取得切替(4)(b) 開くと保存済みの編成に acquireSeen だけが入る（schemaVersion は 7 のまま）', r1);
		await sp.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="0"]');
		await sp.page.waitForTimeout(350);
		await closePop(sp.page);
		const savedNow = await rawUd(sp.page);
		assert(JSON.stringify((await rosterOf(sp.page)).acquirePicks) === JSON.stringify({ [u.key]: 0 }), '取得切替(4)(b) 選ぶと rosters の acquirePicks に { 鍵: true } が入る', null);
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
		await sp.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="0"]');
		await sp.page.waitForTimeout(350);
		await closePop(sp.page);
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click('[data-usd-el="roster-reset-off"]');
		await sp.page.waitForTimeout(300);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(250);
		const r3 = await rosterOf(sp.page);
		assert(JSON.stringify(r3.acquirePicks) === JSON.stringify({ [u.key]: 0 }) && r3.acquireSeen === UMA_S, '取得切替(4)(d) 「取得しないスキルを戻す」は acquirePicks・acquireSeen に触らない', r3);
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(400);
		const cleared = await rosterOf(sp.page);
		assert(!('acquirePicks' in cleared) && !('acquireSeen' in cleared) && cleared.umaId === '', '取得切替(4)(d) 「中身をすべて消す」で acquirePicks と acquireSeen の両方が消える', cleared);
		await undo(sp.page);
		const restored = await rosterOf(sp.page);
		assert(JSON.stringify(restored.acquirePicks) === JSON.stringify({ [u.key]: 0 }) && restored.acquireSeen === UMA_S && restored.umaId === UMA_S, '取得切替(4)(d) 「元に戻す」で、リセット前（acquirePicks・acquireSeen・衣装）に戻る', restored);
		assert(jsErrors(sp.errors).length === 0, '取得切替(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// (d2) acquireSeen だけの編成は「中身」と数えない（空の編成のリセットを押せるかは umaId・カード・acquirePicks など中身で決まる）
		const onlySeen = await openSp({ roster: { umaId: '', cardIds: [null, null, null, null, null, null], acquireSeen: UMA_S } });
		const hc = await onlySeen.page.evaluate(() => ({ resettable: !!document.querySelector('#deck-roster-panel [data-usd-el="roster-reset"]') && !document.querySelector('#deck-roster-panel [data-usd-el="roster-reset"]').disabled }));
		assert(hc.resettable === false, '取得切替(4)(d2) acquireSeen だけの編成は、リセットの対象（中身）に数えない', hc);
		await onlySeen.ctx.close();
		// (e) 知らない鍵・崩れた値の入った保存データは、開いただけでは1バイトも変わらない。未選択として数える。切り替えたのはその1つだけ
		const junk = { 'no-such#1': true, 'card:card-9999#0': true, [u.key]: 'yes' };
		const seed2 = SAVED({ acquirePicks: junk, acquireSeen: 12345 });
		const sp2 = await open2(seed2);
		assert((await rawUd(sp2.page)) === JSON.stringify(seed2), '取得切替(4)(e) 知らない鍵・true 以外の値・形の崩れた acquireSeen の入った保存データも、開いただけでは1バイトも変わらない', null);
		assert((await bandTotal(sp2.page)) === base0, '取得切替(4)(e) 無効な値は未選択として数える（合計は既定のまま）', await bandTotal(sp2.page));
		await openPop(sp2.page);
		await sp2.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="0"]');
		await sp2.page.waitForTimeout(300);
		const k2 = (await rosterOf(sp2.page)).acquirePicks;
		assert(JSON.stringify(k2) === JSON.stringify(Object.assign({}, junk, { [u.key]: 0 })), '取得切替(4)(e) 切り替えたのはその1つの鍵だけ（知らない鍵はそのまま残る）', k2);
		await sp2.page.click('[data-usd-el="acquire-choice"][data-event-key="' + u.key + '"][data-acquire="0"]');
		await sp2.page.waitForTimeout(300);
		const k3 = (await rosterOf(sp2.page)).acquirePicks;
		assert(JSON.stringify(k3) === JSON.stringify({ 'no-such#1': true, 'card:card-9999#0': true }), '取得切替(4)(e) 未選択に戻すと、その1つの鍵だけを外す（知らない鍵は残る）', k3);
		await sp2.ctx.close();
		// (f) Deck: acquirePicks・acquireSeen つきの保存データを書き出し→取り込み→「元に戻す」で、取り込み前と一致する（ルール28）
		const seed3 = SAVED({ acquirePicks: { [u.key]: 0, 'no-such#1': true }, acquireSeen: UMA_S });
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, seed3);
		await dk.page.click('#tab-btn-data');
		await dk.page.waitForTimeout(300);
		const state = () => dk.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const bef = await state();
		const exp = await dk.page.evaluate(() => { exportData(); return document.getElementById('export-textarea').value; });
		const er = JSON.parse(exp).rosters[0];
		assert(JSON.stringify(er.acquirePicks) === JSON.stringify({ [u.key]: 0, 'no-such#1': true }) && er.acquireSeen === UMA_S, '取得切替(4)(f) 書き出しに acquirePicks・acquireSeen が入る（知らない鍵も含めてそのまま）', er);
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
			// 左右スワイプ（①②③と同じ決まり: 50px 以上・縦の1.5倍より大きい〔T23〕。左へ払うと次・右へ払うと前・端では何もしない）
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

	/* ====================================================================
	 * (6) 列見出しのバッジの角の点（選んだイベントがあるとき。結果の切り替えと同じ点・同じ形）
	 * ==================================================================== */
	const lum = (rgb) => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
	const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
	const badgesOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="events-btn"], #deck-roster-panel [data-usd-el="col-menu-btn"]')).map((b) => {
		const r = b.getBoundingClientRect(); const d = b.querySelector('[data-usd-el="result-dot"]');
		const cs = getComputedStyle(b); const dcs = d ? getComputedStyle(d) : null; const dr = d ? d.getBoundingClientRect() : null;
		return { key: b.getAttribute('data-member-key'), text: b.textContent, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, aria: b.getAttribute('aria-label'), acq: b.getAttribute('data-acquire-picked'),
			dot: !!d, bg: cs.backgroundColor, dotBg: dcs && dcs.backgroundColor, ring: dcs && dcs.borderTopColor, dotW: dr && dr.width, dotInside: dr ? (dr.right <= r.right + 5 && dr.top >= r.top - 5) : null };
	}));
	const bandH = (page) => page.evaluate(() => Math.round(document.querySelector('#deck-roster-panel [data-usd-el="pt-sumrow"]').getBoundingClientRect().height));
	const docScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

	await block('取得切替(6) 列見出しの点: 選んだイベントがある列のバッジだけに付く・形と帯の高さ（28px）は変わらない・「！」と区別できる・ライト／ダークで見える（PC・390・360）', async () => {
		const key = evsOf(UMA_S).find((x) => x.ev.acquireMode === 'user').key;
		for (const [w, scheme] of [[1280, 'light'], [390, 'light'], [390, 'dark'], [360, 'light']]) {
			const tag = '取得切替(6) ' + w + '/' + scheme + ' ';
			const plain = await openSp({ roster: { umaId: UMA_S, acquireSeen: UMA_S }, w, scheme });
			const bandPlain = await bandH(plain.page);
			const b0 = await badgesOf(plain.page);
			assert(b0.every((b) => !b.dot && b.acq === null), tag + '選んだイベントが無いときは、どの列にも点が無い（確認済みだけでは出ない）', b0.filter((b) => b.dot).length);
			await plain.ctx.close();
			const sp = await openSp({ roster: { umaId: UMA_S, acquireSeen: UMA_S, acquirePicks: { [key]: 0 } }, w, scheme });
			const b1 = await badgesOf(sp.page);
			const dots = b1.filter((b) => b.dot);
			assert(dots.length === 1 && dots[0].key === '0' && dots[0].acq === '1' && /取得を選択中1件/.test(dots[0].aria), tag + '点は選んだイベントのある列（育成ウマ娘）のバッジだけに付き、aria-label に「取得を選択中1件」', dots.map((d) => [d.key, d.acq, d.aria]));
			assert(b1.every((b, i) => b.w === b0[i].w && b.h === b0[i].h), tag + 'バッジの幅・高さは変わらない（点は角に添えるだけ）', b1.map((b, i) => [b.w - b0[i].w, b.h - b0[i].h]));
			// 帯（合計の1行）は PC・390px で 28px。360px は元から2行（60px）に折り返す。どの幅でも、点を足しても変わらない
			assert((await bandH(sp.page)) === bandPlain && (w === 360 || bandPlain === 28), tag + '帯の高さは変わらない（' + bandPlain + 'px。PC・390px は 28px）', { plain: bandPlain, now: await bandH(sp.page) });
			assert((await docScroll(sp.page)) <= 0, tag + '横スクロールが出ない', await docScroll(sp.page));
			const d = dots[0];
			assert(d.dotW >= 7 && d.dotW <= 9 && d.dotInside, tag + '点は約8pxで、バッジの右上の角に収まる', { w: d.dotW, inside: d.dotInside });
			const cr = ratio(d.dotBg, d.ring);
			assert(cr >= 3, tag + '点と縁取りのコントラスト比 ' + cr.toFixed(2) + '（3:1以上）', { dot: d.dotBg, ring: d.ring });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
			// 「！」（未確認・赤いバッジ）と点が同時に出るとき: 形は変えず、点は赤い地とは別の色（縁取りで見分けがつく）
			const al = await openSp({ roster: { umaId: UMA_S, acquirePicks: { [key]: 0 } }, w, scheme });
			const ba = await badgesOf(al.page);
			const bang = ba.find((b) => b.key === '0');
			assert(bang.text === '!' && bang.dot && bang.dotBg !== bang.bg && Math.max(ratio(bang.dotBg, bang.bg), ratio(bang.ring, bang.bg)) >= 3, tag + '「！」の赤いバッジの角にも点が出て、赤い地と違う色（C-179: 塗りか縁が地に対し3:1以上。塗り ' + ratio(bang.dotBg, bang.bg).toFixed(2) + '・縁 ' + ratio(bang.ring, bang.bg).toFixed(2) + '）', { text: bang.text, dot: bang.dotBg, ring: bang.ring, bg: bang.bg });
			assert((await bandH(al.page)) === bandPlain, tag + '「！」と点が同時でも帯の高さは変わらない（' + bandPlain + 'px）', await bandH(al.page));
			await al.ctx.close();
		}
	});

	/* ====================================================================
	 * (7) ランダム目印（データの randomResult: true）: 条件文があっても結果の切り替えのボタンを出す。ほかの条件文つきイベントは対象外のまま
	 * ==================================================================== */
	await block('取得切替(7) ランダム目印: 15イベントで結果の切り替えが効く（条件文があっても）／目印の無い条件文つきの着順系は対象外／既定の出力は変わらない', async () => {
		const rnd = [];
		TR.forEach((e) => e.events.forEach((ev, i) => { if (ev.randomResult === true) rnd.push({ umaId: e.umaId, key: 'uma:' + e.umaId + '#' + i, ev }); }));
		assert(rnd.length === 15, '取得切替(7) 前提: randomResult: true のイベントは15件', rnd.length);
		const sp = await openCore(null);
		const res = await sp.page.evaluate(async ({ rnd }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const out = [];
			for (const r of rnd) {
				const roster = { umaId: r.umaId, cardIds: [] };
				const def = C.computeRosterSkills(roster, { autoChoose: true });
				const re = def.resultEvents.find((x) => x.eventKey === r.key);
				const info = def.infoEvents.some((x) => x.eventKey === r.key);
				const pick = (pos) => JSON.stringify(C.computeRosterSkills(roster, { autoChoose: true, resultPicks: { [r.key]: pos } }).sources.filter((s) => s.eventKey === r.key).map((s) => [s.skillId, s.hintLevel]));
				out.push({ key: r.key, hasSwitch: !!re, count: re ? re.count : 0, pos: re ? re.pos : null, cond: re ? re.condition : null, info, differs: re ? pick(1) !== pick(0) : false, same0: pick(0) === JSON.stringify(def.sources.filter((s) => s.eventKey === r.key).map((s) => [s.skillId, s.hintLevel])) });
			}
			return out;
		}, { rnd: rnd.map((r) => ({ umaId: r.umaId, key: r.key })) });
		const badSw = res.filter((x) => !x.hasSwitch || x.count < 2 || x.pos !== 0 || x.cond !== (rnd.find((r) => r.key === x.key).ev.condition || '') || x.info || !x.differs || !x.same0);
		assert(badSw.length === 0, '取得切替(7) 目印のある15イベントはすべて結果の切り替えを持つ（条件文があればそのまま添え・結果1が既定・結果を変えると数えるスキルが変わる・読み取り専用の行には出ない）', badSw.slice(0, 3));
		// 目印の無い条件文つき（結果が分かれる着順系）は、resultPicks を何にしても変わらない
		const plain = [];
		TR.forEach((e) => e.events.forEach((ev, i) => { if (ev.randomResult !== true && ev.condition && ev.choices.some((c) => Array.isArray(c.results) && c.results.length >= 2)) plain.push({ umaId: e.umaId, key: 'uma:' + e.umaId + '#' + i }); }));
		const fixedRes = await sp.page.evaluate(async ({ plain }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			let n = 0, bad = 0;
			for (const r of plain) {
				const roster = { umaId: r.umaId, cardIds: [] };
				const a = JSON.stringify(C.computeRosterSkills(roster, { autoChoose: true }).sources);
				const picks = { [r.key]: 1 };
				const b = JSON.stringify(C.computeRosterSkills(roster, { autoChoose: true, resultPicks: picks }).sources);
				const hasBox = C.computeRosterSkills(roster, { autoChoose: true }).resultEvents.some((x) => x.eventKey === r.key);
				n++; if (a !== b || hasBox) bad++;
			}
			return { n, bad };
		}, { plain });
		assert(plain.length > 100 && fixedRes.bad === 0, '取得切替(7) 目印の無い条件文つきの着順系（' + plain.length + '件）は対象外のまま（結果を切り替えても変わらず、結果の切り替えの箱も無い）', fixedRes);
		// 既定の出力は変わらない（目印を外したデータと、スキル・items・由来・Pt が一致）
		const spOff = await openCore((es) => es.forEach((e) => e.events.forEach((ev) => { delete ev.randomResult; })));
		const off = await measure(spOff.page, 'none');
		await spOff.ctx.close();
		const on = await measure(sp.page, 'none');
		const bad = diffRows(off, on, ['skills', 'items', 'sources', 'pt', 'total', 'kinds', 'sure', 'maybe', 'members']);
		assert(bad.length === 0, '取得切替(7) 既定（結果1）の出力は、目印を外したデータと同一（271衣装×3の編成で スキル・items・由来・Pt・●△ が一致）', bad.slice(0, 5));
		assert(jsErrors(sp.errors).length === 0, '取得切替(7) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('取得切替(7b) ランダム目印の小窓: タイキシャトル「安田記念の後に」に条件文つきの結果ボタン（補足文・「ランダム」の語は無い）／押すと resultPicks に保存／目印の無い着順系は読み取り専用のまま', async () => {
		const sp = await openSp({ roster: { umaId: 'uma-0027' } });
		const ev = evsOf('uma-0027').find((x) => x.ev.randomResult === true);
		await openPop(sp.page);
		const box = await sp.page.evaluate((k) => {
			const b = document.querySelector('[data-usd-el="event-result"][data-event-key="' + k + '"]');
			const info = document.querySelector('[data-usd-el="event-info"][data-event-key="' + k + '"]');
			return { has: !!b, info: !!info, text: b ? b.textContent : '', cond: b && b.querySelector('[data-usd-el="event-cond"]') ? b.querySelector('[data-usd-el="event-cond"]').textContent : null,
				kids: b ? Array.from(b.children).map((c) => c.getAttribute('data-usd-el') || c.className.split(' ')[0]) : [], notes: b ? b.querySelectorAll('[data-usd-el="acquire-note"], .usd-roster-acquirenote').length : -1,
				btns: b ? Array.from(b.querySelectorAll('[data-usd-el="result-choice"]')).map((x) => ({ on: x.classList.contains('usd-roster-choice--on'), t: x.textContent })) : [] };
		}, ev.key);
		assert(box.has && !box.info, '取得切替(7b) 「安田記念の後に」は結果ボタンの箱で出る（読み取り専用の行と二重にしない）', box);
		assert(box.cond === ev.ev.condition && box.kids.indexOf('event-cond') < box.kids.indexOf('result-group') && box.notes === 0, '取得切替(7b) 条件文は灰色の行（データのまま）で添え、補足文は付けない', box);
		assert(box.btns.length === ev.ev.choices[0].results.length && box.btns[0].on && box.btns.slice(1).every((b) => !b.on), '取得切替(7b) 結果のボタンは結果の数（' + ev.ev.choices[0].results.length + '）だけ。結果1が既定で選ばれている', box.btns);
		assert(!/ランダム|確率|運/.test(box.text), '取得切替(7b) 「ランダム」を示す語は付けない', box.text);
		await sp.page.click('[data-usd-el="result-choice"][data-event-key="' + ev.key + '"][data-result="1"]');
		await sp.page.waitForTimeout(400);
		const d = await draftR(sp.page);
		assert(JSON.stringify(d.resultPicks) === JSON.stringify({ [ev.key]: 1 }), '取得切替(7b) 結果2を押すと resultPicks に { 鍵: 1 } が保存される', d.resultPicks);
		const on2 = await sp.page.evaluate((k) => Array.from(document.querySelectorAll('[data-usd-el="result-choice"][data-event-key="' + k + '"]')).map((b) => b.classList.contains('usd-roster-choice--on')), ev.key);
		assert(JSON.stringify(on2) === JSON.stringify([false, true]), '取得切替(7b) 押したあと、結果2が選ばれた状態に描き直される', on2);
		assert(jsErrors(sp.errors).length === 0, '取得切替(7b) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 目印の無い条件文つきの着順系（マンハッタンカフェ「有馬記念の後に」）は、今までどおり読み取り専用の行で、結果ボタンは出ない
		const sp2 = await openSp({ roster: { umaId: 'uma-0064' } });
		await openPop(sp2.page);
		const k2 = 'uma:uma-0064#4';
		const o = await sp2.page.evaluate((k) => ({ info: !!document.querySelector('[data-usd-el="event-info"][data-event-key="' + k + '"]'), res: !!document.querySelector('[data-event-key="' + k + '"] [data-usd-el="result-group"]') }), k2);
		assert(o.info && !o.res, '取得切替(7b) 目印の無い着順系（有馬記念の後に）は読み取り専用の行のまま・結果ボタンは出ない', o);
		await sp2.ctx.close();
	});
}
