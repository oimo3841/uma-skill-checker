// T140（2026-11-08 おいもさんの決定 523・524・530・531）: UmaStar ①の「育成ウマ娘を選ぶ」の小窓の一覧を、実装の新しい順にする検査。
// run-smoke.mjs の末尾から register149() で呼ばれる（塊の見出しはすべて「T140」で始まる。`npm run test:visual -- --only=T140` で回せる）。
//
//  (1) 実データ（training-umamusume.json 2026-11-08a の releaseOrder）で、一覧の先頭が uma-0272・uma-0271・uma-0269・uma-0270、
//      出ている60件が releaseOrder の降順と同じ。いちばん古い uma-0001（releaseOrder 1）が最後（小窓は先頭60件だけを出すので、
//      最後は同じキャラクターで絞って見る）。サポートカードの小窓の並びは今までどおり（データの順の逆）。
//  (2) 検索で絞った後も releaseOrder の降順。
//  (3) releaseOrder の無い行を混ぜた差し替えのデータで、その行が最後に来る（その中はデータの順の逆）。
// 名前は検査の側に書かない（恒久ルール1。id と、データから読んだ名前だけ）。
import { reloadReady } from './lib/page-ready.mjs';

export async function register149(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const UMA_DOC = readJson('data/training-umamusume.json');
	const UMAS = UMA_DOC.entries;
	const byId = new Map(UMAS.map((e) => [e.id, e]));
	const CARDS = readJson('data/support-cards.json').entries;
	const RP = '#deck-roster-panel ';
	const MD = '[data-usd-el="modal"] ';
	const ROSTER = { umaId: null, cardIds: [null, null, null, null, null, null], skillFilter: {} };
	/** 期待する並び: releaseOrder の降順・無い行は最後（その中はデータの順の逆） */
	const expectedOrder = (entries) => {
		const rev = entries.slice().reverse();
		const has = (e) => Number.isInteger(e.releaseOrder) && e.releaseOrder > 0;
		return rev.filter(has).sort((a, b) => b.releaseOrder - a.releaseOrder).concat(rev.filter((e) => !has(e))).map((e) => e.id);
	};

	const openSp = async ({ w = 390, umaDoc = null } = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w === 1280 ? 900 : 844 }, EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		if (umaDoc) await sp.page.route('**/data/training-umamusume.json*', (r) => r.fulfill(json(umaDoc)));
		await sp.page.evaluate((roster) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, ROSTER);
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(RP + '[data-usd-act="pick-uma"]', { timeout: 15000 });
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const openUmaPick = async (page) => {
		await page.click(RP + '[data-usd-act="pick-uma"]');
		await page.waitForSelector(MD + '[data-usd-el="hits"] .usd-name-hit', { timeout: 10000 });
		await page.waitForTimeout(150);
	};
	const find = async (page, text) => {
		await page.fill(MD + '[data-usd-el="find"]', text);
		await page.waitForTimeout(300);
	};
	const readHits = (page) => page.evaluate((MD) => ({
		ids: [...document.querySelectorAll(MD + '[data-usd-el="hits"] .usd-name-hit')].map((h) => h.getAttribute('data-entry-id') || ''),
		note: [...document.querySelectorAll(MD + '[data-usd-el="hits"] .usd-roster-note')].map((n) => n.textContent).join(' / '),
		title: (document.querySelector(MD + '.usd-roster-h') || {}).textContent || ''
	}), MD);
	const descending = (ids) => ids.every((id, i) => i === 0 || (byId.get(ids[i - 1]) || {}).releaseOrder > (byId.get(id) || {}).releaseOrder);

	await block('T140(1) ①の「育成ウマ娘を選ぶ」: 先頭は uma-0272・uma-0271・uma-0269・uma-0270、出ている60件は releaseOrder の降順、最後は uma-0001（390・1280）／サポートカードの小窓の並びは今までどおり', async () => {
		const EXP = expectedOrder(UMAS);
		assert(UMAS.length === 272 && EXP.length === 272 && UMAS.every((e) => Number.isInteger(e.releaseOrder)) && new Set(UMAS.map((e) => e.releaseOrder)).size === 272,
			'T140(1) データ: 272行すべてに releaseOrder があり、重複しない', { n: UMAS.length });
		assert(EXP[EXP.length - 1] === 'uma-0001' && byId.get('uma-0001').releaseOrder === 1, 'T140(1) データ: いちばん古い（releaseOrder 1）のは uma-0001', EXP.slice(-3));
		for (const w of [390, 1280]) {
			const tag = 'T140(1) ' + w + 'px: ';
			const sp = await openSp({ w });
			await openUmaPick(sp.page);
			const h = await readHits(sp.page);
			assert(h.title === '育成ウマ娘を選ぶ', tag + '小窓は「育成ウマ娘を選ぶ」', h.title);
			assert(h.ids.slice(0, 4).join() === 'uma-0272,uma-0271,uma-0269,uma-0270', tag + '先頭の4件は uma-0272・uma-0271・uma-0269・uma-0270', h.ids.slice(0, 6));
			assert(h.ids.length === 60 && h.ids.join() === EXP.slice(0, 60).join() && descending(h.ids), tag + '出ている60件は releaseOrder の降順（データから求めた並びと同じ）', { n: h.ids.length, got: h.ids.slice(0, 12), exp: EXP.slice(0, 12) });
			assert(/全272件のうち 60件/.test(h.note), tag + '件数の文は「全272件のうち 60件」', h.note);
			// 最後: uma-0001 と同じキャラクターで絞ると、uma-0001 がいちばん下
			const chara = byId.get('uma-0001').charaName;
			await find(sp.page, chara);
			const f = await readHits(sp.page);
			const expF = EXP.filter((id) => ('[' + byId.get(id).title + ']' + byId.get(id).charaName).indexOf(chara) !== -1);
			assert(f.ids.length >= 2 && f.ids[f.ids.length - 1] === 'uma-0001' && f.ids.join() === expF.join(), tag + 'uma-0001 と同じキャラクターで絞ると、uma-0001 がいちばん下（全体でも最後）', { got: f.ids, exp: expF });
			await sp.page.click('[data-usd-act="cancel-pick"]', { position: { x: 2, y: 2 } });
			await sp.page.waitForTimeout(250);
			assert(!(await sp.page.$(MD + '[data-usd-el="hits"]')), tag + '小窓の外を押すと閉じる', null);
			// サポートカード: 今までどおりデータの順の逆（①は SSR だけ）
			await sp.page.click(RP + '[data-usd-el="roster-tile"][data-index="0"] [data-usd-act="pick-card"]');
			await sp.page.waitForSelector(MD + '[data-usd-el="hits"] .usd-name-hit', { timeout: 10000 });
			await sp.page.waitForTimeout(150);
			const c = await readHits(sp.page);
			const expC = CARDS.slice().reverse().filter((e) => e.rarity === 'SSR').map((e) => e.id).slice(0, c.ids.length);
			assert(c.title === 'サポートカードを選ぶ' && c.ids.length > 0 && c.ids.join() === expC.join(), tag + 'サポートカードの小窓は今までどおり（SSR をデータの順の逆に）', { got: c.ids.slice(0, 6), exp: expC.slice(0, 6) });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T140(2) 検索で絞った後も releaseOrder の降順（キャラクター名・二つ名の一部・全件に当たる語）', async () => {
		const EXP = expectedOrder(UMAS);
		const sp = await openSp({ w: 390 });
		await openUmaPick(sp.page);
		// 衣装の多いキャラクター2人（データから選ぶ）と、二つ名の一部
		const counts = new Map();
		UMAS.forEach((e) => counts.set(e.charaName, (counts.get(e.charaName) || 0) + 1));
		const many = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);
		const queries = many.concat([byId.get('uma-0269').charaName, ']']);
		for (const qy of queries) {
			await find(sp.page, qy);
			const f = await readHits(sp.page);
			const expF = EXP.filter((id) => ('[' + byId.get(id).title + ']' + byId.get(id).charaName).indexOf(qy) !== -1).slice(0, 60);
			assert(f.ids.length >= 2 && descending(f.ids) && f.ids.join() === expF.join(), 'T140(2) 「' + qy + '」で絞ると ' + f.ids.length + '件で、releaseOrder の降順', { got: f.ids.slice(0, 8).map((id) => id + ':' + (byId.get(id) || {}).releaseOrder), exp: expF.slice(0, 8) });
		}
		// 消すと元の並びに戻る
		await find(sp.page, '');
		const back = await readHits(sp.page);
		assert(back.ids.join() === EXP.slice(0, 60).join(), 'T140(2) 検索の語を消すと、元の並び（先頭 uma-0272）に戻る', back.ids.slice(0, 5));
		assert(jsErrors(sp.errors).length === 0, 'T140(2) コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});

	await block('T140(3) releaseOrder の無い行を混ぜた差し替えのデータ: 無い行は最後（その中はデータの順の逆）・検索で絞っても最後', async () => {
		// 実データの先頭40行（60件に収まる数）を使い、3行の releaseOrder を消す（1行は 0 にする＝正の整数でない）
		const rows = UMAS.slice(0, 40).map((e) => Object.assign({}, e));
		const drop = [rows[3].id, rows[17].id, rows[30].id];
		delete rows[3].releaseOrder;
		delete rows[17].releaseOrder;
		rows[30].releaseOrder = 0;
		const doc = Object.assign({}, UMA_DOC, { entries: rows });
		const EXP = expectedOrder(rows);
		assert(EXP.slice(-3).join() === [drop[2], drop[1], drop[0]].join(), 'T140(3) 期待する並び: 番号の無い3行が最後で、データの順の逆', EXP.slice(-4));
		const sp = await openSp({ w: 390, umaDoc: doc });
		await openUmaPick(sp.page);
		const h = await readHits(sp.page);
		assert(h.ids.length === 40 && h.ids.join() === EXP.join(), 'T140(3) 一覧は番号のある37行が降順、そのあとに番号の無い3行（' + drop.slice().reverse().join('・') + '）', { got: h.ids.slice(-5), exp: EXP.slice(-5), n: h.ids.length });
		// 番号の無い行と、同じキャラクターの番号のある行を一緒に出す語で絞る
		const chara = rows[17].charaName;
		await find(sp.page, chara);
		const f = await readHits(sp.page);
		const expF = EXP.filter((id) => { const e = rows.find((r) => r.id === id); return ('[' + e.title + ']' + e.charaName).indexOf(chara) !== -1; });
		assert(f.ids.length >= 1 && f.ids[f.ids.length - 1] === rows[17].id && f.ids.join() === expF.join(), 'T140(3) 「' + chara + '」で絞っても、番号の無い ' + rows[17].id + ' は最後', { got: f.ids, exp: expF });
		assert(jsErrors(sp.errors).length === 0, 'T140(3) コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});
}
