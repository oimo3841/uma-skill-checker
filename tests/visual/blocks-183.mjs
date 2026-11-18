// T195（2026-11-19・おいもさんの決定 763・830・831）: 動画の取り込みを速くする直し（V1・V2・V3）の要の動きの検査。結果（選ぶ画・結合画像）は
// 変えない直しなので、本物の録画で直す前と後の結合画像がバイトまで同じことは test:video-local の --save（既定・--special・--exam・--skill）で見る。
// ここは作り物の画で「時刻を戻らない」「書き出しを待たない」「控えの使い回し」を見る。
// run-smoke.mjs の末尾から register183() で呼ばれる（塊の見出しはすべて「T195」で始まる。`npm run test:visual -- --only=T195` で回せる）。
//
//  (1) V1（js/video-frames.js の取り直し・エフェクトの置き換え）: 作り物の MP4（blocks-101 の stops・エフェクトのまね・20fps）を WebCodecs の出どころで
//      selectFrames に通す。取り直しの段で、1枚ごとに「同じ画を同じ大きさで2回描かない」・復号器の作り直しが選んだ枚数より少ない・
//      後ろの候補が3枚そろったら先を流さない（stats.effectEarlyStops）。2回とも静止画（JPEG のバイト）と結合画像が同じ・一覧と合う。
//  (2) V2（書き出しを待たない）: toBlob の返りを遅らせても、selectFrames（JPEG）と removePointer（PNG）が次の画へ進み、同時に待つ数が 2〜3。
//      出る File（JPEG・PNG のバイト）と結合画像は、遅らせないときと同じ。
//  (3) V3（読み出しの重複）: 読む段は1枚に1回だけ画素を読む（前は上の帯と本文の帯の2回）。横画面の出どころ（blocks-164 の作り物）で、
//      くっきりした画の比べで等倍の画を丸ごと読むのは取り替えるときだけ（前は比べた1枚ごとに選んだ画とよかった画を丸ごと控えていた）。結合画像は一覧と合う。
//  壊す確認（2026-11-19）: 直す前の製品（74a7a54）で回すと (1) 4件・(2) 2件・(3) 2件が NG。
// 作り物の横画面の画のぼかしは、同梱の Chromium と Chrome で描き方が違い、取り替える数が変わる（Chromium 2・Chrome 10。直す前と後でどちらも同じ）。
import { SYNTH85 } from './blocks-100.mjs';
import { MP4 } from './blocks-101.mjs';
import { POINTER } from './blocks-119.mjs';
import { SYNTH164 } from './blocks-164.mjs';

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T195 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script><script src="/js/landscape-panel.js"></script><script src="/js/pc-capture.js"></script></head><body></body></html>';

