// UmaExam の2列の直し（T160・2026-11-10・おいもさんの決定 646〜648・655・656・662）の検査。
// run-smoke.mjs の末尾から register163() で呼ばれる（塊の見出しはすべて「T160」で始まる。`npm run test:visual -- --only=T160` で回せる）。
//
//  (1) 656・662: 2列の3列目の補助の帯の字は 40px で、3列目の幅で折り返す（3列目が細くても縮めない）。帯より上（見出し・カード・因子と遺伝子の字・
//      効率を指定のパネルと合計）は列の幅の 0.85 倍を基準に小さくする（3モード）。帯・カードは列の幅いっぱいのまま。
//  (2) 646・655: 親のいないセットの2列は、祖1｜祖2 を縮めずに横に並べる（祖が1人なら1列目だけ）。3列目は人の上端から・最初の人の列の幅（UmaExam）。
//      UmaStar（special.html の composeFamilyImage2）も同じ。親がいるセットは今のまま（祖1 の下に祖2）。
//  (3) 647・656: 「印＋凡例だけ」で1・2列目の下に置く帯は、上の区切り線なし・字は 40px。
//  (4) 656: OCR の前の②に「画像を更新」が出る（VIDEO_PREVIEW_REFRESH）。2列｜3列を切り替えると押せるようになり、押すと取り込み直さずに②の画が作り直される。
//  (5) 3列の画は直す前（d7bd6c2）と画素まで同じ（3モード・作り物の画像。直す前の画の SHA-256 を実測して固定値にした）。
// 人の画像は作り物（Canvas。小窓の上端の緑の帯と、小窓の外の濃い灰を描く）。OCR の結果も作り物に差し替える。スキル名は検査の側に書かない（恒久ルール1）。

// 直す前（d7bd6c2）の exam.html で、下の (5) と同じ作り物から作った3列の画の SHA-256（作業の道具 before-hash で実測。作り物の帯に合計の行が無いので、通常とめろっぷ拡張は同じ画）
const BEFORE_3COL = {
	normal: '088effe2d4ad5dcec1cea4ca240f45fc2aa51f53b4d21da6def221cfba5a5403',
	melop: '088effe2d4ad5dcec1cea4ca240f45fc2aa51f53b4d21da6def221cfba5a5403',
	eff: '16632a8840742ae56ce72ad98dadd8a414d4e9a4fd74ce5c23d3ce086bbcf11d'
};

