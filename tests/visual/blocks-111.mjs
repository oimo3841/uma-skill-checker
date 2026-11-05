// Deck α のキャラ名の行の固定（T103・2026-11-05）の検査。
// run-smoke.mjs の末尾から register111() で呼ばれる（塊の見出しはすべて「T103 Deck α 見出しの固定」で始まる。`npm run test:visual -- --only=T103 Deck α 見出しの固定` で回せる）。
//
// 決め（T103 の指示。おいもさん。212〜214）:
//  - 縦にスクロールしても（スワイプ・惰性・端を越えて引っ張る・ホイール）、列の見出しと左上の欄は1コマも動かない。すきまにマスが見えない。
//  - 見出しとマスの横の位置はそろったまま。横のスクロールでは見出しは表と一緒に動き、左上の欄と名前の列は動かない。名前の列はマスと一緒に縦に動く。
//  - 原因は、スクロールの知らせを受けてから JS で見出しを動かしていたこと（そのコマは見出しが表と一緒に動いて 7〜13px ずれた）。position: sticky に変えた。
// 見出しの位置は、描画のあと（rAF から MessageChannel で次のタスクへ送った先）に読む＝そのコマに描かれた位置。
// T103_SHOTS=<フォルダ> を付けて回すと、縦にスクロールしたあとの画像をそのフォルダに残す。
import fs from 'node:fs';
import path from 'node:path';

