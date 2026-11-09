// 照合結果のスマホのヒートマップ（T100・C-290・2026-11-05）の検査。
// run-smoke.mjs の末尾から register114() で呼ばれる（塊の見出しはすべて「T100ヒートマップ」で始まる。`npm run test:visual -- --only=T100ヒートマップ` で回す）。
//
// 決め（T100。おいもさん）:
//  - 640px 未満の新UIの引き出しだけ、人のマスを★の数で塗り数字を出す（★の記号は出さない）。未検出は塗りなし、★不明は斜線に「?」。
//  - 表: 人3人＋合計の4列で約 2/3、スキル名の列で約 1/3。列が7つでも横スクロールなし・見出しは1行・スキル名の列に7文字以上。
//  - 合計の列はスマホでも出す（見出しは PC と同じ文）。人のマスとは塗りで見分ける。
//  - 親Bセットのマスも青の3段（見出しは今の赤・境は赤い線）。ハイライトは人ごとに1行。横スクロールの注記はスマホでは出さない。
//  - 文字は 13px と 11px（列が5つ以上の表だけ 10px）。
//  - 見直し（決定 215〜222）: 引き出しの中の密度を上げる（PC）。親Aセットと親Bセットの部品を同じ行に並べる（PC・スマホ）。
//    親A・親Bの色を落ち着かせる（面積と強さの両方）。PC の期待値は変更後の実測の固定値。
// 色と高さの期待値は段1 のモックで決めて実測した値を固定で書く（実装の側の値を読まない）。データは作り物（OCR はしない。名前は skillList の順の規則で選ぶ）。
// T100_SHOTS=<フォルダ> を付けて回すと、各場面の画像をそのフォルダに残す。
import fs from 'node:fs';
import path from 'node:path';

// #rrggbb ではなく getComputedStyle の rgb(…) で比べる
const PALETTE = {
	light: { empty: 'rgb(255, 255, 255)', s1: 'rgb(203, 229, 255)', s2: 'rgb(124, 188, 251)', s3: 'rgb(11, 107, 203)', unk: 'rgb(230, 235, 243)' },
	dark: { empty: 'rgb(34, 44, 61)', s1: 'rgb(29, 79, 134)', s2: 'rgb(74, 144, 220)', s3: 'rgb(140, 196, 251)', unk: 'rgb(54, 62, 76)' }
};
const STRIPE = { light: 'rgb(169, 182, 203)', dark: 'rgb(92, 103, 121)' };

