// UmaStar から Deck α へ送る（T92・2026-11-03・段4 の 4-2）の検査。
// run-smoke.mjs の末尾から register102() で呼ばれる（塊の見出しはすべて「T92 Deck α へ送る」で始まる。`npm run test:visual -- --only=T92 Deck α へ送る` で回せる）。
//
// 決め（2026-11-03 おいもさん）:
//  - UmaStar の③の照合結果から、親（1人）または親と祖2人を localStorage の umaDeck:send に書き、deck-alpha-register.html を開く（URL に ? も # も付けない＝恒久ルール32）。
//    持ち主（自分／フレンド）は登録の画面で選ぶ。緑因子（継承固有）は③の画像から読む（青・赤因子は null）。読めなければ null・候補だけなら greenCands。
//  - UmaStar のツール切り替えに「Deck α」（deck-alpha.html）。Deck α から UmaStar・UmaExam へ戻れる。
//  - T88-3: 略称のひらがな「ぺ」をカタカナに（CSV を直して作り直した）。T88-4: ライト／ダークはほかのツールと同じ設定（js/theme.js）。
//  - 91: Deck α の「⋯」の「ホーム画面に追加」の案内を外す。T88-1: 「全部消す」は入れない。
// 決め（2026-11-03 19:25 おいもさん。確認のお願い 1 への答え）:
//  - 123: ③の照合結果の旧 UmaSkill Deck の取り込みの案内の箱をやめ、そこ（カードの上）に「Deck (αテスト)に送る」と1行「UmaSkill Deck は開発を停止しました。」。
//    表のすぐ上の行（「★の数をコピー」の左）の送るボタンは外す。
//  - 124: FAB の「UmaSkill Deck」を「Deck (αテスト)」にし、押すと deck-alpha.html を開く（旧 Deck の引き出しとバッジは出さない）。
//  - 125: 画面の呼び名は「Deck (αテスト)」（ツール切り替えの行・送り先を選ぶ小窓の見出し・Deck α の本体と登録の画面の題と見出し）。
//  - T92-1: 読んでいない青・赤因子（null）は、登録の画面で閉じた状態で出し、「要確認」にも入れない。
// OCR そのもの（緑因子の読み取りの精度）は tests/ocr/run-green-tests.mjs が実画像で見る。ここでは判定のあとの状態（personResults・personGreen）を作って、
// 送る JSON・登録の画面・Deck の表までを 375px（タッチ）と 1280px、ライトとダークで通す。横スクロールなし・コンソールのエラー 0。
// T92_SHOTS=<フォルダ> を付けて回すと、各場面の画像をそのフォルダに残す（確認のお願い用）。
// スキル名・固有スキル名は検査の側に書かない（data/ を Node 側で読む）。
import fs from 'node:fs';
import path from 'node:path';
import { installReadyProbe, waitPageReady, reloadReady } from './lib/page-ready.mjs';

