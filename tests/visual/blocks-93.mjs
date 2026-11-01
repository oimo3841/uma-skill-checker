// 詳細の小窓の「取得できるスキル」の並び（T70・2026-11-02。C-266 の (3)）の検査。
// run-smoke.mjs の末尾から register93() で呼ばれる（塊の見出しはすべて「T70スキルの並び」で始まる。`npm run test:visual -- --only=T70スキルの並び` で回せる）。
//
// 決め（C-266 の (3) と T66 の報告への回答 1〜5）:
//  キャラ＝固有 → 進化（進化先 → └金 → └白）→ 進化先の無い金（└白）→ その他の白 → イベントで得るスキル（各行に札「イベントスキル」）。
//  サポカ＝金（└白）→ その他の白 → 共通イベントで得るスキル。連続イベントで得る行は金・白に混ぜて札「連続イベントX回目」（2つの回なら「連続イベント2・3回目」）。
//  区分ごとに 確定 → 未選択、その中は既定の並び（ゲーム内の並び）の逆。ヒントとイベントの両方で得るものはヒントの区分。金の組の下位の白は金と一緒に動く。
// 期待の並びは、T66 のモック（lab/info-skills-mock.html。製品の小窓の写しを、決めた規則で並べ替えたもの）の「新しい並び」（(ア)A・(イ)A・(ウ)B）を
// その場で開いて読む。比べるのは行の種類・スキルの ID・└の組・札の文字だけ（スキル名・カード名は書かない。恒久ルール1）。
// 対象の小窓は3つ: ①のキャラ・カードの小窓、②の星取表の列のカードの小窓、オススメサポのカード名の小窓（同じ部品 buildEventsInfo）。
// 変更前（T70 の前）の製品では、並びが今の並び（確定 → 未選択、その中は既定の並び）で札も無いので、この塊は NG になる（T70 の報告に結果）。
import { reloadReady } from './lib/page-ready.mjs';
import { clickEvents } from './lib/col-menu.mjs';

