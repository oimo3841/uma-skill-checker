/**
 * ゲームの「因子一覧」の画面の動画の見分けと、1人分の取り込み・読み取り（T220・段1。決定 924〜933）。
 * special.html（UmaStar）と exam.html（UmaExam）が読む。公開するグローバルは UmaFactorList の1つだけ。
 * js/common.js（凍結）の関数は呼ぶだけ。切り出しの矩形は js/landscape-panel.js の形（cropSource）にそろえる。
 *
 * 流れ（各ページの onVideoChosen）: 先に今の因子画面（継承）の判定で取り込む。失敗したとき・成功しても人が3人に満たないときだけ、
 * ここの importOne が1枚目の画を見分ける（detect）。1人分の因子一覧（list1）なら select1 で取り込み直し、今のセットの親の欄にだけ入れる。
 * 6人分（list6）は段1では取り込まない（今の流れの結果のまま。結合は T221）。当てはまらなければ今の流れの結果のまま。
 *
 * **段1〜3（T220〜T222）がそろうまで、FACTOR_LIST_ENABLED は false。false の間、ページの動きは因子一覧が無いときと同じ。**
 */
(function (global) {
	'use strict';

	const FACTOR_LIST_JS_VERSION = '2026-11-27a';
	// 因子一覧の取り込みのスイッチ（決定 925。true にするのは段3 の公開のとき＝T222）
	const FACTOR_LIST_ENABLED = false;

	/* 見分けと読み取りの寸法。位置は画の幅に対する比（高さの比は端末で変わる）。「画」は小窓（因子一覧の枠）が幅の約 97% を占める画で、
	 * スマホの縦の録画と DMM版の縦の画はそのまま、DMM版の横画面はパネルを切り出した画（js/landscape-panel.js の切り出しと同じ余白）。
	 * d … タイトルの帯（小窓の上端の緑の帯）の上端からの距離 ÷ 画の幅。実測の素材: スマホ 1180x2554・DMM版の縦 970x1726・DMM版の横 2780x1564 */
	const OPT = {
		scaleDown: 4,            // 見分けは画を 1/4 に縮めて読む
		scanH: 0.7,              // 見分けで読むのは画の上からこの割合まで
		titleCover: 0.9,         // タイトルの帯: 緑のある列が幅のこの割合を超える
		titleMaxD: 0.6,          // タイトルの帯の上端は、画の上から幅 × これより上
		bandMinH: 0.017,         // 緑の帯とみなす高さの下限（幅に対する比）
		// 6人分: タイトルのすぐ下の帯が、左右どちらかの半分だけの緑（「1人目」「2人目」のタブ。実測 d=0.094〜0.101・幅 0.45〜0.49）
		tabD: [0.07, 0.14], tabCover: [0.4, 0.56], tabEdge: 0.06,
		// 1人分: 全幅の緑（「所持因子」。実測 d=0.385〜0.389）のあと、左の列だけの緑（固有の札。実測 d=0.52〜0.53）
		headD: [0.35, 0.43], headCover: 0.85, uniqD: [0.49, 0.57], uniqLeft: 0.08, uniqRight: [0.44, 0.54],
		// 1人分を取り込むときの selectFrames の寸法（d）: 本文の帯の上限・「同じ画面か」を見る帯の下端（どちらも「所持因子」の帯より上）と、
		// 本文の帯の決め方で外す短い差の区間（画の高さに対する比）
		selBandTop: 0.33, selTopEnd: 0.36, selHeaderMinRun: 0.15,
		// 横画面の画で小窓の見出しの帯を探す（landscape-panel.js の帯の色と同じ）。切り出しの余白も同じ。高さは下の端か、幅 × cropRatio まで
		bandMinW: 0.18, bandMaxW: 0.6, bandFill: 0.55, bandGap: 0.03, bandRows: 0.04, scanTop: 0.6,
		padX: 0.012, padTop: 0.045, cropRatio: 1.759, outW: 1170,
		// 1人分の札（2列）。x は画の幅の比
		// 札の左端と ● の間の列（札の行を探す）。実測の札の左端は 0.047〜0.049・0.5065〜0.509、● の左端は 0.060〜0.062・0.518〜0.521
		probeX: [0.0545, 0.5143],
		cardX: [0.049, 0.509], cardW: 0.442,
		cardH: [0.04, 0.085],    // 札の高さ（実測 約 0.058）。端で切れた札は下限より低ければ捨てる
		textX: [0.092, 0.552], textW: 0.38, textTop: 0.17, textH: 0.6,   // 名前の切り出し（札の高さに対する比）
		nameX: [0.103, 0.563],   // 名前の左端が測れない列の見込み
		starCx: [0.43, 0.504, 0.578], starHalf: 0.025,   // ★3つの中心（札の幅に対する比）と、見る幅の半分
		starY: [0.8, 1.2],       // ★を見る縦の範囲（札の上端から、札の高さに対する比）
		starFill: 0.12           // 見る矩形の中で金色の画素がこの割合以上なら★
	};

	const V = () => global.UmaVideoFrames;
	const isLandscape = (w, h) => !!global.UmaLandscape && global.UmaLandscape.isLandscapeSize(w, h);

	/* ── 見分け ───────────────────────────── */

	/** img（ImageData の形。画の上のほうだけでよい）を見分ける。戻り値 null か { type: 'list1' | 'list6', titleTop（px）, tab?（1|2）, tabBand? } */
	function classifyFrame(img) {
		const W = img.width, H = img.height;
		if (W < 40 || H < 40) return null;
		const green = greenMaskOf(img);
		const bands = findRuns(rowCountsOf(green, W, H), Math.round(W * 0.12), Math.max(1, Math.round(W / 300)), 0, H)
			.filter((b) => (b.b - b.a) >= W * OPT.bandMinH);
		const info = bands.map((b) => {
			const cc = colCountsOf(green, W, b.a, b.b);
			let l = -1, r = -1, n = 0;
			for (let i = 0; i < W; i++) if (cc[i] > 0) { if (l < 0) l = i; r = i; n++; }
			return { a: b.a, b: b.b, cover: n / W, l: l / W, r: (r + 1) / W };
		});
		const ti = info.findIndex((b) => b.cover > OPT.titleCover && b.a < W * OPT.titleMaxD);
		if (ti < 0) return null;
		const title = info[ti], b1 = info[ti + 1], b2 = info[ti + 2];
		const inD = (b, range) => { const d = (b.a - title.a) / W; return d >= range[0] && d <= range[1]; };
		const within = (v, range) => v >= range[0] && v <= range[1];
		if (b1 && inD(b1, OPT.tabD) && within(b1.cover, OPT.tabCover) && (b1.l < OPT.tabEdge || b1.r > 1 - OPT.tabEdge)) {
			return { type: 'list6', titleTop: title.a, tab: b1.l < OPT.tabEdge ? 1 : 2, tabBand: [b1.a, b1.b] };
		}
		if (b1 && b2 && b1.cover > OPT.headCover && inD(b1, OPT.headD) && inD(b2, OPT.uniqD)
			&& b2.l < OPT.uniqLeft && within(b2.r, OPT.uniqRight)) {
			return { type: 'list1', titleTop: title.a };
		}
		return null;
	}

	const isTitleGreen = (r, g, b) => g >= 150 && b <= 70 && g - r >= 35 && g - b >= 110;

	/** 横長の画（ImageData の形）の中の、小窓の見出しの帯の候補 { x, y, w }（全部）。landscape-panel.js の findPanel は最初の1つだけを返すので、ここで全部拾う */
	function findTitleBands(img) {
		const W = img.width, H = img.height, d = img.data;
		const gapMax = Math.max(2, Math.round(W * OPT.bandGap)), step = 2;
		const yEnd = Math.round(H * OPT.scanTop);
		const open = [], done = [];
		const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
		const close = (g) => {
			const x0 = median(g.rows.map((r) => r.x0)), x1 = median(g.rows.map((r) => r.x1)), w = x1 - x0 + 1;
			if (g.rows.length >= w * OPT.bandRows) done.push({ x: x0, y: g.rows[0].y, w });
		};
		for (let y = 0; y < yEnd; y++) {
			const runs = [];
			let cur = null;
			for (let x = 0; x < W; x += step) {
				const p = (y * W + x) * 4;
				if (!isTitleGreen(d[p], d[p + 1], d[p + 2])) continue;
				if (cur && x - cur.x1 <= gapMax) { cur.x1 = x; cur.n++; }
				else { if (cur) runs.push(cur); cur = { x0: x, x1: x, n: 1 }; }
			}
			if (cur) runs.push(cur);
			const rows = runs.filter((r) => {
				const span = r.x1 - r.x0 + step;
				return span >= W * OPT.bandMinW && span <= W * OPT.bandMaxW && r.n * step >= span * OPT.bandFill;
			}).map((r) => ({ y, x0: r.x0, x1: r.x1 + step - 1 }));
			for (let i = open.length - 1; i >= 0; i--) {
				const g = open[i], last = g.rows[g.rows.length - 1];
				const k = rows.findIndex((r) => r.x0 <= last.x1 && r.x1 >= last.x0);
				if (k < 0) { close(g); open.splice(i, 1); }
				else g.rows.push(rows.splice(k, 1)[0]);
			}
			for (const r of rows) open.push({ rows: [r] });
		}
		open.forEach(close);
		return done.sort((p, q) => p.x - q.x || p.y - q.y);
	}

	// 帯の候補 → 切り出しの矩形（landscape-panel.js の cropSource の形）
	function rectOfBand(b, W, H) {
		const x = Math.max(0, b.x - Math.round(b.w * OPT.padX)), y = Math.max(0, b.y - Math.round(b.w * OPT.padTop));
		const w = Math.min(W, b.x + b.w + Math.round(b.w * OPT.padX)) - x;
		const h = Math.min(H, y + Math.round(b.w * OPT.cropRatio)) - y;
		const scale = OPT.outW / w;
		return { ok: true, x, y, w, h, scale, outW: OPT.outW, outH: Math.round(h * scale) };
	}

	/**
	 * 出どころ（UmaVideoFrames の source）の時刻 o.at（既定 0）の画を見分ける。
	 * 戻り値 null か { type, rect, titleTop, tab?, tabBand? }。
	 *  rect … 横長の画（切り出していない出どころ）で見つけたときの切り出しの矩形。縦長の画（切り出し済みを含む）は null。
	 *  titleTop・tabBand … sourceFor(source, 戻り値) の出どころの画の px。
	 * 横長の画に1人分（左の小窓）と6人分（右の一覧）の両方があれば、1人分を返す（決定 931: 手前で操作している小窓の側だけを取り込み、
	 * 後ろでぼかされて止まっている右の一覧は無視する）。
	 */
	async function detect(source, o) {
		const signal = (o && o.signal) || null, at = (o && o.at) || 0;
		const W = source.width, H = source.height, k = OPT.scaleDown;
		const full = document.createElement('canvas'), small = document.createElement('canvas');
		const sx = small.getContext('2d', { willReadFrequently: true });
		const classifySmall = () => classifyFrame(sx.getImageData(0, 0, small.width, Math.max(1, Math.round(small.height * OPT.scanH))));
		const scaled = (r, f) => {
			const out = Object.assign({}, r, { titleTop: r.titleTop * f });
			if (r.tabBand) out.tabBand = r.tabBand.map((v) => v * f);
			return out;
		};
		try {
			if (!isLandscape(W, H)) {
				small.width = Math.round(W / k); small.height = Math.round(H / k);
				await V().untilAbort(source.drawAt(at, sx, small.width, small.height, signal), signal);
				const r = classifySmall();
				return r ? Object.assign(scaled(r, W / small.width), { rect: null }) : null;
			}
			full.width = W; full.height = H;
			const fx = full.getContext('2d', { willReadFrequently: true });
			await V().untilAbort(source.drawAt(at, fx, W, H, signal), signal);
			const found = [];
			for (const band of findTitleBands(fx.getImageData(0, 0, W, H))) {
				const rect = rectOfBand(band, W, H);
				small.width = Math.round(rect.outW / k); small.height = Math.round(rect.outH / k);
				sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';
				sx.drawImage(full, rect.x, rect.y, rect.w, rect.h, 0, 0, small.width, small.height);
				const r = classifySmall();
				if (r) found.push(Object.assign(scaled(r, rect.outW / small.width), { rect }));
			}
			return found.find((r) => r.type === 'list1') || found[0] || null;
		} finally { full.width = full.height = 0; small.width = small.height = 0; }
	}

	/** detect の戻り値に合う出どころ（rect があれば切り出した出どころ。閉じると元の出どころも閉じる） */
	function sourceFor(source, found) {
		if (!found || !found.rect) return source;
		const out = global.UmaLandscape.cropSource(source, found.rect);
		out.landscape = { from: { w: source.width, h: source.height }, rect: { x: found.rect.x, y: found.rect.y, w: found.rect.w, h: found.rect.h }, out: { w: found.rect.outW, h: found.rect.outH } };
		if (source.fallback) out.fallback = source.fallback;
		if (source.codec) out.codec = source.codec;
		return out;
	}

	/** 1人分の因子一覧を selectFrames に渡すときの寸法の引数（source は sourceFor の戻り値） */
	function selectOptions(source, found) {
		const at = (d) => (found.titleTop + source.width * d) / source.height;
		return { bandTop: at(OPT.selBandTop), topBandEnd: at(OPT.selTopEnd), headerMinRun: OPT.selHeaderMinRun };
	}

	/**
	 * 1人分の因子一覧の画を選ぶ。戻り値は selectFrames と同じ形（persons は1人）。人が1人にならなければ code 'persons' の例外。
	 * selOpts … ページが selectFrames に渡すもの（labels の先頭が親）
	 */
	async function select1(source, found, selOpts) {
		const sel = await V().selectFrames(source, Object.assign({}, selOpts, selectOptions(source, found)));
		const persons = sel.persons.slice();
		// 1枚しか写っていない後ろの区切りは外す（ページの videoPersonsToKeep と同じ考え方）
		while (persons.length > 1 && persons[persons.length - 1].files.length <= 1) persons.pop();
		if (persons.length !== 1) {
			const e = new Error('因子一覧（1人分）で人の区切りが ' + sel.persons.length + ' になった');
			e.code = 'persons'; e.found = sel.persons.length; throw e;
		}
		sel.persons = persons;
		return sel;
	}

	/**
	 * ページの取り込みから呼ぶ入口: 出どころを見分けて、1人分の因子一覧なら取り込み直す。
	 * 戻り値 { sel（persons は1人）, source, range: { top, bottom }（本文の帯。画の高さに対する比） } か null（1人分の因子一覧でない・見分けられない画）。
	 * o: { signal, ratioFloor（今の流れが進んだ割合。進み具合が戻らないように、ここからの割合に詰める）, log(文) }
	 * 見分けたあとの選びの失敗は例外のまま返す（その動画の失敗の文になる）
	 */
	async function importOne(source, selOpts, o) {
		const signal = (o && o.signal) || null, log = (o && o.log) || (() => {});
		const t0 = performance.now();
		let found = null;
		try { found = await V().untilAbort(detect(source, { signal }), signal); }
		catch (e) { if (V().isAbortError(e)) throw e; log('[因子一覧] 見分けられませんでした: ' + (e && e.message)); return null; }
		log('[因子一覧] 見分け: ' + (found ? found.type : '当てはまらない') + '（' + Math.round(performance.now() - t0) + 'ms）');
		if (!found || found.type !== 'list1') return null;
		const src = sourceFor(source, found);
		const opts = Object.assign({}, selOpts);
		const floor = Math.max(0, Math.min(0.9, (o && o.ratioFloor) || 0));
		if (selOpts.onProgress) opts.onProgress = (p) => selOpts.onProgress(Object.assign({}, p, { ratio: floor + (1 - floor) * (p.ratio || 0) }));
		const sel = await V().untilAbort(select1(src, found, opts), signal);
		const H = sel.video.H;
		return { sel, source: src, range: { top: sel.header.headerEnd / H, bottom: sel.header.footer / H } };
	}

	/* ── 読み取り（1人分・2列。★は名前の下） ─────────────────────────────
	 * common.js の detectSkillRows は、1枚目の画で名前と★の帯がつながって「★の帯」として外れる行があるので（T218）、
	 * 札の地の色で行を切り出す。青・赤・固有の緑の札は今までどおり別に読む（readGreenFactor・いちばん上の段の読み取り）ので、灰色の札だけを返す。
	 * 戻り値の形は detectSkillRows と同じ（rows・columns・listTop・bands・columnXs）。rows の y・h は名前の帯で、中心が名前の中心になる
	 * （結合画像の枠・印は行の中心と columnXs＝名前の左端から置き場所を決める）。 */
	/** range … 一覧の本文の帯（画の高さに対する比 { top, bottom }）。札が無ければ null */
	function detectRows(base, diag, range) {
		const W = base.width, H = base.height, ctx = base.getContext('2d', { willReadFrequently: true });
		const y0 = Math.max(0, Math.round(H * ((range && range.top) || 0)));
		const y1 = Math.min(H, Math.round(H * ((range && range.bottom) || 1)));
		if (y1 - y0 < 10) return null;
		const cards = [];
		OPT.probeX.forEach((xf, col) => {
			const d = ctx.getImageData(Math.round(W * xf), y0, 1, y1 - y0).data;
			let a = -1, colored = 0, n = 0;
			for (let i = 0; i <= y1 - y0; i++) {
				let isColor = false, isGray = false;
				if (i < y1 - y0) {
					const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
					isColor = max - min > 50;
					isGray = !isColor && max <= 232 && min >= 180;
				}
				if (isColor || isGray) { if (a < 0) a = i; n++; if (isColor) colored++; continue; }
				if (a >= 0) {
					const h = i - a;
					if (h >= W * OPT.cardH[0] && h <= W * OPT.cardH[1] && colored < n / 2) cards.push({ col, a: y0 + a, b: y0 + i - 1 });
					a = -1; colored = 0; n = 0;
				}
			}
		});
		if (!cards.length) { if (diag) diag.push('[因子一覧] 灰色の札が見つからない'); return null; }
		// 札の高さの中央値。端で切れた札は、切れていない側から高さをそろえて、名前の所が本文の帯に入らなければ捨てる
		const hs = cards.map((c) => c.b - c.a + 1).sort((p, q) => p - q), medH = hs[hs.length >> 1];
		const fixed = [];
		cards.forEach((c) => {
			let a = c.a;
			if (c.b - c.a + 1 < medH * 0.95 && c.a <= y0 + 1) a = c.b - medH + 1;
			const ty = a + Math.round(medH * OPT.textTop), th = Math.round(medH * OPT.textH);
			if (ty < y0 || ty + th > y1) return;
			fixed.push({ col: c.col, a, h: medH, ty, th });
		});
		if (!fixed.length) return null;
		fixed.sort((p, q) => (Math.abs(p.a - q.a) < medH / 2 ? p.col - q.col : p.a - q.a));
		const rows = [], bands = [], lefts = [[], []];
		let bandA = -Infinity;
		fixed.forEach((p) => {
			if (Math.abs(p.a - bandA) >= medH / 2) { bandA = p.a; bands.push({ a: p.ty, b: p.ty + p.th - 1 }); }
			const x = Math.round(W * OPT.textX[p.col]), w = Math.round(W * OPT.textW);
			rows.push({ x, y: p.ty, w, h: p.th, col: p.col, band: bands.length - 1, card: { a: p.a, h: p.h } });
			const left = nameLeft(ctx, x, p.ty, Math.round(w * 0.4), p.th);
			if (left != null) lefts[p.col].push(left);
		});
		const columnXs = lefts.map((list, col) => {
			if (!list.length) return Math.round(W * OPT.nameX[col]);
			list.sort((p, q) => p - q);
			return list[list.length >> 1];
		});
		if (diag) diag.push('[因子一覧] 灰色の札 ' + rows.length + '枚（名前の左端 x=' + columnXs.join(', ') + '）');
		return { rows, columns: 2, listTop: y0, bands, columnXs };
	}
	// 名前の左端（暗い画素が2つ以上ある最初の列）。無ければ null
	function nameLeft(ctx, x, y, w, h) {
		if (w < 1 || h < 1) return null;
		const d = ctx.getImageData(x, y, w, h).data;
		for (let i = 0; i < w; i++) {
			let n = 0;
			for (let j = 0; j < h; j++) {
				const p = (j * w + i) * 4;
				if (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114 < DARK_LEVEL) n++;
			}
			if (n >= 2) return x + i;
		}
		return null;
	}

	/** detectRows の行の★の数（ページの computeRowStarCounts… と同じ形 [{ stars, reliable }]）。★の置き場所3つの金色を左から数える */
	function rowStars(base, detection, range) {
		const W = base.width, H = base.height;
		const gold = goldMaskOf(getPixels(base));
		const y1Max = Math.min(H, Math.round(H * ((range && range.bottom) || 1)));
		return detection.rows.map((r) => {
			const c = r.card, cardX = W * OPT.cardX[r.col], cardW = W * OPT.cardW;
			const y0 = Math.max(0, Math.round(c.a + c.h * OPT.starY[0])), y1 = Math.min(y1Max, Math.round(c.a + c.h * OPT.starY[1]));
			let stars = 0;
			for (let s = 0; s < 3; s++) {
				const x0 = Math.max(0, Math.round(cardX + cardW * (OPT.starCx[s] - OPT.starHalf)));
				const x1 = Math.min(W, Math.round(cardX + cardW * (OPT.starCx[s] + OPT.starHalf)));
				let n = 0, tot = 0;
				for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { tot++; if (gold[y * W + x]) n++; }
				if (!tot || n < tot * OPT.starFill) break;
				stars++;
			}
			// ★の下の端まで本文の帯に写っていない行は、数を当てにしない
			return { stars, reliable: c.a + c.h * OPT.starY[1] <= y1Max };
		});
	}

	global.UmaFactorList = Object.freeze({
		VERSION: FACTOR_LIST_JS_VERSION,
		ENABLED: FACTOR_LIST_ENABLED,
		OPT: Object.freeze(Object.assign({}, OPT)),
		classifyFrame,
		findTitleBands,
		detect,
		sourceFor,
		selectOptions,
		select1,
		importOne,
		detectRows,
		rowStars
	});
})(typeof window !== 'undefined' ? window : globalThis);
