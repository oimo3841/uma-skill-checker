// 吾妻のおでかけのトリガーのイベントを「自動で選ばない」にする（manualChoice・2026-10-29）の検査。run-smoke.mjs の末尾から register64() で呼ばれる
// （塊の見出しはすべて「自動で選ばない」で始まる。`npm run test:visual -- --only=自動で選ばない` で回せる）。
//
// 決め（おいもさん・2026-10-28〜29。Step 0 の案 (a)）:
//  ・support-card-event-skills.json の chain の step に "manualChoice": true があるイベントだけ、自動で選ばない（コードにカード名・step を書かない）。
//  ・残るスキルを持つ選択肢が1つ以上なら「選ぶ必要あり」（①の表は△・列見出しに「！」・小窓に「未選択」）。0 なら今までどおり「選ぶ必要なし」。
//  ・選んでいる選択肢をもう一度押すと未選択に戻る。保存データ（roster.eventChoices）の形は変えない・保存済みの選択は動かない。
//  ・印の無いイベント（友人以外の同じ形のイベントなど）は今までどおり自動。
//  ・「自動」の札だけを案3（薄い黄の塗り・茶の文字・黄の枠・小さな角。--uma-warn-* と --uma-r-sm）に。「確定」は今のまま。大きさは同じ。
//  ・右の一覧（取得できるスキル）にも、自動で選んだ選択肢のスキルの●の行に「自動」の札。
// 固定値（3,154 Pt／16種 など）は Step 0 の表の「変更後」の値（変更前の commit ce28f00 に試しの変更を入れて測ったもの）と同じ。
// 「確定」の札の色は、変更前の commit ce28f00 で測った値。シナリオは実データ（駿大祭）を配る（検査の仕込みのシナリオではない）。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。

