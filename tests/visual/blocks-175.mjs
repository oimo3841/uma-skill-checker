// T180（2026-11-12・決定 727〜731・741）: UmaStar の2列の結合画像で、本育成編成・因子周回編成を星取表の下に積むと
// 左（人の列＋枠の見かた）の下端を超えるときだけ、編成2つを表の右（4列目）に縦に並べる（案B）。表は編成が無いとき（T98）と同じく左の下端まで使う。
// 塊の見出しは「T180」で始まる（`npm run test:visual -- --only=T180`）。run-smoke.mjs の末尾から register175() で呼ばれる。
//
//  (1) 短い親（test-images 2026-09-17_1。親・祖1・祖2 を同じケースで組む）の 30・60・100行: 縦に伸びない・編成は表の右（4列目）・
//      表の行は編成 OFF と同じ（下限より小さくならない）・画像の幅は4列目の分（間＋理論値SP の欄の幅）だけ広い・祖2人の幅がそろう
//  (2) 同じ短い親で 1〜160行を1行ずつ: どの行数でも伸びない。表の下に積んで入るときは今のまま（T130）、入らないときだけ4列目
//  (3) 背の高い親（2026-09-15_6）・編成 OFF・3列の形は前と同じ（T180 の前の commit 86aa356 の製品で測った固定値）
//  (4) 欠けた所: 理論値SP OFF なら4列目は上端から・因子周回編成だけでも4列目に置く
// test-images は追跡しない（.gitignore）。無ければ前提の assert で NG になる。

import fs from 'node:fs';
import path from 'node:path';
import { reloadReady } from './lib/page-ready.mjs';

