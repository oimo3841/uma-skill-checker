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
	const scenReal = readJson('data/scenario-event-skills.json');
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

	/* ============================================================
	 * M. 表のスキルごとのオン/オフ（取得しない）
	 * ============================================================ */
	await block('段7c(M) 表のスキルごとのオン/オフ', async () => {
		const sureIds = [W[2], W[3], W[6], W[7]];
		const hintTotal = hintIds.length * pay(50, 5);
		const L = { [W[2]]: 3, [W[3]]: 1, [W[6]]: 1, [W[7]]: 1 };
		const eventTotal = (ids) => ids.reduce((s, id) => s + pay(BASE[id], L[id]), 0);
		const prevW8 = pay(BASE[W[8]], 0);   // W3 の前段（本育成の表に無い）。根 W8 に由来が無いので L=0
		for (const w of [375, 1280]) {
			const tag = '段7c(M) ' + w + 'px: ';
			let sp = await open({ w, h: 900 });
			let v = await readPanel(sp.page);
			const row = (id) => v.rows.find((r) => r.id === id);
			// ●の行にだけチェック（既定はオン・aria-label）。△の行には付けない
			const sureRows = v.rows.filter((r) => r.marks.includes('●'));
			const maybeRows = v.rows.filter((r) => !r.marks.includes('●') && r.marks.includes('△'));
			assert(sureRows.length === sureIds.length + hintIds.length && sureRows.every((r) => r.box && r.checked && r.aria === r.name + 'を取得する') && maybeRows.length === 2 && maybeRows.every((r) => !r.box),
				tag + '●の行の名前セルにチェック（既定はオン。aria-label「{スキル名}を取得する」）。△の行には付かない', { sure: sureRows.length, maybe: maybeRows.map((r) => r.box) });
			assert(sureRows.every((r) => r.boxW >= 24 && r.boxH >= 24), tag + 'チェックのタップ領域は 24px 以上', { min: Math.min(...sureRows.map((r) => Math.min(r.boxW, r.boxH))) });
			const total0 = eventTotal(sureIds) + hintTotal;
			assert(v.total === total0 && v.count === sureIds.length + hintIds.length && v.prevCount === 1 && v.prevTotal === prevW8 && v.badge === (sureIds.length + hintIds.length) + '種',
				tag + 'すべてオンのとき: 合計・種数・①のタブの数・前段（W3 の前段 W8）が従来どおり', { total: v.total, want: total0, prev: [v.prevCount, v.prevTotal] });
			// W2 をオフ: 合計・種数・タブの数が減る。行は取り消し線・薄い・Pt は「—」・○は残る（薄く）
			await sp.page.click(P + '.usd-roster-grow[data-skill-id="' + W[2] + '"] input[data-usd-act="take-skill"]');
			v = await readPanel(sp.page);
			const totalOff2 = total0 - pay(BASE[W[2]], 3);
			assert(v.total === totalOff2 && v.count === sureIds.length + hintIds.length - 1 && v.badge === (sureIds.length + hintIds.length - 1) + '種' && row(W[2]).off && !row(W[2]).checked,
				tag + 'W2 をオフにすると、合計・種数・①のタブの数から外れる', { total: v.total, want: totalOff2, count: v.count });
			assert(row(W[2]).strike.includes('line-through') && row(W[2]).pt === '—' && row(W[2]).marks.includes('●') && row(W[2]).got[0] !== row(W[7]).got[0] && row(W[2]).nameColor !== row(W[7]).nameColor,
				tag + 'オフの行: 名前に取り消し線・色が薄い・Pt は「—」・○は残る（色が薄い）', { strike: row(W[2]).strike, pt: row(W[2]).pt, got: row(W[2]).got, color: [row(W[2]).nameColor, row(W[7]).nameColor] });
			const d1 = await draft(sp.page);
			assert(JSON.stringify(d1.offSkillIds) === JSON.stringify([W[2]]), tag + '保存は編成の offSkillIds（skillId の配列）', d1.offSkillIds);
			// 前段: W3 をオフにすると W3 のための前段（W8）は数えない。W7 をオフにすると、W6 のための前段として W7 を数える（根 W7 のイベントの L=1 は変わらない）
			await sp.page.click(P + '.usd-roster-grow[data-skill-id="' + W[3] + '"] input[data-usd-act="take-skill"]');
			v = await readPanel(sp.page);
			assert(v.prevCount === null && v.total === totalOff2 - pay(BASE[W[3]], 1), tag + 'W3 をオフにすると、W3 を取るための前段（W8）は「前段として必要」から消える', { prev: v.prevCount, total: v.total });
			await sp.page.click(P + '.usd-roster-grow[data-skill-id="' + W[7] + '"] input[data-usd-act="take-skill"]');
			v = await readPanel(sp.page);
			assert(v.prevCount === 1 && v.prevTotal === pay(BASE[W[7]], 1) && (v.prevList || '').includes(nameOf(W[7])) && v.total === totalOff2 - pay(BASE[W[3]], 1) - pay(BASE[W[7]], 1),
				tag + 'W7 をオフにすると、W6 のための前段として W7 を数える（イベントは起きるので、W7 の L=1 は変わらない）', { prev: [v.prevCount, v.prevTotal, v.prevList], total: v.total });
			// 保存と開き直し
			const savedOff = (await draft(sp.page)).offSkillIds;
			await sp.page.reload({ waitUntil: 'networkidle' });
			for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
			await sp.page.evaluate(() => selectStepTab(0));
			await sp.page.waitForSelector(P + '[data-usd-el="pt-sum"]');
			v = await readPanel(sp.page);
			assert(JSON.stringify(savedOff) === JSON.stringify([W[2], W[3], W[7]]) && v.rows.filter((r) => r.off).map((r) => r.id).sort().join() === [W[2], W[3], W[7]].sort().join(),
				tag + '開き直しても、オフにしたスキルはオフのまま', { savedOff, off: v.rows.filter((r) => r.off).map((r) => r.id) });
			// 小窓（名前タップ）: 取得しない設定です／（?）の中: 取得しないスキル N種・すべて取得に戻す
			await sp.page.click(P + '.usd-roster-grow[data-skill-id="' + W[2] + '"] [data-usd-info]');
			let pv = await popover(sp.page);
			assert(pv.open && pv.now === '取得しない設定です', tag + '名前を押す小窓には「取得しない設定です」が出る', pv);
			await esc(sp.page);
			await sp.page.click(P + '[data-usd-el="pt-help-btn"]');
			pv = await popover(sp.page);
			assert(pv.open && pv.offCount === '取得しないスキル 3種' && pv.offReset, tag + '（?）の中に「取得しないスキル N種」と「すべて取得に戻す」が出る', pv);
			await sp.page.click('[data-usd-el="info-pop"] [data-usd-el="info-off-reset"]');
			await sp.page.waitForTimeout(200);
			v = await readPanel(sp.page);
			const d2 = await draft(sp.page);
			assert(v.total === total0 && v.rows.every((r) => !r.off) && !('offSkillIds' in d2), tag + '「すべて取得に戻す」で全部オンに戻り、保存からも消える（触らなければ足さない）', { total: v.total, saved: d2.offSkillIds });
			await sp.page.click(P + '[data-usd-el="pt-help-btn"]');
			pv = await popover(sp.page);
			assert(pv.open && pv.offCount === null && !pv.offReset, tag + '0種のときは（?）の中に「取得しないスキル」を出さない', pv);
			await esc(sp.page);
			// 指す先が無い id は無視し、保存値は書き換えない
			await sp.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')); d.offSkillIds = ['zz-none']; localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(d)); });
			await sp.page.reload({ waitUntil: 'networkidle' });
			for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
			await sp.page.evaluate(() => selectStepTab(0));
			await sp.page.waitForSelector(P + '[data-usd-el="pt-sum"]');
			v = await readPanel(sp.page);
			await sp.page.click(P + '.usd-roster-grow[data-skill-id="' + W[2] + '"] input[data-usd-act="take-skill"]');
			const d3 = await draft(sp.page);
			assert(v.total === total0 && d3.offSkillIds.join() === ['zz-none', W[2]].join(), tag + '指す先が無い id は無視して計算し、ほかを切り替えても保存値は書き換えない', { total: v.total, saved: d3.offSkillIds });
			assert(v.hscroll <= 0 && jsErrors(sp.errors).length === 0, tag + '横にはみ出さない・コンソールのエラー0', { errors: jsErrors(sp.errors).slice(0, 3) });
			await sp.ctx.close();
		}

		/* ② 因子周回: オフのスキルは追加できない（本育成編成に選んだ編成の offSkillIds）。編成を選んでいないセットでは効かない */
		{
			const rosterOff = mkRoster(0, [cA.id, cB.id, null, null, null, null], { offSkillIds: [W[2], W[7]] });
			const UD = baseUser({ rosters: [rosterOff] });
			const allSureOn = [W[3], W[6]].concat(hintIds);
			const mk = async (skillIds) => {
				const sp = await open({ userData: UD, tab: 1, scope: { skillIds: skillIds, name: '', tiers: {}, updatedAt: '' } });
				const link = async (n) => { await sp.page.click('[data-usd-el="roster-link-btn"]'); await sp.page.waitForTimeout(150); await sp.page.click('[data-usd-el="link-list"] label:nth-child(' + n + ')'); await sp.page.waitForTimeout(300); };
				const readLink = () => sp.page.evaluate(() => {
					const el = document.querySelector('[data-usd-el="roster-link"]');
					const t = (i) => (el.querySelector('[data-usd-el="' + i + '"]') || {}).textContent || null;
					return { overlap: t('roster-link-overlap'), off: t('roster-link-off'), notice: t('roster-link-notice'), scope: JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}'),
						hidden: window.UmaSkillDeckCore.getPickerHiddenIds(), offIds: window.UmaSkillDeckCore.getPickerOffIds() };
				});
				return { sp, link, readLink };
			};
			// (1) セットに、オフにしたスキル（W2・W7）とオンの●（W3）が入っている
			{
				const tag = '段7c(M) ②(1): ';
				const { sp, link, readLink } = await mk([W[8], W[2], W[3], W[7]]);
				let lk = await readLink();
				assert(lk.hidden.length === 0 && lk.offIds.length === 0 && lk.off === null, tag + '本育成編成を選んでいないセットでは、オフのスキルも選べなくならない・知らせも出ない', lk);
				await link(2);
				lk = await readLink();
				assert(lk.scope.baseRosterId === 'r7c0' && lk.scope.skillIds.slice().sort().join() === [W[8], W[2], W[7]].sort().join() && lk.notice === '本育成編成で得るため、' + nameOf(W[3]) + 'を因子周回から外しました',
					tag + '編成を選ぶと、オンの●（W3）だけがセットから外れ、オフにしたスキル（W2・W7）は自動では外さない', { scope: lk.scope.skillIds, notice: lk.notice });
				assert(lk.off === 'このセットには、本育成編成で不要にしたスキルが2種含まれています' && lk.overlap === null,
					tag + '重なりの知らせの隣に「このセットには、本育成編成で不要にしたスキルがN種含まれています」が小さく出る（オンの●は重ならないので重なりの知らせは出ない）', lk);
				assert(lk.offIds.slice().sort().join() === [W[2], W[7]].sort().join() && lk.hidden.slice().sort().join() === allSureOn.concat([W[2], W[7]]).sort().join(),
					tag + '追加の一覧で選べなくする対象は「本育成で得るもの（オンの●）」＋「不要にしているもの（オフ）」。オフはその内訳としても持つ', { hidden: lk.hidden, off: lk.offIds });
				// 選んだ編成の「取得しない」を後から戻すと、一覧の対象も追従する（自動で外すことはしない）
				await sp.ctx.close();
			}
			// (2) セットにオフのスキルが入っていない: 追加の一覧・貼り付け
			{
				const tag = '段7c(M) ②(2): ';
				const { sp, link, readLink } = await mk([W[8]]);
				await link(2);
				await sp.page.click('[data-usd-act="editor-pick"]');
				await sp.page.waitForTimeout(400);
				const pick = await sp.page.evaluate(() => {
					const grey = [...document.querySelectorAll('[data-usd-el="results"] [data-usd-excluded="1"]')];
					const ex = document.querySelector('[data-usd-el="result-excluded"]');
					const reasons = {}; grey.forEach((r) => { reasons[r.querySelector('input').value] = r.querySelector('[data-usd-el="excluded-reason"]').textContent; });
					return { ids: grey.map((r) => r.querySelector('input').value), reasons, disabled: grey.every((r) => r.querySelector('input').disabled), label: ex && !ex.hidden ? ex.textContent : null };
				});
				assert(pick.ids.includes(W[2]) && pick.ids.includes(W[7]) && pick.disabled && pick.reasons[W[2]] === '本育成編成で不要にしているため選べません' && pick.reasons[W[7]] === '本育成編成で不要にしているため選べません'
					&& allSureOn.filter((id) => pick.ids.includes(id)).every((id) => pick.reasons[id] === '本育成で得るため選べません'),
					tag + '「条件で検索」: オフのスキルはグレーアウトで残り、チェックできず、理由「本育成編成で不要にしているため選べません」（オンの●は「本育成で得るため選べません」のまま）', pick);
				assert(pick.label === '本育成編成のため選べない ' + pick.ids.length + '件', tag + '件数は「本育成編成のため選べない M件」（本育成で得るためと、不要にしているための両方を合わせた件数）', pick);
				await sp.page.evaluate(() => window.UmaSkillDeckCore.closeSkillPicker());
				// 貼り付け: オフのスキルは追加せず、「本育成編成のため追加しなかったもの N種」（本育成で得るものも含めた件数）
				await sp.page.click('[data-usd-act="editor-pick-text"]');
				await sp.page.waitForTimeout(300);
				await sp.page.fill('[data-usd-el="paste-input"]', [nameOf(W[2]), nameOf(W[6]), nameOf(W[4])].join('\n'));
				await sp.page.click('[data-usd-act="paste-run"]');
				await sp.page.waitForTimeout(400);
				const paste = await sp.page.evaluate(() => ({ blocked: (document.querySelector('[data-usd-el="paste-blocked"]') || {}).textContent || null, checked: document.querySelector('[data-usd-el="picker-checked-count"]').textContent }));
				assert(paste.blocked === '本育成編成のため追加しなかったもの 2種' && paste.checked === '1種選択', tag + '貼り付け: オフのスキル（W2）と本育成で得るもの（W6）は追加せず、「本育成編成のため追加しなかったもの 2種」が出る', paste);
				await sp.page.click('[data-usd-el="picker-commit"]');
				await sp.page.waitForTimeout(300);
				const lk = await readLink();
				assert(lk.scope.skillIds.includes(W[4]) && !lk.scope.skillIds.includes(W[2]) && !lk.scope.skillIds.includes(W[6]), tag + '追加を押しても、オフのスキルは足されない', lk.scope.skillIds);
				await sp.page.evaluate(() => window.UmaSkillDeckCore.closeSkillPicker());
				// 追加しなかったものが0種のときは出さない
				await sp.page.click('[data-usd-act="editor-pick-text"]');
				await sp.page.waitForTimeout(300);
				await sp.page.fill('[data-usd-el="paste-input"]', nameOf(W[0]));
				await sp.page.click('[data-usd-act="paste-run"]');
				await sp.page.waitForTimeout(300);
				assert((await sp.page.$('[data-usd-el="paste-blocked"]')) === null, tag + '追加しなかったものが0種のときは、その表示を出さない');
				await sp.page.evaluate(() => window.UmaSkillDeckCore.closeSkillPicker());
				// 「名前を入れて探す」でも、オフのスキルは理由つきで選べない（一覧からは消さない）
				await link(1);
				const lk2 = await readLink();
				assert(lk2.hidden.length === 0 && lk2.offIds.length === 0, tag + '「なし」にすると、オフのスキルも選べるようになる', lk2);
				await sp.ctx.close();
			}
		}
	});

	/* ============================================================
	 * N. シナリオの固定イベントの列（トレセン軒）
	 *    実データ（data/scenario-event-skills.json・skill-pt.json・skill-step-up.json）で見る。カードのイベントは空にして、
	 *    ヒントレベルの出どころがシナリオだけになるようにする。
	 * ============================================================ */
	await block('段7c(N) シナリオの固定イベントの列（トレセン軒）', async () => {
		const stepReal = readJson('data/skill-step-up.json');
		const emptyEv = { dataVersion: '2026-10-03a', category: 'supportCardEventSkill', entries: [] };
		const R = { evDoc: emptyEv, ptDoc: ptReal, stepDoc: stepReal, scenDoc: scenReal };
		const pt = new Map(ptReal.entries.map((e) => [e.skillId, e]));
		const scen = scenReal.entries[0];
		const ev1 = scen.events[0], ev2 = scen.events[1], ev3 = scen.events[2];
		const cardOf = (chara) => cardsAll.filter((c) => c.charaName === chara).pop();
		const cDotou = cardOf('メイショウドトウ'), cTazuna = cardOf('駿川たづな'), cLight = cardOf('ライトハロー');
		// 検査の前提: この3枚のカードの練習のヒントに、シナリオのスキルは入っていない（入っていると L が変わる）
		const scenIds = new Set([ev1, ev2, ev3].flatMap((e) => (e.choices ? e.choices.flatMap((c) => [].concat(c.linked || [], c.unlinked || [], c.skills || [])) : e.skills)).map((r) => r.skillId));
		const hintClash = [cDotou, cTazuna, cLight].flatMap((c) => (c.hintSkills || []).map((h) => h.skillId)).filter((id) => scenIds.has(id));
		assert(hintClash.length === 0 && cDotou && cTazuna && cLight, '段7c(N) 前提: 検査に使う3枚のカードの練習のヒントに、シナリオのスキルが入っていない', hintClash);
		const names = new Set();
		cardsAll.forEach((c) => { if (c.charaName) names.add(c.charaName); (c.groupMembers || []).forEach((n) => names.add(n)); });
		umas.forEach((u) => { if (u.charaName) names.add(u.charaName); });
		const allCharas = ev1.choices.flatMap((c) => c.charaNames);
		assert(allCharas.every((n) => names.has(n)), '段7c(N) データの charaName（' + allCharas.length + '人）は、すべて育成ウマ娘かサポートカードの charaName に完全一致で在る', allCharas.filter((n) => !names.has(n)));
		const open2 = (o) => open(Object.assign({ routes: R }, o));
		const scenMark = (r) => r.marks[r.marks.length - 1];
		const evBtn = P + 'button[data-usd-act="events"][data-member-key="scenario"]';
		const choiceTexts = async (page) => (await popover(page)).events[0].choices.map((c) => ({ label: c.label, state: c.state, text: c.text }));

		for (const w of [1280, 390]) {
			const tag = '段7c(N) ' + w + 'px: ';
			const sp = await open2({ w, h: w === 1280 ? 900 : 844, roster: { umaId: umaLv7.id, cardIds: [cDotou.id, null, null, null, null, null] } });
			let v = await readPanel(sp.page);
			const sc = v.events.find((b) => b.key === 'scenario');
			assert(v.heads === 9 && sc && sc.dot && sc.unselected === '2' && sc.label === 'シナリオ『トレセン軒』のイベントを選ぶ（未選択2件）',
				tag + '表の列見出しは スキル名＋育成ウマ娘＋カード6枚＋シナリオ（7列目）。シナリオの見出しは押せる「!」（選択式のイベントが2つとも未選択）で、aria-label は「シナリオ『トレセン軒』のイベントを選ぶ」', { heads: v.heads, sc });
			const fixedIds = ev3.skills.map((r) => r.skillId);
			const fixedRows = fixedIds.map((id) => v.rows.find((r) => r.id === id));
			assert(fixedRows.every((r) => r && scenMark(r) === '●'), tag + 'イベント3（確定）のスキルはすべて●でシナリオの列に出る', fixedRows.map((r) => r && scenMark(r)));
			const ev1Ids = ev1.choices.flatMap((c) => [].concat(c.linked, c.unlinked)).map((r) => r.skillId);
			const dotouChoice = ev1.choices.find((c) => c.charaNames.includes('メイショウドトウ'));
			const shownEv1 = v.rows.filter((r) => ev1Ids.includes(r.id) && scenMark(r) === '△').map((r) => r.id);
			const wantEv1 = ev1.choices.map((c) => (c.charaNames.includes('メイショウドトウ') ? c.linked : c.unlinked)[0].skillId);
			assert(shownEv1.slice().sort().join() === wantEv1.slice().sort().join() && !v.ids.includes(ev1.choices[0].linked[0].skillId),
				tag + '未選択のイベント1: 編成にいるキャラクター（メイショウドトウ）の選択肢は金スキル、いない5人は白スキルが△で出る（金スキルは編成にいる人のぶんだけ）', { shownEv1 });
			// 小窓
			await sp.page.click(evBtn);
			let pv = await popover(sp.page);
			assert(pv.open && pv.title.includes('シナリオ『トレセン軒』') && pv.events.length === 2 && pv.fixed.length === 1,
				tag + '小窓の見出しは「シナリオ『トレセン軒』」。左にイベント1・2（選択式）と、イベント3（確定。選択肢なし）が並ぶ', { title: pv.title, ev: pv.events.length, fixed: pv.fixed.length });
			const ct = await choiceTexts(sp.page);
			assert(ct.length === 6 && ct.map((c) => c.state).join() === ev1.choices.map((c) => (c.charaNames.includes('メイショウドトウ') ? '編成時' : '非編成時')).join()
				&& ct.every((c, i) => c.label === ev1.choices[i].label && c.text.includes(nameOf((c.state === '編成時' ? ev1.choices[i].linked : ev1.choices[i].unlinked)[0].skillId) + ' Lv1')),
				tag + 'イベント1の選択肢の横に、編成時か非編成時かと、得るスキルとヒントレベル（Lv1）が出る', ct);
			assert(pv.fixed[0].title.startsWith('確定で得られるスキル') && pv.fixed[0].skills.length === ev3.skills.length && pv.fixed[0].skills[0].includes('Lv'),
				tag + 'イベント3（確定）は選択肢なしで、スキルとヒントレベルを並べる', pv.fixed);
			assert(pv.skills.length >= fixedIds.length + 6, tag + '右の「取得できるスキル」に、確定のスキルと選択しだいのスキルが並ぶ', { n: pv.skills.length });
			// イベント1でメイショウドトウを選ぶ → ネバーギブアップ（金）が●、ほかは消える。ヒントレベルは金スキルと白スキルで独立
			const pickIdx = ev1.choices.indexOf(dotouChoice);
			const total0 = v.total, count0 = v.count;
			await sp.page.click('[data-usd-el="event-choice"][data-event-key="scenario:トレセン軒#0"][data-choice="' + pickIdx + '"]');
			await sp.page.waitForTimeout(250);
			v = await readPanel(sp.page);
			const gold = dotouChoice.linked[0].skillId, white = dotouChoice.unlinked[0].skillId;
			const goldRow = v.rows.find((r) => r.id === gold);
			assert(goldRow && scenMark(goldRow) === '●' && ev1Ids.filter((id) => id !== gold).every((id) => !v.ids.includes(id)),
				tag + 'メイショウドトウを選ぶと、金スキルが●になり、選ばなかった5人のぶんは表から消える', { gold: goldRow && scenMark(goldRow) });
			assert(goldRow.pt === pay(pt.get(gold).pt, 1) + ' Pt' && v.prevCount >= 1 && (v.prevList || '').includes(nameOf(white) + ' ' + pay(pt.get(white).pt, 0)),
				tag + '金スキルの Pt は基礎×（1−Lv1の割引）。前段の白スキルは L=0 で満額（金のヒントをもらっても白のヒントレベルは上がらない）', { pt: goldRow.pt, want: pay(pt.get(gold).pt, 1), prev: v.prevList });
			assert(v.events.find((b) => b.key === 'scenario').unselected === '1' && v.count === count0 + 1 && v.total === total0 + pay(pt.get(gold).pt, 1),
				tag + '選ぶと未選択は1件に減り、合計と種数に反映される', { unselected: v.events.find((b) => b.key === 'scenario').unselected, total: v.total, want: total0 + pay(pt.get(gold).pt, 1) });
			const d = await draft(sp.page);
			assert(d.eventChoices && d.eventChoices['scenario:トレセン軒#0'] === pickIdx, tag + '選んだ結果は編成の eventChoices に保存される', d.eventChoices);
			// イベント2
			const ev2pick = 2;
			await sp.page.click('[data-usd-el="event-choice"][data-event-key="scenario:トレセン軒#1"][data-choice="' + ev2pick + '"]');
			await sp.page.waitForTimeout(250);
			v = await readPanel(sp.page);
			const ev2Skill = ev2.choices[ev2pick].skills[0];
			const sc2 = v.events.find((b) => b.key === 'scenario');
			assert(scenMark(v.rows.find((r) => r.id === ev2Skill.skillId)) === '●' && !v.ids.includes(ev2.choices[0].skills[0].skillId) && !sc2.dot && sc2.unselected === '0'
				&& sc2.label === 'シナリオ『トレセン軒』のイベントを選ぶ' && sc2.hasSvg, tag + 'イベント2を選ぶと、そのスキルが●になり、見出しの「!」は消えてどんぶりのアイコンに変わる（未選択0件）', sc2);
			await esc(sp.page);
			// 並べ替え（漏斗）・オフ・絞り込みが、ほかの列と同じに効く
			await sp.page.click(P + '[data-usd-el="sort-btn"][data-member-key="scenario"]');
			v = await readPanel(sp.page);
			const firstMarks = v.rows.slice(0, 5).map(scenMark);
			assert(firstMarks.every((m) => m === '●' || m === '△'), tag + 'シナリオの列の漏斗で、その列のスキルが上に寄る', firstMarks);
			await sp.page.click(P + '.usd-roster-grow[data-skill-id="' + fixedIds[0] + '"] input[data-usd-act="take-skill"]');
			const vOff = await readPanel(sp.page);
			assert(vOff.rows.find((r) => r.id === fixedIds[0]).off && scenMark(vOff.rows.find((r) => r.id === fixedIds[0])) === '●' && vOff.count === v.count - 1,
				tag + 'シナリオのスキルもオフにできる（○は薄く残り、種数から外れる）', { count: vOff.count, want: v.count - 1 });
			const hadLong = v.ids.includes('67');
			await sp.page.selectOption(P + 'select[data-axis="distance"]', 'short');
			v = await readPanel(sp.page);
			assert(hadLong && !v.ids.includes('67') && v.hscroll <= 0, tag + '距離の絞り込みがシナリオのスキルにも効く（長距離向けの確定のスキルが、短距離では消える）', { hadLong, has67: v.ids.includes('67') });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}

		// 駿川たづな ＆ ライトハロー: どちらか一方でも編成にいれば編成時（英俊豪傑）、どちらもいなければ非編成時（比類なき）
		{
			const tag = '段7c(N) 駿川たづな＆ライトハロー: ';
			const last = ev1.choices[ev1.choices.length - 1];
			const cases = [
				{ label: 'どちらもいない', cards: [cDotou.id], linked: false },
				{ label: '駿川たづなだけ', cards: [cTazuna.id], linked: true },
				{ label: 'ライトハローだけ', cards: [cLight.id], linked: true },
				{ label: '両方', cards: [cTazuna.id, cLight.id], linked: true },
			];
			for (const cs of cases) {
				const sp = await open2({ roster: { umaId: umaLv7.id, cardIds: cs.cards.concat(new Array(6 - cs.cards.length).fill(null)) } });
				await sp.page.click(evBtn);
				const ct = await choiceTexts(sp.page);
				const lastC = ct[ct.length - 1];
				const want = (cs.linked ? last.linked : last.unlinked)[0];
				assert(lastC.state === (cs.linked ? '編成時' : '非編成時') && lastC.text.includes(nameOf(want.skillId) + ' Lv' + want.hintLevel),
					tag + cs.label + ' → ' + (cs.linked ? '編成時（' + nameOf(last.linked[0].skillId) + ' Lv1）' : '非編成時（' + nameOf(last.unlinked[0].skillId) + ' Lv1）'), lastC);
				await sp.ctx.close();
			}
			// 育成ウマ娘の charaName でも編成にいる扱い
			const dotouUma = umas.find((u) => u.charaName === 'メイショウドトウ');
			const sp = await open2({ roster: { umaId: dotouUma.id, cardIds: new Array(6).fill(null) } });
			await sp.page.click(evBtn);
			const ct = await choiceTexts(sp.page);
			assert(ct.filter((c) => c.state === '編成時').length === 1 && ct.find((c) => c.state === '編成時').label === 'メイショウドトウ', tag + '育成ウマ娘がメイショウドトウのときも、その選択肢は編成時になる', ct);
			await sp.ctx.close();
		}

		// 編成が空のときは列を出さない／読み込めない・未登録のスキルでも壊れない
		{
			const tag = '段7c(N) ';
			let sp = await open2({ roster: { umaId: '', cardIds: new Array(6).fill(null) } });
			let v = await readPanel(sp.page);
			assert(v.heads === 0 && v.events.length === 0, tag + '編成が空のときは、表も7列目も出ない', { heads: v.heads });
			await sp.ctx.close();
			const bad = JSON.parse(JSON.stringify(scenReal));
			bad.entries[0].events[2].skills.push({ skillId: 'zz-none', hintLevel: 2 });
			sp = await open2({ roster: { umaId: umaLv7.id, cardIds: [cDotou.id, null, null, null, null, null] }, routes: Object.assign({}, R, { scenDoc: bad }) });
			v = await readPanel(sp.page);
			assert(v.heads === 9 && !v.ids.includes('zz-none') && jsErrors(sp.errors).length === 0 && v.hscroll <= 0,
				tag + '未登録のスキル（登録されていない id）が混ざっていても、その行は出さず、表は壊れない（独自IDを起こさない）', { heads: v.heads, errors: jsErrors(sp.errors).slice(0, 2) });
			await sp.ctx.close();
			sp = await open2({ roster: { umaId: umaLv7.id, cardIds: [cDotou.id, null, null, null, null, null] }, routes: Object.assign({}, R, { scenDoc: { dataVersion: '2026-10-03a', category: 'scenarioEventSkills', entries: [] } }) });
			v = await readPanel(sp.page);
			assert(v.heads === 8 && jsErrors(sp.errors).length === 0, tag + '中身が空のファイル（読めたが使える形でない）のときは、7列目を出さず、ほかは今までどおり', { heads: v.heads });
			await sp.ctx.close();
		}

		// 取りに行くのは special が編成パネルを作るときだけ
		{
			const tag = '段7c(N) 読み込み: ';
			const fetched = async (file, oldMode) => {
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
				const page = await ctx.newPage();
				const reqs = [];
				page.on('request', (r) => { if (r.url().includes('scenario-event-skills.json')) reqs.push(r.url()); });
				await page.addInitScript((d) => localStorage.setItem('umaSkillDeck:userData', JSON.stringify(d)), USER_DATA);
				await page.goto(base + '/' + file, { waitUntil: 'networkidle' });
				await page.waitForTimeout(800);
				if (oldMode) {
					// 告知を閉じて既読にしたあとなら、保存値 'old' が効く（新UIから旧UIへ入る手順はもう無い）
					for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
					await page.evaluate(() => localStorage.setItem('uma-special-ui-mode', 'old'));
					reqs.length = 0;
					await page.reload({ waitUntil: 'networkidle' });
					await page.waitForTimeout(800);
				}
				await ctx.close();
				return reqs;
			};
			for (const file of ['index.html', 'exam.html', 'uma-skill-deck.html', 'card-event-input.html']) {
				const r = await fetched(file);
				assert(r.length === 0, tag + file + ' の読み込みでは取りに行かない', r);
			}
			const oldUi = await fetched('special.html', true);
			assert(oldUi.length === 0, tag + 'special の旧UI（編成パネルを作らない）でも取りに行かない', oldUi);
			const newUi = await fetched('special.html');
			assert(newUi.length === 1 && /\?v=2026-10-03a$/.test(newUi[0]), tag + 'special の新UI（編成パネルを作る）では1回だけ、版つきで取りに行く', newUi);
		}
	});

	/* ============================================================
	 * O. 因子周回の表示
	 * ============================================================ */
	await block('段7c(O) 因子周回の表示', async () => {
		const T = '#deck-template-panel ';
		const readNeed = (page) => page.evaluate(() => {
			const el = document.querySelector('[data-usd-el="pt-need"]');
			if (!el || el.hidden) return { hidden: true };
			const num = (s) => Number((s || '').replace(/[^0-9]/g, ''));
			const chips = [1, 2, 3].map((k) => { const e = el.querySelector('[data-usd-el="pt-need-' + k + '"]'); return e ? num(e.querySelector('strong').textContent) : null; });
			const box = el.querySelector('[data-usd-el="pt-need-help-box"]');
			return { hidden: false, chips, roster: !!el.querySelector('[data-usd-el="pt-need-roster"]'), overlapInBox: !!(box && box.querySelector('[data-usd-el="pt-need-overlap"]')), overlapText: box && box.querySelector('[data-usd-el="pt-need-overlap"]') ? box.querySelector('[data-usd-el="pt-need-overlap"]').textContent : null,
				outside: !!Array.from(el.querySelectorAll('[data-usd-el="pt-need-overlap"]')).find((n) => !box || !box.contains(n)) };
		});
		const linkBtn = (page) => page.evaluate(() => { const b = document.querySelector('[data-usd-el="roster-link-btn"]'); const n = b.querySelector('.usd-roster-linkname'); const c = getComputedStyle(n);
			return { text: b.textContent.trim(), title: b.title, pressed: b.getAttribute('aria-pressed'), ellipsis: c.textOverflow, overflow: n.scrollWidth > n.clientWidth }; });
		// 本育成の合計（状態 st・取得しないスキルを除く・絞り込みなし）。前段（W3 の前段 W8）を含む。W8 が因子セットに無いときだけ前段として数える
		const sureL = [[W[2], 3], [W[3], 1], [W[6], 1], [W[7], 1]];
		const rosterItems = (st, offs) => sureL.filter(([id]) => !(offs || []).includes(id)).reduce((s, [id, l]) => s + pay(BASE[id], l, st), 0) + hintIds.length * pay(50, 5, st);
		const rosterTotal = (st, offs) => rosterItems(st, offs) + ((offs || []).includes(W[3]) ? 0 : pay(BASE[W[8]], 0, st));
		const mkSaved = (st, extra) => mkRoster(0, [cA.id, cB.id, null, null, null, null], Object.assign({ pt: { umaHintLevel: 3, status: st } }, extra || {}));
		const scopeW8 = { skillIds: [W[8]], name: '', tiers: {}, updatedAt: '' };
		const link = async (page, n) => { await page.click('[data-usd-el="roster-link-btn"]'); await page.waitForTimeout(150); await page.click('[data-usd-el="link-list"] label:nth-child(' + n + ')'); await page.waitForTimeout(300); };

		// (4) 「うち本育成」の行は無い。補足文は（?）の中（出る条件は今のまま）
		{
			const tag = '段7c(O)(4): ';
			let sp = await open({ tab: 1, scope: { skillIds: [W[2]], name: '', tiers: {}, updatedAt: '' } });
			let n = await readNeed(sp.page);
			assert(!n.hidden && !n.roster && n.overlapInBox && !n.outside && n.overlapText === '重なるスキルは、親から得ると、ヒントレベルが上がって安くなります。',
				tag + '「（うち本育成 X）」の行は無く、重なるスキルがあるときの補足文は必要スキルPt の（?）の説明の箱の中にある', n);
			await sp.page.click('[data-usd-el="pt-need-help-btn"]');
			assert(await sp.page.isVisible(T + '[data-usd-el="pt-need-overlap"]'), tag + '（?）を押すと補足文が見える');
			await sp.ctx.close();
			sp = await open({ tab: 1, scope: scopeW8 });
			n = await readNeed(sp.page);
			assert(!n.hidden && !n.roster && !n.overlapInBox, tag + '重なるスキルが無いときは、補足文は出ない（出る条件は変えていない）', n);
			await sp.ctx.close();
		}

		// 本育成編成のボタン: 「本育成編成（{状態}_{XXXX}Pt）：{編成名}」。状態が「なし」なら状態と「_」を省く。選んでいないときは「本育成編成」だけ
		for (const w of [1280, 390]) {
			const tag = '段7c(O) ' + w + 'px: ';
			const UD = baseUser({ rosters: [mkSaved('kire', { name: '切れ者の編成' }), mkRoster(1, [cA.id, null, null, null, null, null], { name: '勉強家の編成', pt: { umaHintLevel: 3, status: 'benkyo' } }),
				mkRoster(2, [cB.id, null, null, null, null, null], { name: 'なしの編成', pt: { umaHintLevel: 3, status: 'none' }, offSkillIds: [W[6]], skillFilter: { distance: 'long' } })] });
			const sp = await open({ w, h: w === 1280 ? 900 : 844, tab: 1, userData: UD, scope: scopeW8 });
			let b = await linkBtn(sp.page);
			assert(b.text === '本育成編成' && b.pressed === 'false', tag + '編成を選んでいないときは「本育成編成」だけ', b);
			await link(sp.page, 2);
			b = await linkBtn(sp.page);
			const want1 = '本育成編成（切れ者_' + fmt(rosterTotal('kire')) + 'Pt）：切れ者の編成';
			assert(b.text === want1 && b.pressed === 'true' && b.title === want1, tag + '切れ者の編成: 「' + want1 + '」（千の位のカンマあり。全文は title）', { got: b.text, want: want1 });
			await link(sp.page, 3);
			b = await linkBtn(sp.page);
			const hintsA = cA.hintSkills.map((s) => s.skillId);
			const totalA = (st) => [[W[2], 3], [W[3], 1]].reduce((s, [id, l]) => s + pay(BASE[id], l, st), 0) + [...new Set(hintsA)].length * pay(50, 5, st) + pay(BASE[W[8]], 0, st);
			assert(b.text === '本育成編成（勉強家_' + fmt(totalA('benkyo')) + 'Pt）：勉強家の編成', tag + '勉強家の編成: 「勉強家_」が付く', { got: b.text, want: fmt(totalA('benkyo')) });
			await link(sp.page, 4);
			b = await linkBtn(sp.page);
			// 絞り込み（距離=長距離）は掛けない・取得しないスキル（W6）は除く
			const hintsB = [...new Set(cB.hintSkills.map((s) => s.skillId))];
			const totalB = pay(BASE[W[7]], 1, 'none') + hintsB.length * pay(50, 5, 'none');
			assert(b.text === '本育成編成（' + fmt(totalB) + 'Pt）：なしの編成', tag + '状態が「なし」のときは状態と「_」を省く。絞り込みなし・取得しないスキルを除いた合計', { got: b.text, want: fmt(totalB) });
			await sp.ctx.close();
			// 長い名前は省略記号で切る（全文は title）。最初から長い名前で開く
			const long = '長い名前の編成'.repeat(16);
			const sp2 = await open({ w, h: w === 1280 ? 900 : 844, tab: 1, userData: baseUser({ rosters: [mkRoster(0, [cA.id, cB.id, null, null, null, null], { name: long })] }), scope: scopeW8 });
			await link(sp2.page, 2);
			b = await linkBtn(sp2.page);
			const hs = await SP(sp2.page);
			assert(b.ellipsis === 'ellipsis' && b.overflow && b.title.includes(long) && hs.sw <= hs.iw, tag + '長い名前は省略記号で切り、全文は title。横にはみ出さない', { ell: b.ellipsis, over: b.overflow, hs });
			await sp2.ctx.close();
		}

		// (5) 勉強家・切れ者の割引が、本育成パネルと同じ整数の百分率で因子周回の Pt にかかる。状態の出どころは「本育成編成に選んだ編成」。選んでいないときは①で選択中の編成
		{
			const tag = '段7c(O)(5): ';
			// 例: 基礎180・L=5（40%）に切れ者（10%）で 50% → 90
			assert(pay(180, 5, 'kire') === 90 && pay(180, 5, 'benkyo') === 100 && pay(180, 5, 'none') === 108, tag + '前提: 基礎180・L=5 は、なし 108／勉強家（4%）100／切れ者（10%）90', [pay(180, 5, 'none'), pay(180, 5, 'benkyo'), pay(180, 5, 'kire')]);
			for (const st of ['none', 'benkyo', 'kire']) {
				const sp = await open({ tab: 1, userData: baseUser({ rosters: [mkSaved(st)] }), scope: scopeW8 });
				await link(sp.page, 2);
				const n = await readNeed(sp.page);
				// 超優先だけ: 因子セットの W8 はまだ含めない（W3 の前段として L=0 で数える）。優先まで: W8 を親から得る（L=F=5）
				const want1 = rosterItems(st) + pay(BASE[W[8]], 0, st), want2 = rosterItems(st) + pay(BASE[W[8]], 5, st);
				assert(n.chips[0] === want1 && n.chips[1] === want2, tag + '状態「' + st + '」: 必要スキルPt の 超優先だけ／優先まで が割引率どおり（優先まで＝本育成＋基礎180のスキルを L=5 で ' + pay(BASE[W[8]], 5, st) + ' Pt）', { got: n.chips, want: [want1, want2] });
				await sp.ctx.close();
			}
			// 出どころ: ①で選択中の編成は「勉強家」、②のセットの本育成編成は「切れ者」→ 切れ者の割引が使われる。本育成編成を選んでいないときは①の「勉強家」
			const sp = await open({ tab: 1, userData: baseUser({ rosters: [mkSaved('kire')] }), scope: scopeW8, roster: { umaId: '', cardIds: [cA.id, cB.id, null, null, null, null], pt: { umaHintLevel: 3, status: 'benkyo' } } });
			let n = await readNeed(sp.page);
			assert(n.chips[1] === rosterItems('benkyo') + pay(BASE[W[8]], 5, 'benkyo'), tag + '本育成編成を選んでいないセットは、①で選択中の編成の設定（勉強家）を読む', n.chips);
			await link(sp.page, 2);
			n = await readNeed(sp.page);
			assert(n.chips[1] === rosterItems('kire') + pay(BASE[W[8]], 5, 'kire'), tag + '本育成編成に選んだ編成の設定（切れ者）を読む（①の勉強家ではない）', n.chips);
			await link(sp.page, 1);
			n = await readNeed(sp.page);
			assert(n.chips[1] === rosterItems('benkyo') + pay(BASE[W[8]], 5, 'benkyo'), tag + '「なし」に戻すと、また①で選択中の編成の設定を読む', n.chips);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});
}
