// PC のウィンドウの取り込みの試しのページ lab/pc-capture-diag.html（T105 段0・2026-11-05）の検査。
// run-smoke.mjs の末尾から register112() で呼ばれる（塊の見出しはすべて「T105 PC取り込み」で始まる。`npm run test:visual -- --only=T105 PC取り込み` で回せる）。
//
// 決め（T105 の指示。おいもさん。249〜252）:
//  - 取り込んだ窓の絵から、枠・タイトルバーを除いたゲームの画面の領域を自動で見つけて切り取る。見つからないときは案内を出す。
//  - 「取り込みを止める」で止める。押し忘れに備えて上限の時間で止まる。
//  - js/video-frames.js を変えずに、今の流れ（出どころ → selectFrames → composePerson）に渡す。
// 本物の画面共有の選択は人にしかできないので、navigator.mediaDevices.getDisplayMedia を、作り物のウィンドウ（タイトルバーと枠を描き足した
// 作り物のゲームの画面）を流す canvas.captureStream に差し替える。切り取りの値は、実物（2026-10-30 に保存した 984×1804 の窓の絵）で
// 測った形（左 2px・右 1px・上 2px・タイトルバー 56px・下 2px・境目の行が混ざる）をまねる。
import { SYNTH85 } from './blocks-100.mjs';

