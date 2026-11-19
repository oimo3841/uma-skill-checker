// T196（2026-11-19・おいもさんの決定 763・766・833・834）: 動画の取り込みを速くする直し（V5a カーソルの処理を軽く・ずれの計算の打ち切り・書き出しは2枚まで）の
// 要の動きの検査。結果（選ぶ画・カーソルを直した画・結合画像）は変えない直しなので、本物の録画で直す前と後がバイトまで同じことは
// test:video-local の --save（既定・--special・--exam・--skill）と T105 の取り込み・横画面の録画の画素の比べで見る。ここは作り物で
// 「答えが全部を数える形と同じ」「打ち切り・控えが実際に効いている」「同時に待つのは2枚」を見る。
// run-smoke.mjs の末尾から register184() で呼ばれる（塊の見出しはすべて「T196」で始まる。`npm run test:visual -- --only=T196` で回せる）。
//
//  (1) ずれの計算の打ち切り（js/video-frames.js の scanRange・coarseScan）: 直す前（57bf834）の数え方をこのページに写したものと、文書らしい作り物の
//      縮小画（雑音・白紙・ずれ違いを含む）で答え（shift・badRate・secondBadRate・confident）が全部同じ。打ち切ったずれがある。作り物の MP4
//      （blocks-101 の stops・エフェクトのまね）の selectFrames で、エフェクトの置き換えの候補のずれの計算でも打ち切りが効き（stats.scanCut）、結合画像は一覧と合う。
//  (2) V5a（js/pc-capture.js の removePointer）: 作り物（blocks-100 の一覧・blocks-131 の余白・blocks-119 のカーソル）を横画面・縦画面の出どころで通し、
//      相手の集まりとのずれ（candsOf）を同じ画で測り直さない（控えを使った数 > 0）・ずれの合わせと区画の比べで打ち切りが効く・カーソルが消え、
//      カーソルの無い作り物と同じ。2回とも PNG のバイトが同じ。
//  (3) 書き出しは2枚まで（決定 834）: toBlob の返りを遅らせたとき、取り直しの JPEG・カーソルを直した画の PNG とも同時に待つのは 2（前は 3）。バイトは遅らせないときと同じ。
//  壊す確認（2026-11-19）: 直す前の製品（57bf834）で回すと NG になること（T196-check-1.md）。
import { SYNTH85 } from './blocks-100.mjs';
import { MP4 } from './blocks-101.mjs';
import { POINTER } from './blocks-119.mjs';
import { BAR } from './blocks-131.mjs';

