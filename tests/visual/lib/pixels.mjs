/* ============================================================
 * スクリーンショットの画素から、実際に描かれている色を取り出す（72セッション目・段11 ⑨）
 *
 * **なぜ要るか**: `getComputedStyle` が返すのは**指定値**で、画面に出ている色ではない。
 * `.glass-card` は `rgba(255,255,255,.9)` ＋ `backdrop-filter` で、その下にページの地
 * （グラデーション）がある。**半透明の重なりの結果**を見ないと、
 * 「色は変わっているのに、変わったと分からない」状態を検査で捕まえられない
 * （段11 ⑨ で実際にそうなった ―― 札と本体が同じ値であることも、トークンが白でないことも
 *   見ていたのに、**周りとの差が小さすぎる**のは素通りした）。
 *
 * PNG のデコードは Node 同梱の zlib だけで行う（検査のために依存を増やさない）。
 * Playwright のスクリーンショットは 8bit・非インターレース。colorType 6(RGBA)/2(RGB) に対応。
 * ============================================================ */
import { inflateSync } from 'node:zlib';

export function decodePng(buf) {
	let off = 8, w = 0, h = 0, depth = 0, ctype = 0;
	const idat = [];
	while (off < buf.length) {
		const len = buf.readUInt32BE(off);
		const type = buf.toString('ascii', off + 4, off + 8);
		const data = buf.subarray(off + 8, off + 8 + len);
		if (type === 'IHDR') {
			w = data.readUInt32BE(0); h = data.readUInt32BE(4);
			depth = data[8]; ctype = data[9];
			if (depth !== 8 || (ctype !== 6 && ctype !== 2)) throw new Error('未対応のPNG: depth=' + depth + ' colorType=' + ctype);
			if (data[12] !== 0) throw new Error('インターレースPNGは未対応');
		} else if (type === 'IDAT') idat.push(data);
		else if (type === 'IEND') break;
		off += 12 + len;
	}
	const bpp = ctype === 6 ? 4 : 3;
	const raw = inflateSync(Buffer.concat(idat));
	const out = Buffer.alloc(w * h * bpp);
	const stride = w * bpp;
	for (let y = 0; y < h; y++) {
		const filter = raw[y * (stride + 1)];
		const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
		for (let x = 0; x < stride; x++) {
			const a = x >= bpp ? out[y * stride + x - bpp] : 0;
			const b = y > 0 ? out[(y - 1) * stride + x] : 0;
			const c = (x >= bpp && y > 0) ? out[(y - 1) * stride + x - bpp] : 0;
			let v = line[x];
			if (filter === 1) v += a;
			else if (filter === 2) v += b;
			else if (filter === 3) v += (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
				v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
			}
			out[y * stride + x] = v & 255;
		}
	}
	return { w, h, bpp, px: out };
}

/** PNG（小さな切り抜き）の画素の平均を [r,g,b] で返す。 */
export function avgColor(buf) {
	const { w, h, bpp, px } = decodePng(buf);
	let r = 0, g = 0, b = 0;
	for (let i = 0; i < w * h; i++) { r += px[i * bpp]; g += px[i * bpp + 1]; b += px[i * bpp + 2]; }
	const n = w * h;
	return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG のコントラスト比（1〜21）。**明るい色どうしでは鈍い**ので、面の差の判定には使わない。 */
export function contrastRatio(a, b) {
	const l1 = lum(a), l2 = lum(b);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function toLab([r, g, b]) {
	const [R, G, B] = [lin(r), lin(g), lin(b)];
	let x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
	let y = (0.2126 * R + 0.7152 * G + 0.0722 * B);
	let z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
	const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
	[x, y, z] = [f(x), f(y), f(z)];
	return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 の色差 ΔE。**面どうしの「見て分かるか」はこちらで見る**（下の目安を参照）。
 *   〜2.3 … 並べても見分けが付かない（JND）
 *   3〜5  … 近くで見れば違うと分かる
 *   5〜   … はっきり違って見える
 */
export function deltaE(a, b) {
	const A = toLab(a), B = toLab(b);
	return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
}

export const hexOf = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
