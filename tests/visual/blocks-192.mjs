// T223（2026-11-28・因子一覧の取り込み PC の確認で出た問題＝親Bセットの未読の丸・診断用の画の保存・結合画像の顔の大きさ。決定 941〜944）の検査。
// 作り物の画（blocks-190 の __six）で見る。本物の録画と本物の OCR は test:video-local の --list。
// run-smoke.mjs の末尾から register192() で呼ばれる（塊の見出しはすべて「T223」で始まる。`npm run test:visual -- --only=T223` で回せる）。
// スイッチ（js/factor-list.js の FACTOR_LIST_ENABLED）は製品の false のままで、隠しの入口（URL の ?factorlist=1）から開く。
//  (1) 親Bセットの未読の丸: 6人分（両方・親Bセットだけ）で付く・親Bセットを開くと消える・親Aセットだけ・見ている間・1人分・今の動画・静止画では付かない・保存しない
//  (2) 診断用の画の保存: ウィンドウの取り込み（録画を描く canvas を画面の共有の代わりに渡し、圧縮から製品のまま）でボタンが出て、中身（人の画・元の倍率のコマ・
//      diag.json）がそろう・大きいときはセットと順で分ける・次の取り込みで消える・診断の文に映像の大きさの行。印の無い URL は要素も行も無い
//  (3) 結合画像の顔: 6人分の人の画の顔の輪の幅は画面の幅 × 0.126（今の因子画面の実測: DMM版の横 145/1170・iPhone 151/1180）で左の札に掛からない・
//      UmaStar の3列の見出しの顔の輪は 66px（今の因子画面の見出しの実測 66〜67px）。縮める組（高さの上限を超える人）でも同じ
// 壊して NG になることの確かめ: 環境変数 T223_BREAK（keep・nodot・face・head・nodiag・split）を付けて回すと、製品をわざと壊した写しを配る（検査の道具だけ）
import { FACTOR, runImport } from './blocks-189.mjs';
import { SIX } from './blocks-190.mjs';
import { SYNTH85 } from './blocks-100.mjs';
import { reloadReady } from './lib/page-ready.mjs';

const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
const FAKE_TESSERACT = 'window.Tesseract={createWorker:async()=>({loadLanguage:async()=>{},initialize:async()=>{},setParameters:async()=>{},terminate:async()=>{},recognize:async()=>({data:{text:"",lines:[]}})})};';
const PAGES = ['special', 'exam'];
const NAME = { special: 'UmaStar', exam: 'UmaExam' };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 今の因子画面の結合画像の顔の実測（固定値。製品の定数は読まない）
const RING_OF_SCREEN = 0.126;   // 人の画（元の画面の倍率）の輪の幅 ÷ 画面の幅
const HEAD_RING = 66;           // UmaStar の3列の人の見出しの顔の輪の幅（px）

// 壊した写し（T223_BREAK）: [ファイル（{page} はページ）, 直す前, 直した後]
const BREAKS = {
	keep: ['{page}.html', 'if (!skillResultTab && activePersonSet === 1) factorListSetBDot = false;', ''],
	nodot: ['{page}.html', 'factorListSetBDot = !(activePersonSet === 1 && !skillResultTab);', 'factorListSetBDot = false;'],
	face: ['js/factor-list.js', 'faceRing: 0.126,', 'faceRing: 0.096,'],
	head: ['special.html', 'headRing: 66.5,', 'headRing: 59,'],
	nodiag: ['{page}.html', "if (list && list.type === 'list6' && UmaFactorList.TRIAL) showFactorListDiag(", "if (false) showFactorListDiag("],
	split: ['js/factor-list.js', 'if (size(entries) <= max) return', 'if (true) return']
};

