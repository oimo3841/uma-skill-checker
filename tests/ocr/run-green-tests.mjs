// UmaStar（special.html）と UmaExam（exam.html。関数は special の写し。T104）の緑因子（継承固有）の読み取り（T92・Deck α へ送るときに使う）を、実画像で確かめる。
//
//   node tests/ocr/run-green-tests.mjs                     … test-images の直下のケース（expect.json の green）
//   node tests/ocr/run-green-tests.mjs --truth=<JSONファイル>
//                                                         … 期待値を expect.json ではなく別のファイルから読む（Archive の素材で測るとき）。
//                                                           形は { "<test-images からの相対パス>": ["<固有スキルの名前>", ★] }
//   node tests/ocr/run-green-tests.mjs --degrade=0.6        … 画像を縮めて JPEG（品質 0.6）にしてから読む（画質が落ちたときに誤りが出ないかを見る）
//
// 各ページの readGreenFactor() を**そのまま**呼ぶ（ロジックは複製しない）。2ページとも同じ期待値で確かめ、どちらかが NG なら NG。
// 期待値は各ケースの test-images/<ケース>/expect.json の green（書き方は test-images/README.md の melopTop と同じ考え方）:
//   "green": ["<固有スキルの名前>", ★]
// 数えるもの: 名前を読めた人数（読めた割合）・誤った名前の件数（目標 0。誤った名前を入れるより null を優先する）・★の一致。
// **誤りが1件でもあれば NG**。読めなかった（null）だけでは NG にしない。期待値と照合できたケースが0件なら NG。
// ケース名・スキル名はこのファイルに書かない（test:stitch の expect.json と同じ考え方）。
//
// 育成ウマ娘のデータ（data/training-umamusume.json）を fetch するので、file:// ではなく http で開く。
// OCR エンジン（tesseract.js）と日本語辞書は CDN から取るので、ネットワーク接続が要る。

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../visual/lib/serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TEST_IMAGES_DIR = path.join(ROOT, 'test-images');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}
const TRUTH_FILE = argValue('truth', null);
const DEGRADE = Number(argValue('degrade', '0')) || 0;

async function imagesOf(dir) {
	const files = (await fs.readdir(dir)).filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
		.sort((a, b) => a.localeCompare(b));
	return files.map((f) => path.join(dir, f));
}

/** [{ name, files, expect: [名前, ★]|null }] */
async function discoverCases() {
	if (TRUTH_FILE) {
		const truth = JSON.parse(await fs.readFile(path.resolve(ROOT, TRUTH_FILE), 'utf-8'));
		const out = [];
		for (const [rel, t] of Object.entries(truth)) out.push({ name: rel, files: await imagesOf(path.join(TEST_IMAGES_DIR, rel)), expect: t });
		return out;
	}
	const entries = await fs.readdir(TEST_IMAGES_DIR, { withFileTypes: true }).catch(() => []);
	const out = [];
	for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
		const dir = path.join(TEST_IMAGES_DIR, e.name);
		const files = await imagesOf(dir);
		if (files.length === 0) continue;
		let expect = null;
		try { expect = JSON.parse(await fs.readFile(path.join(dir, 'expect.json'), 'utf-8')).green || null; } catch {}
		out.push({ name: e.name, files, expect });
	}
	return out;
}

async function runInPage({ files, degrade }) {
	let fileObjs = await Promise.all(files.map(async (f) => new File([await (await fetch(f.dataUrl)).blob()], f.name, { type: f.type })));
	if (degrade > 0) {
		fileObjs = await Promise.all(fileObjs.map(async (f) => {
			const bm = await createImageBitmap(f);
			const c = document.createElement('canvas');
			c.width = Math.round(bm.width * degrade); c.height = Math.round(bm.height * degrade);
			c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
			const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.6));
			return new File([b], f.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
		}));
	}
	const worker = await Tesseract.createWorker();
	await worker.loadLanguage('jpn');
	await worker.initialize('jpn');
	// special.html の processImages() と同じ設定
	await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' });
	try {
		return await readGreenFactor(worker, fileObjs);
	} finally {
		await worker.terminate();
	}
}

const cases = await discoverCases();
if (cases.length === 0) {
	console.log(`[警告] ${TEST_IMAGES_DIR} にテストケースが見つかりません。`);
	process.exit(0);
}
const srv = await startServer();
const browser = await chromium.launch();
const pageErrors = [];
let ok = true;
for (const pageFile of ['special.html', 'exam.html']) {
const page = await browser.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(srv.base + '/' + pageFile, { waitUntil: 'load' });
if (pageFile === 'special.html') {
	await page.waitForFunction(() => window.Tesseract && window.UmaSkillDeckCore);
	await page.evaluate(() => UmaSkillDeckCore.loadTrainingSources(false));
} else {
	await page.waitForFunction(() => window.Tesseract && typeof loadGreenNames === 'function');
	await page.evaluate(() => loadGreenNames());
}

console.log('\n' + pageFile + ' の緑因子（継承固有）の読み取り' + (TRUTH_FILE ? '（期待値: ' + TRUTH_FILE + '）' : '') + (DEGRADE ? '（画像を ' + DEGRADE + ' 倍に縮めて JPEG）' : '') + '\n');
let compared = 0, named = 0, wrong = 0, starOk = 0, starN = 0;
const wrongCases = [], noExpect = [];
for (const c of cases) {
	const inputs = [];
	for (const f of c.files) {
		const ext = path.extname(f).toLowerCase();
		const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
		inputs.push({ name: path.basename(f), type, dataUrl: `data:${type};base64,${(await fs.readFile(f)).toString('base64')}` });
	}
	const r = await page.evaluate(runInPage, { files: inputs, degrade: DEGRADE });
	const got = r ? { name: r.name, stars: r.stars, cands: r.cands } : null;
	const line = `  読み ${JSON.stringify(got)}${r ? ' / OCR ' + JSON.stringify(r.texts) : '（いちばん上の段が見つからない）'}`;
	if (!c.expect) { noExpect.push(c.name); console.log(`[期待値なし] ${c.name}\n${line}`); continue; }
	compared++;
	const [wantName, wantStars] = c.expect;
	let mark = '[読めない]';
	if (got && got.name) {
		named++;
		if (got.name === wantName) mark = '[OK]'; else { wrong++; wrongCases.push(c.name); mark = '[誤り]'; }
	} else if (got && got.cands && got.cands.includes(wantName)) mark = '[候補に正解]';
	if (got && typeof got.stars === 'number' && got.stars > 0) { starN++; if (got.stars === wantStars) starOk++; else mark += '（★ 読み ' + got.stars + ' / 期待 ' + wantStars + '）'; }
	console.log(`${mark} ${c.name}\n${line}`);
}
await page.close();

console.log(`\n名前を読めた ${named}/${compared}人・誤った名前 ${wrong}件・★の一致 ${starOk}/${starN}`);
if (wrongCases.length) console.log('誤り: ' + wrongCases.join('・'));
if (noExpect.length) console.log(`!! 期待値の無いケース（数えていない）: ${noExpect.join('・')} !!`);
if (compared === 0) console.log('照合できたケースが0件（期待値が1つも無い）');
if (!(compared > 0 && wrong === 0 && starOk === starN)) ok = false;
}
await browser.close();
await srv.close();
pageErrors.forEach((e) => console.log('[page error] ' + e));
if (pageErrors.length) ok = false;
console.log(ok ? '=== 緑因子: OK ===' : '=== 緑因子: NG ===');
process.exit(ok ? 0 : 1);
