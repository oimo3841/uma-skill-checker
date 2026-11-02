// 動画の結合の品質の安定化（T85・2026-11-02。C-259 の T83 への回答＝案1＋案3＋案4）の検査。
// run-smoke.mjs の末尾から register100() で呼ばれる（塊の見出しはすべて「T85動画の品質」で始まる。`npm run test:visual -- --only=T85動画の品質` で回せる）。
//
// 決め（T83 の報告 §5）:
//  - 案1 (a) 止まっている区間（となりとのずれ 0）の真ん中の1枚を先に選ぶ。止まり→止まりが本文の帯の約85% を超える所だけ、間の動いている1枚を足す。
//  - 案1 (b)＋案4 取り直した等倍の画を縮めて、選ぶときの縮小画と比べる。合わなければ次の画（requestVideoFrameCallback）を待って取り直す。
//  - 案1 (c) となりどうしのずれは、取り直した画どうしで（選ぶときのずれの近くを）測り直してから使う。
//  - 案3 区切り（区画の頭）は帯の中のどこでも見つけ、細かく取り直したフレームでも調べ、軌跡の上の位置で同じ頭をまとめる。
//    人の1枚目は頭が帯の上から 0.25W 以内（組み立て stitchDetectFirstSkillPanelTop が頭を探す範囲）で、頭がいちばん上に近いフレーム（止まっているものを先に）。
//    窓の少し下で止まり、次のスワイプで窓を飛び越えたときは、間を半分ずつ取り直して窓に入るフレームを探す。
// 素材は blocks-80（T42）と同じ作り方の作り物の画。iPhone の Safari のまね（T83 の §2）として、
//  stale … 等倍の取り直しで、直前に描いた時刻の画が出る（次の画を待てば正しい画）
//  jitter … どの描画も ±1/30 秒ずれた時刻の画が出る（種で決まる）
// を描く関数に入れる。タッチのエフェクトのまねとして、動いている間だけ右下に赤紫の丸を描く。
// 組み立てた画は、作り物の一覧（区画の頭から次の頭まで）と画素で比べる（JPEG の差は平均 4 階調まで）。
// 変更前の製品（T82 の 2026-11-02c）ではこの塊は4塊とも NG になる（13件。T85 の報告に結果）。

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T85 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

