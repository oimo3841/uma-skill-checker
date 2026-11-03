// Deck α の方眼紙デザイン（T94・2026-11-04・C-282）の検査。
// run-smoke.mjs の末尾から register104() で呼ばれる（塊の見出しはすべて「T94 Deck α 方眼紙」で始まる。`npm run test:visual -- --only=T94 Deck α 方眼紙` で回せる）。
//
// 決め（T94 の指示と「T94 への連絡」。おいもさん）:
//  - 見本の全体の決まり 1〜5（方眼紙の地・太い黒の横線だけの区切り・黒丸の番号と字間を空けた見出し・四角に×の選択で色は深緑だけ・大きな太字の結果）を全画面に当てる。
//    カード・角丸の枠・影を残さない（角丸は黒丸の番号と、UmaStar と同じ形にした見出しのボタンだけ）。
//  - 表のマスは JS の寸法（縮小 18px・拡大 30px）を変えず、マス自身が 2×2 の目（9px・15px）を持つ。スマホの1画面に入る行数・列数は今より減らない（375px 縮小: 列 14・行 26 以上）。
//  - T94-1: 字体は今のまま（IBM Plex は製品に入れない）。T94-3: ライトの薄い2段を少し濃く。T94-4: ?theme= で開いたときのエラーを直す。
//  - 追加1・追加2・133: 上段の帯は #1b7756、下段の帯は #0e4b2f。ライト・ダークとも同じで、帯の上の文字は白。帯の上の選択中は白の塗り（131 の例外）。
//  - 追加3: UmaStar から送られる ex- の id（拡張スキル）が、登録の画面・表・小窓のどこでも名前で出る（公開データの全 id で確かめる）。
//  - 追加4: ツール切り替えとライト／ダークのボタンは UmaStar・UmaExam と同じ形（34×38px・角丸 12px・svg 16px）。ライト／ダークのアイコンは利用者の選択を示す。
// 色は固定値で測る（実装の側の値を読んで書かない）。スキル名は検査の側に書かない（data/ を Node 側で読む）。
// T94_SHOTS=<フォルダ> を付けて回すと、各場面の画像をそのフォルダに残す。
import fs from 'node:fs';
import path from 'node:path';
import { scanTextContrastInPage } from './lib/contrast.mjs';

