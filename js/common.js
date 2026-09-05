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
// このファイルの版。ツールの開発用ログの先頭に表示される。
// 「どの版の common.js がブラウザで実際に動いているか」を確認するための目印。
// 中身を変更したらこの日付も更新すること。
const COMMON_JS_VERSION = '2026-09-06b';

const MAX_SIDE_PX = 3000;
const CONF_THRESHOLD = 55;
const ROW_TARGET_HEIGHT = 56;
const DARK_LEVEL = 128;
const ADAPTIVE_BLOCK = 31;
const ADAPTIVE_C = 12;

// 2026-09-06b 追加: 画質による事前足切り（下記「画質判定」セクション参照）のしきい値。
// X(旧Twitter)経由で再共有された画像や、「レシート因子メーカー」等で複数画像を
// 結合したうえで再圧縮された画像は、文字のストロークが画素として失われており、
// CHAR_CONFUSION_MAP や allowedDistance をどれだけ調整しても構造的に精度が出ないことを
// 実機画像（HLCQGwlbYAAqGcD.jpg, 730×1931）で確認済み。
// これらは「精度が悪い」のではなく「そもそも対象外の入力」として、OCRを試みる前に弾く。
// 値は実測1件からの暫定値。他の劣化画像で誤って弾く/弾けないケースが出たら調整すること。
const MIN_BASE_WIDTH_PX = 900;
const MIN_SHARPNESS_SCORE = 120;

