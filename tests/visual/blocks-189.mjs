// T220（2026-11-26・因子一覧の取り込み 段1。決定 924〜934）の検査。作り物の画（canvasSource）で見る。本物の録画は test:video-local の --list。
// run-smoke.mjs の末尾から register189() で呼ばれる（塊の見出しはすべて「T220」で始まる。`npm run test:visual -- --only=T220` で回せる）。
//
//  (1) 見分け（js/factor-list.js の detect）: 作り物の因子一覧（1人分・6人分の両タブ・DMM版の横画面の2通り）は list1／list6。横画面で左の1人分と
//      右の一覧があれば左（list1）。今の因子画面（blocks-100 の作り物）・一面の色・一覧の無い画は当たらない。
//  (2) スイッチ false（製品のまま）: 因子一覧の動画は今の失敗の文で枠は変わらず、見分けを呼ばない。撮り方に因子一覧の行は無い。
//      今の因子画面の動画の結合画像（UmaStar ③・UmaExam ②）は、直す前の製品（b704c51）と PNG のバイトが同じ・js/factor-list.js を読まない形とも同じ。
//      直す前の値は tests/visual/lib/t220-stitch-baseline.json（直す前の製品でこの塊の measureStitch を回して作った。output/scratch/t220/baseline.mjs）。
//  (3) スイッチ true（js/factor-list.js を差し替え）: 1人分の因子一覧は今のセットの親の欄に入り（祖の欄は空になる。T221・決定 935）、「親Aセットの親を取得しました」を出し、
//      「一覧の最後まで写っていないようです」は出ない。結合画像と OCR の行の切り出しで札と★が作り物と合う。3人の因子画面の動画は見分けを呼ばない。
//      1人の因子画面の動画は見分けを呼ぶが当たらず、今のまま。撮り方の1行と失敗の文が変わる。6人分は blocks-190（T221）。
//  (4) 読めない画像で結合したときの文（決定 934）: 「親Aセットの画像結合に失敗しました。画像を読み込めませんでした。」（スイッチによらない）。理由のある失敗の文は今のまま。
import { SYNTH85 } from './blocks-100.mjs';
import { reloadReady } from './lib/page-ready.mjs';

