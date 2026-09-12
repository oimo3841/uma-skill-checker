// カード切り出し画像のOCRと、劣化版の生成・文字の高さの実測をブラウザの中で行う層。
//
// tests/skillset/fixtures/ocr-host.html を file:// で開く。このページは
// special.html と同じ版の Tesseract.js（CDN）と js/common.js を読み込むので、
// 前処理・照合は製品と同じ実装がそのまま動く（ロジックの複製をしない）。
// Tesseract の言語データは CDN から取るためネットワーク接続が要る。

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.join(__dirname, '..', 'fixtures', 'ocr-host.html');

export const DEFAULT_PSM = '7'; // 1行だけを読む。カード1枚＝1行なので 6（段組）より素直

export async function openOcr(options = {}) {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(pathToFileURL(HOST).href, { waitUntil: 'load' });
	await page.waitForFunction(() => typeof Tesseract !== 'undefined', null, { timeout: 60000 });
	await page.evaluate(async (psm) => {
		window.__worker = await Tesseract.createWorker();
		await window.__worker.loadLanguage('jpn');
		await window.__worker.initialize('jpn');
		await window.__worker.setParameters({
			tessedit_pageseg_mode: psm,
			preserve_interword_spaces: '1',
			user_defined_dpi: '300'
		});
		window.__psm = psm;

		window.__toCanvas = async function (dataUrl) {
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

		// 文字（濃い画素）の縦方向の広がり＝「文字の高さ」。
		// 因子画面とスキルセット画面を同じ物差しで比べるために使う。
		window.__inkHeight = function (canvas, rect) {
			const r = rect || { x: 0, y: 0, w: canvas.width, h: canvas.height };
			const d = canvas.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
			const counts = new Int32Array(r.h);
			for (let y = 0; y < r.h; y++) {
				let n = 0;
				for (let x = 0; x < r.w; x++) {
					const p = (y * r.w + x) * 4;
					const gray = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
					if (gray < 128) n++;
				}
				counts[y] = n;
			}
			const need = Math.max(2, Math.round(r.w * 0.01));
			let top = -1, bottom = -1;
			for (let y = 0; y < r.h; y++) if (counts[y] >= need) { if (top < 0) top = y; bottom = y; }
			return top < 0 ? 0 : bottom - top + 1;
		};

		// 拡大・縮小と（指定があれば）JPEG圧縮。
		// 人工劣化は「1回の縮小＋1回の圧縮」に留める（多段圧縮されたSNS画像は
		// OCR対象外という既存の判断に合わせる）。拡大（製品が行を
		// ROW_TARGET_HEIGHT に引き伸ばすのと同じこと）にも同じ入口を使う。
		window.__transform = async function (dataUrl, opts) {
			const canvas = await window.__toCanvas(dataUrl);
			const scale = opts.scale == null ? 1 : opts.scale;
			const out = document.createElement('canvas');
			out.width = Math.max(1, Math.round(canvas.width * scale));
			out.height = Math.max(1, Math.round(canvas.height * scale));
			const ctx = out.getContext('2d');
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(canvas, 0, 0, out.width, out.height);
			return opts.quality == null ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', opts.quality);
		};

		// 製品と同じ整形。special.html / exam.html は
		//   行の外接矩形で切り出す → ROW_TARGET_HEIGHT(56) まで拡大 → 白地に余白付きで並べ直す
		//   → preprocessVariants()（コントラスト伸張＋適応二値化／反転／原画）
		// という順で Tesseract に渡している。カード1枚＝1行なので、同じ手順を1行ぶんだけ行う。
		// 拡大率・余白・二値化はすべて common.js の定数と関数をそのまま使う（複製しない）。
		window.__tightenAndScale = function (canvas) {
			const w = canvas.width, h = canvas.height;
			const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
			let x0 = w, x1 = -1, y0 = h, y1 = -1;
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const p = (y * w + x) * 4;
					const gray = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
					if (gray < 128) {
						if (x < x0) x0 = x;
						if (x > x1) x1 = x;
						if (y < y0) y0 = y;
						if (y > y1) y1 = y;
					}
				}
			}
			if (x1 < 0) return canvas; // 文字が見つからない
			const pad = 4; // common.js の detectSkillRows() が行の外接矩形に付ける余白と同じ
			const rx = Math.max(0, x0 - pad), ry = Math.max(0, y0 - pad);
			const rw = Math.min(w - rx, x1 - x0 + 1 + pad * 2), rh = Math.min(h - ry, y1 - y0 + 1 + pad * 2);
			// stackRows() と同じ倍率の決め方（1〜4倍に収める）
			const scale = Math.max(1, Math.min(4, ROW_TARGET_HEIGHT / rh));
			const padX = 30, gap = Math.round(ROW_TARGET_HEIGHT * 0.6);
			const out = document.createElement('canvas');
			out.width = Math.round(rw * scale) + padX * 2;
			out.height = Math.round(rh * scale) + gap * 2;
			const ctx = out.getContext('2d');
			ctx.fillStyle = '#FFFFFF';
			ctx.fillRect(0, 0, out.width, out.height);
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(canvas, rx, ry, rw, rh, padX, gap, Math.round(rw * scale), Math.round(rh * scale));
			return out;
		};

		window.__prepare = async function (dataUrl, opts) {
			const o = opts || {};
			let url = dataUrl;
			// 劣化は「撮った後に起きること」なので先に適用する
			if ((o.scale != null && o.scale !== 1) || o.quality != null) url = await window.__transform(url, o);
			const degradedUrl = url;
			let canvas = await window.__toCanvas(url);
			const ink = window.__inkHeight(canvas);
			if (o.productLike) canvas = window.__tightenAndScale(canvas);
			const variants = o.productLike
				? preprocessVariants(canvas, true) // common.js
				: [canvas];
			return { urls: variants.map((c) => c.toDataURL('image/png')), ink: ink, degradedUrl: degradedUrl };
		};

		window.__recognize = async function (dataUrl) {
			const res = await window.__worker.recognize(dataUrl);
			const d = res.data || {};
			const lines = (d.lines || []).map((l) => ({ text: l.text, confidence: l.confidence }));
			return { text: (d.text || '').trim(), confidence: d.confidence, lines };
		};
	}, options.psm || DEFAULT_PSM);
	if (errors.length) console.error('  [page error]', errors.join('\n'));
	return {
		browser,
		page,
		async setPsm(psm) {
			await page.evaluate(async (p) => {
				await window.__worker.setParameters({ tessedit_pageseg_mode: p });
				window.__psm = p;
			}, psm);
		},
		recognize: (dataUrl) => page.evaluate((u) => window.__recognize(u), dataUrl),
		transform: (dataUrl, opts) => page.evaluate(([u, o]) => window.__transform(u, o), [dataUrl, opts]),
		/**
		 * 1枚ぶんを「劣化 → 整形 → 各変種をOCR」まで通す（ブラウザとの往復を1回にまとめる）。
		 * 戻り値: { ink, reads: [{ text, confidence }...] }（変種の数だけ読みが並ぶ）
		 */
		prepareAndRecognize: (dataUrl, opts) =>
			page.evaluate(
				async ([u, o]) => {
					const prep = await window.__prepare(u, o);
					const reads = [];
					for (const url of prep.urls) {
						const r = await window.__recognize(url);
						reads.push({ text: r.text, confidence: r.confidence });
					}
					return { ink: prep.ink, reads: reads };
				},
				[dataUrl, opts || {}]
			),
		/** 劣化させた画像そのものを取り出す（実物を目で見るため）。 */
		prepare: (dataUrl, opts) => page.evaluate(([u, o]) => window.__prepare(u, o), [dataUrl, opts || {}]),
		inkHeight: (dataUrl) =>
			page.evaluate(async (u) => window.__inkHeight(await window.__toCanvas(u)), dataUrl),
		/** 因子画面の実画像を common.js の行検出にかけ、各行の「文字の高さ」を測る。 */
		measureFactorRows: (dataUrl) =>
			page.evaluate(async (u) => {
				const img = new Image();
				await new Promise((res, rej) => {
					img.onload = res;
					img.onerror = () => rej(new Error('画像を読めませんでした'));
					img.src = u;
				});
				const base = toBaseCanvas(img); // common.js
				const diag = [];
				const det = detectSkillRows(base, diag);
				if (!det) return { baseWidth: base.width, baseHeight: base.height, natural: { w: img.naturalWidth, h: img.naturalHeight }, rows: [], diag };
				const rows = det.rows.map((row) => {
					const rect = { x: row.x, y: row.y, w: row.w, h: row.h };
					return { rect, ink: window.__inkHeight(base, rect) };
				});
				return { baseWidth: base.width, baseHeight: base.height, natural: { w: img.naturalWidth, h: img.naturalHeight }, rows, diag };
			}, dataUrl),
		close: () => browser.close()
	};
}
