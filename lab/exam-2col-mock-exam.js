/* T146 のモック（lab/exam-2col-mock.html）が使う、exam.html の結合画像の帯・補助の帯の描き方の写し。
   exam.html（commit cf3dd99）から名前で抜き出したもの。中身は変えていない（字下げだけ外した）。製品はこのファイルを読まない。 */
'use strict';

// exam.html 2807〜2807 行
const MARK_KIND_ORDER = ['sp70', 'green', 'plain', 'factor', 'gene', 'added', 'removed'];

// exam.html 2808〜2816 行
const MARK_LEGEND_LABEL = {
	sp70: 'sp70緑',
	green: 'その他緑',
	plain: 'その他の対象スキル',
	factor: 'シナリオ因子',
	gene: '遺伝子',
	added: '追加したスキル',
	removed: '除外したスキル'
};

// exam.html 7686〜7695 行
const ATTR_MARK_TOKEN = {
	sp70: '--uma-star',
	green: '--uma-mark-green-skill',
	plain: '--uma-text',
	factor: '--uma-mark-catalog',
	// 遺伝子（色は段G-2、結合画像に出るようになったのは段H）
	gene: '--uma-mark-gene',
	added: '--uma-danger-text',
	removed: '--uma-danger-text'
};

// exam.html 7697〜7697 行
const MARK_LEGEND_HEAD = '印の見かた：';

// exam.html 7698〜7698 行
const MARK_LEGEND_NOTE = '印の無い行は、対象外のスキルか、読み取れなかった行です。';

// exam.html 7701〜7704 行
const MARK_SUPPRESSED_NOTE = {
	size: 'この画像は対応を確認できていない画面サイズのため、印を付けていません。',
	layout: 'この画像はスキルパネルの並びを読み取れなかったため、印を付けていません。'
};

// exam.html 7705〜7705 行
const MARK_SUPPRESSED_ORDER = ['size', 'layout'];

// exam.html 7712〜7719 行
function attrMarkColors() {
	const kinds = Object.keys(ATTR_MARK_TOKEN);
	const vals = readTokensLight(kinds.map(k => ATTR_MARK_TOKEN[k]));
	if (vals.some(v => !v)) return null;
	const out = {};
	kinds.forEach((k, i) => { out[k] = vals[i]; });
	return out;
}

// exam.html 7727〜7737 行
function readTokensLight(names) {
	const root = document.documentElement;
	const prev = root.getAttribute('data-theme');
	if (prev === 'dark') root.setAttribute('data-theme', 'light');
	try {
		const css = getComputedStyle(root);
		return names.map(n => css.getPropertyValue(n).trim());
	} finally {
		if (prev === 'dark') root.setAttribute('data-theme', prev);
	}
}

// exam.html 7747〜7750 行
function stitchTokenColor(token) {
	const v = readTokensLight([token])[0];
	return v || STITCH_NOTE_COLOR;
}

// exam.html 7754〜7754 行
const STITCH_FACTOR_TEXT_TOKEN = '--uma-catalog-text';

// exam.html 7755〜7755 行
const STITCH_FACTOR_MORE_TOKEN = '--uma-mark-catalog';

// exam.html 7756〜7756 行
const STITCH_GENE_TEXT_TOKEN = '--uma-gene-text';

// exam.html 7757〜7757 行
const STITCH_GENE_MORE_TOKEN = '--uma-mark-gene';

// exam.html 7767〜7823 行
function drawSkillMark(ctx, kind, cx, cy, d, colors) {
	ctx.save();
	ctx.fillStyle = colors[kind];
	ctx.strokeStyle = colors[kind];
	if (kind === 'sp70') {
		// 0.62 では★の凹みから〇が見えたので 0.78 に拡げた（決定5の但し書き）。
		// 外接円はへこみより少し大きくなるが、パネルの中には収まる。
		const r = d * 0.78;
		ctx.beginPath();
		for (let i = 0; i < 10; i++) {
			const rr = (i % 2 === 0) ? r : r * 0.45;
			const a = -Math.PI / 2 + (i * Math.PI) / 5;
			const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
			if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
		}
		ctx.closePath();
		ctx.fill();
	} else if (kind === 'green' || kind === 'plain') {
		ctx.beginPath();
		ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
		ctx.fill();
	} else if (kind === 'factor' || kind === 'gene') {
		/* シナリオ因子＝塗りの ◆／遺伝子＝白抜きの ◇（段I-5）。
		   **同じ形を塗り方だけで分ける。** 輪郭は js/stitch.js の stitchDiamondPath()
		   1か所から出すので、exam・special・画面の SVG がぜんぶ同じ形になる。
		   斜め45度のところが〇の半径より内側に入らないよう 0.62 → 0.70（決定5の但し書き）。 */
		const r = d * 0.70;
		stitchDiamondPath(ctx, cx, cy, r);
		if (kind === 'factor') {
			ctx.fill();
		} else {
			// **中を白で塗ってから線を引く。** 印はスキルパネルの灰色の〇の上に載るので、
			// 透かしたままだと〇の灰色が中に残り、「白抜き」ではなく「灰色で塗った菱形」に
			// 見える。白で塗れば、どんな地の上でも中が空いていることが読める。
			ctx.save();
			ctx.fillStyle = '#ffffff';
			ctx.fill();
			ctx.restore();
			ctx.lineWidth = stitchOutlineWidth(d);
			ctx.lineJoin = 'round';
			ctx.stroke();
		}
	} else if (kind === 'added') {
		// 辺の真ん中が〇の半径より内側に入らないよう 0.78 → 0.96（対角はへこみとほぼ同じ）
		const s = d * 0.96;
		ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
	} else if (kind === 'removed') {
		const r = d * 0.40;
		ctx.lineWidth = Math.max(2, d * 0.22);
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
		ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
		ctx.stroke();
	}
	ctx.restore();
}

