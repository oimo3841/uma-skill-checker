// 段F1（2026-10-22・C-190）の検査。run-smoke.mjs の末尾から register49() で呼ばれる（塊の見出しはすべて「段F1」で始まる。`npm run test:visual -- --only=段F1` で回せる）。
//
// (a) ②への追加の知らせ: 「<追加元の名前> N種を追加しました」の1行だけ・自動では消えない・×（押せる範囲44px・aria-label「閉じる」）・次の別の操作で消える・新しい知らせで置き換わる・role="status"
// (b) 距離ごとの除外: オススメサポの一覧でチェックを外したスキルは、その編成の距離の区分の除外（userData.recommendExcluded）に保存する
//     見出し「除外中 スキルN種（長距離）」＋？（1文だけ）・戻す・このセットのみ（以前の保存値 roster.outsideSkillExcluded。消さず・書き換えず・効かせ続ける）・すべて戻す・元に戻す
// (c) 脚質オススメへの効き方（区分の除外だけが効く。以前の保存値は効かない）・廃止した部品が無いこと
// スキル名・id・件数は検査の側に書かない（恒久ルール1。画面とデータから読む）。

import { noticeOf } from './lib/add-notice.mjs';

export async function register49(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const REAL = { umaId: 'uma-0001', cardIds: CARDS6 };
	const FILTER = { distance: 'medium', style: 'senko', surface: 'turf' };
	const FULL = Object.assign({}, REAL, { skillFilter: FILTER });
	const FULL_LONG = Object.assign({}, REAL, { skillFilter: { distance: 'long', style: 'nige', surface: 'turf' } });
	const NO_DIST = Object.assign({}, REAL, { skillFilter: { style: 'senko', surface: 'turf' } });
	const T = '#deck-template-panel ';
	const OM = '[data-usd-el="outside-modal"] ';
	const SM = '[data-usd-el="style-modal"] ';
	const sleep = (page, ms) => page.waitForTimeout(ms);
	const HELP_SENTENCE = (label) => 'ここで除外したスキルは、他の' + label + 'のレース条件でも除外されます。';
	const HELP_NONE = 'ここで除外したスキルは、距離を指定していないときも除外されます。';

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, o.userData || EMPTY);
		await sp.page.evaluate(({ roster, tab, theme }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
			try { localStorage.setItem('uma-tools-theme', theme); } catch (e) {}
		}, { roster: o.roster === undefined ? null : o.roster, tab: o.tab === undefined ? 1 : o.tab, theme: o.theme || 'light' });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sleep(sp.page, 300);
		return sp;
	};
	const userData = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData') || 'null'));
	const rawDraft = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
	const draftRoster = async (page) => JSON.parse(await rawDraft(page) || 'null');
	const draftIds = (page) => page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
	const undoCount = (page) => page.evaluate(() => UmaSkillDeckCore.undoCount());
	const waitOutside = (page) => page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
	const openOutside = async (page) => { await page.click(T + '[data-usd-el="outside-open"]'); await waitOutside(page); await sleep(page, 200); };
	const rowsOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]')).map((r) => ({ id: r.getAttribute('data-skill-id'), added: r.hasAttribute('data-usd-excluded') })));
	const rowCheck = (id) => OM + '[data-usd-el="outside-row"][data-skill-id="' + id + '"] input';
	const exHead = (page) => page.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-excl-toggle"]'); return b ? b.textContent.replace(/\s+/g, ' ').trim() : null; });
	const recalc = (page) => page.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-recalc"]'); return !!b && !b.hidden; });
	const labelOf = (page, key) => page.evaluate((k) => UmaSkillDeckCore.outside.recommendExcluded.label(k), key);
	const firstIds = async (page, n) => (await rowsOf(page)).filter((r) => !r.added).slice(0, n).map((r) => r.id);
	const recalcNow = async (page) => { await page.click(OM + '[data-usd-el="outside-recalc"]'); await waitOutside(page); await sleep(page, 200); };
	// 母集団（②に追加できる候補）に入っているか。戻したスキルが一覧に出るかは、計算し直した結果の組に依るので、母集団で見る
	const inPopulation = (page, id) => page.evaluate((id) => UmaSkillDeckCore.outside.populationOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))).ids.includes(id), id);

	/* ====================================================================
	 * (a) ②への追加の知らせ
	 * ==================================================================== */
	await block('段F1(a) 追加の知らせ: 条件で検索・テキストで検索・スクショで追加の確定は「<追加元> N種を追加しました」の1行だけ／自動では消えない／×（44px・「閉じる」）／role=status／1種だけの追加では出さない（今までどおり）', async () => {
		const sp = await openSp({ roster: FULL });
		const p = sp.page;
		const checkAll = async (ids) => { for (const id of ids) await p.click('[data-usd-el="skill-check"][value="' + id + '"]'); };
		const pickable = async () => p.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="skill-check"]:not(:disabled)')).slice(0, 12).map((i) => i.value));
		// 条件で検索
		await p.click(T + '[data-usd-act="editor-pick"]');
		await sleep(p, 300);
		const ids = await pickable();
		assert(ids.length >= 8, '段F1(a) 前提: 条件で検索の一覧に選べるスキルがある', ids.length);
		const u0 = await undoCount(p);
		await checkAll(ids.slice(0, 1));
		await p.click('[data-usd-el="picker-commit"]');
		await sleep(p, 300);
		let n = await noticeOf(p);
		assert(!n || !n.visible, '段F1(a) 1種だけの追加では、追加の知らせを出さない（元に戻すにも積まない。今までどおり）', n);
		await checkAll(ids.slice(1, 3));
		await p.click('[data-usd-el="picker-commit"]');
		await sleep(p, 300);
		n = await noticeOf(p);
		assert(!!n && n.visible && n.text === '条件で検索 2種を追加しました' && n.role === 'status', '段F1(a) 条件で検索: 知らせは「条件で検索 2種を追加しました」の1行だけ（role="status"）', n);
		assert(n.label === '閉じる' && n.w >= 44 && n.h >= 44, '段F1(a) ×のボタンは aria-label「閉じる」・押せる範囲 44px 以上（' + n.w + '×' + n.h + '）', n);
		assert(await undoCount(p) === u0 + 1, '段F1(a) 「元に戻す」は今までどおり1回積まれる', u0);
		await sleep(p, 3800);
		n = await noticeOf(p);
		assert(!!n && n.visible && n.text === '条件で検索 2種を追加しました', '段F1(a) 自動では消えない（ページの知らせが消える 2.5 秒を過ぎても出ている）', n);
		// 新しい知らせで置き換わる（同じ場所に1つだけ）
		await checkAll(ids.slice(3, 6));
		await p.click('[data-usd-el="picker-commit"]');
		await sleep(p, 300);
		n = await noticeOf(p);
		const cnt = await p.evaluate(() => document.querySelectorAll('[data-usd-el="add-notice"]').length);
		assert(!!n && n.visible && n.text === '条件で検索 3種を追加しました' && cnt === 1, '段F1(a) 新しい知らせが出たら置き換わる（「条件で検索 3種を追加しました」・知らせは1つだけ）', { n, cnt });
		// 次の別の操作（キー入力）で消える
		await p.keyboard.press('Shift');
		await sleep(p, 100);
		n = await noticeOf(p);
		assert(!!n && !n.visible, '段F1(a) キー入力で消える', n);
		await p.click('[data-usd-act="picker-close"]');
		await sleep(p, 300);
		// テキストで検索 → ×で消える
		const names = await p.evaluate((list) => list.map((id) => UmaSkillDeckCore.getSkillName(id)), ids.slice(6, 8));
		await p.click(T + '[data-usd-act="editor-pick-text"]');
		await p.fill('[data-usd-el="paste-input"]', names.join('\n'));
		await p.click('[data-usd-act="paste-run"]');
		await sleep(p, 300);
		await p.click('[data-usd-el="picker-commit"]');
		await sleep(p, 300);
		n = await noticeOf(p);
		assert(!!n && n.visible && n.text === 'テキストで検索 2種を追加しました', '段F1(a) テキストで検索: 「テキストで検索 2種を追加しました」', n);
		await p.click('[data-usd-el="add-notice-close"]');
		await sleep(p, 100);
		n = await noticeOf(p);
		assert(!!n && !n.visible, '段F1(a) ×を押すと消える', n);
		await p.click('[data-usd-act="picker-close"]');
		await sleep(p, 300);
		// スクショで追加（画像から読み取る）→ 別の操作（知らせ以外を押す）で消える
		const ids2 = ids.slice(8, 10);
		await p.evaluate((list) => {
			const rows = list.map((id) => { const nm = UmaSkillDeckCore.getSkillName(id); return { raw: nm, norm: nm, kind: 'exact', matchedId: id, matchedName: nm, candidates: [{ id: id, name: nm, distance: 0 }] }; });
			deckTemplateManager.openSkillRowsPickerForSelection(rows, { white: 2, gold: 0, unreadable: 0 }, {});
		}, ids2);
		await sleep(p, 300);
		await p.click('[data-usd-el="picker-commit"]');
		await sleep(p, 300);
		n = await noticeOf(p);
		assert(!!n && n.visible && n.text === 'スクショで追加 2種を追加しました', '段F1(a) スクショで追加: 「スクショで追加 2種を追加しました」', n);
		await p.click('[data-usd-el="picker-title"]');
		await sleep(p, 100);
		n = await noticeOf(p);
		assert(!!n && !n.visible, '段F1(a) 知らせ以外を押すと消える', n);
		await p.click('[data-usd-act="picker-close"]');
		const ids3 = await draftIds(p);
		assert(ids3.length === 1 + 2 + 3 + 2 + 2, '段F1(a) 追加されたスキルの数は知らせの数と一致する（1＋2＋3＋2＋2）', ids3.length);
		assert(jsErrors(sp.errors).length === 0, '段F1(a) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('段F1(a) 知らせの置き場所: 1280・390・360px × ライト・ダークで画面内に収まり、横スクロールなし・×は44px以上・文字と地のコントラスト 4.5:1 以上／オススメサポ・脚質オススメからの追加でも同じ形', async () => {
		for (const [w, theme] of [[1280, 'light'], [390, 'dark'], [360, 'light'], [390, 'light']]) {
			const sp = await openSp({ roster: FULL, w, theme, h: w === 1280 ? 900 : 844 });
			const p = sp.page;
			const tag = '段F1(a) ' + w + 'px・' + theme + ': ';
			// 脚質オススメから追加
			await p.click(T + '[data-usd-el="style-open"]');
			await p.waitForSelector(SM + '[data-usd-el="style-row"]');
			await sleep(p, 300);
			await p.click(SM + '[data-usd-el="style-add"]');
			await sleep(p, 500);
			let n = await noticeOf(p);
			assert(!!n && n.visible && /^脚質オススメ \d+種を追加しました$/.test(n.text), tag + '脚質オススメ: 「脚質オススメ N種を追加しました」だけ（追加しなかったものの内訳は出さない）', n);
			assert(n.box.l >= 0 && n.box.r <= n.vw && n.box.t >= 0 && n.box.b <= n.vh && n.w >= 44 && n.h >= 44, tag + '画面内に収まる・×は44px以上', n);
			const lay = await p.evaluate(() => { const el = document.querySelector('[data-usd-el="add-notice"]'); const cs = getComputedStyle(el); return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, color: cs.color, bg: cs.backgroundColor }; });
			assert(lay.sw <= lay.iw, tag + '横スクロールなし', lay);
			const rgb = (c) => (/rgba?\((\d+), (\d+), (\d+)/.exec(c) || []).slice(1, 4).map(Number);
			const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
			const x = lum(rgb(lay.color)), y = lum(rgb(lay.bg));
			const ratio = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
			assert(ratio >= 4.5, tag + '文字と地のコントラストは ' + ratio.toFixed(2) + ':1（4.5:1 以上）', lay);
			await p.click('[data-usd-el="add-notice-close"]');
			// オススメサポから追加
			await openOutside(p);
			const rows = (await rowsOf(p)).filter((r) => !r.added);
			await p.click(OM + '[data-usd-el="outside-add"]');
			await sleep(p, 500);
			const added = rows.length;
			n = await noticeOf(p);
			assert(!!n && n.visible && /^オススメサポ \d+種を追加しました$/.test(n.text), tag + 'オススメサポ: 「オススメサポ N種を追加しました」だけ', n);
			assert(n.box.l >= 0 && n.box.r <= n.vw && n.box.b <= n.vh, tag + '画面内に収まる', n);
			assert(added > 0 && jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('段F1(a) 知らせの範囲: エラー・警告・そのほかの知らせは今までどおりのトースト（消える・×なし）／Deck 単体ページの追加は今までどおりのトースト', async () => {
		const sp = await openSp({ roster: Object.assign({}, FULL, { umaId: '' }) });
		const p = sp.page;
		// 追加するスキルが無いときの知らせ（オススメサポは開けるので、脚質オススメで0種のとき）はトーストのまま。ここでは知らせ（#toast）が出て、追加の知らせは出ない
		await p.evaluate(() => UmaSkillDeckCore.performUndo());
		const n0 = await noticeOf(p);
		assert(!n0 || !n0.visible, '段F1(a) 追加していないときは、追加の知らせは出ない', n0);
		await sp.ctx.close();
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, EMPTY);
		const dn = await dk.page.evaluate(() => !!document.querySelector('[data-usd-el="add-notice"]'));
		assert(!dn, '段F1(a) Deck 単体ページには、追加の知らせの部品は作られない（②への追加の知らせは special だけ）', dn);
		assert(dk.errors.length === 0, '段F1(a) Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
	});

	/* ====================================================================
	 * (b) 距離ごとの除外
	 * ==================================================================== */
	await block('段F1(b) チェックを外す: 距離の区分の除外（userData.recommendExcluded）に保存・roster には書かない・schemaVersion は 7・再計算はしない（「再計算」が出る）／付け直すと消える／元に戻すは外す前の姿を丸ごと書き戻す（知らない区分も保つ）', async () => {
		const seed = Object.assign({}, EMPTY, { recommendExcluded: { future: ['2'], none: ['3'] } });
		const sp = await openSp({ roster: FULL, userData: seed });
		const p = sp.page;
		await openOutside(p);
		const [X, Y] = await firstIds(p, 2);
		const raw0 = await rawDraft(p);
		const u0 = await undoCount(p);
		await p.evaluate(() => { document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').__mark = 1; });
		await p.click(rowCheck(X));
		let d = await userData(p);
		assert(JSON.stringify(d.recommendExcluded) === JSON.stringify({ future: ['2'], none: ['3'], medium: [X] }) && d.schemaVersion === 7 && (await rawDraft(p)) === raw0, '段F1(b) 外すと、その区分（中距離）の除外として userData に書く（知らない区分は保つ・roster は書き換わらない・schemaVersion は 7）', d.recommendExcluded);
		assert(await undoCount(p) === u0 + 1, '段F1(b) 外すごとに「元に戻す」に1回積まれる', u0);
		const mark = await p.evaluate(() => document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').__mark);
		assert(mark === 1 && await recalc(p), '段F1(b) 再計算はしない（カードはそのまま）・「再計算」が出る', { mark });
		await p.click(rowCheck(Y));
		d = await userData(p);
		assert(JSON.stringify(d.recommendExcluded.medium) === JSON.stringify([X, Y]), '段F1(b) 続けて外すと、外した順に増える', d.recommendExcluded);
		await p.click(rowCheck(Y));
		d = await userData(p);
		assert(JSON.stringify(d.recommendExcluded.medium) === JSON.stringify([X]) && await undoCount(p) === u0 + 3, '段F1(b) 付け直すと、その除外だけが外れる（これも元に戻すに積む）', d.recommendExcluded);
		// 元に戻す（付け直し→外した→外した）の順に3回戻すと、最初の姿に丸ごと戻る
		for (let i = 0; i < 3; i++) await p.evaluate(() => UmaSkillDeckCore.performUndo());
		await sleep(p, 300);
		d = await userData(p);
		assert(JSON.stringify(d.recommendExcluded) === JSON.stringify(seed.recommendExcluded), '段F1(b) 元に戻すで、外す前の姿に丸ごと戻る（recommendExcluded が最初と一致）', d.recommendExcluded);
		assert(jsErrors(sp.errors).length === 0, '段F1(b) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 項目の無いデータ: 外して付け直すと項目ごと消える。元に戻すで項目が無かった姿へ
		const sp2 = await openSp({ roster: FULL });
		await openOutside(sp2.page);
		const [Z] = await firstIds(sp2.page, 1);
		await sp2.page.click(rowCheck(Z));
		assert(JSON.stringify((await userData(sp2.page)).recommendExcluded) === JSON.stringify({ medium: [Z] }), '段F1(b) 項目の無いデータで外すと、項目ができる', true);
		await sp2.page.click(rowCheck(Z));
		assert(!('recommendExcluded' in (await userData(sp2.page))), '段F1(b) 付け直すと項目ごと消える', Object.keys(await userData(sp2.page)));
		await sp2.page.evaluate(() => UmaSkillDeckCore.performUndo());
		assert(JSON.stringify((await userData(sp2.page)).recommendExcluded) === JSON.stringify({ medium: [Z] }), '段F1(b) 付け直しを元に戻すと、外した姿に戻る', true);
		await sp2.ctx.close();
	});

	await block('段F1(b) 見出し「除外中 スキルN種（区分）」と？: 区分の名前を括弧に（長距離・距離指定なし）／？は見出しの右・押すと1文だけ（区分の名前は見出しと同じ）／戻す（元に戻すに積む）／カードだけのときは？なし', async () => {
		for (const [roster, key, help] of [[FULL_LONG, 'long', null], [NO_DIST, 'none', HELP_NONE]]) {
			const sp = await openSp({ roster });
			const p = sp.page;
			const label = await labelOf(p, key);
			const tag = '段F1(b) ' + label + ': ';
			await openOutside(p);
			assert(await exHead(p) === null, tag + '除外が0件のとき「除外中」は出ない', await exHead(p));
			const [X, Y] = await firstIds(p, 2);
			await p.click(rowCheck(X)); await p.click(rowCheck(Y));
			await recalcNow(p);
			assert(await exHead(p) === '除外中 スキル2種（' + label + '） ▾', tag + '見出しは「除外中 スキル2種（' + label + '） ▾」', await exHead(p));
			const geo = await p.evaluate(() => { const t = document.querySelector('[data-usd-el="outside-excl-toggle"]').getBoundingClientRect(), h = document.querySelector('[data-usd-el="outside-excl-help"]'), a = document.querySelector('[data-usd-el="outside-restore-all"]').getBoundingClientRect();
				const r = h ? h.getBoundingClientRect() : null; return { has: !!h, label: h ? h.getAttribute('aria-label') : null, text: h ? h.textContent : null, right: !!r && r.left >= t.right - 1 && r.right <= a.left + 1, sameRow: !!r && Math.abs((r.top + r.bottom) / 2 - (t.top + t.bottom) / 2) < 12 }; });
			assert(geo.has && geo.right && geo.sameRow && geo.text === '?', tag + '？のボタンは見出しの右（「すべて戻す」の左）', geo);
			await p.click('[data-usd-el="outside-excl-help"]');
			await sleep(p, 300);
			const pop = await p.evaluate(() => { const t = document.querySelector('[data-usd-el="outside-excl-help-text"]'); return { text: t ? t.textContent : null, kids: t && t.parentElement ? t.parentElement.children.length : null }; });
			assert(pop.text === (help || HELP_SENTENCE(label)) && pop.kids === 1, tag + '？を押すと、1文だけを出す（「' + (help || HELP_SENTENCE(label)) + '」）。ほかの説明は足さない', pop);
			await p.keyboard.press('Escape');
			await sleep(p, 300);
			// 一覧: ［名前・戻す］。このセットのみの札は無い
			await p.click(OM + '[data-usd-el="outside-excl-toggle"]');
			const list = await p.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-excl-skill"]')).map((r) => ({ id: r.getAttribute('data-skill-id'), scope: r.getAttribute('data-scope'), scopeTag: !!r.querySelector('[data-usd-el="outside-excl-scope"]'), btn: r.querySelector('[data-usd-el="outside-restore-skill"]').textContent })));
			assert(list.length === 2 && list.every((r) => r.scope === 'dist' && !r.scopeTag && r.btn === '戻す') && list.map((r) => r.id).join() === [X, Y].join(), tag + '一覧は［名前・戻す］（区分の除外には「このセットのみ」は付かない）', list);
			const u0 = await undoCount(p);
			await p.click(OM + '[data-usd-el="outside-restore-skill"][data-skill-id="' + X + '"]');
			await waitOutside(p); await sleep(p, 300);
			const d = await userData(p);
			assert(JSON.stringify(d.recommendExcluded[key]) === JSON.stringify([Y]) && await undoCount(p) === u0 + 1 && await inPopulation(p, X) && !(await inPopulation(p, Y)), tag + '「戻す」で区分の除外から外れ（母集団に戻る）、元に戻すに1回積まれ、その場で計算し直される', d.recommendExcluded);
			assert(await exHead(p) === '除外中 スキル1種（' + label + '） ▴', tag + '見出しの種数が減る（一覧は開いたまま）', await exHead(p));
			await sp.ctx.close();
		}
		// カードだけ: ？は出ない
		const sp = await openSp({ roster: FULL });
		await openOutside(sp.page);
		const c0 = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').getAttribute('data-card-id'));
		await sp.page.click(OM + '[data-usd-el="outside-exclude"][data-card-id="' + c0 + '"]');
		await waitOutside(sp.page); await sleep(sp.page, 200);
		const only = await sp.page.evaluate(() => ({ head: document.querySelector('[data-usd-el="outside-excl-toggle"]').textContent.replace(/\s+/g, ' ').trim(), help: !!document.querySelector('[data-usd-el="outside-excl-help"]') }));
		assert(only.head === '除外中 カード1枚 ▾' && !only.help, '段F1(b) カードだけのとき「除外中 カード1枚」・？は出ない（スキルの説明なので）', only);
		await sp.ctx.close();
	});

	await block('段F1(b) 以前の保存値（roster.outsideSkillExcluded）: 消さず・書き換えず・これまでどおり効かせ続け、除外中の一覧に「このセットのみ」と小さく付けて出す／「戻す」で外したときだけ保存値を消す／開いただけでは1バイトも変わらない', async () => {
		// 以前の保存値を持つ編成（下書きの roster）。除外するスキルは、小窓を開いたときのスキルの一覧から選ぶ
		const probe = await openSp({ roster: FULL });
		await openOutside(probe.page);
		const [A, B, C] = await firstIds(probe.page, 3);
		await probe.ctx.close();
		const legacy = Object.assign({}, FULL, { outsideSkillExcluded: [A, B, 'no-such-skill'] });
		const sp = await openSp({ roster: legacy });
		const p = sp.page;
		const rawD = await rawDraft(p), rawU = await p.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
		await openOutside(p);
		assert((await rawDraft(p)) === rawD && (await p.evaluate(() => localStorage.getItem('umaSkillDeck:userData'))) === rawU, '段F1(b) 開いただけでは、保存データ（roster・userData）は1バイトも変わらない', true);
		const rows = (await rowsOf(p)).map((r) => r.id);
		assert(!rows.includes(A) && !rows.includes(B) && rows.includes(C), '段F1(b) 以前の保存値のスキルは、これまでどおり母集団から除かれる（一覧に出ない）', rows.length);
		assert(await exHead(p) === '除外中 スキル2種（中距離） ▾', '段F1(b) 見出しの種数に数える（引けない古いIDは数えない）', await exHead(p));
		await p.click(OM + '[data-usd-el="outside-excl-toggle"]');
		const list = await p.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-excl-skill"]')).map((r) => ({ id: r.getAttribute('data-skill-id'), scope: r.getAttribute('data-scope'), tag: (r.querySelector('[data-usd-el="outside-excl-scope"]') || {}).textContent || null })));
		assert(list.length === 2 && list.every((r) => r.scope === 'set' && r.tag === 'このセットのみ'), '段F1(b) 一覧の各行に小さく「このセットのみ」が付く', list);
		const sz = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-usd-el="outside-excl-scope"]')).fontSize));
		assert(sz <= 12, '段F1(b) 「このセットのみ」は小さな文字（' + sz + 'px）', sz);
		// 新しく外したものは区分の除外へ。以前の保存値はそのまま
		await p.click(rowCheck(C));
		assert(JSON.stringify((await draftRoster(p)).outsideSkillExcluded) === JSON.stringify([A, B, 'no-such-skill']) && JSON.stringify((await userData(p)).recommendExcluded) === JSON.stringify({ medium: [C] }), '段F1(b) 新しくチェックを外したスキルは区分の除外へ。以前の保存値は書き換わらない', await draftRoster(p));
		await p.click(rowCheck(C));
		// 戻す: 保存値だけが消える（そのIDだけ・古いIDは残る）
		await p.click(OM + '[data-usd-el="outside-restore-skill"][data-skill-id="' + A + '"]');
		await waitOutside(p); await sleep(p, 300);
		let dr = await draftRoster(p);
		assert(JSON.stringify(dr.outsideSkillExcluded) === JSON.stringify([B, 'no-such-skill']) && !('recommendExcluded' in (await userData(p))) && await inPopulation(p, A) && !(await inPopulation(p, B)), '段F1(b) 「戻す」で、その保存値だけが消える（区分の除外には触らない）。戻したスキルは母集団に戻る', dr.outsideSkillExcluded);
		await p.click(OM + '[data-usd-el="outside-restore-skill"][data-skill-id="' + B + '"]');
		await waitOutside(p); await sleep(p, 300);
		dr = await draftRoster(p);
		assert(JSON.stringify(dr.outsideSkillExcluded) === JSON.stringify(['no-such-skill']), '段F1(b) もう1つ戻すと、古いIDだけが残る（書き換えない）', dr.outsideSkillExcluded);
		assert(jsErrors(sp.errors).length === 0, '段F1(b) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 区分の除外と以前の保存値の両方: 同じIDは1種と数える
		const both = await openSp({ roster: Object.assign({}, FULL, { outsideSkillExcluded: [A] }), userData: Object.assign({}, EMPTY, { recommendExcluded: { medium: [A, B] } }) });
		await openOutside(both.page);
		assert(await exHead(both.page) === '除外中 スキル2種（中距離） ▾', '段F1(b) 区分の除外（A・B）と以前の保存値（A）が重なるときは、同じスキルを1種と数える（2種）', await exHead(both.page));
		await both.ctx.close();
	});

	await block('段F1(b) すべて戻す: カードの除外・区分の除外・以前の保存値をまとめて外し、その場で計算し直す／区分の除外の分は元に戻すに1回だけ積み、元に戻せる', async () => {
		const probe = await openSp({ roster: FULL });
		await openOutside(probe.page);
		const [A, B, C] = await firstIds(probe.page, 3);
		await probe.ctx.close();
		const sp = await openSp({ roster: Object.assign({}, FULL, { outsideSkillExcluded: [C] }), userData: Object.assign({}, EMPTY, { recommendExcluded: { medium: [A, B], long: [A] } }) });
		const p = sp.page;
		await openOutside(p);
		assert(await exHead(p) === '除外中 スキル3種（中距離） ▾', '段F1(b) 前提: 区分の除外2種と以前の保存値1種で「スキル3種」', await exHead(p));
		const u0 = await undoCount(p);
		await p.click(OM + '[data-usd-el="outside-restore-all"]');
		await waitOutside(p); await sleep(p, 300);
		const d = await userData(p), dr = await draftRoster(p);
		assert(JSON.stringify(d.recommendExcluded) === JSON.stringify({ long: [A] }) && !('outsideSkillExcluded' in dr) && await exHead(p) === null, '段F1(b) すべて戻すで、この区分（中距離）の除外と以前の保存値が外れる（ほかの区分〔長距離〕は触らない）。「除外中」は消える', { ud: d.recommendExcluded, dr: dr.outsideSkillExcluded });
		assert(await undoCount(p) === u0 + 1, '段F1(b) 区分の除外の分は、元に戻すに1回だけ積まれる（種数ぶんではない）', u0);
		const rows = (await rowsOf(p)).map((r) => r.id);
		assert([A, B, C].every((id) => rows.includes(id)), '段F1(b) 戻したスキルがすべて一覧に戻る', rows.length);
		await p.evaluate(() => UmaSkillDeckCore.performUndo());
		await sleep(p, 400);
		assert(JSON.stringify((await userData(p)).recommendExcluded) === JSON.stringify({ medium: [A, B], long: [A] }), '段F1(b) 元に戻すで、区分の除外が戻る', (await userData(p)).recommendExcluded);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (c) 脚質オススメへの効き方・廃止した部品
	 * ==================================================================== */
	await block('段F1(c) 脚質オススメ: 区分の除外に入っているスキルは隠さず、チェックを外して「除外中（長距離）」と添える／押せる見た目のまま・押すと「長距離で除外中のため選べません」／以前の保存値（roster）は効かない／解除は、オススメサポの「除外中」の「戻す」だけ', async () => {
		const probe = await openSp({ roster: FULL_LONG });
		await probe.page.click(T + '[data-usd-el="style-open"]');
		await probe.page.waitForSelector(SM + '[data-usd-el="style-row"]');
		await sleep(probe.page, 300);
		const ons = await probe.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="style-modal"] [data-usd-el="style-row"]')).filter((x) => x.getAttribute('data-state') === 'on').slice(0, 2).map((x) => x.getAttribute('data-skill-id')));
		await probe.ctx.close();
		const [S1, S2] = ons;
		assert(!!S1 && !!S2, '段F1(c) 前提: 脚質オススメに追加できる行がある', ons);
		const sp = await openSp({ roster: Object.assign({}, FULL_LONG, { outsideSkillExcluded: [S2] }), userData: Object.assign({}, EMPTY, { recommendExcluded: { long: [S1] } }) });
		const p = sp.page;
		const label = await labelOf(p, 'long');
		await p.click(T + '[data-usd-el="style-open"]');
		await p.waitForSelector(SM + '[data-usd-el="style-row"]');
		await sleep(p, 300);
		const rows = await p.evaluate((ids) => ids.map((id) => { const r = document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-row"][data-skill-id="' + id + '"]'); return r ? { state: r.getAttribute('data-state'), reason: r.getAttribute('data-reason'), checked: r.querySelector('input').checked, tag: r.querySelector('[data-usd-el="style-row-pt"]').textContent, dis: r.querySelector('input').disabled } : null; }), [S1, S2]);
		assert(rows[0] && rows[0].state === 'gray' && rows[0].reason === 'excluded' && !rows[0].checked && rows[0].tag === '除外中（' + label + '）' && !rows[0].dis, '段F1(c) 区分の除外のスキルは、隠れず、チェックが外れて「除外中（' + label + '）」と出る（押せる見た目のまま）', rows[0]);
		assert(rows[1] && rows[1].state === 'on' && rows[1].checked, '段F1(c) 以前の保存値（このセットのみ）のスキルは、脚質オススメには効かない（今までどおり選べる）', rows[1]);
		await p.click(SM + '[data-usd-el="style-row"][data-skill-id="' + S1 + '"] [data-usd-el="style-check"]', { force: true });
		await sleep(p, 250);
		const toastTxt = await p.evaluate(() => document.getElementById('toast-message').textContent);
		assert(toastTxt === label + 'で除外中のため選べません', '段F1(c) 押すと「' + label + 'で除外中のため選べません」の1行を出す', toastTxt);
		const still = await p.evaluate((id) => document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-row"][data-skill-id="' + id + '"] input').checked, S1);
		assert(!still, '段F1(c) 押してもチェックは付かない', still);
		const info = await p.evaluate((id) => { document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-row"][data-skill-id="' + id + '"] .usd-sty-name').click(); return true; }, S1);
		await sleep(p, 300);
		const act = await p.evaluate(() => ({ toggle: !!document.querySelector('[data-usd-el="info-recommend-toggle"]'), action: !!document.querySelector('.usd-info-action') }));
		assert(info && !act.toggle && !act.action, '段F1(c) 解除は説明の小窓からはできない（切り替えは無い）', act);
		assert(jsErrors(sp.errors).length === 0, '段F1(c) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('段F1(c) 廃止した部品が無い: 「個別に除外」の小窓・区分のピル・説明の小窓の「（区分）のオススメから外す」切り替えは、コードにも画面にも残っていない', async () => {
		const src = fs.readFileSync(path.join(REPO_ROOT, 'js/uma-skill-deck-core.js'), 'utf8');
		const gone = ['個別に除外', 'outside-individual', 'info-recommend-toggle', 'recommendExcludeAction', 'のオススメから外す\'', 'のオススメに戻す\''];
		const left = gone.filter((s) => src.indexOf(s) !== -1);
		assert(left.length === 0, '段F1(c) コアのコードに、廃止した部品の印が残っていない', left);
		const sp = await openSp({ roster: FULL });
		await openOutside(sp.page);
		await sp.page.click(OM + '[data-usd-el="outside-exclude-btn"]');
		await sp.page.waitForSelector('[data-usd-el="outside-exclude-chip"]');
		const dom = await sp.page.evaluate(() => ({ chips: document.querySelectorAll('[data-usd-el="outside-exclude-chip"]').length, ind: !!document.querySelector('[data-usd-el="outside-individual-btn"]'), tabs: document.querySelectorAll('[data-usd-el="outside-individual-tab"]').length, text: document.querySelector('.usd-info-pop').textContent }));
		assert(dom.chips === 4 && !dom.ind && dom.tabs === 0 && !/個別に除外/.test(dom.text), '段F1(c) 除外の欄は押しボタン4つだけ（「個別に除外」も区分のピルも無い）', dom);
		await sp.ctx.close();
	});
}