export const SYNTH85 = String.raw`
window.__synth85 = (function () {
	const W = 720, H = 1560, HE = 640, FS = 1360, CH = FS - HE; // 本文の帯は 640〜1359（720px）。0.25W-8 = 172
	const ROW = 96, HEAD = 60;
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	const rowsPer = [16, 12, 10];
	const heads = [];
	let y = 40;
	for (const n of rowsPer) { heads.push(y); y += HEAD + n * ROW; }
	const green = y;
	const docH = green + 50 + 600;
	const doc = document.createElement('canvas'); doc.width = W; doc.height = docH;
	const d = doc.getContext('2d');
	d.fillStyle = 'rgb(222,222,222)'; d.fillRect(0, 0, W, docH);
	const r = rng(85);
	const textRow = (y0, h) => {
		d.fillStyle = 'rgb(236,236,236)'; d.fillRect(0, y0, W, h - 6);
		d.fillStyle = 'rgb(200,200,200)'; d.fillRect(0, y0 + h - 6, W, 6);
		const n = 7 + Math.floor(r() * 5);
		for (let k = 0; k < n; k++) {
			const g = 30 + Math.floor(r() * 90);
			d.fillStyle = 'rgb(' + g + ',' + g + ',' + (g + 10) + ')';
			d.fillRect(Math.floor(r() * (W - 60)), y0 + 6 + Math.floor(r() * (h - 40)), 20 + Math.floor(r() * 110), 12 + Math.floor(r() * 18));
		}
		d.fillStyle = 'rgb(240,150,40)'; d.fillRect(20 + Math.floor(r() * 80), y0 + 10 + Math.floor(r() * 30), 28, 28);
	};
	for (let i = 0; i < heads.length; i++) {
		d.fillStyle = 'rgb(40,170,235)'; d.fillRect(30, heads[i], W - 60, HEAD);
		d.fillStyle = 'rgb(255,255,255)'; d.fillRect(60, heads[i] + 18, 100, 24); d.fillRect(300 + i * 40, heads[i] + 18, 160, 24);
		for (let k = 0; k < rowsPer[i]; k++) textRow(heads[i] + HEAD + k * ROW, ROW);
	}
	d.fillStyle = 'rgb(120,190,40)'; d.fillRect(0, green, W, 50);
	for (let k = 0; k < 6; k++) textRow(green + 50 + k * 100, 100);
	for (let yy = 0; yy < docH; yy++) {
		for (let k = 0; k < 2; k++) { const g = 40 + Math.floor(r() * 100); d.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; d.fillRect(300 + Math.floor(r() * 260), yy, 30 + Math.floor(r() * 30), 1); }
	}
	const fixed = document.createElement('canvas'); fixed.width = W; fixed.height = H;
	const f = fixed.getContext('2d');
	f.fillStyle = 'rgb(205,195,185)'; f.fillRect(0, 0, W, HE); f.fillRect(0, FS, W, H - FS);
	const r2 = rng(7);
	for (let k = 0; k < 60; k++) { const g = 40 + Math.floor(r2() * 120); f.fillStyle = 'rgb(' + g + ',' + (g - 10) + ',' + (g - 20) + ')'; f.fillRect(Math.floor(r2() * 660), Math.floor(r2() * (HE - 40)), 20 + Math.floor(r2() * 80), 10 + Math.floor(r2() * 20)); }
	for (let k = 0; k < 12; k++) { f.fillStyle = 'rgb(90,80,70)'; f.fillRect(Math.floor(r2() * 660), FS + 20 + Math.floor(r2() * 150), 40, 20); }
	const frame = document.createElement('canvas'); frame.width = W; frame.height = H;
	const fx = frame.getContext('2d');
	const maxScroll = docH - CH;
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
	// stops: 0.75秒止まって 0.5秒で次の止まりへ、の繰り返し。止まり→止まりは 520〜600px（帯の 72〜83%。止まりだけでつながる）。
	// 祖1・祖2 の頭は止まっているときに窓（帯の上から 8〜172px）に入る（1560 で 76px・2700 で 148px）
	const stopAt = [0, 520, 1040, 1560, 2100, 2700, 3260, maxScroll];
	const stops = [[0, 0]];
	{ let t = 0.75; for (let k = 1; k < stopAt.length; k++) { stops.push([t, stopAt[k - 1]], [t + 0.5, stopAt[k]]); t += 1.25; } stops.push([t + 0.75, maxScroll]); }
	// 祖1 の頭（heads[1]）が帯の上から 300px（窓 172px の少し下）で止まり、次のスワイプで窓を飛び越える。
	// passSlow: 0.25秒で 500px（となりどうしは測れる＝細かく取り直さない）／passFast: 0.25秒で 900px（帯より速い＝細かく取り直す。動画B）
	const h1 = heads[1] - 300;
	const pass = (jump) => [[0, 0], [0.5, 0], [2.5, h1], [3.5, h1], [3.75, h1 + jump], [4.25, h1 + jump], [7.0, maxScroll], [8.0, maxScroll]];
	const PATHS = { stops, passSlow: pass(500), passFast: pass(900) };
	function make(o) {
		o = o || {};
		const path = PATHS[o.path || 'stops'];
		const pos = lerpPath(path);
		const duration = path[path.length - 1][0] + 0.5;
		const rnd = rng(o.seed || 1);
		const stat = { fullDraws: 0, staleDraws: 0, waitDraws: 0, effectDraws: 0 };
		let lastT = 0;
		const moving = (t) => pos(Math.max(0, t - 0.02)) !== pos(Math.min(duration, t + 0.02));
		return {
			stat, pos, moving, W, H, HE, FS, CH, heads, green, docH, maxScroll, duration, doc,
			source: UmaVideoFrames.canvasSource({
				width: W, height: H, duration,
				draw(t, ctx, dw, dh, how) {
					const isFull = dw === W;
					let tt = t;
					if (isFull) { stat.fullDraws++; if (how && how.waitFrame) stat.waitDraws++; }
					if (o.perturb === 'stale' && isFull && !(how && how.waitFrame)) { tt = lastT; stat.staleDraws++; }
					if (o.perturb === 'jitter') tt = Math.max(0, Math.min(duration - 0.01, t + (rnd() - 0.5) * 2 / 30));
					lastT = t;
					fx.drawImage(fixed, 0, 0);
					fx.drawImage(doc, 0, pos(tt), W, CH, 0, HE, W, CH);
					if (o.effect && moving(tt)) { stat.effectDraws++; fx.fillStyle = 'rgb(255,0,255)'; fx.beginPath(); fx.arc(W * 0.72, HE + CH * 0.7, 46, 0, Math.PI * 2); fx.fill(); }
					ctx.drawImage(frame, 0, 0, dw, dh);
				}
			})
		};
	}
	// 組み立てた人 j の画を、作り物の一覧の「頭から」と比べる。行ごとの平均の差が 24 を超える行の数（JPEG のにじみは 12 前後・段のずれは 60 前後）・全体の平均・赤紫の画素の数
	function compare(c, s, j) {
		const w = c.width, h = c.height;
		const a = c.getContext('2d').getImageData(0, 0, w, h).data;
		const top = s.heads[j];
		const expectH = (j + 1 < s.heads.length ? s.heads[j + 1] : s.green) - s.heads[j];
		// 先頭と末尾の1〜2行は頭・次の頭・緑の帯の切り方で揺れる（高さは ±2px を認める）ので比べない
		const rows = Math.min(h, s.docH - top, expectH - 2);
		const b = s.doc.getContext('2d').getImageData(0, top, w, rows).data;
		let badRows = 0, sum = 0, n = 0, magenta = 0; const badAt = [];
		for (let y = 2; y < rows; y += 2) {
			let rs = 0, rn = 0;
			for (let x = 0; x < w; x += 3) { const k = (y * w + x) * 4; rs += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); rn += 3; }
			if (rs / rn > 24) { badRows++; if (badAt.length < 6) badAt.push(y + ":" + Math.round(rs / rn)); }
			sum += rs; n += rn;
		}
		for (let k = 0; k < a.length; k += 4) if (a[k] > 200 && a[k + 1] < 90 && a[k + 2] > 200) magenta++;
		return { h, expectH, badRows, badAt, mean: +(sum / n).toFixed(2), magenta };
	}
	async function run(o, labels) {
		const s = make(o);
		const dbg = {}; const sel = await UmaVideoFrames.selectFrames(s.source, { labels: labels || ['親', '祖1', '祖2'], debug: o.debug ? dbg : null });
		const persons = [];
		for (let j = 0; j < sel.persons.length; j++) {
			const p = sel.persons[j];
			const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label);
			persons.push(Object.assign({ label: p.label, n: p.files.length, shifts: p.shifts, headY: s.heads[j] - s.pos(p.times[0]), uncertain: p.uncertain.filter(Boolean).length }, compare(c, s, j)));
		}
		const pickPos = sel.picks.map((t) => s.pos(t));
		return {
			persons, picks: sel.picks, pickPos, anchors: sel.anchors, stats: sel.stats, stat: s.stat, W: s.W, CH: s.CH, track: dbg.track, seams: sel.seams,
			movingPicks: sel.picks.filter((t) => s.moving(t)).length,
			// となりの止まりとの間が帯の 85% 以下なのに動いている1枚を選んだ数（anchors は除く）
			increasing: pickPos.every((v, k) => k === 0 || v - pickPos[k - 1] >= 20)
		};
	}
	return { make, run };
})();
`;

