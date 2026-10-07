// ダークモード（C-134・2026-10-07）の検査。run-smoke.mjs の末尾から registerDark() で呼ばれる
// （塊の見出しはすべて「ダーク」で始まる。`npm run test:visual -- --only=ダーク` で回せる）。
//
// 設計は dark-mode-step0.md の §8-1。ここで見るのは:
//   ダーク1 保存と復元（鍵 uma-tools-theme・自動は鍵なし・壊れた値は自動・localStorage が投げても落ちない・選ぶまで書かない）
//   ダーク2 ちらつかない（data-theme は body より前に付く・theme.js は head の同期スクリプト）
//   ダーク3 OS の設定への追従は止めてある（決定13。段7 まで）・引き出しの Deck は保存値に追従する
//   ダーク4 書き出しに鍵が紛れない
// 段2 以降で、コントラスト比・意味を持つ色の見分け・canvas のライト固定を足す。
// 切り替えの部品は段7 まで画面に無いので、ここでは window.UmaTheme.set() と localStorage で選ぶ。

export async function registerDark(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const KEY = 'uma-tools-theme';
	const THEME_VER = /THEME_JS_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(REPO_ROOT, 'js/theme.js'), 'utf8'))[1];
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const attr = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
	const stored = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
	const closeNotice = async (page) => { for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]'); };

	await block('ダーク1 保存と復元（鍵は uma-tools-theme・自動は鍵なし・壊れた値は自動のまま書き換えない・選ぶまで書かない）', async () => {
		const { ctx, page, errors } = await openPage(browser, base, 'special.html', { width: 375, height: 812 });
		await closeNotice(page);
		assert(await page.evaluate(() => window.UmaTheme && window.UmaTheme.version) === THEME_VER, 'ダーク1: window.UmaTheme があり、版が THEME_JS_VERSION と同じ', THEME_VER);
		assert(await attr(page) === null && await stored(page) === null, 'ダーク1: 何も選んでいないときは属性を付けず、鍵も無い');
		// 画面を少し操作しても鍵を書かない（選ぶまで何も書かない）
		for (const id of ['step-tab-0', 'step-tab-1', 'step-tab-2']) { await page.click('#' + id).catch(() => {}); await page.waitForTimeout(150); }
		assert(await stored(page) === null, 'ダーク1: タブを切り替えても鍵は書かれない');

		await page.evaluate(() => window.UmaTheme.set('dark'));
		assert(await attr(page) === 'dark' && await stored(page) === 'dark', 'ダーク1: ダークを選ぶと属性 dark・鍵 dark');
		await page.reload({ waitUntil: 'networkidle' });
		assert(await attr(page) === 'dark', 'ダーク1: 読み込み直してもダークのまま');
		await page.evaluate(() => window.UmaTheme.set('light'));
		assert(await attr(page) === 'light' && await stored(page) === 'light', 'ダーク1: ライトを選ぶと属性 light・鍵 light');
		await page.reload({ waitUntil: 'networkidle' });
		assert(await attr(page) === 'light' && await page.evaluate(() => window.UmaTheme.get()) === 'light', 'ダーク1: 読み込み直してもライトのまま');
		await page.evaluate(() => window.UmaTheme.set('auto'));
		assert(await attr(page) === null && await stored(page) === null, 'ダーク1: 自動を選ぶと鍵を消す（段7 までは属性も付けない）');

		await page.evaluate((k) => localStorage.setItem(k, 'purple'), KEY);
		await page.reload({ waitUntil: 'networkidle' });
		assert(await attr(page) === null && await stored(page) === 'purple' && await page.evaluate(() => window.UmaTheme.get()) === 'auto',
			'ダーク1: 壊れた値は自動として扱い、書き換えない', { attr: await attr(page), stored: await stored(page) });
		await page.evaluate((k) => localStorage.removeItem(k), KEY);
		assert(jsErrors(errors).length === 0, 'ダーク1: コンソールのエラー0', jsErrors(errors));
		await ctx.close();

		// localStorage が投げる環境（プライベートモードなど）でも落ちない
		for (const file of ['special.html', 'exam.html', 'uma-skill-deck.html']) {
			const c2 = await browser.newContext({ viewport: { width: 375, height: 812 } });
			await c2.addInitScript((k) => {
				const g = Storage.prototype.getItem, s = Storage.prototype.setItem, r = Storage.prototype.removeItem;
				Storage.prototype.getItem = function (key) { if (key === k) throw new Error('blocked'); return g.call(this, key); };
				Storage.prototype.setItem = function (key, v) { if (key === k) throw new Error('blocked'); return s.call(this, key, v); };
				Storage.prototype.removeItem = function (key) { if (key === k) throw new Error('blocked'); return r.call(this, key); };
			}, KEY);
			const p2 = await c2.newPage();
			const errs = [];
			p2.on('pageerror', (e) => errs.push(String(e)));
			await p2.goto(base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
			const r = await p2.evaluate(() => { const a = window.UmaTheme.get(); const t = window.UmaTheme.set('dark'); return { a, t, attr: document.documentElement.getAttribute('data-theme') }; });
			assert(errs.length === 0 && r.a === 'auto' && r.t === 'dark' && r.attr === 'dark',
				'ダーク1: ' + file + ' は localStorage が投げても落ちない（自動として読み、選べばその画面には当てる）', { r, errs });
			await c2.close();
		}
	});

	await block('ダーク2 ちらつかない（data-theme は body より前に付く・theme.js は head の先頭近くの同期スクリプト）', async () => {
		for (const file of ['special.html', 'exam.html', 'uma-skill-deck.html']) {
			const src = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
			const headSrc = src.slice(0, src.indexOf('</head>'));
			const tag = /<script[^>]*src="js\/theme\.js\?v=[^"]+"[^>]*><\/script>/.exec(headSrc);
			const firstCss = headSrc.indexOf('<link rel="stylesheet"');
			assert(!!tag && !/\b(defer|async|type="module")\b/.test(tag[0]) && tag.index < firstCss,
				'ダーク2: ' + file + ' の theme.js は <head> の中で、共通CSS より前・defer／async なし', tag && tag[0]);
			const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
			await ctx.addInitScript((k) => {
				try { localStorage.setItem(k, 'dark'); } catch (e) {}
				window.__themeLog = [];
				// 初期化の時点では <html> もまだ無いので、document ごと見張る
				new MutationObserver((ms) => { for (const m of ms) if (m.attributeName === 'data-theme' && m.target === document.documentElement) window.__themeLog.push({ v: document.documentElement.getAttribute('data-theme'), body: !!document.body }); })
					.observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] });
			}, KEY);
			const page = await ctx.newPage();
			await page.goto(base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
			const log = await page.evaluate(() => window.__themeLog);
			assert(log.length >= 1 && log[0].v === 'dark' && log[0].body === false && log.every((x) => x.v === 'dark'),
				'ダーク2: ' + file + ' はダークの属性を body ができる前に付け、そのあと付け替えない', log);
			await ctx.close();
		}
	});

	await block('ダーク3 OS の設定への追従は止めてある（決定13）・引き出しの Deck は保存値に追従する', async () => {
		for (const file of ['special.html', 'exam.html', 'uma-skill-deck.html']) {
			const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: 'dark' });
			const page = await ctx.newPage();
			await page.goto(base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
			const r = await page.evaluate(() => ({ os: matchMedia('(prefers-color-scheme: dark)').matches, attr: document.documentElement.getAttribute('data-theme'), follows: window.UmaTheme.followsOs }));
			assert(r.os === true && r.attr === null && r.follows === false, 'ダーク3: ' + file + ' は OS がダークでも、何も選んでいなければ属性を付けない（ライトのまま）', r);
			await page.emulateMedia({ colorScheme: 'light' });
			await page.emulateMedia({ colorScheme: 'dark' });
			await page.waitForTimeout(100);
			assert(await attr(page) === null, 'ダーク3: ' + file + ' は OS の設定が変わっても属性を付けない');
			await ctx.close();
		}
		// 引き出しの Deck（iframe）: 親で選ぶと storage イベントで追従する
		const { ctx, page } = await openPage(browser, base, 'special.html', { width: 375, height: 812 });
		await closeNotice(page);
		await page.evaluate(() => fabGoTo('deck'));
		await page.waitForTimeout(1500);
		const frameAttr = () => page.evaluate(() => document.getElementById('deck-drawer-frame').contentDocument.documentElement.getAttribute('data-theme'));
		assert(await frameAttr() === null, 'ダーク3: 引き出しの Deck も、何も選んでいなければ属性を付けない');
		await page.evaluate(() => window.UmaTheme.set('dark'));
		await page.waitForTimeout(300);
		assert(await frameAttr() === 'dark', 'ダーク3: 親でダークを選ぶと、開いている引き出しの Deck もダークになる');
		await page.evaluate(() => window.UmaTheme.set('auto'));
		await page.waitForTimeout(300);
		assert(await frameAttr() === null, 'ダーク3: 親で自動に戻すと、引き出しの Deck も属性が外れる');
		await ctx.close();
	});

	await block('ダーク4 書き出しに画面の色の鍵が紛れない', async () => {
		const { ctx, page } = await openPage(browser, base, 'uma-skill-deck.html');
		await page.evaluate(() => window.UmaTheme.set('dark'));
		await page.click('#tab-btn-data');
		await page.waitForTimeout(300);
		await page.click('button[onclick="exportData()"]');
		await page.waitForTimeout(300);
		const out = await page.inputValue('#export-textarea');
		assert(out.includes('templates') && !out.includes(KEY) && !/"theme"|data-theme/.test(out), 'ダーク4: ダークを選んでいても、書き出しに uma-tools-theme が入らない', out.length);
		await page.evaluate(() => window.UmaTheme.set('auto'));
		await ctx.close();
	});
}
