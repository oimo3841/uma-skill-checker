// UmaExam のつまみで行が落ちる件の直し（T142・2026-11-09・決定 543・547。T141 で special.html に入れた T138 の案A′＋B＋C を exam.html に）の検査。blocks-147 を exam.html 向けに写したもの。
// run-smoke.mjs の末尾から register148() で呼ばれる（塊の見出しはすべて「T142examつまみと★」で始まる。
// `npm run test:visual -- --only=T142examつまみと★` で回せる）。
//
// 決め（T138 の調べ。動画の画で、右端のスクロールバーのつまみが行のすきまを埋めて2段が1本の帯につながり、
// detectSkillRows〔common.js〕の高さの条件で段ごと捨てられていた。抜けた段の★は上の段に足されていた）:
//  - A′: processPersonImages で detectSkillRows の前に、右端の帯（x≥0.9W）で縦に 0.03H 以上続く暗い画素の列を白で塗る
//        （maskScrollbarThumb）。行が取れなかったとき（画全体を OCR する道）は塗る前の画に戻す。動画の画・スクショの両方。
//  - B : ★を数える範囲は、次の文字帯がすきまの中央値の 1.6 倍より遠い行だけ、すきまの中央値まで（computeRowStarCountsExam）。
//  - C : ★の数え直しで、幅 0.005W（最低 3px）未満の金色の列の連なりを★と数えない。すきま1列までつなぐのは今と同じ（countRowStarBlobs）。
//  - common.js（凍結）は変えない。common.js の detectSkillRows・computeRowStarCounts・countGoldBlobs はそのまま。
// 画は作り物（Canvas で描く。W 1180 × H 2554＝動画の画と同じ大きさ）。OCR は作り物の worker（recognize に渡る画だけを見る）。