function ratio(a, b) {
	const p = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
	const lum = (c) => { const [r, g, b2] = p(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b2; };
	const x = lum(a), y = lum(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export async function register114(env) {
	const { block, assert, browser, base } = env;
	const SHOTS = process.env.T100_SHOTS || '';

	/** exam.html を開き、人ごとに決まった並びの★で結果を入れて引き出しを開く。sets='a' は3人、'ab' は6人 */
	const open = async (width, height, theme, sets) => {
		const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
		await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem('__t100')) { sessionStorage.setItem('__t100', '1'); localStorage.clear(); localStorage.setItem('uma-tools-theme', t); } } catch (e) { /* 自動 */ } }, theme);
		const page = await ctx.newPage();
		page.setDefaultTimeout(30000);
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		await page.goto(base + '/exam.html');
		await page.waitForFunction(() => typeof skillList !== 'undefined' && skillList.length > 100);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		const fix = await page.evaluate((sets) => {
			const mk = (p) => {
				const det = [], stars = {};
				// 行ごとに人で変わる決まった並び（未検出・★1・★2・★3）。先頭から順に見本が出る
				skillList.forEach((n, r) => { const v = [0, 1, 2, 3][(r + p) % 4]; if (v) { det.push(n); stars[n] = v; } });
				return { detectedSkills: new Set(det), skillStars: stars, skillSources: {}, matchReasons: {} };
			};
			personResults = PERSON_LABELS.map(() => null);
			[0, 1, 2].forEach((i) => { personResults[i] = mk(i); });
			if (sets === 'ab') [3, 4, 5].forEach((i) => { personResults[i] = mk(i); });
			// ★不明の見本（先頭の行の2人目）
			const unk = skillList.find((n) => personResults[1].detectedSkills.has(n));
			personResults[1].skillStars[unk] = null;
			writeOcrHandoff();
			renderResults();
			updateDeckAlphaSendButton();
			openDrawer('result');
			return { unk };
		}, sets);
		await page.waitForTimeout(350);
		await page.mouse.move(0, 0);
		return { ctx, page, errs, fix };
	};
	const note = (name, o) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.appendFileSync(path.join(SHOTS, 'data.jsonl'), JSON.stringify({ name, ...o }) + '\n'); } };
	const shot = async (page, name) => {
		if (!SHOTS) return;
		fs.mkdirSync(SHOTS, { recursive: true });
		await page.screenshot({ path: path.join(SHOTS, name + '.png') });
	};
	const probe = (page) => page.evaluate(() => {
		const drawer = document.getElementById('result-drawer');
		const body = drawer.querySelector('.uma-drawer-body');
		const r = (el) => el.getBoundingClientRect();
		const h = (el) => (el && el.getClientRects().length ? Math.round(r(el).height * 10) / 10 : null);
		const table = document.getElementById('result-table-el');
		const thead = table.querySelector('thead');
		const rows = [...table.querySelectorAll('tbody tr')];
		const ths = [...thead.querySelectorAll('th')];
		body.scrollTop = 0;
		const visible = () => { const b = r(body); const top = Math.max(b.top, r(thead).bottom); return rows.filter((tr) => { const x = r(tr); return x.top >= top - 0.5 && x.bottom <= b.bottom + 0.5; }).length; };
		const atTop = visible();
		body.scrollTop += r(thead).top - r(body).top;
		const atTable = visible();
		body.scrollTop = 0;
		const tw = r(table).width, nw = r(ths[0]).width;
		const heads = ths.map((th) => {
			const rg = document.createRange(); rg.selectNodeContents(th);
			const rr = rg.getBoundingClientRect(), cs = getComputedStyle(th);
			return { t: th.textContent, fits: rr.width <= r(th).width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.5, oneLine: rr.height < parseFloat(cs.lineHeight) * 1.5, fs: cs.fontSize };
		});
		// スキル名の列に見える文字の数（省略されるときは「…」の1文字分を引く。一番少ない行）
		let minVisible = 99;
		rows.forEach((tr) => {
			const td = tr.cells[0]; const cs = getComputedStyle(td);
			const node = [...td.childNodes].find((n) => n.nodeType === 3);
			const right = r(td).right - parseFloat(cs.paddingRight), rg = document.createRange();
			const txt = node.textContent;
			rg.setStart(node, 0); rg.setEnd(node, txt.length);
			if (rg.getBoundingClientRect().right <= right + 0.5) return;
			const limit = right - parseFloat(cs.fontSize);
			let vis = 0;
			for (let i = 1; i <= txt.length; i++) { rg.setEnd(node, i); if (rg.getBoundingClientRect().right <= limit + 0.5) vis = i; else break; }
			minVisible = Math.min(minVisible, vis);
		});
		const fonts = {};
		document.querySelectorAll('#result-wrap *').forEach((el) => {
			if (!el.getClientRects().length || el.closest('.copy-source-hidden')) return;
			const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
			if (!own && el.tagName !== 'INPUT') return;
			const k = getComputedStyle(el).fontSize; (fonts[k] = fonts[k] || []).push(el.id || el.tagName + '.' + el.className);
		});
		const cell = (sel) => {
			const td = table.querySelector('tbody td.' + sel); if (!td) return null;
			const n = td.querySelector('.hm-num'); const cs = getComputedStyle(td);
			return { bg: cs.backgroundColor, img: cs.backgroundImage, color: getComputedStyle(n).color, txt: n.textContent, numVisible: n.getClientRects().length > 0, starVisible: td.querySelector('.hm-st').getClientRects().length > 0, fw: getComputedStyle(n).fontWeight };
		};
		const tot = table.querySelector('tbody td.hm-total'); const totCs = tot && getComputedStyle(tot);
		const bd = table.querySelector('tbody td.hm-bd');
		const q = (s) => document.querySelector(s);
		return {
			atTop, atTable, rowH: [...new Set(rows.map((tr) => Math.round(r(tr).height * 10) / 10))], rowCount: rows.length,
			tw, nw, colsPct: (tw - nw) / tw * 100, namePct: nw / tw * 100, heads, minVisible, colWidths: ths.slice(1).map((t) => r(t).width), lastHead: ths[ths.length - 1].textContent,
			overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || table.parentElement.scrollWidth > table.parentElement.clientWidth + 1,
			inlineMinW: table.style.minWidth, computedMinW: getComputedStyle(table).minWidth, layout: getComputedStyle(table).tableLayout,
			parts: { deckBtn: h(q('#deck-alpha-send-btn')), hl: h(q('#exam-highlight')), ctrl: h(q('#result-ctrlbox')), stat: h(q('#stat-grid')), search: h(q('#table-search')), filter: h(q('#filter-all')), copy: h(q('#result-copy-btn')), thead: h(thead) },
			fonts, cells: { h0: cell('hm0'), h1: cell('hm1'), h2: cell('hm2'), h3: cell('hm3'), hu: cell('hmu') },
			total: tot && { bg: totCs.backgroundColor, color: totCs.color, fw: totCs.fontWeight, txt: tot.textContent, fs: totCs.fontSize },
			bdLeft: bd ? getComputedStyle(bd).borderLeftColor : null, bdBg: bd ? getComputedStyle(bd).backgroundColor : null,
			noteVisible: !!q('.rc-scroll-note') && q('.rc-scroll-note').getClientRects().length > 0,
			groups: [...document.querySelectorAll('[data-person-group]')].map((g) => h(g)),
			copy: document.getElementById('copy-data').value
		};
	});
	const checkCells = (assertTag, m, theme) => {
		const P = PALETTE[theme];
		const c = m.cells;
		assert(c.h1 && c.h2 && c.h3 && c.h0 && c.hu && c.h1.bg === P.s1 && c.h2.bg === P.s2 && c.h3.bg === P.s3 && c.h0.bg === P.empty && c.hu.bg === P.unk,
			assertTag + ' 人のマスの地が★の数ごとの色（★0・未検出は塗りなし・★不明は灰色）', c);
		assert(c.h1.txt === '1' && c.h2.txt === '2' && c.h3.txt === '3' && c.hu.txt === '?' && c.h0.txt === '' && c.h1.numVisible && c.hu.numVisible && !c.h1.starVisible && !c.h0.starVisible,
			assertTag + ' マスに数字（★不明は「?」）・★の記号は出さない', c);
		assert(/repeating-linear-gradient/.test(c.hu.img) && c.hu.img.includes(STRIPE[theme]), assertTag + ' ★不明は斜線', c.hu);
		const rs = [ratio(c.h1.color, c.h1.bg), ratio(c.h2.color, c.h2.bg), ratio(c.h3.color, c.h3.bg), ratio(c.hu.color, c.hu.bg), ratio(c.hu.color, STRIPE[theme]) >= 2.5 ? 99 : 0, ratio(m.total.color, m.total.bg)];
		assert(rs.every((x) => x >= 4.5), assertTag + ' マスの数字・「?」・合計の数字と地のコントラスト 4.5 以上', rs);
		assert(m.total.bg !== P.s1 && m.total.bg !== P.s2 && m.total.bg !== P.s3 && m.total.bg !== P.empty && Number(m.total.fw) >= 700, assertTag + ' 合計のマスは人のマスと別の地・太字', m.total);
	};

	for (const theme of ['light', 'dark']) {
		await block('T100ヒートマップ exam ―― 375×812 親Aセット（' + theme + '）: 4列で約 2/3・合計の列・数字の塗り・行数・高さ・文字は2つ・注記なし', async () => {
			const { ctx, page, errs } = await open(375, 812, theme, 'a');
			const m = await probe(page);
			await shot(page, 'exam-375-' + theme + '-a');
			assert(m.colsPct >= 64 && m.colsPct <= 69 && m.namePct >= 31 && m.namePct <= 36, theme + ' 人3人＋合計の4列で表の約 2/3・スキル名の列で約 1/3', { cols: m.colsPct, name: m.namePct, widths: m.colWidths });
			assert(m.lastHead === '★合計' && m.total && /^\d+$/.test(m.total.txt), theme + ' 人の列の右に「★合計」の列', { h: m.lastHead, t: m.total });
			assert(m.heads.every((x) => x.fits && x.oneLine), theme + ' 見出しが1行に収まる', m.heads);
			assert(m.minVisible >= 7, theme + ' スキル名の列に7文字以上見える', m.minVisible);
			checkCells(theme, m, theme);
			assert(m.atTop >= 7 && m.atTable >= 29 && m.rowH.length === 1 && m.rowH[0] === 23, theme + ' 表の行: 開いた直後に7行以上・表を上端に合わせて29行以上・1行23px', { a: m.atTop, t: m.atTable, h: m.rowH });
			assert(m.parts.stat === 42 && m.parts.search === 28 && m.parts.filter === 24 && m.parts.copy === 28 && m.parts.deckBtn === 30 && m.parts.thead === 23, theme + ' 上の欄とボタンの高さ', m.parts);
			assert(Object.keys(m.fonts).sort().join() === '11px,13px', theme + ' 文字は 11px と 13px だけ', Object.fromEntries(Object.entries(m.fonts).map(([k, v]) => [k, v.length + ' ' + v.slice(0, 3).join(' | ')])));
			assert(m.groups.length === 3 && m.groups.every((x) => x <= 22), theme + ' ハイライトは人ごとに1行', m.groups);
			assert(!m.noteVisible, theme + ' 横スクロールの注記を出さない');
			assert(!m.overflow && m.computedMinW === '0px' && m.layout === 'fixed', theme + ' 横スクロールなし', { o: m.overflow, w: m.computedMinW, l: m.layout });
			assert(errs.length === 0, theme + ' コンソールのエラー0', errs);
			await ctx.close();
		});

		await block('T100ヒートマップ exam ―― 375×812 親Bセットあり〔7列〕（' + theme + '）: 横スクロールなし・見出し1行・7文字・親Bも青・境は赤い線・列の切り替え', async () => {
			const { ctx, page, errs } = await open(375, 812, theme, 'ab');
			const m = await probe(page);
			await shot(page, 'exam-375-' + theme + '-ab');
			// T155（決定 643）: 全体の並列の負荷で幅が 29.99998・30.000015px になって揺れたので、30px の比べだけ 0.01px 以内の差を同じとみなす
			assert(m.colWidths.length === 7 && m.colWidths.slice(0, 6).every((x) => Math.abs(x - 30) <= 0.01) && m.colWidths[6] === 34 && !m.overflow, theme + ' 7列が狭い列で横スクロールなし', { w: m.colWidths, o: m.overflow });
			assert(m.heads.every((x) => x.fits && x.oneLine && x.fs === '10px'), theme + ' 見出しが 10px で1行に収まる', m.heads);
			assert(m.minVisible >= 7, theme + ' スキル名の列に7文字以上見える', m.minVisible);
			checkCells(theme, m, theme);
			const P = PALETTE[theme];
			assert([P.empty, P.s1, P.s2, P.s3, P.unk].includes(m.bdBg), theme + ' 親Bのマスも青の3段', m.bdBg);
			const red = theme === 'light' ? 'rgb(216, 175, 175)' : 'rgb(141, 90, 94)';
			assert(m.bdLeft === red, theme + ' セットの境は赤い線（--exam-red-border-strong）', m.bdLeft);
			assert(Object.keys(m.fonts).sort().join() === '10px,11px,13px', theme + ' 文字は表の 10px と 11px・13px だけ', Object.keys(m.fonts));
			assert(m.rowH.length === 1 && m.rowH[0] === 23 && m.atTable >= 29, theme + ' 1行23px', { h: m.rowH, t: m.atTable });
			// 親Bセットを隠すと3人の形に戻る
			await page.click('#table-toggle-B');
			await page.waitForTimeout(100);
			const m2 = await probe(page);
			assert(m2.colWidths.length === 4 && m2.colsPct >= 64 && m2.colsPct <= 69 && m2.heads.every((x) => x.fs === '11px'), theme + ' 親Bセットを隠すと4列の形', { w: m2.colWidths });
			assert(errs.length === 0, theme + ' コンソールのエラー0', errs);
			await ctx.close();
		});
	}

	await block('T100ヒートマップ exam ―― 360px・320px でも横スクロールなし・見出し1行・7文字', async () => {
		for (const w of [360, 320]) for (const sets of ['a', 'ab']) {
			const { ctx, page, errs } = await open(w, 700, 'light', sets);
			const m = await probe(page);
			assert(!m.overflow && m.heads.every((x) => x.fits && x.oneLine) && m.minVisible >= 7 && errs.length === 0, w + '/' + sets, { o: m.overflow, h: m.heads, v: m.minVisible, errs });
			await ctx.close();
		}
	});

	await block('T100ヒートマップ exam ―― PC（640px・1280px）は★の記号のまま: 数字なし・表の幅の指定・注記あり。コピーの中身は人の順に★の数', async () => {
		for (const w of [640, 1280]) for (const theme of ['light', 'dark']) {
			const { ctx, page, errs, fix } = await open(w, 900, theme, 'ab');
			const m = await probe(page);
			const c = m.cells;
			assert(c.h1.starVisible && !c.h1.numVisible && c.h1.bg !== PALETTE[theme].s1 && c.h3.bg !== PALETTE[theme].s3, w + '/' + theme + ' ★の記号のまま・塗らない', c.h1);
			assert(m.noteVisible && m.inlineMinW === '504px' && m.computedMinW === '504px' && m.layout === 'auto', w + '/' + theme + ' 注記あり・min-width のまま', { n: m.noteVisible, i: m.inlineMinW, c: m.computedMinW, l: m.layout });
			assert(errs.length === 0, w + '/' + theme + ' コンソールのエラー0', errs);
			// コピーの中身（表示の形によらない。人の順にタブ区切り・★不明は空）
			const want = await page.evaluate(({ unk }) => skillList.map((n, r) => [0, 1, 2, 3, 4, 5].map((p) => { const v = [0, 1, 2, 3][(r + p) % 4]; return (!v || (p === 1 && n === unk)) ? '' : String(v); }).join('\t')).join('\n'), fix);
			assert(m.copy === want, w + '/' + theme + ' コピーの中身');
			await ctx.close();
		}
		const { ctx, page, fix } = await open(375, 812, 'light', 'ab');
		const m = await probe(page);
		const want = await page.evaluate(({ unk }) => skillList.map((n, r) => [0, 1, 2, 3, 4, 5].map((p) => { const v = [0, 1, 2, 3][(r + p) % 4]; return (!v || (p === 1 && n === unk)) ? '' : String(v); }).join('\t')).join('\n'), fix);
		assert(m.copy === want, 'スマホの形でもコピーの中身は同じ');
		await ctx.close();
	});

	// ===== 見直し（決定 215〜222。期待値は変更後の実測）=====
	const COLORS = {
		light: { aText: 'rgb(47, 74, 128)', bText: 'rgb(132, 58, 58)', aBg: 'rgb(238, 242, 248)', bBg: 'rgb(248, 240, 240)' },
		dark: { aText: 'rgb(180, 200, 230)', bText: 'rgb(230, 189, 189)', aBg: 'rgb(27, 39, 56)', bBg: 'rgb(46, 32, 34)' }
	};
	const layout = (page) => page.evaluate(() => {
		const r = (el) => el.getBoundingClientRect();
		const cells = [...document.querySelectorAll('#stat-grid > div')];
		const sets = [...document.querySelectorAll('#exam-highlight-grid > div')];
		const cs = (el) => getComputedStyle(el);
		return {
			statTops: cells.map((c) => Math.round(r(c).top)),
			statBg: cells.map((c) => cs(c).backgroundColor),
			setTops: sets.map((x) => Math.round(r(x).top)), setBg: sets.map((x) => cs(x).backgroundColor), setBorder: sets.map((x) => cs(x).borderTopWidth),
			statAText: cs(cells[1].querySelector('p')).color, statBText: cells[4] ? cs(cells[4].querySelector('p')).color : null,
			thA: cs(document.querySelectorAll('#result-thead th')[1]).backgroundColor,
			thB: document.querySelectorAll('#result-thead th')[4] ? cs(document.querySelectorAll('#result-thead th')[4]).backgroundColor : null,
			togA: [cs(document.getElementById('table-toggle-A')).color, cs(document.getElementById('table-toggle-A')).backgroundColor],
			togB: [cs(document.getElementById('table-toggle-B')).color, cs(document.getElementById('table-toggle-B')).backgroundColor],
			tableW: r(document.getElementById('result-table-el')).width,
			bodyHs: (() => { const b = document.querySelector('#result-drawer .uma-drawer-body'); return b.scrollWidth > b.clientWidth; })(),
			labelsShown: sets.map((x) => [...x.querySelectorAll('[data-person-group]')].map((g) => [...g.querySelectorAll('.hl-card--center p:first-child')].filter((p) => p.getClientRects().length).length)),
			groupH: [...document.querySelectorAll('[data-person-group]')].map((g) => Math.round(r(g).height)),
		};
	});
	for (const theme of ['light', 'dark']) {
		await block('T100ヒートマップ exam ―― 見直し 1280×900（' + theme + '）: 開いた直後の行・部品の高さ・親Aと親Bを同じ行に・色', async () => {
			const C = COLORS[theme];
			{
				const { ctx, page, errs } = await open(1280, 900, theme, 'a');
				const m = await probe(page), l = await layout(page);
				await shot(page, 'exam-1280-' + theme + '-a');
				assert(m.atTop >= 20, theme + '/a 開いた直後に表の行が20行以上（変更前は0）', m.atTop);
				assert(m.rowH.length === 1 && m.rowH[0] === 21, theme + '/a 1行21px（変更前は46px）', m.rowH);
				assert(m.parts.stat === 26 && m.parts.search === 28 && m.parts.filter === 26 && m.parts.copy === 28 && m.parts.deckBtn === 28 && m.parts.thead === 23, theme + '/a 上の欄とボタンの高さ', m.parts);
				assert(m.parts.hl <= 140 && m.parts.ctrl <= 68, theme + '/a ハイライト 140px 以下（3行）・検索とボタンの箱 68px 以下（件数と注記が2行になる）', m.parts);
				assert(l.tableW === 480 && !l.bodyHs, theme + '/a 表は幅いっぱいに伸ばさない（480px）・横スクロールなし', l.tableW);
				assert(errs.length === 0, theme + '/a コンソールのエラー0', errs);
				await ctx.close();
			}
			const { ctx, page, errs } = await open(1280, 900, theme, 'ab');
			const m = await probe(page), l = await layout(page);
			await shot(page, 'exam-1280-' + theme + '-ab');
			assert(m.atTop >= 22, theme + '/ab 開いた直後に表の行が22行以上（変更前は0）', m.atTop);
			assert(m.rowH.length === 1 && m.rowH[0] === 21, theme + '/ab 1行21px', m.rowH);
			assert(m.parts.stat === 26 && m.parts.hl <= 142 && m.parts.ctrl <= 50, theme + '/ab 上の欄 26px・ハイライト 142px 以下・検索とボタンの箱 50px 以下', m.parts);
			assert(new Set(l.statTops).size === 1 && l.statTops.length === 7, theme + '/ab 上の欄の7つが同じ行', l.statTops);
			assert(l.setTops.length === 2 && l.setTops[0] === l.setTops[1], theme + '/ab ハイライトの親Aセットと親Bセットが同じ行', l.setTops);
			assert(l.tableW === 660 && !l.bodyHs, theme + '/ab 表は幅いっぱいに伸ばさない（660px）・横スクロールなし', l.tableW);
			// 色: 面積（上の欄とセットの箱は地を塗らない）と強さ
			assert(l.statBg.slice(1).every((c) => c === 'rgba(0, 0, 0, 0)') && l.setBg.every((c) => c === 'rgba(0, 0, 0, 0)') && l.setBorder.every((b) => b === '1px'), theme + ' 上の欄とセットの箱は地なし・線 1px', l);
			assert(l.statAText === C.aText && l.statBText === C.bText && l.thA === C.aBg && l.thB === C.bBg, theme + ' 親A・親Bの色', l);
			assert(l.togA[0] === C.aText && l.togA[1] === C.aBg && l.togB[0] === C.bText && l.togB[1] === C.bBg, theme + ' 列のボタンは薄い地に濃い文字', [l.togA, l.togB]);
			assert(ratio(l.togA[0], l.togA[1]) >= 4.5 && ratio(l.togB[0], l.togB[1]) >= 4.5 && ratio(C.aText, C.aBg) >= 4.5 && ratio(C.bText, C.bBg) >= 4.5, theme + ' 文字と地のコントラスト 4.5 以上');
			assert(errs.length === 0, theme + '/ab コンソールのエラー0', errs);
			await ctx.close();
		});

		await block('T100ヒートマップ exam ―― 見直し 375×812 親Bセットあり（' + theme + '）: 上の欄とハイライトの親Aと親Bが同じ行・見出しは各セットの最初の人だけ', async () => {
			const { ctx, page, errs } = await open(375, 812, theme, 'ab');
			const m = await probe(page), l = await layout(page);
			assert(new Set(l.statTops).size === 1 && l.statTops.length === 7, theme + ' 上の欄の7つが同じ行', l.statTops);
			assert(l.setTops.length === 2 && l.setTops[0] === l.setTops[1], theme + ' ハイライトの親Aセットと親Bセットが同じ行', l.setTops);
			assert(l.labelsShown.every((x) => x.join() === '2,0,0'), theme + ' sp70緑・緑の見出しは各セットの最初の人だけ', l.labelsShown);
			assert(m.atTop >= 7 && m.parts.stat <= 52 && m.parts.hl <= 186, theme + ' 開いた直後の行 7 以上（前は 2）・上の欄 52px 以下（前は 83）・ハイライト 186px 以下（前は 285）', { a: m.atTop, p: m.parts });
			assert(!m.overflow && !l.bodyHs, theme + ' 横スクロールなし');
			assert(errs.length === 0, theme + ' コンソールのエラー0', errs);
			await ctx.close();
		});
	}

	await block('T100ヒートマップ exam ―― 見直し シナリオ因子・遺伝子の一覧: PC は名前を省略しない・親Aと親Bは同じ行', async () => {
		const seed = (page, sets) => page.evaluate((sets) => {
			setScenarioFactorsAll(true);
			setAptitudeGenesAll(true);
			const longest = factorOnlyList.slice().sort((a, b) => b.length - a.length)[0];
			const lg = geneOnlyList.slice().sort((a, b) => b.length - a.length)[0];
			const hit = [longest].concat(factorOnlyList.filter((n) => n !== longest).slice(0, 3));
			const gh = [lg].concat(geneOnlyList.filter((n) => n !== lg).slice(0, 3));
			const mk = () => matchAllSkillsWithStars(skillList.slice(0, 40).concat(hit, gh).map((s, i) => ({ text: s, stars: (i % 3) + 1, starsReliable: true, rowKey: 'r' + i })), skillList, skillIndex, {});
			personResults = PERSON_LABELS.map(() => null);
			(sets === 'ab' ? [0, 1, 2, 3, 4, 5] : [0, 1, 2]).forEach((p) => {
				personResults[p] = mk();
				hit.forEach((n, i) => { personResults[p].skillStars[n] = [3, 3, 2, 1][i]; });
				gh.forEach((n, i) => { personResults[p].skillStars[n] = [3, 3, 2, 1][i]; });
			});
			renderResults();
			openDrawer('result');
		}, sets);
		const read = (page) => page.evaluate(() => {
			const names = [...document.querySelectorAll('#exam-highlight-grid [data-hl-card] .truncate')];
			const cards = [...document.querySelectorAll('[data-person-group]')].map((g) => [...g.querySelectorAll('[data-hl-card]')].map((c) => Math.round(c.getBoundingClientRect().top)));
			return { n: names.length, clipped: names.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent), cards, tops: [...document.querySelectorAll('#exam-highlight-grid > div')].map((x) => Math.round(x.getBoundingClientRect().top)) };
		});
		for (const [w, sets] of [[1280, 'a'], [1280, 'ab'], [768, 'a'], [768, 'ab'], [640, 'a'], [640, 'ab']]) {
			const { ctx, page, errs } = await open(w, 900, 'light', 'a');
			await seed(page, sets);
			await page.waitForTimeout(350);
			const f = await read(page);
			assert(f.n > 0 && f.clipped.length === 0, w + '/' + sets + ' 名前を省略しない', f);
			if (sets === 'ab') assert(f.tops[0] === f.tops[1], w + '/ab 親Aと親Bが同じ行', f.tops);
			// 引き出しの幅に上限を設けたので、因子と遺伝子は常に上下（決定 228）
			assert(f.cards.every((c) => c.length === 2 && c[1] > c[0]), w + '/' + sets + ' 因子と遺伝子は上下', f.cards);
			assert(errs.length === 0, w + '/' + sets + ' コンソールのエラー0', errs);
			await ctx.close();
		}
		const { ctx, page, errs } = await open(375, 812, 'light', 'a');
		await seed(page, 'ab');
		await page.waitForTimeout(350);
		const f = await read(page);
		assert(f.tops[0] === f.tops[1] && f.cards.every((c) => c.length === 2 && c[1] > c[0]), '375/ab 親Aと親Bが同じ行・因子と遺伝子は上下', f);
		assert(errs.length === 0, '375/ab コンソールのエラー0', errs);
		await ctx.close();
	});

	// ===== 引き出しの幅と目覚め系の注記（決定 228・241〜243）=====
	const NOTE = '※「〇〇の目覚め」系スキルは、実質53種モードでは対応する緑スキルとペアで1カウントします（本体テーブルの表示・★の判定そのものには影響しません）。';
	const widthProbe = (page) => page.evaluate(() => {
		const r = (el) => el.getBoundingClientRect();
		const vis = (el) => !!el && el.getClientRects().length > 0;
		const body = document.querySelector('#result-drawer .uma-drawer-body');
		const ctrl = ['.rc-srch', '.rc-pills', '#result-copy-slot'].map((q) => Math.round(r(document.querySelector('#result-drawer ' + q)).top));
		const tog = document.getElementById('table-set-toggle-wrap');
		if (vis(tog)) ctrl.push(Math.round(r(tog).top));
		const persons = [...document.querySelectorAll('#exam-highlight-grid [data-person-group]')];
		return {
			drawerW: Math.round(r(document.getElementById('result-drawer')).width),
			tableW: Math.round(r(document.getElementById('result-table-el')).width),
			statTops: [...new Set([...document.querySelectorAll('#stat-grid > div')].map((d) => Math.round(r(d).top)))],
			statH: Math.round(r(document.getElementById('stat-grid')).height),
			personTops: persons.map((g) => Math.round(r(g).top)),
			personHs: persons.map((g) => Math.round(r(g).height)),
			setTops: [...document.querySelectorAll('#exam-highlight-grid > div')].map((d) => Math.round(r(d).top)),
			ctrlTops: ctrl,
			clipped: [...document.querySelectorAll('#result-drawer .truncate, #stat-grid p, #exam-highlight .hl-card--center p')].filter((e) => vis(e) && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
			bodyHs: body.scrollWidth > body.clientWidth,
			noteVisible: vis(document.getElementById('hl-note')),
			noteText: document.getElementById('hl-note').textContent,
			btnVisible: vis(document.getElementById('hl-note-btn')),
		};
	});
	for (const theme of ['light', 'dark']) {
		await block('T100ヒートマップ exam ―― 引き出しの幅 1280×900（' + theme + '）: 親Aだけは表の幅に近く上の欄1行・ハイライト3行、親Bありは左右に並べて6列の表の幅に近い', async () => {
			{
				const { ctx, page, errs } = await open(1280, 900, theme, 'a');
				const w = await widthProbe(page);
				await shot(page, 'exam-1280-' + theme + '-a-width');
				{ const pm = await probe(page); note('exam-1280-' + theme + '-a', { drawerW: w.drawerW, tableW: w.tableW, atTop: pm.atTop, parts: pm.parts, statTops: w.statTops.length, persons: w.personTops.length, clipped: w.clipped.length }); }
				assert(w.drawerW === 530 && w.tableW === 480, theme + '/a 引き出し 530px・表 480px', w);
				assert(w.statTops.length === 1 && w.statH === 26, theme + '/a 上の欄は1行', w);
				assert(w.personTops.length === 3 && new Set(w.personTops).size === 3 && w.personHs.every((h) => h <= 22), theme + '/a ハイライトは3行', w);
				assert(Math.max(...w.ctrlTops) - Math.min(...w.ctrlTops) <= 2, theme + '/a 検索とボタンは1行', w.ctrlTops);
				assert(w.clipped.length === 0 && !w.bodyHs, theme + '/a 省略なし・横スクロールなし', w);
				assert(w.noteVisible && !w.btnVisible && w.noteText === NOTE, theme + '/a PC は注記をそのまま出す・「？」なし', w);
				assert(errs.length === 0, theme + '/a コンソールのエラー0', errs);
				await ctx.close();
			}
			const { ctx, page, errs } = await open(1280, 900, theme, 'ab');
			const w = await widthProbe(page);
			await shot(page, 'exam-1280-' + theme + '-ab-width');
			{ const pm = await probe(page); note('exam-1280-' + theme + '-ab', { drawerW: w.drawerW, tableW: w.tableW, atTop: pm.atTop, parts: pm.parts, statTops: w.statTops.length, clipped: w.clipped.length }); }
			assert(w.drawerW === 750 && w.tableW === 660, theme + '/ab 引き出し 750px・表 660px', w);
			assert(w.statTops.length === 1 && w.statH === 26, theme + '/ab 上の欄は1行', w);
			assert(w.setTops.length === 2 && w.setTops[0] === w.setTops[1], theme + '/ab 親Aと親Bが左右', w.setTops);
			assert(Math.max(...w.ctrlTops) - Math.min(...w.ctrlTops) <= 2, theme + '/ab 検索とボタンは1行', w.ctrlTops);
			assert(w.clipped.length === 0 && !w.bodyHs, theme + '/ab 省略なし・横スクロールなし', w);
			assert(w.noteVisible && !w.btnVisible, theme + '/ab PC は注記をそのまま出す', w);
			// 結合画像のタブは今の幅のまま
			await page.evaluate(() => { const t = document.getElementById('result-tab-stitch'); t.disabled = false; selectResultTab('stitch'); });
			const sw = await page.evaluate(() => Math.round(document.getElementById('result-drawer').getBoundingClientRect().width));
			assert(sw === 1100, theme + ' 結合画像のタブは 1100px のまま', sw);
			assert(errs.length === 0, theme + '/ab コンソールのエラー0', errs);
			await ctx.close();
		});

		await block('T100ヒートマップ exam ―― 目覚め系の注記 375×812（' + theme + '）: 画面に出ず「？」で開く・文は1字も同じ・外を押すと閉じる', async () => {
			for (const sets of ['a', 'ab']) {
				const { ctx, page, errs } = await open(375, 812, theme, sets);
				const w = await widthProbe(page);
				assert(!w.noteVisible && w.btnVisible, theme + '/' + sets + ' 注記は出さず「？」を出す', w);
				await page.click('#hl-note-btn');
				const o = await page.evaluate(() => {
					const n = document.getElementById('hl-note'), b = document.getElementById('hl-note-btn'), c = getComputedStyle(n);
					const rc = n.getBoundingClientRect();
					const top = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
					return { text: n.innerText, expanded: b.getAttribute('aria-expanded'), l: rc.left, r: rc.right, vw: innerWidth, fg: c.color, bg: c.backgroundColor, onTop: !!top && n.contains(top), h: Math.round(rc.height) };
				});
				await shot(page, 'exam-375-' + theme + '-' + sets + '-note');
				note('exam-375-' + theme + '-' + sets + '-note', { same: o.text === NOTE, h: o.h, ratio: Math.round(ratio(o.fg, o.bg) * 100) / 100 });
				assert(o.text === NOTE && o.expanded === 'true', theme + '/' + sets + ' 開いた文が元の注記と同じ', o);
				assert(o.onTop && o.l >= 0 && o.r <= o.vw, theme + '/' + sets + ' 小窓が画面の中で一番上に出る', o);
				assert(ratio(o.fg, o.bg) >= 4.5, theme + '/' + sets + ' 文字の比 4.5 以上', o);
				await page.mouse.click(180, 780);
				assert(await page.evaluate(() => getComputedStyle(document.getElementById('hl-note')).display === 'none' && document.getElementById('hl-note-btn').getAttribute('aria-expanded') === 'false'), theme + '/' + sets + ' 外を押すと閉じる');
				await page.click('#hl-note-btn');
				await page.keyboard.press('Escape');
				assert(await page.evaluate(() => getComputedStyle(document.getElementById('hl-note')).display === 'none' && !document.getElementById('result-drawer').hidden), theme + '/' + sets + ' Esc で小窓だけ閉じる');
				assert(errs.length === 0, theme + '/' + sets + ' コンソールのエラー0', errs);
				await ctx.close();
			}
		});
	}

	// ===== UmaStar（special.html）: 段2 のヒートマップ・見直し・幅の上限（決定 200〜204・215・219〜222・228・244）=====
	const STAR_PALETTE = {
		light: { empty: 'rgb(255, 253, 248)', s1: 'rgb(205, 238, 214)', s2: 'rgb(127, 211, 155)', s3: 'rgb(30, 127, 69)', unk: 'rgb(236, 231, 221)' },
		dark: { empty: 'rgb(38, 37, 35)', s1: 'rgb(31, 74, 48)', s2: 'rgb(63, 165, 102)', s3: 'rgb(141, 227, 169)', unk: 'rgb(52, 50, 46)' }
	};
	const openStar = async (width, height, theme, sets) => {
		const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
		// ②のスキルを入れた状態で開く（スキルの名前は一番長いものを含む40件）
		const master = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'uma-skill-deck-skills.json'), 'utf8')).skills;
		const longest = master.slice().sort((a, b) => b.name.length - a.name.length).slice(0, 5);
		const ids = longest.concat(master.filter((s) => !longest.includes(s)).slice(0, 35)).map((s) => String(s.id));
		const RACE = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/upcoming-races.json'), 'utf8')).races[0];
		await ctx.addInitScript(({ t, ids, RACE }) => { try { if (!sessionStorage.getItem('__t100')) {
			sessionStorage.setItem('__t100', '1'); localStorage.clear(); localStorage.setItem('uma-tools-theme', t);
			localStorage.setItem('umaSkillDeck:userData', JSON.stringify({ schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] }));
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ race: RACE, skillFilter: { style: 'sashi' } }));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		} } catch (e) {} }, { t: theme, ids, RACE });
		const page = await ctx.newPage();
		page.setDefaultTimeout(30000);
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		await page.goto(base + '/special.html', { waitUntil: 'load', timeout: 60000 });
		await page.waitForFunction(() => typeof deckMode !== 'undefined' && deckMode && skillList.length > 0, null, { timeout: 20000 });
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]').catch(() => {});
		await page.evaluate((sets) => {
			const mk = (p) => {
				const det = [], stars = {};
				skillList.forEach((n, r) => { const v = [0, 1, 2, 3][(r + p) % 4]; if (v) { det.push(n); stars[n] = v; } });
				return { detectedSkills: new Set(det), skillStars: stars, skillSources: {}, matchReasons: {} };
			};
			personResults = PERSON_LABELS.map(() => null);
			[0, 1, 2].forEach((i) => { personResults[i] = mk(i); });
			if (sets === 'ab') [3, 4, 5].forEach((i) => { personResults[i] = mk(i); });
			const unk = skillList.find((n) => personResults[1].detectedSkills.has(n));
			personResults[1].skillStars[unk] = null;
			renderResults();
			openDrawer('result');
		}, sets);
		await page.waitForTimeout(350);
		await page.mouse.move(0, 0);
		return { ctx, page, errs };
	};
	const starProbe = (page) => page.evaluate(() => {
		const r = (el) => el.getBoundingClientRect();
		const vis = (el) => !!el && el.getClientRects().length > 0;
		const q = (s) => document.querySelector(s);
		const drawer = q('#result-drawer'), body = drawer.querySelector('.uma-drawer-body'), table = drawer.querySelector('.result-table');
		const thead = table.querySelector('thead'), rows = [...table.querySelectorAll('tbody tr')], ths = [...thead.querySelectorAll('th')];
		body.scrollTop = 0;
		const b = r(body), top = Math.max(b.top, r(thead).bottom);
		const atTop = rows.filter((tr) => { const x = r(tr); return x.top >= top - 0.5 && x.bottom <= b.bottom + 0.5; }).length;
		const cell = (c) => { const td = table.querySelector('tbody td.' + c); if (!td) return null; const n = td.querySelector('.hm-num'), cs = getComputedStyle(td); return { bg: cs.backgroundColor, img: cs.backgroundImage, color: getComputedStyle(n).color, txt: n.textContent, numVisible: vis(n), starVisible: vis(td.querySelector('.hm-st')) }; };
		const tot = table.querySelector('tbody td.hm-total'), totCs = getComputedStyle(tot);
		const fonts = {};
		document.querySelectorAll('#result-wrap *').forEach((el) => {
			if (!vis(el) || el.closest('.copy-source-hidden')) return;
			if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.tagName !== 'INPUT') return;
			const k = getComputedStyle(el).fontSize; fonts[k] = (fonts[k] || 0) + 1;
		});
		const names = [...table.querySelectorAll('.result-skillname')];
		const statCells = [...document.querySelectorAll('#stat-grid > div')];
		const ctrl = ['.rc-srch', '.rc-pills', '#result-copy-slot'].map((s) => Math.round(r(document.querySelector('#result-drawer ' + s)).top));
		const tw = r(table).width, nw = r(ths[0]).width;
		return {
			drawerW: Math.round(r(drawer).width), tableW: Math.round(tw), atTop, rowH: [...new Set(rows.map((tr) => Math.round(r(tr).height * 10) / 10))],
			colsPct: (tw - nw) / tw * 100, heads: ths.map((th) => th.textContent), headOneLine: ths.every((th) => r(th).height < 32),
			statTops: [...new Set(statCells.map((d) => Math.round(r(d).top)))], statH: Math.round(r(q('#stat-grid')).height), statBg: statCells.slice(1).map((d) => getComputedStyle(d).backgroundColor),
			statFg: statCells.slice(1).map((d) => getComputedStyle(d.querySelector('p')).color),
			thBg: ths.slice(1, -1).map((th) => getComputedStyle(th).backgroundColor), ctrlTops: ctrl, ctrlH: Math.round(r(q('#result-ctrlbox')).height),
			bodyHs: body.scrollWidth > body.clientWidth, tblHs: table.parentElement.scrollWidth > table.parentElement.clientWidth + 1, pageHs: document.documentElement.scrollWidth > document.documentElement.clientWidth,
			clipped: names.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent), minNameW: Math.min(...names.map((e) => r(e).width)), nameFs: names.length ? parseFloat(getComputedStyle(names[0]).fontSize) : 0,
			nameRight: names.every((e) => r(e).right <= r(e.parentElement).right + 0.5 && r(e).left < r(e.parentElement).right && e.parentElement.scrollWidth <= e.parentElement.clientWidth + 1), longW: Math.round(r(names[0]).width),
			widest: Math.max(...names.map((e) => e.scrollWidth)),
			fonts, cells: { h0: cell('hm0'), h1: cell('hm1'), h2: cell('hm2'), h3: cell('hm3'), hu: cell('hmu') }, total: { bg: totCs.backgroundColor, color: totCs.color, fw: totCs.fontWeight, txt: tot.textContent },
			copy: document.getElementById('copy-data').value, highlight: !!q('#exam-highlight'), deckNote: vis(q('#deck-alpha-send-note')) ? Math.round(r(q('#deck-alpha-send-note')).height) : null,
		};
	});
	const starWant = (page) => page.evaluate(() => {
		const unk = skillList.find((n) => personResults[1].detectedSkills.has(n) && personResults[1].skillStars[n] === null);
		const used = activePersonIndexes();
		return skillList.map((n, r) => used.map((p) => { const v = [0, 1, 2, 3][(r + p) % 4]; return (!v || (p === 1 && n === unk)) ? '' : String(v); }).join('\t')).join('\n');
	});
	for (const theme of ['light', 'dark']) {
		await block('T100ヒートマップ special ―― 1280×900（' + theme + '）: 引き出しの幅・上の欄1行・検索とボタン1行・行の高さ・親Aと親Bの色・★の記号のまま', async () => {
			const C = COLORS[theme];
			for (const [sets, dw, tw] of [['a', 530, 480], ['ab', 750, 660]]) {
				const { ctx, page, errs } = await openStar(1280, 900, theme, sets);
				const m = await starProbe(page);
				await shot(page, 'star-1280-' + theme + '-' + sets);
				note('star-1280-' + theme + '-' + sets, { drawerW: m.drawerW, tableW: m.tableW, atTop: m.atTop, rowH: m.rowH, statH: m.statH, ctrlH: m.ctrlH, deck: m.deckNote, clipped: m.clipped.length });
				assert(m.drawerW === dw && m.tableW <= tw + 40, theme + '/' + sets + ' 引き出し ' + dw + 'px・表が基準の幅に近い', { d: m.drawerW, t: m.tableW });
				assert(m.statTops.length === 1 && m.statH <= 42, theme + '/' + sets + ' 上の欄は1本の帯（因子を含めているときは箱の中が2段）', { t: m.statTops, h: m.statH });
				const noFactorH = await page.evaluate(() => { const ps = [...document.querySelectorAll('#stat-grid p[id*="factor"]')]; ps.forEach((p) => { p.hidden = true; }); const h = Math.round(document.getElementById('stat-grid').getBoundingClientRect().height); ps.forEach((p) => { p.hidden = false; }); return h; });
				assert(noFactorH === 26, theme + '/' + sets + ' 因子が無いときの上の欄は 26px', noFactorH);
				assert(Math.max(...m.ctrlTops) - Math.min(...m.ctrlTops) <= 2 && m.ctrlH <= 28, theme + '/' + sets + ' 検索とボタンは1行', m.ctrlTops);
				assert(Math.max(...m.rowH) <= 22 && m.atTop >= 25, theme + '/' + sets + ' 1行 22px 以下・開いた直後に25行以上', { r: m.rowH, a: m.atTop });
				assert(m.clipped.length === 0 && !m.bodyHs && !m.tblHs && !m.pageHs, theme + '/' + sets + ' 名前の省略なし・横スクロールなし', m);
				assert(m.statBg.every((c) => c === 'rgba(0, 0, 0, 0)') && m.statFg[0] === C.aText && m.thBg[0] === C.aBg, theme + '/' + sets + ' 親Aの色（exam と同じ値）・上の欄は地なし', m);
				if (sets === 'ab') assert(m.statFg[3] === C.bText && m.thBg[3] === C.bBg, theme + ' 親Bの色（exam と同じ値）', m);
				assert(m.cells.h1.starVisible && !m.cells.h1.numVisible, theme + '/' + sets + ' PC は★の記号のまま', m.cells.h1);
				assert(!m.highlight, theme + '/' + sets + ' UmaStar にハイライトは無い');
				assert(m.copy === await starWant(page), theme + '/' + sets + ' コピーの中身');
				assert(errs.length === 0, theme + '/' + sets + ' コンソールのエラー0', errs);
				await ctx.close();
			}
		});
		await block('T100ヒートマップ special ―― 375×812（' + theme + '）: 緑の3段・数字・合計の列・4列で約 2/3・横スクロールなし・文字の大きさ', async () => {
			const P = STAR_PALETTE[theme];
			for (const sets of ['a', 'ab']) {
				const { ctx, page, errs } = await openStar(375, 812, theme, sets);
				const m = await starProbe(page);
				await shot(page, 'star-375-' + theme + '-' + sets);
				note('star-375-' + theme + '-' + sets, { atTop: m.atTop, rowH: m.rowH, colsPct: Math.round(m.colsPct * 10) / 10, statH: m.statH, ctrlH: m.ctrlH, deck: m.deckNote, fonts: m.fonts, longW: m.longW, nameFs: m.nameFs });
				const c = m.cells;
				assert(c.h1.bg === P.s1 && c.h2.bg === P.s2 && c.h3.bg === P.s3 && c.h0.bg === P.empty && c.hu.bg === P.unk, theme + '/' + sets + ' マスの地', c);
				assert(c.h1.txt === '1' && c.h2.txt === '2' && c.h3.txt === '3' && c.hu.txt === '?' && c.h1.numVisible && !c.h1.starVisible && /repeating-linear-gradient/.test(c.hu.img), theme + '/' + sets + ' 数字・★不明は斜線に「?」', c);
				const rs = [ratio(c.h1.color, c.h1.bg), ratio(c.h2.color, c.h2.bg), ratio(c.h3.color, c.h3.bg), ratio(c.hu.color, c.hu.bg), ratio(m.total.color, m.total.bg)];
				assert(rs.every((x) => x >= 4.5), theme + '/' + sets + ' 文字の比 4.5 以上', rs);
				assert(m.heads[m.heads.length - 1] === '★合計' && m.headOneLine, theme + '/' + sets + ' 合計の列・見出し1行', m.heads);
				assert(!m.bodyHs && !m.tblHs && !m.pageHs, theme + '/' + sets + ' 横スクロールなし', m);
				assert(m.statTops.length === 1, theme + '/' + sets + ' 上の欄は1行に', m.statTops);
				assert(m.nameRight, theme + '/' + sets + ' 名前のボタンが列の中に収まる（「…」だけにならない）', m.nameRight);
				assert(m.longW >= 7 * m.nameFs, theme + '/' + sets + ' 長い名前も7文字見える', { w: m.longW, fs: m.nameFs });
				assert(Object.keys(m.fonts).every((k) => ['10px', '11px', '13px'].includes(k)), theme + '/' + sets + ' 文字は 10・11・13px だけ', m.fonts);
				if (sets === 'a') assert(m.colsPct > 63 && m.colsPct < 70 && m.atTop >= 8, theme + '/a 人と合計の4列で約 2/3・開いた直後に8行以上', { p: m.colsPct, a: m.atTop });
				assert(m.copy === await starWant(page), theme + '/' + sets + ' コピーの中身');
				assert(errs.length === 0, theme + '/' + sets + ' コンソールのエラー0', errs);
				await ctx.close();
			}
		});
	}
	await block('T100ヒートマップ special ―― 360・320px は横スクロールなし、③のセットの枠は親A・親Bの変数', async () => {
		for (const w of [360, 320]) {
			const { ctx, page, errs } = await openStar(w, 700, 'light', 'ab');
			const m = await starProbe(page);
			assert(!m.bodyHs && !m.tblHs && !m.pageHs && m.headOneLine, w + 'px 横スクロールなし・見出し1行', m);
			assert(errs.length === 0, w + 'px コンソールのエラー0', errs);
			await ctx.close();
		}
		const { ctx, page } = await openStar(1280, 900, 'light', 'a');
		const p = await page.evaluate(() => { const e = document.querySelector('.upload-set-panel'); if (!e) return null; const c = getComputedStyle(e); return { bc: c.borderTopColor, bg: c.backgroundColor }; });
		assert(p && p.bc === 'rgb(208, 219, 234)', '③の親Aセットの枠は落ち着かせた色', p);
		await ctx.close();
	});
}
