// T108（2026-11-05 おいもさんの方針 (1)〜(5)・回答 289・292〜298）: UmaStar のレース欄の見直しの検査。
// run-smoke.mjs の末尾から register120() で呼ばれる（塊の見出しはすべて「T108」で始まる。`npm run test:visual -- --only=T108` で回せる）。
//
//  - 「指定なし」→「デフォルト」（動き・保存の形は今のまま）。上段はデフォルトで「レース指定」、新しいモードで「レース指定なし／本育成編成なし」（入らなければ「レース／本育成編成なし」）。
//  - 新しいモード: ①は押せない（中身は消さない）・右上の合計なし・②の継承固有／共通スキルは押せない・Pt の積み上げなし・距離／脚質／バ場は残る・オススメサポは出さない（T112・回答 329）・
//    脚質オススメは使える（緑スキル〔レース条件〕は空）・結合画像の設定の本育成編成／理論値SP は押せない。
//  - 脚質オススメと条件で検索の「サポカ外」からレース場の印を持つスキルを外す（292・294）。条件で検索の表示名は「サポカ外（レース場を除く）」。
//  - 条件で検索の「シナリオスキル」を選ぶとパッシブでも出す（293。「＋」の進化スキルは出さない）。
//  - Deck α: 「デフォルト」と、独立したまとまり「レース指定なし／本育成編成なし」（298）。
//  - ◎のモード（307）: 新しいモードでは押せない。戻すと押せる。保存の値は残る。
// スキル名・レース名は検査の側に書かない（恒久ルール1。データから引く）。T108_SHOTS=<フォルダ> で画像を残す。
import { reloadReady } from './lib/page-ready.mjs';
import { pickEntry } from './lib/entry-search.mjs';

const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
const R1 = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { style: 'senko' }, outsideOptions: { cards: ['card-0257', 'card-0402'] } };
const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const ALL = { marker: true, roster: true, factor: true, sp: true, table: true, title: true };
const LONG = 'レース指定なし／本育成編成なし', SHORT = 'レース／本育成編成なし';

