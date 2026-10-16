// 育成ウマ娘と同じキャラクターのサポートカードの選択禁止（C-168・2026-10-16）の検査。run-smoke.mjs の末尾から register31() で呼ばれる
// （塊の見出しはすべて「同キャラ」で始まる。`npm run test:visual -- --only=同キャラ` で回せる）。
//
// 決め: ゲームでは、育成ウマ娘と同じキャラクターのサポートカードは編成に入れられない。①のカード選択の窓（サポカ・友人・グループのカード）は、
//   既存の「同じキャラクターの規則」と同じ形で、押せる見た目のまま・押すと理由を1行で知らせ・追加しない。オススメサポは候補（探索の母集団）から外し、
//   残りの枠の選択の窓も同じ規則。育成ウマ娘が未選択なら何も変わらない。保存済みの重なりは書き換えず、数え方も変えない（ルール28）。
//   判定はコアの umaSharedCharasOf 1か所（検査はこれを呼ぶ部品と、画面の2か所を見る）。
//
// (1) 規則の部品（271衣装 × 全カードを総当たり・独立な式）
// (2) ①の選択の窓（重なる／重ならない／育成ウマ娘が未選択／グループのカード／入れ替え）
// (3) 保存済みの重なり（書き換えない・数え方は今のまま）
// (4) オススメサポ（候補・探索の母集団・残りの枠の選択）
// 破壊確認は手で行う（規則を空にして (1)(2)(4) が落ちることを確かめ、報告に書く）

