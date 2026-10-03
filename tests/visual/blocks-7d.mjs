// 段7d（2026-10-03・C-116）の検査。run-smoke.mjs の末尾から register7d() で呼ばれる（塊の見出しはすべて「段7d」を含むので、
// `npm run test:visual -- --only=段7d` で全部、`--only=段7d(B)` のように括弧つきの見出しで1つずつ回せる）。
//
//   A  トレセン軒のいいとこ入った！（①）／前回のタブ（③）／絞り込みのセレクトの色（④）／ヘッダーのバッジ（⑦→追加・B で「β版」＋ピル「2nd Edition」）／2文字の名前（⑧）
//   B  選ぶ必要のあるイベントの判定（⑤）／②が数える本育成の Pt＝①の数字（⑥）／種数の数え方（⑫）／前段の1行（②）
//   C  必要スキルPt のチップ（⑨）／本育成編成のボタン（⑩）／継承固有（⑪）／②の行の Pt と名前の小窓（⑬）／削除したもの（⑭⑮）／縦の高さ
//   段8（C-120）で、②の「本育成編成」のボタン・小窓と②の合計を無くした。②の相手は常に同じセットの①（＋新規なら下書きの編成）で、
//   合計は共通の見出しの帯（① ＋ ②）。それらに触れていた検査は、その形に直すか外した（それぞれの場所に注記）
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
		// チップの数字は「そのランクのぶんだけ」（段7d の追加・A）。cum はそのランクまでの累計（data-cum）
		// 段9（C-121）: ランクのチップは無い。ランクごとのぶん（own）と累計（total）は帯の data-cuts（検査用。画面には出さない）、継承固有はタグ（data-pt）から読む
		const band = el.querySelector('[data-usd-el="set-head"]');
		const cuts = band ? JSON.parse(band.getAttribute('data-cuts')) : null;
		const chips = [1, 2, 3].map((k) => (cuts ? { text: '', n: cuts[k - 1].own, cum: cuts[k - 1].total, top: 0 } : null));

		const uniqEl = el.querySelector('[data-usd-el="pt-need-uniq"]');
		const uniq = uniqEl ? { text: uniqEl.textContent.replace(/\s+/g, ' ').trim(), n: Number(uniqEl.getAttribute('data-pt')), cum: null, top: Math.round(uniqEl.getBoundingClientRect().top) } : null;
		// 段8（C-120）: ②の合計（pt-total-row／pt-total-head）は無くなり、合計は共通の見出しの帯（#deck-set-bar）の「合計 X Pt」（① ＋ ②）だけになった。
		// 合計の式（① ＋ 継承固有 ＋ ON のランクの Pt。既定は全部 ON）はそれまでの②の合計と同じなので、帯の data-total を読む
		const bar = document.querySelector('#deck-set-bar [data-usd-el="set-total"]');
		const total = bar ? { where: 'set-total', text: bar.textContent.replace(/\s+/g, ' ').trim(), n: Number(bar.getAttribute('data-total')), top: Math.round(bar.getBoundingClientRect().top) } : null;
		return { hidden: false, chips, uniq, total };
	});
	// 段8（C-120）で②の「本育成編成」のボタンと一覧の小窓を無くした（②の相手は常に同じセットの①）。
	// それまでボタンから読んでいた①の Pt は、①の「X Pt/N種」の X を読む
	const rosterX = async (page) => num((await readSum(page)).total);
	const draftScope = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null'));
	const SP = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

	/* ============================================================
	 * A. ① いいとこ入った！／③ 前回のタブ／④ 絞り込みの色／⑦ バッジ／⑧ 2文字の名前
	 * ============================================================ */
	await block('段7d(A) いいとこ入った！・前回のタブ・絞り込みの色・バッジ・2文字の名前', async () => {
		// ① 実データ: イベント2（シニア級12月後半）の選択肢2が「いいとこ入った！ Lv2」（ex-0318）。「時中の砂」（誤記）は使わない
		{
			const ev2 = scenReal.entries[0].events.find((e) => e.name === 'シニア級12月後半');
			assert(ev2 && ev2.choices.length === 3 && JSON.stringify(ev2.choices[1].skills) === JSON.stringify([{ skillId: 'ex-0318', hintLevel: 2 }]) && nameOf('ex-0318') === 'いいとこ入った！',
				'段7d(A)①: data/scenario-event-skills.json のイベント2の選択肢2は「いいとこ入った！」（ex-0318）Lv2', ev2 && ev2.choices[1]);
			const ev3 = scenReal.entries[0].events.find((e) => e.type === 'fixed');
			const names = ev3.skills.map((s) => nameOf(s.skillId));
			assert(!names.includes('時中の砂'), '「時中の砂」（誤記）はイベント3のどこにも使わない（時中の妙・極上の感謝を！は段7f で入れた。その検査は blocks-7f.mjs）', names);
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
		// ⑦ → 段7d の追加・B: ヘッダーは「β版」と、その右のピル「2nd Edition」（exam の「β版」「新UI」と同じ形式）。
		//    「β版」は exam と同じ文字の大きさ、ピルは exam の「新UI」と同じ高さ・フォントサイズ・太さ。色は special の緑（--uma-accent-soft）。
		//    ヘッダーの高さは増えない（実測の基準: 1280px 104px／700px 80px／640px 以下 47px）。323px 以上はピルの文字が全部入り、322px 以下だけ「2nd」
		{
			const exam = await openPage(browser, base, 'exam.html', { width: 1280, height: 800 });
			const ref = await exam.page.evaluate(() => {
				const h1 = document.querySelector('header h1'); const beta = Array.from(h1.querySelectorAll('span')).find((s) => s.textContent.trim() === 'β版');
				const b = document.getElementById('ui-mode-badge'); b.hidden = false;
				const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
				return { beta: getComputedStyle(beta).fontSize, fs: cs.fontSize, fw: cs.fontWeight, h: Math.round(r.height * 10) / 10, cls: Array.from(b.classList).filter((c) => c === 'ui-mode-badge' || c === 'rounded-full').join() };
			});
			await exam.ctx.close();
			assert(ref.fs === '10px' && ref.fw === '700' && ref.h > 20 && ref.cls === 'ui-mode-badge,rounded-full', '段7d追加(B) 前提: exam の「新UI」（ui-mode-badge）は 10px／太字(700)／高さ ' + ref.h + 'px', ref);
			const HD = (w) => (w >= 1000 ? 104 : w > 640 ? 80 : 47);
			for (const w of [1280, 700, 390, 375, 360, 323, 322, 300]) {
				const sp = await open({ w, h: 800 });
				const m = await sp.page.evaluate(() => {
					const pill = document.querySelector('header .header-edition-pill'); const beta = document.querySelector('header .header-edition'); const hd = document.querySelector('header'); const h1 = document.querySelector('header h1');
					const cs = getComputedStyle(pill); const pr = pill.getBoundingClientRect(); const probe = document.createElement('i'); probe.style.cssText = 'background:var(--uma-accent-soft);color:var(--uma-accent-soft-text)'; document.body.appendChild(probe);
					const pc = getComputedStyle(probe); const soft = { bg: pc.backgroundColor, color: pc.color }; probe.remove();
					const btnLeft = Math.min(...Array.from(hd.querySelectorAll('button')).map((b) => b.getBoundingClientRect().left).filter((x) => x > 0));
					return { tag: pill.tagName, full: pill.innerText.replace(/\s+/g, ' ').trim(), insideH1: h1.contains(pill), fs: cs.fontSize, fw: cs.fontWeight, h: Math.round(pr.height * 10) / 10, cursor: cs.cursor, bg: cs.backgroundColor, color: cs.color, soft, betaFs: getComputedStyle(beta).fontSize, betaText: beta.textContent.trim(),
						hdH: Math.round(hd.getBoundingClientRect().height), pillRight: pr.right, btnLeft, sameRow: Math.abs((pr.top + pr.height / 2) - (beta.getBoundingClientRect().top + beta.getBoundingClientRect().height / 2)) < 8, title: document.title, docW: document.documentElement.scrollWidth, iw: innerWidth };
				});
				const tag = '段7d追加(B) ' + w + 'px: ';
				assert(m.betaText === 'β版' && !m.insideH1 && m.tag === 'SPAN' && m.title.includes('2nd Edition'), tag + 'h1 の中は「β版」、ピル「2nd Edition」は h1 の外（文字の抜きグラデーションを受けない）にある。押せるものではない（span）', m);
				assert(m.fs === ref.fs && m.fw === ref.fw && m.h === ref.h, tag + 'ピルのフォントサイズ（' + m.fs + '）・太さ（' + m.fw + '）・高さ（' + m.h + 'px）は exam の「新UI」と同じ', { m: [m.fs, m.fw, m.h], ref });
				assert(m.bg === m.soft.bg && m.color === m.soft.color && m.cursor === 'default', tag + 'ピルの色は special の緑（--uma-accent-soft／--uma-accent-soft-text）。手のカーソルにならない', { bg: m.bg, color: m.color, soft: m.soft, cursor: m.cursor });
				const wantBeta = w >= 768 ? ref.beta : w > 640 ? '14px' : '11px';   // exam と同じ（768px 以上 16px／それ未満 14px）。640px 以下は詰めて 11px
				assert(m.betaFs === wantBeta, tag + '「β版」の大きさ ' + wantBeta + (w > 640 ? '（exam と同じ）' : '（スマホは 11px）'), m.betaFs);
				assert(m.full === (w >= 323 ? '2nd Edition' : '2nd'), tag + (w >= 323 ? 'ピルは「2nd Edition」（全部入る）' : '全部は入らない幅（322px 以下）だけ「2nd」'), m.full);
				assert(m.hdH === HD(w) && m.pillRight <= m.btnLeft - 4 && m.sameRow && m.docW <= m.iw, tag + 'ヘッダーの高さは ' + HD(w) + 'px のまま（実測 ' + m.hdH + 'px）。ピルは右のボタンの手前（余白 ' + Math.round(m.btnLeft - m.pillRight) + 'px）で、「β版」と同じ行に並び、横にはみ出さない', m);
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
		// 段8（C-120）: ②の相手は常に同じセットの①（＋新規なら下書きの編成）。①の X は帯の合計（① ＋ ②）の①の項として入る。
		// 「本育成編成」のボタン・「なし」・選び直しは無くなったので、ボタンの文言と「なし」に戻す検査は外し、①が空のセットで編成の Pt が 0 になることを見る
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
				const sp = await open({ w: 375, h: 812, roster: content, scope: { skillIds: [], name: '', tiers: {}, updatedAt: '' } });
				const s1 = await readSum(sp.page);
				const total1 = num(s1.total);
				await sp.page.evaluate(() => selectStepTab(1, { noSave: true }));
				const n = await readNeed(sp.page);
				const u = UNIQ(6, 3, c.st);
				assert(total1 > 0 && !n.hidden && n.uniq.n === u && n.chips.every((x) => x.n === 0) && n.total.n === total1 + u, tag + '帯の合計は、①の数字（' + fmt(total1) + '）＋継承固有（' + fmt(u) + '）。スキルを入れていないので 超優先・優先・通常 は 0', { total: n.total, uniq: n.uniq.n, chips: n.chips.map((x) => x.n), total1, u });
				await sp.ctx.close();
			}
			// ①が空のセット: 編成の Pt は 0（段8: 「本育成編成なし」の代わり）
			const sp = await open({ w: 375, h: 812, roster: { umaId: '', cardIds: [null, null, null, null, null, null] }, tab: 1, scope: { skillIds: [W[8]], name: '', tiers: {}, updatedAt: '' } });
			const n = await readNeed(sp.page);
			assert(!n.hidden && n.uniq.n === UNIQ(6, 3, 'none') && n.chips[0].n === 0 && n.chips[1].n === pay(180, 5, 'none') && n.chips[2].n === 0 && n.total.n === UNIQ(6, 3, 'none') + pay(180, 5, 'none'),
				'①が空のセットは、編成の Pt を 0 として数える（因子のスキル W8 は優先で親由来 Lv5 の ' + pay(180, 5, 'none') + ' Pt＋継承固有のみ。超優先・通常は 0）', { chips: n.chips.map((x) => x.n), uniq: n.uniq.n, total: n.total.n });
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
			// 段8（C-120）: ②の「追加済みスキル（N種）」・「設定数」・②のタブの帯は無くなった。②のタブの「N種」は ON のランクの種＋継承固有（既定 6）で、
			// ①で得るスキルは②に数えない。ここでは①を空にして（W2・W3・W6 を①で得ないようにして）、分類のタブの数と②のタブの「N種」で見る
			const emptyRoster = { umaId: '', cardIds: [null, null, null, null, null, null] };
			const scope = { skillIds: [W[2], W[3], W[6]], name: '', tiers: { [W[2]]: 1, [W[3]]: 3 }, updatedAt: '' };
			sp = await open({ w: 375, h: 812, tab: 1, roster: emptyRoster, routes: { stepDoc: stepPair }, scope });
			const c = await sp.page.evaluate(() => { const t = (k) => (document.querySelector('[data-usd-el="' + k + '"]') || {}).textContent; return { t1: t('tier-count-1'), t2: t('tier-count-2'), t3: t('tier-count-3'),
				badge: document.getElementById('skill-count-badge').textContent }; });
			// 段9（C-121）: 分類ごとの数（超優先 0・優先 1・通常 1）の表示は無くなった。組 W2＋W3 が1種に数えられることは、②のタブの「N種」（2種＋継承固有 6）で見る
			assert(c.badge === (2 + 6) + '種',
				'②: 組 W2＋W3 は1種に数える（3スキルで2種）。②のタブは 2種＋継承固有 6 ＝ 8種', c);
			await sp.ctx.close();
			// 金と白が両方なければ数えない（W3 だけ）
			sp = await open({ w: 375, h: 812, tab: 1, roster: emptyRoster, routes: { stepDoc: stepPair }, scope: { skillIds: [W[3], W[6]], name: '', tiers: {}, updatedAt: '' } });
			const c2 = await sp.page.evaluate(() => String(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length));
			assert(c2 === '2', '金スキルだけ・白スキルだけのときは、合わせて数えない（2 のまま）', c2);
			await sp.ctx.close();
		}
	});

	/* ============================================================
	 * C. ⑨ チップ／⑩ ボタン／⑪ 継承固有／⑬ 行の Pt／⑭⑮ 削除／縦の高さ
	 * ============================================================ */
	await block('段7d(C) 必要スキルPtのチップ・本育成編成のボタン・継承固有・②の行・縦の高さ', async () => {
		// 段8（C-120）: ②の相手は常に同じセットの①。それまで「本育成編成」で選んでいた切れ者の編成は、＋新規の①（下書きの編成）に置く
		const rosterKire = { umaId: '', cardIds: [cA.id, cB.id, null, null, null, null], pt: { umaHintLevel: 3, status: 'kire' } };
		const scopeA = { skillIds: [W[8], W[4]], name: '', tiers: {}, updatedAt: '' };
		for (const w of [375, 1280]) {
			const tag = '段7d(C) ' + w + 'px: ';
			const sp = await open({ w, h: w === 375 ? 812 : 900, tab: 1, roster: rosterKire, scope: scopeA });
			// ⑨ チップの文言（段8・D: 「：」のあとに空白が入る。375px では「：」と「 Pt」は見えないが、文字としては残っている）
			let n = await readNeed(sp.page);
			// 段9（C-121）: ランクのチップ（「＋超優先： N Pt」…）は無くなった。継承固有はタグ「継承固有 N Pt／6種」（新しい仕様は blocks-9.mjs の段9(D)）
			assert(/^継承固有 [\d,]+ Pt／6種$/.test(n.uniq.text) && n.uniq.n === UNIQ(6, 3, 'kire'), tag + '継承固有のタグ「継承固有 N Pt／6種」', n.uniq);
			// ⑩ 「本育成編成」のボタンの文言の検査は、段8（C-120）でボタンを無くしたので外した
			// ⑪ 継承固有: 既定 6種・Lv3。ラベルと2つのセレクトが1つの部品。段8: 「共通スキルのヒントLv」と同じ1行（②の2行目）
			const u0 = await sp.page.evaluate(() => { const u = document.querySelector('[data-usd-el="uniq"]'); const bt = document.querySelector('[data-usd-el="parent-level-group"]'); const ur = u.getBoundingClientRect(), br = bt.getBoundingClientRect();
				return { label: u.querySelector('.usd-uniq-label').textContent, cnt: u.querySelector('[data-usd-el="uniq-count"]').value, lv: u.querySelector('[data-usd-el="uniq-level"]').value, cntOpts: Array.from(u.querySelectorAll('[data-usd-el="uniq-count"] option')).map((o) => o.textContent), lvOpts: Array.from(u.querySelectorAll('[data-usd-el="uniq-level"] option')).map((o) => o.textContent),
					sameRow: Math.abs(ur.top - br.top) <= 1, hEq: Math.abs(ur.height - br.height) <= 1, uTop: ur.top }; });
			assert(u0.label === '継承固有' && u0.cnt === '6' && u0.lv === '3' && u0.cntOpts.join() === '2種,3種,4種,5種,6種' && u0.lvOpts.join() === 'Lv1,Lv2,Lv3,Lv4,Lv5' && u0.sameRow && u0.hEq,
				tag + '「継承固有」は［ラベル｜種類 2〜6（既定 6）｜ヒントLv 1〜5（既定 3）］で、「共通スキルのヒントLv」と同じ行・同じ高さ', u0);
			n = await readNeed(sp.page);
			const X = await rosterX(sp.page);   // ①の「X Pt/N種」の X（段8: 「本育成編成」のボタンの代わり）
			const tiersSum = () => n.chips.reduce((t, c) => t + c.n, 0);
			const base6 = tiersSum();
			assert(base6 > 0 && n.uniq.n === UNIQ(6, 3, 'kire') && n.total.n === X + n.uniq.n + base6, tag + '継承固有（6種×基礎200・Lv3・切れ者の割引 = ' + fmt(UNIQ(6, 3, 'kire')) + ' Pt）は継承固有のチップに出て、合計 = 本育成編成 ' + fmt(X) + ' ＋ 継承固有 ＋ 超優先 ＋ 優先 ＋ 通常', { X, uniq: n.uniq.n, tiers: n.chips.map((c) => c.n), total: n.total.n });
			let st = await draftScope(sp.page);
			assert(!('inheritedUnique' in (st || {})), tag + '触っていないときは inheritedUnique を保存しない', st);
			await sp.page.selectOption(T + '[data-usd-el="uniq-count"]', '3');
			await sp.page.waitForTimeout(150);
			n = await readNeed(sp.page);
			assert(n.uniq.n === UNIQ(3, 3, 'kire') && n.total.n === X + UNIQ(3, 3, 'kire') + base6 && tiersSum() === base6, tag + '種類を 3種 にすると、継承固有は 3種ぶん（' + fmt(UNIQ(3, 3, 'kire')) + ' Pt）。ランクのチップは変わらない', { uniq: n.uniq.n, total: n.total.n });
			await sp.page.selectOption(T + '[data-usd-el="uniq-level"]', '5');
			await sp.page.waitForTimeout(150);
			n = await readNeed(sp.page);
			assert(n.uniq.n === UNIQ(3, 5, 'kire') && n.total.n === X + UNIQ(3, 5, 'kire') + base6, tag + 'ヒントLv を Lv5 にすると、Lv5 の割引（' + fmt(UNIQ(3, 5, 'kire')) + ' Pt）', { uniq: n.uniq.n, total: n.total.n });
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
			// 「種」には数えない（段8: 「追加済みスキル（N種）」は無くなったので、分類のタブの数の合計で見る）
			const cnt = await sp.page.evaluate(() => String(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length));
			assert(cnt === '2', tag + '継承固有は分類の数には数えない（2種のまま）', cnt);
			// 「本育成編成」が「なし」なら割引なし、の検査は、段8（C-120）で「なし」が無くなったので外した（①が空のセットの割引なしは段7c(O)(5) が見る）
			// ⑭⑮ 削除したもの
			const gone = await sp.page.evaluate(() => ({ notice: !!document.querySelector('[data-usd-el="roster-link-notice"]'), undo: !!document.querySelector('[data-usd-act="roster-link-undo"]'), dup: !!document.querySelector('#deck-template-panel [data-usd-act="template-duplicate"]'), dupRow: !!document.querySelector('[data-usd-el="tm-actions"]'),
				text: document.querySelector('#deck-template-panel').textContent.includes('因子周回から外しました') }));
			assert(!gone.notice && !gone.undo && !gone.dup && !gone.dupRow && !gone.text, tag + '「…を因子周回から外しました」の文と「元に戻す」ボタン（⑭）、「複製」ボタン（⑮）は無い', gone);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 2));
			await sp.ctx.close();
		}

		// ⑭ 「本育成編成」で選んだ編成の●を因子周回から外す動き（と Undo）は、段8（C-120）で無くなった（①で得るスキルは自動では外さず、②に数えないだけ）。
		// その検査は外した（新しい仕様は blocks-8.mjs の段8(D)）

		// ⑬ ②の行: 名前の右に Pt。名前（button）を押すと説明の小窓。ⓘ と長押しは無い。Pt は必要スキルPt に数えている値
		{
			const sp = await open({ w: 375, h: 812, tab: 1, roster: rosterKire, scope: { skillIds: [W[8], W[4]], name: '', tiers: { [W[4]]: 3 }, updatedAt: '' } });
			await sp.page.selectOption(T + '[data-usd-el="uniq-count"]', '2');
			const read = () => sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel')).map((p) => ({ id: p.getAttribute('data-skill-id'), btn: !!p.querySelector('button.usd-panel-namebtn'), info: !!p.querySelector('.usd-info-btn'), pt: (p.querySelector('[data-usd-el="panel-pt"]') || {}).textContent, h: Math.round(p.getBoundingClientRect().height) })));
			let rows = await read();
			const r8 = rows.find((r) => r.id === W[8]);
			assert(rows.length === 2 && r8.btn && !r8.info && r8.pt === pay(180, 5, 'kire') + ' Pt', '段7d(C)⑬: 行の名前は button、ⓘ は無い。Pt は親由来のレベル 5 と切れ者の割引を反映（' + pay(180, 5, 'kire') + ' Pt）', rows);
			// 段9（C-121）: 分類ごとのタブは無い（すべての行が並ぶ）
			rows = await read();
			assert(rows.length === 2 && rows.find((r) => r.id === W[4]).pt === pay(160, 5, 'kire') + ' Pt', '通常の分類だった行も同じ（' + pay(160, 5, 'kire') + ' Pt）', rows);
			await sp.page.selectOption(T + '[data-usd-el="pt-parent-level"]', '3');
			await sp.page.waitForTimeout(150);
			rows = await read();
			assert(rows.find((r) => r.id === W[4]).pt === pay(160, 3, 'kire') + ' Pt', '親由来のレベルを 3 にすると行の Pt も変わる（' + pay(160, 3, 'kire') + ' Pt）', rows);
			const n = await readNeed(sp.page);
			await sp.page.click(T + '.usd-panel[data-skill-id="' + W[4] + '"] .usd-panel-namebtn');   // 段9: 分類ごとのタブは無く、2行とも並ぶ。W4 の行の名前を押す
			await sp.page.waitForTimeout(250);
			const pv = await sp.page.evaluate(() => { const pop = document.querySelector('[data-usd-el="info-pop"]'); return pop && !pop.hidden ? pop.querySelector('.uma-popover-title').textContent.trim() : null; });
			assert(pv === nameOf(W[4]), '名前（button）を押すと説明の小窓（段6のもの）が開く', pv);
			await sp.page.keyboard.press('Escape');
			// 長押しでは開かない（ⓘ と長押しはやめた）
			const box = await sp.page.locator(T + '.usd-panel[data-skill-id="' + W[4] + '"] .usd-panel-namebtn').boundingBox();
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
				sp = await open({ w, h, tab: 1, roster: rosterKire, routes: { scenDoc: scenReal }, scope: { skillIds: [W[8], W[4]], name: '', tiers: {}, updatedAt: '' } });
				const l = await sp.page.evaluate(() => Math.round(document.querySelector('#deck-template-panel [data-usd-el="selected-list"]').getBoundingClientRect().top + scrollY));
				const need = await readNeed(sp.page);
				const chipTops = [need.uniq].concat(need.chips).map((c) => c.top);
				// 段8: 「本育成編成」のボタンは無くなったので、継承固有と同じ行に並ぶ「共通スキルのヒントLv」で見る
				const rowTops = await sp.page.evaluate(() => ['parent-level-group', 'uniq'].map((k) => Math.round(document.querySelector('[data-usd-el="' + k + '"]').getBoundingClientRect().top)));
				const hs = await SP(sp.page);
				out.push({ w, h, grid: g, list: l });
				assert(g <= 383, '段7d(C) ' + w + '×' + h + ': ①の表より上の高さ ' + g + 'px は段7c（383px）以下', { g });
				assert(l <= 474, '段7d(C) ' + w + '×' + h + ': ②の追加済みスキルより上の高さ ' + l + 'px は段7c（474px）以下', { l });
				// 段9（C-121）: ランクのチップは無くなった（継承固有と共通スキルのタグの並びは blocks-9.mjs の段9(D)）
				assert(rowTops[0] === rowTops[1], '共通スキルのヒントLv と継承固有は1行（375px）', rowTops);
				assert(hs.sw <= hs.iw, '横にはみ出さない', hs);
				await sp.ctx.close();
			}
			console.log('     [実測] 375px の表より上の高さ（段7c: ① 383px／② 474px）: ' + out.map((o) => o.w + '×' + o.h + ' ①' + o.grid + 'px ②' + o.list + 'px').join('・'));
		}
	});

	/* ============================================================
	 * 段7d の追加・A. ②因子周回の必要スキルPt の見せ方
	 *   チップ＝継承固有 → ＋超優先 → ＋優先 → ＋通常（それぞれそのランクのぶんだけ）／合計＝本育成編成 ＋ 継承固有 ＋ 超優先 ＋ 優先 ＋ 通常
	 *   合計は広い幅では「スキルセット　□シナリオ因子 ?　□遺伝子 ?」の行の右、狭い幅（520px 以下）では見出しの行の右端。（?）の小窓に式と累計
	 * ============================================================ */
	await block('段7d追加(A) 必要スキルPtの見せ方（継承固有・ランクごとのチップ・合計・内訳の小窓）', async () => {
		const stepNone = mkStep([]);   // 前段なし（ランクごとの値を、スキル単体の Pt で独立に計算できる）
		const ptX = mkPt({}, { [W[9]]: 140, [W[10]]: 90 });
		const scope = { skillIds: [W[8], W[4], W[9], W[10]], name: '', tiers: { [W[8]]: 1, [W[9]]: 3, [W[10]]: 3 }, updatedAt: '' };   // 超優先 W8／優先 W4／通常 W9・W10
		const STS = [{ id: 'kire', label: '切れ者' }, { id: 'benkyo', label: '勉強家' }, { id: 'none', label: 'なし' }];
		/* 段8（C-120）: ②の相手は常に同じセットの①。それまで「本育成編成」で選んでいた3つの編成（切れ者・勉強家・なし）は、
		   それぞれを baseRosterId に持つ保存済みのセット（同じスキルと分類）にして、セットを選び替えて見る。「本育成編成なし」は＋新規（①が空）。
		   外した検査（どれも段8 で無くした部品）: 合計の置き場所（pt-total-row／pt-total-head）・②の合計の（?）の小窓の式と累計（info-total-formula／info-total-cumulative）・
		   「本育成編成」のボタンの Pt。合計は共通の見出しの帯の合計（① ＋ ②）で見る（式は同じ）。帯の（?）の式は blocks-8.mjs の段8(B) */
		const UD = baseUser({ rosters: STS.map((s, i) => mkRoster(i, null, { name: '編成' + s.label, pt: { umaHintLevel: 3, status: s.id } })),
			templates: USER_DATA.templates.concat(STS.map((s, i) => ({ templateId: 'tpl_7da_' + s.id, name: '編成' + s.label, skillIds: scope.skillIds.slice(), tiers: Object.assign({}, scope.tiers), baseRosterId: 'r7d' + i, createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z' }))) });
		const own = (st) => [pay(180, 5, st), pay(160, 5, st), pay(140, 5, st) + pay(90, 5, st)];   // 超優先・優先・通常（親由来のレベル 5）
		const selectSet = async (page, id) => { await page.evaluate((id) => deckTemplateManager.setSelectedId(id), id); await page.waitForTimeout(300); };
		for (const w of [375, 1280]) {
			const tag = '段7d追加(A) ' + w + 'px: ';
			const sp = await open({ w, h: w === 375 ? 812 : 900, tab: 1, userData: UD, roster: { umaId: '', cardIds: [null, null, null, null, null, null] }, routes: { stepDoc: stepNone, ptDoc: ptX }, scope });
			// (b) ①が空のセット（＋新規）: 本育成の項は 0。合計 = 継承固有 ＋ 超優先 ＋ 優先 ＋ 通常
			let n = await readNeed(sp.page);
			let o = own('none');
			const U6 = UNIQ(6, 3, 'none');
			assert(n.uniq.n === U6 && n.chips.map((c) => c.n).join() === o.join() && n.total.n === U6 + o[0] + o[1] + o[2],
				tag + '(b) ①が空のセット: 継承固有 ' + fmt(U6) + '・超優先 ' + fmt(o[0]) + '・優先 ' + fmt(o[1]) + '・通常 ' + fmt(o[2]) + '。合計 ' + fmt(U6 + o[0] + o[1] + o[2]) + '（本育成の項は 0）', { uniq: n.uniq.n, chips: n.chips.map((c) => c.n), total: n.total });
			// 段9（C-121）: ランクのチップの文言の検査は、チップが無くなったので外した（継承固有のタグは blocks-9.mjs の段9(D)）
			assert(/^継承固有 [\d,]+ Pt／6種$/.test(n.uniq.text), tag + '継承固有のタグ「継承固有 N Pt／6種」', n.uniq.text);
			assert([n.uniq].concat(n.chips).map((c) => c.cum).slice(1).join() === [U6 + o[0], U6 + o[0] + o[1], U6 + o[0] + o[1] + o[2]].join(), tag + '累計（data-cum）は 超優先まで・優先まで・通常まで', n.chips.map((c) => c.cum));
			// (a) ①が切れ者・勉強家の編成のセット: 合計 = ①の X ＋ 継承固有 ＋ 超優先 ＋ 優先 ＋ 通常
			for (const st of ['kire', 'benkyo']) {
				await selectSet(sp.page, 'tpl_7da_' + st);
				const X = await rosterX(sp.page);
				n = await readNeed(sp.page);
				o = own(st);
				const U = UNIQ(6, 3, st);
				assert(X > 0 && n.uniq.n === U && n.chips.map((c) => c.n).join() === o.join() && n.total.n === X + U + o[0] + o[1] + o[2],
					tag + '(a) ①が ' + st + ' のセット: 合計 ' + fmt(n.total.n) + ' = ① ' + fmt(X) + ' ＋ 継承固有 ' + fmt(U) + ' ＋ ' + o.map(fmt).join(' ＋ '), { X, uniq: n.uniq.n, chips: n.chips.map((c) => c.n), total: n.total.n });
			}
			// (c) 継承固有の種類・ヒントLv・割引（勉強家／切れ者／なし）を変えたときの数字
			for (const st of ['kire', 'benkyo', 'none']) {
				await selectSet(sp.page, 'tpl_7da_' + st);
				const X = await rosterX(sp.page);
				for (const [cnt, lv] of [[2, 1], [4, 2], [5, 5]]) {
					await sp.page.selectOption(T + '[data-usd-el="uniq-count"]', String(cnt));
					await sp.page.selectOption(T + '[data-usd-el="uniq-level"]', String(lv));
					await sp.page.waitForTimeout(100);
					n = await readNeed(sp.page);
					o = own(st);
					assert(n.uniq.n === UNIQ(cnt, lv, st) && n.total.n === X + UNIQ(cnt, lv, st) + o[0] + o[1] + o[2],
						tag + '(c) ' + (STS.find((s) => s.id === st).label) + '・継承固有 ' + cnt + '種 Lv' + lv + ': 継承固有 ' + fmt(UNIQ(cnt, lv, st)) + '、合計 ' + fmt(X + UNIQ(cnt, lv, st) + o[0] + o[1] + o[2]), { uniq: n.uniq.n, total: n.total.n, X });
				}
				await sp.page.selectOption(T + '[data-usd-el="uniq-count"]', '6');
				await sp.page.selectOption(T + '[data-usd-el="uniq-level"]', '3');
			}
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}

		// 前段のあるとき: 合計の①の項は前段込みの X（①の「X Pt/N種」と同じ）。
		// 段8（C-120）で②の合計の（?）の小窓（「本育成編成 X（うち前段 K）」の式）を無くしたので、小窓の式と「なし」のときの検査は外した
		{
			const sp = await open({ w: 375, h: 812, tab: 1, roster: { umaId: '', cardIds: [cA.id, cB.id, null, null, null, null], pt: { umaHintLevel: 3, status: 'kire' } }, scope: { skillIds: [W[4]], name: '', tiers: {}, updatedAt: '' } });   // 既定の前段: W3（金）の前段 W8
			const X = await rosterX(sp.page);
			const s = await readSum(sp.page);
			const prev = pay(BASE[W[8]], 0, 'kire');
			const n = await readNeed(sp.page);
			assert(s.prevCount === 1 && (s.prev || '').endsWith(' ' + prev) && n.total.n === X + UNIQ(6, 3, 'kire') + pay(160, 5, 'kire'),
				'段7d追加(A): 前段があるとき、帯の合計の①の項は前段込みの X（' + fmt(X) + '。うち前段 ' + fmt(prev) + '）', { prev: s.prev, total: n.total.n, X });
			await sp.ctx.close();
		}

		// (d) 375px で②の一覧より上が伸びていない・横にはみ出さない。
		// 段8（C-120）で「スキルセット」の行（.uma-section-row）・見出し＋チップの行（.usd-ptneed-main）・②の合計（pt-total-row／pt-total-head）を無くしたので、
		// それらの高さの検査は外した（②の新しい並びの高さは blocks-8.mjs の段8 の 375px の検査が見る）
		{
			for (const [w, h] of [[375, 667], [375, 812], [360, 780]]) {
				const sp = await open({ w, h, tab: 1, userData: UD, routes: { stepDoc: stepNone, ptDoc: ptX }, scope });
				const m = await sp.page.evaluate(() => ({ list: Math.round(document.querySelector('#deck-template-panel [data-usd-el="selected-list"]').getBoundingClientRect().top + scrollY), sw: document.documentElement.scrollWidth, iw: innerWidth }));
				assert(m.sw <= m.iw && m.list <= 474,
					'段7d追加(A)(d) ' + w + '×' + h + ': ②の追加済みスキルより上 ' + m.list + 'px（474px 以下）。横にはみ出さない', m);
				console.log('     [実測] ' + w + '×' + h + ' 追加(A): 追加済みスキルの上端 ' + m.list + 'px');
				await sp.ctx.close();
			}
		}
	});
}
