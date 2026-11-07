/* PC のウィンドウの取り込み（T105）。special.html の③の動画モードの「ウィンドウから取り込む」が使う。
 * ゲームのウィンドウの絵を画面共有で読み、枠を除いて切り取り、圧縮して、今の動画と同じ流れ（出どころ → selectFrames → composePerson）へ渡す。
 * ゲームには干渉しない（読むだけ。操作・書き込み・注入をしない）。映像はこの PC の中だけで使い、外へ送らない。
 * 依存: js/video-frames.js（UmaVideoFrames）・js/stitch.js（stitchRowDiffSignal）の後に読む。試しのページ lab/pc-capture-diag.html もこの部品を使う。 */
(function () {
	'use strict';
	const PC_CAPTURE_JS_VERSION = '2026-11-07b';

	// 取り込みの入口を出すか（決定 252・325。lab/pc-capture-mock.html は同じ文）
	// 取り込みに要る機能があり、スマホでないときに出す。タッチパネルの有無では決めない（Surface はマウスをつないでも「タッチだけ」と判定された）
	function shouldOffer() {
		const nav = navigator, md = nav.mediaDevices;
		if (!(md && typeof md.getDisplayMedia === 'function')) return { offer: false, why: 'getDisplayMedia なし' };
		if (typeof MediaStreamTrackProcessor === 'undefined' || typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return { offer: false, why: '必要な API なし' };
		const uad = nav.userAgentData;
		if (uad && uad.mobile) return { offer: false, why: 'userAgentData.mobile' };
		return { offer: true, why: '' };
	}
	/* ── ゲームの画面の領域を見つける ─────────────────────────────
	 * 窓の絵（{ data, width, height }）から、枠・タイトルバーを除いた領域を返す。ゲームの中身は読まない（画素の並びだけ）。
	 *  1. 外周の枠: 外側から数 px の線のうち、線の中が揃っていて、内側の線と大きく違う所までを枠とする（Windows 11 は 1〜2px の暗い線）。
	 *  2. 黒い帯: 枠の内側に真っ黒な線が続くなら帯として除く（ゲームが窓より小さく描かれたとき）。
	 *  3. タイトルバー: 上から、同じ色が半分以上を占める行が続く所（文字やボタンがあっても半分は地の色）。
	 *  4. 縦横比: ゲームは縦:横 = 16:9（実測 981×1744 = 1.778）。「タイトルバーあり」「なし」のうち 16:9 に合うほうを取る。
	 *     どちらも合わないときは、スマホの形まで（1.55〜2.5）なら注意つきで通す。それ以外は見つからない。
	 * 戻り値 { ok, reason, x, y, w, h, aspect, title, how, warns[] } */
	const OPT = { aspect16: 16 / 9, aspectTol: 0.012, aspectMin: 1.55, aspectMax: 2.5, dmmMinW: 700, dmmMaxW: 1300 };
	function grayLine(img, horizontal, idx, a, b) {
		const { data, width } = img, out = [];
		for (let k = a; k < b; k += 2) {
			const p = (horizontal ? idx * width + k : k * width + idx) * 4;
			out.push((data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8);
		}
		return out;
	}
	const meanAbs = (u, v) => { let s = 0; for (let i = 0; i < u.length; i++) s += Math.abs(u[i] - v[i]); return s / u.length; };
	const spread = (u) => { let m = 0; for (const x of u) m += x; m /= u.length; let s = 0; for (const x of u) s += Math.abs(x - m); return s / u.length; };
	const meanOf = (u) => { let m = 0; for (const x of u) m += x; return m / u.length; };
	function modeOf(u) {
		const h = new Uint16Array(256); for (const x of u) h[x]++;
		let best = 0; for (let i = 1; i < 256; i++) if (h[i] > h[best]) best = i;
		let near = 0; for (let i = Math.max(0, best - 5); i <= Math.min(255, best + 5); i++) near += h[i];
		return { value: best, frac: near / u.length };
	}
	// 外側から順に見て、枠の線の数を返す。at(k) は外から k 番目の線
	function edgeInset(at, maxEdge) {
		let inset = 0, bestDiff = 0;
		for (let k = 0; k < maxEdge; k++) {
			const u = at(k);
			if (spread(u) > 14) break;         // 中身が揃っていない線 = もう枠ではない
			const d = meanAbs(u, at(k + 1));
			if (d >= 18 && d > bestDiff) { bestDiff = d; inset = k + 1; }
		}
		return inset;
	}
	// 枠の内側の真っ黒な帯
	function blackRun(at, start, limit) {
		let k = start;
		while (k < limit) { const u = at(k); if (meanOf(u) > 12 || Math.max.apply(null, u) > 40) break; k++; }
		return k;
	}
	function detectOne(img) {
		const W = img.width, H = img.height, warns = [];
		if (W < 64 || H < 64) return { ok: false, reason: 'too-small-image', warns };
		{	// 真っ黒・真っ白（最小化・描けていない）
			let tot = 0, ext = 0; const d = img.data;
			for (let p = 0; p < d.length; p += 4 * 97) { const v = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8; tot++; if (v <= 5 || v >= 250) ext++; }
			if (ext / tot >= 0.985) return { ok: false, reason: 'blank', warns };
		}
		const ax = Math.floor(W * 0.05), bx = Math.ceil(W * 0.95), ay = Math.floor(H * 0.1), by = Math.ceil(H * 0.95);
		// 枠の線は細い（実測 1〜2px）。ゲーム自身の端の余白（幅の 1.4% ほど）まで枠と読まないように、4px までしか見ない
		const maxX = 4, maxY = 4;
		const atL = (k) => grayLine(img, false, k, ay, by), atR = (k) => grayLine(img, false, W - 1 - k, ay, by);
		const atB = (k) => grayLine(img, true, H - 1 - k, ax, bx), atT = (k) => grayLine(img, true, k, ax, bx);
		const left = blackRun(atL, edgeInset(atL, maxX), Math.floor(W * 0.45));
		const right = blackRun(atR, edgeInset(atR, maxX), Math.floor(W * 0.45));
		const bottom = blackRun(atB, edgeInset(atB, maxY), Math.floor(H * 0.3));
		const top0 = blackRun(atT, edgeInset(atT, maxY), Math.floor(H * 0.3));
		const w = W - left - right;
		if (w < 32) return { ok: false, reason: 'aspect', warns };
		// タイトルバー
		const atRow = (y) => grayLine(img, true, y, left + Math.floor(w * 0.02), W - right - Math.floor(w * 0.02));
		let titleEnd = top0;
		{
			const first = modeOf(atRow(top0));
			if (first.frac >= 0.5) {
				let y = top0; const lim = Math.min(H, top0 + Math.ceil(H * 0.08));
				while (y < lim) { const m = modeOf(atRow(y)); if (m.frac < 0.5 || Math.abs(m.value - first.value) > 6) break; y++; }
				if (y - top0 >= Math.max(12, W * 0.015)) {
					// 境目は、すぐ近くでいちばん大きく変わる行の間（窓の拡大で境目の行が混ざる）
					let best = y, bestD = -1;
					for (let q = Math.max(top0, y - 2); q <= y + 1 && q + 1 < H; q++) { const d = meanAbs(atRow(q), atRow(q + 1)); if (d > bestD) { bestD = d; best = q + 1; } }
					titleEnd = best;
				}
			}
		}
		const hasTitle = titleEnd > top0;
		const rectOf = (y) => ({ x: left, y, w, h: H - bottom - y, aspect: (H - bottom - y) / w });
		const near16 = (r) => Math.abs(r.aspect - OPT.aspect16) / OPT.aspect16 <= OPT.aspectTol;
		const inRange = (r) => r.aspect >= OPT.aspectMin && r.aspect <= OPT.aspectMax;
		const noTitle = rectOf(top0), withTitle = rectOf(titleEnd);
		let r = null, how = '';
		if (hasTitle && near16(withTitle)) { r = withTitle; how = 'title+16:9'; }
		else if (near16(noTitle)) { r = noTitle; how = 'no-title+16:9'; }
		else if (hasTitle && inRange(withTitle)) { r = withTitle; how = 'title'; warns.push('aspect'); }
		else if (!hasTitle) {
			// タイトルバーの色が読めなくても、下端と幅から 16:9 の上端を出し、そこに境目があれば採る
			const yy = Math.round(H - bottom - w * OPT.aspect16);
			if (yy > top0 && yy < H * 0.12) {
				let best = yy, bestD = -1;
				for (let q = yy - 4; q <= yy + 4; q++) { const d = meanAbs(atRow(q - 1), atRow(q)); if (d > bestD) { bestD = d; best = q; } }
				if (bestD >= 18) { r = rectOf(best); how = 'edge+16:9'; }
			}
			if (!r && inRange(noTitle)) { r = noTitle; how = 'whole'; warns.push('aspect'); }
		}
		if (!r) return { ok: false, reason: 'aspect', warns, title: hasTitle ? titleEnd - top0 : 0, aspect: +withTitle.aspect.toFixed(3) };
		if (r.w < OPT.dmmMinW && near16(r)) warns.push('small');
		if (r.w > OPT.dmmMaxW && near16(r)) warns.push('large');
		return { ok: true, reason: '', x: r.x, y: r.y, w: r.w, h: r.h, aspect: +r.aspect.toFixed(3), title: r.y - top0, how, warns };
	}
	/** 何枚かの結果をまとめる。±2px で揃う組がいちばん多いものの中央値。6割以上で揃わなければ unstable */
	function consensus(list) {
		const use = list.filter((r) => r.reason !== 'blank');
		if (!use.length) return { ok: false, reason: list.length ? 'blank' : 'none', samples: 0, agree: 0 };
		const oks = use.filter((r) => r.ok);
		if (!oks.length) return { ok: false, reason: use[use.length - 1].reason, samples: use.length, agree: 0 };
		let best = [];
		for (const a of oks) {
			const g = oks.filter((b) => Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 && Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2);
			if (g.length > best.length) best = g;
		}
		const med = (k) => best.map((r) => r[k]).sort((p, q) => p - q)[best.length >> 1];
		const out = { ok: best.length / use.length >= 0.6, reason: '', x: med('x'), y: med('y'), w: med('w'), h: med('h'), samples: use.length, agree: best.length, how: best[0].how, warns: best[0].warns, title: med('title') };
		out.aspect = +(out.h / out.w).toFixed(3);
		if (!out.ok) out.reason = 'unstable';
		return out;
	}
	/* ── 切り取りの出どころ ─────────────────────────────
	 * どの出どころにもかぶせられるように、描く先の座標を動かす（source.drawAt は (0,0)-(dw,dh) に描くので、拡大して左上へずらし、はみ出しを切る）。 */
	function cropSource(base, rect) {
		const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
		const w = Math.min(rect.w, base.width - x), h = Math.min(rect.h, base.height - y);
		return UmaVideoFrames.canvasSource({
			kind: 'crop:' + base.kind, exact: !!base.exact, width: w, height: h, duration: base.duration,
			async draw(t, ctx, dw, dh, how) {
				const sx = dw / w, sy = dh / h;
				ctx.save();
				ctx.beginPath(); ctx.rect(0, 0, dw, dh); ctx.clip();
				ctx.translate(-x * sx, -y * sy);
				try { await base.drawAt(t, ctx, base.width * sx, base.height * sy, null, how); } finally { ctx.restore(); }
			},
			close() { base.close(); }
		});
	}

	/*
	 * 動かない部分を1枚の画にそろえる出どころ（T105 の2回目。おいもさんの試しで5回とも selectFrames の「本文の帯」で止まった原因への対処）。
	 * selectFrames は上端と下端を「2枚の差が 5 を超える最初の行・途切れる行」で決める。iPhone の画面収録では動かない行の差がほぼ 0 だが、
	 * ここの圧縮（2秒ごとのキーフレーム・最初の1枚の粗さ）では、動かない部分のくっきりした行で差が 5 を超え、最初の1枚は全面で超える。写り込んだカーソルも同じ働きをする。
	 * そこで、ここで多数の組を数えて本文の帯を決め、帯の外を1枚の画で塗り直してから渡す（selectFrames・composePerson は変えない）。
	 * 画面が変わったフレーム（上の部分が基準の画と違う）は塗り直さない。selectFrames の「同じ画面か」の判定をそのまま働かせるため。
	 */
	const BAND = { samples: 48, xs: 6, moved: 12, share: 0.5, minCount: 3, gap: 12, minShare: 0.25, topY: 0.02, topH: 0.36, sameMax: 12 };
	function findMovingBand(counts) {
		let peak = 0; for (const n of counts) if (n > peak) peak = n;
		if (peak < BAND.minCount) return null;
		const need = Math.max(BAND.minCount, peak * BAND.share);
		let best = null, s = -1, e = -1;
		const close = () => { if (s >= 0 && (!best || e - s > best.bottom - best.top)) best = { top: s, bottom: e }; };
		for (let y = 0; y < counts.length; y++) {
			if (counts[y] < need) continue;
			if (s >= 0 && y - e > BAND.gap) { close(); s = -1; }
			if (s < 0) s = y;
			e = y + 1;
		}
		close();
		if (!best || best.bottom - best.top < counts.length * BAND.minShare) return null;
		best.peak = peak; best.need = need;
		return best;
	}
	async function steadySource(src, signal) {
		const W = src.width, H = src.height, sw = Math.max(16, Math.round(W / BAND.xs)), N = BAND.samples;
		const prev = document.createElement('canvas'), cur = document.createElement('canvas');
		prev.width = cur.width = sw; prev.height = cur.height = H;
		const counts = new Uint16Array(H);
		const a = prev.getContext('2d', { willReadFrequently: true }), b = cur.getContext('2d', { willReadFrequently: true });
		for (let k = 0; k < N; k++) {
			await src.drawAt(src.duration * (k + 0.5) / N, b, sw, H, signal);
			if (k > 0) { const d = stitchRowDiffSignal(prev, cur); for (let y = 0; y < H; y++) if (d[y] > BAND.moved) counts[y]++; }
			a.drawImage(cur, 0, 0);
		}
		const band = findMovingBand(counts);
		if (!band) return { src, band: null };
		// 基準の画: 真ん中の時刻の1枚（最初の粗い1枚を避ける）
		const ref = document.createElement('canvas'); ref.width = W; ref.height = H;
		await src.drawAt(src.duration / 2, ref.getContext('2d', { willReadFrequently: true }), W, H, signal);
		// 同じ画面かを見る小さな画（圧縮の揺れとカーソルは縮めると消える）
		const SW = 32, SH = 32, topY = Math.round(H * BAND.topY), topH = Math.round(H * BAND.topH);
		const tiny = document.createElement('canvas'); tiny.width = SW; tiny.height = SH;
		const tx = tiny.getContext('2d', { willReadFrequently: true });
		tx.drawImage(ref, 0, topY, W, topH, 0, 0, SW, SH);
		const refTop = tx.getImageData(0, 0, SW, SH).data.slice();
		const { top, bottom } = band;
		const steady = UmaVideoFrames.canvasSource({
			kind: 'steady:' + src.kind, exact: !!src.exact, width: W, height: H, duration: src.duration,
			async draw(t, ctx, dw, dh, how) {
				await src.drawAt(t, ctx, dw, dh, null, how);
				const q = dh / H;
				tx.drawImage(ctx.canvas, 0, topY * q, dw, topH * q, 0, 0, SW, SH);
				const d = tx.getImageData(0, 0, SW, SH).data;
				let sum = 0; for (let i = 0; i < d.length; i += 4) sum += (Math.abs(d[i] - refTop[i]) + Math.abs(d[i + 1] - refTop[i + 1]) + Math.abs(d[i + 2] - refTop[i + 2])) / 3;
				if (sum / (SW * SH) > BAND.sameMax) return; // 別の画面
				ctx.drawImage(ref, 0, 0, W, top, 0, 0, dw, top * q);
				ctx.drawImage(ref, 0, bottom, W, H - bottom, 0, bottom * q, dw, (H - bottom) * q);
			},
			close() { src.close(); }
		});
		return { src: steady, band };
	}

	/*
	 * 結合の素材の画からカーソルを消す（T105 の3回目。おいもさんの回答 279）。
	 * カーソルの形や色は決め打ちしない。「スクロールで中身は動くが、カーソルは中身と一緒には動かない」ことを使う:
	 * 同じ中身を写した別のフレーム（スクロール量が違う）を並べて区画ごとに比べ、自分だけが違い、ほかのフレームどうしは合う区画を、そのフレームの画素で置き換える。
	 * カーソルが動いても、アイコンや文字に重なっても、同じ形で扱える。アイコンや文字は中身と一緒に動くので、どのフレームでも合い、置き換わらない。
	 * 比べる相手が足りない区画・相手どうしが合わない区画は、塗らずに残す（壊すほうを避ける）。
	 * iPhone の動画（カーソルが無い）の流れに入れないよう、ここ（取り込みの側）に置く。js/video-frames.js の選ぶ処理は変えない。
	 */
	const POINTER = { poolMax: 40, BH: 16, BW: 16, minD: 80, sep: 60, sepVote: 16, refine: 10, extraMax: 16, extraRefine: 120, alignNear: 16, alignMax: 9, alignRatio: 1.2, maxW: 96, maxH: 128, learnMax: 8, spriteMinPx: 40, spriteMax: 32, spriteSure: 12, spriteVisible: 0.5, pad: 3, ring: 12, ringMean: 10, ringHot: 0.03, hot: 40, hotCount: 4, meanMax: 10 };
	/*
	 * 行の右の余白（スクロールバーの辺り）のカーソルを消す（T118。スクロールバーを引っ張って撮るとカーソルが残った。決定は C-327）。
	 * 上の消し方は「中身と一緒に動く所」でしか使えない（スクロールバーは中身と一緒に動かない）ので、そこを探す範囲からも覚える範囲からも外してあり、
	 * スクロールバーの上のカーソルは形も覚えられず、探されもしなかった。余白には中身が無いので、別の見分け方にする:
	 *  1. 中身が動く列の右端を測り、その右を余白とする（幅の割合で決め打ちしない）。
	 *  2. 余白の地を作る。同じ場所の多数のフレームの中央値（動くつまみとカーソルが消える）。上から下まで同じ色の列はその色（止まったままのカーソルも消える）。
	 *  3. 地と違う長い縦の線が多くのフレームにあれば、スクロールバーのつまみとする。その色と、地とつまみの間の色（つまみの縁）はカーソルに数えない。
	 *  4. 地と違う残りの塊がカーソル。その四角を地で塗り、つまみの場所はつまみの色で塗る。
	 *  5. 塊が余白の左端で切れているときは、行の右端にもかかっている。そこは上の消し方と同じく、まわりが合う別のフレームの画素で置き換える（中身があるので塗らない）。相手が無いときは同じ画の別の行の右端を写す。
	 * 塊の形も色も決め打ちしない。余白の中の塊からもカーソルの形を覚える（スクロールバーを引っ張る間、カーソルは行の上に来ない）。
	 */
	const SCROLLBAR = { moved: 40, bins: 12, binsNeed: 6, share: 0.25, pad: 2, minStart: 0.85, maxStart: 0.99, flat: 0.55, near: 6, diff: 24, blend: 14, thumbRun: 0.06, thumbRunMin: 30, thumbVote: 0.5, thumbNear: 28, thumbMinRows: 24, minPx: 16, hot: 64, hotPx: 8, gap: 2, maxW: 64, maxH: 128, boxPad: 3, smooth: 60, reach: 32, up: 32, down: 16, edgeW: 8, edgeH: 30, selfReach: 20, selfMin: 40, selfMax: 240 };
	// 中身が動く列の右端の次の列（半分の幅の画で）。見つからなければ null。halves は時刻の順の、帯の半分の幅の画
	function findMarginStart(halves, hw, cH) {
		const S = SCROLLBAR, pairs = halves.length - 1;
		if (pairs < 1) return null;
		const need = Math.max(1, pairs * S.share), xMin = Math.floor(hw * S.minStart);
		for (let x = hw - 1; x >= xMin; x--) {
			let moving = 0;
			for (let i = 0; i < pairs; i++) {
				const a = halves[i], b = halves[i + 1];
				// 上から下まで散らばって変わる列が中身（つまみとカーソルは数か所にとどまる）
				const hit = new Uint8Array(S.bins);
				for (let y = 0; y < cH; y++) {
					const p = (y * hw + x) * 4;
					if ((Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2])) / 3 > S.moved) hit[Math.floor(y * S.bins / cH)] = 1;
				}
				if (hit.reduce((u, v) => u + v, 0) >= S.binsNeed) moving++;
			}
			if (moving >= need) {
				const start = x + 1 + S.pad;
				return start <= hw * S.maxStart ? start : null;
			}
		}
		return null;
	}
	// 余白の地（RGB を並べた配列）。frames は余白の部分の RGBA（どれも mW×cH）
	function marginBackground(frames, mW, cH) {
		const S = SCROLLBAR, n = frames.length, bg = new Uint8ClampedArray(mW * cH * 3), v = new Uint8Array(n);
		for (let i = 0, k = 0; i < mW * cH; i++, k += 3) for (let c = 0; c < 3; c++) {
			for (let f = 0; f < n; f++) v[f] = frames[f][i * 4 + c];
			v.sort();
			bg[k + c] = v[n >> 1];
		}
		for (let x = 0; x < mW; x++) {
			const hist = new Uint16Array(256);
			for (let y = 0; y < cH; y++) { const k = (y * mW + x) * 3; hist[(bg[k] * 77 + bg[k + 1] * 150 + bg[k + 2] * 29) >> 8]++; }
			let best = 0; for (let g = 1; g < 256; g++) if (hist[g] > hist[best]) best = g;
			let cnt = 0, yA = -1, yB = -1; const sum = [0, 0, 0];
			for (let y = 0; y < cH; y++) {
				const k = (y * mW + x) * 3;
				if (Math.abs(((bg[k] * 77 + bg[k + 1] * 150 + bg[k + 2] * 29) >> 8) - best) > S.near) continue;
				cnt++; sum[0] += bg[k]; sum[1] += bg[k + 1]; sum[2] += bg[k + 2];
				if (yA < 0) yA = y;
				yB = y;
			}
			if (cnt / cH < S.flat) { // 窓の端の写真のような色の揃わない列: 縦のすぐ近くの中央値（止まったままのカーソルが消える）
				const col = new Uint8ClampedArray(cH * 3);
				for (let y = 0; y < cH; y++) for (let c = 0; c < 3; c++) {
					const list = [];
					for (let q = Math.max(0, y - S.smooth); q <= Math.min(cH - 1, y + S.smooth); q += 4) list.push(bg[(q * mW + x) * 3 + c]);
					col[y * 3 + c] = list.sort((u, v) => u - v)[list.length >> 1];
				}
				for (let y = 0; y < cH; y++) for (let c = 0; c < 3; c++) bg[(y * mW + x) * 3 + c] = col[y * 3 + c];
				continue;
			}
			// 帯の端につながる違いはそのまま（スクロールバーの溝の端が帯の中に入っていることがある）。間に挟まれた違いだけ、その色にする
			for (let y = yA; y <= yB; y++) { const k = (y * mW + x) * 3; bg[k] = sum[0] / cnt; bg[k + 1] = sum[1] / cnt; bg[k + 2] = sum[2] / cnt; }
		}
		return bg;
	}
	const rgbDiff = (d, p, e, k) => (Math.abs(d[p] - e[k]) + Math.abs(d[p + 1] - e[k + 1]) + Math.abs(d[p + 2] - e[k + 2])) / 3;
	// つまみ: 地と違う長い縦の線が半分以上のフレームにある列のまとまり。{ x0, x1, colors（列ごとの RGB）, len } か null
	function findThumb(frames, bg, mW, cH) {
		const S = SCROLLBAR, minRun = Math.max(S.thumbRunMin, cH * S.thumbRun), cols = [];
		for (let x = 0; x < mW; x++) {
			const found = [];
			for (const d of frames) {
				let best = 0, bestAt = -1, s = -1;
				for (let y = 0; y <= cH; y++) {
					const on = y < cH && rgbDiff(d, (y * mW + x) * 4, bg, (y * mW + x) * 3) > S.diff;
					if (on && s < 0) s = y;
					if (!on && s >= 0) { if (y - s > best) { best = y - s; bestAt = s; } s = -1; }
				}
				if (best >= minRun) found.push({ d, y: bestAt, len: best });
			}
			cols.push(found.length >= frames.length * S.thumbVote ? found : null);
		}
		let bx = -1, bn = 0;
		for (let x = 0; x < mW; x++) { if (!cols[x]) continue; let e = x; while (e + 1 < mW && cols[e + 1]) e++; if (e - x + 1 > bn) { bn = e - x + 1; bx = x; } x = e; }
		if (bx < 0) return null;
		// 色はつまみ全体で1つ（引っ張る間はカーソルがつまみに乗り続けるので、列ごとだとカーソルの色になることがある）。長さは列ごとのいちばん多い長さの最大
		const r = [], g = [], b = []; let len = 0;
		for (let x = bx; x < bx + bn; x++) {
			const lens = cols[x].map((f) => f.len).sort((u, v) => u - v);
			len = Math.max(len, lens[lens.length >> 1]);
			for (const f of cols[x]) for (let y = f.y; y < f.y + f.len; y += 3) { const p = (y * mW + x) * 4; r.push(f.d[p]); g.push(f.d[p + 1]); b.push(f.d[p + 2]); }
		}
		const mid = (a) => a.sort((u, v) => u - v)[a.length >> 1];
		return { x0: bx, x1: bx + bn - 1, color: [mid(r), mid(g), mid(b)], len };
	}
	// 地とつまみの間の色か（つまみの縁と圧縮のにじみ）。地→つまみの線分からの距離で見る
	function nearThumbLine(d, p, bg, k, c) {
		const vx = c[0] - bg[k], vy = c[1] - bg[k + 1], vz = c[2] - bg[k + 2], vv = vx * vx + vy * vy + vz * vz;
		let t = vv ? ((d[p] - bg[k]) * vx + (d[p + 1] - bg[k + 1]) * vy + (d[p + 2] - bg[k + 2]) * vz) / vv : 0;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		return (Math.abs(d[p] - bg[k] - t * vx) + Math.abs(d[p + 1] - bg[k + 1] - t * vy) + Math.abs(d[p + 2] - bg[k + 2] - t * vz)) / 3 < SCROLLBAR.blend;
	}
	// 1枚の余白から、カーソルらしい塊を探す。[{ x0, x1, y0, y1, pts: [[x, y], …] }]（余白の中の座標）
	function findMarginBlobs(d, m) {
		const S = SCROLLBAR, { bg, thumb, mW, cH } = m, strong = new Uint8Array(mW * cH), blobs = [];
		for (let y = 0; y < cH; y++) for (let x = 0; x < mW; x++) {
			const i = y * mW + x, p = i * 4, k = i * 3;
			if (rgbDiff(d, p, bg, k) <= S.diff) continue;
			if (thumb && x >= thumb.x0 - 1 && x <= thumb.x1 + 1 && nearThumbLine(d, p, bg, k, thumb.color)) continue;
			strong[i] = 1;
		}
		for (let s = 0; s < strong.length; s++) {
			if (strong[s] !== 1) continue;
			strong[s] = 2;
			const st = [s], pts = [];
			let x0 = mW, x1 = 0, y0 = cH, y1 = 0, hot = 0;
			while (st.length) {
				const i = st.pop(), x = i % mW, y = (i - x) / mW;
				pts.push([x, y]);
				if (rgbDiff(d, i * 4, bg, i * 3) > S.hot) hot++;
				if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
				for (let yy = Math.max(0, y - S.gap); yy <= Math.min(cH - 1, y + S.gap); yy++) for (let xx = Math.max(0, x - S.gap); xx <= Math.min(mW - 1, x + S.gap); xx++) {
					const j = yy * mW + xx;
					if (strong[j] === 1) { strong[j] = 2; st.push(j); }
				}
			}
			// 細く長い塊は、最初の粗い画のつまみの縁（カーソルは幅がある）
			if (thumb && x1 - x0 < S.edgeW && y1 - y0 >= S.edgeH && x0 >= thumb.x0 - S.edgeW && x1 <= thumb.x1 + S.edgeW) continue;
			if (pts.length >= S.minPx && hot >= S.hotPx && x1 - x0 < S.maxW && y1 - y0 < S.maxH) blobs.push({ x0, x1, y0, y1, pts });
		}
		return blobs;
	}
	// 塊の四角（と少しの余裕）を地で塗り、つまみの場所はつまみの色で塗る。d はその画の余白の RGBA
	function paintMarginBlob(ctx, d, b, m, ox, oy) {
		const S = SCROLLBAR, { bg, thumb, mW, cH } = m;
		const X0 = Math.max(0, b.x0 - S.boxPad), X1 = Math.min(mW - 1, b.x1 + S.boxPad), Y0 = Math.max(0, b.y0 - S.boxPad), Y1 = Math.min(cH - 1, b.y1 + S.boxPad);
		let ty0 = -1, ty1 = -1;
		if (thumb) {
			const xc = (thumb.x0 + thumb.x1) >> 1, c = thumb.color;
			let n = 0;
			for (let y = 0; y < cH; y++) {
				const p = (y * mW + xc) * 4;
				if ((Math.abs(d[p] - c[0]) + Math.abs(d[p + 1] - c[1]) + Math.abs(d[p + 2] - c[2])) / 3 >= S.thumbNear) continue;
				if (ty0 < 0) ty0 = y;
				ty1 = y; n++;
			}
			if (n < S.thumbMinRows) ty0 = ty1 = -1;
			else if (ty1 - ty0 + 1 < thumb.len) { // つまみの端がカーソルに隠れている: 長さから戻す
				if (b.y0 <= ty0 + S.boxPad) ty0 = Math.max(0, ty1 - thumb.len + 1);
				else if (b.y1 >= ty1 - S.boxPad) ty1 = Math.min(cH - 1, ty0 + thumb.len - 1);
			}
		}
		const im = ctx.createImageData(X1 - X0 + 1, Y1 - Y0 + 1);
		for (let y = Y0, q = 0; y <= Y1; y++) for (let x = X0; x <= X1; x++, q += 4) {
			const inThumb = thumb && ty0 >= 0 && y >= ty0 && y <= ty1 && x >= thumb.x0 && x <= thumb.x1;
			const c = inThumb ? thumb.color : null, k = (y * mW + x) * 3;
			im.data[q] = c ? c[0] : bg[k]; im.data[q + 1] = c ? c[1] : bg[k + 1]; im.data[q + 2] = c ? c[2] : bg[k + 2]; im.data[q + 3] = 255;
		}
		ctx.putImageData(im, ox + X0, oy + Y0);
		return { x: [ox + X0, ox + X1 + 1], y: [Y0, Y1 + 1] };
	}
	async function removePointer(src, sel, track, signal) {
		const W = src.width, H = src.height, { headerEnd: hE, contentH: cH } = sel.header;
		const hw = Math.round(W / 2), P = POINTER;
		const times = sel.picks, stat = { sprite: null, samples: 0, frames: 0, cells: 0, boxes: [], leftCells: 0, pool: 0, extra: 0, bigLumps: 0, leftBoxes: [], margin: null };
		const known = track.filter((f) => f.pos != null).sort((a, b) => a.t - b.t);
		if (!known.length) return stat;
		const posAt = (t) => { let best = known[0]; for (const f of known) if (Math.abs(f.t - t) < Math.abs(best.t - t)) best = f; return best.pos; };
		const interp = (t) => { let a = known[0], b = known[known.length - 1]; for (const f of known) { if (f.t <= t) a = f; if (f.t >= t) { b = f; break; } } return b.t > a.t ? a.pos + (b.pos - a.pos) * (t - a.t) / (b.t - a.t) : a.pos; };
		// 比べる相手の集まり: 止まっている画を先に、位置が離れたものを選ぶ。足りない所を動いている画で埋める
		const pool = [];
		const far = (f, gap) => pool.every((q) => Math.abs(q.pos - f.pos) >= gap);
		for (const f of known) if (f.still && far(f, P.sep)) pool.push({ t: f.t, pos: f.pos, still: true });
		for (const f of known) if (!f.still && far(f, P.sep)) pool.push({ t: f.t, pos: f.pos, still: false });
		pool.sort((a, b) => (b.still - a.still));
		pool.length = Math.min(pool.length, P.poolMax);
		pool.sort((a, b) => a.t - b.t);
		const draw = document.createElement('canvas'); draw.width = W; draw.height = H;
		const dx = draw.getContext('2d', { willReadFrequently: true });
		const half = document.createElement('canvas'); half.width = hw; half.height = cH;
		const hx = half.getContext('2d', { willReadFrequently: true });
		const extraCanvas = document.createElement('canvas'); extraCanvas.width = W; extraCanvas.height = H;
		const dx2d = extraCanvas.getContext('2d', { willReadFrequently: true });
		const halfOf = (c) => { hx.drawImage(c, 0, hE, W, cH, 0, 0, hw, cH); return hx.getImageData(0, 0, hw, cH).data; };
		for (const q of pool) {
			await src.drawAt(q.t, dx, W, H, signal);
			q.band = document.createElement('canvas'); q.band.width = W; q.band.height = cH;
			q.band.getContext('2d').drawImage(draw, 0, hE, W, cH, 0, 0, W, cH);
			q.half = halfOf(draw);
		}
		stat.pool = pool.length;
		// 行の右の余白（T118）。測れないとき（相手が足りない・中身が右端まである）は null で、今までどおり
		let margin = null;
		const mStart = findMarginStart(pool.map((q) => q.half), hw, cH);
		if (mStart != null) {
			const mX = Math.ceil(mStart * W / hw), mW = W - mX;
			const frames = pool.map((q) => q.band.getContext('2d', { willReadFrequently: true }).getImageData(mX, 0, mW, cH).data);
			const bg = marginBackground(frames, mW, cH);
			margin = { mX, mW, cH, bg, thumb: findThumb(frames, bg, mW, cH), start: mStart };
			stat.margin = { x: mX, thumb: margin.thumb ? [mX + margin.thumb.x0, mX + margin.thumb.x1 + 1] : null, len: margin.thumb ? margin.thumb.len : 0, frames: 0, cells: 0, boxes: [], rowCells: 0, rowSelf: 0, rowLeft: 0 };
		}
		const xLimit = margin ? margin.start : hw; // 上の消し方（別のフレームの画素で置き換える）はここより左だけ
		// a の行 ya〜 と b の行 yb〜 の区画の差（RGB の差の平均の平均と、差の大きい画素の数）
		const cellDiff = (a, ya, b, yb, x0, bw, n) => {
			let s = 0, hot = 0;
			for (let y = 0; y < n; y++) {
				let p = ((ya + y) * hw + x0) * 4, r = ((yb + y) * hw + x0) * 4;
				for (let x = 0; x < bw; x++, p += 4, r += 4) { const d = (Math.abs(a[p] - b[r]) + Math.abs(a[p + 1] - b[r + 1]) + Math.abs(a[p + 2] - b[r + 2])) / 3; s += d; if (d > P.hot) hot++; }
			}
			return { mean: s / (bw * n), hot };
		};
		const same = (r) => r.hot <= P.hotCount && r.mean < P.meanMax;
		// 自分との正確なずれ（見込み ±win 行）。一覧は行が同じ間隔で並ぶので、1行ぶんずれた所でも欄の形は合う。文字まで合う「はっきりした最小」でなければ相手にしない
		const align = (me, q, d0, win = P.refine) => {
			const score = (d) => {
				const y0 = Math.max(0, d), y1 = Math.min(cH, cH + d);
				if (y1 - y0 < 48) return Infinity;
				let s = 0, c = 0;
				for (let y = y0; y < y1; y += 3) { let p = (y * hw + 8) * 4, r = ((y - d) * hw + 8) * 4; for (let x = 8; x < hw - 24; x += 3, p += 12, r += 12) { s += Math.abs(me[p + 1] - q[r + 1]); c++; } }
				return s / c;
			};
			const list = [];
			for (let d = d0 - win; d <= d0 + win; d++) list.push({ d, m: score(d) });
			let best = list[0];
			for (const e of list) if (e.m < best.m) best = e;
			let other = Infinity;
			for (const e of list) if (Math.abs(e.d - best.d) >= 6 && e.m < other) other = e.m;
			// 見込みが確かな相手（選ぶ側の記録の位置）は ±refine しか探さないので1行ぶんずれない。広く探す相手だけ厳しく見る
			if (win <= P.refine) return best.m <= P.alignNear ? best.d : null;
			return best.m <= P.alignMax && best.m * P.alignRatio <= other ? best.d : null;
		};
		const xEnd = Math.floor(hw * 0.965); // 右端はスクロールバー（中身と一緒に動かない本来の絵）なので見ない
		const uniq = Array.from(new Set(sel.persons.flatMap((p) => p.files)));
		const timeOf = (file) => times[sel.files.indexOf(file)];
		const loadFile = async (file) => {
			const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
			dx.drawImage(img, 0, 0);
			return halfOf(draw);
		};
		const candsOf = (me, t) => {
			const list = [], myPos = posAt(t);
			for (const q of pool) {
				const d0 = q.pos - myPos;
				if (Math.abs(d0) < P.minD) continue;
				let d = align(me, q.half, d0);
				// 速く動いている間の画は、記録の位置が少しずれていることがある。広く探す（厳しく見る）
				if (d == null) d = align(me, q.half, d0, P.extraRefine);
				if (d != null && Math.abs(d) >= P.minD) list.push({ q, d, dt: Math.abs(q.t - t) });
			}
			return list.sort((u, v) => (v.q.still - u.q.still) || (u.dt - v.dt));
		};
		// 1. カーソルの形を、その動画の中から覚える。自分だけが違い、スクロール量の違う2枚が互いに合う（だから自分の側に何かが乗っている）小さな塊の、差のある画素の形
		const cell = (a, ya, b, yb, x0) => same(cellDiff(a, ya, b, yb, x0, Math.min(P.BW, xEnd - x0), P.BH));
		const rowsOk = (c, y, n) => y - c.d >= 0 && y - c.d + n <= cH;
		const samples = [];
		// 止まっている画の間が離れていて比べる相手が足りないときに使う、スクロールの途中のフレーム（時間の近い順に extraMax 枚）
		const extrasFor = async (me, t, wantedRow) => {
			const myPos = posAt(t), wanted = [];
			for (let tt = 0; tt < src.duration - 0.02; tt += 1 / 30) {
				const g = interp(tt) - myPos;
				if (Math.abs(g) < P.minD || !wantedRow(g)) continue;
				if (wanted.every((w) => Math.abs(w.g - g) >= P.sepVote)) wanted.push({ t: tt, g });
			}
			wanted.sort((u, v) => Math.abs(u.t - t) - Math.abs(v.t - t));
			wanted.length = Math.min(wanted.length, P.extraMax);
			wanted.sort((u, v) => u.t - v.t);
			const list = [];
			for (const w of wanted) {
				await src.drawAt(w.t, dx2d, W, H, signal);
				const qh = halfOf(extraCanvas);
				const d = align(me, qh, Math.round(w.g), P.extraRefine);
				if (d == null || Math.abs(d) < P.minD) continue;
				const band = document.createElement('canvas'); band.width = W; band.height = cH;
				band.getContext('2d').drawImage(extraCanvas, 0, hE, W, cH, 0, 0, W, cH);
				list.push({ q: { band, half: qh, t: w.t, still: false, pos: myPos + d }, d, dt: Math.abs(w.t - t) });
			}
			stat.extra += list.length;
			return list;
		};
		const learnFrom = (me, t, cands) => {
			const odd = new Set();
			for (let y = 0; y + P.BH <= cH; y += P.BH) {
				const av = cands.filter((c) => rowsOk(c, y, P.BH));
				if (!av.length) continue;
				for (let x0 = 0; x0 + 6 <= xEnd; x0 += P.BW) if (!av.some((c) => cell(me, y, c.q.half, y - c.d, x0))) odd.add(y + ':' + x0);
			}
			const seen = new Set();
			for (const k of odd) {
				if (seen.has(k)) continue;
				seen.add(k);
				const list = [], st = [k];
				while (st.length) {
					const [y, x] = st.pop().split(':').map(Number);
					list.push({ y, x });
					for (const dy of [-P.BH, 0, P.BH]) for (const dc of [-P.BW, 0, P.BW]) { const nk = (y + dy) + ':' + (x + dc); if (odd.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); } }
				}
				const ys = list.map((c) => c.y), xs = list.map((c) => c.x);
				const y0 = Math.min(...ys), y1 = Math.max(...ys) + P.BH, x0 = Math.min(...xs), x1 = Math.max(...xs) + P.BW;
				if (x1 - x0 > P.maxW || y1 - y0 > P.maxH) continue;
				const inner = new Set(list.map((c) => c.y + ':' + c.x)), ring = [];
				const ry0 = Math.max(0, y0 - P.BH), ry1 = Math.min(cH, y1 + P.BH);
				for (let y = ry0; y + P.BH <= ry1; y += P.BH) for (let x = Math.max(0, x0 - P.BW); x + 6 <= Math.min(xEnd, x1 + P.BW); x += P.BW) if (!inner.has(y + ':' + x)) ring.push({ y, x });
				const ok = cands.filter((c) => rowsOk(c, ry0, ry1 - ry0) && ring.every((r) => cell(me, r.y, c.q.half, r.y - c.d, r.x)));
				let donor = null;
				for (let u = 0; u < ok.length && !donor; u++) for (let v = u + 1; v < ok.length; v++) if (Math.abs(ok[u].d - ok[v].d) >= P.sep && list.every((c) => cell(ok[u].q.half, c.y - ok[u].d, ok[v].q.half, c.y - ok[v].d, c.x))) { donor = ok[u]; break; }
				if (!donor) continue;
				const px = [];
				for (let y = y0; y < Math.min(y1, cH); y++) for (let x = x0; x < Math.min(x1, hw); x++) {
					const p = (y * hw + x) * 4, r = ((y - donor.d) * hw + x) * 4, h = donor.q.half;
					if ((Math.abs(me[p] - h[r]) + Math.abs(me[p + 1] - h[r + 1]) + Math.abs(me[p + 2] - h[r + 2])) / 3 > P.hot) px.push([x, y, me[p], me[p + 1], me[p + 2]]);
				}
				if (px.length < P.spriteMinPx) continue;
				const mx = Math.min(...px.map((q) => q[0])), my = Math.min(...px.map((q) => q[1])), w = Math.max(...px.map((q) => q[0])) - mx + 1, h2 = Math.max(...px.map((q) => q[1])) - my + 1;
				if (margin && mx + w > xLimit) continue; // 余白にかかる塊は右が切れていて、形が欠けている（余白の形は下で覚える）
				samples.push({ t, w, h: h2, x: mx, y: my, px: px.map((q) => [q[0] - mx, q[1] - my, q[2], q[3], q[4]]) });
			}
		};
		// いちばん多い大きさの塊を、カーソルの形とする（2回以上見えたものだけ）
		const pickSprite = () => {
			const groups = new Map();
			for (const m of samples) { const key = Math.round(m.w / 3) + 'x' + Math.round(m.h / 3); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m); }
			let best = null, count = 0;
			for (const g of groups.values()) if (g.length > count) { count = g.length; best = g.reduce((u, v) => (v.px.length > u.px.length ? v : u)); }
			return count >= 2 ? { sprite: best, count } : { sprite: null, count };
		};
		for (const file of uniq) {
			const t = timeOf(file), me = await loadFile(file);
			learnFrom(me, t, candsOf(me, t));
		}
		// 余白の塊からも覚える（スクロールバーを引っ張る間、カーソルは行の上に来ない）。塊が余白の左端で切れているものは形が欠けているので使わない
		if (!pickSprite().sprite && margin) {
			for (const file of uniq) {
				const t = timeOf(file), me = await loadFile(file);
				for (const b of findMarginBlobs(dx.getImageData(margin.mX, hE, margin.mW, cH).data, margin)) {
					if (b.x0 === 0) continue;
					const seen = new Map();
					for (const [x, y] of b.pts) { const hx0 = Math.floor((margin.mX + x) * hw / W); seen.set(y * hw + hx0, [hx0, y]); }
					const px = Array.from(seen.values());
					if (px.length < P.spriteMinPx) continue;
					const mx = Math.min(...px.map((q) => q[0])), my = Math.min(...px.map((q) => q[1]));
					samples.push({ t, w: Math.max(...px.map((q) => q[0])) - mx + 1, h: Math.max(...px.map((q) => q[1])) - my + 1, x: mx, y: my, px: px.map(([x, y]) => { const p = (y * hw + x) * 4; return [x - mx, y - my, me[p], me[p + 1], me[p + 2]]; }) });
				}
			}
		}
		if (!pickSprite().sprite) {
			// 止まっている画だけでは覚えられなかった（ホイールを大きく回した）: スクロールの途中のフレームも相手にして、もう一度
			for (const file of uniq.slice(0, P.learnMax)) {
				const t = timeOf(file), me = await loadFile(file);
				const extra = await extrasFor(me, t, () => true);
				learnFrom(me, t, candsOf(me, t).concat(extra));
				for (const c of extra) { c.q.band.width = c.q.band.height = 0; }
				if (pickSprite().sprite) break;
			}
		}
		const { sprite, count } = pickSprite();
		stat.samples = samples.length; stat.sprite = sprite ? { w: sprite.w, h: sprite.h, px: sprite.px.length, seen: count } : null;
		const out = new Map();
		// 余白の左端で切れた塊の、行の上の部分（T118）。まわりが合い、その場所の余白にカーソルが無い相手の画素で置き換える
		const donorHasBlob = (q, ya, yb) => {
			if (!q.mBlobs) q.mBlobs = findMarginBlobs(q.band.getContext('2d', { willReadFrequently: true }).getImageData(margin.mX, 0, margin.mW, cH).data, margin);
			return q.mBlobs.some((b) => b.y0 < yb && b.y1 >= ya);
		};
		const fixStraddle = async (b, t, me) => {
			const S = SCROLLBAR, X1 = xLimit, X0 = Math.max(0, X1 - S.reach), Y0 = Math.max(0, b.y0 - S.up), Y1 = Math.min(cH, b.y1 + 1 + S.down);
			const RY0 = Math.max(0, Y0 - P.ring), RY1 = Math.min(cH, Y1 + P.ring), RX0 = Math.max(0, X0 - P.ring);
			const good = (c) => {
				if (!rowsOk(c, Y0, Y1 - Y0)) return false;
				let s = 0, n = 0, hot = 0;
				for (let y = RY0; y < RY1; y++) for (let x = RX0; x < X1; x++) {
					if ((y >= Y0 && y < Y1 && x >= X0) || y - c.d < 0 || y - c.d >= cH) continue;
					const p = (y * hw + x) * 4, r = ((y - c.d) * hw + x) * 4, q = c.q.half;
					const v = (Math.abs(me[p] - q[r]) + Math.abs(me[p + 1] - q[r + 1]) + Math.abs(me[p + 2] - q[r + 2])) / 3;
					s += v; n++; if (v > P.hot) hot++;
				}
				return n > 0 && s / n <= P.ringMean * 1.6 && hot / n <= P.ringHot * 2.56 && !donorHasBlob(c.q, Y0 - c.d, Y1 - c.d);
			};
			let c = candsOf(me, t).find(good);
			if (!c) c = (await extrasFor(me, t, (g) => Y0 - g >= 0 && Y1 - g <= cH)).find(good);
			if (!c) {
				// 相手が無い（一覧の先頭と末尾は1枚にしか写らない）: 行は等間隔で右端に文字が無いので、同じ画の中の別の行の右端を写す。まわりがはっきり合う所だけ。
				// 写す幅はカーソルの所まで（右から続けて違う列）。中身に届く前に止まるので、文字は写らない
				const xa = Math.max(0, X1 - S.selfReach), rowsDiff = (o, y0, y1, xs, xe) => {
					let sum = 0, n = 0, hot = 0;
					for (let y = y0; y < y1; y++) for (let x = xs; x < xe; x++) {
						const p = (y * hw + x) * 4, r = ((y - o) * hw + x) * 4;
						const v = (Math.abs(me[p] - me[r]) + Math.abs(me[p + 1] - me[r + 1]) + Math.abs(me[p + 2] - me[r + 2])) / 3;
						sum += v; n++; if (v > P.hot) hot++;
					}
					return { sum, n, hot };
				};
				let best = null;
				for (const o of Array.from({ length: S.selfMax - S.selfMin + 1 }, (_, i) => S.selfMin + i).flatMap((v) => [v, -v])) {
					// 写す元はカーソルの塊と重ならない。まわりは上下の行
					if (Y0 - o < 0 || Y1 - o > cH || (Y0 - o < Y1 + S.up && Y1 - o > Y0 - S.up)) continue;
					const u = RY0 - o >= 0 && Y0 > RY0 ? rowsDiff(o, RY0, Y0, xa, X1) : { sum: 0, n: 0, hot: 0 }, v = RY1 - o <= cH && RY1 > Y1 ? rowsDiff(o, Y1, RY1, xa, X1) : { sum: 0, n: 0, hot: 0 };
					const n = u.n + v.n, m = (u.sum + v.sum) / n;
					if (!n || m > P.ringMean || (u.hot + v.hot) / n > P.ringHot) continue;
					if (!best || m < best.m) best = { o, m };
				}
				if (!best) { stat.margin.rowLeft++; return false; }
				let xl = X1;
				for (let x = X1 - 1; x >= xa; x--) { if (!rowsDiff(best.o, Y0, Y1, x, x + 1).hot && !rowsDiff(best.o, Y0, Y1, Math.max(xa, x - 1), x).hot) break; xl = x; }
				if (xl < X1) {
					const sx = Math.round(Math.max(0, xl - 1) * W / hw), sw = margin.mX - sx;
					dx.drawImage(draw, sx, hE + Y0 - best.o, sw, Y1 - Y0, sx, hE + Y0, sw, Y1 - Y0);
				}
				stat.margin.rowSelf++;
				return true;
			}
			const sx = Math.round(X0 * W / hw), sw = margin.mX - sx;
			dx.drawImage(c.q.band, sx, Y0 - c.d, sw, Y1 - Y0, sx, hE + Y0, sw, Y1 - Y0);
			stat.margin.rowCells++;
			return true;
		};
		let fixBySprite = null;
		if (sprite) {
			// 2. 画の中でカーソルの形を探す（帯の端で一部だけ写っていてもよい）
			const fits = (img, ox, oy) => {
				let s = 0, n = 0;
				for (const [x, y, r, g, b] of sprite.px) {
					const yy = oy + y, xx = ox + x;
					if (yy < 0 || yy >= cH || xx < 0 || xx >= hw) continue;
					const p = (yy * hw + xx) * 4;
					s += (Math.abs(img[p] - r) + Math.abs(img[p + 1] - g) + Math.abs(img[p + 2] - b)) / 3; n++;
					if (s > P.spriteMax * sprite.px.length) return Infinity;
				}
				return n >= sprite.px.length * P.spriteVisible ? s / n : Infinity;
			};
			const findAll = (img, xa, xb, ya, yb) => {
				const hits = [];
				for (let oy = ya; oy < yb; oy++) for (let ox = xa; ox < xb; ox++) {
					const m = fits(img, ox, oy);
					if (m > P.spriteMax) continue;
					const near = hits.find((h) => Math.abs(h.x - ox) < sprite.w && Math.abs(h.y - oy) < sprite.h);
					if (!near) hits.push({ x: ox, y: oy, m });
					else if (m < near.m) { near.x = ox; near.y = oy; near.m = m; }
				}
				return hits;
			};
			// 選んだ画どうしのずれは選ぶ側で測ってある（速く動いている間の画でも確か）。最後の手段として、選んだ画そのものも相手にする
			const posG = [0];
			for (let i = 0; i < sel.seams.length; i++) posG.push(posG[i] + (sel.seams[i].overlap != null ? cH - sel.seams[i].overlap : cH));
			let pickPool = null;
			const pickDonors = async (i) => {
				if (!pickPool) {
					pickPool = [];
					for (let j = 0; j < sel.files.length; j++) {
						const img = await new Promise((res, rej) => { const u = URL.createObjectURL(sel.files[j]), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
						dx2d.drawImage(img, 0, 0);
						const band = document.createElement('canvas'); band.width = W; band.height = cH;
						band.getContext('2d').drawImage(extraCanvas, 0, hE, W, cH, 0, 0, W, cH);
						pickPool.push({ band, half: halfOf(extraCanvas), t: times[j], still: false, j });
					}
				}
				return pickPool.filter((q) => q.j !== i && Math.abs(posG[q.j] - posG[i]) >= P.minD).map((q) => ({ q, d: posG[q.j] - posG[i], dt: Math.abs(q.t - times[i]) })).sort((u, v) => u.dt - v.dt);
			};
			fixBySprite = async (file, t, me) => {
				// 行の右端にかかるカーソルも探す。右へ抜けた所は余白のほうで塗る
				const hits = findAll(me, 0, Math.max(xEnd - (sprite.w >> 1), margin ? xLimit : 0), -(sprite.h >> 1), cH - (sprite.h >> 1));
				if (!hits.length) return 0;
				const cands = candsOf(me, t);
				let extra = null, done = 0;
				const fetchExtra = () => extrasFor(me, t, (g) => hits.some((h) => h.y - P.pad - g >= 0 && h.y + sprite.h + P.pad - g <= cH));
				// 3. カーソルのまわりまで自分と合い（位置が確か）、その場所にカーソルが写っていない相手の画素で、カーソルの所だけを置き換える
				for (const h of hits) {
					const X0 = Math.max(0, h.x - P.pad), X1 = Math.min(xLimit, h.x + sprite.w + P.pad), Y0 = Math.max(0, h.y - P.pad), Y1 = Math.min(cH, h.y + sprite.h + P.pad);
					if (X1 <= X0) continue;
					const RY0 = Math.max(0, Y0 - P.ring), RY1 = Math.min(cH, Y1 + P.ring), RX0 = Math.max(0, X0 - P.ring), RX1 = Math.min(xEnd, xLimit, X1 + P.ring);
					const good = (c) => {
						if (!rowsOk(c, RY0, RY1 - RY0)) { why.rows++; return false; }
						let s = 0, n = 0, hot = 0;
						for (let y = RY0; y < RY1; y++) for (let x = RX0; x < RX1; x++) {
							if (y >= Y0 && y < Y1 && x >= X0 && x < X1) continue;
							const p = (y * hw + x) * 4, r = ((y - c.d) * hw + x) * 4, q = c.q.half;
							const v = (Math.abs(me[p] - q[r]) + Math.abs(me[p + 1] - q[r + 1]) + Math.abs(me[p + 2] - q[r + 2])) / 3;
							s += v; n++; if (v > P.hot) hot++;
						}
						// 形がはっきり合う（まず間違いなくカーソル）ときは、動いている画の圧縮の崩れを見込んで少しゆるめる
						const loose = h.m < P.spriteSure ? 1.6 : 1;
						if (!n || s / n > P.ringMean * loose || hot / n > P.ringHot * loose * loose) { why.ring.push([c.d, +(s / n).toFixed(1), +(hot / n).toFixed(3)]); return false; }
						if (findAll(c.q.half, Math.max(0, X0 - sprite.w), Math.min(hw - 1, X1), Math.max(0, Y0 - c.d - sprite.h), Math.min(cH, Y1 - c.d)).length) { why.sprite.push(c.d); return false; }
						return true;
					};
					const why = { rows: 0, ring: [], sprite: [] };
					let c = cands.find(good);
					if (!c) { if (!extra) extra = await fetchExtra(); c = extra.find(good); }
					if (!c) c = (await pickDonors(sel.files.indexOf(file))).find(good);
					if (!c) { stat.leftCells++; stat.leftBoxes.push([+t.toFixed(2), h.x, h.y, +h.m.toFixed(1), why]); continue; }
					const sx = Math.round(X0 * W / hw), sw = Math.round(X1 * W / hw) - sx;
					dx.drawImage(c.q.band, sx, Y0 - c.d, sw, Y1 - Y0, sx, hE + Y0, sw, Y1 - Y0);
					stat.cells++; done++;
					stat.boxes.push({ t: +t.toFixed(2), x: [sx, sx + sw], y: [Y0, Y1], m: +h.m.toFixed(1), from: +c.q.t.toFixed(2) });
				}
				return done;
			};
		}
		for (const file of uniq) {
			const t = timeOf(file), me = await loadFile(file);
			let done = fixBySprite ? await fixBySprite(file, t, me) : 0;
			// 4. 行の右の余白のカーソル（T118）
			if (margin) {
				const d = dx.getImageData(margin.mX, hE, margin.mW, cH).data;
				const blobs = findMarginBlobs(d, margin);
				for (const b of blobs) {
					if (b.x0 <= 1) await fixStraddle(b, t, me);
					const box = paintMarginBlob(dx, d, b, margin, margin.mX, hE);
					stat.margin.cells++; done++;
					stat.margin.boxes.push({ t: +t.toFixed(2), x: box.x, y: box.y, px: b.pts.length });
				}
				if (blobs.length) stat.margin.frames++;
			}
			if (done) {
				stat.frames++;
				const blob = await new Promise((res) => draw.toBlob(res, 'image/png'));
				out.set(file, new File([blob], file.name.replace(/\.[a-z]+$/, '.png'), { type: 'image/png' }));
			}
		}
		for (const q of pool) { q.band.width = q.band.height = 0; q.half = null; }
		extraCanvas.width = extraCanvas.height = 0; draw.width = draw.height = 0; half.width = half.height = 0;
		for (const p of sel.persons) p.files = p.files.map((f) => out.get(f) || f);
		return stat;
	}

	/* ── 断片化なしの MP4 にする（avc1。B フレームなし。時刻は届いたとおりの可変） ───────────────── */
	const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
	const u16 = (n) => [(n >>> 8) & 255, n & 255];
	const str = (s) => Array.from(s, (c) => c.charCodeAt(0));
	const zeros = (n) => new Array(n).fill(0);
	function box(type, ...parts) {
		const bodies = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
		const len = 8 + bodies.reduce((s, b) => s + b.length, 0);
		const out = new Uint8Array(len);
		out.set(u32(len), 0); out.set(str(type), 4);
		let o = 8; for (const b of bodies) { out.set(b, o); o += b.length; }
		return out;
	}
	const full = (type, version, flags, ...parts) => box(type, [version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255], ...parts);
	const COLOR_CODE = { primaries: { bt709: 1, bt470bg: 5, smpte170m: 6 }, transfer: { bt709: 1, smpte170m: 6, 'iec61966-2-1': 13 }, matrix: { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6 } };
	const colorMatrixCode = (color) => { const m = COLOR_CODE.matrix[color && color.matrix]; return m == null ? 1 : m; };
	const MATRIX = [].concat(u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000));
	/** samples: [{ data: Uint8Array, key, us }]（us 昇順）。endUs は最後のフレームの終わりの時刻。color は圧縮器の知らせ（colr の箱に書く） */
	function muxMp4(samples, description, W, H, endUs, color) {
		const TS = 90000, n = samples.length;
		const t0 = samples[0].us, dts = samples.map((s) => Math.round((s.us - t0) * TS / 1e6));
		const durs = dts.map((d, i) => (i + 1 < n ? Math.max(1, dts[i + 1] - d) : Math.max(1, Math.round((endUs - samples[i].us) * TS / 1e6))));
		const D = dts[n - 1] + durs[n - 1];
		const runs = []; for (const d of durs) { const q = runs[runs.length - 1]; if (q && q[1] === d) q[0]++; else runs.push([1, d]); }
		const keys = []; samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
		const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
		const total = samples.reduce((s, x) => s + x.data.length, 0);
		const avc1 = box('avc1', zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(W), u16(H), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(24), u16(0xFFFF), box('avcC', description), box('colr', str('nclx'), u16(COLOR_CODE.primaries[color && color.primaries] || 1), u16(COLOR_CODE.transfer[color && color.transfer] || 1), u16(colorMatrixCode(color)), [color && color.fullRange ? 0x80 : 0]));
		const stbl = box('stbl',
			full('stsd', 0, 0, u32(1), avc1),
			full('stts', 0, 0, u32(runs.length), ...runs.map((q) => u32(q[0]).concat(u32(q[1])))),
			full('stss', 0, 0, u32(keys.length), ...keys.map(u32)),
			full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
			full('stsz', 0, 0, u32(0), u32(n), Uint8Array.from(samples.flatMap((s) => u32(s.data.length)))),
			full('stco', 0, 0, u32(1), u32(ftyp.length + 8)));
		const minf = box('minf', full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))), stbl);
		const mdia = box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(TS), u32(D), u16(0x55c4), u16(0)), full('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler'), [0]), minf);
		const tkhd = full('tkhd', 0, 7, u32(0), u32(0), u32(1), u32(0), u32(D), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(W << 16), u32(H << 16));
		const moov = box('moov', full('mvhd', 0, 0, u32(0), u32(0), u32(TS), u32(D), u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(2)), box('trak', tkhd, mdia));
		return new Blob([ftyp, Uint8Array.from(u32(total + 8)), Uint8Array.from(str('mdat')), ...samples.map((s) => s.data), moov], { type: 'video/mp4' });
	}

	/* ── H.264 に圧縮して断片化なしの MP4 にする ───────────────── */
	const H264_CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.420033', 'avc1.640028', 'avc1.420028'];
	function encodeSink(opts) {
		const bitrate = opts.bitrate || 30e6;
		let enc = null, samples = [], description = null, color = null, W = 0, H = 0, bytes = 0, lastKey = -Infinity, failed = null, out = null, codecName = '';
		return {
			kind: 'encode',
			async begin(w, h) {
				if (enc) { try { enc.close(); } catch (e) { /* 閉じていても */ } }
				samples = []; description = null; color = null; bytes = 0; lastKey = -Infinity; failed = null;
				W = w & ~1; H = h & ~1;
				let cfg = null;
				for (const codec of H264_CODECS) {
					// 画質を優先する（T105 の4回目・おいもさんの決定 303）。前は 12Mbps・realtime で、実際は約 2.4Mbps だった
					const c = { codec, width: W, height: H, bitrate, bitrateMode: 'variable', framerate: 30, latencyMode: 'quality', avc: { format: 'avc' } };
					try { const s = await VideoEncoder.isConfigSupported(c); if (s.supported) { cfg = c; break; } } catch (e) { /* 次へ */ }
				}
				if (!cfg) throw new Error('H.264 で圧縮できない: ' + W + '×' + H);
				codecName = cfg.codec;
				enc = new VideoEncoder({
					output: (chunk, meta) => {
						if (meta && meta.decoderConfig && meta.decoderConfig.description && !description) {
							const dc = meta.decoderConfig.description;
							description = dc instanceof ArrayBuffer ? new Uint8Array(dc.slice(0)) : new Uint8Array(dc.buffer.slice(dc.byteOffset, dc.byteOffset + dc.byteLength));
						}
						if (meta && meta.decoderConfig && meta.decoderConfig.colorSpace && !color) color = meta.decoderConfig.colorSpace;
						const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
						samples.push({ data, key: chunk.type === 'key', us: chunk.timestamp }); bytes += data.length;
					},
					error: (e) => { failed = e; }
				});
				enc.configure(cfg);
			},
			frame(f, us) {
				if (failed) throw failed;
				if (enc.encodeQueueSize > 6) return false; // 追いつかないときは捨てる（時刻は可変なので、間の画が抜けるだけ）
				const key = us - lastKey >= 2e6;
				if (key) lastKey = us;
				const vf = new VideoFrame(f, { timestamp: us, visibleRect: { x: 0, y: 0, width: W, height: H } });
				enc.encode(vf, { keyFrame: key }); vf.close();
				return true;
			},
			async end(endUs) {
				if (!enc) throw new Error('フレームが届いていない');
				await enc.flush(); enc.close(); enc = null;
				if (failed) throw failed;
				if (!samples.length || !description) throw new Error('圧縮の結果が無い');
				samples.sort((p, q) => p.us - q.us);
				for (let i = 1; i < samples.length; i++) if (samples[i].us <= samples[i - 1].us) samples[i].us = samples[i - 1].us + 1000;
				out = muxMp4(samples, description, W, H, Math.max(endUs, samples[samples.length - 1].us + 33333), color);
				samples = [];
				return UmaVideoFrames.openSource(out);
			},
			close() { if (enc) { try { enc.close(); } catch (e) { /* 閉じていても */ } enc = null; } samples = []; },
			bytes: () => (out ? out.size : bytes),
			blob: () => out,
			info: () => codecName + '・目標 ' + Math.round(bitrate / 1e6) + 'Mbps・画質優先' + (color ? '・' + (color.fullRange ? 'フルレンジ' : 'ふつうの範囲') : '')
		};
	}
	/* ── 映像を右の余白に出すか（決定 333・348・349） ─────────────────────────────
	 * 本文の幅は 720px までは詰めてよい。映像は高さ 400px（枠の中の 200px の2倍）より小さくなるなら、右に出す意味が薄いので枠の中に戻す（幅 971px 以上・高さ 499px 以上で右）。
	 * 戻り値 { side, w, h, mainW, shift }。shift は本文を左へ寄せる量（中央のままで入るなら 0）。lab/pc-capture-mock.html の layoutCapture と同じ計算 */
	const SIDE = { mainMin: 720, videoMinH: 400, edge: 16, ratio: 984 / 1804, wrapMax: 1024 };
	function sideLayout(W, Vh, barH) {
		const room = W - SIDE.mainMin - SIDE.edge * 2;           // 本文を一番詰めたときの右の余白
		const byHeight = Vh - SIDE.edge * 2 - barH;              // 画面の高さに合わせた映像の高さ
		const h = Math.floor(Math.min(byHeight, room / SIDE.ratio));
		if (h < SIDE.videoMinH) return { side: false };
		const w = Math.round(h * SIDE.ratio);
		const right = W - w - SIDE.edge * 2;                     // 本文の右端をここまでにする
		const mainW = Math.min(SIDE.wrapMax, right);
		const centerLeft = (W - mainW) / 2;                      // 今の中央寄せの左端
		return { side: true, w, h, mainW, shift: Math.max(0, centerLeft + mainW - right) };
	}

	/* ── 取り込みの一回分 ─────────────────────────────
	 * begin() は押した操作の中で呼ぶ（getDisplayMedia は操作の中でしか開けない）。選ぶのをやめたときは NotAllowedError のまま投げる。
	 * ウィンドウの絵を読むだけで、ゲームには触れない（入力・操作・書き込みをしない）。映像はこの PC の中だけで使い、どこへも送らない。
	 * hooks.onTick({ area, width, height, rest })  … 0.5秒ごと。area は今の領域（consensus の結果）、rest は残りの秒
	 * hooks.onStop(reason) … 止まったとき1回。reason は stop（ボタン）・limit（上限）・ended（共有を止めた）・resize（途中で大きさが変わった）・error
	 * 戻り値 { stream, stop(), open(signal), dispose() }。open は止まったあとに呼び、結合の流れへ渡す出どころを返す。見つからないときは capFail の付いたエラーを投げる */
	const config = { limitSec: 180, detectMs: 700 };
	const DISPLAY_OPTIONS = { video: { displaySurface: 'window', frameRate: { ideal: 30, max: 30 }, resizeMode: 'none', cursor: 'never' }, audio: false, selfBrowserSurface: 'exclude', monitorTypeSurfaces: 'exclude', surfaceSwitching: 'exclude', systemAudio: 'exclude' };
	const capFail = (kind, msg) => Object.assign(new Error(msg || kind), { capFail: kind });
	const AREA_FAIL = { blank: 'blank', none: 'blank', aspect: 'aspect', unstable: 'unstable', 'too-small-image': 'small' };
	async function begin(hooks) {
		const stream = await navigator.mediaDevices.getDisplayMedia(DISPLAY_OPTIONS);
		const track = stream.getVideoTracks()[0];
		const sink = encodeSink({});
		const tap = track.clone();
		const reader = new MediaStreamTrackProcessor({ track: tap }).readable.getReader();
		const c = { w: 0, h: 0, begun: false, lastUs: -1, started: 0 };
		let running = true, reason = '', areas = [], area = null, dc = null, dx = null, tick = 0, stopped = null;
		const stopStream = () => { stream.getTracks().forEach((t) => t.stop()); tap.stop(); };
		function stop(why) {
			if (!running) return;
			running = false; reason = why || 'stop';
			clearInterval(tick);
			stopped = (async () => {
				try { await reader.cancel(); } catch (e) { /* 読み終わっていても */ }
				await loop;
				stopStream();
			})();
			if (hooks.onStop) hooks.onStop(reason);
		}
		function detectFrom(frame, w, h) {
			if (!dc || dc.width !== w || dc.height !== h) { dc = new OffscreenCanvas(w, h); dx = dc.getContext('2d', { willReadFrequently: true }); }
			dx.drawImage(frame, 0, 0, w, h);
			areas.push(detectOne(dx.getImageData(0, 0, w, h)));
			if (areas.length > 300) areas.shift();
			area = consensus(areas);
		}
		const loop = (async () => {
			let lastDetect = -Infinity, baseUs = null;
			while (running) {
				const { value: f, done } = await reader.read();
				if (done) break;
				try {
					const wall = performance.now(), w = f.displayWidth, h = f.displayHeight;
					if (!c.started) c.started = wall;
					if (baseUs == null) baseUs = f.timestamp;
					const us = Math.max(c.lastUs + 1, f.timestamp - baseUs); c.lastUs = us;
					if (c.w !== w || c.h !== h) {
						// 共有を始めた直後は大きさが落ち着かないことがある。そのあとで変わったら、そこまでの映像では結合できない
						if (c.w && wall - c.started >= 2000) { stop('resize'); break; }
						c.w = w; c.h = h; areas = []; area = null; c.begun = false;
						await sink.begin(w, h); c.begun = true;
					}
					if (wall - lastDetect >= config.detectMs) { lastDetect = wall; detectFrom(f, w, h); }
					sink.frame(f, us);
				} finally { f.close(); }
			}
		})().catch((e) => { console.warn('取り込みの読み取りの失敗', e); stop('error'); });
		const t0 = performance.now();
		tick = setInterval(() => {
			const rest = Math.max(0, config.limitSec - (performance.now() - t0) / 1000);
			if (hooks.onTick) hooks.onTick({ area, width: c.w, height: c.h, rest });
			if (rest <= 0) stop('limit');
		}, 500);
		track.addEventListener('ended', () => stop('ended'));
		return {
			stream, stop,
			async open(signal) {
				await UmaVideoFrames.untilAbort(stopped, signal);
				if (reason === 'resize') throw capFail('unstable');
				if (reason === 'error') throw new Error('取り込みの読み取りの失敗');
				if (!c.begun) throw capFail('blank');
				const a = area || consensus(areas);
				if (!a.ok) throw capFail(AREA_FAIL[a.reason] || 'aspect');
				if (a.warns && a.warns.includes('small')) throw capFail('small');
				if (a.warns && a.warns.includes('large')) throw capFail('large');
				const base = await UmaVideoFrames.untilAbort(sink.end(c.lastUs + 33333), signal);
				const src = cropSource(base, a);
				try { return (await steadySource(src, signal)).src; } catch (e) { src.close(); throw e; }
			},
			dispose() { if (running) { running = false; reason = 'stop'; clearInterval(tick); reader.cancel().catch(() => {}); } stopStream(); sink.close(); }
		};
	}

	window.UmaPcCapture = { VERSION: PC_CAPTURE_JS_VERSION, config, SIDE, shouldOffer, begin, sideLayout, detectOne, consensus, cropSource, findMovingBand, steadySource, BAND, removePointer, findMarginStart, muxMp4, encodeSink };
})();