const CHAR_CONFUSION_MAP = {
	'娩': '娘', '嫡': '娘', '棒': '枠', '桶': '枠', '狐': '狼', '颯': '狼', '貴': '覚', '緯': '線', '被': '神',
	// 2026-09-06 追加: 実機ログ「HRcRQWvbMAAE0Yc.jpg」の解析で見つかった誤読パターン。
	// 「時」⇔「春」は共に「日」を含み字形が近い。「量」⇔「重」「貸」⇔「賞」は
	// 「交流重賞〇」で確認された誤読で、いずれも他のスキル名にも登場しうる字のため
	// 個別の辞書登録ではなく汎用の文字混同マップ側に追加する。
	'時': '春', '量': '重', '貸': '賞'
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

/* ============================================================
 * 画質判定（低解像度・再圧縮画像の足切り）
 * ============================================================ */

/**
 * 簡易ラプラシアン分散によるシャープネス（鮮明度）スコア。
 * 値が小さいほど画像がぼやけている＝文字のストロークが潰れていることを示す。
 * 一般的な「ラプラシアンの分散でボケを検出する」手法の簡易実装で、
 * 3x3の代わりに上下左右4近傍のみを使う軽量版（画像全体を毎回舐めるため）。
 */
function sharpnessScore(gray, w, h) {
	if (w < 3 || h < 3) return 0;
	let sum = 0, sumSq = 0, n = 0;
	for (let y = 1; y < h - 1; y++) {
		const row = y * w, up = row - w, down = row + w;
		for (let x = 1; x < w - 1; x++) {
			const lap = 4 * gray[row + x] - gray[row + x - 1] - gray[row + x + 1] - gray[up + x] - gray[down + x];
			sum += lap;
			sumSq += lap * lap;
			n++;
		}
	}
	if (n === 0) return 0;
	const mean = sum / n;
	return sumSq / n - mean * mean;
}

/**
 * 画像がOCR対象として十分な品質かどうかを判定する。
 *
 * 背景: X(旧Twitter)での再共有や「レシート因子メーカー」等での複数画像結合を経た画像は、
 * 縮小・再圧縮により文字のストロークが画素として失われる。この劣化は行検出やOCRの
 * 前処理を工夫しても復元できない（＝情報自体が失われている）ため、辞書やしきい値の
 * チューニング対象ではなく、事前に弾くべき「対象外の入力」として扱う。
 *
 * 呼び出し側（special.html/index.html）は、ok:false の場合はOCRを試みずスキップし、
 * reasons を利用者に見える形で表示すること。
 *
 * 戻り値: { ok: boolean, width: number, height: number, sharpness: number|null, reasons: string[] }
 */
function assessImageQuality(baseCanvas) {
	const w = baseCanvas.width, h = baseCanvas.height;
	const reasons = [];
	let sharpness = null;
	try {
		const imageData = getPixels(baseCanvas);
		const gray = toGray(imageData);
		sharpness = sharpnessScore(gray, w, h);
	} catch (err) {
		reasons.push('鮮明度の計測に失敗しました: ' + err);
	}
	if (w < MIN_BASE_WIDTH_PX) {
		reasons.push(
			'画像の横幅が ' + w + 'px しかありません（目安 ' + MIN_BASE_WIDTH_PX + 'px 以上）。' +
			'SNSへの投稿・再共有や、複数画像を結合するツールを経由すると縮小されがちです。'
		);
	}
	if (sharpness !== null && sharpness < MIN_SHARPNESS_SCORE) {
		reasons.push(
			'画像の鮮明度が低い状態です（スコア ' + Math.round(sharpness) + ' / 目安 ' + MIN_SHARPNESS_SCORE + ' 以上）。' +
			'文字のストロークが潰れている可能性が高く、再圧縮や過度な縮小が繰り返された画像で起こりやすい現象です。'
		);
	}
	return { ok: reasons.length === 0, width: w, height: h, sharpness: sharpness, reasons: reasons };
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
	// このとき、信用できない計測（画像最下段の行や、ありえない0個）は根拠に使わない。
	if (trustworthyStars(a) && trustworthyStars(b) && a.stars !== b.stars) return true;
	return false;
}

function trustworthyStars(line) {
	if (!line || line.stars === null || line.stars === undefined) return false;
	if (line.stars === 0) return false;           // ★0はありえない＝計測に失敗している
	return line.starsReliable !== false;
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
 *
 * diagEntries（配列）を渡すと、判定の途中経過を1件のオブジェクトとして追記する。
 * 「なぜ解決できた／できなかったか」を開発ログで確認できるようにするための引数で、
 * 判定結果そのものには一切影響しない（省略しても従来通り動作する）。
 *   { text, norm, rowKey, tied, source: 'resolveTiedCandidates',
 *     candidates: [{ raw, alreadyDetected, provablyOther, checks: [{ otherRowKey, thisRowKey, result }] }],
 *     survivors, resolved }
 */
function resolveTiedCandidates(tiedRaws, line, detectedSkills, skillSources, lines, diagEntries, norm) {
	const candidateDiags = [];
	const survivors = tiedRaws.filter(raw => {
		if (!detectedSkills.has(raw)) {
			candidateDiags.push({ raw: raw, alreadyDetected: false, provablyOther: false, checks: [] });
			return true;
		}
		const sources = skillSources[raw] || [];
		const checks = sources.map(i => {
			const other = lines[i];
			return {
				otherRowKey: other ? (other.rowKey || null) : null,
				thisRowKey: line ? (line.rowKey || null) : null,
				result: isDifferentRow(other, line)
			};
		});
		const provablyOther = checks.some(c => c.result);
		candidateDiags.push({ raw: raw, alreadyDetected: true, provablyOther: provablyOther, checks: checks });
		return !provablyOther;
	});
	const resolved = survivors.length === 1 ? survivors[0] : null;
	if (diagEntries) {
		diagEntries.push({
			text: line ? line.text : null,
			norm: norm || null,
			rowKey: line ? (line.rowKey || null) : null,
			tied: tiedRaws.slice(),
			source: 'resolveTiedCandidates',
			candidates: candidateDiags,
			survivors: survivors.slice(),
			resolved: resolved
		});
	}
	return resolved;
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
 *     skillSources:   { [rawSkillName]: [行index, ...] },  // 検出根拠になった行
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
	// 曖昧タイ（同着候補）の絞り込み過程を記録する。resolveTiedCandidates() 参照。
	const devAmbiguous = [];

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
		const seenKey = norm + ' ' + (line.rowKey || '');
		if (seen.has(seenKey)) return;
		seen.add(seenKey);

		if (normDictionary[norm]) {
			const target = normDictionary[norm];
			if (skillList.indexOf(target) !== -1) {
				addDetection(target, index, '辞書');
				if (line.rowKey) rowAssigned[line.rowKey] = true;
			}
			return;
		}

		// 部分一致（indexOf）で候補を集める。
		// 例えば「根幹距離○」と「非根幹距離○」のように、片方がもう片方の部分文字列に
		// なっているスキル名が同じスキルリストに存在すると、OCR行「非根幹距離○」に対して
		// 「根幹距離○」も誤って一致してしまう。これを避けるため、一致した候補同士を比較し、
		// 他の候補の正規化文字列に完全に含まれてしまう（＝より具体的な候補が別にある）ものは
		// 誤検出とみなして除外し、最も具体的な（長い）候補だけを採用する。
		const exactCandidates = [];
		for (let i = 0; i < skillIndex.length; i++) {
			const s = skillIndex[i];
			if (s.norm && norm.indexOf(s.norm) !== -1) exactCandidates.push(s);
		}
		if (exactCandidates.length > 0) {
			const exactHits = exactCandidates.filter(cand =>
				!exactCandidates.some(other => other !== cand && other.norm !== cand.norm && other.norm.indexOf(cand.norm) !== -1)
			);
			exactHits.forEach(s => addDetection(s.raw, index, '完全一致'));
			if (line.rowKey && exactHits.length > 0) rowAssigned[line.rowKey] = true;
			return;
		}

		if (line.conf !== null && line.conf !== undefined && line.conf < CONF_THRESHOLD) {
			devLowConf.push({ text: line.text, norm: norm, conf: line.conf });
			return;
		}

		pendingFuzzy.push({ line: line, norm: norm, index: index });
	});

	// 第2パス：あいまい一致（distance判定・曖昧タイの絞り込み）。
	// この時点で detectedSkills には全行の辞書・完全一致の結果が反映済み。
	const resolvedByText = {}; // 正規化文字列 → 曖昧タイから絞り込めたスキル名
	pendingFuzzy.forEach(({ line, norm, index }) => {
		// 元画像の同じ行が既に完全一致で確定している場合、この行はその行の
		// 「別の読み取り結果（誤読版）」にすぎない。別のスキルとして数えると
		// 字面の近い無関係なスキルを過剰検出してしまうため、ここで捨てる。
		if (line.rowKey && rowAssigned[line.rowKey]) return;

		let cand = bestCandidate(norm, skillIndex);
		if (cand && !cand.ok && cand.tied && cand.tied.length > 1) {
			// 同じ誤読文字列は同じスキルを指すはずなので、一度絞り込めた結果を使い回す。
			// （重なったスクショで同じ項目が何度も同じように誤読されるため）
			let picked = (resolvedByText[norm] && cand.tied.indexOf(resolvedByText[norm]) !== -1) ? resolvedByText[norm] : null;
			if (picked) {
				devAmbiguous.push({
					text: line.text, norm: norm, rowKey: line.rowKey || null,
					tied: cand.tied.slice(), source: 'キャッシュ再利用', candidates: [], survivors: [picked], resolved: picked
				});
			} else {
				picked = resolveTiedCandidates(cand.tied, line, detectedSkills, skillSources, lines, devAmbiguous, norm);
			}
			if (picked) {
				resolvedByText[norm] = picked;
				cand = { raw: picked, dist: cand.dist, limit: cand.limit, ok: true, reason: '曖昧→絞り込み' };
			}
		}

		if (cand && cand.ok) {
			addDetection(cand.raw, index, '推定（距離' + cand.dist + (cand.reason ? ' / ' + cand.reason : '') + '）');
			if (cand.dist > 0) {
				devFuzzy.push({ text: line.text, norm: norm, conf: line.conf, matched: cand.raw, dist: cand.dist });
			}
			return;
		}

		const entry = {
			text: line.text, norm: norm, conf: line.conf,
			best: cand ? cand.raw : null,
			dist: cand ? cand.dist : null,
			reason: cand ? cand.reason : '候補なし'
		};
		if (cand && cand.dist !== null && cand.dist <= cand.limit + 2) devTypo.push(entry);
		else devOther.push(entry);
	});

	return { detectedSkills, matchReasons, skillSources, devTypo, devLowConf, devOther, devFuzzy, devAmbiguous };
}

