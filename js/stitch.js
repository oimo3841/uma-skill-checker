/* ============================================================
 * 画像結合機能（スクロールキャプチャの縦結合＋複数人分の横結合）
 * ------------------------------------------------------------
 * exam.html / special.html の両方で使う共通ロジック。元は両ファイルに
 * ほぼ同一の実装が約700行ずつ重複しており、修正のたびに手動で両方へ
 * 反映する運用でズレるリスクがあったため、本ファイルに切り出した。
 * 各ファイル固有のUI組み立て（バナー描画・セット単位の結合処理など）は
 * 引き続き exam.html / special.html 側に残す。
 * OCRマッチング用の loadImage() は js/common.js のものをそのまま利用する
 * （同名関数の重複定義を避けるため、ここでは再定義しない）。
 * devGeometry は各HTML側で宣言されるグローバルな開発ログ配列を利用する。
 * ============================================================ */

// 画像結合用の簡易ログ。既存の開発ログ（devGeometry）に相乗りさせることで、
// 「開発ログを表示」チェックを入れれば結合処理の詳細も確認できるようにする。
function stitchLog(msg) {
	devGeometry.push('[画像結合] ' + msg);
}

function stitchImgToCanvas(img) {
	const c = document.createElement('canvas');
	c.width = img.naturalWidth;
	c.height = img.naturalHeight;
	const ctx = c.getContext('2d', { willReadFrequently: true });
	ctx.drawImage(img, 0, 0);
	return c;
}

// 【修正】左右端（キャラ切り替え用のナビ矢印など、明滅アニメーションする
// 装飾）だけの差分を「本文がスクロールしている」と誤検出しないよう、
// 比較対象を中央部（左右20%を除いた範囲）に限定する。本文のスクロールは
// 中央部を含む全幅で差分が出るが、ナビ矢印の明滅は左右端だけで中央部の
// 差分はゼロであることを実データで確認済み。
function stitchRowDiffSignal(canvasA, canvasB, sampleStep = 4) {
	const h = Math.min(canvasA.height, canvasB.height);
	const w = Math.min(canvasA.width, canvasB.width);
	const xStart = Math.floor(w * 0.2);
	const xEnd = Math.ceil(w * 0.8);
	const ctxA = canvasA.getContext('2d', { willReadFrequently: true });
	const ctxB = canvasB.getContext('2d', { willReadFrequently: true });
	const dataA = ctxA.getImageData(0, 0, w, h).data;
	const dataB = ctxB.getImageData(0, 0, w, h).data;
	const diff = new Float64Array(h);
	for (let y = 0; y < h; y++) {
		let sum = 0, cnt = 0;
		const rowOffset = y * w * 4;
		for (let x = xStart; x < xEnd; x += sampleStep) {
			const idx = rowOffset + x * 4;
			sum += Math.abs(dataA[idx] - dataB[idx]) + Math.abs(dataA[idx + 1] - dataB[idx + 1]) + Math.abs(dataA[idx + 2] - dataB[idx + 2]);
			cnt++;
		}
		diff[y] = sum / (cnt * 3);
	}
	return diff;
}

