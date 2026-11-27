// T221（2026-11-27・因子一覧の取り込み 段2＝6人分の結合。決定 925〜937）の検査。作り物の画（canvasSource）で見る。本物の録画は test:video-local の --list。
// run-smoke.mjs の末尾から register190() で呼ばれる（塊の見出しはすべて「T221」で始まる。`npm run test:visual -- --only=T221` で回せる）。
// スイッチ（js/factor-list.js の FACTOR_LIST_ENABLED）は、blocks-189 の openVideoPage で true に差し替える（製品は false のまま）。
//
// 作り物: 1列の札の因子一覧（寸法はスマホの録画と同じ幅の比）。札には番号（8ビットの白黒の升）を描き、取り込んだ画から読み戻して、
// 人ごとの札の番号の並びが作り物と同じかを見る。
//  (1) 両方のタブ: 6人の札の並び（同じ高さの札が続く・同じ人が両方のタブに出る）・振り分け（1人目→親Aセット・2人目→親Bセット、青い札の順に親・祖1・祖2）・
//      顔の欄・タッチのエフェクトが残らない・取り込む前の画像は置き換わる・知らせ・結合画像（2つ）・分けた画は高さ 3,000px 以下
//  (2) 片方のタブだけ（1人目だけ・2人目だけ）: そのセットだけを取り込み、もう一方のセットは変わらない・知らせの文
//  (3) タブを行き来する: タブごとにいちばん長い区間を使う
//  (4) 3人に満たないタブ・次の人の頭が見えただけ: 取れた人だけを入れ、満たない欄は空になる（決定 936）・一覧の終わりまで写った短い人は入る
//  (5) 速すぎて重なりが無い: 飛びの前の人に人の単位の警告（今の文）・圧縮の粗いコマがあってもそろう
//  (6) 今の判定が成功して3人に満たないときも6人分の道に入る・横画面の6人分（切り出しの失敗のあと）・ウィンドウの取り込みの切り出し（決定 937）
//  (7) 1人分の因子一覧は親の欄に入り、祖の欄は空になる（決定 935）
//  (8) 6人分の結合の途中で取り消すと、どの欄も変わらない
import { openVideoPage } from './blocks-189.mjs';

