// T186（2026-11-15・決定 769〜770）: UmaExam（exam.html）の iPhone の再読み込みの対策（メモリを減らす。UmaStar の T133〔blocks-141〕と同じ作り）の検査。
// run-smoke.mjs の末尾から register179() で呼ばれる（塊の見出しはすべて「T186」で始まる。`npm run test:visual -- --only=T186` で回せる）。
//
//  - A1: ②の枠のサムネイルと動画のタイルは、File ごとに1回だけ作った幅 336px の縮小画像（元の File は persons[].files に今のまま）。親A・親B の両方。
//  - A4: 描き直しでは同じ URL を使い回し、枠から消した画像・クリアしたセットの URL は手放す。
//  - A2: 結合画像は PNG の Blob の object URL。動画モードでは②と引き出しが同じ URL を使い、作り直したら古い URL を手放す。
//        PNG の中身は今の作り（toDataURL）と同じ（SHA-256）。保存は今のまま（スマホは共有のシートに手元の Blob を渡す・PC は今の名前でダウンロード）。
// 手放したかは、その URL を fetch して読めなくなったかで見る。動画は blocks-80 の作り物（SYNTH）。OCR そのもの（Tesseract）は回さない（processPersonImages を差し替える）。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH } from './blocks-80.mjs';
import { pickVideo } from './lib/video-entry.mjs';

const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** ページの読み込みの前に入れる。window.__dev の値を navigator に見せ、share の呼ばれ方を残す（blocks-141 と同じ） */
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

/** 作り物の tesseract.js（blocks-178 の作り物を縮めたもの。recognize は空の行を返す） */
const TESS_STUB = `window.Tesseract = { createWorker: async function () { return {
	loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, terminate: async () => {},
	recognize: async () => ({ data: { text: '', lines: [] } }) }; } };`;

/** OCR を回さない（blocks-146 の T139(3) と同じ差し替え）。結合に渡った canvas を控える */
function STUB_OCR() {
	processPersonImages = async (worker, files) => ({ lines: [], skipped: [], warned: [], geometry: files.map(() => null) });
	readMelopTopRow = async () => ({ found: false, extraLines: [] });
	window.__canvases = [];
	const orig = buildStitchedSetImage;
	buildStitchedSetImage = async function () { const c = await orig.apply(this, arguments); if (c) window.__canvases.push(c); return c; };
}

