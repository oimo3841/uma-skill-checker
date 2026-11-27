// js/video-frames.js（動画V1-1）を、素材フォルダの本物の画面収録（T132 で7本）で回す手元だけの検査（T42・2026-10-31）。
// tests/skillset と同じ扱い: 素材は Git の管理外。素材フォルダが無い・動画が無いときは「飛ばした」と出して 0 で終わる。
//
//   npm run test:video-local                 … 5本 × ふつう
//   npm run test:video-local -- --cpu=4      … CPU を4倍遅くする（スマホ相当の目安。CDP の Emulation.setCPUThrottlingRate）
//   npm run test:video-local -- --only=1     … 動画1 だけ（1〜7）
//   npm run test:video-local -- --compare    … 同じフレームで stitchOnePerson も呼び、高さと継ぎ目の確かさを並べる（時間に入れない）
//   npm run test:video-local -- --save       … 人ごとの結合画像を output/scratch/t42-video/ に保存（T195: --special・--exam・--skill と組み合わせると、
//                                               ページに出た結合画像〔取り込みの画像・②の画像・OCR のあと・本育成結果の3つの形〕も PNG のまま保存。直す前と後のバイトの比べ用）
//   npm run test:video-local -- --special    … special.html の③の流れを通す（T59・動画V1-2）: 入口 → 小窓の「動画を選ぶ」→ ファイルの選択に動画を渡す →
//                                               「動画から N枚」が入るまで → 「画像を結合する（OCRしない）」で結合画像ができるまで。人ごとの枚数と高さを見る
//   npm run test:video-local -- --capture    … 横画面の録画（動画9〜11。T145）のフレームを「ウィンドウから取り込む」の画の代わりに流し、矩形と人ごとの高さを動画の流れと比べる
//   npm run test:video-local -- --exam       … exam.html の②の流れを通す（T139）: 動画モード →「動画を選ぶ」→ ②の結合画像（OCR の前）→「OCR処理を開始する」で
//                                               OCR と結合。人ごとの枚数・高さ（OCR の前とあとの両方）・検出が0でないことを見る（runExam）
//   npm run test:video-local -- --skill      … 本育成結果の動画（T193）: special.html・exam.html の「本育成結果」のタブ →「動画」→「動画を選ぶ」に、本育成のスキル画面の
//                                               録画（スマホの縦・DMM版の横）を渡し、結合画像（2列・数あり／2列・数なし／1列・数あり）の大きさ・スキルの数・両ページで同じ PNG を見る。
//                                               DMM版の録画は「ウィンドウから取り込む」の画にも変えて（--capture と同じ作り）、取り込みの流れでも見る（runSkill）。
//                                               録画は Git の管理外の test-images/skill-video/（無ければ飛ばす）
//   npm run test:video-local -- --list-capture … 因子一覧の6人分のウィンドウの取り込みだけ（T221）
//   npm run test:video-local -- --list       … 因子一覧の動画（T220・段1）: js/factor-list.js のスイッチ FACTOR_LIST_ENABLED を true に差し替えて、special.html ③・exam.html ②に渡す。
//                                               1人分（スマホ・DMM版の横）は親の欄だけに入る・文・結合画像の高さ・組み立てた画の灰色の札の数と★、OCR の流れで因子一覧の行を使う。
//                                               6人分（スマホ・DMM版の縦と横）は段1では取り込まない（見分けは list6）。スイッチを差し替えないと1人分も今の失敗の文のまま
//
// 期待値（T39 の実測）: 区画の頭の時刻・人ごとの高さ・選ぶ枚数。**時間は揺れるので期待値にしない**（表に出すだけ）。
// iPhone の収録は HEVC なので、同梱の Chromium では復号できない。channel:'chrome' で回す（tests/skillset/extract-video-frames.mjs と同じ）。
// ほかの test:visual が動いている間は時間を測らない（負荷で揺れる）。このスクリプトは止めない・待たない。回す前に自分で確かめる。

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { REPO_ROOT, assetsRoot } from '../skillset/lib/assets.mjs';
import { startServer } from '../skillset/lib/serve.mjs';
import { pickVideo } from '../visual/lib/video-entry.mjs';

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const cpu = Number(arg('cpu', '1'));
const only = arg('only', '');
const compare = process.argv.includes('--compare');
const save = process.argv.includes('--save');
const special = process.argv.includes('--special');

const VIDEOS = [
	// counts … 人ごとの枚数（次の人の1枚目も入る）。T85（2026-11-03）で止まっている1枚を選ぶようにして変わった。
	// T95（2026-11-04・T93-3 の回答）: T90（2026-11-03・復号の出どころを WebCodecs にし、止まっている画から写す）のあとの実際の値に直した
	// （前の期待値 4／7／3・12／16／8 は T85 の時点のもの。T93 の報告の §4-5 で main でも落ちていた2件）。
	// 前（T42 の実測）: 動画1 頭 0／8.75／14.5秒・高さ 1999／1709／1648・18枚・7／10／3、動画2 頭 0／10.5／20秒・高さ 2579／2480／2352・54枚・19／23／14。
	// 結合画像の中身は前と同じ（行ごとに比べて重複・欠けなし。高さの差 1〜2px は継ぎ目の画が変わったため）
	// T96（2026-11-04・T95-1 の回答 147）: --special 無しの「人ごとの高さ」と「選ぶ枚数」も今の値に直した
	// （前 1998／1707／1648・12枚、2578／2480／2352・34枚。T90 で止まっている画から写すようになってからの値。--special の高さの ±2 の期待値もこの値を中心に見る）
	{ no: 1, name: 'ScreenRecording_10-25-2026 17-06-21_1.MP4', anchors: [0, 7.5, 14], heights: [1999, 1708, 1648], picks: 9, counts: [4, 4, 3] },
	{ no: 2, name: 'ScreenRecording_10-25-2026 17-11-41_1_Exam.MP4', anchors: [0, 10, 20.25], heights: [2578, 2481, 2351], picks: 22, counts: [11, 8, 5] },
	// T135（2026-11-08・決定 494 の案A＋B2）: 動画2 の選ぶ枚数 25→22・人ごと 13／9／5→11／8／5。高さは同じで、結合画像の行も同じ（指のエフェクトの残り方だけが違う。T124-check-1 の画像 3）
	// T109（2026-11-06）: おいもさんの iPhone の3本（同じ親）。3本目は「連綿」を含む領域が2回写っていた・2本目は祖2 の結合の失敗・1本目は育成完了後の画面（紙吹雪）で取り込めなかった。
	// 同じ親なので高さはほぼ同じ（正解は PC の取り込みの結合画像を幅をそろえた 2002／1906／1651）。動画1・2 の枚数も T109 で変わった（軌跡が正しくなり、誤って足していた動いている画が減った。結合画像の行は同じ。報告 T109-check-1.md）
	{ no: 3, name: 'ScreenRecording_11-06-2026 16-57-05_1.MP4', anchors: [0, 7, 12.25], heights: [1998, 1902, 1648], picks: 11, counts: [6, 4, 3] },
	{ no: 4, name: 'ScreenRecording_11-06-2026 16-58-38_1.MP4', anchors: [0, 5.625, 10.25], heights: [1997, 1901, 1647], picks: 10, counts: [4, 5, 3] },
	{ no: 5, name: 'ScreenRecording_11-06-2026 16-59-47_1.MP4', anchors: [0, 5.5, 11], heights: [1998, 1901, 1649], picks: 10, counts: [5, 4, 3] },
	// T132（2026-11-08・決定 485・486）: スクロールを始めてから5秒未満で終わる速い動画2本（T129 で調べた A-1・A-2）。親（本人）は別の人で、
	// 祖1・祖2 は動画3〜5 と同じ。期待値は「3人に分かれる」と、祖1・祖2 の高さ（動画3〜5 の 1901〜1902・1647〜1649 を目安に ±2）だけ。
	// 親の高さ・区切りの時刻・選ぶ枚数は期待値にしない（null は見ない）。A-1 は直す前は区切りが4つ（祖2 のパネルの頭が文字で2つに割れた）、
	// A-2 は末尾が一番下で行き過ぎた画で祖2 が 1694（T129-check-1.md）
	{ no: 6, name: 'fast-scroll-A-1.MP4', anchors: null, heights: [null, 1901, 1648], tol: 2, picks: null, counts: null },
	{ no: 7, name: 'fast-scroll-A-2.MP4', anchors: null, heights: [null, 1901, 1648], tol: 2, picks: null, counts: null },
	// T134（2026-11-08）: 育成を終えてすぐの画面（窓の外に紙吹雪）から撮った7.5秒の動画。撮り始めの約1.2秒は一覧が止まっていて、
	// 直す前は本文の帯の下端が窓の下の紙吹雪（2520）まで伸び、「継承の画面が見つからない」（band）で止まっていた。親は別の人で、祖1・祖2 は動画3〜5 と同じ。
	// 期待値は「3人に分かれる」と人ごとの高さ（確かめた値 1805／1902／1649 を目安に ±2）。区切りの時刻・選ぶ枚数は期待値にしない
	{ no: 8, name: 'ScreenRecording_11-08-2026 13-19-49_1.MP4', anchors: null, heights: [1805, 1902, 1649], tol: 2, picks: null, counts: null },
	// T145（2026-11-09・決定 576〜582）: DMM版の横画面を Windows の Snipping Tool で録画した3本（同じ3人）。9 は全画面（2880×1920・上下に黒い帯）、
	// 10 はウィンドウ（2780×1564）、11 は小さいウィンドウ（1998×1124。切り出すと幅 632px なので 880px に拡大）。
	// landscape: js/landscape-panel.js の wrapSource でパネルを切り出した出どころにする（製品の流れ〔--special・--exam〕は onVideoChosen が同じことをする）。
	// 切り出しはどれも幅 1170px にそろうので、人ごとの高さは3本でほぼ同じ（確かめた値 ±2。--special・--exam・--capture）。
	// 3本とも 4〜6秒で3人をスクロールする速い録画で、速い動画の調べ直し（1/16秒おき）が要る。それは出どころが WebCodecs のときだけなので、
	// この既定の流れ（video 要素の出どころ）では 9 の祖2・11 の区切りが取れない（9 は祖2 が 463、11 は2人）。製品は PC の Chrome・Edge で WebCodecs の流れ。
	// そこで既定の流れでは横画面の3本を回さない（elementSkip）
	// T156（2026-11-10・決定 637・638）: 横画面の切り出しの描き方をそろえ（小さく描く画も出す大きさの画から）、録画もカーソルを消す流れ（エフェクトの置き換えを切る）にしたので、
	// 人ごとの枚数が 5／5／3・6／5／3・5／5／3 から下の値に変わった（高さは同じ ±2。確かでない継ぎ目は3本とも 0 に）
	{ no: 9, name: 'dmm-landscape-195520-full.mp4', landscape: true, elementSkip: true, anchors: null, heights: [1692, 1883, 1633], tol: 2, picks: null, counts: [5, 6, 3] },
	{ no: 10, name: 'dmm-landscape-200318-window.mp4', landscape: true, elementSkip: true, anchors: null, heights: [1696, 1886, 1636], tol: 2, picks: null, counts: [4, 5, 3] },
	{ no: 11, name: 'dmm-landscape-200434-window-small.mp4', landscape: true, elementSkip: true, anchors: null, heights: [1699, 1889, 1639], tol: 2, picks: null, counts: [4, 5, 3] }
];
/** 高さの期待値に合うか（null は見ない。tol は許す差） */
const heightOk = (v, j, h, tol) => v.heights[j] == null || (h != null && Math.abs(h - v.heights[j]) <= tol);
const LABELS = ['親', '祖1', '祖2'];

