// ②因子周回 段3（星取表。2026-10-28）の検査。run-smoke.mjs の末尾から register60() で呼ばれる
// （塊の見出しはすべて「②星取表」で始まる。`npm run test:visual -- --only=②星取表` で回せる）。
//
// 決め（おいもさん・段3）:
//  ・②にも①と同じ星取表の表示を足し、今のカード一覧と切り替えられるようにする。切り替えの状態は保存しない（リロードでカード一覧）。
//  ・列は①の6枚のサポカ（育成ウマ娘とシナリオの列は除く）。列の見出しはカードのアイコンだけ（メニューなし）。並べ替えは列の漏斗だけ（距離・脚質の絞り込みは付けない）。
//  ・行は②のスキル。セルの印（●確定・○選択肢しだい）は①の表と同じ判定。行の名前と Pt はカード一覧と同じ（段2 の◎・C-223 の差の Pt と「①と重なり」）。
//  ・金スキル: ②の白の上の金を①のサポカが持つときは表示専用の行（Pt なし・数えない）。
//  ・「◎を○に変えるモード」と◎のボタンは星取表でも同じ動き。①の描画関数・計算・保存データの形は変えない。
//  ・切り替えのボタンは②の入口の行の「削除」と◎のボタンの並び（◎の右。◎が無いときは「削除」の右）。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。