export const SIX = String.raw`
window.__six = (function () {
	const W = 780, H = 1688, px = (d) => Math.round(W * d);
	const T = px(0.237), TAB = [T + px(0.102), T + px(0.156)], LIST = [T + px(0.165), T + px(1.495)];
	const CH = px(0.089), PITCH = px(0.111), PAD = px(0.022), BOXGAP = px(0.028), VIEW = LIST[1] - LIST[0];
	const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	// 人の中身: 札の番号は seed*32+i（8ビットの升に入るよう seed は 7 まで）。同じ seed なら同じ中身（同じ人が両方のタブに出る）
	const person = (seed, n) => ({ seed, cards: Array.from({ length: n }, (_, i) => seed * 32 + i) });
	const COLORS = { blue: 'rgb(45,172,240)', pink: 'rgb(255,106,170)', green: 'rgb(135,205,45)', gray: 'rgb(222,222,222)' };
	const kindOf = (i) => (i === 0 ? 'blue' : i === 1 ? 'pink' : i === 2 ? 'green' : 'gray');
	function circle(x, cx, cy, r, fill) { x.fillStyle = fill; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
	function card(x, y, id, i) {
		const r = rng(id * 7 + 3), kind = kindOf(i);
		x.fillStyle = COLORS[kind]; x.fillRect(px(0.214), y, px(0.714), CH);
		x.strokeStyle = 'rgb(188,188,196)'; x.lineWidth = 2; x.strokeRect(px(0.214) + 1, y + 1, px(0.714) - 2, CH - 2);
		circle(x, px(0.241), y + CH / 2, px(0.012), 'rgb(190,200,240)');
		x.fillStyle = kind === 'gray' ? 'rgb(105,55,20)' : '#fff';
		const n = 4 + Math.floor(r() * 6), cell = px(0.0085), gy = y + Math.round((CH - cell * 4) / 2);
		for (let k = 0; k < n; k++) { const gx = px(0.27) + k * (cell * 4 + 4); for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (r() < 0.55) x.fillRect(gx + a * cell, gy + b * cell, cell, cell); }
		// 番号の升（8ビット）
		for (let b = 0; b < 8; b++) { x.fillStyle = (id >> b) & 1 ? 'rgb(20,20,20)' : '#fff'; x.fillRect(px(0.585 + b * 0.016), y + Math.round(CH * 0.3), px(0.012), Math.round(CH * 0.4)); }
		const stars = 1 + Math.floor(r() * 3);
		[0.755, 0.798, 0.84].forEach((f, k) => { circle(x, px(f), y + CH / 2, px(0.017), k < stars ? 'rgb(255,200,40)' : 'rgb(240,240,240)'); });
		circle(x, px(0.898), y + CH / 2, px(0.022), '#fff');
		x.fillStyle = 'rgb(100,70,60)'; x.fillRect(px(0.895), y + Math.round(CH * 0.33), 5, Math.round(CH * 0.34));
	}
	function face(x, y, seed, parent) {
		const cx = px(parent ? 0.108 : 0.13), cy = y + px(0.03), r = px(parent ? 0.062 : 0.05);
		circle(x, cx, cy, r, 'rgb(255,200,60)'); circle(x, cx, cy, r - px(0.012), 'hsl(' + (seed * 47 % 360) + ',70%,55%)'); circle(x, cx, cy - px(0.008), r * 0.35, 'rgb(255,222,205)');
	}
	// タブの一覧の全体。tops[k] … k 番目の人の青い札の上端（一覧の中の y）
	function doc(persons) {
		const heights = persons.map((p) => PAD * 2 + (p.cards.length - 1) * PITCH + CH);
		const total = Math.max(VIEW, px(0.032) + heights.reduce((s, h) => s + h + BOXGAP, 0) + px(0.16));
		const c = canvas(W, total), x = c.getContext('2d');
		x.fillStyle = 'rgb(250,250,250)'; x.fillRect(0, 0, W, total);
		x.fillStyle = 'rgb(240,240,240)'; x.fillRect(px(0.022), 0, px(0.956), total);
		const tops = [];
		let y = px(0.032);
		persons.forEach((p, k) => {
			x.fillStyle = '#fff'; x.fillRect(px(0.19), y, px(0.765), heights[k]);
			const first = y + PAD;
			tops.push(first);
			if (k === 0) { x.fillStyle = 'rgb(188,188,188)'; x.fillRect(px(0.058), first + px(0.12), px(0.008), total - first - px(0.5)); }
			p.cards.forEach((id, i) => card(x, first + i * PITCH, id, i));
			face(x, first, p.seed, k === 0);
			y += heights[k] + BOXGAP;
		});
		// 本物の録画の字と縁は圧縮でやわらかい（くっきりしたままだと、縮めたコマの半画素のずれで同じ札が大きく違って見える）
		const soft = canvas(W, total), sx = soft.getContext('2d');
		sx.filter = 'blur(1px)'; sx.drawImage(c, 0, 0);
		return { canvas: soft, tops, end: total - VIEW };
	}
	function base(tab) {
		const c = canvas(W, H), x = c.getContext('2d');
		x.fillStyle = 'rgb(110,120,160)'; x.fillRect(0, 0, W, H);
		x.fillStyle = 'rgb(250,250,250)'; x.fillRect(px(0.013), T, W - px(0.013) * 2, px(1.73));
		x.fillStyle = 'rgb(110,190,10)'; x.fillRect(px(0.013), T, W - px(0.013) * 2, px(0.087));
		x.fillStyle = '#fff'; for (let k = 0; k < 6; k++) x.fillRect(px(0.42) + k * px(0.028), T + px(0.024), px(0.012), px(0.036));
		x.fillStyle = '#fff'; x.fillRect(px(0.025), TAB[0], px(0.95), TAB[1] - TAB[0]);
		x.fillStyle = 'rgb(110,190,10)'; x.fillRect(px(tab === 1 ? 0.025 : 0.5), TAB[0], px(0.475), TAB[1] - TAB[0]);
		x.fillStyle = 'rgb(90,70,60)'; [0.2, 0.68].forEach((f) => x.fillRect(px(f), TAB[0] + px(0.02), px(0.09), px(0.022)));
		x.fillStyle = 'rgb(255,255,255)'; x.fillRect(px(0.3), T + px(1.56), px(0.4), px(0.11));
		return c;
	}
	/* plan: [{ tab: 1|2, dur, from, to }]（from・to は一覧のずれ px。dur 秒で動く）。docs: { 1: doc, 2: doc }。effect: { t0, t1 } の間、札の上に丸を描く。
	 * coarse: [[t0, t1], …] の間は、画を 1/8 に縮めて戻した粗い画（ウィンドウの取り込みの圧縮の粗いコマのまね） */
	function source(docs, plan, effect, coarse) {
		const bases = { 1: base(1), 2: base(2) };
		const frame = canvas(W, H), x = frame.getContext('2d'), tiny = canvas(Math.round(W / 8), Math.round(H / 8));
		const duration = plan.reduce((s, p) => s + p.dur, 0);
		return UmaVideoFrames.canvasSource({ width: W, height: H, duration, exact: true, draw(t, ctx, dw, dh) {
			let at = 0, piece = plan[plan.length - 1], k = 1;
			for (const p of plan) { if (t < at + p.dur) { piece = p; k = (t - at) / p.dur; break; } at += p.dur; }
			const off = Math.round(piece.from + (piece.to - piece.from) * Math.max(0, Math.min(1, k)));
			x.drawImage(bases[piece.tab], 0, 0);
			const d = docs[piece.tab].canvas;
			x.drawImage(d, 0, off, W, VIEW, 0, LIST[0], W, VIEW);
			if (effect && t >= effect.t0 && t < effect.t1) { x.globalAlpha = 0.8; circle(x, px(0.5), LIST[0] + effect.y, px(0.05), 'rgb(120,230,255)'); x.globalAlpha = 1; }
			if (coarse && coarse.some(([a, b]) => t >= a && t < b)) { tiny.getContext('2d').drawImage(frame, 0, 0, tiny.width, tiny.height); x.drawImage(tiny, 0, 0, W, H); }
			ctx.drawImage(frame, 0, 0, dw, dh);
		} });
	}
	// 一定の速さで from→to（0.5秒で 420px）。前後に止まる
	function scroll(tab, from, to, hold) {
		const out = [{ tab, dur: hold || 0.75, from, to: from }];
		const dur = Math.max(0.25, Math.abs(to - from) / 840);
		if (to !== from) out.push({ tab, dur, from, to }, { tab, dur: hold || 0.75, from: to, to });
		return out;
	}
	// DMM版の横画面のまね（実測の大きさ 2780×1564）: 左は別の画面・右に6人分の一覧（画の下まで続き、パネルの形では画からはみ出す）
	function landscape(src) {
		const LW = 2780, LH = 1564, c = canvas(LW, LH), x = c.getContext('2d'), f = canvas(W, H), fx = f.getContext('2d');
		return UmaVideoFrames.canvasSource({ width: LW, height: LH, duration: src.duration, exact: true, async draw(t, ctx, dw, dh) {
			await src.drawAt(t, fx, W, H);
			x.fillStyle = 'rgb(235,235,240)'; x.fillRect(0, 0, LW, LH);
			x.fillStyle = 'rgb(40,45,90)'; x.fillRect(200, 0, 1180, 760);
			const w = 920, s = w / (W * 0.974);
			x.drawImage(f, W * 0.013, T, W * 0.974, (LH - 20) / s, 1505, 20, w, LH - 20);
			ctx.drawImage(c, 0, 0, dw, dh);
		} });
	}
	return { W, H, T, LIST, PITCH, CH, VIEW, person, doc, source, scroll, landscape, px };
})();
`;

