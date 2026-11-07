// UmaStar の結合画像の2列と動画モード（T98・2026-11-04 おいもさんの決定 150〜163・174〜185・C-285）の検査。
// run-smoke.mjs の末尾から register108() で呼ばれる（塊の見出しはすべて「T98」で始まる。`npm run test:visual -- --only=T98` で回せる）。
//
// 決め:
//  - 「結合画像の設定」の先頭に形の2択「3列｜2列」（2つ並べたボタン・選んだほうを反転の塗り）、チェックの6つ目に「タイトルのバー」（初期値 ON）。
//    ③・引き出し・右下のボタン群の3か所が同じ1つの設定（保存キー uma-special-stitch-parts に cols・title を足した）。旧UI はいつも3列・バーあり。
//  - 2列の配置: タイトルのバーは全幅。1列目＝親A（親の上の欄＋因子）・2列目＝祖A1 の下に祖A2（間を空けずにつなぎ、2人の合計の高さを1列目にそろえて縮める）。人の見出しの行は3人とも描かない（決定 209 ほか）。
//    上段（本育成編成・因子周回編成）は1列目・2列目の上だけ。3列目は上段の上端から 理論値SP → 星取表。枠の見かたは1列目・2列目の下。
//    星取表の下端は枠の見かたの行の下端（無ければ親の列の下端）まで。入らなければ行を縮める（画像の下にはみ出さない）。欠けた所は詰める。
//  - 3列はタイトルのバー ON なら T96 と同じ画（設定 title が無い・true で同じ画素）。OFF でバーとその下の間を詰める。
//  - 動画モード: 入口のボタンで切り替え（読み上げ名「動画モードにする（αテスト）」⇔「スクショのモードに戻す」）・人ごとの「追加」の代わりに
//    セットに1つの「動画を選ぶ」（押すと今の小窓）・下は「OCR処理を開始する」だけ・切り替えても画像はそのまま・次に開いたときも動画モード。
//    動画モードの「OCR処理を開始する」は OCR のあと枠つきの結合画像を作り直して③にも出す。③の結合画像は設定を変えてもその場では描き直さず「画像を更新」で。
// スキル名は検査の側に書かない（恒久ルール1）。
import { reloadReady } from './lib/page-ready.mjs';
import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';
import { pickVideo } from './lib/video-entry.mjs';
import { SYNTH } from './blocks-80.mjs';

