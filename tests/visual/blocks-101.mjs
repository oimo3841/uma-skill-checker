// 動画の出どころの安定化（T90・2026-11-03）の検査。
// run-smoke.mjs の末尾から register101() で呼ばれる（塊の見出しはすべて「T90動画の出どころ」で始まる。`npm run test:visual -- --only=T90動画の出どころ` で回せる）。
//
// 決め（T90。iPhone の記録で、video 要素のシークが頼んだ時刻の画を毎回同じには描かないことを確かめた）:
//  - 動画は MP4 を自分で分解して WebCodecs（VideoDecoder）で復号する出どころ（mp4Source）で読む。時刻 t の画は「表示時刻が t 以下の最後のフレーム」。
//    後ろへ戻る・先の区間へ飛ぶときはキーフレームから復号し直す。openSource は mp4Source を試し、使えなければ videoSource（video 要素）に倒す。
//  - composePerson は o.still（止まっている区間の画）の画素を優先し、動いている画の画素は止まっている画に覆われない所だけに残す。
//  - selectFrames は、動いている画の「止まっている画に覆われる行」を先に取り直した止まっている画から写し、どの画も前後の実フレームとの
//    区画ごとの多数決でタッチのエフェクト（画面に付いて動かないもの）を見分けて置き換える（出どころが正確〔復号・作り物〕なときだけ）。
// 素材は blocks-100（T85）と同じ作り物の画。MP4 はその場で作る（VideoEncoder〔avc1〕で作り物のフレームを圧縮し、最小の MP4 の箱に入れる）。
// 復号のフレームの差（H.264 の圧縮）は、一覧と比べるときの行の平均 24 の基準の中に収まる。

import { SYNTH85 } from './blocks-100.mjs';
import { pickVideo } from './lib/video-entry.mjs';

const HOST = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>video-frames T90 test</title>'
	+ '<script>var devGeometry = [];</script><script src="/js/common.js"></script><script src="/js/stitch.js"></script>'
	+ '<script src="/js/video-frames.js"></script></head><body></body></html>';

