// 速い動画のエフェクトを減らす（T136・2026-11-08・決定 484 の B2＋B3・決定 501・516）の検査。塊の見出しはすべて「T136速い動画」で始まる
// （`npm run test:visual -- --only=T136速い動画`）。run-smoke.mjs の末尾から register145() で呼ばれる。
//
// スクロールを始めてから5秒未満で終わる速い動画（test:video-local の動画6〜8）は、はじきの合間の止まりが 0.1秒ほどしかなく、0.25秒おきの調べでは
// 止まっている画（エフェクトが写らない）が見つからず、はじいた直後の動いている画（指の位置に大きなエフェクト）ばかりを選んでいた。
// 作り物の画で確かめる:
//  (1) はじき（0.6秒で 900px・だんだん遅くなる）と 0.1秒の指の止まりをくり返す速い動画。はじいてから 0.25秒だけ、画面の同じ所に赤紫の丸（エフェクトのまね）が出る。
//      → 速い動画と見分け（stats.fast）、1/16秒おきに調べて止まりを拾い、3人とも一覧と画素で合う。親・祖1 の結合画像に赤紫の画素が残らず、
//      3人の赤紫の画素の合計が、同じ動画を fastMode:false（今までの 0.25秒おき）で回したときより少ない
//      （確かめた値: 今まで 22930／6527／11817 → 0／0／25436。祖2 は最後のはじきの画が残る）。
//      軌跡（debug.track）は、どの画も本当の位置から 4px 以内（決定 501。はじき始めの組で 1/60秒の足し合わせが「止まっている」と答えて外れていた。
//      今までの 0.25秒おきでは 1,626px 外れる）。
//  (2) 同じ動きを5倍ゆっくりにした動画は速い動画にならない（ふだんの速さの動画は今までどおり。stats.fast が偽）。

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T136 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