// ヘッダー（ウマ娘詳細・ステータス・タブ）／フッター（継承元の帯グラフ・
// 閉じるボタン）の境界を、アップロードされた画像同士のピクセル差分から検出する。
// 解像度に依存せず、DMM版・スマホ版のどちらでも同じロジックで機能する。
function stitchDetectHeaderFooter(canvases, groupLabel, threshold = 5) {
	let headerEnd = Infinity;
	let footerStart = -Infinity;
	for (let i = 0; i < canvases.length - 1; i++) {
		const diff = stitchRowDiffSignal(canvases[i], canvases[i + 1]);
		let first = -1;
		for (let y = 0; y < diff.length; y++) {
			if (diff[y] > threshold) { first = y; break; }
		}
		if (first === -1) {
			stitchLog(groupLabel + ': 警告: 画像' + i + 'と画像' + (i + 1) + 'で差分が検出できませんでした（同一画像の可能性）');
			continue;
		}
		// 【修正】「一番下の差分行」をfooterStartにすると、本文より下にある
		// 固定UI（閉じるボタン等）を挟んだ先の、ぼやけた背景バナーの
		// わずかな変化（本文のスクロールとは無関係）まで拾ってしまうことが
		// 実データで確認された。本文は差分が途切れずに連続するはずなので、
		// headerEnd相当の位置から、一定長（100行）以上差分が途切れた
		// 最初の地点を「本文の終わり」とみなす。
		const quietRunLen = 100;
		let run = 0, quietStart = -1;
		for (let y = first; y < diff.length; y++) {
			if (diff[y] <= threshold) {
				run++;
				if (run >= quietRunLen) { quietStart = y - run + 1; break; }
			} else {
				run = 0;
			}
		}
		const last = (quietStart !== -1) ? quietStart - 1 : diff.length - 1;
		headerEnd = Math.min(headerEnd, first);
		footerStart = Math.max(footerStart, last + 1);
		stitchLog(groupLabel + ': 画像' + i + '-' + (i + 1) + '間の差分範囲: 行' + first + ' 〜 行' + last + (quietStart !== -1 ? '（以降は静止区間として除外）' : ''));
	}
	if (!isFinite(headerEnd) || !isFinite(footerStart)) {
		throw new Error('[' + groupLabel + '] 全画像が同一、またはヘッダー/フッター境界を検出できませんでした。');
	}
	return { headerEnd: headerEnd, footerStart: footerStart };
}

// 【新規】footerStartに、スクロール位置に関係なく全画像で同一に描画される
// 固定UI（「閉じる」ボタン等）が紛れ込むことがある。画像の一番下から
// 上に向かって走査し、「全画像で完全に同一な行」が続く範囲（＝固定UI）を
// 検出して、footerStartをその手前まで引き上げる。
function stitchTrimFixedFooterChrome(canvases, headerEnd, footerStart, groupLabel) {
	if (canvases.length < 2) return footerStart;
	const w = canvases[0].width;
	const fullH = canvases[0].height;
	const ctxs = canvases.map(c => c.getContext('2d', { willReadFrequently: true }));
	const minContent = headerEnd + 100;
	let y = fullH - 1;
	outer:
	while (y > minContent) {
		const rows = ctxs.map(ctx => ctx.getImageData(0, y, w, 1).data);
		for (let i = 1; i < rows.length; i++) {
			for (let x = 0; x < rows[0].length; x += 12) {
				if (Math.abs(rows[0][x] - rows[i][x]) > 4) break outer;
			}
		}
		y--;
	}
	const trimmed = Math.min(footerStart, y + 1);
	if (trimmed < footerStart) {
		stitchLog(groupLabel + ': footerStart内に全画像で同一の固定UI領域を検出。footerStartを' + footerStart + '→' + trimmed + 'に補正します。');
	}
	return trimmed;
}

