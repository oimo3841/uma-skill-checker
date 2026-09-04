/**
 * common.js
 * ウマ娘スキル管理ツール群（index.html / special.html）で共有する共通ロジック。
 *
 * 設計方針:
 * - このファイルはグローバル状態を持たない（副作用のない関数の集合）。
 * - 各ツール（index.html, special.html）は自分自身の状態変数
 *   （skillList, detectedSkills, matchReasons など）を保持し、
 *   ここに定義された関数へ引数として渡し、戻り値を受け取って自分の状態に反映する。
 * - スキルリストの内容（特定の技名など）に関する決め打ち・ハードコードは行わない。
 *   どんなスキルリストが来ても汎用的に正しく動くことを前提に設計する。
 */

/* ============================================================
 * 定数
 * ============================================================ */
const MAX_SIDE_PX = 3000;
const CONF_THRESHOLD = 55;
const ROW_TARGET_HEIGHT = 56;
const DARK_LEVEL = 128;
const ADAPTIVE_BLOCK = 31;
const ADAPTIVE_C = 12;

const CHAR_CONFUSION_MAP = {
	'娩': '娘', '嫡': '娘', '棒': '枠', '桶': '枠', '狐': '狼', '颯': '狼', '貴': '覚', '緯': '線', '被': '神'
};
const HOMOGLYPH_MAP = {
	'◯': '○', '〇': '○', '◎': '○', '●': '○', '◉': '○', '0': '○', 'O': '○', 'o': '○', 'Q': '○', 'D': '○', '°': '○',
	'一': 'ー', '-': 'ー', '‐': 'ー', '–': 'ー', '—': 'ー', '−': 'ー', '~': 'ー', '_': 'ー', '|': 'ー', 'l': 'ー', 'I': 'ー',
	'カ': '力', 'ニ': '二', '口': 'ロ', '卜': 'ト', '夕': 'タ', '工': 'エ', '才': 'オ', '八': 'ハ', 'ヘ': 'へ', 'ベ': 'べ', 'ペ': 'ぺ', '刀': '力', '儿': 'ル', '厶': 'ム', '又': 'ス'
};

/* ============================================================
 * 文字正規化・距離判定
 * ============================================================ */
function normalizeText(input) {
	if (!input) return '';
	let s = String(input).normalize('NFKC');
	s = s.replace(/[\s　]/g, '');
	s = s.replace(/[★☆✦✧♪♫※・,.。、:：;；!！?？"'`()（）\[\]{}<>«»\\\/@#$%^&*+=]/g, '');
	let out = '';
	for (const ch of s) {
		let c = (CHAR_CONFUSION_MAP[ch] !== undefined) ? CHAR_CONFUSION_MAP[ch] : ch;
		c = (HOMOGLYPH_MAP[c] !== undefined) ? HOMOGLYPH_MAP[c] : c;
		out += c;
	}
	return out.replace(/ー{2,}/g, 'ー');
}

function levenshtein(a, b) {
	const la = a.length, lb = b.length;
	if (la === 0) return lb;
	if (lb === 0) return la;
	let prev = new Array(lb + 1), cur = new Array(lb + 1);
	for (let j = 0; j <= lb; j++) prev[j] = j;
	for (let i = 1; i <= la; i++) {
		cur[0] = i;
		const ca = a[i - 1];
		for (let j = 1; j <= lb; j++) {
			const cost = ca === b[j - 1] ? 0 : 1;
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
		}
		const tmp = prev; prev = cur; cur = tmp;
	}
	return prev[lb];
}

function allowedDistance(len) {
	// 3文字ちょうどのスキル名（例：「急降下」）はこれまで距離0（完全一致必須）
	// だったため、字形の近い1文字誤読（隆⇔降 など）だけで確定できないケースがあった。
	// 2文字以下はまだ誤爆リスクが高いので0のまま、3文字から緩和する。
	if (len <= 2) return 0;
	if (len <= 5) return 1;
	if (len <= 9) return 2;
	return 3;
}

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
 * 画像読み込み・キャンバス変換
 * ============================================================ */
function loadImage(file) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
		img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
		img.src = url;
	});
}

function toBaseCanvas(img) {
	const longSide = Math.max(img.naturalWidth, img.naturalHeight);
	const scale = longSide > MAX_SIDE_PX ? (MAX_SIDE_PX / longSide) : 1;
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(img.naturalWidth * scale);
	canvas.height = Math.round(img.naturalHeight * scale);
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	return canvas;
}