export async function register31(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS = readJson('data/support-cards.json').entries;
	const UMAS = readJson('data/training-umamusume.json').entries;
	const KEY = 'umaSkillDeck:draftRoster:special';
	const WHY = (n) => n + 'が、育成ウマ娘にいるため、入れられません';
	const SW = 'スペシャルウィーク';
	// 実データ: uma-0001（スペシャルウィーク）。同じキャラクターの通常のカード（SSR）／メンバーに含むグループのカード／重ならないSSR
	const SW_NORMAL = 'card-0272';
	const SW_GROUP = 'card-0324';
	const FREE = CARDS.find((c) => c.isGroup === false && c.rarity === 'SSR' && c.charaName !== SW).id;
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];

	const openSp = async (roster, o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		await sp.page.evaluate(({ key, roster, tab }) => {
			localStorage.setItem(key, JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { key: KEY, roster, tab: o.tab || 0 });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const rosterOf = (umaId, cardIds) => ({ rosterId: 'r_u', name: '', umaId, star: 3, awakeningLevel: 5, cardIds });
	const findAndTake = async (page, id) => {
		await page.fill('[data-usd-el="find"]', '');
		await page.fill('[data-usd-el="find"]', CARDS.find((c) => c.id === id).title);
		await page.waitForSelector('[data-usd-act="take"][data-entry-id="' + id + '"]');
		await page.click('[data-usd-act="take"][data-entry-id="' + id + '"]');
		await page.waitForTimeout(250);
	};
	const pickTake = async (page, slot, id) => {
		await page.click('[data-usd-act="pick-card"][data-index="' + slot + '"]');
		await page.waitForSelector('[data-usd-el="modal"]');
		await findAndTake(page, id);
	};
	const state = (page) => page.evaluate((key) => ({
		ids: (JSON.parse(localStorage.getItem(key)) || {}).cardIds,
		modal: !!document.querySelector('[data-usd-el="modal"]'),
		notice: (document.querySelector('[data-usd-el="pick-notice"]') || {}).textContent || null,
	}), KEY);

	await block('同キャラ(1) 規則の部品: 271衣装 × 全カードの総当たりが、独立な式（キャラクター名の一致。グループはメンバー全員）と一致', async () => {
		const sp = await openSp(rosterOf('uma-0001', [null, null, null, null, null, null]));
		const r = await sp.page.evaluate(async () => {
			await UmaSkillDeckCore.loadTrainingSources();
			return UmaSkillDeckCore.umaSharedCharasOf ? 'ok' : 'none';
		});
		assert(r === 'ok', '同キャラ(1) 前提: 部品が公開されている', r);
		const got = await sp.page.evaluate(({ umas, cards }) => {
			const C = UmaSkillDeckCore;
			let n = 0, hit = 0, bad = [];
			umas.forEach((u) => cards.forEach((c) => {
				const want = c.isGroup ? (c.groupMembers || []).filter((m) => m === u.charaName) : (c.charaName === u.charaName ? [u.charaName] : []);
				const have = C.umaSharedCharasOf(u.id, c);
				n++;
				if (have.length > 0) hit++;
				if (JSON.stringify(have) !== JSON.stringify(want)) bad.push([u.id, c.id]);
			}));
			return { n, hit, bad: bad.slice(0, 5), badN: bad.length, none: [C.umaSharedCharasOf('', cards[0]), C.umaSharedCharasOf('uma-9999', cards[0]), C.umaSharedCharasOf('uma-0001', null)] };
		}, { umas: UMAS, cards: CARDS });
		assert(got.badN === 0 && got.n === UMAS.length * CARDS.length && got.hit > 0, '同キャラ(1) ' + got.n + '組（重なり ' + got.hit + '組）が独立な式と一致', got);
		assert(got.none.every((x) => x.length === 0), '同キャラ(1) 育成ウマ娘が未選択・引けない・カードが無いときは重ならない', got.none);
		assert(jsErrors(sp.errors).length === 0, '同キャラ(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('同キャラ(2) ①の選択の窓: 育成ウマ娘と同じキャラクターは追加せず理由の1行を出す（押せる見た目のまま）／重ならなければ入る／育成ウマ娘が未選択なら変わらない', async () => {
		for (const [name, take] of [['通常のカード', SW_NORMAL], ['グループのカード（メンバーにいる）', SW_GROUP]]) {
			const sp = await openSp(rosterOf('uma-0001', [null, null, null, null, null, null]));
			await pickTake(sp.page, 0, take);
			const s = await state(sp.page);
			assert(s.ids.filter(Boolean).length === 0 && s.modal && s.notice === WHY(SW), '同キャラ(2) ' + name + ': 追加されず、窓は開いたまま、理由の1行が出る', s);
			const btn = await sp.page.evaluate((id) => { const b = document.querySelector('[data-usd-act="take"][data-entry-id="' + id + '"]'); return b ? { disabled: b.disabled, cls: b.className } : null; }, take);
			assert(btn && btn.disabled === false && !/added/.test(btn.cls), '同キャラ(2) ' + name + ': 押せる見た目のまま', btn);
			const wide = await sp.page.evaluate(() => { const n = document.querySelector('[data-usd-el="pick-notice"]'); return n ? n.getBoundingClientRect().height : 0; });
			assert(wide > 0, '同キャラ(2) ' + name + ': 知らせが見える', wide);
			await sp.page.fill('[data-usd-el="find"]', 'あ');
			assert(await sp.page.$('[data-usd-el="pick-notice"]') === null, '同キャラ(2) ' + name + ': 検索語を変えると知らせが消える');
			assert(jsErrors(sp.errors).length === 0, '同キャラ(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// 重ならないカードは入る
		{
			const sp = await openSp(rosterOf('uma-0001', [null, null, null, null, null, null]));
			await pickTake(sp.page, 0, FREE);
			const s = await state(sp.page);
			assert(s.ids[0] === FREE && !s.modal && !s.notice, '同キャラ(2) 重ならないカード: 入る（窓は閉じる・知らせなし）', s);
			await sp.ctx.close();
		}
		// 育成ウマ娘が未選択なら何も変わらない（同じキャラクターのカードも入る）
		{
			const sp = await openSp(rosterOf('', [null, null, null, null, null, null]));
			await pickTake(sp.page, 0, SW_NORMAL);
			const s = await state(sp.page);
			assert(s.ids[0] === SW_NORMAL && !s.modal && !s.notice, '同キャラ(2) 育成ウマ娘が未選択: 同じキャラクターのカードも今までどおり入る', s);
			await sp.ctx.close();
		}
		// 入れ替え: 重なる保存済みのカードがある枠に、別の重なるカードを入れようとしても止まる／重ならないカードには替えられる
		{
			const sp = await openSp(rosterOf('uma-0001', ['card-0248', null, null, null, null, null]));
			await pickTake(sp.page, 0, SW_NORMAL);
			const s = await state(sp.page);
			assert(s.ids[0] === 'card-0248' && s.modal && s.notice === WHY(SW), '同キャラ(2) 入れ替え: 重なるカードへは替えられない（保存済みのカードのまま）', s);
			await sp.page.click('button[data-usd-act="cancel-pick"]');
			await pickTake(sp.page, 0, FREE);
			const s2 = await state(sp.page);
			assert(s2.ids[0] === FREE && !s2.modal, '同キャラ(2) 入れ替え: 重ならないカードには替えられる', s2);
			await sp.ctx.close();
		}
		// ほかのカードとの重なりの規則（既存）は、育成ウマ娘が重ならないときは今までの文のまま
		{
			const sp = await openSp(rosterOf('uma-0192', ['card-0248', null, null, null, null, null]));
			await pickTake(sp.page, 1, SW_NORMAL);
			const s = await state(sp.page);
			assert(s.modal && /が、すでに入っているカード（.+）にいるため、入れられません$/.test(s.notice || ''), '同キャラ(2) 育成ウマ娘と重ならないとき、ほかのカードとの重なりは今までの文', s);
			await sp.ctx.close();
		}
	});

	await block('同キャラ(3) 保存済みの重なり: 書き換えず、自動で外さず、数え方も今のまま（ルール28）', async () => {
		const seed = rosterOf('uma-0001', CARDS6);
		const sp = await openSp(seed);
		const raw0 = await sp.page.evaluate((key) => localStorage.getItem(key), KEY);
		await sp.page.reload({ waitUntil: 'networkidle' });
		await sp.page.waitForTimeout(500);
		const r = await sp.page.evaluate(async (key) => {
			await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData();
			const ids = (JSON.parse(localStorage.getItem(key)) || {}).cardIds;
			const slot = document.querySelector('[data-usd-act="pick-card"][data-index="0"]');
			const detail = UmaSkillDeckCore.getRosterPtDetail({ umaId: 'uma-0001', cardIds: ids });
			const el = document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]');
			return { raw: localStorage.getItem(key), ids, slot: slot ? slot.textContent : null, total: detail ? detail.total : null, shown: el ? el.textContent.replace(/[^0-9]/g, '') : null };
		}, KEY);
		assert(r.raw === raw0, '同キャラ(3) 開いても開き直しても、保存値は1バイトも変わらない', { before: raw0.length, after: r.raw.length });
		assert(JSON.stringify(r.ids) === JSON.stringify(CARDS6) && r.slot && r.slot.trim() !== 'サポカを選ぶ', '同キャラ(3) 重なる保存済みのカード（card-0248）は外れず、枠にそのまま表示される', r);
		assert(r.total !== null && String(r.total) === r.shown, '同キャラ(3) 合計 Pt は計算の値と一致する（数え方は今のまま）', { total: r.total, shown: r.shown });
		assert(jsErrors(sp.errors).length === 0, '同キャラ(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('同キャラ(4) オススメサポ: 候補（探索の母集団）から育成ウマ娘と同じキャラクターを除く／残りの枠の選択の窓も同じ規則（押せる見た目のまま・理由の1行）', async () => {
		const FILTER = { distance: 'medium', style: 'senko', surface: 'turf' };
		const FULL = { rosterId: 'r_f', name: '', umaId: 'uma-0001', star: 3, awakeningLevel: 5, cardIds: CARDS6, skillFilter: FILTER };
		const sp = await openSp(FULL, { tab: 1, w: 375, h: 812 });
		const r = await sp.page.evaluate(async ({ swCards }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources();
			const O = C.outside;
			const idsOf = (a) => a.map((c) => c.id);
			const withUma = idsOf(O.candidatesOf({ umaId: 'uma-0001', cardIds: [] }));
			const noUma = idsOf(O.candidatesOf({ cardIds: [] }));
			const other = idsOf(O.candidatesOf({ umaId: 'uma-0192', cardIds: [] }));
			return { withUma, noUma, other, swCards };
		}, { swCards: CARDS.filter((c) => c.charaName === SW).map((c) => c.id) });
		const swCand = r.swCards.filter((id) => r.noUma.includes(id));
		assert(swCand.length >= 2, '同キャラ(4) 前提: 育成ウマ娘が未選択なら、同じキャラクターのカードが候補にある（' + swCand.length + '枚）', swCand);
		assert(r.withUma.every((id) => !r.swCards.includes(id)) && r.withUma.length === r.noUma.length - swCand.length,
			'同キャラ(4) uma-0001 では、スペシャルウィークのカード（' + swCand.length + '枚）だけが候補から外れ、ほかは変わらない', { withUma: r.withUma.length, noUma: r.noUma.length });
		assert(JSON.stringify(r.other) === JSON.stringify(r.noUma.filter((id) => !CARDS.filter((c) => c.charaName === 'タニノギムレット').map((c) => c.id).includes(id))), '同キャラ(4) 別の育成ウマ娘ではその人のカードだけが外れる', r.other.length);
		// 探索の母集団（build の cands）にも入らない
		const b = await sp.page.evaluate(async () => {
			const C = UmaSkillDeckCore;
			const rosterNoPick = { umaId: 'uma-0001', cardIds: [], skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
			await C.loadSkillPtData();
			const prob = C.outside.build({ roster: rosterNoPick, addedSkillIds: [] });
			return prob.ok ? prob.cands.map((c) => c.charaName) : prob.reason;
		});
		assert(Array.isArray(b) && b.length > 0 && !b.includes(SW), '同キャラ(4) 探索の母集団（build）にスペシャルウィークのカードは入らない', Array.isArray(b) ? b.length : b);
		// 残りの枠の選択の窓
		await sp.page.click('#deck-template-panel [data-usd-el="outside-open"]');
		await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 20000 });
		await sp.page.click('[data-usd-el="outside-modal"] [data-usd-el="outside-slot"]');
		await sp.page.waitForSelector('[data-usd-el="modal"]');
		await findAndTake(sp.page, SW_NORMAL);
		const n1 = await sp.page.evaluate(() => ({ notice: (document.querySelector('[data-usd-el="pick-notice"]') || {}).textContent || null, modal: !!document.querySelector('[data-usd-el="modal"]'),
			pinned: document.querySelectorAll('[data-usd-el="outside-pinned"]').length }));
		assert(n1.notice === WHY(SW) && n1.modal && n1.pinned === 0, '同キャラ(4) 残りの枠: 育成ウマ娘と同じキャラクターは指定されず、窓は開いたまま理由の1行', n1);
		const bt = await sp.page.evaluate((id) => { const x = document.querySelector('[data-usd-act="take"][data-entry-id="' + id + '"]'); return x ? { disabled: x.disabled, cls: x.className } : null; }, SW_NORMAL);
		assert(bt && bt.disabled === false && !/added/.test(bt.cls), '同キャラ(4) 残りの枠: 押せる見た目のまま', bt);
		await findAndTake(sp.page, FREE);
		await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]') && !document.querySelector('[data-usd-el="modal"]'); }, null, { timeout: 20000 });
		const n2 = await sp.page.evaluate(() => document.querySelectorAll('[data-usd-el="outside-pinned"]').length);
		assert(n2 === 1, '同キャラ(4) 残りの枠: 重ならないカードは指定できる', n2);
		assert(jsErrors(sp.errors).length === 0, '同キャラ(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