/* ============================================================
 * 星（★）検出 — special.html（因子継承の特化型ツール）専用
 *
 * ゲーム画面では、各スキル行の直下に「★★★」（0〜3個、達成分だけ金色）が
 * 表示される。星は明るい色（金色 or 背景とほぼ同化したグレー）のため、
 * 文字検出用の darkMaskOf には一切引っかからない。
 * そのため「金色ピクセルの検出」専用のマスクと、行と行の間（隙間）を
 * 星の探索エリアとして扱うロジックをここに追加する。
 *
 * これらの関数は index.html からは一切参照されない（追加のみ・既存動作に影響なし）。
 * ============================================================ */

function goldMaskOf(imageData) {
	const d = imageData.data;
	const n = imageData.width * imageData.height;
	const mask = new Uint8Array(n);
	for (let i = 0, p = 0; i < n; i++, p += 4) {
		const r = d[p], g = d[p + 1], b = d[p + 2];
		// 実機スクリーンショットで実測した金色★の色（おおよそ R255 G207-240 B37-125）に基づく判定。
		// 未達成の★（グレー、背景とほぼ同色）や他のUI装飾色（青・ピンク・緑のタブ等）は
		// R-B の差が小さいためここでは弾かれる。
		if (r > 200 && g > 140 && (r - b) > 60) mask[i] = 1;
	}
	return mask;
}

