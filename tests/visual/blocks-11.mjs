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
	const HELP = '本育成のサポカで得られない対象スキルを、できるだけ多く得られる組み合わせです。ランダムイベントのスキルも数えます。選択肢で変わるものは、得られる側を選んだ前提です。追加済みのスキルも種数に含みます。金スキルの前段の白は、金スキルと合わせて1種ですが、金スキルによる因子化率を加味してオススメしています。';
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
		await page.click('[data-usd-el="set-list"] input[value="' + id + '"]');
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
	/** 小窓の中身を読む */
	const snap = (page) => page.evaluate(() => {
		const m = document.querySelector('[data-usd-el="outside-modal"]');
		const q = (s) => m.querySelector(s);
		const txt = (s) => { const e = q(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
		const foot = q('[data-usd-el="outside-foot"]');
		return {
			count: ['5', '6'].filter((n) => q('[data-usd-el="outside-count-' + n + '"]').getAttribute('aria-pressed') === 'true').join(''),
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
		await sp.page.click(M + '[data-usd-el="outside-count-6"]'); await settle(sp.page);
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

	await block('オススメサポ(B) 開くたびに5枚から・5枚と6枚の切り替えで結果が変わる・切り替えは保存されない・既定は5枚', async () => {
		const sp = await openSp({ roster: FULL });
		const d0 = await sp.page.evaluate(() => ({ choices: UmaSkillDeckCore.outside.COUNT_CHOICES, def: UmaSkillDeckCore.outside.COUNT_DEFAULT }));
		const def = await solveIn(sp.page, { roster: {}, addedSkillIds: [] });
		assert(d0.def === 5 && d0.choices.join() === '5,6' && def.count === 5 && def.cards.length === 5, 'オススメサポ(B) 段1の既定の枚数は5枚（count を渡さない計算が5枚）', { d0, count: def.count, n: def.cards.length });
		const raw0 = { ud: await rawUd(sp.page), dr: await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special')), sc: await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftScope:special')) };
		await open(sp.page);
		const a = await snap(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-count-6"]'); await settle(sp.page);
		const b = await snap(sp.page);
		const exp5 = await solveIn(sp.page, { count: 5, addedSkillIds: [] });
		const exp6 = await solveIn(sp.page, { count: 6, addedSkillIds: [] });
		assert(a.count === '5' && a.cards.length === 5 && b.count === '6' && b.cards.length === 6 && parseFoot(b).kinds >= parseFoot(a).kinds
			&& parseFoot(a).kinds === exp5.counts.kinds && parseFoot(b).kinds === exp6.counts.kinds && (parseFoot(b).kinds > parseFoot(a).kinds || b.cards.map((c) => c.id).join() !== a.cards.map((c) => c.id).join()),
			'オススメサポ(B) 開いた直後は5枚。6枚に切り替えると6枚の結果に変わる（カード数・得られる種数が純粋関数の結果と一致）', { a: [a.count, a.cards.length, a.total], b: [b.count, b.cards.length, b.total], exp5: exp5.counts.kinds, exp6: exp6.counts.kinds });
		const mid = { ud: await rawUd(sp.page), dr: await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special')), sc: await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftScope:special')) };
		assert(mid.ud === raw0.ud && mid.dr === raw0.dr && mid.sc === raw0.sc, 'オススメサポ(B) 開く・枚数を切り替える・計算する、では保存データ（保存済み・①②の下書き）が1バイトも変わらない（枚数もチェックも保存しない）', { ud: mid.ud === raw0.ud, dr: mid.dr === raw0.dr, sc: mid.sc === raw0.sc });
		// 閉じて開き直す → 5枚から
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		assert(!(await modalOpen(sp.page)), 'オススメサポ(B) × で閉じる', true);
		await open(sp.page);
		const c = await snap(sp.page);
		assert(c.count === '5' && c.cards.length === 5, 'オススメサポ(B) 開き直すと、前に6枚にしていても5枚から始まる', { count: c.count, n: c.cards.length });
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
			if (n === '6') { await sp.page.click(M + '[data-usd-el="outside-count-6"]'); await settle(sp.page); }
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
		assert(b.excl === '除外中 1枚 ▾' && b.exclCards.length === 0, 'オススメサポ(C) 除外が1枚になると「除外中 1枚 ▾」の行が出る（一覧はまだ閉じている）', b.excl);
		await sp.page.click(M + '[data-usd-el="outside-excl-toggle"]');
		const c = await snap(sp.page);
		const geo = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-excl-card"]')).map((e) => ({ h: Math.round(e.getBoundingClientRect().height), btn: (e.querySelector('[data-usd-el="outside-restore"]') || {}).textContent })));
		assert(c.exclCards.length === 1 && c.exclCards[0].id === victim && /戻す$/.test(c.exclCards[0].text) && geo[0].btn === '戻す' && geo[0].h === 36 && /除外中 1枚 ▴/.test(c.excl), 'オススメサポ(C) 押すと除外したカードの一覧が開き、各カードに「戻す」がある', { c: c.exclCards, geo });
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
		assert(d.excl === '除外中 1枚 ▾' && d.cards.every((x) => x.id !== victim), 'オススメサポ(C) 開き直しても除外は残っている（5枚に戻る切り替えとは別に、除外は保存される）', d.excl);
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
		assert(b.excl === '除外中 2枚 ▾' && b.cards.every((c) => c.id !== victim && c.id !== victim2), 'オススメサポ(C) 書き出したデータを取り込んだあとも、除外は残っている', b.excl);
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
		assert(c.excl === '除外中 2枚 ▾' && c.cards.every((x) => x.id !== victim && x.id !== victim2), 'オススメサポ(C) 再読み込みのあとも、除外は残っている', c.excl);
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
		await sp.page.click(M + '[data-usd-el="outside-count-6"]'); await settle(sp.page);
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
		assert(n > 100 && c.empty === MSG_EMPTY && c.rows.length === 0 && c.cards.length === 0 && c.footHidden && c.excl === '除外中 ' + n + '枚 ▾',
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
	await block('オススメサポ(G) 入口列の先頭に濃色のボタン／②の帯にボタンは無く、帯の高さはこの機能を足す前と同じ／入口列は横スクロールのままで、ほかの入口は変わらない（320・375・414px）', async () => {
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
				assert(r.texts.join() === 'オススメサポ,条件で検索,緑スキル,テキストで検索,スクショで追加' && r.firstAct === 'outside-open' && /uma-btn--primary/.test(r.cls) && r.others.every((c) => c === 'uma-btn uma-btn--secondary'),
					tag + '入口列の先頭（「条件で検索」の左）に濃色（primary）の「オススメサポ」。ほかの4つは今までどおり（secondary）', { texts: r.texts, cls: r.cls, others: r.others });
				assert(r.ov === 'auto' && r.wrap === 'nowrap' && (w > 414 || r.scrolls), tag + '入口列は折り返さず横スクロール（幅 ' + r.rowW + 'px。先頭に ' + r.firstW + 'px 足された。' + (r.scrolls ? '右にスクロールして見る' : '収まる') + '）', r);
				if (label === '②が空') console.log('     [実測] ' + w + 'px: ボタンの幅 ' + r.firstW + '×' + r.firstH + 'px・最初に全体が見えるボタン ' + r.visible + '個（一部でも見えるもの ' + r.partly + '個）');
				assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			}
		}
		// ほかの入口の動きは変わらない（条件で検索を押すと、スキル選択の小窓が開く）／濃色の塗りは小窓の「追加」と同じ
		const sp = await openSp({ w: 375, h: 812, roster: FULL });
		const fill = await sp.page.evaluate(() => getComputedStyle(document.querySelector('#deck-template-panel [data-usd-el="outside-open"]')).backgroundColor);
		await sp.page.click(T + '[data-usd-act="editor-pick"]');
		const picker = await sp.page.evaluate(() => { const t = document.querySelector('[data-usd-el="picker-title"]'); return { title: t ? t.textContent : null, vis: !!t && !!t.offsetParent }; });
		assert(picker.vis && /条件で検索/.test(picker.title), 'オススメサポ(G) ほかの入口（条件で検索）の動きは変わらない（スキル選択の小窓が開く）', picker);
		await sp.page.click('[data-usd-act="picker-close"]');
		await open(sp.page);
		const addFill = await sp.page.evaluate(() => getComputedStyle(document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-add"]')).backgroundColor);
		assert(fill === addFill && fill !== 'rgba(0, 0, 0, 0)', 'オススメサポ(G) 入口列のボタンの塗りは、小窓の「追加」ボタンと同じ濃色', { fill, addFill });
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
	const FULLSYN = { umaId: 'uma-0001', cardIds: SYN_ROSTER_IDS, skillFilter: FILTER };
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
		const pop = await probe.page.evaluate((f) => UmaSkillDeckCore.outside.populationOf({ umaId: 'uma-0001', cardIds: [], skillFilter: f }).ids, FILTER);
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

	await block('オススメサポ(H) カード名を押すと、カードの情報（名称・種類・レアリティ）が小窓の上に出る／「外す」と押す範囲が重ならない／閉じても小窓は残る', async () => {
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
			return { shown: !pop.hidden, text: pop.innerText.replace(/\s+/g, ' ').trim(), onTop: pop.contains(top), modalOpen: !modal.hidden, zPop: getComputedStyle(pop).zIndex, zModal: getComputedStyle(modal).zIndex,
				type: (document.querySelector('[data-usd-el="outside-card-info-type"]') || {}).textContent, rarity: (document.querySelector('[data-usd-el="outside-card-info-rarity"]') || {}).textContent };
		});
		assert(info.shown && info.onTop && info.modalOpen && Number(info.zPop) > Number(info.zModal) && /^\[とても長い二つ名がここに入りますよ\]タマ/.test(info.text) && info.type === '種類：スピード' && info.rarity === 'レアリティ：SSR',
			'オススメサポ(H) 名前を押すと、名称（二つ名＋名前）・種類・レアリティの小さな表示が小窓の上に出る（重なり順は表示のほうが上）', info);
		const mid = await snap(sp.page);
		assert(JSON.stringify(mid.cards.map((c) => c.id)) === JSON.stringify(before.cards.map((c) => c.id)) && mid.excl === null, 'オススメサポ(H) 名前を押しても「外す」は起きない（カードも除外も変わらない）', mid.cards.map((c) => c.id));
		await sp.page.keyboard.press('Escape');
		const after = await sp.page.evaluate(() => ({ popHidden: document.querySelector('.usd-info-pop').hidden, modalOpen: !document.querySelector('[data-usd-el="outside-modal"]').hidden }));
		assert(after.popHidden && after.modalOpen, 'オススメサポ(H) 情報を閉じても、小窓は残る（Esc で閉じるのは情報だけ）', after);
		// 背景を押して閉じるときも小窓は残る
		await sp.page.click(M + '[data-usd-el="outside-card"][data-card-id="syn-C"] .usd-out-card-main');
		await sp.page.mouse.click(5, 5);
		const after2 = await sp.page.evaluate(() => ({ popHidden: document.querySelector('.usd-info-pop').hidden, modalOpen: !document.querySelector('[data-usd-el="outside-modal"]').hidden }));
		assert(after2.popHidden && after2.modalOpen, 'オススメサポ(H) 情報の外（背景）を押して閉じても、小窓は残る', after2);
		// 「外す」を押すと情報ではなく除外になる
		await sp.page.click(M + '[data-usd-el="outside-exclude"][data-card-id="syn-C"]');
		await settle(sp.page);
		const ex = await snap(sp.page);
		assert(ex.excl === '除外中 1枚 ▾' && !(await sp.page.evaluate(() => !document.querySelector('.usd-info-pop').hidden)), 'オススメサポ(H) 「外す」を押すと除外になる（情報は出ない）', ex.excl);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ(H) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
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
