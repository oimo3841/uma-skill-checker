// 段0b（2026-10-25・CODE-NEXT-7）の検査: 終わった対戦レース race-0001（data/upcoming-races.json の selectable: false）を選択欄から外す。
// run-smoke.mjs の末尾から register52() で呼ばれる（塊の見出しはすべて「段0b」で始まる。`npm run test:visual -- --only=段0b` で回せる）。
//
// (1) 選択欄に race-0001 が出ない／(2) race-0002〜0007 は出る（データの selectable: false 以外の行）／(3) race-0001 を保存したセットを開くと、レースは保たれ「（一覧から外れました）」の扱い／
// (4) 合計・進化の判定が変更前と同じ（保存済みのセットで。selectable の項目だけを外した一覧と比べる）／(5) 行は消えていない（getUpcomingRaces は7行・race-0001 は selectable: false のまま）
// レース名・id はデータから引く（恒久ルール1。race-0001 が「終わったレース」であることだけが、この検査の前提）。

export async function register52(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const RACES_DOC = readJson('data/upcoming-races.json');
	const RACES = RACES_DOC.races;
	const ENDED = RACES.filter((r) => r.selectable === false).map((r) => r.id);
	const SEL = RACES.filter((r) => r.selectable !== false);
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
	const BAR = '#deck-set-bar ';
	const SNAP = (row) => { const o = { id: row.id }; ['name', 'date', 'dateLabel', 'venue', 'surface', 'distance', 'distanceCategory', 'direction', 'course', 'season', 'weather', 'ground', 'time', 'rule'].forEach((k) => { o[k] = row[k]; }); return o; };
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		if (o.races) await sp.page.route('**/data/upcoming-races.json*', (r) => r.fulfill(json(o.races)));
		await sp.page.evaluate(({ roster, tab, theme }) => {
			if (theme) localStorage.setItem('uma-tools-theme', theme);
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster === undefined ? FULL : o.roster, tab: o.tab === undefined ? 1 : o.tab, theme: o.theme });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(400);
		return sp;
	};
	const raceRows = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="race-list"] [data-usd-el="race-opt"]')).map((l) => ({
		id: l.getAttribute('data-race-id'), checked: l.querySelector('input').checked, line1: (l.querySelector('[data-usd-el="race-line1"]') || l.querySelector('.usd-link-name')).textContent })));
	const openRaceList = async (page) => { await page.click('#hdr-race-slot [data-usd-act="set-race"]'); await page.waitForSelector('[data-usd-el="race-list"]'); };

	await block('段0b(1)(2)(5) 選択欄に終わったレース（selectable: false）が出ない／ほかの行（selectable: false 以外）はすべて出る／行は消えていない（getUpcomingRaces は全行・終わったレースは selectable: false のまま）', async () => {
		assert(ENDED.length === 1 && ENDED[0] === 'race-0001' && RACES.length === 7 && SEL.length === 6, '段0b データ: selectable: false は race-0001 の1行だけ・全7行・選べるのは6行', { ENDED, n: RACES.length, sel: SEL.length });
		for (const w of [390, 1280]) {
			const sp = await openSp({ w, h: w === 1280 ? 900 : 844 });
			await openRaceList(sp.page);
			const rows = await raceRows(sp.page);
			const ids = rows.map((r) => r.id);
			assert(!ids.some((id) => ENDED.includes(id)), `段0b(1) ${w}px: 選択欄に終わったレース（${ENDED.join()}）は出ない`, ids);
			assert(JSON.stringify(ids) === JSON.stringify([''].concat(SEL.map((r) => r.id))), `段0b(2) ${w}px: 「指定なし」と、選べる全6行（race-0002〜0007）が並びどおりに出る`, ids);
			assert(rows[0].checked && rows.slice(1).every((r) => !r.checked), `段0b(2) ${w}px: 何も選んでいないときは「指定なし」に印`, rows.map((r) => r.checked));
			const loaded = await sp.page.evaluate(() => UmaSkillDeckCore.getUpcomingRaces().map((r) => ({ id: r.id, selectable: r.selectable })));
			assert(loaded.length === RACES.length && loaded.find((r) => r.id === 'race-0001').selectable === false && loaded.filter((r) => r.selectable === false).length === 1, `段0b(5) ${w}px: getUpcomingRaces は全行（隠すのは表示だけ）・race-0001 は selectable: false のまま`, loaded);
			assert(jsErrors(sp.errors).length === 0, `段0b(1) ${w}px: コンソールのエラー0`, jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('段0b(3) race-0001 を保存したセットを開くと、レースは保たれ、選択欄に「（一覧から外れました）」の行として「指定なし」の次に出る（選ばれている）／新しい文は足さない／選び直せる', async () => {
		const ended = RACES.find((r) => r.id === 'race-0001');
		const roster = Object.assign({}, FULL, { race: SNAP(ended) });
		for (const w of [390, 1280]) {
			const sp = await openSp({ w, h: w === 1280 ? 900 : 844, roster });
			const before = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')).race);
			assert(before && before.id === 'race-0001', `段0b(3) ${w}px: 開いたあとも、保存したレース（race-0001）は保たれている`, before);
			const bar = await sp.page.evaluate(() => { const b = document.querySelector('#hdr-race-slot [data-usd-el="set-race-text"]'); return b ? b.textContent : null; });
			assert(bar && bar.length > 0 && bar !== 'レース', `段0b(3) ${w}px: 帯のレースの表示は、保存したレースの短い表記のまま（${bar}）`, bar);
			await openRaceList(sp.page);
			const rows = await raceRows(sp.page);
			assert(rows[0].id === '' && !rows[0].checked && rows[1].id === 'race-0001' && rows[1].checked && /（一覧から外れました）$/.test(rows[1].line1) && rows.length === SEL.length + 2, `段0b(3) ${w}px: 「指定なし」の次に、選ばれた race-0001 の行が「（一覧から外れました）」つきで出る（全${SEL.length + 2}行）`, rows.slice(0, 3));
			// 選び直せる（選べるレースへ）。選ぶと race-0001 の行は消える
			await sp.page.click('[data-usd-el="race-opt"][data-race-id="' + SEL[0].id + '"] input');
			await sp.page.waitForTimeout(300);
			const dr = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')).race);
			assert(dr && dr.id === SEL[0].id, `段0b(3) ${w}px: 選べるレースへ選び直せる`, dr);
			await openRaceList(sp.page);
			const rows2 = await raceRows(sp.page);
			assert(!rows2.some((r) => r.id === 'race-0001') && rows2.find((r) => r.id === SEL[0].id).checked, `段0b(3) ${w}px: 選び直したあとは race-0001 の行は出ない`, rows2.map((r) => r.id));
			assert(jsErrors(sp.errors).length === 0, `段0b(3) ${w}px: コンソールのエラー0`, jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('段0b(4) 合計・進化の判定は変更前と同じ（保存済みのセット＝race-0001 を持つセットで、selectable の項目だけを外した一覧と比べる）', async () => {
		const ended = RACES.find((r) => r.id === 'race-0001');
		const oldDoc = JSON.parse(JSON.stringify(RACES_DOC));
		oldDoc.races.forEach((r) => { delete r.selectable; });
		const rosters = [
			Object.assign({}, FULL, { race: SNAP(ended) }),
			{ rosterId: 'r_evo', name: '', umaId: 'uma-0241', star: 3, awakeningLevel: 5, cardIds: CARDS6, skillFilter: { style: 'oikomi' }, race: SNAP(ended) },
			{ rosterId: 'r_evo2', name: '', umaId: 'uma-0112', star: 3, awakeningLevel: 5, cardIds: [null, null, null, null, null, null], skillFilter: { style: 'senko' }, race: SNAP(ended) },
		];
		const read = async (races) => {
			const sp = await openSp({ races });
			const out = await sp.page.evaluate(async (rosters) => {
				const C = UmaSkillDeckCore;
				await C.loadTrainingSources(); await C.loadSkillPtData(); await C.loadSkillEvolutions(false); await C.loadSkillDescriptions();
				return rosters.map((r) => {
					const vp = C.getRosterVisiblePart(r);
					const plan = C.computeEvolutionPlan({ umaId: r.umaId, takenIds: vp.takenIds, filter: { style: (r.skillFilter || {}).style || '' }, race: r.race, choices: r.evolutionChoices });
					return JSON.stringify({ pt: C.getRosterPtDetail(r), vp, plan });
				});
			}, rosters);
			await sp.ctx.close();
			return out;
		};
		const cur = await read(undefined);
		const old = await read(oldDoc);
		assert(cur.length === rosters.length && cur.every((x, i) => x === old[i] && x.length > 100), '段0b(4) 合計（getRosterPtDetail）・表に出す行（getRosterVisiblePart）・進化の判定（computeEvolutionPlan）が、selectable の項目を外した一覧と同一（race-0001 を持つ3つのセット）', { same: cur.map((x, i) => x === old[i]) });
	});
}
