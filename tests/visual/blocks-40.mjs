// 見出しの合計の種数と（?）の小窓（2026-10-20・C-178）の検査。run-smoke.mjs の末尾から register40() で呼ばれる
// （塊の見出しはすべて「C-178」で始まる。`npm run test:visual -- --only=C-178` で回せる）。
//
// 決め（おいもさん・C-178）:
//  背景: 金スキル（ネバーギブアップ）の前段の白（折れない心）は、①ではヒントLv0（割引なし）の「前段として必要」として数える。②の因子セットに同じ白を入れると、
//        親由来のレベルで安くなった額で数える。見出しの合計は、その白を1回だけ②の額で数えている（二重ではない）。
//  (ア) 見出しの（?）の小窓に、重なりがあるときだけ1行（重なりのあるスキルごと。5行を超えるときは「ほか N 種」）:
//       「①の前段として数えている「名前」X Pt は、因子で得るため Y Pt に置き換えて数えています（差 Z Pt）」。数は変えない。
//  (イ) 金が①・その下位の白が②のとき、**見出しの合計の種数だけ**1種に数える（pairedWhiteIds を①と②をまたぐ場合にも広げる）。
//       ①の帯の「X Pt／N種」・②の帯の「N種」の数え方は変えない。見出しの Pt は変えない。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。