/**
 * 星の探索エリア（x0..x1, y0..y1）内にある「金色の塊」の個数を数える。
 * 星3つは横に並んで配置されており、間に隙間があるため、
 * 列方向（x軸）に金色ピクセルが存在するかどうかの真偽配列を作り、
 * 連続する true の区間（=1つの星）の数を数える。
 * アンチエイリアスによる小さな穴は mergeGap で埋めて1つの星として扱う。
 * 星は最大3個までなので、念のため3で頭打ちにする。
 */
function countGoldBlobs(mask, W, x0, x1, y0, y1) {
	x0 = Math.max(0, x0); x1 = Math.min(W, x1);
	if (x1 <= x0 || y1 <= y0) return 0;
	const colHas = new Uint8Array(x1 - x0);
	for (let y = y0; y < y1; y++) {
		const base = y * W;
		for (let x = x0; x < x1; x++) {
			if (mask[base + x]) colHas[x - x0] = 1;
		}
	}
	// 星と星の実際の間隔は実測で2px程度（≒falseが2列連続）であるのに対し、
	// 星1個の中のアンチエイリアシングによる穴は1px程度で収まることを実データで確認済み。
	// そのため、ここでは「falseが1列だけなら同じ星の続き」とみなし、2列以上は別の星として扱う。
	const mergeGap = 1;
	let count = 0;
	let inRun = false;
	let gapSinceRun = 0;
	for (let i = 0; i < colHas.length; i++) {
		if (colHas[i]) {
			if (!inRun) {
				// 直前の区間からの隙間が小さければ同じ星の続きとみなす
				if (gapSinceRun > 0 && gapSinceRun <= mergeGap && count > 0) {
					// 継続扱い（新しい星としてカウントしない）
				} else {
					count++;
				}
				inRun = true;
			}
			gapSinceRun = 0;
		} else {
			if (inRun) { inRun = false; gapSinceRun = 1; }
			else if (gapSinceRun > 0) gapSinceRun++;
		}
	}
	return Math.min(3, count);
}

/**
 * detectSkillRows() の結果（rows / bands / columnXs）をもとに、
 * 各行の直下（次の文字帯が始まる直前まで）を星の探索エリアとして、
 * 行ごとの★の数（0〜3）を計算する。
 *
 * 戻り値: rows と同じ順序・同じ長さの配列。要素は { stars: number, reliable: boolean }
 *
 * reliable=false は「★の領域を正しく囲えていない可能性がある計測」を意味する。
 * 画像の一番下の行は次の文字帯が存在しないため探索範囲の下端を決められず、
 * ★が画面外で切れていれば少なく、次の項目まで拾えば多く数えてしまう。
 * スクショは重ねて撮られており同じ項目が別画像にも写っているので、
 * 呼び出し側は reliable な計測を優先して採用する。
 */