/* ページの中で: 6つの欄に前の画像を入れてから、作り物の動画を製品の取り込み（onVideoChosen）に通し、欄ごとの札の番号を読み戻す。
 * 場面（scene）ごとの作り物は __runSix の中で作る */
const RUN = String.raw`
window.__runSix = async function (scene, opts) {
	const S = __six, P = S.person;
	const full = () => [P(1, 14), P(2, 9), P(3, 11)];
	const second = () => [P(4, 10), P(1, 14), P(5, 8)];   // 2人目のタブの祖1 は、1人目のタブの親と同じ中身
	let docs, plan, effect = null;
	const make = (a, b) => ({ 1: S.doc(a), 2: S.doc(b) });
	const both = () => { docs = make(full(), second()); plan = S.scroll(1, 0, docs[1].end).concat(S.scroll(2, 0, docs[2].end)); };
	// エフェクトのまねは先頭のコマだけに描く（その札の最初の控えに写るので、控えを選ばず最初のコマを使うと残る）
	if (scene === 'both') { both(); effect = { t0: 0, t1: 0.1, y: 300 }; }
	if (scene === 'tab1') { docs = make(full(), second()); plan = S.scroll(1, 0, docs[1].end); }
	if (scene === 'tab2') { docs = make(full(), second()); plan = S.scroll(2, 0, docs[2].end); }
	if (scene === 'backforth') { docs = make(full(), second()); plan = S.scroll(1, 0, 8 * S.PITCH, 0.25).concat(S.scroll(2, 0, docs[2].end), S.scroll(1, 0, docs[1].end)); }
	if (scene === 'fewer') { docs = make(full(), [P(6, 7)]); plan = S.scroll(1, 0, docs[1].end).concat([{ tab: 2, dur: 1.5, from: 0, to: 0 }]); }
	// 1人目のタブは祖1 の頭が一覧の下のほうに見えた所で止める。2人目のタブは短い2人目まで終わりを写す
	if (scene === 'peek') { docs = make(full(), [P(7, 16), P(6, 4)]); plan = S.scroll(1, 0, docs[1].tops[1] - Math.round(S.VIEW * 0.82)).concat(S.scroll(2, 0, docs[2].end)); }
	// 親の一覧の途中で、1画面より大きく飛ぶ
	if (scene === 'fast') { docs = make([P(1, 30), P(2, 9), P(3, 11)], second()); plan = [{ tab: 1, dur: 1, from: 0, to: 0 }].concat(S.scroll(1, 16 * S.PITCH, docs[1].end), S.scroll(2, 0, docs[2].end)); }
	if (scene === 'stub' || scene === 'landscape') both();
	// 出だしの1秒と、スクロールの途中の2か所（0.4秒）が粗い画
	let coarse = null;
	if (scene === 'coarse') { both(); plan = [{ tab: 1, dur: 1, from: 0, to: 0 }].concat(plan); coarse = [[0, 1], [3, 3.4], [7.5, 7.9]]; }
	if (scene === 'list1') { docs = null; }
	// 前の画像（作り物の小さな画）を6つの欄に入れる
	for (let i = 0; i < 6; i++) {
		const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d'); x.fillStyle = 'rgb(' + (i * 40) + ',90,90)'; x.fillRect(0, 0, 24, 24);
		const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
		persons[i].files = [new File([blob], 'old-' + i + '.png', { type: 'image/png' })]; persons[i].video = null; renderPersonImageList(i);
	}
	let src = scene === 'list1' ? __fl.src1() : S.source(docs, plan, effect, coarse);
	if (scene === 'landscape') src = S.landscape(src);
	devGeometry = [];
	const toasts = [], orig = window.showToast;
	window.showToast = function (m) { toasts.push(String(m)); return orig.apply(this, arguments); };
	// 今の判定が「成功して1人」になったまね（6人分の道に入ること）
	let stubbed = 0;
	const realVF = window.UmaVideoFrames;
	if (scene === 'stub') window.UmaVideoFrames = Object.assign({}, realVF, { selectFrames: async () => { stubbed++; const f = persons[0].files[0]; return { persons: [{ files: [f, f], shifts: [1], uncertain: [false] }], video: { H: S.H }, header: { headerEnd: 0, footer: S.H } }; } });
	let result, cancelledAt = null;
	// 因子一覧の結合の途中（進み具合が出たところ）で「取り消す」を押すまね
	const timer = opts && opts.cancel ? setInterval(() => {
		if (cancelledAt == null && videoBusy && videoBusy.ratio > 0.3 && devGeometry.some((l) => /見分け: list6/.test(l))) { cancelledAt = videoBusy.ratio; document.querySelector('#video-progress [data-video-act="abort"]').click(); }
	}, 5) : null;
	try {
		activePersonSet = (opts && opts.set) || 0; renderPersonSetTabs();
		videoPending = { setIdx: activePersonSet };
		result = await onVideoChosen(src, {});
	} finally { window.showToast = orig; window.UmaVideoFrames = realVF; if (timer) clearInterval(timer); }
	const slots = [];
	for (let i = 0; i < 6; i++) {
		const p = persons[i], ids = [], sizes = [];
		let effectPx = 0;
		for (const f of p.files) {
			if (!f.factorList6) continue;
			const bmp = await createImageBitmap(f);
			sizes.push([bmp.width, bmp.height]);
			const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
			const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
			// 画の左端は元の画の幅の 0.025 の所
			const k = bmp.width / (S.W * 0.92);
			for (const card of f.factorList6.cards) {
				let id = 0;
				for (let b = 0; b < 8; b++) {
					const cx = Math.round((S.W * (0.585 + b * 0.016 + 0.006) - Math.round(S.W * 0.025)) * k);
					const d = x.getImageData(cx - 1, Math.round(card.y + card.h * 0.5) - 1, 3, 3).data;
					if (d[16] < 128) id |= 1 << b;
				}
				ids.push(id);
			}
			const all = x.getImageData(0, 0, c.width, c.height).data;
			for (let q = 0; q < all.length; q += 4) if (all[q] < 175 && all[q + 1] > 195 && all[q + 2] > 225 && all[q + 1] - all[q] > 60 && all[q + 2] - all[q] > 70 && all[q + 2] - all[q + 1] < 45 && all[q + 1] > 210) effectPx++;
		}
		const first = p.files[0];
		slots.push({ n: p.files.length, old: p.files.length === 1 && first.name === 'old-' + i + '.png', ids, sizes, effectPx,
			face: !!(first && first.factorList6 && first.factorList6.face), type: p.video && p.video.list ? p.video.list.type : null, unc: p.video ? p.video.uncertain.filter(Boolean).length : null });
	}
	const imgs = [];
	for (const id of ['A', 'B']) {
		const wrap = document.querySelector('#personset-' + id + '-wrap');
		const im = wrap.querySelector('.video-result img');
		if (im) await im.decode().catch(() => {});
		imgs.push({ img: im ? [im.naturalWidth, im.naturalHeight] : null, text: im ? wrap.querySelector('.video-result').textContent : '' });
	}
	const text = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
	return { result, cancelledAt, toasts, slots, imgs, stubbed, error: text('#video-error .video-error-text'), logs: devGeometry.filter((l) => /^\[因子一覧\]/.test(l)) };
};
`;

