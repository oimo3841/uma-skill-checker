// お知らせ(c) のモックの画像（作業用・T54）: lab/announce-c-mock.html（製品の special.html を枠で開き、(c) を1件足して開く）を
// 案1〜3 × 375px・1280px（ライト）と、案2 の 375px（ダーク）で撮り、寸法を sizes.json に書く。製品のファイルは変えない。
// scripts/stitch-next-mock-shots.mjs と同じく、tests/visual/lib/serve.mjs でリポジトリを配信して Playwright（Chromium）で開く。
// 使い方:
//   node scripts/announce-c-mock-shots.mjs --make-image <結合画像.png>   … lab/announce-c-stitch-mock.png（半分に縮めた写し）を作る
//   node scripts/announce-c-mock-shots.mjs <出力フォルダ> [場合の名前,...]
// 撮るもの（場合ごと）:
//   <名前>-view.png … その幅・高さの画面で、開いたままの見え方（小窓の本文は先頭）
//   <名前>-full.png … 本文に縦の巻きがあるときだけ、巻かずに全部見せた形（撮るときだけ小窓の max-height を外し、画面の高さを足す。見た目の確認用）
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, REPO_ROOT } from '../tests/visual/lib/serve.mjs';

const IMAGE_OUT = path.join(REPO_ROOT, 'lab', 'announce-c-stitch-mock.png');
// 元の結合画像の幅（T51 の kiremono.png）と、その上段の字の大きさ（T51 の報告: 見出し 20px・合計 46px・①②の行 23px・遺伝子の名前 18px）
const ORIGINAL_W = 2206;
const TEXT_PX = { '理論値SP の見出し': 20, '合計の数字': 46, '①②・継承固有の行': 23, '遺伝子の名前と★': 18 };

if (process.argv[2] === '--make-image') {
	const src = process.argv[3];
	if (!src) { console.error('使い方: node scripts/announce-c-mock-shots.mjs --make-image <結合画像.png>'); process.exit(2); }
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const out = await page.evaluate(async (url) => {
		const img = await new Promise((rs, rj) => { const i = new Image(); i.onload = () => rs(i); i.onerror = rj; i.src = url; });
		const w = Math.round(img.naturalWidth / 2), h = Math.round(img.naturalHeight / 2);
		const c = document.createElement('canvas'); c.width = w; c.height = h;
		const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
		g.drawImage(img, 0, 0, w, h);
		return { png: c.toDataURL('image/png'), w, h, nw: img.naturalWidth, nh: img.naturalHeight };
	}, 'data:image/png;base64,' + fs.readFileSync(src).toString('base64'));
	await browser.close();
	fs.writeFileSync(IMAGE_OUT, Buffer.from(out.png.split(',')[1], 'base64'));
	console.log('元', out.nw + '×' + out.nh, '→', out.w + '×' + out.h, IMAGE_OUT, fs.statSync(IMAGE_OUT).size + ' bytes');
	process.exit(0);
}