// T193: 本育成のスキル画面の録画（--skill）。オグリキャップ・69スキル（固有1・進化1・金7・白60。静止画7枚 IMG_4520〜4526 と同じ育成結果）。
// size … 結合画像の大きさ（2列・数あり／2列・数なし／1列・数あり。T193 の実測。±2）。dropped … 先頭の引っぱりすぎのコマを外した数
const SKILL_DIR = path.join(REPO_ROOT, 'test-images', 'skill-video');
const SKILL_VIDEOS = [
	{ key: 'スマホの縦の録画', name: 'ScreenRecording_11-17-2026 23-45-24_1.MP4', kind: 'portrait', dropped: 1, size: { c2count: [2322, 2686], c2: [2322, 2686], c1count: [1153, 5193] } },
	{ key: 'DMM版の録画', name: 'レコーディング 2026-11-17 235213.mp4', kind: 'landscape', dropped: 0, size: { c2count: [2300, 2615], c2: [2300, 2615], c1count: [1142, 5140] }, capture: true }
];
const SKILL_COUNTS = { all: 69, unique: 1, evo: 1, gold: 7, white: 60 };
const skillMode = process.argv.includes('--skill');

// T220: 因子一覧の1人分（--list）。frames … 親の枚数・size … 結合画像（③／②。親だけ）の高さ（±2）・stars … 組み立てた画の灰色の札の★の並び（左上から右へ。
// 札の数はこの長さ）。off … スイッチ false（製品のまま）のときの失敗の文の頭
const LIST_ONE = [
	{ key: 'スマホの1人分', name: 'factor-list-iphone-1.MP4', frames: 2, height: 2439, stars: '33231323222332323223323212133213222223', off: '動画の中に継承の画面（因子の一覧）が見つかりませんでした。' },
	{ key: 'DMM版の横の1人分', name: 'factor-list-dmm-landscape-1.mp4', frames: 2, height: 2324, stars: '1222331212222223232133132222223221223', off: '動画を読み込めませんでした。' }
];
// T221: 6人分（--list）。cards … 親A・祖A1・祖A2・親B・祖B1・祖B2 の札の数。DMM版の横と縦は同じ持ち主の同じ6人（別々に撮った動画）なので、
// 6人の★の並びも一致する（same）。landscape … ウィンドウの取り込みの切り出し（pc-capture の detectOne）も確かめる
const LIST_SIX = [
	{ name: 'factor-list-iphone-6.MP4', cards: [35, 37, 41, 37, 40, 41] },
	{ name: 'factor-list-dmm-portrait-6.mp4', cards: [40, 37, 41, 37, 40, 37], same: 'dmm' },
	{ name: 'factor-list-dmm-landscape-6.mp4', cards: [40, 37, 41, 37, 40, 37], same: 'dmm', landscape: true }
];
const sameStars = new Map();
const listMode = process.argv.includes('--list') || process.argv.includes('--list-capture');
const listCaptureOnly = process.argv.includes('--list-capture');   // 6人分のウィンドウの取り込みだけ（T221）

let root = null;
try { root = assetsRoot(); } catch (e) { if (!skillMode) { console.log('[飛ばした] 素材フォルダが設定されていない: ' + String(e.message).split('\n')[0]); process.exit(0); } }
const targets = (skillMode || listMode) ? [] : VIDEOS.filter((v) => !only || String(v.no) === only).filter((v) => {
	if (fs.existsSync(path.join(root, v.name))) return true;
	console.log('[飛ばした] 動画' + v.no + ' が素材フォルダに無い');
	return false;
});
const skillTargets = skillMode ? SKILL_VIDEOS.filter((v) => { if (fs.existsSync(path.join(SKILL_DIR, v.name))) return true; console.log('[飛ばした] ' + v.key + ' が test-images/skill-video に無い'); return false; }) : [];
const listTargets = listMode ? LIST_ONE.concat(LIST_SIX).map((v) => v.name).filter((n) => { if (fs.existsSync(path.join(root, n))) return true; console.log('[飛ばした] ' + n + ' が素材フォルダに無い'); return false; }) : [];
if (!targets.length && !skillTargets.length && !listTargets.length) { console.log('回す動画がありません'); process.exit(0); }

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames local</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script><script src="/js/pc-capture.js"></script><script src="/js/landscape-panel.js"></script></head><body></body></html>';

const outDir = path.join(REPO_ROOT, 'output', 'scratch', 't42-video');
fs.mkdirSync(outDir, { recursive: true });
const { base, close } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' });
let ng = 0;
const check = (cond, label, detail) => { console.log((cond ? '  OK  ' : '  NG  ') + label + (cond || detail == null ? '' : '  … ' + detail)); if (!cond) ng++; };
const rows = [];
// T195: --save で、ページの流れ（--special・--exam・--skill）の結合画像も PNG のまま保存する（直す前と後のバイトの比べ用）。
// selector に当たる img の src（object URL・data URL）を読み、上から順に <prefix>-<番号>.png にする。戻り値は保存した数
async function saveImgs(page, selector, prefix) {
	if (!save) return 0;
	const list = await page.evaluate(async (sel) => {
		const out = [];
		for (const im of document.querySelectorAll(sel)) {
			const buf = new Uint8Array(await (await fetch(im.src)).arrayBuffer());
			let s = '';
			for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
			out.push(btoa(s));
		}
		return out;
	}, selector);
	list.forEach((b, k) => fs.writeFileSync(path.join(outDir, prefix + '-' + k + '.png'), Buffer.from(b, 'base64')));
	return list.length;
}

