// 下から出るシートが、iPhone の Safari（下のバーが開いた状態）でも画面に収まるかの検査（2026-10-13）。
//
//   node tests/layout/run-sheet-tests.mjs      （npm run test:sheets）
//
// ヘッドレスの Chromium には動的なバーが無いので、ビューポートの高さを 734px（バーが開いて見える高さ＝dvh）にして、
// CSS の「Nvh」だけを「N×8.44px」（バーが縮んだときの大きい画面＝844px基準）に差し替える。dvh はそのまま。実機の iOS と同じ関係。
// 確かめること:
//   (1) バーが開いた状態でも、シートの上端が画面の中（0以上）・下端が画面の下端以内
//   (2) バーが縮んだ状態では、シートの位置・高さが従来と同じ（修正前に測った値と一致）
// スキル名・件数は書かない。
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from '../visual/lib/serve.mjs';

const OUT = process.argv[2] || 'output/scratch/sheet-tests';
const LARGE = 844, VISIBLE = 734;
fs.mkdirSync(OUT, { recursive: true });
const srv = await startServer();
const browser = await chromium.launch();
const unitFix = (body) => body.replace(/(\d+(?:\.\d+)?)vh/g, (m, n) => 'calc(' + n + ' * ' + (LARGE / 100) + 'px)');

async function open(file, scheme, simulate) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: simulate ? VISIBLE : LARGE }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	page.setDefaultTimeout(8000);
	if (simulate) {
		await page.route(/\.css(\?|$)|uma-skill-deck-core\.js(\?|$)/, async (route) => {
			const resp = await route.fetch();
			await route.fulfill({ response: resp, body: unitFix(await resp.text()) });
		});
	}
	await page.addInitScript((s) => { try { localStorage.setItem('uma-tools-theme', s); localStorage.setItem('uma-special-ui-mode', 'new'); localStorage.setItem('uma-exam-ui-mode', 'new'); } catch (e) {} }, scheme);
	await page.goto(srv.base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
	for (let i = 0; i < 3; i++) { if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]').catch(() => {}); }
	await page.waitForTimeout(500);
	return { ctx, page };
}

// 開き方の違う3種（骨格 .uma-overlay の一覧・同じ骨格の短い一覧・Deck のスキル選択の小窓 .usd-modal-panel）
const CASES = [
	{ name: 'exam-factor-list', file: 'exam.html', open: 'window.openFactorList()', box: '#factor-list-box' },
	{ name: 'exam-gene-list', file: 'exam.html', open: 'window.openGeneList()', box: '#gene-list-box' },
	{ name: 'deck-picker', file: 'uma-skill-deck.html', clickText: '条件で検索', box: '.usd-modal-panel' }
];
// バーが縮んだ状態（従来の見た目）の位置・高さの基準（修正前に測った値）
const BASE = { 'exam-factor-list': { top: 87, height: 757 }, 'exam-gene-list': { top: 479, height: 365 }, 'deck-picker': { top: 127, height: 717 } };
let fails = 0;
for (const c of CASES) for (const scheme of ['light', 'dark']) for (const simulate of [false, true]) {
	const { ctx, page } = await open(c.file, scheme, simulate);
	if (c.open) await page.evaluate(c.open); else await page.getByText(c.clickText, { exact: false }).first().click();
	await page.waitForTimeout(600);
	const m = await page.evaluate((sel) => {
		const el = document.querySelector(sel);
		const r = el ? el.getBoundingClientRect() : null;
		return { innerHeight: window.innerHeight, box: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) } : null };
	}, c.box);
	await page.screenshot({ path: `${OUT}/${c.name}-${scheme}-${simulate ? 'barOpen' : 'barSmall'}.png` });
	await ctx.close();
	const label = c.name + '・' + (scheme === 'light' ? 'ライト' : 'ダーク') + '・' + (simulate ? 'バーが開いた状態（模擬）' : 'バーが縮んだ状態');
	const fits = !!m.box && m.box.top >= 0 && m.box.bottom <= m.innerHeight + 1;
	if (!fits) fails++;
	console.log((fits ? '[OK] ' : '[NG] ') + label + ': シートが画面に収まる（画面の高さ ' + m.innerHeight + '）', m.box);
	if (!simulate) {
		const b = BASE[c.name];
		const same = !!m.box && m.box.top === b.top && m.box.height === b.height;
		if (!same) fails++;
		console.log((same ? '[OK] ' : '[NG] ') + label + ': 見た目（位置・高さ）が修正前と同じ', m.box);
	}
}
await browser.close();
await srv.close();
console.log('\n' + (fails === 0 ? '=== シートの検査: 全項目OK ===' : '=== シートの検査: NG ' + fails + '件 ==='));
process.exit(fails === 0 ? 0 : 1);
