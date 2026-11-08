// T126（2026-11-08・決定 412〜418・512）: Deck α の登録の画面の作り直しと、人ごとの結合画像の受け渡しの検査。
// run-smoke.mjs の末尾から register143() で呼ばれる（塊の見出しはすべて「T126」で始まる。`npm run test:visual -- --only=T126` で回せる）。
//
//  - 412: PC は T119 のモックの形。①に「登録する」280×72px・②はタブ・右に結合画像（幅は最大 560px・画面の幅 1600px 以上は 640px）。
//  - 413・414: スマホはタブの下に「読み取り結果｜結合画像」の切り替え。「登録する」は①の先頭（下の帯は無い）。
//  - 415: 「同一」を選んだ人も一覧と画像を残す（祖は押せない・親Aは押せる）。416: 遺伝子は「〜の遺伝子」のまま。417: 遺伝子の★も直せる。
//  - 418: UmaStar・UmaExam の結合のときに人ごとの JPEG を uma-deck とは別の IndexedDB（uma-deck-images）に書き、送る JSON には印だけ。
//         OCR の時点のファイルと同じ人だけ印を入れる。登録の画面は印の token と同じ記録だけ出す。登録したら消す。古いもの（3日）は消す。
//  - 512: 画面の新しい文。
// 結合の中身（stitchOnePerson）は作り物の Canvas に差し替える（ゲームの画像を使わない）。スキル名・衣装名は検査の側に書かない（恒久ルール1）。
// T126_SHOTS=<フォルダ> で画像を残す（登録の画面 390・1280 × ライト・ダーク、スマホの切り替えの両方、遺伝子の★を直すところ、「同一」の人）。
import { installReadyProbe, waitPageReady } from './lib/page-ready.mjs';

