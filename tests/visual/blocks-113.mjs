// UmaExam 用 Deck（T104 段2・2026-11-05・C-296）の検査。Deck α 側と旧ページ（exam.html の分は別の塊で足す）。
// run-smoke.mjs の末尾から register113() で呼ばれる（塊の見出しはすべて「T104 Deck α UmaExam」で始まる。`npm run test:visual -- --only=T104 Deck α UmaExam`）。
//
// 決め（おいもさん。C-295・C-296）:
//  - 切り替えは見出しのセットのボタンの小窓の中（231）。表は技能試験の133行・効率の列は最大の右（225）・充足は N/133（名前で絞っても分母は133。98）。
//  - UmaExam から登録した親は技能試験の表にだけ出し、UmaStar 用の表の「指定なし」に出さない（233）。レースのセットには親の小窓で選んだときだけ入る（245）。
//    UmaStar から登録した親は技能試験の表に出さない。
//  - UmaExam から送るとき、親Aにも「登録済みの〇〇と同一」を出す（選ぶとその親に足す・読み取りの値で上書き・技能試験の表に入る。234）。
//  - 古い保存データ（doc.exam なし）で UmaStar 用の表は今と同じ。書き出しと読み込みで doc.exam・sheet が残る。書き出しのファイルは1つ（240）。
//  - 旧ページの先頭に入口と1行（223・239）。リンク先に ? と # を付けない（恒久ルール32）。
// T104_SHOTS=<フォルダ> を付けて回すと、画面の画像をそのフォルダに残す（モックの 01〜12・16 に相当）。
import fs from 'node:fs';
import path from 'node:path';

