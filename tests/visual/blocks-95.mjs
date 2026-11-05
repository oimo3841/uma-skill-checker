// スマホで止まらない動画の読み込み（T77・2026-11-02）の検査。
// run-smoke.mjs の末尾から register95() で呼ばれる（塊の見出しはすべて「T77動画の読み込み」で始まる。`npm run test:visual -- --only=T77動画の読み込み` で回せる）。
//
// iPhone の Safari（iOS 27.0.1）では、ページに置いていない video は loadedmetadata のあと suspend して loadeddata が来ず、
// readyState が 1 のまま止まった（T68 の診断の A・B1）。ページに置いて load() を呼ぶと動いた（B2）。
// Chromium ではページの外の video でも読み込めるので、その動きを「まね」で作る:
//   ページに置いていない video には loadeddata・canplay・canplaythrough を届けず（同じ要素の先頭の受け手で止める）、readyState を 1 までに見せる。
// 動画は MediaRecorder でその場で作る（色が時刻で変わる 1.2秒ほどの WebM。長さは Infinity なので、末尾までのシークで長さを知る道も通る）。
// 見ること: (1) まねが空振りでない（ページの外の video は loadeddata が来ない）・直した videoSource は止まらず読めて、時刻どおりの色が描け、
// close() でページから外れる。(2) special.html の③の流れ（onVideoChosen）が、まねの下で読み込みの段を抜けて終わる（作り物の色の動画なので
// 「継承の画面が見つからない」で終わる。止まらないことと、失敗が読み込み〔decode〕でないことを見る）。
// 変更前（T77 の前）の製品では (1)(2) とも読み込みの段で止まり、NG になる（T77 の報告に結果）。
import { reloadReady } from './lib/page-ready.mjs';
import { pickVideo } from './lib/video-entry.mjs';

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

// ページの中に入れる道具: まね（__iosMimic）と、動画を作る（__makeWebm）
const TOOLS = String.raw`
window.__iosMimic = function () {
	if (window.__mimicOn) return;
	window.__mimicOn = true;
	window.__swallowed = 0;
	window.__connectedAtData = [];
	const rs = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState');
	Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() { const r = rs.get.call(this); return this.isConnected ? r : Math.min(r, 1); } });
	const orig = Document.prototype.createElement;
	Document.prototype.createElement = function (tag, o) {
		const el = orig.call(this, tag, o);
		if (String(tag).toLowerCase() === 'video') {
			for (const ev of ['loadeddata', 'canplay', 'canplaythrough']) {
				el.addEventListener(ev, (e) => {
					if (!el.isConnected) { e.stopImmediatePropagation(); window.__swallowed++; }
					else if (ev === 'loadeddata') window.__connectedAtData.push(true);
				});
			}
		}
		return el;
	};
};
// 360×640 の WebM。0.4秒ごとに 赤 → 緑 → 青
window.__makeWebm = function () {
	return new Promise((resolve, reject) => {
		const c = document.createElement('canvas');
		c.width = 360; c.height = 640;
		const x = c.getContext('2d');
		const COLORS = ['#e02020', '#20c020', '#2040e0'];
		const s = performance.now();
		const paint = () => { const k = Math.min(2, Math.floor((performance.now() - s) / 400)); x.fillStyle = COLORS[k]; x.fillRect(0, 0, 360, 640); x.fillStyle = '#fff'; x.fillRect(20, 20 + k * 40, 100, 20); };
		paint();
		const stream = c.captureStream(30);
		const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
		const parts = [];
		rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
		rec.onstop = () => resolve(new Blob(parts, { type: 'video/webm' }));
		rec.onerror = (e) => reject(e.error || e);
		const iv = setInterval(paint, 30);
		rec.start();
		setTimeout(() => { clearInterval(iv); paint(); rec.stop(); }, 1250);
	});
};
`;