// 作り物の因子一覧。画の寸法はスマホの録画（1180×2554）と同じ比で、位置は画の幅の比（実測）
export const FACTOR = String.raw`
window.__fl = (function () {
	const W = 780, H = 1688;
	const px = (d) => Math.round(W * d);
	const T = px(0.243), LIST_TOP = T + px(0.382), LIST_BOTTOM = T + px(1.49);
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
	// 名前のまね（札ごとに違う黒っぽい四角の並び）
	function glyphs(x, r, x0, y0, maxW, h) {
		const n = 4 + Math.floor(r() * 6), gw = Math.round(h * 0.8);
		x.fillStyle = 'rgb(105,55,20)';
		for (let k = 0; k < n && (k + 1) * (gw + 3) < maxW; k++) {
			const gx = x0 + k * (gw + 3);
			x.fillRect(gx, y0, 4, h);
			for (let j = 0; j < 3; j++) x.fillRect(gx, y0 + Math.floor(r() * (h - 3)), Math.round(gw * (0.4 + r() * 0.6)), 3);
		}
	}
	function star(x, cx, cy, rad, on) {
		x.fillStyle = on ? 'rgb(255,200,40)' : 'rgb(232,232,232)';
		x.strokeStyle = on ? 'rgb(200,140,20)' : 'rgb(150,150,150)';
		x.lineWidth = 1;
		x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill(); x.stroke();
	}
	// 窓の上の部分（外の背景・タイトルの帯・白い本体）
	function frameBase(x) {
		x.fillStyle = 'rgb(110,120,160)'; x.fillRect(0, 0, W, H);
		x.fillStyle = 'rgb(250,250,250)'; x.fillRect(px(0.013), T, W - px(0.013) * 2, px(1.73));
		x.fillStyle = 'rgb(110,190,10)'; x.fillRect(px(0.013), T, W - px(0.013) * 2, px(0.082));
		// 見出しの字のまね（本物と同じように、緑のすきまが画の幅の 3% より狭い細い字）
		x.fillStyle = '#fff'; for (let k = 0; k < 6; k++) x.fillRect(px(0.42) + k * px(0.028), T + px(0.022), px(0.012), px(0.036));
	}
	// 1人分: 本文（所持因子の帯と2列の札）。cards は作り物の正解 [{ col, row, stars, kind }]
	function make1(o) {
		o = o || {};
		const ROWS = o.rows || 30, r = rng(220), pitch = px(0.0815), first = px(0.06), ch = px(0.058);
		const doc = canvas(W, first + ROWS * pitch + px(0.02));
		const d = doc.getContext('2d');
		d.fillStyle = 'rgb(242,242,242)'; d.fillRect(0, 0, doc.width, doc.height);
		d.fillStyle = 'rgb(102,186,0)'; d.fillRect(px(0.047), 4, px(0.908), px(0.032));
		d.fillStyle = '#fff'; d.fillRect(px(0.06), 9, px(0.12), px(0.02));
		const cards = [];
		for (let row = 0; row < ROWS; row++) for (let col = 0; col < 2; col++) {
			const kind = row === 0 ? (col ? 'pink' : 'blue') : (row === 1 && col === 0 ? 'green' : 'gray');
			const cx = px(col ? 0.509 : 0.049), cy = first + row * pitch, cw = px(0.442);
			d.fillStyle = { blue: 'rgb(40,170,235)', pink: 'rgb(255,100,165)', green: 'rgb(135,200,40)', gray: 'rgb(225,225,225)' }[kind];
			d.fillRect(cx, cy, cw, ch);
			d.fillStyle = 'rgb(190,188,200)'; d.fillRect(cx, cy + ch - 3, cw, 3);
			d.fillStyle = 'rgb(200,205,235)'; d.beginPath(); d.arc(cx + px(0.0255), cy + ch / 2, px(0.012), 0, Math.PI * 2); d.fill();
			glyphs(d, r, px(col ? 0.563 : 0.103), cy + Math.round(ch * 0.3), px(0.34), Math.round(ch * 0.36));
			const stars = 1 + Math.floor(r() * 3);
			[0.43, 0.504, 0.578].forEach((f, k) => star(d, cx + cw * f, cy + ch, px(0.013), k < stars));
			cards.push({ row, col, stars, kind });
		}
		const base = canvas(W, H), b = base.getContext('2d');
		frameBase(b);
		b.fillStyle = 'rgb(215,140,80)'; b.beginPath(); b.arc(px(0.2), T + px(0.2), px(0.095), 0, Math.PI * 2); b.fill();
		b.fillStyle = 'rgb(80,50,30)'; b.fillRect(px(0.5), T + px(0.15), px(0.3), px(0.03)); b.fillRect(px(0.53), T + px(0.2), px(0.22), px(0.034));
		b.fillStyle = 'rgb(255,255,255)'; b.fillRect(px(0.3), T + px(1.56), px(0.4), px(0.11));
		b.fillStyle = 'rgb(90,70,60)'; b.fillRect(px(0.44), T + px(1.6), px(0.12), px(0.03));
		return { doc, base, cards, grayCards: cards.filter((c) => c.kind === 'gray') };
	}
	// 6人分: 左右のタブと1列の札
	function make6(tab) {
		const r = rng(660 + tab), pitch = px(0.079), ch = px(0.064), ROWS = 34;
		const doc = canvas(W, ROWS * pitch + px(0.04));
		const d = doc.getContext('2d');
		d.fillStyle = 'rgb(242,242,242)'; d.fillRect(0, 0, doc.width, doc.height);
		for (let row = 0; row < ROWS; row++) {
			const cy = px(0.02) + row * pitch, kind = row % 12 === 0 ? 'blue' : (row % 12 === 1 ? 'pink' : (row % 12 === 2 ? 'green' : 'gray'));
			d.fillStyle = { blue: 'rgb(40,170,235)', pink: 'rgb(255,100,165)', green: 'rgb(135,200,40)', gray: 'rgb(225,225,225)' }[kind];
			d.fillRect(px(0.215), cy, px(0.71), ch);
			glyphs(d, r, px(0.27), cy + Math.round(ch * 0.3), px(0.4), Math.round(ch * 0.4));
			[0.74, 0.78, 0.82].forEach((f) => star(d, px(f), cy + ch / 2, px(0.016), true));
		}
		const base = canvas(W, H), b = base.getContext('2d');
		frameBase(b);
		const ty = T + px(0.095), th = px(0.057);
		b.fillStyle = 'rgb(255,255,255)'; b.fillRect(px(0.025), ty, px(0.95), th);
		b.fillStyle = 'rgb(110,190,10)'; b.fillRect(px(tab === 1 ? 0.025 : 0.505), ty, px(0.47), th);
		b.fillStyle = 'rgb(90,70,60)'; b.fillRect(px(0.2), ty + 12, px(0.1), px(0.024)); b.fillRect(px(0.7), ty + 12, px(0.1), px(0.024));
		return { doc, base, top: T + px(0.18), bottom: T + px(1.49) };
	}
	function source(m, top, bottom, o) {
		o = o || {};
		const h = bottom - top, max = Math.max(0, m.doc.height - h);
		const stops = [0]; for (let s = 560; s < max; s += 560) stops.push(s); if (max > 0) stops.push(max);
		const path = [[0, 0]]; let t = 0.75;
		for (let k = 1; k < stops.length; k++) { path.push([t, stops[k - 1]], [t + 0.5, stops[k]]); t += 1.25; }
		path.push([t + 0.75, stops[stops.length - 1]]);
		const pos = (tt) => { for (let k = 1; k < path.length; k++) { const [t0, s0] = path[k - 1], [t1, s1] = path[k]; if (tt <= t1) return Math.round(s0 + (s1 - s0) * Math.max(0, tt - t0) / (t1 - t0 || 1)); } return stops[stops.length - 1]; };
		const frame = canvas(W, H), x = frame.getContext('2d');
		return UmaVideoFrames.canvasSource({ width: W, height: H, duration: t + 1.25, draw(tt, ctx, dw, dh) {
			x.drawImage(m.base, 0, 0);
			x.drawImage(m.doc, 0, pos(tt), W, h, 0, top, W, h);
			ctx.drawImage(frame, 0, 0, dw, dh);
		} });
	}
	const src1 = (o) => { const m = make1(o); return Object.assign(source(m, LIST_TOP, LIST_BOTTOM), { __m: m }); };
	const src6 = (tab) => { const m = make6(tab); return source(m, m.top, m.bottom); };
	const still = (c) => UmaVideoFrames.canvasSource({ width: c.width, height: c.height, duration: 1, draw(t, ctx, dw, dh) { ctx.drawImage(c, 0, 0, dw, dh); } });
	// 1人分の画の1コマ
	async function frameOf(src) { const c = canvas(src.width, src.height); await src.drawAt(0, c.getContext('2d'), c.width, c.height); return c; }
	// DMM版の横画面のまね（1390×782）。kind 'l1': 左に1人分の小窓・右はぼかして薄い6人分の一覧／'l6': 左は別の画面・右に6人分の一覧
	async function landscape(kind) {
		const c = canvas(1390, 782), x = c.getContext('2d');
		x.fillStyle = 'rgb(235,235,240)'; x.fillRect(0, 0, 1390, 782);
		const six = await frameOf(still(make6(1).base));
		const m6 = make6(1); six.getContext('2d').drawImage(m6.doc, 0, 0, W, m6.bottom - m6.top, 0, m6.top, W, m6.bottom - m6.top);
		const w = 470, s = w / (W * 0.974), sx = W * 0.013, sy = T;
		const paste = (img, dx, dy, hh) => x.drawImage(img, sx, sy, W * 0.974, hh / s, dx, dy, w, hh);
		if (kind === 'l1') {
			x.save(); x.filter = 'blur(4px)'; x.globalAlpha = 0.55; paste(six, 760, 12, 760); x.restore();
			x.fillStyle = 'rgb(40,45,90)'; x.fillRect(100, 0, 590, 380);
			const one = await frameOf(src1());
			paste(one, 181, 21, Math.round(w * 1.729));
		} else {
			x.fillStyle = 'rgb(40,45,90)'; x.fillRect(100, 0, 590, 380);
			x.fillStyle = 'rgb(110,190,10)'; x.fillRect(142, 285, 270, 10);
			paste(six, 760, 10, 772);
		}
		return c;
	}
	return { W, H, T, LIST_TOP, LIST_BOTTOM, make1, src1, src6, still, frameOf, landscape };
})();
`;

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>factor-list T220 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script><script src="/js/landscape-panel.js"></script><script src="/js/factor-list.js"></script></head><body></body></html>';

