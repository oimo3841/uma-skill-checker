// グループのカードを①で選べるようにする（C-160・2026-10-15）の検査。run-smoke.mjs の末尾から register27() で呼ばれる
// （塊の見出しはすべて「グループのカード」で始まる。`npm run test:visual -- --only=グループのカード` で回せる）。
//
// 見るもの: (1) グループのカード5枚の計算の期待値（Step 0 の実測と同じ条件＝育成ウマ娘 uma-0001・autoChoose。●の数と合計Pt）
//   (2) 同じキャラクターの規則（①の選択の窓。重なるカードを押すと追加されず、窓は開いたまま・理由の1行が出る。重ならなければ入る。
//       保存済みの重なった編成は書き換えない）
//   (3) 見出し（グループのカードの連続イベントは「N番目」・共通イベントにキャラクター名。グループでないカードは「N回目」のまま）

export async function register27(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS = readJson('data/support-cards.json').entries;
	const EVS = readJson('data/support-card-event-skills.json').entries;
	const GROUPS = CARDS.filter((c) => c.isGroup === true).map((c) => c.id);
	const KEY = 'umaSkillDeck:draftRoster:special';

	const openSp = async (cardIds, o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		await sp.page.evaluate(({ key, roster }) => {
			localStorage.setItem(key, JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { key: KEY, roster: { rosterId: 'r_g', name: '', umaId: o.umaId === undefined ? 'uma-0001' : o.umaId, star: 3, awakeningLevel: 5, cardIds } });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		return sp;
	};

	/* ---- (1) 計算の期待値（Step 0 の実測。2026-10-15） ---- */
	await block('グループのカード(1) 5枚の計算：●の数と合計Pt・赤字が出ない', async () => {
		const WANT = [
			[['card-0310'], 23, '2,866'], [['card-0324'], 24, '2,998'], [['card-0380'], 26, '3,429'],
			[['card-0422'], 20, '2,461'], [['card-0483'], 20, '2,601'], [GROUPS, 53, '6,778'],
		];
		for (const [ids, sure, pt] of WANT) {
			const sp = await openSp(ids);
			const r = await sp.page.evaluate((ids) => {
				const res = UmaSkillDeckCore.computeRosterSkills({ umaId: 'uma-0001', cardIds: ids }, { autoChoose: true });
				const el = document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]');
				const al = document.querySelector('.usd-roster-alert');
				return { sure: res.skillIds.length, unconfirmed: res.unconfirmed.length, missing: res.missing.length, pt: el ? el.textContent.trim() : null, alert: al ? al.textContent : null };
			}, ids);
			assert(r.sure === sure && r.unconfirmed === 0 && r.missing === 0 && r.alert === null && r.pt === pt,
				'グループのカード(1) ' + ids.join('+') + ': ●' + sure + '種・' + pt + 'Pt・未収録0・赤字なし', r);
			assert(jsErrors(sp.errors).length === 0, 'グループのカード(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ---- (2) 同じキャラクターの規則 ---- */
	await block('グループのカード(2) 同じキャラクターのカードは入れられない（押すと理由を知らせ、追加せず、窓は開いたまま）', async () => {
		// 通常のカードで、グループのカード（card-0310 のメンバー）と同じキャラクターのもの
		const normal = CARDS.find((c) => c.isGroup === false && c.rarity !== 'R' && c.charaName === 'トウカイテイオー');
		const free = CARDS.find((c) => c.isGroup === false && c.rarity === 'SSR' && !['シンボリルドルフ', 'トウカイテイオー', 'ツルマルツヨシ'].includes(c.charaName));
		const pickTake = async (page, slot, id) => {
			await page.click('[data-usd-act="pick-card"][data-index="' + slot + '"]');
			await page.waitForSelector('[data-usd-el="modal"]');
			await page.fill('[data-usd-el="find"]', '');
			// 一覧は件数が多いので、取り出すカードの名前（title）で絞る
			const card = CARDS.find((c) => c.id === id);
			await page.fill('[data-usd-el="find"]', card.title);
			await page.waitForSelector('[data-usd-act="take"][data-entry-id="' + id + '"]');
			await page.click('[data-usd-act="take"][data-entry-id="' + id + '"]');
			await page.waitForTimeout(250);
		};
		const state = async (page) => page.evaluate((key) => ({
			ids: (JSON.parse(localStorage.getItem(key)) || {}).cardIds,
			modal: !!document.querySelector('[data-usd-el="modal"]'),
			notice: (document.querySelector('[data-usd-el="pick-notice"]') || {}).textContent || null,
		}), KEY);
		const cases = [
			['通常どうし（同じ charaName）', ['card-0248'], (CARDS.find((c) => c.id !== 'card-0248' && c.isGroup === false && c.rarity !== 'R' && c.charaName === CARDS.find((x) => x.id === 'card-0248').charaName) || {}).id],
			['グループどうし（テイオーが重なる）', ['card-0310'], 'card-0422'],
			['グループと通常（メンバーが通常のカードにいる）', ['card-0310'], normal.id],
			['通常とグループ（入れる側がグループ）', [normal.id], 'card-0310'],
		];
		for (const [name, have, take] of cases) {
			assert(!!take, 'グループのカード(2) ' + name + ': 検査の対象のカードがデータから選べる', take);
			const sp = await openSp(have);
			await pickTake(sp.page, 1, take);
			const s = await state(sp.page);
			assert(s.ids.filter(Boolean).length === 1 && !s.ids.includes(take) && s.modal && s.notice && /が、すでに入っているカード（.+）にいるため、入れられません$/.test(s.notice),
				'グループのカード(2) ' + name + ': 追加されず、窓は開いたまま、理由の1行が出る', s);
			// 押せる見た目のまま（押した一覧のボタンは disabled でも灰色でもない）
			const btn = await sp.page.evaluate((id) => { const b = document.querySelector('[data-usd-act="take"][data-entry-id="' + id + '"]'); return b ? { disabled: b.disabled, cls: b.className } : null; }, take);
			assert(btn && btn.disabled === false && !/added/.test(btn.cls), 'グループのカード(2) ' + name + ': 押せる見た目のまま', btn);
			// 次の操作（検索語を変える）で知らせが消える
			await sp.page.fill('[data-usd-el="find"]', 'あ');
			assert(await sp.page.$('[data-usd-el="pick-notice"]') === null, 'グループのカード(2) ' + name + ': 検索語を変えると知らせが消える');
			assert(jsErrors(sp.errors).length === 0, 'グループのカード(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// 重ならないカードは入る（グループどうし・グループと通常）
		for (const [name, have, take] of [['グループどうし（重ならない）', ['card-0310'], 'card-0380'], ['グループと通常（重ならない）', ['card-0310'], free.id]]) {
			const sp = await openSp(have);
			await pickTake(sp.page, 1, take);
			const s = await state(sp.page);
			assert(s.ids[1] === take && !s.modal && !s.notice, 'グループのカード(2) ' + name + ': 入る（窓は閉じる・知らせなし）', s);
			await sp.ctx.close();
		}
		// 入れ替え（同じ枠の自分自身との重なりは見ない）
		{
			const sp = await openSp(['card-0310']);
			await pickTake(sp.page, 0, 'card-0422');
			const s = await state(sp.page);
			assert(s.ids[0] === 'card-0422' && !s.modal, 'グループのカード(2) 同じ枠の入れ替えは、その枠のカードとの重なりを見ない', s);
			await sp.ctx.close();
		}
		// 保存済みの重なった編成は書き換えず、そのまま計算する
		{
			const sp = await openSp(['card-0310', 'card-0422']);
			const r = await sp.page.evaluate((key) => {
				const ids = (JSON.parse(localStorage.getItem(key)) || {}).cardIds;
				const res = UmaSkillDeckCore.computeRosterSkills({ umaId: 'uma-0001', cardIds: ids }, { autoChoose: true });
				const al = document.querySelector('[data-usd-el="pick-notice"], .usd-roster-warn');
				return { ids: ids.filter(Boolean), sure: res.skillIds.length, missing: res.missing.length, warn: al ? al.textContent : null };
			}, KEY);
			assert(r.ids.join() === 'card-0310,card-0422' && r.sure > 0 && r.missing === 0 && r.warn === null, 'グループのカード(2) 保存済みの重なった編成は書き換えず、警告も出さずに計算する', r);
			await sp.ctx.close();
		}
		// 育成ウマ娘との重なりは見ない（暫定）
		{
			const uma = readJson('data/training-umamusume.json').entries.find((u) => u.charaName === normal.charaName);
			const sp = await openSp([], { umaId: uma.umaId });
			await pickTake(sp.page, 0, normal.id);
			const s = await state(sp.page);
			assert(s.ids[0] === normal.id && !s.notice, 'グループのカード(2) 育成ウマ娘と同じキャラクターのカードは、規則の対象にしない', s);
			await sp.ctx.close();
		}
	});

	/* ---- (3) 見出し ---- */
	await block('グループのカード(3) 見出し：グループは「N番目」・共通イベントにキャラクター名／グループでないカードは「N回目」', async () => {
		const titlesOf = async (page, memberKey) => {
			await page.click('[data-usd-act="events"][data-member-key="' + memberKey + '"]');
			await page.waitForSelector('.usd-roster-eventtitle');
			return page.$$eval('.usd-roster-eventtitle', (x) => x.map((e) => e.textContent));
		};
		const sp = await openSp(['card-0483']);
		const t = await titlesOf(sp.page, 1);
		assert(t.includes('5番目') && t.includes('共通イベント（スピードシンボリ）') && !t.some((x) => /回目/.test(x)),
			'グループのカード(3) card-0483: 連続イベントは「5番目」・共通イベントはキャラクター名つき・「回目」は出ない', t);
		assert(jsErrors(sp.errors).length === 0, 'グループのカード(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// グループでないカード：選択肢が2つ以上の step を持つもの
		const plain = EVS.find((r) => r.status === 'done' && CARDS.find((c) => c.id === r.cardId && c.isGroup === false)
			&& r.chain.some((s) => s.choices.length >= 2 && s.choices.filter((c) => (c.skills || (c.results && c.results[0]) || []).length > 0).length >= 2));
		const sp2 = await openSp([plain.cardId]);
		const t2 = await titlesOf(sp2.page, 1);
		assert(t2.some((x) => /^\d+回目$/.test(x)) && !t2.some((x) => /番目/.test(x)) && !t2.some((x) => /^共通イベント（/.test(x)),
			'グループのカード(3) グループでないカード（' + plain.cardId + '）: 「N回目」のまま・キャラクター名は付かない', t2);
		await sp2.ctx.close();
	});
}