function scaleCanvas(canvas, targetWidth) {
	const scale = Math.max(1, Math.min(3, targetWidth / canvas.width));
	const out = document.createElement('canvas');
	out.width = Math.round(canvas.width * scale);
	out.height = Math.round(canvas.height * scale);
	const ctx = out.getContext('2d');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(canvas, 0, 0, out.width, out.height);
	return out;
}

function getPixels(canvas) {
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/* ============================================================
 * 画像処理（グレースケール化・二値化・マスク処理）
 * ============================================================ */
function toGray(imageData) {
	const d = imageData.data;
	const n = imageData.width * imageData.height;
	const gray = new Uint8ClampedArray(n);
	for (let i = 0, p = 0; i < n; i++, p += 4) {
		gray[i] = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) | 0;
	}
	return gray;
}

function greenMaskOf(imageData) {
	const d = imageData.data;
	const n = imageData.width * imageData.height;
	const mask = new Uint8Array(n);
	for (let i = 0, p = 0; i < n; i++, p += 4) {
		const r = d[p], g = d[p + 1], b = d[p + 2];
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		const delta = max - min;
		if (delta === 0 || max < 90) continue;
		if (delta / max < 0.35) continue;
		if (max !== g) continue;
		let h = 60 * (2 + (b - r) / delta);
		if (h >= 65 && h <= 170) mask[i] = 1;
	}
	return mask;
}

function darkMaskOf(gray, level) {
	const mask = new Uint8Array(gray.length);
	for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < level ? 1 : 0;
	return mask;
}

function rowCountsOf(mask, w, h) {
	const out = new Int32Array(h);
	for (let y = 0; y < h; y++) {
		let c = 0;
		const base = y * w;
		for (let x = 0; x < w; x++) c += mask[base + x];
		out[y] = c;
	}
	return out;
}

function colCountsOf(mask, w, yFrom, yTo) {
	const out = new Int32Array(w);
	for (let y = yFrom; y <= yTo; y++) {
		const base = y * w;
		for (let x = 0; x < w; x++) out[x] += mask[base + x];
	}
	return out;
}

function findRuns(counts, threshold, mergeGap, from, to) {
	const runs = [];
	let start = -1;
	for (let i = from; i < to; i++) {
		if (counts[i] >= threshold) { if (start < 0) start = i; }
		else if (start >= 0) { runs.push({ a: start, b: i - 1 }); start = -1; }
	}
	if (start >= 0) runs.push({ a: start, b: to - 1 });
	if (runs.length === 0) return runs;
	const merged = [runs[0]];
	for (let i = 1; i < runs.length; i++) {
		const last = merged[merged.length - 1];
		if (runs[i].a - last.b - 1 <= mergeGap) last.b = runs[i].b;
		else merged.push(runs[i]);
	}
	return merged;
}

function median(arr) {
	if (!arr.length) return 0;
	const s = arr.slice().sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}

function stretchContrast(gray) {
	const hist = new Int32Array(256);
	for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
	const total = gray.length;
	const lowCut = total * 0.02, highCut = total * 0.98;
	let acc = 0, lo = 0, hi = 255;
	for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lowCut) { lo = v; break; } }
	acc = 0;
	for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= highCut) { hi = v; break; } }
	if (hi <= lo) return gray;
	const scale = 255 / (hi - lo);
	const out = new Uint8ClampedArray(gray.length);
	for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - lo) * scale;
	return out;
}

function adaptiveThreshold(gray, w, h, block, C) {
	const iw = w + 1;
	const integral = new Float64Array(iw * (h + 1));
	for (let y = 0; y < h; y++) {
		let rowSum = 0;
		const gBase = y * w, iBase = (y + 1) * iw, iPrev = y * iw;
		for (let x = 0; x < w; x++) {
			rowSum += gray[gBase + x];
			integral[iBase + x + 1] = integral[iPrev + x + 1] + rowSum;
		}
	}
	const out = new Uint8ClampedArray(w * h);
	const r = block >> 1;
	for (let y = 0; y < h; y++) {
		const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
		const rowH = y1 - y0 + 1;
		const iTop = y0 * iw, iBot = (y1 + 1) * iw;
		const gBase = y * w;
		for (let x = 0; x < w; x++) {
			const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
			const count = rowH * (x1 - x0 + 1);
			const sum = integral[iBot + x1 + 1] - integral[iTop + x1 + 1] - integral[iBot + x0] + integral[iTop + x0];
			out[gBase + x] = (gray[gBase + x] > sum / count - C) ? 255 : 0;
		}
	}
	return out;
}

