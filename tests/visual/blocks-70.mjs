// ②因子周回の絞り込みの選択欄・小窓の題名の右の①の絞り込みの値・件数の文の値（C-244・2026-10-30 おいもさんの決定）の検査。
// run-smoke.mjs の末尾から register70() で呼ばれる（塊の見出しはすべて「②絞り込み欄」で始まる。`npm run test:visual -- --only=②絞り込み欄` で回せる）。
//
// 決め（おいもさん・2026-10-30）:
//  (1) ②の合計の行と「オススメサポ」「脚質オススメ」の行の間に、①と同じ形式の距離・脚質・バ場の選択欄（操作できる）。値は同じセットの①の絞り込み（roster.skillFilter）に
//      書く（①と共有。②専用の保存は無い）。部品・選択肢・「指定なし」・レースで固定した軸の扱いは①と同じ。
//  (2) ①が空のときの①のパネルは今のまま（選択欄を足さない）。
//  (3) 「条件で検索」とオススメサポの小窓の題名の右に、今の選択（例「中距離・先行・芝」）。表示だけ。未指定の軸は出さない。すべて未指定なら何も出さない。
//  (4) 件数の文に値: 「①の絞り込み（中距離・先行・芝）に合わないため選べない N件」／短い形「①の絞り込み（中距離・先行・芝）L件」。320px で入らなければ2行まで。
// 寸法の固定値は、変更前の commit（a8ac097）の見た目を実測したもの（実装の側の値を読んで書いていない）:
//   ②の入口: 合計の帯 375px 66・1280px 44／入口の行（.usd-skillgroup-head）375px 37・1280px 36／帯と白い枠の間 8（本文の gap）。
//   ①の選択欄のセレクトの高さ 28（special.html の body .usd-roster-filtersel）。
//   「条件で検索」の見出しの高さ 375px・320px・393px 45・1280px 61。オススメサポの見出しの高さ 375px・320px 65・1280px 53。
//   件数の行（「絞り込み結果（N件）」の段落）: 375px・320px で値の無い長い文（本育成編成＋①の絞り込み）のとき 32（2行）。
//   結果の見える行（C-241 の最小）: 320×568 で3行・393×700 で5行。
import { reloadReady } from './lib/page-ready.mjs';
import { pickEntry } from './lib/entry-search.mjs';
import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';

