// サポカの並びと再計算（T67・2026-11-02）の検査。
// run-smoke.mjs の末尾から register91() で呼ばれる（塊の見出しはすべて「T67サポカの並び」で始まる。`npm run test:visual -- --only=T67サポカの並び` で回せる）。
//
// 決め:
//  (1) ①本育成編成の6枚と、②因子周回のカード（オススメサポで「追加」したカード。②のパネルと星取表の列）を、結合画像の上段のカードの並び（T37）と同じ規則で並べる
//      ＝種別の順（typeOrder の小さい順。友人とグループは同じ番号）→ 同じ種別の中は ID の降順。①の枠の番号（1〜6）は並んだ順に振り直し、空いている枠は後ろ。
//      保存済みのセットも開いたときに並んで見える（保存値は書き換えない。ルール28）。イベントの選択・列のソートは、並びが変わってもそのカードに付いたまま。
//  (2) オススメサポの「再計算」は、計算中のほかは状態が変わっていなくても出ていて押せる。押すと計算し直す。
//  (3) ①のメンバーの列・②のカードの列のメニューのボタンの読み上げ名の末尾は「（ソート中）」（「（並べ替え中）」ではない）。
// 期待の並びは検査の側でデータ（support-cards.json の typeOrder と id）から作る（core の関数は使わない）。カード名は書かない（恒久ルール1。id だけ）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register91(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const R = '#deck-roster-panel ';
	const MH = '[data-usd-el="roster-modal-host"] ';
	const OM = '[data-usd-el="outside-modal"] ';
	const BAR = '#deck-set-bar ';
	const REP1 = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417', '125', '124', '6', '27', '33', '230', '16', '23', '147', '117', '118', '145'];
	// ①: 種類の違うカードをばらばらの順に（3枠目は空き）。card-0565 と card-0281 は同じ種別（ID の降順の確かめ）、card-0402 と card-0499 も同じ種別
	const MIXED = ['card-0565', 'card-0402', null, 'card-0249', 'card-0248', 'card-0281'];
	const ADD1 = 'card-0300';     // あとから①に入れるカード（card-0249 と同じ種別・ID が大きいので、その前に入る）
	const KEEP = 'card-0565';     // イベントの選択と列のソートを付けておくカード（ADD1 を入れると枠が1つ後ろへ動く）
	// ②: 保存の順（並んでいない）。グループのカード card-0310 を含む
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const cardsData = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8')).entries;
	const cardOf = (id) => cardsData.find((c) => c.id === id) || {};
	const titleOf = (id) => cardOf(id).title || '';
	/** 期待の並び（検査の側の式）: typeOrder（無ければ後ろ）→ id の降順 */
	const expectSorted = (ids) => ids.filter(Boolean).slice().sort((a, b) => {
		const oa = typeof cardOf(a).typeOrder === 'number' ? cardOf(a).typeOrder : 99, ob = typeof cardOf(b).typeOrder === 'number' ? cardOf(b).typeOrder : 99;
		return (oa - ob) || (a < b ? 1 : a > b ? -1 : 0);
	});

	/** special.html を、①（下書きの編成）と②の下書きを入れて開く（blocks-84 と同じ作り）。tab: '0'＝①・'1'＝② */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 900 }, o.userData || EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		await sp.page.evaluate(({ roster, ids, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', tab);
		}, { roster: o.roster === undefined ? null : o.roster, ids: o.ids || REP1, tab: o.tab || '0' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 }).catch(() => {});
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || '{}'));
	const rawUd = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
	/** ①のタイル（並び・枠の番号・種別）と、画面の編成（getRoster）の cardIds */
	const rosterTiles = (page) => page.evaluate(() => ({
		ids: deckRosterPanel.getRoster().cardIds,
		tiles: Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="roster-tile"]')).map((t) => {
			const main = t.querySelector('[data-usd-el="pick-card"]');
			return { no: t.getAttribute('data-no'), index: t.getAttribute('data-index'), empty: t.classList.contains('usd-roster-tile--empty'), title: main ? main.getAttribute('title') : '', aria: main ? main.getAttribute('aria-label') : '' };
		})
	}));
	/** ①の表のカードの列見出し（左から） */
	const rosterCols = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"][data-no]')).map((b) => ({
		key: b.getAttribute('data-member-key'), no: b.getAttribute('data-no'), label: b.getAttribute('aria-label') || '', sorted: b.getAttribute('data-sorted'), unsel: b.getAttribute('data-unselected') })));
	/** ②のパネルのタイル（data-card-id）と、星取表の列見出し */
	const factorTiles = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-card-tile"]')).map((t) => t.getAttribute('data-card-id') || ''));
	const factorCols = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-col-menu"][data-no]')).map((b) => ({
		key: b.getAttribute('data-member-key'), no: b.getAttribute('data-no'), label: b.getAttribute('aria-label') || '', sorted: b.getAttribute('data-sorted') })));
	const setView = async (page, want) => {
		for (let i = 0; i < 3 && (await page.getAttribute(T + '[data-usd-el="factor-view"]', 'data-usd-view')) !== want; i++) { await page.click(T + '[data-usd-el="factor-view"]'); await page.waitForTimeout(300); }
	};
	/** タイルの title（題＋名前）が、そのカードのものか */
	const isCard = (label, id) => label.indexOf(titleOf(id)) !== -1;
	/** 列見出しの読み上げ名（「N枚目：<名前>（<種別>）のメニュー…」。名前だけで題は無い）が、そのカードのものか（材料はグループでないカードだけ） */
	const isCol = (label, id) => label.indexOf('枚目：' + cardOf(id).charaName + '（') !== -1;
	/** ①の空きの枠 index にカード id を入れる（①のカード選択の小窓） */
	const pickInto = async (page, index, id) => {
		await page.click(R + '[data-usd-act="pick-card"][data-index="' + index + '"]');
		await page.waitForSelector(MH + '[data-usd-el="modal"]', { timeout: 5000 });
		await page.fill(MH + '[data-usd-el="find"]', titleOf(id));
		await page.waitForTimeout(250);
		await page.click(MH + '[data-usd-act="take"][data-entry-id="' + id + '"]');
		await page.waitForTimeout(400);
	};
	const waitOutside = (page) => page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });

	/* ---- (1) ①の並び ---- */
	await block('T67サポカの並び(1a) ①に種類の違うカードをばらばらの順で置く → 種別の順・同じ種別の中は ID の降順・空きは後ろ・枠の番号は1から振り直し・表の列も同じ並び・保存値は開いただけでは変わらない', async () => {
		const sp = await openSp({ roster: { umaId: 'uma-0179', cardIds: MIXED }, tab: '0' });
		const want = expectSorted(MIXED);
		const rawBefore = JSON.stringify((await draft(sp.page)).cardIds);
		const t = await rosterTiles(sp.page);
		assert(JSON.stringify(t.ids) === JSON.stringify(want.concat([null])), 'T67(1a) 画面の6枠は種別の順→ID の降順、空きは後ろ', { got: t.ids, want });
		assert(t.tiles.length === 6 && t.tiles.every((x, i) => x.no === String(i + 1) && x.index === String(i)) && t.tiles.slice(0, 5).every((x, i) => !x.empty && x.aria.indexOf((i + 1) + '枚目：') === 0 && isCard(x.title, want[i])) && t.tiles[5].empty,
			'T67(1a) タイルは並んだ順に1〜6枚目（読み上げ「N枚目：…」も振り直し）・空きの枠は6枚目', t.tiles);
		const cols = await rosterCols(sp.page);
		// 空きの枠の列見出しはボタンでない（data-no を持たない）ので、入っている5枚の列だけ
		assert(cols.length === 5 && cols.every((c, i) => c.no === String(i + 1) && isCol(c.label, want[i]) && c.label.indexOf((i + 1) + '枚目：') === 0),
			'T67(1a) ①の表のカードの列も同じ並び・同じ番号', cols.map((c) => [c.no, c.label]));
		assert(JSON.stringify((await draft(sp.page)).cardIds) === rawBefore, 'T67(1a) 開いただけでは保存値（下書きの cardIds）は書き換えない（ルール28）', { before: rawBefore, now: (await draft(sp.page)).cardIds });
		assert(jsErrors(sp.errors).length === 0, 'T67(1a) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T67サポカの並び(1b) 保存済みのセット（並んでいない順）を開くと並んで見える・保存データは1バイトも変わらない', async () => {
		const seed = { schemaVersion: 7, records: [], customSkills: [], templates: [
			{ templateId: 't1', name: 'S1', skillIds: REP1.slice(0, 3), baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }],
			rosters: [{ rosterId: 'r1', name: 'S1', umaId: 'uma-0179', star: 3, awakeningLevel: 5, cardIds: MIXED.slice(), outsideOptions: { cards: SAVED5.slice() }, createdAt: 'x', updatedAt: 'x' }] };
		const sp = await openSp({ userData: seed, roster: null, tab: '0' });
		await sp.page.click(BAR + '[data-usd-act="set-list"]');
		const already = await sp.page.evaluate(() => { const i = document.querySelector('[data-usd-el="set-list"] input[value="t1"]'); return !!i && i.checked; });
		if (already) await sp.page.keyboard.press('Escape'); else await sp.page.click('[data-usd-el="set-list"] input[value="t1"]');
		await sp.page.waitForTimeout(500);
		const t = await rosterTiles(sp.page);
		assert(JSON.stringify(t.ids) === JSON.stringify(expectSorted(MIXED).concat([null])) && t.tiles.slice(0, 5).every((x, i) => isCard(x.title, expectSorted(MIXED)[i])),
			'T67(1b) 保存済みのセットの①は、開くと種別の順→ID の降順で見える', t.ids);
		await sp.page.evaluate(() => selectStepTab(1));
		await sp.page.waitForTimeout(500);
		const f = await factorTiles(sp.page);
		assert(f.join() === expectSorted(SAVED5).concat(['']).join(), 'T67(1b) 保存済みのセットの②のカードも、種別の順→ID の降順（友人とグループは同じ種別・ID の降順）・空きは後ろ', { got: f, want: expectSorted(SAVED5) });
		assert((await rawUd(sp.page)) === JSON.stringify(seed), 'T67(1b) セットを開いて①②を見ても、保存データは1バイトも変わらない（ルール28）', (await rawUd(sp.page) || '').length);
		assert(jsErrors(sp.errors).length === 0, 'T67(1b) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T67サポカの並び(1c) ①にカードを入れると並べ直し、番号を振り直す・イベントの選択と列のソートはそのカードに付いたまま・読み上げ名の末尾は「（ソート中）」', async () => {
		// KEEP のイベントのうち、選ぶ必要のある（選択肢が2つ以上の）ものを1つ選んでおく。鍵はデータから core で引く（選択肢の中身は書かない）
		const pre = await openSp({ roster: { umaId: 'uma-0179', cardIds: MIXED }, tab: '0' });
		const ev = await pre.page.evaluate((keep) => {
			const res = UmaSkillDeckCore.computeRosterSkills(deckRosterPanel.getRoster(), { eventChoices: {}, autoChoose: false });
			const e = (res.events || []).find((x) => x.cardId === keep && x.choices && x.choices.length >= 2);
			return e ? { key: e.eventKey, n: e.choices.length } : null;
		}, KEEP);
		await pre.ctx.close();
		assert(!!ev && ev.key.indexOf('card:' + KEEP + '#') === 0, 'T67(1c) 前提: ' + KEEP + ' に選択肢が2つ以上のイベントがある', ev);
		const sp = await openSp({ roster: { umaId: 'uma-0179', cardIds: MIXED, eventChoices: { [ev.key]: 1 } }, tab: '0' });
		const before = await rosterCols(sp.page);
		const kb = before.find((c) => isCol(c.label, KEEP));
		// KEEP の列でソート（列見出しのメニューの「ソート」）
		await sp.page.click(R + '[data-usd-el="col-menu-btn"][data-member-key="' + kb.key + '"]');
		await sp.page.waitForSelector('[data-usd-el="colmenu-sort"]', { timeout: 5000 });
		await sp.page.click('[data-usd-el="colmenu-sort"]');
		await sp.page.waitForTimeout(300);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		const s1 = (await rosterCols(sp.page)).find((c) => c.key === kb.key);
		assert(!!s1 && s1.sorted === '1' && /のメニュー.*（ソート中）$/.test(s1.label) && s1.label.indexOf('並べ替え中') === -1, 'T67(3) ①のメンバーの列: ソート中の読み上げ名の末尾は「（ソート中）」', s1 && s1.label);
		// 空きの枠（6枚目）に ADD1 を入れる → ADD1 は1枚目、KEEP は1つ後ろの枠へ
		await pickInto(sp.page, 5, ADD1);
		const want = expectSorted(MIXED.concat([ADD1]));
		const t = await rosterTiles(sp.page);
		assert(JSON.stringify(t.ids) === JSON.stringify(want) && t.tiles.every((x, i) => x.no === String(i + 1) && isCard(x.title, want[i]) && x.aria.indexOf((i + 1) + '枚目：') === 0),
			'T67(1c) 入れたカードも種別の順→ID の降順の位置に入り、枠の番号は1〜6に振り直す', { got: t.ids, want });
		const saved = await draft(sp.page);
		assert(JSON.stringify(saved.cardIds) === JSON.stringify(want), 'T67(1c) 利用者が変えたときは、並んだ順で保存する', saved.cardIds);
		const after = await rosterCols(sp.page);
		const ka = after.find((c) => isCol(c.label, KEEP));
		assert(!!ka && ka.no === String(want.indexOf(KEEP) + 1) && ka.no !== kb.no, 'T67(1c) 前提: ' + KEEP + ' の列は枠が動いた（' + kb.no + ' → ' + (ka && ka.no) + '）', { kb, ka });
		assert(ka.sorted === '1' && after.filter((c) => c.sorted === '1').length === 1 && /（ソート中）$/.test(ka.label), 'T67(1c) 列のソートは ' + KEEP + ' の列（動いた先）に付いたまま・ほかの列には付かない', after.map((c) => [c.no, c.sorted]));
		assert(saved.eventChoices && saved.eventChoices[ev.key] === 1 && ka.unsel === kb.unsel, 'T67(1c) イベントの選択は ' + KEEP + ' に付いたまま（保存の鍵は card:<ID>・列の「未選択」の数も動いた先で同じ）', { choices: saved.eventChoices, unsel: [kb.unsel, ka.unsel] });
		// 外しても並びは詰まる（空きは後ろ）
		await sp.page.click(R + '[data-usd-el="clear-card"][data-index="0"]');
		await sp.page.waitForTimeout(300);
		const t2 = await rosterTiles(sp.page);
		assert(JSON.stringify(t2.ids) === JSON.stringify(want.slice(1).concat([null])), 'T67(1c) 1枚目を外すと残りが前に詰まり、空きは6枚目', t2.ids);
		assert(jsErrors(sp.errors).length === 0, 'T67(1c) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T67サポカの並び(1d) ②にオススメサポから「追加」→ パネルと星取表の列が種別の順→ID の降順・保存は提案の順のまま・②の列のソートの読み上げ名の末尾は「（ソート中）」', async () => {
		const sp = await openSp({ roster: { umaId: 'uma-0179', cardIds: MIXED }, tab: '1', ids: ['2'] });
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		await waitOutside(sp.page);
		const rec = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]')).map((c) => c.getAttribute('data-card-id')));
		await sp.page.click(OM + '[data-usd-el="outside-add"]');
		await sp.page.waitForTimeout(500);
		const raw = ((await draft(sp.page)).outsideOptions || {}).cards || [];
		const want = expectSorted(raw);
		assert(rec.length >= 2 && raw.length === rec.length && rec.every((id) => raw.indexOf(id) !== -1), 'T67(1d) 前提: 「追加」で提案のカードが保存された', { rec, raw });
		assert(JSON.stringify(want) !== JSON.stringify(raw), 'T67(1d) 前提: 保存の順（提案の順）は種別の順と違う（並べ替えが見える材料）', { raw, want });
		const f = await factorTiles(sp.page);
		assert(f.filter(Boolean).join() === want.join(), 'T67(1d) ②のパネルは種別の順→ID の降順', { got: f, want });
		await setView(sp.page, 'table');
		const cols = await factorCols(sp.page);
		assert(cols.length === want.length && cols.every((c, i) => c.no === String(i + 1) && isCol(c.label, want[i])), 'T67(1d) 星取表のカードの列も同じ並び', cols.map((c) => [c.no, c.label]));
		// ②の列のソート
		await sp.page.click(T + '[data-usd-el="factor-col-menu"][data-no="2"]');
		await sp.page.waitForSelector('[data-usd-el="colmenu-sort"]', { timeout: 5000 });
		await sp.page.click('[data-usd-el="colmenu-sort"]');
		await sp.page.waitForTimeout(300);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		const c2 = (await factorCols(sp.page)).find((c) => c.no === '2');
		assert(!!c2 && c2.sorted === '1' && /のメニュー（ソート中）$/.test(c2.label), 'T67(3) ②のカードの列: ソート中の読み上げ名の末尾は「（ソート中）」', c2 && c2.label);
		// 読み込み直しても並んだまま・保存は提案の順のまま
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(800);
		const f2 = await factorTiles(sp.page);
		const raw2 = ((await draft(sp.page)).outsideOptions || {}).cards || [];
		assert(f2.filter(Boolean).join() === want.join() && raw2.join() === raw.join(), 'T67(1d) 読み込み直しても並んで見え、保存の順は書き換えない', { f2, raw2 });
		assert(jsErrors(sp.errors).length === 0, 'T67(1d) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ---- (2) 再計算 ---- */
	await block('T67サポカの並び(2) オススメサポ: 計算のあと何も変えなくても「再計算」が見えて押せる・押すと計算し直す（計算中は見えない）・終わるとまた見える', async () => {
		const sp = await openSp({ roster: { umaId: 'uma-0179', cardIds: MIXED }, tab: '1', ids: ['2'] });
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		await waitOutside(sp.page);
		const st = () => sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-recalc"]'); return b ? { shown: !b.hidden && b.offsetWidth > 0, disabled: b.disabled, text: b.textContent.replace(/\s+/g, ' ').trim() } : null; });
		const s0 = await st();
		assert(!!s0 && s0.shown && !s0.disabled && s0.text === '再計算', 'T67(2) 開いて計算が終わった直後（何も変えていない）でも「再計算」が見えて押せる', s0);
		const during = await sp.page.evaluate(() => {
			const b = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-recalc"]');
			b.click();
			const again = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-recalc"]');
			return { busy: !!document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-busy"]'), hidden: !again || again.hidden };
		});
		assert(during.busy && during.hidden, 'T67(2) 押すと計算し直す（「計算中…」になり、計算中は「再計算」は見えない）', during);
		await waitOutside(sp.page);
		await sp.page.waitForTimeout(200);
		const s1 = await st();
		assert(!!s1 && s1.shown && !s1.disabled, 'T67(2) 計算が終わると、また「再計算」が見えて押せる', s1);
		assert(jsErrors(sp.errors).length === 0, 'T67(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
