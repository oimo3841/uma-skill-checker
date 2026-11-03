// 新しい Deck の α版（deck-alpha.html・deck-alpha-register.html。T88・2026-11-02・C-275）の検査。
// run-smoke.mjs の末尾から register99() で呼ばれる（塊の見出しはすべて「T88 Deck α」で始まる。`npm run test:visual -- --only=T88 Deck α` で回せる）。
//
// 決め（C-275・2026-11-02 おいもさん）:
//  2. モック版13（lab/deck-v13/）の見た目と動きをそのまま製品に移す。 3. 保存は IndexedDB の uma-deck。親を保存したときに navigator.storage.persist() を1回。
//     書き出し・読み込み（JSON）と「未書き出し」「書き出し N日前」の札。 4.「⋯」の中のバックアップの近くに「ホーム画面に追加」の案内（よく使う人向け・データが分かれること・移し方）。
//  5. 版13 の「⋯」の仮のデータ・レースの終了をまねる・登録の画面を試すは入れない（確認はこの検査の中で。仮のデータは tests/visual/deck-alpha-mock.js）。
//  6. 文の直し（「と先代が持たない」「2組（6人）を選ぶ」「先代を含む★の合計のうち最大。押すと大きい順」）。画面に「家系」を残さない（C-276）。
//  7・8. 縮小の列の名前は衣装ごとの略称（data/deck-alpha/uma-abbrev.json。5文字まで。無い衣装はキャラ名の頭5文字）。拡大は今のまま（キャラ名）。
// 守る線: 製品の既存のファイルは変えない（新しいファイルだけ）・新しいページはどこからもリンクしない。
// 日常の流れ（登録 → セットを選んで見比べる → 本育成設計で絞る → 2組を選ぶ → 書き出す・読み込む）を 375px（タッチ）と 1280px、ライトとダークで通す。
// 横スクロールなし・コンソールのエラー 0 を各場面で見る。DECK_ALPHA_SHOTS=<フォルダ> を付けて回すと、各場面の画像をそのフォルダに残す（報告用）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function register99(env) {
	const { block, assert, browser, base, REPO_ROOT } = env;
	const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
	const SHOTS = process.env.DECK_ALPHA_SHOTS || '';
	const abbrevDoc = JSON.parse(read('data/deck-alpha/uma-abbrev.json'));
	const ABBR = new Map(abbrevDoc.entries.map((e) => [e.id, e.abbr]));
	const UMAS = JSON.parse(read('data/training-umamusume.json')).entries;
	const UMA = new Map(UMAS.map((u) => [u.id, u]));
	const shortOf = (id) => ABBR.get(id) || Array.from(UMA.get(id).charaName).slice(0, 5).join('');
	const NEW_FILES = ['deck-alpha.html', 'deck-alpha-register.html', 'js/deck-alpha-data.js', 'js/deck-alpha-core.js', 'js/deck-alpha.js', 'js/deck-alpha-register.js', 'css/deck-alpha.css', 'data/deck-alpha/uma-abbrev.json'];

	await block('T88 Deck α ―― 版の一致・略称のデータ・どこからもリンクしない・「家系」が無い', async () => {
		// 版: HTML の ?v= と各 JS の定数・CSS の印が同じ（恒久ルール4 の3点一致を、このページの分だけここで見る）
		const ver = (p, re) => { const m = re.exec(read(p)); return m ? m[1] : null; };
		const v = {
			data: ver('js/deck-alpha-data.js', /DECK_ALPHA_DATA_VERSION = '([^']+)'/),
			core: ver('js/deck-alpha-core.js', /DECK_ALPHA_CORE_VERSION = '([^']+)'/),
			deck: ver('js/deck-alpha.js', /DECK_ALPHA_JS_VERSION = '([^']+)'/),
			reg: ver('js/deck-alpha-register.js', /DECK_ALPHA_REGISTER_JS_VERSION = '([^']+)'/),
			css: ver('css/deck-alpha.css', /--deck-alpha-css-version:\s*"([^"]+)"/),
		};
		const tokensVer = ver('css/tokens.css', /--common-css-version:\s*"([^"]+)"/);
		for (const [page, js] of [['deck-alpha.html', 'deck'], ['deck-alpha-register.html', 'reg']]) {
			const src = read(page);
			const q = (name) => [...src.matchAll(new RegExp(name.replace(/[.]/g, '\\.') + '\\?v=([0-9a-z-]+)', 'g'))].map((m) => m[1]);
			assert(JSON.stringify(q('js/deck-alpha-data.js')) === JSON.stringify([v.data]), page + ' の deck-alpha-data.js の ?v= が定数と一致', { q: q('js/deck-alpha-data.js'), v: v.data });
			assert(JSON.stringify(q('js/deck-alpha-core.js')) === JSON.stringify([v.core]), page + ' の deck-alpha-core.js の ?v= が定数と一致', { q: q('js/deck-alpha-core.js'), v: v.core });
			const own = js === 'deck' ? 'js/deck-alpha.js' : 'js/deck-alpha-register.js';
			assert(JSON.stringify(q(own)) === JSON.stringify([v[js]]), page + ' の ' + own + ' の ?v= が定数と一致', { q: q(own), v: v[js] });
			assert(JSON.stringify(q('css/deck-alpha.css')) === JSON.stringify([v.css]), page + ' の deck-alpha.css の ?v= が印と一致', { q: q('css/deck-alpha.css'), v: v.css });
			assert(JSON.stringify(q('css/tokens.css')) === JSON.stringify([tokensVer]), page + ' の tokens.css の ?v= が今の共通 CSS の版（' + tokensVer + '）', q('css/tokens.css'));
		}
		// 略称のデータ: 全衣装にあり・5文字以内・重なりなし（無い衣装はページがキャラ名の頭5文字を出す）
		const missing = UMAS.filter((u) => !ABBR.has(u.id)).map((u) => u.id);
		const long = abbrevDoc.entries.filter((e) => Array.from(e.abbr).length > 5);
		const seen = new Map(); const dup = [];
		abbrevDoc.entries.forEach((e) => { if (seen.has(e.abbr)) dup.push(e.abbr); seen.set(e.abbr, e.id); });
		const stray = abbrevDoc.entries.filter((e) => !UMA.has(e.id)).map((e) => e.id);
		assert(missing.length === 0 && long.length === 0 && dup.length === 0 && stray.length === 0, '略称のデータ（' + abbrevDoc.entries.length + '件）: 全衣装にあり・5文字以内・重なりなし・知らない衣装なし', { missing, long, dup, stray });
		// 入口は段4 の 4-2（T92）で UmaStar（special.html）にだけ足した。ほかの既存のページと JS は deck-alpha を指さない
		const scan = ['index.html', 'special.html', 'exam.html', 'uma-skill-deck.html', 'card-event-input.html'].concat(fs.readdirSync(path.join(REPO_ROOT, 'js')).filter((f) => f.endsWith('.js') && !f.startsWith('deck-alpha')).map((f) => 'js/' + f));
		const linked = scan.filter((p) => /deck-alpha/.test(read(p)));
		assert(linked.join() === 'special.html', '既存のページと JS で deck-alpha を指すのは UmaStar（special.html）だけ（T92 の入口）', linked);
		// 画面に出る文字列（JS の文字列と HTML の本文）に「家系」が無い（コメントも含めて0）
		const kakei = NEW_FILES.filter((p) => read(p).includes('家系'));
		assert(kakei.length === 0, '新しいファイルに「家系」の語が無い（C-276）', kakei);
	});

	const sizes = { 375: { width: 375, height: 812, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };
	for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
		await block('T88 Deck α ―― 日常の流れ（' + w + 'px・' + (theme === 'light' ? 'ライト' : 'ダーク') + '）', async () => {
			const sz = sizes[w]; const pc = w > 720; const tag = w + '/' + theme;
			const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: theme, acceptDownloads: true });
			// 共有の小窓は検査で開けないので、ダウンロードに落ちる形にする。persist() は呼ばれた回数を数える（C-275 の 3）
			await ctx.addInitScript(() => {
				try { Object.defineProperty(navigator, 'share', { value: undefined }); Object.defineProperty(navigator, 'canShare', { value: undefined }); } catch (e) { /* 無ければよい */ }
				window.__persistN = 0;
				try { if (navigator.storage) Object.defineProperty(navigator.storage, 'persist', { value: () => { window.__persistN++; return Promise.resolve(true); } }); } catch (e) { /* 無ければよい */ }
			});
			const page = await ctx.newPage();
			page.setDefaultTimeout(8000);
			const errs = [];
			page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
			page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
			const ev = (fn, arg) => page.evaluate(fn, arg);
			const wide = []; const kakei = [];
			const look = async (name, full) => {
				await page.waitForTimeout(200);
				const r = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, k: document.body.innerText.includes('家系') }));
				if (r.sw > r.iw) wide.push(name + ':' + r.sw + '>' + r.iw);
				if (r.k) kakei.push(name);
				if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '-' + w + '-' + theme + '.png'), fullPage: !!full }); }
			};
			const closeSheet = async () => { if (await page.isVisible('#sheet')) await ev(() => document.getElementById('scrim').click()); };
			const pane = async (k) => { if (!pc) await page.click('[data-tab="' + k + '"]'); else await ev((x) => document.querySelector('[data-pane="' + x + '"]').scrollIntoView({ block: 'start' }), k); };
			const unpane = async (k) => { if (!pc) await page.click('[data-tab="' + k + '"]'); };
			const more = pc ? '#moreBtnPc' : '#moreBtn';
			const ready = () => page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc && (document.querySelector('.vh, canvas.ov, .stage .empty')), null, { timeout: 15000 });
			const addMock = () => page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });

			// (1) 最初に開く（親がいない）: 案内とバックアップのボタンだけ。仮のデータは入らない（C-275 の 5）
			await page.goto(base + '/deck-alpha.html');
			await ready();
			const empty = await ev(() => ({ text: document.getElementById('stage').innerText, n: window.__deckAlpha.S.doc.parents.length, nudge: document.getElementById('nudge').hidden }));
			assert(empty.n === 0 && /まだ親がいません/.test(empty.text) && /バックアップ/.test(empty.text) && !/仮のデータ/.test(empty.text) && empty.nudge, tag + ' 最初に開くと親0人で「まだ親がいません」とバックアップのボタン（仮のデータは入らない・札は出ない）', empty);
			await look('01-hajime-kara');

			// 仮のデータ（版13 と同じ種の親100人）を入れて開き直す。race-0001 は一覧で終了なので「終了レース：中距離」へ付け替わる
			await addMock();
			await ev(async () => { await window.DeckAlpha.store.replaceAll(window.__deckAlphaMock.makeMock(100, 11)); });
			await page.reload(); await ready();
			await page.waitForTimeout(2400); // 付け替えのトーストが消えるまで
			const first = await ev(() => { const S = window.__deckAlpha.S; return { n: S.doc.parents.length, sets: S.doc.sets.map((s) => s.id), nudge: document.getElementById('nudge').hidden ? '' : document.getElementById('nudge').textContent, persist: window.__persistN }; });
			assert(first.n === 100 && first.sets.includes('arc:medium') && !first.sets.includes('r:race-0001'), tag + ' 親100人・終了したレースは終了レースのカテゴリへ付け替わる', first);
			assert(first.nudge === '未書き出し', tag + ' 書き出していないときは見出しに「未書き出し」の札', first.nudge);
			const hdr = await ev(() => { const t = document.querySelector('.tb'); const h = document.querySelector('.hd'); return { tb: [t.scrollWidth, t.clientWidth], hd: [h.scrollWidth, h.clientWidth] }; });
			assert(hdr.tb[0] <= hdr.tb[1] && hdr.hd[0] <= hdr.hd[1], tag + ' 見出しの行と道具の行がはみ出さない', hdr);
			// 縮小の列の名前は略称（C-275 の 7）。1列目は登録日の新しい親
			const heads = await ev(() => { const S = window.__deckAlpha.S; const ps = S.doc.parents.slice().sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no); return { first: ps.slice(0, 6).map((p) => p.uma), th: [...document.querySelectorAll('.vh th[data-c]')].slice(0, 6).map((t) => t.querySelector('.vt').textContent) }; });
			const want = heads.first.map(shortOf);
			assert(JSON.stringify(heads.th) === JSON.stringify(want) && want.every((x) => Array.from(x).length <= 5), tag + ' 縮小の列の名前が衣装ごとの略称（5文字まで）', { th: heads.th, want });
			await look('02-hajime');

			// (2) レース/周回セットを選ぶ（LoH）→ 縮小・拡大
			await page.click('#setBtn'); await look('03-set-ichiran');
			await page.check('input[value="r:race-0002"]'); await page.waitForTimeout(150);
			const own = () => ev(() => { const tds = [...document.querySelectorAll('.vb td[data-r]')], g = [...document.querySelectorAll('.vb td[data-g]')]; const center = (a) => a.filter((t) => t.textContent.replace(t.querySelector('.own') ? t.querySelector('.own').textContent : '', '').trim()).length; return { set: document.getElementById('setText').textContent, cells: tds.length, own: tds.filter((t) => t.querySelector('.own')).length, center: center(tds), geneOwn: g.filter((t) => t.querySelector('.own')).length, gl: [...document.querySelectorAll('.vl th.gl')].map((t) => t.textContent) }; });
			const lv1 = await own();
			assert(lv1.cells > 0 && lv1.own > 0 && lv1.center === 0 && lv1.geneOwn > 0 && lv1.gl.length > 0, tag + ' 縮小: マスと遺伝子の行の左上に親本人の★・中央の数字なし（版13 のまま）', lv1);
			await look('04-shukusho');
			await ev(() => document.querySelector('[data-lv="2"]').click()); await page.waitForTimeout(150);
			const lv2 = await own();
			const th2 = await ev(() => { const S = window.__deckAlpha.S; const t = document.querySelector('.vh th[data-c="0"]'); return { vt: t.querySelector('.vt').textContent, title: t.title }; });
			assert(lv2.center > 0 && lv2.own > 0, tag + ' 拡大: 中央の合計と左上の親本人の★', { center: lv2.center, own: lv2.own });
			assert(UMAS.some((u) => th2.vt.endsWith(u.charaName) && th2.title.endsWith(u.charaName)), tag + ' 拡大の列の名前はキャラ名のまま（略称にしない）', th2);
			const sm = await ev(() => document.getElementById('sortMax').title);
			assert(sm === '先代を含む★の合計のうち最大。押すと大きい順', tag + ' 「最大」の説明の文（C-275 の 6）', sm);
			await look('05-kakudai');
			await ev(() => document.querySelector('[data-lv="1"]').click());

			// (3) 引き出し・ソートの「分類ごと」
			if (!pc) { await pane('parent'); await look('06-pane-oya'); await pane('skill'); await look('06-pane-skill'); await pane('view'); await look('06-pane-hyoji'); }
			else await look('06-pane-pc');
			await pane('sort'); await page.selectOption('#rs', 'cat'); await page.waitForTimeout(150);
			const cat = await ev(() => ({ strips: document.querySelectorAll('.vl th.cb').length, rows: document.querySelectorAll('.vl th[data-r]').length, legend: !document.getElementById('catLegendRow').hidden, cats: document.querySelectorAll('#sf-cat .tag').length }));
			assert(cat.strips === cat.rows && cat.rows > 0 && cat.legend && cat.cats === 3, tag + ' 分類ごと: 帯と凡例・分類の札は3つ（版13 のまま）', cat);
			await look('07-sort-bunrui');
			await page.selectOption('#rs', 'def'); await unpane('sort');

			// (4) スマホ: 表のスワイプの惰性（版13 のまま）
			if (!pc) {
				const cdp = await ctx.newCDPSession(page);
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 250, y: 560 }] });
				for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 250, y: 560 - 200 * k / 6 }] }); await page.waitForTimeout(12); }
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
				const rel = await ev(() => document.getElementById('stage').scrollTop);
				await page.waitForTimeout(1500);
				const end = await ev(() => document.getElementById('stage').scrollTop);
				assert(rel > 0 && end > rel, tag + ' スワイプして離したあとも惰性で進む', { rel, end });
				await ev(() => { const s = document.getElementById('stage'); s.scrollTop = 0; s.scrollLeft = 0; });
			}

			// (5) 本育成設計: 枠を押して衣装を探す → 6人を入れて絞り込み
			await pane('plan');
			await page.click((pc ? '#planList' : '#planTree') + ' .pslot[data-slot="0"]');
			await page.fill('#cosQ', 'だいいち'); await page.waitForTimeout(100);
			const hit = await ev(() => document.querySelectorAll('#cosList [data-cos]').length);
			assert(hit > 0, tag + ' 本育成設計の枠: ひらがなで衣装が見つかる', hit);
			await page.click('#cosList [data-cos]');
			const filled = await ev(() => { const S = window.__deckAlpha.S, M = S.M; const set = S.doc.sets.find((s) => s.id === S.settings.cur); const ps = S.doc.parents.filter((p) => (p.sets || []).includes(set.id) && M.fam(p).length === 3 && M.fam(p).every((m) => m.uma)); const a = ps[0], b = ps[3]; const pl = S.doc.plans[S.settings.cur]; pl.slots = M.fam(a).map((m) => m.uma).concat(M.fam(b).map((m) => m.uma)); window.__deckAlpha.draw(); return pl.slots.length; });
			await ev(() => document.querySelector('[data-th="1"]').click()); // 全体を描き直す（基準は★1以上のまま）
			await page.click('#planGo'); await page.waitForTimeout(150);
			const plan = await ev(() => ({ sum: document.getElementById('planSum').innerText, cols: document.querySelectorAll('.vh th[data-c]').length, dot: !document.getElementById('dotPlan').hidden }));
			assert(filled === 6 && /そのまま使える/.test(plan.sum) && plan.cols > 0 && plan.dot, tag + ' 本育成設計で絞り込む（◎ そのまま使える・○ 祖にできる）', plan);
			await look('08-honikusei');
			await unpane('plan');

			// (6) 2組を探す → 選ぶ → 充足・おすすめ
			await page.click('#recPair');
			const pairs = await ev(() => document.querySelector('#sheetIn h2 .sub').innerText);
			assert(/親\d+人から2組（6人）を選ぶ/.test(pairs) && !pairs.includes('家系'), tag + ' 2組を探す: 「2組（6人）を選ぶ」（C-275 の 6）', pairs);
			await look('09-2kumi-sagasu');
			await page.click('#sheetIn [data-k="0"]');
			const cov = await ev(() => ({ cov: document.getElementById('cov').innerText, A: window.__deckAlpha.S.A, B: window.__deckAlpha.S.B, miss: document.getElementById('miss').innerText }));
			assert(cov.A && cov.B && /\d+\/\d+/.test(cov.cov) && /^未所持スキル\d+種/.test(cov.miss), tag + ' 2組を選ぶと充足と未所持スキル', cov);
			await look('10-2kumi-sentaku');
			await page.click('#recB');
			const recB = await ev(() => document.querySelector('#sheetIn h2').innerText.replace(/\s+/g, ' '));
			assert(/^親Bのおすすめ 親A .+ と先代が持たない\d+種を多く埋める順/.test(recB), tag + ' 親Bのおすすめ: 「親A 〇 と先代が持たない〇種を多く埋める順」（C-275 の 6）', recB);
			await closeSheet();
			// 親Bだけにする（親Aの小窓で「親Bにする」）→「親Aのおすすめ」
			await page.click('#slotA'); await page.click('#sheetIn [data-pick="B"]'); await page.waitForTimeout(150);
			await page.click('#recB');
			const recA = await ev(() => ({ h: document.querySelector('#sheetIn h2').innerText.replace(/\s+/g, ' '), btn: (document.querySelector('#sheetIn [data-b]') || {}).textContent }));
			assert(/^親Aのおすすめ 親B .+ と先代が持たない\d+種を多く埋める順/.test(recA.h) && recA.btn === 'Aにする', tag + ' 親Aのおすすめ: 「親B 〇 と先代が持たない…」と「Aにする」', recA);
			await page.click('#sheetIn [data-b]'); await page.waitForTimeout(150);
			await page.click('#slotA'); await look('11-oya-komado'); await closeSheet();

			// (7) 「⋯」→ バックアップ。「ホーム画面に追加」の案内は T92 で外した（91）。仮のデータ・終了をまねる・登録の画面を試すは無い
			await page.click(more);
			const data = await ev(() => { const t = document.getElementById('sheetIn').innerText; return { t, home: !!document.getElementById('homeGuide'), btns: [...document.querySelectorAll('#sheetIn button, #sheetIn a')].map((b) => b.textContent) }; });
			assert(!data.home && !/ホーム画面/.test(data.t) && /書き出す/.test(data.t), tag + ' 「⋯」にバックアップがあり、「ホーム画面に追加」の案内は無い（T92）', data.t.slice(0, 400));
			assert(!/仮のデータ|終了をまねる|登録の画面を試す|親30人|全部消す/.test(data.t), tag + ' 「⋯」に版13 の確認用の項目が無い（C-275 の 5）', data.btns);
			await look('12-backup', true);
			const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#exportBtn')]);
			const file = path.join(os.tmpdir(), 'deck-alpha-' + w + theme + '-' + dl.suggestedFilename());
			await dl.saveAs(file);
			const ex = JSON.parse(fs.readFileSync(file, 'utf8'));
			const after = await ev(() => ({ nudge: document.getElementById('nudge').hidden, last: window.__deckAlpha.S.settings.lastExport, text: document.getElementById('sheetIn').innerText }));
			assert(/^uma-deck-star-\d{8}\.json$/.test(dl.suggestedFilename()) && ex.format === 'uma-deck' && ex.schema === 2 && ex.parents.length === 100, tag + ' 書き出し: uma-deck-star-日付.json・親100人', { name: dl.suggestedFilename(), n: ex.parents.length });
			assert(after.nudge && after.last && /最後の書き出し：今日/.test(after.text), tag + ' 書き出すと札が消え「最後の書き出し：今日」', after);
			await closeSheet();
			// 8日前に書き出した扱い → 「書き出し 8日前」の札
			await ev(async () => { const S = window.__deckAlpha.S; S.settings.lastExport = new Date(Date.now() - 8 * 86400000).toISOString(); await window.DeckAlpha.store.putMeta('settings', S.settings); });
			await page.reload(); await ready();
			const nudge8 = await ev(() => document.getElementById('nudge').hidden ? '' : document.getElementById('nudge').textContent);
			assert(nudge8 === '書き出し 8日前', tag + ' 7日以上前なら「書き出し N日前」の札', nudge8);
			// 読み込み（置き換える）: 親を1人消してから、書き出したファイルで戻す。保存のときに persist() を1回
			await ev(async () => { await window.DeckAlpha.store.deleteParent('p1'); });
			await page.reload(); await ready();
			await page.click(more);
			await page.setInputFiles('#importFile', file);
			await page.waitForSelector('#sheetIn [data-rep]');
			await look('13-yomikomi');
			await page.click('#sheetIn [data-rep]'); await page.waitForTimeout(300);
			const imp = await ev(() => ({ n: window.__deckAlpha.S.doc.parents.length, persist: window.__persistN }));
			assert(imp.n === 100 && imp.persist === 1, tag + ' 読み込み（置き換える）で親100人に戻り、persist() を1回呼ぶ', imp);
			fs.rmSync(file, { force: true });

			// (8) UmaStar から送られた親を登録する（受け取りの口 'umaDeck:send'）。登録の画面 → 登録 → Deck
			const sendTo = async (c) => { await addMock(); await ev((c) => { const S = window.__deckAlpha ? window.__deckAlpha.S : window.__deckAlphaRegister.S; localStorage.setItem('umaDeck:send', JSON.stringify(window.__deckAlphaMock.makeSend(c, S.doc))); }, c); };
			const openReg = async () => { await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.__deckAlphaRegister, null, { timeout: 15000 }); await page.waitForTimeout(200); };
			await sendTo('a'); await openReg();
			const ra = await ev(() => ({ bar: !document.getElementById('regbar').hidden, dis: document.getElementById('regBtn').disabled, set: document.querySelector('#setPick .t').textContent, scope: [...document.querySelectorAll('#scopeSeg button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + (b.disabled ? '(x)' : '')), fz: document.querySelectorAll('.fzline .fz').length, persist: window.__persistN }));
			assert(ra.bar && !ra.dis && /リーグ オブ ヒーローズ/.test(ra.set) && ra.scope.join() === '親Aだけ*,親Aセット(x)' && ra.fz === 3 && ra.persist === 0, tag + ' 登録の画面（親Aだけ）: 送り先は UmaStar のレース・因子は1行の3つ', ra);
			await look('14-toroku', true);
			await page.click('[data-act="toggle-sk"]'); await look('14b-toroku-shiro', true); await page.click('[data-act="toggle-sk"]');
			await page.click('#regBtn'); await page.waitForTimeout(200);
			const done = await ev(() => ({ ok: (document.querySelector('.okbox') || {}).innerText, inbox: localStorage.getItem('umaDeck:send'), persist: window.__persistN, links: [...document.querySelectorAll('#body a')].map((a) => a.textContent + '>' + a.getAttribute('href')) }));
			assert(/^登録しました/.test(done.ok || '') && done.inbox === null && done.persist === 1 && done.links.join() === 'Deck (αテスト)を開く>deck-alpha.html', tag + ' 登録すると受け取りの口を消し、persist() を1回・「Deck (αテスト)を開く」だけ', done);
			await look('15-toroku-sumi');
			await page.click('a:has-text("Deck (αテスト)を開く")'); await ready(); await page.waitForTimeout(300);
			const reg = await ev(() => { const S = window.__deckAlpha.S; const p = S.doc.parents.slice().sort((a, b) => (+b.id.slice(1)) - (+a.id.slice(1)))[0]; const s = S.doc.sets.find((x) => x.id === S.settings.cur); return { n: S.doc.parents.length, cur: S.settings.cur, sets: p.sets, style: p.tags.style, sends: s && s.sends }; });
			assert(reg.n === 101 && reg.cur === 'r:race-0002' && reg.sets.join() === 'r:race-0002' && reg.style.join() === 'sashi' && reg.sends === 3, tag + ' 登録した親が Deck に入り、送り先のセットを選んだ状態で開く（②の一覧は3回目の送り）', reg);
			await look('16-toroku-go');
			// 親Aセット（祖1 は登録済みと全部同じ →「同一」を選んだ状態）
			await sendTo('b'); await openReg();
			const rb = await ev(() => ({ scope: [...document.querySelectorAll('#scopeSeg button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')), cards: document.querySelectorAll('section.card').length, linked: [...document.querySelectorAll('section.card')].map((c) => !!c.querySelector('[data-link][aria-pressed="true"]')) }));
			assert(rb.scope.join() === '親Aだけ,親Aセット*' && rb.cards === 4 && rb.linked[2] === true, tag + ' 登録の画面（親Aセット）: 祖1 は「同一」を選んだ状態', rb);
			await look('17-toroku-set', true);
			// 読めない所あり: 衣装の候補を押すまで登録できない
			await sendTo('c'); await openReg();
			const rc = await ev(() => ({ dis: document.getElementById('regBtn').disabled, need: document.getElementById('needTop').hidden ? '' : document.getElementById('needTop').textContent, cands: document.querySelectorAll('.cand').length }));
			await page.click('.cand'); await page.waitForTimeout(150);
			const rc2 = await ev(() => document.getElementById('regBtn').disabled);
			assert(rc.dis && /^要確認 \d+/.test(rc.need) && rc.cands === 3 && !rc2, tag + ' 登録の画面（読めない所あり）: 要確認・候補3つ・候補を押すと登録できる', { rc, after: rc2 });
			await look('18-toroku-yomenai', true);
			// 送られたものが無い（形が崩れている）とき
			await ev(() => localStorage.setItem('umaDeck:send', '{"format":"other"}')); await openReg();
			const rn = await ev(() => ({ t: document.getElementById('body').innerText, bar: document.getElementById('regbar').hidden }));
			assert(/UmaStar から送られた親がありません/.test(rn.t) && rn.bar, tag + ' 受け取るものが無いときは「送られた親がありません」と Deck (αテスト)を開くボタンだけ', rn);

			// (9) 一覧から消えたレース（UmaStar の欄に出なくなった）は、開いたときに終了レースのカテゴリへ付け替わる
			await page.route('**/data/upcoming-races.json*', async (route) => { const r = await route.fetch(); const j = await r.json(); j.races.forEach((x) => { if (x.id === 'race-0002') x.selectable = false; }); await route.fulfill({ response: r, json: j }); });
			await page.goto(base + '/deck-alpha.html'); await ready(); await page.waitForTimeout(300);
			const arc = await ev(() => { const S = window.__deckAlpha.S; return { sets: S.doc.sets.map((s) => s.id), cur: S.settings.cur, hdr: document.getElementById('setText').textContent }; });
			assert(!arc.sets.includes('r:race-0002') && arc.sets.includes('arc:long') && arc.cur === 'arc:long' && arc.hdr === '終了レース：長距離', tag + ' 終了したレースのセットは終了レース：長距離へ付け替わり、選んだ状態を引き継ぐ', arc);
			await page.unroute('**/data/upcoming-races.json*');

			assert(wide.length === 0, tag + ' どの場面でもページの横スクロールなし', wide);
			assert(kakei.length === 0, tag + ' どの場面でも画面に「家系」が無い', kakei);
			assert(errs.length === 0, tag + ' コンソールのエラー 0', errs);
			await ctx.close();
		});
	}
}