// 作り物の画の列を MP4（avc1・断片化なし・moov は末尾）にする。window.__mp4.build(o) → { blob, frames, keyframes, fps }
export const MP4 = String.raw`
window.__mp4 = (function () {
	const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
	const u16 = (n) => [(n >>> 8) & 255, n & 255];
	const str = (s) => Array.from(s, (c) => c.charCodeAt(0));
	const zeros = (n) => new Array(n).fill(0);
	function box(type, ...parts) {
		const bodies = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
		const len = 8 + bodies.reduce((s, b) => s + b.length, 0);
		const out = new Uint8Array(len);
		out.set(u32(len), 0); out.set(str(type), 4);
		let o = 8; for (const b of bodies) { out.set(b, o); o += b.length; }
		return out;
	}
	const full = (type, version, flags, ...parts) => box(type, [version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255], ...parts);
	const MATRIX = [].concat(u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000));
	function mux(samples, description, W, H, timescale, dur) {
		const n = samples.length, D = n * dur;
		const data = new Uint8Array(samples.reduce((s, x) => s + x.data.length, 0));
		let o = 0; for (const s of samples) { data.set(s.data, o); o += s.data.length; }
		const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
		const mdat = box('mdat', data);
		const keys = []; samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
		const avc1 = box('avc1', zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(W), u16(H), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(24), u16(0xFFFF), box('avcC', description));
		const stbl = box('stbl',
			full('stsd', 0, 0, u32(1), avc1),
			full('stts', 0, 0, u32(1), u32(n), u32(dur)),
			full('stss', 0, 0, u32(keys.length), ...keys.map(u32)),
			full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
			full('stsz', 0, 0, u32(0), u32(n), ...samples.map((s) => u32(s.data.length))),
			full('stco', 0, 0, u32(1), u32(ftyp.length + 8)));
		const minf = box('minf', full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))), stbl);
		const mdia = box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(D), u16(0x55c4), u16(0)), full('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler'), [0]), minf);
		const tkhd = full('tkhd', 0, 7, u32(0), u32(0), u32(1), u32(0), u32(D), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(W << 16), u32(H << 16));
		const moov = box('moov', full('mvhd', 0, 0, u32(0), u32(0), u32(timescale), u32(D), u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(2)), box('trak', tkhd, mdia));
		return new Blob([ftyp, mdat, moov], { type: 'video/mp4' });
	}
	// o: make の引数（path・effect・seed）。fps（既定 20）・gop（キーフレームの間隔・既定 60）・bitrate
	async function build(o) {
		o = o || {};
		const s = __synth85.make(o);
		const fps = o.fps || 20, gop = o.gop || 60, dur = Math.round(1000 / fps);
		const c = document.createElement('canvas'); c.width = s.W; c.height = s.H; const x = c.getContext('2d');
		const samples = []; let description = null;
		const enc = new VideoEncoder({
			output: (chunk, meta) => { if (meta && meta.decoderConfig && meta.decoderConfig.description && !description) description = new Uint8Array(meta.decoderConfig.description.slice ? meta.decoderConfig.description : meta.decoderConfig.description.buffer); const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); samples.push({ key: chunk.type === 'key', ts: chunk.timestamp, data: d }); },
			error: (e) => { throw e; }
		});
		enc.configure({ codec: 'avc1.420028', width: s.W, height: s.H, bitrate: o.bitrate || 8e6, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' });
		const n = Math.floor(s.duration * fps);
		for (let i = 0; i < n; i++) {
			await s.source.drawAt(i / fps, x, s.W, s.H);
			const f = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
			enc.encode(f, { keyFrame: i % gop === 0 }); f.close();
			if (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 10));
		}
		await enc.flush(); enc.close();
		samples.sort((a, b) => a.ts - b.ts);
		return { blob: mux(samples, description, s.W, s.H, 1000, dur), frames: n, keyframes: samples.filter((q) => q.key).length, fps, synth: s, W: s.W, H: s.H, HE: s.HE, CH: s.CH };
	}
	// 復号した画と作り物の画の差（本文の帯の行の平均。H.264 の圧縮の差は 6 前後、別の時刻の画なら 30 以上）
	function diffAt(ctxA, s, t) {
		const w = s.W, c = document.createElement('canvas'); c.width = w; c.height = s.H; const x = c.getContext('2d');
		s.source.drawAt(t, x, w, s.H); // 作り物の draw は同期で描く（await なし）
		const a = ctxA.getImageData(0, s.HE, w, s.CH).data, b = x.getImageData(0, s.HE, w, s.CH).data;
		let sum = 0, cnt = 0;
		for (let i = 0; i < a.length; i += 16) { sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); cnt += 3; }
		return +(sum / cnt).toFixed(2);
	}
	const hash = (ctx, w, h) => { const d = ctx.getImageData(0, 0, w, h).data; let x = 0x811c9dc5; for (let i = 0; i < d.length; i += 4) { x ^= d[i]; x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(16); };
	return { build, diffAt, hash };
})();
`;