/** special.html の③の流れを通す（T59）。時間は「ファイルを渡してから知らせが出るまで」と「結合のボタンから結合画像ができるまで」 */
async function runSpecial(v) {
	console.log('\n=== 動画' + v.no + '（special.html の流れ・CPU ' + cpu + '倍）===');
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	page.setDefaultTimeout(600000);
	page.on('pageerror', (e) => console.log('[page error]', String(e)));
	await page.addInitScript(() => localStorage.setItem('umaSkillDeck:stepTab', '2'));
	await page.goto(base + '/special.html');
	await page.waitForTimeout(1500);
	for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
	await page.evaluate(() => selectStepTab(2));
	const cdp = await ctx.newCDPSession(page);
	if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
	const chooser = await pickVideo(page);
	const t0 = Date.now();
	await chooser.setFiles(path.join(root, v.name));
	await page.waitForSelector('#personset-A-wrap .video-result, #video-error', { timeout: 600000 });
	const importS = (Date.now() - t0) / 1000;
	const imp = await page.evaluate(() => ({ n: persons.slice(0, 3).map((p) => p.files.length), err: (document.getElementById('video-error') || {}).textContent || null,
		sum: persons.slice(0, 3).map((p) => p.files.length).join('／'), unc: persons.slice(0, 3).map((p) => p.video ? p.video.uncertain.filter(Boolean).length : -1),
		cursor: devGeometry.find((l) => l.startsWith('[動画] カーソル')) || null }));
	if (v.counts) check(!imp.err && imp.n.join('/') === v.counts.join('/'), '人ごとの枚数 ' + v.counts.join('／') + '（知らせ: ' + (imp.sum || '').slice(0, 40) + '…）', imp.err || imp.n.join('／'));
	else check(!imp.err && imp.n.length === 3 && imp.n.every((x) => x > 0), '3人に分かれる（知らせ: ' + (imp.sum || '').slice(0, 40) + '…）', imp.err || imp.n.join('／'));
	const t1 = Date.now();
	const st = await page.evaluate(async () => {
		devGeometry = [];
		await runImageStitching({ keepClosed: true, quiet: true });
		// 組み立ての行だけ（T166 から「[動画] 親A: 結合画像に1行も使わなかった画…」の行も出る。--exam と同じ拾い方）
		return { lines: devGeometry.filter((l) => /^\[動画\].*composePerson/.test(l)), img: !!document.querySelector('#stitch-result-content img'),
			warn: (document.querySelector('#stitch-result-content .video-warn') || {}).textContent || null };
	});
	const stitchS = (Date.now() - t1) / 1000;
	if (save) console.log('  保存: 取り込みの画像 ' + await saveImgs(page, '#personset-A-wrap .video-result img', 'special-v' + v.no + '-import') + '枚・結合画像 ' + await saveImgs(page, '#stitch-result-content img', 'special-v' + v.no + '-stitch') + '枚');
	const hs = st.lines.map((l) => { const m = /高さ (\d+)px/.exec(l); return m ? +m[1] : null; });
	// 高さは ±2px（T90: special.html の流れは止まっている画の画素を優先して組み立てるので、末尾の切る行が 1px 動くことがある。動画1 は 1999／1708／1648）
	check(st.img && st.lines.length === 3 && hs.length === 3 && hs.every((h, i) => h != null && heightOk(v, i, h, 2)), '結合: 3人とも composePerson・人ごとの高さ ' + v.heights.map((h) => (h == null ? '—' : h)).join('／') + '（±2）', hs.join('／'));
	console.log('  人ごとの枚数 ' + imp.n.join('／') + '・高さ ' + hs.join('／'));
	console.log('  取り込み ' + importS.toFixed(1) + '秒・結合（OCRしない）' + stitchS.toFixed(1) + '秒・確かでない継ぎ目 ' + imp.unc.join('／') + (st.warn ? '・警告: ' + st.warn : '・警告なし'));
	// T156（決定 637・638）: 横画面の録画は「ずれているかもしれません」が出ない・カーソルを消す処理を通る
	if (v.landscape) { check(!st.warn && imp.unc.every((n) => n === 0), '横画面の録画: 確かでない継ぎ目 0・「ずれているかもしれません」が出ない', st.warn || imp.unc.join('／')); check(!!imp.cursor, '横画面の録画: カーソルを消す処理を通る（' + imp.cursor + '）', imp.cursor); }
	else check(!imp.cursor, '縦画面の動画: カーソルを消す処理を通らない', imp.cursor);
	await ctx.close();
}
/** exam.html の②の流れを通す（T139）: 入口 → 「動画を選ぶ」→ ファイルの選択に動画を渡す → ②に結合画像（OCR の前の1枚）が出るまで →
 *  下の「OCR処理を開始する」（動画モードの一体のボタン）で OCR と結合が終わるまで。人ごとの枚数（--special と同じ期待値）と高さ（±2）を、
 *  OCR の前の②の画像と OCR のあとの結合画像の両方で見る。時間は「ファイルを渡してから②の画像が出るまで」と「OCR＋結合」 */
async function runExam(v) {
	console.log('\n=== 動画' + v.no + '（exam.html の流れ・CPU ' + cpu + '倍）===');
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	page.setDefaultTimeout(600000);
	page.on('pageerror', (e) => console.log('[page error]', String(e)));
	await page.addInitScript(() => localStorage.setItem('uma-exam-last-step', '2'));
	await page.goto(base + '/exam.html');
	await page.waitForTimeout(1500);
	for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok').catch(() => {});
	await page.evaluate(() => selectStepTab(2));
	const cdp = await ctx.newCDPSession(page);
	if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
	const chooser = await pickVideo(page);
	const t0 = Date.now();
	await chooser.setFiles(path.join(root, v.name));
	await page.waitForSelector('#personset-A-wrap .video-result img, #personset-A-wrap .video-result .text-red-700, #video-error', { timeout: 600000 });
	const importS = (Date.now() - t0) / 1000;
	const heightsOf = (lines) => lines.map((l) => { const m = /高さ (\d+)px/.exec(l); return m ? +m[1] : null; });
	const imp = await page.evaluate(() => ({ n: persons.slice(0, 3).map((p) => p.files.length), err: (document.getElementById('video-error') || {}).textContent || null,
		lines: devGeometry.filter((l) => /^\[動画\].*composePerson/.test(l)), unc: persons.slice(0, 3).map((p) => p.video ? p.video.uncertain.filter(Boolean).length : -1),
		preview: !!document.querySelector('#personset-A-wrap .video-result img'), cursor: devGeometry.find((l) => l.startsWith('[動画] カーソル')) || null }));
	if (v.counts) check(!imp.err && imp.n.join('/') === v.counts.join('/'), '人ごとの枚数 ' + v.counts.join('／'), imp.err || imp.n.join('／'));
	else check(!imp.err && imp.n.length === 3 && imp.n.every((x) => x > 0), '3人に分かれる', imp.err || imp.n.join('／'));
	const hp = heightsOf(imp.lines);
	if (save) console.log('  保存: OCR の前の②の画像 ' + await saveImgs(page, '#personset-A-wrap .video-result img', 'exam-v' + v.no + '-pre') + '枚');
	check(imp.preview && hp.length === 3 && hp.every((h, i) => h != null && heightOk(v, i, h, 2)), 'OCR の前の②の画像: 3人とも composePerson・人ごとの高さ ' + v.heights.map((h) => (h == null ? '—' : h)).join('／') + '（±2）', hp.join('／'));
	const t1 = Date.now();
	await page.evaluate(() => { document.getElementById('process-stitch-btn').click(); });
	await page.waitForFunction(() => !stitchInProgress && !busyBtnId && !!document.querySelector('#stitch-result-content img'), null, { timeout: 900000 });
	const ocrS = (Date.now() - t1) / 1000;
	const st = await page.evaluate(() => ({ lines: devGeometry.filter((l) => /^\[動画\].*composePerson/.test(l)),
		detected: persons.slice(0, 3).map((p, i) => personResults[i] ? personResults[i].detectedSkills.size : -1),
		inPanel: !!document.querySelector('#personset-A-wrap .video-result img'),
		warn: (document.querySelector('#stitch-result-content .video-warn') || {}).textContent || null }));
	const hs = heightsOf(st.lines);
	if (save) console.log('  保存: OCR のあとの結合画像 ' + await saveImgs(page, '#stitch-result-content img', 'exam-v' + v.no + '-ocr') + '枚');
	check(hs.length === 3 && hs.every((h, i) => h != null && heightOk(v, i, h, 2)), 'OCR のあとの結合: 3人とも composePerson・人ごとの高さ（±2）', hs.join('／'));
	check(st.detected.every((n) => n > 0), 'OCR: 3人とも1つ以上のスキルを検出', st.detected.join('／'));
	check(st.inPanel, 'OCR のあとの結合画像が②にも出る');
	console.log('  人ごとの枚数 ' + imp.n.join('／') + '・高さ（OCR の前）' + hp.join('／') + '・（OCR のあと）' + hs.join('／'));
	console.log('  取り込み＋②の画像 ' + importS.toFixed(1) + '秒・OCR＋結合 ' + ocrS.toFixed(1) + '秒・検出 ' + st.detected.join('／') + '・確かでない継ぎ目 ' + imp.unc.join('／') + (st.warn ? '・警告: ' + st.warn : '・警告なし'));
	if (v.landscape) { check(!st.warn && imp.unc.every((n) => n === 0), '横画面の録画: 確かでない継ぎ目 0・「ずれているかもしれません」が出ない', st.warn || imp.unc.join('／')); check(!!imp.cursor, '横画面の録画: カーソルを消す処理を通る（' + imp.cursor + '）', imp.cursor); }
	else check(!imp.cursor, '縦画面の動画: カーソルを消す処理を通らない', imp.cursor);
	await ctx.close();
}
/** --capture（T145・T156）: 横画面の録画のフレームを「ウィンドウから取り込む」の画に変えて、製品の取り込みと同じ流れに通す:
 *  画を窓の形に描く（条件ごとに縮める・枠とタイトルバーを足す・頭に別の画を足す）→ 0.7秒ごとに detectOne → consensus → 圧縮（encodeSink）→
 *  前後の切り落とし（matchSpan・trimSource）→ cropSource → steadySource → selectFrames（取り込みと同じ設定）→ removePointer → composePerson。
 *  比べる相手は、同じ録画を製品の動画の流れ（openSource → wrapSource → 同じ設定で selectFrames → removePointer）に通したもの。
 *  見ること: 横画面と判定・幅 1170px／3人に分かれる／確かでない継ぎ目が0（「ずれているかもしれません」が出ない）／人ごとの高さが動画の流れと ±3／
 *  カーソルを消す処理の間に主のスレッドを 1.5秒以上ふさがない（T156 の前は1枚に数分ふさいでいた）。--save で人ごとの結合画像を保存 */
