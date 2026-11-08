// js/video-frames.js（動画V1-1）を、素材フォルダの本物の画面収録（T132 で7本）で回す手元だけの検査（T42・2026-10-31）。
// tests/skillset と同じ扱い: 素材は Git の管理外。素材フォルダが無い・動画が無いときは「飛ばした」と出して 0 で終わる。
//
//   npm run test:video-local                 … 5本 × ふつう
//   npm run test:video-local -- --cpu=4      … CPU を4倍遅くする（スマホ相当の目安。CDP の Emulation.setCPUThrottlingRate）
//   npm run test:video-local -- --only=1     … 動画1 だけ（1〜7）
//   npm run test:video-local -- --compare    … 同じフレームで stitchOnePerson も呼び、高さと継ぎ目の確かさを並べる（時間に入れない）
//   npm run test:video-local -- --save       … 人ごとの結合画像を output/scratch/t42-video/ に保存
//   npm run test:video-local -- --special    … special.html の③の流れを通す（T59・動画V1-2）: 入口 → 小窓の「動画を選ぶ」→ ファイルの選択に動画を渡す →
//                                               「動画から N枚」が入るまで → 「画像を結合する（OCRしない）」で結合画像ができるまで。人ごとの枚数と高さを見る
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
	{ no: 2, name: 'ScreenRecording_10-25-2026 17-11-41_1_Exam.MP4', anchors: [0, 10, 20.25], heights: [2578, 2480, 2351], picks: 22, counts: [11, 8, 5] },
	// T135（2026-11-08・決定 494 の案A＋B2）: 動画2 の選ぶ枚数 25→22・人ごと 13／9／5→11／8／5。高さは同じで、結合画像の行も同じ（指のエフェクトの残り方だけが違う。T124-check-1 の画像 3）
	// T109（2026-11-06）: おいもさんの iPhone の3本（同じ親）。3本目は「連綿」を含む領域が2回写っていた・2本目は祖2 の結合の失敗・1本目は育成完了後の画面（紙吹雪）で取り込めなかった。
	// 同じ親なので高さはほぼ同じ（正解は PC の取り込みの結合画像を幅をそろえた 2002／1906／1651）。動画1・2 の枚数も T109 で変わった（軌跡が正しくなり、誤って足していた動いている画が減った。結合画像の行は同じ。報告 T109-check-1.md）
	{ no: 3, name: 'ScreenRecording_11-06-2026 16-57-05_1.MP4', anchors: [0, 7, 12.25], heights: [1997, 1901, 1648], picks: 11, counts: [6, 4, 3] },
	{ no: 4, name: 'ScreenRecording_11-06-2026 16-58-38_1.MP4', anchors: [0, 5.625, 10.25], heights: [1997, 1901, 1647], picks: 10, counts: [4, 5, 3] },
	{ no: 5, name: 'ScreenRecording_11-06-2026 16-59-47_1.MP4', anchors: [0, 5.5, 11], heights: [1998, 1902, 1649], picks: 10, counts: [5, 4, 3] },
	// T132（2026-11-08・決定 485・486）: スクロールを始めてから5秒未満で終わる速い動画2本（T129 で調べた A-1・A-2）。親（本人）は別の人で、
	// 祖1・祖2 は動画3〜5 と同じ。期待値は「3人に分かれる」と、祖1・祖2 の高さ（動画3〜5 の 1901〜1902・1647〜1649 を目安に ±2）だけ。
	// 親の高さ・区切りの時刻・選ぶ枚数は期待値にしない（null は見ない）。A-1 は直す前は区切りが4つ（祖2 のパネルの頭が文字で2つに割れた）、
	// A-2 は末尾が一番下で行き過ぎた画で祖2 が 1694（T129-check-1.md）
	{ no: 6, name: 'fast-scroll-A-1.MP4', anchors: null, heights: [null, 1901, 1648], tol: 2, picks: null, counts: null },
	{ no: 7, name: 'fast-scroll-A-2.MP4', anchors: null, heights: [null, 1901, 1648], tol: 2, picks: null, counts: null },
	// T134（2026-11-08）: 育成を終えてすぐの画面（窓の外に紙吹雪）から撮った7.5秒の動画。撮り始めの約1.2秒は一覧が止まっていて、
	// 直す前は本文の帯の下端が窓の下の紙吹雪（2520）まで伸び、「継承の画面が見つからない」（band）で止まっていた。親は別の人で、祖1・祖2 は動画3〜5 と同じ。
	// 期待値は「3人に分かれる」と人ごとの高さ（確かめた値 1805／1902／1649 を目安に ±2）。区切りの時刻・選ぶ枚数は期待値にしない
	{ no: 8, name: 'ScreenRecording_11-08-2026 13-19-49_1.MP4', anchors: null, heights: [1805, 1902, 1649], tol: 2, picks: null, counts: null }
];
/** 高さの期待値に合うか（null は見ない。tol は許す差） */
const heightOk = (v, j, h, tol) => v.heights[j] == null || (h != null && Math.abs(h - v.heights[j]) <= tol);
const LABELS = ['親', '祖1', '祖2'];