const OUT = process.argv[2];
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
if (!OUT) { console.error('使い方: node scripts/announce-c-mock-shots.mjs <出力フォルダ> [場合の名前,...]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

// 375px は端末に近い 2倍の画素で撮る（字のにじみを実機に近く）。1280px は等倍
const SP = { width: 375, height: 812, dpr: 2 };
const PC = { width: 1280, height: 800, dpr: 1 };
const CASES = [
	{ name: 'plan1-sp375-light', plan: 1, vp: SP, theme: 'light' },
	{ name: 'plan2-sp375-light', plan: 2, vp: SP, theme: 'light' },
	{ name: 'plan3-sp375-light', plan: 3, vp: SP, theme: 'light' },
	{ name: 'plan1-pc1280-light', plan: 1, vp: PC, theme: 'light' },
	{ name: 'plan2-pc1280-light', plan: 2, vp: PC, theme: 'light' },
	{ name: 'plan3-pc1280-light', plan: 3, vp: PC, theme: 'light' },
	{ name: 'plan2-sp375-dark', plan: 2, vp: SP, theme: 'dark' },
].filter((c) => !ONLY || ONLY.includes(c.name));

// 枠の中の小窓の寸法（CSS px）
function measure() {
	const cw = document.getElementById('app').contentWindow;
	const d = cw.document;
	const dlg = d.getElementById('ui-notice');
	const body = dlg.querySelector('.notice-body');
	const sec = d.getElementById('ui-notice-body-stitch');
	const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
	const img = sec && sec.querySelector('img');
	const bodyBox = body.getBoundingClientRect();
	const imgBox = img ? img.getBoundingClientRect() : null;
	const cs = cw.getComputedStyle(dlg);
	return {
		open: !dlg.hidden && cw.eval('uiNoticeOpen') && cw.eval('uiNoticeKind') === 'stitch',
		theme: d.documentElement.getAttribute('data-theme'),
		pager: (dlg.querySelector('.notice-pager-count') || {}).textContent || '',
		headDate: (dlg.querySelector('.notice-head-date') || {}).textContent || '',
		texts: sec ? Array.from(sec.querySelectorAll('.announce-h, .announce-lead, .announce-lines li')).map((e) => e.textContent) : [],
		viewport: { w: cw.innerWidth, h: cw.innerHeight },
		dialog: Object.assign(r(dlg), { maxHeight: cs.maxHeight }),
		body: { rect: r(body), clientH: body.clientHeight, scrollH: body.scrollHeight, verticalScroll: body.scrollHeight - body.clientHeight,
			clientW: body.clientWidth, scrollW: body.scrollWidth, horizontalOverflow: body.scrollWidth - body.clientWidth },
		page: { clientW: d.documentElement.clientWidth, scrollW: d.documentElement.scrollWidth, horizontalOverflow: d.documentElement.scrollWidth - d.documentElement.clientWidth },
		dialogOverflowX: Math.max(0, Math.round((dlg.getBoundingClientRect().right - cw.innerWidth) * 10) / 10, Math.round(-dlg.getBoundingClientRect().left * 10) / 10),
		heading: r(sec && sec.querySelector('.announce-h')),
		lines: r(sec && sec.querySelector('.announce-lines')),
		image: img ? {
			natural: { w: img.naturalWidth, h: img.naturalHeight }, rendered: r(img),
			// 小窓を開いたまま（巻かずに）見える高さ。本文の箱の下端までのうち画像の分
			visibleWithoutScroll: Math.max(0, Math.round((Math.min(imgBox.bottom, bodyBox.bottom) - Math.max(imgBox.top, bodyBox.top)) * 10) / 10),
		} : null,
		okButton: r(d.getElementById('ui-notice-ok')),
	};
}

const { base, close } = await startServer(0);
const browser = await chromium.launch();
const summary = { date: new Date().toISOString(), base: 'lab/announce-c-mock.html（製品の special.html を枠で開く）', image: null, cases: [] };
try {
	for (const cs of CASES) {
		let res = null, lastErr = null;
		// ほかのセッションの検査が重いときに落ちることがあるので、2回まで撮り直す
		for (let attempt = 1; attempt <= 3 && !res; attempt++) {
			const ctx = await browser.newContext({ viewport: { width: cs.vp.width, height: cs.vp.height }, deviceScaleFactor: cs.vp.dpr, colorScheme: cs.theme });
			const page = await ctx.newPage();
			const errors = [];
			page.on('pageerror', (e) => errors.push(String(e.message || e)));
			try {
				await page.goto(`${base}/lab/announce-c-mock.html?plan=${cs.plan}&theme=${cs.theme}&shot=1`);
				await page.waitForFunction(() => window.__mock && window.__mock.ready, null, { timeout: 60000 });
				const err = await page.evaluate(() => window.__mock.error);
				if (err) throw new Error(err);
				await page.waitForTimeout(400);  // 小窓の出方の動き・字の読み込みを待つ
				const m = await page.evaluate(measure);
				if (!m.open) throw new Error('(c) の小窓が開いていない');
				await page.screenshot({ path: path.join(OUT, cs.name + '-view.png') });
				// 全部を見せた形: 小窓の max-height を外し、本文の巻きの分だけ画面を高くする
				const extra = m.body.verticalScroll;
				let full = null;
				if (extra > 0) {
					await page.setViewportSize({ width: cs.vp.width, height: cs.vp.height + extra + 40 });
					await page.evaluate(() => { document.getElementById('app').contentDocument.getElementById('ui-notice').style.maxHeight = 'none'; });
					await page.waitForTimeout(300);
					full = await page.evaluate(measure);
					await page.screenshot({ path: path.join(OUT, cs.name + '-full.png') });
				}
				// ‹ › のめくり: › で古い側へ2回 → ‹ で (c) まで戻る（種類と n / N を記録。撮らない）
				const fr = page.frameLocator('#app');
				const state = () => page.evaluate(() => { const cw = document.getElementById('app').contentWindow; return cw.eval('uiNoticeKind') + ' ' + cw.document.querySelector('#ui-notice .notice-pager-count').textContent; });
				const nav = [await state()];
				for (const dir of ['older', 'older', 'newer', 'newer']) { await fr.locator(`[data-notice-nav="${dir}"]`).click(); nav.push(await state()); }
				res = { m, full, errors, nav };
			} catch (e) {
				lastErr = e;
				console.log(cs.name, '撮り直し', attempt, String(e.message || e));
			}
			await ctx.close();
		}
		if (!res) { summary.cases.push({ name: cs.name, error: String(lastErr && lastErr.message || lastErr) }); continue; }
		const { m, full, errors, nav } = res;
		const item = { name: cs.name, plan: cs.plan, theme: cs.theme, viewport: cs.vp, pageErrors: errors, pagerWalk: nav, measured: m, fullView: full ? { viewportH: full.viewport.h, dialog: full.dialog, verticalScroll: full.body.verticalScroll } : '巻きが無いので -view と同じ' };
		if (m.image) {
			const scale = m.image.rendered.w / ORIGINAL_W;
			item.imageScale = { renderedW: m.image.rendered.w, ofOriginal: Math.round(scale * 1000) / 1000, ofLabCopy: Math.round((m.image.rendered.w / m.image.natural.w) * 1000) / 1000,
				// 元の結合画像の字が、小窓の中で何 px（CSS px）に見えるか
				textPx: Object.fromEntries(Object.entries(TEXT_PX).map(([k, v]) => [k, Math.round(v * scale * 10) / 10])) };
		}
		summary.cases.push(item);
		console.log(cs.name.padEnd(20), m.pager, '本文', m.body.clientH + '/' + m.body.scrollH, '巻き', m.body.verticalScroll, '横はみ出し 本文', m.body.horizontalOverflow, 'ページ', m.page.horizontalOverflow,
			m.image ? '画像 ' + m.image.rendered.w + '×' + m.image.rendered.h + '（元の ' + item.imageScale.ofOriginal + ' 倍）' : '', errors.length ? 'エラー ' + errors.join(' / ') : '');
	}
	summary.image = { file: 'lab/announce-c-stitch-mock.png', size: fs.existsSync(IMAGE_OUT) ? fs.statSync(IMAGE_OUT).size : null, originalW: ORIGINAL_W, originalTextPx: TEXT_PX };
	fs.writeFileSync(path.join(OUT, 'sizes.json'), JSON.stringify(summary, null, '\t') + '\n');
} finally {
	await browser.close();
	await close();
}