const CAPTURE_CONDS = {
	// T156 の 1・2（おいもさんの確かめ）と同じ形の画: 全画面のゲームの窓（そのまま・2880×1800 に収まるよう縮めた・頭に 1.5秒の別の画）、ウィンドウ（枠1px・タイトルバー32px）、縮めたウィンドウ
	9: [{ name: '全画面の窓', s: 1 }, { name: '全画面の窓を 2880×1800 に縮めた画', s: 'fit1800' }, { name: '全画面の窓・頭に 1.5秒の別の画', s: 1, pre: 1.5 }],
	10: [{ name: 'ウィンドウ（枠・タイトルバー）', s: 1, b: 1, tb: 32 }],
	11: [{ name: '小さいウィンドウ（枠・タイトルバー）', s: 1, b: 1, tb: 32 }, { name: '小さいウィンドウを 0.75倍', s: 0.75, b: 1, tb: 32 }]
};
async function runCapture(v) {
	console.log('\n=== 動画' + v.no + '（ウィンドウから取り込むの流れ）===');
	const page = await browser.newPage();
	page.setDefaultTimeout(900000);
	page.on('pageerror', (e) => console.log('[page error]', String(e)));
	await page.route(base + '/__video-frames-local.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
	await page.goto(base + '/__video-frames-local.html');
	const res = await page.evaluate(async ({ url, LABELS, conds, save }) => {
		const blob = await (await fetch(url)).blob();
		const long = [];
		new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask' });
		const finish = async (src) => {
			// 製品（取り込み・横画面の録画）と同じ: エフェクトの置き換えを切り、軌跡を取ってカーソルを消す
			const debug = {};
			const sel = await UmaVideoFrames.selectFrames(src, { labels: LABELS, debug, effectVote: false });
			const t0 = performance.now();
			const st = await UmaPcCapture.removePointer(src, sel, debug.track || []);
			const t1 = performance.now();
			await new Promise((r) => setTimeout(r, 50));
			const rpLong = Math.round(Math.max(0, ...long.filter((e) => e.s >= t0 && e.s < t1).map((e) => e.d)));
			const persons = [];
			for (const p of sel.persons) {
				const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still, anchorY: p.anchorY, ages: p.ages });
				persons.push({ h: c.height, n: p.files.length, unc: p.uncertain.filter(Boolean).length, png: save ? c.toDataURL('image/png') : null });
			}
			return { persons, rpMs: Math.round(t1 - t0), rpLong, cells: st.cells, margin: st.margin ? st.margin.cells : 0, manyHits: st.manyHits, xStart: st.xStart };
		};
		const film = await (async () => { const a = await UmaLandscape.wrapSource(await UmaVideoFrames.openSource(blob)); try { return Object.assign({ rect: a.landscape.rect }, await finish(a)); } finally { a.close(); } })();
		const caps = [];
		for (const C of conds) {
			const raw = await UmaVideoFrames.openSource(blob);
			const s = C.s === 'fit1800' ? Math.min(1, 2880 / raw.width, 1800 / raw.height) : C.s, b = C.b || 0, tb = C.tb || 0, pre = C.pre || 0;
			const gw = Math.round(raw.width * s), gh = Math.round(raw.height * s);
			const W = (gw + b * 2) & ~1, H = (gh + b * 2 + tb) & ~1;
			const cv = new OffscreenCanvas(W, H), cx = cv.getContext('2d', { willReadFrequently: true });
			const sink = UmaPcCapture.encodeSink({});
			await sink.begin(W, H);
			const areas = [];
			let n = 0;
			for (let t = 0; t < raw.duration + pre - 0.02; t += 1 / 30, n++) {
				cx.fillStyle = 'rgb(58,58,58)'; cx.fillRect(0, 0, W, H);
				if (tb) { cx.fillStyle = 'rgb(243,243,243)'; cx.fillRect(b, b, W - b * 2, tb); }
				cx.save(); cx.translate(b, b + tb); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'medium';
				// 頭の別の画（全画面のゲームへ戻る間の画の代わり）: 一様でない色の画
				if (t < pre) { cx.fillStyle = 'rgb(122,138,112)'; cx.fillRect(0, 0, gw, gh); cx.fillStyle = '#fff'; cx.font = '60px sans-serif'; cx.fillText('loading ' + t.toFixed(1), 200 + t * 100, 400); }
				else await raw.drawAt(t - pre, cx, gw, gh);
				cx.restore();
				if (n % 21 === 0) { const r = UmaPcCapture.detectOne(cx.getImageData(0, 0, W, H)); r.at = t; areas.push(r); }
				while (!sink.frame(cv, Math.round(t * 1e6))) await new Promise((r) => setTimeout(r, 5));
			}
			raw.close();
			const area = UmaPcCapture.consensus(areas);
			const out = { name: C.name, W, H, ok: area.ok, how: area.how, agree: area.agree, samples: area.samples, outW: area.outW };
			if (!area.ok) { caps.push(out); continue; }
			let enc = await sink.end(Math.round((raw.duration + pre) * 1e6));
			const span = UmaPcCapture.matchSpan(areas, area, enc.duration);
			if (span && (span.t0 >= 0.5 || span.t1 <= enc.duration - 0.5)) { out.trim = [+span.t0.toFixed(2), +span.t1.toFixed(2)]; enc = UmaPcCapture.trimSource(enc, span.t0, span.t1); }
			const src = (await UmaPcCapture.steadySource(UmaPcCapture.cropSource(enc, area))).src;
			try { caps.push(Object.assign(out, { w: src.width }, await finish(src))); }
			catch (e) { caps.push(Object.assign(out, { err: (e.code || '') + ' ' + e.message })); }
			finally { src.close(); }
		}
		return { film, caps };
	}, { url: base + '/assets/' + encodeURIComponent(v.name), LABELS, conds: CAPTURE_CONDS[v.no] || [], save });
	await page.close();
	const f = res.film;
	const tag = (p) => p.map((x) => x.h + '(' + x.n + '枚・確かでない ' + x.unc + ')').join('／');
	const savePngs = (key, persons) => { if (save) persons.forEach((p, j) => { if (p.png) fs.writeFileSync(path.join(outDir, 'capture-v' + v.no + '-' + key + '-' + LABELS[j] + '.png'), Buffer.from(p.png.split(',')[1], 'base64')); }); };
	savePngs('動画', f.persons);
	check(f.persons.length === 3 && f.persons.every((p) => p.unc === 0), '動画の流れ: 3人・確かでない継ぎ目 0', tag(f.persons));
	check(f.rpLong < 1500, '動画の流れ: カーソルを消す処理の間に 1.5秒以上ふさがない（' + f.rpMs + 'ms・最長 ' + f.rpLong + 'ms）', f.rpLong);
	console.log('  動画の流れ: ' + tag(f.persons) + '・カーソル 置き換え ' + f.cells + '・余白 ' + f.margin + '・左端 ' + f.xStart + (f.manyHits ? '・当たりが多い画 ' + f.manyHits : ''));
	res.caps.forEach((c, k) => {
		console.log('  -- ' + c.name + '（' + c.W + '×' + c.H + (c.trim ? '・切り落とし ' + c.trim.join('〜') + '秒' : '') + '）');
		check(c.ok && c.how === 'landscape' && c.w === 1170, '取り込み: 横画面と判定・幅 1170px（' + c.agree + '/' + c.samples + ' 回で一致）', JSON.stringify(c).slice(0, 300));
		if (!c.persons) { check(false, '取り込み: 3人に分かれる', c.err || 'persons なし'); return; }
		savePngs('cond' + k, c.persons);
		check(c.persons.length === 3 && c.persons.every((p) => p.unc === 0), '取り込み: 3人・確かでない継ぎ目 0', tag(c.persons));
		check(c.persons.length === 3 && c.persons.every((p, j) => f.persons[j] && Math.abs(p.h - f.persons[j].h) <= 3), '取り込み: 人ごとの高さが動画の流れと ±3', tag(c.persons) + ' と ' + tag(f.persons));
		check(c.rpLong < 1500, '取り込み: カーソルを消す処理の間に 1.5秒以上ふさがない（' + c.rpMs + 'ms・最長 ' + c.rpLong + 'ms）', c.rpLong);
		console.log('     カーソル 置き換え ' + c.cells + '・余白 ' + c.margin + '・左端 ' + c.xStart + (c.manyHits ? '・当たりが多い画 ' + c.manyHits : ''));
	});
}
/** --skill（T193）: 本育成結果のタブの動画。ページを開いて「本育成結果」→「動画」→「動画を選ぶ」に録画を渡し、自動の組み立てのあと「結合画像の設定」で3つの形を作る。
 *  見ること: 入口（「静止画｜動画」・「動画を選ぶ β」・「ウィンドウから取り込む β」が見え、「画像を選ぶ」は隠れる）／コマに分かれて組み立てまで済む・失敗の箱が出ない／
 *  スキルの数 69（固有1・進化1・金7・白60）／形ごとの大きさ（±2）／先頭の引っぱりすぎのコマを外した数／「動画の画像」の1行・タブの枚数に数えない／
 *  知らせ（つなぎ目）が出ない／コンソールのエラー 0・375px で横にはみ出さない／UmaStar と UmaExam で同じ PNG。
 *  DMM版の録画は「ウィンドウから取り込む」の画にも変え（ウィンドウの枠1px・タイトルバー32px。--capture と同じ作り）、取り込みの一回分（open・dispose）として
 *  UmaSkillResult.runVideo に渡し、動画と同じ数・大きさ（±3）になることを見る */
