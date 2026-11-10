// 速い動画の区切りと末尾（T132・2026-11-08・決定 482・483）の検査。塊の見出しはすべて「T132速い動画」で始まる（`npm run test:visual -- --only=T132速い動画`）。
// run-smoke.mjs の末尾から register140() で呼ばれる。
//
// スクロールを始めてから5秒未満で終わる速い動画（T129 で調べた A-1・A-2。素材は Git の外で、test:video-local の動画6・7）で見つけた原因を、作り物の画で確かめる:
//  (1) x=0.3W の列が頭のパネルの白い文字を横切ると、青が「パネルの上端」と「文字の下」の2回始まる。その差が頭をまとめる幅（headTol）を超え、
//      速く動いて2つの組のいちばん良い画が別の画になると、区切りが4つになった（A-1。2つ目の区切りの画はパネルの上が帯の外で切れていた）。
//      まとめる幅を 0.06W まで広げ、区切りの画はパネルの上端の頭から headTol 以内の頭の画からだけ選ぶ。
//  (2) 一番下で行き過ぎて戻る（ゴムのような跳ね返り）と、末尾の1枚に行き過ぎた画（指が触れたばかりでエフェクトが写る）が選ばれた（A-2）。
//      あとに止まった区間があり、位置が末尾の1枚から −0.15cH〜+20px なら、末尾の1枚をその区間の画に置き換える。

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T132 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

