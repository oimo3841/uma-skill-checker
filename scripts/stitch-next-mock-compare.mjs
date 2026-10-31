// T44 結合画像の次の直しのモック（作業用）: 画像を同じ縮尺で左右に並べる（上に見出し）。T37 の compare.mjs を N 枚に広げたもの。
// 使い方: node scripts/stitch-next-mock-compare.mjs <出力> <画像1> <見出し1> <画像2> <見出し2> ...
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, ...rest] = process.argv.slice(2);
const items = [];
for (let i = 0; i + 1 < rest.length; i += 2) items.push({ url: 'data:image/png;base64,' + fs.readFileSync(rest[i]).toString('base64'), label: rest[i + 1] });
if (!out || items.length === 0) { console.error('使い方: node scripts/stitch-next-mock-compare.mjs <出力> <画像1> <見出し1> ...'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const png = await page.evaluate(async (items) => {
	const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
	const imgs = [];
	for (const it of items) imgs.push(await load(it.url));
	const gap = 40, head = 60;
	const c = document.createElement('canvas');
	c.width = imgs.reduce((s, i) => s + i.width, 0) + gap * (imgs.length - 1);
	c.height = Math.max(...imgs.map((i) => i.height)) + head;
	const g = c.getContext('2d');
	g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height);
	g.font = 'bold 32px sans-serif'; g.textBaseline = 'middle';
	let x = 0;
	imgs.forEach((img, i) => {
		g.fillStyle = '#333333';
		g.fillText(items[i].label, x + 10, head / 2);
		g.drawImage(img, x, head);
		if (i > 0) { g.fillStyle = '#999999'; g.fillRect(x - gap / 2 - 1, 0, 2, c.height); }
		x += img.width + gap;
	});
	return c.toDataURL('image/png');
}, items);
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
await browser.close();
console.log('wrote', out);
