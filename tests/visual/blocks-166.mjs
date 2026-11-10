// DMM版の横画面の直し T166 段1（2026-11-11・決定 676）: カーソルを消す処理（js/pc-capture.js の removePointer）の時間の直しの検査。
// run-smoke.mjs の末尾から register166() で呼ばれる（塊の見出しはすべて「T166段1」で始まる。`npm run test:visual -- --only=T166段1` で回せる）。
//
// 直したこと（js/pc-capture.js だけ。common.js・stitch.js は変えない）:
//  - 横画面（出どころの kind に landscape: が入る）は、カーソルの形を覚えて画全体を総当たりで探す所を飛ばし、右の余白を塗る所（T156）だけにする（案 c）。
//    横画面の録画5本すべてで、覚えた形はカーソルでなく置き換えは 0 で、時間の 76〜90% がその総当たりだった（T165）。行の上のカーソルは
//    今までも消せていなかった。行の上のカーソルを消す新しい段（案 d1）は T167 で別に作る。
//  - 縦画面の取り込みは今の処理のまま、形を当てる場所を「ずらして合わせた相手の画と合わない区画」・合わせる相手の無い行・下の端の行・
//    右の端と余白の近くに絞る（案 a）。結果は今と同じ（T105 の取り込み3本で結合画像を画素で比べた。T166-check-1.md）。