export async function register113(env) {
	const { block, assert, browser, base, REPO_ROOT } = env;
	const SHOTS = process.env.T104_SHOTS || '';
	const root = REPO_ROOT || process.cwd();
	const examHtml = fs.readFileSync(path.join(root, 'exam.html'), 'utf8');
	const m133 = examHtml.match(/const EXAM_SKILL_LIST\s*=\s*\[([\s\S]*?)\n\s*\];/);
	const IDS = [...m133[1].matchAll(/\{\s*id:\s*'([^']+)'/g)].map((x) => x[1]);
	const effJson = JSON.parse(fs.readFileSync(path.join(root, 'data/skill-efficiency.json'), 'utf8'));
	const EFF = {}; effJson.entries.forEach((e) => { if (e.skillId) EFF[String(e.skillId)] = e.efficiency; });
	const sizes = { 375: { width: 375, height: 812, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };

	async function open(w, theme) {
		const sz = sizes[w];
		const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: 1, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: theme });
		const page = await ctx.newPage();
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		await page.addInitScript((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) { /* 無ければよい */ } }, theme);
		const ev = (f, a) => page.evaluate(f, a);
		const ready = () => page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc && (document.querySelector('.vh, canvas.ov, .stage .empty')), null, { timeout: 15000 });
		const openDeck = async (q) => { await page.goto(base + '/deck-alpha.html' + (q || '')); await ready(); await page.waitForTimeout(150); };
		const seed = async (n) => {
			await openDeck();
			await page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
			await ev(async (x) => { const d = window.__deckAlphaMock.makeMock(x, 11); delete d.none; await window.DeckAlpha.store.replaceAll(d); await window.DeckAlpha.store.putMeta('settings', Object.assign({}, window.DeckAlpha.DEFAULT_SETTINGS, { lastExport: new Date().toISOString() })); }, n);
			await openDeck();
		};
		const send = (o) => ev((x) => localStorage.setItem('umaDeck:send', JSON.stringify(Object.assign({ format: 'uma-deck-send', v: 1, sentAt: new Date().toISOString(), race: null, style: null, owner: 'self' }, x))), o);
		const openReg = async () => { await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S.doc, null, { timeout: 15000 }); await page.waitForTimeout(150); };
		const doReg = async () => { await page.click('#regBtn'); await page.waitForFunction(() => window.__deckAlphaRegister.S.done, null, { timeout: 8000 }); };
		const wide = [];
		const look = async (name, full) => {
			await page.waitForTimeout(120);
			const r = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
			if (r.sw > r.iw) wide.push(name + ':' + r.sw + '>' + r.iw);
			if (!SHOTS) return;
			fs.mkdirSync(SHOTS, { recursive: true });
			const file = path.join(SHOTS, w + '-' + theme + '-' + name + '.png');
			if (full) { const H = await ev(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)); await page.setViewportSize({ width: sz.width, height: H }); await page.waitForTimeout(120); await page.screenshot({ path: file }); await page.setViewportSize({ width: sz.width, height: sz.height }); }
			else await page.screenshot({ path: file });
		};
		return { ctx, page, errs, ev, openDeck, seed, send, openReg, doReg, wide, look };
	}
	// 親3人の送りの中身（UmaExam の形）。親と祖は決まった衣装・★
	const person = (uma, stars, extra) => Object.assign({ uma, green: null, greenCands: null, blue: ['speed', 3], red: ['medium', 2], skills: stars, genes: { 'ap-turf': 1 }, sheet: { 'レース因子の見本': 2 } }, extra || {});
	const starsFrom = (from, n, v) => { const o = {}; IDS.slice(from, from + n).forEach((id) => { o[id] = v; }); return o; };
	const noFamily = (t) => !/家系/.test(t);

	/* ---------- (A) 古い保存データで UmaStar 用の表が変わらない ---------- */
	for (const w of [375, 1280]) {
		await block('T104 Deck α UmaExam ―― 古い保存データ（doc.exam なし）で UmaStar 用の表は今のまま（' + w + 'px）', async () => {
			const tag = w + 'px';
			const T = await open(w, 'light');
			try {
				await T.seed(14);
				const r = await T.ev(() => {
					const a = window.__deckAlpha, S = a.S, cols = [...document.querySelectorAll('.vl colgroup col')].map((c) => parseInt(c.style.width, 10));
					const own = new Set(); S.doc.parents.forEach((p) => S.M.fam(p).forEach((m) => Object.keys(m.skills || {}).forEach((id) => own.add(id))));
					return { mode: S.mode, setText: document.getElementById('setText').textContent, aria: document.getElementById('setBtn').getAttribute('aria-label'), cols, corner: document.querySelector('.vc button').textContent, chd: !!document.querySelector('.vc .chd'), ef: document.querySelectorAll('.vl th.ef').length, eff: !!document.getElementById('sortEff'),
						rs: [...document.getElementById('rs').options].map((o) => o.value).join(), rows: S.M.rows.length, own: own.size, parents: S.doc.parents.length, cnt: document.querySelector('.vc .cnt').textContent, gl: document.querySelectorAll('.vl th.gl').length,
						exam: 'exam' in S.doc, exp: JSON.stringify(a.K.buildExport(S.doc)), hasFrom: S.doc.parents.some((p) => 'from' in p || 'sheet' in p), gene: !document.getElementById('geneToggle').hidden, col: !document.getElementById('colMax').closest('.it').hidden, cat: !document.getElementById('sf-cat').closest('.it').hidden, style: !document.getElementById('pf-style').closest('.it').hidden };
				});
				const nw = w === 375 ? 76 : 112;
				assert(r.mode === 'star' && r.setText === '指定なし' && r.aria === 'レース/周回セット：指定なし', tag + ' 開くと UmaStar 用の表・「指定なし」', r);
				assert(r.cols.join() === nw + ',24' && r.corner === '最大' && !r.chd && r.ef === 0 && !r.eff, tag + ' 名前と最大の2列だけ・効率の列は無い・角は今の「最大」', r.cols);
				assert(r.rs === 'def,few,max,cat', tag + ' スキル(行)の並びは今の4つ', r.rs);
				assert(r.rows === r.own && r.cnt.includes(r.parents + '人') && r.cnt.includes(r.rows + '種') && r.gl === 3, tag + ' 親14人・行は親が持つスキル全部・遺伝子の3行', r.cnt);
				assert(!r.exam && !/"exam"|"sheet"|"from"/.test(r.exp) && !r.hasFrom, tag + ' 保存データと書き出しに doc.exam・sheet・from が増えない', r.exam);
				assert(r.gene && !r.col && r.cat && r.style, tag + ' 欄は UmaStar 用のまま（遺伝子の行あり・「列」は無い）', r);
				// 技能試験の表へ切り替えても親はいない
				await T.ev(() => window.__deckAlpha.switchMode('exam')); await T.page.waitForTimeout(100);
				const e = await T.ev(() => document.querySelector('.stage .empty').innerText);
				assert(e === '技能試験の親はまだいません。UmaExam の OCR から送ってください。', tag + ' UmaStar から登録した親は技能試験の表に出ない', e);
				assert(T.errs.length === 0, tag + ' コンソールのエラー 0', T.errs);
			} finally { await T.ctx.close(); }
		});
	}

	/* ---------- (B) 登録 → 表（133行・効率・並べ替え・列の出し入れ・充足）。ライトとダーク ---------- */
	for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
		await block('T104 Deck α UmaExam ―― 登録して133行の表・効率の列・並べ替え・充足 N/133（' + w + 'px・' + theme + '）', async () => {
			const tag = w + 'px ' + theme;
			const T = await open(w, theme); const { page, ev, look } = T;
			try {
				await T.seed(10);
				const uma = await ev(() => { const S = window.__deckAlpha.S; const used = new Set(S.doc.parents.map((p) => p.uma)); const free = window.DeckAlpha.D.costumes.filter((c) => !used.has(c.id) && c.uniq.length); return free.slice(0, 6).map((c) => c.id); });
				const before = await ev(() => { const S = window.__deckAlpha.S; return { n: S.doc.parents.length, rows: S.M.rows.map((s) => s.id) }; });
				// 親Aセットを登録（1組目）
				await T.send({ from: 'exam', send: IDS, persons: [person(uma[0], starsFrom(0, 50, 2)), person(uma[1], starsFrom(40, 30, 1)), person(uma[2], starsFrom(60, 10, 3))] });
				await T.openReg();
				const reg = await ev(() => ({ top: document.querySelector('.topline').innerText, body: document.getElementById('body').innerText, setBtn: !!document.getElementById('setPick'), tags: document.querySelectorAll('[data-style]').length }));
				assert(/UmaExam から/.test(reg.top) && /技能試験（133種）/.test(reg.body) && !reg.setBtn && reg.tags === 0 && !/②の/.test(reg.body), tag + ' 登録の画面: 「UmaExam から」・セットは「技能試験（133種）」で固定・脚質の札は出さない', reg.body.slice(0, 120));
				assert(noFamily(reg.body), tag + ' 登録の画面に「家系」が無い');
				await look('12-登録の画面', true);
				await T.doReg();
				// 親Aセットをもう1組（2人目）
				await T.send({ from: 'exam', send: IDS, persons: [person(uma[3], starsFrom(70, 40, 3)), person(uma[4], starsFrom(100, 20, 1)), person(uma[5], starsFrom(120, 13, 1))] });
				await T.openReg(); await T.doReg();
				await T.openDeck();
				const t1 = await ev(() => { const S = window.__deckAlpha.S, K = window.DeckAlpha; const hd = document.querySelector('.vc'); return {
					mode: S.mode, setText: document.getElementById('setText').textContent, cnt: document.querySelector('.vc .cnt').textContent, cols: [...document.querySelectorAll('.vl colgroup col')].map((c) => parseInt(c.style.width, 10)),
					hd: [...hd.querySelectorAll('.chd button')].map((b) => b.textContent).join(), sends: S.doc.exam.sends, keys: Object.keys(S.doc.exam.skills).length, fromExam: S.doc.parents.filter((p) => p.from === 'exam' && p.sets.join() === 'exam').length, sheet: S.doc.parents.filter((p) => p.from === 'exam').every((p) => p.sheet && p.sheet['レース因子の見本'] === 2 && p.gp[0].sheet['レース因子の見本'] === 2),
					named: Object.keys(S.doc.exam.skills).every((id) => K.skill(id).name !== id), rs: [...document.getElementById('rs').options].map((o) => o.value).join(), gl: document.querySelectorAll('.vl th.gl').length, style: !document.getElementById('pf-style').closest('.it').hidden, cat: !document.getElementById('sf-cat').closest('.it').hidden, list: document.getElementById('sf-listRow').hidden, gene: !document.getElementById('geneToggle').hidden, col: !document.getElementById('colMax').closest('.it').hidden }; });
				assert(t1.mode === 'exam' && t1.setText === '技能試験', tag + ' UmaExam から登録したあとは UmaExam 用の表で開く', t1.mode);
				assert(IDS.length === 133 && t1.cnt.includes('2人') && t1.cnt.includes('133種') && t1.keys === 133 && t1.named, tag + ' 親2人・133行・133種とも名前が引ける', t1.cnt);
				assert(t1.fromExam === 2 && t1.sheet && t1.sends === 2, tag + ' 親は sets:[exam]・from:exam、親と祖に sheet が残る・送りの回 2', t1);
				const nw = w === 375 ? 76 : 112;
				assert(t1.cols.join() === nw + ',24,26' && t1.hd === '最大,効率', tag + ' 列は 名前・最大・効率 の順（効率は最大の右）', t1.cols);
				assert(t1.rs === 'def,few,max,eff' && t1.gl === 0 && !t1.style && !t1.cat && t1.list && !t1.gene && t1.col, tag + ' 並びに「効率の高い順」・遺伝子の行と脚質・分類の欄は無い・「列」がある', t1);
				await look('01-表-UmaExam');
				// 効率の値（見えている行）がデータと一致（縮小は小数2桁）
				const cells = await ev(() => [...document.querySelectorAll('.vl tr')].map((tr) => { const th = tr.querySelector('th[data-r]'), ef = tr.querySelector('th.ef'); return th && ef ? [+th.dataset.r, ef.textContent] : null; }).filter(Boolean));
				const rowIds = await ev(() => { const a = window.__deckAlpha; return Object.keys(a.S.doc.exam.skills).map(a.K.skill).sort((x, y) => x.order - y.order).map((s) => s.id); });
				const effBad = cells.filter(([r, t]) => t !== EFF[rowIds[r]].toFixed(2));
				assert(cells.length > 10 && effBad.length === 0, tag + ' 効率の列の値が data/skill-efficiency.json と一致（見えている ' + cells.length + '行）', effBad.slice(0, 3));
				assert(IDS.every((id) => typeof EFF[id] === 'number'), tag + ' 133種すべてに効率がある');
				// 並べ替え: 効率の見出しで大きい順 → もう一度で戻る。選択中は黒の塗りで緑ではない
				const firstNames = () => ev(() => [...document.querySelectorAll('.vl th[data-r]')].slice(0, 12).map((t) => t.title));
				const n0 = await firstNames();
				await page.click('#sortEff'); await page.waitForTimeout(100);
				const eff1 = await ev(() => { const b = document.getElementById('sortEff'), cs = getComputedStyle(b); const ef = [...document.querySelectorAll('.vl th.ef')].map((t) => +t.textContent); return { pressed: b.getAttribute('aria-pressed'), bg: cs.backgroundColor, ef: ef.slice(0, 15), rs: window.__deckAlpha.S.rs, sel: document.getElementById('rs').value, dot: !document.getElementById('dotSort').hidden, tok: (() => { const d = document.createElement('i'); d.style.color = 'var(--gp-sel)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })() }; });
				const descending = eff1.ef.every((v, i) => !i || eff1.ef[i - 1] >= v);
				assert(eff1.pressed === 'true' && eff1.rs === 'eff' && eff1.sel === 'eff' && eff1.dot && descending && eff1.ef[0] === Math.round(Math.max(...IDS.map((id) => EFF[id])) * 100) / 100, tag + ' 効率の見出しを押すと大きい順', eff1);
				assert(eff1.bg === eff1.tok, tag + ' 選択中の見出しは --gp-sel の塗り（緑を使わない）', eff1);
				const rgb = eff1.bg.match(/\d+/g).map(Number);
				assert(!(rgb[1] > rgb[0] + 20 && rgb[1] > rgb[2] + 20), tag + ' 選択中の見出しの塗りが緑でない', eff1.bg);
				await look('03-表-効率で並べ替え');
				await page.click('#sortEff'); await page.waitForTimeout(100);
				assert((await firstNames()).join() === n0.join(), tag + ' もう一度押すと元の並びに戻る');
				await page.click('#sortMax'); await page.waitForTimeout(100);
				const mx = await ev(() => ({ rs: window.__deckAlpha.S.rs, pressed: document.getElementById('sortMax').getAttribute('aria-pressed'), v: [...document.querySelectorAll('.vl th.mx')].map((t) => +t.textContent).slice(0, 12) }));
				assert(mx.rs === 'max' && mx.pressed === 'true' && mx.v.every((v, i) => !i || mx.v[i - 1] >= v), tag + ' 最大の見出しを押すと大きい順', mx);
				await page.click('#sortMax'); await page.waitForTimeout(100);
				assert((await firstNames()).join() === n0.join(), tag + ' 最大ももう一度押すと戻る');
				// 列の出し入れ（列の幅に効く）
				const tab = async (name) => { if (w === 375) { await page.click('[data-tab="' + name + '"]'); await page.waitForTimeout(100); } };
				await tab('view');
				await look('04-表示の欄');
				await page.click('#colEff'); await page.waitForTimeout(100);
				const c2 = await ev(() => ({ cols: [...document.querySelectorAll('.vl colgroup col')].map((c) => parseInt(c.style.width, 10)), eff: !!document.getElementById('sortEff'), ef: document.querySelectorAll('.vl th.ef').length, set: window.__deckAlpha.S.settings.colEff, press: document.getElementById('colEff').getAttribute('aria-pressed'), bp: document.querySelector('.vs').style.backgroundPosition }));
				assert(c2.cols.join() === nw + ',24' && !c2.eff && c2.ef === 0 && c2.set === false && c2.press === 'false' && c2.bp.startsWith((nw + 24) + 'px'), tag + ' 効率を消すと列が減る（方眼の起点も動く）', c2);
				await page.click('#colMax'); await page.waitForTimeout(100);
				const c3 = await ev(() => ({ cols: [...document.querySelectorAll('.vl colgroup col')].map((c) => parseInt(c.style.width, 10)), mx: document.querySelectorAll('.vl th.mx').length, btn: document.querySelectorAll('.vc .chd button').length }));
				assert(c3.cols.join() === String(nw) && c3.mx === 0 && c3.btn === 0, tag + ' 最大も消せる', c3);
				await page.click('#colMax'); await page.waitForTimeout(60); await page.click('#colEff'); await page.waitForTimeout(100);
				// 列の設定は開き直しても残る
				const saved = await ev(async () => (await window.DeckAlpha.store.load()).meta.settings);
				assert(saved.colMax === true && saved.colEff === true && saved.mode === 'exam', tag + ' 列と表の選択は保存する', saved);
				await tab('view');
				// 充足: 親Aを選ぶ → N/133。名前で絞っても分母は133
				const pick = async (k, idx) => { await page.click('.vh th[data-c="' + idx + '"]'); await page.waitForSelector('#sheetIn [data-pick]'); await page.click('#sheetIn [data-pick="' + k + '"]'); await page.waitForTimeout(100); };
				await pick('A', 1); await pick('B', 0);
				const cov1 = await ev(() => { const a = window.__deckAlpha, S = a.S; const n = a.covRows().filter((r) => S.M.famHas(S.M.byId.get(S.A), r.id) || S.M.famHas(S.M.byId.get(S.B), r.id)).length; return { t: document.getElementById('cov').textContent, n }; });
				assert(cov1.t === cov1.n + '/133充足' && cov1.n > 100, tag + ' 親A・親Bの充足が N/133', cov1);
				await look('02-表-親A親Bを選ぶ');
				await tab('skill');
				await page.fill('#sf-q', '円弧'); await page.waitForTimeout(350);
				const cov2 = await ev(() => ({ t: document.getElementById('cov').textContent, cnt: document.querySelector('.vc .cnt') ? document.querySelector('.vc .cnt').textContent : '', miss: document.getElementById('miss').textContent }));
				assert(/\/133充足$/.test(cov2.t) && cov2.t === cov1.t && !cov2.cnt.includes('133種'), tag + ' 名前で絞っても分母は133（充足も変わらない）', cov2);
				await page.fill('#sf-q', ''); await page.waitForTimeout(350);
				await tab('skill');
				// 2組の詳細・親の小窓・スキルの小窓
				await page.click('#cov'); await page.waitForSelector('#sheetTitle');
				const det = await ev(() => document.getElementById('sheetIn').innerText);
				assert(/2組の充足/.test(det) && /\/133/.test(det) && !/（6人の合計）/.test(det) && noFamily(det), tag + ' 2組の詳細は N/133・遺伝子の行が無い', det.slice(0, 60));
				await ev(() => document.getElementById('scrim').click());
				await page.click('.vh th[data-c="0"]'); await page.waitForSelector('#sheetIn [data-pick]');
				const ps = await ev(() => { const dts = [...document.querySelectorAll('#sheetIn dl.kv dt')].map((d) => d.textContent); return { dts, tgl: [...document.querySelectorAll('#sheetIn .tgl')].map((x) => x.textContent), t: document.getElementById('sheetIn').innerText }; });
				assert(ps.dts.includes('セット') && !ps.dts.includes('脚質') && ps.tgl.length > 0 && !/（/.test((ps.t.match(/遺伝子[^\n]*/) || [''])[0].replace(/（6人の合計）/, '')) && noFamily(ps.t), tag + ' 親の小窓: セットの欄を残す（245）・脚質の欄は出さない・対象スキルは序盤などに分ける（237）', ps.dts);
				await ev(() => document.getElementById('scrim').click());
				await page.click('.vl th[data-r="0"]'); await page.waitForSelector('#sheetTitle');
				const sk = await ev(() => document.querySelector('#sheetTitle .sub').textContent);
				assert(/^効率 \d\.\d{3}/.test(sk), tag + ' スキルの小窓に効率（3桁）', sk);
				await ev(() => document.getElementById('scrim').click());
				// 拡大は3桁
				await ev(() => { const a = window.__deckAlpha; a.S.lv = 2; a.renderAll(); }); await page.waitForTimeout(100);
				const lv2 = await ev(() => ({ t: document.querySelector('.vl th.ef').textContent, cols: [...document.querySelectorAll('.vl colgroup col')].map((c) => parseInt(c.style.width, 10)) }));
				assert(/^\d\.\d{3}$/.test(lv2.t) && lv2.cols[2] === 38, tag + ' 拡大の効率は小数3桁', lv2);
				await look('06-拡大');
				await ev(() => { const a = window.__deckAlpha; a.S.lv = 1; a.renderAll(); });
				// 本育成設計の充足（238）
				await tab('plan');
				const pl = await ev(async () => {
					const a = window.__deckAlpha, S = a.S; const ps = S.doc.parents.filter((p) => p.from === 'exam'), f = (p) => S.M.fam(p).map((m) => m.uma);
					const out = {};
					const read = () => { a.renderAll(); return document.querySelector('#planSum .plancov') ? document.querySelector('#planSum .plancov').textContent : null; };
					const pl = S.doc.plans.exam || (S.doc.plans.exam = a.K.emptyPlan());
					out.empty = read();
					pl.slots = [a.K.D.costumes[0].id, null, null, null, null, null]; out.none = read();
					pl.slots = f(ps[0]).concat([null, null, null]); out.oneSide = read(); out.oneN = a.covRows().filter((r) => S.M.famHas(ps[0], r.id)).length;
					pl.slots = f(ps[0]).concat(f(ps[1])); out.both = read(); out.bothN = a.covRows().filter((r) => S.M.famHas(ps[0], r.id) || S.M.famHas(ps[1], r.id)).length;
					out.t = document.getElementById('planTree').innerText; out.dock = document.getElementById('cov').textContent;
					return out;
				});
				assert(pl.empty === null && pl.none === '—/133充足', tag + ' 本育成設計: 6人が空なら出さない・合う親がいなければ —/133', pl);
				assert(pl.oneSide === pl.oneN + '/133充足' && pl.both === pl.bothN + '/133充足' && pl.both !== pl.oneSide, tag + ' 片側だけ合う・両側が合うときの種数', pl);
				await look('05-本育成設計の充足');
				await ev(() => { const a = window.__deckAlpha; a.S.doc.plans.exam = a.K.emptyPlan(); a.renderAll(); });
				await tab('plan');
				// 切り替えの小窓（231）。親の選択は表ごとに覚える
				await page.click('#setBtn'); await page.waitForSelector('.modeline');
				const sw = await ev(() => ({ h: document.getElementById('sheetTitle').innerText, btn: [...document.querySelectorAll('.modeline [data-mode]')].map((b) => b.textContent + ':' + b.getAttribute('aria-pressed')).join(), one: document.querySelectorAll('.rlist .ropt').length, t: document.querySelector('.rlist').innerText, seg: (() => { const b = document.querySelector('.modeline [aria-pressed="true"]'); return getComputedStyle(b).backgroundColor; })() }));
				assert(sw.h === 'セット' && sw.btn === 'UmaStar:false,UmaExam:true' && sw.one === 1 && /技能試験/.test(sw.t) && /親2人/.test(sw.t), tag + ' 切り替えは見出しのボタンの小窓の中・UmaExam のときは「セット」と技能試験の1行', sw);
				const seg = sw.seg.match(/\d+/g).map(Number);
				assert(!(seg[1] > seg[0] + 20 && seg[1] > seg[2] + 20), tag + ' 選択中の切り替えの塗りが緑でない', sw.seg);
				await look('07-切り替え-UmaExam');
				const AB = await ev(() => [window.__deckAlpha.S.A, window.__deckAlpha.S.B]);
				await page.click('.modeline [data-mode="star"]'); await page.waitForTimeout(150);
				const st = await ev(() => { const S = window.__deckAlpha.S; return { h: document.getElementById('sheetTitle').innerText, btn: document.querySelector('.modeline [aria-pressed="true"]').textContent, mode: S.mode, A: S.A, t: document.querySelector('.rlist').innerText, cnt: document.querySelector('.vc .cnt').textContent, rows: S.M.rows.map((s) => s.id), visible: [...document.querySelectorAll('.vh th[data-c]')].length, saved: S.settings.mode }; });
				assert(st.h === 'レース/周回セット' && st.btn === 'UmaStar' && st.mode === 'star' && st.A === null && st.saved === 'star', tag + ' UmaStar に切り替えると小窓はレース/周回セットのまま・親の選択は別', st);
				// 233: 「指定なし」に UmaExam の親を出さない（数・行の母集団とも今のまま）
				assert(st.t.includes('親' + before.n + '人') && st.cnt.includes(before.n + '人') && st.rows.join() === before.rows.join(), tag + ' UmaExam から登録した親は UmaStar 用の「指定なし」に出ない（親の数・行の母集団が登録の前と同じ。233）', { cnt: st.cnt, n: before.n });
				await look('08-切り替え-UmaStar');
				await ev(() => document.getElementById('scrim').click());
				await look('09-表-UmaStar');
				await page.click('#setBtn'); await page.waitForSelector('.modeline');
				await page.click('.modeline [data-mode="exam"]'); await page.waitForTimeout(150);
				const back = await ev(() => { const S = window.__deckAlpha.S; return { A: S.A, B: S.B, open: !document.getElementById('sheet').hidden, cov: document.getElementById('cov').textContent }; });
				assert(back.A === AB[0] && back.B === AB[1] && !back.open && /\/133充足$/.test(back.cov), tag + ' UmaExam に戻すと親の選択が戻る・小窓は閉じる', back);
				// 文に「家系」が無い・横スクロールなし・エラー 0
				const txt = await ev(() => document.body.innerText);
				assert(noFamily(txt), tag + ' 画面の文に「家系」が無い');
				assert(T.wide.length === 0, tag + ' 横スクロールなし（表の中を除く）', T.wide);
				assert(T.errs.length === 0, tag + ' コンソールのエラー 0', T.errs);
			} finally { await T.ctx.close(); }
		});
	}

	/* ---------- (C) 245: レースのセットは親の小窓で選んだときだけ／234: 親Aの「同一」／UmaStar から送るときは今のまま／書き出しと読み込み ---------- */
	await block('T104 Deck α UmaExam ―― レースのセットは親の小窓で選んだときだけ（245）・親Aの「登録済みの〇〇と同一」（234）・UmaStar から送るときは今のまま', async () => {
		const T = await open(1280, 'light'); const { page, ev } = T;
		try {
			await T.seed(10);
			const init = await ev(() => { const S = window.__deckAlpha.S; const used = new Set(S.doc.parents.map((p) => p.uma)); const free = window.DeckAlpha.D.costumes.filter((c) => !used.has(c.id) && c.uniq.length); const race = S.doc.sets.find((s) => s.kind === 'race'); const star = S.doc.parents.find((p) => (p.sets || []).length); return { free: free.slice(0, 3).map((c) => c.id), race: race && race.id, starId: star.id, starUma: star.uma, starSkills: star.skills, starN: S.doc.parents.length, starSets: star.sets.slice(), starGreen: star.green, freeUniq: free[0].uniq[free[0].uniq.length - 1] }; });
			assert(!!init.race, 'レースのセットがある（見本）', init.race);
			// 新規の親
			await T.send({ from: 'exam', send: IDS, persons: [person(init.free[0], starsFrom(0, 30, 2))] });
			await T.openReg();
			const r0 = await ev(() => document.getElementById('body').innerText);
			assert(/親Aだけ/.test(r0), '1人だけのときは「親Aだけ」', r0.slice(0, 40));
			await T.doReg();
			await T.openDeck();
			const raceCnt = (id) => ev((x) => window.__deckAlpha.S.doc.parents.filter((p) => p.sets.includes(x)).length, id);
			const c0 = await raceCnt(init.race);
			const ex = await ev(() => { const S = window.__deckAlpha.S; return S.doc.parents.filter((p) => p.from === 'exam').map((p) => ({ id: p.id, sets: p.sets })); });
			assert(ex.length === 1 && ex[0].sets.join() === 'exam', '登録した直後は技能試験のセットだけ（レースのセットに入らない）', ex);
			// 親の小窓のセットの欄でレースのセットを選ぶ
			await page.click('.vh th[data-c="0"]'); await page.waitForSelector('#sheetIn [data-set]');
			const setBtns = await ev(() => [...document.querySelectorAll('#sheetIn [data-set]')].map((b) => b.dataset.set));
			assert(setBtns.includes(init.race) && !setBtns.includes('exam'), '親の小窓のセットの欄にレースのセットが出る（技能試験は外せない）', setBtns);
			await page.click('#sheetIn [data-set="' + init.race + '"]'); await page.waitForTimeout(150);
			await ev(() => document.getElementById('scrim').click());
			await T.ev((id) => { const a = window.__deckAlpha; a.switchMode('star'); a.S.settings.cur = id; a.renderAll(); }, init.race); await page.waitForTimeout(150);
			const inRace = await ev((pid) => { const a = window.__deckAlpha, S = a.S; return { ids: [...document.querySelectorAll('.vh th[data-c]')].length, cnt: document.querySelector('.vc .cnt').textContent, has: S.doc.parents.find((p) => p.id === pid).sets.slice() }; }, ex[0].id);
			assert(inRace.has.includes(init.race) && (await raceCnt(init.race)) === c0 + 1, '選ぶとレースのセットに入る（245）', inRace);
			await ev(() => { const a = window.__deckAlpha; a.S.settings.cur = 'none'; a.renderAll(); }); await page.waitForTimeout(100);
			const none1 = await ev(() => document.querySelector('.vc .cnt').textContent);
			assert(none1.includes(init.starN + '人'), 'レースのセットに入れても「指定なし」には出ない（233）', none1);
			// 234: UmaStar で登録した親と同じ衣装を UmaExam から送る
			await T.send({ from: 'exam', send: IDS, persons: [person(init.starUma, Object.assign(starsFrom(50, 20, 3), { [Object.keys(init.starSkills)[0]]: -1 }), { blue: ['wit', 2], red: ['long', 1], green: ['x', 3] })] });
			await T.openReg();
			const r1 = await ev(() => ({ btn: document.querySelectorAll('#body [data-link]').length, none: document.querySelectorAll('#body [data-nolink]').length, need: document.getElementById('needTop').textContent, t: document.getElementById('body').innerText }));
			assert(r1.btn >= 1 && r1.none === 1 && /登録済みの/.test(r1.t) && /と同一/.test(r1.t) && /紐づけ/.test(r1.t), 'UmaExam から送るとき親Aにも「登録済みの〇〇と同一」を出す', r1);
			await page.click('#body [data-link="' + init.starId + '"]'); await page.waitForTimeout(100);
			await T.doReg();
			await T.openDeck();
			const m1 = await ev((sid) => { const S = window.__deckAlpha.S; const q = S.doc.parents.find((p) => p.id === sid); return { n: S.doc.parents.length, sets: q.sets, from: q.from || null, skills: q.skills, blue: q.blue, red: q.red, green: q.green, sheet: q.sheet, cnt: document.querySelector('.vc .cnt').textContent, mode: S.mode }; }, init.starId);
			const firstKey = Object.keys(init.starSkills)[0];
			assert(m1.n === init.starN + 1, '新しい親を作らない（親の数は1人目の登録ぶんだけ）', m1.n);
			assert(m1.sets.includes('exam') && init.starSets.every((s) => m1.sets.includes(s)) && m1.from === null && m1.mode === 'exam', 'その親が技能試験の表に入る（UmaStar の印のまま）', m1.sets);
			assert(m1.blue[0] === 'wit' && m1.red[0] === 'long' && m1.green === 3 && m1.skills[IDS[50]] === 3 && m1.sheet['レース因子の見本'] === 2, '読み取りの値で上書きする', m1.blue);
			assert(m1.skills[firstKey] === init.starSkills[firstKey], '★不明で、分かっている★を消さない', { was: init.starSkills[firstKey], now: m1.skills[firstKey] });
			assert(m1.cnt.includes('2人'), '技能試験の表に2人', m1.cnt);
			await T.ev(() => { const a = window.__deckAlpha; a.S.settings.cur = 'none'; a.switchMode('star'); }); await page.waitForTimeout(100);
			const none2 = await ev(() => document.querySelector('.vc .cnt').textContent);
			assert(none2.includes(init.starN + '人'), '「同一」にした UmaStar の親は「指定なし」に出たまま', none2);
			// UmaStar から送るときは今のまま（親Aに候補を出さない・送り先のセットで開く・UmaStar 用の表で開く）
			await T.send({ from: 'star', send: [], persons: [{ uma: init.starUma, green: null, greenCands: null, blue: null, red: null, skills: { [IDS[0]]: 1 }, genes: {} }] });
			await T.openReg();
			const r2 = await ev(() => ({ link: document.querySelectorAll('#body [data-link]').length, set: !!document.getElementById('setPick'), top: document.querySelector('.topline').innerText, style: document.querySelectorAll('[data-style]').length }));
			assert(r2.link === 0 && r2.set && /UmaStar から/.test(r2.top) && r2.style === 4, 'UmaStar から送るときの登録の画面は今のまま（親Aに同一は出ない・セットを選べる・脚質の札）', r2);
			await T.doReg();
			await T.openDeck();
			const s1 = await ev(() => { const S = window.__deckAlpha.S; const p = S.doc.parents[S.doc.parents.length - 1]; return { mode: S.mode, keys: Object.keys(p).sort().join(), n: S.doc.parents.filter((x) => x.from === 'exam').length, doc: document.getElementById('setText').textContent }; });
			assert(s1.mode === 'star' && !/from|sheet/.test(s1.keys) && s1.n === 1, 'UmaStar から登録した親に from・sheet が付かない・UmaStar 用の表で開く', s1);
			// 送られたものが無いときの文
			await T.openReg();
			const none3 = await ev(() => ({ t: document.getElementById('body').innerText, top: document.querySelector('.topline').innerText }));
			assert(/送られた親がありません。UmaStar か UmaExam の OCR の結果から送ってください。/.test(none3.t) && !/から/.test(none3.top.replace('Deck (αテスト)に登録', '')), '受け取るものが無いときの文', none3);
			assert(T.errs.length === 0, 'コンソールのエラー 0', T.errs);
		} finally { await T.ctx.close(); }
	});

	await block('T104 Deck α UmaExam ―― 書き出しと読み込みで doc.exam・sheet が残る（書き出しのファイルは1つ。240）・親がいないときの文', async () => {
		const T = await open(1280, 'light'); const { page, ev } = T;
		try {
			await T.openDeck();
			await ev(async () => { await window.DeckAlpha.store.clear(); await window.DeckAlpha.store.putMeta('settings', Object.assign({}, window.DeckAlpha.DEFAULT_SETTINGS)); });
			await T.openDeck();
			const e0 = await ev(() => document.querySelector('.stage .empty span').textContent);
			assert(e0 === 'まだ親がいません。UmaStar か UmaExam の OCR から送るか、バックアップを読み込んでください。', '親が1人もいないときの文', e0);
			// UmaExam の親だけのとき: UmaStar 用の「指定なし」は空
			const u = await ev(() => window.DeckAlpha.D.costumes.filter((c) => c.uniq.length).slice(0, 3).map((c) => c.id));
			await T.send({ from: 'exam', send: IDS, persons: [person(u[0], starsFrom(0, 40, 2)), person(u[1], starsFrom(40, 20, 1)), person(u[2], starsFrom(60, 20, 1))] });
			await T.openReg(); await T.doReg();
			await T.openDeck('?mode=star');
			const e1 = await ev(() => document.querySelector('.stage .empty span').textContent);
			assert(e1 === 'UmaStar の親はまだいません。UmaStar の OCR から送ってください。', 'UmaExam の親だけのとき、UmaStar 用の表は空の文', e1);
			await T.openDeck();
			const exp = await ev(() => { const a = window.__deckAlpha; const j = a.K.buildExport(a.S.doc); return { text: JSON.stringify(j), name: a.K.exportFileName() }; });
			const j = JSON.parse(exp.text);
			assert(j.tool === 'star' && j.schema === 2 && /^uma-deck-star-\d{8}\.json$/.test(exp.name) && j.exam && j.exam.sends === 1 && Object.keys(j.exam.skills).length === 133, '書き出しは tool:star・schema 2・1つのファイルに doc.exam を含む', { tool: j.tool, name: exp.name });
			assert(j.parents[0].sets.join() === 'exam' && j.parents[0].from === 'exam' && j.parents[0].sheet['レース因子の見本'] === 2 && j.parents[0].gp[0].sheet['レース因子の見本'] === 2, '書き出しの親と祖に sets・from・sheet が残る', j.parents[0].sets);
			// 読み込み（置き換え）→ 開き直す
			const res = await ev(async (text) => { const K = window.DeckAlpha; const r = K.parseImport(text); await K.store.clear(); await K.store.replaceAll(r.doc); return { err: r.error || null, exam: !!r.doc.exam }; }, exp.text);
			assert(!res.err && res.exam, '読み込める', res);
			await T.openDeck();
			const after = await ev(() => { const S = window.__deckAlpha.S; return { mode: S.mode, sends: S.doc.exam && S.doc.exam.sends, cnt: document.querySelector('.vc .cnt').textContent, sheet: S.doc.parents[0].sheet['レース因子の見本'], gp: S.doc.parents[0].gp[0].sheet['レース因子の見本'] }; });
			assert(after.sends === 1 && after.cnt.includes('133種') && after.sheet === 2 && after.gp === 2, '読み込んだあとも133行・sheet が残る', after);
			// 親を消すと、紐づいた祖に sheet も写す
			const rm = await ev(() => { const K = window.DeckAlpha; const a = { id: 'a', uma: 'x', skills: {}, genes: {}, sheet: { s: 1 }, gp: [] }, b = { id: 'b', gp: [{ link: 'a' }] }, c = { id: 'c', gp: [{ link: 'd' }] }, d = { id: 'd', uma: 'y', skills: {}, genes: {}, gp: [] }; const doc = { parents: [a, b, c, d] }; K.removeParent(doc, 'a'); K.removeParent(doc, 'd'); return { b: b.gp[0], c: c.gp[0] }; });
			assert(rm.b.sheet && rm.b.sheet.s === 1 && !('sheet' in rm.c), '親を消して祖に写すときも sheet を残す（無ければ足さない）', rm);
			// 今の保存データと古い書き出しのファイル（exam なし）は今までどおり
			const old = await ev(() => { const K = window.DeckAlpha; const r = K.parseImport(JSON.stringify({ format: 'uma-deck', schema: 2, tool: 'star', parents: [], sets: [], plans: {} })); return { err: r.error || null, exam: 'exam' in r.doc }; });
			assert(!old.err && !old.exam, '古い書き出しのファイルに doc.exam を足さない', old);
			assert(T.errs.length === 0, 'コンソールのエラー 0', T.errs);
		} finally { await T.ctx.close(); }
	});

	/* ---------- (D) 旧ページ ---------- */
	for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
		await block('T104 Deck α UmaExam ―― 旧 UmaSkill Deck のページの先頭に入口と1行（' + w + 'px・' + theme + '）', async () => {
			const tag = w + 'px ' + theme;
			const T = await open(w, theme); const { page, ev, look } = T;
			try {
				await page.goto(base + '/uma-skill-deck.html'); await page.waitForSelector('#deck-stop'); await page.waitForTimeout(250);
				const r = await ev(() => { const box = document.getElementById('deck-stop'), a = box.querySelector('a'), p = box.querySelector('p'), hd = document.querySelector('header'), nav = document.querySelector('nav.grid'); const ar = a.getBoundingClientRect(), pr = p.getBoundingClientRect(); return { href: a.getAttribute('href'), a: a.textContent, p: p.textContent, order: hd.getBoundingClientRect().bottom <= box.getBoundingClientRect().top && box.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top, oneLine: Math.abs((ar.top + ar.bottom) / 2 - (pr.top + pr.bottom) / 2) < 3, sw: document.documentElement.scrollWidth, iw: innerWidth, tabs: nav.querySelectorAll('button').length, h: ar.height }; });
				assert(r.a === 'Deck (αテスト)' && r.p === 'UmaSkill Deck は開発を停止しました。', tag + ' 入口と決めた1行', r);
				assert(r.href === 'deck-alpha.html' && !/[?#]/.test(r.href), tag + ' リンク先に ? と # が無い（恒久ルール32）', r.href);
				assert(r.order && r.oneLine && r.sw <= r.iw && r.tabs === 3, tag + ' 見出しの帯の下・3つのタブの上に横1行・横スクロールなし', r);
				await look('16-旧ページの先頭');
				await page.click('#deck-stop a'); await page.waitForURL('**/deck-alpha.html'); await page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc);
				assert(T.errs.filter((e) => !/tailwind|cdn|lucide|ERR_/i.test(e)).length === 0, tag + ' コンソールのエラー 0', T.errs);
			} finally { await T.ctx.close(); }
		});
	}
}
