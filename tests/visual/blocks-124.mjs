// T110（2026-11-06 おいもさんの決定 326〜328）: 新しいモード（レース指定なし／本育成編成なし）の②のカードを別に持つ検査。
// run-smoke.mjs の末尾から register124() で呼ばれる（塊の見出しはすべて「T110」で始まる。`npm run test:visual -- --only=T110` で回せる）。
//
//  - 326: 新しいモードのときだけ、②のカードと一緒に動く項目（cards・pinned・count）を roster.noPlanFactor に別に持つ。戻すと元の②のカード。②のスキルは共通。
//  - 327: 初めて新しいモードにしたとき、そのときの②のカードを写す。次からは前の新しいモードの②のカード。
//  - 328: 新しいモードの②のカードの小窓では、①のカードと育成ウマ娘を「選べない」の判定に使わない。②のほかの枠と同じキャラクターは選べないまま。
//  - 既存の編成（デフォルト・レース）の保存の形は変わらない。読み込み時に補わない（ルール28）。
// スキル名・カード名は検査の側に書かない（恒久ルール1。id だけ）。T110_SHOTS=<フォルダ> で②のカードのパネルの画像を残す。
import { reloadReady } from './lib/page-ready.mjs';

const CARD_IDS = ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'];
const SAVED4 = ['card-0257', 'card-0300', 'card-0310', 'card-0312'];   // ②の元のカード（①と重ならない）
const REP1 = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417', '125', '124', '6', '27', '33', '230', '16', '23', '147', '117', '118', '145'];
const OTHER_OPTS = { typeMin: { 1: 1 }, exclude: {} };   // オススメサポの設定（共通のまま）
const R0 = { umaId: 'uma-0179', cardIds: CARD_IDS, outsideOptions: Object.assign({ cards: SAVED4, pinned: ['card-0300'], count: 4 }, OTHER_OPTS) };
const UMA_CHARA = 'card-0329';  // 育成ウマ娘 uma-0179 と同じキャラクター
const ROSTER_CARD = 'card-0565';   // ①のカード
const SAME_R2 = 'card-0409';    // ②の card-0257 と同じキャラクター（選べない）
const FREE1 = 'card-0252';      // ①にも②にも無いキャラクター
const FREE2 = 'card-0253';      // 同上
const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
const T = '#deck-template-panel ';
const MH = '[data-usd-el="roster-modal-host"] ';

