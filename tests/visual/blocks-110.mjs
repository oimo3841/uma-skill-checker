// Deck α の方眼をさらに広げる（T102・2026-11-05・C-291）の検査。
// run-smoke.mjs の末尾から register110() で呼ばれる（塊の見出しはすべて「T102 Deck α 方眼の地」で始まる。`npm run test:visual -- --only=T102 Deck α 方眼の地` で回せる）。
//
// 決め（T102 の指示。おいもさん）:
//  - 色の付いていない地の所すべてに方眼を見せる。少なくとも: 列の見出し（キャラ名）・左上の「X人XX種」「最大」の欄・スキル名の列・★0 のマス・道具の行のボタンの地。
//  - 色の付いた帯（上段 #1b7756・下段 #0e4b2f）とヒートマップの塗りのあるマスは今のまま。
//  - 線の色は T101 の線（ライト #e6e9e4・ダーク #232a25）よりわずかに薄く。線の上の文字も 4.5 以上。
//  - 205: 線の上の補足の文字（ライト）はスマホ・PC とも #616863。
//  - 表の中の目はマスにそろったまま（縮小・拡大・スクロールのあと）。背景を持つ要素は増やしすぎない（T94 の惰性の検査のため。表の中で方眼を持つのは .vs・.vh・.vl・.vc の4つだけ）。
// 色は固定値で測る（変更前の線 ライト rgb(230,233,228)・ダーク rgb(35,42,37)、地 rgb(251,251,248)・rgb(20,24,21)）。方眼が見えるかは画面の画素で見る。
// T102_SHOTS=<フォルダ> を付けて回すと、各場面の画像と、道具の行・列の見出しの拡大（3倍）をそのフォルダに残す。
import fs from 'node:fs';
import path from 'node:path';

