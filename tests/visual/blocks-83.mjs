// ②因子周回の調和の前半（T52・2026-11-01。おいもさんの決定 2026-10-31・C-262 の (1)(2)(5)(6)(7)。モックは T45・T48 の lab/factor-mock.html）の検査。
// run-smoke.mjs の末尾から register83() で呼ばれる（塊の見出しはすべて「T52②因子周回の前半」で始まる。`npm run test:visual -- --only=T52②因子周回の前半` で回せる）。
//
// 決め:
//  (1) ②の合計の行は［N Pt／N種（押すと「②の Pt」の小窓・点線の下線）］［継承固有｜X種｜LvX］［共通スキル｜LvX］［↺］の1行。「?」は無い。↺ は操作の行に無い。
//  (2) 「X種」「LvX」は押すたびに1つ増える（最大の次は最小。種類 2〜6・Lv 1〜5）。保存の形（inheritedUnique は既定と違う値だけ・parentHintLevel は数）は今のまま。
//      字 11px・合計の Pt 20px。375px で1行（行の高さ 36）・1280px で1行（行の高さ 44）。押せる高さ 44px（↺ は 375px で 42px でよい）。
//  (5)(6) ①と②の星取表（②のタイル・分類には置かない）: 4つのアイコンの範囲（と漏斗）全体が並べ替えの入口。どこを押しても同じ小窓。
//      「回復／◎／緑／デバフを上に寄せる」「並べ替えない」から1つ。有効なのは全部で1つだけ（①はメンバーの列の漏斗と、②は列見出しのメニューのソートと）。
//      並べているときは漏斗を塗り、その種類のアイコンに 2px のベースカラーの枠。②の◎は操作の行の◎（◎を○に変えるモード）と同じ状態。
//  (7) ②の除外の段の＋で足すと、次の除外の行の＋の画面上の位置が変わらない（±1px）。フォーカスはその＋（タイル・星取表、375・1280px）。
// 寸法の目標はモック（T45 の報告の C 節・T48 の報告の A 節）の実測。スキル名は検査の側に書かない（恒久ルール1。id だけ）。

import { reloadReady } from './lib/page-ready.mjs';
import { clickSort } from './lib/col-menu.mjs';

