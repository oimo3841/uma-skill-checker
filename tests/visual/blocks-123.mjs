// iPhone の動画の取り込みの精度（T109・2026-11-06）の検査。塊の見出しはすべて「T109動画の精度」で始まる（`npm run test:visual -- --only=T109動画の精度`）。
// run-smoke.mjs の末尾から register123() で呼ばれる。
//
// おいもさんの3本の画面収録（素材は Git の外。test:video-local の動画3〜5）で見つけた原因を、作り物の画で確かめる:
//  (1) 一覧は同じ高さの行が並ぶので、1/16 秒でもつながらない組は全範囲で探すと数行先にも同じくらい合う（実例: 正しい 131 が不一致 2.0%・7行先の 807 が 3.6%）。
//      今までは「重なりなし」として進み、数行分が結合画像に2回写った（3本目の親・2本目の祖2）。間の画を 1/60 秒ごとに近くだけ探して足す（microStep）。
//  (2) 育成完了後の画面は、窓の上と下に背景と紙吹雪が動いていて、本文の帯の上端が画面の上のほうになって取り込めなかった（1本目）。
//      差の続く区間のうち、いちばん長いものを本文とする（longestDiffRun）。
//  (3) 区切りの頭が動いている間に写った1枚（タッチのエフェクトが写る）の次は、近い止まりを選ぶ。遠い止まりだとエフェクトが結合画像に残った（2本目の祖2）。

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T109 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

