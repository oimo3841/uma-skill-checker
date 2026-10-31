// 「テキストで検索」の新設と入口の並び（T28・2026-10-31 おいもさんの決定。T25 の推奨をすべて採用）の検査。
// run-smoke.mjs の末尾から register78() で呼ばれる（塊の見出しはすべて「T28テキストで検索」で始まる。`npm run test:visual -- --only=T28テキストで検索` で回せる）。
//
// 決め:
//  (1) 入口の並び: 条件で検索 → 緑スキル → テキストで検索（新・虫眼鏡・「新」の札なし） → スクショで追加 → リストを貼り付けて追加（今の「テキストで検索」を改名。識別子 editor-pick-text は不変）。
//      Deck 単体ページの入口の行（共有の entryPickHtml）にも同じ変更。
//  (2) 新しい小窓: 入力欄（×・16px）→「候補（N件）」→ 候補の一覧（全部・中だけスクロール）→ 追加候補の欄（下の帯のすぐ上）→ 下の帯の「追加（N種）」。
//      候補を押すと欄に入る（二重に入らない）・札の × で外す・入力を変えても欄は残る・「追加（N種）」でまとめて②へ（「条件で検索」と同じ処理・Undo・知らせ）・小窓を閉じる。
//      閉じると欄は捨てる。追加済み（薄く・取り消し線なし）・選べない（取り消し線＋薄く・短い表記）は押せない。①の絞り込みは理由にしない。↑↓・Enter（変換中は入れない）。
// スキル名は検査の側に書かない（恒久ルール1）。入力の文字は指示の例（「真髄」）と表記ゆれの組だけ。

import { pickEntry, ENTRY_SEARCH_BTN } from './lib/entry-search.mjs';
import { reloadReady } from './lib/page-ready.mjs';
import { noticeOf } from './lib/add-notice.mjs';

