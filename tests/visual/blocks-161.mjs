// 速い動画で残る濃いエフェクトの直し（T158・2026-11-10・決定 629 の案5′・T150 の 550）の検査。塊の見出しはすべて「T158速い動画の組み立て」で始まる
// （`npm run test:visual -- --only=T158速い動画の組み立て`）。run-smoke.mjs の末尾から register161() で呼ばれる。
//
// js/video-frames.js の composePerson は、速い動画（selectFrames の persons[].ages＝はじいてからの秒数が分かる）だけ、次の2つをする:
//  (a) 止まっている画で描き直すときの継ぎ目を「いちばん合う値＋1.5 以内の、いちばん上の行」に置く（ふだんは「いちばん合う行」。エフェクトの写った行は
//      合わないので、いちばん合う行がエフェクトの下に来て、エフェクトが動いている画の側に残っていた。A-2 の親）。
//  (b) 動いている画どうしの重なりでは、はじいてから時間のたった画（0.05秒以上たったもの）の画素を残す（ふだんは先の画。動画8 の祖1）。止まっている画の行には触らない。
// 作り物の画（blocks-145 と同じ形の一覧。左の端に行ごとに違う濃さの印を入れて、どの行も画ごとに違って見えるようにした）で確かめる:
//  (1) (b): 止まっている画 → はじいて 0.1秒の動いている画（赤紫の丸＝エフェクトのまね）→ 0.5秒の動いている画 → 止まっている画。
//      ages を渡すと赤紫が残らず、重なりの行は 0.5秒の画・止まっている画の行はそのまま。ages が無いと赤紫が残る（今までどおり）。
//  (2) (a): 止まっている画 → はじいて 0.1秒の動いている画（赤紫の丸。丸より上の行はわずかに明るい＝ぶれのまね）→ 止まっている画（継ぎ目の探す範囲の上端が丸の上）。
//      ages を渡すと継ぎ目が上端に来て赤紫が残らない。ages が無いと継ぎ目は丸の下（いちばん合う行）で、赤紫が残る（今までどおり）。
//  (3) 速い動画でないとき（ages が無い・null・全部 99・数が合わない）は、結合画像の画素と枠（_sourcePlacements）が4通りとも同じ。
//      どの場合も、枠の行は、その枠の画の行と画素まで同じ（描き直したあとの持ち主で引き直している）。
//  (4) blocks-145 の作り物の速い動画で、selectFrames が persons[].ages を返し（速い動画だけ。ゆっくりの動画は null）、ages を渡して組み立てても
//      3人とも一覧と画素で合い・高さが正しく、赤紫の画素が ages なしより増えない。
//  (5) special.html（UmaStar ③）と exam.html（UmaExam ②）が、動画から来た人の記録に ages を持ち、composePerson に渡す。
// 壊す確認: composePerson の (a) を戻すと (2) が、(b) を戻すと (1) が NG（T158 の報告）。

import { SYNTH145 } from './blocks-145.mjs';

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T158 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

