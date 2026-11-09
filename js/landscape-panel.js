/**
 * DMM版の横画面（T145・C-NNN）。横長の画（スクリーンショット・画面収録のフレーム・ウィンドウの取り込み）から
 * 「ウマ娘詳細」のパネルを見つけて切り出し、縦画面の DMM版のスクリーンショットと同じ形（パネルが幅いっぱい・縦横比 約1.8）にして、
 * 今の流れ（行の検出・OCR・結合）へ渡す。js/common.js・js/stitch.js（凍結）は変えない。公開するグローバルは UmaLandscape の1つだけ。
 *
 * 見つけ方（素材 4つで実測。全画面 2880×1920〔上下に黒い帯〕・ウィンドウ 2780×1564・1998×1124・静止画 2880×1920）:
 *  1. 横長（幅 ≥ 高さ×1.15）の画だけを見る。縦長の画は何もしない（縦画面の扱いは今のまま）。
 *  2. パネルの見出しの帯（「ウマ娘詳細」。濃い緑・青がほぼ 0）を上から探す。行ごとに濃い緑の画素の固まり（すきま 3% まではつなぐ）を取り、
 *     幅が画の 18〜60%・中が 55% 以上緑の行が、帯の幅の 4% 以上続く最初の所。右側のぼかした「メニュー」の帯は青が強いので当たらない。
 *  3. 帯の左右の端（行ごとの中央値）がパネルの左右、帯の上端がパネルの上端。パネルの高さは幅 × PANEL_RATIO（素材で 1.728〜1.731）。
 *  4. 切り出しは、パネルの左右に幅の 1.2%・上に 4.5%・下に 3% の余白を足した矩形（縦画面の DMM版の画と同じくらいの余白）。
 *     どの大きさの画からも、幅 1170px（スマホ版の画と同じくらい。結合の扱える幅 700〜1300px の中）に拡大・縮小する。
 *     幅 880px（ウィンドウ 2780×1564 の等倍）では、動画の区切りの青いパネルが x=0.3W の列で白い文字に割られて、青の続きが 17〜20px と
 *     判定（20px 続く）のきわになり、小さいウィンドウの録画で祖2 の区切りを落とした（T145 の実測）。1170px では 22〜25px。
 *     拡大はなめらかに描いてから弱いアンシャープマスクをかける（鮮明度の足切りに掛からないように。setSmoothing の説明）。
 * 帯が見つからない・パネルが画の下にはみ出す横長の画は、切り出さずにそのまま返す（今と同じ「縦横の比率が違う」などの案内になる）。
 */