// スクロールバーのつまみ位置を検出して、順不同アップロードでも正しい順序に
// 並び替える。つまみが見つからない/長さが不一致の場合はnullを返し、
// 呼び出し側でアップロード順にフォールバックする。
function stitchDetectScrollbarOrder(canvases, headerEnd, footerStart, groupLabel, darkThreshold = 200) {
	const w = canvases[0].width;
	const contentH = footerStart - headerEnd;
	const xStart = Math.floor(w * 0.75);

	function darkRun(canvas, x) {
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		const data = ctx.getImageData(x, headerEnd, 1, contentH).data;
		let first = -1, last = -1, cnt = 0;
		for (let y = 0; y < contentH; y++) {
			const idx = y * 4;
			const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
			if (v < darkThreshold) { if (first === -1) first = y; last = y; cnt++; }
		}
		if (first === -1) return null;
		const span = last - first + 1;
		if (cnt / span < 0.6) return null;
		if (span > contentH * 0.6 || span < 3) return null;
		return { first: first, last: last, span: span };
	}

	let candidateX = -1;
	for (let x = xStart; x < w; x++) {
		if (darkRun(canvases[0], x)) { candidateX = x; break; }
	}
	if (candidateX === -1) {
		stitchLog(groupLabel + ': スクロールバー検出: 該当する列が見つかりませんでした。');
		return null;
	}

	const runs = [];
	for (let i = 0; i < canvases.length; i++) {
		const run = darkRun(canvases[i], candidateX);
		if (!run) {
			stitchLog(groupLabel + ': スクロールバー検出: 画像' + i + 'でつまみが検出できませんでした。並び替えを断念します。');
			return null;
		}
		runs.push(run);
	}
	const spans = runs.map(r => r.span);
	const minSpan = Math.min.apply(null, spans), maxSpan = Math.max.apply(null, spans);
	if (minSpan / maxSpan < 0.85) {
		stitchLog(groupLabel + ': スクロールバー検出: つまみ長さが不一致(' + minSpan + '〜' + maxSpan + ')のため並び替えを断念します。');
		return null;
	}
	const order = runs.map((r, i) => ({ i: i, y: r.first })).sort((a, b) => a.y - b.y).map(o => o.i);
	stitchLog(groupLabel + ': スクロールバー検出成功(x=' + candidateX + '): 並び順 = [' + order.join(', ') + ']');
	return order;
}

// オーバーラップ（重複範囲）を、実ピクセルの平均絶対差分(MAD)に基づき推定する。
// 大きい候補から順に見て、閾値を下回る最初の(最大の)候補を採用することで、
// 小さい窓幅で偶然低スコアになる誤検出を避ける。
// 【全面差し替え】以前は「上下の帯全体の平均差分が最小になる重なり幅」を
// 探していたが、スキル一覧は丸角パネルの枠線や星アイコンの並びが行に
// よらずほぼ同じ形であるため、重なり幅を広げるほど平均差分がなだらかに
// 下がり続け、正しい位置とは無関係な値に吸い寄せられる不具合が実データで
// 確認された。代わりに、上画像の末尾から固定サイズのテンプレートを
// 1つだけ切り出し、それを下画像の全域に対してスライドさせて最も一致する
// 位置（＝真の継ぎ目）を探す方式に変更する。比較対象が固定サイズになる
// ため、以前のような「窓を広げるほど下がり続ける」問題が起きない。
function stitchEstimateOverlapByPixelMAD(canvasTop, canvasBottom, yStart, yEnd, xStart, xEnd, opts) {
	opts = opts || {};
	const minOverlap = opts.minOverlap || 60;
	const templateH = opts.templateH || 150;
	const edgeBuffer = opts.edgeBuffer || 10;
	const madThreshold = opts.madThreshold || 6.0;
	const sampleStepX = opts.sampleStepX || 3;

	const ctxTop = canvasTop.getContext('2d', { willReadFrequently: true });
	const ctxBottom = canvasBottom.getContext('2d', { willReadFrequently: true });
	const w = xEnd - xStart;
	const h = yEnd - yStart;

	const effTemplateH = Math.max(20, Math.min(templateH, h - minOverlap));
	const t0 = h - edgeBuffer - effTemplateH; // 上画像内でのテンプレート開始位置（コンテンツ相対）

	const dataTop = ctxTop.getImageData(xStart, yStart + t0, w, effTemplateH).data;
	const dataBottom = ctxBottom.getImageData(xStart, yStart, w, h).data;

	function isBlankish(r, g, b) { return r > 244 && g > 244 && b > 244; }

	function madAt(y0) {
		let sum = 0, cnt = 0;
		const rowStride = w * 4;
		for (let ty = 0; ty < effTemplateH; ty++) {
			const topRow = ty * rowStride;
			const botRow = (y0 + ty) * rowStride;
			for (let x = 0; x < w; x += sampleStepX) {
				const it = topRow + x * 4;
				const ib = botRow + x * 4;
				const rT = dataTop[it], gT = dataTop[it + 1], bT = dataTop[it + 2];
				const rB = dataBottom[ib], gB = dataBottom[ib + 1], bB = dataBottom[ib + 2];
				if (isBlankish(rT, gT, bT) && isBlankish(rB, gB, bB)) continue;
				sum += Math.abs(rT - rB) + Math.abs(gT - gB) + Math.abs(bT - bB);
				cnt += 3;
			}
		}
		const totalPairs = effTemplateH * Math.ceil(w / sampleStepX) * 3;
		if (cnt < totalPairs * 0.05) return Infinity;
		return sum / cnt;
	}

	// 【修正】粗い間隔で走査してから周辺だけ再探索する二段探索だと、
	// 真の最良位置がわずか数px幅の狭い谷にしかない場合に飛び越して
	// 見逃し、たまたま粗い格子に乗った劣った候補を採用してしまう
	// ことが実データで確認された。1px刻みの全探索に変更する。
	const maxY0 = h - effTemplateH;
	let bestY0 = 0, bestMad = Infinity, secondMad = Infinity;
	for (let y0 = 0; y0 <= maxY0; y0++) {
		const mad = madAt(y0);
		if (mad < bestMad) { secondMad = bestMad; bestMad = mad; bestY0 = y0; }
		else if (mad < secondMad) secondMad = mad;
	}

	let overlap = h - (t0 - bestY0);
	overlap = Math.max(minOverlap, Math.min(h - 1, overlap));
	// 信頼度は「一致度が閾値未満」かつ「次点候補と十分に差がある」の両方で判定する。
	// 差が小さいと、たまたま似ている位置を拾っただけの可能性がある。
	const confident = bestMad < madThreshold && (secondMad - bestMad) > 1.5;
	return { overlap: overlap, mad: bestMad, secondMad: secondMad, confident: confident };
}

