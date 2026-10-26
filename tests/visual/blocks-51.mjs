// お知らせの履歴・UmaStar のヘッダー・メニューの説明・新シナリオの知らせの文面（2026-10-25・CODE-NEXT-4）の検査。
// run-smoke.mjs の末尾から register51() で呼ばれる（塊の見出しはすべて「履歴」で始まる。`npm run test:visual -- --only=履歴` で回せる）。
//
// (1) 文面の byte 一致（見出し・箇条・メニューの説明2つ）／(2) 履歴の件数と並び（各ツール最新3件・新しい順）・日付の表示／(3) 切り替え（‹ › で移る・端のボタンは見えない・n / N）
// (4) 未読があると最新の1件で開く・閉じると3件とも既読・すべて既読の人には自動で出ない／(5) メニューの「お知らせ」から開く・?notice=force
// (6) UmaStar のツール切り替えのボタンに文字が無い・UmaExam の基準の部品が変更前と同じ／(7) SCENARIO_PENDING.on を false にした合成の状態で、新シナリオの知らせが履歴から外れる
// (8) 見た目: special・exam × 360・390・1280 × ライト・ダーク で、横スクロールなし・エラー0・文字のコントラスト 4.5:1 以上・メニューの説明が折り返さない。
// 文面は、依頼文の「そのまま使う」文面を検査の側に直書きして比べる（実装から読んで作らない）。
// 2026-10-26（新シナリオの仕上げ）: 実データの on を false にした（知らせを外した）。(1)〜(6)・(8) は、on を true にした合成の状態
// （fixtures の setScenarioPendingOn）で知らせの仕組みを見る。(7) は実データのまま（on が false）で、新シナリオの知らせが履歴に無いことを見る。
import { setScenarioPendingOn } from './lib/fixtures.mjs';

