// DMM版の横画面の取り込み・録画のにじみとずれの案内・段ごとの秒（T161・2026-11-10・決定 649・650・659・663）の検査。
// 塊の見出しはすべて「T161」で始まる（`npm run test:visual -- --only=T161`）。run-smoke.mjs の末尾から register164() で呼ばれる。
//
// 原因: PC の取り込み（pc-capture.js の encodeSink）と PC の録画は、撮り始めの画が粗く、止まっている間に少しずつくっきりする
// （おいもさんの取り込み 2本〔T105〕で、止まったままの頭 1.4秒の鮮明度が 622 → 677・570 → 626）。選ぶ処理（selectFrames）の頭の1枚は
// 必ず最初の画なので、横画面のパネルを拡大すると親の上の部分がにじみ（止まっている画は組み立てで優先されるので、その画の行が全部残る）、
// 次の画との継ぎ目の一致も下がって「ずれているかもしれません」が出た。
// 直し（js/video-frames.js の selectFrames の取り直し）: 横画面の出どころ（kind に landscape: が入る）だけ、選んだ画のあと軌跡で同じ位置のまま続く画を
// 等倍で描いて比べ、本文の帯の鮮明度が高い画で置き換える（同じ位置の画なので継ぎ目は変わらない）。縦画面の動画・取り込みは今のまま。
// 段ごとの秒: special.html・exam.html の開発ログに [時間] の行（取り込み・動画は onVideoChosen、OCR は processImages、結合は runImageStitching）。
//
// 作り物の画（blocks-145 と同じ形の一覧）で確かめる:
//  (1) 頭の 1.2秒は止まっていて、0.8秒かけてぼかしが消える（撮り始めの粗い画のまね）横画面の出どころ: 親の結合画像が一覧と画素で合う
//      （頭の画を置き換えた・stats.sharpSwaps）・3人の高さが正しい・確かでない継ぎ目なし・開発ログに取り替えの行。
//      同じ出どころを sharpPick:false（今までの作り）で回すと、親の上の行がにじんで一覧と合わない（壊す確認の代わり）。
//  (2) 同じ動きの縦画面の出どころ（kind に landscape: が無い）は今のまま: 置き換えず（stats.sharpOn が偽）、静止画が sharpPick:false とバイトまで同じ。
//  (3) special.html・exam.html: 動画・取り込みのあと、開発ログに [時間] の行（取り込みのあとの処理／動画を開く・選ぶ・カーソルを消す・組み立て・合計）。
//      OCR（processImages）と結合（runImageStitching）も [時間] の行を出す。

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T161 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