// 標準的なスクリーンショットかどうかの簡易判定（実測済みDMM版・スマホ版の
// 解像度/アスペクト比のホワイトリスト方式）。結合済み画像や加工済み画像など、
// レンジ外の画像がアップロードされた場合は結合処理そのものを中止する。
const STITCH_KNOWN_SCREENSHOT_PROFILES = [
	{ label: 'DMM版(ブラウザ)相当', minWidth: 700, maxWidth: 1300, minAspect: 1.55, maxAspect: 1.95 },
	{ label: 'スマホ版相当', minWidth: 700, maxWidth: 1500, minAspect: 1.9, maxAspect: 2.5 }
];

function stitchCheckStandardScreenshot(canvas) {
	const w = canvas.width, h = canvas.height;
	const aspect = h / w;
	for (const p of STITCH_KNOWN_SCREENSHOT_PROFILES) {
		if (w >= p.minWidth && w <= p.maxWidth && aspect >= p.minAspect && aspect <= p.maxAspect) {
			return { ok: true, profile: p.label };
		}
	}
	return { ok: false, profile: null, w: w, h: h, aspect: aspect };
}

// 「因子」バーや「継承元」ラベルなど、直前に何があっても関係なく、最初の
// 青いスキルパネル（スピード/根性等のカテゴリタグ）が実際に始まる行を直接
// 検出する。1枚目の画像にのみ適用する（2枚目以降は既に本文中のため不要）。
function stitchDetectFirstSkillPanelTop(canvas, headerEnd) {
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const w = canvas.width;
	const xSample = Math.floor(w * 0.3);
	const maxScan = Math.floor(w * 0.25);
	const data = ctx.getImageData(xSample, headerEnd, 1, maxScan).data;

	function isBluePanel(r, g, b) { return b > 200 && g > 140 && g < 220 && r < 120; }

	for (let y = 0; y < maxScan; y++) {
		const idx = y * 4;
		if (isBluePanel(data[idx], data[idx + 1], data[idx + 2])) {
			return headerEnd + y;
		}
	}
	return headerEnd;
}

