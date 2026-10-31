// 「条件で検索」の小窓の直し（T27・2026-10-31 おいもさんの決定）の検査。
// run-smoke.mjs の末尾から register77() で呼ばれる（塊の見出しはすべて「T27条件で検索」で始まる。`npm run test:visual -- --only=T27条件で検索` で回せる）。
//
// 決め（おいもさん・2026-10-30）。手本は T21 のモック lab/search-ui-mock.html の f-ba（タブ (b) 2段のまま詰める × 選び方 (a) 地の色）:
//  (1) 余白を詰め、押せる大きさをモックの値に（タブ 30・選択肢 26・追加のボタン 32・「効果『ちょっと』以下を除外」28。「絞り込み中」の札と「この軸を解除」「すべて解除」は 24 に上げる。
//      段7c の基準 24px 以上は保つ）。PC でも選んでいない軸のパネルは場所を取らない。目標のレースの距離のエラーの文は出たときだけ場所を取る。色は緑をやめてトークンに。
//  (2) ①の絞り込みに合わないスキルは一覧に出さない。レース条件に合わない・①で取得するスキルは、右に短い表記（「レース条件不一致」「本育成で取得」）・
//      名前に取り消し線＋行を薄く（T26 と同じ表し方）・押せない。
//  (3) 件数の文は丸ごと消す。「絞り込み結果（N件）」の N は追加できる数。題名の右の①の絞り込みの値（C-244）は今のまま。
// 見える行の数の目標（モックの値）: 距離の軸を開いた状態で 375×812 17行以上・375×667 11行以上・390×844 18行以上。
// 変更前（f3d4882）の実測: 375×812 9〜10行・375×667 4〜5行・390×844 10〜11行・1280×800 6行（①の絞り込み＋レースの状態が少ないほう）。
// スキル名は検査の側に書かない（恒久ルール1）。

import { pickEntry } from './lib/entry-search.mjs';
import { reloadReady } from './lib/page-ready.mjs';