export const T196 = String.raw`
window.__t196 = (function () {
	const fnv = (u8) => { let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
	async function hashFiles(files) { const out = []; for (const f of files) out.push(fnv(new Uint8Array(await f.arrayBuffer()))); return out; }
	const hashCanvas = (c) => fnv(c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data);
	// 直す前（57bf834）の scanRange・coarseScan（端から全部を数える）
	function refScanRange(a, b, d0, d1, ys, xs) {
		const w = a.w, h = a.h, A = a.gray, B = b.gray;
		let best = -1, bestBad = Infinity;
		for (let d = Math.max(1, d0); d <= Math.min(h - 60, d1); d++) {
			const rows = h - d;
			let bad = 0, tot = 0, ink = 0;
			for (let y = 0; y < rows; y += ys) {
				const ra = (y + d) * w, rb = y * w;
				for (let x = 0; x < w; x += xs) { const p = A[ra + x], q = B[rb + x]; if (p < 240 || q < 240) ink++; if (Math.abs(p - q) > 24) bad++; tot++; }
			}
			if (tot === 0 || ink < tot * 0.05) continue;
			const rate = bad / tot;
			if (rate < bestBad) { bestBad = rate; best = d; }
		}
		return { shift: best, badRate: bestBad };
	}
	function refCoarseScan(a, b, ys, xs) {
		const w = a.w, h = a.h, A = a.gray, B = b.gray;
		const maxShift = h - 60;
		const rates = new Float64Array(Math.max(1, maxShift + 1)).fill(Infinity);
		for (let d = 1; d <= maxShift; d++) {
			let bad = 0, tot = 0, ink = 0;
			for (let y = 0; y < h - d; y += ys) {
				const ra = (y + d) * w, rb = y * w;
				for (let x = 0; x < w; x += xs) { const p = A[ra + x], q = B[rb + x]; if (p < 240 || q < 240) ink++; if (Math.abs(p - q) > 24) bad++; tot++; }
			}
			if (tot && ink >= tot * 0.05) rates[d] = bad / tot;
		}
		let shift = -1, best = Infinity;
		for (let d = 1; d <= maxShift; d++) if (rates[d] < best) { best = rates[d]; shift = d; }
		let second = Infinity;
		for (let d = 1; d <= maxShift; d++) if (Math.abs(d - shift) > 40 && rates[d] < second) second = rates[d];
		return { shift, badRate: best, secondBadRate: second, confident: shift > 0 && best < 0.03 && (!isFinite(second) || second / best >= 2) };
	}
	// 文書らしい縮小画（白地・行ごとの枠の線と字）。top から h 行を切り出し、noise の割合で画素を乱す
	function makePlanes(seed0) {
		let seed = seed0 >>> 0; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
		const w = 120 + Math.floor(rnd() * 100), h = 300 + Math.floor(rnd() * 700), H = h * 3;
		const doc = new Uint8Array(w * H).fill(250);
		for (let y = 0; y < H; y++) {
			const row = Math.floor(y / 23), iy = y % 23;
			if (iy < 3) { for (let x = 0; x < w; x++) doc[y * w + x] = 205; continue; }
			if (iy > 7 && iy < 18) { const s = (row * 7919) % 97; for (let x = 0; x < w; x++) if (((x + s) % 13) < 6 && ((x * 31 + row * 17) % 7) < 5) doc[y * w + x] = 30 + ((x + row) % 50); }
		}
		const noise = rnd() < 0.5 ? rnd() * 0.25 : 0;
		const cut = (top) => { const g = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) { let v = doc[top * w + i]; if (noise && rnd() < noise) v = Math.floor(rnd() * 256); g[i] = v; } return { w, h, gray: g }; };
		const shift = Math.floor(rnd() * h * 0.9), a = cut(shift), b = cut(rnd() < 0.2 ? Math.floor(rnd() * h) : 0);
		if (rnd() < 0.08) b.gray.fill(250);
		return { a, b, shift, h, rnd };
	}
	const eq = (u, v) => u.shift === v.shift && u.badRate === v.badRate && u.secondBadRate === v.secondBadRate && u.confident === v.confident;
	// (1) 答えの突き合わせ（n 組）と、打ち切ったずれの数
	function scanEq(n) {
		const S = UmaVideoFrames._scan;
		if (!S) return { api: false };
		const cut0 = S.stat.cut;
		let cases = 0, diff = 0, found = 0; const bad = [];
		for (let k = 0; k < n; k++) {
			const { a, b, shift, h, rnd } = makePlanes(1000 + k);
			const ys = [1, 2, 3, 8][k % 4], xs = [1, 2, 4][k % 3];
			const d0 = Math.max(-40, shift - Math.floor(rnd() * 120)), d1 = d0 + Math.floor(rnd() * 260) - 10;
			const pairs = [[S.scanRange(a, b, d0, d1, ys, xs), refScanRange(a, b, d0, d1, ys, xs)], [S.scanRange(a, b, shift - 100, shift + 100, 2, 2), refScanRange(a, b, shift - 100, shift + 100, 2, 2)],
				[S.coarseScan(a, b, 8, 4), refCoarseScan(a, b, 8, 4)], [S.coarseScan(b, a, ys, xs), refCoarseScan(b, a, ys, xs)]];
			for (const [u, v] of pairs) { cases++; if (v.shift > 0) found++; if (!eq(u, v)) { diff++; if (bad.length < 4) bad.push({ k, h, shift, d0, d1, ys, xs, got: u, want: v }); } }
		}
		return { api: true, cases, diff, found, cut: S.stat.cut - cut0, bad };
	}
	// (1) の続き: 作り物の MP4（エフェクトのまね）を選ぶ。stats.scanCut と、3人の結合画像が一覧と合うか
	async function scanSelect() {
		const m = await __mp4.build({ path: 'stops', effect: true });
		const src = await UmaVideoFrames.openSource(m.blob);
		const sel = await UmaVideoFrames.selectFrames(src, { labels: ['親', '祖1', '祖2'] });
		src.close();
		const persons = [];
		for (let j = 0; j < sel.persons.length; j++) {
			const p = sel.persons[j], c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still });
			const w = c.width, h = c.height, a = c.getContext('2d').getImageData(0, 0, w, h).data, sy = m.synth;
			if (j >= sy.heads.length) { persons.push({ label: p.label, h, expectH: null, badRows: null }); continue; }
			const top = sy.heads[j], expectH = (j + 1 < sy.heads.length ? sy.heads[j + 1] : sy.green) - sy.heads[j];
			const rows = Math.min(h, sy.docH - top, expectH - 2), b = sy.doc.getContext('2d').getImageData(0, top, w, rows).data;
			let badRows = 0;
			for (let y = 2; y < rows; y += 2) { let rs = 0, rn = 0; for (let x = 0; x < w; x += 3) { const q = (y * w + x) * 4; rs += Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]); rn += 3; } if (rs / rn > 24) badRows++; }
			persons.push({ label: p.label, h, expectH, badRows });
		}
		return { kind: src.kind, scanCut: sel.stats.scanCut, effectPicks: sel.stats.effectPicks, effectCands: sel.stats.effectCands, persons };
	}
	// (2) V5a: 横画面・縦画面の出どころのまね（blocks-169 と同じ作り）で、カーソルを消す
	function as(kind, s) {
		return UmaVideoFrames.canvasSource({ kind, exact: true, width: s.width, height: s.height, duration: s.duration,
			async draw(t, ctx, dw, dh, how) { await s.drawAt(t, ctx, dw, dh, null, how); },
			close() { s.close(); } });
	}
	function diffPx(a, b) {
		const w = Math.min(a.width, b.width, __bar.X), h = Math.min(a.height, b.height);
		const da = a.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, db = b.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
		let n = 0;
		for (let i = 0; i < da.length; i += 4) if ((Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3 > 24) n++;
		return { n, ha: a.height, hb: b.height };
	}
	async function v5a(landscape) {
		const make = () => { const s = __synth85.make({ path: 'stops' }); s.bar = __bar.wrap(s, {}); return s; };
		const kind = landscape ? 'landscape:t196' : 't196';
		const at = (s) => (t) => [90 + (Math.floor(t * 4) * 97) % 440, s.HE + 40 + (Math.floor(t * 4) * 131) % 600];
		const clean = await __ptr.build(as(kind, make().bar), true);
		const runs = [];
		for (let k = 0; k < 2; k++) {
			const s = make();
			const r = await __ptr.build(as(kind, __ptr.wrap(s.bar, at(s))), true);
			const pngs = [];
			for (const p of r.sel.persons) for (const f of p.files) if (/\.png$/.test(f.name) && !pngs.includes(f)) pngs.push(f);
			runs.push({ stat: { candsMemo: r.stat.candsMemo, alignCut: r.stat.alignCut, cellCut: r.stat.cellCut, frames: r.stat.frames, lines: r.stat.lines.length, cells: r.stat.cells, margin: r.stat.margin ? r.stat.margin.cells : null },
				left: r.persons.reduce((a, c) => a + __ptr.count(c), 0), diff: r.persons.map((c, i) => diffPx(c, clean.persons[i])), pngs: await hashFiles(pngs), persons: r.persons.map(hashCanvas) });
		}
		return runs;
	}
	// (3) 書き出し: toBlob の返りを ms 遅らせ、同時に待っている数の最大を数える
	function delayBlobs(ms) {
		const orig = HTMLCanvasElement.prototype.toBlob;
		const st = { pending: 0, max: 0, n: 0 };
		HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
			st.pending++; st.n++; st.max = Math.max(st.max, st.pending);
			return orig.call(this, (b) => setTimeout(() => { st.pending--; cb(b); }, ms), ...a);
		};
		return { st, reset() { st.max = st.pending; st.n = 0; }, restore() { HTMLCanvasElement.prototype.toBlob = orig; } };
	}
	async function enc(delay) {
		const d = delay ? delayBlobs(delay) : null;
		try {
			const s = __synth85.make({ path: 'stops', effect: true });
			s.source.exact = true;
			const sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'] });
			const jpeg = d ? { max: d.st.max, n: d.st.n } : null;
			const files = await hashFiles(sel.files);
			const s2 = __synth85.make({ path: 'stops' });
			const src = __ptr.wrap(s2.source, (t) => [120 + 40 * Math.round(t * 2) % 480, 760 + 30 * Math.round(t * 2) % 480]);
			const debug = {};
			const sel2 = await UmaVideoFrames.selectFrames(src, { labels: ['親', '祖1', '祖2'], debug, effectVote: false });
			if (d) d.reset();
			const rp = await UmaPcCapture.removePointer(src, sel2, debug.track || []);
			const png = d ? { max: d.st.max, n: d.st.n } : null;
			const pngFiles = [];
			for (const p of sel2.persons) for (const f of p.files) if (/\.png$/.test(f.name) && !pngFiles.includes(f)) pngFiles.push(f);
			return { jpeg, png, files, pngs: await hashFiles(pngFiles), frames: rp.frames };
		} finally { if (d) d.restore(); }
	}
	return { scanEq, scanSelect, v5a, enc };
})();
`;

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T196 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script><script src="/js/landscape-panel.js"></script><script src="/js/pc-capture.js"></script>'
	+ '<script>var __pc = window.UmaPcCapture;</script></head><body></body></html>';

