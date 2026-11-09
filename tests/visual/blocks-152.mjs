// DMM版の横画面から結合画像と OCR（T145・2026-11-09・決定 576〜582）の検査。
// run-smoke.mjs の末尾から register152() で呼ばれる（塊の見出しはすべて「T145横画面」で始まる。
// `npm run test:visual -- --only=T145横画面` で回せる）。
//
// 作り（js/landscape-panel.js。common.js・stitch.js は変えない）:
//  - 横長（幅 ≥ 高さ×1.15）の画だけ、「ウマ娘詳細」の見出しの帯（濃い緑）を上から探し、帯の左右・上端からパネルを決める（高さ＝幅×1.729）。
//  - パネルの左右に幅の 1.2%・上に 4.5%・下に 3% の余白を足して切り出し、幅 1170px にそろえる（縦画面の DMM版のスクショと同じ形）。
//  - 静止画は addPersonFiles のあとに非同期で置き換え（OCR・結合は landscapeReady で待つ）、動画は onVideoChosen で wrapSource、
//    ウィンドウの取り込みは pc-capture.js の detectOne が横長の窓でパネルの矩形を返す。縦長の画は何もしない。
// 画は作り物: test-images の DMM版の縦画面のスクショ（2026-09-15_3）を、横画面の素材（T145 の静止画・録画）と同じ大きさと位置に置いた横長の画。
// 素材から測った値: 全画面 2880×1920（上下の黒い帯 150px）でパネルは x=384・幅 892、ウィンドウ 2780×1564 で x=372・幅 860、1998×1124 で x=268・幅 618。