(function (global) {
	'use strict';

	const LANDSCAPE_PANEL_JS_VERSION = '2026-11-09a';

	const OPT = {
		landscapeMin: 1.15,   // 幅 / 高さ がこれ以上なら横画面として調べる
		bandMinW: 0.18, bandMaxW: 0.6,   // 見出しの帯の幅（画の幅に対する割合）
		bandFill: 0.55,       // 帯の左右の端の間で緑の画素が占める割合の下限
		bandGap: 0.03,        // 緑の画素のすきま（画の幅に対する割合）までは1つの固まりとしてつなぐ
		bandMinH: 0.04,       // 帯の高さの下限（帯の幅に対する割合。実測 約 0.085）
		scanTop: 0.6,         // 上からこの割合までの行で帯を探す
		panelRatio: 1.729,    // パネルの高さ / 幅（実測 1.728〜1.731）
		padX: 0.012, padTop: 0.045, padBottom: 0.03,   // 切り出しの余白（パネルの幅に対する割合）
		outW: 1170,           // 切り出した画の幅（どの大きさの画からも同じ幅にそろえる）
		sharpenK: 0.8         // 拡大したときのアンシャープマスクの強さ（下の setSmoothing の説明）
	};

	function isLandscapeSize(w, h) { return !!(w && h) && w >= h * OPT.landscapeMin; }

	// 見出しの帯の緑（実測 102,186,0・126,204,8・145,215,8 など）。ぼかしたメニューの帯（185,228,115）は青が強いので外れる
	function isTitleGreen(r, g, b) { return g >= 150 && b <= 70 && g - r >= 35 && g - b >= 110; }

	/**
	 * img: { data, width, height }（ImageData の形）。region: 調べる矩形（省略は全体。ウィンドウの取り込みでは枠を除いた所）。
	 * 戻り値 { ok, reason, x, y, w, h（切り出す矩形）, scale, outW, outH, panel: { x, y, w, h } }
	 */
	function findPanel(img, region) {
		const W = img.width, H = img.height, d = img.data;
		const R = region || { x: 0, y: 0, w: W, h: H };
		if (!isLandscapeSize(R.w, R.h)) return { ok: false, reason: 'portrait' };
		const gapMax = Math.max(2, Math.round(R.w * OPT.bandGap));
		const minSpan = R.w * OPT.bandMinW, maxSpan = R.w * OPT.bandMaxW;
		const yEnd = Math.min(R.y + R.h, Math.round(R.y + R.h * OPT.scanTop));
		const rows = [];   // 条件に合う行の { y, x0, x1 }
		let runStart = -1, run = [];
		const step = 2;
		for (let y = R.y; y < yEnd; y++) {
			// この行の、いちばん画素の多い緑の固まり
			let best = null, cur = null;
			const base = y * W;
			for (let x = R.x; x < R.x + R.w; x += step) {
				const p = (base + x) * 4;
				if (!isTitleGreen(d[p], d[p + 1], d[p + 2])) continue;
				if (cur && x - cur.x1 <= gapMax) { cur.x1 = x; cur.n++; }
				else { if (cur && (!best || cur.n > best.n)) best = cur; cur = { x0: x, x1: x, n: 1 }; }
			}
			if (cur && (!best || cur.n > best.n)) best = cur;
			const span = best ? best.x1 - best.x0 + step : 0;
			const ok = best && span >= minSpan && span <= maxSpan && best.n * step >= span * OPT.bandFill;
			if (ok) {
				if (runStart < 0) { runStart = y; run = []; }
				run.push({ y, x0: best.x0, x1: best.x1 + step - 1 });
			} else if (runStart >= 0) {
				const res = bandToPanel(run);
				if (res) return finish(res, W, H, R);
				runStart = -1; run = [];
			}
		}
		if (runStart >= 0) { const res = bandToPanel(run); if (res) return finish(res, W, H, R); }
		return { ok: false, reason: 'no-band' };
	}

	const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };

	// 続いた行から、パネルの左右と上端を出す。帯が低すぎる（文字の緑など）なら null
	function bandToPanel(run) {
		const x0 = median(run.map((r) => r.x0)), x1 = median(run.map((r) => r.x1));
		const pw = x1 - x0 + 1;
		if (run.length < pw * OPT.bandMinH) return null;
		return { x: x0, y: run[0].y, w: pw, bandH: run.length };
	}

	function finish(p, W, H, R) {
		const ph = Math.round(p.w * OPT.panelRatio);
		const panel = { x: p.x, y: p.y, w: p.w, h: ph, bandH: p.bandH };
		if (p.y + ph > R.y + R.h + Math.round(p.w * 0.02)) return { ok: false, reason: 'panel-cut', panel };
		const px = Math.round(p.w * OPT.padX), pt = Math.round(p.w * OPT.padTop), pb = Math.round(p.w * OPT.padBottom);
		const x = Math.max(R.x, p.x - px), y = Math.max(R.y, p.y - pt);
		const x1 = Math.min(R.x + R.w, p.x + p.w + px), y1 = Math.min(R.y + R.h, p.y + ph + pb);
		const w = x1 - x, h = y1 - y;
		const scale = OPT.outW / w;
		return { ok: true, reason: '', x, y, w, h, scale, outW: Math.round(w * scale), outH: Math.round(h * scale), panel };
	}

	/* 拡大・縮小のやり方。どちらもなめらかに（high）描き、拡大したとき（縦横とも 1 倍を超える）だけ、そのあと弱いアンシャープマスクをかける。
	 * なめらかな拡大は文字の縁をぼかし、common.js の鮮明度スコア（足切り 120）が大きく下がる（T145 の実測: 小さいウィンドウの切り出し 632px を
	 * 1170px にすると、等倍 1464 → 113〜115。動画の画の半分ほどが足切りで OCR から外れた。全画面 914px → 1170px は 662 → 184）。
	 * アンシャープマスク（k=0.8）で 113 → 約 175。最近傍の拡大（色は元のまま・スコア約 800）も試したが、★の数え違いと読み落としが増えた。
	 * 録画3本×2ページの読み取り（名前と★）: なめらかだけ 54〜75/75・最近傍 67〜72/75・なめらか＋アンシャープ 73〜75/75。 */
	function setSmoothing(ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }
	// 弱いアンシャープマスク（上下左右と自分の平均との差を k 倍足す）。(0,0)-(w,h) の画素に
	function unsharp(ctx, w, h, k) {
		const id = ctx.getImageData(0, 0, w, h), d = id.data, s = new Uint8ClampedArray(d), W4 = w * 4;
		for (let y = 1; y < h - 1; y++) {
			for (let x = 1; x < w - 1; x++) {
				const i = y * W4 + x * 4;
				for (let ch = 0; ch < 3; ch++) {
					const v = s[i + ch];
					d[i + ch] = v + k * (v - (v + s[i - 4 + ch] + s[i + 4 + ch] + s[i - W4 + ch] + s[i + W4 + ch]) / 5);
				}
			}
		}
		ctx.putImageData(id, 0, 0);
	}
	/** 切り出した所を (0,0)-(w,h) に描いたあとに呼ぶ。sx・sy は描いた倍率。拡大のときだけアンシャープマスク */
	function finishDraw(ctx, w, h, sx, sy) { if (sx > 1.001 && sy > 1.001) unsharp(ctx, w, h, OPT.sharpenK); }

	/** 描いた画（canvas / ImageBitmap など）の矩形を切り出して、拡大・縮小した canvas を返す */
	function cropToCanvas(srcImage, rect) {
		const c = document.createElement('canvas');
		c.width = rect.outW; c.height = rect.outH;
		const ctx = c.getContext('2d', { willReadFrequently: true });
		setSmoothing(ctx);
		ctx.drawImage(srcImage, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.outW, rect.outH);
		finishDraw(ctx, c.width, c.height, rect.outW / rect.w, rect.outH / rect.h);
		return c;
	}

	/* ── 静止画 ───────────────────────────── */

	// 画像の大きさを、先頭のバイトだけで読む（PNG・JPEG・WebP・BMP・GIF）。読めなければ null（そのときは絵を開いて確かめる）
	async function headerSize(file) {
		try {
			const buf = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
			const u16 = (o) => (buf[o] << 8) | buf[o + 1];
			const u32 = (o) => ((buf[o] << 24) >>> 0) + (buf[o + 1] << 16) + (buf[o + 2] << 8) + buf[o + 3];
			const le16 = (o) => buf[o] | (buf[o + 1] << 8), le32 = (o) => (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
			if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { w: u32(16), h: u32(20) };
			if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { w: le16(6), h: le16(8) };
			if (buf[0] === 0x42 && buf[1] === 0x4d) return { w: le32(18), h: Math.abs(le32(22) | 0) };
			if (buf[0] === 0xff && buf[1] === 0xd8) {
				let o = 2;
				while (o + 9 < buf.length) {
					if (buf[o] !== 0xff) { o++; continue; }
					const m = buf[o + 1];
					if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16(o + 7), h: u16(o + 5), jpeg: true };
					o += 2 + u16(o + 2);
				}
				return null;
			}
			return null;
		} catch (e) { return null; }
	}

	/**
	 * File 1枚: 横画面のパネルが見つかれば、切り出した PNG の File（名前は元のまま）を返す。それ以外は元の File をそのまま返す。
	 * 縦長と分かる画像は開かない（先頭のバイトで大きさが分かれば、それだけで返す）。
	 */
	async function cropFile(file) {
		if (!file || (file.type && file.type.indexOf('image/') !== 0)) return file;
		const hs = await headerSize(file);
		// 先頭のバイトで縦長と分かれば開かない。JPEG は向き（EXIF）で縦横が入れ替わることがあるので、縦横どちらでも開いて確かめる
		if (hs && !hs.jpeg && !isLandscapeSize(hs.w, hs.h)) return file;
		let bmp = null;
		try {
			bmp = await createImageBitmap(file);
			if (!isLandscapeSize(bmp.width, bmp.height)) return file;
			const c = document.createElement('canvas');
			c.width = bmp.width; c.height = bmp.height;
			const ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.drawImage(bmp, 0, 0);
			const r = findPanel(ctx.getImageData(0, 0, c.width, c.height));
			if (!r.ok) { logLine('静止画「' + file.name + '」' + c.width + 'x' + c.height + ': ' + describe(r)); return file; }
			const out = cropToCanvas(c, r);
			logLine('静止画「' + file.name + '」' + c.width + 'x' + c.height + ': ' + describe(r));
			const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
			if (!blob) return file;
			const f = new File([blob], file.name, { type: 'image/png', lastModified: file.lastModified });
			f._landscape = { from: { w: c.width, h: c.height }, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, out: { w: r.outW, h: r.outH } };
			return f;
		} catch (e) {
			return file;
		} finally {
			if (bmp && bmp.close) bmp.close();
		}
	}

	/** File の配列を順に cropFile にかける（同時に何枚も開かない） */
	async function cropFiles(files) {
		const out = [];
		for (const f of files) out.push(await cropFile(f));
		return out;
	}

	/* ── 動画の出どころ（UmaVideoFrames の source）────────────── */

	// 同じ矩形（±2px）がいちばん多い組の中央値。6割以上で揃わなければ ok: false
	function consensus(list) {
		const oks = list.filter((r) => r.ok);
		if (!oks.length) return { ok: false, reason: list.length ? list[list.length - 1].reason : 'none', samples: list.length, agree: 0 };
		let best = [];
		for (const a of oks) {
			const g = oks.filter((b) => Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 && Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2);
			if (g.length > best.length) best = g;
		}
		const pick = best.slice().sort((p, q) => p.w - q.w)[best.length >> 1];
		return Object.assign({}, pick, { ok: best.length / list.length >= 0.6, reason: best.length / list.length >= 0.6 ? '' : 'unstable', samples: list.length, agree: best.length });
	}

	/** 出どころ（source）の矩形を切り出し、拡大・縮小した出どころ。drawAt は (0,0)-(dw,dh) に切り出した所だけを描く */
	function cropSource(base, rect) {
		const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
		return global.UmaVideoFrames.canvasSource({
			kind: 'landscape:' + base.kind, exact: !!base.exact, width: rect.outW, height: rect.outH, duration: base.duration,
			async draw(t, ctx, dw, dh, how) {
				const sx = dw / w, sy = dh / h;
				ctx.save();
				ctx.beginPath(); ctx.rect(0, 0, dw, dh); ctx.clip();
				setSmoothing(ctx);
				ctx.translate(-x * sx, -y * sy);
				try { await base.drawAt(t, ctx, base.width * sx, base.height * sy, null, how); } finally { ctx.restore(); }
				finishDraw(ctx, dw, dh, sx, sy);
			},
			close() { base.close(); }
		});
	}

	/**
	 * 動画の出どころ: 横長なら、長さの 10〜90% の 7か所の画でパネルを探し、揃った矩形で切り出した出どころを返す。縦長ならそのまま返す。
	 * 横長でパネルが揃わないときは code 'band'（「継承の画面が見つからない」の案内）の例外。
	 */
	async function wrapSource(src, o) {
		if (!src || !isLandscapeSize(src.width, src.height)) return src;
		const signal = (o && o.signal) || null;
		const n = 7, list = [];
		const c = document.createElement('canvas');
		c.width = src.width; c.height = src.height;
		const ctx = c.getContext('2d', { willReadFrequently: true });
		for (let k = 0; k < n; k++) {
			if (signal && signal.aborted) throw Object.assign(new Error('取り消し'), { name: 'AbortError' });
			const t = src.duration * (0.1 + 0.8 * k / (n - 1));
			ctx.clearRect(0, 0, c.width, c.height);
			await src.drawAt(t, ctx, c.width, c.height, signal);
			list.push(findPanel(ctx.getImageData(0, 0, c.width, c.height)));
		}
		const r = consensus(list);
		logLine('動画 ' + src.width + 'x' + src.height + ': ' + describe(r) + '（' + r.agree + '/' + r.samples + ' 枚で一致）');
		if (!r.ok) { const e = new Error('横画面のパネルが見つからない（' + r.reason + '）'); e.code = 'band'; throw e; }
		const out = cropSource(src, r);
		out.landscape = { from: { w: src.width, h: src.height }, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, out: { w: r.outW, h: r.outH }, agree: r.agree, samples: r.samples };
		if (src.fallback) out.fallback = src.fallback;
		if (src.codec) out.codec = src.codec;
		return out;
	}

	function describe(r) {
		if (!r.ok) return '切り出さない（' + r.reason + '）';
		return 'パネル ' + r.panel.x + ',' + r.panel.y + ' 幅' + r.panel.w + ' → 切り出し ' + r.x + ',' + r.y + ' ' + r.w + 'x' + r.h + ' → ' + r.outW + 'x' + r.outH;
	}
	function logLine(s) { try { if (typeof devGeometry !== 'undefined' && devGeometry && devGeometry.push) devGeometry.push('[横画面] ' + s); } catch (e) { /* 何もしない */ } }

	global.UmaLandscape = Object.freeze({
		VERSION: LANDSCAPE_PANEL_JS_VERSION,
		OPT: Object.freeze(Object.assign({}, OPT)),
		isLandscapeSize,
		findPanel,
		setSmoothing,
		finishDraw,
		cropToCanvas,
		headerSize,
		cropFile,
		cropFiles,
		consensus,
		cropSource,
		wrapSource
	});
})(typeof window !== 'undefined' ? window : globalThis);