export async function register166(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

	await block('T166段1 ―― カーソルを消す処理: 横画面は形を探さず右の余白だけを塗る（余白のカーソルは消え、行の上は今までどおり残る）。縦画面の取り込みは形を当てる場所を絞り、行の上のカーソルを今までどおり消す', async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		sp.page.setDefaultTimeout(120000);
		try {
			const r = await sp.page.evaluate(async () => {
				// 作り物の取り込み: 幅 1170・高さ 2060、本文の帯 900〜1760。一覧は止まって動いてを繰り返す。右の 60px は動かない余白（溝とつまみ）。
				// 行の上の決まった所に矢印のカーソル、余白の上にもう1つのカーソル（どちらも中身と一緒に動かない）
				const W = 1170, H = 2060, hE = 900, cH = 860, LIST = 2600, MX = 1110;
				const list = document.createElement('canvas'); list.width = W; list.height = LIST;
				const lg = list.getContext('2d');
				lg.fillStyle = '#fff'; lg.fillRect(0, 0, W, LIST);
				for (let k = 0, y = 10; y < LIST - 90; k++, y += 96) {
					lg.fillStyle = 'rgb(222,222,226)'; lg.fillRect(40, y, 1040, 80);
					for (let j = 0; j < 9; j++) { lg.fillStyle = 'rgb(' + (60 + (k * 37 + j * 11) % 90) + ',40,30)'; lg.fillRect(80 + j * 90 + (k * 13) % 30, y + 18 + (j % 2) * 6, 40 + (k * 7 + j * 5) % 25, 16); }
					lg.fillStyle = 'rgb(240,190,40)'; lg.fillRect(860 + (k % 3) * 40, y + 50, 24, 20);
					// 行の右端の濃い印（一覧の中身が右端まで動く。余白の左端を測れるように）
					lg.fillStyle = 'rgb(70,90,160)'; lg.fillRect(1040, y + 10 + (k % 4) * 14, 46, 18);
				}
				const seg = [[0, 1, 0, 0], [1, 1.5, 0, 420], [1.5, 2.5, 420, 420], [2.5, 3, 420, 840], [3, 4, 840, 840], [4, 4.5, 840, 1260], [4.5, 6, 1260, 1260]];
				const posAt = (t) => { for (const [a, b, p, q] of seg) if (t >= a && t < b) return p + (q - p) * (t - a) / (b - a); return 1260; };
				const arrow = (ctx, cx, cy) => {
					ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 40); ctx.lineTo(cx + 10, cy + 30); ctx.lineTo(cx + 18, cy + 46); ctx.lineTo(cx + 24, cy + 43); ctx.lineTo(cx + 16, cy + 28); ctx.lineTo(cx + 28, cy + 28); ctx.closePath();
					ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
				};
				const margin = (ctx, t, withCursor, noThumb) => {
					ctx.fillStyle = 'rgb(236,236,236)'; ctx.fillRect(MX, hE, W - MX, cH);
					const ty = hE + Math.round(posAt(t) * (cH - 200) / 1260);
					if (!noThumb) { ctx.fillStyle = 'rgb(160,160,160)'; ctx.fillRect(MX + 24, ty, 14, 200); }
					if (withCursor) arrow(ctx, MX + 22, hE + 600);
				};
				const frame = (t, ctx, dw, dh) => {
					ctx.save(); ctx.scale(dw / W, dh / H);
					ctx.fillStyle = 'rgb(140,200,90)'; ctx.fillRect(0, 0, W, H);
					ctx.fillStyle = '#fff'; ctx.fillRect(0, hE, W, cH);
					ctx.drawImage(list, 0, Math.round(posAt(t)), MX, cH, 0, hE, MX, cH);
					margin(ctx, t, true);
					arrow(ctx, 600, hE + 430);
					ctx.restore();
				};
				const makeSrc = (kind) => UmaVideoFrames.canvasSource({ kind, width: W, height: H, duration: 6, exact: true, draw: async (t, ctx, dw, dh) => { frame(t, ctx, dw, dh); } });
				const pngAt = async (t) => { const c = document.createElement('canvas'); c.width = W; c.height = H; frame(t, c.getContext('2d'), W, H); const b = await new Promise((res) => c.toBlob(res, 'image/png')); return new File([b], 'f' + t + '.png', { type: 'image/png' }); };
				// 正解（カーソルなし）の画の一部と比べた差の平均
				const diffAt = async (file, t, x, y, w, h, truth) => {
					const img = await createImageBitmap(file);
					const a = document.createElement('canvas'); a.width = W; a.height = H; const ax = a.getContext('2d', { willReadFrequently: true }); ax.drawImage(img, 0, 0);
					const d = ax.getImageData(x, y, w, h).data;
					const b = document.createElement('canvas'); b.width = W; b.height = H; const bx = b.getContext('2d', { willReadFrequently: true });
					truth(bx, t);
					const e = bx.getImageData(x, y, w, h).data;
					let s = 0; for (let k = 0; k < d.length; k += 4) s += (Math.abs(d[k] - e[k]) + Math.abs(d[k + 1] - e[k + 1]) + Math.abs(d[k + 2] - e[k + 2])) / 3;
					return +(s / (d.length / 4)).toFixed(1);
				};
				const rowTruth = (bx, t) => { bx.fillStyle = '#fff'; bx.fillRect(0, 0, W, H); bx.drawImage(list, 0, Math.round(posAt(t)), MX, cH, 0, hE, MX, cH); };
				// 正解の余白: 縦画面はつまみを残す（T118）。横画面は余白をつまみごと余白の地で塗る（T156）ので、つまみも無い
				const marginTruth = (bx, t, land) => margin(bx, t, false, land);
				const picks = [0.5, 2, 3.5, 5];
				const run = async (kind) => {
					const files = [];
					for (const t of picks) files.push(await pngAt(t));
					const pos = picks.map(posAt);
					const sel = { header: { headerEnd: hE, contentH: cH }, picks, files, persons: [{ files: files.slice() }],
						seams: pos.slice(1).map((p, i) => ({ overlap: cH - (p - pos[i]) })) };
					const track = [];
					for (let t = 0; t < 6; t += 1 / 16) { const p = posAt(t); track.push({ t: +t.toFixed(4), pos: p, still: Math.abs(posAt(t + 0.07) - p) < 1 && Math.abs(posAt(Math.max(0, t - 0.07)) - p) < 1 }); }
					devGeometry.length = 0;
					const t0 = performance.now();
					const st = await UmaPcCapture.removePointer(makeSrc(kind), sel, track);
					const ms = Math.round(performance.now() - t0);
					const row = [], mar = [];
					for (let i = 0; i < files.length; i++) {
						row.push(await diffAt(sel.persons[0].files[i], picks[i], 596, hE + 426, 36, 54, rowTruth));
						mar.push(await diffAt(sel.persons[0].files[i], picks[i], MX + 18, hE + 596, 36, 54, (bx, t) => marginTruth(bx, t, /^landscape:/.test(kind))));
					}
					return { ms, sprite: st.sprite, samples: st.samples, cells: st.cells, frames: st.frames, margin: st.margin && { x: st.margin.x, cells: st.margin.cells, whole: st.margin.whole || 0 },
						searched: st.searched, searchAll: st.searchAll, row, mar, log: devGeometry.filter((l) => /^\[動画\] カーソル/.test(l)).slice(-1)[0] || null };
				};
				return { land: await run('landscape:test'), port: await run('crop:test') };
			});
			const L = r.land, P = r.port;
			assert(L.margin && L.margin.x >= 1080 && L.margin.x <= 1112, '前提: 右の余白を測れる（余白の左端 1080〜1112）', L.margin);
			assert(L.sprite === null && L.samples === 0 && L.cells === 0, '横画面: カーソルの形を覚えない・形で置き換えない（形を探す所を飛ばす）', L);
			assert(L.margin && L.margin.whole === 4 && L.mar.every((v) => v < 6), '横画面: 4枚とも余白を全体で塗り、余白の上のカーソルが消える（差の平均 6 未満）', L);
			assert(L.row.every((v) => v > 20), '横画面: 行の上のカーソルは残る（今までも消せていなかった。消す段は T167）', L.row);
			assert(L.log && /横画面は余白だけ/.test(L.log), '横画面: 開発ログの [動画] カーソル: の行に「横画面は余白だけ」', L.log);
			assert(P.sprite && P.cells >= 3 && P.row.every((v) => v < 6), '縦画面: 形を覚えて、4枚とも行の上のカーソルが消える（差の平均 6 未満）', P);
			assert(P.mar.every((v) => v < 6), '縦画面: 余白の上のカーソルも消える（T118 のまま）', P.mar);
			assert(P.searchAll > 0 && P.searched > 0 && P.searched < P.searchAll * 0.6, '縦画面: 形を当てた位置は総当たりの 6割未満（合わない区画の近くに絞る）', [P.searched, P.searchAll]);
			assert(P.log && /形を当てた位置 \d+%/.test(P.log), '縦画面: 開発ログに「形を当てた位置 N%」', P.log);
		} finally { await sp.page.context().close(); }
	});
}
