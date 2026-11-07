// UmaStar（special.html）の青・赤因子の読み取り（T116。Deck α へ送るぶん）を、実画像と動画の見本で確かめる。
//
//   node tests/ocr/run-star-top-tests.mjs                   … test-images の直下のケース（expect.json の melopTop の blue・red）
//   node tests/ocr/run-star-top-tests.mjs --archive         … test-images/Archive のケースも読む（正解が無いケースは表に出すだけ）
//   node tests/ocr/run-star-top-tests.mjs --truth=<JSON>    … 正解を別のファイルから足す。形は { "<ケース名か 動画N-人の番号>": ["スピード", 3, "芝", 2] }
//   node tests/ocr/run-star-top-tests.mjs --video           … 動画の見本（test:video-local と同じ5本。素材が無ければ飛ばす）も③の流れで読み込んで読む
//   node tests/ocr/run-star-top-tests.mjs --videos=<a.mp4,b.mp4> … ほかの動画（PC の取り込みの録画など）も同じ流れで読む。番号は上の5本の続き（--video なしなら1から）
//   node tests/ocr/run-star-top-tests.mjs --images=<a.png,b.png> … 画像1枚を1人として読む（結合画像など）。名前はファイル名
//   node tests/ocr/run-star-top-tests.mjs --crops=<フォルダ> … 人ごとのいちばん上の段の切り出しを保存する（目で見る正解を作るため）
//
// 数えるもの: 読めた数・誤り（目標 0。誤りが1件でもあれば NG）・読めなかった数と OCR の文字列。読めなかっただけでは NG にしない。
// 関数は special.html の readTopBlueRed() を**そのまま**呼ぶ（OCR の設定は processImages と同じ）。
// 関数が exam.html の readMelopTopRow と同じ結果を出すことは、同じ画像を同じ正解で見る tests/ocr/run-melop-tests.mjs と揃う。
// OCR エンジンと日本語辞書は CDN から取るので、ネットワーク接続が要る。

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../visual/lib/serve.mjs';
import { assetsRoot } from '../skillset/lib/assets.mjs';
import { pickVideo } from '../visual/lib/video-entry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_IMAGES_DIR = path.join(ROOT, 'test-images');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);
const arg = (name, d) => { const h = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop(); return h ? h.slice(name.length + 3) : d; };
const has = (name) => process.argv.includes('--' + name);
const CROPS = arg('crops', '');
const VIDEOS = [
	'ScreenRecording_10-25-2026 17-06-21_1.MP4',
	'ScreenRecording_10-25-2026 17-11-41_1_Exam.MP4',
	'ScreenRecording_11-06-2026 16-57-05_1.MP4',
	'ScreenRecording_11-06-2026 16-58-38_1.MP4',
	'ScreenRecording_11-06-2026 16-59-47_1.MP4'
];

const truthFile = arg('truth', '');
const truth = truthFile ? JSON.parse(await fs.readFile(path.resolve(truthFile), 'utf-8')) : {};

async function imagesOf(dir) {
	const files = (await fs.readdir(dir)).filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase())).sort((a, b) => a.localeCompare(b));
	return files.map((f) => path.join(dir, f));
}
async function casesIn(dir, prefix) {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const out = [];
	for (const e of entries.filter((x) => x.isDirectory() && x.name !== 'Archive').sort((a, b) => a.name.localeCompare(b.name))) {
		const files = await imagesOf(path.join(dir, e.name));
		if (files.length === 0) continue;
		let expect = null;
		try { const j = JSON.parse(await fs.readFile(path.join(dir, e.name, 'expect.json'), 'utf-8')); if (j.melopTop) expect = [j.melopTop.blue[0], j.melopTop.blue[1], j.melopTop.red[0], j.melopTop.red[1]]; } catch {}
		const name = prefix + e.name;
		out.push({ name, files, expect: truth[name] || expect });
	}
	return out;
}

/** ページの中: 1人分の File の配列を読む。切り出しも返す */
const PAGE_HELPER = () => {
	window.__readTop = async (files) => {
		const worker = await Tesseract.createWorker();
		await worker.loadLanguage('jpn');
		await worker.initialize('jpn');
		await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' });
		try {
			const top = await readTopBlueRed(worker, files);
			let crop = null;
			for (const f of files) {
				const base = toBaseCanvas(await loadImage(f));
				const L = findMelopTopLayout(base);
				if (!L) continue;
				const c = document.createElement('canvas');
				const y0 = Math.max(0, L.row1 - Math.round(L.h * 0.3)), hh = Math.min(L.H - y0, Math.round(L.h * 1.9));
				c.width = L.W; c.height = hh;
				c.getContext('2d').drawImage(base, 0, y0, L.W, hh, 0, 0, L.W, hh);
				crop = c.toDataURL('image/png');
				break;
			}
			return { top, crop };
		} finally { await worker.terminate(); }
	};
};

