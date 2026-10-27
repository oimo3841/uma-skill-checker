// セッションJ・作業3（2026-10-27）: ①本育成編成の「サポートカードを選ぶ」の小窓を SSR だけにした検査。
// run-smoke.mjs の末尾から register56() で呼ばれる（塊の見出しはすべて「J作業3」で始まる。`npm run test:visual -- --only=J作業3` で回せる）。
//
// (1) 小窓の一覧・検索・種類の絞り込みに出るのは SSR だけ。件数の文（「全N件のうち…」「N件」）の N は SSR の数（data/support-cards.json から数える）
// (2) 保存済みの①の編成に R・SR が入っていても、そのまま表示し、計算も今までどおり（変更前の commit 966ea94 で実測した固定値と同じ）
// (3) オススメサポの残りの枠から開く小窓は変えない（R・SR も出る。blocks-45 の C-186 の塊も R の候補を見ている）
// 見た目: 390・1280 で横スクロールなし・コンソールのエラー0

import crypto from 'node:crypto';

export async function register56(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS = readJson('data/support-cards.json').entries;
	const rarityOf = new Map(CARDS.map((c) => [c.id, c.rarity]));
	const SSR = CARDS.filter((c) => c.rarity === 'SSR');
	const RP = '#deck-roster-panel ';
	const sleep = (page, ms) => page.waitForTimeout(ms);

	const openSp = async (w, roster) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w === 1280 ? 900 : 844 }, EMPTY);
		await sp.page.evaluate((ro) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(ro));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, roster);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(RP + '.usd-roster-grid', { timeout: 15000 });
		await sleep(sp.page, 600);
		return sp;
	};
	const readHits = (page) => page.evaluate(() => ({
		ids: [...document.querySelectorAll('[data-usd-el="modal"] [data-usd-el="hits"] .usd-name-hit')].map((h) => h.getAttribute('data-entry-id')),
		n: document.querySelectorAll('[data-usd-el="modal"] [data-usd-el="hits"] .usd-name-hit').length,
		note: (document.querySelector('[data-usd-el="modal"] [data-usd-el="hits"] .usd-roster-note') || {}).textContent || null,
		hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }));
	// 件数の文の期待（renderHits と同じ決まり。上限は PICK_LIST_LIMIT＝60）
	const noteOf = (total) => total > 60 ? '全' + total + '件のうち 60件を出しています。名前を入れると絞り込めます。' : total + '件';

	await block('J作業3(1) ①の「サポートカードを選ぶ」の小窓: 一覧・検索・種類の絞り込みは SSR だけ・件数の文は SSR の数（390・1280）', async () => {
		for (const w of [390, 1280]) {
			const tag = 'J作業3(1) ' + w + 'px: ';
			const sp = await openSp(w, { umaId: 'uma-0179', cardIds: [null, null, null, null, null, null], skillFilter: {} });
			await sp.page.click(RP + '[data-usd-el="roster-tile"][data-index="0"] [data-usd-act="pick-card"]');
			await sp.page.waitForSelector('[data-usd-el="modal"] [data-usd-el="find"]', { timeout: 10000 });
			await sleep(sp.page, 400);
			// すべて・名前なし
			const all = await readHits(sp.page);
			const nonSsr = all.ids.filter((id) => id && rarityOf.get(id) !== 'SSR');
			assert(all.n === Math.min(60, SSR.length) && all.ids.every(Boolean) && nonSsr.length === 0, tag + '「すべて」の一覧は SSR だけ（' + all.n + '件・SSR 以外 0件）', { n: all.n, nonSsr: nonSsr.slice(0, 3) });
			assert(all.note === noteOf(SSR.length), tag + '件数の文は SSR の数（' + SSR.length + '）: ' + all.note, all.note);
			// 検索: R・SR・SSR を持つキャラクター（吾妻は SSR 1・R 1）
			await sp.page.fill('[data-usd-el="modal"] [data-usd-el="find"]', '吾妻');
			await sleep(sp.page, 500);
			const az = await readHits(sp.page);
			const wantAz = SSR.filter((c) => c.charaName === '吾妻').map((c) => c.id);
			assert(az.ids.length === wantAz.length && az.ids.every((id) => wantAz.includes(id)) && az.note === noteOf(wantAz.length), tag + '「吾妻」で探すと SSR の ' + wantAz.join('・') + ' だけ（［巫女］吾妻〔R〕は出ない）', az);
			await sp.page.fill('[data-usd-el="modal"] [data-usd-el="find"]', '巫女');
			await sleep(sp.page, 500);
			const mk = await readHits(sp.page);
			assert(mk.n === 0, tag + '「巫女」（R だけ）で探すと 0件', mk);
			await sp.page.fill('[data-usd-el="modal"] [data-usd-el="find"]', '');
			await sleep(sp.page, 400);
			// 種類の絞り込み（6つ）
			const types = await sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="modal"] [data-usd-el="types"] .usd-roster-pill--typed')].map((b) => b.getAttribute('data-value')));
			assert(types.length === 6, tag + '種類のピルは6つ', types);
			for (const t of types) {
				await sp.page.click('[data-usd-el="modal"] [data-usd-el="types"] .usd-roster-pill[data-value="' + t + '"]');
				await sleep(sp.page, 300);
				const r = await readHits(sp.page);
				const want = SSR.filter((c) => c.type === t).length;
				const bad = r.ids.filter((id) => rarityOf.get(id) !== 'SSR');
				assert(bad.length === 0 && r.n === Math.min(60, want) && r.note === noteOf(want), tag + '種類「' + t + '」: SSR だけ・件数の文は ' + want, { n: r.n, note: r.note, bad: bad.slice(0, 3) });
			}
			assert(!all.hscroll && !(await readHits(sp.page)).hscroll, tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	// 変更前（966ea94）で実測した固定値: R 2枚（card-0002・card-0566）・SR 2枚（card-0147・card-0149）・SSR 2枚の編成。390・1280 とも同じ
	const SAVED = { umaId: 'uma-0179', cardIds: ['card-0002', 'card-0566', 'card-0147', 'card-0149', 'card-0402', 'card-0248'], skillFilter: {} };
	const BEFORE = { total: '6,447', rows: 52, rowsHash: 'a4ff69b4fad1a04a',
		tiles: ['[トレセン学園]サイレンススズカ×', '[巫女]吾妻×', '[やれやれ、お帰り]フジキセキ×', '[テッペンに立て！]ヒシアマゾン×', "[L'aubeは迫りて]佐岳メイ×", '[日本一のステージを]スペシャルウィーク×'] };
	await block('J作業3(2) 保存済みの①の編成の R・SR はそのまま表示し、計算も変わらない（変更前の実測と同じ。390・1280）', async () => {
		for (const w of [390, 1280]) {
			const tag = 'J作業3(2) ' + w + 'px: ';
			const sp = await openSp(w, SAVED);
			await sleep(sp.page, 900);
			const r = await sp.page.evaluate(() => ({
				total: (document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]') || document.querySelector('#deck-roster-panel .usd-roster-total') || {}).textContent || null,
				tiles: [...document.querySelectorAll('#deck-roster-panel [data-usd-el="roster-tile"]')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
				rows: [...document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')].map((x) => x.getAttribute('data-skill-id')),
				saved: JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || '{}').cardIds,
				hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }));
			const hash = crypto.createHash('md5').update(r.rows.join(',')).digest('hex').slice(0, 16);
			assert(JSON.stringify(r.tiles) === JSON.stringify(BEFORE.tiles) && JSON.stringify(r.saved) === JSON.stringify(SAVED.cardIds), tag + 'タイルに R・SR のカードがそのまま出て、保存データも変わらない', { tiles: r.tiles, saved: r.saved });
			assert(r.total === BEFORE.total && r.rows.length === BEFORE.rows && hash === BEFORE.rowsHash, tag + '合計Pt ' + BEFORE.total + '・表の行 ' + BEFORE.rows + '（並びも同じ）は変更前と同じ', { total: r.total, rows: r.rows.length, hash });
			assert(!r.hscroll && jsErrors(sp.errors).length === 0, tag + '横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});
}