// スキル一覧本体が終わった後に続く不要な領域（次のキャラクターの青枠、
// 「継承履歴」等の緑バー、「継承元」テキストのみの余白など）を検出し、
// その直前で打ち切るための行番号を返す。
function stitchFindTrailingCutY(canvas, searchStartY) {
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const w = canvas.width;
	const h = canvas.height;
	if (searchStartY >= h) return h;
	const xLeft = Math.floor(w * 0.3);
	const data = ctx.getImageData(xLeft, searchStartY, 1, h - searchStartY).data;

	function isBluePanel(r, g, b) { return b > 200 && g > 140 && g < 220 && r < 120; }
	function isGreenBar(r, g, b) { return g > 160 && r > 80 && r < 170 && b < 70; }
	function isBlankish(r, g, b) { return r > 244 && g > 244 && b > 244; }

	const blankThreshold = Math.round(w * 0.035);
	let blankRun = 0;
	const rows = data.length / 4;
	for (let y = 0; y < rows; y++) {
		const idx = y * 4;
		const r = data[idx], g = data[idx + 1], b = data[idx + 2];
		if (isBluePanel(r, g, b) || isGreenBar(r, g, b)) {
			return searchStartY + y;
		}
		if (isBlankish(r, g, b)) {
			blankRun++;
			if (blankRun >= blankThreshold) {
				return searchStartY + y - blankRun + 1;
			}
		} else {
			blankRun = 0;
		}
	}
	return h;
}