export async function register175(env) {
	const { block, assert, browser, base, openPage, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
	const SHORT = '2026-09-17_1', TALL = '2026-09-15_6';
	const caseUrls = (d) => {
		const dir = path.join(REPO_ROOT, 'test-images', d);
		return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().map((f) => '/test-images/' + d + '/' + f) : [];
	};

	const HELPERS = `
		window.__P = {};
		window.__load = async (name, urls) => {
			const files = await Promise.all(urls.map(async (u) => { const b = await (await fetch(u)).blob(); return new File([b], u.split('/').pop(), { type: 'image/png' }); }));
			const c = await stitchOnePerson(files, name);
			if (!c) return null;
			__P[name] = { top: await stitchTwoColPerson(c, files, true), noTop: await stitchTwoColPerson(c, files, false), three: stitchSideCrop(c, stitchPersonIconBox(c)) };
			return [__P[name].top.width, __P[name].top.height];
		};
		window.__wide = (W, H, topH) => { const c = document.createElement('canvas'); c.width = W; c.height = H + (topH || 0); const g = c.getContext('2d');
			g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, c.height); c._twoCol = { band: null, topH: topH || 0, srcW: W }; return c; };
		window.__table = (n) => ({ people: [{ idx: 0, label: '親A', present: true }, { idx: 1, label: '祖A1', present: true }, { idx: 2, label: '祖A2', present: true }],
			rows: Array.from({ length: n }, (_, i) => ({ id: 'x' + i, name: 'スキル' + i, kind: null, vals: [i % 4, (i + 1) % 4, (i + 2) % 4], total: 3, unknown: false })),
			kinds: [n, n, n], totalKinds: n });
		window.__parts = async (o) => {
			const on = Object.assign({ marker: true, roster: true, factor: true, sp: true, table: true }, o.on || {});
			const cs = o.name ? (o.three ? [__P[o.name].three, __P[o.name].three, __P[o.name].three] : [__P[o.name].top, __P[o.name].noTop, __P[o.name].noTop])
				: [__wide(749, 1321, 594), __wide(749, 1321), __wide(749, 1321)];
			return { idxs: [0, 1, 2], canvases: cs, heads: [null, null, null], table: on.table ? __table(o.rows) : null,
				legend: on.marker ? buildFactorFrameLegendBar(STITCH_LAYOUT.legendMaxW, STITCH_LAYOUT.legendRef, true) : null,
				barText: 'T180', top: await stitchTopData(captureStitchSetPart(), on), genes: null, title: true };
		};
		window.__lay = async (o) => { const p = await __parts(o); const c = o.three ? composeFamilyImage(p) : composeFamilyImage2(p); const l = c._layout;
			return Object.assign({ cw: c.width, ch: c.height }, JSON.parse(JSON.stringify(l, (k, v) => (k === 'cards' || k === 'lines' || k === 'texts' || k === 'widths' || k === 'heads' || k === 'persons') ? undefined : v))); };
	`;
	const openSp = async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, EMPTY);
		await sp.page.evaluate(({ roster, ids }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', '2');
		}, { roster: R1S, ids: IDS });
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.addScriptTag({ content: HELPERS });
		sp.page.setDefaultTimeout(120000);
		return sp;
	};
	const L_KEYS = 'margin gap innerGap topAfter spW rowMin rowMinOver rowCap topHeadH topHeadGap cardH cardGap cardCols cardRows'.split(' ');
	const readL = (page) => page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, STITCH_LAYOUT[k]])), L_KEYS);
	const span = (l) => (l.grands.length ? l.grands[0].x + Math.max(...l.grands.map((g) => g.w)) : l.parent.x + l.parent.w) - l.parent.x;
	const noStretch = (l, L) => l.col3.bottom <= l.leftBottom && (!l.col4 || l.col4.bottom <= l.leftBottom) && l.ch === l.leftBottom + L.margin;
	const loadCases = async (page, names) => {
		const out = {};
		for (const n of names) out[n] = await page.evaluate(({ n, u }) => __load(n, u), { n, u: caseUrls(n) });
		return out;
	};

	/* ── (1) 短い親の 30・60・100行 ── */
	await block('T180(1) 2列・短い親（2026-09-17_1）の 30・60・100行: 縦に伸びない・編成2つは表の右（4列目）に縦に並ぶ・表は編成 OFF と同じ行の高さ・祖2人の幅がそろう', async () => {
		const { ctx, page, errors } = await openSp();
		const cases = await loadCases(page, [SHORT]);
		assert(cases[SHORT] && cases[SHORT][1] === 1915, 'T180(1) 前提: test-images の ' + SHORT + ' から親の列（上の欄つき）1915px が組める', cases);
		const L = await readL(page);
		for (const n of [30, 60, 100]) {
			const r = await page.evaluate(async (n) => ({ on: await __lay({ name: '2026-09-17_1', rows: n }), off: await __lay({ name: '2026-09-17_1', rows: n, on: { roster: false, factor: false } }) }), n);
			const a = r.on, floor = n > L.rowCap ? L.rowMinOver : L.rowMin;
			const cardsH = L.topHeadH + L.topHeadGap + L.cardCols * L.cardRows * L.cardH + (L.cardCols * L.cardRows - 1) * L.cardGap;
			assert(noStretch(a, L), `T180(1) ${n}行: 3列目・4列目とも左の下端を超えない（画像は伸びない）`, { c3: a.col3.bottom, c4: a.col4 && a.col4.bottom, lb: a.leftBottom, ch: a.ch });
			assert(a.side === true && a.col4 && a.col4.x === a.col3.x + a.col3.w + L.gap && a.col4.w === L.spW && a.roster.x === a.col4.x && a.factor.x === a.col4.x && a.roster.w === L.spW && a.factor.w === L.spW,
				`T180(1) ${n}行: 本育成編成・因子周回編成は表の右（4列目。幅は理論値SP の欄と同じ）`, { col3: a.col3, col4: a.col4, roster: a.roster, factor: a.factor });
			assert(a.roster.y === a.table.y && a.factor.y === a.roster.y + a.roster.h + L.topAfter && a.roster.h === cardsH && a.col4.bottom === a.factor.y + cardsH,
				`T180(1) ${n}行: 4列目は表の上端から 本育成編成 → 因子周回編成（間は topAfter）`, { table: a.table, roster: a.roster, factor: a.factor, col4: a.col4 });
			assert(a.table.rowH === r.off.table.rowH && a.table.rowH >= floor && a.table.y + a.table.h <= a.leftBottom && a.col3.bottom === Math.max(a.sp.y + a.sp.h, a.table.y + a.table.h),
				`T180(1) ${n}行: 表は編成 OFF と同じ行の高さ（左の下端まで使う・3列の下限より小さくならない）・3列目は理論値SP と表だけ`, { rowH: a.table.rowH, off: r.off.table.rowH, floor, col3: a.col3 });
			assert(a.cw === L.margin + span(a) + L.gap + a.col3.w + L.gap + L.spW + L.margin && r.off.cw === L.margin + span(r.off) + L.gap + r.off.col3.w + L.margin && !r.off.side && !r.off.col4,
				`T180(1) ${n}行: 画像の幅は4列目の分（間＋${L.spW}px）だけ広い・編成 OFF は4列目なし`, { cw: a.cw, col3w: a.col3.w, off: r.off.cw });
			assert(a.grands.length === 2 && a.grands[0].w === a.grands[1].w && a.grands[0].h + a.grands[1].h === a.colH, `T180(1) ${n}行: 同じ端末の画像で組むと祖1 と祖2 の幅がそろう`, a.grands);
		}
		assert(jsErrors(errors).length === 0, 'T180(1): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (2) 1〜160行を1行ずつ ── */
	await block('T180(2) 2列・短い親で 1〜160行を1行ずつ: どの行数でも伸びない・表の下に積んで入るときは今のまま（T130）・入らないときだけ4列目', async () => {
		const { ctx, page, errors } = await openSp();
		const cases = await loadCases(page, [SHORT]);
		assert(cases[SHORT], 'T180(2) 前提: test-images の ' + SHORT, cases);
		const L = await readL(page);
		const rs = await page.evaluate(async () => {
			const out = [];
			for (let n = 1; n <= 160; n++) {
				const a = await __lay({ name: '2026-09-17_1', rows: n });
				const o = await __lay({ name: '2026-09-17_1', rows: n, on: { roster: false, factor: false } });
				out.push({ n, side: a.side, ch: a.ch, cw: a.cw, lb: a.leftBottom, c3: a.col3.bottom, c4: a.col4 ? a.col4.bottom : null, col3x: a.col3.x, rx: a.roster.x, ry: a.roster.y, fy: a.factor.y, rh: a.roster.h,
					t: { y: a.table.y, h: a.table.h, rowH: a.table.rowH }, offRowH: o.table.rowH });
			}
			return out;
		});
		const cardsTotal = 2 * (L.topHeadH + L.topHeadGap + L.cardCols * L.cardRows * L.cardH + (L.cardCols * L.cardRows - 1) * L.cardGap) + 2 * L.topAfter;
		const bad = rs.filter((r) => r.c3 > r.lb || (r.c4 !== null && r.c4 > r.lb) || r.ch !== r.lb + L.margin);
		assert(rs.length === 160 && bad.length === 0, 'T180(2): 1〜160行のどれでも、3列目・4列目は左の下端を超えない（画像は伸びない）', bad.slice(0, 5));
		// 積むとき: 表の下に編成（T130 のまま。表は3列の下限より小さくしない）。4列目: 下限の行で積むと左の下端を超えるときだけ。表は編成 OFF と同じ
		const floor = (n) => n > L.rowCap ? L.rowMinOver : L.rowMin;
		const badStack = rs.filter((r) => !r.side && !(r.c4 === null && r.rx === r.col3x && r.ry === r.t.y + r.t.h + L.topAfter && r.fy === r.ry + r.rh + L.topAfter && (r.t.rowH >= floor(r.n) || r.t.rowH === r.offRowH)));
		const badSide = rs.filter((r) => r.side && !(r.t.rowH === r.offRowH && r.ry === r.t.y && r.t.y + (r.n + 2) * Math.min(floor(r.n), r.offRowH) + cardsTotal > r.lb));
		assert(badStack.length === 0, 'T180(2): 4列目を使わない行数では、編成は表の下（T130 のまま）', badStack.slice(0, 5));
		assert(badSide.length === 0, 'T180(2): 4列目は、表を下限の行で積んでも左の下端を超えるときだけ。そのとき表は編成 OFF と同じ', badSide.slice(0, 5));
		const sideNs = rs.filter((r) => r.side).map((r) => r.n);
		// 前（86aa356）は 26〜40行・44行〜で伸びた。そこが4列目になり、20行以下と 41〜43行は今のまま
		assert(!rs.slice(0, 20).some((r) => r.side) && [26, 30, 40, 44, 60, 100, 160].every((n) => sideNs.includes(n)) && ![41, 42, 43].some((n) => sideNs.includes(n)),
			'T180(2): 20行以下と 41〜43行は今のまま（表の下に積む）・26〜40行と 44行〜は4列目', sideNs.join(','));
		assert(jsErrors(errors).length === 0, 'T180(2): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (3) 前と同じもの ── */
	await block('T180(3) 背の高い親（2026-09-15_6）・編成 OFF・3列の形は前と同じ（T180 の前の製品で測った寸法）', async () => {
		const { ctx, page, errors } = await openSp();
		const cases = await loadCases(page, [SHORT, TALL]);
		assert(cases[SHORT] && cases[TALL], 'T180(3) 前提: test-images の ' + SHORT + '・' + TALL, cases);
		const r = await page.evaluate(async () => {
			const pick = (a) => ({ cw: a.cw, ch: a.ch, rowH: a.table.rowH, side: !!a.side, col4: !!a.col4, ry: a.roster ? a.roster.y - (a.table.y + a.table.h) : null });
			const out = { tall: {}, off: {}, three: {} };
			for (const n of [30, 60, 100, 150]) out.tall[n] = pick(await __lay({ name: '2026-09-15_6', rows: n }));
			for (const n of [30, 60, 100]) out.off[n] = pick(await __lay({ name: '2026-09-17_1', rows: n, on: { roster: false, factor: false } }));
			for (const n of [30, 60, 100]) { const a = await __lay({ name: '2026-09-17_1', rows: n, three: true }); out.three[n] = { cw: a.cw, ch: a.ch, rowH: a.table.rowH, cols: a.cols }; }
			return out;
		});
		const L = await readL(page);
		// 前の製品（86aa356）で測った値（output/scratch/t180/measure-before.json）
		const TALL_BEFORE = { 30: [2526, 3860, 40], 60: [2526, 3860, 39], 100: [2486, 3860, 24], 150: [2486, 3860, 16] };
		const OFF_BEFORE = { 30: [1828, 2117, 40], 60: [1788, 2117, 27], 100: [1788, 2117, 16] };
		const THREE_BEFORE = { 30: [2206, 1765, 40], 60: [2206, 1851, 23], 100: [2206, 2036, 16] };
		const same = (a, b) => a.cw === b[0] && a.ch === b[1] && a.rowH === b[2];
		assert(Object.entries(TALL_BEFORE).every(([n, b]) => same(r.tall[n], b) && !r.tall[n].side && !r.tall[n].col4 && r.tall[n].ry === L.topAfter),
			'T180(3): 背の高い親は 30〜150行で前と同じ寸法（編成は表の下・4列目なし）', r.tall);
		assert(Object.entries(OFF_BEFORE).every(([n, b]) => same(r.off[n], b) && !r.off[n].side && !r.off[n].col4), 'T180(3): 編成 OFF は前と同じ寸法', r.off);
		assert(Object.entries(THREE_BEFORE).every(([n, b]) => same(r.three[n], b) && r.three[n].cols !== 2), 'T180(3): 3列の形は前と同じ寸法', r.three);
		assert(jsErrors(errors).length === 0, 'T180(3): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (4) 欠けた所 ── */
	await block('T180(4) 4列目の欠けた所: 理論値SP OFF なら4列目は上端から・因子周回編成だけでも4列目に置く（作り物の短い親）', async () => {
		const { ctx, page, errors } = await openSp();
		const L = await readL(page);
		const r = await page.evaluate(async () => ({
			noSp: await __lay({ rows: 60, on: { sp: false } }),
			factorOnly: await __lay({ rows: 100, on: { sp: false, roster: false } }),
			few: await __lay({ rows: 10, on: { sp: false } }),
		}));
		const a = r.noSp;
		assert(a.side && !a.sp && a.table.y === a.bodyY && a.roster.y === a.bodyY && a.roster.x === a.col4.x && a.col3.w === a.table.w && noStretch(a, L),
			'T180(4): 理論値SP OFF: 表は3列目の上端から・編成は4列目の上端から（3列目の幅は表の幅）', { col3: a.col3, col4: a.col4, table: a.table, roster: a.roster });
		const f = r.factorOnly;
		assert(f.side && !f.roster && f.factor && f.factor.y === f.bodyY && f.factor.x === f.col4.x && f.col4.bottom === f.factor.y + f.factor.h && noStretch(f, L),
			'T180(4): 因子周回編成だけでも、入らなければ4列目の上端に置く', { col4: f.col4, factor: f.factor });
		assert(!r.few.side && !r.few.col4 && r.few.roster.y === r.few.table.y + r.few.table.h + L.topAfter, 'T180(4): 行が少なければ今のまま（表の下に積む）', r.few);
		assert(jsErrors(errors).length === 0, 'T180(4): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});
}
