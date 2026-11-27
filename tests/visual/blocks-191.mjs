// T222（2026-11-27・因子一覧の取り込み 段3＝6人分の読み取りと印・一覧の終わりの知らせ・隠しの入口。決定 938〜940）の検査。
// 作り物の画（canvasSource と、手で描いた分けた画）で見る。本物の録画と本物の OCR は test:video-local の --list。
// run-smoke.mjs の末尾から register191() で呼ばれる（塊の見出しはすべて「T222」で始まる。`npm run test:visual -- --only=T222` で回せる）。
// スイッチ（js/factor-list.js の FACTOR_LIST_ENABLED）は製品の false のままで、隠しの入口（URL の ?factorlist=1）から開く。
//  (1) 分けた画の読み取り（手で描いた札。★0〜3・青・赤・固有の緑・灰色）: 行の切り出し・★・種類・青赤固有の緑の読み
//  (2) 6人分の取り込み → 読み取り → 照合（偽の OCR は札の番号を読む）。画を足し引きして動画の控えが消えても読める
//  (3) 印（UmaStar の枠・UmaExam の〇と蹄鉄）が1列の札に乗る（3列・2列）。札の間の白塗り
//  (4) 一覧の最後まで写っていない人にだけ、今の知らせを出す（決定 938）
//  (5) 隠しの入口: 印の無い URL は製品の今のまま（結合画像がバイトまで同じ・印の文も無い）。?factorlist=1 は因子一覧が働き、印の文が出る。保存しない
// 壊して NG になることの確かめ: 環境変数 T222_BREAK（star・exam・partial・trial）を付けて回すと、製品をわざと壊した写しを配る（検査の道具だけ）
import { FACTOR, runImport } from './blocks-189.mjs';
import { SIX } from './blocks-190.mjs';
import { SYNTH85 } from './blocks-100.mjs';
import { reloadReady } from './lib/page-ready.mjs';

const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
const FAKE_TESSERACT = 'window.Tesseract={createWorker:async()=>({loadLanguage:async()=>{},initialize:async()=>{},setParameters:async()=>{},terminate:async()=>{},recognize:async()=>({data:{text:"",lines:[]}})})};';
const PAGES = ['special', 'exam'];
const NAME = { special: 'UmaStar', exam: 'UmaExam' };
const ids = (seed, n) => Array.from({ length: n }, (_, i) => seed * 32 + i);
const FULL = [ids(1, 14), ids(2, 9), ids(3, 11)], SECOND = [ids(4, 10), ids(1, 14), ids(5, 8)];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 壊した写し（T222_BREAK）: [ファイル, 直す前, 直した後]
const BREAKS = {
	star: ['special.html', 'const left = toX(card.x0), right = toX(card.x1),', 'const left = toX(card.x0) - 60, right = toX(card.x1) - 60,'],
	exam: ['exam.html', 'const LIST_CARD_MARK_CX = 0.45;', 'const LIST_CARD_MARK_CX = -0.45;'],
	partial: ['js/factor-list.js', 'end.partial = true;', 'end.partial = false;'],
	trial: ['js/factor-list.js', "get('factorlist') === '1'", "get('factorlist') !== '0'"]
};