export async function register111(env) {
	const { block, assert, browser, base } = env;
	const SHOTS = process.env.T103_SHOTS || '';
	const sizes = { 375: { width: 375, height: 812, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };
	const startProbe = () => {
		window.__p = []; const mc = new MessageChannel();
		mc.port1.onmessage = () => { const st = document.getElementById('stage'), sr = st.getBoundingClientRect(), h = document.getElementById('vh').getBoundingClientRect(), c = document.getElementById('vc').getBoundingClientRect(); window.__p.push({ st: st.scrollTop, dh: +(h.top - sr.top).toFixed(1), dc: +(c.top - sr.top).toFixed(1), lc: +(c.left - sr.left).toFixed(1) }); };
		window.__run = true; const loop = () => { if (!window.__run) return; mc.port2.postMessage(0); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
	};
	const stopProbe = () => { window.__run = false; const p = window.__p; return { frames: p.length, moved: p.filter((x, i) => i && x.st !== p[i - 1].st).length, bad: p.filter((x) => x.dh !== 0 || x.dc !== 0 || x.lc !== 0).length, max: Math.max(0, ...p.map((x) => Math.max(Math.abs(x.dh), Math.abs(x.dc)))), end: p.length ? p[p.length - 1].st : 0 }; };
	// スクロールの後の形: 見出しの場所がすべて見出しで覆われている・見出しとマス、名前とマスの位置がそろう
	const snapshot = () => {
		const st = document.getElementById('stage'), sr = st.getBoundingClientRect(), vh = document.getElementById('vh'), vc = document.getElementById('vc'), vl = document.getElementById('vl');
		const h = vh.getBoundingClientRect(), c = vc.getBoundingClientRect();
		const hit = []; for (let x = sr.left + 1; x < Math.min(sr.right, h.right) - 1; x += 7) for (const y of [sr.top + 1, sr.top + c.height / 2, sr.top + c.height - 3]) { const e = document.elementFromPoint(x, y); if (!e || e.closest('.vb')) hit.push([x, y, e && e.tagName]); }
		const inside = (t) => { const r = t.getBoundingClientRect(); return r.left >= c.right && r.right <= sr.right; };
		const dx = [...vh.querySelectorAll('th[data-c]')].filter(inside).map((t) => { const d = document.querySelector('.vb td[data-c="' + t.dataset.c + '"]'); return d ? Math.abs(d.getBoundingClientRect().left - t.getBoundingClientRect().left) : 0; });
		const dy = [...vl.querySelectorAll('th[data-r]')].map((t) => { const d = document.querySelector('.vb td[data-r="' + t.dataset.r + '"]'); return d ? Math.abs(d.getBoundingClientRect().top - t.getBoundingClientRect().top) : 0; });
		const firstTh = vh.querySelector('th[data-c]').getBoundingClientRect(), firstCol = vh.querySelector('th[data-c]').dataset.c;
		return { sl: st.scrollLeft, st: st.scrollTop, headTop: h.top - sr.top, cornerTop: c.top - sr.top, cornerLeft: c.left - sr.left, vlLeft: vl.getBoundingClientRect().left - sr.left, headH: c.height, under: hit, dxN: dx.length, dxMax: Math.max(0, ...dx), dyN: dy.length, dyMax: Math.max(0, ...dy), firstColX: firstTh.left - sr.left, firstCol, touch: getComputedStyle(st).touchAction };
	};

	for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
		await block('T103 Deck α 見出しの固定 ―― 縦にスクロールしても列の見出しと左上の欄が動かず、すきまにマスが見えない（' + w + 'px・' + (theme === 'light' ? 'ライト' : 'ダーク') + '）', async () => {
			const sz = sizes[w]; const pc = w > 720; const tag = w + '/' + theme;
			const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: 1, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: theme });
			await ctx.addInitScript((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) { /* 自動 */ } }, theme);
			const page = await ctx.newPage();
			page.setDefaultTimeout(8000);
			const errs = [];
			page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
			page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
			const ev = (fn, arg) => page.evaluate(fn, arg);
			await page.goto(base + '/deck-alpha.html');
			await page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc, null, { timeout: 15000 });
			await page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
			await ev(async () => { const m = window.__deckAlphaMock.makeMock(30, 11); delete m.none; await window.DeckAlpha.store.replaceAll(m); await window.DeckAlpha.store.putMeta('settings', Object.assign({}, window.DeckAlpha.DEFAULT_SETTINGS)); });
			await page.reload(); await page.waitForFunction(() => document.querySelector('.vh'), null, { timeout: 15000 }); await page.waitForTimeout(2400);
			await page.waitForFunction(() => document.getElementById('toast').hidden, null, { timeout: 8000 }).catch(() => {});
			const cdp = pc ? null : await ctx.newCDPSession(page);
			const swipe = async (y0, y1, wait, x0 = 250, x1 = 250) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] }); for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k / 8, y: y0 + (y1 - y0) * k / 8 }] }); await page.waitForTimeout(12); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(wait); };
			const reset = async (y = 0) => { await ev((v) => { const s = document.getElementById('stage'); s.scrollTop = v; s.scrollLeft = 0; }, y); await page.waitForTimeout(120); };
			const run = async (act) => { await ev(startProbe); await act(); await page.waitForTimeout(200); return ev(stopProbe); };
			const checkAfter = (s, name) => {
				assert(s.headTop === 0 && s.cornerTop === 0 && s.cornerLeft === 0, tag + ' ' + name + ': 列の見出しと左上の欄は中央の領域の上端のまま', s);
				assert(s.under.length === 0, tag + ' ' + name + ': 見出しの場所（上端から下端まで）にマスが見えない', s.under.slice(0, 6));
				assert(s.dxN > 0 && s.dxMax === 0, tag + ' ' + name + ': 見出しとマスの横の位置がそろう', { n: s.dxN, max: s.dxMax });
				assert(s.dyN > 0 && s.dyMax === 0, tag + ' ' + name + ': 名前とマスの縦の位置がそろう', { n: s.dyN, max: s.dyMax });
			};

			for (const lv of [1, 2]) {
				const L = (lv === 1 ? '縮小' : '拡大');
				await ev((l) => document.querySelector('[data-lv="' + l + '"]').click(), lv); await page.waitForTimeout(150);
				if (pc) {
					await reset(); await page.mouse.move(800, 400);
					let r = await run(async () => { for (let k = 0; k < 20; k++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(16); } await page.waitForTimeout(200); });
					assert(r.moved > 0 && r.bad === 0, tag + ' ' + L + ': ホイールを勢いよく回しても見出しが動かない', r);
					checkAfter(await ev(snapshot), L + '・ホイールのあと');
					r = await run(async () => { for (let k = 0; k < 8; k++) { await page.mouse.wheel(0, 300); await ev(() => { const t = performance.now(); while (performance.now() - t < 40); }); } await page.waitForTimeout(200); });
					assert(r.bad === 0, tag + ' ' + L + ': 処理が重い間のホイールでも見出しが動かない', r);
					// 下端（これ以上進まない所）でさらに回す
					await ev(() => { const s = document.getElementById('stage'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(120);
					r = await run(async () => { for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(16); } });
					assert(r.bad === 0, tag + ' ' + L + ': 下端を越えて回しても見出しが動かない', r);
					checkAfter(await ev(snapshot), L + '・下端');
					await reset();
					r = await run(async () => { for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, -600); await page.waitForTimeout(16); } });
					assert(r.bad === 0, tag + ' ' + L + ': 上端を越えて回しても見出しが動かない', r);
				} else {
					await reset();
					let r = await run(() => swipe(600, 300, 1100));
					assert(r.moved > 3 && r.bad === 0 && r.end > 300, tag + ' ' + L + ': 上へスワイプして惰性で進む間、見出しが動かない', r);
					checkAfter(await ev(snapshot), L + '・上へスワイプのあと');
					r = await run(() => swipe(300, 600, 1100));
					assert(r.moved > 3 && r.bad === 0, tag + ' ' + L + ': 下へスワイプして惰性で戻る間、見出しが動かない（すきまにマスが見えない）', r);
					await reset();
					r = await run(() => swipe(300, 650, 400));
					assert(r.bad === 0 && r.end === 0, tag + ' ' + L + ': 上端を越えて引っ張っても見出しが動かない', r);
					checkAfter(await ev(snapshot), L + '・上端');
					await ev(() => { const s = document.getElementById('stage'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(120);
					r = await run(() => swipe(650, 300, 400));
					assert(r.bad === 0, tag + ' ' + L + ': 下端を越えて引っ張っても見出しが動かない', r);
					checkAfter(await ev(snapshot), L + '・下端');
				}
				// 半端な位置で止めて、画像と形を見る
				await reset(61);
				const s1 = await ev(snapshot);
				assert(s1.st === 61, tag + ' ' + L + ': 縦にスクロールできる', s1.st);
				checkAfter(s1, L + '・半端な位置');
				if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'scrolled-lv' + lv + '-' + w + '-' + theme + '.png') }); }
				// 横のスクロール: 見出しは表と一緒に動き、左上の欄と名前の列は動かない
				const before = await ev(snapshot);
				await ev(() => { const s = document.getElementById('stage'); s.scrollLeft = 45; }); await page.waitForTimeout(150);
				const s2 = await ev(snapshot);
				if (s2.sl > 0) {
					const a = await ev((col) => { const t = document.querySelector('.vh th[data-c="' + col + '"]'); return t ? t.getBoundingClientRect().left - document.getElementById('stage').getBoundingClientRect().left : null; }, before.firstCol);
					assert(a === null || a === before.firstColX - s2.sl, tag + ' ' + L + ': 横にスクロールすると見出しは表と一緒に動く', { a, before: before.firstColX, sl: s2.sl });
				}
				assert(s2.cornerLeft === 0 && s2.vlLeft === 0 && s2.cornerTop === 0, tag + ' ' + L + ': 横にスクロールしても左上の欄と名前の列は左端のまま', s2);
				checkAfter(s2, L + '・横にスクロールのあと');
				await reset();
			}
			if (!pc) assert((await ev(snapshot)).touch === 'pinch-zoom', tag + ' スマホの表は1本指の移動をブラウザに渡さず、ピンチは許す', null);
			else assert(/^(manipulation|pan-x pan-y pinch-zoom)$/.test((await ev(snapshot)).touch), tag + ' PC の表の touch-action は今のまま', null);

			// 押した先が今までどおり（入れ物を足しても、マス・名前・見出し・「最大」に届く）
			await ev((l) => document.querySelector('[data-lv="' + l + '"]').click(), 1); await page.waitForTimeout(120);
			const box = (sel) => ev((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
			const press = async (sel) => { const b = await box(sel); if (pc) await page.mouse.click(b.x, b.y); else await page.touchscreen.tap(b.x, b.y); await page.waitForTimeout(150); };
			const closeSheet = async () => { if (await page.isVisible('#sheet')) { await ev(() => document.getElementById('scrim').click()); await page.waitForTimeout(100); } };
			await press('.vh th[data-c="1"]'); assert(await page.isVisible('#sheet'), tag + ' 列の見出しを押すと親の小窓が開く', null); await closeSheet();
			await press('.vl th[data-r="2"]'); assert(await page.isVisible('#sheet'), tag + ' スキル名を押すとスキルの小窓が開く', null); await closeSheet();
			await press('.vb td[data-r="2"][data-c="1"]');
			const hit = await ev(() => ({ toast: !document.getElementById('toast').hidden, sheet: !document.getElementById('sheet').hidden })); assert(hit.toast || hit.sheet, tag + ' マスを押すと今までどおり反応する（名前の列の入れ物が押しを止めない）', hit); await closeSheet();
			await press('#sortMax'); assert(await ev(() => window.__deckAlpha.S.rs === 'max'), tag + ' 「最大」を押すと大きい順になる', null);
			await press('#sortMax');

			const sw = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
			assert(sw.sw <= sw.iw, tag + ' 横スクロールが無い', sw);
			assert(errs.length === 0, tag + ' コンソールのエラーが無い', errs);
			await ctx.close();
		});
	}
}