export async function register60(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const STEP = new Map(readJson('data/skill-step-up.json').entries.map((e) => [e.skillId, e.prevSkillIds || []]));
	const NEXT = new Map();
	STEP.forEach((prevs, id) => prevs.forEach((p) => { if (!NEXT.has(p)) NEXT.set(p, []); NEXT.get(p).push(id); }));
	const isGold = (id) => !!PT.get(id) && PT.get(id).rarity === 'gold';
	// 白の上の金（前段データを上へ、金に当たるまでたどる。検査の側の独立な導出）
	const goldsAbove = (id) => {
		const out = new Set(), seen = new Set([id]);
		if (isGold(id)) return out;
		const walk = (x) => (NEXT.get(x) || []).forEach((n) => { if (seen.has(n)) return; seen.add(n); if (isGold(n)) out.add(n); else walk(n); });
		walk(id);
		return out;
	};
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const R1 = { umaId: 'uma-0001', cardIds: CARDS6 };
	const R2 = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
	const A40 = { umaId: 'uma-0179', cardIds: ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'], skillFilter: { distance: 'long', style: 'senko', surface: 'turf' }, pt: { status: 'kire', umaHintLevel: 3 } };
	const ONE12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
	// 金の行が出る編成（2026-10-28 に実データで探した）: R1 の「32」の上の金は4枚目、「45」の上の金は1枚目が持つ
	const GIDS = ONE12.concat(['32', '45']);

	/** special.html を、①（下書きの編成）と②の下書きを入れて開く（blocks-57 と同じ作り）。②のタブを見せる */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, o.userData || EMPTY);
		await sp.page.evaluate(({ roster, ids, F }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (ids) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: F }));
			else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster || null, ids: o.ids || null, F: o.F === undefined ? 5 : o.F });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); try { await UmaSkillDeckCore.loadSkillEvolutions(); } catch (e) {} });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const viewBtn = (page) => page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-view"]'); return b ? b.getAttribute('aria-pressed') : null; });
	const setView = async (page, table) => {
		if (((await viewBtn(page)) === 'true') !== table) { await page.click(T + '[data-usd-el="factor-view"]'); await page.waitForTimeout(300); }
	};
	/** 製品の数（②の帯・見出し・①の帯）と保存データ・②の行（名前・Pt・◎・重なり） */
	const read = (page) => page.evaluate(() => {
		const s = deckTemplateManager.getSetSummary();
		const panels = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="selected-list"] .usd-panel[data-skill-id]')).map((p) => {
			const nb = p.querySelector('.usd-panel-namebtn');
			const pt = p.querySelector('[data-usd-el="panel-pt"]');
			const t = p.querySelector('[data-usd-el="factor-circle-toggle"]');
			return { id: p.dataset.skillId, name: nb ? nb.textContent : null, info: nb ? nb.getAttribute('data-usd-info') : null, pt: pt ? pt.textContent : '',
				ptShown: !!pt && getComputedStyle(pt).display !== 'none' && pt.textContent !== '', circle: p.dataset.usdCircle || null,
				overlap: !!p.querySelector('[data-usd-el="panel-overlap"]'), taken: p.classList.contains('usd-panel--taken'), toggle: t ? t.getAttribute('aria-pressed') : null };
		});
		const n = (sel) => { const e = document.querySelector(sel); return e ? Number(e.textContent.replace(/[^0-9]/g, '')) : null; };
		return { sum: s ? { factorPt: s.factorPt, factorKinds: s.factorKinds, commonPt: s.commonPt, rosterPt: s.rosterPt, total: s.total, totalKinds: s.totalKinds, crossPaired: s.crossPaired, overlapKinds: s.overlapKinds, uniqPt: s.uniqPt } : null,
			bandPt: n('#deck-template-panel [data-usd-el="factor-pt"]'), bandKinds: n('#deck-template-panel [data-usd-el="factor-count"]'),
			headTotal: (() => { const e = document.querySelector('#deck-set-bar [data-usd-el="set-total"]'); return e ? Number(e.dataset.total) : null; })(),
			headText: (() => { const e = document.querySelector('#deck-set-bar [data-usd-el="set-total"]'); return e ? e.textContent : null; })(),
			panels: panels, sel: (deckTemplateManager.getSelection() || {}).skillIds || null,
			storage: JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])),
			table: !!document.querySelector('#deck-template-panel [data-usd-el="factor-table"]'),
			overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
	});
	/** 星取表の行（各行の印は列ごとに ●＝got ／ ○＝maybe ／ -） */
	const readTable = (page) => page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table-row"]'));
		const heads = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table"] [role="columnheader"]'));
		return {
			rows: rows.map((r) => ({ id: r.dataset.fstarId, gold: r.dataset.usdGoldref === '1', prev: r.classList.contains('usd-roster-grow--prev'),
				hasPt: !!r.querySelector('[data-usd-el="panel-pt"]'), panel: !!r.querySelector('.usd-panel[data-skill-id]'),
				marks: Array.from(r.querySelectorAll('[role="cell"]')).map((c) => c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '○' : '-').join('') })),
			heads: heads.map((h) => ({ menu: !!h.querySelector('[data-usd-act="col-menu"]'), sort: h.querySelector('[data-usd-el="factor-table-sort"]') ? h.querySelector('[data-usd-el="factor-table-sort"]').getAttribute('aria-pressed') : null,
				icon: !!h.querySelector('.usd-card-icobox, .usd-gh-fallback'), empty: !!h.querySelector('[data-usd-el="gh-empty"]') })),
			wrap: (() => { const w = document.querySelector('#deck-template-panel [data-usd-el="factor-table"]'); return w ? { sw: w.scrollWidth, cw: w.clientWidth } : null; })()
		};
	});
	/** ①の表の行の印（サポカの6列だけ。①の列は 育成ウマ娘・サポカ6・シナリオ の順）。合成の「└」の行は除く */
	const readRosterMarks = (page) => page.evaluate(() => {
		const out = {};
		document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]:not([data-usd-derived])').forEach((r) => {
			const cells = Array.from(r.querySelectorAll('[role="cell"]')).slice(1, 7);
			out[r.dataset.skillId] = cells.map((c) => c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '○' : '-').join('');
		});
		return out;
	});
	const strip = (x) => JSON.stringify({ sum: x.sum, bandPt: x.bandPt, bandKinds: x.bandKinds, headTotal: x.headTotal, headText: x.headText, sel: x.sel, storage: x.storage });
	const byId = (panels) => new Map(panels.map((p) => [p.id, { name: p.name, info: p.info, pt: p.pt, circle: p.circle, overlap: p.overlap, taken: p.taken }]));

	await block('②星取表(1) 切り替え: ボタンは「削除」・◎のボタンと同じ行の◎の右（◎が無いときは「削除」の右）／既定はカード一覧／切り替えても②の帯・見出しの合計・種数・保存データ・②の id は変わらない／保存しない（リロードでカード一覧）', async () => {
		for (const c of [{ k: 'R1', roster: R1, ids: GIDS }, { k: 'A40', roster: A40, ids: ['230', '200041'] }]) {
			const sp = await openSp({ w: 1280, roster: c.roster, ids: c.ids });
			const errors = [];
			sp.page.on('pageerror', (e) => errors.push(String(e)));
			const order = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="tier-row"] > *')).map((e) => e.getAttribute('data-usd-el') || e.className));
			const iDel = order.indexOf('palette-delete'), iCircle = order.indexOf('factor-circle-mode'), iView = order.indexOf('factor-view');
			const want = iCircle === -1 ? iDel + 1 : iCircle + 1;
			assert(iView !== -1 && iView === want && (iCircle === -1 || iCircle === iDel + 1), '②星取表(1) ' + c.k + ' 切り替えのボタンは' + (iCircle === -1 ? '「削除」' : '◎のボタン') + 'のすぐ右', order.slice(0, 4));
			const tops = await sp.page.evaluate(() => ['palette-delete', 'factor-view'].map((k) => { const e = document.querySelector('#deck-template-panel [data-usd-el="' + k + '"]'); return e ? Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2) : null; }));
			assert(tops[0] !== null && Math.abs(tops[0] - tops[1]) <= 2, '②星取表(1) ' + c.k + ' 「削除」と同じ行（縦の中心が揃う）', tops);
			const a = await read(sp.page);
			assert((await viewBtn(sp.page)) === 'false' && !a.table, '②星取表(1) ' + c.k + ' 既定はカード一覧（ボタンは押していない状態）', null);
			await setView(sp.page, true);
			const b = await read(sp.page);
			assert((await viewBtn(sp.page)) === 'true' && b.table, '②星取表(1) ' + c.k + ' 押すと星取表（aria-pressed=true）', null);
			assert(strip(a) === strip(b), '②星取表(1) ' + c.k + ' 切り替えても②の帯・見出しの合計・種数・②の id・localStorage は同じ', { a: strip(a).slice(0, 200), b: strip(b).slice(0, 200) });
			const focused = await sp.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-usd-el'));
			assert(focused === 'factor-view', '②星取表(1) ' + c.k + ' 押したあともフォーカスは切り替えのボタン', focused);
			await setView(sp.page, false);
			const a2 = await read(sp.page);
			assert(!a2.table && strip(a2) === strip(a), '②星取表(1) ' + c.k + ' もう一度押すとカード一覧に戻る（数・保存データは同じ）', null);
			await setView(sp.page, true);
			await sp.page.reload({ waitUntil: 'networkidle' });
			await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
			await sp.page.waitForTimeout(800);
			const r = await read(sp.page);
			assert((await viewBtn(sp.page)) === 'false' && !r.table, '②星取表(1) ' + c.k + ' 読み込み直すとカード一覧（切り替えは保存しない）', null);
			assert(jsErrors(errors).length === 0, '②星取表(1) ' + c.k + ' コンソールのエラー0', jsErrors(errors));
			await sp.ctx.close();
		}
	});

	await block('②星取表(2) 行: カード一覧と星取表で、行の顔ぶれ・名前・ⓘ・Pt・◎・「①と重なり」・「①で取得」が一致する（金の表示専用の行を除く）／金の行は Pt を持たず②の id に入らない', async () => {
		const cases = [{ k: 'R1+金', roster: R1, ids: GIDS }, { k: 'R2', roster: R2, ids: ONE12 }, { k: 'A40', roster: A40, ids: ['230', '200041'] }, { k: '①なし', roster: null, ids: ONE12 }];
		for (const c of cases) {
			const sp = await openSp({ w: 1280, roster: c.roster, ids: c.ids });
			const a = await read(sp.page);
			await setView(sp.page, true);
			const b = await read(sp.page);
			const t = await readTable(sp.page);
			const ma = byId(a.panels), mb = byId(b.panels);
			assert(a.panels.length === c.ids.length && b.panels.length === c.ids.length, '②星取表(2) ' + c.k + ' 行の数は②のスキルの数（' + c.ids.length + '）', { a: a.panels.length, b: b.panels.length });
			const diff = [];
			ma.forEach((v, id) => { if (JSON.stringify(v) !== JSON.stringify(mb.get(id))) diff.push({ id, a: v, b: mb.get(id) || null }); });
			assert(diff.length === 0 && ma.size === mb.size, '②星取表(2) ' + c.k + ' 各行の名前・ⓘ・Pt・◎・①と重なり・①で取得がカード一覧と同じ', diff.slice(0, 3));
			const nonGold = t.rows.filter((r) => !r.gold);
			assert(nonGold.length === c.ids.length && nonGold.every((r) => r.panel && r.hasPt) && JSON.stringify(nonGold.map((r) => r.id).sort()) === JSON.stringify(c.ids.slice().sort()),
				'②星取表(2) ' + c.k + ' 金の表示専用の行を除いた行は②のスキルと同じ顔ぶれ（各行に Pt の欄）', nonGold.map((r) => r.id).slice(0, 5));
			const gold = t.rows.filter((r) => r.gold);
			assert(gold.every((r) => !r.hasPt && !r.panel && b.sel.indexOf(r.id) === -1), '②星取表(2) ' + c.k + ' 金の行は Pt を持たず、②の id（getSelection）に入らない', gold);
			assert(t.rows.length === nonGold.length + gold.length, '②星取表(2) ' + c.k + ' 行は②のスキルと金の行だけ', t.rows.length);
			await sp.ctx.close();
		}
	});

	await block('②星取表(3) 列と印: 列は①の6枚のサポカだけ（アイコンだけ・メニューなし・漏斗）／印は①の表の同じ行と同じ（①で絞った結果。①に行が無いスキルは印なし）', async () => {
		for (const c of [{ k: 'R1', roster: R1, ids: GIDS }, { k: 'R2', roster: R2, ids: ONE12.concat(['32', '45']) }, { k: 'A40', roster: A40, ids: ['230', '200041'].concat(ONE12) }]) {
			const sp = await openSp({ w: 1280, roster: c.roster, ids: c.ids });
			const rm = await readRosterMarks(sp.page);
			await setView(sp.page, true);
			const t = await readTable(sp.page);
			const heads = t.heads.slice(1);
			assert(t.heads.length === 7 && heads.every((h) => !h.menu && h.icon && h.sort === 'false'), '②星取表(3) ' + c.k + ' 列見出しは「スキル名」＋サポカ6枚（アイコンと漏斗・イベントを選ぶメニューなし）', t.heads);
			const bad = t.rows.filter((r) => r.marks !== (rm[r.id] || '------'));
			assert(bad.length === 0 && t.rows.every((r) => r.marks.length === 6), '②星取表(3) ' + c.k + ' 各行の●／○は①の表の同じ行のサポカ6列と同じ（①に行が無ければ印なし）', bad.slice(0, 4).map((r) => ({ id: r.id, t: r.marks, r: rm[r.id] || null })));
			assert(t.rows.some((r) => r.marks !== '------'), '②星取表(3) ' + c.k + ' 印のある行がある（検査が空振りしていない）', null);
			await sp.ctx.close();
		}
		// ①なしのセット: 6列とも空きの枠（漏斗なし）・印なし
		const sp = await openSp({ w: 1280, roster: null, ids: ONE12 });
		await setView(sp.page, true);
		const t = await readTable(sp.page);
		assert(t.heads.length === 7 && t.heads.slice(1).every((h) => h.empty && h.sort === null) && t.rows.every((r) => r.marks === '------'), '②星取表(3) ①なし: 6列とも空きの枠（漏斗なし）・印なし', t.heads.slice(1, 3));
		await sp.ctx.close();
	});

	await block('②星取表(4) 金の行: ②の白の上の金を①のサポカが持つときだけ、その金の行（表示専用）を出し、その列に印／直下に②の白（└）／数えない（②の帯・見出し・種数・C-178 の重なりは、金の行が無い②と同じ）', async () => {
		const sp = await openSp({ w: 1280, roster: R1, ids: GIDS });
		const rm = await readRosterMarks(sp.page);
		const a = await read(sp.page);
		await setView(sp.page, true);
		const b = await read(sp.page);
		const t = await readTable(sp.page);
		// 期待する金の行（検査の側で独立に導出）: ②の白の上の金で、②に無く、①の表のその金の行のサポカ6列に印があるもの
		const want = new Set();
		GIDS.forEach((id) => goldsAbove(id).forEach((g) => { if (GIDS.indexOf(g) === -1 && rm[g] && rm[g] !== '------') want.add(g); }));
		const got = t.rows.filter((r) => r.gold).map((r) => r.id);
		assert(want.size >= 2 && JSON.stringify([...want].sort()) === JSON.stringify(got.slice().sort()), '②星取表(4) 金の行は「②の白の上の金で、①のサポカが持つもの」と一致（2件以上）', { want: [...want], got });
		const bad = [];
		t.rows.forEach((r, i) => {
			if (!r.gold) return;
			if (r.marks !== rm[r.id]) bad.push({ id: r.id, why: 'marks', t: r.marks, r: rm[r.id] });
			const next = t.rows[i + 1];
			if (!next || !next.prev || ![...goldsAbove(next.id)].includes(r.id)) bad.push({ id: r.id, why: 'under', next: next && next.id });
		});
		assert(bad.length === 0, '②星取表(4) 金の行の印は①の表の同じ金の行と同じ・直下にその前段の②の白（└）', bad);
		assert(strip(a) === strip(b), '②星取表(4) 金の行を出しても、②の帯・見出しの合計・種数・C-178 の重なり・②の id・保存データは変わらない', null);
		assert(JSON.stringify(b.sel) === JSON.stringify(GIDS) && got.every((g) => b.sel.indexOf(g) === -1), '②星取表(4) 金の行の id は②の id（③・コピー・Deck の記録へ渡すもの）に入らない', { got, sel: b.sel.length });
		await sp.ctx.close();
		// 金を持つサポカを外すと（①なし）、金の行は出ない
		const sp2 = await openSp({ w: 1280, roster: null, ids: GIDS });
		await setView(sp2.page, true);
		const t2 = await readTable(sp2.page);
		assert(t2.rows.filter((r) => r.gold).length === 0, '②星取表(4) ①なしでは金の行は出ない', t2.rows.filter((r) => r.gold).map((r) => r.id));
		await sp2.ctx.close();
	});

	await block('②星取表(5) 列の漏斗: 押した列が持つ（●か○）スキルのまとまりを上へ（安定ソート・金と直下の白は崩さない）／押した漏斗だけ aria-pressed／もう一度押すと元の並び', async () => {
		const sp = await openSp({ w: 1280, roster: R1, ids: GIDS });
		await setView(sp.page, true);
		const t0 = await readTable(sp.page);
		const units = (rows) => { const out = []; rows.forEach((r) => { if (r.prev && out.length) out[out.length - 1].push(r); else out.push([r]); }); return out; };
		let checked = 0;
		for (const col of [1, 4]) {
			await sp.page.click(T + '[data-usd-el="factor-table-sort"][data-no="' + col + '"]');
			await sp.page.waitForTimeout(250);
			const t = await readTable(sp.page);
			const has = (u) => u.some((r) => r.marks[col - 1] !== '-');
			const u0 = units(t0.rows);
			const expect = u0.filter(has).concat(u0.filter((u) => !has(u))).flat().map((r) => r.id);
			assert(JSON.stringify(t.rows.map((r) => r.id)) === JSON.stringify(expect) && u0.some(has), '②星取表(5) ' + col + '枚目の漏斗: その列の印のあるまとまりが上（安定）', { got: t.rows.map((r) => r.id).slice(0, 6), want: expect.slice(0, 6) });
			const pressed = t.heads.slice(1).map((h) => h.sort);
			assert(pressed.filter((p) => p === 'true').length === 1 && pressed[col - 1] === 'true', '②星取表(5) ' + col + '枚目の漏斗だけ押した状態', pressed);
			const sum = await read(sp.page);
			assert(sum.sum.factorPt === (await sp.page.evaluate(() => deckTemplateManager.getSetSummary().factorPt)), '②星取表(5) 並べ替えで数は変わらない', null);
			checked++;
		}
		await sp.page.click(T + '[data-usd-el="factor-table-sort"][data-no="4"]');
		await sp.page.waitForTimeout(250);
		const t3 = await readTable(sp.page);
		assert(JSON.stringify(t3.rows.map((r) => r.id)) === JSON.stringify(t0.rows.map((r) => r.id)) && t3.heads.slice(1).every((h) => h.sort === 'false'), '②星取表(5) もう一度押すと元の並び（どの漏斗も押していない）', null);
		assert(checked === 2, '②星取表(5) 2つの列で確かめた', checked);
		await sp.ctx.close();
	});

	await block('②星取表(6) ◎を○に変えるモード: 星取表でも全行の Pt を隠し、候補の行だけ◎／○（カード一覧と同じ）／押すと○に戻り、数と保存はカード一覧で押したときと同じ／星取表のまま', async () => {
		const results = [];
		for (const view of ['cards', 'table']) {
			const sp = await openSp({ w: 390, roster: R1, ids: GIDS });
			if (view === 'table') await setView(sp.page, true);
			await sp.page.click(T + '[data-usd-el="factor-circle-mode"]');
			await sp.page.waitForTimeout(300);
			const m = await read(sp.page);
			const cand = m.panels.filter((p) => p.toggle !== null);
			results.push({ view, shown: m.panels.filter((p) => p.ptShown).length, toggles: cand.map((p) => p.id + ':' + p.toggle).join(',') });
			const first = cand[0];
			await sp.page.click(T + '[data-usd-el="factor-circle-toggle"][data-skill-id="' + first.id + '"]');
			await sp.page.waitForTimeout(300);
			const after = await read(sp.page);
			const d = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')));
			results[results.length - 1].after = { pt: after.sum.factorPt, keep: d.keepCircleIds, table: after.table, toggle: after.panels.find((p) => p.id === first.id).toggle };
			await sp.ctx.close();
		}
		const [c, t] = results;
		assert(c.shown === 0 && t.shown === 0, '②星取表(6) モードでは、カード一覧・星取表とも Pt を表示している行が0', results.map((r) => r.shown));
		assert(c.toggles !== '' && c.toggles === t.toggles, '②星取表(6) 切り替えのある行（候補）と状態がカード一覧と同じ', { c: c.toggles, t: t.toggles });
		assert(JSON.stringify(c.after.keep) === JSON.stringify(t.after.keep) && c.after.pt === t.after.pt && t.after.toggle === 'false' && t.after.table === true,
			'②星取表(6) 星取表で押しても、keepCircleIds・②の Pt はカード一覧で押したときと同じ・星取表のまま・その行は○', { c: c.after, t: t.after });
	});

	await block('②星取表(7) 幅: 375・360・320px で横スクロールが出ない（表の中も）／名前の列とサポカの列が入る／コンソールのエラー0／「削除」で行を押すと②から外れる', async () => {
		for (const w of [375, 360, 320]) {
			const sp = await openSp({ w, roster: R1, ids: GIDS });
			const errors = [];
			sp.page.on('pageerror', (e) => errors.push(String(e)));
			sp.page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
			await setView(sp.page, true);
			const b = await read(sp.page);
			const t = await readTable(sp.page);
			assert(!b.overflowX && t.wrap && t.wrap.sw <= t.wrap.cw + 1, '②星取表(7) ' + w + 'px 横スクロールなし（ページ・表の中）', { page: b.overflowX, wrap: t.wrap });
			const geo = await sp.page.evaluate(() => {
				const hs = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table"] [role="columnheader"]'));
				const ic = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table"] .usd-fstar-ghicon'));
				return { name: Math.round(hs[0].getBoundingClientRect().width), col: Math.round(hs[1].getBoundingClientRect().width), icon: ic.length ? Math.round(ic[0].getBoundingClientRect().width) : 0 };
			});
			assert(geo.name >= 100 && geo.col >= 24 && geo.icon <= geo.col, '②星取表(7) ' + w + 'px 名前の列 100px 以上・サポカの列にアイコン（24px）が入る', geo);
			assert(jsErrors(errors).length === 0, '②星取表(7) ' + w + 'px コンソールのエラー0', jsErrors(errors));
			await sp.ctx.close();
		}
		const sp = await openSp({ w: 390, roster: R1, ids: GIDS });
		await setView(sp.page, true);
		await sp.page.click(T + '[data-usd-el="palette-delete"]');
		await sp.page.waitForTimeout(200);
		await sp.page.click(T + '[data-usd-el="factor-table"] .usd-panel[data-skill-id="12"] .usd-panel-namebtn');
		await sp.page.waitForTimeout(300);
		const after = await read(sp.page);
		assert(after.sel.indexOf('12') === -1 && after.sel.length === GIDS.length - 1 && after.table, '②星取表(7) 削除の状態で星取表の行を押すと②から外れる（星取表のまま）', after.sel);
		await sp.ctx.close();
	});
}