export async function register184(env) {
	const { block, assert, browser, base } = env;
	const open = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(300000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t196.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t196.html');
		for (const s of [SYNTH85, MP4, POINTER, BAR, T196]) await page.addScriptTag({ content: s });
		return { ctx, page, errors };
	};

	await block('T196(1) ずれの計算の打ち切り: scanRange・coarseScan の答えが全部を数える形（直す前）と同じで、打ち切りが効く。作り物の MP4 のエフェクトの置き換えでも効き、結合画像は一覧と合う', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(() => __t196.scanEq(160));
		assert(r.api === true, 'T196(1) 検査用の出口（UmaVideoFrames._scan）がある', r);
		assert(r.api && r.cases === 640 && r.diff === 0 && r.found > 300, 'T196(1) 作り物の縮小画 160組×4通りで、答え（shift・badRate・secondBadRate・confident）が全部を数える形と同じ（違い ' + r.diff + '・ずれが見つかった ' + r.found + '）', r.bad || r);
		assert(r.api && r.cut > 1000, 'T196(1) 途中で打ち切ったずれがある（' + r.cut + '）', r);
		const s = await page.evaluate(() => __t196.scanSelect());
		assert(s.kind === 'webcodecs' && s.effectPicks > 0 && typeof s.scanCut === 'number' && s.scanCut > 0, 'T196(1) 作り物の MP4 のエフェクトの置き換えで、ずれの計算の打ち切りが効く（stats.scanCut ' + s.scanCut + '・置き換えた画 ' + s.effectPicks + '・候補 ' + s.effectCands + '）', s);
		assert(s.persons.length === 3 && s.persons.every((p) => p.badRows === 0 && Math.abs(p.h - p.expectH) <= 2), 'T196(1) 3人の結合画像が一覧と合う（' + s.persons.map((p) => p.label + ' ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows).join('／') + '）', s.persons);
		assert(errors.length === 0, 'T196(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	for (const landscape of [true, false]) {
		const side = landscape ? '横画面' : '縦画面';
		await block('T196(2) V5a カーソルの処理を軽く（' + side + '）: 同じ画のずれを測り直さない・ずれの合わせと区画の比べを打ち切る・カーソルが消えて中身は同じ・2回とも PNG が同じ', async () => {
			const { ctx, page, errors } = await open();
			const [a, b] = await page.evaluate((l) => __t196.v5a(l), landscape);
			const sh = (r) => '控えを使った ' + r.stat.candsMemo + '・ずれの打ち切り ' + r.stat.alignCut + '・区画の打ち切り ' + r.stat.cellCut + '・直した画 ' + r.stat.frames + '・行の上 ' + r.stat.lines + '・形 ' + r.stat.cells + '・余白 ' + r.stat.margin;
			assert(a.stat.candsMemo > 0, 'T196(2) ' + side + ': 同じ画の相手とのずれ（candsOf）を、覚える段・確かめ直し・置き換えの段で測り直さない（' + sh(a) + '）', a.stat);
			assert(a.stat.alignCut > 0 && a.stat.cellCut > 0, 'T196(2) ' + side + ': ずれの合わせと区画の比べで、答えに関わらない所を打ち切る（' + sh(a) + '）', a.stat);
			assert(a.stat.frames > 0 && a.left === 0 && a.diff.every((d) => d.ha === d.hb && d.n <= 40), 'T196(2) ' + side + ': カーソルが消え、行の所はカーソルの無い作り物と同じ（違う画素 ' + a.diff.map((d) => d.n).join('/') + '・' + sh(a) + '）', a.diff);
			assert(a.pngs.length === a.stat.frames && a.pngs.join() === b.pngs.join() && a.persons.join() === b.persons.join(), 'T196(2) ' + side + ': 2回ともカーソルを直した画（PNG ' + a.pngs.length + '枚）のバイトと結合画像の画素が同じ', { a: a.pngs, b: b.pngs });
			assert(errors.length === 0, 'T196(2) ' + side + ': コンソールのエラーなし', errors);
			await ctx.close();
		});
	}

	await block('T196(3) 書き出しは2枚まで（決定 834）: toBlob の返りを遅らせたとき、取り直しの JPEG・カーソルを直した画の PNG とも同時に待つのは 2。バイトは遅らせないときと同じ', async () => {
		const { ctx, page, errors } = await open();
		const slow = await page.evaluate(() => __t196.enc(150));
		const fast = await page.evaluate(() => __t196.enc(0));
		assert(slow.jpeg.n === slow.files.length && slow.jpeg.max === 2, 'T196(3) 取り直しの JPEG: 同時に待った最大が 2（' + slow.jpeg.max + '・' + slow.jpeg.n + '枚）', slow.jpeg);
		assert(slow.png.n === slow.frames && slow.frames >= 3 && slow.png.max === 2, 'T196(3) カーソルを直した画の PNG: 同時に待った最大が 2（' + slow.png.max + '・' + slow.png.n + '枚・直した画 ' + slow.frames + '）', slow.png);
		assert(slow.files.join() === fast.files.join() && slow.pngs.join() === fast.pngs.join() && slow.pngs.length === slow.frames, 'T196(3) 出る File（JPEG ' + slow.files.length + '枚・PNG ' + slow.pngs.length + '枚）のバイトが、遅らせないときと同じ', { slow: slow.pngs, fast: fast.pngs });
		assert(errors.length === 0, 'T196(3) コンソールのエラーなし', errors);
		await ctx.close();
	});
}