export async function register102(env) {
	const { block, assert, browser, base, REPO_ROOT } = env;
	const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
	const SHOTS = process.env.T92_SHOTS || '';
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const UMAS = JSON.parse(read('data/training-umamusume.json')).entries;
	// 固有スキルの名前 → 衣装（1つの衣装にだけある名前を使う）
	const uniqOf = (u) => [...new Set((u.initialSkills || []).flatMap((r) => (r.skills || []).map((s) => s.name)).filter(Boolean))];
	const owners = new Map();
	UMAS.forEach((u) => uniqOf(u).forEach((n) => owners.set(n, (owners.get(n) || []).concat(u.id))));
	const solo = UMAS.map((u) => ({ id: u.id, name: uniqOf(u).find((n) => owners.get(n).length === 1) })).filter((x) => x.name);
	const G0 = solo[0], C1 = solo[1], C2 = solo[2];
	const RACE = JSON.parse(read('data/upcoming-races.json')).races.find((r) => r.id === 'race-0002');
	const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1));

	await block('T92 Deck α へ送る ―― 入口のリンク・略称のカタカナ・テーマの読み込み・「⋯」の案内が無い', async () => {
		const sp = read('special.html');
		const links = [...sp.matchAll(/href="(deck-alpha[^"]*)"/g)].map((m) => m[1]);
		assert(links.join() === 'deck-alpha.html', 'UmaStar のツール切り替えの「Deck (αテスト)」は素の deck-alpha.html（? も # も付けない）', links);
		assert(/const DECK_ALPHA_REGISTER_URL = 'deck-alpha-register\.html';/.test(sp), '送るときに開く URL は素の deck-alpha-register.html', null);
		assert(/const DECK_ALPHA_URL = 'deck-alpha\.html';/.test(sp), 'FAB の「Deck (αテスト)」で開く URL は素の deck-alpha.html（124）', null);
		assert(!/UmaSkill Deckを開いて取り込む|UmaSkill Deckに取り込めます|UmaSkill Deckに取り込み済み|deck-drawer-frame|Deck α に送る/.test(sp), 'UmaStar に旧 Deck の取り込みの案内・中で開く引き出し・古い呼び名「Deck α に送る」が無い（123・124・125）', null);
		const titles = { 'deck-alpha.html': ['Deck (αテスト)', /<h1>Deck <span class="muted small">\(αテスト\)<\/span><\/h1>/], 'deck-alpha-register.html': ['Deck (αテスト) 登録', /<h1>Deck \(αテスト\)に登録<\/h1>/] };
		for (const [p, [t, h]] of Object.entries(titles)) {
			const src = read(p);
			assert(src.includes('<title>' + t + '</title>') && h.test(src), p + ' の題と見出しは「Deck (αテスト)」（125）', null);
		}
		const ab = JSON.parse(read('data/deck-alpha/uma-abbrev.json'));
		const hira = ab.entries.filter((e) => e.abbr.includes('ぺ'));
		assert(hira.length === 0, '略称にひらがなの「ぺ」が無い（T88-3）', hira);
		for (const p of ['deck-alpha.html', 'deck-alpha-register.html']) {
			const src = read(p);
			const head = src.slice(0, src.indexOf('</head>'));
			assert(/<script src="js\/theme\.js\?v=[0-9a-z-]+"><\/script>/.test(head), p + ' は <head> で js/theme.js を同期で読む（T88-4）', null);
		}
		const dj = read('js/deck-alpha.js');
		assert(!/homeGuide|よく使う人向け|ホーム画面のアイコン|全部消す/.test(dj),'Deck α の JS に「ホーム画面に追加」の案内と「全部消す」が無い（91・T88-1）', null);
	});

	const sizes = { 375: { width: 375, height: 812, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };
	for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
		await block('T92 Deck α へ送る ―― 送る・登録・ツール切り替え・テーマ（' + w + 'px・' + (theme === 'light' ? 'ライト' : 'ダーク') + '）', async () => {
			const sz = sizes[w]; const tag = w + '/' + theme;
			const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: theme });
			await installReadyProbe(ctx);
			await ctx.addInitScript(({ d, roster, ids }) => {
				try {
					if (!sessionStorage.getItem('__t92init')) {
						sessionStorage.setItem('__t92init', '1');
						localStorage.setItem('umaSkillDeck:userData', JSON.stringify(d));
						localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
						localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
						localStorage.setItem('umaSkillDeck:stepTab', '1');
					}
				} catch (e) { /* 使えなければよい */ }
			}, { d: EMPTY, roster: { race: RACE, skillFilter: { style: 'sashi' } }, ids: IDS });
			const page = await ctx.newPage();
			page.setDefaultTimeout(8000);
			const errs = [];
			page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 404/.test(m.text())) errs.push(m.text()); });
			page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
			const ev = (fn, arg) => page.evaluate(fn, arg);
			const wide = [];
			const look = async (name, opt) => {
				await page.waitForTimeout(200);
				const r = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
				if (r.sw > r.iw) wide.push(name + ':' + r.sw + '>' + r.iw);
				if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot(Object.assign({ path: path.join(SHOTS, name + '-' + w + '-' + theme + '.png') }, opt || {})); }
			};
			const openSpecial = async () => {
				await page.goto(base + '/special.html', { waitUntil: 'load', timeout: 60000 });
				await waitPageReady(page);
				for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
				await page.waitForFunction(() => typeof deckMode !== 'undefined' && deckMode && skillList.length > 0, null, { timeout: 20000 });
				await ev(async () => { await UmaSkillDeckCore.loadTrainingSources(); });
				// 送るときに新しいタブを開く代わりに、開いた URL を控える
				await ev(() => { window.__opened = []; window.open = (u, t) => { window.__opened.push([u, t]); return {}; }; });
			};
			// 判定が終わった状態（親セットの人ごとの結果と緑因子）を作り、照合結果の引き出しを開く
			const seed = (o) => ev((o) => {
				const skills = skillList.filter((n) => !factorNormSet.has(normalizeText(n)));
				const genes = skillList.filter((n) => factorNormSet.has(normalizeText(n)));
				const mk = (names, stars) => ({ detectedSkills: new Set(names), skillStars: Object.fromEntries(names.map((n, i) => [n, stars[i % stars.length]])), skillSources: {}, matchReasons: {} });
				personResults = PERSON_LABELS.map(() => null); personGreen = PERSON_LABELS.map(() => null);
				personResults[0] = mk(skills.slice(0, 4).concat(genes.slice(0, 1)), [3, 2, null, 1]);
				personGreen[0] = { name: o.g0, stars: 2, cands: null };
				if (o.three) {
					personResults[1] = mk(skills.slice(2, 5), [1, 2, 3]); personGreen[1] = { name: null, stars: 3, cands: [o.c1, o.c2] };
					personResults[2] = mk(skills.slice(5, 7), [2]); personGreen[2] = null;
				}
				if (o.setB) { personResults[3] = mk(skills.slice(0, 2), [1]); personGreen[3] = null; }
				renderResults();
				openDrawer('result');
				return { skills: skills.length, genes: genes.length };
			}, o);
			const openReg = async () => { await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.__deckAlphaRegister, null, { timeout: 15000 }); await page.waitForTimeout(250); };
			const sent = () => ev(() => ({ opened: window.__opened.slice(), j: JSON.parse(localStorage.getItem('umaDeck:send') || 'null') }));

			// (1) 親だけ（1人）: ボタンを押すとそのまま送る
			await openSpecial();
			const s1 = await seed({ g0: G0.name, three: false });
			await page.waitForTimeout(400);
			const vis1 = await ev(() => { const n = document.getElementById('deck-alpha-send-note'); const b = document.getElementById('deck-alpha-send-btn'); const r = b.getBoundingClientRect(), st = document.getElementById('stat-grid').getBoundingClientRect();
				const line = n.querySelector('p'); const lr = line.getBoundingClientRect();
				return { shown: !n.classList.contains('hidden') && r.width > 0, text: b.innerText.trim(), line: line.textContent.trim(), lineBelow: (lr.top >= r.bottom - 0.5 || (innerWidth >= 640 && lr.left >= r.right && lr.top < r.bottom)) && lr.height < 24, aboveCards: lr.bottom <= st.top + 0.5,
					inCopyRow: !!document.querySelector('#result-copy-slot #deck-alpha-send-btn'), copyRow: [...document.querySelectorAll('#result-copy-slot button')].map((x) => x.id).join(), oldBox: !!document.getElementById('deck-handoff-note') }; });
			assert(s1.skills >= 7 && vis1.shown && vis1.text === 'Deck (αテスト)に送る' && vis1.line === 'UmaSkill Deck は開発を停止しました。' && vis1.lineBelow && vis1.aboveCards && !vis1.inCopyRow && vis1.copyRow === 'result-copy-btn' && !vis1.oldBox,
				tag + ' 照合結果のカードの上に「Deck (αテスト)に送る」とすぐ下に停止の1行（表の上の行には送るボタンが無い・旧 Deck の案内が無い）', vis1);
			await page.evaluate(() => { document.querySelector('#result-drawer .uma-drawer-body').scrollTop = 0; });
			await look('f-send');
			await page.click('#deck-alpha-send-btn');
			const r1 = await sent();
			const p0 = r1.j && r1.j.persons[0];
			assert(JSON.stringify(r1.opened) === JSON.stringify([['deck-alpha-register.html', '_blank']]), tag + ' 新しいタブで素の deck-alpha-register.html を開く', r1.opened);
			assert(r1.j && r1.j.format === 'uma-deck-send' && r1.j.v === 1 && r1.j.from === 'star' && r1.j.owner === 'self' && r1.j.race === 'race-0002' && r1.j.style === 'sashi'
				&& r1.j.send.length === IDS.length && r1.j.persons.length === 1, tag + ' 送る JSON: 形・レース・脚質・②の一覧・1人', r1.j && { race: r1.j.race, style: r1.j.style, send: r1.j.send.length, n: r1.j.persons.length });
			assert(p0 && p0.uma === null && p0.blue === null && p0.red === null && JSON.stringify(p0.green) === JSON.stringify([G0.name, 2]) && p0.greenCands === null
				&& Object.keys(p0.skills).length === 4 && Object.values(p0.skills).sort().join() === '-1,1,2,3' && Object.keys(p0.genes).length === 1 && /^ap-/.test(Object.keys(p0.genes)[0]),
			tag + ' 親: 緑因子は読んだ名前と★・青赤は null・白4種（★を測れないものは -1）・遺伝子1つ', p0);
			// FAB の「Deck (αテスト)」（124）: 押すと deck-alpha.html を新しいタブで開く。旧 Deck の引き出しとバッジは無い
			await ev(() => closeDrawer()); await page.waitForTimeout(500);
			await page.click('#fab-toggle'); await page.waitForTimeout(450);
			const fab = await ev(() => { const it = document.getElementById('fab-item-deck'); const r = it.getBoundingClientRect();
				return { text: it.innerText.trim(), shown: !it.hidden && r.width > 0, inView: r.right <= window.innerWidth + 0.5 && r.left >= 0, dot: !!it.querySelector('.uma-fab-dot'), drawer: !!document.getElementById('deck-drawer'),
					labels: [...document.querySelectorAll('#fab-nav .uma-fab-item')].filter((b) => !b.hidden).map((b) => b.innerText.trim().split('\n')[0]).join() }; });
			assert(fab.text === 'Deck (αテスト)' && fab.shown && fab.inView && !fab.dot && !fab.drawer && !/UmaSkill Deck/.test(fab.labels), tag + ' FAB の項目は「Deck (αテスト)」（未読の丸なし・旧 Deck の引き出しなし）', fab);
			await look('g-fab');
			await page.click('#fab-item-deck'); await page.waitForTimeout(200);
			const fabGo = await ev(() => ({ last: window.__opened[window.__opened.length - 1], n: window.__opened.length, drawer: openDrawerKey, nav: document.getElementById('fab-nav').classList.contains('open') }));
			assert(JSON.stringify(fabGo.last) === JSON.stringify(['deck-alpha.html', '_blank']) && fabGo.n === 2 && fabGo.drawer === null && !fabGo.nav, tag + ' FAB の「Deck (αテスト)」で素の deck-alpha.html を新しいタブで開く', fabGo);
			await openReg();
			const g1 = await ev(() => ({ scope: [...document.querySelectorAll('#scopeSeg button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + (b.disabled ? '(x)' : '')),
				set: document.querySelector('#setPick .t').textContent, uma: window.__deckAlphaRegister.S.persons[0].uma, dis: document.getElementById('regBtn').disabled,
				owner: [...document.querySelectorAll('[data-owner]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')), theme: document.documentElement.getAttribute('data-theme') }));
			assert(g1.scope.join() === '親Aだけ*,親Aセット(x)' && /リーグ オブ ヒーローズ/.test(g1.set) && g1.uma === G0.id && !g1.dis && g1.owner.join() === '自分*,フレンド' && g1.theme === theme,
				tag + ' 登録の画面（1人）: 緑因子の名前から衣装が決まり・送り先は UmaStar のレース・持ち主は自分', g1);
			// T92-1: 読んでいない青・赤（null）は閉じた状態で、「要確認」に入れない
			const br = await ev(() => { const fz = (k) => document.querySelector('[data-act="toggle-' + k + '"]');
				return { b: fz('blue').textContent, r: fz('red').textContent, need: fz('blue').classList.contains('need') || fz('red').classList.contains('need'), pressed: fz('blue').getAttribute('aria-pressed') + fz('red').getAttribute('aria-pressed'),
					forms: document.querySelectorAll('[data-blue],[data-red],[data-bluestar],[data-redstar]').length, iss: (document.querySelector('section.card h2 .need') || {}).textContent || '', title: document.title, h1: document.querySelector('h1').textContent }; });
			assert(br.b === '—' && br.r === '—' && !br.need && br.pressed === 'falsefalse' && br.forms === 0 && !/青|赤/.test(br.iss) && br.title === 'Deck (αテスト) 登録' && br.h1 === 'Deck (αテスト)に登録',
				tag + ' 登録の画面: 読んでいない青・赤は閉じた状態（「—」）で「要確認」に入らない（T92-1）・題と見出しは「Deck (αテスト)」', br);
			await look('i-toroku-aoaka', { fullPage: true });
			await page.click('[data-owner="friend"]');
			await page.evaluate(() => document.querySelector('[data-owner]').scrollIntoView({ block: 'center' }));
			await look('b-owner');
			await page.click('#regBtn'); await page.waitForTimeout(200);
			const ok1 = await ev(() => ({ ok: (document.querySelector('.okbox') || {}).innerText || '', inbox: localStorage.getItem('umaDeck:send') }));
			assert(/^登録しました/.test(ok1.ok) && ok1.inbox === null, tag + ' 登録すると受け取りの口が消える', ok1);
			await page.click('a:has-text("Deck (αテスト)を開く")');
			await page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc, null, { timeout: 15000 }); await page.waitForTimeout(300);
			const d1 = await ev(() => { const S = window.__deckAlpha.S; const p = S.doc.parents[S.doc.parents.length - 1]; return { n: S.doc.parents.length, uma: p.uma, owner: p.owner, green: p.green, sets: p.sets, cols: document.querySelectorAll('.vh th[data-c]').length }; });
			assert(d1.n === 1 && d1.uma === G0.id && d1.owner === 'friend' && d1.green === 2 && d1.sets.join() === 'r:race-0002' && d1.cols === 1, tag + ' Deck α の表に入る（衣装・フレンド・緑の★・セット）', d1);

			// (2) 親と祖2人（3人）＋親Bセットも読めている: 小窓で親Aセットを選んで送る
			await openSpecial();
			await seed({ g0: G0.name, three: true, setB: true, c1: C1.name, c2: C2.name });
			await page.click('#deck-alpha-send-btn');
			const pop = await ev(() => { const bs = [...document.querySelectorAll('[data-deck-alpha-set]')]; let el = bs[0], t = false;
				for (let i = 0; el && i < 8 && !t; i++) { el = el.parentElement; t = !!el && /Deck \(αテスト\)に送る/.test(el.innerText); }
				return { labels: bs.map((b) => b.textContent).join(), title: t }; });
			assert(pop.labels === '親Aセット,親B' && pop.title, tag + ' 親Aセット・親Bセットの両方が読めているときは小窓「Deck (αテスト)に送る」で選ぶ（祖が無いセットは「親B」）', pop);
			await look('a2-send-choose');
			await page.click('[data-deck-alpha-set="0"]');
			const r2 = await sent();
			const ps = r2.j ? r2.j.persons : [];
			assert(r2.opened.length === 1 && ps.length === 3 && JSON.stringify(ps[1].green) === JSON.stringify([null, 3]) && JSON.stringify(ps[1].greenCands) === JSON.stringify([C1.name, C2.name]) && ps[2].green === null,
				tag + ' 3人を送る: 祖1 は名前が決まらず候補・祖2 は緑因子が読めない（null）', ps.map((p) => ({ g: p.green, c: p.greenCands })));
			await openReg();
			const g3 = await ev(() => ({ scope: [...document.querySelectorAll('#scopeSeg button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
				cards: document.querySelectorAll('section.card').length, cands: [...document.querySelectorAll('.cand')].map((b) => b.dataset.cand), need: document.getElementById('needTop').textContent,
				umas: window.__deckAlphaRegister.S.persons.map((p) => p.uma) }));
			assert(g3.scope.join() === '親Aだけ,親Aセット*' && g3.cards === 4 && g3.cands.join() === [C1.name, C2.name].join() && g3.umas[0] === G0.id && g3.umas[1] === null && g3.umas[2] === null && /^要確認 \d+/.test(g3.need),
				tag + ' 登録の画面（3人）: 祖1 は候補から選ぶ・祖2 は衣装が未定', g3);
			await look('d3-toroku-3nin', { fullPage: true });
			await page.click('.cand[data-cand="' + C1.name + '"]'); await page.waitForTimeout(150);
			await page.click('#body [data-nolink="0"]'); await page.waitForTimeout(100); // T115（363）: 親Aは1人目と全部同じなので「同一」を選んだ状態で出る。ここは新しい親の形を見る
			await page.click('#regBtn'); await page.waitForTimeout(200);
			await page.click('a:has-text("Deck (αテスト)を開く")');
			await page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc, null, { timeout: 15000 }); await page.waitForTimeout(300);
			const d3 = await ev(() => { const S = window.__deckAlpha.S; const p = S.doc.parents[S.doc.parents.length - 1]; return { n: S.doc.parents.length, gp: p.gp.map((g) => g.uma || null), owner: p.owner }; });
			assert(d3.n === 2 && d3.gp.length === 2 && d3.gp[0] === C1.id && d3.gp[1] === null && d3.owner === 'self', tag + ' 3人を登録すると Deck α に親と祖2人が入る', d3);

			// (3) Deck α: 「⋯」に案内が無い・ツール切り替えから UmaStar・UmaExam へ・テーマはツール間でそろう
			const pc = w > 720;
			await page.click(pc ? '#moreBtnPc' : '#moreBtn');
			const more = await ev(() => ({ t: document.getElementById('sheetIn').innerText, home: !!document.getElementById('homeGuide') }));
			assert(!more.home && !/ホーム画面|全部消す/.test(more.t) && /書き出す/.test(more.t), tag + ' 「⋯」に「ホーム画面に追加」の案内と「全部消す」が無い', more.t.slice(0, 200));
			await look('e-more', { fullPage: true });
			await ev(() => document.getElementById('scrim').click());
			await page.click('#toolBtn');
			const tl = await ev(() => ({ links: [...document.querySelectorAll('#sheetIn a[data-tool]')].map((a) => a.textContent + '>' + a.getAttribute('href')).join(), cur: (document.querySelector('#sheetIn .list b') || {}).textContent,
				title: document.title, h1: document.querySelector('h1').textContent }));
			assert(tl.links === 'UmaStar OCR>special.html,UmaExam>exam.html' && tl.cur === 'Deck (αテスト)' && tl.title === 'Deck (αテスト)' && tl.h1 === 'Deck (αテスト)',
				tag + ' Deck (αテスト) のツール切り替えから UmaStar・UmaExam へ（選択中の行・題・見出しは「Deck (αテスト)」）', tl);
			// Deck α で色を切り替えると、ほかのツールと同じ設定（uma-tools-theme）に入る
			await ev(() => document.getElementById('scrim').click());
			const other = theme === 'light' ? 'dark' : 'light';
			await page.click('#themeBtn'); await page.waitForTimeout(150);
			// T94（追加4）からボタンは svg で、アイコンは利用者の選択（data-theme-state）を示す
			const th1 = await ev(() => ({ attr: document.documentElement.getAttribute('data-theme'), saved: localStorage.getItem('uma-tools-theme'), btn: document.getElementById('themeBtn').getAttribute('data-theme-state') }));
			assert(th1.attr === other && th1.saved === other && th1.btn === other, tag + ' Deck α のライト／ダークのボタンは uma-tools-theme に書く（アイコンは選択を示す。T94）', th1);
			await page.goto(base + '/special.html', { waitUntil: 'load' }); await waitPageReady(page);
			for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
			const th2 = await ev(() => document.documentElement.getAttribute('data-theme'));
			assert(th2 === other, tag + ' UmaStar を開いても同じ色', th2);
			await ev(() => { window.UmaTheme.set('auto'); });
			// UmaStar のツール切り替えの「Deck α」
			await page.click('#tool-dropdown-btn');
			const row = await ev(() => { const a = document.getElementById('tool-deck-alpha'); const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), text: a.innerText.trim(), w: r.width, inView: r.right <= window.innerWidth && r.left >= 0 }; });
			assert(row.href === 'deck-alpha.html' && row.text === 'Deck (αテスト)' && row.w > 0 && row.inView, tag + ' UmaStar のツール切り替えに「Deck (αテスト)」の行', row);
			await look('h-tool');
			await page.click('#tool-deck-alpha');
			await page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc, null, { timeout: 15000 });
			const at = await ev(() => ({ url: location.pathname.split('/').pop() + location.search + location.hash, theme: document.documentElement.getAttribute('data-theme') }));
			assert(at.url === 'deck-alpha.html' && at.theme === theme, tag + ' 「Deck α」で deck-alpha.html が開く（色は OS の設定のまま）', at);

			assert(wide.length === 0, tag + ' どの場面でもページの横スクロールなし', wide);
			assert(errs.length === 0, tag + ' コンソールのエラー 0', errs);
			await ctx.close();
		});
	}
}
