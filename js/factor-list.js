/**
 * ゲームの「因子一覧」の画面の動画の見分け・取り込み（1人分は T220・段1、6人分の結合は T221・段2。決定 924〜937）と、
 * 読み取りの行の切り出し・★（1人分は T220、6人分は T222・段3。決定 938〜940）。
 * special.html（UmaStar）と exam.html（UmaExam）が読む。公開するグローバルは UmaFactorList の1つだけ。
 * js/common.js（凍結）の関数は呼ぶだけ。切り出しの矩形は js/landscape-panel.js の形（cropSource）にそろえる。
 *
 * 流れ（各ページの onVideoChosen）: 先に今の因子画面（継承）の判定で取り込む。失敗したとき・成功しても人が3人に満たないとき、
 * 横画面の切り出し（UmaLandscape.wrapSource）が失敗したときだけ、ここの importOne が1枚目の画を見分ける（detect）。
 *  - 1人分（list1）: select1 で取り込み直し、今のセットの親の欄に入れて、祖1・祖2 の欄は空にする（決定 935）。
 *  - 6人分（list6）: import6 がタブごとに札をつなぐ。1人目のタブは親Aセット、2人目のタブは親Bセット。取り込むセットは3つの欄を空にしてから、
 *    取れた人だけを入れる（決定 936）。写っていないタブのセットは変えない。人の画の結合は composeList6。
 * 当てはまらなければ今の流れの結果のまま。ウィンドウの取り込み（js/pc-capture.js）は findListRect で横画面の因子一覧を切り出す（決定 937）。
 *
 * **FACTOR_LIST_ENABLED は false（T223 でスイッチを true にする）。false の間、ページの動きは因子一覧が無いときと同じ。**
 * ただし、URL に印（?factorlist=1）を付けて開いたページは、その読み込み中だけ true と同じに動く（隠しの入口。決定 939。保存はしない）。
 */
