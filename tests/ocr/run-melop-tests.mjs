// めろっぷ！【LTC】専用拡張モード（exam.html・C-101）の「いちばん上の段」の読み取りを、実画像で確かめる。
//
//   npm run test:ocr                       … run-ocr-tests.mjs のあとに続けて回る
//   node tests/ocr/run-melop-tests.mjs     … これだけ回す
//   node tests/ocr/run-melop-tests.mjs --truth=<JSONファイル>
//                                          … 期待値を expect.json ではなく別のファイルから読む（Archive の素材で精度を測るとき）。
//                                            形は { "<test-images からの相対パス>": [青, 青の★, 赤, 赤の★, 固有の★, 右隣, 右隣の★] }
//
// いちばん上の段（青因子・赤因子・固有・固有の右隣）は、いつもの読み取り（detectSkillRows の listTop より下）
// では読まない。拡張モードのときだけ exam.html の readMelopTopRow() が別に読む。その関数を**そのまま**呼ぶ
// （ロジックは複製しない）。右隣の名前は matchMelopLines()（562行の名前の辞書での照合）で決める。
//
// 期待値は各ケースの test-images/<ケース>/expect.json の melopTop（書き方は test-images/README.md）:
//   { "blue": ["<名前>", ★], "red": ["<名前>", ★], "unique": ★, "right": ["<名前>", ★] }
// 任意で melopRows（C-101 の追記）: { "<シートの行番号>": ★ か "?" か null } ―― いつもの OCR の行まで読んで
//   562行の照合を通し、その行の値を見る（null はその行が空欄であること。例: マイルCS南部杯の★がマイルCS の行に入らない）。
// **期待値の無いケースは合格にしない**（[期待値なし] と出す）。照合できたケースが0件なら NG。
// ケース名・スキル名はこのファイルに書かない（test:stitch の expect.json と同じ考え方）。
//
// 並びのデータ（data/melop-sheet-rows.json）を fetch するので、file:// ではなく http で開く。
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

async function imagesOf(dir) {
	const files = (await fs.readdir(dir)).filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
		.sort((a, b) => a.localeCompare(b));
	return files.map((f) => path.join(dir, f));
}

/** [{ name, files, expect|null }] */
async function discoverCases() {
	if (TRUTH_FILE) {
		const truth = JSON.parse(await fs.readFile(path.resolve(ROOT, TRUTH_FILE), 'utf-8'));
		const out = [];
		for (const [rel, t] of Object.entries(truth)) {
			out.push({ name: rel, files: await imagesOf(path.join(TEST_IMAGES_DIR, rel)),
				expect: { blue: [t[0], t[1]], red: [t[2], t[3]], unique: t[4], right: [t[5], t[6]] } });
		}
		return out;
	}
	const entries = await fs.readdir(TEST_IMAGES_DIR, { withFileTypes: true }).catch(() => []);
	const out = [];
	for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
		const dir = path.join(TEST_IMAGES_DIR, e.name);
		const files = await imagesOf(dir);
		if (files.length === 0) continue;
		let expect = null, rows = null;
		try {
			const j = JSON.parse(await fs.readFile(path.join(dir, 'expect.json'), 'utf-8'));
			expect = j.melopTop || null;
			rows = j.melopRows || null;
		} catch {}
		out.push({ name: e.name, files, expect, rows });
	}
	return out;
}

