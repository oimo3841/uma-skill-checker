// T118（2026-11-07）: PC の取り込みで、スクロールバーの辺り（行の右の余白）のカーソルを消す（js/pc-capture.js の removePointer）の検査。塊の見出しはすべて「T118」で始まる。
// おいもさんの決定（Chat 399）: スクロールバーを引っ張って撮ったときも、結合画像にカーソルが写らないようにする。直し方は任せる。今まで消せていたカーソルは今までどおり（T105 の blocks-119・blocks-122）。
// 本物のカーソルの形は決め打ちしない。ここでは作り物の窓に、作り物の余白・スクロールバー・カーソルを描く。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH85 } from './blocks-100.mjs';
import { FAKE_WINDOW } from './blocks-112.mjs';
import { POINTER } from './blocks-119.mjs';

// 作り物の画面の右に、中身と一緒に動かない余白とスクロールバーを描く。つまみの場所はスクロールの量に合わせて動く
export const BAR = String.raw`
window.__bar = (function () {
	const X = 672, TX0 = 684, TX1 = 696, CARD = 708, TH = 110;
	const thumbY = (s, t) => s.HE + Math.round(s.pos(t) / s.maxScroll * (s.CH - TH));
	function wrap(s, o) {
		o = o || {};
		return UmaVideoFrames.canvasSource({ kind: 'bar', exact: true, width: s.W, height: s.H, duration: s.duration,
			async draw(t, ctx, dw, dh, how) {
				await s.source.drawAt(t, ctx, dw, dh, null, how);
				const sx = dw / s.W, sy = dh / s.H, R = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x * sx, y * sy, w * sx, h * sy); };
				if (o.blankRight) { // 行の右端に文字が無い（実物と同じ）
					R('rgb(236,236,236)', X - 60, s.HE, 60, s.CH);
					for (let y = 90 - (s.pos(t) % 96); y < s.CH; y += 96) if (y > -6) R('rgb(170,170,175)', X - 60, s.HE + Math.max(0, y), 60, 6);
				}
				R('rgb(243,243,240)', X, s.HE, s.W - X, s.CH);
				R('rgb(250,250,248)', CARD, s.HE, s.W - CARD, s.CH);
				R('rgb(205,208,215)', TX0, s.HE + 6, TX1 - TX0, s.CH - 12);
				R('rgb(130,130,150)', TX0, thumbY(s, t), TX1 - TX0, TH);
			},
			close() { s.source.close(); }
		});
	}
	// 白黒のカーソル（実物に近い。白い地の上では線しか見えない）
	function mono(src, at) {
		const W = src.width, H = src.height;
		return UmaVideoFrames.canvasSource({ kind: 'mono', exact: true, width: W, height: H, duration: src.duration,
			async draw(t, ctx, dw, dh, how) {
				await src.drawAt(t, ctx, dw, dh, null, how);
				const p = at(t);
				if (!p) return;
				ctx.save(); ctx.scale(dw / W, dh / H); ctx.translate(p[0], p[1]);
				ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 30); ctx.lineTo(7, 24); ctx.lineTo(12, 36); ctx.lineTo(18, 33); ctx.lineTo(13, 22); ctx.lineTo(22, 22); ctx.closePath();
				ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
				ctx.restore();
			},
			close() { src.close(); }
		});
	}
	// 余白の黒い画素（カーソルの線。つまみより暗い）
	function dark(c) {
		const d = c.getContext('2d', { willReadFrequently: true }).getImageData(X, 0, c.width - X, c.height).data; let n = 0;
		for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) < 75) n++;
		return n;
	}
	// つまみの色の画素の数（つまみが消えていないこと）
	function thumbPx(c) {
		const d = c.getContext('2d', { willReadFrequently: true }).getImageData(TX0, 0, TX1 - TX0, c.height).data; let n = 0;
		for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 130) < 24 && Math.abs(d[i + 2] - 150) < 24) n++;
		return n;
	}
	return { X, TX0, TX1, TH, thumbY, wrap, mono, dark, thumbPx };
})();
`;

