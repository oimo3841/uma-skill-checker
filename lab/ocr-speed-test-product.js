// lab/ocr-speed-test.html が使う、special.html の中の関数の写し（T184・2026-11-13・origin/main 0f6db8b の special.html から）。
// 製品の OCR と同じ前処理・同じ行の切り出し・同じ★の数え方で画像を整えるために、本文を一字も変えずに写した。
// 製品の側が変わったら、検査（tests/visual/blocks-177.mjs）が「写しが製品と違う」で NG にする。そのときはこの写しを取り直す。
// 使う common.js（凍結）の関数・定数: getPixels・toGray・DARK_LEVEL・goldMaskOf・median。
// 写した関数: maskScrollbarThumb・restoreScrollbarThumb・rowGoldRuns・estimateStarSlots・countStarsInSlots・computeRowStarCountsSpecial

function maskScrollbarThumb(base, diag) {
	const W = base.width, H = base.height, x0 = Math.round(W * 0.9);
	if (x0 >= W) return null;
	const gray = toGray(getPixels(base));
	const minRun = Math.round(H * 0.03);
	const runs = [];
	for (let x = x0; x < W; x++) {
		let a = -1;
		for (let y = 0; y <= H; y++) {
			const dk = y < H && gray[y * W + x] < DARK_LEVEL;
			if (dk && a < 0) a = y;
			if (!dk && a >= 0) { if (y - a >= minRun) runs.push([x, a, y - a]); a = -1; }
		}
	}
	if (!runs.length) return null;
	const ctx = base.getContext('2d');
	const saved = { x: x0, data: ctx.getImageData(x0, 0, W - x0, H) };
	ctx.fillStyle = '#fff';
	const cols = new Set();
	runs.forEach(r => { ctx.fillRect(r[0], r[1], 1, r[2]); cols.add(r[0]); });
	diag.push('右端の縦に長い暗い列（スクロールバーのつまみ）を白で塗った（' + cols.size + '列）');
	return saved;
}

function restoreScrollbarThumb(base, saved, diag) {
	if (!saved) return;
	base.getContext('2d').putImageData(saved.data, saved.x, 0);
	diag.push('行が取れないので、つまみを塗る前の画に戻した');
}

function rowGoldRuns(mask, W, x0, x1, y0, y1) {
	x0 = Math.max(0, x0); x1 = Math.min(W, x1);
	const runs = [];
	if (x1 <= x0 || y1 <= y0) return runs;
	const top = new Int32Array(x1 - x0).fill(-1), bot = new Int32Array(x1 - x0).fill(-1);
	for (let y = y0; y < y1; y++) { const b = y * W; for (let x = x0; x < x1; x++) if (mask[b + x]) { const k = x - x0; if (top[k] < 0) top[k] = y; bot[k] = y; } }
	for (let i = 0; i < top.length; i++) {
		if (top[i] < 0) continue;
		const last = runs[runs.length - 1];
		if (last && i - last.b <= 2) { last.b = i; if (top[i] < last.yt) last.yt = top[i]; if (bot[i] > last.yb) last.yb = bot[i]; }
		else runs.push({ a: i, b: i, yt: top[i], yb: bot[i] });
	}
	return runs.map(q => ({ x0: x0 + q.a, x1: x0 + q.b, w: q.b - q.a + 1, yt: q.yt, yb: q.yb }));
}

function estimateStarSlots(rows, W, medGap) {
	if (!(medGap > 0)) return null;
	const offs = [], ws = [], pitches = [];
	rows.forEach(r => {
		const clean = r.runs.filter(q => {
			const cy = ((q.yt + q.yb) / 2 - r.bandB) / medGap;
			return q.w >= W * 0.022 && q.w <= W * 0.034 && cy > 0.15 && cy < 0.4;
		});
		clean.forEach((q, k) => { offs.push(q.x0 - r.x0); ws.push(q.w); if (k) pitches.push(q.x0 - clean[k - 1].x0); });
	});
	if (offs.length < 4 || !pitches.length) return null;
	const near = pitches.filter(p => p > W * 0.025 && p < W * 0.045);
	const pitch = near.length ? median(near) : median(pitches);
	const starW = median(ws);
	// 1つ目の置き場所: 位置を 3px ごとにまとめ、きれいな★の 15%（最低2つ）以上が集まる所のうち、いちばん左
	const bins = new Map();
	offs.forEach(o => { const k = Math.round(o / 3) * 3; bins.set(k, (bins.get(k) || 0) + 1); });
	const need = Math.max(2, offs.length * 0.15);
	let s1 = null;
	bins.forEach((n, k) => { if (n >= need && (s1 === null || k < s1)) s1 = k; });
	return s1 === null ? null : { s1: s1, pitch: pitch, starW: starW };
}

function countStarsInSlots(runs, x0, W, slots) {
	const minW = Math.max(3, Math.round(W * 0.005));
	let n = 0;
	for (let k = 0; k < 3; k++) {
		const a = x0 + slots.s1 + k * slots.pitch - 2, b = a + slots.starW + 4;
		if (runs.some(q => q.w >= minW && Math.min(b, q.x1 + 1) - Math.max(a, q.x0) >= Math.min(slots.starW * 0.3, q.w * 0.6))) n++;
	}
	return n;
}

function computeRowStarCountsSpecial(baseCanvas, detection) {
	const W = baseCanvas.width, H = baseCanvas.height;
	const gold = goldMaskOf(getPixels(baseCanvas));
	const bands = detection.bands || [];
	const columnXs = detection.columnXs || [];
	const gaps = [];
	for (let i = 0; i + 1 < bands.length; i++) gaps.push(bands[i + 1].a - bands[i].b);
	const medGap = gaps.length ? median(gaps) : 0;
	const items = detection.rows.map(row => {
		const band = bands[row.band];
		if (!band) return null;
		const nextBand = bands[row.band + 1];
		const rowH = band.b - band.a + 1;
		const y0 = band.b + 1;
		let y1, reliable;
		if (nextBand) {
			// 案B: 次の文字帯が遠い行は、すきまの中央値まで
			y1 = (medGap > 0 && nextBand.a - band.b > medGap * 1.6) ? band.b + medGap : nextBand.a - 1;
			reliable = true;
		} else {
			y1 = band.b + (medGap > 0 ? medGap : Math.round(rowH * 2));
			reliable = false;
			if (y1 > H) y1 = H;
		}
		if (y1 <= y0) return null;
		const colX = columnXs[row.col];
		const nextColX = columnXs[row.col + 1];
		const x0 = (colX !== undefined) ? colX : row.x;
		const x1 = (nextColX !== undefined) ? (nextColX - Math.round(W * 0.03)) : W;
		return { x0: Math.max(0, x0), bandB: band.b, runs: rowGoldRuns(gold, W, x0, x1, y0, y1), reliable: reliable };
	});
	// T179（S7）: 置き場所を推定できた画は置き場所で、できない画は今までどおり連なりの数で
	const slots = estimateStarSlots(items.filter(it => it), W, medGap);
	const minW = Math.max(3, Math.round(W * 0.005));
	return items.map(it => {
		if (!it) return { stars: 0, reliable: false };
		const stars = slots ? countStarsInSlots(it.runs, it.x0, W, slots) : Math.min(3, it.runs.filter(q => q.w >= minW).length);
		return { stars: stars, reliable: it.reliable };
	});
}