async function runInPage({ files, rowsWanted }) {
	const fileObjs = await Promise.all(files.map(async (f) => new File([await (await fetch(f.dataUrl)).blob()], f.name, { type: f.type })));
	const sheet = await loadMelopSheet();
	const worker = await Tesseract.createWorker();
	await worker.loadLanguage('jpn');
	await worker.initialize('jpn');
	// exam.html の processImages() と同じ設定
	await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' });
	try {
		const top = await readMelopTopRow(worker, fileObjs, sheet);
		const res = matchMelopLines(top.extraLines, sheet);
		const right = Array.from(res.detectedSkills).map((n) => ({ name: sheet.rowByDictName[n].name, stars: res.skillStars[n] }));
		// melopRows があるケースだけ、いつもの OCR の行も読んで 562行の照合まで通す（exam の processImages と同じ組み立て）
		let rows = null;
		if (rowsWanted) {
			const ocr = await processPersonImages(worker, fileObjs, 'melop', true, true, false);
			const all = matchMelopLines(ocr.lines.concat(top.extraLines), sheet);
			rows = {};
			all.detectedSkills.forEach((n) => { rows[sheet.rowByDictName[n].row] = all.skillStars[n] === null ? '?' : all.skillStars[n]; });
		}
		return { found: top.found, file: top.file, blue: top.blue, red: top.red, unique: top.uniqueStars, right,
			rightText: top.extraLines.map((l) => l.text), rows };
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
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(srv.base + '/exam.html', { waitUntil: 'load' });

console.log('めろっぷ！【LTC】専用拡張モード: いちばん上の段の読み取り' + (TRUTH_FILE ? '（期待値: ' + TRUTH_FILE + '）' : '') + '\n');
let compared = 0, items = 0, itemsOk = 0;
const failed = [], noExpect = [];
for (const c of cases) {
	const inputs = [];
	for (const f of c.files) {
		const ext = path.extname(f).toLowerCase();
		const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
		inputs.push({ name: path.basename(f), type, dataUrl: `data:${type};base64,${(await fs.readFile(f)).toString('base64')}` });
	}
	const r = await page.evaluate(runInPage, { files: inputs, rowsWanted: !!c.rows });
	const got = {
		blue: r.blue ? [r.blue.name, r.blue.stars] : null,
		red: r.red ? [r.red.name, r.red.stars] : null,
		unique: r.unique,
		right: r.right.length === 1 ? [r.right[0].name, r.right[0].stars] : r.right.map((x) => x.name),
	};
	const line = `  青 ${JSON.stringify(got.blue)} / 赤 ${JSON.stringify(got.red)} / 固有★${got.unique} / 右隣 ${JSON.stringify(got.right)}`;
	if (!c.expect) {
		noExpect.push(c.name);
		console.log(`[期待値なし] ${c.name}（${r.found ? r.file : 'いちばん上の段が見つからない'}）\n${line}`);
		continue;
	}
	compared++;
	const e = c.expect;
	const checks = [
		['青の名前', got.blue && got.blue[0], e.blue[0]], ['青の★', got.blue && got.blue[1], e.blue[1]],
		['赤の名前', got.red && got.red[0], e.red[0]], ['赤の★', got.red && got.red[1], e.red[1]],
		['固有の★', got.unique, e.unique],
		['右隣の名前', Array.isArray(got.right) && typeof got.right[1] === 'number' ? got.right[0] : JSON.stringify(got.right), e.right[0]],
		['右隣の★', Array.isArray(got.right) && typeof got.right[1] === 'number' ? got.right[1] : null, e.right[1]],
	];
	// melopRows: { "<行番号>": ★ か "?" か null（null＝その行は空欄であること） }
	if (c.rows) {
		for (const [row, want] of Object.entries(c.rows)) {
			const g = r.rows[row] === undefined ? null : r.rows[row];
			checks.push([row + '行目（562行の照合）', g, want]);
		}
	}
	const ng = checks.filter(([, g, w]) => g !== w);
	items += checks.length;
	itemsOk += checks.length - ng.length;
	if (ng.length) failed.push(c.name);
	console.log(`${ng.length ? '[NG]' : '[OK]'} ${c.name}（${r.found ? r.file : 'いちばん上の段が見つからない'}）\n${line}`);
	ng.forEach(([label, g, w]) => console.log(`    ✗ ${label}: 読み ${JSON.stringify(g)} / 期待 ${JSON.stringify(w)}`));
	if (ng.some(([label]) => label.startsWith('右隣'))) console.log('    右隣の OCR: ' + JSON.stringify(r.rightText));
}
await browser.close();
await srv.close();

console.log(`\n項目 ${itemsOk}/${items}（${compared}ケース。青・赤の名前と★・固有の★・固有の右隣の名前と★の7項目ずつ。melopRows のあるケースはその行も）`);
if (noExpect.length) console.log(`!! 期待値の無いケース（合格にしていない）: ${noExpect.join('・')} !!`);
pageErrors.forEach((e) => console.log('[page error] ' + e));
const ok = compared > 0 && failed.length === 0 && pageErrors.length === 0;
if (compared === 0) console.log('照合できたケースが0件（期待値が1つも無い）');
console.log(ok ? '=== めろっぷ（いちばん上の段）: OK ===' : '=== めろっぷ（いちばん上の段）: NG ===');
process.exit(ok ? 0 : 1);
