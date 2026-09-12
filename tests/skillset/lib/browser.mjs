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
		// 文字領域を小さな明るさの配列に潰した指紋。同じカードなら近い値になる。
		window.__SIGNATURE_W = 48;
		window.__SIGNATURE_H = 12;
		window.__signature = function (canvas, rect) {
			const w = window.__SIGNATURE_W, h = window.__SIGNATURE_H;
			const out = document.createElement('canvas');
			out.width = w;
			out.height = h;
			const ctx = out.getContext('2d');
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
			const d = ctx.getImageData(0, 0, w, h).data;
			const v = [];
			for (let i = 0; i < w * h; i++) {
				const p = i * 4;
				v.push(Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]));
			}
			return v;
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
				cards: res.cards.map((c) => ({
					card: c.card,
					text: c.text,
					kind: c.kind,
					goldRatio: Number((c.goldRatio || 0).toFixed(4)),
					// 文字領域を小さく潰した指紋。OCRを使わずに「同じカードか」を見分けるために使う
					// （金のカードはOCRにかけないので、名前では重複を消せない）。
					signature: window.__signature(canvas, c.text)
				}))
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