export const SYNTH140 = String.raw`
window.__synth140 = (function () {
	// 幅 1000（0.06W＝60px）・本文の帯 800px（headTol＝40px）。頭の2つの青の始まりの差は 50px（headTol を超え、0.06W 以内）
	const W = 1000, H = 1800, HE = 700, FS = 1500, CH = FS - HE;
	const ROW = 82, HEAD = 90, SPLIT = 50; // 行の高さは本物と同じ比（0.082W）。頭のパネルは x=0.3W の列で 25〜49 行が白い文字
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	const rowsPer = [22, 20, 18];
	const heads = [];
	let y = 40;
	for (const n of rowsPer) { heads.push(y); y += HEAD + n * ROW; }
	const green = y, docH = green + 50 + 900;
	const doc = document.createElement('canvas'); doc.width = W; doc.height = docH;
	const d = doc.getContext('2d');
	d.fillStyle = 'rgb(240,240,240)'; d.fillRect(0, 0, W, docH);
	const r = rng(132);
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
		// 白い文字（「スタミナ」のまね）: x=0.3W の列を横切り、青を上端（0〜24 行）と文字の下（50 行〜）の2つに分ける
		d.fillStyle = 'rgb(255,255,255)'; d.fillRect(230, heads[i] + 25, 140, SPLIT - 25); d.fillRect(400 + i * 50, heads[i] + 30, 220, 24);
		for (let k = 0; k < rowsPer[i]; k++) textRow(heads[i] + HEAD + k * ROW);
	}
	d.fillStyle = 'rgb(120,190,40)'; d.fillRect(0, green, W, 50);
	for (let k = 0; k < 11; k++) textRow(green + 50 + k * ROW);
	const baseDoc = doc;
	const fixed = document.createElement('canvas'); fixed.width = W; fixed.height = H;
	const f = fixed.getContext('2d');
	f.fillStyle = 'rgb(205,195,185)'; f.fillRect(0, 0, W, HE); f.fillRect(0, FS, W, H - FS);
	const r2 = rng(7);
	for (let k = 0; k < 70; k++) { const g = 40 + Math.floor(r2() * 120); f.fillStyle = 'rgb(' + g + ',' + (g - 10) + ',' + (g - 20) + ')'; f.fillRect(Math.floor(r2() * 920), 300 + Math.floor(r2() * (HE - 340)), 30 + Math.floor(r2() * 110), 16); }
	for (let k = 0; k < 12; k++) { f.fillStyle = 'rgb(90,80,70)'; f.fillRect(Math.floor(r2() * 920), FS + 30 + Math.floor(r2() * 120), 56, 28); }
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
	// 止まり→止まりを 0.6秒で 600px ずつ進む（止まりは 0.8秒）。祖2 の頭だけは止まらずに窓（帯の上から 0.25W−8）を速く抜ける:
	// 頭の上端が y=150 の画（2.5秒後）の次の 0.25秒の画では上端が帯の外（y=−20）・文字の下の青だけが y=30 に写る（680px/秒）
	function makePath(o) {
		const p = [[0, 0]]; let t = 0.8, s = 0;
		const go = (to, sec) => { t += sec; s = to; p.push([t, s]); };
		const stay = (sec) => { t += sec; p.push([t, s]); };
		const steps = (to) => { while (to - s > 600) { go(s + 600, 0.6); stay(0.8); } go(to, Math.max(0.2, (to - s) / 1000)); stay(0.8); };
		p.push([t, s]);
		steps(heads[1] - 76); // 祖1 の頭は止まりで窓に入る
		if (o.jump) {
			// T166 段3（blocks-168）: 祖2 の頭が窓のすぐ下（y=262）で止まり、次の 0.25秒の画では上端が帯の外（y=−20）・文字の下の青だけが y=30 に写る
			// （1128px/秒）。パネルの上端が窓に入った画が1枚も無い（UmaExam の横画面の録画の祖A2 の形。T165 §3-4）
			steps(heads[2] - 262);
			const tj = Math.ceil(t * 4) / 4 + 0.25; stay(tj - t);
			go(s + 282 * 4, 1.0); stay(0.8);
		} else {
		// 祖2 の頭が y=490 で止まる（時刻を 0.25秒の格子にそろえる）→ 680px/秒で窓を抜けて先まで進む
		steps(heads[2] - 490);
		const tg = Math.ceil(t * 4) / 4 + 0.25; stay(tg - t);
		go(s + 680 * 1.5, 1.5); stay(0.8);
		}
		const bottom = docH - CH - 400; // 一番下（この下の 400px は、行き過ぎたときだけ見える余白）
		if (!o.bounce) steps(bottom);
		else {
			// 1100px 手前の止まりから速いまま（1145px/秒）一番下に着いて 45px 行き過ぎ、0.3秒止まって（指が触れている。エフェクトが写る）、
			// 0.3秒で戻って止まる。行き過ぎた所も 0.25秒の格子の2枚で止まって見えるので、止まっている区間の候補になる
			steps(bottom - 1100);
			const ta = Math.ceil(t * 4) / 4 + 0.25; stay(ta - t);
			go(bottom + 45, 1.0); o.touchFrom = t; stay(0.3); o.touchTo = t; go(bottom, 0.3); stay(1.2);
		}
		return { path: p, end: t + 0.3 };
	}
	// o.split（T166 段3）: 頭のパネルの白い文字の下端（青がもう一度始まる行）を変えた一覧の写し。既定の 50 は headTol（40）を超え、
	// 文字の下の青は組から外れる（T132）。実物の 37〜44px（headTol 以内）に近い 36 にすると、文字の下の青も組に残る
	function splitDoc(split) {
		const c = document.createElement('canvas'); c.width = W; c.height = docH;
		const x = c.getContext('2d');
		x.drawImage(doc, 0, 0);
		for (let i = 0; i < heads.length; i++) {
			x.fillStyle = 'rgb(40,170,235)'; x.fillRect(160, heads[i], 800, HEAD);
			x.fillStyle = 'rgb(255,255,255)'; x.fillRect(230, heads[i] + 25, 140, split - 25); x.fillRect(400 + i * 50, heads[i] + 30, 220, 24);
		}
		return c;
	}
	function make(o) {
		o = o || {};
		const doc = o.split ? splitDoc(o.split) : baseDoc;
		const pp = makePath(o);
		const pos = lerpPath(pp.path);
		const duration = pp.end;
		const moving = (t) => pos(Math.max(0, t - 0.02)) !== pos(Math.min(duration, t + 0.02));
		const touching = (t) => o.bounce && t >= o.touchFrom && t <= o.touchTo + 0.02;
		return {
			pos, moving, touching, W, H, HE, FS, CH, heads, green, docH, duration, doc, split: o.split,
			source: UmaVideoFrames.canvasSource({
				width: W, height: H, duration,
				draw(t, ctx, dw, dh) {
					fx.drawImage(fixed, 0, 0);
					fx.drawImage(doc, 0, pos(t), W, CH, 0, HE, W, CH);
					// 一番下で指が触れている間だけのエフェクトのまね（行に合わないように大きめ）
					if (touching(t)) { fx.fillStyle = 'rgb(255,0,255)'; fx.beginPath(); fx.arc(W * 0.72, HE + CH * 0.55, 60, 0, Math.PI * 2); fx.fill(); }
					ctx.drawImage(frame, 0, 0, dw, dh);
				}
			})
		};
	}
	// 組み立てた人 j の画を、作り物の一覧の「頭から」と比べる（blocks-123 と同じ見方）。合わない行の数・赤紫の画素の数・頭の行が青か
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
		// 1行目がパネルの上端か: x=0.3W の列で、0〜20 行が青・30〜45 行が白い文字（文字の下の青から始まると 30〜45 行も青）
		const px = (yy) => { const k = (yy * w + Math.round(w * 0.3)) * 4; return [a[k], a[k + 1], a[k + 2]]; };
		const blue = (q) => q[0] < 90 && q[2] > 200, white = (q) => q[0] > 240 && q[1] > 240 && q[2] > 240;
		let topBlue = h > 46;
		for (let yy = 0; yy <= 20 && topBlue; yy++) if (!blue(px(yy))) topBlue = false;
		for (let yy = 30; yy <= (s.split || 50) - 5 && topBlue; yy++) if (!white(px(yy))) topBlue = false;
		return { h, expectH, badRows, badAt, magenta, topBlue };
	}
	async function run(o) {
		const s = make(o);
		let sel;
		try { sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2', '人4'] }); } catch (e) { return { error: e.code + ': ' + e.message, persons: [] }; }
		const persons = [];
		for (let j = 0; j < sel.persons.length; j++) {
			const p = sel.persons[j];
			const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still, anchorY: p.anchorY });
			persons.push(Object.assign({ label: p.label, n: p.files.length, times: p.times, still: p.still, lastTouching: s.touching(p.times[p.times.length - 1]),
				uncertain: p.uncertain.filter(Boolean).length }, compare(c, s, Math.min(j, s.heads.length - 1))));
		}
		return { persons, anchors: sel.anchors, picks: sel.picks, stats: sel.stats, touch: o.bounce ? [o.touchFrom, o.touchTo] : null };
	}
	return { run };
})();
`;