function grayToCanvas(gray, w, h) {
	const canvas = document.createElement('canvas');
	canvas.width = w; canvas.height = h;
	const ctx = canvas.getContext('2d');
	const img = ctx.createImageData(w, h);
	const d = img.data;
	for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
		d[p] = d[p + 1] = d[p + 2] = gray[i];
		d[p + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	return canvas;
}

function invertGray(gray) {
	const out = new Uint8ClampedArray(gray.length);
	for (let i = 0; i < gray.length; i++) out[i] = 255 - gray[i];
	return out;
}

/* ============================================================
 * スキル行検出・切り出し
 * ============================================================ */
function detectSkillRows(baseCanvas, diag) {
	const W = baseCanvas.width, H = baseCanvas.height;
	let imageData;
	try { imageData = getPixels(baseCanvas); }
	catch (err) { diag.push('画素の取得に失敗: ' + err); return null; }

	const green = greenMaskOf(imageData);
	const gRows = rowCountsOf(green, W, H);
	const greenBands = findRuns(gRows, Math.round(W * 0.12), 4, 0, H);
	const thickGreen = greenBands.filter(b => (b.b - b.a) >= H * 0.008);

	let listTop = 0;
	if (thickGreen.length > 0) {
		const tab = thickGreen[thickGreen.length - 1];
		listTop = Math.min(H - 1, tab.b + Math.round(H * 0.004));
		diag.push('緑帯 ' + thickGreen.length + '本 / タブ下端 y=' + tab.b + ' → リスト上端 y=' + listTop);
	} else {
		diag.push('緑帯を検出できず → 画像全体をリスト領域として扱う');
	}

	const gray = toGray(imageData);
	const dark = darkMaskOf(gray, DARK_LEVEL);
	const dRows = rowCountsOf(dark, W, H);
	const rowThreshold = Math.max(5, Math.round(W * 0.01));
	const rowMergeGap = Math.max(6, Math.round(H * 0.004));
	let bands = findRuns(dRows, rowThreshold, rowMergeGap, listTop, H);
	diag.push('文字帯の候補 ' + bands.length + '本（しきい値 ' + rowThreshold + 'px / 結合gap ' + rowMergeGap + 'px）');

	if (bands.length < 3) { diag.push('文字帯が少なすぎるため中止'); return null; }

	const heights = bands.map(b => b.b - b.a + 1);
	const medH = median(heights);
	const before = bands.length;
	bands = bands.filter(b => {
		const h = b.b - b.a + 1;
		return h >= Math.max(8, medH * 0.55) && h <= medH * 2.0;
	});
	diag.push('高さフィルタ（中央値 ' + medH + 'px）: ' + before + ' → ' + bands.length + '本');
	if (bands.length < 3) { diag.push('フィルタ後の文字帯が少なすぎるため中止'); return null; }

	// ★アイコン（special.html の因子継承画面などで、スキル名の下に表示される★★★）は
	// 明るい金色だが、輪郭線部分がまれに「暗い文字」として誤検出され、
	// 本来1行のはずのスキル名の下にもう1本、実体のない「文字帯」が紛れ込むことがある。
	// これを放置すると行数が本来の約2倍に膨らみ、テキスト認識にもノイズが混入するため、
	// 「帯の中の金色ピクセル比率が高い」帯を ★アイコンの誤検出とみなして除外する。
	// 実測では、正規の文字帯は金色比率がほぼ0%、★の誤検出帯は4〜8%程度だったため、
	// 余裕を持って1.5%を閾値とする。
	// 注: 当初は「背が低い（medH比85%以下）」帯だけをこの判定対象にしていたが、
	// ★の誤検出帯の数が実文字帯と同程度〜それ以上になる画像では中央値自体が
	// ★帯側に引っ張られてしまい、高さによる事前選別が機能しないケースがあった。
	// 金色比率は実文字帯とほぼ完全に分離できる指標（0% 対 4〜8%）なので、
	// 高さに関わらず全ての帯に対して直接判定する。
	// index.html（★の出ない画面）ではそもそも金色ピクセルがほぼ存在しないため、
	// この処理は実質的に影響しない。
	const beforeStarFilter = bands.length;
	const gold = goldMaskOf(imageData);
	const goldRowCounts = rowCountsOf(gold, W, H);
	bands = bands.filter(b => {
		const h = b.b - b.a + 1;
		let goldCount = 0;
		for (let y = b.a; y <= b.b; y++) goldCount += goldRowCounts[y];
		const totalCount = h * W;
		const goldFrac = totalCount > 0 ? goldCount / totalCount : 0;
		return goldFrac <= 0.015;
	});
	if (bands.length !== beforeStarFilter) {
		diag.push('★アイコンの誤検出帯を除外: ' + beforeStarFilter + ' → ' + bands.length + '本');
	}
	if (bands.length < 3) { diag.push('フィルタ後の文字帯が少なすぎるため中止'); return null; }

	const gapThreshold = Math.max(18, Math.round(W * 0.03));
	const minBlockW = Math.max(10, Math.round(W * 0.02));
	const allBlocks = [];

	bands.forEach((band, bi) => {
		const cCounts = colCountsOf(dark, W, band.a, band.b);
		const runs = findRuns(cCounts, 1, gapThreshold, 0, W);
		runs.forEach(r => {
			if (r.b - r.a + 1 < minBlockW) return;
			allBlocks.push({ band: bi, x0: r.a, x1: r.b, y0: band.a, y1: band.b });
		});
	});

	diag.push('テキストの塊 ' + allBlocks.length + '個');
	if (allBlocks.length < 3) { diag.push('塊が少なすぎるため中止'); return null; }

	const tol = Math.max(12, Math.round(W * 0.02));
	const sorted = allBlocks.slice().sort((a, b) => a.x0 - b.x0);
	const clusters = [];
	let cur = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].x0 - cur[cur.length - 1].x0 <= tol) cur.push(sorted[i]);
		else { clusters.push(cur); cur = [sorted[i]]; }
	}
	clusters.push(cur);

	const columns = clusters.filter(c => c.length >= 3)
		.map(c => ({ x: median(c.map(b => b.x0)), members: c }))
		.sort((a, b) => a.x - b.x);

	if (columns.length === 0) { diag.push('列としてまとまる塊がないため中止'); return null; }
	diag.push('列 ' + columns.length + '本（左端 x=' + columns.map(c => c.x).join(', ') + '）');

	const rows = [];
	let dropped = 0;
	allBlocks.forEach(blk => {
		let hit = null;
		for (let i = 0; i < columns.length; i++) {
			if (Math.abs(blk.x0 - columns[i].x) <= tol * 1.5) { hit = i; break; }
		}
		if (hit === null) { dropped++; return; }
		const pad = 4;
		const x = Math.max(0, blk.x0 - pad);
		const y = Math.max(0, blk.y0 - pad);
		const w = Math.min(W - x, blk.x1 - blk.x0 + 1 + pad * 2);
		const h = Math.min(H - y, blk.y1 - blk.y0 + 1 + pad * 2);
		rows.push({ x: x, y: y, w: w, h: h, col: hit, band: blk.band });
	});

	diag.push('採用 ' + rows.length + '行 / 列外として除外 ' + dropped + '個');
	if (rows.length < 3) { diag.push('採用行が少なすぎるため中止'); return null; }

	rows.sort((a, b) => {
		if (a.band !== b.band) return a.band - b.band;
		return a.col - b.col;
	});

	return {
		rows: rows,
		columns: columns.length,
		listTop: listTop,
		// 以下2つは special.html の星カウント（★の数を数える処理）のために追加した情報。
		// index.html 側は参照しないため、既存動作には影響しない。
		bands: bands.map(b => ({ a: b.a, b: b.b })),
		columnXs: columns.map(c => c.x)
	};
}

