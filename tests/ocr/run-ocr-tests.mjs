// OCR（processPersonImages + matchAllSkillsWithStars）の自動テストハーネス。
//
// 画像結合ハーネス(tests/stitch/)と同じく test-images/ 配下のサブフォルダ1つを
// 「1人分」として扱い、実際のツールHTMLをヘッドレスブラウザで開いて
// 中の OCR 処理をそのまま呼び出す(ロジックの複製は一切行わない)。
//
// 使い方:
//   npm run test:ocr                          … exam.html / 組み込み133種（--dict=exam）/ 元画像
//   npm run test:ocr -- --stitched            … 先に画像結合してから、その結合結果をOCR
//   npm run test:ocr -- --page=special        … special.html を対象にする
//   npm run test:ocr -- --dict=exam           … exam.html の組み込み133種を照合辞書に（npm script の既定）
//   npm run test:ocr -- --dict=deck           … uma-skill-deck-skills.json の全スキルを照合辞書に
//   npm run test:ocr -- --dict=page           … ページ側が起動時に持つ skillList をそのまま照合辞書に
//   npm run test:ocr -- --dict=連綿,存在感    … 指定したスキル名だけを照合辞書に
//   npm run test:ocr -- --dict=deck+catalog   … 上の辞書に「追加カタログ」（catalog-data/*.json）を足す
//   npm run test:ocr -- --no-catalog-exact-only … 追加カタログの後段の絞り込みを外す（調査用）
//   npm run test:ocr -- --expect=連綿,存在感  … 検出されるべきスキルを指定し、合否を判定する
//   npm run test:ocr -- --errdict=連締=連綿   … special.html の「読み替え辞書」と同じ補正を効かせる
//
// 同じオプションを2回渡したときは後のものが勝つ（npm script が付ける既定の --dict=exam を、
// `npm run test:ocr -- --dict=deck` のように上書きできるようにするため）。
//
// 追加カタログ（`+catalog`）について:
//   シナリオ因子のように「445種のマスターには載らないが、因子画面には出るもの」は
//   catalog-data/*.json に別カテゴリとして置いてある（C-29）。辞書名の末尾に `+catalog` を
//   付けると、そのファイル群の名前を辞書に足す。
//   **製品（exam.html）は照合のあと applyScenarioFactorExactOnly() で「行にその名前が
//   そのまま入っているものだけ」に絞る**ので、ここでも同じ絞り込みを既定で掛ける
//   （シナリオ名どうしは1〜2文字しか違わず、あいまい一致に任せると互いに化けるため）。
//   絞り込みで落ちたぶんは「あいまい一致では当たったが完全一致では落ちた」ものとして表示する。
//   --no-catalog-exact-only を付けると絞り込みを外せる（どこまで拾えているかを見る調査用）。
//
// 「ページ側の skillList をそのまま使う」を既定にしていない理由:
//   exam.html の既定が新UI（Deck から対象スキルセットを選ぶ）になると、file:// では
//   マスターが読めず skillList が空か組み込みサンプル3件になり、テストが黙って別の対象で
//   走ってしまう（F-29③と同型）。技能試験の133種で照合したいことを常に明示する。
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
// 追加カタログ（マスター445種の外にあるもの）の正本の置き場。
// ファイル名は列挙せずフォルダごと読む（カテゴリが増えても追従するため。B節ルール1の精神）。
const CATALOG_DIR = path.join(ROOT, 'catalog-data');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);