// exam.html 8133〜8162 行
function buildMarkLegendLines(ctx, kinds, maxWidth, fontSize) {
	const glyphW = fontSize * 1.35;
	const sep = ' ／ ';
	// 「区切り＋記号＋説明」を1つのかたまりにして、その境目でだけ折り返す。
	// 部品ごとに折り返すと、行頭が「／」だけになる。
	const groups = [[{ type: 'text', text: MARK_LEGEND_HEAD, w: ctx.measureText(MARK_LEGEND_HEAD).width }]];
	kinds.forEach((k, i) => {
		const g = [];
		if (i > 0) g.push({ type: 'text', text: sep, w: ctx.measureText(sep).width });
		g.push({ type: 'mark', kind: k, w: glyphW });
		const label = ' ' + MARK_LEGEND_LABEL[k];
		g.push({ type: 'text', text: label, w: ctx.measureText(label).width });
		groups.push(g);
	});
	const lines = [[]];
	let x = 0;
	groups.forEach(g => {
		let parts = g;
		const gw = g.reduce((sum, it) => sum + it.w, 0);
		if (x > 0 && x + gw > maxWidth) {
			lines.push([]);
			x = 0;
			// 行の頭に区切りの「／」だけが残らないように落とす
			parts = g.filter(it => !(it.type === 'text' && it.text === sep));
		}
		parts.forEach(it => lines[lines.length - 1].push(it));
		x += parts.reduce((sum, it) => sum + it.w, 0);
	});
	return lines;
}

// exam.html 5996〜6001 行
const EFF_TIER_ICON_SRCS = [
	'img/horseshoe-1-bronze-2026-10-09.png',
	'img/horseshoe-2-silver-2026-10-09.png',
	'img/horseshoe-3-gold-2026-10-09.png',
	'img/horseshoe-4-rainbow-2026-10-09.png'
];

// exam.html 8176〜8187 行
const EFF_BANNER = {
	pad: 0.03, topPad: 0.018, titleFont: 0.075, cardH: 0.1, headGap: 0.019,
	cardLabelFont: 0.04, cardValueFont: 0.07, cardPad: 0.02, cardInnerGap: 0.012, cardGap: 0.015, cardRadius: 0.015,
	// 区間まとめパネルは案A（改善3）: 蹄鉄は0.79倍（0.11→0.087）・検出数の文字は0.76倍（0.08→0.061）・余白を詰めた。
	// 合計の帯の高さ（totalH＋totalAfter）は変えず、中を2行にした（文字は 0.044→0.032）
	panelPad: 0.008, panelGap: 0.008, panelIcon: 0.087, cellPad: 0.007, rangeFont: 0.036, countFont: 0.061, panelAfter: 0.016,
	// 合計の帯（効率を指定だけ。微調整1・B）: ラベルの文字は紫の行と同じくらい（totalLabelFont＝purpleFont）・数字は検出数のカードの数字と同じ（totalNumFont＝cardValueFont）。
	// 2行の高さは totalRowH ずつ・箱の上下の余白は totalPadV。コロンのあとの間は、ラベルの文字の大きさの totalGap 倍。
	// 1行に収まらないときは、ラベルと数字を一緒に縮める（ラベルは最小 6px）。改善3の「帯の高さを前と同じに保つ」は外した（帯の高さは増えてよい）
	totalLabelFont: 0.041, totalNumFont: 0.07, totalRowH: 0.093, totalPadV: 0.016, totalGap: 0.6, totalAfter: 0.017,
	purpleFont: 0.041, purpleLineH: 0.062, purpleAfter: 0.022
};

