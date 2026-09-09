/**
 * page.evaluate() に渡して、ブラウザ内で「結合前(入力サムネイル一覧)+結合後
 * (結合結果 or エラー)」を1枚の比較用PNGに合成するための関数。
 * Canvas 2D の fillText は OS のフォントスタックにそのまま乗るため、
 * 日本語用フォントパスを個別に探す必要がない(Pillowでの以前の実装と違う点)。
 */
export async function buildComparisonInPage({ caseName, inputs, result }) {
	function loadImage(src) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	const THUMB_H = 260;
	const PAD = 18;
	const MAX_WIDTH = 1500;

	const thumbImgs = await Promise.all(inputs.map((inp) => loadImage(inp.dataUrl)));
	const thumbDims = thumbImgs.map((img) => ({
		w: Math.round((THUMB_H * img.naturalWidth) / img.naturalHeight),
		h: THUMB_H,
	}));

	const inputsRowWidth = thumbDims.reduce((sum, d) => sum + d.w, 0) + PAD * (thumbDims.length + 1);
	let resultImg = null;
	if (result.ok) {
		resultImg = await loadImage(result.dataUrl);
	}

	const width = Math.min(MAX_WIDTH, Math.max(inputsRowWidth, 700));

	let resultDisplayW = 0;
	let resultDisplayH = 0;
	if (resultImg) {
		resultDisplayW = Math.min(resultImg.naturalWidth, width - PAD * 2);
		resultDisplayH = Math.round((resultDisplayW * resultImg.naturalHeight) / resultImg.naturalWidth);
	}

	const warnings = result.warnings || [];
	const log = result.log || [];

	const headerH = 40;
	const inputsLabelH = 26;
	const inputsSectionH = inputsLabelH + THUMB_H + 40;
	const resultLabelH = 26;
	let resultSectionH;
	let errorLines = [];
	if (result.ok) {
		resultSectionH = resultLabelH + resultDisplayH + 20;
	} else {
		errorLines = String(result.error || '').split('\n');
		resultSectionH = resultLabelH + errorLines.length * 20 + 30;
	}
	const warnLines = warnings;
	const warnSectionH = warnLines.length ? 24 + warnLines.length * 20 + 12 : 0;
	const logSectionH = log.length ? 24 + log.length * 16 + 12 : 0;

	const totalH =
		PAD + headerH + inputsSectionH + resultSectionH + warnSectionH + logSectionH + PAD;

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = totalH;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fafafa';
	ctx.fillRect(0, 0, width, totalH);

	let y = PAD;
	ctx.fillStyle = '#1a1a1a';
	ctx.font = 'bold 22px sans-serif';
	ctx.textBaseline = 'top';
	ctx.fillText('Case: ' + caseName, PAD, y);
	y += headerH;

	ctx.font = '14px sans-serif';
	ctx.fillStyle = '#333333';
	ctx.fillText('Inputs (' + inputs.length + ')', PAD, y);
	y += inputsLabelH;

	let x = PAD;
	for (let i = 0; i < thumbImgs.length; i++) {
		const d = thumbDims[i];
		ctx.drawImage(thumbImgs[i], x, y, d.w, d.h);
		ctx.strokeStyle = '#cccccc';
		ctx.lineWidth = 1;
		ctx.strokeRect(x + 0.5, y + 0.5, d.w - 1, d.h - 1);
		ctx.fillStyle = '#333333';
		ctx.font = '12px sans-serif';
		ctx.fillText(
			'#' + (i + 1) + ' ' + inputs[i].name + ' (' + inputs[i].width + 'x' + inputs[i].height + ')',
			x,
			y + d.h + 4
		);
		x += d.w + PAD;
	}
	y += THUMB_H + 40;

	ctx.font = '14px sans-serif';
	if (result.ok) {
		ctx.fillStyle = '#1a6b1a';
		ctx.fillText('Merged result: OK (' + resultImg.naturalWidth + 'x' + resultImg.naturalHeight + ')', PAD, y);
		y += resultLabelH;
		ctx.drawImage(resultImg, PAD, y, resultDisplayW, resultDisplayH);
		ctx.strokeStyle = '#cccccc';
		ctx.strokeRect(PAD + 0.5, y + 0.5, resultDisplayW - 1, resultDisplayH - 1);
		y += resultDisplayH + 20;
	} else {
		ctx.fillStyle = '#b31e1e';
		ctx.fillText('Merged result: ERROR', PAD, y);
		y += resultLabelH;
		ctx.font = '13px monospace';
		for (const line of errorLines) {
			ctx.fillText(line, PAD, y);
			y += 20;
		}
		y += 10;
	}

	if (warnLines.length) {
		ctx.fillStyle = '#8a6100';
		ctx.font = 'bold 14px sans-serif';
		ctx.fillText('⚠ Warnings (' + warnLines.length + ')', PAD, y);
		y += 24;
		ctx.font = '13px sans-serif';
		for (const w of warnLines) {
			ctx.fillText(w, PAD, y);
			y += 20;
		}
		y += 12;
	}

	if (log.length) {
		ctx.fillStyle = '#555555';
		ctx.font = 'bold 13px sans-serif';
		ctx.fillText('Log', PAD, y);
		y += 24;
		ctx.font = '11px monospace';
		ctx.fillStyle = '#555555';
		for (const l of log) {
			for (const sub of String(l).split('\n')) {
				ctx.fillText(sub, PAD, y);
				y += 16;
			}
		}
	}

	return canvas.toDataURL('image/png');
}