export async function register179(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const IMG_DIR = '2026-09-15_5';
	const imgNames = () => fs.readdirSync(path.join(REPO_ROOT, 'test-images', IMG_DIR)).filter((n) => /\.png$/i.test(n)).sort();

	const open = async ({ w = 390, h = 844, mode = 'shot', fakeNav = false } = {}) => {
		const sp = await openPage(browser, base, 'exam.html', { width: w, height: h }, EMPTY);
		if (fakeNav) await sp.page.addInitScript(FAKE_NAVIGATOR);
		await sp.page.evaluate(({ mode }) => {
			localStorage.setItem('uma-exam-last-step', '2');
			localStorage.setItem('uma-exam-upload-mode', mode);
		}, { mode });
		// T185 の OCR のエンジンの池（UmaOcrPool.open）が本物の Tesseract を作らないよう、作り物にする（読みは STUB_OCR が差し替えるので呼ばれない）
		await sp.page.route('**/tesseract.js/4.0.2/tesseract.min.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: TESS_STUB }));
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok').catch(() => {});
		await sp.page.evaluate(() => { selectStepTab(2); window.scrollTo(0, 0); });
		return sp;
	};
	/** 人 personIdx の枠に test-images の画像を入れる */
	const addImages = (page, personIdx, names) => page.evaluate(async ({ personIdx, dir, names }) => {
		const files = [];
		for (const n of names) files.push(new File([await (await fetch('/test-images/' + dir + '/' + n)).blob()], n, { type: 'image/png' }));
		addPersonFiles(personIdx, files);
	}, { personIdx, dir: IMG_DIR, names });
	/** 枠のサムネイルの img が全部できるまで待ち、src と自然な大きさ・表示の大きさを返す */
	const thumbs = async (page, personIdx) => {
		await page.waitForFunction((i) => {
			const imgs = [...document.querySelectorAll('.person-image-list[data-person="' + i + '"] img')];
			return imgs.every((im) => im.getAttribute('src') && im.complete && im.naturalWidth > 0);
		}, personIdx, { timeout: 30000 });
		return page.evaluate((i) => [...document.querySelectorAll('.person-image-list[data-person="' + i + '"] img')].map((im) => {
			const r = im.getBoundingClientRect();
			return { src: im.getAttribute('src'), nw: im.naturalWidth, nh: im.naturalHeight, w: Math.round(r.width), h: Math.round(r.height), tile: !!im.closest('.video-tile') };
		}), personIdx);
	};
	/** URL がまだ読めるか（手放した object URL は fetch が失敗する） */
	const alive = (page, url) => page.evaluate(async (u) => { try { await (await fetch(u)).arrayBuffer(); return true; } catch (e) { return false; } }, url);
	const waitStitched = (page) => page.waitForFunction(() => !stitchInProgress && !busyBtnId && document.querySelectorAll('#stitch-result-content img').length > 0, null, { timeout: 60000 });

	await block('T186(1) UmaExam の静止画のサムネイル: 幅 336px の縮小画像・枠の高さは今のまま 56px・描き直しでは同じ URL・消した画像とクリアしたセットの URL は手放す・元の File は持つ・親Bセットも同じ', async () => {
		const sp = await open();
		const { page, errors } = sp;
		const names = imgNames();
		assert(names.length >= 3, 'T186(1) 前提: test-images の ' + IMG_DIR + ' に画像が3枚以上', names.length);
		await addImages(page, 0, names.slice(0, 2));
		const t0 = await thumbs(page, 0);
		assert(t0.length === 2 && t0.every((t) => t.src.startsWith('blob:') && t.nw === 336 && t.nh > 336), 'T186(1) サムネイルは幅 336px の縮小画像（元は 1179px など）', t0);
		assert(t0.every((t) => t.h === 56), 'T186(1) 枠の中の高さは今のまま 56px（h-14）', t0.map((t) => t.h));
		const orig = await page.evaluate(() => persons[0].files.map((f) => f.size));
		assert(orig.length === 2 && orig.every((s) => s > 100000), 'T186(1) 元の File は persons[].files に今のまま持つ', orig);
		// 足すと描き直す: 前の2枚は同じ URL のまま
		await addImages(page, 0, names.slice(2, 3));
		const t1 = await thumbs(page, 0);
		assert(t1.length === 3 && t1[0].src === t0[0].src && t1[1].src === t0[1].src, 'T186(1) 描き直しでは同じ URL を使い回す', t1.map((t) => t.src));
		// 消すと、その画像の URL を手放す（残る画像の URL は読める）
		await page.evaluate(() => removePersonImage(0, 0));
		const t2 = await thumbs(page, 0);
		assert(t2.length === 2 && !(await alive(page, t0[0].src)) && (await alive(page, t2[0].src)), 'T186(1) 消した画像の URL は手放す・残る画像の URL は読める', { removed: t0[0].src, left: t2.map((t) => t.src) });
		// 親Bセット（人 3）も同じ。親Aセットのクリアで親Bの URL は手放さない
		await page.evaluate(() => { const b = document.querySelector('#personset-tabs [data-tab-id="1"]'); if (b) b.click(); });
		await addImages(page, 3, names.slice(0, 1));
		const tb = await thumbs(page, 3);
		assert(tb.length === 1 && tb[0].src.startsWith('blob:') && tb[0].nw === 336, 'T186(1) 親Bセットのサムネイルも幅 336px の縮小画像', tb);
		await page.evaluate(() => clearPersonSet(0));
		const gone = await Promise.all(t2.map((t) => alive(page, t.src)));
		assert(gone.every((x) => x === false), 'T186(1) 「セットをクリア」で親Aセットの URL を手放す', gone);
		assert(await alive(page, tb[0].src), 'T186(1) 親Aセットのクリアで親Bセットの URL は手放さない', tb[0].src);
		assert(jsErrors(errors).length === 0, 'T186(1) コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T186(2) UmaExam の動画: タイルは縮小画像・結合画像は Blob の URL で②と引き出しが同じ URL・作り直すと古い URL を手放す・PNG の中身は今の作りと同じ', async () => {
		const sp = await open({ w: 1280, h: 900, mode: 'video' });
		const { page, errors } = sp;
		await page.addScriptTag({ content: SYNTH });
		await pickVideo(page);
		const res = await page.evaluate(() => Promise.race([onVideoChosen(__synth.make({}).source), new Promise((r) => setTimeout(() => r('timeout'), 90000))]));
		assert(res && res.ok === true && res.stitched === true, 'T186(2) 取り込みと自動の結合ができた', res);
		const tiles = [];
		for (const i of [0, 1, 2]) tiles.push(...(await thumbs(page, i)).filter((t) => t.tile));
		const frameW = await page.evaluate(() => new Promise((r) => { const im = new Image(); im.onload = () => r(im.naturalWidth); im.src = URL.createObjectURL(persons[0].files[0]); }));
		assert(tiles.length === 3 && tiles.every((t) => t.src.startsWith('blob:') && t.nw === Math.min(336, frameW)), 'T186(2) 3人のタイルは幅 336px（動画の画の幅 ' + frameW + 'px が 336 以下ならそのまま）', tiles);
		const s2 = await page.evaluate(() => document.querySelector('#personset-A-wrap .video-result img').getAttribute('src'));
		assert(s2 && s2.startsWith('blob:'), 'T186(2) ②の結合画像は Blob の object URL（data URL ではない）', s2 && s2.slice(0, 20));
		// 動画モードの「OCR処理を開始する」: 引き出しと②が同じ URL
		await page.evaluate(STUB_OCR);
		await page.click('#process-stitch-btn');
		await waitStitched(page);
		const both = await page.evaluate(() => ({
			drawer: document.querySelector('#stitch-result-content img').getAttribute('src'),
			step2: document.querySelector('#personset-A-wrap .video-result img').getAttribute('src'),
			dl: [...document.querySelectorAll('#stitch-result-content a.uma-btn, #personset-A-wrap .video-dl-btn')].map((a) => a.getAttribute('href')),
			dataImgs: [...document.querySelectorAll('img')].filter((im) => (im.getAttribute('src') || '').startsWith('data:image/png')).length,
			n: stitchPngUrls.size
		}));
		assert(both.drawer && both.drawer.startsWith('blob:') && both.drawer === both.step2 && both.dl.length === 2 && both.dl.every((h) => h === both.drawer), 'T186(2) 引き出しと②の結合画像・保存のリンクは同じ1つの URL', both);
		assert(both.dataImgs === 0, 'T186(2) PNG の data URL の img は無い', both.dataImgs);
		assert(!(await alive(page, s2)) && (await alive(page, both.drawer)), 'T186(2) 作り直すと②の前の URL は手放し、今の URL は読める', { old: s2, now: both.drawer });
		assert(both.n === 1, 'T186(2) 持っている結合画像の URL は1つ', both.n);
		// PNG の中身: 今の作り（canvas.toDataURL）と同じバイト
		const same = await page.evaluate(async (u) => {
			const hex = async (buf) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('');
			const c = window.__canvases[window.__canvases.length - 1];
			const d = c.toDataURL('image/png');
			const bin = atob(d.slice(d.indexOf(',') + 1));
			const bytes = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
			const blob = await (await fetch(u)).arrayBuffer();
			return { a: await hex(bytes.buffer), b: await hex(blob), len: [bytes.length, blob.byteLength] };
		}, both.drawer);
		assert(same.a === same.b && same.len[0] > 1000, 'T186(2) 結合画像の PNG のバイトは今の作り（toDataURL）と同じ（SHA-256）', same);
		// 枠の画像を消すと②の画像は外れる。引き出しが使っている URL は残す
		await page.evaluate(() => removePersonImage(0, 0));
		assert(!(await page.$('#personset-A-wrap .video-result')) && (await alive(page, both.drawer)), 'T186(2) ②から外れても、引き出しが使う URL は手放さない', null);
		// もう一度「OCR処理を開始する」: 引き出しを作り直すと前の URL を手放す（開いた引き出しがボタンに重なるので、blocks-146 と同じく直接押す）
		assert(await page.evaluate(() => !document.getElementById('process-stitch-btn').disabled), 'T186(2) 2回目の「OCR処理を開始する」が押せる', null);
		await page.evaluate(() => document.getElementById('process-stitch-btn').click());
		await page.waitForFunction((old) => !stitchInProgress && !busyBtnId && (document.querySelector('#stitch-result-content img') || {}).getAttribute && document.querySelector('#stitch-result-content img').getAttribute('src') !== old, both.drawer, { timeout: 60000 });
		const d2 = await page.evaluate(() => document.querySelector('#stitch-result-content img').getAttribute('src'));
		assert(d2 && d2.startsWith('blob:') && !(await alive(page, both.drawer)) && (await alive(page, d2)), 'T186(2) 引き出しを作り直すと前の URL を手放す', { old: both.drawer, now: d2 });
		assert(await page.evaluate(() => stitchPngUrls.size === document.querySelectorAll('#stitch-result-content img').length), 'T186(2) 持っている URL は画面の結合画像の数だけ', null);
		assert(jsErrors(errors).length === 0, 'T186(2) コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T186(3) UmaExam の静止画の「OCR処理＋画像結合」: 親A・親B の結合画像は Blob の URL・中身は今の作りと同じ・コメントのコピーのボタンは今のまま', async () => {
		const sp = await open({ w: 1280, h: 900 });
		const { page, errors } = sp;
		const names = imgNames();
		await addImages(page, 0, names.slice(0, 2));
		await addImages(page, 3, names.slice(2, 4));
		await page.evaluate(STUB_OCR);
		await page.click('#process-stitch-btn');
		await waitStitched(page);
		const r = await page.evaluate(async () => {
			const hex = async (buf) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('');
			const imgs = [...document.querySelectorAll('#stitch-result-content img')];
			const out = [];
			for (let k = 0; k < imgs.length; k++) {
				const u = imgs[k].getAttribute('src');
				const c = window.__canvases[k];
				const d = c.toDataURL('image/png');
				const bin = atob(d.slice(d.indexOf(',') + 1));
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
				out.push({ blob: u.startsWith('blob:'), same: (await hex(bytes.buffer)) === (await hex(await (await fetch(u)).arrayBuffer())), dl: imgs[k].closest('.rounded-xl').querySelector('a.uma-btn').getAttribute('href') === u });
			}
			return { out, copy: [...document.querySelectorAll('#stitch-result-content button.uma-btn--secondary:not(.stitch-set-btn)')].map((b) => b.textContent), box: !!document.querySelector('.video-result'), n: stitchPngUrls.size };
		});
		assert(r.out.length === 2 && r.out.every((x) => x.blob && x.same && x.dl), 'T186(3) 親A・親B の2枚とも Blob の URL・保存のリンクも同じ URL・PNG のバイトは今の作りと同じ', r);
		assert(!r.box && r.n === 2, 'T186(3) 静止画では②に結合画像を出さない（今のまま）・持っている URL は2つ', r);
		assert(r.copy.length >= 2 && r.copy.every((t) => /のコメントをコピー$/.test(t)), 'T186(3) 「〜のコメントをコピー」のボタンは今のまま', r.copy);
		assert(jsErrors(errors).length === 0, 'T186(3) コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T186(4) UmaExam の保存: スマホは共有のシートに手元の Blob（中身は表示の画像と同じ・名前は今と同じ）・PC は今の名前でダウンロード', async () => {
		const sp = await open({ fakeNav: true });
		const { page, errors } = sp;
		const downloads = [];
		page.on('download', (d) => downloads.push(d.suggestedFilename()));
		const sel = await page.evaluate(async () => {
			const host = document.createElement('div');
			host.id = 't186-host';
			host.style.cssText = 'position:fixed;left:0;top:0;width:360px;z-index:2147483000;background:#fff';
			document.body.appendChild(host);
			const c = document.createElement('canvas');
			c.width = 40; c.height = 30;
			const g = c.getContext('2d');
			g.fillStyle = '#3a6'; g.fillRect(0, 0, 40, 30);
			c._personMeta = []; c._stitchWarnings = [];
			await stitchPngReady(c);   // 本物の流れと同じく、PNG を作ってから出す
			appendStitchResultBlock(host, PERSON_SETS[0], c);
			return '#t186-host a[download]';
		});
		const expectName = () => page.evaluate(() => stitchFormatSaveName(stitchTodayStamp(), stitchPeekSaveSeq(), currentStitchSaveName()) + '.png');
		const href = await page.evaluate((s) => document.querySelector(s).getAttribute('href'), sel);
		assert(href.startsWith('blob:'), 'T186(4) 保存のリンクは Blob の object URL', href.slice(0, 20));
		// iPhone
		await page.evaluate((ua) => { window.__dev = { ua, platform: 'iPhone', touch: 5 }; window.__shareCalls = []; }, UA_IPHONE);
		const want1 = await expectName();
		await page.click(sel);
		await page.waitForTimeout(450);
		const info = await page.evaluate(async (s) => {
			const calls = window.__shareCalls;
			if (calls.length !== 1) return { n: calls.length };
			const f = calls[0].files[0];
			const got = new Uint8Array(await f.arrayBuffer());
			const want = new Uint8Array(await (await fetch(document.querySelector(s).href)).arrayBuffer());
			return { n: 1, files: calls[0].files.length, name: f.name, type: f.type, len: got.length, same: got.length === want.length && got.every((b, i) => b === want[i]) };
		}, sel);
		assert(info.n === 1 && info.files === 1 && info.type === 'image/png' && info.same && info.len > 8, 'T186(4) iPhone: share が PNG のファイル1つで呼ばれ、中身は表示の画像と同じ', info);
		assert(info.name === want1 && downloads.length === 0, 'T186(4) iPhone: ファイル名は今と同じ・ダウンロードは起きない', { got: info.name, want: want1, downloads });
		// Windows（PC）
		await page.waitForTimeout(1050);   // 2度押しの間を空ける
		await page.evaluate((ua) => { window.__dev = { ua, platform: 'Win32', touch: 0 }; window.__shareCalls = []; }, UA_WINDOWS);
		const want2 = await expectName();
		await page.click(sel);
		await page.waitForTimeout(800);
		const n2 = await page.evaluate(() => window.__shareCalls.length);
		assert(n2 === 0 && downloads.length === 1 && downloads[0] === want2, 'T186(4) PC: share は呼ばれず、今と同じ名前でダウンロードされる', { n2, downloads, want: want2 });
		assert(jsErrors(errors).length === 0, 'T186(4) コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});
}