function computeRowStarCounts(baseCanvas, detection) {
	const W = baseCanvas.width, H = baseCanvas.height;
	const imageData = getPixels(baseCanvas);
	const gold = goldMaskOf(imageData);
	const bands = detection.bands || [];
	const columnXs = detection.columnXs || [];

	// 文字帯どうしの隙間（＝★が描かれる帯）の標準的な高さを実測から求める。
	const gaps = [];
	for (let i = 0; i + 1 < bands.length; i++) gaps.push(bands[i + 1].a - bands[i].b);
	const medGap = gaps.length ? median(gaps) : 0;

	return detection.rows.map(row => {
		const band = bands[row.band];
		if (!band) return { stars: 0, reliable: false };
		const nextBand = bands[row.band + 1];
		const rowH = band.b - band.a + 1;
		const y0 = band.b + 1;
		let y1, reliable;
		if (nextBand) {
			y1 = nextBand.a - 1;
			reliable = true;
		} else {
			// 次の文字帯がない＝画像の最下段。標準的な隙間の高さで代用する
			// （従来は行高の4倍まで見ていたため、次の項目の★まで数えてしまうことがあった）。
			y1 = band.b + (medGap > 0 ? medGap : Math.round(rowH * 2));
			// 画像の高さには収まっていても、リスト表示枠の下端で★が切れていることがある
			// （実測でも最下段は★が1つも写らず0個と数えられた）。枠の下端は判別できないため、
			// 最下段は一律「不確か」とし、重ねて撮られた別スクショの計測を優先させる。
			reliable = false;
			if (y1 > H) y1 = H;
		}
		if (y1 <= y0) return { stars: 0, reliable: false };

		const colX = columnXs[row.col];
		const nextColX = columnXs[row.col + 1];
		const marginRight = Math.round(W * 0.03);
		const x0 = (colX !== undefined) ? colX : row.x;
		const x1 = (nextColX !== undefined) ? (nextColX - marginRight) : W;

		const stars = countGoldBlobs(gold, W, x0, x1, y0, y1);
		return { stars: stars, reliable: reliable };
	});
}

/**
 * stackRows() と同様に複数行を1枚の画像へ縦に積み重ねるが、
 * 積み重ね後の画像内で「どの行が縦方向のどの範囲(y0〜y1)にあるか」を
 * あわせて返す。OCR結果（行ごとのbbox）を、元のどの行（＝どの★カウント）に
 * 対応するかを後から突き合わせるために必要な情報。
 */
function stackRowsWithMeta(baseCanvas, rows) {
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

	const placements = [];
	let y = gap;
	rows.forEach((r, i) => {
		ctx.drawImage(baseCanvas, r.x, r.y, r.w, r.h, padX, y, widths[i], heights[i]);
		placements.push({ rowIndex: i, y0: y, y1: y + heights[i] });
		y += heights[i] + gap;
	});
	return { canvas: canvas, placements: placements };
}

/**
 * Tesseract.js の recognize() 結果から、行テキストと行のbbox（縦方向の位置）を抽出する。
 * bboxが取得できない行は y0=y1=null とし、星カウントとの突き合わせができないものとして扱う。
 */
function extractLinesWithBBox(data) {
	const lines = [];
	if (data && Array.isArray(data.lines) && data.lines.length) {
		data.lines.forEach(l => {
			if (l.text && l.text.trim()) {
				const bbox = l.bbox || null;
				lines.push({
					text: l.text.trim(),
					conf: l.confidence,
					y0: bbox ? bbox.y0 : null,
					y1: bbox ? bbox.y1 : null
				});
			}
		});
	}
	return lines;
}

/**
 * stackRowsWithMeta() で作った合成画像をOCRした結果（extractLinesWithBBoxの出力）を、
 * 各行の placements（=どの元行がどのy範囲に配置されたか）と突き合わせ、
 * 「そのOCR行が何個の★を持つ行だったか」を求める。
 * bboxの中心yに最も近い placement を採用する（多少のズレに対してロバストにするため）。
 *
 * imageKey: 画像ごとに一意な文字列（":" を含めないこと）。
 *   これと行番号から rowKey（"画像:行"）を作り、「どのOCR行が元画像のどの行から
 *   来たか」を判定ロジック側でも使えるようにする。前処理を変えて同じ画像を
 *   読み直した結果は同じ rowKey になる。
 *
 * 戻り値: lines と同じ順序・同じ長さの配列。
 *   要素は { ...元のline, stars: number|null, starsReliable: boolean, rowKey: string|null }
 */
