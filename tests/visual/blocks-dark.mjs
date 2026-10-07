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

import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';
import { LIGHT_SCENES, captureScene } from './lib/light-shots.mjs';

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

	/* ---------- ライトは1ピクセルも変わらない（決定12） ----------
	   基準は output/dark-base/base/（.gitignore 済み。ダークの段1 の前の commit の作業ツリーから
	   lib/light-shots.mjs で撮ったもの）。基準が無い環境では比べられないので、落とさずに [--] と出す。
	   **ダークの段7 が済んで基準を撮り直す必要が無くなったら、この塊は外す**（ライトを意図して変える
	   別の作業が入った時点で、基準のほうが古くなるため）。 */
	await block('ダーク9 ライトは1ピクセルも変わらない（special・exam・Deck の 375px／1280px・引き出しを開いた場面）', async () => {
		const dir = path.join(REPO_ROOT, 'output', 'dark-base', 'base');
		if (!fs.existsSync(dir)) { console.log('[--] ダーク9: 基準（output/dark-base/base/）が無いので比べていない'); return; }
		const diff = [], missing = [];
		for (const s of LIGHT_SCENES) {
			const f = path.join(dir, s.name + '.png');
			if (!fs.existsSync(f)) { missing.push(s.name); continue; }
			const buf = await captureScene(browser, base, s, env.USER_DATA, 'light');
			if (!buf.equals(fs.readFileSync(f))) diff.push(s.name);
		}
		assert(missing.length === 0, 'ダーク9: 基準の PNG が全場面ぶん在る（' + LIGHT_SCENES.length + '場面）', missing);
		assert(diff.length === 0, 'ダーク9: ライトのフルページPNG が基準とバイト一致（' + (LIGHT_SCENES.length - missing.length) + '場面）', diff);
	});

	/* ---------- 段2: 共通の土台（css/tokens.css のダーク） ---------- */
	await block('ダーク5 tokens.css の色の変数は、すべてダークの値を持つ（持たないものは理由つきの一覧だけ）', async () => {
		const src = fs.readFileSync(path.join(REPO_ROOT, 'css/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
		const blockOf = (sel) => { const i = src.indexOf(sel + ' {'); if (i < 0) return ''; return src.slice(i, src.indexOf('\n}', i)); };
		const names = (s, onlyColor) => new Set([...s.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)]
			.filter((m) => !onlyColor || /^(#|rgba?\(|linear-gradient)/.test(m[2].trim())).map((m) => m[1]));
		const light = names(blockOf(':root'), true);
		const dark = names(blockOf(':root:where([data-theme="dark"])'), false);
		// ダークでも同じ値で読めるので、わざと持たせていないもの（理由）
		const KEEP = {
			'--uma-star': '★の橙は暗い面の上でも読める（面 #171d26 に対して 8 以上）',
			'--uma-mark-green-skill': '緑スキルの●は暗い面の上でも読める（emerald-500）',
			'--uma-table-head-key-bg': '濃い地（stone-700）に白文字の組で、ダークの中でもそのまま読める',
			'--uma-table-head-key-text': '上の地の上の白文字',
		};
		const missing = [...light].filter((n) => !dark.has(n) && !(n in KEEP));
		const stale = Object.keys(KEEP).filter((n) => !light.has(n) || dark.has(n));
		assert(light.size > 80 && dark.size > 80, 'ダーク5: ライトとダークの色の変数を読めた', { light: light.size, dark: dark.size });
		assert(missing.length === 0, 'ダーク5: ライトの色の変数でダークの値が無いものは0（理由つきの4つを除く）', missing);
		assert(stale.length === 0, 'ダーク5: 理由つきの一覧が古くなっていない（ライトに在り、ダークに無い）', stale);
		const lightAll = names(blockOf(':root'), false);  // 影など、値が色で始まらない変数も含める
		const extra = [...dark].filter((n) => !lightAll.has(n) && n !== '--uma-page-ground');
		assert(extra.length === 0, 'ダーク5: ダークにだけ在る変数は --uma-page-ground だけ（綴りの間違いで効いていない値が無い）', extra);
	});

	await block('ダーク6 スタイルガイド（css/styleguide.html）をダークで見たとき、文字のコントラスト比が足りる', async () => {
		const { ctx, page } = await openPage(browser, base, 'css/styleguide.html', { width: 1280, height: 900 });
		const lightScan = await page.evaluate(scanTextContrastInPage, null);
		console.log('     [参考] ライトのスタイルガイドの不足（直していない）: ' + (lightScan.bad.length ? formatContrast(lightScan.bad).join(' / ') : 'なし'));
		await page.click('[data-sg-theme="dark"]');
		await page.waitForTimeout(200);
		assert(await attr(page) === 'dark', 'ダーク6: スタイルガイドの「ダーク」で属性が付く');
		const r = await page.evaluate(scanTextContrastInPage, null);
		assert(r.checked > 40 && r.bad.length === 0, 'ダーク6: ダークのスタイルガイドの文字はすべて 4.5（大きい文字は 3.0）以上（' + r.checked + '件）', formatContrast(r.bad));
		assert(r.undecided.length === 0, 'ダーク6: 背景を決められない文字が無い', r.undecided);
		const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		assert(bg === 'rgb(23, 29, 38)', 'ダーク6: 地は面の色（#171d26）', bg);
		await page.click('[data-sg-theme="light"]');
		assert(await attr(page) === null, 'ダーク6: 「ライト」で属性が外れる');
		await ctx.close();
	});
}
