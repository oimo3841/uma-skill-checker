// T188（2026-11-16・決定 772〜793）・T189（2026-11-17・決定 794〜804）: 本育成結果（③／②の3つ目のタブ・js/skill-result.js）と、動画の1〜3人・「入れる人」の検査。
// run-smoke.mjs の末尾から register180() で呼ばれる（塊の見出しはすべて「T188」で始まる。`npm run test:visual -- --only=T188` で回せる）。
//
//  (1) 本育成結果（UmaStar・UmaExam）: タブ・関係のない部品を隠す・persons に混ざらない（OCR・タブの枚数・処理のボタン）・結合（凍結の stitchOnePerson）＋上の欄・
//      つまみを消す・色で数えるスキルの数・1枚だけ・サムネイル 336px と URL の手放し・保存と共有は別のボタン。
//      T189（決定 794・803・804）: タブの中の「結合画像の設定」（1列｜2列・スキルの数）。
//      試しの切り替え（案1・案3・数の表示の置き場所）が無いこと・画面の欄に数を出さないこと・続けて押しても最後の設定の画像が出ること。
//      T191（2026-11-17・決定 806〜820）: 「スキル・継承・育成情報」の行を入れない。2列は上段を左右に分ける（左 帯と顔の欄・右 「スピード〜賢さ」と適性。
//      数ありは右の適性の下にスキル情報の欄・数なしは同じ並びで空ける）。1列・数ありは適性の下にスキル情報の欄。欄の左右の端は「スピード〜賢さ」の欄にそろえる。
//      欄の文・字の大きさの3段・上下の真ん中・間隔・縁と影の色。設定をページごとに覚える（読めないときは既定）。
//      T192（2026-11-17・決定 822・823）: 欄の「（」と固有の四角の間はほかの間と同じ・項目と項目の間だけを見本の比（37÷14.25）で広げる。
//      画像は作り物のスキル画面（SKILL_SYNTH。ゲームの画面は使わない）。
//  (2) 動画の1〜3人（UmaStar・UmaExam）: blocks-80 の作り物の動画（SYNTH）を途中で切る。1人・2人・途中までの人・1枚だけの人・3人・0人／4人以上の止め・進み具合の段。
//      UmaStar の3列は1人・2人で幅を人数ぶんに詰める（790）。
//  (3) 入れる人（3人｜親と祖1｜親だけ）: 取り込み直さずに「画像を更新」で結合だけ作り直す・画像の無い人の組は押せない・OCR は全員を読む（793）・静止画にも効く。
// OCR そのもの（Tesseract）は回さない（作り物にする・processPersonImages を差し替える）。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH } from './blocks-80.mjs';
import { pickVideo } from './lib/video-entry.mjs';

const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** ページの読み込みの前に入れる。window.__dev の値を navigator に見せ、share の呼ばれ方を残す（blocks-179 と同じ） */
function FAKE_NAVIGATOR() {
	window.__dev = {};
	window.__shareCalls = [];
	const def = (k, get) => Object.defineProperty(navigator, k, { configurable: true, get });
	const realUa = navigator.userAgent, realPlatform = navigator.platform, realTouch = navigator.maxTouchPoints;
	def('userAgent', () => window.__dev.ua || realUa);
	def('platform', () => window.__dev.platform || realPlatform);
	def('maxTouchPoints', () => (window.__dev.touch === undefined ? realTouch : window.__dev.touch));
	def('canShare', () => () => true);
	def('share', () => (data) => { window.__shareCalls.push(data); return Promise.resolve(); });
}
const TESS_STUB = `window.Tesseract = { createWorker: async function () { return {
	loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, terminate: async () => {},
	recognize: async () => ({ data: { text: '', lines: [] } }) }; } };`;

/** 作り物のスキル画面（本育成の「ウマ娘詳細」のスキルタブのまね）。上から順にスクロールした n 枚の PNG の File を返す。
 *  一覧は2列のパネル（行の高さ ROW・間 GAP は明るい地 242）。種類は白（藤色）・金（黄→橙）・進化（ピンク）・固有（水色→ピンク）。右端に灰色のスクロールのつまみ。
 *  正しい数は window.__skillTruth（全部・固有・進化・金・白） */
