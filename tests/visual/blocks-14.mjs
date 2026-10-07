// まとめ対応（2026-10-05・C-128）の検査。run-smoke.mjs の末尾から register14() で呼ばれる
// （塊の見出しはすべて「まとめ対応」で始まる。`npm run test:visual -- --only=まとめ対応` で回せる。D・E だけなら「まとめ対応D」「まとめ対応E」）。
//
// D: スマホの①の表を最後まで送ったとき、最後の行が左下の「元に戻す」と右下の「＋」に重ならない（表の中の下の余白）。
//    余白は表の中を最後まで送ったときだけ見え、ふだん見える表の高さ・行数は変わらない。PC は変えない
// E: タッチで小窓・貼り付け欄を開いても、入力欄に focus を当てない（スマホのキーボードが出ないように）。
//    描き直しでは、直前に入力欄に focus があったときだけ当て直す。マウスで開いたときは今までどおり当てる
// スキル名・カード名は検査の側に書かない（恒久ルール1）。

export async function register14(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6 };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const P = '#deck-roster-panel ';
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const MODAL = '[data-usd-el="modal"] ';
	const OM = '[data-usd-el="outside-modal"] ';

	/** special.html を開く。touch＝タッチの端末として開く（hasTouch・isMobile）。tab＝ステップのタブ。roster＝下書きの① */
	const openSp = async (o = {}) => {
		const viewport = { width: o.w || 375, height: o.h || 812 };
		let ctx, page; const errors = [];
		if (o.touch) {
			ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
			page = await ctx.newPage();
			page.setDefaultTimeout(5000);
			page.setDefaultNavigationTimeout(30000);
			page.on('pageerror', (e) => errors.push(String(e)));
			page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
			await page.addInitScript((d) => localStorage.setItem('umaSkillDeck:userData', JSON.stringify(d)), EMPTY);
			await page.goto(base + '/special.html', { waitUntil: 'networkidle', timeout: 60000 });
		} else {
			({ ctx, page } = await openPage(browser, base, 'special.html', viewport, EMPTY));
			page.on('pageerror', (e) => errors.push(String(e)));
		}
		await page.evaluate(({ roster, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster || FULL, tab: o.tab === undefined ? 0 : o.tab });
		await page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await page.waitForTimeout(300);
		return { ctx, page, errors };
	};
	/** いま focus がある要素（入力欄かどうか・data-usd-el） */
	const active = (page) => page.evaluate(() => {
		const a = document.activeElement;
		return { tag: a ? a.tagName : '', el: a && a.getAttribute ? (a.getAttribute('data-usd-el') || '') : '', input: !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') };
	});
	const blur = (page) => page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });

	/* ====================================================================
	 * D: ①の表の最後の行と、下端のボタン
	 * ==================================================================== */
	/** 表の中とページを最後まで送り、最後の2行と「元に戻す」「＋」の重なり（高さ px）を測る。「元に戻す」は出ている状態で測る */
	const measureD = (page) => page.evaluate(async () => {
		const sleep = (t) => new Promise((r) => setTimeout(r, t));
		// 「元に戻す」は元に戻せる操作のあとに出る。ここでは出ている状態の置き場を測りたいので、ページの表示関数で出す
		renderDeckUndoButton(1);
		const wrap = document.querySelector('#deck-roster-panel .usd-roster-grid-wrap');
		window.scrollTo(0, document.documentElement.scrollHeight);
		wrap.scrollTop = wrap.scrollHeight;
		await sleep(150);
		const R = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
		const ov = (a, b) => (Math.min(a.r, b.r) > Math.max(a.l, b.l) ? Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) : 0);
		const undo = R(document.getElementById('deck-undo-btn'));
		const fab = R(document.getElementById('fab-toggle'));
		const rows = Array.from(wrap.querySelectorAll('.usd-roster-grid > .usd-roster-grow')).map((row) => {
			const cs = Array.from(row.children).map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0);
			return { l: Math.min(...cs.map((r) => r.left)), t: Math.min(...cs.map((r) => r.top)), r: Math.max(...cs.map((r) => r.right)), b: Math.max(...cs.map((r) => r.bottom)) };
		});
		const last2 = rows.slice(-2).map((r) => ({ undo: Math.round(ov(r, undo)), fab: Math.round(ov(r, fab)), b: Math.round(r.b) }));
		const pad = getComputedStyle(wrap).paddingBottom;
		// ふだんの表の高さ（先頭に戻したとき）と、余白を外したときの高さ・見えている行の数
		wrap.scrollTop = 0; await sleep(50);
		const fullyVisible = () => { const w = wrap.getBoundingClientRect(); return rows.length && Array.from(wrap.querySelectorAll('.usd-roster-grid > .usd-roster-grow')).filter((row) => { const c = row.firstElementChild.getBoundingClientRect(); return c.top >= w.top - 0.5 && c.bottom <= w.bottom + 0.5; }).length; };
		const h1 = Math.round(wrap.getBoundingClientRect().height), v1 = fullyVisible();
		wrap.style.paddingBottom = '0px'; await sleep(50);
		const h0 = Math.round(wrap.getBoundingClientRect().height), v0 = fullyVisible();
		wrap.style.paddingBottom = '';
		return { rows: rows.length, last2, pad, h1, h0, v1, v0, vh: innerHeight, undoShown: undo.r > undo.l };
	});

	await block('まとめ対応D ①の表（375px・320px）: 表の中を最後まで送ると、最後の行は「元に戻す」にも「＋」にも重ならない／ふだんの表の高さと見えている行の数は変わらない', async () => {
		for (const size of [{ w: 375, h: 812 }, { w: 320, h: 568 }]) {
			const sp = await openSp({ w: size.w, h: size.h, tab: 0 });
			const m = await measureD(sp.page);
			const tag = 'まとめ対応D ' + size.w + 'px';
			assert(m.rows >= 10 && m.undoShown, tag + ': 表に行がある（' + m.rows + '行）・「元に戻す」が出ている（空振りでない）', m);
			assert(m.last2.every((x) => x.undo === 0 && x.fab === 0), tag + ': 最後の2行は「元に戻す」と「＋」に重ならない', m.last2);
			// C-132: ページ全体をスクロールする作りにしたので、表の中の 48px の余白は、ページの下の余白（「＋」の置き場）に置き換えた
			assert(m.pad === '0px', tag + ': 表の中の下の余白は 0（C-132。最後の行は、ページの下の余白で「＋」の上に出る）', m.pad);
			assert(m.h1 === m.h0 && m.v1 === m.v0, tag + ': ふだんの表の高さ・丸ごと見えている行の数は、余白の有無で変わらない', { 高さ: [m.h1, m.h0], 行: [m.v1, m.v0] });
			assert(jsErrors(sp.errors).length === 0, tag + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('まとめ対応D ①の表（1280px）: PC は変えない（表の中の下の余白は 0・ページを最後まで送ると最後の行は「＋」に重ならない）', async () => {
		const sp = await openSp({ w: 1280, h: 800, tab: 0 });
		const m = await measureD(sp.page);
		assert(m.pad === '0px', 'まとめ対応D 1280px: 表の中の下の余白は 0（PC は変えない）', m.pad);
		assert(m.last2.every((x) => x.undo === 0 && x.fab === 0), 'まとめ対応D 1280px: 最後の2行は「元に戻す」と「＋」に重ならない', m.last2);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * E: 入力欄の focus
	 * ==================================================================== */
	await block('まとめ対応E タッチ: カード・育成ウマ娘を選ぶ小窓を開いても、キーボードを閉じてから種類を押しても、入力欄に focus が移らない', async () => {
		const sp = await openSp({ touch: true, tab: 0 });
		const page = sp.page;
		const touchPoints = await page.evaluate(() => navigator.maxTouchPoints);
		assert(touchPoints > 0, 'まとめ対応E タッチの端末として開いている', touchPoints);
		await page.tap(P + '[data-usd-act="pick-card"][data-index="0"]');
		await page.waitForSelector(MODAL + '[data-usd-el="hits"]');
		const a1 = await active(page);
		assert(!a1.input, 'まとめ対応E タッチ: カードの枠を押して小窓を開いても、検索欄に focus が移らない', a1);
		// 利用者が検索欄に触れたときは focus が入る（タッチで打てなくなっていない）
		await page.tap(MODAL + '[data-usd-el="find"]');
		const a2 = await active(page);
		assert(a2.input && a2.el === 'find', 'まとめ対応E タッチ: 検索欄そのものに触れると focus が入る', a2);
		// キーボードを閉じる → 種類を押す
		await blur(page);
		const pills = await page.$$(MODAL + '[data-usd-act="type"]');
		assert(pills.length >= 2, 'まとめ対応E 種類のボタンがある（空振りでない）', pills.length);
		await pills[1].tap();
		await page.waitForTimeout(250);
		const pressed = await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((b) => b.getAttribute('aria-pressed')), MODAL + '[data-usd-act="type"]');
		const a3 = await active(page);
		assert(pressed[1] === 'true' && !a3.input, 'まとめ対応E タッチ: キーボードを閉じてから種類を押しても、検索欄に focus が戻らない（種類は切り替わっている）', { pressed, a3 });
		await page.tap(MODAL + '.uma-icon-btn[data-usd-act="cancel-pick"]');
		await page.waitForTimeout(150);
		await page.tap(P + '[data-usd-act="pick-uma"]');
		await page.waitForSelector(MODAL + '[data-usd-el="hits"]');
		const a4 = await active(page);
		assert(!a4.input, 'まとめ対応E タッチ: 育成ウマ娘の枠を押して小窓を開いても、検索欄に focus が移らない', a4);
		assert(jsErrors(sp.errors).length === 0, 'まとめ対応E タッチ: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('まとめ対応E タッチ: 「テキストで検索」を開いても、オススメサポの残りの枠からカードを選ぶ小窓を開いても、入力欄に focus が移らない／✎で開いた名前の欄には focus が入る', async () => {
		// オススメサポは①の距離・脚質・バ場が決まっていないと開かない（blocks-13 と同じ指定）
		const sp = await openSp({ touch: true, tab: 1, roster: Object.assign({}, FULL, { skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' }, outsideOptions: { count: 4, exclude: {} } }) });
		const page = sp.page;
		await page.tap(T + '[data-usd-act="editor-pick-text"]');
		await page.waitForSelector('[data-usd-el="paste-input"]', { state: 'visible' });
		const a1 = await active(page);
		assert(!a1.input, 'まとめ対応E タッチ: 「テキストで検索」を開いても、貼り付け欄に focus が移らない', a1);
		await page.tap('[data-usd-act="picker-close"]');
		await page.waitForTimeout(200);
		await page.tap(T + '[data-usd-el="outside-open"]');
		await page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 20000 });
		const slots = await page.$$(OM + '[data-usd-el="outside-slot"]');
		assert(slots.length >= 1, 'まとめ対応E オススメサポの小窓に残りの枠がある（空振りでない）', slots.length);
		await slots[0].tap();
		await page.waitForSelector('.usd-roster-modal[data-usd-over="1"] [data-usd-el="hits"]');
		const a2 = await active(page);
		assert(!a2.input, 'まとめ対応E タッチ: オススメサポの残りの枠からカードを選ぶ小窓を開いても、検索欄に focus が移らない', a2);
		await page.tap('.usd-roster-modal[data-usd-over="1"] .uma-icon-btn[data-usd-act="cancel-pick"]');
		await page.waitForTimeout(150);
		await page.tap(OM + '[data-usd-act="outside-close"]');
		await page.waitForTimeout(150);
		// ✎（打つための操作）は今までどおり、開いたときに focus が入る
		await page.tap(BAR + '[data-usd-act="name-edit"]');
		await page.waitForTimeout(150);
		const a3 = await active(page);
		assert(a3.input && a3.el === 'name', 'まとめ対応E タッチ: ✎で開いた名前の欄には focus が入る（打つための操作）', a3);
		assert(jsErrors(sp.errors).length === 0, 'まとめ対応E タッチ(2): コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('まとめ対応E マウス: 小窓・「テキストで検索」を開くと今までどおり入力欄に focus が入る／描き直しでは、直前に focus があったときだけ当て直す', async () => {
		const sp = await openSp({ w: 1280, h: 900, tab: 0 });
		const page = sp.page;
		await page.click(P + '[data-usd-act="pick-card"][data-index="0"]');
		await page.waitForSelector(MODAL + '[data-usd-el="hits"]');
		const a1 = await active(page);
		assert(a1.input && a1.el === 'find', 'まとめ対応E マウス: カードの枠を押して小窓を開くと、検索欄に focus が入る（今までどおり）', a1);
		// 描き直し（種類の切り替え）を、focus を動かさずに起こす（要素の click() は focus を移さない）
		const clickType = (i) => page.evaluate(({ sel, i }) => document.querySelectorAll(sel)[i].click(), { sel: MODAL + '[data-usd-act="type"]', i });
		await clickType(1);
		await page.waitForTimeout(150);
		const a2 = await active(page);
		assert(a2.input && a2.el === 'find', 'まとめ対応E 描き直しの前に検索欄に focus があれば、描き直したあとも検索欄にある', a2);
		await blur(page);
		await clickType(2);
		await page.waitForTimeout(150);
		const a3 = await active(page);
		assert(!a3.input, 'まとめ対応E 描き直しの前に focus が無ければ、描き直しても検索欄に当てない', a3);
		await page.click(MODAL + '.uma-icon-btn[data-usd-act="cancel-pick"]');
		await page.click('#step-tab-1');
		await page.waitForTimeout(200);
		await page.click(T + '[data-usd-act="editor-pick-text"]');
		await page.waitForSelector('[data-usd-el="paste-input"]', { state: 'visible' });
		const a4 = await active(page);
		assert(a4.input && a4.el === 'paste-input', 'まとめ対応E マウス: 「テキストで検索」を開くと、貼り付け欄に focus が入る（今までどおり）', a4);
		assert(jsErrors(sp.errors).length === 0, 'まとめ対応E マウス: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