export async function register64(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const SCEN = fs.readFileSync(path.join(REPO_ROOT, 'data/scenario-event-skills.json'), 'utf8');
	const EV_RAW = fs.readFileSync(path.join(REPO_ROOT, 'data/support-card-event-skills.json'), 'utf8');
	// 印を外したデータ（「manualChoice の無いデータでは今までと同じ」を見るため）
	const EV_NOMANUAL = EV_RAW.replace(/,\s*"manualChoice": true/g, '');
	const RP = '#deck-roster-panel ';
	const sleep = (p, ms) => p.waitForTimeout(ms);
	// 印の付いたイベントをデータから拾う（検査の側にカード名・step を書かない）
	const EV = readJson('data/support-card-event-skills.json');
	const MANUAL = [];
	EV.entries.forEach((e) => (e.chain || []).forEach((st, idx) => { if (st.manualChoice === true) MANUAL.push({ cardId: e.cardId, idx, st }); }));
	const M = MANUAL[0] || null;
	const KEY = M ? 'card:' + M.cardId + '#' + M.idx : null;
	const SKILL_SIDE = M ? M.st.choices.findIndex((c) => Array.isArray(c.skills) && c.skills.length > 0) : -1;
	const NONE_SIDE = M ? M.st.choices.findIndex((c) => Array.isArray(c.skills) && c.skills.length === 0) : -1;
	const ARC = M && SKILL_SIDE >= 0 ? M.st.choices[SKILL_SIDE].skills[0].skillId : null;
	const R0 = M ? { umaId: 'uma-0179', cardIds: [M.cardId, null, null, null, null, null], skillFilter: {} } : null;

	const open = async (w, roster, o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w === 1280 ? 900 : 844 }, EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: SCEN }));
		if (o.noManual) await sp.page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: EV_NOMANUAL }));
		await sp.page.evaluate(([ro, th]) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(ro));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
			if (th && window.UmaTheme) window.UmaTheme.set(th);
		}, [roster, o.theme || 'light']);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector(RP + '.usd-roster-grid', { timeout: 15000 });
		await sleep(sp.page, 1200);
		return sp;
	};
	const readTable = (page) => page.evaluate(([arc, cardId]) => {
		const panel = document.querySelector('#deck-roster-panel');
		const row = panel.querySelector('.usd-roster-grow[data-skill-id="' + arc + '"]');
		const heads = [...panel.querySelectorAll('[data-usd-el="col-menu-btn"]')];
		const cardHead = heads.find((b) => b.getAttribute('data-member-key') === '1');
		const sum = panel.querySelector('[data-usd-el="roster-sum"]');
		const draft = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null');
		const cells = row ? [...row.querySelectorAll('[role="cell"]')] : [];
		return { rowExists: !!row, cardCell: cells[1] ? (cells[1].querySelector('.usd-roster-got') ? 'got' : cells[1].querySelector('.usd-roster-maybe') ? 'maybe' : 'none') : null,
			checked: row ? !!row.querySelector('input[type="checkbox"]:checked') : null,
			rowCount: panel.querySelectorAll('.usd-roster-grow[data-skill-id]').length, sum: sum ? sum.textContent.replace(/\s+/g, '') : null,
			unsel: cardHead ? cardHead.getAttribute('data-unselected') : null, aria: cardHead ? cardHead.getAttribute('aria-label') : null,
			eventChoices: draft ? (draft.eventChoices === undefined ? null : draft.eventChoices) : null, draftKeys: draft ? Object.keys(draft).sort() : null };
	}, [ARC, M && M.cardId]);
	const openEvents = async (page, key) => {
		await page.click(RP + '[data-usd-el="col-menu-btn"][data-member-key="' + key + '"]');
		await sleep(page, 250);
		await page.click('[data-usd-el="colmenu-events"]');
		await sleep(page, 600);
	};
	const setPane = async (page, n) => {
		const t = await page.$('[data-usd-el="info-pop"] [data-usd-el="events-tab"][data-pane="' + n + '"]');
		if (t && await t.isVisible()) { await t.click(); await sleep(page, 400); }
	};
	const readPop = (page, key) => page.evaluate((key) => {
		const pop = document.querySelector('[data-usd-el="info-pop"]');
		if (!pop) return null;
		const box = key ? pop.querySelector('[data-usd-el="event"][data-event-key="' + key + '"]') : null;
		const right = pop.querySelector('[data-usd-el="events-pane-skills"]');
		const st = (t) => { const cs = getComputedStyle(t); const r = t.getBoundingClientRect(); return { text: t.textContent, el: t.getAttribute('data-usd-el'), cls: t.className, bg: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow, radius: cs.borderRadius, w: Math.round(r.width), h: Math.round(r.height) }; };
		return { unsel: (pop.querySelector('[data-usd-el="events-unselected"]') || {}).textContent || null,
			box: box ? { checked: [...box.querySelectorAll('[data-usd-el="event-choice"]')].map((c) => c.getAttribute('aria-checked')), autoTag: !!box.querySelector('[data-usd-el="event-auto"]') } : null,
			right: right ? [...right.querySelectorAll('[data-usd-el="ev-skill"]')].map((li) => ({ id: li.getAttribute('data-skill-id'), maybe: li.getAttribute('data-usd-maybe') === '1', auto: li.querySelectorAll('[data-usd-el="ev-skill-auto"]').length })) : [],
			autoEvents: [...pop.querySelectorAll('[data-usd-el="event"]')].filter((b) => b.querySelector('[data-usd-el="event-auto"]')).map((b) => ({ key: b.getAttribute('data-event-key'),
				chosenSkills: [...b.querySelectorAll('[data-usd-el="event-choice"][aria-checked="true"] .usd-roster-choiceskill')].map((s) => s.textContent) })),
			tags: [...pop.querySelectorAll('.usd-roster-autotag')].map(st) };
	}, key);
	const clickChoice = async (page, idx) => {
		await page.click('[data-usd-el="info-pop"] [data-usd-el="event-choice"][data-event-key="' + KEY + '"][data-choice="' + idx + '"]');
		await sleep(page, 600);
	};
	const closePop = async (page) => { await page.keyboard.press('Escape'); await sleep(page, 400); };
	const pre = (tag) => {
		assert(MANUAL.length === 1 && SKILL_SIDE >= 0 && NONE_SIDE >= 0 && M.st.choices.length === 2 && !!ARC,
			tag + ': 前提: データに manualChoice の印が1か所（2択・一方がスキルなし・もう一方にスキル）', MANUAL.map((x) => x.cardId + '#' + x.idx));
		return MANUAL.length === 1 && SKILL_SIDE >= 0 && NONE_SIDE >= 0 && !!ARC;
	};

	await block('自動で選ばない(1) 印のあるイベント: 既定は△・チェックなし・①の合計 3,154 Pt／16種・列見出しに「！」（未選択1件）・小窓は「未選択1件」でどちらも選ばれず「自動」なし・右の一覧は「未選択」（1280・390・360）', async () => {
		if (!pre('自動で選ばない(1)')) return;
		for (const w of [1280, 390, 360]) {
			const tag = '自動で選ばない(1) ' + w + 'px: ';
			const sp = await open(w, R0);
			const t = await readTable(sp.page);
			assert(t.rowExists && t.cardCell === 'maybe' && t.checked === false && t.rowCount === 29, tag + '表の行は残り（29行）、カードの列は△・チェックなし', t);
			assert(t.sum === '3,154Pt／16種', tag + '①の合計は 3,154 Pt／16種（スキルなしを選んだときと同じ）', t.sum);
			assert(t.unsel === '1' && /（未選択1件）/.test(t.aria || ''), tag + 'カードの列見出しに「！」（data-unselected 1・読み上げに「（未選択1件）」）', { unsel: t.unsel, aria: t.aria });
			assert(t.eventChoices === null, tag + '開いただけでは保存しない（eventChoices なし）', t.eventChoices);
			await openEvents(sp.page, '1');
			const p = await readPop(sp.page, KEY);
			assert(p && p.unsel === '未選択1件' && p.box && p.box.checked.every((x) => x === 'false') && p.box.autoTag === false, tag + '小窓は「未選択1件」・どちらの選択肢も選ばれていない・「自動」の札なし', p && { unsel: p.unsel, box: p.box });
			await setPane(sp.page, 1);
			const p2 = await readPop(sp.page, KEY);
			const arcRow = p2.right.find((x) => x.id === ARC);
			assert(!!arcRow && arcRow.maybe === true && arcRow.auto === 0, tag + '右の一覧のそのスキルは「未選択」の行（「自動」の札なし）', arcRow);
			const core = await sp.page.evaluate(([ro, key]) => { const r = UmaSkillDeckCore.computeRosterSkills(ro, { autoChoose: true }); const e = r.events.find((x) => x.eventKey === key); return e ? { chosen: e.chosen, auto: e.auto, pending: e.pending, wanted: e.wantedChoices } : null; }, [R0, KEY]);
			assert(core && core.chosen === null && core.auto === false && core.pending === true && core.wanted === 1, tag + 'core: 自動で選ばず（chosen null）・pending（残るスキルを持つ選択肢は1つ）', core);
			const hs = await sp.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
			assert(!hs && jsErrors(sp.errors).length === 0, tag + '横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('自動で選ばない(2) 保存済みの選択は動かない: { 鍵: スキルなし } で 3,154 Pt／16種・行なし・未選択0件／{ 鍵: スキルあり } で 3,250 Pt／17種・●・チェックあり・未選択0件・「自動」なし（変更前と同じ値）', async () => {
		if (!pre('自動で選ばない(2)')) return;
		for (const [pick, want] of [[NONE_SIDE, { sum: '3,154Pt／16種', rowExists: false, rows: 28 }], [SKILL_SIDE, { sum: '3,250Pt／17種', rowExists: true, rows: 29 }]]) {
			const tag = '自動で選ばない(2) 保存 ' + pick + ': ';
			const ro = Object.assign({}, R0, { eventChoices: { [KEY]: pick } });
			const sp = await open(1280, ro);
			const t = await readTable(sp.page);
			assert(t.sum === want.sum && t.rowExists === want.rowExists && t.rowCount === want.rows && t.unsel === '0', tag + '合計 ' + want.sum + '・行 ' + want.rows + '・「！」なし', t);
			if (want.rowExists) assert(t.cardCell === 'got' && t.checked === true, tag + 'カードの列は●・チェックあり', t);
			assert(JSON.stringify(t.eventChoices) === JSON.stringify({ [KEY]: pick }), tag + '保存の値はそのまま', t.eventChoices);
			await openEvents(sp.page, '1');
			const p = await readPop(sp.page, KEY);
			assert(p.unsel === '未選択0件' && p.box.checked[pick] === 'true' && p.box.checked.filter((x) => x === 'true').length === 1 && p.box.autoTag === false, tag + '小窓は「未選択0件」・保存の選択肢だけが選ばれ・「自動」なし', p.box);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('自動で選ばない(3) 選んだ選択肢をもう一度押すと未選択に戻る（保存の鍵が消える）・△・「！」に戻る／スキルなしを押すと行が消える', async () => {
		if (!pre('自動で選ばない(3)')) return;
		const sp = await open(1280, R0);
		await openEvents(sp.page, '1');
		await clickChoice(sp.page, SKILL_SIDE);
		await closePop(sp.page);
		const a = await readTable(sp.page);
		assert(a.sum === '3,250Pt／17種' && a.cardCell === 'got' && a.unsel === '0' && JSON.stringify(a.eventChoices) === JSON.stringify({ [KEY]: SKILL_SIDE }), '自動で選ばない(3) スキルのある選択肢を押す: ●・3,250 Pt／17種・「！」なし・保存される', a);
		await openEvents(sp.page, '1');
		await clickChoice(sp.page, SKILL_SIDE);
		const p = await readPop(sp.page, KEY);
		await closePop(sp.page);
		const b = await readTable(sp.page);
		assert(p.unsel === '未選択1件' && p.box.checked.every((x) => x === 'false') && p.box.autoTag === false, '自動で選ばない(3) もう一度押すと小窓は未選択（「自動」に戻らない）', p.box);
		assert(b.sum === '3,154Pt／16種' && b.cardCell === 'maybe' && b.unsel === '1' && b.eventChoices === null && !(b.draftKeys || []).includes('eventChoices'), '自動で選ばない(3) 表は△・3,154 Pt／16種・「！」・保存の鍵は消える（eventChoices の項目ごと無い）', b);
		await openEvents(sp.page, '1');
		await clickChoice(sp.page, NONE_SIDE);
		await closePop(sp.page);
		const c = await readTable(sp.page);
		assert(c.rowExists === false && c.rowCount === 28 && c.sum === '3,154Pt／16種' && c.unsel === '0', '自動で選ばない(3) スキルなしを押すと行が消える（28行）・「！」なし', c);
		assert(jsErrors(sp.errors).length === 0, '自動で選ばない(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('自動で選ばない(4) 印の無いイベントは今までどおり: 友人以外の同じ形（2択・一方がスキルなし）のイベントはすべて自動（スキルのある選択肢）・pending なし／印を外したデータでは吾妻のイベントも自動・3,250 Pt／17種・小窓に「自動」', async () => {
		if (!pre('自動で選ばない(4)')) return;
		const sp = await open(1280, R0);
		const r = await sp.page.evaluate(async () => {
			const C = UmaSkillDeckCore;
			const ev = await (await fetch('data/support-card-event-skills.json')).json();
			const cards = await (await fetch('data/support-cards.json')).json();
			const cardOf = new Map(cards.entries.map((c) => [c.id, c]));
			const out = [];
			ev.entries.forEach((e) => (e.chain || []).forEach((st, idx) => {
				const ch = st.choices || [];
				if (ch.length !== 2 || st.manualChoice === true) return;
				const empty = (x) => Array.isArray(x.skills) && x.skills.length === 0;
				const has = (x) => Array.isArray(x.skills) && x.skills.length > 0;
				if (!((empty(ch[0]) && has(ch[1])) || (empty(ch[1]) && has(ch[0])))) return;
				const c = cardOf.get(e.cardId);
				if (c && c.typeOrder === 6 && c.isGroup === false) return;
				const res = C.computeRosterSkills({ cardIds: [e.cardId] }, { eventChoices: {}, autoChoose: true });
				const x = res.events.find((y) => y.eventKey === 'card:' + e.cardId + '#' + idx);
				out.push({ key: e.cardId + '#' + idx, want: has(ch[0]) ? 0 : 1, chosen: x ? x.chosen : null, auto: x ? x.auto : null, pending: x ? x.pending : null });
			}));
			return out;
		});
		const bad = r.filter((x) => !(x.chosen === x.want && x.auto === true && x.pending === false));
		assert(r.length >= 100 && bad.length === 0, '自動で選ばない(4) 友人以外の同じ形のイベント（' + r.length + '件）は、どれもスキルのある選択肢が自動で選ばれ、「選ぶ必要あり」にならない', { n: r.length, bad: bad.slice(0, 5) });
		await sp.ctx.close();
		const sp2 = await open(1280, R0, { noManual: true });
		const t = await readTable(sp2.page);
		assert(t.sum === '3,250Pt／17種' && t.cardCell === 'got' && t.unsel === '0' && t.eventChoices === null, '自動で選ばない(4) 印を外したデータ: 吾妻のイベントは自動（●・3,250 Pt／17種・「！」なし・保存なし）＝変更前と同じ', t);
		await openEvents(sp2.page, '1');
		const p = await readPop(sp2.page, KEY);
		assert(p.unsel === '未選択0件' && p.box.checked[SKILL_SIDE] === 'true' && p.box.autoTag === true, '自動で選ばない(4) 印を外したデータ: 小窓はスキルのある選択肢が選ばれ「自動」の札', p.box);
		assert(jsErrors(sp2.errors).length === 0, '自動で選ばない(4) コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});

	await block('自動で選ばない(5) 札の見た目: 「自動」は案3（--uma-warn-bg・--uma-warn-text・枠 --uma-warn-border・角 --uma-r-sm）・「確定」は変更前のまま・同じ小窓で色と角が違う・大きさは同じ 32×14（ライト・ダーク × 1280・390・360）', async () => {
		if (!pre('自動で選ばない(5)')) return;
		// 「確定」の札の色は変更前の commit ce28f00 で測った値。「自動」はトークンの値を同じページで読む
		const FIXED = { light: { bg: 'rgb(239, 228, 207)', color: 'rgb(106, 91, 69)' }, dark: { bg: 'rgb(64, 62, 57)', color: 'rgb(189, 185, 176)' } };
		for (const theme of ['light', 'dark']) for (const w of [1280, 390, 360]) {
			const tag = '自動で選ばない(5) ' + theme + ' ' + w + 'px: ';
			// 「自動」と「確定」が同じ小窓に並ぶ形は、今のデータでは印を外したときの吾妻の列だけ（確定の箱は吾妻のカードだけが持つ）
			const sp = await open(w, R0, { noManual: true, theme });
			const tok = await sp.page.evaluate(() => {
				const probe = document.createElement('span');
				probe.style.cssText = 'background: var(--uma-warn-bg); color: var(--uma-warn-text); border-radius: var(--uma-r-sm); box-shadow: inset 0 0 0 1px var(--uma-warn-border);';
				document.body.appendChild(probe);
				const cs = getComputedStyle(probe);
				const o = { bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius, shadow: cs.boxShadow };
				probe.remove();
				return o;
			});
			await openEvents(sp.page, '1');
			const p = await readPop(sp.page, KEY);
			const auto = p.tags.find((x) => x.el === 'event-auto');
			const fixed = p.tags.find((x) => x.el === 'event-fixed-tag');
			assert(!!auto && !!fixed, tag + '同じ小窓に「自動」と「確定」がある', p.tags.map((x) => x.text));
			if (!auto || !fixed) { await sp.ctx.close(); continue; }
			assert(/usd-roster-autotag--auto/.test(auto.cls) && auto.bg === tok.bg && auto.color === tok.color && auto.radius === tok.radius && auto.shadow === tok.shadow,
				tag + '「自動」は --uma-warn-bg／--uma-warn-text／枠 --uma-warn-border／角 --uma-r-sm', { auto, tok });
			assert(!/usd-roster-autotag--auto/.test(fixed.cls) && fixed.bg === FIXED[theme].bg && fixed.color === FIXED[theme].color && fixed.radius === '999px' && fixed.shadow === 'none',
				tag + '「確定」は変更前のまま（' + FIXED[theme].bg + '・' + FIXED[theme].color + '・角 999px・枠なし）', fixed);
			assert(auto.bg !== fixed.bg && auto.color !== fixed.color && auto.radius !== fixed.radius, tag + '「自動」と「確定」は塗り・文字色・角が違う', { auto, fixed });
			assert(auto.w === 32 && auto.h === 14 && fixed.w === 32 && fixed.h === 14, tag + '大きさは 32×14 で同じ（今と同じ）', { auto: [auto.w, auto.h], fixed: [fixed.w, fixed.h] });
			const hs = await sp.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
			assert(!hs && jsErrors(sp.errors).length === 0, tag + '横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('自動で選ばない(6) 右の一覧の「自動」: 自動で選んだ選択肢のスキルの●の行にだけ1つ（△の行・手で選んだ選択肢・確定のイベントのスキルには付けない）・札の見た目は左と同じ（育成ウマ娘の列・印を外した吾妻の列）', async () => {
		if (!pre('自動で選ばない(6)')) return;
		for (const [label, opt, key] of [['育成ウマ娘の列', {}, '0'], ['印を外した吾妻の列', { noManual: true }, '1']]) {
			const tag = '自動で選ばない(6) ' + label + ': ';
			const sp = await open(1280, R0, opt);
			await openEvents(sp.page, key);
			const p = await readPop(sp.page, null);
			// 期待: 左で「自動」の札が付いたイベントの、選ばれた選択肢のスキル（名前で突き合わせ。Lv の表記を外す）
			const names = new Set(p.autoEvents.flatMap((e) => e.chosenSkills.map((s) => s.replace(/ Lv\d+$/, ''))));
			const got = await sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="info-pop"] [data-usd-el="ev-skill"]')].map((li) => {
				const nm = li.querySelector('.usd-ev-skill-name');
				const t = nm ? [...nm.childNodes].filter((n) => !(n.nodeType === 1 && (n.classList.contains('usd-roster-autotag') || n.classList.contains('usd-ev-evomark') || n.classList.contains('usd-info-evorel-mark')))).map((n) => n.textContent).join('').trim() : '';
				return { id: li.getAttribute('data-skill-id'), name: t, maybe: li.getAttribute('data-usd-maybe') === '1', auto: li.querySelectorAll('[data-usd-el="ev-skill-auto"]').length };
			}));
			const tagged = got.filter((x) => x.auto > 0);
			assert(p.autoEvents.length > 0 && tagged.length > 0, tag + '自動で選んだイベントがあり、右の一覧に「自動」の行がある（検査が空振りしていない）', { ev: p.autoEvents.length, tagged: tagged.length });
			assert(tagged.every((x) => x.auto === 1 && !x.maybe && names.has(x.name.replace(/未選択$/, ''))), tag + '「自動」は●の行に1つだけ・左の自動のイベントで選ばれたスキルだけ', tagged);
			assert(got.filter((x) => !x.maybe && names.has(x.name)).every((x) => x.auto === 1), tag + '自動で選ばれたスキルの●の行には、どれにも「自動」がある', got.filter((x) => !x.maybe && names.has(x.name)));
			const looks = p.tags.filter((x) => x.text === '自動');
			const L = looks.filter((x) => x.el === 'event-auto')[0];
			assert(!!L && looks.filter((x) => x.el === 'ev-skill-auto').every((x) => x.bg === L.bg && x.color === L.color && x.radius === L.radius && x.shadow === L.shadow && /usd-roster-autotag--auto/.test(x.cls)), tag + '右の一覧の札は左の「自動」と同じ見た目', looks.slice(0, 3));
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// 手で選んだときは右の一覧に「自動」が付かない（印のあるイベントでスキルのある選択肢を選ぶ）
		const sp = await open(1280, Object.assign({}, R0, { eventChoices: { [KEY]: SKILL_SIDE } }));
		await openEvents(sp.page, '1');
		const p = await readPop(sp.page, KEY);
		const row = p.right.find((x) => x.id === ARC);
		assert(!!row && !row.maybe && row.auto === 0 && p.right.every((x) => x.auto === 0), '自動で選ばない(6) 手で選んだ選択肢のスキル（●）には「自動」を付けない（吾妻の列はどの行にも付かない）', p.right);
		await sp.ctx.close();
	});
}
