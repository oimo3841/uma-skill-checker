// 「テキストで検索」の小窓の直しと、.usd-modal を開いている間の背景のスクロールの止め方（T38・2026-10-31 おいもさんの決定。T35 の報告の推奨をすべて採用）の検査。
// run-smoke.mjs の末尾から register81() で呼ばれる（塊の見出しはすべて「T38テキストで検索の直し」で始まる。`npm run test:visual -- --only=T38テキストで検索の直し` で回せる）。
//
// 決め:
//  (1) スマホ幅（640px 以下）の小窓の形は T35 のモックの a3: 並びは今のまま（入力欄 → 候補 → 追加候補の欄 → 下の帯）＋小窓の器を見える高さ（visualViewport の height・offsetTop）に合わせる。
//  (2) 候補の一覧は 10.5行（265px）。(3) 追加候補の欄は札4段＋5段目の半分（中 150px・枠こみ 152px）。狭いときは一覧が先に縮み（3行まで）、欄は札1段＋半分まで。
//  (4) 背景の止め方は lock=2（html・body の overflow: hidden ＋ body を今の位置で fixed ＋ 小窓の中の touchmove の見張り）。(5) core の .usd-modal の小窓すべて（開いている数を数える）。
//  (6) 入力が空のときも一覧の場所を取っておく。(7) PC（641px 以上）のこの小窓は今の形のまま（止め方は PC にも入る）。(8) Deck の引き出し（iframe）の中は親の visualViewport に合わせる。
// iPhone のキーボードは Playwright では出せないので、visualViewport を差し替えた形（レイアウトは 812 のまま）と、ウィンドウごと縮めた形で測る。
// スキル名は検査の側に書かない（恒久ルール1）。入力の文字は今の検査（blocks-78）と同じ「○」「コーナー」だけ。

import { pickEntry } from './lib/entry-search.mjs';
import { reloadReady } from './lib/page-ready.mjs';

