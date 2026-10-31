/*
 * T44 結合画像の次の直しのモック（作業用・どこからもリンクしない・製品のファイルは変えない）。
 * special.html を開いたページに後から読み込み、結合画像の関数のいくつかをページの中だけで差し替える。
 * 使い方は scripts/stitch-next-mock-shots.mjs（Playwright で special.html を開き、このファイルを addScriptTag で足す）。
 *
 * 設定は window.__T44（読み込む前でも後でもよい。描くときに読む）:
 *   spVariant: 'A' | 'B'
 *     A … 上段の高さは今の 176 のまま。字を縮めて「理論値SP」の6行を入れる
 *     B … 字は今の大きさ（合計 46px 太字・「 Pt／N種…」26px 太字・ほかの行 23px）。6行が入る高さまで上段を高くする
 *   gene: { frame, tint, text, name } | null … 遺伝子の色（枠・塗り・見出しの字）。null なら遺伝子を描かない
 *   geneNames: [名前…] … 遺伝子の名前（data/aptitude-genes.json の並び）。結合画像の枠の種類 'gene' に当てる
 *   genesByLabel: { '親A': [名前…], … } … 人の見出しの右に縦に並べる遺伝子（最大3つ）
 * 写しの set.sp に足す値（モック用）: uniqKinds（継承固有の種類）・uniqLevel（継承固有のヒントLv）・commonLevel（共通スキルのヒントLv）
 * 測った値は window.__T44.metrics に残す（スクリプトが読む）。
 */
