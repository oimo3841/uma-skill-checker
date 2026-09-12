// 画面収録から、カードの切り出しに使えるフレームを取り出す（**検証専用**）。
//
//   node tests/skillset/extract-video-frames.mjs --set=2026-09-12a [--fps=8] [--probe]
//
// ■ この道具の位置づけ（取り違え注意）
//   製品（special.html / exam.html / UmaSkill Deck）の入力は**静止画のまま**。
//   動画を扱うのは「445種を網羅する検証素材を撮り漏れなく集める」ためだけで、
//   製品に動画対応を入れることは決まっていない。**製品ファイルからこのコードを参照しない。**
//
// ■ ffmpeg を使わない理由
//   この環境に ffmpeg が入っていない（PATH・winget のリンク先・既定の導入先すべてに無い）。
//   受け取った .MP4 は iPhone の画面収録で **HEVC(hvc1)**。Playwright 同梱の Chromium は
//   proprietary codec を持たないので、ローカルに入っている Google Chrome を
//   channel:'chrome' で使って復号する。追加インストールを求めずに済む。
//   （復号できない環境では、その旨を出して終了する）
//
// ■ 手順
//   1. 一定間隔でシークしてフレームを取り出す
//   2. 鮮明さを測る（js/common.js の sharpnessScore をそのまま使う）。
//      **しきい値は決め打ちせず、その動画全体の分布から決める**
//   3. 縦スクロール量を推定し、位置がほぼ同じ連続フレームは1枚だけ残す
//   4. 残ったフレームを frames/<セット>/ に、ブレたフレームを frames-blurry/<セット>/ に保存する
//      （ブレたフレームは捨てない。人工劣化と比べるための「実劣化サンプル」）

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { assetsRoot, assetsDir, listSets, listFiles, relToAssets } from './lib/assets.mjs';
import { startServer } from './lib/serve.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

const MAX_SHIFT_PX = Number(argValue('maxshift', '60'));
// 鮮明とみなす下限（その動画の95%点に対する比）
const SHARP_RELATIVE = Number(argValue('sharprel', '0.8'));
// 鮮明さが低いほうから何割を「実劣化サンプル」として残すか
const BLURRY_KEEP_RATIO = Number(argValue('blurpct', '0.15'));

const VIDEO_EXT = ['.mp4', '.mov', '.m4v'];

async function openPage(browser, base) {
	const page = await browser.newPage();
	page.on('pageerror', (e) => console.error('  [page error]', String(e)));
	await page.goto(`${base}/tests/skillset/fixtures/video-host.html`, { waitUntil: 'load' });
	await page.evaluate(() => {
		window.__v = document.createElement('video');
		window.__v.muted = true;
		window.__v.preload = 'auto';
		window.__canvas = document.createElement('canvas');

		window.__open = async function (url) {
			const v = window.__v;
			v.src = url;
			await new Promise((res, rej) => {
				v.onloadeddata = res;
				v.onerror = () => rej(new Error('動画を読めませんでした（コーデック未対応の可能性）'));
				setTimeout(() => rej(new Error('読み込みがタイムアウトしました')), 30000);
			});
			window.__canvas.width = v.videoWidth;
			window.__canvas.height = v.videoHeight;
			return { w: v.videoWidth, h: v.videoHeight, duration: v.duration };
		};

		window.__seek = async function (t) {
			const v = window.__v;
			await new Promise((res, rej) => {
				const done = () => { v.removeEventListener('seeked', done); res(); };
				v.addEventListener('seeked', done);
				v.currentTime = t;
				setTimeout(() => rej(new Error('シークがタイムアウトしました')), 20000);
			});
			window.__canvas.getContext('2d').drawImage(v, 0, 0);
		};

		// 鮮明さと、縦スクロールを推定するための行ごとの明るさ
		window.__metrics = function () {
			const c = window.__canvas;
			const ctx = c.getContext('2d');
			// 一覧が写っている中央帯だけを見る（上下のヘッダ・ボタンを外す）
			const x0 = Math.round(c.width * 0.08), x1 = Math.round(c.width * 0.92);
			const y0 = Math.round(c.height * 0.20), y1 = Math.round(c.height * 0.80);
			const w = x1 - x0, h = y1 - y0;
			const data = ctx.getImageData(x0, y0, w, h);
			const gray = toGray(data); // common.js
			// **鮮明さはカードが写っている範囲だけで測る。**
			// 帯ぜんぶで測ると、カードが少ないタブ（一覧が短い＝背景が多い）のフレームが
			// 一様に低く出て、ブレていないのに「ブレた」と判定されてしまう。
			// カードの地の色（ラベンダー／金）の割合が高い行だけを残し、その上端〜下端で測る。
			const T = window.SkillsetCards.TUNING;
			let cardTop = -1, cardBottom = -1;
			for (let y = 0; y < h; y++) {
				let hits = 0;
				for (let x = 0; x < w; x += 2) {
					const p = (y * w + x) * 4;
					const r = data.data[p], g = data.data[p + 1], b = data.data[p + 2];
					const lav = b - r > T.LAVENDER_B_MINUS_R && r > T.LAVENDER_MIN_R && b > T.LAVENDER_MIN_B;
					const gold = r > T.GOLD_MIN_R && g > T.GOLD_MIN_G && b < T.GOLD_MAX_B && r - b > T.GOLD_MIN_R_MINUS_B;
					if (lav || gold) hits++;
				}
				if (hits > w * 0.15) { if (cardTop < 0) cardTop = y; cardBottom = y; }
			}
			let sharp = null, cardRows = 0;
			if (cardTop >= 0 && cardBottom - cardTop > 40) {
				cardRows = cardBottom - cardTop + 1;
				const sub = ctx.getImageData(x0, y0 + cardTop, w, cardRows);
				sharp = sharpnessScore(toGray(sub), w, cardRows); // common.js
			}
			const sig = new Float32Array(h);
			for (let y = 0; y < h; y++) {
				let s = 0;
				for (let x = 0; x < w; x++) s += gray[y * w + x];
				sig[y] = s / w;
			}
			var thumb = window.SkillsetCards.detectScrollThumb(ctx.getImageData(0, 0, c.width, c.height));
			return { sharp, cardRows, sig: Array.from(sig), thumbY: thumb ? thumb.y0 : null, thumbRatio: thumb ? thumb.ratio : null };
		};

		window.__frame = function () {
			return window.__canvas.toDataURL('image/png');
		};
	});
	return page;
}

