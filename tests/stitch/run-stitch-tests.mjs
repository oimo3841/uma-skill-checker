// 画像結合(exam.html の stitchOnePerson)の自動テストハーネス。
//
// test-images/ 配下のサブフォルダ1つを1ケースとして扱い、各ケース内の画像を
// 実際の exam.html をヘッドレスブラウザで開いて stitchOnePerson() に直接渡す
// (ロジックの複製は一切行わない = production コードをそのままテストする)。
//
// 結合前(入力サムネイル一覧)と結合後(結合結果 or エラー、警告、ログ)を
// 1枚に並べた比較画像を output/<case>/comparison.png に出力し、
// 全ケースをまとめて見られる output/index.html も生成する。
//
// 使い方:
//   npm run test:stitch
//
// test-images/ の構成は test-images/README.md を参照。

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildComparisonInPage } from './lib/browser-report.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TEST_IMAGES_DIR = path.join(ROOT, 'test-images');
const OUTPUT_DIR = path.join(ROOT, 'output');
const EXAM_HTML = path.join(ROOT, 'exam.html');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

// page.evaluate に渡す、実際の stitchOnePerson() 呼び出しラッパー。
// exam.html 側で定義済みの stitchOnePerson / devGeometry をそのまま利用する。
async function runStitchInPage({ files, groupLabel }) {
	async function dataUrlToFile(dataUrl, name) {
		const res = await fetch(dataUrl);
		const blob = await res.blob();
		return new File([blob], name, { type: blob.type });
	}
	const fileObjs = await Promise.all(files.map((f) => dataUrlToFile(f.dataUrl, f.name)));

	const beforeLen = devGeometry.length;
	let out;
	try {
		const canvas = await stitchOnePerson(fileObjs, groupLabel);
		out = {
			ok: true,
			dataUrl: canvas.toDataURL('image/png'),
			warnings: canvas._stitchWarnings || [],
		};
	} catch (e) {
		out = { ok: false, error: e && e.message ? e.message : String(e) };
	}
	out.log = devGeometry.slice(beforeLen);
	return out;
}

async function getImageDims(page, dataUrl) {
	return page.evaluate((src) => {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
			img.onerror = reject;
			img.src = src;
		});
	}, dataUrl);
}

async function runCase(page, testCase) {
	const inputs = [];
	for (const filePath of testCase.files) {
		const dataUrl = await fileToDataUrl(filePath);
		const dims = await getImageDims(page, dataUrl);
		inputs.push({ name: path.basename(filePath), dataUrl, width: dims.width, height: dims.height });
	}

	const start = Date.now();
	const result = await page.evaluate(runStitchInPage, {
		files: inputs.map((i) => ({ dataUrl: i.dataUrl, name: i.name })),
		groupLabel: testCase.name,
	});
	const elapsedMs = Date.now() - start;

	const caseOutDir = path.join(OUTPUT_DIR, testCase.name);
	if (result.ok) {
		await saveDataUrl(result.dataUrl, path.join(caseOutDir, 'stitched.png'));
	}

	const comparisonDataUrl = await page.evaluate(buildComparisonInPage, {
		caseName: testCase.name,
		inputs: inputs.map((i) => ({ dataUrl: i.dataUrl, name: i.name, width: i.width, height: i.height })),
		result,
	});
	await saveDataUrl(comparisonDataUrl, path.join(caseOutDir, 'comparison.png'));

	return {
		name: testCase.name,
		nInputs: inputs.length,
		ok: result.ok,
		error: result.error || null,
		warnings: result.warnings || [],
		elapsedMs,
		comparisonPath: path.join(caseOutDir, 'comparison.png'),
	};
}

async function writeIndexHtml(results) {
	const rows = results.map((r) => {
		const status = r.ok
			? '<span style="color:#1e7a1e;font-weight:600">OK</span>'
			: '<span style="color:#b31e1e;font-weight:600">ERROR</span>';
		const warn = r.warnings.length
			? `<span style="color:#8a6100;font-weight:600"> / ⚠ ${r.warnings.length}件警告</span>`
			: '';
		const relImg = path.relative(OUTPUT_DIR, r.comparisonPath).split(path.sep).join('/');
		return `
    <section style="margin-bottom:32px;border-bottom:1px solid #ddd;padding-bottom:24px;">
      <h2 style="font-family:sans-serif;font-size:18px;">
        ${escapeHtml(r.name)} &mdash; ${status}${warn}
        <span style="font-weight:400;color:#666;font-size:14px;">
          (${r.nInputs} inputs, ${r.elapsedMs}ms)
        </span>
      </h2>
      <img src="${escapeHtml(relImg)}" style="max-width:100%;border:1px solid #ccc;" />
    </section>`;
	});

	const body = rows.length
		? rows.join('\n')
		: '<p style="font-family:sans-serif;color:#666;">test-images/ にケースが見つかりませんでした。test-images/README.md を参照してください。</p>';

	const doc = `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>Image Stitch Test Report</title></head>
<body style="margin:24px;background:#fafafa;">
  <h1 style="font-family:sans-serif;">画像結合(exam.html / stitchOnePerson) テストレポート</h1>
  <p style="font-family:sans-serif;color:#666;">生成日時: ${new Date().toLocaleString('ja-JP')} / ケース数: ${results.length}</p>
  ${body}
</body>
</html>`;

	await fs.mkdir(OUTPUT_DIR, { recursive: true });
	await fs.writeFile(path.join(OUTPUT_DIR, 'index.html'), doc, 'utf-8');
}

async function main() {
	const cases = await discoverCases();
	await fs.mkdir(OUTPUT_DIR, { recursive: true });

	if (cases.length === 0) {
		console.log(`[警告] ${TEST_IMAGES_DIR} にテストケースが見つかりません。`);
		console.log('        (test-images/README.md を参照してケースを追加してください)');
		await writeIndexHtml([]);
		return;
	}

	const browser = await chromium.launch();
	const page = await browser.newPage();
	page.on('pageerror', (err) => console.error('[exam.html page error]', err.message));
	await page.goto(pathToFileURL(EXAM_HTML).href, { waitUntil: 'load' });

	const results = [];
	for (const c of cases) {
		process.stdout.write(`[実行中] ${c.name} (${c.files.length}枚) ... `);
		const r = await runCase(page, c);
		console.log(r.ok ? `OK (${r.elapsedMs}ms)${r.warnings.length ? ` [⚠${r.warnings.length}]` : ''}` : `ERROR: ${r.error}`);
		results.push(r);
	}

	await browser.close();
	await writeIndexHtml(results);

	const nError = results.filter((r) => !r.ok).length;
	const nWarn = results.filter((r) => r.ok && r.warnings.length).length;
	console.log(`\n完了: ${results.length}ケース中 ${nError}件エラー, ${nWarn}件警告あり`);
	console.log(`レポート: ${path.join(OUTPUT_DIR, 'index.html')}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