function argValue(name, fallback) {
	// 後に書いたものが勝つ（npm script の既定値をコマンドラインから上書きできるように）
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

const USE_STITCHED = process.argv.includes('--stitched');
// 追加カタログの後段の絞り込み（製品の applyScenarioFactorExactOnly と同じ）。既定は掛ける。
const CATALOG_EXACT_ONLY = !process.argv.includes('--no-catalog-exact-only');
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

/** catalog-data/ の全カテゴリの名前（[{category, names}]）。フォルダが無ければ空。 */
async function loadCatalogs() {
	let files;
	try {
		files = (await fs.readdir(CATALOG_DIR)).filter((f) => f.toLowerCase().endsWith('.json')).sort();
	} catch {
		return [];
	}
	const out = [];
	for (const f of files) {
		const json = JSON.parse(await fs.readFile(path.join(CATALOG_DIR, f), 'utf-8'));
		const names = (json.entries || []).map((e) => e.name).filter(Boolean);
		if (names.length) out.push({ file: f, category: json.category || f, names });
	}
	return out;
}

async function resolveBaseDictionary(browser, arg) {
	if (!arg || arg === 'page') return null; // ページ側の既定の照合対象をそのまま使う
	if (arg === 'deck') {
		const json = JSON.parse(await fs.readFile(DECK_MASTER, 'utf-8'));
		return (json.skills || json).map((s) => s.name || String(s));
	}
	if (arg === 'exam') {
		// exam.html が組み込みで持つ技能試験の133種。ソースを正規表現で拾うのではなく
		// 実際に exam.html を開いて定数を読む（持ち方が名前の配列から {id, name} に
		// 変わっても追従できるように、どちらの形でも名前だけを取り出す）。
		const page = await browser.newPage();
		await page.goto(pathToFileURL(path.join(ROOT, 'exam.html')).href, { waitUntil: 'load' });
		const names = await page.evaluate(() =>
			EXAM_SKILL_LIST.map((s) => (typeof s === 'string' ? s : s.name)));
		await page.close();
		return names;
	}
	return arg.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * --dict の値を解釈する。末尾の `+catalog` は「追加カタログを足す」の意味。
 * 戻り値 { names, catalogNames, catalogs }。names が null ならページ側の既定を使う
 * （その場合でも catalog は足せない＝ページ側の skillList をそのまま使う約束のため）。
 */
async function resolveDictionary(browser) {
	const wantCatalog = !!DICT_ARG && /\+catalog$/.test(DICT_ARG);
	const baseArg = wantCatalog ? DICT_ARG.replace(/\+catalog$/, '') : DICT_ARG;
	const base = await resolveBaseDictionary(browser, baseArg);
	if (!wantCatalog) return { names: base, catalogNames: [], catalogs: [] };
	if (base === null) {
		console.log('[警告] --dict=page に +catalog は付けられません（ページ側の skillList をそのまま使うため）。カタログは足しません。');
		return { names: null, catalogNames: [], catalogs: [] };
	}
	const catalogs = await loadCatalogs();
	const catalogNames = catalogs.flatMap((c) => c.names);
	// マスター側と同じ名前があっても二重には入れない（辞書は名前の集合）。
	const seen = new Set(base);
	return { names: base.concat(catalogNames.filter((n) => !seen.has(n))), catalogNames, catalogs };
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
async function runOcrInPage({ files, groupLabel, useStitched, dictNames, errDict, catalogNames, catalogExactOnly }) {
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
		let detected = Array.from(matched.detectedSkills);

		// 追加カタログの後段の絞り込み。exam.html の applyScenarioFactorExactOnly() と同じ判定を
		// ここでもう一度掛ける（製品のロジックを複製しないため、判定の中身だけを同じ形で書く。
		// exam.html 側の関数はページの状態＝利用者が選んだ因子に依存するので直接は呼べない）。
		out.catalogDropped = [];
		if (catalogNames && catalogNames.length && catalogExactOnly) {
			const catalogSet = new Set(catalogNames);
			const lineNorms = result.lines.map((l) => normalizeText(l.text)).filter(Boolean);
			detected = detected.filter((name) => {
				if (!catalogSet.has(name)) return true;
				const n = normalizeText(name);
				if (lineNorms.some((s) => s.indexOf(n) !== -1)) return true;
				out.catalogDropped.push(name);
				return false;
			});
		}
		out.catalogDetected = detected.filter((n) => (catalogNames || []).indexOf(n) !== -1);
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
	const browser = await chromium.launch();
	const { names: dictNames, catalogNames, catalogs } = await resolveDictionary(browser);
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
	console.log(`照合辞書: ${dictNames ? `指定 ${dictNames.length}件（--dict=${DICT_ARG}）` : 'ページ既定'}`);
	if (catalogNames.length) {
		console.log(
			`追加カタログ: ${catalogs.map((c) => `${c.category} ${c.names.length}件`).join(' / ')}` +
				`（後段の完全一致の絞り込み: ${CATALOG_EXACT_ONLY ? 'あり（製品と同じ）' : 'なし（--no-catalog-exact-only）'}）`
		);
	}
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
			catalogNames: catalogNames,
			catalogExactOnly: CATALOG_EXACT_ONLY,
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
			if (catalogNames.length) {
				const hit = result.catalogDetected || [];
				console.log(`  うち追加カタログ(${hit.length}件): ${hit.length ? hit.join('・') : '(なし)'}`);
				const dropped = result.catalogDropped || [];
				if (dropped.length) {
					console.log(`  後段の完全一致で落ちた追加カタログ(${dropped.length}件): ${dropped.join('・')}`);
				}
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
