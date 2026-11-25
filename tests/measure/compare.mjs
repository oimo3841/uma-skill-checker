// T216（B4）: 変える前・変えた後の測りの結果（pv.cjs の出力）を比べる。
//   node tests/measure/compare.mjs <前.json> <後.json> [--check=<選んだ組の一覧ファイル>] [--out=<結果.json>]
// 組ごと・幅ごとに、画面の文字つき部品（位置・大きさ・角・色・字など）と前面の窓・横スクロールの差を数える。
// --check を付けると、「差が出た組」がすべて「選んだ組」に入っているかを確かめる（取りこぼし 0 の確かめ）。
import fs from 'node:fs';

const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith('--'));
const opt = (k) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const A = JSON.parse(fs.readFileSync(files[0], 'utf8'));
const B = JSON.parse(fs.readFileSync(files[1], 'utf8'));
// 時刻・処理途中で揺れる部品を数えないための、比べる項目（collect.js の items の項目）
const KEYS = ['t', 'tag', 'cls', 'dis', 'lines', 'x', 'y', 'tw', 'clip', 'offR', 'w', 'h', 'rad', 'bgi', 'bg', 'bd', 'bdb', 'col', 'fs', 'fw', 'op', 'ws'];
const sig = (it) => KEYS.map((k) => it[k]).join('|');
const changed = {}; const unmeasured = [];
for (const job of Object.keys(A)) {
	if (!B[job]) continue;
	if (A[job].fail || B[job].fail) { unmeasured.push(job); continue; }
	let diff = 0; const widths = [];
	for (const w of Object.keys(A[job].byW || {})) {
		const a = A[job].byW[w], b = (B[job].byW || {})[w];
		if (!b) continue;
		const sa = new Map(); a.items.forEach((it) => sa.set(sig(it), (sa.get(sig(it)) || 0) + 1));
		let d = 0; const used = new Map();
		b.items.forEach((it) => { const s = sig(it); const c = (sa.get(s) || 0) - (used.get(s) || 0); if (c > 0) used.set(s, (used.get(s) || 0) + 1); else d++; });
		d += Math.max(0, a.items.length - b.items.length);
		if (a.sx !== b.sx) d++;
		if (JSON.stringify(a.pop) !== JSON.stringify(b.pop)) d++;
		if (d) { diff += d; widths.push(w); }
	}
	if (diff) changed[job] = { diff, widths };
}
const total = Object.keys(A).filter((j) => B[j]).length;
console.log('比べた組 ' + total + '・差が出た組 ' + Object.keys(changed).length + '・測れなかった組 ' + unmeasured.length + (unmeasured.length ? '（' + unmeasured.join(',') + '）' : ''));
for (const [j, v] of Object.entries(changed)) console.log('  差 ' + j + '  ' + v.diff + '件  幅 ' + v.widths.join(','));
let miss = [];
if (opt('check')) {
	const sel = new Set(fs.readFileSync(opt('check'), 'utf8').split(/\s+/).filter(Boolean));
	miss = Object.keys(changed).filter((j) => !sel.has(j));
	console.log('選んだ組 ' + sel.size + '・差が出た組のうち選ばれなかった組（取りこぼし） ' + miss.length + (miss.length ? '：' + miss.join(',') : ''));
}
if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify({ total, changed, unmeasured, miss }, null, 1));
process.exit(miss.length ? 1 : 0);
