// ダークモード（C-134・2026-10-07）の検査。run-smoke.mjs の末尾から registerDark() で呼ばれる
// （塊の見出しはすべて「ダーク」で始まる。`npm run test:visual -- --only=ダーク` で回せる）。
//
// 設計は dark-mode-step0.md の §8-1。ここで見るのは:
//   ダーク1 保存と復元（鍵 uma-tools-theme・自動は鍵なし・壊れた値は自動・localStorage が投げても落ちない・選ぶまで書かない）
//   ダーク2 ちらつかない（data-theme は body より前に付く・theme.js は head の同期スクリプト）
//   ダーク3 自動のときは OS の設定に追従する（段7・C-135 で決定13 を解いた）・固定のときは追従しない・引き出しの Deck も同じ
//   ダーク13 「？」の小窓の「画面の色」の切り替え（3つの選択肢・保存と復元・1行に収まる。C-135）
//   ダーク4 書き出しに鍵が紛れない
// 段2 以降で、コントラスト比・意味を持つ色の見分け・canvas のライト固定を足す。
// ダーク1〜12 は window.UmaTheme.set() と localStorage で選ぶ（切り替えの部品そのものはダーク13 が見る）。
// Playwright の既定の OS の設定はライトなので、「自動」は data-theme="light" になる。

