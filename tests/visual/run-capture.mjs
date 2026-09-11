// 主要画面のスクリーンショットを撮る。
//
//   npm run test:visual:capture -- before     （変更前に撮る）
//   npm run test:visual:capture -- after      （変更後に撮る）
//   npm run test:visual:capture -- after --compare   （変更前と並べた比較画像も作る）
//
// 出力先は output/visual/shots-<tag>/ 。output/ は .gitignore 済みなので、
// 画像がリポジトリに入ることはない。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer, REPO_ROOT } from './lib/serve.mjs';
import { openPage, seedSpecialResults, RECORD_ID, PICK } from './lib/fixtures.mjs';

const TAG = (process.argv[2] || 'after').replace(/[^a-z0-9_-]/gi, '');
const WANT_COMPARE = process.argv.includes('--compare');
const OUT = path.join(REPO_ROOT, 'output', 'visual', 'shots-' + TAG);
fs.mkdirSync(OUT, { recursive: true });

const { base, close } = await startServer();
const browser = await chromium.launch();

async function shot(page, name, opts = {}) {
	try {
		await page.waitForTimeout(opts.wait || 400);
		await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: opts.fullPage !== false });
		console.log('  ' + name);
	} catch (e) {
		console.log('  [FAIL] ' + name + ': ' + e.message);
	}
}

/* ---- スタイルガイド（共通部分の妥当性はこの1枚でほぼ確認できる） ---- */
{
	const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
	await page.goto(base + '/css/styleguide.html', { waitUntil: 'networkidle' });
	await shot(page, 'styleguide', { wait: 600 });
	await page.close();
}

/* ---- special.html ---- */
{
	const { ctx, page } = await openPage(browser, base, 'special.html');
	// 既定は新UIで、初回は切り替えの告知モーダルが出る（C-16）。閉じてから撮る。
	// また seedSpecialResults は旧UIにしかない入力欄（#skill-list）へ貼るので、
	// 旧UIのうちに済ませてから新UIへ戻す（run-smoke.mjs と同じ手順。F-29③）。
	await page.waitForTimeout(2500);
	if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
	await page.waitForTimeout(300);
	await shot(page, 'special-01-top');
	await page.click('#deck-mode-btn');
	await page.waitForTimeout(600);
	await seedSpecialResults(page);
	await page.click('#deck-mode-btn');
	await page.waitForTimeout(1500);
	await page.evaluate((names) => { skillList = names; renderResults(); }, PICK.map((s) => s.name));
	await shot(page, 'special-02-input-only');
	// トーストが消えるまで待つ（消える前だとFABのバッジに重なる）
	await page.waitForTimeout(2600);
	await page.click('#fab-toggle');
	await shot(page, 'special-03-fab-open', { fullPage: false, wait: 500 });
	// 結果は引き出しの中。開いた状態を撮る。
	await page.click('#fab-item-result');
	await shot(page, 'special-04-result-drawer', { fullPage: false, wait: 900 });
	// 引き出しの中は独立してスクロールするので、下端（Deckへの導線）も撮る
	await page.evaluate(() => { const b = document.querySelector('#result-drawer .uma-drawer-body'); b.scrollTop = b.scrollHeight; });
	await shot(page, 'special-05-result-drawer-bottom', { fullPage: false, wait: 500 });
	await page.evaluate(() => { document.querySelector('#result-drawer .uma-drawer-body').scrollTop = 0; });
	// 結果がまだ無い引き出しの案内
	await page.evaluate(() => openDrawer('stitch'));
	await shot(page, 'special-06-stitch-empty', { fullPage: false, wait: 700 });
	await page.evaluate(() => openDrawer('deck'));
	await shot(page, 'special-07-deck-drawer', { fullPage: false, wait: 1500 });
	await page.click('#deck-drawer-close');
	await page.waitForTimeout(800);

	await page.setViewportSize({ width: 375, height: 812 });
	await shot(page, 'special-08-mobile375', { wait: 600 });
	await page.click('#fab-toggle');
	await shot(page, 'special-09-mobile375-fab-open', { fullPage: false, wait: 500 });
	await page.click('#fab-item-result');
	await shot(page, 'special-10-mobile375-result-drawer', { fullPage: false, wait: 900 });
	await page.evaluate(() => closeDrawer());
	await page.waitForTimeout(600);
	await ctx.close();
}

/* ---- uma-skill-deck.html ---- */
{
	const { ctx, page } = await openPage(browser, base, 'uma-skill-deck.html');
	await shot(page, 'deck-01-template-list');
	await page.click('text=中距離・差し 想定');
	await shot(page, 'deck-02-template-editor', { wait: 700 });
	await page.click('text=スキルを追加');
	await shot(page, 'deck-03-skill-picker', { fullPage: false, wait: 900 });
	await page.click('[data-usd-act="picker-close"]').catch(() => {});
	await page.waitForTimeout(400);
	await page.evaluate(() => switchTab('record'));
	await shot(page, 'deck-04-record-list', { wait: 500 });
	await page.evaluate((id) => openRecordEditor(id), RECORD_ID);
	await shot(page, 'deck-05-record-editor', { wait: 800 });
	const grid = await page.$('#record-grid-wrap');
	if (grid) { await grid.screenshot({ path: path.join(OUT, 'deck-06-record-grid.png') }); console.log('  deck-06-record-grid'); }
	await page.evaluate(() => switchTab('data'));
	await shot(page, 'deck-07-data', { wait: 500 });
	await page.setViewportSize({ width: 375, height: 812 });
	await page.evaluate(() => switchTab('record'));
	await page.evaluate((id) => openRecordEditor(id), RECORD_ID);
	await shot(page, 'deck-08-mobile375', { wait: 700 });
	await ctx.close();
}

