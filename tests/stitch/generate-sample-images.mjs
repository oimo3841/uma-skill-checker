// まだ実際のテスト画像(実機スクリーンショット)が無い段階で、ハーネス自体の
// 動作確認をするための合成サンプル画像を test-images/ 配下に生成する。
//
// 実際のテスト画像が揃ったら、ここで作った sample_* ケースは削除してよい。
//
// 使い方:
//   npm run test:stitch:gen-samples

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSliceInPage } from './lib/browser-draw.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGES_DIR = path.resolve(__dirname, '../../test-images');

const WIDTH = 900;
const HEADER_H = 150;
const FOOTER_H = 150;
const VIEWPORT_H = 1530; // aspect 1530/900 = 1.7 -> DMM版プロファイル(1.55-1.95)の範囲内
const CONTENT_WINDOW_H = VIEWPORT_H - HEADER_H - FOOTER_H; // 1230
const ROW_H = 130;

async function saveDataUrl(dataUrl, filePath) {
	const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
}

function scrollbarFor(scrollY, maxScrollY) {
	const thumbLen = Math.round((CONTENT_WINDOW_H / (maxScrollY + CONTENT_WINDOW_H)) * CONTENT_WINDOW_H);
	const first = Math.round((scrollY / maxScrollY) * (CONTENT_WINDOW_H - thumbLen));
	return { first, span: thumbLen };
}

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage();

	async function slice(opts) {
		const dataUrl = await page.evaluate(makeSliceInPage, {
			width: WIDTH,
			headerH: HEADER_H,
			footerH: FOOTER_H,
			contentWindowH: CONTENT_WINDOW_H,
			rowH: ROW_H,
			rowMode: 'unique',
			scrollbar: null,
			blankFrom: null,
			...opts,
		});
		return dataUrl;
	}

	// --- 1. 基本ケース: 3枚、はっきり見分けの付く行内容、きれいに重なる ---
	{
		const scrollYs = [0, 700, 1400];
		for (let i = 0; i < scrollYs.length; i++) {
			const dataUrl = await slice({ scrollY: scrollYs[i], label: 'basic' });
			await saveDataUrl(dataUrl, path.join(TEST_IMAGES_DIR, 'sample_basic_overlap', `0${i + 1}.png`));
		}
	}

	// --- 2. アップロード順がバラバラでも、スクロールバーのつまみ位置から
	//        正しい順序に並び替えられるか ---
	{
		const scrollYs = [0, 700, 1400];
		const maxScrollY = 1400;
		const dataUrls = [];
		for (const scrollY of scrollYs) {
			dataUrls.push(
				await slice({
					scrollY,
					label: 'shuffled',
					scrollbar: scrollbarFor(scrollY, maxScrollY),
				})
			);
		}
		// true order = [0,1,2] だが、わざとファイル名の順序をシャッフルして保存する。
		// 01.png=scrollY1400, 02.png=scrollY0, 03.png=scrollY700
		const shuffleOrder = [2, 0, 1];
		for (let i = 0; i < shuffleOrder.length; i++) {
			await saveDataUrl(
				dataUrls[shuffleOrder[i]],
				path.join(TEST_IMAGES_DIR, 'sample_shuffled_order', `0${i + 1}.png`)
			);
		}
	}

	// --- 3. 継ぎ目の一致度が低いケース: 行の見た目が単調で区別が付かない
	//        (実データで報告された「丸角パネルが行によらずほぼ同じ形」を再現) ---
	{
		const scrollYs = [0, 700];
		for (let i = 0; i < scrollYs.length; i++) {
			const dataUrl = await slice({ scrollY: scrollYs[i], label: 'low-confidence', rowMode: 'uniform' });
			await saveDataUrl(dataUrl, path.join(TEST_IMAGES_DIR, 'sample_low_confidence_seam', `0${i + 1}.png`));
		}
	}

	// --- 4. 末尾の余白トリミング: 2枚目の末尾に空白のスクロール領域がある ---
	{
		const scrollYs = [0, 700];
		const blankFrom = 700 + CONTENT_WINDOW_H - 300; // 末尾300pxを空白にする
		for (let i = 0; i < scrollYs.length; i++) {
			const dataUrl = await slice({ scrollY: scrollYs[i], label: 'trailing-blank', blankFrom });
			await saveDataUrl(dataUrl, path.join(TEST_IMAGES_DIR, 'sample_trailing_blank', `0${i + 1}.png`));
		}
	}

	// --- 5. 画像1枚のみ(結合には2枚以上が必要、というガードの確認用) ---
	{
		const dataUrl = await slice({ scrollY: 0, label: 'single' });
		await saveDataUrl(dataUrl, path.join(TEST_IMAGES_DIR, 'sample_single_image', '01.png'));
	}

	// --- 6. 幅が違う画像(標準的なスクロールキャプチャではない、というガードの確認用) ---
	{
		const a = await slice({ scrollY: 0, label: 'width-a' });
		const b = await page.evaluate(makeSliceInPage, {
			width: 1000,
			headerH: Math.round((1000 / WIDTH) * HEADER_H),
			footerH: Math.round((1000 / WIDTH) * FOOTER_H),
			contentWindowH: Math.round((1000 / WIDTH) * CONTENT_WINDOW_H),
			rowH: Math.round((1000 / WIDTH) * ROW_H),
			rowMode: 'unique',
			scrollbar: null,
			blankFrom: null,
			scrollY: 0,
			label: 'width-b',
		});
		await saveDataUrl(a, path.join(TEST_IMAGES_DIR, 'sample_width_mismatch', '01.png'));
		await saveDataUrl(b, path.join(TEST_IMAGES_DIR, 'sample_width_mismatch', '02.png'));
	}

	// --- 7. 標準的なスクリーンショットのサイズ範囲外(結合済み/加工済み画像を
	//        アップロードしてしまったケースの再現) ---
	{
		for (const n of [1, 2]) {
			const dataUrl = await page.evaluate(({ n }) => {
				const c = document.createElement('canvas');
				c.width = 900;
				c.height = 900; // aspect 1.0 -> 既知プロファイル(1.55-1.95 / 1.9-2.5)の範囲外
				const ctx = c.getContext('2d');
				ctx.fillStyle = '#eeeeee';
				ctx.fillRect(0, 0, c.width, c.height);
				ctx.fillStyle = '#c0392b';
				ctx.font = 'bold 40px sans-serif';
				ctx.textBaseline = 'top';
				ctx.fillText('BAD ASPECT SAMPLE #' + n, 30, 30);
				ctx.fillText('900x900 (aspect 1.0)', 30, 90);
				return c.toDataURL('image/png');
			}, { n });
			await saveDataUrl(dataUrl, path.join(TEST_IMAGES_DIR, 'sample_reject_bad_size', `0${n}.png`));
		}
	}

	await browser.close();

	console.log('サンプルケースを生成しました:');
	const dirs = await fs.readdir(TEST_IMAGES_DIR, { withFileTypes: true });
	for (const d of dirs) {
		if (d.isDirectory() && d.name.startsWith('sample_')) console.log('  - ' + d.name);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