/** 2つの行プロファイルの縦ずれ（px）を求める。 */
function estimateShift(a, b, maxShift) {
	let best = 0, bestScore = Infinity;
	for (let s = -maxShift; s <= maxShift; s++) {
		let sum = 0, n = 0;
		for (let y = Math.max(0, -s); y < Math.min(a.length, a.length - s); y += 2) {
			sum += Math.abs(a[y] - b[y + s]);
			n++;
		}
		if (!n) continue;
		const score = sum / n;
		if (score < bestScore) { bestScore = score; best = s; }
	}
	return { shift: best, score: bestScore };
}

function percentile(values, p) {
	if (!values.length) return 0;
	const a = values.slice().sort((x, y) => x - y);
	const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
	return a[i];
}

async function main() {
	const setName = argValue('set', null);
	const fps = Number(argValue('fps', '8'));
	const probeOnly = process.argv.includes('--probe');
	const sets = setName ? [setName] : listSets('videos');
	if (!sets.length) {
		console.error('videos/ に撮影セットがありません');
		process.exit(1);
	}
	const { base, close: closeServer } = await startServer();
	const report = { generatedAt: new Date().toISOString(), fps, videos: [] };
	try {
		for (const name of sets) {
			const files = listFiles(path.join(assetsRoot(), 'videos', name), VIDEO_EXT);
			for (const file of files) {
				const rel = `/assets/videos/${name}/${path.basename(file)}`;
				console.log(`\n[${name}/${path.basename(file)}]`);
				const entry = await processVideo(base, rel, name, file, fps, probeOnly);
				report.videos.push(entry);
			}
		}
	} finally {
		await closeServer();
	}
	if (!probeOnly) {
		const out = path.join(assetsDir('reports'), 'video-frames.json');
		await fs.writeFile(out, JSON.stringify(report, null, '\t'), 'utf-8');
		console.log(`\n→ ${relToAssets(out)}`);
	}
}

async function processVideo(base, urlPath, setName, file, fps, probeOnly) {
	// 映像トラックを**実際に復号できた**ブラウザを使う。
	// 同梱 Chromium は HEVC を持たないが、音声だけ読めて loadeddata が飛ぶため
	// 「読めた」ように見える。videoWidth が 0 かどうかで判定する。
	const tried = [];
	for (const channel of [undefined, 'chrome', 'msedge']) {
		let browser = null;
		try {
			browser = await chromium.launch({ channel });
		} catch (e) {
			tried.push(`${channel || 'bundled-chromium'}: 起動できない`);
			continue;
		}
		try {
			const page = await openPage(browser, base);
			const info = await page.evaluate((u) => window.__open(u), base + urlPath);
			if (!info.w || !info.h) throw new Error(`映像トラックを復号できない（${info.duration.toFixed(2)}秒・0x0）`);
			try {
				return await scan(browser, page, channel || 'bundled-chromium', info, urlPath, setName, file, fps, probeOnly);
			} finally {
				await browser.close();
			}
		} catch (e) {
			tried.push(`${channel || 'bundled-chromium'}: ${String(e.message || e).split('\n')[0]}`);
			if (browser.isConnected()) await browser.close();
		}
	}
	throw new Error(
		'この動画を復号できるブラウザがありませんでした（HEVC の可能性）。\n  ' +
			tried.join('\n  ') +
			'\niPhone の「設定 > カメラ > フォーマット」を「互換性優先」にすると H.264 で撮れます。'
	);
}