export const SYNTH164 = String.raw`
window.__synth164 = (function () {
	// 幅 1000・本文の帯 800px（blocks-145 と同じ形）
	const W = 1000, H = 1800, HE = 700, FS = 1500, CH = FS - HE;
	const ROW = 82, HEAD = 90;
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	const rowsPer = [22, 20, 18];
	const heads = [];
	let y = 40;
	for (const n of rowsPer) { heads.push(y); y += HEAD + n * ROW; }
	const green = y, docH = green + 50 + 900;
	const doc = document.createElement('canvas'); doc.width = W; doc.height = docH;
	const d = doc.getContext('2d');
	d.fillStyle = 'rgb(240,240,240)'; d.fillRect(0, 0, W, docH);
	const r = rng(161);
	const textRow = (y0) => {
		for (const x0 of [160, 580]) {
			d.fillStyle = 'rgb(222,222,222)'; d.fillRect(x0, y0 + 6, 380, 64);
			d.fillStyle = 'rgb(170,170,180)'; d.fillRect(x0, y0 + 70, 380, 6);
			// 字のまね: 細い線の組（ぼかすと消える）
			const n = 3 + Math.floor(r() * 4);
			for (let k = 0; k < n; k++) { const xx = x0 + 50 + Math.floor(r() * 260); d.fillStyle = 'rgb(90,50,30)'; for (let s = 0; s < 5; s++) d.fillRect(xx + s * 4, y0 + 14 + Math.floor(r() * 6), 2, 18); }
			for (let k = 0; k < 3; k++) { d.fillStyle = 'rgb(240,190,40)'; d.fillRect(x0 + 180 + k * 36, y0 + 46, 24, 18); }
		}
	};
	for (let i = 0; i < heads.length; i++) {
		d.fillStyle = 'rgb(40,170,235)'; d.fillRect(160, heads[i], 800, HEAD);
		d.fillStyle = 'rgb(255,255,255)'; d.fillRect(400 + i * 50, heads[i] + 30, 220, 24);
		for (let k = 0; k < rowsPer[i]; k++) textRow(heads[i] + HEAD + k * ROW);
	}
	d.fillStyle = 'rgb(120,190,40)'; d.fillRect(0, green, W, 50);
	for (let k = 0; k < 11; k++) textRow(green + 50 + k * ROW);
	const fixed = document.createElement('canvas'); fixed.width = W; fixed.height = H;
	const f = fixed.getContext('2d');
	f.fillStyle = 'rgb(205,195,185)'; f.fillRect(0, 0, W, HE); f.fillRect(0, FS, W, H - FS);
	const r2 = rng(9);
	for (let k = 0; k < 70; k++) { const g = 40 + Math.floor(r2() * 120); f.fillStyle = 'rgb(' + g + ',' + (g - 10) + ',' + (g - 20) + ')'; f.fillRect(Math.floor(r2() * 920), 300 + Math.floor(r2() * (HE - 340)), 30 + Math.floor(r2() * 110), 16); }
	for (let k = 0; k < 12; k++) { f.fillStyle = 'rgb(90,80,70)'; f.fillRect(Math.floor(r2() * 920), FS + 30 + Math.floor(r2() * 120), 56, 28); }
	const frame = document.createElement('canvas'); frame.width = W; frame.height = H;
	const fx = frame.getContext('2d');
	// 動き: 1.2秒止まる（頭の 0.8秒はぼかしがだんだん消える）→ 0.5秒で 500px 進む → 0.8秒止まる（止まってから 0.6秒も、弱いぼかしがだんだん消える）→ … → 一番下で 1.2秒止まる
	const STILL0 = 1.2, RAMP = 0.8, BLUR = 2.5, BRIGHT = 0.15, MOVE = 0.5, DIST = 500, HOLD = 0.8, RAMP2 = 0.6, BLUR2 = 1.5;
	const bottom = docH - CH;
	const moves = [];
	let t0 = STILL0, s = 0;
	while (s < bottom) { const dd = Math.min(DIST, bottom - s); moves.push([t0, t0 + MOVE, s, dd]); s += dd; t0 += MOVE + HOLD; }
	const duration = t0 - HOLD + 1.2;
	const pos = (tt) => { let p = 0; for (const [a, b, s0, dd] of moves) { if (tt < a) break; p = tt >= b ? s0 + dd : Math.round(s0 + dd * (tt - a) / (b - a)); } return p; };
	const blurAt = (tt) => {
		if (tt < RAMP) return BLUR * (1 - tt / RAMP);
		for (const [, b] of moves) if (tt >= b && tt < b + RAMP2) return BLUR2 * (1 - (tt - b) / RAMP2);
		return 0;
	};
	function source(kind) {
		return UmaVideoFrames.canvasSource({
			kind, exact: true, width: W, height: H, duration,
			draw(t, ctx, dw, dh) {
				fx.drawImage(fixed, 0, 0);
				fx.drawImage(doc, 0, pos(t), W, CH, 0, HE, W, CH);
				const b = blurAt(t);
				ctx.drawImage(frame, 0, 0, dw, dh);
				// 撮り始めの粗い画のまね（一覧の帯だけ）: ぼけて、色合いもわずかに違う（圧縮の画は字の縁だけでなく地の明るさも揺れる。
				// 縮小画どうしの比べでも違いが出る）。帯の外まで変えると、選ぶ処理が「別の画面」と見なす
				if (b > 0) {
					const q = dh / H;
					ctx.filter = 'blur(' + (b * dw / W).toFixed(3) + 'px) brightness(' + (1 + BRIGHT * b / BLUR).toFixed(3) + ')';
					ctx.drawImage(frame, 0, HE, W, CH, 0, HE * q, dw, CH * q);
					ctx.filter = 'none';
				}
			}
		});
	}
	// 組み立てた人 j の画を、作り物の一覧の「頭から」と比べる（blocks-145 と同じ見方）
	function compare(c, j) {
		const w = c.width, h = c.height;
		const a = c.getContext('2d').getImageData(0, 0, w, h).data;
		const top = heads[j];
		const expectH = (j + 1 < heads.length ? heads[j + 1] : green) - heads[j];
		const rows = Math.min(h, docH - top, expectH - 2);
		const b = doc.getContext('2d').getImageData(0, top, w, rows).data;
		let badRows = 0; const badAt = [];
		for (let yy = 2; yy < rows; yy += 2) {
			let rs = 0, rn = 0;
			for (let x = 0; x < w; x += 3) { const k = (yy * w + x) * 4; rs += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); rn += 3; }
			// 画の縁の JPEG の揺れ（差 13〜14）は数えない
			if (rs / rn > 20) { badRows++; if (badAt.length < 6) badAt.push(yy + ':' + Math.round(rs / rn)); }
		}
		return { h, expectH, badRows, badAt };
	}
	const bytesOf = async (f) => new Uint8Array(await f.arrayBuffer());
	async function run(kind, extra) {
		const before = devGeometry.length;
		let sel;
		try { sel = await UmaVideoFrames.selectFrames(source(kind), Object.assign({ labels: ['親', '祖1', '祖2', '人4'], effectVote: false }, extra || {})); } catch (e) { return { error: e.code + ': ' + e.message, persons: [] }; }
		const persons = [];
		for (let j = 0; j < sel.persons.length; j++) {
			const p = sel.persons[j];
			const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still, anchorY: p.anchorY });
			persons.push(Object.assign({ label: p.label, n: p.files.length, times: p.times, unc: p.uncertain.filter(Boolean).length }, compare(c, Math.min(j, heads.length - 1))));
		}
		const files = [];
		for (const f of sel.files) files.push(await bytesOf(f));
		return { persons, files, stats: { sharpOn: sel.stats.sharpOn, sharpHead: sel.stats.sharpHead, sharpTried: sel.stats.sharpTried, sharpSwaps: sel.stats.sharpSwaps }, sharpMs: sel.tm.sharpMs || 0, log: devGeometry.slice(before).filter((l) => /くっきりした画/.test(l)) };
	}
	return { run };
})();
`;

