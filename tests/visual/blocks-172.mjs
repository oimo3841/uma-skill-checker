// T174（2026-11-12・決定 703）: 動画・取り込みの画で、結合画像のいちばん下を受け持った画を白で塗ったあと（T166 段2 の cutVideoTail）に
// 行の検出が失敗し、しかもその画が結合画像に1行ぶんも受け持っていないときは、画像全体の OCR に回さず、OCR と印の確かめから外す。
// 塊の見出しは「T174」で始まる（`npm run test:visual -- --only=T174`）。run-smoke.mjs の末尾から register172() で呼ばれる。
//
// UmaStar の縮小の録画（11/11 の実機の確かめ）の祖A1 の frame-005500.png は、使った所（y=1206。受け持ちは 1188〜1206 の 18px）より下を白で塗ると
// 文字帯が 4本 → ★の誤検出を除いて 2本 になり、行の検出（detectSkillRows・common.js〔凍結〕）が「フィルタ後の文字帯が少なすぎるため中止」で失敗して
// 画像全体の OCR に回っていた。能力の表などの無駄な文字が開発ログに大量に出て、祖A1 の OCR が 13.9秒（ほかの人は 4.6〜8.9秒）にのびた。
// 直したこと（special.html・exam.html。common.js は変えない）:
//  - videoTailCut が、その画が結合画像に受け持った高さ（used・元の画の px）も返す。
//  - processPersonImages は、cutVideoTail が塗った画で行が取れず、used が元の画の幅の 6% 未満（videoTailIsThin。1行の高さは幅の約 8%）なら、
//    開発ログに「白で塗ったあとに行が取れず、結合画像に受け持った所も1行に満たない（Npx）画のため、OCR と印の確かめから外します（動画の画）」を出して次の画へ進む。
//  - 1行以上受け持った画（UmaExam の録画の親A の最後の画は 131px。画像全体の読みが一覧の末尾の「春の目覚め」を拾っていた）・
//    白で塗っていない画（動画のほかの画・スクショ）で行が取れないときは、今までどおり画像全体を読む。
// 検査は OCR を使わず、読み取りの代わり（recognize の呼ばれた回数を数えるだけの作り物）を渡す。

