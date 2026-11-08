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
 *  4. となりのフレームどうしのずれを「直前のずれの近く」だけで探して軌跡を作る（①予測つき）。
 *     測れない組（速すぎる）は、その間だけ 1/16 秒刻みで取り直す。
 *  5. 区画の頭（親・祖1・祖2 の青いパネル）を帯の中のどこでも見つけ、軌跡の上の位置で同じ頭をまとめて「アンカー」にする（T85）。
 *     人の1枚目は頭が帯の上から 0.25W 以内（組み立てが頭を探す範囲）のフレーム。止まっているフレームを先に選ぶ。
 *  6. 軌跡から選ぶ。止まっている区間の真ん中の1枚を先に（T85。シークがずれても同じ画で、タッチのエフェクトも出ない）、
 *     止まり→止まりが本文の帯の 85% を超える所だけ動いている1枚を足す。選ぶ継ぎ目は「粗い全範囲 → 近くだけ細かく」で確かめる（⑤）。
 *     止まった組・戻った組は選ばない。
 *  7. 選んだ時刻だけ等倍で取り直して JPEG（品質 0.92）の File にする（④）。固定部分（本文の帯の上と下）は1枚目の画素にそろえる。
 *     取り直した画を縮めて縮小画と比べ、合わなければ次の画を待って取り直す（T85）。継ぎ目のずれは取り直した画どうしで測り直す（T85）。
 *  8. アンカーで人ごとに分ける。各人の継ぎ目のずれ（shifts）を返すので、composePerson で組み立てられる（⑥。
 *     stitchOnePerson の並び順と継ぎ目の総当たり〔stitchResolveOrder〕を通さない）。
 *
 * 重いループはメインのまま、約 24ms ごとに await で譲る（Web Worker は使わない。おいもさんの決定 2026-10-31）。
 * opts.signal（AbortSignal）で取り消すと、次に譲ったところで name が 'AbortError' の例外で止まる。
 * 動画の読み込み・シーク・描画の待ちが返ってこないときも、取り消したらその場で止まる（untilAbort。T68）。
 * opts.onProgress({ phase, done, total, ratio, persons }) に進捗を知らせる（phase: 'read' | 'select' | 'grab' | 'compose'）。
 *
 * フレームの出どころ（T90）: openSource は、まず MP4 を自分で分解して WebCodecs（VideoDecoder）で復号する出どころ（mp4Source。
 * 時刻 t の画が必ず同じフレームになる）を試し、使えなければ video 要素のシーク（videoSource）に倒す。iPhone の Safari のシークは
 * 頼んだ時刻の画が毎回同じには描かれない（T90 の iPhone の記録）ので、同じ動画から毎回同じ結合画像を作るには復号の出どころが要る。
 *
 * 使い方（V1-2 の想定）:
 *   const src = await UmaVideoFrames.openSource(file, { signal }); // File / Blob / URL（T90。videoSource だけなら video 要素のシーク）
 *   try {
 *     const sel = await UmaVideoFrames.selectFrames(src, { signal, onProgress });
 *     for (const p of sel.persons) {
 *       const canvas = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, label, { signal, still: p.still });
 *       // canvas は stitchOnePerson の戻り値と同じ形（_stitchWarnings・_sourcePlacements・_profileHeader）
 *     }
 *   } finally { src.close(); }
 */
