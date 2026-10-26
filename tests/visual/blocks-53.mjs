// 新シナリオ（駿大祭）の受け入れと入れ替え（2026-10-26）の検査。
// run-smoke.mjs の末尾から register53() で呼ばれる（塊の見出しはすべて「駿大祭」で始まる。`npm run test:visual -- --only=駿大祭` で回せる）。
//
// (1) ①の表: シナリオの列は実データの先頭（駿大祭）・見出しの印は新しいシナリオアイコン・列に駿大祭のイベントのスキル（2026-10-26 の仕上げで入れた）／育成ウマ娘の印は新しいキャラアイコン（タイル・列見出し）
// (2) 進化の小窓のシナリオ: 駿大祭の6件が選べる／(3) ③のシナリオ因子の一覧に「駿大祭シナリオ」（25種）
/// (4) ①のサポカの選択で ［巫女］吾妻（card-0566）が選べる／(5) UmaExam ①の「新シナリオへの対応が未完了です。」の1行は無い（公開前の追加で消した）
// (6) 列見出し: 育成ウマ娘・シナリオの列もサポカと同じメニューのボタン・メニューの文言「イベント/スキル」「ソート」／(7) めろっぷの行の8行と効率
// 見た目は 390・1280 × ライト・ダーク で、横スクロールなし・コンソールのエラー0・文字のコントラスト 4.5:1 以上。
// シナリオの固定イベントは実データのまま読む（openPage の既定は空のファイルなので、実データに差し替える）。

import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';