export const SYNTH161 = String.raw`
window.__synth161 = (function () {
	const W = 1000, H = 1800, HE = 700, FS = 1500, CH = FS - HE;
	const ROW = 82, HEAD = 90;
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	const rowsPer = [22, 20];
	const heads = [];
	let y = 40;
	for (const n of rowsPer) { heads.push(y); y += HEAD + n * ROW; }
	const docH = y + 900;
	const doc = document.createElement('canvas'); doc.width = W; doc.height = docH;
	const d = doc.getContext('2d');
	d.fillStyle = 'rgb(240,240,240)'; d.fillRect(0, 0, W, docH);
	const r = rng(158);
	for (let yy = 0; yy < docH; yy++) { const g = 60 + Math.floor(r() * 150); d.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; d.fillRect(20, yy, 100, 1); }
	const textRow = (y0) => {
		for (const x0 of [160, 580]) {
			d.fillStyle = 'rgb(222,222,222)'; d.fillRect(x0, y0 + 6, 380, 64);
			d.fillStyle = 'rgb(170,170,180)'; d.fillRect(x0, y0 + 70, 380, 6);
			const n = 2 + Math.floor(r() * 4);
			for (let k = 0; k < n; k++) { d.fillStyle = 'rgb(90,50,30)'; d.fillRect(x0 + 50 + Math.floor(r() * 260), y0 + 14 + Math.floor(r() * 16), 16 + Math.floor(r() * 22), 16); }
		}
	};
	for (let i = 0; i < heads.length; i++) {
		d.fillStyle = 'rgb(40,170,235)'; d.fillRect(160, heads[i], 800, HEAD);
		d.fillStyle = 'rgb(255,255,255)'; d.fillRect(400 + i * 50, heads[i] + 30, 220, 24);
		for (let k = 0; k < rowsPer[i]; k++) textRow(heads[i] + HEAD + k * ROW);
	}
	const fixed = document.createElement('canvas'); fixed.width = W; fixed.height = H;
	const f = fixed.getContext('2d');
	f.fillStyle = 'rgb(205,195,185)'; f.fillRect(0, 0, W, HE); f.fillRect(0, FS, W, H - FS);
	const r2 = rng(9);
	for (let k = 0; k < 70; k++) { const g = 40 + Math.floor(r2() * 120); f.fillStyle = 'rgb(' + g + ',' + (g - 10) + ',' + (g - 20) + ')'; f.fillRect(Math.floor(r2() * 920), 300 + Math.floor(r2() * (HE - 340)), 30 + Math.floor(r2() * 110), 16); }
	// 一覧の pos 行目から下を本文の帯に写した画。effect: 帯の行 effect に赤紫の丸（半径 70）。tintAbove: 帯の行 tintAbove より上を各色 +1（ぶれのまね）
	function frame(pos, o) {
		const c = document.createElement('canvas'); c.width = W; c.height = H;
		const x = c.getContext('2d');
		x.drawImage(fixed, 0, 0);
		x.drawImage(doc, 0, pos, W, CH, 0, HE, W, CH);
		if (o && o.effect != null) { x.fillStyle = 'rgb(255,0,255)'; x.beginPath(); x.arc(W * 0.72, HE + o.effect, 70, 0, Math.PI * 2); x.fill(); }
		if (o && o.tintAbove) { const im = x.getImageData(0, HE, W, o.tintAbove); for (let k = 0; k < im.data.length; k += 4) { im.data[k] = Math.min(255, im.data[k] + 1); im.data[k + 1] = Math.min(255, im.data[k + 1] + 1); im.data[k + 2] = Math.min(255, im.data[k + 2] + 1); } x.putImageData(im, 0, HE); }
		return c;
	}
	const blobOf = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
	// 場面: pos（一覧の行）・still・ages・画ごとの o
	const SCENES = {
		// (1) 止まっている画 → 0.1秒の動いている画（丸は一覧の 830〜970 行。この画だけが描く行 800〜1100 に入る）→ 0.5秒の動いている画（450〜1250）→ 止まっている画（1150〜）
		agemove: { pos: [0, 300, 450, 1150], still: [true, false, false, true], ages: [1.0, 0.1, 0.5, 1.2], o: [null, { effect: 600 }, null, null] },
		// (2) 止まっている画 → 0.1秒の動いている画（丸は 820〜960 行・それより上は +1）→ 止まっている画（810〜。継ぎ目の探す範囲 810〜970）
		seam: { pos: [0, 300, 810], still: [true, false, true], ages: [1.0, 0.1, 1.0], o: [null, { effect: 590, tintAbove: 660 }, null] }
	};
	function fnv(a) { let h = 0x811c9dc5; for (let i = 0; i < a.length; i += 3) { h ^= a[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
	async function compose(name, ages) {
		const s = SCENES[name];
		const frames = s.pos.map((p, i) => frame(p, s.o[i]));
		const files = [];
		for (const c of frames) files.push(await blobOf(c));
		const shifts = s.pos.slice(1).map((p, i) => p - s.pos[i]);
		const o = { still: s.still };
		if (ages !== undefined) o.ages = ages === 'scene' ? s.ages : ages;
		devGeometry.length = 0;
		const c = await UmaVideoFrames.composePerson(files, shifts, shifts.map(() => false), 'T158', o);
		const w = c.width, h = c.height;
		const a = c.getContext('2d').getImageData(0, 0, w, h).data;
		let magenta = 0;
		for (let k = 0; k < a.length; k += 4) if (a[k] > 200 && a[k + 1] < 90 && a[k + 2] > 200) magenta++;
		// 枠の行と、その枠の画の行が画素まで同じか（3行おき）
		const pl = c._sourcePlacements || [];
		let badRows = 0, rows = 0; const badAt = [];
		for (const p of pl) {
			const src = frames[p.fileIndex].getContext('2d').getImageData(0, p.srcY0, w, p.srcY1 - p.srcY0).data;
			for (let yy = 0; yy < p.srcY1 - p.srcY0 && p.outY0 + yy < h; yy += 3) {
				rows++;
				const ra = (p.outY0 + yy) * w * 4, rb = yy * w * 4;
				let same = true;
				for (let x = 0; x < w * 4; x++) if (a[ra + x] !== src[rb + x]) { same = false; break; }
				if (!same) { badRows++; if (badAt.length < 5) badAt.push(p.fileIndex + ':' + (p.outY0 + yy)); }
			}
		}
		const covered = pl.reduce((n, p) => n + (p.srcY1 - p.srcY0), 0);
		// 一覧の行 docY を写している枠の画（出力の行＝一覧の行−最初の頭の上の分）
		const skip = heads[0];
		const ownerAt = (docY) => { const oy = docY - skip; const p = pl.find((q) => oy >= q.outY0 && oy < q.outY0 + (q.srcY1 - q.srcY0)); return p ? p.fileIndex : null; };
		return { h, magenta, hash: fnv(a), placements: pl.map((p) => p.fileIndex + '@' + p.outY0 + '+' + (p.srcY1 - p.srcY0)).join(' '), covered, badRows, rows, badAt,
			owners: Object.fromEntries([700, 790, 815, 840, 900, 965, 1050, 1120, 1200, 1400].map((yy) => [yy, ownerAt(yy)])),
			log: devGeometry.map(String).filter((l) => /描き直し|優先/.test(l)) };
	}
	return { compose };
})();
`;

