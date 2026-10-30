// ②因子周回の入口の作り直し 段E（2026-10-21・C-188）の検査。run-smoke.mjs の末尾から register47() で呼ばれる
// （塊の見出しはすべて「C-188」で始まる。`npm run test:visual -- --only=C-188` で回せる）。
//
// 対象: (a) 2列表示（639px 以下）の①のタイルを低くした（名前 11px・二つ名 9px・縁2px・アイコン20px・×の押せる範囲44px）／3列表示は今のまま／
// (b) 375px の「①の表より上」の高さ／(c) 同じ種別が2枚でも番号の丸は出ない（読み上げだけに「N枚目」）／(d) 全カードで種別が決まる・種別不明の分岐は壊したデータでだけ働く／
// (e) ②のオススメサポの小窓のタイルは変わらない。カード名・種別は検査の側に書かない（恒久ルール1。データから読む）。

import { reloadReady } from './lib/page-ready.mjs';
export async function register47(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const CARDS = readJson('data/support-cards.json').entries;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const firstOf = (t) => CARDS.find((c) => c.rarity === 'SSR' && !c.isGroup && c.typeOrder === t);
	// 速（typeOrder 1）が2枚・ほかは別の種別（名前の違う SSR）
	const SPEED = CARDS.filter((c) => c.rarity === 'SSR' && !c.isGroup && c.typeOrder === 1).slice(0, 2).map((c) => c.id);
	const TWO = SPEED.concat([2, 3, 4, 5].map((t) => firstOf(t).id));
	const SAME_IDS = ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'];
	const FILTER = { surface: 'turf', style: 'nige', distance: 'medium' };
	// 段D（a12b906）の実測（この編成・375×812）: ①の表の上端 421px・タイル 44px。公開版（0530272）は 343px・30px
	const D_GRID_TOP = 421, PUB_GRID_TOP = 343;
	const sleep = (page, ms) => page.waitForTimeout(ms);

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, EMPTY);
		if (o.patchCards) {
			await sp.page.route('**/data/support-cards.json*', async (route) => {
				const resp = await route.fetch();
				const doc = JSON.parse(await resp.text());
				o.patchCards(doc);
				await route.fulfill({ response: resp, body: JSON.stringify(doc) });
			});
		}
		await sp.page.evaluate(({ roster, theme, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', tab);
			try { localStorage.setItem('uma-tools-theme', theme); } catch (e) {}
		}, { roster: o.roster || { umaId: 'uma-0179', cardIds: SAME_IDS, skillFilter: FILTER }, theme: o.theme || 'light', tab: o.tab || '0' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(o.tab === '1' ? '#deck-template-panel .usd-entry-row' : '#deck-roster-panel .usd-roster-grid', { timeout: 15000 });
		await sleep(sp.page, 500);
		return sp;
	};
	const tiles = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="roster-tile"]')).map((t) => {
		const cs = getComputedStyle(t), nick = t.querySelector('[data-usd-el="roster-tile-nick"]'), name = t.querySelector('[data-usd-el="roster-tile-name"]'), x = t.querySelector('[data-usd-el="clear-card"]'), ico = t.querySelector('[data-usd-el="card-type-icon"]');
		const xr = x ? x.getBoundingClientRect() : null, tr = t.getBoundingClientRect(), xg = x ? x.querySelector('.usd-out-card-xg') : null;
		return { h: Math.round(tr.height * 10) / 10, bw: cs.borderTopWidth, pad: [cs.paddingTop, cs.paddingLeft], nameSize: name ? parseFloat(getComputedStyle(name).fontSize) : null, nickSize: nick ? parseFloat(getComputedStyle(nick).fontSize) : null,
			nameOver: name ? name.getBoundingClientRect().right > tr.right + 0.5 : null, ico: ico ? Math.round(ico.getBoundingClientRect().width) : null, x: xr ? [Math.round(xr.width), Math.round(xr.height)] : null,
			xCenterY: xr ? Math.abs((xr.top + xr.bottom) / 2 - (tr.top + tr.bottom) / 2) : null, xGlyph: xg ? Math.round(xg.getBoundingClientRect().width) : null, noBadge: !t.querySelector('.usd-card-no, [data-usd-el="card-no"]'), top: tr.top, bottom: tr.bottom, nickColor: nick ? getComputedStyle(nick).color : null, bg: cs.backgroundColor };
	}));
	const rgbOf = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return p.slice(0, 3); };
	const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
	const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

	await block('C-188(a) ①のタイル（2列表示＝390・360px）: 名前11px・二つ名9px・縁2px・種別アイコン20px・上下の余白1px・高さ約30px・×の押せる範囲は44px・番号の丸なし／3列表示（1280px）は今のまま（12px・10px・44px）／二つ名の文字色は面の上で 4.5:1 以上（ライト・ダーク）', async () => {
		for (const [w, theme] of [[390, 'light'], [390, 'dark'], [360, 'light'], [360, 'dark'], [1280, 'light'], [1280, 'dark']]) {
			const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844 });
			const t = await tiles(sp.page);
			const tag = 'C-188 ' + w + 'px・' + theme + ': ';
			const two = w <= 639;
			assert(t.length === 6 && t.every((x) => x.noBadge), tag + '6枚・番号の丸なし', t.length);
			assert(t.every((x) => x.nameSize === (two ? 11 : 12) && x.nickSize === (two ? 9 : 10)), tag + '名前 ' + (two ? '11' : '12') + 'px・二つ名 ' + (two ? '9' : '10') + 'px', t.map((x) => [x.nameSize, x.nickSize]));
			assert(t.every((x) => x.bw === '1px' && x.ico === 20), tag + '縁は1px（段G(6)で 2px から細くした。選んでいるタイルだけ 2px）・種別アイコンは20px（変えない）', t.map((x) => [x.bw, x.ico]));
			if (two) assert(t.every((x) => x.h >= 28 && x.h <= 33 && x.pad[0] === '1px' && x.pad[1] === '5px'), tag + 'タイルの高さは約30px（実測 ' + t[0].h + 'px）・上下の余白1px・左右5px', t.map((x) => [x.h, x.pad]));
			else assert(t.every((x) => x.h === 44), tag + '3列表示のタイルは今のまま（44px）', t.map((x) => x.h));
			assert(t.every((x) => x.x[0] >= 44 && x.x[1] >= 44 && x.xGlyph <= 16 && (!two || x.xCenterY < 1.5)), tag + '×の押せる範囲は44px以上・見た目の×の字は16px以下' + (two ? '・タイルの高さの中央に重なる' : ''), t.map((x) => [x.x, x.xGlyph, x.xCenterY]));
			assert(t.every((x) => !x.nameOver), tag + '名前がタイルからはみ出さない', t.map((x) => x.nameOver));
			assert(t.every((x) => x.nickColor && contrast(rgbOf(x.nickColor), rgbOf(x.bg)) >= 4.5), tag + '二つ名の文字色は面の上で 4.5:1 以上', t.map((x) => contrast(rgbOf(x.nickColor), rgbOf(x.bg)).toFixed(2)));
			if (two) {
				const gaps = t.slice(2).map((x, i) => Math.round((x.top - t[i].bottom) * 10) / 10);
				assert(gaps.every((g) => g >= 2.5 && g <= 3.5), tag + 'タイルの行間は約3px', gaps);
			}
			assert(await sp.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('C-188(a2) 切り替えの幅は今のまま: 639px は2列・640px は3列。空きの枠も同じ高さ（2列表示）', async () => {
		for (const [w, cols] of [[639, 2], [640, 3]]) {
			const sp = await openSp({ w, h: 800, roster: { umaId: 'uma-0179', cardIds: [SAME_IDS[0], null, SAME_IDS[2]], skillFilter: FILTER } });
			const r = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="roster-tile"]')).map((e) => ({ top: Math.round(e.getBoundingClientRect().top), h: Math.round(e.getBoundingClientRect().height * 10) / 10, empty: e.classList.contains('usd-roster-tile--empty') })));
			const perRow = r.filter((x) => x.top === r[0].top).length;
			assert(r.length === 6 && perRow === cols, 'C-188 ' + w + 'px: 1行に ' + cols + '枚（実測 ' + perRow + '）', r);
			if (w === 639) assert(new Set(r.map((x) => x.h)).size === 1 || Math.max.apply(null, r.map((x) => x.h)) - Math.min.apply(null, r.map((x) => x.h)) <= 1, 'C-188 639px: 空きの枠と埋まった枠の高さが揃う（約30px）', r.map((x) => x.h));
			await sp.ctx.close();
		}
	});

	await block('C-188(b) 高さ: 375px の「①の表より上」は、段D（a12b906・' + D_GRID_TOP + 'px）より低く、公開版（0530272・' + PUB_GRID_TOP + 'px）との差が +40px 以内（ライト・ダーク・375×812・360×800）', async () => {
		for (const [w, h, theme, pub, d] of [[375, 812, 'light', 343, 421], [375, 812, 'dark', 343, 421], [360, 800, 'light', 375, 453]]) {
			const sp = await openSp({ w, h, theme });
			const g = await sp.page.evaluate(() => Math.round(document.querySelector('#deck-roster-panel .usd-roster-grid-wrap').getBoundingClientRect().top + window.scrollY));
			const t = await tiles(sp.page);
			const tag = 'C-188 ' + w + 'px・' + theme + ': ';
			console.log('     [実測] ' + tag + '①の表の上端 ' + g + 'px（公開版 ' + pub + '・段D ' + d + '）・タイル ' + t[0].h + 'px');
			assert(g < d && g - pub <= 40, tag + '①の表の上端 ' + g + 'px は段D（' + d + 'px）より低く、公開版（' + pub + 'px）との差 ' + (g - pub) + 'px が +40px 以内', { g, pub, d });
			assert(t.every((x) => x.h >= 28 && x.h <= 33), tag + 'タイルの高さ（実測 ' + t.map((x) => x.h).join('/') + 'px）', t.map((x) => x.h));
			await sp.ctx.close();
		}
	});

	await block('C-188(c) 同じ種別が2枚（速2枚）の編成でも、タイル・列見出しのどこにも番号の丸は出ない。読み上げに「N枚目」がある。見出しの高さは全列で同じ', async () => {
		for (const [w, theme] of [[390, 'light'], [360, 'dark'], [1280, 'light']]) {
			const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844, roster: { umaId: 'uma-0179', cardIds: TWO, skillFilter: FILTER } });
			const tag = 'C-188 速2枚 ' + w + 'px・' + theme + ': ';
			const r = await sp.page.evaluate(() => ({
				badges: document.querySelectorAll('#deck-roster-panel .usd-card-no, #deck-roster-panel [data-usd-el="card-no"], #deck-roster-panel [data-usd-el="gh-fallback"]').length,
				tileAria: Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="pick-card"]')).map((b) => b.getAttribute('aria-label')),
				headAria: Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"][data-no]')).map((b) => b.getAttribute('aria-label')),
				types: Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"][data-no]')).map((b) => b.getAttribute('data-type-order')),
				heads: Array.from(new Set(Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-gh')).map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10))),
				sw: document.documentElement.scrollWidth - window.innerWidth }));
			assert(r.types[0] === '1' && r.types[1] === '1', tag + '前提: 1〜2枚目が同じ種別（速）', r.types);
			assert(r.badges === 0, tag + '番号の丸も種別不明の印も、画面のどこにも無い', r.badges);
			assert(r.tileAria.every((a, i) => a.indexOf((i + 1) + '枚目：') === 0) && r.headAria.every((a, i) => a.indexOf((i + 1) + '枚目：') === 0 && /（[^）]+）のメニュー/.test(a)), tag + 'タイルは「N枚目：<名前>（<種別>）」・列見出しは「N枚目：<名前>（<種別>）のメニュー」', { t: r.tileAria[0], h: r.headAria[0] });
			assert(r.heads.length === 1 && r.sw <= 0, tag + '見出しの高さは全列で同じ（' + r.heads[0] + 'px）・横スクロールなし', r);
			await sp.ctx.close();
		}
	});

	await block('C-188(d) 種別不明: 実データの全カード（グループのカードを含む）で種別が決まる（決まらないカードは0枚）／壊したデータ（種別が範囲外・読み込めないid）でだけ種別不明の分岐が働き、番号の丸も新しい絵柄も出ない', async () => {
		// データ側: 全カードの typeOrder が 1〜6
		const bad = CARDS.filter((c) => !(typeof c.typeOrder === 'number' && c.typeOrder >= 1 && c.typeOrder <= 6));
		assert(CARDS.length >= 500 && bad.length === 0, 'C-188 実データの全 ' + CARDS.length + '枚（うちグループのカード ' + CARDS.filter((c) => c.isGroup).length + '枚）で種別が決まる（決まらないカード ' + bad.length + '枚）', bad.map((c) => [c.id, c.typeOrder]));
		// 画面側（計算が返すメンバーの種別）: 全カードを1枚ずつ入れて、種別が null のものが無い
		const probe = await openSp({ w: 390 });
		const undecided = await probe.page.evaluate(async (ids) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData(); await C.loadScenarioEvents(false);
			const out = [];
			for (const id of ids) {
				const m = C.computeRosterSkills({ cardIds: [id] }, { autoChoose: true }).members.find((x) => x.kind === 'card' && x.label);
				if (!m || m.typeOrder === null || m.typeOrder === undefined || m.typeOrder < 1 || m.typeOrder > 6) out.push(id);
			}
			return out;
		}, CARDS.map((c) => c.id));
		assert(undecided.length === 0, 'C-188 画面の計算でも、全カードの種別が決まる（種別不明 ' + undecided.length + '枚）', undecided.slice(0, 5));
		// 通常の編成では、種別不明の印は一度も出ない
		const normal = await probe.page.evaluate(() => document.querySelectorAll('#deck-roster-panel [data-usd-el="gh-fallback"]').length);
		assert(normal === 0, 'C-188 通常の編成の画面に、種別不明の見出しは出ない', normal);
		await probe.ctx.close();
		// 壊したデータ1: 2枚目の種別を範囲外（9）にし、3枚目は存在しない id にする
		const target = SAME_IDS[1];
		const sp = await openSp({ w: 390, roster: { umaId: 'uma-0179', cardIds: [SAME_IDS[0], target, 'card-9999', null, null, null], skillFilter: FILTER }, patchCards: (doc) => { const e = doc.entries.find((x) => x.id === target); e.typeOrder = 9; } });
		const r = await sp.page.evaluate(() => {
			const heads = Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"][data-no]')).map((b) => ({ aria: b.getAttribute('aria-label'), fb: (b.querySelector('[data-usd-el="gh-fallback"]') || {}).textContent || null, ico: !!b.querySelector('img'), num: !!b.querySelector('.usd-card-no'), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }));
			const tl = Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="roster-tile"]')).slice(0, 3).map((t) => ({ aria: (t.querySelector('[data-usd-el="pick-card"]') || {}).getAttribute('aria-label'), ico: !!t.querySelector('[data-usd-el="card-type-icon"]'), num: !!t.querySelector('.usd-card-no') }));
			return { heads, tl, hs: Array.from(new Set(Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-gh')).map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10))), sw: document.documentElement.scrollWidth - window.innerWidth };
		});
		assert(r.heads.length === 3 && r.heads[0].ico && !r.heads[0].fb, 'C-188 壊したデータ: 正常な1枚目は今までどおり種別アイコン', r.heads[0]);
		assert(r.heads.slice(1).every((x) => !x.ico && !x.num && x.fb && x.fb.length === 1 && /（種別不明）のメニュー$/.test(x.aria) && x.h >= 44), 'C-188 壊したデータ: 種別が範囲外のカードと読み込めないカードは、種別アイコンも番号の丸も無く、カード名の先頭1文字のボタン（押せる範囲 44px・「（種別不明）のメニュー」）', r.heads);
		assert(r.heads[1].aria.indexOf('2枚目：') === 0 && r.heads[2].aria.indexOf('3枚目：') === 0, 'C-188 壊したデータ: 読み上げに「N枚目」', r.heads.map((x) => x.aria));
		assert(r.tl[1].aria.indexOf('（種別不明）') !== -1 && r.tl[2].aria.indexOf('（種別不明）') !== -1 && !r.tl[1].ico && !r.tl[2].ico && r.tl.every((x) => !x.num), 'C-188 壊したデータ: タイルも種別アイコン・番号の丸は無く、読み上げに「（種別不明）」', r.tl);
		assert(r.hs.length === 1 && r.sw <= 0, 'C-188 壊したデータでも、見出しの高さは全列で同じ・横スクロールなし', r);
		assert(jsErrors(sp.errors).length === 0, 'C-188 壊したデータでもコンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C-188(e) 変えないもの: ②のオススメサポの小窓のタイルは今のまま（高さ44px・名前12px・二つ名10px・番号の丸なし）／育成ウマ娘のタイルも今のまま（390・360px）', async () => {
		for (const w of [390, 360]) {
			const sp = await openSp({ w, tab: '1', roster: { umaId: 'uma-0179', cardIds: SAME_IDS, skillFilter: FILTER, outsideOptions: { count: 4 } } });
			await sp.page.click('#deck-template-panel [data-usd-el="outside-open"]');
			await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
			await sleep(sp.page, 300);
			const r = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] .usd-out-card')).map((t) => ({ h: Math.round(t.getBoundingClientRect().height), name: parseFloat(getComputedStyle(t.querySelector('.usd-out-card-name')).fontSize), nick: t.querySelector('.usd-out-card-nick') ? parseFloat(getComputedStyle(t.querySelector('.usd-out-card-nick')).fontSize) : null, num: !!t.querySelector('.usd-card-no'), bw: getComputedStyle(t).borderTopWidth })));
			assert(r.length >= 4 && r.every((x) => x.h === 44 && x.name === 12 && (x.nick === null || x.nick === 10) && !x.num), 'C-188 ' + w + 'px ②のオススメサポの小窓のタイル: 高さ44px・名前12px・二つ名10px（' + r.length + '枚）', r);
			await sp.ctx.close();
			const sp2 = await openSp({ w });
			const u = await sp2.page.evaluate(() => { const b = document.querySelector('#deck-roster-panel .usd-roster-umabox'); const x = b.querySelector('.usd-roster-clearbtn'); return { h: Math.round(b.getBoundingClientRect().height), xw: Math.round(x.getBoundingClientRect().width), name: parseFloat(getComputedStyle(b.querySelector('.usd-roster-pickname')).fontSize) }; });
			assert(u.h <= 38 && u.xw <= 36 && u.name < 13, 'C-188 ' + w + 'px 育成ウマ娘のタイルは今の大きさのまま（高さ ' + u.h + 'px・×の幅 ' + u.xw + 'px）', u);
			await sp2.ctx.close();
		}
	});
}
