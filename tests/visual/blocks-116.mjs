// T105 の2回目（2026-11-05）: lab/pc-capture-diag.html の「動かない部分を1枚の画にそろえる」出どころ（steadySource）の検査。
// おいもさんの PC の試しで、5回とも selectFrames の「本文の帯が想定の範囲の外」で止まった原因（圧縮の揺れ・先頭の粗い1枚・カーソル）を作り物でまねる。
import { SYNTH85 } from './blocks-100.mjs';
import { FAKE_WINDOW } from './blocks-112.mjs';

// 作り物の画面に、実物で測った揺れを足す: 先頭の1枚は全面が粗い／2秒ごとに動かない行が変わる（キーフレーム）／カーソルが下の段を通る
const NOISY = String.raw`
window.__noisy = function (s, o) {
	o = o || {};
	const W = s.width, H = s.height;
	return UmaVideoFrames.canvasSource({ kind: 'noisy', exact: true, width: W, height: H, duration: s.duration,
		async draw(t, ctx, dw, dh, how) {
			await s.drawAt(t, ctx, dw, dh, null, how);
			const q = dh / H;
			if (o.firstRough && t < 0.1) { ctx.fillStyle = 'rgb(70,70,70)'; for (let y = 0; y < H; y += 60) ctx.fillRect(0, y * q, dw, 2 * q); }
			if (o.keyRows) { const v = Math.floor(t / 2) % 2 ? 40 : 90; ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; ctx.fillRect(0, 300 * q, dw, 4 * q); ctx.fillRect(0, 1450 * q, dw, 4 * q); }
			if (o.cursor) { ctx.fillStyle = 'rgb(120,200,20)'; ctx.fillRect((dw * 0.3 + dw * 0.4 * ((t * 3) % 1)), (1370 + (t * 90) % 180) * q, dw * 0.2, 60 * q); }
			if (o.otherScreenAfter != null && t >= o.otherScreenAfter) { ctx.fillStyle = 'rgb(20,20,120)'; ctx.fillRect(0, 0, dw, 620 * q); }
		},
		close() { s.close(); }
	});
};
`;