export const SYNTH109 = String.raw`
window.__synth109 = (function () {
	const W = 720, H = 1560, HE = 640, FS = 1360, CH = FS - HE;
	const ROW = 59, HEAD = 60; // 行の高さは本物と同じ比（0.082W）
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	const rowsPer = [30, 24, 20];
	const heads = [];
	let y = 40;
	for (const n of rowsPer) { heads.push(y); y += HEAD + n * ROW; }
	const green = y, docH = green + 50 + 600, maxScroll = docH - CH;
	const doc = document.createElement('canvas'); doc.width = W; doc.height = docH;
	const d = doc.getContext('2d');
	d.fillStyle = 'rgb(240,240,240)'; d.fillRect(0, 0, W, docH);
	const r = rng(109);
	// どの行も同じ形（2列の灰色の札）で、名前（小さな濃い棒）だけが違う
	const textRow = (y0) => {
		for (const x0 of [120, 420]) {
			d.fillStyle = 'rgb(222,222,222)'; d.fillRect(x0, y0 + 4, 270, 46);
			d.fillStyle = 'rgb(170,170,180)'; d.fillRect(x0, y0 + 50, 270, 5);
			const n = 2 + Math.floor(r() * 4);
			for (let k = 0; k < n; k++) { d.fillStyle = 'rgb(90,50,30)'; d.fillRect(x0 + 40 + Math.floor(r() * 180), y0 + 10 + Math.floor(r() * 12), 12 + Math.floor(r() * 16), 12); }
			for (let k = 0; k < 3; k++) { d.fillStyle = 'rgb(240,190,40)'; d.fillRect(x0 + 130 + k * 26, y0 + 34, 18, 14); }
		}
	};
	for (let i = 0; i < heads.length; i++) {
		d.fillStyle = 'rgb(40,170,235)'; d.fillRect(120, heads[i], 570, HEAD);
		d.fillStyle = 'rgb(255,255,255)'; d.fillRect(260, heads[i] + 18, 60, 24); d.fillRect(320 + i * 40, heads[i] + 18, 160, 24);
		for (let k = 0; k < rowsPer[i]; k++) textRow(heads[i] + HEAD + k * ROW);
	}
	d.fillStyle = 'rgb(120,190,40)'; d.fillRect(0, green, W, 50);
	for (let k = 0; k < 10; k++) textRow(green + 50 + k * ROW);
	const fixed = document.createElement('canvas'); fixed.width = W; fixed.height = H;
	const f = fixed.getContext('2d');
	f.fillStyle = 'rgb(205,195,185)'; f.fillRect(0, 0, W, HE); f.fillRect(0, FS, W, H - FS);
	const r2 = rng(7);
	for (let k = 0; k < 60; k++) { const g = 40 + Math.floor(r2() * 120); f.fillStyle = 'rgb(' + g + ',' + (g - 10) + ',' + (g - 20) + ')'; f.fillRect(Math.floor(r2() * 660), 280 + Math.floor(r2() * (HE - 320)), 20 + Math.floor(r2() * 80), 12); }
	for (let k = 0; k < 12; k++) { f.fillStyle = 'rgb(90,80,70)'; f.fillRect(Math.floor(r2() * 660), FS + 20 + Math.floor(r2() * 80), 40, 20); }
	const frame = document.createElement('canvas'); frame.width = W; frame.height = H;
	const fx = frame.getContext('2d');
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
	const SPEED = 1200; // px/秒（1/16秒で 75px・1/60秒で 20px。指を動かし始めてすぐの速さ）
	function pathOf(at) {
		const p = [[0, at[0]]]; let t = 0.8;
		for (let k = 1; k < at.length; k++) { p.push([t, at[k - 1]]); t += Math.abs(at[k] - at[k - 1]) / SPEED; p.push([t, at[k]]); t += 0.8; }
		return p;
	}
	const h1 = heads[1], h2 = heads[2];
	const PATHS = {
		// 止まり→止まりが 500px 前後。祖1・祖2 の頭は止まっているときに窓（帯の上から 8〜172px）に入る
		stops: pathOf([0, 500, 1000, 1500, h1 - 76, h1 - 76 + 500, h1 - 76 + 1000, h2 - 76, h2 - 76 + 500, h2 - 76 + 1000, maxScroll]),
		// 祖1 の頭が窓の少し下（300px）で止まり、次のスワイプで窓を飛び越える: 次の止まりでは頭が帯の上へ抜けているので、人の1枚目は動いている1枚になる。その先の止まりは 500px 先
		movingAnchor: pathOf([0, 500, 1000, 1500, h1 - 300, h1 + 30, h1 + 530, h1 + 1030, h2 - 76, h2 - 76 + 500, h2 - 76 + 1000, maxScroll])
	};
	function make(o) {
		o = o || {};
		const path = PATHS[o.path || 'stops'];
		const pos = lerpPath(path);
		const duration = path[path.length - 1][0] + 0.5;
		const moving = (t) => pos(Math.max(0, t - 0.02)) !== pos(Math.min(duration, t + 0.02));
		return {
			pos, moving, W, H, HE, FS, CH, heads, green, docH, duration, doc,
			source: UmaVideoFrames.canvasSource({
				width: W, height: H, duration,
				draw(t, ctx, dw, dh) {
					fx.drawImage(fixed, 0, 0);
					fx.drawImage(doc, 0, pos(t), W, CH, 0, HE, W, CH);
					// タッチのエフェクトのまね: 動いている間だけ。行に合わないように大きめ
					if (o.effect && moving(t)) { fx.fillStyle = 'rgb(255,0,255)'; fx.beginPath(); fx.arc(W * 0.72, HE + CH * 0.7, 46, 0, Math.PI * 2); fx.fill(); }
					// 育成完了後のまね: 窓の上と下だけ、背景と紙吹雪が動く（窓の中の固定部分は動かない）
					if (o.confetti) {
						const q = rng(Math.round(t * 240) + 1);
						for (const [y0, y1] of [[0, 260], [FS + 120, H]]) {
							fx.fillStyle = 'rgb(' + (90 + Math.floor(q() * 60)) + ',150,210)'; fx.fillRect(0, y0, W, y1 - y0);
							for (let k = 0; k < 14; k++) { fx.fillStyle = 'rgb(' + Math.floor(q() * 255) + ',' + Math.floor(q() * 255) + ',' + Math.floor(q() * 255) + ')'; fx.fillRect(Math.floor(q() * (W - 20)), y0 + Math.floor(q() * (y1 - y0 - 20)), 14, 18); }
						}
					}
					ctx.drawImage(frame, 0, 0, dw, dh);
				}
			})
		};
	}
	// 組み立てた人 j の画を、作り物の一覧の「頭から」と比べる（blocks-100 と同じ見方）。合わない行の数・赤紫の画素の数
	function compare(c, s, j) {
		const w = c.width, h = c.height;
		const a = c.getContext('2d').getImageData(0, 0, w, h).data;
		const top = s.heads[j];
		const expectH = (j + 1 < s.heads.length ? s.heads[j + 1] : s.green) - s.heads[j];
		const rows = Math.min(h, s.docH - top, expectH - 2);
		const b = s.doc.getContext('2d').getImageData(0, top, w, rows).data;
		let badRows = 0, magenta = 0; const badAt = [];
		for (let y = 2; y < rows; y += 2) {
			let rs = 0, rn = 0;
			for (let x = 0; x < w; x += 3) { const k = (y * w + x) * 4; rs += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); rn += 3; }
			if (rs / rn > 24) { badRows++; if (badAt.length < 6) badAt.push(y + ':' + Math.round(rs / rn)); }
		}
		for (let k = 0; k < a.length; k += 4) if (a[k] > 200 && a[k + 1] < 90 && a[k + 2] > 200) magenta++;
		return { h, expectH, badRows, badAt, magenta };
	}
	async function run(o) {
		const s = make(o);
		let sel;
		const dbg = {};
		try { sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'], debug: o.debug ? dbg : null }); } catch (e) { return { error: e.code + ': ' + e.message, persons: [] }; }
		const persons = [];
		for (let j = 0; j < sel.persons.length; j++) {
			const p = sel.persons[j];
			const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still });
			persons.push(Object.assign({ label: p.label, n: p.files.length, times: p.times, shifts: p.shifts, still: p.still, startMoving: s.moving(p.times[0]), uncertain: p.uncertain.filter(Boolean).length }, compare(c, s, j)));
		}
		return { persons, header: sel.header, stats: sel.stats, picks: sel.picks, seams: sel.seams, track: dbg.track ? dbg.track.map((f) => Object.assign(f, { truth: s.pos(f.t) - s.pos(0) })) : null };
	}
	return { run };
})();
`;

