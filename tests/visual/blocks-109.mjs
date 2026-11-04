// Deck α の方眼の範囲と見出しのボタン（T101・2026-11-05）の検査。
// run-smoke.mjs の末尾から register109() で呼ばれる（塊の見出しはすべて「T101 Deck α 方眼の範囲」で始まる。`npm run test:visual -- --only=T101 Deck α 方眼の範囲` で回せる）。
//
// 決め（T101 の指示。おいもさん）:
//  - 方眼を、表の画面の中央の領域（道具の行の下から下段の帯の上まで・左右いっぱい）の全体に敷く。表の外（右・下の空き）にも方眼が出て、単色の地の所が無い。
//    スマホ・PC、ライト・ダーク、親が少ない（3人）ときも多い（30人）ときも。
//  - 方眼の目は表のマスにそろえたまま（T94 の基準。縮小 9px・拡大 15px の 2×2 の目）。スクロールしたあとも、マスと目がずれない。
//  - 194: 方眼の線の色は T97 の前（ライト #e6e9e4・ダーク #232a25）→ T102 でわずかに薄く（ライト #eaede8・ダーク #202621）。線の上の補足の文字のコントラストは 4.5 以上（blocks-107 の (8) が見る）。
//  - 193: スマホで引き出しが開いているとき、見出しの帯のボタン（レース/周回セット・ツール切り替え・ライト／ダーク）と道具の行の「⋯」は1回の押しで効く。
//    表のマスなどは今までどおり「閉じるだけ」（blocks-107 の (9) が見る）。
// 色は固定値（T97 の前の値）で測る。方眼が出ているかは画面の画素で見る（表の外の空きを 20px 角に区切り、どの角にも線の色の画素がある）。
// T101_SHOTS=<フォルダ> を付けて回すと、各場面の画像をそのフォルダに残す。
import fs from 'node:fs';
import path from 'node:path';