export async function register131(env) {
	const { block, browser, base, openPage, assert: rawAssert } = env;
	const assert = (label, cond, extra) => rawAssert(cond, 'T118 ' + label, extra);
	const open = async () => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(240000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.goto(base + '/lab/pc-capture-diag.html');
		await page.addScriptTag({ content: SYNTH85 });
		await page.addScriptTag({ content: FAKE_WINDOW });
		await page.addScriptTag({ content: POINTER });
		await page.addScriptTag({ content: BAR });
		return { ctx, page, errors };
	};

	await block('T118(1) スクロールバーの辺りのカーソル: 引っ張る・止まったまま・右の余白: 消えて、つまみと中身は残る', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async () => {
			const make = () => { const s = __synth85.make({ path: 'stops' }); return { s, src: __bar.wrap(s) }; };
			const c0 = make();
			const clean = await __ptr.build(c0.src, true);
			const out = { cleanCells: clean.stat.margin && clean.stat.margin.cells, cleanThumb: clean.persons.reduce((n, c) => n + __bar.thumbPx(c), 0), margin: clean.stat.margin && { x: clean.stat.margin.x, thumb: clean.stat.margin.thumb }, cases: {} };
			const cases = {
				'つまみの上を引っ張る': (s) => (t) => [__bar.TX0 + 4, __bar.thumbY(s, t) + 50],
				'引っ張る途中で少し左へずれる（溝の左の余白）': (s) => (t) => [__bar.X + 3, __bar.thumbY(s, t) + 50],
				'スクロールバーの上に止まったまま': () => () => [__bar.TX0 + 2, 980],
				'スクロールバーの右の余白に止まったまま': () => () => [__bar.TX1 + 2, 1100],
			};
			for (const [name, at] of Object.entries(cases)) {
				const a = make(), b = make();
				const raw = await __ptr.build(__ptr.wrap(a.src, at(a.s)), false);
				const done = await __ptr.build(__ptr.wrap(b.src, at(b.s)), true);
				out.cases[name] = {
					raw: raw.persons.reduce((n, c) => n + __ptr.count(c), 0),
					count: done.persons.reduce((n, c) => n + __ptr.count(c), 0),
					cells: done.stat.margin && done.stat.margin.cells,
					thumb: done.persons.reduce((n, c) => n + __bar.thumbPx(c), 0),
					diff: done.persons.map((c, i) => __ptr.diff(c, clean.persons[i])),
				};
			}
			return out;
		});
		assert('余白の左端を中身の動きから測る（中身は 672 まで）', r.margin && r.margin.x >= 672 && r.margin.x <= 684, r.margin);
		assert('つまみの場所を見つける（684〜696）', r.margin && r.margin.thumb && Math.abs(r.margin.thumb[0] - 684) <= 2 && Math.abs(r.margin.thumb[1] - 696) <= 2, r.margin);
		assert('カーソルが無ければ余白は塗らない（つまみをカーソルと読まない）', r.cleanCells === 0, r.cleanCells);
		for (const [name, v] of Object.entries(r.cases)) {
			assert(`${name}: 消す前はカーソルが写っている（検査が効いている）`, v.raw > 100, v.raw);
			assert(`${name}: カーソルが消える`, v.count === 0, v);
			assert(`${name}: 余白を塗った`, v.cells > 0, v.cells);
			assert(`${name}: つまみは消えない（カーソルの無い画と ±8%）`, Math.abs(v.thumb - r.cleanThumb) <= r.cleanThumb * 0.08, { thumb: v.thumb, clean: r.cleanThumb });
			assert(`${name}: 中身はカーソルの無い画と同じ（行の差が大きい行 0）`, v.diff.every((d) => d.bad === 0 && d.mean < 3), v.diff);
		}
		assert('T118(1) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T118(2) 行の右端にかかるカーソル: 行の上も余白の上も消えて、中身は壊れない', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async () => {
			const make = () => { const s = __synth85.make({ path: 'stops' }); return { s, src: __bar.wrap(s) }; };
			const clean = await __ptr.build(make().src, true);
			// 動き始めまでは右の余白にいる（一覧の先頭は最初の1枚にしか写らず、そこで行に重なると置き換える相手が無い）
			const at = (s) => (t) => (t < 0.7 ? [__bar.TX1 + 2, 1200] : [__bar.X - 22, __bar.thumbY(s, t) + 50]);
			const a = make(), b = make();
			const raw = await __ptr.build(__ptr.wrap(a.src, at(a.s)), false);
			const done = await __ptr.build(__ptr.wrap(b.src, at(b.s)), true);
			return {
				raw: raw.persons.reduce((n, c) => n + __ptr.count(c), 0), count: done.persons.reduce((n, c) => n + __ptr.count(c), 0),
				sprite: done.stat.sprite, rowCells: done.stat.margin && done.stat.margin.rowCells, margin: done.stat.margin && done.stat.margin.cells,
				diff: done.persons.map((c, i) => __ptr.diff(c, clean.persons[i])),
			};
		});
		assert('消す前はカーソルが写っている', r.raw > 100, r.raw);
		assert('カーソルが消える', r.count === 0, r);
		assert('行の上は別のフレームの画素で、余白は地で消す（どちらも働く）', r.rowCells > 0 && r.margin > 0, r);
		assert('中身はカーソルの無い画と同じ', r.diff.every((d) => d.bad === 0 && d.mean < 3), r.diff);
		assert('T118(2) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T118(6) 一覧の先頭で行の右端にかかる（置き換える相手が無い）: 同じ画の別の行の右端で消える。右端に文字があっても化けない', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async () => {
			const run = async (blankRight) => {
				const make = () => { const s = __synth85.make({ path: 'stops' }); return { s, src: __bar.wrap(s, { blankRight }) }; };
				const clean = await __ptr.build(make().src, true);
				const a = make();
				const done = await __ptr.build(__ptr.wrap(a.src, (t) => [__bar.X - 16, __bar.thumbY(a.s, t) + 30]), true);
				return { count: done.persons.map((c) => __ptr.count(c)), self: done.stat.margin.rowSelf, left: done.stat.margin.rowLeft, diff: done.persons.map((c, i) => __ptr.diff(c, clean.persons[i])) };
			};
			return { blank: await run(true), text: await run(false) };
		});
		assert('右端に文字が無い: カーソルが消える', r.blank.count.every((n) => n === 0), r.blank);
		assert('右端に文字が無い: 同じ画の別の行を使った', r.blank.self > 0, r.blank);
		assert('右端に文字が無い: 中身は壊れない', r.blank.diff.every((d) => d.bad === 0 && d.mean < 3), r.blank.diff);
		assert('右端に文字がある: 文字を別の行へ化けさせない（行の差が大きい行 0）', r.text.diff.every((d) => d.bad === 0 && d.mean < 3), r.text.diff);
		assert('T118(6) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T118(3) 白黒のカーソル（実物に近い）: 白い地の上でも消える。形はスクロールバーの上だけでも覚える', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async () => {
			const s = __synth85.make({ path: 'stops' }), s2 = __synth85.make({ path: 'stops' });
			const at = (q) => (t) => [__bar.TX0 + 4, __bar.thumbY(q, t) + 40];
			const raw = await __ptr.build(__bar.mono(__bar.wrap(s), at(s)), false);
			const done = await __ptr.build(__bar.mono(__bar.wrap(s2), at(s2)), true);
			return { raw: raw.persons.reduce((n, c) => n + __bar.dark(c), 0), dark: done.persons.reduce((n, c) => n + __bar.dark(c), 0), sprite: done.stat.sprite, cells: done.stat.margin && done.stat.margin.cells, frames: done.stat.margin && done.stat.margin.frames, h: done.persons.map((c) => c.height), hRaw: raw.persons.map((c) => c.height) };
		});
		assert('消す前は黒い線が写っている（検査が効いている）', r.raw > 50, r.raw);
		assert('黒い線が消える', r.dark === 0, r);
		assert('形を覚える（前はスクロールバーの上のカーソルから形を覚えられなかった）', !!r.sprite, r.sprite);
		assert('結合画像の高さは変わらない', r.h.join() === r.hRaw.join(), r);
		assert('T118(3) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T118(4) スクロールバーが無い画面（中身が右端まで）: 余白を測らず、何も変えない', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async () => {
			const debug = {};
			const src = __synth85.make({ path: 'stops' }).source;
			const sel = await UmaVideoFrames.selectFrames(src, { labels: ['親', '祖1', '祖2'], debug, effectVote: false });
			const before = sel.persons.map((p) => p.files.slice());
			const stat = await __pc.removePointer(src, sel, debug.track);
			return { same: sel.persons.every((p, i) => p.files.every((f, k) => f === before[i][k])), margin: stat.margin, cells: stat.cells };
		});
		assert('余白は無い', r.margin === null, r.margin);
		assert('素材の画をそのまま返す', r.same && r.cells === 0, r);
		assert('T118(4) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T118(5) 製品の流れ: スクロールバーを引っ張る窓を取り込むと、結合の素材にカーソルが残らない', async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] });
		const { page, errors } = sp;
		await page.evaluate(() => { localStorage.setItem('umaSkillDeck:stepTab', '2'); localStorage.setItem('uma-special-upload-mode', 'video'); });
		await reloadReady(page);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await page.evaluate(() => { selectStepTab(2); window.scrollTo(0, 0); });
		page.setDefaultTimeout(240000);
		await page.addScriptTag({ content: SYNTH85 });
		await page.addScriptTag({ content: FAKE_WINDOW });
		await page.addScriptTag({ content: POINTER });
		await page.addScriptTag({ content: BAR });
		const D = await page.evaluate(() => {
			const s = __synth85.make({ path: 'stops' });
			window.__st = __win.stub(__ptr.wrap(__bar.wrap(s), (t) => [__bar.TX0 + 4, __bar.thumbY(s, t) + 50]), { border: [2, 1, 2, 2], title: 56 });
			return s.duration;
		});
		await page.click('#personset-A-wrap .video-capture-btn');
		await page.waitForSelector('#cap-box');
		await page.waitForFunction(() => { const t = document.getElementById('cap-time'); return t && !t.hidden; });
		await page.waitForTimeout(Math.round(D * 1000) + 900);
		await page.click('#cap-stop');
		await page.waitForFunction(() => document.getElementById('video-progress'));
		await page.waitForFunction(() => !document.getElementById('video-progress'));
		const r = await page.evaluate(async () => {
			let n = 0, ok = 0;
			for (const i of [0, 1, 2]) { const v = persons[i].video; if (!v) continue; ok++; const c = await UmaVideoFrames.composePerson(v.files, v.shifts, v.uncertain, 'x', { still: v.still, anchorY: v.anchorY }); n += __ptr.count(c); }
			return { ok, n, fail: !!document.getElementById('cap-fail'), err: !!document.getElementById('video-error') };
		});
		assert('3人の結合画像まで進む', r.ok === 3 && !r.fail && !r.err, r);
		assert('結合の素材にカーソルが残らない', r.n === 0, r.n);
		assert('T118(5) エラー 0', errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m)).length === 0, errors);
		await sp.ctx.close();
	});
}