export async function register108(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1)).concat(['32', '45']);

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ roster, scope, pre }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			Object.keys(pre || {}).forEach((k) => { if (pre[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, pre[k]); });
		}, { roster: o.roster || null, scope: o.ids ? { skillIds: o.ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 } : null, pre: o.pre || null });
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await sp.page.waitForTimeout(400);
		if (o.ids && o.ids.length) {
			await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
			await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		}
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.addScriptTag({ content: HELPERS });
		await sp.page.waitForTimeout(150);
		return sp;
	};
	// ページの中の道具: 合成の1人分（両側を削らない2列の形。上に灰色の欄、下にパネルの行）・表の材料・組み立て
	const HELPERS = `
		window.__wide = (W, H, topH) => { const c = document.createElement('canvas'); c.width = W; c.height = H + (topH || 0); const g = c.getContext('2d');
			g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, c.height);
			if (topH) { g.fillStyle = '#88cc33'; g.fillRect(0, 0, W, 40); g.fillStyle = 'rgb(210,220,235)'; g.fillRect(0, 40, W, topH - 40); }
			for (let y = (topH || 0) + 10; y < c.height - 60; y += 80) [[0.19, 0.58], [0.6, 0.98]].forEach(([a, b]) => { g.fillStyle = 'rgb(226,226,226)'; g.fillRect(W * a, y, W * (b - a), 60); });
			c._twoCol = { band: null, topH: topH || 0, srcW: W }; return c; };
		window.__table = (n) => ({ people: [{ idx: 0, label: '親A', present: true }, { idx: 1, label: '祖A1', present: true }, { idx: 2, label: '祖A2', present: true }],
			rows: Array.from({ length: n }, (_, i) => ({ id: 'x' + i, name: 'スキル' + i, kind: null, vals: [i % 4, (i + 1) % 4, (i + 2) % 4], total: 3, unknown: false })),
			kinds: [n, n, n], totalKinds: n });
		window.__parts2 = async (o) => {
			const parts = Object.assign({ marker: false, roster: false, factor: false, sp: false, table: false }, o.on || {});
			const top = await stitchTopData(captureStitchSetPart(), parts);
			return { idxs: [0, 1, 2], canvases: [__wide(1150, o.ph || 2600, o.topH === undefined ? 1000 : o.topH), __wide(1150, o.g1 || 2200), __wide(1150, o.g2 || 1900)],
				heads: [null, null, null], table: parts.table ? __table(o.rows || 20) : null,
				legend: parts.marker ? buildFactorFrameLegendBar(STITCH_LAYOUT.legendMaxW, STITCH_LAYOUT.legendRef, true) : null,
				barText: 'T98', top: top, genes: null, title: o.title !== false };
		};
	`;
	const settingsOf = (page) => page.evaluate(() => {
		const panel = (sel) => { const p = document.querySelector(sel); return p ? { cols: [...p.querySelectorAll('[data-stitch-cols]')].map((b) => b.getAttribute('aria-pressed')), checks: [...p.querySelectorAll('input[data-stitch-part-key]')].map((i) => i.checked) } : null; };
		return { main: panel('#stitch-parts-panel'), drawer: panel('#stitch-parts-panel-drawer'), fab: panel('#stitch-parts-panel-fab'),
			saved: JSON.parse(localStorage.getItem('uma-special-stitch-parts') || 'null'), now: stitchPartsNow() };
	});

	/* ── (1) 設定: 形の2択とタイトルのバー（③・引き出し・右下の3か所が同じ） ── */
	await block('T98(1) 結合画像の設定: 先頭に「3列｜2列」（初期値 3列）・6つ目に「タイトルのバー」（初期値 ON）・③・引き出し・右下で同じ設定・保存して再読み込みのあとも残る・旧UI は3列', async () => {
		const { ctx, page, errors } = await openSp();
		const f = await page.evaluate(() => {
			const p = document.getElementById('stitch-parts-panel');
			const seg = p.querySelector('.stitch-cols');
			const btns = [...seg.querySelectorAll('[data-stitch-cols]')];
			const listTop = p.querySelector('.stitch-show-list').getBoundingClientRect().top;
			const cs = (b) => { const c = getComputedStyle(b); return { bg: c.backgroundColor, color: c.color }; };
			return { labels: btns.map((b) => b.textContent.trim()), pressed: btns.map((b) => b.getAttribute('aria-pressed')), segAboveList: seg.getBoundingClientRect().bottom <= listTop,
				firstInBody: seg.previousElementSibling && seg.previousElementSibling.classList.contains('stitch-show-title'), cs: btns.map(cs),
				inverse: getComputedStyle(document.documentElement).getPropertyValue('--uma-surface-inverse').trim(),
				last: [...p.querySelectorAll('.stitch-show-item')].map((l) => l.textContent.trim()).pop(), fabItem: !document.getElementById('fab-item-settings').hidden };
		});
		const s0 = await settingsOf(page);
		assert(JSON.stringify(f.labels) === '["3列","2列"]' && JSON.stringify(f.pressed) === '["true","false"]' && f.segAboveList && f.firstInBody, 'T98(1): 見出しのすぐ下に「3列｜2列」・初期値は3列', f);
		assert(f.last === 'タイトルのバー' && s0.main.checks[5] === true && s0.now.title === true && s0.now.cols === 3, 'T98(1): チェックの6つ目は「タイトルのバー」で初期値 ON', s0);
		assert(f.cs[0].bg !== f.cs[1].bg, 'T98(1): 選んだほうは塗り（反転）', f.cs);
		// ③で2列・バー OFF → 引き出し・右下に映る
		await page.click('#stitch-parts-panel [data-stitch-cols="2"]');
		await page.uncheck('#opt-stitch-title');
		const s1 = await settingsOf(page);
		assert(s1.saved.cols === 2 && s1.saved.title === false && JSON.stringify(s1.drawer.cols) === '["false","true"]' && JSON.stringify(s1.fab.cols) === '["false","true"]' && s1.drawer.checks[5] === false && s1.fab.checks[5] === false,
			'T98(1): ③で変えた形とバーは引き出し・右下のパネルにも映り、保存キーに入る', s1);
		const wire = await page.evaluate(() => ({ two: !document.querySelector('#stitch-parts-panel [data-stitch-wire-cols="2"]').hidden, three: !document.querySelector('#stitch-parts-panel [data-stitch-wire-cols="3"]').hidden,
			bar: [...document.querySelectorAll('#stitch-parts-panel [data-stitch-part="title"]')].some((e) => !e.hidden) }));
		assert(wire.two && !wire.three && !wire.bar, 'T98(1): 模式図は2列の形に替わり、タイトルのバーが消える', wire);
		// 右下のパネルで3列に戻す
		await page.evaluate(() => document.querySelector('#stitch-parts-panel-fab [data-stitch-cols="3"]').click());
		await reloadReady(page);
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]');
		const s2 = await settingsOf(page);
		assert(s2.now.cols === 3 && s2.now.title === false && JSON.stringify(s2.main.cols) === '["true","false"]' && s2.main.checks[5] === false, 'T98(1): 右下で変えた形も③に映り、再読み込みのあとも残る', s2);
		// 壊れた値・知らない値: 3列・バーあり
		await page.evaluate(() => { localStorage.setItem('uma-special-stitch-parts', JSON.stringify({ cols: 5, title: 'x' })); });
		await reloadReady(page);
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]');
		const s3 = await settingsOf(page);
		assert(s3.now.cols === 3 && s3.now.title === true, 'T98(1): 知らない値は3列・バーあり', s3.now);
		// 旧UI: 2列を保存していても3列・バーあり・右下の項目は出さない
		await page.evaluate(() => { localStorage.setItem('uma-special-stitch-parts', JSON.stringify({ cols: 2, title: false })); localStorage.setItem(UI_NOTICE_STORAGE_KEY, UI_NOTICE_ID); localStorage.setItem('uma-special-ui-mode', 'old'); });
		await reloadReady(page);
		const old = await page.evaluate(() => ({ deckMode, now: stitchPartsNow(), fab: !document.getElementById('fab-item-settings').hidden }));
		assert(!old.deckMode && old.now.legacy && old.now.cols === 3 && old.now.title === true && !old.fab, 'T98(1): 旧UI はいつも3列・バーあり・右下の「結合画像の設定」は出さない', old);
		assert(jsErrors(errors).length === 0, 'T98(1): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (2) 右下のボタン群の「結合画像の設定」 ── */
	for (const w of [375, 1280]) {
		await block(`T98(2) ${w}px 右下のボタン群の「結合画像の設定」: 押すと小さなパネル（暗転つき・模式図と「画像を更新」なし）・同じ2択と6つのチェック・✕／暗転／Esc で閉じて焦点はメインボタンへ`, async () => {
			const { ctx, page, errors } = await openSp({ w, h: w < 600 ? 812 : 900 });
			await page.click('#fab-toggle');
			await page.waitForTimeout(250);
			await page.click('#fab-item-settings');
			const m = await page.evaluate(() => {
				const pop = document.getElementById('stitch-settings-pop');
				const r = pop.getBoundingClientRect();
				return { open: !pop.hidden, bd: !document.getElementById('stitch-settings-backdrop').hidden, title: pop.querySelector('.uma-popover-title').textContent.trim(),
					seg: pop.querySelectorAll('[data-stitch-cols]').length, checks: pop.querySelectorAll('input[data-stitch-part-key]').length, wire: !!pop.querySelector('.stitch-wire'),
					refresh: !!pop.querySelector('#stitch-refresh-btn'), focus: document.activeElement && document.activeElement.id, expanded: document.getElementById('fab-item-settings').getAttribute('aria-expanded'),
					inView: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
			});
			assert(m.open && m.bd && m.title === '結合画像の設定' && m.seg === 2 && m.checks === 6 && !m.wire && !m.refresh && m.focus === 'stitch-settings-close' && m.expanded === 'true',
				`T98(2) ${w}px パネルが開く（見出し・2択・チェック6つ・模式図と「画像を更新」なし・焦点は ✕）`, m);
			assert(m.inView && m.sw <= m.iw, `T98(2) ${w}px パネルは画面の中・横スクロールなし`, m);
			await page.click('#stitch-parts-panel-fab [data-stitch-cols="2"]');
			const c = await page.evaluate(() => ({ cols: stitchPartsNow().cols, main: document.querySelector('#stitch-parts-panel [data-stitch-cols="2"]').getAttribute('aria-pressed') }));
			assert(c.cols === 2 && c.main === 'true', `T98(2) ${w}px 右下で変えた形は③のパネルにも映る`, c);
			await page.keyboard.press('Escape');
			const e1 = await page.evaluate(() => ({ open: !document.getElementById('stitch-settings-pop').hidden, focus: document.activeElement && document.activeElement.id }));
			await page.click('#fab-toggle'); await page.waitForTimeout(250); await page.click('#fab-item-settings');
			await page.click('#stitch-settings-close');
			const e2 = await page.evaluate(() => !document.getElementById('stitch-settings-pop').hidden);
			await page.click('#fab-toggle'); await page.waitForTimeout(250); await page.click('#fab-item-settings');
			await page.mouse.click(5, 5);
			const e3 = await page.evaluate(() => ({ open: !document.getElementById('stitch-settings-pop').hidden, bd: !document.getElementById('stitch-settings-backdrop').hidden, ov: document.body.style.overflow }));
			assert(!e1.open && e1.focus === 'fab-toggle' && !e2 && !e3.open && !e3.bd && e3.ov === '', `T98(2) ${w}px Esc・✕・暗転で閉じる（焦点はメインボタン・本文のスクロールを戻す）`, { e1, e2, e3 });
			assert(jsErrors(errors).length === 0, `T98(2) ${w}px コンソールエラー0`, jsErrors(errors).slice(0, 3));
			await ctx.close();
		});
	}

	/* ── (3) 2列の配置 ── */
	await block('T98(3) 2列の配置: 上段は1・2列目の上だけ・3列目は上段の上端から理論値SP→星取表・枠の見かたは1・2列目の下・祖2人の高さを1列目にそろえる・欠けた所を詰める', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS });
		const r = await page.evaluate(async () => {
			const L = STITCH_LAYOUT;
			const lay = async (o) => { const c = composeFamilyImage2(await __parts2(o)); const l = c._layout; return Object.assign({ cw: c.width, ch: c.height }, JSON.parse(JSON.stringify(l, (k, v) => (k === 'cards' || k === 'lines' || k === 'texts' || k === 'widths') ? undefined : v))); };
			const all = { marker: true, roster: true, factor: true, sp: true, table: true };
			return { L: { margin: L.margin, gap: L.gap, innerGap: L.innerGap, barH: L.barH, barGap: L.barGap, topAfter: L.topAfter, legendGap: L.legendGap, rowMax: L.rowMax, spW: L.spW, maxPixels: L.maxPixels },
				all: await lay({ on: all }), off: await lay({}), star: await lay({ on: { table: true } }), hen: await lay({ on: { roster: true, factor: true } }), roster: await lay({ on: { roster: true } }),
				sp: await lay({ on: { sp: true } }), marker: await lay({ on: { marker: true } }), notitle: await lay({ on: all, title: false }),
				long: await lay({ on: { marker: true, table: true }, rows: 200 }), longNoMarker: await lay({ on: { table: true }, rows: 200 }),
				noTop: await lay({ on: all, topH: 0 }), huge: await lay({ on: all, ph: 9000, g1: 6000, g2: 6000 }) };
		});
		const { L, all, off } = r;
		const near = (a, b, t = 2) => Math.abs(a - b) <= t;
		const span = (l) => l.grands.length ? l.grands[0].x + Math.max(...l.grands.map((g) => g.w)) - l.parent.x : l.parent.w;
		// 全部 ON
		const gTotal = all.grands.reduce((s, g) => s + g.h, 0);
		assert(all.cols === 2 && all.bar && all.bar.y === L.margin && all.bar.x === L.margin && all.bar.w === all.width - L.margin * 2, 'T98(3): タイトルのバーは画像の全幅', all.bar);
		assert(all.top && all.top.x === L.margin && all.top.y === all.bodyY && all.top.x + all.top.w <= all.col3.x - L.gap && all.top.roster && all.top.factor && near(all.top.w, span(all), 1),
			'T98(3): 上段（本育成編成｜因子周回編成）は1列目・2列目の上だけ（3列目の上に掛からない）', { top: all.top, col3: all.col3 });
		assert(all.parent.x === L.margin && all.parent.y === all.personsY && all.personsY === all.bodyY + all.top.h + L.topAfter, 'T98(3): 1列目は親A（見出しの行なしで上の欄＋因子）', { parent: all.parent, personsY: all.personsY });
		assert(all.grands.length === 2 && all.grands[0].x === all.parent.x + all.parent.w + L.innerGap && all.grands[0].y === all.personsY && all.grands[1].y === all.grands[0].y + all.grands[0].h && gTotal === all.colH && all.colH === all.parent.h && all.grandScale < 1,
			'T98(3): 2列目は祖A1 の下に祖A2 をすきま無くつなぎ、2人の合計の高さを1列目の高さにぴったりそろえて同じ割合で縮める', { grands: all.grands, gTotal, colH: all.colH, s: all.grandScale });
		assert(all.col3 && all.col3.y === all.top.y && all.sp && all.sp.x === all.col3.x && all.sp.y === all.col3.y && all.table && all.table.x === all.col3.x && all.table.y === all.sp.y + all.sp.h + L.topAfter,
			'T98(3): 3列目は上段の上端から、上に理論値SP、その下に星取表', { col3: all.col3, sp: all.sp, table: all.table });
		assert(all.legend && all.legend.x === L.margin && all.legend.y === all.personsY + all.colH + L.legendGap && all.legend.x + all.legend.w <= all.col3.x - L.gap, 'T98(3): 枠の見かたは1列目・2列目の下（3列目に掛からない）', all.legend);
		assert(all.table.y + all.table.h <= all.leftBottom && all.ch >= all.leftBottom + L.margin, 'T98(3): 星取表は左の下端までに収まる・画像の下にはみ出さない', { tb: all.table.y + all.table.h, lb: all.leftBottom, ch: all.ch });
		// 星取表が長い: 枠の見かたの行の下端まで伸ばし、入らなければ行を縮める
		const lg = r.long;
		assert(lg.table.rowH < L.rowMax && lg.table.y + lg.table.h <= lg.leftBottom && lg.table.y + lg.table.h > lg.leftBottom - (lg.table.rows + 2) && lg.leftBottom === lg.legend.y + lg.legend.h && lg.ch === lg.leftBottom + L.margin,
			'T98(3): 星取表は枠の見かたの行の下端まで伸び、入らない行は縮めて収める（下にはみ出さない）', { table: lg.table, leftBottom: lg.leftBottom, legend: lg.legend, ch: lg.ch });
		const ln = r.longNoMarker;
		assert(!ln.legend && ln.leftBottom === ln.personsY + ln.colH && ln.table.y + ln.table.h <= ln.leftBottom && ln.table.y === ln.bodyY, 'T98(3): 分類マーカー OFF（枠の見かたなし）では星取表の下端は親A の列の下端まで・理論値SP が無ければ上端から', { table: ln.table, lb: ln.leftBottom });
		// 欠けた所の詰め方
		assert(!off.top && !off.col3 && !off.legend && !off.sp && !off.table && off.personsY === off.bodyY && off.cw === L.margin * 2 + span(off), 'T98(3): 全部 OFF は1列目・2列目だけ（上段・3列目なし）', off);
		assert(!r.star.top && r.star.col3 && !r.star.sp && r.star.table.y === r.star.bodyY && r.star.personsY === r.star.bodyY, 'T98(3): 星取表だけ: 上段の行なし・3列目は星取表だけ（上端から）', r.star);
		assert(r.hen.top && r.hen.top.roster && r.hen.top.factor && !r.hen.col3 && r.hen.cw === L.margin * 2 + span(r.hen), 'T98(3): 編成2つだけ: 上段だけ・3列目なし', r.hen);
		assert(r.roster.top && r.roster.top.roster && !r.roster.top.factor && r.roster.top.roster.x === L.margin && r.roster.top.roster.w === r.hen.top.roster.w, 'T98(3): 本育成編成だけ: 左に詰める（欄の幅は2つのときと同じ）', r.roster.top);
		assert(!r.sp.top && r.sp.col3 && r.sp.sp && r.sp.sp.y === r.sp.bodyY && !r.sp.table && r.sp.col3.w === L.spW, 'T98(3): 理論値SP だけ: 3列目は理論値SP だけ', r.sp);
		assert(r.marker.legend && !r.marker.col3 && !r.marker.top, 'T98(3): 分類マーカーだけ: 枠の見かただけ（1・2列目の下）', r.marker);
		assert(!r.notitle.bar && r.notitle.bodyY === L.margin && r.notitle.ch === all.ch - L.barH - L.barGap, 'T98(3): タイトルのバー OFF: バーとその下の間ぶん上に詰まる', { bodyY: r.notitle.bodyY, ch: r.notitle.ch, all: all.ch });
		assert(r.noTop.parent.topH === 0, 'T98(3): 親の上の欄が無いときも組める', r.noTop.parent);
		assert(r.huge.scale < 1 && r.huge.cw * r.huge.ch <= L.maxPixels, 'T98(3): 画素数が上限を超えるときは全体を同じ割合で縮める', { scale: r.huge.scale, w: r.huge.cw, h: r.huge.ch });
		assert(jsErrors(errors).length === 0, 'T98(3): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (4) 3列のタイトルのバーと、2列の人の画像の切り出し ── */
	await block('T98(4) 3列: タイトルのバー ON は今までと同じ画素（title なし＝true）・OFF でバーと間を詰める／2列の人: 小窓の左右の端で切り、親だけ上の欄を足す', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS });
		const r = await page.evaluate(async () => {
			const p = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, H);
				for (let y = 10; y < H - 60; y += 80) { g.fillStyle = 'rgb(226,226,226)'; g.fillRect(W * 0.19, y, W * 0.39, 60); g.fillRect(W * 0.6, y, W * 0.38, 60); } c._sourcePlacements = []; c._profileHeader = { kept: false, ratio: 0.31, height: 0 }; return c; };
			const parts = { idxs: [0, 1, 2], canvases: [p(900, 1800), p(900, 1500), p(900, 1200)], heads: [null, null, null], table: __table(18), legend: buildFactorFrameLegendBar(STITCH_LAYOUT.legendMaxW, STITCH_LAYOUT.legendRef, true),
				barText: 'T98', top: await stitchTopData(captureStitchSetPart(), { sp: true, roster: true, factor: true }), genes: null };
			const a = composeFamilyImage(parts), b = composeFamilyImage(Object.assign({}, parts, { title: true })), c = composeFamilyImage(Object.assign({}, parts, { title: false }));
			const same = a.width === b.width && a.height === b.height && a.toDataURL() === b.toDataURL();
			// 2列の人: 元の画（上の帯＝緑・左右に暗い端）と、その画の行 400 から下を描いた結合画像
			const W = 1180, src = document.createElement('canvas'); src.width = W; src.height = 2550; const g = src.getContext('2d');
			g.fillStyle = 'rgb(40,50,70)'; g.fillRect(0, 0, W, 2550); g.fillStyle = '#fff'; g.fillRect(14, 280, W - 28, 2200); g.fillStyle = 'rgb(130,206,10)'; g.fillRect(14, 280, W - 28, 100);
			const blob = await new Promise((res) => src.toBlob(res, 'image/png'));
			const file = new File([blob], 'f.png', { type: 'image/png' });
			const cont = document.createElement('canvas'); cont.width = W; cont.height = 1500; cont.getContext('2d').drawImage(src, 0, 400, W, 1500, 0, 0, W, 1500);
			cont._sourcePlacements = [{ fileIndex: 0, srcY0: 400, srcY1: 1900, outY0: 0 }];
			const par = await stitchTwoColPerson(cont, [file], true), gr = await stitchTwoColPerson(cont, [file], false);
			const none = document.createElement('canvas'); none.width = W; none.height = 800; none._sourcePlacements = [{ fileIndex: 0, srcY0: 400, srcY1: 1200, outY0: 0 }];
			const blank = await new Promise((res) => { const z = document.createElement('canvas'); z.width = W; z.height = 2550; z.toBlob(res, 'image/png'); });
			const nb = await stitchTwoColPerson(none, [new File([blank], 'b.png', { type: 'image/png' })], true);
			const px = (cv, x, y) => Array.from(cv.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3));
			return { same, aH: a.height, cH: c.height, aBody: a._layout.bodyY, cBody: c._layout.bodyY, cBar: c._layout.bar, aTop: a._layout.top.y, cTop: c._layout.top.y,
				L: { barH: STITCH_LAYOUT.barH, barGap: STITCH_LAYOUT.barGap, margin: STITCH_LAYOUT.margin },
				par: { w: par.width, h: par.height, tc: par._twoCol, top: px(par, 10, 10) }, gr: { w: gr.width, h: gr.height, topH: gr._twoCol.topH }, nb: { w: nb.width, h: nb.height, band: nb._twoCol.band } };
		});
		const d = r.L.barH + r.L.barGap;
		assert(r.same, 'T98(4): 3列は title を渡さないときと true のときで同じ画素（T96 の画のまま）', r);
		assert(!r.cBar && r.cBody === r.aBody - d && r.cH === r.aH - d && r.cTop === r.L.margin && r.aTop === r.L.margin + d, 'T98(4): 3列でタイトルのバー OFF はバーと間（' + d + 'px）を詰める', r);
		assert(r.par.w === 1180 - 28 && r.par.tc.band && r.par.tc.band.top === 280 && r.par.tc.topH === 120 && r.par.h === 1500 + 120 && r.par.top[1] > 150, 'T98(4): 2列の親: 小窓の左右の端で切り（暗い端を落とす）、上の欄（帯の上端〜描き始め）を足す', r.par);
		assert(r.gr.w === 1180 - 28 && r.gr.topH === 0 && r.gr.h === 1500, 'T98(4): 2列の祖: 左右は同じく切り、上の欄は足さない', r.gr);
		assert(r.nb.w === 1180 && r.nb.h === 800 && !r.nb.band, 'T98(4): 小窓の帯が見つからない画では切らず・足さない', r.nb);
		assert(jsErrors(errors).length === 0, 'T98(4): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (5) 動画モードの画面 ── */
	for (const w of [375, 1280]) {
		await block(`T98(5) ${w}px 動画モード: 入口で切り替え（読み上げ名・アイコン）・「追加」の代わりに「動画を選ぶ」1つ・下は「OCR処理を開始する」だけ・画像はそのまま・次に開いたときも動画モード・親Bセットも同じ`, async () => {
			const { ctx, page, errors } = await openSp({ w, h: w < 600 ? 812 : 900, roster: R1S, ids: IDS });
			await page.evaluate(() => { [0, 1, 2].forEach((r) => addPersonFiles(r, [new File([new Uint8Array([137, 80, 78, 71, r])], 's' + r + '.png', { type: 'image/png' })])); });
			const st = () => page.evaluate(() => {
				const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
				const shotB = document.querySelector('[data-upload-mode-btn="shot"]');
				const videoB = document.querySelector('[data-upload-mode-btn="video"]');
				const pick = document.querySelector('#personset-A-wrap .video-pick-btn');
				const bar = [...document.querySelectorAll('#upload-bar .uma-btn')].filter(vis).map((b) => b.textContent.trim());
				return { mode: document.body.getAttribute('data-upload-mode'), labels: [shotB.textContent, videoB.textContent], alpha: !!videoB.querySelector('.video-alpha'), pressed: [shotB.getAttribute('aria-pressed'), videoB.getAttribute('aria-pressed')].join(),
					pick: vis(pick), pickText: pick && pick.textContent.trim(), pickW: pick && Math.round(pick.getBoundingClientRect().width), colsW: Math.round(document.querySelector('#personset-A-wrap .upload-cols').getBoundingClientRect().width),
					pickH: pick && Math.round(pick.getBoundingClientRect().height), cap: vis(document.querySelector('#personset-A-wrap .video-capture-btn')), capW: vis(document.querySelector('#personset-A-wrap .video-capture-btn')) ? Math.round(document.querySelector('#personset-A-wrap .video-capture-btn').getBoundingClientRect().width) : 0, adds: [...document.querySelectorAll('#personset-A-wrap .upload-add')].filter(vis).length, bar,
					files: persons.map((p) => p.files.length).join(','), saved: localStorage.getItem('uma-special-upload-mode'), sw: document.documentElement.scrollWidth, iw: window.innerWidth };
			});
			const a = await st();
			assert(a.mode === 'shot' && a.labels.join() === '静止画,動画α' && a.alpha && a.pressed === 'true,false' && !a.pick && a.adds === 3 && JSON.stringify(a.bar) === '["OCR処理＋画像結合を開始する","画像を結合する（OCRしない）"]',
				`T98(5) ${w}px 静止画（初期値）: 切り替えは「静止画｜動画α」で静止画が ON・人ごとの「追加」・下は2つのボタン`, a);
			await page.click('[data-upload-mode-btn="video"]');
			const b = await st();
			assert(b.mode === 'video' && b.pressed === 'false,true' && b.pick && b.pickText.replace(/α$/, '') === '動画を選ぶ' && b.adds === 0 && (b.cap ? Math.abs(b.pickW - b.capW) <= 1 && Math.abs(b.pickW + b.capW + 8 - b.colsW) <= 1 : b.pickW === b.colsW) && b.pickH === 76,
				`T98(5) ${w}px 動画モード: 切り替えは動画が ON・「追加」の代わりにセットの幅いっぱいの「動画を選ぶ」1つ（76px。T105 段2 の「ウィンドウから取り込む」が出る環境では、2つが同じ幅で並んでセットの幅いっぱい）`, b);
			assert(JSON.stringify(b.bar) === '["OCR処理を開始する"]' && b.files === a.files && b.saved === 'video', `T98(5) ${w}px 下は「OCR処理を開始する」だけ・入っている画像はそのまま・保存する`, b);
			assert(b.sw <= b.iw, `T98(5) ${w}px 横スクロールなし`, b);
			await reloadReady(page);
			for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]');
			await page.evaluate(() => selectStepTab(2));
			await page.evaluate(() => { [0, 1, 2].forEach((r) => addPersonFiles(r, [new File([new Uint8Array([137, 80, 78, 71, r])], 't' + r + '.png', { type: 'image/png' })])); });
			const c = await st();
			assert(c.mode === 'video' && c.pick && JSON.stringify(c.bar) === '["OCR処理を開始する"]', `T98(5) ${w}px 次に開いたときも動画モード`, c);
			// 「動画を選ぶ」→ すぐファイルの選択（T106）。親Bセットのタブでも同じ
			const chA = await pickVideo(page);
			const pendA = await page.evaluate(() => videoPending && videoPending.setIdx);
			await page.evaluate(() => selectPersonSet(1));
			const pickB = await page.evaluate(() => { const p = document.querySelector('#personset-B-wrap .video-pick-btn'); return !!p && p.getClientRects().length > 0; });
			const chB = await pickVideo(page);
			const pendB = await page.evaluate(() => videoPending && videoPending.setIdx);
			assert(!!chA && pendA === 0 && pickB && !!chB && pendB === 1, `T98(5) ${w}px 「動画を選ぶ」ですぐファイルの選択が開く・親Bセットのタブでも同じ`, { chA: !!chA, pendA, pickB, chB: !!chB, pendB });
			// スクショのモードに戻す: 画像はそのまま・2つのボタン
			await page.evaluate(() => selectPersonSet(0));
			await page.click('[data-upload-mode-btn="shot"]');
			const d = await st();
			assert(d.mode === 'shot' && d.adds === 3 && !d.pick && d.bar.length === 2 && d.files === c.files && d.saved === 'shot', `T98(5) ${w}px 静止画に戻る（画像はそのまま）`, d);
			assert(jsErrors(errors).length === 0, `T98(5) ${w}px コンソールエラー0`, jsErrors(errors).slice(0, 3));
			await ctx.close();
		});
	}

	/* ── (6) 動画モードの OCR と③の「画像を更新」 ── */
	await block('T98(6) 動画モード: 取り込み後の知らせは無し（T106）・OCR の前の③に「画像を更新」あり（T117）・設定を変えても③はその場では描き直さない・「OCR処理を開始する」の結合（枠つき）は③にも出る', async () => {
		const { ctx, page, errors } = await openSp({ w: 1280, roster: R1S, ids: IDS });
		await page.addScriptTag({ content: SYNTH });
		await pickVideo(page);
		const res = await page.evaluate(() => Promise.race([onVideoChosen(__synth.make({}).source), new Promise((r) => setTimeout(() => r('timeout'), 60000))]));
		const v0 = await page.evaluate(() => {
			const box = document.querySelector('#personset-A-wrap .video-result');
			return { sum: !!document.getElementById('video-summary'), img: box && box.querySelector('img') ? box.querySelector('img').src.length : 0, rb: !!(box && box.querySelector('[data-video-refresh]')), shown: videoShown[0] };
		});
		assert(res && res.ok && !v0.sum, 'T98(6): 取り込み後の知らせは出ない', { res, v0 });
		// T117（Chat 381）: OCR の前の③に「画像を更新」を戻した（T106 の (9) のうちボタンの分を置き換え）
		assert(v0.img > 0 && v0.rb && v0.shown === true, 'T98(6): OCR の前の③の結合画像に「画像を更新」がある', v0);
		const before = await page.evaluate(() => document.querySelector('#personset-A-wrap .video-result img').src);
		await page.click('#stitch-parts-panel [data-stitch-cols="2"]');
		const same = await page.evaluate(() => document.querySelector('#personset-A-wrap .video-result img').src);
		assert(same === before, 'T98(6): 形を変えてもその場では描き直さない', null);
		// 動画モードの「OCR処理を開始する」と同じ結合（OCR の写しで枠つき）: 引き出しと③の両方に出る
		await page.evaluate(async () => { stitchSnapshot = captureStitchSnapshot(); stitchSnapshot.results = [null, null, null, null, null, null]; await runImageStitching({ keepClosed: true, quiet: true, withMarks: true }); });
		const v3 = await page.evaluate((before) => ({ drawer: !!document.querySelector('#stitch-result-content img'), step3: !!document.querySelector('#personset-A-wrap .video-result img'), cols: document.querySelector('#personset-A-wrap .video-result img').src !== before, label: document.querySelector('#process-stitch-btn span').textContent }), before);
		assert(v3.drawer && v3.step3 && v3.cols && v3.label === 'OCR処理を開始する', 'T98(6): 動画モードで OCR の写しを使う結合は、引き出しと③の両方に出る（③は今の設定で作り直される）', v3);
		assert(jsErrors(errors).length === 0, 'T98(6): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (8) 2列は人の見出しの行を描かない・3列は描く ── */
	await block('T98(8) 2列は人の見出しの行（顔・ラベル・遺伝子の欄）を3人とも描かない・3列は今までどおり描く', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS });
		const r = await page.evaluate(async () => {
			const parts = await __parts2({ on: { marker: true, table: true } });
			parts.heads = [1, 2, 3].map(() => { const c = document.createElement('canvas'); c.width = c.height = 40; return c; });
			parts.genes = [null, null, null];
			const orig = window.stitchDrawPersonHead;
			let n = 0;
			window.stitchDrawPersonHead = function () { n++; return orig.apply(this, arguments); };
			const two = composeFamilyImage2(parts);
			const n2 = n; n = 0;
			composeFamilyImage(parts);
			const n3 = n;
			window.stitchDrawPersonHead = orig;
			return { n2, n3, hasHeads: 'heads' in two._layout };
		});
		assert(r.n2 === 0 && !r.hasHeads, 'T98(8): 2列は人の見出しの行を描かない', r);
		assert(r.n3 === 3, 'T98(8): 3列は3人とも人の見出しの行を描く', r);
		assert(jsErrors(errors).length === 0, 'T98(8): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (9) ③のパネル: スマホでもチェックの一覧の右に模式図 ── */
	for (const w of [320, 360, 375, 390, 1280]) {
		await block(`T98(9) ${w}px ③の「結合画像の設定」: チェックの一覧の右に模式図・文字が切れない・横スクロールなし`, async () => {
			const { ctx, page, errors } = await openSp({ w, h: w < 600 ? 812 : 900 });
			for (const cols of [3, 2]) {
				await page.evaluate((n) => { setStitchCols(n); document.getElementById('stitch-parts-panel').scrollIntoView({ block: 'start' }); }, cols);
				const m = await page.evaluate(() => {
					const p = document.getElementById('stitch-parts-panel');
					const rect = (s) => { const b = p.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
					const range = document.createRange();
					const lines = [...p.querySelectorAll('.stitch-show-text')].map((t) => { range.selectNodeContents(t); return range.getClientRects().length; });
					return { show: rect('.stitch-show'), list: rect('.stitch-show-list'), wire: rect('.stitch-wire'),
						clipped: [...p.querySelectorAll('.stitch-show-item, .stitch-cols-btn, .stitch-wire-sheet:not([hidden])')].filter((e) => e.scrollWidth > e.clientWidth).length, lines,
						sw: document.documentElement.scrollWidth - innerWidth, vh: innerHeight };
				});
				assert(m.wire.l >= m.list.r && m.wire.r <= m.show.r && m.wire.t >= m.show.t && m.wire.b <= m.show.b, `T98(9) ${w}px ${cols}列: 模式図はチェックの一覧の右に並ぶ`, m);
				assert(m.show.t >= -1 && m.list.b <= m.vh && m.wire.b <= m.vh, `T98(9) ${w}px ${cols}列: パネルの最初の位置で一覧と模式図が両方見える`, m);
				assert(m.clipped === 0 && m.sw <= 0, `T98(9) ${w}px ${cols}列: 文字が切れない・横スクロールなし`, m);
				assert(m.lines.every((n) => n === 1), `T98(9) ${w}px ${cols}列: チェックの文字は1行に収まる`, m.lines);
				// T106: スマホでは2列3行のチェックの残りの幅（PC は 150px のまま）
				const wireW = { 320: 62, 360: 102, 375: 117, 390: 132 }[w] || 150;
				assert(m.wire.w === wireW, `T98(9) ${w}px ${cols}列: 模式図の幅は ${wireW}px`, m.wire);
			}
			const others = await page.evaluate(() => ({ drawer: !!document.querySelector('#stitch-parts-panel-drawer .stitch-wire'), fab: !!document.querySelector('#stitch-parts-panel-fab .stitch-wire') }));
			assert(others.drawer && !others.fab, `T98(9) ${w}px: 模式図は引き出しにはある（T106 の (11)）・右下のパネルには無いまま`, others);
			assert(jsErrors(errors).length === 0, `T98(9) ${w}px コンソールエラー0`, jsErrors(errors).slice(0, 3));
			await ctx.close();
		});
	}

	/* ── (10) 動画モードのときだけ変わる文（決定 196・197） ── */
	await block('T98(10) 動画モードのときだけ「OCR処理を開始する」の文: 引き出しの「画像を更新」の案内の文', async () => {
		const { ctx, page, errors } = await openSp();
		const read = () => page.evaluate(() => document.getElementById('stitch-refresh-note').textContent);
		const SHOT = '画像や集計の設定が変わったため、「OCR処理＋画像結合を開始する」からやり直してください。';
		const VIDEO = '画像や集計の設定が変わったため、「OCR処理を開始する」からやり直してください。';
		assert(await read() === SHOT, 'T98(10): 静止画の案内の文は今のまま', await read());
		await page.click('[data-upload-mode-btn="video"]');
		assert(await read() === VIDEO, 'T98(10): 動画モードの案内の文は「」の中が「OCR処理を開始する」', await read());
		await reloadReady(page);
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]');
		assert(await read() === VIDEO, 'T98(10): 動画モードのまま開き直しても案内の文は動画モードの形', await read());
		await page.evaluate(() => selectStepTab(2));
		await page.click('[data-upload-mode-btn="shot"]');
		assert(await read() === SHOT, 'T98(10): 静止画に戻すと案内の文も戻る', await read());
		assert(jsErrors(errors).length === 0, 'T98(10): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	/* ── (7) ダーク・コントラスト ── */
	for (const [w, th] of [[375, 'light'], [375, 'dark'], [1280, 'light'], [1280, 'dark']]) {
		await block(`T98(7) ${w}px ${th === 'dark' ? 'ダーク' : 'ライト'}: 形の2択・「動画を選ぶ」・右下のパネルの文字のコントラスト 4.5 以上・横スクロールなし`, async () => {
			const { ctx, page, errors } = await openSp({ w, h: w < 600 ? 812 : 900, roster: R1S, ids: IDS, pre: { 'uma-tools-theme': th, 'uma-special-upload-mode': 'video' } });
			const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
			const c1 = await page.evaluate(scanTextContrastInPage, '#stitch-parts-panel .stitch-cols');
			const c0 = await page.evaluate(scanTextContrastInPage, '#upload-mode');
			const c2 = await page.evaluate(scanTextContrastInPage, '#personset-A-wrap .video-pick-btn');
			await page.click('#fab-toggle'); await page.waitForTimeout(250); await page.click('#fab-item-settings');
			const c3 = await page.evaluate(scanTextContrastInPage, '#stitch-settings-pop');
			const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
			const bad = [].concat(c0.bad, c1.bad, c2.bad, c3.bad);
			assert(theme === th && bad.length === 0 && c0.checked > 0 && c1.checked > 0 && c2.checked > 0 && c3.checked > 0, `T98(7) ${w}px ${th} で新しい部品の文字のコントラスト 4.5 以上（${c0.checked + c1.checked + c2.checked + c3.checked}件）`, formatContrast(bad));
			assert(sw <= 0, `T98(7) ${w}px 横スクロールなし`, sw);
			assert(jsErrors(errors).length === 0, `T98(7) ${w}px コンソールエラー0`, jsErrors(errors).slice(0, 3));
			await ctx.close();
		});
	}
}