const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
const FAKE_TESSERACT = 'window.Tesseract={createWorker:async()=>({loadLanguage:async()=>{},initialize:async()=>{},setParameters:async()=>{},terminate:async()=>{},recognize:async()=>({data:{text:"",lines:[]}})})};';
const PAGES = ['special', 'exam'];
const NAME = { special: 'UmaStar', exam: 'UmaExam' };

/** ページを開いて動画の入口の状態にする。mode: 'off'（製品のまま）｜'on'（スイッチ true に差し替え）｜'absent'（js/factor-list.js を空に） */
export async function openVideoPage(env, base, file, mode) {
	const { browser, openPage, fs, path, REPO_ROOT } = env;
	const sp = await openPage(browser, base, file + '.html', { width: 375, height: 812 }, EMPTY);
	const page = sp.page;
	page.setDefaultTimeout(120000);
	let swapped = mode === 'off';
	if (mode !== 'off') {
		await page.route('**/js/factor-list.js*', (route) => {
			const body = mode === 'absent' ? '' : fs.readFileSync(path.join(REPO_ROOT, 'js', 'factor-list.js'), 'utf8').replace('const FACTOR_LIST_ENABLED = false;', 'const FACTOR_LIST_ENABLED = true;');
			swapped = mode === 'absent' || body.includes('const FACTOR_LIST_ENABLED = true;');
			return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
		});
	}
	await page.route('**/tesseract.js/4.0.2/tesseract.min.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_TESSERACT }));
	await page.evaluate((f) => {
		localStorage.setItem('umaSkillDeck:stepTab', '2');
		localStorage.setItem(f === 'special' ? 'uma-special-upload-mode' : 'uma-exam-upload-mode', 'video');
		if (f === 'exam') localStorage.setItem('uma-exam-last-step', '2');
	}, file);
	await reloadReady(page);
	for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click(file === 'special' ? '[data-act="notice-ok"]' : '#ui-notice-ok').catch(() => {});
	await page.evaluate(() => selectStepTab(2));
	for (const s of [SYNTH85, FACTOR]) await page.addScriptTag({ content: s });
	return Object.assign(sp, { swapped: () => swapped });
}

/** 作り物の動画を製品の取り込み（onVideoChosen）に通す。kind: 'inherit3'｜'inherit1'｜'list1'｜'list6' */
export function runImport(page, kind, setIdx = 0) {
	return page.evaluate(async ({ kind, setIdx }) => {
		let src;
		if (kind === 'list1') src = __fl.src1();
		else if (kind === 'list6') src = __fl.src6(1);
		else {
			const s = __synth85.make({ path: 'stops' });
			const full = s.source;
			// 1人だけの因子画面のまね: 親の一覧のうちだけの長さにする（祖1 の頭は写っても1枚で外れる）
			src = kind !== 'inherit1' ? full : UmaVideoFrames.canvasSource({ width: full.width, height: full.height, duration: 2.6, async draw(t, x, w, h) { await full.drawAt(t, x, w, h); } });
		}
		devGeometry = [];
		const toasts = [];
		const orig = window.showToast;
		window.showToast = function (m) { toasts.push(String(m)); return orig.apply(this, arguments); };
		let result;
		try { videoPending = { setIdx }; result = await onVideoChosen(src, {}); }
		finally { window.showToast = orig; }
		const img = document.querySelector('#personset-' + PERSON_SETS[setIdx].id + '-wrap .video-result img');
		if (img) await img.decode().catch(() => {});
		let png = null;
		if (img) {
			const buf = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
			png = { w: img.naturalWidth, h: img.naturalHeight, bytes: buf.length, sha: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (v) => v.toString(16).padStart(2, '0')).join('') };
		}
		const text = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
		return { result, png, toasts, error: text('#video-error .video-error-text'), partial: !!document.querySelector('.video-partial'),
			files: persons.map((p) => p.files.length), names: persons.map((p) => (p.files[0] ? p.files[0].name : null)),
			list: persons.map((p) => (p.video && p.video.list) || null),
			factorLogs: devGeometry.filter((l) => /^\[因子一覧\]/.test(l)), logs: devGeometry.filter((l) => /^\[動画\]/.test(l)).slice(0, 4) };
	}, { kind, setIdx });
}

