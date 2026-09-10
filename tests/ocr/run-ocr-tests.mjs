// OCR（processPersonImages + matchAllSkillsWithStars）の自動テストハーネス。
//
// 画像結合ハーネス(tests/stitch/)と同じく test-images/ 配下のサブフォルダ1つを
// 「1人分」として扱い、実際のツールHTMLをヘッドレスブラウザで開いて
// 中の OCR 処理をそのまま呼び出す(ロジックの複製は一切行わない)。
//
// 使い方:
//   npm run test:ocr                          … exam.html / 133種リスト / 元画像
//   npm run test:ocr -- --stitched            … 先に画像結合してから、その結合結果をOCR
//   npm run test:ocr -- --page=special        … special.html を対象にする
//   npm run test:ocr -- --dict=deck           … uma-skill-deck-skills.json の全スキルを照合辞書に
//   npm run test:ocr -- --dict=連綿,存在感    … 指定したスキル名だけを照合辞書に
//   npm run test:ocr -- --expect=連綿,存在感  … 検出されるべきスキルを指定し、合否を判定する
//   npm run test:ocr -- --errdict=連締=連綿   … special.html の「読み替え辞書」と同じ補正を効かせる
//
// 出力:
//   コンソールに検出スキル一覧・★・診断ログ・エラーを表示し、
//   output/ocr/<case>/ に OCR に渡した整形画像・OCR生行・結果JSONを保存する。

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TEST_IMAGES_DIR = path.join(ROOT, 'test-images');
const OUTPUT_DIR = path.join(ROOT, 'output', 'ocr');
const DECK_MASTER = path.join(ROOT, 'uma-skill-deck-skills.json');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);

function argValue(name, fallback) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
}

const USE_STITCHED = process.argv.includes('--stitched');
const PAGE_NAME = argValue('page', 'exam') === 'special' ? 'special.html' : 'exam.html';
const DICT_ARG = argValue('dict', null);
const EXPECT_ARG = argValue('expect', null);
const ERRDICT_ARG = argValue('errdict', null);
const EXPECTED = EXPECT_ARG ? EXPECT_ARG.split(',').map((s) => s.trim()).filter(Boolean) : null;
// 「誤読された文字列=正しいスキル名」を , 区切りで並べる（special.html の読み替え辞書と同じ働き）
const ERRDICT = ERRDICT_ARG
	? Object.fromEntries(
			ERRDICT_ARG.split(',')
				.map((pair) => pair.split('=').map((s) => s.trim()))
				.filter((kv) => kv.length === 2 && kv[0] && kv[1])
		)
	: {};

async function resolveDictionary() {
	if (!DICT_ARG) return null; // ページ側の既定の照合対象をそのまま使う
	if (DICT_ARG === 'deck') {
		const json = JSON.parse(await fs.readFile(DECK_MASTER, 'utf-8'));
		return (json.skills || json).map((s) => s.name || String(s));
	}
	return DICT_ARG.split(',').map((s) => s.trim()).filter(Boolean);
}

async function discoverCases() {
	let entries;
	try {
		entries = await fs.readdir(TEST_IMAGES_DIR, { withFileTypes: true });
	} catch {
		return [];
	}
	const cases = [];
	for (const e of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
		const dir = path.join(TEST_IMAGES_DIR, e.name);
		const files = (await fs.readdir(dir))
			.filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
			.sort((a, b) => a.localeCompare(b));
		if (files.length > 0) cases.push({ name: e.name, files: files.map((f) => path.join(dir, f)) });
	}
	return cases;
}

async function fileToDataUrl(filePath) {
	const buf = await fs.readFile(filePath);
	const ext = path.extname(filePath).toLowerCase();
	const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
	return `data:${mime};base64,${buf.toString('base64')}`;
}

async function saveDataUrl(dataUrl, filePath) {
	const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
}