const PAGES = ['special', 'exam'];
const NAME = { special: 'UmaStar', exam: 'UmaExam' };
const ids = (seed, n) => Array.from({ length: n }, (_, i) => seed * 32 + i);
const FULL = [ids(1, 14), ids(2, 9), ids(3, 11)], SECOND = [ids(4, 10), ids(1, 14), ids(5, 8)];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function register190(env) {
	const { block, assert, browser, base } = env;
	const unexpected = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500|本文の帯|使えるフレームが少なすぎる|すべて同じ場所が写っている|横画面のパネルが見つからない/.test(m));
	const open = async (file) => {
		const sp = await openVideoPage(env, base, file, 'on');
		sp.page.setDefaultTimeout(180000);
		for (const s of [SIX, RUN]) await sp.page.addScriptTag({ content: s });
		return sp;
	};
	const run = (page, scene, opts) => page.evaluate(({ scene, opts }) => __runSix(scene, opts), { scene, opts: opts || null });
	const brief = (r) => ({ n: r.slots.map((s) => s.n), cards: r.slots.map((s) => s.ids.length), old: r.slots.map((s) => s.old), toasts: r.toasts, error: r.error, logs: r.logs });

	for (const file of PAGES) {
		const N = NAME[file];
		await block(`T221(1) ${N} 両方のタブの6人分: 札の並び・振り分け・顔の欄・エフェクトが残らない・欄の置き換え・知らせ・結合画像`, async () => {
			const sp = await open(file);
			const r = await run(sp.page, 'both');
			assert(r.result && r.result.ok && !r.error && r.logs.some((l) => /見分け: list6/.test(l)), `T221(1) ${N} 6人分の道で取り込む`, brief(r));
			assert(same(r.slots.slice(0, 3).map((s) => s.ids), FULL), `T221(1) ${N} 1人目のタブは親Aセットに、青い札の順に親・祖A1・祖A2（札の並びが作り物と同じ）`, r.slots.slice(0, 3).map((s) => s.ids));
			assert(same(r.slots.slice(3).map((s) => s.ids), SECOND), `T221(1) ${N} 2人目のタブは親Bセットに（同じ中身の人が両方のタブにいても別の人）`, r.slots.slice(3).map((s) => s.ids));
			assert(r.slots.every((s) => s.type === 'list6' && s.face && s.unc === 0 && !s.old), `T221(1) ${N} 6人とも顔の欄があり、確かでない継ぎ目が無く、前の画像は残らない`, r.slots.map((s) => [s.type, s.face, s.unc, s.old]));
			assert(r.slots.every((s) => s.sizes.length >= 1 && s.sizes.every(([, h]) => h <= 3000)), `T221(1) ${N} 分けた画は高さ 3,000px 以下`, r.slots.map((s) => s.sizes));
			// 地の画にも水色に近い画素（字や縁のぼかし）が 200 ほどある。エフェクトが1枚の札に残ると 3,000 を超える
			assert(r.slots.every((s) => s.effectPx < 600), `T221(1) ${N} タッチのエフェクトのまねが残らない`, r.slots.map((s) => s.effectPx));
			assert(same(r.toasts.filter((t) => t.includes('取得しました')), ['親Aセットと親Bセットを取得しました']), `T221(1) ${N} 知らせは「親Aセットと親Bセットを取得しました」の1つ`, r.toasts);
			assert(r.imgs.every((i) => i.img && i.img[0] > 800 && i.img[1] > 800 && i.img[0] * i.img[1] <= 16777216) && r.imgs.every((i) => !i.text.includes('ずれているかもしれません')), `T221(1) ${N} 親Aセット・親Bセットの結合画像ができ、ずれの警告は出ない`, r.imgs.map((i) => i.img));
			assert(unexpected(sp.errors).length === 0, `T221(1) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T221(2) ${N} 片方のタブだけ: そのセットだけを取り込み、もう一方のセットは変わらない`, async () => {
			const sp = await open(file);
			const a = await run(sp.page, 'tab1', { set: 1 });
			assert(a.result && a.result.ok && same(a.slots.slice(0, 3).map((s) => s.ids), FULL), `T221(2) ${N} 1人目のタブだけ（親Bセットを見ていても）親Aセットに入る`, brief(a));
			assert(a.slots.slice(3).every((s) => s.old) && !a.imgs[1].img, `T221(2) ${N} 1人目のタブだけなら親Bセットは変わらない`, brief(a));
			assert(same(a.toasts.filter((t) => t.includes('取得しました')), ['親Aセットを取得しました']), `T221(2) ${N} 知らせは「親Aセットを取得しました」`, a.toasts);
			await sp.ctx.close();
			const sp2 = await open(file);
			const b = await run(sp2.page, 'tab2');
			assert(b.result && b.result.ok && same(b.slots.slice(3).map((s) => s.ids), SECOND), `T221(2) ${N} 2人目のタブだけなら親Bセットに入る`, brief(b));
			assert(b.slots.slice(0, 3).every((s) => s.old) && !b.imgs[0].img && !!b.imgs[1].img, `T221(2) ${N} 2人目のタブだけなら親Aセットは変わらない`, brief(b));
			assert(same(b.toasts.filter((t) => t.includes('取得しました')), ['親Bセットを取得しました']), `T221(2) ${N} 知らせは「親Bセットを取得しました」`, b.toasts);
			assert(unexpected(sp2.errors).length === 0, `T221(2) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp2.errors).slice(0, 3));
			await sp2.ctx.close();
		});

		await block(`T221(3) ${N} タブを行き来する: タブごとにいちばん長い区間を使う`, async () => {
			const sp = await open(file);
			const r = await run(sp.page, 'backforth');
			assert(r.result && r.result.ok && same(r.slots.slice(0, 3).map((s) => s.ids), FULL) && same(r.slots.slice(3).map((s) => s.ids), SECOND), `T221(3) ${N} 短く見た前の区間でなく、長い区間の6人が入る`, brief(r));
			assert(unexpected(sp.errors).length === 0, `T221(3) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T221(4) ${N} 3人に満たないタブ・次の人の頭が見えただけ: 取れた人だけを入れ、満たない欄は空になる`, async () => {
			const sp = await open(file);
			const f = await run(sp.page, 'fewer');
			assert(f.result && f.result.ok && same(f.slots.map((s) => s.ids), FULL.concat([ids(6, 7), [], []])), `T221(4) ${N} 2人目のタブが1人なら親Bだけに入る`, brief(f));
			assert(f.slots[4].n === 0 && f.slots[5].n === 0 && !!f.imgs[1].img, `T221(4) ${N} 満たない欄（祖B1・祖B2）は前の画像も消えて空になる`, brief(f));
			const p = await run(sp.page, 'peek');
			assert(p.result && p.result.ok && same(p.slots.slice(0, 3).map((s) => s.ids), [ids(1, 14), [], []]), `T221(4) ${N} 次の人の頭が下に見えただけなら、その人は入れない（欄は空）`, brief(p));
			assert(same(p.slots.slice(3).map((s) => s.ids), [ids(7, 16), ids(6, 4), []]), `T221(4) ${N} 一覧の終わりまで写った短い人は入る`, brief(p));
			assert(unexpected(sp.errors).length === 0, `T221(4) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T221(5) ${N} 速すぎて重なりが無いスクロール: 飛びの前の人に人の単位の警告`, async () => {
			const sp = await open(file);
			const r = await run(sp.page, 'fast');
			const head = r.slots[0].ids;
			assert(r.result && r.result.ok && r.logs.some((l) => /1人目のタブ.*重なりの無い飛び 1/.test(l)), `T221(5) ${N} 飛びを1つ見つける`, r.logs);
			assert(head.length < 30 && head.length >= 20 && head[0] === 32 && head.every((v, i) => i === 0 || v > head[i - 1]), `T221(5) ${N} 親は見えた札だけが順に並ぶ（飛んだ札は無い）`, head);
			assert(same(r.slots.slice(0, 3).map((s) => s.unc), [1, 0, 0]) && r.slots.slice(3).every((s) => s.unc === 0) && same(r.slots.slice(1, 3).map((s) => s.ids), FULL.slice(1)), `T221(5) ${N} 確かでない印は親Aだけ・ほかの人はそろう`, r.slots.map((s) => s.unc));
			const warn = await sp.page.evaluate(() => videoText('video.warn.person', { 人: '親A' }));
			assert(r.imgs[0].text.includes(warn) && !r.imgs[1].text.includes('ずれているかもしれません'), `T221(5) ${N} 親Aセットの結合画像の上に今の人の単位の警告（親A）`, [warn, r.imgs[0].text.slice(0, 120)]);
			// 人の分け方: 飛びのある最後の人は、青い札が下にあっても外さない（外すと印ごと消える）。飛びの無い「見えただけ」の人は外す
			const sp5 = await sp.page.evaluate(() => {
				const row = (kind, a, o) => Object.assign({ kind, samples: [{ a, endGrey: false }] }, o);
				const seq = (gap) => ({ rows: [row('blue', 50), row('gray', 100), row('blue', 900, { gapBefore: gap }), row('gray', 950)], tailSkipped: 0 });
				return [true, false].map((g) => UmaFactorList.splitPersons(seq(g), 500).map((p) => [p.rows.length, p.uncertain]));
			});
			assert(same(sp5, [[[2, true], [2, false]], [[2, false]]]), `T221(5) ${N} 飛びのある最後の人は外さず前の人に印・飛びの無い見えただけの人は外す`, sp5);
			const c = await run(sp.page, 'coarse');
			assert(c.result && c.result.ok && same(c.slots.map((s) => s.ids), FULL.concat(SECOND)) && c.slots.every((s) => s.unc === 0), `T221(5) ${N} 粗い画の区間があっても、6人の札がそろい、確かでない印は付かない`, brief(c));
			assert(unexpected(sp.errors).length === 0, `T221(5) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T221(6) ${N} 今の判定が成功して3人に満たないとき・横画面の6人分・ウィンドウの取り込みの切り出し`, async () => {
			const sp = await open(file);
			const s = await run(sp.page, 'stub');
			assert(s.stubbed === 1 && s.result && s.result.ok && same(s.slots.map((v) => v.ids), FULL.concat(SECOND)), `T221(6) ${N} 今の判定が1人で成功しても、6人分と見分けたら6人分を入れる`, brief(s));
			const l = await run(sp.page, 'landscape');
			assert(l.result && l.result.ok && l.logs.some((v) => /見分け: list6/.test(v)), `T221(6) ${N} 横画面の6人分は切り出しの失敗のあと見分けて取り込む`, brief(l));
			assert(same(l.slots.map((v) => v.ids.length), [14, 9, 11, 10, 14, 8]) && l.toasts.includes('親Aセットと親Bセットを取得しました'), `T221(6) ${N} 横画面の6人の札の数と知らせ`, brief(l));
			await sp.ctx.close();
			const shot = async (mode) => {
				const p = await openVideoPage(env, base, file, mode);
				await p.page.addScriptTag({ content: SIX });
				const out = await p.page.evaluate(async () => {
					const S = __six, d = { 1: S.doc([S.person(1, 14)]), 2: S.doc([S.person(2, 14)]) };
					const grab = async (src) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d', { willReadFrequently: true }); await src.drawAt(0, x, c.width, c.height); return x.getImageData(0, 0, c.width, c.height); };
					const six = UmaPcCapture.detectOne(await grab(S.landscape(S.source(d, S.scroll(1, 0, 0)))));
					const one = UmaPcCapture.detectOne(await grab(__fl.still(await __fl.landscape('l1'))));
					return { six: six.ok ? { x: six.x, y: six.y, w: six.w, how: six.how, outW: six.outW } : six.reason + ':' + six.landscape, one: one.ok ? { x: one.x, w: one.w, how: one.how } : one.reason };
				});
				await p.ctx.close();
				return out;
			};
			const on = await shot('on'), off = await shot('off');
			assert(on.six && on.six.how === 'landscape' && on.six.x > 1480 && on.six.x < 1510 && on.six.w > 915 && on.six.w < 960 && on.six.outW === 1170, `T221(6) ${N} ウィンドウの取り込みは横画面の右の6人分を切り出す（スイッチ true）`, on);
			assert(off.six === 'aspect:panel-cut', `T221(6) ${N} スイッチ false の切り出しは今のまま（見つからない）`, off);
			assert(on.one && on.one.how === 'landscape' && on.one.x > 150 && on.one.x < 200 && off.one === 'aspect', `T221(6) ${N} 今の切り出しが見つけられず、左に1人分・右に6人分があれば、スイッチ true は左の1人分を切り出す（決定 931）`, [on.one, off.one]);
		});

		await block(`T221(8) ${N} 6人分の結合の途中で取り消す: どの欄も変わらない`, async () => {
			const sp = await open(file);
			const r = await run(sp.page, 'both', { cancel: true });
			assert(r.cancelledAt != null && r.result && r.result.aborted === true, `T221(8) ${N} 結合の途中で取り消せる`, { at: r.cancelledAt, result: r.result });
			assert(r.slots.every((s) => s.old) && r.imgs.every((i) => !i.img) && r.toasts.includes('取り消しました。入っていた画像はそのままです') && !r.toasts.some((t) => t.includes('取得しました')), `T221(8) ${N} 6つの欄は前のまま・取り消しの知らせだけ`, brief(r));
			assert(unexpected(sp.errors).length === 0, `T221(8) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T221(7) ${N} 1人分の因子一覧: 親の欄に入り、祖の欄は空になる（ほかのセットは変わらない）`, async () => {
			const sp = await open(file);
			const r = await run(sp.page, 'list1');
			assert(r.result && r.result.ok && r.slots[0].type === 'list1' && r.slots[0].n >= 2 && r.slots[1].n === 0 && r.slots[2].n === 0, `T221(7) ${N} 親の欄は置き換え、祖A1・祖A2 は空になる`, brief(r));
			assert(r.slots.slice(3).every((s) => s.old) && r.toasts.includes('親Aセットの親を取得しました'), `T221(7) ${N} 親Bセットは変わらず、知らせは今のまま`, brief(r));
			assert(unexpected(sp.errors).length === 0, `T221(7) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});
	}
}