async function runSkill() {
	const { openPage, USER_DATA } = await import('../visual/lib/fixtures.mjs');
	const { reloadReady } = await import('../visual/lib/page-ready.mjs');
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const open = async (file) => {
		const { page } = await openPage(browser, base, file + '.html', { width: 375, height: 812 }, file === 'special' ? USER_DATA : EMPTY);
		page.setDefaultTimeout(600000);
		const errs = [];
		page.on('pageerror', (e) => errs.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 404/.test(m.text())) errs.push(m.text()); });
		await page.route('**/tesseract.js/4.0.2/tesseract.min.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Tesseract={createWorker:async()=>({loadLanguage:async()=>{},initialize:async()=>{},setParameters:async()=>{},terminate:async()=>{},recognize:async()=>({data:{text:"",lines:[]}})})};' }));
		await page.evaluate((f) => { localStorage.setItem(f === 'special' ? 'uma-special-upload-mode' : 'uma-exam-upload-mode', 'video'); if (f === 'exam') localStorage.setItem('uma-exam-last-step', '2'); }, file);
		await reloadReady(page);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok').catch(() => {});
		await page.evaluate(() => { selectStepTab(2); window.scrollTo(0, 0); });
		await page.click('#personset-tabs [data-tab-id="skill"]');
		return { page, errs };
	};
	const form = async (page, cols, count) => {
		const before = await page.evaluate(() => UmaSkillResult.peek());
		if (before.cols !== cols) await page.click('[data-sr-cols="' + cols + '"]');
		if (before.withCount !== count) await page.click('[data-sr-opt="count"]');
		await page.waitForFunction(({ cols, count }) => { const p = UmaSkillResult.peek(); const im = document.querySelector('.sr-img'); return p.built && p.sr && p.sr.cols === cols && p.sr.info === count && im && im.getAttribute('src') === p.url && im.complete && im.naturalWidth > 0; }, { cols, count }, { timeout: 120000 });
		return page.evaluate(async () => {
			const b = await (await fetch(UmaSkillResult.peek().url)).blob();
			const buf = new Uint8Array(await b.arrayBuffer());
			const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
			const dv = new DataView(buf.buffer);
			return { w: dv.getUint32(16), h: dv.getUint32(20), hash };
		});
	};
	const near = (a, b, t) => Math.abs(a - b) <= t;
	const countsOk = (c) => !!c && Object.keys(SKILL_COUNTS).every((k) => c[k] === SKILL_COUNTS[k]);
	const cstr = (c) => c ? c.all + '（固有 ' + c.unique + '・進化 ' + c.evo + '・金 ' + c.gold + '・白 ' + c.white + '）' : 'なし';
	const hashes = {};
	for (const v of skillTargets) {
		for (const file of ['special', 'exam']) {
			const NAME = file === 'special' ? 'UmaStar' : 'UmaExam';
			console.log('\n=== 本育成結果の動画: ' + v.key + '（' + NAME + '）===');
			const { page, errs } = await open(file);
			const ui = await page.evaluate(() => {
				const vis = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
				const pick = document.querySelector('[data-sr-act="video"]'), cap = document.querySelector('[data-sr-act="capture"]');
				return { mode: vis(document.getElementById('upload-mode')), pick: vis(pick), pickText: pick && pick.textContent.trim(), cap: !cap || vis(cap), img: vis(document.querySelector('.sr-pick')) };
			});
			check(ui.mode && ui.pick && /動画を選ぶ\s*β/.test(ui.pickText || '') && ui.cap && !ui.img, NAME + ': 入口（「静止画｜動画」・「動画を選ぶ β」が見え、「画像を選ぶ」は隠れる）', JSON.stringify(ui));
			const t0 = Date.now();
			const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-sr-act="video"]')]);
			await chooser.setFiles(path.join(SKILL_DIR, v.name));
			await page.waitForFunction(() => { const p = UmaSkillResult.peek(); return !p.vbusy && ((p.built && p.url) || document.querySelector('.sr-video-error, .sr-cap-fail')); }, null, { timeout: 600000 });
			const s = (Date.now() - t0) / 1000;
			const r = await page.evaluate(() => ({ p: UmaSkillResult.peek(), err: (document.querySelector('.sr-video-error') || {}).textContent || null, tab: document.querySelector('#personset-tabs [data-tab-id="skill"]').textContent.trim(),
				tile: !!document.querySelector('.sr-thumbs .video-tile'), warn: !!document.querySelector('.sr-warn') }));
			check(!r.err && r.p.built && r.p.video && r.p.video.kind === v.kind, NAME + ': コマに分けて組み立てまで済む（' + v.kind + '）', r.err || JSON.stringify(r.p.video));
			if (!r.p.built) { await page.context().close(); continue; }
			check(countsOk(r.p.counts), NAME + ': スキルの数 ' + cstr(SKILL_COUNTS), cstr(r.p.counts));
			check(r.p.video.dropped === v.dropped, NAME + ': 先頭の引っぱりすぎのコマを外した数 ' + v.dropped, r.p.video.dropped);
			check(r.tile && !/枚/.test(r.tab), NAME + ': 「動画の画像」の1行で見せ、タブの枚数に数えない', r.tab);
			check(!r.warn && r.p.warnings.length === 0, NAME + ': つなぎ目の知らせが出ない', r.p.warnings.join(' / '));
			const out = {};
			for (const [k, cols, count] of [['c2count', 2, true], ['c2', 2, false], ['c1count', 1, true]]) {
				out[k] = await form(page, cols, count);
				await saveImgs(page, '.sr-img', 'skill-' + v.kind + '-' + file + '-' + k);
				check(near(out[k].w, v.size[k][0], 2) && near(out[k].h, v.size[k][1], 2), NAME + ': ' + k + ' の大きさ ' + v.size[k].join('×') + '（±2）', out[k].w + '×' + out[k].h);
			}
			hashes[v.key + file] = out;
			await page.evaluate(() => window.scrollTo(0, 0));
			const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
			check(ov <= 0, NAME + ': 375px で横にはみ出さない', ov);
			check(errs.length === 0, NAME + ': コンソールのエラー 0', errs.join(' / '));
			console.log('  コマ ' + r.p.video.frames + '枚（使った ' + r.p.video.used + '）・' + s.toFixed(1) + '秒・数 ' + cstr(r.p.counts) + '・' + Object.keys(out).map((k) => k + ' ' + out[k].w + '×' + out[k].h).join('・'));
			await page.context().close();
		}
		const a = hashes[v.key + 'special'], b = hashes[v.key + 'exam'];
		if (a && b) check(Object.keys(a).every((k) => a[k].hash === b[k].hash), v.key + ': UmaStar と UmaExam で同じ PNG（3つの形）', JSON.stringify({ a, b }));
		if (!v.capture) continue;
		// ウィンドウから取り込む（--capture と同じ作りの窓の画 → 取り込みの一回分として runVideo へ）
		console.log('\n=== 本育成結果の動画: ' + v.key + ' を「ウィンドウから取り込む」の画に変えて（UmaStar）===');
		const { page, errs } = await open('special');
		const res = await page.evaluate(async ({ url }) => {
			const blob = await (await fetch(url)).blob();
			const raw = await UmaVideoFrames.openSource(blob);
			const b = 1, tb = 32, gw = raw.width, gh = raw.height;
			const W = (gw + b * 2) & ~1, H = (gh + b * 2 + tb) & ~1;
			const cv = new OffscreenCanvas(W, H), cx = cv.getContext('2d', { willReadFrequently: true });
			const sink = UmaPcCapture.encodeSink({});
			await sink.begin(W, H);
			const areas = [];
			let n = 0;
			for (let t = 0; t < raw.duration - 0.02; t += 1 / 30, n++) {
				cx.fillStyle = 'rgb(58,58,58)'; cx.fillRect(0, 0, W, H);
				cx.fillStyle = 'rgb(243,243,243)'; cx.fillRect(b, b, W - b * 2, tb);
				cx.save(); cx.translate(b, b + tb); await raw.drawAt(t, cx, gw, gh); cx.restore();
				if (n % 21 === 0) { const r = UmaPcCapture.detectOne(cx.getImageData(0, 0, W, H)); r.at = t; areas.push(r); }
				while (!sink.frame(cv, Math.round(t * 1e6))) await new Promise((r) => setTimeout(r, 5));
			}
			raw.close();
			const area = UmaPcCapture.consensus(areas);
			if (!area.ok) return { ok: false, area };
			let enc = await sink.end(Math.round(raw.duration * 1e6));
			const span = UmaPcCapture.matchSpan(areas, area, enc.duration);
			if (span && (span.t0 >= 0.5 || span.t1 <= enc.duration - 0.5)) enc = UmaPcCapture.trimSource(enc, span.t0, span.t1);
			const src = (await UmaPcCapture.steadySource(UmaPcCapture.cropSource(enc, area))).src;
			let disposed = false;
			const session = { open: async () => src, dispose: () => { disposed = true; } };
			const out = await UmaSkillResult.runVideo(session, { capture: true });
			const p = UmaSkillResult.peek();
			return { ok: true, how: area.how, w: src.width, out, disposed, p: { counts: p.counts, video: p.video, warnings: p.warnings, built: p.built }, fail: (document.querySelector('.sr-cap-fail, .sr-video-error') || {}).textContent || null };
		}, { url: base + '/test-images/skill-video/' + encodeURIComponent(v.name) });
		check(res.ok && res.how === 'landscape' && res.w === 1170, '取り込み: 横画面と判定・幅 1170px', JSON.stringify(res).slice(0, 300));
		check(res.ok && res.out && res.out.ok && res.p.built && res.p.video.kind === 'capture' && res.disposed && !res.fail, '取り込み: コマに分けて組み立てまで済む・一回分を手放す', JSON.stringify(res).slice(0, 300));
		if (res.ok && res.p.built) {
			check(countsOk(res.p.counts), '取り込み: スキルの数 ' + cstr(SKILL_COUNTS), cstr(res.p.counts));
			const c2 = await form(page, 2, true);
			await saveImgs(page, '.sr-img', 'skill-' + v.kind + '-capture-c2count');
			check(near(c2.w, v.size.c2count[0], 3) && near(c2.h, v.size.c2count[1], 3), '取り込み: 2列・数ありの大きさが動画の流れと ±3（' + v.size.c2count.join('×') + '）', c2.w + '×' + c2.h);
			console.log('  コマ ' + res.p.video.frames + '枚・数 ' + cstr(res.p.counts) + '・2列・数あり ' + c2.w + '×' + c2.h);
		}
		check(errs.length === 0, '取り込み: コンソールのエラー 0', errs.join(' / '));
		await page.context().close();
	}
}
/** --list（T220）: 因子一覧の動画を special ③・exam ②に渡す。on … スイッチ FACTOR_LIST_ENABLED を true に差し替える */
async function openListPage(file, on) {
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	page.setDefaultTimeout(600000);
	const errs = [];
	page.on('pageerror', (e) => errs.push(String(e)));
	if (on) await page.route('**/js/factor-list.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8',
		body: fs.readFileSync(path.join(REPO_ROOT, 'js', 'factor-list.js'), 'utf8').replace('const FACTOR_LIST_ENABLED = false;', 'const FACTOR_LIST_ENABLED = true;') }));
	await page.addInitScript((f) => localStorage.setItem(f === 'special' ? 'umaSkillDeck:stepTab' : 'uma-exam-last-step', '2'), file);
	await page.goto(base + '/' + file + '.html');
	await page.waitForTimeout(1500);
	for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
	await page.evaluate(() => selectStepTab(2));
	await page.evaluate(() => { window.__toasts = []; const o = window.showToast; window.showToast = function (m) { window.__toasts.push(String(m)); return o.apply(this, arguments); }; });
	const cdp = await ctx.newCDPSession(page);
	if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
	return { ctx, page, errs };
}
async function listImport(page, name) {
	const chooser = await pickVideo(page);
	const t0 = Date.now();
	await chooser.setFiles(path.join(root, name));
	await page.waitForFunction(() => !videoBusy && !document.getElementById('video-progress') && !!document.querySelector('#personset-A-wrap .video-result, #video-error'), null, { timeout: 600000 });
	const s = (Date.now() - t0) / 1000;
	const r = await page.evaluate(async () => {
		const im = document.querySelector('#personset-A-wrap .video-result img');
		if (im) await im.decode().catch(() => {});
		const t = (q) => { const e = document.querySelector(q); return e ? e.textContent.trim() : null; };
		return { files: persons.map((p) => p.files.length), error: t('#video-error .video-error-text'), partial: !!document.querySelector('.video-partial'), toasts: window.__toasts,
			img: im ? [im.naturalWidth, im.naturalHeight] : null, unc: persons[0].video ? persons[0].video.uncertain.filter(Boolean).length : null,
			logs: devGeometry.filter((l) => /^\[因子一覧\]|取り込めませんでした|^\[時間\]/.test(l)) };
	});
	return Object.assign(r, { s });
}
async function runListOne(v, file) {
	const NAME = file === 'special' ? 'UmaStar' : 'UmaExam';
	console.log('\n=== 因子一覧: ' + v.key + '（' + NAME + '・CPU ' + cpu + '倍）===');
	const off = await openListPage(file, false);
	const o = await listImport(off.page, v.name);
	check(o.files.every((n) => n === 0) && o.error && o.error.startsWith(v.off) && !o.logs.some((l) => /^\[因子一覧\]/.test(l)), NAME + ': スイッチ false は今の失敗の文のまま（見分けを呼ばない）', JSON.stringify(o));
	await off.ctx.close();
	const { ctx, page, errs } = await openListPage(file, true);
	const r = await listImport(page, v.name);
	const label = file === 'special' ? '親Aセット' : '親Aセット';
	check(!r.error && r.files[0] >= 2 && r.files.slice(1).every((n) => n === 0) && r.logs.some((l) => /見分け: list1/.test(l)), NAME + ': 親の欄だけに入る', JSON.stringify(r));
	check(r.toasts.includes(label + 'の親を取得しました') && !r.partial, NAME + ': 「' + label + 'の親を取得しました」・途中までの知らせは出ない', JSON.stringify(r.toasts));
	if (v.frames != null) check(r.files[0] === v.frames, NAME + ': 親の枚数 ' + v.frames, r.files[0]);
	// 組み立てた親の画を因子一覧の行の切り出しに通す（札の数と★）。OCR の流れの行の切り出しも
	const rows = await page.evaluate(async () => {
		const vd = persons[0].video;
		const c = await UmaVideoFrames.composePerson(persons[0].files, vd.shifts, vd.uncertain, '親', { still: vd.still, anchorY: vd.anchorY });
		const det = UmaFactorList.detectRows(c, [], { top: 0, bottom: 1 });
		const stars = det ? UmaFactorList.rowStars(c, det, { top: 0, bottom: 1 }).map((x) => x.stars).join('') : '';
		devGeometry = [];
		const out = await processPersonImages({ recognize: async () => ({ data: { text: '', lines: [] } }) }, persons[0].files, '親', true, true, false, vd);
		return { w: c.width, h: c.height, stars, geo: out.geometry.map((g) => (g && g.rows ? g.rows.length : 0)), png: c.toDataURL('image/png') };
	});
	if (save) fs.writeFileSync(path.join(outDir, 'list-' + v.name.replace(/\.\w+$/, '') + '-' + file + '-person.png'), Buffer.from(rows.png.split(',')[1], 'base64'));
	if (save) console.log('  保存: 結合画像 ' + await saveImgs(page, '#personset-A-wrap .video-result img', 'list-' + v.name.replace(/\.\w+$/, '') + '-' + file + '-stitch') + '枚');
	if (v.height != null) check(Math.abs(rows.h - v.height) <= 2, NAME + ': 組み立てた親の画の高さ ' + v.height + '（±2）', rows.h);
	if (v.stars != null) check(rows.stars === v.stars, NAME + ': 灰色の札 ' + v.stars.length + '枚と★の並び', rows.stars.length + '枚 ' + rows.stars);
	check(rows.geo.length === r.files[0] && rows.geo.every((n) => n > 0), NAME + ': OCR の流れは画ごとに因子一覧の行を切り出す', rows.geo.join('／'));
	console.log('  親 ' + r.files[0] + '枚・' + rows.w + '×' + rows.h + '・結合画像 ' + (r.img || []).join('×') + '・灰色の札 ' + rows.stars.length + '枚 ★' + rows.stars + '・行 ' + rows.geo.join('／') + '・確かでない継ぎ目 ' + r.unc + '・取り込み ' + r.s.toFixed(1) + '秒');
	console.log('  ' + r.logs.join('\n  '));
	if (file === 'exam') {
		await page.evaluate(() => { document.getElementById('process-stitch-btn').click(); });
		await page.waitForFunction(() => !stitchInProgress && !busyBtnId && !!document.querySelector('#stitch-result-content img'), null, { timeout: 900000 });
		const st = await page.evaluate(() => ({ detected: personResults[0] ? [...personResults[0].detectedSkills] : null, lines: devGeometry.filter((l) => /^\[因子一覧\]|【めろっぷ|\[印\]/.test(l)) }));
		if (save) await saveImgs(page, '#stitch-result-content img', 'list-' + v.name.replace(/\.\w+$/, '') + '-exam-ocr');
		check(st.detected && st.detected.length > 0, NAME + ': OCR で1つ以上のスキルを検出', JSON.stringify(st.detected));
		console.log('  OCR の検出 ' + (st.detected ? st.detected.length : 0) + '件');
	}
	check(errs.length === 0, NAME + ': ページのエラー 0', errs.join(' / '));
	await ctx.close();
}
/* T221（決定 937）: 横画面の6人分を「ウィンドウから取り込む」の流れに通す。画面の共有の代わりに、録画を描き続ける canvas の映像を渡す
 * （切り出し・圧縮・区間の切り落とし・動かない部分の塗り直し・因子一覧の結合まで製品のまま）。描くのが遅れても録画の中身は飛ばさない（1回に 1/15 秒まで）。
 * このまねの圧縮は出だしなどが粗くなることがあり、札の数が合わない人が出る。確かめるのは「合わない人には確かでない印がある（黙って欠けない）」こと。
 * 実際の PC の画面の共有は確かめていない */