export async function register152(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const IMG_DIR = '2026-09-15_3';
	const PORTRAIT = '2026-09-15_3_01.png';
	const JPEG_DIR = '2026-11-05_3';
	const hasImages = fs.existsSync(path.join(REPO_ROOT, 'test-images', IMG_DIR, PORTRAIT)) && fs.existsSync(path.join(REPO_ROOT, 'test-images', JPEG_DIR, '00.jpg'));
	// 素材の3つの大きさ（画の幅・高さ・上下の黒い帯・パネルの左端と幅）
	const SIZES = [
		{ name: '全画面 2880×1920', W: 2880, H: 1920, bar: 150, px: 384, pw: 892 },
		{ name: 'ウィンドウ 2780×1564', W: 2780, H: 1564, bar: 0, px: 372, pw: 860 },
		{ name: '小さいウィンドウ 1998×1124', W: 1998, H: 1124, bar: 0, px: 268, pw: 618 }
	];

	const open = async (page) => {
		const sp = await openPage(browser, base, page, { width: 375, height: 812 }, EMPTY);
		sp.page.setDefaultTimeout(60000);
		await sp.page.evaluate(({ dir, name }) => {
			window.__t145 = {
				isTitleGreen: (r, g, b) => g >= 150 && b <= 70 && g - r >= 35 && g - b >= 110,
				async portrait() { return createImageBitmap(await (await fetch('/test-images/' + dir + '/' + name)).blob()); },
				// 縦画面のスクショの見出しの帯の左端・上端（同じ緑の判定で、上から最初に幅 50% 以上緑の行）
				band(bmp) {
					const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
					const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
					const d = g.getImageData(0, 0, c.width, Math.round(c.height * 0.2)).data;
					for (let y = 0; y < c.height * 0.2; y++) {
						let x0 = -1, n = 0;
						for (let x = 0; x < c.width; x++) { const p = (y * c.width + x) * 4; if (this.isTitleGreen(d[p], d[p + 1], d[p + 2])) { n++; if (x0 < 0) x0 = x; } }
						if (n > c.width * 0.5) return { x: x0, y };
					}
					return null;
				},
				// 横長の画: 黒い帯・ゲームの地・右側のぼかしたメニューの帯（青が強い緑。見出しと取り違えない確かめ）・左の小さな緑の四角（全画面のボタン）、
				// その中に縦画面のスクショを、パネルの左端が px・幅が pw になる大きさで置く
				landscape(bmp, s, o) {
					const c = document.createElement('canvas'); c.width = s.W; c.height = s.H;
					const g = c.getContext('2d', { willReadFrequently: true });
					g.fillStyle = '#000'; g.fillRect(0, 0, s.W, s.H);
					const gy = s.bar, gh = s.H - s.bar * 2;
					g.fillStyle = 'rgb(205,220,195)'; g.fillRect(0, gy, s.W, gh);
					g.fillStyle = 'rgb(185,228,115)'; g.fillRect(Math.round(s.W * 0.54), gy + Math.round(gh * 0.01), Math.round(s.W * 0.33), Math.round(gh * 0.05));
					g.fillStyle = 'rgb(110,200,20)'; g.fillRect(Math.round(s.W * 0.02), gy + Math.round(gh * 0.04), Math.round(s.W * 0.03), Math.round(s.W * 0.03));
					const b = o.band, k = s.pw / (bmp.width - 2 * b.x);
					const dx = s.px - b.x * k, dy = gy;
					if (!(o && o.noPanel)) g.drawImage(bmp, dx, dy, bmp.width * k, bmp.height * k);
					return { c, k, dx, dy, panelTop: dy + b.y * k };
				},
				async file(c, name, type) { const b = await new Promise((r) => c.toBlob(r, type || 'image/png', 0.92)); return new File([b], name, { type: type || 'image/png' }); }
			};
		}, { dir: IMG_DIR, name: PORTRAIT });
		return sp;
	};

	await block('T145横画面 ―― (1) 3つの大きさの横長の画で、パネルを素材と同じ位置に見つけ、幅 1170px の縦画面の形に切り出す（メニューの帯・小さな緑は取らない）', async () => {
		if (!hasImages) { assert(false, '前提: test-images/' + IMG_DIR + '/' + PORTRAIT + ' と ' + JPEG_DIR + '/00.jpg がある（メインから写す）'); return; }
		const sp = await open('exam.html');
		try {
			const r = await sp.page.evaluate(async (SIZES) => {
				const T = window.__t145, bmp = await T.portrait(), band = T.band(bmp);
				const out = [];
				for (const s of SIZES) {
					const L = T.landscape(bmp, s, { band });
					const p = UmaLandscape.findPanel(L.c.getContext('2d').getImageData(0, 0, s.W, s.H));
					const crop = p.ok ? UmaLandscape.cropToCanvas(L.c, p) : null;
					out.push({ name: s.name, ok: p.ok, reason: p.reason, panel: p.panel, outW: p.outW, outH: p.outH, panelTop: Math.round(L.panelTop),
						check: crop ? stitchCheckStandardScreenshot(crop) : null, aspect: crop ? +(crop.height / crop.width).toFixed(3) : null });
				}
				return { band, out };
			}, SIZES);
			assert(r.band && r.band.x > 0 && r.band.x < 30, '前提: 縦画面のスクショの見出しの帯の左端が分かる', r.band);
			r.out.forEach((o, i) => {
				const s = SIZES[i];
				assert(o.ok && Math.abs(o.panel.x - s.px) <= 3 && Math.abs(o.panel.w - s.pw) <= 4 && Math.abs(o.panel.y - o.panelTop) <= 3,
					'(1) ' + o.name + ': パネルを左端 ' + s.px + '・幅 ' + s.pw + '（±3〜4px）・上端は見出しの帯の上に見つける', o);
				assert(o.outW === 1170 && o.check && o.check.ok && o.check.profile === 'DMM版(ブラウザ)相当' && o.aspect >= 1.7 && o.aspect <= 1.8,
					'(1) ' + o.name + ': 切り出しは幅 1170px・縦横比 1.7〜1.8（結合の扱える DMM版の形）', [o.outW, o.outH, o.aspect, o.check]);
			});
		} finally { await sp.page.context().close(); }
	});

	await block('T145横画面 ―― (2) 縦長の画像は切り出さない（PNG は開かずに元の File・JPEG も元の File）。パネルの無い横長の画も元の File', async () => {
		if (!hasImages) { assert(false, '前提: test-images の画像がある'); return; }
		const sp = await open('exam.html');
		try {
			const r = await sp.page.evaluate(async (jdir) => {
				const T = window.__t145, bmp = await T.portrait(), band = T.band(bmp);
				const png = new File([await (await fetch('/test-images/2026-09-15_3/2026-09-15_3_01.png')).blob()], 'p.png', { type: 'image/png' });
				const jpg = new File([await (await fetch('/test-images/' + jdir + '/00.jpg')).blob()], 'p.jpg', { type: 'image/jpeg' });
				let opened = 0;
				const keep = window.createImageBitmap;
				window.createImageBitmap = function () { opened++; return keep.apply(this, arguments); };
				let pngOut, jpgOut;
				try { pngOut = await UmaLandscape.cropFile(png); var pngOpened = opened; jpgOut = await UmaLandscape.cropFile(jpg); } finally { window.createImageBitmap = keep; }
				const none = await T.file(T.landscape(bmp, { W: 2780, H: 1564, bar: 0, px: 372, pw: 860 }, { band, noPanel: true }).c, 'none.png');
				const noneOut = await UmaLandscape.cropFile(none);
				const pc = document.createElement('canvas'); pc.width = bmp.width; pc.height = bmp.height; pc.getContext('2d').drawImage(bmp, 0, 0);
				return { png: pngOut === png, pngOpened, jpg: jpgOut === jpg, none: noneOut === none,
					hdr: await UmaLandscape.headerSize(png), portraitReason: UmaLandscape.findPanel(pc.getContext('2d').getImageData(0, 0, pc.width, pc.height)).reason };
			}, JPEG_DIR);
			assert(r.png && r.pngOpened === 0 && r.hdr && r.hdr.w === 976 && r.hdr.h === 1735, '(2) 縦長の PNG（DMM版の縦画面）は先頭のバイトで大きさを読み、絵を開かずに元の File を返す', r);
			assert(r.jpg, '(2) 縦長の JPEG（スマホ版）も元の File を返す', r.jpg);
			assert(r.none, '(2) 見出しの帯の無い横長の画（メニューの帯だけ）は元の File を返す（今までどおりの案内になる）', r.none);
			assert(r.portraitReason === 'portrait', '(2) findPanel は縦長の画を調べない', r.portraitReason);
		} finally { await sp.page.context().close(); }
	});

	await block('T145横画面 ―― (3) 切り出した画は、縦画面のスクショと同じ行が取れる（detectSkillRows・processPersonImages の行の数が同じ）', async () => {
		if (!hasImages) { assert(false, '前提: test-images の画像がある'); return; }
		const sp = await open('exam.html');
		try {
			const r = await sp.page.evaluate(async (SIZES) => {
				const T = window.__t145, bmp = await T.portrait(), band = T.band(bmp);
				const pc = document.createElement('canvas'); pc.width = bmp.width; pc.height = bmp.height; pc.getContext('2d').drawImage(bmp, 0, 0);
				const worker = { recognize: async () => ({ data: { text: '', lines: [] } }) };
				const rowsOf = async (file) => { const res = await processPersonImages(worker, [file], '親', true, true, false, null); return res.geometry[0] && res.geometry[0].rows ? res.geometry[0].rows.length : 0; };
				const base = detectSkillRows(pc, []);
				const out = { base: base ? base.rows.length : 0, baseProc: await rowsOf(await T.file(pc, 'p.png')), sizes: [] };
				for (const s of SIZES) {
					const L = T.landscape(bmp, s, { band });
					const f = await UmaLandscape.cropFile(await T.file(L.c, 'l.png'));
					const b2 = await createImageBitmap(f);
					const cc = document.createElement('canvas'); cc.width = b2.width; cc.height = b2.height; cc.getContext('2d').drawImage(b2, 0, 0);
					const det = detectSkillRows(cc, []);
					out.sizes.push({ name: s.name, w: cc.width, rows: det ? det.rows.length : 0, proc: await rowsOf(f), cols: det ? det.columnXs.map((x) => +(x / cc.width).toFixed(2)) : null });
				}
				out.baseCols = base ? base.columnXs.map((x) => +(x / pc.width).toFixed(2)) : null;
				return out;
			}, SIZES);
			assert(r.base >= 10 && r.baseProc === r.base, '前提: 縦画面のスクショで行が取れる', [r.base, r.baseProc]);
			r.sizes.forEach((o) => {
				assert(o.w === 1170 && o.rows === r.base && o.proc === r.base, '(3) ' + o.name + ': 切り出した画の行の数が縦画面と同じ（' + r.base + '）', o);
				assert(o.cols && o.cols.length === r.baseCols.length && o.cols.every((x, i) => Math.abs(x - r.baseCols[i]) <= 0.02), '(3) ' + o.name + ': 列の位置（幅に対する割合）も縦画面と同じ（±0.02）', [o.cols, r.baseCols]);
			});
		} finally { await sp.page.context().close(); }
	});

	for (const pg of ['exam.html', 'special.html']) {
		await block('T145横画面 ―― (4) ' + pg + ': 画像の枠に入れた横画面の画像はパネルを切り出した画像に置き換わり、縦長の画像はそのまま（同じ横画面の画像を入れ直しても増えない）', async () => {
			if (!hasImages) { assert(false, '前提: test-images の画像がある'); return; }
			const sp = await open(pg);
			try {
				const r = await sp.page.evaluate(async () => {
					const T = window.__t145, bmp = await T.portrait(), band = T.band(bmp);
					const land = await T.file(T.landscape(bmp, { W: 2880, H: 1920, bar: 150, px: 384, pw: 892 }, { band }).c, 'landscape.png');
					const port = new File([await (await fetch('/test-images/2026-09-15_3/2026-09-15_3_01.png')).blob()], 'portrait.png', { type: 'image/png' });
					addPersonFiles(0, [land, port]);
					const busy = landscapeBusy;
					await landscapeReady();
					const f = persons[0].files;
					const b0 = await createImageBitmap(f[0]);
					addPersonFiles(0, [land]);
					await landscapeReady();
					const log = devGeometry.filter((l) => /^\[横画面\]/.test(l));
					return { busy, n: f.length, n2: persons[0].files.length, name0: f[0].name, w0: b0.width, h0: b0.height, replaced: f[0] !== land, same1: f[1] === port, ls: f[0]._landscape, log };
				});
				assert(r.busy === 1, '(4) 入れた直後は切り出しの待ちが1つ（OCR・結合は landscapeReady で待つ）', r.busy);
				assert(r.n === 2 && r.replaced && r.name0 === 'landscape.png' && r.w0 === 1170 && r.h0 >= 2000 && r.h0 <= 2120, '(4) 横画面の画像は同じ名前の 1170px 幅の画像に置き換わる', r);
				assert(r.same1, '(4) 縦長の画像は元の File のまま', r.same1);
				assert(r.n2 === 2, '(4) 同じ横画面の画像をもう一度入れても増えない（元の大きさで同じと見る）', r.n2);
				assert(r.ls && r.ls.srcSize > 0 && r.log.length >= 1, '(4) 置き換えた画像に元の大きさの印・開発ログに [横画面] の行', [r.ls, r.log]);
			} finally { await sp.page.context().close(); }
		});
	}

	await block('T145横画面 ―― (5) ウィンドウの取り込み（pc-capture.js の detectOne）: 横長の窓（タイトルバー・枠つき）でパネルの矩形と幅 1170px を返し、静止画と同じ切り出しになる。縦長の窓は今のまま', async () => {
		if (!hasImages) { assert(false, '前提: test-images の画像がある'); return; }
		const sp = await open('special.html');
		try {
			const r = await sp.page.evaluate(async () => {
				const T = window.__t145, bmp = await T.portrait(), band = T.band(bmp);
				// 窓: 1px の暗い枠・32px のタイトルバー（同じ灰色）・中にゲーム（2780×1564）
				const s = { W: 2780, H: 1564, bar: 0, px: 372, pw: 860 };
				const L = T.landscape(bmp, s, { band });
				const win = (inner) => {
					const c = document.createElement('canvas'); c.width = inner.width + 2; c.height = inner.height + 34;
					const g = c.getContext('2d', { willReadFrequently: true });
					g.fillStyle = 'rgb(40,40,40)'; g.fillRect(0, 0, c.width, c.height);
					g.fillStyle = 'rgb(238,238,238)'; g.fillRect(1, 1, c.width - 2, 32);
					g.drawImage(inner, 1, 33);
					return c;
				};
				const wc = win(L.c);
				const img = wc.getContext('2d').getImageData(0, 0, wc.width, wc.height);
				const a = UmaPcCapture.detectOne(img);
				const still = UmaLandscape.findPanel(L.c.getContext('2d').getImageData(0, 0, s.W, s.H));
				const cons = UmaPcCapture.consensus([a, a, a]);
				const baseSrc = UmaVideoFrames.canvasSource({ width: wc.width, height: wc.height, duration: 1, exact: true, draw: async (t, ctx, dw, dh) => { ctx.drawImage(wc, 0, 0, dw, dh); } });
				const cs = UmaPcCapture.cropSource(baseSrc, cons);
				// 縦長の窓（縦画面のスクショをそのまま）
				const pw = win(bmp);
				const pa = UmaPcCapture.detectOne(pw.getContext('2d').getImageData(0, 0, pw.width, pw.height));
				return { a, still: { x: still.x, y: still.y, w: still.w, h: still.h, outW: still.outW }, cons: { ok: cons.ok, outW: cons.outW, outH: cons.outH, how: cons.how }, cs: { w: cs.width, h: cs.height }, pa };
			});
			assert(r.a.ok && r.a.how === 'landscape' && r.a.outW === 1170, '(5) 横長の窓は how=landscape・幅 1170px', r.a);
			assert(Math.abs(r.a.x - 1 - r.still.x) <= 1 && Math.abs(r.a.y - 33 - r.still.y) <= 1 && Math.abs(r.a.w - r.still.w) <= 1 && Math.abs(r.a.h - r.still.h) <= 1,
				'(5) 矩形は静止画の切り出しを窓の枠・タイトルバーの分ずらしたもの（±1px）', [r.a, r.still]);
			assert(r.cons.ok && r.cons.outW === 1170 && r.cs.w === 1170 && Math.abs(r.cs.h - r.cons.outH) <= 1, '(5) consensus が幅 1170px を引き継ぎ、cropSource の出どころも 1170px 幅', [r.cons, r.cs]);
			assert(r.pa.ok && r.pa.how !== 'landscape' && !r.pa.outW && r.pa.w === 976 && r.pa.h === 1735, '(5) 縦長の窓は今のまま（タイトルバーと枠を除いたゲームの画・拡大しない）', r.pa);
		} finally { await sp.page.context().close(); }
	});

	await block('T145横画面 ―― (6) 動画の出どころ（wrapSource）: 横長ならパネルを切り出した 1170px 幅の出どころ、縦長なら同じ出どころを返す', async () => {
		if (!hasImages) { assert(false, '前提: test-images の画像がある'); return; }
		const sp = await open('exam.html');
		try {
			const r = await sp.page.evaluate(async () => {
				const T = window.__t145, bmp = await T.portrait(), band = T.band(bmp);
				const s = { W: 1998, H: 1124, bar: 0, px: 268, pw: 618 };
				const L = T.landscape(bmp, s, { band });
				const src = UmaVideoFrames.canvasSource({ width: s.W, height: s.H, duration: 2, exact: true, draw: async (t, ctx, dw, dh) => { ctx.drawImage(L.c, 0, 0, dw, dh); } });
				let closed = 0;
				const w = await UmaLandscape.wrapSource(Object.assign(src, { close() { closed++; } }));
				const c = document.createElement('canvas'); c.width = w.width; c.height = w.height;
				await w.drawAt(1, c.getContext('2d'), w.width, w.height);
				const ref = UmaLandscape.cropToCanvas(L.c, UmaLandscape.findPanel(L.c.getContext('2d').getImageData(0, 0, s.W, s.H)));
				const d1 = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, d2 = ref.getContext('2d').getImageData(0, 0, ref.width, ref.height).data;
				let diff = 0; for (let i = 0; i < d1.length; i += 4) diff += Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
				w.close();
				const psrc = UmaVideoFrames.canvasSource({ width: bmp.width, height: bmp.height, duration: 2, draw: async (t, ctx, dw, dh) => { ctx.drawImage(bmp, 0, 0, dw, dh); } });
				const same = (await UmaLandscape.wrapSource(psrc)) === psrc;
				// パネルの無い横長の動画は code 'band'（今の「継承の画面が見つからない」の案内）
				const N = T.landscape(bmp, s, { band, noPanel: true });
				let err = null;
				try { await UmaLandscape.wrapSource(UmaVideoFrames.canvasSource({ width: s.W, height: s.H, duration: 2, draw: async (t, ctx, dw, dh) => { ctx.drawImage(N.c, 0, 0, dw, dh); } })); } catch (e) { err = e.code; }
				return { w: w.width, h: w.height, kind: w.kind, ls: w.landscape, sameSize: c.width === ref.width && c.height === ref.height, meanDiff: diff / (d1.length / 4 * 3), closed, same, err };
			});
			assert(r.w === 1170 && /^landscape:/.test(r.kind) && r.ls && r.ls.agree === 7, '(6) 横長の出どころは 1170px 幅・7か所の画で同じ矩形', r);
			assert(r.sameSize && r.meanDiff < 2, '(6) 切り出した出どころの画は、静止画の切り出しと同じ（画素の差の平均 2 未満）', [r.sameSize, r.meanDiff]);
			assert(r.closed === 1, '(6) 切り出した出どころを閉じると元の出どころも閉じる', r.closed);
			assert(r.same, '(6) 縦長の出どころはそのまま返す', r.same);
			assert(r.err === 'band', '(6) パネルの無い横長の動画は code band の例外', r.err);
		} finally { await sp.page.context().close(); }
	});
}