export async function register104(env) {
	const { block, assert, browser, base, REPO_ROOT } = env;
	const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
	const SHOTS = process.env.T94_SHOTS || '';
	const EXT = JSON.parse(read('data/extended-skills.json')).entries;
	const EX = EXT.find((e) => e.id === 'ex-0990'); // おいもさんが見た id（拡張スキル）
	const MASTER = JSON.parse(read('uma-skill-deck-skills.json')).skills;
	const SF = JSON.parse(read('data/scenario-inheritance-factors.json')).entries;
	const GENES = JSON.parse(read('data/aptitude-genes.json')).entries;
	const ALL_IDS = MASTER.map((s) => s.id).concat(EXT.map((e) => e.id), SF.map((e) => e.id));
	const BAND_TOP = 'rgb(27, 119, 86)', BAND_BOTTOM = 'rgb(14, 75, 47)', WHITE = 'rgb(255, 255, 255)';
	const S1 = { light: 'rgb(203, 223, 211)', dark: 'rgb(34, 82, 56)' }; // 段1 の塗り（ライト #cbdfd3・ダーク #225238）
	const PAPER = { light: 'rgb(251, 251, 248)', dark: 'rgb(20, 24, 21)' };

	await block('T94 Deck α 方眼紙 ―― 版の3点一致・字体は今のまま・角丸が残っていない・帯の色・ボタンの形（静的）', async () => {
		const css = read('css/deck-alpha.css'), dh = read('deck-alpha.html'), rh = read('deck-alpha-register.html');
		const cssV = (/--deck-alpha-css-version: "([0-9a-z-]+)"/.exec(css) || [])[1];
		const jsV = (/DECK_ALPHA_JS_VERSION = '([0-9a-z-]+)'/.exec(read('js/deck-alpha.js')) || [])[1];
		const dataV = (/DECK_ALPHA_DATA_VERSION = '([0-9a-z-]+)'/.exec(read('js/deck-alpha-data.js')) || [])[1];
		const q = (src, f) => (new RegExp(f.replace(/[.]/g, '\\.') + '\\?v=([0-9a-z-]+)').exec(src) || [])[1];
		assert(cssV && q(dh, 'css/deck-alpha.css') === cssV && q(rh, 'css/deck-alpha.css') === cssV, 'css/deck-alpha.css の版の印と2つの HTML の ?v= が一致', { cssV, deck: q(dh, 'css/deck-alpha.css'), reg: q(rh, 'css/deck-alpha.css') });
		assert(jsV && q(dh, 'js/deck-alpha.js') === jsV, 'js/deck-alpha.js の版の定数と ?v= が一致', { jsV, html: q(dh, 'js/deck-alpha.js') });
		assert(dataV && q(dh, 'js/deck-alpha-data.js') === dataV && q(rh, 'js/deck-alpha-data.js') === dataV, 'js/deck-alpha-data.js の版の定数と2つの HTML の ?v= が一致', { dataV });
		assert(!/IBM Plex|fonts\.googleapis|woff2/.test(css + dh + rh), '製品に IBM Plex の字体を入れていない（T94-1）', null);
		assert(css.includes('#1b7756') && css.includes('#0e4b2f'), '上段 #1b7756・下段 #0e4b2f の帯の色が CSS にある（追加1・追加2）', null);
		const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((v) => v !== '0');
		assert(radii.every((v) => v === '50%' || /uma-r-lg/.test(v)), '角丸は黒丸の番号（50%）と見出しのボタン（UmaStar と同じ）だけ（決まり 2）', radii);
		assert(!/box-shadow:\s*var\(--uma-shadow-[23]\)/.test(css) && !/backdrop-filter/.test(css), '浮かせる影とぼかしを使っていない（決まり 2）', null);
		assert(/id="toolBtn"[^>]*class="hbtn"|class="hbtn" id="toolBtn"/.test(dh) && /class="hbtn" id="themeBtn"/.test(dh) && !/>▦<|>☾<|>☀</.test(dh), 'ツール切り替えとライト／ダークは hbtn（svg）で、文字のアイコン ▦☾☀ が無い（追加4）', null);
		assert(/ext\.entries/.test(read('js/deck-alpha-data.js')), 'データの読み込みが拡張スキル（ex-）も skills に入れる（追加3）', null);
		assert(!!EX && !!EX.name, 'ex-0990 が公開データ（data/extended-skills.json）にある', EX);
	});

	const sizes = { 375: { width: 375, height: 812, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };
	for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
		await block('T94 Deck α 方眼紙 ―― 帯・方眼・ボタン・ex- の名前・?theme=（' + w + 'px・' + (theme === 'light' ? 'ライト' : 'ダーク') + '）', async () => {
			const sz = sizes[w]; const pc = w > 720; const tag = w + '/' + theme; const other = theme === 'light' ? 'dark' : 'light';
			const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: theme });
			// ほかのツールと同じ設定（uma-tools-theme）で色を決める（利用者と同じ道）
			await ctx.addInitScript((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) { /* 使えなければ自動 */ } }, theme);
			const page = await ctx.newPage();
			page.setDefaultTimeout(8000);
			const errs = [];
			page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
			page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
			const ev = (fn, arg) => page.evaluate(fn, arg);
			const wide = [];
			const look = async (name, opt) => {
				await page.waitForTimeout(150);
				const r = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
				if (r.sw > r.iw) wide.push(name + ':' + r.sw + '>' + r.iw);
				if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot(Object.assign({ path: path.join(SHOTS, name + '-' + w + '-' + theme + '.png') }, opt || {})); }
			};
			const ready = () => page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc && (document.querySelector('.vh, canvas.ov, .stage .empty')), null, { timeout: 15000 });
			const closeSheet = async () => { if (await page.isVisible('#sheet')) { await ev(() => document.getElementById('scrim').click()); await page.waitForTimeout(100); } };

			// (1) 仮のデータ（版13 と同じ種の親30人）に、拡張スキル ex-0990 を持つ親を足して開く
			await page.goto(base + '/deck-alpha.html'); await ready();
			await page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
			await ev(async (ex) => { const m = window.__deckAlphaMock.makeMock(30, 11); m.parents[0].skills[ex] = 2; m.parents[1].skills[ex] = 3; m.parents[0].sets = []; m.parents[1].sets = []; await window.DeckAlpha.store.replaceAll(m); }, EX.id);
			await page.reload(); await ready();
			await page.waitForTimeout(2400); // 付け替えのトーストが消えるまで
			assert(errs.length === 0, tag + ' 開いてコンソールのエラーが無い', errs);
			const th = await ev(() => document.documentElement.getAttribute('data-theme'));
			assert(th === theme, tag + ' 設定どおりの色で開く', th);

			// (2) 上段・下段の帯（追加1・追加2・133）: 色は固定値。文字は白
			const bands = await ev(() => {
				const cs = (s) => getComputedStyle(document.querySelector(s));
				return { hd: cs('.hd').backgroundColor, hdText: cs('.hd h1').color, hdSub: cs('.hd h1 .muted').color, dock: cs('.dock').backgroundColor, dockText: cs('.dock .slot').color, cov: cs('#cov').color, miss: cs('#miss').color, slotB: cs('#slotA b').backgroundColor, btn: cs('#recB').color, btnBd: cs('#recB').borderTopColor, btnBg: cs('#recB').backgroundColor };
			});
			assert(bands.hd === BAND_TOP && bands.hdText === WHITE && bands.hdSub === WHITE, tag + ' 上段の帯は #1b7756 で題の文字は白（追加1・133）', bands);
			assert(bands.dock === BAND_BOTTOM && bands.dockText === WHITE && bands.cov === WHITE && bands.slotB === WHITE && bands.btn === WHITE && bands.btnBd === WHITE && /rgba\(0, 0, 0, 0\)|transparent/.test(bands.btnBg), tag + ' 下段の帯は #0e4b2f で文字・線・A/B の四角は白（追加2・133）', bands);
			for (const sel of ['.hd', '.dock']) {
				const c = await ev(scanTextContrastInPage, sel);
				assert(c.checked > 0 && c.bad.length === 0 && c.undecided.length === 0, tag + ' ' + sel + ' の帯の上の文字のコントラストが基準を満たす（決められない文字も無い）', { checked: c.checked, bad: c.bad.slice(0, 5), und: c.undecided.slice(0, 3) });
			}

			// (3) 方眼（決まり 1）と、表のマスが 2×2 の目を持つこと。空のマスは地のまま。角丸・影なし（決まり 2）
			const grid = await ev((s1) => {
				const cs = (el) => getComputedStyle(el);
				const body = cs(document.body), vb = document.getElementById('vb'), td0 = document.querySelector('.vb td.c0:not(.unk)'), td1 = document.querySelector('.vb td.c1:not(.unk)');
				const radius = ['.btn', '.tag', '.seg', '.rsel', '.stage', '.panes', '.top'].map((s) => { const e = document.querySelector(s); return e ? cs(e).borderTopLeftRadius : '0px'; });
				// 本体の入れ物（.vb）はマスの大きさの倍数の位置に置かれる（translate の値が 18 の倍数）
				const tr = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(vb.style.transform) || [];
				return { bodySize: body.backgroundSize, bodyImg: /linear-gradient/.test(body.backgroundImage), vbSize: cs(vb).backgroundSize, vbImg: /linear-gradient/.test(cs(vb).backgroundImage), vbAt: [+tr[1], +tr[2]], td0Bg: td0 ? cs(td0).backgroundColor : null, td0Img: td0 ? cs(td0).backgroundImage : null, td1Bg: td1 ? cs(td1).backgroundColor : null, td1Img: td1 ? cs(td1).backgroundImage : null, radius, want: s1 };
			}, S1[theme]);
			// background-size は縦横の線の2層ぶん並ぶ（"10px 10px, 10px 10px"）
			assert(grid.bodySize === '10px 10px, 10px 10px' && grid.bodyImg, tag + ' ページの地は 10px の方眼（決まり 1）', grid);
			assert(grid.vbSize === '9px 9px, 9px 9px' && grid.vbImg && (grid.vbAt[0] - 100) % 18 === 0 && (grid.vbAt[1] - 76) % 18 === 0 || grid.vbSize === '9px 9px, 9px 9px' && grid.vbImg && (grid.vbAt[0] - 136) % 18 === 0 && (grid.vbAt[1] - 76) % 18 === 0, tag + ' 縮小の表の本体は 2×2 の目（9px）の方眼を持ち、マスの倍数の位置に置かれる', grid);
			assert(/rgba\(0, 0, 0, 0\)|transparent/.test(grid.td0Bg) && grid.td0Img === 'none', tag + ' 空のマスは地のまま（塗りも背景も無い）', grid);
			assert(grid.td1Bg === S1[theme] && grid.td1Img === 'none', tag + ' 段1 のマスは深緑の塗り（T94-3 の値）で目は無い', grid);
			assert(grid.radius.every((r) => r === '0px'), tag + ' ボタン・札・帯・表の角が丸くない（決まり 2）', grid.radius);
			// スマホの1画面に入る行数・列数が今（版13 の見た目: 列 14・行 26）より減らない
			if (!pc) {
				const n = await ev(() => { const st = document.getElementById('stage'), vc = document.getElementById('vc'); return { cols: Math.floor((st.clientWidth - vc.offsetWidth) / 18), rows: Math.floor((st.clientHeight - vc.offsetHeight) / 18), stage: [st.clientWidth, st.clientHeight] }; });
				assert(n.cols >= 14 && n.rows >= 26, tag + ' 縮小で1画面に入る列・行が 14・26 以上（今より減らない）', n);
			}
			await look('01-table');

			// (4) 拡張スキル（ex-）が名前で出る（追加3）: 表の行・スキルの小窓・親の小窓。公開データの全 id が名前を引ける
			// 表は見える範囲だけ描くので、拡張スキルの行まで縦に送ってから見る（行の高さ 18px・見出し 76px・遺伝子の行の数ぶん下）
			const names = await ev((o) => {
				const K = window.DeckAlpha, S = window.__deckAlpha.S; const rows = S.M.rows; const idx = rows.findIndex((s) => s.id === o.id);
				const st = document.getElementById('stage'); const gr = document.querySelectorAll('.vl th[data-gr]').length;
				st.scrollTop = Math.max(0, 76 + (gr + idx) * 18 - 90); st.dispatchEvent(new Event('scroll'));
				return { idx, modelName: idx >= 0 ? rows[idx].name : null, bad: o.ids.filter((id) => K.skill(id).name === id), genes: o.genes.filter((id) => !K.GENES.get(id)) };
			}, { id: EX.id, ids: ALL_IDS, genes: GENES.map((g) => g.id) });
			await page.waitForTimeout(250);
			const ths = await ev((i) => { const t = document.querySelector('.vl th[data-r="' + i + '"]'); return { title: t ? t.title : null, text: t ? t.textContent : null, raw: [...document.querySelectorAll('.vl th[data-r]')].map((x) => x.title).filter((x) => /^ex-\d+$/.test(x)) }; }, names.idx);
			assert(names.idx >= 0 && names.modelName === EX.name && ths.title === EX.name && ths.text === EX.name && ths.raw.length === 0, tag + ' 表の行に拡張スキルが名前で出て、id のままの行が無い（追加3）', { idx: names.idx, modelName: names.modelName, th: ths });
			assert(names.bad.length === 0 && names.genes.length === 0, tag + ' 公開データの全 id（マスター・拡張スキル・シナリオ因子・遺伝子）が名前を引ける', { bad: names.bad.slice(0, 10), genes: names.genes });
			const rowIdx = names.idx;
			await ev((i) => document.querySelector('.vl th[data-r="' + i + '"]').click(), rowIdx); await page.waitForTimeout(150);
			const sk = await ev(() => document.getElementById('sheetTitle').textContent);
			assert(sk.startsWith(EX.name) && !sk.includes('ex-'), tag + ' スキルの小窓の見出しが拡張スキルの名前', sk);
			await look('02-skill-sheet'); await closeSheet();
			await ev(() => document.querySelector('.vh th[data-c="0"]').click()); await page.waitForTimeout(150);
			const ps = await ev(() => ({ text: document.getElementById('sheetIn').innerText, s1: window.__deckAlpha.S.doc.parents.find((p) => p.id === 'p1') }));
			assert(/親Aにする/.test(ps.text) && !/ex-\d+/.test(ps.text), tag + ' 親の小窓に id のままの文字が無い', ps.text.slice(0, 200));
			await look('03-parent-sheet'); await closeSheet();

			// (5) 拡大: マスの目は 15px
			await ev(() => document.querySelector('[data-lv="2"]').click()); await page.waitForTimeout(150);
			const lv2 = await ev(() => getComputedStyle(document.getElementById('vb')).backgroundSize);
			assert(lv2 === '15px 15px, 15px 15px', tag + ' 拡大の表の本体は 2×2 の目（15px）', lv2);
			await look('04-table-lv2');
			await ev(() => document.querySelector('[data-lv="1"]').click());

			// (6) 見出しのボタン（追加4）: 34×38px・角丸 12px・svg 16px。ライト／ダークのアイコンは選択を示し、押すと切り替わる
			const hb = await ev(() => { const g = (id) => { const b = document.getElementById(id), r = b.getBoundingClientRect(), cs = getComputedStyle(b), svgs = [...b.querySelectorAll('svg')].filter((s) => getComputedStyle(s).display !== 'none'); return { w: Math.round(r.width), h: Math.round(r.height), radius: cs.borderTopLeftRadius, bw: cs.borderTopWidth, shown: svgs.length, svg: svgs[0] ? Math.round(svgs[0].getBoundingClientRect().width) : 0, state: b.getAttribute('data-theme-state') }; }; return { tool: g('toolBtn'), theme: g('themeBtn') }; });
			assert(hb.tool.w === 34 && hb.tool.h === 38 && hb.tool.radius === '12px' && hb.tool.bw === '1px' && hb.tool.shown === 1 && hb.tool.svg === 16, tag + ' ツール切り替えのボタンは UmaStar と同じ 34×38px・角丸 12px・svg 16px（追加4）', hb.tool);
			assert(hb.theme.w === 34 && hb.theme.h === 38 && hb.theme.radius === '12px' && hb.theme.shown === 1 && hb.theme.svg === 16 && hb.theme.state === theme, tag + ' ライト／ダークのボタンは同じ形で、今の選択のアイコンを1つだけ出す', hb.theme);
			await look('05-header', { clip: { x: 0, y: 0, width: sz.width, height: 56 } });
			await page.click('#themeBtn'); await page.waitForTimeout(150);
			const t1 = await ev(() => ({ attr: document.documentElement.getAttribute('data-theme'), state: document.getElementById('themeBtn').getAttribute('data-theme-state'), saved: localStorage.getItem('uma-tools-theme'), shown: [...document.querySelectorAll('#themeBtn svg')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.dataset.themeIcon) }));
			assert(t1.attr === other && t1.state === other && t1.saved === other && t1.shown.join() === other, tag + ' 押すと色と設定が切り替わり、アイコンも切り替わる', t1);
			await page.click('#themeBtn'); await page.waitForTimeout(150);

			// (7) ?theme= で開いてもエラーが出ない（T94-4）
			errs.length = 0;
			await page.goto(base + '/deck-alpha.html?theme=' + other); await ready(); await page.waitForTimeout(400);
			const fixed = await ev(() => document.documentElement.getAttribute('data-theme'));
			assert(fixed === other && errs.length === 0, tag + ' ?theme= で開いてもコンソールのエラーが出ない（T94-4）', { fixed, errs });

			// (8) 登録の画面: UmaStar から ex- の id が送られても名前で出る（追加3）
			errs.length = 0;
			await ev((o) => { localStorage.setItem('umaDeck:send', JSON.stringify({ format: 'uma-deck-send', v: 1, sentAt: new Date().toISOString(), from: 'star', race: null, style: null, send: [o.ex, o.m1], owner: 'self', persons: [{ uma: o.uma, green: null, greenCands: null, blue: null, red: null, skills: { [o.ex]: 2, [o.m1]: 3 }, genes: {} }] })); }, { ex: EX.id, m1: MASTER[0].id, uma: JSON.parse(read('data/training-umamusume.json')).entries[0].id });
			await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S.doc, null, { timeout: 15000 }); await page.waitForTimeout(250);
			await page.click('[data-act="toggle-sk"]'); await page.waitForTimeout(150);
			const reg = await ev(() => ({ text: document.body.innerText, bar: getComputedStyle(document.getElementById('regbar')).backgroundColor, card: getComputedStyle(document.querySelector('.card')).borderTopLeftRadius }));
			assert(reg.text.includes(EX.name) && !/ex-\d+/.test(reg.text), tag + ' 登録の画面の白スキルの一覧に拡張スキルが名前で出る（追加3）', reg.text.slice(0, 160));
			assert(reg.bar === PAPER[theme] && reg.card === '0px', tag + ' 登録の画面の下の欄は地の色で、手順の区切りに角丸が無い', { bar: reg.bar, card: reg.card });
			assert(errs.length === 0, tag + ' 登録の画面でコンソールのエラーが無い', errs);
			await look('06-register');
			try { await ev(() => localStorage.removeItem('umaDeck:send')); } catch (e) { /* 消せなくてもよい */ }
			assert(wide.length === 0, tag + ' どの場面も横スクロールが無い', wide);
			await ctx.close();
		});
	}
}