export async function register109(env) {
	const { block, assert, browser, base } = env;
	const SHOTS = process.env.T101_SHOTS || '';
	// 方眼の線の色（T102 の値）と地の色
	const GRID = { light: [234, 237, 232], dark: [32, 38, 33] };
	const PAPER = { light: [251, 251, 248], dark: [20, 24, 21] };
	const sizes = { 375: { width: 375, height: 812, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };

	for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
		await block('T101 Deck α 方眼の範囲 ―― 中央の領域の全体に方眼・目が表のマスにそろう・線の色' + (w === 375 ? '・見出しのボタンが1回で効く' : '') + '（' + w + 'px・' + (theme === 'light' ? 'ライト' : 'ダーク') + '）', async () => {
			const sz = sizes[w]; const pc = w > 720; const tag = w + '/' + theme;
			const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: 1, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: theme });
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
			const closeSheet = async () => { if (await page.isVisible('#sheet')) { await ev(() => document.getElementById('scrim').click()); await page.waitForTimeout(100); } };
			// 画面の画素を読む（スクリーンショットをページの canvas に描いて、指定の矩形の RGB を返す）
			const pixels = async (rc) => {
				const buf = await page.screenshot({ clip: { x: rc.x, y: rc.y, width: rc.w, height: rc.h } });
				return ev(async (b64) => {
					const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
					const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
					return { w: img.width, h: img.height, d: Array.from(g.getImageData(0, 0, img.width, img.height).data) };
				}, buf.toString('base64'));
			};
			const near = (d, i, c, tol = 3) => Math.abs(d[i] - c[0]) <= tol && Math.abs(d[i + 1] - c[1]) <= tol && Math.abs(d[i + 2] - c[2]) <= tol;
			const geom = () => ev(() => {
				const st = document.getElementById('stage'), vs = st.querySelector('.vs'), sr = st.getBoundingClientRect();
				if (!vs) return null;
				const vr = vs.getBoundingClientRect(), cs = getComputedStyle(vs), gp = /^([-\d.]+)px ([-\d.]+)px/.exec(cs.backgroundPosition) || [];
				const tw = parseFloat(vs.style.width), th = parseFloat(vs.style.height);
				return { stage: { x: sr.x + st.clientLeft, y: sr.y + st.clientTop, w: st.clientWidth, h: st.clientHeight }, vs: { x: vr.x, y: vr.y, w: vr.width, h: vr.height }, table: { w: tw, h: th }, gp: [+gp[1], +gp[2]], size: cs.backgroundSize, lv: window.__deckAlpha.S.lv, sl: st.scrollLeft, st: st.scrollTop };
			});
			// 表の外の空き（右・下）を 20px 角に区切り、どの角にも方眼の線の色の画素があるか（単色の地の所が無いか）
			const emptyGrid = async (g) => {
				const out = { checked: 0, blank: [], lineShare: 0 };
				const right = g.vs.x + g.table.w, bottom = g.vs.y + g.table.h;
				const sx1 = g.stage.x + g.stage.w, sy1 = g.stage.y + g.stage.h;
				const rects = [];
				if (sx1 - right >= 24) rects.push({ x: Math.ceil(right) + 2, y: Math.ceil(g.stage.y) + 2, w: Math.floor(sx1 - right) - 4, h: Math.floor(g.stage.h) - 4 });
				if (sy1 - bottom >= 24) rects.push({ x: Math.ceil(g.stage.x) + 2, y: Math.ceil(bottom) + 2, w: Math.floor(g.stage.w) - 4, h: Math.floor(sy1 - bottom) - 4 });
				let line = 0, all = 0;
				for (const rc of rects) {
					const p = await pixels(rc);
					for (let by = 0; by + 20 <= p.h; by += 20) for (let bx = 0; bx + 20 <= p.w; bx += 20) {
						let hit = 0, other = 0;
						for (let y = by; y < by + 20; y++) for (let x = bx; x < bx + 20; x++) { const i = (y * p.w + x) * 4; all++; if (near(p.d, i, GRID[theme])) { hit++; line++; } else if (!near(p.d, i, PAPER[theme])) other++; }
						out.checked++;
						if (!hit) out.blank.push([rc.x + bx, rc.y + by, other]);
					}
				}
				out.rects = rects.length; out.lineShare = all ? +(line / all).toFixed(3) : 0;
				return out;
			};
			// 目が表のマスにそろう: 見えている空のマス（c0）の左上の角の画素が線の色・マスの半分の位置にも線がある
			const aligned = async () => {
				const g = await geom();
				const cells = await ev(() => {
					const st = document.getElementById('stage').getBoundingClientRect(), vc = document.getElementById('vc').getBoundingClientRect(), vh = document.getElementById('vh').getBoundingClientRect();
					const top = Math.max(st.top, vc.bottom, vh.bottom) + 2, left = Math.max(st.left, vc.right) + 2;
					return [...document.querySelectorAll('.vb td.c0:not(.unk):not(.off)')].map((t) => { const r = t.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, txt: t.textContent.trim() }; })
						.filter((r) => r.x >= left && r.y >= top && r.x + r.w <= st.right - 2 && r.y + r.h <= st.bottom - 2).slice(0, 6);
				});
				const half = g.lv === 2 ? 15 : 9, res = [];
				for (const c of cells) {
					const p = await pixels({ x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) });
					// 左の縦線（x=0）・上の横線（y=0）・真ん中の縦線（x=half）・真ん中の横線（y=half）を、文字に掛からない端の1点ずつで見る
					const at = (x, y) => near(p.d, (y * p.w + x) * 4, GRID[theme]);
					const ok = at(0, p.h - 2) && at(p.w - 2, 0) && at(half, p.h - 2) && at(p.w - 2, half) && !at(1, p.h - 2) && !at(p.w - 2, 1);
					res.push({ x: c.x, y: c.y, ok, offX: ((c.x - g.vs.x - g.gp[0]) % half + half) % half, offY: ((c.y - g.vs.y - g.gp[1]) % half + half) % half });
				}
				return { g, res };
			};

			for (const n of [3, 30]) {
				await page.goto(base + '/deck-alpha.html'); await ready();
				await page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
				await ev(async (k) => { const m = window.__deckAlphaMock.makeMock(k, 11); delete m.none; await window.DeckAlpha.store.replaceAll(m); await window.DeckAlpha.store.putMeta('settings', Object.assign({}, window.DeckAlpha.DEFAULT_SETTINGS)); }, n);
				await page.reload(); await ready(); await page.waitForTimeout(n > 10 ? 2400 : 600);
				// 読み込みのあとの知らせ（下の黒い帯）が消えてから画素を読む（知らせが空きに重なると「方眼が無い」に見える）
				await page.waitForFunction(() => document.getElementById('toast').hidden, null, { timeout: 8000 }).catch(() => {});
				for (const lv of [1, 2]) {
					await ev((l) => document.querySelector('[data-lv="' + l + '"]').click(), lv); await settle(); await page.waitForTimeout(100);
					const g = await geom();
					const lvName = lv === 1 ? '縮小' : '拡大';
					// (1) 表の入れ物が中央の領域いっぱいに広がり、方眼を持つ。目の起点は本体の左上
					const cover = g && g.vs.x <= g.stage.x + 0.5 && g.vs.y <= g.stage.y + 0.5 && g.vs.x + g.vs.w >= g.stage.x + g.stage.w - 0.5 && g.vs.y + g.vs.h >= g.stage.y + g.stage.h - 0.5;
					const wantSize = lv === 1 ? '9px 9px, 9px 9px' : '15px 15px, 15px 15px';
					assert(cover && g.size === wantSize && [76, 100, 128, 136, 158, 214].includes(g.gp[0]) && [76, 136].includes(g.gp[1]), tag + ' 親' + n + '人・' + lvName + ': 表の入れ物が中央の領域いっぱいに広がり、マスの 2×2 の目（' + (lv === 1 ? 9 : 15) + 'px）の方眼を持つ', g);
					// (2) 表の外の空きに方眼が出ていて、単色の地の所が無い
					const e = await emptyGrid(g);
					const hasEmpty = g.table.w < g.stage.w - 24 || g.table.h < g.stage.h - 24; // 表の外に空きがあるはずのとき（親3人は必ず右に空きがある）
					assert(e.blank.length === 0 && (!hasEmpty || e.checked > 0) && (n !== 3 || e.checked > 0) && (e.checked === 0 || e.lineShare > 0.1), tag + ' 親' + n + '人・' + lvName + ': 表の外の空き（' + e.checked + ' 区画）のどこにも方眼が出ている（単色の地の所が無い）', e);
					// (3) 目がマスにそろう（スクロールの前）
					const a0 = await aligned();
					assert(a0.res.length > 0 && a0.res.every((r) => r.ok && r.offX === 0 && r.offY === 0), tag + ' 親' + n + '人・' + lvName + ': 方眼の目が表のマスにそろう', a0.res);
					if (lv === 1) await shot('01-table-' + n);
					if (lv === 2) await shot('02-table-lv2-' + n);
				}
				// (4) スクロールしたあとも目がマスにそろう（半端な量を送る）
				if (n === 30) for (const lv of [1, 2]) {
					await ev((l) => document.querySelector('[data-lv="' + l + '"]').click(), lv); await settle();
					await ev(() => { const s = document.getElementById('stage'); s.scrollLeft = Math.min(37, s.scrollWidth - s.clientWidth); s.scrollTop = 53; s.dispatchEvent(new Event('scroll')); });
					await settle(); await page.waitForTimeout(150);
					const a = await aligned();
					assert(a.g.sl > 0 || pc && a.g.sl === 0, tag + ' スクロールできた', { sl: a.g.sl, st: a.g.st });
					assert(a.g.st === 53 && a.res.length > 0 && a.res.every((r) => r.ok && r.offX === 0 && r.offY === 0), tag + ' 親30人・' + (lv === 1 ? '縮小' : '拡大') + ': スクロールしたあとも方眼の目が表のマスにそろう（左 ' + a.g.sl + 'px・上 ' + a.g.st + 'px）', a.res);
					await shot('03-scrolled-lv' + lv);
					await ev(() => { const s = document.getElementById('stage'); s.scrollLeft = 0; s.scrollTop = 0; s.dispatchEvent(new Event('scroll')); });
				}
				await ev(() => document.querySelector('[data-lv="1"]').click()); await settle();
			}

			// (5) 「全体」の図と、表の無いときも中央の領域に方眼（ページの地と同じ 10px の目）
			const ov = await ev(() => { document.querySelector('[data-lv="0"]').click(); const s = getComputedStyle(document.getElementById('stage')); return { img: /linear-gradient/.test(s.backgroundImage), size: s.backgroundSize, att: s.backgroundAttachment, col: (/rgb\(\d+, \d+, \d+\)/.exec(s.backgroundImage) || [])[0] }; });
			assert(ov.img && ov.size === '10px 10px, 10px 10px' && /local/.test(ov.att) && ov.col === 'rgb(' + GRID[theme].join(', ') + ')', tag + ' 「全体」の図のときも中央の領域は 10px の方眼（線は T102 の色）', ov);
			await ev(() => document.querySelector('[data-lv="1"]').click()); await settle();

			// (6) 線の色（194）: T97 の前の色。表の方眼もページの地も同じ
			const col = await ev(() => { const c = (e) => (/rgb\(\d+, \d+, \d+\)/.exec(getComputedStyle(e).backgroundImage) || [])[0]; return { body: c(document.body), vs: c(document.querySelector('.vs')), stage: c(document.getElementById('stage')) }; });
			const want = 'rgb(' + GRID[theme].join(', ') + ')';
			assert(col.body === want && col.vs === want && col.stage === want, tag + ' 方眼の線の色は T102 の色（' + (theme === 'light' ? '#eaede8' : '#202621') + '）', col);

			// (7) 見出しのボタン（193）: スマホで引き出しが開いているとき、1回の押しで効く。引き出しは開いたまま
			if (!pc) {
				const state = () => ev(() => ({ pane: window.__deckAlpha.S.pane, sheet: !document.getElementById('sheet').hidden, title: (document.getElementById('sheetTitle') || {}).textContent || '', theme: document.documentElement.getAttribute('data-theme') }));
				for (const k of ['parent', 'skill', 'view', 'sort', 'plan']) {
					await page.tap('[data-tab="' + k + '"]'); await page.waitForTimeout(80);
					const r = {};
					await page.tap('#setBtn'); await page.waitForTimeout(150); r.set = await state(); await closeSheet();
					await page.tap('#toolBtn'); await page.waitForTimeout(150); r.tool = await state(); await closeSheet();
					await page.tap('#moreBtn'); await page.waitForTimeout(150); r.more = await state(); await closeSheet();
					await page.tap('#themeBtn'); await page.waitForTimeout(200); r.theme = await state();
					if (k === 'view') await shot('04-header-theme-with-pane');
					await page.tap('#themeBtn'); await page.waitForTimeout(200); r.theme2 = await state();
					const after = await state();
					assert(r.set.sheet && r.set.pane === k && /レース|セット/.test(r.set.title), tag + ' 「' + k + '」の引き出しを開いたまま、レース/周回セットのボタンが1回で開く', r.set);
					assert(r.tool.sheet && r.tool.pane === k && r.tool.title === 'ツール切り替え', tag + ' 「' + k + '」の引き出しを開いたまま、ツール切り替えのボタンが1回で開く', r.tool);
					assert(r.more.sheet && r.more.pane === k, tag + ' 「' + k + '」の引き出しを開いたまま、道具の行の「⋯」が1回で開く', r.more);
					assert(r.theme.theme === (theme === 'light' ? 'dark' : 'light') && r.theme.pane === k && r.theme2.theme === theme, tag + ' 「' + k + '」の引き出しを開いたまま、ライト／ダークのボタンが1回で切り替わる', { t1: r.theme, t2: r.theme2 });
					assert(after.pane === k && !after.sheet, tag + ' 「' + k + '」の引き出しは開いたまま', after);
					if (k === 'skill') { await page.tap('#setBtn'); await page.waitForTimeout(150); await shot('05-header-set-with-pane'); await closeSheet(); }
					await page.tap('[data-tab="' + k + '"]'); await page.waitForTimeout(80);
				}
				// 題の文字（ボタンでない所）は今までどおり外として閉じるだけ
				await page.tap('[data-tab="view"]'); await page.waitForTimeout(80);
				await ev(() => document.querySelector('.hd h1').click()); await page.waitForTimeout(80);
				const h1 = await state();
				assert(h1.pane === null && !h1.sheet, tag + ' 見出しの帯のボタンでない所（題）を押すと、今までどおり閉じるだけ', h1);
			}
			assert(errs.length === 0, tag + ' コンソールのエラーが無い', errs);
			assert(wide.length === 0, tag + ' どの場面も横スクロールが無い', wide);
			await ctx.close();
		});
	}
}