export async function register161(env) {
	const { block, assert, browser, base, fs, path, REPO_ROOT } = env;
	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(240000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t158.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t158.html');
		await page.addScriptTag({ content: SYNTH161 });
		await page.addScriptTag({ content: SYNTH145 });
		return { ctx, page, errors };
	};
	const fmt = (r) => '高さ' + r.h + '・赤紫' + r.magenta + '・持ち主 ' + JSON.stringify(r.owners) + '・枠の行の食い違い ' + r.badRows + '/' + r.rows;

	await block('T158速い動画の組み立て(1) 動いている画どうしの重なりは、はじいてから時間のたった画の画素を残す（速い動画だけ）', async () => {
		const { ctx, page, errors } = await openHost();
		const a = await page.evaluate(() => __synth161.compose('agemove', 'scene'));
		const b = await page.evaluate(() => __synth161.compose('agemove'));
		assert(a.magenta === 0, 'T158速い動画の組み立て(1) ages あり: 0.1秒の画の赤紫が残らない（' + fmt(a) + '）', a);
		assert(a.owners[840] === 2 && a.owners[900] === 2 && a.owners[1050] === 2, 'T158速い動画の組み立て(1) ages あり: 重なりの行（一覧の 840・900・1050 行）は 0.5秒の画（2番）', a.owners);
		assert(a.owners[700] === 0 && a.owners[1200] === 3 && a.owners[1400] === 3, 'T158速い動画の組み立て(1) ages あり: 止まっている画の行（700 行は 0番・1200・1400 行は 3番）はそのまま', a.owners);
		assert(a.badRows === 0 && a.rows > 500 && a.covered === a.h, 'T158速い動画の組み立て(1) ages あり: 枠（_sourcePlacements）の行が、その枠の画の行と画素まで同じ・出力の全部の行を覆う（' + a.badRows + '/' + a.rows + '・' + a.covered + '/' + a.h + '）', a.badAt);
		assert(b.magenta > 1000 && b.owners[900] === 1, 'T158速い動画の組み立て(1) ages なし: 今までどおり先の画（1番）の赤紫が残る（' + fmt(b) + '）', b);
		assert(a.h === b.h, 'T158速い動画の組み立て(1) 高さは ages の有無で変わらない（' + a.h + '／' + b.h + '）', [a.h, b.h]);
		assert(errors.length === 0, 'T158速い動画の組み立て(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T158速い動画の組み立て(2) 止まっている画で描き直すときの継ぎ目は、いちばん合う値＋1.5 以内のいちばん上の行（速い動画だけ）', async () => {
		const { ctx, page, errors } = await openHost();
		const a = await page.evaluate(() => __synth161.compose('seam', 'scene'));
		const b = await page.evaluate(() => __synth161.compose('seam'));
		assert(a.magenta === 0 && a.owners[815] === 2 && a.owners[900] === 2, 'T158速い動画の組み立て(2) ages あり: 継ぎ目が探す範囲の上端（810 行）に来て、赤紫が残らない（' + fmt(a) + '）', a);
		assert(a.badRows === 0 && a.covered === a.h, 'T158速い動画の組み立て(2) ages あり: 枠の行が、その枠の画の行と画素まで同じ（' + a.badRows + '/' + a.rows + '）', a.badAt);
		assert(b.magenta > 1000 && b.owners[900] === 1 && b.owners[965] === 2, 'T158速い動画の組み立て(2) ages なし: 今までどおり継ぎ目はいちばん合う行（丸の下）で、赤紫が残る（' + fmt(b) + '）', b);
		assert(b.badRows === 0 && b.covered === b.h, 'T158速い動画の組み立て(2) ages なし: 枠の行が、その枠の画の行と画素まで同じ（' + b.badRows + '/' + b.rows + '）', b.badAt);
		assert(errors.length === 0, 'T158速い動画の組み立て(2) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T158速い動画の組み立て(3) 速い動画でないとき（ages が無い・null・全部 99・数が合わない）は、結合画像と枠が同じ', async () => {
		const { ctx, page, errors } = await openHost();
		for (const name of ['agemove', 'seam']) {
			const rs = await page.evaluate((n) => Promise.all([undefined, null, 'all99', 'short'].map((k) => {
				const len = n === 'agemove' ? 4 : 3;
				const ages = k === 'all99' ? Array(len).fill(99) : k === 'short' ? [0.1, 0.5] : k;
				return __synth161.compose(n, ages);
			})), name);
			const same = rs.every((r) => r.hash === rs[0].hash && r.placements === rs[0].placements && r.h === rs[0].h);
			assert(same, 'T158速い動画の組み立て(3) ' + name + ': 4通りとも画素（' + rs.map((r) => r.hash).join('／') + '）と枠が同じ', rs.map((r) => r.placements));
			assert(rs.every((r) => r.badRows === 0 && r.covered === r.h), 'T158速い動画の組み立て(3) ' + name + ': 枠の行が、その枠の画の行と画素まで同じ', rs.map((r) => r.badAt));
		}
		assert(errors.length === 0, 'T158速い動画の組み立て(3) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T158速い動画の組み立て(4) 作り物の速い動画: selectFrames が ages を返し（速い動画だけ）、ages を渡して組み立てても3人とも一覧と合う', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(() => __synth145.run(1, {}, false, true));
		const b = await page.evaluate(() => __synth145.run(1));
		const okAges = r.persons.length === 3 && r.persons.every((p) => Array.isArray(p.ages) && p.ages.length === p.n && p.ages.some((x) => x < 99));
		assert(okAges, 'T158速い動画の組み立て(4) 3人とも persons[].ages（枚数と同じ数・はじいてからの秒数）がある（' + r.persons.map((p) => JSON.stringify(p.ages)).join('／') + '）', r.persons.map((p) => p.ages));
		const ok = (x) => x.persons.length === 3 && x.persons.every((p) => p.badRows === 0 && Math.abs(p.h - p.expectH) <= 2);
		const mag = (x) => x.persons.reduce((s, p) => s + p.magenta, 0);
		assert(ok(r), 'T158速い動画の組み立て(4) ages を渡しても3人とも一覧と画素で合い・高さが正しい（' + r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 赤紫' + p.magenta).join('／') + '）', r.persons);
		assert(mag(r) <= mag(b), 'T158速い動画の組み立て(4) 赤紫の画素の合計が ages なしより増えない（' + mag(r) + ' ≦ ' + mag(b) + '・' + r.persons.map((p) => p.magenta).join('／') + ' ／ ' + b.persons.map((p) => p.magenta).join('／') + '）', [mag(r), mag(b)]);
		const s = await page.evaluate(() => __synth145.run(5, {}, true, true));
		assert(s.stats && s.stats.fast === false && s.persons.length === 3 && s.persons.every((p) => p.ages === null), 'T158速い動画の組み立て(4) ゆっくりの動画は ages が null（' + s.persons.map((p) => JSON.stringify(p.ages)).join('／') + '）', s.persons.map((p) => p.ages));
		assert(errors.length === 0, 'T158速い動画の組み立て(4) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T158速い動画の組み立て(5) UmaStar ③・UmaExam ②: 動画から来た人の記録に ages を持ち、composePerson に渡す', async () => {
		const sp = fs.readFileSync(path.join(REPO_ROOT, 'special.html'), 'utf8'), ex = fs.readFileSync(path.join(REPO_ROOT, 'exam.html'), 'utf8');
		assert(/\.video = \{[^}\n]*still: \(p\.still \|\| \[\]\)\.slice\(\), ages: p\.ages \? p\.ages\.slice\(\) : null,/.test(sp), 'T158速い動画の組み立て(5) special.html: 取り込んだ人の記録（persons[].video）に ages', null);
		assert(/composePerson\(files, v\.shifts, v\.uncertain, label, \{ still: v\.still, anchorY: v\.anchorY, ages: v\.ages \}\)/.test(sp), 'T158速い動画の組み立て(5) special.html: composePerson に ages を渡す', null);
		assert(/\.video = \{[^}\n]*still: \(p\.still \|\| \[\]\)\.slice\(\), ages: p\.ages \? p\.ages\.slice\(\) : null,/.test(ex), 'T158速い動画の組み立て(5) exam.html: 取り込んだ人の記録（persons[].video）に ages', null);
		assert(/composePerson\(files, video\.shifts, video\.uncertain, label, \{ still: video\.still, anchorY: video\.anchorY, ages: video\.ages \}\)/.test(ex), 'T158速い動画の組み立て(5) exam.html: composePerson に ages を渡す', null);
	});
}
