// T105 の3回目（2026-11-05）: lab/pc-capture-diag.html のカーソルを消す処理（removePointer）と、js/video-frames.js の composePerson の o.anchorY の検査。
// おいもさんの回答 279（カーソルを消し、アイコンや文字は消さない。カーソルが動く場合も扱う）と 280（案A）。
import { SYNTH85 } from './blocks-100.mjs';
import { FAKE_WINDOW } from './blocks-112.mjs';

// 作り物の画面に作り物のカーソルを描く。at(t) が画面の上の位置（窓に付いていて、中身と一緒には動かない）
export const POINTER = String.raw`
window.__ptr = (function () {
	const GREEN = [0, 255, 40];
	function sprite(ctx, x, y, q) {
		ctx.save();
		ctx.translate(x, y); ctx.scale(1, q);
		const path = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 54); ctx.lineTo(13, 42); ctx.lineTo(23, 62); ctx.lineTo(32, 57); ctx.lineTo(22, 38); ctx.lineTo(40, 38); ctx.closePath(); };
		ctx.fillStyle = 'rgb(' + GREEN.join(',') + ')'; path(); ctx.fill();
		ctx.lineWidth = 3; ctx.strokeStyle = 'rgb(20,60,10)'; path(); ctx.stroke();
		ctx.restore();
	}
	function wrap(s, at) {
		const W = s.width, H = s.height;
		return UmaVideoFrames.canvasSource({ kind: 'pointer', exact: true, width: W, height: H, duration: s.duration,
			async draw(t, ctx, dw, dh, how) {
				await s.drawAt(t, ctx, dw, dh, null, how);
				const p = at(t);
				if (p) { const sx = dw / W, sy = dh / H; ctx.save(); ctx.scale(sx, 1); sprite(ctx, p[0], p[1] * sy, sy); ctx.restore(); }
			},
			close() { s.close(); }
		});
	}
	// 作り物のカーソルの色の画素の数（作り物の画面にこの色は無い）
	function count(c) {
		const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
		let n = 0;
		for (let i = 0; i < d.length; i += 4) if (d[i] < 70 && d[i + 1] > 190 && d[i + 2] < 110) n++;
		return n;
	}
	// 2枚の結合画像の行ごとの差（カーソルの無い画と比べて、中身が壊れていないか）
	function diff(a, b) {
		const h = Math.min(a.height, b.height), w = Math.min(a.width, b.width);
		const da = a.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, db = b.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
		let bad = 0, sum = 0, n = 0;
		for (let y = 0; y < h; y += 2) {
			let s = 0, c = 0;
			for (let x = 0; x < w; x += 3) { const p = (y * w + x) * 4; s += Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2]); c += 3; }
			if (s / c > 12) bad++;
			sum += s; n += c;
		}
		return { bad, mean: +(sum / n).toFixed(2), rows: Math.floor(h / 2), ha: a.height, hb: b.height };
	}
	async function build(src, remove) {
		const debug = {};
		const sel = await UmaVideoFrames.selectFrames(src, { labels: ['親', '祖1', '祖2'], debug, effectVote: false });
		const stat = remove ? await __pc.removePointer(src, sel, debug.track) : null;
		const persons = [];
		for (const p of sel.persons) persons.push(await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still, anchorY: p.anchorY }));
		return { sel, stat, persons };
	}
	return { wrap, count, diff, build };
})();
`;