// exam.html 8192〜8221 行
function effPurpleLayout(width, factors, genes, withFactors) {
	const out = { blocks: [], lineCount: 0, fs: 0 };
	if (!withFactors) return out;
	const maxW = width - Math.round(width * EFF_BANNER.pad) * 2;
	const ctx = document.createElement('canvas').getContext('2d');
	const src = [[factors, STITCH_FACTOR_TEXT_TOKEN, STITCH_FACTOR_MORE_TOKEN], [genes, STITCH_GENE_TEXT_TOKEN, STITCH_GENE_MORE_TOKEN]];
	src.forEach(([h, textToken, moreToken]) => {
		if (!h || !h.items.length) return;
		out.blocks.push({ items: h.items.map(it => it.text).concat(h.more ? ['他'] : []), more: !!h.more, textToken: textToken, moreToken: moreToken, lines: [] });
	});
	let fs = Math.max(9, Math.round(width * EFF_BANNER.purpleFont));
	const fits = () => {
		ctx.font = 'bold ' + fs + 'px sans-serif';
		return out.blocks.every(b => b.items.every(t => ctx.measureText(t).width <= maxW));
	};
	while (fs > 9 && !fits()) fs -= 1;
	ctx.font = 'bold ' + fs + 'px sans-serif';
	out.fs = fs;
	const sep = '／';
	out.blocks.forEach(b => {
		let cur = '';
		b.items.forEach(t => {
			const cand = cur ? cur + sep + t : t;
			if (cur && ctx.measureText(cand).width > maxW) { b.lines.push(cur); cur = t; } else cur = cand;
		});
		if (cur) b.lines.push(cur);
		out.lineCount += b.lines.length;
	});
	return out;
}