async function runCaptureSix(v, file) {
	const NAME = file === 'special' ? 'UmaStar' : 'UmaExam';
	console.log('\n=== 因子一覧の6人分のウィンドウの取り込み: ' + v.name + '（' + NAME + '）===');
	const { ctx, page, errs } = await openListPage(file, true);
	await page.click('[data-upload-mode-btn="video"]');
	await page.evaluate(async (url) => {
		const raw = await UmaVideoFrames.openSource(await (await fetch(url)).blob());
		const cv = document.createElement('canvas'); cv.width = raw.width; cv.height = raw.height;
		const cx = cv.getContext('2d', { willReadFrequently: true });
		await raw.drawAt(0, cx, raw.width, raw.height);
		window.__capDone = false;
		navigator.mediaDevices.getDisplayMedia = async () => {
			const stream = cv.captureStream(30), t0 = performance.now();
			(async () => {
				let prev = -1;
				for (;;) {
					const t = Math.min((performance.now() - t0) / 1000 - 3, prev + 1 / 15);   // 初めの3秒は先頭の画のまま（青い枠が出てから撮り始めるまね）
					prev = t;
					await raw.drawAt(Math.max(0, Math.min(raw.duration - 0.001, t)), cx, raw.width, raw.height);
					if (t >= raw.duration) break;
					await new Promise((r) => setTimeout(r, 15));
				}
				window.__capDone = true;
			})();
			return stream;
		};
	}, base + '/assets/' + encodeURIComponent(v.name));
	await page.click('#personset-A-wrap .video-capture-btn');
	await page.waitForFunction(() => window.__capDone, null, { timeout: 600000 });
	await page.click('#cap-stop');
	await page.waitForFunction(() => !videoBusy && !document.getElementById('video-progress') && (!!document.querySelector('#video-error, #cap-fail') || (window.__toasts.some((t) => t.includes('取得しました')) && !stitchInProgress)), null, { timeout: 600000 });
	const r = await page.evaluate(() => ({
		error: (document.querySelector('#video-error .video-error-text, #cap-fail') || {}).textContent || null, toasts: window.__toasts,
		cards: persons.map((p) => p.files.reduce((s, f) => s + (f.factorList6 ? f.factorList6.cards.length : 0), 0)),
		unc: persons.map((p) => (p.video ? p.video.uncertain.filter(Boolean).length : null)),
		logs: devGeometry.filter((l) => /^\[因子一覧\]|^\[横画面\] 取り込み|取り込めませんでした|^\[時間\]/.test(l))
	}));
	check(!r.error && r.toasts.includes('親Aセットと親Bセットを取得しました'), NAME + ': 取り込みで6人分を取得する', JSON.stringify([r.error, r.toasts]));
	// 札の数が違う人は、その人に確かでない印があるか、空の欄なら同じセットの前の人に印がある
	const silent = r.cards.map((n, i) => (n === v.cards[i] || r.unc[i] > 0 || (n === 0 && r.unc.slice(i - (i % 3), i).some((u) => u > 0)) ? null : i)).filter((i) => i != null);
	check(silent.length === 0 && r.cards.some((n, i) => n === v.cards[i]), NAME + ': 取り込みの札の数が動画と違う人には確かでない印がある（黙って欠けない）', r.cards.join('／') + ' 確かでない ' + r.unc.join(',') + '（正 ' + v.cards.join('／') + '）');
	console.log('  札 ' + r.cards.join('／') + '・確かでない ' + r.unc.join(',') + (JSON.stringify(r.cards) === JSON.stringify(v.cards) ? '（動画と同じ）' : '（動画 ' + v.cards.join('／') + ' と違う）'));
	console.log('  ' + r.logs.join('\n  '));
	check(errs.length === 0, NAME + ': ページのエラー 0', errs.join(' / '));
	await ctx.close();
}
/* T221: 6人分。スイッチ false は今の失敗の文のまま。true は親Aセット・親Bセットに3人ずつ入り、それぞれの結合画像（3列。2列に切り替えて「画像を更新」も）
 * ができ、知らせが出る。札の数・★の並び・顔の欄・画素数（iPhone の Safari の上限 16,777,216 以下） */