export async function register119(env) {
	const { block, browser, base } = env;
	const assert = (label, cond, extra) => env.assert(cond, 'T105 PC取り込み ' + label, extra);
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
		return { ctx, page, errors };
	};

	await block('T105 PC取り込み(9) カーソルが画面の同じ所に留まる・動く・文字に重なる: 消えて、中身は壊れない', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async () => {
			const out = {};
			const clean = await __ptr.build(__synth85.make({ path: 'stops' }).source, false);
			const cases = {
				'余白に留まる': () => [30, 900],
				'文字の上に留まる': () => [340, 980],
				'途中で動く': (t) => [60 + (t < 4 ? 0 : 420), 860 + (t < 7 ? 0 : 240)],
				'動き続ける': (t) => [120 + 40 * Math.round(t * 2) % 480, 760 + 30 * Math.round(t * 2) % 480],
			};
			for (const [name, at] of Object.entries(cases)) {
				const raw = await __ptr.build(__ptr.wrap(__synth85.make({ path: 'stops' }).source, at), false);
				const done = await __ptr.build(__ptr.wrap(__synth85.make({ path: 'stops' }).source, at), true);
				out[name] = {
					rawCount: raw.persons.reduce((s, c) => s + __ptr.count(c), 0),
					count: done.persons.reduce((s, c) => s + __ptr.count(c), 0),
					sprite: done.stat.sprite, fixed: done.stat.cells, left: done.stat.leftCells,
					diff: done.persons.map((c, i) => __ptr.diff(c, clean.persons[i])),
				};
			}
			return out;
		});
		for (const [name, v] of Object.entries(r)) {
			assert(`${name}: 消す前はカーソルが写っている（検査が効いている）`, v.rawCount > 100, v.rawCount);
			assert(`${name}: カーソルが消える`, v.count === 0, { count: v.count, fixed: v.fixed, left: v.left, sprite: v.sprite });
			assert(`${name}: 中身はカーソルの無い画と同じ（行の差が大きい行 0）`, v.diff.every((d) => d.bad === 0 && d.mean < 3), v.diff);
		}
		assert('T105(9) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T105 PC取り込み(10) カーソルが無い動画は何も変えない', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async () => {
			const a = await __ptr.build(__synth85.make({ path: 'stops' }).source, false);
			const debug = {};
			const src = __synth85.make({ path: 'stops' }).source;
			const sel = await UmaVideoFrames.selectFrames(src, { labels: ['親', '祖1', '祖2'], debug, effectVote: false });
			const before = sel.persons.map((p) => p.files.slice());
			const stat = await __pc.removePointer(src, sel, debug.track);
			return { same: sel.persons.every((p, i) => p.files.every((f, k) => f === before[i][k])), fixed: stat.cells, sprite: stat.sprite, h: a.persons.map((c) => c.height) };
		});
		assert('素材の画をそのまま返す（作り直さない）', r.same && r.fixed === 0, r);
		assert('T105(10) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T105 PC取り込み(11) 案A: 区切りの頭が帯の下のほうで初めて写っても、anchorY で途中で切れない', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async () => {
			const s = __synth85.make({ path: 'passSlow' });
			const sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'] });
			const p = sel.persons[1];
			const c = (o) => UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, Object.assign({ still: p.still }, o));
			// 頭が探す範囲（0.25W＝180行）の下にある形を作る: 1枚目の帯を下へ 260 行ずらした画にする
			const img = await new Promise((res) => { const u = URL.createObjectURL(p.files[0]), im = new Image(); im.onload = () => res(im); im.src = u; });
			const hE = sel.header.headerEnd, cH = sel.header.contentH, W = img.width, H = img.height;
			const shiftBy = 260 - p.anchorY;
			const can = document.createElement('canvas'); can.width = W; can.height = H;
			const x = can.getContext('2d');
			x.drawImage(img, 0, 0);
			x.fillStyle = 'rgb(222,222,222)'; x.fillRect(0, hE, W, shiftBy);
			x.drawImage(img, 0, hE, W, cH - shiftBy, 0, hE + shiftBy, W, cH - shiftBy);
			const blob = await new Promise((res) => can.toBlob(res, 'image/png'));
			const files = p.files.slice(); files[0] = new File([blob], 'moved.png', { type: 'image/png' });
			const shifts = p.shifts.slice(); shifts[0] = p.shifts[0] + shiftBy;
			const cc = (o) => UmaVideoFrames.composePerson(files, shifts, p.uncertain, p.label, Object.assign({}, o));
			const without = await cc({});
			const withY = await cc({ anchorY: 260 });
			const wrongY = await cc({ anchorY: 100 });
			const normal = await c({ anchorY: p.anchorY });
			const normalNo = await c({});
			const px = withY.getContext('2d').getImageData(Math.floor(W * 0.3), 2, 1, 1).data;
			return { contentH: cH, anchorOrig: p.anchorY, without: without.height, withY: withY.height, wrongY: wrongY.height, normal: normal.height, normalNo: normalNo.height, top: Array.from(px).slice(0, 3), api: UmaVideoFrames.VERSION };
		});
		assert('anchorY が無いと途中で切れる（直す前の形。検査が効いている）', r.without < r.contentH, r);
		assert('anchorY を渡すと頭から最後まで写る', r.withY > r.contentH && Math.abs(r.withY - r.normal) <= 8 && r.top[2] > 200 && r.top[0] < 120, r);
		assert('頭が無い位置の anchorY は使わない（渡さないときと同じ）', r.wrongY === r.without, r);
		assert('頭がふつうの位置なら anchorY の有無で変わらない（iPhone の動画は同じ）', r.normal === r.normalNo, r);
		assert('T105(11) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T105 PC取り込み(12) 画面の流れ: カーソルが写った窓を取り込むと、結合画像にカーソルが無く、数字に出る', async () => {
		const { ctx, page, errors } = await open();
		await page.evaluate(() => { const s = __synth85.make({ path: 'stops' }); window.__st = __win.stub(__ptr.wrap(s.source, () => [30, 900]), { border: [2, 1, 2, 2], title: 56 }); });
		await page.selectOption('#mode', 'encode');
		await page.click('#start');
		await page.waitForTimeout(9000);
		await page.click('#stop');
		await page.waitForFunction(() => window.__pc.S.done);
		const v = await page.evaluate(() => ({ msg: document.getElementById('msg').textContent, stats: document.getElementById('stats').textContent, n: __pc.S.persons && __pc.S.persons.length, count: (__pc.S.persons || []).reduce((s, p) => s + __ptr.count(p.canvas), 0) }));
		assert('3人の結合画像まで作れる', v.n === 3, v.msg);
		assert('結合画像にカーソルの色の画素が無い', v.count === 0, v.count);
		assert('数字に圧縮の設定が出る（目標 30Mbps・画質優先）', v.stats.includes('目標 30Mbps・画質優先'), v.stats.slice(0, 400));
		assert('数字に「カーソル」の行が出る', /カーソル形 \d+×\d+・消した所 \d+/.test(v.stats), v.stats.slice(0, 400));
		assert('T105(12) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});
}
