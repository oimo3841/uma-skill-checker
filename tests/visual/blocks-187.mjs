// T213（2026-11-23・おいもさんの決定 903〜905。決定 857 の例外）: 静止画にも、小窓（ウマ娘詳細）の外の左右の暗い端を白で塗ってから行を検出する直しの検査。
// 利用者の連絡（UmaExam）: ホームの青空の上で撮ったスクリーンショット（iPhone 1170×2532）では、小窓の外の背景が左右に 13px ずつ写り
// （灰色にすると DARK_LEVEL 128 より暗い）、detectSkillRows（common.js）の「横に12px以上暗い行」に毎行当たって段のすきまが消え、
// 行の検出が止まって「行検出に失敗。画像全体をOCRへ」になっていた（画像全体の読みの行は rowKey が無く、結合画像の印が付かない・★も読めない）。
// 直し: 動画の画にだけ掛けていた maskVideoFrameMargins（T93・T139。中身と基準は同じ）を、静止画にも行の検出の前（つまみの塗りより前）に掛ける。
// 開発ログの文は、静止画では「動画の画:」を付けない。背景が明るい静止画では1列も当たらず、画は変わらない。
// run-smoke.mjs の末尾から register187() で呼ばれる（塊の見出しはすべて「T213」で始まる。`npm run test:visual -- --only=T213` で回せる）。
//
// 画は作り物（Canvas で描く。利用者の画像は Git に入れない）: 1170×2532 の白地に、2列のスキルパネルの文字の帯を並べ、左右 13px を
// 利用者の画像と同じ色の背景（rgb(50,119,178)）で塗ったもの。OCR は作り物の worker（recognize に渡る画の大きさだけを見る）。
//  壊す確認（2026-11-23）: 直す前の製品（7e8ff2e）で回すと (1) が NG になること（T213-check-1.md）。

export async function register187(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const DRAW = () => {
		window.__t213 = {
			W: 1170, H: 2532,
			/** o.edge＝左右 13px の端の色（[r,g,b]。無ければ白のまま） */
			frame(o) {
				const { W, H } = this;
				const c = document.createElement('canvas'); c.width = W; c.height = H;
				const g = c.getContext('2d');
				g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
				for (let y = 900; y + 24 < 2300; y += 70) { g.fillStyle = 'rgb(60,60,60)'; g.fillRect(300, y, 220, 24); g.fillRect(760, y, 220, 24); }
				if (o.edge) { g.fillStyle = 'rgb(' + o.edge.join(',') + ')'; g.fillRect(0, 0, 13, H); g.fillRect(W - 13, 0, 13, H); }
				return c;
			},
			async file(c, name) { const b = await new Promise((r) => c.toBlob(r, 'image/png')); return new File([b], name, { type: 'image/png' }); }
		};
	};
	// 静止画として processPersonImages に通す（video は null）。開発ログ・行の数・OCR に渡った画の大きさを返す
	const RUN = async () => {
		const T = window.__t213;
		const calls = [];
		const worker = { recognize: async (c) => { calls.push(c.width + 'x' + c.height); return { data: { text: '', lines: [] } }; } };
		// 作り物の画は地が白ばかりで鮮明度の足切りに掛かるので、画質の確かめだけ通す（この塊は行の検出から先を見る）
		window.assessImageQuality = () => ({ ok: true, sharpness: null, warnings: [], reasons: [], rejectKinds: [], warnKinds: [] });
		const one = async (o, name) => {
			devGeometry = []; calls.length = 0;
			const r = await processPersonImages(worker, [await T.file(T.frame(o), name)], '親A', true, true, false, null);
			const log = devGeometry.join('\n');
			return {
				mask: (log.match(/小窓の外の暗い端を白で塗った（左 \d+px・右 \d+px）/g) || []), videoWord: /動画の画/.test(log), fail: /行検出に失敗/.test(log),
				rows: r.geometry.map((g) => g && g.rows ? g.rows.length : 0), whole: calls.filter((s) => /^1800x/.test(s)).length, calls: calls.length
			};
		};
		return { dark: await one({ edge: [50, 119, 178] }, 'IMG_dark.png'), light: await one({ edge: [200, 200, 200] }, 'IMG_light.png'), none: await one({}, 'IMG_none.png') };
	};

	for (const tool of [['exam.html', 'UmaExam'], ['special.html', 'UmaStar']]) {
		await block('T213(1) ' + tool[1] + ' の静止画: 左右 13px の暗い背景（ホームの青空の色）が写った画でも行の検出が止まらない・画像全体を読まない／明るい端の画は塗らず結果も白い端の画と同じ', async () => {
			const sp = await openPage(browser, base, tool[0], { width: 375, height: 812 }, EMPTY);
			sp.page.setDefaultTimeout(60000);
			try {
				await sp.page.evaluate(DRAW);
				const r = await sp.page.evaluate(RUN);
				assert(r.dark.mask.length === 1 && /左 13px・右 13px/.test(r.dark.mask[0]) && !r.dark.videoWord, '暗い端の静止画は左右 13px を白で塗り、開発ログに1行出す（「動画の画」とは書かない）', r.dark);
				assert(!r.dark.fail && r.dark.rows[0] >= 3 && r.dark.whole === 0 && r.dark.calls === 2, '暗い端の静止画で「行検出に失敗。画像全体をOCRへ」にならない（行を切り出して前処理2通りで読む）', r.dark);
				assert(r.light.mask.length === 0 && !r.light.videoWord, '明るい端（灰色 128 以上）の静止画は塗らない・開発ログにも出さない', r.light);
				assert(JSON.stringify([r.light.rows, r.light.fail, r.light.whole, r.light.calls]) === JSON.stringify([r.none.rows, r.none.fail, r.none.whole, r.none.calls]) && r.none.rows[0] === r.dark.rows[0], '明るい端の静止画の行の数・読み方は端の無い画と同じ（塗った暗い端の画とも同じ行の数）', [r.light, r.none]);
			} finally { await sp.page.context().close(); }
		});
	}

	await block('T213(2) 呼び出しの位置: exam.html・special.html とも、maskVideoFrameMargins は動画の画の整えの外（静止画にも）で、つまみの塗りより前に1か所だけ', async () => {
		const fs = env.fs, path = env.path;
		for (const f of ['exam.html', 'special.html']) {
			const s = fs.readFileSync(path.join(env.REPO_ROOT, f), 'utf8');
			const calls = s.match(/maskVideoFrameMargins\(base, diag, vk >= 0\);/g) || [];
			const iMask = s.indexOf('maskVideoFrameMargins(base, diag, vk >= 0);'), iVideo = s.indexOf('if (vk >= 0) {', iMask - 400), iThumb = s.indexOf('const thumbSaved = maskScrollbarThumb(base, diag);');
			assert(calls.length === 1 && (s.match(/maskVideoFrameMargins\(/g) || []).length === 2, f + ': 呼び出しは1か所（定義と合わせて2）', calls.length);
			assert(iMask >= 0 && iVideo > iMask && iThumb > iVideo, f + ': 呼び出しは動画の画の整え（if (vk >= 0)）の前・つまみの塗りより前', [iMask, iVideo, iThumb]);
		}
	});
}