export async function register123(env) {
	const { block, assert, browser, base } = env;
	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(180000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t109.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t109.html');
		await page.addScriptTag({ content: SYNTH109 });
		return { ctx, page, errors };
	};
	const okPersons = (r) => r.persons.length === 3 && r.persons.every((p) => p.badRows === 0 && Math.abs(p.h - p.expectH) <= 2);
	const show = (r) => r.error || r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 枚数' + p.n + ' 赤紫' + p.magenta).join('／');

	await block('T109動画の精度(1) 同じ高さの行が並ぶ一覧を、エフェクトを写して速く動かす: 数行先に合わず、行が2回写らない', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth109.run({ effect: true }));
		assert(okPersons(r), 'T109動画の精度(1) 3人に分かれ、どの人も一覧と画素で合う・高さが正しい（' + show(r) + '）', r.persons);
		assert(r.stats && r.stats.micros > 0, 'T109動画の精度(1) この動画は 1/16 秒でつながらない組があり、1/60 秒ごとに足して測っている（' + (r.stats && r.stats.micros) + '組）', r.stats);
		assert(r.persons.every((p) => p.uncertain === 0), 'T109動画の精度(1) 確かでない継ぎ目が出ない', r.persons.map((p) => p.uncertain));
		assert(errors.length === 0, 'T109動画の精度(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T109動画の精度(2) 窓の上と下で背景と紙吹雪が動く（育成完了後の画面）: 本文の帯は窓の中だけで、3人を取り込める', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth109.run({ confetti: true }));
		assert(!r.error, 'T109動画の精度(2) 「画面が見つからない」で止まらない', r.error);
		assert(r.header && Math.abs(r.header.headerEnd - 640) <= 2 && Math.abs(r.header.footer - 1360) <= 2, 'T109動画の精度(2) 本文の帯が 640〜1360（±2）', r.header);
		assert(okPersons(r), 'T109動画の精度(2) 3人に分かれ、どの人も一覧と画素で合う（' + show(r) + '）', r.persons);
		assert(errors.length === 0, 'T109動画の精度(2) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T109動画の精度(3) 区切りの頭が動いている間に写った1枚の次は、近い止まりを選ぶ: エフェクトが結合画像に残らない', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth109.run({ path: 'movingAnchor', effect: true }));
		assert(okPersons(r), 'T109動画の精度(3) 3人に分かれ、どの人も一覧と画素で合う（' + show(r) + '）', r.persons);
		const g1 = r.persons[1] || {};
		assert(g1.startMoving === true, 'T109動画の精度(3) 祖1 の1枚目は動いている1枚（この検査の前提）', g1);
		assert(g1.shifts && g1.shifts[0] < 300 && g1.still[1] === true, 'T109動画の精度(3) その次は近い止まり（ずれ ' + (g1.shifts && g1.shifts[0]) + 'px）', g1);
		assert(r.persons.every((p) => p.magenta === 0), 'T109動画の精度(3) 結合画像にエフェクト（赤紫）の画素が無い', r.persons.map((p) => p.magenta));
		assert(errors.length === 0, 'T109動画の精度(3) コンソールのエラーなし', errors);
		await ctx.close();
	});
}
