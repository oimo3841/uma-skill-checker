// DMM版の横画面の直し T166 段3（2026-11-11・決定 680）: 人の1枚目の選び方（js/video-frames.js の selectFrames）の検査。
// run-smoke.mjs の末尾から register168() で呼ばれる（塊の見出しは「T166段3」で始まる。`npm run test:visual -- --only=T166段3` で回せる）。
//
// 直したこと（js/video-frames.js だけ。common.js・stitch.js は変えない）:
//  - 「窓（帯の上から 0.25W−8）に入った頭」は、組のいちばん上の頭（パネルの上端）から少し（0.02W）以内のものだけにする。頭のパネルの白い文字を
//    x=0.3W の列が横切ると、青が「パネルの上端」と「文字の下」の2回始まる。速いスクロールで上端が窓に入った画が無く、文字の下の青だけが
//    窓に入った画（パネルの上はタブの下に隠れている）を1枚目に選び、頭が欠けていた（UmaExam の横画面の録画の祖A2。T165 §3-4）。
//  - 文字の下の青しか窓に入っていないときは、間を取り直して上端が窓に入る画を探す（headIntoWindow。上端の頭だけで）。
//    見つからなければ、パネルの上端が見えている画（窓の下でもよい）を1枚目にする（組み立ては anchorY の位置の頭から描く。T105）。
// 作り物の画は blocks-140（T132）のもの（SYNTH140 の jump: 祖2 の頭が窓のすぐ下で止まり、次の画では上端が帯の外。split: 文字の下の青を上端から 36px に〔実物は 37〜44px で headTol 以内〕）。

import { SYNTH140 } from './blocks-140.mjs';

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T166 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