export async function register70(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const P = '#deck-roster-panel ';
	const FF = T + '[data-usd-el="factor-filter"] ';
	const AXES = ['distance', 'style', 'surface'];
	const FILTER = { distance: 'medium', style: 'senko', surface: 'turf' };
	const NOCARDS = [null, null, null, null, null, null];
	const SNAP = (row) => { const o = { id: row.id }; ['name', 'date', 'dateLabel', 'venue', 'surface', 'distance', 'distanceCategory', 'direction', 'course', 'season', 'weather', 'ground', 'time', 'rule'].forEach((k) => { o[k] = row[k] === undefined ? null : row[k]; }); return o; };
	const R0 = readJson('data/upcoming-races.json').races.find((r) => r.id === 'race-0004');

	/** special を②で開く（下書きのセット。roster は下書きの①。null なら①は空） */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, o.data || EMPTY);
		await sp.page.emulateMedia({ colorScheme: o.theme || 'light' });
		await sp.page.evaluate(({ roster, theme }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: o.roster === undefined ? null : o.roster, theme: o.theme || 'light' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(FF + 'select', { timeout: 10000 });
		await sp.page.waitForTimeout(300);
		return sp;
	};
	/** 選択欄の見え方（②は factor-filter、①は filter-row） */
	const readRow = (page, root, act) => page.evaluate(({ root, act }) => Array.from(document.querySelectorAll(root + 'select[data-usd-act="' + act + '"]')).map((s) => {
		const lab = s.closest('label');
		const cs = getComputedStyle(s);
		return { axis: s.getAttribute('data-axis'), value: s.value, disabled: s.disabled, on: s.classList.contains('usd-roster-filtersel--on'),
			lock: !!lab.querySelector('[data-usd-el="filter-lock"]'), locked: lab.getAttribute('data-usd-locked') === '1', aria: s.getAttribute('aria-label'),
			options: Array.from(s.options).map((x) => x.value + ':' + x.textContent), cls: s.className, labCls: lab.className,
			style: ['height', 'font-size', 'font-weight', 'border-radius', 'background-color', 'color', 'border-top-color', 'padding-left'].map((k) => cs.getPropertyValue(k)).join('|') };
	}), { root, act });
	const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'));
	const pick2 = async (page, axis, v) => { await page.selectOption(FF + 'select[data-axis="' + axis + '"]', v); await page.waitForTimeout(250); };
	const goTab = async (page, n) => { await page.click('#step-tab-' + n); await page.waitForTimeout(300); };
	/** 小窓の題名の右の値・件数の文 */
	const readPicker = (page) => page.evaluate(() => {
		const sel = document.querySelector('[data-usd-el="picker-roster-filter"]');
		// T27（2026-10-31）: 件数の文（result-excluded）は消した。無いときは label が空・lines が 0
		const lab = document.querySelector('[data-usd-el="result-excluded"]');
		const head = document.querySelector('.usd-modal:not([hidden]) .usd-picker-head');
		const title = document.querySelector('[data-usd-el="picker-title"]');
		const lines = !lab || lab.hidden ? 0 : new Set(Array.from(lab.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
		const sb = sel.getBoundingClientRect(), tb = title.getBoundingClientRect();
		return { sel: sel.hidden ? '' : sel.textContent, selShown: !sel.hidden && sb.width > 0, tag: sel.tagName, tabindex: sel.getAttribute('tabindex'), role: sel.getAttribute('role'),
			selRightOfTitle: sb.left >= tb.right - 0.5 && Math.abs((sb.top + sb.bottom) / 2 - (tb.top + tb.bottom) / 2) < 4, headH: Math.round(head.getBoundingClientRect().height),
			// 横にはみ出さない: 件数の段落は flex の子で、文が折り返さないと段落ごと広がる（親の右端と比べても捕まらない）。小窓の本文の内側の右端と、本文の横スクロールで見る
			label: !lab || lab.hidden ? '' : lab.textContent, lines, fits: (() => {
				const body = document.querySelector('[data-usd-el="picker-body"]');
				const br = body.getBoundingClientRect().right - parseFloat(getComputedStyle(body).paddingRight);
				return body.scrollWidth <= body.clientWidth + 1 && (!lab || lab.hidden || (lab.getBoundingClientRect().right <= br + 0.5 && lab.parentElement.getBoundingClientRect().right <= br + 0.5));
			})(),
			countRowH: Math.round(document.querySelector('[data-usd-el="result-count"]').parentElement.getBoundingClientRect().height),
			hx: document.documentElement.scrollWidth > innerWidth + 1 };
	});
	const readOutside = (page) => page.evaluate(() => {
		const M = document.querySelector('[data-usd-el="outside-modal"]');
		const sel = M.querySelector('[data-usd-el="outside-roster-filter"]');
		const title = M.querySelector('.usd-out-title');
		const sb = sel.getBoundingClientRect(), tb = title.getBoundingClientRect();
		return { sel: sel.hidden ? '' : sel.textContent, selShown: !sel.hidden && sb.width > 0, tag: sel.tagName, tabindex: sel.getAttribute('tabindex'), role: sel.getAttribute('role'),
			selRightOfTitle: sb.left >= tb.right - 0.5 && Math.abs((sb.top + sb.bottom) / 2 - (tb.top + tb.bottom) / 2) < 4,
			headH: Math.round(M.querySelector('.usd-out-head').getBoundingClientRect().height), hx: document.documentElement.scrollWidth > innerWidth + 1 };
	});
	const openPicker = async (page, act = 'editor-pick') => {
		await pickEntry(page, act);
		if (act === 'editor-pick') await page.waitForSelector('[data-usd-el="results"] .usd-row', { timeout: 20000 });
		await page.waitForTimeout(350);
	};
	const closePicker = async (page) => { await page.click('[data-usd-act="picker-close"]'); await page.waitForTimeout(250); };
	const openOutside = async (page) => {
		await page.click(T + '[data-usd-act="outside-open"]');
		await page.waitForSelector('[data-usd-el="outside-modal"]:not([hidden])');
		await page.waitForTimeout(600);
	};
	const closeOutside = async (page) => { await page.click('[data-usd-el="outside-modal"] [data-usd-act="outside-close"]'); await page.waitForTimeout(250); };
	/** 値の並びの期待値（検査の側で TAG_AXES の選択肢の表示名から組む） */
	const valueText = (page, sel) => page.evaluate(({ sel, axes }) => {
		const C = UmaSkillDeckCore;
		return axes.map((k) => { const ax = C.TAG_AXES.find((a) => a.key === k); const o = sel[k] ? C.pickableOptions(ax).find((x) => x.v === sel[k]) : null; return o ? o.t : ''; }).filter(Boolean).join('・');
	}, { sel, axes: AXES });

	await block('②絞り込み欄(1) ①と同じ部品・同じ値: 選択肢・「指定なし」・見た目は①と同じ／②で選ぶと①の skillFilter に書かれ①に見える／①で選ぶと②に見える／指定なしに戻すと項目が消える', async () => {
		const sp = await openSp({ roster: { umaId: 'uma-0001', cardIds: NOCARDS } });
		const p = sp.page;
		const r2 = await readRow(p, FF, 'factor-filter');
		await goTab(p, 0);
		const r1 = await readRow(p, P, 'filter');
		const same = (a, b) => a.length === 3 && b.length === 3 && a.every((x, i) => x.axis === b[i].axis && x.options.join() === b[i].options.join() && x.cls === b[i].cls && x.labCls === b[i].labCls && x.aria === b[i].aria && x.value === b[i].value);
		assert(r2.map((x) => x.axis).join() === AXES.join() && same(r2, r1) && r2.every((x) => x.value === '' && x.options[0] === ':' + { distance: '距離', style: '脚質', surface: 'バ場' }[x.axis] + '指定なし'),
			'②絞り込み欄(1) ②の選択欄は距離・脚質・バ場の3つで、選択肢・「指定なし」・クラス・読み上げは①と同じ（初めは指定なし）', { r2: r2.map((x) => x.axis + '=' + x.value), opts: r2.map((x) => x.options.length) });
		await goTab(p, 1);
		await pick2(p, 'distance', 'medium');
		let d = await draft(p);
		const a2 = await readRow(p, FF, 'factor-filter');
		await goTab(p, 0);
		const a1 = await readRow(p, P, 'filter');
		assert(d && d.skillFilter && d.skillFilter.distance === 'medium' && Object.keys(d.skillFilter).length === 1 && a1[0].value === 'medium' && a1[0].on && a2[0].value === 'medium' && a2[0].on,
			'②絞り込み欄(1) ②で距離を中距離にすると、①の skillFilter に書かれ、①の選択欄にも中距離（選んだ形）が出る', { f: d && d.skillFilter, v1: a1[0].value, v2: a2[0].value });
		// 見た目は①と同じ（同じ幅・同じテーマで、選んだ形と指定なしの形の両方）
		await goTab(p, 0);
		const s1 = (await readRow(p, P, 'filter')).map((x) => x.style);
		await goTab(p, 1);
		const s2 = (await readRow(p, FF, 'factor-filter')).map((x) => x.style);
		assert(s1.join('#') === s2.join('#') && /^28px\|/.test(s2[0]), '②絞り込み欄(1) ②のセレクトの見た目（高さ28・文字・角丸・地・文字の色・縁）は①と同じ（選んだ形と指定なしの形）', { s1, s2 });
		// ①で選ぶと②に見える
		await goTab(p, 0);
		await p.selectOption(P + 'select[data-usd-act="filter"][data-axis="style"]', 'senko');
		await p.waitForTimeout(250);
		await goTab(p, 1);
		const b2 = await readRow(p, FF, 'factor-filter');
		assert(b2[1].value === 'senko' && b2[1].on && b2[0].value === 'medium', '②絞り込み欄(1) ①で脚質を先行にすると、②の選択欄にも先行が出る', b2.map((x) => x.value));
		// 指定なしに戻す
		await pick2(p, 'distance', '');
		await pick2(p, 'style', '');
		d = await draft(p);
		const c2 = await readRow(p, FF, 'factor-filter');
		await goTab(p, 0);
		const c1 = await readRow(p, P, 'filter');
		assert(d && d.skillFilter === undefined && c2.every((x) => x.value === '' && !x.on) && c1.every((x) => x.value === '' && !x.on),
			'②絞り込み欄(1) ②で「指定なし」に戻すと、①の skillFilter は項目ごと消え、①②とも指定なし', { f: d && d.skillFilter });
		assert(jsErrors(sp.errors).length === 0, '②絞り込み欄(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('②絞り込み欄(2) レースで固定: 距離・バ場はレースの値で選べない（錠の印）・脚質は選べる／①と同じ見え方／固定中の軸は②から書けない（保存値は書き換えない）', async () => {
		const own = { distance: 'short', style: 'senko' };
		const sp = await openSp({ roster: { umaId: 'uma-0001', cardIds: NOCARDS, skillFilter: own, race: SNAP(R0) } });
		const p = sp.page;
		const r2 = await readRow(p, FF, 'factor-filter');
		await goTab(p, 0);
		const r1 = await readRow(p, P, 'filter');
		await goTab(p, 1);
		const key = (x) => [x.axis, x.value, x.disabled, x.lock, x.locked, x.on, x.aria, x.style].join('|');
		assert(r2.map(key).join('#') === r1.map(key).join('#'), '②絞り込み欄(2) ②の選択欄は①と同じ見え方（値・押せない・錠・読み上げ・見た目）', { r2: r2.map(key), r1: r1.map(key) });
		assert(r2[0].disabled && r2[0].lock && r2[0].value === R0.distanceCategory && r2[2].disabled && r2[2].lock && r2[2].value === R0.surface && !r2[1].disabled && !r2[1].lock && r2[1].value === 'senko',
			'②絞り込み欄(2) 距離・バ場はレース（' + R0.id + '）の値で押せない・錠の印、脚質は①の値で押せる', r2.map((x) => x.axis + '=' + x.value + (x.disabled ? '(固定)' : '')));
		// 押せない選択欄を無理に変えても書かない
		await p.evaluate((sel) => { const s = document.querySelector(sel); s.disabled = false; s.value = 'long'; s.dispatchEvent(new Event('change', { bubbles: true })); }, FF + 'select[data-axis="distance"]');
		await p.waitForTimeout(250);
		const d = await draft(p);
		const r3 = await readRow(p, FF, 'factor-filter');
		assert(JSON.stringify(d.skillFilter) === JSON.stringify(own) && r3[0].value === R0.distanceCategory && r3[0].disabled, '②絞り込み欄(2) 固定中の軸は②から変えても保存しない（skillFilter は書き換えない）・選択欄はレースの値に戻る', { f: d.skillFilter, v: r3[0].value });
		// 脚質は②から書ける
		await pick2(p, 'style', 'sashi');
		const d2 = await draft(p);
		assert(d2.skillFilter.style === 'sashi' && d2.skillFilter.distance === 'short', '②絞り込み欄(2) 固定していない脚質は②から書ける（距離の保存値はそのまま）', d2.skillFilter);
		assert(jsErrors(sp.errors).length === 0, '②絞り込み欄(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('②絞り込み欄(3) ①が空でも②で操作できる（下書きのセット・保存済みで①の無いセット）／①のパネルの見た目は変わらない（選択欄は出ない）', async () => {
		// 下書きのセット・①が空
		const sp = await openSp({ roster: null });
		const p = sp.page;
		await goTab(p, 0);
		const before = await p.evaluate((P) => ({ html: document.querySelector(P + '.usd-roster-sec').innerHTML, h: Math.round(document.querySelector(P + '.usd-roster-sec').getBoundingClientRect().height), row: !!document.querySelector(P + '[data-usd-el="filter-row"]') }), P);
		await goTab(p, 1);
		const e = await readRow(p, FF, 'factor-filter');
		assert(e.length === 3 && e.every((x) => !x.disabled && x.value === ''), '②絞り込み欄(3) ①が空でも、②に選択欄が出て押せる', e.map((x) => x.axis));
		await pick2(p, 'style', 'nige');
		await pick2(p, 'surface', 'dirt');
		const d = await draft(p);
		assert(d && JSON.stringify(d.skillFilter) === JSON.stringify({ style: 'nige', surface: 'dirt' }) && !d.umaId && !(d.cardIds || []).some(Boolean), '②絞り込み欄(3) ①が空の下書きのセット: ②で選ぶと下書きの①に skillFilter が書かれる（育成ウマ娘・カードは空のまま）', d);
		await goTab(p, 0);
		const after = await p.evaluate((P) => ({ html: document.querySelector(P + '.usd-roster-sec').innerHTML, h: Math.round(document.querySelector(P + '.usd-roster-sec').getBoundingClientRect().height), row: !!document.querySelector(P + '[data-usd-el="filter-row"]') }), P);
		assert(!before.row && !after.row && before.html === after.html && before.h === after.h && /育成ウマ娘とサポートカードを選ぶと、ここに出ます。/.test(after.html),
			'②絞り込み欄(3) ①が空のときの①のパネルは、②で選んだあとも同じ（選択欄は出ない・中身と高さが同じ）', { before: before.h, after: after.h, rowBefore: before.row, rowAfter: after.row });
		await goTab(p, 1);
		const e2 = await readRow(p, FF, 'factor-filter');
		assert(e2[1].value === 'nige' && e2[2].value === 'dirt', '②絞り込み欄(3) 選んだ値は②にそのまま見える', e2.map((x) => x.value));
		assert(jsErrors(sp.errors).length === 0, '②絞り込み欄(3) コンソールのエラー0（下書き）', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 保存済みのセットで①が無い（baseRosterId なし）: 選ぶと①の編成が作られてセットに付く
		const data = { schemaVersion: 7, records: [], customSkills: [], templates: [{ templateId: 't1', name: 'S1', skillIds: [], createdAt: 'x', updatedAt: 'x' }], rosters: [] };
		const sp2 = await openSp({ data, roster: null });
		const p2 = sp2.page;
		await p2.click('#deck-set-bar [data-usd-act="set-list"]');
		const already = await p2.evaluate(() => { const i = document.querySelector('[data-usd-el="set-list"] input[value="t1"]'); return !!i && i.checked; });
		if (already) await p2.keyboard.press('Escape'); else await p2.click('[data-usd-el="set-list"] input[value="t1"]');
		await p2.waitForTimeout(300);
		await pick2(p2, 'distance', 'long');
		const ud = await p2.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData')));
		const t = ud.templates.find((x) => x.templateId === 't1');
		const r = t && t.baseRosterId ? ud.rosters.find((x) => x.rosterId === t.baseRosterId) : null;
		const e3 = await readRow(p2, FF, 'factor-filter');
		assert(r && JSON.stringify(r.skillFilter) === JSON.stringify({ distance: 'long' }) && !r.umaId && ud.schemaVersion === 7 && e3[0].value === 'long',
			'②絞り込み欄(3) 保存済みで①の無いセット: ②で選ぶと、そのセットに①の編成ができて skillFilter が入る（schemaVersion は 7 のまま）', { t, r, v: e3[0].value });
		assert(jsErrors(sp2.errors).length === 0, '②絞り込み欄(3) コンソールのエラー0（保存済み）', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});

	await block('②絞り込み欄(4) 小窓の題名の右の①の絞り込みの値: 「条件で検索」とオススメサポ／未指定の軸は出さない・すべて未指定なら何も出さない／表示だけ（押せない）／見出しの高さは変わらない', async () => {
		// 「条件で検索」の見出しの高さは T27（2026-10-31）で 45／61 → 41（上下の余白 6px。変更前 f3d4882 で 45・61 を実測し、変更後に 41 を実測）
		for (const [w, h, headP, headO] of [[375, 812, 41, 65], [1280, 900, 41, 53]]) {
			const tag = '②絞り込み欄(4) ' + w + 'px: ';
			const sp = await openSp({ w, h, roster: null });
			const p = sp.page;
			await openPicker(p);
			const a = await readPicker(p);
			await closePicker(p);
			await openOutside(p);
			const ao = await readOutside(p);
			await closeOutside(p);
			assert(!a.selShown && a.sel === '' && !/（/.test(a.label) && !ao.selShown && ao.sel === '', tag + 'すべて未指定: 題名の右には何も出ない（条件で検索・オススメサポ）', { a, ao });
			// 脚質だけ
			await pick2(p, 'style', 'senko');
			const vStyle = await valueText(p, { style: 'senko' });
			await openPicker(p);
			const b = await readPicker(p);
			await closePicker(p);
			await openOutside(p);
			const bo = await readOutside(p);
			await closeOutside(p);
			assert(b.sel === vStyle && bo.sel === vStyle && vStyle.length > 0 && !/・/.test(vStyle), tag + '脚質だけ: 「' + vStyle + '」だけ（未指定の軸は出さない）', { b: b.sel, bo: bo.sel });
			// 3つ
			await pick2(p, 'distance', 'medium');
			await pick2(p, 'surface', 'turf');
			const v3 = await valueText(p, FILTER);
			await openPicker(p);
			const c = await readPicker(p);
			await closePicker(p);
			await openOutside(p);
			const co = await readOutside(p);
			assert(v3.split('・').length === 3 && c.sel === v3 && co.sel === v3 && c.selRightOfTitle && co.selRightOfTitle, tag + '3つ: 「' + v3 + '」が題名の右（同じ高さ）に出る（条件で検索・オススメサポ）', { c: c.sel, co: co.sel, cr: c.selRightOfTitle, or: co.selRightOfTitle });
			assert(c.tag === 'SPAN' && c.tabindex === null && c.role === null && co.tag === 'SPAN' && co.tabindex === null && co.role === null, tag + '表示だけ（押せる部品ではない）', { c: [c.tag, c.tabindex, c.role], co: [co.tag, co.tabindex, co.role] });
			assert(a.headH === headP && c.headH === headP && ao.headH === headO && co.headH === headO, tag + '見出しの高さは値の有無で変わらない（条件で検索 ' + headP + '〔T27〕・オススメサポ ' + headO + '）', { picker: [a.headH, c.headH], outside: [ao.headH, co.headH] });
			assert(!c.hx && !co.hx, tag + '横スクロールなし');
			await closeOutside(p);
			// テキストで検索（同じ小窓の別の入口）には出さない
			await openPicker(p, 'editor-pick-text');
			const t = await readPicker(p);
			assert(!t.selShown, tag + '「テキストで検索」の題名の右には出ない', t.sel);
			await closePicker(p);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	// T27（2026-10-31・おいもさんの決定）: 件数の文（C-244 で値を入れた「①の絞り込み（…）に合わないため選べない N件」など）は丸ごと消し、
	// ①の絞り込みに合わない行は一覧に出さない。題名の右の値（(4)）は今のまま。この塊は「件数の文が無い・その行が無い・N が追加できる数」に置き換えた
	await block('②絞り込み欄(5) 件数の文は無い（T27 で C-244 の件数の文を消した）・①の絞り込みに合わない行は出ない・「N件」は追加できる行の数／375・320・393px で横にはみ出さない／結果は C-241 の最小の行数以上', async () => {
		for (const [w, h, minRows] of [[375, 812, 3], [320, 568, 3], [393, 700, 5]]) {
			const tag = '②絞り込み欄(5) ' + w + '×' + h + ': ';
			const sp = await openSp({ w, h, roster: { skillFilter: FILTER } });
			const p = sp.page;
			await openPicker(p);
			const a = await readPicker(p);
			const r = await p.evaluate(() => {
				const res = document.querySelector('[data-usd-el="results"]').getBoundingClientRect();
				const foot = document.querySelector('[data-usd-el="picker-footer"]').getBoundingClientRect();
				const lim = Math.min(res.bottom, foot.top, innerHeight);
				const rows = [...document.querySelectorAll('[data-usd-el="results"] .usd-row')];
				return { inView: rows.filter((x) => { const b = x.getBoundingClientRect(); return b.top >= res.top - 0.5 && b.bottom <= lim + 0.5; }).length,
					filtReason: rows.filter((x) => /が合わないため/.test((x.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || '')).length,
					addable: rows.filter((x) => !x.classList.contains('usd-row--excluded')).length, count: document.querySelector('[data-usd-el="result-count"]').textContent,
					el: !!document.querySelector('[data-usd-el="result-excluded"]') };
			});
			assert(!r.el && a.label === '' && r.filtReason === 0, tag + '件数の文は無く、「…が合わないため選べない」の行も無い', { el: r.el, label: a.label, filtReason: r.filtReason });
			assert(r.count === r.addable + '件', tag + '「N件」は追加できる行の数', r);
			assert(a.fits && !a.hx && a.countRowH === 16, tag + '横にはみ出さず、件数の行は1行（16）', a);
			assert(r.inView >= minRows, tag + '結果は ' + minRows + '行以上見える（C-241 の最小）', r.inView);
			await closePicker(p);
			await sp.ctx.close();
		}
	});

	await block('②絞り込み欄(6) ②の入口の寸法: 合計の帯 → 選択欄（28）→ 白い枠（入口の行）の順・間は 8／帯と入口の行の高さは変更前と同じ／375・320・393・1280px で横スクロールなし', async () => {
		for (const [w, h, band, head] of [[375, 812, 66, 37], [320, 568, 66, 37], [393, 700, 66, 37], [1280, 900, 44, 36]]) {
			const tag = '②絞り込み欄(6) ' + w + 'px: ';
			const sp = await openSp({ w, h, roster: { skillFilter: FILTER } });
			const r = await sp.page.evaluate((T) => {
				const R = (s) => { const b = document.querySelector(T + s).getBoundingClientRect(); return { t: b.top, b: b.bottom, h: b.height, l: b.left, r: b.right }; };
				const sels = Array.from(document.querySelectorAll(T + '[data-usd-el="factor-filter"] select')).map((s) => s.getBoundingClientRect());
				return { band: R('[data-usd-el="set-head"]'), filter: R('[data-usd-el="factor-filter"]'), group: R('[data-usd-el="skill-group"]'), head: R('.usd-skillgroup-head'),
					selH: sels.map((b) => Math.round(b.height)), oneLine: sels.every((b) => Math.abs(b.top - sels[0].top) < 0.5), hx: document.documentElement.scrollWidth > innerWidth + 1 };
			}, T);
			assert(Math.round(r.band.h) === band && Math.round(r.head.h) === head, tag + '合計の帯 ' + band + '・入口の行 ' + head + '（変更前と同じ）', { band: r.band.h, head: r.head.h });
			assert(Math.round(r.filter.h) === 28 && r.selH.every((x) => x === 28) && r.oneLine && Math.round(r.filter.t - r.band.b) === 8 && Math.round(r.group.t - r.filter.b) === 8,
				tag + '選択欄は帯と白い枠の間・1行・高さ28・上下の間 8', { filter: r.filter, band: r.band.b, group: r.group.t, sel: r.selH });
			assert(!r.hx, tag + '横スクロールなし');
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('②絞り込み欄(7) ライト／ダーク: ②の選択欄の色は①と同じ・文字のコントラスト（選択欄・「条件で検索」とオススメサポの題名の右の値・件数の文）', async () => {
		for (const theme of ['light', 'dark']) {
			const tag = '②絞り込み欄(7) ' + theme + ': ';
			const sp = await openSp({ theme, roster: { umaId: 'uma-0001', cardIds: NOCARDS, skillFilter: { distance: 'medium' } } });
			const p = sp.page;
			const s2 = (await readRow(p, FF, 'factor-filter')).map((x) => x.style);
			await goTab(p, 0);
			const s1 = (await readRow(p, P, 'filter')).map((x) => x.style);
			await goTab(p, 1);
			assert(s1.join('#') === s2.join('#'), tag + '②の選択欄の色・形は①と同じ（選んだ形と指定なしの形）', { s1, s2 });
			// セレクトの文字は option の中なので、走査器（文字を直接持つ要素）ではなく、セレクトの文字の色と地の色で比べる
			await pick2(p, 'style', '');
			const c1 = await p.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((s) => {
				const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
				const lum = (c) => { const v = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
				const cs = getComputedStyle(s);
				const fg = rgb(cs.color), bg = rgb(cs.backgroundColor);
				const a = lum(fg), b = lum(bg);
				return { axis: s.getAttribute('data-axis'), on: s.classList.contains('usd-roster-filtersel--on'), opaque: bg.length < 4 || bg[3] === 1, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 };
			}), FF + 'select');
			assert(c1.length === 3 && c1.some((x) => x.on) && c1.some((x) => !x.on) && c1.every((x) => x.opaque && x.ratio >= 4.5), tag + '②の選択欄の文字のコントラスト（選んだ形・指定なしの形とも 4.5 以上）', c1);
			await openPicker(p);
			const c2 = await p.evaluate(scanTextContrastInPage, '.usd-modal:not([hidden]) .usd-picker-head');
			// T27（2026-10-31）: 件数の文は消したので、題名の右の値だけを見る
			assert(c2.checked >= 2 && c2.bad.length === 0, tag + '「条件で検索」の題名の右の値のコントラスト（件数の文は T27 で消した）', formatContrast(c2.bad));
			await closePicker(p);
			await openOutside(p);
			const c4 = await p.evaluate(scanTextContrastInPage, '[data-usd-el="outside-modal"] .usd-out-head');
			assert(c4.checked >= 2 && c4.bad.length === 0, tag + 'オススメサポの題名の右の値のコントラスト', formatContrast(c4.bad));
			await closeOutside(p);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});
}