// ページの中の道具
const TOOLS = String.raw`
window.__t223 = (function () {
	const tabs = () => Array.from(document.querySelectorAll('#personset-tabs .uma-subtab'), (b) => ({ id: b.getAttribute('data-tab-id'), dot: !!b.querySelector('.factorlist-setb-dot'),
		label: b.querySelector('.uma-subtab-label').textContent, cut: b.querySelector('.uma-subtab-label').scrollWidth - b.querySelector('.uma-subtab-label').clientWidth, h: Math.round(b.getBoundingClientRect().height) }));
	const dots = () => document.querySelectorAll('.factorlist-setb-dot').length;
	function dotLook() {
		const d = document.querySelector('.factorlist-setb-dot');
		if (!d) return null;
		const r = d.getBoundingClientRect(), tab = d.closest('.uma-subtab').getBoundingClientRect(), strip = d.closest('.uma-subtabs').getBoundingClientRect(), cs = getComputedStyle(d);
		const probe = document.createElement('i'); probe.style.background = 'var(--uma-notify)'; document.body.appendChild(probe); const notify = getComputedStyle(probe).backgroundColor; probe.remove();
		return { w: r.width, h: r.height, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, notify, hidden: d.getAttribute('aria-hidden'), text: d.textContent,
			inTab: r.left >= tab.left - 0.5 && r.right <= tab.right + 0.5 && r.top >= tab.top - 0.5 && r.bottom <= tab.bottom + 0.5, inStrip: r.right <= strip.right + 0.5, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
	}
	// 画の矩形の中の顔の輪の幅（矩形の中身の下の部分の、地でない画素の左右の端）と、中身の右端
	function ring(canvas, x, y, w, h) {
		x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y)); w = Math.min(canvas.width - x, Math.round(w)); h = Math.min(canvas.height - y, Math.round(h));
		const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h).data;
		const fg = (i, j) => { const p = (j * w + i) * 4, max = Math.max(d[p], d[p + 1], d[p + 2]); return max - Math.min(d[p], d[p + 1], d[p + 2]) > 45 || max < 150; };
		let top = -1, bottom = -1, right = -1;
		for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (fg(i, j)) { if (top < 0) top = j; bottom = j; if (i > right) right = i; }
		if (top < 0) return { w: 0 };
		let l = w, r = -1;
		for (let j = Math.round(top + (bottom - top) * 0.55); j <= bottom; j++) for (let i = 0; i < w; i++) if (fg(i, j)) { if (i < l) l = i; if (i > r) r = i; }
		return { w: r - l + 1, right: x + right, top: y + top, bottom: y + bottom };
	}
	// zip（無圧縮）の中身: 中央の一覧と各項目の先頭の数バイト・大きさ・CRC
	async function unzip(blob) {
		const b = new Uint8Array(await blob.arrayBuffer()), v = new DataView(b.buffer);
		const end = b.length - 22, n = v.getUint16(end + 10, true);
		let o = v.getUint32(end + 16, true);
		const crc = (bytes) => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xFFFFFFFF) >>> 0; };
		const out = [];
		for (let k = 0; k < n; k++) {
			const method = v.getUint16(o + 10, true), want = v.getUint32(o + 16, true), size = v.getUint32(o + 20, true), nameLen = v.getUint16(o + 28, true), at = v.getUint32(o + 42, true);
			const name = new TextDecoder().decode(b.subarray(o + 46, o + 46 + nameLen));
			const start = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true), data = b.subarray(start, start + size);
			out.push({ name, method, size, ok: v.getUint32(at, true) === 0x04034b50 && crc(data) === want, head: Array.from(data.subarray(0, 4)),
				text: name === 'diag.json' ? new TextDecoder().decode(data) : null });
			o += 46 + nameLen;
		}
		return { eocd: v.getUint32(end, true) === 0x06054b50, entries: out };
	}
	// 録画（作り物の出どころ）を canvas に描き続け、画面の共有の代わりに渡す（test:video-local の runCaptureSix と同じ作り）
	function fakeShare(src) {
		const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
		const cx = cv.getContext('2d', { willReadFrequently: true });
		window.__capDone = false;
		navigator.mediaDevices.getDisplayMedia = async () => {
			await src.drawAt(0, cx, cv.width, cv.height);
			const stream = cv.captureStream(30), t0 = performance.now();
			(async () => {
				let prev = -1;
				for (;;) {
					const t = Math.min((performance.now() - t0) / 1000 - 3, prev + 1 / 15);
					prev = t;
					await src.drawAt(Math.max(0, Math.min(src.duration - 0.001, t)), cx, cv.width, cv.height);
					if (t >= src.duration) break;
					await new Promise((r) => setTimeout(r, 20));
				}
				window.__capDone = true;
			})();
			return stream;
		};
	}
	function watch() {
		window.__toasts = [];
		const o = window.showToast; window.showToast = function (m) { window.__toasts.push(String(m)); return o.apply(this, arguments); };
		const d = window.showFactorListDiag; window.showFactorListDiag = function (rec) { window.__rec = rec; return d.apply(this, arguments); };
	}
	return { tabs, dots, dotLook, ring, unzip, fakeShare, watch };
})();
`;