export const T195 = String.raw`
window.__t195 = (function () {
	const fnv = (u8) => { let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
	async function hashFiles(files) { const out = []; for (const f of files) out.push(fnv(new Uint8Array(await f.arrayBuffer()))); return out; }
	const hashCanvas = (c) => fnv(c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data);
	// 出どころの drawAt を包み、描いた時刻・大きさ・段・取り直しの何枚目か・画の番号・その時点の復号器の作り直しの数を記録する。
	// 取り直しの段の始まりは「選ぶ」の最後の知らせ（select 1/1）、1枚の終わりは grab の知らせ
	function spy(src) {
		const log = []; let phase = 'read', pick = -1;
		const da = src.drawAt.bind(src);
		src.drawAt = function (t, ctx, dw, dh, sig, how) {
			log.push({ t, w: Math.round(dw), phase, pick, j: typeof src.frameIndexAt === 'function' ? src.frameIndexAt(t) : Math.floor(t * 20 + 1e-6), r: src.stat ? src.stat.restarts : 0 });
			return da(t, ctx, dw, dh, sig, how);
		};
		const onProgress = (p) => {
			if (p.phase === 'select' && p.done === 1 && p.total === 1) { phase = 'grab'; pick = 0; }
			else if (p.phase === 'grab') pick = p.done;
			else if (phase !== 'grab') phase = p.phase;
		};
		return { log, onProgress };
	}
	// (1) V1。path: 'stops'（止まり→止まり。3人の結合画像を一覧と比べる）・'passFast'（0.25秒で 900px 進む所がある。後ろの候補が早くそろう）
	async function v1(path, reps) {
		const m = await __mp4.build({ path: path || 'stops', effect: true });
		const runs = [];
		for (let k = 0; k < (reps || 2); k++) {
			const src = await UmaVideoFrames.openSource(m.blob);
			const s = spy(src);
			const sel = await UmaVideoFrames.selectFrames(src, { labels: ['親', '祖1', '祖2'], onProgress: s.onProgress });
			const restarts = src.stat.restarts;
			src.close();
			const grab = s.log.filter((e) => e.phase === 'grab');
			const seen = new Map(); let dup = 0; const dupAt = [];
			for (const e of grab) { const key = e.pick + ':' + e.w + ':' + e.j; if (seen.has(key)) { dup++; if (dupAt.length < 6) dupAt.push(key); } else seen.set(key, 1); }
			let back = 0; for (let i = 1; i < grab.length; i++) if (grab[i].t < grab[i - 1].t - 1e-6) back++;
			// 1枚ごと: 選んだ時刻の画（等倍）を描く前に、前の候補の帯（縮小画）を時刻の順に読んだか（時刻 0 の1枚目は前の候補が無い）
			const pre = sel.picks.map((pt, i) => {
				const seg = grab.filter((e) => e.pick === i), k = seg.findIndex((e) => e.w === m.W);
				const before = k > 0 ? seg.slice(0, k) : [];
				return { t: pt, n: before.length, inc: before.every((e, q) => q === 0 || e.t > before[q - 1].t), below: before.every((e) => e.t < pt && e.w < m.W) };
			});
			const persons = [];
			for (let j = 0; j < sel.persons.length; j++) {
				const p = sel.persons[j];
				const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still });
				const w = c.width, h = c.height, a = c.getContext('2d').getImageData(0, 0, w, h).data, sy = m.synth;
				if (j >= sy.heads.length) { persons.push({ label: p.label, h: c.height, expectH: null, badRows: null, magenta: null, hash: hashCanvas(c) }); continue; }
				const top = sy.heads[j], expectH = (j + 1 < sy.heads.length ? sy.heads[j + 1] : sy.green) - sy.heads[j];
				const rows = Math.min(h, sy.docH - top, expectH - 2), b = sy.doc.getContext('2d').getImageData(0, top, w, rows).data;
				let badRows = 0, magenta = 0;
				for (let y = 2; y < rows; y += 2) { let rs = 0, rn = 0; for (let x = 0; x < w; x += 3) { const q = (y * w + x) * 4; rs += Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]); rn += 3; } if (rs / rn > 24) badRows++; }
				for (let q = 0; q < a.length; q += 4) if (a[q] > 200 && a[q + 1] < 90 && a[q + 2] > 200) magenta++;
				persons.push({ label: p.label, h, expectH, badRows, magenta, hash: fnv(a) });
			}
			runs.push({ picks: sel.picks, files: await hashFiles(sel.files), persons, kind: src.kind, grabDraws: grab.length, grabRestarts: grab.length ? restarts - grab[0].r : 0, back, dup, dupAt, pre,
				stats: { effectPicks: sel.stats.effectPicks, effectBlocks: sel.stats.effectBlocks, effectCands: sel.stats.effectCands, effectEarlyStops: sel.stats.effectEarlyStops, grabMismatch: sel.stats.grabMismatch } });
		}
		return runs;
	}
	// toBlob の返りを ms 遅らせ、同時に待っている数の最大を数える（頼んだ時点の画は元の toBlob が写す）
	function delayBlobs(ms) {
		const orig = HTMLCanvasElement.prototype.toBlob;
		const st = { pending: 0, max: 0, n: 0 };
		HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
			st.pending++; st.n++; st.max = Math.max(st.max, st.pending);
			return orig.call(this, (b) => setTimeout(() => { st.pending--; cb(b); }, ms), ...a);
		};
		return { st, reset() { st.max = st.pending; st.n = 0; }, restore() { HTMLCanvasElement.prototype.toBlob = orig; } };
	}
	// (2) V2: selectFrames（JPEG）と removePointer（PNG）。delay が 0 なら遅らせない
	async function v2(delay) {
		const d = delay ? delayBlobs(delay) : null;
		try {
			const s = __synth85.make({ path: 'stops', effect: true });
			s.source.exact = true;
			const sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'] });
			const jpeg = d ? { max: d.st.max, n: d.st.n } : null;
			const files = await hashFiles(sel.files);
			// カーソルのまね（blocks-119）を写した出どころで、選ぶ → カーソルを消す（PNG の書き出し）
			const s2 = __synth85.make({ path: 'stops' });
			const src = __ptr.wrap(s2.source, (t) => [120 + 40 * Math.round(t * 2) % 480, 760 + 30 * Math.round(t * 2) % 480]);
			const debug = {};
			const sel2 = await UmaVideoFrames.selectFrames(src, { labels: ['親', '祖1', '祖2'], debug, effectVote: false });
			if (d) d.reset();
			const rp = await UmaPcCapture.removePointer(src, sel2, debug.track || []);
			const png = d ? { max: d.st.max, n: d.st.n } : null;
			const pngFiles = [];
			for (const p of sel2.persons) for (const f of p.files) if (/\.png$/.test(f.name) && !pngFiles.includes(f)) pngFiles.push(f);   // 人の境の画は2人に入る
			const persons = [];
			for (const p of sel2.persons) persons.push(hashCanvas(await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still, anchorY: p.anchorY })));
			return { jpeg, png, files, pngs: await hashFiles(pngFiles), frames: rp.frames, persons, cursor: devGeometry.filter((l) => /^\[動画\] カーソル/.test(l)).length };
		} finally { if (d) d.restore(); }
	}
	// (3) V3: 読む段の画素の読み出しの回数（getImageData）と、読む段で描いた枚数
	async function v3() {
		const gid = CanvasRenderingContext2D.prototype.getImageData;
		let reads = 0, phase = 'read', last = null;
		// 読む段で、描いた canvas（選ぶ側の縮小画）から読んだ回数だけ数える（頭と帯の検出が見本の写しから読む分は数えない）
		CanvasRenderingContext2D.prototype.getImageData = function (...a) { if (phase === 'read' && this === last) reads++; return gid.apply(this, a); };
		try {
			const s = __synth85.make({ path: 'stops' });
			s.source.exact = true;
			const d0 = s.source.drawAt.bind(s.source);
			s.source.drawAt = function (t, ctx, ...rest) { last = ctx; return d0(t, ctx, ...rest); };
			const sp = spy(s.source);
			const op = sp.onProgress;
			const sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'], effectVote: false, onProgress: (p) => { op(p); phase = p.phase; } });
			const readDraws = sp.log.filter((e) => e.phase === 'read').length;
			return { readDraws, reads, picks: sel.picks.length };
		} finally { CanvasRenderingContext2D.prototype.getImageData = gid; }
	}
	// (3) V3 の続き: 横画面の出どころ（blocks-164 の作り物・幅 1000×1800）で、等倍の画を丸ごと読んだ回数（くっきりした画の比べ）。
	// 前は1枚ごとに、選んだ時刻の画を丸ごと控え（orig）、比べてよかった画も丸ごと控えていた。今は取り替えるときに1回だけ
	async function v3sharp() {
		const gid = CanvasRenderingContext2D.prototype.getImageData;
		let whole = 0;
		// くっきりした画の比べ（selectFrames の中の sharperGrab）の中で読んだ分だけ（取り直した画が縮小画と合わないときの読み直しは数えない）
		CanvasRenderingContext2D.prototype.getImageData = function (...a) { if (a[0] === 0 && a[1] === 0 && a[2] === 1000 && a[3] === 1800 && /\bsharperGrab\b/.test(String(new Error().stack))) whole++; return gid.apply(this, a); };
		try {
			const r = await __synth164.run('landscape:synth164');
			return { whole, stats: r.stats, persons: r.persons.map((p) => ({ label: p.label, h: p.h, expectH: p.expectH, badRows: p.badRows, unc: p.unc })) };
		} finally { CanvasRenderingContext2D.prototype.getImageData = gid; }
	}
	return { v1, v2, v3, v3sharp, spy };
})();
`;

