// オススメサポの小窓の中のスキル名の小窓の下部「このスキルが得られるサポートカード」（C-243・2026-10-30）の検査。
// run-smoke.mjs の末尾から register69() で呼ばれる（塊の見出しはすべて「得られるサポカ」で始まる。`npm run test:visual -- --only=得られるサポカ` で回せる）。
//
// 決め（おいもさん・2026-10-30。C-239 のモックB を受けて）:
//  ・オススメサポの小窓の中のスキル名の小窓（説明の小窓）の下部だけに、開閉できるパネル。初期は閉じる。共通の小窓すべてには出さない。
//  ・閉じた行「このスキルが得られるサポートカード　N枚 ▾」（高さ 44px・行全体が押せる）。開くと ▴。
//  ・一覧の行: レアリティのアイコン（SSR／SR）・種別アイコン・上に小さくカードの題・下に太字でキャラクター名・右端に「ヒント」「イベント」「ヒント・イベント」の札。R は載せない。
//  ・並び: SSR → SR、同じレアリティの中は種別の順（スピード → スタミナ → パワー → 根性 → 賢さ → 友人）、その中はカードの題の順。
//  ・長い一覧（最大47枚）も上限なし（案B）: 小窓の本文がスクロールし、開閉の行は小窓の上に残る。説明の文は足さない。
// 期待値（どのカードが・どの経路で得られるか）は製品の計算を読まず、data/ の3つのファイルから検査の側で独立に出す。
// 例の数（C-239 のモックの報告）: 秋ウマ娘○（id 19）10枚〔SSR 9・SR 1・すべてヒント〕・中距離コーナー○（id 104）47枚〔SSR 36・SR 11・ヒント 36・イベント 9・両方 2〕。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。

import { reloadReady } from './lib/page-ready.mjs';
import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';