let root = null;
try { root = assetsRoot(); } catch (e) { console.log('[飛ばした] 素材フォルダが設定されていない: ' + String(e.message).split('\n')[0]); process.exit(0); }
const targets = VIDEOS.filter((v) => !only || String(v.no) === only).filter((v) => {
	if (fs.existsSync(path.join(root, v.name))) return true;
	console.log('[飛ばした] 動画' + v.no + ' が素材フォルダに無い');
	return false;
});
if (!targets.length) { console.log('回す動画がありません'); process.exit(0); }

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames local</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

const outDir = path.join(REPO_ROOT, 'output', 'scratch', 't42-video');
fs.mkdirSync(outDir, { recursive: true });
const { base, close } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' });
let ng = 0;
const check = (cond, label, detail) => { console.log((cond ? '  OK  ' : '  NG  ') + label + (cond || detail == null ? '' : '  … ' + detail)); if (!cond) ng++; };
const rows = [];

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
		sum: persons.slice(0, 3).map((p) => p.files.length).join('／'), unc: persons.slice(0, 3).map((p) => p.video ? p.video.uncertain.filter(Boolean).length : -1) }));
	if (v.counts) check(!imp.err && imp.n.join('/') === v.counts.join('/'), '人ごとの枚数 ' + v.counts.join('／') + '（知らせ: ' + (imp.sum || '').slice(0, 40) + '…）', imp.err || imp.n.join('／'));
	else check(!imp.err && imp.n.length === 3 && imp.n.every((x) => x > 0), '3人に分かれる（知らせ: ' + (imp.sum || '').slice(0, 40) + '…）', imp.err || imp.n.join('／'));
	const t1 = Date.now();
	const st = await page.evaluate(async () => {
		devGeometry = [];
		await runImageStitching({ keepClosed: true, quiet: true });
		return { lines: devGeometry.filter((l) => /^\[動画\]/.test(l)), img: !!document.querySelector('#stitch-result-content img'),
			warn: (document.querySelector('#stitch-result-content .video-warn') || {}).textContent || null };
	});
	const stitchS = (Date.now() - t1) / 1000;
	const hs = st.lines.map((l) => { const m = /高さ (\d+)px/.exec(l); return m ? +m[1] : null; });
	// 高さは ±2px（T90: special.html の流れは止まっている画の画素を優先して組み立てるので、末尾の切る行が 1px 動くことがある。動画1 は 1999／1708／1648）
	check(st.img && st.lines.length === 3 && hs.length === 3 && hs.every((h, i) => h != null && heightOk(v, i, h, 2)), '結合: 3人とも composePerson・人ごとの高さ ' + v.heights.map((h) => (h == null ? '—' : h)).join('／') + '（±2）', hs.join('／'));
	console.log('  取り込み ' + importS.toFixed(1) + '秒・結合（OCRしない）' + stitchS.toFixed(1) + '秒・確かでない継ぎ目 ' + imp.unc.join('／') + (st.warn ? '・警告: ' + st.warn : '・警告なし'));
	await ctx.close();
}
try {
	if (special) for (const v of targets) await runSpecial(v);
	for (const v of special ? [] : targets) {
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
		const res = await page.evaluate(async ({ url, LABELS, compare, save }) => {
			const blob = await (await fetch(url)).blob();
			const t0 = performance.now();
			const src = await UmaVideoFrames.videoSource(blob);
			let sel;
			try { sel = await UmaVideoFrames.selectFrames(src, { labels: LABELS }); } finally { src.close(); }
			const selectMs = performance.now() - t0;
			const t1 = performance.now();
			const persons = [];
			const canvases = [];
			for (const p of sel.persons) {
				const tp = performance.now();
				const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label);
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
		}, { url, LABELS, compare, save });
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
console.log('\n' + (ng ? 'NG ' + ng + '件' : '全項目 OK') + '（動画 ' + targets.length + '本・CPU ' + cpu + '倍。時間は期待値にしない）');
process.exit(ng ? 1 : 0);