// ページの中の道具
const TOOLS = String.raw`
window.__t222 = (function () {
	// 手で描く分けた画: 幅 1000。札は x 205〜980・高さ 100・間隔 130。kinds・stars は上から
	async function piece(kinds, stars, name, o) {
		o = o || {};
		const W = 1000, L = 205, R = 980, H = 100, P = 130, top = 40;
		const c = document.createElement('canvas'); c.width = W; c.height = top + P * kinds.length + 10;
		const x = c.getContext('2d');
		x.fillStyle = '#fff'; x.fillRect(0, 0, W, c.height);
		const FILL = { blue: 'rgb(45,172,240)', pink: 'rgb(255,106,170)', green: 'rgb(135,205,45)', gray: 'rgb(222,222,222)' };
		const cards = kinds.map((kind, i) => {
			const y = top + P * i;
			x.fillStyle = FILL[kind]; x.fillRect(L, y, R - L, H);
			// 名前のまね: 札の番号 i を、太い縦の棒 i+1 本で描く（灰色の札は黒っぽい棒、色の札は白い棒）
			x.fillStyle = kind === 'gray' ? 'rgb(40,20,10)' : '#fff';
			for (let k = 0; k <= i; k++) x.fillRect(L + 70 + k * 30, y + 30, 14, 40);
			// ★3つ。赤の札の空の★は淡い橙（本物の赤の札の空の★は、灰色の札の金色の条件に当たる）
			[0.758, 0.818, 0.877].forEach((f, k) => {
				x.fillStyle = k < stars[i] ? 'rgb(255,200,40)' : (kind === 'pink' ? 'rgb(245,190,150)' : 'rgb(240,240,240)');
				x.beginPath(); x.arc(L + (R - L) * f, y + H / 2, 22, 0, Math.PI * 2); x.fill();
			});
			return { y, h: H, kind };
		});
		// 矢印の欠けらのまね: 札の間の右端の短い線と、次の札の右の角の外にかかる先
		if (o.fragment != null) { x.fillStyle = 'rgb(60,120,140)'; x.fillRect(R - 6, top + P * o.fragment + H + 8, 8, 14); x.fillRect(R + 3, top + P * (o.fragment + 1) + 1, 4, 6); }
		const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
		const file = new File([blob], name || 'piece.png', { type: 'image/png' });
		file.factorList6 = Object.freeze({ part: 0, parts: 1, scale: o.scale || 0.9, cards, face: null });
		return { file, W, H: c.height, cards, L, R, canvas: c };
	}
	// 作り物の札の画（__six）は字をやわらかくしてあるので、画質の足切り（鮮明度）に当たる。読み取りの流れを見る塊では足切りを通す
	function passQuality() { window.assessImageQuality = () => ({ ok: true, sharpness: null, reasons: [], warnings: [], rejectKinds: [], warnKinds: [] }); }
	// 作り物の札の画（blocks-190 の __six）の★の数（札の番号から。__six の card と同じ乱数の使い方）
	function starsOf(id) {
		let seed = id * 7 + 3;
		const r = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
		const n = 4 + Math.floor(r() * 6);
		for (let k = 0; k < n * 16; k++) r();
		return 1 + Math.floor(r() * 3);
	}
	// 作り物の札の番号（8ビットの升。名前の切り出しの中）を、切り出しの元の画から読む
	function idAt(base, card) {
		const x = base.getContext('2d', { willReadFrequently: true }), cw = card.x1 - card.x0;
		let id = 0;
		for (let b = 0; b < 8; b++) {
			const f = (0.585 + b * 0.016 + 0.006 - 0.214) / 0.714;
			const d = x.getImageData(Math.round(card.x0 + cw * f) - 1, Math.round(card.a + card.h * 0.5) - 1, 3, 3).data;
			if (d[16] < 128) id |= 1 << b;
		}
		return id;
	}
	/* 偽の OCR: stackRowsWithMeta に渡った行（切り出しの元の画と行）を控え、認識のたびに行ごとの札の番号を読んで names[番号 % 数] を返す */
	function fakeWorker(names) {
		let last = null;
		const orig = window.stackRowsWithMeta;
		window.stackRowsWithMeta = function (base, rows) { const r = orig.apply(this, arguments); last = { base, rows, placements: r.placements }; return r; };
		return {
			restore() { window.stackRowsWithMeta = orig; },
			recognize: async () => {
				if (!last || !last.rows[0] || !last.rows[0].card) return { data: { text: '', lines: [] } };
				return { data: { text: '', lines: last.placements.map((p) => ({ text: names[idAt(last.base, last.rows[p.rowIndex].card) % names.length], confidence: 90, bbox: { y0: p.y0, y1: p.y1 } })) } };
			}
		};
	}
	// 印を描く前後の違いを、札（画の左の端の内側の列で、白でない続き）ごとに数える
	function cardsOf(ctx, W, H) {
		const x = Math.round(W * 0.215), d = ctx.getImageData(x, 0, 1, H).data, out = [];
		let a = -1;
		for (let y = 0; y <= H; y++) {
			const on = y < H && Math.min(d[y * 4], d[y * 4 + 1], d[y * 4 + 2]) < 244;
			if (on && a < 0) a = y;
			if (!on && a >= 0) { if (y - a > W * 0.05) out.push({ a, b: y - 1 }); a = -1; }
		}
		out.forEach((c) => { const r = ctx.getImageData(0, (c.a + c.b) >> 1, W, 1).data; let L = -1, R = -1; for (let i = Math.round(W * 0.19); i < W; i++) if (Math.min(r[i * 4], r[i * 4 + 1], r[i * 4 + 2]) < 244) { if (L < 0) L = i; R = i; } c.L = L; c.R = R; });
		return out;
	}
	function diff(ctx, before, cards) {
		const W = ctx.canvas.width, H = ctx.canvas.height, after = ctx.getImageData(0, 0, W, H).data;
		const per = cards.map(() => ({ inside: 0, left: 0, edgeL: 0, edgeR: 0 }));
		let outside = 0;
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
			const p = (y * W + x) * 4;
			if (Math.abs(after[p] - before[p]) + Math.abs(after[p + 1] - before[p + 1]) + Math.abs(after[p + 2] - before[p + 2]) < 30) continue;
			let hit = -1;
			for (let j = 0; j < cards.length; j++) { const c = cards[j], pad = Math.round((c.b - c.a) * 0.1); if (y >= c.a - pad && y <= c.b + pad) { hit = j; break; } }
			if (hit < 0) { outside++; continue; }
			const c = cards[hit], q = per[hit], pad = Math.round((c.b - c.a) * 0.1);
			if (x > c.R + pad) { outside++; continue; }
			if (x < c.L - pad) q.left++; else q.inside++;
			if (Math.abs(x - c.L) <= pad) q.edgeL++;
			if (Math.abs(x - c.R) <= pad) q.edgeR++;
		}
		return { cards: per, outside };
	}
	// window[name] を包んで、描いた違いを marks[鍵] に残す
	function wrap(name, marks, key) {
		const orig = window[name];
		window[name] = function (c, idx) {
			const x = c.getContext('2d'), cards = cardsOf(x, c.width, c.height), before = x.getImageData(0, 0, c.width, c.height).data;
			const res = orig.apply(this, arguments);
			marks[key()][idx] = diff(x, before, cards);
			return res;
		};
		return () => { window[name] = orig; };
	}
	return { piece, passQuality, starsOf, idAt, fakeWorker, cardsOf, diff, wrap };
})();
`;

