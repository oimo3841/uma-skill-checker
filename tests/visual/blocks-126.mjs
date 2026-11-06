// T115（2026-11-06・回答 356〜363）: Deck α の軽微な直しの検査。
// run-smoke.mjs の末尾から register126() で呼ばれる（塊の見出しはすべて「T115」で始まる。`npm run test:visual -- --only=T115` で回せる）。
//
//  - 356: 登録の画面の右上にツール切り替えとライト／ダーク（登録の前も後も・送られた親がないときも）。
//  - 357: 「デフォルト」にデフォルト・レースのセット・新しいモードの親を全部出す。技能試験の親は出さない。
//  - 358: 「デフォルト」の行は、デフォルト・すべてのレースのセット（終了レースも）・新しいモードの一覧を合わせたもの。「前回」の区別なし・切り替えなし。ほかの表は今のまま。
//  - 359・363: 全部同じ親が2人以上いれば先頭（いちばん新しく登録した親）を「同一」に選んだ状態で出す（押し直せる）。親A にも祖にも。
//  - 363: UmaStar から送ったときも親A に候補。「同一」で登録すると新しい親を作らず、値を足し、送り先のセットに入れる。②の一覧は送り先へ。
//  - 360: 緑の★を正しく比べる。どちらも分かっていて違うときは exact にしない。
//  - 361: 登録の左の文。
// スキル名・衣装名は検査の側に書かない（恒久ルール1。データから引く）。T115_SHOTS=<フォルダ> で画像を残す（登録の前後と「デフォルト」・390/1280・ライト/ダーク）。
import fs from 'node:fs';
import path from 'node:path';

