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
import { openPage, seedSpecialResults, RECORD_ID } from './lib/fixtures.mjs';

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
	await shot(page, 'special-01-top');
	await seedSpecialResults(page);
	await shot(page, 'special-02-results');
	const el = await page.$('#result-wrap');
	if (el) { await el.screenshot({ path: path.join(OUT, 'special-03-result-table.png') }); console.log('  special-03-result-table'); }
	await page.click('.deck-drawer-trigger');
	await shot(page, 'special-04-deck-drawer', { fullPage: false, wait: 1500 });
	await page.click('#deck-drawer-close');
	await page.waitForTimeout(800);
	await page.setViewportSize({ width: 375, height: 812 });
	await shot(page, 'special-05-mobile375', { wait: 600 });
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