async function runListSix(v, file) {
	const NAME = file === 'special' ? 'UmaStar' : 'UmaExam';
	console.log('\n=== 因子一覧の6人分: ' + v.name + '（' + NAME + '・CPU ' + cpu + '倍）===');
	if (file === 'special') {
		const off = await openListPage(file, false);
		const o = await listImport(off.page, v.name);
		check(o.files.every((n) => n === 0) && !!o.error && !o.logs.some((l) => /^\[因子一覧\]/.test(l)), NAME + ': スイッチ false は今の失敗の文のまま（見分けを呼ばない）', JSON.stringify(o));
		await off.ctx.close();
	}
	const { ctx, page, errs } = await openListPage(file, true);
	const chooser = await pickVideo(page);
	const t0 = Date.now();
	await chooser.setFiles(path.join(root, v.name));
	await page.waitForFunction(() => !videoBusy && !document.getElementById('video-progress') && (!!document.querySelector('#video-error') || (window.__toasts.some((t) => t.includes('取得しました')) && !stitchInProgress)), null, { timeout: 600000 });
	const sec = (Date.now() - t0) / 1000;
	const r = await page.evaluate(async () => {
		const out = { error: (document.querySelector('#video-error .video-error-text') || {}).textContent || null, toasts: window.__toasts, cards: [], stars: [], face: [], parts: [], unc: [], imgs: [], logs: devGeometry.filter((l) => /^\[因子一覧\]|取り込めませんでした|^\[時間\]/.test(l)) };
		for (const p of persons) {
			let n = 0, stars = '';
			const heads = [];
			for (const f of p.files) {
				const m = f.factorList6;
				if (!m) continue;
				const bmp = await createImageBitmap(f);
				const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
				const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
				n += m.cards.length;
				heads.push([bmp.width, bmp.height]);
				for (const k of m.cards) {
					// 札の左右の端（中ほどの行で白でない最初と最後の列）に対する★3つの中心の位置で、金色を数える
					const row = x.getImageData(0, Math.round(k.y + k.h / 2), c.width, 1).data;
					let L = -1, R = -1;
					for (let i = Math.round(c.width * 0.19); i < c.width; i++) if (Math.min(row[i * 4], row[i * 4 + 1], row[i * 4 + 2]) < 244) { if (L < 0) L = i; R = i; }
					let s = 0;
					for (const at of [0.758, 0.818, 0.877]) {
						const cx = Math.round(L + (R - L) * at), half = Math.round((R - L) * 0.018);
						const d = x.getImageData(cx - half, Math.round(k.y + k.h * 0.25), half * 2, Math.round(k.h * 0.5)).data;
						let g = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 140 && d[i] - d[i + 2] > 60) g++;
						if (g < d.length / 4 * 0.25) break;
						s++;
					}
					stars += s;
				}
			}
			out.cards.push(n); out.stars.push(stars); out.parts.push(heads);
			out.face.push(!!(p.files[0] && p.files[0].factorList6 && p.files[0].factorList6.face));
			out.unc.push(p.video ? p.video.uncertain.filter(Boolean).length : null);
		}
		for (const id of ['A', 'B']) {
			const im = document.querySelector('#personset-' + id + '-wrap .video-result img');
			if (im) await im.decode().catch(() => {});
			out.imgs.push(im ? [im.naturalWidth, im.naturalHeight] : null);
		}
		return out;
	});
	check(!r.error && r.logs.some((l) => /見分け: list6/.test(l)), NAME + ': 6人分を取り込む', JSON.stringify(r.error));
	check(r.toasts.includes('親Aセットと親Bセットを取得しました'), NAME + ': 「親Aセットと親Bセットを取得しました」', JSON.stringify(r.toasts));
	check(JSON.stringify(r.cards) === JSON.stringify(v.cards), NAME + ': 札の数（親A・祖A1・祖A2・親B・祖B1・祖B2） ' + v.cards.join('／'), r.cards.join('／'));
	check(r.face.every(Boolean), NAME + ': 6人とも顔の欄がある', r.face.join(','));
	check(r.unc.every((n) => n === 0) && r.logs.every((l) => !/重なりの無い飛び [1-9]/.test(l)), NAME + ': 確かでない継ぎ目の無い6人', r.unc.join(','));
	check(r.parts.every((p) => p.length >= 1 && p.every(([, h]) => h <= 3000)), NAME + ': 分けた画は高さ 3,000px 以下', JSON.stringify(r.parts));
	check(r.imgs.every((i) => i && i[0] * i[1] <= 16777216), NAME + ': 親Aセット・親Bセットの結合画像（3列）ができ、iPhone の画素数の上限以下', JSON.stringify(r.imgs));
	check(r.stars.every((s, i) => s.length === r.cards[i] && /^[1-3]+$/.test(s)), NAME + ': すべての札に★1〜3', JSON.stringify(r.stars));
	if (v.same) {
		const prev = sameStars.get(v.same);
		if (prev) check(JSON.stringify(prev.stars) === JSON.stringify(r.stars), NAME + ': 6人の★の並びが ' + prev.name + ' と一致', JSON.stringify([prev.stars, r.stars]));
		else sameStars.set(v.same, { name: v.name, stars: r.stars });
	}
	const tag = 'list6-' + v.name.replace(/\.\w+$/, '') + '-' + file;
	if (save) { await saveImgs(page, '#personset-A-wrap .video-result img', tag + '-A-3col'); await saveImgs(page, '#personset-B-wrap .video-result img', tag + '-B-3col'); }
	// 2列に切り替えて「画像を更新」（親Aセット）
	await page.evaluate(() => setStitchCols(2));
	await page.click('#personset-A-wrap [data-video-refresh]');
	await page.waitForFunction(() => window.__toasts.includes('結合画像を更新しました') && !stitchInProgress, null, { timeout: 600000 });
	const two = await page.evaluate(async () => { const im = document.querySelector('#personset-A-wrap .video-result img'); await im.decode().catch(() => {}); return [im.naturalWidth, im.naturalHeight]; });
	check(two[0] * two[1] <= 16777216 && two[0] !== r.imgs[0][0], NAME + ': 2列の結合画像ができる（iPhone の画素数の上限以下）', JSON.stringify([r.imgs[0], two]));
	if (save) await saveImgs(page, '#personset-A-wrap .video-result img', tag + '-A-2col');
	if (v.landscape && file === 'special') {
		// ウィンドウの取り込みの切り出し（決定 937）: スイッチ true は右の一覧を見つけ、false は今の結果（見つからない）のまま
		const urls = base + '/assets/' + encodeURIComponent(v.name);
		const grab = (pg) => pg.evaluate(async (url) => {
			const src = await UmaVideoFrames.openSource(await (await fetch(url)).blob()), out = [];
			const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
			const x = c.getContext('2d', { willReadFrequently: true });
			for (let k = 0; k < 8; k++) { await src.drawAt(src.duration * (k + 0.5) / 8, x, src.width, src.height); const d = UmaPcCapture.detectOne(x.getImageData(0, 0, c.width, c.height)); out.push(d.ok ? [d.x, d.y, d.w, d.h, d.outW, d.how] : d.reason + ':' + d.landscape); }
			src.close();
			return out;
		}, urls);
		const on = await grab(page);
		const off = await openListPage(file, false);
		const offR = await grab(off.page);
		await off.ctx.close();
		check(on.every((d) => Array.isArray(d) && Math.abs(d[0] - 1499) <= 3 && d[1] <= 3 && Math.abs(d[2] - 934) <= 4 && Math.abs(d[3] - 1564) <= 3 && d[5] === 'landscape'), NAME + ': detectOne が横画面の6人分の右の一覧を見つける（8コマ）', JSON.stringify(on));
		check(offR.every((d) => typeof d === 'string'), NAME + ': detectOne はスイッチ false では今の結果（見つからない）のまま', JSON.stringify(offR));
		console.log('  detectOne: true ' + JSON.stringify(on[0]) + '・false ' + JSON.stringify(offR[0]));
	}
	console.log('  札 ' + r.cards.join('／') + '・結合画像 3列 ' + r.imgs.map((i) => (i || []).join('×')).join(' と ') + '・2列（親A） ' + two.join('×') + '・取り込み ' + sec.toFixed(1) + '秒');
	console.log('  ' + r.logs.join('\n  '));
	check(errs.length === 0, NAME + ': ページのエラー 0', errs.join(' / '));
	await ctx.close();
}
const exam = process.argv.includes('--exam');
const capture = process.argv.includes('--capture');
try {
	if (special) for (const v of targets) await runSpecial(v);
	if (exam) for (const v of targets) await runExam(v);
	if (capture) for (const v of targets.filter((x) => x.landscape)) await runCapture(v);
	if (skillMode) await runSkill();
	if (listMode) for (const file of ['special', 'exam']) {
		for (const v of LIST_ONE.filter((x) => !listCaptureOnly && listTargets.includes(x.name))) await runListOne(v, file);
		for (const v of LIST_SIX.filter((x) => listTargets.includes(x.name))) {
			if (!listCaptureOnly) await runListSix(v, file);
			if (v.landscape) await runCaptureSix(v, file);
		}
	}
	for (const v of (special || exam || capture || skillMode) ? [] : targets) {
		if (v.elementSkip) { console.log('\n[飛ばした] 動画' + v.no + '（横画面の速い録画。video 要素の出どころでは区切りが取れない。--special・--exam・--capture で見る）'); continue; }
		console.log('\n=== 動画' + v.no + '（CPU ' + cpu + '倍）===');
		const page = await browser.newPage();
		page.on('pageerror', (e) => console.log('[page error]', String(e)));
		await page.route(base + '/__video-frames-local.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-local.html');
		const cdp = await page.context().newCDPSession(page);
		if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
		let heapMax = 0, busy = false;
		const poll = setInterval(async () => {
			if (busy) return; busy = true;
			try { const h = await cdp.send('Runtime.getHeapUsage'); heapMax = Math.max(heapMax, h.usedSize + (h.backingStorageSize || 0)); } catch { /* 閉じた */ }
			busy = false;
		}, 100);
		const url = base + '/assets/' + encodeURIComponent(v.name);
		const res = await page.evaluate(async ({ url, LABELS, compare, save, landscape }) => {
			const blob = await (await fetch(url)).blob();
			const t0 = performance.now();
			let src = await UmaVideoFrames.videoSource(blob);
			if (landscape) src = await UmaLandscape.wrapSource(src);
			let sel;
			try { sel = await UmaVideoFrames.selectFrames(src, { labels: LABELS }); } finally { src.close(); }
			const selectMs = performance.now() - t0;
			const t1 = performance.now();
			const persons = [];
			const canvases = [];
			for (const p of sel.persons) {
				const tp = performance.now();
				const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still, anchorY: p.anchorY, ages: p.ages });
				persons.push({ label: p.label, startT: p.startT, n: p.files.length, h: c.height, w: c.width, ms: performance.now() - tp,
					weak: p.weak.filter(Boolean).length, uncertain: p.uncertain.filter(Boolean).length, warnings: c._stitchWarnings.length });
				canvases.push(c);
			}
			const composeMs = performance.now() - t1;
			// 比べ（時間の外）: 同じフレームで stitchOnePerson。継ぎ目ごとの確かさ（stitch の基準）も並べる
			if (compare) {
				for (let j = 0; j < sel.persons.length; j++) {
					const p = sel.persons[j];
					devGeometry.length = 0;
					try {
						const c = await stitchOnePerson(p.files, p.label);
						persons[j].stitchH = c.height;
						persons[j].stitchWarn = c._stitchWarnings.length;
						persons[j].stitchReorder = devGeometry.some((l) => /並び替えます/.test(l));
						persons[j].stitchSeams = devGeometry.filter((l) => /画像\d+→\d+: オーバーラップ/.test(l)).map((l) => {
							const m = /オーバーラップ=(\d+)行 \(不一致率=([\d.—%]+)\/次点([\d.—%]+), 信頼度(高|低)/.exec(l);
							return m ? { overlap: +m[1], bad: m[2], second: m[3], confident: m[4] === '高' } : null;
						});
					} catch (e) { persons[j].stitchErr = String(e.message || e); }
				}
			}
			const pngs = save ? canvases.map((c) => c.toDataURL('image/png')) : [];
			return { selectMs, composeMs, anchors: sel.anchors, picks: sel.picks.length, header: sel.header, stats: sel.stats, tm: sel.tm, seams: sel.seams, persons, pngs,
				personSeams: sel.persons.map((p) => p.frameIndexes.slice(0, -1).map((k) => sel.seams[k])) };
		}, { url, LABELS, compare, save, landscape: !!v.landscape });
		clearInterval(poll);
		await page.close();
		const tag = 'v' + v.no + '-cpu' + cpu;
		if (save) res.pngs.forEach((d, j) => fs.writeFileSync(path.join(outDir, tag + '-' + LABELS[j] + '.png'), Buffer.from(d.split(',')[1], 'base64')));
		delete res.pngs;
		res.heapMaxMB = Math.round(heapMax / 1048576);
		fs.writeFileSync(path.join(outDir, tag + '.json'), JSON.stringify(res, null, 1));
		if (v.anchors) check(res.anchors.length === 3 && res.anchors.every((a, j) => Math.abs(a.t - v.anchors[j]) < 1e-6), '区画の頭の時刻 ' + v.anchors.join('／') + ' 秒', res.anchors.map((a) => a.t).join('／'));
		else check(res.anchors.length === 3, '区画の頭が3つ（3人に分かれる）', res.anchors.length + 'つ: ' + res.anchors.map((a) => a.t).join('／'));
		check(res.persons.length === 3 && res.persons.every((p, j) => heightOk(v, j, p.h, v.tol || 0)), '人ごとの高さ ' + v.heights.map((h) => (h == null ? '—' : h)).join('／') + (v.tol ? '（±' + v.tol + '）' : ''), res.persons.map((p) => p.h).join('／'));
		if (v.picks != null) check(res.picks === v.picks, '選ぶ枚数 ' + v.picks, res.picks);
		// T136（2026-11-08・決定 484・516）: 速い動画の調べ直し（1/16秒おき）は、出どころが正確（WebCodecs の復号）なときだけ。ここは video 要素の出どころ
		// （openSource で WebCodecs が使えないときの代わり）なので、動画6〜8 も今までどおり（stats.fast が偽）。製品の流れ（WebCodecs）は --special で通る
		check(res.stats && res.stats.fast === false, 'video 要素の出どころでは速い動画の調べ直しをしない（stats.fast が偽）', res.stats && res.stats.fast);
		if (compare) check(res.persons.every((p) => p.stitchH === p.h), 'stitchOnePerson と同じ高さ', res.persons.map((p) => p.stitchH).join('／'));
		const s = (ms) => (ms / 1000).toFixed(1);
		const row = { video: v.no, cpu, selectS: s(res.selectMs), composeS: s(res.composeMs), totalS: s(res.selectMs + res.composeMs), heapMB: res.heapMaxMB,
			picks: res.picks, n: res.persons.map((p) => p.n).join('／'), uncertain: res.persons.map((p) => p.uncertain).join('／'), weak: res.persons.map((p) => p.weak).join('／') };
		rows.push(row);
		console.log('  選ぶ ' + row.selectS + '秒・組み立て ' + row.composeS + '秒・計 ' + row.totalS + '秒・ヒープ最大 ' + row.heapMB + 'MB'
			+ '・枚数 ' + row.n + '・確かでない継ぎ目 ' + row.uncertain + '（選ぶ側の弱い継ぎ目 ' + row.weak + '）'
			+ (compare ? '・stitch の警告 ' + res.persons.map((p) => p.stitchWarn).join('／') : ''));
	}
} finally {
	await browser.close();
	await close();
}
console.log('\n' + (ng ? 'NG ' + ng + '件' : '全項目 OK') + '（動画 ' + (targets.length + skillTargets.length + listTargets.length) + '本・CPU ' + cpu + '倍。時間は期待値にしない）');
process.exit(ng ? 1 : 0);