export async function register148(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const open = async () => {
		const sp = await openPage(browser, base, 'exam.html', { width: 375, height: 812 }, EMPTY);
		sp.page.setDefaultTimeout(60000);
		await sp.page.evaluate(() => {
			window.__t142 = {
				W: 1180, H: 2554,
				GOLD: 'rgb(255,210,60)',
				canvas() {
					const c = document.createElement('canvas'); c.width = this.W; c.height = this.H;
					const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, this.W, this.H);
					return c;
				},
				// 固有スキル帯（青帯＋すぐ下の全幅でない緑帯）。detectSkillRows はこの下を一覧として読む
				unique(g, y) { g.fillStyle = 'rgb(60,140,230)'; g.fillRect(200, y, 360, 60); g.fillStyle = 'rgb(110,200,60)'; g.fillRect(200, y + 80, 360, 60); },
				// 文字の帯（2列。高さ h）
				textRow(g, y, h) { g.fillStyle = 'rgb(60,60,60)'; g.fillRect(300, y, 220, h); g.fillRect(760, y, 220, h); },
				// スクロールバーのつまみ（右端 x=1138〜1147・灰色 115）
				thumb(g, y0, y1) { g.fillStyle = 'rgb(115,115,115)'; g.fillRect(1138, y0, 10, y1 - y0); },
				gray(c, x, y) { const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return Math.round(0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]); },
				async file(c, name) { const b = await new Promise((r) => c.toBlob(r, 'image/png')); return new File([b], name, { type: 'image/png' }); },
				// (1) の画: 高さ 22 の帯がすきま 16 で並ぶ一覧。右端につまみ。dotAt の帯のすきまの中ほどに暗い点（3px）
				thumbFrame(o) {
					const c = this.canvas(), g = c.getContext('2d');
					this.unique(g, 1400);
					const ys = [];
					for (let y = 1600; y + 22 < 2300; y += 38) { this.textRow(g, y, 22); ys.push(y); }
					if (o.thumb) this.thumb(g, 1580, 2320);
					if (o.dotAt != null) { g.fillStyle = 'rgb(60,60,60)'; g.fillRect(600, ys[o.dotAt] + 22 + 7, 3, 1); }
					return { c, ys };
				}
			};
			// 作り物の画は地が白ばかりで鮮明度の足切りに掛かるので、画質の確かめだけ通す（この検査は行の検出から先を見る）
			window.assessImageQuality = () => ({ ok: true, sharpness: null, warnings: [], reasons: [], rejectKinds: [], warnKinds: [] });
		});
		return sp;
	};

	await block('T142examつまみと★ ―― (1) すきまのつまみ＋暗い点で2段が1本につながる画で、つまみを塗ると2段が別々に取れる（塗らないと段ごと落ちる）', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(async () => {
				const T = window.__t142;
				const DOT = 5;
				const rowsOf = (det) => det ? det.rows.length : 0;
				const bandYs = (det) => det ? det.bands.map((b) => b.a) : [];
				// common.js の detectSkillRows だけ（塗らない）: 点のある段が落ちる
				const raw = T.thumbFrame({ thumb: true, dotAt: DOT });
				const detRaw = detectSkillRows(raw.c, []);
				const clean = T.thumbFrame({ thumb: true });
				const detClean = detectSkillRows(clean.c, []);
				// つまみを塗ってから（processPersonImages と同じ順）
				const painted = T.thumbFrame({ thumb: true, dotAt: DOT });
				const diag = [];
				const saved = maskScrollbarThumb(painted.c, diag);
				const detPainted = detectSkillRows(painted.c, []);
				// 塗らない画（つまみが無い）は何もしない
				const noThumb = T.thumbFrame({ dotAt: DOT });
				const diag2 = [];
				const savedNo = maskScrollbarThumb(noThumb.c, diag2);
				// processPersonImages を通す: 今の作り（塗る）と、塗る所を切った作り（壊す確認）
				const worker = { recognize: async () => ({ data: { text: '', lines: [] } }) };
				const f = await T.file(T.thumbFrame({ thumb: true, dotAt: DOT }).c, 'shot-1.png');
				devGeometry = [];
				const on = await processPersonImages(worker, [f], '祖1', true, true, false, null);
				const onLog = devGeometry.join('\n');
				const keep = window.maskScrollbarThumb;
				window.maskScrollbarThumb = () => null;
				let off;
				try { devGeometry = []; off = await processPersonImages(worker, [f], '祖1', true, true, false, null); }
				finally { window.maskScrollbarThumb = keep; }
				const dotA = raw.ys[DOT], dotB = raw.ys[DOT + 1];
				return {
					nBands: raw.ys.length, dotA, dotB,
					rawRows: rowsOf(detRaw), rawHas: [bandYs(detRaw).includes(dotA), bandYs(detRaw).includes(dotB)],
					cleanRows: rowsOf(detClean),
					paintedRows: rowsOf(detPainted), paintedHas: [bandYs(detPainted).includes(dotA), bandYs(detPainted).includes(dotB)],
					diag, saved: !!saved, thumbAfter: T.gray(painted.c, 1142, 1900), textAfter: T.gray(painted.c, 970, dotA + 5),
					size: painted.c.width + 'x' + painted.c.height,
					noThumbSaved: savedNo, diag2,
					onRows: on.geometry[0] && on.geometry[0].rows ? on.geometry[0].rows.length : 0,
					offRows: off.geometry[0] && off.geometry[0].rows ? off.geometry[0].rows.length : 0,
					onLogHas: /スクロールバーのつまみ/.test(onLog)
				};
			});
			assert(r.cleanRows === r.nBands * 2, '前提: 暗い点の無い画は、つまみがあっても全部の段が取れる（つまみだけでは 10px で、しきい値 12px に届かない）', [r.cleanRows, r.nBands]);
			assert(r.rawRows === (r.nBands - 2) * 2 && r.rawHas.join() === 'false,false', '前提（壊れ方）: すきまにつまみ＋暗い点があると、その上下の2段が1本の帯につながって高さの条件で捨てられる（common.js のまま）', [r.rawRows, r.rawHas]);
			assert(r.saved && r.diag.length === 1 && /スクロールバーのつまみ）を白で塗った（10列）/.test(r.diag[0]), 'maskScrollbarThumb は右端の縦に長い暗い列（つまみの 10列）を塗り、開発ログに1行出す', r.diag);
			assert(r.thumbAfter === 255 && r.textAfter === 60 && r.size === '1180x2554', '塗ったつまみは白・文字は塗らない・画の大きさは変えない', [r.thumbAfter, r.textAfter, r.size]);
			assert(r.paintedRows === r.nBands * 2 && r.paintedHas.join() === 'true,true', 'つまみを塗ると、点の上下の2段が別々に取れる', [r.paintedRows, r.paintedHas]);
			assert(r.noThumbSaved === null && r.diag2.length === 0, 'つまみの無い画は塗らない・開発ログにも出さない', [r.noThumbSaved, r.diag2]);
			assert(r.onRows === r.nBands * 2 && r.onLogHas, 'processPersonImages（静止画として渡す）は塗ってから行を探し、全部の段が取れる', [r.onRows, r.onLogHas]);
			assert(r.offRows === (r.nBands - 2) * 2, '壊す確認: processPersonImages で塗る所を切ると2段が落ちる', r.offRows);
		} finally { await sp.page.context().close(); }
	});

	await block('T142examつまみと★ ―― (1b) 行が取れない画（画全体を OCR する道）は、つまみを塗る前の画に戻して読む', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(async () => {
				const T = window.__t142;
				// 固有スキル帯も緑帯も無く、文字の帯が2本だけ → 行の検出は止まる
				const c = T.canvas(), g = c.getContext('2d');
				T.textRow(g, 1600, 22); T.textRow(g, 1660, 22); T.thumb(g, 1500, 2300);
				const f = await T.file(c, 'shot-whole.png');
				const got = [];
				const worker = { recognize: async (cv) => { got.push(cv); return { data: { text: '', lines: [] } }; } };
				devGeometry = [];
				const res = await processPersonImages(worker, [f], '親', true, true, false, null);
				const log = devGeometry.join('\n');
				const last = got[got.length - 1];
				const s = last ? last.width / 1180 : 1;
				return {
					nCalls: got.length, rows: res.geometry[0] ? res.geometry[0].rows : 'none',
					painted: /スクロールバーのつまみ）を白で塗った/.test(log), restored: /つまみを塗る前の画に戻した/.test(log), whole: /行検出に失敗/.test(log),
					thumbGray: last ? T.gray(last, Math.round(1142 * s), Math.round(1900 * s)) : null
				};
			});
			assert(r.whole && r.rows === null && r.nCalls === 2, '前提: 行が取れず画全体を OCR する（前処理2通り）', [r.whole, r.rows, r.nCalls]);
			assert(r.painted && r.restored, 'いったん塗り、行が取れないので戻したことを開発ログに出す', [r.painted, r.restored]);
			assert(r.thumbGray !== null && r.thumbGray < 128, 'OCR に渡す画（元の画の拡大）には、つまみが今までどおり写っている（画全体の読みは今と同じ）', r.thumbGray);
		} finally { await sp.page.context().close(); }
	});

	await block('T142examつまみと★ ―― (2) 人の最後の段の下に次の人の青・赤の段がある画で、★を数え過ぎない（次の文字帯が遠い行は、すきまの中央値まで）', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(() => {
				const T = window.__t142;
				const c = T.canvas(), g = c.getContext('2d');
				T.unique(g, 1300);
				const star = (x, y) => { g.fillStyle = T.GOLD; g.fillRect(x, y, 20, 16); };
				// 自分の一覧: 高さ 24 の帯がすきま 46 で8段。各段の★は左の列の文字の下（段ごとに 2個・最後の段は1個）
				const ys = [];
				for (let k = 0; k < 8; k++) {
					const y = 1500 + k * 70; T.textRow(g, y, 24); ys.push(y);
					const n = k === 7 ? 1 : 2;
					for (let s = 0; s < n; s++) star(300 + s * 26, y + 24 + 12);
				}
				const last = ys[7];
				// 次の人の青・赤の段（文字の帯にならない明るい色）と、その★3つ。最後の段から 90px 下
				g.fillStyle = 'rgb(90,160,240)'; g.fillRect(300, last + 24 + 70, 200, 20);
				g.fillStyle = 'rgb(240,120,150)'; g.fillRect(760, last + 24 + 70, 200, 20);
				for (let s = 0; s < 3; s++) star(300 + s * 26, last + 24 + 100);
				// その下の次の文字帯（「閉じる」のボタンなど）。最後の段から約 300px 下
				T.textRow(g, last + 330, 24);
				const det = detectSkillRows(c, []);
				const pick = (stars) => det.rows.map((row, i) => ({ y: det.bands[row.band].a, col: row.col, s: stars[i].stars, rel: stars[i].reliable })).filter((x) => x.col === 0);
				const mine = pick(computeRowStarCountsExam(c, det));
				const common = pick(computeRowStarCounts(c, det));
				return { last, mine, common, nRows: det.rows.length };
			});
			const at = (list, y) => list.find((x) => x.y === y) || {};
			const lastMine = at(r.mine, r.last), lastCommon = at(r.common, r.last);
			assert(lastCommon.s === 3, '前提（壊れ方）: common.js の computeRowStarCounts は、次の文字帯までの約 300px を数えて次の人の★まで足す（1→3）', lastCommon);
			assert(lastMine.s === 1 && lastMine.rel === true, '最後の段の★は、すきまの中央値までを数えて1つ（reliable は今と同じ true）', lastMine);
			const others = r.mine.filter((x) => x.y !== r.last && x.y < r.last);
			assert(others.length === 7 && others.every((x) => x.s === 2), 'ほかの段（次の文字帯が近い行）は今と同じ範囲で2つ', others);
			const sameAsCommon = r.common.filter((x) => x.y !== r.last).every((x) => at(r.mine, x.y).s === x.s && at(r.mine, x.y).rel === x.rel);
			assert(sameAsCommon, '最後の段のほかは common.js の computeRowStarCounts と同じ数・同じ reliable', [r.mine, r.common]);
		} finally { await sp.page.context().close(); }
	});

	await block('T142examつまみと★ ―― (3) 縁の切れた★（星の縁の1列が 2列のすきまで離れる）を1つと数えない', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(() => {
				const T = window.__t142, W = T.W;
				const mk = (cols) => { const m = new Uint8Array(W * 40); cols.forEach(([a, b]) => { for (let y = 10; y < 26; y++) for (let x = a; x <= b; x++) m[y * W + x] = 1; }); return m; };
				const run = (cols) => { const m = mk(cols); return [countRowStarBlobs(m, W, 0, W, 0, 40), countGoldBlobs(m, W, 0, W, 0, 40)]; };
				return {
					// T138 の動画3 の親・尻尾上がり: [834〜864]・[867]・[873〜905]（画では★2）
					cut: run([[834, 864], [867, 867], [873, 905]]),
					// 1列のすきま（★の中のアンチエイリアスの穴）は今と同じく1つにつなぐ
					hole: run([[300, 315], [317, 330]]),
					// 2列のすきまで離れた★は別々（★2）
					two: run([[300, 330], [333, 363]]),
					// 幅 6px（0.005W）の連なりは★と数える・5px は数えない
					w6: run([[300, 305]]), w5: run([[300, 304]]),
					// 切れ端が★に1列のすきまでつながるときは★の一部（今と同じ）
					joined: run([[300, 330], [332, 332], [340, 370]]),
					// 3つで頭打ち
					four: run([[100, 130], [140, 170], [180, 210], [220, 250]])
				};
			});
			assert(r.cut.join() === '2,3', '星の縁の切れ端（1列）は数えず★2（common.js の countGoldBlobs は3と数える）', r.cut);
			assert(r.hole.join() === '1,1' && r.two.join() === '2,2' && r.joined.join() === '2,2', 'すきま1列は同じ★の続き・2列以上は別の★（今と同じ）', [r.hole, r.two, r.joined]);
			assert(r.w6[0] === 1 && r.w5[0] === 0, '幅 0.005W（6px）以上の連なりだけを★と数える', [r.w6, r.w5]);
			assert(r.four[0] === 3, '★は3つで頭打ち（今と同じ）', r.four);
		} finally { await sp.page.context().close(); }
	});

	await block('T142examつまみと★ ―― 呼び出し元: processPersonImages は塗ってから detectSkillRows・★は computeRowStarCountsExam で数える', async () => {
		const fs = env.fs, path = env.path;
		const sp = fs.readFileSync(path.join(env.REPO_ROOT, 'exam.html'), 'utf8');
		const body = sp.slice(sp.indexOf('async function processPersonImages('), sp.indexOf('async function processImages('));
		assert(/const thumbSaved = maskScrollbarThumb\(base, diag\);\s*detection = detectSkillRows\(base, diag\);\s*if \(!detection\) restoreScrollbarThumb\(base, thumbSaved, diag\);/.test(body), 'detectSkillRows の直前に maskScrollbarThumb・行が取れなければ restoreScrollbarThumb（動画の画・スクショの両方）', null);
		assert(/rowStars = computeRowStarCountsExam\(base, detection\)/.test(body) && !/computeRowStarCounts\(/.test(body), '★は computeRowStarCountsExam で数える（common.js の computeRowStarCounts は呼ばない）', null);
	});
}
