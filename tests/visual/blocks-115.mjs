// UmaExam の照合結果から Deck (αテスト) へ送る（T104 段2・2026-11-05・C-296 の続き）の検査。exam.html。
// run-smoke.mjs の末尾から register115() で呼ばれる（塊の見出しはすべて「T104 exam 送る」で始まる。`npm run test:visual -- --only=T104 exam 送る`）。
//
// 決め（おいもさん）:
//  - 224: 送る入口は T92 と同じ形（照合結果の上・右下のボタン群・ツール切り替え）。旧 Deck の引き出しは外す。writeOcrHandoff は残す。
//  - 232: 新UI の判定では毎回、青・赤・緑を読む。コピーのボタンを出すかは今までどおり拡張モード（run.melop）だけで決める。
//  - 233・234: UmaExam から送った親は技能試験のまとまりにだけ入る。親Aにも「登録済みの〇〇と同一」を出す。
// T100 の「？」と表の行数（親Aだけ 20・親Bあり 22）を崩さない（行数の固定値は blocks-114）。
// OCR は回さない（実画像の緑因子は tests/ocr/run-green-tests.mjs）。T104_SHOTS=<フォルダ> で画像を残す。
import fs from 'node:fs';
import path from 'node:path';

export async function register115(env) {
	const { block, assert, browser, base, REPO_ROOT } = env;
	const SHOTS = process.env.T104_SHOTS || '';
	const root = REPO_ROOT || process.cwd();
	const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

	/** exam.html を開く（uiMode='old' なら旧UI で開く） */
	const open = async (w, theme, uiMode) => {
		const mobile = w < 640;
		const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 812 : 800 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
		await ctx.addInitScript(([t, m]) => { try { if (!sessionStorage.getItem('__t104e')) { sessionStorage.setItem('__t104e', '1'); localStorage.clear(); localStorage.setItem('uma-tools-theme', t); if (m) localStorage.setItem('uma-exam-ui-mode', m); } } catch (e) { /* 無ければよい */ } }, [theme, uiMode || null]);
		const page = await ctx.newPage();
		page.setDefaultTimeout(30000);
		const errs = [];
		const watch = (p) => { p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); };
		watch(page);
		await page.goto(base + '/exam.html');
		await page.waitForFunction(() => typeof skillList !== 'undefined' && skillList.length > 100);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await page.waitForTimeout(300);
		return { ctx, page, errs, watch };
	};

	/** OCR の代わりに、決まった行を判定の流れ（processImages）に通す。親A（祖2人つき）と、sets='ab' なら親Bも。
	 *  いちばん上の段と緑の読み取りを差し替える。melop は拡張モードの入り切り。greenNamed なら緑の名前を実データから順に返す（親Bは親Aと同じ名前） */
	const judge = (page, sets, melop, greenNamed) => page.evaluate(async ([sets, melop, greenNamed]) => {
		const orig = { ppi: processPersonImages, top: readMelopTopRow, green: readGreenFactor, tess: window.Tesseract };
		// 134種の先頭・134種の外の id のある行・id の無い行・遺伝子を混ぜる
		await loadMelopSheet();
		const outside = melopSheet.rows.find((r) => r.id && !r.slot && !EXAM_SKILL_NAMES.includes(r.name) && !/^ap-/.test(r.id));
		const noId = melopSheet.rows.find((r) => !r.id && !r.slot);
		const gene = melopSheet.rows.find((r) => r.id && /^ap-/.test(r.id));
		window.__t104row = { outside, noId, gene };
		processPersonImages = async () => ({
			lines: EXAM_SKILL_NAMES.slice(0, 8).concat([outside.name, noId.name, gene.name]).map((n, i) => ({ text: n, stars: i === 1 ? null : (i % 3) + 1, starsReliable: i !== 1, rowKey: '0:' + i })),
			skipped: [], warned: [], geometry: [null]
		});
		readMelopTopRow = async () => ({ found: true, file: 'a.png', blue: { name: 'パワー', text: '', stars: 3 }, red: { name: '逃げ', text: '', stars: 2 }, uniqueStars: 2, extraLines: [] });
		await loadGreenNames();
		let gi = 0;
		readGreenFactor = async () => ({ name: greenNamed ? examGreenNames[gi++ % 3] : null, stars: 2, cands: null, texts: [] });
		window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, recognize: async () => ({ data: { text: '', lines: [] } }), terminate: async () => {} }) };
		persons.forEach((p) => { p.files = []; });
		const f = () => [new File(['x'], 'a.png', { type: 'image/png' })];
		[0, 1, 2].forEach((i) => { persons[i].files = f(); });
		if (sets === 'ab') persons[3].files = f();
		setMelopMode(!!melop);
		await processImages({ keepClosed: true });
		processPersonImages = orig.ppi; readMelopTopRow = orig.top; readGreenFactor = orig.green; window.Tesseract = orig.tess;
		openDrawer('result');
	}, [sets, !!melop, !!greenNamed]);

	const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
	/** 新しいタブが開く操作をして、そのタブの URL を返す */
	const popupOf = async (ctx, act) => {
		const [pop] = await Promise.all([ctx.waitForEvent('page'), act()]);
		await pop.waitForLoadState();
		return pop;
	};

	await block('T104 exam 送る ―― 入口: 親が読めたときだけボタンと1行・旧 Deck の案内と引き出しが無い・旧UIでは出さない・FAB とツール切り替えが deck-alpha.html', async () => {
		const { ctx, page, errs } = await open(1280, 'light');
		const state = () => page.evaluate(() => {
			const n = document.getElementById('deck-alpha-send-note');
			return { shown: !n.classList.contains('hidden'), text: n.textContent.replace(/\s+/g, ' ').trim() };
		});
		assert(!(await state()).shown, '判定の前はボタンと1行を出さない');
		const dom = await page.evaluate(() => ({
			gone: ['deck-handoff-note', 'deck-handoff-btn', 'deck-drawer', 'deck-drawer-frame', 'deck-drawer-trigger', 'fab-dot-deck'].filter((id) => document.getElementById(id)),
			fnGone: ['refreshDeckHandoffState', 'prepareDeckFrame'].filter((n) => typeof window[n] === 'function'),
			drawers: Object.keys(DRAWERS).join(),
			write: typeof writeOcrHandoff === 'function'
		}));
		assert(dom.gone.length === 0 && dom.fnGone.length === 0 && dom.drawers === 'result' && dom.write, '旧 Deck の案内・引き出し・バッジが無い・writeOcrHandoff は残す', dom);
		await judge(page, 'a', false);
		const s = await state();
		assert(s.shown && s.text === 'Deck (αテスト)に送る UmaSkill Deck は開発を停止しました。', '親を読めるとボタンと1行が出る', s);
		assert(await page.evaluate(() => !!(JSON.parse(localStorage.getItem('umaSkillDeck:ocrHandoff:exam') || 'null') || {}).persons), '旧 Deck への受け渡しのデータは今のまま書く');
		// 親が読めていない（結果なし）ならボタンを出さない
		const empty = await page.evaluate(() => { const keep = personResults; personResults = PERSON_LABELS.map(() => null); updateDeckAlphaSendButton(); const on = !document.getElementById('deck-alpha-send-note').classList.contains('hidden'); personResults = keep; updateDeckAlphaSendButton(); return on; });
		assert(!empty, '親が読めていなければ出さない');
		// FAB
		await page.evaluate(() => closeDrawer());
		await page.waitForTimeout(500);
		const fab = await page.evaluate(() => { const b = document.getElementById('fab-item-deck'); return { text: b.textContent.trim(), dot: !!b.querySelector('.uma-fab-dot') }; });
		assert(fab.text === 'Deck (αテスト)' && !fab.dot, 'FAB は「Deck (αテスト)」・印を出さない', fab);
		await page.click('#fab-toggle');
		await page.waitForTimeout(400);
		const pop = await popupOf(ctx, () => page.click('#fab-item-deck'));
		const pu = new URL(pop.url());
		assert(pu.pathname.endsWith('/deck-alpha.html') && !pu.search && !pu.hash, 'FAB は deck-alpha.html を新しいタブで開く（? と # なし）', pop.url());
		await pop.close();
		// ツール切り替え
		await page.click('#tool-dropdown-btn');
		const tool = await page.evaluate(() => { const a = document.getElementById('tool-deck-alpha'); const m = document.getElementById('tool-dropdown-menu'); const items = [...m.querySelectorAll('a, button, div.flex.items-start')].map((x) => x.textContent.replace(/\s+/g, '')); return { href: a.getAttribute('href'), text: a.textContent.trim(), vis: a.getClientRects().length > 0, order: items.join('|') }; });
		assert(tool.href === 'deck-alpha.html' && tool.text === 'Deck (αテスト)' && tool.vis, 'ツール切り替えに「Deck (αテスト)」の行', tool);
		assert(errs.length === 0, 'コンソールのエラー0', errs);
		await ctx.close();
		// 旧UI
		const old = await open(1280, 'light');
		await old.page.evaluate(() => exitNewUi());
		await judge(old.page, 'a', false);
		const oldState = await old.page.evaluate(() => ({ newUi, hidden: document.getElementById('deck-alpha-send-note').classList.contains('hidden'), runDeck: lastOcrRun.deck, melop: personMelop.every((m) => m === null), green: personGreen.every((g) => g === null) }));
		assert(oldState.newUi === false && oldState.hidden, '旧UIでは出さない（F-29②）', oldState);
		assert(oldState.runDeck === false && oldState.melop && oldState.green, '旧UIの判定では読まない（動きは今のまま）', oldState);
		await old.ctx.close();
	});

	await block('T104 exam 送る ―― 232: 拡張モードを切っていても読む・コピーのボタンは出ない。旧UIの判定では読まない。読めなくても判定は続く', async () => {
		const { ctx, page, errs } = await open(1280, 'light');
		await judge(page, 'a', false);
		const off = await page.evaluate(() => ({ run: lastOcrRun.deck, melop: lastOcrRun.melop, m: !!personMelop[0], a: !document.getElementById('melop-copy-btn-A').hidden, b: !document.getElementById('melop-copy-btn-B').hidden, ready: melopRunReady(), log: devGeometry.some((l) => l.startsWith('【めろっぷ')) }));
		assert(off.run === true && off.melop === false && off.m, '切っていても読む（232）', off);
		assert(!off.a && !off.b && !off.ready && !off.log, '切っているときコピーのボタンは出ない・開発ログの行も出ない', off);
		await page.evaluate(() => closeDrawer());
		await judge(page, 'a', true);
		const on = await page.evaluate(() => ({ a: !document.getElementById('melop-copy-btn-A').hidden, m: !!personMelop[0] }));
		assert(on.a && on.m, '入れているときはコピーのボタンが出る', on);
		await page.evaluate(() => { closeDrawer(); setMelopMode(false); });
		assert(errs.length === 0, 'コンソールのエラー0', errs);
		await ctx.close();

		// 読み取りが失敗しても判定は続く（送るときは「読めなかった」）
		const f = await open(1280, 'light');
		const res = await f.page.evaluate(async () => {
			const orig = { ppi: processPersonImages, top: readMelopTopRow, tess: window.Tesseract };
			processPersonImages = async () => ({ lines: EXAM_SKILL_NAMES.slice(0, 3).map((n, i) => ({ text: n, stars: 1, starsReliable: true, rowKey: '0:' + i })), skipped: [], warned: [], geometry: [null] });
			readMelopTopRow = async () => { throw new Error('テスト用の失敗'); };
			window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, recognize: async () => ({ data: { text: '', lines: [] } }), terminate: async () => {} }) };
			persons.forEach((p) => { p.files = []; });
			persons[0].files = [new File(['x'], 'a.png', { type: 'image/png' })];
			const ok = await processImages({ keepClosed: true });
			const send = buildDeckAlphaSend(0);
			processPersonImages = orig.ppi; readMelopTopRow = orig.top; window.Tesseract = orig.tess;
			return { ok, m: personMelop[0], n: Object.keys(send.persons[0].skills).length, blue: send.persons[0].blue, red: send.persons[0].red, len: send.persons.length };
		});
		assert(res.ok && res.m === null && res.n === 3 && res.len === 1, '読み取りが失敗しても判定は続き、画面の判定のスキルは送れる（親だけ）', res);
		assert(JSON.stringify(res.blue) === '[null,-1]' && JSON.stringify(res.red) === '[null,-1]', '読めなかった因子は [null, -1]', res);
		await f.ctx.close();

		// data の読み込みが失敗しても判定は続く（知らせは出さない。console.warn だけ）
		const g = await open(1280, 'light');
		await g.page.route('**/data/training-umamusume.json*', (r) => r.abort());
		await g.page.route('**/data/melop-sheet-rows.json*', (r) => r.abort());
		const res2 = await g.page.evaluate(async () => {
			const orig = { ppi: processPersonImages, tess: window.Tesseract };
			melopSheet = null; examGreenNames = null;
			processPersonImages = async () => ({ lines: EXAM_SKILL_NAMES.slice(0, 3).map((n, i) => ({ text: n, stars: 1, starsReliable: true, rowKey: '0:' + i })), skipped: [], warned: [], geometry: [null] });
			window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, recognize: async () => ({ data: { text: '', lines: [] } }), terminate: async () => {} }) };
			persons.forEach((p) => { p.files = []; });
			persons[0].files = [new File(['x'], 'a.png', { type: 'image/png' })];
			const ok = await processImages({ keepClosed: true });
			const send = buildDeckAlphaSend(0);
			processPersonImages = orig.ppi; window.Tesseract = orig.tess;
			return { ok, n: Object.keys(send.persons[0].skills).length, green: send.persons[0].green, shown: !document.getElementById('deck-alpha-send-note').classList.contains('hidden') };
		});
		assert(res2.ok && res2.n === 3 && res2.green === null && res2.shown, 'データを読めなくても判定は続き、送るボタンは出る（緑は null）', res2);
		await g.ctx.close();
	});

	await block('T104 exam 送る ―― 送る JSON の形（from・send 133種・race と style は null・skills／genes／sheet・青赤緑）と URL', async () => {
		const { ctx, page, errs } = await open(1280, 'light');
		await judge(page, 'a', false);
		const pop = await popupOf(ctx, () => page.click('#deck-alpha-send-btn'));
		const u = new URL(pop.url());
		assert(u.pathname.endsWith('/deck-alpha-register.html') && !u.search && !u.hash, '押すと deck-alpha-register.html を新しいタブで開く（? と # なし）', pop.url());
		await pop.close();
		const j = await page.evaluate(() => {
			const s = JSON.parse(localStorage.getItem('umaDeck:send'));
			return { s, row: window.__t104row, ids: EXAM_SKILL_LIST.map((x) => x.id), firstNames: EXAM_SKILL_NAMES.slice(0, 8), firstIds: EXAM_SKILL_NAMES.slice(0, 8).map((n) => examSkillId(n)) };
		});
		const s = j.s;
		assert(s.format === 'uma-deck-send' && s.v === 1 && s.from === 'exam' && s.race === null && s.style === null && s.owner === 'self', '先頭の項目', { f: s.format, from: s.from, race: s.race, style: s.style, owner: s.owner });
		assert(s.send.length === 134 && JSON.stringify(s.send) === JSON.stringify(j.ids), 'send は134種の id（EXAM_SKILL_LIST のまま）', s.send.length);
		assert(s.persons.length === 3, '祖2人とも読めていれば3人', s.persons.length);
		const p0 = s.persons[0];
		assert(p0.uma === null && JSON.stringify(p0.blue) === '["power",3]' && JSON.stringify(p0.red) === '["nige",2]', '青・赤は読めた値を Deck α の鍵で', { b: p0.blue, r: p0.red });
		assert(JSON.stringify(p0.green) === '[null,2]' && p0.greenCands === null, '緑は読み取りの値（名前が決まらなければ [null, ★]）', p0.green);
		assert(j.firstIds.every((id) => p0.skills[id] !== undefined), '画面の判定の134種が skills に id で入る', j.firstIds);
		assert(p0.skills[j.firstIds[1]] === -1, '★を測れなかったものは -1', p0.skills[j.firstIds[1]]);
		assert(p0.skills[j.row.outside.id] !== undefined, '134種の外の id も skills に入る', j.row.outside);
		assert(p0.sheet[j.row.noId.name] !== undefined && Object.keys(p0.sheet).length === 1, 'id の無い行は sheet に名前で入る', p0.sheet);
		assert(p0.genes[j.row.gene.id] !== undefined && !p0.skills[j.row.gene.id], '遺伝子は genes に入る', p0.genes);
		assert(errs.length === 0, 'コンソールのエラー0', errs);
		await ctx.close();
	});

	await block('T104 exam 送る ―― 通し: 親Aセットを送って登録 → 技能試験の表にだけ入る（233）。次に親Bセットを送ると親Aに「同一」が出る（234）・小窓は Esc で閉じる', async () => {
		const { ctx, page, errs, watch } = await open(1280, 'light');
		await judge(page, 'ab', false, true);
		// 親Aセットと親Bセットの両方が送れるときは小窓で選ぶ
		await page.click('#deck-alpha-send-btn');
		await page.waitForTimeout(200);
		const box = await page.evaluate(() => ({ vis: !document.getElementById('deck-alpha-send-box').hidden, title: document.getElementById('deck-alpha-send-title').textContent.trim(), labels: [...document.querySelectorAll('#deck-alpha-send-sets button')].map((b) => b.textContent), sent: localStorage.getItem('umaDeck:send') }));
		assert(box.vis && box.title === 'Deck (αテスト)に送る' && box.labels.join() === '親Aセット,親B' && !box.sent, '小窓に2つのボタン（祖がいない親Bは「親B」）。押すまで送らない', box);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);
		const esc = await page.evaluate(() => ({ box: document.getElementById('deck-alpha-send-box').hidden, drawer: !document.getElementById('result-drawer').hidden }));
		assert(esc.box && esc.drawer, 'Esc で小窓だけ閉じる（引き出しは開いたまま）', esc);

		// 親Aセットを登録する
		await page.click('#deck-alpha-send-btn');
		const reg = await popupOf(ctx, () => page.click('#deck-alpha-send-sets [data-deck-alpha-set="0"]'));
		watch(reg);
		await reg.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S.persons.length === 3);
		const A = await reg.evaluate(() => { const { S } = window.__deckAlphaRegister; return { exam: S.exam, setKey: S.setKey, label: document.getElementById('fromLabel').textContent, umas: S.persons.map((p) => p.uma), blue: S.persons[0].blue, red: S.persons[0].red, sheet: Object.keys(S.persons[0].sheet || {}).length, row: { }, link: document.querySelectorAll('#body [data-link]').length }; });
		assert(A.exam && A.setKey === 'exam' && A.label === 'UmaExam から', '登録の画面は UmaExam から・セットは技能試験', A);
		assert(A.umas.every(Boolean) && A.blue.join() === 'power,3' && A.red.join() === 'nige,2' && A.sheet === 1, '緑の名前から衣装が決まり、青・赤・sheet を受け取る', A);
		await reg.click('#regBtn');
		await reg.waitForFunction(() => window.__deckAlphaRegister.S.done, null, { timeout: 8000 });
		const saved = await reg.evaluate(async () => {
			const { K } = window.__deckAlphaRegister;
			const doc = K.assemble(await K.store.load());
			const pa = doc.parents[0];
			return { n: doc.parents.length, from: pa.from, sets: pa.sets, exam: doc.exam && doc.exam.sends, examKeys: doc.exam && Object.keys(doc.exam.skills).length, none: doc.none ? Object.keys(doc.none.skills || {}).length : 0, inNone: K.inNoneList ? K.inNoneList(pa) : null, gp: (pa.gp || []).length, sheet: Object.keys(pa.sheet || {}).length, skills: Object.keys(pa.skills).length };
		});
		assert(saved.n === 1 && saved.from === 'exam' && saved.sets.join() === 'exam' && saved.exam === 1 && saved.examKeys === 134, '技能試験のまとまりにだけ入る（233）・doc.exam は134種', saved);
		assert(saved.gp === 2 && saved.sheet === 1 && saved.skills >= 9, '祖2人・sheet・134種の外の id が保存される', saved);
		await reg.close();

		// Deck α の表: UmaExam 用に1人・UmaStar 用の「指定なし」には出ない
		const deck = await ctx.newPage();
		watch(deck);
		await deck.goto(base + '/deck-alpha.html');
		await deck.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc);
		await deck.waitForTimeout(300);
		const v = await deck.evaluate(() => { const S = window.__deckAlpha.S; return { mode: S.settings.mode, rows: document.querySelectorAll('#tbl tbody tr, table tbody tr').length, exam: S.doc.parents.filter((p) => (p.sets || []).includes('exam')).length, none: S.doc.parents.filter((p) => p.from !== 'exam').length }; });
		assert(v.mode === 'exam' && v.exam === 1 && v.none === 0, 'Deck α は UmaExam 用の表で開く・「指定なし」に出る親はいない', v);
		await shot(deck, 'deck-1280-light-exam-table');
		await deck.close();

		// 親Bを送る: 親Aと同じ衣装なので「同一」が出る（234）。選ぶと新しい親を作らない
		await page.bringToFront();
		await page.click('#deck-alpha-send-btn');
		const regB = await popupOf(ctx, () => page.click('#deck-alpha-send-sets [data-deck-alpha-set="1"]'));
		watch(regB);
		await regB.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S.persons.length === 1);
		await regB.waitForTimeout(200);
		const b = await regB.evaluate(() => { const l = document.querySelector('#body [data-link]'); return { n: document.querySelectorAll('#body [data-link]').length, text: document.getElementById('body').innerText.includes('と同一'), id: l && l.dataset.link, cur: window.__deckAlphaRegister.S.persons[0].link }; });
		assert(b.n === 1 && b.text, '親Aにも「登録済みの〇〇と同一」が出る（234）', b);
		// スキルと★が全部同じ親が1人だけのときは、選んだ状態で出る（押すと外れる）
		if (b.cur !== b.id) await regB.click('#body [data-link="' + b.id + '"]');
		await regB.waitForTimeout(100);
		await regB.click('#regBtn');
		await regB.waitForFunction(() => window.__deckAlphaRegister.S.done, null, { timeout: 8000 });
		const after = await regB.evaluate(async () => { const { K } = window.__deckAlphaRegister; const doc = K.assemble(await K.store.load()); return { n: doc.parents.length, sends: doc.exam.sends }; });
		assert(after.n === 1 && after.sends === 2, '「同一」を選ぶと新しい親を作らず足す', after);
		await regB.close();
		assert(errs.length === 0, 'コンソールのエラー0', errs);
		await ctx.close();
	});

	await block('T104 exam 送る ―― 見た目: PC はボタンと1行が同じ行（親Aだけ 530px の中）・スマホは幅いっぱいとその下に1行・「？」が動く・横スクロールなし', async () => {
		for (const theme of ['light', 'dark']) {
			{
				const { ctx, page, errs } = await open(1280, theme);
				for (const sets of ['a', 'ab']) {
					await judge(page, sets, false);
					await page.waitForTimeout(450);
					const g = await page.evaluate(() => {
						const n = document.getElementById('deck-alpha-send-note'), b = document.getElementById('deck-alpha-send-btn'), p = n.querySelector('p');
						const rb = b.getBoundingClientRect(), rp = p.getBoundingClientRect(), rn = n.getBoundingClientRect();
						const drawer = document.getElementById('result-drawer').getBoundingClientRect();
						return { btnH: rb.height, pH: rp.height, noteH: rn.height, sameRow: Math.abs((rb.top + rb.bottom) / 2 - (rp.top + rp.bottom) / 2) <= 1, inside: rp.right <= drawer.right, drawerW: Math.round(drawer.width), fs: getComputedStyle(b).fontSize, oneLine: p.getClientRects().length === 1 && rp.height <= 15 };
					});
					assert(g.btnH === 28 && g.sameRow && g.oneLine && g.inside && g.noteH === 28 && g.fs === '11px', theme + '/' + sets + ' ボタン 28px・停止の1行が同じ行で折り返さない', g);
					assert(g.drawerW === (sets === 'a' ? 530 : 750), theme + '/' + sets + ' 引き出しの幅は T100 のまま', g.drawerW);
					await shot(page, 'exam-1280-' + theme + '-' + sets);
					if (sets === 'ab') {
						await page.click('#deck-alpha-send-btn');
						await page.waitForTimeout(250);
						await shot(page, 'exam-1280-' + theme + '-pop');
						await page.keyboard.press('Escape');
					}
					await page.evaluate(() => closeDrawer());
					await page.waitForTimeout(450);
				}
				assert(await noScroll(page), theme + ' 横スクロールなし');
				await page.evaluate(() => { document.getElementById('tool-dropdown-btn').click(); });
				await page.waitForTimeout(200);
				await shot(page, 'exam-1280-' + theme + '-tool');
				await page.evaluate(() => { document.getElementById('tool-dropdown-btn').click(); setFabOpen(true); });
				await page.waitForTimeout(450);
				await shot(page, 'exam-1280-' + theme + '-fab');
				assert(errs.length === 0, theme + ' コンソールのエラー0', errs);
				await ctx.close();
			}
			{
				const { ctx, page, errs } = await open(375, theme);
				for (const sets of ['a', 'ab']) {
					await judge(page, sets, false);
					await page.waitForTimeout(450);
					const g = await page.evaluate(() => {
						const n = document.getElementById('deck-alpha-send-note'), b = document.getElementById('deck-alpha-send-btn'), p = n.querySelector('p');
						const rb = b.getBoundingClientRect(), rp = p.getBoundingClientRect(), rn = n.getBoundingClientRect();
						return { btnH: rb.height, full: Math.abs(rb.width - rn.width) <= 1, below: rp.top >= rb.bottom, oneLine: rp.height <= 15, right: rp.right <= window.innerWidth };
					});
					assert(g.btnH === 30 && g.full && g.below && g.oneLine && g.right, theme + '/' + sets + ' スマホはボタン 30px を幅いっぱい・その下に1行', g);
					await shot(page, 'exam-375-' + theme + '-' + sets);
					// 「？」（T100）: 開く・外を押すと閉じる。送るボタンを足しても動く
					await page.click('#hl-note-btn');
					await page.waitForTimeout(100);
					const opened = await page.evaluate(() => getComputedStyle(document.getElementById('hl-note')).display !== 'none' && document.getElementById('hl-note-btn').getAttribute('aria-expanded') === 'true');
					assert(opened, theme + '/' + sets + ' 「？」で開く');
					if (sets === 'a') {
						// 送るボタンを押しても閉じる（ボタンは親1セットなのでそのまま送る）
						const pop = await popupOf(ctx, () => page.click('#deck-alpha-send-btn'));
						await pop.close();
					} else {
						await page.click('#stat-grid');
					}
					await page.waitForTimeout(100);
					const closed = await page.evaluate(() => getComputedStyle(document.getElementById('hl-note')).display === 'none' && document.getElementById('hl-note-btn').getAttribute('aria-expanded') === 'false');
					assert(closed, theme + '/' + sets + ' 外を押すと閉じる', sets === 'a' ? '送るボタン' : '上の欄');
					if (sets === 'ab') {
						await page.click('#deck-alpha-send-btn');
						await page.waitForTimeout(250);
						const fit = await page.evaluate(() => { const r = document.getElementById('deck-alpha-send-box').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
						assert(fit, theme + ' 小窓が画面に収まる');
						await shot(page, 'exam-375-' + theme + '-pop');
						await page.keyboard.press('Escape');
					}
					await page.evaluate(() => closeDrawer());
					await page.waitForTimeout(450);
				}
				assert(await noScroll(page), theme + ' 横スクロールなし');
				await page.evaluate(() => { document.getElementById('tool-dropdown-btn').click(); });
				await page.waitForTimeout(200);
				await shot(page, 'exam-375-' + theme + '-tool');
				await page.evaluate(() => { document.getElementById('tool-dropdown-btn').click(); setFabOpen(true); });
				await page.waitForTimeout(450);
				await shot(page, 'exam-375-' + theme + '-fab');
				assert(errs.length === 0, theme + ' コンソールのエラー0', errs);
				await ctx.close();
			}
		}
	});
}