export async function register83(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const R = '#deck-roster-panel ';
	// 代表1（T22・T24・T29 と同じ）: ①＝uma-0179＋6枚、②＝24種。SAVED5 はオススメサポの提案のカード（除外の段を出すため）
	const CARD_IDS = ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const REP1 = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417', '125', '124', '6', '27', '33', '230', '16', '23', '147', '117', '118', '145'];
	const R1S = { umaId: 'uma-0179', cardIds: CARD_IDS, outsideOptions: { cards: SAVED5 } };

	/** special.html を、①（下書きの編成）と②の下書きを入れて開く（blocks-79 と同じ作り）。tab: '0'＝①・'1'＝② */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 900 }, EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		await sp.page.evaluate(({ roster, ids, tab, scope }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(Object.assign({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }, scope || {})));
			localStorage.setItem('umaSkillDeck:stepTab', tab);
		}, { roster: R1S, ids: o.ids || REP1, tab: o.tab || '1', scope: o.scope || null });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const setView = async (page, want) => {
		for (let i = 0; i < 3 && (await page.getAttribute(T + '[data-usd-el="factor-view"]', 'data-usd-view')) !== want; i++) { await page.click(T + '[data-usd-el="factor-view"]'); await page.waitForTimeout(300); }
	};
	const popOpen = (page) => page.evaluate(() => {
		const p = document.querySelector('[data-usd-el="info-pop"]');
		if (!p || p.hidden) return null;
		const t = p.querySelector('.uma-popover-title');
		return { title: t ? t.textContent : '', sort: !!p.querySelector('[data-usd-el="tone-sort-list"]'), text: p.textContent };
	});
	const closePop = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
	const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}'));
	/** 合計の行の形 */
	const readBand = (page) => page.evaluate(() => {
		const band = document.querySelector('#deck-template-panel [data-usd-el="set-head"]');
		if (!band) return null;
		const main = band.querySelector('.usd-band-main');
		const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, top: b.top, bottom: b.bottom }; };
		const kids = Array.from(main.querySelectorAll('.usd-band-sumbtn, .usd-uniq, [data-usd-el="factor-reset"]'));
		// 押せる範囲の高さ: 部品の中心の列で、上下に1px ずつ elementFromPoint がその部品（の子）を返す範囲
		const hitH = (el) => {
			const b = el.getBoundingClientRect(), x = b.left + b.width / 2, cy = b.top + b.height / 2;
			const on = (y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
			let up = 0, dn = 0;
			while (up < 40 && on(cy - up - 1)) up++;
			while (dn < 40 && on(cy + dn + 1)) dn++;
			return up + dn + 1;
		};
		const steps = Array.from(band.querySelectorAll('.usd-uniq-step'));
		const reset = band.querySelector('[data-usd-el="factor-reset"]');
		const sum = band.querySelector('[data-usd-el="pt-need-help-btn"]');
		return {
			band: box(band), scroll: main.scrollWidth, client: main.clientWidth, wrap: band.hasAttribute('data-usd-wrap'), fit: band.getAttribute('data-usd-fit'),
			order: kids.map((k) => k.getAttribute('data-usd-el') || k.className), tops: kids.map((k) => Math.round(k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2)),
			pt: getComputedStyle(band.querySelector('.usd-band-pt')).fontSize, uniqFs: Array.from(band.querySelectorAll('.usd-uniq')).map((u) => getComputedStyle(u).fontSize),
			labels: Array.from(band.querySelectorAll('.usd-uniq-label')).map((l) => l.textContent),
			steps: steps.map((s) => ({ el: s.getAttribute('data-usd-el'), tag: s.tagName, text: s.textContent, label: s.getAttribute('aria-label'), hit: hitH(s) })),
			selects: band.querySelectorAll('select').length, help: !!band.querySelector('.usd-band-help, .uma-help-btn'),
			sum: sum ? { tag: sum.tagName, deco: getComputedStyle(sum).textDecorationLine + ' ' + getComputedStyle(sum).textDecorationStyle, hit: hitH(sum), label: sum.getAttribute('aria-label') } : null,
			reset: reset ? { inBand: band.contains(reset), hit: hitH(reset), w: reset.getBoundingClientRect().width, h: reset.getBoundingClientRect().height } : null,
			tierReset: !!document.querySelector('#deck-template-panel [data-usd-el="tier-row"] [data-usd-el="factor-reset"]'),
			tierRow: Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="tier-row"] > *')).map((e) => e.getAttribute('data-usd-el')),
			hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
			bad: /含め|含められません/.test(band.textContent + steps.map((s) => s.getAttribute('aria-label')).join(''))
		};
	});

	for (const w of [375, 1280]) {
		await block('T52②因子周回の前半(1) 合計の行の形（' + w + 'px）: ［N Pt／N種］［継承固有｜X種｜LvX］［共通スキル｜LvX］［↺］の1行・「?」と select は無い・字 11px・Pt 20px・行の高さ ' + (w === 375 ? 36 : 44) + '・押せる高さ 44（↺ は 42 以上）・↺ は操作の行に無い', async () => {
			const sp = await openSp({ w });
			const b = await readBand(sp.page);
			assert(!!b, 'T52②因子周回の前半(1) 前提: 合計の行がある', null);
			assert(b.order.join(',') === 'pt-need-help-btn,uniq,parent-level-group,factor-reset', 'T52②因子周回の前半(1) 並びは 合計・継承固有・共通スキル・↺（' + w + 'px）', b.order);
			assert(b.scroll <= b.client + 0.5 && !b.wrap && new Set(b.tops).size === 1 && !b.hscroll, 'T52②因子周回の前半(1) 1行に収まる（はみ出し・折り返し・横スクロールなし。' + w + 'px）', { scroll: b.scroll, client: b.client, wrap: b.wrap, tops: b.tops, fit: b.fit });
			assert(Math.round(b.band.h) === (w === 375 ? 36 : 44), 'T52②因子周回の前半(1) 行の高さ ' + (w === 375 ? 36 : 44) + 'px（' + w + 'px）', b.band);
			assert(b.pt === '20px' && b.uniqFs.every((f) => f === '11px'), 'T52②因子周回の前半(1) 合計の Pt の字 20px・部品の字 11px（' + w + 'px）', { pt: b.pt, fs: b.uniqFs });
			assert(b.labels.join(',') === '継承固有,共通スキル', 'T52②因子周回の前半(1) ラベルは「継承固有」「共通スキル」', b.labels);
			assert(b.selects === 0 && !b.help, 'T52②因子周回の前半(1) select と「?」のボタンは無い', { selects: b.selects, help: b.help });
			assert(b.steps.length === 3 && b.steps.every((s) => s.tag === 'BUTTON' && s.hit >= 44), 'T52②因子周回の前半(1) X種・LvX・LvX は押すボタン・押せる高さ 44px 以上（' + w + 'px）', b.steps.map((s) => [s.el, s.text, s.hit]));
			assert(b.sum && b.sum.tag === 'BUTTON' && /underline/.test(b.sum.deco) && /dotted/.test(b.sum.deco) && b.sum.hit >= 40, 'T52②因子周回の前半(1) 合計の数字は押すボタン（点線の下線・押せる高さ 40px 以上）', b.sum);
			assert(b.reset && b.reset.inBand && Math.round(b.reset.w) === 28 && Math.round(b.reset.h) === 28 && b.reset.hit >= 42, 'T52②因子周回の前半(1) ↺ は合計の行の右端（28px・押せる高さ 42px 以上）', b.reset);
			assert(!b.tierReset && b.tierRow[0] === 'palette-delete' && b.tierRow.indexOf('factor-reset') === -1 && b.tierRow[b.tierRow.length - 1] === 'factor-view',
				'T52②因子周回の前半(1) 操作の行に ↺ は無い（削除・虫眼鏡・◎・表示）', b.tierRow);
			assert(!b.bad, 'T52②因子周回の前半(1) 文言に「含め…」を使わない', null);
			assert(jsErrors(sp.errors).length === 0, 'T52②因子周回の前半(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	await block('T52②因子周回の前半(2) 押すと数が回る（最大の次は最小）・保存の値は今の形・読み上げ名は今の値と押した後の値・フォーカスは押した部品のまま', async () => {
		const sp = await openSp({ w: 375 });
		const clickStep = async (el) => { await sp.page.click(T + '[data-usd-el="set-head"] [data-usd-el="' + el + '"]'); await sp.page.waitForTimeout(150); };
		const step = (el) => sp.page.evaluate((e) => { const b = document.querySelector('#deck-template-panel [data-usd-el="set-head"] [data-usd-el="' + e + '"]');
			return b ? { text: b.textContent, label: b.getAttribute('aria-label'), focus: document.activeElement === b } : null; }, el);
		// 種類: 既定 6 → 2 → 3 → 4 → 5 → 6
		const counts = [(await step('uniq-count')).text];
		const saved = [];
		for (let i = 0; i < 5; i++) { await clickStep('uniq-count'); counts.push((await step('uniq-count')).text); saved.push((await draft(sp.page)).inheritedUnique || null); }
		assert(counts.join(',') === '6種,2種,3種,4種,5種,6種', 'T52②因子周回の前半(2) 継承固有の種類は 6→2→3→4→5→6（最大の次は最小）', counts);
		assert(JSON.stringify(saved) === JSON.stringify([{ count: 2 }, { count: 3 }, { count: 4 }, { count: 5 }, null]), 'T52②因子周回の前半(2) 保存は今の形（既定の 6種は書かない）', saved);
		const c = await step('uniq-count');
		assert(c.focus && c.label === '継承固有の種類：6種（押すと2種）', 'T52②因子周回の前半(2) 種類の読み上げ名は今の値と押した後の値・フォーカスはそのまま', c);
		// Lv: 既定 3 → 4 → 5 → 1 → 2 → 3
		const lvs = [(await step('uniq-level')).text];
		const saved2 = [];
		for (let i = 0; i < 5; i++) { await clickStep('uniq-level'); lvs.push((await step('uniq-level')).text); saved2.push((await draft(sp.page)).inheritedUnique || null); }
		assert(lvs.join(',') === 'Lv3,Lv4,Lv5,Lv1,Lv2,Lv3', 'T52②因子周回の前半(2) 継承固有のヒントLv は 3→4→5→1→2→3', lvs);
		assert(JSON.stringify(saved2) === JSON.stringify([{ hintLevel: 4 }, { hintLevel: 5 }, { hintLevel: 1 }, { hintLevel: 2 }, null]), 'T52②因子周回の前半(2) 保存は今の形（既定の Lv3 は書かない）', saved2);
		// 共通スキル: 5 → 1 → 2 → 3 → 4 → 5
		const fs5 = [(await step('pt-parent-level')).text];
		const saved3 = [];
		for (let i = 0; i < 5; i++) { await clickStep('pt-parent-level'); fs5.push((await step('pt-parent-level')).text); saved3.push((await draft(sp.page)).parentHintLevel); }
		assert(fs5.join(',') === 'Lv5,Lv1,Lv2,Lv3,Lv4,Lv5', 'T52②因子周回の前半(2) 共通スキルのヒントLv は 5→1→2→3→4→5', fs5);
		assert(saved3.join(',') === '1,2,3,4,5', 'T52②因子周回の前半(2) 共通スキルの保存は数（parentHintLevel）のまま', saved3);
		const f = await step('pt-parent-level');
		assert(f.focus && f.label === '共通スキルのヒントLv：Lv5（押すとLv1）', 'T52②因子周回の前半(2) 共通スキルの読み上げ名・フォーカス', f);
		// 合計は値に合わせて変わる（種類を 2種にすると継承固有の Pt が下がる）
		const pt0 = await sp.page.textContent(T + '[data-usd-el="factor-pt"]');
		await clickStep('uniq-count');
		const pt1 = await sp.page.textContent(T + '[data-usd-el="factor-pt"]');
		assert(pt0 !== pt1, 'T52②因子周回の前半(2) 押すと合計の Pt が変わる（6種 → 2種）', { pt0, pt1 });
		// リロードしても保存の値で出る
		await reloadReady(sp.page);
		await sp.page.waitForSelector(T + '[data-usd-el="set-head"] [data-usd-el="uniq-count"]', { timeout: 20000 });
		assert((await step('uniq-count')).text === '2種', 'T52②因子周回の前半(2) 読み込み直しても保存の値（2種）', await step('uniq-count'));
		assert(jsErrors(sp.errors).length === 0, 'T52②因子周回の前半(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T52②因子周回の前半(3) 合計の数字を押すと「②の Pt」の小窓（継承固有・共通スキルの2行）・↺ は合計の行から今の小窓を開く', async () => {
		const sp = await openSp({ w: 375 });
		await sp.page.click(T + '[data-usd-el="pt-need-help-btn"]');
		await sp.page.waitForTimeout(200);
		const p = await popOpen(sp.page);
		const lines = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-pop"] [data-usd-el="pt-need-uniq"], [data-usd-el="info-pop"] [data-usd-el="pt-need-common"]')).map((e) => e.getAttribute('data-usd-el')));
		const exp = await sp.page.getAttribute(T + '[data-usd-el="pt-need-help-btn"]', 'aria-expanded');
		assert(p && p.title === '②の Pt' && lines.join(',') === 'pt-need-uniq,pt-need-common' && exp === 'true', 'T52②因子周回の前半(3) 数字を押すと「②の Pt」の小窓（2行）', { p, lines, exp });
		await closePop(sp.page);
		await sp.page.click(T + '[data-usd-el="set-head"] [data-usd-el="factor-reset"]');
		await sp.page.waitForTimeout(200);
		const p2 = await popOpen(sp.page);
		const ops = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="factor-reset-ops"] button')).map((b) => b.getAttribute('data-usd-el')));
		assert(p2 && /リセット/.test(p2.title) && ops.join(',') === 'factor-reset-all,factor-reset-cancel', 'T52②因子周回の前半(3) ↺ で今のリセットの小窓', { p2, ops });
		await sp.page.click('[data-usd-el="factor-reset-cancel"]');
		await sp.page.waitForTimeout(200);
		assert(!(await popOpen(sp.page)) && (await draft(sp.page)).skillIds.length === REP1.length, 'T52②因子周回の前半(3) 「やめる」で閉じ、スキルは消えない', null);
		assert(jsErrors(sp.errors).length === 0, 'T52②因子周回の前半(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/** 列見出しの入口の、押してみる点（4つのアイコンの中心・漏斗の中心・入口の四隅の 2px 内側） */
	const headPoints = (page, scope) => page.evaluate((sc) => {
		const cell = document.querySelector(sc + '.usd-roster-gh--skill');
		const entry = cell && cell.querySelector('[data-usd-el="tone-sort-entry"]');
		if (!entry) return null;
		const c = (e) => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
		const e = entry.getBoundingClientRect(), cr = cell.getBoundingClientRect();
		const pts = Array.from(cell.querySelectorAll('.usd-roster-toneicon')).map(c).concat([c(cell.querySelector('[data-usd-el="tone-sort-funnel"]'))])
			.concat([[e.left + 2, e.top + 2], [e.right - 2, e.top + 2], [e.left + 2, e.bottom - 2], [e.right - 2, e.bottom - 2]]);
		const icons = Array.from(cell.querySelectorAll('.usd-roster-toneicon')).map((i) => i.getBoundingClientRect());
		return { pts, hits: pts.map(([x, y]) => { const t = document.elementFromPoint(x, y); return t === entry; }),
			entry: { w: e.width, h: e.height, top: e.top - cr.top, bottom: cr.bottom - e.bottom }, cellH: cr.height,
			cover: icons.every((i) => i.left >= e.left - 0.5 && i.right <= e.right + 0.5), visibleFunnels: Array.from(cell.querySelectorAll('.usd-roster-tonebtn')).filter((f) => getComputedStyle(f).visibility !== 'hidden').length,
			buttons: Array.from(cell.querySelectorAll('button')).map((b) => b.getAttribute('data-usd-el')) };
	}, scope);
	const headState = (page, scope) => page.evaluate((sc) => {
		const cell = document.querySelector(sc + '.usd-roster-gh--skill');
		if (!cell) return null;
		const entry = cell.querySelector('[data-usd-el="tone-sort-entry"]');
		const f = cell.querySelector('[data-usd-el="tone-sort-funnel"]');
		const path = f && f.querySelector('path');
		return { sorted: entry && entry.getAttribute('data-sorted') === '1', label: entry && entry.getAttribute('aria-label'), funnelOn: f && f.getAttribute('data-on') === '1', fill: path ? getComputedStyle(path).fill : '',
			marked: Array.from(cell.querySelectorAll('.usd-roster-toneicon')).filter((i) => i.classList.contains('usd-roster-toneicon--on')).map((i) => i.parentElement.getAttribute('data-tone')),
			outline: Array.from(cell.querySelectorAll('.usd-roster-toneicon--on')).map((i) => getComputedStyle(i).outlineWidth + ' ' + getComputedStyle(i).outlineStyle + ' ' + getComputedStyle(i).outlineColor) };
	}, scope);
	const pickSort = async (page, scope, tone) => {
		await page.click(scope + '[data-usd-el="tone-sort-entry"]');
		await page.waitForTimeout(150);
		await page.click('[data-usd-el="tone-sort-pick"][data-tone="' + (tone || '') + '"]');
		await page.waitForTimeout(250);
	};
	const sortOpts = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-pop"] [data-usd-el="tone-sort-pick"]')).map((i) => ({ tone: i.getAttribute('data-tone'), checked: i.checked, disabled: i.disabled,
		label: i.closest('label').textContent, h: Math.round(i.closest('label').getBoundingClientRect().height) })));
	const ctrlMark = (page) => page.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--uma-control-mark)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });

	for (const w of [375, 1280]) {
		await block('T52②因子周回の前半(4) ①の並べ替えの入口（' + w + 'px）: アイコン4つと漏斗1つの範囲のどこを押しても同じ小窓・入口の押せる範囲 ' + (w === 375 ? '75×48' : '112×72') + '・選ぶと漏斗を塗りアイコンに枠・有効なのは全部で1つだけ', async () => {
			const sp = await openSp({ w, tab: '0' });
			const hp = await headPoints(sp.page, R);
			assert(!!hp, 'T52②因子周回の前半(4) 前提: ①の列見出しに入口がある', null);
			assert(hp.hits.every(Boolean) && hp.cover, 'T52②因子周回の前半(4) アイコン・漏斗・入口の四隅のどこも入口（' + w + 'px）', hp);
			assert(Math.round(hp.entry.w) === (w === 375 ? 75 : 112) && Math.round(hp.entry.h) === (w === 375 ? 48 : 72) && hp.entry.top === 0, 'T52②因子周回の前半(4) 入口は ' + (w === 375 ? '75×48' : '112×72') + '（列見出しの上下いっぱい）', hp.entry);
			assert(hp.visibleFunnels === 1 && hp.buttons.join(',') === 'tone-sort-entry', 'T52②因子周回の前半(4) 見える漏斗は1つ・スキル名の列見出しのボタンは入口だけ', { f: hp.visibleFunnels, b: hp.buttons });
			// どこを押しても同じ小窓
			const seen = [];
			for (const [x, y] of hp.pts) {
				await sp.page.mouse.click(x, y);
				await sp.page.waitForTimeout(150);
				const p = await popOpen(sp.page);
				seen.push(p ? p.title + (p.sort ? ':sort' : '') : null);
				await closePop(sp.page);
			}
			assert(seen.every((s) => s === 'ソート:sort'), 'T52②因子周回の前半(4) 9点のどこを押しても「ソート」の小窓（' + w + 'px。T58 で「並べ替え」から）', seen);
			await sp.page.click(R + '[data-usd-el="tone-sort-entry"]');
			await sp.page.waitForTimeout(150);
			const opts = await sortOpts(sp.page);
			assert(opts.map((o) => o.label).join('|') === '回復スキルでソート|◎と○を切り替えられるスキルでソート|緑スキルでソート|デバフスキルでソート|ソートしない'
				&& opts.every((o) => o.h >= 44) && opts.filter((o) => o.checked).map((o) => o.tone).join(',') === '', 'T52②因子周回の前半(4) 小窓は5つ（補足の字なし・高さ 44px 以上）・はじめは「ソートしない」（T58 で文言を「ソート」に）', opts);
			await closePop(sp.page);
			const s0 = await headState(sp.page, R);
			assert(!s0.sorted && !s0.funnelOn && s0.marked.length === 0, 'T52②因子周回の前半(4) はじめは並べ替えなし（漏斗は塗らない・印なし）', s0);
			const rowsOf = () => sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')).map((r) => ({ id: r.getAttribute('data-skill-id'), heal: r.classList.contains('usd-roster-grow--heal') })));
			const before = await rowsOf();
			await pickSort(sp.page, R, 'heal');
			const s1 = await headState(sp.page, R);
			const mark = await ctrlMark(sp.page);
			assert(s1.sorted && s1.funnelOn && s1.fill !== 'none' && s1.marked.join(',') === 'heal' && s1.outline[0] === '2px solid ' + mark && /回復スキルでソート/.test(s1.label),
				'T52②因子周回の前半(4) 回復を選ぶと漏斗を塗り、回復のアイコンに 2px のベースカラーの枠', { s1, mark });
			const after = await rowsOf();
			assert(before.some((r) => r.heal) && after[0].heal && after.length === before.length, 'T52②因子周回の前半(4) 回復の行が上へ（行の数は変わらない）', { first: after[0], n: [before.length, after.length] });
			assert(await sp.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-usd-el') === 'tone-sort-entry'), 'T52②因子周回の前半(4) 選んだ後のフォーカスは入口', null);
			// ◎: 行の◎／○の切り替えを出す（今と同じ動き）
			await pickSort(sp.page, R, 'circle');
			const s2 = await headState(sp.page, R);
			const toggles = await sp.page.$$eval(R + '[data-usd-act="circle-toggle"]', (l) => l.length);
			assert(s2.marked.join(',') === 'circle' && toggles > 0, 'T52②因子周回の前半(4) ◎を選ぶと◎のアイコンに印・行の◎／○の切り替えが出る', { s2, toggles });
			// メンバーの列の漏斗（ソート）を使うと、種類の並べ替えは切れる（有効なのは全部で1つだけ）
			const key = await sp.page.getAttribute(R + '[data-usd-el="col-menu-btn"]', 'data-member-key');
			await clickSort(sp.page, R, key);
			await sp.page.waitForTimeout(300);
			const s3 = await headState(sp.page, R);
			const toggles3 = await sp.page.$$eval(R + '[data-usd-act="circle-toggle"]', (l) => l.length);
			assert(!s3.sorted && s3.marked.length === 0 && toggles3 === 0, 'T52②因子周回の前半(4) メンバーの列で並べ替えると、種類の並べ替えは外れる', { s3, toggles3 });
			await sp.page.click(R + '[data-usd-el="tone-sort-entry"]');
			await sp.page.waitForTimeout(150);
			const opts3 = await sortOpts(sp.page);
			assert(opts3.every((o) => !o.checked), 'T52②因子周回の前半(4) メンバーの列で並べているときは、小窓のどれにも印が無い', opts3);
			await sp.page.click('[data-usd-el="tone-sort-pick"][data-tone="debuff"]');
			await sp.page.waitForTimeout(250);
			const sorted = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"]')).some((b) => b.getAttribute('data-sorted') === '1' || /並べ替え中/.test(b.getAttribute('aria-label') || '')));
			assert((await headState(sp.page, R)).marked.join(',') === 'debuff' && !sorted, 'T52②因子周回の前半(4) 種類を選ぶと、メンバーの列の並べ替えは外れる', null);
			await pickSort(sp.page, R, null);
			const s4 = await headState(sp.page, R);
			const back = await rowsOf();
			assert(!s4.sorted && !s4.funnelOn && s4.marked.length === 0 && JSON.stringify(back) === JSON.stringify(before), 'T52②因子周回の前半(4) 「並べ替えない」で元の並び', s4);
			assert(jsErrors(sp.errors).length === 0, 'T52②因子周回の前半(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	for (const w of [375, 1280]) {
		await block('T52②因子周回の前半(5) ②の星取表の並べ替えの入口（' + w + 'px）: 星取表だけ・どこを押しても同じ小窓・◎は操作の行の◎と同じ状態・列見出しのメニューのソートと合わせて有効なのは1つだけ', async () => {
			const sp = await openSp({ w });
			const has = () => sp.page.evaluate(() => !!document.querySelector('#deck-template-panel [data-usd-el="tone-sort-entry"]'));
			assert(!(await has()), 'T52②因子周回の前半(5) カード一覧の表示には入口が無い', null);
			await setView(sp.page, 'group');
			assert(!(await has()), 'T52②因子周回の前半(5) 分類の表示には入口が無い', null);
			await setView(sp.page, 'table');
			const hp = await headPoints(sp.page, T);
			assert(!!hp && hp.hits.every(Boolean) && hp.cover && Math.round(hp.entry.w) === (w === 375 ? 75 : 112) && Math.round(hp.entry.h) === (w === 375 ? 48 : 72),
				'T52②因子周回の前半(5) 星取表の列見出しの入口（アイコン・漏斗・四隅のどこも入口・' + (w === 375 ? '75×48' : '112×72') + '）', hp);
			const seen = [];
			for (const [x, y] of hp.pts) {
				await sp.page.mouse.click(x, y);
				await sp.page.waitForTimeout(150);
				const p = await popOpen(sp.page);
				seen.push(p ? p.title + (p.sort ? ':sort' : '') : null);
				await closePop(sp.page);
			}
			assert(seen.every((s) => s === 'ソート:sort'), 'T52②因子周回の前半(5) 9点のどこを押しても「ソート」の小窓（T58 で「並べ替え」から）', seen);
			const circleBtn = () => sp.page.getAttribute(T + '[data-usd-el="factor-circle-mode"]', 'aria-pressed');
			const firstRows = () => sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table-row"]')).slice(0, 3).map((r) => ({ id: r.getAttribute('data-fstar-id'), toggle: !!r.querySelector('[data-usd-el="factor-circle-toggle"]') })));
			const rows0 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table-row"]')).map((r) => r.getAttribute('data-fstar-id')));
			// 小窓で◎ → 操作の行の◎も入る・◎の候補の行が上・切り替えが出る
			await pickSort(sp.page, T, 'circle');
			const st1 = await headState(sp.page, T);
			const fr1 = await firstRows();
			assert(st1.marked.join(',') === 'circle' && st1.funnelOn && (await circleBtn()) === 'true' && fr1[0].toggle, 'T52②因子周回の前半(5) 小窓で◎を選ぶと操作の行の◎も入り、◎の候補の行が上（切り替えが出る）', { st1, fr1 });
			// 操作の行の◎で終える → 小窓の並べ替えも外れる・元の並び
			await sp.page.click(T + '[data-usd-el="factor-circle-mode"]');
			await sp.page.waitForTimeout(250);
			const st2 = await headState(sp.page, T);
			const rows2 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table-row"]')).map((r) => r.getAttribute('data-fstar-id')));
			assert(!st2.sorted && st2.marked.length === 0 && (await circleBtn()) === 'false' && JSON.stringify(rows2) === JSON.stringify(rows0), 'T52②因子周回の前半(5) 操作の行の◎で終えると、並べ替えも外れて元の並び', st2);
			// 操作の行の◎で入る → 入口の◎も入っている
			await sp.page.click(T + '[data-usd-el="factor-circle-mode"]');
			await sp.page.waitForTimeout(250);
			const st3 = await headState(sp.page, T);
			await sp.page.click(T + '[data-usd-el="tone-sort-entry"]');
			await sp.page.waitForTimeout(150);
			const o3 = await sortOpts(sp.page);
			await closePop(sp.page);
			assert(st3.marked.join(',') === 'circle' && o3.find((o) => o.checked).tone === 'circle', 'T52②因子周回の前半(5) 操作の行の◎で入ると、入口と小窓も◎', { st3, o3 });
			// 緑を選ぶ → ◎のモードは切れる・緑の行が上
			await pickSort(sp.page, T, 'passive');
			const st4 = await headState(sp.page, T);
			const passiveTop = await sp.page.evaluate(() => { const r = document.querySelector('#deck-template-panel [data-usd-el="factor-table-row"]'); return !!(r && r.querySelector('.usd-roster-skillname--passive')); });
			assert(st4.marked.join(',') === 'passive' && (await circleBtn()) === 'false' && passiveTop, 'T52②因子周回の前半(5) 緑を選ぶと◎のモードは切れて、緑の行が上', { st4, passiveTop });
			// 列見出しのメニューのソート → 種類の並べ替えは外れる
			const key = await sp.page.getAttribute(T + '[data-usd-el="factor-col-menu"]', 'data-member-key');
			await sp.page.click(T + '[data-usd-el="factor-col-menu"][data-member-key="' + key + '"]');
			await sp.page.waitForTimeout(150);
			await sp.page.click('[data-usd-el="colmenu-sort"]');
			await sp.page.waitForTimeout(250);
			const st5 = await headState(sp.page, T);
			const colSorted = await sp.page.getAttribute(T + '[data-usd-el="factor-col-menu"][data-member-key="' + key + '"]', 'data-sorted');
			assert(!st5.sorted && st5.marked.length === 0 && colSorted === '1', 'T52②因子周回の前半(5) 列見出しのメニューでソートすると、種類の並べ替えは外れる', { st5, colSorted });
			// 列のソート中に◎（操作の行）→ 列のソートは外れる
			await sp.page.click(T + '[data-usd-el="factor-circle-mode"]');
			await sp.page.waitForTimeout(250);
			const colSorted2 = await sp.page.getAttribute(T + '[data-usd-el="factor-col-menu"][data-member-key="' + key + '"]', 'data-sorted');
			assert(colSorted2 === null && (await headState(sp.page, T)).marked.join(',') === 'circle', 'T52②因子周回の前半(5) ◎を入れると列見出しのソートは外れる', colSorted2);
			// 列のソート中に小窓を開くと、どれにも印が無い
			await sp.page.click(T + '[data-usd-el="factor-col-menu"][data-member-key="' + key + '"]');
			await sp.page.waitForTimeout(150);
			await sp.page.click('[data-usd-el="colmenu-sort"]');
			await sp.page.waitForTimeout(250);
			await sp.page.click(T + '[data-usd-el="tone-sort-entry"]');
			await sp.page.waitForTimeout(150);
			const o6 = await sortOpts(sp.page);
			assert(o6.every((o) => !o.checked) && (await circleBtn()) === 'false', 'T52②因子周回の前半(5) 列見出しのソート中は、小窓のどれにも印が無い（◎のモードも切れている）', o6);
			await sp.page.click('[data-usd-el="tone-sort-pick"][data-tone=""]');
			await sp.page.waitForTimeout(250);
			const rows7 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-table-row"]')).map((r) => r.getAttribute('data-fstar-id')));
			assert(JSON.stringify(rows7) === JSON.stringify(rows0) && (await sp.page.getAttribute(T + '[data-usd-el="factor-col-menu"][data-member-key="' + key + '"]', 'data-sorted')) === null,
				'T52②因子周回の前半(5) 「並べ替えない」で列のソートも外れて元の並び', null);
			assert(jsErrors(sp.errors).length === 0, 'T52②因子周回の前半(5) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	for (const w of [375, 1280]) {
		for (const view of ['cards', 'table']) {
			await block('T52②因子周回の前半(6) 除外の段の＋で足しても表示の位置が飛ばない（' + w + 'px・' + (view === 'cards' ? 'タイル' : '星取表') + '）: 次の＋の画面上の位置 ±1px・フォーカスはその＋', async () => {
				const sp = await openSp({ w });
				await setView(sp.page, view);
				const offIds = await sp.page.$$eval(T + '[data-usd-el="factor-enable"]', (l) => l.map((b) => b.getAttribute('data-off-skill-id')));
				assert(offIds.length >= 4, 'T52②因子周回の前半(6) 前提: 除外の行が4つ以上ある', offIds.length);
				const res = [];
				// 3つ目の＋と、真ん中の＋（ページの下端の近くは画面の下の固定の帯に隠れるので使わない）
				for (const k of ['third', 'middle']) {
					const ids = await sp.page.$$eval(T + '[data-usd-el="factor-enable"]', (l) => l.map((b) => b.getAttribute('data-off-skill-id')));
					const i = k === 'third' ? 2 : Math.floor(ids.length / 2);
					const id = ids[i], next = ids[i + 1];
					// 押す＋を画面の中ほどに置く（広い幅の星取表は表の箱の中でもスクロールするので、箱の中でも中ほどに）。押すのは座標で（押す前に自動でスクロールさせない）
					const pt = await sp.page.evaluate((x) => {
						const b = document.querySelector('#deck-template-panel [data-usd-el="factor-enable"][data-off-skill-id="' + x + '"]');
						for (let n = b.parentElement; n && n !== document.body; n = n.parentElement) {
							const cs = getComputedStyle(n);
							if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) { const nr = n.getBoundingClientRect(), r0 = b.getBoundingClientRect(); n.scrollTop += (r0.top - nr.top) - n.clientHeight / 2; }
						}
						window.scrollBy(0, b.getBoundingClientRect().top - innerHeight / 2);
						const r = b.getBoundingClientRect();
						return [r.left + r.width / 2, r.top + r.height / 2];
					}, id);
					await sp.page.waitForTimeout(200);
					const topOf = (x) => sp.page.evaluate((y) => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-enable"][data-off-skill-id="' + y + '"]'); return b ? b.getBoundingClientRect().top : null; }, x);
					const t0 = await topOf(next);
					const hitOk = await sp.page.evaluate(([x, y, i]) => { const t = document.elementFromPoint(x, y); return !!t && !!t.closest('[data-off-skill-id="' + i + '"]'); }, [pt[0], pt[1], id]);
					assert(hitOk, 'T52②因子周回の前半(6) 前提: 押す点にその＋がある（' + k + '）', pt);
					await sp.page.mouse.click(pt[0], pt[1]);
					await sp.page.waitForTimeout(400);
					const t1 = await topOf(next);
					const focus = await sp.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-off-skill-id'));
					const added = (await draft(sp.page)).skillIds.indexOf(id) !== -1;
					res.push({ i, id, next, t0, t1, focus, added });
				}
				assert(res.every((r) => r.added && r.t0 !== null && r.t1 !== null && Math.abs(r.t1 - r.t0) <= 1), 'T52②因子周回の前半(6) 足した後も次の＋の画面上の位置は ±1px（' + w + 'px・' + view + '）', res);
				assert(res.every((r) => r.focus === r.next), 'T52②因子周回の前半(6) フォーカスは次の＋', res.map((r) => [r.next, r.focus]));
				assert(jsErrors(sp.errors).length === 0, 'T52②因子周回の前半(6) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			});
		}
	}
}
