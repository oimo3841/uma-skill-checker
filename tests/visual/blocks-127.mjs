// T116（2026-11-07・回答 (5)・364〜366）: UmaStar の青・赤因子の読み取りと、Deck α の「同一」の判定の検査。
// run-smoke.mjs の末尾から register127() で呼ばれる（塊の見出しはすべて「T116」で始まる。`npm run test:visual -- --only=T116` で回せる）。
//
//  - (5)・366: UmaStar でも親・祖の青・赤を UmaExam と同じ読み方で読み、Deck α へ送る。読む関数は exam.html の写しなので、中身の一致を見る。
//  - 364: 読んだ青・赤は送るぶんだけに使う。全員の白スキルの読み取りのあとで読み、結果の画面の HTML に入れない。旧UI では読まない。
//  - 365: matchCandidates の exact で青・赤も比べる。どちらも分かっていて違うときは exact にしない。
// 実物の読み（画像・動画）は tests/ocr/run-star-top-tests.mjs が見る（OCR と CDN が要るのでここでは回さない）。ここでは偽の OCR で流れと形を見る。
// スキル名・衣装名は検査の側に書かない（恒久ルール1。データから引く）。
import { installReadyProbe, waitPageReady } from './lib/page-ready.mjs';

const COPIED = ['melopPinkMaskOf', 'melopStarMaskOf', 'melopWidestRun', 'findMelopTopLayout', 'melopChipStars', 'melopTextCanvas', 'melopPickName', 'melopRecognizeName'];

