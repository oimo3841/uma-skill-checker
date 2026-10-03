// 段7c（2026-10-03・C-115）の検査。run-smoke.mjs の末尾から register7c() で呼ばれる（塊の見出しはすべて「段7c」を含むので、
// `npm run test:visual -- --only=段7c` で全部、`--only=段7c(M)` のように括弧つきの見出しで1つずつ回せる）。
//
//   L  説明・印・凡例の削除とタイトル
//   M  表のスキルごとのオン/オフ（取得しない）
//   N  シナリオの固定イベントの列（トレセン軒）
//   O  因子周回の表示（「うち本育成」の削除・本育成編成のボタンに Pt・勉強家／切れ者の割引）
//   P  画面の最終調整（スマホの1画面化・デスクトップの表の拡大）と、押しても画面の位置が動かないこと
//
// 実データ（support-cards・マスター・拡張スキル）から検査用の材料を選ぶ。スキル名・キャラクター名をここに決め打ちするのは、
// 「このファイルの中身がデータと食い違っていないか」を見る検査（N）だけ（恒久ルール1は製品のコードの話。検査がデータを名前で引くのは構わない）。
export async function register7c(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const cardsAll = readJson('data/support-cards.json').entries;
	const master = readJson('uma-skill-deck-skills.json').skills;
	const ext = readJson('data/extended-skills.json').entries;
	const umas = readJson('data/training-umamusume.json').entries;
	const rules = readJson('data/skill-pt-rules.json');
	const ptReal = readJson('data/skill-pt.json');
	const scenReal = null;   // N の塊が使う。データのファイルは次の commit で入る
	const byId = new Map(master.map((s) => [s.id, s]));
	const nameOf = (id) => (master.find((s) => s.id === id) || ext.find((s) => s.id === id) || {}).name;
	const umaLv7 = umas.find((u) => (u.awakeningSkills || []).some((r) => r.level >= 7));
	const DISC = rules.hintDiscountPercent;
	const STATUS = Object.fromEntries(rules.statuses.map((s) => [s.id, s.percent]));
	// 整数だけで計算（浮動小数点の誤差を持ち込まない。切り捨て）
	const pay = (base0, L, stId) => Math.floor(base0 * (100 - (L > 0 ? DISC[Math.min(L, DISC.length) - 1] : 0) - (STATUS[stId] || 0)) / 100);
	const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const esc = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(80); };
	const SP = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, y: window.scrollY, h: document.documentElement.scrollHeight, ih: window.innerHeight }));

	/* ============================================================
	 * 検査用の材料（M・O・P）: 練習のヒントが入力済みのカード2枚＋テスト用のイベント・Pt・前段
	 * ============================================================ */
	const hintOk = cardsAll.filter((c) => c.dataStatus && c.dataStatus.hint === 'done' && (c.hintSkills || []).length > 0 && c.hintSkills.every((h) => byId.has(h.skillId) && !byId.get(h.skillId).raceDistance));
	const [cA, cB] = [hintOk[0], hintOk[1]];
	const hintIds = [...new Set([cA, cB].flatMap((c) => c.hintSkills.map((s) => s.skillId)))];
	const hinted = new Set(hintIds);
	const plain = (s) => !hinted.has(s.id) && s.tags && (s.tags.style || []).length === 0 && (s.tags.surface || []).length === 0 && (s.tags.passive || []).length === 0;
	const wAny = master.filter((s) => plain(s) && (s.tags.distance || []).length === 0);
	// W0・W1 は選択式のイベントの2つの選択肢（△）。W2〜W7 は●。W8 は因子周回だけにあるスキル
	const W = wAny.slice(0, 9).map((s) => s.id);
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
	const RARITY = { [W[3]]: 'gold' };
	const ptDoc = { dataVersion: '2026-10-03a', category: 'skillPt', note: 'テスト用の仕込み', entries: Object.keys(BASE).map((skillId) => ({ skillId, pt: BASE[skillId], rarity: RARITY[skillId] || 'white' })) };
	// 前段: W3（金）の前段は W8（本育成の表に無い）／W6 の前段は W7（本育成の表にある）
	const stepDoc = { dataVersion: '2026-10-03a', category: 'skillStepUp', note: 'テスト用の仕込み', entries: [{ skillId: W[3], prevSkillIds: [W[8]] }, { skillId: W[6], prevSkillIds: [W[7]] }] };
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
	const mkRoster = (i, cards, extra) => Object.assign({ rosterId: 'r7c' + i, name: '編成' + (i + 1), umaId: '', star: 0, awakeningLevel: 0, cardIds: cards || [cA.id, cB.id, null, null, null, null], createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z' }, extra || {});
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
		await sp.page.evaluate((t) => selectStepTab(t), o.tab || 0);
		await sp.page.waitForSelector('#deck-roster-panel [data-usd-el="pt-sum"],#deck-roster-panel [data-usd-el="pt-error"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(150);
		return sp;
	};
	const P = '#deck-roster-panel ';
	const readPanel = (page) => page.evaluate(() => {
		const h = document.getElementById('deck-roster-panel');
		const t = (i) => { const e = h.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent.trim() : null; };
		const num = (s) => (s === null ? null : Number(s.replace(/[^0-9]/g, '')));
		const rows = Array.from(h.querySelectorAll('.usd-roster-grow[data-skill-id]')).map((r) => {
			const box = r.querySelector('input[data-usd-act="take-skill"]');
			const nm = r.querySelector('.usd-roster-skillname');
			return { id: r.getAttribute('data-skill-id'), off: r.classList.contains('usd-roster-grow--off'), box: !!box, checked: box ? box.checked : null, aria: box ? box.getAttribute('aria-label') : null,
				boxW: box ? box.parentElement.getBoundingClientRect().width : 0, boxH: box ? box.parentElement.getBoundingClientRect().height : 0,
				pt: (r.querySelector('.usd-roster-pt') || {}).textContent || null, strike: nm ? getComputedStyle(nm).textDecorationLine : null, nameColor: nm ? getComputedStyle(nm).color : null,
				marks: Array.from(r.querySelectorAll('[role="cell"]')).map((c) => c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '△' : ''),
				got: Array.from(r.querySelectorAll('.usd-roster-got')).map((g) => getComputedStyle(g).borderTopColor), name: nm ? nm.textContent : null };
		});
		return { total: num(t('pt-total')), count: num(t('pt-count')), rows, ids: rows.map((r) => r.id), badge: (document.getElementById('deck-roster-excluded') || {}).textContent,
			prevCount: num(t('pt-prev-count')), prevTotal: num(t('pt-prev-total')), prevList: t('pt-prev-list'), withPrev: num(t('pt-with-prev-total')),
			events: Array.from(h.querySelectorAll('button[data-usd-act="events"]')).map((b) => ({ key: b.getAttribute('data-member-key'), label: b.getAttribute('aria-label'), dot: b.textContent.trim() === '!', unselected: b.getAttribute('data-unselected'), hasSvg: !!b.querySelector('svg') })),
			heads: Array.from(h.querySelectorAll('.usd-roster-gh')).length, hscroll: document.documentElement.scrollWidth - window.innerWidth, filtering: t('pt-filtering'), alpha: !!document.getElementById('deck-roster-alpha'),
			legend: !!h.querySelector('.usd-roster-legend') };
	});
	const popover = (page) => page.evaluate(() => {
		const pop = document.querySelector('[data-usd-el="info-pop"]');
		if (!pop || pop.hidden) return { open: false };
		const t = (i) => { const e = pop.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent.trim() : null; };
		return { open: true, title: pop.querySelector('.uma-popover-title').textContent.trim(), now: t('info-pt-now'), filter: t('info-filter'), offCount: t('info-off-count'), offReset: !!pop.querySelector('[data-usd-el="info-off-reset"]'),
			events: Array.from(pop.querySelectorAll('[data-usd-el="event"]')).map((e) => ({ key: e.getAttribute('data-event-key'), title: e.querySelector('.usd-roster-eventtitle').textContent.trim(),
				choices: Array.from(e.querySelectorAll('[data-usd-el="event-choice"]')).map((c) => ({ i: Number(c.getAttribute('data-choice')), on: c.getAttribute('aria-checked') === 'true', text: c.textContent.trim(), label: (c.querySelector('.usd-roster-choicelabel') || {}).textContent, state: (c.querySelector('[data-usd-el="event-choice-state"]') || {}).textContent || null })) })),
			fixed: Array.from(pop.querySelectorAll('[data-usd-el="event-fixed"]')).map((e) => ({ title: e.querySelector('.usd-roster-eventtitle').textContent.trim(), skills: Array.from(e.querySelectorAll('[data-usd-el="event-fixed-skill"]')).map((s) => s.textContent.trim()) })),
			skills: Array.from(pop.querySelectorAll('[data-usd-el="ev-skill"]')).map((s) => ({ id: s.getAttribute('data-skill-id'), maybe: s.hasAttribute('data-usd-maybe') })) };
	});
	const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'));
	const stored = (page) => page.evaluate(() => {
		const u = JSON.parse(localStorage.getItem('umaSkillDeck:userData') || '{}');
		return { rosters: u.rosters || [], templates: u.templates || [], draftRoster: JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'), draftScope: JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') };
	});

	/* ============================================================
	 * L. 説明・印・凡例の削除とタイトル
	 * ============================================================ */
	await block('段7c(L) 説明・印・凡例の削除とタイトル', async () => {
		for (const [w, h] of [[375, 760], [390, 844], [1280, 900]]) {
			const tag = '段7c(L) ' + w + 'px: ';
			const sp = await open({ w, h, roster: { umaId: umaLv7.id, cardIds: [cA.id, cB.id, null, null, null, null] } });
			await sp.page.selectOption(P + 'select[data-axis="distance"]', 'short');
			await sp.page.waitForTimeout(200);
			const v = await readPanel(sp.page);
			const hd = await sp.page.evaluate(() => {
				const b = document.querySelector('header .header-edition');
				const hd = document.querySelector('header');
				return { title: document.title, h1: document.querySelector('header h1').textContent.replace(/\s+/g, ' ').trim(), badge: b ? b.textContent.trim() : null, badgeSize: b ? parseFloat(getComputedStyle(b).fontSize) : null, hdH: hd.getBoundingClientRect().height };
			});
			assert(hd.badge === '2nd edition β版' && hd.h1.endsWith('2nd edition β版') && !hd.h1.includes('α版') && hd.title.includes('2nd edition β版'),
				tag + 'ヘッダーのバッジは「2nd edition β版」（「α版」ではない）', hd);
			if (w <= 640) assert(hd.badgeSize <= 11.5, tag + 'スマホではバッジの文字を 11px にする', { size: hd.badgeSize });
			assert(!v.alpha && !(await sp.page.textContent('#step-panel-0')).includes('結果が正しくないことがあります'), tag + '①のタブの赤い注意書き「αテスト中の機能です…」は出ない');
			assert(v.filtering === null && !(await sp.page.textContent(P + '[data-usd-el="pt-sum"]')).includes('絞り込み中'), tag + '絞り込み中でも、合計の下に「絞り込み中」の印は出ない', { filtering: v.filtering });
			assert(!v.legend && (await sp.page.$$(P + '.usd-roster-legend')).length === 0, tag + '表の最下段の育成ウマ娘・カード名の凡例は、どの幅でも出ない', { legend: v.legend });
			await sp.page.click(P + '[data-usd-el="pt-help-btn"]');
			const pv = await popover(sp.page);
			assert(pv.open && /^絞り込み中：距離 /.test(pv.filter || ''), tag + '絞り込みの条件は、（?）の中に残る', pv);
			await esc(sp.page);
			assert(v.hscroll <= 0 && jsErrors(sp.errors).length === 0, tag + '横にはみ出さない・コンソールのエラー0', { hscroll: v.hscroll, errors: jsErrors(sp.errors).slice(0, 3) });
			await sp.ctx.close();
		}
	});
}