export async function register77(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const DECK = { schemaVersion: 7, records: [{ recordId: 'rec1', name: 'シート', sourceTemplateId: null, skillIds: [], candidates: [], cells: {}, createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z' }], customSkills: [], templates: [], rosters: [] };
	const RACE = readJson('data/upcoming-races.json').races.find((r) => r.id === 'race-0001');
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	// ①＝育成ウマ娘＋カード6枚・①の絞り込み（先行）・レース（T21 のモックと同じ形の状態）
	const ROSTER = { umaId: 'uma-0179', cardIds: CARDS6, skillFilter: { style: 'senko' }, race: RACE };
	const SHORT = ['本育成で取得', 'レース条件不一致'];

	/** special の②で「条件で検索」を開き、距離の軸を開いた状態にする */
	const openSp = async (w, h, theme, roster) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		await sp.page.evaluate(({ roster, theme }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: roster || null, theme });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await pickEntry(sp.page, 'editor-pick');
		await sp.page.waitForSelector('[data-usd-el="results"] .usd-row', { timeout: 20000 });
		await showDistance(sp.page);
		return sp;
	};
	/** Deck 単体ページの比較シートで「条件で検索」を開き、距離の軸を開いた状態にする */
	const openDeck = async (w, h, theme) => {
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: w, height: h }, DECK);
		await dk.page.evaluate((t) => localStorage.setItem('uma-tools-theme', t), theme);
		await reloadReady(dk.page);
		await dk.page.evaluate(() => { switchTab('record'); openRecordEditor('rec1'); });
		await dk.page.waitForTimeout(300);
		await dk.page.click('button[onclick="openRecordSkillPicker()"]');
		await dk.page.waitForSelector('[data-usd-el="results"] .usd-row', { timeout: 20000 });
		await showDistance(dk.page);
		return dk;
	};
	const showDistance = async (page) => {
		const st = await page.evaluate(() => ({ sel: document.querySelector('.usd-tab[data-usd-axis="distance"]').getAttribute('aria-selected') === 'true', open: document.querySelector('[data-usd-el="axis-tabs"]').getAttribute('data-usd-open') === 'true' }));
		if (!st.sel || !st.open) await page.click('.usd-tab[data-usd-axis="distance"]');
		await page.waitForTimeout(200);
	};
	const pickDist = async (page, values) => {
		for (const v of values) await page.click('.usd-tabpanel.is-active [data-usd-el="filter-check"][data-value="' + v + '"]');
		await page.waitForTimeout(250);
	};
	/** 見える行の数・寸法・件数 */
	const readLayout = (page) => page.evaluate(() => {
		const panel = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel');
		const res = panel.querySelector('[data-usd-el="results"]');
		const rb = res.getBoundingClientRect();
		const foot = panel.querySelector('[data-usd-el="picker-footer"]').getBoundingClientRect();
		const lim = Math.min(rb.bottom - 1, foot.top, innerHeight);
		const rows = Array.from(res.querySelectorAll('.usd-row'));
		const H = (sel) => { const e = panel.querySelector(sel); return e && e.getBoundingClientRect().height ? Math.round(e.getBoundingClientRect().height) : null; };
		const body = panel.querySelector('[data-usd-el="picker-body"]');
		return {
			inView: rows.filter((x) => { const b = x.getBoundingClientRect(); return b.top >= rb.top - 0.5 && b.bottom <= lim + 0.5; }).length,
			rows: rows.length, addable: rows.filter((x) => !x.classList.contains('usd-row--excluded')).length,
			count: panel.querySelector('[data-usd-el="result-count"]').textContent,
			countEl: !!panel.querySelector('[data-usd-el="result-excluded"]'), sentence: /選べない|に合わないため/.test(panel.querySelector('[data-usd-el="mode-filter"]').textContent.replace(/(本育成で取得|レース条件不一致)/g, '')),
			tab: H('.usd-tab:not([aria-selected="true"])'), opt: H('.usd-tabpanel.is-active .usd-opt'), commit: H('[data-usd-el="picker-commit"]'), close: H('[data-usd-act="picker-close"]'),
			low: H('[data-usd-el="low-toggle"]'), selectAll: H('.usd-selrow > label'), item: H('.usd-summary-item'), clearAxis: H('.usd-tabpanel.is-active [data-usd-act="filter-clear-axis"]'), clearAll: H('[data-usd-act="filter-clear-all"]'),
			row: H('[data-usd-el="results"] .usd-row'), rowsAttr: panel.querySelector('[data-usd-el="tabbar"]').getAttribute('data-usd-rows'),
			minFont: Math.min(...Array.from(panel.querySelectorAll('*')).filter((e) => e.offsetParent && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize))),
			bodyScroll: body.scrollHeight - body.clientHeight, hx: document.documentElement.scrollWidth > innerWidth + 1
		};
	});
	/** 小窓の中の要素の色に、緑（--uma-accent 系のトークンの解決値）が残っていないか。パッシブ（緑スキル）の名前の色は除く */
	const readGreen = (page) => page.evaluate(() => {
		const panel = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel');
		const probe = document.createElement('div');
		panel.appendChild(probe);
		const tok = {};
		['--uma-accent', '--uma-accent-soft', '--uma-accent-border', '--uma-accent-soft-text', '--uma-accent-ring', '--uma-accent-hover'].forEach((t) => {
			probe.style.color = 'var(' + t + ')';
			const v = getComputedStyle(probe).color;
			if (v && v !== getComputedStyle(panel).color) tok[t] = v;
		});
		const res = {};
		['--usd-ui-set', '--usd-ui-sel', '--uma-control-mark', '--uma-control-soft', '--uma-control'].forEach((t) => { probe.style.color = 'var(' + t + ')'; res[t] = getComputedStyle(probe).color; });
		probe.remove();
		const vals = new Set(Object.values(tok));
		const props = ['color', 'background-color', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'outline-color', 'accent-color', 'box-shadow', 'text-decoration-color'];
		const hits = [];
		panel.querySelectorAll('*').forEach((e) => {
			if (!e.getClientRects().length) return;
			if (e.closest('.usd-roster-skillname--passive')) return;
			const cs = getComputedStyle(e);
			props.forEach((p) => { const v = cs.getPropertyValue(p); vals.forEach((g) => { if (v && v.indexOf(g) !== -1) hits.push((e.getAttribute('data-usd-el') || e.className || e.tagName) + ' ' + p + '=' + g); }); });
		});
		const on = panel.querySelector('.usd-tabpanel.is-active .usd-opt input:checked');
		const onLab = on ? getComputedStyle(on.closest('.usd-opt')) : null;
		const cb = panel.querySelector('[data-usd-act="picker-select-all"]');
		return { tok, hits: hits.slice(0, 10), nHits: hits.length, sel: onLab ? { bg: onLab.backgroundColor, border: onLab.borderTopColor, bw: onLab.borderTopWidth, shadow: onLab.boxShadow, fw: onLab.fontWeight, mark: getComputedStyle(on, '::after').display } : null,
			want: res, cbAccent: getComputedStyle(cb).accentColor };
	});
	/** 選べない行の表し方 */
	const readExcluded = (page) => page.evaluate(() => {
		const res = document.querySelector('[data-usd-el="results"]');
		const probe = document.createElement('div');
		res.appendChild(probe);
		probe.style.background = 'var(--uma-surface-sunken)';
		const sunk = getComputedStyle(probe).backgroundColor;
		probe.remove();
		const ex = Array.from(res.querySelectorAll('label.usd-row--excluded'));
		const ok = Array.from(res.querySelectorAll('label.usd-row:not(.usd-row--excluded)'));
		const one = (r) => { const n = r.querySelector('[data-usd-info]'); const i = r.querySelector('input'); return { deco: getComputedStyle(n).textDecorationLine, bg: getComputedStyle(r).backgroundColor, color: getComputedStyle(n).color, op: getComputedStyle(i).opacity, dis: i.disabled, reason: (r.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || '' }; };
		return { sunk, ex: ex.map(one), ok: ok.slice(0, 20).map(one) };
	});
	const checkSizes = (tag, r) => {
		// タブは2段（スマホ）で 30・1行（PC）で 32（選んだタブは持ち上げ 3px で 35。T21 のモックの値）
		const tabWant = r.rowsAttr === '1' ? 32 : 30;
		assert(r.tab === tabWant && r.opt === 26 && r.commit === 32 && r.close === 28, tag + '押せる大きさ: タブ ' + tabWant + '・選択肢 26・追加 32・× 28', { tab: r.tab, opt: r.opt, commit: r.commit, close: r.close, rows: r.rowsAttr });
		assert(r.low === 28 && r.selectAll >= 24, tag + '「効果『ちょっと』以下を除外」28・「表示中を全て選択」24 以上', { low: r.low, selectAll: r.selectAll });
		assert(r.row === 25 && r.minFont >= 11, tag + '一覧の行 25・いちばん小さい文字は 11px 以上', { row: r.row, minFont: r.minFont });
		assert(r.bodyScroll === 0 && !r.hx, tag + '小窓の本文はスクロールせず、横スクロールも無い', { bodyScroll: r.bodyScroll, hx: r.hx });
	};

	await block('T27条件で検索(1) 見える行の数（距離の軸を開いた状態）: 375×812 17行以上・375×667 11行以上・390×844 18行以上・PC 1280×800 17行以上（何も選んでいない／短距離・中距離を選んだ／①の絞り込みとレースを入れた状態）・押せる大きさ・横スクロールなし', async () => {
		const seen = [];
		for (const [w, h, min] of [[375, 812, 17], [375, 667, 11], [390, 844, 18], [1280, 800, 17]]) {
			const tag = 'T27条件で検索(1) ' + w + '×' + h + ': ';
			const sp = await openSp(w, h, 'light', null);
			const a = await readLayout(sp.page);
			await pickDist(sp.page, ['short', 'medium']);
			const b = await readLayout(sp.page);
			assert(a.inView >= min && b.inView >= min, tag + '見える行は ' + min + '行以上（何も選んでいない ' + a.inView + '・短距離と中距離 ' + b.inView + '）', { a: a.inView, b: b.inView });
			checkSizes(tag, a);
			assert(b.item === 24 && b.clearAxis === 24 && b.clearAll === 24, tag + '「絞り込み中」の札・「この軸を解除」「すべて解除」は 24', { item: b.item, clearAxis: b.clearAxis, clearAll: b.clearAll });
			assert(a.rowsAttr === (w > 640 ? '1' : 'multi'), tag + 'タブはスマホで2段・PC で1行（data-usd-rows の判定）', a.rowsAttr);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
			const sp2 = await openSp(w, h, 'light', ROSTER);
			const c = await readLayout(sp2.page);
			assert(c.inView >= min && c.addable > 0 && c.rows > c.addable, tag + '①の絞り込み＋レース: 見える行は ' + min + '行以上（' + c.inView + '）', { inView: c.inView, rows: c.rows, addable: c.addable });
			checkSizes(tag + '①＋レース: ', c);
			assert(jsErrors(sp2.errors).length === 0, tag + '①＋レース: コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
			await sp2.ctx.close();
			seen.push(w + '×' + h + ' ' + a.inView + '/' + b.inView + '/' + c.inView);
		}
		assert(seen.length === 4, 'T27条件で検索(1) 実測（何も選んでいない/短距離・中距離/①＋レース）: ' + seen.join('・'), seen);
	});

	await block('T27条件で検索(2) ①の絞り込みに合わないスキルは一覧に無い・レース条件不一致／本育成で取得の行は右に短い表記・名前に取り消し線・行を薄く・押せない・件数の文は無く N は追加できる数（375×812・1280×800 × ライト・ダーク）', async () => {
		for (const [w, h] of [[375, 812], [1280, 800]]) for (const theme of ['light', 'dark']) {
			const tag = 'T27条件で検索(2) ' + w + 'px ' + theme + ': ';
			const sp = await openSp(w, h, theme, ROSTER);
			const ids = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="results"] label.usd-row input')).map((i) => i.value));
			// ①の判定（matchesFilters に①と同じ材料：①の脚質とレースで固定した距離・バ場）で合わないもの。レース条件・本育成で選べない行は先の理由なので除く
			const misfit = await sp.page.evaluate(({ ids, sel }) => {
				const C = UmaSkillDeckCore;
				const hidden = C.getPickerHiddenIds();
				const rows = Array.from(document.querySelectorAll('[data-usd-el="results"] label.usd-row'));
				const race = new Set(rows.filter((r) => /レース条件/.test((r.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || '')).map((r) => r.querySelector('input').value));
				return ids.filter((id) => !hidden.includes(id) && !race.has(id) && !C.matchesFilters(C.findSkill(id), { style: [sel] }, null));
			}, { ids, sel: ROSTER.skillFilter.style });
			assert(ids.length > 0 && misfit.length === 0, tag + '一覧（' + ids.length + '件）に、①の絞り込み（脚質）に合わないスキルが無い', misfit.slice(0, 5));
			const r = await readLayout(sp.page);
			assert(!r.countEl && !r.sentence && r.count === r.addable + '件', tag + '件数の文は無く、「絞り込み結果（N件）」の N は追加できる行の数（' + r.count + '）', { countEl: r.countEl, sentence: r.sentence, count: r.count, addable: r.addable });
			const e = await readExcluded(sp.page);
			const reasons = Array.from(new Set(e.ex.map((x) => x.reason)));
			assert(SHORT.every((s) => reasons.includes(s)) && reasons.every((s) => SHORT.includes(s)), tag + '選べない行の右は「本育成で取得」「レース条件不一致」だけ', reasons);
			const badEx = e.ex.filter((x) => !/line-through/.test(x.deco) || x.bg !== e.sunk || x.op !== '0.45' || !x.dis);
			assert(e.ex.length > 0 && badEx.length === 0, tag + '選べない行（' + e.ex.length + '件）: 名前に取り消し線・地 --uma-surface-sunken（' + e.sunk + '）・チェックボックス 45%・押せない', badEx.slice(0, 3));
			const badOk = e.ok.filter((x) => /line-through/.test(x.deco) || x.bg === e.sunk || x.op !== '1' || x.dis);
			assert(e.ok.length > 0 && badOk.length === 0, tag + '選べる行は取り消し線なし・地を沈めない・100%・押せる', badOk.slice(0, 3));
			// 押しても足さない（保険の経路）
			const exId = await sp.page.evaluate(() => { const i = document.querySelector('[data-usd-el="results"] label.usd-row--excluded input'); i.disabled = false; i.click(); return i.value; });
			await sp.page.waitForTimeout(150);
			const cnt = await sp.page.evaluate(() => document.querySelector('[data-usd-el="picker-checked-count"]').textContent);
			assert(cnt === '0種選択', tag + '選べない行は押せてしまってもチェックに入らない', { exId, cnt });
			// 題名の右の①の絞り込みの値（C-244）は今のまま
			const head = await sp.page.evaluate(() => { const s = document.querySelector('[data-usd-el="picker-roster-filter"]'); return s.hidden ? '' : s.textContent; });
			assert(/先行/.test(head), tag + '題名の右の①の絞り込みの値（C-244）は出たまま（' + head + '）', head);
			assert(!r.hx && jsErrors(sp.errors).length === 0, tag + '横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T27条件で検索(3) 色: 緑（--uma-accent 系）が残っていない（パッシブの名前は除く）・選んだ選択肢は地 --usd-ui-set・枠 --usd-ui-sel の 2px・太字・○の印なし・チェックボックスは --uma-control-mark（special 375・1280／Deck 375・1280 × ライト・ダーク）', async () => {
		for (const pageKind of ['special', 'deck']) for (const [w, h] of [[375, 812], [1280, 800]]) for (const theme of ['light', 'dark']) {
			const tag = 'T27条件で検索(3) ' + pageKind + ' ' + w + 'px ' + theme + ': ';
			const sp = pageKind === 'special' ? await openSp(w, h, theme, null) : await openDeck(w, h, theme);
			await pickDist(sp.page, ['short', 'medium']);
			const g = await readGreen(sp.page);
			assert(Object.keys(g.tok).length >= 3, tag + '前提: 緑のトークンの値を読めた', g.tok);
			assert(g.nHits === 0, tag + '小窓の中に緑の色が無い（' + g.nHits + '件）', g.hits);
			const set = pageKind === 'special' ? g.want['--usd-ui-set'] : g.want['--uma-control-soft'];
			const sel = pageKind === 'special' ? g.want['--usd-ui-sel'] : g.want['--uma-control-mark'];
			assert(g.sel && g.sel.bg === set && g.sel.border === sel && g.sel.bw === '1px' && g.sel.shadow.indexOf(sel) !== -1 && g.sel.shadow.indexOf('inset') !== -1 && g.sel.fw === '700',
				tag + '選んだ選択肢: 地 ' + set + '・枠 ' + sel + '（1px＋内側 1px＝2px）・太字', { sel: g.sel, set, selColor: sel });
			assert(g.cbAccent === g.want['--uma-control-mark'], tag + 'チェックボックスは --uma-control-mark', { got: g.cbAccent, want: g.want['--uma-control-mark'] });
			const badge = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="axis-count"][data-usd-axis="distance"]'); const p = document.createElement('div'); b.parentElement.appendChild(p); p.style.color = 'var(--uma-control)'; const c = getComputedStyle(p).color; p.remove(); return { bg: getComputedStyle(b).backgroundColor, want: c, hidden: b.hidden, text: b.textContent }; });
			assert(!badge.hidden && badge.text === '2' && badge.bg === badge.want, tag + 'タブの件数の印は --uma-control の塗り', badge);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T27条件で検索(4) Deck 単体ページでも同じ: 見える行の数（375×812 17行以上・1280×800 17行以上）・押せる大きさ・件数の文が無い・横スクロールなし（ライト・ダーク）', async () => {
		for (const [w, h] of [[375, 812], [1280, 800]]) for (const theme of ['light', 'dark']) {
			const tag = 'T27条件で検索(4) Deck ' + w + 'px ' + theme + ': ';
			const dk = await openDeck(w, h, theme);
			const a = await readLayout(dk.page);
			assert(a.inView >= 17, tag + '見える行は 17行以上（' + a.inView + '）', a.inView);
			checkSizes(tag, a);
			assert(!a.countEl && a.count === a.addable + '件', tag + '件数の文は無く、N は追加できる行の数', { countEl: a.countEl, count: a.count });
			assert(jsErrors(dk.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(dk.errors).slice(0, 3));
			await dk.ctx.close();
		}
	});

	await block('T27条件で検索(5) 目標のレースの距離のエラーの文は出たときだけ場所を取る・PC でも選んでいない軸のパネルは場所を取らない（1280×800・375×812）', async () => {
		for (const [w, h] of [[1280, 800], [375, 812]]) {
			const tag = 'T27条件で検索(5) ' + w + 'px: ';
			const sp = await openSp(w, h, 'light', null);
			const read = () => sp.page.evaluate(() => {
				const e = document.querySelector('[data-usd-el="target-distance-error"]');
				return { tp: Math.round(document.querySelector('.usd-tabpanels').getBoundingClientRect().height), errH: Math.round(e.getBoundingClientRect().height), shown: e.getAttribute('data-shown'),
					inactive: Array.from(document.querySelectorAll('.usd-tabpanel:not(.is-active)')).filter((p) => p.getBoundingClientRect().height > 0).length };
			});
			const a = await read();
			await sp.page.fill('[data-usd-el="target-distance"]', 'abc');
			await sp.page.waitForTimeout(200);
			const b = await read();
			assert(a.shown === 'false' && a.errH === 0 && b.shown === 'true' && b.errH > 0 && b.tp > a.tp, tag + 'エラーが無いときは場所を取らず（0）、出ると取る（パネル ' + a.tp + ' → ' + b.tp + '）', { a, b });
			assert(a.inactive === 0, tag + '選んでいない軸のパネルは場所を取らない', a);
			await sp.page.click('.usd-tab[data-usd-axis="style"]');
			await sp.page.waitForTimeout(200);
			const c = await read();
			assert(c.inactive === 0 && c.tp < b.tp, tag + '軸を替えると、パネルの高さはその軸の中身で決まる（' + b.tp + ' → ' + c.tp + '）', c);
			await sp.ctx.close();
		}
	});
}
