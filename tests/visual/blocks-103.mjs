// 動画の画の OCR の直し（T93・2026-11-03）の検査。
// run-smoke.mjs の末尾から register103() で呼ばれる（塊の見出しはすべて「T93動画の画のOCR」で始まる。`npm run test:visual -- --only=T93動画の画のOCR` で回せる）。
//
// 決め（T93。おいもさんの iPhone の画面収録で、動画から取った画の全部で行の検出が止まっていた）:
//  - 画面収録は画面の全幅なので、小窓の外の背景が左右に約13pxずつ写る。背景が暗い場面だと detectSkillRows（common.js）の
//    「暗い画素が横に12px以上の行＝文字帯」に一覧のどの行も当たり、行のすきまが消える。動画から取った画だけ、端から続く
//    「全体の半分以上の行で暗い」列を白で塗ってから検出する（maskVideoFrameMargins。大きさと座標は変えない）。
//  - 自分の固有スキル帯が流れ去ったあとの画で「次の人の固有スキル帯」がいちばん上に写るときは、そこから下を白で塗る
//    （cutNextPersonInVideoFrame。自分の帯の位置は1枚目の帯の位置から選ぶ側のずれ video.shifts を引いて見込む）。
//    塗った画で行が取れないとき（次の人の1枚目など）は、画像全体を読まず OCR しない（次の人のスキルが混ざらない）。
//  - 静止画（persons[].video に無い画）はこれまでどおり（どちらの処理も通らない）。common.js は変えない。
// 画は作り物（Canvas で描く）。OCR は作り物の worker（recognize の呼ばれ方だけを見る）。