(function (global) {
	'use strict';

	const VIDEO_FRAMES_JS_VERSION = '2026-11-08a';
	// 動画の読み込み（loadeddata まで）を待つ上限（T82。iPhone の実測は 0.17秒）
	const LOAD_TIMEOUT_MS = 20000;

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
		// T85（T83 の案1＋案3）
		preferStill: true,   // 止まっている区間の真ん中の1枚を先に選ぶ（止まり→止まりが maxGap を超える所だけ動いている1枚を足す）
		maxGap: 0.85,        // 止まっている候補を選ぶ距離の上限（本文の帯の高さに対する割合）
		grabMatch: 0.03,     // 取り直した等倍の画を縮めて、選ぶときの縮小画と比べる不一致率の上限（badNear0）
		remeasureWin: 48,    // 取り直した画どうしで、選ぶときのずれの ±この範囲を測り直す
		nearWin: 12,         // 測れない組の、ほぼ止まっている見込みで探す範囲（±px）
		microBad: 0.12,      // 1/60 秒ごとに足していくときの不一致率の上限（T109。範囲が狭いので、タッチのエフェクトが大きく写っていても認める）
		maxSpeed: 8,         // となりのフレームのずれとして認める速さの上限（W/秒。T109。おいもさんの動画の速いスワイプで 3W/秒ほど）
		grabRetryDt: [0, 1 / 60, -1 / 60, 1 / 30, -1 / 30], // 取り直した画が縮小画と合わないとき、次の画を待って取り直す時刻（選んだ時刻からの差・秒）
		deltaWin: 240,       // 取り直した画と縮小画のずれを探す範囲（±px）
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
	// 待ちが返ってこなくても（動画の読み込み・シーク・作り物の画の描画）、取り消したらすぐ AbortError で抜ける（T68）
	function untilAbort(p, signal) {
		if (!signal) return p;
		if (signal.aborted) return Promise.reject(abortError());
		return new Promise((res, rej) => {
			const onAbort = () => rej(abortError());
			signal.addEventListener('abort', onAbort, { once: true });
			Promise.resolve(p).then((v) => { signal.removeEventListener('abort', onAbort); res(v); }, (e) => { signal.removeEventListener('abort', onAbort); rej(e); });
		});
	}

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
	 * source = { kind, width, height, duration, drawAt(t, ctx, dw, dh, signal, how) → Promise, close() }
	 * how.waitFrame（T85）: シークし直して次の画が出るのを待ってから描く（取り直した画が縮小画と合わないときの取り直し）
	 * drawAt は時刻 t の画を ctx の (0,0)-(dw,dh) に縮めて描く。動画ファイル・作り物の画・
	 * 将来の PC のウィンドウの取り込み（録った映像を時刻で引ける形にして渡す）を同じ形で差し替える。 */

	// force: 同じ時刻でもシークし直す（取り直しで、描かれた画が古いとき。T85）
	function seekVideo(v, t, signal, force) {
		return new Promise((res, rej) => {
			if (signal && signal.aborted) { rej(abortError()); return; }
			if (!force && Math.abs(v.currentTime - t) < 1e-6 && !v.seeking && v.readyState >= 2) { res(); return; }
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

	/** 動画ファイル（File / Blob / URL の文字列）から。close() で後片付け。o.signal で読み込みの待ちの途中でも取り消せる（T68）
	 * iPhone の Safari は、ページに置いていない video だと loadedmetadata のあと suspend して loadeddata が来ない（T68 の診断の A・B1）。
	 * 見えない大きさでページに置いてから load() を呼ぶ（診断の B2。T77）。close() でページから外す。 */
	async function videoSource(input, o) {
		const signal = (o && o.signal) || null;
		if (signal && signal.aborted) throw abortError();
		const own = typeof input !== 'string';
		const url = own ? URL.createObjectURL(input) : input;
		const v = document.createElement('video');
		v.muted = true; v.preload = 'auto'; v.playsInline = true;
		v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
		v.style.cssText = 'position:fixed;left:0;bottom:0;width:4px;height:4px;opacity:0.01;pointer-events:none';
		(document.body || document.documentElement).appendChild(v);
		v.src = url;
		v.load();
		const close = () => { try { v.removeAttribute('src'); v.load(); v.remove(); } catch (e) { /* 何もしない */ } if (own) URL.revokeObjectURL(url); };
		let loadTimer = null;
		try {
			// 読み込みの待ちには上限（既定 20秒。C-259 の 2026-11-02 の決定）。超えたら code 'load-timeout'（画面では「読み込めませんでした」の文）
			const limit = (o && o.loadTimeoutMs != null) ? o.loadTimeoutMs : LOAD_TIMEOUT_MS;
			await untilAbort(new Promise((res, rej) => {
				v.onloadeddata = res; v.onerror = () => rej(framesError('decode', '動画を読めない'));
				loadTimer = setTimeout(() => rej(framesError('load-timeout', '動画の読み込みが ' + limit + 'ms で終わらない')), limit);
			}), signal);
			clearTimeout(loadTimer);
			if (!v.videoWidth || !v.videoHeight) throw framesError('no-video-track', '映像を復号できない');
			let D = v.duration;
			// MediaRecorder の WebM などは長さが Infinity のことがある。末尾までシークすると分かる
			if (!isFinite(D)) { await seekVideo(v, 1e7, signal); D = v.duration; await seekVideo(v, 0, signal); }
			if (!isFinite(D) || D <= 0) throw framesError('no-duration', '動画の長さが分からない');
			return {
				kind: 'video', width: v.videoWidth, height: v.videoHeight, duration: D,
				// how.waitFrame: シークし直して、seeked のあと次の画が出る（requestVideoFrameCallback）のを待ってから描く（T85。T83 の案4。
				// iPhone の Safari は seeked の時点で前の画のままのことがある〔推測〕。来ないときは 250ms で描く）
				async drawAt(t, ctx, dw, dh, signal, how) {
					if (how && how.waitFrame && typeof v.requestVideoFrameCallback === 'function') {
						let id = 0, timer = null;
						const frame = new Promise((res) => { id = v.requestVideoFrameCallback(() => res()); timer = setTimeout(res, 250); });
						await seekVideo(v, t, signal, true);
						await untilAbort(frame, signal);
						clearTimeout(timer);
						try { v.cancelVideoFrameCallback(id); } catch (e) { /* 何もしない */ }
					} else await seekVideo(v, t, signal, !!(how && how.waitFrame));
					ctx.drawImage(v, 0, 0, dw, dh);
				},
				close
			};
		} catch (e) { clearTimeout(loadTimer); close(); throw e; }
	}

	/** 作り物の画（検査）など: draw(t, ctx, dw, dh, how) が時刻 t の画を描く（how は drawAt と同じ。T85） */
	function canvasSource(spec) {
		return {
			kind: spec.kind || 'canvas', width: spec.width, height: spec.height, duration: spec.duration,
			exact: !!spec.exact,   // 同じ時刻には必ず同じ画を描く（エフェクトの置き換えは、これが真のときだけ。T90）
			async drawAt(t, ctx, dw, dh, signal, how) {
				if (signal && signal.aborted) throw abortError();
				await untilAbort(spec.draw(t, ctx, dw, dh, how), signal);
			},
			close() { if (spec.close) spec.close(); }
		};
	}

	/* ── MP4 を分解して WebCodecs で復号する出どころ（T90） ─────────────────────────────
	 * iPhone の Safari では、video 要素のシークで「頼んだ時刻の画」が毎回同じには描かれない（T90 の iPhone の記録）。
	 * 動画ファイル（断片化していない MP4。iPhone の画面収録は hvc1）を自分で分解し、WebCodecs（VideoDecoder）で
	 * フレームを順に復号して、時刻 t の画を「表示時刻が t 以下の最後のフレーム」と決めて描く。同じ動画なら何回通しても同じフレーム。
	 * 復号は前へ進めるだけ。後ろへ戻る・まだ届いていない先の区間へ飛ぶときは、目当てのフレームの手前のキーフレームから復号し直す
	 * （間の区間は飛ばせる）。復号し直した直後の「先行する画」（復号順はあとで表示時刻は前。前の区間を参照していて復号できないことがある）は渡さない。
	 * WebCodecs が無い・MP4 でない・コーデックを復号できないときは openSource が videoSource（video 要素）に倒す。 */

	const str4 = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
	async function mp4ReadView(blob, off, len) { return new DataView(await blob.slice(off, Math.min(blob.size, off + len)).arrayBuffer()); }
	// 先頭から箱の見出しだけを読んで並べる（moov が末尾にあっても、ファイル全体は読まない）
	async function mp4TopBoxes(blob) {
		const out = []; let off = 0;
		while (off + 8 <= blob.size) {
			const h = await mp4ReadView(blob, off, 16);
			if (h.byteLength < 8) break;
			let sz = h.getUint32(0); const type = str4(h, 4); let hdr = 8;
			if (sz === 1) { if (h.byteLength < 16) break; sz = Number(h.getBigUint64(8)); hdr = 16; } else if (sz === 0) sz = blob.size - off;
			if (sz < hdr) throw framesError('mp4', '箱の大きさが不正: ' + type);
			out.push({ type, off, sz, hdr }); off += sz;
		}
		return out;
	}
	function mp4Children(dv, start, end) {
		const out = []; let off = start;
		while (off + 8 <= end) {
			let sz = dv.getUint32(off); const type = str4(dv, off + 4); let hdr = 8;
			if (sz === 1) { sz = Number(dv.getBigUint64(off + 8)); hdr = 16; } else if (sz === 0) sz = end - off;
			if (sz < hdr || off + sz > end) break;
			out.push({ type, off, sz, hdr, body: off + hdr, end: off + sz }); off += sz;
		}
		return out;
	}
	const mp4Find = (list, type) => list.find((b) => b.type === type);
	// colr の箱（nclx）が「フルレンジ」と書いているときの色の指定。圧縮の中身に印が無いと復号器がふつうの範囲と読み、236 以上が 255 に飛ぶ（PC の取り込み・T105・決定 258）。
	// ふつうの範囲の動画（iPhone の画面収録）は null（復号器に何も足さず、今までどおり）
	const COLR_NAMES = { primaries: { 1: 'bt709', 5: 'bt470bg', 6: 'smpte170m', 9: 'bt2020', 12: 'smpte432' }, transfer: { 1: 'bt709', 6: 'smpte170m', 8: 'linear', 13: 'iec61966-2-1', 16: 'pq', 18: 'hlg' }, matrix: { 0: 'rgb', 1: 'bt709', 5: 'bt470bg', 6: 'smpte170m', 9: 'bt2020-ncl' } };
	function mp4FullRangeColor(dv, colr) {
		if (!colr || colr.end - colr.body < 11 || str4(dv, colr.body) !== 'nclx' || !(dv.getUint8(colr.body + 10) & 0x80)) return null;
		const cs = { fullRange: true };
		const set = (k, code) => { const n = COLR_NAMES[k][code]; if (n) cs[k] = n; };
		set('primaries', dv.getUint16(colr.body + 4)); set('transfer', dv.getUint16(colr.body + 6)); set('matrix', dv.getUint16(colr.body + 8));
		return cs;
	}
	// moov から映像トラック（最初の 'vide'）の表を読む
	function mp4ParseMoov(dv) {
		const moov = mp4Children(dv, 0, dv.byteLength)[0];
		if (!moov || moov.type !== 'moov') throw framesError('mp4', 'moov が読めない');
		for (const trak of mp4Children(dv, moov.body, moov.end).filter((b) => b.type === 'trak')) {
			const tk = mp4Children(dv, trak.body, trak.end);
			const mdia = mp4Find(tk, 'mdia'); if (!mdia) continue;
			const md = mp4Children(dv, mdia.body, mdia.end);
			const hdlr = mp4Find(md, 'hdlr'); if (!hdlr || str4(dv, hdlr.body + 8) !== 'vide') continue;
			const mdhd = mp4Find(md, 'mdhd');
			const v = dv.getUint8(mdhd.body);
			const timescale = v === 1 ? dv.getUint32(mdhd.body + 20) : dv.getUint32(mdhd.body + 12);
			const mediaDur = v === 1 ? Number(dv.getBigUint64(mdhd.body + 24)) : dv.getUint32(mdhd.body + 16);
			const minf = mp4Find(md, 'minf'); const stbl = mp4Find(mp4Children(dv, minf.body, minf.end), 'stbl'); const st = mp4Children(dv, stbl.body, stbl.end);
			const stsd = mp4Find(st, 'stsd');
			const entries = mp4Children(dv, stsd.body + 8, stsd.end);
			const entry = entries.find((e) => /^(hvc1|hev1|avc1|avc3)$/.test(e.type));
			if (!entry) throw framesError('codec', '対応していない映像の形式: ' + entries.map((e) => e.type).join(','));
			const width = dv.getUint16(entry.body + 24), height = dv.getUint16(entry.body + 26);
			const sub = mp4Children(dv, entry.body + 78, entry.end);
			const cfgBox = mp4Find(sub, entry.type[0] === 'h' ? 'hvcC' : 'avcC');
			if (!cfgBox) throw framesError('codec', entry.type + ' の設定が無い');
			const cb = new Uint8Array(dv.buffer, dv.byteOffset + cfgBox.body, cfgBox.end - cfgBox.body);
			const description = cb.slice();
			const colorSpace = mp4FullRangeColor(dv, mp4Find(sub, 'colr'));
			let codec, hasParams = false;
			if (cfgBox.type === 'hvcC') {
				const profileSpace = cb[1] >> 6, tier = (cb[1] >> 5) & 1, profile = cb[1] & 31;
				const compat = (cb[2] << 24 | cb[3] << 16 | cb[4] << 8 | cb[5]) >>> 0;
				let rev = 0; for (let i = 0; i < 32; i++) if (compat & (1 << (31 - i))) rev |= (1 << i);
				const cons = Array.from(cb.subarray(6, 12)); while (cons.length > 1 && cons[cons.length - 1] === 0) cons.pop();
				codec = 'hvc1.' + (profileSpace ? String.fromCharCode(64 + profileSpace) : '') + profile + '.' + (rev >>> 0).toString(16).toUpperCase() + '.' + (tier ? 'H' : 'L') + cb[12] + '.' + cons.map((x) => x.toString(16).toUpperCase()).join('.');
				let p = 23; const arrays = cb[22];
				for (let a = 0; a < arrays && p + 3 <= cb.length; a++) { const nt = cb[p] & 63; const num = cb[p + 1] << 8 | cb[p + 2]; p += 3; for (let k = 0; k < num && p + 2 <= cb.length; k++) { const len = cb[p] << 8 | cb[p + 1]; p += 2 + len; if (nt === 33) hasParams = true; } }
			} else {
				codec = 'avc1.' + [cb[1], cb[2], cb[3]].map((x) => x.toString(16).padStart(2, '0')).join('');
				hasParams = (cb[5] & 31) > 0;
			}
			const stts = mp4Find(st, 'stts'); const nS = dv.getUint32(stts.body + 4);
			const dts = []; const dur = []; let t = 0;
			for (let i = 0; i < nS; i++) { const c = dv.getUint32(stts.body + 8 + i * 8), d = dv.getUint32(stts.body + 12 + i * 8); for (let k = 0; k < c; k++) { dts.push(t); dur.push(d); t += d; } }
			const n = dts.length;
			if (!n) throw framesError('mp4', 'サンプルが無い');
			const cto = new Int32Array(n);
			const ctts = mp4Find(st, 'ctts');
			if (ctts) { const nC = dv.getUint32(ctts.body + 4); let i = 0; for (let e = 0; e < nC; e++) { const c = dv.getUint32(ctts.body + 8 + e * 8), o = dv.getInt32(ctts.body + 12 + e * 8); for (let k = 0; k < c && i < n; k++) cto[i++] = o; } }
			const sync = new Uint8Array(n);
			const stss = mp4Find(st, 'stss');
			if (stss) { const nK = dv.getUint32(stss.body + 4); for (let i = 0; i < nK; i++) { const s = dv.getUint32(stss.body + 8 + i * 4) - 1; if (s >= 0 && s < n) sync[s] = 1; } } else sync.fill(1);
			const stsz = mp4Find(st, 'stsz'); const fixedSize = dv.getUint32(stsz.body + 4); const sizes = new Uint32Array(n);
			if (fixedSize) sizes.fill(fixedSize); else for (let i = 0; i < n; i++) sizes[i] = dv.getUint32(stsz.body + 12 + i * 4);
			const stsc = mp4Find(st, 'stsc'); const nSC = dv.getUint32(stsc.body + 4);
			const sc = []; for (let i = 0; i < nSC; i++) sc.push({ first: dv.getUint32(stsc.body + 8 + i * 12), per: dv.getUint32(stsc.body + 12 + i * 12) });
			const stco = mp4Find(st, 'stco'), co = stco || mp4Find(st, 'co64'); const nCh = dv.getUint32(co.body + 4);
			const chunkOff = []; for (let i = 0; i < nCh; i++) chunkOff.push(stco ? dv.getUint32(co.body + 8 + i * 4) : Number(dv.getBigUint64(co.body + 8 + i * 8)));
			const offs = new Float64Array(n);
			{ let si = 0; for (let c = 0; c < nCh && si < n; c++) { let per = 0; for (const e of sc) if (e.first - 1 <= c) per = e.per; let o = chunkOff[c]; for (let k = 0; k < per && si < n; k++) { offs[si] = o; o += sizes[si]; si++; } } if (si < n) throw framesError('mp4', 'サンプルの位置が足りない'); }
			// elst（media_time を引く。-1 の空の区間は飛ばす）
			let mediaTime = 0;
			const edts = mp4Find(tk, 'edts');
			if (edts) { const elst = mp4Find(mp4Children(dv, edts.body, edts.end), 'elst'); if (elst) { const ev = dv.getUint8(elst.body); const ne = dv.getUint32(elst.body + 4); for (let i = 0; i < ne; i++) { const mt = ev === 1 ? Number(dv.getBigInt64(elst.body + 16 + i * 20)) : dv.getInt32(elst.body + 12 + i * 12); if (mt >= 0) { mediaTime = mt; break; } } } }
			const pts = new Float64Array(n); for (let i = 0; i < n; i++) pts[i] = dts[i] + cto[i] - mediaTime;
			const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => pts[a] - pts[b] || a - b);
			let keyframes = 0; for (let i = 0; i < n; i++) keyframes += sync[i];
			return { codec, description, hasParams, width, height, timescale, duration: mediaDur / timescale, n, dur, pts, sync, sizes, offs, order, entryType: entry.type, keyframes, colorSpace };
		}
		throw framesError('no-video-track', '映像トラックが無い');
	}
	async function mp4Parse(blob) {
		if (!blob || typeof blob.slice !== 'function' || !(blob.size > 16)) throw framesError('mp4', 'ファイルでない');
		const boxes = await mp4TopBoxes(blob);
		const moov = mp4Find(boxes, 'moov');
		if (!moov) throw framesError('mp4', 'moov が無い' + (mp4Find(boxes, 'moof') ? '（断片化した MP4）' : ''));
		if (mp4Find(boxes, 'moof')) throw framesError('mp4', '断片化した MP4 には対応していない');
		return mp4ParseMoov(await mp4ReadView(blob, moov.off, moov.sz));
	}
	/** この動画を WebCodecs で復号できるか: { ok, reason, codec, width, height, duration, frames, keyframes, track } */
	async function mp4Probe(blob) {
		if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') return { ok: false, reason: 'no-webcodecs' };
		let tr;
		try { tr = await mp4Parse(blob); } catch (e) { return { ok: false, reason: e.code || 'parse', message: e.message }; }
		let sup = null;
		try { sup = await VideoDecoder.isConfigSupported({ codec: tr.codec, codedWidth: tr.width, codedHeight: tr.height, description: tr.hasParams ? tr.description : undefined }); } catch (e) { return { ok: false, reason: 'unsupported', message: e.message, codec: tr.codec }; }
		const ok = !!(sup && sup.supported);
		return { ok, reason: ok ? '' : 'unsupported', codec: tr.codec, width: tr.width, height: tr.height, duration: tr.duration, frames: tr.n, keyframes: tr.keyframes, entryType: tr.entryType, track: ok ? tr : null };
	}
	/** MP4（File / Blob）を WebCodecs で復号する出どころ。o.track（mp4Probe の track）があれば分解を省く。stat に復号の統計 */
	async function mp4Source(blob, o) {
		o = o || {};
		const signal = o.signal || null;
		if (signal && signal.aborted) throw abortError();
		const tr = o.track || await untilAbort(mp4Parse(blob), signal);
		const n = tr.n, ts = tr.timescale;
		const stat = { fed: 0, out: 0, restarts: 0, skips: 0, reads: 0, leadingSkipped: 0 };
		const cfg = { codec: tr.codec, codedWidth: tr.width, codedHeight: tr.height, optimizeForLatency: false };
		if (tr.hasParams) cfg.description = tr.description;
		if (tr.colorSpace) cfg.colorSpace = tr.colorSpace;
		// 表示順 j ↔ サンプル i（復号順）。出てきたフレームは chunk の timestamp（µs）で引く
		const usOf = new Float64Array(n); const jOfUs = new Map();
		for (let j = 0; j < n; j++) { const i = tr.order[j]; let us = Math.round(tr.pts[i] * 1e6 / ts); while (jOfUs.has(us)) us++; usOf[i] = us; jOfUs.set(us, j); }
		const ptsSorted = new Float64Array(n); for (let j = 0; j < n; j++) ptsSorted[j] = tr.pts[tr.order[j]];
		const syncIdx = []; for (let i = 0; i < n; i++) if (tr.sync[i]) syncIdx.push(i);
		if (!syncIdx.length || syncIdx[0] !== 0) throw framesError('mp4', '最初のサンプルがキーフレームでない');
		// 表示順 j の目当てのフレームを復号できる、いちばん近いキーフレーム（復号順が手前で、表示時刻も手前）
		function keyFor(j) {
			const i = tr.order[j]; let best = 0;
			for (const s of syncIdx) { if (s <= i && tr.pts[s] <= tr.pts[i]) best = s; else if (s > i) break; }
			return best;
		}
		// 時刻 t（秒）→ 表示順 j（pts ≤ t の最後。無ければ 0）
		function jAt(t) {
			const tk = t * ts; let lo = 0, hi = n - 1;
			if (ptsSorted[0] > tk) return 0;
			while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ptsSorted[mid] <= tk) lo = mid; else hi = mid - 1; }
			return lo;
		}
		// ファイルの読み（キーフレームから次のキーフレームの手前までをまとめて。12MB まで）
		let buf = null, bufOff = 0, bufEnd = 0;
		async function sampleData(i) {
			const off = tr.offs[i], sz = tr.sizes[i];
			if (!(buf && off >= bufOff && off + sz <= bufEnd)) {
				let e = i, lo = off, hi = off + sz;
				while (e + 1 < n && !tr.sync[e + 1]) { const o2 = tr.offs[e + 1], s2 = tr.sizes[e + 1]; if (Math.max(hi, o2 + s2) - Math.min(lo, o2) > 12e6) break; e++; lo = Math.min(lo, o2); hi = Math.max(hi, o2 + s2); }
				buf = await untilAbort(blob.slice(lo, hi).arrayBuffer(), signal); bufOff = lo; bufEnd = hi; stat.reads++;
			}
			return new Uint8Array(buf, off - bufOff, sz);
		}
		let dec = null, fed = 0, ended = false, flushing = false, failed = null, closed = false, gen = 0, startKey = 0;
		let queue = []; // 出てきたフレーム（表示順）のうち、まだ渡していないもの
		let cur = null, curJ = -1;
		let waiters = [];
		const wake = () => { const w = waiters; waiters = []; for (const r of w) r(); };
		const waitEvent = () => untilAbort(new Promise((r) => { waiters.push(r); setTimeout(r, 40); }), signal);
		// 復号器は復号し直すたびに作り直す（世代 g）。前の世代から遅れて出てきたフレーム・拒まれた flush は今の世代に関係させない
		function makeDecoder() {
			const g = ++gen;
			const d = new VideoDecoder({
				output: (f) => { if (closed || g !== gen) { f.close(); return; } const j = jOfUs.get(f.timestamp); if (j == null) { f.close(); return; } stat.out++; queue.push({ j, frame: f }); wake(); },
				error: (e) => { if (g === gen) failed = e; wake(); }
			});
			try { d.addEventListener('dequeue', () => { if (g === gen) wake(); }); } catch (e) { /* 無くてもよい（40ms で起きる） */ }
			d.configure(cfg);
			dec = d;
		}
		makeDecoder();
		function dropQueue() { for (const q of queue) q.frame.close(); queue = []; }
		function restart(s) {
			dropQueue();
			const old = dec;
			makeDecoder();
			try { old.close(); } catch (e) { /* 閉じていても */ }
			fed = s; startKey = s; ended = false; flushing = false; failed = null; stat.restarts++;
		}
		async function frameAt(t) {
			if (closed) throw framesError('closed', '閉じた出どころ');
			const j = jAt(t);
			if (j === curJ && cur) return cur;
			const s = keyFor(j);
			if (j < curJ || s > fed || (ended && j > curJ && !queue.some((q) => q.j === j))) restart(s);
			let guard = 0;
			while (true) {
				if (signal && signal.aborted) throw abortError();
				if (failed) throw framesError('decode', '復号に失敗: ' + (failed.message || failed));
				while (queue.length) {
					const q = queue[0];
					if (q.j < j) { queue.shift(); q.frame.close(); continue; }
					if (q.j === j) { queue.shift(); if (cur) cur.close(); cur = q.frame; curJ = j; return cur; }
					// 目当てのフレームが出てこなかった（復号器が捨てた）。次のフレームで代える
					if (ended || fed > tr.order[j] + 32) { stat.skips++; queue.shift(); if (cur) cur.close(); cur = q.frame; curJ = j; return cur; }
					break;
				}
				if (ended) { if (cur) { stat.skips++; curJ = j; return cur; } throw framesError('decode', '動画の末尾を超えた'); }
				if (fed < n && dec.decodeQueueSize < 12 && queue.length < 8) {
					const i = fed++;
					if (i > startKey && i < startKey + 16 && tr.pts[i] < tr.pts[startKey]) { stat.leadingSkipped++; continue; }
					const data = await sampleData(i);
					if (signal && signal.aborted) throw abortError();
					dec.decode(new EncodedVideoChunk({ type: tr.sync[i] ? 'key' : 'delta', timestamp: usOf[i], duration: Math.round(tr.dur[i] * 1e6 / ts), data }));
					stat.fed++;
					continue;
				}
				// 末尾まで渡したら flush で残りを出す
				if (fed >= n && !flushing) { flushing = true; const g = gen; dec.flush().then(() => { if (g === gen) { ended = true; wake(); } }, (e) => { if (g === gen && !closed) failed = e; wake(); }); }
				if (++guard > 200000) throw framesError('decode', '復号が進まない');
				await waitEvent();
			}
		}
		return {
			kind: 'webcodecs', exact: true, width: tr.width, height: tr.height, duration: tr.duration, frames: n, codec: tr.codec, stat,
			async drawAt(t, ctx, dw, dh, sig) {
				const f = await frameAt(Math.max(0, t));
				if (sig && sig.aborted) throw abortError();
				ctx.drawImage(f, 0, 0, dw, dh);
			},
			frameAt,
			close() { if (closed) return; closed = true; dropQueue(); if (cur) { cur.close(); cur = null; } try { dec.close(); } catch (e) { /* 何もしない */ } buf = null; }
		};
	}
	/** 動画（File / Blob / URL の文字列）から、まず WebCodecs の出どころ（mp4Source）を試し、使えなければ video 要素（videoSource）に倒す。
	 * 戻り値の kind は 'webcodecs' か 'video'。倒したときは fallback に理由（no-webcodecs・mp4・codec・unsupported など） */
	async function openSource(input, o) {
		const signal = (o && o.signal) || null;
		if (signal && signal.aborted) throw abortError();
		let why = null;
		if (typeof input !== 'string') {
			try {
				const p = await untilAbort(mp4Probe(input), signal);
				if (p.ok) return await mp4Source(input, Object.assign({}, o, { track: p.track }));
				why = p.reason;
			} catch (e) { if (isAbortError(e)) throw e; why = e.code || 'probe'; }
		} else why = 'url';
		const src = await videoSource(input, o);
		src.fallback = why;
		return src;
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
	// ずれ dy（-R〜R）のうち不一致率が最小のもの（T85）
	function nearShift(a, b, R) {
		const w = a.w, h = a.h;
		let best = { dy: 0, rate: 1 };
		for (let dy = -R; dy <= R; dy++) {
			let bad = 0, tot = 0;
			for (let y = R + 1; y < h - R - 1; y += 2) {
				const ra = (y + dy) * w, rb = y * w;
				for (let x = 0; x < w; x += 2) { if (Math.abs(a.gray[ra + x] - b.gray[rb + x]) > 24) bad++; tot++; }
			}
			if (tot && bad / tot < best.rate) best = { dy, rate: bad / tot };
		}
		return best;
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
	// 行ごとの差（d）で、差が threshold を超える行が続く区間（quiet 行以上の途切れで分ける）のうち、いちばん長いもの { start, end（次の行） }（T109）
	function longestDiffRun(d, threshold, quiet) {
		let best = null, start = -1, last = -1;
		const close = () => { if (start >= 0 && (!best || last + 1 - start > best.end - best.start)) best = { start, end: last + 1 }; };
		for (let y = 0; y < d.length; y++) {
			if (d[y] <= threshold) continue;
			if (start >= 0 && y - last > quiet) { close(); start = -1; }
			if (start < 0) start = y;
			last = y;
		}
		close();
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
			await untilAbort(source.drawAt(times[n], sctx, sw, H, signal), signal);
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
		// 組ごとの「差が続く中でいちばん長い区間」（T109）。育成完了後の画面は、窓の上と下に背景と紙吹雪が動いていて、
		// 「最初に差が出る行」が画面のいちばん上のほうになる。窓の中の固定部分は動かないので、差の途切れ（100行以上。stitch と同じ長さ）で区間に分けると、
		// スクロールする本文がいちばん長い区間になる。stitch は最小を取るので、演出が1組で上の方に出ると上端が上がる。解析側は中央値を使う
		const firsts = [];
		let runEnd = -1;
		for (let k = 0; k < probes.length - 1; k++) {
			const d = stitchRowDiffSignal(probes[k], probes[k + 1]);
			const r = longestDiffRun(d, 5, 100);
			if (r) { firsts.push(r.start); runEnd = Math.max(runEnd, r.end); }
		}
		const sorted = firsts.slice().sort((p, q) => p - q);
		if (sorted.length) { hf.headerEnd = sorted[Math.floor(sorted.length / 2)]; hf.footerStart = runEnd; }
		const footer = stitchTrimFixedFooterChrome(probes, hf.headerEnd, hf.footerStart, '動画の解析');
		const hE = hf.headerEnd, cH = footer - hE;
		if (hE < bandY0 || footer > bandY1 || cH < 200) throw framesError('band', '本文の帯が想定の範囲の外: ' + hE + '〜' + footer);
		const mx = Math.floor(sw * 0.1);
		const pw = sw - mx * 2;
		for (const f of same) {
			const g = new Uint8Array(pw * cH);
			for (let y = 0; y < cH; y++) g.set(f.band.subarray((hE - bandY0 + y) * sw + mx, (hE - bandY0 + y) * sw + mx + pw), y * pw);
			f.plane = { gray: g, w: pw, h: cH };
			// 区画の頭（青いパネル）の上端。帯の中のどこでも（T85。T83 の案3。動画B の祖1 は帯の上から約 300px で止まっていた）
			f.heads = blueStarts(f.col, hE - bandY0, footer - bandY0).map((y) => y - (hE - bandY0)).filter((y) => y >= 8);
			f.band = null; f.probe = null; f.top = null; f.col = null;
		}
		for (const f of small) { f.band = null; f.probe = null; }

		// 本文の帯（縮小画のグレー）を plane の形に。取り直した等倍の画を縮めて比べるときにも使う
		function planeFromSmall() {
			const band = toGray(sctx.getImageData(0, hE, sw, cH).data);
			if (isBlankGray([band], opts.blankRatio)) return null;
			const g = new Uint8Array(pw * cH);
			for (let y = 0; y < cH; y++) g.set(band.subarray(y * sw + mx, y * sw + mx + pw), y * pw);
			return { gray: g, w: pw, h: cH };
		}
		// 速い区間だけ細かく取り直す。縮小画・本文のグレーを同じ形で作る（真っ白・真っ黒なら null）。区切りの頭もここで調べる（T85）
		async function sampleEntry(t) {
			await pause();
			await untilAbort(source.drawAt(t, sctx, sw, H, signal), signal);
			const plane = planeFromSmall();
			if (!plane) { blankSkipped++; return null; }
			const cd = sctx.getImageData(colX, hE, 1, cH).data;
			const col = new Uint8Array(cH * 3);
			for (let y = 0; y < cH; y++) { col[y * 3] = cd[y * 4]; col[y * 3 + 1] = cd[y * 4 + 1]; col[y * 3 + 2] = cd[y * 4 + 2]; }
			return { t: +t.toFixed(4), plane, fine: true, heads: blueStarts(col, 0, cH).filter((y) => y >= 8) };
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
		let stills = 0, backs = 0, local = 0, localFallback = 0, coarse = 0, verifies = 0, nears = 0, headHints = 0, predVerifies = 0, loose = 0, micros = 0;
		// となりどうしのずれ（正＝下へスクロール・0＝止まっている・負＝上へ戻った・null＝測れない）
		function stepShift(a, b, prev) {
			b.strictStill = false;
			if (badNear0(a.plane, b.plane) < opts.stillBad) { stills++; b.strictStill = true; return 0; }
			if (prev != null && prev > 0) {
				const win = Math.max(opts.predWin, Math.round(prev * 0.5));
				const r = scanRange(a.plane, b.plane, prev - win, prev + win, opts.seamYs, opts.seamXs); local++;
				// 予測の範囲の中の当たりは、基準の2倍まで認める（T85。タッチのエフェクトは画面に付いて動かないので、正しいずれでも不一致が増える）
				if (r.shift > 0 && r.badRate < opts.okBad * 2 && r.shift > prev - win + 1 && r.shift < prev + win - 1) return r.shift;
				localFallback++;
			}
			// 粗い全範囲 → 当たりの近くだけ細かく
			// 時間の割に遠すぎる当たりは、一覧の同じ形の行に合っただけ（T109。1/16 秒で 633px 戻った、など）。全範囲の当たりには使わない
			const plausible = (s) => s <= Math.max(opts.predWin, W * opts.maxSpeed * (b.t - a.t));
			const c = coarseScan(a.plane, b.plane, opts.coarseYs, opts.coarseXs); coarse++;
			if (c.confident && plausible(c.shift)) {
				const r = scanRange(a.plane, b.plane, c.shift - opts.coarseYs * 2, c.shift + opts.coarseYs * 2, opts.seamYs, opts.seamXs); local++;
				if (r.shift > 0 && r.badRate < opts.okBad) return r.shift;
			}
			// 当たりが1つに決まる（次点との比 3 以上）なら、不一致が多くても（タッチのエフェクトが両方に写っている）軌跡のずれにする（T85）
			if (c.shift > 0 && plausible(c.shift) && c.badRate < opts.okBad * 3 && coarseRatio(c) >= 3) {
				const r = scanRange(a.plane, b.plane, c.shift - opts.coarseYs * 2, c.shift + opts.coarseYs * 2, opts.seamYs, opts.seamXs); local++;
				if (r.shift > 0 && r.badRate < opts.okBad * 3) { loose++; return r.shift; }
			}
			const cb = coarseScan(b.plane, a.plane, opts.coarseYs, opts.coarseXs); coarse++;
			if (cb.confident && plausible(cb.shift)) { backs++; return -cb.shift; }
			// ほぼ止まっている（1〜数px ずつ動く・タッチのエフェクトが出ている）。近くだけ少しゆるく（T85。粗い全範囲では次点と比べて決め手が無い）
			const sm = nearShift(a.plane, b.plane, opts.nearWin);
			if (sm.rate < opts.okBad * 2) { nears++; return sm.dy; }
			// 速すぎて測れない。両方に区画の頭が見えていれば、頭の動いた量の近くだけ確かめる（T85。動画B の速いスワイプ）
			for (const ya of a.heads || []) for (const yb of b.heads || []) {
				const d = ya - yb;
				if (d <= 0) continue;
				const r = scanRange(a.plane, b.plane, d - 6, d + 6, opts.seamYs, opts.seamXs); local++;
				if (r.shift > 0 && r.badRate < opts.okBad * 3) { headHints++; return r.shift; }
			}
			return null;
		}
		// 選ぶ継ぎ目の確かめ。verCoarse のときは粗い全範囲（次点との比を見る）＋当たりの近くだけ細かく
		// pred（軌跡の見込みのずれ）があり、粗い全範囲で決め手が無いとき（重なりが小さい継ぎ目）は、見込みの近くの当たりが
		// 強ければ（不一致 okBad の半分未満）確かとみなす（T85。止まり→止まりは重なりが 15〜30% になる）
		function verifySeam(a, b, pred) {
			verifies++;
			if (!opts.verCoarse) return stitchMeasureSeam(a, b, opts.verYs, opts.verXs);
			const c = coarseScan(a, b, opts.coarseYs, opts.coarseXs); coarse++;
			if (!c.confident && pred >= opts.minShift && pred <= cH - 60) {
				const r = scanRange(a, b, pred - 16, pred + 16, opts.seamYs, opts.seamXs); local++;
				if (r.shift > 0 && r.badRate < opts.okBad / 2) { predVerifies++; return { shift: r.shift, overlap: cH - r.shift, badRate: r.badRate, ratio: Math.max(coarseRatio(c), opts.warnSecondRatio), confident: true }; }
			}
			if (!c.confident) return { shift: c.shift, overlap: c.shift > 0 ? cH - c.shift : 60, badRate: c.badRate, ratio: coarseRatio(c), confident: false };
			const r = scanRange(a, b, c.shift - opts.coarseYs * 2, c.shift + opts.coarseYs * 2, opts.seamYs, opts.seamXs); local++;
			// 次点との比は粗い全範囲の値（同じ間引きどうしで比べる）
			return { shift: r.shift, overlap: cH - r.shift, badRate: r.badRate, ratio: coarseRatio(c), confident: r.shift > 0 && r.badRate < 0.03 };
		}
		// 1/16 秒でもつながらない組（T109）。一覧は同じ高さの行が並ぶので、全範囲で探すと「数行先の位置」も同じくらい合って決め手が無い
		// （実例: 正しいずれ 131 の不一致 2.0%・7行先の 807 が 3.6%）。間の画を 1/60 秒ごとに取り、ごく近くだけを探して足していく。
		// 探す範囲を行の高さの半分（0.04W）までにすれば、となりの行には合わない。途中で測れなければ null
		async function microStep(a, b) {
			const win = Math.max(8, Math.round(W * 0.04));
			const one = (p, q, pred) => {
				// 止まっているかは「ずれ 0 の不一致がいちばん小さいか」で見る（badNear0 は ±3px を止まりに入れるので、札の形だけの一覧は 15px 動いても基準を下回る）
				let bad0 = 0, tot0 = 0;
				for (let i = 0; i < p.gray.length; i += p.w) for (let x = 0; x < p.w; x += opts.seamXs) { if (Math.abs(p.gray[i + x] - q.gray[i + x]) > 24) bad0++; tot0++; }
				bad0 /= tot0;
				const f = scanRange(p, q, Math.max(1, pred - win), pred + win, opts.seamYs, opts.seamXs);
				const r = pred <= win ? scanRange(q, p, 1, win, opts.seamYs, opts.seamXs) : { shift: -1, badRate: Infinity };
				const back = r.badRate < f.badRate;
				const best = back ? r : f;
				if (bad0 <= best.badRate) return 0;
				return best.shift > 0 && best.badRate < opts.microBad ? (back ? -best.shift : best.shift) : null;
			};
			let prev = a.plane, total = 0, pred = 0;
			const add = (q) => {
				const s = one(prev, q, pred);
				if (s == null) return false;
				if (s !== 0) pred = Math.max(0, s);
				total += s; prev = q;
				return true;
			};
			for (let t = a.t + 1 / 60; t < b.t - 1 / 120; t += 1 / 60) {
				const e = await sampleEntry(t);
				if (!e || !add(e.plane)) return null;
			}
			if (!add(b.plane)) return null;
			micros++;
			return total;
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
			let s = stepShift(a, b, prevShift);
			if (s == null) {
				if (await densify(a, b)) { n--; continue; } // a の次から測り直す
				s = await microStep(a, b);
			}
			if (s == null) {
				pos.set(b, pos.get(a) + cH); // 1/60 秒でもつながらない。重なりなしとして進む（確かめで弱い継ぎ目になる）
				prevShift = null;
				continue;
			}
			pos.set(b, pos.get(a) + s);
			b.stepPrev = s;
			prevShift = s > 0 ? s : null;
		}

		// 止まっている区間（となりとのずれ 0 が続く所）。区間の真ん中の1枚を候補にする（T85。T83 の案1 (a)）。
		// 止まっている画はシークが前後にずれても同じ画で、タッチのエフェクトも出ない
		let stillRuns = 0;
		{
			let run = [same[0]];
			const flush = () => {
				if (run.length >= 2) {
					const mid = (run[0].t + run[run.length - 1].t) / 2;
					let rep = run[0];
					for (const e of run) { e.still = true; if (Math.abs(e.t - mid) < Math.abs(rep.t - mid)) rep = e; }
					rep.stillRep = true;
					stillRuns++;
				}
			};
			for (let n = 1; n < same.length; n++) {
				if (same[n].stepPrev === 0 && same[n].strictStill && pos.has(same[n])) run.push(same[n]);
				else { flush(); run = [same[n]]; }
			}
			flush();
		}
		// 区切り（アンカー）: 頭の位置を軌跡の上の位置（pos＋頭の y）で覚え、同じ位置の頭は1つにまとめる（T85。T83 の案3）。
		// 人の1枚目は、頭が帯の上から 0.25W-8 以内（組み立ての stitchDetectFirstSkillPanelTop が頭を探す範囲）のフレームのうち、
		// 止まっている区間の候補があればその中で、無ければ全部の中で、頭がいちばん上に近いもの（止まっている画はシークがずれても同じ画で、
		// エフェクトも出ない。頭より上は組み立てで使わないので、中身は減らない）。範囲に入るフレームが無ければ頭がいちばん上に近いもの。
		// 1枚目に見えている頭（と 0.25W より上の頭）は 0 番の人のもの
		const heads = [];
		for (const f of same) {
			if (!pos.has(f) || !f.heads) continue;
			for (const y of f.heads) heads.push({ f, y, abs: pos.get(f) + y });
		}
		heads.sort((p, q) => p.abs - q.abs);
		const headTol = Math.max(40, Math.round(cH * 0.05));
		// 同じ頭にまとめる幅は、パネルの高さより小さい 0.06W まで広げる（T132・決定 482）。x=0.3W の列が頭のパネルの白い文字
		// （「スタミナ」など）を横切ると、青が「パネルの上端」と「文字の下」の2回始まり、その差（約 45px）が headTol を超えて
		// 別の頭になることがあった（速い動画 A-1 で区切りが4つ・祖2 のパネルの上が切れた。T129 §2）
		const groupTol = Math.max(headTol, Math.round(W * 0.06));
		const groups = [];
		for (const h of heads) {
			const g = groups[groups.length - 1];
			if (g && h.abs - g[g.length - 1].abs <= groupTol) g.push(h); else groups.push([h]);
		}
		// 区切りの画を選ぶのは、組のいちばん上の頭（パネルの上端）から headTol 以内の頭だけ。文字の下の青だけが写った画
		// （パネルの上端は帯の外）を区切りにすると、パネルの上が切れる
		for (let i = 0; i < groups.length; i++) { const g0 = groups[i][0].abs; groups[i] = groups[i].filter((h) => h.abs - g0 <= headTol); }
		// 頭が窓（帯の上から 0.25W-8）に入るフレームが無い（窓の少し下で止まり、次のスワイプで窓を飛び越えた）。
		// 頭が最後に見えたフレームと次のフレームの間を半分ずつ取り直して、頭が窓に入るフレームを探す（最大 4回）
		async function headIntoWindow(g) {
			// 頭が最後に見えたフレーム（同じ時刻なら上のもの）から。頭は時間とともに上へ動いて窓を飛び越える
			let cur = g.reduce((p, q) => (q.f.t > p.f.t || (q.f.t === p.f.t && q.y < p.y) ? q : p));
			for (let it = 0; it < 4; it++) {
				const k = same.indexOf(cur.f), nx = same[k + 1];
				if (!nx || nx.t - cur.f.t < 1 / 120) return null;
				const e = await sampleEntry((cur.f.t + nx.t) / 2);
				if (!e) return null;
				const st = stepShift(cur.f, e, null);
				same.splice(k + 1, 0, e);
				densified++;
				pos.set(e, pos.get(cur.f) + (st != null ? st : 0));
				e.stepPrev = st;
				// 同じ頭（測れたときは軌跡の上の位置で、測れないときは前より上にある頭）
				const y = (e.heads || []).filter((v) => (st != null ? Math.abs(pos.get(e) + v - cur.abs) <= headTol : v < cur.y))[0];
				if (y == null) continue; // もう窓の上へ抜けた: 前半をさらに半分に
				if (st == null) pos.set(e, cur.abs - y);
				const h = { f: e, y, abs: pos.get(e) + y };
				if (y <= W * 0.25 - 8) return h;
				cur = h;
			}
			return null;
		}
		const firstAbs = same[0].heads && same[0].heads.length ? same[0].heads[0] : null;
		const anchorEntries = [same[0]];
		same[0].anchorY = firstAbs;
		for (const g of groups) {
			if (g[0].abs <= W * 0.25 - 8 || (firstAbs != null && g.some((h) => h.f === same[0]))) continue;
			const inWin = g.filter((h) => h.y <= W * 0.25 - 8);
			if (!inWin.length) { const h = await headIntoWindow(g); if (h) inWin.push(h); }
			const pool = inWin.filter((h) => h.f.stillRep);
			const from = pool.length ? pool : inWin.length ? inWin : g;
			let best = from[0];
			for (const h of from) if (h.y < best.y || (h.y === best.y && h.f.t < best.f.t)) best = h;
			if (anchorEntries.includes(best.f)) continue;
			best.f.anchorY = best.y;
			anchorEntries.push(best.f);
		}
		anchorEntries.sort((p, q) => p.t - q.t);
		const anchorSet = new Set(anchorEntries);

		const maxGap = Math.round(opts.maxGap * cH);

		// 軌跡から選ぶ。アンカーは必ず選ぶ。止まっている候補を先に、遠いほうから確かめ、確かな最初の1枚を選ぶ
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
					// 直前の1枚とアンカーが同じ画（近くのずれで合う。verifySeam は「ずれ 0」を表せない。T85）→ その前の1枚からの継ぎ目をそのまま使う
					const last = seams[seams.length - 1];
					const sm = nearShift(key.plane, fa.plane, opts.nearWin);
					if (last && last.shift > 0 && sm.rate < opts.okBad) {
						picks.pop(); seams.pop();
						const sh = last.shift + sm.dy;
						pushPick(prev, fa, { shift: sh, overlap: cH - sh, badRate: last.badRate, ratio: last.secondRatio }, last.weak);
						key = fa;
						continue;
					}
					const r1 = verifySeam(key.plane, fa.plane, pos.get(fa) - pk);
					pushPick(key, fa, r1, !ok(r1)); key = fa;
					continue;
				}
				if (gap <= maxGap || gap < opts.minShift) {
					const r = verifySeam(key.plane, fa.plane, gap);
					if (ok(r)) { pushPick(key, fa, r); key = fa; continue; }
				}
			}
			let picked = false;
			// 止まっている候補は、継ぎ目の基準を少しゆるめて（不一致 okBad の2倍まで・次点との比 warnSecondRatio 以上）認める（T90）。
			// 動いている1枚（タッチのエフェクトが写る）からの継ぎ目は不一致が膨らみ、iPhone と PC で画素がわずかに違うだけで基準をまたいで、
			// 止まっている画の代わりに動いている画が選ばれることがあった（動画A の祖A2: PC は 15.5秒の止まり・iPhone は 16.625秒の動き）。
			// 継ぎ目は取り直した画で測り直すので、ここでの基準は選ぶ画を決めるだけ。ゆるめて認めた継ぎ目は「弱い」として持つ
			const okStill = (r) => r && r.shift > 0 && isFinite(r.badRate) && r.badRate < opts.okBad * 2 && ratioOf(r) >= opts.warnSecondRatio;
			const tryList = async (list, accept) => {
				for (const j of list) {
					if (nextA >= 0 && j === nextA) continue;
					await pause();
					const f = same[j];
					const r = verifySeam(key.plane, f.plane, pos.get(f) - pk);
					if (ok(r)) { pushPick(key, f, r); key = f; return true; }
					if (accept && accept(r)) { pushPick(key, f, r, true); key = f; return true; }
				}
				return false;
			};
			const gapOf = (j) => pos.get(same[j]) - pk;
			if (opts.preferStill) {
				// 止まっている候補（位置が minShift〜maxGap 先）を遠いほうから
				const st = [];
				for (let j = end; j > k; j--) if (same[j].stillRep && gapOf(j) >= opts.minShift && gapOf(j) <= maxGap) st.push(j);
				// 今の1枚が動いている画（タッチのエフェクトが写る。区切りの頭が動いている間に写った1枚など）なら、近いほうから（T109。遠い止まりを選ぶと、
				// 動いている画の画素がそのまま結合画像に残る。近い止まりなら組み立てで重なる所をその画素で上書きできる）
				if (!key.still) st.reverse();
				if (await tryList(st, okStill)) continue;
				// 次の止まり（かアンカー）が maxGap より遠い: 間の動いているフレームを足す。次の止まりに届く範囲で、真ん中に近いものから
				let goal = -1;
				for (let j = k + 1; j <= end; j++) if ((same[j].stillRep || anchorSet.has(same[j])) && gapOf(j) > maxGap) { goal = j; break; }
				if (goal >= 0 && gapOf(goal) <= maxGap * 2) {
					const gg = gapOf(goal);
					const mv = [];
					for (let j = k + 1; j < goal; j++) { const g = gapOf(j); if (g >= opts.minShift && g >= gg - maxGap && g <= maxGap) mv.push(j); }
					mv.sort((p, q) => Math.abs(gapOf(p) - gg / 2) - Math.abs(gapOf(q) - gg / 2));
					if (await tryList(mv)) continue;
				}
			}
			// 前に進む候補（位置が minShift 以上先・予測の重なりが target 以上）を遠いほうから
			const cands = [];
			for (let j = end; j > k; j--) {
				const g = gapOf(j);
				if (g >= opts.minShift && cH - g >= opts.target * cH) cands.push(j);
			}
			if (await tryList(cands)) picked = true;
			if (picked) continue;
			// 候補が無い: 終わり（この先に前へ進むフレームが無い）か、次のフレームが遠すぎる
			let further = -1;
			for (let j = k + 1; j <= end; j++) if (pos.get(same[j]) - pk >= opts.minShift) { further = j; break; }
			if (further < 0) {
				if (nextA >= 0) { const fa = same[nextA]; const r = verifySeam(key.plane, fa.plane, pos.get(fa) - pk); pushPick(key, fa, r, !ok(r)); key = fa; continue; }
				break;
			}
			const f = same[further];
			if (f.t - key.t > fine + 1e-6 && await densify(key, f)) {
				// 細かく取り直したフレームの位置を補う。1つ前のフレームから軌跡と同じ測り方で（T85。key から verifySeam で測ると、
				// 止まっている区間で「ずれ 0」を表せず 1画面先にしてしまい、ほぼ同じ画を2枚目に選ぶことがあった。T83 §2）
				for (let j = idx(key) + 1; j < idx(f); j++) {
					const e = same[j];
					if (pos.has(e)) continue;
					await pause();
					const pe = same[j - 1], pp = same[j - 2];
					// 予測は1つ前の組のずれを時間の比で縮める（細かく取り直したフレームは間隔が短い）
					const pred = pe.stepPrev > 0 && pp && pe.t > pp.t ? Math.round(pe.stepPrev * (e.t - pe.t) / (pe.t - pp.t)) : null;
					let st = stepShift(pe, e, pred > 0 ? pred : null);
					if (st == null) st = await microStep(pe, e);
					if (st != null) { pos.set(e, pos.get(pe) + st); e.stepPrev = st; continue; }
					const r = verifySeam(key.plane, e.plane);
					pos.set(e, ok(r) ? pk + r.shift : pk + cH);
				}
				continue;
			}
			const r = verifySeam(key.plane, f.plane, pos.get(f) - pk);
			pushPick(key, f, r, !ok(r)); key = f;
		}
		// 一番下で行き過ぎて戻った（ゴムのような跳ね返り）あとに止まった区間があれば、末尾の1枚をその区間の画に置き換える（T132・決定 483）。
		// 行き過ぎた画は指が触れたばかりでエフェクトが写り、一覧の下の余白も入る。戻ったあとの止まった画は写っていない
		// （速い動画 A-2 の 3.375秒 → 3.75秒。T129 §3 原因4）。末尾の1枚から −0.15cH〜+20px の位置の止まりだけを見る
		let settledEnd = 0;
		if (picks.length >= 2) {
			const last = picks[picks.length - 1];
			let fl = null;
			for (const f of same) if (f.stillRep && f.t > last.t && pos.has(f)) fl = f;
			const dp = fl ? pos.get(fl) - pos.get(last) : null;
			if (fl && !anchorSet.has(last) && dp >= -Math.round(cH * 0.15) && dp <= 20) {
				const prev = picks[picks.length - 2];
				const r = verifySeam(prev.plane, fl.plane, pos.get(fl) - pos.get(prev));
				const okS = r && r.shift > 0 && isFinite(r.badRate) && r.badRate < opts.okBad * 2 && ratioOf(r) >= opts.warnSecondRatio;
				if (ok(r) || okS) { picks.pop(); seams.pop(); pushPick(prev, fl, r, !ok(r)); settledEnd++; }
			}
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
		// 取り直した等倍の画を縮めて、選ぶときの縮小画と比べる（T85。T83 の案1 (b)）。iPhone の Safari ではシークした時刻と描かれた画が
		// 合わないことがある（T83 §2）。合わなければ、同じ時刻（次の画が出るのを待つ＝案4）→ 少し後 の順に取り直し、いちばん合う画を使う
		const grabPlanes = [], grabDeltas = [];
		// タッチのエフェクトの置き換え（T90）: 動いている画（止まっている区間の画でない）のうち、止まっている画に覆われない所だけが
		// 結合画像に残る（composePerson の o.still）。その所に写るエフェクト（蹄鉄・星・光。指の位置＝画面に付いていて、中身と一緒には
		// 動かない）を、前後の実フレーム（1/60秒刻み・中身が 120px 以上ずれているもの2枚）との区画（16行×24列の縮小画）ごとの多数決で
		// 見分ける: 自分だけが2枚と違い、2枚どうしは合う区画を、近いほうの画の画素で置き換える。出どころが正確（復号・作り物）なときだけ
		// BH・BW は半分の幅の画（W/2）での区画の大きさ。T は区画の平均の差の基準。DMIN は候補の画の中身のずれの下限（エフェクトの大きさより大きく）
		// 出どころが「同じ時刻には必ず同じ画」（復号の出どころ・作り物）のときだけ。video 要素のシークでは、前後の画そのものが頼んだ時刻と合わない
		// DSEP は候補どうしの中身のずれの下限（エフェクトが2枚で同じ中身の位置に重ならないように。最大3枚で、全部が互いに合う区画だけ置き換える）
		const E3 = { on: opts.effectVote !== false && source.exact === true, BH: 16, BW: 16, T: 5, DMIN: 120, DSEP: 140, NALT: 3, Q: 6 };
		const posG = [0];
		for (let i = 0; i < seams.length; i++) posG.push(posG[i] + (seams[i].overlap != null ? cH - seams[i].overlap : cH));
		const stillIdx = []; picks.forEach((p, i) => { if (p.still) stillIdx.push(i); });
		let effectPicks = 0, effectBlocks = 0, effectNoAlt = 0, effectCands = 0, effectCopiedRows = 0;
		const altCanvas = document.createElement('canvas');
		if (E3.on) { altCanvas.width = W; altCanvas.height = H; }
		const actx = altCanvas.width ? altCanvas.getContext('2d', { willReadFrequently: true }) : null;
		const wideBand = () => ({ gray: toGray(sctx.getImageData(0, hE, sw, cH).data), w: sw, h: cH });
		// 多数決は半分の幅の画で（1/6 では小さな粒子が平均に出ない）。ずれ（縦）は等倍と同じ
		const hw = Math.max(32, Math.round(W / 2));
		const hc = document.createElement('canvas');
		if (E3.on) { hc.width = hw; hc.height = H; }
		const hctx = hc.width ? hc.getContext('2d', { willReadFrequently: true }) : null;
		// gray のほかに col（色の鮮やかさ＝RGB の最大−最小。灰色の地に乗るパステルの粒子は、明るさの差は小さくても鮮やかさの差が大きい）
		async function halfBand(t) {
			await pause(); await untilAbort(source.drawAt(t, hctx, hw, H, signal), signal);
			const d = hctx.getImageData(0, hE, hw, cH).data;
			const col = new Uint8Array(d.length / 4);
			for (let i = 0, p = 0; i < col.length; i++, p += 4) { const r = d[p], g = d[p + 1], b = d[p + 2]; col[i] = Math.max(r, g, b) - Math.min(r, g, b); }
			return { gray: toGray(d), col: { gray: col, w: hw, h: cH }, w: hw, h: cH };
		}
		const sameGray = (a, b) => { for (let i = 0; i < a.length; i += 61) if (a[i] !== b[i]) return false; return true; };
		// 区画の平均の差（a の行 ya〜・b の行 yb〜、列 x0〜x0+bw）
		// 区画の差: 平均（mean）と、行の平均が 3 を超える行の数（rows。横の縁の1行だけが違うものを除く）
		const blockDiff = (a, ya, b, yb, x0, bw, n) => { let s = 0, c = 0, rows = 0; for (let y = 0; y < n; y++) { const ra = (ya + y) * a.w, rb = (yb + y) * b.w; let rs = 0; for (let x = x0; x < x0 + bw; x++) rs += Math.abs(a.gray[ra + x] - b.gray[rb + x]); s += rs; c += bw; if (rs > 3 * bw) rows++; } return { mean: c ? s / c : 0, rows }; };
		// owned[y]（画の中の行）が 0 の区間（[lo, hi)・8行以上）
		function regionsOf(owned) {
			const out = [];
			for (let y = 0; y < cH;) { if (owned[y]) { y++; continue; } let e = y; while (e < cH && !owned[e]) e++; if (e - y >= 8) out.push([y, e]); y = e; }
			return out;
		}
		const e3Trace = (o) => { if (opts.debug) (opts.debug.e3 = opts.debug.e3 || []).push(o); };
		async function voteOutEffects(i, p) {
			const isStill = !!p.still;
			const owned = new Uint8Array(cH);
			let covers = [];
			if (!isStill) {
				// 1. 動いている画: 止まっている画（どの人のでも）に覆われる行は、その画の画素をそのまま写す（composePerson はその人の画しか
				//    使えない。人の1枚目〔区切り〕の頭より上の行は前の人の末尾で、前の人の止まっている画に覆われていることが多い）。
				//    時間の近い画から。先に取り直した画（k < i）はエフェクトを消したあとの静止画（files[k]）から写す
				covers = stillIdx.map((k) => ({ k, lo: Math.max(posG[k], posG[i]) - posG[i], hi: Math.min(posG[k] + cH, posG[i] + cH) - posG[i] })).filter((c) => c.hi - c.lo >= 8)
					.sort((a, b) => Math.abs(picks[a.k].t - p.t) - Math.abs(picks[b.k].t - p.t));
				//    あとで取り直す画（k > i）に覆われる行は、写さずに「覆われる」とだけ覚える（同じ人の画なら composePerson がその画で上書きし、
				//    次の人の画なら区切りの頭より下で切り落とされる。復号し直しも減る）
				for (const c of covers) {
					let need = false;
					for (let y = c.lo; y < c.hi; y++) if (!owned[y]) { need = true; break; }
					if (!need) continue;
					if (c.k > i || !files[c.k]) { for (let y = c.lo; y < c.hi; y++) owned[y] = 1; continue; }
					// 写す前に、選ぶときの縮小画どうしで重なりを測って確かめる（継ぎ目のずれの見込みが外れていたら写さない）
					let off = posG[i] - posG[c.k];   // 自分の行 y は、止まっている画の行 y + off
					const sp = picks[c.k].plane, mp = p.plane;
					let okOff = false;
					if (!sp || !mp) okOff = false;
					// 確かめは「ずれの見込みの近くに、はっきりした最小がある」ことで（不一致の絶対値では見ない。動いている画にエフェクトが写っていると
					// 正しいずれでも不一致が 5% を超え、写せなくなる）: 見込み ±6 の最小が、±8〜14 の最小の 0.6 倍未満で、0.2 未満
					else {
						const peak = (a, b, d0) => { const c = scanRange(a, b, d0 - 6, d0 + 6, 2, 2), lo = scanRange(a, b, d0 - 14, d0 - 8, 2, 2), hi = scanRange(a, b, d0 + 8, d0 + 14, 2, 2); const edge = Math.min(lo.badRate, hi.badRate); return c.shift > 0 && c.badRate < 0.2 && c.badRate < edge * 0.6 ? c.shift : 0; };
						if (off > 0) { const s2 = peak(sp, mp, off); if (s2) { okOff = true; off = s2; } }
						else if (off < 0) { const s2 = peak(mp, sp, -off); if (s2) { okOff = true; off = -s2; } }
						else okOff = badNear0(mp, sp) < 0.08;
					}
					if (!okOff) continue;
					await pause();
					actx.drawImage(await untilAbort(loadImage(files[c.k]), signal), 0, 0, W, H);
					for (let y = c.lo; y < c.hi;) {
						if (owned[y]) { y++; continue; }
						let e = y; while (e < c.hi && !owned[e]) e++;
						fctx.drawImage(altCanvas, 0, hE + y + off, W, e - y, 0, hE + y, W, e - y);
						for (let q = y; q < e; q++) owned[q] = 1;
						effectCopiedRows += e - y;
						y = e;
					}
				}
			}
			const regions = isStill ? [[0, cH]] : regionsOf(owned);
			e3Trace({ i, t: p.t, still: isStill, posG: posG[i], copied: covers.map((c) => [picks[c.k].t, c.lo, c.hi]), regions });
			if (!regions.length) { effectPicks++; return; }
			// 2. 多数決: 自分と前後の実フレーム（1/60秒刻み）の縮小画（帯の全幅のグレー）。止まっている画は、止まっている区間（same の still が続く所）の
			//    外の実フレームを候補にする（区間の中は同じ中身で、指を止めたまま残る粒子も同じ）。時間の順に取る（復号は前へ進めるだけなので）
			const ts = [];
			let t0 = p.t, t1 = p.t;
			if (isStill) {
				let a = same.indexOf(p), b = a;
				while (a > 0 && same[a - 1].still) a--;
				while (b < same.length - 1 && same[b + 1].still) b++;
				t0 = same[a].t; t1 = same[b].t;
			}
			// 候補は後ろ 1〜Q 枚 → 足りなければ前 1〜Q 枚 → それでも足りなければ後ろ・前の Q+1〜2Q 枚（ゆっくりのスクロールは 1/60秒で数px しか動かない）
			const Q = E3.Q * 2;
			const after = [], before = [], after2 = [], before2 = [];
			for (let q = 1; q <= Q; q++) after.push(t1 + q / 60);
			for (let q = Q; q >= 1; q--) before.push(t0 - q / 60);
			for (let q = Q + 1; q <= Q * 2; q++) after2.push(t1 + q / 60);
			for (let q = Q * 2; q > Q; q--) before2.push(t0 - q / 60);
			const cands = [];
			let pm = null;
			// 自分に対するずれ d（候補の行 y ＝ 自分の行 y + d。正＝候補のほうが先へ進んでいる）。
			// まず軌跡（same の前後の記録を時間で按分）の見込みの近く（±100）を細かく、外れたら粗い全範囲
			const pPos = pos.get(p);
			const guess = (tt) => {
				let b0 = null, a0 = null;
				for (const f of same) { if (!pos.has(f)) continue; if (f.t <= tt) b0 = f; else { a0 = f; break; } }
				if (b0 && a0) return pos.get(b0) + (pos.get(a0) - pos.get(b0)) * (tt - b0.t) / (a0.t - b0.t) - pPos;
				return b0 ? pos.get(b0) - pPos : a0 ? pos.get(a0) - pPos : null;
			};
			const measure = (c) => {
				let r = null;
				const g0 = pPos != null ? guess(c.t) : null;
				if (g0 != null && Math.abs(g0) >= 1) {
					const d0 = Math.round(g0);
					const rr = d0 > 0 ? scanRange(pm, c.plane, d0 - 100, d0 + 100, 2, 2) : scanRange(c.plane, pm, -d0 - 100, -d0 + 100, 2, 2);
					if (rr.shift > 0 && rr.badRate < 0.04) r = { d: d0 > 0 ? rr.shift : -rr.shift, rate: rr.badRate };
				}
				if (!r) {
					const f = coarseScan(pm, c.plane, opts.coarseYs, opts.coarseXs), b = coarseScan(c.plane, pm, opts.coarseYs, opts.coarseXs);
					if (f.shift > 0 && f.badRate <= b.badRate) { const rr = scanRange(pm, c.plane, f.shift - 10, f.shift + 10, 2, 2); if (rr.shift > 0) r = { d: rr.shift, rate: rr.badRate }; }
					else if (b.shift > 0) { const rr = scanRange(c.plane, pm, b.shift - 10, b.shift + 10, 2, 2); if (rr.shift > 0) r = { d: -rr.shift, rate: rr.badRate }; }
				}
				if (r && r.rate < 0.04) { c.d = r.d; c.rate = r.rate; }
			};
			const choose = () => {
				const usable = cands.filter((c) => c.d != null && Math.abs(c.d) >= E3.DMIN).sort((a, b) => Math.abs(a.t - p.t) - Math.abs(b.t - p.t));
				const out = [];
				for (const c of usable) { if (out.every((a) => Math.abs(a.d - c.d) >= E3.DSEP)) out.push(c); if (out.length === E3.NALT) break; }
				return out;
			};
			// 自分 → 後ろの候補（復号は前へ進むだけで済む）→ 足りなければ前の候補（キーフレームから復号し直す）
			const take = async (list) => {
				let prevG = null;
				for (const tt of list) {
					if (tt < 0 || tt > D - 0.02) continue;
					await pause();
					await untilAbort(source.drawAt(tt, sctx, sw, H, signal), signal);
					const g = wideBand();
					if (isBlankGray([g.gray], opts.blankRatio) || (prevG && sameGray(prevG, g.gray))) continue;
					prevG = g.gray;
					// 自分とほぼ同じ画（止まっている区間の中）は候補にしない（ずれ 0 は測れず、残る粒子も同じ）
					if (badNear0(pm, g) < opts.stillBad) continue;
					const c = { t: tt, plane: g };
					measure(c);
					cands.push(c);
				}
			};
			await pause();
			await untilAbort(source.drawAt(p.t, sctx, sw, H, signal), signal);
			pm = wideBand();
			await take(after);
			let alts = choose();
			if (alts.length < 2) { await take(before); alts = choose(); }
			if (alts.length < 2) { await take(after2); alts = choose(); }
			if (alts.length < 2) { await take(before2); alts = choose(); }
			effectCands += cands.length;
			e3Trace({ i, t: p.t, cands: cands.map((c) => [c.t, c.d == null ? null : c.d, c.rate == null ? null : +c.rate.toFixed(3)]), alts: alts.map((c) => c.t) });
			if (alts.length < 2) { effectNoAlt++; return; }
			// 区画ごとの多数決（半分の幅の画で。自分と候補を時間の順に取る）
			const trio = [{ t: p.t, d: 0, me: true }, ...alts].sort((x, y) => x.t - y.t);
			for (const e of trio) e.half = await halfBand(e.t);
			const hm = trio.find((e) => e.me).half;
			const coverOk = (a, y, n) => y - a.d >= 0 && y - a.d + n <= cH;
			const cells = new Map(); // key → { y, n, x0, bw, d, ee, rows, k, ke, flag }
			// 両端の約3.5%（右はスクロールバー〔動いている間だけ出る〕、左は一覧の外の背景。結合画像では両側を削る）は見ない
			const xMin = Math.ceil(hw * 0.035), xMax = Math.floor(hw * 0.965);
			for (const [lo, hi] of regions) {
				for (let y = lo; y + 8 <= hi; y += E3.BH) {
					const n = Math.min(E3.BH, hi - y);
					// その行を写している候補だけで（2枚以上）。遠くへ進んだ候補は上のほうの行を写していない
					const av = alts.filter((a) => coverOk(a, y, n));
					if (av.length < 2) continue;
					for (let x0 = xMin; x0 < xMax; x0 += E3.BW) {
						const bw = Math.min(E3.BW, xMax - x0);
						if (bw < 6) continue;
						// 自分と各候補の差（明るさ b・鮮やかさ c）と、候補どうしの差の最大（ee・ce）
						const bs = av.map((a) => blockDiff(hm, y, a.half, y - a.d, x0, bw, n)), cs = av.map((a) => blockDiff(hm.col, y, a.half.col, y - a.d, x0, bw, n));
						let ee = 0, ce = 0;
						for (let u = 0; u < av.length; u++) for (let v = u + 1; v < av.length; v++) {
							ee = Math.max(ee, blockDiff(av[u].half, y - av[u].d, av[v].half, y - av[v].d, x0, bw, n).mean);
							ce = Math.max(ce, blockDiff(av[u].half.col, y - av[u].d, av[v].half.col, y - av[v].d, x0, bw, n).mean);
						}
						const d = Math.min(...bs.map((b) => b.mean)), rows = Math.min(...bs.map((b) => b.rows)), k = Math.min(...cs.map((c) => c.mean)), krows = Math.min(...cs.map((c) => c.rows));
						// 自分だけが全部の候補と違い（2行以上で）、候補どうしは全部合う区画。明るさで（大きなエフェクト）、または鮮やかさで（淡い粒子）
						// （16行の区画では、小数点以下の位置で描かれた横の縁の1行の差は平均 3 ほどで T に届かないので、明るさの側に行数の条件は置かない）
						const flag = (d > E3.T && ee < 8 && ee < d * 0.5) || (k > 4 && krows >= 2 && ce < 1.5 && ce < k / 3) || (k > 3 && krows >= 3 && ce < 0.6);
						cells.set(y + ':' + x0, { y, n, x0, bw, d, ee, rows, k, ke: ce, flag, src: av[0] });   // 置き換えの元は、その行を写す候補のうち時間の近いもの
					}
				}
			}
			const flagged = Array.from(cells.values()).filter((c) => c.flag);
			if (opts.debug && opts.debug.cells) opts.debug.cells.push({ t: p.t, alts: alts.map((x) => [x.t, x.d]), cells: Array.from(cells.values()).map((c) => [c.y, c.x0, +c.d.toFixed(1), +c.ee.toFixed(1), c.rows, c.flag ? 1 : 0, +c.k.toFixed(1), +c.ke.toFixed(1)]) });
			if (!flagged.length) return;
			// 隣の区画も、候補どうしがよく合い（ee < 3）自分が少し違う（2.5 以上・2行以上）なら置き換える（エフェクトの淡い縁）
			for (const c of flagged.slice()) {
				for (const [dy, dx] of [[-E3.BH, 0], [E3.BH, 0], [0, -E3.BW], [0, E3.BW]]) {
					const nb = cells.get((c.y + dy) + ':' + (c.x0 + dx));
					if (nb && !nb.flag && ((nb.ee < 3 && nb.d > 2.5 && nb.rows >= 2) || (nb.ke < 1 && nb.k > 2))) { nb.flag = true; flagged.push(nb); }
				}
			}
			// 等倍で置き換える（区画ごとに、その行を写す時間の近い候補の画素で。候補ごとに等倍で1回描く）
			const fx = (x) => Math.round(x * W / hw);
			for (const a of alts) {
				const mine = flagged.filter((c) => c.src === a);
				if (!mine.length) continue;
				await pause();
				await untilAbort(source.drawAt(a.t, actx, W, H, signal), signal);
				for (const c of mine) fctx.drawImage(altCanvas, fx(c.x0), hE + c.y - a.d, fx(c.x0 + c.bw) - fx(c.x0), c.n, fx(c.x0), hE + c.y, fx(c.x0 + c.bw) - fx(c.x0), c.n);
			}
			effectPicks++; effectBlocks += flagged.length;
			if (opts.debug) (opts.debug.effects = opts.debug.effects || []).push({ t: p.t, regions, alts: alts.map((x) => ({ t: x.t, d: x.d, rate: +x.rate.toFixed(4) })), blocks: flagged.map((c) => [c.y, c.x0, +c.d.toFixed(1), +c.ee.toFixed(1), +c.k.toFixed(1), +c.ke.toFixed(1)]) });
		}
		let grabMismatch = 0, grabFixed = 0, grabShifted = 0;
		// 取り直した画が、縮小画の何 px 先（後）の画か。重なりがほぼ全面なので、となりの画どうしより確かに測れる
		const grabDelta = (sp, gp) => {
			const nr = nearShift(sp, gp, opts.nearWin);
			if (nr.rate < opts.stillBad) return nr.dy;
			const f = scanRange(sp, gp, 1, opts.deltaWin, opts.seamYs, opts.seamXs);
			const b = scanRange(gp, sp, 1, opts.deltaWin, opts.seamYs, opts.seamXs);
			const best = f.badRate <= b.badRate ? { d: f.shift, r: f.badRate } : { d: -b.shift, r: b.badRate };
			return best.d && best.r < opts.okBad ? best.d : null;
		};
		const grabMatchOf = (p) => {
			sctx.drawImage(full, 0, 0, W, H, 0, 0, sw, H);
			const g = planeFromSmall();
			return g ? { plane: g, bad: badNear0(g, p.plane) } : null;
		};
		for (let i = 0; i < picks.length; i++) {
			await pause();
			const p = picks[i];
			let t = p.t, tries = 0;
			while (true) {
				await untilAbort(source.drawAt(t, fctx, W, H, signal), signal);
				if (!isBlankCanvas(fctx, W, H, opts.blankRatio)) break;
				// シークの直後に描けていない（真っ白・真っ黒）。同じ時刻をもう一度 → 少しずらして取り直す
				if (++tries > opts.grabRetry) throw framesError('blank-grab', '動画のフレームを描けない: ' + p.t);
				grabRetries++;
				t = tries === 1 ? p.t : Math.min(D - 0.01, p.t + (tries - 1) / 120);
			}
			let m = grabMatchOf(p);
			if (m && m.bad >= opts.grabMatch) {
				grabMismatch++;
				m.delta = grabDelta(p.plane, m.plane);
				let best = { m, img: fctx.getImageData(0, 0, W, H) };
				const better = (x, y) => (x.bad < opts.grabMatch) !== (y.bad < opts.grabMatch) ? x.bad < opts.grabMatch
					: (x.delta != null) !== (y.delta != null) ? x.delta != null
					: x.delta != null ? Math.abs(x.delta) < Math.abs(y.delta) : x.bad < y.bad;
				for (const dt of opts.grabRetryDt) {
					await pause();
					const tt = Math.max(0, Math.min(D - 0.01, p.t + dt));
					await untilAbort(source.drawAt(tt, fctx, W, H, signal, { waitFrame: true }), signal);
					if (isBlankCanvas(fctx, W, H, opts.blankRatio)) continue;
					const m2 = grabMatchOf(p);
					if (!m2) continue;
					if (m2.bad >= opts.grabMatch) m2.delta = grabDelta(p.plane, m2.plane);
					if (better(m2, best.m)) best = { m: m2, img: fctx.getImageData(0, 0, W, H) };
					if (m2.bad < opts.grabMatch) break;
				}
				if (best.m.bad < opts.grabMatch) grabFixed++;
				else if (best.m.delta != null) grabShifted++;
				fctx.putImageData(best.img, 0, 0);
				m = best.m;
			}
			// 動いている画のエフェクトを前後の実フレームとの多数決で置き換える（T90）。置き換えたら、測り直しに使う縮小画も作り直す
			if (opts.debug && i === 0) e3Trace({ on: E3.on, kind: source.kind, moving: picks.filter((q) => !q.still).length });
			if (E3.on) {
				const before = effectBlocks + effectCopiedRows;
				await voteOutEffects(i, p);
				if (effectBlocks + effectCopiedRows !== before) { sctx.drawImage(full, 0, 0, W, H, 0, 0, sw, H); const g = planeFromSmall(); if (g) m = { plane: g, bad: m ? m.bad : 0, delta: m ? m.delta : null }; }
			}
			grabPlanes.push(m ? m.plane : p.plane);
			// 縮小画に対する取り直した画のずれ（正＝取り直した画のほうが下へ進んでいる）。合っていれば 0・測れなければ null
			grabDeltas.push(!m ? 0 : m.bad < opts.grabMatch ? 0 : m.delta);
			if (opts.normalizeFixed) {
				if (!fixedTop) { fixedTop = fctx.getImageData(0, 0, W, keepTop); fixedBottom = fctx.getImageData(0, keepBottomY, W, H - keepBottomY); }
				else { fctx.putImageData(fixedTop, 0, 0); fctx.putImageData(fixedBottom, 0, keepBottomY); }
			}
			const blob = await untilAbort(new Promise((res) => full.toBlob(res, opts.grabType, opts.grabQ)), signal);
			if (!blob) throw framesError('encode', '静止画にできない');
			files.push(new File([blob], 'frame-' + String(Math.round(p.t * 1000)).padStart(6, '0') + ext, { type: opts.grabType }));
			progress('grab', i + 1, picks.length);
		}
		full.width = full.height = 0; sc.width = sc.height = 0; altCanvas.width = altCanvas.height = 0; hc.width = hc.height = 0;
		// となりどうしのずれを、取り直した画どうしで測り直す（T85。T83 の案1 (c)）。まず選ぶときのずれの近く（±remeasureWin）、
		// 外れたら粗い全範囲 → 近くだけ。どちらも確かでなければ選ぶときの値のまま「確かでない継ぎ目」にする
		let remeasureMoved = 0, remeasureFull = 0, remeasureFail = 0, remeasureByDelta = 0;
		for (let i = 0; i < seams.length; i++) {
			await pause();
			const s = seams[i], a = grabPlanes[i], b = grabPlanes[i + 1];
			const sel0 = s.overlap != null ? cH - s.overlap : cH;
			// 選ぶときのずれに、取り直した画のずれを足した見込み
			const known = grabDeltas[i] != null && grabDeltas[i + 1] != null && s.overlap != null;
			const s0 = known ? sel0 + grabDeltas[i + 1] - grabDeltas[i] : sel0;
			const win = opts.remeasureWin;
			let shift = null;
			const r = scanRange(a, b, s0 - win, s0 + win, opts.seamYs, opts.seamXs);
			// 取り直した画のずれが分かっているときは、見込みの近くの当たりを「確かでない継ぎ目」の基準（warnBadRate）まで認める
			// （速い所の動いている画はぶれて、正しいずれでも不一致が 2〜4% になる）
			const tol = known ? opts.warnBadRate : opts.okBad;
			if (r.shift > 0 && r.badRate < tol && r.shift > s0 - win && r.shift < s0 + win) shift = r.shift;
			else {
				const v = verifySeam(a, b, s0);
				if (ok(v)) { shift = v.shift; remeasureFull++; }
				else if (known && s0 !== sel0 && s0 >= opts.minShift && s0 <= cH - 60) { shift = s0; remeasureByDelta++; }
			}
			if (shift == null) { remeasureFail++; s.uncertain = true; continue; }
			if (shift !== s0) remeasureMoved++;
			s.shift = shift; s.overlap = cH - shift;
		}
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
				uncertain: sm.map((x) => x.uncertain),
				still: fi.map((k) => !!picks[k].still)   // 止まっている区間の画か（組み立てで、その画素を優先する。T90）
			};
		});
		tm.totalMs = performance.now() - T0;
		// 手元の調べ用（T85）: opts.debug（空のオブジェクト）を渡すと、軌跡（時刻・位置・ずれ・頭・止まり）を入れて返す
		if (opts.debug) opts.debug.track = same.map((f) => ({ t: f.t, pos: pos.has(f) ? pos.get(f) : null, step: f.stepPrev, heads: f.heads, fine: !!f.fine, still: !!f.still, rep: !!f.stillRep }));
		return {
			version: VIDEO_FRAMES_JS_VERSION,
			video: { W, H, D }, xs: opts.xs, fps: opts.fps,
			header: { headerEnd: hE, footer, contentH: cH },
			anchors: anchorEntries.map((a) => ({ t: a.t, y: a.anchorY })),
			picks: picks.map((p) => p.t), seams, files, persons,
			stats: { sampled: times.length, blankSkipped, sameScreen: same.length, dropped, densified, stills, backs, local, localFallback, coarse, verifies, grabRetries,
				nears, headHints, predVerifies, loose, micros, stillRuns, stillPicks: picks.filter((p) => p.still).length, grabMismatch, grabFixed, grabShifted, remeasureMoved, remeasureFull, remeasureByDelta, remeasureFail,
				effectPicks, effectBlocks, effectNoAlt, effectCands, effectCopiedRows, settledEnd },
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
	 * o.still[i] が真の画（止まっている区間の画。タッチのエフェクトが写っていない）は、本文の帯を全部描いて、重なる所では
	 * 動いている画の画素を上書きする（T90）。動いている画の画素が残るのは、止まっている画どうしの間で見えていない所だけ。
	 * o.anchorY（persons[j].anchorY）を渡すと、1枚目の区切りの頭が帯の上のほうに無くても、その位置の頭から描く（T105）。
	 */
	function findPanelNear(canvas, y, win = 12) {
		const x = Math.floor(canvas.width * 0.3), y0 = Math.max(0, y - win), n = Math.min(canvas.height - y0, win * 2 + 1);
		if (n <= 0) return null;
		const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y0, 1, n).data;
		for (let i = 0; i < n; i++) if (isBlue(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) return y0 + i;
		return null;
	}
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
		let firstPanelTop = stitchDetectFirstSkillPanelTop(canvases[0], headerEnd);
		// 区切りの頭が stitch の探す範囲（帯の上から 0.25W）の下で初めて写った画（ホイールを大きく回したときの動いている1枚）: 選ぶ側で分かっている
		// 位置（o.anchorY）に頭があることを確かめて、その上を除く。探さないと帯の上端から描き、末尾の切り方が自分の頭で切って、人の画が途中で切れる（T105）
		if (firstPanelTop === headerEnd && o.anchorY > 0) {
			const found = findPanelNear(canvases[0], headerEnd + o.anchorY);
			if (found != null) firstPanelTop = found;
		}
		let skipFirst = Math.max(0, firstPanelTop - headerEnd);
		const profile = stitchDetectProfileHeader(canvases[0], headerEnd);
		let profileHeight = 0;
		if (profile.kept) { skipFirst = profile.top - headerEnd; profileHeight = firstPanelTop - profile.top; }
		const profileInfo = { kept: profile.kept, ratio: profile.ratio, height: profileHeight };
		const out = document.createElement('canvas');
		out.width = w0;
		out.height = totalContentHeight - skipFirst;
		const octx = out.getContext('2d');
		let placements = [];
		let cursorY = 0;
		const firstSrcY = headerEnd + skipFirst, firstDrawH = contentHeight - skipFirst;
		const tops = [-skipFirst];   // 各画の本文の帯の上端が、出力のどの行に当たるか
		octx.drawImage(canvases[0], 0, firstSrcY, w0, firstDrawH, 0, 0, w0, firstDrawH);
		placements.push({ fileIndex: 0, srcY0: firstSrcY, srcY1: firstSrcY + firstDrawH, outY0: 0 });
		cursorY += firstDrawH;
		for (let i = 1; i < canvases.length; i++) {
			const ov = overlaps[i - 1];
			const drawH = contentHeight - ov;
			if (drawH > 0) octx.drawImage(canvases[i], 0, headerEnd + ov, w0, drawH, 0, cursorY, w0, drawH);
			placements.push({ fileIndex: i, srcY0: headerEnd + ov, srcY1: headerEnd + ov + drawH, outY0: cursorY });
			tops.push(cursorY - ov);
			cursorY += drawH;
		}
		// 止まっている画の画素を優先する（T90）: 止まっている画は本文の帯を全部描き直し、動いている画と重なる所を上書きする。
		// 出力の行ごとにどの画の画素かを持ち直して、_sourcePlacements（結合画像の上の枠の置き場所の表引き）も合わせる
		const still = (o.still || []).map(Boolean);
		if (still.some(Boolean) && canvases.length > 1) {
			const owner = new Int16Array(out.height);
			for (const p of placements) for (let y = p.outY0; y < p.outY0 + (p.srcY1 - p.srcY0) && y < out.height; y++) owner[y] = p.fileIndex;
			let redrawn = 0;
			for (let i = 1; i < canvases.length; i++) {
				if (!still[i]) continue;
				let y0 = Math.max(0, tops[i]);
				const y1 = Math.min(out.height, tops[i] + contentHeight);
				if (y1 <= y0) continue;
				// 描き直しの上端（継ぎ目）は、上端から 160行の中で、いま描いてある画とこの画がいちばん合う行に置く（継ぎ目のずれが 1px あっても、
				// 段の切れ目など平らな所なら目立たない）。先頭の画（0番）の行は動かさない
				{
					const span = Math.min(160, y1 - y0);
					if (span > 8 && y0 > 0) {
						const a = octx.getImageData(0, y0, w0, span).data, b = canvases[i].getContext('2d').getImageData(0, headerEnd + (y0 - tops[i]), w0, span).data;
						let best = y0, bestD = Infinity;
						for (let y = 0; y < span; y++) {
							let s = 0, n = 0;
							for (let x = 0; x < w0; x += 4) { const q = (y * w0 + x) * 4; s += Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]); n += 3; }
							const d = s / n;
							if (d < bestD - 0.05) { bestD = d; best = y0 + y; }
						}
						y0 = best;
					}
				}
				let changed = false;
				for (let y = y0; y < y1; y++) if (owner[y] !== i) { owner[y] = i; changed = true; }
				if (!changed) continue;
				octx.drawImage(canvases[i], 0, headerEnd + (y0 - tops[i]), w0, y1 - y0, 0, y0, w0, y1 - y0);
				redrawn++;
			}
			if (redrawn) {
				placements = [];
				for (let y = 0; y < out.height;) {
					const f = owner[y]; let e = y + 1;
					while (e < out.height && owner[e] === f) e++;
					placements.push({ fileIndex: f, srcY0: headerEnd + (y - tops[f]), srcY1: headerEnd + (e - tops[f]), outY0: y });
					y = e;
				}
				stitchLog(groupLabel + ': 止まっている画の画素を優先（' + redrawn + '枚を描き直し・動いている画の画素が残る区間 ' + placements.filter((p) => !still[p.fileIndex]).length + '）');
			}
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
		LOAD_TIMEOUT_MS,
		DEFAULTS: Object.freeze(Object.assign({}, DEFAULTS)),
		videoSource,
		canvasSource,
		mp4Probe,
		mp4Source,
		openSource,
		selectFrames,
		composePerson,
		isAbortError,
		untilAbort
	});
})(typeof window !== 'undefined' ? window : globalThis);