function stackRows(baseCanvas, rows) {
	const scales = rows.map(r => Math.max(1, Math.min(4, ROW_TARGET_HEIGHT / r.h)));
	const widths = rows.map((r, i) => Math.round(r.w * scales[i]));
	const heights = rows.map((r, i) => Math.round(r.h * scales[i]));

	const gap = Math.round(ROW_TARGET_HEIGHT * 0.6);
	const padX = 30;
	const outW = Math.max(...widths) + padX * 2;
	let outH = gap;
	heights.forEach(h => { outH += h + gap; });

	const canvas = document.createElement('canvas');
	canvas.width = outW;
	canvas.height = outH;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#FFFFFF';
	ctx.fillRect(0, 0, outW, outH);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';

	let y = gap;
	rows.forEach((r, i) => {
		ctx.drawImage(baseCanvas, r.x, r.y, r.w, r.h, padX, y, widths[i], heights[i]);
		y += heights[i] + gap;
	});
	return canvas;
}

function preprocessVariants(canvas, multi) {
	const variants = [];
	try {
		const imageData = getPixels(canvas);
		const w = canvas.width, h = canvas.height;
		const gray = stretchContrast(toGray(imageData));
		const bin = adaptiveThreshold(gray, w, h, ADAPTIVE_BLOCK, ADAPTIVE_C);
		variants.push(grayToCanvas(bin, w, h));
		if (multi) {
			variants.push(grayToCanvas(invertGray(bin), w, h));
			variants.push(canvas);
		}
	} catch (err) {
		console.error('preprocess failed', err);
		return [canvas];
	}
	return variants.length ? variants : [canvas];
}

