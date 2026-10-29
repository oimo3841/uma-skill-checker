// ②因子周回 段3（星取表。2026-10-28）と、その作り直し（C-225・2026-10-28）の検査。run-smoke.mjs の末尾から register60() で呼ばれる
// （塊の見出しはすべて「②星取表」で始まる。`npm run test:visual -- --only=②星取表` で回せる）。
//
// 決め（おいもさん・段3 → C-225 で列・見出し・行を作り直し）:
//  ・②にも①と同じ星取表の表示を足し、今のカード一覧と切り替えられるようにする。切り替えの状態は保存しない（リロードでカード一覧）。
//  ・列はオススメサポの小窓で「追加」を押したときの提案のカード（roster.outsideOptions.cards。セットごと・保存のとおりの枚数）。保存が無ければ空きの6枠（今までの「①なし」と同じ）。
//  ・列見出しは①と同じ（アイコン・押すとメニュー「イベント/スキル」「ソート」）。列の漏斗は無い。イベントの小窓は見せるだけ。
//  ・行は有効（②のスキル）と、その下の無効の段（オススメサポのカードで得られるのに②に無いスキル − ①の絞り込みに合わないもの − ②で選べないもの）。
//    無効の行は数えない（Pt・種数・合計・②の id）。押すと②に足す。②から外すと（カードで得られるなら）無効の段に戻る。カード一覧にも同じ2段。
//  ・印（●確定・○選択肢しだい）は①の表と同じ判定（①の編成のカードをオススメサポのカードに置き換えて数える）。
//  ・金の行: ②の白の上の金を列のカードが持つときは表示専用の行（Pt なし・数えない）。
//  ・保存: 「追加」を押したときだけ書く（計算しただけでは書かない）・①を替えても消さない・次の「追加」で置き換える・保存の無いセットは開いただけでは書かない。
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
	// オススメサポの提案のカード（保存の項目に直接入れて使う。5枚＝既定の枚数）
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const FILT = { distance: 'medium', style: 'senko', surface: 'turf' };
	const R1 = { umaId: 'uma-0001', cardIds: CARDS6 };
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const R2S = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: FILT, outsideOptions: { cards: SAVED5 } };
	// 金の行が出る組（2026-10-28 に実データで探した）: CARDS6 をオススメサポのカードにすると「32」の上の金は4枚目、「45」の上の金は1枚目が持つ。①は空
	const RG = { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null], outsideOptions: { cards: CARDS6 } };
	const ONE12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
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
	/** 製品の数（②の帯・見出し・①の帯）と保存データ・②の行（名前・Pt・◎・重なり）・無効の行 */
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
		const head = document.querySelector('#deck-template-panel [data-usd-el="factor-off-head"]');
		return { sum: s ? { factorPt: s.factorPt, factorKinds: s.factorKinds, commonPt: s.commonPt, rosterPt: s.rosterPt, total: s.total, totalKinds: s.totalKinds, crossPaired: s.crossPaired, overlapKinds: s.overlapKinds, uniqPt: s.uniqPt } : null,
			bandPt: n('#deck-template-panel [data-usd-el="factor-pt"]'), bandKinds: n('#deck-template-panel [data-usd-el="factor-count"]'),
			headTotal: (() => { const e = document.querySelector('#deck-set-bar [data-usd-el="set-total"]'); return e ? Number(e.dataset.total) : null; })(),
			headText: (() => { const e = document.querySelector('#deck-set-bar [data-usd-el="set-total"]'); return e ? e.textContent : null; })(),
			panels: panels, sel: (deckTemplateManager.getSelection() || {}).skillIds || null,
			off: Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-off-row"]')).map((e) => e.dataset.offSkillId),
			offHead: head ? head.textContent : null,
			storage: JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])),
			roster: JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'),
			table: !!document.querySelector('#deck-template-panel [data-usd-el="factor-table"]'),
			overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
	});
	/** 星取表の行（各行の印は列ごとに ●＝got ／ ○＝maybe ／ -）と列見出し */
	const readTable = (page) => page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table-row"]'));
		const heads = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table"] [role="columnheader"]'));
		return {
			rows: rows.map((r) => ({ id: r.dataset.fstarId, gold: r.dataset.usdGoldref === '1', off: r.dataset.usdFstarOff === '1', prev: r.classList.contains('usd-roster-grow--prev'),
				hasPt: !!r.querySelector('[data-usd-el="panel-pt"]'), panel: !!r.querySelector('.usd-panel[data-skill-id]'),
				marks: Array.from(r.querySelectorAll('[role="cell"]')).map((c) => c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '○' : '-').join('') })),
			heads: heads.map((h) => { const b = h.querySelector('[data-usd-el="factor-col-menu"]');
				return { menu: !!b, key: b ? b.getAttribute('data-member-key') : null, sorted: b ? b.getAttribute('data-sorted') === '1' : false, funnel: !!h.querySelector('.usd-roster-funnel'),
					icon: !!h.querySelector('.usd-card-icobox, .usd-gh-fallback'), empty: !!h.querySelector('[data-usd-el="gh-empty"]') }; }),
			offHead: (() => { const e = document.querySelector('#deck-template-panel [data-usd-el="factor-table"] [data-usd-el="factor-off-head"]'); return e ? e.textContent : null; })(),
			wrap: (() => { const w = document.querySelector('#deck-template-panel [data-usd-el="factor-table"]'); return w ? { sw: w.scrollWidth, cw: w.clientWidth } : null; })()
		};
	});
	/** ①の表の行の印（サポカの列だけ。①の列は 育成ウマ娘・サポカ6・シナリオ の順）。合成の「└」の行は除く。n は見る列の数 */
	const readRosterMarks = (page, n = 6) => page.evaluate((n) => {
		const out = {};
		document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]:not([data-usd-derived])').forEach((r) => {
			const cells = Array.from(r.querySelectorAll('[role="cell"]')).slice(1, 1 + n);
			out[r.dataset.skillId] = cells.map((c) => c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '○' : '-').join('');
		});
		return out;
	}, n);
	/**
	 * 無効の段の期待値（検査の側で独立に割り出す）: ①の編成のカードをオススメサポのカードに置き換えた①の表（別のページで開く）の行のうち、サポカの列に印があるもの
	 * − ②に入っているもの − ①の絞り込みに合わないもの（matchesFilters）− ②で選べないもの（検索の母集団〔マスター＋検索に出す拡張〕に無い・①で取得する〔getPickerHiddenIds〕）
	 */
	const expectOff = async (roster, ids, n) => {
		const alt = Object.assign({}, roster, { cardIds: roster.outsideOptions.cards.concat([null, null, null, null, null, null]).slice(0, 6) });
		delete alt.outsideOptions;
		const sp = await openSp({ w: 1280, roster: alt, ids: [] });
		const rm = await readRosterMarks(sp.page, n);
		await sp.ctx.close();
		return { rm, judge: async (page) => page.evaluate(({ rm, ids, filt }) => {
			const C = UmaSkillDeckCore;
			const pool = new Set(C.getMasterSkills().map((s) => s.id).concat(C.getSearchableExtendedSkillIds ? C.getSearchableExtendedSkillIds() : []));
			const hidden = new Set(C.getPickerHiddenIds());
			const filters = {};
			Object.keys(filt || {}).forEach((k) => { filters[k] = [filt[k]]; });
			return Object.keys(rm).filter((id) => rm[id].indexOf('●') !== -1 || rm[id].indexOf('○') !== -1)
				.filter((id) => ids.indexOf(id) === -1 && pool.has(id) && !hidden.has(id))
				.filter((id) => { const s = C.findSkill(id); return !!s && (Object.keys(filters).length === 0 || C.matchesFilters(s, filters, null)); })
				.sort((a, b) => C.compareGameOrder(a, b));
		}, { rm, ids, filt: roster.skillFilter || null }) };
	};
	const strip = (x) => JSON.stringify({ sum: x.sum, bandPt: x.bandPt, bandKinds: x.bandKinds, headTotal: x.headTotal, headText: x.headText, sel: x.sel, storage: x.storage });
	const stripNums = (x) => JSON.stringify({ sum: x.sum, bandPt: x.bandPt, bandKinds: x.bandKinds, headTotal: x.headTotal, headText: x.headText, sel: x.sel });
	const byId = (panels) => new Map(panels.map((p) => [p.id, { name: p.name, info: p.info, pt: p.pt, circle: p.circle, overlap: p.overlap, taken: p.taken }]));

	await block('②星取表(1) 切り替え: ボタンは入口の行の右端の塊の◎の右・「削除」の左（C-226。◎が無いときは塊の先頭）／既定はカード一覧／切り替えても②の帯・見出しの合計・種数・保存データ・②の id は変わらない／保存しない（リロードでカード一覧）', async () => {
		for (const c of [{ k: 'R1S', roster: R1S, ids: GIDS }, { k: 'R1（保存なし）', roster: R1, ids: ['230', '200041'] }]) {
			const sp = await openSp({ w: 1280, roster: c.roster, ids: c.ids });
			const errors = [];
			sp.page.on('pageerror', (e) => errors.push(String(e)));
			const order = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="tier-row"] > *')).map((e) => e.getAttribute('data-usd-el') || e.className));
			// C-226（②因子周回 段4）: 入口の行の右端の塊は「◎（候補があるときだけ）・表の切り替え・削除」（削除が一番右）
			const iCircle = order.indexOf('factor-circle-mode');
			// C-235: 並びは 削除・↺・虫眼鏡・（◎）・表の切り替え（表が一番右）
			const want = ['palette-delete', 'factor-reset', 'entry-search'].concat(iCircle === -1 ? [] : ['factor-circle-mode']).concat(['factor-view']);
			assert(JSON.stringify(order) === JSON.stringify(want), '②星取表(1) ' + c.k + ' 切り替えのボタンは塊の一番右（' + (iCircle === -1 ? '虫眼鏡' : '◎のボタン') + 'のすぐ右。C-235）', order);
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

	await block('②星取表(2) 行: カード一覧と星取表で、有効の行の顔ぶれ・名前・ⓘ・Pt・◎・「①と重なり」・「①で取得」が一致し、無効の行の顔ぶれと並びも一致する／金の行・無効の行は Pt を持たず②の id に入らない', async () => {
		const cases = [{ k: 'R1S', roster: R1S, ids: GIDS }, { k: 'R2S', roster: R2S, ids: ONE12 }, { k: 'RG（金）', roster: RG, ids: GIDS }, { k: '①なし', roster: null, ids: ONE12 }];
		for (const c of cases) {
			const sp = await openSp({ w: 1280, roster: c.roster, ids: c.ids });
			const a = await read(sp.page);
			await setView(sp.page, true);
			const b = await read(sp.page);
			const t = await readTable(sp.page);
			const ma = byId(a.panels), mb = byId(b.panels);
			assert(a.panels.length === c.ids.length && b.panels.length === c.ids.length, '②星取表(2) ' + c.k + ' 有効の行の数は②のスキルの数（' + c.ids.length + '）', { a: a.panels.length, b: b.panels.length });
			const diff = [];
			ma.forEach((v, id) => { if (JSON.stringify(v) !== JSON.stringify(mb.get(id))) diff.push({ id, a: v, b: mb.get(id) || null }); });
			assert(diff.length === 0 && ma.size === mb.size, '②星取表(2) ' + c.k + ' 各行の名前・ⓘ・Pt・◎・①と重なり・①で取得がカード一覧と同じ', diff.slice(0, 3));
			assert(JSON.stringify(a.off) === JSON.stringify(b.off) && JSON.stringify(t.rows.filter((r) => r.off).map((r) => r.id)) === JSON.stringify(b.off) && a.offHead === b.offHead,
				'②星取表(2) ' + c.k + ' 無効の行の顔ぶれ・並び・見出しがカード一覧と同じ', { a: a.off, b: b.off });
			const valid = t.rows.filter((r) => !r.gold && !r.off);
			assert(valid.length === c.ids.length && valid.every((r) => r.panel && r.hasPt) && JSON.stringify(valid.map((r) => r.id).sort()) === JSON.stringify(c.ids.slice().sort()),
				'②星取表(2) ' + c.k + ' 金・無効の行を除いた行は②のスキルと同じ顔ぶれ（各行に Pt の欄）', valid.map((r) => r.id).slice(0, 5));
			const extra = t.rows.filter((r) => r.gold || r.off);
			assert(extra.every((r) => !r.hasPt && !r.panel && b.sel.indexOf(r.id) === -1), '②星取表(2) ' + c.k + ' 金の行・無効の行は Pt を持たず、②の id（getSelection）に入らない', extra.slice(0, 3));
			// 無効の行は有効の行（金の行を含む）より下にまとまる
			const firstOff = t.rows.findIndex((r) => r.off);
			assert(firstOff === -1 || t.rows.slice(firstOff).every((r) => r.off), '②星取表(2) ' + c.k + ' 無効の行は最下段にまとまる', firstOff);
			await sp.ctx.close();
		}
	});

	await block('②星取表(3) 列と印: 列はオススメサポの提案のカード（保存のとおりの枚数・①と同じメニューのボタン・漏斗なし）／印は①の編成のカードをそのカードに置き換えた①の表と同じ／保存が無ければ空きの6枠・印なし・無効の段なし・開いただけでは書かない', async () => {
		for (const c of [{ k: 'R1S', roster: R1S, ids: GIDS }, { k: 'R2S（絞り込み）', roster: R2S, ids: ONE12.concat(['32', '45']) }, { k: 'RG', roster: RG, ids: GIDS }]) {
			const n = c.roster.outsideOptions.cards.length;
			const alt = Object.assign({}, c.roster, { cardIds: c.roster.outsideOptions.cards.concat([null, null, null, null, null, null]).slice(0, 6) });
			delete alt.outsideOptions;
			const sp0 = await openSp({ w: 1280, roster: alt, ids: [] });
			const rm = await readRosterMarks(sp0.page, n);
			await sp0.ctx.close();
			const sp = await openSp({ w: 1280, roster: c.roster, ids: c.ids });
			await setView(sp.page, true);
			const t = await readTable(sp.page);
			const heads = t.heads.slice(1);
			assert(t.heads.length === 1 + n && heads.every((h) => h.menu && h.icon && !h.funnel && !h.empty), '②星取表(3) ' + c.k + ' 列見出しは「スキル名」＋オススメサポのカード' + n + '枚（アイコンのメニューのボタン・漏斗なし）', t.heads);
			const bad = t.rows.filter((r) => !r.off && r.marks !== (rm[r.id] || '-'.repeat(n)));
			assert(bad.length === 0 && t.rows.every((r) => r.marks.length === n), '②星取表(3) ' + c.k + ' 有効・金の行の●／○は、置き換えた①の表の同じ行と同じ（①に行が無ければ印なし）', bad.slice(0, 4).map((r) => ({ id: r.id, t: r.marks, r: rm[r.id] || null })));
			const badOff = t.rows.filter((r) => r.off && r.marks !== rm[r.id]);
			assert(badOff.length === 0, '②星取表(3) ' + c.k + ' 無効の行の印も置き換えた①の表と同じ', badOff.slice(0, 3));
			assert(t.rows.some((r) => !r.off && /[●○]/.test(r.marks)), '②星取表(3) ' + c.k + ' 印のある有効の行がある（検査が空振りしていない）', null);
			await sp.ctx.close();
		}
		// 保存が無いセット（①はある）: 6列とも空きの枠・印なし・無効の段なし。開いて切り替えても保存データを書かない
		for (const c of [{ k: 'R1（保存なし）', roster: R1 }, { k: '①なし', roster: null }]) {
			const sp = await openSp({ w: 1280, roster: c.roster, ids: ONE12 });
			const a = await read(sp.page);
			await setView(sp.page, true);
			const t = await readTable(sp.page);
			const b = await read(sp.page);
			assert(t.heads.length === 7 && t.heads.slice(1).every((h) => h.empty && !h.menu) && t.rows.every((r) => r.marks === '------') && t.rows.every((r) => !r.off) && b.off.length === 0 && a.off.length === 0,
				'②星取表(3) ' + c.k + ': 6列とも空きの枠・印なし・無効の段なし（カード一覧・星取表とも）', t.heads.slice(1, 3));
			assert(a.storage === b.storage && (!b.roster || !b.roster.outsideOptions), '②星取表(3) ' + c.k + ': 開いて切り替えても保存データは変わらない（outsideOptions を書かない）', b.roster && b.roster.outsideOptions);
			await sp.ctx.close();
		}
	});

	await block('②星取表(4) 金の行: ②の白の上の金を列のカードが持つときだけ、その金の行（表示専用）を出し、その列に印／直下に②の白（└）／数えない（②の帯・見出し・種数・C-178 の重なりは、保存の無い同じ②と同じ）', async () => {
		const alt = { umaId: 'uma-0001', cardIds: CARDS6 };
		const sp0 = await openSp({ w: 1280, roster: alt, ids: [] });
		const rm = await readRosterMarks(sp0.page);
		await sp0.ctx.close();
		const sp = await openSp({ w: 1280, roster: RG, ids: GIDS });
		const a = await read(sp.page);
		await setView(sp.page, true);
		const b = await read(sp.page);
		const t = await readTable(sp.page);
		const want = new Set();
		GIDS.forEach((id) => goldsAbove(id).forEach((g) => { if (GIDS.indexOf(g) === -1 && rm[g] && rm[g] !== '------') want.add(g); }));
		const got = t.rows.filter((r) => r.gold).map((r) => r.id);
		assert(want.size >= 2 && JSON.stringify([...want].sort()) === JSON.stringify(got.slice().sort()), '②星取表(4) 金の行は「②の白の上の金で、列のカードが持つもの」と一致（2件以上）', { want: [...want], got });
		const bad = [];
		t.rows.forEach((r, i) => {
			if (!r.gold) return;
			if (r.marks !== rm[r.id]) bad.push({ id: r.id, why: 'marks', t: r.marks, r: rm[r.id] });
			const next = t.rows[i + 1];
			if (!next || !next.prev || ![...goldsAbove(next.id)].includes(r.id)) bad.push({ id: r.id, why: 'under', next: next && next.id });
		});
		assert(bad.length === 0, '②星取表(4) 金の行の印は置き換えた①の表の同じ金の行と同じ・直下にその前段の②の白（└）', bad);
		assert(strip(a) === strip(b), '②星取表(4) 金の行を出しても、②の帯・見出しの合計・種数・②の id・保存データは変わらない', null);
		assert(JSON.stringify(b.sel) === JSON.stringify(GIDS) && got.every((g) => b.sel.indexOf(g) === -1), '②星取表(4) 金の行の id は②の id に入らない', { got, sel: b.sel.length });
		await sp.ctx.close();
		// 同じ①・②で、保存の無いセット: 数（帯・見出し・C-178 の重なり）は同じ・金の行は出ない
		const sp2 = await openSp({ w: 1280, roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null] }, ids: GIDS });
		const c2 = await read(sp2.page);
		await setView(sp2.page, true);
		const t2 = await readTable(sp2.page);
		assert(t2.rows.filter((r) => r.gold).length === 0 && stripNums(c2) === stripNums(a), '②星取表(4) 保存が無ければ金の行は出ず、数は保存のあるセットと同じ（金の行・無効の段は数えない）', { a: stripNums(a).slice(0, 160), c: stripNums(c2).slice(0, 160) });
		await sp2.ctx.close();
	});

	await block('②星取表(5) ソート（列見出しのメニュー）: 押した列が持つ（●か○）スキルのまとまりを上へ（安定ソート・金と直下の白は崩さない・無効の段の中も）／その列の見出しだけ並べ替え中／もう一度で元の並び／漏斗のボタンは無い', async () => {
		const sp = await openSp({ w: 1280, roster: RG, ids: GIDS });
		await setView(sp.page, true);
		const t0 = await readTable(sp.page);
		assert(await sp.page.evaluate(() => document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table-sort"], #deck-template-panel [data-usd-el="factor-table"] .usd-roster-funnel').length) === 0, '②星取表(5) 列の漏斗のボタンは無い', null);
		const units = (rows) => { const out = []; rows.forEach((r) => { if (r.prev && out.length) out[out.length - 1].push(r); else out.push([r]); }); return out; };
		const sortBy = async (col) => {
			await sp.page.click(T + '[data-usd-el="factor-col-menu"][data-no="' + col + '"]');
			await sp.page.waitForSelector('[data-usd-el="colmenu-sort"]');
			await sp.page.click('[data-usd-el="colmenu-sort"]');
			await sp.page.waitForTimeout(300);
		};
		let checked = 0;
		for (const col of [1, 4]) {
			await sortBy(col);
			const t = await readTable(sp.page);
			const has = (u) => u.some((r) => r.marks[col - 1] !== '-');
			const u0 = units(t0.rows.filter((r) => !r.off));
			const off0 = t0.rows.filter((r) => r.off);
			const offHas = (r) => r.marks[col - 1] !== '-';
			const expect = u0.filter(has).concat(u0.filter((u) => !has(u))).flat().map((r) => r.id).concat(off0.filter(offHas).concat(off0.filter((r) => !offHas(r))).map((r) => r.id));
			assert(JSON.stringify(t.rows.map((r) => r.id)) === JSON.stringify(expect) && u0.some(has), '②星取表(5) ' + col + '枚目のソート: その列の印のあるまとまりが上（安定・無効の段の中も）', { got: t.rows.map((r) => r.id).slice(0, 6), want: expect.slice(0, 6) });
			const sorted = t.heads.slice(1).map((h) => h.sorted);
			assert(sorted.filter(Boolean).length === 1 && sorted[col - 1], '②星取表(5) ' + col + '枚目の見出しだけ並べ替え中（data-sorted）', sorted);
			checked++;
		}
		await sortBy(4);
		const t3 = await readTable(sp.page);
		assert(JSON.stringify(t3.rows.map((r) => r.id)) === JSON.stringify(t0.rows.map((r) => r.id)) && t3.heads.slice(1).every((h) => !h.sorted), '②星取表(5) もう一度押すと元の並び（どの列も並べ替えていない）', null);
		assert(checked === 2, '②星取表(5) 2つの列で確かめた', checked);
		await sp.ctx.close();
	});

	await block('②星取表(6) 列見出しのメニューとイベントの小窓: メニューは①と同じ（「イベント/スキル」「ソート」）／イベントの小窓は①と同じ部品で見せるだけ（選択肢を押しても保存も表示も変わらない）／もう一度押すとメニューが閉じる', async () => {
		const sp = await openSp({ w: 1280, roster: R1S, ids: GIDS });
		await setView(sp.page, true);
		const keys = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-col-menu"]')).map((b) => b.getAttribute('data-no')));
		let seenEvents = 0;
		for (const no of keys) {
			await sp.page.click(T + '[data-usd-el="factor-col-menu"][data-no="' + no + '"]');
			await sp.page.waitForSelector('[data-usd-el="colmenu-ops"]');
			const items = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="colmenu-ops"] [data-usd-el]')).map((b) => b.getAttribute('data-usd-el')));
			assert(items.length >= 1 && items[items.length - 1] === 'colmenu-sort' && items.every((x) => x === 'colmenu-events' || x === 'colmenu-sort'), '②星取表(6) ' + no + '枚目のメニューは「イベント/スキル」「ソート」（①と同じ）', items);
			if (items.indexOf('colmenu-events') !== -1) {
				const before = await read(sp.page);
				await sp.page.click('[data-usd-el="colmenu-events"]');
				await sp.page.waitForSelector('[data-usd-el="events-panes"]');
				await sp.page.waitForTimeout(250);
				const choices = await sp.page.$$('[data-usd-el="event-choice"]');
				const st0 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="event-choice"]')).map((b) => b.className + '|' + b.getAttribute('aria-pressed')).join(','));
				// 見せるだけの選択肢は押せない（disabled）ことがあるので、要素の click() で押す（押せても何も変わらないことを見る）
				await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="event-choice"]')).slice(0, 3).forEach((b) => b.click()));
				await sp.page.waitForTimeout(300);
				const st1 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="event-choice"]')).map((b) => b.className + '|' + b.getAttribute('aria-pressed')).join(','));
				const after = await read(sp.page);
				assert(before.storage === after.storage && st0 === st1, '②星取表(6) ' + no + '枚目のイベントの小窓: 選択肢を押しても保存データ・選択の表示は変わらない（見せるだけ・選択肢 ' + choices.length + '）', null);
				await sp.page.keyboard.press('Escape');
				await sp.page.waitForTimeout(200);
				seenEvents++;
			} else {
				await sp.page.click(T + '[data-usd-el="factor-col-menu"][data-no="' + no + '"]');
				await sp.page.waitForTimeout(200);
				assert(!(await sp.page.isVisible('[data-usd-el="colmenu-ops"]')), '②星取表(6) ' + no + '枚目: もう一度押すとメニューが閉じる', null);
			}
		}
		assert(seenEvents >= 1, '②星取表(6) イベントの小窓を開けた列がある（検査が空振りしていない）', seenEvents);
		await sp.ctx.close();
	});

	await block('②星取表(7) 無効の段: 顔ぶれ＝カードで得られる − ②にある − ①の絞り込みに合わない − ②で選べない（検査の側で独立に割り出して一致）／見出しの件数／数えない（帯・見出しの合計・種数・②の id は保存の無いセットと同じ）', async () => {
		for (const c of [{ k: 'R1S', roster: R1S, ids: ONE12 }, { k: 'R2S（絞り込み）', roster: R2S, ids: ONE12 }, { k: 'RG（①空）', roster: RG, ids: GIDS }]) {
			const ex = await expectOff(c.roster, c.ids, c.roster.outsideOptions.cards.length);
			const sp = await openSp({ w: 1280, roster: c.roster, ids: c.ids });
			const want = await ex.judge(sp.page);
			const a = await read(sp.page);
			assert(want.length >= 3 && JSON.stringify(a.off) === JSON.stringify(want), '②星取表(7) ' + c.k + ' 無効の段の顔ぶれと並び（因子画面の順）が独立の導出と一致（' + want.length + '件）', { got: a.off, want });
			assert(a.offHead === '“オススメサポ”で除外されたスキル ' + want.length + '件', '②星取表(7) ' + c.k + ' 見出しの文言と件数', a.offHead);
			await sp.ctx.close();
			// 保存の無い同じセット（①・②は同じ）と、数が同じ
			const plain = Object.assign({}, c.roster);
			delete plain.outsideOptions;
			const sp2 = await openSp({ w: 1280, roster: plain, ids: c.ids });
			const b = await read(sp2.page);
			assert(b.off.length === 0 && stripNums(a) === stripNums(b), '②星取表(7) ' + c.k + ' 無効の段があっても無くても、②の帯・見出しの合計・種数・②の id は同じ', { a: stripNums(a).slice(0, 160), b: stripNums(b).slice(0, 160) });
			const stitch = await sp2.page.evaluate(() => JSON.stringify((deckTemplateManager.getSelection() || {}).skillIds));
			assert(stitch === JSON.stringify(c.ids), '②星取表(7) ' + c.k + ' 画像結合・③へ渡す②の id（getSelection）は②のスキルだけ', null);
			await sp2.ctx.close();
		}
	});

	await block('②星取表(8) 無効の行を押すと②に足して有効にする（合計が増え・無効の段から消える）／有効の行を外すと、カードで得られるものは無効の段に戻る／カード一覧・星取表の両方', async () => {
		for (const view of ['cards', 'table']) {
			const sp = await openSp({ w: 390, roster: R1S, ids: ONE12 });
			if (view === 'table') await setView(sp.page, true);
			const a = await read(sp.page);
			const id = a.off[0];
			await sp.page.click(T + '[data-usd-el="factor-enable"][data-off-skill-id="' + id + '"]');
			await sp.page.waitForTimeout(400);
			const b = await read(sp.page);
			assert(b.sel.indexOf(id) !== -1 && b.sel.length === a.sel.length + 1 && b.off.indexOf(id) === -1 && b.off.length === a.off.length - 1,
				'②星取表(8) ' + view + ': 無効の行を押すと②に入り、無効の段から消える', { id, sel: b.sel.length, off: b.off.length });
			assert(b.sum.factorPt > a.sum.factorPt && b.sum.total > a.sum.total && b.panels.some((p) => p.id === id), '②星取表(8) ' + view + ': 合計が増え、有効の行に出る', { a: a.sum.factorPt, b: b.sum.factorPt });
			assert((await viewBtn(sp.page)) === (view === 'table' ? 'true' : 'false'), '②星取表(8) ' + view + ': 表示は切り替わらない', null);
			// 外すと無効の段に戻る（「削除」で行を押す）
			await sp.page.click(T + '[data-usd-el="palette-delete"]');
			await sp.page.waitForTimeout(200);
			await sp.page.click(T + '[data-usd-el="selected-list"] .usd-panel[data-skill-id="' + id + '"] .usd-panel-namebtn');
			await sp.page.waitForTimeout(400);
			const c = await read(sp.page);
			assert(c.sel.indexOf(id) === -1 && JSON.stringify(c.off) === JSON.stringify(a.off) && c.sum.factorPt === a.sum.factorPt, '②星取表(8) ' + view + ': 外すと無効の段に戻る（顔ぶれ・合計は押す前と同じ）', { off: c.off.length });
			// カードで得られないスキルを外しても、無効の段には出ない
			await sp.page.click(T + '[data-usd-el="selected-list"] .usd-panel[data-skill-id="2"] .usd-panel-namebtn');
			await sp.page.waitForTimeout(400);
			const d = await read(sp.page);
			const rm2 = d.off.indexOf('2');
			assert(d.sel.indexOf('2') === -1 && (rm2 === -1) === (a.off.indexOf('2') === -1), '②星取表(8) ' + view + ': 外したスキルが無効の段に出るのは、カードで得られるときだけ', { off: d.off });
			assert(jsErrors(sp.errors).length === 0, '②星取表(8) ' + view + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('②星取表(9) 保存（オススメサポの「追加」）: 計算しただけでは書かない／「追加」で提案のカードを outsideOptions.cards に保存（小窓の並び）／読み込み直しても列が残る／チェックを外したスキルが無効の段に出る／①の中身を消しても残る／別の提案を追加すると置き換わる', async () => {
		const sp = await openSp({ w: 1280, roster: R1, ids: ['230'] });
		const openOutside = async () => {
			await sp.page.click(T + '[data-usd-el="outside-open"]');
			await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
			await sp.page.waitForTimeout(200);
		};
		const s0 = await read(sp.page);
		await openOutside();
		const s1 = await read(sp.page);
		assert(s0.storage === s1.storage && !(s1.roster && s1.roster.outsideOptions && s1.roster.outsideOptions.cards), '②星取表(9) 小窓を開いて計算しただけでは保存データは変わらない', s1.roster && s1.roster.outsideOptions);
		const shown = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"], [data-usd-el="outside-modal"] [data-usd-el="outside-pinned"]')).map((e) => e.getAttribute('data-card-id')));
		const checks = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-check"]')).map((e) => e.value));
		assert(shown.length >= 4 && checks.length >= 2, '②星取表(9) 提案のカードとチェックリストがある', { shown, checks: checks.length });
		const unchecked = checks[checks.length - 1];
		await sp.page.click('[data-usd-el="outside-modal"] [data-usd-el="outside-check"][value="' + unchecked + '"]');
		await sp.page.waitForTimeout(150);
		await sp.page.click('[data-usd-el="outside-modal"] [data-usd-el="outside-add"]');
		await sp.page.waitForTimeout(600);
		const s2 = await read(sp.page);
		assert(JSON.stringify(s2.roster.outsideOptions && s2.roster.outsideOptions.cards) === JSON.stringify(shown), '②星取表(9) 「追加」で提案のカードを小窓の並びのまま outsideOptions.cards に保存', { saved: s2.roster.outsideOptions, shown });
		assert(s2.sel.indexOf(unchecked) === -1 && s2.off.indexOf(unchecked) !== -1, '②星取表(9) チェックを外したスキルは②に入らず、無効の段に出る', { unchecked, off: s2.off });
		await sp.page.reload({ waitUntil: 'networkidle' });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(800);
		await setView(sp.page, true);
		const t = await readTable(sp.page);
		const s3 = await read(sp.page);
		assert(t.heads.length === 1 + shown.length && t.heads.slice(1).every((h) => h.menu), '②星取表(9) 読み込み直しても列は保存したカード（' + shown.length + '枚）', t.heads.length);
		assert(JSON.stringify(s3.off) === JSON.stringify(s2.off), '②星取表(9) 読み込み直しても無効の段は同じ', null);
		// ①の中身を消す（①のリセット「中身をすべて消す」）: 保存は残る
		await sp.page.click('#step-tab-0');
		await sp.page.waitForTimeout(500);
		await sp.page.click('#deck-roster-panel [data-usd-el="roster-reset"]');
		await sp.page.waitForSelector('[data-usd-el="roster-reset-all"]');
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(500);
		const s4 = await read(sp.page);
		assert(s4.roster && s4.roster.cardIds.every((x) => !x) && JSON.stringify(s4.roster.outsideOptions && s4.roster.outsideOptions.cards) === JSON.stringify(shown), '②星取表(9) ①の中身を消しても保存は残る', s4.roster && s4.roster.outsideOptions);
		// 別の提案（枚数4）を追加すると置き換わる
		await sp.page.click("#step-tab-1");
		await sp.page.waitForTimeout(500);
		await sp.page.reload({ waitUntil: 'networkidle' });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(800);
		await openOutside();
		await sp.page.click('[data-usd-el="outside-modal"] [data-usd-el="outside-count-btn"]');
		await sp.page.waitForSelector('[data-usd-el="outside-count-4"]');
		await sp.page.click('[data-usd-el="outside-count-4"]');
		await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
		await sp.page.waitForTimeout(300);
		const shown2 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"], [data-usd-el="outside-modal"] [data-usd-el="outside-pinned"]')).map((e) => e.getAttribute('data-card-id')));
		const addable = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-add"]'); return !!b && !b.disabled; });
		if (!addable) {
			const one = await sp.page.$('[data-usd-el="outside-modal"] [data-usd-el="outside-check"]');
			if (one) await one.click();
		}
		await sp.page.click('[data-usd-el="outside-modal"] [data-usd-el="outside-add"]');
		await sp.page.waitForTimeout(600);
		const s5 = await read(sp.page);
		assert(shown2.length === 4 && JSON.stringify(s5.roster.outsideOptions.cards) === JSON.stringify(shown2) && JSON.stringify(shown2) !== JSON.stringify(shown), '②星取表(9) 別の提案（4枚）を「追加」すると置き換わる', { before: shown, after: s5.roster.outsideOptions.cards });
		assert(jsErrors(sp.errors).length === 0, '②星取表(9) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('②星取表(10) 秋ウマ娘○（19）を得られるカードを選んだ編成で、②の 19 の行に、そのカードの列の印が付く', async () => {
		const sp = await openSp({ w: 1280, roster: R1S, ids: ['19', '1'] });
		const give = await sp.page.evaluate(() => {
			const r = UmaSkillDeckCore.computeRosterSkills({ cardIds: ['card-0257'] }, { autoChoose: true });
			const it = r.items.find((x) => x.skillId === '19');
			return it ? (it.sure ? '●' : '○') : null;
		});
		await setView(sp.page, true);
		const t = await readTable(sp.page);
		const row = t.rows.find((r) => r.id === '19' && !r.off);
		assert(give !== null && row && row.marks[0] === give && SAVED5[0] === 'card-0257', '②星取表(10) 1枚目（card-0257）が 19 を得られ、②の 19 の行の1列目に同じ印（' + give + '）', { give, row });
		await sp.ctx.close();
	});

	await block('②星取表(11) 幅: 375・360・320px で横スクロールが出ない（カード一覧・表の中も）／名前の列とカードの列が入る／コンソールのエラー0／「削除」で行を押すと②から外れる', async () => {
		for (const w of [375, 360, 320]) {
			const sp = await openSp({ w, roster: RG, ids: GIDS });
			const errors = [];
			sp.page.on('pageerror', (e) => errors.push(String(e)));
			sp.page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
			const a = await read(sp.page);
			assert(!a.overflowX && a.off.length > 0, '②星取表(11) ' + w + 'px カード一覧（無効の段あり）で横スクロールなし', { page: a.overflowX, off: a.off.length });
			await setView(sp.page, true);
			const b = await read(sp.page);
			const t = await readTable(sp.page);
			assert(!b.overflowX && t.wrap && t.wrap.sw <= t.wrap.cw + 1, '②星取表(11) ' + w + 'px 横スクロールなし（ページ・表の中）', { page: b.overflowX, wrap: t.wrap });
			const geo = await sp.page.evaluate(() => {
				const hs = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table"] [role="columnheader"]'));
				const ic = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table"] [data-usd-el="factor-col-menu"] .usd-card-icobox'));
				return { name: Math.round(hs[0].getBoundingClientRect().width), col: Math.round(hs[1].getBoundingClientRect().width), icon: ic.length ? Math.round(ic[0].getBoundingClientRect().width) : 0 };
			});
			assert(geo.name >= 100 && geo.col >= 24 && geo.icon > 0 && geo.icon <= geo.col, '②星取表(11) ' + w + 'px 名前の列 100px 以上・カードの列にアイコンが入る', geo);
			assert(jsErrors(errors).length === 0, '②星取表(11) ' + w + 'px コンソールのエラー0', jsErrors(errors));
			await sp.ctx.close();
		}
		const sp = await openSp({ w: 390, roster: RG, ids: GIDS });
		await setView(sp.page, true);
		await sp.page.click(T + '[data-usd-el="palette-delete"]');
		await sp.page.waitForTimeout(200);
		await sp.page.click(T + '[data-usd-el="factor-table"] .usd-panel[data-skill-id="12"] .usd-panel-namebtn');
		await sp.page.waitForTimeout(300);
		const after = await read(sp.page);
		assert(after.sel.indexOf('12') === -1 && after.sel.length === GIDS.length - 1 && after.table, '②星取表(11) 削除の状態で星取表の行を押すと②から外れる（星取表のまま）', after.sel);
		await sp.ctx.close();
	});

	await block('②星取表(12) ◎を○に変えるモード: 星取表でも全行の Pt を隠し、候補の行だけ◎／○（カード一覧と同じ）／押すと○に戻り、数と保存はカード一覧で押したときと同じ／星取表のまま', async () => {
		const results = [];
		for (const view of ['cards', 'table']) {
			const sp = await openSp({ w: 390, roster: R1S, ids: GIDS });
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
		assert(c.shown === 0 && t.shown === 0, '②星取表(12) モードでは、カード一覧・星取表とも Pt を表示している行が0', results.map((r) => r.shown));
		assert(c.toggles !== '' && c.toggles === t.toggles, '②星取表(12) 切り替えのある行（候補）と状態がカード一覧と同じ', { c: c.toggles, t: t.toggles });
		assert(JSON.stringify(c.after.keep) === JSON.stringify(t.after.keep) && c.after.pt === t.after.pt && t.after.toggle === 'false' && t.after.table === true,
			'②星取表(12) 星取表で押しても、keepCircleIds・②の Pt はカード一覧で押したときと同じ・星取表のまま・その行は○', { c: c.after, t: t.after });
	});
}