export async function register78(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const sleep = (page, ms) => page.waitForTimeout(ms);
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const DECK = { schemaVersion: 7, records: [{ recordId: 'rec1', name: 'シート', sourceTemplateId: null, skillIds: [], candidates: [], cells: {}, createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z' }], customSkills: [], templates: [], rosters: [] };
	const RACE = readJson('data/upcoming-races.json').races.find((r) => r.id === 'race-0001');
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	// ①＝育成ウマ娘＋カード6枚・①の絞り込み（先行）・レース（T21・T25 のモックと同じ形の状態）
	const ROSTER = { umaId: 'uma-0179', cardIds: CARDS6, skillFilter: { style: 'senko' }, race: RACE };
	const SHORT = ['本育成で取得', 'レース条件不一致'];
	const ORDER_SP = ['editor-pick', 'editor-pick-passive', 'editor-pick-search', 'editor-pick-screenshot', 'editor-pick-text'];
	const ORDER_DECK = ['editor-pick', 'editor-pick-passive', 'editor-pick-search', 'editor-pick-text'];
	const M = '[data-usd-el="mode-search"] ';
	const INPUT = '[data-usd-el="search-input"]';

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, EMPTY);
		await sp.page.evaluate(({ roster, theme }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: o.roster || null, theme: o.theme || 'light' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sleep(sp.page, 300);
		return sp;
	};
	const openSearchSp = async (o = {}) => {
		const sp = await openSp(o);
		await pickEntry(sp.page, 'editor-pick-search');
		await sp.page.waitForSelector(M + INPUT, { state: 'visible', timeout: 10000 });
		return sp;
	};
	const openDeck = async (o = {}) => {
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: o.w || 390, height: o.h || 844 }, DECK);
		await dk.page.evaluate((t) => localStorage.setItem('uma-tools-theme', t), o.theme || 'light');
		await reloadReady(dk.page);
		await sleep(dk.page, 300);
		return dk;
	};
	const type = async (page, text) => { await page.fill(INPUT, text); await sleep(page, 150); };
	/** 小窓の状態 */
	const readSearch = (page) => page.evaluate(() => {
		const panel = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel');
		if (!panel) return null;
		const list = panel.querySelector('[data-usd-el="search-results"]');
		const rows = Array.from(list.querySelectorAll('.usd-tsearch-row')).map((r) => {
			const n = r.querySelector('.usd-tsearch-name');
			const cs = getComputedStyle(r);
			return { id: r.getAttribute('data-skill-id'), name: n.textContent, bold: (n.querySelector('b') || {}).textContent || '', state: r.classList.contains('usd-tsearch-row--added') ? 'added' : r.classList.contains('usd-tsearch-row--excluded') ? 'excluded' : r.classList.contains('usd-tsearch-row--queued') ? 'queued' : 'pick',
				side: (r.querySelector('.usd-tsearch-side') || {}).textContent || '', mark: r.querySelector('.usd-tsearch-mark').textContent, deco: getComputedStyle(n).textDecorationLine, bg: cs.backgroundColor, color: getComputedStyle(n).color,
				act: r.getAttribute('data-usd-act'), dis: r.getAttribute('aria-disabled'), sel: r.getAttribute('aria-selected'), active: r.classList.contains('usd-tsearch-row--active'), domId: r.id };
		});
		const chips = Array.from(panel.querySelectorAll('[data-usd-el="search-tray-in"] .usd-tsearch-chip')).map((c) => ({ id: c.getAttribute('data-skill-id'), name: c.querySelector('.usd-tsearch-chip-name').textContent, x: c.querySelector('button').getAttribute('aria-label') }));
		const commit = panel.querySelector('[data-usd-el="picker-commit"]');
		const input = panel.querySelector('[data-usd-el="search-input"]');
		return { title: panel.querySelector('[data-usd-el="picker-title"]').textContent, mode: panel.getAttribute('data-usd-mode'), count: panel.querySelector('[data-usd-el="search-count"]').textContent,
			listHidden: list.hidden, none: (list.querySelector('.usd-tsearch-none') || {}).textContent || null, rows, chips,
			trayText: panel.querySelector('[data-usd-el="search-tray-in"]').textContent, commitText: commit.textContent, commitDisabled: commit.disabled, commitHidden: commit.hidden || panel.querySelector('[data-usd-el="picker-footer"]').hidden,
			footCountHidden: panel.querySelector('[data-usd-el="picker-checked-count"]').hidden,
			clearHidden: panel.querySelector('[data-usd-act="search-clear"]').hidden, focus: document.activeElement === input, expanded: input.getAttribute('aria-expanded'), activeDesc: input.getAttribute('aria-activedescendant'),
			role: input.getAttribute('role'), fontSize: getComputedStyle(input).fontSize, hx: document.documentElement.scrollWidth > innerWidth + 1 };
	});
	const draftIds = (page) => page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
	const undoCount = (page) => page.evaluate(() => UmaSkillDeckCore.undoCount());
	const modalOpen = (page) => page.evaluate(() => !!document.querySelector('.usd-modal:not([hidden]) [data-usd-el="picker-panel"]'));
	const clickRow = (page, id) => page.click(M + '.usd-tsearch-row[data-skill-id="' + id + '"]');
	// 押せない行（aria-disabled）も押してみる（Playwright は aria-disabled の要素を押すのを待つので force で押す）
	const clickAny = (page, id) => page.click(M + '.usd-tsearch-row[data-skill-id="' + id + '"]', { force: true });

	await block('T28テキストで検索(1) 入口の並び・名前・アイコン: 条件で検索 → 緑スキル → テキストで検索（虫眼鏡・「新」の札なし） → スクショで追加 → リストを貼り付けて追加（special の虫眼鏡の小窓／Deck の入口の行・比較シートの入口）', async () => {
		const sp = await openSp();
		await sp.page.click(ENTRY_SEARCH_BTN);
		const items = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="entry-search-list"] > button')).map((b) => {
			const i = b.querySelector('[data-lucide], svg.lucide');
			return { act: b.getAttribute('data-usd-act'), text: b.textContent.trim(), icon: i ? (i.getAttribute('data-lucide') || i.getAttribute('class')) : null };
		}));
		await sp.page.keyboard.press('Escape');
		assert(items.map((i) => i.act).join(',') === ORDER_SP.join(','), 'T28テキストで検索(1) special: 入口の並び（識別子）は ' + ORDER_SP.join(' → '), items.map((i) => i.act));
		const txt = items.map((i) => i.text);
		assert(txt[0] === '条件で検索' && /^緑スキル/.test(txt[1]) && txt[2] === 'テキストで検索' && txt[3] === 'スクショで追加' && txt[4] === 'リストを貼り付けて追加',
			'T28テキストで検索(1) special: 名前は 条件で検索・緑スキル・テキストで検索・スクショで追加・リストを貼り付けて追加（「新」の札なし）', txt);
		assert(/search/.test(items[2].icon || '') && /file-text/.test(items[4].icon || ''), 'T28テキストで検索(1) special: テキストで検索は虫眼鏡・リストを貼り付けて追加は今の書類のアイコン', items.map((i) => i.icon));
		// 入口を押すと開く小窓の題名
		await pickEntry(sp.page, 'editor-pick-search');
		await sleep(sp.page, 200);
		const s1 = await readSearch(sp.page);
		await sp.page.click('[data-usd-act="picker-close"]');
		await pickEntry(sp.page, 'editor-pick-text');
		await sleep(sp.page, 200);
		const t2 = await sp.page.evaluate(() => ({ title: document.querySelector('[data-usd-el="picker-title"]').textContent, paste: !document.querySelector('[data-usd-el="mode-paste"]').hidden, search: !document.querySelector('[data-usd-el="mode-search"]').hidden }));
		assert(s1.title === 'テキストで検索' && s1.mode === 'search', 'T28テキストで検索(1) special: テキストで検索の小窓の題名は「テキストで検索」', s1.title);
		assert(t2.title === 'リストを貼り付けて追加' && t2.paste && !t2.search, 'T28テキストで検索(1) special: リストを貼り付けて追加は今の貼り付けの小窓（題名「リストを貼り付けて追加」）', t2);
		assert(jsErrors(sp.errors).length === 0, 'T28テキストで検索(1) special: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// Deck 単体ページ
		const dk = await openDeck({ w: 1280, h: 800 });
		const row = await dk.page.evaluate(() => Array.from(document.querySelectorAll('#template-panel-root .usd-entry-row > button')).map((b) => ({ act: b.getAttribute('data-usd-act'), text: b.textContent.trim(), icon: (b.querySelector('[data-lucide], svg.lucide') || { getAttribute: () => null }).getAttribute('data-lucide') || (b.querySelector('svg') || { getAttribute: () => '' }).getAttribute('class') })));
		assert(row.map((i) => i.act).join(',') === ORDER_DECK.join(',') && row[2].text === 'テキストで検索' && row[3].text === 'リストを貼り付けて追加' && /search/.test(row[2].icon || ''),
			'T28テキストで検索(1) Deck: スキルセットの入口の行は 条件で検索 → 緑スキル → テキストで検索（虫眼鏡） → リストを貼り付けて追加', row);
		await dk.page.evaluate(() => { switchTab('record'); openRecordEditor('rec1'); });
		await sleep(dk.page, 300);
		const rec = await dk.page.evaluate(() => Array.from(document.querySelectorAll('#tab-record .usd-entry-row--inline > button, .usd-entry-row--inline > button')).map((b) => ({ on: b.getAttribute('onclick'), text: b.textContent.trim() })));
		assert(rec.map((r) => r.text.replace(/\d+$/, '')).join(',') === '条件で検索,緑スキル,テキストで検索,リストを貼り付けて追加' && rec[2].on === 'openRecordSearchPicker()' && rec[3].on === 'openRecordTextPicker()',
			'T28テキストで検索(1) Deck 比較シート: 入口は 条件で検索 → 緑スキル → テキストで検索 → リストを貼り付けて追加', rec);
		assert(jsErrors(dk.errors).length === 0, 'T28テキストで検索(1) Deck: コンソールのエラー0', jsErrors(dk.errors).slice(0, 3));
		await dk.ctx.close();
	});

	await block('T28テキストで検索(2) 候補: 「真髄」で6件（前方一致が先・短い名前が先・一致を太字）・ひらがな／カタカナ・全角／半角・○／◯／〇 が同じ結果・0件の文・入力の × で消える・入力前は一覧を出さない', async () => {
		const sp = await openSearchSp({ w: 1280, h: 800 });
		const p = sp.page;
		const s0 = await readSearch(p);
		assert(s0.listHidden && s0.count === '' && s0.trayText === '追加候補候補を押すと、ここに並びます' && s0.commitText === '追加（0種）' && s0.commitDisabled && !s0.commitHidden && s0.footCountHidden,
			'T28テキストで検索(2) 入力前: 一覧は出さない・件数なし・欄は「候補を押すと、ここに並びます」・「追加（0種）」は押せない', s0);
		assert(s0.focus && s0.role === 'combobox' && s0.fontSize === '16px' && s0.clearHidden, 'T28テキストで検索(2) マウスで開くと入力欄にフォーカス・combobox・文字 16px・入力が空なら × は出ない', s0);
		await type(p, '真髄');
		const a = await readSearch(p);
		assert(a.rows.length === 6 && a.count === '候補（6件）' && !a.listHidden && a.expanded === 'true' && !a.clearHidden, 'T28テキストで検索(2) 「真髄」で6件（候補（6件））', { n: a.rows.length, count: a.count });
		assert(a.rows.every((r) => r.bold === '真髄'), 'T28テキストで検索(2) 一致した部分（真髄）を太字', a.rows.map((r) => r.bold));
		// 並び: 前方一致が先・同じ組の中は短い名前が先（core と同じ規則で、検査の側でも並べ直して比べる）
		const order = await p.evaluate((q) => {
			const C = UmaSkillDeckCore;
			const all = C.findSkillsByNameFragment(q, { searchableOnly: true, limit: Infinity });
			return all.hits.map((h) => h.id);
		}, '真髄');
		assert(JSON.stringify(order) === JSON.stringify(a.rows.map((r) => r.id)), 'T28テキストで検索(2) 並びは「名前を入れて探す」と同じ規則（前方一致が先・短い名前が先）', { order, got: a.rows.map((r) => r.id) });
		const starts = a.rows.map((r) => r.name.indexOf('真髄') === 0);
		assert(starts.indexOf(false) === -1 || starts.slice(starts.indexOf(false)).every((x) => !x), 'T28テキストで検索(2) 前方一致の行が先に並ぶ', starts);
		// 表記ゆれ: 同じ結果になる組（ひらがな／カタカナ・全角／半角・○の3つ）
		const idsOf = async (q) => { await type(p, q); return (await readSearch(p)).rows.map((r) => r.id).join(','); };
		const pairs = [['レースの真髄', 'れーすの真髄'], ['レースの真髄', 'ﾚｰｽの真髄'], ['コーナー○', 'コーナー◯'], ['コーナー○', 'コーナー〇'], ['コーナー', 'こーなー']];
		for (const [x, y] of pairs) {
			const ix = await idsOf(x), iy = await idsOf(y);
			assert(ix.length > 0 && ix === iy, 'T28テキストで検索(2) 「' + x + '」と「' + y + '」は同じ候補（' + ix.split(',').length + '件）', { ix: ix.slice(0, 80), iy: iy.slice(0, 80) });
		}
		// ひらがなの入力でも一致を太字（元の名前のカタカナを太字にする）
		await type(p, 'れーすの');
		const kb = await readSearch(p);
		assert(kb.rows.length > 0 && kb.rows.every((r) => r.bold === 'レースの'), 'T28テキストで検索(2) ひらがなで入れても、名前のカタカナの部分を太字', kb.rows.map((r) => r.bold).slice(0, 4));
		// 上限なし: 一覧が長い入力でも全部出す（「名前を入れて探す」の上限 20 を超える）
		await type(p, '○');
		const many = await readSearch(p);
		const total = await p.evaluate(() => UmaSkillDeckCore.findSkillsByNameFragment('○', { searchableOnly: true, limit: Infinity, foldKana: true }).total);
		assert(many.rows.length === total && total > 20 && many.count === '候補（' + total + '件）', 'T28テキストで検索(2) 上限なしで全部出す（○ で ' + total + '件。上限 20 を超える）', { rows: many.rows.length, total });
		const sc = await p.evaluate(() => { const l = document.querySelector('[data-usd-el="search-results"]'); return { sh: l.scrollHeight, ch: l.clientHeight, ov: getComputedStyle(l).overflowY, body: document.querySelector('[data-usd-el="picker-body"]').scrollHeight - document.querySelector('[data-usd-el="picker-body"]').clientHeight }; });
		assert(sc.sh > sc.ch && sc.ov === 'auto' && sc.body <= 0, 'T28テキストで検索(2) 長い一覧は一覧の中だけがスクロールする（小窓の本文はスクロールしない）', sc);
		// 0件
		await type(p, '真髄だいすき');
		const z = await readSearch(p);
		assert(z.rows.length === 0 && z.none === '一致するスキルはありません' && z.count === '候補（0件）', 'T28テキストで検索(2) 0件は「一致するスキルはありません」', z);
		// 読みでは探さない（しんずい は0件）
		await type(p, 'しんずい');
		assert((await readSearch(p)).rows.length === 0, 'T28テキストで検索(2) 読み（しんずい）では探さない', null);
		// 入力の × で消える
		await p.click(M + '[data-usd-act="search-clear"]');
		await sleep(p, 100);
		const cl = await readSearch(p);
		assert(cl.listHidden && cl.count === '' && cl.clearHidden && cl.focus && await p.inputValue(INPUT) === '', 'T28テキストで検索(2) 入力の × で文字と一覧が消え、入力欄にフォーカスが戻る', cl);
		// 既定の呼び方（名前を入れて探す・カードのイベントの入力）は上限 20・かなをそろえない（結果は変わらない）
		const legacy = await p.evaluate(() => { const C = UmaSkillDeckCore; const a = C.findSkillsByNameFragment('○', { searchableOnly: true }); const b = C.findSkillsByNameFragment('こーなー', { searchableOnly: true }); return { n: a.hits.length, more: a.more, kana: b.total }; });
		assert(legacy.n === 20 && legacy.more > 0 && legacy.kana === 0, 'T28テキストで検索(2) 既定の呼び方は今までどおり（上限 20・ひらがなとカタカナはそろえない）', legacy);
		assert(jsErrors(sp.errors).length === 0, 'T28テキストで検索(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T28テキストで検索(3) 追加候補の欄: 押すと欄に入る（押した行に ✓・地の色・「追加候補」）・もう一度押しても二重に入らず札が光る・札の × で外れる（読み上げ名）・入力を変えても欄は残る・閉じると欄は捨てる・0種で押せない', async () => {
		const sp = await openSearchSp({ w: 390, h: 844 });
		const p = sp.page;
		await type(p, '真髄');
		const a = await readSearch(p);
		const ids = a.rows.filter((r) => r.state === 'pick').map((r) => r.id);
		assert(ids.length >= 4, 'T28テキストで検索(3) 前提: 選べる候補が4つ以上', ids.length);
		await clickRow(p, ids[0]);
		await clickRow(p, ids[2]);
		await clickRow(p, ids[3]);
		await sleep(p, 100);
		const b = await readSearch(p);
		assert(b.chips.map((c) => c.id).join(',') === [ids[0], ids[2], ids[3]].join(',') && b.commitText === '追加（3種）' && !b.commitDisabled,
			'T28テキストで検索(3) 押した順に欄へ3種・「追加（3種）」', { chips: b.chips.map((c) => c.id), commit: b.commitText });
		const q0 = b.rows.find((r) => r.id === ids[0]);
		const want = await p.evaluate(() => { const d = document.createElement('div'); document.querySelector('[data-usd-el="search-results"]').appendChild(d); d.style.background = 'var(--usd-ui-set, var(--uma-control-soft))'; const v = getComputedStyle(d).backgroundColor; d.remove(); return v; });
		assert(q0.state === 'queued' && q0.mark === '✓' && q0.side === '追加候補' && q0.sel === 'true' && q0.bg === want, 'T28テキストで検索(3) 押した行は一覧に残り、✓・地 --usd-ui-set・右に「追加候補」・aria-selected', { q0, want });
		assert(b.rows.find((r) => r.id === ids[1]).mark === '+', 'T28テキストで検索(3) まだ押していない行は「＋」の輪', null);
		assert(b.focus, 'T28テキストで検索(3) 候補を押しても入力欄のフォーカスは外れない', b.focus);
		assert(await draftIds(p).then((d) => d.length === 0), 'T28テキストで検索(3) 欄に入れただけでは②に入らない', await draftIds(p));
		// もう一度押す
		await clickRow(p, ids[0]);
		const flash = await p.evaluate((id) => { const c = Array.from(document.querySelectorAll('.usd-tsearch-chip')).find((x) => x.getAttribute('data-skill-id') === id); return c ? { cls: c.classList.contains('usd-tsearch-chip--flash'), anim: getComputedStyle(c).animationName } : null; }, ids[0]);
		const c2 = await readSearch(p);
		assert(c2.chips.length === 3 && flash && flash.cls && flash.anim === 'usd-tsearch-flash', 'T28テキストで検索(3) もう一度押しても二重に入らず（3種のまま）、欄の札が光る', { n: c2.chips.length, flash });
		// 札の ×
		const x = c2.chips[1];
		const nm = await p.evaluate((id) => UmaSkillDeckCore.getSkillName(id), x.id);
		assert(x.x === nm + 'を追加候補から外す', 'T28テキストで検索(3) 札の × の読み上げ名は「〈スキル名〉を追加候補から外す」', x.x);
		const xs = await p.evaluate(() => { const b = document.querySelector('.usd-tsearch-chip-x').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; });
		assert(xs.w >= 24 && xs.h >= 24, 'T28テキストで検索(3) 札の × の押せる範囲は 24px 以上（' + xs.w + '×' + xs.h + '）', xs);
		await p.click('.usd-tsearch-chip[data-skill-id="' + x.id + '"] .usd-tsearch-chip-x');
		await sleep(p, 100);
		const d = await readSearch(p);
		assert(d.chips.map((c) => c.id).join(',') === [ids[0], ids[3]].join(',') && d.commitText === '追加（2種）' && d.rows.find((r) => r.id === x.id).state === 'pick',
			'T28テキストで検索(3) 札の × で欄から外れ、一覧の行も「＋」に戻る', { chips: d.chips.map((c) => c.id), commit: d.commitText });
		// 入力を変えても欄は残る
		await type(p, 'コーナー');
		const e = await readSearch(p);
		assert(e.chips.length === 2 && e.commitText === '追加（2種）', 'T28テキストで検索(3) 入力の文字を変えても欄の中身は残る', e.chips.map((c) => c.id));
		// 欄の高さ: 札を4段まで見せ、5段目を半分覗かせる（それ以上は欄の中をスクロール）。T38 でスマホ幅は 2段＋半分（84px）→ 4段＋半分（152px）。PC 幅は 84px のまま（blocks-80 の (3)）
		await type(p, '○');
		const more = (await readSearch(p)).rows.filter((r) => r.state === 'pick').slice(0, 20).map((r) => r.id);
		for (const id of more) await clickRow(p, id);
		await sleep(p, 100);
		const tray = await p.evaluate(() => { const t = document.querySelector('[data-usd-el="search-tray-in"]'); const box = document.querySelector('[data-usd-el="search-tray"]'); const chips = Array.from(t.querySelectorAll('.usd-tsearch-chip')); return { h: Math.round(box.getBoundingClientRect().height), sh: t.scrollHeight, ch: t.clientHeight, lines: new Set(chips.map((c) => Math.round(c.offsetTop))).size }; });
		assert(tray.lines >= 5 && tray.h === 152 && tray.sh > tray.ch, 'T28テキストで検索(3) 欄は4段＋5段目の半分（152px）まで・それ以上は欄の中をスクロール', tray);
		// 閉じると欄は捨てる（確かめの小窓は出さない）
		await p.click('[data-usd-act="picker-close"]');
		await sleep(p, 200);
		assert(!(await modalOpen(p)) && (await draftIds(p)).length === 0, 'T28テキストで検索(3) × で閉じると何も②に入らない（確かめの小窓も出ない）', await draftIds(p));
		await pickEntry(p, 'editor-pick-search');
		await sleep(p, 200);
		const f = await readSearch(p);
		assert(f.chips.length === 0 && f.commitText === '追加（0種）' && f.commitDisabled && await p.inputValue(INPUT) === '', 'T28テキストで検索(3) 開き直すと欄も入力も空（閉じたときに捨てた）', f);
		// 背景を押して閉じても同じ
		await type(p, '真髄');
		await clickRow(p, ids[0]);
		await p.mouse.click(3, 3);
		await sleep(p, 200);
		assert(!(await modalOpen(p)) && (await draftIds(p)).length === 0, 'T28テキストで検索(3) 背景を押して閉じても②には入らない', null);
		assert(jsErrors(sp.errors).length === 0, 'T28テキストで検索(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T28テキストで検索(4) 「追加（N種）」: 欄のスキルをまとめて②へ・押した順・小窓が閉じる・知らせ「テキストで検索 N種を追加しました」・元に戻す1回で戻る・開き直すと「追加済み」（薄く・取り消し線なし・押せない）', async () => {
		const sp = await openSearchSp({ w: 390, h: 844 });
		const p = sp.page;
		await type(p, '真髄');
		const ids = (await readSearch(p)).rows.filter((r) => r.state === 'pick').map((r) => r.id).slice(0, 3);
		for (const id of [ids[2], ids[0], ids[1]]) await clickRow(p, id);
		const u0 = await undoCount(p);
		await p.click('[data-usd-el="picker-commit"]');
		await sleep(p, 400);
		const got = await draftIds(p);
		assert(got.join(',') === [ids[2], ids[0], ids[1]].join(','), 'T28テキストで検索(4) 欄の3種がまとめて②に入る（押した順）', got);
		assert(!(await modalOpen(p)), 'T28テキストで検索(4) 押したら小窓を閉じる', null);
		const n = await noticeOf(p);
		assert(!!n && n.visible && n.text === 'テキストで検索 3種を追加しました' && n.role === 'status', 'T28テキストで検索(4) 追加の知らせは「テキストで検索 3種を追加しました」（条件で検索と同じ形）', n);
		assert(await undoCount(p) === u0 + 1, 'T28テキストで検索(4) 「元に戻す」に1回積まれる', { u0, u1: await undoCount(p) });
		// 開き直すと追加済み
		await pickEntry(p, 'editor-pick-search');
		await type(p, '真髄');
		const r = await readSearch(p);
		const added = r.rows.filter((x) => ids.includes(x.id));
		const ok = r.rows.find((x) => x.state === 'pick');
		assert(added.length === 3 && added.every((x) => x.state === 'added' && x.side === '追加済み' && x.mark === '' && x.dis === 'true' && !x.act && !/line-through/.test(x.deco)),
			'T28テキストで検索(4) 足したスキルは一覧に残り、「追加済み」・印なし・取り消し線なし・押せない', added);
		assert(ok && added.every((x) => x.color !== ok.color), 'T28テキストで検索(4) 追加済みの行の名前は選べる行より薄い', { added: added.map((x) => x.color), ok: ok && ok.color });
		await clickAny(p, ids[0]);
		assert((await readSearch(p)).chips.length === 0, 'T28テキストで検索(4) 追加済みの行を押しても欄に入らない', null);
		await p.click('[data-usd-act="picker-close"]');
		await sleep(p, 200);
		// 元に戻す1回で戻る
		await p.evaluate(() => UmaSkillDeckCore.performUndo());
		await sleep(p, 300);
		assert((await draftIds(p)).length === 0, 'T28テキストで検索(4) 元に戻す1回で、まとめて足した3種が②から抜ける', await draftIds(p));
		// 1種だけの追加は「条件で検索」と同じく知らせも Undo も無い
		await pickEntry(p, 'editor-pick-search');
		await type(p, '真髄');
		await clickRow(p, ids[0]);
		const u2 = await undoCount(p);
		await p.click('[data-usd-el="picker-commit"]');
		await sleep(p, 300);
		const n1 = await noticeOf(p);
		assert((await draftIds(p)).join(',') === ids[0] && (!n1 || !n1.visible || n1.text !== 'テキストで検索 1種を追加しました') && await undoCount(p) === u2 && !(await modalOpen(p)),
			'T28テキストで検索(4) 1種だけのときは「条件で検索」と同じ（②に入る・知らせも元に戻すも無い・小窓は閉じる）', { n1, u2 });
		assert(jsErrors(sp.errors).length === 0, 'T28テキストで検索(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T28テキストで検索(5) 選べない行: 名前に取り消し線＋行を薄く・右に「レース条件不一致」「本育成で取得」・押せない／①の絞り込みは理由にしない（ライト・ダーク × 375・1280）', async () => {
		for (const [w, h] of [[375, 812], [1280, 800]]) for (const theme of ['light', 'dark']) {
			const tag = 'T28テキストで検索(5) ' + w + 'px ' + theme + ': ';
			const sp = await openSearchSp({ w, h, theme, roster: ROSTER });
			const p = sp.page;
			// 選べない行が出る入力を、検査の側で探す（スキル名を書かない。短い表記の2つが両方出る入力を選ぶ）
			const pick = await p.evaluate((short) => {
				const C = UmaSkillDeckCore;
				const hidden = new Set(C.getPickerHiddenIds());
				for (const q of ['コーナー', '○', '◎', 'の', 'ー']) {
					const f = C.findSkillsByNameFragment(q, { searchableOnly: true, limit: Infinity, foldKana: true });
					if (f.hits.some((h) => hidden.has(h.id))) return q;
				}
				return null;
			}, SHORT);
			assert(!!pick, tag + '前提: 本育成で取得のスキルが当たる入力がある', pick);
			await type(p, pick);
			const r = await readSearch(p);
			const ex = r.rows.filter((x) => x.state === 'excluded');
			const reasons = Array.from(new Set(ex.map((x) => x.side)));
			assert(SHORT.every((s) => reasons.includes(s)) && reasons.every((s) => SHORT.includes(s)), tag + '選べない行の右は「本育成で取得」「レース条件不一致」（入力「' + pick + '」）', reasons);
			const sunk = await p.evaluate(() => { const d = document.createElement('div'); document.querySelector('[data-usd-el="search-results"]').appendChild(d); d.style.background = 'var(--uma-surface-sunken)'; const v = getComputedStyle(d).backgroundColor; d.remove(); return v; });
			const badEx = ex.filter((x) => !/line-through/.test(x.deco) || x.bg !== sunk || x.dis !== 'true' || x.act || x.mark !== '');
			assert(ex.length > 0 && badEx.length === 0, tag + '選べない行（' + ex.length + '件）: 名前に取り消し線・地 --uma-surface-sunken・印なし・押せない', badEx.slice(0, 3));
			const okRows = r.rows.filter((x) => x.state === 'pick');
			assert(okRows.length > 0 && okRows.every((x) => !/line-through/.test(x.deco) && x.bg !== sunk), tag + '選べる行は取り消し線なし・地を沈めない', okRows.slice(0, 3));
			// 押しても欄に入らない
			await clickAny(p, ex[0].id);
			assert((await readSearch(p)).chips.length === 0, tag + '選べない行を押しても欄に入らない', null);
			// ①の絞り込み（先行）に合わないスキルも、選べない理由にしない（押せる行として出る）
			const misfit = await p.evaluate(({ ids, style }) => { const C = UmaSkillDeckCore; return ids.filter((id) => !C.matchesFilters(C.findSkill(id), { style: [style] }, null)); }, { ids: okRows.map((x) => x.id), style: ROSTER.skillFilter.style });
			assert(misfit.length > 0, tag + '①の絞り込み（先行）に合わないスキル（' + misfit.length + '件）も押せる行として出る（①の絞り込みは理由にしない）', misfit.slice(0, 3));
			await clickRow(p, misfit[0]);
			assert((await readSearch(p)).chips.map((c) => c.id).join(',') === misfit[0], tag + '①の絞り込みに合わないスキルも欄に入れられる', null);
			const head = await p.evaluate(() => document.querySelector('[data-usd-el="picker-roster-filter"]').hidden);
			assert(head, tag + '題名の右に①の絞り込みの値は出さない（「条件で検索」だけ）', head);
			assert(!r.hx && jsErrors(sp.errors).length === 0, tag + '横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T28テキストで検索(6) 範囲: 選べない行の表し方はこの入口・条件で検索・緑スキルの中だけ（オススメサポ・脚質オススメの一覧の行は変わらない）・色に緑（--uma-accent 系）を使わない', async () => {
		const sp = await openSearchSp({ w: 390, h: 844, roster: ROSTER });
		const p = sp.page;
		await type(p, 'コーナー');
		await clickRow(p, (await readSearch(p)).rows.find((x) => x.state === 'pick').id);
		await p.keyboard.press('ArrowDown');
		const g = await p.evaluate(() => {
			const panel = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel');
			const probe = document.createElement('div');
			panel.appendChild(probe);
			const vals = new Set();
			['--uma-accent', '--uma-accent-soft', '--uma-accent-border', '--uma-accent-soft-text', '--uma-accent-ring', '--uma-accent-hover'].forEach((t) => { probe.style.color = 'var(' + t + ')'; const v = getComputedStyle(probe).color; if (v !== getComputedStyle(panel).color) vals.add(v); });
			probe.remove();
			const hits = [];
			panel.querySelectorAll('[data-usd-el="mode-search"] *, [data-usd-el="picker-footer"] *').forEach((e) => {
				if (!e.getClientRects().length) return;
				const cs = getComputedStyle(e);
				['color', 'background-color', 'border-top-color', 'outline-color', 'box-shadow', 'text-decoration-color'].forEach((k) => { const v = cs.getPropertyValue(k); vals.forEach((x) => { if (v.indexOf(x) !== -1) hits.push((e.className || e.tagName) + ' ' + k); }); });
			});
			return { n: vals.size, hits };
		});
		assert(g.n >= 3 && g.hits.length === 0, 'T28テキストで検索(6) 小窓の中（一覧・欄・帯）に緑の色が無い', g.hits.slice(0, 5));
		// 共有の .usd-row--excluded には何も足していない（オススメサポ・脚質オススメの行は前のまま）: 今の CSS の中で、取り消し線の指定は小窓ごとの箱の中だけ
		const rules = await p.evaluate(() => {
			const out = [];
			for (const sh of Array.from(document.styleSheets)) { let rs; try { rs = sh.cssRules; } catch (e) { continue; } for (const r of Array.from(rs || [])) { if (r.selectorText && /line-through/.test(r.cssText) && /excluded/.test(r.selectorText)) out.push(r.selectorText); } }
			return out;
		});
		const scoped = rules.every((s) => s.split(',').every((x) => /\.usd-passive-list|\.usd-filter-list|\.usd-tsearch/.test(x)));
		assert(rules.length > 0 && scoped, 'T28テキストで検索(6) 取り消し線の指定は「緑スキル」「条件で検索」「テキストで検索」の箱の中だけ（共有の行には効かない）', rules);
		assert(jsErrors(sp.errors).length === 0, 'T28テキストで検索(6) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T28テキストで検索(7) PC: ↑↓は押せる行だけを移る（端で反対側へ回る）・Enter で欄に入る・変換中の Enter（isComposing・keyCode 229）では入らない・aria-activedescendant', async () => {
		const sp = await openSearchSp({ w: 1280, h: 800, roster: ROSTER });
		const p = sp.page;
		await type(p, 'コーナー');
		const r0 = await readSearch(p);
		const pickIdx = r0.rows.map((x, i) => (x.state === 'pick' ? i : -1)).filter((i) => i >= 0);
		const blockedN = r0.rows.filter((x) => x.state !== 'pick').length;
		assert(pickIdx.length >= 3 && blockedN > 0, 'T28テキストで検索(7) 前提: 押せる行と押せない行が混ざる一覧（押せる ' + pickIdx.length + '・押せない ' + blockedN + '）', { pick: pickIdx.length, blockedN });
		const activeIdx = async () => (await readSearch(p)).rows.findIndex((x) => x.active);
		await p.keyboard.press('ArrowDown');
		assert(await activeIdx() === pickIdx[0], 'T28テキストで検索(7) ↓ で最初の押せる行へ', await activeIdx());
		const visited = new Set();
		for (let i = 0; i < r0.rows.length + 3; i++) { await p.keyboard.press('ArrowDown'); visited.add(await activeIdx()); }
		assert([...visited].every((i) => pickIdx.includes(i)) && visited.size === pickIdx.length, 'T28テキストで検索(7) ↓ を続けて押しても押せる行にしか止まらず、端で先頭へ回って全部を通る', { visited: [...visited], pickIdx });
		// 先頭にいる状態から ↑ で最後の押せる行へ
		for (let i = 0; i < r0.rows.length && await activeIdx() !== pickIdx[0]; i++) await p.keyboard.press('ArrowDown');
		await p.keyboard.press('ArrowUp');
		assert(await activeIdx() === pickIdx[pickIdx.length - 1], 'T28テキストで検索(7) 先頭で ↑ を押すと最後の押せる行へ回る', await activeIdx());
		const s = await readSearch(p);
		assert(s.activeDesc && s.activeDesc === s.rows[pickIdx[pickIdx.length - 1]].domId && s.focus, 'T28テキストで検索(7) 入力欄の aria-activedescendant が移った行を指す（フォーカスは入力欄のまま）', { ad: s.activeDesc });
		const inner = await p.evaluate(() => { const r = document.querySelector('.usd-tsearch-row--active'); return getComputedStyle(r).boxShadow; });
		assert(/inset/.test(inner), 'T28テキストで検索(7) 移った行は内側の枠で示す', inner);
		// 変換中の Enter では入らない
		const composeEnter = (opts) => p.evaluate((o) => { const i = document.querySelector('[data-usd-el="search-input"]'); i.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: 'Enter', bubbles: true, cancelable: true }, o))); }, opts);
		await composeEnter({ isComposing: true });
		await composeEnter({ keyCode: 229 });
		await sleep(p, 100);
		assert((await readSearch(p)).chips.length === 0, 'T28テキストで検索(7) 変換中の Enter（isComposing・keyCode 229）では欄に入らない', null);
		// 空振りでない: 同じ口から送る普通の Enter では入る
		await composeEnter({});
		await sleep(p, 100);
		const e1 = await readSearch(p);
		assert(e1.chips.length === 1 && e1.chips[0].id === s.rows[pickIdx[pickIdx.length - 1]].id, 'T28テキストで検索(7) 普通の Enter（同じ送り方）では、移った行が欄に入る', e1.chips);
		await p.keyboard.press('ArrowDown');
		await p.keyboard.press('Enter');
		await sleep(p, 100);
		assert((await readSearch(p)).chips.length === 2, 'T28テキストで検索(7) キーボードの ↓・Enter でも入る', null);
		assert(jsErrors(sp.errors).length === 0, 'T28テキストで検索(7) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T28テキストで検索(8) Deck 単体ページでも動く（スキルセットの入口・比較シートの入口。欄に入れて「追加（N種）」でまとめて足す・小窓が閉じる）', async () => {
		const dk = await openDeck({ w: 390, h: 844 });
		const p = dk.page;
		await p.click('#template-panel-root [data-usd-act="editor-pick-search"]');
		await p.waitForSelector(M + INPUT, { state: 'visible' });
		await type(p, '真髄');
		const a = await readSearch(p);
		assert(a.title === 'テキストで検索' && a.rows.length === 6, 'T28テキストで検索(8) Deck スキルセット: 「真髄」で6件', { title: a.title, n: a.rows.length });
		const ids = a.rows.filter((x) => x.state === 'pick').slice(0, 2).map((x) => x.id);
		for (const id of ids) await clickRow(p, id);
		await p.click('[data-usd-el="picker-commit"]');
		await sleep(p, 300);
		const tm = await p.evaluate(() => templateManager.getSelection());
		assert(!(await modalOpen(p)) && tm && ids.every((id) => tm.skillIds.includes(id)), 'T28テキストで検索(8) Deck スキルセット: 2種が入り、小窓が閉じる', tm && tm.skillIds);
		await p.evaluate(() => { switchTab('record'); openRecordEditor('rec1'); });
		await sleep(p, 300);
		await p.click('button[onclick="openRecordSearchPicker()"]');
		await p.waitForSelector(M + INPUT, { state: 'visible' });
		await type(p, '真髄');
		const b = await readSearch(p);
		const id2 = b.rows.filter((x) => x.state === 'pick').slice(0, 2).map((x) => x.id);
		for (const id of id2) await clickRow(p, id);
		await p.click('[data-usd-el="picker-commit"]');
		await sleep(p, 300);
		const rec = await p.evaluate(() => draftRecord.skillIds.slice());
		assert(!(await modalOpen(p)) && id2.every((id) => rec.includes(id)), 'T28テキストで検索(8) Deck 比較シート: 2種が入り、小窓が閉じる', rec);
		assert(jsErrors(dk.errors).length === 0, 'T28テキストで検索(8) Deck: コンソールのエラー0', jsErrors(dk.errors).slice(0, 3));
		await dk.ctx.close();
	});

	await block('T28テキストで検索(9) 横スクロールなし・候補が見える（375×812・375×667・390×844・1280×800 × ライト・ダーク。「真髄」で3種を欄に入れた状態）／Deck の入口の行の覗かせ', async () => {
		for (const [w, h] of [[375, 812], [375, 667], [390, 844], [1280, 800]]) for (const theme of ['light', 'dark']) {
			const tag = 'T28テキストで検索(9) ' + w + '×' + h + ' ' + theme + ': ';
			const sp = await openSearchSp({ w, h, theme });
			const p = sp.page;
			await type(p, '真髄');
			const ids = (await readSearch(p)).rows.slice(0, 3).map((r) => r.id);
			for (const id of ids) await clickRow(p, id);
			const L = await p.evaluate(() => {
				const panel = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel');
				const list = panel.querySelector('[data-usd-el="search-results"]').getBoundingClientRect();
				const tray = panel.querySelector('[data-usd-el="search-tray"]').getBoundingClientRect();
				const foot = panel.querySelector('[data-usd-el="picker-footer"]').getBoundingClientRect();
				const pr = panel.getBoundingClientRect();
				const rows = Array.from(panel.querySelectorAll('.usd-tsearch-row')).filter((r) => { const b = r.getBoundingClientRect(); return b.top >= list.top - 0.5 && b.bottom <= list.bottom + 0.5; }).length;
				const body = panel.querySelector('[data-usd-el="picker-body"]');
				return { rows, trayAboveFoot: tray.bottom <= foot.top + 0.5 && tray.top >= list.bottom, panelIn: pr.top >= 0 && pr.bottom <= innerHeight + 0.5, bodyScroll: body.scrollHeight - body.clientHeight, row: Math.round(panel.querySelector('.usd-tsearch-row').getBoundingClientRect().height), hx: document.documentElement.scrollWidth > innerWidth + 1, pw: Math.round(pr.width) };
			});
			assert(!L.hx && L.panelIn && L.bodyScroll <= 0, tag + '横スクロールなし・小窓は画面に収まり、本文はスクロールしない', L);
			assert(L.rows === 6 && L.trayAboveFoot && L.row === 25, tag + '「真髄」の6件がすべて見え（行 25px）、追加候補の欄は一覧の下・下の帯のすぐ上', L);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// Deck の入口の行（4つ）: 収まらない幅では、右端で次の入口が覗く（覗かせの切り詰めが働く）。収まる幅では送らない
		const rowAt = async (width) => {
			const dk = await openDeck({ w: width, h: 900 });
			const r = await dk.page.evaluate(() => {
				const row = document.querySelector('#template-panel-root .usd-entry-row');
				const rect = row.getBoundingClientRect();
				const btns = [...row.children].filter((c) => c.tagName === 'BUTTON');
				let peek = null;
				for (const b of btns) { const x = b.getBoundingClientRect(); if (x.left < rect.right - 0.5 && x.right > rect.right + 0.5) { peek = { seen: rect.right - x.left, hidden: x.right - rect.right, text: b.textContent.trim() }; break; } }
				return { n: btns.length, over: Math.round(row.scrollWidth - row.clientWidth), fade: row.getAttribute('data-usd-fade'), peek, hx: document.documentElement.scrollWidth > innerWidth + 1 };
			});
			await dk.ctx.close();
			return Object.assign({ w: width }, r);
		};
		const res = [];
		for (const w of [320, 360, 375, 390, 430, 600, 1280]) res.push(await rowAt(w));
		const over = res.filter((r) => r.over > 0), fit = res.filter((r) => r.over <= 0);
		assert(over.length > 0 && fit.length > 0, 'T28テキストで検索(9) Deck の入口の行: 試した幅に収まる幅と収まらない幅が両方ある（空振りでない）', res.map((r) => r.w + ':' + r.over));
		assert(res.every((r) => r.n === 4 && !r.hx), 'T28テキストで検索(9) Deck の入口の行は4つ・横スクロールなし', res);
		assert(over.every((r) => r.fade === 'right' && r.peek && r.peek.seen >= 12 && r.peek.hidden >= 8), 'T28テキストで検索(9) Deck: 収まらない幅では右端のボタンが 12px 以上見えて 8px 以上隠れる（覗かせが働く）', over);
		assert(fit.every((r) => r.fade === null && r.peek === null), 'T28テキストで検索(9) Deck: 収まる幅では送らない（フェードも付かない）', fit);
	});
}