function extractLines(data) {
	const lines = [];
	if (data && Array.isArray(data.lines) && data.lines.length) {
		data.lines.forEach(l => {
			if (l.text && l.text.trim()) lines.push({ text: l.text.trim(), conf: l.confidence });
		});
	} else if (data && data.text) {
		data.text.split(/\r?\n/).forEach(t => {
			if (t.trim()) lines.push({ text: t.trim(), conf: null });
		});
	}
	return lines;
}

/* ============================================================
 * 判定ロジック
 * ============================================================ */
function windowDistance(line, skill) {
	return levenshtein(line, skill);
}

/**
 * 1つのOCR行（正規化済み文字列）に対し、skillIndexの中から最良候補を選ぶ。
 * skillIndex: [{ raw: '元のスキル名', norm: '正規化済み文字列' }, ...]
 *
 * 同着タイ（複数のスキルが同じ距離・同じ長さで並ぶ）の場合はここでは決めず、
 * 並んだ候補を tied に入れて ok:false で返す。どう decide するかは呼び出し側
 * （matchAllSkills）が、行の位置情報など文字列以外の手がかりを使って判断する。
 *
 * 戻り値:
 *   null … 候補となるスキルが一つもない（skillIndexが空 等）
 *   { raw, dist, limit, ok: true }  … 確定採用できる候補が見つかった
 *   { raw, dist, limit, ok: false, reason, tied? } … 候補はあるが確定できない（しきい値超過 or 同点タイ）
 */
function bestCandidate(normLine, skillIndex) {
	const passing = [];
	let fallback = null;
	for (let i = 0; i < skillIndex.length; i++) {
		const raw = skillIndex[i].raw, norm = skillIndex[i].norm;
		if (!norm) continue;
		const d = windowDistance(normLine, norm);
		const limit = allowedDistance(norm.length);
		if (!fallback || d < fallback.dist) fallback = { raw: raw, dist: d, limit: limit };
		if (d <= limit) passing.push({ raw: raw, norm: norm, dist: d, limit: limit });
	}
	if (passing.length === 0) {
		if (!fallback) return null;
		return { raw: fallback.raw, dist: fallback.dist, limit: fallback.limit, ok: false, reason: '距離' + fallback.dist + ' > 許容' + fallback.limit };
	}
	passing.sort((a, b) => (a.dist - b.dist) || (b.norm.length - a.norm.length));
	const top = passing[0];
	const tied = passing.filter(p => p.dist === top.dist && p.norm.length === top.norm.length);
	if (tied.length > 1) {
		return { raw: top.raw, dist: top.dist, limit: top.limit, ok: false, reason: '曖昧', tied: tied.map(t => t.raw) };
	}
	return { raw: top.raw, dist: top.dist, limit: top.limit, ok: true };
}

/**
 * 2つのOCR行が「元画像の別々の行（別の項目）から来た」と断定できるかを判定する。
 *
 * rowKey は "画像番号:行番号" の形式で、同じ画像・同じ行から読まれた行（前処理違いの
 * 読み取り結果など）は同じ値になる。断定できないときは false を返す（＝安全側）。
 */