export async function register127(env) {
	const { block, assert, browser, base, openPage, REPO_ROOT, fs, path } = env;
	const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

	/** 新UI（Deck連携）の UmaStar を開く */
	async function openStar() {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		await installReadyProbe(ctx);
		await ctx.addInitScript(({ ids }) => {
			try {
				if (!sessionStorage.getItem('__t116')) {
					sessionStorage.setItem('__t116', '1');
					localStorage.setItem('umaSkillDeck:userData', JSON.stringify({ schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] }));
					localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ skillFilter: { style: 'sashi' } }));
					localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
					localStorage.setItem('umaSkillDeck:stepTab', '1');
				}
			} catch (e) { /* 使えなければよい */ }
		}, { ids: Array.from({ length: 12 }, (_, i) => String(i + 1)) });
		const page = await ctx.newPage();
		page.setDefaultTimeout(8000);
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 404/.test(m.text())) errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		await page.goto(base + '/special.html', { waitUntil: 'load', timeout: 60000 });
		await waitPageReady(page);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await page.waitForFunction(() => typeof deckMode !== 'undefined' && deckMode && skillList.length > 0, null, { timeout: 20000 });
		return { ctx, page, errs };
	}

	/** 偽の OCR で processImages を通す。呼ばれた順を返す。top … readTopBlueRed の代わり */
	const runFlow = (page, opts) => page.evaluate(async (opts) => {
		const orig = { ppi: processPersonImages, top: readTopBlueRed, green: readGreenFactor, tess: window.Tesseract, deck: deckMode };
		const calls = [];
		processPersonImages = async (w, files, label) => { calls.push('white:' + label); return { lines: [{ text: 'テスト', stars: null, starsReliable: false, rowKey: '0:0' }], skipped: [], warned: [], geometry: [null] }; };
		readGreenFactor = async () => { calls.push('green'); return null; };
		readTopBlueRed = async (w, files) => {
			calls.push('top:' + files[0].name);
			if (opts.topThrows) throw new Error('テスト用の失敗');
			return { blue: { name: 'パワー', text: '', stars: 3 }, red: { name: '芝', text: '', stars: 0 } };
		};
		window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, recognize: async () => ({ data: { text: '', lines: [] } }), terminate: async () => {} }) };
		deckMode = opts.deck;
		persons.forEach((p) => { p.files = []; });
		[0, 1, 2].forEach((i) => { persons[i].files = [new File(['x'], 'p' + i + '.png', { type: 'image/png' })]; });
		let threw = null, ret = null;
		try { ret = await processImages({ keepClosed: true, quiet: true }); } catch (e) { threw = String(e); }
		const out = { calls, threw, ret, errShown: !document.getElementById('error-wrap').classList.contains('hidden'), top: personTop.slice(0, 3), results: personResults.slice(0, 3).map((r) => !!r) };
		processPersonImages = orig.ppi; readTopBlueRed = orig.top; readGreenFactor = orig.green; window.Tesseract = orig.tess; deckMode = orig.deck;
		return out;
	}, opts);

	await block('T116 UmaStar の青・赤の読み方は UmaExam と同じ（関数の写しの一致・名前の一覧）', async () => {
		const src = {};
		for (const file of ['special.html', 'exam.html']) {
			const { page, ctx } = await openPage(browser, base, file);
			src[file] = await page.evaluate((names) => ({
				fns: Object.fromEntries(names.map((n) => [n, String(window[n]).replace(/\r/g, '')])),
				blue: DECK_ALPHA_BLUE_KEY, red: DECK_ALPHA_RED_KEY
			}), COPIED);
			await ctx.close();
		}
		const diff = COPIED.filter((n) => src['special.html'].fns[n] !== src['exam.html'].fns[n] || src['special.html'].fns[n].length < 50);
		assert(diff.length === 0, '読む関数の中身が exam.html と同じ（' + COPIED.length + '個）', diff);
		assert(JSON.stringify(src['special.html'].blue) === JSON.stringify(src['exam.html'].blue) && JSON.stringify(src['special.html'].red) === JSON.stringify(src['exam.html'].red), '名前 → 鍵の対応が exam.html と同じ', src['special.html'].red);
		// 名前の一覧は UmaExam の読み方の元（data/melop-sheet-rows.json の青・赤の行）と同じ15語。鍵は Deck α の BLUE・RED にある
		const rows = JSON.parse(read('data/melop-sheet-rows.json')).rows;
		const names = (slot) => rows.filter((r) => r.slot === slot).map((r) => r.name).sort().join();
		assert(Object.keys(src['special.html'].blue).sort().join() === names('blue') && Object.keys(src['special.html'].red).sort().join() === names('red'), '読む名前は exam の青5語・赤10語と同じ', null);
		const T = await openStar();
		try {
			await T.page.goto(base + '/deck-alpha-register.html'); await T.page.waitForFunction(() => window.DeckAlpha);
			const keys = await T.page.evaluate(() => ({ b: Object.keys(window.DeckAlpha.BLUE), r: Object.keys(window.DeckAlpha.RED) }));
			assert(Object.values(src['special.html'].blue).every((k) => keys.b.includes(k)) && Object.values(src['special.html'].red).every((k) => keys.r.includes(k)), '鍵はどれも Deck α の BLUE・RED にある', keys);
		} finally { await T.ctx.close(); }
	});

	await block('T116 readTopBlueRed: いちばん上の段の位置・★・名前（偽の OCR）', async () => {
		const { page, ctx, errors } = await openPage(browser, base, 'special.html');
		try {
			const r = await page.evaluate(async () => {
				// 青のチップと赤のチップ（1段目）、全幅でない緑のチップ（2段目）を描く。金の四角が★
				const sheet = (o) => {
					const c = document.createElement('canvas'); c.width = 1000; c.height = 1800;
					const g = c.getContext('2d');
					g.fillStyle = '#fff'; g.fillRect(0, 0, 1000, 1800);
					if (!o) return c;
					g.fillStyle = 'rgb(60,130,230)'; g.fillRect(40, 300, 440, 40);
					if (o.pink !== false) { g.fillStyle = 'rgb(240,100,190)'; g.fillRect(520, 300, 440, 40); }
					g.fillStyle = 'rgb(140,207,50)'; g.fillRect(40, 341, 440, 40);
					g.fillStyle = 'rgb(240,180,40)';
					for (let i = 0; i < o.blue; i++) g.fillRect(100 + i * 24, 330, 16, 18);
					if (o.pink !== false) for (let i = 0; i < o.red; i++) g.fillRect(620 + i * 24, 330, 16, 18);
					return c;
				};
				const orig = { load: loadImage, base: toBaseCanvas, q: assessImageQuality };
				const canvases = new Map();
				loadImage = async (f) => canvases.get(f); toBaseCanvas = (x) => x; assessImageQuality = () => ({ ok: true });
				const file = (cv) => { const f = new File([], 'x.png'); canvases.set(f, cv); return f; };
				const run = async (list, texts) => {
					let n = 0;
					const worker = { recognize: async () => ({ data: { text: texts[n++] || '' } }) };
					return { r: await readTopBlueRed(worker, list.map(file)), n };
				};
				try {
					return {
						both: await run([sheet({ blue: 2, red: 3 })], ['スピード\n', 'ダ ート']),
						unread: await run([sheet({ blue: 1, red: 0 })], ['###', '']),
						second: await run([sheet(null), sheet({ blue: 3, red: 1 })], ['賢さ', '追込']),
						noPink: await run([sheet({ blue: 2, pink: false })], ['パワー']),
						none: await run([sheet(null)], []),
						empty: await run([], [])
					};
				} finally { loadImage = orig.load; toBaseCanvas = orig.base; assessImageQuality = orig.q; }
			});
			const pick = (h) => h && [h.name, h.stars];
			assert(JSON.stringify(pick(r.both.r.blue)) === '["スピード",2]' && JSON.stringify(pick(r.both.r.red)) === '["ダート",3]' && r.both.n === 2, '段があれば青・赤の名前と★を読む（OCR は2回）', r.both);
			assert(JSON.stringify(pick(r.unread.r.blue)) === '[null,1]' && JSON.stringify(pick(r.unread.r.red)) === '[null,0]', '名前が決まらなくても★は残す', r.unread);
			assert(JSON.stringify(pick(r.second.r.blue)) === '["賢さ",3]' && JSON.stringify(pick(r.second.r.red)) === '["追込",1]', '段のある最初の画像を読む', r.second);
			assert(JSON.stringify(pick(r.noPink.r.blue)) === '["パワー",2]' && r.noPink.r.red === null && r.noPink.n === 1, '赤のチップが無ければ赤は null', r.noPink);
			assert(r.none.r === null && r.none.n === 0 && r.empty.r === null, '段が写っていなければ null（OCR を呼ばない）', r.none);
			assert(errors.length === 0, 'エラーなし', errors);
		} finally { await ctx.close(); }
	});

	await block('T116 判定の流れ: 新UI だけ読む・全員の白スキルのあとで読む・失敗しても判定は続く・結果の画面に出さない', async () => {
		const T = await openStar(); const { page } = T;
		try {
			const r = await runFlow(page, { deck: true });
			const c = r.calls;
			const lastWhite = c.map((x) => x.startsWith('white:')).lastIndexOf(true), firstTop = c.findIndex((x) => x.startsWith('top:'));
			assert(c.filter((x) => x.startsWith('white:')).length === 3 && c.filter((x) => x.startsWith('top:')).join() === 'top:p0.png,top:p1.png,top:p2.png', '画像のある3人を1回ずつ読む', c);
			assert(lastWhite >= 0 && firstTop > lastWhite && c.lastIndexOf('green') < firstTop, '白スキルと緑の読み取りが全員終わったあとで読む（同じ OCR の前の読みが後の読みに影響しない）', c);
			assert(r.threw === null && r.top.every((t) => t && t.blue.name === 'パワー'), '人ごとに控える', r.top);
			const html = await page.evaluate(() => {
				const draw = () => { renderResults(); return document.getElementById('result-drawer').innerHTML; };
				const withTop = draw(), keep = personTop;
				personTop = PERSON_LABELS.map(() => null);
				const without = draw();
				personTop = keep;
				return { withTop, without };
			});
			assert(html.withTop.length > 0 && html.withTop === html.without, '読んだ青・赤があってもなくても結果の画面は同じ', html.withTop.length);
			const f = await runFlow(page, { deck: true, topThrows: true });
			assert(f.threw === null && f.results.every(Boolean) && f.top.every((t) => t === null) && f.calls.filter((x) => x.startsWith('top:')).length === 3 && !f.errShown, '読み取りが失敗しても判定は続き、その人は null（次の人も読む・エラーの枠を出さない）', f);
			const off = await runFlow(page, { deck: false });
			assert(!off.calls.some((x) => x.startsWith('top:')) && off.results.every(Boolean), '旧UI では読まない', off.calls);
			assert(T.errs.filter((e) => !/テスト用の失敗/.test(e)).length === 0, 'エラーなし', T.errs);
		} finally { await T.ctx.close(); }
	});

	await block('T116 送る JSON: 読めた人は [鍵, ★]・★が読めなければ -1・名前が決まらなければ [null, ★]・段が無ければ null', async () => {
		const T = await openStar(); const { page } = T;
		try {
			const r = await page.evaluate(() => {
				const mk = () => ({ detectedSkills: new Set(), skillStars: {}, skillSources: {}, matchReasons: {} });
				personResults = PERSON_LABELS.map(() => null); personGreen = PERSON_LABELS.map(() => null); personTop = PERSON_LABELS.map(() => null);
				[0, 1, 2, 3].forEach((i) => { personResults[i] = mk(); });
				personTop[0] = { blue: { name: 'スピード', text: '', stars: 3 }, red: { name: '追込', text: '', stars: 2 } };
				personTop[1] = { blue: { name: '賢さ', text: '', stars: 0 }, red: { name: null, text: '###', stars: 1 } };
				personTop[2] = { blue: { name: null, text: '', stars: 0 }, red: null };
				personTop[3] = null;
				return { a: buildDeckAlphaSend(0).persons, b: buildDeckAlphaSend(1).persons };
			});
			const pair = (p) => JSON.stringify([p.blue, p.red]);
			assert(pair(r.a[0]) === '[["speed",3],["oikomi",2]]', '親: 読めた名前の鍵と★', r.a[0]);
			assert(pair(r.a[1]) === '[["wit",-1],[null,1]]', '祖1: ★が読めなければ -1・名前が決まらなければ [null, ★]', r.a[1]);
			assert(pair(r.a[2]) === '[[null,-1],null]', '祖2: 青は読めず・赤のチップが無ければ null', r.a[2]);
			assert(pair(r.b[0]) === '[null,null]', '段が写っていない人は今までどおり null', r.b[0]);
		} finally { await T.ctx.close(); }
	});

	await block('T116 同一の判定（365）: 青・赤がどちらも分かっていて違うときは exact にしない・登録の画面と保存', async () => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		const page = await ctx.newPage();
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		const ev = (f, a) => page.evaluate(f, a);
		try {
			await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.DeckAlpha, null, { timeout: 15000 });
			const d = await ev(() => { const K = window.DeckAlpha; return { uma: K.D.costumes.filter((c) => c.uniq.length).slice(0, 3).map((c) => c.id), sk: K.D.skills.slice(0, 3).map((s) => s.id) }; });
			const skills = { [d.sk[0]]: 2, [d.sk[1]]: 1 };
			const m = await ev((x) => {
				const K = window.DeckAlpha;
				const p = { id: 'p1', uma: x.uma, skills: x.skills, green: null, blue: ['speed', 3], red: ['turf', 2] };
				const ex = (blue, red, reg) => K.matchCandidates({ parents: [Object.assign({}, p, reg || {})] }, { uma: x.uma, skills: x.skills, blue, red })[0].exact;
				return {
					same: ex(['speed', 3], ['turf', 2]),
					blueName: ex(['power', 3], ['turf', 2]), blueStar: ex(['speed', 2], ['turf', 2]),
					redName: ex(['speed', 3], ['dirt', 2]), redStar: ex(['speed', 3], ['turf', 1]),
					nul: ex(null, null), undef: ex(undefined, undefined),
					unknownStar: ex(['speed', -1], ['turf', -1]), unknownName: ex([null, 3], [null, 2]), unknownBoth: ex([null, -1], [null, -1]),
					unknownNameStarDiff: ex([null, 2], ['turf', 2]),
					regNull: ex(['power', 1], ['dirt', 1], { blue: null, red: null }), regUnknownStar: ex(['speed', 2], ['turf', 1], { blue: ['speed', -1], red: ['turf', -1] })
				};
			}, { uma: d.uma[0], skills });
			assert(m.same && !m.blueName && !m.blueStar && !m.redName && !m.redStar, '名前か★が違えば exact でない・同じなら exact', m);
			assert(m.nul && m.undef && m.unknownStar && m.unknownName && m.unknownBoth && m.regNull && m.regUnknownStar, 'どちらかが分かっていない（null・★不明・名前が決まらない）なら比べない', m);
			assert(!m.unknownNameStarDiff, '名前が決まらなくても★が両方分かっていて違えば exact でない', m);

			// 登録の画面: 親に登録済みの親と同じものを送る
			const par = { id: 'p1', uma: d.uma[0], date: '2026-10-11', no: 1, owner: 'self', sets: [], tags: { style: [] }, gp: [], green: null, blue: ['speed', 3], red: ['turf', 2], skills, genes: {} };
			const seed = () => ev(async (x) => { const K = window.DeckAlpha; await K.store.replaceAll(Object.assign(K.emptyDoc(), { next: 2, parents: [x] })); await K.store.putMeta('settings', Object.assign({}, K.DEFAULT_SETTINGS, { lastExport: new Date().toISOString() })); }, par);
			const send = (blue, red) => ev((x) => localStorage.setItem('umaDeck:send', JSON.stringify({ format: 'uma-deck-send', v: 1, sentAt: new Date().toISOString(), from: 'star', race: null, style: null, owner: 'self', send: [], persons: [{ uma: x.uma, green: null, greenCands: null, blue: x.blue, red: x.red, skills: x.skills, genes: {} }] })), { uma: d.uma[0], skills, blue, red });
			const openReg = async () => { await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S && window.__deckAlphaRegister.S.persons && window.__deckAlphaRegister.S.persons.length > 0, null, { timeout: 15000 }); };
			const linked = () => ev(() => window.__deckAlphaRegister.S.persons[0].link);
			await seed();
			await send(['speed', 3], ['turf', 2]); await openReg();
			assert(await linked() === 'p1', '青・赤も同じなら「同一」を選んだ状態で出す', null);
			await send(['speed', 3], ['dirt', 2]); await openReg();
			assert(await linked() == null, '赤が違えば「同一」を選ばない', null);
			await send(['power', 3], ['turf', 2]); await openReg();
			assert(await linked() == null, '青が違えば「同一」を選ばない', null);
			await send(null, null); await openReg();
			assert(await linked() === 'p1', '青・赤を読んでいなければ今までどおり「同一」', null);

			// 登録すると青・赤が親に入る（「同一」でない新しい親。読めなかった赤は入らない）
			await send(['power', 2], [null, 1]); await openReg();
			const fz = await ev(() => { const t = (k) => document.querySelector('[data-act="toggle-' + k + '"]'); return { b: t('blue').textContent, r: t('red').textContent, rNeed: t('red').classList.contains('need'), bNeed: t('blue').classList.contains('need') }; });
			assert(/パワー/.test(fz.b) && /★?2|2/.test(fz.b) && fz.r === '読めなかった' && fz.rNeed && !fz.bNeed, '登録の画面: 読めた青は名前と★・決まらなかった赤は「読めなかった」で要確認', fz);
			await page.click('#regBtn'); await page.waitForFunction(() => window.__deckAlphaRegister.S.done, null, { timeout: 8000 });
			const saved = await ev(async () => { const l = await window.DeckAlpha.store.load(); const ps = l.parents || l.meta.parents || []; return ps.map((p) => ({ id: p.id, blue: p.blue, red: p.red })); });
			const np = saved.find((p) => p.id !== 'p1');
			assert(np && JSON.stringify(np.blue) === '["power",2]' && np.red === null, '保存: 新しい親に読めた青が入る', saved);
			assert(errs.length === 0, 'エラーなし', errs);
		} finally { await ctx.close(); }
	});
}