export const SYNTH145 = String.raw`
window.__synth145 = (function () {
	// 幅 1000・本文の帯 800px（blocks-140 と同じ形）。行の高さは本物と同じ比（0.082W）
	const W = 1000, H = 1800, HE = 700, FS = 1500, CH = FS - HE;
	const ROW = 82, HEAD = 90;
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	const rowsPer = [22, 20, 18];
	const heads = [];
	let y = 40;
	for (const n of rowsPer) { heads.push(y); y += HEAD + n * ROW; }
	const green = y, docH = green + 50 + 900;
	const doc = document.createElement('canvas'); doc.width = W; doc.height = docH;
	const d = doc.getContext('2d');
	d.fillStyle = 'rgb(240,240,240)'; d.fillRect(0, 0, W, docH);
	const r = rng(136);
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
	const fixed = document.createElement('canvas'); fixed.width = W; fixed.height = H;
	const f = fixed.getContext('2d');
	f.fillStyle = 'rgb(205,195,185)'; f.fillRect(0, 0, W, HE); f.fillRect(0, FS, W, H - FS);
	const r2 = rng(9);
	for (let k = 0; k < 70; k++) { const g = 40 + Math.floor(r2() * 120); f.fillStyle = 'rgb(' + g + ',' + (g - 10) + ',' + (g - 20) + ')'; f.fillRect(Math.floor(r2() * 920), 300 + Math.floor(r2() * (HE - 340)), 30 + Math.floor(r2() * 110), 16); }
	for (let k = 0; k < 12; k++) { f.fillStyle = 'rgb(90,80,70)'; f.fillRect(Math.floor(r2() * 920), FS + 30 + Math.floor(r2() * 120), 56, 28); }
	const frame = document.createElement('canvas'); frame.width = W; frame.height = H;
	const fx = frame.getContext('2d');
	// 動き: 1.0秒止まる → はじき（FLICK 秒で DIST px。はじいた直後が速く〔約 4,700px/秒。A-1・A-2 の最大は約 4,000px/秒〕、だんだん遅くなる）→ HOLD 秒の指の止まり → … → 一番下で 1.2秒止まる。
	// 一番下に着く最後のはじきは、残りの距離だけ進む。slow 倍にすると時間が全部 slow 倍になる
	function makeMotion(slow) {
		const FLICK = 0.6 * slow, HOLD = 0.1 * slow, DIST = 900, K = 3;
		const bottom = docH - CH;
		const flicks = []; // [開始, 終わり, 開始の位置, 進む量]
		let t = 1.0 * slow, s = 0;
		while (s < bottom) { const dd = Math.min(DIST, bottom - s); flicks.push([t, t + FLICK, s, dd]); s += dd; t += FLICK + HOLD; }
		const duration = t - HOLD + 1.2 * slow;
		const ease = (u) => (1 - Math.exp(-K * u)) / (1 - Math.exp(-K));
		const pos = (tt) => {
			let p = 0;
			for (const [a, b, s0, dd] of flicks) { if (tt < a) break; p = tt >= b ? s0 + dd : Math.round(s0 + dd * ease((tt - a) / (b - a))); }
			return p;
		};
		// エフェクト: はじいてから 0.25秒（A-2 の大きな蹄鉄は 0.22秒まで。ゆっくりの動画でも同じ秒数）
		const effect = (tt) => flicks.some(([a]) => tt >= a && tt < a + 0.25);
		return { pos, effect, duration, flicks };
	}
	function make(slow, noEffect) {
		const m = makeMotion(slow);
		return Object.assign(m, {
			source: UmaVideoFrames.canvasSource({
				kind: 'synth145', exact: true, width: W, height: H, duration: m.duration,
				draw(t, ctx, dw, dh) {
					fx.drawImage(fixed, 0, 0);
					fx.drawImage(doc, 0, m.pos(t), W, CH, 0, HE, W, CH);
					if (!noEffect && m.effect(t)) { fx.fillStyle = 'rgb(255,0,255)'; fx.beginPath(); fx.arc(W * 0.72, HE + CH * 0.45, 70, 0, Math.PI * 2); fx.fill(); }
					ctx.drawImage(frame, 0, 0, dw, dh);
				}
			})
		});
	}
	// 組み立てた人 j の画を、作り物の一覧の「頭から」と比べる（blocks-140 と同じ見方）
	function compare(c, j) {
		const w = c.width, h = c.height;
		const a = c.getContext('2d').getImageData(0, 0, w, h).data;
		const top = heads[j];
		const expectH = (j + 1 < heads.length ? heads[j + 1] : green) - heads[j];
		const rows = Math.min(h, docH - top, expectH - 2);
		const b = doc.getContext('2d').getImageData(0, top, w, rows).data;
		let badRows = 0, magenta = 0; const badAt = [];
		for (let yy = 2; yy < rows; yy += 2) {
			let rs = 0, rn = 0;
			for (let x = 0; x < w; x += 3) { const k = (yy * w + x) * 4; rs += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); rn += 3; }
			if (rs / rn > 24) { badRows++; if (badAt.length < 6) badAt.push(yy + ':' + Math.round(rs / rn)); }
		}
		for (let k = 0; k < a.length; k += 4) if (a[k] > 200 && a[k + 1] < 90 && a[k + 2] > 200) magenta++;
		return { h, expectH, badRows, badAt, magenta };
	}
	// withAges: 組み立てに selectFrames の persons[].ages を渡す（T158・blocks-161 の (4)。ここの塊は渡さない＝今までどおり）
	async function run(slow, extra, noEffect, withAges) {
		const s = make(slow, noEffect);
		const debug = {};
		let sel;
		try { sel = await UmaVideoFrames.selectFrames(s.source, Object.assign({ labels: ['親', '祖1', '祖2', '人4'], debug }, extra || {})); } catch (e) { return { error: e.code + ': ' + e.message, persons: [] }; }
		const persons = [];
		for (let j = 0; j < sel.persons.length; j++) {
			const p = sel.persons[j];
			const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, Object.assign({ still: p.still, anchorY: p.anchorY }, withAges ? { ages: p.ages } : {}));
			persons.push(Object.assign({ label: p.label, n: p.files.length, times: p.times, still: p.still, ages: p.ages === undefined ? 'なし' : p.ages }, compare(c, Math.min(j, heads.length - 1))));
		}
		// 軌跡の位置と本当の位置の差（1枚目の位置をそろえて）
		const tr = (debug.track || []).filter((e) => e.pos != null);
		let trackErr = 0, trackErrAt = null;
		const p0 = tr.length ? s.pos(tr[0].t) : 0;
		for (const e of tr) { const err = Math.abs(e.pos - (s.pos(e.t) - p0)); if (err > trackErr) { trackErr = err; trackErrAt = e.t; } }
		return { persons, anchors: sel.anchors, picks: sel.picks, stats: sel.stats, trackErr, trackErrAt, trackN: tr.length, duration: s.duration, releaseTs: debug.releaseTs, pickAges: debug.pickAges, flicks: s.flicks.map((x) => x[0]) };
	}
	return { run };
})();
`;

