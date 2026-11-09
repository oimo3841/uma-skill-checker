// DMM版の横画面の直し（T156・2026-11-10・決定 635〜639）の検査。
// run-smoke.mjs の末尾から register159() で呼ばれる（塊の見出しはすべて「T156横画面」で始まる。
// `npm run test:visual -- --only=T156横画面` で回せる）。
//
// 直したこと（js/landscape-panel.js・js/pc-capture.js・special.html・exam.html。common.js・stitch.js は変えない）:
//  (1) 横画面の切り出しの出どころ（UmaLandscape.cropSource）は、どの大きさで頼まれても出す大きさに描いてから写す。前は小さく頼まれると
//      元の動画から直接小さく描き、選ぶ側の「取り直した画を縮めた画と合うか」が全部の画で外れ（不一致 約6%）、正しい継ぎ目まで「確かでない」になった。
//      ウィンドウの取り込みの横画面（pc-capture.js の cropSource・outW つき）も同じ部品を使う。縦画面の切り取りは今のまま。
//  (2) 取り込みの前後で、パネルが見つからなかった区間を切り落とす（matchSpan・trimSource）。頭に別の画があると「本文の帯が想定の範囲の外」で止まった。
//  (3) カーソルを消す処理（removePointer）: 横画面では一覧の左の動かない所（パネルの縁・ゲームの背景）を探す範囲から外し（findContentStart）、
//      1枚に何か所にも当たる形はカーソルとしない（maxHits）。重い繰り返しの途中でページに手番を返す（前は1枚に数分、ページが動かなかった）。
//  (4) DMM版の横画面の録画（wrapSource の出どころ。landscape の印つき）にも、取り込みと同じくカーソルを消す処理をかける。縦画面の動画は今のまま。

