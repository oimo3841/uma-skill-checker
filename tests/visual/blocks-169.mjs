// T167（2026-11-11・決定 675・676・684）: 行の上に乗ったカーソルを消す新しい段（案 d1）の検査。塊の見出しはすべて「T167」で始まる
// （`npm run test:visual -- --only=T167`）。run-smoke.mjs の末尾から register169() で呼ばれる。
//
// js/pc-capture.js の removePointer: 覚える段（learnFrom）が見つける「自分だけが違い、スクロール量の違う相手2枚どうしは合う小さな塊」を、
// その場で相手の画素で置き換える。一覧の端（先頭・末尾）の、ほかの画が写さない行は、一覧が止まっている間の同じ位置の別の時刻の画2枚
// （時刻が離れていて互いに合う）を相手にする。横画面（T166 で形の総当たりをやめた）・縦画面の両方で動く。
//
// 作り物（blocks-100 の一覧・blocks-131 の余白とスクロールバー・blocks-119 の緑のカーソル）を横画面の出どころ（kind に landscape: が入る）と
// 縦画面の出どころで回し、結合画像の緑の画素の数と、カーソルの無い作り物の結合画像との画素の違いを見る:
//  (1) 動いているカーソル・止まったままのカーソル・スクロールバーを引っ張るカーソル・一覧の末尾で止まっている間に動くカーソル: 消える。中身は壊れない
//  (2) 一覧の末尾で止まっている間ずっと同じ所に留まるカーソル: 残る（相手が無い。消せないことを表に残す）。中身は壊れない
//  (3) カーソルの無い動画は何も変えない（素材の画をそのまま返す）
import { SYNTH85 } from './blocks-100.mjs';
import { POINTER } from './blocks-119.mjs';
import { BAR } from './blocks-131.mjs';

export const SYNTH169 = String.raw`
window.__t167 = (function () {
	// 横画面の出どころのまね（kind に landscape: を入れるだけ。画はそのまま）
	function as(kind, s) {
		return UmaVideoFrames.canvasSource({ kind, exact: true, width: s.width, height: s.height, duration: s.duration,
			async draw(t, ctx, dw, dh, how) { await s.drawAt(t, ctx, dw, dh, null, how); },
			close() { s.close(); } });
	}
	// カーソルの無い画との違い（差 24 を超える画素の数と、その四角。行の所＝余白の左まで）
	function diffPx(a, b) {
		const w = Math.min(a.width, b.width, __bar.X), h = Math.min(a.height, b.height);
		const da = a.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, db = b.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
		let n = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const p = (y * w + x) * 4;
			if ((Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2])) / 3 <= 24) continue;
			n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
		}
		return { n, box: n ? [x0, y0, x1 + 1, y1 + 1] : null, ha: a.height, hb: b.height };
	}
	// 一覧の末尾で止まるまね: blocks-100 の stops の 3260px の止まり（7.5秒〜。緑の帯が帯の上から 608px）で、そのまま 1.4秒止まって終わる。
	// 止まりの下の端の行（祖2 の最後の行）は、スクロール量の違うほかの画にはほとんど写らない
	const HOLD0 = 7.5, HOLD1 = 8.2, HOLD_END = 8.9;
	const TAIL = [[430, 470], [300, 200], [180, 536], [520, 380], [60, 250], [250, 520]];
	function hold(s) {
		return UmaVideoFrames.canvasSource({ kind: 'hold', exact: true, width: s.width, height: s.height, duration: HOLD_END,
			async draw(t, ctx, dw, dh, how) { await s.drawAt(Math.min(t, HOLD1), ctx, dw, dh, null, how); },
			close() { s.close(); } });
	}
	const CASES = {
		'動いている': { at: (s) => (t) => [90 + (Math.floor(t * 4) * 97) % 440, s.HE + 40 + (Math.floor(t * 4) * 131) % 600] },
		'止まったまま': { at: (s) => () => [250, s.HE + 260] },
		'スクロールバーを引っ張る': { at: (s) => (t) => [__bar.TX0 - 4, __bar.thumbY(s, t) + 30] },
		// 止まっている間に 0.25秒ごとに別の所へ（実物の録画の末尾と同じく、あちこちに動く）
		'末尾で止まっている間に動く': { tail: true, at: (s) => (t) => (t < HOLD0 ? null : TAIL[Math.min(TAIL.length - 1, Math.floor((t - HOLD0) / 0.25))].map((v, i) => (i ? s.HE + v : v))) },
		'末尾で止まっている間ずっと同じ所': { tail: true, at: (s) => (t) => (t < HOLD0 ? null : [180, s.HE + 536]) },
		// 2か所を行き来する: どちらの所が中身か画素からは決められない。消せずに残るが、相手の画のカーソルを写し込まない
		'末尾で2か所を行き来': { tail: true, at: (s) => (t) => (t < HOLD0 ? null : (Math.floor((t - HOLD0) / 0.3) % 2 ? [180, s.HE + 536] : [430, s.HE + 470])) },
	};
	async function run(name, landscape) {
		const make = () => { const s = __synth85.make({ path: 'stops' }); s.bar = __bar.wrap(s, {}); return s; };
		const kind = landscape ? 'landscape:t167' : 't167';
		const c = CASES[name] || {}, base = (s) => (c.tail ? hold(s.bar) : s.bar), withPtr = (s) => (name ? __ptr.wrap(base(s), c.at(s)) : base(s));
		// 比べの元: カーソルの無い作り物を、同じ処理（横画面は余白を塗る）に通したもの
		const s0 = make();
		const clean = await __ptr.build(as(kind, base(s0)), true);
		const s1 = make();
		const raw = name ? await __ptr.build(as(kind, withPtr(s1)), false) : null;
		const s2 = make();
		const before = devGeometry.length, t0 = performance.now();
		const done = await __ptr.build(as(kind, withPtr(s2)), true);
		const ms = Math.round(performance.now() - t0);
		return {
			raw: raw ? raw.persons.reduce((a, c) => a + __ptr.count(c), 0) : 0,
			left: done.persons.reduce((a, c) => a + __ptr.count(c), 0),
			diff: done.persons.map((c, i) => diffPx(c, clean.persons[i])),
			lines: (done.stat.lines || []).length, cells: done.stat.cells, margin: done.stat.margin ? done.stat.margin.cells : null, frames: done.stat.frames,
			same: done.persons.length === clean.persons.length && done.sel.persons.every((p, i) => p.files.length === clean.sel.persons[i].files.length),
			log: devGeometry.slice(before).filter((l) => /^\[動画\] カーソル/.test(l)), ms,
		};
	}
	return { run, CASES: Object.keys(CASES) };
})();
`;

