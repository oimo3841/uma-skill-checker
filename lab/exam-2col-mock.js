/* T146: UmaExam の結合画像の2列のモック（lab/exam-2col-mock.html）。ツール本体には組み込まない。
 *
 * 帯・補助の帯は exam.html の関数の写し（exam-2col-mock-exam.js）で描く。人の画像は、見本のデータ（exam-2col-mock-data.js）の大きさの
 * 灰色の箱で描く（ゲームの画面の画像は使わない）。書き出しの道具は window.__examMock.setImages で実物の画像を差し込める。
 *
 *  3列 … 今の exam.html の buildStitchedSetImage と同じ組み立て（帯の行 → 数え方の脚注 → 3人の横並び → 補助の帯）。
 *  2列 … UmaStar の2列（special.html の composeFamilyImage2）の決まりに合わせる:
 *         1列目＝親（親の1枚目の上の欄〔ステータス・適性〕を先頭に足す）／2列目＝祖1 の下に祖2（同じ縮小率で、2人の高さの合計を1列目にそろえる。拡大しない）
 *         人の画像は両側を削らない（小窓の左右の端で切る）／3列目は人の上端から／画素数が上限を超えるときは全体を同じ割合で縮める。
 *    (ア) 人ごとの帯（今の帯のまま）を 親→祖1→祖2 の順に3列目へ縦に並べ、その下に数え方の脚注・凡例・集計条件
 *    (イ) 人ごとの帯は人の画像の上に残す（祖は画像と一緒に縮める）。3列目は数え方の脚注・凡例・集計条件だけ
 *    (ウ) (ア) の並びで、帯を縦に並べる向きに組み直したもの（下の drawUBlock。見出しの行にカードを並べる・因子と遺伝子を「／」でつなぐ・字を大きく）
 *    596版（T152・決定 596〜606。2列の既定。?plan=v2）… (ア) の並びのまま、次だけ変えたもの:
 *         通常・めろっぷ拡張の「検出」「sp70緑」のカードは、ラベルの右に数字を置く横並び（drawPersonBannerV2。3列にも入れる＝決定 603）／
 *         親A などの見出しは、通常・めろっぷ拡張では「検出数カード」「シナリオ因子・遺伝子」の少なくとも一方が ON のときだけ（OFF なら帯ごと出さない）・効率を指定ではいつも／
 *         いちばん下の帯の下の線と、補助の帯の上の線を描かない／数え方の脚注（効率を指定は2つの脚注）は左詰め／集計条件は描かない（上の操作のチェックも隠す）。
 *    (ア)(イ)(ウ) は T146 のまま（見比べ用。中身は変えていない）。
 */
