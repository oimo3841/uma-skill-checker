// js/video-frames.js（動画V1-1）を、素材フォルダの本物の画面収録2本で回す手元だけの検査（T42・2026-10-31）。
// tests/skillset と同じ扱い: 素材は Git の管理外。素材フォルダが無い・動画が無いときは「飛ばした」と出して 0 で終わる。
//
//   npm run test:video-local                 … 2本 × ふつう
//   npm run test:video-local -- --cpu=4      … CPU を4倍遅くする（スマホ相当の目安。CDP の Emulation.setCPUThrottlingRate）
//   npm run test:video-local -- --only=1     … 動画1 だけ（1 か 2）
//   npm run test:video-local -- --compare    … 同じフレームで stitchOnePerson も呼び、高さと継ぎ目の確かさを並べる（時間に入れない）
//   npm run test:video-local -- --save       … 人ごとの結合画像を output/scratch/t42-video/ に保存
//
// 期待値（T39 の実測）: 区画の頭の時刻・人ごとの高さ・選ぶ枚数。**時間は揺れるので期待値にしない**（表に出すだけ）。
// iPhone の収録は HEVC なので、同梱の Chromium では復号できない。channel:'chrome' で回す（tests/skillset/extract-video-frames.mjs と同じ）。
// ほかの test:visual が動いている間は時間を測らない（負荷で揺れる）。このスクリプトは止めない・待たない。回す前に自分で確かめる。

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { REPO_ROOT, assetsRoot } from '../skillset/lib/assets.mjs';
import { startServer } from '../skillset/lib/serve.mjs';

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const cpu = Number(arg('cpu', '1'));
const only = arg('only', '');
const compare = process.argv.includes('--compare');
const save = process.argv.includes('--save');

const VIDEOS = [
	{ no: 1, name: 'ScreenRecording_10-25-2026 17-06-21_1.MP4', anchors: [0, 8.75, 14.5], heights: [1999, 1709, 1648], picks: 18 },
	{ no: 2, name: 'ScreenRecording_10-25-2026 17-11-41_1_Exam.MP4', anchors: [0, 10.5, 20], heights: [2579, 2480, 2352], picks: 54 }
];
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
try {
	for (const v of targets) {
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
		check(res.anchors.length === 3 && res.anchors.every((a, j) => Math.abs(a.t - v.anchors[j]) < 1e-6), '区画の頭の時刻 ' + v.anchors.join('／') + ' 秒', res.anchors.map((a) => a.t).join('／'));
		check(res.persons.length === 3 && res.persons.every((p, j) => p.h === v.heights[j]), '人ごとの高さ ' + v.heights.join('／'), res.persons.map((p) => p.h).join('／'));
		check(res.picks === v.picks, '選ぶ枚数 ' + v.picks, res.picks);
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