export async function register120(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const SHOTS = process.env.T108_SHOTS || '';
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const closeNotices = async (page) => { for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {}); };
	const races = readJson('data/upcoming-races.json').races.filter((r) => r.selectable !== false);
	const RACE = races.find((r) => r.venue && r.distance) || races[0];
	const master = readJson('uma-skill-deck-skills.json');
	const TAGS = new Map((master.skills || master.entries || master).map((s) => [String(s.id), s.tags || {}]));
	const ns = readJson('data/non-support-skills.json');
	const NS_IDS = (ns.skillIds || ns.ids || ns.entries || []).map((e) => String(e.id || e.skillId || e));

	const shot = async (sp, name, w) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await sp.page.screenshot({ path: path.join(SHOTS, w + '-' + name + '.png') }); };
	const open = async ({ w = 390, h = 844, roster = R1, tab = 1, theme = null } = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		await sp.page.evaluate(({ tab, parts, roster, IDS, theme }) => {
			if (theme) localStorage.setItem('uma-tools-theme', theme);
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
			localStorage.setItem('uma-special-stitch-parts', JSON.stringify(parts));
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: IDS, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
		}, { tab, parts: ALL, roster, IDS, theme });
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(250);
		return sp;
	};
	/** 画面の状態を読む */
	const read = (page) => page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		const P = '#deck-template-panel ';
		const btn = q('#hdr-race-slot [data-usd-el="set-race-btn"]');
		const t = q('#hdr-race-slot [data-usd-el="set-race-text"]');
		const tab = q('#step-tab-0');
		const steps = [...document.querySelectorAll(P + '.usd-uniq-step')];
		const pts = [...document.querySelectorAll(P + '[data-usd-el="panel-pt"]')].map((e) => e.textContent.trim());
		const stitch = (k) => { const i = q('#opt-stitch-' + k); return { checked: i.checked, disabled: i.disabled, off: i.closest('.stitch-show-item').classList.contains('is-off') }; };
		return {
			text: t.textContent, on: btn.getAttribute('aria-pressed') === 'true', cut: t.scrollWidth > t.clientWidth + 1, title: btn.title,
			tabDisabled: tab.disabled, tabSelected: tab.getAttribute('aria-selected') === 'true', tabOpacity: parseFloat(getComputedStyle(tab).opacity), tabLabel: q('#step-tab-0 .step-tab-num').textContent,
			total: !!q('#deck-set-bar [data-usd-el="set-total"]'), totalVal: (q('#deck-set-bar [data-usd-el="set-total"]') || { getAttribute() { return null; } }).getAttribute('data-total'),
			factorPt: !!q(P + '[data-usd-el="factor-pt"]'), factorCount: (q(P + '[data-usd-el="factor-count"]') || {}).textContent, sumBtn: !!q(P + '[data-usd-el="pt-need-help-btn"]'),
			stepsDisabled: steps.length > 0 && steps.every((s) => s.disabled), stepsAnyDisabled: steps.some((s) => s.disabled), uniqOff: !!q(P + '.usd-uniq--off'), reset: !!q(P + '[data-usd-el="factor-reset"]'),
			pts, ptAny: pts.some((x) => x), filters: [...document.querySelectorAll(P + '[data-usd-el="factor-filter-row"] select')].map((s) => ({ disabled: s.disabled, value: s.value })),
			outside: q(P + '[data-usd-el="outside-open"]').hidden, style: q(P + '[data-usd-el="style-open"]').disabled,
			stitchRoster: stitch('roster'), stitchSp: stitch('sp'), stitchFactor: stitch('factor'), stitchTable: stitch('table'),
			now: stitchPartsNow(), saved: JSON.parse(localStorage.getItem('uma-special-stitch-parts')),
			sw: document.documentElement.scrollWidth, iw: window.innerWidth, badge: (q('#skill-count-badge') || {}).textContent
		};
	});
	const setMode = async (page, mode) => {
		await page.evaluate(({ mode, RACE }) => { const o = UmaSkillDeckCore.outside; if (mode === 'noplan') o.setNoPlan(); else o.setRace(mode === 'race' ? RACE : null); }, { mode, RACE });
		await page.waitForTimeout(300);
	};
	const pickRaceInList = async (page, id) => {
		await page.click('#hdr-race-slot [data-usd-el="set-race-btn"]');
		await page.waitForSelector('[data-usd-el="race-list"]');
		await page.click('[data-usd-el="race-opt"][data-race-id="' + id + '"]');
		await page.waitForTimeout(300);
	};

	for (const [w, h] of [[390, 844], [360, 740], [320, 568], [1280, 800]]) {
		await block('T108 3通りの状態（' + w + 'px）: デフォルト・新しいモード・レース', async () => {
			const tag = 'T108 ' + w + 'px ';
			const sp = await open({ w, h });
			const d0 = await read(sp.page);
			assert(d0.text === 'レース指定' && !d0.on && d0.title === 'レース指定', tag + 'デフォルトの上段は「レース指定」', d0.text);
			assert(!d0.tabDisabled && d0.tabOpacity === 1 && d0.total && d0.factorPt && d0.sumBtn && !d0.stepsAnyDisabled && !d0.uniqOff && !d0.outside && !d0.style && d0.ptAny, tag + 'デフォルト: ①・右上の合計・②の Pt・継承固有・オススメサポは今のまま', d0);
			assert(!d0.stitchRoster.disabled && !d0.stitchSp.disabled && d0.stitchRoster.checked && d0.stitchSp.checked, tag + 'デフォルト: 結合画像の設定は今のまま', d0.stitchRoster);

			// 選択欄の並び（296）
			await sp.page.click('#hdr-race-slot [data-usd-el="set-race-btn"]');
			await sp.page.waitForSelector('[data-usd-el="race-list"]');
			const rows = await sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="race-opt"]')].map((r) => ({ id: r.getAttribute('data-race-id'), text: r.textContent.trim(), checked: r.querySelector('input').checked })));
			assert(rows[0].text === 'デフォルト' && rows[0].checked && rows[1].text === LONG && !rows[1].checked && rows.length === races.length + 2, tag + '並びは デフォルト → ' + LONG + ' → レースの一覧', rows.slice(0, 3));
			await shot(sp, 'race-list', w);
			await sp.page.click('[data-usd-el="race-opt"][data-race-id="no-plan"]');
			await sp.page.waitForTimeout(300);

			const n = await read(sp.page);
			const expectText = w >= 640 ? LONG : null;
			assert(n.on && (expectText ? n.text === LONG : (n.text === LONG || n.text === SHORT)) && n.title === LONG, tag + '新しいモードの上段', { text: n.text, title: n.title });
			assert(n.sw <= n.iw + 1, tag + '新しいモードで横にはみ出さない', [n.sw, n.iw]);
			assert(n.tabDisabled && n.tabOpacity < 1 && !n.tabSelected && n.tabLabel === '1', tag + '①のタブは薄く押せない（丸数字は変えない）', n);
			assert(!n.total && n.totalVal === null, tag + '右上の SP と種類数を出さない', n.total);
			assert(n.stepsDisabled && n.uniqOff && !n.factorPt && !n.sumBtn && n.factorCount === '12' && n.reset, tag + '②: 継承固有・共通スキルは押せない・Pt を積み上げない・種は②のスキルだけ（継承固有を足さない）・↺ は残る', n);
			assert(!n.ptAny, tag + '②の行の Pt を出さない', n.pts);
			assert(n.filters.length === 3 && n.filters.every((f) => !f.disabled), tag + '②の距離・脚質・バ場は残る（選べる）', n.filters);
			assert(n.outside && !n.style, tag + 'オススメサポは出さない（T112・329）・脚質オススメは押せる（289）', [n.outside, n.style]);
			assert(n.stitchRoster.disabled && n.stitchRoster.off && !n.stitchRoster.checked && n.stitchSp.disabled && n.stitchSp.off && !n.stitchSp.checked, tag + '結合画像の設定: 本育成編成・理論値SP は押せない', [n.stitchRoster, n.stitchSp]);
			assert(!n.stitchFactor.disabled && n.stitchFactor.checked && !n.stitchTable.disabled && n.stitchTable.checked, tag + '結合画像の設定: 因子周回編成・星取表は今のまま', [n.stitchFactor, n.stitchTable]);
			assert(n.now.roster === false && n.now.sp === false && n.saved.roster === true && n.saved.sp === true, tag + '結合画像に使う設定は OFF・保存値は変えない', [n.now, n.saved]);
			if (w === 390 || w === 1280) {
				await shot(sp, 'noplan-factor', w);
				await sp.page.evaluate(() => selectStepTab(2));
				await sp.page.waitForTimeout(200);
				await shot(sp, 'noplan-stitch-settings', w);
				await sp.page.evaluate(() => selectStepTab(1));
			}

			// ①は押しても開かない
			await sp.page.evaluate(() => selectStepTab(0));
			const sel0 = await sp.page.evaluate(() => document.getElementById('step-panel-0').hidden && !document.getElementById('step-panel-1').hidden);
			assert(sel0, tag + '①は開かない（②のまま）', sel0);

			// 保存の形
			const saved1 = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));
			assert(saved1.noPlan === true && saved1.race === undefined && saved1.umaId === R1.umaId && saved1.cardIds.slice().sort().join() === R1.cardIds.slice().sort().join(), tag + '保存は noPlan だけ足す・①の中身は消さない', saved1);

			// レース → ①が戻る
			await pickRaceInList(sp.page, RACE.id);
			const r = await read(sp.page);
			assert(r.on && r.text !== LONG && r.text !== 'レース指定' && !r.tabDisabled && r.total && !r.outside && !r.stitchRoster.disabled, tag + 'レースを選ぶと今までどおり', r.text);
			const saved2 = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));
			assert(saved2.noPlan === undefined && saved2.race && saved2.race.id === RACE.id, tag + 'レースを選ぶと noPlan は消える', Object.keys(saved2));
			if (w === 390 || w === 1280) await shot(sp, 'race-factor', w);

			// デフォルトへ戻す → 計算が元と同じ
			await sp.page.click('#hdr-race-slot [data-usd-el="set-race-btn"]');
			await sp.page.waitForSelector('[data-usd-el="race-list"]');
			await sp.page.click('[data-usd-el="race-opt"][data-race-id=""]');
			await sp.page.waitForTimeout(300);
			const d1 = await read(sp.page);
			assert(d1.text === 'レース指定' && d1.totalVal === d0.totalVal && d1.factorCount === d0.factorCount && d1.pts.join() === d0.pts.join(), tag + 'デフォルトに戻すと合計も行の Pt も元どおり', [d0.totalVal, d1.totalVal]);
			const saved3 = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));
			assert(saved3.noPlan === undefined && saved3.race === undefined && saved3.umaId === R1.umaId, tag + 'デフォルトでは今までの形（race も noPlan も無い）', Object.keys(saved3));
			if (w === 390 || w === 1280) {
				await shot(sp, 'default-factor', w);
				await sp.page.evaluate(() => selectStepTab(0));
				await sp.page.waitForTimeout(200);
				await shot(sp, 'default-roster', w);
			}
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	// 画像だけ（T108_SHOTS のとき。恒久の作法: 1280・390・360px × ライト・ダーク）
	if (SHOTS) await block('T108 画像: 新しいモードの②と③（1280・390・360px × ライト・ダーク）', async () => {
		for (const [w, h] of [[1280, 800], [390, 844], [360, 740]]) for (const theme of ['light', 'dark']) {
			const sp = await open({ w, h, theme });
			await setMode(sp.page, 'noplan');
			await shot(sp, theme + '-noplan-factor', w);
			await sp.page.evaluate(() => selectStepTab(2));
			await sp.page.waitForTimeout(200);
			await shot(sp, theme + '-noplan-stitch-settings', w);
			const r = await sp.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
			assert(r.sw <= r.iw + 1, 'T108 画像 ' + w + 'px ' + theme + ' 横にはみ出さない', r);
			await sp.ctx.close();
		}
	});

	// 画像だけ（T108_SHOTS のとき）: デフォルト・レース・新しいモードの③の設定・①・条件で検索
	if (SHOTS) await block('T108 画像: 3通りの③の設定・①・条件で検索（390・1280px）', async () => {
		for (const [w, h] of [[390, 844], [1280, 800]]) for (const mode of ['default', 'race', 'noplan']) {
			const sp = await open({ w, h });
			await setMode(sp.page, mode);
			await sp.page.evaluate(() => selectStepTab(2));
			await sp.page.waitForTimeout(200);
			await shot(sp, mode + '-stitch-settings', w);
			await sp.page.evaluate(() => selectStepTab(0));
			await sp.page.waitForTimeout(250);
			await shot(sp, mode + '-tab1-roster', w);
			await sp.page.evaluate(() => selectStepTab(1));
			await sp.page.waitForTimeout(150);
			await pickEntry(sp.page, 'editor-pick');
			await sp.page.waitForTimeout(400);
			await shot(sp, mode + '-search', w);
			await sp.ctx.close();
		}
	});

	await block('T108 ◎のモード（307）: 新しいモードでは押せない・戻すと押せる・保存の値は残る', async () => {
		for (const w of [390, 1280]) {
			const tag = 'T108 ◎ ' + w + 'px ';
			const sp = await open({ w, h: 844 });
			const P = '#deck-template-panel ';
			const BTN = P + '[data-usd-el="factor-circle-mode"]';
			const state = () => sp.page.evaluate(({ BTN, P }) => {
				const b = document.querySelector(BTN);
				const scope = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}');
				const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || '{}');
				return { has: !!b, disabled: !!b && b.disabled, pressed: b && b.getAttribute('aria-pressed'), opacity: b ? parseFloat(getComputedStyle(b).opacity) : null, cursor: b ? getComputedStyle(b).cursor : null,
					toggles: document.querySelectorAll(P + '[data-usd-el="factor-circle-toggle"]').length, cls: document.querySelector(P + '[data-usd-el="skill-group"]').classList.contains('usd-skillgroup--circle'),
					keep: JSON.stringify([scope.keepCircleIds || [], roster.keepCircleIds || []]) };
			}, { BTN, P });
			const a = await state();
			assert(a.has && !a.disabled && a.opacity === 1 && a.pressed === 'false', tag + 'デフォルト: 押せる', a);
			await sp.page.click(BTN);
			await sp.page.waitForTimeout(250);
			const b = await state();
			assert(b.pressed === 'true' && b.toggles > 0 && b.cls, tag + 'デフォルト: 押すとモードに入る', b);
			await sp.page.click(P + '[data-usd-el="factor-circle-toggle"]');
			await sp.page.waitForTimeout(250);
			const saved = await state();
			assert(saved.keep !== a.keep, tag + '前提: ◎を○に変えると値が保存される', saved.keep);
			// モードに入ったまま新しいモードへ
			await setMode(sp.page, 'noplan');
			const c = await state();
			assert(c.has && c.disabled && c.opacity < 1 && c.cursor === 'not-allowed' && c.pressed === 'false' && c.toggles === 0 && !c.cls, tag + '新しいモード: 薄く押せない・入っていたモードは切れる', c);
			assert(c.keep === saved.keep, tag + '新しいモード: 保存の値は消えない', [saved.keep, c.keep]);
			await sp.page.evaluate((BTN) => document.querySelector(BTN).click(), BTN);
			await sp.page.waitForTimeout(150);
			const d = await state();
			assert(d.pressed === 'false' && d.toggles === 0, tag + '新しいモード: 押しても入らない', d);
			// 表の並べ替えの小窓からも入れない
			await sp.page.click(P + '[data-usd-el="factor-view"]');
			await sp.page.waitForTimeout(250);
			await sp.page.click(P + '[data-usd-el="tone-sort-entry"][data-usd-where="factor"]');
			await sp.page.waitForSelector('[data-usd-el="tone-sort-pick"][data-tone="circle"]');
			const pick = await sp.page.evaluate(() => document.querySelector('[data-usd-el="tone-sort-pick"][data-tone="circle"]').disabled);
			assert(pick, tag + '新しいモード: 表の並べ替えの◎も選べない', pick);
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(150);
			await setMode(sp.page, 'default');
			await sp.page.click(P + '[data-usd-el="tone-sort-entry"][data-usd-where="factor"]');
			await sp.page.waitForSelector('[data-usd-el="tone-sort-pick"][data-tone="circle"]');
			const pick2 = await sp.page.evaluate(() => document.querySelector('[data-usd-el="tone-sort-pick"][data-tone="circle"]').disabled);
			assert(!pick2, tag + 'デフォルト: 表の並べ替えの◎を選べる', pick2);
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(150);
			const e = await state();
			assert(e.has && !e.disabled && e.opacity === 1 && e.keep === saved.keep, tag + 'デフォルトに戻すと押せる・値はそのまま', e);
			await sp.page.click(BTN);
			await sp.page.waitForTimeout(250);
			const f = await state();
			const marks = await sp.page.evaluate((P) => [...document.querySelectorAll(P + '[data-usd-el="factor-circle-toggle"]')].filter((t) => t.getAttribute('aria-pressed') === 'false').length, P);
			assert(f.pressed === 'true' && f.toggles === b.toggles && marks >= 1, tag + '戻してモードに入ると、○にした行は○のまま', { f, marks });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T108 上段: 入らない幅では短い形（文字を詰めて入れる）・FAB は短い形', async () => {
		const sp = await open({ w: 320, h: 568 });
		await setMode(sp.page, 'noplan');
		const a = await read(sp.page);
		assert(a.text === SHORT, 'T108 320px は「' + SHORT + '」', a.text);
		const fab = await sp.page.evaluate(() => { fabSyncSetItems(); const t = document.getElementById('fab-race-text'); return { text: t.textContent, hidden: t.hidden }; });
		assert(!fab.hidden && fab.text === SHORT, 'T108 FAB のレースの脇は短い形', fab);
		await sp.ctx.close();
	});

	await block('T108 再読み込み・①を開いていたとき: 新しいモードは保存され、①は開かず②が出る', async () => {
		const sp = await open({ w: 390, tab: 0 });
		const a = await sp.page.evaluate(() => document.getElementById('step-tab-0').getAttribute('aria-selected'));
		assert(a === 'true', 'T108 前提: ①を開いている', a);
		await setMode(sp.page, 'noplan');
		const b = await sp.page.evaluate(() => ({ p0: document.getElementById('step-panel-0').hidden, p1: document.getElementById('step-panel-1').hidden, saved: localStorage.getItem('umaSkillDeck:stepTab') }));
		assert(b.p0 && !b.p1, 'T108 ①を開いているときに選ぶと②へ移る', b);
		assert(b.saved === '0', 'T108 タブの記憶は書き換えない', b.saved);
		await sp.page.reload();
		await sp.page.waitForFunction(() => typeof deckTemplateManager !== 'undefined' && deckTemplateManager);
		await sp.page.waitForTimeout(800);
		await closeNotices(sp.page);
		const c = await read(sp.page);
		const p = await sp.page.evaluate(() => ({ p0: document.getElementById('step-panel-0').hidden, p1: document.getElementById('step-panel-1').hidden }));
		assert(c.text !== 'レース指定' && c.on && c.tabDisabled && p.p0 && !p.p1 && !c.total, 'T108 再読み込みしても新しいモードのまま・②が出る', [c.text, p]);
		// キーでも①へ行かない
		await sp.page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'Home', bubbles: true }); document.querySelector('.step-tabs').dispatchEvent(e); });
		const k = await sp.page.evaluate(() => document.getElementById('step-panel-0').hidden);
		assert(k, 'T108 Home キーでも①を開かない', k);
		assert(jsErrors(sp.errors).length === 0, 'T108 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T108 ①の割引を②に入れない・①で得るスキルを選べなくしない', async () => {
		const sp = await open({ w: 390 });
		const ids = () => sp.page.evaluate(() => {
			const s = deckTemplateManager.getSetSummary();
			return { noPlan: s.noPlan, rosterPt: s.rosterPt, rosterKinds: s.rosterKinds, uniqKinds: s.uniqKinds, status: s.statusLabel, kinds: s.factorKinds };
		});
		const a = await ids();
		assert(a.noPlan === false && a.uniqKinds > 0, 'T108 デフォルトは継承固有を数える', a);
		await setMode(sp.page, 'noplan');
		const b = await ids();
		assert(b.noPlan === true && b.rosterPt === 0 && b.rosterKinds === 0 && b.uniqKinds === 0 && b.status === '' && b.kinds === 12, 'T108 新しいモードは①（切れ者などの状態を含む）を数えない', b);
		const stitch = await sp.page.evaluate(() => captureStitchSetPart());
		assert(stitch.umaId === null && stitch.rosterCards.length === 0 && stitch.sp === null && stitch.factorCards.length === 2, 'T108 結合画像の写しに①と理論値SP を入れない・因子周回のカードは入れる', stitch);
		await setMode(sp.page, 'default');
		const stitch2 = await sp.page.evaluate(() => captureStitchSetPart());
		assert(stitch2.umaId === R1.umaId && stitch2.rosterCards.length === 6 && stitch2.sp !== null, 'T108 デフォルトの写しは今のまま', stitch2.umaId);
		await sp.ctx.close();
	});

	await block('T108 脚質オススメ: 残る・レース：デフォルト・サポカ外からレース場を外す・緑スキルの項目は新しいモードで空', async () => {
		const venueIds = NS_IDS.filter((id) => ((TAGS.get(id) || {}).trackVenue || []).length > 0);
		assert(venueIds.length > 0, 'T108 前提: サポカ外の一覧にレース場の印のスキルがある（' + venueIds.length + '種）', venueIds.length);
		for (const w of [390, 1280]) {
			const sp = await open({ w, roster: { umaId: 'uma-0001', cardIds: CARDS6 } });
			const P = '[data-usd-el="style-modal"] ';
			const rowsOf = (key) => sp.page.evaluate(([P, key]) => [...document.querySelectorAll(P + '[data-section="' + key + '"] [data-usd-el="style-row"]')].map((r) => r.getAttribute('data-skill-id')), [P, key]);
			const openStyle = async () => { await sp.page.click('#deck-template-panel [data-usd-el="style-open"]'); await sp.page.waitForSelector(P + '[data-usd-el="style-top"] button'); await sp.page.waitForTimeout(250); };
			const closeStyle = async () => { await sp.page.click(P + '[data-usd-el="style-close"]'); await sp.page.waitForTimeout(150); };
			await openStyle();
			const t0 = await sp.page.evaluate((P) => document.querySelector(P + '[data-usd-el="style-race-text"]').textContent, P);
			assert(t0 === 'レース：デフォルト', 'T108 ' + w + 'px 脚質オススメの「レース：デフォルト」', t0);
			const out0 = await rowsOf('outside');
			assert(out0.length > 0 && out0.every((id) => !venueIds.includes(id)), 'T108 ' + w + 'px デフォルト: サポカ外の項目にレース場の印が無い（' + out0.length + '種）', out0.filter((id) => venueIds.includes(id)));
			await shot(sp, 'default-style', w);
			await closeStyle();

			// 開催場の一致するスキルがあるレース: 緑スキルの項目に今までどおり出る
			// 今の一覧に合うレースが無くても確かめられるよう、無ければ条件のレース場だけ差し替えた行を使う（一覧の外のレースも同じ条件で読む）
			const raceV = races.find((r) => r.venue && venueIds.some((id) => (TAGS.get(id).trackVenue || []).includes(r.venue))) || Object.assign({}, RACE, { id: 'race-t108', venue: TAGS.get(venueIds[0]).trackVenue[0] });
			{
				await sp.page.evaluate((r) => UmaSkillDeckCore.outside.setRace(r), raceV);
				await sp.page.waitForTimeout(250);
				await openStyle();
				const green = await rowsOf('green');
				const out1 = await rowsOf('outside');
				const hit = venueIds.filter((id) => (TAGS.get(id).trackVenue || []).includes(raceV.venue));
				assert(hit.some((id) => green.includes(id)) && out1.every((id) => !venueIds.includes(id)), 'T108 ' + w + 'px レース: 合うレース場は緑スキルの項目に出て、サポカ外の項目には出ない', { hit, green: green.length });
				await shot(sp, 'race-style', w);
				await closeStyle();
			}

			await setMode(sp.page, 'noplan');
			await openStyle();
			const m = await sp.page.evaluate((P) => ({
				text: document.querySelector(P + '[data-usd-el="style-race-text"]').textContent,
				title: document.querySelector(P + '[data-usd-el="style-race-btn"]').title,
				sync: !!document.querySelector(P + '[data-usd-el="style-sync"]'),
				note: (document.querySelector(P + '[data-section="green"] [data-usd-el="style-sec-note"]') || {}).textContent,
				pts: [...document.querySelectorAll(P + '[data-usd-el="style-row-pt"]')].map((e) => e.textContent).filter((x) => /Pt/.test(x)),
				head: document.querySelector(P + '[data-usd-el="style-head"]').textContent,
				sw: document.querySelector(P + '.usd-sty-top').scrollWidth - document.querySelector(P + '.usd-sty-top').clientWidth
			}), P);
			assert(m.text === SHORT && m.title === LONG, 'T108 ' + w + 'px 新しいモードの脚質オススメのボタン', m.text);
			assert((await rowsOf('green')).length === 0 && m.note === 'レースを選ぶと出ます', 'T108 ' + w + 'px 緑スキル（レース条件）の項目は空（289）', m.note);
			assert((await rowsOf('scenario')).length + (await rowsOf('outside')).length > 0, 'T108 ' + w + 'px ほかの項目は使える（289）', true);
			assert(m.pts.length === 0 && !/Pt/.test(m.head), 'T108 ' + w + 'px 新しいモードでは Pt を出さない', [m.pts.slice(0, 2), m.head]);
			assert(!m.sync, 'T108 ' + w + 'px 新しいモードでは「①にも反映」の文を出さない', m.sync);
			assert(m.sw <= 1, 'T108 ' + w + 'px 上の欄が横にはみ出さない', m.sw);
			await shot(sp, 'noplan-style', w);
			await closeStyle();
			assert(jsErrors(sp.errors).length === 0, 'T108 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T108 条件で検索: サポカ外（レース場を除く）・シナリオスキルはパッシブでも出す（＋は出さない）', async () => {
		const ext = readJson('data/extended-skills.json');
		const scenPassive = [...TAGS.entries()].filter(([, t]) => (t.scenario || []).includes('scenario') && (t.passive || []).length > 0).map(([id]) => id);
		const scenAll = [...TAGS.entries()].filter(([, t]) => (t.scenario || []).includes('scenario')).map(([id]) => id);
		const evolved = (ext.entries || ext.skills || []).filter((e) => e.tags && (e.tags.scenario || []).includes('scenario') && /\+$/.test(e.name)).map((e) => e.id);
		assert(scenPassive.length > 0 && evolved.length > 0, 'T108 前提: パッシブのシナリオスキルと「＋」のスキルがデータにある', [scenPassive, evolved.length]);
		const WANT_NS = NS_IDS.filter((id) => { const t = TAGS.get(id) || {}; return !(t.scenario || []).includes('scenario') && (t.trackVenue || []).length === 0; });
		for (const w of [390, 1280]) {
			const sp = await open({ w, roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null] } });
			await sp.page.evaluate(() => { const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')); r.skillIds = []; localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(r)); });
			await reloadReady(sp.page);
			await closeNotices(sp.page);
			await pickEntry(sp.page, 'editor-pick');
			await sp.page.waitForTimeout(400);
			const check = (value, on = true) => sp.page.evaluate(({ value, on }) => { const c = document.querySelector('[data-usd-el="filter-check"][data-axis="scenario"][data-value="' + value + '"]'); if (c && c.checked !== on) c.click(); }, { value, on });
			const got = () => sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="results"] label.usd-row input')].map((i) => i.value));
			const opt = await sp.page.evaluate(() => { const c = document.querySelector('[data-usd-el="filter-check"][data-axis="scenario"][data-value="non_support"]'); return c.closest('label').textContent.trim(); });
			assert(opt === 'サポカ外（レース場を除く）', 'T108 ' + w + 'px 表示名', opt);
			await check('non_support');
			await sp.page.waitForTimeout(800);
			const a = await got();
			const master = a.filter((id) => TAGS.has(id));
			assert(a.every((id) => !TAGS.has(id) || ((TAGS.get(id).trackVenue || []).length === 0)), 'T108 ' + w + 'px サポカ外の一覧にレース場の印が無い（' + a.length + '種）', a.filter((id) => TAGS.has(id) && (TAGS.get(id).trackVenue || []).length));
			assert(WANT_NS.every((id) => a.includes(id)), 'T108 ' + w + 'px 外したのはレース場の印だけ（' + WANT_NS.length + '種は残る）', WANT_NS.filter((id) => !a.includes(id)).slice(0, 5));
			assert(master.length > 0, 'T108 前提: 一覧がある', master.length);
			const panelSw = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="picker-body"]'); return b.scrollWidth - b.clientWidth; });
			assert(panelSw <= 1, 'T108 ' + w + 'px 長くなった表示名で小窓が横にはみ出さない', panelSw);
			if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sp.page.screenshot({ path: path.join(SHOTS, w + '-search-nonsupport.png') }); }
			await check('non_support', false);
			await check('scenario');
			await sp.page.waitForTimeout(400);
			const b = await got();
			assert(scenPassive.every((id) => b.includes(id)), 'T108 ' + w + 'px シナリオスキルを選ぶとパッシブのシナリオスキルも出る', scenPassive);
			assert(scenAll.every((id) => b.includes(id)), 'T108 ' + w + 'px シナリオスキルは全部出る（' + scenAll.length + '種）', scenAll.filter((id) => !b.includes(id)));
			assert(evolved.every((id) => !b.includes(id)), 'T108 ' + w + 'px 「＋」の進化スキルは出ない', evolved.filter((id) => b.includes(id)));
			if (SHOTS) await sp.page.screenshot({ path: path.join(SHOTS, w + '-search-scenario.png') });
			await check('scenario', false);
			await sp.page.waitForTimeout(400);
			const c = await got();
			assert(scenPassive.every((id) => !c.includes(id)), 'T108 ' + w + 'px シナリオスキルを選んでいなければパッシブは今までどおり出ない', scenPassive.filter((id) => c.includes(id)));
			assert(jsErrors(sp.errors).length === 0, 'T108 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T108 送る形: 新しいモードだけ noPlan が付く', async () => {
		const sp = await open({ w: 390 });
		const send = async () => sp.page.evaluate(() => { const r = deckAlphaSendIndexes; deckAlphaSendIndexes = () => [0]; const out = buildDeckAlphaSend(0); deckAlphaSendIndexes = r; return { noPlan: out.noPlan, race: out.race, style: out.style, keys: Object.keys(out) }; });
		const a = await send();
		assert(a.noPlan === undefined && !a.keys.includes('noPlan') && a.race === null, 'T108 デフォルトは今の形（noPlan を持たない）', a);
		await setMode(sp.page, 'noplan');
		const b = await send();
		assert(b.noPlan === true && b.race === null && b.style === 'senko', 'T108 新しいモードは noPlan: true（脚質は今までどおり）', b);
		await setMode(sp.page, 'race');
		const c = await send();
		assert(c.noPlan === undefined && c.race === RACE.id, 'T108 レースは今の形', c);
		await sp.ctx.close();
	});

	// Deck α
	const sizes = { 390: { width: 390, height: 844, isMobile: true, hasTouch: true }, 1280: { width: 1280, height: 800 } };
	const openDeck = async (w) => {
		const sz = sizes[w];
		const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: 1, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, colorScheme: 'light' });
		const page = await ctx.newPage();
		const errs = [];
		page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
		page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
		const ev = (f, a) => page.evaluate(f, a);
		const deck = async () => { await page.goto(base + '/deck-alpha.html'); await page.waitForFunction(() => window.__deckAlpha && window.__deckAlpha.S.doc && (document.querySelector('.vh, canvas.ov, .stage .empty')), null, { timeout: 15000 }); await page.waitForTimeout(150); };
		const seed = async (n) => {
			await deck();
			await page.addScriptTag({ url: base + '/tests/visual/deck-alpha-mock.js' });
			await ev(async (x) => { const d = window.__deckAlphaMock.makeMock(x, 11); delete d.none; await window.DeckAlpha.store.replaceAll(d); await window.DeckAlpha.store.putMeta('settings', Object.assign({}, window.DeckAlpha.DEFAULT_SETTINGS)); }, n);
			await deck();
		};
		const send = (o) => ev((x) => localStorage.setItem('umaDeck:send', JSON.stringify(Object.assign({ format: 'uma-deck-send', v: 1, sentAt: new Date().toISOString(), race: null, style: null, owner: 'self' }, x))), o);
		const reg = async () => { await page.goto(base + '/deck-alpha-register.html'); await page.waitForFunction(() => window.__deckAlphaRegister && window.__deckAlphaRegister.S.doc, null, { timeout: 15000 }); await page.waitForTimeout(150); };
		const doReg = async () => { await page.click('#regBtn'); await page.waitForFunction(() => window.__deckAlphaRegister.S.done, null, { timeout: 8000 }); await page.waitForTimeout(150); };
		const pic = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, w + '-deck-' + name + '.png') }); };
		return { ctx, page, errs, ev, deck, seed, send, reg, doReg, pic };
	};
	const SKILLS = Object.fromEntries(['1', '2', '3', '4', '5'].map((id) => [id, 2]));
	const person = (uma, extra) => Object.assign({ uma, green: null, greenCands: null, blue: ['speed', 3], red: ['medium', 2], skills: SKILLS, genes: {} }, extra || {});
	for (const w of [390, 1280]) {
		await block('T108 Deck α（' + w + 'px）: デフォルトと独立したまとまり', async () => {
			const tag = 'T108 Deck α ' + w + 'px ';
			const T = await openDeck(w);
			await T.seed(14);
			const uma = await T.ev(() => window.DeckAlpha.D.costumes[0].id);
			const s0 = await T.ev(() => ({ text: document.getElementById('setText').textContent, aria: document.getElementById('setBtn').getAttribute('aria-label'), parents: window.__deckAlpha.S.doc.parents.length, norace: window.__deckAlpha.S.doc.norace, cnt: document.querySelector('.vc .cnt').textContent }));
			assert(s0.text === 'デフォルト' && s0.aria === 'レース/周回セット：デフォルト' && s0.norace === undefined, tag + '見出しは「デフォルト」・既存のデータに norace を補わない', s0);
			await T.page.click('#setBtn');
			await T.page.waitForSelector('.rlist');
			const list = await T.ev(() => [...document.querySelectorAll('.rlist .ropt')].slice(0, 2).map((o) => o.querySelector('.l1').textContent + '|' + (o.querySelector('.rn') || {}).textContent));
			assert(list[0] === 'デフォルト|親' + s0.parents + '人' && list[1] === LONG + '|親0人', tag + '選択欄の並び', list);
			await T.pic('set-list-before');
			await T.page.keyboard.press('Escape');

			// 新しいモードから送る
			await T.send({ from: 'star', noPlan: true, style: 'senko', send: ['1', '2', '3', '4', '5'], persons: [person(uma)] });
			await T.reg();
			const r0 = await T.ev(() => ({ key: window.__deckAlphaRegister.S.setKey, text: document.querySelector('#setPick .t').textContent }));
			assert(r0.key === 'norace' && r0.text === LONG, tag + '登録の画面の初期値は独立したまとまり', r0);
			await T.pic('register');
			await T.doReg();
			const head = await T.ev(async () => { const l = await window.DeckAlpha.store.load(); return { norace: l.head && l.head.norace }; });
			await T.deck();
			const s1 = await T.ev(() => { const a = window.__deckAlpha, S = a.S; const p = S.doc.parents[S.doc.parents.length - 1]; return { cur: S.settings.cur, text: document.getElementById('setText').textContent, from: p.from, sets: p.sets, norace: S.doc.norace, rows: Object.keys(S.doc.norace ? S.doc.norace.skills : {}), cnt: document.querySelector('.vc .cnt').textContent, n: S.doc.parents.length }; });
			assert(s1.cur === 'norace' && s1.from === 'norace' && s1.sets.join() === 'norace' && s1.norace && s1.norace.sends === 1 && s1.rows.length === 5, tag + '親は独立したまとまりに入る・一覧も別', s1);
			assert(/^1人/.test(s1.cnt) && /5種/.test(s1.cnt), tag + '表はそのまとまりの親と一覧だけ', s1.cnt);
			assert(w >= 640 ? s1.text === LONG : s1.text === SHORT, tag + '見出しの表記（PC は長い形・スマホは短い形）', s1.text);
			const hd = await T.ev(() => { const t = document.getElementById('setText'); return { cut: t.scrollWidth > t.clientWidth + 1, h: Math.round(document.getElementById('setBtn').getBoundingClientRect().height), sw: document.documentElement.scrollWidth, iw: window.innerWidth }; });
			assert(!hd.cut && hd.h <= 37 && hd.sw <= hd.iw + 1, tag + '見出しは切れない・高さは今のまま（スマホは2行）', hd);
			await T.pic('norace-table');

			// デフォルトに出ない
			await T.page.click('#setBtn');
			await T.page.waitForSelector('.rlist');
			const list2 = await T.ev(() => [...document.querySelectorAll('.rlist .ropt')].slice(0, 2).map((o) => (o.querySelector('.rn') || {}).textContent));
			assert(list2[0] === '親' + s0.parents + '人' && list2[1] === '親1人', tag + '数: デフォルトは変わらず・新しいまとまりは1人', list2);
			await T.pic('set-list-after');
			await T.page.click('.rlist input[value="none"]', { force: true });
			await T.page.waitForTimeout(250);
			const s2 = await T.ev(() => ({ text: document.getElementById('setText').textContent, cnt: document.querySelector('.vc .cnt').textContent, none: window.__deckAlpha.S.doc.none }));
			assert(s2.text === 'デフォルト' && s2.cnt.indexOf(s0.parents + '人') === 0 && s2.cnt === s0.cnt && s2.none === undefined, tag + 'デフォルトの表は今のまま（親も行も増えない・一覧も作らない）', [s0.cnt, s2.cnt]);
			await T.pic('default-table');

			// 書き出しと読み込み
			const io = await T.ev(() => { const K = window.DeckAlpha; const j = K.buildExport(window.__deckAlpha.S.doc); const r = K.parseImport(JSON.stringify(j)); return { has: !!j.norace, back: r.doc && r.doc.norace && r.doc.norace.sends, err: r.error, old: (() => { const k = JSON.parse(JSON.stringify(j)); delete k.norace; const x = K.parseImport(JSON.stringify(k)); return x.doc && x.doc.norace === undefined; })() }; });
			assert(io.has && io.back === 1 && io.old, tag + '書き出し・読み込みで戻る・無い形のファイルも読める', io);

			// デフォルトで送ると今までどおり
			await T.send({ from: 'star', style: null, send: ['6', '7'], persons: [person(uma)] });
			await T.reg();
			const r1 = await T.ev(() => ({ key: window.__deckAlphaRegister.S.setKey, text: document.querySelector('#setPick .t').textContent }));
			assert(r1.key === 'none' && r1.text === 'デフォルト', tag + 'デフォルトから送ると「デフォルト」', r1);
			await T.doReg();
			await T.deck();
			const s3 = await T.ev(() => { const S = window.__deckAlpha.S; const p = S.doc.parents[S.doc.parents.length - 1]; return { from: p.from, sets: p.sets, cur: S.settings.cur, none: S.doc.none && Object.keys(S.doc.none.skills).length, nr: Object.keys(S.doc.norace.skills).length }; });
			assert(s3.from === undefined && s3.sets.length === 0 && s3.cur === 'none' && s3.none === 2 && s3.nr === 5, tag + 'デフォルトの親と一覧は今の形', s3);
			assert(T.errs.filter((m) => !/404/.test(m)).length === 0, tag + 'コンソールのエラー0', T.errs.slice(0, 3));
			await T.ctx.close();
		});
	}
}
