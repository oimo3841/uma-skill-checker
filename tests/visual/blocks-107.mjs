// Deck α の改善6点（T97・2026-11-04）の検査。
// run-smoke.mjs の末尾から register107() で呼ばれる（塊の見出しはすべて「T97 Deck α 改善」で始まる。`npm run test:visual -- --only=T97 Deck α 改善` で回せる）。
//
// 決め（T97 の指示。おいもさん）:
//  - 140（依頼1）: UmaStar から「指定なし」で登録したとき、②のスキルの一覧も「指定なし」に入れる（レースのセットと同じく前の一覧と OR・前回までの分は「前回までの一覧」の印）。
//    「指定なし」の表の行は、送った一覧があればその一覧。一度も送っていなければ今までどおり親が持つスキル全部。書き出し・読み込みで戻る。
//  - 141（依頼2）: 「指定なし」で遺伝子の行を出すとき、距離・脚質・バ場の3行を出し、行の名前もマスも薄くする。マスは空。
//  - 142（依頼3）: 表の上の2本指で段階を切り替えない。ブラウザ標準の拡大・縮小が効く。段階は「表示」のボタンだけで変える。
//  - 依頼4: 下段の帯の高さを今の 2/3 程度に（親A・親Bのボタンは指で押せる大きさを保ち、文字が切れない）。
//  - 143（依頼5）: スマホで5つの引き出しのどれかが開いているとき、外を押すと閉じるだけ（そのタップで表のマスや小窓は反応しない）。PC は今のまま。
//  - 144（依頼6）: スマホだけ方眼を濃くする（PC は今のまま）。文字と地のコントラストは 4.5 以上（方眼の線の上の補足の文字も）。
// 色・寸法は固定値で測る（変える前の commit d694649 の実測を書いた。実装の側の値を読んで書かない）。スキル名は検査の側に書かない。
// T97_SHOTS=<フォルダ> を付けて回すと、各場面の画像をそのフォルダに残す。
import fs from 'node:fs';
import path from 'node:path';

