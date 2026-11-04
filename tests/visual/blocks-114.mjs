// 照合結果のスマホのヒートマップ（T100・C-290・2026-11-05）の検査。
// run-smoke.mjs の末尾から register114() で呼ばれる（塊の見出しはすべて「T100ヒートマップ」で始まる。`npm run test:visual -- --only=T100ヒートマップ` で回す）。
//
// 決め（T100。おいもさん）:
//  - 640px 未満の新UIの引き出しだけ、人のマスを★の数で塗り数字を出す（★の記号は出さない）。未検出は塗りなし、★不明は斜線に「?」。
//  - 表: 人3人＋合計の4列で約 2/3、スキル名の列で約 1/3。列が7つでも横スクロールなし・見出しは1行・スキル名の列に7文字以上。
//  - 合計の列はスマホでも出す（見出しは PC と同じ文）。人のマスとは塗りで見分ける。
//  - 親Bセットのマスも青の3段（見出しは今の赤・境は赤い線）。ハイライトは人ごとに1行。横スクロールの注記はスマホでは出さない。
//  - 文字は 13px と 11px（列が5つ以上の表だけ 10px）。PC（640px 以上）は今のまま。
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
			refreshDeckHandoffState();
			openDrawer('result');
			return { unk };
		}, sets);
		await page.waitForTimeout(350);
		await page.mouse.move(0, 0);
		return { ctx, page, errs, fix };
	};
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
			parts: { deckBtn: h(q('#deck-handoff-btn')), stat: h(q('#stat-grid')), search: h(q('#table-search')), filter: h(q('#filter-all')), copy: h(q('#result-copy-btn')), thead: h(thead) },
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
			assert(m.colWidths.length === 7 && m.colWidths.slice(0, 6).every((x) => x === 30) && m.colWidths[6] === 34 && !m.overflow, theme + ' 7列が狭い列で横スクロールなし', { w: m.colWidths, o: m.overflow });
			assert(m.heads.every((x) => x.fits && x.oneLine && x.fs === '10px'), theme + ' 見出しが 10px で1行に収まる', m.heads);
			assert(m.minVisible >= 7, theme + ' スキル名の列に7文字以上見える', m.minVisible);
			checkCells(theme, m, theme);
			const P = PALETTE[theme];
			assert([P.empty, P.s1, P.s2, P.s3, P.unk].includes(m.bdBg), theme + ' 親Bのマスも青の3段', m.bdBg);
			const red = theme === 'light' ? 'rgb(252, 165, 165)' : 'rgb(163, 71, 77)';
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

	await block('T100ヒートマップ exam ―― PC（640px・1280px）は今のまま: ★の記号・数字なし・表の幅の指定・注記あり。コピーの中身は人の順に★の数', async () => {
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
}
