import { reloadReady } from './lib/page-ready.mjs';
import { clickEvents, clickSort } from './lib/col-menu.mjs';
// ①の本育成編成の表（2026-10-18・作業4。Step 0 main-roster-step0.md の案 (B)＋(C)）の検査。run-smoke.mjs の末尾から register39() で呼ばれる
// （塊の見出しはすべて「本育成表」で始まる。`npm run test:visual -- --only=本育成表` で回せる）。
//
// 決め（おいもさん）:
//  (B) 金スキルの下位の白（ヒントLv0・取得していない・前段として必要）を、金の直下に「└」で表の行として出す。名前の左のチェックは付けない（空白）。
//      Pt は「前段として必要」の値（L=0。切れ者・勉強家の割引は反映）。金を取得しないにしたらこの行は消える。種数には数えない。合計は変えない。
//      金の直前が◎のとき（金←◎←○）は◎の行1つで、Pt は◎＋○の合算。絞り込みは金に従う。進化させた金でも元の金スキルの直下に残す。
//  (C) ○→◎ は「└」にせず現行どおり（行の Pt は○＋◎の合算）。
//  表の上の1行は残す。ただし「ヒントLv0」のグループだけ（◎に上げた○・取得しない金の下位の白の Lv1 以上は出さない）。
//  これらは表示用で、「本育成で得るスキル」には数えない（takenIds・合計・種数・②・オススメサポは変えない）。
//  理由: 金の下位の白は本育成のヒントが Lv0 だと必要 Pt が高くなりすぎるので、因子周回（②）で因子を得たい。②では同じスキルを今までどおり選べる。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。