// exam.html 8224〜8232 行
function stitchRoundRectPath(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// exam.html 8238〜8257 行
function effTotalLayout(width, lines) {
	const B = EFF_BANNER;
	const pad = Math.round(width * B.pad);
	const inset = pad;
	const innerW = width - pad * 2 - inset * 2;
	const rows = lines.map(line => { const k = line.indexOf(':'); return { label: line.slice(0, k + 1), value: line.slice(k + 1) }; });
	const ctx = document.createElement('canvas').getContext('2d');
	const lab0 = Math.round(width * B.totalLabelFont), num0 = Math.round(width * B.totalNumFont);
	let lab = lab0, num = num0, labelW = 0, gap = 0, need = 0;
	const measure = () => {
		ctx.font = 'bold ' + lab + 'px sans-serif';
		labelW = Math.max.apply(null, rows.map(r => ctx.measureText(r.label).width));
		gap = Math.round(lab * B.totalGap);
		ctx.font = 'bold ' + num + 'px sans-serif';
		need = labelW + gap + Math.max.apply(null, rows.map(r => ctx.measureText(r.value).width));
	};
	measure();
	while (lab > 6 && need > innerW) { lab -= 1; num = Math.max(6, Math.round(num0 * lab / lab0)); measure(); }
	return { rows: rows, lab: lab, num: num, labelW: labelW, gap: gap, inset: inset, innerW: innerW, need: need, lab0: lab0, num0: num0 };
}

// exam.html 8261〜8422 行
function stitchDrawEffPersonBanner(width, groupLabel, totalDetected, sp70Count, factors, genes, opts) {
	const B = EFF_BANNER;
	const U = (r) => Math.round(width * r);
	const withCards = !(opts && opts.cards === false);
	const effPanel = (opts && opts.effPanel) || null;
	const totalLines = (opts && opts.totalLines) || null;
	const pad = U(B.pad);
	const headContentH = withCards ? U(B.cardH) : U(B.titleFont);
	const headPitch = U(B.topPad) + headContentH + U(B.headGap);
	const panelCellH = U(B.panelIcon) + U(B.cellPad) * 2;
	const panelH = effPanel ? (U(B.panelPad) * 2 + panelCellH * 2 + U(B.panelGap)) : 0;
	const panelPitch = effPanel ? panelH + U(B.panelAfter) : 0;
	const totalBoxH = U(B.totalRowH) * 2 + U(B.totalPadV) * 2;
	const totalPitch = (totalLines || (opts && opts.totalReserve)) ? totalBoxH + U(B.totalAfter) : 0;
	const purple = effPurpleLayout(width, factors, genes, !(opts && opts.factors === false));
	const purpleLines = purple.lineCount ? Math.max(purple.lineCount, (opts && opts.purpleMinLines) || 0) : (opts && opts.purpleMinLines) || 0;
	const purplePitch = purpleLines ? purpleLines * U(B.purpleLineH) + U(B.purpleAfter) : 0;
	const barHeight = headPitch + panelPitch + totalPitch + purplePitch;

	const c = document.createElement('canvas');
	c.width = width;
	c.height = barHeight;
	c._purpleLines = purple.lineCount;
	const ctx = c.getContext('2d');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, width, barHeight);
	ctx.strokeStyle = '#e2e2e2';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(0, barHeight - 1);
	ctx.lineTo(width, barHeight - 1);
	ctx.stroke();

	let y = U(B.topPad);
	const headMid = y + headContentH / 2;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	ctx.fillStyle = '#1a1a1a';
	ctx.font = 'bold ' + U(B.titleFont) + 'px sans-serif';
	ctx.fillText(groupLabel, pad, headMid);
	if (withCards) {
		// 「検出」「sp70緑」を1行ずつの小さなカードで、見出しの右に並べる（右のカードが右端）
		const labelFont = U(B.cardLabelFont), valueFont = U(B.cardValueFont), cardPad = U(B.cardPad), inner = U(B.cardInnerGap);
		const cardDefs = [
			{ label: '検出', value: String(totalDetected), bg: '#f5f8ff', border: '#cfe0fb', labelColor: '#3c5a99', valueColor: '#0f3fc9' },
			{ label: 'sp70緑', value: String(sp70Count), bg: '#fffaf0', border: '#f5dfae', labelColor: '#a9720b', valueColor: '#c96a00' }
		];
		const measured = cardDefs.map(cd => {
			ctx.font = 'bold ' + labelFont + 'px sans-serif';
			const lw = ctx.measureText(cd.label).width;
			ctx.font = 'bold ' + valueFont + 'px sans-serif';
			const vw = ctx.measureText(cd.value).width;
			return { cd: cd, lw: lw, vw: vw, w: cardPad * 2 + lw + inner + vw };
		});
		let x = width - pad;
		for (let i = measured.length - 1; i >= 0; i--) {
			const m = measured[i];
			x -= m.w;
			stitchRoundRectPath(ctx, x, y, m.w, headContentH, U(B.cardRadius));
			ctx.fillStyle = m.cd.bg;
			ctx.fill();
			ctx.strokeStyle = m.cd.border;
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.fillStyle = m.cd.labelColor;
			ctx.font = 'bold ' + labelFont + 'px sans-serif';
			ctx.fillText(m.cd.label, x + cardPad, headMid);
			ctx.fillStyle = m.cd.valueColor;
			ctx.font = 'bold ' + valueFont + 'px sans-serif';
			ctx.fillText(m.cd.value, x + cardPad + m.lw + inner, headMid);
			x -= U(B.cardGap);
		}
	}
	y = headPitch;

	if (effPanel) {
		const pw = width - pad * 2;
		stitchRoundRectPath(ctx, pad, y, pw, panelH, U(B.cardRadius) + 2);
		ctx.fillStyle = stitchTokenColor('--exam-eff-turf-bg');
		ctx.fill();
		ctx.strokeStyle = stitchTokenColor('--exam-eff-turf-border');
		ctx.lineWidth = 2;
		ctx.stroke();
		const textColor = stitchTokenColor('--exam-eff-turf-text');
		const cellW = (pw - U(B.panelPad) * 2 - U(B.panelGap)) / 2;
		const icon = U(B.panelIcon), cellPad = U(B.cellPad);
		[3, 2, 1, 0].forEach((k, pos) => {
			const cell = effPanel.cells[k];
			const cx = pad + U(B.panelPad) + (pos % 2) * (cellW + U(B.panelGap));
			const cy = y + U(B.panelPad) + Math.floor(pos / 2) * (panelCellH + U(B.panelGap));
			const mid = cy + panelCellH / 2;
			if (cell.img) ctx.drawImage(cell.img, cx + cellPad, cy + cellPad, icon, icon);
			ctx.fillStyle = textColor;
			ctx.textBaseline = 'middle';
			ctx.textAlign = 'left';
			// 範囲の文字は折り返さず、検出数との間に収まらなければ文字を小さくする（最小 6px）
			const countText = cell.count === null ? '－' : String(cell.count);
			ctx.font = 'bold ' + U(B.countFont) + 'px sans-serif';
			const availRange = cellW - cellPad * 3 - icon - ctx.measureText(countText).width;
			let rf = U(B.rangeFont);
			ctx.font = rf + 'px sans-serif';
			while (rf > 6 && ctx.measureText(cell.range).width > availRange) { rf -= 1; ctx.font = rf + 'px sans-serif'; }
			ctx.fillText(cell.range, cx + cellPad * 2 + icon, mid);
			ctx.font = 'bold ' + U(B.countFont) + 'px sans-serif';
			ctx.textAlign = 'right';
			ctx.fillText(countText, cx + cellW - cellPad, mid);
			ctx.textAlign = 'left';
		});
		y += panelPitch;
	}
	if (totalLines) {
		// ラベンダー色の箱の中の2行（1行目＝合計評価点/合計SP・2行目＝合計評価点）
		stitchRoundRectPath(ctx, pad, y, width - pad * 2, totalBoxH, Math.round(totalBoxH * 0.3));
		ctx.fillStyle = stitchTokenColor('--exam-eff-total-bg');
		ctx.fill();
		ctx.strokeStyle = stitchTokenColor('--exam-eff-total-border');
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.fillStyle = stitchTokenColor('--exam-eff-total-text');
		const L = effTotalLayout(width, totalLines);
		const rowH = U(B.totalRowH);
		ctx.textBaseline = 'alphabetic';
		ctx.textAlign = 'left';
		L.rows.forEach((r, i) => {
			// 行の中心に数字の高さの中心を合わせ、ラベルと数字は同じベースラインにそろえる
			const base = Math.round(y + U(B.totalPadV) + rowH * (i + 0.5) + L.num * 0.36);
			ctx.font = 'bold ' + L.lab + 'px sans-serif';
			ctx.fillText(r.label, pad + L.inset, base);
			ctx.font = 'bold ' + L.num + 'px sans-serif';
			ctx.fillText(r.value, pad + L.inset + L.labelW + L.gap, base);
		});
		ctx.textBaseline = 'middle';
	}
	if (totalLines || (opts && opts.totalReserve)) y += totalPitch;
	if (purple.lineCount) {
		ctx.font = 'bold ' + purple.fs + 'px sans-serif';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		const lineH = U(B.purpleLineH);
		let row = 0;
		purple.blocks.forEach(b => {
			b.lines.forEach((text, i) => {
				const my = y + row * lineH + lineH / 2;
				const isLast = i === b.lines.length - 1;
				// 「他」は最後の項目。薄い色で、その区分の並びの続きだと分かるようにする
				if (b.more && isLast && (text === '他' || text.endsWith('／他'))) {
					const head = text === '他' ? '' : text.slice(0, -1);
					ctx.fillStyle = stitchTokenColor(b.textToken);
					if (head) ctx.fillText(head, pad, my);
					const hw = head ? ctx.measureText(head).width : 0;
					ctx.fillStyle = stitchTokenColor(b.moreToken);
					ctx.fillText('他', pad + hw, my);
				} else {
					ctx.fillStyle = stitchTokenColor(b.textToken);
					ctx.fillText(text, pad, my);
				}
				row++;
			});
		});
	}
	return c;
}