export async function register159(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const hasImages = fs.existsSync(path.join(REPO_ROOT, 'test-images', '2026-09-15_3', '2026-09-15_3_01.png'));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const open = async (page) => {
		const sp = await openPage(browser, base, page, { width: 375, height: 812 }, EMPTY);
		sp.page.setDefaultTimeout(120000);
		return sp;
	};

	await block('T156横画面 ―― (1) 横画面の切り出しの出どころは、小さく描いた画が出す大きさの画を縮めた画と同じ（取り込みも同じ部品）。縦画面の切り取りは今のまま', async () => {
		if (!hasImages) { assert(false, '前提: test-images/2026-09-15_3/2026-09-15_3_01.png がある（メインから写す）'); return; }
		const sp = await open('exam.html');
		try {
			const r = await sp.page.evaluate(async () => {
				// 横長の動画の画: DMM版の縦画面のスクショ（test-images）を、全画面の録画と同じ大きさ・位置（2880×1920・上下の黒い帯 150px・パネルの左端 384・幅 892）に置いたもの。
				// 切り出しの矩形は findPanel で。前の作り（小さく頼まれたら元の画から直接描く）では、この画で 5.8%・本物の全画面の録画の1枚で 7.1% が「合わない」だった（T156 の測り）
				const shot = await createImageBitmap(await (await fetch('/test-images/2026-09-15_3/2026-09-15_3_01.png')).blob());
				const W = 2880, H = 1920, k = 892 / shot.width;
				const c = document.createElement('canvas'); c.width = W; c.height = H;
				// 元の画は GPU の canvas（既定）にする。動画のフレームと同じ描き方の道を通る（willReadFrequently の canvas では前の作りとの差が出ない）
				const g = c.getContext('2d');
				g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
				g.fillStyle = 'rgb(205,220,195)'; g.fillRect(0, 150, W, H - 300);
				g.drawImage(shot, 384, 150, shot.width * k, shot.height * k);
				const base = () => UmaVideoFrames.canvasSource({ width: W, height: H, duration: 2, exact: true, draw: async (t, ctx, dw, dh) => { ctx.drawImage(c, 0, 0, dw, dh); } });
				const rect = UmaLandscape.findPanel(g.getImageData(0, 0, W, H));
				const diffOf = (a, b) => { let s = 0, mx = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); s += d; if (d > mx) mx = d; } return { mean: s / a.length, max: mx }; };
				// 選ぶ側の「取り直した画を縮めた画と合うか」（js/video-frames.js の badNear0 のずれ 0 と同じ数え方: グレーの差が 24 を超える画素の割合）
				const badOf = (a, b) => { let bad = 0, tot = 0; for (let i = 0; i < a.length; i += 8) { const ga = (a[i] * 77 + a[i + 1] * 150 + a[i + 2] * 29) >> 8, gb = (b[i] * 77 + b[i + 1] * 150 + b[i + 2] * 29) >> 8; if (Math.abs(ga - gb) > 24) bad++; tot++; } return +(bad / tot).toFixed(4); };
				const draw = async (src, w, h) => { const k = document.createElement('canvas'); k.width = w; k.height = h; const x = k.getContext('2d', { willReadFrequently: true }); await src.drawAt(1, x, w, h); return k; };
				const L = UmaLandscape.cropSource(base(), rect);
				const full = await draw(L, rect.outW, rect.outH);
				// 選ぶ側（selectFrames）と同じ: 幅の 1/6 に小さく描いた画と、出す大きさの画を同じ描き方で縮めた画
				const sw = Math.round(rect.outW / 6);
				const small = await draw(L, sw, rect.outH);
				const shrunk = document.createElement('canvas'); shrunk.width = sw; shrunk.height = rect.outH;
				shrunk.getContext('2d', { willReadFrequently: true }).drawImage(full, 0, 0, rect.outW, rect.outH, 0, 0, sw, rect.outH);
				const dSmall = badOf(small.getContext('2d').getImageData(0, 0, sw, rect.outH).data, shrunk.getContext('2d').getImageData(0, 0, sw, rect.outH).data);
				// 出す大きさの画は、静止画の切り出し（cropToCanvas）と同じ
				const still = UmaLandscape.cropToCanvas(c, rect);
				const dStill = diffOf(full.getContext('2d').getImageData(0, 0, rect.outW, rect.outH).data, still.getContext('2d').getImageData(0, 0, rect.outW, rect.outH).data);
				// 取り込み（pc-capture.js の cropSource・outW つき）も同じ画
				const P = UmaPcCapture.cropSource(base(), rect);
				const pfull = await draw(P, P.width, P.height);
				const dCap = diffOf(full.getContext('2d').getImageData(0, 0, rect.outW, rect.outH).data, pfull.getContext('2d').getImageData(0, 0, rect.outW, rect.outH).data);
				// 縦画面の窓の切り取り（outW なし）は、元の画のその所をそのまま（拡大しない）
				const prect = { x: 500, y: 10, w: 520, h: 940 };
				const Q = UmaPcCapture.cropSource(base(), prect);
				const q = await draw(Q, Q.width, Q.height);
				const ref = document.createElement('canvas'); ref.width = prect.w; ref.height = prect.h;
				ref.getContext('2d').drawImage(c, prect.x, prect.y, prect.w, prect.h, 0, 0, prect.w, prect.h);
				const dPort = diffOf(q.getContext('2d').getImageData(0, 0, prect.w, prect.h).data, ref.getContext('2d').getImageData(0, 0, prect.w, prect.h).data);
				return { dSmall, dStill, dCap, dPort, P: [P.width, P.height, P.kind], Q: [Q.width, Q.height, Q.kind], rect: [rect.ok, rect.x, rect.y, rect.w, rect.h, rect.outW] };
			});
			// 選ぶ側は 3% 以上で「合わない」とする（grabMatch）。小さく描く画はアンシャープマスクをかけない分だけ違う
			assert(r.rect[0] && r.rect[5] === 1170, '(1) 前提: 作り物の全画面の画でパネルを見つける', r.rect);
			// 今の作りは 0。前の作り（小さく頼まれたら元の画から直接描く）は、この検査のページでは 0.0023（本物の全画面の録画の1枚では 0.071）
			assert(r.dSmall < 0.001, '(1) 小さく描いた画は、出す大きさの画を同じ描き方で縮めた画とほぼ同じ（グレーの差 24 超の画素が 0.1% 未満。選ぶ側の取り直しの確かめが外れない）', r.dSmall);
			assert(r.dStill.mean < 1, '(1) 出す大きさの画は静止画の切り出し（cropToCanvas）と同じ（差の平均 1 未満）', r.dStill);
			assert(r.dCap.max === 0 && r.P[0] === 1170 && /^landscape:/.test(r.P[2]), '(1) 取り込みの横画面の切り取りは同じ部品（landscape:・1170px 幅・画素まで同じ）', [r.dCap, r.P]);
			assert(r.dPort.max === 0 && r.Q[0] === 520 && r.Q[1] === 940 && /^crop:/.test(r.Q[2]), '(1) 縦画面の窓の切り取りは今のまま（その所をそのまま・拡大しない）', [r.dPort, r.Q]);
		} finally { await sp.page.context().close(); }
	});

	await block('T156横画面 ―― (2) 取り込みの頭と終わりの「パネルが見つからない区間」を切り落とす（matchSpan・trimSource）。始めから終わりまで見つかっていれば切らない', async () => {
		const sp = await open('special.html');
		try {
			const r = await sp.page.evaluate(async () => {
				const a = { ok: true, x: 100, y: 50, w: 600, h: 1000 };
				const okAt = (at, dx) => ({ ok: true, x: 100 + (dx || 0), y: 50, w: 600, h: 1000, at });
				const ng = (at) => ({ ok: false, reason: 'aspect', at });
				// 0〜1.4秒はほかの画（全画面のゲームへ戻る間）・2.1〜5.6秒はパネル・6.3秒は窓の外へ
				const list1 = [ng(0), ng(0.7), ng(1.4), okAt(2.1), okAt(2.8, 1), okAt(3.5), okAt(4.2), okAt(4.9), okAt(5.6), ng(6.3)];
				const s1 = UmaPcCapture.matchSpan(list1, a, 6.6);
				// 始めから終わりまで見つかる（今までの取り込み）
				const list2 = [0, 0.7, 1.4, 2.1, 2.8].map((t) => okAt(t));
				const s2 = UmaPcCapture.matchSpan(list2, a, 3.2);
				// 切り落とした出どころ: 長さが縮み、時刻 0 は元の t0 の画
				const seen = [];
				const baseSrc = UmaVideoFrames.canvasSource({ width: 10, height: 10, duration: 6.6, draw: async (t) => { seen.push(+t.toFixed(3)); } });
				const tr = UmaPcCapture.trimSource(baseSrc, s1.t0, s1.t1);
				const k = document.createElement('canvas').getContext('2d');
				await tr.drawAt(0, k, 10, 10); await tr.drawAt(1, k, 10, 10);
				return { s1, s2, dur: tr.duration, seen, kind: tr.kind };
			});
			assert(Math.abs(r.s1.t0 - 2.1) < 1e-9 && Math.abs(r.s1.t1 - 6.3) < 1e-9, '(2) パネルが見つかった最初の時刻（2.1秒）から、最後の時刻＋調べる間隔（6.3秒）まで', r.s1);
			assert(r.s2.t0 === 0 && Math.abs(r.s2.t1 - 3.2) < 1e-9, '(2) 始めから終わりまで見つかっていれば 0 秒から終わりまで（切らない）', r.s2);
			assert(Math.abs(r.dur - 4.2) < 1e-9 && Math.abs(r.seen[0] - 2.1) < 1e-6 && Math.abs(r.seen[1] - 3.1) < 1e-6 && /^trim:/.test(r.kind), '(2) 切り落とした出どころは長さ 4.2秒・時刻 0 が元の 2.1秒', r);
		} finally { await sp.page.context().close(); }
	});

	await block('T156横画面 ―― (3) カーソルを消す処理: 横画面では一覧の左の動かない所を探す範囲から外し、カーソルを消す。主のスレッドを長くふさがない。縦画面の印の出どころでは今のまま（左端 0）', async () => {
		const sp = await open('special.html');
		try {
			const r = await sp.page.evaluate(async () => {
				// 作り物の取り込み: 幅 1170・高さ 2060、本文の帯 900〜1760。一覧は止まって動いてを繰り返す。左の 220px は動かない背景（縦の模様と暗い帯）、
				// 一覧の上の決まった所にカーソル（白い矢印・黒い縁）がずっと写っている
				const W = 1170, H = 2060, hE = 900, cH = 860, LEFT = 220, LIST = 2600;
				const list = document.createElement('canvas'); list.width = W; list.height = LIST;
				const lg = list.getContext('2d');
				lg.fillStyle = '#fff'; lg.fillRect(0, 0, W, LIST);
				for (let k = 0, y = 10; y < LIST - 90; k++, y += 96) {
					lg.fillStyle = 'rgb(222,222,226)'; lg.fillRect(260, y, 820, 80);
					lg.fillStyle = 'rgb(222,222,226)';
					for (let j = 0; j < 7; j++) { lg.fillStyle = 'rgb(' + (60 + (k * 37 + j * 11) % 90) + ',40,30)'; lg.fillRect(300 + j * 70 + (k * 13) % 30, y + 18 + (j % 2) * 6, 40 + (k * 7 + j * 5) % 25, 16); }
					lg.fillStyle = 'rgb(240,190,40)'; lg.fillRect(560 + (k % 3) * 40, y + 50, 24, 20);
				}
				const posAt = (t) => { const seg = [[0, 1, 0, 0], [1, 1.5, 0, 420], [1.5, 2.5, 420, 420], [2.5, 3, 420, 840], [3, 4, 840, 840], [4, 4.5, 840, 1260], [4.5, 6, 1260, 1260]]; for (const [a, b, p, q] of seg) if (t >= a && t < b) return p + (q - p) * (t - a) / (b - a); return 1260; };
				const frame = (t, ctx, dw, dh) => {
					const s = dw / W;
					ctx.save(); ctx.scale(s, dh / H);
					ctx.fillStyle = 'rgb(140,200,90)'; ctx.fillRect(0, 0, W, H);
					ctx.fillStyle = '#fff'; ctx.fillRect(0, hE, W, cH);
					ctx.drawImage(list, 0, Math.round(posAt(t)), W, cH, 0, hE, W, cH);
					// 左の動かない背景（縦の縞・濃淡）と暗い縦の帯
					for (let x = 0; x < LEFT; x += 4) { ctx.fillStyle = 'rgb(' + (150 + (x * 7) % 60) + ',' + (190 + (x * 3) % 40) + ',' + (120 + (x * 5) % 50) + ')'; ctx.fillRect(x, hE, 4, cH); }
					for (let y = hE; y < hE + cH; y += 6) { ctx.fillStyle = 'rgba(0,0,0,' + (0.05 + ((y * 7) % 30) / 100) + ')'; ctx.fillRect(0, y, LEFT, 6); }
					ctx.fillStyle = 'rgb(70,70,70)'; ctx.fillRect(180, hE + 120, 14, 190);
					// カーソル（決まった所）
					const cx = 760, cy = hE + 430;
					ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 40); ctx.lineTo(cx + 10, cy + 30); ctx.lineTo(cx + 18, cy + 46); ctx.lineTo(cx + 24, cy + 43); ctx.lineTo(cx + 16, cy + 28); ctx.lineTo(cx + 28, cy + 28); ctx.closePath();
					ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
					ctx.restore();
				};
				const makeSrc = (kind) => UmaVideoFrames.canvasSource({ kind, width: W, height: H, duration: 6, exact: true, draw: async (t, ctx, dw, dh) => { frame(t, ctx, dw, dh); } });
				const pngAt = async (t) => { const c = document.createElement('canvas'); c.width = W; c.height = H; frame(t, c.getContext('2d'), W, H); const b = await new Promise((r) => c.toBlob(r, 'image/png')); return new File([b], 'f' + t + '.png', { type: 'image/png' }); };
				const picks = [0.5, 2, 3.5, 5];
				const run = async (kind) => {
					const files = [];
					for (const t of picks) files.push(await pngAt(t));
					const pos = picks.map(posAt);
					const sel = { header: { headerEnd: hE, contentH: cH }, picks, files, persons: [{ files: files.slice() }],
						seams: pos.slice(1).map((p, i) => ({ overlap: cH - (p - pos[i]) })) };
					const track = [];
					for (let t = 0; t < 6; t += 1 / 16) { const p = posAt(t); track.push({ t: +t.toFixed(4), pos: p, still: Math.abs(posAt(t + 0.07) - p) < 1 && Math.abs(posAt(Math.max(0, t - 0.07)) - p) < 1 }); }
					const long = [];
					const ob = new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(e.duration); });
					ob.observe({ type: 'longtask' });
					const t0 = performance.now();
					const st = await UmaPcCapture.removePointer(makeSrc(kind), sel, track);
					const ms = performance.now() - t0;
					await new Promise((r) => setTimeout(r, 50));
					ob.disconnect();
					// カーソルの所が、カーソルの無い同じ画と同じになったか（直した画の数・カーソルの所の差）
					const after = [];
					for (let i = 0; i < files.length; i++) {
						const img = await createImageBitmap(sel.persons[0].files[i]);
						const a = document.createElement('canvas'); a.width = W; a.height = H; const ax = a.getContext('2d', { willReadFrequently: true }); ax.drawImage(img, 0, 0);
						const d = ax.getImageData(756, hE + 426, 36, 54).data;
						// 正解: その時刻の一覧（カーソルなし）
						const b = document.createElement('canvas'); b.width = 36; b.height = 54; const bx = b.getContext('2d', { willReadFrequently: true });
						bx.fillStyle = '#fff'; bx.fillRect(0, 0, 36, 54); bx.drawImage(list, 756, Math.round(posAt(picks[i])) + 426, 36, 54, 0, 0, 36, 54);
						const e = bx.getImageData(0, 0, 36, 54).data;
						let s = 0; for (let k = 0; k < d.length; k += 4) s += (Math.abs(d[k] - e[k]) + Math.abs(d[k + 1] - e[k + 1]) + Math.abs(d[k + 2] - e[k + 2])) / 3;
						after.push(+(s / (d.length / 4)).toFixed(1));
					}
					return { ms: Math.round(ms), longMax: Math.round(Math.max(0, ...long)), xStart: st.xStart, sprite: st.sprite, cells: st.cells, frames: st.frames, manyHits: st.manyHits, after, log: (typeof devGeometry !== 'undefined' ? devGeometry : []).filter((l) => /^\[動画\] カーソル/.test(l)).slice(-1)[0] || null };
				};
				const land = await run('landscape:test');
				const port = await run('crop:test');
				return { land, port };
			});
			// 値は半分の幅の画で。動かない背景は 0〜220px（半分で 110）。一覧の欄の地（260px〜）は白との差が小さく「動く」に数えないので、文字（300px〜・半分で 150）の手前（余裕 2）になる
			assert(r.land.xStart >= 110 && r.land.xStart <= 160, '(3) 横画面: 中身の左端（findContentStart）は動かない背景（半分の幅で 0〜110）より右・一覧の文字（150〜）の左端の手前', r.land.xStart);
			assert(r.land.cells >= 3 && r.land.after.every((v) => v < 6), '(3) 横画面: 4枚ともカーソルの所が、カーソルの無い一覧と同じになる（差の平均 6 未満）', r.land);
			assert(r.land.longMax < 1000, '(3) 横画面: 主のスレッドを 1秒以上ふさがない（重い繰り返しの途中で手番を返す）', r.land.longMax);
			assert(r.land.log && /カーソル: \d+ms/.test(r.land.log), '(3) 開発ログに [動画] カーソル: の行', r.land.log);
			assert(r.port.xStart === 0, '(3) 縦画面の印の出どころ（crop:）は左端 0（今のまま）', r.port.xStart);
		} finally { await sp.page.context().close(); }
	});

	for (const page of ['special.html', 'exam.html']) {
		await block('T156横画面 ―― (4) ' + page + ': DMM版の横画面の録画（landscape の印つきの出どころ）はカーソルを消す処理を通る。縦画面の動画は通らない（今のまま）', async () => {
			const sp = await open(page);
			try {
				const r = await sp.page.evaluate(async () => {
					const calls = [];
					const tiny = async () => { const c = document.createElement('canvas'); c.width = 4; c.height = 4; const b = await new Promise((res) => c.toBlob(res, 'image/png')); return new File([b], 'x.png', { type: 'image/png' }); };
					const orig = window.UmaVideoFrames;
					window.UmaVideoFrames = Object.assign({}, orig, {
						selectFrames: async (src, o) => {
							calls.push({ kind: 'select', effectVote: o.effectVote, debug: !!o.debug });
							if (o.debug) o.debug.track = [{ t: 0, pos: 0 }];
							const f = await tiny();
							return { persons: [0, 1, 2].map(() => ({ files: [f, f], shifts: [10], uncertain: [false], still: [true, true], anchorY: 0 })), files: [f], picks: [0], seams: [] };
						}
					});
					const rp = UmaPcCapture.removePointer;
					UmaPcCapture.removePointer = async (src, sel, track) => { calls.push({ kind: 'pointer', src: src.kind, track: track.length }); return {}; };
					const st = window.autoStitchVideoSet;
					window.autoStitchVideoSet = async () => false;
					const mk = (land) => Object.assign(orig.canvasSource({ kind: land ? 'landscape:test' : 'mp4:test', width: 100, height: 200, duration: 1, draw: async () => {} }), land ? { landscape: { rect: {} } } : {});
					const res = [];
					try {
						for (const land of [true, false]) {
							calls.length = 0;
							videoPending = { setIdx: 0 };
							const out = await onVideoChosen(mk(land), {});
							res.push({ land, ok: out.ok, calls: calls.slice() });
						}
					} finally { window.UmaVideoFrames = orig; UmaPcCapture.removePointer = rp; window.autoStitchVideoSet = st; }
					return res;
				});
				const L = r[0], P = r[1];
				assert(L.ok && L.calls.some((c) => c.kind === 'select' && c.effectVote === false && c.debug) && L.calls.some((c) => c.kind === 'pointer' && c.src === 'landscape:test' && c.track === 1),
					'(4) 横画面の録画: 選ぶ処理は取り込みと同じ（エフェクトの置き換えを切る・軌跡を取る）で、そのあとカーソルを消す処理を通る', L);
				assert(P.ok && P.calls.some((c) => c.kind === 'select' && c.effectVote === undefined && !c.debug) && !P.calls.some((c) => c.kind === 'pointer'),
					'(4) 縦画面の動画: 選ぶ処理は今のまま・カーソルを消す処理は通らない', P);
			} finally { await sp.page.context().close(); }
		});
	}
}