export async function register164(env) {
	const { block, assert, browser, base, openPage } = env;
	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(240000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t161.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t161.html');
		await page.addScriptTag({ content: SYNTH164 });
		return { ctx, page, errors };
	};
	const show = (r) => r.error || r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + (p.badAt.length ? '（' + p.badAt.join(',') + '）' : '') + ' 枚数' + p.n + ' 確かでない' + p.unc).join('／');
	const okH = (r) => r.persons.length === 3 && r.persons.every((p) => Math.abs(p.h - p.expectH) <= 2 && p.unc === 0);

	await block('T161(1) 撮り始め・スクロールのあとの画が粗い横画面の出どころ: 同じ位置のくっきりした画を使い、結合画像が一覧と画素で合う', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth164.run('landscape:synth164'));
		const st = r.stats || {};
		assert(st.sharpOn === true && st.sharpHead > 0.3, 'T161(1) 横画面の出どころでは、頭の粗い画を使わず、同じ位置のくっきりした画から始める（頭 ' + st.sharpHead + '秒）', r.stats || r.error);
		assert(st.sharpSwaps >= 1, 'T161(1) スクロールのあとの止まっている画も、同じ位置のくっきりした画に取り替える（' + st.sharpSwaps + '/' + st.sharpTried + '枚）', r.stats || r.error);
		assert(okH(r) && r.persons.every((p) => p.badRows === 0), 'T161(1) 3人に分かれ、どの人も一覧と画素で合う（にじみなし）・高さが正しい・確かでない継ぎ目なし（' + show(r) + '）', r.persons);
		assert(r.log && r.log.length === 2 && /^\[画像結合\] 動画: 撮り始めの粗い画を使わず、同じ位置のくっきりした画から始める: 0\.000→\d+\.\d{3}秒（本文の帯の鮮明度 \d+→\d+・前の \d+枚を使わない）$/.test(r.log[0])
			&& /^\[画像結合\] 動画: 撮り始め・スクロールの直後の粗い画を、同じ位置のくっきりした画に取り替え（\d+\/\d+枚/.test(r.log[1]), 'T161(1) 開発ログに頭の置き換えと取り替えの行', r.log);
		// 今までの作り（sharpPick:false）では結合画像が一覧と合わない（にじむ・継ぎ目が確かでない・頭の取り違えで人の高さが違う）。この作り物で違いが見えることの確かめ
		const b = await page.evaluate(() => __synth164.run('landscape:synth164', { sharpPick: false }));
		const bad = (p) => p.badRows >= 5 || p.unc >= 1 || Math.abs(p.h - p.expectH) > 2;
		assert(b.stats && b.stats.sharpOn === false && b.stats.sharpSwaps === 0 && b.persons.length >= 1 && (b.persons.length !== 3 || b.persons.some(bad)),
			'T161(1) 比べ: 置き換えないと、親の結合画像が一覧と合わない（' + show(b) + '）', b.error || b.persons.map((p) => p.badRows));
		assert(errors.length === 0, 'T161(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T161(2) 縦画面の出どころ（kind に landscape: が無い）は今のまま: 置き換えず、静止画が sharpPick:false とバイトまで同じ', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const a = await __synth164.run('synth164');
			const b = await __synth164.run('synth164', { sharpPick: false });
			const same = a.files.length === b.files.length && a.files.every((x, i) => x.length === b.files[i].length && x.every((v, k) => v === b.files[i][k]));
			return { stats: a.stats, n: a.files.length, same, log: a.log, persons: a.persons.map((p) => p.n) };
		});
		assert(r.stats && r.stats.sharpOn === false && r.stats.sharpTried === 0 && r.stats.sharpSwaps === 0 && r.log.length === 0, 'T161(2) 縦画面の出どころでは比べも置き換えもしない（開発ログの行なし）', r.stats);
		assert(r.n > 3 && r.same, 'T161(2) 静止画（' + r.n + '枚）が sharpPick:false とバイトまで同じ', r);
		assert(errors.length === 0, 'T161(2) コンソールのエラーなし', errors);
		await ctx.close();
	});

	// (3) 段ごとの秒の行。選ぶ処理・カーソルを消す処理・OCR の1人分は差し替えて、行の形と段の並びを見る（秒の値は見ない）
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const SEC = '\\d+\\.\\d秒';
	for (const page of ['special.html', 'exam.html']) {
		await block('T161(3) ' + page + ': 開発ログに段ごとの秒の行（取り込み・動画・OCR・結合）', async () => {
			const sp = await openPage(browser, base, page, { width: 375, height: 812 }, EMPTY);
			sp.page.setDefaultTimeout(120000);
			try {
				const r = await sp.page.evaluate(async () => {
					const tiny = async () => { const c = document.createElement('canvas'); c.width = 4; c.height = 4; const b = await new Promise((res) => c.toBlob(res, 'image/png')); return new File([b], 'x.png', { type: 'image/png' }); };
					const orig = window.UmaVideoFrames;
					window.UmaVideoFrames = Object.assign({}, orig, {
						selectFrames: async (src, o) => {
							if (o.debug) o.debug.track = [{ t: 0, pos: 0 }];
							const f = await tiny();
							return { persons: [0, 1, 2].map(() => ({ files: [f, f], shifts: [10], uncertain: [false], still: [true, true], anchorY: 0 })), files: [f], picks: [0], seams: [], tm: { sampleMs: 1200, selectMs: 2300, grabMs: 3400, sharpMs: 500 } };
						}
					});
					const rp = UmaPcCapture.removePointer;
					UmaPcCapture.removePointer = async () => ({});
					const mk = (land) => Object.assign(orig.canvasSource({ kind: land ? 'landscape:test' : 'mp4:test', width: 100, height: 200, duration: 1, draw: async () => {} }), land ? { landscape: { rect: {} } } : {});
					const lines = {};
					try {
						for (const land of [true, false]) {
							devGeometry.length = 0;
							videoPending = { setIdx: 0 };
							await onVideoChosen(mk(land), {});
							lines[land ? 'land' : 'portrait'] = devGeometry.filter((l) => /^\[時間\]/.test(l));
						}
					} finally { window.UmaVideoFrames = orig; UmaPcCapture.removePointer = rp; }
					// OCR: OCR の部品と1人分の読み取りを差し替える（1人分の画像があるときの流れ）
					const T = window.Tesseract, ppi = processPersonImages;
					window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, terminate: async () => {} }) };
					processPersonImages = async () => ({ lines: [], skipped: [], warned: [], geometry: null });
					let ocrErr = null;
					// UmaStar はスキルリストが空だと OCR の前に案内を出して戻る（①のテンプレートを選んでいない）。名前の並び（文字列の配列）を1つ入れる
					if (typeof skillList !== 'undefined' && Array.isArray(skillList) && !skillList.length) skillList = ['スピードスター'];
					let ocrRet = null; const toast = []; const st0 = window.showToast; window.showToast = (m) => { toast.push(m); }; const dm = typeof deckMode !== 'undefined' ? deckMode : null; if (dm) deckMode = false; try { ocrRet = await processImages({ keepClosed: true, quiet: true }); } catch (e) { ocrErr = String(e); } finally { window.Tesseract = T; processPersonImages = ppi; window.showToast = st0; if (dm) deckMode = dm; } ocrErr = ocrErr || (ocrRet === false ? "戻り値 false・" + toast.join("／") + "・files " + (typeof persons !== "undefined" ? persons.map((p) => p.files.length).join(",") : "?") : null);
					lines.ocr = devGeometry.filter((l) => /^\[時間\]/.test(l));
					devGeometry.length = 0;
					let stErr = null;
					try { await runImageStitching(undefined, { progress: false }); } catch (e) { stErr = String(e); }
					lines.stitch = devGeometry.filter((l) => /^\[時間\]/.test(l));
					return { lines, ocrErr, stErr };
				});
				const L = r.lines;
				const land = new RegExp('^\\[時間\\] 動画: 動画を開く（横画面の切り出しを含む） ' + SEC + '・選ぶ ' + SEC + '（読む 1\\.2秒・選ぶ 2\\.3秒・取り直す 3\\.4秒〔うち くっきりした画を探す 0\\.5秒〕）・カーソルを消す ' + SEC + '・画像の一覧に入れる ' + SEC + '・組み立て（結合画像） ' + SEC + '・合計 ' + SEC + '$');
				const port = new RegExp('^\\[時間\\] 動画: 動画を開く ' + SEC + '・選ぶ ' + SEC + '（読む 1\\.2秒・選ぶ 2\\.3秒・取り直す 3\\.4秒〔うち くっきりした画を探す 0\\.5秒〕）・画像の一覧に入れる ' + SEC + '・組み立て（結合画像） ' + SEC + '・合計 ' + SEC + '$');
				assert(L.land.length === 1 && land.test(L.land[0]), '(3) ' + page + ': 横画面の録画のあとに [時間] の行（動画を開く・選ぶ〔読む・選ぶ・取り直す〕・カーソルを消す・画像の一覧に入れる・組み立て・合計）', L.land);
				assert(L.portrait.length === 1 && port.test(L.portrait[0]), '(3) ' + page + ': 縦画面の動画のあとにも [時間] の行（カーソルを消す段は無い）', L.portrait);
				assert(L.ocr.length === 2 && /（直前の取り込み・動画）$/.test(L.ocr[0]) && new RegExp('^\\[時間\\] OCR: 準備（OCR の読み込み） ' + SEC + '・.+ ' + SEC + '・合計 ' + SEC + '$').test(L.ocr[1]),
					'(3) ' + page + ': OCR のあとに [時間] の行（直前の取り込み・動画の行を入れ直し、OCR の準備・人ごと・合計）', [L.ocr, r.ocrErr]);
				assert(L.stitch.length === 1 && new RegExp('^\\[時間\\] 結合: 合計 ' + SEC + '$').test(L.stitch[0]), '(3) ' + page + ': 結合のあとに [時間] の行', [L.stitch, r.stErr]);
			} finally { await sp.page.context().close(); }
		});
	}
}