export async function register169(env) {
	const { block, browser, base } = env;
	const assert = (cond, label, extra) => env.assert(cond, 'T167 ' + label, extra);
	const open = async () => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(300000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.goto(base + '/lab/pc-capture-diag.html');
		await page.addScriptTag({ content: SYNTH85 });
		await page.addScriptTag({ content: POINTER });
		await page.addScriptTag({ content: BAR });
		await page.addScriptTag({ content: SYNTH169 });
		return { ctx, page, errors };
	};
	const show = (v) => '緑 ' + v.raw + '→' + v.left + '・行の上 ' + v.lines + '・形 ' + v.cells + '・余白 ' + v.margin + '・違う画素 ' + v.diff.map((d) => d.n + (d.box ? '[' + d.box.join(',') + ']' : '')).join('/');

	for (const landscape of [true, false]) {
		const side = landscape ? '横画面' : '縦画面';
		await block('T167(1) ' + side + ': 動いている・止まったまま・スクロールバーを引っ張る・末尾で止まっている間に動くカーソルが消え、中身は壊れない', async () => {
			const { ctx, page, errors } = await open();
			for (const name of ['動いている', '止まったまま', 'スクロールバーを引っ張る', '末尾で止まっている間に動く']) {
				const v = await page.evaluate(({ name, landscape }) => __t167.run(name, landscape), { name, landscape });
				assert(v.raw > 100, `(1) ${side}・${name}: 消す前は結合画像にカーソルが写っている（検査が効いている。${show(v)}）`, v);
				assert(v.left === 0, `(1) ${side}・${name}: 結合画像にカーソルの色の画素が無い（${show(v)}）`, v);
				assert(v.same && v.diff.every((d) => d.ha === d.hb && d.n <= 40), `(1) ${side}・${name}: 行の所はカーソルの無い作り物（同じ処理に通したもの）と同じ（違う画素は人ごとに 40 以下。${show(v)}）`, v.diff);
			}
			assert(errors.length === 0, `(1) ${side}: コンソールのエラーなし`, errors);
			await ctx.close();
		});
	}

	await block('T167(2) 横画面: 末尾で止まっている間ずっと同じ所・2か所を行き来するカーソルは残る（決められない）が、相手の画のカーソルを写し込まない。開発ログに「行の上」', async () => {
		const { ctx, page, errors } = await open();
		for (const name of ['末尾で止まっている間ずっと同じ所', '末尾で2か所を行き来']) {
			const v = await page.evaluate((n) => __t167.run(n, true), name);
			assert(v.raw > 100 && v.left === v.raw && v.lines === 0, `(2) ${name}: 置き換えずに残る（今の作りの限り。${show(v)}）`, v);
			// 違う画素はカーソルそのものだけ（緑の画素の数より少し多い＝縁の線。ほかの所に相手の画のカーソルを写し込んでいない）
			assert(v.same && v.diff.every((d) => d.ha === d.hb) && v.diff.reduce((a, d) => a + d.n, 0) <= v.raw * 2.5, `(2) ${name}: 違う画素はカーソルの所だけ（${show(v)}）`, v.diff);
		}
		const m = await page.evaluate(() => __t167.run('動いている', true));
		assert(m.log.length === 1 && /^\[動画\] カーソル: \d+ms・形 なし・行の上 [1-9]\d*(（足した相手 \d+）)?・置き換え 0・/.test(m.log[0]), '(2) 横画面の開発ログ: 形は覚えず（形 なし）、行の上で置き換えた数が出る', m.log);
		assert(errors.length === 0, '(2) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T167(3) カーソルの無い動画は何も変えない（横画面・縦画面とも、余白のほかは素材の画をそのまま）', async () => {
		const { ctx, page, errors } = await open();
		for (const landscape of [true, false]) {
			const v = await page.evaluate((l) => __t167.run(null, l), landscape);
			assert(v.lines === 0 && v.cells === 0 && v.diff.every((d) => d.n === 0), '(3) ' + (landscape ? '横画面' : '縦画面') + ': 置き換え 0・結合画像はカーソルの無い作り物と画素まで同じ（' + show(v) + '）', v);
		}
		assert(errors.length === 0, '(3) コンソールのエラーなし', errors);
		await ctx.close();
	});
}