export async function register107(env) {
	const { block, assert, browser, base, REPO_ROOT } = env;
	const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
	const SHOTS = process.env.T97_SHOTS || '';
	const UMA0 = JSON.parse(read('data/training-umamusume.json')).entries[0].id;
	// 変える前（d694649）の下段の帯の高さ（px。未選択／親A・親Bを選んだとき。仮のデータ30人・指定なし）
	const DOCK_BEFORE = { 375: { none: 124.8, ab: 192.8 }, 1280: { none: 56, ab: 94.8 } };
	// 方眼の線の色（変える前 ライト #e6e9e4・ダーク #232a25。スマホだけ濃く: ライト #cfd5d0・ダーク #363f39）
	// T101（194）で、スマホの線を T97 の前の色（PC と同じ）に戻した。方眼は T101 から表の入れ物（.vs）に持つ
	const GRID = { pc: { light: 'rgb(230, 233, 228)', dark: 'rgb(35, 42, 37)' }, sp: { light: 'rgb(230, 233, 228)', dark: 'rgb(35, 42, 37)' } };
	// 無効の遺伝子の行（141）の名前とマスの色
	const OFF = { light: { tx: 'rgb(163, 170, 165)', bg: 'rgb(238, 240, 236)' }, dark: { tx: 'rgb(91, 100, 94)', bg: 'rgb(28, 33, 29)' } };

	await block('T97 Deck α 改善 ―― 版の3点一致・2本指と ctrl+ホイールの段階の切り替えが無い・ピンチを許す（静的）', async () => {
		const css = read('css/deck-alpha.css'), dh = read('deck-alpha.html'), rh = read('deck-alpha-register.html');
		const js = read('js/deck-alpha.js');
		const v = (f, re) => (re.exec(read(f)) || [])[1];
		const q = (src, f) => (new RegExp(f.replace(/[.]/g, '\\.') + '\\?v=([0-9a-z-]+)').exec(src) || [])[1];
		const cssV = (/--deck-alpha-css-version: "([0-9a-z-]+)"/.exec(css) || [])[1];
		const jsV = v('js/deck-alpha.js', /DECK_ALPHA_JS_VERSION = '([0-9a-z-]+)'/), coreV = v('js/deck-alpha-core.js', /DECK_ALPHA_CORE_VERSION = '([0-9a-z-]+)'/), regV = v('js/deck-alpha-register.js', /DECK_ALPHA_REGISTER_JS_VERSION = '([0-9a-z-]+)'/);
		assert(cssV && q(dh, 'css/deck-alpha.css') === cssV && q(rh, 'css/deck-alpha.css') === cssV, 'css/deck-alpha.css の版と ?v= が一致', { cssV });
		assert(jsV && q(dh, 'js/deck-alpha.js') === jsV, 'js/deck-alpha.js の版と ?v= が一致', { jsV });
		assert(coreV && q(dh, 'js/deck-alpha-core.js') === coreV && q(rh, 'js/deck-alpha-core.js') === coreV, 'js/deck-alpha-core.js の版と2つの HTML の ?v= が一致', { coreV });
		assert(regV && q(rh, 'js/deck-alpha-register.js') === regV, 'js/deck-alpha-register.js の版と ?v= が一致', { regV });
		assert(!/\bpinch\b/.test(js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')) && !/ctrlKey/.test(js), '表の上の2本指・ctrl+ホイールで段階を切り替える処理が無い（142）', null);
		assert(/\.stage \{[^}]*touch-action: pan-x pan-y pinch-zoom/.test(css), '表（.stage）の touch-action がピンチの拡大・縮小を許す（142）', null);
		assert(!/user-scalable\s*=\s*no|maximum-scale/.test(dh), 'viewport がページの拡大を止めていない', null);
	});

	const sizes = { 375: { width: 375, height: 812, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };
	for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
		await block('T97 Deck α 改善 ―― 指定なしの一覧・遺伝子の無効の行・帯の高さ・外のタップ・方眼・ピンチ（' + w + 'px・' + (theme === 'light' ? 'ライト' : 'ダーク') + '）', async () => {
			const sz = sizes[w]; const pc = w > 720; const tag = w + '/' + theme;
			const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: theme });
			await ctx.addInitScript((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) { /* 自動 */ } }, theme);
			const page = await ctx.newPage();
			page.setDefaultTimeout(8000);
			const errs = [];
			page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
			page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
			const ev = (fn, arg) => page.evaluate(fn, arg);
			const wide = [];
			const look = async (name) => {
				await page.waitForTimeout(150);
				const r = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
				if (r.sw > r.iw) wide.push(name + ':' + r.sw + '>' + r.iw);
				if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '-' + w + '-' + theme + '.png') }); }
			};
			const ready = () => page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc && (document.querySelector('.vh, canvas.ov, .stage .empty')), null, { timeout: 15000 });
			const closeSheet = async () => { if (await page.isVisible('#sheet')) { await ev(() => document.getElementById('scrim').click()); await page.waitForTimeout(100); } };
			const cnt = () => ev(() => { const t = document.querySelector('.vc .cnt'); return t ? +((/(\d+)種/.exec(t.textContent) || [])[1]) : -1; });
			const send = (o) => ev((x) => localStorage.setItem('umaDeck:send', JSON.stringify({ format: 'uma-deck-send', v: 1, sentAt: new Date().toISOString(), from: 'star', race: null, style: null, send: x.send, owner: 'self', persons: [{ uma: x.uma, green: null, greenCands: null, blue: null, red: null, skills: x.skills, genes: {} }] })), o);
			const register = async () => {
				await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S.doc, null, { timeout: 15000 }); await page.waitForTimeout(150);
				const txt = await ev(() => document.getElementById('body').innerText);
				await page.click('#regBtn'); await page.waitForFunction(() => window.__deckAlphaRegister.S.done, null, { timeout: 8000 });
				return txt;
			};

			// (1) 仮のデータ（親30人・「指定なし」の一覧は無い＝今の保存データの形）。「指定なし」の行は親が持つスキル全部（今までどおり）
			await page.goto(base + '/deck-alpha.html'); await ready();
			await page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
			await ev(async () => { const m = window.__deckAlphaMock.makeMock(30, 11); delete m.none; await window.DeckAlpha.store.replaceAll(m); await window.DeckAlpha.store.putMeta('settings', Object.assign({}, window.DeckAlpha.DEFAULT_SETTINGS)); });
			await page.reload(); await ready(); await page.waitForTimeout(2400);
			const c0 = await ev(() => ({ none: window.__deckAlpha.S.doc.none || null, all: window.__deckAlpha.S.M.rows.map((s) => s.id), cur: window.__deckAlpha.S.settings.cur }));
			const n0 = await cnt();
			assert(c0.none === null && c0.cur === 'none' && n0 === c0.all.length && n0 > 20, tag + ' 一度も送っていないときの「指定なし」の行は、親が持つスキル全部（今までどおり）', { n0, all: c0.all.length });

			// (2) 遺伝子の行（141）: 「指定なし」では 距離・脚質・バ場 の3行が無効の形（名前もマスも薄く・マスは空）
			const gene = await ev(() => {
				const ls = [...document.querySelectorAll('.vl th.gl')]; const tds = [...document.querySelectorAll('.vb td[data-g]')];
				const cs = (e) => getComputedStyle(e);
				const normal = document.querySelector('.vl th[data-r]');
				return { labels: ls.map((t) => t.textContent), off: ls.map((t) => t.classList.contains('off')), color: ls[0] ? cs(ls[0]).color : null, mx: [...document.querySelectorAll('.vl th.mx.off')].map((t) => t.textContent), mxBg: document.querySelector('.vl th.mx.off') ? cs(document.querySelector('.vl th.mx.off')).backgroundColor : null,
					tdText: tds.map((t) => t.textContent).join(''), tdOff: tds.every((t) => t.classList.contains('off')), tdBg: tds[0] ? cs(tds[0]).backgroundColor : null, n: tds.length, normal: normal ? cs(normal).color : null };
			});
			assert(gene.labels.length === 3 && gene.labels.join('|') === '遺·距離|遺·脚質|遺·バ場' && gene.off.every(Boolean), tag + ' 「指定なし」で遺伝子の行が 距離・脚質・バ場 の3行出る（141）', gene.labels);
			assert(gene.color === OFF[theme].tx && gene.color !== gene.normal && gene.mxBg === OFF[theme].bg && gene.tdBg === OFF[theme].bg && gene.tdOff && gene.n > 0, tag + ' 3行は名前もマスも薄い（ほかの行と見分けられる）', gene);
			assert(gene.tdText === '' && gene.mx.join('') === '', tag + ' 3行のマスと「最大」は空（数字を出さない）', { td: gene.tdText.slice(0, 20), mx: gene.mx });
			// 無効の行のマスを押しても何も出ない
			if (pc) { await page.click('.vb td.off'); await page.waitForTimeout(100); const tv = await ev(() => document.getElementById('toast').hidden); assert(tv, tag + ' 無効の行のマスを押しても知らせが出ない', tv); }
			await look('01-none-gene');

			// (3) 「指定なし」で登録（140）: ②の一覧（5種）が「指定なし」の一覧になり、表の行がその一覧になる
			const L1 = c0.all.slice(0, 5), L2 = c0.all.slice(3, 9); // 2回目は 2種が重なり 4種が新しい
			await send({ send: L1, uma: UMA0, skills: { [L1[0]]: 2 } });
			const regText = await register();
			assert(/②の5種/.test(regText), tag + ' 登録の画面で「指定なし」でも「②の5種」を出す', regText.slice(0, 200));
			await page.goto(base + '/deck-alpha.html'); await ready(); await page.waitForTimeout(200);
			const s1 = await ev(() => { const S = window.__deckAlpha.S; return { none: S.doc.none, cur: S.settings.cur, rows: [...document.querySelectorAll('.vl th[data-r]')].map((t) => t.title), listRow: document.getElementById('sf-listRow').hidden }; });
			const names = await ev((ids) => ids.map((id) => window.DeckAlpha.skill(id).name), L1);
			assert(s1.cur === 'none' && s1.none && s1.none.sends === 1 && Object.keys(s1.none.skills).sort().join() === L1.slice().sort().join(), tag + ' 「指定なし」の一覧として②の5種を保存（送りの回 1）', s1.none);
			assert((await cnt()) === 5 && s1.rows.slice().sort().join() === names.slice().sort().join() && s1.listRow, tag + ' 「指定なし」の表の行が送った一覧の5種になる（1回目は「一覧」の絞り込みは出ない）', { rows: s1.rows, cnt: await cnt() });
			await look('02-none-list');

			// (4) 2回目の送り: 前の一覧と OR（9種）。前回までにだけある3種に「前回までの一覧」の印。「一覧」の絞り込みが効く
			await send({ send: L2, uma: UMA0, skills: {} });
			const regText2 = await register();
			assert(/②の6種/.test(regText2) && /前の一覧 5種に足す/.test(regText2), tag + ' 2回目の登録の画面で「前の一覧 5種に足す」', regText2.slice(0, 200));
			await page.goto(base + '/deck-alpha.html'); await ready(); await page.waitForTimeout(200);
			const s2 = await ev(() => { const S = window.__deckAlpha.S; return { sends: S.doc.none.sends, n: Object.keys(S.doc.none.skills).length, old: [...document.querySelectorAll('.vl th.old')].length, listRow: document.getElementById('sf-listRow').hidden }; });
			assert(s2.sends === 2 && s2.n === 9 && (await cnt()) === 9 && s2.old === 3 && !s2.listRow, tag + ' 2回目は前の一覧と OR（9種）・前回までにだけある3種に印・「一覧」の絞り込みが出る', s2);
			await ev(() => [...document.querySelectorAll('#sf-list button')].find((b) => b.textContent === '最新の一覧').click()); await page.waitForTimeout(100);
			const nNew = await cnt();
			await ev(() => [...document.querySelectorAll('#sf-list button')].find((b) => b.textContent === '前回までだけ').click()); await page.waitForTimeout(100);
			const nOld = await cnt();
			await ev(() => [...document.querySelectorAll('#sf-list button')].find((b) => b.textContent === '全部').click()); await page.waitForTimeout(100);
			assert(nNew === 6 && nOld === 3, tag + ' 「一覧」の絞り込み（最新の一覧 6種・前回までだけ 3種）', { nNew, nOld });
			await look('03-none-list-2');

			// (5) 書き出し・読み込み: 「指定なし」の一覧も戻る。今の形（一覧なし）のファイルも読める
			const io = await ev(async () => {
				const K = window.DeckAlpha, S = window.__deckAlpha.S;
				const text = JSON.stringify(K.buildExport(S.doc)); const r = K.parseImport(text);
				const j = JSON.parse(text); delete j.none; const r0 = K.parseImport(JSON.stringify(j));
				await K.store.replaceAll(r.doc);
				return { has: 'none' in JSON.parse(text), same: JSON.stringify(r.doc.none) === JSON.stringify(S.doc.none), old: !r0.error && !r0.doc.none && r0.doc.parents.length === S.doc.parents.length };
			});
			await page.reload(); await ready(); await page.waitForTimeout(200);
			assert(io.has && io.same && io.old && (await cnt()) === 9, tag + ' 書き出し・読み込みで「指定なし」の一覧が戻る・一覧の無いファイルも読める', io);

			// (6) レースのセットを選んだときの遺伝子の行は今までどおり（無効の行が無い）
			await page.click('#setBtn'); await page.check('input[value="r:race-0002"]'); await page.waitForTimeout(150);
			const rg = await ev(() => ({ gl: [...document.querySelectorAll('.vl th.gl')].map((t) => t.textContent), off: document.querySelectorAll('.vl th.gl.off, .vb td.off').length, nums: [...document.querySelectorAll('.vb td[data-g]')].some((t) => t.textContent.trim()) }));
			assert(rg.gl.length >= 2 && rg.off === 0 && rg.nums, tag + ' レースのセットの遺伝子の行は今までどおり（無効の行は無く、★が出る）', rg);
			await page.click('#setBtn'); await page.check('input[value="none"]'); await page.waitForTimeout(150);

			// (7) 下段の帯（依頼4）: 今の 2/3 程度（0.75 倍以下）。親A・親Bのボタンは押せる大きさで、文字が切れない
			const dock = () => ev(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const dk = document.getElementById('dock').getBoundingClientRect(); const cv = document.getElementById('cov').getBoundingClientRect();
				const cut = [...document.querySelectorAll('#dock button')].filter((e) => !e.hidden && e.offsetParent && (e.scrollHeight > e.clientHeight + 1)).map((e) => e.id || e.className);
				if (cv.top < dk.top || cv.bottom > dk.bottom) cut.push('cov'); /* 充足の数は帯の中に収まる */ const sa = r('#slotA'), sb = r('#slotB'); return { h: Math.round(r('#dock').height * 10) / 10, slotA: [Math.round(sa.width), Math.round(sa.height)], slotB: [Math.round(sb.width), Math.round(sb.height)], cut, recB: [document.getElementById('recB').scrollWidth, document.getElementById('recB').clientWidth] }; });
			const d0 = await dock();
			await ev(() => document.querySelector('.vh th[data-c="0"]').click()); await page.click('#sheetIn [data-pick="A"]');
			await ev(() => document.querySelector('.vh th[data-c="1"]').click()); await page.click('#sheetIn [data-pick="B"]'); await page.waitForTimeout(150);
			const d1 = await dock();
			const minH = pc ? 34 : 36;
			assert(d0.h <= DOCK_BEFORE[w].none * 0.75 && d1.h <= DOCK_BEFORE[w].ab * 0.75 && d1.h >= DOCK_BEFORE[w].ab * 0.5, tag + ' 下段の帯の高さが今の 2/3 程度（未選択 ' + DOCK_BEFORE[w].none + '→' + d0.h + '・親A/B ' + DOCK_BEFORE[w].ab + '→' + d1.h + '）', { d0, d1 });
			assert(d1.slotA[1] >= minH && d1.slotB[1] >= minH && d1.slotA[0] >= 100 && d0.cut.length === 0 && d1.cut.length === 0 && d1.recB[0] <= d1.recB[1], tag + ' 親A・親Bのボタンは ' + minH + 'px 以上で、帯の中の文字が切れない', { d0, d1 });
			await look('04-dock');

			// (8) 方眼（144 → T101 の 194 で T97 の前の色に戻した）: スマホも PC と同じ線。線の上の文字も 4.5 以上
			const grid = await ev(() => { const m = /rgb\(\d+, \d+, \d+\)/.exec(getComputedStyle(document.body).backgroundImage); const vb = /rgb\(\d+, \d+, \d+\)/.exec(getComputedStyle(document.getElementById('vb').parentElement).backgroundImage); return { body: m && m[0], vb: vb && vb[0] }; });
			const want = (pc ? GRID.pc : GRID.sp)[theme];
			assert(grid.body === want && grid.vb === want, tag + ' 方眼の線の色（T97 の前の色。スマホも PC と同じ）', { grid, want });
			if (!pc) await page.click('[data-tab="view"]');
			const cr = await ev((gridColor) => {
				const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
				const lum = (c) => rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
				const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
				const paper = getComputedStyle(document.body).backgroundColor;
				// 方眼の上に直に置かれた文字（地の色を持たない祖先だけを通る要素）
				const onGrid = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const bg = getComputedStyle(p).backgroundColor; if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return p.id === 'vb' || p.classList.contains('vs') ? true : false; } return true; };
				const els = [...document.querySelectorAll('#panes *, .vb td')].filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest(':disabled') && onGrid(e));
				const bad = []; const colors = new Set();
				els.forEach((e) => { const c = getComputedStyle(e).color; colors.add(c); const r = Math.min(ratio(c, paper), ratio(c, gridColor)); if (r < 4.5) bad.push([e.className || e.tagName, e.textContent.trim().slice(0, 10), c, r.toFixed(2)]); });
				return { n: els.length, colors: [...colors], bad: bad.slice(0, 8) };
			}, want);
			assert(cr.n > 0 && cr.bad.length === 0, tag + ' 方眼の上の文字は地と線のどちらに対しても 4.5 以上', cr);
			await look('05-grid');
			if (!pc) await page.click('[data-tab="view"]');

			// (9) 外のタップ（143）: スマホで5つの引き出しそれぞれ、外を押すと閉じるだけ（表のマス・列の見出し・小窓は反応しない）
			if (!pc) {
				for (const k of ['parent', 'skill', 'view', 'sort', 'plan']) {
					await page.tap('[data-tab="' + k + '"]'); await page.waitForTimeout(80);
					const open = await ev(() => window.__deckAlpha.S.pane);
					// 引き出しの中を押しても閉じない
					await page.tap(k === 'plan' ? '#planSum' : '#panes', k === 'plan' ? {} : { position: { x: 3, y: 3 } }); await page.waitForTimeout(80);
					// ↑ 本育成設計は枠のボタンが端まであるので、文の行を押す（タッチの寄せでボタンに当たらないように）
					const still = await ev(() => window.__deckAlpha.S.pane);
					const target = k === 'parent' || k === 'view' ? '.vb td[data-r]' : k === 'skill' ? '.vl th[data-r]' : k === 'sort' ? '.vh th[data-c]' : '#slotA';
					await page.tap(target); await page.waitForTimeout(120);
					const after = await ev(() => ({ pane: window.__deckAlpha.S.pane, sheet: !document.getElementById('sheet').hidden, toast: !document.getElementById('toast').hidden, panes: document.getElementById('panes').hidden }));
					assert(open === k && still === k && after.pane === null && after.panes && !after.sheet && !after.toast, tag + ' 「' + k + '」の引き出し: 中を押しても閉じず、外（' + target + '）を押すと閉じるだけ', { open, still, after });
				}
				// タブのボタンの動き（開く・切り替える・閉じる）は今のまま
				await page.tap('[data-tab="parent"]'); await page.tap('[data-tab="skill"]'); const sw = await ev(() => window.__deckAlpha.S.pane);
				await page.tap('[data-tab="skill"]'); const cl = await ev(() => window.__deckAlpha.S.pane);
				assert(sw === 'skill' && cl === null, tag + ' タブを押すと切り替わり、同じタブで閉じる（今のまま）', { sw, cl });
				// 開いたまま表をスワイプしても閉じない
				await page.tap('[data-tab="view"]');
				const cdp = await ctx.newCDPSession(page);
				const st = await ev(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x + r.width * 0.6, y: r.y + r.height * 0.6 }; });
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st.x, y: st.y }] });
				for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: st.x - 25 * i, y: st.y }] }); await page.waitForTimeout(12); }
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(200);
				const sc = await ev(() => ({ pane: window.__deckAlpha.S.pane, left: document.getElementById('stage').scrollLeft }));
				assert(sc.pane === 'view' && sc.left > 0, tag + ' 引き出しを開いたまま表をスワイプしても閉じない（表は動く）', sc);
				await page.tap('[data-tab="view"]');

				// (10) ピンチ（142）: 2本指を広げても段階は変わらず、2本指の touchmove を止めない（＝ブラウザの拡大に任せる）。
				// 表のマスから html までの touch-action がどれもピンチを許す（headless の Chromium は合成のピンチでページを拡大しないので、拡大を止める2つの道を見る）
				await ev(() => { const s = document.getElementById('stage'); s.scrollTop = 0; s.scrollLeft = 0; window.__t97tm = []; window.addEventListener('touchmove', (e) => { window.__t97tm.push([e.touches.length, e.defaultPrevented]); }); });
				const lv0 = await ev(() => window.__deckAlpha.S.lv);
				const p0 = await ev(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: Math.round(r.x + r.width * 0.6), y: Math.round(r.y + r.height * 0.5) }; });
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x - 20, y: p0.y, id: 1 }, { x: p0.x + 20, y: p0.y, id: 2 }] });
				for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p0.x - 20 - 12 * i, y: p0.y, id: 1 }, { x: p0.x + 20 + 12 * i, y: p0.y, id: 2 }] }); await page.waitForTimeout(12); }
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(200);
				const pz = await ev(() => { const td = document.querySelector('.vb td[data-r]'); const ta = []; for (let e = td; e; e = e.parentElement) ta.push(getComputedStyle(e).touchAction); return { lv: window.__deckAlpha.S.lv, tm: window.__t97tm, ta, stage: getComputedStyle(document.getElementById('stage')).touchAction }; });
				const two = pz.tm.filter((x) => x[0] === 2);
				assert(lv0 === 1 && pz.lv === 1, tag + ' 表の上で2本指を広げても段階が変わらない（142）', { lv0, lv: pz.lv });
				assert(two.length > 0 && two.every((x) => !x[1]), tag + ' 2本指の touchmove を止めない（ブラウザの拡大に任せる）', two.slice(0, 4));
				assert(/^(manipulation|pan-x pan-y pinch-zoom)$/.test(pz.stage) && pz.ta.every((t) => t === 'auto' || t === 'manipulation' || /pinch-zoom/.test(t)), tag + ' 表のマスから html までの touch-action がピンチを許す', pz.ta);
			} else {
				// PC: 外のタップの処理は効かない（左の列は常に出ている）。表のマスを押すと今までどおり知らせが出る。ctrl+ホイールで段階は変わらない
				await page.click('.vb td[data-r]'); await page.waitForTimeout(100);
				const t = await ev(() => !document.getElementById('toast').hidden);
				assert(t, tag + ' PC は表のマスを押すと今までどおり知らせが出る', t);
				const b = await ev(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
				await page.mouse.move(b.x, b.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.waitForTimeout(500); await page.keyboard.up('Control');
				const lv = await ev(() => window.__deckAlpha.S.lv);
				assert(lv === 1, tag + ' PC で ctrl+ホイールでも段階は変わらない（段階は「表示」のボタンだけ）', lv);
			}
			await closeSheet();
			assert(errs.length === 0, tag + ' コンソールのエラーが無い', errs);
			assert(wide.length === 0, tag + ' どの場面も横スクロールが無い', wide);
			try { await ev(() => localStorage.removeItem('umaDeck:send')); } catch (e) { /* 消せなくてもよい */ }
			await ctx.close();
		});
	}
}