export async function register116(env) {
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
		await page.addScriptTag({ content: NOISY });
		return { ctx, page, errors };
	};
	const LABELS = ['親', '祖1', '祖2'];

	await block('T105 PC取り込み(6) 圧縮の揺れ・先頭の粗い1枚・カーソルがあっても、帯の外をそろえると結合画像まで作れる', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async (LABELS) => {
			const mk = (o) => __noisy(__synth85.make({ path: 'stops' }).source, o);
			const attempt = async (src) => { try { const s = await UmaVideoFrames.selectFrames(src, { labels: LABELS }); return { ok: true, header: s.header, n: s.persons.length }; } catch (e) { return { ok: false, code: e.code, msg: e.message }; } };
			const out = {};
			// そろえないと、実物と同じ止まり方をする（検査が原因を再現している証拠）
			out.raw = {};
			for (const [name, o] of [['先頭', { firstRough: 1 }], ['キー', { keyRows: 1 }], ['カーソル', { cursor: 1 }]]) out.raw[name] = await attempt(mk(o));
			// そろえると通る
			out.fixed = {};
			for (const [name, o] of [['先頭', { firstRough: 1 }], ['キー', { keyRows: 1 }], ['カーソル', { cursor: 1 }], ['全部', { firstRough: 1, keyRows: 1, cursor: 1 }]]) {
				const st = await __pc.steadySource(mk(o));
				out.fixed[name] = { band: st.band && [st.band.top, st.band.bottom], kind: st.src.kind, r: await attempt(st.src) };
			}
			return out;
		}, LABELS);
		for (const name of ['先頭', 'キー', 'カーソル']) assert(`そろえないと ${name} の揺れで本文の帯の失敗になる（実物の再現）`, !r.raw[name].ok && r.raw[name].code === 'band', JSON.stringify(r.raw[name]));
		for (const name of ['先頭', 'キー', 'カーソル', '全部']) {
			const f = r.fixed[name];
			assert(`${name}: 帯を 640〜1360 ±3 行で見つける`, !!f.band && Math.abs(f.band[0] - 640) <= 3 && Math.abs(f.band[1] - 1360) <= 3, JSON.stringify(f.band));
			assert(`${name}: selectFrames が通り3人に分かれる・帯が同じ`, f.r.ok && f.r.n === 3 && Math.abs(f.r.header.headerEnd - 640) <= 3 && Math.abs(f.r.header.footer - 1360) <= 3, JSON.stringify(f.r));
		}
		assert('T105(6) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T105 PC取り込み(7) 別の画面のフレームは塗り直さない・動きが足りないと帯を決めない', async () => {
		const { ctx, page, errors } = await open();
		const r = await page.evaluate(async (LABELS) => {
			const s0 = __synth85.make({ path: 'stops' }).source;
			const D = s0.duration;
			// 途中で別の画面になる: selectFrames の「同じ画面か」がそのまま働き、後ろを捨てる
			const st = await __pc.steadySource(__noisy(s0, { otherScreenAfter: D * 0.8 }));
			const sel = await UmaVideoFrames.selectFrames(st.src, { labels: LABELS });
			// 別の画面のフレームの上の部分が残っていること（塗り直していない）
			const c = document.createElement('canvas'); c.width = st.src.width; c.height = st.src.height;
			const x = c.getContext('2d', { willReadFrequently: true });
			await st.src.drawAt(D - 0.2, x, c.width, c.height, null);
			const px = Array.from(x.getImageData(10, 100, 1, 1).data).slice(0, 3);
			// 止まっている画面だけ: 帯を決めない
			const still = UmaVideoFrames.canvasSource({ kind: 'still', exact: true, width: 720, height: 1560, duration: 5, async draw(t, ctx, dw, dh) { ctx.fillStyle = 'rgb(200,200,200)'; ctx.fillRect(0, 0, dw, dh); }, close() {} });
			const none = await __pc.steadySource(still);
			// 帯の数え方: 飛び飛びの大きな値は取らず、いちばん長い続きを取る
			const counts = new Uint16Array(1000); for (let y = 300; y < 800; y++) counts[y] = 10; counts[100] = 10; counts[900] = 10; for (let y = 500; y < 505; y++) counts[y] = 0;
			const found = __pc.findMovingBand(counts);
			const tooShort = new Uint16Array(1000); for (let y = 300; y < 400; y++) tooShort[y] = 10;
			const noMotion = new Uint16Array(1000); noMotion[500] = 2;
			return { dropped: sel.stats.dropped, px, none: none.band, sameSrc: none.src === still, found: [found.top, found.bottom], tooShort: __pc.findMovingBand(tooShort), noMotion: __pc.findMovingBand(noMotion) };
		}, LABELS);
		assert('別の画面のフレームを selectFrames が捨てる', r.dropped > 0, 'dropped ' + r.dropped);
		assert('別の画面のフレームの上の部分は塗り直さない', r.px[0] === 20 && r.px[1] === 20 && r.px[2] === 120, r.px.join(','));
		assert('止まっている画面では帯を決めず、元の出どころのまま', r.none === null && r.sameSrc);
		assert('いちばん長い続きを取る（間の短い切れ目はつなぐ）', r.found[0] === 300 && r.found[1] === 800, r.found.join('〜'));
		assert('短すぎる帯は取らない', r.tooShort === null);
		assert('動きがほとんどないと取らない', r.noMotion === null);
		assert('T105(7) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});

	await block('T105 PC取り込み(8) 画面の流れ: 本文の帯と版を数字に出し、人の画が切れたら案内する', async () => {
		const { ctx, page, errors } = await open();
		await page.evaluate(() => { const s = __synth85.make({ path: 'stops' }); window.__st = __win.stub(__noisy(s.source, { firstRough: 1, keyRows: 1 }), { border: [2, 1, 2, 2], title: 56 }); });
		await page.selectOption('#mode', 'encode');
		await page.click('#start');
		await page.waitForTimeout(9000);
		await page.click('#stop');
		await page.waitForFunction(() => window.__pc.S.done);
		const r = await page.evaluate(() => ({ msg: document.getElementById('msg').textContent, stats: document.getElementById('stats').textContent, persons: __pc.S.persons && __pc.S.persons.length, ver: __pc.VERSION, guide: document.querySelector('ol').textContent }));
		assert('揺れがあっても取り込みから結合画像まで作れる', r.persons === 3, r.msg);
		assert('数字に本文の帯が出る', /本文の帯\d+〜\d+ 行目/.test(r.stats), r.stats.slice(0, 200));
		assert('数字にこのページの版が出る', r.stats.includes('このページの版' + r.ver) && /^\d{4}-\d{2}-\d{2}[a-z]$/.test(r.ver), r.ver);
		assert('手順にカーソルの置き場所とホイールが書いてある', r.guide.includes('左の余白') && r.guide.includes('ホイール'));
		assert('T105(8) コンソールのエラー 0', errors.length === 0, errors.join('／'));
		await ctx.close();
	});
}