export async function register69(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

	// ── 期待値: スキル → カードの逆引きを data/ から独立に作る ──
	const CARDS = readJson('data/support-cards.json').entries;
	const EV = new Map(readJson('data/support-card-event-skills.json').entries.map((r) => [r.cardId, r]));
	const CH = new Map(readJson('data/character-event-skills.json').entries.map((r) => [r.charaName, r]));
	// T20: 結果が分かれる選択肢は成功側（先頭の結果）だけ（点数の計算と同じ）。allResults は検査の比べ用に、失敗側も含めた集め方
	const rowIds = (row, key, allResults) => {
		const out = new Set();
		if (!row) return out;
		const put = (x) => { if (x && x.skillId) out.add(x.skillId); };
		if (row.status === 'seeded') { (row.unplaced || []).forEach(put); return out; }
		if (row.status !== 'done') return out;
		(row[key] || []).forEach((ev) => {
			(ev.choices || []).forEach((c) => { (c.skills || []).forEach(put); (allResults ? (c.results || []) : (c.results || []).slice(0, 1)).forEach((r) => (r || []).forEach(put)); });
			(ev.acquireOptions || []).forEach((o) => ((o && o.skills) || []).forEach(put));
		});
		return out;
	};
	const charasOf = (c) => (typeof c.isGroup !== 'boolean' ? [] : c.isGroup ? (c.groupMembers || []) : (c.charaName ? [c.charaName] : []));
	const expectFor = (id) => {
		const out = [];
		CARDS.forEach((c) => {
			if (c.rarity !== 'SSR' && c.rarity !== 'SR') return;
			const hint = !!(c.dataStatus && c.dataStatus.hint === 'done') && (c.hintSkills || []).some((s) => s && s.skillId === id);
			const event = rowIds(EV.get(c.id), 'chain').has(id) || charasOf(c).some((n) => rowIds(CH.get(n), 'events').has(id));
			if (hint || event) out.push({ id: c.id, rarity: c.rarity, type: typeof c.typeOrder === 'number' ? c.typeOrder : Infinity, title: c.title || '', how: hint && event ? 'ヒント・イベント' : hint ? 'ヒント' : 'イベント' });
		});
		// 並び: SSR → SR・種別の順（typeOrder）・カードの題の順（日本語の順）・id
		out.sort((a, b) => ((a.rarity === 'SSR' ? 0 : 1) - (b.rarity === 'SSR' ? 0 : 1)) || (a.type === b.type ? 0 : a.type < b.type ? -1 : 1)
			|| a.title.localeCompare(b.title, 'ja') || (a.id < b.id ? -1 : 1));
		return out;
	};
	// 失敗側の結果でしか得られない（スキル・カード）の組（T20 でパネルから消えた行。2026-10-31 時点で19行・18種）
	const FAIL_ONLY = [];
	CARDS.forEach((c) => {
		if (c.rarity !== 'SSR' && c.rarity !== 'SR') return;
		const hint = new Set(!!(c.dataStatus && c.dataStatus.hint === 'done') ? (c.hintSkills || []).map((s) => s && s.skillId) : []);
		const of = (all) => { const s = new Set(rowIds(EV.get(c.id), 'chain', all)); charasOf(c).forEach((n) => rowIds(CH.get(n), 'events', all).forEach((x) => s.add(x))); return s; };
		const succ = of(false);
		of(true).forEach((id) => { if (!succ.has(id) && !hint.has(id)) FAIL_ONLY.push([id, c.id]); });
	});
	const R_IDS = new Set(CARDS.filter((c) => c.rarity !== 'SSR' && c.rarity !== 'SR').map((c) => c.id));
	const AKI = '19', CORNER = '104';
	const count = (list, k, v) => list.filter((x) => x[k] === v).length;

	// 編成は C-239 のモックと同じ（オススメサポの一覧に中距離コーナー○ が出る）
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const A = { umaId: 'uma-0179', cardIds: ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'], pt: { status: 'kire' } };
	const IDS = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417'];
	const POP = '[data-usd-el="info-pop"]:not([hidden])';

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		await sp.page.evaluate(({ roster, ids, theme }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 3 }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: A, ids: IDS, theme: o.theme || 'light' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const openOutside = async (page) => {
		await page.click(T + '[data-usd-el="outside-open"]');
		await page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]') && !!m.querySelector('[data-usd-el="outside-row"]'); }, null, { timeout: 30000 });
		await page.waitForTimeout(300);
	};
	/** オススメサポの一覧の、そのスキルの行の名前を押して説明の小窓を開く */
	const openName = async (page, id) => {
		await page.click('[data-usd-el="outside-modal"] [data-usd-el="outside-row"][data-skill-id="' + id + '"] button[data-usd-info]');
		await page.waitForSelector(POP, { timeout: 5000 });
		await page.waitForTimeout(250);
	};
	// ▾ の回転は 0.15 秒の transition なので、終わるまで待ってから読む
	const toggle = async (page) => { await page.click(POP + ' [data-usd-el="skill-cards-toggle"]'); await page.waitForTimeout(350); };
	const readPanel = (page) => page.evaluate((POP) => {
		const pop = document.querySelector(POP);
		if (!pop) return null;
		const w = pop.querySelector('[data-usd-el="skill-cards"]');
		if (!w) return { has: false, title: pop.querySelector('.uma-popover-title').textContent };
		const t = w.querySelector('[data-usd-el="skill-cards-toggle"]');
		const list = w.querySelector('[data-usd-el="skill-cards-list"]');
		const tr = t.getBoundingClientRect(), br = pop.querySelector('.usd-info-body').getBoundingClientRect();
		const chev = t.querySelector('.usd-sc-chev');
		return {
			has: true, title: pop.querySelector('.uma-popover-title').textContent, text: t.textContent, expanded: t.getAttribute('aria-expanded'), controls: t.getAttribute('aria-controls') === list.id,
			tag: t.tagName, h: tr.height, wFull: Math.abs(tr.width - br.width) <= 1, count: (t.querySelector('[data-usd-el="skill-cards-count"]') || {}).textContent,
			chev: !!chev, chevTf: chev ? getComputedStyle(chev).transform : null, hidden: list.hidden, shown: getComputedStyle(list).display !== 'none',
			last: w === pop.querySelector('.usd-info-body').lastElementChild,
			rows: Array.from(list.querySelectorAll('[data-usd-el="skill-cards-row"]')).map((r) => {
				const imgs = Array.from(r.querySelectorAll('img'));
				return { id: r.dataset.cardId, rarity: r.dataset.rarity, imgs: imgs.map((i) => i.getAttribute('src')), alts: imgs.map((i) => i.alt),
					title: r.querySelector('[data-usd-el="skill-cards-title"]').textContent, chara: r.querySelector('[data-usd-el="skill-cards-chara"]').textContent,
					how: r.querySelector('[data-usd-el="skill-cards-how"]').textContent, charaW: getComputedStyle(r.querySelector('[data-usd-el="skill-cards-chara"]')).fontWeight,
					titleFs: parseFloat(getComputedStyle(r.querySelector('[data-usd-el="skill-cards-title"]')).fontSize), charaFs: parseFloat(getComputedStyle(r.querySelector('[data-usd-el="skill-cards-chara"]')).fontSize),
					howRight: r.lastElementChild === r.querySelector('[data-usd-el="skill-cards-how"]') };
			})
		};
	}, POP);
	/** 説明の小窓の中身（パネルを除く）の文字 */
	const readInfo = (page) => page.evaluate((POP) => {
		const pop = document.querySelector(POP);
		return Array.from(pop.querySelector('.usd-info-body').children).filter((c) => c.getAttribute('data-usd-el') !== 'skill-cards')
			.map((c) => (c.getAttribute('data-usd-el') || c.className) + '=' + c.textContent);
	}, POP);
	const closePop = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };

	await block('得られるサポカ(1) 逆引きの数と範囲: 秋ウマ娘○ 10枚（SSR 9・SR 1・すべてヒント）・中距離コーナー○ 47枚（SSR 36・SR 11・ヒント 36・イベント 9・両方 2）／製品の逆引きは data/ から独立に出した一覧と同じカード・同じ並び・同じ札／R は含まない／オススメサポで出るすべての行で同じ', async () => {
		const sp = await openSp({ w: 1280, h: 900 });
		const got = await sp.page.evaluate((ids) => ids.map((id) => UmaSkillDeckCore.cardsWithSkill(id)), [AKI, CORNER]);
		const want = [expectFor(AKI), expectFor(CORNER)];
		const aki = got[0], cor = got[1];
		assert(aki.length === 10 && count(aki, 'rarity', 'SSR') === 9 && count(aki, 'rarity', 'SR') === 1 && count(aki, 'how', 'ヒント') === 10,
			'得られるサポカ(1) 秋ウマ娘○: 10枚・SSR 9・SR 1・すべてヒント', { n: aki.length, ssr: count(aki, 'rarity', 'SSR'), sr: count(aki, 'rarity', 'SR'), hint: count(aki, 'how', 'ヒント') });
		assert(cor.length === 47 && count(cor, 'rarity', 'SSR') === 36 && count(cor, 'rarity', 'SR') === 11 && count(cor, 'how', 'ヒント') === 36 && count(cor, 'how', 'イベント') === 9 && count(cor, 'how', 'ヒント・イベント') === 2,
			'得られるサポカ(1) 中距離コーナー○: 47枚・SSR 36・SR 11・ヒント 36・イベント 9・両方 2', { n: cor.length, ssr: count(cor, 'rarity', 'SSR'), sr: count(cor, 'rarity', 'SR'), how: [count(cor, 'how', 'ヒント'), count(cor, 'how', 'イベント'), count(cor, 'how', 'ヒント・イベント')] });
		[0, 1].forEach((k) => {
			const g = got[k].map((x) => x.cardId + ':' + x.how), w = want[k].map((x) => x.id + ':' + x.how);
			assert(JSON.stringify(g) === JSON.stringify(w), '得られるサポカ(1) ' + [AKI, CORNER][k] + ': 製品の一覧は検査の側で出した一覧と同じカード・同じ並び・同じ札', { got: g.slice(0, 6), want: w.slice(0, 6) });
			assert(got[k].every((x) => (x.rarity === 'SSR' || x.rarity === 'SR') && !R_IDS.has(x.cardId)), '得られるサポカ(1) ' + [AKI, CORNER][k] + ': R のカードは含まない', got[k].filter((x) => R_IDS.has(x.cardId)));
		});
		// T20: 失敗側の結果でしか得られないカードは出さない（成功側だけ）
		const failGot = await sp.page.evaluate((pairs) => pairs.filter(([s, c]) => UmaSkillDeckCore.cardsWithSkill(s).some((x) => x.cardId === c)), FAIL_ONLY);
		assert(FAIL_ONLY.length === 19 && new Set(FAIL_ONLY.map((p) => p[0])).size === 18 && failGot.length === 0,
			'得られるサポカ(1) 失敗側の結果でしか得られない19行（18種）は、どれも製品の一覧に出ない（成功側だけ。T20）', { n: FAIL_ONLY.length, kinds: new Set(FAIL_ONLY.map((p) => p[0])).size, shown: failGot.slice(0, 5) });
		// オススメサポの一覧に出るすべてのスキルで、製品の逆引きが独立の一覧と同じ
		await openOutside(sp.page);
		const rowIdsOut = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]')).map((r) => r.dataset.skillId));
		const allGot = await sp.page.evaluate((ids) => ids.map((id) => UmaSkillDeckCore.cardsWithSkill(id).map((x) => x.cardId + ':' + x.how).join(',')), rowIdsOut);
		const bad = rowIdsOut.filter((id, i) => allGot[i] !== expectFor(id).map((x) => x.id + ':' + x.how).join(','));
		assert(rowIdsOut.length >= 10 && rowIdsOut.includes(CORNER) && bad.length === 0, '得られるサポカ(1) オススメサポの一覧の ' + rowIdsOut.length + ' 種すべてで一致（中距離コーナー○ を含む）', bad.slice(0, 5));
		assert(jsErrors(sp.errors).length === 0, '得られるサポカ(1) コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});

	await block('得られるサポカ(2) 閉じた行と開閉: 初期は閉じる（aria-expanded false・一覧なし）・行全体が1つのボタン（高さ 44px 以上・本文の幅いっぱい）・「このスキルが得られるサポートカード」と「N枚」と ▾／押すと開いて ▴（一覧の行の数＝N）・もう一度押すと閉じる・小窓を開き直すと閉じた状態から／パネルは説明の小窓の下部（最後）', async () => {
		const sp = await openSp({ w: 375 });
		await openOutside(sp.page);
		await openName(sp.page, CORNER);
		const p0 = await readPanel(sp.page);
		assert(p0 && p0.has && p0.tag === 'BUTTON' && p0.expanded === 'false' && p0.controls && p0.hidden && !p0.shown && p0.rows.length === 0,
			'得られるサポカ(2) 初期は閉じている（ボタン・aria-expanded false・一覧は出ていない）', p0 && { expanded: p0.expanded, hidden: p0.hidden, rows: p0.rows.length });
		assert(p0.h >= 44 && p0.wFull && p0.text.startsWith('このスキルが得られるサポートカード') && p0.count === '47枚' && p0.chev && p0.chevTf === 'none' && p0.last,
			'得られるサポカ(2) 閉じた行: 高さ 44px 以上・本文の幅いっぱい・文言「このスキルが得られるサポートカード」「47枚」・▾（回転なし）・説明の小窓の最後', { h: p0.h, wFull: p0.wFull, text: p0.text, count: p0.count, chevTf: p0.chevTf, last: p0.last });
		await toggle(sp.page);
		const p1 = await readPanel(sp.page);
		assert(p1.expanded === 'true' && !p1.hidden && p1.shown && p1.rows.length === 47 && p1.count === p1.rows.length + '枚' && p1.chevTf !== 'none',
			'得られるサポカ(2) 押すと開く（aria-expanded true・一覧の行の数＝枚数 47・▴＝回転）', { expanded: p1.expanded, rows: p1.rows.length, count: p1.count, chevTf: p1.chevTf });
		await toggle(sp.page);
		const p2 = await readPanel(sp.page);
		assert(p2.expanded === 'false' && p2.hidden && !p2.shown && p2.chevTf === 'none', '得られるサポカ(2) もう一度押すと閉じる', { expanded: p2.expanded, hidden: p2.hidden });
		// キーボード（Enter）でも開く
		await sp.page.focus(POP + ' [data-usd-el="skill-cards-toggle"]');
		await sp.page.keyboard.press('Enter');
		await sp.page.waitForTimeout(150);
		assert((await readPanel(sp.page)).expanded === 'true', '得られるサポカ(2) Enter でも開く', null);
		await closePop(sp.page);
		await openName(sp.page, CORNER);
		const p3 = await readPanel(sp.page);
		assert(p3.expanded === 'false' && p3.hidden, '得られるサポカ(2) 小窓を開き直すと閉じた状態から', { expanded: p3.expanded });
		assert(jsErrors(sp.errors).length === 0, '得られるサポカ(2) コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});

	await block('得られるサポカ(3) 一覧の行: 並びは SSR → SR・種別の順・題の順（検査の側の一覧と同じ）・R なし／レアリティのアイコン・種別アイコンは①・オススメサポのカードと同じ画像（img/osusume-*）／上に小さくカードの題・下に太字でキャラクター名／右端に「ヒント」「イベント」「ヒント・イベント」の札', async () => {
		const sp = await openSp({ w: 375 });
		await openOutside(sp.page);
		await openName(sp.page, CORNER);
		await toggle(sp.page);
		const p = await readPanel(sp.page);
		const want = expectFor(CORNER);
		assert(JSON.stringify(p.rows.map((r) => r.id)) === JSON.stringify(want.map((x) => x.id)), '得られるサポカ(3) 並び（47行）が検査の側の一覧と同じ', { got: p.rows.slice(0, 5).map((r) => r.id), want: want.slice(0, 5).map((x) => x.id) });
		const rk = (r) => (r === 'SSR' ? 0 : 1);
		assert(p.rows.every((r, i) => i === 0 || rk(p.rows[i - 1].rarity) <= rk(r.rarity)) && p.rows.some((r) => r.rarity === 'SR') && p.rows.every((r) => !R_IDS.has(r.id)),
			'得られるサポカ(3) SSR → SR の順・R のカードは無い', p.rows.map((r) => r.rarity).join(''));
		// 種別アイコン・レアリティのアイコンは、オススメサポの小窓のカードの部品と同じ画像（同じ src）
		const parts = await sp.page.evaluate(() => {
			const m = document.querySelector('[data-usd-el="outside-modal"]');
			return { type: Array.from(m.querySelectorAll('[data-usd-el="card-type-icon"]')).map((i) => i.getAttribute('src')), rar: Array.from(m.querySelectorAll('[data-usd-el="card-rarity-icon"]')).map((i) => i.getAttribute('src')) };
		});
		const wantHow = new Map(want.map((x) => [x.id, x.how]));
		const typeOf = new Map(CARDS.map((c) => [c.id, c.typeOrder]));
		const typeKey = { 1: 'speed', 2: 'stamina', 3: 'power', 4: 'guts', 5: 'wisdom', 6: 'friend' };
		const badImg = p.rows.filter((r) => r.imgs.length !== 2 || !/^img\/osusume-rarity-(ssr|sr)-/.test(r.imgs[0]) || r.imgs[0].indexOf('osusume-rarity-' + r.rarity.toLowerCase() + '-') === -1
			|| r.imgs[1].indexOf('osusume-type-' + typeKey[typeOf.get(r.id)] + '-') === -1 || r.alts[0] !== r.rarity || !r.alts[1]);
		assert(badImg.length === 0, '得られるサポカ(3) すべての行にレアリティ（SSR／SR）と種別のアイコン（img/osusume-*・alt 付き）', badImg.slice(0, 3));
		const usedSrc = new Set(p.rows.flatMap((r) => r.imgs));
		assert(parts.type.length > 0 && parts.type.some((s) => usedSrc.has(s)) && parts.rar.length > 0 && parts.rar.some((s) => usedSrc.has(s)),
			'得られるサポカ(3) アイコンの画像はオススメサポの小窓のカードの部品と同じファイル', { type: parts.type.slice(0, 2), rar: parts.rar.slice(0, 2) });
		const card = new Map(CARDS.map((c) => [c.id, c]));
		const badText = p.rows.filter((r) => { const c = card.get(r.id); return r.title !== '[' + c.title + ']' || r.chara !== (c.isGroup ? (c.groupName || c.charaName) : c.charaName); });
		assert(badText.length === 0, '得られるサポカ(3) 上にカードの題（[題]）・下にキャラクター名（グループのカードはグループ名）', badText.slice(0, 3));
		assert(p.rows.every((r) => r.titleFs < r.charaFs && Number(r.charaW) >= 700), '得られるサポカ(3) 題は小さく・キャラクター名は太字', p.rows.slice(0, 1).map((r) => ({ t: r.titleFs, c: r.charaFs, w: r.charaW })));
		const badHow = p.rows.filter((r) => r.how !== wantHow.get(r.id) || !r.howRight);
		assert(badHow.length === 0 && p.rows.some((r) => r.how === 'ヒント') && p.rows.some((r) => r.how === 'イベント') && p.rows.some((r) => r.how === 'ヒント・イベント'),
			'得られるサポカ(3) 右端の札は「ヒント」「イベント」「ヒント・イベント」で、データと一致', badHow.slice(0, 3));
		assert(jsErrors(sp.errors).length === 0, '得られるサポカ(3) コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});

	await block('得られるサポカ(4) 長い一覧（中距離コーナー○ 47枚）: 一覧の高さに上限なし（一覧の中はスクロールしない）・小窓の本文がスクロールする・いちばん下までスクロールしても開閉の行は小窓の上に残り、押すと閉じる／375・1280px', async () => {
		for (const w of [375, 1280]) {
			const tag = '得られるサポカ(4) ' + w + 'px: ';
			const sp = await openSp({ w, h: w === 375 ? 812 : 900 });
			await openOutside(sp.page);
			await openName(sp.page, CORNER);
			await toggle(sp.page);
			const r = await sp.page.evaluate((POP) => {
				const pop = document.querySelector(POP);
				const body = pop.querySelector('.uma-popover-body');
				const list = pop.querySelector('[data-usd-el="skill-cards-list"]');
				const t = pop.querySelector('[data-usd-el="skill-cards-toggle"]');
				const before = { sh: body.scrollHeight, ch: body.clientHeight, listOver: getComputedStyle(list).overflowY, listSh: list.scrollHeight, listCh: list.clientHeight };
				body.scrollTop = body.scrollHeight;
				const br = body.getBoundingClientRect(), tr = t.getBoundingClientRect();
				const rows = list.querySelectorAll('[data-usd-el="skill-cards-row"]');
				const lr = rows[rows.length - 1].getBoundingClientRect();
				const x = tr.left + tr.width / 2, y = tr.top + tr.height / 2;
				const hit = document.elementFromPoint(x, y);
				return Object.assign(before, { scrolled: body.scrollTop > 0, tTop: tr.top, bTop: br.top, tBottomIn: tr.bottom <= br.bottom, lastIn: lr.bottom <= br.bottom + 1 && lr.top >= br.top,
					hitToggle: !!hit && (hit === t || t.contains(hit)) });
			}, POP);
			assert(r.sh > r.ch && r.listOver !== 'auto' && r.listOver !== 'scroll' && Math.abs(r.listSh - r.listCh) <= 1, tag + '一覧に高さの上限は無く、小窓の本文がスクロールする', r);
			assert(r.scrolled && r.lastIn && Math.abs(r.tTop - r.bTop) <= 1 && r.tBottomIn && r.hitToggle, tag + 'いちばん下までスクロールしても開閉の行は本文の上端に残り、押せる（最後の行が見える）', r);
			await sp.page.mouse.click(...(await sp.page.evaluate((POP) => { const t = document.querySelector(POP + ' [data-usd-el="skill-cards-toggle"]').getBoundingClientRect(); return [t.left + t.width / 2, t.top + t.height / 2]; }, POP)));
			await sp.page.waitForTimeout(150);
			assert((await readPanel(sp.page)).expanded === 'false', tag + 'スクロールした位置で開閉の行を押すと閉じる', null);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('得られるサポカ(5) 375・320・1280px × ライト・ダーク: 開いた一覧で小窓と画面に横スクロールなし・パネルの文字（見出し・枚数・題・キャラクター名・札）のコントラスト 4.5 以上', async () => {
		for (const w of [375, 320, 1280]) for (const theme of ['light', 'dark']) {
			const tag = '得られるサポカ(5) ' + w + 'px ' + theme + ': ';
			const sp = await openSp({ w, h: w === 320 ? 640 : w === 375 ? 812 : 900, theme });
			await openOutside(sp.page);
			await openName(sp.page, CORNER);
			const closed = await sp.page.evaluate(scanTextContrastInPage, POP + ' [data-usd-el="skill-cards"]');
			assert(closed.checked >= 2 && closed.bad.length === 0, tag + '閉じた行の文字のコントラスト 4.5 以上（' + closed.checked + '件）', formatContrast(closed.bad).slice(0, 4));
			await toggle(sp.page);
			const hs = await sp.page.evaluate((POP) => {
				const pop = document.querySelector(POP);
				const els = [pop, pop.querySelector('.uma-popover-body'), pop.querySelector('.usd-info-body'), pop.querySelector('[data-usd-el="skill-cards-list"]')];
				const r = pop.getBoundingClientRect();
				return { over: els.map((e) => e.scrollWidth - e.clientWidth), page: document.documentElement.scrollWidth - window.innerWidth, inView: r.left >= -1 && r.right <= window.innerWidth + 1,
					rowsIn: Array.from(pop.querySelectorAll('[data-usd-el="skill-cards-row"]')).every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.left >= r.left - 1; }) };
			}, POP);
			assert(hs.over.every((v) => v <= 1) && hs.page <= 1 && hs.inView && hs.rowsIn, tag + '小窓・本文・一覧と画面に横スクロールなし・行は小窓の中', hs);
			const open = await sp.page.evaluate(scanTextContrastInPage, POP + ' [data-usd-el="skill-cards"]');
			assert(open.checked >= 47 * 3 && open.bad.length === 0, tag + '開いた一覧の文字のコントラスト 4.5 以上（' + open.checked + '件）', formatContrast(open.bad).slice(0, 4));
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('得られるサポカ(6) 説明の小窓の中身（白スキル・説明・基礎 Pt・系列）は、パネルの無い同じスキルの説明の小窓と同じ・パネルは系列の行の下／オススメサポの外の説明の小窓（②のパネル・脚質オススメ・パネルを渡さない部品）にはパネルが出ない', async () => {
		const sp = await openSp({ w: 375 });
		await openOutside(sp.page);
		// オススメサポの一覧の先頭の数種で比べる（中距離コーナー○ を含む）
		const ids = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]')).map((r) => r.dataset.skillId));
		const pick = Array.from(new Set([CORNER].concat(ids.slice(0, 3))));
		for (const id of pick) {
			await openName(sp.page, id);
			const withPanel = await readInfo(sp.page);
			const p = await readPanel(sp.page);
			const order = await sp.page.evaluate((POP) => { const b = document.querySelector(POP + ' .usd-info-body'); const k = Array.from(b.children).map((c) => c.getAttribute('data-usd-el')); return k; }, POP);
			await closePop(sp.page);
			// 同じスキルを、パネルを渡さない部品（公開の attachSkillInfo）で開く
			const plain = await sp.page.evaluate(async ({ id, POP }) => {
				const b = document.createElement('button');
				b.type = 'button'; b.textContent = 'x'; b.style.position = 'fixed'; b.style.left = '0'; b.style.top = '0'; b.style.zIndex = '200';
				const host = document.createElement('div'); host.appendChild(b); document.body.appendChild(host);
				UmaSkillDeckCore.attachSkillInfo(b, { skillId: id, trigger: 'self' });
				b.click();
				await new Promise((r) => setTimeout(r, 250));
				const pop = document.querySelector(POP);
				const out = { has: !!pop.querySelector('[data-usd-el="skill-cards"]'), info: Array.from(pop.querySelector('.usd-info-body').children).map((c) => (c.getAttribute('data-usd-el') || c.className) + '=' + c.textContent) };
				UmaSkillDeckCore.closeSkillInfo();
				host.remove();
				return out;
			}, { id, POP });
			const seriesIdx = order.indexOf('info-series');
			assert(p.has && !plain.has && JSON.stringify(withPanel) === JSON.stringify(plain.info) && withPanel.some((x) => x.startsWith('info-desc=')) && withPanel.some((x) => x.startsWith('info-pt=')),
				'得られるサポカ(6) ' + id + ': 説明・基礎 Pt・系列はパネルの無い小窓と同じ', { withPanel, plain: plain.info });
			assert(order[order.length - 1] === 'skill-cards' && (seriesIdx === -1 || seriesIdx < order.length - 1), '得られるサポカ(6) ' + id + ': パネルは説明の小窓の最後（系列の行の下）', order);
		}
		// オススメサポの小窓を閉じて、②のパネルの名前・脚質オススメの名前
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(300);
		if (await sp.page.isVisible('[data-usd-el="outside-modal"]')) { await sp.page.keyboard.press('Escape'); await sp.page.waitForTimeout(300); }
		await sp.page.click(T + '[data-usd-el="selected-list"] .usd-panel-namebtn[data-usd-info]');
		await sp.page.waitForSelector(POP);
		const p2 = await readPanel(sp.page);
		assert(p2 && p2.has === false, '得られるサポカ(6) ②のパネルの名前の説明の小窓にはパネルが出ない', p2);
		await closePop(sp.page);
		await sp.page.click(T + '[data-usd-el="style-open"]');
		await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="style-modal"]'); return !!m && !m.hidden && m.querySelectorAll('[data-usd-el="style-row"] button[data-usd-info]').length > 0; }, null, { timeout: 15000 });
		await sp.page.waitForTimeout(200);
		await sp.page.click('[data-usd-el="style-modal"] [data-usd-el="style-row"] button[data-usd-info]');
		await sp.page.waitForSelector(POP);
		const p3 = await readPanel(sp.page);
		assert(p3 && p3.has === false, '得られるサポカ(6) 脚質オススメの名前の説明の小窓にはパネルが出ない', p3);
		await closePop(sp.page);
		assert(jsErrors(sp.errors).length === 0, '得られるサポカ(6) コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});
}