function attachStarsToLines(lines, placements, rowStarCounts, imageKey) {
	return lines.map(line => {
		if (line.y0 === null || line.y1 === null || !placements.length) {
			return Object.assign({}, line, { stars: null, starsReliable: false, rowKey: null });
		}
		const centerY = (line.y0 + line.y1) / 2;
		let best = null, bestDist = Infinity;
		placements.forEach(p => {
			const pCenter = (p.y0 + p.y1) / 2;
			const dist = Math.abs(centerY - pCenter);
			if (dist < bestDist) { bestDist = dist; best = p; }
		});
		const info = (best && rowStarCounts[best.rowIndex]) ? rowStarCounts[best.rowIndex] : null;
		return Object.assign({}, line, {
			stars: info ? info.stars : null,
			starsReliable: info ? (info.reliable !== false) : false,
			rowKey: best ? (String(imageKey === undefined ? '' : imageKey) + ':' + best.rowIndex) : null
		});
	});
}

/**
 * あるスキルを検出した根拠の行（複数ありうる）から、★の数を1つに決める。
 *
 * 同じ項目はスクショの重なりや前処理違いで何度も読まれるため、計測値も複数得られる。
 * 探索範囲を正しく囲えた計測（reliable）を優先し、その中の最頻値を採用する。
 * 同数で並んだ場合は、次の項目の★まで数えてしまう方向の誤りを避けるため小さい方を採る。
 */
function pickStarsFromSources(sourceIndexes, lines) {
	const obs = [];
	(sourceIndexes || []).forEach(i => {
		const l = lines[i];
		if (!l || l.stars === null || l.stars === undefined) return;
		// ★0 はゲーム上ありえない（★が0個の因子はスキル名自体が表示されない）。
		// 0と出た計測は、★が画面外で切れている等の失敗なので採用しない。
		if (l.stars === 0) return;
		obs.push(l);
	});
	if (obs.length === 0) return null;
	const reliable = obs.filter(o => o.starsReliable !== false);
	const pool = reliable.length > 0 ? reliable : obs;

	const counts = {};
	pool.forEach(o => { counts[o.stars] = (counts[o.stars] || 0) + 1; });
	let bestValue = null, bestCount = -1;
	Object.keys(counts).map(Number).sort((a, b) => a - b).forEach(v => {
		if (counts[v] > bestCount) { bestCount = counts[v]; bestValue = v; }
	});
	return bestValue;
}

/**
 * matchAllSkills() の★対応版。ロジックの大枠（正規化・辞書・完全一致・あいまい一致）は
 * matchAllSkills と同一だが、マッチしたスキルに対して「そのOCR行に紐づく★の数」も記録する。
 *
 * 引数の lines は attachStarsToLines() の出力（各要素が { text, conf, stars } を持つ）。
 *
 * 戻り値: matchAllSkills の戻り値に加えて、
 *   skillStars: { [rawSkillName]: number|null }  … 検出できたスキルの★の数
 */
function matchAllSkillsWithStars(lines, skillList, skillIndex, ocrErrorDictionary) {
	const base = matchAllSkills(lines, skillList, skillIndex, ocrErrorDictionary);
	const skillStars = {};

	// ★は「そのスキルを検出した根拠の行」から取る。
	// 以前はここで行を距離計算により探し直していたが、それでは
	// 例えば「中距離コーナー○」の★を、字面が1文字違いの
	//「短距離コーナー○」の行から取ってしまうことがあった。
	// 判定時に記録済みの skillSources を使えば、その取り違えは起こらない。
	base.detectedSkills.forEach(skillName => {
		skillStars[skillName] = pickStarsFromSources(base.skillSources[skillName], lines);
	});

	return Object.assign({}, base, { skillStars: skillStars });
}
