// 段7d（2026-10-03・C-116）の検査。run-smoke.mjs の末尾から register7d() で呼ばれる（塊の見出しはすべて「段7d」を含むので、
// `npm run test:visual -- --only=段7d` で全部、`--only=段7d(B)` のように括弧つきの見出しで1つずつ回せる）。
//
//   A  トレセン軒のいいとこ入った！（①）／前回のタブ（③）／絞り込みのセレクトの色（④）／ヘッダーのバッジ（⑦）／2文字の名前（⑧）
//   B  選ぶ必要のあるイベントの判定（⑤）／②が数える本育成の Pt＝①の数字（⑥）／種数の数え方（⑫）／前段の1行（②）
//   C  必要スキルPt のチップ（⑨）／本育成編成のボタン（⑩）／継承固有（⑪）／②の行の Pt と名前の小窓（⑬）／削除したもの（⑭⑮）／縦の高さ
//
// 材料は blocks-7c.mjs と同じ作り（実データのカードに、テスト用のイベント・Pt・前段を route で差し込む）。
export async function register7d(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const cardsAll = readJson('data/support-cards.json').entries;
	const master = readJson('uma-skill-deck-skills.json').skills;
	const ext = readJson('data/extended-skills.json').entries;
	const umas = readJson('data/training-umamusume.json').entries;
	const rules = readJson('data/skill-pt-rules.json');
	const scenReal = readJson('data/scenario-event-skills.json');
	const byId = new Map(master.map((s) => [s.id, s]));
	const nameOf = (id) => (master.find((s) => s.id === id) || ext.find((s) => s.id === id) || {}).name;
	const umaLv7 = umas.find((u) => (u.awakeningSkills || []).some((r) => r.level >= 7));
	const DISC = rules.hintDiscountPercent;
	const STATUS = Object.fromEntries(rules.statuses.map((s) => [s.id, s.percent]));
	const pay = (base0, L, stId) => Math.floor(base0 * (100 - (L > 0 ? DISC[Math.min(L, DISC.length) - 1] : 0) - (STATUS[stId] || 0)) / 100);
	const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const UNIQ = (count, lv, st) => count * pay(200, lv, st);

	/* ---- 材料（blocks-7c と同じ作り） ---- */
	const hintOk = cardsAll.filter((c) => c.dataStatus && c.dataStatus.hint === 'done' && (c.hintSkills || []).length > 0 && c.hintSkills.every((h) => byId.has(h.skillId) && !byId.get(h.skillId).raceDistance));
	const [cA, cB] = [hintOk[0], hintOk[1]];
	const hintIds = [...new Set([cA, cB].flatMap((c) => c.hintSkills.map((s) => s.skillId)))];
	const hinted = new Set(hintIds);
	const plainTags = (s) => !hinted.has(s.id) && s.tags && (s.tags.style || []).length === 0 && (s.tags.surface || []).length === 0 && (s.tags.passive || []).length === 0 && !s.raceDistance;
	const W = master.filter((s) => plainTags(s) && (s.tags.distance || []).length === 0).slice(0, 12).map((s) => s.id);
	const onlyDist = (d) => master.filter((s) => plainTags(s) && (s.tags.distance || []).length === 1 && s.tags.distance[0] === d).map((s) => s.id);
	const SHORT = onlyDist('short').slice(0, 3), LONG = onlyDist('long').slice(0, 3);
	const two = master.find((s) => plainTags(s) && !W.includes(s.id) && Array.from(s.name).length === 2);   // 2文字の名前のスキル（⑧）
	const ref = (id, lv) => ({ skillId: id, name: nameOf(id), hintLevel: lv });
	const evDoc = { dataVersion: '2026-10-03a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries: [
		{ cardId: cA.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(W[0], 2)] }, { skills: [ref(W[1], 1)] }] },
			{ step: 2, choices: [{ skills: [ref(W[2], 3)] }] },
			{ step: 3, choices: [{ skills: [ref(W[3], 1)] }] }] },
		{ cardId: cB.id, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(W[6], 1)] }] },
			{ step: 2, choices: [{ skills: [ref(W[7], 1)] }] }] },
	] };
	const BASE = { [W[0]]: 100, [W[1]]: 120, [W[2]]: 140, [W[3]]: 200, [W[4]]: 160, [W[6]]: 90, [W[7]]: 110, [W[8]]: 180 };
	hintIds.forEach((id) => { BASE[id] = 50; });
	const mkPt = (rar, extraBase) => ({ dataVersion: '2026-10-03a', category: 'skillPt', note: 'テスト用の仕込み',
		entries: Object.entries(Object.assign({}, BASE, extraBase || {})).map(([skillId, pt]) => ({ skillId, pt, rarity: (rar || {})[skillId] || 'white' })) });
	const ptDoc = mkPt({ [W[3]]: 'gold' });
	const mkStep = (entries) => ({ dataVersion: '2026-10-03a', category: 'skillStepUp', note: 'テスト用の仕込み', entries });
	const stepDoc = mkStep([{ skillId: W[3], prevSkillIds: [W[8]] }, { skillId: W[6], prevSkillIds: [W[7]] }]);
	const descDoc = { dataVersion: '2026-10-03a', category: 'skillDescription', note: 'テスト用の仕込み', entries: Object.keys(BASE).map((skillId) => ({ skillId, text: '説明 ' + skillId })) };
	const emptyChar = { dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] };
	const routes = async (page, o = {}) => {
		await page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill(json(o.evDoc || evDoc)));
		await page.route('**/data/character-event-skills.json*', (route) => route.fulfill(json(emptyChar)));
		await page.route('**/data/skill-pt.json*', (route) => route.fulfill(json(o.ptDoc || ptDoc)));
		await page.route('**/data/skill-step-up.json*', (route) => route.fulfill(json(o.stepDoc || stepDoc)));
		await page.route('**/data/skill-descriptions.json*', (route) => route.fulfill(json(descDoc)));
		if (o.scenDoc) await page.route('**/data/scenario-event-skills.json*', (route) => route.fulfill(json(o.scenDoc)));
	};
	const mkRoster = (i, cards, extra) => Object.assign({ rosterId: 'r7d' + i, name: '編成' + (i + 1), umaId: '', star: 0, awakeningLevel: 0, cardIds: cards || [cA.id, cB.id, null, null, null, null], createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z' }, extra || {});
	const baseUser = (o) => Object.assign({}, USER_DATA, o);
	const open = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, o.userData);
		await routes(sp.page, o.routes || {});
		await sp.page.evaluate(({ roster, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
		}, { roster: o.roster === undefined ? { umaId: '', cardIds: [cA.id, cB.id, null, null, null, null] } : o.roster, scope: o.scope === undefined ? { skillIds: [W[8]], name: '', tiers: {}, updatedAt: '' } : o.scope });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate((t) => selectStepTab(t, { noSave: true }), o.tab || 0);
		await sp.page.waitForSelector('#deck-roster-panel [data-usd-el="pt-sum"],#deck-roster-panel [data-usd-el="pt-error"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(200);
		return sp;
	};
	const P = '#deck-roster-panel ';
	const T = '#deck-template-panel ';
	const num = (s) => (s === null || s === undefined ? null : Number(String(s).replace(/[^0-9]/g, '')));
	const readSum = (page) => page.evaluate(() => {
		const t = (i) => { const e = document.querySelector('#deck-roster-panel [data-usd-el="' + i + '"]'); return e ? e.textContent.trim() : null; };
		return { total: t('pt-total'), count: t('pt-count'), prev: t('pt-prev'), prevCount: document.querySelectorAll('#deck-roster-panel [data-usd-el="pt-prev"]').length,
			old: ['pt-prev-count', 'pt-prev-total', 'pt-prev-list', 'pt-with-prev'].filter((k) => document.querySelector('#deck-roster-panel [data-usd-el="' + k + '"]')),
			badge: (document.getElementById('deck-roster-excluded') || {}).textContent };
	});
	const readNeed = (page) => page.evaluate(() => {
		const el = document.querySelector('[data-usd-el="pt-need"]');
		if (!el || el.hidden) return { hidden: true };
		const chips = [1, 2, 3].map((k) => { const e = el.querySelector('[data-usd-el="pt-need-' + k + '"]'); return e ? { text: e.textContent.trim(), n: Number(e.querySelector('strong').textContent.replace(/[^0-9]/g, '')), top: Math.round(e.getBoundingClientRect().top) } : null; });
		return { hidden: false, chips };
	});
	const linkBtn = (page) => page.evaluate(() => { const b = document.querySelector('[data-usd-el="roster-link-btn"]'); return { text: b.textContent.trim(), title: b.title, pressed: b.getAttribute('aria-pressed') }; });
	const link = async (page, n) => { await page.click('[data-usd-el="roster-link-btn"]'); await page.waitForTimeout(150); await page.click('[data-usd-el="link-list"] label:nth-child(' + n + ')'); await page.waitForTimeout(300); };
	const draftScope = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null'));
	const SP = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

	/* ============================================================
	 * A. ① いいとこ入った！／③ 前回のタブ／④ 絞り込みの色／⑦ バッジ／⑧ 2文字の名前
	 * ============================================================ */
	await block('段7d(A) いいとこ入った！・前回のタブ・絞り込みの色・バッジ・2文字の名前', async () => {
		// ① 実データ: イベント2（シニア級12月後半）の選択肢2が「いいとこ入った！ Lv2」（ex-0318）。「時中の砂」は入れない（空のまま）
		{
			const ev2 = scenReal.entries[0].events.find((e) => e.name === 'シニア級12月後半');
			assert(ev2 && ev2.choices.length === 3 && JSON.stringify(ev2.choices[1].skills) === JSON.stringify([{ skillId: 'ex-0318', hintLevel: 2 }]) && nameOf('ex-0318') === 'いいとこ入った！',
				'段7d(A)①: data/scenario-event-skills.json のイベント2の選択肢2は「いいとこ入った！」（ex-0318）Lv2', ev2 && ev2.choices[1]);
			const ev3 = scenReal.entries[0].events.find((e) => e.type === 'fixed');
			const names = ev3.skills.map((s) => nameOf(s.skillId));
			assert(!names.includes('時中の砂') && !names.includes('時中の妙'), 'この段では「時中の砂」（正しくは時中の妙）はイベント3に入れない（空のまま。ゲーム画面で確認してから別の段）', names);
			const sp = await open({ w: 375, h: 812, routes: { scenDoc: scenReal } });
			await sp.page.click(P + 'button[data-usd-act="events"][data-member-key="scenario"]');
			await sp.page.waitForTimeout(300);
			const texts = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-pop"] [data-usd-el="event"][data-event-key$="#1"] [data-usd-el="event-choice"]')).map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
			assert(texts.length === 3 && texts[1].includes('いいとこ入った！') && texts[1].includes('Lv2') && !texts[1].includes('スキルなし'), 'イベント2の選択肢2を小窓で選べる（「いいとこ入った！ Lv2」。「スキルなし」ではない）', texts);
			await sp.ctx.close();
		}
		// ③ 前回開いていたタブ（F5 で戻る）。初めての訪問は①。書き出しの対象（userData）には入らない
		{
			const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 });
			const active = () => sp.page.evaluate(() => Array.from(document.querySelectorAll('.step-tab')).findIndex((t) => t.getAttribute('aria-selected') === 'true'));
			await sp.page.evaluate(() => localStorage.removeItem('umaSkillDeck:stepTab'));
			await sp.page.reload({ waitUntil: 'networkidle' });
			assert((await active()) === 0, '段7d(A)③: 初めての訪問（保存値なし）は①「本育成編成」を開く');
			await sp.page.evaluate(() => selectStepTab(2));
			assert((await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:stepTab'))) === '2', 'タブを選ぶと umaSkillDeck:stepTab に保存する');
			await sp.page.reload({ waitUntil: 'networkidle' });
			assert((await active()) === 2, '③を開いて再読み込みすると③を開く');
			await sp.page.evaluate(() => selectStepTab(1));
			await sp.page.reload({ waitUntil: 'networkidle' });
			assert((await active()) === 1, '②を開いて再読み込みすると②を開く');
			const exported = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData') || '');
			assert(!exported.includes('stepTab'), '前回のタブは書き出しの対象（umaSkillDeck:userData）に入らない');
			await sp.page.evaluate(() => localStorage.setItem('umaSkillDeck:stepTab', 'x'));
			await sp.page.reload({ waitUntil: 'networkidle' });
			assert((await active()) === 0, '壊れた保存値のときは①を開く');
			assert(jsErrors(sp.errors).length === 0, 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 2));
			await sp.ctx.close();
		}
		// ④ 距離・脚質・バ場のセレクト: 「指定なし」以外は白文字・黒背景（選んでいるタブと同じトークン）
		{
			const sp = await open({ w: 375, h: 812, roster: { umaId: umaLv7.id, cardIds: [cA.id, cB.id, null, null, null, null] } });
			const sel = (ax) => sp.page.evaluate((ax) => { const e = document.querySelector('#deck-roster-panel select[data-axis="' + ax + '"]'); const cs = getComputedStyle(e); const tab = getComputedStyle(document.querySelector('.step-tab[aria-selected="true"] .step-tab-num') || document.body);
				return { color: cs.color, bg: cs.backgroundColor, on: e.classList.contains('usd-roster-filtersel--on'), value: e.value }; }, ax);
			const off0 = await sel('distance');
			await sp.page.selectOption(P + 'select[data-axis="distance"]', 'long');
			await sp.page.waitForTimeout(150);
			const on1 = await sel('distance'), off1 = await sel('style');
			const inverse = await sp.page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'color:var(--uma-text-inverse);background:var(--uma-surface-inverse)'; document.body.appendChild(d); const c = getComputedStyle(d); const r = { color: c.color, bg: c.backgroundColor }; d.remove(); return r; });
			assert(on1.on && on1.color === inverse.color && on1.bg === inverse.bg && !off0.on && !off1.on && off1.bg !== inverse.bg,
				'段7d(A)④: 「指定なし」以外を選んだセレクトは、白文字・黒背景（--uma-text-inverse／--uma-surface-inverse）。指定なしのままのものは変わらない', { on1, off0, off1, inverse });
			await sp.page.selectOption(P + 'select[data-axis="distance"]', '');
			await sp.page.waitForTimeout(150);
			assert(!(await sel('distance')).on, '「指定なし」に戻すと元の見た目に戻る');
			await sp.ctx.close();
		}
		// ⑦ ヘッダーのバッジ「β版（2nd Edition）」: 広い幅は exam の「β版」と同じ大きさ。狭い幅は収まる（350px 以下は「β版」だけ）
		{
			const exam = await openPage(browser, base, 'exam.html', { width: 1280, height: 800 });
			const examSize = await exam.page.evaluate(() => { const h1 = document.querySelector('header h1'); const sp = Array.from(h1.querySelectorAll('span')).find((s) => s.textContent.trim() === 'β版'); return sp ? getComputedStyle(sp).fontSize : null; });
			await exam.ctx.close();
			for (const [w, h] of [[1280, 800], [700, 800], [390, 800], [375, 800], [360, 800], [320, 800]]) {
				const sp = await open({ w, h });
				const m = await sp.page.evaluate(() => { const b = document.querySelector('header .header-edition'); const hd = document.querySelector('header'); const hr = hd.getBoundingClientRect(); const br = b.getBoundingClientRect();
					return { text: b.textContent.trim(), inner: b.innerText.trim(), size: getComputedStyle(b).fontSize, hdH: hr.height, badgeRight: br.right, hdRight: hr.right, title: document.title, docW: document.documentElement.scrollWidth, iw: innerWidth }; });
				assert(m.text === 'β版（2nd Edition）' && !m.text.includes('2nd edition β版') && m.title.includes('2nd Edition'), '段7d(A)⑦ ' + w + 'px: バッジは「β版（2nd Edition）」', m);
				if (w >= 768) assert(m.size === examSize, w + 'px: 大きさは exam.html の「β版」と同じ（' + examSize + '）', { size: m.size, examSize });
				if (w <= 640) assert(m.size === '11px', w + 'px: スマホでは 11px のまま', m.size);
				if (w <= 350) assert(m.inner === 'β版', w + 'px: 350px 以下は「β版」だけ（収まらないため）', m.inner);
				else assert(m.inner === 'β版（2nd Edition）', w + 'px: 351px 以上は「β版（2nd Edition）」が収まる', m.inner);
				assert(m.badgeRight <= m.hdRight && m.docW <= m.iw && (w > 640 || m.hdH <= 48), w + 'px: ヘッダーに収まり、横にはみ出さない（スマホでは高さ 48px 以下。実測 ' + m.hdH + 'px）', m);
				await sp.ctx.close();
			}
		}
		// ⑧ 2文字のスキル名: 名前のボタンは左右に空きを足さない（タップの領域 28px は padding と負のマージンで確保）
		{
			assert(!!two, '前提: 2文字の名前のスキルがマスターにある');
			const evTwo = JSON.parse(JSON.stringify(evDoc));
			evTwo.entries[0].chain[1].choices[0].skills.push(ref(two.id, 1));
			const sp = await open({ w: 375, h: 812, routes: { evDoc: evTwo, ptDoc: mkPt({}, { [two.id]: 100 }) } });
			const rows = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')).filter((row) => row.querySelector('.usd-roster-take') && row.querySelector('.usd-roster-pt')).map((row) => {
				const take = row.querySelector('.usd-roster-take').getBoundingClientRect();
				const btn = row.querySelector('.usd-roster-skillname');
				const t = btn.firstChild; const rg = document.createRange(); rg.setStart(t, 0); rg.setEnd(t, t.length);
				const tr = rg.getBoundingClientRect(); const br = btn.getBoundingClientRect();
				const pt = row.querySelector('.usd-roster-pt').getBoundingClientRect();
				return { id: row.getAttribute('data-skill-id'), textW: Math.round(tr.width), boxW: Math.round(br.width), left: Math.round((tr.left - take.right) * 10) / 10, right: Math.round((pt.left - tr.right) * 10) / 10 };
			}));
			const mine = rows.find((r) => r.id === two.id);
			const lefts = rows.map((r) => r.left), rights = rows.map((r) => r.right);
			assert(mine && mine.textW <= 24 && mine.boxW >= 28 && Math.max(...lefts) - Math.min(...lefts) <= 1 && Math.max(...rights) - Math.min(...rights) <= 1 && rows.length >= 5,
				'段7d(A)⑧: 2文字の名前（' + two.name + '）も、チェックとの間・Pt との間が他の名前（' + rows.length + '行）と同じ。タップの領域は 28px 以上', { mine, lefts: [...new Set(lefts)], rights: [...new Set(rights)] });
			await sp.ctx.close();
		}
	});

	/* ============================================================
	 * B. ⑤ 選ぶ必要のあるイベント／⑥ ②=①／⑫ 種数／② 前段の1行
	 * ============================================================ */
	await block('段7d(B) 選ぶ必要のあるイベント・②=①の数字・種数・前段の1行', async () => {
		// ⑤ 絞り込み後に残るスキルを成功側に持つ選択肢が2つ以上あるイベントだけ「選ぶ必要あり」（1つなら自動・0なら不要）
		{
			assert(SHORT.length >= 3 && LONG.length >= 3, '前提: 距離が短距離だけ・長距離だけのスキルがマスターにある', { s: SHORT.length, l: LONG.length });
			const evPend = { dataVersion: '2026-10-03a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries: [
				{ cardId: cA.id, status: 'done', chain: [
					{ step: 1, choices: [{ skills: [ref(SHORT[0], 1)] }, { skills: [ref(LONG[0], 1)] }] },     // 長距離で絞ると、残る選択肢は1つ → 自動
					{ step: 2, choices: [{ skills: [ref(SHORT[1], 1)] }, { skills: [ref(SHORT[2], 1)] }] }] },  // 長距離で絞ると、残る選択肢は0 → 不要
				{ cardId: cB.id, status: 'done', chain: [
					{ step: 1, choices: [{ skills: [ref(LONG[1], 1)] }, { skills: [ref(LONG[2], 1)] }] }] },    // 長距離で絞っても、残る選択肢は2つ → 選ぶ必要あり
			] };
			const evBtns = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel button[data-usd-act="events"]')).map((b) => ({ key: b.getAttribute('data-member-key'), unsel: Number(b.getAttribute('data-unselected')), bang: b.textContent.trim() === '!', label: b.getAttribute('aria-label') })));
			let sp = await open({ w: 375, h: 812, routes: { evDoc: evPend } });
			let b = await evBtns(sp.page);
			assert(b.find((x) => x.key === '1').unsel === 2 && b.find((x) => x.key === '2').unsel === 1 && b.every((x) => x.bang), '段7d(A)⑤: 絞り込みなしでは、残る選択肢が2つあるイベントはすべて「選ぶ必要あり」（1枚目 2件・2枚目 1件。「!」）', b);
			await sp.page.selectOption(P + 'select[data-axis="distance"]', 'long');
			await sp.page.waitForTimeout(200);
			b = await evBtns(sp.page);
			const b1 = b.find((x) => x.key === '1'), b2 = b.find((x) => x.key === '2');
			assert(b1.unsel === 0 && !b1.bang && !b1.label.includes('未選択') && b2.unsel === 1 && b2.bang && b2.label.includes('未選択1件'),
				'長距離で絞ると: 1枚目（残る選択肢が1つ→自動・0つ→不要）は「!」も「未選択N件」も出ない。2枚目（残る選択肢が2つ）は未選択1件のまま', b);
			await sp.page.click(P + 'button[data-usd-act="events"][data-member-key="1"]');
			await sp.page.waitForTimeout(300);
			const pop = await sp.page.evaluate(() => ({ head: (document.querySelector('[data-usd-el="events-unselected"]') || {}).textContent, autos: document.querySelectorAll('[data-usd-el="event-auto"]').length, events: document.querySelectorAll('[data-usd-el="event"]').length }));
			assert(pop.head === '未選択0件' && pop.autos === 1 && pop.events === 2, '小窓の「未選択N件」も同じ決まり（0件）。残る選択肢が1つのイベントには「自動」が付く', pop);
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(150);
			await sp.page.click(P + 'button[data-usd-act="events"][data-member-key="2"]');
			await sp.page.waitForTimeout(300);
			await sp.page.click('[data-usd-el="event-choice"][data-choice="0"]');
			await sp.page.waitForTimeout(300);
			b = await evBtns(sp.page);
			assert(b.find((x) => x.key === '2').unsel === 0, '選ぶ必要のあるイベントを選ぶと、未選択は0件になる', b);
			assert(jsErrors(sp.errors).length === 0, 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 2));
			await sp.ctx.close();
		}

		// ⑥ ②が本育成編成として数える Pt は、①でその編成に出ている「X Pt/N種」と常に同じ。本育成編成が「なし」のときは編成の Pt を 0 として数える
		{
			const cases = [
				{ label: '素の編成', st: 'none', extra: {} },
				{ label: '切れ者＋W2 を取得しない', st: 'kire', extra: { offSkillIds: [W[2]] } },
				{ label: '勉強家＋距離を長距離で絞り込み', st: 'benkyo', extra: { skillFilter: { distance: 'long' } } },
				{ label: '切れ者＋イベントの選択（W1 を選ぶ）＋覚醒ヒントLv5', st: 'kire', extra: { eventChoices: { ['card:' + cA.id + '#0']: 1 } }, uma: true, lv5: true },
			];
			for (const c of cases) {
				const tag = '段7d(B)⑥ ' + c.label + ': ';
				const content = Object.assign({ umaId: c.uma ? umaLv7.id : '', cardIds: [cA.id, cB.id, null, null, null, null], pt: { umaHintLevel: c.lv5 ? 5 : 3, status: c.st } }, c.extra);
				const saved = mkRoster(0, content.cardIds, Object.assign({}, content, { rosterId: 'r7d0' }));
				const sp = await open({ w: 375, h: 812, userData: baseUser({ rosters: [saved] }), roster: content, scope: { skillIds: [], name: '', tiers: {}, updatedAt: '' } });
				const s1 = await readSum(sp.page);
				const total1 = num(s1.total);
				await sp.page.evaluate(() => selectStepTab(1, { noSave: true }));
				await link(sp.page, 2);
				const bt = await linkBtn(sp.page);
				const n = await readNeed(sp.page);
				const stLabel = (rules.statuses.find((s) => s.id === c.st) || {}).label;   // 「なし」のときは状態と「_」を省く
				assert(num(bt.text) === total1 && bt.text === '本育成編成：' + (stLabel && c.st !== 'none' ? stLabel + '_' : '') + fmt(total1) + ' Pt', tag + '本育成編成のボタンの Pt が①の「X Pt/N種」の X と同じ（' + fmt(total1) + '）', { ptn: s1.total, btn: bt.text });
				const u = UNIQ(6, 3, c.st);
				assert(!n.hidden && n.chips.every((x) => x.n === total1 + u), tag + '②の必要スキルPt（＋超優先・＋優先・＋通常）は、①の数字（' + fmt(total1) + '）＋継承固有（' + fmt(u) + '）', { chips: n.chips.map((x) => x.n), total1, u });
				await sp.ctx.close();
			}
			// 本育成編成が「なし」: 編成の Pt は 0（①で選択中の編成の Pt は入らない）。スキル0種で本育成編成なしなら、必要スキルPt は出ない
			let sp = await open({ w: 375, h: 812, userData: baseUser({ rosters: [mkRoster(0, null, { pt: { umaHintLevel: 3, status: 'kire' } })] }), roster: { umaId: umaLv7.id, cardIds: [cA.id, cB.id, null, null, null, null], pt: { umaHintLevel: 3, status: 'benkyo' } }, scope: { skillIds: [], name: '', tiers: {}, updatedAt: '' } });
			let n = await readNeed(sp.page);
			await sp.page.evaluate(() => selectStepTab(1, { noSave: true }));
			n = await readNeed(sp.page);
			assert(n.hidden, '段7d(B)⑥(b): 本育成編成が「なし」でスキル0種のセットには、必要スキルPt が出ない（①の編成の Pt が数えられていた不具合）', n);
			await sp.ctx.close();
			sp = await open({ w: 375, h: 812, userData: baseUser({ rosters: [mkRoster(0, null, { pt: { umaHintLevel: 3, status: 'kire' } })] }), tab: 1, scope: { skillIds: [W[8]], name: '', tiers: {}, updatedAt: '' } });
			n = await readNeed(sp.page);
			assert(!n.hidden && n.chips[0].n === UNIQ(6, 3, 'none') && n.chips[1].n === pay(180, 5, 'none') + UNIQ(6, 3, 'none') && n.chips[2].n === n.chips[1].n,
				'本育成編成が「なし」のセットは、①で選択中の編成の Pt を足さない（因子のスキル W8 は親由来 Lv5 で ' + pay(180, 5, 'none') + ' Pt＋継承固有のみ）', n.chips.map((x) => x.n));
			await link(sp.page, 2);
			n = await readNeed(sp.page);
			assert(n.chips[0].n > UNIQ(6, 3, 'kire'), '本育成編成を選ぶと、編成の Pt が加わる（切れ者の編成）', n.chips.map((x) => x.n));
			await link(sp.page, 1);
			n = await readNeed(sp.page);
			assert(n.chips[0].n === UNIQ(6, 3, 'none'), '「なし」に戻すと、編成の Pt は 0 に戻る（①の編成には戻らない）', n.chips.map((x) => x.n));
			await sp.ctx.close();
		}

		// ② 前段の1行: 「ヒントLv0：折れない心 162」の形。3行（前段として必要・内訳・前段を含む合計）は無い。合計は前段を含む額
		{
			const stepMulti = mkStep([{ skillId: W[3], prevSkillIds: [W[8]], }, { skillId: W[8], hintRootSkillId: W[6], prevSkillIds: [] }, { skillId: W[2], prevSkillIds: [W[4]] }, { skillId: W[6], prevSkillIds: [W[5]] }]);
			let sp = await open({ w: 375, h: 812 });
			let s = await readSum(sp.page);
			const sureTotal = pay(BASE[W[2]], 3, 'none') + pay(BASE[W[3]], 1, 'none') + pay(BASE[W[6]], 1, 'none') + pay(BASE[W[7]], 1, 'none') + hintIds.length * pay(50, 5, 'none');
			const prevW8 = pay(BASE[W[8]], 0, 'none');
			assert(s.prevCount === 1 && s.prev === 'ヒントLv0：' + nameOf(W[8]) + ' ' + prevW8 && s.old.length === 0, '段7d(B)②: 前段は「ヒントLv0：{名前} {Pt}」の1行だけ。「前段として必要」「前段を含む合計」の行は無い', s);
			assert(num(s.total) === sureTotal + prevW8, '合計の「X Pt/N種」は前段のPt を含む額（本育成 ' + fmt(sureTotal) + ' ＋前段 ' + prevW8 + '）', s);
			const h = await sp.page.evaluate(() => { const e = document.querySelector('#deck-roster-panel [data-usd-el="pt-prev"]'); return e.getBoundingClientRect().height; });
			assert(h <= 20, '前段の行は1行の高さ（縦に増やさない。実測 ' + h + 'px）', { h });
			await sp.ctx.close();
			// 複数・ヒントレベル違い: 「・」で区切り、レベルが違うものは「／」で分ける。長いときはその行だけ横に送る
			sp = await open({ w: 320, h: 700, routes: { stepDoc: stepMulti, ptDoc: mkPt({ [W[3]]: 'gold' }, { [W[5]]: 100 }) } });
			s = await readSum(sp.page);
			const lines = await sp.page.evaluate(() => { const e = document.querySelector('#deck-roster-panel [data-usd-el="pt-prev"]'); const cs = getComputedStyle(e); return { text: e.textContent, h: e.getBoundingClientRect().height, sw: e.scrollWidth, cw: e.clientWidth, ws: cs.whiteSpace, ox: cs.overflowX }; });
			assert(/^ヒントLv0：.+ \d+(・.+ \d+)*(／ヒントLv\d+：.+)?$/.test(lines.text) && lines.text.includes('・') && lines.h <= 20 && lines.ws === 'nowrap' && lines.ox === 'auto',
				'複数の前段は「・」で区切る。長いとき（320px）もこの行だけ横に送り、縦に増やさない', lines);
			await sp.ctx.close();
			sp = await open({ w: 375, h: 812, routes: { stepDoc: mkStep([]) } });
			s = await readSum(sp.page);
			assert(s.prevCount === 0, '前段が無いときは、この行を出さない', s);
			await sp.ctx.close();
		}

		// ⑫ 種数: 金スキルと、その前段の白スキルを両方取るときは合わせて1種（①の合計・①のタブ・②の追加済み・タブ・分類・②のタブ）
		{
			const stepPair = mkStep([{ skillId: W[3], prevSkillIds: [W[2]] }]);   // W3（金）の前段が W2（どちらも本育成で得る）
			let sp = await open({ w: 375, h: 812, routes: { stepDoc: stepPair } });
			const s = await readSum(sp.page);
			const items = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')).filter((r) => r.querySelector('.usd-roster-got')).length);
			assert(num(s.count) === items - 1 && s.badge === (items - 1) + '種', '段7d(B)⑫: ①は金スキル W3 と前段の白スキル W2 を両方取るので1種に数える（' + items + ' → ' + (items - 1) + '）。①のタブの「N種」も同じ', { count: s.count, badge: s.badge, items });
			await sp.ctx.close();
			const scope = { skillIds: [W[2], W[3], W[6]], name: '', tiers: { [W[2]]: 1, [W[3]]: 3 }, updatedAt: '' };
			sp = await open({ w: 375, h: 812, tab: 1, routes: { stepDoc: stepPair }, scope });
			const c = await sp.page.evaluate(() => { const t = (k) => (document.querySelector('[data-usd-el="' + k + '"]') || {}).textContent; return { sel: t('selected-count'), t1: t('tier-count-1'), t2: t('tier-count-2'), t3: t('tier-count-3'), total: t('tier-total'),
				tab: (document.querySelector('#deck-template-panel [data-usd-el="tabs"] [aria-selected="true"]') || {}).textContent, badge: document.getElementById('skill-count-badge').textContent }; });
			assert(c.sel === '2' && c.t1 === '0' && c.t2 === '1' && c.t3 === '1' && c.total === '2' && c.badge === '2種',
				'②: 追加済みスキル（N種）・設定数・②のタブは2種。組（W2＋W3）は金の分類（通常）の側で数える（超優先 0・優先 1・通常 1）', c);
			assert(/2種/.test(c.tab || ''), '②の保存前のタブの「N種」も2種', c.tab);
			await sp.ctx.close();
			// 金と白が両方なければ数えない（W3 だけ）
			sp = await open({ w: 375, h: 812, tab: 1, routes: { stepDoc: stepPair }, scope: { skillIds: [W[3], W[6]], name: '', tiers: {}, updatedAt: '' } });
			const c2 = await sp.page.evaluate(() => document.querySelector('[data-usd-el="selected-count"]').textContent);
			assert(c2 === '2', '金スキルだけ・白スキルだけのときは、合わせて数えない（2 のまま）', c2);
			await sp.ctx.close();
		}
	});

	/* ============================================================
	 * C. ⑨ チップ／⑩ ボタン／⑪ 継承固有／⑬ 行の Pt／⑭⑮ 削除／縦の高さ
	 * ============================================================ */
	await block('段7d(C) 必要スキルPtのチップ・本育成編成のボタン・継承固有・②の行・縦の高さ', async () => {
		const UD = baseUser({ rosters: [mkRoster(0, null, { name: '編成A', pt: { umaHintLevel: 3, status: 'kire' } })] });
		const scopeA = { skillIds: [W[8], W[4]], name: '', tiers: {}, updatedAt: '' };
		for (const w of [375, 1280]) {
			const tag = '段7d(C) ' + w + 'px: ';
			const sp = await open({ w, h: w === 375 ? 812 : 900, tab: 1, userData: UD, scope: scopeA });
			// ⑨⑩ チップ・ボタンの文言
			let n = await readNeed(sp.page);
			assert(n.chips.map((c) => c.text.replace(/\s+/g, ' ')).join('|') === ['＋超優先：' + fmt(n.chips[0].n) + ' Pt', '＋優先：' + fmt(n.chips[1].n) + ' Pt', '＋通常：' + fmt(n.chips[2].n) + ' Pt'].join('|'),
				tag + 'チップは「＋超優先：X,XXX Pt」「＋優先：…」「＋通常：…」（＋と：は全角。数字と Pt の間は空白）', n.chips.map((c) => c.text));
			let b = await linkBtn(sp.page);
			assert(b.text === '本育成編成' && b.pressed === 'false', tag + '編成を選んでいないときは「本育成編成」だけ', b);
			await link(sp.page, 2);
			b = await linkBtn(sp.page);
			assert(b.pressed === 'true' && /^本育成編成：切れ者_[0-9,]+ Pt$/.test(b.text) && !b.text.includes('編成A') && b.title.includes('編成A'),
				tag + '選んだあとは「本育成編成：切れ者_X,XXX Pt」。編成の名前は出さない（title には残る）', b);
			// ⑪ 継承固有: 既定 6種・Lv3。ラベルと2つのセレクトが1つの部品。ボタンと同じ1行
			const u0 = await sp.page.evaluate(() => { const u = document.querySelector('[data-usd-el="uniq"]'); const bt = document.querySelector('[data-usd-el="roster-link-btn"]'); const ur = u.getBoundingClientRect(), br = bt.getBoundingClientRect();
				return { label: u.querySelector('.usd-uniq-label').textContent, cnt: u.querySelector('[data-usd-el="uniq-count"]').value, lv: u.querySelector('[data-usd-el="uniq-level"]').value, cntOpts: Array.from(u.querySelectorAll('[data-usd-el="uniq-count"] option')).map((o) => o.textContent), lvOpts: Array.from(u.querySelectorAll('[data-usd-el="uniq-level"] option')).map((o) => o.textContent),
					sameRow: Math.abs(ur.top - br.top) <= 1, hEq: Math.abs(ur.height - br.height) <= 1, uTop: ur.top }; });
			assert(u0.label === '継承固有' && u0.cnt === '6' && u0.lv === '3' && u0.cntOpts.join() === '2種,3種,4種,5種,6種' && u0.lvOpts.join() === 'Lv1,Lv2,Lv3,Lv4,Lv5' && u0.sameRow && u0.hEq,
				tag + '「継承固有」は［ラベル｜種類 2〜6（既定 6）｜ヒントLv 1〜5（既定 3）］で、本育成編成のボタンと同じ行・同じ高さ', u0);
			n = await readNeed(sp.page);
			const base6 = n.chips[0].n - UNIQ(6, 3, 'kire');
			assert(base6 > 0 && n.chips[1].n - UNIQ(6, 3, 'kire') >= base6, tag + '必要スキルPt に継承固有（6種×基礎200・Lv3・切れ者の割引 = ' + fmt(UNIQ(6, 3, 'kire')) + ' Pt）が足されている', { chips: n.chips.map((c) => c.n) });
			let st = await draftScope(sp.page);
			assert(!('inheritedUnique' in (st || {})), tag + '触っていないときは inheritedUnique を保存しない', st);
			await sp.page.selectOption(T + '[data-usd-el="uniq-count"]', '3');
			await sp.page.waitForTimeout(150);
			n = await readNeed(sp.page);
			assert(n.chips[0].n === base6 + UNIQ(3, 3, 'kire'), tag + '種類を 3種 にすると、継承固有は 3種ぶん（' + fmt(UNIQ(3, 3, 'kire')) + ' Pt）', n.chips.map((c) => c.n));
			await sp.page.selectOption(T + '[data-usd-el="uniq-level"]', '5');
			await sp.page.waitForTimeout(150);
			n = await readNeed(sp.page);
			assert(n.chips[0].n === base6 + UNIQ(3, 5, 'kire'), tag + 'ヒントLv を Lv5 にすると、Lv5 の割引（' + fmt(UNIQ(3, 5, 'kire')) + ' Pt）', n.chips.map((c) => c.n));
			st = await draftScope(sp.page);
			assert(JSON.stringify(st.inheritedUnique) === JSON.stringify({ count: 3, hintLevel: 5 }), tag + '保存はセットごと（inheritedUnique: { count, hintLevel }）', st.inheritedUnique);
			await sp.page.selectOption(T + '[data-usd-el="uniq-count"]', '6');
			await sp.page.waitForTimeout(100);
			st = await draftScope(sp.page);
			assert(JSON.stringify(st.inheritedUnique) === JSON.stringify({ hintLevel: 5 }), tag + '既定値（6種）に戻した側は書かない', st.inheritedUnique);
			await sp.page.selectOption(T + '[data-usd-el="uniq-level"]', '3');
			await sp.page.waitForTimeout(100);
			st = await draftScope(sp.page);
			assert(!('inheritedUnique' in st), tag + 'どちらも既定に戻すと項目ごと消える', st);
			// 「種」には数えない
			const cnt = await sp.page.evaluate(() => document.querySelector('[data-usd-el="selected-count"]').textContent);
			assert(cnt === '2', tag + '継承固有は「種」には数えない（追加済みスキル 2種のまま）', cnt);
			// 「本育成編成」が「なし」なら割引なし
			await link(sp.page, 1);
			await sp.page.selectOption(T + '[data-usd-el="uniq-count"]', '4');
			await sp.page.waitForTimeout(100);
			n = await readNeed(sp.page);
			assert(n.chips[0].n === UNIQ(4, 3, 'none'), tag + '本育成編成が「なし」のときは割引なし（4種×Lv3 = ' + fmt(UNIQ(4, 3, 'none')) + ' Pt）', n.chips.map((c) => c.n));
			// ⑭⑮ 削除したもの
			await link(sp.page, 2);
			const gone = await sp.page.evaluate(() => ({ notice: !!document.querySelector('[data-usd-el="roster-link-notice"]'), undo: !!document.querySelector('[data-usd-act="roster-link-undo"]'), dup: !!document.querySelector('#deck-template-panel [data-usd-act="template-duplicate"]'), dupRow: !!document.querySelector('[data-usd-el="tm-actions"]'),
				text: document.querySelector('#deck-template-panel').textContent.includes('因子周回から外しました') }));
			assert(!gone.notice && !gone.undo && !gone.dup && !gone.dupRow && !gone.text, tag + '「…を因子周回から外しました」の文と「元に戻す」ボタン（⑭）、「複製」ボタン（⑮）は無い', gone);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 2));
			await sp.ctx.close();
		}

		// ⑭ 外す動きと、右下の「元に戻す」（Undo）は残っている
		{
			const sp = await open({ w: 1280, h: 900, tab: 1, userData: UD, scope: { skillIds: [W[2], W[8]], name: '', tiers: {}, updatedAt: '' } });
			await link(sp.page, 2);
			const ids = (await draftScope(sp.page)).skillIds;
			const undo = await sp.page.evaluate(() => { const b = document.getElementById('deck-undo-btn'); return { n: (document.getElementById('deck-undo-count') || {}).textContent, vis: b ? getComputedStyle(b).display !== 'none' : null }; });
			assert(ids.join() === [W[8]].join() && undo.n === '1' && undo.vis === true, '段7d(C)⑭: 本育成で得るスキル W2 は因子周回から外れ、右下の「元に戻す」（Undo）は残る', { ids, undo });
			await sp.ctx.close();
		}

		// ⑬ ②の行: 名前の右に Pt。名前（button）を押すと説明の小窓。ⓘ と長押しは無い。Pt は必要スキルPt に数えている値
		{
			const sp = await open({ w: 375, h: 812, tab: 1, userData: UD, scope: { skillIds: [W[8], W[4]], name: '', tiers: { [W[4]]: 3 }, updatedAt: '' } });
			await link(sp.page, 2);
			await sp.page.selectOption(T + '[data-usd-el="uniq-count"]', '2');
			const read = () => sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel')).map((p) => ({ id: p.getAttribute('data-skill-id'), btn: !!p.querySelector('button.usd-panel-namebtn'), info: !!p.querySelector('.usd-info-btn'), pt: (p.querySelector('[data-usd-el="panel-pt"]') || {}).textContent, h: Math.round(p.getBoundingClientRect().height) })));
			let rows = await read();
			const r8 = rows.find((r) => r.id === W[8]);
			assert(rows.length === 1 && r8.btn && !r8.info && r8.pt === pay(180, 5, 'kire') + ' Pt', '段7d(C)⑬: 行の名前は button、ⓘ は無い。Pt は親由来のレベル 5 と切れ者の割引を反映（' + pay(180, 5, 'kire') + ' Pt）', rows);
			await sp.page.click(T + '[data-usd-act="tier-tab"][data-tier="3"]');
			rows = await read();
			assert(rows.length === 1 && rows[0].id === W[4] && rows[0].pt === pay(160, 5, 'kire') + ' Pt', '通常の分類の行も同じ（' + pay(160, 5, 'kire') + ' Pt）', rows);
			await sp.page.selectOption(T + '[data-usd-el="pt-parent-level"]', '3');
			await sp.page.waitForTimeout(150);
			rows = await read();
			assert(rows[0].pt === pay(160, 3, 'kire') + ' Pt', '親由来のレベルを 3 にすると行の Pt も変わる（' + pay(160, 3, 'kire') + ' Pt）', rows);
			const n = await readNeed(sp.page);
			await sp.page.click(T + '.usd-panel-namebtn');
			await sp.page.waitForTimeout(250);
			const pv = await sp.page.evaluate(() => { const pop = document.querySelector('[data-usd-el="info-pop"]'); return pop && !pop.hidden ? pop.querySelector('.uma-popover-title').textContent.trim() : null; });
			assert(pv === nameOf(W[4]), '名前（button）を押すと説明の小窓（段6のもの）が開く', pv);
			await sp.page.keyboard.press('Escape');
			// 長押しでは開かない（ⓘ と長押しはやめた）
			const box = await sp.page.locator(T + '.usd-panel-namebtn').boundingBox();
			await sp.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await sp.page.mouse.down();
			await sp.page.waitForTimeout(800);
			const openedByHold = await sp.page.evaluate(() => { const pop = document.querySelector('[data-usd-el="info-pop"]'); return !!pop && !pop.hidden; });
			await sp.page.mouse.up();
			await sp.page.waitForTimeout(150);
			await sp.page.keyboard.press('Escape');
			assert(!openedByHold, '名前を長押ししても小窓は開かない（長押しはやめた。離したときのクリックで開く）');
			assert(rows.every((r) => r.h <= 40), '行の高さは増えない（Pt を添えても ' + Math.max(...rows.map((r) => r.h)) + 'px）', rows);
			await sp.ctx.close();
		}

		// 縦の高さ（恒久ルール25）: 375px で、①と②の「表より上の高さ」が段7c より増えていない。段7c の実測（同じ材料）: ① 383px／② 474px
		{
			const out = [];
			for (const [w, h] of [[375, 667], [375, 812]]) {
				let sp = await open({ w, h, routes: { scenDoc: scenReal }, roster: { umaId: umaLv7.id, cardIds: [cA.id, cB.id, null, null, null, null] } });
				const g = await sp.page.evaluate(() => Math.round(document.querySelector('#deck-roster-panel .usd-roster-grid-wrap').getBoundingClientRect().top + scrollY));
				await sp.ctx.close();
				sp = await open({ w, h, tab: 1, userData: UD, routes: { scenDoc: scenReal }, scope: { skillIds: [W[8], W[4]], name: '', tiers: {}, updatedAt: '' } });
				await link(sp.page, 2);
				const l = await sp.page.evaluate(() => Math.round(document.querySelector('#deck-template-panel [data-usd-el="selected-list"]').getBoundingClientRect().top + scrollY));
				const chipTops = (await readNeed(sp.page)).chips.map((c) => c.top);
				const rowTops = await sp.page.evaluate(() => ['roster-link-btn', 'uniq'].map((k) => Math.round(document.querySelector('[data-usd-el="' + k + '"]').getBoundingClientRect().top)));
				const hs = await SP(sp.page);
				out.push({ w, h, grid: g, list: l });
				assert(g <= 383, '段7d(C) ' + w + '×' + h + ': ①の表より上の高さ ' + g + 'px は段7c（383px）以下', { g });
				assert(l <= 474, '段7d(C) ' + w + '×' + h + ': ②の追加済みスキルより上の高さ ' + l + 'px は段7c（474px）以下', { l });
				assert(chipTops[0] === chipTops[1] && chipTops[1] === chipTops[2], '3つのチップは1行', chipTops);
				assert(rowTops[0] === rowTops[1], '本育成編成のボタンと継承固有は1行（375px）', rowTops);
				assert(hs.sw <= hs.iw, '横にはみ出さない', hs);
				await sp.ctx.close();
			}
			console.log('     [実測] 375px の表より上の高さ（段7c: ① 383px／② 474px）: ' + out.map((o) => o.w + '×' + o.h + ' ①' + o.grid + 'px ②' + o.list + 'px').join('・'));
		}
	});
}