export async function register126(env) {
	const { block, assert, browser, base } = env;
	const SHOTS = process.env.T115_SHOTS || '';
	const sizes = { 390: { width: 390, height: 844, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };
	const LONG = 'レース指定なし／本育成編成なし';
	const TAIL = '・★不明などは「?」のまま';

	async function open(w, theme) {
		const sz = sizes[w];
		const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: 1, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: theme });
		const page = await ctx.newPage();
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		await page.addInitScript((t) => { try { if (!sessionStorage.getItem('t115')) { sessionStorage.setItem('t115', '1'); localStorage.setItem('uma-tools-theme', t); } } catch (e) { /* 無ければよい */ } }, theme);
		const ev = (f, a) => page.evaluate(f, a);
		const openDeck = async (q) => { await page.goto(base + '/deck-alpha.html' + (q || '')); await page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc && (document.querySelector('.vh, .stage .empty')), null, { timeout: 15000 }); await page.waitForTimeout(150); };
		const seed = async (doc, settings) => {
			await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.DeckAlpha && window.__deckAlphaRegister !== undefined || document.querySelector('#body .card'), null, { timeout: 15000 });
			await ev(async (x) => { const K = window.DeckAlpha; await K.store.replaceAll(Object.assign(K.emptyDoc(), x.doc)); await K.store.putMeta('settings', Object.assign({}, K.DEFAULT_SETTINGS, { lastExport: new Date().toISOString() }, x.settings || {})); }, { doc, settings });
		};
		const data = async () => {
			await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.DeckAlpha, null, { timeout: 15000 });
			return ev(() => { const K = window.DeckAlpha; return { uma: K.D.costumes.filter((c) => c.uniq.length).slice(0, 8).map((c) => c.id), sk: K.D.skills.slice(0, 40).map((s) => s.id), names: Object.fromEntries(K.D.skills.slice(0, 40).map((s) => [s.id, s.name])), races: K.activeRaces().slice(0, 2).map((r) => K.newRaceSet(r)), arc: K.newArcSet('medium') }; });
		};
		const send = (o) => ev((x) => localStorage.setItem('umaDeck:send', JSON.stringify(Object.assign({ format: 'uma-deck-send', v: 1, sentAt: new Date().toISOString(), from: 'star', race: null, style: null, owner: 'self', send: [] }, x))), o);
		const openReg = async () => { await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S.doc, null, { timeout: 15000 }); await page.waitForTimeout(120); };
		const doReg = async () => { await page.click('#regBtn'); await page.waitForFunction(() => window.__deckAlphaRegister.S.done, null, { timeout: 8000 }); };
		const saved = () => ev(async () => { const l = await window.DeckAlpha.store.load(); return { doc: l.meta.doc, settings: l.meta.settings, parents: l.parents.slice().sort((a, b) => +a.id.slice(1) - +b.id.slice(1)) }; });
		const wide = [];
		const look = async (name, full) => {
			await page.waitForTimeout(120);
			const r = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
			if (r.sw > r.iw) wide.push(name + ':' + r.sw + '>' + r.iw);
			if (!SHOTS) return;
			fs.mkdirSync(SHOTS, { recursive: true });
			const file = path.join(SHOTS, w + '-' + theme + '-' + name + '.png');
			// 全体を撮るときは窓を伸ばす（fullPage だと下に固定の帯が途中に写る）
			if (full) { const H = await ev(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)); await page.setViewportSize({ width: sz.width, height: H }); await page.waitForTimeout(120); await page.screenshot({ path: file }); await page.setViewportSize({ width: sz.width, height: sz.height }); }
			else await page.screenshot({ path: file });
		};
		return { ctx, page, errs, ev, openDeck, seed, data, send, openReg, doReg, saved, wide, look };
	}
	const par = (id, uma, skills, extra) => Object.assign({ id, uma, date: '2026-10-' + String(10 + +id.slice(1)), no: 1, owner: 'self', sets: [], tags: { style: [] }, gp: [], blue: ['speed', 3], red: ['medium', 2], green: 3, skills, genes: {} }, extra || {});
	const per = (uma, skills, green, extra) => Object.assign({ uma, green: green == null ? null : [null, green], greenCands: null, blue: null, red: null, skills, genes: {} }, extra || {});
	const stars = (ids, v) => Object.fromEntries(ids.map((id) => [id, v]));
	const list = (id, kind, ids, sends, extra) => Object.assign({ id, kind, skills: Object.fromEntries(ids.map((x, i) => [x, Array.isArray(sends) ? sends[i] : sends])), sends: Array.isArray(sends) ? Math.max(...sends) : sends }, extra || {});
	const rowsOf = (T) => T.ev(() => [...document.querySelectorAll('.vl th[data-r]')].map((t) => t.title));
	const colsOf = (T) => T.ev(() => document.querySelectorAll('.vh th[data-c]').length);
	const cntOf = (T) => T.ev(() => document.querySelector('.vc .cnt').textContent);
	const choose = async (T, key) => { await T.ev((k) => { const a = window.__deckAlpha; a.S.settings.cur = k; a.renderAll(); }, key); await T.page.waitForTimeout(150); };
	const sum = (T) => T.ev(() => document.getElementById('regSum').textContent);
	const linkState = (T) => T.ev(() => [...document.querySelectorAll('#body section.card')].slice(1).map((c) => ({ all: [...c.querySelectorAll('[data-link]')].map((b) => b.dataset.link), on: (c.querySelector('[data-link][aria-pressed="true"]') || { dataset: {} }).dataset.link || null, none: !!c.querySelector('[data-nolink]') })));

	/* ---------- 356: 右上のボタン ---------- */
	for (const w of [390, 1280]) {
		await block('T115 登録の画面の右上のツール切り替えとライト／ダーク（' + w + 'px）: 登録の前も後も・押して移れる', async () => {
			const tag = w + 'px ';
			const T = await open(w, 'light'); const { page, ev } = T;
			try {
				const d = await T.data();
				await T.seed({ parents: [par('p1', d.uma[0], stars(d.sk.slice(0, 3), 2))], next: 2 });
				const place = () => ev(() => { const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, w: b.width, h: b.height }; }; const t = document.getElementById('toolBtn'), m = document.getElementById('themeBtn'), h = document.querySelector('.topline h1'); const cs = getComputedStyle(t); return { tool: r(t), theme: r(m), h1: r(h), content: r(document.getElementById('reg')), vis: !t.hidden && !m.hidden && cs.display !== 'none', state: m.getAttribute('data-theme-state'), radius: cs.borderRadius, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
				const okPlace = (p) => p.vis && p.tool.w === 34 && p.tool.h === 38 && p.theme.w === 34 && p.theme.h === 38 && p.tool.r <= p.theme.l && p.h1.r <= p.tool.l + 0.5 && Math.abs(p.tool.t - p.h1.t) < 30 && p.tool.t < 40 && p.theme.r <= p.iw && p.sw <= p.iw;
				// 送られた親がないとき
				await T.openReg();
				const p0 = await place();
				assert(okPlace(p0), tag + '送られた親がないときも右上に出る（34×38px・見出しの右）', p0);
				// 登録の前（要確認の札がある・親Aセット）: 左の文が折り返してもボタンは上の行の右
				await T.send({ persons: [per(d.uma[0], { [d.sk[0]]: -1 }, -1), per(d.uma[1], {}, 1), per(d.uma[2], {}, 1)] });
				await T.openReg();
				const p1 = await place();
				const need = await ev(() => !document.getElementById('needTop').hidden);
				assert(need && okPlace(p1), tag + '登録の前も右上に出る（「要確認」の札があってもボタンは上の行）', p1);
				// Deck の本体と同じ形（枠・角丸）
				const st = await ev(() => document.getElementById('themeBtn').getAttribute('data-theme-state'));
				assert(st === 'light', tag + 'アイコンは利用者の選択（ライト）', st);
				// ライト／ダーク: 色・保存・アイコンが変わり、ほかのツールと同じ鍵
				await page.click('#themeBtn'); await page.waitForTimeout(60);
				const t1 = await ev(() => ({ th: document.documentElement.getAttribute('data-theme'), key: localStorage.getItem('uma-tools-theme'), st: document.getElementById('themeBtn').getAttribute('data-theme-state'), vis: [...document.querySelectorAll('#themeBtn svg')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.dataset.themeIcon).join() }));
				assert(t1.th === 'dark' && t1.key === 'dark' && t1.st === 'dark' && t1.vis === 'dark', tag + '押すとダークへ（ほかのツールと同じ設定 uma-tools-theme）', t1);
				await page.click('#themeBtn'); await page.waitForTimeout(60);
				const t2 = await ev(() => ({ th: document.documentElement.getAttribute('data-theme'), key: localStorage.getItem('uma-tools-theme') }));
				assert(t2.th === 'light' && t2.key === 'light', tag + 'もう一度押すとライトへ', t2);
				// ツール切り替え: Deck の本体と同じ3行。この画面からは Deck へも移れる
				await page.click('#toolBtn'); await page.waitForTimeout(80);
				const sh = await ev(() => ({ title: document.getElementById('sheetTitle').textContent, rows: [...document.querySelectorAll('#sheetIn .list a')].map((a) => a.textContent + '>' + a.getAttribute('href')), hid: document.getElementById('sheet').hidden }));
				assert(!sh.hid && sh.title === 'ツール切り替え' && sh.rows.join() === 'UmaStar OCR>special.html,UmaExam>exam.html,Deck (αテスト)>deck-alpha.html', tag + 'ツール切り替えの3行（UmaStar OCR・UmaExam・Deck (αテスト)。? も # も付けない）', sh);
				await T.look('tool-sheet');
				await page.click('#sheetIn [data-close]'); await page.waitForTimeout(50);
				assert(await ev(() => document.getElementById('sheet').hidden), tag + '閉じるで閉じる', null);
				await page.click('#toolBtn'); await page.keyboard.press('Escape'); await page.waitForTimeout(50);
				assert(await ev(() => document.getElementById('sheet').hidden), tag + 'Esc でも閉じる', null);
				// 登録の後
				await T.doReg();
				const p2 = await place();
				assert(okPlace(p2), tag + '登録の後も右上に出る', p2);
				const after = await ev(() => [...document.querySelectorAll('#body a')].map((a) => a.textContent + '>' + a.getAttribute('href')).join());
				assert(after === 'Deck (αテスト)を開く>deck-alpha.html', tag + '「Deck (αテスト)を開く」は今のまま', after);
				await page.click('#toolBtn'); await page.waitForTimeout(80);
				await page.click('#sheetIn a[href="deck-alpha.html"]'); await page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc, null, { timeout: 15000 });
				assert(/deck-alpha\.html$/.test(page.url()), tag + '行を押すと移る', page.url());
				assert(T.errs.length === 0 && T.wide.length === 0, tag + 'エラーなし・横スクロールなし', [T.errs, T.wide]);
			} finally { await T.ctx.close(); }
		});
	}

	/* ---------- 357・358: デフォルトの親と行 ---------- */
	for (const w of [390, 1280]) {
		await block('T115 「デフォルト」（' + w + 'px）: 技能試験以外の親を全部・行は送った一覧を全部合わせる・「前回」の区別なし', async () => {
			const tag = w + 'px ';
			const T = await open(w, 'light');
			try {
				const d = await T.data(); const [ra, rb] = d.races; const s = d.sk;
				// 送り先ごとの親と一覧。一覧はどれも重ならない（s[0]〜s[11]）。親の持つ s[20] はどの一覧にも無い
				const doc = () => ({ next: 6,
					parents: [par('p1', d.uma[0], { [s[20]]: 1 }), par('p2', d.uma[1], { [s[20]]: 2 }, { sets: [ra.id] }), par('p3', d.uma[2], { [s[21]]: 2 }, { sets: ['norace'], from: 'norace' }), par('p4', d.uma[3], { [s[22]]: 2 }, { sets: ['exam'], from: 'exam' }), par('p5', d.uma[4], { [s[23]]: 2 }, { sets: ['arc:medium'] })],
					none: list('none', 'none', [s[0], s[1]], [1, 2]),
					norace: list('norace', 'norace', [s[2], s[3]], [1, 2]),
					exam: list('exam', 'exam', [s[4], s[5]], 1),
					sets: [Object.assign({}, ra, list(ra.id, 'race', [s[6], s[7]], [1, 2])), Object.assign({}, rb, list(rb.id, 'race', [s[8]], 1)), Object.assign({}, d.arc, list('arc:medium', 'arc', [s[9]], 1))] });
				await T.seed(doc());
				await T.openDeck();
				const beforeDoc = await T.saved();
				const want = (ids) => ids.map((id) => d.names[id]).sort().join();
				// 357: 親
				assert(await colsOf(T) === 4, tag + '親はデフォルト・レース・新しいモード・終了レースの4人（技能試験の親は出ない）', await colsOf(T));
				const ids = await T.ev(() => [...document.querySelectorAll('.vh th[data-c]')].map((t) => t.textContent).length);
				assert(ids === 4, tag + '列の数', ids);
				await T.ev(() => document.getElementById('setBtn').click()); await T.page.waitForTimeout(120);
				const picker = await T.ev(() => [...document.querySelectorAll('#sheetIn .ropt')].map((o) => o.querySelector('.l1').textContent + '|' + ((o.querySelector('.rn') || {}).textContent || '')));
				assert(picker[0] === 'デフォルト|親4人' && picker[1] === LONG + '|親1人', tag + '選択欄の数: デフォルトは親4人・新しいモードは親1人', picker.slice(0, 2));
				await T.ev(() => document.querySelector('#sheetIn [data-close]').click()); await T.page.waitForTimeout(80);
				// 358: 行
				const r0 = await rowsOf(T);
				assert(r0.slice().sort().join() === want([s[0], s[1], s[2], s[3], s[6], s[7], s[8], s[9]]), tag + '行はデフォルト・レース2つ・終了レース・新しいモードの一覧の合計。技能試験の一覧は入れない', r0);
				const f0 = await T.ev(() => ({ row: document.getElementById('sf-listRow').hidden, old: document.querySelectorAll('.vl th.old').length, S: window.__deckAlpha.S.sf.list }));
				assert(f0.row === true && f0.old === 0, tag + '「全部／最新の一覧／前回までだけ」を出さず、前回までの印も付けない（一覧には2回送ったものがある）', f0);
				await T.look('default-rows');
				// 保存は変えない（読むだけ）
				const afterDoc = await T.saved();
				assert(JSON.stringify(afterDoc.doc) === JSON.stringify(beforeDoc.doc) && JSON.stringify(afterDoc.parents) === JSON.stringify(beforeDoc.parents), tag + '開いても保存データは変わらない', null);
				// ほかの表は今のまま
				await choose(T, ra.id);
				const r1 = await T.ev(() => ({ cols: document.querySelectorAll('.vh th[data-c]').length, rows: [...document.querySelectorAll('.vl th[data-r]')].map((t) => t.title), list: document.getElementById('sf-listRow').hidden, old: document.querySelectorAll('.vl th.old').length, lab: [...document.querySelectorAll('#sf-list button')].map((b) => b.textContent).join() }));
				assert(r1.cols === 1 && r1.rows.slice().sort().join() === want([s[6], s[7]]) && !r1.list && r1.old === 1 && r1.lab === '全部,最新の一覧,前回までだけ', tag + 'レースのセットは今のまま（そのセットの親と一覧・切り替えあり・前回までの印）', r1);
				await choose(T, 'norace');
				const r2 = await T.ev(() => ({ cols: document.querySelectorAll('.vh th[data-c]').length, rows: [...document.querySelectorAll('.vl th[data-r]')].map((t) => t.title), list: document.getElementById('sf-listRow').hidden, old: document.querySelectorAll('.vl th.old').length }));
				assert(r2.cols === 1 && r2.rows.slice().sort().join() === want([s[2], s[3]]) && !r2.list && r2.old === 1, tag + '新しいモードの表は今のまま', r2);
				await T.ev(() => { const a = window.__deckAlpha; a.switchMode('exam'); }); await T.page.waitForTimeout(150);
				const r3 = await T.ev(() => ({ cols: document.querySelectorAll('.vh th[data-c]').length, mode: window.__deckAlpha.S.mode }));
				assert(r3.mode === 'exam' && r3.cols === 1, tag + '技能試験の表は今のまま（技能試験の親だけ）', r3);
				// 一度も送っていなければ今のまま（出ている親が持っているスキル）。技能試験の親のスキルは入らない
				await T.seed({ next: 6, parents: doc().parents, exam: list('exam', 'exam', [s[4]], 1), sets: [Object.assign({}, ra, { skills: {}, sends: 0 })] }, { mode: 'star', cur: 'none' });
				await T.openDeck();
				const r4 = await rowsOf(T);
				assert(r4.slice().sort().join() === want([s[20], s[21], s[23]]), tag + '一度も送っていなければ、出ている親が持っているスキル（技能試験の親の分は入らない）', r4);
				assert(await T.ev(() => document.getElementById('sf-listRow').hidden), tag + 'このときも切り替えは出ない', null);
				// デフォルトの一覧が無くても、レースのセットで送っていれば合わせる
				await T.seed({ next: 6, parents: doc().parents, sets: [Object.assign({}, ra, list(ra.id, 'race', [s[6]], 1))] }, { mode: 'star', cur: 'none' });
				await T.openDeck();
				const r5 = await rowsOf(T);
				assert(r5.join() === want([s[6]]), tag + 'レースのセットだけ送ったときはその一覧が行になる', r5);
				const noSave = await T.saved();
				assert(noSave.doc.none === undefined, tag + 'doc.none を作らない（読み込みで書き換えない）', noSave.doc.none);
				// 古いデータの新しいモードの親（from:'norace'）もそのまま読める
				assert(T.errs.length === 0, tag + 'エラーなし', T.errs);
			} finally { await T.ctx.close(); }
		});
	}

	await block('T115 新しいモードから登録した親が通しで「デフォルト」に出る（T108 の取り消し）', async () => {
		const T = await open(1280, 'light');
		try {
			const d = await T.data();
			await T.seed({ next: 2, parents: [par('p1', d.uma[0], { [d.sk[0]]: 1 })] });
			await T.send({ noPlan: true, send: [d.sk[1], d.sk[2]], persons: [per(d.uma[1], { [d.sk[1]]: 2 }, 2)] });
			await T.openReg();
			assert(await T.ev(() => window.__deckAlphaRegister.S.setKey) === 'norace', '初期値は新しいモードのまま', null);
			await T.doReg();
			const s = await T.saved();
			const p = s.parents[1];
			assert(p.from === 'norace' && p.sets.join() === 'norace' && s.doc.norace.sends === 1, '保存の形は今のまま（from・sets・doc.norace）', p);
			await T.openDeck();
			assert(await colsOf(T) === 1, '開くと新しいモードの表（1人）', await colsOf(T));
			await choose(T, 'none');
			assert(await colsOf(T) === 2, '「デフォルト」に2人とも出る', await colsOf(T));
			const r = await rowsOf(T);
			assert(r.length === 2, '行は新しいモードで送った2種', r);
		} finally { await T.ctx.close(); }
	});

	/* ---------- 359・360: exact ---------- */
	await block('T115 全部同じ親: 2人以上なら先頭（いちばん新しい親）を選ぶ・押し直せる（親Aにも祖にも）・緑の★を正しく比べる', async () => {
		const T = await open(1280, 'light'); const { page, ev } = T;
		try {
			const d = await T.data(); const s = d.sk; const sk = stars([s[0], s[1]], 2);
			const seed2 = () => T.seed({ next: 5, parents: [par('p1', d.uma[0], sk), par('p3', d.uma[0], sk), par('p2', d.uma[0], sk), par('p4', d.uma[0], { [s[0]]: 3 })] });
			await seed2();
			// 親Aだけ
			await T.send({ persons: [per(d.uma[0], sk, 3)] });
			await T.openReg();
			const l0 = await linkState(T);
			assert(l0[0].on === 'p3' && l0[0].all[0] === 'p3' && l0[0].all.length === 4 && l0[0].none, '親A: exact が3人なら先頭（いちばん新しく登録した p3）を「同一」に選ぶ。候補は全部出る', l0[0]);
			assert(await ev(() => document.getElementById('needTop').hidden), '選んだ状態なら「要確認」は出ない', null);
			// 押し直せる
			await page.click('#body [data-link="p1"]'); await page.waitForTimeout(60);
			assert((await linkState(T))[0].on === 'p1', 'ほかの候補を押すとそちらへ変わる', null);
			await page.click('#body [data-nolink="0"]'); await page.waitForTimeout(60);
			const l1 = await linkState(T);
			const na = await ev(() => document.querySelector('#body [data-nolink]').getAttribute('aria-pressed'));
			assert(l1[0].on === null && na === 'true', '「新規登録」に押し直せる', l1[0]);
			await T.doReg();
			const s1 = await T.saved();
			assert(s1.parents.length === 5, '「新規登録」のときは新しい親を作る', s1.parents.length);
			// 祖（親Aセット）
			await seed2();
			await T.send({ persons: [per(d.uma[1], {}, 1), per(d.uma[0], sk, 3), per(d.uma[2], {}, 1)] });
			await T.openReg();
			const l2 = await linkState(T);
			assert(l2[1].on === 'p3' && l2[0].all.length === 0, '祖にも同じ（exact が2人以上なら先頭）', l2);
			await T.doReg();
			const s2 = await T.saved(); const np = s2.parents[s2.parents.length - 1];
			assert(s2.parents.length === 5 && np.gp[0].link === 'p3', '祖は紐づけて保存', np.gp);

			// 360: 緑の★
			const core = await ev((x) => { const K = window.DeckAlpha; const doc = { parents: [x.p] }; const m = (o) => K.matchCandidates(doc, Object.assign({ uma: x.p.uma, skills: x.p.skills }, o))[0].exact; return { diff: m({ greenStar: 2 }), same: m({ greenStar: 3 }), unk: m({ greenStar: -1 }), nul: m({ greenStar: null }), oldForm: m({ green: 2 }), oldSame: m({ green: 3 }) }; }, { p: par('p1', d.uma[0], sk) });
			assert(core.diff === false && core.same === true && core.unk === true && core.nul === true, '緑の★: 違えば exact でない・同じ／不明／読めなかったなら exact', core);
			assert(core.oldForm === false && core.oldSame === true, '緑の★: green の形で渡しても同じ', core);
			await T.seed({ next: 2, parents: [par('p1', d.uma[0], sk)] });
			await T.send({ persons: [per(d.uma[0], sk, 2)] });
			await T.openReg();
			const l3 = await linkState(T);
			const need3 = await ev(() => document.getElementById('needTop').textContent);
			assert(l3[0].on === null && l3[0].all.join() === 'p1' && /要確認 1/.test(need3), '緑の★が違えば「同一」を選ばない（候補には出る・紐づけは要確認）', [l3[0], need3]);
			await T.send({ persons: [per(d.uma[0], sk, -1)] });
			await T.openReg();
			assert((await linkState(T))[0].on === 'p1', '緑の★が不明なら「同一」を選ぶ', null);
			await T.send({ persons: [per(d.uma[0], Object.assign({}, sk, { [s[0]]: 3 }), 3)] });
			await T.openReg();
			assert((await linkState(T))[0].on === null, '白の★が違えば「同一」を選ばない', null);
			assert(T.errs.length === 0, 'エラーなし', T.errs);
		} finally { await T.ctx.close(); }
	});

	/* ---------- 363: UmaStar から親Aを「同一」で登録 ---------- */
	await block('T115 UmaStar から親Aを「同一」で登録: 新しい親を作らない・値を足す・祖も同じ形・送り先に入れる・②の一覧は送り先へ', async () => {
		const T = await open(1280, 'light'); const { page, ev } = T;
		try {
			const d = await T.data(); const s = d.sk; const [ra] = d.races; const rid = ra.raceId;
			const sk = stars([s[0], s[1]], 2);
			const base0 = () => ({ next: 3, parents: [par('p1', d.uma[0], sk, { sets: ['old'], gp: [{ uma: d.uma[1], blue: null, red: null, green: 1, skills: { [s[2]]: 1 }, genes: {} }, { link: 'p2' }], tags: { style: ['nige'] } }), par('p2', d.uma[2], { [s[3]]: 1 })] });
			// レースのセットへ・全部同じ → 最初から「同一」
			await T.seed(base0());
			await T.send({ race: rid, style: 'senko', send: [s[10], s[11]], persons: [per(d.uma[0], sk, 3), per(d.uma[1], { [s[2]]: 2, [s[4]]: 3 }, 2), per(d.uma[2], { [s[3]]: 1 }, -1)] });
			await T.openReg();
			const l = await linkState(T);
			const top = await ev(() => ({ t: document.getElementById('body').innerText, cards: document.querySelectorAll('section.card').length, fz: document.querySelectorAll('section.card')[1].querySelectorAll('.fzrow').length, need: document.getElementById('needTop').hidden }));
			assert(l[0].on === 'p1' && /登録済みの/.test(top.t) && /と同一/.test(top.t) && top.fz === 0, '親Aに「登録済みの〇〇と同一」を「同一」を選んだ状態で出す（因子の行はたたむ）', [l[0], top.fz]);
			assert(l[2].on === 'p2', '祖の exact も選ぶ', l[2]);
			await T.look('reg-same');
			await T.doReg();
			const done = await ev(() => ({ ok: document.querySelector('.okbox').innerText, inbox: localStorage.getItem('umaDeck:send') }));
			assert(/^登録しました/.test(done.ok) && done.inbox === null, '登録できて受け取りの口を消す', done);
			const s1 = await T.saved(); const q = s1.parents[0]; const set = s1.doc.sets.find((x) => x.id === ra.id);
			assert(s1.parents.length === 2 && s1.doc.next === 3, '新しい親を作らない（next も進まない）', [s1.parents.length, s1.doc.next]);
			assert(q.sets.join() === 'old,' + ra.id, '送り先のレースのセットに入る（前のセットは残る）', q.sets);
			assert(set && set.sends === 1 && Object.keys(set.skills).sort().join() === [s[10], s[11]].sort().join(), '②の一覧は送り先に足す', set);
			assert(!('sheet' in q) && !('from' in q), 'UmaStar の親に sheet・from を足さない', Object.keys(q).join());
			assert(q.gp[0].skills[s[2]] === 2 && q.gp[0].skills[s[4]] === 3 && q.gp[0].green === 2 && q.gp[1].link === 'p2', '祖も UmaExam と同じ形（読み取りの値を足す・紐づけは link）', q.gp);
			assert(q.tags.style.join() === 'nige,senko', '画面の脚質の札を足す（前の札は残る）', q.tags);
			assert(s1.settings.cur === ra.id && s1.settings.mode === 'star', '開くと送り先の表', s1.settings);
			await T.openDeck();
			assert(await colsOf(T) === 1, '送り先の表に出る', await colsOf(T));

			// 読み取りの値を足す: ★不明で分かっている★を消さない・足りないスキルは足す
			await T.seed(base0());
			await T.send({ send: [], persons: [per(d.uma[0], { [s[0]]: -1, [s[5]]: 3 }, 1, { blue: ['wit', 1] })] });
			await T.openReg();
			assert((await linkState(T))[0].on === null, '白スキルが違えば選ばない', null);
			const nd = await ev(() => document.getElementById('needTop').textContent);
			assert(/要確認/.test(nd), '親Aの紐づけが要確認に入る', nd);
			await page.click('#body [data-link="p1"]'); await page.waitForTimeout(60);
			await T.doReg();
			const s2 = await T.saved(); const q2 = s2.parents[0];
			assert(q2.skills[s[0]] === 2 && q2.skills[s[1]] === 2 && q2.skills[s[5]] === 3 && q2.green === 1 && q2.blue[0] === 'wit', '読み取りの値を足す（★不明は上書きしない）', q2);
			assert(q2.sets.join() === 'old' && s2.settings.cur === 'none' && s2.doc.none === undefined, 'デフォルトへ送るときはセットを足さない（②が空なら一覧も作らない）', [q2.sets, s2.settings.cur]);
			assert(q2.owner === 'self', '持ち主は変えない', q2.owner);

			// 新しいモードへ
			await T.seed(base0());
			await T.send({ noPlan: true, send: [s[12]], persons: [per(d.uma[0], sk, 3)] });
			await T.openReg();
			await T.doReg();
			const s3 = await T.saved();
			assert(s3.parents.length === 2 && s3.parents[0].sets.join() === 'old,norace' && s3.doc.norace.sends === 1 && s3.settings.cur === 'norace', '新しいモードへ送ると、そのまとまりに入り、②の一覧も入る', [s3.parents[0].sets, s3.doc.norace]);

			// デフォルトへ（②あり）
			await T.seed(base0());
			await T.send({ send: [s[13]], persons: [per(d.uma[0], sk, 3)] });
			await T.openReg();
			await T.doReg();
			const s4 = await T.saved();
			assert(s4.parents.length === 2 && s4.doc.none.sends === 1 && s4.doc.none.skills[s[13]] === 1, 'デフォルトへ送ると「デフォルト」の一覧に足す', s4.doc.none);

			// 親Aだけで「同一」: 祖はそのまま
			await T.seed(base0());
			await T.send({ persons: [per(d.uma[0], sk, 3), per(d.uma[1], {}, 1), per(d.uma[3], {}, 1)] });
			await T.openReg();
			await page.click('[data-scope="one"]'); await page.waitForTimeout(60);
			await T.doReg();
			const s5 = await T.saved();
			assert(s5.parents[0].gp.length === 2 && s5.parents[0].gp[1].link === 'p2' && s5.parents[0].gp[0].uma === d.uma[1], '親Aだけのときは今の祖を変えない', s5.parents[0].gp);

			// 技能試験だけの親と同一 → 「デフォルト」にも出る・技能試験の表にも残る
			await T.seed({ next: 2, exam: list('exam', 'exam', [s[6]], 1), parents: [par('p1', d.uma[0], sk, { sets: ['exam'], from: 'exam', sheet: { 'レース因子の見本': 2 } })] });
			await T.send({ persons: [per(d.uma[0], sk, 3)] });
			await T.openReg();
			assert((await linkState(T))[0].on === 'p1', '技能試験の親も候補', null);
			await T.doReg();
			const s6 = await T.saved(); const q6 = s6.parents[0];
			assert(!('from' in q6) && q6.sets.join() === 'exam' && q6.sheet['レース因子の見本'] === 2, 'UmaStar から送ったので「デフォルト」にも出す形になる（技能試験の印と sheet は残す）', q6);
			await T.openDeck();
			assert(await colsOf(T) === 1, '「デフォルト」に出る', await colsOf(T));

			// 新規登録を選ぶと今までどおり
			await T.seed(base0());
			await T.send({ race: rid, send: [s[10]], persons: [per(d.uma[0], sk, 3)] });
			await T.openReg();
			await page.click('#body [data-nolink="0"]'); await page.waitForTimeout(60);
			await T.doReg();
			const s7 = await T.saved(); const np = s7.parents[s7.parents.length - 1];
			assert(s7.parents.length === 3 && np.id === 'p3' && np.sets.join() === ra.id && s7.parents[0].sets.join() === 'old', '「新規登録」なら新しい親を作る', np);

			// 同じ衣装がいなければ候補なし
			await T.seed(base0());
			await T.send({ persons: [per(d.uma[5], sk, 3)] });
			await T.openReg();
			assert((await linkState(T))[0].all.length === 0, '同じ衣装がいなければ候補は出ない', null);

			// 衣装が決まらなくても「同一」を選べば登録できる（白スキルの一致で候補が出る）
			await T.seed(base0());
			await T.send({ persons: [per(null, sk, 3, { greenCands: null })] });
			await T.openReg();
			const b0 = await ev(() => document.getElementById('regBtn').disabled);
			const t0 = await sum(T);
			await page.click('#body [data-link="p1"]'); await page.waitForTimeout(60);
			const b1 = await ev(() => document.getElementById('regBtn').disabled);
			assert(b0 && t0 === '親Aの衣装を決めると登録できます' && !b1, '衣装が未定なら登録できないが、「同一」を選ぶと登録できる', [b0, t0, b1]);
			await T.doReg();
			const s8 = await T.saved();
			assert(s8.parents.length === 2 && s8.parents[0].uma === d.uma[0], '衣装は登録済みの親のまま', s8.parents[0].uma);

			// UmaExam は今のまま
			await T.seed(base0());
			await T.send({ from: 'exam', send: [s[6]], persons: [per(d.uma[0], sk, 3, { blue: ['wit', 2], sheet: { 見本: 1 } })] });
			await T.openReg();
			await T.doReg();
			const s9 = await T.saved();
			assert(s9.parents.length === 2 && s9.parents[0].sets.join() === 'old,exam' && s9.parents[0].sheet['見本'] === 1 && s9.settings.mode === 'exam' && s9.parents[0].tags.style.join() === 'nige', 'UmaExam から: exact なら選んだ状態で出て、今までどおりその親に足す', s9.parents[0]);
			assert(T.errs.length === 0, 'エラーなし', T.errs);
		} finally { await T.ctx.close(); }
	});

	/* ---------- 361: 登録の左の文 ---------- */
	await block('T115 登録の左の文: 親Aセット（3人）を登録／親Aだけ（1人）を登録＋★不明などのとき', async () => {
		const T = await open(390, 'light'); const { page, ev } = T;
		try {
			const d = await T.data(); const s = d.sk;
			await T.seed({ next: 2, parents: [par('p1', d.uma[6], { [s[0]]: 1 })] });
			const fam = (bad) => [per(d.uma[0], bad ? { [s[1]]: -1 } : { [s[1]]: 1 }, 1), per(d.uma[1], {}, 1), per(d.uma[2], {}, 1)];
			await T.send({ persons: fam(false) });
			await T.openReg();
			assert(await sum(T) === '親Aセット（3人）を登録', '親Aセット', await sum(T));
			await page.click('[data-scope="one"]'); await page.waitForTimeout(60);
			assert(await sum(T) === '親Aだけ（1人）を登録', '親Aだけ', await sum(T));
			await T.send({ persons: fam(true) });
			await T.openReg();
			assert(await sum(T) === '親Aセット（3人）を登録' + TAIL, '親Aセット＋★不明', await sum(T));
			const g = await ev(() => { const b = document.getElementById('regBtn').getBoundingClientRect(), t = document.getElementById('regSum').getBoundingClientRect(); return { bw: b.width, tw: t.width, sw: document.documentElement.scrollWidth, iw: innerWidth, right: b.right }; });
			assert(g.bw >= 88 && g.right <= g.iw && g.sw <= g.iw, '長い文でも「登録する」が押せる幅で画面に収まる', g);
			await T.look('reg-sum-long');
			await page.click('[data-scope="one"]'); await page.waitForTimeout(60);
			assert(await sum(T) === '親Aだけ（1人）を登録' + TAIL, '親Aだけ＋★不明', await sum(T));
			// UmaExam も同じ
			await T.send({ from: 'exam', persons: fam(false) });
			await T.openReg();
			assert(await sum(T) === '親Aセット（3人）を登録', 'UmaExam も同じ', await sum(T));
			await T.send({ from: 'exam', persons: [per(d.uma[0], { [s[1]]: -1 }, 1)] });
			await T.openReg();
			assert(await sum(T) === '親Aだけ（1人）を登録' + TAIL, 'UmaExam も同じ（★不明）', await sum(T));
			// 紐づけの選び残しだけなら「?」の文を付けない（「?」になるものが無い）
			await T.send({ persons: [per(d.uma[6], { [s[0]]: 1, [s[1]]: 1 }, 1)] });
			await T.openReg();
			const n = await ev(() => document.getElementById('needTop').textContent);
			assert(/要確認 1/.test(n) && await sum(T) === '親Aだけ（1人）を登録', '紐づけの選び残しだけなら後ろの文を付けない', [n, await sum(T)]);
			// 古い文が残っていない
			const body = await ev(() => document.querySelector('.regbar').innerText);
			assert(!/親A＋祖2人|のまま登録/.test(body), '古い文が残っていない', body);
			assert(T.errs.length === 0, 'エラーなし', T.errs);
		} finally { await T.ctx.close(); }
	});

	/* ---------- 画像（T115_SHOTS のときだけ） ---------- */
	if (SHOTS) {
		for (const w of [390, 1280]) for (const theme of ['light', 'dark']) {
			await block('T115 画像（' + w + 'px・' + theme + '）', async () => {
				const T = await open(w, theme);
				try {
					await T.page.goto(base + '/deck-alpha.html'); await T.page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc, null, { timeout: 15000 });
					await T.page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
					const info = await T.ev(async () => { const d = window.__deckAlphaMock.makeMock(12, 11); const K = window.DeckAlpha; await K.store.replaceAll(d); await K.store.putMeta('settings', Object.assign({}, K.DEFAULT_SETTINGS, { lastExport: new Date().toISOString() })); const p = d.parents[d.parents.length - 1]; const q = d.parents[0]; return { p, q, race: (K.activeRaces()[0] || {}).id, sk: K.D.skills.slice(50, 56).map((x) => x.id), free: K.D.costumes.filter((c) => c.uniq.length && !d.parents.some((x) => x.uma === c.id)).slice(0, 2).map((c) => c.id) }; });
					// 登録の前: 親A が全部同じ →「同一」を選んだ状態
					await T.send({ race: info.race, send: info.sk, style: 'senko', persons: [{ uma: info.p.uma, green: [null, info.p.green], greenCands: null, blue: null, red: null, skills: info.p.skills, genes: info.p.genes }, per(info.free[0], { [info.sk[0]]: 2 }, 2), per(info.free[1], { [info.sk[1]]: -1 }, -1)] });
					await T.openReg();
					await T.look('1-reg-before-same', true);
					// 登録の前: 同じ衣装で白スキルが違う →「同一」の候補と新規登録を選ぶ形
					await T.send({ race: info.race, send: info.sk, style: 'senko', persons: [{ uma: info.q.uma, green: [null, -1], greenCands: null, blue: null, red: null, skills: { [info.sk[2]]: 2, [info.sk[3]]: -1 }, genes: {} }, per(info.free[0], { [info.sk[0]]: 2 }, 2), per(info.free[1], { [info.sk[1]]: -1 }, -1)] });
					await T.openReg();
					await T.look('2-reg-before-new', true);
					// 登録の後
					await T.doReg();
					await T.look('3-reg-after');
					// デフォルト
					await T.ev(async () => { const K = window.DeckAlpha; const l = await K.store.load(); await K.store.putMeta('settings', Object.assign({}, l.meta.settings, { cur: 'none', mode: 'star' })); });
					await T.openDeck();
					await T.look('4-deck-default');
				} finally { await T.ctx.close(); }
			});
		}
	}
}