export async function register145(env) {
	const { block, assert, browser, base } = env;
	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(240000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t136.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t136.html');
		await page.addScriptTag({ content: SYNTH145 });
		return { ctx, page, errors };
	};
	const okPersons = (r) => r.persons.length === 3 && r.persons.every((p) => p.badRows === 0 && Math.abs(p.h - p.expectH) <= 2);
	const show = (r) => r.error || r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 枚数' + p.n + ' 赤紫' + p.magenta).join('／');
	const mag = (r) => r.persons.reduce((a, p) => a + p.magenta, 0);

	await block('T136速い動画(1) はじきと 0.1秒の指の止まりをくり返す速い動画: 1/16秒おきに調べ、エフェクトが結合画像に残らない・軌跡が本当の位置に合う', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth145.run(1));
		assert(r.stats && r.stats.fast === true, 'T136速い動画(1) 速い動画と見分けた（stats.fast ' + (r.stats && r.stats.fast) + '・速さ ' + (r.stats && r.stats.scrollSpeed) + 'W/秒）', r.stats || r.error);
		assert(okPersons(r), 'T136速い動画(1) 3人に分かれ、どの人も一覧と画素で合う・高さが正しい（' + show(r) + '）', r.persons);
		assert(r.persons.length === 3 && r.persons[0].magenta === 0 && r.persons[1].magenta === 0, 'T136速い動画(1) 親・祖1 の結合画像にエフェクト（赤紫）の画素が無い（' + r.persons.map((p) => p.magenta).join('／') + '）', r.persons.map((p) => p.magenta));
		assert(r.trackN > 40 && r.trackErr <= 4, 'T136速い動画(1) 軌跡のどの画も本当の位置から 4px 以内（最大 ' + r.trackErr + 'px・' + r.trackErrAt + '秒・' + r.trackN + '枚）', { trackErr: r.trackErr, at: r.trackErrAt, n: r.trackN });
		const b = await page.evaluate(() => __synth145.run(1, { fastMode: false }));
		assert(b.stats && b.stats.fast === false && b.persons.length === 3 && mag(r) < mag(b), 'T136速い動画(1) 比べ: 赤紫の画素の合計が今までの 0.25秒おき（fastMode:false）より少ない（' + mag(r) + ' ＜ ' + (b.error || mag(b) + '・' + b.persons.map((p) => p.magenta).join('／')) + '）', b.error || b.persons.map((p) => p.magenta));
		assert(errors.length === 0, 'T136速い動画(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T136速い動画(2) 同じ動きを5倍ゆっくりにした動画は速い動画にならない（今までどおり 0.25秒おき）', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth145.run(5, {}, true)); // エフェクトなし（ゆっくりの動画は動いている画が多く、今の作りでもエフェクトが残る。ここでは見分けだけを見る）
		assert(r.stats && r.stats.fast === false && r.stats.fastAdded === 0, 'T136速い動画(2) 速い動画にならない（stats.fast ' + (r.stats && r.stats.fast) + '・速さ ' + (r.stats && r.stats.scrollSpeed) + 'W/秒）', r.stats || r.error);
		assert(okPersons(r), 'T136速い動画(2) 3人に分かれ、どの人も一覧と画素で合う・高さが正しい（' + show(r) + '）', r.persons);
		assert(errors.length === 0, 'T136速い動画(2) コンソールのエラーなし', errors);
		await ctx.close();
	});
}
