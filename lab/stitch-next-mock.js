/*
 * 結合画像の次の直しのモック（T44 で作り、T49 でおいもさんの回答〔2026-10-31〕に合わせて作り直した。作業用・どこからもリンクしない・製品のファイルは変えない）。
 * special.html を開いたページに後から読み込み、結合画像の関数のいくつかをページの中だけで差し替える。
 * 使い方は scripts/stitch-next-mock-shots.mjs（Playwright で special.html を開き、このファイルを読み込む）。
 *
 * 形（T50。T49 の2行目「（固有スキル含む）」を消し、1行目を1行に戻した）:
 *   上段の左の欄「理論値SP」（幅は今の 400 のまま。行が入る高さまで上段を高くする）
 *     理論値SP
 *     12,321 Pt／106種／切れ者      … 数字 46px 太字・「 Pt／106種／切れ者」は太字で、いちばん幅の広い見本が入る大きさ（26〜20px）
 *                                     （勉強家なら「／勉強家」、状態なしなら付けない）
 *     ①　本育成編成：8,655 Pt        … 以下4行は 23px
 *     ②　因子周回：3,666 Pt
 *     ・継承固有6種／ヒントLv3含む    （0種なら「・継承固有0種」だけ）
 *     ・共通スキルヒントLv5
 *   遺伝子: 人の見出しの行の右に「名前：★N」を縦に最大3段（★を測れなかったものは「★?」。UmaExam と同じ）・名前の左に枠と塗りの見本。
 *   遺伝子のパネルはその色の枠と薄い塗り。「枠の見かた」の最後に「遺伝子」。
 *
 * 設定は window.__T44:
 *   gene: { frame, tint, text } | null … 遺伝子の色（枠・塗り・見出しの字）。null なら遺伝子を描かない
 *   genesByLabel: { '親A': [{ name, stars }], … } … 人の見出しの右に並べる遺伝子（stars は数・null〔測れなかった〕）
 * 写しの set.sp に足す値（モック用）: uniqKinds（継承固有の種類）・uniqLevel（継承固有のヒントLv）・commonLevel（共通スキルのヒントLv）
 * 測った値は window.__T44.metrics に残す（スクリプトが読む）。
 */
