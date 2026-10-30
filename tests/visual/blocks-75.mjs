import { reloadReady } from './lib/page-ready.mjs';
import { clickEvents } from './lib/col-menu.mjs';
// ①②③のスワイプの受け付け範囲の直し（T23・2026-10-30 おいもさんの決定）の検査。
// run-smoke.mjs の末尾から register75() で呼ばれる（塊の見出しはすべて「T23スワイプ」で始まる。`npm run test:visual -- --only=T23スワイプ` で回せる）。
//
// 決め:
//  (A) ①の表・②の星取表の箱（.usd-roster-grid-wrap）はスワイプを外す一覧から外す（横に送れない）。
//  (B) 横に送れる部品は名前で一律に外さない。送れる中身が無ければ無いものとして扱い（切り替える）、送れる中身があれば、
//      その動きで送られたら切り替えない・送り切っていて送れなかったら切り替える。入力欄・小窓などは今までどおり外す。
//      イベントの小窓の「イベント」「スキル」のタブにも同じ決まり。
//  (C) 判定は 50px・1.5倍（水平から約34度以内）。
//  (D) 見た目は変えない。
// タッチは CDP の Input.dispatchTouchEvent で本物の入力として送る（合成の TouchEvent ではブラウザが横に送らないので、(3) の「送られる」を確かめられない）。