export async function register81(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const sleep = (page, ms) => page.waitForTimeout(ms);
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const DECK = { schemaVersion: 7, records: [{ recordId: 'rec1', name: 'シート', sourceTemplateId: null, skillIds: [], candidates: [], cells: {}, createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z' }], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const ROSTER = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
	const M = '[data-usd-el="mode-search"] ';
	const INPUT = '[data-usd-el="search-input"]';
	// 見える高さの差し替え（iPhone の Safari と同じく、レイアウトの高さは変えず visualViewport だけを縮める）
	const fakeVv = (page, h) => page.evaluate((H) => {
		const ls = {};
		const fake = { width: innerWidth, height: H, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
			addEventListener: (t, f) => { (ls[t] = ls[t] || []).push(f); }, removeEventListener() {} };
		Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
		window.__t38vvFire = () => (ls.resize || []).forEach((f) => f());
	}, h);
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		await sp.page.evaluate(({ roster, theme, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', tab);
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: o.roster || null, theme: o.theme || 'light', tab: o.tab || '1' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sleep(sp.page, 300);
		return sp;
	};
	const openSearchSp = async (o = {}) => {
		const sp = await openSp(o);
		if (o.vv) await fakeVv(sp.page, o.vv);
		await pickEntry(sp.page, 'editor-pick-search');
		await sp.page.waitForSelector(M + INPUT, { state: 'visible', timeout: 10000 });
		return sp;
	};
	/** 欄に n 個の札を入れてから、入力を q にする（一覧・欄の中のスクロールは上へ） */
	const fillUp = async (page, n, q) => {
		await page.fill(INPUT, '○'); await sleep(page, 150);
		const ids = await page.evaluate((k) => Array.from(document.querySelectorAll('[data-usd-el="mode-search"] .usd-tsearch-row--pick')).slice(0, k).map((r) => r.getAttribute('data-skill-id')), n);
		for (const id of ids) await page.click(M + '.usd-tsearch-row[data-skill-id="' + id + '"]');
		await page.fill(INPUT, q); await sleep(page, 200);
		await page.evaluate(() => { document.querySelector('[data-usd-el="search-results"]').scrollTop = 0; document.querySelector('[data-usd-el="search-tray-in"]').scrollTop = 0; if (window.__t38vvFire) window.__t38vvFire(); });
		await sleep(page, 100);
	};
	/** 寸法と、見える範囲（上から visH）の中に全体が入っているもの */
	const measure = (page, visH) => page.evaluate((V) => {
		const panel = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel');
		const H = V || innerHeight;
		const r = (el) => el.getBoundingClientRect();
		const inV = (b) => b.top >= -0.5 && b.bottom <= H + 0.5;
		const list = panel.querySelector('[data-usd-el="search-results"]'), trayIn = panel.querySelector('[data-usd-el="search-tray-in"]');
		const L = r(list), T = r(trayIn);
		const rows = Array.from(list.querySelectorAll('.usd-tsearch-row')).filter((x) => { const b = r(x); return b.top >= L.top - 0.5 && b.bottom <= L.bottom + 0.5 && inV(b); }).length;
		const chips = Array.from(trayIn.querySelectorAll('.usd-tsearch-chip')).filter((x) => { const b = r(x); return b.top >= T.top - 0.5 && b.bottom <= T.bottom + 0.5 && inV(b); }).length;
		const body = panel.querySelector('[data-usd-el="picker-body"]');
		return { listH: Math.round(L.height * 10) / 10, trayH: Math.round(r(panel.querySelector('[data-usd-el="search-tray"]')).height * 10) / 10, trayInMax: getComputedStyle(trayIn).maxHeight,
			panelH: Math.round(r(panel).height * 10) / 10, panelW: Math.round(r(panel).width), panelTop: Math.round(r(panel).top), rows, chips,
			input: inV(r(panel.querySelector('[data-usd-el="search-input"]'))), commit: inV(r(panel.querySelector('[data-usd-el="picker-commit"]'))),
			trayBelowList: T.top >= L.bottom, bodyScroll: body.scrollHeight - body.clientHeight, hx: document.documentElement.scrollWidth > innerWidth + 1,
			fit: panel.closest('.usd-modal').getAttribute('data-usd-fit') };
	}, visH);

	await block('T38テキストで検索の直し(1) 375×812: 候補の一覧 10.5行（265px±2）・追加候補の欄 札4段＋5段目の半分（枠こみ 152px±2・それ以上は欄の中をスクロール）・並びは今のまま（ライト・ダーク。入力「コーナー」・札 14個）', async () => {
		for (const theme of ['light', 'dark']) {
			const tag = 'T38テキストで検索の直し(1) ' + theme + ': ';
			const sp = await openSearchSp({ theme });
			const p = sp.page;
			await fillUp(p, 14, 'コーナー');
			const m = await measure(p);
			const lines = await p.evaluate(() => { const t = document.querySelector('[data-usd-el="search-tray-in"]'); return { lines: new Set(Array.from(t.querySelectorAll('.usd-tsearch-chip')).map((c) => Math.round(c.offsetTop))).size, sh: t.scrollHeight, ch: t.clientHeight }; });
			assert(Math.abs(m.listH - 265) <= 2 && m.rows === 10, tag + '候補の一覧は 265px（10.5行。全体が見える行は 10）', m);
			assert(Math.abs(m.trayH - 152) <= 2 && m.trayInMax === '150px' && lines.lines >= 5 && lines.sh > lines.ch, tag + '追加候補の欄は枠こみ 152px（中 150px＝札4段＋5段目の半分）・それ以上は欄の中をスクロール', { m, lines });
			assert(m.trayBelowList && m.input && m.commit && m.bodyScroll <= 0 && !m.hx && m.fit === 'vv', tag + '並びは 入力欄 → 候補 → 欄 → 下の帯・入力欄と「追加（N種）」が見える・本文はスクロールしない・横スクロールなし', m);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T38テキストで検索の直し(2) 見える高さ 450・400・343・320（visualViewport の差し替え）とウィンドウ 375×450・400・343: 入力欄・候補 3行以上・札 6個以上・「追加（N種）」が同時に見える／一覧が先に縮む', async () => {
		const cases = [{ vv: 450 }, { vv: 400 }, { vv: 343 }, { vv: 320 }, { h: 450 }, { h: 400 }, { h: 343 }];
		for (const c of cases) {
			const tag = 'T38テキストで検索の直し(2) ' + (c.vv ? '見える高さ ' + c.vv : '375×' + c.h) + ': ';
			const sp = await openSearchSp({ h: c.h || 812, vv: c.vv });
			const p = sp.page;
			await fillUp(p, 14, 'コーナー');
			const m = await measure(p, c.vv);
			assert(m.input && m.rows >= 3 && m.chips >= 6 && m.commit, tag + '入力欄・候補 3行以上・札 6個以上（1段＋半分以上）・「追加（N種）」の全体が見える範囲に入る', m);
			assert(m.listH < 265 && m.listH >= 76 && m.trayH >= 56 && m.bodyScroll <= 0 && !m.hx, tag + '一覧が縮み（3行まで）・欄は 札1段＋半分以上・本文はスクロールしない・横スクロールなし', m);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T38テキストで検索の直し(3) PC 1280×800 は今の形のまま（小窓 672×720・一覧が残りを受け取る 466px・欄 84px・見える高さに合わせない）', async () => {
		const sp = await openSearchSp({ w: 1280, h: 800 });
		const p = sp.page;
		await fillUp(p, 14, 'コーナー');
		const m = await measure(p);
		// 値は変更前（72d56f4）の製品で同じ手順で測ったもの
		assert(m.panelW === 672 && m.panelH === 720 && m.panelTop === 56 && Math.abs(m.listH - 466) <= 0.5 && m.trayH === 84 && m.fit === null && !m.hx,
			'T38テキストで検索の直し(3) PC: 小窓 672×720（上端 56）・一覧 466px・欄 84px・data-usd-fit なし', m);
		assert(jsErrors(sp.errors).length === 0, 'T38テキストで検索の直し(3) PC: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T38テキストで検索の直し(4) 入力が空のときも一覧の場所を取っておく（打ち始めても小窓の高さが変わらない・空の箱は見えない）', async () => {
		const sp = await openSearchSp();
		const p = sp.page;
		const read = () => p.evaluate(() => {
			const panel = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel');
			const list = panel.querySelector('[data-usd-el="search-results"]');
			const ph = getComputedStyle(panel.querySelector('.usd-tsearch'), '::after');
			return { h: Math.round(panel.getBoundingClientRect().height * 10) / 10, listHidden: list.hidden, ph: ph.content, phH: ph.height, trayTop: Math.round(panel.querySelector('[data-usd-el="search-tray"]').getBoundingClientRect().top) };
		});
		const a = await read();
		await p.fill(INPUT, 'コーナー'); await sleep(p, 200);
		const b = await read();
		await p.fill(INPUT, ''); await sleep(p, 200);
		const c = await read();
		assert(a.listHidden && !b.listHidden && a.h === b.h && b.h === c.h && a.trayTop === b.trayTop, 'T38テキストで検索の直し(4) 空 → 入力 → 空で小窓の高さ・欄の位置が変わらない', { a, b, c });
		assert(a.ph === '""' && b.ph === 'none', 'T38テキストで検索の直し(4) 空のときだけ一覧の場所に見えない箱（::after）を置く', { a, b });
		await sp.ctx.close();
	});

	// 背景の止め方: 状態（スクロール位置・body の固定・sticky の位置・横に送った部品と swipeScrollersAt）
	const state = (page) => page.evaluate(() => {
		const b = document.body;
		const top = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top * 10) / 10 : null; };
		const scs = Array.from(document.querySelectorAll('body *')).filter((e) => { if (e.closest('.usd-modal')) return false; const o = getComputedStyle(e).overflowX; return (o === 'auto' || o === 'scroll') && e.scrollWidth > e.clientWidth + 1; });
		if (scs[0] && !scs[0].__t38) { scs[0].__t38 = 1; scs[0].scrollLeft = 30; }
		const target = scs[0] ? (scs[0].querySelector('*') || scs[0]) : document.body.firstElementChild;
		const sw = UmaSkillDeckCore.swipeScrollersAt(target, document.body).map((s) => (s.el.className || s.el.tagName) + ':' + s.left);
		return { y: Math.round(scrollY), pos: getComputedStyle(b).position, top: b.style.top, ovf: getComputedStyle(document.documentElement).overflowY, cls: document.documentElement.classList.contains('usd-modal-open'),
			header: top('.site-header'), setbar: top('#deck-set-bar'), sw };
	});
	const tall = (page) => page.evaluate(() => { if (!document.getElementById('__t38tall')) { const d = document.createElement('div'); d.id = '__t38tall'; d.style.height = '2400px'; document.body.appendChild(d); } });
	const same = (a, b) => a.y === b.y && a.header === b.header && a.setbar === b.setbar && JSON.stringify(a.sw) === JSON.stringify(b.sw) && a.pos === b.pos && a.top === b.top && a.cls === b.cls;
	// Playwright の click は押す前に要素を見える位置へスクロールするので、開け閉めは DOM の click() で行う（ページの位置を動かさない）
	const domClick = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.click(); }, sel);
	const entryDom = async (page, act) => { await domClick(page, '#deck-template-panel [data-usd-act="entry-search"]'); await sleep(page, 100); await domClick(page, '[data-usd-el="entry-search-list"] [data-usd-act="' + act + '"]'); };
	const lockCase = async (page, tag, open, close, expectLock = true) => {
		await page.evaluate(() => window.scrollTo(0, 420));
		await sleep(page, 150);
		const before = await state(page);
		await open();
		await sleep(page, 250);
		const during = await state(page);
		if (expectLock) assert(before.y === 420 && during.pos === 'fixed' && during.top === '-420px' && during.cls && during.ovf === 'hidden', tag + ': 開くと body が今の位置で fixed（top -420px）・html に .usd-modal-open', { before, during });
		else assert(during.pos === before.pos && !during.cls, tag + ': .usd-modal ではないので固定しない', { before, during });
		await close();
		await sleep(page, 250);
		const after = await state(page);
		assert(same(before, after), tag + ': 閉じると元に戻る（スクロール位置 420・sticky の帯の位置・横に送った部品と swipeScrollersAt）', { before, after });
	};

	await block('T38テキストで検索の直し(5) 背景の止め方 special: .usd-modal の小窓（テキストで検索・条件で検索・緑スキル・リストを貼り付け・スクショの読み取り結果・オススメサポ・脚質オススメ）／2つ重ねて開く／.usd-modal でない小窓（イベントの小窓）は固定しない（375×812・1280×800）', async () => {
		for (const [w, h] of [[375, 812], [1280, 800]]) {
			const pre = 'T38テキストで検索の直し(5) ' + w + '×' + h + ' ';
			const sp = await openSp({ w, h, roster: ROSTER, tab: '0' });
			const p = sp.page;
			await p.waitForSelector('#deck-template-panel [data-usd-el="outside-open"]', { state: 'attached', timeout: 10000 }).catch(() => {});
			await tall(p);
			const closePicker = () => domClick(p, '.usd-modal:not([hidden]) [data-usd-act="picker-close"]');
			await lockCase(p, pre + 'テキストで検索', () => entryDom(p, 'editor-pick-search'), closePicker);
			await lockCase(p, pre + '条件で検索', () => entryDom(p, 'editor-pick'), closePicker);
			await lockCase(p, pre + '緑スキルを追加', () => entryDom(p, 'editor-pick-passive'), closePicker);
			await lockCase(p, pre + 'リストを貼り付けて追加', () => entryDom(p, 'editor-pick-text'), closePicker);
			await lockCase(p, pre + 'スクショで追加の読み取り結果', () => p.evaluate(() => UmaSkillDeckCore.openSkillRowsPicker([], () => {}, [], null, {})), closePicker);
			await lockCase(p, pre + 'オススメサポ', () => domClick(p, '#deck-template-panel [data-usd-el="outside-open"]'), () => domClick(p, '.usd-modal:not([hidden]) [data-usd-act="outside-close"]'));
			await lockCase(p, pre + '脚質オススメ', () => domClick(p, '#deck-template-panel [data-usd-el="style-open"]'), () => domClick(p, '.usd-modal:not([hidden]) [data-usd-act="style-close"]'));
			// 重ねて開く: オススメサポ → その上にテキストで検索 → 検索を閉じても固定が続く → オススメサポも閉じたら戻る
			await p.evaluate(() => window.scrollTo(0, 420));
			await sleep(p, 150);
			const before = await state(p);
			await domClick(p, '#deck-template-panel [data-usd-el="outside-open"]');
			await sleep(p, 200);
			await p.evaluate(() => UmaSkillDeckCore.openTextSearchPicker([], () => {}));
			await sleep(p, 200);
			const two = await p.evaluate(() => document.querySelectorAll('body > .usd-modal:not([hidden])').length);
			await domClick(p, '.usd-modal:not([hidden]) [data-usd-act="picker-close"]');
			await sleep(p, 200);
			const one = await state(p);
			assert(two === 2 && one.pos === 'fixed' && one.cls && one.top === '-420px', pre + '2つ重ねて開き、1つ閉じても固定が続く', { two, one });
			await domClick(p, '.usd-modal:not([hidden]) [data-usd-act="outside-close"]');
			await sleep(p, 250);
			const after = await state(p);
			assert(same(before, after), pre + '2つとも閉じたら元に戻る', { before, after });
			await lockCase(p, pre + 'イベントの小窓（共有の小窓 .uma-popover）', async () => {
				await domClick(p, '#deck-roster-panel [data-usd-el="col-menu-btn"]');
				await sleep(p, 150);
				await domClick(p, '[data-usd-el="colmenu-events"]');
			}, () => p.keyboard.press('Escape'), false);
			assert(jsErrors(sp.errors).length === 0, pre + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T38テキストで検索の直し(6) 背景の止め方 Deck 単体ページ: テキストで検索・条件で検索・緑スキル・リストを貼り付け／core の外で作った .usd-modal（取り込みの小窓と同じ作り）も MutationObserver が拾う', async () => {
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 375, height: 812 }, DECK);
		const d = dk.page;
		await sleep(d, 300);
		await d.evaluate(() => { switchTab('record'); openRecordEditor('rec1'); });
		await sleep(d, 400);
		await tall(d);
		const closeD = () => domClick(d, '.usd-modal:not([hidden]) [data-usd-act="picker-close"]');
		const pre = 'T38テキストで検索の直し(6) Deck ';
		await lockCase(d, pre + 'テキストで検索', () => d.evaluate(() => UmaSkillDeckCore.openTextSearchPicker([], () => {})), closeD);
		await lockCase(d, pre + '条件で検索', () => d.evaluate(() => UmaSkillDeckCore.openSkillPicker([], () => {})), closeD);
		await lockCase(d, pre + '緑スキルを追加', () => d.evaluate(() => UmaSkillDeckCore.openPassiveSkillPicker([], () => {})), closeD);
		await lockCase(d, pre + 'リストを貼り付けて追加', () => d.evaluate(() => UmaSkillDeckCore.openTextSkillPicker([], () => {})), closeD);
		await lockCase(d, pre + 'core の外で作った .usd-modal', () => d.evaluate(() => {
			let m = document.getElementById('__t38m');
			if (!m) { m = document.createElement('div'); m.id = '__t38m'; m.className = 'usd-modal'; m.hidden = true; m.innerHTML = '<div class="usd-modal-panel">x</div>'; document.body.appendChild(m); }
			m.hidden = false;
		}), () => d.evaluate(() => { document.getElementById('__t38m').hidden = true; }));
		// 開いたまま要素ごと外しても、固定は解ける（開いている数を数え直す）
		await d.evaluate(() => window.scrollTo(0, 420));
		await sleep(d, 100);
		await d.evaluate(() => { document.getElementById('__t38m').hidden = false; });
		await sleep(d, 150);
		const on = await state(d);
		await d.evaluate(() => document.getElementById('__t38m').remove());
		await sleep(d, 150);
		const off = await state(d);
		assert(on.pos === 'fixed' && off.pos === 'static' && off.y === 420 && !off.cls, pre + '開いたまま要素ごと外すと固定が解け、位置が戻る', { on, off });
		assert(jsErrors(dk.errors).length === 0, pre + 'コンソールのエラー0', jsErrors(dk.errors).slice(0, 3));
		await dk.ctx.close();
	});

	await block('T38テキストで検索の直し(7) 指の動きの見張り: 送れない所（入力欄の外の見出し・暗い背景・溢れていない箱）では止め、送れる箱の中でまだ送れる向きだけ通す・端では止める・入力欄の中は止めない', async () => {
		const sp = await openSearchSp();
		const p = sp.page;
		await p.fill(INPUT, '○'); await sleep(p, 200);
		const r = await p.evaluate(() => {
			const modal = document.querySelector('.usd-modal:not([hidden])');
			const list = modal.querySelector('[data-usd-el="search-results"]');
			const fire = (el, y0, y1) => {
				const t0 = new Touch({ identifier: 1, target: el, clientX: 100, clientY: y0 });
				const t1 = new Touch({ identifier: 1, target: el, clientX: 100, clientY: y1 });
				el.dispatchEvent(new TouchEvent('touchstart', { touches: [t0], targetTouches: [t0], changedTouches: [t0], bubbles: true, cancelable: true }));
				const mv = new TouchEvent('touchmove', { touches: [t1], targetTouches: [t1], changedTouches: [t1], bubbles: true, cancelable: true });
				el.dispatchEvent(mv);
				return mv.defaultPrevented;
			};
			const row = list.querySelector('.usd-tsearch-row');
			list.scrollTop = 0;
			const atTopPullDown = fire(row, 300, 340);   // 上端でさらに下へ引く → 止める
			const atTopPushUp = fire(row, 340, 300);     // 上端から上へ送る → 通す
			list.scrollTop = list.scrollHeight;
			const atBottomPushUp = fire(row, 340, 300);  // 下端でさらに上へ送る → 止める
			const atBottomPullDown = fire(row, 300, 340); // 下端から下へ戻す → 通す
			return { overflow: list.scrollHeight > list.clientHeight, atTopPullDown, atTopPushUp, atBottomPushUp, atBottomPullDown,
				head: fire(modal.querySelector('.usd-picker-head'), 100, 160), back: fire(modal, 100, 160), input: fire(modal.querySelector('[data-usd-el="search-input"]'), 100, 160),
				count: fire(modal.querySelector('[data-usd-el="search-count"]'), 100, 160) };
		});
		assert(r.overflow && r.atTopPullDown && !r.atTopPushUp && r.atBottomPushUp && !r.atBottomPullDown, 'T38テキストで検索の直し(7) 候補の一覧: まだ送れる向きは通し、端の先は止める', r);
		assert(r.head && r.back && r.count && !r.input, 'T38テキストで検索の直し(7) 見出し・暗い背景・件数の上では止め、入力欄の中は止めない', r);
		await sp.ctx.close();
	});

	await block('T38テキストで検索の直し(8) Deck の引き出し（special の中の iframe）: 親のページの visualViewport に合わせる（見える高さ 450・343 の差し替え。入力欄・候補 3行以上・「追加（N種）」が見える）', async () => {
		for (const vvH of [0, 450, 343]) {
			const tag = 'T38テキストで検索の直し(8) ' + (vvH ? '見える高さ ' + vvH : '375×812') + ': ';
			const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
			const p = sp.page;
			for (let i = 0; i < 2; i++) if (await p.isVisible('#ui-notice')) await p.click('[data-act="notice-ok"]');
			if (vvH) await fakeVv(p, vvH);
			await p.evaluate(() => openDrawer('deck'));
			const fh = await p.waitForSelector('#deck-drawer-frame');
			let f = await fh.contentFrame();
			await f.waitForFunction(() => window.UmaSkillDeckCore && document.readyState === 'complete', null, { timeout: 15000 }).catch(async () => { f = await fh.contentFrame(); });
			await f.waitForFunction(() => window.UmaSkillDeckCore && document.readyState === 'complete', null, { timeout: 15000 });
			await f.evaluate(() => UmaSkillDeckCore.openTextSearchPicker([], () => {}));
			await f.waitForSelector(INPUT, { state: 'visible' });
			await f.fill(INPUT, '○'); await sleep(p, 200);
			const ids = await f.evaluate(() => Array.from(document.querySelectorAll('.usd-tsearch-row--pick')).slice(0, 14).map((r) => r.getAttribute('data-skill-id')));
			for (const id of ids) await f.click('.usd-tsearch-row[data-skill-id="' + id + '"]');
			await f.fill(INPUT, 'コーナー'); await sleep(p, 200);
			const fr = await p.evaluate(() => document.getElementById('deck-drawer-frame').getBoundingClientRect().top);
			const m = await f.evaluate(({ bottom }) => {
				const panel = document.querySelector('.usd-modal:not([hidden]) .usd-modal-panel');
				const modal = panel.closest('.usd-modal');
				const r = (s) => panel.querySelector(s).getBoundingClientRect();
				const inV = (b) => b.top >= -0.5 && b.bottom <= bottom + 0.5;
				const L = r('[data-usd-el="search-results"]');
				const rows = Array.from(panel.querySelectorAll('.usd-tsearch-row')).filter((x) => { const b = x.getBoundingClientRect(); return b.top >= L.top - 0.5 && b.bottom <= L.bottom + 0.5 && inV(b); }).length;
				return { fit: modal.getAttribute('data-usd-fit'), top: modal.style.top, h: modal.style.height, innerH: innerHeight, rows, input: inV(r('[data-usd-el="search-input"]')), commit: inV(r('[data-usd-el="picker-commit"]')) };
			}, { bottom: vvH ? vvH - fr : 1e9 }).catch((e) => ({ err: String(e) }));
			const want = vvH ? Math.round(vvH - fr) + 'px' : m.innerH + 'px';
			assert(m.fit === 'vv' && m.top === '0px' && m.h === want && m.rows >= 3 && m.input && m.commit, tag + '器の高さ＝親の見える範囲と iframe の重なり（' + want + '）・入力欄・候補 3行以上・「追加（N種）」が見える', { m, fr });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});
}