function isDifferentRow(a, b) {
	if (!a || !b || !a.rowKey || !b.rowKey) return false; // 位置情報がなければ断定しない
	if (a.rowKey === b.rowKey) return false;              // 同じ行の別の読み取り結果
	const imgA = String(a.rowKey).split(':')[0];
	const imgB = String(b.rowKey).split(':')[0];
	if (imgA === imgB) return true;                       // 同じ画像内の別の行 → 確実に別の項目
	// 別々の画像の場合、スクロールしながら撮ったスクショは重なっているため、
	// 同じ項目が両方に写っている可能性がある＝別物と断定できない。
	// ただし★の数が両方わかっていて食い違うなら、別の項目だと言える。
	if (a.stars !== null && a.stars !== undefined && b.stars !== null && b.stars !== undefined && a.stars !== b.stars) return true;
	return false;
}

/**
 * 同着タイになった候補を、文字列以外の手がかりで1つに絞り込む（絞れなければ null）。
 *
 * 考え方：タイに含まれるスキルのうち「既に別の行で見つかっていると断定できる」ものは、
 * この行の正体ではありえないので候補から外す。残りが1つならそれを採用する。
 * 逆に、既に見つかっていても『この行自体の別の読み取り結果かもしれない』場合
 * （＝同じ行、または重なった別画像で★の数も一致する）は外さない。
 * これを外してしまうと、同じ項目を読み直しただけの行が、
 * 字面の近い別スキルとして過剰に検出されてしまう。
 */
function resolveTiedCandidates(tiedRaws, line, detectedSkills, skillSources, lines) {
	const survivors = tiedRaws.filter(raw => {
		if (!detectedSkills.has(raw)) return true;
		const sources = skillSources[raw] || [];
		const provablyOther = sources.some(i => isDifferentRow(lines[i], line));
		return !provablyOther;
	});
	return survivors.length === 1 ? survivors[0] : null;
}

/**
 * OCRで得られた全行(lines)を、スキルリスト(skillIndex)と照合する。
 * グローバル変数には一切触れず、結果をまとめたオブジェクトを返す（純粋関数）。
 *
 * 引数:
 *   lines               … [{ text, conf }, ...]  extractLines() の出力を集約したもの
 *   skillList           … ['スキル名1', 'スキル名2', ...]  元の表記のリスト
 *   skillIndex          … [{ raw, norm }, ...]  skillList を正規化して付与したもの
 *   ocrErrorDictionary  … { '誤認識文字列': '正しいスキル名', ... }（空オブジェクトでも可）
 *
 * 戻り値:
 *   {
 *     detectedSkills: Set<string>,   // 検出済みスキル名（raw表記）の集合
 *     matchReasons:   { [rawSkillName]: string },  // 判定根拠の説明文
 *     devTypo:    [...], devLowConf: [...], devOther: [...], devFuzzy: [...]  // デバッグ用の内訳
 *   }
 */
function matchAllSkills(lines, skillList, skillIndex, ocrErrorDictionary) {
	const detectedSkills = new Set();
	const matchReasons = {};
	// スキル名 → そのスキルを検出した根拠となった行のindex配列。
	// 「そのスキルの★はどの行のものか」を後から正確に引くために必ず記録する。
	const skillSources = {};
	const devTypo = [], devLowConf = [], devOther = [], devFuzzy = [];

	const normDictionary = {};
	Object.keys(ocrErrorDictionary || {}).forEach(k => {
		normDictionary[normalizeText(k)] = ocrErrorDictionary[k];
	});

	function addDetection(skill, lineIndex, reason) {
		if (!detectedSkills.has(skill)) matchReasons[skill] = reason;
		detectedSkills.add(skill);
		if (!skillSources[skill]) skillSources[skill] = [];
		skillSources[skill].push(lineIndex);
	}

	const seen = new Set();
	// 辞書・完全一致で確定できなかった行は、いったんここに貯めておく。
	// 曖昧タイの絞り込みが行の並び順に関係なく全行の確定結果を使えるようにするため、
	// あいまい判定は全行の辞書・完全一致が出揃った後に第2パスとしてまとめて行う。
	const pendingFuzzy = [];
	// rowKey → その行の正体が完全一致・辞書で確定済みかどうか
	const rowAssigned = {};

	lines.forEach((line, index) => {
		const norm = normalizeText(line.text);
		if (!norm || norm.length < 2) return;
		// 同じ文字列でも「元画像の別の行」から来たものは別々に扱う（★の計測値が異なるため）。
		// rowKey を持たない場合（index.html 側）は、これまで通り文字列だけで重複排除する。
		const seenKey = norm + '