export async function register75(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const R = '#deck-roster-panel ';
	// ②に入れるスキル: 名前の長いもの3つと短いもの3つ（スキル名は検査の側に書かない。マスターの名前の長さから選ぶ）
	const byLen = MASTER.slice().sort((a, b) => b.name.length - a.name.length || String(a.id).localeCompare(String(b.id)));
	const IDS = byLen.slice(0, 3).concat(byLen.slice(-3)).map((s) => String(s.id));

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		await sp.page.evaluate(({ roster, tab, ids }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids }));
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster || { umaId: 'uma-0001', cardIds: CARDS6 }, tab: o.tab === undefined ? 1 : o.tab, ids: IDS });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(400);
		sp.cdp = await sp.ctx.newCDPSession(sp.page);
		await sp.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
		return sp;
	};
	const activeTab = (page) => page.evaluate(() => document.querySelector('.step-tab[aria-selected="true"]').id);
	const selectTab = async (page, i) => { await page.click('#step-tab-' + i); await page.waitForTimeout(200); };
	/** 要素の上（左端から ox px・縦の中央）に指を置き、横 dx・縦 dy だけ動かして離す（本物のタッチ入力。10歩に分けて動かす） */
	const touchSwipe = async (sp, sel, dx, dy, ox) => {
		const pt = await sp.page.evaluate(({ sel, ox, dx }) => {
			const el = typeof sel === 'string' ? document.querySelector(sel) : null;
			if (!el) return null;
			if (el.getBoundingClientRect().top < 100 || el.getBoundingClientRect().bottom > innerHeight - 140) el.scrollIntoView({ block: 'center' });
			const r = el.getBoundingClientRect();
			// 左へ払うときは右寄り、右へ払うときは左寄りから（画面の外に出ないように）
			const x = ox !== undefined ? r.left + ox : (dx < 0 ? Math.min(r.right - 8, r.left + Math.max(8, r.width - 8)) : r.left + 8);
			return { x: Math.max(4, Math.min(innerWidth - 4, x)), y: r.top + Math.min(r.height / 2, 14) };
		}, { sel, ox, dx });
		if (!pt) return { tab: null, missing: true };
		const send = (type, x, y) => sp.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
		await send('touchStart', pt.x, pt.y);
		for (let i = 1; i <= 10; i++) { await send('touchMove', pt.x + dx * i / 10, pt.y + dy * i / 10); await sp.page.waitForTimeout(16); }
		await send('touchEnd');
		await sp.page.waitForTimeout(250);
		return { tab: await activeTab(sp.page), x: pt.x, y: pt.y };
	};
	// ②のスキル名の部分（横に送れる部品）を、送れる中身があるかで分ける
	const nameScrollers = (page) => page.evaluate((T) => Array.from(document.querySelectorAll(T + '[data-usd-el="panel-namescroll"]')).map((e, i) => {
		e.setAttribute('data-t23-ns', String(i));
		return { i, over: e.scrollWidth > e.clientWidth + 1, sw: e.scrollWidth, cw: e.clientWidth };
	}), T);
	const nsSel = (i) => T + '[data-usd-el="panel-namescroll"][data-t23-ns="' + i + '"]';
	const scrollLeftOf = (page, sel) => page.evaluate((sel) => document.querySelector(sel).scrollLeft, sel);

	await block('T23スワイプ(1) ①の表の行の上から左右に払うと隣のタブへ切り替わる（①の表の箱はスワイプを外す一覧に無い）', async () => {
		const sp = await openSp({ tab: 0 });
		const p = sp.page;
		const cells = await p.evaluate((R) => {
			const rows = Array.from(document.querySelectorAll(R + '.usd-roster-grid-wrap .usd-roster-gc--name[role="rowheader"]'));
			// 名前が収まっている行（送れる中身が無い）を選ぶ
			const ok = rows.filter((c) => Array.from(c.querySelectorAll('.usd-hscroll')).every((h) => h.scrollWidth <= h.clientWidth + 1));
			ok.forEach((c, i) => c.setAttribute('data-t23-row', String(i)));
			return { rows: rows.length, ok: ok.length, wrapOx: (document.querySelector(R + '.usd-roster-grid-wrap') ? getComputedStyle(document.querySelector(R + '.usd-roster-grid-wrap')).overflowX : null) };
		}, R);
		assert(cells.rows > 0 && cells.ok > 0, 'T23スワイプ(1) ①の表の行がある（空振りでない）', cells);
		assert(cells.wrapOx === 'clip', 'T23スワイプ(1) 375px の①の表の箱は横に送らない（overflow-x: clip）', cells.wrapOx);
		const sel = R + '[data-t23-row="1"]';
		const a = await touchSwipe(sp, sel, -100, 0);
		assert(a.tab === 'step-tab-1', 'T23スワイプ(1) ①の表の行の上で左へ払うと②へ', a);
		await selectTab(p, 0);
		const b = await touchSwipe(sp, R + '.usd-roster-grid-wrap .usd-roster-gc:not(.usd-roster-gc--name)', -100, 0);
		assert(b.tab === 'step-tab-1', 'T23スワイプ(1) ①の表の名前以外のマスの上でも左へ払うと②へ', b);
		const c = await touchSwipe(sp, T + '.usd-panel', 100, 0);
		assert(c.tab === 'step-tab-0', 'T23スワイプ(1) 右へ払うと①へ戻る', c);
		assert(jsErrors(sp.errors).length === 0, 'T23スワイプ(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T23スワイプ(2)(3) ②の名前が短いスキルの名前の上から払うと切り替わる／名前が長く横に送れるスキルの名前の上では名前が送られ、タブは変わらない・送り切った状態で同じ向きに払うと切り替わる', async () => {
		const sp = await openSp({ tab: 1 });
		const p = sp.page;
		const ns = await nameScrollers(p);
		const shortOne = ns.find((n) => !n.over), longOne = ns.find((n) => n.over);
		assert(!!shortOne && !!longOne, 'T23スワイプ(2)(3) ②に名前が短い行と長い行がある（空振りでない）', ns);
		if (!shortOne || !longOne) { await sp.ctx.close(); return; }
		// (2) 名前が短い（送れる中身が無い）
		const a = await touchSwipe(sp, nsSel(shortOne.i), -100, 0, 8);
		assert(a.tab === 'step-tab-2', 'T23スワイプ(2) 名前が短いスキルの名前の上で左へ払うと③へ', a);
		await selectTab(p, 1);
		await nameScrollers(p);
		const b = await touchSwipe(sp, nsSel(shortOne.i), 100, 0, 8);
		assert(b.tab === 'step-tab-0', 'T23スワイプ(2) 右へ払うと①へ', b);
		await selectTab(p, 1);
		// (3) 名前が長い（送れる中身がある）: 左端の状態で左へ払う → 名前が送られ、タブは変わらない
		await nameScrollers(p);
		const L = nsSel(longOne.i);
		await p.evaluate((s) => { document.querySelector(s).scrollLeft = 0; }, L);
		const w = await p.evaluate((s) => document.querySelector(s).getBoundingClientRect().width, L);
		const c = await touchSwipe(sp, L, -100, 0, Math.min(w - 4, 140));
		const sl1 = await scrollLeftOf(p, L);
		assert(c.tab === 'step-tab-1' && sl1 > 0, 'T23スワイプ(3) 長い名前の上で左へ払うと名前が送られ（scrollLeft ' + sl1 + '）、タブは②のまま', { c, sl1 });
		// 送り切った状態で、同じ向き（左）に払う → 送れないので切り替わる
		const max = await p.evaluate((s) => { const e = document.querySelector(s); e.scrollLeft = e.scrollWidth; return e.scrollLeft; }, L);
		await p.waitForTimeout(100);
		// 切り替わると②は隠れて scrollLeft が 0 に読めるので、指を離した時点の値を取っておく
		await p.evaluate((s) => { document.addEventListener('touchend', () => { window.__t23sl = document.querySelector(s).scrollLeft; }, { capture: true, once: true }); }, L);
		const d = await touchSwipe(sp, L, -100, 0, Math.min(w - 4, 140));
		const sl2 = await p.evaluate(() => window.__t23sl);
		assert(d.tab === 'step-tab-2' && Math.abs(sl2 - max) < 1, 'T23スワイプ(3) 送り切った状態で左へ払うと③へ（scrollLeft は ' + max + ' のまま）', { d, max, sl2 });
		// 左端の状態で右へ払う → 送れないので切り替わる（③→②）。右端から右へ払う → 名前が戻り、タブは変わらない
		await selectTab(p, 1);
		await nameScrollers(p);
		await p.evaluate((s) => { document.querySelector(s).scrollLeft = 0; }, L);
		const e = await touchSwipe(sp, L, 100, 0, 8);
		assert(e.tab === 'step-tab-0', 'T23スワイプ(3) 左端の状態で右へ払うと（送れないので）①へ', e);
		await selectTab(p, 1);
		await nameScrollers(p);
		await p.evaluate((s) => { const el = document.querySelector(s); el.scrollLeft = el.scrollWidth; }, L);
		const f = await touchSwipe(sp, L, 100, 0, 8);
		const sl3 = await scrollLeftOf(p, L);
		assert(f.tab === 'step-tab-1' && sl3 < max, 'T23スワイプ(3) 右端の状態で右へ払うと名前が戻され（scrollLeft ' + sl3 + '）、タブは②のまま', { f, sl3, max });
		assert(jsErrors(sp.errors).length === 0, 'T23スワイプ(2)(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T23スワイプ(4)(5)(6)(7) 水平から約30度で切り替わり・約40度では切り替わらない／縦のスクロールでは切り替わらない／横 45px では切り替わらず 55px で切り替わる／入力欄・小窓の中からでは切り替わらない', async () => {
		const sp = await openSp({ tab: 1 });
		const p = sp.page;
		const OUT = '.site-header h1';
		const tan = (deg) => Math.round(100 * Math.tan(deg * Math.PI / 180));
		// (4) 角度（横 100px）
		const a30 = await touchSwipe(sp, OUT, -100, tan(30));
		assert(a30.tab === 'step-tab-2', 'T23スワイプ(4) 水平から約30度（横100・縦' + tan(30) + '）で切り替わる', a30);
		await selectTab(p, 1);
		const a40 = await touchSwipe(sp, OUT, -100, tan(40));
		assert(a40.tab === 'step-tab-1', 'T23スワイプ(4) 水平から約40度（横100・縦' + tan(40) + '）では切り替わらない', a40);
		const a40r = await touchSwipe(sp, OUT, 100, -tan(40));
		assert(a40r.tab === 'step-tab-1', 'T23スワイプ(4) 右上へ約40度でも切り替わらない', a40r);
		// (5) 縦のスクロール（縦に大きく、横に少し）
		await p.evaluate(() => scrollTo(0, 0));
		const v = await touchSwipe(sp, T + '.usd-panel', -30, -200);
		assert(v.tab === 'step-tab-1', 'T23スワイプ(5) 縦に大きく（200px）横に少し（30px）の動きでは切り替わらない', v);
		const v2 = await touchSwipe(sp, T + '.usd-panel', -60, -120);
		assert(v2.tab === 'step-tab-1', 'T23スワイプ(5) 縦120・横60（水平から約63度）でも切り替わらない', v2);
		// (6) 距離
		await p.evaluate(() => scrollTo(0, 0));
		const d45 = await touchSwipe(sp, OUT, -45, 0);
		assert(d45.tab === 'step-tab-1', 'T23スワイプ(6) 横 45px では切り替わらない', d45);
		const d55 = await touchSwipe(sp, OUT, -55, 0);
		assert(d55.tab === 'step-tab-2', 'T23スワイプ(6) 横 55px では切り替わる', d55);
		// core の判定そのもの（境目）
		const core = await p.evaluate(() => [[-49, 0], [-50, 0], [50, 0], [-100, 66], [-100, 67]].map(([x, y]) => UmaSkillDeckCore.swipeDirectionOf(x, y)));
		assert(JSON.stringify(core) === JSON.stringify([0, 1, -1, 1, 0]), 'T23スワイプ(6) core の判定: 49px は0・50px で切り替え・横100は縦66まで（1.5倍より大きい）', core);
		// (7) 入力欄・小窓の中
		await selectTab(p, 0);
		const sel = await p.$$eval(R + 'select', (l) => l.length);
		assert(sel > 0, 'T23スワイプ(7) ①に選択欄がある（空振りでない）', sel);
		const s1 = await touchSwipe(sp, R + 'select', -100, 0, 4);
		assert(s1.tab === 'step-tab-0', 'T23スワイプ(7) 選択欄から始まった動きでは切り替わらない', s1);
		await p.evaluate(() => { const i = document.createElement('input'); i.id = 't23-probe-input'; i.style.cssText = 'display:block;width:300px;height:40px'; document.querySelector('#deck-roster-panel').prepend(i); });
		const s2 = await touchSwipe(sp, '#t23-probe-input', -100, 0, 250);
		assert(s2.tab === 'step-tab-0', 'T23スワイプ(7) 入力欄（仮に入れた input）から始まった動きでは切り替わらない', s2);
		await p.evaluate(() => document.getElementById('t23-probe-input').remove());
		await p.click('#deck-set-bar [data-usd-act="set-list"]');
		await p.waitForTimeout(250);
		const popN = await p.$$eval('.usd-info-pop', (l) => l.filter((e) => e.getClientRects().length > 0).length);
		assert(popN > 0, 'T23スワイプ(7) 小窓が開いている（空振りでない）', popN);
		const s3 = await touchSwipe(sp, '.usd-info-pop', -100, 0, 250);
		assert(s3.tab === 'step-tab-0', 'T23スワイプ(7) 小窓の中から始まった動きでは切り替わらない', s3);
		await p.keyboard.press('Escape');
		await p.waitForTimeout(200);
		const s4 = await touchSwipe(sp, OUT, -100, 0);
		assert(s4.tab === 'step-tab-1', 'T23スワイプ(7) 小窓を閉じたら切り替わる', s4);
		assert(jsErrors(sp.errors).length === 0, 'T23スワイプ(4)〜(7) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T23スワイプ(8) イベントの小窓の「イベント」「スキル」のタブ: 横に送れない部品の上・送れる部品（送られたら変わらない・送り切ったら変わる）・約30度／約40度・縦の動き・45px／55px', async () => {
		const sp = await openSp({ tab: 0, roster: { umaId: 'uma-0215', cardIds: CARDS6 } });
		const p = sp.page;
		await clickEvents(p, R, 0);
		await p.waitForTimeout(400);
		const PANES = '[data-usd-el="events-panes"]';
		const paneOf = () => p.evaluate(() => { const a = document.querySelector('[data-usd-el="events-tab"][aria-selected="true"]'); return a ? a.getAttribute('data-pane') : null; });
		const setPane = async (i) => { await p.click('[data-usd-el="events-tab"][data-pane="' + i + '"]'); await p.waitForTimeout(150); };
		const sw = async (sel, dx, dy, ox) => { await touchSwipe(sp, sel, dx, dy, ox); return paneOf(); };
		assert(await paneOf() === '0', 'T23スワイプ(8) 小窓が開き、タブが見えている（空振りでない）', await paneOf());
		// 仮の部品を入れる: 送れる中身が無い .usd-hscroll と、送れる中身がある .usd-hscroll（イベントの欄の先頭）
		const probe = await p.evaluate((PANES) => {
			const panes = document.querySelector(PANES);
			const pane = panes.querySelector('[data-usd-el="events-pane-events"]');
			const mk = (id, text) => { const d = document.createElement('div'); d.id = id; d.className = 'usd-hscroll'; d.style.cssText = 'overflow-x:auto;white-space:nowrap;width:260px;height:36px;line-height:36px'; d.textContent = text; pane.prepend(d); return d; };
			const a = mk('t23-probe-short', '短い');
			const b = mk('t23-probe-long', 'あ'.repeat(80));
			return { short: a.scrollWidth <= a.clientWidth + 1, long: b.scrollWidth > b.clientWidth + 1, n: document.querySelectorAll('#t23-probe-short, #t23-probe-long').length };
		}, PANES);
		assert(probe.n === 2 && probe.short && probe.long, 'T23スワイプ(8) 仮の部品（短い・長い）が入った（空振りでない）', probe);
		// (2) に当たる: 送れる中身が無い部品の上
		assert(await sw('#t23-probe-short', -100, 0, 200) === '1', 'T23スワイプ(8) 送れる中身が無い部品の上で左へ払うと「スキル」へ', null);
		await setPane(0);
		// (3) に当たる: 送れる部品の上。左端から左へ → 送られ、タブは変わらない／送り切って左へ → 切り替わる
		await p.evaluate(() => { document.getElementById('t23-probe-long').scrollLeft = 0; });
		const r1 = await sw('#t23-probe-long', -100, 0, 200);
		const l1 = await scrollLeftOf(p, '#t23-probe-long');
		assert(r1 === '0' && l1 > 0, 'T23スワイプ(8) 送れる部品の上で左へ払うと部品が送られ（scrollLeft ' + l1 + '）、タブは「イベント」のまま', { r1, l1 });
		await p.evaluate(() => { const e = document.getElementById('t23-probe-long'); e.scrollLeft = e.scrollWidth; });
		assert(await sw('#t23-probe-long', -100, 0, 200) === '1', 'T23スワイプ(8) 送り切った状態で左へ払うと「スキル」へ', null);
		await setPane(0);
		// (4) 角度・(5) 縦・(6) 距離（欄の上）
		const tan = (deg) => Math.round(100 * Math.tan(deg * Math.PI / 180));
		await p.evaluate(() => { document.getElementById('t23-probe-short').remove(); document.getElementById('t23-probe-long').remove(); });
		assert(await sw(PANES, -100, tan(40), 260) === '0', 'T23スワイプ(8) 約40度では切り替わらない', null);
		assert(await sw(PANES, -100, tan(30), 260) === '1', 'T23スワイプ(8) 約30度で切り替わる', null);
		assert(await sw(PANES, 30, -200, 100) === '1', 'T23スワイプ(8) 縦に大きく横に少しの動きでは切り替わらない', null);
		assert(await sw(PANES, 45, 0, 100) === '1', 'T23スワイプ(8) 横 45px では切り替わらない', null);
		assert(await sw(PANES, 55, 0, 100) === '0', 'T23スワイプ(8) 横 55px で切り替わる', null);
		assert(jsErrors(sp.errors).length === 0, 'T23スワイプ(8) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
