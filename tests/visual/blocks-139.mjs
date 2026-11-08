// T130（2026-11-08 おいもさんの要望）: UmaStar の2列の結合画像で、上段にあった本育成編成・因子周回編成を3列目（星取表の下）へ移した検査。
// run-smoke.mjs の末尾から register139() で呼ばれる（塊の見出しはすべて「T130」で始まる。`npm run test:visual -- --only=T130` で回せる）。
//
//  (1) 3列目は上から 理論値SP → 星取表 → ①本育成編成 → ②因子周回編成。編成は1列に6枚（見出しは今の文のまま・3列目の幅いっぱい）。
//      OFF の欄は詰める。上段は無い（1列目・2列目は上端から）。新しいモード（理論値SP・本育成編成を出さない）の形も同じ規則で詰まる。
//  (2) 星取表の行が多いとき: 編成を置くために表の行を縮めるのは3列の表の下限（rowMin。rowCap 行を超えれば rowMinOver）まで。
//      それでも入らなければ3列目が左より長くなり、画像がその分だけ縦に伸びる。編成が OFF なら T98 のまま（下限なしで左の下端に収める）。
//  (3) 3列の形は変えていない（上段に 理論値SP｜本育成編成（3列×2行）｜因子周回編成（3列×2行））。
//  (4) 「結合画像の設定」の模式図（2列）: 3列目に 理論値SP → 星取表 → 本育成編成 → 因子周回編成（1列に6つ）。編成だけ ON でも3列目が出る。
// 期待値は製品の値を読まずに書く（並びの規則と枚数）。寸法は製品の STITCH_LAYOUT を読む（並びの検査であって寸法の検査ではない）。スキル名は書かない（恒久ルール1）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register139(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1));

	const HELPERS = `
		window.__wide = (W, H, topH) => { const c = document.createElement('canvas'); c.width = W; c.height = H + (topH || 0); const g = c.getContext('2d');
			g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, c.height); c._twoCol = { band: null, topH: topH || 0, srcW: W }; return c; };
		window.__table = (n) => ({ people: [{ idx: 0, label: '親A', present: true }, { idx: 1, label: '祖A1', present: true }, { idx: 2, label: '祖A2', present: true }],
			rows: Array.from({ length: n }, (_, i) => ({ id: 'x' + i, name: 'スキル' + i, kind: null, vals: [i % 4, (i + 1) % 4, (i + 2) % 4], total: 3, unknown: false })),
			kinds: [n, n, n], totalKinds: n });
		window.__parts = async (o) => {
			const on = Object.assign({ marker: false, roster: false, factor: false, sp: false, table: false }, o.on || {});
			return { idxs: [0, 1, 2], canvases: [__wide(1150, o.ph || 2600, 1000), __wide(1150, 2200), __wide(1150, 1900)], heads: [null, null, null],
				table: on.table ? __table(o.rows || 20) : null, legend: on.marker ? buildFactorFrameLegendBar(STITCH_LAYOUT.legendMaxW, STITCH_LAYOUT.legendRef, true) : null,
				barText: 'T130', top: await stitchTopData(captureStitchSetPart(), on), genes: null, title: true };
		};
		window.__lay = async (o) => { const c = composeFamilyImage2(await __parts(o)); const l = c._layout;
			const cards = (b) => b ? b.cards.map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h })) : null;
			return Object.assign({ cw: c.width, ch: c.height, rosterCards: cards(l.roster), factorCards: cards(l.factor) },
				JSON.parse(JSON.stringify(l, (k, v) => (k === 'cards' || k === 'lines' || k === 'texts' || k === 'widths') ? undefined : v))); };
	`;
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ roster, ids, parts }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			if (parts) localStorage.setItem('uma-special-stitch-parts', JSON.stringify(parts));
		}, { roster: R1S, ids: IDS, parts: o.parts || null });
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.addScriptTag({ content: HELPERS });
		await sp.page.waitForTimeout(150);
		return sp;
	};

	/* ── (1) 3列目の並び ── */
	await block('T130(1) 2列の3列目: 理論値SP → 星取表 → 本育成編成 → 因子周回編成・編成は1列に6枚（見出しは今の文・3列目の幅いっぱい）・OFF の欄は詰める・上段は無い', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate(async () => {
			const L = STITCH_LAYOUT;
			const all = { marker: true, roster: true, factor: true, sp: true, table: true };
			return { L: { topAfter: L.topAfter, cardH: L.cardH, cardGap: L.cardGap, topHeadH: L.topHeadH, topHeadGap: L.topHeadGap, n: L.cardCols * L.cardRows, spW: L.spW, margin: L.margin },
				heads: [STITCH_TOP_HEAD_ROSTER, STITCH_TOP_HEAD_FACTOR],
				all: await __lay({ on: all }), noSp: await __lay({ on: { roster: true, factor: true, table: true } }), noTable: await __lay({ on: { sp: true, roster: true, factor: true } }),
				newMode: await __lay({ on: { marker: true, factor: true, table: true } }), factorOnly: await __lay({ on: { factor: true } }) };
		});
		const { L, all } = r;
		assert(!all.top && all.personsY === all.bodyY, 'T130(1): 上段は無く、1列目・2列目は上端から', { top: all.top, personsY: all.personsY, bodyY: all.bodyY });
		assert(all.sp.y === all.bodyY && all.table.y === all.sp.y + all.sp.h + L.topAfter && all.roster.y === all.table.y + all.table.h + L.topAfter && all.factor.y === all.roster.y + all.roster.h + L.topAfter,
			'T130(1): 3列目は上から 理論値SP → 星取表 → 本育成編成 → 因子周回編成（間は上段と中段の間と同じ）', { sp: all.sp, table: all.table, roster: all.roster, factor: all.factor });
		// 本育成編成は6枚・因子周回編成は5枚（R1S）。どちらも1列に上から詰める
		const col = (cards, box, n) => cards.length === n && cards.every((c, i) => c.x === box.x && c.w === box.w && c.y === box.y + L.topHeadH + L.topHeadGap + i * (L.cardH + L.cardGap));
		assert(col(all.rosterCards, all.roster, L.n) && col(all.factorCards, all.factor, 5) && all.roster.w === all.col3.w && all.factor.w === all.col3.w,
			'T130(1): 編成はそれぞれ見出しの下に1列で上から詰める（6枚・5枚。3列目の幅いっぱい・すきまは今のカードと同じ）', { roster: all.rosterCards, factor: all.factorCards, col3: all.col3 });
		assert(all.roster.h === L.topHeadH + L.topHeadGap + L.n * L.cardH + (L.n - 1) * L.cardGap && all.factor.h === all.roster.h, 'T130(1): 編成の欄の高さは見出し＋6枚分（枚数で変えない）', { roster: all.roster, factor: all.factor });
		assert(r.heads[0] === '①本育成編成' && r.heads[1] === '②因子周回編成', 'T130(1): 見出しは今の文のまま', r.heads);
		assert(!r.noSp.sp && r.noSp.table.y === r.noSp.bodyY && r.noSp.roster.y === r.noSp.table.y + r.noSp.table.h + L.topAfter, 'T130(1): 理論値SP OFF: 星取表が3列目の上端から・編成はその下', r.noSp);
		assert(!r.noTable.table && r.noTable.roster.y === r.noTable.sp.y + r.noTable.sp.h + L.topAfter && r.noTable.col3.w === L.spW, 'T130(1): 星取表 OFF: 編成は理論値SP のすぐ下（幅は理論値SP の欄と同じ）', r.noTable);
		assert(!r.newMode.sp && !r.newMode.roster && r.newMode.factor && r.newMode.factor.y === r.newMode.table.y + r.newMode.table.h + L.topAfter,
			'T130(1): 新しいモードの形（理論値SP・本育成編成なし）: 星取表の下に因子周回編成だけ', r.newMode);
		assert(r.factorOnly.col3 && r.factorOnly.factor.y === r.factorOnly.bodyY && r.factorOnly.col3.w === L.spW && r.factorOnly.ch === r.factorOnly.leftBottom + L.margin,
			'T130(1): 因子周回編成だけ: 3列目の上端に詰める', r.factorOnly);
		assert(jsErrors(errors).length === 0, 'T130(1): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (2) 星取表の行が多いとき ── */
	await block('T130(2) 2列: 星取表の行が多いと編成の分だけ表の行を縮める（3列の表の下限まで）・それでも入らなければ画像が縦に伸びる・編成 OFF は今のまま', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate(async () => {
			const L = STITCH_LAYOUT;
			const all = { marker: true, roster: true, factor: true, sp: true, table: true };
			const noCards = { marker: true, sp: true, table: true };
			return { L: { rowMax: L.rowMax, rowMin: L.rowMin, rowMinOver: L.rowMinOver, rowCap: L.rowCap, margin: L.margin },
				mid: await __lay({ on: all, rows: 70 }), midNo: await __lay({ on: noCards, rows: 70 }),
				many: await __lay({ on: all, rows: 150 }), manyNo: await __lay({ on: noCards, rows: 150 }),
				huge: await __lay({ on: all, rows: 250 }), hugeNo: await __lay({ on: noCards, rows: 250 }) };
		});
		const { L } = r;
		// 合成の人の列（親 2600＋上の欄 1000）では、左の下端まで 3,400px 前後。編成2つで 988px 使う
		assert(r.midNo.table.rowH === L.rowMax && r.mid.table.rowH < L.rowMax && r.mid.table.rowH > L.rowMinOver && r.mid.col3.bottom <= r.mid.leftBottom && r.mid.ch === r.mid.leftBottom + L.margin,
			'T130(2): 70行: 編成の分だけ表の行を縮めて、画像を伸ばさずに収める（下限より上）', { rowH: r.mid.table.rowH, noCards: r.midNo.table.rowH, c3: r.mid.col3.bottom, lb: r.mid.leftBottom });
		assert(r.manyNo.table.rowH > L.rowMinOver && r.many.table.rowH === L.rowMinOver && r.many.col3.bottom > r.many.leftBottom && r.many.ch === r.many.col3.bottom + L.margin,
			'T130(2): 150行: 表は下限（rowCap 行を超えるときの rowMinOver）で止め、3列目が左より長くなった分だけ画像が伸びる', { rowH: r.many.table.rowH, noCards: r.manyNo.table.rowH, c3: r.many.col3.bottom, lb: r.many.leftBottom, ch: r.many.ch });
		assert(r.hugeNo.table.rowH < L.rowMinOver && r.hugeNo.table.y + r.hugeNo.table.h <= r.hugeNo.leftBottom && r.hugeNo.ch === r.hugeNo.leftBottom + L.margin && r.huge.table.rowH === r.hugeNo.table.rowH && r.huge.col3.bottom > r.huge.leftBottom,
			'T130(2): 250行: 編成 OFF は T98 のまま（下限なしで左の下端に収める）・編成 ON でも表は同じ大きさ（編成のためにそれ以上は縮めない）', { rowH: r.huge.table.rowH, noCards: r.hugeNo.table.rowH, lb: r.hugeNo.leftBottom });
		assert(jsErrors(errors).length === 0, 'T130(2): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (3) 3列は変わらない ── */
	await block('T130(3) 3列の結合画像は変えていない: 上段に 理論値SP｜本育成編成（3列×2行）｜因子周回編成（3列×2行）', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate(async () => {
			const p = await __parts({ on: { marker: true, roster: true, factor: true, sp: true, table: true } });
			const c = composeFamilyImage(p);
			const t = c._layout.top;
			const shape = (b) => ({ xs: new Set(b.cards.map((k) => k.x)).size, ys: new Set(b.cards.map((k) => k.y)).size, n: b.cards.length });
			return { cols: c._layout.cols, top: !!t, sp: !!(t && t.sp), roster: t && t.roster && shape(t.roster), factor: t && t.factor && shape(t.factor), y: t && t.roster && t.roster.y === t.y && t.factor.y === t.y };
		});
		assert(r.cols !== 2 && r.top && r.sp && r.y && r.roster.xs === 3 && r.roster.ys === 2 && r.factor.xs === 3 && r.factor.ys === 2, 'T130(3): 3列は上段に 理論値SP｜本育成編成｜因子周回編成（カードは3列×2行）のまま', r);
		assert(jsErrors(errors).length === 0, 'T130(3): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (4) 模式図 ── */
	await block('T130(4) 結合画像の設定の模式図（2列）: 3列目に 理論値SP → 星取表 → 本育成編成 → 因子周回編成（1列に6つ）・左に上段は無い・編成だけ ON でも3列目が出る', async () => {
		const ALL = { marker: true, roster: true, factor: true, sp: true, table: true, title: true, cols: 2 };
		const { ctx, page, errors } = await openSp({ parts: ALL });
		const read = () => page.evaluate(() => {
			const sh = document.querySelector('#stitch-parts-panel [data-stitch-wire-cols="2"]');
			const r = (s) => { const e = sh.querySelector(s); if (!e || !e.getClientRects().length) return null; const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, bottom: q.bottom, right: q.right }; };
			const col3 = sh.querySelector('[data-stitch-wire-col3]');
			const cardRects = (k) => [...sh.querySelectorAll('[data-stitch-part="' + k + '"] i')].map((e) => { const q = e.getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y) }; });
			return { col3: col3 && !col3.hidden ? r('[data-stitch-wire-col3]') : null, sp: r('[data-stitch-part="sp"]'), table: r('[data-stitch-part="table"]'), roster: r('[data-stitch-part="roster"]'), factor: r('[data-stitch-part="factor"]'),
				people: r('[data-stitch-part="people"]'), rosterIn3: !!(col3 && col3.querySelector('[data-stitch-part="roster"]')), factorIn3: !!(col3 && col3.querySelector('[data-stitch-part="factor"]')),
				leftCards: !!sh.querySelector('.stitch-wire-2l [data-stitch-part="roster"], .stitch-wire-2l [data-stitch-part="factor"]'), rc: cardRects('roster'), fc: cardRects('factor') };
		});
		const a = await read();
		const oneCol = (cs) => cs.length === 6 && new Set(cs.map((c) => c.x)).size === 1 && cs.every((c, i) => i === 0 || c.y > cs[i - 1].y);
		assert(a.rosterIn3 && a.factorIn3 && !a.leftCards && a.sp.y === a.people.y, 'T130(4): 編成は3列目にあり、左（人の列）の上に上段は無い・3列目と人の上端がそろう', a);
		assert(a.sp.bottom <= a.table.y && a.table.bottom <= a.roster.y && a.roster.bottom <= a.factor.y && a.factor.bottom <= a.people.bottom + 1, 'T130(4): 3列目は 理論値SP → 星取表 → 本育成編成 → 因子周回編成（人の列の下端より上）', a);
		assert(oneCol(a.rc) && oneCol(a.fc), 'T130(4): 編成は1列に6つ', { rc: a.rc, fc: a.fc });
		await page.evaluate(() => { Object.assign(stitchParts, { sp: false, table: false }); syncStitchPartsUi(); });
		const b = await read();
		assert(b.col3 && !b.sp && !b.table && b.roster && b.factor && b.roster.y === b.people.y, 'T130(4): 理論値SP・星取表 OFF でも編成が ON なら3列目が出て、編成が上端から', b);
		await page.evaluate(() => { Object.assign(stitchParts, { roster: false, factor: false }); syncStitchPartsUi(); });
		const c = await read();
		assert(!c.col3, 'T130(4): 4つとも OFF なら3列目は無い', c);
		assert(jsErrors(errors).length === 0, 'T130(4): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});
}