/* ---- exam.html（UmaExam OCR） ----
   special と同じ画面構成（タブ・FAB・引き出し・ガイドのダイアログ・告知）を PC 幅と 375px で撮る。
   結果は OCR を回さず、合成した行を本物の照合関数に通して作る（run-smoke.mjs の seedExam と同じ）。 */
for (const width of [1280, 375]) {
	const ctx = await browser.newContext({ viewport: { width, height: 900 } });
	await ctx.addInitScript(() => {
		// 告知モーダルは別に撮るので、通常の状態は既読で開く
		localStorage.setItem('uma-exam-ui-notice', '2026-09-exam-drawer-layout');
	});
	const page = await ctx.newPage();
	await page.goto(base + '/exam.html', { waitUntil: 'networkidle', timeout: 60000 });
	await page.waitForTimeout(1500);
	const n = (s) => `exam-${s}-${width}`;
	await shot(page, n('01-top'));
	await page.click('#step-tab-2');
	await shot(page, n('02-tab2'));
	await page.evaluate(() => {
		selectStepTab(1);
		const mk = (names, offset) => matchAllSkillsWithStars(
			names.map((name, i) => ({ text: name, stars: ((i + offset) % 3) + 1, starsReliable: i !== 4, rowKey: 'r' + i })),
			skillList, skillIndex, {});
		personResults = PERSON_LABELS.map(() => null);
		personResults[0] = mk(skillList, 0);
		personResults[0].skillStars[skillList[4]] = null;
		personResults[3] = mk(skillList.slice(0, 20), 1);
		renderResults();
		writeOcrHandoff();
		markFabUnseen('result');
		window.scrollTo(0, 0);
	});
	await page.waitForTimeout(2600); // トーストが消えるのを待つ
	await page.click('#fab-toggle');
	await shot(page, n('03-fab-open'), { fullPage: false, wait: 500 });
	await page.click('#fab-item-result');
	await shot(page, n('04-result-drawer'), { fullPage: false, wait: 900 });
	await page.evaluate(() => { const b = document.querySelector('#result-drawer .uma-drawer-body'); b.scrollTop = b.scrollHeight; });
	await shot(page, n('05-result-drawer-bottom'), { fullPage: false, wait: 500 });
	// 結果画像は同じ引き出しの中のタブ（追加修正⑤）。まだ作っていないので案内が出る
	await page.evaluate(() => { document.querySelector('#result-drawer .uma-drawer-body').scrollTop = 0; fabGoTo('stitch'); });
	await shot(page, n('06-stitch-empty'), { fullPage: false, wait: 700 });
	await page.evaluate(() => selectResultTab('result'));
	await page.evaluate(() => openDrawer('deck'));
	await shot(page, n('07-deck-drawer'), { fullPage: false, wait: 1500 });
	await page.evaluate(() => closeDrawer());
	await page.waitForTimeout(600);
	if (await page.evaluate(() => typeof openHelp === 'function')) {
		await page.evaluate(() => openHelp());
		await shot(page, n('08-help'), { fullPage: false, wait: 400 });
		await page.evaluate(() => closeHelp());
	}
	if (await page.evaluate(() => typeof openUiNotice === 'function')) {
		await page.evaluate(() => openUiNotice());
		await shot(page, n('09-notice'), { fullPage: false, wait: 400 });
		await page.evaluate(() => closeUiNotice());
		await page.click('#deck-mode-btn');
		await shot(page, n('10-old-ui'), { wait: 800 });
	}
	await ctx.close();
}

/* ---- 変更前と並べた比較画像 ---- */
if (WANT_COMPARE) {
	const beforeDir = path.join(REPO_ROOT, 'output', 'visual', 'shots-before');
	if (!fs.existsSync(beforeDir)) {
		console.log('\n[skip] 比較画像: shots-before がない（先に before を撮ること）');
	} else {
		const cmpDir = path.join(REPO_ROOT, 'output', 'visual', 'compare');
		fs.mkdirSync(cmpDir, { recursive: true });
		const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
		console.log('\n比較画像:');
		for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.png'))) {
			const bp = path.join(beforeDir, f);
			if (!fs.existsSync(bp)) continue;
			const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
			await page.setContent(`<!doctype html><meta charset="utf-8"><style>
				body{margin:0;padding:16px;background:#0f172b;font-family:ui-sans-serif,system-ui,sans-serif;color:#fff}
				h1{font-size:15px;margin:0 0 12px;font-weight:600}
				.row{display:flex;gap:16px;align-items:flex-start}.col{flex:1;min-width:0}
				.cap{font-size:12px;margin:0 0 6px;color:#90a1b9}.cap b{color:#fff}
				img{width:100%;display:block;border:1px solid #314158;border-radius:8px}
			</style><h1>${f.replace('.png', '')}</h1><div class="row">
				<div class="col"><p class="cap"><b>変更前</b></p><img src="${b64(bp)}"></div>
				<div class="col"><p class="cap"><b>変更後</b></p><img src="${b64(path.join(OUT, f))}"></div>
			</div>`);
			await page.waitForTimeout(250);
			await page.screenshot({ path: path.join(cmpDir, f.replace('.png', '-compare.png')), fullPage: true });
			await page.close();
			console.log('  ' + f.replace('.png', '-compare.png'));
		}
	}
}

await browser.close();
await close();
console.log('\n-> ' + path.relative(REPO_ROOT, OUT));