// exam.html 8438〜8605 行
function stitchDrawPersonBanner(width, groupLabel, totalDetected, sp70Count, factors, genes, opts) {
	const withCards = !(opts && opts.cards === false);
	const withFactors = !(opts && opts.factors === false);
	const pad = Math.round(width * 0.03);
	const titleH = Math.round(width * 0.065);
	const cardH = Math.round(width * 0.185);
	const gapY = Math.round(width * 0.02);
	// 「他」は行を増やさず、その区分の最後の行の右端に添える（画面のハイライトと同じ形）。
	// 区分ごとに1つのまとまりにして、色とトークンをそのまとまりが持つ。
	const listBlocks = [];
	const pushBlock = (h, textToken, moreToken) => {
		if (!withFactors || !h) return;
		listBlocks.push({ lines: h.items.map(it => it.text), more: !!h.more, textToken: textToken, moreToken: moreToken });
	};
	pushBlock(factors, STITCH_FACTOR_TEXT_TOKEN, STITCH_FACTOR_MORE_TOKEN);
	pushBlock(genes, STITCH_GENE_TEXT_TOKEN, STITCH_GENE_MORE_TOKEN);
	const listLineCount = listBlocks.reduce((n, b) => n + b.lines.length, 0);
	const listFont = Math.round(cardH * 0.26);
	const listLineH = Math.round(listFont * 1.55);
	const listBlockH = listLineCount ? (gapY + listLineCount * listLineH) : 0;
	// 拡張モードの合計（評価点の合計÷消費SPの合計）の1行。渡されたときだけ（渡されなければ高さも描画も従来と同じ）。
	// 効率を指定は専用の stitchDrawEffPersonBanner を使う
	const totalText = (opts && opts.totalText) || null;
	const totalFont = listFont;
	const totalH = totalText ? Math.round(totalFont * 2) : 0;
	const barHeight = pad * 2 + titleH + (withCards ? gapY + cardH : 0)
		+ (totalText ? gapY + totalH : 0) + listBlockH;

	const c = document.createElement('canvas');
	c.width = width;
	c.height = barHeight;
	const ctx = c.getContext('2d');

	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, width, barHeight);
	ctx.strokeStyle = '#e2e2e2';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(0, barHeight - 1);
	ctx.lineTo(width, barHeight - 1);
	ctx.stroke();

	let y = pad;

	ctx.fillStyle = '#1a1a1a';
	ctx.font = 'bold ' + titleH + 'px sans-serif';
	ctx.textBaseline = 'top';
	ctx.fillText(groupLabel, pad, y);
	if (!withCards && !listLineCount && !totalText) return c; // 見出しだけの帯（下の区切り線は上で引いてある）
	y += titleH + gapY;

	if (withCards) {
		const roundRect = (x, yy, w, h, r) => {
			ctx.beginPath();
			ctx.moveTo(x + r, yy);
			ctx.arcTo(x + w, yy, x + w, yy + h, r);
			ctx.arcTo(x + w, yy + h, x, yy + h, r);
			ctx.arcTo(x, yy + h, x, yy, r);
			ctx.arcTo(x, yy, x + w, yy, r);
			ctx.closePath();
		};

		const cardGap = Math.round(width * 0.03);
		const cardW = (width - pad * 2 - cardGap) / 2;
		const radius = Math.round(width * 0.02);

		const x1 = pad;
		roundRect(x1, y, cardW, cardH, radius);
		ctx.fillStyle = '#f5f8ff';
		ctx.fill();
		ctx.strokeStyle = '#cfe0fb';
		ctx.lineWidth = 2;
		ctx.stroke();

		ctx.fillStyle = '#3c5a99';
		ctx.font = 'bold ' + Math.round(cardH * 0.28) + 'px sans-serif';
		ctx.textBaseline = 'top';
		ctx.fillText('検出', x1 + cardW * 0.08, y + cardH * 0.10);

		ctx.fillStyle = '#0f3fc9';
		ctx.font = 'bold ' + Math.round(cardH * 0.56) + 'px sans-serif';
		ctx.fillText(String(totalDetected), x1 + cardW * 0.08, y + cardH * 0.36);

		const x2 = x1 + cardW + cardGap;
		roundRect(x2, y, cardW, cardH, radius);
		ctx.fillStyle = '#fffaf0';
		ctx.fill();
		ctx.strokeStyle = '#f5dfae';
		ctx.lineWidth = 2;
		ctx.stroke();

		ctx.fillStyle = '#a9720b';
		ctx.font = 'bold ' + Math.round(cardH * 0.28) + 'px sans-serif';
		ctx.textBaseline = 'top';
		ctx.fillText('sp70緑', x2 + cardW * 0.08, y + cardH * 0.10);

		ctx.fillStyle = '#c96a00';
		ctx.font = 'bold ' + Math.round(cardH * 0.56) + 'px sans-serif';
		ctx.fillText(String(sp70Count), x2 + cardW * 0.08, y + cardH * 0.36);
	}

	// 拡張モードの合計（C-136・段5）。カードがあればその下、無ければ見出しのすぐ下
	let cardsPassed = false;
	if (totalText) {
		if (withCards) y += cardH + gapY;
		cardsPassed = true;
		const rr = (x, yy, w, h, r) => {
			ctx.beginPath();
			ctx.moveTo(x + r, yy);
			ctx.arcTo(x + w, yy, x + w, yy + h, r);
			ctx.arcTo(x + w, yy + h, x, yy + h, r);
			ctx.arcTo(x, yy + h, x, yy, r);
			ctx.arcTo(x, yy, x + w, yy, r);
			ctx.closePath();
		};
		// 合計の1行（薄い紫の角丸）
		rr(pad, y, width - pad * 2, totalH, Math.round(totalH * 0.3));
		ctx.fillStyle = stitchTokenColor('--exam-eff-total-bg');
		ctx.fill();
		ctx.strokeStyle = stitchTokenColor('--exam-eff-total-border');
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.fillStyle = stitchTokenColor('--exam-eff-total-text');
		ctx.font = 'bold ' + totalFont + 'px sans-serif';
		ctx.textBaseline = 'middle';
		ctx.fillText(totalText, pad + Math.round(totalFont * 0.6), y + totalH / 2);
		ctx.textBaseline = 'top';
		y += totalH + gapY;
	}

	if (listLineCount) {
		// カードがあればその下、無ければ見出しのすぐ下（y は見出しの下端＋余白のまま）
		if (withCards && !cardsPassed) y += cardH + gapY;
		// 幅に収まらない行があれば、**全部のまとまりをまとめて**縮めて桁を揃える
		// （区分ごとに大きさを決めると、因子と遺伝子で字の大きさが変わってしまう）。
		// 各まとまりの最後の行は、右端の「他」と重ならないようそのぶん狭い幅で見る。
		const moreText = '他';
		let fs = listFont;
		const maxW = width - pad * 2;
		const fits = () => {
			ctx.font = 'bold ' + fs + 'px sans-serif';
			const moreW = ctx.measureText(moreText).width + fs * 0.6;
			return listBlocks.every(b => b.lines.every((t, i) => {
				const limit = (b.more && i === b.lines.length - 1) ? maxW - moreW : maxW;
				return ctx.measureText(t).width <= limit;
			}));
		};
		while (fs > 9 && !fits()) fs -= 1;
		ctx.font = 'bold ' + fs + 'px sans-serif';
		ctx.textBaseline = 'top';
		let row = 0;
		listBlocks.forEach(b => {
			ctx.textAlign = 'left';
			ctx.fillStyle = stitchTokenColor(b.textToken);
			b.lines.forEach((t, i) => ctx.fillText(t, pad, y + (row + i) * listLineH));
			if (b.more) {
				// 「他」だけは薄い色にして、その区分の並びの続きだと分かるようにする
				ctx.fillStyle = stitchTokenColor(b.moreToken);
				ctx.textAlign = 'right';
				ctx.fillText(moreText, width - pad, y + (row + b.lines.length - 1) * listLineH);
				ctx.textAlign = 'left';
			}
			row += b.lines.length;
		});
	}

	return c;
}