export async function register192(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const unexpected = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500|本文の帯|使えるフレームが少なすぎる|すべて同じ場所が写っている|横画面のパネルが見つからない/.test(m));

	// ページを開いて動画の入口の状態にする。query … URL の ? 以降（隠しの入口）
	async function open(file, query, o) {
		const sp = await openPage(browser, base, file + '.html' + (query || ''), { width: (o && o.width) || 375, height: 812 }, EMPTY);
		const page = sp.page;
		page.setDefaultTimeout(180000);
		const br = BREAKS[process.env.T223_BREAK];
		if (br) {
			const target = br[0].replace('{page}', file);
			await page.route('**/' + target + '*', (route) => {
				const body = fs.readFileSync(path.join(REPO_ROOT, target), 'utf8');
				if (!body.includes(br[1])) throw new Error('壊す所が無い: ' + br[1]);
				return route.fulfill({ status: 200, contentType: (target.endsWith('.js') ? 'text/javascript' : 'text/html') + '; charset=utf-8', body: body.replace(br[1], br[2]) });
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
		await page.evaluate(() => __t223.watch());
		return sp;
	}
	// 作り物の6人分の動画を製品の取り込みに通す。spec: { tab1: [[seed, n], …] | null, tab2: … , view: 取り込む前に開いておくセット }
	const importSix = (page, spec) => page.evaluate(async (spec) => {
		const S = __six, P = S.person;
		const docs = { 1: S.doc((spec.tab1 || [[1, 6]]).map(([s, n]) => P(s, n))), 2: S.doc((spec.tab2 || [[1, 6]]).map(([s, n]) => P(s, n))) };
		const plan = (spec.tab1 ? S.scroll(1, 0, docs[1].end) : []).concat(spec.tab2 ? S.scroll(2, 0, docs[2].end) : []);
		devGeometry = []; window.__toasts = [];
		selectPersonSet(spec.view || 0);
		videoPending = { setIdx: spec.view || 0 };
		const result = await onVideoChosen(S.source(docs, plan), {});
		return { ok: !!(result && result.ok), toasts: window.__toasts, cards: persons.map((p) => p.files.reduce((a, f) => a + (f.factorList6 ? f.factorList6.cards.length : 0), 0)) };
	}, spec);
	const BOTH = { tab1: [[1, 14], [2, 9], [3, 11]], tab2: [[4, 10], [1, 14], [5, 8]] };

	for (const file of PAGES) {
		const N = NAME[file];

		await block(`T223(1) ${N} 親Bセットの未読の丸: 6人分で付き、開くと消える・ほかの取り込みでは付かない・印の無い URL は無い`, async () => {
			const sp = await open(file, '?factorlist=1', { width: 360 });
			const page = sp.page;
			const before = await page.evaluate(() => ({ dots: __t223.dots(), tabs: __t223.tabs() }));
			assert(before.dots === 0, `T223(1) ${N} 前提: 取り込む前は丸が無い`, before);
			const six = await importSix(page, BOTH);
			const a = await page.evaluate(() => ({ dots: __t223.dots(), tabs: __t223.tabs(), look: __t223.dotLook(), active: activePersonSet }));
			assert(six.ok && a.dots === 1 && a.active === 0 && same(a.tabs.map((t) => t.dot), [false, true, false]), `T223(1) ${N} 6人分の取り込みのあと、親Bセットのタブにだけ丸`, a);
			const L = a.look;
			assert(L && L.w >= 8 && L.w <= 14 && L.w === L.h && /999|50%|9999/.test(L.radius) && L.bg === L.notify && L.hidden === 'true' && L.text === '' && L.inTab && L.inStrip && L.overflow <= 0, `T223(1) ${N} 丸は通知の赤（--uma-notify）の円・読み上げない・タブの中・360px で横にはみ出さない`, L);
			assert(a.tabs.every((t) => t.cut <= 0) && same(a.tabs.map((t) => t.h), before.tabs.map((t) => t.h)), `T223(1) ${N} 360px でもタブの名前は切れず、高さは変わらない`, [a.tabs, before.tabs]);
			await page.click('#personset-tabs .uma-subtab[data-tab-id="skill"]');
			assert(await page.evaluate(() => __t223.dots()) === 1, `T223(1) ${N} 本育成結果のタブを開いても消えない`, null);
			await page.click('#personset-tabs .uma-subtab[data-tab-id="1"]');
			const b = await page.evaluate(() => ({ dots: __t223.dots(), active: activePersonSet }));
			assert(b.dots === 0 && b.active === 1, `T223(1) ${N} 親Bセットを開くと消える`, b);
			await page.click('#personset-tabs .uma-subtab[data-tab-id="0"]');
			assert(await page.evaluate(() => __t223.dots()) === 0, `T223(1) ${N} 親Aセットに戻っても出ない`, null);
			// 親Bセットだけを取得したときも付く
			const onlyB = await importSix(page, { tab2: BOTH.tab2 });
			const c = await page.evaluate(() => ({ dots: __t223.dots(), tabs: __t223.tabs() }));
			assert(onlyB.ok && onlyB.cards[0] === 14 && c.dots === 1 && c.tabs[1].dot, `T223(1) ${N} 親Bセットだけを取得したときも付く`, [onlyB, c]);
			// 丸のあるまま親Aセットだけを取り込んでも残る（親Bセットはまだ開いていない）。開いてから親Aセットだけなら付かない
			await importSix(page, { tab1: BOTH.tab1 });
			assert(await page.evaluate(() => __t223.dots()) === 1, `T223(1) ${N} まだ開いていない丸は、親Aセットだけの取り込みで消えない`, null);
			await page.click('#personset-tabs .uma-subtab[data-tab-id="1"]');
			const onlyA = await importSix(page, { tab1: BOTH.tab1 });
			assert(onlyA.ok && await page.evaluate(() => __t223.dots()) === 0, `T223(1) ${N} 親Aセットだけの取り込みでは付かない`, onlyA);
			// 親Bセットを見ながら6人分を取り込むと付かない
			const seeB = await importSix(page, Object.assign({ view: 1 }, BOTH));
			const d = await page.evaluate(() => ({ dots: __t223.dots(), active: activePersonSet }));
			assert(seeB.ok && d.active === 1 && d.dots === 0, `T223(1) ${N} 親Bセットを開いたまま取り込むと付かない`, [seeB, d]);
			// 1人分の因子一覧・今の因子画面の動画・静止画（親Bセットへ）では付かない
			await page.evaluate(() => selectPersonSet(0));
			const one = await runImport(page, 'list1', 1);
			const e1 = await page.evaluate(() => ({ dots: __t223.dots(), active: activePersonSet, diag: !!document.getElementById('factorlist-diag') }));
			assert(one.result.ok && one.files[3] > 0 && e1.dots === 0 && !e1.diag, `T223(1) ${N} 1人分の因子一覧（親Bセットへ）では付かない・診断のボタンも出ない`, [one.files, e1]);
			const three = await runImport(page, 'inherit3', 1);
			const e2 = await page.evaluate(() => __t223.dots());
			assert(three.result.ok && three.files[4] > 0 && e2 === 0, `T223(1) ${N} 今の因子画面の動画（親Bセットへ）では付かない`, [three.files, e2]);
			const still = await page.evaluate(async () => {
				const c = document.createElement('canvas'); c.width = 400; c.height = 600; c.getContext('2d').fillRect(0, 0, 400, 600);
				const f = new File([await new Promise((r) => c.toBlob(r, 'image/png'))], 'still.png', { type: 'image/png' });
				selectPersonSet(0); persons[3].files = []; persons[3].video = null; addPersonFiles(3, [f]); updateProcessBtn();
				return { n: persons[3].files.length, dots: __t223.dots() };
			});
			assert(still.n === 1 && still.dots === 0, `T223(1) ${N} 静止画を親Bセットに足しても付かない`, still);
			// 保存しない
			await importSix(page, BOTH);
			assert(await page.evaluate(() => __t223.dots()) === 1, `T223(1) ${N} 前提: もう一度付ける`, null);
			await reloadReady(page);
			const f = await page.evaluate(() => ({ dots: document.querySelectorAll('.factorlist-setb-dot').length, keys: Object.keys(localStorage).filter((k) => /dot|unseen|factorlist/i.test(k)) }));
			assert(f.dots === 0 && f.keys.length === 0, `T223(1) ${N} 保存しない（開き直すと消える）`, f);
			assert(unexpected(sp.errors).length === 0, `T223(1) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
			// 印の無い URL: 今の動画・6人分の動画のあとも丸の要素が無い
			const off = await open(file, '');
			const r1 = await runImport(off.page, 'inherit3');
			const r2 = await importSix(off.page, BOTH);
			const g = await off.page.evaluate(() => ({ dots: __t223.dots(), diag: !!document.getElementById('factorlist-diag'), rec: !!window.__rec, extra: document.querySelectorAll('[class*="factorlist"], [id*="factorlist"]').length }));
			assert(r1.result.ok && !r2.ok && g.dots === 0 && !g.diag && !g.rec && g.extra === 0, `T223(1) ${N} 印の無い URL は丸・診断のボタンの要素が無い`, [r2, g]);
			assert(unexpected(off.errors).length === 0, `T223(1) ${N} 印の無い URL も想定の外のコンソールのエラーなし`, unexpected(off.errors).slice(0, 3));
			await off.ctx.close();
		});

		await block(`T223(2) ${N} 診断用の画の保存: ウィンドウの取り込みで中身がそろう・分け方・診断の文の映像の大きさ`, async () => {
			const sp = await open(file, '?factorlist=1');
			const page = sp.page;
			const downloads = [];
			page.on('download', (d) => downloads.push(d.suggestedFilename()));
			const capture = async () => {
				await page.evaluate(() => {
					const S = __six, P = S.person;
					const docs = { 1: S.doc([P(1, 14), P(2, 9), P(3, 11)]), 2: S.doc([P(4, 10), P(1, 14), P(5, 8)]) };
					__t223.fakeShare(S.landscape(S.source(docs, S.scroll(1, 0, docs[1].end).concat(S.scroll(2, 0, docs[2].end)))));
					selectPersonSet(0); window.__toasts = []; devGeometry = [];
				});
				await page.click('#personset-A-wrap .video-capture-btn');
				await page.waitForFunction(() => window.__capDone, null, { timeout: 180000 });
				await page.click('#cap-stop');
				await page.waitForFunction(() => !videoBusy && !document.getElementById('video-progress') && (!!document.querySelector('#video-error, #cap-fail') || (window.__toasts.some((t) => t.includes('取得しました')) && !stitchInProgress)), null, { timeout: 180000 });
				return page.evaluate(() => ({ toasts: window.__toasts, error: (document.querySelector('#video-error, #cap-fail') || {}).textContent || null, files: persons.map((p) => p.files.length) }));
			};
			const cap = await capture();
			const box = await page.evaluate(() => {
				const el = document.getElementById('factorlist-diag'), b = el && el.querySelector('button'), r = b && b.getBoundingClientRect(), row = document.getElementById('upload-mode').parentElement;
				return { has: !!el, after: !!el && (row.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) > 0, text: b && b.textContent, h: r && r.height, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
					links: el ? el.querySelectorAll('a').length : 0, blob: !!(window.__rec && window.__rec.blob), flow: window.__rec && window.__rec.flow, rect: window.__rec && window.__rec.rect, dots: __t223.dots() };
			});
			assert(!cap.error && cap.files.filter((n) => n > 0).length === 6 && box.has && box.after && box.text === '診断用の画を保存' && box.h >= 43.5 && box.overflow <= 0 && box.links === 0 && box.blob && box.flow === 'window' && box.rect && box.rect.w > 400, `T223(2) ${N} ウィンドウの6人分の取り込みのあと、タブの行の下に保存のボタンが出る`, [cap, box]);
			assert(box.dots === 1, `T223(2) ${N} ウィンドウの取り込みでも親Bセットに丸`, box.dots);
			// ボタンを押す: ファイルが1つなら、そのまま保存する
			await page.click('#factorlist-diag button');
			await page.waitForFunction(() => !!document.querySelector('#factorlist-diag a, #factorlist-diag .factorlist-diag-fail') && !document.querySelector('#factorlist-diag button').disabled, null, { timeout: 180000 });
			await page.waitForTimeout(1500);
			const one = await page.evaluate(async () => {
				const links = Array.from(document.querySelectorAll('#factorlist-diag a'), (a) => ({ text: a.textContent, name: a.download, href: a.href.slice(0, 5) }));
				const a = document.querySelector('#factorlist-diag a');
				const z = a ? await __t223.unzip(await (await fetch(a.href)).blob()) : null;
				const json = z ? JSON.parse(z.entries.find((e) => e.name === 'diag.json').text) : null;
				return { links, btn: document.querySelector('#factorlist-diag button').textContent, eocd: z && z.eocd, entries: z && z.entries.map((e) => ({ name: e.name, method: e.method, ok: e.ok, head: e.head, size: e.size })), json,
					files: persons.map((p) => p.files.map((f) => f.name)), sizes: persons.map((p) => p.files.map((f) => f.size)), labels: PERSON_LABELS };
			});
			assert(one.links.length === 1 && /^ファイル1を保存（\d+MB）$/.test(one.links[0].text) && /^factorlist-diag-\d{8}-\d{6}\.zip$/.test(one.links[0].name) && downloads.length === 1 && downloads[0] === one.links[0].name && one.btn === '診断用の画を保存', `T223(2) ${N} 1つのファイルはそのまま保存され、押せる一覧も出る`, [one.links, downloads]);
			const es = one.entries || [], img = (e) => (e.name.endsWith('.png') ? same(e.head, [137, 80, 78, 71]) : e.name.endsWith('.jpg') ? e.head[0] === 255 && e.head[1] === 216 : e.name === 'diag.json');
			assert(one.eocd && es.every((e) => e.method === 0 && e.ok && img(e)), `T223(2) ${N} 無圧縮の zip（各項目の CRC と中身の形が合う）`, es.filter((e) => !(e.method === 0 && e.ok && img(e))));
			const all = one.files.flat();
			assert(all.every((n, i) => es.some((e) => e.name === 'persons/' + n && e.size === one.sizes.flat()[i])) && es.filter((e) => e.name.startsWith('persons/')).length === all.length, `T223(2) ${N} ① 人の画は6人の分けた画の全部（大きさも同じ）`, { all, got: es.map((e) => e.name) });
			const J = one.json || { sets: [], frames: [] };
			const used = new Set(J.sets.flatMap((s) => s.persons.flatMap((p) => p.rows.map((q) => s.set + ':' + q.at).concat(p.faceAt == null ? [] : [s.set + ':' + p.faceAt]))));
			assert(J.frames.length === used.size && J.frames.length >= 6 && J.frames.every((f) => used.has(f.set + ':' + f.t) && es.some((e) => e.name === f.file) && f.width === J.cropRect.w && f.height === J.cropRect.h && f.sharpness > 0 && f.persons.length >= 1) && ['A', 'B'].every((s) => J.frames.some((f) => f.set === s)),
				`T223(2) ${N} ② 使った時刻のコマが全部、切り出しの矩形の大きさ（拡大する前）で入る`, { n: J.frames.length, used: used.size, first: J.frames[0], rect: J.cropRect });
			assert(J.flow === 'window' && J.capture && J.capture.width === 2780 && J.capture.height === 1564 && J.capture.settings.width === 2780 && !('deviceId' in J.capture.settings) && J.capture.frames.received > 30 && J.capture.frames.encoded > 30 && J.capture.frames.meanIntervalMs > 0
				&& J.importFrame.w === 1170 && Math.abs(J.upscale - 1170 / J.cropRect.w) <= 0.01 && J.upscale > 1 && J.thresholds.minSharpness === 120 && same(J.sets.map((s) => s.persons.map((p) => p.label)), [one.labels.slice(0, 3), one.labels.slice(3)]),
				`T223(2) ${N} ③ 取り込みの流れ・映像の設定とフレーム・矩形・拡大の倍率・人の並び`, { capture: J.capture, rect: J.cropRect, upscale: J.upscale, frame: J.importFrame });
			const P = J.sets.flatMap((s) => s.persons);
			assert(P.every((p) => p.images.length >= 1 && p.images.every((m) => m.sharpness > 0 && typeof m.ok === 'boolean' && m.cards.length > 0 && m.baseWidth > 0) && p.rows.length === p.cards && p.rows.every((q) => q.samples >= 1 && q.sampleTimes.length >= 1) && typeof p.uncertain === 'boolean' && typeof p.headBlue === 'boolean')
				&& J.sets.every((s) => ['gaps', 'jumped', 'skipped', 'tailSkipped'].every((k) => typeof s[k] === 'number')) && J.log.some((l) => /^\[時間\] 取り込み/.test(l)),
				`T223(2) ${N} ③ 画ごとの鮮明度の内訳（今の判定の値と札ごと）・「確かでない」の判断の値・開発ログの行`, P[0]);
			// 大きいときはセットごと・順に分ける
			const split = await page.evaluate(async () => {
				const total = (await UmaFactorList.diagZips(window.__rec, {})).reduce((s, z) => s + z.blob.size, 0);
				const run = async (zipMax) => {
					const zips = await UmaFactorList.diagZips(window.__rec, { zipMax });
					const out = [];
					for (const z of zips) { const u = await __t223.unzip(z.blob); out.push({ name: z.name, size: z.blob.size, eocd: u.eocd, ok: u.entries.every((e) => e.ok), names: u.entries.map((e) => e.name) }); }
					return out;
				};
				return { total, two: await run(Math.round(total * 0.75)), many: await run(Math.round(total * 0.2)), max: [Math.round(total * 0.75), Math.round(total * 0.2)], rec: window.__rec.sets.length };
			});
			const uniq = (zips) => zips.flatMap((z) => z.names.filter((n) => n !== 'diag.json'));
			assert(split.two.length === 2 && /-A\.zip$/.test(split.two[0].name) && /-B\.zip$/.test(split.two[1].name) && split.two[0].names.every((n) => !/\/B\/|-B-/.test(n)) && split.two[1].names.every((n) => !/\/A\/|-A-/.test(n)), `T223(2) ${N} 上限を超えると親Aセット用と親Bセット用に分ける`, split.two.map((z) => [z.name, z.size, z.names.length]));
			assert(split.many.length > 2 && split.many.some((z) => /-A-1\.zip$/.test(z.name)) && [split.two, split.many].every((g, i) => g.every((z) => z.eocd && z.ok && z.names[0] === 'diag.json' && z.size <= split.max[i] + 1024) && new Set(uniq(g)).size === uniq(g).length && uniq(g).length === es.length - 1),
				`T223(2) ${N} 1つのセットも超えると順に分け、どのファイルも上限以下で diag.json を持ち、画は1回ずつ`, split.many.map((z) => [z.name, z.size, z.names.length]));
			// 分かれたときは1つずつ押して保存する
			await page.evaluate(() => { const U = window.UmaFactorList; window.__U = U; window.UmaFactorList = Object.freeze(Object.assign({}, U, { diagZips: (rec, o) => U.diagZips(rec, Object.assign({}, o, { zipMax: 1 })) })); });
			downloads.length = 0;
			await page.click('#factorlist-diag button');
			await page.waitForFunction(() => document.querySelectorAll('#factorlist-diag a').length > 1 && !document.querySelector('#factorlist-diag button').disabled, null, { timeout: 180000 });
			await page.waitForTimeout(800);
			const auto = downloads.length;
			await page.click('#factorlist-diag a >> nth=1');
			await page.waitForTimeout(1500);
			const multi = await page.evaluate(() => { window.UmaFactorList = window.__U; return Array.from(document.querySelectorAll('#factorlist-diag a'), (a) => a.textContent); });
			assert(auto === 0 && downloads.length === 1 && multi.length > 1 && multi.every((t, i) => t.startsWith('ファイル' + (i + 1) + 'を保存（')), `T223(2) ${N} 分かれたときは番号つきの一覧を出し、押したものを保存する`, { auto, downloads, n: multi.length });
			// 診断の文（開発ログの実行環境）に映像の大きさ
			const log = await page.evaluate(() => { document.getElementById('opt-devlog').checked = true; renderDevLog(); return document.getElementById('dev-log').textContent.split('\n\n')[0]; });
			assert(/■ 実行環境[\s\S]*取り込んだ映像: 2780×1564（共有の設定 2780×1564・\d+fps[\s\S]*）／画面: 約 \d+×\d+（\d+×\d+・devicePixelRatio [\d.]+）/.test(log), `T223(2) ${N} 診断の文の「■ 実行環境」に取り込んだ映像と画面の大きさの1行`, log);
			// 次の取り込みを始めると消える（動画の取り込みでは映像の行も無い）
			await runImport(page, 'inherit3');
			const gone = await page.evaluate(() => { renderDevLog(); return { box: !!document.getElementById('factorlist-diag'), line: /取り込んだ映像/.test(document.getElementById('dev-log').textContent) }; });
			assert(!gone.box && !gone.line, `T223(2) ${N} 次の取り込みでボタンは消え、映像の行も出ない`, gone);
			assert(unexpected(sp.errors).length === 0, `T223(2) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
			// 印の無い URL のウィンドウの取り込み: 要素も行も無い（6人分は今のまま失敗する）
			const off = await open(file, '');
			await off.page.evaluate(() => {
				const S = __six, P = S.person;
				const docs = { 1: S.doc([P(1, 14), P(2, 9), P(3, 11)]), 2: S.doc([P(4, 10)]) };
				__t223.fakeShare(S.landscape(S.source(docs, S.scroll(1, 0, 400))));
			});
			await off.page.click('#personset-A-wrap .video-capture-btn');
			await off.page.waitForFunction(() => window.__capDone, null, { timeout: 180000 });
			await off.page.click('#cap-stop');
			await off.page.waitForFunction(() => !videoBusy && !document.getElementById('video-progress') && !!document.querySelector('#video-error, #cap-fail'), null, { timeout: 180000 });
			const o = await off.page.evaluate(() => { document.getElementById('opt-devlog').checked = true; renderDevLog(); return { diag: !!document.getElementById('factorlist-diag'), dots: __t223.dots(), line: /取り込んだ映像/.test(document.getElementById('dev-log').textContent), env: /■ 実行環境/.test(document.getElementById('dev-log').textContent) }; });
			assert(!o.diag && o.dots === 0 && !o.line && o.env, `T223(2) ${N} 印の無い URL はウィンドウの取り込みでもボタン・丸・映像の行が無い`, o);
			await off.ctx.close();
		});

		await block(`T223(3) ${N} 結合画像の顔は今の因子画面の顔と同じ大きさ（3列・2列・縮める組）`, async () => {
			const sp = await open(file, '?factorlist=1');
			const page = sp.page;
			// 2人目のタブは札の多い人（人の画の高さが上限を超えて縮める組）
			const six = await importSix(page, { tab1: BOTH.tab1, tab2: [[4, 10], [6, 58], [5, 8]] });
			const r = await page.evaluate(async ({ file, RING }) => {
				const out = { persons: [], final: [] };
				for (let i = 0; i < 6; i++) {
					const files = persons[i].files, c = await UmaFactorList.composeList6(files), f = c._factorList6.face, screenW = files[0].factorList6.screenW, scale = files[0].factorList6.scale;
					// 左の札の左端（顔の欄の右。顔の高さの中ほどから下の札）
					const mid = Math.round(files[0].factorList6.cards[0].y * scale + files[0].factorList6.cards[0].h * scale / 2);
					const row = c.getContext('2d').getImageData(0, mid, c.width, 1).data;
					let card = -1; for (let x = Math.round(c.width * 0.19); x < c.width; x++) if (Math.min(row[x * 4], row[x * 4 + 1], row[x * 4 + 2]) < 244) { card = x; break; }
					const m = f ? __t223.ring(c, 0, 0, card - 1, f.y + f.h + 20) : null;
					out.persons.push({ i, screenW, scale, w: c.width, face: f, ring: m && m.w, right: m && m.right, card });
				}
				for (const cols of [3, 2]) for (let si = 0; si < 2; si++) {
					if (file === 'special') {
						const c = await buildStitchedSetImage(si, null, false, Object.assign(stitchPartsNow(), { cols, marker: false, legacy: false }));
						if (cols === 3) {
							const L = c._layout;
							out.final.push({ cols, si, heads: L.heads.map((h) => (h.icon ? { ring: __t223.ring(c, h.icon.x, h.icon.y, h.icon.w, h.icon.h).w, w: h.icon.w, h: h.icon.h, label: h.label.x - h.icon.x - h.icon.w } : null)), over: L.heads.every((h, k) => h.label.x + h.label.w <= L.persons[k].x + L.persons[k].w) });
						} else out.final.push({ cols, si, size: [c.width, c.height] });
					} else {
						const was = stitchCols; stitchCols = cols;
						const c = await buildVideoPreviewSetImage(si, videoSetFiles(si)); stitchCols = was;
						out.final.push({ cols, si, size: [c.width, c.height] });
						if (cols === 3) {
							// 3列は人の画が縮まずに、見出しの帯の下に上をそろえて並ぶ。帯の下の左の人（親）の顔を測る
							const people = [];
							for (let k = 0; k < 3; k++) people.push(await UmaFactorList.composeList6(persons[si * 3 + k].files));
							const top = c.height - Math.max(...people.map((p) => p.height)), f = people[0]._factorList6.face;
							Object.assign(out.final[out.final.length - 1], { ring: __t223.ring(c, 0, top, f.x + f.w + 2, f.y + f.h + 2).w, want: persons[si * 3].files[0].factorList6.screenW * RING });
						}
					}
				}
				return out;
			}, { file, RING: RING_OF_SCREEN });
			assert(six.ok && same(six.cards, [14, 9, 11, 10, 58, 8]) && r.persons.some((p) => p.scale < 0.999), `T223(3) ${N} 前提: 6人分（縮める組を含む）`, [six.cards, r.persons.map((p) => p.scale)]);
			assert(r.persons.every((p) => p.face && Math.abs(p.ring - p.screenW * RING_OF_SCREEN) <= p.screenW * RING_OF_SCREEN * 0.05), `T223(3) ${N} 6人とも、人の画の顔の輪の幅は画面の幅 × ${RING_OF_SCREEN}（±5%）`, r.persons.map((p) => [p.ring, p.screenW && Math.round(p.screenW * RING_OF_SCREEN), p.scale]));
			assert(r.persons.every((p) => p.card > 0 && p.right < p.card - 1), `T223(3) ${N} 顔は左の札に掛からない`, r.persons.map((p) => [p.right, p.card]));
			if (file === 'special') {
				const heads = r.final.filter((x) => x.cols === 3).flatMap((x) => x.heads);
				assert(heads.length === 6 && heads.every((h) => h && h.h === 64 && Math.abs(h.ring - HEAD_RING) <= 3), `T223(3) ${N} 3列の人の見出しの顔の輪は今の因子画面と同じ ${HEAD_RING}px（±3）`, heads);
				assert(r.final.filter((x) => x.cols === 3).every((x) => x.over), `T223(3) ${N} 見出しのラベルは人の列に収まる`, r.final);
			} else {
				const three = r.final.filter((x) => x.cols === 3);
				assert(three.length === 2 && three.every((x) => Math.abs(x.ring - x.want) <= x.want * 0.05), `T223(3) ${N} 3列の結合画像の顔の輪も画面の幅 × ${RING_OF_SCREEN}（人の画は縮めずに並ぶ）`, three);
			}
			assert(r.final.filter((x) => x.cols === 2).length === 2 && r.final.every((x) => !x.size || x.size[0] * x.size[1] <= 16777216), `T223(3) ${N} 2列の結合画像もできる`, r.final);
			assert(unexpected(sp.errors).length === 0, `T223(3) ${N} 想定の外のコンソールのエラーなし`, unexpected(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});
	}
}