const SKILL_SYNTH = String.raw`
window.__skillSynth = (function () {
	// 描くのは 600×1300 の座標で、画は2倍（1200×2600。凍結の stitch.js は小さい画を「ゲーム画面が小さく写っている」で止めるので、スマホと同じくらいにする）
	const W = 600, H = 1300, LIST_T = 450, LIST_B = 1100, WIN = LIST_B - LIST_T, ROW = 62, GAP = 16, PADX = 20, S = 2;
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	// 帯の両端の色。パネルの左寄り（28〜45%）・右寄り（72〜92%）の平均が、本物の素材で測った色（js/skill-result.js の classifyPanel の注）になるように逆算した
	const KIND = { white: [[246, 239, 233], [191, 191, 222]], gold: [[234, 245, 253], [255, 194, 40]], evo: [[235, 243, 222], [255, 157, 220]], unique: [[169, 252, 229], [250, 179, 251]] };
	function build(rows, seed) {
		const kinds = [];
		for (let i = 0; i < rows * 2 - 1; i++) kinds.push(i === 0 ? 'unique' : i === 5 ? 'evo' : (i % 7 === 3 ? 'gold' : 'white'));
		const docH = GAP + rows * (ROW + GAP);
		const doc = document.createElement('canvas'); doc.width = W * S; doc.height = docH * S;
		const d = doc.getContext('2d');
		d.scale(S, S);
		d.fillStyle = 'rgb(242,242,242)'; d.fillRect(0, 0, W, docH);
		const r = rng(seed || 11);
		const cw = Math.floor((W - PADX - 40 - 14) / 2);   // 右のパネルは x=560 まで（その右につまみの溝）
		kinds.forEach((k, i) => {
			const row = Math.floor(i / 2), col = i % 2;
			const x = PADX + col * (cw + 14), y = GAP + row * (ROW + GAP);
			const g = d.createLinearGradient(x, 0, x + cw, 0);
			g.addColorStop(0, 'rgb(' + KIND[k][0].join(',') + ')'); g.addColorStop(1, 'rgb(' + KIND[k][1].join(',') + ')');
			d.fillStyle = g; d.fillRect(x, y, cw, ROW);
			d.fillStyle = 'rgb(150,140,170)'; d.fillRect(x, y + ROW - 3, cw, 3);
			// アイコンと名前（暗い字のまね。行ごとに違う形）
			d.fillStyle = 'rgb(240,140,40)'; d.fillRect(x + 8, y + 12, 36, 36);
			d.fillStyle = 'rgb(70,45,30)';
			for (let c = 0; c < 4 + Math.floor(r() * 5); c++) d.fillRect(x + 56 + c * 22, y + 22 + Math.floor(r() * 6), 16, 16);
		});
		const truth = { all: kinds.length, unique: 0, evo: 0, gold: 0, white: 0 };
		kinds.forEach((k) => truth[k]++);
		return { doc, docH, truth };
	}
	// 上の欄（T191）: 「ウマ娘詳細」の帯（100〜150）・顔の欄（150〜260）・地・「スピード〜賢さ」の欄（270〜318。緑の枠・x 20〜580）・地・
	// 適性の札3行（328〜375）・地・「スキル・継承・育成情報」の行（405〜441）。座標は 600×1300（画は2倍）。「スピード〜賢さ」の欄は x 40〜560
	function head(x) {
		x.fillStyle = 'rgb(120,170,220)'; x.fillRect(0, 0, W, H);
		x.fillStyle = 'rgb(90,200,40)'; x.fillRect(10, 100, W - 20, 50);           // 「ウマ娘詳細」の緑の帯
		x.fillStyle = '#fff'; x.fillRect(10, 150, W - 20, LIST_B + 160 - 150);      // 小窓の地
		x.fillStyle = 'rgb(200,215,230)'; x.fillRect(10, 150, W - 20, 110);        // 顔の欄の背景
		const r = rng(3);
		for (let k = 0; k < 30; k++) { x.fillStyle = 'rgb(' + Math.floor(80 + r() * 150) + ',' + Math.floor(60 + r() * 150) + ',' + Math.floor(40 + r() * 150) + ')'; x.fillRect(20 + Math.floor(r() * 520), 160 + Math.floor(r() * 60), 20 + Math.floor(r() * 50), 10 + Math.floor(r() * 30)); }
		// 「スピード〜賢さ」の欄: 緑の見出しの行と枠、中は白
		x.fillStyle = 'rgb(90,200,40)'; x.fillRect(40, 270, 520, 48);   // 左右の端は小窓の端から 30 内側（スキル情報の欄の既定の端と見分けるため）
		x.fillStyle = '#fff'; x.fillRect(42, 282, 516, 34);
		x.fillStyle = 'rgb(70,45,30)'; for (let c = 0; c < 5; c++) x.fillRect(40 + c * 110, 290, 60, 18);
		// 適性の札（3行・左に見出し）
		for (let row = 0; row < 3; row++) {
			const y = 328 + row * 17;
			x.fillStyle = 'rgb(110,70,40)'; x.fillRect(30, y + 2, 60, 9);
			for (let c = 0; c < (row === 0 ? 2 : 4); c++) { x.fillStyle = 'rgb(225,205,185)'; x.fillRect(110 + c * 116, y, 104, 13); x.fillStyle = '#fff'; x.fillRect(112 + c * 116, y + 2, 100, 9); x.fillStyle = 'rgb(240,120,40)'; x.fillRect(196 + c * 116, y + 2, 10, 9); }
		}
		x.fillStyle = 'rgb(90,200,40)'; x.fillRect(16, 405, Math.round((W - 32) * 0.32), 36);   // タブ「スキル」（幅の 32%）
		x.fillStyle = 'rgb(225,225,225)'; x.fillRect(16 + Math.round((W - 32) * 0.32), 405, Math.round((W - 32) * 0.68), 36);
		x.fillStyle = 'rgb(170,150,120)'; x.fillRect(200, LIST_B + 50, 200, 60);   // 「閉じる」
	}
	async function make(n, rows, seed) {   // seed: 名前の字の形の乱数（違う値にすると一覧の中身が違う画になる。T191）
		const b = build(rows, seed);
		const maxS = b.docH - WIN;
		const files = [];
		for (let i = 0; i < n; i++) {
			const s = n === 1 ? 0 : Math.round(maxS * i / (n - 1));
			const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
			const x = c.getContext('2d');
			x.scale(S, S);
			head(x);
			x.setTransform(1, 0, 0, 1, 0, 0);
			x.drawImage(b.doc, 0, s * S, W * S, WIN * S, 0, LIST_T * S, W * S, WIN * S);   // 一覧は等倍で写す
			x.setTransform(S, 0, 0, S, 0, 0);
			// スクロールのつまみ（溝 215・つまみ 120）
			x.fillStyle = 'rgb(215,215,215)'; x.fillRect(568, LIST_T, 8, WIN);
			const th = Math.round(WIN * WIN / b.docH), ty = LIST_T + Math.round((WIN - th) * (maxS ? s / maxS : 0));
			x.fillStyle = 'rgb(120,120,135)'; x.fillRect(568, ty, 8, th);
			const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
			files.push(new File([blob], 'skill-' + (i + 1) + '.png', { type: 'image/png' }));
		}
		window.__skillTruth = b.truth;
		return files;
	}
	// T193: スクロールしながら撮った動画のまね（UmaVideoFrames.canvasSource の形。blocks-182）。keys … [[時刻, 一覧のずれ（600×1300 の座標）], …] を直線でつなぐ。
	// ずれが負のときは一覧を下へ引っぱりすぎた所（一覧の上に地 242 が空く。録画の先頭で一覧が跳ね返る所のまね）。
	// keys を省くと: 0〜1秒は -60 で止まる → 1.3秒で 0 → 止まる → 500 ずつ止まりながら一番下まで（-60 と 0 の両方のコマが選ばれるよう、1回のずれを帯の 77% にする）。
	// over … 引っぱりすぎの量（既定 60。0 なら引っぱらない）。window.__skillTruth に正しい数
	function video(rows, seed, keys, over) {
		const b = build(rows, seed);
		const maxS = b.docH - WIN;
		const o = over == null ? 60 : over;
		const K = keys || (() => { const k = [[0, -o], [1, -o], [1.3, 0], [2.3, 0]]; let t = 2.3, s = 0; while (s < maxS) { s = Math.min(maxS, s + 500); k.push([t + 0.7, s], [t + 1.7, s]); t += 1.7; } return k; })();
		const at = (t) => { if (t <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [t0, s0] = K[i - 1], [t1, s1] = K[i]; return s0 + (s1 - s0) * (t - t0) / (t1 - t0); } return K[K.length - 1][1]; };
		const full = document.createElement('canvas'); full.width = W * S; full.height = H * S;
		const fx = full.getContext('2d');
		window.__skillTruth = b.truth;
		return UmaVideoFrames.canvasSource({ kind: 'canvas:skill', width: W * S, height: H * S, duration: K[K.length - 1][0], exact: true,
			draw(t, ctx, dw, dh) {
				const s = Math.round(at(t) * S);
				fx.setTransform(S, 0, 0, S, 0, 0);
				head(fx);
				fx.setTransform(1, 0, 0, 1, 0, 0);
				fx.fillStyle = 'rgb(242,242,242)'; fx.fillRect(0, LIST_T * S, W * S, WIN * S);
				const sy = Math.max(0, s), oy = Math.max(0, -s), h = Math.min(WIN * S - oy, b.doc.height - sy);
				if (h > 0) fx.drawImage(b.doc, 0, sy, W * S, h, 0, LIST_T * S + oy, W * S, h);
				fx.setTransform(S, 0, 0, S, 0, 0);
				fx.fillStyle = 'rgb(215,215,215)'; fx.fillRect(568, LIST_T, 8, WIN);
				const th = Math.round(WIN * WIN / b.docH), ty = LIST_T + Math.round((WIN - th) * Math.max(0, Math.min(1, at(t) / maxS)));
				fx.fillStyle = 'rgb(120,120,135)'; fx.fillRect(568, ty, 8, th);
				fx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.drawImage(full, 0, 0, dw, dh);
			} });
	}
	return { make, video, W, H };
})();
`;
export { SKILL_SYNTH, TESS_STUB, STUB_OCR };

/** OCR を回さない（blocks-179 と同じ差し替え）。processPersonImages の呼ばれた回数と、結合に渡った canvas を控える */
function STUB_OCR() {
	window.__ocrCalls = 0;
	processPersonImages = async (worker, files) => { window.__ocrCalls++; return { lines: [], skipped: [], warned: [], geometry: files.map(() => null) }; };
	if (typeof readMelopTopRow === 'function') readMelopTopRow = async () => ({ found: false, extraLines: [] });
	// UmaStar は照合するスキルが無いと OCR を始めない。1つだけ入れる（読みは空なので何も当たらない）
	if (skillList.length === 0) { skillList = ['右回り○']; skillOnlyList = skillList.slice(); skillIndex = skillList.map((raw) => ({ raw: raw, norm: normalizeText(raw) })); }
	// UmaStar の新UI は OCR の始めに②の選択から照合のスキルを作り直す（選択が空だと OCR しない）。作り直さないようにする
	if (typeof onDeckScopeSelected === 'function') onDeckScopeSelected = function () {};
}