// exam.html 8644〜8644 行
const STITCH_COUNT_NOTE = '※「〇〇の目覚め」は対応する緑スキルと個別にカウントしています。';

// exam.html 8647〜8647 行
const EFF_COUNT_NOTE = '※継承固有・レース因子(スキル)は集計に含めていません。『〇〇の目覚め』は対応する緑スキルと個別にカウントしています。';

// exam.html 8649〜8649 行
const EFF_STAR_NOTE = '※”合計評価点（★補正）”は、各スキルの評価点に重みづけをした合計値です（★3＝1、★2＝2/3、★1＝1/3）。';

// exam.html 8656〜8672 行
function stitchDrawCountNoteBar(totalWidth, referenceWidth) {
	const c = document.createElement('canvas');
	const ctx = c.getContext('2d');
	const m = stitchNoteMetrics(ctx, totalWidth, referenceWidth, STITCH_COUNT_NOTE);
	c.width = totalWidth;
	c.height = m.lineH;
	// canvas の大きさを変えると描画状態が初期化されるので、ここで設定し直す
	ctx.font = 'bold ' + m.fontSize + 'px sans-serif';
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, totalWidth, c.height);
	ctx.fillStyle = STITCH_NOTE_COLOR;
	ctx.textBaseline = 'top';
	ctx.textAlign = 'right';
	ctx.fillText(STITCH_COUNT_NOTE, totalWidth - m.pad, Math.round(m.lineH * 0.15));
	ctx.textAlign = 'left';
	return c;
}

