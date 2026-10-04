// 本育成サポカ外スキル「オススメサポ」（段3 入口と小窓・段4 追加の動き。2026-10-04・C-123）の検査。run-smoke.mjs の末尾から register11() で呼ばれる
// （塊の見出しはすべて「オススメサポ」で始まる。`npm run test:visual -- --only=オススメサポ` で回せる。
// 「段11」は72セッション目の入口の検査がすでに使っている見出しなので使わない）。
//
// 段3: ②の帯のボタン・開く前の条件（エラーの知らせ）・小窓（枚数の切り替え・カード・除外・チェックリスト・フッター・打ち切り・計算中・候補なし）
// 段4: 「追加」（②へ。元に戻す・アイコン・0件で押せない）
// 純粋関数の検査は blocks-10.mjs（段10）。ここは画面と、画面に出る数字が純粋関数の結果と食い違わないことを見る。
// 小窓の中のスキル名・カード名は画面に出る文字として読むだけで、検査の側に名前は書かない（恒久ルール1）。

export async function register11(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const scenReal = readJson('data/scenario-event-skills.json');
	const ptReal = readJson('data/skill-pt.json');
	const master = readJson('uma-skill-deck-skills.json').skills;
	const FILTER = { distance: 'medium', style: 'senko', surface: 'turf' };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: FILTER };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const P = '#deck-roster-panel ';
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const M = '[data-usd-el="outside-modal"] ';
	const OPEN = '[data-usd-el="outside-open"]';
	const MSG_NEED = '先に①本育成編成を設定してください';
	const MSG_PENDING = '①でイベントの選択が済んでいないものがあります';
	const MSG_PARTIAL = '途中の結果です（時間内に探し切れませんでした）';
	const MSG_EMPTY = '提案できるサポカがありません';
	const HELP = '本育成のサポカで得られない対象スキルを、できるだけ多く得られる組み合わせです。ランダムイベントのスキルも数えます。追加済みのスキルも数えます。金スキルの前段の白は、金スキルと合わせて1種ですが、金スキルによる因子化率を加味してオススメしています。';
	const whiteIds = ptReal.entries.filter((e) => e.rarity === 'white').map((e) => e.skillId);
	const masterWhite = master.filter((s) => whiteIds.indexOf(s.id) !== -1).map((s) => s.id);

	/** special.html を開く（②の因子周回タブ）。roster＝下書きの①（null で無し）、userData＝保存データ、scope＝下書きの②。ptDrop＝skill-pt.json から外すスキルID */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, o.userData || EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		if (o.syn) {
			await sp.page.route('**/data/support-cards.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'supportCard', nextSerial: 'card-9999', note: 'x', entries: o.syn.cards })));
			await sp.page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'supportCardEventSkill', note: 'x', entries: o.syn.events })));
			await sp.page.route('**/data/character-event-skills.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'characterEventSkill', note: 'x', entries: [] })));
		}
		if (o.ptDrop) {
			await sp.page.route('**/data/skill-pt.json*', (r) => r.fulfill(json(Object.assign({}, ptReal, { entries: ptReal.entries.filter((e) => o.ptDrop.indexOf(e.skillId) === -1) }))));
		}
		await sp.page.evaluate(({ roster, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster === undefined ? FULL : o.roster, scope: o.scope || null });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForSelector(T + OPEN, { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const pickSet = async (page, id) => {
		await page.click(BAR + '[data-usd-act="set-list"]');
		// 段13・B2: 読み込み直すと直前のセットが開くので、すでに選ばれていたら一覧を閉じるだけ（押しても change が起きず一覧が残るため）
		const already = await page.evaluate((v) => { const i = document.querySelector('[data-usd-el="set-list"] input[value="' + v + '"]'); return !!i && i.checked; }, id);
		if (already) await page.keyboard.press('Escape');
		else await page.click('[data-usd-el="set-list"] input[value="' + id + '"]');
		await page.waitForTimeout(250);
	};
	const SAVED = (extra) => ({ schemaVersion: 7, records: [], customSkills: [], templates: [
		{ templateId: 't1', name: 'S1', skillIds: [], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' },
		{ templateId: 't2', name: 'S2', skillIds: [], createdAt: 'x', updatedAt: 'x' }],
		rosters: [Object.assign({ rosterId: 'r1', name: 'S1', umaId: FULL.umaId, star: 3, awakeningLevel: 5, cardIds: CARDS6.slice(), skillFilter: FILTER, createdAt: 'x', updatedAt: 'x' }, extra || {})] });
	const ud = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData')));
	const rawUd = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
	const draftRoster = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));
	const draftScope = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')));
	const clearToast = (page) => page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
	const toastText = (page) => page.evaluate(() => document.getElementById('toast-message').textContent);
	const toastShown = (page) => page.evaluate(() => !document.getElementById('toast').classList.contains('opacity-0'));
	const modalOpen = (page) => page.evaluate(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden; });
	const settle = (page) => page.waitForFunction(() => {
		const m = document.querySelector('[data-usd-el="outside-modal"]');
		return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]');
	}, null, { timeout: 20000 });
	const open = async (page) => { await page.click(T + OPEN); await settle(page); };
	/** 枚数を変える（④・段10 で「5枚｜6枚」の切り替えを、見出し行の「5枚 ▾」の選択欄に置き換えた） */
	const setCount = async (page, n) => {
		await page.click(M + '[data-usd-el="outside-count-btn"]');
		await page.click('[data-usd-el="outside-count-list"] [data-usd-el="outside-count-' + n + '"]');
		await settle(page);
	};
	/** 小窓の中身を読む */
	const snap = (page) => page.evaluate(() => {
		const m = document.querySelector('[data-usd-el="outside-modal"]');
		const q = (s) => m.querySelector(s);
		const txt = (s) => { const e = q(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
		const foot = q('[data-usd-el="outside-foot"]');
		return {
			count: ((/^(\d)枚/.exec(txt('[data-usd-el="outside-count-btn"]') || '')) || [])[1] || '',   // ④・段10: 見出し行の「5枚 ▾」のボタンの数
			cards: Array.from(m.querySelectorAll('[data-usd-el="outside-card"]')).map((c) => ({ id: c.getAttribute('data-card-id'), text: c.textContent.replace(/\s+/g, ' ').trim(), gain: Number(/＋(\d+)種/.exec(c.querySelector('[data-usd-el="outside-card-gain"]').textContent)[1]) })),
			excl: txt('[data-usd-el="outside-excl-toggle"]'),
			exclCards: Array.from(m.querySelectorAll('[data-usd-el="outside-excl-card"]')).map((c) => ({ id: c.getAttribute('data-card-id'), text: c.textContent.replace(/\s+/g, ' ').trim() })),
			rows: Array.from(m.querySelectorAll('[data-usd-el="outside-row"]')).map((r) => {
				const box = r.querySelector('input');
				return { id: r.getAttribute('data-skill-id'), name: r.querySelector('.usd-out-name').textContent, added: r.classList.contains('usd-row--excluded'), checked: box.checked, disabled: box.disabled,
					pt: (r.querySelector('[data-usd-el="outside-row-pt"]') || {}).textContent || null, mark: (r.querySelector('[data-usd-el="outside-added-mark"]') || {}).textContent || null };
			}),
			total: txt('[data-usd-el="outside-total"]'), selected: txt('[data-usd-el="outside-selected"]'),
			footHidden: foot.hidden, footState: foot.getAttribute('data-state'),
			partial: (() => { const e = q('[data-usd-el="outside-partial"]'); return e && !e.hidden ? e.textContent : null; })(),
			addDisabled: q('[data-usd-el="outside-add"]').disabled, addText: txt('[data-usd-el="outside-add"]'),
			recalc: !q('[data-usd-el="outside-recalc"]').hidden, recalcText: txt('[data-usd-el="outside-recalc"]'), restoreAll: txt('[data-usd-el="outside-restore-all"]'),
			exSkills: Array.from(m.querySelectorAll('[data-usd-el="outside-excl-skill"]')).map((e) => ({ id: e.getAttribute('data-skill-id'), text: e.textContent.replace(/\s+/g, ' ').trim() })),
			empty: txt('[data-usd-el="outside-empty"]'), busy: txt('[data-usd-el="outside-busy"]')
		};
	});
	const numOf = (s) => Number(String(s || '').replace(/[^0-9-]/g, ''));
	/** 画面に出ている数字（「得られるスキル XX種（金スキル X種）」・「選択 N種・M Pt＋未収録 K種」）を読む */
	const parseFoot = (s) => {
		const t = /^得られるスキル (\d+)種（金スキル (\d+)種）$/.exec(s.total || '');
		const sel = /^選択 (\d+)種・([\d,]+) Pt(?:＋未収録 (\d+)種)?$/.exec(s.selected || '');
		return { kinds: t ? Number(t[1]) : null, gold: t ? Number(t[2]) : null, n: sel ? Number(sel[1]) : null, pt: sel ? Number(sel[2].replace(/,/g, '')) : null, unpriced: sel ? Number(sel[3] || 0) : null };
	};
	/** 純粋関数の結果（画面と突き合わせる） */
	const solveIn = (page, args) => page.evaluate((a) => UmaSkillDeckCore.outside.solveSync(Object.assign({ deadlineMs: 20000 }, a)), args);

	/* ====================================================================
	 * (A) 入口: 開く前の条件（エラーの知らせ）
	 * ==================================================================== */
	await block('オススメサポ(A) 開く前の条件: 育成ウマ娘が未選択／サポカが5枚以下／距離・脚質・バ場のどれかが指定なし／①が空のセット → 小窓を開かず、知らせだけを出す', async () => {
		const cases = [
			['育成ウマ娘が未選択', Object.assign({}, FULL, { umaId: '' })],
			['サポカが5枚（6枚めが空き）', Object.assign({}, FULL, { cardIds: CARDS6.slice(0, 5).concat([null]) })],
			['サポカが1枚だけ', Object.assign({}, FULL, { cardIds: [CARDS6[0], null, null, null, null, null] })],
			['距離が指定なし', Object.assign({}, FULL, { skillFilter: { style: 'senko', surface: 'turf' } })],
			['脚質が指定なし', Object.assign({}, FULL, { skillFilter: { distance: 'medium', surface: 'turf' } })],
			['バ場が指定なし', Object.assign({}, FULL, { skillFilter: { distance: 'medium', style: 'senko' } })],
			['3つとも指定なし', Object.assign({}, FULL, { skillFilter: {} })],
			['知らない値（「指定なし」と同じ扱い）', Object.assign({}, FULL, { skillFilter: { distance: 'none', style: 'senko', surface: 'turf' } })],
			['下書きの①が空（roster が無い）', null]
		];
		for (const [label, roster] of cases) {
			const sp = await openSp({ roster });
			await clearToast(sp.page);
			const before = await sp.page.evaluate(() => ({ ud: localStorage.getItem('umaSkillDeck:userData'), dr: localStorage.getItem('umaSkillDeck:draftRoster:special') }));
			await sp.page.click(T + OPEN);
			await sp.page.waitForTimeout(400);
			const after = await sp.page.evaluate(() => ({ ud: localStorage.getItem('umaSkillDeck:userData'), dr: localStorage.getItem('umaSkillDeck:draftRoster:special'), modal: !!document.querySelector('[data-usd-el="outside-modal"]') }));
			assert(!(await modalOpen(sp.page)) && after.modal === false && await toastText(sp.page) === MSG_NEED && await toastShown(sp.page) && after.ud === before.ud && after.dr === before.dr,
				'オススメサポ(A) ' + label + ': 小窓を開かず（小窓の部品も作らず）、「' + MSG_NEED + '」とだけ知らせる。保存データは変わらない', { open: await modalOpen(sp.page), toast: await toastText(sp.page), modal: after.modal });
			assert(jsErrors(sp.errors).length === 0, 'オススメサポ(A) ' + label + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// 保存済みで①が空のセット（baseRosterId が無い）
		const sp = await openSp({ userData: SAVED(), roster: null });
		await pickSet(sp.page, 't2');
		await clearToast(sp.page);
		await sp.page.click(T + OPEN);
		await sp.page.waitForTimeout(400);
		assert(!(await modalOpen(sp.page)) && await toastText(sp.page) === MSG_NEED, 'オススメサポ(A) 保存済みで①が空のセット: 小窓を開かず、同じ知らせを出す', await toastText(sp.page));
		// 条件がそろったセット（t1）では開く
		await pickSet(sp.page, 't1');
		await open(sp.page);
		assert(await modalOpen(sp.page), 'オススメサポ(A) 条件がそろった保存済みのセットでは小窓が開く', true);
		await sp.ctx.close();
	});

	await block('オススメサポ(A) 「指定なし」「△」の定義: ①の絞り込みの「指定なし」は resolvedFilterOf にキーが無いこと／△は①の「！」（pending のイベント）', async () => {
		const sp = await openSp({ roster: FULL });
		const r = await sp.page.evaluate(() => {
			const C = UmaSkillDeckCore;
			const dom = {
				selects: Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-act="filter"]')).map((s) => ({ axis: s.getAttribute('data-axis'), value: s.value })),
				alerts: document.querySelectorAll('#deck-roster-panel [data-usd-el="events-btn"][data-unselected]').length
			};
			const unsel = Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="events-btn"]')).reduce((s, b) => s + Number(b.getAttribute('data-unselected') || 0), 0);
			return { dom, unsel, keys: C.ROSTER_FILTER_AXIS_KEYS };
		});
		assert(r.keys.join() === 'distance,style,surface' && r.dom.selects.length === 3 && r.dom.selects.every((s) => s.value !== ''), 'オススメサポ(A) ①の絞り込みの3軸（距離・脚質・バ場）が設定済み（「指定なし」は選択値が空）', r);
		assert(r.unsel > 0, 'オススメサポ(A) ①の列見出しに「！」（未選択のイベント）がある ＝ △あり', r);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (B) 開く・△の知らせ・5枚から・切り替え・保存されない
	 * ==================================================================== */
	await block('オススメサポ(B) 開く: 条件がそろえば開く／△があれば選択漏れの知らせを1回だけ出して計算もする／△が無ければ出さない', async () => {
		const sp = await openSp({ roster: FULL });
		// 知らせの回数を数える（トーストの文字が書き込まれるたびに記録）
		await sp.page.evaluate((msg) => {
			window.__toasts = [];
			new MutationObserver(() => { window.__toasts.push(document.getElementById('toast-message').textContent); }).observe(document.getElementById('toast-message'), { childList: true, characterData: true, subtree: true });
		}, MSG_PENDING);
		await clearToast(sp.page);
		await sp.page.evaluate(() => { window.__toasts = []; });
		await open(sp.page);
		const s0 = await snap(sp.page);
		const toasts = await sp.page.evaluate(() => window.__toasts.slice());
		assert(await modalOpen(sp.page) && s0.cards.length === 5 && s0.rows.length > 0 && await toastText(sp.page) === MSG_PENDING && toasts.filter((t) => t === MSG_PENDING).length === 1,
			'オススメサポ(B) △ありの①: 小窓が開き（カード5枚・スキルの行あり＝計算もした）、「' + MSG_PENDING + '」を1回出す', { cards: s0.cards.length, rows: s0.rows.length, toasts });
		// 計算し直しても（枚数の切り替え・外す・戻す）、もう知らせない
		await setCount(sp.page, 6);
		await sp.page.click(M + '[data-usd-el="outside-exclude"]'); await settle(sp.page);
		const toasts2 = await sp.page.evaluate(() => window.__toasts.slice());
		assert(toasts2.filter((t) => t === MSG_PENDING).length === 1, 'オススメサポ(B) 知らせは小窓を開いた直後の1回だけ（再計算では出さない）', toasts2);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(B) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// △が無い①: 選ぶ必要のあるイベント（絞り込みを使わない判定の上位集合）を、すべて先頭の選択肢で選んだ①にする
		const probe = await openSp({ roster: FULL });
		const noPend = await probe.page.evaluate((cs) => {
			const C = UmaSkillDeckCore;
			const r0 = { umaId: 'uma-0001', cardIds: cs };
			const before = C.computeRosterSkills(r0, { autoChoose: true });
			const choices = {};
			before.events.forEach((e) => { if (e.pending) choices[e.eventKey] = 0; });
			const after = C.computeRosterSkills(Object.assign({ eventChoices: choices }, r0), { autoChoose: true, eventChoices: choices });
			return { choices: choices, n: Object.keys(choices).length, pending: after.events.some((e) => e.pending) };
		}, CARDS6);
		await probe.ctx.close();
		assert(noPend.n > 0 && noPend.pending === false, 'オススメサポ 前提: ①の選ぶ必要のあるイベント（' + noPend.n + '件）をすべて選んだ①を作れる', { n: noPend.n, pending: noPend.pending });
		const sp2 = await openSp({ roster: Object.assign({}, FULL, { eventChoices: noPend.choices }) });
		const unsel2 = await sp2.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="events-btn"]')).reduce((s, b) => s + Number(b.getAttribute('data-unselected') || 0), 0));
		await clearToast(sp2.page);
		await open(sp2.page);
		const s1 = await snap(sp2.page);
		assert(unsel2 === 0 && await modalOpen(sp2.page) && s1.rows.length > 0 && await toastText(sp2.page) !== MSG_PENDING,
			'オススメサポ(B) △なしの①（列見出しに「！」なし）: 小窓は開き、計算もして、選択漏れの知らせは出ない', { unsel2, rows: s1.rows.length, toast: await toastText(sp2.page) });
		await sp2.ctx.close();
	});

	// ④・段10 で書き直した: 「開くたびに5枚から・切り替えは保存しない」は廃止（セットごとに保存する）。枚数は4・5・6。保存の規則の細部は blocks-12 の段10
	await block('オススメサポ(B) 指定の無いセットは5枚から・4枚／5枚／6枚の切り替えで結果が変わる・切り替えはセットに保存され、開き直しても残る・既定は5枚', async () => {
		const sp = await openSp({ roster: FULL });
		const d0 = await sp.page.evaluate(() => ({ choices: UmaSkillDeckCore.outside.COUNT_CHOICES, def: UmaSkillDeckCore.outside.COUNT_DEFAULT }));
		const def = await solveIn(sp.page, { roster: {}, addedSkillIds: [] });
		assert(d0.def === 5 && d0.choices.join() === '4,5,6' && def.count === 5 && def.cards.length === 5, 'オススメサポ(B) 既定の枚数は5枚（count も指定も無い計算が5枚）・選択肢は4・5・6', { d0, count: def.count, n: def.cards.length });
		const raw0 = { ud: await rawUd(sp.page), sc: await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftScope:special')) };
		await open(sp.page);
		const a = await snap(sp.page);
		await setCount(sp.page, 6);
		const b = await snap(sp.page);
		await setCount(sp.page, 4);
		const c4 = await snap(sp.page);
		const exp = {};
		for (const n of [4, 5, 6]) exp[n] = await solveIn(sp.page, { count: n, addedSkillIds: [] });
		assert(a.count === '5' && a.cards.length === 5 && b.count === '6' && b.cards.length === 6 && c4.count === '4' && c4.cards.length === 4
			&& parseFoot(a).kinds === exp[5].counts.kinds && parseFoot(b).kinds === exp[6].counts.kinds && parseFoot(c4).kinds === exp[4].counts.kinds && parseFoot(b).kinds >= parseFoot(a).kinds && parseFoot(a).kinds >= parseFoot(c4).kinds,
			'オススメサポ(B) 指定の無いセットは5枚から。6枚・4枚に切り替えると、その枚数の結果に変わる（カード数・得られる種数が純粋関数の結果と一致）', { a: [a.count, a.cards.length, a.total], b: [b.count, b.cards.length, b.total], c4: [c4.count, c4.cards.length, c4.total] });
		const mid = { ud: await rawUd(sp.page), dr: await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))), sc: await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftScope:special')) };
		assert(mid.ud === raw0.ud && mid.sc === raw0.sc && JSON.stringify(mid.dr.outsideOptions) === JSON.stringify({ count: 4 }),
			'オススメサポ(B) 枚数はセット（①の下書き）の outsideOptions に保存される。②の下書き・保存済みのデータは変わらない（チェックは保存しない）', { dr: mid.dr.outsideOptions, ud: mid.ud === raw0.ud, sc: mid.sc === raw0.sc });
		// 閉じて開き直す → 保存した枚数のまま
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		assert(!(await modalOpen(sp.page)), 'オススメサポ(B) × で閉じる', true);
		await open(sp.page);
		const c = await snap(sp.page);
		assert(c.count === '4' && c.cards.length === 4, 'オススメサポ(B) 開き直すと、保存した枚数（4枚）で計算する', { count: c.count, n: c.cards.length });
		// 5枚に戻すと、項目ごと消える（既定と同じ）
		await setCount(sp.page, 5);
		const dr5 = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));
		assert(!('outsideOptions' in dr5) && (await snap(sp.page)).count === '5', 'オススメサポ(B) 5枚に戻すと、指定の項目ごと消える', Object.keys(dr5));
		// 背景を押しても閉じる
		await sp.page.mouse.click(5, 5);
		await sp.page.waitForTimeout(200);
		assert(!(await modalOpen(sp.page)), 'オススメサポ(B) 小窓の外（背景）を押しても閉じる', true);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(B) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (C) カード: ＋N種・外す・除外中・戻す・保存
	 * ==================================================================== */
	await block('オススメサポ(C) カード: 2列・高さ36px・「キャラクター名 ＋N種 外す」・＋N種の合計が「得られるスキル XX種」と一致・増分の大きい順', async () => {
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		for (const n of ['5', '6']) {
			if (n === '6') { await setCount(sp.page, 6); }
			const s = await snap(sp.page);
			const f = parseFoot(s);
			const geo = await sp.page.evaluate(() => {
				const cs = Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]'));
				const r = cs.map((c) => { const b = c.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width), over: c.scrollWidth > c.clientWidth + 1 }; });
				const body = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-body"]');
				const nm = cs[0].querySelector('.usd-out-card-name');
				return { r, cols: new Set(r.map((x) => x.l)).size, rowsN: new Set(r.map((x) => x.t)).size, hs: Array.from(new Set(r.map((x) => x.h))), ell: getComputedStyle(nm).textOverflow, ws: getComputedStyle(nm).whiteSpace,
					texts: cs.map((c) => c.textContent.replace(/\s+/g, ' ').trim()), within: r.every((x) => x.l >= 0 && x.l + x.w <= window.innerWidth), over: r.some((x) => x.over), bodyOver: body.scrollWidth - body.clientWidth };
			});
			const sum = s.cards.reduce((t, c) => t + c.gain, 0);
			assert(sum === f.kinds && s.cards.length === Number(n), 'オススメサポ(C) ' + n + '枚: ＋N種の合計（' + sum + '）が「得られるスキル XX種」（' + f.kinds + '）と一致する', { gains: s.cards.map((c) => c.gain), kinds: f.kinds });
			assert(s.cards.every((c, i) => i === 0 || c.gain <= s.cards[i - 1].gain), 'オススメサポ(C) ' + n + '枚: カードは増分の大きい順', s.cards.map((c) => c.gain));
			assert(geo.cols === 2 && geo.rowsN === Math.ceil(Number(n) / 2) && geo.hs.join() === '36' && geo.ell === 'ellipsis' && geo.ws === 'nowrap' && geo.within && geo.bodyOver <= 0,
				'オススメサポ(C) ' + n + '枚: カードは2列・各36px・名前は長いとき省略（…）・はみ出さない（行数 ' + geo.rowsN + '）', geo);
			assert(geo.texts.every((t) => /^\S.*＋\d+種外す$/.test(t)), 'オススメサポ(C) ' + n + '枚: 各カードは「[二つ名]キャラクター名 ＋N種 外す」', geo.texts);
		}
		const exp = await solveIn(sp.page, { count: 6, addedSkillIds: [] });
		const s6 = await snap(sp.page);
		assert(JSON.stringify(s6.cards.map((c) => c.id).sort()) === JSON.stringify(exp.cards.map((c) => c.cardId).sort()), 'オススメサポ(C) 6枚: 小窓のカードが純粋関数の結果と同じ顔ぶれ', { ui: s6.cards.map((c) => c.id), exp: exp.cards.map((c) => c.cardId) });
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(C) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ(C) 外す・除外中・戻す: その場で除外して再計算／「除外中 N枚」は1枚以上のときだけ／戻すで解除／①の次の書き込みのあとも残る', async () => {
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		const a = await snap(sp.page);
		assert(a.excl === null, 'オススメサポ(C) 除外が0枚のとき、「除外中」の行は出ない', a.excl);
		// 再計算が走ったかを、描き直しで作り直されるカードの要素の印で見る
		await sp.page.evaluate(() => { document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').__mark = 1; });
		const victim = a.cards[0].id;
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="' + victim + '"]');
		await settle(sp.page);
		const b = await snap(sp.page);
		const dr = await draftRoster(sp.page);
		const exp = await solveIn(sp.page, { count: 5, addedSkillIds: [] });
		assert(b.cards.every((c) => c.id !== victim) && b.cards.length === 5 && JSON.stringify(dr.outsideCardExcluded) === JSON.stringify([victim]) && parseFoot(b).kinds === exp.counts.kinds && b.cards.map((c) => c.id).join() === exp.kindOrder.join(),
			'オススメサポ(C) 「外す」で、そのカードを①の roster.outsideCardExcluded に書き、再計算して別のカードで5枚を埋める（結果は純粋関数と一致）', { cards: b.cards.map((c) => c.id), saved: dr.outsideCardExcluded });
		assert(b.excl === '除外中 カード1枚 ▾' && b.exclCards.length === 0, 'オススメサポ(C) 除外が1枚になると「除外中 カード1枚 ▾」の行が出る（一覧はまだ閉じている）', b.excl);
		await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');
		const c = await snap(sp.page);
		const geo = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-excl-card"]')).map((e) => ({ h: Math.round(e.getBoundingClientRect().height), btn: (e.querySelector('[data-usd-el="outside-restore"]') || {}).textContent })));
		assert(c.exclCards.length === 1 && c.exclCards[0].id === victim && /戻す$/.test(c.exclCards[0].text) && geo[0].btn === '戻す' && geo[0].h === 36 && /除外中 カード1枚 ▴/.test(c.excl), 'オススメサポ(C) 押すと除外したカードの一覧が開き、各カードに「戻す」がある', { c: c.exclCards, geo });
		// ①の次の書き込み（スキルのオン/オフ）のあとも残る。受け口を通さず保存データへ直接書いていると、①の古い roster で上書きされて消える
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		await sp.page.evaluate(() => document.querySelector('#deck-roster-panel input[data-usd-act="take-skill"]').click());
		await sp.page.waitForTimeout(300);
		const dr2 = await draftRoster(sp.page);
		assert(JSON.stringify(dr2.outsideCardExcluded) === JSON.stringify([victim]) && Array.isArray(dr2.offSkillIds), 'オススメサポ(C) ①で次の書き込み（スキルのオン/オフ）をしても、除外は消えない（①のメモリ上の roster 経由で書いている）', { ex: dr2.outsideCardExcluded, off: dr2.offSkillIds });
		await sp.page.evaluate(() => document.querySelector('#deck-roster-panel input[data-usd-act="take-skill"]').click());   // 戻す（①の●を元に）
		await sp.page.waitForTimeout(300);
		// 開き直しても除外は残り、「戻す」で解除される
		await open(sp.page);
		const d = await snap(sp.page);
		assert(d.excl === '除外中 カード1枚 ▾' && d.cards.every((x) => x.id !== victim), 'オススメサポ(C) 開き直しても除外は残っている（5枚に戻る切り替えとは別に、除外は保存される）', d.excl);
		await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');
		await sp.page.click(M + '[data-usd-el="outside-restore"][data-card-id="' + victim + '"]');
		await settle(sp.page);
		const e = await snap(sp.page);
		const dr3 = await draftRoster(sp.page);
		assert(e.excl === null && !('outsideCardExcluded' in dr3) && e.cards.map((x) => x.id).join() === a.cards.map((x) => x.id).join(),
			'オススメサポ(C) 「戻す」で除外が解除され（項目ごと消え）、再計算して最初の結果に戻る。0枚になった「除外中」の行は消える', { excl: e.excl, saved: dr3.outsideCardExcluded });
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(C) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ(C) 除外は書き出し・取り込み・再読み込みのあとも残る（保存済みのセット）', async () => {
		const sp = await openSp({ userData: SAVED(), roster: null });
		await pickSet(sp.page, 't1');
		await open(sp.page);
		const a = await snap(sp.page);
		const victim = a.cards[0].id;
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="' + victim + '"]'); await settle(sp.page);
		const victim2 = (await snap(sp.page)).cards[0].id;   // 再計算のあとの先頭のカード
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="' + victim2 + '"]'); await settle(sp.page);
		const d = await ud(sp.page);
		assert(JSON.stringify(d.rosters[0].outsideCardExcluded) === JSON.stringify([victim, victim2]) && d.schemaVersion === 7, 'オススメサポ(C) 保存済みのセットでは userData の roster に書く（schemaVersion は 7 のまま）', d.rosters[0].outsideCardExcluded);
		const exported = JSON.stringify(d);   // 書き出し（userData 全体）
		await sp.ctx.close();
		// 取り込み後（同じ中身のデータを入れて開く）と、再読み込み
		const sp2 = await openSp({ userData: JSON.parse(exported), roster: null });
		await pickSet(sp2.page, 't1');
		await open(sp2.page);
		const b = await snap(sp2.page);
		assert(b.excl === '除外中 カード2枚 ▾' && b.cards.every((c) => c.id !== victim && c.id !== victim2), 'オススメサポ(C) 書き出したデータを取り込んだあとも、除外は残っている', b.excl);
		// 再読み込み（openPage の初期化スクリプトは読み込みのたびに保存データを仕込み直すので、同じ context の新しいページで開き直す。保存先 localStorage は同じ）
		const pg = await sp2.ctx.newPage();
		await pg.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		await pg.goto(base + '/special.html', { waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await pg.isVisible('#ui-notice')) await pg.click('[data-act="notice-ok"]');
		await pg.waitForSelector(T + OPEN, { timeout: 10000 });
		await pg.waitForTimeout(300);
		await pickSet(pg, 't1');
		await open(pg);
		const c = await snap(pg);
		assert(c.excl === '除外中 カード2枚 ▾' && c.cards.every((x) => x.id !== victim && x.id !== victim2), 'オススメサポ(C) 再読み込みのあとも、除外は残っている', c.excl);
		await pg.close();
		assert(jsErrors(sp2.errors).length === 0, 'オススメサポ(C) コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});

	/* ====================================================================
	 * (D) チェックリストとフッター
	 * ==================================================================== */
	await block('オススメサポ(D) チェックリスト: 最初は全部チェック済み・行は「チェック／名前／Pt」・フッターの数字が純粋関数と一致・付け外しで N種・M Pt が変わり再計算は走らない', async () => {
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		const s = await snap(sp.page);
		const f = parseFoot(s);
		const exp = await solveIn(sp.page, { count: 5, addedSkillIds: [] });
		assert(s.rows.length === exp.skills.length && s.rows.every((r) => r.checked && !r.disabled && !r.added) && f.n === s.rows.length,
			'オススメサポ(D) 最初は全部チェック済み（行 ' + s.rows.length + '）。「選択 N種」は行の数', { rows: s.rows.length, n: f.n });
		assert(f.kinds === exp.counts.kinds && f.gold === exp.counts.gold && s.total === '得られるスキル ' + exp.counts.kinds + '種（金スキル ' + exp.counts.gold + '種）',
			'オススメサポ(D) 「得られるスキル XX種（金スキル X種）」が countSkillKinds の数え方（純粋関数の counts）と一致', { s: s.total, exp: exp.counts });
		const ptAll = await sp.page.evaluate((ids) => { const r = UmaSkillDeckCore.outside.ptOf(ids); return { total: r.total, unpriced: r.unpriced.length }; }, s.rows.map((r) => r.id));
		assert(f.pt === ptAll.total && f.unpriced === ptAll.unpriced, 'オススメサポ(D) 「M Pt」は、チェックした全スキルについて computeRosterPt を切れ者・ヒントLv5 固定で呼んだ合計（前段込み）と一致', { f, ptAll });
		// 行の Pt（そのスキルだけ）と、合計との関係を測る
		const own = await sp.page.evaluate((ids) => ids.map((id) => UmaSkillDeckCore.outside.ptOf([id]).own), s.rows.map((r) => r.id));
		const rowSum = s.rows.reduce((t, r, i) => t + (/^[\d,]+ Pt$/.test(r.pt || '') ? own[i] : 0), 0);
		assert(s.rows.every((r, i) => r.pt === 'Pt 未収録' || r.pt === 'Pt 不要' || r.pt === own[i].toLocaleString('en-US') + ' Pt') && ptAll.total >= rowSum,
			'オススメサポ(D) 行の Pt は、そのスキルだけの Pt（前段は含めない）。合計は前段も含むので、行の合計以上になる', { rowSum, total: ptAll.total });
		console.log('     [実測] 行の Pt の合計 ' + rowSum + ' ／ フッターの M Pt ' + ptAll.total + '（差 ' + (ptAll.total - rowSum) + '＝チェックしていない前段のぶん）');
		// 付け外し: 再計算は走らない（カード・チェックリストの要素が作り直されない）
		await sp.page.evaluate(() => { document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').__mark = 1; document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]').__mark = 1; });
		const target = s.rows.find((r) => /^[\d,]+ Pt$/.test(r.pt || ''));
		await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + target.id + '"] input');
		const t1 = parseFoot(await snap(sp.page));
		const own1 = await sp.page.evaluate((id) => UmaSkillDeckCore.outside.ptOf([id]).own, target.id);
		const rest = await sp.page.evaluate((ids) => UmaSkillDeckCore.outside.ptOf(ids).total, s.rows.filter((r) => r.id !== target.id).map((r) => r.id));
		assert(t1.n === f.n - 1 && t1.pt === rest && t1.pt <= f.pt && t1.pt < f.pt, 'オススメサポ(D) 1つ外すと、N種が1減り、M Pt がチェックの残りの合計に変わる（' + f.pt + ' → ' + t1.pt + '）', { f, t1, own1 });
		const marks = await sp.page.evaluate(() => ({ card: document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').__mark, row: document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]').__mark }));
		assert(marks.card === 1 && marks.row === 1, 'オススメサポ(D) チェックの付け外しでは再計算も描き直しもしない（カードとチェックリストの要素がそのまま）。フッターの数字だけを更新する', marks);
		await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + target.id + '"] input');
		const t2 = parseFoot(await snap(sp.page));
		assert(t2.n === f.n && t2.pt === f.pt && t2.kinds === f.kinds, 'オススメサポ(D) 付け直すと元の数字に戻る。得られるスキル XX種 は付け外しで変わらない', { f, t2 });
		// 全部外す → 追加は押せない・「選択 0種・0 Pt」
		for (const r of s.rows) await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + r.id + '"] input');
		const z = await snap(sp.page);
		assert(z.selected === '選択 0種・0 Pt' && z.addDisabled && parseFoot(z).kinds === f.kinds, 'オススメサポ(D) 全部外すと「選択 0種・0 Pt」。［追加］は押せない', z.selected);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(D) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ(D) 追加済みの行: 薄い行・「追加済み」・チェックできない・N種と Pt に含めない・得られるスキル XX種 には含める／Pt 未収録は「＋未収録 K種」が出て、チェックの付け外しで変わる', async () => {
		const probe = await openSp({ roster: FULL });
		const base0 = await solveIn(probe.page, { count: 5, addedSkillIds: [] });
		const pick = base0.skills.filter((s) => !s.viaGold).slice(0, 2).map((s) => s.skillId);
		// Pt 未収録の材料: 前段が無く、金の前段でもない白（②に入れても他の数に影響しない）
		const cand = base0.skills.map((s) => s.skillId).filter((id) => pick.indexOf(id) === -1 && masterWhite.indexOf(id) !== -1);
		const stepReal = readJson('data/skill-step-up.json');
		const linked = new Set(); stepReal.entries.forEach((e) => { linked.add(e.skillId); (e.prevSkillIds || []).forEach((p) => linked.add(p)); });
		const drop = cand.find((id) => !linked.has(id));
		const kinds0 = base0.counts.kinds;
		const unp0 = await probe.page.evaluate((ids) => UmaSkillDeckCore.outside.ptOf(ids).unpriced.length, base0.skills.map((s) => s.skillId));
		await probe.ctx.close();
		assert(pick.length === 2 && !!drop, 'オススメサポ(D) 前提: ②に先に入れる白2つと、Pt を外す白1つを用意できる', { pick, drop });

		const sp = await openSp({ roster: FULL, scope: { skillIds: pick, name: '', updatedAt: '', skillIcons: {} }, ptDrop: [drop] });
		await open(sp.page);
		const s = await snap(sp.page);
		const f = parseFoot(s);
		const added = s.rows.filter((r) => r.added);
		const normal = s.rows.filter((r) => !r.added);
		const look = await sp.page.evaluate((ids) => {
			const m = document.querySelector('[data-usd-el="outside-modal"]');
			const one = m.querySelector('[data-usd-el="outside-row"][data-skill-id="' + ids[0] + '"]');
			const nor = Array.from(m.querySelectorAll('[data-usd-el="outside-row"]')).find((r) => !r.classList.contains('usd-row--excluded'));
			return { addColor: getComputedStyle(one).color, norColor: getComputedStyle(nor).color, op: getComputedStyle(one).opacity, dis: one.querySelector('input').disabled, noCheckEl: !one.querySelector('[data-usd-el="outside-check"]') };
		}, pick);
		assert(added.length === 2 && added.map((r) => r.id).sort().join() === pick.slice().sort().join() && added.every((r) => r.mark === '追加済み' && !r.checked && r.disabled && r.pt === null)
			&& look.addColor !== look.norColor && look.op === '1' && look.dis && look.noCheckEl,
			'オススメサポ(D) ②にあるスキルは薄い行（色だけで表す・opacity は使わない）で「追加済み」と出し、チェックできない', { added: added.map((r) => [r.id, r.mark, r.checked, r.disabled]), look });
		assert(f.n === normal.length && normal.every((r) => r.checked) && f.kinds === kinds0, 'オススメサポ(D) 「選択 N種」は追加済みを含めない（' + f.n + '＝チェックできる行の数）。「得られるスキル XX種」には追加済みも含める（②が空のときと同じ ' + kinds0 + '種）', { f, normal: normal.length, kinds0 });
		const ptNo = await sp.page.evaluate((ids) => UmaSkillDeckCore.outside.ptOf(ids), normal.map((r) => r.id));
		assert(f.pt === ptNo.total, 'オススメサポ(D) 「M Pt」は追加済みを含めない', { f: f.pt, expect: ptNo.total });
		// Pt 未収録
		const dropRow = s.rows.find((r) => r.id === drop);
		assert(dropRow && dropRow.pt === 'Pt 未収録' && f.unpriced === unp0 + 1 && /＋未収録 \d+種$/.test(s.selected), 'オススメサポ(D) Pt が未収録のスキルがチェックに含まれると、Pt の後ろに「＋未収録 K種」が出る（行は「Pt 未収録」。' + s.selected + '）', { dropRow, unp0, f });
		await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + drop + '"] input');
		const t1 = parseFoot(await snap(sp.page));
		assert(t1.unpriced === unp0 && t1.n === f.n - 1, 'オススメサポ(D) その行のチェックを外すと「＋未収録」が1つ減る（チェックの付け外しで変わる）', { t1, unp0 });
		if (unp0 === 0) {
			const sel = (await snap(sp.page)).selected;
			assert(!/未収録/.test(sel), 'オススメサポ(D) 未収録のスキルがチェックに含まれなければ、「＋未収録」は出ない', sel);
		}
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(D) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (E) 打ち切り・計算中・候補なし
	 * ==================================================================== */
	await block('オススメサポ(E) 途中の結果の1行は締め切りに達したときだけ出る／計算中は「計算中…」／候補が1枚も無いときは「提案できるサポカがありません」（数字は出さない）', async () => {
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		const a = await snap(sp.page);
		assert(a.partial === null, 'オススメサポ(E) 締め切りに達しなければ、「途中の結果です」の行は出ない（通常）', a.partial);
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		// 締め切りを 0ms にして、途中の結果にする（検査用の差し替え）
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setDeadline(0));
		await open(sp.page);
		const b = await snap(sp.page);
		assert(b.partial === MSG_PARTIAL && !b.footHidden && b.cards.length === 5 && b.rows.length > 0, 'オススメサポ(E) 締め切りに達して途中の結果になったときだけ、フッターの上に1行「' + MSG_PARTIAL + '」を出す（結果は出す）', { partial: b.partial, rows: b.rows.length });
		const ord = await sp.page.evaluate(() => { const p = document.querySelector('[data-usd-el="outside-partial"]').getBoundingClientRect(), t = document.querySelector('[data-usd-el="outside-total"]').getBoundingClientRect(); return p.bottom <= t.top + 1; });
		assert(ord, 'オススメサポ(E) その1行は「得られるスキル XX種」の上にある', ord);
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setDeadline(null));
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		await open(sp.page);
		assert((await snap(sp.page)).partial === null, 'オススメサポ(E) 締め切りを戻して開き直すと、行は消える', true);
		// 計算中: 描き直しで一瞬でも「計算中…」が出る（開いた直後・外す・戻す・枚数の切り替え）
		await sp.page.evaluate(() => {
			window.__busy = [];
			new MutationObserver((recs) => recs.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) { const e = n.matches('[data-usd-el="outside-busy"]') ? n : n.querySelector('[data-usd-el="outside-busy"]'); if (e) window.__busy.push(e.textContent); } })))
				.observe(document.querySelector('[data-usd-el="outside-modal"]'), { childList: true, subtree: true });
		});
		await setCount(sp.page, 6);
		const first = (await snap(sp.page)).cards[0].id;
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="' + first + '"]'); await settle(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');
		await sp.page.click(M + '[data-usd-el="outside-restore"][data-card-id="' + first + '"]'); await settle(sp.page);
		const busy = await sp.page.evaluate(() => window.__busy.slice());
		assert(busy.length === 3 && busy.every((t) => t === '計算中…'), 'オススメサポ(E) 枚数の切り替え・外す・戻すのたびに、結果が出るまで「計算中…」を出す（3回）', busy);
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		await sp.page.evaluate(() => { window.__busy = []; });
		await sp.page.click(T + OPEN); await settle(sp.page);
		assert((await sp.page.evaluate(() => window.__busy.slice())).join() === '計算中…', 'オススメサポ(E) 小窓を開いた直後も「計算中…」を出す', true);
		// 候補が1枚も無い: 候補のカードをすべて除外する
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		const n = await sp.page.evaluate((cs) => { const ids = UmaSkillDeckCore.outside.candidatesOf({ cardIds: cs }).map((c) => c.id); ids.forEach((id) => UmaSkillDeckCore.outside.setExcluded(id, true)); return ids.length; }, CARDS6);
		await open(sp.page);
		const c = await snap(sp.page);
		assert(n > 100 && c.empty === MSG_EMPTY && c.rows.length === 0 && c.cards.length === 0 && c.footHidden && c.excl === '除外中 カード' + n + '枚 ▾',
			'オススメサポ(E) 候補が1枚も無いとき、「' + MSG_EMPTY + '」を出し、チェックリストとフッターの数字は出さない（「除外中 ' + n + '枚」は残る＝戻せる）', { n, empty: c.empty, rows: c.rows.length, foot: c.footHidden, excl: c.excl });
		await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');
		const one = (await snap(sp.page)).exclCards[0].id;
		await sp.page.click(M + '[data-usd-el="outside-restore"][data-card-id="' + one + '"]'); await settle(sp.page);
		const d = await snap(sp.page);
		assert(d.cards.length === 1 && d.cards[0].id === one && d.empty === null, 'オススメサポ(E) 1枚だけ戻すと、そのカードで計算し直す', { cards: d.cards.map((x) => x.id) });
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(E) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (F) 追加（段4）
	 * ==================================================================== */
	await block('オススメサポ(F) 追加: チェックされた白スキルだけが②に入り（アイコンは付けない＝既存の追加と同じ）、小窓が閉じ、「元に戻す」で戻る／0件のとき押せない', async () => {
		const probe = await openSp({ roster: FULL });
		const base0 = await solveIn(probe.page, { count: 5, addedSkillIds: [] });
		const whites = base0.skills.filter((s) => !s.viaGold).map((s) => s.skillId);
		await probe.ctx.close();
		const existing = whites.slice(0, 1);
		const sp = await openSp({ roster: FULL, scope: { skillIds: existing, name: '', updatedAt: '', skillIcons: { [existing[0]]: 'a' } } });
		await open(sp.page);
		const s = await snap(sp.page);
		const want = s.rows.filter((r) => !r.added).slice(0, 3).map((r) => r.id);
		for (const r of s.rows) { if (!r.added && want.indexOf(r.id) === -1) await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + r.id + '"] input'); }
		const pre = parseFoot(await snap(sp.page));
		await clearToast(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-add"]');
		await sp.page.waitForTimeout(300);
		const sc = await draftScope(sp.page);
		assert(!(await modalOpen(sp.page)) && sc.skillIds.length === 1 + 3 && sc.skillIds[0] === existing[0] && JSON.stringify(sc.skillIds.slice(1)) === JSON.stringify(want),
			'オススメサポ(F) チェックされた3種だけが②に（既存のスキルのあとへ）入り、小窓が閉じる', { skillIds: sc.skillIds, want, pre });
		assert(await toastText(sp.page) === '3種を追加しました' && await toastShown(sp.page), 'オススメサポ(F) 3種の追加は「元に戻す」付きの知らせ（「3種を追加しました」）', await toastText(sp.page));
		// アイコン: 既存のアイコンは保つ。足したものには付けない（既存の「テキストで検索」の追加と同じ）
		const icons = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]')).map((p) => [p.getAttribute('data-skill-id'), ((p.querySelector('[data-usd-act="skill-icon"]') || {}).dataset || {}).icon || '']));
		assert(sc.skillIcons[existing[0]] === 'a' && want.every((id) => !(id in (sc.skillIcons || {}))) && icons.length === 4 && icons[0][1] === 'a' && icons.slice(1).every((x) => x[1] === ''),
			'オススメサポ(F) 足した3種にアイコンは付かず（破線の丸）、既存のスキルのアイコンはそのまま', { saved: sc.skillIcons, icons });
		// 既存の追加（テキストで検索）と比べる: 別のスキルを足したときも、アイコンの扱いは同じ
		const other = whites.find((id) => sc.skillIds.indexOf(id) === -1 && masterWhite.indexOf(id) !== -1);
		const otherName = await sp.page.evaluate((id) => UmaSkillDeckCore.getSkillName(id), other);
		await sp.page.click(T + '[data-usd-act="editor-pick-text"]');
		await sp.page.fill('[data-usd-el="paste-input"]', otherName);
		await sp.page.click('[data-usd-act="paste-run"]');
		await sp.page.click('[data-usd-el="picker-commit"]');
		await sp.page.waitForTimeout(250);
		await sp.page.click('[data-usd-act="picker-close"]');
		const sc2 = await draftScope(sp.page);
		assert(sc2.skillIds.indexOf(other) === 4 && !(other in (sc2.skillIcons || {})) && sc2.skillIcons[existing[0]] === 'a',
			'オススメサポ(F) 比較: 既存の「テキストで検索」から足したスキルも、アイコンは付かない（モーダルからの追加と同じ扱い）', { other, icons: sc2.skillIcons });
		// 元に戻す: ②の最後の操作（テキストで検索の1件）は1種なので元に戻す対象ではない。モーダルの追加（3種）を戻す
		const undoBefore = await sp.page.evaluate(() => UmaSkillDeckCore.undoCount());
		await sp.page.click('#deck-undo-btn');
		await sp.page.waitForTimeout(300);
		const sc3 = await draftScope(sp.page);
		assert(undoBefore >= 1 && sc3.skillIds.filter((id) => want.indexOf(id) !== -1).length === 0 && sc3.skillIds.indexOf(existing[0]) !== -1, 'オススメサポ(F) 「元に戻す」で、足した3種が②から消える（既存のスキルは残る）', { undoBefore, skillIds: sc3.skillIds });
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(F) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// 1種だけの追加は既存の一括追加と同じく「元に戻す」の知らせを出さない（2種以上のときだけ）
		const sp2 = await openSp({ roster: FULL });
		await open(sp2.page);
		const s2 = await snap(sp2.page);
		for (const r of s2.rows) if (r.id !== s2.rows[0].id) await sp2.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + r.id + '"] input');
		await clearToast(sp2.page);
		const u0 = await sp2.page.evaluate(() => UmaSkillDeckCore.undoCount());
		await sp2.page.click(M + '[data-usd-el="outside-add"]');
		await sp2.page.waitForTimeout(250);
		const sc4 = await draftScope(sp2.page);
		assert(!(await modalOpen(sp2.page)) && sc4.skillIds.join() === s2.rows[0].id && await sp2.page.evaluate(() => UmaSkillDeckCore.undoCount()) === u0, 'オススメサポ(F) 1種だけの追加: ②に入り、小窓は閉じる。既存の一括追加と同じく「元に戻す」には積まない（2種以上のときだけ）', { skillIds: sc4.skillIds });
		await sp2.ctx.close();

		// 0件のとき押せない
		const sp3 = await openSp({ roster: FULL });
		await open(sp3.page);
		const s3 = await snap(sp3.page);
		assert(!s3.addDisabled && s3.addText === '追加', 'オススメサポ(F) チェックがあれば［追加］は押せる', s3.addText);
		for (const r of s3.rows) await sp3.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + r.id + '"] input');
		const dis = await sp3.page.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-add"]'); return { d: b.disabled, op: getComputedStyle(b).opacity }; });
		await sp3.page.click(M + '[data-usd-el="outside-add"]', { force: true }).catch(() => {});
		await sp3.page.waitForTimeout(200);
		assert(dis.d && Number(dis.op) < 1 && (await modalOpen(sp3.page)) && (await draftScope(sp3.page)) === null, 'オススメサポ(F) チェックが0件のとき［追加］は薄くなって押せない（押しても何も起きず、②は変わらない）', dis);
		await sp3.ctx.close();
	});

	/* ====================================================================
	 * (G) 見た目: 帯のボタン・小窓の高さ・文言
	 * ==================================================================== */
	await block('オススメサポ(G) 入口列の先頭にボタン／②の帯にボタンは無く、帯の高さはこの機能を足す前と同じ／入口列は横スクロールのままで、ほかの入口は変わらない（320・375・414px）', async () => {
		const big = { skillIds: masterWhite.slice(0, 273), name: '', updatedAt: '', skillIcons: {} };   // 24,390Pt／273種（帯の数字が最も広くなる側）
		// この機能を足す前（段2 まで）に実測した帯の高さ。ボタンを帯に置いていたとき（ボタンを隠した状態）も同じ値だった
		const BAND_H = { '320:②が空': 71, '320:②が273種': 100, '375:②が空': 71, '375:②が273種': 71, '414:②が空': 71, '414:②が273種': 71 };
		for (const w of [320, 375, 414]) {
			for (const [label, scope] of [['②が空', null], ['②が273種', big]]) {
				const sp = await openSp({ w, h: 800, roster: FULL, scope });
				const r = await sp.page.evaluate(() => {
					const q = (s) => document.querySelector('#deck-template-panel ' + s);
					const rect = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
					const band = q('[data-usd-el="set-head"]'), row = q('.usd-entry-row'), btns = Array.from(row.children);
					const first = btns[0], rr = row.getBoundingClientRect(), cs = getComputedStyle(row);
					const visible = btns.filter((b) => b.getBoundingClientRect().right <= rr.right + 1).length;
					const partly = btns.filter((b) => b.getBoundingClientRect().left < rr.right - 1).length;
					return { bandH: rect(band).h, bandBtn: !!band.querySelector('[data-usd-act="outside-open"], .usd-outside-btn'), outsideAnywhereInBand: band.textContent.indexOf('オススメサポ'),
						texts: btns.map((b) => b.textContent.replace(/\s+/g, '').replace(/[0-9]+$/, '')), firstAct: first.getAttribute('data-usd-act'), firstW: Math.round(first.getBoundingClientRect().width), firstH: Math.round(first.getBoundingClientRect().height),
						cls: first.className, others: btns.slice(1).map((b) => b.className.split(' ').filter((c) => c.indexOf('uma-btn') === 0).join(' ')),
						ov: cs.overflowX, wrap: cs.flexWrap, scrolls: row.scrollWidth > row.clientWidth, visible, partly, sw: document.documentElement.scrollWidth, iw: window.innerWidth, rowW: Math.round(rr.width) };
				});
				const tag = 'オススメサポ(G) ' + w + 'px・' + label + ': ';
				assert(!r.bandBtn && r.outsideAnywhereInBand === -1 && r.bandH === BAND_H[w + ':' + label] && r.sw <= r.iw, tag + '②の帯にボタンは無く、帯の高さはこの機能を足す前と同じ（' + r.bandH + 'px）。画面が横にはみ出さない', r);
				assert(r.texts.join() === 'オススメサポ,条件で検索,緑スキル,テキストで検索,スクショで追加' && r.firstAct === 'outside-open' && !/uma-btn--primary/.test(r.cls) && r.others.every((c) => c === 'uma-btn uma-btn--secondary'),
					tag + '入口列の先頭（「条件で検索」の左）に「オススメサポ」。ほかの4つは今までどおり（secondary）。黒い塗り（primary）にはしない', { texts: r.texts, cls: r.cls, others: r.others });
				assert(r.ov === 'auto' && r.wrap === 'nowrap' && (w > 414 || r.scrolls), tag + '入口列は折り返さず横スクロール（幅 ' + r.rowW + 'px。先頭に ' + r.firstW + 'px 足された。' + (r.scrolls ? '右にスクロールして見る' : '収まる') + '）', r);
				if (label === '②が空') console.log('     [実測] ' + w + 'px: ボタンの幅 ' + r.firstW + '×' + r.firstH + 'px・最初に全体が見えるボタン ' + r.visible + '個（一部でも見えるもの ' + r.partly + '個）');
				assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			}
		}
		// ほかの入口の動きは変わらない（条件で検索を押すと、スキル選択の小窓が開く）
		const sp = await openSp({ w: 375, h: 812, roster: FULL });
		await sp.page.click(T + '[data-usd-act="editor-pick"]');
		const picker = await sp.page.evaluate(() => { const t = document.querySelector('[data-usd-el="picker-title"]'); return { title: t ? t.textContent : null, vis: !!t && !!t.offsetParent }; });
		assert(picker.vis && /条件で検索/.test(picker.title), 'オススメサポ(G) ほかの入口（条件で検索）の動きは変わらない（スキル選択の小窓が開く）', picker);
		await sp.page.click('[data-usd-act="picker-close"]');
		// 段7（④・2026-10-04）: 虹色の塗りをやめ、①の表の固有スキルの行と同じ淡いグラデーション（同じ変数・同じ指定）に黒い文字。
		// 文字と、グラデーションの3色・その間の色とのコントラスト比が 4.5 以上。縁の色も固有スキルの行と同じ変数
		const rb = await sp.page.evaluate(() => {
			const btn = document.querySelector('#deck-template-panel [data-usd-el="outside-open"]');
			const probe = (css) => { const e = document.createElement('i'); e.style.cssText = css; document.body.appendChild(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; };
			const cs = getComputedStyle(btn);
			const stops = ['from', 'mid', 'to'].map((k) => probe('background-color: var(--usd-skill-unique-' + k + ')'));
			const row = document.querySelector('#deck-roster-panel .usd-roster-grow--unique');
			const icon = btn.querySelector('svg, i');
			return { image: cs.backgroundImage, rowImage: row ? getComputedStyle(row).backgroundImage : null, border: cs.borderTopColor, edge: probe('background-color: var(--usd-skill-unique-edge)'),
				rainbow: probe('background-color: var(--usd-rarity-ssr-1)'), text: cs.color, stops: stops, textVar: probe('background-color: var(--usd-rarity-ssr-text)'), iconColor: icon ? getComputedStyle(icon).color : null };
		});
		const rgb = (c) => (/rgba?\((\d+), (\d+), (\d+)/.exec(c) || []).slice(1, 4).map(Number);
		const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
		const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
		const mixes = [];
		for (let i = 0; i < rb.stops.length - 1; i++) for (const t of [0.25, 0.5, 0.75]) { const x = rgb(rb.stops[i]), y = rgb(rb.stops[i + 1]); mixes.push('rgb(' + x.map((v, k) => Math.round(v + (y[k] - v) * t)).join(', ') + ')'); }
		const min = Math.min.apply(null, rb.stops.concat(mixes).map((c) => ratio(rb.text, c)));
		assert(rb.stops.every((c) => rb.image.indexOf(c) !== -1) && /gradient/.test(rb.image) && rb.rowImage !== null && rb.image === rb.rowImage && rb.image.indexOf(rb.rainbow) === -1
			&& rb.border === rb.edge && rb.text === rb.textVar && rgb(rb.text).every((v) => v <= 10) && min >= 4.5 && (rb.iconColor === null || rb.iconColor === rb.text),
			'オススメサポ(G) 段7: 入口のボタンは、①の固有スキルの行と同じ淡いグラデーション（--usd-skill-unique-*。指定が行と一字一句同じ・虹色は使わない）・縁も同じ色に黒い文字。文字と3色（間の色を含む）とのコントラスト比は最小 ' + min.toFixed(2) + '（4.5 以上）',
			{ image: rb.image, rowImage: rb.rowImage, border: rb.border, edge: rb.edge, text: rb.text, min: min });
		await sp.ctx.close();
		// 1280px
		const sp2 = await openSp({ w: 1280, h: 900, roster: FULL });
		const r2 = await sp2.page.evaluate(() => { const row = document.querySelector('#deck-template-panel .usd-entry-row'); return { first: row.children[0].getAttribute('data-usd-act'), scrolls: row.scrollWidth > row.clientWidth, band: !!document.querySelector('#deck-template-panel [data-usd-el="set-head"] [data-usd-act="outside-open"]') }; });
		assert(r2.first === 'outside-open' && !r2.band, 'オススメサポ(G) 1280px: 入口列の先頭にボタン（帯には無い）', r2);
		await sp2.ctx.close();
	});

	/* ====================================================================
	 * (H) カードのタイル（①のカードの表示に揃える）・名前を押したときの情報・再計算（全部やり直し）
	 *     合成した材料: 白のスキルを重ねたカード A〜G（同じキャラクターは無い）。ウマ娘は実データ
	 * ==================================================================== */
	const stepReal = readJson('data/skill-step-up.json');
	const linked = new Set(); stepReal.entries.forEach((e) => { linked.add(e.skillId); (e.prevSkillIds || []).forEach((p) => linked.add(p)); });
	const masterById = new Map(master.map((s) => [s.id, s]));
	const SYN_ROSTER_IDS = ['syn-r1', 'syn-r2', 'syn-r3', 'syn-r4', 'syn-r5', 'syn-r6'];
	// 段13・C2: 合成の材料は除外の初期値（デバフ・持久力回復）を外して作り（exclude: {}）、計算も同じ条件にする（ここで見るのは段3〜6 の動き）
	const FULLSYN = { umaId: 'uma-0001', cardIds: SYN_ROSTER_IDS, skillFilter: FILTER, outsideOptions: { exclude: {} } };
	/** 合成の材料。A（＋10種）と B（＋9種）は大きく重なる。A があると A・C・D・E・F、A を外すと B・C・D・E・G が最適 */
	const buildSyn = (S) => {
		const mk = (id, chara, rarity, order, skills, title) => ({ id, title: title || '二つ名' + id, charaName: chara, type: ['スピード', 'スタミナ', 'パワー', '根性', '賢さ', '友人'][order - 1], typeOrder: order, rarity, isGroup: false,
			hintSkills: skills.map((s) => ({ skillId: s, name: 'x' })), dataStatus: { hint: 'done' } });
		const cands = [
			{ id: 'syn-A', chara: 'タマ', rarity: 'SSR', order: 1, skills: S.slice(0, 10), title: 'とても長い二つ名がここに入りますよ' },
			{ id: 'syn-B', chara: 'テストB', rarity: 'SSR', order: 2, skills: S.slice(0, 8).concat([S[10]]) },
			{ id: 'syn-C', chara: 'ながいながいながいなまえのウマ娘', rarity: 'SSR', order: 3, skills: S.slice(11, 18), title: '短' },
			{ id: 'syn-D', chara: 'テストD', rarity: 'SSR', order: 4, skills: S.slice(18, 24) },
			{ id: 'syn-E', chara: 'テストE', rarity: 'SR', order: 5, skills: S.slice(24, 29) },
			{ id: 'syn-F', chara: 'テストF', rarity: 'SR', order: 6, skills: S.slice(29, 33) },
			{ id: 'syn-G', chara: 'テストG', rarity: 'SR', order: 1, skills: [S[8], S[9]].concat(S.slice(33, 36)) }
		];
		const roster = SYN_ROSTER_IDS.map((id, i) => ({ id, chara: 'ロスター' + (i + 1), rarity: 'SR', order: (i % 6) + 1, skills: [] }));
		const all = cands.concat(roster);
		return { cands, cards: all.map((c) => mk(c.id, c.chara, c.rarity, c.order, c.skills, c.title)), events: all.map((c) => ({ cardId: c.id, status: 'done', chain: [] })) };
	};
	const openSyn = async (o = {}) => {
		const sp = await openSp(Object.assign({ roster: FULLSYN, syn: o.syn }, o));
		return sp;
	};
	const brute = (cands, K, excluded) => {
		const list = cands.filter((c) => excluded.indexOf(c.id) === -1);
		let best = null;
		const rec = (i, picks) => {
			if (i === list.length) {
				if (picks.length === 0 || picks.length > K) return;
				const cov = new Set(); picks.forEach((c) => c.skills.forEach((x) => cov.add(x)));
				const cand = { score: cov.size, size: picks.length, ssr: picks.filter((c) => c.rarity === 'SSR').length, ids: picks.map((c) => c.id).sort().join() };
				if (!best || cand.score > best.score || (cand.score === best.score && (cand.size < best.size || (cand.size === best.size && (cand.ssr > best.ssr || (cand.ssr === best.ssr && cand.ids < best.ids)))))) best = cand;
				return;
			}
			rec(i + 1, picks); rec(i + 1, picks.concat([list[i]]));
		};
		rec(0, []);
		return best;
	};
	let SYN = null;
	const needSyn = async () => {
		if (SYN) return SYN;
		const probe = await openSp({ roster: FULL });
		const pop = await probe.page.evaluate((f) => UmaSkillDeckCore.outside.populationOf({ umaId: 'uma-0001', cardIds: [], skillFilter: f, outsideOptions: { exclude: {} } }).ids, FILTER);
		await probe.ctx.close();
		const S = pop.filter((id) => masterById.has(id) && whiteIds.indexOf(id) !== -1 && !linked.has(id)).slice(0, 36);
		SYN = Object.assign({ S }, buildSyn(S));
		return SYN;
	};

	await block('オススメサポ(H) カードのタイル: 1行（高さ36px）・①と同じ種類色・SSR は虹色の枠3px／SR は金色の枠2px・二つ名（11px）を先に省略してから名前（14px）を省略する', async () => {
		const syn = await needSyn();
		assert(syn.S.length === 36, 'オススメサポ(H) 前提: 合成の材料にできる白のスキルが36個ある（母集団で、前段の無いもの）', syn.S.length);
		const sp = await openSyn({ syn });
		await open(sp.page);
		const r = await sp.page.evaluate(() => {
			const probe = (css) => { const e = document.createElement('i'); e.style.cssText = css; document.body.appendChild(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; };
			const tiles = Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]'));
			const slots = Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="card-slots"] .usd-roster-slot'));
			const cs = (e) => getComputedStyle(e);
			return {
				n: tiles.length,
				tiles: tiles.map((t) => {
					const n = t.getAttribute('data-type-order'), nick = t.querySelector('.usd-out-card-nick'), name = t.querySelector('.usd-out-card-name'), main = t.querySelector('.usd-out-card-main');
					const bg = cs(t).backgroundImage;
					const ssr = ['1', '2', '3', '4', '5'].map((i) => probe('background-color: var(--usd-rarity-ssr-' + i + ')'));
					const sr = ['1', '2'].map((i) => probe('background-color: var(--usd-rarity-sr-' + i + ')'));
					return { id: t.getAttribute('data-card-id'), h: Math.round(t.getBoundingClientRect().height), mainH: Math.round(main.getBoundingClientRect().height), nameH: Math.round(name.getBoundingClientRect().height), n,
						expectBg: probe('background-color: var(--uma-card-type-' + n + '-bg)'), bgImage: bg, text: cs(t).color, expectText: probe('background-color: var(--uma-card-type-' + n + '-text)'),
						bw: cs(t).borderTopWidth, ssrColors: ssr, srColors: sr, cls: t.className,
						nickFs: nick ? cs(nick).fontSize : null, nameFs: cs(name).fontSize,
						nickCut: nick ? nick.scrollWidth > nick.clientWidth + 1 : null, nameCut: name.scrollWidth > name.clientWidth + 1, nickW: nick ? Math.round(nick.getBoundingClientRect().width) : null, ell: nick ? cs(nick).textOverflow : null };
				}),
				slot: slots.map((s) => ({ n: s.getAttribute('data-type-order'), bg: cs(s).backgroundColor })),
				varDefined: ['--usd-rarity-ssr-1', '--usd-rarity-ssr-5', '--usd-rarity-sr-1', '--usd-rarity-sr-2'].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim())
			};
		});
		assert(r.n === 5 && r.tiles.every((t) => t.h === 36 && t.mainH <= 36 && t.nameH <= 20), 'オススメサポ(H) タイルは1行で高さ36px（目標の36px以内）。名前が2行に折れない', r.tiles.map((t) => [t.h, t.mainH, t.nameH]));
		assert(r.tiles.every((t) => t.bgImage.indexOf(t.expectBg) !== -1 && t.text === t.expectText), 'オススメサポ(H) 塗りと文字の色は、種類の番号で引く変数（--uma-card-type-N-bg／-text）。①のカードの表示と同じ', r.tiles.map((t) => [t.n, t.expectBg]));
		const slotOk = r.slot.filter((s) => s.n).every((s) => { const t = r.tiles.find((x) => x.n === s.n); return !t || t.expectBg === s.bg; });
		assert(r.slot.filter((s) => s.n).length === 6 && slotOk, 'オススメサポ(H) 同じ種類番号の①のカードの欄の地の色と、タイルの塗りが一致する', { slot: r.slot, tiles: r.tiles.map((t) => [t.n, t.expectBg]) });
		const ssrT = r.tiles.filter((t) => / usd-out-card--ssr/.test(t.cls)), srT = r.tiles.filter((t) => / usd-out-card--sr/.test(t.cls));
		assert(ssrT.length >= 1 && srT.length >= 1 && ssrT.every((t) => t.bw === '3px' && t.ssrColors.every((c) => t.bgImage.indexOf(c) !== -1)) && srT.every((t) => t.bw === '2px' && t.srColors.every((c) => t.bgImage.indexOf(c) !== -1)),
			'オススメサポ(H) SSR は虹色（5色）の枠3px・SR は金色の枠2px', { ssr: ssrT.length, sr: srT.length, bw: r.tiles.map((t) => t.bw) });
		assert(r.varDefined.every((v) => /^#[0-9a-f]{6}$/i.test(v)), 'オススメサポ(H) 虹色・金色は新しい変数（--usd-rarity-ssr-1〜5・--usd-rarity-sr-1〜2）として定義してある（タイルには色を直書きしていない）', r.varDefined);
		const A = r.tiles.find((t) => t.id === 'syn-A'), C = r.tiles.find((t) => t.id === 'syn-C');
		assert(A && C && A.nickFs === '11px' && A.nameFs === '14px' && A.nickCut && !A.nameCut && A.ell === 'ellipsis', 'オススメサポ(H) 二つ名が長く名前が短いカードでは、二つ名（11px）だけが省略（…）され、名前（14px）は全部見える', A);
		assert(C.nameCut && C.nickW <= 12 && !A.nameCut, 'オススメサポ(H) 名前も長いカードでは、二つ名が先に縮み切ってから（' + C.nickW + 'px）名前が省略される', C);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(H) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ(H) カード名を押すと、①のカード枠と同じ「イベント」「取得できるスキル」の小窓が（番号の札なしで）小窓の上に出る／対象のスキルにだけ「対象」の札／「外す」と押す範囲が重ならない／閉じると小窓に戻る', async () => {
		const syn = await needSyn();
		const sp = await openSyn({ syn });
		await open(sp.page);
		const geo = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]')).map((t) => {
			const m = t.querySelector('.usd-out-card-main').getBoundingClientRect(), b = t.querySelector('[data-usd-el="outside-exclude"]').getBoundingClientRect(), g = t.querySelector('[data-usd-el="outside-card-gain"]').getBoundingClientRect();
			return { mainR: Math.round(m.right), gainL: Math.round(g.left), gainR: Math.round(g.right), btnL: Math.round(b.left), btnW: Math.round(b.width), btnH: Math.round(b.height) };
		}));
		assert(geo.every((g) => g.mainR <= g.gainL + 1 && g.gainR <= g.btnL + 1 && g.btnH >= 28), 'オススメサポ(H) 名前の部分・「＋N種」・「外す」の押す範囲は左から順に並び、重ならない（「外す」は高さ28px以上）', geo);
		const before = await snap(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-card"][data-card-id="syn-A"] .usd-out-card-main');
		const info = await sp.page.evaluate(() => {
			const pop = document.querySelector('.usd-info-pop');
			const r = pop.getBoundingClientRect();
			const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			const modal = document.querySelector('[data-usd-el="outside-modal"]');
			const rows = Array.from(pop.querySelectorAll('[data-usd-el="ev-skill"]'));
			return { shown: !pop.hidden, title: document.querySelector('.usd-info-pop .uma-popover-title, .usd-info-pop [class*="title"]') ? document.querySelector('.usd-info-pop .uma-popover-title, .usd-info-pop [class*="title"]').textContent.trim() : '', onTop: pop.contains(top), modalOpen: !modal.hidden,
				zPop: getComputedStyle(pop).zIndex, zModal: getComputedStyle(modal).zIndex, badge: !!pop.querySelector('.usd-roster-legend-no'),
				panes: !!pop.querySelector('[data-usd-el="events-panes"]'), left: !!pop.querySelector('[data-usd-el="events-pane-events"]'), right: !!pop.querySelector('[data-usd-el="events-pane-skills"]'),
				skillsTitle: (pop.querySelector('[data-usd-el="ev-skills-title"]') || {}).textContent, sw: (pop.querySelector('[data-usd-el="events-switch"]') || {}).textContent || null,
				rows: rows.map((e) => ({ id: e.getAttribute('data-skill-id'), tag: (e.querySelector('[data-usd-el="ev-skill-target"]') || {}).textContent || null, pt: !!e.querySelector('[data-usd-el="ev-skill-pt"]'), desc: !!e.querySelector('[data-usd-el="ev-skill-desc"]'), maybe: e.hasAttribute('data-usd-maybe') })),
				text: pop.innerText.replace(/\s+/g, ' ').trim(), ro: pop.querySelectorAll('[data-usd-static="1"]').length, choices: pop.querySelectorAll('[data-usd-el="event-choice"]').length };
		});
		assert(info.shown && info.onTop && info.modalOpen && Number(info.zPop) > Number(info.zModal) && /\[とても長い二つ名がここに入りますよ\]タマ/.test(info.text) && !info.badge,
			'オススメサポ(H) 名前を押すと、小窓の上に、カード名（二つ名＋名前）の見出しの小窓が出る。番号の札は無い（重なり順は小窓のほうが上）', { text: info.text.slice(0, 60), badge: info.badge, zPop: info.zPop });
		assert(info.panes && info.left && info.right && info.skillsTitle === '取得できるスキル' && info.sw === '‹ イベント' && info.rows.length === 10 && info.rows.every((r) => r.pt && r.desc),
			'オススメサポ(H) ①のカード枠の小窓と同じ作り（イベントの欄・「取得できるスキル」の欄・切り替え。段13・C4 で②から開いたときは「取得できるスキル」から＝「‹ イベント」。各スキルに基礎Ptと説明文）', { sw: info.sw, rows: info.rows.length });
		assert(info.ro === info.choices && info.choices > 0 || info.choices === 0, 'オススメサポ(H) イベントの選択肢は表示だけ（押しても何も変わらない）', { ro: info.ro, choices: info.choices });
		const A = syn.cands.find((c) => c.id === 'syn-A').skills;
		assert(info.rows.every((r) => r.tag === '対象') && info.rows.map((r) => r.id).sort().join() === A.slice().sort().join(), 'オススメサポ(H) このカードで得られて、計算で数えたスキル（A の10種）の行すべてに札「対象」', info.rows.map((r) => [r.id, r.tag]));
		const mid = await snap(sp.page);
		assert(JSON.stringify(mid.cards.map((c) => c.id)) === JSON.stringify(before.cards.map((c) => c.id)) && mid.excl === null, 'オススメサポ(H) 名前を押しても「外す」は起きない（カードも除外も変わらない）', mid.cards.map((c) => c.id));
		await sp.page.keyboard.press('Escape');
		const after = await sp.page.evaluate(() => ({ popHidden: document.querySelector('.usd-info-pop').hidden, modalOpen: !document.querySelector('[data-usd-el="outside-modal"]').hidden }));
		assert(after.popHidden && after.modalOpen, 'オススメサポ(H) 閉じると、オススメサポの小窓に戻る（Esc で閉じるのは開いた小窓だけ）', after);
		await sp.page.click(M + '[data-usd-el="outside-card"][data-card-id="syn-C"] .usd-out-card-main');
		await sp.page.mouse.click(5, 5);
		const after2 = await sp.page.evaluate(() => ({ popHidden: document.querySelector('.usd-info-pop').hidden, modalOpen: !document.querySelector('[data-usd-el="outside-modal"]').hidden }));
		assert(after2.popHidden && after2.modalOpen, 'オススメサポ(H) 外（背景）を押して閉じても、オススメサポの小窓は残る', after2);
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="syn-C"]');
		await settle(sp.page);
		const ex = await snap(sp.page);
		assert(ex.excl === '除外中 カード1枚 ▾' && !(await sp.page.evaluate(() => !document.querySelector('.usd-info-pop').hidden)), 'オススメサポ(H) 「外す」を押すと除外になる（小窓は出ない）', ex.excl);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(H) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// 実データ: 対象でないスキル（得られても母集団に無いもの）には札が付かない。①のカード枠の小窓と作りが同じ
		const rs = await openSp({ roster: FULL });
		await open(rs.page);
		const res0 = await solveIn(rs.page, { count: 5, addedSkillIds: [] });
		const first = res0.cards[0];
		await rs.page.click(M + '[data-usd-el="outside-card"][data-card-id="' + first.cardId + '"] .usd-out-card-main');
		const real = await rs.page.evaluate(() => Array.from(document.querySelectorAll('.usd-info-pop [data-usd-el="ev-skill"]')).map((e) => ({ id: e.getAttribute('data-skill-id'), tag: !!e.querySelector('[data-usd-el="ev-skill-target"]'), maybe: e.hasAttribute('data-usd-maybe') })));
		const expectTargets = new Set(first.skillIds.concat(first.goldIds));
		assert(real.length > 0 && real.every((r) => r.tag === expectTargets.has(r.id)) && real.some((r) => r.tag) && real.some((r) => !r.tag),
			'オススメサポ(H) 実データ: 札は、その計算で数えたスキルの行だけ（数えていないスキルの行に札は無い）。' + real.filter((r) => r.tag).length + '件に札・' + real.filter((r) => !r.tag).length + '件は札なし', real.filter((r) => r.tag !== expectTargets.has(r.id)));
		const firstSure = real.findIndex((r) => r.maybe), lastSure = real.map((r) => r.maybe).lastIndexOf(false);
		assert(firstSure === -1 || lastSure < firstSure, 'オススメサポ(H) 並びは①の小窓と同じ（得られるもの→選択肢しだいのもの）', real.map((r) => r.maybe));
		await rs.page.keyboard.press('Escape');
		await rs.page.evaluate(() => selectStepTab(0, { noSave: true }));
		await rs.page.waitForTimeout(250);
		const tw = await rs.page.evaluate(() => { const b = document.querySelector('#deck-roster-panel [data-usd-el="events-btn"]'); if (!b) return null; b.click(); const pop = document.querySelector('.usd-info-pop'); return { has: ['events-panes', 'events-pane-events', 'events-pane-skills', 'ev-skills-title'].every((k) => !!pop.querySelector('[data-usd-el="' + k + '"]')), sw: !!pop.querySelector('[data-usd-el="events-switch"]') || !!document.querySelector('[data-usd-el="events-switch"]'), badge: !!pop.querySelector('.usd-roster-legend-no') }; });
		assert(tw && tw.has && tw.sw && tw.badge, 'オススメサポ(H) 参考: ①の列見出しのバッジを押した小窓には、同じ部品（イベントの欄・取得できるスキルの欄・切り替え）があり、番号の札がある（オススメサポのほうは札なし）', tw);
		assert(jsErrors(rs.errors).length === 0, 'オススメサポ(H) 実データ: コンソールのエラー0', jsErrors(rs.errors).slice(0, 3));
		await rs.ctx.close();
	});

	await block('オススメサポ(H) 二つ名: 「[」＋3文字＋「…」も入らない幅のときは二つ名を出さず名前だけ（375・320px）／SR の金色の枠は SSR の虹色の枠と区別できる', async () => {
		const syn = await needSyn();
		for (const w of [375, 320]) {
			const sp = await openSyn({ syn, w, h: 812 });
			await open(sp.page);
			const r = await sp.page.evaluate(() => {
				const cv = document.createElement('canvas').getContext('2d');
				return Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]')).map((t) => {
					const n = t.querySelector('.usd-out-card-nick'), nm = t.querySelector('.usd-out-card-name');
					const o = { id: t.getAttribute('data-card-id'), hasNick: !!n, hidden: n ? (n.hidden || getComputedStyle(n).display === 'none') : null, nameCut: nm.scrollWidth > nm.clientWidth + 1, nameW: Math.round(nm.getBoundingClientRect().width), sr: /usd-out-card--sr/.test(t.className), bw: getComputedStyle(t).borderTopWidth };
					if (n && !o.hidden) {
						cv.font = getComputedStyle(n).font;
						o.nickW = Math.round(n.getBoundingClientRect().width);
						o.cut = n.scrollWidth > n.clientWidth + 1;
						o.need = Math.round(cv.measureText(n.textContent.slice(0, 4) + '…').width);
						o.fits = !o.cut || o.nickW >= o.need - 1;
					}
					return o;
				});
			});
			assert(r.length === 5 && r.every((o) => !o.hasNick || o.hidden || o.fits), 'オススメサポ(H) ' + w + 'px: 見えている二つ名は、全部入っているか「[」＋3文字＋「…」以上の幅がある（「[」だけが残る表示は無い）', r.map((o) => [o.id, o.hidden, o.nickW, o.need]));
			const C = r.find((o) => o.id === 'syn-C'), A = r.find((o) => o.id === 'syn-A');
			assert(C.hidden === true && (w === 375 ? C.nameCut : true) && (w === 375 ? A.hidden === false : true) && !A.nameCut, 'オススメサポ(H) ' + w + 'px: 名前が長いカード（C）は二つ名を出さず、名前だけ（入らなければ「…」）。名前が短いカード（A）は二つ名が「[とても…」と出る', { C, A });
			if (w === 375) {
				const sr = r.filter((o) => o.sr), ssr = r.filter((o) => !o.sr);
				assert(sr.length >= 1 && ssr.length >= 1 && sr.every((o) => o.bw === '2px') && ssr.every((o) => o.bw === '3px'), 'オススメサポ(H) SR（金・2px）と SSR（虹・3px）の両方が並ぶ状態で、枠の太さが違う', { sr: sr.length, ssr: ssr.length });
				fs.mkdirSync(path.join(REPO_ROOT, 'output/scratch/shots'), { recursive: true });
				await sp.page.screenshot({ path: path.join(REPO_ROOT, 'output/scratch/shots/s6-sr.png') });
			}
			await sp.ctx.close();
		}
	});

	await block('オススメサポ(H) 「外す」「戻す」は探索を最初から全部やり直す: A（＋10種）を外すと B が入り、ほかも入れ替わり、「A を除いて最初から総当たり」した結果と一致する（次点を足すだけではない）', async () => {
		const syn = await needSyn();
		const sp = await openSyn({ syn });
		await open(sp.page);
		const ids = (s) => s.cards.map((c) => c.id).sort().join();
		const b0 = brute(syn.cands, 5, []);
		const s0 = await snap(sp.page);
		const gainOf = (s, id) => (s.cards.find((c) => c.id === id) || {}).gain;
		assert(ids(s0) === b0.ids && ids(s0) === 'syn-A,syn-C,syn-D,syn-E,syn-F' && gainOf(s0, 'syn-A') === 10 && s0.cards[0].id === 'syn-A' && !s0.cards.some((c) => c.id === 'syn-B'),
			'オススメサポ(H) 最初の状態: A（＋10種）が選ばれ B（＋9種）は落ちている。結果は総当たりと一致（A・C・D・E・F）', { ui: ids(s0), brute: b0.ids, gains: s0.cards.map((c) => c.id + ':' + c.gain) });
		// 次点を足すだけの方式（A を落として、前回の順位の次のカードを足す）なら、この顔ぶれになる
		const naive = ['syn-C', 'syn-D', 'syn-E', 'syn-F', 'syn-G'].sort().join();
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="syn-A"]');
		await settle(sp.page);
		const s1 = await snap(sp.page);
		const b1 = brute(syn.cands, 5, ['syn-A']);
		const changed = ids(s0).split(',').filter((x) => x !== 'syn-A' && ids(s1).split(',').indexOf(x) === -1);
		assert(ids(s1) === b1.ids && s1.cards.some((c) => c.id === 'syn-B') && !s1.cards.some((c) => c.id === 'syn-A') && changed.length >= 1 && ids(s1) !== naive && gainOf(s1, 'syn-B') === 9,
			'オススメサポ(H) A を外すと、B（＋9種）が入り、ほかの1枚以上（' + changed.join('・') + '）が入れ替わる。結果は「A を除いて最初から総当たり」と一致し、次点を足しただけの顔ぶれ（C・D・E・F・G）ではない', { ui: ids(s1), brute: b1.ids, naive, changed });
		const eng = await solveIn(sp.page, { count: 5, addedSkillIds: [], excludedCardIds: ['syn-A'] });
		assert(eng.cards.map((c) => c.cardId).sort().join() === ids(s1), 'オススメサポ(H) 画面の結果は、探索を最初からやり直した純粋関数の結果と同じ', eng.cards.map((c) => c.cardId));
		// 戻す: A を戻すと最初の結果に戻る（これも全部やり直し）
		await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');
		await sp.page.click(M + '[data-usd-el="outside-restore"][data-card-id="syn-A"]');
		await settle(sp.page);
		const s2 = await snap(sp.page);
		assert(ids(s2) === b0.ids && gainOf(s2, 'syn-A') === 10, 'オススメサポ(H) 「戻す」でも探索をやり直し、最初の結果（A・C・D・E・F）に戻る', ids(s2));
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(H) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (I) スキルの除外（段5）: チェックを外した行＝このパネルだけの除外スキル（roster.outsideSkillExcluded）・「再計算」・「除外中」の行
	 * ==================================================================== */
	const skillEx = (page) => page.evaluate(() => { const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')); return r ? (r.outsideSkillExcluded || null) : null; });
	const cardEx = (page) => page.evaluate(() => { const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')); return r ? (r.outsideCardExcluded || null) : null; });
	const rowCheck = (id) => M + '[data-usd-el="outside-row"][data-skill-id="' + id + '"] input';
	/** 除外スキルを考慮した総当たり（カードの除外も） */
	const bruteSk = (cands, K, exCards, exSkills) => brute(cands.map((c) => Object.assign({}, c, { skills: c.skills.filter((x) => exSkills.indexOf(x) === -1) })), K, exCards);

	await block('オススメサポ(I) スキルのチェック: 外すと除外スキルとして記録／付け直すと外れる／「再計算」は集合が変わっている間だけ出る／追加済みの行は対象外／再計算せずに「追加」しても記録は残る', async () => {
		const syn = await needSyn();
		const X = syn.S[11], Y = syn.S[12], Z = syn.S[13];
		const sp = await openSyn({ syn, scope: { skillIds: [Z], name: '', updatedAt: '', skillIcons: {} } });
		await open(sp.page);
		const s0 = await snap(sp.page);
		const f0 = parseFoot(s0);
		assert(!s0.recalc && (await skillEx(sp.page)) === null && s0.rows.find((r) => r.id === Z).added, 'オススメサポ(I) 開いた直後は「再計算」は出ない。除外スキルの記録も無い（Z は②にあるので追加済みの行）', { recalc: s0.recalc });
		await sp.page.evaluate(() => { document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').__mark = 1; });
		await sp.page.click(rowCheck(X));
		const s1 = await snap(sp.page);
		const f1 = parseFoot(s1);
		const mark = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').__mark);
		assert(JSON.stringify(await skillEx(sp.page)) === JSON.stringify([X]) && s1.recalc && s1.recalcText === '再計算' && f1.n === f0.n - 1 && f1.pt < f0.pt && s1.rows.length === s0.rows.length && mark === 1,
			'オススメサポ(I) チェックを外すと、その場で roster.outsideSkillExcluded に記録され、「選択 N種・M Pt」が変わり、「再計算」が出る。再計算はまだしない（行もカードもそのまま）', { ex: await skillEx(sp.page), recalc: s1.recalc, n: [f0.n, f1.n], pt: [f0.pt, f1.pt] });
		await sp.page.click(rowCheck(Y));
		assert(JSON.stringify(await skillEx(sp.page)) === JSON.stringify([X, Y]), 'オススメサポ(I) 続けて外すと、記録は外した順に増える（[X, Y]）', await skillEx(sp.page));
		await sp.page.click(rowCheck(Y));
		const s2 = await snap(sp.page);
		assert(JSON.stringify(await skillEx(sp.page)) === JSON.stringify([X]) && s2.recalc, 'オススメサポ(I) 付け直すと、その除外だけが記録から外れる。まだ集合が違う（X）ので「再計算」は出たまま', await skillEx(sp.page));
		await sp.page.click(rowCheck(X));
		const s3 = await snap(sp.page);
		assert((await skillEx(sp.page)) === null && !s3.recalc && parseFoot(s3).pt === f0.pt && parseFoot(s3).n === f0.n, 'オススメサポ(I) すべて付け直して集合が計算時と同じになると、「再計算」は消え、記録も項目ごと消える。数字も元に戻る', { ex: await skillEx(sp.page), recalc: s3.recalc });
		// 追加済みの行は対象外
		const added = await sp.page.evaluate((id) => { const i = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-row"][data-skill-id="' + id + '"] input'); return { dis: i.disabled, n: document.querySelectorAll('[data-usd-el="outside-modal"] [data-skill-id="' + id + '"] [data-usd-el="outside-check"]').length }; }, Z);
		await sp.page.click(rowCheck(Z), { force: true, timeout: 1000 }).catch(() => {});
		assert(added.dis && added.n === 0 && (await skillEx(sp.page)) === null, 'オススメサポ(I) 追加済みの行はチェックできず、除外にならない（記録されない）', { added, ex: await skillEx(sp.page) });
		// 外したまま、再計算せずに「追加」
		await sp.page.click(rowCheck(X));
		await sp.page.click(rowCheck(Y));
		const before = (await draftScope(sp.page)) || { skillIds: [Z] };
		await sp.page.click(M + '[data-usd-el="outside-add"]');
		await sp.page.waitForTimeout(300);
		const sc = await draftScope(sp.page);
		const expectAdded = s0.rows.filter((r) => !r.added && r.id !== X && r.id !== Y).map((r) => r.id);
		assert(!(await modalOpen(sp.page)) && sc.skillIds.indexOf(X) === -1 && sc.skillIds.indexOf(Y) === -1 && sc.skillIds.length === 1 + expectAdded.length && JSON.stringify(await skillEx(sp.page)) === JSON.stringify([X, Y]),
			'オススメサポ(I) 外したまま再計算せずに「追加」しても、②に入るのはチェックされたスキルだけ。外したスキルは除外として記録されたまま', { n: sc.skillIds.length, expect: 1 + expectAdded.length, ex: await skillEx(sp.page) });
		// 開き直すと、記録されている除外スキルが反映される（リストに出ない）。「再計算」は出ない
		await open(sp.page);
		const s4 = await snap(sp.page);
		assert(s4.rows.every((r) => r.id !== X && r.id !== Y) && !s4.recalc && s4.excl === '除外中 スキル2種 ▾' && s4.rows.every((r) => r.added || r.checked),
			'オススメサポ(I) 開き直すと、記録されている除外スキルは母集団から除かれ（リストに出ない）、「再計算」は出ない。「除外中 スキル2種」の行が出る', { excl: s4.excl, recalc: s4.recalc });
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(I) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ(I) 再計算: 除外スキルを母集団から除いて最初から探し直す（総当たりと一致）／リストは全部チェック・追加済みは薄いまま・除外スキルは出ない／外す・戻す・開き直しでも反映／金スキルは前段の白がすべて除外されたら数えない', async () => {
		const syn = await needSyn();
		const Ex = syn.S.slice(0, 6);
		const Z = syn.S[12];
		const sp = await openSyn({ syn, scope: { skillIds: [Z], name: '', updatedAt: '', skillIcons: {} } });
		await open(sp.page);
		const ids = (s) => s.cards.map((c) => c.id).sort().join();
		const s0 = await snap(sp.page);
		for (const id of Ex) await sp.page.click(rowCheck(id));
		await sp.page.evaluate(() => { document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').__mark = 1; });
		await sp.page.click(M + '[data-usd-el="outside-recalc"]');
		await settle(sp.page);
		const s1 = await snap(sp.page);
		const b1 = bruteSk(syn.cands, 5, [], Ex);
		assert(ids(s1) === b1.ids && ids(s1) !== ids(s0) && parseFoot(s1).kinds === b1.score, 'オススメサポ(I) 「再計算」で、除外スキルを除いた母集団で最初から探し直す。結果は総当たりと一致し、除外前（' + ids(s0).replace(/syn-/g, '') + '）とは変わる', { ui: ids(s1), brute: b1.ids, kinds: parseFoot(s1).kinds, score: b1.score });
		const mark = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').__mark);
		assert(mark === undefined && !s1.recalc && s1.rows.every((r) => Ex.indexOf(r.id) === -1) && s1.rows.filter((r) => !r.added).every((r) => r.checked && !r.disabled) && s1.rows.find((r) => r.id === Z && r.added && r.mark === '追加済み' && r.disabled),
			'オススメサポ(I) 再計算でチェックリストが作り直され（全部チェック済み）、除外スキルは出ない。追加済みの行は薄いまま。「再計算」は消える', { recalc: s1.recalc, ex: s1.rows.filter((r) => Ex.indexOf(r.id) !== -1).length });
		assert(s1.excl === '除外中 スキル6種 ▾' && JSON.stringify(await skillEx(sp.page)) === JSON.stringify(Ex), 'オススメサポ(I) 「除外中 スキル6種 ▾」が出て、記録は6件のまま', { excl: s1.excl });
		// 外す（カードの再計算）でも、記録されている除外スキルを反映する
		const first = s1.cards[0].id;
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="' + first + '"]'); await settle(sp.page);
		const s2 = await snap(sp.page);
		const b2 = bruteSk(syn.cands, 5, [first], Ex);
		assert(ids(s2) === b2.ids && s2.rows.every((r) => Ex.indexOf(r.id) === -1) && s2.excl === '除外中 カード1枚・スキル6種 ▾', 'オススメサポ(I) 「外す」の再計算にも除外スキルが効く（カードとスキルの除外を合わせた総当たりと一致）。「除外中 カード1枚・スキル6種 ▾」', { ui: ids(s2), brute: b2.ids, excl: s2.excl });
		// 枚数の切り替え・閉じて開き直しでも反映
		await setCount(sp.page, 6);
		const s3 = await snap(sp.page);
		const b3 = bruteSk(syn.cands, 6, [first], Ex);
		assert(s3.cards.length === 6 && b3.ids.split(',').every((id) => ids(s3).split(',').indexOf(id) !== -1) && parseFoot(s3).kinds === b3.score && s3.rows.every((r) => Ex.indexOf(r.id) === -1), 'オススメサポ(I) 6枚に切り替えても除外スキルが効く（総当たりの組を含み、種数が一致。足りない枚数は増分0のカードで埋める）', { ui: ids(s3), brute: b3.ids, kinds: parseFoot(s3).kinds, score: b3.score });
		await setCount(sp.page, 5);   // ④・段10: 枚数はセットに保存されるので、5枚に戻してから開き直す
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		await open(sp.page);
		const s4 = await snap(sp.page);
		assert(ids(s4) === b2.ids && s4.rows.every((r) => Ex.indexOf(r.id) === -1) && s4.count === '5', 'オススメサポ(I) 小窓を開いたとき（5枚）の計算にも、記録されている除外カード・除外スキルが効く', { ui: ids(s4), brute: b2.ids });
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		await sp.ctx.close();

		// 金スキル: 前段の鎖の白がすべて除外されたら、点数に数えない（既存の評価規則のとおり）
		const probe = await openSp({ roster: FULL });
		const pop = await probe.page.evaluate((f) => UmaSkillDeckCore.outside.populationOf({ umaId: 'uma-0001', cardIds: [], skillFilter: f, outsideOptions: { exclude: {} } }).ids, FILTER);
		await probe.ctx.close();
		const prevOfMap = new Map(stepReal.entries.map((e) => [e.skillId, e.prevSkillIds || []]));
		const rarityMap = new Map(ptReal.entries.map((e) => [e.skillId, e.rarity]));
		const gold = Array.from(prevOfMap.keys()).find((g) => rarityMap.get(g) === 'gold' && prevOfMap.get(g).length === 1 && pop.indexOf(prevOfMap.get(g)[0]) !== -1 && (prevOfMap.get(prevOfMap.get(g)[0]) || []).length === 0);
		const p1 = gold ? prevOfMap.get(gold)[0] : null;
		assert(!!gold && !!p1, 'オススメサポ(I) 前提: 前段が白1つだけで、その白が母集団にある金スキルがある', { gold, p1 });
		const mkc = (id, chara, order, skills) => ({ id, title: '二つ名' + id, charaName: chara, type: 'スピード', typeOrder: order, rarity: 'SSR', isGroup: false, hintSkills: skills.map((x) => ({ skillId: x, name: 'x' })), dataStatus: { hint: 'done' } });
		const gc = SYN_ROSTER_IDS.map((id, i) => mkc(id, 'ロスター' + (i + 1), 1, [])).concat([mkc('syn-H', 'テストH', 2, [gold])]);
		const sg = await openSp({ roster: FULLSYN, syn: { cards: gc, events: gc.map((c) => ({ cardId: c.id, status: 'done', chain: [] })) } });
		const g = await sg.page.evaluate((a) => {
			const C = UmaSkillDeckCore.outside;
			const r0 = C.solveSync({ roster: a.roster, count: 5, addedSkillIds: [], deadlineMs: 20000 });
			const r1 = C.solveSync({ roster: Object.assign({}, a.roster, { outsideSkillExcluded: [a.p1] }), count: 5, addedSkillIds: [], deadlineMs: 20000 });
			return { g0: r0.counts.gold, w0: r0.skills.map((s) => s.skillId), g1: r1.counts.gold, w1: r1.skills.map((s) => s.skillId), score1: r1.score, cards1: r1.cards.length };
		}, { roster: FULLSYN, p1 });
		assert(g.g0 === 1 && g.w0.indexOf(p1) !== -1 && g.g1 === 0 && g.w1.indexOf(p1) === -1 && g.score1 === 0, 'オススメサポ(I) 金スキルの前段の白（鎖のすべて）を除外すると、金スキルは数えず（金スキル 1種 → 0種）、前段の白もリストに出ない', g);
		await sg.ctx.close();
	});

	await block('オススメサポ(I) 除外スキルはこのパネルの計算にだけ効く: 条件で検索・テキストで検索・②の一覧・種数・Pt・①の数字は変わらない', async () => {
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		const s0 = await snap(sp.page);
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		await sp.page.click(T + '[data-usd-act="editor-pick"]');
		const inPicker = await sp.page.evaluate((ids) => ids.filter((id) => !!document.querySelector('[data-usd-el="skill-check"][value="' + id + '"]')), s0.rows.filter((r) => !r.added).map((r) => r.id));
		await sp.page.click('[data-usd-act="picker-close"]');
		const pick = inPicker.slice(0, 3);
		await open(sp.page);
		const nums = () => sp.page.evaluate(() => { const q = (s) => { const e = document.querySelector(s); return e ? e.textContent : null; };
			return { f: [q('#deck-template-panel [data-usd-el="factor-pt"]'), q('#deck-template-panel [data-usd-el="factor-count"]')], r: [q('#deck-roster-panel [data-usd-el="pt-total"]'), q('#deck-roster-panel [data-usd-el="pt-count"]')], badge: q('#skill-count-badge'), list: document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').length }; });
		const before = await nums();
		const name0 = await sp.page.evaluate((id) => UmaSkillDeckCore.getSkillName(id), pick[0]);
		for (const id of pick) await sp.page.click(rowCheck(id));
		await sp.page.click(M + '[data-usd-el="outside-recalc"]'); await settle(sp.page);
		assert(JSON.stringify(await skillEx(sp.page)) === JSON.stringify(pick) && (await snap(sp.page)).rows.every((r) => pick.indexOf(r.id) === -1), 'オススメサポ(I) 前提: 3つを除外して再計算した（リストから消えた）', await skillEx(sp.page));
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		const after = await nums();
		assert(JSON.stringify(before) === JSON.stringify(after), 'オススメサポ(I) ②の合計（Pt・種数）・①の合計・見出しの数・②の一覧の行数は、除外スキルで変わらない', { before, after });
		// 条件で検索: 除外したスキルも一覧に出て、選べる
		await sp.page.click(T + '[data-usd-act="editor-pick"]');
		const rows = await sp.page.evaluate((ids) => ids.map((id) => { const i = document.querySelector('[data-usd-el="skill-check"][value="' + id + '"]'); return !!i && !i.disabled; }), pick);
		await sp.page.click('[data-usd-act="picker-close"]');
		assert(rows.every(Boolean), 'オススメサポ(I) 条件で検索の一覧には、除外したスキルも出て、選べる', rows);
		// テキストで検索: 名前で照合できて、チェックが入る
		await sp.page.click(T + '[data-usd-act="editor-pick-text"]');
		await sp.page.fill('[data-usd-el="paste-input"]', name0);
		await sp.page.click('[data-usd-act="paste-run"]');
		const txt = await sp.page.evaluate(() => (document.querySelector('[data-usd-el="picker-checked-count"]') || {}).textContent);
		await sp.page.click('[data-usd-act="picker-close"]');
		assert(txt === '1種選択', 'オススメサポ(I) テキストで検索でも、除外したスキルを名前で照合して選べる', txt);
		// 緑スキル・純粋関数（引数の roster を変えた計算だけが影響を受ける）
		const pure = await sp.page.evaluate((a) => { const C = UmaSkillDeckCore.outside; const all = C.populationOf({ umaId: a.u, cardIds: a.cards, skillFilter: a.f }).ids; return { all: all.length, hasAll: a.pick.every((id) => all.indexOf(id) !== -1) }; }, { u: FULL.umaId, cards: CARDS6, f: FILTER, pick });
		assert(pure.hasAll, 'オススメサポ(I) 除外スキルを持たない roster で数えた母集団には、そのスキルが入っている（除外はこの機能の計算の入力でだけ効く）', pure);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(I) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ(I) 保存: 項目の無いデータは開いても1バイトも変わらない／schemaVersion は 7 のまま／書き出し→取り込み→「元に戻す」・複製・再読み込みで保たれる／古いIDは数えず書き換えない／①の次の書き込み・①②のリセットで消えない／＋新規の保存で写る', async () => {
		const seed = SAVED();
		seed.templates[0].skillIds = ['1', '2', '3'];   // ②のリセットを押せるように、②にスキルを入れておく
		let sp = await openSp({ userData: seed, roster: null });
		await pickSet(sp.page, 't1');
		const raw0 = await rawUd(sp.page);
		assert(raw0 === JSON.stringify(seed), 'オススメサポ(I) 項目の無いデータを開き、セットを選んでも、保存データは1バイトも変わらない', raw0.length);
		await open(sp.page);
		const raw1 = await rawUd(sp.page);
		assert(raw1 === raw0, 'オススメサポ(I) 小窓を開いて計算しても、保存データは変わらない（チェックを外すまで何も書かない）', true);
		const s0 = await snap(sp.page);
		const [X, Y] = s0.rows.filter((r) => !r.added).slice(0, 2).map((r) => r.id);
		await sp.page.click(rowCheck(X)); await sp.page.click(rowCheck(Y));
		let d = await ud(sp.page);
		const rr = (dd) => dd.rosters.find((r) => r.rosterId === 'r1');
		assert(JSON.stringify(rr(d).outsideSkillExcluded) === JSON.stringify([X, Y]) && d.schemaVersion === 7 && !('outsideCardExcluded' in rr(d)) && d.rosters.length === 1,
			'オススメサポ(I) 保存済みのセットでは userData の roster に書く（schemaVersion は 7 のまま・移行なし。カードの除外は無関係）', rr(d).outsideSkillExcluded);
		const exported = JSON.stringify(d);   // 書き出し（①のリセットの前の姿）
		// ①の次の書き込み（スキルのオン/オフ）のあとも残る
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		await sp.page.evaluate(() => document.querySelector('#deck-roster-panel input[data-usd-act="take-skill"]').click());
		await sp.page.waitForTimeout(300);
		d = await ud(sp.page);
		assert(JSON.stringify(rr(d).outsideSkillExcluded) === JSON.stringify([X, Y]) && Array.isArray(rr(d).offSkillIds), 'オススメサポ(I) ①で次の書き込み（スキルのオン/オフ）をしても、除外スキルは消えない（①のメモリ上の roster 経由）', rr(d).outsideSkillExcluded);
		await sp.page.evaluate(() => document.querySelector('#deck-roster-panel input[data-usd-act="take-skill"]').click());
		await sp.page.waitForTimeout(250);
		// ①のリセット・②のリセット
		await sp.page.evaluate(() => selectStepTab(0, { noSave: true }));
		await sp.page.waitForTimeout(250);
		await sp.page.click(P + '[data-usd-act="roster-reset"]');
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(300);
		d = await ud(sp.page);
		assert(!rr(d).umaId && JSON.stringify(rr(d).outsideSkillExcluded) === JSON.stringify([X, Y]), 'オススメサポ(I) ①のリセットは、除外スキルを消さない', { uma: rr(d).umaId, ex: rr(d).outsideSkillExcluded });
		await sp.page.evaluate(() => selectStepTab(1, { noSave: true }));
		await sp.page.waitForTimeout(250);
		await sp.page.click(T + '[data-usd-act="factor-reset"]');
		await sp.page.click('[data-usd-el="factor-reset-all"]');
		await sp.page.waitForTimeout(300);
		d = await ud(sp.page);
		assert(JSON.stringify(rr(d).outsideSkillExcluded) === JSON.stringify([X, Y]), 'オススメサポ(I) ②のリセットも、除外スキルを消さない', rr(d).outsideSkillExcluded);
		await sp.ctx.close();
		// 取り込み後（同じ中身を入れて開く）
		sp = await openSp({ userData: JSON.parse(exported), roster: null });
		await pickSet(sp.page, 't1');
		await open(sp.page);
		const sImp = await snap(sp.page);
		assert(sImp.excl === '除外中 スキル2種 ▾' && sImp.rows.every((r) => r.id !== X && r.id !== Y), 'オススメサポ(I) 書き出したデータを取り込んだあとも、除外スキルは残っている', sImp.excl);
		await sp.ctx.close();
		// 古いID: 引けないIDは数えず、書き換えない
		const old = SAVED({ outsideSkillExcluded: ['no-such-skill', X] });
		sp = await openSp({ userData: old, roster: null });
		await pickSet(sp.page, 't1');
		const rawOld = await rawUd(sp.page);
		assert(rawOld === JSON.stringify(old), 'オススメサポ(I) 古いIDを含む保存データを開いても、1バイトも変わらない', rawOld.length);
		await open(sp.page);
		const so = await snap(sp.page);
		assert(so.excl === '除外中 スキル1種 ▾' && so.rows.every((r) => r.id !== X), 'オススメサポ(I) 引けない古いIDは数えない（「除外中 スキル1種」）。引けるIDだけが効く', so.excl);
		const other = so.rows.find((r) => !r.added).id;
		await sp.page.click(rowCheck(other)); await sp.page.click(rowCheck(other));
		let dd = await ud(sp.page);
		assert(JSON.stringify(rr(dd).outsideSkillExcluded) === JSON.stringify(['no-such-skill', X]), 'オススメサポ(I) 別のスキルを外して付け直しても、古いIDと既存の記録は書き換わらない（そのIDだけを触る）', rr(dd).outsideSkillExcluded);
		await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');
		await sp.page.click(M + '[data-usd-el="outside-restore-skill"][data-skill-id="' + X + '"]'); await settle(sp.page);
		dd = await ud(sp.page);
		assert(JSON.stringify(rr(dd).outsideSkillExcluded) === JSON.stringify(['no-such-skill']), 'オススメサポ(I) 「戻す」は、そのIDだけを外す（古いIDは残る）', rr(dd).outsideSkillExcluded);
		await sp.ctx.close();
		// ＋新規の保存: この項目だけを持つ下書きの①も写される
		sp = await openSp({ roster: { outsideSkillExcluded: [X] } });
		await sp.page.click(BAR + '[data-usd-act="name-edit"]');
		await sp.page.fill(BAR + '[data-usd-el="name"]', '除外スキルだけ');
		await sp.page.keyboard.press('Enter');
		await sp.page.waitForTimeout(250);
		dd = await ud(sp.page);
		const nt = dd.templates.find((t) => t.name === '除外スキルだけ');
		const nr = nt && dd.rosters.find((r) => r.rosterId === nt.baseRosterId);
		assert(nt && nr && JSON.stringify(nr.outsideSkillExcluded) === JSON.stringify([X]), 'オススメサポ(I) 「＋新規の保存」で、この項目だけを持つ下書きの①も写される（rosterHasContent）', { nt: !!nt, nr });
		await sp.ctx.close();
		// 再読み込み（同じ context の新しいページ）
		const base1 = SAVED({ outsideSkillExcluded: [X, Y] });
		sp = await openSp({ userData: base1, roster: null });
		const pg = await sp.ctx.newPage();
		await pg.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		await pg.goto(base + '/special.html', { waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await pg.isVisible('#ui-notice')) await pg.click('[data-act="notice-ok"]');
		await pg.waitForSelector(T + OPEN, { timeout: 10000 });
		await pg.waitForTimeout(300);
		await pickSet(pg, 't1');
		await open(pg);
		const sr = await snap(pg);
		assert(sr.excl === '除外中 スキル2種 ▾' && sr.rows.every((r) => r.id !== X && r.id !== Y), 'オススメサポ(I) 再読み込みのあとも、除外スキルは残っている', sr.excl);
		await pg.close();
		await sp.ctx.close();
		// Deck: 書き出し→取り込み→「元に戻す」・複製
		const seedD = SAVED({ outsideSkillExcluded: [X, 'no-such-skill'] });
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, seedD);
		await dk.page.click('#tab-btn-data');
		await dk.page.waitForTimeout(300);
		const state = () => dk.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const bef = await state();
		const exp = await dk.page.evaluate(() => { exportData(); return document.getElementById('export-textarea').value; });
		assert(JSON.parse(exp).rosters[0].outsideSkillExcluded.join() === [X, 'no-such-skill'].join(), 'オススメサポ(I) 書き出しに項目が入る（古いIDもそのまま）', exp.length);
		const other2 = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = JSON.stringify(v); const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, other2);
		const un = await dk.page.evaluate(() => ({ ok: performUndo() }));
		await dk.page.waitForTimeout(300);
		assert(un.ok && (await state()) === bef, 'オススメサポ(I) 取り込み→「元に戻す」で、項目つきのデータが取り込み前と一致する（移行で書き換わらない）', un);
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = v; const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, exp);
		assert(JSON.stringify(await dk.page.evaluate(() => UmaSkillDeckCore.getUserData().rosters[0].outsideSkillExcluded)) === JSON.stringify([X, 'no-such-skill']), 'オススメサポ(I) 書き出したファイルを取り込み直しても、項目が保たれる', true);
		await dk.page.evaluate(() => switchTab('template'));
		await dk.page.click('[data-usd-act="template-tab"][data-tab-id="t1"]');
		await dk.page.waitForTimeout(250);
		const dup = await dk.page.evaluate(() => { const b = document.querySelector('[data-usd-act="template-duplicate"]'); return !!b && !b.hidden; });
		if (dup) { await dk.page.click('[data-usd-act="template-duplicate"]'); await dk.page.waitForTimeout(300); }
		const aft = await dk.page.evaluate(() => { const d = UmaSkillDeckCore.getUserData(); return { n: d.templates.length, ex: d.rosters.map((r) => r.outsideSkillExcluded) }; });
		assert(dup && aft.n === 3 && aft.ex[0].join() === [X, 'no-such-skill'].join(), 'オススメサポ(I) セットの複製（Deck）でも、roster の項目は保たれる（複製は同じ roster を指す）', { dup, aft });
		assert(dk.errors.length === 0, 'オススメサポ(I) Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
	});

	await block('オススメサポ(J) 「除外中」の行: 文言（カード1枚・スキル1種）・開閉・一覧の最大の高さ・「戻す」「すべて戻す」でその場で再計算・0件で消える／新しい文言', async () => {
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		const s0 = await snap(sp.page);
		assert(s0.excl === null && s0.restoreAll === null && !s0.recalc, 'オススメサポ(J) 除外が0件のとき、「除外中」の行（と「すべて戻す」）は出ない', { excl: s0.excl });
		// カード1枚
		const c0 = s0.cards[0].id;
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="' + c0 + '"]'); await settle(sp.page);
		const s1 = await snap(sp.page);
		assert(s1.excl === '除外中 カード1枚 ▾' && s1.restoreAll === 'すべて戻す', 'オススメサポ(J) カードだけのとき「除外中 カード1枚 ▾」。行の右端に「すべて戻す」', { excl: s1.excl, all: s1.restoreAll });
		// スキル12種を外して再計算（一覧の最大の高さを見る）
		const names = s1.rows.filter((r) => !r.added).slice(0, 12);
		for (const r of names) await sp.page.click(rowCheck(r.id));
		const pend = await snap(sp.page);
		assert(pend.excl === '除外中 カード1枚 ▾' && pend.recalc, 'オススメサポ(J) チェックを外しただけ（まだ再計算していない）では、「除外中」のスキルの数は増えず、「再計算」が出る', { excl: pend.excl, recalc: pend.recalc });
		await sp.page.click(M + '[data-usd-el="outside-recalc"]'); await settle(sp.page);
		const s2 = await snap(sp.page);
		assert(s2.excl === '除外中 カード1枚・スキル12種 ▾' && !s2.recalc, 'オススメサポ(J) 再計算すると「除外中 カード1枚・スキル12種 ▾」になる', s2.excl);
		await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');
		const s3 = await snap(sp.page);
		const geo = await sp.page.evaluate(() => { const l = document.querySelector('[data-usd-el="outside-excl-list"]'); const cs = getComputedStyle(l); return { h: Math.round(l.clientHeight), sh: l.scrollHeight, max: cs.maxHeight, oy: cs.overflowY, sw: document.documentElement.scrollWidth, iw: window.innerWidth }; });
		assert(s3.exclCards.length === 1 && s3.exSkills.length === 12 && s3.exSkills.every((e) => /戻す$/.test(e.text)) && s3.exSkills.map((e) => e.id).join() === names.map((r) => r.id).join() && /▴/.test(s3.excl),
			'オススメサポ(J) 押すと一覧が開き、カードは名前、スキルはスキル名を出し、それぞれに「戻す」がある', { cards: s3.exclCards.length, skills: s3.exSkills.length });
		assert(geo.oy === 'auto' && geo.max === '132px' && geo.h <= 132 && geo.sh > geo.h && geo.sw <= geo.iw, 'オススメサポ(J) 一覧が長いときは、一覧の中だけをスクロールさせる（最大の高さ 132px。' + geo.h + 'px で ' + geo.sh + 'px 分）', geo);
		// スキルを1つ戻す → その場で再計算。そのスキルがリストに戻る
		const back = names[0].id;
		await sp.page.click(M + '[data-usd-el="outside-restore-skill"][data-skill-id="' + back + '"]'); await settle(sp.page);
		const s4 = await snap(sp.page);
		const ex4 = await skillEx(sp.page);
		assert(s4.excl && /^除外中 カード1枚・スキル11種/.test(s4.excl) && s4.rows.some((r) => r.id === back && r.checked) && ex4.indexOf(back) === -1 && ex4.length === 11,
			'オススメサポ(J) スキルの「戻す」で記録から外れ、その場で再計算され、リストに戻る（全部チェック済み）', { excl: s4.excl, n: (ex4 || []).length });
		// カードを戻す
		await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');   // 再計算で一覧は閉じる？ 開いているなら閉じない
		const open4 = await sp.page.evaluate(() => !!document.querySelector('[data-usd-el="outside-excl-list"]'));
		if (!open4) await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');
		await sp.page.click(M + '[data-usd-el="outside-restore"][data-card-id="' + c0 + '"]'); await settle(sp.page);
		const s5 = await snap(sp.page);
		assert(/^除外中 スキル11種/.test(s5.excl) && (await cardEx(sp.page)) === null && s5.cards.some((c) => c.id === c0), 'オススメサポ(J) カードの「戻す」で、カードの除外だけが外れる（「除外中 スキル11種」）', s5.excl);
		// すべて戻す → 両方の記録が消え、再計算され、行が消える。最初の結果に戻る
		await sp.page.click(M + '[data-usd-el="outside-restore-all"]'); await settle(sp.page);
		const s6 = await snap(sp.page);
		const dr = await draftRoster(sp.page);
		assert(s6.excl === null && s6.restoreAll === null && !('outsideSkillExcluded' in dr) && !('outsideCardExcluded' in dr) && s6.cards.map((c) => c.id).join() === s0.cards.map((c) => c.id).join() && s6.rows.length === s0.rows.length,
			'オススメサポ(J) 「すべて戻す」で、カードとスキルの除外の記録が（項目ごと）消え、その場で再計算され、「除外中」の行が消える。最初の結果に戻る', { excl: s6.excl, keys: Object.keys(dr) });
		// 新しい文言
		await sp.page.click(M + '[data-usd-el="outside-row"] input');
		const t = await sp.page.evaluate(() => ({ recalc: document.querySelector('[data-usd-el="outside-recalc"]').textContent.replace(/\s+/g, ' ').trim(), icon: !!document.querySelector('[data-usd-el="outside-recalc"] svg, [data-usd-el="outside-recalc"] i[data-lucide="refresh-cw"]') }));
		assert(t.recalc === '再計算' && t.icon, 'オススメサポ(J) 新しい文言「再計算」（更新のアイコンつき）', t);
		const all = await sp.page.evaluate(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return m.outerHTML + m.innerText; });
		assert(!/ヒント/.test(all), 'オススメサポ(J) 「ヒント」の語が、この機能の画面のどこにも出ない（除外中・再計算を含む）', true);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(J) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ(K) スキル名: ①の表と同じ下線・押すとスキルの詳細（既存の部品）。チェックは変わらない／チェックボックスと名前以外の部分では切り替わる／追加済みの行の名前でも詳細が出る', async () => {
		const probe = await openSp({ roster: FULL });
		const base0 = await solveIn(probe.page, { count: 5, addedSkillIds: [] });
		await probe.ctx.close();
		const Z = base0.skills.find((s) => !s.viaGold).skillId;
		const sp = await openSp({ roster: FULL, scope: { skillIds: [Z], name: '', updatedAt: '', skillIcons: {} } });
		await open(sp.page);
		const s0 = await snap(sp.page);
		const X = s0.rows.find((r) => !r.added).id;
		const ul = await sp.page.evaluate((id) => {
			const mine = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-row"][data-skill-id="' + id + '"] [data-usd-info]');
			const ref = document.querySelector('#deck-roster-panel .usd-roster-skillname--btn');
			const a = getComputedStyle(mine), b = getComputedStyle(ref);
			return { tag: mine.tagName, line: a.textDecorationLine, refLine: b.textDecorationLine, color: a.textDecorationColor, refColor: b.textDecorationColor, offset: a.textUnderlineOffset, refOffset: b.textUnderlineOffset, cls: /usd-roster-skillname--btn/.test(mine.className) };
		}, X);
		assert(ul.tag === 'BUTTON' && ul.cls && ul.line === 'underline' && ul.line === ul.refLine && ul.color === ul.refColor && ul.offset === ul.refOffset, 'オススメサポ(K) チェックリストのスキル名は、①の表のスキル名と同じ下線（同じクラス・同じ線の色と位置）', ul);
		const rowH = await sp.page.evaluate(() => Math.round(document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]').getBoundingClientRect().height));
		assert(rowH <= 30, 'オススメサポ(K) スキル名をボタンにしても、行の高さは増えない（' + rowH + 'px）', rowH);
		const sel0 = parseFoot(s0);
		// 名前を押す → 詳細が出る。チェックは変わらない
		await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + X + '"] [data-usd-info]');
		const d = await sp.page.evaluate((id) => { const pop = document.querySelector('.usd-info-pop'); return { shown: !pop.hidden, text: pop.innerText.replace(/\s+/g, ' ').trim(), desc: !!pop.querySelector('[data-usd-el="info-desc"]'), name: UmaSkillDeckCore.getSkillName(id), modal: !document.querySelector('[data-usd-el="outside-modal"]').hidden }; }, X);
		const s1 = await snap(sp.page);
		assert(d.shown && d.modal && d.text.indexOf(d.name) !== -1 && d.desc && s1.rows.find((r) => r.id === X).checked && parseFoot(s1).n === sel0.n && (await skillEx(sp.page)) === null && !s1.recalc,
			'オススメサポ(K) スキル名を押すと、①の表のスキル名と同じ詳細の小窓（説明文つき）が出る。チェックは変わらず、除外にもならない', { shown: d.shown, desc: d.desc, text: d.text.slice(0, 50) });
		await sp.page.keyboard.press('Escape');
		// 名前以外（Pt の部分）を押す → 切り替わる。チェックボックス → 切り替わる
		await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + X + '"] [data-usd-el="outside-row-pt"]');
		const s2 = await snap(sp.page);
		assert(!s2.rows.find((r) => r.id === X).checked && parseFoot(s2).n === sel0.n - 1, 'オススメサポ(K) 行の名前以外（Pt の部分）を押すと、これまでどおりチェックが切り替わる', { n: parseFoot(s2).n });
		await sp.page.click(rowCheck(X));
		const s3 = await snap(sp.page);
		assert(s3.rows.find((r) => r.id === X).checked && parseFoot(s3).n === sel0.n, 'オススメサポ(K) チェックボックスを押すと切り替わる（付け直した）', { n: parseFoot(s3).n });
		// 追加済みの行の名前でも詳細が出る
		await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + Z + '"] [data-usd-info]');
		const da = await sp.page.evaluate((id) => { const pop = document.querySelector('.usd-info-pop'); return { shown: !pop.hidden, has: pop.innerText.indexOf(UmaSkillDeckCore.getSkillName(id)) !== -1 }; }, Z);
		assert(da.shown && da.has && (await snap(sp.page)).rows.find((r) => r.id === Z).added, 'オススメサポ(K) 「追加済み」の薄い行のスキル名でも、詳細が出る', da);
		await sp.page.keyboard.press('Escape');
		const all = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-modal"]').innerText);
		assert(!/ヒント/.test(all), 'オススメサポ(K) 小窓の文字に「ヒント」の語が無い', true);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(K) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ(G) 小窓の高さ（375×812 はスクロールなし・375×667 は約25px 以下）・？の文章（一字一句）・「ヒント」の語が出ない・ほかの画面にボタンが出ない', async () => {
		for (const [h, maxScroll] of [[812, 0], [667, 26]]) {
			const sp = await openSp({ w: 375, h, roster: FULL });
			await open(sp.page);
			const g = await sp.page.evaluate(() => {
				const m = document.querySelector('[data-usd-el="outside-modal"]');
				const panel = m.querySelector('.usd-modal-panel').getBoundingClientRect();
				const body = m.querySelector('[data-usd-el="outside-body"]');
				const foot = m.querySelector('[data-usd-el="outside-foot"]').getBoundingClientRect();
				const list = m.querySelector('[data-usd-el="outside-list"]').getBoundingClientRect();
				return { panelH: Math.round(panel.height), top: Math.round(panel.top), bottom: Math.round(panel.bottom), scroll: body.scrollHeight - body.clientHeight, footH: Math.round(foot.height), listH: Math.round(list.height), vh: window.innerHeight, sw: document.documentElement.scrollWidth };
			});
			assert(g.scroll <= maxScroll && g.top >= 0 && g.bottom <= g.vh && g.sw <= 375, 'オススメサポ(G) 375×' + h + ': 小窓は画面に収まり、本文のスクロールは ' + g.scroll + 'px（上限 ' + maxScroll + 'px。パネル ' + g.panelH + 'px・フッター ' + g.footH + 'px）', g);
			console.log('     [実測] 375×' + h + ': 小窓 ' + g.panelH + 'px・本文のスクロール ' + g.scroll + 'px・フッター ' + g.footH + 'px');
			await sp.ctx.close();
		}
		const sp = await openSp({ w: 375, h: 812, roster: FULL });
		await open(sp.page);
		// ？の文章
		await sp.page.click(M + '[data-usd-el="outside-help"]');
		const help = await sp.page.evaluate(() => { const e = document.querySelector('[data-usd-el="outside-help-text"]'); return e ? e.textContent : null; });
		assert(help === HELP, 'オススメサポ(G) ？を押すと、決められた文章が一字一句そのまま出る', help);
		const all = await sp.page.evaluate(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return { html: m.outerHTML, text: m.innerText, btn: document.querySelector('[data-usd-el="outside-open"]').outerHTML, pop: (document.querySelector('.usd-info-pop') || {}).innerText || '' }; });
		assert(!/ヒント/.test(all.html + all.text + all.btn + all.pop), 'オススメサポ(G) 「ヒント」の語が、この機能の画面（帯のボタン・小窓・？）のどこにも出ない', true);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(G) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// special の②だけ（Deck 単体・exam・入力ページには出さない）
		for (const file of ['uma-skill-deck.html', 'exam.html', 'card-event-input.html']) {
			const pg = await openPage(browser, base, file, { width: 375, height: 812 });
			const has = await pg.page.evaluate(() => document.querySelectorAll('[data-usd-act="outside-open"], [data-usd-el="outside-open"], [data-usd-el="outside-modal"]').length);
			assert(has === 0, 'オススメサポ(G) ' + file + ' には「オススメサポ」のボタンも小窓も無い', has);
			await pg.ctx.close();
		}
	});
}
