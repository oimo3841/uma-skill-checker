// T188（2026-11-16・決定 772〜793）・T189（2026-11-17・決定 794〜804）: 本育成結果（③／②の3つ目のタブ・js/skill-result.js）と、動画の1〜3人・「入れる人」の検査。
// run-smoke.mjs の末尾から register180() で呼ばれる（塊の見出しはすべて「T188」で始まる。`npm run test:visual -- --only=T188` で回せる）。
//
//  (1) 本育成結果（UmaStar・UmaExam）: タブ・関係のない部品を隠す・persons に混ざらない（OCR・タブの枚数・処理のボタン）・結合（凍結の stitchOnePerson）＋上の欄・
//      つまみを消す・色で数えるスキルの数・1枚だけ・サムネイル 336px と URL の手放し・保存と共有は別のボタン。
//      T189（決定 794・803・804）: タブの中の「結合画像の設定」（1列｜2列・スキルの数）。2列・数なしは案2、2列・数ありは案4（右上に情報の箱）、1列・数ありは帯。
//      試しの切り替え（案1・案3・数の表示の置き場所）が無いこと・画面の欄に数を出さないこと・続けて押しても最後の設定の画像が出ること。
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
	function build(rows) {
		const kinds = [];
		for (let i = 0; i < rows * 2 - 1; i++) kinds.push(i === 0 ? 'unique' : i === 5 ? 'evo' : (i % 7 === 3 ? 'gold' : 'white'));
		const docH = GAP + rows * (ROW + GAP);
		const doc = document.createElement('canvas'); doc.width = W * S; doc.height = docH * S;
		const d = doc.getContext('2d');
		d.scale(S, S);
		d.fillStyle = 'rgb(242,242,242)'; d.fillRect(0, 0, W, docH);
		const r = rng(11);
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
	function head(x) {
		x.fillStyle = 'rgb(120,170,220)'; x.fillRect(0, 0, W, H);
		x.fillStyle = 'rgb(90,200,40)'; x.fillRect(10, 100, W - 20, 50);           // 「ウマ娘詳細」の緑の帯
		x.fillStyle = '#fff'; x.fillRect(10, 150, W - 20, LIST_B + 160 - 150);      // 小窓の地
		const r = rng(3);
		for (let k = 0; k < 40; k++) { x.fillStyle = 'rgb(' + Math.floor(80 + r() * 150) + ',' + Math.floor(60 + r() * 150) + ',' + Math.floor(40 + r() * 150) + ')'; x.fillRect(20 + Math.floor(r() * 520), 160 + Math.floor(r() * 230), 20 + Math.floor(r() * 50), 10 + Math.floor(r() * 30)); }
		x.fillStyle = 'rgb(90,200,40)'; x.fillRect(16, 405, Math.round((W - 32) * 0.32), 36);   // タブ「スキル」（幅の 32%）
		x.fillStyle = 'rgb(225,225,225)'; x.fillRect(16 + Math.round((W - 32) * 0.32), 405, Math.round((W - 32) * 0.68), 36);
		x.fillStyle = 'rgb(170,150,120)'; x.fillRect(200, LIST_B + 50, 200, 60);   // 「閉じる」
	}
	async function make(n, rows) {
		const b = build(rows);
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
	return { make, W, H };
})();
`;

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
		await block('T188(1) ' + NAME + ' の本育成結果: タブ・関係のない部品を隠す・persons に混ざらない（OCR・処理のボタン）・結合＋上の欄・つまみを消す・色で数える数・T189 の結合画像の設定（1列｜2列・スキルの数。2列は案2／案4・1列は帯）・1枚だけ・サムネイル 336px・保存は別のボタン', async () => {
			const sp = await open(file, { w: 390, h: 844, fakeNav: true });
			const { page, errors } = sp;
			const tabs = await page.evaluate(() => [...document.querySelectorAll('#personset-tabs .uma-subtab')].map((b) => b.textContent.trim()));
			assert(tabs.length === 3 && /本育成結果/.test(tabs[2]), 'T188(1) ' + NAME + ' タブの行に3つ目「本育成結果」', tabs);
			await page.click('#personset-tabs [data-tab-id="skill"]');
			const hid = await page.evaluate((file) => {
				const vis = (id) => { const el = document.getElementById(id); return !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'); };
				return { wrap: vis('skillres-wrap'), setA: vis('personset-A-wrap'), bar: vis('upload-bar'), settings: vis(file === 'special' ? 'stitch-parts-panel' : 'stitch-show-panel'), mode: getComputedStyle(document.getElementById('upload-mode')).visibility, note: vis('stitch-set-note'), adv: vis('adv-opts') };
			}, file);
			assert(hid.wrap && !hid.setA && !hid.bar && !hid.settings && hid.mode === 'hidden' && !hid.note && !hid.adv, 'T188(1) ' + NAME + ' 本育成結果を選ぶと欄が出て、OCR のボタンの欄・結合画像の設定・静止画｜動画・注記・「!」は隠れる', hid);
			// 画像を選ぶ（作り物の4枚）
			await page.evaluate(async () => { UmaSkillResult.addFiles(await __skillSynth.make(4, 14)); });
			await page.waitForFunction(() => [...document.querySelectorAll('.sr-thumb img')].length === 4 && [...document.querySelectorAll('.sr-thumb img')].every((im) => im.getAttribute('src') && im.complete && im.naturalWidth > 0), null, { timeout: 30000 });
			const th = await page.evaluate(() => [...document.querySelectorAll('.sr-thumb img')].map((im) => ({ src: im.getAttribute('src'), nw: im.naturalWidth })));
			assert(th.every((t) => t.src.startsWith('blob:') && t.nw === 336), 'T188(1) ' + NAME + ' サムネイルは幅 336px の縮小画像（blob の URL）', th);
			const mix = await page.evaluate(() => ({ persons: persons.map((p) => p.files.length).join(','), tab: document.querySelector('#personset-tabs [data-tab-id="skill"]').textContent.trim(),
				ocrBtn: (document.getElementById('process-stitch-btn') || {}).disabled }));
			assert(mix.persons === '0,0,0,0,0,0' && /4枚/.test(mix.tab) && mix.ocrBtn === true, 'T188(1) ' + NAME + ' 本育成結果の画像は persons（親A〜祖B2）に入らない・タブの枚数はこのタブだけ・OCR のボタンは押せないまま', mix);
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
			// 画素を読む（検査用）: 結合画像の (x, y) の色
			const px = (src, pts) => page.evaluate(async ({ src, pts }) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
				const x = c.getContext('2d'); x.drawImage(im, 0, 0); return pts.map(([a, b]) => Array.from(x.getImageData(a, b, 1, 1).data.slice(0, 3))); }, { src, pts });
			const urls = [r1.url];
			// 1列＋数（803）: 上の欄の下に帯 → 帯の分だけ高い・一覧は帯の下から
			const c1n = await setForm(1, true); urls.push(c1n.src);
			assert(c1n.w === s1.w && c1n.h > s1.h && c1n.sr.variant === null && c1n.sr.info === true && c1n.sr.topH > c1n.sr.headH && c1n.pressed === 'true,false|true',
				'T189 ' + NAME + ' 1列・数あり: 上の欄の下に帯（画像が帯の分だけ高い）', c1n);
			// 2列・数なし（794 案2）: 左に上の欄＋前半・右に後半。左右の高さがそろう（差は1行ぶんより小さい）
			const ev = await setForm(2, false); urls.push(ev.src);
			const evL = ev.sr.headH + ev.sr.split, evR = ev.sr.listH - ev.sr.split;
			assert(ev.sr.variant === 'even' && ev.w > s1.w * 2 - 1 && ev.h < s1.h && Math.abs(evL - evR) < 160 && ev.h === Math.max(evL, evR) && ev.pressed === 'false,true|false',
				'T189 ' + NAME + ' 2列・数なしは案2（高さをそろえる）: 幅は2列ぶん・左（上の欄＋前半）と右（後半）の高さがそろう', { ev, evL, evR });
			// 2列・数あり（794 案4）: 左上に上の欄・右上に同じ高さの情報の箱・その下に一覧を半分ずつ（左右の下端がそろう）
			const sd = await setForm(2, true); urls.push(sd.src);
			const sdL = sd.sr.split, sdR = sd.sr.listH - sd.sr.split;
			assert(sd.sr.variant === 'side' && sd.sr.topH === sd.sr.headH && sd.w === ev.w && sd.h === sd.sr.headH + Math.max(sdL, sdR) && Math.abs(sdL - sdR) < 160 && sd.pressed === 'false,true|true',
				'T189 ' + NAME + ' 2列・数ありは案4: 右の上に上の欄と同じ高さの箱・その下に左右とも一覧を半分ずつ（下端がそろう）', { sd, sdL, sdR });
			// 案4 の右上の箱: 上は上の欄と同じ緑の帯、下は白いカード。左上（上の欄）は1列のときの上の欄と同じ画素
			const half = Math.round((sd.w - s1.w * 2) / 2);
			const colors = await px(sd.src, [[sd.w - 20, 10], [s1.w + half * 2 + Math.round(s1.w * 0.9), Math.round(sd.sr.headH * 0.6)]]);
			assert(colors[0][1] > 150 && colors[0][1] > colors[0][2] + 60 && colors[1].every((v) => v >= 240), 'T189 ' + NAME + ' 案4 の右上の箱: 上に緑の帯・中は白いカード', colors);
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
			assert(jsErrors(errors).length === 0, 'T188(1) ' + NAME + ' コンソールのエラー0', jsErrors(errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

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