const NAMES = ['大阪杯', '皐月賞', '安田記念', '宝塚記念', '菊花賞', '有馬記念', '末脚', '先駆け', '地固め', '直情', '連綿', '遊び心', '立ち合い', '勝負勘', '先導者', '快速', '精進', '綺羅星', '決定打', '比類なき', 'ペースアップ', '危険回避', '序盤巧者', '中盤巧者', 'シンパシー', 'レコメンド', 'パイオニア', '品行方正', '心惹かれて', '前列狙い', '自制心', '砂蹴り'];

export async function register191(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const BASELINE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests/visual/lib/t220-stitch-baseline.json'), 'utf8'));
	const unexpected = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500|本文の帯|使えるフレームが少なすぎる|すべて同じ場所が写っている|横画面のパネルが見つからない/.test(m));

	// ページを開いて動画の入口の状態にする。query … URL の ? 以降（隠しの入口）
	async function open(file, query) {
		const sp = await openPage(browser, base, file + '.html' + (query || ''), { width: 375, height: 812 }, EMPTY);
		const page = sp.page;
		page.setDefaultTimeout(180000);
		const br = BREAKS[process.env.T222_BREAK];
		if (br) {
			await page.route('**/' + br[0] + '*', (route) => {
				const body = fs.readFileSync(path.join(REPO_ROOT, br[0]), 'utf8');
				if (!body.includes(br[1])) throw new Error('壊す所が無い: ' + br[1]);
				return route.fulfill({ status: 200, contentType: (br[0].endsWith('.js') ? 'text/javascript' : 'text/html') + '; charset=utf-8', body: body.replace(br[1], br[2]) });
			});
		}
		await page.route('**/tesseract.js/4.0.2/tesseract.min.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_TESSERACT }));
		await page.evaluate((f) => {
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			localStorage.setItem(f === 'special' ? 'uma-special-upload-mode' : 'uma-exam-upload-mode', 'video');
			if (f === 'exam') localStorage.setItem('uma-exam-last-step', '2');
		}, file);
		await reloadReady(page);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click(file === 'special' ? '[data-act="notice-ok"]' : '#ui-notice-ok').catch(() => {});
		await page.evaluate(() => selectStepTab(2));
		for (const s of [SYNTH85, FACTOR, SIX, TOOLS]) await page.addScriptTag({ content: s });
		return sp;
	}
	// 作り物の6人分の動画を製品の取り込みに通す。spec: { tab1: [[seed, n], …], tab2: …, stop2: 2人目のタブを止める位置（人の番号, 札の数ぶん手前）, stop1 }
	const importSix = (page, spec) => page.evaluate(async (spec) => {
		const S = __six, P = S.person;
		const docs = { 1: S.doc(spec.tab1.map(([s, n]) => P(s, n))), 2: S.doc(spec.tab2.map(([s, n]) => P(s, n))) };
		const end = (tab, stop) => (stop ? Math.round(docs[tab].tops[stop[0]] - S.VIEW * stop[1]) : docs[tab].end);
		const plan = S.scroll(1, 0, end(1, spec.stop1)).concat(S.scroll(2, 0, end(2, spec.stop2)));
		devGeometry = [];
		const toasts = [], orig = window.showToast;
		window.showToast = function (m) { toasts.push(String(m)); return orig.apply(this, arguments); };
		let result;
		try { activePersonSet = 0; renderPersonSetTabs(); videoPending = { setIdx: 0 }; result = await onVideoChosen(S.source(docs, plan), {}); }
		finally { window.showToast = orig; }
		const notes = ['A', 'B'].map((id) => Array.from(document.querySelectorAll('#personset-' + id + '-wrap .video-result .video-partial'), (e) => e.textContent.trim()));
		return { result, toasts, notes, cards: persons.map((p) => p.files.reduce((a, f) => a + (f.factorList6 ? f.factorList6.cards.length : 0), 0)), logs: devGeometry.filter((l) => /^\[因子一覧\]|途中まで/.test(l)) };
	}, spec);
	const BOTH = { tab1: [[1, 14], [2, 9], [3, 11]], tab2: [[4, 10], [1, 14], [5, 8]] };

	for (const file of PAGES) {
		const N = NAME[file];

		await block(`T222(1) ${N} 分けた画の読み取り: 灰色の札の行と★0〜3・青赤固有の緑の札の★と白い字の切り出し`, async () => {
			const sp = await open(file, '?factorlist=1');
			const r = await sp.page.evaluate(async (file) => {
				const kinds = ['blue', 'pink', 'green', 'gray', 'gray', 'gray', 'gray', 'gray'], stars = [2, 2, 1, 0, 1, 2, 3, 2];
				const P = await __t222.piece(kinds, stars);
				const img = await loadImage(P.file), b = toBaseCanvas(img);
				const det = UmaFactorList.detectRows6(b, P.file, img.naturalHeight, []);
				const rs = UmaFactorList.rowStars6(b, det);
				const top = UmaFactorList.topCards6(b, P.file, img.naturalHeight);
				// 白い字の切り出し: 黒い棒の本数（札の番号 + 1）を数える（★や ● が入ると本数が変わる）
				const bars = (c) => {
					const d = c.getContext('2d').getImageData(0, Math.round(c.height / 2), c.width, 1).data;
					let n = 0, on = false;
					for (let i = 0; i < c.width; i++) { const dk = d[i * 4] < 128; if (dk && !on) n++; on = dk; }
					return n;
				};
				const crops = ['blue', 'red', 'green'].map((k) => bars(melopTextCanvas(b, top[k].layout, top[k].layout.col, top[k].layout.top, true)));
				const greenCrop = bars(greenFactorTextCanvas(b, top.green.layout, 215));
				// ページの読み手（偽の OCR）
				const calls = [];
				const worker = { recognize: async () => { calls.push(1); return { data: { text: file === 'special' ? ['スピード', '芝'][calls.length - 1] || '' : ['スピード', '芝'][calls.length - 1] || '' } }; } };
				let read;
				if (file === 'special') read = await readTopBlueRed(worker, [P.file]);
				else { await loadMelopSheet(); read = await readMelopTopRow(worker, [P.file], melopSheet); }
				if (file === 'special') await UmaSkillDeckCore.loadTrainingSources(false); else await loadGreenNames();
				const names = file === 'special' ? greenUniqueNames() : (examGreenNames || greenUniqueNames());
				const target = names[0];
				const g = await readGreenFactor({ recognize: async () => ({ data: { text: target } }) }, [P.file]);
				return { rows: det.rows.map((q) => ({ a: q.card.a, h: q.card.h, x0: q.card.x0, x1: q.card.x1, y: q.y, hh: q.h })), columns: det.columns, list6: det.list6, columnXs: det.columnXs, stars: rs.map((s) => s.stars), reliable: rs.every((s) => s.reliable),
					topStars: [top.blue.stars, top.red.stars, top.green.stars], crops, greenCrop, read, green: g && [g.name, g.stars], target };
			}, file);
			const grey = [3, 4, 5, 6, 7].map((i) => 40 + 130 * i);
			assert(r.list6 && r.columns === 1 && same(r.rows.map((q) => q.a), grey) && r.rows.every((q) => q.h === 100 && Math.abs(q.x0 - 205) <= 2 && Math.abs(q.x1 - 980) <= 2 && q.y === q.a + 16 && q.hh === 68), `T222(1) ${N} 行は灰色の札だけ（上端・高さ・左右の端が印と画に合う）`, r);
			assert(same(r.stars, [0, 1, 2, 3, 2]) && r.reliable, `T222(1) ${N} 灰色の札の★0〜3`, r.stars);
			assert(same(r.topStars, [2, 2, 1]), `T222(1) ${N} 青・赤・固有の緑の★（赤の札の空の★は数えない）`, r.topStars);
			assert(same(r.crops, [1, 2, 3]) && r.greenCrop === 3, `T222(1) ${N} 白い字の切り出しは名前だけ（青・赤・固有の緑の札）`, [r.crops, r.greenCrop]);
			const blue = r.read && r.read.blue, red = r.read && r.read.red;
			assert(blue && blue.name === 'スピード' && blue.stars === 2 && red && red.name === '芝' && red.stars === 2, `T222(1) ${N} ページの青・赤の読みは印の札から（名前と★）`, r.read);
			if (file === 'exam') assert(r.read.found === true && r.read.uniqueStars === 1 && r.read.extraLines.length === 0, `T222(1) ${N} めろっぷのいちばん上の段（固有の★・右隣の行は無い）`, r.read);
			assert(r.green && r.green[0] === r.target && r.green[1] === 1, `T222(1) ${N} 固有の緑の読み（名前と★）`, [r.green, r.target]);
			assert(unexpected(sp.errors).length === 0, `T222(1) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T222(2) ${N} 6人分の取り込み → 読み取り → 照合・画を足し引きしても読める`, async () => {
			const sp = await open(file, '?factorlist=1');
			const imp = await importSix(sp.page, BOTH);
			assert(imp.result && imp.result.ok && same(imp.cards, [14, 9, 11, 10, 14, 8]), `T222(2) ${N} 6人分を取り込む`, imp);
			const r = await sp.page.evaluate(async ({ names }) => {
				__t222.passQuality();
				const w = __t222.fakeWorker(names);
				const readOne = async (files, video) => {
					const o = await processPersonImages(w, files, 'p', true, true, false, video);
					const rows = new Map();
					o.lines.forEach((l) => { if (l.rowKey && !rows.has(l.rowKey)) rows.set(l.rowKey, l); });
					const m = matchAllSkillsWithStars(o.lines, names, names.map((n) => ({ raw: n, norm: normalizeText(n) })), {});
					return { rows: Array.from(rows.values(), (l) => [l.text, l.stars]), found: Array.from(m.detectedSkills, (n) => [n, m.skillStars[n]]), geo: o.geometry.map((g) => (g ? [!!g.list6, g.rows ? g.rows.length : 0] : null)) };
				};
				const out = { people: [] };
				for (let i = 0; i < 6; i++) out.people.push(await readOne(persons[i].files, persons[i].video));
				// 画の足し引き: 親A に静止画を1枚足し、祖A1 の動画の控えを外す
				const c = document.createElement('canvas'); c.width = 800; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 800, 1200);
				for (let y = 40; y < 1150; y += 60) { x.fillStyle = '#222'; x.fillRect(60, y, 200, 16); }
				const extra = new File([await new Promise((res) => c.toBlob(res, 'image/png'))], 'extra.png', { type: 'image/png' });
				persons[0].files.push(extra); videoTouched(0); videoTouched(1);
				out.afterVideo = [persons[0].video, persons[1].video];
				out.isList6 = [UmaFactorList.isList6(persons[0].files), UmaFactorList.isList6(persons[1].files)];
				out.mixed = await readOne(persons[0].files, persons[0].video);
				out.touched = await readOne(persons[1].files, persons[1].video);
				w.restore();
				return out;
			}, { names: NAMES });
			const expect = (list) => list.slice(3).map((id) => [NAMES[id % NAMES.length], null]);
			const want = await sp.page.evaluate((all) => all.map((l) => l.slice(3).map((id) => __t222.starsOf(id))), FULL.concat(SECOND));
			const lists = FULL.concat(SECOND);
			assert(r.people.every((p, i) => same(p.rows, expect(lists[i]).map((e, k) => [e[0], want[i][k]]))), `T222(2) ${N} 6人とも、灰色の札の行が順に読め、行ごとの★が作り物と合う`, r.people.map((p, i) => ({ rows: p.rows, want: want[i] })));
			assert(r.people.every((p, i) => p.found.length === lists[i].length - 3 && p.found.every(([n, s]) => { const k = lists[i].slice(3).findIndex((id) => NAMES[id % NAMES.length] === n); return k >= 0 && want[i][k] === s; })), `T222(2) ${N} 照合（名前と★）が札と合う・余分な検出なし`, r.people.map((p) => p.found));
			assert(r.people.every((p) => p.geo.every((g) => g && g[0] && g[1] > 0)), `T222(2) ${N} 行の座標に1列の印がつく`, r.people.map((p) => p.geo));
			assert(r.afterVideo.every((v) => v === null) && same(r.isList6, [false, true]), `T222(2) ${N} 前提: 動画の控えは消え、足した人は因子一覧だけの画でなくなる`, [r.afterVideo, r.isList6]);
			assert(same(r.touched.rows, r.people[1].rows) && same(r.mixed.rows.slice(0, r.people[0].rows.length), r.people[0].rows), `T222(2) ${N} 控えが消えても、画の印で同じように読める（足した静止画があっても）`, [r.touched.rows, r.mixed.rows]);
			assert(unexpected(sp.errors).length === 0, `T222(2) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T222(3) ${N} 印が1列の札に乗る（3列・2列）・札の間の白塗り`, async () => {
			const sp = await open(file, '?factorlist=1');
			const imp = await importSix(sp.page, BOTH);
			assert(imp.result && imp.result.ok, `T222(3) ${N} 前提: 6人分を取り込む`, imp);
			const r = await sp.page.evaluate(async ({ names, file }) => {
				__t222.passQuality();
				const w = __t222.fakeWorker(names);
				personResults = persons.map(() => null); personLines = persons.map(() => null); personGeometry = persons.map(() => null);
				let run = null;
				if (file === 'exam') { attrIconsEnabled = true; run = captureRun(); }
				const pool = file === 'exam' ? run.skillList.slice(0, 32) : names;
				const w2 = file === 'exam' ? (w.restore(), __t222.fakeWorker(pool)) : w;
				const hits = [];
				for (let i = 0; i < 6; i++) {
					const o = await processPersonImages(w2, persons[i].files, 'p', true, true, false, persons[i].video);
					personLines[i] = o.lines; personGeometry[i] = o.geometry;
					personResults[i] = file === 'exam'
						? matchAllSkillsWithStars(o.lines, run.skillList, run.skillIndex, {})
						: matchAllSkillsWithStars(o.lines, pool, pool.map((n) => ({ raw: n, norm: normalizeText(n) })), {});
					// 行の番号（読み取りの画ごとの灰色の札の順）→ 札の番号（青・赤・緑の3枚のあと）
					const offs = []; let n = 0; o.geometry.forEach((g) => { offs.push(n); n += g && g.rows ? g.rows.length : 0; });
					const set = new Set();
					personResults[i].detectedSkills.forEach((s) => (personResults[i].skillSources[s] || []).forEach((li) => {
						const k = o.lines[li] && o.lines[li].rowKey;
						if (k && (file !== 'exam' || stitchMarkKind(s, run))) { const [f, q] = k.split(':').map(Number); set.add(3 + offs[f] + q); }
					}));
					hits.push(Array.from(set).sort((a, b) => a - b));
				}
				w2.restore();
				const marks = { 3: [], 2: [] };
				let cols = 3;
				const out = { hits, marks, sizes: [], crop: [], pageMarks: [] };
				const undo = __t222.wrap(file === 'special' ? 'drawFactorFramesOnPerson' : 'drawAttrIconsOnPerson', marks, () => cols);
				const origCrop = file === 'special' ? window.stitchSideCrop : null;
				if (origCrop) window.stitchSideCrop = function (c, icon) { const res = origCrop.apply(this, arguments); const s = res._sideCrop; if (cols === 3) out.crop.push({ ok: s.ok, L: s.L, R: s.R, span: c._frameSpan || null }); return res; };
				if (file === 'special') window.stitchSimpleKindByName = () => Object.fromEntries(pool.map((n) => [n, 'simple']));
				for (cols of [3, 2]) for (let si = 0; si < 2; si++) {
					const c = file === 'special'
						? await buildStitchedSetImage(si, null, true, Object.assign(stitchPartsNow(), { cols, marker: false, legacy: false }))
						: await buildStitchedSetImage(si, Object.assign({}, run, { cols }), null);
					out.sizes.push(c ? [c.width, c.height] : null);
				}
				undo(); if (origCrop) window.stitchSideCrop = origCrop;
				if (file === 'exam') {
					// 蹄鉄: 検出した名前の全部を対象にして（区間は順に）、1人の結合の画に描く
					const run2 = Object.assign({}, run, { eff: { on: true }, effShoes: true });
					const origItems = window.effPersonItems;
					window.effPersonItems = (i) => Array.from(personResults[i].detectedSkills, (n, k) => ({ dictName: n, tier: k % 4 }));
					const shoes = [];
					for (let i = 0; i < 6; i++) {
						personMelop[i] = { top: null, res: personResults[i] };
						const c = await UmaFactorList.composeList6(persons[i].files), x = c.getContext('2d');
						const cards = __t222.cardsOf(x, c.width, c.height), before = x.getImageData(0, 0, c.width, c.height).data;
						const res = drawEffIconsOnPerson(c, i, run2, await loadEffIconImages());
						shoes.push(Object.assign(__t222.diff(x, before, cards), { res }));
					}
					window.effPersonItems = origItems;
					out.shoes = shoes;
				}
				// 札の間の白塗り: 札の間の右端の短い線は消え、札の中は変わらない
				const P = await __t222.piece(['blue', 'gray', 'gray', 'gray'], [1, 2, 3, 1], 'frag.png', { fragment: 1, scale: 1 });
				const c = await UmaFactorList.composeList6([P.file]), cx = c.getContext('2d', { willReadFrequently: true });
				let left = 0;
				for (const [fx, fy, fw, fh] of [[P.R - 6, 40 + 130 + 108, 8, 14], [P.R + 3, 40 + 130 * 2 + 1, 4, 6]]) {
					const dark = cx.getImageData(fx, fy, fw, fh).data;
					for (let i = 0; i < dark.length; i += 4) if (Math.min(dark[i], dark[i + 1], dark[i + 2]) < 244) left++;
				}
				const orig = P.canvas.getContext('2d').getImageData(P.L, 40 + 130, P.R - P.L, 100).data, now = cx.getImageData(P.L, 40 + 130, P.R - P.L, 100).data;
				let changed = 0; for (let i = 0; i < orig.length; i++) if (orig[i] !== now[i]) changed++;
				out.frag = { left, changed, places: c._factorList6.places };
				return out;
			}, { names: NAMES, file });
			assert(r.hits.every((h) => h.length >= 3), `T222(3) ${N} 前提: 6人とも検出した札がある`, r.hits);
			const kind = file === 'special' ? '枠' : '〇';
			for (const cols of [3, 2]) {
				const m = r.marks[cols];
				const rows = r.hits.map((h, i) => {
					const q = m[i];
					if (!q) return { i, none: true };
					const got = q.cards.map((c, j) => ((file === 'special' ? c.inside : c.left) > 20 ? j : -1)).filter((j) => j >= 0);
					const edges = file === 'special' ? h.every((j) => q.cards[j].edgeL > 20 && q.cards[j].edgeR > 20 && q.cards[j].left === 0) : q.cards.every((c) => c.inside === 0);
					return { i, got, want: h, outside: q.outside, edges };
				});
				assert(rows.every((q) => !q.none && same(q.got, q.want) && q.outside === 0 && q.edges), `T222(3) ${N} ${cols}列: ${kind}は検出した札にだけ・${file === 'special' ? '札の左右の端に乗る' : '札の左の余白で、札の中は変わらない'}`, rows);
			}
			assert(r.sizes.every((s) => s && s[0] * s[1] <= 16777216), `T222(3) ${N} 親Aセット・親Bセットの結合画像（3列・2列）`, r.sizes);
			if (file === 'special') assert(r.crop.length === 6 && r.crop.every((c) => c.ok && c.span && c.span.left >= c.L && c.span.right <= c.R), `T222(3) ${N} 3列は左右を削っても枠が範囲の内側`, r.crop);
			if (file === 'exam') assert(r.shoes.every((q, i) => same(q.cards.map((c, j) => (c.left > 20 ? j : -1)).filter((j) => j >= 0), r.hits[i]) && q.cards.every((c) => c.inside === 0) && q.outside === 0 && q.res.suppressed === null && q.res.placed === q.res.wanted), `T222(3) ${N} 蹄鉄は検出した札の左の余白に1つずつ`, r.shoes.map((q) => ({ res: q.res, outside: q.outside, left: q.cards.map((c) => c.left), inside: q.cards.map((c) => c.inside) })));
			assert(r.frag.left === 0 && r.frag.changed === 0 && r.frag.places.length === 1, `T222(3) ${N} 結合の画は札の間の右端の短い線を白で消し、札の中は変えない`, r.frag);
			assert(unexpected(sp.errors).length === 0, `T222(3) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T222(4) ${N} 一覧の最後まで写っていない人にだけ、今の知らせを出す（決定 938）`, async () => {
			const sp = await open(file, '?factorlist=1');
			const text = await sp.page.evaluate(() => ({ A1: videoText('video.warn.partial', { 人: PERSON_LABELS[2] }), B1: videoText('video.warn.partial', { 人: PERSON_LABELS[4] }) }));
			const full = await importSix(sp.page, BOTH);
			assert(full.result && full.result.ok && same(full.notes, [[], []]), `T222(4) ${N} 6人とも最後まで写っていれば出さない`, full);
			// 2人目のタブは、祖B1 の頭が一覧の上のほうに来た所で止める（祖B1 は途中まで）
			const mid = await importSix(sp.page, Object.assign({}, BOTH, { stop2: [1, 0.3] }));
			assert(mid.result && mid.result.ok && mid.cards[4] > 3 && mid.cards[4] < 14 && mid.cards[5] === 0 && same(mid.notes, [[], [text.B1]]), `T222(4) ${N} 途中までの人（祖B1）にだけ出し、全部写った親Aセットには出さない`, mid);
			// 1人目のタブは、3人目（祖A2）の一覧の途中で止める（3人目も見る）
			const third = await importSix(sp.page, { tab1: [[1, 14], [2, 9], [3, 20]], tab2: BOTH.tab2, stop1: [2, 0.2] });
			assert(third.result && third.result.ok && third.cards[2] > 3 && third.cards[2] < 20 && same(third.notes, [[text.A1], []]), `T222(4) ${N} 3人目が途中までなら、その人に出す`, third);
			// 次の人の頭が下に見えただけ（その人は入れない）なら、前の人は写り切っている。短いタブが終わりまで写っていれば出さない
			const peek = await importSix(sp.page, { tab1: BOTH.tab1, tab2: [[6, 7]], stop1: [1, 0.82] });
			assert(peek.result && peek.result.ok && same(peek.cards, [14, 0, 0, 7, 0, 0]) && same(peek.notes, [[], []]), `T222(4) ${N} 次の人の頭が見えただけ・短いタブが終わりまで写った場合は出さない`, peek);
			assert(unexpected(sp.errors).length === 0, `T222(4) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block(`T222(5) ${N} 隠しの入口: 印の無い URL は今のまま（結合画像がバイトまで同じ）・?factorlist=1 だけ因子一覧が働き、保存しない`, async () => {
			const look = (page) => page.evaluate(() => {
				const header = document.querySelector('.site-header, .exam-header'), h = header.getBoundingClientRect(), m = document.getElementById('factorlist-trial-mark'), r = m ? m.getBoundingClientRect() : null;
				// 印の文と重なる帯のボタン（見えているもの）
				const over = r ? Array.from(header.querySelectorAll('button')).filter((b) => { const q = b.getBoundingClientRect(); return q.width && getComputedStyle(b).visibility !== 'hidden' && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; }).map((b) => b.id || b.textContent.trim()) : [];
				return { enabled: UmaFactorList.ENABLED, trial: UmaFactorList.TRIAL, mark: m ? m.textContent : null, inView: !!r && r.width > 0 && r.right <= document.documentElement.clientWidth && r.top >= 0 && r.bottom <= h.bottom + 0.5, over,
					headerH: Math.round(h.height), headerW: Math.round(h.width), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
					text: document.body.innerText.includes('因子一覧テスト中'), howto: document.querySelector('.video-howto-box').textContent.includes('因子一覧'),
					keys: Object.keys(localStorage).filter((k) => /factor/i.test(k) && !/scenario|factors/i.test(k)) };
			});
			const states = {};
			for (const [key, query] of [['none', ''], ['zero', '?factorlist=0'], ['other', '?factorlist'], ['on', '?factorlist=1']]) {
				const sp = await open(file, query);
				states[key] = await look(sp.page);
				const r = await runImport(sp.page, 'inherit3');
				states[key].png = r.png && { sha: r.png.sha, bytes: r.png.bytes };
				if (key === 'none' || key === 'on') {
					const one = await runImport(sp.page, 'list1');
					states[key].list1 = { ok: one.result && one.result.ok, toasts: one.toasts, factor: one.factorLogs.length, files: one.files };
				}
				if (key === 'on') {
					const six = await importSix(sp.page, BOTH);
					states[key].six = { ok: six.result && six.result.ok, cards: six.cards, toasts: six.toasts };
					await reloadReady(sp.page);
					states[key].reload = await sp.page.evaluate(() => [UmaFactorList.ENABLED, !!document.getElementById('factorlist-trial-mark'), location.search]);
					await sp.page.goto(base + '/' + file + '.html');
					await sp.page.waitForFunction(() => !!window.UmaFactorList);
					states[key].after = await sp.page.evaluate(() => [UmaFactorList.ENABLED, UmaFactorList.TRIAL, !!document.getElementById('factorlist-trial-mark')]);
				}
				states[key].errors = unexpected(sp.errors).slice(0, 3);
				await sp.ctx.close();
			}
			const off = ['none', 'zero', 'other'].map((k) => states[k]);
			assert(off.every((s) => s.enabled === false && s.trial === false && s.mark === null && !s.text && !s.howto), `T222(5) ${N} 印の無い URL（?factorlist=0・値なしも）は因子一覧が無いときと同じ（印の文・撮り方の行が無い）`, off);
			assert(off.every((s) => s.png && s.png.sha === BASELINE[file].sha && s.png.bytes === BASELINE[file].bytes), `T222(5) ${N} 印の無い URL の結合画像は直す前の製品とバイトまで同じ`, { now: off.map((s) => s.png), was: BASELINE[file] });
			assert(states.none.list1.ok === false && states.none.list1.factor === 0, `T222(5) ${N} 印の無い URL は因子一覧の動画を見分けない`, states.none.list1);
			const on = states.on;
			assert(on.enabled === true && on.trial === true && on.mark === '因子一覧テスト中' && on.inView && on.howto, `T222(5) ${N} ?factorlist=1 は因子一覧が働き、印の文が見える`, on);
			assert(on.over.length === 0 && on.headerH >= states.none.headerH && on.headerH - states.none.headerH <= 16 && on.headerW === states.none.headerW && on.overflow <= 0, `T222(5) ${N} 印の文は上の帯の中でボタンに重ならず、帯は1行ぶんまでしか高くならず、横にはみ出さない`, [on.over, on.headerH, states.none.headerH, on.overflow]);
			assert(on.png && on.png.sha === BASELINE[file].sha, `T222(5) ${N} 印があっても、今の因子画面の結合画像は同じ`, on.png);
			assert(on.list1.ok === true && on.list1.toasts.includes('親Aセットの親を取得しました') && on.six.ok === true && same(on.six.cards, [14, 9, 11, 10, 14, 8]), `T222(5) ${N} ?factorlist=1 は1人分と6人分を取り込める`, [on.list1, on.six]);
			assert(on.keys.length === 0 && same(on.reload, [true, true, '?factorlist=1']) && same(on.after, [false, false, false]), `T222(5) ${N} 保存しない（印を外した URL で開き直せば今のまま）`, { keys: on.keys, reload: on.reload, after: on.after });
			assert(Object.values(states).every((s) => s.errors.length === 0), `T222(5) ${N} 想定の外のコンソールのエラーなし`, Object.values(states).map((s) => s.errors));
		});
	}
}
