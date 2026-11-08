// 育成を終えてすぐの画面から撮った動画（T134・2026-11-08）の検査。塊の見出しはすべて「T134育成終了直後」で始まる（`npm run test:visual -- --only=T134育成終了直後`）。
// run-smoke.mjs の末尾から register142() で呼ばれる。
//
// おいもさんの iPhone の動画（素材は Git の外で、test:video-local の動画8）で見つけた原因を、作り物の画で確かめる:
//  育成完了後の画面は、本文の窓の外（上と下）で紙吹雪が動く。撮り始めの数秒、一覧が止まっていると、その間の見本の組では本文に差が出ず、
//  「差が続く区間のうちいちばん長いもの」（T109）が窓の下の紙吹雪になる。本文の帯の上端は組ごとの中央値なので引っぱられないが、
//  下端は全部の組の最大を取っていたので、紙吹雪の終わり（画面の下のほう）まで伸び、「本文の帯が想定の範囲の外」（band）で止まり、
//  画面には「動画の中に継承の画面（因子の一覧）が見つかりませんでした」が出ていた。
//  下端は、頭が中央値の近く（±0.02H）の区間の終わりの最大にする。

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T134 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

export const SYNTH142 = String.raw`
window.__synth142 = (function () {
	// 幅 1000・高さ 1800。本文の窓は y=700〜1500（帯の下限 0.92H＝1656）。紙吹雪は窓の下 1620〜1790（窓の下端から 100 行より離す。本物は 255 行）
	const W = 1000, H = 1800, HE = 700, FS = 1500, CH = FS - HE;
	const ROW = 82, HEAD = 90;
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	const rowsPer = [20, 18, 16];
	const heads = [];
	let y = 40;
	for (const n of rowsPer) { heads.push(y); y += HEAD + n * ROW; }
	const green = y, docH = green + 50 + 900;
	const doc = document.createElement('canvas'); doc.width = W; doc.height = docH;
	const d = doc.getContext('2d');
	d.fillStyle = 'rgb(240,240,240)'; d.fillRect(0, 0, W, docH);
	const r = rng(134);
	const textRow = (y0) => {
		for (const x0 of [160, 580]) {
			d.fillStyle = 'rgb(222,222,222)'; d.fillRect(x0, y0 + 6, 380, 64);
			d.fillStyle = 'rgb(170,170,180)'; d.fillRect(x0, y0 + 70, 380, 6);
			const n = 2 + Math.floor(r() * 4);
			for (let k = 0; k < n; k++) { d.fillStyle = 'rgb(90,50,30)'; d.fillRect(x0 + 50 + Math.floor(r() * 260), y0 + 14 + Math.floor(r() * 16), 16 + Math.floor(r() * 22), 16); }
			for (let k = 0; k < 3; k++) { d.fillStyle = 'rgb(240,190,40)'; d.fillRect(x0 + 180 + k * 36, y0 + 46, 24, 18); }
		}
	};
	for (let i = 0; i < heads.length; i++) {
		d.fillStyle = 'rgb(40,170,235)'; d.fillRect(160, heads[i], 800, HEAD);
		d.fillStyle = 'rgb(255,255,255)'; d.fillRect(400 + i * 50, heads[i] + 30, 220, 24);
		for (let k = 0; k < rowsPer[i]; k++) textRow(heads[i] + HEAD + k * ROW);
	}
	d.fillStyle = 'rgb(120,190,40)'; d.fillRect(0, green, W, 50);
	for (let k = 0; k < 11; k++) textRow(green + 50 + k * ROW);
	// 窓の外（固定）: 上はウマ娘詳細の上の部分のまね、下は「閉じる」のまね
	const fixed = document.createElement('canvas'); fixed.width = W; fixed.height = H;
	const f = fixed.getContext('2d');
	f.fillStyle = 'rgb(120,170,230)'; f.fillRect(0, 0, W, H);
	f.fillStyle = 'rgb(245,245,240)'; f.fillRect(20, 300, W - 40, HE - 300); f.fillRect(20, FS, W - 40, 100);
	const r2 = rng(7);
	for (let k = 0; k < 60; k++) { const g = 40 + Math.floor(r2() * 120); f.fillStyle = 'rgb(' + g + ',' + (g - 10) + ',' + (g - 20) + ')'; f.fillRect(40 + Math.floor(r2() * 880), 320 + Math.floor(r2() * (HE - 360)), 30 + Math.floor(r2() * 110), 16); }
	f.fillStyle = 'rgb(90,80,70)'; f.fillRect(380, FS + 30, 240, 50);
	const frame = document.createElement('canvas'); frame.width = W; frame.height = H;
	const fx = frame.getContext('2d');
	// 紙吹雪: 窓の下（1620〜1790）に色の付いた小片。時刻ごとに位置が変わる（1/60 秒ごと）
	function confetti(t) {
		const q = rng(1000 + Math.floor(t * 60));
		const cols = ['rgb(250,80,120)', 'rgb(60,200,250)', 'rgb(250,220,40)', 'rgb(120,230,90)'];
		for (let k = 0; k < 40; k++) { fx.fillStyle = cols[k % 4]; fx.fillRect(Math.floor(q() * (W - 30)), 1620 + Math.floor(q() * 160), 14 + Math.floor(q() * 16), 8 + Math.floor(q() * 10)); }
	}
	function lerpPath(path) {
		return function (t) {
			if (t <= path[0][0]) return path[0][1];
			for (let k = 1; k < path.length; k++) {
				const [t0, s0] = path[k - 1], [t1, s1] = path[k];
				if (t <= t1) return Math.round(s0 + (s1 - s0) * (t - t0) / (t1 - t0));
			}
			return path[path.length - 1][1];
		};
	}
	// 撮り始めの still 秒は一覧が止まっている。そのあと止まり→止まりを 0.6秒で 600px ずつ進む（止まりは 0.8秒）。頭は帯の上から 76px で止まる
	function makePath(still) {
		const p = [[0, 0]]; let t = still, s = 0;
		const go = (to, sec) => { t += sec; s = to; p.push([t, s]); };
		const stay = (sec) => { t += sec; p.push([t, s]); };
		const steps = (to) => { while (to - s > 600) { go(s + 600, 0.6); stay(0.8); } go(to, Math.max(0.2, (to - s) / 1000)); stay(0.8); };
		p.push([t, s]);
		steps(heads[1] - 76);
		steps(heads[2] - 76);
		steps(docH - CH);
		return { path: p, end: t + 0.3 };
	}
	function make(still) {
		const pp = makePath(still);
		const pos = lerpPath(pp.path);
		return {
			heads, green, docH, doc,
			source: UmaVideoFrames.canvasSource({
				width: W, height: H, duration: pp.end,
				draw(t, ctx, dw, dh) {
					fx.drawImage(fixed, 0, 0);
					fx.drawImage(doc, 0, pos(t), W, CH, 0, HE, W, CH);
					confetti(t);
					ctx.drawImage(frame, 0, 0, dw, dh);
				}
			})
		};
	}
	// 組み立てた人 j の画を、作り物の一覧の「頭から」と比べる（blocks-140 と同じ見方）
	function compare(c, s, j) {
		const w = c.width, h = c.height;
		const a = c.getContext('2d').getImageData(0, 0, w, h).data;
		const top = s.heads[j];
		const expectH = (j + 1 < s.heads.length ? s.heads[j + 1] : s.green) - s.heads[j];
		const rows = Math.min(h, s.docH - top, expectH - 2);
		const b = s.doc.getContext('2d').getImageData(0, top, w, rows).data;
		let badRows = 0;
		for (let y = 2; y < rows; y += 2) {
			let rs = 0, rn = 0;
			for (let x = 0; x < w; x += 3) { const k = (y * w + x) * 4; rs += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); rn += 3; }
			if (rs / rn > 24) badRows++;
		}
		return { h, expectH, badRows };
	}
	async function run(still) {
		const s = make(still);
		let sel;
		try { sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2', '人4'] }); } catch (e) { return { error: e.code + ': ' + e.message, persons: [] }; }
		const persons = [];
		for (let j = 0; j < sel.persons.length; j++) {
			const p = sel.persons[j];
			const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still, anchorY: p.anchorY });
			persons.push(Object.assign({ label: p.label, n: p.files.length }, compare(c, s, Math.min(j, s.heads.length - 1))));
		}
		return { persons, header: sel.header };
	}
	return { run, HE, FS };
})();
`;

export async function register142(env) {
	const { block, assert, browser, base } = env;
	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(180000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t134.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t134.html');
		await page.addScriptTag({ content: SYNTH142 });
		return { ctx, page, errors };
	};
	const show = (r) => r.error || r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 枚数' + p.n).join('／');

	await block('T134育成終了直後 撮り始めの2秒は一覧が止まり、窓の下で紙吹雪が動く: 本文の帯は窓のとおりで、3人に分かれる', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth142.run(2));
		const hd = r.header || {};
		assert(!r.error && hd.headerEnd != null && Math.abs(hd.headerEnd - 700) <= 3 && Math.abs(hd.footer - 1500) <= 3, 'T134育成終了直後 本文の帯が窓のとおり（' + (r.error || hd.headerEnd + '〜' + hd.footer) + '・窓は 700〜1500）', r.error || hd);
		assert(r.persons.length === 3 && r.persons.every((p) => p.badRows === 0 && Math.abs(p.h - p.expectH) <= 2), 'T134育成終了直後 3人に分かれ、どの人も一覧と画素で合う・高さが正しい（' + show(r) + '）', r.persons);
		assert(errors.length === 0, 'T134育成終了直後 コンソールのエラーなし', errors);
		await ctx.close();
	});
}