export async function register183(env) {
	const { block, assert, browser, base } = env;
	const open = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(300000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t195.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t195.html');
		for (const s of [SYNTH85, MP4, POINTER, SYNTH164, T195]) await page.addScriptTag({ content: s });
		return { ctx, page, errors };
	};

	await block('T195(1) V1 取り直しの復号のやり直しを減らす（WebCodecs の出どころ）: 前の候補を先に時刻の順に読む・1枚の中で同じ画を2回描かない・後ろの候補がそろったら先を流さない・2回とも静止画と結合画像が同じ', async () => {
		const { ctx, page, errors } = await open();
		const [a, b] = await page.evaluate(() => __t195.v1('stops', 2));
		const [f] = await page.evaluate(() => __t195.v1('passFast', 1));
		const sh = (r) => '描いた ' + r.grabDraws + '回・作り直し ' + r.grabRestarts + '回・戻り ' + r.back + '回・同じ画の描き直し ' + r.dup + '回' + (r.dupAt.length ? '（' + r.dupAt.join(' ') + '）' : '') + '・選んだ ' + r.picks.length + '枚';
		const preOk = (r) => r.pre.every((x, i) => i === 0 ? true : x.n > 0 && x.inc && x.below);
		const preStr = (r) => r.pre.map((x) => x.t + '秒:' + x.n + (x.inc && x.below ? '' : '×')).join(' ');
		assert(a.kind === 'webcodecs' && a.persons.length === 3 && a.persons.every((p) => p.badRows === 0 && Math.abs(p.h - p.expectH) <= 2 && p.magenta === 0), 'T195(1) 3人に分かれ、どの人も一覧と合い、エフェクトのまね（赤紫）が残らない（' + a.persons.map((p) => p.label + ' ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 赤紫' + p.magenta).join('／') + '）', a.persons);
		assert(a.stats.effectPicks > 0 && a.stats.effectBlocks > 0, 'T195(1) エフェクトの置き換えを通っている（置き換えた区画 ' + a.stats.effectBlocks + '・候補 ' + a.stats.effectCands + '）', a.stats);
		assert(preOk(a) && preOk(f), 'T195(1) 1枚ごとに、選んだ時刻の画を描く前に、前の候補の帯を時刻の順に読む（時刻:先に読んだ数 ' + preStr(a) + '）', { a: a.pre, f: f.pre });
		assert(a.dup === 0 && f.dup === 0, 'T195(1) 取り直しの段で、1枚の中で同じ画を同じ大きさで2回描かない（stops: ' + sh(a) + '・passFast: ' + sh(f) + '）', { a, f });
		// 直す前の作りは、この作り物で作り直し 20回（選んだ 8枚の 2.5倍）。直した後は前の候補を先に読むので、残るのは前の候補から選んだ画の半分の幅の画・前の候補の2回目（before2）だけ
		assert(a.grabRestarts <= Math.ceil(a.picks.length * 1.5), 'T195(1) 取り直しの段の復号器の作り直しが、選んだ枚数の 1.5倍まで（' + sh(a) + '）', a);
		assert(typeof f.stats.effectEarlyStops === 'number' && f.stats.effectEarlyStops > 0, 'T195(1) 速く進む所（passFast）では、後ろの候補が3枚そろったら先を流さない（' + f.stats.effectEarlyStops + '枚・' + sh(f) + '）', f.stats);
		assert(a.picks.join() === b.picks.join() && a.files.join() === b.files.join() && a.persons.every((p, k) => p.hash === b.persons[k].hash), 'T195(1) 2回とも選んだ時刻・静止画（JPEG のバイト）・結合画像の画素が同じ', { a: a.files, b: b.files });
		assert(errors.length === 0, 'T195(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T195(2) V2 書き出しを待たない: toBlob の返りを遅らせても次の画へ進み（同時に待つのは 2〜3）、JPEG・PNG のバイトと結合画像は遅らせないときと同じ', async () => {
		const { ctx, page, errors } = await open();
		const slow = await page.evaluate(() => __t195.v2(150));
		const fast = await page.evaluate(() => __t195.v2(0));
		assert(slow.jpeg.n === slow.files.length && slow.jpeg.max >= 2 && slow.jpeg.max <= 3, 'T195(2) 取り直しの JPEG: 返りを待たずに次の画へ（同時に待った最大 ' + slow.jpeg.max + '・' + slow.jpeg.n + '枚）', slow.jpeg);
		assert(slow.png.n === slow.frames && slow.frames >= 3 && slow.png.max >= 2 && slow.png.max <= 3, 'T195(2) カーソルを消した画の PNG: 返りを待たずに次の画へ（同時に待った最大 ' + slow.png.max + '・' + slow.png.n + '枚・直した画 ' + slow.frames + '）', slow.png);
		assert(slow.files.join() === fast.files.join() && slow.pngs.join() === fast.pngs.join() && slow.pngs.length === slow.frames, 'T195(2) 出る File（JPEG ' + slow.files.length + '枚・PNG ' + slow.pngs.length + '枚）のバイトが、遅らせないときと同じ', { slow: slow.pngs, fast: fast.pngs });
		assert(slow.persons.length === 3 && slow.persons.join() === fast.persons.join(), 'T195(2) 結合画像の画素が、遅らせないときと同じ', { slow: slow.persons, fast: fast.persons });
		assert(errors.length === 0, 'T195(2) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T195(3) V3 読み出しの重複を減らす: 読む段は1枚に1回だけ読む・くっきりした画の比べで等倍の画を丸ごと読むのは取り替えるときだけ・結合画像は一覧と合う', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(() => __t195.v3());
		const s = await page.evaluate(() => __t195.v3sharp());
		assert(r.readDraws > 10 && r.reads === r.readDraws, 'T195(3) 読む段: 1枚に1回だけ画素を読む（描いた ' + r.readDraws + '枚・読んだ ' + r.reads + '回。前は上の帯と本文の帯で2回）', r);
		// 前の作りは、比べた1枚ごとに選んだ時刻の画を丸ごと控え、よかった画も丸ごと控えていた（比べた数以上）。今は取り替えた数まで
		assert(s.stats.sharpOn && s.stats.sharpTried > 0 && s.whole <= s.stats.sharpSwaps, 'T195(3) 横画面の出どころ: くっきりした画の比べで、等倍の画を丸ごと読むのは取り替えるときだけ（丸ごと読んだ ' + s.whole + '回・比べた ' + s.stats.sharpTried + '・取り替え ' + s.stats.sharpSwaps + '）', s);
		assert(s.persons.length === 3 && s.persons.every((p) => p.badRows === 0 && Math.abs(p.h - p.expectH) <= 2 && p.unc === 0), 'T195(3) 横画面の出どころの結合画像が一覧と合う（' + s.persons.map((p) => p.label + ' ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows).join('／') + '）', s.persons);
		assert(errors.length === 0, 'T195(3) コンソールのエラーなし', errors);
		await ctx.close();
	});
}