export async function register53(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const SCEN_REAL = readJson('data/scenario-event-skills.json');
	const SCEN_NAME = SCEN_REAL.entries[0].scenario;
	const EXT = new Map(readJson('data/extended-skills.json').entries.map((e) => [e.id, e.name]));
	const EVO6 = readJson('data/skill-evolutions.json').entries.filter((e) => e.kind === 'scenario' && e.scenarioId === SCEN_NAME);
	const FACTORS = readJson('data/scenario-inheritance-factors.json').entries;
	const SIX = ['card-0564', 'card-0565', 'card-0402', 'card-0248', 'card-0535', 'card-0478'];   // 駿大祭の進化の元の金スキル6つを、イベントで取得するカード
	const ROSTER = { umaId: 'uma-0179', cardIds: SIX, skillFilter: {} };
	const RP = '#deck-roster-panel ';
	const UMA_SRC = 'img/icon-uma-2026-10-26b.png', SCEN_SRC = 'img/icon-scenario-2026-10-26.png';
	const VIEWS = [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']];
	// 2026-10-26（新シナリオの仕上げ）: 駿大祭のイベント（おいもさんの指定の表）。シニア級10月前半の6択の選択肢と、4つのイベントで得られるスキルの数（重なりなし）
	const SIX_CHOICE_LABELS = ['ダイワスカーレット', 'マヤノトップガン', 'ユキノビジン', 'ノーリーズン', 'ブラストワンピース', '吾妻'];
	const SCEN_SKILL_N = 11;   // 全身全霊／6択の6つ／ハヤテ一文字・機先の勝負・彼方の呼び声／名にし負う夢

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.w === 1280 ? 900 : 844 }, EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(SCEN_REAL)));
		await sp.page.evaluate(({ roster, tab, theme }) => {
			localStorage.setItem('uma-tools-theme', theme);
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster || ROSTER, tab: o.tab === undefined ? 0 : o.tab, theme: o.theme || 'light' });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		if ((o.tab || 0) === 0) await sp.page.waitForSelector(RP + '.usd-roster-grid', { timeout: 15000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const sleep = (page, ms) => page.waitForTimeout(ms);
	const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

	await block('駿大祭(1) ①の表: シナリオの列は実データの先頭（駿大祭）・見出しの印は新しいシナリオアイコン・列に駿大祭のイベントのスキル（11種）が出る／育成ウマ娘の印は新しいキャラアイコン（タイル・列見出し）。◆とどんぶりは無い（390・1280 × ライト・ダーク）', async () => {
		assert(SCEN_NAME === '駿大祭' && SCEN_REAL.entries[0].events.map((e) => e.type).join(',') === 'fixed,choice,fixed,fixed', '駿大祭(1) データ: 先頭のシナリオは駿大祭で、イベントは4つ（固定・6択・固定・固定）', SCEN_REAL.entries.map((e) => e.scenario + ':' + e.events.length));
		for (const [w, theme] of VIEWS) {
			const tag = '駿大祭(1) ' + w + '・' + theme + ': ';
			const sp = await openSp({ w, theme });
			const r = await sp.page.evaluate(({ UMA_SRC, SCEN_SRC }) => {
				const P = document.getElementById('deck-roster-panel');
				const heads = [...P.querySelectorAll('.usd-roster-gh')];
				const last = heads[heads.length - 1];
				const img = (el, src) => { const i = el && el.querySelector('img[src="' + src + '"]'); return i ? { ok: i.complete && i.naturalWidth === 64, w: Math.round(i.getBoundingClientRect().width), alt: i.getAttribute('alt') } : null; };
				const umaHead = P.querySelector('.usd-roster-gh.usd-roster-gc--uma');
				const rows = [...P.querySelectorAll('.usd-roster-grow')].filter((row) => !row.querySelector('.usd-roster-gh'));
				const scenCells = rows.map((row) => { const cs = [...row.children].filter((c) => c.classList.contains('usd-roster-gc')); return cs[cs.length - 1]; });
				return {
					name: last ? last.textContent.trim() : null, scenBtn: last && last.querySelector('[data-usd-el="col-menu-btn"]') ? last.querySelector('[data-usd-el="col-menu-btn"]').getAttribute('aria-label') : null,
					scen: img(last, SCEN_SRC), umaHead: img(umaHead, UMA_SRC), umaTile: img(P.querySelector('[data-usd-el="pick-uma"]'), UMA_SRC),
					old: P.querySelectorAll('.usd-roster-evdiamond, .usd-roster-bowl').length + document.querySelectorAll('.usd-roster-umamark:not(img)').length,
					rows: rows.length, marked: scenCells.filter((c) => c && (c.querySelector('.usd-roster-got, .usd-roster-maybe') || c.textContent.trim() !== '')).length
				};
			}, { UMA_SRC, SCEN_SRC });
			// 2026-10-26（公開前の追加）: 列見出しはサポカと同じメニューのボタン（印は 24px。名前はボタンの aria-label）
			// 2026-10-26（新シナリオの仕上げ）: 6択が未選択なので、見出しに未選択の印「!」・aria-label に「（未選択1件）」が付く
			assert(r.name === '!駿大祭' && r.scen && r.scen.ok && r.scen.w === 24 && r.scenBtn === 'シナリオ『駿大祭』のメニュー（未選択1件）', tag + 'シナリオの列の見出しは「駿大祭」（未選択の印「!」）・印は新しいシナリオアイコン（24px のメニューのボタン。aria-label「シナリオ『駿大祭』のメニュー（未選択1件）」）', r);
			assert(r.umaHead && r.umaHead.ok && r.umaHead.w === 24 && r.umaTile && r.umaTile.ok && r.umaTile.w === 20 && r.umaTile.alt === '育成ウマ娘', tag + '育成ウマ娘の印は新しいキャラアイコン（列見出し 24px・タイル 20px）', { head: r.umaHead, tile: r.umaTile });
			assert(r.old === 0, tag + '◆（CSS で描いた印）とどんぶりの SVG は、どこにも無い', r.old);
			assert(r.rows > 0 && r.marked === SCEN_SKILL_N, tag + 'シナリオの列に駿大祭のイベントのスキルが出る（' + r.rows + '行のうち ' + SCEN_SKILL_N + '行）', r);
			assert(await noHScroll(sp.page), tag + '横スクロールなし', '');
			const c = await sp.page.evaluate(scanTextContrastInPage, '#deck-roster-panel .usd-roster-grid');
			assert(c.checked > 0 && c.bad.length === 0, tag + '表の文字のコントラスト 4.5:1 以上（' + c.checked + '要素）', formatContrast(c.bad).slice(0, 5));
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('駿大祭(2) 進化の小窓のシナリオ: 駿大祭の6件が選べる（進化の元の金スキル6つを持つ編成・距離の指定なし）', async () => {
		const sp = await openSp({ w: 390 });
		await sp.page.click(RP + '[data-usd-act="evo-open"]');
		await sp.page.waitForSelector('[data-usd-el="evo-tab-b"]', { timeout: 10000 });
		await sp.page.click('[data-usd-el="evo-tab-b"]');
		await sp.page.waitForSelector('[data-usd-el="evo-sheet"][data-evo-tab="b"]', { timeout: 10000 });
		await sp.page.waitForTimeout(300);
		const r = await sp.page.evaluate(() => {
			const s = document.querySelector('[data-usd-el="evo-sheet"]');
			const boxes = [...s.querySelectorAll('input[type="checkbox"]')];
			return { title: document.querySelector('.usd-info-pop .uma-popover-title').textContent, n: boxes.length, enabled: boxes.filter((b) => !b.disabled).length, text: s.innerText };
		});
		const names = EVO6.map((e) => EXT.get(e.evolvedSkillIds[0]));
		assert(EVO6.length === 6 && names.every(Boolean), '駿大祭(2) データ: 駿大祭の進化は6行で、進化先の名前が引ける', names);
		assert(r.title === 'シナリオの進化スキル' && r.n === 6 && r.enabled === 6 && names.every((n) => r.text.includes(n)), '駿大祭(2) シナリオの進化の小窓に駿大祭の6件（' + names.join('・') + '）が出て、6件とも選べる', { title: r.title, n: r.n, enabled: r.enabled });
		await sp.page.click('[data-usd-el="evo-sheet"] input[type="checkbox"]');
		await sp.page.waitForTimeout(300);
		const picked = await sp.page.evaluate(() => document.querySelectorAll('[data-usd-el="evo-sheet"] input[type="checkbox"]:checked').length);
		assert(picked === 1, '駿大祭(2) 1件を選ぶと、選んだ状態になる', picked);
		assert(jsErrors(sp.errors).length === 0, '駿大祭(2) コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});

	await block('駿大祭(3) ③のシナリオ因子の一覧に「駿大祭シナリオ」がある（25種。データの並びの末尾）', async () => {
		const sp = await openSp({ w: 390, tab: 2 });
		await sp.page.waitForSelector('[data-usd-act="scope-help"][data-scope="scenarioFactors"]', { timeout: 15000 });
		await sp.page.click('[data-usd-act="scope-help"][data-scope="scenarioFactors"]');
		await sp.page.waitForSelector('[data-usd-el="scope-list-close"]', { timeout: 10000 });
		const r = await sp.page.evaluate(() => { const box = document.querySelector('[data-usd-el="scope-list-close"]').closest('[role="dialog"]'); return { head: box.querySelector('.usd-roster-h').textContent, items: [...box.querySelectorAll('li')].map((li) => li.textContent) }; });
		assert(FACTORS.length === 25 && FACTORS[24].id === 'sf-shuntaisai', '駿大祭(3) データ: シナリオ因子は25件で、末尾が sf-shuntaisai', FACTORS.length);
		assert(r.head === 'シナリオ因子（25種）' && r.items.length === 25 && r.items[24] === '駿大祭シナリオ' && JSON.stringify(r.items) === JSON.stringify(FACTORS.map((f) => f.name)), '駿大祭(3) 一覧の見出しは「シナリオ因子（25種）」で、末尾に「駿大祭シナリオ」（データと同じ並び）', r);
		assert(jsErrors(sp.errors).length === 0, '駿大祭(3) コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});

	await block('駿大祭(4) ①のサポカの選択で ［巫女］吾妻（card-0566・R・友人）が選べる', async () => {
		const sp = await openSp({ w: 390, roster: { umaId: 'uma-0179', cardIds: [null, null, null, null, null, null], skillFilter: {} } });
		await sp.page.click(RP + '[data-usd-el="roster-tile"][data-index="0"] [data-usd-act="pick-card"]');
		await sp.page.waitForSelector('[data-usd-el="modal"] [data-usd-el="find"]', { timeout: 10000 });
		await sp.page.fill('[data-usd-el="modal"] [data-usd-el="find"]', '巫女');
		await sp.page.waitForTimeout(500);
		const hits = await sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="modal"] .usd-name-hit')].map((h) => h.textContent.trim()));
		assert(hits.length === 1 && hits[0] === '[巫女]吾妻', '駿大祭(4) 「巫女」で探すと ［巫女］吾妻 の1件が出る', hits);
		await sp.page.click('[data-usd-el="modal"] .usd-name-hit');
		await sp.page.waitForTimeout(500);
		const saved = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || '{}').cardIds);
		const tile = await sp.page.evaluate(() => { const t = document.querySelector('#deck-roster-panel [data-usd-el="roster-tile"][data-index="0"]'); return { text: t.textContent, type: (t.querySelector('[data-usd-el="card-type-icon"]') || {}).alt || null }; });
		assert(saved && saved[0] === 'card-0566' && /巫女/.test(tile.text) && /吾妻/.test(tile.text) && tile.type === '友人', '駿大祭(4) 選ぶと①の1枚目が card-0566 になり、タイルに［巫女］吾妻と友人の種別アイコンが出る', { saved, tile });
		assert(jsErrors(sp.errors).length === 0, '駿大祭(4) コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});

	// 2026-10-26（公開前の追加）: めろっぷの行を新シナリオに合わせたので、①の「新シナリオへの対応が未完了です。」の1行は消した
	await block('駿大祭(5) UmaExam ①: 「新シナリオへの対応が未完了です。」の1行は無く、先頭の文は「既定として登録済みの133種…」（390・1280 × ライト・ダーク）', async () => {
		for (const [w, theme] of VIEWS) {
			const tag = '駿大祭(5) ' + w + '・' + theme + ': ';
			const r0 = await openPage(browser, base, 'exam.html', { width: w, height: w === 1280 ? 900 : 844 });
			await r0.page.evaluate((t) => { localStorage.setItem('uma-tools-theme', t); }, theme);
			await r0.page.reload({ waitUntil: 'networkidle' });
			await r0.page.waitForTimeout(800);
			for (let i = 0; i < 3; i++) if (await r0.page.isVisible('#ui-notice')) { await r0.page.click('#ui-notice-ok'); await r0.page.waitForTimeout(300); }
			const r = await r0.page.evaluate(() => ({ note: !!document.getElementById('melop-scenario-note'), text: document.getElementById('step-panel-1').innerText.includes('新シナリオへの対応が未完了'),
				first: (document.querySelector('#step-panel-1 > p') || {}).textContent || null }));
			assert(!r.note && !r.text && r.first === '既定として登録済みの133種を対象にします。「対象スキルの範囲」で調整可能です。', tag + '赤字の1行は無く、①の先頭は「既定として登録済みの133種…」の文', r);
			const c = await r0.page.evaluate(scanTextContrastInPage, '#step-panel-1');
			assert(c.checked > 0 && c.bad.length === 0, tag + '①の文字のコントラスト 4.5:1 以上（' + c.checked + '要素）', formatContrast(c.bad).slice(0, 5));
			assert(await noHScroll(r0.page), tag + '横スクロールなし', '');
			assert(jsErrors(r0.errors).length === 0, tag + 'コンソールのエラー0', r0.errors.slice(0, 3));
			await r0.ctx.close();
		}
	});

	await block('駿大祭(6) ①の列見出し: 育成ウマ娘・シナリオの列も、サポカの列と同じメニューのボタン（同じ大きさ・枠・印 24px・じょうご無し・見出しの高さは3種で同じ）。メニューは「イベント/スキル」「ソート」（3種で共通の文言）。シナリオの「イベント/スキル」は駿大祭の6択（390・1280 × ライト・ダーク）', async () => {
		// 変更前（2026-10-26 の 78ca541）に測った見出しの行の高さ: 390px は 49px・1280px は 73px（C-187(d1)・C-188 の基準と同じ）
		const BEFORE_HEAD = { 390: 49, 1280: 73 };
		const SAME = ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0566'];
		for (const [w, theme] of VIEWS) {
			const tag = '駿大祭(6) ' + w + '・' + theme + ': ';
			const sp = await openSp({ w, theme, roster: { umaId: 'uma-0179', cardIds: SAME, skillFilter: { surface: 'turf', style: 'nige', distance: 'medium' } } });
			const r = await sp.page.evaluate(() => {
				const P = document.getElementById('deck-roster-panel');
				const btns = [...P.querySelectorAll('[data-usd-el="col-menu-btn"]')].map((b) => { const rc = b.getBoundingClientRect(), cs = getComputedStyle(b), ico = b.querySelector('img'); return { key: b.getAttribute('data-member-key'), kind: b.getAttribute('data-member-kind') || 'card', w: Math.round(rc.width), h: Math.round(rc.height), bw: cs.borderTopWidth, bs: cs.borderTopStyle, br: cs.borderTopLeftRadius, ico: ico ? Math.round(ico.getBoundingClientRect().width) : null, has: b.hasAttribute('data-has-events') }; });
				return { btns, heads: [...P.querySelectorAll('.usd-roster-gh[role="columnheader"]')].map((c) => Math.round(c.getBoundingClientRect().height)),
					old: P.querySelectorAll('[data-usd-el="events-btn"], [data-usd-el="sort-btn"], .usd-roster-ghbtns').length };
			});
			const card = r.btns.find((b) => b.key === '1'), uma = r.btns.find((b) => b.key === '0'), scen = r.btns.find((b) => b.key === 'scenario');
			const same = (b) => b && card && b.w === card.w && b.h === card.h && b.bw === card.bw && b.bs === card.bs && b.br === card.br && b.ico === 24;
			assert(r.btns.length === 8 && uma && uma.kind === 'uma' && scen && scen.kind === 'scenario' && same(uma) && same(scen) && card.ico === 24 && r.old === 0,
				tag + '育成ウマ娘・シナリオの列見出しは、サポカと同じ大きさ・同じ枠のボタン（印 24px）で、旧いボタン（イベント・じょうご）は無い', { uma, scen, card, old: r.old });
			assert(new Set(r.heads).size === 1 && r.heads[0] === BEFORE_HEAD[w], tag + '見出しの行の高さは全列で同じ（' + r.heads[0] + 'px）で、変更前（' + BEFORE_HEAD[w] + 'px）と同じ', r.heads);
			const menuOf = async (key) => {
				await sp.page.click(RP + '[data-usd-el="col-menu-btn"][data-member-key="' + key + '"]');
				await sp.page.waitForSelector('[data-usd-el="colmenu-ops"]', { timeout: 5000 });
				const t = await sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="colmenu-ops"] button')].map((b) => b.textContent));
				return t;
			};
			for (const key of ['0', '1', 'scenario']) {
				const t = await menuOf(key);
				assert(t.length === 2 && /^イベント\/スキル/.test(t[0]) && t[1] === 'ソート', tag + '列 ' + key + ' のメニューは「イベント/スキル」「ソート」', t);
				await sp.page.keyboard.press('Escape');
				await sleep(sp.page, 200);
			}
			// シナリオの「イベント/スキル」: 小窓を開く。2026-10-26（新シナリオの仕上げ）で駿大祭のイベントを入れたので、選べるイベント（シニア級10月前半の6択）が出る
			await menuOf('scenario');
			await sp.page.click('[data-usd-el="colmenu-events"]');
			await sp.page.waitForSelector('[data-usd-el="event-choice"]', { timeout: 5000 });
			const pop = await sp.page.evaluate(() => ({ none: !!document.querySelector('[data-usd-el="events-none"]'), title: (document.querySelector('.uma-popover-title .usd-ev-title-text') || {}).textContent, icon: !!document.querySelector('.uma-popover-title [data-usd-el="scenario-icon"]'),
				events: document.querySelectorAll('.uma-popover [data-usd-el="event"]').length, labels: [...document.querySelectorAll('.uma-popover [data-usd-el="event-choice"] .usd-roster-choicelabel')].map((x) => x.textContent) }));
			assert(!pop.none && pop.title === 'シナリオ『駿大祭』' && pop.icon && pop.events === 1 && JSON.stringify(pop.labels) === JSON.stringify(SIX_CHOICE_LABELS),
				tag + 'シナリオの「イベント/スキル」で小窓が開き、選べるイベント1つ（6択: ' + SIX_CHOICE_LABELS.join('・') + '）が出る', pop);
			await sp.page.keyboard.press('Escape');
			await sleep(sp.page, 200);
			// 育成ウマ娘の「ソート」: その列が得るスキルを上に寄せる（押している列の印 data-sorted）。もう一度で元の並び
			await menuOf('0');
			await sp.page.click('[data-usd-el="colmenu-sort"]');
			await sleep(sp.page, 300);
			const s1 = await sp.page.evaluate(() => [...document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"][data-sorted="1"]')].map((b) => b.getAttribute('data-member-key')));
			await menuOf('0');
			const pressed = await sp.page.evaluate(() => (document.querySelector('[data-usd-el="colmenu-sort"]') || {}).getAttribute('aria-pressed'));
			await sp.page.click('[data-usd-el="colmenu-sort"]');
			await sleep(sp.page, 300);
			const s2 = await sp.page.evaluate(() => document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"][data-sorted="1"]').length);
			assert(JSON.stringify(s1) === '["0"]' && pressed === 'true' && s2 === 0, tag + '育成ウマ娘の「ソート」で並べ替え中の印が付き（メニューの項目は押した状態）、もう一度で外れる', { s1, pressed, s2 });
			assert(await noHScroll(sp.page), tag + '横スクロールなし', '');
			const c = await sp.page.evaluate(scanTextContrastInPage, '#deck-roster-panel .usd-roster-grid');
			assert(c.checked > 0 && c.bad.length === 0, tag + '表の文字のコントラスト 4.5:1 以上', formatContrast(c.bad).slice(0, 5));
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('駿大祭(7) めろっぷの行（2026-10-26a）: シートの新しい8行が決めた位置にあり、後ろの行は8行ぶんずれる（573行・38〜610行目）。効率は新しい7行だけ増える（470件）', async () => {
		const mel = readJson('data/melop-sheet-rows.json').rows, eff = readJson('data/skill-efficiency.json').entries;
		const idx = (n) => mel.findIndex((r) => r.name === n);
		const after = (prev, names) => names.every((n, k) => idx(n) === idx(prev) + 1 + k);
		assert(mel.length === 573 && mel[0].row === 38 && mel[mel.length - 1].row === 610 && mel.every((r, i) => r.row === 38 + i), '駿大祭(7) 573行・行番号は 38 から1ずつ 610 まで', [mel.length, mel[0].row, mel[mel.length - 1].row]);
		assert(after('怯むことなく', ['如才なし', '直感力', '主導権', '死力を尽くして', '遊び心']) && after('規格外', ['弧を描いて', '直情', 'アオハル点火・速']) && after('恩返し、召し上がれ', ['彼方の呼び声']) && after('トレセン軒シナリオ', ['駿大祭シナリオ']),
			'駿大祭(7) 8行の位置: 如才なし・直感力・主導権・死力を尽くして（怯むことなく と 遊び心 の間）／弧を描いて・直情（規格外 の後・アオハル点火・速 の直前）／彼方の呼び声（恩返し、召し上がれ の次）／駿大祭シナリオ（トレセン軒シナリオ の次）', '');
		const g = (n) => mel[idx(n)].group;
		assert(g('駿大祭シナリオ') === g('トレセン軒シナリオ') && mel[idx('駿大祭シナリオ')].id === 'sf-shuntaisai', '駿大祭(7) 駿大祭シナリオの分類はトレセン軒シナリオと同じ（' + g('トレセン軒シナリオ') + '）', g('駿大祭シナリオ'));
		// 2026-10-26（新シナリオの仕上げ）: 適性をすべてAにして書き出したシートに差し替えたので、直感力（ex-1682）・死力を尽くして（ex-1681）・直情（ex-1688）の値が上がった
		const want = { 'ex-1680': [639, 180, 3.548], 'ex-1682': [639, 180, 3.548], 'ex-1679': [617, 180, 3.428], 'ex-1681': [639, 180, 3.548], 'ex-1678': [617, 160, 3.856], 'ex-1688': [639, 190, 3.362], 'ex-1693': [663, 200, 3.315] };
		const got = Object.fromEntries(Object.keys(want).map((id) => { const e = eff.find((x) => x.skillId === id); return [id, e ? [e.score, e.sp, e.efficiency] : null]; }));
		assert(eff.length === 470 && JSON.stringify(got) === JSON.stringify(want) && !eff.some((e) => e.skillId === 'sf-shuntaisai'), '駿大祭(7) 効率は新しい7行（シートの評価点・消費sp・効率）だけ増えて470件。駿大祭シナリオ（0）は持たない', got);
		const order = mel.filter((r) => r.id && eff.some((e) => e.skillId === r.id)).map((r) => r.id);
		assert(JSON.stringify(order) === JSON.stringify(eff.map((e) => e.skillId)), '駿大祭(7) 効率の並びは、めろっぷの行の順', '');
	});
}