(function (global) {
	'use strict';

	const FACTOR_LIST_JS_VERSION = '2026-11-27c';
	// 因子一覧の取り込みのスイッチ（決定 925。T223 でスイッチを true にする）
	const FACTOR_LIST_ENABLED = false;
	// 隠しの入口（決定 939。公開の前においもさんが自分の PC で試す）: URL の ?factorlist=1 は、読み込んだ時点の1回だけ見る
	const FACTOR_LIST_TRIAL = (() => {
		try { return new URLSearchParams(global.location.search).get('factorlist') === '1'; } catch (e) { return false; }
	})();

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
	 * ページの取り込みから呼ぶ入口: 出どころを見分けて、因子一覧なら取り込み直す。
	 * 戻り値は、1人分なら { type: 'list1', sel（persons は1人）, source, range: { top, bottom }（本文の帯。画の高さに対する比） }、
	 * 6人分なら import6 の戻り値 { type: 'list6', sets }。因子一覧でない・見分けられない画は null。
	 * o: { signal, ratioFloor（今の流れが進んだ割合。進み具合が戻らないように、ここからの割合に詰める）, log(文) }
	 * 見分けたあとの選び・結合の失敗は例外のまま返す（その動画の失敗の文になる）
	 */
	async function importOne(source, selOpts, o) {
		const signal = (o && o.signal) || null, log = (o && o.log) || (() => {});
		const t0 = performance.now();
		let found = null;
		try { found = await V().untilAbort(detect(source, { signal }), signal); }
		catch (e) { if (V().isAbortError(e)) throw e; log('[因子一覧] 見分けられませんでした: ' + (e && e.message)); return null; }
		log('[因子一覧] 見分け: ' + (found ? found.type : '当てはまらない') + '（' + Math.round(performance.now() - t0) + 'ms）');
		if (!found) return null;
		if (found.type === 'list6') {
			// ウィンドウの取り込みの出どころは、動かない部分（タブの帯も）を1枚の画で塗り直している（pc-capture の steadySource）。タブを読むので塗り直す前を使う
			const base = source.unsteadied || source;
			return import6(sourceFor(base, found), found, { signal, onProgress: selOpts.onProgress, ratioFloor: o && o.ratioFloor, log });
		}
		const src = sourceFor(source, found);
		const opts = Object.assign({}, selOpts);
		const floor = Math.max(0, Math.min(0.9, (o && o.ratioFloor) || 0));
		if (selOpts.onProgress) opts.onProgress = (p) => selOpts.onProgress(Object.assign({}, p, { ratio: floor + (1 - floor) * (p.ratio || 0) }));
		const sel = await V().untilAbort(select1(src, found, opts), signal);
		const H = sel.video.H;
		return { type: 'list1', sel, source: src, range: { top: sel.header.headerEnd / H, bottom: sel.header.footer / H } };
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

	/* ── 6人分（T221・段2） ─────────────────────────────
	 * 1列の因子一覧は同じ高さの札が続き、画素のずれで合わせる selectFrames は同じ行を重ねてしまう（T218）。そこで札の中身の順でつなぐ。
	 *  1. 一定の間隔（0.25秒）でコマを読み、タブの帯の緑が左（1人目）か右（2人目）かで分ける。タブごとにいちばん長く続いた区間を使う。
	 *  2. 区間の中のコマから札を切り出して小さな画（中身の控え）を作り、今までの並びのどこに当たるかを決めて足していく。
	 *     当たらないコマは、間の時刻を読み直す。それでも当たらず、直後のコマと中身が合えば、重なりの無い飛び（速すぎるスクロール）として後ろに足し、
	 *     飛びの前の人に「確かでない」の印を付ける（ページの人の単位の警告に載る）。
	 *  3. 青い札で人を分ける（順に 親・祖1・祖2）。札ごとに、ほかの控えといちばん違わないコマ（タッチのエフェクトやカーソルが写っていない見込み）を使い、
	 *     等倍で読み直して並べる。青い札の左の顔は、人の画の左上に置く（今の因子画面と同じく、結合画像の人の見出しの顔の欄はここから切り出される）。
	 *  4. 人の画は高さ 3,000px 以下の画（File）に、札の境目で分ける（段3 の読み取りが分けずに渡せる）。結合はそれを縦に積んで縮めるだけ（composeList6）。
	 * 位置は「画の幅に対する比」。画は sourceFor の出どころ（小窓が幅の約 97%）。 */
	const OPT6 = Object.freeze({
		step: 0.25,              // コマを読む間隔（秒）
		scale: 0.5,              // 札を探すコマの縮め方（並べる画は等倍で読み直す）
		titleRow: 0.012,         // タイトルの帯の上端から、この高さの行が緑なら因子一覧
		titleCover: 0.6,
		tabRow: 0.2,             // タブの帯の上から、帯の高さのこの割合の行を読む（字より上）
		tabLeft: [0.06, 0.46], tabRight: [0.54, 0.94], tabOn: 0.6, tabOff: 0.2,
		minSegment: 2,           // タブの区間とみなすコマの数の下限
		listTop: 0.008,          // 一覧の上端: タブの帯の下端 + 幅 × この値
		listBottom: 1.66,        // 一覧の下端の上限: タイトルの帯の上端 + 幅 × この値
		listGreyX: 0.12,         // 一覧の本当の上端・下端: この列（顔の欄の中）の地の灰色の最初と最後の行（外は枠の外の背景で、写すと札の間に線が出る）
		edgeX: [0.19, 0.25],     // 札の左端を探す列の範囲（実測 0.214・DMM版の横 0.222）
		probeIn: 0.006,          // 札の左端から、札の行を読む列までの距離（札の縁の線より内側・● の左端〔札の左端から 約 0.011〕より手前）
		runHole: 0.004,          // 札の行の中で、札の色でない画素がこの長さ（幅に対する比）まで続いても同じ札（圧縮の粗い画の穴。札の間は 約 0.02）
		cardH: [0.065, 0.11],    // 札の高さ（実測 0.0855〜0.089）
		cardTol: 0.09,           // 高さが中央値からこの割合より離れた札は、一覧の端で切れた札として使わない（色の札は縁がにじんで灰色の札より 3px ほど低く読むことがある）
		sigX: [0.25, 0.925], sigY: [0.12, 0.88], sigW: 200, sigH: 16,   // 札の中身の控え（名前・★・ⓘ の所の小さな灰色の画）
		diffLevel: 32,           // 控えの違い: 上下1行のずれを許しても明るさがこれより違う画素の割合（%）
		lookClip: 60,            // 写すコマを選ぶときは同じ大きさの色の画で比べる。画素ごとの違いの頭打ち（淡いエフェクトは明るさだけでは分からない）
		lookNear: 0.25,          // 読み直すコマをまとめるとき、いちばん違わない控えとの差がこれ以内（違いの平均）の控えは同じくらいとみなす
		/* 同じ並びとみなす、重なる札の違いの平均の上限。重なりが少ないほど厳しい。実測（素材3本の6人分）: 正しい位置は、コマの平均が 0.7 以下・
		 * 札1枚では 99.9% が 2.1 以下（最大 2.3）。誤った位置の平均の最小は、重なり3枚で 1.1・4〜5枚で 1.5・6枚以上で 1.7。緩いと、重なりの無い飛びを
		 * 違う位置に当てて、人が丸ごと抜ける（T221 の取り込みの検査で1回出た） */
		matchMax: [[3, 0.9], [5, 1.2], [Infinity, 1.4]],   // [重なりの枚数の上限, 平均の上限]
		cardMax: 4,              // 重なる札の違いがこれを超える札は合わない札
		offMin: 6, offMax: 1.1,  // この枚数以上重なれば合わない札を1枚だけ見逃す（カーソルやエフェクトが載った札）。そのときの残りの平均の上限
		minOverlap: 3,           // つなぐのに要る重なりの札の数
		holeStep: 1.8,           // コマの中で隣の札との間がこの倍（札の間隔の中央値）より空けば、間の札を読み落としている（人の区切りは 約1.5倍）
		frameCards: 0.6,         // 使える札の数が、区間のコマの中央値のこの割合に満たないコマは並びに使わない（ウィンドウの取り込みの出だしの粗い画は札を読み落とす）
		extraBelow: 3,           // 控えがこの数に満たない札は、間の時刻を読み足す
		dense: 0.05,             // 当たらないコマがあれば、並びが最後に当たった時刻からこの間隔で読み直す
		lookAhead: 0.5,          // 読み直すのは当たらないコマのこの秒あとまで（ウィンドウの取り込みの圧縮の粗いコマは 0.5秒ほど続くことがある）
		confirmGap: 0.2,         // 飛びかを確かめる少し後のコマまでの秒（圧縮の粗いコマは短く続くので、離して見る）
		peekLine: 0.85,          // 最後の人の青い札が、タイトルの帯の上端 + 幅 × この値より上に来たことが無ければ「次の人の頭が見えただけ」
		// 札の下のこの範囲が一覧の地の灰色なら、その人の一覧はそこで終わり。実測（素材3本の一覧の終わり）: 灰色は札の下端 + 幅 × 0.029〜0.033 から
		// 0.099〜0.105 まで（その下は「閉じる」の白い欄）。T222 の前は [0.045, 0.12] で、本物の録画では終わりに当たらなかった
		endGrey: [0.04, 0.09],
		cropX: [0.025, 0.945],   // 人の画の左右（顔の欄と札）
		sliceX: [0.2, 0.935],    // 札を写す左右
		faceX: [0.025, 0.19], faceUp: 0.048, faceDown: 0.115,   // 青い札の左の顔（札の上端から）
		outW: 880, outHMax: 4800,   // 結合に使う人の画の幅と高さの上限（超えるときは縮める。UmaExam の3列は縮めないと iPhone の画素数の上限を超える）
		chunkH: 3000             // 分けた画1枚の高さの上限
	});

	const abortCheck = (signal) => { if (signal && signal.aborted) throw new DOMException('取り消しました', 'AbortError'); };
	const listError = (code, msg) => { const e = new Error(msg); e.code = code; return e; };
	const isTabGreen = (r, g, b) => g > 150 && g > r + 20 && g > b + 60;

	// 札の地の色の種類（札でなければ null）。青・赤（ピンク）・緑・そのほかの色・灰色
	function cardPixel(r, g, b) {
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		if (max - min > 50) return b > 200 && r < 120 ? 'blue' : r > 200 && b > 120 && g < 180 ? 'pink' : g > r && g > b ? 'green' : 'other';
		return max <= 232 && min >= 180 ? 'gray' : null;
	}

	/** ctx（幅 W の画を描いた 2d）の一覧（top〜bottom px）の札。上から [{ a, b, kind, x }]（x は読んだ列） */
	function scanCards(ctx, W, top, bottom) {
		const x0 = Math.round(W * OPT6.edgeX[0]), n = Math.max(1, Math.round(W * OPT6.edgeX[1]) - x0), h = bottom - top;
		if (h < 2) return [];
		const d = ctx.getImageData(x0, top, n, h).data;
		const minH = W * OPT6.cardH[0], maxH = W * OPT6.cardH[1];
		const hole = Math.max(1, Math.round(W * OPT6.runHole));
		const column = (c) => {   // 列 c の、札の高さの色の続き
			const out = [];
			let a = -1, last = -1, kinds = null;
			for (let y = 0; y <= h + hole; y++) {
				const p = (y * n + c) * 4;
				const k = y < h ? cardPixel(d[p], d[p + 1], d[p + 2]) : null;
				if (k) { if (a < 0) { a = y; kinds = {}; } kinds[k] = (kinds[k] || 0) + 1; last = y; continue; }
				if (a < 0 || y - last <= hole) continue;
				const len = last - a + 1;
				if (len >= minH && len <= maxH) out.push({ a: top + a, b: top + last, kind: Object.keys(kinds).sort((p1, q) => kinds[q] - kinds[p1])[0] });
				a = -1;
			}
			return out;
		};
		let edge = -1;
		for (let c = 0; c < n; c++) if (column(c).length >= 2) { edge = c; break; }
		if (edge < 0) return [];
		const probe = Math.min(n - 1, edge + Math.max(2, Math.round(W * OPT6.probeIn)));
		return column(probe).map((r) => Object.assign(r, { x: x0 + probe }));
	}

	const isListGrey = (r, g, b) => Math.min(r, g, b) >= 234 && Math.max(r, g, b) <= 246 && Math.max(r, g, b) - Math.min(r, g, b) <= 4;
	// ctx の列 x の top〜bottom で、一覧の地の灰色の最初と最後の行 [上, 下]。無ければ null
	function listExtent(ctx, x, top, bottom) {
		if (bottom - top < 2) return null;
		const d = ctx.getImageData(x, top, 1, bottom - top).data;
		let a = -1, b = -1;
		for (let y = 0; y < bottom - top; y++) if (isListGrey(d[y * 4], d[y * 4 + 1], d[y * 4 + 2])) { if (a < 0) a = y; b = y; }
		return a < 0 || b - a < (bottom - top) / 2 ? null : [top + a, top + b];   // 範囲の半分に満たなければ、読めていない
	}
	// 札の右端: 札の中ほどの行を、写す範囲の右端から左へ見て、白でない最初の列。無ければ null
	function cardRight(ctx, W, card) {
		const x0 = Math.round(W * 0.8), x1 = Math.round(W * OPT6.sliceX[1]);
		const d = ctx.getImageData(x0, Math.round((card.a + card.b) / 2), x1 - x0, 1).data;
		for (let i = x1 - x0 - 1; i >= 0; i--) if (Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) < 244) return x0 + i + 1;
		return null;
	}

	// 画の一部を小さな灰色の画にする（中身の控え）
	function grayThumb(work, src, x, y, w, h, tw, th) {
		work.canvas.width = tw; work.canvas.height = th;
		work.drawImage(src, x, y, w, h, 0, 0, tw, th);
		const d = work.getImageData(0, 0, tw, th).data, out = new Uint8Array(tw * th);
		for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
		return out;
	}
	// 2つの控え（幅 tw）の違い（%）。縮めたコマの札の上端は ±1px ずれるので、上下1行のうち近いほうと比べる
	function thumbDiff(a, b, tw) {
		const n = a.length, w = tw || OPT6.sigW, level = OPT6.diffLevel;
		let bad = 0;
		for (let i = 0; i < n; i++) {
			const v = a[i];
			if (Math.abs(v - b[i]) <= level) continue;
			if (i >= w && Math.abs(v - b[i - w]) <= level) continue;
			if (i + w < n && Math.abs(v - b[i + w]) <= level) continue;
			bad++;
		}
		return 100 * bad / n;
	}
	// 札の中身の控え: sig は灰色の画（並びをつなぐ）、look は同じ画の色（RGB を並べたもの。写すコマを選ぶ）
	function cardSample(work, canvas, W, card) {
		const h = card.b - card.a + 1, tw = OPT6.sigW, th = OPT6.sigH;
		work.canvas.width = tw; work.canvas.height = th;
		work.drawImage(canvas, Math.round(W * OPT6.sigX[0]), card.a + Math.round(h * OPT6.sigY[0]),
			Math.round(W * (OPT6.sigX[1] - OPT6.sigX[0])), Math.max(1, Math.round(h * (OPT6.sigY[1] - OPT6.sigY[0]))), 0, 0, tw, th);
		const d = work.getImageData(0, 0, tw, th).data, sig = new Uint8Array(tw * th), look = new Uint8Array(tw * th * 3);
		for (let i = 0; i < tw * th; i++) {
			const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
			sig[i] = (r * 77 + g * 150 + b * 29) >> 8;
			look[i * 3] = r; look[i * 3 + 1] = g; look[i * 3 + 2] = b;
		}
		return { sig, look };
	}
	// 2つの色の画の違い（画素ごとの RGB のいちばん大きい差の平均）
	function lookDiff(a, b) {
		let s = 0;
		for (let i = 0; i < a.length; i += 3) {
			const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
			s += d > OPT6.lookClip ? OPT6.lookClip : d;
		}
		return s * 3 / a.length;
	}
	// ほかの控えとの違い（diff）の合計がいちばん小さい控え（同じなら先のもの）。near は、その最小に近い控え（読み直すコマをまとめるのに使う）
	function medoid(samples, diff) {
		const sums = samples.map((a) => samples.reduce((s, b) => s + (a === b ? 0 : diff(a, b)), 0));
		const min = Math.min.apply(null, sums);
		return { best: samples[sums.indexOf(min)], near: samples.filter((s, i) => sums[i] <= min + OPT6.lookNear * (samples.length - 1)) };
	}

	/* 札の並びをつなぐ。コマ f の札 f.cards（{ a, kind, sig, … }）を、続きの分かっている並び（chunk）の何番目に当てるかを決める。
	 * 並びは、重なりの無い飛びがあれば2つ以上になり、あとのコマが両方に重なれば1つに戻る */
	const sampleOf = (f, c) => ({ f, a: c.a, sig: c.sig, look: c.look || null, face: c.face || null, endGrey: !!c.endGrey });
	function newRow(f, c) { return { kind: c.kind, samples: [sampleOf(f, c)] }; }
	function addSample(row, f, c) { if (row.samples.length < 12) row.samples.push(sampleOf(f, c)); else if (c.endGrey) row.samples[0].endGrey = true; }
	// f と並び chunk の当てはめのうち、いちばん良いもの { j（f の先頭の札が当たる番号。負なら前にはみ出す）, raw, score } か null
	function matchChunk(f, chunk) {
		const cur = f.cards, rows = chunk.rows;
		let best = null;
		const need = Math.min(OPT6.minOverlap, cur.length, rows.length);
		for (let j = need - cur.length; j <= rows.length - need; j++) {
			let sum = 0, n = 0, off = 0, ok = true;
			for (let i = 0; i < cur.length && ok; i++) {
				const row = rows[j + i];
				if (!row) continue;
				if (row.kind !== cur[i].kind) { ok = false; break; }
				let m = Infinity;
				for (const s of row.samples.slice(-4)) m = Math.min(m, thumbDiff(cur[i].sig, s.sig));
				n++;
				if (m > OPT6.cardMax) off++; else sum += m;
				if (off > 1) ok = false;
			}
			if (!ok || n < need || (off && n < OPT6.offMin)) continue;
			const raw = sum / (n - off);
			if (raw > (off ? OPT6.offMax : OPT6.matchMax.find(([most]) => n <= most)[1])) continue;
			const score = raw + off * 0.3 + Math.abs(j - chunk.prevJ) * 0.005 - Math.min(n, 6) * 0.05;
			if (!best || score < best.score) best = { j, raw, score, n };
		}
		return best;
	}
	function bestMatch(f, chunks) {
		let best = null;
		for (const chunk of chunks) {
			const m = matchChunk(f, chunk);
			if (m && (!best || m.score < best.m.score)) best = { chunk, m };
		}
		return best;
	}
	// 当てはめた結果を並びに足す。戻り値: f の先頭の札の番号（chunk の中）
	function applyMatch(f, chunk, m) {
		const rows = chunk.rows, cur = f.cards;
		let j = m.j;
		const head = j < 0 ? -j : 0;
		if (head) { rows.unshift(...cur.slice(0, head).map((c) => newRow(f, c))); j = 0; }
		for (let i = head; i < cur.length; i++) {
			if (j + i < rows.length) addSample(rows[j + i], f, cur[i]); else rows.push(newRow(f, cur[i]));
		}
		chunk.prevJ = j;
		return j;
	}
	// next の先頭が first の at 番目に当たるとして、2つの並びを1つにする
	function joinChunks(first, next, at) {
		next.rows.forEach((row, k) => {
			const pos = at + k;
			if (pos < first.rows.length) row.samples.forEach((s) => addSample(first.rows[pos], s.f, s));
			else first.rows.push(row);
		});
	}
	// f が隣の並びにも重なれば、1つにする。戻り値: f が入っている並び
	function mergeAround(f, chunks, chunk, j) {
		let c = chunk, cj = j;
		for (const side of [-1, 1]) {
			const other = chunks[chunks.indexOf(c) + side];
			if (!other) continue;
			const m = matchChunk(f, other);
			if (!m) continue;
			if (side < 0) {   // other（前）に c（後ろ）をつなぐ
				const at = m.j - cj;
				if (at < 0) continue;
				joinChunks(other, c, at);
				other.prevJ = m.j;
				chunks.splice(chunks.indexOf(c), 1);
				c = other; cj = m.j;
			} else {
				const at = cj - m.j;
				if (at < 0) continue;
				joinChunks(c, other, at);
				chunks.splice(chunks.indexOf(other), 1);
			}
		}
		return c;
	}

	/**
	 * 1つの区間のコマ（時刻の順）の札をつなぐ。read(t) は時刻 t のコマ（同じ形）を返す。
	 * 戻り値 { rows（上から。gapBefore は直前との間に重なりの無い飛びがある印）, gaps, skipped, tailSkipped }
	 */
	async function buildSequence(frames, read, tEnd) {
		const chunks = [];
		let cur = null, lastT = null, skipped = 0, tailSkipped = 0, gaps = 0;
		const put = (f, found) => {
			const j = applyMatch(f, found.chunk, found.m);
			cur = mergeAround(f, chunks, found.chunk, j);
		};
		for (const f of frames) {
			if (f.cards.length < 2) continue;
			if (!chunks.length) {
				cur = { rows: f.cards.map((c) => newRow(f, c)), prevJ: 0 };
				chunks.push(cur); lastT = f.t;
				continue;
			}
			let found = bestMatch(f, chunks);
			if (!found) {
				// 手前と少し後の時刻を読み直して、並びを伸ばす
				let beyond = null;
				for (let k = 1; lastT + OPT6.dense * k <= Math.min(tEnd, f.t + OPT6.lookAhead) + 1e-6; k++) {
					const t = lastT + OPT6.dense * k;
					if (Math.abs(t - f.t) < OPT6.dense / 2) continue;
					const g = await read(t);
					if (g.tab !== f.tab || g.cards.length < 2) continue;
					const mg = bestMatch(g, chunks);
					if (mg) { put(g, mg); if (g.t > f.t) beyond = g.t; }
				}
				found = bestMatch(f, chunks);
				// 後の時刻が今の並びに重なった: このコマは粗かっただけ
				if (!found && beyond != null) { skipped++; lastT = beyond; tailSkipped = 0; continue; }
			}
			if (found) { put(f, found); lastT = f.t; tailSkipped = 0; continue; }
			// どこにも重ならない: 少し後のコマが今の並びに重なれば、このコマは粗かっただけ。重ならず、このコマと中身が合えば、飛んだ先の本物の一覧
			const fresh = { rows: f.cards.map((c) => newRow(f, c)), prevJ: 0 };
			const g = f.t + OPT6.confirmGap <= tEnd ? await read(f.t + OPT6.confirmGap) : null;
			const usable = g && g.tab === f.tab && g.cards.length >= 2;
			if (usable && bestMatch(g, chunks)) { skipped++; continue; }
			const mg = usable ? matchChunk(g, fresh) : null;
			if (!mg) { skipped++; tailSkipped++; continue; }
			chunks.splice(chunks.indexOf(cur) + 1, 0, fresh);
			gaps++;
			cur = fresh;
			put(g, { chunk: fresh, m: mg });
			lastT = g.t; tailSkipped = 0;
		}
		const rows = [];
		chunks.forEach((c, i) => c.rows.forEach((r, k) => { r.gapBefore = i > 0 && k === 0; rows.push(r); }));
		return { rows, gaps: chunks.length - 1, jumped: gaps, skipped, tailSkipped, chunks };
	}

	/** 並びを青い札で人に分ける。peekY（縮めたコマの px）より下にしか青い札が来ず、一覧の終わりも写っていない最後の人は外す（飛びのある人は、
	 * 見えただけではないので外さない。外すと「確かでない」の印ごと消えて、黙って欠ける）。戻り値 [{ rows, uncertain, partial }]
	 * partial（決定 938）: 最後の人が一覧の最後まで写っていない見込み。今の因子画面（ページの videoPersonsToKeep）と同じ考え方で、次の人の頭が
	 * 見えていれば（見えただけの人を外した・4人目があった）前の人は写り切っている。見えていなければ、札の下に一覧の地の灰色（一覧の終わり）が
	 * 一度も写っていない最後の人。因子一覧は一覧の終わりが画で分かるので、3人目の人も見る */
	function splitPersons(seq, peekY) {
		const persons = [];
		for (const row of seq.rows) {
			if (row.kind === 'blue' || !persons.length) persons.push({ rows: [], uncertain: false });
			persons[persons.length - 1].rows.push(row);
		}
		if (!persons.length) return persons;
		// 先頭が青い札でない（一覧の途中から撮り始めた）
		if (persons[0].rows[0].kind !== 'blue') persons[0].uncertain = true;
		// 重なりの無い飛び: 飛びの直前の札がある人
		for (let i = 1; i < seq.rows.length; i++) {
			if (!seq.rows[i].gapBefore) continue;
			const p = persons.find((q) => q.rows.indexOf(seq.rows[i - 1]) >= 0);
			if (p) p.uncertain = true;
		}
		let nextSeen = false;   // 次の人の頭が見えた（決定 938）
		while (persons.length > 1) {
			const last = persons[persons.length - 1], head = last.rows[0], tail = last.rows[last.rows.length - 1];
			if (last.uncertain || last.rows.some((r) => r.gapBefore)) break;
			if (head.samples.some((s) => s.a < peekY) || tail.samples.some((s) => s.endGrey)) break;
			persons.pop();
			nextSeen = true;
		}
		if (persons.length > 3) { persons.length = 3; persons[2].uncertain = true; nextSeen = true; }
		if (seq.tailSkipped > 0) persons[persons.length - 1].uncertain = true;
		persons.forEach((p) => { p.partial = false; });
		const end = persons[persons.length - 1];
		if (!nextSeen && !end.rows[end.rows.length - 1].samples.some((s) => s.endGrey)) end.partial = true;
		return persons;
	}

	// 顔の欄の中の、顔（色の付いた画素と暗い画素）の範囲。地（白・灰色）と木の線（灰色 188）は数えない。無ければ null
	function faceBox(ctx, x, y, w, h) {
		if (w < 4 || h < 4) return null;
		const d = ctx.getImageData(x, y, w, h).data, cols = new Int32Array(w), rows = new Int32Array(h);
		for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
			const p = (j * w + i) * 4, r = d[p], g = d[p + 1], b = d[p + 2], max = Math.max(r, g, b);
			if (max - Math.min(r, g, b) > 45 || max < 150) { cols[i]++; rows[j]++; }
		}
		const range = (a) => { let l = -1, r = -1; for (let i = 0; i < a.length; i++) if (a[i] >= 3) { if (l < 0) l = i; r = i; } return l < 0 ? null : [l, r]; };
		const cx = range(cols), cy = range(rows);
		if (!cx || !cy || cx[1] - cx[0] < w * 0.4 || cy[1] - cy[0] < h * 0.4) return null;
		const pad = 3;
		const x0 = Math.max(0, cx[0] - pad), y0 = Math.max(0, cy[0] - pad);
		return { x: x + x0, y: y + y0, w: Math.min(w, cx[1] + 1 + pad) - x0, h: Math.min(h, cy[1] + 1 + pad) - y0 };
	}

	/**
	 * 6人分の因子一覧を取り込む。source は sourceFor の戻り値（切り出し済み）、found は detect の戻り値（type 'list6'）。
	 * 戻り値 { type: 'list6', sets: [{ set（0＝1人目のタブ→親Aセット／1＝2人目のタブ→親Bセット）, persons: [{ files, uncertain, partial（一覧の最後まで写っていない）, cards（札の数） }], from, to }] }
	 * 写っていないタブのセットは sets に入らない。札が1枚も並ばなければ code 'too-few' の例外。
	 * o: { signal, onProgress({ phase: 'read', ratio }), ratioFloor, log(文) }
	 */
	async function import6(source, found, o) {
		const signal = (o && o.signal) || null, log = (o && o.log) || (() => {});
		const floor = Math.max(0, Math.min(0.9, (o && o.ratioFloor) || 0));
		const progress = (r) => { if (o && o.onProgress) o.onProgress({ phase: 'read', ratio: floor + (1 - floor) * r }); };
		const t0 = performance.now();
		const FW = source.width, FH = source.height;
		const W = Math.round(FW * OPT6.scale), H = Math.round(FH * OPT6.scale), s = W / FW;
		const small = document.createElement('canvas'); small.width = W; small.height = H;
		const sx = small.getContext('2d', { willReadFrequently: true });
		sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';   // 縮めたコマの札の中身を、位置の半端（半画素）に揺れにくくする
		const work = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		const full = document.createElement('canvas');
		const listTopOf = (w, k) => Math.max(0, Math.round(found.tabBand[1] * k + w * OPT6.listTop));
		const listBottomOf = (w, h, k) => Math.min(h, Math.round(found.titleTop * k + w * OPT6.listBottom));
		const top = listTopOf(W, s), bottom = listBottomOf(W, H, s);
		const titleY = Math.min(H - 1, Math.round(found.titleTop * s + W * OPT6.titleRow));
		const tabY = Math.min(H - 1, Math.round((found.tabBand[0] + (found.tabBand[1] - found.tabBand[0]) * OPT6.tabRow) * s));
		const greenShare = (y, range, test) => {
			const x = Math.round(W * range[0]), n = Math.max(1, Math.round(W * range[1]) - x), d = sx.getImageData(x, y, n, 1).data;
			let c = 0; for (let i = 0; i < n; i++) if (test(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) c++;
			return c / n;
		};
		const cache = new Map();
		let reads = 0;
		// 時刻 t のコマ: どちらのタブか・札と中身の控え
		async function read(t) {
			abortCheck(signal);
			const at = +Math.max(0, Math.min(source.duration - 0.001, t)).toFixed(3);
			if (cache.has(at)) return cache.get(at);
			await V().untilAbort(source.drawAt(at, sx, W, H, signal), signal);
			reads++;
			const f = { t: at, tab: 0, cards: [] };
			if (greenShare(titleY, [0.1, 0.9], isTabGreen) > OPT6.titleCover) {
				const L = greenShare(tabY, OPT6.tabLeft, isTabGreen), R = greenShare(tabY, OPT6.tabRight, isTabGreen);
				f.tab = L > OPT6.tabOn && R < OPT6.tabOff ? 1 : R > OPT6.tabOn && L < OPT6.tabOff ? 2 : 0;
			}
			if (f.tab) {
				f.extent = listExtent(sx, Math.round(W * OPT6.listGreyX), top, bottom);
				f.cards = scanCards(sx, W, top, bottom);
				for (const c of f.cards) {
					Object.assign(c, cardSample(work, small, W, c));
					const g0 = Math.round(c.b + W * OPT6.endGrey[0]), g1 = Math.round(c.b + W * OPT6.endGrey[1]);
					if (g1 < bottom) {
						const d = sx.getImageData(c.x, g0, 1, g1 - g0).data;
						let grey = true;
						for (let i = 0; i < d.length; i += 4) if (Math.min(d[i], d[i + 1], d[i + 2]) < 234 || Math.max(d[i], d[i + 1], d[i + 2]) > 246) { grey = false; break; }
						c.endGrey = grey;
					}
					if (c.kind === 'blue') {
						const y0 = Math.round(c.a - W * OPT6.faceUp), y1 = Math.round(c.a + W * OPT6.faceDown);
						if (y0 >= top - 1 && y1 <= bottom) {
							const x = Math.round(W * OPT6.faceX[0]);
							c.face = grayThumb(work, small, x, Math.max(0, y0), Math.round(W * OPT6.faceX[1]) - x, y1 - Math.max(0, y0), 32, 32);
						}
					}
				}
			}
			cache.set(at, f);
			return f;
		}
		try {
			// 1. 一定の間隔で読み、タブの区間に分ける
			const times = [];
			for (let t = 0; t < source.duration - 0.05; t = +(t + OPT6.step).toFixed(3)) times.push(t);
			const frames = [];
			for (let i = 0; i < times.length; i++) {
				frames.push(await read(times[i]));
				progress(0.65 * (i + 1) / times.length);
			}
			const segments = [];
			for (const f of frames) {
				const last = segments[segments.length - 1];
				if (last && last.tab === f.tab) last.frames.push(f); else segments.push({ tab: f.tab, frames: [f] });
			}
			// 札の高さと間隔（切れた札を外すため・並べるため）
			const median = (a) => { const q = a.slice().sort((p, r) => p - r); return q.length ? q[q.length >> 1] : 0; };
			const allH = [], steps = [];
			frames.forEach((f) => f.cards.forEach((c) => allH.push(c.b - c.a + 1)));
			const cardH = median(allH);
			if (!cardH) throw listError('too-few', '因子一覧（6人分）の札が見つからない');
			const whole = (c) => Math.abs(c.b - c.a + 1 - cardH) <= Math.max(2, cardH * OPT6.cardTol);
			frames.forEach((f) => f.cards.forEach((c, i) => {
				const n = f.cards[i + 1];
				if (n && whole(c) && whole(n) && n.a - c.a < cardH * 1.5) steps.push(n.a - c.a);
			}));
			const pitch = median(steps) || cardH * 1.25;
			// 使う札。間に読み落とし（切れていると見た札など）があるコマは、続いているいちばん長い所だけ（間を飛ばしてつなぐと札が抜ける）
			const wholeOnly = (f) => {
				if (f.whole) return f.whole;
				let best = [], run = [];
				for (const c of f.cards.filter(whole)) {
					if (run.length && c.a - run[run.length - 1].a > pitch * OPT6.holeStep) run = [];
					run.push(c);
					if (run.length > best.length) best = run.slice();
				}
				return (f.whole = { t: f.t, tab: f.tab, cards: best });
			};
			const sets = [];
			for (const tab of [1, 2]) {
				const own = segments.filter((g) => g.tab === tab && g.frames.length >= OPT6.minSegment);
				if (!own.length) continue;
				const seg = own.reduce((a, b) => (b.frames.length > a.frames.length ? b : a));
				const from = seg.frames[0].t, to = seg.frames[seg.frames.length - 1].t;
				const least = median(seg.frames.map((f) => wholeOnly(f).cards.length)) * OPT6.frameCards;
				const enough = (f) => (f.cards.length >= least ? f : { t: f.t, tab: f.tab, cards: [] });
				const seqFrames = seg.frames.map(wholeOnly).map(enough);
				const readWhole = async (t) => enough(wholeOnly(await read(Math.max(from, Math.min(to + OPT6.step / 2, t)))));
				const seq = await buildSequence(seqFrames, readWhole, Math.min(source.duration - 0.001, to + OPT6.step / 2));
				// 控えの少ない札は、写っていた時刻の前後を読み足す
				const extra = new Set();
				seq.rows.filter((r) => r.samples.length < OPT6.extraBelow).forEach((r) => r.samples.forEach((p) => {
					[-0.5, 0.5].forEach((k) => { const t = +(p.f.t + OPT6.step * k).toFixed(3); if (t >= from && t <= to) extra.add(t); });
				}));
				for (const t of Array.from(extra).sort((a, b) => a - b)) {
					const g = await readWhole(t);
					if (g.tab !== tab || g.cards.length < 2) continue;
					let hit = null;
					for (const chunk of seq.chunks) { const m = matchChunk(g, chunk); if (m && (!hit || m.score < hit.m.score)) hit = { chunk, m }; }
					if (!hit) continue;
					// 読み足しは控えを足すだけ（並びは変えない）
					g.cards.forEach((c, i) => { const row = hit.chunk.rows[hit.m.j + i]; if (row) addSample(row, g, c); });
				}
				const persons = splitPersons(seq, found.titleTop * s + W * OPT6.peekLine);
				log('[因子一覧] ' + tab + '人目のタブ ' + from.toFixed(2) + '〜' + to.toFixed(2) + '秒: 札 ' + persons.map((p) => p.rows.length + (p.partial ? '（途中まで）' : '')).join('／')
					+ '（控えが1つの札 ' + seq.rows.filter((r) => r.samples.length === 1).length + '・使わなかったコマ ' + seq.skipped + '・重なりの無い飛び ' + seq.gaps + '）');
				if (persons.length) sets.push({ set: tab - 1, persons, from, to, gaps: seq.gaps, skipped: seq.skipped });
				progress(0.65 + 0.1 * tab / 2);
			}
			if (!sets.length) throw listError('too-few', '因子一覧（6人分）のタブの区間が無い');
			// 2. 使うコマを決めて、等倍で読み直して並べる
			full.width = FW; full.height = FH;
			const fx = full.getContext('2d', { willReadFrequently: true });
			const cardX0 = Math.round(FW * OPT6.cropX[0]), cw = Math.round(FW * OPT6.cropX[1]) - cardX0;
			const fullPitch = pitch / s, fullH = Math.round(cardH / s), margin = Math.max(0, Math.round((fullPitch - fullH) / 2));
			const y0 = Math.ceil(FW * OPT6.faceUp) + 4;
			const heightOf = (n) => Math.round(y0 + (n - 1) * fullPitch + fullH + margin);
			// 一覧の本当の上端・下端（地の灰色の範囲の中央値）。写すのはこの中だけ
			const extents = frames.filter((f) => f.extent).map((f) => f.extent);
			const fTop = Math.max(listTopOf(FW, 1), extents.length ? Math.ceil(median(extents.map((e) => e[0])) / s) + 1 : 0);
			const fBottom = Math.min(listBottomOf(FW, FH, 1), extents.length ? Math.floor(median(extents.map((e) => e[1])) / s) : FH);
			const total = sets.reduce((a, g) => a + g.persons.length, 0);
			log('[因子一覧] 札の高さ 約' + fullH + 'px・間隔 ' + fullPitch.toFixed(1) + 'px・写す範囲 y=' + fTop + '〜' + fBottom + '（画 ' + FW + 'x' + FH + '）');
			let done = 0;
			for (const group of sets) {
				const scale = Math.min(1, OPT6.outW / cw, OPT6.outHMax / Math.max.apply(null, group.persons.map((p) => heightOf(p.rows.length))));
				const tasks = new Map();   // コマの時刻 → することの並び
				const task = (t, job) => { if (!tasks.has(t)) tasks.set(t, []); tasks.get(t).push(job); };
				group.persons.forEach((p) => {
					p.canvas = document.createElement('canvas');
					p.canvas.width = cw; p.canvas.height = heightOf(p.rows.length);
					const c = p.canvas.getContext('2d');
					c.fillStyle = '#fff'; c.fillRect(0, 0, cw, p.canvas.height);
					p.rows.forEach((row, i) => {
						// 余白まで一覧の中に写っている控えがあれば、その中から選ぶ
						const inner = row.samples.filter((q) => q.a / s - margin >= fTop && q.a / s + fullH + margin <= fBottom);
						const m = medoid(inner.length ? inner : row.samples, (a, b) => lookDiff(a.look, b.look));
						const pick = m.near.find((q) => tasks.has(q.f.t)) || m.best;
						task(pick.f.t, { p, i, sig: pick.sig, a: pick.a });
					});
					const faces = p.rows[0].kind === 'blue' ? p.rows[0].samples.filter((q) => q.face) : [];
					if (faces.length) {
						const m = medoid(faces.map((q) => ({ sig: q.face, q })), (a, b) => thumbDiff(a.sig, b.sig, 32));
						const pick = (m.near.find((q) => tasks.has(q.q.f.t)) || m.best).q;
						task(pick.f.t, { p, face: true, sig: pick.sig, a: pick.a });
					}
				});
				const rights = [], heights = [];   // 等倍のコマで見た札の右端と高さ
				for (const t of Array.from(tasks.keys()).sort((a, b) => a - b)) {
					abortCheck(signal);
					await V().untilAbort(source.drawAt(t, fx, FW, FH, signal), signal);
					const cards = scanCards(fx, FW, fTop, fBottom);
					cards.forEach((c) => {
						c.sig = cardSample(work, full, FW, c).sig;
						if (Math.abs(c.b - c.a + 1 - fullH) > fullH * 0.1) return;
						heights.push(c.b - c.a + 1);
						const r = cardRight(fx, FW, c); if (r != null) rights.push(r);
					});
					for (const job of tasks.get(t)) {
						// 縮めたコマで見た位置の近くの札のうち、中身がいちばん合うもの
						const near = cards.filter((c) => Math.abs(c.a - job.a / s) < fullPitch * 0.75);
						const hit = near.sort((p1, q) => thumbDiff(p1.sig, job.sig) - thumbDiff(q.sig, job.sig))[0];
						const a = hit ? hit.a : Math.round(job.a / s);
						const c = job.p.canvas.getContext('2d');
						if (job.face) {
							const fy = Math.max(fTop, Math.round(a - FW * OPT6.faceUp));
							const fxl = Math.round(FW * OPT6.faceX[0]);
							const box = faceBox(fx, fxl, fy, Math.round(FW * OPT6.faceX[1]) - fxl, Math.min(fBottom, Math.round(a + FW * OPT6.faceDown)) - fy);
							if (box) {
								c.drawImage(full, box.x, box.y, box.w, box.h, box.x - cardX0, y0 + (box.y - a), box.w, box.h);
								job.p.face = { x: box.x - cardX0, y: y0 + (box.y - a), w: box.w, h: box.h };
							}
							continue;
						}
						const ty = Math.round(y0 + job.i * fullPitch), h = Math.ceil(fullPitch);
						const from = Math.max(fTop, a - margin), to = Math.min(fBottom, a - margin + h);
						const x = Math.round(FW * OPT6.sliceX[0]), w = Math.round(FW * OPT6.sliceX[1]) - x;
						if (to > from) c.drawImage(full, x, from, w, to - from, x - cardX0, ty - margin + (from - (a - margin)), w, to - from);
					}
					progress(0.75 + 0.2 * Math.min(1, (done + 0.5) / total));
				}
				// 札の右の余白は白くする（PC の録画のカーソルが写る。札の外なので中身の控えでは避けられない）
				if (rights.length) {
					const x = Math.min(cw, median(rights) + 2 - cardX0);
					group.persons.forEach((p) => { const c = p.canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(x, 0, cw - x, p.canvas.height); });
				}
				// 3. 人の画を、札の境目で高さの上限以下の画に分けて File にする
				for (let r = 0; r < group.persons.length; r++) {
					const p = group.persons[r];
					const cut = [{ y: 0, cards: [] }];
					p.rows.forEach((row, i) => {
						const ty = Math.round(y0 + i * fullPitch), head = ty - margin, end = Math.round(ty - margin + fullPitch);
						let part = cut[cut.length - 1];
						if (end - part.y > OPT6.chunkH && part.cards.length) { part = { y: head, cards: [] }; cut.push(part); }
						part.cards.push({ y: ty - part.y, h: median(heights) || fullH, kind: row.kind });
					});
					const files = [];
					for (let k = 0; k < cut.length; k++) {
						abortCheck(signal);
						const y = cut[k].y, h = (k + 1 < cut.length ? cut[k + 1].y : p.canvas.height) - y;
						const piece = document.createElement('canvas'); piece.width = cw; piece.height = h;
						piece.getContext('2d').drawImage(p.canvas, 0, y, cw, h, 0, 0, cw, h);
						const blob = await V().untilAbort(new Promise((res) => piece.toBlob(res, 'image/jpeg', 0.95)), signal);
						piece.width = piece.height = 0;
						if (!blob) throw listError('encode', '静止画にできない');
						const file = new File([blob], 'factor-list-' + (group.set ? 'B' : 'A') + '-' + (r + 1) + '-' + (k + 1) + '.jpg', { type: 'image/jpeg' });
						file.factorList6 = Object.freeze({ part: k, parts: cut.length, scale, cards: cut[k].cards, face: k === 0 ? (p.face || null) : null });
						files.push(file);
					}
					p.canvas.width = p.canvas.height = 0;
					group.persons[r] = { files, uncertain: p.uncertain, partial: p.partial, cards: p.rows.length };
					done++;
					progress(0.95 + 0.05 * done / total);
				}
			}
			log('[因子一覧] 6人分: ' + sets.map((g) => (g.set ? '親B' : '親A') + ' ' + g.persons.map((p) => p.cards + '枚' + (p.uncertain ? '（確かでない）' : '')).join('／')).join('・')
				+ '（コマ ' + reads + '回・' + ((performance.now() - t0) / 1000).toFixed(1) + '秒）');
			return { type: 'list6', sets, landscape: source.landscape || null };
		} finally { small.width = small.height = 0; full.width = full.height = 0; work.canvas.width = work.canvas.height = 0; cache.clear(); }
	}

	/** files がすべて6人分の因子一覧から作った画か（利用者が自分の画を足した人は false） */
	function isList6(files) { return !!(files && files.length) && Array.prototype.every.call(files, (f) => !!(f && f.factorList6)); }

	/* 結合の人の画の、札の外の白い所を塗り直す（boxes は札の [上端, 下端]。上から）。
	 *  (a) 札と札の間: 上下の札の端から間の長さの gapPad ぶん内側（札の縁と影に掛けない）。左の端は顔の欄より右
	 *  (b) 札の右の角の外: 角は丸いので、札の上下の端の近くの行は札の右に地の白が残り、そこに矢印の欠けらの先がかかる。
	 *      その行だけ、札の中から右へ最初の地の白を見つけ、そこから右を白にする（札の中の字と★には掛けない） */
	function whiteBetweenCards(ctx, w, h, boxes) {
		const gx = Math.round(w * OPT6R.gapFrom);
		ctx.fillStyle = '#fff';
		for (let k = 0; k + 1 < boxes.length; k++) {
			const gap = boxes[k + 1][0] - boxes[k][1], pad = Math.max(2, Math.round(gap * OPT6R.gapPad));
			const a = boxes[k][1] + pad, b = boxes[k + 1][0] - pad;
			if (b > a) ctx.fillRect(gx, a, w - gx, b - a);
		}
		const rights = boxes.map(([top, bottom]) => {
			const d = ctx.getImageData(gx, Math.min(h - 1, (top + bottom) >> 1), w - gx, 1).data;
			for (let i = w - gx - 1; i >= 0; i--) if (Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) < 244) return gx + i + 1;
			return null;
		}).filter((v) => v != null).sort((p, q) => p - q);
		if (!rights.length) return;
		const right = rights[rights.length >> 1];
		boxes.forEach(([top, bottom]) => {
			const r = Math.max(2, Math.round((bottom - top) * OPT6R.cornerRows)), x0 = Math.max(gx, right - r * 2);
			[[top - r, top + r], [bottom - r, bottom + r]].forEach(([a, b]) => {
				const y0 = Math.max(0, a), rows = Math.min(h, b) - y0;
				if (rows < 1 || w - x0 < 1) return;
				const img = ctx.getImageData(x0, y0, w - x0, rows), d = img.data, ww = w - x0;
				for (let j = 0; j < rows; j++) {
					let white = false;
					for (let i = 0; i < ww; i++) {
						const p = (j * ww + i) * 4;
						if (!white && Math.min(d[p], d[p + 1], d[p + 2]) >= 250) white = true;
						if (white) d[p] = d[p + 1] = d[p + 2] = 255;
					}
				}
				ctx.putImageData(img, x0, y0);
			});
		});
	}

	/** 6人分の人の画（import6 の files。並びの順）を縦に積み、結合に使う大きさに縮めた canvas（ページの結合の人の画。stitchOnePerson の戻り値の代わり）。
	 * 札と札の間の白い所は白で塗る（DMM版の横の録画で、画面の右の矢印の欠けらが札の間の右端に短い線で残る。結合画像の中だけ。読み取りの画は変えない）。
	 * canvas._factorList6 の places は、読み取りの画の座標を結合の canvas の座標へ写す表（ページの印。_sourcePlacements と同じ形に倍率 k を足したもの。
	 * _sourcePlacements にしないのは、2列の組み立てなどが静止画の結合の対応表として読むため） */
	async function composeList6(files) {
		const imgs = [];
		for (const f of files) imgs.push(await loadImage(f));
		const w = Math.max.apply(null, imgs.map((i) => i.naturalWidth)), h = imgs.reduce((a, i) => a + i.naturalHeight, 0);
		const all = document.createElement('canvas'); all.width = w; all.height = h;
		const ax = all.getContext('2d');
		ax.fillStyle = '#fff'; ax.fillRect(0, 0, w, h);
		let y = 0;
		const tops = [], boxes = [];
		imgs.forEach((i, k) => {
			ax.drawImage(i, 0, y);
			tops.push(y);
			files[k].factorList6.cards.forEach((c) => boxes.push([y + c.y, y + c.y + c.h]));
			y += i.naturalHeight;
		});
		whiteBetweenCards(ax, w, h, boxes);
		const scale = files[0].factorList6.scale;
		let out = all;
		if (scale < 1) {
			out = document.createElement('canvas');
			out.width = Math.round(w * scale); out.height = Math.round(h * scale);
			const ox = out.getContext('2d');
			ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
			ox.drawImage(all, 0, 0, out.width, out.height);
			all.width = all.height = 0;
		}
		out._stitchWarnings = [];
		out._profileHeader = { kept: false, ratio: 0, height: 0 };
		const k = scale < 1 ? scale : 1;
		out._factorList6 = { scale, places: imgs.map((i, n) => ({ fileIndex: n, srcY0: 0, srcY1: i.naturalHeight, outY0: tops[n] * k, k })) };
		return out;
	}

	/* ── 6人分の読み取り（T222・段3） ─────────────────────────────
	 * 読む画は import6 が分けた画（file.factorList6 に札の上端・高さ・種類がある）。札の位置は画の印を使い、行は探し直さない。
	 * 利用者が画を足し引きして動画の控え（persons[].video）が消えても、印は File に残るので画ごとに分かる。
	 * 札は1列で、左から ●・名前・★3つ・ⓘ。下の寸法は、札の左右の端に対する比（実測: スマホ・DMM版の縦と横の3本）。 */
	const OPT6R = Object.freeze({
		edgeFrom: 0.19,          // 札の左右の端を探し始める列（画の幅の比。顔の欄より右）
		textY: [0.16, 0.84],     // 名前の切り出し（札の高さに対する比）
		rowX: [0.057, 0.71],     // 灰色の札の行の切り出し（● の右〜★の手前）
		nameLeft: 0.078,         // 名前の左端
		topX: [0.065, 0.715],    // 青・赤・固有の緑の白い字を切り出す範囲
		starCx: [0.758, 0.818, 0.877], starHalf: 0.018,   // ★3つの中心と、見る幅の半分
		starY: [0.25, 0.75],     // ★を見る縦の範囲（札の高さに対する比）
		starFill: 0.15,          // 見る矩形の中で金色の画素がこの割合以上なら★
		gapFrom: 0.19, gapPad: 0.1,  // 結合画像の札の間を白で塗る左の端（画の幅の比）と、札からあける長さ（間の長さの比）
		cornerRows: 0.12             // 札の右の角の外を白にする行（札の上下の端から、札の高さに対する比）
	});

	/** 読み取りの画 base（toBaseCanvas の戻り値）の札 [{ a, h, kind, x0, x1 }]（base の px。x0・x1 は札の左右の端）。印が無い・測れなければ null */
	function cards6(base, file, naturalH) {
		const m = file && file.factorList6;
		if (!m) return null;
		const W = base.width, H = base.height, k = H / (naturalH || H), from = Math.round(W * OPT6R.edgeFrom);
		const ctx = base.getContext('2d', { willReadFrequently: true });
		const list = m.cards.map((c) => ({ a: Math.round(c.y * k), h: Math.round(c.h * k), kind: c.kind })).filter((c) => c.h > 4 && c.a >= 0 && c.a + c.h <= H + 1);
		const lefts = [], rights = [];
		list.forEach((c) => {
			const d = ctx.getImageData(from, Math.min(H - 1, c.a + (c.h >> 1)), W - from, 1).data;
			let l = -1, r = -1;
			for (let i = 0; i < W - from; i++) if (Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) < 244) { if (l < 0) l = i; r = i; }
			if (l >= 0) { lefts.push(from + l); rights.push(from + r + 1); }
		});
		if (!lefts.length) return null;
		const mid = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
		const x0 = mid(lefts), x1 = mid(rights);
		if (x1 - x0 < W * 0.5) return null;
		return list.map((c) => Object.assign(c, { x0, x1 }));
	}

	// 札の★の数（左から、置き場所の金色を数える）
	function cardStars(gold, W, H, c) {
		const cw = c.x1 - c.x0;
		const y0 = Math.max(0, Math.round(c.a + c.h * OPT6R.starY[0])), y1 = Math.min(H, Math.round(c.a + c.h * OPT6R.starY[1]));
		let stars = 0;
		for (let s = 0; s < 3; s++) {
			const x0 = Math.max(0, Math.round(c.x0 + cw * (OPT6R.starCx[s] - OPT6R.starHalf)));
			const x1 = Math.min(W, Math.round(c.x0 + cw * (OPT6R.starCx[s] + OPT6R.starHalf)));
			let n = 0, tot = 0;
			for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { tot++; if (gold[y * W + x]) n++; }
			if (!tot || n < tot * OPT6R.starFill) break;
			stars++;
		}
		return stars;
	}

	/** 6人分の画の灰色の札の行（detectRows と同じ形。columns は1・list6 の印つき）。青・赤・固有の緑の札は topCards6 で別に読む。札が無ければ null。
	 * rows の y・h は名前の帯（中心が札の中心）で、card（{ a, h, x0, x1 }）は札そのもの（ページの枠と印の置き場所） */
	function detectRows6(base, file, naturalH, diag) {
		const cards = cards6(base, file, naturalH);
		const grey = cards ? cards.filter((c) => c.kind === 'gray') : [];
		if (!grey.length) { if (diag) diag.push('[因子一覧] 灰色の札が無い（6人分）'); return null; }
		const rows = [], bands = [];
		grey.forEach((c, i) => {
			const cw = c.x1 - c.x0;
			const x = c.x0 + Math.round(cw * OPT6R.rowX[0]), w = Math.round(cw * (OPT6R.rowX[1] - OPT6R.rowX[0]));
			const y = c.a + Math.round(c.h * OPT6R.textY[0]), h = Math.round(c.h * (OPT6R.textY[1] - OPT6R.textY[0]));
			bands.push({ a: y, b: y + h - 1 });
			rows.push({ x, y, w, h, col: 0, band: i, card: { a: c.a, h: c.h, x0: c.x0, x1: c.x1 } });
		});
		const c0 = grey[0], columnXs = [c0.x0 + Math.round((c0.x1 - c0.x0) * OPT6R.nameLeft)];
		if (diag) diag.push('[因子一覧] 灰色の札 ' + rows.length + '枚（6人分・札の左右 x=' + c0.x0 + '〜' + c0.x1 + '）');
		return { rows, columns: 1, list6: true, listTop: rows[0].y, bands, columnXs };
	}

	/** detectRows6 の行の★の数（[{ stars, reliable }]。札は画に丸ごと入っているので、どれも当てにする） */
	function rowStars6(base, detection) {
		const gold = goldMaskOf(getPixels(base));
		return detection.rows.map((r) => ({ stars: cardStars(gold, base.width, base.height, r.card), reliable: true }));
	}

	/* 色の札の★は、青みの少ない金色だけを数える（ページの melopStarMaskOf と同じ条件）。赤の札の空の★は淡い橙色で、
	 * goldMaskOf（灰色の札の★）だと金色と数える（実測: 6人分の赤の札の ★2 が 3 になった） */
	function topStarMask(img) {
		const d = img.data, mask = new Uint8Array(img.width * img.height);
		for (let i = 0, p = 0; i < mask.length; i++, p += 4) if (d[p] > 200 && d[p + 1] > 140 && d[p] - d[p + 2] > 60 && d[p + 2] < 140) mask[i] = 1;
		return mask;
	}

	/**
	 * 6人分の画のいちばん上の青・赤・固有の緑の札。戻り値 { blue, red, green }（その画に無い札は null）か、印が無ければ null。
	 * 1つの札は { stars, layout }。layout は、ページの白い字の切り出し（melopTextCanvas は layout と layout.col・layout.top、
	 * greenFactorTextCanvas・greenFactorGrayCanvas は layout）にそのまま渡せる形 { h, top, x0, x1, col: { x0, x1 } }
	 */
	function topCards6(base, file, naturalH) {
		const cards = cards6(base, file, naturalH);
		if (!cards) return null;
		const gold = topStarMask(getPixels(base));
		const of = (kind) => {
			const c = cards.find((v) => v.kind === kind);
			if (!c) return null;
			const cw = c.x1 - c.x0, h = c.h, left = c.x0 + cw * OPT6R.topX[0] - h * 0.76, right = c.x0 + cw * OPT6R.topX[1];
			const layout = { h, top: Math.round(c.a + h * (OPT6R.textY[0] - 0.08)), x0: Math.round(left), x1: Math.round(right + h * 0.15), col: { x0: Math.round(left), x1: Math.round(right) } };
			return { stars: cardStars(gold, base.width, base.height, c), layout };
		};
		return { blue: of('blue'), red: of('pink'), green: of('green') };
	}

	/**
	 * ウィンドウの取り込み（js/pc-capture.js の detectOne）用: 横長の画（ImageData の形）の region の中で、今の切り出し（UmaLandscape.findPanel）が
	 * 見つけられないときの因子一覧の矩形。戻り値 { type, rect（cropSource の形） } か null。1人分があれば1人分（決定 931）
	 */
	function findListRect(img, region) {
		const W = img.width, R = region || { x: 0, y: 0, w: img.width, h: img.height };
		const found = [];
		for (const band of findTitleBands(img)) {
			if (band.x < R.x - 2 || band.x + band.w > R.x + R.w + 2 || band.y < R.y) continue;
			const r = rectOfBand(band, R.x + R.w, R.y + R.h);
			const x = Math.max(R.x, r.x), y = Math.max(R.y, r.y), w = r.x + r.w - x, h = r.y + r.h - y;
			const scale = OPT.outW / w;
			const rect = { ok: true, x, y, w, h, scale, outW: OPT.outW, outH: Math.round(h * scale) };
			// 見分けに使う小さな画（幅 outW の 1/4。近い画素を取る）
			const sw = Math.round(rect.outW / OPT.scaleDown), sh = Math.max(1, Math.round(rect.outH / OPT.scaleDown * OPT.scanH));
			const data = new Uint8ClampedArray(sw * sh * 4), k = w / sw;
			for (let j = 0; j < sh; j++) {
				const yy = Math.min(img.height - 1, y + Math.floor((j + 0.5) * k));
				for (let i = 0; i < sw; i++) {
					const p = (yy * W + Math.min(W - 1, x + Math.floor((i + 0.5) * k))) * 4, q = (j * sw + i) * 4;
					data[q] = img.data[p]; data[q + 1] = img.data[p + 1]; data[q + 2] = img.data[p + 2]; data[q + 3] = 255;
				}
			}
			const c = classifyFrame({ data, width: sw, height: sh });
			if (c) found.push({ type: c.type, rect });
		}
		return found.find((r) => r.type === 'list1') || found[0] || null;
	}

	global.UmaFactorList = Object.freeze({
		VERSION: FACTOR_LIST_JS_VERSION,
		ENABLED: FACTOR_LIST_ENABLED || FACTOR_LIST_TRIAL,
		TRIAL: FACTOR_LIST_TRIAL && !FACTOR_LIST_ENABLED,
		OPT6R,
		OPT: Object.freeze(Object.assign({}, OPT)),
		OPT6,
		classifyFrame,
		findTitleBands,
		findListRect,
		detect,
		sourceFor,
		selectOptions,
		select1,
		importOne,
		import6,
		scanCards,
		buildSequence,
		splitPersons,
		isList6,
		composeList6,
		detectRows,
		rowStars,
		cards6,
		detectRows6,
		rowStars6,
		topCards6
	});
})(typeof window !== 'undefined' ? window : globalThis);