// 作り物のウィンドウ。o: { border: [左, 右, 上, 下], title, titleColor, borderColor, bars: [左右の黒い帯] }
export const FAKE_WINDOW = String.raw`
window.__win = (function () {
	function chrome(x, W, H, o) {
		const b = o.border || [0, 0, 0, 0], t = o.title || 0;
		x.fillStyle = o.borderColor || 'rgb(47,47,47)';
		x.fillRect(0, 0, W, b[2]); x.fillRect(0, H - b[3], W, b[3]); x.fillRect(0, 0, b[0], H); x.fillRect(W - b[1], 0, b[1], H);
		if (t) {
			x.fillStyle = o.titleColor || 'rgb(243,243,243)';
			x.fillRect(b[0], b[2], W - b[0] - b[1], t);
			const u = Math.max(1, t / 56);
			x.fillStyle = 'rgb(200,120,190)'; x.fillRect(b[0] + 14 * u, b[2] + 12 * u, 30 * u, 30 * u); // アイコン
			x.fillStyle = 'rgb(90,90,90)'; x.fillRect(b[0] + 54 * u, b[2] + 20 * u, 136 * u, 16 * u);  // 題名
			for (const k of [230, 140, 50]) x.fillRect(W - b[1] - k * u, b[2] + 24 * u, 22 * u, 3 * u);  // ボタン
		}
	}
	const inner = (W, H, o) => {
		const b = o.border || [0, 0, 0, 0], t = o.title || 0, bars = o.bars || 0;
		return { x: b[0] + bars, y: b[2] + t, w: W - b[0] - b[1] - bars * 2, h: H - b[2] - t - b[3] };
	};
	// 実物に似せた作り物のゲーム（青い空・緑の見出し・白い欄・ばらばらの面）。o.skyTop は上の 80px が一色
	function game(x, r, o) {
		x.save(); x.beginPath(); x.rect(r.x, r.y, r.w, r.h); x.clip();
		const g = x.createLinearGradient(0, r.y, 0, r.y + r.h);
		g.addColorStop(0, 'rgb(147,194,240)'); g.addColorStop(0.5, 'rgb(180,200,170)'); g.addColorStop(1, 'rgb(150,200,130)');
		x.fillStyle = g; x.fillRect(r.x, r.y, r.w, r.h);
		if (o && o.skyTop) { x.fillStyle = 'rgb(147,194,240)'; x.fillRect(r.x, r.y, r.w, 80); }
		x.fillStyle = 'rgb(120,200,20)'; x.fillRect(r.x + r.w * 0.012, r.y + r.h * 0.03, r.w * 0.976, r.h * 0.05);
		x.fillStyle = 'rgb(250,250,248)'; x.fillRect(r.x + r.w * 0.012, r.y + r.h * 0.08, r.w * 0.976, r.h * 0.9);
		for (let k = 0; k < 40; k++) {
			x.fillStyle = 'hsl(' + (k * 37 % 360) + ',55%,' + (40 + k % 30) + '%)';
			x.fillRect(r.x + r.w * (0.03 + (k * 0.137 % 0.8)), r.y + r.h * (0.1 + (k * 0.0231 % 0.85)), r.w * 0.12, r.h * 0.02);
		}
		x.restore();
	}
	// 境目の行を混ぜる（実物は窓の拡大で境目の行が混ざる）
	function blendSeam(x, W, y) {
		const up = x.getImageData(0, y - 2, W, 1), dn = x.getImageData(0, y, W, 1), out = x.createImageData(W, 1);
		for (let i = 0; i < out.data.length; i += 4) { for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(up.data[i + c] * 0.97 + dn.data[i + c] * 0.03); out.data[i + 3] = 255; }
		x.putImageData(out, 0, y - 1);
	}
	function paint(W, H, o) {
		const c = document.createElement('canvas'); c.width = W; c.height = H;
		const x = c.getContext('2d', { willReadFrequently: true });
		x.fillStyle = 'rgb(0,0,0)'; x.fillRect(0, 0, W, H);
		const r = inner(W, H, o);
		if (!o.noGame) game(x, r, o);
		chrome(x, W, H, o);
		if (o.title) blendSeam(x, W, r.y);
		return { c, x, r, img: x.getImageData(0, 0, W, H) };
	}
	// 作り物の動く画面を窓に入れて流す getDisplayMedia に差し替える。src は drawAt を持つ出どころ
	function stub(src, o, settings) {
		const r0 = { x: o.border[0], y: o.border[2] + (o.title || 0), w: src.width, h: src.height };
		const W = r0.x + r0.w + o.border[1], H = r0.y + r0.h + o.border[3];
		const c = document.createElement('canvas'); c.width = W; c.height = H;
		const x = c.getContext('2d');
		const state = { W, H, rect: r0, running: true, stream: null, painted: 0 };
		const stream = c.captureStream(30);
		state.stream = stream;
		navigator.mediaDevices.getDisplayMedia = async (opts) => {
			state.opts = opts;
			const t0 = performance.now();
			const track = stream.getVideoTracks()[0];
			const orig = track.getSettings.bind(track);
			track.getSettings = () => Object.assign({}, orig(), { displaySurface: 'window', cursor: 'always' }, settings || {});
			(async function loop() {
				while (state.running && track.readyState === 'live') {
					const t = Math.min(src.duration - 0.01, (performance.now() - t0) / 1000);
					x.save(); x.translate(r0.x, r0.y);
					await src.drawAt(t, x, r0.w, r0.h);
					x.restore();
					chrome(x, W, H, o);
					state.painted++;
					await new Promise((res) => requestAnimationFrame(res));
				}
			})();
			return stream;
		};
		return state;
	}
	return { paint, stub, inner };
})();
`;

