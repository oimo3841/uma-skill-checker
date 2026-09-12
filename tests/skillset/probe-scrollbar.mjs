// スクロールバーのつまみの位置を測れるかを調べる調査スクリプト（使い捨てではなく、
// 検証時に端末差を確かめるために残す）。
//   node tests/skillset/probe-scrollbar.mjs <画像パス> [<画像パス> ...]
import { openAnalyzer, fileToDataUrl } from './lib/browser.mjs';

const files = process.argv.slice(2);
const a = await openAnalyzer();
try {
	for (const file of files) {
		const res = await a.page.evaluate(async (u) => {
			const c = await window.__decode(u);
			return window.SkillsetCards.detectScrollThumb(c.getContext('2d').getImageData(0, 0, c.width, c.height));
		}, await fileToDataUrl(file));
		console.log(file.split(/[\\/]/).pop(), JSON.stringify(res));
	}
} finally {
	await a.close();
}