// exam.html 8690〜8701 行
function effSplitAt(text, inner) {
	const segs = [];
	let cur = '', depth = 0;
	for (const ch of text) {
		if (!inner && (ch === '（' || ch === '(')) { if (depth === 0 && cur) { segs.push(cur); cur = ''; } depth++; }
		else if (!inner && (ch === '）' || ch === ')') && depth > 0) depth--;
		cur += ch;
		if ((ch === '、' || ch === '。') && (inner || depth === 0)) { segs.push(cur); cur = ''; }
	}
	if (cur) segs.push(cur);
	return segs;
}

// exam.html 8702〜8718 行
function effWrapAtPunct(ctx, text, maxWidth) {
	if (ctx.measureText(text).width <= maxWidth) return [text];
	const lines = [];
	let line = '';
	const put = (seg, depth) => {
		if (line && ctx.measureText(line + seg).width <= maxWidth) { line += seg; return; }
		if (ctx.measureText(seg).width <= maxWidth) { if (line) lines.push(line); line = seg; return; }
		if (depth === 0) { effSplitAt(seg, true).forEach(x => put(x, 1)); return; }
		if (line) lines.push(line);
		const wrapped = stitchWrapText(ctx, seg, maxWidth);
		wrapped.slice(0, -1).forEach(l => lines.push(l));
		line = wrapped[wrapped.length - 1] || '';
	};
	effSplitAt(text, false).forEach(seg => put(seg, 0));
	if (line) lines.push(line);
	return lines;
}