export async function register112(env) {
	const { block, assert, browser, base } = env;
	const open = async () => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(240000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.goto(base + '/lab/pc-capture-diag.html');
		await page.addScriptTag({ content: SYNTH85 });
		await page.addScriptTag({ content: FAKE_WINDOW });
		return { ctx, page, errors };
	};
	const WIN11 = { border: [2, 1, 2, 2], title: 56 };

	await block('T105 PC取り込み(1) 枠・タイトルバーを除いた領域が、窓の形ごとに正しく見つかる', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate((WIN) => {
			const cases = [
				// 名前・窓の大きさ・形・期待（領域 / reason）
				['実物の形 984×1804', 984, 1804, WIN],
				['拡大率 100% の窓 492×902', 492, 902, { border: [1, 1, 1, 1], title: 32 }],
				['150% の窓 738×1349', 738, 1349, { border: [1, 1, 2, 1], title: 44 }],
				['タイトルバーが暗い', 984, 1804, Object.assign({}, WIN, { titleColor: 'rgb(32,32,32)', borderColor: 'rgb(90,90,90)' })],
				['選んでいないときのタイトルバー（薄い色）', 984, 1804, Object.assign({}, WIN, { titleColor: 'rgb(237,246,247)' })],
				['枠もタイトルバーも無い（全画面）', 981, 1744, { border: [0, 0, 0, 0], title: 0 }],
				['枠もタイトルバーも無く、上が一色の空', 981, 1744, { border: [0, 0, 0, 0], title: 0, skyTop: true }],
				['タイトルバーだけ（最大化）', 981, 1800, { border: [0, 0, 0, 0], title: 56 }],
				['左右に黒い帯（ウィンドウが横長）', 1500, 1058, { border: [2, 2, 2, 2], title: 56, bars: 0, wideBars: 1 }],
			];
			const out = [];
			for (const [name, W, H, o] of cases) {
				const oo = Object.assign({}, o);
				if (o.wideBars) { const inH = H - o.border[2] - o.title - o.border[3]; const gw = Math.round(inH * 9 / 16); oo.bars = Math.floor((W - o.border[0] - o.border[1] - gw) / 2); }
				const p = __win.paint(W, H, oo);
				const d = __pc.detectOne(p.img);
				out.push({ name, ok: d.ok, how: d.how, got: [d.x, d.y, d.w, d.h], want: [p.r.x, p.r.y, p.r.w, p.r.h], warns: d.warns });
			}
			return out;
		}, WIN11);
		for (const c of r) {
			const close = c.ok && c.got.every((v, i) => Math.abs(v - c.want[i]) <= 1);
			assert(close, 'T105 PC取り込み(1) ' + c.name + ': 領域 ' + c.got.join(',') + '（期待 ' + c.want.join(',') + '・' + c.how + '）', c);
		}
		assert(errors.length === 0, 'T105 PC取り込み(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T105 PC取り込み(2) 見つからないときは見つかったことにしない（案内の理由）', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate((WIN) => {
			const blank = __win.paint(984, 1804, Object.assign({}, WIN, { noGame: true, title: 0, border: [0, 0, 0, 0] }));
			const land = __win.paint(1920, 1080, { border: [1, 1, 1, 1], title: 40 });
			// ふつうのアプリの窓（横長で白い）
			const app = document.createElement('canvas'); app.width = 1200; app.height = 800; const ax = app.getContext('2d', { willReadFrequently: true });
			ax.fillStyle = '#fff'; ax.fillRect(0, 0, 1200, 800); ax.fillStyle = '#ddd'; ax.fillRect(0, 0, 1200, 40); ax.fillStyle = '#333'; for (let k = 0; k < 30; k++) ax.fillRect(40, 60 + k * 24, 400 + k * 20, 10);
			const small = __win.paint(492, 902, { border: [1, 1, 1, 1], title: 32 });
			const list = [{ ok: true, x: 2, y: 58, w: 981, h: 1744, title: 56, how: 'a', warns: [] }, { ok: true, x: 2, y: 58, w: 981, h: 1744, title: 56, how: 'a', warns: [] }, { ok: true, x: 2, y: 70, w: 981, h: 1500, title: 56, how: 'a', warns: [] }, { ok: false, reason: 'aspect' }, { ok: true, x: 0, y: 0, w: 500, h: 900, title: 0, how: 'b', warns: [] }];
			return {
				blank: __pc.detectOne(blank.img), land: __pc.detectOne(land.img),
				app: __pc.detectOne(ax.getImageData(0, 0, 1200, 800)), small: __pc.detectOne(small.img),
				unstable: __pc.consensus(list),
				agree: __pc.consensus([list[0], list[1], { reason: 'blank', ok: false }, list[0]])
			};
		}, WIN11);
		assert(!r.blank.ok && r.blank.reason === 'blank', 'T105 PC取り込み(2) 真っ黒な窓は blank', r.blank);
		assert(!r.land.ok && r.land.reason === 'aspect', 'T105 PC取り込み(2) 横長の窓は aspect', r.land);
		assert(!r.app.ok && r.app.reason === 'aspect', 'T105 PC取り込み(2) ゲームでない横長の窓は aspect', r.app);
		assert(r.small.ok && r.small.warns.includes('small'), 'T105 PC取り込み(2) 小さい窓は見つかるが small の注意（結合の幅の下限 700 より狭い）', r.small);
		assert(!r.unstable.ok && r.unstable.reason === 'unstable', 'T105 PC取り込み(2) 場所が定まらないと unstable', r.unstable);
		assert(r.agree.ok && r.agree.y === 58 && r.agree.samples === 3, 'T105 PC取り込み(2) 真っ黒の1枚を除いて揃えば採る', r.agree);
		assert(errors.length === 0, 'T105 PC取り込み(2) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T105 PC取り込み(3) 枠付きの作り物の窓を取り込み、切り取って結合画像まで作れる（encode・video-frames.js は不変）', async () => {
		const { ctx, page, errors } = await open();
		const st = await page.evaluate((WIN) => {
			const s = __synth85.make({ path: 'stops' });
			window.__s = s;
			window.__st = __win.stub(s.source, WIN);
			return { W: __st.W, H: __st.H, rect: __st.rect, duration: s.duration };
		}, WIN11);
		await page.selectOption('#mode', 'encode');
		await page.click('#start');
		await page.waitForFunction(() => window.__pc.S.area && window.__pc.S.area.ok);
		const live = await page.evaluate(() => { const a = document.getElementById('area'); return { hidden: a.hidden, left: a.style.left, top: a.style.top, stopOn: !document.getElementById('stop').disabled, startOn: !document.getElementById('start').disabled, msg: document.getElementById('msg').textContent }; });
		assert(!live.hidden && live.stopOn && !live.startOn, 'T105 PC取り込み(3) 取り込み中は領域の枠が出て、「取り込みを止める」だけが押せる', live);
		await page.waitForTimeout(Math.round(st.duration * 1000) + 300);
		await page.click('#stop');
		await page.waitForFunction(() => window.__pc.S.done);
		const r = await page.evaluate(() => {
			const S = __pc.S, s = __s, out = [];
			(S.persons || []).forEach((p, j) => {
				const c = p.canvas, w = c.width, h = c.height, a = c.getContext('2d').getImageData(0, 0, w, h).data;
				const top = s.heads[j], expectH = (j + 1 < s.heads.length ? s.heads[j + 1] : s.green) - s.heads[j];
				const rows = Math.min(h, s.docH - top, expectH - 2);
				const b = s.doc.getContext('2d').getImageData(0, top, w, rows).data;
				let badRows = 0, sum = 0, n = 0;
				for (let y = 2; y < rows; y += 2) {
					let rs = 0, rn = 0;
					for (let x = 0; x < w; x += 3) { const k = (y * w + x) * 4; rs += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); rn += 3; }
					if (rs / rn > 24) badRows++;
					sum += rs; n += rn;
				}
				out.push({ label: p.label, w, h, expectH, badRows, mean: +(sum / n).toFixed(2), frames: p.frames });
			});
			return { area: S.area, cap: { recv: S.cap.recv, dropped: S.cap.dropped, w: S.cap.w, h: S.cap.h }, result: S.result, persons: out, msg: document.getElementById('msg').textContent, msgCls: document.getElementById('msg').className, videoOn: !document.getElementById('saveVideo').disabled, imgOn: !document.getElementById('saveImages').disabled, startOn: !document.getElementById('start').disabled, frameOn: !document.getElementById('saveFrame').disabled, liveTracks: __st.stream.getTracks().filter((t) => t.readyState === 'live').length };
		});
		const want = st.rect;
		assert(r.area.ok && Math.abs(r.area.x - want.x) <= 1 && Math.abs(r.area.y - want.y) <= 1 && Math.abs(r.area.w - want.w) <= 1 && Math.abs(r.area.h - want.h) <= 1, 'T105 PC取り込み(3) 領域 ' + [r.area.x, r.area.y, r.area.w, r.area.h].join(',') + '（期待 ' + [want.x, want.y, want.w, want.h].join(',') + '）', r.area);
		assert(r.cap.w === st.W && r.cap.h === st.H && r.cap.recv > 60, 'T105 PC取り込み(3) 届いたフレーム ' + r.cap.recv + ' 枚・窓 ' + r.cap.w + '×' + r.cap.h + '（幅が奇数でも圧縮できる）', r.cap);
		assert(/^crop|webcodecs/.test(r.result.src), 'T105 PC取り込み(3) 出どころは復号（' + r.result.src + '）', r.result);
		assert(r.persons.length === 3 && r.persons.every((p) => p.w === want.w && p.badRows === 0 && p.mean < 8 && Math.abs(p.h - p.expectH) <= 2), 'T105 PC取り込み(3) 3人に分かれ、作り物の一覧と画素で合う（' + r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 平均' + p.mean).join('・') + '）', r.persons);
		assert(r.msgCls === 'ok' && r.imgOn && r.videoOn && r.frameOn && r.startOn, 'T105 PC取り込み(3) 終わると「' + r.msg + '」が出て、保存のボタンが押せ、もう一度始められる', r);
		assert(r.liveTracks === 0, 'T105 PC取り込み(3) 止めたら画面共有を閉じる', r.liveTracks);
		assert(errors.length === 0, 'T105 PC取り込み(3) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T105 PC取り込み(4) 上限の時間で止まる・共有が外から止まっても止まる・見つからないと案内が出る', async () => {
		const { ctx, page, errors } = await open();
		await page.evaluate((WIN) => { const s = __synth85.make({ path: 'stops' }); window.__st = __win.stub(s.source, WIN); }, WIN11);
		await page.fill('#limit', '5');
		await page.click('#start');
		await page.waitForFunction(() => window.__pc.S.done, null, { timeout: 120000 });
		const lim = await page.evaluate(() => ({ why: __pc.S.stopReason, secs: __pc.S.cap.elapsed, msg: document.getElementById('msg').textContent }));
		assert(lim.why === 'limit' && lim.secs >= 4.9 && lim.secs < 7, 'T105 PC取り込み(4) 上限 5 秒で止まる（' + lim.secs.toFixed(1) + ' 秒・' + lim.msg + '）', lim);
		await ctx.close();

		const b = await open();
		await b.page.evaluate((WIN) => { const s = __synth85.make({ path: 'stops' }); window.__st = __win.stub(s.source, WIN); }, WIN11);
		await b.page.click('#start');
		await b.page.waitForFunction(() => window.__pc.S.cap && window.__pc.S.cap.recv > 10);
		await b.page.evaluate(() => { const t = __pc.S.track; t.stop(); t.dispatchEvent(new Event('ended')); });
		await b.page.waitForFunction(() => window.__pc.S.done, null, { timeout: 120000 });
		const ended = await b.page.evaluate(() => ({ why: __pc.S.stopReason, startOn: !document.getElementById('start').disabled }));
		assert(ended.why === 'ended' && ended.startOn, 'T105 PC取り込み(4) ブラウザの「共有を停止」で止まっても後片付けされる', ended);
		await b.ctx.close();

		const c = await open();
		await c.page.evaluate(() => {
			// 横長の窓（ゲームではない）を流す
			const src = UmaVideoFrames.canvasSource({ width: 1200, height: 700, duration: 30, draw(t, x, dw, dh) { x.fillStyle = '#fff'; x.fillRect(0, 0, dw, dh); x.fillStyle = '#333'; for (let k = 0; k < 20; k++) x.fillRect(40, 30 + k * 30 + (t * 10 % 5), 500, 10); } });
			window.__st = __win.stub(src, { border: [1, 1, 1, 1], title: 40 });
		});
		await c.page.click('#start');
		await c.page.waitForFunction(() => window.__pc.S.cap && window.__pc.S.cap.recv > 40);
		await c.page.click('#stop');
		await c.page.waitForFunction(() => window.__pc.S.done, null, { timeout: 120000 });
		const nf = await c.page.evaluate(() => ({ msg: document.getElementById('msg').textContent, cls: document.getElementById('msg').className, area: __pc.S.area, persons: document.querySelectorAll('#persons canvas').length }));
		assert(nf.cls === 'ng' && /見つけられませんでした/.test(nf.msg) && !nf.area.ok && nf.persons === 0, 'T105 PC取り込み(4) ゲームでない窓は案内を出す（' + nf.msg + '）', nf);
		assert(errors.length === 0 && b.errors.length === 0 && c.errors.length === 0, 'T105 PC取り込み(4) コンソールのエラーなし', [errors, b.errors, c.errors]);
		await c.ctx.close();
	});

	await block('T105 PC取り込み(5) ボタンの出し分けと、製品のページからリンクしないこと', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(() => __pc.shouldOffer());
		assert(r.offer === true, 'T105 PC取り込み(5) PC の Chrome では出す', r);
		await ctx.close();
		// スマホの形: iPhone の Safari（getDisplayMedia なし）と Android の Chrome（userAgentData.mobile）をまねる
		const init = (kind) => {
			if (kind === 'no-api') { delete window.MediaStreamTrackProcessor; }
			if (kind === 'iphone') { try { Object.defineProperty(MediaDevices.prototype, 'getDisplayMedia', { value: undefined, configurable: true }); } catch (e) { /* 何もしない */ } }
			if (kind === 'android') { Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ mobile: true, platform: 'Android', brands: [] }), configurable: true }); }
			if (kind === 'touch-pc' || kind === 'no-api') { Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true }); window.matchMedia = (q) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} }); }
		};
		for (const kind of ['iphone', 'android', 'touch-pc', 'no-api']) {
			const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
			const p2 = await c2.newPage();
			const errs2 = [];
			p2.on('pageerror', (e) => errs2.push(String(e)));
			await p2.addInitScript(init, kind);
			await p2.goto(base + '/lab/pc-capture-diag.html');
			const q = await p2.evaluate(() => ({ o: __pc.shouldOffer(), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
			// 決定 325: タッチだけと見える PC（Surface）でも、機能があってスマホでなければ出す
			if (kind === 'touch-pc') assert(q.o.offer === true, 'T105 PC取り込み(5) タッチだけと見える PC（Surface）では出す', q.o);
			else assert(q.o.offer === false, 'T105 PC取り込み(5) ' + kind + ' では出さない（' + q.o.why + '）', q.o);
			assert(q.sw <= q.cw && errs2.length === 0, 'T105 PC取り込み(5) ' + kind + ' の幅 390 で横スクロールなし・エラーなし', { q, errs2 });
			await c2.close();
		}
		const fs = await import('node:fs');
		const path = await import('node:path');
		const root = env.REPO_ROOT;
		const hits = ['special.html', 'exam.html', 'index.html', 'deck-alpha.html', 'uma-skill-deck.html'].filter((f) => fs.readFileSync(path.join(root, f), 'utf8').includes('pc-capture-diag'));
		assert(hits.length === 0, 'T105 PC取り込み(5) 製品のページからリンクしない', hits);
		assert(errors.length === 0, 'T105 PC取り込み(5) コンソールのエラーなし', errors);
	});
}