export async function register124(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const SHOTS = process.env.T110_SHOTS || '';
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const cardsData = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8')).entries;
	const titleOf = (id) => (cardsData.find((c) => c.id === id) || {}).title || '';
	const RACE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/upcoming-races.json'), 'utf8')).races.filter((r) => r.selectable !== false)[0];
	const set = (a) => a.slice().sort().join();

	const open = async ({ w = 390, h = 844, roster = R0 } = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		await sp.page.evaluate(({ roster, REP1 }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: REP1, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster, REP1 });
		await settle(sp.page);
		return sp;
	};
	const settle = async (page) => {
		await reloadReady(page);
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('[data-act="notice-ok"]').catch(() => {});
		await page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await page.waitForSelector(T + '[data-usd-el="factor-card-tile"]', { timeout: 20000 });
		await page.waitForTimeout(400);
	};
	/** レース欄の小窓から選ぶ（利用者と同じ道） */
	const setMode = async (page, mode) => {
		if (mode === 'race') { await page.evaluate((RACE) => UmaSkillDeckCore.outside.setRace(RACE), RACE); await page.waitForTimeout(300); return; }
		await page.click('#hdr-race-slot [data-usd-el="set-race-btn"]');
		await page.waitForSelector('[data-usd-el="race-list"]');
		await page.click('[data-usd-el="race-opt"][data-race-id="' + (mode === 'noplan' ? 'no-plan' : '') + '"]');
		await page.waitForTimeout(350);
	};
	const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || '{}'));
	const scopeIds = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}').skillIds || []).join());
	const panelIds = (page) => page.evaluate((T) => [...document.querySelectorAll(T + '[data-usd-el="factor-card-tile"]')].map((t) => t.getAttribute('data-card-id') || '').filter(Boolean), T);
	const setView = async (page, want) => {
		for (let i = 0; i < 3 && (await page.getAttribute(T + '[data-usd-el="factor-view"]', 'data-usd-view')) !== want; i++) { await page.click(T + '[data-usd-el="factor-view"]'); await page.waitForTimeout(300); }
	};
	/** 星取表のカードの列の数 */
	const colCount = (page) => page.evaluate((T) => document.querySelectorAll(T + '[data-usd-el="factor-col-menu"][data-no]').length, T);
	/** ②の行の自動のマーカー（スキル id → 種類） */
	const markers = (page) => page.evaluate((T) => JSON.stringify([...document.querySelectorAll(T + '.usd-panel[data-skill-id]')].map((p) => p.getAttribute('data-skill-id') + ':' + p.getAttribute('data-marker')).sort()), T);
	const openPick = async (page, index) => { await page.click(T + '[data-usd-el="factor-card-pick"][data-index="' + index + '"]'); await page.waitForSelector(MH + '[data-usd-el="modal"]', { timeout: 5000 }); await page.waitForTimeout(150); };
	const closePick = async (page) => { await page.click(MH + '.usd-roster-modal-back', { position: { x: 2, y: 2 } }).catch(() => {}); await page.waitForTimeout(150); };
	const findIn = async (page, id) => {
		await page.fill(MH + '[data-usd-el="find"]', titleOf(id));
		await page.waitForTimeout(250);
		return page.evaluate((title) => [...document.querySelectorAll('[data-usd-el="roster-modal-host"] [data-usd-el="hits"] .usd-name-hit')].filter((h) => h.textContent.indexOf(title) !== -1)
			.map((h) => ({ id: h.getAttribute('data-entry-id') || '', button: h.tagName === 'BUTTON', note: (h.querySelector('.usd-name-added') || {}).textContent || '' })), titleOf(id));
	};
	const hit = async (page, id) => (await findIn(page, id)).find((h) => h.button ? h.id === id : true) || null;
	const take = async (page, id) => { await findIn(page, id); await page.click(MH + '[data-usd-act="take"][data-entry-id="' + id + '"]'); await page.waitForTimeout(400); };
	const notice = (page) => page.evaluate(() => { const n = document.querySelector('[data-usd-el="roster-modal-host"] [data-usd-el="pick-notice"]'); return n ? n.textContent : ''; });
	const panelShot = async (page, name) => {
		if (!SHOTS) return;
		fs.mkdirSync(SHOTS, { recursive: true });
		const el = await page.$(T + '[data-usd-el="factor-cards"]');
		await el.scrollIntoViewIfNeeded();
		await page.screenshot({ path: path.join(SHOTS, name + '.png') });
	};

	for (const [w, h] of [[390, 844], [1280, 800]]) {
		await block('T110 小窓（328・' + w + 'px）: 新しいモードで①のカードと育成ウマ娘と同じキャラのカードが選べる', async () => {
			const tag = 'T110 ' + w + 'px ';
			const sp = await open({ w, h });
			// デフォルトは今までどおり
			await openPick(sp.page, 4);
			const dr = await hit(sp.page, ROSTER_CARD);
			assert(dr && !dr.button && /この編成/.test(dr.note), tag + 'デフォルト: ①のカードは選べない', dr);
			await take(sp.page, UMA_CHARA);
			assert(/育成ウマ娘/.test(await notice(sp.page)), tag + 'デフォルト: 育成ウマ娘と同じキャラのカードは入れられない', await notice(sp.page));
			await closePick(sp.page);
			assert((await stored(sp.page)).outsideOptions.cards.indexOf(UMA_CHARA) === -1, tag + 'デフォルト: 入らない', null);

			await setMode(sp.page, 'noplan');
			await openPick(sp.page, 4);
			const nr = await hit(sp.page, ROSTER_CARD);
			assert(nr && nr.button && nr.note === '', tag + '新しいモード: ①のカードが選べる', nr);
			const nu = await hit(sp.page, UMA_CHARA);
			assert(nu && nu.button && nu.note === '', tag + '新しいモード: 育成ウマ娘と同じキャラのカードが並ぶ', nu);
			const ns = await hit(sp.page, SAME_R2);
			assert(ns && !ns.button && /同じキャラ/.test(ns.note), tag + '新しいモード: ②のほかの枠と同じキャラは選べないまま', ns);
			await take(sp.page, UMA_CHARA);
			assert((await notice(sp.page)) === '' && (await panelIds(sp.page)).indexOf(UMA_CHARA) !== -1, tag + '新しいモード: 育成ウマ娘と同じキャラのカードが入る', await panelIds(sp.page));
			await openPick(sp.page, 5);
			await take(sp.page, ROSTER_CARD);
			assert((await panelIds(sp.page)).indexOf(ROSTER_CARD) !== -1, tag + '新しいモード: ①のカードが入る', await panelIds(sp.page));
			const r = await stored(sp.page);
			assert(r.umaId === R0.umaId && set(r.cardIds) === set(CARD_IDS), tag + '①の中身は消えない', [r.umaId, r.cardIds]);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});

		await block('T110 写しと切り替え（326・327・' + w + 'px）: 写す・デフォルトは変わらない・戻す・もう一度・再読み込み', async () => {
			const tag = 'T110 ' + w + 'px ';
			const sp = await open({ w, h });
			await setView(sp.page, 'table');
			const ids0 = await scopeIds(sp.page);
			const m0 = await markers(sp.page);
			const before = await stored(sp.page);
			assert(before.noPlanFactor === undefined, tag + '前提: デフォルトだけなら新しい保存先は無い', before.noPlanFactor);
			assert(JSON.stringify(before.outsideOptions) === JSON.stringify(R0.outsideOptions), tag + '前提: 開いただけでは保存の形は変わらない', before.outsideOptions);
			const c0 = await colCount(sp.page);
			assert(c0 === 4, tag + '前提: 星取表の列は元の4枚', c0);
			await panelShot(sp.page, w + '-default');

			// 327: 初めて新しいモードにしたとき、写す
			await setMode(sp.page, 'noplan');
			const a = await stored(sp.page);
			assert(JSON.stringify(a.noPlanFactor) === JSON.stringify({ cards: SAVED4, pinned: ['card-0300'], count: 4 }), tag + '初めて新しいモードにすると②のカードが写される（カード・指定・枚数）', a.noPlanFactor);
			assert(JSON.stringify(a.outsideOptions) === JSON.stringify(R0.outsideOptions), tag + '元の②のカードはそのまま', a.outsideOptions);
			assert(set(await panelIds(sp.page)) === set(SAVED4), tag + 'パネルは写したカード', await panelIds(sp.page));

			// 新しいモードで変える: デフォルトの②のカードは変わらない
			await sp.page.click(T + '[data-usd-el="factor-card-clear"][data-index="0"]');
			await sp.page.waitForTimeout(300);
			await openPick(sp.page, 3);
			await take(sp.page, FREE1);
			await openPick(sp.page, 4);
			await take(sp.page, FREE2);
			const b = await stored(sp.page);
			const noPlanCards = b.noPlanFactor.cards.slice();
			assert(noPlanCards.length === 5 && noPlanCards.indexOf(FREE1) !== -1 && noPlanCards.indexOf(FREE2) !== -1, tag + '新しいモードの変更は新しい保存先へ', b.noPlanFactor);
			assert(b.noPlanFactor.pinned.indexOf(FREE1) !== -1 && b.noPlanFactor.pinned.indexOf(FREE2) !== -1, tag + '指定も新しい保存先へ', b.noPlanFactor);
			assert(JSON.stringify(b.outsideOptions) === JSON.stringify(R0.outsideOptions), tag + '新しいモードで変えてもデフォルトの②のカードは変わらない', b.outsideOptions);
			assert((await scopeIds(sp.page)) === ids0, tag + '②のスキルは変わらない', null);

			// 読む所: パネル・星取表の列・マーカー・結合画像
			assert(set(await panelIds(sp.page)) === set(noPlanCards), tag + '新しいモード: パネル', await panelIds(sp.page));
			assert((await colCount(sp.page)) === 5, tag + '新しいモード: 星取表の列', await colCount(sp.page));
			const m1 = await markers(sp.page);
			assert(m1 !== m0, tag + '新しいモード: マーカーの周回サポカが新しいカードで決まる', null);
			const st1 = await sp.page.evaluate(() => captureStitchSetPart());
			assert(set(st1.factorCards) === set(noPlanCards) && st1.rosterCards.length === 0, tag + '新しいモード: 結合画像の因子周回編成', st1.factorCards);
			await panelShot(sp.page, w + '-noplan');

			// 戻すと元の②のカード
			await setMode(sp.page, 'default');
			assert(set(await panelIds(sp.page)) === set(SAVED4), tag + 'デフォルトに戻すと元の②のカード', await panelIds(sp.page));
			assert((await colCount(sp.page)) === 4 && (await markers(sp.page)) === m0, tag + 'デフォルトに戻すと星取表の列とマーカーも元のまま', await colCount(sp.page));
			const st0 = await sp.page.evaluate(() => captureStitchSetPart());
			assert(set(st0.factorCards) === set(SAVED4) && st0.rosterCards.length === 6, tag + 'デフォルトの結合画像は元のカード', st0.factorCards);
			const c = await stored(sp.page);
			assert(c.noPlan === undefined && JSON.stringify(c.noPlanFactor.cards) === JSON.stringify(noPlanCards), tag + '戻しても新しいモードの②のカードは消えない', c.noPlanFactor);
			await setMode(sp.page, 'race');
			assert(set(await panelIds(sp.page)) === set(SAVED4), tag + 'レースでも元の②のカード', await panelIds(sp.page));
			await setMode(sp.page, 'default');

			// デフォルトで変えても、新しいモードの②のカードは変わらない（2回目は写さない）
			await sp.page.click(T + '[data-usd-el="factor-card-clear"][data-index="0"]');
			await sp.page.waitForTimeout(300);
			const defCards = (await stored(sp.page)).outsideOptions.cards.slice();
			assert(defCards.length === 3, tag + 'デフォルトの変更は今までの保存先へ', defCards);

			// もう一度新しいモードにすると前の新しいモードの②のカード
			await setMode(sp.page, 'noplan');
			assert(set(await panelIds(sp.page)) === set(noPlanCards), tag + 'もう一度新しいモードにすると前の新しいモードの②のカード', await panelIds(sp.page));
			assert((await colCount(sp.page)) === 5 && (await markers(sp.page)) === m1, tag + 'もう一度新しいモードにすると星取表の列とマーカーも前のまま', await colCount(sp.page));

			// 再読み込みで残る
			await settle(sp.page);
			assert(set(await panelIds(sp.page)) === set(noPlanCards), tag + '再読み込みで新しいモードの②のカードが残る', await panelIds(sp.page));
			await setMode(sp.page, 'default');
			await settle(sp.page);
			assert(set(await panelIds(sp.page)) === set(defCards), tag + '再読み込みでデフォルトの②のカードが残る', await panelIds(sp.page));
			assert((await scopeIds(sp.page)) === ids0, tag + '②のスキルはモードに関係なく共通', null);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	await block('T110 保存の形: 既存の編成は変わらない・共通の設定は共通のまま・空の写し・T108 の保存値', async () => {
		// デフォルトとレースで②のカードに触っても、新しい保存先を書かない。形は今までどおり
		let sp = await open();
		await sp.page.click(T + '[data-usd-el="factor-card-clear"][data-index="0"]');
		await sp.page.waitForTimeout(300);
		await setMode(sp.page, 'race');
		await openPick(sp.page, 3);
		await take(sp.page, FREE1);
		const r = await stored(sp.page);
		assert(r.noPlanFactor === undefined && r.noPlan === undefined, 'T110 デフォルト・レースで触っても新しい保存先を書かない', Object.keys(r));
		assert(Object.keys(r.outsideOptions).sort().join() === 'cards,count,exclude,pinned,typeMin', 'T110 デフォルト・レースの outsideOptions の項目は今までどおり', Object.keys(r.outsideOptions));
		assert(r.outsideOptions.cards.indexOf(FREE1) !== -1 && r.outsideOptions.pinned.indexOf(FREE1) !== -1, 'T110 デフォルト・レースのカードは outsideOptions へ', r.outsideOptions);
		const ud = await sp.page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/umaSkillDeck/.test(k) && /userData|user-data|:data$/i.test(k)) { try { return JSON.parse(localStorage.getItem(k)).schemaVersion; } catch (e) { /* 次へ */ } } } return null; });
		assert(ud === null || ud === 7, 'T110 schemaVersion は 7 のまま', ud);
		await sp.ctx.close();

		// 共通のまま: 新しいモードで②のカードを変えても typeMin・exclude は outsideOptions に残り、新しい保存先に入らない
		sp = await open();
		await setMode(sp.page, 'noplan');
		const a = await stored(sp.page);
		assert(a.noPlanFactor.typeMin === undefined && a.noPlanFactor.exclude === undefined && JSON.stringify(a.outsideOptions.typeMin) === JSON.stringify(OTHER_OPTS.typeMin), 'T110 オススメサポの設定は写さない・共通のまま', a.noPlanFactor);
		const opt = await sp.page.evaluate(() => UmaSkillDeckCore.outside.getOptions());
		assert(opt.typeMin[1] === 1 && opt.count === 4 && opt.pinned.join() === 'card-0300', 'T110 新しいモードで読む形: 共通の設定＋新しい保存先のカード', opt);
		// 新しいモードで共通の設定を書いても、新しい保存先と元のカードは動かない
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ typeMin: { 2: 1 } }));
		const a2 = await stored(sp.page);
		assert(JSON.stringify(a2.outsideOptions.typeMin) === JSON.stringify({ 2: 1 }) && JSON.stringify(a2.outsideOptions.cards) === JSON.stringify(SAVED4) && a2.noPlanFactor.typeMin === undefined, 'T110 共通の設定は outsideOptions へ', a2.outsideOptions);
		await sp.ctx.close();

		// ②のカードが空のセットで初めて新しいモード: 空の写し（{}）を書く。元の保存先は作らない。戻ってカードを足しても、もう一度は空のまま
		sp = await open({ roster: { umaId: 'uma-0179', cardIds: CARD_IDS } });
		await setMode(sp.page, 'noplan');
		const e = await stored(sp.page);
		assert(JSON.stringify(e.noPlanFactor) === '{}' && e.outsideOptions === undefined, 'T110 空のセット: 空の写しを書く・元の保存先は作らない', e);
		await setMode(sp.page, 'default');
		await openPick(sp.page, 0);
		await take(sp.page, FREE1);
		await setMode(sp.page, 'noplan');
		assert((await panelIds(sp.page)).length === 0, 'T110 空のセット: 2回目は写さない（前の新しいモードの②のカード＝空）', await panelIds(sp.page));
		await sp.ctx.close();

		// T108 のあと写しを持たずに新しいモードのままのセット: 読み込みでは書かない。今の②のカードを読む。触ったら写しを作り、元は変えない
		sp = await open({ roster: Object.assign({}, R0, { noPlan: true }) });
		const t0 = await stored(sp.page);
		assert(t0.noPlanFactor === undefined && t0.noPlan === true, 'T110 T108 の保存値: 読み込みでは書かない（ルール28）', t0.noPlanFactor);
		assert(set(await panelIds(sp.page)) === set(SAVED4), 'T110 T108 の保存値: 今の②のカードを読む', await panelIds(sp.page));
		await openPick(sp.page, 4);
		await take(sp.page, UMA_CHARA);
		const t1 = await stored(sp.page);
		assert(t1.noPlanFactor && t1.noPlanFactor.cards.indexOf(UMA_CHARA) !== -1 && t1.noPlanFactor.cards.indexOf('card-0257') !== -1, 'T110 T108 の保存値: 触ると今の②のカードに足して別に持つ', t1.noPlanFactor);
		assert(JSON.stringify(t1.outsideOptions) === JSON.stringify(R0.outsideOptions), 'T110 T108 の保存値: 元の②のカードは変わらない', t1.outsideOptions);
		await sp.ctx.close();
	});

	await block('T110 Deck α へ送る形: ②のカードを持たない・②のスキルは共通', async () => {
		const sp = await open();
		const send = () => sp.page.evaluate(() => { const r = deckAlphaSendIndexes; deckAlphaSendIndexes = () => [0]; const out = buildDeckAlphaSend(0); deckAlphaSendIndexes = r; return out; });
		const a = await send();
		await setMode(sp.page, 'noplan');
		await sp.page.click(T + '[data-usd-el="factor-card-clear"][data-index="0"]');
		await sp.page.waitForTimeout(300);
		const b = await send();
		assert(a.noPlan === undefined && b.noPlan === true && a.send.join() === b.send.join(), 'T110 送る形の②のスキルはモードで変わらない', [a.send.length, b.send.length]);
		assert(!/card-\d/.test(JSON.stringify(b)), 'T110 送る形に②のカードは入らない', null);
		await sp.ctx.close();
	});
}