export async function register51(env) {
	setScenarioPendingOn(true);
	try { await register51Body(env); } finally { setScenarioPendingOn(false); }
}
async function register51Body(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const HEAD = '新シナリオへの対応';
	// 2026-10-26（駿大祭の受け入れ）で箇条を入れ替えた: UmaStar・UmaExam は L1、UmaStar だけ L2
	const L1 = '［いとどめでたき、まつりかな］吾妻・［Time of Departure］マヤノトップガン・［陣風の花紺青］ダイワスカーレットのイベントのスキルは、一部が未対応です。';
	const L2 = '駿大祭シナリオのイベントのスキルは、未対応です。';
	const LINES = { special: [L1, L2], exam: [L1] };
	const DESC = { 'UmaStar OCR': 'チャンミ/LoH用OCR（β版）', 'UmaExam OCR': '技能試験用OCR' };
	// 履歴（新しい順）: 種類と日付。日付は、そのお知らせを入れた commit の日付（日本時間）
	const HIST = {
		exam: [['scenario', '2026/10/24'], ['edition', '2026/10/11'], ['target', '2026/09/15']],
		special: [['scenario', '2026/10/24'], ['catalog', '2026/09/27'], ['alpha', '2026/09/19']],
	};
	const TOOLS = [
		{ name: 'exam', file: 'exam.html', tool: 'UmaExam OCR', keys: { 'uma-exam-ui-notice': 'UI_NOTICE_ID', 'uma-exam-target-notice': 'TARGET_NOTICE_ID', 'uma-exam-edition-notice': 'UmaAnnounce.ANNOUNCE.id' }, scenarioKey: 'uma-exam-scenario-notice' },
		{ name: 'special', file: 'special.html', tool: 'UmaStar OCR', keys: { 'uma-special-ui-notice': 'UI_NOTICE_ID', 'uma-special-alpha-notice': 'ALPHA_NOTICE_ID', 'uma-special-catalog-notice': 'CATALOG_NOTICE_ID' }, scenarioKey: 'uma-special-scenario-notice' },
	];
	const noticeOpen = (page) => page.evaluate(() => { const d = document.getElementById('ui-notice'); return !!d && !d.hidden; });
	const allKeys = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
	/** 開く。o.store＝開く前に仕込む保存値（無ければ初めての人）／o.query／o.w／o.theme */
	const open = async (t, o = {}) => {
		const r = await openPage(browser, base, t.file + (o.query || ''), { width: o.w || 1280, height: o.h || 900 });
		const page = r.page;
		const store = Object.assign({}, o.store || {});
		if (o.theme) store['uma-tools-theme'] = o.theme;
		if (o.store || o.theme) {
			await page.evaluate((s) => { try { localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } catch (e) {} }, store);
			await page.reload({ waitUntil: 'networkidle' });
		}
		await page.waitForTimeout(o.wait || 1500);
		return r;
	};
	/** すべて既読の保存値（告知のIDはページの定数から読む）。except に種類を渡すと、その種類だけ未読 */
	const seenStore = async (t, exceptScenario) => {
		const r = await openPage(browser, base, t.file, { width: 1280, height: 900 });
		const ids = await r.page.evaluate((m) => Object.fromEntries(Object.entries(m).map(([k, e]) => [k, eval(e)])), Object.assign({}, t.keys, { [t.scenarioKey]: 'UmaAnnounce.SCENARIO_PENDING.id' }));
		await r.ctx.close();
		const s = Object.assign({}, ids);
		if (exceptScenario) delete s[t.scenarioKey];
		s[t.name === 'exam' ? 'uma-exam-ui-mode' : 'uma-special-ui-mode'] = 'new';
		return s;
	};
	const dlg = (page) => page.evaluate(() => {
		const d = document.getElementById('ui-notice');
		const shown = [...d.querySelectorAll('.notice-body > div')].filter((x) => !x.hidden && /^ui-notice-body-/.test(x.id)).map((x) => x.id);
		const vis = (sel) => { const e = d.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return { v: cs.visibility, d: cs.display }; };
		const sc = document.getElementById('ui-notice-body-scenario');
		return {
			open: !d.hidden, kind: uiNoticeKind, shown,
			tool: d.querySelector('.notice-head-tool') && d.querySelector('.notice-head-tool').textContent,
			date: d.querySelector('.notice-head-date') && d.querySelector('.notice-head-date').textContent,
			count: d.querySelector('.notice-pager-count') && d.querySelector('.notice-pager-count').textContent,
			pagerHidden: d.querySelector('.notice-pager') ? getComputedStyle(d.querySelector('.notice-pager')).display === 'none' : null,
			newer: vis('[data-notice-nav="newer"]'), older: vis('[data-notice-nav="older"]'),
			head: sc.querySelector('.announce-h') ? sc.querySelector('.announce-h').textContent : null,
			lines: [...sc.querySelectorAll('.announce-lines li')].map((e) => e.textContent),
			leads: sc.querySelectorAll('.announce-lead').length,
			labelledby: d.getAttribute('aria-labelledby'),
			pagerBeforeOk: (() => { const p = d.querySelector('.notice-pager'), ok = document.getElementById('ui-notice-ok'); return !!p && !!ok && (p.compareDocumentPosition(ok) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; })(),
			headFirst: (() => { const h = d.querySelector('.notice-head'); return !!h && h === d.querySelector('.notice-body').firstElementChild; })(),
		};
	});
	const nav = async (page, which) => { await page.click('[data-notice-nav="' + which + '"]'); await page.waitForTimeout(150); };
	const menuOpen = async (page) => { await page.click('#tool-dropdown-btn'); await page.waitForTimeout(200); };
	const menuDescs = (page) => page.evaluate(() => {
		const menu = document.getElementById('tool-dropdown-menu');
		const out = {};
		['UmaStar OCR', 'UmaExam OCR'].forEach((name) => {
			const n = [...menu.querySelectorAll('p')].find((p) => p.textContent.trim() === name);
			const row = n && n.closest('a, div.flex.items-start');
			const d = row && [...row.querySelectorAll('p')].find((p) => p !== n && p.textContent.trim() !== '');
			out[name] = d ? { text: d.textContent.trim(), oneLine: d.scrollWidth <= d.clientWidth && d.getClientRects().length === 1 && d.getBoundingClientRect().height < 24 } : null;
		});
		return out;
	});

	await block('履歴(1) 文面の byte 一致（新シナリオの見出し・箇条・メニューの説明2つ）／導入や常時の1行は無い', async () => {
		for (const t of TOOLS) {
			const r = await open(t, { store: await seenStore(t, true) });
			const d = await dlg(r.page);
			assert(d.open && d.kind === 'scenario', `履歴(1) ${t.name}: 新シナリオの知らせが開く`, d.kind);
			assert(d.head === HEAD, `履歴(1) ${t.name}: 見出しが一致`, d.head);
			assert(JSON.stringify(d.lines) === JSON.stringify(LINES[t.name]), `履歴(1) ${t.name}: 箇条が一致（${LINES[t.name].length}行）`, JSON.stringify(d.lines));
			assert(d.leads === 0, `履歴(1) ${t.name}: 導入の文は無い`, d.leads);
			// 2026-10-26（公開前の追加）: exam の①の常時の1行（#melop-scenario-note）は消した。どちらのツールにも無い
			const note = await r.page.evaluate(() => { const e = document.getElementById('melop-scenario-note'); if (!e) return null; const nx = e.nextElementSibling; return { text: e.textContent, inStep1: !!e.closest('#step-panel-1'), next: nx ? nx.textContent : null }; });
			assert(note === null, `履歴(1) ${t.name}: 常時の1行（#melop-scenario-note）は無い`, note);
			assert(!/ヒント|必ず合う|合うことがある|合わない/.test([d.head, ...d.lines].join('')), `履歴(1) ${t.name}: 禁じた表現を使っていない`, '');
			await r.page.keyboard.press('Escape');
			await menuOpen(r.page);
			const m = await menuDescs(r.page);
			Object.keys(DESC).forEach((k) => assert(m[k] && m[k].text === DESC[k], `履歴(1) ${t.name}: メニューの「${k}」の説明が「${DESC[k]}」`, JSON.stringify(m[k])));
			await r.ctx.close();
		}
	});

	await block('履歴(2) 履歴の件数と並び（各ツール最新3件・新しい順）・日付の表示（2026/10/24 の形）・ツール名／日付は小窓の上・n / N は部品の中', async () => {
		for (const t of TOOLS) {
			const r = await open(t, { store: await seenStore(t, true) });
			const hist = await r.page.evaluate((p) => UmaAnnounce.history(p), t.name);
			assert(JSON.stringify(hist.map((h) => [h.kind, h.date])) === JSON.stringify(HIST[t.name]), `履歴(2) ${t.name}: 履歴は新しい3件（新しい順）`, JSON.stringify(hist));
			const d = await dlg(r.page);
			assert(d.tool === t.tool && d.date === HIST[t.name][0][1] && d.headFirst, `履歴(2) ${t.name}: 小窓の上にツール名と日付（${d.tool} ${d.date}）`, JSON.stringify({ tool: d.tool, date: d.date, headFirst: d.headFirst }));
			assert(d.count === '1 / 3' && d.pagerBeforeOk, `履歴(2) ${t.name}: 本文と OK の間に「1 / 3」`, JSON.stringify({ count: d.count, before: d.pagerBeforeOk }));
			assert(d.shown.length === 1, `履歴(2) ${t.name}: 小窓は1件ずつ（本文は1つだけ）`, JSON.stringify(d.shown));
			await r.ctx.close();
		}
	});

	await block('履歴(3) 切り替え: ‹（新しい側）・›（古い側）で移る／日付・本文・n / N が替わる／端のボタンは見えない（場所は残る）', async () => {
		for (const t of TOOLS) {
			const r = await open(t, { store: await seenStore(t, true) });
			const seq = [];
			let d = await dlg(r.page);
			seq.push([d.kind, d.date, d.count, d.newer.v, d.older.v]);
			assert(d.newer.v === 'hidden' && d.older.v === 'visible', `履歴(3) ${t.name}: 1件目は ‹ が見えず › が見える`, JSON.stringify(d));
			await nav(r.page, 'older'); d = await dlg(r.page); seq.push([d.kind, d.date, d.count, d.newer.v, d.older.v]);
			assert(d.kind === HIST[t.name][1][0] && d.date === HIST[t.name][1][1] && d.count === '2 / 3' && d.newer.v === 'visible' && d.older.v === 'visible', `履歴(3) ${t.name}: › で2件目（${HIST[t.name][1][0]}・${HIST[t.name][1][1]}・2 / 3・両方見える）`, JSON.stringify(d));
			await nav(r.page, 'older'); d = await dlg(r.page); seq.push([d.kind, d.date, d.count, d.newer.v, d.older.v]);
			assert(d.kind === HIST[t.name][2][0] && d.date === HIST[t.name][2][1] && d.count === '3 / 3' && d.newer.v === 'visible' && d.older.v === 'hidden', `履歴(3) ${t.name}: › で3件目（${HIST[t.name][2][0]}・3 / 3・› が見えない）`, JSON.stringify(d));
			assert(d.shown.length === 1, `履歴(3) ${t.name}: 3件目も本文は1つだけ`, JSON.stringify(d.shown));
			// 端のボタンは場所を残す（押せない見た目にしない＝visibility で隠す。display:none にしない）
			assert(d.older.d !== 'none' && d.newer.d !== 'none', `履歴(3) ${t.name}: 端のボタンは場所が残る（並びがずれない）`, JSON.stringify(d));
			await nav(r.page, 'newer'); await nav(r.page, 'newer'); d = await dlg(r.page);
			assert(d.kind === 'scenario' && d.count === '1 / 3', `履歴(3) ${t.name}: ‹ で1件目に戻る`, JSON.stringify(d));
			await r.ctx.close();
		}
	});

	await block('履歴(4) 未読があると最新の1件で開く／閉じる（OK・✕・背景・Esc）と、このツールの告知がすべて既読になる／すべて既読の人には自動で出ない／初めての人にも出る', async () => {
		for (const t of TOOLS) {
			// 初めての人: 最新の1件で開き、閉じると履歴の3件（と古い告知）が既読
			for (const how of ['ok', 'x', 'backdrop', 'esc']) {
				const r = await open(t);
				const d = await dlg(r.page);
				assert(d.open && d.kind === 'scenario' && d.count === '1 / 3', `履歴(4) ${t.name}/${how}: 初めての人にも最新の1件（新シナリオ）で開く`, JSON.stringify({ open: d.open, kind: d.kind, count: d.count }));
				if (how === 'ok') await r.page.click('#ui-notice-ok');
				else if (how === 'x') await r.page.click('#ui-notice .notice-close');
				else if (how === 'backdrop') await r.page.evaluate(() => document.getElementById('ui-notice-backdrop').click());
				else await r.page.keyboard.press('Escape');
				await r.page.waitForTimeout(250);
				const keys = await allKeys(r.page);
				const want = await seenStore(t);
				const ok = Object.keys(want).filter((k) => !/ui-mode/.test(k)).every((k) => keys[k] === want[k]);
				assert(ok, `履歴(4) ${t.name}/${how}: 閉じると、このツールの告知がすべて既読になる（履歴の3件と古い告知の印）`, JSON.stringify(keys));
				await r.page.reload({ waitUntil: 'networkidle' });
				await r.page.waitForTimeout(1500);
				assert(!(await noticeOpen(r.page)), `履歴(4) ${t.name}/${how}: 開き直すと自動では出ない`, '');
				await r.ctx.close();
			}
			// すべて既読の人: 自動では出ない（新シナリオの知らせの ID は文面を差し替えても同じ）
			const r2 = await open(t, { store: await seenStore(t) });
			assert(!(await noticeOpen(r2.page)), `履歴(4) ${t.name}: すべて既読の人には自動で出ない`, '');
			await r2.ctx.close();
			// 新シナリオだけ未読: 最新の1件（新シナリオ）で開く
			const r3 = await open(t, { store: await seenStore(t, true) });
			const d3 = await dlg(r3.page);
			assert(d3.open && d3.kind === 'scenario' && d3.count === '1 / 3', `履歴(4) ${t.name}: 履歴の3件のうち新シナリオだけ未読でも、最新の1件で開く`, JSON.stringify(d3));
			await r3.ctx.close();
			// 履歴のうち古い側（3件目）だけが未読でも開く（履歴の3件に未読があれば開く）
			const s4 = await seenStore(t);
			delete s4[Object.keys(t.keys)[Object.keys(t.keys).length - 1]];
			const r4 = await open(t, { store: s4 });
			const d4 = await dlg(r4.page);
			assert(d4.open && d4.kind === 'scenario', `履歴(4) ${t.name}: 古い側の告知だけ未読でも、最新の1件で開く`, JSON.stringify(d4));
			await r4.ctx.close();
		}
	});

	await block('履歴(5) メニューの「お知らせ」から最新の1件で開く（UmaStar・UmaExam）／既読の状態は変わらない／?notice=force は何も書かずに最新の1件から開く', async () => {
		for (const t of TOOLS) {
			const store = await seenStore(t);
			const r = await open(t, { store });
			const before = await allKeys(r.page);
			await menuOpen(r.page);
			assert(await r.page.locator('#announce-menu-btn').isVisible(), `履歴(5) ${t.name}: メニューに「お知らせ」の行がある`, '');
			await r.page.click('#announce-menu-btn');
			await r.page.waitForTimeout(200);
			const d = await dlg(r.page);
			assert(d.open && d.kind === 'scenario' && d.count === '1 / 3', `履歴(5) ${t.name}: メニューから最新の1件（1 / 3）で開く`, JSON.stringify({ open: d.open, kind: d.kind, count: d.count }));
			assert(await r.page.evaluate(() => document.getElementById('tool-dropdown-menu').classList.contains('hidden')), `履歴(5) ${t.name}: メニューは閉じる`, '');
			await r.page.keyboard.press('Escape');
			await r.page.waitForTimeout(200);
			assert(JSON.stringify(await allKeys(r.page)) === JSON.stringify(before), `履歴(5) ${t.name}: 読み直して閉じても、既読の保存値は変わらない`, '');
			await r.ctx.close();
			const f = await open(t, { store, query: '?notice=force' });
			const df = await dlg(f.page);
			assert(df.open && df.kind === 'scenario' && df.count === '1 / 3', `履歴(5) ${t.name}: ?notice=force は既読でも最新の1件から開く`, JSON.stringify(df));
			const b4 = await allKeys(f.page);
			await f.page.click('#ui-notice-ok');
			await f.page.waitForTimeout(250);
			assert(JSON.stringify(await allKeys(f.page)) === JSON.stringify(b4), `履歴(5) ${t.name}: force のときは何も書かない`, '');
			await f.ctx.close();
		}
	});

	await block('履歴(6) UmaStar のツール切り替えのボタンは文字が無いアイコンだけ（UmaExam と同じ・aria-label「ツール切り替え」）／メニューに「お知らせ」の行（ベル）・「技能試験」の印は無い／UmaExam の基準の部品は変更前と同じ', async () => {
		for (const t of TOOLS) {
			const r = await open(t, { store: await seenStore(t) });
			const b = await r.page.evaluate(() => {
				const btn = document.getElementById('tool-dropdown-btn');
				const menu = document.getElementById('tool-dropdown-menu');
				const bell = document.getElementById('announce-menu-btn');
				return { text: btn.textContent.replace(/\s+/g, ''), cls: btn.className, aria: btn.getAttribute('aria-label'), title: btn.getAttribute('title'), kids: [...btn.children].map((c) => c.tagName.toLowerCase() + ':' + (c.getAttribute('data-lucide') || '')), bellText: bell ? bell.textContent.replace(/\s+/g, '') : null, bellIcon: bell ? !!bell.querySelector('[data-lucide="bell"], svg') : false, bellLast: !!bell && menu.lastElementChild === bell, badge: menu.textContent.indexOf('技能試験') !== -1 && /技能試験\s*$/.test([...menu.querySelectorAll('span')].map((s) => s.textContent.trim()).join('|')) };
			});
			assert(b.text === '' && b.cls.indexOf('uma-btn--secondary') !== -1, `履歴(6) ${t.name}: ツール切り替えのボタンに文字が無い`, JSON.stringify(b));
			assert(b.kids.length === 1 && /layout-grid|svg/.test(b.kids[0]), `履歴(6) ${t.name}: ボタンの中身はアイコン1つだけ（▾ も無い）`, JSON.stringify(b.kids));
			if (t.name === 'exam') assert(b.aria === 'ツール切替' && b.title === 'ツール切替', '履歴(6) exam: UmaExam の基準の部品（aria-label・title）は変更前のまま', JSON.stringify(b));
			else assert(b.aria === 'ツール切り替え', '履歴(6) special: aria-label は「ツール切り替え」', JSON.stringify(b));
			assert(b.bellText === 'お知らせ' && b.bellIcon && b.bellLast, `履歴(6) ${t.name}: メニューの最後に「お知らせ」の行（ベルのアイコン）`, JSON.stringify(b));
			const spans = await r.page.evaluate(() => [...document.getElementById('tool-dropdown-menu').querySelectorAll('span')].map((s) => s.textContent.trim()));
			assert(!spans.includes('技能試験'), `履歴(6) ${t.name}: メニューの UmaExam の行に「技能試験」の印は無い`, JSON.stringify(spans));
			await r.ctx.close();
		}
	});

	await block('履歴(7) 実データ（SCENARIO_PENDING.on が false）では新シナリオの知らせが履歴に無い（exam: edition・target・layout／special: catalog・alpha・layout）／合成で on にすると scenario が先頭', async () => {
		for (const t of TOOLS) {
			const store = await seenStore(t);
			// 実データのまま（合成の on を外して開く）
			setScenarioPendingOn(false);
			let real;
			try { real = await open(t, { store }); } finally { setScenarioPendingOn(true); }
			const realRes = await real.page.evaluate((p) => ({ on: UmaAnnounce.SCENARIO_PENDING.on, kinds: UmaAnnounce.history(p).map((h) => h.kind) }), t.name);
			const wantReal = t.name === 'exam' ? ['edition', 'target', 'layout'] : ['catalog', 'alpha', 'layout'];
			assert(realRes.on === false && JSON.stringify(realRes.kinds) === JSON.stringify(wantReal), `履歴(7) ${t.name}: 実データでは on が false で、履歴は新シナリオを含まない3件`, JSON.stringify(realRes));
			await real.ctx.close();
			const r = await open(t, { store });
			const res = await r.page.evaluate((p) => {
				const on = UmaAnnounce.history(p).map((h) => h.kind);
				UmaAnnounce.SCENARIO_PENDING.on = false;
				const off = UmaAnnounce.history(p).map((h) => h.kind);
				return { on, off };
			}, t.name);
			const wantOff = t.name === 'exam' ? ['edition', 'target', 'layout'] : ['catalog', 'alpha', 'layout'];
			assert(res.on[0] === 'scenario' && res.on.length === 3, `履歴(7) ${t.name}: on のときは新シナリオが先頭の3件`, JSON.stringify(res.on));
			assert(JSON.stringify(res.off) === JSON.stringify(wantOff), `履歴(7) ${t.name}: false にすると新シナリオが外れ、次の3件になる`, JSON.stringify(res.off));
			await r.ctx.close();
		}
	});

	await block('履歴(8) 見た目: special・exam × 360・390・1280px × ライト・ダーク で、小窓（1・2・3件目）とメニュー ―― 横スクロールなし・エラー0・文字のコントラスト 4.5:1 以上・メニューの説明が折り返さない', async () => {
		const toRgb = (c) => (/rgba?\((\d+), (\d+), (\d+)/.exec(c || '') || []).slice(1, 4).map(Number);
		const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
		const ratio = (a, b) => { const x = lum(toRgb(a)), y = lum(toRgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
		const worst = [];
		for (const t of TOOLS) {
			for (const w of [360, 390, 1280]) {
				for (const theme of ['light', 'dark']) {
					const tag = `${t.name}/${w}/${theme}`;
					const r = await open(t, { w, theme, store: await seenStore(t, true) });
					for (let i = 0; i < 3; i++) {
						const m = await r.page.evaluate(() => {
							const d = document.getElementById('ui-notice');
							const eff = (el) => { let e = el; while (e) { const bg = getComputedStyle(e).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg; e = e.parentElement; } return 'rgb(255, 255, 255)'; };
							const out = [];
							[...d.querySelectorAll('.notice-head-tool, .notice-head-date, .notice-pager-count, .notice-title, .notice-text, .announce-h, .announce-lines li')].forEach((e) => { if (e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden') out.push({ cls: e.className || e.tagName, fg: getComputedStyle(e).color, bg: eff(e) }); });
							[...d.querySelectorAll('.notice-pager-btn')].forEach((e) => { if (getComputedStyle(e).visibility !== 'hidden') out.push({ cls: 'pager-btn', fg: getComputedStyle(e).color, bg: eff(e) }); });
							const dr = d.getBoundingClientRect();
							const ok = document.getElementById('ui-notice-ok').getBoundingClientRect();
							return { out, scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, inView: dr.left >= -1 && dr.right <= window.innerWidth + 1, okInView: ok.bottom <= window.innerHeight + 1 };
						});
						assert(!m.scroll && m.inView && m.okInView, `履歴(8) ${tag}/${i + 1}件目: 横スクロールなし・小窓と OK が画面に収まる`, JSON.stringify({ scroll: m.scroll, inView: m.inView, okInView: m.okInView }));
						m.out.forEach((o) => { const c = ratio(o.fg, o.bg); worst.push(c); assert(c >= 4.5, `履歴(8) ${tag}/${i + 1}件目: ${o.cls} のコントラスト ${c.toFixed(2)}:1`, o.fg + ' on ' + o.bg); });
						if (i < 2) await nav(r.page, 'older');
					}
					await r.page.keyboard.press('Escape');
					await menuOpen(r.page);
					const dm = await menuDescs(r.page);
					Object.keys(DESC).forEach((k) => assert(dm[k] && dm[k].oneLine, `履歴(8) ${tag}: メニューの「${k}」の説明が折り返さない`, JSON.stringify(dm[k])));
					assert(jsErrors(r.errors).length === 0, `履歴(8) ${tag}: エラー0`, JSON.stringify(jsErrors(r.errors)));
					await r.ctx.close();
				}
			}
		}
		console.log('     履歴(8) コントラストの最小 ' + Math.min(...worst).toFixed(2) + ':1');
	});
}