import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';
import { deltaE } from './lib/pixels.mjs';

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
		assert(await attr(page) === 'light' && await stored(page) === null, 'ダーク1: 何も選んでいないときは OS の設定（ライト）の属性を付け、鍵は無い');
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
		assert(await attr(page) === 'light' && await stored(page) === null, 'ダーク1: 自動を選ぶと鍵を消し、OS の設定（ライト）に戻る');

		await page.evaluate((k) => localStorage.setItem(k, 'purple'), KEY);
		await page.reload({ waitUntil: 'networkidle' });
		assert(await attr(page) === 'light' && await stored(page) === 'purple' && await page.evaluate(() => window.UmaTheme.get()) === 'auto',
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

	await block('ダーク3 自動のときは OS の設定に追従する・ライト／ダークの固定のときは追従しない・引き出しの Deck も同じ（C-135）', async () => {
		for (const file of ['special.html', 'exam.html', 'uma-skill-deck.html']) {
			const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: 'dark' });
			const page = await ctx.newPage();
			await page.goto(base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
			const r = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), follows: window.UmaTheme.followsOs, key: localStorage.getItem('uma-tools-theme') }));
			assert(r.attr === 'dark' && r.follows === true && r.key === null, 'ダーク3: ' + file + ' は何も選んでいなければ OS の設定（ダーク）に従う', r);
			await page.emulateMedia({ colorScheme: 'light' });
			await page.waitForTimeout(100);
			assert(await attr(page) === 'light', 'ダーク3: ' + file + ' は自動のとき、OS をライトにすると属性が light に変わる');
			await page.evaluate(() => window.UmaTheme.set('dark'));
			await page.emulateMedia({ colorScheme: 'dark' }); await page.emulateMedia({ colorScheme: 'light' });
			await page.waitForTimeout(100);
			assert(await attr(page) === 'dark', 'ダーク3: ' + file + ' はダークに固定すると、OS がライトでもダークのまま');
			await page.evaluate(() => window.UmaTheme.set('light'));
			await page.emulateMedia({ colorScheme: 'dark' });
			await page.waitForTimeout(100);
			assert(await attr(page) === 'light', 'ダーク3: ' + file + ' はライトに固定すると、OS がダークでもライトのまま');
			await page.evaluate(() => window.UmaTheme.set('auto'));
			assert(await attr(page) === 'dark', 'ダーク3: ' + file + ' は自動に戻すと、すぐ OS の設定（ダーク）になる');
			await page.reload({ waitUntil: 'networkidle' });
			assert(await page.evaluate(() => document.documentElement.hasAttribute('data-theme')), 'ダーク3: ' + file + ' は属性が無い状態を作らない（常に light か dark）');
			await ctx.close();
		}
		// 引き出しの Deck（iframe）: 親で選ぶと storage イベントで、OS の設定は自分の change で追従する
		const { ctx, page } = await openPage(browser, base, 'special.html', { width: 375, height: 812 });
		await closeNotice(page);
		await page.evaluate(() => fabGoTo('deck'));
		await page.waitForTimeout(1500);
		const frameAttr = () => page.evaluate(() => document.getElementById('deck-drawer-frame').contentDocument.documentElement.getAttribute('data-theme'));
		assert(await frameAttr() === 'light', 'ダーク3: 引き出しの Deck も、何も選んでいなければ OS の設定（ライト）');
		await page.evaluate(() => window.UmaTheme.set('dark'));
		await page.waitForTimeout(300);
		assert(await frameAttr() === 'dark', 'ダーク3: 親でダークを選ぶと、開いている引き出しの Deck もダークになる');
		await page.evaluate(() => window.UmaTheme.set('auto'));
		await page.waitForTimeout(300);
		assert(await frameAttr() === 'light', 'ダーク3: 親で自動に戻すと、引き出しの Deck も OS の設定（ライト）に戻る');
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.waitForTimeout(300);
		assert(await attr(page) === 'dark' && await frameAttr() === 'dark', 'ダーク3: 自動のとき OS をダークにすると、親も引き出しの Deck もダークになる');
		await page.emulateMedia({ colorScheme: 'light' });
		await page.evaluate(() => window.UmaTheme.set('light'));
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.waitForTimeout(300);
		assert(await attr(page) === 'light' && await frameAttr() === 'light', 'ダーク3: ライトに固定すると、OS をダークにしても親も引き出しの Deck もライトのまま');
		await page.evaluate(() => window.UmaTheme.set('auto'));
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

	/* 【INTENTIONALLY_REMOVED・2026-10-08（C-135・ダークモードの段7）】ここには塊「ダーク9 ライトは1ピクセルも変わらない」があった。
	   special・exam・Deck の 375px／1280px（引き出しを開いた場面・exam の結果の表を含む15場面）のライトのフルページPNG を、
	   output/dark-base/base/ の基準とバイト比較していた（決定12）。段1〜7 のどの commit でも一致を確かめた（段7 は bbceb44）。
	   **外した理由**: ダークモードの作業はこれで終わり、以後ライトを意図して変える作業が入ると、基準のほうが古くなって
	   この塊が落ち続けるため（C-134 の仮に決めた点10）。基準の撮り方は tests/visual/lib/light-shots.mjs に残してある
	   （同じ確かめ方が要るときは、変更の前の commit の作業ツリーから撮って比べる）。
	   **失っていない検査**: ライトの見た目そのものは、他の塊が色の値（rgb の期待値）と画素で見ている。 */

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
			'--uma-text-on-color': '色の付いた地の上の白い文字。ダークでも白',
			'--uma-toast-bg': 'トーストはダークでも暗いまま（決定7）',
		};
		const missing = [...light].filter((n) => !dark.has(n) && !(n in KEEP));
		const stale = Object.keys(KEEP).filter((n) => !light.has(n) || dark.has(n));
		assert(light.size > 80 && dark.size > 80, 'ダーク5: ライトとダークの色の変数を読めた', { light: light.size, dark: dark.size });
		assert(missing.length === 0, 'ダーク5: ライトの色の変数でダークの値が無いものは0（理由つきの4つを除く）', missing);
		assert(stale.length === 0, 'ダーク5: 理由つきの一覧が古くなっていない（ライトに在り、ダークに無い）', stale);
		const lightAll = names(blockOf(':root'), false);  // 影など、値が色で始まらない変数も含める
		const extra = [...dark].filter((n) => !lightAll.has(n) && n !== '--uma-page-ground' && !n.startsWith('--color-'));
		assert(extra.length === 0, 'ダーク5: ダークにだけ在る変数は --uma-page-ground と Tailwind のパレット（--color-*）だけ（綴りの間違いで効いていない値が無い）', extra);
		// Tailwind のパレットの上書き（段3）: 製品が使う色のクラスの色相が、すべて表に在る
		const used = new Set();
		for (const f of ['special.html', 'exam.html', 'uma-skill-deck.html', 'js/uma-skill-deck-core.js', 'js/uma-skill-deck.js']) {
			const s = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
			for (const m of s.matchAll(/\b(?:[a-z-]+:)*(?:bg|text|border|ring|from|via|to|fill|stroke|outline|divide|accent|decoration|placeholder)-([a-z]+)-(?:50|[1-9]00|950)\b/g)) used.add(m[1]);
		}
		const table = new Set([...dark].filter((n) => n.startsWith('--color-')).map((n) => n.split('-')[3]));
		const noTable = [...used].filter((h) => !table.has(h));
		assert(used.size >= 5 && noTable.length === 0, 'ダーク5: 製品が使う Tailwind の色相（' + [...used].sort().join('・') + '）はすべてダークの上書き表に在る', noTable);
	});

	await block('ダーク6 スタイルガイド（css/styleguide.html）をダークで見たとき、文字のコントラスト比が足りる', async () => {
		const { ctx, page } = await openPage(browser, base, 'css/styleguide.html', { width: 1280, height: 900 });
		const lightScan = await page.evaluate(scanTextContrastInPage, null);
		console.log('     [参考] ライトのスタイルガイドの不足（直していない）: ' + (lightScan.bad.length ? formatContrast(lightScan.bad).join(' / ') : 'なし'));
		await page.click('[data-theme-choice="dark"]');
		await page.waitForTimeout(200);
		assert(await attr(page) === 'dark', 'ダーク6: スタイルガイドの「ダーク」で属性が付く');
		const r = await page.evaluate(scanTextContrastInPage, null);
		assert(r.checked > 40 && r.bad.length === 0, 'ダーク6: ダークのスタイルガイドの文字はすべて 4.5（大きい文字は 3.0）以上（' + r.checked + '件）', formatContrast(r.bad));
		assert(r.undecided.length === 0, 'ダーク6: 背景を決められない文字が無い', r.undecided);
		const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		assert(bg === 'rgb(23, 29, 38)', 'ダーク6: 地は面の色（#171d26）', bg);
		await page.click('[data-theme-choice="auto"]');
		assert(await attr(page) === 'light' && await stored(page) === null, 'ダーク6: 「自動」でライト（OS の設定）に戻り、鍵が消える（special／exam と同じ js/theme.js の部品）');
		await ctx.close();
	});

	/* ---------- 段4: special＋core ---------- */
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const IDS = MASTER.slice(0, 14).map((s) => String(s.id));
	/** special を①の編成と②のスキルが入った状態で開く。theme＝'dark' なら鍵を入れてから読み込み直す */
	const openSpFull = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		await sp.page.evaluate(({ tab, ids, theme, KEY }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ umaId: 'uma-0001', cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'], skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } }));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids }));
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
			if (theme === 'dark') localStorage.setItem(KEY, 'dark'); else localStorage.removeItem(KEY);
		}, { tab: o.tab === undefined ? 1 : o.tab, ids: o.ids || IDS, theme: o.theme || 'light', KEY });
		await sp.page.reload({ waitUntil: 'networkidle' });
		await closeNotice(sp.page);
		await sp.page.waitForTimeout(500);
		return sp;
	};
	// 見出しのタイトル（文字のグラデーション）と、その中の文字は背景を決められない。目視で確かめる（スクリーンショット）
	const headerOnly = (list) => list.filter((x) => !(x.el.startsWith('h1.') || /^header\.site-header/.test(x.at || '')));

	await block('ダーク7 結合画像（canvas）はダークでもライトの値で焼き込む（決定4）', async () => {
		const { ctx, page } = await openPage(browser, base, 'special.html', { width: 375, height: 812 });
		await closeNotice(page);
		const draw = () => page.evaluate(() => {
			const c = document.createElement('canvas'); c.width = 360; c.height = 200;
			const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 360, 200);
			const colors = tierMarkColors();
			[1, 2, 3].forEach((t, i) => drawTierMark(g, t, 40 + i * 60, 40, 32, colors));
			const bar = buildTierLegendBar(360, 360, true);
			if (bar) g.drawImage(bar, 0, 100);
			return { colors, url: c.toDataURL(), attr: document.documentElement.getAttribute('data-theme') };
		});
		const light = await draw();
		await page.evaluate(() => window.UmaTheme.set('dark'));
		const shown = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--uma-mark-tier-1').trim());
		const dark = await draw();
		assert(shown !== light.colors[1], 'ダーク7: 前提: ダークでは画面の印の色がライトと違う', { light: light.colors[1], dark: shown });
		assert(JSON.stringify(dark.colors) === JSON.stringify(light.colors), 'ダーク7: tierMarkColors() はダークでもライトの値を返す', { light: light.colors, dark: dark.colors });
		assert(dark.url === light.url && light.url.length > 1000, 'ダーク7: 印と凡例の帯を描いた canvas が、ダークとライトでピクセルまで同じ', [light.url.length, dark.url.length]);
		assert(dark.attr === 'dark', 'ダーク7: 読み終わったあと、画面はダークのまま（属性を戻している）', dark.attr);
		await page.evaluate(() => window.UmaTheme.set('auto'));
		await ctx.close();
	});

	await block('ダーク8 special のダークの文字のコントラスト比（①②③・オススメサポの小窓・確認の小窓・トースト・「＋」の展開）', async () => {
		const report = [];
		const check = async (page, name) => {
			const r = await page.evaluate(scanTextContrastInPage, null);
			assert(r.checked > 30 && r.bad.length === 0, 'ダーク8: ' + name + ' の文字はすべて 4.5（大きい文字は 3.0）以上（' + r.checked + '件）', formatContrast(r.bad));
			assert(headerOnly(r.undecided).length === 0, 'ダーク8: ' + name + ' で背景を決められない文字は、見出しのタイトルだけ', headerOnly(r.undecided));
		};
		for (const w of [375, 1280]) {
			for (const tab of [0, 1, 2]) {
				const sp = await openSpFull({ tab, w, h: w === 375 ? 812 : 900, theme: 'dark' });
				assert(await attr(sp.page) === 'dark', 'ダーク8: 前提: ダークで開いた');
				await check(sp.page, w + 'px の' + ['①', '②', '③'][tab]);
				if (w === 375 && tab === 1) {
					await sp.page.click('#deck-template-panel [data-usd-el="palette-delete"]');
					await check(sp.page, '②の「削除」を選んだ状態');
					await sp.page.click('#deck-template-panel [data-usd-el="palette-delete"]');
					await sp.page.click('#deck-template-panel [data-usd-el="outside-open"]');
					await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 20000 });
					await check(sp.page, 'オススメサポの小窓');
					for (const el of ['outside-exclude-btn', 'outside-types-btn', 'outside-count-btn', 'outside-card-main']) {
						await sp.page.click('[data-usd-el="outside-modal"] [data-usd-el="' + el + '"]');
						await sp.page.waitForTimeout(300);
						await check(sp.page, 'オススメサポの ' + el + ' の小窓');
						await sp.page.keyboard.press('Escape');
						await sp.page.waitForTimeout(200);
					}
					await sp.page.keyboard.press('Escape');
					await sp.page.evaluate(() => showToast('確認', 'warn'));
					await sp.page.waitForTimeout(400);
					const t = await sp.page.evaluate(() => { const e = document.getElementById('toast'); const cs = getComputedStyle(e); return { bg: cs.backgroundColor, border: cs.borderTopColor, bw: cs.borderTopWidth }; });
					assert(t.bg === 'rgb(15, 23, 43)' && t.border === 'rgb(170, 182, 200)' && t.bw === '1px', 'ダーク8: トーストは暗いまま、明るい細い枠（決定7）', t);
					await check(sp.page, 'トースト（注意のアイコン付き）');
					await sp.page.click('#fab-toggle');
					await sp.page.waitForTimeout(500);
					await check(sp.page, '「＋」の展開');
				}
				await sp.ctx.close();
			}
		}
		// ライトの既存の不足は直さない（決定12）。一覧にして出すだけ
		for (const tab of [0, 1, 2]) {
			const sp = await openSpFull({ tab, theme: 'light' });
			const r = await sp.page.evaluate(scanTextContrastInPage, null);
			report.push(...r.bad.map((b) => '①②③'[tab] + ' ' + formatContrast([b])[0]));
			await sp.ctx.close();
		}
		console.log('     [参考] special 375px のライトのコントラスト比の不足（直していない・' + report.length + '件）:\n       ' + (report.join('\n       ') || 'なし'));
	});

	await block('ダーク10 意味を持つ色の見分け（種類の文字・行の地・印・サポカの種類・スキルのアイコン）はダークでもライト以上に離れている', async () => {
		const sp = await openSpFull({ tab: 0, theme: 'light' });
		const read = () => sp.page.evaluate(() => {
			const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
			const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
			const grid = document.querySelector('.usd-roster-grid') || document.documentElement;
			const v = (el, n) => rgb(getComputedStyle(el).getPropertyValue(n).trim());
			const R = document.documentElement;
			return {
				'①の名前の色（回復・パッシブ・デバフ・ふつう）': [v(grid, '--usd-skill-heal-text'), v(grid, '--usd-skill-passive-text'), v(grid, '--usd-skill-debuff-text'), v(R, '--uma-text')],
				'①の行の地（金・固有・ふつう）': [v(R, '--uma-stitch-soft'), v(R, '--usd-skill-unique-mid'), v(R, '--uma-surface')],
				'分類の印と因子の印（◎○▲・◆・ハート）': [1, 2, 3].map((t) => v(R, '--uma-mark-tier-' + t)).concat([v(R, '--uma-mark-catalog'), v(R, '--uma-mark-gene')]),
				'サポカの種類6色（文字）': [1, 2, 3, 4, 5, 6].map((t) => v(R, '--uma-card-type-' + t + '-text')),
				'サポカの種類6色（地）': [1, 2, 3, 4, 5, 6].map((t) => v(R, '--uma-card-type-' + t + '-bg')),
				'スキルのアイコン6色': ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => v(R, '--usd-icon-' + k)),
			};
		});
		const minDE = (cols) => { let m = Infinity; for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) m = Math.min(m, deltaE(cols[i], cols[j])); return m; };
		const light = await read();
		await sp.page.evaluate(() => window.UmaTheme.set('dark'));
		const dark = await read();
		for (const k of Object.keys(light)) {
			const l = minDE(light[k]), d = minDE(dark[k]);
			assert(d + 1e-9 >= l && JSON.stringify(light[k]) !== JSON.stringify(dark[k]),
				'ダーク10: ' + k + ' の最小の色差（ΔE）がダークでライト以上（ライト ' + l.toFixed(1) + ' → ダーク ' + d.toFixed(1) + '）', { light: light[k], dark: dark[k] });
		}
		await sp.page.evaluate(() => window.UmaTheme.set('auto'));
		await sp.ctx.close();
	});

	/* ---------- 段5: exam ---------- */
	const openExam = async (theme, w = 375) => {
		const ctx = await browser.newContext({ viewport: { width: w, height: 812 } });
		await ctx.addInitScript(({ theme, KEY }) => { try { if (theme === 'dark') localStorage.setItem(KEY, 'dark'); } catch (e) {} }, { theme, KEY });
		const page = await ctx.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		await page.goto(base + '/exam.html', { waitUntil: 'networkidle', timeout: 60000 });
		await page.waitForFunction(() => document.documentElement.classList.contains('uma-tw-ready'), null, { timeout: 15000 }).catch(() => {});
		await page.waitForTimeout(800);
		for (const sel of ['#ui-notice-ok', '[data-act="notice-ok"]']) if (await page.isVisible(sel).catch(() => false)) await page.click(sel);
		await page.waitForTimeout(300);
		return { ctx, page, errors };
	};
	const seedExamResults = (page) => page.evaluate(() => {
		const mk = (names, offset) => matchAllSkillsWithStars(names.map((n, i) => ({ text: n, stars: ((i + offset) % 3) + 1, starsReliable: i !== 4, rowKey: 'r' + i })), skillList, skillIndex, {});
		personResults = PERSON_LABELS.map(() => null);
		personResults[0] = mk(skillList, 0);
		personResults[3] = mk(skillList.slice(0, 20), 1);
		renderResults();
	});

	await block('ダーク11 exam: 結果画像（canvas）の色はライトで読む・ダークの文字のコントラスト比（①②・判定の結果）', async () => {
		const { ctx, page, errors } = await openExam('light');
		const readMarks = () => page.evaluate(() => ({ marks: attrMarkColors(), factor: stitchTokenColor('--uma-catalog-text'), gene: stitchTokenColor('--uma-gene-text'), attr: document.documentElement.getAttribute('data-theme') }));
		const light = await readMarks();
		await page.evaluate(() => window.UmaTheme.set('dark'));
		const dark = await readMarks();
		const shown = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--uma-text').trim());
		assert(shown === '#e2e8f0', 'ダーク11: 前提: ダークでは画面の文字の色が明るい', shown);
		assert(JSON.stringify(dark.marks) === JSON.stringify(light.marks) && dark.factor === light.factor && dark.gene === light.gene && !!light.marks,
			'ダーク11: attrMarkColors()・stitchTokenColor() はダークでもライトの値を返す（決定4）', { light, dark });
		assert(dark.attr === 'dark', 'ダーク11: 読み終わったあと、画面はダークのまま', dark.attr);
		await page.evaluate(() => window.UmaTheme.set('auto'));
		assert(errors.length === 0, 'ダーク11: コンソールのエラー0', errors);
		await ctx.close();

		const lightReport = [];
		for (const w of [375, 1280]) {
			for (const theme of ['dark', 'light']) {
				const ex = await openExam(theme, w);
				const scan = async (name) => {
					const r = await ex.page.evaluate(scanTextContrastInPage, null);
					if (theme === 'dark') {
						assert(r.checked > 30 && r.bad.length === 0, 'ダーク11: exam ' + w + 'px の' + name + 'の文字はすべて 4.5（大きい文字は 3.0）以上（' + r.checked + '件）', formatContrast(r.bad));
						assert(r.undecided.filter((x) => !x.el.startsWith('h1.') && !/^h1\./.test(x.at || '') && !/^header/.test(x.at || '')).length === 0, 'ダーク11: exam ' + w + 'px の' + name + 'で背景を決められない文字は見出しのタイトルだけ', r.undecided);
					} else if (w === 375) lightReport.push(...r.bad.map((b) => name + ' ' + formatContrast([b])[0]));
				};
				await scan('①');
				await ex.page.click('#step-tab-1').catch(() => {});
				await ex.page.waitForTimeout(300);
				await scan('②');
				await seedExamResults(ex.page);
				await ex.page.evaluate(() => fabGoTo('result'));
				await ex.page.waitForTimeout(1200);
				await scan('判定の結果');
				await ex.ctx.close();
			}
		}
		console.log('     [参考] exam 375px のライトのコントラスト比の不足（直していない・' + lightReport.length + '件）:\n       ' + (lightReport.join('\n       ') || 'なし'));
	});

	/* ---------- 段6: Deck（単体ページ・引き出しの中） ---------- */
	await block('ダーク12 Deck: 単体ページと引き出しの中のダークの文字のコントラスト比・単体ページに切り替えの部品は無い（決定9）', async () => {
		const lightReport = [];
		for (const theme of ['dark', 'light']) {
			for (const w of [375, 1280]) {
				const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
				await ctx.addInitScript(({ d, theme, KEY }) => { try { if (!sessionStorage.getItem('__d')) { sessionStorage.setItem('__d', '1'); localStorage.setItem('umaSkillDeck:userData', JSON.stringify(d)); if (theme === 'dark') localStorage.setItem(KEY, 'dark'); } } catch (e) {} }, { d: env.USER_DATA, theme, KEY });
				const page = await ctx.newPage();
				await page.goto(base + '/uma-skill-deck.html', { waitUntil: 'networkidle', timeout: 60000 });
				await page.waitForTimeout(800);
				const scan = async (name) => {
					const r = await page.evaluate(scanTextContrastInPage, null);
					if (theme === 'dark') {
						assert(r.checked > 10 && r.bad.length === 0, 'ダーク12: Deck 単体 ' + w + 'px の' + name + 'の文字はすべて基準以上（' + r.checked + '件）', formatContrast(r.bad));
						assert(r.undecided.length === 0, 'ダーク12: Deck 単体 ' + w + 'px の' + name + 'で背景を決められない文字が無い', r.undecided);
					} else if (w === 375) lightReport.push(...r.bad.map((b) => 'Deck ' + name + ' ' + formatContrast([b])[0]));
				};
				if (theme === 'dark' && w === 375) {
					assert(await attr(page) === 'dark' && await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(15, 19, 24)', 'ダーク12: Deck 単体の地は青黒（#0f1318。決定6）');
					assert(await page.evaluate(() => document.querySelectorAll('[data-theme-choice], [aria-label="画面の色"]').length) === 0, 'ダーク12: Deck 単体に画面の色の切り替えは無い（決定9）');
				}
				await scan('スキルセット');
				await page.click('#tab-btn-record'); await page.waitForTimeout(300);
				await page.evaluate((id) => openRecordEditor(id), env.USER_DATA.records[0].recordId);
				await page.waitForTimeout(600);
				await scan('比較シート');
				await page.click('#tab-btn-data').catch(() => {}); await page.waitForTimeout(300);
				await scan('データ管理');
				await ctx.close();
			}
		}
		// 引き出しの中（special 375px）
		const sp = await openSpFull({ tab: 1, theme: 'dark' });
		await sp.page.evaluate(() => fabGoTo('deck'));
		await sp.page.waitForTimeout(2000);
		const fr = sp.page.frames().find((f) => /uma-skill-deck\.html/.test(f.url()));
		const r = await fr.evaluate(scanTextContrastInPage, null);
		assert(await fr.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'ダーク12: 引き出しの Deck もダーク');
		assert(r.checked > 10 && r.bad.length === 0 && r.undecided.length === 0, 'ダーク12: 引き出しの Deck の文字はすべて基準以上（' + r.checked + '件）', { bad: formatContrast(r.bad), undecided: r.undecided });
		const drawerBg = await sp.page.evaluate(() => getComputedStyle(document.querySelector('#deck-drawer .uma-drawer-body')).backgroundColor);
		assert(drawerBg === 'rgb(18, 23, 31)', 'ダーク12: 引き出しの地は暗い（--uma-drawer-bg）', drawerBg);
		await sp.ctx.close();
		console.log('     [参考] Deck 375px のライトのコントラスト比の不足（直していない・' + lightReport.length + '件）:\n       ' + (lightReport.join('\n       ') || 'なし'));
	});

	/* ---------- 段7: 画面の色の切り替え（C-135）。C-139（微調整1・C(13)）で「？」の小窓の3択（自動／ライト／ダーク）から、ヘッダーの1つのボタン（押すたびに 自動→ライト→ダーク）へ置き換えた ---------- */
	await block('ダーク13 画面の色の切り替えボタン（ヘッダー）: 壊れた値は「自動」のまま書き換えない・localStorage が使えなくても落ちない・375px／320px でヘッダーに収まる（回る順・保存・OS への追従は「微調整1C3」）', async () => {
		for (const file of ['special.html', 'exam.html']) {
			for (const w of [375, 320]) {
				const { ctx, page, errors } = await openPage(browser, base, file, { width: w, height: 760 });
				for (const sel of ['#ui-notice-ok', '[data-act="notice-ok"]']) if (await page.isVisible(sel).catch(() => false)) await page.click(sel);
				const tag = file + ' ' + w + 'px: ';
				const g = await page.evaluate(() => {
					const b = document.getElementById('theme-cycle-btn'), hd = document.querySelector('header');
					const R = (el) => { const q = el.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, r: q.right, b: q.bottom }; };
					return { btn: R(b), hd: R(hd), sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, h1: R(hd.querySelector('h1')), tool: R(document.getElementById('tool-dropdown-btn')) };
				});
				assert(g.btn.w >= 44 && g.btn.h >= 44 && g.btn.r <= g.vw && g.btn.x >= g.tool.r && g.sw <= g.vw && g.btn.y >= g.hd.y - 0.5 && g.btn.b <= g.hd.b + 0.5,
					'ダーク13: ' + tag + 'ボタンは44px以上でヘッダーの右端に収まり、横にはみ出さない（ツール切替の右）', g);
				// 壊れた値（light／dark 以外）は「自動」として出し、書き換えない
				await page.evaluate((k) => localStorage.setItem(k, 'purple'), KEY);
				await page.reload({ waitUntil: 'networkidle' });
				for (const sel of ['#ui-notice-ok', '[data-act="notice-ok"]']) if (await page.isVisible(sel).catch(() => false)) await page.click(sel);
				const bad = await page.evaluate(() => ({ state: document.getElementById('theme-cycle-btn').getAttribute('data-theme-state'), aria: document.getElementById('theme-cycle-btn').getAttribute('aria-label') }));
				assert(bad.state === 'auto' && bad.aria === '画面の色：自動' && await stored(page) === 'purple' && await attr(page) === 'light',
					'ダーク13: ' + tag + '壊れた値は「自動」として出し、書き換えない（OS の設定のライトで開く）', bad);
				await page.click('#theme-cycle-btn');
				assert(await stored(page) === 'light' && await attr(page) === 'light', 'ダーク13: ' + tag + '押すと壊れた値の次の「ライト」になり、そこで初めて鍵を書き直す', null);
				await page.evaluate((k) => localStorage.removeItem(k), KEY);
				assert(jsErrors(errors).length === 0, 'ダーク13: ' + tag + 'コンソールのエラー0', jsErrors(errors));
				await ctx.close();
			}
			// localStorage が使えないときも落ちない（選んだものはその画面の中だけ効く）
			const c2 = await browser.newContext({ viewport: { width: 375, height: 760 } });
			await c2.addInitScript((k) => {
				const g = Storage.prototype.getItem, s2 = Storage.prototype.setItem, r = Storage.prototype.removeItem;
				Storage.prototype.getItem = function (key) { if (key === k) throw new Error('blocked'); return g.call(this, key); };
				Storage.prototype.setItem = function (key, v) { if (key === k) throw new Error('blocked'); return s2.call(this, key, v); };
				Storage.prototype.removeItem = function (key) { if (key === k) throw new Error('blocked'); return r.call(this, key); };
			}, KEY);
			const p2 = await c2.newPage();
			const errs = [];
			p2.on('pageerror', (e) => errs.push(String(e)));
			await p2.goto(base + '/' + file, { waitUntil: 'networkidle', timeout: 60000 });
			for (const sel of ['#ui-notice-ok', '[data-act="notice-ok"]']) if (await p2.isVisible(sel).catch(() => false)) await p2.click(sel);
			await p2.click('#theme-cycle-btn');
			await p2.click('#theme-cycle-btn');
			const st2 = await p2.evaluate(() => ({ state: document.getElementById('theme-cycle-btn').getAttribute('data-theme-state'), attr: document.documentElement.getAttribute('data-theme') }));
			assert(errs.length === 0 && st2.state === 'dark' && st2.attr === 'dark', 'ダーク13: ' + file + ' は localStorage が使えなくても落ちず、押した色（ライト→ダーク）をその画面に当てて、ボタンの状態も合わせる', { errs, st2 });
			await c2.close();
		}
	});
}