export async function register100(env) {
	const { block, assert, browser, base } = env;

	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(120000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t85.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t85.html');
		await page.addScriptTag({ content: SYNTH85 });
		return { ctx, page, errors };
	};
	// 3人に分かれ、どの人も一覧と画素で合う（重複・欠け・人の取り違えなし）
	const okPersons = (r) => r.persons.length === 3 && r.persons.every((p) => p.badRows === 0 && p.mean < 4 && Math.abs(p.h - p.expectH) <= 2);
	const show = (r) => r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 平均' + p.mean);

	await block('T85動画の品質(1) 止まっている1枚を選ぶ: 止まりだけでつながる動画は動いている1枚を選ばず、動いている間だけ出る印（エフェクトのまね）が結合画像に入らない', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth85.run({ path: 'stops', effect: true }));
		assert(okPersons(r), 'T85動画の品質(1) 3人に分かれ、どの人も一覧と画素で合う（' + show(r).join('／') + '）', r.persons);
		assert(r.stat.effectDraws > 0 && r.movingPicks === 0, 'T85動画の品質(1) 選んだ ' + r.picks.length + '枚がすべて止まっているフレーム（印を描いたフレーム ' + r.stat.effectDraws + '枚は選ばない）', { picks: r.picks, moving: r.movingPicks });
		assert(r.persons.every((p) => p.magenta === 0), 'T85動画の品質(1) 結合画像に印（赤紫）の画素が無い', r.persons.map((p) => p.magenta));
		assert(r.stats.stillRuns > 0 && r.stats.stillPicks >= r.picks.length - 1, 'T85動画の品質(1) 止まっている区間（' + r.stats.stillRuns + '）の真ん中を選ぶ（止まっている候補 ' + r.stats.stillPicks + '枚）', r.stats);
		assert(r.increasing, 'T85動画の品質(1) 選んだ位置は 20px 以上ずつ下へ進む（止まっている区間で同じ画を2枚選ばない）', r.pickPos);
		assert(errors.length === 0, 'T85動画の品質(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T85動画の品質(2) 取り直しで古い画が出る（stale のまね）: 縮小画と比べて合わないことに気づき、次の画を待って取り直す・結合画像は一覧と合う', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth85.run({ path: 'stops', perturb: 'stale' }));
		assert(okPersons(r), 'T85動画の品質(2) 3人に分かれ、どの人も一覧と画素で合う（' + show(r).join('／') + '）', r.persons);
		assert(r.stat.staleDraws > 0 && r.stats.grabMismatch > 0 && r.stats.grabFixed === r.stats.grabMismatch && r.stat.waitDraws > 0, 'T85動画の品質(2) 古い画 ' + r.stat.staleDraws + '回に気づき（' + r.stats.grabMismatch + '枚）、次の画を待って取り直して全部合う（' + r.stats.grabFixed + '枚）', { stat: r.stat, stats: r.stats });
		assert(r.persons.every((p) => p.uncertain === 0), 'T85動画の品質(2) 確かでない継ぎ目が出ない', r.persons.map((p) => p.uncertain));
		assert(errors.length === 0, 'T85動画の品質(2) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T85動画の品質(3) どの描画も ±1/30秒ずれる（jitter のまね・種を変えて2回）: 3人に分かれ、結合画像は一覧と合う', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => [await __synth85.run({ path: 'stops', perturb: 'jitter', seed: 11 }), await __synth85.run({ path: 'stops', perturb: 'jitter', seed: 23 })]);
		r.forEach((x, k) => assert(okPersons(x), 'T85動画の品質(3) 種' + (k + 1) + ': 3人に分かれ、どの人も一覧と画素で合う（' + show(x).join('／') + '）', x.persons));
		assert(r.every((x) => x.increasing), 'T85動画の品質(3) 選んだ位置は 20px 以上ずつ下へ進む', r.map((x) => x.pickPos));
		assert(errors.length === 0, 'T85動画の品質(3) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T85動画の品質(4) 区切りの頭が窓（0.25W）の少し下で止まり、次のスワイプで飛び越える（動画B）: 3人に分かれ、祖1 の中身が入る', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => [await __synth85.run({ path: 'passSlow' }), await __synth85.run({ path: 'passFast' })]);
		const names = ['0.25秒で500px（測れる）', '0.25秒で900px（帯より速い）'];
		r.forEach((x, k) => {
			assert(x.anchors.length === 3 && okPersons(x), 'T85動画の品質(4) ' + names[k] + ': 3人に分かれ、どの人も一覧と画素で合う（' + show(x).join('／') + '）', { anchors: x.anchors, persons: x.persons });
			assert(x.persons.length === 3 && x.persons.every((p) => p.headY >= 8 && p.headY <= x.W * 0.25 - 8), 'T85動画の品質(4) ' + names[k] + ': 各人の1枚目は頭が帯の上から 0.25W 以内', x.persons.map((p) => p.headY));
		});
		assert(r[0].stats.densified > 0, 'T85動画の品質(4) 測れる速さでも、頭が窓に入るフレームを取り直して探す（取り直し ' + r[0].stats.densified + '枚）', r[0].stats);
		assert(errors.length === 0, 'T85動画の品質(4) コンソールのエラーなし', errors);
		await ctx.close();
	});
}