export async function register93(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const IDS2 = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417'];
	const races = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/upcoming-races.json'), 'utf8')).races;
	// T66 のモックを写し取ったときの状態（T66 の報告の「作り方」1〜4）
	const CARDS1 = ['card-0565', 'card-0564', 'card-0310', 'card-0281', 'card-0402', 'card-0248'];
	const R1 = { umaId: 'uma-0272', cardIds: CARDS1 };
	const R2 = { umaId: 'uma-0175', cardIds: [] };
	const R3 = { umaId: 'uma-0272', cardIds: ['card-0207'] };
	const R4 = Object.assign({}, R1, { race: races.find((r) => r.id === 'race-0002'), outsideOptions: { count: 4, pinned: ['card-0300'] }, outsideCardExcluded: ['card-0559'] });
	const R4_EX_SKILLS = ['393', 'ex-0533'];
	const SRC_TAG = '[data-usd-el="ev-skill-chain"], [data-usd-el="ev-skill-event"]';

	/** 小窓の「取得できるスキル」の行（行の種類・スキルの ID・└の組〔進化の段／金の ID〕・名前の後ろの札） */
	const ROWS = `(() => Array.from(document.querySelectorAll('[data-usd-el="ev-skills"] > li')).map((li) => {
		const nm = li.querySelector('.usd-ev-skill-name');
		const tags = nm ? Array.from(nm.querySelectorAll('.usd-roster-autotag, .usd-ev-tag')).map((t) => t.textContent.trim()) : [];
		return [li.getAttribute('data-usd-el'), li.getAttribute('data-skill-id'), li.getAttribute('data-usd-evo-depth') || li.getAttribute('data-usd-gold-white-of') || '', tags.join('|')].join(' ');
	}))()`;
	/** モックの新しい並び（(ア)A・(イ)A・(ウ)B）の行 */
	const mockRows = {};
	const loadMock = async () => {
		const p = await openPage(browser, base, 'lab/info-skills-mock.html?scene=uma0272&a=A&i=A&u=B&shot=1', { width: 1280, height: 900 }, EMPTY);
		await p.page.waitForFunction(() => !!(window.T66 && document.querySelector('[data-usd-el="ev-skills"]')), null, { timeout: 15000 });
		for (const sc of ['uma0272', 'uma0175', 'card0565', 'card0564', 'group0310', 'card0207', 'out0540']) {
			mockRows[sc] = await p.page.evaluate((sc) => { window.T66.st.scene = sc; window.T66.st.order = 'new'; window.T66.st.a = 'A'; window.T66.st.i = 'A'; window.T66.st.u = 'B'; window.T66.render(); return true; }, sc)
				.then(() => p.page.evaluate(ROWS));
		}
		await p.ctx.close();
	};

	const openSp = async (roster, tab, w, ex) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: 900 }, EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		await sp.page.evaluate(({ roster, ids, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', tab);
		}, { roster, ids: IDS2, tab });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 }).catch(() => {});
		await sp.page.waitForTimeout(500);
		if (ex) await sp.page.evaluate(({ ex }) => { const O = UmaSkillDeckCore.outside; const key = O.recommendExcluded.keyOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))); ex.forEach((id) => O.recommendExcluded.set(key, id, true)); }, { ex });
		return sp;
	};
	/** 開いている小窓の行を読む。狭い幅では「スキル」のタブに切り替えてから、足した札が一覧の幅に収まっているか（はみ出し・幅0 が無いか）も見る */
	const readOpen = async (page) => {
		// 狭い幅の①②の小窓は「イベント」のタブから開く（一覧はまだ見えていない）ので、見えるかではなく、あるかで待つ
		await page.waitForSelector('[data-usd-el="ev-skills"]', { state: 'attached', timeout: 8000 });
		await page.waitForTimeout(400);
		const tab = await page.$('[data-usd-el="events-tab"][data-pane="1"]');
		if (tab && await tab.isVisible()) { await tab.click(); await page.waitForTimeout(300); }
		const rows = await page.evaluate(ROWS);
		const fit = await page.evaluate((sel) => {
			const ul = document.querySelector('[data-usd-el="ev-skills"]');
			const ur = ul.getBoundingClientRect();
			return Array.from(ul.querySelectorAll(sel)).map((t) => { const r = t.getBoundingClientRect(); return { w: Math.round(r.width), over: Math.round(r.right - ur.right) }; }).filter((x) => x.w <= 0 || x.over > 1);
		}, SRC_TAG);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);
		return { rows, fit };
	};
	/** ①のメンバーの列（育成ウマ娘は 0、カードは①の並びの位置＋1）から小窓を開いて読む */
	const readRoster = async (page, cardId) => {
		const key = cardId ? await page.evaluate((id) => deckRosterPanel.getRoster().cardIds.indexOf(id) + 1, cardId) : 0;
		await clickEvents(page, '#deck-roster-panel ', key);
		return readOpen(page);
	};
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	const diffOf = (want, got) => {
		const out = [];
		for (let i = 0; i < Math.max(want.length, got.length) && out.length < 4; i++) if (want[i] !== got[i]) out.push({ i, want: want[i], got: got[i] });
		return { wantLen: want.length, gotLen: got.length, diff: out };
	};

	await block('T70スキルの並び(1) キャラの小窓（①・uma-0272・uma-0175）: 固有 → 進化 → その他の白 → イベントで得るスキル（札「イベントスキル」）・区分ごとに確定 → 未選択・中は既定の並びの逆 = モックの新しい並び（375px・1280px）', async () => {
		await loadMock();
		assert(mockRows.uma0175.some((r) => /イベントスキル$/.test(r)) && mockRows.card0565.some((r) => /連続イベント\d+回目/.test(r)), 'T70(1) 前提: モックの新しい並びに札「イベントスキル」「連続イベントX回目」がある', { uma0175: mockRows.uma0175.length, card0565: mockRows.card0565.length });
		for (const w of [375, 1280]) {
			const sp = await openSp(R1, '0', w);
			const a = await readRoster(sp.page, null);
			await sp.ctx.close();
			const sp2 = await openSp(R2, '0', w);
			const b = await readRoster(sp2.page, null);
			assert(same(a.rows, mockRows.uma0272), 'T70(1) ' + w + 'px: uma-0272 の小窓の行の並びと札がモックと同じ', diffOf(mockRows.uma0272, a.rows));
			assert(same(b.rows, mockRows.uma0175), 'T70(1) ' + w + 'px: uma-0175 の小窓の行の並びと札がモックと同じ（イベントで得る5行に「イベントスキル」・未選択は区分の最後）', diffOf(mockRows.uma0175, b.rows));
			assert(a.fit.length === 0 && b.fit.length === 0, 'T70(1) ' + w + 'px: 札は一覧の幅に収まる', a.fit.concat(b.fit).slice(0, 3));
			assert(jsErrors(sp2.errors).length === 0, 'T70(1) ' + w + 'px: コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
			await sp2.ctx.close();
		}
	});

	await block('T70スキルの並び(2) サポカの小窓（①・card-0565・card-0564・card-0310〔グループ〕・card-0207）: 金（└白）→ その他の白 → 共通イベント・連続イベントの行に札「連続イベントX回目」= モックの新しい並び（375px・1280px）', async () => {
		if (!mockRows.card0565) await loadMock();
		for (const w of [375, 1280]) {
			const sp = await openSp(R1, '0', w);
			const got = {};
			for (const [sc, id] of [['card0565', 'card-0565'], ['card0564', 'card-0564'], ['group0310', 'card-0310']]) got[sc] = await readRoster(sp.page, id);
			const errs = jsErrors(sp.errors);
			await sp.ctx.close();
			const sp2 = await openSp(R3, '0', w);
			got.card0207 = await readRoster(sp2.page, 'card-0207');
			for (const sc of ['card0565', 'card0564', 'group0310', 'card0207']) {
				assert(same(got[sc].rows, mockRows[sc]), 'T70(2) ' + w + 'px: ' + sc + ' の小窓の行の並びと札がモックと同じ', diffOf(mockRows[sc], got[sc].rows));
				assert(got[sc].fit.length === 0, 'T70(2) ' + w + 'px: ' + sc + ' の札は一覧の幅に収まる', got[sc].fit.slice(0, 3));
			}
			assert(errs.concat(jsErrors(sp2.errors)).length === 0, 'T70(2) ' + w + 'px: コンソールのエラー0', errs.concat(jsErrors(sp2.errors)).slice(0, 3));
			await sp2.ctx.close();
		}
	});

	await block('T70スキルの並び(3) オススメサポのカード名の小窓（card-0540）と②の星取表の列のカードの小窓（card-0565）も同じ並び・「対象」の札はそのまま（375px・1280px）', async () => {
		if (!mockRows.out0540) await loadMock();
		for (const w of [375, 1280]) {
			const sp = await openSp(R4, '1', w, R4_EX_SKILLS);
			await sp.page.click('#deck-template-panel [data-usd-el="outside-open"]');
			await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
			const cards = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-card-main"]')).map((b) => b.getAttribute('data-card-id')));
			assert(cards.indexOf('card-0540') !== -1, 'T70(3) ' + w + 'px: 前提: オススメサポの結果に card-0540 がある', cards);
			if (cards.indexOf('card-0540') === -1) { await sp.ctx.close(); continue; }
			await sp.page.click('[data-usd-el="outside-modal"] [data-usd-el="outside-card-main"][data-card-id="card-0540"]');
			const o = await readOpen(sp.page);
			assert(same(o.rows, mockRows.out0540), 'T70(3) ' + w + 'px: オススメサポの card-0540 の小窓の行の並びと札（「対象」を含む）がモックと同じ', diffOf(mockRows.out0540, o.rows));
			assert(o.fit.length === 0, 'T70(3) ' + w + 'px: 札は一覧の幅に収まる', o.fit.slice(0, 3));
			assert(jsErrors(sp.errors).length === 0, 'T70(3) ' + w + 'px: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
			// ②の星取表の列（②のカードに card-0565 だけ。①は R1 のまま）
			const sp2 = await openSp(Object.assign({}, R1, { outsideOptions: { cards: ['card-0565'] } }), '1', w);
			for (let i = 0; i < 3 && (await sp2.page.getAttribute('#deck-template-panel [data-usd-el="factor-view"]', 'data-usd-view')) !== 'table'; i++) { await sp2.page.click('#deck-template-panel [data-usd-el="factor-view"]'); await sp2.page.waitForTimeout(300); }
			await sp2.page.click('#deck-template-panel [data-usd-el="factor-col-menu"][data-no="1"]');
			await sp2.page.waitForSelector('[data-usd-el="colmenu-events"]', { timeout: 5000 });
			await sp2.page.click('[data-usd-el="colmenu-events"]');
			const f = await readOpen(sp2.page);
			assert(same(f.rows, mockRows.card0565), 'T70(3) ' + w + 'px: ②の星取表の card-0565 の列の小窓も、①と同じ並びと札（モックと同じ）', diffOf(mockRows.card0565, f.rows));
			assert(jsErrors(sp2.errors).length === 0, 'T70(3) ' + w + 'px: ②のコンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
			await sp2.ctx.close();
		}
	});

	await block('T70スキルの並び(4) 同じスキルを連続イベントの2つの回で得るときの札は「連続イベント2・3回目」（card-0355）', async () => {
		const sp = await openSp({ umaId: 'uma-0272', cardIds: ['card-0355'] }, '0', 1280);
		// データで2つの回（step）に出るスキルを、検査の側でデータから引く（core の関数は使わない）
		const rows = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-card-event-skills.json'), 'utf8')).entries.find((r) => r.cardId === 'card-0355');
		const stepsOf = new Map();
		(rows.chain || []).forEach((ev) => JSON.stringify(ev).replace(/"skillId":"([^"]+)"/g, (_, id) => { if (!stepsOf.has(id)) stepsOf.set(id, new Set()); stepsOf.get(id).add(ev.step); return ''; }));
		const two = Array.from(stepsOf).filter(([, s]) => s.size === 2).map(([id, s]) => ({ id, tag: '連続イベント' + Array.from(s).sort((a, b) => a - b).join('・') + '回目' }));
		const r = await readRoster(sp.page, 'card-0355');
		const hit = two.map((x) => ({ id: x.id, tag: x.tag, row: r.rows.find((row) => row.split(' ')[1] === x.id) || null }));
		assert(two.length >= 1 && hit.every((x) => !x.row || x.row.split(' ')[3].split('|').indexOf(x.tag) !== -1) && hit.some((x) => x.row), 'T70(4) 2つの回で得るスキルの行の札は「連続イベントA・B回目」（回は小さい順・1つの札）', hit);
		assert(r.rows.every((row) => (row.split(' ')[3] || '').split('|').filter((t) => /^連続イベント/.test(t)).length <= 1), 'T70(4) 連続イベントの札は1行に1つ', r.rows);
		assert(jsErrors(sp.errors).length === 0, 'T70(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