// page.evaluate に渡す、実際の OCR 呼び出しラッパー。
// ページ側で定義済みの processPersonImages / matchAllSkillsWithStars を
// そのまま利用する。
async function runOcrInPage({ files, groupLabel, useStitched, dictNames, errDict }) {
	async function dataUrlToFile(dataUrl, name) {
		const res = await fetch(dataUrl);
		const blob = await res.blob();
		return new File([blob], name, { type: blob.type });
	}
	let fileObjs = await Promise.all(files.map((f) => dataUrlToFile(f.dataUrl, f.name)));

	const beforeLen = devGeometry.length;
	const out = { stitchError: null, ocrError: null, workerError: null };

	if (useStitched) {
		try {
			const canvas = await stitchOnePerson(fileObjs, groupLabel);
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			fileObjs = [new File([blob], 'stitched.png', { type: 'image/png' })];
			out.stitchWarnings = canvas._stitchWarnings || [];
		} catch (e) {
			out.stitchError = String((e && e.message) || e);
			out.log = devGeometry.slice(beforeLen);
			return out;
		}
	}

	// 照合辞書。指定がなければページ側の既定(exam.htmlなら133種)をそのまま使う。
	let list, index;
	if (dictNames) {
		const dict = buildSkillDictionary(dictNames);
		list = dict.list;
		index = dict.index;
	} else {
		list = skillList;
		index = skillIndex;
	}
	out.dictSize = list.length;

	let worker = null;
	try {
		worker = await Tesseract.createWorker();
		await worker.loadLanguage('jpn');
		await worker.initialize('jpn');
		await worker.setParameters({
			tessedit_pageseg_mode: '6',
			preserve_interword_spaces: '1',
			user_defined_dpi: '300',
		});
	} catch (e) {
		out.workerError = String((e && e.message) || e);
		out.log = devGeometry.slice(beforeLen);
		return out;
	}

	try {
		previewCanvases = [];
		const result = await processPersonImages(worker, fileObjs, groupLabel, true, true, true);
		const matched = matchAllSkillsWithStars(result.lines, list, index, errDict || {});
		const detected = Array.from(matched.detectedSkills);
		out.nLines = result.lines.length;
		out.skipped = result.skipped;
		out.detected = detected.map((name) => ({ name: name, stars: matched.skillStars[name] }));
		// 「なぜ検出されなかったのか」を追えるよう、OCRが実際に読んだ生テキストを残す。
		out.rawLines = result.lines.map((l) => ({ text: l.text, norm: normalizeText(l.text), stars: l.stars }));
		out.previews = previewCanvases.map((p) => ({ name: p.name, dataUrl: p.canvas.toDataURL('image/png') }));
	} catch (e) {
		out.ocrError = String((e && e.stack) || (e && e.message) || e);
	} finally {
		try { await worker.terminate(); } catch (e) {}
	}
	out.log = devGeometry.slice(beforeLen);
	return out;
}