// 1人分の画像配列を縦結合し、結果Canvasを返す。
// ヘッダー/フッターは完全除外し、スキルパネル自体のみを出力する。
async function stitchOnePerson(files, groupLabel) {
	if (files.length === 0) return null;
	if (files.length === 1) {
		throw new Error('[' + groupLabel + '] 画像が1枚のみです。結合には2枚以上が必要なため処理を中止します。');
	}
	stitchLog(groupLabel + ': ' + files.length + '枚を読み込みます...');
	const imgs = [];
	for (const f of files) imgs.push(await loadImage(f));
	const canvases = imgs.map(stitchImgToCanvas);

	for (let i = 0; i < canvases.length; i++) {
		const check = stitchCheckStandardScreenshot(canvases[i]);
		if (!check.ok) {
			throw new Error('[' + groupLabel + '] 画像' + i + '(' + check.w + 'x' + check.h + ', 縦横比' + check.aspect.toFixed(2) + ')が標準的なスクリーンショットのサイズ範囲外です。結合済み画像や加工済み画像がアップロードされた可能性があるため処理を中止します。');
		}
	}

	const w0 = canvases[0].width;
	for (let i = 1; i < canvases.length; i++) {
		if (canvases[i].width !== w0) {
			throw new Error('[' + groupLabel + '] 画像の幅が一致していません（画像0: ' + w0 + 'px, 画像' + i + ': ' + canvases[i].width + 'px）。標準的なスクロールキャプチャではない可能性があるため中止します。');
		}
	}

	const hf = stitchDetectHeaderFooter(canvases, groupLabel);
	const headerEnd = hf.headerEnd;
	const footerStart = stitchTrimFixedFooterChrome(canvases, headerEnd, hf.footerStart, groupLabel);
	stitchLog(groupLabel + ': ヘッダー=行0〜' + (headerEnd - 1) + '(除外), スクロール領域=行' + headerEnd + '〜' + (footerStart - 1) + ', フッター=行' + footerStart + '〜' + (canvases[0].height - 1) + '(除外)');

	let canvasesForStitch = canvases;
	const order = stitchDetectScrollbarOrder(canvases, headerEnd, footerStart, groupLabel);
	if (order) {
		canvasesForStitch = order.map(i => canvases[i]);
	} else {
		stitchLog(groupLabel + ': 並び替えできなかったためアップロード順を使用します。');
	}

	const marginX = Math.floor(w0 * 0.1);
	const overlaps = [];
	// 検証用：低信頼度の継ぎ目を警告として集め、結合結果に添付する
	const warnings = [];
	for (let i = 0; i < canvasesForStitch.length - 1; i++) {
		const r = stitchEstimateOverlapByPixelMAD(canvasesForStitch[i], canvasesForStitch[i + 1], headerEnd, footerStart, marginX, w0 - marginX);
		stitchLog(groupLabel + ': 画像' + i + '→' + (i + 1) + ': オーバーラップ=' + r.overlap + '行 (MAD=' + r.mad.toFixed(2) + '/次点' + r.secondMad.toFixed(2) + ', 信頼度' + (r.confident ? '高' : '低') + ')');
		if (!r.confident) {
			const warnMsg = groupLabel + ': 画像' + i + '→' + (i + 1) + 'の継ぎ目は一致度が低く(MAD=' + r.mad.toFixed(1) + ')、結合位置がズレている可能性があります。';
			stitchLog('⚠ ' + warnMsg);
			warnings.push(warnMsg);
		}
		overlaps.push(r.overlap);
	}

	const contentHeight = footerStart - headerEnd;
	let totalContentHeight = contentHeight;
	for (const ov of overlaps) totalContentHeight += (contentHeight - ov);

	const firstPanelTop = stitchDetectFirstSkillPanelTop(canvasesForStitch[0], headerEnd);
	const skipFirst = Math.max(0, firstPanelTop - headerEnd);

	const totalHeight = totalContentHeight - skipFirst;

	const out = document.createElement('canvas');
	out.width = w0;
	out.height = totalHeight;
	const octx = out.getContext('2d');

	let cursorY = 0;
	octx.drawImage(canvasesForStitch[0], 0, headerEnd + skipFirst, w0, contentHeight - skipFirst, 0, cursorY, w0, contentHeight - skipFirst);
	cursorY += (contentHeight - skipFirst);
	for (let i = 1; i < canvasesForStitch.length; i++) {
		const ov = overlaps[i - 1];
		const srcY = headerEnd + ov;
		const drawH = contentHeight - ov;
		octx.drawImage(canvasesForStitch[i], 0, srcY, w0, drawH, 0, cursorY, w0, drawH);
		cursorY += drawH;
	}

	const searchStartY = Math.round(w0 * 0.15);
	const cutY = stitchFindTrailingCutY(out, searchStartY);
	if (cutY < out.height) {
		const trimmed = document.createElement('canvas');
		trimmed.width = w0;
		trimmed.height = cutY;
		trimmed.getContext('2d').drawImage(out, 0, 0, w0, cutY, 0, 0, w0, cutY);
		trimmed._stitchWarnings = warnings;
		stitchLog(groupLabel + ': 縦結合完了(末尾トリミング後): ' + w0 + ' x ' + cutY);
		return trimmed;
	}

	out._stitchWarnings = warnings;
	stitchLog(groupLabel + ': 縦結合完了: ' + w0 + ' x ' + totalHeight);
	return out;
}

// 複数人分のCanvasを上端揃え・スケーリングなしで横結合する
function stitchConcatHorizontallyTopAligned(canvasList, gap) {
	gap = gap || 8;
	const totalWidth = canvasList.reduce((sum, c) => sum + c.width, 0) + gap * (canvasList.length - 1);
	const maxHeight = Math.max.apply(null, canvasList.map(c => c.height));
	const out = document.createElement('canvas');
	out.width = totalWidth;
	out.height = maxHeight;
	const ctx = out.getContext('2d');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, totalWidth, maxHeight);
	let cursorX = 0;
	for (const c of canvasList) {
		ctx.drawImage(c, cursorX, 0);
		cursorX += c.width + gap;
	}
	return out;
}
