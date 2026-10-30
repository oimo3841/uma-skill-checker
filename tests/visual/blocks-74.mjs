// オススメサポのピン止めの画面と保存（T18・C-247 の後段。2026-10-31）の検査。
// run-smoke.mjs の末尾から register74() で呼ばれる（塊の見出しはすべて「ピン画面」で始まる。`npm run test:visual -- --only=ピン画面` で回せる）。
//
// 決め（おいもさん・2026-10-30・31）:
//  保存 … roster.outsideOptions.skillPins（スキルID の配列・押した順・①ごと）。押した時点で書く（「追加」を待たない）。空なら項目を消す。schemaVersion 7 のまま・移行なし。
//         読むときは文字列・収録データで引ける・重複なしだけ（保存値は書き換えない・読み込み時に補わない）。②の一覧・結合画像はピンを読まない。
//  見た目 … 一覧の行の［チェックボックス］の右にピンのボタン（未＝細い線・斜め45度／済＝塗り・まっすぐ・無彩色・押せる範囲 44px・行の高さは変えない）。
//         ②に追加済みの行にはピンを置かない（同じ幅の空き）。ピンの行は最上段に押した順・名前を太字・行の地の色なし。
//  動き … 押した瞬間に pinCheck。ok＝付けて保存・再計算／ng＝付けない・保存不変・トースト／unknown・timeout＝付けて再計算に任せ、組み合わせなしなら外して保存を戻し・トースト。
//         外すときも再計算。チェックボックスは外せる。元に戻すには積まない。
//         場面A（小窓の中の操作で組み合わせが無くなる）は操作を反映せずトースト。場面B（小窓の外の変更）は入れ直せなかったピンの行を最上段に残し、理由を出す。
//  画面の文言に「含め…」を使わない。
// 変更の前の見た目（ピンが空のとき）は、変更の前の core（8ab032d）を同じ編成で開いて測った値（行の高さ 29px・名前の太さ 400・行の地は透明）。
// スキル名は検査の側に書かない（恒久ルール1。id は計算の結果から引く）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register74(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS = ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'];
	const R1 = { pt: { status: 'kire' }, umaId: 'uma-0179', cardIds: CARDS, skillFilter: {} };
	const MSG = '条件を満たすサポートカードの組み合わせがありません';
	const M = '[data-usd-el="outside-modal"] ';
	const BAR = '#deck-set-bar ';
	// 変更の前（8ab032d）の一覧の行の実測（375・1280 × ライト・ダークとも同じ）
	const BEFORE = { rowH: 29, weight: '400', bg: 'rgba(0, 0, 0, 0)' };

	const notices = async (page) => { for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]'); };
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, o.userData || EMPTY);
		await sp.page.evaluate(({ roster, theme, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: o.roster === undefined ? R1 : o.roster, theme: o.theme || 'light', scope: o.scope || null });
		await reloadReady(sp.page);
		await notices(sp.page);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadMasterSkills(); await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		return sp;
	};
	// 小窓の計算が終わるまで（計算中は heldProblem が空）
	const ready = (page) => page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]') && !!UmaSkillDeckCore.outside.heldProblem(); }, null, { timeout: 30000 });
	const openModal = async (page) => { await page.click('#deck-template-panel [data-usd-el="outside-open"]'); await ready(page); };
	const closeModal = async (page) => { await page.click(M + '[data-usd-el="outside-close"]'); await page.waitForTimeout(150); };
	// 一覧の行（上から）。id・ピン・理由・チェックの状態・名前の太さ
	const rowsOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]')).map((e) => {
		const pin = e.querySelector('[data-usd-el="outside-pin"]');
		const box = e.querySelector('input[type="checkbox"]');
		const name = e.querySelector('.usd-out-namebtn');
		return { id: e.dataset.skillId, pinned: e.dataset.usdPinned === '1', reason: e.dataset.usdPinReason || '', added: e.dataset.usdExcluded === '1', pin: pin ? pin.getAttribute('aria-pressed') : null,
			disabled: !!(box && box.disabled), checked: !!(box && box.checked), weight: getComputedStyle(name).fontWeight, h: e.getBoundingClientRect().height, bg: getComputedStyle(e).backgroundColor,
			reasonText: (e.querySelector('[data-usd-el="outside-pin-reason"]') || {}).textContent || '', ptText: (e.querySelector('[data-usd-el="outside-row-pt"]') || {}).textContent || '',
			spacer: !!e.querySelector('.usd-out-pin-sp') };
	}));
	const listIds = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]:not([data-usd-excluded])')).map((e) => e.dataset.skillId));
	const saved = (page) => page.evaluate(() => { const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'); return r && r.outsideOptions && r.outsideOptions.skillPins ? r.outsideOptions.skillPins : null; });
	const draftRaw = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
	const clearToast = (page) => page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
	const toastText = (page) => page.evaluate(() => document.getElementById('toast-message').textContent);
	const pinSel = (id) => M + '[data-usd-el="outside-pin"][data-skill-id="' + id + '"]';
	// 押して、計算が終わるまで待つ
	const pressPin = async (page, id) => { await page.click(pinSel(id)); await ready(page); };
	// 判定を「組み合わせなし」にする（検査用の口）。持っている結果を外して、押した瞬間の判定が問題での判定（via judge）を通るようにする
	const forceNg = (page, keepResult) => page.evaluate((keep) => { const C = UmaSkillDeckCore.outside; const h = C.heldProblem(); if (!keep && h) C.setHeld({ prob: h.prob, K: h.K }); C.setPinJudge(() => ({ result: 'ng' })); }, !!keepResult);
	const judgeOff = (page) => page.evaluate(() => UmaSkillDeckCore.outside.setPinJudge(null));
	// 無彩色か（HSL の彩度が低く、緑の色相でない）
	const colorProbe = () => {
		const hsl = (css) => { const m = (css.match(/[\d.]+/g) || []).map(Number); const [r, g, b] = m.slice(0, 3).map((x) => x / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2, d = mx - mn;
			const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); let h = 0; if (d) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); } if (h < 0) h += 360; return { css, h: Math.round(h), s: Math.round(s * 100) / 100 }; };
		const pins = Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-pin"]'));
		const on = pins.find((b) => b.getAttribute('aria-pressed') === 'true'), off = pins.find((b) => b.getAttribute('aria-pressed') === 'false');
		const info = (b) => { if (!b) return null; const svg = b.querySelector('svg'); const cs = getComputedStyle(svg); const bs = getComputedStyle(b, '::before'); const r = b.getBoundingClientRect();
			return { color: hsl(getComputedStyle(b).color), fill: cs.fill, transform: cs.transform, hitW: bs.width, hitH: bs.height, w: r.width, h: r.height }; };
		// ページの今のトークン（未＝補助の文字色・済＝選択の印の色。チェックボックスの印と同じ）を、同じ形で読む
		const tok = (v) => { const e = document.createElement('span'); e.style.color = 'var(' + v + ')'; document.body.appendChild(e); const c = getComputedStyle(e).color; e.remove(); return c; };
		return { on: info(on), off: info(off), tokOn: tok('--uma-control-mark'), tokOff: tok('--uma-text-subtle') };
	};
	// 「無彩色」＝新しい色を足さず、ページのベースの色（Deck は灰・UmaStar はセピアの単色）のトークンだけ・緑の色相でない
	const mono = (c, tokCss) => !!c && c.css === tokCss && !(c.s > 0.1 && c.h >= 75 && c.h <= 170);

	for (const theme of ['light', 'dark']) {
		await block('ピン画面(1) 付け外し・最上段・太字・行の地の色なし・無彩色・押せる範囲 44px・ピンが空のときの見た目（375・' + (theme === 'light' ? 'ライト' : 'ダーク') + '）', async () => {
			const sp = await openSp({ theme });
			await openModal(sp.page);
			// ピンが空: 行の高さ・名前の太さ・行の地は変更の前と同じ。並びは計算の結果のまま。押されたピンは無い
			const r0 = await rowsOf(sp.page);
			const order = await sp.page.evaluate(() => UmaSkillDeckCore.outside.heldProblem().result.skills.map((s) => s.skillId));
			assert(r0.length > 10 && r0.every((x) => x.h === BEFORE.rowH && x.weight === BEFORE.weight && x.bg === BEFORE.bg) && JSON.stringify(r0.map((x) => x.id)) === JSON.stringify(order)
				&& r0.every((x) => !x.pinned && x.pin !== 'true'), 'ピン画面(1) ' + theme + ': ピンが空のとき、行の高さ ' + BEFORE.rowH + 'px・名前の太さ 400・行の地は透明・並びは計算のまま（変更の前と同じ）', r0.slice(0, 3));
			assert(r0.filter((x) => !x.added).every((x) => x.pin === 'false') && r0.filter((x) => x.added).every((x) => x.pin === null && x.spacer), 'ピン画面(1) ' + theme + ': 追加済みでない行には未のピン・追加済みの行にはピンが無い（空き）', r0.filter((x) => x.added).length);
			const c0 = await sp.page.evaluate(colorProbe);
			assert(c0.off && c0.off.fill === 'none' && c0.off.transform !== 'none' && c0.off.hitW === '44px' && c0.off.hitH === '44px' && c0.off.w === 20 && c0.off.h === 16 && mono(c0.off.color, c0.tokOff),
				'ピン画面(1) ' + theme + ': 未のピンは線だけ（塗りなし）・斜め（回転）・ベースの補助の文字色（新しい色なし・緑なし）・見た目 20×16・押せる範囲 44×44', c0);
			const ids = await listIds(sp.page);
			const want = [ids[5], ids[9], ids[2]];
			for (const id of want) await pressPin(sp.page, id);
			const r1 = await rowsOf(sp.page);
			const top = r1.slice(0, 3);
			assert(JSON.stringify(top.map((x) => x.id)) === JSON.stringify(want) && top.every((x) => x.pinned && x.pin === 'true' && Number(x.weight) >= 700 && x.bg === BEFORE.bg && x.h === BEFORE.rowH && !x.disabled),
				'ピン画面(1) ' + theme + ': 押した3つが最上段に押した順・済・名前は太字・行の地の色なし・行の高さは同じ・チェックは押せる', top);
			assert(r1.slice(3).every((x) => !x.pinned && x.pin !== 'true' && x.weight === BEFORE.weight), 'ピン画面(1) ' + theme + ': ほかの行は今までどおり（太字なし）', r1.slice(3, 5));
			const c1 = await sp.page.evaluate(colorProbe);
			assert(c1.on && c1.on.fill !== 'none' && c1.on.transform === 'none' && c1.on.hitW === '44px' && mono(c1.on.color, c1.tokOn), 'ピン画面(1) ' + theme + ': 済のピンは塗り・まっすぐ・ベースの選択の印の色（新しい色なし・緑なし）', c1);
			const focus = await sp.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-skill-id'));
			const label = await sp.page.getAttribute(pinSel(want[0]), 'aria-label');
			assert(focus === want[2] && /ピン止め中/.test(label) && /外します/.test(label), 'ピン画面(1) ' + theme + ': 押したあとは同じスキルのピンに戻る・読み上げは今の状態と押すとどうなるか', { focus, label });
			// チェックボックスは外せる
			await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + want[0] + '"] input[type="checkbox"]');
			assert(!(await sp.page.isChecked(M + '[data-usd-el="outside-row"][data-skill-id="' + want[0] + '"] input[type="checkbox"]')), 'ピン画面(1) ' + theme + ': ピンの行のチェックボックスは外せる', true);
			// 外す → 最上段から外れ、保存からも消える
			await pressPin(sp.page, want[1]);
			const r2 = await rowsOf(sp.page);
			const s2 = await saved(sp.page);
			assert(JSON.stringify(r2.filter((x) => x.pinned).map((x) => x.id)) === JSON.stringify([want[0], want[2]]) && r2.find((x) => x.id === want[1]).pin === 'false' && JSON.stringify(s2) === JSON.stringify([want[0], want[2]]),
				'ピン画面(1) ' + theme + ': もう一度押すと外れる（最上段から外れ・保存からも消える）', { pinned: r2.filter((x) => x.pinned).map((x) => x.id), s2 });
			assert(jsErrors(sp.errors).length === 0, 'ピン画面(1) ' + theme + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	await block('ピン画面(2) 保存と復元: 押した時点で skillPins に書かれる（「追加」の前）・reload で戻る・②の一覧と結合画像の材料は変わらない・別の①（セット）には出ない・schemaVersion 7 のまま', async () => {
		let sp = await openSp();
		const panelBefore = await sp.page.evaluate(() => document.getElementById('deck-template-panel').innerHTML.length + ':' + localStorage.getItem('umaSkillDeck:draftScope:special'));
		await openModal(sp.page);
		const ids = await listIds(sp.page);
		await sp.page.click(pinSel(ids[3]));
		const now = await saved(sp.page);   // 計算を待たずに読む（押した時点）
		await ready(sp.page);
		await pressPin(sp.page, ids[7]);
		const s = await saved(sp.page);
		assert(JSON.stringify(now) === JSON.stringify([ids[3]]) && JSON.stringify(s) === JSON.stringify([ids[3], ids[7]]), 'ピン画面(2) 押した時点で roster.outsideOptions.skillPins に書かれる（押した順・「追加」を押す前）', { now, s });
		await closeModal(sp.page);
		const panelAfter = await sp.page.evaluate(() => document.getElementById('deck-template-panel').innerHTML.length + ':' + localStorage.getItem('umaSkillDeck:draftScope:special'));
		const pinInPanel = await sp.page.evaluate(() => !!document.querySelector('#deck-template-panel [data-usd-el="outside-pin"]'));
		assert(panelAfter === panelBefore && !pinInPanel, 'ピン画面(2) ②の一覧（パネル）と②のスキル（結合画像の材料）はピンで変わらない', { panelBefore, panelAfter });
		await reloadReady(sp.page);
		await notices(sp.page);
		await openModal(sp.page);
		const r = await rowsOf(sp.page);
		assert(JSON.stringify(r.filter((x) => x.pinned).map((x) => x.id)) === JSON.stringify([ids[3], ids[7]]) && r[0].id === ids[3] && r[1].id === ids[7], 'ピン画面(2) 再読み込みのあとも、同じピンが最上段に押した順で戻る', r.slice(0, 3).map((x) => x.id));
		assert(jsErrors(sp.errors).length === 0, 'ピン画面(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 別の①（セット）には出ない
		const seed = { schemaVersion: 7, records: [], customSkills: [], templates: [
			{ templateId: 't1', name: 'S1', skillIds: [], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' },
			{ templateId: 't2', name: 'S2', skillIds: [], baseRosterId: 'r2', createdAt: 'x', updatedAt: 'x' }],
			rosters: [Object.assign({ rosterId: 'r1', name: 'S1', star: 3, awakeningLevel: 5, createdAt: 'x', updatedAt: 'x' }, R1), Object.assign({ rosterId: 'r2', name: 'S2', star: 3, awakeningLevel: 5, createdAt: 'x', updatedAt: 'x' }, R1)] };
		sp = await openSp({ userData: seed, roster: null });
		const pick = async (id) => { await sp.page.click(BAR + '[data-usd-act="set-list"]'); const on = await sp.page.evaluate((v) => document.querySelector('[data-usd-el="set-list"] input[value="' + v + '"]').checked, id); if (on) await sp.page.keyboard.press('Escape'); else await sp.page.click('[data-usd-el="set-list"] input[value="' + id + '"]'); await sp.page.waitForTimeout(250); };
		await pick('t1');
		await openModal(sp.page);
		const id0 = (await listIds(sp.page))[0];
		await pressPin(sp.page, id0);
		await closeModal(sp.page);
		const d = JSON.parse(await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData')));
		const ro = (k) => d.rosters.find((x) => x.rosterId === k);
		assert(JSON.stringify(ro('r1').outsideOptions) === JSON.stringify({ skillPins: [id0] }) && !ro('r2').outsideOptions && d.schemaVersion === 7, 'ピン画面(2) セット S1 の①にだけ書く（S2 の①には書かない・schemaVersion 7）', d.rosters.map((x) => x.outsideOptions));
		await pick('t2');
		await openModal(sp.page);
		const r2 = await rowsOf(sp.page);
		const opt2 = await sp.page.evaluate(() => UmaSkillDeckCore.outside.getOptions().skillPins);
		assert(r2.every((x) => !x.pinned && x.pin !== 'true') && opt2.length === 0, 'ピン画面(2) 別のセット（S2）の小窓には出ない', { opt2 });
		assert(jsErrors(sp.errors).length === 0, 'ピン画面(2) セット: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン画面(3) 押した瞬間の判定が「組み合わせなし」（ng）: ピンは付かず・保存は変わらず・トースト／判定を戻すと付く（空振りでない）', async () => {
		const sp = await openSp();
		await openModal(sp.page);
		const id = (await listIds(sp.page))[4];
		const before = await draftRaw(sp.page);
		await forceNg(sp.page);
		await clearToast(sp.page);
		await sp.page.click(pinSel(id));
		await sp.page.waitForTimeout(100);
		const pressed = await sp.page.getAttribute(pinSel(id), 'aria-pressed');
		const busy = await sp.page.evaluate(() => !!document.querySelector('[data-usd-el="outside-busy"]'));
		assert(pressed === 'false' && !busy && (await draftRaw(sp.page)) === before && (await toastText(sp.page)) === MSG, 'ピン画面(3) ng: ピンは付かない・計算し直さない・保存（①の編成）は1バイトも変わらない・トースト「' + MSG + '」', { pressed, busy, toast: await toastText(sp.page) });
		// 判定を戻す（同じく持っている問題での判定）と付く
		await judgeOff(sp.page);
		await sp.page.evaluate(() => { const C = UmaSkillDeckCore.outside; const h = C.heldProblem(); C.setHeld({ prob: h.prob, K: h.K }); });
		await clearToast(sp.page);
		await pressPin(sp.page, id);
		assert((await sp.page.getAttribute(pinSel(id), 'aria-pressed')) === 'true' && JSON.stringify(await saved(sp.page)) === JSON.stringify([id]) && (await toastText(sp.page)) === '', 'ピン画面(3) 判定を戻すと、同じ押し方でピンが付く（ng の検査が空振りでない）', await saved(sp.page));
		assert(jsErrors(sp.errors).length === 0, 'ピン画面(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン画面(4) 押した瞬間の判定が unknown（持っている問題が無い）で、再計算が組み合わせなし（pinInfeasible）: いったん保存してから外して保存を戻し・トースト', async () => {
		const sp = await openSp();
		await openModal(sp.page);
		const ids = await listIds(sp.page);
		await pressPin(sp.page, ids[1]);
		const before = await saved(sp.page);
		await sp.page.evaluate(() => { const C = UmaSkillDeckCore.outside; C.setHeld(null); C.setPinJudge(() => ({ result: 'ng' })); });
		await clearToast(sp.page);
		// 保存の書き込みを記録する（計算が速く、押したあとに読むと戻ったあとになるため）
		await sp.page.evaluate(() => { window.__pinWrites = []; const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'umaSkillDeck:draftRoster:special') { try { const o = JSON.parse(v).outsideOptions; window.__pinWrites.push(o && o.skillPins ? o.skillPins : null); } catch (e) {} } return orig.call(this, k, v); }; });
		await sp.page.click(pinSel(ids[6]));
		await ready(sp.page);
		const writes = await sp.page.evaluate(() => window.__pinWrites);
		const mid = writes[0];
		// 1回目の計算（組み合わせなし）→ 保存を戻して計算し直す。戻したあとの計算でも判定は ng のままなので、ids[1] は「組み合わせなし」の行になる
		await ready(sp.page);
		const after = await saved(sp.page);
		const r = await rowsOf(sp.page);
		await judgeOff(sp.page);
		assert(JSON.stringify(mid) === JSON.stringify([ids[1], ids[6]]), 'ピン画面(4) unknown のときは、ピンを付けて保存し、計算に任せる（書き込みの記録の1回目）', writes);
		assert(JSON.stringify(after) === JSON.stringify(before) && (await toastText(sp.page)) === MSG && !r.some((x) => x.id === ids[6] && x.pin === 'true'), 'ピン画面(4) 計算の結果が組み合わせなしなら、押したピンを外して保存を戻し（' + JSON.stringify(before) + '）・トースト', { after, toast: await toastText(sp.page) });
		assert(r[0].id === ids[1] && r[0].reason === 'none' && r[0].reasonText === '組み合わせなし' && r[0].disabled, 'ピン画面(4) 前からのピンは残り、判定が ng のままの計算では「組み合わせなし」の行（場面B と同じ表示）', r[0]);
		assert(jsErrors(sp.errors).length === 0, 'ピン画面(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン画面(5) 場面A: 小窓の中の操作（枚数・種類・カードを外す・残りの枠の解除）で今のピンが入らなくなるときは、反映せず（保存も部品も元のまま）トースト／判定を戻すと反映する（空振りでない）', async () => {
		const sp = await openSp();
		await openModal(sp.page);
		// 残りの枠に1枚指定する（計算の結果のカードの1枚）
		const cid = await sp.page.evaluate(() => UmaSkillDeckCore.outside.heldProblem().result.cards[0].cardId);
		await sp.page.evaluate((c) => { UmaSkillDeckCore.outside.setOptions({ pinned: [c] }); document.querySelector('[data-usd-el="outside-modal"] [data-usd-act="outside-recalc"]').click(); }, cid);
		await ready(sp.page);
		const pinId = (await listIds(sp.page))[2];
		await pressPin(sp.page, pinId);
		// 判定の重さ（変えたあとの条件で問題を組み立てて判定するのにかかる時間）
		const cost = await sp.page.evaluate(() => { const C = UmaSkillDeckCore.outside; const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')); const ms = [];
			for (let i = 0; i < 5; i++) { const t0 = performance.now(); const p = C.build({ roster, addedSkillIds: [], typeMin: { 1: 1 }, pinnedCardIds: [], pinSkillIds: roster.outsideOptions.skillPins }); C.pinFeasible(p, 5, {}); ms.push(performance.now() - t0); }
			return ms; });
		console.log('     [実測] 場面A の判定（組み立て＋判定）: ' + cost.map((x) => x.toFixed(1)).join('・') + ' ms');
		const before = await draftRaw(sp.page);
		await forceNg(sp.page, true);
		const tries = [];
		// 枚数（5 → 4）
		await clearToast(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-count-btn"]');
		await sp.page.click('[data-usd-el="outside-count-4"]');
		tries.push({ op: '枚数', toast: await toastText(sp.page), same: (await draftRaw(sp.page)) === before, label: await sp.page.textContent(M + '[data-usd-el="outside-count-btn"]') });
		// 種類（スピードを1枚）
		await clearToast(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-types-btn"]');
		await sp.page.click('[data-usd-el="outside-type-row"][data-type="1"] [data-usd-el="outside-type-plus"]');
		tries.push({ op: '種類', toast: await toastText(sp.page), same: (await draftRaw(sp.page)) === before, num: await sp.page.textContent('[data-usd-el="outside-type-row"][data-type="1"] [data-usd-el="outside-type-num"]') });
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(150);
		// カードを外す
		await clearToast(sp.page);
		const exId = await sp.page.getAttribute(M + '[data-usd-el="outside-exclude"]', 'data-card-id');
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="' + exId + '"]');
		tries.push({ op: 'カードを外す', toast: await toastText(sp.page), same: (await draftRaw(sp.page)) === before, tile: await sp.page.isVisible(M + '[data-usd-el="outside-card"][data-card-id="' + exId + '"]') });
		// 残りの枠の解除
		await clearToast(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-unpin"][data-card-id="' + cid + '"]');
		tries.push({ op: '残りの枠の解除', toast: await toastText(sp.page), same: (await draftRaw(sp.page)) === before, tile: await sp.page.isVisible(M + '[data-usd-el="outside-pinned"][data-card-id="' + cid + '"]') });
		const busy = await sp.page.evaluate(() => !!document.querySelector('[data-usd-el="outside-busy"]'));
		assert(tries.every((t) => t.toast === MSG && t.same) && tries[0].label.indexOf('5枚') === 0 && tries[1].num === '0' && tries[2].tile && tries[3].tile && !busy,
			'ピン画面(5) 4つの操作とも反映しない（①の編成の保存は1バイトも同じ・枚数は5枚のまま・種類の数は0・カードは残る・計算し直さない）・トースト', tries);
		// 判定を戻すと、同じ操作が反映される
		await judgeOff(sp.page);
		await clearToast(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-count-btn"]');
		await sp.page.click('[data-usd-el="outside-count-4"]');
		await ready(sp.page);
		const opt = await sp.page.evaluate(() => UmaSkillDeckCore.outside.getOptions());
		assert(opt.count === 4 && (await toastText(sp.page)) === '' && JSON.stringify(opt.skillPins) === JSON.stringify([pinId]), 'ピン画面(5) 判定を戻すと、同じ操作（枚数）が反映される（空振りでない）', opt);
		assert(jsErrors(sp.errors).length === 0, 'ピン画面(5) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン画面(6) 場面B: 入れ直せなかったピンの行は最上段に残り、Pt の代わりに理由（組み合わせなし・本育成で取得・本育成で不要・①の絞り込み不一致・レース条件不一致）・チェックは押せない／ピンを外すと戻る・保存は残る／金は行を出さない／「含め」の文字なし', async () => {
		let sp = await openSp();
		const races = await sp.page.evaluate(async () => { const res = await fetch('data/upcoming-races.json'); const j = await res.json(); return j.races; });
		// 理由ごとのピンを、計算の側の母集団の判定から引く（スキル名は書かない）
		const plan = await sp.page.evaluate(({ R1, races }) => {
			const C = UmaSkillDeckCore.outside;
			const RF = Object.assign({}, R1, { skillFilter: { distance: 'long', style: 'oikomi', surface: 'turf' } });
			const pop1 = C.populationOf(R1, { exclude: {} });
			const reasonIn = (roster, id) => { const p = C.populationOf(roster, { pins: [id] }); return p.pinRejected && p.pinRejected[0] ? p.pinRejected[0].reason : (p.pinIds && p.pinIds.indexOf(id) !== -1 ? 'ok' : null); };
			const poolIds = new Set(C.populationOf({}, { exclude: {} }).ids);
			const takenId = pop1.takenIds.find((id) => poolIds.has(id) && reasonIn(RF, id) === 'taken');
			const offId = pop1.takenIds.find((id) => id !== takenId && reasonIn(Object.assign({}, RF, { offSkillIds: [id] }), id) === 'off');
			const RFo = Object.assign({}, RF, { offSkillIds: [offId] });
			const byAxis = {};
			['distance', 'style', 'surface'].forEach((a) => { byAxis[a] = pop1.ids.find((id) => reasonIn(RFo, id) === a) || null; });
			const r = C.solveSync({ roster: RFo, addedSkillIds: [], deadlineMs: 30000 });
			const okId = r.skills.find((s) => !s.added).skillId;
			const goldId = (r.golds[0] || {}).skillId || null;
			let raceRow = null, raceId = null;
			for (const row of races) { const p = C.populationOf(Object.assign({}, R1, { race: row }), { exclude: {} }); if (p.raceExcludedIds.length > 0) { raceRow = row; raceId = p.raceExcludedIds[0]; break; } }
			return { RFo, takenId, offId, byAxis, okId, goldId, raceRow, raceId };
		}, { R1, races });
		await sp.ctx.close();
		assert(plan.takenId && plan.offId && plan.byAxis.distance && plan.byAxis.style && plan.byAxis.surface && plan.okId && plan.goldId && plan.raceId, 'ピン画面(6) 前提: 理由ごとのピン（取得・OFF・距離・脚質・バ場・レース）と金を引けた', plan);
		const pins = [plan.takenId, plan.offId, plan.byAxis.distance, plan.byAxis.style, plan.byAxis.surface, plan.goldId, plan.okId];
		const roster = Object.assign({}, plan.RFo, { outsideOptions: { skillPins: pins } });
		sp = await openSp({ roster });
		const savedRaw = await draftRaw(sp.page);
		await openModal(sp.page);
		let r = await rowsOf(sp.page);
		const want = [['taken', '本育成で取得'], ['off', '本育成で不要'], ['distance', '①の絞り込み不一致'], ['style', '①の絞り込み不一致'], ['surface', '①の絞り込み不一致']];
		const top = r.slice(0, 6);
		assert(want.every(([reason, text], i) => top[i].id === pins[i] && top[i].reason === reason && top[i].reasonText === text && top[i].disabled && !top[i].checked && top[i].pin === 'true' && Number(top[i].weight) >= 700 && top[i].ptText === '')
			&& top[5].id === plan.okId && top[5].pinned && !top[5].reason && top[5].ptText !== '', 'ピン画面(6) 理由の行が保存の順で最上段・Pt の代わりに理由・チェックは押せない・ピンは済・名前は太字／入ったピンはその下（Pt あり）', top.map((x) => [x.id, x.reason, x.reasonText, x.disabled]));
		assert(!r.some((x) => x.id === plan.goldId) && (await draftRaw(sp.page)) === savedRaw, 'ピン画面(6) 金のピンは行を出さない／開いて計算しても保存は1バイトも変わらない', true);
		const text = await sp.page.evaluate(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return m.textContent + Array.from(m.querySelectorAll('[aria-label],[title]')).map((e) => (e.getAttribute('aria-label') || '') + (e.getAttribute('title') || '')).join(''); });
		assert(text.indexOf('含め') === -1 && text.indexOf('組み合わせなし') === -1, 'ピン画面(6) 小窓の中（文字・読み上げ・title）に「含め」が無い', text.length);
		// 取得のピンを外す → 行が消える（一覧に出ないスキル）。保存からも消える
		await pressPin(sp.page, plan.takenId);
		r = await rowsOf(sp.page);
		const s1 = await saved(sp.page);
		assert(!r.some((x) => x.id === plan.takenId) && JSON.stringify(s1) === JSON.stringify(pins.slice(1)) && r[0].id === plan.offId, 'ピン画面(6) 理由の行のピンを外すと、その行は一覧から消える（その理由で一覧に出ないスキル）', s1);
		assert(jsErrors(sp.errors).length === 0, 'ピン画面(6) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// レース条件不一致
		sp = await openSp({ roster: Object.assign({}, R1, { race: plan.raceRow, outsideOptions: { skillPins: [plan.raceId] } }) });
		await openModal(sp.page);
		r = await rowsOf(sp.page);
		assert(r[0].id === plan.raceId && r[0].reason === 'race' && r[0].reasonText === 'レース条件不一致' && r[0].disabled, 'ピン画面(6) 選んだレースの条件に合わないピンは「レース条件不一致」', r[0]);
		await sp.ctx.close();
		// 組み合わせなし（検査用の口で判定を ng にして開く）→ ピンを外すと普通の行に戻る
		sp = await openSp();
		await openModal(sp.page);
		const x = (await listIds(sp.page))[3];
		await closeModal(sp.page);
		await sp.page.evaluate((id) => { UmaSkillDeckCore.outside.setOptions({ skillPins: [id] }); UmaSkillDeckCore.outside.setPinJudge(() => ({ result: 'ng' })); }, x);
		await openModal(sp.page);
		r = await rowsOf(sp.page);
		const noneRow = r[0];
		const dup = r.filter((y) => y.id === x).length;
		const t2 = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-modal"]').textContent);
		await judgeOff(sp.page);
		assert(noneRow.id === x && noneRow.reason === 'none' && noneRow.reasonText === '組み合わせなし' && noneRow.disabled && !noneRow.checked && dup === 1 && JSON.stringify(await saved(sp.page)) === JSON.stringify([x]) && t2.indexOf('含め') === -1,
			'ピン画面(6) 組み合わせが無いピンは「組み合わせなし」の行（1行だけ・チェックは押せない・保存は残る）。ほかの行はピンなしで計算した結果', { noneRow, dup });
		await pressPin(sp.page, x);
		r = await rowsOf(sp.page);
		const back = r.find((y) => y.id === x);
		assert(back && !back.pinned && back.pin === 'false' && !back.disabled && !back.reason && (await saved(sp.page)) === null, 'ピン画面(6) 「組み合わせなし」の行のピンを外すと、普通の行に戻る（保存の項目も消える）', back);
		assert(jsErrors(sp.errors).length === 0, 'ピン画面(6) 組み合わせなし: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン画面(7) ②に追加済みのピン（added）: 必ず含む対象から外れ、行は普通の追加済みの行（ピンを置かない・同じ幅の空き）・保存は残る', async () => {
		let sp = await openSp();
		await openModal(sp.page);
		const id = (await listIds(sp.page))[2];
		await sp.ctx.close();
		sp = await openSp({ roster: Object.assign({}, R1, { outsideOptions: { skillPins: [id] } }), scope: { skillIds: [id] } });
		await openModal(sp.page);
		const r = await rowsOf(sp.page);
		const row = r.find((x) => x.id === id);
		const res = await sp.page.evaluate(() => UmaSkillDeckCore.outside.heldProblem().result.pins);
		const spW = await sp.page.evaluate((sid) => { const e = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-row"][data-skill-id="' + sid + '"] .usd-out-pin-sp'); return e ? e.getBoundingClientRect().width : null; }, id);
		assert(row && row.added && row.pin === null && row.spacer && spW === 20 && !r.some((x) => x.pinned) && JSON.stringify(await saved(sp.page)) === JSON.stringify([id])
			&& res && res.rejected.some((x) => x.skillId === id && x.reason === 'added'), 'ピン画面(7) 追加済みのピンは普通の追加済みの行（ピンなし・幅 20px の空き・最上段にしない）・結果では added・保存は残る', { row, res, spW });
		assert(jsErrors(sp.errors).length === 0, 'ピン画面(7) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン画面(8) トースト「' + MSG + '」は 375px・320px で2行以内', async () => {
		for (const w of [375, 320]) {
			const sp = await openSp({ w, h: 700 });
			await openModal(sp.page);
			const id = (await listIds(sp.page))[1];
			await forceNg(sp.page);
			await sp.page.click(pinSel(id));
			await sp.page.waitForTimeout(400);
			const m = await sp.page.evaluate(() => { const e = document.getElementById('toast-message'); const cs = getComputedStyle(e); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5; const r = e.getBoundingClientRect(); const t = document.getElementById('toast').getBoundingClientRect();
				return { text: e.textContent, h: r.height, lh, lines: Math.round(r.height / lh), left: t.left, right: t.right, vw: innerWidth, scrollW: document.documentElement.scrollWidth }; });
			console.log('     [実測] トースト ' + w + 'px: ' + m.lines + '行（高さ ' + m.h + 'px・行の高さ ' + m.lh + 'px）');
			assert(m.text === MSG && m.lines <= 2 && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.vw, 'ピン画面(8) ' + w + 'px: トーストは2行以内・画面からはみ出さない', m);
			await judgeOff(sp.page);
			await sp.ctx.close();
		}
	});

	await block('ピン画面(9) 保存の読み（ルール28）: 項目なし・壊れた値（引けない・重複・文字列でない）は読まないが書き換えない・開いて計算しても保存データは1バイトも同じ／取り込みの「元に戻す」で復元したデータが変わらない', async () => {
		let sp = await openSp();
		const id = (await sp.page.evaluate(() => UmaSkillDeckCore.outside.solveSync({ roster: JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')), addedSkillIds: [], deadlineMs: 30000 }).skills[0].skillId));
		const rd = await sp.page.evaluate((sid) => { const C = UmaSkillDeckCore.outside; return { a: C.optionsOf({ outsideOptions: { skillPins: ['zz-none', 3, sid, sid, null] } }).skillPins, b: C.optionsOf({}).skillPins, c: C.optionsOf({ outsideOptions: { skillPins: 'x' } }).skillPins }; }, id);
		assert(JSON.stringify(rd.a) === JSON.stringify([id]) && rd.b.length === 0 && rd.c.length === 0, 'ピン画面(9) 読むときは、引けない・重複・文字列でないものを読まない（項目なし・配列でないものは空）', rd);
		await sp.ctx.close();
		const mk = (pins) => ({ schemaVersion: 7, records: [], customSkills: [], templates: [{ templateId: 't1', name: 'S1', skillIds: [], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }],
			rosters: [Object.assign({ rosterId: 'r1', name: 'S1', star: 3, awakeningLevel: 5, createdAt: 'x', updatedAt: 'x' }, R1, pins === undefined ? {} : { outsideOptions: { skillPins: pins } })] });
		for (const [tag, seed] of [['項目なし', mk(undefined)], ['壊れた値', mk(['zz-none', id, id, 5])]]) {
			sp = await openSp({ userData: seed, roster: null });
			await sp.page.click(BAR + '[data-usd-act="set-list"]');
			await sp.page.click('[data-usd-el="set-list"] input[value="t1"]');
			await sp.page.waitForTimeout(250);
			await openModal(sp.page);
			const raw = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
			const r = await rowsOf(sp.page);
			assert(raw === JSON.stringify(seed) && (tag === '項目なし' ? !r.some((x) => x.pinned) : (r[0].id === id && r[0].pinned && r.filter((x) => x.pinned).length === 1)),
				'ピン画面(9) ' + tag + ': 開いて計算しても保存データは1バイトも変わらない' + (tag === '壊れた値' ? '（読めるピン1つだけが最上段）' : ''), r.slice(0, 2).map((x) => x.id));
			await sp.ctx.close();
		}
		// Deck の取り込み → 元に戻す
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, mk(['zz-none', id, id, 5]));
		await dk.page.click('#tab-btn-data');
		await dk.page.waitForTimeout(300);
		const state = () => dk.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const before = await state();
		const other = mk([id]);
		other.templates[0].name = 'S9';
		const done = await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = JSON.stringify(v); const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; return UmaSkillDeckCore.getUserData().templates.map((t) => t.name); }, other);
		const un = await dk.page.evaluate(() => ({ ok: performUndo(), toast: document.getElementById('toast-message').textContent }));
		await dk.page.waitForTimeout(300);
		const after = await state();
		assert(JSON.stringify(done) === '["S9"]' && un.ok && after === before && after.indexOf('"skillPins":["zz-none","' + id + '","' + id + '",5]') !== -1,
			'ピン画面(9) 取り込み → 元に戻す: 復元したデータ（壊れたピンの値を含む）が書き換わらない（メモリと保存先が取り込み前と一致）', { done, un });
		assert(dk.errors.length === 0, 'ピン画面(9) Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
	});
}