async function main() {
	const cases = await discoverCases();
	if (cases.length === 0) {
		console.log(`[警告] ${TEST_IMAGES_DIR} にテストケースが見つかりません。`);
		return;
	}
	const dictNames = await resolveDictionary();

	const browser = await chromium.launch();
	const page = await browser.newPage();
	const pageErrors = [];
	const consoleErrors = [];
	page.on('pageerror', (err) => pageErrors.push(err.message));
	page.on('console', (m) => {
		if (m.type() === 'error') consoleErrors.push(m.text());
	});
	page.on('requestfailed', (r) => consoleErrors.push(`[requestfailed] ${r.url()} : ${r.failure()?.errorText}`));
	await page.goto(pathToFileURL(path.join(ROOT, PAGE_NAME)).href, { waitUntil: 'load' });

	console.log(`対象ページ: ${PAGE_NAME}`);
	console.log(`モード: ${USE_STITCHED ? '画像結合してからOCR' : '元画像をそのままOCR'}`);
	console.log(`照合辞書: ${dictNames ? `指定 ${dictNames.length}件` : 'ページ既定'}`);
	console.log(`読み替え辞書: ${Object.keys(ERRDICT).length}件\n`);

	let failed = 0;
	for (const c of cases) {
		const inputs = [];
		for (const filePath of c.files) {
			inputs.push({ name: path.basename(filePath), dataUrl: await fileToDataUrl(filePath) });
		}

		process.stdout.write(`[実行中] ${c.name} (${inputs.length}枚) ... `);
		const errBase = pageErrors.length;
		const conBase = consoleErrors.length;
		const start = Date.now();
		const result = await page.evaluate(runOcrInPage, {
			files: inputs,
			groupLabel: c.name,
			useStitched: USE_STITCHED,
			dictNames: dictNames,
			errDict: ERRDICT,
		});
		const elapsed = Date.now() - start;

		const fatal = result.stitchError || result.workerError || result.ocrError;
		console.log(fatal ? `ERROR (${elapsed}ms)` : `OK (${elapsed}ms) 検出${result.detected.length}件`);

		const outDir = path.join(OUTPUT_DIR, c.name);
		await fs.mkdir(outDir, { recursive: true });
		for (const p of result.previews || []) {
			await saveDataUrl(p.dataUrl, path.join(outDir, p.name.replace(/[\\/:*?"<>|]/g, '_') + '.png'));
		}
		const json = Object.assign({}, result);
		delete json.previews;
		json.pageErrors = pageErrors.slice(errBase);
		json.consoleErrors = consoleErrors.slice(conBase);
		await fs.writeFile(path.join(outDir, 'result.json'), JSON.stringify(json, null, 2), 'utf-8');

		if (result.stitchError) console.log(`  画像結合エラー: ${result.stitchError}`);
		if (result.workerError) console.log(`  OCRエンジン初期化エラー: ${result.workerError}`);
		if (result.ocrError) console.log(`  OCRエラー: ${result.ocrError}`);
		for (const s of result.skipped || []) {
			console.log(`  [スキップ] ${s.name}: ${s.reasons.join(' / ')}`);
		}
		if (result.detected) {
			console.log(`  OCR行数: ${result.nLines} / 照合辞書: ${result.dictSize}件`);
			console.log(`  検出スキル(${result.detected.length}件):`);
			for (const d of result.detected) {
				console.log(`    - ${d.name} (${d.stars == null ? '★不明' : '★' + d.stars})`);
			}
			if (EXPECTED) {
				const got = new Set(result.detected.map((d) => d.name));
				const missing = EXPECTED.filter((e) => !got.has(e));
				if (missing.length) {
					failed++;
					console.log(`  ✗ 検出されるべきスキルが出ていません: ${missing.join(', ')}`);
					// 取りこぼしの原因追跡用に、それらしいOCR生行を並べて見せる。
					for (const m of missing) {
						const near = (result.rawLines || [])
							.filter((l) => l.text && l.text.replace(/\s/g, '').length > 0)
							.map((l) => ({ l: l, score: [...m].filter((ch) => l.text.includes(ch)).length }))
							.sort((a, b) => b.score - a.score)
							.slice(0, 3)
							.filter((x) => x.score > 0);
						console.log(`    「${m}」に近いOCR生行:`);
						if (near.length === 0) console.log('      (該当なし)');
						for (const x of near) console.log(`      "${x.l.text.replace(/\n/g, ' ')}" → 正規化 "${x.l.norm}"`);
					}
				} else {
					console.log(`  ✓ 期待したスキル ${EXPECTED.length}件はすべて検出されました`);
				}
			}
		}
		for (const line of result.log || []) console.log('  | ' + line.replace(/\n/g, '\n  | '));
		for (const e of json.pageErrors) console.log(`  [page error] ${e}`);
		for (const e of json.consoleErrors) console.log(`  [console error] ${e}`);
		console.log('');
	}

	await browser.close();
	console.log(`結果JSON/整形画像: ${OUTPUT_DIR}`);
	if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