export async function register95(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

	await block('T77動画の読み込み(1) ページに置いていない video の loadeddata が来ない（iPhone のまね）でも、videoSource は止まらず読めて描け、close() でページから外れる', async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(60000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-load-test.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-load-test.html');
		await page.addScriptTag({ content: TOOLS });
		const r = await page.evaluate(async () => {
			const blob = await __makeWebm();
			__iosMimic();
			// まねが効いているか: ページの外の video（変更前の読み込みと同じ作り）は loadeddata が来ない
			const url = URL.createObjectURL(blob);
			const d = document.createElement('video');
			d.muted = true; d.preload = 'auto'; d.playsInline = true; d.src = url;
			const detached = await new Promise((res) => {
				const tm = setTimeout(() => res({ got: false, rs: d.readyState, meta: d.videoWidth > 0 }), 3000);
				d.onloadeddata = () => { clearTimeout(tm); res({ got: true }); };
			});
			d.removeAttribute('src'); d.load(); URL.revokeObjectURL(url);
			const swallowedDetached = __swallowed;
			// 直した読み込み
			const t0 = performance.now();
			let src = null, err = null;
			try {
				src = await Promise.race([UmaVideoFrames.videoSource(blob), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
			} catch (e) { err = String(e && e.message || e); }
			const loadMs = Math.round(performance.now() - t0);
			if (!src) return { detached, swallowedDetached, err, loadMs };
			const inDomWhileOpen = document.querySelectorAll('video').length;
			const colors = [];
			const cv = document.createElement('canvas');
			cv.width = 36; cv.height = 64;
			const cx = cv.getContext('2d', { willReadFrequently: true });
			for (const t of [0.2, 0.6, 1.0]) {
				await src.drawAt(t, cx, 36, 64);
				const p = cx.getImageData(18, 50, 1, 1).data;
				colors.push([p[0], p[1], p[2]]);
			}
			src.close();
			return { detached, swallowedDetached, err, loadMs, w: src.width, h: src.height, D: src.duration, inDomWhileOpen, connectedAtData: __connectedAtData.length, colors, leftAfterClose: document.querySelectorAll('video').length };
		});
		const dom = (c) => c[0] > c[1] && c[0] > c[2] ? 'R' : c[1] > c[2] ? 'G' : 'B';
		assert(r.detached && r.detached.got === false && r.swallowedDetached >= 1, 'T77(1) まねが空振りでない: ページの外の video は loadeddata が来ない（届いて止めた数 ≥1）', { detached: r.detached, swallowed: r.swallowedDetached });
		assert(!r.err && r.loadMs < 10000, 'T77(1) 直した videoSource は止まらずに返る（10秒未満）', { err: r.err, loadMs: r.loadMs });
		if (r.err) { await ctx.close(); return; }
		assert(r.w === 360 && r.h === 640 && isFinite(r.D) && r.D > 0.9 && r.D < 2, 'T77(1) 大きさ 360×640・長さ（Infinity の WebM でも末尾までのシークで分かる）', { w: r.w, h: r.h, D: r.D });
		assert(r.inDomWhileOpen === 1 && r.connectedAtData >= 1, 'T77(1) 読み込みのあいだ video はページに置かれ、loadeddata はページの中で受けた', { inDom: r.inDomWhileOpen, connectedAtData: r.connectedAtData });
		assert(r.colors.map(dom).join('') === 'RGB', 'T77(1) シークして描いた色が時刻どおり（0.2秒 赤・0.6秒 緑・1.0秒 青）', r.colors);
		assert(r.leftAfterClose === 0, 'T77(1) close() でページから外れる（video が残らない）', r.leftAfterClose);
		assert(jsErrors(errors).length === 0, 'T77(1) コンソールのエラー0', errors);
		await ctx.close();
	});

	await block('T77動画の読み込み(2) special.html の③: iPhone のまねの下でも、動画の取り込みが読み込みの段で止まらずに終わる（作り物の色の動画なので「継承の画面が見つからない」）', async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		const { page } = sp;
		await page.evaluate(() => localStorage.setItem('umaSkillDeck:stepTab', '2'));
		await reloadReady(page);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await page.waitForTimeout(300);
		await page.evaluate(() => selectStepTab(2));
		await page.addScriptTag({ content: TOOLS });
		await page.evaluate(async () => { window.__blob = await __makeWebm(); __iosMimic(); });
		await pickVideo(page);
		const t0 = Date.now();
		const r = await page.evaluate(() => {
			const run = onVideoChosen(new File([__blob], 'rec.webm', { type: 'video/webm' }));
			return Promise.race([run, new Promise((res) => setTimeout(() => res('timeout'), 20000))]);
		});
		const ms = Date.now() - t0;
		if (r === 'timeout') await page.click('#video-progress [data-video-act="abort"]').catch(() => {});
		const c = await page.evaluate(() => ({
			connectedAtData: __connectedAtData.length, videos: document.querySelectorAll('video').length,
			prog: !!document.getElementById('video-progress'), err: !!document.getElementById('video-error'),
			log: (window.devGeometry || []).filter((s) => String(s).startsWith('[動画]')).slice(-2)
		}));
		assert(r !== 'timeout' && r && r.ok === false && !r.aborted, 'T77(2) 取り込みが止まらずに終わる（20秒以内）', { r, ms });
		assert(r !== 'timeout' && r.error !== 'decode' && c.connectedAtData >= 1, 'T77(2) 読み込みの段は抜けた（失敗は読み込み〔decode〕でない・loadeddata をページの中で受けた）', { error: r && r.error, c });
		assert(!c.prog && c.err && c.videos === 0, 'T77(2) 進捗の箱は消えて失敗の知らせが出る・video はページに残らない', c);
		// 作り物の色の動画なので、本文の帯を探す stitchDetectHeaderFooter の失敗（「すべて同じ場所が写っている…」）だけは出てよい
		assert(jsErrors(sp.errors).filter((m) => !/stitchDetectHeaderFooter/.test(m)).length === 0, 'T77(2) コンソールのエラー0（本文の帯が見つからない失敗の1件を除く）', sp.errors);
		await sp.ctx.close();
	});
}