export async function register143(env) {
	const { block, assert, browser, base, fs, path } = env;
	const SHOTS = process.env.T126_SHOTS || '';
	const TEXT = { read: '読み取り結果', image: '結合画像', noImage: '結合画像はありません', zoom: '結合画像を大きく見る' };

	/* ---------- 登録の画面だけを開く（データは検査の作り物 tests/visual/deck-alpha-mock.js の場面 b に、★不明と遺伝子を足す） ---------- */
	async function openReg(w, theme, opts) {
		const o = opts || {};
		const h = w < 900 ? 844 : w >= 1600 ? 1000 : 800;
		const mobile = w < 900;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, colorScheme: theme });
		await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem('t126')) { sessionStorage.setItem('t126', '1'); localStorage.setItem('uma-tools-theme', t); } } catch (e) { /* 無ければよい */ } }, theme);
		const page = await ctx.newPage();
		page.setDefaultTimeout(10000);
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		const ev = (f, a) => page.evaluate(f, a);
		await page.goto(base + '/deck-alpha-register.html');
		await page.waitForFunction(() => window.DeckAlpha && window.UmaDeckImages, null, { timeout: 15000 });
		await page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
		// 文書（親40人）と送られた形（3人）。親Aは白30種・★不明1つ・赤の★不明。画像は親Aと祖A1だけ（祖A2 は「無い」の場面）
		const info = await ev(async (o) => {
			const K = window.DeckAlpha, M = window.__deckAlphaMock;
			const doc = M.makeMock(40, 11);
			await K.store.replaceAll(Object.assign(K.emptyDoc(), doc));
			await K.store.putMeta('settings', Object.assign({}, K.DEFAULT_SETTINGS, { lastExport: new Date().toISOString() }));
			const send = M.makeSend('b', doc);
			const main = send.persons[0];
			const r = M.rng(119);
			const pool = [...K.SK.values()].filter((s) => s.cat !== 'factor');
			let guard = 0;
			while (Object.keys(main.skills).length < 30 && guard++ < 800) { const s = pool[Math.floor(r() * pool.length)]; if (!(s.id in main.skills)) main.skills[s.id] = 1 + Math.floor(r() * 3); }
			const ids = Object.keys(main.skills); main.skills[ids[2]] = -1;
			main.blue = ['speed', 3]; main.red = ['long', -1];
			// 結合画像の作り物（幅 752px。一覧の行の数だけ段を描く）
			const draw = (n, color) => { const c = document.createElement('canvas'); c.width = 752; c.height = 160 + n * 40; const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); for (let k = 0; k < n; k++) { x.fillStyle = color; x.fillRect(8 + (k % 2) * 376, 80 + Math.floor(k / 2) * 80, 360, 70); } return c; };
			const tok = [];
			for (let i = 0; i < 2; i++) {
				const t = 'test-' + i + '-' + Date.now();
				const ok = await window.UmaDeckImages.save('star:' + i, t, draw(Object.keys(send.persons[i].skills).length, i ? '#d9f2dc' : '#d7e6fb'));
				tok.push(ok ? t : null);
				send.persons[i].img = { slot: 'star:' + i, token: t };
			}
			// 祖A2 は印があっても記録の token が違う（OCR の後に結合し直したのと同じ）→ 出さない
			await window.UmaDeckImages.save('star:2', 'other', draw(4, '#eeeeee'));
			send.persons[2].img = o.noMark ? null : { slot: 'star:2', token: 'mine' };
			localStorage.setItem('umaDeck:send', JSON.stringify(send));
			return { tok, geneN: Object.keys(main.genes).length, skN: Object.keys(main.skills).length };
		}, o);
		await page.goto(base + '/deck-alpha-register.html');
		await page.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S.persons && window.__deckAlphaRegister.S.persons.length === 3, null, { timeout: 15000 });
		// 画像を読み終えるまで待つ（祖A2 は記録の token が違うので、読み直しを数回してから「無い」になる）
		await page.waitForFunction(() => window.__deckAlphaRegister.S.images.every((x) => x !== undefined), null, { timeout: 10000 });
		await page.waitForTimeout(200);
		const wide = [];
		const look = async (name, full) => {
			await page.waitForTimeout(150);
			const r = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
			if (r.sw > r.iw) wide.push(name + ':' + r.sw + '>' + r.iw);
			if (!SHOTS) return;
			fs.mkdirSync(SHOTS, { recursive: true });
			const file = path.join(SHOTS, w + '-' + theme + '-' + name + '.png');
			if (full) { const H = await ev(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)); await page.setViewportSize({ width: w, height: Math.min(H, 4000) }); await page.waitForTimeout(150); await page.screenshot({ path: file }); await page.setViewportSize({ width: w, height: h }); }
			else await page.screenshot({ path: file });
		};
		return { ctx, page, errs, ev, info, look, wide };
	}
	const rect = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`;

	/* ---------- (1) 部品（js/deck-alpha-images.js） ---------- */
	await block('T126(1) 結合画像の部品: 印（tokenOf）・書く・読む・消す・古いものを消す・別の DB（uma-deck を変えない）', async () => {
		const { ctx, page, errs, ev } = await openReg(1280, 'light');
		const r = await ev(async () => {
			const I = window.UmaDeckImages;
			const a = new File(['a'], 'a.png'), b = new File(['b'], 'b.png');
			const t1 = I.tokenOf([a, b]), t2 = I.tokenOf([a, b]), t3 = I.tokenOf([b, a]), t4 = I.tokenOf([a, new File(['a'], 'a.png')]);
			const c = document.createElement('canvas'); c.width = 40; c.height = 20; c.getContext('2d').fillRect(0, 0, 40, 20);
			const ok = await I.save('exam:5', t1, c);
			const got = await I.load('exam:5');
			await I.remove(['exam:5']);
			const gone = await I.load('exam:5');
			// 古い記録（4日前）を直接入れ、sweep で消えるか
			const db = await new Promise((res) => { const q = indexedDB.open(I.DB_NAME); q.onsuccess = () => res(q.result); });
			await new Promise((res) => { const t = db.transaction(I.STORE, 'readwrite'); t.objectStore(I.STORE).put({ slot: 'exam:4', token: 'x', blob: new Blob(['x']), w: 1, h: 1, at: Date.now() - 4 * 864e5 }); t.oncomplete = res; });
			const before = !!(await I.load('exam:4'));
			await I.sweep();
			const after = !!(await I.load('exam:4'));
			db.close();
			const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name).sort() : null;
			const deckStores = await new Promise((res) => { const q = indexedDB.open('uma-deck'); q.onsuccess = () => { const n = [...q.result.objectStoreNames]; q.result.close(); res(n); }; });
			return { same: t1 === t2, order: t1 !== t3, other: t1 !== t4, empty: I.tokenOf([]), ok, type: got && got.blob.type, w: got && got.w, h: got && got.h, tok: got && got.token === t1, gone, before, after, dbs, deckStores, max: I.MAX_AGE_MS };
		});
		assert(r.same && r.order && r.other && r.empty === null, '印: 同じ File を同じ順に並べたときだけ同じ（中身が同じ別の File は別）・空は null', r);
		assert(r.ok && r.type === 'image/jpeg' && r.w === 40 && r.h === 20 && r.tok && r.gone === null, '書く（JPEG）・読む（token と寸法）・消す', r);
		assert(r.before && !r.after && r.max === 3 * 864e5, '3日より古い記録は sweep で消える', r);
		assert(!r.dbs || (r.dbs.includes('uma-deck-images') && r.dbs.includes('uma-deck')), 'uma-deck とは別の DB（uma-deck-images）', r.dbs);
		assert(!r.deckStores.some((n) => /image|shot/.test(n)), 'uma-deck の形は変えない（画像の store を足さない）', r.deckStores);
		assert(errs.length === 0, 'コンソールのエラーなし', errs);
		await ctx.close();
	});

	/* ---------- (2) PC の形（412） ---------- */
	for (const [w, maxImg] of [[1280, 560], [1920, 640]]) {
		await block('T126(2) 登録の画面 PC ' + w + ': ①に「登録する」280×72・下の帯なし・タブ3つ・一覧は開いて★の帯をそろえる・右に画像（最大 ' + maxImg + 'px）', async () => {
			const { ctx, page, errs, ev, look, wide } = await openReg(w, 'light');
			const r = await ev(`(() => {
				const btn = ${rect('#regBtn')}, top = ${rect('section.regtop')};
				const p0 = document.getElementById('ppanel0');
				const starsX = [...p0.querySelectorAll('.skt .stars')].map((s) => Math.round(s.getBoundingClientRect().left));
				const img = p0.querySelector('.pimg img'); const ir = img ? img.getBoundingClientRect() : null; const lr = p0.querySelector('.pleft').getBoundingClientRect();
				return { btn, top, inTop: !!document.querySelector('section.regtop #regBtn'), bar: !!document.getElementById('regbar'), tabs: [...document.querySelectorAll('.ptabrow [role="tab"]')].map((b) => b.childNodes[0].textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')),
					hidden: [0, 1, 2].map((i) => document.getElementById('ppanel' + i).hidden), rows: p0.querySelectorAll('.skt .sk').length, starsSame: new Set(starsX).size === 1, open: p0.querySelector('[data-act="toggle-sk"]').getAttribute('aria-expanded'),
					img: ir && { w: Math.round(ir.width), right: ir.left >= lr.right - 1, nat: img.naturalWidth }, zoom: p0.querySelector('.pimgbtn') && p0.querySelector('.pimgbtn').getAttribute('aria-label'),
					imgs: document.querySelectorAll('.pimg img').length, sub: !!document.querySelector('.subrow') };
			})()`);
			assert(r.btn && r.btn.w === 280 && r.btn.h === 72 && r.inTop && !r.bar && r.btn.x + r.btn.w <= r.top.x + r.top.w + 1, '「登録する」は①の中の右に 280×72px・下の帯は無い', r);
			assert(r.tabs.join() === '親A*,祖A1,祖A2' && r.hidden.join() === 'false,true,true' && !r.sub, 'タブは親A／祖A1／祖A2（親Aを開く）・PC に「読み取り結果｜結合画像」は無い', r);
			assert(r.open === 'true' && r.rows >= 30 && r.starsSame, '一覧は既定で開く（白と遺伝子）・★の帯の左端がそろう', { open: r.open, rows: r.rows, same: r.starsSame });
			assert(r.img && r.img.right && r.img.w <= maxImg && r.img.w >= maxImg - 40 && r.img.nat === 752 && r.zoom === '結合画像を大きく見る' && r.imgs === 1, '右に結合画像（最大 ' + maxImg + 'px）・読み上げの文・画像は開いているタブの1人分だけ', r.img);
			if (w === 1280) await look('pc-oyaA');
			// 祖A2（記録の token が違う）は「結合画像はありません」
			await page.click('#ptab2'); await page.waitForTimeout(150);
			const r2 = await ev(() => ({ none: (document.querySelector('#ppanel2 .pimg.none') || {}).textContent || '', imgs: document.querySelectorAll('.pimg img').length, sel: document.getElementById('ptab2').getAttribute('aria-selected') }));
			assert(r2.none === '結合画像はありません' && r2.imgs === 0 && r2.sel === 'true', 'OCR の時点と違う記録の人は「結合画像はありません」', r2);
			// 押すと大きく見る
			await page.click('#ptab0'); await page.click('#ppanel0 .pimgbtn'); await page.waitForTimeout(150);
			const z = await ev(() => ({ open: !document.getElementById('sheet').hidden, img: !!document.querySelector('#sheet .bigimg'), title: document.getElementById('sheetTitle').textContent }));
			assert(z.open && z.img && /^親A/.test(z.title), '画像を押すと小窓で大きく見る', z);
			await page.click('#sheet [data-close]');
			assert(wide.length === 0 && (await ev(() => document.documentElement.scrollWidth <= innerWidth)), '横スクロールなし', wide);
			assert(errs.length === 0, 'コンソールのエラーなし', errs);
			await ctx.close();
		});
	}

	/* ---------- (3) スマホ（413・414） ---------- */
	await block('T126(3) 登録の画面 スマホ 390: 「登録する」は①の先頭で幅いっぱい・「読み取り結果｜結合画像」で切り替え・人を替えても画像のまま', async () => {
		const { ctx, page, errs, ev, look, wide } = await openReg(390, 'light');
		const r = await ev(`(() => {
			const btn = ${rect('#regBtn')}, top = ${rect('section.regtop .regtop-grid')};
			const sub = [...document.querySelectorAll('.subrow button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''));
			return { btn, top, first: document.querySelector('.regtop-grid').firstElementChild.className, bar: !!document.getElementById('regbar'), sub, imgs: document.querySelectorAll('.pimg').length, rows: document.querySelectorAll('#ppanel0 .skt .sk').length };
		})()`);
		assert(r.btn && r.btn.w === r.top.w && r.btn.h === 56 && r.btn.y <= r.top.y + 1 && !r.bar, '「登録する」は①の先頭に幅いっぱい・高さ 56px・下の帯は無い', r);
		assert(r.sub.join() === '読み取り結果*,結合画像' && r.imgs === 0 && r.rows >= 30, 'タブの下に「読み取り結果｜結合画像」（既定は読み取り結果・画像は出さない）', r);
		await look('sp-read');
		await page.click('.subrow [data-pane="image"]'); await page.waitForTimeout(150);
		const r2 = await ev(() => { const im = document.querySelector('#ppanel0 .pimg img'); const r = im && im.getBoundingClientRect(); return { img: !!im, w: r && Math.round(r.width), rows: document.querySelectorAll('#ppanel0 .skt .sk').length, sub: [...document.querySelectorAll('.subrow button')].map((b) => b.getAttribute('aria-pressed')).join() }; });
		assert(r2.img && r2.w >= 340 && r2.rows === 0 && r2.sub === 'false,true', '「結合画像」を押すと一覧の所が幅いっぱいの画像に替わる', r2);
		await look('sp-image');
		await page.click('#ptab1'); await page.waitForTimeout(150);
		const r3 = await ev(() => ({ img: !!document.querySelector('#ppanel1 .pimg img'), pane: window.__deckAlphaRegister.S.pane }));
		assert(r3.img && r3.pane === 'image', '人を替えても画像のまま', r3);
		await page.click('#ptab2'); await page.waitForTimeout(150);
		const r4 = await ev(() => (document.querySelector('#ppanel2 .pimg.none') || {}).textContent || '');
		assert(r4 === '結合画像はありません', '画像の無い人は「結合画像はありません」', r4);
		// 「親Aだけ」なら祖のタブは「送らない」で、切り替えは出さない
		await page.click('[data-scope="one"]'); await page.waitForTimeout(150);
		const r5 = await ev(() => ({ sub: !!document.querySelector('.subrow'), ts: [...document.querySelectorAll('.ptabrow .ts')].map((s) => s.textContent).join() }));
		assert(!r5.sub && r5.ts === '送らない,送らない', '「親Aだけ」なら祖のタブは「送らない」・送らない人では切り替えを出さない', r5);
		assert(wide.length === 0 && (await ev(() => document.documentElement.scrollWidth <= innerWidth)), '横スクロールなし', wide);
		assert(errs.length === 0, 'コンソールのエラーなし', errs);
		await ctx.close();
	});

	/* ---------- (4) 415・416・417 ---------- */
	await block('T126(4) 「同一」の祖は一覧を見るだけ・遺伝子は「〜の遺伝子」・遺伝子の★を直して登録すると保存される・登録したら画像を消す', async () => {
		const { ctx, page, errs, ev, look } = await openReg(1280, 'light');
		// 祖A1 は「全部同じ」の登録済みの親と「同一」を選んだ状態（場面 b）
		await page.click('#ptab1'); await page.waitForTimeout(150);
		const g = await ev(() => { const p = document.getElementById('ppanel1'); const st = [...p.querySelectorAll('.skt .stars button')];
			return { linked: !!p.querySelector('[data-link][aria-pressed="true"]'), rows: p.querySelectorAll('.skt .sk').length, dis: st.length > 0 && st.every((b) => b.disabled), fz: [...p.querySelectorAll('.fzrow .fz')].map((b) => b.disabled).join(), img: !!p.querySelector('.pimg img') }; });
		assert(g.linked && g.rows > 0 && g.dis && g.fz === 'true,true,true' && g.img, '「同一」の祖も一覧と画像を残す・★と因子は押せない', g);
		await look('pc-sofu1-douitsu');
		// 親A を「同一」にした場合は押せる（読み取りの値を足すため）
		await page.click('#ptab0'); await page.waitForTimeout(150);
		const gene = await ev(() => { const S = window.__deckAlphaRegister.S; const id = Object.keys(S.persons[0].genes)[0]; const row = document.querySelector('#ppanel0 [data-row="0"][data-kind="genes"][data-id="' + id + '"]'); return { id, name: row && row.closest('.sk').querySelector('.nm').textContent, cur: S.persons[0].genes[id], dis: row && [...row.querySelectorAll('button')].some((b) => b.disabled) }; });
		assert(gene.name && /の遺伝子$/.test(gene.name) && gene.dis === false, '遺伝子は白スキルと同じ形の行・名前は「〜の遺伝子」のまま・★を押せる', gene);
		const next = gene.cur === 3 ? 1 : 3;
		await page.click('#ppanel0 [data-row="0"][data-kind="genes"][data-id="' + gene.id + '"] [data-star="' + next + '"]'); await page.waitForTimeout(150);
		await page.evaluate((id) => document.querySelector('#ppanel0 [data-kind="genes"][data-id="' + id + '"]').scrollIntoView({ block: 'center' }), gene.id);
		await look('pc-gene-star');
		const now = await ev((id) => window.__deckAlphaRegister.S.persons[0].genes[id], gene.id);
		assert(now === next, '遺伝子の★を押すと値が変わる', { now, next });
		// 登録すると、遺伝子の★が保存され、画像の記録は消える
		await page.click('#regBtn'); await page.waitForFunction(() => window.__deckAlphaRegister.S.done, null, { timeout: 8000 });
		const after = await ev(async (id) => { const l = await window.DeckAlpha.store.load(); const p = l.parents.slice().sort((a, b) => +b.id.slice(1) - +a.id.slice(1))[0]; const I = window.UmaDeckImages; return { gene: p.genes[id], left: [await I.load('star:0'), await I.load('star:1'), await I.load('star:2')].map((x) => !!x), inbox: localStorage.getItem('umaDeck:send') }; }, gene.id);
		assert(after.gene === next && after.left.join() === 'false,false,false' && after.inbox === null, '登録すると遺伝子の★が保存され、この送りの画像の記録を消す', after);
		assert(errs.length === 0, 'コンソールのエラーなし', errs);
		await ctx.close();
	});

	/* ---------- (5) 画像（390・1280 × ライト・ダーク） ---------- */
	await block('T126(5) 登録の画面の画像 390・1280 × ライト・ダーク（横スクロールなし・エラーなし）', async () => {
		for (const w of [390, 1280]) for (const theme of ['light', 'dark']) {
			const { ctx, errs, ev, look, wide } = await openReg(w, theme);
			const th = await ev(() => document.documentElement.getAttribute('data-theme'));
			await look('register', true);
			assert(th === theme && wide.length === 0 && errs.length === 0, w + ' ' + theme + ': 色・横スクロールなし・エラーなし', { th, wide, errs });
			await ctx.close();
		}
	});

	/* ---------- (6) UmaStar: 結合のときに書き、OCR の時点のファイルと同じ人だけ印を送る ---------- */
	await block('T126(6) UmaStar: 結合のときに人ごとの JPEG を別の DB に書く・OCR の時点と同じファイルの人だけ印を送る・登録の画面に出る', async () => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		await installReadyProbe(ctx);
		await ctx.addInitScript(({ ids }) => {
			try {
				if (!sessionStorage.getItem('__t126')) {
					sessionStorage.setItem('__t126', '1');
					localStorage.setItem('umaSkillDeck:userData', JSON.stringify({ schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] }));
					localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ skillFilter: { style: 'sashi' } }));
					localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
					localStorage.setItem('umaSkillDeck:stepTab', '1');
				}
			} catch (e) { /* 使えなければよい */ }
		}, { ids: Array.from({ length: 12 }, (_, i) => String(i + 1)) });
		const page = await ctx.newPage();
		page.setDefaultTimeout(10000);
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 404/.test(m.text())) errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		await page.goto(base + '/special.html', { waitUntil: 'load', timeout: 60000 });
		await waitPageReady(page);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await page.waitForFunction(() => typeof deckMode !== 'undefined' && deckMode && skillList.length > 0, null, { timeout: 20000 });
		const r = await page.evaluate(async () => {
			// 偽の OCR（blocks-127 と同じ差し替え）と、作り物の1人分の結合（stitchOnePerson）
			processPersonImages = async () => ({ lines: [{ text: skillList[0], stars: 2, starsReliable: true, rowKey: '0:0' }], skipped: [], warned: [], geometry: [null] });
			readGreenFactor = async () => null;
			readTopBlueRed = async () => null;
			window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, recognize: async () => ({ data: { text: '', lines: [] } }), terminate: async () => {} }) };
			const sizes = [[600, 900], [580, 700], [560, 500]];
			stitchOnePerson = async (files) => { const k = PERSON_LABELS.indexOf(PERSON_LABELS.find((l, i) => persons[i].files === files)); const [w, h] = sizes[Math.max(0, k) % 3]; const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#f0f0f0'; x.fillRect(0, 0, w, h); x.fillStyle = '#3366cc'; x.fillRect(20, 20, w - 40, 60); return c; };
			persons.forEach((p) => { p.files = []; });
			[0, 1, 2].forEach((i) => { persons[i].files = [new File(['x' + i], 'p' + i + '.png', { type: 'image/png' })]; });
			const judged = await processImages({ keepClosed: true, quiet: true });
			await runImageStitching({ keepClosed: true, quiet: true });
			const wait = async (slot, tok) => { for (let k = 0; k < 40; k++) { const v = await UmaDeckImages.load(slot); if (v && v.token === tok) return v; await new Promise((res) => setTimeout(res, 100)); } return null; };
			const t = [0, 1, 2].map((i) => UmaDeckImages.tokenOf(persons[i].files));
			const recs = await Promise.all([0, 1, 2].map((i) => wait('star:' + i, t[i])));
			const send1 = buildDeckAlphaSend(0);
			// OCR のあとに祖A1 の画像を入れ替えて結合し直す → 祖A1 の印は送らない（別の人の画像になるため）
			persons[1].files = [new File(['y'], 'q1.png', { type: 'image/png' })];
			await runImageStitching({ keepClosed: true, quiet: true });
			await wait('star:1', UmaDeckImages.tokenOf(persons[1].files));
			const send2 = buildDeckAlphaSend(0);
			window.open = () => ({});
			sendSetToDeckAlpha(0);
			return { judged, recs: recs.map((v) => v && { w: v.w, h: v.h, type: v.blob.type }), marks1: send1.persons.map((p) => p.img && p.img.slot), tokOk: send1.persons.every((p, i) => p.img && p.img.token === t[i]), marks2: send2.persons.map((p) => p.img && p.img.slot) };
		});
		assert(r.judged && r.recs.every((v) => v && v.type === 'image/jpeg' && v.w > 0), '結合のときに3人分の JPEG を別の DB に書く', r.recs);
		assert(r.marks1.join() === 'star:0,star:1,star:2' && r.tokOk, '送る JSON に人ごとの印（slot と token）だけを入れる', r.marks1);
		assert(r.marks2.join() === 'star:0,,star:2', 'OCR のあとに画像を入れ替えて結合し直した人には印を入れない', r.marks2);
		// 同じページで登録の画面を開く（新しいタブの代わり）
		await page.goto(base + '/deck-alpha-register.html');
		await page.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S.images && window.__deckAlphaRegister.S.images.length === 3 && window.__deckAlphaRegister.S.images.every((x) => x !== undefined), null, { timeout: 15000 });
		const g = await page.evaluate(async () => { const S = window.__deckAlphaRegister.S; const im = document.querySelector('#ppanel0 .pimg img'); if (im && !im.complete) await im.decode().catch(() => {}); return { kinds: S.images.map((x) => (x ? x.slice(0, 5) : x)), nat: im && im.naturalWidth }; });
		assert(g.kinds.join() === 'blob:,,blob:' && g.nat === 600, '登録の画面に、印と同じ記録の人の画像が出る（祖A1 は出さない）', g);
		assert(errs.length === 0, 'コンソールのエラーなし', errs);
		await ctx.close();
	});

	/* ---------- (7) UmaExam ---------- */
	await block('T126(7) UmaExam: 結合のときに人ごとの JPEG を書き、OCR の時点と同じファイルの人だけ印を送る', async () => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__t126e')) { sessionStorage.setItem('__t126e', '1'); localStorage.clear(); } } catch (e) { /* 無ければよい */ } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(30000);
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		await page.goto(base + '/exam.html');
		await page.waitForFunction(() => typeof skillList !== 'undefined' && skillList.length > 100);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		const r = await page.evaluate(async () => {
			processPersonImages = async () => ({ lines: EXAM_SKILL_NAMES.slice(0, 4).map((n, i) => ({ text: n, stars: (i % 3) + 1, starsReliable: true, rowKey: '0:' + i })), skipped: [], warned: [], geometry: [null] });
			readMelopTopRow = async () => ({ found: false });
			readGreenFactor = async () => null;
			window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, recognize: async () => ({ data: { text: '', lines: [] } }), terminate: async () => {} }) };
			stitchOnePerson = async () => { const c = document.createElement('canvas'); c.width = 500; c.height = 800; const x = c.getContext('2d'); x.fillStyle = '#f0f0f0'; x.fillRect(0, 0, 500, 800); return c; };
			persons.forEach((p) => { p.files = []; });
			[0, 1, 2].forEach((i) => { persons[i].files = [new File(['e' + i], 'e' + i + '.png', { type: 'image/png' })]; });
			await processImagesAndStitch();
			const wait = async (slot, tok) => { for (let k = 0; k < 40; k++) { const v = await UmaDeckImages.load(slot); if (v && v.token === tok) return v; await new Promise((res) => setTimeout(res, 100)); } return null; };
			const recs = await Promise.all([0, 1, 2].map((i) => wait('exam:' + i, UmaDeckImages.tokenOf(persons[i].files))));
			const send1 = buildDeckAlphaSend(0);
			// 画像を入れ替えて「OCR処理」だけ回し直す → 結合画像は前のファイルのものなので、印を入れない
			persons[0].files = [new File(['z'], 'z.png', { type: 'image/png' })];
			await processImages({ keepClosed: true });
			const send2 = buildDeckAlphaSend(0);
			return { newUi, recs: recs.map((v) => v && { w: v.w, type: v.blob.type }), marks1: send1.persons.map((p) => p.img && p.img.slot), marks2: send2.persons.map((p) => p.img && p.img.slot) };
		});
		assert(r.newUi && r.recs.every((v) => v && v.type === 'image/jpeg' && v.w > 0), '結合のときに3人分の JPEG を別の DB に書く（印を焼いたあと）', r.recs);
		assert(r.marks1.join() === 'exam:0,exam:1,exam:2', '送る JSON に人ごとの印を入れる', r.marks1);
		assert(r.marks2.join() === ',exam:1,exam:2', 'OCR の時点のファイルが結合のときと違う人には印を入れない', r.marks2);
		assert(errs.length === 0, 'コンソールのエラーなし', errs);
		await ctx.close();
	});
}