export async function register163(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const open = async (viewport) => {
		const sp = await openPage(browser, base, 'exam.html', viewport || { width: 1280, height: 900 }, EMPTY);
		sp.page.setDefaultTimeout(60000);
		await sp.page.addScriptTag({ content: HELPERS });
		return sp;
	};
	// ページの中の道具（blocks-157 の __t154 と同じ作りの作り物。幅 W を人ごとに変えられる）
	const HELPERS = `
		window.__t160 = {
			// 1人分。src＝1枚目の画（小窓の上端の緑の帯が y=100・左右の端 L=40・R=W-40）。content＝結合画像（描き始めは 1枚目の y=400 から）
			person(h, W) {
				const L = 40, R = W - 40;
				const src = document.createElement('canvas'); src.width = W; src.height = 2400;
				const g = src.getContext('2d');
				g.fillStyle = 'rgb(70,70,70)'; g.fillRect(0, 0, W, src.height);
				g.fillStyle = 'rgb(235,235,235)'; g.fillRect(L, 100, R - L, src.height - 100);
				g.fillStyle = 'rgb(110,200,60)'; g.fillRect(L, 100, R - L, 60);
				const c = document.createElement('canvas'); c.width = W; c.height = h;
				const x = c.getContext('2d');
				x.fillStyle = 'rgb(70,70,70)'; x.fillRect(0, 0, W, h);
				x.fillStyle = 'rgb(235,235,235)'; x.fillRect(L, 0, R - L, h);
				x.fillStyle = 'rgb(200,120,40)'; for (let y = 60; y + 40 < h; y += 120) x.fillRect(L + 100, y, 300, 40);
				c._sourcePlacements = [{ fileIndex: 0, srcY0: 400, srcY1: 2400, outY0: 0 }];
				return { src, c };
			},
			async fileOf(canvas, name) { const b = await new Promise((r) => canvas.toBlob(r, 'image/png')); return new File([b], name, { type: 'image/png' }); },
			// [y0, y1) の行のうち、[x0, x1) の 60% 以上が灰色（#c8c8c8〜#e8e8e8 あたり）の行
			grayRows(c, x0, x1, y0, y1) {
				const out = [];
				const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
				const w = x1 - x0;
				for (let y = 0; y < y1 - y0; y++) {
					let n = 0;
					for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i] >= 195 && d[i] <= 232 && Math.abs(d[i] - d[i + 1]) <= 4 && Math.abs(d[i] - d[i + 2]) <= 4) n++; }
					if (n >= w * 0.6) out.push(y0 + y);
				}
				return out;
			},
			// [x0, x1)×[y0, y1) で白でない画素のいちばん右の x（無ければ -1）
			inkRight(c, x0, x1, y0, y1) {
				const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
				const w = x1 - x0;
				let best = -1;
				for (let y = 0; y < y1 - y0; y++) for (let x = w - 1; x >= 0; x--) { const i = (y * w + x) * 4; if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) { if (x > best) best = x; break; } }
				return best < 0 ? -1 : x0 + best;
			},
			// 字のある行のまとまり（白でない画素のある行が続くところ）の数と高さ
			inkBands(c, x0, x1, y0, y1) {
				const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
				const w = x1 - x0;
				const bands = [];
				let cur = null;
				for (let y = 0; y < y1 - y0; y++) {
					let ink = false;
					for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) { ink = true; break; } }
					if (ink) { if (!cur) { cur = { y: y0 + y, h: 0 }; bands.push(cur); } cur.h++; } else cur = null;
				}
				return bands;
			},
			async hash(canvas) {
				const bytes = new TextEncoder().encode(canvas.toDataURL('image/png'));
				const d = await crypto.subtle.digest('SHA-256', bytes);
				return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
			},
			saved: null,
			// OCR の結果と人の画像を作り物に差し替える。heights … 6人ぶんの結合画像の高さ（0 はその人なし）。W … 人の画像の幅
			async install(heights, W) {
				const T = this;
				const made = {};
				const files = [];
				for (let i = 0; i < 6; i++) {
					if (!heights[i]) { files.push([]); continue; }
					const p = T.person(heights[i], W || 1179);
					made[PERSON_LABELS[i]] = p.c;
					files.push([await T.fileOf(p.src, 'p' + i + '.png')]);
				}
				if (!T.saved) T.saved = { stitchPersonCanvas, countDetected, countCategory, scenarioFactorHighlight, aptitudeGeneHighlight, drawAttrIconsOnPerson,
					drawEffIconsOnPerson, effPersonItems, effTotals, buildTargetAdjustmentNotes, stitchDrawEffPersonBanner, stitchDrawPersonBanner };
				T.calls = { eff: [], plain: [] };
				const S = T.saved;
				const clone = (c) => { const o2 = document.createElement('canvas'); o2.width = c.width; o2.height = c.height; o2.getContext('2d').drawImage(c, 0, 0); o2._sourcePlacements = c._sourcePlacements; return o2; };
				stitchPersonCanvas = async (fs, video, label) => (made[label] ? clone(made[label]) : null);
				countDetected = (idx) => 31 - idx;
				countCategory = () => 7;
				scenarioFactorHighlight = () => ({ items: [{ text: '因子X：★2' }], more: false });
				aptitudeGeneHighlight = (idx) => { const n = [1, 2, 0][idx % 3]; return n ? { items: Array.from({ length: n }, (_, k) => ({ text: '遺伝子' + k + '：★1' })), more: false } : null; };
				drawAttrIconsOnPerson = (c, idx, run) => ({ kinds: run.attrIcons ? ['sp70', 'green'] : [], suppressed: null });
				drawEffIconsOnPerson = () => ({ placed: 0, wanted: 0, sizes: [], suppressed: null });
				effPersonItems = () => [];
				effTotals = () => null;
				buildTargetAdjustmentNotes = () => ['作り物の集計条件の行'];
				stitchDrawEffPersonBanner = (...a) => { T.calls.eff.push(Object.assign({}, a[6] || {})); return S.stitchDrawEffPersonBanner(...a); };
				stitchDrawPersonBanner = (...a) => { T.calls.plain.push(Object.assign({}, a[6] || {})); return S.stitchDrawPersonBanner(...a); };
				return files;
			},
			uninstall() { if (this.saved) Object.entries(this.saved).forEach(([k, f]) => { window[k] = f; }); this.saved = null; },
			run(files, o) {
				const opt = Object.assign({ mode: 'normal', cols: 3, banner: true, scenario: true, marks: true, legend: true, conditions: true }, o || {});
				return Object.assign(captureRun(), {
					files, videos: files.map(() => null), deck: false, cols: opt.cols, attrIcons: opt.marks, effShoes: opt.marks,
					show: { banner: opt.banner, scenario: opt.scenario, legend: opt.legend, conditions: opt.conditions },
					factors: new Set(['作り物']), genes: new Set(['作り物']),
					scope: opt.mode === 'eff' ? 'efficiency' : 'default', melop: opt.mode === 'melop',
					eff: opt.mode === 'eff' ? { bounds: effBounds.slice(), tiers: [true, true, true, true] } : null
				});
			}
		};
	`;
	// ページの中で作り物を入れて fn を回し、必ず元に戻す
	const withFakes = (page, heights, W, fnSrc, args) => page.evaluate(async ({ heights, W, fnSrc, args }) => {
		const T = window.__t160;
		await loadEffData();
		const files = await T.install(heights, W);
		try { return await (eval('(' + fnSrc + ')'))(T, files, args); }
		finally { T.uninstall(); }
	}, { heights, W, fnSrc: fnSrc.toString(), args: args || null });

	await block('T160 (1) 2列の3列目: 補助の帯の字は 40px で3列目の幅で折り返す（細い列でも縮めない）・帯より上は列の幅の 0.85 倍を基準に小さく（3モード）', async () => {
		const sp = await open();
		try {
			for (const mode of ['normal', 'melop', 'eff']) {
				for (const W of [1179, 760]) {
					const r = await withFakes(sp.page, [2000, 1700, 2200, 0, 0, 0], W, async (T, files, { mode }) => {
						const c = await buildStitchedSetImage(0, T.run(files, { mode, cols: 2 }));
						const L = c._layout;
						const opts = mode === 'eff' ? T.calls.eff : T.calls.plain;
						const n = L.col3.parts[3];
						// 同じ列の幅・同じ中身で、倍率を付けない帯（直す前の大きさ）の高さ
						const S = T.saved;
						const unscaled = opts.map((o, i) => {
							const o1 = Object.assign({}, o); delete o1.sizeK;
							const lab = ['親A', '祖A1', '祖A2'][i];
							return (mode === 'eff' ? S.stitchDrawEffPersonBanner : S.stitchDrawPersonBanner)(L.col3.w, lab, 31 - i, 7, scenarioFactorHighlight(i), aptitudeGeneHighlight(i), o1).height;
						});
						return {
							L, sizeK: opts.map((o) => o.sizeK), K: STITCH_TWO_COL_BANNER_K, hs: L.col3.parts.slice(0, 3).map((p) => p.h), unscaled,
							noteFont: L.noteFont, noteBands: T.inkBands(c, L.col3.x + 2, L.col3.x + L.col3.w - 2, n.y, n.y + n.h).filter((b) => b.h >= 10).length,
							noteRight: T.inkRight(c, L.col3.x, L.col3.x + L.col3.w, n.y, n.y + n.h), x3: L.col3.x, w3: L.col3.w,
							oneLine: (() => { const g = document.createElement('canvas').getContext('2d'); g.font = 'bold 40px sans-serif'; return g.measureText(mode === 'eff' ? EFF_COUNT_NOTE : STITCH_COUNT_NOTE).width; })()
						};
					}, { mode });
					const tag = 'T160(1) ' + mode + ' 人の幅 ' + W + ': ';
					assert(r.K === 0.85 && r.sizeK.length === 3 && r.sizeK.every((k) => k === 0.85), tag + '3列目の帯は倍率 0.85 で描く（見出し・カード・因子と遺伝子の字・パネル）', r.sizeK);
					assert(r.hs.every((h, i) => h < r.unscaled[i]) && r.hs.every((h, i) => h >= r.unscaled[i] * 0.75), tag + '帯の高さは直す前の大きさより低い（字・余白・カードを小さく。0.75 倍より下には縮めない）', { hs: r.hs, unscaled: r.unscaled });
					assert(r.noteFont === 40, tag + '補助の帯の字は 40px（脚注の1行が列に入る大きさに縮めない）', { font: r.noteFont });
					assert(r.oneLine > r.w3 - 2 * Math.round(r.w3 * 0.03) ? r.noteBands >= 2 : true, tag + '脚注が列の幅に入らないときは折り返す（字のある行のまとまりが2つ以上）', { bands: r.noteBands, oneLine: r.oneLine, w3: r.w3 });
					assert(r.noteRight > 0 && r.noteRight <= r.x3 + r.w3 - 10, tag + '補助の帯の字は3列目の幅の中（右へはみ出さない）', { right: r.noteRight, x3: r.x3, w3: r.w3 });
				}
			}
			// 3列は倍率なし（sizeK を渡さない）
			const t = await withFakes(sp.page, [2000, 1700, 2200, 0, 0, 0], 1179, async (T, files) => {
				await buildStitchedSetImage(0, T.run(files, { cols: 3 }));
				return T.calls.plain.map((o) => o.sizeK === undefined);
			});
			assert(t.length === 3 && t.every(Boolean), 'T160(1) 3列の帯には倍率を渡さない（今のまま）', t);
			assert(jsErrors(sp.errors).length === 0, 'T160(1) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});

	await block('T160 (2) 親のいないセットの2列: 祖1｜祖2 を縮めずに横に並べる（UmaExam・UmaStar）・祖が1人なら1列目・親がいれば今のまま', async () => {
		const sp = await open();
		try {
			const g = await withFakes(sp.page, [0, 1700, 2200, 0, 0, 0], 1179, async (T, files) => {
				const c = await buildStitchedSetImage(0, T.run(files, { cols: 2 }));
				return { L: c._layout, w: c.width, h: c.height };
			});
			const L = g.L;
			assert(!L.parent && L.grandScale === 1 && L.grands.length === 2 && L.grands[0].x === 0 && L.grands[0].y === 0 && L.grands[1].y === 0 && L.grands[1].x === L.grands[0].w + 8
				&& L.grands[0].w === 1099 && L.grands[0].h === 1700 && L.grands[1].h === 2200 && L.colH === 2200,
				'T160(2) UmaExam: 1列目＝祖1・2列目＝祖2（どちらも縮めない・拡大しない・上端をそろえる・列の間 8px）', L);
			assert(L.col3 && L.col3.y === 0 && L.col3.x === L.grands[1].x + L.grands[1].w + 8 && L.col3.w === L.grands[0].w && g.w === L.col3.x + L.col3.w && g.h === Math.max(L.colH, L.col3.h),
				'T160(2) UmaExam: 3列目は今までどおり（人の上端から・幅は最初の人の列の幅）', { col3: L.col3, w: g.w, h: g.h });
			const one = await withFakes(sp.page, [0, 0, 2200, 0, 0, 0], 1179, async (T, files) => {
				const c = await buildStitchedSetImage(0, T.run(files, { cols: 2 }));
				return c._layout;
			});
			assert(one.grands.length === 1 && one.grands[0].x === 0 && one.grands[0].y === 0 && one.colH === 2200 && one.col3.x === one.grands[0].w + 8,
				'T160(2) UmaExam: 祖が1人だけなら、その1人を1列目に', one);
			const par = await withFakes(sp.page, [2000, 1700, 2200, 0, 0, 0], 1179, async (T, files) => { const c = await buildStitchedSetImage(0, T.run(files, { cols: 2 })); return c._layout; });
			assert(par.parent && par.grands.length === 2 && par.grands[0].x === par.grands[1].x && par.grands[1].y === par.grands[0].h && par.grandScale < 1,
				'T160(2) UmaExam: 親がいるセットは今のまま（祖1 の下に祖2・同じ縮小率）', par.grands);
			// OCR の前の②（動画の取り込みのあと）も同じ組み立て
			const pv = await withFakes(sp.page, [0, 1700, 2200, 0, 0, 0], 1179, async (T, files) => {
				const keep = stitchCols;
				try { stitchCols = 2; const c = await buildVideoPreviewSetImage(0, files.slice(0, 3)); return c._layout; } finally { stitchCols = keep; }
			});
			assert(pv.grands.length === 2 && pv.grands[1].x === pv.grands[0].w + 8 && pv.grands[1].y === 0 && !pv.col3, 'T160(2) UmaExam の OCR の前の②: 祖1｜祖2 を横に（3列目なし）', pv.grands);
			assert(jsErrors(sp.errors).length === 0, 'T160(2) UmaExam のページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
		// UmaStar（special.html の composeFamilyImage2）
		const ss = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, EMPTY);
		try {
			await ss.page.waitForFunction(() => typeof composeFamilyImage2 === 'function');
			const r = await ss.page.evaluate(() => {
				const wide = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, H); c._twoCol = { band: null, topH: 0, srcW: W }; return c; };
				const parts = (cs) => ({ idxs: [0, 1, 2], canvases: cs, heads: [null, null, null], table: null, legend: buildFactorFrameLegendBar(STITCH_LAYOUT.legendMaxW, STITCH_LAYOUT.legendRef, true), barText: 'T160', top: null, genes: null, title: true });
				const lay = (cs) => { const c = composeFamilyImage2(parts(cs)); return Object.assign({ cw: c.width, ch: c.height }, JSON.parse(JSON.stringify(c._layout))); };
				return { L: { margin: STITCH_LAYOUT.margin, innerGap: STITCH_LAYOUT.innerGap, legendGap: STITCH_LAYOUT.legendGap },
					two: lay([null, wide(1150, 2200), wide(1100, 1900)]), one: lay([null, null, wide(1150, 1900)]), par: lay([wide(1150, 2600), wide(1150, 2200), wide(1150, 1900)]) };
			});
			const { L, two, one, par } = r;
			assert(!two.parent && two.grandScale === 1 && two.grands.length === 2 && two.grands[0].x === L.margin && two.grands[0].y === two.personsY && two.grands[1].y === two.personsY
				&& two.grands[1].x === L.margin + 1150 + L.innerGap && two.grands[0].h === 2200 && two.grands[1].h === 1900 && two.colH === 2200,
				'T160(2) UmaStar: 1列目＝祖1・2列目＝祖2（縮めない・上端をそろえる・列の間は親｜祖と同じ innerGap）', two);
			assert(two.legend && two.legend.y === two.personsY + 2200 + L.legendGap && two.cw === L.margin * 2 + 1150 + L.innerGap + 1100,
				'T160(2) UmaStar: 枠の見かたは2人の下（高いほうの下端から）・画の幅は2人ぶん', { legend: two.legend, cw: two.cw });
			assert(one.grands.length === 1 && one.grands[0].x === L.margin && one.colH === 1900, 'T160(2) UmaStar: 祖が1人だけなら1列目に', one.grands);
			assert(par.parent && par.grands[0].x === par.grands[1].x && par.grands[1].y === par.grands[0].y + par.grands[0].h && par.grandScale < 1,
				'T160(2) UmaStar: 親がいるセットは今のまま（祖1 の下に祖2）', par.grands);
			assert(jsErrors(ss.errors).length === 0, 'T160(2) UmaStar のページのエラーなし', ss.errors);
		} finally { await ss.page.context().close(); }
	});

	await block('T160 (3) 印＋凡例だけ: 1・2列目の下の帯に上の区切り線が無い・字は 40px（通常・めろっぷ拡張）', async () => {
		const sp = await open();
		try {
			for (const mode of ['normal', 'melop']) {
				const r = await withFakes(sp.page, [2000, 1700, 2200, 0, 0, 0], 1179, async (T, files, { mode }) => {
					const c = await buildStitchedSetImage(0, T.run(files, { mode, cols: 2, banner: false, scenario: false }));
					const u = c._layout.under;
					return { col3: !!c._layout.col3, u, gray: u ? T.grayRows(c, 40, u.w - 40, u.y, u.y + u.h) : null, bands: u ? T.inkBands(c, 0, u.w, u.y, u.y + u.h).filter((b) => b.h >= 10).length : 0 };
				}, { mode });
				assert(!r.col3 && r.u && r.u.fontSize === 40 && r.u.y === 2300, 'T160(3) ' + mode + ': 凡例は1・2列目の下（3列目なし）・字は 40px', r.u);
				assert(r.gray.length === 0 && r.bands >= 1, 'T160(3) ' + mode + ': 帯の中に横の区切り線が無い（字はある）', { gray: r.gray, bands: r.bands });
			}
			assert(jsErrors(sp.errors).length === 0, 'T160(3) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});

	await block('T160 (4) OCR の前の②に「画像を更新」: 出す（VIDEO_PREVIEW_REFRESH）・2列｜3列を切り替えると押せる・押すと取り込み直さずに②の画が今の形に作り直される', async () => {
		const sp = await open({ width: 390, height: 844 });
		try {
			const { page } = sp;
			await page.evaluate(() => { localStorage.setItem('uma-exam-last-step', '2'); setUploadMode('video'); selectStepTab(2); setStitchCols(3); });
			const setup = await page.evaluate(async () => {
				const T = window.__t160;
				const files = await T.install([2000, 1700, 2200, 0, 0, 0], 1179);
				window.__t160files = files;
				for (let r = 0; r < 3; r++) persons[r].files = files[r].slice();
				const ok = await autoStitchVideoSet(0);
				return { flag: VIDEO_PREVIEW_REFRESH, ok };
			});
			const st = () => page.evaluate(() => {
				const box = document.querySelector('#personset-A-wrap .video-result');
				const btn = box && box.querySelector('[data-video-refresh]');
				const img = box && box.querySelector('img');
				return { btn: !!btn, disabled: btn ? btn.disabled : null, state: btn ? btn.getAttribute('data-state') : null, label: btn ? btn.textContent.trim() : null,
					src: img ? img.src.slice(-80) : null, w: img ? img.naturalWidth : 0, sel: (window.__n || {}).select || 0 };
			});
			await page.waitForTimeout(300);
			const s0 = await st();
			assert(setup.flag === true && setup.ok === true && s0.btn && s0.label === '画像を更新' && s0.disabled === true && s0.state === 'same',
				'T160(4) OCR の前の②に「画像を更新」が出る（作ったときと同じ設定なので押せない）', { setup, s0 });
			await page.evaluate(() => setStitchCols(2));
			const s1 = await st();
			assert(s1.disabled === false && s1.state === 'ready', 'T160(4) 2列に切り替えると押せる', s1);
			await page.evaluate(() => document.querySelector('#personset-A-wrap [data-video-refresh]').click());
			await page.waitForFunction((w0) => { const img = document.querySelector('#personset-A-wrap .video-result img'); return img && img.naturalWidth && img.naturalWidth !== w0 && videoRefreshBusy < 0; }, s0.w, { timeout: 30000 });
			const s2 = await st();
			assert(s2.w < s0.w && s2.state === 'same' && s2.disabled === true, 'T160(4) 押すと②の画が2列で作り直される（幅が3列より狭い）・また押せない状態に', { before: s0.w, after: s2.w, s2 });
			await page.evaluate(() => setStitchCols(3));
			const s3 = await st();
			assert(s3.state === 'ready' && s3.disabled === false, 'T160(4) 3列に戻すと押せる', s3);
			await page.evaluate(() => document.querySelector('#personset-A-wrap [data-video-refresh]').click());
			await page.waitForFunction((w0) => { const img = document.querySelector('#personset-A-wrap .video-result img'); return img && img.naturalWidth === w0 && videoRefreshBusy < 0; }, s0.w, { timeout: 30000 });
			const s4 = await st();
			assert(s4.w === s0.w && s4.w === 1179 * 3 + 16, 'T160(4) 押すと3列の画に戻る', { s0: s0.w, s4: s4.w });
			const files = await page.evaluate(() => persons.slice(0, 3).map((p, i) => p.files.length === window.__t160files[i].length && p.files.every((f, k) => f === window.__t160files[i][k])));
			assert(files.every(Boolean), 'T160(4) 取り込み直さない（3人の枠の画はそのまま）', files);
			await page.evaluate(() => { window.__t160.uninstall(); setStitchCols(3); });
			assert(jsErrors(sp.errors).length === 0, 'T160(4) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});

	await block('T160 (5) 3列の画は直す前と画素まで同じ（通常・めろっぷ拡張・効率を指定。作り物の画像）', async () => {
		const sp = await open();
		try {
			for (const mode of ['normal', 'melop', 'eff']) {
				const h = await withFakes(sp.page, [2000, 1700, 2200, 0, 0, 0], 1179, async (T, files, { mode }) => {
					const c = await buildStitchedSetImage(0, T.run(files, { mode, cols: 3 }));
					return { hash: await T.hash(c), w: c.width, h: c.height };
				}, { mode });
				assert(h.hash === BEFORE_3COL[mode], 'T160(5) ' + mode + ': 3列の画は直す前（d7bd6c2）と画素まで同じ', { got: h.hash, want: BEFORE_3COL[mode], w: h.w, h: h.h });
			}
			assert(jsErrors(sp.errors).length === 0, 'T160(5) ページのエラーなし', sp.errors);
		} finally { await sp.page.context().close(); }
	});
}