const srv = await startServer();
const results = [];
const judge = (name, r, expect) => {
	const top = r.top;
	const row = { name, blue: top && top.blue ? top.blue.name : null, blueStars: top && top.blue ? top.blue.stars : null, blueText: top && top.blue ? top.blue.text : '',
		red: top && top.red ? top.red.name : null, redStars: top && top.red ? top.red.stars : null, redText: top && top.red ? top.red.text : '', found: !!top, expect };
	row.errs = [];
	if (expect) {
		if (row.blue && row.blue !== expect[0]) row.errs.push('青の名前');
		if (row.blue && row.blueStars > 0 && row.blueStars !== expect[1]) row.errs.push('青の★');
		if (row.red && row.red !== expect[2]) row.errs.push('赤の名前');
		if (row.red && row.redStars > 0 && row.redStars !== expect[3]) row.errs.push('赤の★');
		row.miss = [!row.blue && '青の名前', row.blue && !(row.blueStars > 0) && '青の★', !row.red && '赤の名前', row.red && !(row.redStars > 0) && '赤の★'].filter(Boolean);
	}
	results.push(row);
	const a = (n, s, t) => (n || '読めず「' + t + '」') + '★' + s;
	console.log(`${row.errs.length ? '[NG]' : expect ? '[OK]' : '[--]'} ${name}: ${top ? '青 ' + a(row.blue, row.blueStars, row.blueText) + ' / 赤 ' + a(row.red, row.redStars, row.redText) : '段が見つからない'}${expect ? '  正解 ' + expect.join(' ') : ''}${row.errs.length ? ' 誤り:' + row.errs.join('・') : ''}${row.miss && row.miss.length ? ' 読めず:' + row.miss.join('・') : ''}`);
};
const saveCrop = async (name, crop) => {
	if (!CROPS || !crop) return;
	await fs.mkdir(CROPS, { recursive: true });
	await fs.writeFile(path.join(CROPS, name.replace(/[\\/:]/g, '_') + '.png'), Buffer.from(crop.split(',')[1], 'base64'));
};

// 静止画
{
	const browser = await chromium.launch();
	const page = await browser.newPage();
	page.on('pageerror', (e) => console.log('[page error]', e.message));
	await page.goto(srv.base + '/special.html');
	await page.waitForFunction(() => typeof readTopBlueRed === 'function' && window.Tesseract);
	await page.evaluate(PAGE_HELPER);
	const cases = (has('no-cases') ? [] : await casesIn(TEST_IMAGES_DIR, '')).concat(has('archive') ? await casesIn(path.join(TEST_IMAGES_DIR, 'Archive'), 'Archive/') : [])
		.concat(arg('images', '').split(',').filter(Boolean).map((f) => ({ name: path.basename(f), files: [f], expect: truth[path.basename(f)] || null })));
	for (const c of cases) {
		const data = [];
		for (const f of c.files) data.push({ name: path.basename(f), b64: (await fs.readFile(f)).toString('base64'), type: f.endsWith('.jpg') ? 'image/jpeg' : 'image/png' });
		const r = await page.evaluate(async (list) => window.__readTop(await Promise.all(list.map(async (x) => new File([await (await fetch('data:' + x.type + ';base64,' + x.b64)).blob()], x.name, { type: x.type })))), data);
		judge(c.name, r, c.expect);
		await saveCrop(c.name, r.crop);
	}
	await browser.close();
}

// 動画（iPhone の収録は HEVC なので channel: 'chrome'）
const extraVideos = arg('videos', '').split(',').filter(Boolean);
if (has('video') || extraVideos.length) {
	let root = null;
	if (has('video')) { try { root = assetsRoot(); } catch (e) { console.log('[飛ばした] 素材フォルダが設定されていない'); } }
	const list = (root ? VIDEOS.map((v) => path.join(root, v)) : []).concat(extraVideos);
	if (list.length) {
		const browser = await chromium.launch({ channel: 'chrome' });
		for (let n = 0; n < list.length; n++) {
			const file = list[n];
			if (!(await fs.stat(file).catch(() => null))) { console.log('[飛ばした] 動画' + (n + 1)); continue; }
			const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
			const page = await ctx.newPage();
			page.setDefaultTimeout(600000);
			page.on('pageerror', (e) => console.log('[page error]', e.message));
			await page.addInitScript(() => localStorage.setItem('umaSkillDeck:stepTab', '2'));
			await page.goto(srv.base + '/special.html');
			await page.waitForTimeout(1500);
			for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
			await page.evaluate(() => selectStepTab(2));
			await page.evaluate(PAGE_HELPER);
			const chooser = await pickVideo(page);
			await chooser.setFiles(file);
			await page.waitForSelector('#personset-A-wrap .video-result, #video-error', { timeout: 600000 });
			for (let p = 0; p < 3; p++) {
				const name = '動画' + (n + 1) + '-' + p;
				const r = await page.evaluate((i) => window.__readTop(persons[i].files), p);
				judge(name, r, truth[name] || null);
				await saveCrop(name, r.crop);
			}
			await ctx.close();
		}
		await browser.close();
	}
}
await srv.close();

const judged = results.filter((r) => r.expect);
const errs = results.reduce((n, r) => n + r.errs.length, 0);
const misses = judged.reduce((n, r) => n + r.miss.length, 0);
console.log(`\n人 ${results.length}（正解あり ${judged.length}）・誤り ${errs}・読めなかった ${misses}（青赤の名前と★の4項目×人のうち）`);
process.exit(errs ? 1 : 0);
