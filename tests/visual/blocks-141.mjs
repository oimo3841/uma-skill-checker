// T133（2026-11-08・決定 488・489）: iPhone の再読み込みの対策（UmaStar が抱えるメモリを減らす）の検査。
// run-smoke.mjs の末尾から register141() で呼ばれる（塊の見出しはすべて「T133」で始まる。`npm run test:visual -- --only=T133` で回せる）。
//
//  - A1: ③の枠のサムネイルと動画のタイルは、File ごとに1回だけ作った幅 336px の縮小画像（元の File は persons[].files に今のまま）。
//  - A4: 描き直しでは同じ URL を使い回し、枠から消した画像の URL は手放す。
//  - A2: 結合画像は PNG の Blob の object URL。動画モードでは③と引き出しが同じ URL を使い、作り直したら古い URL を手放す。
//        保存は今のまま（スマホは共有のシートに手元の Blob を渡す・PC は今の名前でダウンロード）。
// 手放したかは、その URL を fetch して読めなくなったかで見る。動画は blocks-80 の作り物（SYNTH）。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH } from './blocks-80.mjs';
import { pickVideo } from './lib/video-entry.mjs';

const OFF = { marker: false, roster: false, factor: false, sp: false, table: false, title: true, cols: 3 };
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** ページの読み込みの前に入れる。window.__dev の値を navigator に見せ、share の呼ばれ方を残す（blocks-134 と同じ考え方の小さい版） */
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