export async function register168(env) {
	const { block, assert, browser, base } = env;
	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(180000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t166.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t166.html');
		await page.addScriptTag({ content: SYNTH140 });
		return { ctx, page, errors };
	};
	const show = (r) => r.error || r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 枚数' + p.n + (p.topBlue ? '' : ' 上端が青でない')).join('／');

	await block('T166段3 ―― 頭のパネルの上端が窓に入った画が無く、文字の下の青だけが窓に入る（速いスクロール）: 祖2 の1枚目は上端が写った画で、頭が欠けない', async () => {
		const { ctx, page, errors } = await openHost();
		try {
			const r = await page.evaluate(() => __synth140.run({ jump: true, split: 36 }));
			assert(r.anchors && r.anchors.length === 3, '区切り（頭）が3つ（' + (r.error || r.anchors.map((a) => a.t + '秒 y' + a.y).join('／')) + '）', r.anchors);
			assert(r.persons.length === 3 && r.persons.every((p) => p.badRows === 0 && Math.abs(p.h - p.expectH) <= 2), '3人とも一覧と画素で合う・高さが正しい（' + show(r) + '）', r.persons);
			assert(r.persons.length === 3 && r.persons[2].topBlue, '祖2 の結合画像の1行目がパネルの上端（頭が欠けない）', r.persons[2]);
			assert(errors.length === 0, 'コンソールのエラー 0', errors);
		} finally { await ctx.close(); }
	});

	// 段4（決定 677）: 窓が小さいときの知らせ。(1) 横画面の切り出しの幅が 570px 未満なら、取り込み・録画の結果の所に video.warn.window を出す
	// （録画は wrapSource の矩形、取り込みは見つけた領域の how が landscape のときだけ。縦画面には出さない）。
	// (2) OCR のあとの画質の知らせで、ぼやけた動画の画は名前を並べず video.warn.blurry の1行にまとめる（スクショの画は今のまま）
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	for (const page of ['special.html', 'exam.html']) {
		await block('T166段4 ―― ' + page + ': 横画面の切り出しが 570px 未満なら結果の所に「ウィンドウが小さい」の知らせ・OCR のあとの知らせは動画の画を1行にまとめる', async () => {
			const sp = await env.openPage(browser, base, page, { width: 375, height: 812 }, EMPTY);
			sp.page.setDefaultTimeout(120000);
			try {
				const r = await sp.page.evaluate(async () => {
					const c = document.createElement('canvas'); c.width = 40; c.height = 40;
					const shown = (rect) => {
						devGeometry = [];
						noteSmallWindow(0, rect);
						showVideoResult(0, c, null);
						const el = document.querySelector('#personset-A-wrap .video-small-window');
						const out = { text: el ? el.textContent : null, log: devGeometry.filter((l) => /切り出しの幅/.test(l)) };
						clearVideoResult(0);
						return out;
					};
					const notice = videoQualityNotice([
						{ label: '親A', name: 'frame-001.png', kinds: ['blurry'], fromVideo: true },
						{ label: '祖A1', name: 'frame-002.png', kinds: ['blurry'], fromVideo: true },
						{ label: '祖A2', name: 'shot.png', kinds: ['blurry'], fromVideo: false },
						{ label: '祖A2', name: 'frame-003.png', kinds: ['too-small'], fromVideo: true }
					], []);
					const onlyVideo = videoQualityNotice([{ label: '親A', name: 'frame-001.png', kinds: ['blurry'], fromVideo: true }], []);
					const base = buildImageQualityNotice([{ label: '親A', name: 'frame-001.png', kinds: ['blurry'] }], []);
					const none = videoQualityNotice([{ label: '祖A2', name: 'shot.png', kinds: ['blurry'] }], []);
					const noneBase = buildImageQualityNotice([{ label: '祖A2', name: 'shot.png', kinds: ['blurry'] }], []);
					return {
						text: videoText('video.warn.window'), blurry: videoText('video.warn.blurry', { N: 2 }),
						small: shown({ x: 0, y: 0, w: 468, h: 827 }), big: shown({ x: 0, y: 0, w: 608, h: 1072 }),
						capSmall: shown({ ok: true, how: 'landscape', w: 500 }), capPortrait: shown({ ok: true, how: 'edge+16:9', w: 500 }), none: shown(null),
						notice, onlyVideo, baseLast: base.split('\n\n').pop(), noneSame: none === noneBase
					};
				});
				assert(r.text === 'ウィンドウが小さいため文字がぼやけて読み取れないことがあります。大きくしてから撮り直してください。', '知らせの文（原文どおり）', r.text);
				assert(r.small.text === r.text && r.small.log.length === 1 && /468px/.test(r.small.log[0]), '録画の切り出し 468px: 結果の所に知らせ・開発ログに幅の行', r.small);
				assert(r.big.text === null && r.big.log.length === 1, '録画の切り出し 608px: 知らせなし（幅の行は出る）', r.big);
				assert(r.capSmall.text === r.text, '取り込みの横画面（how landscape）の 500px: 知らせ', r.capSmall);
				assert(r.capPortrait.text === null && r.capPortrait.log.length === 0 && r.none.text === null, '縦画面の取り込み・横画面でない動画: 知らせも幅の行も無い', [r.capPortrait, r.none]);
				assert(r.notice.includes(r.blurry) && !/frame-001|frame-002/.test(r.notice) && r.notice.includes('・祖A2: shot.png') && r.notice.includes('・祖A2: frame-003.png'),
					'OCR のあとの知らせ: ぼやけた動画の画2枚は「動画の画 2枚が…」の1行・スクショと小さすぎた画は名前のまま', r.notice);
				assert(r.onlyVideo.split('\n\n').pop() === r.baseLast && !/frame-001/.test(r.onlyVideo) && r.onlyVideo.startsWith('動画の画 1枚'), '動画の画だけのとき: 1行のあとに今の締めの文', r.onlyVideo);
				assert(r.noneSame, 'スクショだけのときは今の文のまま', null);
			} finally { await sp.page.context().close(); }
		});
	}
}