async function scan(browser, page, channel, info, urlPath, setName, file, fps, probeOnly) {
	console.log(`  ${info.w}x${info.h}  ${info.duration.toFixed(2)}秒  復号: ${channel}`);
	if (probeOnly) return { file: path.basename(file), set: setName, channel, info, probe: true };

	const step = 1 / fps;
	const frames = [];
	let prevSig = null;
	let cumulative = 0;
	const t0 = Date.now();
	for (let t = 0; t < info.duration - 1e-6; t += step) {
		await page.evaluate((tt) => window.__seek(tt), t);
		const m = await page.evaluate(() => window.__metrics());
		let shift = 0;
		// 探索範囲はカードの縦の間隔より狭くする。一覧は約90px周期で繰り返すので、
		// 広く探すと「1行ぶんずれた位置」に誤って合ってしまう（周期パターンへの誤ロック）。
		if (prevSig) shift = estimateShift(prevSig, m.sig, MAX_SHIFT_PX).shift;
		cumulative += shift;
		// 探索範囲の端に張り付いた＝実際はもっと速く動いている。連結を切るために印を付ける
		const saturated = Math.abs(shift) >= MAX_SHIFT_PX;
		frames.push({ t: Number(t.toFixed(3)), sharp: m.sharp, cardRows: m.cardRows, shift, cumulative, saturated, thumbY: m.thumbY, thumbRatio: m.thumbRatio });
		prevSig = m.sig;
		if (frames.length % 25 === 0) process.stdout.write(`  …${frames.length}フレーム\r`);
	}
	console.log(`  ${frames.length}フレームを調べた（${((Date.now() - t0) / 1000).toFixed(0)}秒）`);

	// 鮮明さのしきい値は、この動画自身の分布から決める（端末・スクロール速度で絶対値が変わる）。
	// **その動画のいちばん鮮明なフレームを基準にした相対値**にする。
	// 「上位何%」で切ると、ブレたフレームが1枚も無い動画でも必ず一定数を捨ててしまう。
	const withCards = frames.filter((f) => f.sharp != null);
	const sharps = withCards.map((f) => f.sharp);
	const p95 = percentile(sharps, 0.95);
	const p05 = percentile(sharps, 0.05);
	const threshold = p95 * SHARP_RELATIVE;
	frames.forEach((f) => { f.sharpEnough = f.sharp != null && f.sharp >= threshold; });
	const sharpCount = frames.filter((f) => f.sharpEnough).length;
	const spread = p95 > 0 ? p05 / p95 : 0;
	console.log(
		`  鮮明さ（カードが写っている範囲だけで測定）: 中央値 ${percentile(sharps, 0.5).toFixed(0)} / ` +
			`5%点 ${p05.toFixed(0)} / 95%点 ${p95.toFixed(0)}  → しきい値 ${threshold.toFixed(0)}（95%点の${SHARP_RELATIVE}倍）`
	);
	console.log(`  鮮明なフレーム ${sharpCount}/${withCards.length}（${((sharpCount / withCards.length) * 100).toFixed(1)}%。カードが写っていないフレーム ${frames.length - withCards.length}枚は除く）`);
	if (spread >= SHARP_RELATIVE) {
		console.log(
			`  ※ いちばん鮮明なフレームと低いフレームの差が小さい（${(spread * 100).toFixed(0)}%）。` +
				'この動画には**ブレたフレームがほとんど無い**＝実劣化サンプルは取れていない。'
		);
	}

	// 縦位置がほぼ同じ連続フレームは1枚だけ残す（止まっている間の重複を落とす）
	const DEDUPE_PX = 6;
	const kept = [];
	let group = [];
	const flush = () => {
		if (!group.length) return;
		const sharpInGroup = group.filter((f) => f.sharpEnough);
		const pick = (sharpInGroup.length ? sharpInGroup : group).reduce((a, b) => (b.sharp > a.sharp ? b : a));
		kept.push(pick);
		group = [];
	};
	// タブを切り替えると、スクロール量は変わらないのに中身が総入れ替えになる。
	// 位置だけでまとめると、直前のタブのフレームと同じ組に入って落とされてしまう
	// （実際に、一覧が短いタブが丸ごと消えた）。**写っているカードの量が大きく変わったら組を切る。**
	const CONTENT_CHANGE_RATIO = 0.2;
	frames.forEach((f) => {
		if (group.length) {
			const movedFar = Math.abs(f.cumulative - group[0].cumulative) > DEDUPE_PX;
			const base = group[0].cardRows || 0;
			const changed = base > 0 && Math.abs((f.cardRows || 0) - base) > base * CONTENT_CHANGE_RATIO;
			if (movedFar || changed) flush();
		}
		group.push(f);
	});
	flush();
	// **しきい値に届かない位置でも、その位置でいちばん鮮明な1枚は必ず残す。**
	// 落とすと、その区間のカードが丸ごと取れなくなる。実際に、一覧が短いタブは
	// 鮮明さのスコアが構造的に低く出るため、しきい値で切るとタブ1つぶんが消えた。
	const keptSharp = kept;
	const belowThreshold = kept.filter((f) => !f.sharpEnough).length;
	console.log(
		`  スクロール位置でまとめると ${kept.length}枚（各位置のいちばん鮮明な1枚。` +
			`うち ${belowThreshold}枚はしきい値に届かないが、その位置の最良なので残す）`
	);

	// 「採用したフレームどうしの間でスクロールが飛んだ量」。1画面ぶんを超えると撮り漏れになる
	const gaps = [];
	for (let i = 1; i < keptSharp.length; i++) {
		const d = Math.abs(keptSharp[i].cumulative - keptSharp[i - 1].cumulative);
		gaps.push({ from: keptSharp[i - 1].t, to: keptSharp[i].t, px: d });
	}
	const maxGap = gaps.length ? Math.max(...gaps.map((g) => g.px)) : 0;
	const totalScroll = frames.length ? Math.abs(frames[frames.length - 1].cumulative - frames[0].cumulative) : 0;
	console.log(`  総スクロール量 約${Math.round(totalScroll)}px / 採用フレーム間の最大の飛び ${Math.round(maxGap)}px`);

	// 保存
	const outSharp = assetsDir('frames', setName);
	const outBlurry = assetsDir('frames-blurry', setName);
	const stem = path.basename(file, path.extname(file));
	let savedSharp = 0;
	for (const f of keptSharp) {
		await page.evaluate((tt) => window.__seek(tt), f.t);
		const dataUrl = await page.evaluate(() => window.__frame());
		await fs.writeFile(
			path.join(outSharp, `${stem}-${String(Math.round(f.t * 1000)).padStart(6, '0')}.png`),
			Buffer.from(dataUrl.split(',')[1], 'base64')
		);
		savedSharp++;
	}
	// 実劣化サンプル: ブレたフレームのうち、位置がばらけるように間引いて保存する
	// 実劣化サンプルは、鮮明さが低いほうから一定割合を取る。しきい値で切ると、
	// ブレたフレームが無い動画では1枚も残らず、比較対象が作れない。
	const ranked = withCards.slice().sort((a, b) => a.sharp - b.sharp);
	const blurry = ranked.slice(0, Math.max(1, Math.round(ranked.length * BLURRY_KEEP_RATIO)));
	const everyN = Math.max(1, Math.ceil(blurry.length / 30));
	let savedBlurry = 0;
	for (let i = 0; i < blurry.length; i += everyN) {
		await page.evaluate((tt) => window.__seek(tt), blurry[i].t);
		const dataUrl = await page.evaluate(() => window.__frame());
		await fs.writeFile(
			path.join(outBlurry, `${stem}-${String(Math.round(blurry[i].t * 1000)).padStart(6, '0')}.png`),
			Buffer.from(dataUrl.split(',')[1], 'base64')
		);
		savedBlurry++;
	}
	console.log(`  保存: 鮮明 ${savedSharp}枚 → frames/${setName}/ ／ 実劣化サンプル ${savedBlurry}枚 → frames-blurry/${setName}/`);

	return {
		file: path.basename(file),
		set: setName,
		channel,
		info,
		fps: Number((1 / (frames[1] ? frames[1].t - frames[0].t : 1)).toFixed(2)),
		frameCount: frames.length,
		threshold,
		sharpCount,
		sharpRatio: sharpCount / frames.length,
		keptCount: kept.length,
		keptSharpCount: keptSharp.length,
		savedSharp,
		savedBlurry,
		totalScroll,
		maxGap,
		gaps,
		frames
	};
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