export async function register141(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const IMG_DIR = '2026-09-15_5';
	const imgNames = () => fs.readdirSync(path.join(REPO_ROOT, 'test-images', IMG_DIR)).filter((n) => /\.png$/i.test(n)).sort();

	const open = async ({ w = 390, h = 844, mode = 'image', fakeNav = false } = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		if (fakeNav) await sp.page.addInitScript(FAKE_NAVIGATOR);
		await sp.page.evaluate(({ mode, parts }) => {
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			localStorage.setItem('uma-special-upload-mode', mode);
			localStorage.setItem('uma-special-stitch-parts', JSON.stringify(parts));
		}, { mode, parts: OFF });
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
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

	await block('T133(1) 静止画のサムネイル: 幅 336px の縮小画像・枠の大きさは今のまま（高さ 56px）・描き直しでは同じ URL・消した画像の URL は手放す・元の File は持つ', async () => {
		const sp = await open();
		const { page, errors } = sp;
		const names = imgNames();
		assert(names.length >= 3, 'T133(1) 前提: test-images の ' + IMG_DIR + ' に画像が3枚以上', names.length);
		await addImages(page, 0, names.slice(0, 2));
		const t0 = await thumbs(page, 0);
		assert(t0.length === 2 && t0.every((t) => t.src.startsWith('blob:') && t.nw === 336 && t.nh > 336), 'T133(1) サムネイルは幅 336px の縮小画像（元は 1179px など）', t0);
		assert(t0.every((t) => t.h === 56), 'T133(1) 枠の中の高さは今のまま 56px（h-14）', t0.map((t) => t.h));
		const orig = await page.evaluate(() => persons[0].files.map((f) => f.size));
		assert(orig.length === 2 && orig.every((s) => s > 100000), 'T133(1) 元の File は persons[].files に今のまま持つ', orig);
		// 足すと描き直す: 前の2枚は同じ URL のまま
		await addImages(page, 0, names.slice(2, 3));
		const t1 = await thumbs(page, 0);
		assert(t1.length === 3 && t1[0].src === t0[0].src && t1[1].src === t0[1].src, 'T133(1) 描き直しでは同じ URL を使い回す', t1.map((t) => t.src));
		// 消すと、その画像の URL を手放す（残る画像の URL は読める）
		await page.evaluate(() => removePersonImage(0, 0));
		const t2 = await thumbs(page, 0);
		assert(t2.length === 2 && !(await alive(page, t0[0].src)) && (await alive(page, t2[0].src)), 'T133(1) 消した画像の URL は手放す・残る画像の URL は読める', { removed: t0[0].src, left: t2.map((t) => t.src) });
		// セットをクリアすると全部手放す
		await page.evaluate(() => clearPersonSet(0));
		const gone = await Promise.all(t2.map((t) => alive(page, t.src)));
		assert(gone.every((x) => x === false), 'T133(1) 「セットをクリア」で残りの URL も手放す', gone);
		assert(jsErrors(errors).length === 0, 'T133(1) コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T133(2) 動画: タイルは縮小画像・結合画像は Blob の URL で③と引き出しが同じ URL・作り直すと古い URL を手放す', async () => {
		const sp = await open({ w: 1280, h: 900, mode: 'video' });
		const { page, errors } = sp;
		await page.addScriptTag({ content: SYNTH });
		await pickVideo(page);
		const res = await page.evaluate(() => Promise.race([onVideoChosen(__synth.make({}).source), new Promise((r) => setTimeout(() => r('timeout'), 90000))]));
		assert(res && res.ok === true && res.stitched === true, 'T133(2) 取り込みと自動の結合ができた', res);
		await page.evaluate(() => [0, 1, 2].forEach((i) => { if (persons[i].video) persons[i].video.expanded = false; renderPersonImageList(i); }));
		const tiles = [];
		for (const i of [0, 1, 2]) tiles.push(...(await thumbs(page, i)).filter((t) => t.tile));
		const frameW = await page.evaluate(() => new Promise((r) => { const im = new Image(); im.onload = () => r(im.naturalWidth); im.src = URL.createObjectURL(persons[0].files[0]); }));
		assert(tiles.length === 3 && tiles.every((t) => t.src.startsWith('blob:') && t.nw === Math.min(336, frameW)), 'T133(2) 3人のタイルは幅 336px（動画の画の幅 ' + frameW + 'px が 336 以下ならそのまま）', tiles);
		const s3 = await page.evaluate(() => document.querySelector('#personset-A-wrap .video-result img').getAttribute('src'));
		assert(s3 && s3.startsWith('blob:'), 'T133(2) ③の結合画像は Blob の object URL（data URL ではない）', s3 && s3.slice(0, 20));
		// 動画モードの「OCR処理を開始する」と同じ結合: 引き出しと③が同じ URL
		await page.evaluate(async () => { stitchSnapshot = captureStitchSnapshot(); stitchSnapshot.results = [null, null, null, null, null, null]; await runImageStitching({ keepClosed: true, quiet: true, withMarks: true }); });
		const both = await page.evaluate(() => ({
			drawer: document.querySelector('#stitch-result-content img').getAttribute('src'),
			step3: document.querySelector('#personset-A-wrap .video-result img').getAttribute('src'),
			dl: [...document.querySelectorAll('#stitch-result-content a.uma-btn, #personset-A-wrap .video-dl-btn')].map((a) => a.getAttribute('href')),
			dataImgs: [...document.querySelectorAll('img')].filter((im) => (im.getAttribute('src') || '').startsWith('data:image/png')).length
		}));
		assert(both.drawer && both.drawer === both.step3 && both.dl.length === 2 && both.dl.every((h) => h === both.drawer), 'T133(2) 引き出しと③の結合画像・保存のリンクは同じ1つの URL', both);
		assert(both.dataImgs === 0, 'T133(2) PNG の data URL の img は無い', both.dataImgs);
		assert(!(await alive(page, s3)) && (await alive(page, both.drawer)), 'T133(2) 作り直すと③の前の URL は手放し、今の URL は読める', { old: s3, now: both.drawer });
		assert(await page.evaluate(() => stitchPngUrls.size === 1), 'T133(2) 持っている結合画像の URL は1つ', null);
		// 枠の画像を消すと③の画像は外れる。引き出しが使っている URL は残す
		await page.evaluate(() => removePersonImage(0, 0));
		assert(await alive(page, both.drawer), 'T133(2) ③から外れても、引き出しが使う URL は手放さない', null);
		// 引き出しの作り直し（画像を更新と同じ流れ）で、前の URL を手放す
		await page.evaluate(async () => { await runImageStitching({ keepClosed: true, quiet: true }); });
		const d2 = await page.evaluate(() => document.querySelector('#stitch-result-content img').getAttribute('src'));
		assert(d2 && d2 !== both.drawer && !(await alive(page, both.drawer)) && (await alive(page, d2)), 'T133(2) 引き出しを作り直すと前の URL を手放す', { old: both.drawer, now: d2 });
		assert(jsErrors(errors).length === 0, 'T133(2) コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T133(3) 保存: スマホは共有のシートに手元の Blob（中身は表示の画像と同じ・名前は今と同じ）・PC は今の名前でダウンロード', async () => {
		const sp = await open({ fakeNav: true });
		const { page, errors } = sp;
		const downloads = [];
		page.on('download', (d) => downloads.push(d.suggestedFilename()));
		const sel = await page.evaluate(async () => {
			const host = document.createElement('div');
			host.id = 't133-host';
			host.style.cssText = 'position:fixed;left:0;top:0;width:360px;z-index:2147483000;background:#fff';
			document.body.appendChild(host);
			const c = document.createElement('canvas');
			c.width = 40; c.height = 30;
			const g = c.getContext('2d');
			g.fillStyle = '#3a6'; g.fillRect(0, 0, 40, 30);
			c._personMeta = []; c._stitchWarnings = [];
			await stitchPngReady(c);   // 本物の流れと同じく、PNG を作ってから出す
			appendStitchResultBlock(host, PERSON_SETS[0], c);
			return '#t133-host a[download]';
		});
		const expectName = () => page.evaluate(() => stitchFormatSaveName(stitchTodayStamp(), stitchPeekSaveSeq(), currentStitchSaveName()) + '.png');
		const href = await page.evaluate((s) => document.querySelector(s).getAttribute('href'), sel);
		assert(href.startsWith('blob:'), 'T133(3) 保存のリンクは Blob の object URL', href.slice(0, 20));
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
		assert(info.n === 1 && info.files === 1 && info.type === 'image/png' && info.same && info.len > 8, 'T133(3) iPhone: share が PNG のファイル1つで呼ばれ、中身は表示の画像と同じ', info);
		assert(info.name === want1 && downloads.length === 0, 'T133(3) iPhone: ファイル名は今と同じ・ダウンロードは起きない', { got: info.name, want: want1, downloads });
		// Windows（PC）
		await page.waitForTimeout(1050);   // 2度押しの間を空ける
		await page.evaluate((ua) => { window.__dev = { ua, platform: 'Win32', touch: 0 }; window.__shareCalls = []; }, UA_WINDOWS);
		const want2 = await expectName();
		await page.click(sel);
		await page.waitForTimeout(800);
		const n2 = await page.evaluate(() => window.__shareCalls.length);
		assert(n2 === 0 && downloads.length === 1 && downloads[0] === want2, 'T133(3) PC: share は呼ばれず、今と同じ名前でダウンロードされる', { n2, downloads, want: want2 });
		assert(jsErrors(errors).length === 0, 'T133(3) コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});
}
