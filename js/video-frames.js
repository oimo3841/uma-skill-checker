/**
 * 画面収録（動画）から、結合の素材にするフレームを選ぶ部品（T42・動画V1-1。C-248・C-259）。
 *
 * まだどのページからも読み込まない（V1-2 で special.html につなぐ）。公開するグローバルは UmaVideoFrames の1つだけ。
 * js/common.js・js/stitch.js（凍結）の関数を「呼ぶだけ」で、中身は変えない。読み込む順は common.js → stitch.js → この部品。
 * stitch.js の stitchLog は devGeometry（各ページの開発ログ）に書くので、無いページでは空の配列を用意する。
 *
 * 流れ（T39 の ①②④⑤⑥。数字の根拠は T39 の報告 §2〜§4）:
 *  1. フレームの出どころ（source）から一定間隔（既定 0.25秒）で、横だけ 1/xs に間引いた画（縦は等倍）を取る。
 *     持つのは「本文が入りうる帯（0.30H〜0.92H）のグレー」「x=0.3W の列の色」「上の帯のグレー」だけ。
 *     真っ白・真っ黒のフレーム（シークの直後に描けていないもの）は捨てる。
 *  2. 1枚目と上の帯が近いフレームだけを残す（末尾のコントロールセンター・別の画面を外す）。
 *  3. 数枚で stitchDetectHeaderFooter を呼んで本文の帯を決める（上端は組ごとの中央値）。
 *  4. 区画の頭（親・祖1・祖2 の青いパネル）が帯の上から 0.25W 以内に来たフレームを「アンカー」にする。
 *  5. となりのフレームどうしのずれを「直前のずれの近く」だけで探して軌跡を作り（①予測つき）、
 *     軌跡から候補を決めて、選ぶ継ぎ目だけを「粗い全範囲 → 近くだけ細かく」で確かめる（⑤）。
 *     測れない組（速すぎる）は、その間だけ 1/16 秒刻みで取り直す。止まった組・戻った組は選ばない。
 *  6. 選んだ時刻だけ等倍で取り直して JPEG（品質 0.92）の File にする（④）。固定部分（本文の帯の上と下）は1枚目の画素にそろえる。
 *  7. アンカーで人ごとに分ける。各人の継ぎ目のずれ（shifts）を返すので、composePerson で組み立てられる（⑥。
 *     stitchOnePerson の並び順と継ぎ目の総当たり〔stitchResolveOrder〕を通さない）。
 *
 * 重いループはメインのまま、約 24ms ごとに await で譲る（Web Worker は使わない。おいもさんの決定 2026-10-31）。
 * opts.signal（AbortSignal）で取り消すと、次に譲ったところで name が 'AbortError' の例外で止まる。
 * opts.onProgress({ phase, done, total, ratio, persons }) に進捗を知らせる（phase: 'read' | 'select' | 'grab' | 'compose'）。
 *
 * 使い方（V1-2 の想定）:
 *   const src = await UmaVideoFrames.videoSource(file);           // File / Blob / URL
 *   try {
 *     const sel = await UmaVideoFrames.selectFrames(src, { signal, onProgress });
 *     for (const p of sel.persons) {
 *       const canvas = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, label, { signal });
 *       // canvas は stitchOnePerson の戻り値と同じ形（_stitchWarnings・_sourcePlacements・_profileHeader）
 *     }
 *   } finally { src.close(); }
 */