(function () {
	const T = window.__T44 = Object.assign({ spVariant: 'A', gene: null, geneNames: [], genesByLabel: {} }, window.__T44 || {});
	T.metrics = { sp: null, heads: [], geneBoxes: [] };
	const L = STITCH_LAYOUT;
	const HEAD_SP = '理論値SP';
	const FONT_FLOOR = 16;   // どの字も 16px 未満にしない

	// 案ごとの寸法。line1 は「合計の数字」と「後半（ Pt／N種（固有スキル含む）／状態）」、rows は 2〜5 行目（①・②・継承固有・共通スキル）
	const SPEC = {
		A: { num: 30, unit: 20, row: 18, line1H: 36, rowH: 25, numShrink: true, numMin: 24 },     // 34＋6＋36＋25×4 = 176（今の高さ）
		B: { num: 46, unit: 26, row: 23, line1H: 52, rowH: 34 }      // 34＋6＋52＋34×4 = 228
	};
	const spec = () => SPEC[T.spVariant] || SPEC.A;
	const topH = () => L.topHeadH + L.topHeadGap + spec().line1H + 4 * spec().rowH;
	const cardsH = () => L.topHeadH + L.topHeadGap + L.cardRows * L.cardH + (L.cardRows - 1) * L.cardGap;

	// 上段の高さ: 案A は今のまま（カードの高さで決まる 176）。案B は6行が入る高さとカードの高さの大きいほう
	window.stitchTopRowH = function () { return Math.max(cardsH(), topH()); };

	// 「理論値SP」の欄（6行）
	window.stitchDrawTopSp = function (ctx, x, y, w, sp) {
		stitchDrawTopHead(ctx, x, y, w, HEAD_SP);
		const lines = [];
		const m = { variant: T.spVariant, x: x, w: w, rows: [], overflow: [] };
		T.metrics.sp = m;
		if (!sp) return lines;
		const s = spec();
		const fmt = UmaSkillDeckCore.formatPtNumber;
		const maxW = w - 4;
		let yy = y + L.topHeadH + L.topHeadGap;
		ctx.save();
		ctx.fillStyle = STITCH_INK;
		ctx.textAlign = 'left';
		// 1行目: 合計の数字（太字）＋後半（太字。入らなければ後半だけを 16px まで縮める）
		const num = fmt(sp.total);
		const tail = ' Pt' + (sp.totalKinds !== null ? '／' + sp.totalKinds + '種（固有スキル含む）' : '') + (sp.statusLabel ? '／' + sp.statusLabel : '');
		let ns = s.num;
		ctx.font = 'bold ' + ns + 'px sans-serif';
		let nw = ctx.measureText(num).width;
		let us = s.unit;
		ctx.font = 'bold ' + us + 'px sans-serif';
		while (us > FONT_FLOOR && nw + ctx.measureText(tail).width > maxW) { us--; ctx.font = 'bold ' + us + 'px sans-serif'; }
		// 案A だけ: 後半が 16px でも入らなければ合計の数字も縮める（案A は字を縮めて入れる案。数字は後半より小さくしない）
		while (s.numShrink && ns > Math.max(FONT_FLOOR, s.numMin) && nw + ctx.measureText(tail).width > maxW) {
			ns--; ctx.font = 'bold ' + ns + 'px sans-serif'; nw = ctx.measureText(num).width; ctx.font = 'bold ' + us + 'px sans-serif';
		}
		const tw = ctx.measureText(tail).width;
		ctx.textBaseline = 'alphabetic';
		const base1 = yy + Math.round(s.line1H * 0.85);
		ctx.font = 'bold ' + ns + 'px sans-serif';
		ctx.fillText(num, x + 2, base1);
		ctx.font = 'bold ' + us + 'px sans-serif';
		ctx.fillText(tail, x + 2 + nw, base1);
		lines.push(num + tail);
		m.rows.push({ text: num + tail, numPx: ns, tailPx: us, width: Math.ceil(nw + tw), top: yy, h: s.line1H, fits: nw + tw <= maxW });
		if (nw + tw > maxW) m.overflow.push({ row: 1, need: Math.ceil(nw + tw + 4), have: w });
		yy += s.line1H;
		// 2〜5行目
		ctx.textBaseline = 'middle';
		const uniqLine = (sp.uniqKinds > 0)
			? '・継承固有' + sp.uniqKinds + '種／ヒントLv' + sp.uniqLevel + '含む'
			: '・継承固有0種';
		const rows = [
			'①　本育成編成：' + fmt(sp.rosterPt) + ' Pt',
			'②　因子周回編成：' + fmt(sp.factorPt) + ' Pt',
			uniqLine,
			'・共通スキルヒントLv' + sp.commonLevel
		];
		rows.forEach((t, i) => {
			let fs = s.row;
			ctx.font = 'normal ' + fs + 'px sans-serif';
			while (fs > FONT_FLOOR && ctx.measureText(t).width > maxW) { fs--; ctx.font = 'normal ' + fs + 'px sans-serif'; }
			const tw2 = ctx.measureText(t).width;
			ctx.fillText(t, x + 2, yy + s.rowH / 2);
			lines.push(t);
			m.rows.push({ text: t, px: fs, width: Math.ceil(tw2), top: yy, h: s.rowH, fits: tw2 <= maxW });
			if (tw2 > maxW) m.overflow.push({ row: i + 2, need: Math.ceil(tw2 + 4), have: w });
			yy += s.rowH;
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

	// 人の見出しの行: 今の形（顔＋ラベル）の右に、遺伝子の名前を縦に最大3段
	const baseHead = window.stitchDrawPersonHead;
	window.stitchDrawPersonHead = function (ctx, x, y, icon, label) {
		const out = baseHead(ctx, x, y, icon, label);
		const genes = (T.gene && T.genesByLabel[label]) || [];
		if (!genes.length) { T.metrics.heads.push({ label: label, genes: [] }); return out; }
		const list = genes.slice(0, 3);
		const gx = out.label.x + out.label.w + 14;
		const lineH = Math.floor(L.headIcon / 3);   // 3段で 64px（21px ずつ）
		const fs = 18;
		const top = y + Math.round((L.headIcon - lineH * list.length) / 2);
		ctx.save();
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold ' + fs + 'px sans-serif';
		const ws = [];
		list.forEach((g, i) => {
			const cy = top + lineH * i + lineH / 2;
			// 名前の左に小さな見本（枠と塗り）。画像の中の遺伝子の枠と同じ色
			const sw = 14, sh = 12;
			ctx.fillStyle = T.gene.tint;
			ctx.fillRect(gx, cy - sh / 2, sw, sh);
			ctx.strokeStyle = T.gene.frame;
			ctx.lineWidth = 2;
			ctx.strokeRect(gx + 1, cy - sh / 2 + 1, sw - 2, sh - 2);
			ctx.fillStyle = T.gene.text;
			ctx.fillText(g, gx + sw + 6, cy + 1);
			ws.push(Math.ceil(sw + 6 + ctx.measureText(g).width));
		});
		ctx.restore();
		out.genes = { x: gx, y: top, w: Math.max(...ws), h: lineH * list.length, font: fs, lineH: lineH, names: list };
		T.metrics.heads.push({ label: label, genes: list, box: out.genes });
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