import { reloadReady } from './lib/page-ready.mjs';
export async function register40(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const RULES = readJson('data/skill-pt-rules.json');
	const STEP = new Map(readJson('data/skill-step-up.json').entries.map((e) => [e.skillId, e.prevSkillIds || []]));
	const BAR = '#deck-set-bar ';
	const NEVER = 'ex-0238', NEVER_LOW = '230';   // 金（ネバーギブアップ）と、その下位の白（折れない心）
	const OTHER_WHITE = '200041';                 // 代表の編成 A の金の下位ではない白（②に別の白だけを入れる場合）
	const A = { umaId: 'uma-0179', cardIds: ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'], skillFilter: { distance: 'long', style: 'senko', surface: 'turf' }, pt: { status: 'kire', umaHintLevel: 3 } };
	const ptOf = (base, level, statusId) => {
		const hint = level > 0 ? RULES.hintDiscountPercent[Math.min(level, RULES.hintDiscountPercent.length) - 1] : 0;
		const st = (RULES.statuses.find((s) => s.id === statusId) || { percent: 0 }).percent;
		const n = base * (100 - hint - st);
		return RULES.rounding === 'floor' ? Math.floor(n / 100) : Math.round(n / 100);
	};
	const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const signed = (d) => (d < 0 ? '−' : '') + fmt(Math.abs(d));

	/** special.html を、編成（①）と②の因子セット（ids・F）を入れて開く。②のタブ（tab 1）を見せる */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		await sp.page.evaluate(({ roster, ids, F, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			if (ids) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: F })); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster, ids: o.ids || null, F: o.F === undefined ? 5 : o.F, tab: o.tab === undefined ? 1 : o.tab });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(800);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); try { await UmaSkillDeckCore.loadSkillEvolutions(); } catch (e) {} });
		await sp.page.waitForTimeout(600);
		// 見出しの帯の合計（Pt の元データを読み終えると出る）が出るまで待つ（遅い回でも読み込みの前に押さない）
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		return sp;
	};
	/** 見出し（合計と種数）・①の帯・②の帯の数。numbers は数字の要素の textContent を数に直したもの */
	const read = (page) => page.evaluate((BAR) => {
		const n = (s) => { const e = document.querySelector(s); return e ? Number(e.textContent.replace(/[^0-9]/g, '')) : null; };
		const tot = document.querySelector(BAR + '[data-usd-el="set-total"]');
		return { total: tot ? Number(tot.dataset.total) : null, kinds: tot ? Number(tot.dataset.kinds) : null,
			kindsText: (document.querySelector(BAR + '[data-usd-el="set-total-kinds"]') || {}).textContent || null,
			rPt: n('[data-usd-el="pt-total"]'), rKinds: n('[data-usd-el="pt-count"]'), fPt: n('[data-usd-el="factor-pt"]'), fKinds: n('[data-usd-el="factor-count"]'),
			overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
	}, BAR);
	const openHelp = async (page) => {
		await page.click(BAR + '[data-usd-act="set-total-help"]');
		await page.waitForTimeout(250);
		return page.evaluate(() => {
			const pop = document.querySelector('.usd-info-pop');
			const lines = (sel) => Array.from(document.querySelectorAll(sel)).map((p) => p.textContent);
			return { open: !!pop && !pop.hidden, text: pop && !pop.hidden ? pop.textContent.replace(/\s+/g, ' ') : null,
				overlap: lines('[data-usd-el="set-total-overlap"]'), more: lines('[data-usd-el="set-total-overlap-more"]'),
				kindsFormula: (document.querySelector('[data-usd-el="set-total-kinds-formula"]') || {}).textContent || null,
				ptFormula: (document.querySelector('[data-usd-el="set-total-formula"]') || {}).textContent || null };
		});
	};
	const detail = (page, roster) => page.evaluate((r) => { const d = UmaSkillDeckCore.getRosterPtDetail(r); return { total: d.total, kinds: d.kinds, prev: d.prevItems }; }, roster);
	const row2Pt = (page, id) => page.evaluate((id) => { const e = document.querySelector('.usd-panel[data-skill-id="' + id + '"] [data-usd-el="panel-pt"]'); return e ? e.textContent : null; }, id);
	const nameOf = (page, id) => page.evaluate((id) => UmaSkillDeckCore.getSkillName ? UmaSkillDeckCore.getSkillName(id) : null, id);

	await block('C-178(1) 金が①・下位の白が②: 見出しの種数が 46→45 になり、Pt（5,368）と①の帯・②の帯は変わらない', async () => {
		const sp = await openSp({ roster: A, ids: [NEVER_LOW], F: 5 });
		const h = await read(sp.page);
		assert(h.total === 5368 && h.kinds === 45 && h.kindsText === '／45種', 'C-178(1) 見出し 5,368 Pt／45種（変更前は 46種）', h);
		assert(h.rPt === 4720 && h.rKinds === 39 && h.fPt === 648 && h.fKinds === 7, 'C-178(1) ①の帯 4,720 Pt／39種・②の帯 648 Pt／7種は変わらない（種数は金と白を別々に数えたまま）', h);
		assert(h.total === h.rPt + h.fPt && h.kinds === h.rKinds + h.fKinds - 1, 'C-178(1) 見出しの種 ＝ ① ＋ ② − 1（Pt は ①＋② のまま）', h);
		const help = await openHelp(sp.page);
		assert(help.kindsFormula === '種 ＝ ① 39 ＋ ② 7 − 1（金と下位の白を両方取るため1種に数える）', 'C-178(1) ?の中の種の式に、引いた1種を出す', help.kindsFormula);
		await sp.ctx.close();
	});

	await block('C-178(2) 変わらない場合: ②に入れない／②に別の白だけ／①の金を取得しない／②に入れた白の上の金を①で取得していない', async () => {
		// ②に入れない: 45種（①39＋継承固有6）
		let sp = await openSp({ roster: A, ids: null });
		let h = await read(sp.page);
		assert(h.total === 5440 && h.kinds === 45 && h.kinds === h.rKinds + h.fKinds, 'C-178(2) ②に入れない: 5,440 Pt／45種のまま（引かない）', h);
		await sp.ctx.close();
		// ②に別の白だけ: 46種（引かない）
		sp = await openSp({ roster: A, ids: [OTHER_WHITE] });
		h = await read(sp.page);
		assert(h.kinds === h.rKinds + h.fKinds && h.kinds === 46, 'C-178(2) ②に別の白だけ: 46種のまま（引かない）', h);
		await sp.ctx.close();
		// ①の金を取得しない: 金が①の取得に入らないので引かない（種数は ① ＋ ② のまま）
		sp = await openSp({ roster: Object.assign({}, A, { offSkillIds: [NEVER] }), ids: [NEVER_LOW] });
		h = await read(sp.page);
		assert(h.kinds === h.rKinds + h.fKinds, 'C-178(2) ①の金を取得しないにしたときは引かない（見出しの種 ＝ ① ＋ ②）', h);
		let help = await openHelp(sp.page);
		assert(help.overlap.length === 0 && !/−/.test(help.kindsFormula || ''), 'C-178(2) 金を取得しないにすると前段が消え、?の中の重なりの行も出ない', help);
		await sp.ctx.close();
		// ②に入れた白の上の金を①で取得していない: 別の金の下位の白（A の金は取らない編成に変える）
		const other = { umaId: 'uma-0001', cardIds: [] };
		sp = await openSp({ roster: other, ids: [NEVER_LOW] });
		const takes = await sp.page.evaluate((r) => UmaSkillDeckCore.getRosterVisiblePart(r).takenIds, other);
		h = await read(sp.page);
		assert(!takes.includes(NEVER) && h.kinds === h.rKinds + h.fKinds, 'C-178(2) ①で金（' + NEVER + '）を取得していない編成に白だけ②に入れても引かない', { takes: takes.length, h });
		await sp.ctx.close();
	});

	await block('C-178(3) 金←◎←○: ②に○を入れたときも、①の金と1種に数える（1つの金につき1種まで）', async () => {
		const golds2 = [...STEP.keys()].filter((g) => PT.get(g) && PT.get(g).rarity === 'gold' && (STEP.get(STEP.get(g)[0]) || []).length > 0);
		const cands = [];
		readJson('data/training-umamusume.json').entries.forEach((u) => { const s = JSON.stringify([u.initialSkills, u.awakeningSkills]); golds2.forEach((g) => { if (s.includes('"' + g + '"')) cands.push({ g, r: { umaId: u.id, cardIds: [] } }); }); });
		readJson('data/support-card-event-skills.json').entries.forEach((e) => { const s = JSON.stringify(e); golds2.forEach((g) => { if (s.includes('"' + g + '"')) cands.push({ g, r: { umaId: '', cardIds: [e.cardId] } }); }); });
		const sp0 = await openSp({ roster: { umaId: 'uma-0001', cardIds: [] } });
		const pick = await sp0.page.evaluate(({ cands, step }) => {
			const C = UmaSkillDeckCore;
			for (const { g, r } of cands) {
				const vp = C.getRosterVisiblePart(r), d = C.getRosterPtDetail(r);
				const gate = step[g][0], circ = step[gate][0];
				if (vp.takenIds.includes(g) && !vp.visibleIds.includes(gate) && !vp.visibleIds.includes(circ) && d.prevItems.some((x) => x.skillId === gate) && d.prevItems.some((x) => x.skillId === circ)) return { r, g, gate, circ };
			}
			return null;
		}, { cands, step: Object.fromEntries(STEP) });
		await sp0.ctx.close();
		assert(!!pick, 'C-178(3) 前提: 金←◎←○ の金を①で取る編成が見つかる', pick);
		// ②に○だけ → 1種引く／②に◎だけ → 1種引く／②に◎と○の両方 → 引くのは1種まで（1つの金につき1種）
		for (const [label, ids, minus] of [['○だけ', [pick.circ], 1], ['◎だけ', [pick.gate], 1], ['◎と○の両方', [pick.gate, pick.circ], 1]]) {
			const sp = await openSp({ roster: pick.r, ids, F: 5 });
			const h = await read(sp.page);
			assert(h.kinds === h.rKinds + h.fKinds - minus, 'C-178(3) 金←◎←○ で②に' + label + ': 見出しの種 ＝ ① ＋ ② − ' + minus, h);
			assert(h.fKinds === ids.length + 6 && h.rKinds === (await detail(sp.page, pick.r)).kinds, 'C-178(3) ' + label + ': ②の帯の種数（継承固有6＋' + ids.length + '）・①の帯の種数は変わらない', h);
			await sp.ctx.close();
		}
	});

	await block('C-178(4) ?の小窓の1行: 重なりがあるときだけ出る・文面の数は①の前段の項目と②の行の値に一致する（F=5・3・1）', async () => {
		const basePt = PT.get(NEVER_LOW).pt;
		for (const F of [5, 3, 1]) {
			const sp = await openSp({ roster: A, ids: [NEVER_LOW], F });
			const d = await detail(sp.page, A);
			const prev = d.prev.find((x) => x.skillId === NEVER_LOW);
			const r2 = await row2Pt(sp.page, NEVER_LOW);
			// C-223（2026-10-28）: ②の行は差（②の額 − ①の前段の額。例 −72 Pt）を出すようにそろえた。（?）の文は②の額（全額）で今までの形のまま
			const rowDiff = (String(r2 || '').trim().startsWith('−') ? -1 : 1) * Number((r2 || '').replace(/[^0-9]/g, ''));
			const pt2 = (prev ? prev.pt : 0) + rowDiff;
			const nm = await nameOf(sp.page, NEVER_LOW);
			const help = await openHelp(sp.page);
			assert(help.open, 'C-178(4) F=' + F + ' ?の小窓が開く', help);
			assert(!!prev && prev.pt === ptOf(basePt, 0, 'kire') && rowDiff === ptOf(basePt, F, 'kire') - ptOf(basePt, 0, 'kire') && r2 === signed(rowDiff) + ' Pt', 'C-178(4)→C-223 F=' + F + ' 前提: ①の前段の項目 ' + (prev && prev.pt) + ' Pt・②の行は差 ' + r2 + '（独立の式と一致）', { prev, r2 });
			assert(help.overlap.length === 1 && help.overlap[0] === '①の前段として数えている「' + nm + '」' + fmt(prev.pt) + ' Pt は、因子で得るため ' + fmt(pt2) + ' Pt に置き換えて数えています（差 ' + signed(pt2 - prev.pt) + ' Pt）',
				'C-178(4) F=' + F + ' 1行の文面: 「…' + prev.pt + ' Pt は、因子で得るため ' + pt2 + ' Pt に置き換えて…（差 ' + signed(pt2 - prev.pt) + ' Pt）」', help.overlap);
			assert(!/ヒント|必ず合う|合うことがある|合わない/.test(help.text || ''), 'C-178(4) F=' + F + ' 小窓に「ヒント」「必ず合う／合うことがある／合わない」の語を使わない', help.text);
			// 閉じる→もう一度開く（開閉）
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(200);
			const closed = await sp.page.evaluate(() => { const p = document.querySelector('.usd-info-pop'); return !p || p.hidden; });
			assert(closed === true, 'C-178(4) F=' + F + ' Escape で小窓が閉じる', closed);
			const again = await openHelp(sp.page);
			assert(again.open && again.overlap.length === 1, 'C-178(4) F=' + F + ' もう一度開くと同じ1行が出る', again);
			await sp.ctx.close();
		}
	});

	await block('C-178(5) ?の小窓の行が出ない場合: ②に入れない／②に別の白だけ／金を取得しない', async () => {
		for (const [label, roster, ids] of [['②に入れない', A, null], ['②に別の白だけ', A, [OTHER_WHITE]], ['①の金を取得しない', Object.assign({}, A, { offSkillIds: [NEVER] }), [NEVER_LOW]]]) {
			const sp = await openSp({ roster, ids });
			const help = await openHelp(sp.page);
			assert(help.open && help.overlap.length === 0 && help.more.length === 0, 'C-178(5) ' + label + ': 重なりの行が出ない（小窓は開く）', help);
			assert(/^種 ＝ ① \d+ ＋ ② \d+$/.test(help.kindsFormula || ''), 'C-178(5) ' + label + ': 種の式に「−」を足さない', help.kindsFormula);
			await sp.ctx.close();
		}
	});

	await block('C-178(6) ?の小窓の行: 重なりが複数なら1行ずつ・5行を超えると「ほか N 種」', async () => {
		// 金の下位の白のうち、①で取っているもの（4つ）を「取得しない」にすると、前段として数える項目になり、②に入れられる（取っている白は②に入れても数えない）
		const R6 = Object.assign({}, A, { offSkillIds: ['319', '180', '278', '45'] });
		const sp0 = await openSp({ roster: R6, ids: null });
		const d0 = await detail(sp0.page, R6);
		const t0 = await sp0.page.evaluate((r) => UmaSkillDeckCore.getRosterVisiblePart(r).takenIds, R6);
		await sp0.ctx.close();
		const priced = d0.prev.filter((x) => x.pt !== null && x.pt !== undefined && !t0.includes(x.skillId));
		assert(priced.length >= 6, 'C-178(6) 前提: ①で取っていない前段の項目（②に入れられるもの）は6つ以上ある', priced.length);
		// 3つ: 3行（「ほか」なし）
		const three = priced.slice(0, 3).map((x) => x.skillId);
		let sp = await openSp({ roster: R6, ids: three, F: 5 });
		let help = await openHelp(sp.page);
		assert(help.overlap.length === 3 && help.more.length === 0, 'C-178(6) 重なり3つ: 1行ずつ3行', help);
		await sp.ctx.close();
		// 全部（priced の数）: 5行＋「ほか N 種」
		const all = priced.map((x) => x.skillId);
		sp = await openSp({ roster: R6, ids: all, F: 5 });
		help = await openHelp(sp.page);
		assert(help.overlap.length === 5 && help.more.length === 1 && help.more[0] === 'ほか ' + (all.length - 5) + ' 種', 'C-178(6) 重なり' + all.length + 'つ: 5行＋「ほか ' + (all.length - 5) + ' 種」', help);
		// 各行の数は ①の前段の項目と②の行の値に一致する
		const rows = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="set-total-overlap"]')).map((p) => ({ id: p.getAttribute('data-skill-id'), t: p.textContent })));
		for (const r of rows) {
			const p = priced.find((x) => x.skillId === r.id);
			const m = /」([\d,]+) Pt は、因子で得るため ([\d,]+) Pt に置き換えて数えています（差 (−?[\d,]+) Pt）/.exec(r.t);
			assert(!!p && !!m && Number(m[1].replace(/,/g, '')) === p.pt && m[3] === signed(Number(m[2].replace(/,/g, '')) - p.pt), 'C-178(6) ' + r.id + ' の行の数は①の前段の項目（' + (p && p.pt) + ' Pt）と整合する', r);
		}
		await sp.ctx.close();
	});

	await block('C-178(7) 数は変えない: 見出しの Pt・①の帯・②の帯・取得の集合（takenIds）は、行を足しても同じ／横スクロールなし・エラー0', async () => {
		const sp = await openSp({ roster: A, ids: [NEVER_LOW], F: 5, w: 390 });
		const errors = [];
		sp.page.on('pageerror', (e) => errors.push(String(e)));
		const h = await read(sp.page);
		const d = await detail(sp.page, A);
		assert(d.total === 4720 && d.kinds === 39 && h.rPt === 4720 && h.rKinds === 39, 'C-178(7) ①の合計 4,720 Pt・39種は変わらない', { d, h });
		const taken = await sp.page.evaluate((r) => UmaSkillDeckCore.getRosterVisiblePart(r).takenIds, A);
		assert(!taken.includes(NEVER_LOW), 'C-178(7) 折れない心は取得の集合（takenIds）に入らない', taken.length);
		await openHelp(sp.page);
		const h2 = await read(sp.page);
		assert(h2.overflowX === false && jsErrors(errors).length === 0, 'C-178(7) 小窓を開いても横スクロールなし・エラー0', { h2, errors });
		await sp.ctx.close();
	});
}