(function (global) {
	'use strict';

	const VIDEO_FRAMES_JS_VERSION = '2026-10-31a';

	const DEFAULTS = {
		fps: 4,              // 調べる間隔（1秒あたり）
		xs: 6,               // 調べる画の横の間引き（②）
		target: 0.45,        // 次の1枚との重なりの目安（本文の帯の高さに対する割合）
		topBand: 0.36,       // 「同じ画面か」を見る上の帯の高さ（H に対する割合）
		sameScreenMax: 12,   // 上の帯の平均の差がこれを超えたら別の画面
		stillBad: 0.02,      // ずれ ±3px で不一致がこれ未満なら止まっている
		seamYs: 2, seamXs: 2,
		fineDiv: 4,          // 速い区間の取り直しは 1/(fps×fineDiv) 秒刻み
		minShift: 20,        // これ未満しか進まないフレームは選ばない
		okBad: 0.022,        // 選ぶときの「つながる」の不一致率の上限
		predWin: 48,         // 直前のずれ±max(predWin, 半分) だけ探す（①）
		coarseYs: 8, coarseXs: 4,
		verYs: 4, verXs: 2,
		verCoarse: true,     // 選ぶ継ぎ目の確かめも粗い全範囲 → 近くだけ（⑤）
		grabType: 'image/jpeg', grabQ: 0.92,  // 取り直しの静止画（④。おいもさんの決定 2026-10-31）
		normalizeFixed: true,
		// 人の単位の警告に使う「確かでない継ぎ目」（T42 で見直した値。報告の「しきい値の見直し」）
		warnBadRate: 0.05,   // 選んだずれの不一致率がこれ以上
		warnSecondRatio: 1.5, // 離れた位置の次点との比がこれ未満（似た行が続いて決め手が無い）
		blankRatio: 0.985,   // 真っ白（250 以上）または真っ黒（5 以下）の画素がこの割合以上なら捨てる
		grabRetry: 3,        // 取り直しで真っ白・真っ黒が出たら、少しずらして取り直す回数
		maxPicks: 120,
		sliceMs: 24,
		labels: null         // 人の名前（例 ['親', '祖1', '祖2']）。無ければ「人1」…
	};

	/* ── 取り消しと譲り ─────────────────────────────── */

	function abortError() {
		try { return new DOMException('取り消しました', 'AbortError'); } catch (e) { const er = new Error('取り消しました'); er.name = 'AbortError'; return er; }
	}
	function isAbortError(e) { return !!e && e.name === 'AbortError'; }
	function framesError(code, msg) { const e = new Error(msg); e.code = code; return e; }

	// setTimeout(0) は裏のタブで 1秒に間引かれるので、MessageChannel で譲る
	let channel = null;
	const waiters = [];
	function yieldNow() {
		if (typeof MessageChannel === 'undefined') return new Promise((r) => setTimeout(r, 0));
		if (!channel) {
			channel = new MessageChannel();
			channel.port1.onmessage = () => { const r = waiters.shift(); if (r) r(); };
		}
		return new Promise((r) => { waiters.push(r); channel.port2.postMessage(0); });
	}
	function makeYielder(signal, sliceMs) {
		let last = performance.now();
		return async function (force) {
			if (signal && signal.aborted) throw abortError();
			if (force || performance.now() - last >= sliceMs) {
				await yieldNow();
				last = performance.now();
				if (signal && signal.aborted) throw abortError();
			}
		};
	}

	/* ── フレームの出どころ ─────────────────────────────
	 * source = { kind, width, height, duration, drawAt(t, ctx, dw, dh, signal) → Promise, close() }
	 * drawAt は時刻 t の画を ctx の (0,0)-(dw,dh) に縮めて描く。動画ファイル・作り物の画・
	 * 将来の PC のウィンドウの取り込み（録った映像を時刻で引ける形にして渡す）を同じ形で差し替える。 */

	function seekVideo(v, t, signal) {
		return new Promise((res, rej) => {
			if (signal && signal.aborted) { rej(abortError()); return; }
			if (Math.abs(v.currentTime - t) < 1e-6 && !v.seeking && v.readyState >= 2) { res(); return; }
			let timer = null;
			const done = () => { cleanup(); res(); };
			const fail = () => { cleanup(); rej(framesError('decode', '動画を読めない')); };
			const onAbort = () => { cleanup(); rej(abortError()); };
			function cleanup() {
				v.removeEventListener('seeked', done); v.removeEventListener('error', fail);
				if (signal) signal.removeEventListener('abort', onAbort);
				clearTimeout(timer);
			}
			v.addEventListener('seeked', done);
			v.addEventListener('error', fail);
			if (signal) signal.addEventListener('abort', onAbort);
			timer = setTimeout(() => { cleanup(); rej(framesError('seek-timeout', 'シークが終わらない: ' + t)); }, 20000);
			v.currentTime = t;
		});
	}

	/** 動画ファイル（File / Blob / URL の文字列）から。close() で後片付け */
	async function videoSource(input) {
		const own = typeof input !== 'string';
		const url = own ? URL.createObjectURL(input) : input;
		const v = document.createElement('video');
		v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
		const close = () => { try { v.removeAttribute('src'); v.load(); } catch (e) { /* 何もしない */ } if (own) URL.revokeObjectURL(url); };
		try {
			await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(framesError('decode', '動画を読めない')); });
			if (!v.videoWidth || !v.videoHeight) throw framesError('no-video-track', '映像を復号できない');
			let D = v.duration;
			// MediaRecorder の WebM などは長さが Infinity のことがある。末尾までシークすると分かる
			if (!isFinite(D)) { await seekVideo(v, 1e7); D = v.duration; await seekVideo(v, 0); }
			if (!isFinite(D) || D <= 0) throw framesError('no-duration', '動画の長さが分からない');
			return {
				kind: 'video', width: v.videoWidth, height: v.videoHeight, duration: D,
				async drawAt(t, ctx, dw, dh, signal) { await seekVideo(v, t, signal); ctx.drawImage(v, 0, 0, dw, dh); },
				close
			};
		} catch (e) { close(); throw e; }
	}

	/** 作り物の画（検査）など: draw(t, ctx, dw, dh) が時刻 t の画を描く */
	function canvasSource(spec) {
		return {
			kind: spec.kind || 'canvas', width: spec.width, height: spec.height, duration: spec.duration,
			async drawAt(t, ctx, dw, dh, signal) {
				if (signal && signal.aborted) throw abortError();
				await spec.draw(t, ctx, dw, dh);
			},
			close() { if (spec.close) spec.close(); }
		};
	}

	/* ── 画素の小道具 ─────────────────────────────── */

	function toGray(d) {
		const g = new Uint8Array(d.length / 4);
		for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
		return g;
	}
	function meanAbs(a, b) {
		let s = 0;
		for (let i = 0; i < a.length; i += 3) s += Math.abs(a[i] - b[i]);
		return s / Math.ceil(a.length / 3);
	}
	/** グレーの配列（いくつでも）が、ほぼ真っ白か真っ黒か */
	function isBlankGray(arrays, ratio) {
		let tot = 0, white = 0, black = 0;
		for (const g of arrays) {
			for (let i = 0; i < g.length; i += 7) { const v = g[i]; tot++; if (v >= 250) white++; else if (v <= 5) black++; }
		}
		return tot > 0 && (white / tot >= ratio || black / tot >= ratio);
	}
	/** 等倍の canvas の32行を読んで、ほぼ真っ白か真っ黒か */
	function isBlankCanvas(ctx, W, H, ratio) {
		const rows = [];
		for (let k = 0; k < 32; k++) {
			const y = Math.min(H - 1, Math.round((k + 0.5) * H / 32));
			rows.push(toGray(ctx.getImageData(0, y, W, 1).data));
		}
		return isBlankGray(rows, ratio);
	}
	// ずれ dy（-3〜3）のうち最小の不一致率。止まり際の1〜2pxの戻りを「止まっている」に入れる
	function badNear0(a, b) {
		const w = a.w, h = a.h;
		let best = 1;
		for (let dy = -3; dy <= 3; dy++) {
			let bad = 0, tot = 0;
			for (let y = 4; y < h - 4; y += 2) {
				const ra = (y + dy) * w, rb = y * w;
				for (let x = 0; x < w; x += 2) { if (Math.abs(a.gray[ra + x] - b.gray[rb + x]) > 24) bad++; tot++; }
			}
			best = Math.min(best, bad / tot);
		}
		return best;
	}
	const isBlue = (r, g, b) => b > 200 && g > 140 && g < 220 && r < 120;
	// 列の色から、青が20行以上続く区間の上端（帯の中の y）を返す
	function blueStarts(col, y0, y1) {
		const out = [];
		let run = 0;
		for (let y = y0; y < y1; y++) {
			const p = y * 3;
			if (isBlue(col[p], col[p + 1], col[p + 2])) { run++; if (run === 20) out.push(y - 19); } else run = 0;
		}
		return out;
	}
	// 範囲 [d0, d1] のずれだけを stitch と同じ数え方（差 > 24 を食い違い・白紙どうしは無効）で調べる
	function scanRange(a, b, d0, d1, ys, xs) {
		const w = a.w, h = a.h, A = a.gray, B = b.gray;
		let best = -1, bestBad = Infinity;
		for (let d = Math.max(1, d0); d <= Math.min(h - 60, d1); d++) {
			const rows = h - d;
			let bad = 0, tot = 0, ink = 0;
			for (let y = 0; y < rows; y += ys) {
				const ra = (y + d) * w, rb = y * w;
				for (let x = 0; x < w; x += xs) {
					const p = A[ra + x], q = B[rb + x];
					if (p < 240 || q < 240) ink++;
					if (Math.abs(p - q) > 24) bad++;
					tot++;
				}
			}
			if (tot === 0 || ink < tot * 0.05) continue;
			const rate = bad / tot;
			if (rate < bestBad) { bestBad = rate; best = d; }
		}
		return { shift: best, badRate: bestBad };
	}
	// 全範囲を粗く（縦 ys・横 xs おき）。確かさは stitch と同じ基準（不一致 3% 未満・±40 の外の次点との比 2 以上）
	function coarseRatio(c) { return isFinite(c.secondBadRate) ? (c.badRate > 0 ? c.secondBadRate / c.badRate : 99) : 99; }
	function coarseScan(a, b, ys, xs) {
		const w = a.w, h = a.h, A = a.gray, B = b.gray;
		const maxShift = h - 60;
		const rates = new Float64Array(Math.max(1, maxShift + 1)).fill(Infinity);
		for (let d = 1; d <= maxShift; d++) {
			let bad = 0, tot = 0, ink = 0;
			for (let y = 0; y < h - d; y += ys) {
				const ra = (y + d) * w, rb = y * w;
				for (let x = 0; x < w; x += xs) {
					const p = A[ra + x], q = B[rb + x];
					if (p < 240 || q < 240) ink++;
					if (Math.abs(p - q) > 24) bad++;
					tot++;
				}
			}
			if (tot && ink >= tot * 0.05) rates[d] = bad / tot;
		}
		let shift = -1, best = Infinity;
		for (let d = 1; d <= maxShift; d++) if (rates[d] < best) { best = rates[d]; shift = d; }
		let second = Infinity;
		for (let d = 1; d <= maxShift; d++) if (Math.abs(d - shift) > 40 && rates[d] < second) second = rates[d];
		return { shift, badRate: best, secondBadRate: second, confident: shift > 0 && best < 0.03 && (!isFinite(second) || second / best >= 2) };
	}

	/* ── 選ぶ ─────────────────────────────── */

	/**
	 * source からフレームを選び、人ごとに分ける。
	 * 戻り値: {
	 *   video: { W, H, D }, header: { headerEnd, footer, contentH },
	 *   anchors: [{ t, y }],                  // 区画の頭の時刻と、帯の上端からの位置（px）
	 *   picks: [t...], seams: [{ from, to, shift, overlap, badRate, secondRatio, weak, uncertain, anchor }],
	 *   files: [File...],                      // 選んだ時刻の等倍の静止画（picks と同じ順）
	 *   persons: [{ label, startT, anchorY, frameIndexes, files, times, shifts, weak, uncertain }],
	 *   stats: { sampled, blankSkipped, sameScreen, dropped, densified, stills, backs, grabRetries, ... }, tm: { ...ms }
	 * }
	 * persons[i].shifts[k] は files[k] → files[k+1] のスクロール量（px）。uncertain[k] が真の継ぎ目は人の単位の警告に使う。
	 */
	async function selectFrames(source, userOpts) {
		const opts = Object.assign({}, DEFAULTS, userOpts || {});
		const signal = opts.signal || null;
		const pause = makeYielder(signal, opts.sliceMs);
		const progress = (phase, done, total, extra) => {
			if (typeof opts.onProgress !== 'function') return;
			const w = { read: [0, 0.45], select: [0.45, 0.3], grab: [0.75, 0.25] }[phase] || [0, 1];
			const r = total > 0 ? Math.min(1, done / total) : 0;
			try { opts.onProgress(Object.assign({ phase, done, total, ratio: +(w[0] + w[1] * r).toFixed(4) }, extra || {})); } catch (e) { /* 知らせる側の失敗は無視 */ }
		};
		const T0 = performance.now();
		const tm = {};
		const W = source.width, H = source.height, D = source.duration;
		if (!W || !H || !(D > 0)) throw framesError('no-video-track', '映像の大きさか長さが分からない');
		const sw = Math.max(16, Math.round(W / opts.xs));
		const bandY0 = Math.round(H * 0.30), bandY1 = Math.round(H * 0.92);
		const colX = Math.floor(sw * 0.3);

		// 1. 取る
		const sc = document.createElement('canvas'); sc.width = sw; sc.height = H;
		const sctx = sc.getContext('2d', { willReadFrequently: true });
		const topY = Math.round(H * 0.02), topH = Math.round(H * opts.topBand);
		const step = 1 / opts.fps;
		const times = [];
		for (let t = 0; t < D - 0.05; t += step) times.push(+t.toFixed(3));
		const probeAt = new Set();
		for (let k = 0; k < 8; k++) probeAt.add(Math.round(k * (times.length * 0.8 - 1) / 7));
		const small = [];
		let blankSkipped = 0;
		for (let n = 0; n < times.length; n++) {
			await pause();
			await source.drawAt(times[n], sctx, sw, H, signal);
			const band = sctx.getImageData(0, bandY0, sw, bandY1 - bandY0).data;
			const top = toGray(sctx.getImageData(0, topY, sw, topH).data);
			const bandGray = toGray(band);
			if (isBlankGray([top, bandGray], opts.blankRatio)) {
				blankSkipped++;
				if (probeAt.has(n)) probeAt.add(n + 1);
				progress('read', n + 1, times.length);
				continue;
			}
			const col = new Uint8Array((bandY1 - bandY0) * 3);
			for (let y = 0; y < bandY1 - bandY0; y++) { const p = (y * sw + colX) * 4; col[y * 3] = band[p]; col[y * 3 + 1] = band[p + 1]; col[y * 3 + 2] = band[p + 2]; }
			let probe = null;
			if (probeAt.has(n)) { probe = document.createElement('canvas'); probe.width = sw; probe.height = H; probe.getContext('2d', { willReadFrequently: true }).drawImage(sc, 0, 0); }
			small.push({ t: times[n], top, band: bandGray, col, probe });
			progress('read', n + 1, times.length);
		}
		tm.sampleMs = performance.now() - T0;
		if (small.length < 2) throw framesError('too-few', '使えるフレームが少なすぎる');

		// 2. 同じ画面のフレームだけ
		const t1 = performance.now();
		const same = [];
		for (const f of small) {
			if (meanAbs(small[0].top, f.top) > opts.sameScreenMax) break;
			same.push(f);
		}
		const dropped = small.length - same.length;

		// 3. 本文の帯
		const probes = same.filter((f) => f.probe).map((f) => f.probe);
		if (probes.length < 2) throw framesError('too-few', '使えるフレームが少なすぎる');
		const hf = stitchDetectHeaderFooter(probes, '動画の解析');
		// 組ごとの「最初に差が出る行」。stitch は最小を取るので、演出が1組で上の方に出ると上端が上がる。解析側は中央値を使う
		const firsts = [];
		for (let k = 0; k < probes.length - 1; k++) {
			const d = stitchRowDiffSignal(probes[k], probes[k + 1]);
			let first = -1;
			for (let y = 0; y < d.length; y++) if (d[y] > 5) { first = y; break; }
			if (first >= 0) firsts.push(first);
		}
		const sorted = firsts.slice().sort((p, q) => p - q);
		if (sorted.length) hf.headerEnd = sorted[Math.floor(sorted.length / 2)];
		const footer = stitchTrimFixedFooterChrome(probes, hf.headerEnd, hf.footerStart, '動画の解析');
		const hE = hf.headerEnd, cH = footer - hE;
		if (hE < bandY0 || footer > bandY1 || cH < 200) throw framesError('band', '本文の帯が想定の範囲の外: ' + hE + '〜' + footer);
		const mx = Math.floor(sw * 0.1);
		const pw = sw - mx * 2;
		for (const f of same) {
			const g = new Uint8Array(pw * cH);
			for (let y = 0; y < cH; y++) g.set(f.band.subarray((hE - bandY0 + y) * sw + mx, (hE - bandY0 + y) * sw + mx + pw), y * pw);
			f.plane = { gray: g, w: pw, h: cH };
			// 区画の頭（青いパネル）が帯の上端から 8〜0.25W-8 にあり、それより上に青が無い
			const bs = blueStarts(f.col, hE - bandY0, footer - bandY0).map((y) => y - (hE - bandY0));
			f.anchorY = bs.length && bs[0] >= 8 && bs[0] <= W * 0.25 - 8 ? bs[0] : null;
			f.band = null; f.probe = null; f.top = null; f.col = null;
		}
		for (const f of small) { f.band = null; f.probe = null; }
		// アンカーは「続けて条件を満たすフレームの中で、頭がいちばん上に近い1枚」。1枚目から続く区間（親の頭が見えたまま）は 0 番で代表する
		const anchors = [0];
		let runBest = -1, firstRun = same[0].anchorY != null;
		for (let n = 1; n < same.length; n++) {
			const f = same[n];
			if (f.anchorY != null) {
				if (!firstRun && (runBest < 0 || f.anchorY < same[runBest].anchorY)) runBest = n;
			} else {
				firstRun = false;
				if (runBest >= 0) { anchors.push(runBest); runBest = -1; }
			}
		}
		if (runBest >= 0) anchors.push(runBest);
		const anchorEntries = anchors.map((n) => same[n]);
		const anchorSet = new Set(anchorEntries);

		// 速い区間だけ細かく取り直す。縮小画・本文のグレーを同じ形で作る（真っ白・真っ黒なら null）
		async function sampleEntry(t) {
			await pause();
			await source.drawAt(t, sctx, sw, H, signal);
			const band = toGray(sctx.getImageData(0, hE, sw, cH).data);
			if (isBlankGray([band], opts.blankRatio)) { blankSkipped++; return null; }
			const g = new Uint8Array(pw * cH);
			for (let y = 0; y < cH; y++) g.set(band.subarray(y * sw + mx, y * sw + mx + pw), y * pw);
			return { t: +t.toFixed(4), plane: { gray: g, w: pw, h: cH }, fine: true };
		}
		const fine = step / opts.fineDiv;
		let densified = 0;
		async function densify(key, f) {
			if (f.t - key.t <= fine + 1e-6) return false;
			const k0 = same.indexOf(key), k1 = same.indexOf(f);
			const add = [];
			for (let t = key.t + fine; t < f.t - 1e-6; t += fine) {
				if (same.slice(k0, k1).some((e) => Math.abs(e.t - t) < fine / 2)) continue;
				const e = await sampleEntry(t);
				if (e) add.push(e);
			}
			if (!add.length) return false;
			same.splice(k1, 0, ...add);
			same.sort((p, q) => p.t - q.t);
			densified += add.length;
			return true;
		}

		const ok = (r) => r.confident && r.badRate < opts.okBad;
		const ratioOf = (r) => (r.ratio != null ? r.ratio : (isFinite(r.secondBadRate) && r.badRate > 0 ? r.secondBadRate / r.badRate : Infinity));
		// 人の単位の警告に使う「確かでない継ぎ目」（選ぶ判定の ok とは別。選び方は変えない）
		const uncertainOf = (r) => {
			if (!r || !(r.shift > 0)) return true;
			if (!isFinite(r.badRate) || r.badRate >= opts.warnBadRate) return true;
			if (ratioOf(r) < opts.warnSecondRatio) return true;
			return false;
		};
		const picks = [same[0]];
		const seams = [];
		const pushPick = (from, to, r, weak) => {
			picks.push(to);
			seams.push({
				from: from.t, to: to.t,
				shift: r && r.shift > 0 ? r.shift : null, overlap: r ? r.overlap : null,
				badRate: r && isFinite(r.badRate) ? +r.badRate.toFixed(4) : null,
				secondRatio: r ? +Math.min(99, ratioOf(r)).toFixed(2) : null,
				weak: !!weak, uncertain: uncertainOf(r), anchor: anchorSet.has(to)
			});
		};
		let stills = 0, backs = 0, local = 0, localFallback = 0, coarse = 0, verifies = 0;
		// となりどうしのずれ（正＝下へスクロール・0＝止まっている・負＝上へ戻った・null＝測れない）
		function stepShift(a, b, prev) {
			if (badNear0(a.plane, b.plane) < opts.stillBad) { stills++; return 0; }
			if (prev != null && prev > 0) {
				const win = Math.max(opts.predWin, Math.round(prev * 0.5));
				const r = scanRange(a.plane, b.plane, prev - win, prev + win, opts.seamYs, opts.seamXs); local++;
				if (r.shift > 0 && r.badRate < opts.okBad && r.shift > prev - win + 1 && r.shift < prev + win - 1) return r.shift;
				localFallback++;
			}
			// 粗い全範囲 → 当たりの近くだけ細かく
			const c = coarseScan(a.plane, b.plane, opts.coarseYs, opts.coarseXs); coarse++;
			if (c.confident) {
				const r = scanRange(a.plane, b.plane, c.shift - opts.coarseYs * 2, c.shift + opts.coarseYs * 2, opts.seamYs, opts.seamXs); local++;
				if (r.shift > 0 && r.badRate < opts.okBad) return r.shift;
			}
			const cb = coarseScan(b.plane, a.plane, opts.coarseYs, opts.coarseXs); coarse++;
			if (cb.confident) { backs++; return -cb.shift; }
			return null;
		}
		// 選ぶ継ぎ目の確かめ。verCoarse のときは粗い全範囲（次点との比を見る）＋当たりの近くだけ細かく
		function verifySeam(a, b) {
			verifies++;
			if (!opts.verCoarse) return stitchMeasureSeam(a, b, opts.verYs, opts.verXs);
			const c = coarseScan(a, b, opts.coarseYs, opts.coarseXs); coarse++;
			if (!c.confident) return { shift: c.shift, overlap: c.shift > 0 ? cH - c.shift : 60, badRate: c.badRate, ratio: coarseRatio(c), confident: false };
			const r = scanRange(a, b, c.shift - opts.coarseYs * 2, c.shift + opts.coarseYs * 2, opts.seamYs, opts.seamXs); local++;
			// 次点との比は粗い全範囲の値（同じ間引きどうしで比べる）
			return { shift: r.shift, overlap: cH - r.shift, badRate: r.badRate, ratio: coarseRatio(c), confident: r.shift > 0 && r.badRate < 0.03 };
		}
		// 軌跡を作る。測れない組（速すぎる）は間を細かく取り直してから測り直す
		const pos = new Map();
		pos.set(same[0], 0);
		let prevShift = null, guard = 0;
		for (let n = 1; n < same.length; n++) {
			if (++guard > 5000) throw framesError('track', '軌跡を作れない');
			await pause();
			progress('select', Math.min(n, same.length), same.length * 2);
			const a = same[n - 1], b = same[n];
			const s = stepShift(a, b, prevShift);
			if (s == null) {
				if (await densify(a, b)) { n--; continue; } // a の次から測り直す
				pos.set(b, pos.get(a) + cH); // 1/16 秒でもつながらない。重なりなしとして進む（確かめで弱い継ぎ目になる）
				prevShift = null;
				continue;
			}
			pos.set(b, pos.get(a) + s);
			prevShift = s > 0 ? s : null;
		}
		// 軌跡から選ぶ。アンカーは必ず選ぶ。候補は遠いほうから確かめ、確かな最初の1枚を選ぶ
		const idx = (f) => same.indexOf(f);
		let key = same[0];
		guard = 0;
		while (true) {
			if (picks.length > opts.maxPicks || ++guard > 1000) throw framesError('too-many', '選ぶ枚数が多すぎる');
			await pause();
			progress('select', same.length + idx(key), same.length * 2, { persons: anchorEntries.filter((a) => picks.includes(a)).length });
			const k = idx(key), pk = pos.get(key);
			let nextA = -1;
			for (let j = k + 1; j < same.length; j++) if (anchorSet.has(same[j])) { nextA = j; break; }
			const end = nextA >= 0 ? nextA : same.length - 1;
			// アンカー: 届くなら確かめて選ぶ
			if (nextA >= 0) {
				const fa = same[nextA];
				const gap = pos.get(fa) - pk;
				if (gap < opts.minShift && picks.length > 1 && !anchorSet.has(key)) {
					// 直前の1枚とほぼ同じ位置 → 直前の1枚をアンカーに置き換える（その前の1枚からつながるときだけ）
					const prev = picks[picks.length - 2];
					const r0 = verifySeam(prev.plane, fa.plane);
					if (ok(r0)) { picks.pop(); seams.pop(); pushPick(prev, fa, r0); key = fa; continue; }
					const r1 = verifySeam(key.plane, fa.plane);
					pushPick(key, fa, r1, !ok(r1)); key = fa;
					continue;
				}
				if (cH - gap >= opts.target * cH * 0.5 || gap < opts.minShift) {
					const r = verifySeam(key.plane, fa.plane);
					if (ok(r)) { pushPick(key, fa, r); key = fa; continue; }
				}
			}
			// 前に進む候補（位置が minShift 以上先・予測の重なりが target 以上）を遠いほうから
			const cands = [];
			for (let j = k + 1; j <= end; j++) {
				const g = pos.get(same[j]) - pk;
				if (g >= opts.minShift && cH - g >= opts.target * cH) cands.push(j);
			}
			let picked = false;
			for (let c = cands.length - 1; c >= 0; c--) {
				const f = same[cands[c]];
				if (nextA >= 0 && cands[c] === nextA) continue;
				await pause();
				const r = verifySeam(key.plane, f.plane);
				if (ok(r)) { pushPick(key, f, r); key = f; picked = true; break; }
			}
			if (picked) continue;
			// 候補が無い: 終わり（この先に前へ進むフレームが無い）か、次のフレームが遠すぎる
			let further = -1;
			for (let j = k + 1; j <= end; j++) if (pos.get(same[j]) - pk >= opts.minShift) { further = j; break; }
			if (further < 0) {
				if (nextA >= 0) { const fa = same[nextA]; const r = verifySeam(key.plane, fa.plane); pushPick(key, fa, r, !ok(r)); key = fa; continue; }
				break;
			}
			const f = same[further];
			if (f.t - key.t > fine + 1e-6 && await densify(key, f)) {
				// 細かく取り直したフレームの位置を補う（key から測る）
				for (let j = idx(key) + 1; j < idx(f); j++) {
					const e = same[j];
					if (pos.has(e)) continue;
					await pause();
					const r = verifySeam(key.plane, e.plane);
					pos.set(e, ok(r) ? pk + r.shift : pk + cH);
				}
				continue;
			}
			const r = verifySeam(key.plane, f.plane);
			pushPick(key, f, r, !ok(r)); key = f;
		}
		tm.selectMs = performance.now() - t1;
		progress('select', 1, 1, { persons: anchorEntries.length });

		// 6. 等倍で取り直す
		const t2 = performance.now();
		const full = document.createElement('canvas'); full.width = W; full.height = H;
		const fctx = full.getContext('2d', { willReadFrequently: true });
		const files = [];
		// 固定部分（本文の帯より上・下）は1枚目の画素にそろえる。動画は圧縮の差で固定部分の1行だけが変わることがあり、
		// stitch の上端・下端の検出（全組の最小・最大を取る）がそれに引きずられる（Exam の動画で上端 860 行に化けた）
		let fixedTop = null, fixedBottom = null, grabRetries = 0;
		const keepTop = Math.max(0, hE - 4), keepBottomY = Math.min(H, footer + 4);
		const ext = opts.grabType === 'image/png' ? '.png' : '.jpg';
		for (let i = 0; i < picks.length; i++) {
			await pause();
			const p = picks[i];
			let t = p.t, tries = 0;
			while (true) {
				await source.drawAt(t, fctx, W, H, signal);
				if (!isBlankCanvas(fctx, W, H, opts.blankRatio)) break;
				// シークの直後に描けていない（真っ白・真っ黒）。同じ時刻をもう一度 → 少しずらして取り直す
				if (++tries > opts.grabRetry) throw framesError('blank-grab', '動画のフレームを描けない: ' + p.t);
				grabRetries++;
				t = tries === 1 ? p.t : Math.min(D - 0.01, p.t + (tries - 1) / 120);
			}
			if (opts.normalizeFixed) {
				if (!fixedTop) { fixedTop = fctx.getImageData(0, 0, W, keepTop); fixedBottom = fctx.getImageData(0, keepBottomY, W, H - keepBottomY); }
				else { fctx.putImageData(fixedTop, 0, 0); fctx.putImageData(fixedBottom, 0, keepBottomY); }
			}
			const blob = await new Promise((res) => full.toBlob(res, opts.grabType, opts.grabQ));
			if (!blob) throw framesError('encode', '静止画にできない');
			files.push(new File([blob], 'frame-' + String(Math.round(p.t * 1000)).padStart(6, '0') + ext, { type: opts.grabType }));
			progress('grab', i + 1, picks.length);
		}
		full.width = full.height = 0; sc.width = sc.height = 0;
		tm.grabMs = performance.now() - t2;

		// 7. 人ごと: アンカー k からアンカー k+1 まで（次の人の1枚目も入れる。末尾は stitch が次の青いパネルの手前で切る）
		const persons = anchorEntries.map((a, j) => {
			const s = picks.indexOf(a), e = j + 1 < anchorEntries.length ? picks.indexOf(anchorEntries[j + 1]) : picks.length - 1;
			const fi = [];
			for (let k = s; k <= e; k++) fi.push(k);
			const sm = fi.slice(0, -1).map((k) => seams[k]);
			return {
				label: opts.labels && opts.labels[j] ? opts.labels[j] : '人' + (j + 1),
				startT: a.t, anchorY: a.anchorY,
				frameIndexes: fi,
				files: fi.map((k) => files[k]),
				times: fi.map((k) => picks[k].t),
				shifts: sm.map((x) => (x.overlap != null ? cH - x.overlap : cH)),
				weak: sm.map((x) => x.weak),
				uncertain: sm.map((x) => x.uncertain)
			};
		});
		tm.totalMs = performance.now() - T0;
		return {
			version: VIDEO_FRAMES_JS_VERSION,
			video: { W, H, D }, xs: opts.xs, fps: opts.fps,
			header: { headerEnd: hE, footer, contentH: cH },
			anchors: anchorEntries.map((a) => ({ t: a.t, y: a.anchorY })),
			picks: picks.map((p) => p.t), seams, files, persons,
			stats: { sampled: times.length, blankSkipped, sameScreen: same.length, dropped, densified, stills, backs, local, localFallback, coarse, verifies, grabRetries },
			tm
		};
	}

	/* ── 組み立て（⑥） ─────────────────────────────── */

	/**
	 * 選ぶ側で分かっているずれ（shifts）を使って1人分を組み立てる。戻り値は stitchOnePerson と同じ形の Canvas
	 * （_stitchWarnings・_sourcePlacements・_profileHeader）。stitchOnePerson の「並び順と継ぎ目を総当たりで決める」所
	 * （stitchResolveOrder）だけを飛ばし、それ以外（扱える画像かの確かめ・帯の検出・先頭のパネル・キャラクターの情報の欄・
	 * 末尾の切り方）は stitch.js の関数をそのまま呼ぶ。
	 * shifts[i] は files[i] → files[i+1] のスクロール量（px）。uncertain[i] が真の継ぎ目は _stitchWarnings に入れる。
	 */
	async function composePerson(files, shifts, uncertain, groupLabel, o) {
		o = o || {};
		const pause = makeYielder(o.signal || null, o.sliceMs || DEFAULTS.sliceMs);
		if (!files || files.length === 0) return null;
		if (files.length === 1) {
			stitchLog(groupLabel + ': 画像が1枚のみ（結合には2枚以上が必要）');
			throw new Error(stitchBuildAbortNotice('single', groupLabel, []));
		}
		if (!shifts || shifts.length !== files.length - 1) throw framesError('shifts', 'ずれの数が画像の数と合わない');
		stitchLog(groupLabel + ': ' + files.length + '枚を読み込みます（動画から・選ぶ側のずれで組み立て）...');
		const canvases = [];
		for (let i = 0; i < files.length; i++) {
			await pause();
			canvases.push(stitchImgToCanvas(await loadImage(files[i])));
			if (typeof o.onProgress === 'function') { try { o.onProgress({ phase: 'compose', done: i + 1, total: files.length, ratio: +((i + 1) / files.length * 0.8).toFixed(4) }); } catch (e) { /* 無視 */ } }
		}
		const mismatches = [];
		for (let i = 0; i < canvases.length; i++) {
			const check = stitchCheckStandardScreenshot(canvases[i]);
			if (check.ok) continue;
			mismatches.push({ kind: stitchClassifyScreenshotMismatch(check.w, check.aspect), name: stitchFileName(files, i) });
		}
		if (mismatches.length) {
			const kind = mismatches[0].kind;
			throw new Error(stitchBuildAbortNotice(kind, groupLabel, mismatches.filter((m) => m.kind === kind).map((m) => m.name)));
		}
		const w0 = canvases[0].width;
		for (let i = 1; i < canvases.length; i++) {
			if (canvases[i].width !== w0) throw new Error(stitchBuildAbortNotice('width-mismatch', groupLabel, [stitchFileName(files, i)]));
		}
		await pause();
		const hf = stitchDetectHeaderFooter(canvases, groupLabel);
		const headerEnd = hf.headerEnd;
		await pause();
		const footerStart = stitchTrimFixedFooterChrome(canvases, headerEnd, hf.footerStart, groupLabel);
		const contentHeight = footerStart - headerEnd;
		stitchLog(groupLabel + ': ヘッダー=行0〜' + (headerEnd - 1) + '(除外), スクロール領域=行' + headerEnd + '〜' + (footerStart - 1));
		const overlaps = shifts.map((s) => Math.max(0, Math.min(contentHeight, contentHeight - s)));
		const warnings = [];
		(uncertain || []).forEach((u, i) => {
			if (!u) return;
			const msg = groupLabel + ': 画像' + i + '→' + (i + 1) + 'の継ぎ目は一致度が低く、結合位置がズレている可能性があります。';
			stitchLog('⚠ ' + msg);
			warnings.push(msg);
		});
		let totalContentHeight = contentHeight;
		for (const ov of overlaps) totalContentHeight += contentHeight - ov;
		const firstPanelTop = stitchDetectFirstSkillPanelTop(canvases[0], headerEnd);
		let skipFirst = Math.max(0, firstPanelTop - headerEnd);
		const profile = stitchDetectProfileHeader(canvases[0], headerEnd);
		let profileHeight = 0;
		if (profile.kept) { skipFirst = profile.top - headerEnd; profileHeight = firstPanelTop - profile.top; }
		const profileInfo = { kept: profile.kept, ratio: profile.ratio, height: profileHeight };
		const out = document.createElement('canvas');
		out.width = w0;
		out.height = totalContentHeight - skipFirst;
		const octx = out.getContext('2d');
		const placements = [];
		let cursorY = 0;
		const firstSrcY = headerEnd + skipFirst, firstDrawH = contentHeight - skipFirst;
		octx.drawImage(canvases[0], 0, firstSrcY, w0, firstDrawH, 0, 0, w0, firstDrawH);
		placements.push({ fileIndex: 0, srcY0: firstSrcY, srcY1: firstSrcY + firstDrawH, outY0: 0 });
		cursorY += firstDrawH;
		for (let i = 1; i < canvases.length; i++) {
			const ov = overlaps[i - 1];
			const drawH = contentHeight - ov;
			if (drawH > 0) octx.drawImage(canvases[i], 0, headerEnd + ov, w0, drawH, 0, cursorY, w0, drawH);
			placements.push({ fileIndex: i, srcY0: headerEnd + ov, srcY1: headerEnd + ov + drawH, outY0: cursorY });
			cursorY += drawH;
		}
		await pause();
		const cutY = stitchFindTrailingCutY(out, Math.round(w0 * 0.15) + profileHeight);
		let res = out;
		let pl = placements;
		if (cutY < out.height) {
			res = document.createElement('canvas');
			res.width = w0; res.height = cutY;
			res.getContext('2d').drawImage(out, 0, 0, w0, cutY, 0, 0, w0, cutY);
			pl = stitchClipPlacements(placements, cutY);
			out.width = out.height = 0;
		}
		for (const c of canvases) { c.width = c.height = 0; }
		stitchLog(groupLabel + ': 縦結合完了（動画から）: ' + w0 + ' x ' + res.height);
		res._stitchWarnings = warnings;
		res._sourcePlacements = pl;
		res._profileHeader = profileInfo;
		if (typeof o.onProgress === 'function') { try { o.onProgress({ phase: 'compose', done: files.length, total: files.length, ratio: 1 }); } catch (e) { /* 無視 */ } }
		return res;
	}

	// stitch.js の stitchLog は devGeometry に書く。開発ログの無いページでも落ちないように空の配列を用意する
	if (typeof devGeometry === 'undefined') global.devGeometry = [];

	global.UmaVideoFrames = Object.freeze({
		VERSION: VIDEO_FRAMES_JS_VERSION,
		DEFAULTS: Object.freeze(Object.assign({}, DEFAULTS)),
		videoSource,
		canvasSource,
		selectFrames,
		composePerson,
		isAbortError
	});
})(typeof window !== 'undefined' ? window : globalThis);