export async function register172(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const hasImages = fs.existsSync(path.join(REPO_ROOT, 'test-images', '2026-09-15_3', '2026-09-15_3_01.png'));

	for (const page of ['special.html', 'exam.html']) {
		await block('T174 ―― ' + page + ': 白で塗ったあとに行が取れず、結合画像に1行も受け持っていない動画の画は画像全体の OCR に回さず外す（ほかは今までどおり）', async () => {
			if (!hasImages) { assert(false, '前提: test-images/2026-09-15_3 がある（メインから写す）'); return; }
			const sp = await openPage(browser, base, page, { width: 375, height: 812 }, EMPTY);
			sp.page.setDefaultTimeout(120000);
			try {
				const r = await sp.page.evaluate(async () => {
					// 受け持った高さ（used）: いちばん下を受け持った画の置き場所の高さの合計
					const mk = (n) => new File([new Uint8Array([n])], 'f' + n + '.png', { type: 'image/png' });
					const fk = [mk(0), mk(1), mk(2)];
					const tc = videoTailCut(fk, { _sourcePlacements: [{ fileIndex: 0, srcY0: 0, srcY1: 900, outY0: 0 }, { fileIndex: 1, srcY0: 400, srcY1: 900, outY0: 900 }, { fileIndex: 2, srcY0: 1188, srcY1: 1206, outY0: 1400 }] });
					const tail = { file: tc && tc.file.name, y: tc && tc.y, used: tc && tc.used,
						thin: [videoTailIsThin({ tailCut: { used: 18 } }, 1170), videoTailIsThin({ tailCut: { used: 70 } }, 1170), videoTailIsThin({ tailCut: { used: 71 } }, 1170), videoTailIsThin({ tailCut: { used: 131 } }, 1170), videoTailIsThin({ tailCut: null }, 1170), videoTailIsThin(null, 1170)] };

					const files = [];
					for (const n of ['01', '02', '03']) { const b = await (await fetch('/test-images/2026-09-15_3/2026-09-15_3_' + n + '.png')).blob(); files.push(new File([b], 'frame-0' + n + '.png', { type: 'image/png' })); }
					const size = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.src = URL.createObjectURL(files[2]); });
					// 行の取れない画（文字が2行だけの白い画。塗っていない画で行の検出が失敗する例。画質の確かめは通る）
					const wc = document.createElement('canvas'); wc.width = 750; wc.height = 1334;
					const wx = wc.getContext('2d'); wx.fillStyle = '#fff'; wx.fillRect(0, 0, wc.width, wc.height);
					wx.fillStyle = '#000'; wx.font = 'bold 40px sans-serif'; wx.fillText('継承の履歴 ABCDEFG 12345', 60, 600); wx.fillText('能力 スピード 1200', 60, 700);
					const text2 = new File([await new Promise((res) => wc.toBlob(res, 'image/png'))], 'frame-text2.png', { type: 'image/png' });
					let read = 0;
					const worker = { recognize: async () => { read++; return { data: { text: '', lines: [] } }; } };
					const run = async (fs2, video) => {
						read = 0;
						devGeometry = [];
						const res = await processPersonImages(worker, fs2, '祖A1', true, true, false, video);
						return { reads: read, rows: res.geometry.map((g) => g && g.rows ? g.rows.length : null), nh: res.geometry.map((g) => g && g.naturalH), log: devGeometry.filter((l) => /^【/.test(l)) };
					};
					const vid = (fs2, tailFile, y, used) => ({ files: fs2.slice(), shifts: fs2.map(() => 0), unusedFiles: new Set(), tailCut: tailFile ? { file: tailFile, y, used } : null });
					const thinUsed = Math.round(size.w * 0.02), thickUsed = Math.round(size.w * 0.1);
					// (1) いちばん下を受け持った画（3枚目・受け持ちは幅の 2%）を上の端から塗る → 行が取れない → 外す
					const cut = await run(files, vid(files, files[2], 2, thinUsed));
					// (2) 同じく行が取れなくても、結合画像に1行以上（幅の 10%）受け持った画は、今までどおり画像全体を読む
					const thick = await run(files, vid(files, files[2], 2, thickUsed));
					// (3) 塗ったあとに行が残れば今までどおり行を読む（下の1割だけ塗る）
					const keep = await run(files, vid(files, files[2], Math.round(size.h * 0.9), thinUsed));
					// (4) 動画の画でも塗っていない画（tailCut は別の画）で行が取れなければ、今までどおり画像全体を読む
					const vf = [files[0], text2, files[2]];
					const plain = await run(vf, vid(vf, files[2], Math.round(size.h * 0.9), thinUsed));
					// (5) スクショ（video なし）で行が取れないときも今までどおり画像全体を読む
					const shot = await run([text2], null);
					return { tail, size, thinUsed, cut, thick, keep, plain, shot };
				});
				const lastLog = (x) => x.log[x.log.length - 1] || '';
				assert(r.tail.file === 'f2.png' && r.tail.y === 1206 && r.tail.used === 18, 'videoTailCut: いちばん下を受け持った画・使った所の下端・受け持った高さ（18px）', r.tail);
				assert(JSON.stringify(r.tail.thin) === JSON.stringify([true, true, false, false, false, false]), '1行に満たない: 幅 1170 で 70px までは満たない・71px（幅の 6%）からは満たす。控えが無ければ外さない', r.tail.thin);
				assert(r.cut.rows[0] > 0 && r.cut.rows[1] > 0 && r.cut.rows[2] === null && r.cut.nh[2] === r.size.h, '前提: 1・2枚目は行が取れ、3枚目は白で塗ったあとに行が取れない（大きさは控える）', r.cut);
				assert(r.cut.reads > 0 && r.cut.reads * 3 === r.keep.reads * 2, '受け持ちが1行に満たない画は画像全体を読まない（3枚のうち2枚ぶんの読み取り）', [r.cut.reads, r.keep.reads]);
				assert(/より下を白で塗った/.test(lastLog(r.cut)) && lastLog(r.cut).includes('→ 白で塗ったあとに行が取れず、結合画像に受け持った所も1行に満たない（' + r.thinUsed + 'px）画のため、OCR と印の確かめから外します（動画の画）') && !/画像全体をOCRへ/.test(lastLog(r.cut)) && /^【祖A1 frame-003\.png】/.test(lastLog(r.cut)),
					'開発ログ: その画の段に「白で塗った」と「外します」の行（「画像全体をOCRへ」は出ない）', lastLog(r.cut));
				assert(r.thick.rows[2] === null && r.thick.reads === r.keep.reads && /画像全体をOCRへ/.test(lastLog(r.thick)) && !/外します/.test(lastLog(r.thick)), '1行以上受け持った画は、行が取れなければ今までどおり画像全体を読む', { reads: r.thick.reads, log: lastLog(r.thick) });
				assert(r.keep.rows[2] > 0 && /より下を白で塗った/.test(lastLog(r.keep)) && /行を切り出し/.test(lastLog(r.keep)), '塗ったあとに行が残る画は今までどおり行を読む', { rows: r.keep.rows, log: lastLog(r.keep) });
				assert(r.plain.rows[1] === null && r.plain.reads === r.keep.reads && r.plain.log.some((l) => /frame-text2\.png/.test(l) && /画像全体をOCRへ/.test(l)), '塗っていない動画の画で行が取れないときは今までどおり画像全体を読む', r.plain);
				assert(r.shot.reads > 0 && /画像全体をOCRへ/.test(r.shot.log.join('')), 'スクショで行が取れないときも今までどおり画像全体を読む', r.shot);
			} finally { await sp.page.context().close(); }
		});
	}
}