export async function register39(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const RULES = readJson('data/skill-pt-rules.json');
	const STEP = new Map(readJson('data/skill-step-up.json').entries.map((e) => [e.skillId, e.prevSkillIds || []]));
	const EVO = readJson('data/skill-evolutions.json').entries;
	const T = '#deck-roster-panel ';
	const NEVER = 'ex-0238', NEVER_LOW = '230';   // 金（ネバーギブアップ）と、その下位の白（折れない心）
	// 代表の編成 A（Step 0 と同じ）。2026-10-18 の開始時の値: 表の行43・上の1行の項目10・合計4,720・種数39・オススメサポの候補402枚
	const A = { umaId: 'uma-0179', cardIds: ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'], skillFilter: { distance: 'long', style: 'senko', surface: 'turf' }, pt: { status: 'kire', umaHintLevel: 3 } };
	// cands は 2026-10-25a でカードが2枚増えて 402→404、C-249（T20）でさらに2枚増えて 404→406（T33 で直した。ほかは開始時のまま）
	const START = { rows: 43, line: 10, total: 4720, kinds: 39, cands: 406 };
	/** 独立の式: 基礎値・ヒントLv・状態の割引（加算）→ 支払う Pt */
	const ptOf = (base, level, statusId) => {
		const hint = level > 0 ? RULES.hintDiscountPercent[Math.min(level, RULES.hintDiscountPercent.length) - 1] : 0;
		const st = (RULES.statuses.find((s) => s.id === statusId) || { percent: 0 }).percent;
		const n = base * (100 - hint - st);
		return RULES.rounding === 'floor' ? Math.floor(n / 100) : Math.round(n / 100);
	};

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		await sp.page.evaluate(({ roster, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster, tab: o.tab === undefined ? 0 : o.tab });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(800);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); try { await UmaSkillDeckCore.loadSkillEvolutions(); } catch (e) {} });
		return sp;
	};
	const readTable = (page) => page.evaluate((T) => {
		const rows = Array.from(document.querySelectorAll(T + '.usd-roster-grow[data-skill-id]')).map((r) => {
			const pt = r.querySelector('[data-usd-el="pt-line"]');
			return { id: r.getAttribute('data-skill-id'), derived: r.hasAttribute('data-usd-derived'), prev: r.classList.contains('usd-roster-grow--prev'), mark: !!r.querySelector('[data-usd-el="prev-mark"]'),
				check: !!r.querySelector('[data-usd-act="take-skill"]'), gold: r.classList.contains('usd-roster-grow--gold'), evo: r.getAttribute('data-usd-evo'), off: r.hasAttribute('data-usd-off'),
				pt: pt ? pt.textContent : null, cells: r.querySelectorAll('.usd-roster-got, .usd-roster-maybe').length };
		});
		const line = document.querySelector(T + '[data-usd-el="pt-prev"]');
		return { rows, line: line ? line.textContent : null, sum: (document.querySelector(T + '[data-usd-el="roster-sum"]') || {}).textContent || '', overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
	}, T);
	const detail = (page, roster) => page.evaluate((roster) => {
		const C = UmaSkillDeckCore;
		const d = C.getRosterPtDetail(roster), vp = C.getRosterVisiblePart(roster);
		return { total: d.total, kinds: d.kinds, items: d.items.length, prev: d.prevItems, visible: vp.visibleIds.length, taken: vp.takenIds, visibleIds: vp.visibleIds };
	}, roster);
	const ptNum = (s) => (s && /^\d+ Pt$/.test(s) ? Number(s.replace(/[^0-9]/g, '')) : 0);
	/** 「合成の行は、直前までさかのぼって金の行に着く（間に別の行が挟まらない）」 */
	const derivedFollowGold = (rows) => rows.filter((r) => r.derived).every((r) => {
		let i = rows.findIndex((x) => x.id === r.id);
		for (i = i - 1; i >= 0; i--) { if (rows[i].gold || (rows[i].evo && PT.get(rows[i].id) && PT.get(rows[i].id).rarity === 'gold')) return true; if (!rows[i].prev) return false; }
		return false;
	});

	await block('本育成表(1) 代表の編成A: ネバーギブアップの直下に「└ 折れない心 162」が出る（行 43→46）／チェックなし・列の印なし／合計・種数は変わらない', async () => {
		const sp = await openSp({ roster: A });
		const tb = await readTable(sp.page);
		const d = await detail(sp.page, A);
		const i = tb.rows.findIndex((r) => r.id === NEVER);
		const lo = tb.rows[i + 1];
		const base0 = PT.get(NEVER_LOW).pt;
		assert(i >= 0 && lo && lo.id === NEVER_LOW && lo.derived && lo.prev && lo.mark, '本育成表(1) ネバーギブアップの直下に、下位の白（折れない心）の「└」の行が出る', tb.rows.slice(i, i + 3));
		assert(lo.pt === ptOf(base0, 0, 'kire') + ' Pt' && lo.pt === '162 Pt', '本育成表(1) Pt は基礎Pt×ヒントLv0・切れ者の割引＝162 Pt（独立の式と一致）', { pt: lo.pt, expect: ptOf(base0, 0, 'kire') });
		assert(lo.check === false && lo.cells === 0, '本育成表(1) 名前の左のチェックは付けず、メンバーの列は空欄', lo);
		const derivedRows = tb.rows.filter((r) => r.derived);
		assert(START.rows === d.visible && tb.rows.length === START.rows + derivedRows.length && derivedRows.length === 3, '本育成表(1) 行は開始時の43から46に（金の下位の白3つ）', { rows: tb.rows.length, derived: derivedRows.map((r) => r.id) });
		assert(d.total === START.total && d.kinds === START.kinds && /4,720\s*Pt/.test(tb.sum) && /39種/.test(tb.sum), '本育成表(1) 合計 4,720 Pt・39種は変わらない（種数に数えない）', { d: [d.total, d.kinds], sum: tb.sum });
		assert(derivedFollowGold(tb.rows), '本育成表(1) 合成の行はどれも、金の行（と、その直下の前段の白）のすぐ下に続く', {});
		assert(tb.overflowX === false && jsErrors(sp.errors).length === 0, '本育成表(1) 横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('本育成表(2) 行の Pt の和＝合計（合成の行が足されて、◎の行は○＋◎の合算）／上の1行は「ヒントLv0」のグループだけ（10項目→3項目）', async () => {
		const sp = await openSp({ roster: A });
		const tb = await readTable(sp.page);
		const d = await detail(sp.page, A);
		const sum = tb.rows.filter((r) => !r.off).reduce((s, r) => s + ptNum(r.pt), 0);
		assert(sum === d.total, '本育成表(2) 表の行の Pt を全部足すと合計に一致する（' + sum + '）', { sum, total: d.total });
		assert(START.line === d.prev.length, '本育成表(2) 前提: 前段として数える項目は開始時と同じ10', d.prev.length);
		assert(tb.line === 'ヒントLv0：折れない心 162・直線加速 153・コーナー加速○ 162', '本育成表(2) 上の1行は「ヒントLv0：名前 Pt・名前 Pt」の形のまま、Lv0 のグループだけ（3項目）', tb.line);
		assert(!/ヒントLv[1-9]/.test(tb.line || ''), '本育成表(2) Lv1〜5 のグループは出ない（◎に上げた○は出ない）', tb.line);
		// ○のまま（◎に上げない）にしても、上の1行は同じ（Lv0 のグループだけ）
		const cands = await sp.page.evaluate((r) => UmaSkillDeckCore.getRosterVisiblePart(r).circleCandidates.map((x) => x[0]), A);
		const sp2 = await openSp({ roster: Object.assign({}, A, { keepCircleIds: cands }) });
		const tb2 = await readTable(sp2.page);
		assert(cands.length === 7 && tb2.line === tb.line, '本育成表(2) ○のままにしても上の1行は同じ（Lv0 のグループだけ）', { n: cands.length, line: tb2.line });
		await sp.ctx.close(); await sp2.ctx.close();
		// 金の下位の白（活路を拓く！）を取得しないにしても、Lv1 以上の項目は上の1行に出ない（合計は変わらない）
		const off = Object.assign({}, A, { offSkillIds: ['319'] });
		const sp3 = await openSp({ roster: off });
		const tb3 = await readTable(sp3.page);
		const d3 = await detail(sp3.page, off);
		assert(d3.prev.some((x) => x.skillId === '319' && x.hintLevel > 0) && !/ヒントLv[1-9]/.test(tb3.line || '') && !/活路/.test(tb3.line || ''), '本育成表(2) 取得しないにした金の下位の白（Lv>0）は、前段として数えるが、上の1行には出ない', { line: tb3.line, prev: d3.prev.filter((x) => x.skillId === '319') });
		assert(d3.total === START.total, '本育成表(2) その合計は変わらない', d3.total);
		await sp3.ctx.close();
	});

	await block('本育成表(3) 金を「取得しない」にすると、その下位の白の行は消える（合計が前段のぶん下がる 4,720→4,450・種数 39→38）', async () => {
		const off = Object.assign({}, A, { offSkillIds: [NEVER] });
		const sp = await openSp({ roster: off });
		const tb = await readTable(sp.page);
		const d = await detail(sp.page, off);
		const ids = tb.rows.map((r) => r.id);
		assert(!ids.includes(NEVER_LOW) && ids.includes(NEVER), '本育成表(3) 金（取得しない）の行は残り、下位の白の行は消える', tb.rows.slice(0, 8).map((r) => r.id));
		assert(tb.rows.filter((r) => r.derived).length === 2 && tb.rows.length === START.rows + 2, '本育成表(3) 合成の行は残り2つ（行は 43+2）', tb.rows.length);
		assert(d.total === 4450 && d.kinds === 38, '本育成表(3) 合計 4,450 Pt・38種（Step 0 の実測と一致）', [d.total, d.kinds]);
		await sp.ctx.close();
	});

	await block('本育成表(4) 金←◎←○: ◎の行1つにして Pt は◎＋○の合算（○は別の行にしない）', async () => {
		// 金←◎←○（データで31件）のうち、衣装自身が金を持ち、◎も○も表に出ていない衣装を、計算の戻り値から探す（独立に選ぶ）
		const golds2 = [...STEP.keys()].filter((g) => PT.get(g) && PT.get(g).rarity === 'gold' && (STEP.get(STEP.get(g)[0]) || []).length > 0);
		assert(golds2.length === 31, '本育成表(4) 前提: 金の直前が◎で、その前が○のスキルはデータで31件', golds2.length);
		// 候補の編成: 金を自身のスキルに持つ衣装（単独）と、金をイベントで得るサポートカード（単独）
		const cands = [];
		readJson('data/training-umamusume.json').entries.forEach((u) => { const s = JSON.stringify([u.initialSkills, u.awakeningSkills]); golds2.forEach((g) => { if (s.includes('"' + g + '"')) cands.push({ g, r: { umaId: u.id, cardIds: [] } }); }); });
		readJson('data/support-card-event-skills.json').entries.forEach((e) => { const s = JSON.stringify(e); golds2.forEach((g) => { if (s.includes('"' + g + '"')) cands.push({ g, r: { umaId: '', cardIds: [e.cardId] } }); }); });
		const sp = await openSp({ roster: { umaId: 'uma-0001', cardIds: [] } });
		const pick = await sp.page.evaluate(({ cands, step }) => {
			const C = UmaSkillDeckCore;
			for (const { g, r } of cands) {
				const vp = C.getRosterVisiblePart(r), d = C.getRosterPtDetail(r);
				const gate = step[g][0], circ = step[gate][0];
				if (vp.takenIds.includes(g) && !vp.visibleIds.includes(gate) && !vp.visibleIds.includes(circ) && d.prevItems.some((x) => x.skillId === gate) && d.prevItems.some((x) => x.skillId === circ)) return { r, g, gate, circ };
			}
			return null;
		}, { cands, step: Object.fromEntries(STEP) });
		await sp.ctx.close();
		assert(!!pick, '本育成表(4) 前提: ◎も○も表に出ない金（衣装自身のスキル）の編成が見つかる', pick);
		const G = pick.g, GATE = pick.gate, CIRC = pick.circ, R = pick.r;
		assert(STEP.get(G).join() === GATE && STEP.get(GATE).join() === CIRC && PT.get(GATE).rarity === 'white', '本育成表(4) 金の直前が◎で、その前が○（データ）', { g: STEP.get(G), c: STEP.get(GATE) });
		const sp1 = await openSp({ roster: R });
		sp.page = sp1.page; sp.ctx = sp1.ctx;
		const tb = await readTable(sp.page);
		const d = await detail(sp.page, R);
		const i = tb.rows.findIndex((r) => r.id === G);
		const nx = tb.rows[i + 1];
		const want = ptOf(PT.get(GATE).pt, 0, 'none') + ptOf(PT.get(CIRC).pt, 0, 'none');
		assert(i >= 0 && nx && nx.id === GATE && nx.derived && nx.pt === want + ' Pt', '本育成表(4) 金の直下に◎の行（Pt は◎＋○の合算＝' + want + '）', { rows: tb.rows.slice(i, i + 3), want });
		assert(!tb.rows.some((r) => r.id === CIRC), '本育成表(4) ○は別の行にしない', tb.rows.map((r) => r.id));
		assert(tb.rows.filter((r) => !r.off).reduce((s, r) => s + ptNum(r.pt), 0) === d.total, '本育成表(4) 行の Pt の和は合計に一致する', { total: d.total });
		await sp.ctx.close();
	});

	await block('本育成表(5) 並べ替え・絞り込み・進化の行でも、合成の行は金の直下に付いて動く（絞り込みは金に従う）', async () => {
		const sp = await openSp({ roster: A });
		// 並べ替え（列の漏斗・種類の漏斗）
		const keys = await sp.page.evaluate((T) => Array.from(document.querySelectorAll(T + '[data-usd-act="sort"], ' + T + '[data-usd-act="col-menu"]')).map((b) => b.getAttribute('data-member-key')).slice(0, 3), T);
		const results = [];
		for (const k of keys) {
			await clickSort(sp.page, T, k);
			await sp.page.waitForTimeout(300);
			const tb = await readTable(sp.page);
			results.push({ k, ok: derivedFollowGold(tb.rows) && tb.rows.filter((r) => r.derived).length === 3 });
		}
		await sp.page.click(T + '[data-usd-act="sort-tone"][data-tone="heal"]');
		await sp.page.waitForTimeout(300);
		const tb2 = await readTable(sp.page);
		results.push({ k: 'tone:heal', ok: derivedFollowGold(tb2.rows) && tb2.rows.filter((r) => r.derived).length === 3 });
		assert(results.every((r) => r.ok), '本育成表(5) 並べ替え（列・種類）のあとも、合成の行は金の直下に付いたまま（3行）', results);
		await sp.ctx.close();
		// 絞り込み: 金が絞り込みで外れたら、その下位の白の行も出ない／残る金の下位の白は出る
		const bad = [];
		for (const f of [{ distance: 'short' }, { style: 'nige' }, { surface: 'dirt' }, { distance: 'medium', style: 'senko', surface: 'turf' }]) {
			const R = Object.assign({}, A, { skillFilter: f });
			const sp2 = await openSp({ roster: R });
			const tb = await readTable(sp2.page);
			const d = await detail(sp2.page, R);
			const visibleGolds = new Set(d.visibleIds.filter((id) => PT.get(id) && PT.get(id).rarity === 'gold'));
			const ok = derivedFollowGold(tb.rows)
				&& tb.rows.filter((r) => r.derived).every((r) => [...visibleGolds].some((g) => STEP.get(g).includes(r.id)));
			if (!ok) bad.push(JSON.stringify(f));
			await sp2.ctx.close();
		}
		assert(bad.length === 0, '本育成表(5) 絞り込み（距離・脚質・バ場）でも、合成の行は絞り込みに残っている金の下位の白だけ', bad);
		// 進化させた金の行でも、下位の白は元の金スキルの直下に残す
		const cand = EVO.filter((e) => e.kind === 'uma').map((e) => ({ umaId: e.umaId, baseId: e.baseSkillId, target: e.evolvedSkillIds[0] }));
		let found = null;
		for (const c of cand) {
			const R = { umaId: c.umaId, cardIds: [], evolutionChoices: { [c.baseId]: c.target } };
			const sp3 = await openSp({ roster: R });
			const tb = await readTable(sp3.page);
			const i = tb.rows.findIndex((r) => r.id === c.baseId);
			if (i >= 0 && tb.rows[i].evo === c.target && tb.rows[i + 1] && tb.rows[i + 1].derived) found = { c, rows: tb.rows.slice(i, i + 2), ok: derivedFollowGold(tb.rows) };
			await sp3.ctx.close();
			if (found) break;
		}
		assert(!!found && found.ok && found.rows[1].prev && found.rows[1].mark, '本育成表(5) 進化させた金の行（名前は進化先）でも、下位の白の行は元の金スキルの直下に残る', found);
	});

	await block('本育成表(6) 合成の行の名前を押すと説明の小窓（「いまの設定：162 Pt（Lv0）」つき）が開く', async () => {
		const sp = await openSp({ roster: A });
		await sp.page.click(T + '.usd-roster-grow[data-skill-id="' + NEVER_LOW + '"] [data-usd-info]');
		await sp.page.waitForTimeout(500);
		const info = await sp.page.evaluate(() => { const p = document.querySelector('.usd-info-pop'); return p && !p.hidden ? p.textContent.replace(/\s+/g, ' ') : null; });
		assert(!!info && info.includes('いまの設定：162 Pt（Lv0）'), '本育成表(6) 説明の小窓が開き、「いまの設定：162 Pt（Lv0）」が出る', info);
		await sp.ctx.close();
	});

	await block('本育成表(7) 表示用であって、本育成で得るスキルには数えない: takenIds・合計・種数・オススメサポの候補は開始時と同じ／②（条件で検索・テキストで検索）で折れない心を今までどおり選べる', async () => {
		const sp = await openSp({ roster: A, tab: 1 });
		const d = await detail(sp.page, A);
		assert(!d.taken.includes(NEVER_LOW) && d.total === START.total && d.kinds === START.kinds, '本育成表(7) 折れない心は取得の集合（takenIds）に入らず、合計・種数は開始時と同じ', { in: d.taken.includes(NEVER_LOW), total: d.total, kinds: d.kinds });
		const pop = await sp.page.evaluate((r) => { const C = UmaSkillDeckCore; return { cands: C.outside.candidatesOf(r).length, popHas: C.outside.populationOf(Object.assign({ outsideOptions: { exclude: {} } }, r)).ids.includes('230') }; }, A);
		assert(pop.cands === START.cands && pop.popHas === true, '本育成表(7) オススメサポの候補は406枚（開始時の402枚＋先行データのカード2枚＋C-249 の2枚）で、母集団に折れない心が入る', pop);
		// ②の「条件で検索」: 折れない心の行が選べる（「本育成編成のため選べない」の灰色の行にならない）
		await sp.page.evaluate(() => UmaSkillDeckCore.openSkillPicker([], () => {}));
		await sp.page.waitForTimeout(600);
		const row = await sp.page.evaluate((id) => {
			const inp = document.querySelector('[data-usd-el="results"] input[value="' + id + '"]');
			if (!inp) return null;
			return { disabled: inp.disabled, excluded: !!inp.closest('.usd-row--excluded'), reason: (inp.closest('label').querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || '' };
		}, NEVER_LOW);
		assert(!!row && row.disabled === false && row.excluded === false, '本育成表(7) 「条件で検索」で折れない心が選べる（本育成で得るため選べません、にならない）', row);
		// 本育成で得るスキル（ネバーギブアップ）は、今までどおり選べない
		const gold = await sp.page.evaluate((id) => { const inp = document.querySelector('[data-usd-el="results"] input[value="' + id + '"]'); return inp ? { disabled: inp.disabled } : null; }, 'ex-0238');
		assert(gold === null || gold.disabled === true, '本育成表(7) 比較: 本育成で得る●のスキルは、今までどおり選べない（行が無いか、無効）', gold);
		await sp.page.click('[data-usd-act="picker-close"]');
		await sp.ctx.close();
		// 「テキストで検索」: 名前を貼ると折れない心が選べる候補に当たる（本育成の除外に入らない）
		const sp2 = await openSp({ roster: A, tab: 1 });
		const blocked = await sp2.page.evaluate(() => { const C = UmaSkillDeckCore; const r = C.outside.populationOf({ umaId: 'uma-0179', cardIds: ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'], skillFilter: { distance: 'long', style: 'senko', surface: 'turf' } }); return r.ok ? r.ids.includes('230') : null; });
		assert(blocked === true, '本育成表(7) 母集団（②に足せる白スキル）に折れない心が入っている', blocked);
		await sp2.ctx.close();
	});
}