'use strict';
(function () {
	const MAX_PIXELS = 16000000;   // special.html の STITCH_LAYOUT.maxPixels と同じ
	const GAP = 8;                 // 列の間（exam の stitchConcatHorizontallyTopAligned の既定と同じ）
	const MODES = ['normal', 'eff', 'melop'];
	const PLANS = ['v2', 'a', 'i', 'u'];
	const SHOW_KEYS = ['banner', 'scenario', 'marks', 'legend', 'conditions'];

	// legacyCards: 3列のカードを製品の形（縦並び）で描く。書き出しの道具が「カード以外は製品と同じ」を確かめるときだけ使う
	const state = { mode: 'normal', cols: 3, plan: 'v2', legacyCards: false, show: { banner: true, scenario: true, marks: true, legend: true, conditions: true } };
	const injected = {};   // mode → [{ img, raw, top }]（Canvas か Image）。書き出しの道具だけが使う

	// exam の stitchDrawSharedNoteBar が呼ぶ集計条件の行。モックでは見本のデータの行をそのまま返す
	window.buildTargetAdjustmentNotes = function (run) { return (run && run.adjustNotes) || []; };

	let shoeImgs = null;
	function loadShoes() {
		if (shoeImgs) return shoeImgs;
		shoeImgs = Promise.all(EFF_TIER_ICON_SRCS.map((src) => new Promise((res) => {
			const img = new Image();
			img.onload = () => res(img);
			img.onerror = () => res(null);
			img.src = '../' + src;
		})));
		return shoeImgs;
	}

	function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
	function toCanvas(src) { if (src instanceof HTMLCanvasElement) return src; const c = canvasOf(src.naturalWidth || src.width, src.naturalHeight || src.height); c.getContext('2d').drawImage(src, 0, 0); return c; }

	/* ---------- 人の画像（灰色の箱） ---------- */
	// 1人分の結合画像の代わり（大きさは見本のデータの値）。小窓の外は濃い灰・中は薄い灰、スキルパネルは2列の角丸の箱。
	// 印が ON なら、パネルの左に印（効率を指定は蹄鉄）を描く。
	function placeholderPerson(p, sc, marks, shoes) {
		const W = p.width, H = p.height;
		const c = canvasOf(W, H), g = c.getContext('2d');
		const L = p.band ? p.band.L : 0, R = p.band ? p.band.R : W;
		g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, W, H);
		g.fillStyle = '#f2f2f2'; g.fillRect(L, 0, R - L, H);
		g.fillStyle = '#c9c9c9'; g.beginPath(); g.arc(W * 0.065, W * 0.06, W * 0.05, 0, Math.PI * 2); g.fill();
		const pitch = Math.round(W * 0.082), ph = Math.round(W * 0.061);
		const cols = [[0.194, 0.565], [0.577, 0.948]].map(([a, b]) => [Math.round(W * a), Math.round(W * b)]);   // 実物のスキルパネルの左右（幅に対する割合）
		const colors = marks && !sc.effOn ? attrMarkColors() : null;
		let n = 0;
		for (let y = Math.round(W * 0.01); y + ph < H - W * 0.02; y += pitch) {
			cols.forEach(([a, b]) => {
				g.fillStyle = '#e1e1e1'; g.fillRect(a, y, b - a, ph);
				g.fillStyle = '#bdbdbd'; g.fillRect(a + ph * 0.6, y + ph * 0.28, (b - a) * 0.5, ph * 0.22);
				g.fillStyle = '#cfcfcf'; g.fillRect(a + (b - a) * 0.35, y + ph * 0.62, (b - a) * 0.22, ph * 0.18);
				const cx = a + ph * 0.3, cy = y + ph * 0.36, d = ph * 0.34;
				if (colors && sc.markKinds.length) drawSkillMark(g, sc.markKinds[n % sc.markKinds.length], cx, cy, d, colors);
				else if (marks && sc.effOn && shoes && shoes[(n % 3) + 1]) g.drawImage(shoes[(n % 3) + 1], cx - d * 0.75, cy - d * 0.75, d * 1.5, d * 1.5);
				n++;
			});
		}
		c._sourcePlacements = [];
		return c;
	}
	// 親の1枚目の上の欄（ステータス・適性）の代わり。幅は小窓の幅
	function placeholderTop(p) {
		const W = p.band.R - p.band.L, H = p.topH;
		const c = canvasOf(W, H), g = c.getContext('2d');
		g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, W, H);
		g.fillStyle = '#9ccf7a'; g.fillRect(0, 0, W, Math.round(W * 0.06));                // 小窓の上端の帯
		g.fillStyle = '#c9c9c9'; g.fillRect(W * 0.04, W * 0.1, W * 0.26, W * 0.3);         // 顔
		g.fillStyle = '#dedede';
		for (let i = 0; i < 4; i++) g.fillRect(W * 0.34, W * (0.1 + i * 0.08), W * 0.6, W * 0.055);
		for (let y = W * 0.45; y + W * 0.06 < H - W * 0.02; y += W * 0.085) g.fillRect(W * 0.04, y, W * 0.92, W * 0.06);
		return c;
	}

	// 人 k の画像（marks: 印を描いた版か）。差し込まれた実物の画像があればそれ
	function personCanvas(sc, k, marks, shoes) {
		const inj = injected[state.mode];
		if (inj && inj[k]) return toCanvas(marks ? inj[k].img : inj[k].raw);
		return placeholderPerson(sc.persons[k], sc, marks, shoes);
	}
	function topCanvas(sc, k) {
		const inj = injected[state.mode];
		if (inj && inj[k] && inj[k].top) return toCanvas(inj[k].top);
		const p = sc.persons[k];
		return p.band && p.topH ? placeholderTop(p) : null;
	}
	// 2列に置く1人分（special の stitchTwoColPerson と同じ: 左右は小窓の端で切る・withTop なら上の欄を先頭に）
	function twoColPerson(sc, k, content, withTop) {
		const p = sc.persons[k];
		const L0 = p.band ? p.band.L : 0, R0 = p.band ? p.band.R : content.width;
		const top = withTop ? topCanvas(sc, k) : null;
		const topH = top ? top.height : 0;
		const out = canvasOf(R0 - L0, topH + content.height);
		const g = out.getContext('2d');
		if (top) g.drawImage(top, 0, 0);
		g.drawImage(content, L0, 0, out.width, content.height, 0, topH, out.width, content.height);
		out._topH = topH;
		return out;
	}

	/* ---------- 実際に効く設定（exam の stitchShowEffective と同じ考え方） ---------- */
	function effective(sc) {
		const s = state.show, eff = sc.effOn;
		return { banner: !!s.banner, scenario: !!s.scenario, marks: !!s.marks,
			legend: !eff && !!s.legend && !!s.marks, conditions: !eff && !!s.conditions };
	}
	function markInfo(sc, show) {
		return { kinds: show.marks && !sc.effOn ? sc.markKinds.slice() : [], suppressed: show.marks ? sc.suppressed.slice() : [], effNote: sc.effOn };
	}
	function effPanelOf(p, shoes) {
		return p.effPanel ? { cells: p.effPanel.cells.map((c) => ({ img: shoes ? shoes[c.tier] : null, range: c.range, count: c.count })) } : null;
	}

	/* ---------- 今の帯（exam の関数のまま）。widths は人ごとの幅 ---------- */
	function productBanners(sc, show, widths, shoes) {
		const ps = sc.persons;
		if (sc.effOn) {
			const minLines = Math.max.apply(null, ps.map((p, k) => effPurpleLayout(widths[k], p.factors, p.genes, show.scenario).lineCount));
			const anyTotal = ps.some((p) => p.totalLines);
			return ps.map((p, k) => stitchDrawEffPersonBanner(widths[k], p.label, p.detected, p.sp70Count, p.factors, p.genes,
				{ purpleMinLines: minLines, totalReserve: anyTotal, cards: show.banner, factors: show.scenario, effPanel: effPanelOf(p, shoes), totalLines: p.totalLines }));
		}
		return ps.map((p, k) => stitchDrawPersonBanner(widths[k], p.label, p.detected, p.sp70Count, p.factors, p.genes,
			{ cards: show.banner, factors: show.scenario, totalText: (sc.melop && show.banner) ? p.totalText : null }));
	}
	function productNotes(sc, show, width, refW) {
		const countNote = (show.banner && !sc.effOn) ? stitchDrawCountNoteBar(width, refW) : null;
		const noteBar = stitchDrawSharedNoteBar(width, refW, markInfo(sc, show), { legend: show.legend, conditions: show.conditions }, { adjustNotes: sc.adjustNotes }, [0, 1, 2]);
		return { countNote, noteBar };
	}
	function stackV(list, width) {
		const parts = list.filter(Boolean);
		const c = canvasOf(width, parts.reduce((s, x) => s + x.height, 0) || 1), g = c.getContext('2d');
		g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
		let y = 0;
		parts.forEach((x) => { g.drawImage(x, 0, y); y += x.height; });
		return c;
	}

	/* ---------- 596版の帯（通常・めろっぷ拡張） ----------
	   exam の stitchDrawPersonBanner の写しで、「検出」「sp70緑」のカードの中だけを変えたもの（決定 596・603）。
	   今のカード: ラベルが上・数字がその下（カードの高さ cardH＝幅の 0.185）。
	   596版: ラベルを左・数字を右（右寄せ）に1行で置き、カードの高さを cardH の V2_CARD_K 倍にする。
	   字の大きさ（ラベル cardH×0.28・数字 cardH×0.56）と、因子・遺伝子・合計の字（cardH×0.26。cardH は今の値のまま）は変えない。
	   ラベルと数字は同じベースライン（数字の高さの中心をカードの中心に合わせる。効率を指定の合計の箱と同じ置き方）。
	   カード以外（見出し・合計・因子・遺伝子・下の線）は1文字も変えていない。 */
	const V2_CARD_K = 0.72;   // 0.56（数字の字）× 約1.29。数字の上下に字の高さの 2 割ほどの余白が残る
	function drawPersonBannerV2(width, groupLabel, totalDetected, sp70Count, factors, genes, opts) {
		const withCards = !(opts && opts.cards === false);
		const withFactors = !(opts && opts.factors === false);
		const pad = Math.round(width * 0.03);
		const titleH = Math.round(width * 0.065);
		const cardH = Math.round(width * 0.185);
		const cardBoxH = Math.round(cardH * V2_CARD_K);
		const gapY = Math.round(width * 0.02);
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
		const totalText = (opts && opts.totalText) || null;
		const totalFont = listFont;
		const totalH = totalText ? Math.round(totalFont * 2) : 0;
		const barHeight = pad * 2 + titleH + (withCards ? gapY + cardBoxH : 0)
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
		if (!withCards && !listLineCount && !totalText) return c;
		y += titleH + gapY;

		if (withCards) {
			const cardGap = Math.round(width * 0.03);
			const cardW = (width - pad * 2 - cardGap) / 2;
			const radius = Math.round(width * 0.02);
			const labelFont = Math.round(cardH * 0.28), valueFont = Math.round(cardH * 0.56);
			const base = Math.round(y + cardBoxH / 2 + valueFont * 0.36);
			[
				{ x: pad, label: '検出', value: String(totalDetected), bg: '#f5f8ff', border: '#cfe0fb', lc: '#3c5a99', vc: '#0f3fc9' },
				{ x: pad + cardW + cardGap, label: 'sp70緑', value: String(sp70Count), bg: '#fffaf0', border: '#f5dfae', lc: '#a9720b', vc: '#c96a00' }
			].forEach((d) => {
				stitchRoundRectPath(ctx, d.x, y, cardW, cardBoxH, radius);
				ctx.fillStyle = d.bg; ctx.fill();
				ctx.strokeStyle = d.border; ctx.lineWidth = 2; ctx.stroke();
				ctx.textBaseline = 'alphabetic';
				ctx.textAlign = 'left';
				ctx.fillStyle = d.lc; ctx.font = 'bold ' + labelFont + 'px sans-serif';
				ctx.fillText(d.label, d.x + cardW * 0.08, base);
				ctx.textAlign = 'right';
				ctx.fillStyle = d.vc; ctx.font = 'bold ' + valueFont + 'px sans-serif';
				ctx.fillText(d.value, d.x + cardW * 0.92, base);
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
			});
		}

		let cardsPassed = false;
		if (totalText) {
			if (withCards) y += cardBoxH + gapY;
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
			if (withCards && !cardsPassed) y += cardBoxH + gapY;
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
					ctx.fillStyle = stitchTokenColor(b.moreToken);
					ctx.textAlign = 'right';
					ctx.fillText(moreText, width - pad, y + (row + b.lines.length - 1) * listLineH);
					ctx.textAlign = 'left';
				}
				row += b.lines.length;
			});
		}
		// 比べるための目印（カードの上端と、今の形とで高さが何 px 違うか）
		c._v2 = { cardTop: pad + titleH + gapY, withCards, cardH, cardBoxH };
		return c;
	}
	// 596版の帯（widths は人ごとの幅）。通常・めろっぷ拡張はカードを横並びに、効率を指定は今の帯のまま
	function v2Banners(sc, show, widths, shoes) {
		if (sc.effOn) return productBanners(sc, show, widths, shoes);
		return sc.persons.map((p, k) => drawPersonBannerV2(widths[k], p.label, p.detected, p.sp70Count, p.factors, p.genes,
			{ cards: show.banner, factors: show.scenario, totalText: (sc.melop && show.banner) ? p.totalText : null }));
	}
	// 帯の下端の線（exam の帯が y＝高さ−1 に太さ 2 で引く線）を白で消す。596版の2列のいちばん下の帯にだけ使う
	function eraseBottomRule(c) {
		const g = c.getContext('2d');
		g.fillStyle = '#ffffff';
		g.fillRect(0, c.height - 2, c.width, 2);
		return c;
	}
	/* 596版の補助の帯（2列の3列目）。stitchDrawSharedNoteBar と同じ字の大きさ・行の中身・行の順で、次だけ違う:
	   上の区切り線を引かない（決定 596・606）／数え方の脚注（通常・めろっぷ拡張。検出数カードが ON のとき）を先頭の行に左詰めで置く
	   （3列では帯の行の下に右寄せで置く別の帯）／集計条件の行は描かない（決定 596）。
	   脚注のまとまりと、凡例・印の断りのまとまりの間は、線の代わりに行の高さの半分を空ける。 */
	const V2_NOTE_TOP = 0.6;     // 帯の上の余白（行の高さに対する割合。今の帯は線まで 0.9・線から字まで 0.7）
	const V2_GROUP_GAP = 0.5;    // 脚注と凡例の間（行の高さに対する割合）
	function v2Notes(sc, show, width, refW) {
		const ctx = canvasOf(1, 1).getContext('2d');
		const m = stitchNoteMetrics(ctx, width, refW, STITCH_COUNT_NOTE);
		const maxW = m.maxTextWidth;
		const info = markInfo(sc, show);
		const groups = [];
		// 脚注（通常・めろっぷ拡張は数え方の脚注。効率を指定は2つの脚注で、折り返し方は stitchDrawSharedNoteBar と同じ）
		const head = [];
		if (show.banner && !sc.effOn) stitchWrapText(ctx, STITCH_COUNT_NOTE, maxW).forEach((l) => head.push(stitchNoteTextRow(ctx, l)));
		if (sc.effOn) {
			let lines = stitchWrapText(ctx, EFF_COUNT_NOTE, maxW);
			if (lines.length > 1) { lines = []; EFF_COUNT_NOTE.split('。').filter(Boolean).forEach((s) => stitchWrapText(ctx, s + '。', maxW).forEach((l) => lines.push(l))); }
			lines.concat(effWrapAtPunct(ctx, EFF_STAR_NOTE, maxW)).forEach((l) => head.push(stitchNoteTextRow(ctx, l)));
		}
		if (head.length) groups.push(head);
		// 凡例と、印そのものについての断り
		const tail = [];
		const colors = (show.legend && info.kinds.length) ? attrMarkColors() : null;
		if (colors) {
			buildMarkLegendLines(ctx, info.kinds, maxW, m.fontSize).forEach((segs) => tail.push(segs.map((it) => (it.type === 'mark'
				? { type: 'mark', w: it.w, draw: (c2, cx, cy, d) => drawSkillMark(c2, it.kind, cx, cy, d, colors) } : it))));
			stitchWrapText(ctx, MARK_LEGEND_NOTE, maxW).forEach((l) => tail.push(stitchNoteTextRow(ctx, l)));
		}
		((show.legend || info.effNote) ? info.suppressed : []).slice()
			.sort((a, b) => MARK_SUPPRESSED_ORDER.indexOf(a) - MARK_SUPPRESSED_ORDER.indexOf(b))
			.forEach((r) => { if (MARK_SUPPRESSED_NOTE[r]) stitchWrapText(ctx, MARK_SUPPRESSED_NOTE[r], maxW).forEach((l) => tail.push(stitchNoteTextRow(ctx, l))); });
		if (tail.length) groups.push(tail);
		if (!groups.length) return null;
		const lineH = m.lineH, top = Math.round(lineH * V2_NOTE_TOP), gap = Math.round(lineH * V2_GROUP_GAP);
		const nRows = groups.reduce((s, x) => s + x.length, 0);
		const c = canvasOf(width, top + lineH * nRows + gap * (groups.length - 1) + Math.round(lineH * 0.3));
		const g = c.getContext('2d');
		g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
		g.font = 'bold ' + m.fontSize + 'px sans-serif';
		g.textBaseline = 'top'; g.textAlign = 'left';
		let rowTop = top;
		groups.forEach((rows, gi) => {
			if (gi) rowTop += gap;
			rows.forEach((segs) => {
				const yy = Math.round(rowTop + lineH * 0.15);
				let x = m.pad;
				segs.forEach((it) => {
					if (it.type === 'mark') it.draw(g, x + it.w / 2, yy + m.fontSize * 0.5, m.fontSize * 0.95);
					else { g.fillStyle = STITCH_NOTE_COLOR; g.fillText(it.text, x, yy); }
					x += it.w;
				});
				rowTop += lineH;
			});
		});
		c._fontSize = m.fontSize;
		return c;
	}
	// 596版の2列で、親A などの見出し（＝帯）を出すか（決定 596・605）
	function v2Headings(sc, show) { return sc.effOn || show.banner || show.scenario; }

	/* ---------- 3列（今の形。596版ではカードだけ横並び＝決定 603） ---------- */
	function compose3(sc, show, shoes) {
		const contents = [0, 1, 2].map((k) => personCanvas(sc, k, show.marks, shoes));
		const banners = state.legacyCards ? productBanners(sc, show, contents.map((c) => c.width), shoes) : v2Banners(sc, show, contents.map((c) => c.width), shoes);
		const bannerRow = stitchConcatHorizontallyTopAligned(banners);
		const contentRow = stitchConcatHorizontallyTopAligned(contents);
		const { countNote, noteBar } = productNotes(sc, show, contentRow.width, contents[0].width);
		const W = Math.max(bannerRow.width, contentRow.width, countNote ? countNote.width : 0, noteBar ? noteBar.width : 0);
		const H = bannerRow.height + (countNote ? countNote.height : 0) + contentRow.height + (noteBar ? noteBar.height : 0);
		const out = canvasOf(W, H), g = out.getContext('2d');
		g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
		g.drawImage(bannerRow, 0, 0);
		let y = bannerRow.height;
		if (countNote) { g.drawImage(countNote, 0, y); y += countNote.height; }
		g.drawImage(contentRow, 0, y);
		if (noteBar) g.drawImage(noteBar, 0, y + contentRow.height);
		out._layout = { cols: 3, width: W, height: H, scale: 1, personW: contents[0].width, v2card: banners[0]._v2 || null, fonts: Object.assign(bannerFonts(contents[0].width, contents[0].width, sc), { note: noteFont(contentRow.width, contents[0].width) }) };
		return out;
	}

	/* ---------- (ウ) の1人分の札（縦に並べる向き） ----------
	   今の帯からの変更: 見出しの行の右に「検出」「sp70緑」を小さなカードで並べる（効率を指定の帯と同じ形。カードの段を無くす）／
	   シナリオ因子・遺伝子は区分ごとに「名前：★N」を「／」でつないで折り返す（効率を指定の紫の行と同じ形）／
	   拡張モードの合計は見出しの下の1行の箱／効率を指定の区間まとめ・合計は今の帯の形のまま／字は今の帯より大きく（下の U_*）／
   人と人の間に区切りの線。高さは人ごとに中身の分だけ（3列のように全員でそろえない）。 */
	const U_ = { pad: 0.03, title: 0.085, chipH: 0.105, chipLabel: 0.042, chipValue: 0.075, chipPad: 0.022, chipInner: 0.014, chipGap: 0.016, radius: 0.016,
		headAfter: 0.022, list: 0.056, listLineH: 1.5, listAfter: 0.024, total: 0.056, totalH: 0.1, blockGap: 0.035, panelScale: 1.1 };
	function drawUBlock(width, sc, p, show, shoes) {
		const U = (r) => Math.round(width * r);
		const pad = U(U_.pad);
		const headH = show.banner ? U(U_.chipH) : U(U_.title);
		// 区間まとめ・合計（効率を指定）は今の帯の形を panelScale 倍で使う（EFF_BANNER の比をそのまま掛ける）
		const B = EFF_BANNER, S = U_.panelScale;
		const EU = (r) => Math.round(width * r * S);
		const effPanel = sc.effOn ? effPanelOf(p, shoes) : null;
		const panelCellH = EU(B.panelIcon) + EU(B.cellPad) * 2;
		const panelH = effPanel ? EU(B.panelPad) * 2 + panelCellH * 2 + EU(B.panelGap) : 0;
		const totalBoxH = EU(B.totalRowH) * 2 + EU(B.totalPadV) * 2;
		const effTotal = sc.effOn && p.totalLines;
		const melopTotal = !sc.effOn && sc.melop && show.banner && p.totalText;
		// シナリオ因子・遺伝子（区分ごとに「／」でつないで折り返す）
		const blocks = [];
		if (show.scenario) {
			[[p.factors, STITCH_FACTOR_TEXT_TOKEN, STITCH_FACTOR_MORE_TOKEN], [p.genes, STITCH_GENE_TEXT_TOKEN, STITCH_GENE_MORE_TOKEN]].forEach(([h, t, m]) => {
				if (h && h.items.length) blocks.push({ items: h.items.map((it) => it.text).concat(h.more ? ['他'] : []), more: !!h.more, t, m, lines: [] });
			});
		}
		const mctx = canvasOf(1, 1).getContext('2d');
		let fs = U(U_.list);
		const maxW = width - pad * 2;
		mctx.font = 'bold ' + fs + 'px sans-serif';
		while (fs > 9 && blocks.some((b) => b.items.some((t) => mctx.measureText(t).width > maxW))) { fs--; mctx.font = 'bold ' + fs + 'px sans-serif'; }
		blocks.forEach((b) => { let cur = ''; b.items.forEach((t) => { const cand = cur ? cur + '／' + t : t; if (cur && mctx.measureText(cand).width > maxW) { b.lines.push(cur); cur = t; } else cur = cand; }); if (cur) b.lines.push(cur); });
		const lineCount = blocks.reduce((s, b) => s + b.lines.length, 0);
		const lineH = Math.round(fs * U_.listLineH);
		const H = pad + headH + U(U_.headAfter) + (effPanel ? panelH + U(U_.headAfter) : 0) + (effTotal ? totalBoxH + U(U_.headAfter) : 0)
			+ (melopTotal ? U(U_.totalH) + U(U_.headAfter) : 0) + (lineCount ? lineCount * lineH + U(U_.listAfter) : 0) + U(U_.blockGap) - U(U_.headAfter);
		const c = canvasOf(width, H), g = c.getContext('2d');
		g.fillStyle = '#ffffff'; g.fillRect(0, 0, width, H);
		g.strokeStyle = '#e2e2e2'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, H - 1); g.lineTo(width, H - 1); g.stroke();
		let y = pad;
		const mid = y + headH / 2;
		g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#1a1a1a';
		g.font = 'bold ' + U(U_.title) + 'px sans-serif';
		g.fillText(p.label, pad, mid);
		if (show.banner) {
			const defs = [
				{ label: '検出', value: String(p.detected), bg: '#f5f8ff', border: '#cfe0fb', lc: '#3c5a99', vc: '#0f3fc9' },
				{ label: 'sp70緑', value: String(p.sp70Count), bg: '#fffaf0', border: '#f5dfae', lc: '#a9720b', vc: '#c96a00' }
			].map((d) => { g.font = 'bold ' + U(U_.chipLabel) + 'px sans-serif'; const lw = g.measureText(d.label).width; g.font = 'bold ' + U(U_.chipValue) + 'px sans-serif'; const vw = g.measureText(d.value).width; return Object.assign(d, { lw, w: U(U_.chipPad) * 2 + lw + U(U_.chipInner) + vw }); });
			let x = width - pad;
			for (let i = defs.length - 1; i >= 0; i--) {
				const d = defs[i];
				x -= d.w;
				stitchRoundRectPath(g, x, y, d.w, headH, U(U_.radius));
				g.fillStyle = d.bg; g.fill(); g.strokeStyle = d.border; g.lineWidth = 2; g.stroke();
				g.fillStyle = d.lc; g.font = 'bold ' + U(U_.chipLabel) + 'px sans-serif'; g.fillText(d.label, x + U(U_.chipPad), mid);
				g.fillStyle = d.vc; g.font = 'bold ' + U(U_.chipValue) + 'px sans-serif'; g.fillText(d.value, x + U(U_.chipPad) + d.lw + U(U_.chipInner), mid);
				x -= U(U_.chipGap);
			}
		}
		y += headH + U(U_.headAfter);
		if (effPanel) {
			const pw = width - pad * 2;
			stitchRoundRectPath(g, pad, y, pw, panelH, U(U_.radius) + 2);
			g.fillStyle = stitchTokenColor('--exam-eff-turf-bg'); g.fill();
			g.strokeStyle = stitchTokenColor('--exam-eff-turf-border'); g.lineWidth = 2; g.stroke();
			const tc = stitchTokenColor('--exam-eff-turf-text');
			const cellW = (pw - EU(B.panelPad) * 2 - EU(B.panelGap)) / 2, icon = EU(B.panelIcon), cp = EU(B.cellPad);
			[3, 2, 1, 0].forEach((k, pos) => {
				const cell = effPanel.cells[k];
				const cx = pad + EU(B.panelPad) + (pos % 2) * (cellW + EU(B.panelGap));
				const cy = y + EU(B.panelPad) + Math.floor(pos / 2) * (panelCellH + EU(B.panelGap));
				const m = cy + panelCellH / 2;
				if (cell.img) g.drawImage(cell.img, cx + cp, cy + cp, icon, icon);
				g.fillStyle = tc; g.textBaseline = 'middle'; g.textAlign = 'left';
				const countText = cell.count === null ? '－' : String(cell.count);
				g.font = 'bold ' + EU(B.countFont) + 'px sans-serif';
				const avail = cellW - cp * 3 - icon - g.measureText(countText).width - EU(B.countFont) * 0.5;   // 検出数との間に字の半分を空ける
				let rf = EU(B.rangeFont); g.font = rf + 'px sans-serif';
				while (rf > 6 && g.measureText(cell.range).width > avail) { rf--; g.font = rf + 'px sans-serif'; }
				g.fillText(cell.range, cx + cp * 2 + icon, m);
				g.font = 'bold ' + EU(B.countFont) + 'px sans-serif'; g.textAlign = 'right';
				g.fillText(countText, cx + cellW - cp, m); g.textAlign = 'left';
			});
			y += panelH + U(U_.headAfter);
		}
		if (effTotal) {
			stitchRoundRectPath(g, pad, y, width - pad * 2, totalBoxH, Math.round(totalBoxH * 0.3));
			g.fillStyle = stitchTokenColor('--exam-eff-total-bg'); g.fill();
			g.strokeStyle = stitchTokenColor('--exam-eff-total-border'); g.lineWidth = 2; g.stroke();
			g.fillStyle = stitchTokenColor('--exam-eff-total-text');
			const Lt = effTotalLayout(Math.round(width * S), p.totalLines);   // 今の帯の比を panelScale 倍した幅で測る
			const k = (width - pad * 2 - pad * 2) / Lt.innerW;                   // 実際の箱の中の幅に合わせる
			const lab = Math.max(6, Math.floor(Lt.lab * Math.min(1, k))), num = Math.max(6, Math.floor(Lt.num * Math.min(1, k)));
			g.font = 'bold ' + lab + 'px sans-serif';
			const labelW = Math.max.apply(null, Lt.rows.map((r) => g.measureText(r.label).width));
			const rowH = EU(B.totalRowH);
			g.textBaseline = 'alphabetic';
			Lt.rows.forEach((r, i) => {
				const base = Math.round(y + EU(B.totalPadV) + rowH * (i + 0.5) + num * 0.36);
				g.font = 'bold ' + lab + 'px sans-serif'; g.fillText(r.label, pad * 2, base);
				g.font = 'bold ' + num + 'px sans-serif'; g.fillText(r.value, pad * 2 + labelW + Math.round(lab * B.totalGap), base);
			});
			g.textBaseline = 'middle';
			y += totalBoxH + U(U_.headAfter);
		}
		if (melopTotal) {
			const th = U(U_.totalH);
			stitchRoundRectPath(g, pad, y, width - pad * 2, th, Math.round(th * 0.3));
			g.fillStyle = stitchTokenColor('--exam-eff-total-bg'); g.fill();
			g.strokeStyle = stitchTokenColor('--exam-eff-total-border'); g.lineWidth = 2; g.stroke();
			g.fillStyle = stitchTokenColor('--exam-eff-total-text');
			g.font = 'bold ' + U(U_.total) + 'px sans-serif'; g.textBaseline = 'middle';
			g.fillText(p.totalText, pad + Math.round(U(U_.total) * 0.6), y + th / 2);
			y += th + U(U_.headAfter);
		}
		if (lineCount) {
			g.font = 'bold ' + fs + 'px sans-serif'; g.textBaseline = 'middle';
			let row = 0;
			blocks.forEach((b) => b.lines.forEach((text, i) => {
				const my = y + row * lineH + lineH / 2;
				if (b.more && i === b.lines.length - 1 && (text === '他' || text.endsWith('／他'))) {
					const head = text === '他' ? '' : text.slice(0, -1);
					g.fillStyle = stitchTokenColor(b.t); if (head) g.fillText(head, pad, my);
					g.fillStyle = stitchTokenColor(b.m); g.fillText('他', pad + (head ? g.measureText(head).width : 0), my);
				} else { g.fillStyle = stitchTokenColor(b.t); g.fillText(text, pad, my); }
				row++;
			}));
		}
		c._fonts = { title: U(U_.title), chipValue: show.banner ? U(U_.chipValue) : 0, list: lineCount ? fs : 0 };
		return c;
	}
	/* (ウ) の補助の帯: 行の中身と順は exam の stitchDrawSharedNoteBar と同じ（数え方の脚注を先頭の行に足す）。
	   字の大きさは3列のときと同じ値（人の幅で決まる値）に固定し、幅に入らなければ折り返す（今の帯は脚注の1行が幅に入るまで字を縮めるため、細い列では字が小さくなる） */
	function uNotes(sc, show, width, refW) {
		const ctx = canvasOf(1, 1).getContext('2d');
		const m3 = stitchNoteMetrics(ctx, refW * 3 + GAP * 2, refW, STITCH_COUNT_NOTE);
		const m = { fontSize: m3.fontSize, pad: Math.round(width * 0.03), maxTextWidth: width - Math.round(width * 0.03) * 2, lineH: m3.lineH };
		ctx.font = 'bold ' + m.fontSize + 'px sans-serif';
		const info = markInfo(sc, show);
		const rows = [];
		const push = (text) => effWrapAtPunct(ctx, text, m.maxTextWidth).forEach((l) => rows.push(stitchNoteTextRow(ctx, l)));
		if (show.banner && !sc.effOn) push(STITCH_COUNT_NOTE);
		if (sc.effOn) { push(EFF_COUNT_NOTE); push(EFF_STAR_NOTE); }
		const colors = (show.legend && info.kinds.length) ? attrMarkColors() : null;
		if (colors) {
			buildMarkLegendLines(ctx, info.kinds, m.maxTextWidth, m.fontSize).forEach((segs) => rows.push(segs.map((it) => (it.type === 'mark'
				? { type: 'mark', w: it.w, draw: (c2, cx, cy, d) => drawSkillMark(c2, it.kind, cx, cy, d, colors) } : it))));
			push(MARK_LEGEND_NOTE);
		}
		((show.legend || info.effNote) ? info.suppressed : []).forEach((r) => { if (MARK_SUPPRESSED_NOTE[r]) push(MARK_SUPPRESSED_NOTE[r]); });
		(show.conditions ? sc.adjustNotes : []).forEach(push);
		const bar = stitchDrawNoteBar(width, m, rows);
		if (bar) bar._fontSize = m.fontSize;
		return bar;
	}

	/* ---------- 2列 ---------- */
	function compose2(sc, show, shoes, plan) {
		const contents = [0, 1, 2].map((k) => personCanvas(sc, k, show.marks, shoes));
		const wide = contents.map((c, k) => twoColPerson(sc, k, c, k === 0));
		const W1 = wide[0].width;
		const col3W = W1;
		// 1列目・2列目の部品（(イ) は帯を人の画像の上に重ねて1つの部品にする）
		let col1 = wide[0], gParts = [wide[1], wide[2]];
		let bannerFontsInfo;
		if (plan === 'i') {
			const banners = productBanners(sc, show, wide.map((w) => w.width), shoes);
			col1 = stackV([banners[0], wide[0]], W1);
			gParts = [stackV([banners[1], wide[1]], wide[1].width), stackV([banners[2], wide[2]], wide[2].width)];
		}
		const colH = col1.height;
		const sumGH = gParts.reduce((s, c) => s + c.height, 0);
		const gScale = Math.min(1, colH / sumGH);
		const gs = gParts.map((c) => ({ c, w: Math.max(1, Math.round(c.width * gScale)), h: Math.max(1, Math.round(c.height * gScale)) }));
		if (gScale < 1) gs[gs.length - 1].h = Math.max(1, colH - gs.slice(0, -1).reduce((a, x) => a + x.h, 0));
		const col2W = Math.max.apply(null, gs.map((x) => x.w));
		// 3列目
		let col3Parts;
		if (plan === 'v2') {
			// (ア) の並び。見出しを出さないとき（通常・めろっぷ拡張で検出数カードとシナリオ因子・遺伝子が両方 OFF）は帯ごと出さない
			const banners = v2Headings(sc, show) ? v2Banners(sc, show, [col3W, col3W, col3W], shoes) : [];
			if (banners.length) eraseBottomRule(banners[banners.length - 1]);
			const notes = v2Notes(sc, show, col3W, col3W);
			col3Parts = banners.concat([notes]);
			bannerFontsInfo = Object.assign(bannerFonts(col3W, col3W, sc), { note: notes ? notes._fontSize : 0, headings: banners.length > 0 });
		} else if (plan === 'a') {
			const banners = productBanners(sc, show, [col3W, col3W, col3W], shoes);
			const n = productNotes(sc, show, col3W, col3W);
			col3Parts = banners.concat([n.countNote, n.noteBar]);
			bannerFontsInfo = Object.assign(bannerFonts(col3W, col3W, sc), { note: noteFont(col3W, col3W) });
		} else if (plan === 'i') {
			const n = productNotes(sc, show, col3W, col3W);
			col3Parts = [n.countNote, n.noteBar];
			bannerFontsInfo = Object.assign(bannerFonts(W1, W1, sc, gScale), { note: noteFont(col3W, col3W) });
		} else {
			const blocks = sc.persons.map((p) => drawUBlock(col3W, sc, p, show, shoes));
			col3Parts = blocks.concat([uNotes(sc, show, col3W, contents[0].width)]);
			bannerFontsInfo = { u: blocks.map((b) => b._fonts), note: col3Parts[3] ? col3Parts[3]._fontSize : 0 };
		}
		// 3列目に描くものが1つも無いとき（596版で見出し・脚注・凡例がどれも出ないとき）は、3列目を置かない
		const hasCol3 = col3Parts.some(Boolean);
		const col3 = hasCol3 ? stackV(col3Parts, col3W) : null;
		const W0 = W1 + GAP + col2W + (hasCol3 ? GAP + col3W : 0);
		const H0 = Math.max(colH, col3 ? col3.height : 0);
		const scale = W0 * H0 > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / (W0 * H0)) : 1;
		const out = canvasOf(Math.floor(W0 * scale), Math.floor(H0 * scale));
		const g = out.getContext('2d');
		g.fillStyle = '#ffffff'; g.fillRect(0, 0, out.width, out.height);
		g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
		if (scale !== 1) g.scale(scale, scale);
		g.drawImage(col1, 0, 0);
		let gy = 0;
		gs.forEach((x) => { g.drawImage(x.c, W1 + GAP, gy, x.w, x.h); gy += x.h; });
		if (col3) g.drawImage(col3, W1 + GAP + col2W + GAP, 0);
		out._layout = { cols: 2, plan, width: out.width, height: out.height, scale, logical: { width: W0, height: H0 }, grandScale: gScale, colH, col3H: col3 ? col3.height : 0, col3W: col3 ? col3W : 0, W1, col2W, fonts: bannerFontsInfo };
		return out;
	}

	// 今の帯の字の大きさ（幅 w の帯。exam の stitchDrawPersonBanner / stitchDrawEffPersonBanner の比から。k は帯を縮めて置く割合）
	function bannerFonts(w, refW, sc, k) {
		k = k || 1;
		if (sc.effOn) return { title: Math.round(w * EFF_BANNER.titleFont), cardValue: Math.round(w * EFF_BANNER.cardValueFont), list: Math.round(w * EFF_BANNER.purpleFont), grandK: k };
		const cardH = Math.round(w * 0.185);
		return { title: Math.round(w * 0.065), cardValue: Math.round(cardH * 0.56), list: Math.round(cardH * 0.26), grandK: k };
	}

	// 補助の帯の字の大きさ（exam の stitchNoteMetrics が決める値。幅 width・人の幅 refW）
	function noteFont(width, refW) { return stitchNoteMetrics(canvasOf(1, 1).getContext('2d'), width, refW, STITCH_COUNT_NOTE).fontSize; }

	async function render() {
		const sc = EXAM_MOCK_SCENES[state.mode];
		const show = effective(sc);
		const shoes = await loadShoes();
		return state.cols === 3 ? compose3(sc, show, shoes) : compose2(sc, show, shoes, state.plan);
	}

	/* ---------- 画面 ---------- */
	const $ = (s) => document.querySelector(s);
	function syncUi() {
		document.querySelectorAll('[data-set]').forEach((b) => {
			const [k, v] = b.getAttribute('data-set').split(':');
			b.setAttribute('aria-pressed', String(String(state[k]) === v));
		});
		const eff = state.mode === 'eff';
		document.querySelectorAll('[data-show]').forEach((cb) => { cb.checked = !!state.show[cb.getAttribute('data-show')]; });
		$('[data-marks-label]').textContent = eff ? '蹄鉄（効率の区間）' : '印';
		$('[data-marks-sub]').hidden = eff;
		const legendOff = eff || !state.show.marks;
		const lg = $('[data-show="legend"]');
		lg.disabled = legendOff;
		lg.closest('label').classList.toggle('is-off', legendOff);
		const cd = $('[data-show="conditions"]');
		cd.disabled = eff;
		cd.closest('label').classList.toggle('is-off', eff);
		// 596版の2列では集計条件を描かないので、チェックは隠す（薄くせずに隠す。決定 604）。3列や (ア)(イ)(ウ) に戻すと、元の状態のまま出る
		cd.closest('label').hidden = state.cols === 2 && state.plan === 'v2';
		document.querySelectorAll('[data-set^="plan:"]').forEach((b) => { b.disabled = state.cols !== 2; });
	}
	let seq = 0;
	async function paint() {
		syncUi();
		const my = ++seq;
		const c = await render();
		if (my !== seq) return;
		const img = $('#out');
		img.src = c.toDataURL('image/png');
		img.width = c.width; img.height = c.height;
		$('#size').textContent = c.width + '×' + c.height;
		window.__lastCanvas = c;
	}
	function readParams() {
		const q = new URLSearchParams(location.search);
		if (MODES.includes(q.get('mode'))) state.mode = q.get('mode');
		if (q.get('cols') === '2' || q.get('cols') === '3') state.cols = Number(q.get('cols'));
		if (PLANS.includes(q.get('plan'))) state.plan = q.get('plan');
		(q.get('off') || '').split(',').filter((k) => SHOW_KEYS.includes(k)).forEach((k) => { state.show[k] = false; });
		if (q.get('shot') === '1') document.body.classList.add('is-shot');
	}
	function wire() {
		document.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
			const [k, v] = b.getAttribute('data-set').split(':');
			state[k] = k === 'cols' ? Number(v) : v;
			paint();
		}));
		document.querySelectorAll('[data-show]').forEach((cb) => cb.addEventListener('change', () => { state.show[cb.getAttribute('data-show')] = cb.checked; paint(); }));
	}

	window.__examMock = {
		state, render, paint,
		// 書き出しの道具用: mode の3人の実物の画像（{ img, raw, top } の配列。dataURL か Canvas）を差し込む
		async setImages(mode, list) {
			const load = (v) => (typeof v === 'string' ? new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = v; }) : Promise.resolve(v || null));
			injected[mode] = await Promise.all(list.map(async (x) => ({ img: await load(x.img), raw: await load(x.raw), top: await load(x.top) })));
		},
		set(o) { Object.assign(state, o.state || {}); Object.assign(state.show, o.show || {}); }
	};
	document.addEventListener('DOMContentLoaded', () => { readParams(); wire(); paint(); });
})();
