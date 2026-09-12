// Playwright のブラウザを「画像デコード＋カード切り出しの実行環境」として使うための薄い層。
//
// Node 単体には PNG デコーダも canvas も無いので、既存の tests/ocr ハーネスと同じく
// ヘッドレスブラウザの中で処理する。lib/skillset-cards.js は素の <script> として読み込むので、
// ここで組み立てた環境は後続フェーズの製品（ブラウザ）と同じ条件になる。

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_JS = path.join(__dirname, 'skillset-cards.js');

export async function openAnalyzer(options = {}) {
	const browser = await chromium.launch({ channel: options.channel || undefined });
	const page = await browser.newPage();
	page.on('console', (msg) => {
		if (msg.type() === 'error') console.error('  [page error]', msg.text());
	});
	await page.goto('about:blank');
	await page.addScriptTag({ content: await fs.readFile(CARDS_JS, 'utf-8') });
	await page.evaluate(() => {
		window.__decode = async function (dataUrl) {
			const img = new Image();
			await new Promise((res, rej) => {
				img.onload = res;
				img.onerror = () => rej(new Error('画像を読めませんでした'));
				img.src = dataUrl;
			});
			const c = document.createElement('canvas');
			c.width = img.naturalWidth;
			c.height = img.naturalHeight;
			c.getContext('2d').drawImage(img, 0, 0);
			return c;
		};
		window.__cropDataUrl = function (canvas, rect, scale) {
			const s = scale || 1;
			const out = document.createElement('canvas');
			out.width = Math.max(1, Math.round(rect.w * s));
			out.height = Math.max(1, Math.round(rect.h * s));
			const ctx = out.getContext('2d');
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, out.width, out.height);
			return out.toDataURL('image/png');
		};
		window.__analyze = async function (dataUrl, opts) {
			const o = opts || {};
			const canvas = await window.__decode(dataUrl);
			const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
			const t0 = performance.now();
			const res = window.SkillsetCards.analyzeScreen(img);
			const ms = performance.now() - t0;
			const out = {
				width: canvas.width,
				height: canvas.height,
				ms: Math.round(ms),
				badge: res.badge,
				activeTab: res.activeTab,
				cards: res.cards.map((c) => ({ card: c.card, text: c.text }))
			};
			if (o.crops) {
				out.cards.forEach((c, i) => {
					c.cropDataUrl = window.__cropDataUrl(canvas, res.cards[i].text, o.cropScale || 1);
				});
				if (res.badge) out.badgeDataUrl = window.__cropDataUrl(canvas, res.badge, o.cropScale || 1);
			}
			return out;
		};
	});
	return {
		browser,
		page,
		analyze: (dataUrl, opts) => page.evaluate(([u, o]) => window.__analyze(u, o), [dataUrl, opts || {}]),
		close: () => browser.close()
	};
}

export async function fileToDataUrl(filePath) {
	const buf = await fs.readFile(filePath);
	const ext = path.extname(filePath).toLowerCase();
	const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
	return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function dataUrlToFile(dataUrl, filePath) {
	const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
}