(function () {
	const T = window.__T44 = Object.assign({ gene: null, genesByLabel: {} }, window.__T44 || {});
	T.metrics = { sp: null, heads: [], geneBoxes: [] };
	const L = STITCH_LAYOUT;
	const HEAD_SP = '理論値SP';
	// 寸法（今の字の大きさのまま）。行の高さ: 1行目は今の 52、2行目〜は今の内訳の行の 34
	const S = { num: 46, tail: 26, tailMin: 20, row: 23, line1H: 52, rowH: 34 };
	const ROWS_AFTER = 4;   // ①・②・継承固有・共通スキル
	const spH = () => L.topHeadH + L.topHeadGap + S.line1H + ROWS_AFTER * S.rowH;
	// 1行目の後半（「 Pt／N種／状態」）の字の大きさ（T50）: いちばん幅の広い見本（合計 99,999・999種・勉強家／切れ者の広いほう）が
	// 欄に入る大きさを 26px から 1px ずつ下げて決める（下限 20px）。状態によって変えない。入らなければ fits: false（幅は広げない）
	const WIDEST = { num: '99,999', tails: [' Pt／999種／勉強家', ' Pt／999種／切れ者'] };
	function tailPx(ctx, maxW) {
		ctx.save();
		ctx.font = 'bold ' + S.num + 'px sans-serif';
		const nw = ctx.measureText(WIDEST.num).width;
		const widthAt = (px) => { ctx.font = 'bold ' + px + 'px sans-serif'; return Math.max(...WIDEST.tails.map(t => ctx.measureText(t).width)); };
		let px = S.tail;
		while (px > S.tailMin && nw + widthAt(px) > maxW) px--;
		const need = Math.ceil(nw + widthAt(px));
		ctx.restore();
		return { px: px, widestW: need, fits: need <= maxW, widestNumW: Math.ceil(nw) };
	}
	const cardsH = () => L.topHeadH + L.topHeadGap + L.cardRows * L.cardH + (L.cardRows - 1) * L.cardGap;

	// 上段の高さ: 「理論値SP」の行が入る高さとカードの高さの大きいほう
	window.stitchTopRowH = function () { return Math.max(cardsH(), spH()); };

	window.stitchDrawTopSp = function (ctx, x, y, w, sp) {
		stitchDrawTopHead(ctx, x, y, w, HEAD_SP);
		const lines = [];
		const m = { x: x, w: w, maxW: w - 4, rows: [], overflow: [] };
		T.metrics.sp = m;
		if (!sp) return lines;
		const fmt = UmaSkillDeckCore.formatPtNumber;
		const maxW = w - 4;
		let yy = y + L.topHeadH + L.topHeadGap;
		ctx.save();
		ctx.fillStyle = STITCH_INK;
		ctx.textAlign = 'left';
		// 1行目: 合計の数字 46px 太字 ＋「 Pt／N種／状態」（太字。大きさは tailPx() で決めた1つ。状態によって変えない）
		const num = fmt(sp.total);
		const tail = ' Pt' + (sp.totalKinds !== null ? '／' + sp.totalKinds + '種' : '') + (sp.statusLabel ? '／' + sp.statusLabel : '');
		const ts = tailPx(ctx, maxW);
		ctx.textBaseline = 'alphabetic';
		ctx.font = 'bold ' + S.num + 'px sans-serif';
		const nw = ctx.measureText(num).width;
		ctx.fillText(num, x + 2, yy + 44);
		ctx.font = 'bold ' + ts.px + 'px sans-serif';
		const tw = ctx.measureText(tail).width;
		ctx.fillText(tail, x + 2 + nw, yy + 44);
		lines.push(num + tail);
		m.tail = ts;
		m.rows.push({ text: num + tail, numPx: S.num, tailPx: ts.px, weight: 'bold', numW: Math.ceil(nw), tailW: Math.ceil(tw), width: Math.ceil(nw + tw), top: yy, h: S.line1H, fits: nw + tw <= maxW });
		if (nw + tw > maxW) m.overflow.push({ row: 1, need: Math.ceil(nw + tw + 4) });
		yy += S.line1H;
		ctx.textBaseline = 'middle';
		// 2〜5行目（23px）
		const rows = [
			'①　本育成編成：' + fmt(sp.rosterPt) + ' Pt',
			'②　因子周回：' + fmt(sp.factorPt) + ' Pt',
			sp.uniqKinds > 0 ? '・継承固有' + sp.uniqKinds + '種／ヒントLv' + sp.uniqLevel + '含む' : '・継承固有0種',
			'・共通スキルヒントLv' + sp.commonLevel
		];
		ctx.font = 'normal ' + S.row + 'px sans-serif';
		rows.forEach((t, i) => {
			const rw = ctx.measureText(t).width;
			ctx.fillText(t, x + 2, yy + S.rowH / 2);
			lines.push(t);
			m.rows.push({ text: t, px: S.row, weight: 'normal', width: Math.ceil(rw), top: yy, h: S.rowH, fits: rw <= maxW });
			if (rw > maxW) m.overflow.push({ row: i + 2, need: Math.ceil(rw + 4) });
			yy += S.rowH;
		});
		m.bottom = yy;
		ctx.restore();
		return lines;
	};

	// 遺伝子の枠の種類 'gene'。製品の3種（card・star・other）は今のまま
	const baseStyleOf = window.factorFrameStyleOf;
	window.factorFrameStyleOf = function (kind) {
		if (kind === 'gene') return T.gene ? { frame: T.gene.frame, tint: T.gene.tint, marker: null } : null;
		return baseStyleOf(kind);
	};
	// 枠の位置を残す（遺伝子の色の枠だけ。人の結合画像の座標）
	let curPerson = -1;
	const baseFrames = window.drawFactorFramesOnPerson;
	window.drawFactorFramesOnPerson = function (canvas, personIdx) {
		curPerson = personIdx;
		try { return baseFrames(canvas, personIdx); } finally { curPerson = -1; }
	};
	const baseStroke = window.strokeFactorFrame;
	window.strokeFactorFrame = function (ctx, box, color) {
		if (T.gene && color === T.gene.frame) T.metrics.geneBoxes.push({ person: curPerson, left: box.left, right: box.right, top: box.top, bottom: box.bottom, line: box.line });
		return baseStroke(ctx, box, color);
	};

	// 人の見出しの行: 今の形（顔＋ラベル）の右に、遺伝子の「名前：★N」を縦に最大3段（UmaExam の catalogHighlightRows と同じ書き方。測れなければ ★?）
	const starText = (v) => (typeof v === 'number' ? '★' + v : '★?');
	const baseHead = window.stitchDrawPersonHead;
	window.stitchDrawPersonHead = function (ctx, x, y, icon, label) {
		const out = baseHead(ctx, x, y, icon, label);
		const genes = (T.gene && T.genesByLabel[label]) || [];
		if (!genes.length) { T.metrics.heads.push({ label: label, x: x, genes: [] }); return out; }
		const list = genes.slice(0, 3);
		const gx = out.label.x + out.label.w + 14;
		const lineH = Math.floor(L.headIcon / 3);   // 3段で 64px（21px ずつ）
		const fs = 18;
		const top = y + Math.round((L.headIcon - lineH * list.length) / 2);
		ctx.save();
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold ' + fs + 'px sans-serif';
		const ws = [], texts = [];
		list.forEach((g, i) => {
			const cy = top + lineH * i + lineH / 2;
			const text = g.name + '：' + starText(g.stars);
			// 名前の左に小さな見本（枠と塗り）。画像の中の遺伝子の枠と同じ色
			const sw = 14, sh = 12;
			ctx.fillStyle = T.gene.tint;
			ctx.fillRect(gx, cy - sh / 2, sw, sh);
			ctx.strokeStyle = T.gene.frame;
			ctx.lineWidth = 2;
			ctx.strokeRect(gx + 1, cy - sh / 2 + 1, sw - 2, sh - 2);
			ctx.fillStyle = T.gene.text;
			ctx.fillText(text, gx + sw + 6, cy + 1);
			ws.push(Math.ceil(sw + 6 + ctx.measureText(text).width));
			texts.push(text);
		});
		ctx.restore();
		out.genes = { x: gx, y: top, w: Math.max(...ws), h: lineH * list.length, font: fs, lineH: lineH, texts: texts, widths: ws };
		T.metrics.heads.push({ label: label, x: x, genes: list, box: out.genes });
		return out;
	};

	// 「枠の見かた」の行: 今の3種のあとに「遺伝子」（枠と塗りの見本だけ。②のマーカーは無い）
	const baseLegend = window.buildFactorFrameLegendBar;
	window.buildFactorFrameLegendBar = function (totalWidth, referenceWidth, hasFrames, opts) {
		const c0 = baseLegend(totalWidth, referenceWidth, hasFrames, opts);
		if (!c0 || !T.gene) return c0;
		const d = c0._fontSize;
		const g0 = document.createElement('canvas').getContext('2d');
		g0.font = 'bold ' + d + 'px sans-serif';
		const label = ' 遺伝子';
		const gap = d * 1.2, sw = d * 1.5, sh = d * 0.86;
		const add = gap + sw + d * 0.3 + g0.measureText(label).width;
		const c = document.createElement('canvas');
		c.width = Math.ceil(c0.width + add + 2);
		c.height = c0.height;
		const ctx = c.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, c.width, c.height);
		ctx.drawImage(c0, 0, 0);
		const x0 = c0.width + gap, cy = c.height / 2;
		const panel = factorHexToRgb(T.gene.tint).map(v => Math.round(FACTOR_LEGEND_PANEL_GRAY * v / 255));
		ctx.fillStyle = 'rgb(' + panel.join(',') + ')';
		ctx.fillRect(x0, cy - sh / 2, sw, sh);
		ctx.strokeStyle = T.gene.frame;
		ctx.lineWidth = Math.max(2, Math.round(d * 0.95 * 0.12));
		ctx.strokeRect(x0, cy - sh / 2, sw, sh);
		ctx.font = 'bold ' + d + 'px sans-serif';
		ctx.fillStyle = STITCH_NOTE_COLOR;
		ctx.textBaseline = 'middle';
		ctx.fillText(label, x0 + sw + d * 0.3, cy);
		c._fontSize = d;
		return c;
	};
})();