export async function register101(env) {
	const { block, assert, browser, base, openPage } = env;
	const openHost = async () => {
		const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(240000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.route(base + '/__video-frames-t90.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
		await page.goto(base + '/__video-frames-t90.html');
		await page.addScriptTag({ content: SYNTH85 });
		await page.addScriptTag({ content: MP4 });
		return { ctx, page, errors };
	};
	const okPersons = (r) => r.persons.length === 3 && r.persons.every((p) => p.badRows === 0 && p.mean < 8 && Math.abs(p.h - p.expectH) <= 2);
	const show = (r) => r.persons.map((p) => p.label + ' 高さ' + p.h + '/' + p.expectH + ' 合わない行' + p.badRows + ' 平均' + p.mean + ' 赤紫' + p.magenta);

	await block('T90動画の出どころ(1) MP4 の分解と WebCodecs の復号: 枚数・キーフレーム・時刻どおりの画・後ろへ戻れる・同じ時刻は何度でも同じ画素', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const m = await __mp4.build({ path: 'stops', effect: true });
			const probe = await UmaVideoFrames.mp4Probe(m.blob);
			const src = await UmaVideoFrames.openSource(m.blob);
			const c = document.createElement('canvas'); c.width = m.W; c.height = m.H; const x = c.getContext('2d', { willReadFrequently: true });
			const times = [0, 0.3, 2.0, 1.0, 9.5, 5.0, 5.0, 0.05];   // 前へ・後ろへ・先へ飛ぶ・同じ時刻
			const diffs = [], hashes = {};
			for (const t of times) { await src.drawAt(t, x, m.W, m.H); diffs.push([t, __mp4.diffAt(x, m.synth, t)]); hashes[t] = (hashes[t] || []).concat(__mp4.hash(x, m.W, m.H)); }
			// 別の順で同じ時刻を描いても同じ画素
			await src.drawAt(7.7, x, m.W, m.H); const h1 = __mp4.hash(x, m.W, m.H);
			await src.drawAt(1.3, x, m.W, m.H); await src.drawAt(7.7, x, m.W, m.H); const h2 = __mp4.hash(x, m.W, m.H);
			const stat = Object.assign({}, src.stat);
			src.close();
			return { probe: Object.assign({}, probe, { track: undefined }), kind: src.kind, frames: m.frames, keyframes: m.keyframes, diffs, same5: hashes[5.0][0] === hashes[5.0][1], h77: h1 === h2, stat, size: m.blob.size };
		});
		assert(r.probe.ok && /^avc1\./.test(r.probe.codec) && r.probe.frames === r.frames && r.probe.keyframes === r.keyframes && r.kind === 'webcodecs', 'T90動画の出どころ(1) MP4（' + Math.round(r.size / 1024) + 'KB・' + r.frames + '枚・キーフレーム ' + r.keyframes + '）を分解して復号の出どころ（webcodecs）になる', r.probe);
		assert(r.diffs.every(([, d]) => d < 12), 'T90動画の出どころ(1) 前へ・後ろへ・先へ飛んでも、時刻どおりの画が描ける（作り物との差 ' + r.diffs.map(([t, d]) => t + 's:' + d).join(' ') + '）', r.diffs);
		assert(r.same5 && r.h77, 'T90動画の出どころ(1) 同じ時刻は、別の順で描いても画素まで同じ', { same5: r.same5, h77: r.h77 });
		assert(r.stat.restarts >= 2 && r.stat.skips === 0, 'T90動画の出どころ(1) 後ろへ戻る・先へ飛ぶときはキーフレームから復号し直す（' + r.stat.restarts + '回）・飛ばしたフレーム 0', r.stat);
		assert(errors.length === 0, 'T90動画の出どころ(1) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T90動画の出どころ(2) openSource の振り分け: MP4 は復号の出どころ・WebM は video 要素に倒す・壊れたファイルは今までどおり decode の失敗', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const out = {};
			const m = await __mp4.build({ path: 'stops', fps: 10, gop: 30 });
			let s = await UmaVideoFrames.openSource(m.blob); out.mp4 = { kind: s.kind, fallback: s.fallback || null, dur: +s.duration.toFixed(2), W: s.width }; s.close();
			// WebM（MediaRecorder）: MP4 でないので video 要素へ
			const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d');
			const stream = c.captureStream(30); const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }); const parts = [];
			rec.ondataavailable = (e) => parts.push(e.data);
			const done = new Promise((res) => { rec.onstop = () => res(new Blob(parts, { type: 'video/webm' })); });
			rec.start(100); const t0 = performance.now();
			await new Promise((res) => { const tick = () => { const t = performance.now() - t0; x.fillStyle = t < 300 ? 'red' : t < 600 ? 'green' : 'blue'; x.fillRect(0, 0, 320, 240); if (t > 900) { rec.stop(); res(); } else requestAnimationFrame(tick); }; tick(); });
			const webm = await done;
			s = await UmaVideoFrames.openSource(webm); out.webm = { kind: s.kind, fallback: s.fallback || null, W: s.width }; s.close();
			try { s = await UmaVideoFrames.openSource(new File([new Uint8Array(64)], 'broken.mp4', { type: 'video/mp4' })); s.close(); out.broken = 'opened?'; } catch (e) { out.broken = e.code || e.message; }
			const ctrl = new AbortController(); ctrl.abort();
			try { await UmaVideoFrames.openSource(m.blob, { signal: ctrl.signal }); out.aborted = 'opened?'; } catch (e) { out.aborted = e.name; }
			out.videos = document.querySelectorAll('video').length;
			return out;
		});
		assert(r.mp4.kind === 'webcodecs' && !r.mp4.fallback && r.mp4.W === 720, 'T90動画の出どころ(2) MP4 は復号の出どころ（長さ ' + r.mp4.dur + '秒）', r.mp4);
		assert(r.webm.kind === 'video' && r.webm.fallback === 'mp4' && r.webm.W === 320, 'T90動画の出どころ(2) WebM は video 要素に倒す（理由 mp4）', r.webm);
		assert(r.broken === 'decode', 'T90動画の出どころ(2) 壊れたファイルは今までどおり decode の失敗', r.broken);
		assert(r.aborted === 'AbortError' && r.videos === 0, 'T90動画の出どころ(2) 取り消し済みなら AbortError・video はページに残らない', r);
		assert(errors.length === 0, 'T90動画の出どころ(2) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T90動画の出どころ(3) MP4 を selectFrames に通す: 2回とも静止画と結合画像が画素まで同じ・3人とも一覧と合う・エフェクトのまねが結合画像に入らない', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const m = await __mp4.build({ path: 'stops', effect: true });
			const fnv = (u8) => { let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
			const runs = [];
			for (let k = 0; k < 2; k++) {
				const src = await UmaVideoFrames.openSource(m.blob);
				const sel = await UmaVideoFrames.selectFrames(src, { labels: ['親', '祖1', '祖2'] });
				src.close();
				const files = []; for (const f of sel.files) files.push(fnv(new Uint8Array(await f.arrayBuffer())));
				const persons = [];
				for (let j = 0; j < sel.persons.length; j++) {
					const p = sel.persons[j];
					const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still });
					const cmp = __synth85.compare ? null : null;
					// 一覧と比べる（blocks-100 の compare と同じ数え方）
					const w = c.width, h = c.height, a = c.getContext('2d').getImageData(0, 0, w, h).data, s = m.synth;
					const top = s.heads[j], expectH = (j + 1 < s.heads.length ? s.heads[j + 1] : s.green) - s.heads[j];
					const rows = Math.min(h, s.docH - top, expectH - 2), b = s.doc.getContext('2d').getImageData(0, top, w, rows).data;
					let badRows = 0, sum = 0, n = 0, magenta = 0;
					for (let y = 2; y < rows; y += 2) { let rs = 0, rn = 0; for (let x = 0; x < w; x += 3) { const q = (y * w + x) * 4; rs += Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]); rn += 3; } if (rs / rn > 24) badRows++; sum += rs; n += rn; }
					for (let q = 0; q < a.length; q += 4) if (a[q] > 200 && a[q + 1] < 90 && a[q + 2] > 200) magenta++;
					persons.push({ label: p.label, n: p.files.length, still: p.still.map((v) => v ? 1 : 0).join(''), h, expectH, badRows, mean: +(sum / n).toFixed(2), magenta, hash: fnv(a) });
				}
				runs.push({ picks: sel.picks, files, persons, stats: { stillPicks: sel.stats.stillPicks, effectPicks: sel.stats.effectPicks, effectBlocks: sel.stats.effectBlocks, effectCopiedRows: sel.stats.effectCopiedRows, grabMismatch: sel.stats.grabMismatch }, ms: Math.round(sel.tm.totalMs) });
			}
			return { runs, frames: m.frames };
		});
		const [a, b] = r.runs;
		assert(okPersons(a), 'T90動画の出どころ(3) 3人に分かれ、どの人も一覧と合う（' + show(a).join('／') + '）', a.persons);
		assert(a.persons.every((p) => p.magenta === 0), 'T90動画の出どころ(3) 結合画像に印（赤紫＝エフェクトのまね）の画素が無い', a.persons.map((p) => p.magenta));
		assert(a.picks.join() === b.picks.join() && a.files.join() === b.files.join(), 'T90動画の出どころ(3) 2回とも選んだ時刻と静止画（JPEG のバイト）が同じ（' + a.picks.length + '枚）', { a: a.picks, b: b.picks });
		assert(a.persons.every((p, k) => p.hash === b.persons[k].hash), 'T90動画の出どころ(3) 2回とも結合画像が画素まで同じ', { a: a.persons.map((p) => p.hash), b: b.persons.map((p) => p.hash) });
		assert(a.stats.grabMismatch === 0, 'T90動画の出どころ(3) 取り直した画は縮小画と全部合う（復号の出どころは時刻どおり）', a.stats);
		assert(errors.length === 0, 'T90動画の出どころ(3) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T90動画の出どころ(4) 止まっている画の画素を優先する組み立て: 動いている画の印は、止まっている画に覆われる所では消え、_sourcePlacements は出力の行と元の画の行が合う', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			// 止まり→止まりが帯より少し遠い所（wide の 860px）で動いている1枚が選ばれ、その行は前後の止まっている画に覆われる。多数決（effectVote）は切って、組み立てだけの違いを見る
			const s = __synth85.make({ path: 'wide', effect: true });
			s.source.exact = true;
			const sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'], effectVote: false });
			const out = { moving: sel.picks.filter((t) => s.moving(t)).length, persons: [] };
			for (let j = 0; j < sel.persons.length; j++) {
				const p = sel.persons[j];
				const magentaOf = (c) => { const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let m = 0; for (let q = 0; q < a.length; q += 4) if (a[q] > 200 && a[q + 1] < 90 && a[q + 2] > 200) m++; return m; };
				const c0 = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label);
				const c1 = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still });
				// _sourcePlacements: 出力の行の画素は、その元の画の行と同じ
				const srcs = []; for (const f of p.files) srcs.push(stitchImgToCanvas(await loadImage(f)));
				let checked = 0, bad = 0;
				const od = c1.getContext('2d').getImageData(0, 0, c1.width, c1.height).data;
				for (const pl of c1._sourcePlacements) {
					const sc = srcs[pl.fileIndex].getContext('2d'); const h = pl.srcY1 - pl.srcY0;
					for (let k = 0; k < 3; k++) {
						const y = Math.min(h - 1, Math.floor(h * (k + 0.5) / 3)); const sd = sc.getImageData(0, pl.srcY0 + y, c1.width, 1).data; const oy = pl.outY0 + y; if (oy >= c1.height) continue;
						let d = 0; for (let x = 0; x < c1.width * 4; x += 4) d += Math.abs(sd[x] - od[oy * c1.width * 4 + x]);
						checked++; if (d / c1.width > 1) bad++;
					}
				}
				out.persons.push({ label: p.label, still: p.still.map((v) => v ? 1 : 0).join(''), m0: magentaOf(c0), m1: magentaOf(c1), h0: c0.height, h1: c1.height, placements: c1._sourcePlacements.length, checked, bad });
			}
			return out;
		});
		assert(r.moving > 0 && r.persons.some((p) => p.m0 > 0), 'T90動画の出どころ(4) 止まりが遠い所では動いている画（' + r.moving + '枚）が選ばれ、今までの組み立てでは印が残る（' + r.persons.map((p) => p.m0).join('/') + '画素）', r.persons);
		assert(r.persons.every((p) => p.m1 === 0), 'T90動画の出どころ(4) 止まっている画を優先すると印が消える（' + r.persons.map((p) => p.m1).join('/') + '画素）', r.persons);
		assert(r.persons.every((p) => p.bad === 0 && p.checked > 0 && Math.abs(p.h1 - p.h0) <= 2), 'T90動画の出どころ(4) _sourcePlacements の行は元の画の行と画素が合い、高さは今までと同じ（±2）', r.persons);
		assert(errors.length === 0, 'T90動画の出どころ(4) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T90動画の出どころ(5) エフェクトの置き換え: 速いスワイプの動いている画も、止まっている画の行を写し、残りは前後の実フレームとの多数決で印を消す', async () => {
		const { ctx, page, errors } = await openHost();
		const r = await page.evaluate(async () => {
			const s = __synth85.make({ path: 'passFast', effect: true });
			s.source.exact = true;   // 作り物の画は同じ時刻に同じ画を描く（エフェクトの置き換えはこれが真のときだけ）
			const sel = await UmaVideoFrames.selectFrames(s.source, { labels: ['親', '祖1', '祖2'] });
			const persons = [];
			for (let j = 0; j < sel.persons.length; j++) {
				const p = sel.persons[j];
				const c = await UmaVideoFrames.composePerson(p.files, p.shifts, p.uncertain, p.label, { still: p.still });
				const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let m = 0; for (let q = 0; q < a.length; q += 4) if (a[q] > 200 && a[q + 1] < 90 && a[q + 2] > 200) m++;
				// 静止画（取り直した画）そのものにも印が無い
				let mf = 0; for (const f of p.files) { const cv = stitchImgToCanvas(await loadImage(f)); const d = cv.getContext('2d').getImageData(0, s.HE, cv.width, s.CH).data; for (let q = 0; q < d.length; q += 4) if (d[q] > 200 && d[q + 1] < 90 && d[q + 2] > 200) mf++; }
				persons.push({ label: p.label, n: p.files.length, still: p.still.map((v) => v ? 1 : 0).join(''), magenta: m, magentaFiles: mf, h: c.height });
			}
			return { persons, moving: sel.picks.filter((t) => s.moving(t)).length, stats: { effectPicks: sel.stats.effectPicks, effectBlocks: sel.stats.effectBlocks, effectCopiedRows: sel.stats.effectCopiedRows, effectNoAlt: sel.stats.effectNoAlt, effectCands: sel.stats.effectCands }, effectDraws: s.stat.effectDraws };
		});
		assert(r.moving > 0 && r.effectDraws > 0 && (r.stats.effectCopiedRows > 0 || r.stats.effectBlocks > 0), 'T90動画の出どころ(5) 動いている画 ' + r.moving + '枚に、止まっている画の行の写し（' + r.stats.effectCopiedRows + '行）か多数決の置き換え（' + r.stats.effectBlocks + '区画）が入る', r.stats);
		assert(r.persons.every((p) => p.magenta === 0), 'T90動画の出どころ(5) 3人の結合画像に印（赤紫）の画素が無い（' + r.persons.map((p) => p.magenta).join('/') + '）', r.persons);
		assert(errors.length === 0, 'T90動画の出どころ(5) コンソールのエラーなし', errors);
		await ctx.close();
	});

	await block('T90動画の出どころ(6) special.html の③に MP4 を渡す: 復号の出どころで3人に分かれ、結合画像が出る・開発ログに出どころが残る', async () => {
		const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		const { page } = sp;
		await page.evaluate(() => localStorage.setItem('umaSkillDeck:stepTab', '2'));
		await page.reload(); await page.waitForTimeout(1200);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await page.evaluate(() => selectStepTab(2));
		await page.addScriptTag({ content: SYNTH85 });
		await page.addScriptTag({ content: MP4 });
		await pickVideo(page);
		const r = await page.evaluate(async () => {
			const m = await __mp4.build({ path: 'stops', effect: true, fps: 15, gop: 45 });
			const res = await Promise.race([onVideoChosen(new File([m.blob], 'rec.mp4', { type: 'video/mp4' })), new Promise((rs) => setTimeout(() => rs('timeout'), 120000))]);
			const logs = (typeof devGeometry !== 'undefined' ? devGeometry : []).filter((s) => String(s).startsWith('[動画]'));
			const box = document.querySelector('#personset-A-wrap .upload-set-panel .video-result');
			return { res, n: persons.slice(0, 3).map((p) => p.files.length), still: persons.slice(0, 3).map((p) => p.video ? p.video.still.map((v) => v ? 1 : 0).join('') : null), src: logs.find((s) => /出どころ/.test(s)) || null, img: !!(box && box.querySelector('img')), err: (document.getElementById('video-error') || {}).textContent || null };
		});
		assert(r.res !== 'timeout' && r.res.ok === true && r.res.stitched === true && r.img, 'T90動画の出どころ(6) 取り込みが成功し、③の中に結合画像が出る', r);
		assert(/出どころ: webcodecs/.test(r.src || '') && !/倒した理由/.test(r.src || ''), 'T90動画の出どころ(6) 開発ログに「出どころ: webcodecs」', r.src);
		assert(r.n.every((n) => n >= 2) && r.still.every((s) => s && /1/.test(s)), 'T90動画の出どころ(6) 3人とも2枚以上で、止まっている画の印（still）が枠の記録に入る', r);
		assert(sp.errors.filter((m) => !/Failed to load resource|status of 404/.test(m)).length === 0, 'T90動画の出どころ(6) コンソールのエラー0', sp.errors);
		await sp.ctx.close();
	});
}