// 撮り方の小窓の行（<br> で分ける。閉じた小窓なので innerText ではなく中身から）と、今の判定の失敗（band）の文
const screenTexts = (page) => page.evaluate(() => {
	const box = document.querySelector('.video-howto-box');
	return { howto: box.innerHTML.split(/<br\s*\/?>/i).map((s) => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean), noscreen: videoText(videoErrorKey({ code: 'band' })), toofew: videoText(videoErrorKey({ code: 'too-few' })) };
});

/** 今の因子画面の作り物の動画の結合画像（PNG のハッシュ）。直す前との比べに使う */
export async function measureStitch(env, base, file, mode) {
	const sp = await openVideoPage(env, base, file, mode);
	try {
		const r = await runImport(sp.page, 'inherit3');
		return { png: r.png, files: r.files, factorLogs: r.factorLogs.length, errors: sp.errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m)), swapped: sp.swapped() };
	} finally { await sp.ctx.close(); }
}

export async function register189(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	// 取り込みの失敗は console.error に出る（今の作り）。作り物の因子一覧で今の流れが失敗するときの文は想定のうち
	const unexpected = (errors) => jsErrors(errors).filter((m) => !/本文の帯|使えるフレームが少なすぎる|すべて同じ場所が写っている/.test(m));
	const BASELINE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests/visual/lib/t220-stitch-baseline.json'), 'utf8'));
	const OLD_NOSCREEN = '動画の中に継承の画面（因子の一覧）が見つかりませんでした。因子の一覧を開いてから撮り直してください。';
	const NEW_NOSCREEN = '動画の中に因子の画面（継承・因子一覧）が見つかりませんでした。因子の画面を開いてから撮り直してください。';
	const HOWTO_LINE = '・「因子一覧」も使えます。6人分は1人目→2人目の順にスクロール。';

	await block('T220(1) 因子一覧の見分け: 作り物の1人分・6人分（両タブ）・DMM版の横画面（左の1人分を先に）は当たり、今の因子画面・一覧の無い画は当たらない', async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(120000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__factor-list-t220.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__factor-list-t220.html');
		for (const s of [SYNTH85, FACTOR]) await page.addScriptTag({ content: s });
		const r = await page.evaluate(async () => {
			const F = UmaFactorList;
			const one = async (src, at) => { const f = await F.detect(src, { at: at || 0 }); return f ? { type: f.type, tab: f.tab || null, titleTop: Math.round(f.titleTop), rect: f.rect ? { x: f.rect.x, y: f.rect.y, w: f.rect.w, h: f.rect.h } : null } : null; };
			const out = { enabled: F.ENABLED, T: __fl.T };
			out.list1 = await one(__fl.src1());
			out.list6a = await one(__fl.src6(1));
			out.list6b = await one(__fl.src6(2));
			out.land1 = await one(__fl.still(await __fl.landscape('l1')));
			out.land6 = await one(__fl.still(await __fl.landscape('l6')));
			// 今の因子画面（blocks-100 の作り物）の全部の時刻・一面の色・全幅の緑の帯だけ・白紙
			const s = __synth85.make({ path: 'stops' });
			out.inherit = [];
			for (let t = 0; t < s.duration; t += 0.5) { const f = await one(s.source, t); if (f) out.inherit.push([t, f.type]); }
			const paint = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); fn(x); return __fl.still(c); };
			out.others = [];
			out.others.push(await one(paint(780, 1688, (x) => { x.fillStyle = '#fff'; x.fillRect(0, 0, 780, 1688); })));
			out.others.push(await one(paint(780, 1688, (x) => { x.fillStyle = 'rgb(110,190,10)'; x.fillRect(0, 0, 780, 1688); })));
			out.others.push(await one(paint(780, 1688, (x) => { x.fillStyle = '#fff'; x.fillRect(0, 0, 780, 1688); x.fillStyle = 'rgb(110,190,10)'; x.fillRect(10, 190, 760, 64); x.fillRect(10, 600, 760, 30); })));
			out.others.push(await one(paint(1390, 782, (x) => { x.fillStyle = '#eee'; x.fillRect(0, 0, 1390, 782); x.fillStyle = 'rgb(110,190,10)'; x.fillRect(181, 21, 470, 40); })));
			return out;
		});
		assert(r.enabled === false, 'T220(1) 製品のスイッチ FACTOR_LIST_ENABLED は false', r.enabled);
		assert(r.list1 && r.list1.type === 'list1' && Math.abs(r.list1.titleTop - r.T) <= 6 && r.list1.rect === null, 'T220(1) 1人分は list1（タイトルの帯の上端が合う）', r.list1);
		assert(r.list6a && r.list6a.type === 'list6' && r.list6a.tab === 1 && r.list6b && r.list6b.type === 'list6' && r.list6b.tab === 2, 'T220(1) 6人分は list6（1人目・2人目のタブ）', [r.list6a, r.list6b]);
		assert(r.land1 && r.land1.type === 'list1' && r.land1.rect && r.land1.rect.x > 150 && r.land1.rect.x < 200 && r.land1.rect.w > 460 && r.land1.rect.w < 500, 'T220(1) 横画面で左の1人分と右の一覧があれば list1（左の小窓を切り出す矩形）', r.land1);
		assert(r.land6 && r.land6.type === 'list6' && r.land6.rect && r.land6.rect.x > 730 && r.land6.rect.x < 780, 'T220(1) 横画面の右の6人分は list6（右の一覧を切り出す矩形）', r.land6);
		assert(r.inherit.length === 0 && r.others.every((v) => v === null), 'T220(1) 今の因子画面・一面の色・一覧の無い画は当たらない', { inherit: r.inherit, others: r.others });
		assert(errors.length === 0, 'T220(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	for (const file of PAGES) {
		await block(`T220(2) ${NAME[file]} スイッチ false: 因子一覧の動画は今の失敗の文・見分けを呼ばない・撮り方は今のまま・今の因子画面の結合画像は直す前と PNG のバイトが同じ`, async () => {
			const factorRun = async (mode) => {
				const sp = await openVideoPage(env, base, file, mode);
				const texts = await screenTexts(sp.page);
				const r = await runImport(sp.page, 'list1');
				const errors = unexpected(sp.errors);
				await sp.ctx.close();
				return Object.assign(r, { texts, errors });
			};
			const r = await factorRun('off'), none = await factorRun('absent');
			assert(r.texts.howto[1].startsWith('・親から祖2') && !r.texts.howto.join('').includes('因子一覧') && r.texts.noscreen === OLD_NOSCREEN && r.texts.toofew === OLD_NOSCREEN, `T220(2) ${NAME[file]} 撮り方に因子一覧の行が無く、失敗の文は今のまま`, r.texts);
			assert(r.result && r.result.ok === false && !!r.error && r.error === none.error && r.files.every((n) => n === 0) && r.factorLogs.length === 0, `T220(2) ${NAME[file]} 因子一覧の動画は js/factor-list.js が無いときと同じ失敗の文・枠は変わらない・見分けを呼ばない`, { result: r.result, error: r.error, none: none.error, files: r.files, logs: r.factorLogs });
			assert(r.errors.length === 0, `T220(2) ${NAME[file]} 想定の外のコンソールのエラーなし`, r.errors.slice(0, 3));
			const off = await measureStitch(env, base, file, 'off');
			const absent = await measureStitch(env, base, file, 'absent');
			assert(off.png && absent.png && off.png.sha === absent.png.sha, `T220(2) ${NAME[file]} 結合画像は js/factor-list.js を読まない形とバイトまで同じ`, { off: off.png, absent: absent.png });
			assert(off.png && off.png.sha === BASELINE[file].sha && off.png.bytes === BASELINE[file].bytes, `T220(2) ${NAME[file]} 結合画像は直す前（b704c51）の製品とバイトまで同じ`, { now: off.png, was: BASELINE[file] });
			assert(off.errors.length === 0 && off.factorLogs === 0 && off.swapped && absent.swapped, `T220(2) ${NAME[file]} コンソールのエラー0・見分けを呼ばない`, off);
		});

		await block(`T220(3) ${NAME[file]} スイッチ true: 1人分の因子一覧は親の欄に入り祖の欄は空・文・札と★・3人の動画は見分けを呼ばない`, async () => {
			const sp = await openVideoPage(env, base, file, 'on');
			const page = sp.page;
			assert(sp.swapped(), `T220(3) ${NAME[file]} 検査用にスイッチを true に差し替えた`, null);
			const texts = await screenTexts(page);
			assert(texts.howto[1] === HOWTO_LINE && texts.howto[2].startsWith('・親から祖2') && texts.noscreen === NEW_NOSCREEN && texts.toofew === NEW_NOSCREEN, `T220(3) ${NAME[file]} 撮り方の先頭に因子一覧の1行・今の判定の失敗の文は因子の画面の文`, texts);

			// 3人の因子画面の動画は見分けを呼ばない（今の流れのまま）
			const three = await runImport(page, 'inherit3');
			assert(three.result.ok && three.files.slice(0, 3).every((n) => n > 0) && three.factorLogs.length === 0 && !three.toasts.some((t) => t.includes('取得しました')), `T220(3) ${NAME[file]} 成功する3人の動画は見分けを呼ばない`, three);
			assert(three.png && three.png.sha === BASELINE[file].sha, `T220(3) ${NAME[file]} 3人の動画の結合画像はスイッチ true でもバイトまで同じ`, three.png);

			// 1人分の因子一覧: 親の欄を置き換え、祖の欄は空にする（決定 935）
			const one = await runImport(page, 'list1');
			assert(one.result.ok && one.files[0] >= 2 && three.files[1] > 0 && one.files[1] === 0 && one.files[2] === 0 && one.list[0] && one.list[0].type === 'list1' && !one.list[1] && !one.list[2] && one.files.slice(3).every((n) => n === 0),
				`T220(3) ${NAME[file]} 1人分は親の欄に入り、前に入っていた祖の欄は空になる`, { three: three.files, one: one.files, list: one.list, error: one.error, logs: one.factorLogs });
			assert(one.toasts.includes('親Aセットの親を取得しました') && !one.partial && !one.error, `T220(3) ${NAME[file]} 「親Aセットの親を取得しました」を出し、途中までの知らせ・失敗の文は出ない`, { toasts: one.toasts, partial: one.partial, error: one.error });
			assert(one.factorLogs.some((l) => /見分け: list1/.test(l)), `T220(3) ${NAME[file]} 見分けは list1`, one.factorLogs);

			// 札と★: 組み立てた親の画を因子一覧の行の切り出しに通すと、灰色の札の数と★が作り物と合う。OCR の流れも因子一覧の行を使う
			const rows = await page.evaluate(async () => {
				const v = persons[0].video;
				const c = await UmaVideoFrames.composePerson(persons[0].files, v.shifts, v.uncertain, '親', { still: v.still, anchorY: v.anchorY });
				const det = UmaFactorList.detectRows(c, [], { top: 0, bottom: 1 });
				const stars = det ? UmaFactorList.rowStars(c, det, { top: 0, bottom: 1 }).map((s) => s.stars) : [];
				const truth = __fl.make1().grayCards.map((k) => k.stars);
				devGeometry = [];
				const worker = { recognize: async () => ({ data: { text: '', lines: [] } }) };
				const out = await processPersonImages(worker, persons[0].files, '親', true, true, false, v);
				const used = out.geometry.filter((g) => g && g.rows);
				return { h: c.height, stars, truth, frames: persons[0].files.length, geo: used.map((g) => ({ n: g.rows.length, cols: g.columnXs })), listLogs: devGeometry.filter((l) => /\[因子一覧\] 灰色の札/.test(l)).length };
			});
			assert(rows.stars.length === rows.truth.length && JSON.stringify(rows.stars) === JSON.stringify(rows.truth), `T220(3) ${NAME[file]} 組み立てた画の灰色の札 ${rows.truth.length}枚と★の数が作り物と合う`, rows);
			assert(rows.geo.length >= 2 && rows.geo.every((g) => g.n > 0 && g.cols.length === 2 && g.cols[1] > g.cols[0]) && rows.listLogs >= rows.geo.length, `T220(3) ${NAME[file]} OCR の流れは因子一覧の行の切り出しを使う（画ごとに行と2列）`, rows);

			// 親Bセットに取り込むと、親Bの文
			await page.evaluate(() => { activePersonSet = 1; });
			const oneB = await runImport(page, 'list1', 1);
			assert(oneB.result.ok && oneB.files[3] >= 2 && oneB.files[4] === 0 && oneB.files[0] === one.files[0] && oneB.toasts.includes('親Bセットの親を取得しました'), `T220(3) ${NAME[file]} 親Bセットなら親Bの欄に入り「親Bセットの親を取得しました」`, oneB);

			// 1人の因子画面の動画: 見分けは呼ぶが当たらず、今の流れの結果のまま
			await page.evaluate(() => { activePersonSet = 0; });
			const solo = await runImport(page, 'inherit1');
			assert(solo.result.ok && solo.files[0] > 0 && solo.files[1] === 0 && solo.factorLogs.length === 1 && /当てはまらない/.test(solo.factorLogs[0]) && !solo.list[0], `T220(3) ${NAME[file]} 1人の因子画面の動画は見分けが当たらず、今の流れの結果のまま`, solo);

			assert(unexpected(sp.errors).length === 0, `T220(3) ${NAME[file]} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T220(4) ${NAME[file]} 読めない画像で結合すると「画像を読み込めませんでした」の文（理由のある失敗の文は今のまま）`, async () => {
			const sp = await openVideoPage(env, base, file, 'off');
			const r = await sp.page.evaluate(async (file) => {
				persons[0].files = [new File([], 'broken-1.png', { type: 'image/png' }), new File([], 'broken-2.png', { type: 'image/png' })];
				if (file === 'special') await runImageStitching({ keepClosed: true, quiet: true, withMarks: false });
				else { const run = captureRun(); lastOcrRun = run; await runImageStitching(run); }
				const texts = [...document.querySelectorAll('#stitch-result-content .stitch-err-text')].map((e) => e.textContent);
				const box = document.createElement('div');
				appendStitchErrorBlock(box, PERSON_SETS[1], '理由の文');
				return { texts, kept: box.textContent.trim() };
			}, file);
			assert(r.texts.length === 1 && r.texts[0] === '親Aセットの画像結合に失敗しました。画像を読み込めませんでした。', `T220(4) ${NAME[file]} 読めない画像の失敗の文`, r.texts);
			assert(r.kept === '親Bセットの画像結合に失敗しました: 理由の文', `T220(4) ${NAME[file]} 理由のある失敗の文は今のまま`, r.kept);
			await sp.ctx.close();
		});
	}
}