export async function register180(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));

	// file: 'special'（新UI の利用者の保存データ）か 'exam'
	const open = async (file, { w = 390, h = 844, mode = 'shot', fakeNav = false } = {}) => {
		const sp = await openPage(browser, base, file + '.html', { width: w, height: h }, file === 'special' ? USER_DATA : EMPTY);
		if (fakeNav) await sp.page.addInitScript(FAKE_NAVIGATOR);
		await sp.page.evaluate(({ mode, file }) => {
			localStorage.setItem(file === 'special' ? 'uma-special-upload-mode' : 'uma-exam-upload-mode', mode);
			if (file === 'exam') localStorage.setItem('uma-exam-last-step', '2');
		}, { mode, file });
		await sp.page.route('**/tesseract.js/4.0.2/tesseract.min.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: TESS_STUB }));
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok').catch(() => {});
		await sp.page.evaluate(() => { selectStepTab(2); window.scrollTo(0, 0); });
		await sp.page.addScriptTag({ content: SKILL_SYNTH });
		return sp;
	};
	const alive = (page, url) => page.evaluate(async (u) => { try { await (await fetch(u)).arrayBuffer(); return true; } catch (e) { return false; } }, url);
	const waitBuilt = (page, prevUrl) => page.waitForFunction((prev) => { const p = UmaSkillResult.peek(); const im = document.querySelector('.sr-img'); return p.built && p.url && p.url !== prev && im && im.getAttribute('src') === p.url && im.complete && im.naturalWidth > 0; }, prevUrl || null, { timeout: 60000 });
	const imgSize = (page) => page.evaluate(() => { const im = document.querySelector('.sr-img'); return { w: im.naturalWidth, h: im.naturalHeight, src: im.getAttribute('src') }; });

	for (const file of ['special', 'exam']) {
		const NAME = file === 'special' ? 'UmaStar' : 'UmaExam';
		await block('T188(1) ' + NAME + ' の本育成結果: タブ・関係のない部品を隠す・persons に混ざらない（OCR・処理のボタン）・結合＋上の欄・つまみを消す・色で数える数・T189 の結合画像の設定（1列｜2列・スキルの数）・T191 の上段の分け方とスキル情報の欄・設定を覚える・1枚だけ・サムネイル 336px・保存は別のボタン', async () => {
			const sp = await open(file, { w: 390, h: 844, fakeNav: true });
			const { page, errors } = sp;
			const tabs = await page.evaluate(() => [...document.querySelectorAll('#personset-tabs .uma-subtab')].map((b) => b.textContent.trim()));
			assert(tabs.length === 3 && /本育成結果/.test(tabs[2]), 'T188(1) ' + NAME + ' タブの行に3つ目「本育成結果」', tabs);
			await page.click('#personset-tabs [data-tab-id="skill"]');
			const hid = await page.evaluate((file) => {
				const vis = (id) => { const el = document.getElementById(id); return !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'); };
				return { wrap: vis('skillres-wrap'), setA: vis('personset-A-wrap'), bar: vis('upload-bar'), settings: vis(file === 'special' ? 'stitch-parts-panel' : 'stitch-show-panel'), mode: getComputedStyle(document.getElementById('upload-mode')).visibility, note: vis('stitch-set-note'), adv: vis('adv-opts') };
			}, file);
			// T193: 本育成結果にも動画の入口ができたので「静止画｜動画」は見せる（前は隠していた）
			assert(hid.wrap && !hid.setA && !hid.bar && !hid.settings && hid.mode === 'visible' && !hid.note && !hid.adv, 'T188(1) ' + NAME + ' 本育成結果を選ぶと欄が出て、OCR のボタンの欄・結合画像の設定・注記・「!」は隠れる（静止画｜動画は T193 から見せる）', hid);
			// 画像を選ぶ（作り物の4枚）
			await page.evaluate(async () => { UmaSkillResult.addFiles(await __skillSynth.make(4, 14)); });
			await page.waitForFunction(() => [...document.querySelectorAll('.sr-thumb img')].length === 4 && [...document.querySelectorAll('.sr-thumb img')].every((im) => im.getAttribute('src') && im.complete && im.naturalWidth > 0), null, { timeout: 30000 });
			const th = await page.evaluate(() => [...document.querySelectorAll('.sr-thumb img')].map((im) => ({ src: im.getAttribute('src'), nw: im.naturalWidth })));
			assert(th.every((t) => t.src.startsWith('blob:') && t.nw === 336), 'T188(1) ' + NAME + ' サムネイルは幅 336px の縮小画像（blob の URL）', th);
			const mix = await page.evaluate(() => ({ persons: persons.map((p) => p.files.length).join(','), tab: document.querySelector('#personset-tabs [data-tab-id="skill"]').textContent.trim(),
				ocrBtn: (document.getElementById('process-stitch-btn') || {}).disabled }));
			assert(mix.persons === '0,0,0,0,0,0' && mix.tab === '本育成結果' && mix.ocrBtn === true, 'T188(1) ' + NAME + ' 本育成結果の画像は persons（親A〜祖B2）に入らない・タブに枚数は出さない（T212-H1）・OCR のボタンは押せないまま', mix);
			await page.evaluate(STUB_OCR);
			await page.evaluate(() => document.querySelector('[data-sr-act="build"]').click());
			await waitBuilt(page);
			const r1 = await page.evaluate(() => Object.assign({ truth: window.__skillTruth, ocr: window.__ocrCalls, persons: persons.map((p) => p.files.length).join(','), dl: document.querySelector('[data-sr-dl]') && document.querySelector('[data-sr-dl]').getAttribute('href') }, UmaSkillResult.peek()));
			const s1 = await imgSize(page);
			assert(r1.url && r1.url.startsWith('blob:') && s1.src === r1.url && r1.dl === r1.url, 'T188(1) ' + NAME + ' 結合画像は Blob の URL・保存のリンクも同じ URL', { url: r1.url, dl: r1.dl });
			assert(r1.ocr === 0 && r1.persons === '0,0,0,0,0,0', 'T188(1) ' + NAME + ' まとめても OCR は回らない・persons は空のまま', { ocr: r1.ocr, persons: r1.persons });
			assert(r1.sr && r1.sr.headH > 400 && r1.sr.band && r1.sr.band.top === 200 && s1.w === 1160, 'T188(1) ' + NAME + ' 上の欄（緑の帯〜タブ）を1枚目から足し、左右は小窓の端（幅 1160）で切る', { sr: r1.sr, w: s1.w });
			assert(r1.sr && Array.isArray(r1.sr.thumb), 'T188(1) ' + NAME + ' 右のスクロールのつまみの列を見つけて塗った', r1.sr && r1.sr.thumb);
			const c = r1.counts || {};
			assert(c.all === r1.truth.all && c.unique === r1.truth.unique && c.evo === r1.truth.evo && c.gold === r1.truth.gold && c.white === r1.truth.white, 'T188(1) ' + NAME + ' 色で数えたスキルの数が正しい（全部・固有・進化・金・白）', { counts: { all: c.all, unique: c.unique, evo: c.evo, gold: c.gold, white: c.white }, truth: r1.truth });
			// T189（決定 794・803・804）: タブの中の「結合画像の設定」（1列｜2列・スキルの数）。試しの切り替え（案1・案3・数の表示の置き場所）は無い。既定は 1列・数を入れない
			const ui = await page.evaluate(() => {
				const box = document.querySelector('[data-sr-settings]');
				const vis = (el) => !!(el && el.getClientRects().length);
				return { box: vis(box), title: box && (box.querySelector('.sr-show-title') || {}).textContent, cols: box ? [...box.querySelectorAll('[data-sr-cols]')].map((b) => b.textContent.trim() + ':' + b.getAttribute('aria-pressed')) : [],
					count: !!(box && box.querySelector('input[type="checkbox"][data-sr-opt="count"]')), checked: !!(box && box.querySelector('[data-sr-opt="count"]').checked),
					trials: document.querySelectorAll('[data-sr-variant],[data-sr-info],[data-sr-count]').length, hasStitchCls: !!(box && box.closest('[data-stitch-show-panel]')) };
			});
			assert(ui.box && /結合画像の設定/.test(ui.title || '') && ui.cols.join(',') === '1列:true,2列:false' && ui.count && !ui.checked && ui.trials === 0 && !ui.hasStitchCls,
				'T189 ' + NAME + ' 本育成結果のタブの中に「結合画像の設定」（1列｜2列・スキルの数）。既定は 1列・数を入れない・試しの切り替えは無い', ui);
			const setForm = async (cols, count) => {
				const prev = (await imgSize(page)).src;
				const now = await page.evaluate(() => UmaSkillResult.peek());
				if (now.cols !== cols) await page.evaluate((c) => document.querySelector('[data-sr-cols="' + c + '"]').click(), cols);
				if (now.withCount !== count) await page.evaluate(() => document.querySelector('[data-sr-opt="count"]').click());
				await waitBuilt(page, prev);
				await page.waitForFunction(({ cols, count }) => { const p = UmaSkillResult.peek(); const im = document.querySelector('.sr-img');
					return p.sr && p.sr.cols === cols && p.sr.info === count && im && im.getAttribute('src') === p.url && im.complete && im.naturalWidth > 0; }, { cols, count }, { timeout: 60000 });
				const s = await imgSize(page);
				const p = await page.evaluate(() => UmaSkillResult.peek());
				return { w: s.w, h: s.h, src: s.src, sr: p.sr, pressed: await page.evaluate(() => [...document.querySelectorAll('[data-sr-cols]')].map((b) => b.getAttribute('aria-pressed')).join(',') + '|' + document.querySelector('[data-sr-opt="count"]').checked) };
			};
			// 画素を調べる（検査用）: 結合画像の中の
			//   tabRows … 「スキル・継承・育成情報」の行（左寄り 10% が緑・60% が灰色 225 の行）の数（列の左端 cols ごと）
			//   card    … 矩形 r の中の茶色の字（#794016 に近い）の画素の数と、字の上下の真ん中・縁・影・中の色
			const scan = (src, cols, r) => page.evaluate(async ({ src, cols, r, w }) => {
				const im = new Image(); im.src = src; await im.decode();
				const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
				const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
				const d = x.getImageData(0, 0, c.width, c.height).data, W = c.width;
				const at = (a, b) => { const i = (Math.round(b) * W + Math.round(a)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
				let tabRows = 0;
				for (const cx of cols) for (let y = 0; y < c.height; y++) {
					const g = at(cx + w * 0.1, y), s = at(cx + w * 0.6, y);
					if (g[1] > 150 && g[1] > g[0] + 30 && g[1] > g[2] + 60 && Math.abs(s[0] - 225) < 8 && Math.abs(s[2] - 225) < 8) tabRows++;
				}
				let ink = 0, iy0 = Infinity, iy1 = -1;
				if (r) for (let y = Math.floor(r.y); y < r.y + r.h; y++) for (let a = Math.floor(r.x); a < r.x + r.w; a++) {
					const p = at(a, y);
					if (Math.abs(p[0] - 121) < 30 && Math.abs(p[1] - 64) < 30 && Math.abs(p[2] - 22) < 30) { ink++; iy0 = Math.min(iy0, y); iy1 = Math.max(iy1, y); }
				}
				return { tabRows, ink, inkMid: ink ? (iy0 + iy1 + 1) / 2 : null,
					edge: r ? at(r.x + 1, r.y + r.h / 2) : null, inside: r ? at(r.x + 12, r.y + 4) : null, shadow: r ? at(r.x + r.w / 2, r.y + r.h + 2) : null };
			}, { src, cols, r, w: s1.w });
			// 作り物の画の上の欄（SKILL_SYNTH の head。帯の上端 y=200 を 0 とした行・小窓の左端 x=20 を 0 とした列）
			const HEAD = { faceEnd: 320, statsTop: 340, aptEnd: 550, tabsTop: 610, statsL: 60, statsR: 1100 };
			const near = (a, b, e = 1) => Math.abs(a - b) <= e;
			const listH = r1.sr.listH;
			// スキル情報の欄の中身（T191・820）: 文と字の大きさの3段・上下の真ん中・間隔・「（」の空き
			const cardOk = (sr, counts) => {
				const p = sr.pieces || [], cd = sr.card;
				const text = p.map((q) => q.kind === 'sq' ? '■' + q.s : q.s).join('|');
				const want = ['スキル', counts.all, '（', '■unique', '固有', counts.unique, '■evo', '進化', counts.evo, '■gold', '金', counts.gold, '■white', '白', counts.white, '）'].join('|');
				const mid = cd.y + cd.h / 2;
				const offs = p.map((q) => Math.round(((q.top + q.bottom) / 2 - mid) * 100) / 100);
				const gaps = [];
				for (let i = 1; i < p.length; i++) gaps.push(Math.round((p[i].l - p[i - 1].r) * 100) / 100);
				// 一定の間隔（T192・822・823）: スキル→合計（0）・四角→名前（3・6・9・12）・名前→数（4・7・10・13）
				const fixed = [0, 3, 4, 6, 7, 9, 10, 12, 13].map((i) => gaps[i]);
				const nameNum = [4, 7, 10, 13].map((i) => gaps[i]);
				// 項目と項目の間（数→次の四角: 5・8・11）は見本の比（37 ÷ 14.25）で広い・「（」→固有の四角（2）はほかの間と同じ
				const item = [5, 8, 11].map((i) => gaps[i]);
				const avg = fixed.reduce((a, b) => a + b, 0) / fixed.length;
				const px = { name: p[0].px, num: p[5].px, all: p[1].px };
				const itemWide = Math.min(...item) > Math.max(...nameNum) + 1 && Math.max(...item) - Math.min(...item) <= 0.6 && Math.abs(item[0] / avg - 37 / 14.25) < 0.05;
				const parenSame = Math.abs(gaps[2] - avg) <= 1;
				return { text, want, offs, gaps, fixed, item, avg: Math.round(avg * 100) / 100, ratio: Math.round(item[0] / avg * 1000) / 1000, px, itemWide, parenSame,
					ok: text === want && offs.every((o) => Math.abs(o) <= 0.75) && Math.max(...fixed) - Math.min(...fixed) <= 0.6 && px.name < px.num && px.num < px.all && itemWide && parenSame };
			};
			const urls = [r1.url];
			// 1列・数なし（既定・T191 818）: 上の欄は帯〜適性（「スキル・継承・育成情報」の行の手前まで）・その下に一覧
			const sc1 = await scan(s1.src, [0], null);
			// 1列の画像は形を変えると URL を手放すので、あとで2列の上段と比べるために写しておく
			const s1data = await page.evaluate(async (u) => { const b = await (await fetch(u)).blob(); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }, s1.src);
			assert(r1.sr.head && r1.sr.head.ok && near(r1.sr.head.faceEnd, HEAD.faceEnd) && near(r1.sr.head.statsTop, HEAD.statsTop) && near(r1.sr.head.aptEnd, HEAD.aptEnd) && near(r1.sr.head.tabsTop, HEAD.tabsTop) &&
				near(r1.sr.head.statsL, HEAD.statsL) && near(r1.sr.head.statsR, HEAD.statsR),
				'T191 ' + NAME + ' 上の欄の区切り（帯と顔の欄・「スピード〜賢さ」の欄と左右の端・適性・「スキル・継承・育成情報」の行）を見つける', r1.sr.head);
			assert(s1.h === HEAD.tabsTop + listH && r1.sr.card === null && sc1.tabRows === 0,
				'T191 ' + NAME + ' 1列・数なし: 「スキル・継承・育成情報」の行を入れない（上の欄はその行の手前まで・画像の中にその行が無い）', { h: s1.h, want: HEAD.tabsTop + listH, tabRows: sc1.tabRows });
			// 1列・数あり（817）: 適性の下にスキル情報の欄（左右の端は「スピード〜賢さ」の欄にそろえる）・その下に一覧
			const c1n = await setForm(1, true); urls.push(c1n.src);
			const cd1 = c1n.sr.card || {};
			const sc1n = await scan(c1n.src, [0], cd1);
			const k1 = cardOk(c1n.sr, r1.counts);
			assert(c1n.w === s1.w && near(cd1.x, HEAD.statsL) && near(cd1.x + cd1.w, HEAD.statsR) && cd1.y > HEAD.aptEnd && c1n.h > cd1.y + cd1.h && c1n.h === c1n.sr.topH + listH && c1n.sr.topH < c1n.sr.headH + 1 &&
				near(cd1.h, Math.round(36 * s1.w / 745)) && sc1n.tabRows === 0 && c1n.pressed === 'true,false|true',
				'T191 ' + NAME + ' 1列・数あり: 適性の下にスキル情報の欄（左右の端は「スピード〜賢さ」の欄と同じ・高さは見本の比）・「スキル…」の行は無い', { card: cd1, h: c1n.h, topH: c1n.sr.topH, tabRows: sc1n.tabRows, pressed: c1n.pressed });
			assert(k1.ok, 'T191 ' + NAME + ' スキル情報の欄の文「スキル N（■固有 n　■進化 n　■金 n　■白 n）」・字の大きさは名前<数<合計・目に見える部分の上下の真ん中がそろう・間隔が一定（項目と項目の間だけ広い）', k1);
			assert(k1.itemWide, 'T192 ' + NAME + ' 1列: スキル情報の欄の項目と項目の間（数と次の■）が名前と数の間より広い（見本の比 37÷14.25）', { item: k1.item, gaps: k1.gaps, ratio: k1.ratio });
			assert(k1.parenSame, 'T192 ' + NAME + ' 1列: スキル情報の欄の「（」と固有の■の間がほかの間と同じ（±1px）', { paren: k1.gaps[2], avg: k1.avg });
			assert(sc1n.ink > 200 && Math.abs(sc1n.inkMid - (cd1.y + cd1.h / 2)) <= 2.5 && sc1n.inside.every((v) => v === 255) &&
				Math.abs(sc1n.edge[0] - 0xAD) < 16 && Math.abs(sc1n.edge[2] - 0xB8) < 16 && Math.abs(sc1n.shadow[0] - 0xC1) < 10 && Math.abs(sc1n.shadow[2] - 0xCC) < 10,
				'T191 ' + NAME + ' スキル情報の欄の画素: 白いカード・灰色の縁（#ADAAB8）・下の影（#C1BFCC）・茶色の字が真ん中', sc1n);
			// 2列・数なし（806・816）: 上段の左に帯と顔の欄、右に「スピード〜賢さ」と適性（隙間は空ける）。その下に一覧を半分ずつ
			const ev = await setForm(2, false); urls.push(ev.src);
			const G = ev.w - s1.w * 2;
			const evL = ev.sr.split, evR = listH - ev.sr.split;
			const rightH = HEAD.aptEnd - HEAD.faceEnd;
			const scEv = await scan(ev.src, [0, s1.w + G], { x: s1.w + G + HEAD.statsL, y: rightH, w: HEAD.statsR - HEAD.statsL, h: ev.sr.topH - rightH });
			assert(ev.sr.variant === 'split' && G > 0 && G < 40 && ev.sr.topH >= HEAD.faceEnd && ev.sr.topH > rightH && ev.h === ev.sr.topH + Math.max(evL, evR) && Math.abs(evL - evR) < 160 && ev.sr.card === null &&
				scEv.tabRows === 0 && scEv.ink === 0 && ev.pressed === 'false,true|false',
				'T191 ' + NAME + ' 2列・数なし: 上段を左右に分け（左 帯と顔の欄・右 「スピード〜賢さ」と適性）、右の適性の下は空ける・その下に一覧を半分ずつ・「スキル…」の行は無い', { w: ev.w, h: ev.h, topH: ev.sr.topH, split: ev.sr.split, evL, evR, scan: scEv });
			// 上段の画素: 左上は帯（緑）、右上は「スピード〜賢さ」の見出し（緑）。左の帯の下（顔の欄）と右の上（「スピード〜賢さ」の欄）は1列の上の欄の同じ所と同じ
			const same = await page.evaluate(async ({ a, b, pts }) => {
				const load = async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0); return x; };
				const A = await load(a), B = await load(b);
				return pts.map(([ax, ay, bx, by]) => { const p = A.getImageData(ax, ay, 1, 1).data, q = B.getImageData(bx, by, 1, 1).data; return p[0] === q[0] && p[1] === q[1] && p[2] === q[2]; });
			}, { a: s1data, b: ev.src, pts: [[300, 50, 300, 50], [500, 200, 500, 200], [300, HEAD.statsTop + 10, s1.w + G + 300, HEAD.statsTop - HEAD.faceEnd + 10], [600, HEAD.aptEnd - 10, s1.w + G + 600, HEAD.aptEnd - HEAD.faceEnd - 10]] });
			assert(same.every(Boolean), 'T191 ' + NAME + ' 2列の上段: 左は1列の上の欄の帯と顔の欄・右は「スピード〜賢さ」〜適性（同じ画素）', same);
			// 2列・数あり: 同じ並びで、右の適性の下の隙間にスキル情報の欄（左右の端は「スピード〜賢さ」の欄にそろえる）
			const sd = await setForm(2, true); urls.push(sd.src);
			const cd2 = sd.sr.card || {};
			const sc2 = await scan(sd.src, [0, s1.w + G], cd2);
			const k2 = cardOk(sd.sr, r1.counts);
			assert(sd.w === ev.w && sd.h === ev.h && sd.sr.topH === ev.sr.topH && sd.sr.split === ev.sr.split && near(cd2.x, s1.w + G + HEAD.statsL) && near(cd2.x + cd2.w, s1.w + G + HEAD.statsR) &&
				cd2.y > rightH && cd2.y + cd2.h < sd.sr.topH && sc2.tabRows === 0 && sc2.ink > 200 && Math.abs(sc2.inkMid - (cd2.y + cd2.h / 2)) <= 2.5 && k2.ok && sd.pressed === 'false,true|true',
				'T191 ' + NAME + ' 2列・数あり: 数なしと同じ並び・右の適性の下にスキル情報の欄（左右の端は「スピード〜賢さ」の欄と同じ）', { card: cd2, topH: sd.sr.topH, scan: sc2, k2 });
			assert(k2.itemWide && k2.parenSame, 'T192 ' + NAME + ' 2列: スキル情報の欄の項目と項目の間だけが広い（見本の比）・「（」と固有の■の間はほかの間と同じ（±1px）', { item: k2.item, paren: k2.gaps[2], avg: k2.avg, ratio: k2.ratio });
			const dead = await Promise.all(urls.slice(0, -1).map((u) => alive(page, u)));
			assert(dead.every((x) => x === false) && (await alive(page, urls[urls.length - 1])), 'T188(1) ' + NAME + ' 形を変えると前の結合画像の URL を手放す・今の URL は読める', dead);
			// 続けて押す（2列→数→1列）: 最後の設定の形だけが出る（前の組み直しが後から終わって古い形を出さない）
			//   最初の頼みの PNG 化（toBlob）だけを 1.5秒遅らせて、前の頼みが後から終わる形を必ず作る
			await page.evaluate(() => {
				const orig = HTMLCanvasElement.prototype.toBlob;
				let n = 0;
				HTMLCanvasElement.prototype.toBlob = function (cb, ...a) { const self = this; if (n++ === 0) setTimeout(() => orig.call(self, cb, ...a), 1500); else orig.call(self, cb, ...a); };
				window.__restoreToBlob = () => { HTMLCanvasElement.prototype.toBlob = orig; };
				document.querySelector('[data-sr-opt="count"]').click(); document.querySelector('[data-sr-cols="1"]').click(); document.querySelector('[data-sr-opt="count"]').click();
			});
			await page.waitForFunction(() => { const p = UmaSkillResult.peek(); return p.sr && p.sr.cols === 1 && p.sr.info === true; }, null, { timeout: 30000 }).catch(() => {});
			await page.waitForTimeout(3000);
			await page.evaluate(() => window.__restoreToBlob());
			const last = await page.evaluate(() => { const p = UmaSkillResult.peek(); return { cols: p.sr && p.sr.cols, info: p.sr && p.sr.info, src: document.querySelector('.sr-img').getAttribute('src') === p.url, h: document.querySelector('.sr-img').naturalHeight }; });
			assert(last.cols === 1 && last.info === true && last.src && last.h === c1n.h, 'T189 ' + NAME + ' 設定を続けて押しても、最後の設定（1列・数あり）の画像が出る', last);
			// 画面の欄の中には数を出さない（数は画像の中だけ・796）
			const panelText = await page.evaluate(() => document.querySelector('[data-sr-result]').textContent);
			assert(!/スキル \d+（/.test(panelText), 'T189 ' + NAME + ' 画面の欄の中にスキルの数の行は出さない（数は画像の中だけ）', panelText.slice(0, 80));
			urls.push(await page.evaluate(() => UmaSkillResult.peek().url));
			// 保存: iPhone は共有のシートに手元の Blob（PNG のバイトは表示と同じ）・名前は今の決まり（日付_番号）
			const shared = await page.evaluate(async () => {
				window.__dev.ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
				const a = document.querySelector('[data-sr-dl]');
				a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
				const f = (window.__shareCalls[0] || {}).files;
				const view = await (await fetch(document.querySelector('.sr-img').getAttribute('src'))).arrayBuffer();
				return { n: window.__shareCalls.length, name: f && f[0].name, size: f && f[0].size, view: view.byteLength, setDl: document.querySelectorAll('#personset-A-wrap a[download], #personset-A-wrap .video-dl-btn').length };
			});
			assert(shared.n === 1 && /^\d{6}_\d{3}.*\.png$/.test(shared.name) && shared.size === shared.view, 'T188(1) ' + NAME + ' 保存（iPhone）は共有のシートに表示と同じ PNG・名前は日付_番号', shared);
			// 1枚だけ: 選んだ画像をそのまま・2列は押せない
			await page.evaluate(() => document.querySelector('[data-sr-act="clear"]').click());
			const cleared = await Promise.all(th.map((t) => alive(page, t.src)));
			assert(cleared.every((x) => x === false) && !(await alive(page, urls[urls.length - 1])), 'T188(1) ' + NAME + ' クリアでサムネイルと結合画像の URL を手放す', cleared);
			await page.evaluate(async () => { UmaSkillResult.addFiles((await __skillSynth.make(1, 6))); });
			await page.evaluate(() => document.querySelector('[data-sr-act="build"]').click());
			await waitBuilt(page);
			const one = await page.evaluate(() => ({ w: document.querySelector('.sr-img').naturalWidth, h: document.querySelector('.sr-img').naturalHeight, c2: document.querySelector('[data-sr-cols="2"]').disabled, note: document.querySelector('.sr-note') && document.querySelector('.sr-note').textContent }));
			assert(one.w === 1200 && one.h === 2600 && one.c2 === true && /そのまま/.test(one.note || ''), 'T188(1) ' + NAME + ' 1枚だけはそのままの画像・2列は押せない・案内の文', one);
			// 親Aセットへ戻ると、隠した部品が戻る
			await page.click('#personset-tabs [data-tab-id="0"]');
			const back = await page.evaluate(() => ({ wrap: !!document.getElementById('skillres-wrap').getClientRects().length, setA: !!document.getElementById('personset-A-wrap').getClientRects().length, bar: !document.getElementById('upload-bar').hidden, mode: getComputedStyle(document.getElementById('upload-mode')).visibility }));
			assert(!back.wrap && back.setA && back.bar && back.mode === 'visible', 'T188(1) ' + NAME + ' 親Aセットへ戻ると、③／②の部品が戻る', back);
			// 設定を覚える（T191・809）: ページごとのキー。開き直すと前の設定・読めない値や読み出しの失敗は既定（1列・数なし）
			const KEY = file === 'special' ? 'uma-special-skillres-form' : 'uma-exam-skillres-form';
			const OTHER = file === 'special' ? 'uma-exam-skillres-form' : 'uma-special-skillres-form';
			await page.click('#personset-tabs [data-tab-id="skill"]');
			await page.evaluate(() => document.querySelector('[data-sr-act="clear"]').click());
			await page.evaluate(() => document.querySelector('[data-sr-cols="2"]').click());
			const saved = await page.evaluate(({ KEY, OTHER }) => ({ v: localStorage.getItem(KEY), other: localStorage.getItem(OTHER) }), { KEY, OTHER });
			assert(saved.v === '{"cols":2,"count":true}' && saved.other === null, 'T191 ' + NAME + ' 設定（2列・数あり）をこのページのキーに覚える・もう一方のページのキーには書かない', saved);
			const reopen = async () => {
				await reloadReady(page);
				for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok').catch(() => {});
				await page.evaluate(() => selectStepTab(2));
				await page.click('#personset-tabs [data-tab-id="skill"]');
				return page.evaluate(() => { const p = UmaSkillResult.peek(); return p.cols + '/' + p.withCount + '|' + [...document.querySelectorAll('[data-sr-cols]')].map((b) => b.getAttribute('aria-pressed')).join(',') + '|' + document.querySelector('[data-sr-opt="count"]').checked; });
			};
			const kept = await reopen();
			assert(kept === '2/true|false,true|true', 'T191 ' + NAME + ' 開き直すと、覚えた設定（2列・数あり）が押された形で出る', kept);
			await page.evaluate((KEY) => localStorage.setItem(KEY, '{壊れた'), KEY);
			const broken = await reopen();
			assert(broken === '1/false|true,false|false', 'T191 ' + NAME + ' 保存の値が読めないときは既定（1列・数なし）', broken);
			await page.evaluate((KEY) => localStorage.setItem(KEY, '{"cols":2,"count":true}'), KEY);
			await page.addInitScript((KEY) => { const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { if (k === KEY) throw new Error('読めない（検査）'); return g.call(this, k); }; }, KEY);
			const thrown = await reopen();
			assert(thrown === '1/false|true,false|false', 'T191 ' + NAME + ' 保存の読み出しが失敗しても既定（1列・数なし）で開く', thrown);
			assert(jsErrors(errors).length === 0, 'T188(1) ' + NAME + ' コンソールのエラー0', jsErrors(errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	// T191（811 の案）: つなぎ目の知らせの見直し（js/skill-result.js の reviewSeamWarnings・judgeSeam）
	await block('T188(4) UmaStar 本育成結果のつなぎ目の知らせの見直し（T191 の案）: 重なりの少ない次点だけが理由の知らせは外す・位置がずれた継ぎ目と不一致率の高い継ぎ目は今までどおり知らせる', async () => {
		const sp = await open('special', { w: 390, h: 844 });
		const { page, errors } = sp;
		// (a) 判定だけ: 素材 IMG_4520〜4526 の画像4→5 と同じ形（窓 872行・結合の位置 564 で 0.72%・重なり 64行の位置 808 で 0.75%・重なり 186行の位置 686 で 2.87%）
		const judge = await page.evaluate(() => {
			const mk = (pairs) => { const r = new Float64Array(813).fill(0.2); pairs.forEach(([d, v]) => { r[d] = v; }); return r; };
			const real = UmaSkillResult.judgeSeam(mk([[564, 0.0072], [808, 0.0075], [686, 0.0287]]), 564, 872);
			const wide = UmaSkillResult.judgeSeam(mk([[564, 0.0072], [700, 0.0075]]), 564, 872);           // 重なり 172行の次点が近い → 残す
			const high = UmaSkillResult.judgeSeam(mk([[564, 0.035], [686, 0.2]]), 564, 872);               // 不一致率 3% 以上 → 残す
			const moved = UmaSkillResult.judgeSeam(mk([[564, 0.02], [400, 0.005]]), 564, 872);             // 結合の位置が最良でない → 残す
			return { real, wide, high, moved };
		});
		assert(judge.real.ok === true && judge.real.secondD === 686 && judge.wide.ok === false && judge.high.ok === false && judge.moved.ok === false,
			'T191 つなぎ目の判定: 重なり 120行未満の次点は数えない（素材の画像4→5 の形は外す）・重なりのある近い次点・不一致率 3% 以上・位置が最良でない は残す', judge);
		// (b) 作り物の画で: 正しくつながった継ぎ目に知らせが付いていたら外す。結合の位置を1行ぶん（156px）ずらした継ぎ目は残す
		const fake = await page.evaluate(async () => {
			const files = await __skillSynth.make(4, 14);
			const list = await stitchOnePerson(files, '本育成結果');
			const orig = (list._stitchWarnings || []).slice();
			const pl = list._sourcePlacements.map((p) => Object.assign({}, p));
			const msg = '本育成結果: 画像1→2の継ぎ目は一致度が低く(不一致率0.7%)、結合位置がズレている可能性があります。';
			const fakeList = (placements) => ({ _stitchWarnings: [msg], _sourcePlacements: placements });
			const good = await UmaSkillResult.reviewSeamWarnings(files, fakeList(pl));
			const moved = pl.map((p) => Object.assign({}, p));
			moved[2].srcY0 += 156; moved[2].outY0 += 0;
			const bad = await UmaSkillResult.reviewSeamWarnings(files, fakeList(moved));
			return { orig, good: { n: good.warnings.length, r: good.review[0] }, bad: { n: bad.warnings.length, r: bad.review[0] } };
		});
		assert(fake.good.n === 0 && fake.good.r.ok === true && fake.bad.n === 1 && fake.bad.r.ok === false,
			'T191 作り物の画: 正しい継ぎ目の知らせは外す・位置を1行ぶんずらした継ぎ目の知らせは残す', fake);
		// (c) 画面の流れ: 一覧の中身が違う2枚（4枚に分けた1枚目と、名前の字の形が違う一覧の2枚目）をまとめると、知らせが今までどおり出る
		await page.click('#personset-tabs [data-tab-id="skill"]');
		await page.evaluate(async () => {
			const a = (await __skillSynth.make(4, 14, 11))[0], b = (await __skillSynth.make(4, 14, 77))[1];
			UmaSkillResult.addFiles([new File([a], 'skill-a.png', { type: 'image/png' }), new File([b], 'skill-b.png', { type: 'image/png' })]);
		});
		await page.evaluate(STUB_OCR);
		await page.evaluate(() => document.querySelector('[data-sr-act="build"]').click());
		await waitBuilt(page);
		const shown = await page.evaluate(() => { const p = UmaSkillResult.peek(); const w = document.querySelector('.sr-warn'); return { warnings: p.warnings.length, review: p.seamReview, text: w ? w.textContent : null }; });
		assert(shown.warnings >= 1 && shown.review.length >= 1 && shown.review.every((r) => r.ok === false) && /スキルの行がずれているかもしれません/.test(shown.text || ''),
			'T191 一覧の中身が違う2枚をまとめると、つなぎ目の知らせが今までどおり画面に出る', shown);
		assert(jsErrors(errors).length === 0, 'T188(4) コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	// 作り物の動画を切って取り込む（t=0 は切らない。'short' は親の途中で終わる軌跡）
	const importSynth = (page, t) => page.evaluate((t) => {
		const s = t === 'short' ? __synth.make({ path: 'short' }).source : __synth.make({}).source;
		const src = typeof t === 'number' && t > 0 ? UmaPcCapture.trimSource(s, 0, t) : s;
		window.__steps = [];
		const mo = new MutationObserver(() => { const el = document.querySelector('#video-progress .video-steps'); if (el) window.__steps.push(Array.from(el.children).map((li) => li.getAttribute('data-st')).join(',')); });
		mo.observe(document.body, { subtree: true, childList: true });
		videoPending = { setIdx: 0 };
		return Promise.race([onVideoChosen(src), new Promise((r) => setTimeout(() => r('timeout'), 120000))]).then((r) => { mo.disconnect(); return r; });
	}, t);
	const videoState = (page) => page.evaluate(() => {
		const im = document.querySelector('#personset-A-wrap .video-result img');
		return { n: persons.slice(0, 3).map((p) => p.files.length).join(','), video: persons.slice(0, 3).map((p) => !!p.video).join(','),
			img: im ? { w: im.naturalWidth, h: im.naturalHeight, src: im.getAttribute('src') } : null,
			partial: (document.querySelector('#personset-A-wrap .video-partial') || {}).textContent || null,
			err: (document.getElementById('video-error') || {}).textContent || null,
			lastSteps: (window.__steps || []).slice(-1)[0] || '' };
	});
	const waitImg = (page) => page.waitForFunction(() => { const im = document.querySelector('#personset-A-wrap .video-result img'); return im && im.complete && im.naturalWidth > 0; }, null, { timeout: 60000 });

	for (const file of ['special', 'exam']) {
		const NAME = file === 'special' ? 'UmaStar' : 'UmaExam';
		await block('T188(2) ' + NAME + ' の動画の1〜3人: 1枚だけの最後の人は外す・入らなかった枠は空・途中までの人は知らせる・3人は今のまま・0人／4人以上は止める・進み具合の段は人数ぶん' + (file === 'special' ? '・3列は人数ぶんの幅' : ''), async () => {
			const sp = await open(file, { w: 1280, h: 900, mode: 'video' });
			const { page, errors } = sp;
			await page.addScriptTag({ content: SYNTH });
			await pickVideo(page);
			// 関数の決まり（人の数）
			const keep = await page.evaluate(() => {
				const P = (...n) => n.map((k) => ({ files: Array(k).fill(0) }));
				const f = (l) => { const r = videoPersonsToKeep(l); return r.error ? 'error:' + r.found : r.keep.map((p) => p.files.length).join('/') + (r.dropped ? ' 外した' : '') + ' partial=' + r.partial; };
				return [f(P(5, 4, 3)), f(P(5, 4, 3, 1)), f(P(5, 1)), f(P(5, 3, 1)), f(P(5, 2)), f(P(3)), f(P(5, 4, 3, 2)), f(P())];
			});
			assert(keep.join('|') === '5/4/3 partial=-1|5/4/3 外した partial=-1|5 外した partial=-1|5/3 外した partial=-1|5/2 partial=1|3 partial=0|error:4|error:0', 'T188(2) ' + NAME + ' 人の数の決まり（3人・1枚だけの最後の人を外す・途中までの人・4人以上と0人は止める）', keep);
			// 3人（切らない）: 今のまま
			let r = await importSynth(page, 0);
			await waitImg(page);
			let v = await videoState(page);
			const w3 = v.img && v.img.w;
			assert(r.ok && v.n === '5,4,3' && !v.partial && v.lastSteps === 'done,done,done,done,now', 'T188(2) ' + NAME + ' 3人の動画は今までどおり（5／4／3枚・段は5つ）', { r, v });
			if (file === 'special') assert(w3 === await page.evaluate(() => STITCH_LAYOUT.minW), 'T188(2) UmaStar 3人の3列の幅は今のまま（STITCH_LAYOUT.minW）', w3);
			// 1人（親＋次の人の頭1枚 → 親だけ）
			r = await importSynth(page, 5.0);
			await waitImg(page);
			v = await videoState(page);
			assert(r.ok && v.n === '5,0,0' && v.video === 'true,false,false' && !v.partial && v.lastSteps === 'done,done,now', 'T188(2) ' + NAME + ' 1人: 1枚だけの祖1 は外し、祖1・祖2 の枠は空・知らせは出ない・段は「読み込み・親・完了」', { r, v });
			const w1 = v.img && v.img.w;
			assert(w1 > 0 && w1 < w3 / 2, 'T188(2) ' + NAME + ' 1人の結合画像の幅は1人ぶん（3人の半分より狭い）', { w1, w3 });
			// 2人（祖2 の頭1枚を外す）
			r = await importSynth(page, 9.0);
			await waitImg(page);
			v = await videoState(page);
			assert(r.ok && v.n === '5,3,0' && !v.partial && v.lastSteps === 'done,done,done,now', 'T188(2) ' + NAME + ' 2人: 祖2 の頭1枚を外して親・祖1・段は4つ', { r, v });
			const w2 = v.img && v.img.w;
			assert(w2 > w1 && w2 < w3, 'T188(2) ' + NAME + ' 2人の幅は1人より広く3人より狭い', { w1, w2, w3 });
			// 途中までの人（祖1 が2枚で終わる）
			r = await importSynth(page, 6.5);
			await waitImg(page);
			v = await videoState(page);
			assert(r.ok && v.n === '5,2,0' && /祖A1 は一覧の最後まで写っていない/.test(v.partial || ''), 'T188(2) ' + NAME + ' 途中までの人（祖1・2枚）は入れて「最後まで写っていない」と知らせる', { r, v });
			// 親の途中で終わる（1人・途中まで）
			r = await importSynth(page, 'short');
			await waitImg(page);
			v = await videoState(page);
			assert(r.ok && v.n.split(',')[1] === '0' && /親A は一覧の最後まで写っていない/.test(v.partial || ''), 'T188(2) ' + NAME + ' 親の途中で終わる動画は親だけ入れて知らせる（前は「区切りが見つからず」で止まっていた）', { r, v });
			// 枠を変えると知らせは消える
			await page.evaluate(() => removePersonImage(0, 0));
			assert(await page.evaluate(() => videoPartial[0] === null), 'T188(2) ' + NAME + ' 途中までの人の枠を変えると知らせの印を消す', null);
			// 0人・4人以上の文
			const errText = await page.evaluate(() => { showVideoError({ code: 'persons', found: 4 }); return document.getElementById('video-error').textContent; });
			assert(/4人分/.test(errText) && /1〜3人分/.test(errText) && /入っていた画像はそのまま/.test(errText), 'T188(2) ' + NAME + ' 4人以上のときの文（見つかった人数と取り込める人数）', errText);
			assert(jsErrors(errors).length === 0, 'T188(2) ' + NAME + ' コンソールのエラー0', jsErrors(errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	for (const file of ['special', 'exam']) {
		const NAME = file === 'special' ? 'UmaStar' : 'UmaExam';
		await block('T188(3) ' + NAME + ' の入れる人: 3人｜親と祖1｜親だけ・取り込み直さずに「画像を更新」で作り直す・画像の無い組は押せない・OCR は全員を読む・静止画にも効く', async () => {
			const sp = await open(file, { w: 1280, h: 900, mode: 'video' });
			const { page, errors } = sp;
			await page.addScriptTag({ content: SYNTH });
			await pickVideo(page);
			// ③／②の「結合画像の設定」の中の3つ（引き出し・右下のボタンの小窓にも同じものがある）
			const panelSel = file === 'special' ? '#stitch-parts-panel' : '#stitch-show-panel';
			const btns = () => page.evaluate((s) => [...document.querySelectorAll(s + ' [data-stitch-persons]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + (b.disabled ? '(x)' : '')).join(' '), panelSel);
			assert((await btns()) === '3人* 親と祖1 親だけ', 'T188(3) ' + NAME + ' 結合画像の設定に「入れる人」3つ（既定は3人）', await btns());
			let r = await importSynth(page, 0);
			await waitImg(page);
			const v3 = await videoState(page);
			// 親だけにして「画像を更新」
			await page.evaluate(() => setStitchPersons(1));
			assert((await btns()) === '3人 親と祖1 親だけ*', 'T188(3) ' + NAME + ' 親だけを押すと押された印が移る', await btns());
			const ready = await page.evaluate(() => { const b = document.querySelector('[data-video-refresh]'); return b && !b.disabled && b.getAttribute('data-state'); });
			assert(ready === 'ready', 'T188(3) ' + NAME + ' 入れる人を変えると②／③の「画像を更新」が押せる', ready);
			await page.evaluate(() => document.querySelector('[data-video-refresh]').click());
			const waited = await page.waitForFunction((old) => {
				const b = document.querySelector('[data-video-refresh]'), im = document.querySelector('#personset-A-wrap .video-result img');
				// 「画像を更新」の後始末（stitchInProgress・videoRefreshBusy を戻す）まで待つ。data-state は先に 'same' になる
				return b && b.getAttribute('data-state') === 'same' && im && im.getAttribute('src') !== old && im.complete && im.naturalWidth > 0 && !stitchInProgress && videoRefreshBusy === -1;
			}, v3.img.src, { timeout: 60000 }).then(() => null, () => page.evaluate(() => ({ state: (document.querySelector('[data-video-refresh]') || {}).getAttribute && document.querySelector('[data-video-refresh]').getAttribute('data-state'),
				busy: [typeof videoRefreshBusy !== 'undefined' ? videoRefreshBusy : '?', stitchInProgress], log: devGeometry.slice(-4) })));
			assert(waited === null, 'T188(3) ' + NAME + ' 「画像を更新」で作り直しが終わる', waited);
			const v1 = await videoState(page);
			assert(v1.n === '5,4,3' && v1.img.w < v3.img.w / 2, 'T188(3) ' + NAME + ' 取り込み直さずに（枠は 5／4／3 のまま）親だけの結合画像に作り直す', { before: v3.img, after: v1.img, n: v1.n });
			// OCR は全員を読む・引き出しの結合画像は親だけ
			await page.evaluate(STUB_OCR);
			const done = await page.evaluate(() => Promise.race([processImagesAndStitch().then(() => 'done', (e) => 'err ' + e.message), new Promise((r) => setTimeout(() => r('timeout'), 90000))]));
			assert(done === 'done', 'T188(3) ' + NAME + ' 「OCR処理＋画像結合」が終わる（OCR は作り物）', done);
			const drawerWait = await page.waitForFunction(() => document.querySelectorAll('#stitch-result-content img').length > 0 && document.querySelector('#stitch-result-content img').complete && document.querySelector('#stitch-result-content img').naturalWidth > 0, null, { timeout: 30000 })
				.then(() => null, () => page.evaluate(() => ({ imgs: [...document.querySelectorAll('#stitch-result-content img')].map((im) => [im.getAttribute('src'), im.complete, im.naturalWidth]),
					html: (document.getElementById('stitch-result-content') || {}).innerHTML ? document.getElementById('stitch-result-content').innerHTML.slice(0, 300) : null, log: devGeometry.slice(-6) })));
			assert(drawerWait === null, 'T188(3) ' + NAME + ' 引き出しに結合画像が出る', drawerWait);
			const ocr = await page.evaluate(() => ({ calls: window.__ocrCalls, drawerW: document.querySelector('#stitch-result-content img').naturalWidth }));
			assert(ocr.calls === 3, 'T188(3) ' + NAME + ' 親だけにしても OCR は3人とも読む（照合結果・Deck へ送るぶんは変わらない）', ocr);
			assert(ocr.drawerW < v3.img.w, 'T188(3) ' + NAME + ' 引き出しの結合画像は入れる人（親だけ）で作る', { drawer: ocr.drawerW, three: v3.img.w });
			// 3人に戻すと、引き出しの「画像を更新」が押せる
			await page.evaluate(() => setStitchPersons(3));
			const dr = await page.evaluate(() => { const b = document.getElementById('stitch-refresh-btn'); return b && b.getAttribute('data-state'); });
			assert(dr === 'ready', 'T188(3) ' + NAME + ' 3人に戻すと引き出しの「画像を更新」が押せる', dr);
			// 1人の動画では「3人」「親と祖1」は押せず、実際の値は親だけ
			r = await importSynth(page, 5.0);
			await waitImg(page);
			assert((await btns()) === '3人(x) 親と祖1(x) 親だけ*', 'T188(3) ' + NAME + ' 親だけの動画では「3人」「親と祖1」は押せない', await btns());
			// 静止画にも効く: 静止画の入れ方で、作り物のスキル画面を親・祖1 に入れ（画像の中身は何でもよい）、入れる人で結合の人数が変わる
			assert(jsErrors(errors).length === 0, 'T188(3) ' + NAME + ' コンソールのエラー0', jsErrors(errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	await block('T188(3) UmaStar の静止画でも入れる人が効く: 「画像を結合する（OCRしない）」の人数・3人のときの PNG は入れる人の無い作りと同じ', async () => {
		const sp = await open('special', { w: 1280, h: 900, mode: 'shot' });
		const { page, errors } = sp;
		await page.evaluate(async () => {
			const files = await __skillSynth.make(3, 10);
			addPersonFiles(0, files.slice(0, 2)); addPersonFiles(1, files.slice(1, 3)); addPersonFiles(2, files.slice(0, 2));
		});
		const build = (n) => page.evaluate(async (n) => {
			setStitchPersons(n);
			const c = await buildStitchedSetImage(0, null, false, stitchPartsNow());
			const d = c.toDataURL('image/png');
			const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(d))), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
			return { w: c.width, h: c.height, labels: c._personLabels.join(','), hex };
		}, n);
		const a3 = await build(3), a2 = await build(2), a1 = await build(1);
		assert(a3.labels === '親A,祖A1,祖A2' && a2.labels === '親A,祖A1' && a1.labels === '親A', 'T188(3) UmaStar 静止画: 入れる人で結合画像の人が変わる', { a3, a2, a1 });
		// 2人は元の大きさで並べると 2206 を超える画像なので、詰めても 2206（人は元の大きさより大きくしない）。1人は人数ぶんの幅
		assert(a1.w < a2.w && a2.w <= a3.w && a1.w < a3.w / 1.5, 'T188(3) UmaStar 静止画: 1人の3列は幅を人数ぶんに詰める（2人は画像の大きさしだい）', { a3: a3.w, a2: a2.w, a1: a1.w });
		// 入れる人の無い作り（opt.persons を持たない parts）と、3人の PNG が同じ
		const plain = await page.evaluate(async () => {
			const p = Object.assign({}, stitchPartsNow()); delete p.persons;
			const c = await buildStitchedSetImage(0, null, false, p);
			const d = c.toDataURL('image/png');
			return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(d))), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
		});
		assert(plain === a3.hex, 'T188(3) UmaStar 静止画: 3人の PNG は入れる人の無い作りと同じ', { plain, a3: a3.hex });
		assert(jsErrors(errors).length === 0, 'T188(3) UmaStar 静止画 コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});
}