export async function register140(env) {
	const { block, assert, browser, base } = env;
	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(180000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t132.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t132.html');
		await page.addScriptTag({ content: SYNTH140 });
		return { ctx, page, errors };
	};
	const okPersons = (r) => r.persons.length === 3 && r.persons.every((p) => p.badRows === 0 && Math.abs(p.h - p.expectH) <= 2);
	const show = (r) => r.error || r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 枚数' + p.n + ' 赤紫' + p.magenta + (p.topBlue ? '' : ' 上端が青でない')).join('／');

	await block('T132速い動画(1) 頭のパネルが白い文字で2つの青に割れ、速く窓を抜ける: 区切りは3つで、祖2 のパネルの上が切れない', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth140.run({}));
		assert(r.anchors && r.anchors.length === 3, 'T132速い動画(1) 区切り（頭）が3つ（' + (r.error || r.anchors.map((a) => a.t + '秒 y' + a.y).join('／')) + '）', r.anchors);
		assert(okPersons(r), 'T132速い動画(1) 3人に分かれ、どの人も一覧と画素で合う・高さが正しい（' + show(r) + '）', r.persons);
		assert(r.persons.length === 3 && r.persons.every((p) => p.topBlue), 'T132速い動画(1) どの人も1行目がパネルの上端の青（上が切れていない）', r.persons.map((p) => p.topBlue));
		assert(errors.length === 0, 'T132速い動画(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T132速い動画(2) 一番下で行き過ぎて戻る: 末尾の1枚は戻ったあとの止まった画で、エフェクトが結合画像に残らない', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth140.run({ bounce: true }));
		assert(okPersons(r), 'T132速い動画(2) 3人に分かれ、どの人も一覧と画素で合う・高さが正しい（' + show(r) + '）', r.persons);
		const last = r.persons[2] || {};
		assert(r.stats && r.stats.settledEnd === 1, 'T132速い動画(2) 末尾の1枚を止まった画に置き換えた（stats.settledEnd ' + (r.stats && r.stats.settledEnd) + '）', r.stats);
		assert(last.lastTouching === false && last.still && last.still[last.still.length - 1] === true, 'T132速い動画(2) 祖2 の末尾の1枚は止まっている画（' + (last.times && last.times[last.times.length - 1]) + '秒・触れている間 ' + JSON.stringify(r.touch) + '）', last);
		assert(r.persons.every((p) => p.magenta === 0), 'T132速い動画(2) 結合画像にエフェクト（赤紫）の画素が無い', r.persons.map((p) => p.magenta));
		assert(errors.length === 0, 'T132速い動画(2) コンソールのエラーなし', errors);
		await ctx.close();
	});
}