export async function register110(env) {
	const { block, assert, browser, base } = env;
	const SHOTS = process.env.T102_SHOTS || '';
	const GRID = { light: [234, 237, 232], dark: [32, 38, 33] };     // #eaede8・#202621
	const OLD = { light: [230, 233, 228], dark: [35, 42, 37] };      // T101 の線
	const PAPER = { light: [251, 251, 248], dark: [20, 24, 21] };
	const SUB = { light: 'rgb(97, 104, 99)', dark: 'rgb(154, 165, 158)' };
	const BAND_TOP = 'rgb(27, 119, 86)', BAND_BOTTOM = 'rgb(14, 75, 47)';
	const S1 = { light: 'rgb(203, 223, 211)', dark: 'rgb(34, 82, 56)' };
	const sizes = { 375: { width: 375, height: 812, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };
	const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

	for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
		await block('T102 Deck α 方眼の地 ―― 色の付いていない地の所に方眼が見え、目がマスにそろう（' + w + 'px・' + (theme === 'light' ? 'ライト' : 'ダーク') + '）', async () => {
			const sz = sizes[w]; const pc = w > 720; const tag = w + '/' + theme;
			const mk = (dsf) => browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: dsf, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: theme });
			const ctx = await mk(1);
			await ctx.addInitScript((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) { /* 自動 */ } }, theme);
			const page = await ctx.newPage();
			page.setDefaultTimeout(8000);
			const errs = [];
			page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
			page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
			const ev = (fn, arg) => page.evaluate(fn, arg);
			const wide = [];
			const ready = () => page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc && (document.querySelector('.vh, canvas.ov, .stage .empty')), null, { timeout: 15000 });
			const settle = () => ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
			const shot = async (name) => {
				const r = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
				if (r.sw > r.iw) wide.push(name + ':' + r.sw + '>' + r.iw);
				if (!SHOTS) return;
				fs.mkdirSync(SHOTS, { recursive: true });
				await page.screenshot({ path: path.join(SHOTS, name + '-' + w + '-' + theme + '.png') });
			};
			// 画面全体の画素を1枚読み、ページの中で表の各部の線を数える
			const measure = async () => {
				const b64 = (await page.screenshot()).toString('base64');
				return ev(async ({ b64, line }) => {
					const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
					const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
					const D = g.getImageData(0, 0, img.width, img.height).data;
					const on = (x, y) => { const i = (Math.round(y) * img.width + Math.round(x)) * 4; return Math.abs(D[i] - line[0]) <= 3 && Math.abs(D[i + 1] - line[1]) <= 3 && Math.abs(D[i + 2] - line[2]) <= 3; };
					const st = document.getElementById('stage'), sr = st.getBoundingClientRect(), vc = document.getElementById('vc').getBoundingClientRect(), vh = document.getElementById('vh').getBoundingClientRect(), vl = document.getElementById('vl').getBoundingClientRect();
					const half = window.__deckAlpha.S.lv === 2 ? 15 : 9;
					const R = { half, sl: st.scrollLeft, st: st.scrollTop };
					// 列の見出し: 列の左端の縦線・下の辺から数えた横線
					let vT = 0, vH = 0, hT = 0, hH = 0, hOff = 0, nTh = 0;
					const ths = [...document.querySelectorAll('.vh th[data-c]:not(.sA):not(.sB)')].map((t) => ({ r: t.getBoundingClientRect(), c: t.dataset.c })).filter((t) => t.r.left >= vc.right + 1 && t.r.right <= sr.right - 1 && t.r.top >= sr.top);
					for (const { r } of ths) {
						nTh++;
						for (let y = r.top; y < r.bottom - 32; y++) { vT++; if (on(r.left, y)) vH++; }
						for (let y = vh.bottom - half; y >= r.top + 1; y -= half) { if (y > r.bottom - 26) continue; hT++; if (on(r.left + 1, y)) hH++; if (on(r.left + 1, y + 1)) hOff++; }
					}
					R.head = { n: nTh, vert: vT ? +(vH / vT).toFixed(3) : 0, horiz: hT ? +(hH / hT).toFixed(3) : 0, horizOff: hT ? +(hOff / hT).toFixed(3) : 0 };
					// 列の見出しの線と本体の列がそろう（見出しの左端と同じ番号のマスの左端）
					R.colDiff = ths.map(({ r, c }) => { const td = document.querySelector('.vb td[data-c="' + c + '"]'); return td ? Math.abs(td.getBoundingClientRect().left - r.left) : 0; }).reduce((a, b) => Math.max(a, b), 0);
					// スキル名の列: 行の上の横線・右の辺から数えた縦線
					let lT = 0, lH = 0, xT = 0, xH = 0, xOff = 0, nRow = 0;
					const names = [...document.querySelectorAll('.vl th[data-r], .vl th.gl')].map((t) => ({ r: t.getBoundingClientRect(), k: t.dataset.r, g: t.dataset.gr })).filter((t) => t.r.top >= vc.bottom + 1 && t.r.bottom <= sr.bottom - 1 && t.r.left >= sr.left - 1);
					for (const { r } of names) {
						nRow++;
						for (let x = r.left + 8; x < r.right; x++) { lT++; if (on(x, r.top)) lH++; }
						for (let x = vl.right - half; x > r.left + 2; x -= half) { if (x >= r.right - 1) continue; for (let y = r.top + 1; y < r.bottom - 2; y++) { xT++; if (on(x, y)) xH++; if (on(x + 1, y)) xOff++; } }
					}
					R.name = { n: nRow, top: lT ? +(lH / lT).toFixed(3) : 0, vert: xT ? +(xH / xT).toFixed(3) : 0, vertOff: xT ? +(xOff / xT).toFixed(3) : 0 };
					R.rowDiff = names.map(({ r, k, g }) => { const td = document.querySelector(k != null ? '.vb td[data-r="' + k + '"]' : '.vb td[data-g="' + g + '"]'); return td ? Math.abs(td.getBoundingClientRect().top - r.top) : 0; }).reduce((a, b) => Math.max(a, b), 0);
					// 左上の角: 下の辺と右の辺から数えた線
					let cT = 0, cH = 0, cOff = 0;
					for (let y = vc.bottom - half; y > vc.top + 1; y -= half) for (let x = vc.left + 1; x < vc.right - 1; x++) { cT++; if (on(x, y)) cH++; if (on(x, y + 1)) cOff++; }
					R.corner = { line: cT ? +(cH / cT).toFixed(3) : 0, off: cT ? +(cOff / cT).toFixed(3) : 0 };
					// ★0 の「最大」と ★0 のマス: 上の辺の線
					const edge = (sel) => { let t = 0, h = 0; for (const e of document.querySelectorAll(sel)) { const r = e.getBoundingClientRect(); if (r.top < vc.bottom + 1 || r.bottom > sr.bottom - 1 || r.left < (sel.includes('.vb') ? vc.right + 1 : sr.left - 1) || r.right > sr.right - 1) continue; for (let x = r.left + 2; x < r.right - 1; x++) { t++; if (on(x, r.top)) h++; } } return { n: t, share: t ? +(h / t).toFixed(3) : 0 }; };
					R.mx0 = edge('.vl th.mx.c0'); R.td0 = edge('.vb td.c0:not(.unk):not(.off)');
					// 部品の面に線が見えるか（文字のない所も文字の間も数える）
					const face = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); let t = 0, h = 0; for (let y = Math.ceil(r.top) + 1; y < r.bottom - 1 && y < img.height; y++) for (let x = Math.ceil(r.left) + 1; x < r.right - 1 && x < img.width; x++) { t++; if (on(x, y)) h++; } return t ? +(h / t).toFixed(3) : 0; });
					R.tabsOff = face('.tb .tab[aria-pressed="false"]'); R.moreSp = face('#moreBtn');
					R.paneOff = face('#panes .tag[aria-pressed="false"], #panes .seg button[aria-pressed="false"], #panes select.sel');
					// 表の中で方眼を持つ要素の数（増やしすぎない）
					R.holders = [...document.querySelectorAll('#stage *')].filter((e) => /linear-gradient/.test(getComputedStyle(e).backgroundImage) && !e.matches('td.unk')).map((e) => e.className.replace(/\s+/g, '.'));
					return R;
				}, { b64, line: GRID[theme] });
			};
			const checkTable = async (label, n) => {
				const m = await measure();
				assert(m.head.n > 0 && m.head.vert >= 0.7 && m.head.horiz >= 0.7 && m.head.horizOff <= m.head.horiz * 0.5, tag + ' ' + label + ': 列の見出しの地に方眼が見え、縦線は列の左端にそろう', m.head);
				assert(m.colDiff === 0, tag + ' ' + label + ': 列の見出しと本体の列の左端が同じ（方眼の目が続く）', m.colDiff);
				assert(m.name.n > 0 && m.name.top >= 0.7 && m.name.vert >= 0.2 && m.name.vertOff <= m.name.vert * 0.7, tag + ' ' + label + ': スキル名の列の地に方眼が見え、横線は行の上の辺にそろう', m.name);
				assert(m.rowDiff === 0, tag + ' ' + label + ': スキル名の行と本体の行の上の辺が同じ', m.rowDiff);
				assert(m.corner.line >= 0.45 && m.corner.off <= m.corner.line * 0.6, tag + ' ' + label + ': 左上の「X人XX種」「最大」の欄の地に方眼が見える', m.corner);
				assert(m.td0.n > 0 && m.td0.share >= 0.8, tag + ' ' + label + ': ★0 のマスに方眼が見える', m.td0);
				assert(m.mx0.n === 0 || m.mx0.share >= 0.8, tag + ' ' + label + ': ★0 の「最大」の欄に方眼が見える', m.mx0);
				assert(m.holders.length === 4 && m.holders.includes('vs') && m.holders.includes('vp.vh') && m.holders.includes('vp.vl') && m.holders.includes('vp.vc'), tag + ' ' + label + ': 表の中で方眼を持つのは入れ物・見出し・名前の列・角の4つだけ（マスごとに持たない）', m.holders);
				return m;
			};

			for (const n of [3, 30]) {
				await page.goto(base + '/deck-alpha.html'); await ready();
				await page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
				await ev(async (k) => { const m = window.__deckAlphaMock.makeMock(k, 11); delete m.none; await window.DeckAlpha.store.replaceAll(m); await window.DeckAlpha.store.putMeta('settings', Object.assign({}, window.DeckAlpha.DEFAULT_SETTINGS)); }, n);
				await page.reload(); await ready(); await page.waitForTimeout(n > 10 ? 2400 : 600);
				await page.waitForFunction(() => document.getElementById('toast').hidden, null, { timeout: 8000 }).catch(() => {});
				for (const lv of [1, 2]) {
					await ev((l) => document.querySelector('[data-lv="' + l + '"]').click(), lv); await settle(); await page.waitForTimeout(100);
					const m = await checkTable('親' + n + '人・' + (lv === 1 ? '縮小' : '拡大'), n);
					if (lv === 1 && n === 3) {
						if (!pc) assert(m.tabsOff.length === 5 && m.tabsOff.every((s) => s >= 0.08) && m.moreSp[0] >= 0.08, tag + ' 道具の行のボタン（親(列)〜「⋯」）の面に方眼が見える', { tabs: m.tabsOff, more: m.moreSp });
						if (pc) assert(m.paneOff.length > 5 && m.paneOff.every((s) => s >= 0.06), tag + ' 左の列の選んでいない部品の面に方眼が見える', m.paneOff);
					}
					// ★0 の「最大」の欄（作り物のデータに無いので、1つの欄を ★0 の形にして画素を読み、描き直して戻す）
					if (n === 3) {
						await ev(() => { const t = document.querySelectorAll('.vl th.mx:not(.off)')[2]; t.className = 'mx c0'; t.textContent = ''; });
						const z = await measure();
						assert(z.mx0.n > 0 && z.mx0.share >= 0.8, tag + ' 親3人・' + (lv === 1 ? '縮小' : '拡大') + ': ★0 の「最大」の欄に方眼が見える', z.mx0);
						await ev(() => window.__deckAlpha.draw()); await settle();
					}
					await shot((lv === 1 ? '01-table-' : '02-table-lv2-') + n);
				}
				// スクロールのあとも目がそろう（半端な量を送る）
				if (n === 30) for (const lv of [1, 2]) {
					await ev((l) => document.querySelector('[data-lv="' + l + '"]').click(), lv); await settle();
					await ev(() => { const s = document.getElementById('stage'); s.scrollLeft = Math.min(37, s.scrollWidth - s.clientWidth); s.scrollTop = 53; s.dispatchEvent(new Event('scroll')); });
					await settle(); await page.waitForTimeout(150);
					const m = await checkTable('親30人・' + (lv === 1 ? '縮小' : '拡大') + '・スクロールのあと', n);
					assert(m.st === 53, tag + ' 縦にスクロールできた', m.st);
					// スクロールしても本体が見出しの下から透けない（見出し・名前の列・角は不透明の地）
					const op = await ev(() => ['vh', 'vl', 'vc'].map((k) => getComputedStyle(document.getElementById(k)).backgroundColor));
					assert(op.every((c) => c === 'rgb(' + PAPER[theme].join(', ') + ')'), tag + ' 見出し・名前の列・角は不透明の地を持つ（本体が透けない）', op);
					await shot('03-scrolled-lv' + lv);
					await ev(() => { const s = document.getElementById('stage'); s.scrollLeft = 0; s.scrollTop = 0; s.dispatchEvent(new Event('scroll')); });
				}
				await ev(() => document.querySelector('[data-lv="1"]').click()); await settle();
			}

			// 線の色: T101 の線よりわずかに薄く（地との差が小さい）。どこも同じ色
			const col = await ev(() => { const c = (e) => (/rgb\(\d+, \d+, \d+\)/.exec(getComputedStyle(e).backgroundImage) || [])[0]; return ['body', '.vs', '#vh', '#vl', '#vc', '#stage'].map((s) => c(document.querySelector(s))); });
			const want = 'rgb(' + GRID[theme].join(', ') + ')';
			assert(col.every((c) => c === want), tag + ' 方眼の線の色はどこも ' + want, col);
			assert(ratio(GRID[theme], PAPER[theme]) < ratio(OLD[theme], PAPER[theme]) && ratio(GRID[theme], PAPER[theme]) > 1.1, tag + ' 線は T101 の線より地との差がわずかに小さい（' + ratio(OLD[theme], PAPER[theme]).toFixed(3) + ' → ' + ratio(GRID[theme], PAPER[theme]).toFixed(3) + '）', null);

			// 文字のコントラスト（地と線のどちらに対しても 4.5 以上）・205 の補足の文字の色
			const texts = await ev(() => {
				const seen = {}; const add = (e, k) => { if (e) seen[k] = getComputedStyle(e).color; };
				add(document.querySelector('.vc .cnt'), '角の数'); add(document.querySelector('.vc button'), '最大'); add(document.querySelector('.vh th:not(.sA):not(.sB) .vt'), 'キャラ名'); add(document.querySelector('.vh th:not(.sA):not(.sB) .cn'), '列の数');
				add(document.querySelector('.vl th[data-r]'), 'スキル名'); add(document.querySelector('.vl th.gl:not(.off)'), '遺伝子の行'); add(document.querySelector('.vl th.mx.c0'), '最大の0'); add(document.querySelector('.vb td.c0'), '★0'); add(document.querySelector('.tb .tab'), '道具の行'); add(document.getElementById('moreBtn'), '⋯');
				return { seen, sub: getComputedStyle(document.documentElement).getPropertyValue('--gp-sub').trim() };
			});
			const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
			const low = Object.entries(texts.seen).filter(([k, c]) => !(pc && (k === '道具の行' || k === '⋯'))).map(([k, c]) => [k, c, Math.min(ratio(rgb(c), GRID[theme]), ratio(rgb(c), PAPER[theme])).toFixed(2)]).filter((x) => +x[2] < 4.5);
			assert(Object.keys(texts.seen).length >= 8 && low.length === 0, tag + ' 方眼の上の文字は地と線のどちらに対しても 4.5 以上', { low, seen: texts.seen });
			const subSeen = await ev(() => { const d = document.createElement('i'); d.style.color = 'var(--gp-sub)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
			assert(subSeen === SUB[theme], tag + ' 補足の文字の色は ' + SUB[theme] + '（205。スマホ・PC とも同じ）', subSeen);

			// 色の付いた帯とヒートマップの塗りは今のまま・選択中の塗りは緑でない
			const keep = await ev(() => { const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; }; return { hd: cs('.hd').backgroundColor, hdImg: cs('.hd').backgroundImage, dock: cs('.dock').backgroundColor, dockImg: cs('.dock').backgroundImage, c1: cs('.vb td.c1:not(.unk)') && cs('.vb td.c1:not(.unk)').backgroundColor, c1Img: cs('.vb td.c1:not(.unk)') && cs('.vb td.c1:not(.unk)').backgroundImage }; });
			assert(keep.hd === BAND_TOP && keep.hdImg === 'none' && keep.dock === BAND_BOTTOM && keep.dockImg === 'none', tag + ' 上段と下段の帯は今の色のまま（方眼なし）', keep);
			assert(keep.c1 === S1[theme] && keep.c1Img === 'none', tag + ' 塗りのあるマスは今のまま（方眼なし）', keep);
			// 引き出しの部品: 選んでいない部品は面に方眼・選んだ部品は塗り
			if (!pc) await page.tap('[data-tab="view"]');
			await page.waitForTimeout(100);
			const m2 = await measure();
			assert(m2.paneOff.length >= 3 && m2.paneOff.every((s) => s >= 0.06), tag + ' 引き出しの選んでいない部品の面に方眼が見える', m2.paneOff);
			const sel = await ev(() => { const e = document.querySelector('#panes .seg button[aria-pressed="true"]'); return { bg: getComputedStyle(e).backgroundColor, tab: (() => { const t = document.querySelector('.tb .tab[aria-pressed="true"]'); return t ? getComputedStyle(t).backgroundColor : null; })(), selBg: (() => { const d = document.createElement('i'); d.style.color = 'var(--gp-sel)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })(), optBg: getComputedStyle(document.querySelector('#cs option')).backgroundColor, sel: getComputedStyle(document.getElementById('cs')).backgroundColor }; });
			assert(sel.bg === sel.selBg && (pc || sel.tab === sel.selBg), tag + ' 選んだ部品と引き出しのタブは今の塗り（黒／白）', sel);
			assert(sel.optBg === 'rgb(' + PAPER[theme].join(', ') + ')' && /rgba\(0, 0, 0, 0\)|transparent/.test(sel.sel), tag + ' 並びの選択の欄は地が透明で、開いた一覧の行は地の色', sel);
			await shot('04-pane-open');
			if (!pc) await page.tap('[data-tab="view"]');

			assert(errs.length === 0, tag + ' コンソールのエラーが無い', errs);
			assert(wide.length === 0, tag + ' どの場面も横スクロールが無い', wide);
			await ctx.close();

			// 拡大の画像（3倍。道具の行と列の見出し）
			if (SHOTS) {
				const c3 = await mk(3);
				await c3.addInitScript((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) { /* 自動 */ } }, theme);
				const p3 = await c3.newPage();
				await p3.goto(base + '/deck-alpha.html');
				await p3.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc, null, { timeout: 15000 });
				await p3.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
				await p3.evaluate(async (k) => { const m = window.__deckAlphaMock.makeMock(k, 11); delete m.none; await window.DeckAlpha.store.replaceAll(m); await window.DeckAlpha.store.putMeta('settings', Object.assign({}, window.DeckAlpha.DEFAULT_SETTINGS)); }, 30);
				await p3.reload();
				await p3.waitForFunction(() => document.querySelector('.vh'), null, { timeout: 15000 });
				await p3.waitForTimeout(2400);
				await p3.waitForFunction(() => document.getElementById('toast').hidden, null, { timeout: 8000 }).catch(() => {});
				const rc = await p3.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(), t = document.querySelector('.tb').getBoundingClientRect(); return { sx: r.x, sy: r.y, tx: t.x, ty: t.y, tw: t.width, th: t.height, visible: t.height > 0 }; });
				if (rc.visible) await p3.screenshot({ path: path.join(SHOTS, '05-toolrow-zoom-' + w + '-' + theme + '.png'), clip: { x: rc.tx, y: rc.ty, width: rc.tw, height: rc.th } });
				await p3.screenshot({ path: path.join(SHOTS, '06-header-zoom-' + w + '-' + theme + '.png'), clip: { x: rc.sx, y: rc.sy, width: Math.min(375, sz.width - rc.sx), height: 260 } });
				await c3.close();
			}
		});
	}
}
