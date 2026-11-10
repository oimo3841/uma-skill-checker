// DMM版の横画面の直し T166 段2（2026-11-11・決定 679）: 結合画像に1行も使わなかった動画・取り込みの画を、OCR と「列がちょうど2本か」の確かめから外す。
// run-smoke.mjs の末尾から register167() で呼ばれる（塊の見出しは「T166段2」で始まる。`npm run test:visual -- --only=T166段2` で回せる）。
//
// 直したこと（special.html・exam.html。common.js・stitch.js は変えない）:
//  - 動画・取り込みの人の組み立て（UmaVideoFrames.composePerson）のあとで、_sourcePlacements に1行も無い画を persons[].video.unusedFiles に控える（videoUnusedFiles）。
//    一覧の下（継承の履歴）まで撮った画は、末尾の切り方（stitchFindTrailingCutY）で結合画像に入らないのに、OCR が読んで「列 1本」になり、
//    「列がちょうど2本でない画が1枚でもあれば、その人には印を付けない」に当たっていた（T165 §3-3）。
//  - processPersonImages は、その画を OCR しない。画の大きさ（naturalW・naturalH。exam の画面の形の確かめ〔決定6〕に使う）は控え、行（rows）は無いままにする
//    （行の無い画は「列がちょうど2本か」の確かめに当たらない）。開発ログに「結合画像に1行も使わなかった画のため…」の1行。
//  - 結合画像のいちばん下を受け持った画は、使った所より下（一覧の末尾より下。継承の履歴・次の人の行）を白で塗ってから行を探す（videoTailCut・cutVideoTail）。
//    UmaExam の横画面の録画の祖A2 は、行を使った最後の画（frame-003000）の下に継承の履歴が写って「列 1本」になり、画を外すだけでは印が付かなかった。
// 検査は OCR を使わず、読み取りの代わり（recognize を数えるだけの作り物）を渡して、外した画を読まないこと・画の控えの形を見る。

export async function register167(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const hasImages = fs.existsSync(path.join(REPO_ROOT, 'test-images', '2026-09-15_3', '2026-09-15_3_01.png'));

	for (const page of ['special.html', 'exam.html']) {
		await block('T166段2 ―― ' + page + ': 結合画像に1行も使わなかった動画の画は OCR せず、行の無い画として控える（印の確かめに当たらない）。使った画は今までどおり読む', async () => {
			if (!hasImages) { assert(false, '前提: test-images/2026-09-15_3 がある（メインから写す）'); return; }
			const sp = await openPage(browser, base, page, { width: 375, height: 812 }, EMPTY);
			sp.page.setDefaultTimeout(120000);
			try {
				const r = await sp.page.evaluate(async () => {
					// 使わなかった画の控え（_sourcePlacements に無い・高さ 0 の画）
					const mk = (n) => new File([new Uint8Array([n])], 'frame-00' + n + '.png', { type: 'image/png' });
					const fake = [mk(0), mk(1), mk(2), mk(3)];
					const set = videoUnusedFiles(fake, { _sourcePlacements: [{ fileIndex: 0, srcY0: 0, srcY1: 900, outY0: 0 }, { fileIndex: 2, srcY0: 400, srcY1: 900, outY0: 900 }, { fileIndex: 3, srcY0: 500, srcY1: 500, outY0: 1400 }] });
					const unused = fake.filter((f) => set.has(f)).map((f) => f.name);
					const none = videoUnusedFiles(fake, {}).size;
					// 結合画像のいちばん下を受け持った画（fileIndex 2・使った所の下端 900）と、その下を白で塗る
					const tc = videoTailCut(fake, { _sourcePlacements: [{ fileIndex: 0, srcY0: 0, srcY1: 900, outY0: 0 }, { fileIndex: 2, srcY0: 400, srcY1: 900, outY0: 900 }, { fileIndex: 1, srcY0: 100, srcY1: 300, outY0: 300 }] });
					const cv = document.createElement('canvas'); cv.width = 100; cv.height = 500;
					const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, 100, 500);
					const tdiag = [];
					const cut = cutVideoTail(cv, { tailCut: tc }, fake[2], 1000, tdiag);
					const px = (y) => cx.getImageData(50, y, 1, 1).data[0];
					const notCut = cutVideoTail(cv, { tailCut: tc }, fake[0], 1000, []);
					const tail = { file: tc && tc.file.name, y: tc && tc.y, cut, notCut, above: px(448), below: px(452), diag: tdiag.join('') };
					// processPersonImages: 2枚目を「使わなかった画」にして、読み取りの代わりで数える
					const files = [];
					for (const n of ['01', '02', '03']) { const b = await (await fetch('/test-images/2026-09-15_3/2026-09-15_3_' + n + '.png')).blob(); files.push(new File([b], 'frame-0' + n + '.png', { type: 'image/png' })); }
					const read = [];
					const worker = { recognize: async (c) => { read.push(c.width + 'x' + c.height); return { data: { text: '', lines: [] } }; } };
					devGeometry = [];
					const video = { files: [], unusedFiles: new Set([files[1]]) };
					const res = await processPersonImages(worker, files, '親A', true, true, false, video);
					const readOf = async (v) => { read.length = 0; await processPersonImages(worker, files, '親A', true, true, false, v); return read.length; };
					const withSkip = read.length;
					const all = await readOf(null);
					return { tail, unused, none, withSkip, all, geo: res.geometry.map((g) => g && { rows: g.rows ? g.rows.length : null, cols: g.columnXs ? g.columnXs.length : null, nw: g.naturalW, nh: g.naturalH }),
						log: devGeometry.filter((l) => /結合画像に1行も使わなかった画/.test(l)) };
				});
				assert(r.unused.join(',') === 'frame-001.png,frame-003.png' && r.none === 0, '使わなかった画: _sourcePlacements に無い画と高さ 0 の画（控えが無ければ空）', r);
				assert(r.tail.file === 'frame-002.png' && r.tail.y === 900, '結合画像のいちばん下を受け持った画と、使った所の下端', r.tail);
				assert(r.tail.cut && !r.tail.notCut && r.tail.above === 0 && r.tail.below === 255 && /より下を白で塗った/.test(r.tail.diag), 'その画だけ、使った所より下（元の 900/1000 ＝ 450px）を白で塗る・開発ログに1行', r.tail);
				assert(r.all > 0 && r.withSkip > 0 && r.withSkip * 3 === r.all * 2, '外した1枚だけ読まない（3枚のうち2枚ぶんの読み取り）', [r.withSkip, r.all]);
				assert(r.geo[1] && r.geo[1].rows === null && r.geo[1].cols === null && r.geo[1].nw > 0 && r.geo[1].nh > 0, '外した画は大きさだけ控え、行・列は無い', r.geo);
				assert(r.geo[0] && r.geo[0].rows > 0 && r.geo[0].cols === 2 && r.geo[2] && r.geo[2].rows > 0, '使った画は今までどおり行と列を取る', r.geo);
				assert(r.log.length === 1 && /親A frame-002\.png/.test(r.log[0]), '開発ログに外した画の1行（人と画の名前）', r.log);
			} finally { await sp.page.context().close(); }
		});
	}

}