// exam.html 8720〜8780 行
function stitchDrawSharedNoteBar(totalWidth, referenceWidth, markInfo, show, run, personIdxs) {
	const s = Object.assign({ legend: true, conditions: true }, show || {});
	// 測るための ctx（帯そのものは js/stitch.js の stitchDrawNoteBar が別のCanvasに描く）。
	// **測るときと描くときで同じ font を使う**ため、m を取った ctx のまま measureText する。
	const ctx = document.createElement('canvas').getContext('2d');
	const m = stitchNoteMetrics(ctx, totalWidth, referenceWidth, STITCH_COUNT_NOTE);
	const fontSize = m.fontSize;
	const maxTextWidth = m.maxTextWidth;

	// 印の凡例。使った区分だけを並べる。記号は色で描き分けるので、
	// 文字ではなく結果画像と同じ drawSkillMark() で描く。
	const info = markInfo || {};
	// 効率を指定（C-136・改善2）: 印の凡例と「印の無い行の説明」は出さない（区間まとめパネルが凡例に当たる）。
	// 数え方の脚注を先頭に常に置く。蹄鉄を付けられなかった理由（画面の形が未対応など）は、蹄鉄を描く設定のときに出す
	const effNote = !!info.effNote;
	const markColors = (s.legend && info.kinds && info.kinds.length) ? attrMarkColors() : null;
	const legendLines = markColors ? buildMarkLegendLines(ctx, info.kinds, maxTextWidth, fontSize) : [];
	// 脚注は、1行に収まらなければ「。」の切れ目で2文に分けてから折り返す（語の途中で切れないように）
	let effNoteLines = effNote ? stitchWrapText(ctx, EFF_COUNT_NOTE, maxTextWidth) : [];
	if (effNoteLines.length > 1) {
		effNoteLines = [];
		EFF_COUNT_NOTE.split('。').filter(Boolean).forEach(sentence => {
			stitchWrapText(ctx, sentence + '。', maxTextWidth).forEach(line => effNoteLines.push(line));
		});
	}
	// ★補正の脚注は、その下に別の行として。1行に収まらなければ、句読点（「、」「。」）の切れ目で行を分ける（括弧の中では切らない。語の途中で切らない）
	if (effNote) effNoteLines = effNoteLines.concat(effWrapAtPunct(ctx, EFF_STAR_NOTE, maxTextWidth));

	// 凡例に続く、印そのものについての断り（印の無い行の意味・印を付けなかった理由）。
	const markNotes = [];
	if (legendLines.length) {
		stitchWrapText(ctx, MARK_LEGEND_NOTE, maxTextWidth).forEach(line => markNotes.push(line));
	}
	((s.legend || effNote) ? (info.suppressed || []) : []).slice()
		.sort((a, b) => MARK_SUPPRESSED_ORDER.indexOf(a) - MARK_SUPPRESSED_ORDER.indexOf(b))
		.forEach(reason => {
			const text = MARK_SUPPRESSED_NOTE[reason];
			if (!text) return;
			stitchWrapText(ctx, text, maxTextWidth).forEach(line => markNotes.push(line));
		});

	// 何を対象にしたか（追加スキル → 除外スキル → シナリオ因子 → 遺伝子）。
	const adjustNotes = [];
	(s.conditions ? buildTargetAdjustmentNotes(run, personIdxs) : []).forEach(t => {
		stitchWrapText(ctx, t, maxTextWidth).forEach(line => adjustNotes.push(line));
	});

	// 行の順は「印の見かた → 印の無い行の説明 → 追加 → 除外 → シナリオ因子 → 遺伝子」。
	// 画像を見た人がまず知りたいのは記号の意味なので、凡例を先頭に置き、
	// 対象スキルをどう調整したかは後ろにまとめる。
	// 記号の部品は、描き方（drawSkillMark と色）を包んで骨格へ渡す。
		const rows = effNoteLines.map(line => stitchNoteTextRow(ctx, line));
	legendLines.forEach(segs => rows.push(segs.map(it => (it.type === 'mark'
		? { type: 'mark', w: it.w, draw: (c2, cx, cy, d) => drawSkillMark(c2, it.kind, cx, cy, d, markColors) }
		: it))));
	markNotes.forEach(line => rows.push(stitchNoteTextRow(ctx, line)));
	adjustNotes.forEach(line => rows.push(stitchNoteTextRow(ctx, line)));

	// 書くことが1行も無ければ帯そのものを置かない（stitchDrawNoteBar が null を返す）
	return stitchDrawNoteBar(totalWidth, m, rows);
}
