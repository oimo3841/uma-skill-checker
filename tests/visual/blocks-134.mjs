// T122（2026-11-07・Chat 419〜421）: 結合画像の保存をスマホでは共有のシートにする（js/stitch-share.js）の検査。
// run-smoke.mjs の末尾から register134() で呼ばれる（塊の見出しはすべて「T122」で始まる。`npm run test:visual -- --only=T122` で回せる）。
//
//  - 419: スマホ（iOS・iPadOS・Android）は navigator.share で PNG のファイル1つ。ダウンロードは起きない。
//         PC（Windows〔タッチ・share あり〕・Mac・Linux）は今のダウンロード。share は呼ばれない。canShare が false のスマホも今のダウンロード。
//  - 番号は1回押すごとに1つだけ進む（stitch.js の click の受け手を止めない）。
//  - 420: 知らせは足さない。閉じただけ（AbortError）のときは何も出さない。
// navigator の userAgent・platform・maxTouchPoints・share・canShare は検査の中で差し替える（実機の共有のシートは https の公開先でしか動かない）。
// 押すのは本物のマウスの click（pointerdown → click）。ダウンロードは Playwright の download の事象で数える。
import { reloadReady } from './lib/page-ready.mjs';

const UA = {
	iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
	ipad: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
	mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
	android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
	windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
	linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
// 名前 → 端末。shareOk はシートが出る側
const DEVICES = {
	iPhone: { ua: UA.iphone, platform: 'iPhone', touch: 5, shareOk: true },
	iPad: { ua: UA.ipad, platform: 'iPad', touch: 5, shareOk: true },
	'iPadOS（Mac の UA）': { ua: UA.mac, platform: 'MacIntel', touch: 5, shareOk: true },
	Android: { ua: UA.android, platform: 'Linux armv81', touch: 5, shareOk: true },
	'Windows（タッチ）': { ua: UA.windows, platform: 'Win32', touch: 10, shareOk: false },
	Mac: { ua: UA.mac, platform: 'MacIntel', touch: 0, shareOk: false },
	Linux: { ua: UA.linux, platform: 'Linux x86_64', touch: 0, shareOk: false },
};

/** ページの読み込みの前に入れる。window.__dev の値を navigator に見せ、share の呼ばれ方を残す。 */
function INSTALL_FAKE_NAVIGATOR() {
	window.__dev = {};
	window.__shareCalls = [];
	window.__canShareCalls = 0;
	const def = (k, get) => Object.defineProperty(navigator, k, { configurable: true, get });
	const realUa = navigator.userAgent, realPlatform = navigator.platform, realTouch = navigator.maxTouchPoints;
	def('userAgent', () => window.__dev.ua || realUa);
	def('platform', () => window.__dev.platform || realPlatform);
	def('maxTouchPoints', () => (window.__dev.touch === undefined ? realTouch : window.__dev.touch));
	def('canShare', () => (window.__dev.noCanShare ? undefined : (data) => { window.__canShareCalls++; return window.__dev.canShare !== false; }));
	def('share', () => (window.__dev.noShare ? undefined : (data) => {
		window.__shareCalls.push(data);
		if (window.__dev.shareThrows) throw new TypeError('sync');
		if (window.__dev.reject) { const e = new Error('x'); e.name = window.__dev.reject; return Promise.reject(e); }
		return Promise.resolve();
	}));
}

export async function register134(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

	const open = async (file) => {
		const sp = await openPage(browser, base, file, { width: 390, height: 844 }, EMPTY);
		await sp.page.addInitScript(INSTALL_FAKE_NAVIGATOR);
		await sp.page.evaluate(() => localStorage.setItem('umaSkillDeck:stepTab', '2'));
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		sp.downloads = [];
		sp.page.on('download', (d) => sp.downloads.push(d.suggestedFilename()));
		return sp;
	};
	/** 本物の appendStitchResultBlock で保存のリンクを作り、画面の上に置く。返すのは a の選択子 */
	const makeLink = (page) => page.evaluate(() => {
		document.getElementById('t122-host')?.remove();
		const host = document.createElement('div');
		host.id = 't122-host';
		host.style.cssText = 'position:fixed;left:0;top:0;width:360px;z-index:2147483000;background:#fff';
		document.body.appendChild(host);
		const c = document.createElement('canvas');
		c.width = 40; c.height = 30;
		const g = c.getContext('2d');
		g.fillStyle = '#c33'; g.fillRect(0, 0, 40, 30);
		c._personMeta = []; c._stitchWarnings = [];
		appendStitchResultBlock(host, PERSON_SETS[0], c);
		return '#t122-host a[download]';
	});
	const setDevice = (page, dev, extra = {}) => page.evaluate((d) => { window.__dev = d; window.__shareCalls = []; window.__canShareCalls = 0; }, { ...dev, ...extra });
	/** 次の押しの前の番号と、そのときの名前（stitch.js の組み立て） */
	const expectName = (page) => page.evaluate(() => {
		const seq = stitchPeekSaveSeq();
		return { seq, name: stitchFormatSaveName(stitchTodayStamp(), seq, currentStitchSaveName()) + '.png' };
	});
	const peek = (page) => page.evaluate(() => stitchPeekSaveSeq());
	const shareInfo = (page, sel) => page.evaluate(async (sel) => {
		const calls = window.__shareCalls;
		const out = { n: calls.length, canShare: window.__canShareCalls };
		if (!calls.length) return out;
		const d = calls[0];
		out.keys = Object.keys(d);
		out.files = d.files.length;
		const f = d.files[0];
		out.name = f.name;
		out.type = f.type;
		const got = new Uint8Array(await f.arrayBuffer());
		const a = document.querySelector(sel);
		const want = atob(a.href.slice(a.href.indexOf(',') + 1));
		out.sameBytes = got.length === want.length && got.every((b, i) => b === want.charCodeAt(i));
		out.len = got.length;
		return out;
	}, sel);
	// ダウンロードの事象は少し遅れて届く。起きないことを見るときの待ち
	const settle = (page) => page.waitForTimeout(450);
	// 2度押しの間（DOUBLE_PRESS_MS）を空ける
	const cool = (page) => page.waitForTimeout(1050);

	for (const file of ['special.html', 'exam.html']) {
		await block('T122 ' + file + ' 端末ごとの保存（スマホは共有のシート・PC は今のダウンロード）', async () => {
			const sp = await open(file);
			const { page, ctx, errors } = sp;
			const sel = await makeLink(page);
			for (const [label, dev] of Object.entries(DEVICES)) {
				await setDevice(page, dev);
				await cool(page);
				sp.downloads.length = 0;
				const before = await expectName(page);
				const text0 = await page.evaluate(() => document.body.innerText);
				await page.click(sel);
				await settle(page);
				const info = await shareInfo(page, sel);
				const after = await peek(page);
				const text1 = await page.evaluate(() => document.body.innerText);
				if (dev.shareOk) {
					assert(info.n === 1 && info.files === 1 && info.keys.join() === 'files' && info.type === 'image/png' && info.sameBytes && info.len > 8, `T122 ${file} ${label}: share が PNG のファイル1つで呼ばれ、中身はリンクの画像と同じ`, info);
					assert(info.name === before.name, `T122 ${file} ${label}: ファイル名は今のダウンロードと同じ`, { got: info.name, want: before.name });
					assert(sp.downloads.length === 0, `T122 ${file} ${label}: ダウンロードは起きない`, sp.downloads);
				} else {
					assert(info.n === 0 && info.canShare === 0, `T122 ${file} ${label}: share は呼ばれない`, info);
					assert(sp.downloads.length === 1 && sp.downloads[0] === before.name, `T122 ${file} ${label}: 今と同じ名前でダウンロードされる`, { got: sp.downloads, want: before.name });
				}
				assert(after === before.seq + 1, `T122 ${file} ${label}: 番号は1つだけ進む`, { before: before.seq, after });
				assert(text0 === text1, `T122 ${file} ${label}: 押しても画面の文は変わらない（知らせを足さない）`);
			}
			assert(jsErrors(errors).length === 0, `T122 ${file}: コンソールのエラーが無い`, errors.slice(0, 3));
			await ctx.close();
		});

		await block('T122 ' + file + ' シートが使えないスマホ・閉じた・断られた・2度押し・長押し', async () => {
			const sp = await open(file);
			const { page, ctx, errors } = sp;
			const sel = await makeLink(page);
			const phone = DEVICES.iPhone;
			const press = async (extra) => {
				await setDevice(page, phone, extra);
				await cool(page);
				sp.downloads.length = 0;
				const before = await expectName(page);
				await page.click(sel);
				await settle(page);
				return { before, info: await shareInfo(page, sel), after: await peek(page), dl: [...sp.downloads] };
			};
			// 共有のシートが使えないスマホは今のダウンロード
			for (const [label, extra, calls] of [
				['canShare が false', { canShare: false }, 0],
				['canShare が無い', { noCanShare: true }, 0],
				['share が無い', { noShare: true }, 0],
				['share がその場で例外', { shareThrows: true }, 1],
			]) {
				const r = await press(extra);
				assert(r.info.n === calls && r.dl.length === 1 && r.dl[0] === r.before.name, `T122 ${file} ${label}: 今と同じダウンロードになる`, r);
				assert(r.after === r.before.seq + 1, `T122 ${file} ${label}: 番号は1つだけ進む`, r);
			}
			// シートを閉じただけ（AbortError）は何も出さない。番号は進んだまま
			{
				const text0 = await page.evaluate(() => document.body.innerText);
				const r = await press({ reject: 'AbortError' });
				const text1 = await page.evaluate(() => document.body.innerText);
				assert(r.info.n === 1 && r.dl.length === 0, `T122 ${file} AbortError: ダウンロードに戻らない`, r);
				assert(r.after === r.before.seq + 1, `T122 ${file} AbortError: 番号は1つ進む（stitch.js の考え方のまま）`, r);
				assert(text0 === text1, `T122 ${file} AbortError: 画面の文は変わらない`);
			}
			// 断られた（押した操作から離れたなど）ときは今のダウンロードに戻る。番号はもう進まない
			{
				const r = await press({ reject: 'NotAllowedError' });
				assert(r.info.n === 1 && r.dl.length === 1 && r.dl[0] === r.before.name, `T122 ${file} NotAllowedError: 同じ名前のダウンロードに戻る`, r);
				assert(r.after === r.before.seq + 1, `T122 ${file} NotAllowedError: 番号は1つだけ進む`, r);
			}
			// すでにシートが開いている（InvalidStateError）は何も出さない
			{
				const r = await press({ reject: 'InvalidStateError' });
				assert(r.info.n === 1 && r.dl.length === 0, `T122 ${file} InvalidStateError: ダウンロードに戻らない`, r);
			}
			// 2度押し: シートは1回だけ
			{
				await setDevice(page, phone);
				await cool(page);
				sp.downloads.length = 0;
				await page.click(sel);
				await page.click(sel);
				await settle(page);
				const info = await shareInfo(page, sel);
				assert(info.n === 1 && sp.downloads.length === 0, `T122 ${file} 2度押し: シートは1回だけ・ダウンロードは起きない`, { info, dl: sp.downloads });
			}
			// 間を空ければ次の押しでまた出る
			{
				const r = await press({});
				assert(r.info.n === 1 && r.info.name === r.before.name, `T122 ${file} 続けて押す: 次の番号の名前でまた出る`, r);
			}
			// 長押しのメニュー（contextmenu）は click が飛ばないので今のまま: share を呼ばず、番号は stitch.js が進める
			{
				await setDevice(page, phone);
				const before = await peek(page);
				await page.dispatchEvent(sel, 'contextmenu');
				const info = await shareInfo(page, sel);
				const a = await page.evaluate((s) => { const el = document.querySelector(s); return { data: el.href.startsWith('data:image/png'), dl: el.download }; }, sel);
				assert(info.n === 0 && (await peek(page)) === before + 1 && a.data && /\.png$/.test(a.dl), `T122 ${file} 長押しのメニュー: share を呼ばず、リンクは今のまま`, { info, a });
			}
			assert(jsErrors(errors).length === 0, `T122 ${file}: コンソールのエラーが無い`, errors.slice(0, 3));
			await ctx.close();
		});
	}

	await block('T122 special.html ③のアイコンのボタンと引き出しの結合画像', async () => {
		const sp = await open('special.html');
		const { page, ctx, errors } = sp;
		await page.evaluate(() => selectStepTab(2));
		// ③: 本物の showVideoResult（アイコンのボタンに着替える）。動画のパネルが要るので動画モードにして作る
		await page.evaluate(() => { localStorage.setItem('uma-special-upload-mode', 'video'); });
		await reloadReady(page);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await page.evaluate(() => {
			selectStepTab(2);
			const c = document.createElement('canvas');
			c.width = 40; c.height = 30;
			c.getContext('2d').fillRect(0, 0, 40, 30);
			c._personMeta = []; c._stitchWarnings = [];
			showVideoResult(0, c);
		});
		const sel = '.video-result a.video-dl-btn';
		await page.locator(sel).first().scrollIntoViewIfNeeded();
		for (const [label, dev] of [['iPhone', DEVICES.iPhone], ['Windows（タッチ）', DEVICES['Windows（タッチ）']]]) {
			await setDevice(page, dev);
			await cool(page);
			sp.downloads.length = 0;
			const before = await expectName(page);
			const look0 = await page.evaluate((s) => { const a = document.querySelector(s); return [a.textContent, a.getAttribute('aria-label'), a.title, a.className].join('|'); }, sel);
			await page.click(sel);
			await settle(page);
			const info = await shareInfo(page, sel);
			const look1 = await page.evaluate((s) => { const a = document.querySelector(s); return [a.textContent, a.getAttribute('aria-label'), a.title, a.className].join('|'); }, sel);
			assert(look0 === '|PNGをダウンロード|PNGをダウンロード|video-dl-btn' && look1 === look0, `T122 ③ ${label}: ボタンの文（aria-label・title）は今のまま`, { look0, look1 });
			if (dev.shareOk) assert(info.n === 1 && info.name === before.name && sp.downloads.length === 0, `T122 ③ ${label}: 共有のシートで今の名前のファイルを渡す`, { info, want: before.name, dl: sp.downloads });
			else assert(info.n === 0 && sp.downloads.length === 1 && sp.downloads[0] === before.name, `T122 ③ ${label}: 今のダウンロード`, { info, want: before.name, dl: sp.downloads });
			assert((await peek(page)) === before.seq + 1, `T122 ③ ${label}: 番号は1つだけ進む`);
		}
		// 引き出しの結合画像: 置き場所（#stitch-result-content）に作った本物の塊。「PNGをダウンロード」は今の文のまま
		const drawer = await page.evaluate(() => {
			const box = document.getElementById('stitch-result-content');
			const c = document.createElement('canvas');
			c.width = 40; c.height = 30;
			c.getContext('2d').fillRect(0, 0, 40, 30);
			c._personMeta = []; c._stitchWarnings = [];
			box.textContent = '';
			appendStitchResultBlock(box, PERSON_SETS[0], c);
			const a = box.querySelector('a[download]');
			window.__dev = {};
			return { text: a.textContent, cls: a.className };
		});
		assert(drawer.text === 'PNGをダウンロード' && drawer.cls === 'uma-btn uma-btn--primary', 'T122 引き出し: ボタンの文と部品は今のまま', drawer);
		// 引き出しの押し下げは本物の click を要素へ送る（引き出しを開く手順はこの検査の話ではない）
		await setDevice(page, DEVICES.iPhone);
		await cool(page);
		const before = await expectName(page);
		await page.evaluate(() => document.querySelector('#stitch-result-content a[download]').click());
		await settle(page);
		const info = await shareInfo(page, '#stitch-result-content a[download]');
		assert(info.n === 1 && info.name === before.name, 'T122 引き出し iPhone: 共有のシートで今の名前のファイルを渡す', { info, want: before.name });
		assert(jsErrors(errors).length === 0, 'T122 ③: コンソールのエラーが無い', errors.slice(0, 3));
		await ctx.close();
	});

	await block('T122 OS の見分け（pointer やタッチで分けない）', async () => {
		const sp = await open('exam.html');
		const { page, ctx } = sp;
		const table = await page.evaluate((list) => list.map(([k, d]) => [k, UmaStitchShare.isMobileOs({ userAgent: d.ua, platform: d.platform, maxTouchPoints: d.touch })]), Object.entries(DEVICES));
		for (const [k, v] of table) assert(v === DEVICES[k].shareOk, `T122 isMobileOs: ${k} は ${DEVICES[k].shareOk}`, v);
		// Windows はタッチ点がいくつあっても・Mac の UA でも platform が Win32 ならスマホにしない
		const edge = await page.evaluate((ua) => [UmaStitchShare.isMobileOs({ userAgent: ua, platform: 'Win32', maxTouchPoints: 256 }), UmaStitchShare.isMobileOs({ userAgent: '', platform: '', maxTouchPoints: 0 })], UA.windows);
		assert(edge[0] === false && edge[1] === false, 'T122 isMobileOs: Windows のタッチ256点・何も分からないときは PC の扱い', edge);
		const version = await page.evaluate(() => UmaStitchShare.version);
		assert(/^\d{4}-\d{2}-\d{2}[a-z]$/.test(version), 'T122 部品の版が読める', version);
		await ctx.close();
	});
}
