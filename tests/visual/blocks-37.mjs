// 条件で検索の小窓の「効果「…」以下を除外」トグル（2026-10-18）の検査。run-smoke.mjs の末尾から register37() で呼ばれる
// （塊の見出しはすべて「低効果トグル」で始まる。`npm run test:visual -- --only=低効果トグル` で回せる）。
//
// 決め（おいもさん）: 「表示中を全て選択」の右隣に、トグル「効果「（lowEffectMax の段階の名前）」以下を除外（N件）」。既定はOFF（全部見える）。
//   ONにすると、低効果（そのスキルの最大の効果の段階が lowEffectMax 以下。isLowEffectSkill）が、一覧・全選択の対象・絞り込み結果の件数から外れる。
//   効果量が分からないスキルは外さない。状態は小窓の中だけ（閉じたら既定のOFF）。押す場所は44px以上。段階の名前はデータから読む（コードに書かない）。
//   オススメサポの除外（既存の「低効果」）には影響しない。
// スキル名は検査の側に書かない（恒久ルール1）。

import { reloadReady } from './lib/page-ready.mjs';
export async function register37(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const EL = readJson('data/skill-effect-levels.json');
	const RANK = new Map(EL.stages.map((s) => [s.key, s.rank]));
	const LOW_KEY = EL.lowEffectMax.key;
	const LOW_IDS = new Set(EL.entries.filter((e) => e.maxStage !== null && RANK.get(e.maxStage) <= EL.lowEffectMax.rank).map((e) => e.skillId));
	const NULL_IDS = new Set(EL.entries.filter((e) => e.maxStage === null).map((e) => e.skillId));

	const openSp = async (w = 390) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: 900 }, EMPTY);
		await sp.page.evaluate(() => { localStorage.setItem('umaSkillDeck:stepTab', '1'); });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(400);
		await sp.page.evaluate(() => UmaSkillDeckCore.loadSkillPtData(false));
		return sp;
	};
	const open = async (page) => { await page.evaluate(() => UmaSkillDeckCore.openSkillPicker([], () => {})); await page.waitForTimeout(500); };
	const filterBy = async (page, axis, value) => { await page.evaluate(({ axis, value }) => { const c = document.querySelector('[data-usd-el="filter-check"][data-axis="' + axis + '"][data-value="' + value + '"]'); if (c && !c.checked) c.click(); }, { axis, value }); await page.waitForTimeout(300); };
	const read = (page) => page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('[data-usd-el="results"] label.usd-row')).filter((r) => !r.classList.contains('usd-row--excluded'));
		const tg = document.querySelector('[data-usd-el="low-toggle"]');
		const box = document.querySelector('[data-usd-act="picker-low-effect"]');
		const r = tg ? tg.getBoundingClientRect() : null;
		return {
			count: document.querySelector('[data-usd-el="result-count"]').textContent,
			addable: rows.length,
			ids: rows.map((x) => x.querySelector('input').value),
			shown: !!tg && !tg.hidden && getComputedStyle(tg).display !== 'none',
			checked: !!box && box.checked,
			text: tg ? tg.textContent.replace(/\s+/g, '') : '',
			h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0,
			foot: (document.querySelector('[data-usd-el="picker-checked-count"]') || {}).textContent,
			selectAll: (() => { const s = document.querySelector('[data-usd-act="picker-select-all"]'); return s ? s.checked : null; })(),
			modalText: (document.querySelector('.usd-modal-panel') || {}).textContent || '',
			overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
		};
	});

	await block('低効果トグル(1) 既定はOFF（全部見える）。文の段階の名前は lowEffectMax から読み、件数は絞り込み結果に含まれる低効果のスキル数', async () => {
		const sp = await openSp();
		await open(sp.page);
		await filterBy(sp.page, 'distance', 'short');
		const a = await read(sp.page);
		const n = a.ids.filter((id) => LOW_IDS.has(id)).length;
		assert(a.shown && a.checked === false, '低効果トグル(1) トグルが出ていて、既定はOFF', { shown: a.shown, checked: a.checked });
		assert(a.text === '効果「' + LOW_KEY + '」以下を除外（' + n + '件）', '低効果トグル(1) 文は「効果「（lowEffectMax の段階）」以下を除外（N件）」で、N は一覧の低効果の数（独立に数えた値と一致）', { text: a.text, n, LOW_KEY });
		assert(n > 0 && a.count === a.addable + '件', '低効果トグル(1) OFFでは一覧に低効果のスキルが並び、件数は一覧の行数と同じ（絞り込み結果' + a.count + '）', { n, count: a.count, addable: a.addable });
		// T27（2026-10-31・おいもさんの決定）: 44 → 28px（T21 のモックの値。段7c の基準 24px 以上は保つ）
		assert(a.h >= 28 && a.h >= 24, '低効果トグル(1) 押す場所は28px以上（T27。それまでは44px以上）', { h: a.h });
		assert(!/ヒント|必ず合う|合うことがある|合わない/.test(a.modalText) && a.overflowX === false, '低効果トグル(1) 小窓に「ヒント」「必ず合う／合うことがある／合わない」の語が出ず、横スクロールも出ない', { overflowX: a.overflowX });
		await sp.ctx.close();
	});

	await block('低効果トグル(2) ONで低効果が一覧・件数・「表示中を全て選択」から外れる（効果量が分からないスキルは外さない）／閉じて開き直すと既定のOFF', async () => {
		const sp = await openSp();
		await open(sp.page);
		await filterBy(sp.page, 'distance', 'short');
		const off = await read(sp.page);
		await sp.page.click('[data-usd-act="picker-low-effect"]');
		await sp.page.waitForTimeout(300);
		const on = await read(sp.page);
		const lowOff = off.ids.filter((id) => LOW_IDS.has(id));
		assert(on.checked === true && on.ids.every((id) => !LOW_IDS.has(id)) && on.ids.length === off.ids.length - lowOff.length && on.count === on.ids.length + '件',
			'低効果トグル(2) ONでは低効果の行が一覧から消え、絞り込み結果の件数が減る（OFFのとき ' + off.count + ' → ' + on.count + '）', { off: off.ids.length, on: on.ids.length, low: lowOff.length });
		assert(on.text === off.text, '低効果トグル(2) 文に添える件数は、ON／OFFで変わらない（押す前の件数）', { off: off.text, on: on.text });
		const nullInOff = off.ids.filter((id) => NULL_IDS.has(id));
		assert(nullInOff.every((id) => on.ids.includes(id)), '低効果トグル(2) 効果量が分からないスキル（maxStage が null）は、ONでも外さない', { nullInOff });
		// 表示中を全て選択の対象は、ONのときの一覧と一致
		await sp.page.click('[data-usd-act="picker-select-all"]');
		await sp.page.waitForTimeout(300);
		const sel = await read(sp.page);
		assert(sel.foot === on.ids.length + '種選択' && sel.selectAll === true, '低効果トグル(2) ONで「表示中を全て選択」を押すと、いま見えている行（' + on.ids.length + '種）だけが選ばれる', { foot: sel.foot, n: on.ids.length });
		// OFFへ戻すと一覧が戻り、全選択のチェックは外れる（戻った低効果の行は選ばれていない）
		await sp.page.click('[data-usd-act="picker-low-effect"]');
		await sp.page.waitForTimeout(300);
		const back = await read(sp.page);
		assert(back.ids.length === off.ids.length && back.selectAll === false, '低効果トグル(2) OFFへ戻すと一覧がもとの件数に戻る', { back: back.ids.length, off: off.ids.length });
		// 閉じて開き直すと既定のOFF
		await sp.page.click('[data-usd-act="picker-low-effect"]');
		await sp.page.click('[data-usd-act="picker-close"]');
		await sp.page.waitForTimeout(300);
		await open(sp.page);
		const re = await read(sp.page);
		assert(re.checked === false, '低効果トグル(2) 小窓を閉じて開き直すと、既定のOFFに戻る（保存しない）', re.checked);
		await sp.ctx.close();
	});

	await block('低効果トグル(3) オススメサポの除外の「低効果」には影響しない／効果量のデータを読めないときはトグルを出さない', async () => {
		const sp = await openSp();
		const pop = () => sp.page.evaluate(() => { const C = UmaSkillDeckCore; return { all: C.outside.populationOf({ outsideOptions: { exclude: {} } }).ids.length, low: C.outside.populationOf({ outsideOptions: { exclude: { extra: ['lowEffect'] } } }).ids.length }; });
		await sp.page.evaluate(() => UmaSkillDeckCore.loadSkillEffectLevels());
		const before = await pop();
		await open(sp.page);
		await sp.page.click('[data-usd-act="picker-low-effect"]');
		await sp.page.waitForTimeout(200);
		const after = await pop();
		assert(JSON.stringify(before) === JSON.stringify(after) && before.low < before.all, '低効果トグル(3) 条件で検索のトグルをONにしても、オススメサポの母集団（既存の「低効果」の除外）は変わらない', { before, after });
		await sp.ctx.close();
		// 効果量のデータが読めないとき
		const sp2 = await openPage(browser, base, 'special.html', { width: 390, height: 900 }, EMPTY);
		await sp2.page.route('**/data/skill-effect-levels.json*', (r) => r.fulfill({ status: 500, body: 'x' }));
		await sp2.page.evaluate(() => { localStorage.setItem('umaSkillDeck:stepTab', '1'); });
		await reloadReady(sp2.page);
		for (let i = 0; i < 2; i++) if (await sp2.page.isVisible('#ui-notice')) await sp2.page.click('[data-act="notice-ok"]');
		await sp2.page.evaluate(() => UmaSkillDeckCore.loadSkillPtData(false));
		await open(sp2.page);
		const f = await read(sp2.page);
		assert(f.shown === false && f.addable > 0, '低効果トグル(3) 効果量のデータを読めないときは、トグルを出さず、一覧は今までどおり出る', { shown: f.shown, addable: f.addable });
		await sp2.ctx.close();
	});
}