export async function register103(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const open = async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		sp.page.setDefaultTimeout(60000);
		// 作り物の画を描く部品（W 1180 × H 2554。動画の画と同じ大きさ）
		await sp.page.evaluate(() => {
			window.__t93 = {
				W: 1180, H: 2554,
				/** o.edge＝端の色（[r,g,b]・幅 13px）・o.edgeRatio＝端を塗る行の割合（上から）・o.bands＝固有スキル帯の青帯の上端の y の列・o.rows＝文字の行を描く範囲 [y0, y1] */
				frame(o) {
					const { W, H } = this;
					const c = document.createElement('canvas'); c.width = W; c.height = H;
					const g = c.getContext('2d');
					g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
					if (o.rows) for (let y = o.rows[0]; y + 24 < o.rows[1]; y += 70) { g.fillStyle = 'rgb(60,60,60)'; g.fillRect(300, y, 220, 24); g.fillRect(760, y, 220, 24); }
					if (o.edge) { const h = Math.round(H * (o.edgeRatio == null ? 1 : o.edgeRatio)); g.fillStyle = 'rgb(' + o.edge.join(',') + ')'; g.fillRect(0, 0, 13, h); g.fillRect(W - 13, 0, 13, h); }
					for (const y of (o.bands || [])) { g.fillStyle = 'rgb(60,140,230)'; g.fillRect(200, y, 360, 60); g.fillStyle = 'rgb(110,200,60)'; g.fillRect(200, y + 80, 360, 60); }
					return c;
				},
				px(c, x, y) { return Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)); },
				async file(c, name) { const b = await new Promise((r) => c.toBlob(r, 'image/png')); return new File([b], name, { type: 'image/png' }); }
			};
		});
		return sp;
	};

	await block('T93動画の画のOCR ―― 小窓の外の暗い端を白で塗る（明るい端・半分未満の暗い端・文字は塗らない）', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(() => {
				const T = window.__t93;
				const run = (o) => { const c = T.frame(o); const diag = []; maskVideoFrameMargins(c, diag); return { c, diag }; };
				const dark = run({ edge: [70, 120, 170], rows: [1300, 2000] });
				const light = run({ edge: [170, 170, 170], rows: [1300, 2000] });
				const part = run({ edge: [70, 120, 170], edgeRatio: 0.4, rows: [1300, 2000] });
				// 塗る前と後で行の検出（common.js のまま）
				const before = detectSkillRows(T.frame({ edge: [70, 120, 170], rows: [1300, 2000] }), []);
				const after = detectSkillRows(dark.c, []);
				return {
					darkDiag: dark.diag, darkL: T.px(dark.c, 5, 1500), darkR: T.px(dark.c, 1175, 1500), darkEdgeIn: T.px(dark.c, 13, 1500), text: T.px(dark.c, 310, 1310),
					size: dark.c.width + 'x' + dark.c.height,
					lightDiag: light.diag, lightL: T.px(light.c, 5, 1500),
					partDiag: part.diag, partL: T.px(part.c, 5, 100),
					before: !!before, after: after ? after.rows.length : 0
				};
			});
			assert(r.darkDiag.length === 1 && /左 13px・右 13px/.test(r.darkDiag[0]), '暗い端（灰色 128 未満）は左右 13px ずつ塗り、開発ログに1行出す', r.darkDiag);
			assert(r.darkL.join() === '255,255,255' && r.darkR.join() === '255,255,255', '塗った端は白', [r.darkL, r.darkR]);
			assert(r.darkEdgeIn.join() === '255,255,255' && r.text.join() === '60,60,60', '端の内側（小窓の中）と文字は塗らない', [r.darkEdgeIn, r.text]);
			assert(r.size === '1180x2554', '画の大きさは変えない（行の座標がそのまま結合画像の枠に使える）', r.size);
			assert(r.lightDiag.length === 0 && r.lightL.join() === '170,170,170', '明るい端（灰色 128 以上）は塗らない・開発ログにも出さない', [r.lightDiag, r.lightL]);
			assert(r.partDiag.length === 0 && r.partL.join() === '70,120,170', '暗い行が全体の半分未満の端は塗らない', [r.partDiag, r.partL]);
			assert(!r.before && r.after >= 3, '暗い端があると行の検出が止まり、塗ると行が取れる（common.js の detectSkillRows はそのまま）', [r.before, r.after]);
		} finally { await sp.page.context().close(); }
	});

	await block('T93動画の画のOCR ―― 次の人の固有スキル帯から下を塗る（自分の帯が見込みの位置にあれば塗らない）', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(() => {
				const T = window.__t93;
				const video = { shifts: [700, 700] };
				const st = { naturalH: T.H };
				const out = {};
				const diag0 = [];
				out.tops = uniqueSkillBandTops(T.frame({ bands: [1400, 2100] }));
				out.k0 = cutNextPersonInVideoFrame(T.frame({ bands: [1400] }), video, 0, st, diag0);
				out.own = st.ownTop;
				// 2枚目: 自分の帯の見込み 1400−700＝700。次の人の帯だけが 2000 に写る → 1990 から下を塗る
				const c1 = T.frame({ bands: [2000], rows: [1250, 1900] }); const d1 = [];
				out.cut = cutNextPersonInVideoFrame(c1, video, 1, st, d1);
				out.cutDiag = d1; out.above = T.px(c1, 210, 1980); out.below = T.px(c1, 210, 2010); out.textAbove = T.px(c1, 310, 1250);
				// 2枚目: 自分の帯（700）と次の人の帯（1900）が両方写る → 塗らない（common.js が2本目の帯の手前で打ち切る）
				const c2 = T.frame({ bands: [700, 1900] }); const d2 = [];
				out.both = cutNextPersonInVideoFrame(c2, video, 1, st, d2);
				out.bothBelow = T.px(c2, 210, 1910);
				// 3枚目: 見込み 0。帯が写らない → 塗らない
				out.none = cutNextPersonInVideoFrame(T.frame({ rows: [1250, 2000] }), video, 2, st, []);
				// 1枚目で帯が見つからなかった人は見込みを持たない → 塗らない
				const st2 = { naturalH: T.H };
				cutNextPersonInVideoFrame(T.frame({}), video, 0, st2, []);
				out.noOwn = cutNextPersonInVideoFrame(T.frame({ bands: [2000] }), video, 1, st2, []);
				return out;
			});
			assert(r.tops.join() === '1400,2100', '固有スキル帯（青帯のすぐ下の全幅でない緑帯）の青帯の上端を上から返す', r.tops);
			assert(r.k0 === false && r.own === 1400, '1枚目は塗らず、自分の帯の位置を控える', [r.k0, r.own]);
			assert(r.cut === true && r.cutDiag.length === 1 && /y=2000・自分の帯の見込み y=700/.test(r.cutDiag[0]), '自分の帯が流れ去った画で、いちばん上の帯が次の人の帯なら塗り、開発ログに位置を出す', r.cutDiag);
			assert(r.below.join() === '255,255,255' && r.above.join() === '255,255,255' && r.textAbove.join() === '60,60,60', '次の人の帯の少し上（青帯の上端−0.4%）から下を白に・その上の行は残す', [r.above, r.below, r.textAbove]);
			assert(r.both === false && r.bothBelow.join() === '60,140,230', '自分の帯が見込みの位置にあれば塗らない', [r.both, r.bothBelow]);
			assert(r.none === false && r.noOwn === false, '帯が写らない画・1枚目に帯が無かった人は塗らない', [r.none, r.noOwn]);
		} finally { await sp.page.context().close(); }
	});

	await block('T93動画の画のOCR ―― processPersonImages: 動画の画だけ整える・塗って行が取れない画は OCR しない・静止画は今のまま', async () => {
		const sp = await open();
		try {
			const r = await sp.page.evaluate(async () => {
				const T = window.__t93;
				const calls = [];
				const worker = { recognize: async (c) => { calls.push(c.width + 'x' + c.height); return { data: { text: '', lines: [] } }; } };
				const f0 = await T.file(T.frame({ edge: [70, 120, 170], bands: [1400], rows: [1550, 2300] }), 'frame-000000.png');
				const f1 = await T.file(T.frame({ edge: [70, 120, 170], bands: [2350], rows: [1250, 2300] }), 'frame-001000.png');
				// 次の人の1枚目（自分の行がほとんど写らない）
				const f2 = await T.file(T.frame({ edge: [70, 120, 170], bands: [1300], rows: [1450, 2300] }), 'frame-002000.png');
				const video = { files: [f0, f1, f2], shifts: [700, 1100], uncertain: [false, false], still: [true, true, true], expanded: false };
				const pick = (lines, re) => lines.filter((l) => re.test(l));
				// 作り物の画は地が白ばかりで鮮明度の足切りに掛かるので、画質の確かめだけ通す（この塊は行の検出から先を見る）
				window.assessImageQuality = () => ({ ok: true, sharpness: null, warnings: [], reasons: [], rejectKinds: [], warnKinds: [] });
				devGeometry = [];
				const rv = await processPersonImages(worker, [f0, f1, f2], '親A', true, true, false, video);
				const vlog = devGeometry.slice(); const vcalls = calls.splice(0);
				devGeometry = [];
				const rs = await processPersonImages(worker, [f0, f1, f2], '親A', true, true, false, null);
				const slog = devGeometry.slice(); const scalls = calls.splice(0);
				return {
					vMask: pick(vlog, /小窓の外の暗い端/).length, vCut: pick(vlog, /次の人の固有スキル帯/).length, vSkip: pick(vlog, /この画は OCR しない/).length,
					vFail: pick(vlog, /行検出に失敗/).length, vRows: rv.geometry.map((g) => g && g.rows ? g.rows.length : 0), vCalls: vcalls.length,
					sMask: pick(slog, /動画の画/).length, sFail: pick(slog, /行検出に失敗/).length, sCalls: scalls.length, sWhole: scalls.filter((s) => /^1800x|x1800$/.test(s)).length,
					vlog
				};
			});
			assert(r.vMask === 3, '動画の画は3枚とも端を塗る', r.vMask);
			assert(r.vCut === 2 && r.vSkip === 1, '次の人の帯がいちばん上に写る2枚を塗り、行が取れない1枚（次の人の1枚目）は OCR しない', [r.vCut, r.vSkip, r.vlog]);
			assert(r.vFail === 0 && r.vRows[0] >= 3 && r.vRows[1] >= 3 && r.vRows[2] === 0, '動画の画は「行検出に失敗。画像全体をOCRへ」にならない（読む2枚は行が取れる）', [r.vFail, r.vRows]);
			assert(r.vCalls === 4, 'OCR は読む2枚 × 前処理2通り（次の人の1枚目は読まない）', r.vCalls);
			assert(r.sMask === 0 && r.sFail === 3 && r.sCalls === 6 && r.sWhole === 6, '静止画として渡すと今のまま（整えない・端が暗い画は行の検出が止まり画像全体を読む）', [r.sMask, r.sFail, r.sCalls, r.sWhole]);
		} finally { await sp.page.context().close(); }
	});

	await block('T93動画の画のOCR ―― 呼び出し元: processImages が人ごとの persons[].video を渡す', async () => {
		const fs = env.fs, path = env.path;
		const sp = fs.readFileSync(path.join(env.REPO_ROOT, 'special.html'), 'utf8');
		assert(/processPersonImages\(worker, files, PERSON_LABELS\[p\], usePre, multi, wantPreview, persons\[p\]\.video \|\| null\)/.test(sp), 'processImages は persons[p].video（無ければ null）を渡す', null);
		assert((sp.match(/processPersonImages\(/g) || []).length === 2, 'processPersonImages の呼び出しは processImages の1か所だけ（定義と合わせて2）', null);
	});
}
