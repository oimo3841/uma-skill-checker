// 新シナリオ（駿大祭）の受け入れと入れ替え（2026-10-26）の検査。
// run-smoke.mjs の末尾から register53() で呼ばれる（塊の見出しはすべて「駿大祭」で始まる。`npm run test:visual -- --only=駿大祭` で回せる）。
//
// (1) ①の表: シナリオの列は実データの先頭（駿大祭）・見出しの印は新しいシナリオアイコン・列にスキルは出ない／育成ウマ娘の印は新しいキャラアイコン（タイル・列見出し）
// (2) 進化の小窓のシナリオ: 駿大祭の6件が選べる／(3) ③のシナリオ因子の一覧に「駿大祭シナリオ」（25種）
// (4) ①のサポカの選択で ［巫女］吾妻（card-0566）が選べる／(5) UmaExam ①の「新シナリオへの対応が未完了です。」の1行（文面・位置・色・コントラスト）
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
	const UMA_SRC = 'img/icon-uma-2026-10-26.png', SCEN_SRC = 'img/icon-scenario-2026-10-26.png';
	const VIEWS = [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']];

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
	const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

	await block('駿大祭(1) ①の表: シナリオの列は実データの先頭（駿大祭）・見出しの印は新しいシナリオアイコン・列にスキルは出ない／育成ウマ娘の印は新しいキャラアイコン（タイル・列見出し）。◆とどんぶりは無い（390・1280 × ライト・ダーク）', async () => {
		assert(SCEN_NAME === '駿大祭' && SCEN_REAL.entries[0].events.length === 0, '駿大祭(1) データ: 先頭のシナリオは駿大祭で、イベントのスキルはまだ無い（events が空）', SCEN_REAL.entries.map((e) => e.scenario));
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
					name: last ? last.textContent.trim() : null,
					scen: img(last, SCEN_SRC), umaHead: img(umaHead, UMA_SRC), umaTile: img(P.querySelector('[data-usd-el="pick-uma"]'), UMA_SRC),
					old: P.querySelectorAll('.usd-roster-evdiamond, .usd-roster-bowl').length + document.querySelectorAll('.usd-roster-umamark:not(img)').length,
					rows: rows.length, marked: scenCells.filter((c) => c && (c.querySelector('.usd-roster-got, .usd-roster-maybe') || c.textContent.trim() !== '')).length
				};
			}, { UMA_SRC, SCEN_SRC });
			assert(r.name === '駿大祭' && r.scen && r.scen.ok && r.scen.w === 16 && r.scen.alt === 'シナリオ『駿大祭』', tag + 'シナリオの列の見出しは「駿大祭」・印は新しいシナリオアイコン（16px＝見出しの高さを変えない・alt はシナリオ名）', r);
			assert(r.umaHead && r.umaHead.ok && r.umaHead.w === 16 && r.umaTile && r.umaTile.ok && r.umaTile.w === 20 && r.umaTile.alt === '育成ウマ娘', tag + '育成ウマ娘の印は新しいキャラアイコン（列見出し 16px・タイル 20px）', { head: r.umaHead, tile: r.umaTile });
			assert(r.old === 0, tag + '◆（CSS で描いた印）とどんぶりの SVG は、どこにも無い', r.old);
			assert(r.rows > 0 && r.marked === 0, tag + 'シナリオの列にはスキルが出ない（' + r.rows + '行とも空）', r);
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

	await block('駿大祭(5) UmaExam ①の「新シナリオへの対応が未完了です。」: 文面 byte 一致・「既定として登録済みの133種…」の文の上・色は注意の赤（--uma-danger-text）・地に対して 4.5:1 以上（390・1280 × ライト・ダーク）', async () => {
		for (const [w, theme] of VIEWS) {
			const tag = '駿大祭(5) ' + w + '・' + theme + ': ';
			const r0 = await openPage(browser, base, 'exam.html', { width: w, height: w === 1280 ? 900 : 844 });
			await r0.page.evaluate((t) => { localStorage.setItem('uma-tools-theme', t); }, theme);
			await r0.page.reload({ waitUntil: 'networkidle' });
			await r0.page.waitForTimeout(800);
			for (let i = 0; i < 3; i++) if (await r0.page.isVisible('#ui-notice')) { await r0.page.click('#ui-notice-ok'); await r0.page.waitForTimeout(300); }
			const r = await r0.page.evaluate(() => {
				const e = document.getElementById('melop-scenario-note');
				if (!e) return null;
				const nx = e.nextElementSibling;
				const probe = document.createElement('i'); probe.style.color = 'var(--uma-danger-text)'; document.body.appendChild(probe);
				const danger = getComputedStyle(probe).color; probe.remove();
				return { text: e.textContent, inStep1: !!e.closest('#step-panel-1'), next: nx ? nx.textContent : '', color: getComputedStyle(e).color, danger, visible: e.getBoundingClientRect().height > 0, theme: document.documentElement.getAttribute('data-theme') };
			});
			assert(r && r.text === '新シナリオへの対応が未完了です。' && r.inStep1 && r.next.startsWith('既定として登録済みの133種を対象にします。「対象スキルの範囲」で調整可能です。'), tag + '文面が一致し、①の「既定として…」の文の直前にある', r);
			assert(r && r.visible && r.color === r.danger, tag + '見えていて、色は --uma-danger-text', r && { color: r.color, danger: r.danger, theme: r.theme });
			const c = await r0.page.evaluate(scanTextContrastInPage, '#melop-scenario-note');
			assert(c.checked === 1 && c.bad.length === 0 && c.undecided.length === 0, tag + '地に対して 4.5:1 以上', { bad: formatContrast(c.bad), undecided: c.undecided });
			assert(await noHScroll(r0.page), tag + '横スクロールなし', '');
			assert(jsErrors(r0.errors).length === 0, tag + 'コンソールのエラー0', r0.errors.slice(0, 3));
			await r0.ctx.close();
		}
	});
}
