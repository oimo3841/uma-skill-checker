// オススメサポ ④（レース条件と、小窓の絞り込み。段7〜段12。2026-10-04・C-126）の検査。run-smoke.mjs の末尾から register12() で呼ばれる
// （塊の見出しはすべて「オススメサポ④」で始まる。`npm run test:visual -- --only=オススメサポ④` で回せる。段ごとに「④段7」のように回せる）。
//
// 段7: 入口のボタンの色（blocks-11 の (G) で見る）・小窓が開いているときの知らせの位置・レース一覧の読み込み
// 段8: 保存（roster.race）と、①の距離・バ場の固定（保存値は書き換えない）
// 段9: セットの帯の「レース ▾」と選択欄・母集団の規則（軸ごと・公開なしの軸は外さない・特殊ルール・金スキル自身の条件）
// 段10: 枚数（4・5・6）と、指定の保存（roster.outsideOptions）・見出し行の3つのボタン
// 段11: 「種類」の指定（探索の拡張・友人は最大1枚・満たせないときの表示）
// 段12: 「絞り込み」（条件で検索と同じ軸・照合。状態は混ざらない）
// スキル名・レース名は検査の側に書かない（恒久ルール1。画面に出る文字として読むか、データから引く）。

export async function register12(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const scenReal = readJson('data/scenario-event-skills.json');
	const racesReal = readJson('data/upcoming-races.json');
	const FILTER = { distance: 'medium', style: 'senko', surface: 'turf' };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: FILTER };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const P = '#deck-roster-panel ';
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const M = '[data-usd-el="outside-modal"] ';
	const OPEN = '[data-usd-el="outside-open"]';
	const MSG_PENDING = '①でイベントの選択が済んでいないものがあります';

	/** special.html を開く（②の因子周回タブ）。roster＝下書きの①（null で無し）、userData＝保存データ、races＝レース一覧の応答（null で 404） */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, o.userData || EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		if (o.races !== undefined) await sp.page.route('**/data/upcoming-races.json*', (r) => (o.races === null ? r.fulfill({ status: 404, body: 'x' }) : r.fulfill(json(o.races))));
		if (o.syn) {
			await sp.page.route('**/data/support-cards.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'supportCard', nextSerial: 'card-9999', note: 'x', entries: o.syn.cards })));
			await sp.page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'supportCardEventSkill', note: 'x', entries: o.syn.events })));
			await sp.page.route('**/data/character-event-skills.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'characterEventSkill', note: 'x', entries: [] })));
		}
		await sp.page.evaluate(({ roster, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster === undefined ? FULL : o.roster, tab: o.tab === undefined ? 1 : o.tab });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const ud = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData')));
	const rawUd = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
	const draftRoster = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));
	const modalOpen = (page) => page.evaluate(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden; });
	const settle = (page) => page.waitForFunction(() => {
		const m = document.querySelector('[data-usd-el="outside-modal"]');
		return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]');
	}, null, { timeout: 20000 });
	const open = async (page) => { await page.click(T + OPEN); await settle(page); };

	/* ====================================================================
	 * 段7: レース一覧の読み込み・知らせの位置
	 * ==================================================================== */
	await block('オススメサポ④段7 レース一覧: data/upcoming-races.json を読む（並びはファイルの行の順・公開されていない項目は null）／読めなければ null で、ページは動く', async () => {
		const sp = await openSp({ roster: FULL });
		const got = await sp.page.evaluate(() => UmaSkillDeckCore.getUpcomingRaces());
		assert(Array.isArray(got) && got.length === racesReal.races.length && got.map((r) => r.id).join() === racesReal.races.map((r) => r.id).join()
			&& got.every((r, i) => Object.keys(racesReal.races[i]).every((k) => r[k] === racesReal.races[i][k])),
			'オススメサポ④段7 一覧を読み、行の順のまま・項目の値も同じ（null は null のまま）', { n: got && got.length });
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段7 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 読めないとき: 「レース条件なし」で動く（①②が描かれ、オススメサポが開く）
		const sp2 = await openSp({ roster: FULL, races: null });
		const r2 = await sp2.page.evaluate(() => ({ races: UmaSkillDeckCore.getUpcomingRaces(), bar: !!document.querySelector('#deck-set-bar [data-usd-el="setbar"]'), entry: !!document.querySelector('#deck-template-panel [data-usd-el="outside-open"]') }));
		await open(sp2.page);
		const opened = await modalOpen(sp2.page);
		assert(r2.races === null && r2.bar && r2.entry && opened, 'オススメサポ④段7 一覧が読めない（404）ときは null。セットの帯・入口のボタンは出て、オススメサポも開く', Object.assign({ opened }, r2));
		assert(jsErrors(sp2.errors).length === 0, 'オススメサポ④段7 一覧が読めなくても、コンソールのエラー0（読み込みの失敗の行は除く）', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});

	await block('オススメサポ④段7 知らせの位置: 小窓が開いているときは、知らせ（イベントの選択漏れ）を小窓のフッターの上に出す／閉じているときの位置は変えない（375×812・375×667）', async () => {
		for (const h of [812, 667]) {
			const sp = await openSp({ roster: FULL, h });
			// 閉じているときの位置（既定）
			const base0 = await sp.page.evaluate(() => getComputedStyle(document.getElementById('toast')).bottom);
			await open(sp.page);
			await sp.page.waitForTimeout(450);   // 知らせが出きる（0.3秒の動き）まで待つ
			const r = await sp.page.evaluate(() => {
				const t = document.getElementById('toast'), f = document.querySelector('[data-usd-el="outside-foot"]');
				const tr = t.getBoundingClientRect(), fr = f.getBoundingClientRect();
				return { text: document.getElementById('toast-message').textContent, shown: !t.classList.contains('opacity-0'), toastBottom: tr.bottom, footTop: fr.top, footHidden: f.hidden, varSet: document.documentElement.style.getPropertyValue('--usd-toast-bottom') };
			});
			assert(r.text === MSG_PENDING && r.shown && !r.footHidden && r.toastBottom <= r.footTop && r.varSet !== '',
				'オススメサポ④段7 375×' + h + ': 小窓が開いているとき、知らせ（' + MSG_PENDING + '）の下端（' + Math.round(r.toastBottom) + '）がフッターの上端（' + Math.round(r.footTop) + '）より上', r);
			await sp.page.click(M + '[data-usd-act="outside-close"]');
			await sp.page.waitForTimeout(200);
			await sp.page.evaluate(() => showToast('x'));
			await sp.page.waitForTimeout(450);   // 位置の動き（0.3秒）が終わるまで待つ
			const after = await sp.page.evaluate(() => ({ bottom: getComputedStyle(document.getElementById('toast')).bottom, varSet: document.documentElement.style.getPropertyValue('--usd-toast-bottom') }));
			assert(after.varSet === '' && Math.abs(parseFloat(after.bottom) - parseFloat(base0)) < 0.5,'オススメサポ④段7 375×' + h + ': 閉じたあとの知らせの位置は既定のまま（' + base0 + '）', { base0, after });
			assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段7 375×' + h + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * 段8: 保存（roster.race）と、①の距離・バ場の固定
	 * ==================================================================== */
	const SNAP = (row) => { const o = { id: row.id }; ['name', 'date', 'dateLabel', 'venue', 'surface', 'distance', 'distanceCategory', 'direction', 'course', 'season', 'weather', 'ground', 'time', 'rule'].forEach((k) => { o[k] = row[k] === undefined ? null : row[k]; }); return o; };
	const R0 = racesReal.races[0];
	const SAVED = (extra, filter) => ({ schemaVersion: 7, records: [], customSkills: [], templates: [
		{ templateId: 't1', name: 'S1', skillIds: ['1', '2', '3'], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' },
		{ templateId: 't2', name: 'S2', skillIds: [], createdAt: 'x', updatedAt: 'x' }],
		rosters: [Object.assign({ rosterId: 'r1', name: 'S1', umaId: FULL.umaId, star: 3, awakeningLevel: 5, cardIds: CARDS6.slice(), skillFilter: filter || FILTER, createdAt: 'x', updatedAt: 'x' }, extra || {})] });
	const pickSet = async (page, id) => {
		await page.click(BAR + '[data-usd-act="set-list"]');
		await page.click('[data-usd-el="set-list"] input[value="' + id + '"]');
		await page.waitForTimeout(250);
	};
	const rr = (d) => d.rosters.find((r) => r.rosterId === 'r1');
	/** ①の絞り込みの選択欄（距離・脚質・バ場）の見え方 */
	const filterUi = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel select[data-usd-act="filter"]')).map((s) => {
		const lab = s.closest('label');
		return { axis: s.getAttribute('data-axis'), value: s.value, disabled: s.disabled, lock: !!lab.querySelector('[data-usd-el="filter-lock"]'), locked: lab.getAttribute('data-usd-locked') === '1',
			on: s.classList.contains('usd-roster-filtersel--on'), opacity: getComputedStyle(s).opacity, bg: getComputedStyle(s).backgroundColor, fg: getComputedStyle(s).color };
	}));
	/** 保存の規則を見る（race・outsideOptions で同じ形）。key＝roster の項目、setOn(page)＝書く、setOff(page)＝消す、val＝書いたときの保存値 */
	const checkSaveRules = async (tag, key, setOn, setOff, val, extraOld) => {
		// (1) 項目の無いデータは、開いてセットを選んでも1バイトも変わらない
		const seed = SAVED();
		let sp = await openSp({ userData: seed, roster: null });
		await pickSet(sp.page, 't1');
		assert((await rawUd(sp.page)) === JSON.stringify(seed), tag + ' 項目の無いデータを開き、セットを選んでも、保存データは1バイトも変わらない', true);
		// (2) 書く → roster に入る（schemaVersion は 7 のまま）。同じものをもう一度書いても変わらない
		await setOn(sp.page);
		let d = await ud(sp.page);
		assert(JSON.stringify(rr(d)[key]) === JSON.stringify(val) && d.schemaVersion === 7 && d.rosters.length === 1 && JSON.stringify(rr(d).skillFilter) === JSON.stringify(FILTER),
			tag + ' 書くと、保存済みのセットの roster に ' + key + ' が入る（schemaVersion は 7 のまま・skillFilter は書き換えない）', rr(d)[key]);
		const once = await rawUd(sp.page);
		await setOn(sp.page);
		assert((await rawUd(sp.page)) === once, tag + ' 同じ指定をもう一度しても、保存データは変わらない', true);
		const exported = JSON.stringify(d);
		// (3) ①の次の書き込み・①②のリセットで消えない
		await sp.page.evaluate(() => document.querySelector('#deck-roster-panel input[data-usd-act="take-skill"]').click());
		await sp.page.waitForTimeout(300);
		d = await ud(sp.page);
		assert(JSON.stringify(rr(d)[key]) === JSON.stringify(val) && Array.isArray(rr(d).offSkillIds), tag + ' ①で次の書き込み（スキルのオン/オフ）をしても消えない（①のメモリ上の roster 経由）', rr(d)[key]);
		await sp.page.evaluate(() => document.querySelector('#deck-roster-panel input[data-usd-act="take-skill"]').click());
		await sp.page.waitForTimeout(250);
		await sp.page.evaluate(() => selectStepTab(0, { noSave: true }));
		await sp.page.waitForTimeout(250);
		await sp.page.click(P + '[data-usd-act="roster-reset"]');
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(300);
		d = await ud(sp.page);
		assert(!rr(d).umaId && JSON.stringify(rr(d)[key]) === JSON.stringify(val), tag + ' ①のリセットは消さない（ROSTER_RESET_KEYS に入れていない）', { uma: rr(d).umaId, v: rr(d)[key] });
		await sp.page.evaluate(() => selectStepTab(1, { noSave: true }));
		await sp.page.waitForTimeout(250);
		await sp.page.click(T + '[data-usd-act="factor-reset"]');
		await sp.page.click('[data-usd-el="factor-reset-all"]');
		await sp.page.waitForTimeout(300);
		d = await ud(sp.page);
		assert(JSON.stringify(rr(d)[key]) === JSON.stringify(val), tag + ' ②のリセットも消さない', rr(d)[key]);
		// (4) 消す → 項目ごと消える
		await setOff(sp.page);
		d = await ud(sp.page);
		assert(!(key in rr(d)), tag + ' 指定なしに戻すと、項目ごと消える', Object.keys(rr(d)));
		await sp.ctx.close();
		// (5) 取り込み（書き出した中身で開く）・再読み込み
		sp = await openSp({ userData: JSON.parse(exported), roster: null });
		await pickSet(sp.page, 't1');
		assert((await rawUd(sp.page)) === exported, tag + ' 書き出したデータを取り込んで開いても、1バイトも変わらない（移行も補いもしない）', true);
		const pg = await sp.ctx.newPage();
		await pg.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		await pg.goto(base + '/special.html', { waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await pg.isVisible('#ui-notice')) await pg.click('[data-act="notice-ok"]');
		await pg.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 });
		await pickSet(pg, 't1');
		assert(JSON.stringify(rr(await ud(pg))[key]) === JSON.stringify(val), tag + ' 再読み込みのあとも残っている', true);
		await pg.close();
		await sp.ctx.close();
		// (6) 古いデータ（この項目より前の形・形の崩れた値）を読んでも1バイトも変わらない
		for (const [label, extra] of [['項目なし', {}]].concat(extraOld || [])) {
			const old = SAVED(extra);
			sp = await openSp({ userData: old, roster: null });
			await pickSet(sp.page, 't1');
			await sp.page.evaluate(() => selectStepTab(0, { noSave: true }));
			await sp.page.waitForTimeout(250);
			await sp.page.evaluate(() => selectStepTab(1, { noSave: true }));
			await sp.page.waitForTimeout(250);
			assert((await rawUd(sp.page)) === JSON.stringify(old), tag + ' 古いデータ（' + label + '）を読み、①②を開いても、1バイトも変わらない', true);
			assert(jsErrors(sp.errors).length === 0, tag + ' 古いデータ（' + label + '）: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// (7) ＋新規の保存: この項目だけを持つ下書きの①も写される
		sp = await openSp({ roster: { [key]: val } });
		await sp.page.click(BAR + '[data-usd-act="name-edit"]');
		await sp.page.fill(BAR + '[data-usd-el="name"]', key + 'だけ');
		await sp.page.keyboard.press('Enter');
		await sp.page.waitForTimeout(250);
		d = await ud(sp.page);
		const nt = d.templates.find((t) => t.name === key + 'だけ');
		const nr = nt && d.rosters.find((r) => r.rosterId === nt.baseRosterId);
		assert(nt && nr && JSON.stringify(nr[key]) === JSON.stringify(val), tag + ' 「＋新規の保存」で、この項目だけを持つ下書きの①も写される（rosterHasContent）', { nt: !!nt, nr });
		await sp.ctx.close();
		// (8) Deck: 書き出し→取り込み→「元に戻す」・取り込み直し・複製
		const seedD = SAVED({ [key]: val });
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, seedD);
		await dk.page.click('#tab-btn-data');
		await dk.page.waitForTimeout(300);
		const state = () => dk.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const bef = await state();
		const exp = await dk.page.evaluate(() => { exportData(); return document.getElementById('export-textarea').value; });
		assert(JSON.stringify(JSON.parse(exp).rosters[0][key]) === JSON.stringify(val), tag + ' 書き出しに項目が入る', true);
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = JSON.stringify(v); const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, EMPTY);
		const un = await dk.page.evaluate(() => ({ ok: performUndo() }));
		await dk.page.waitForTimeout(300);
		assert(un.ok && (await state()) === bef, tag + ' 取り込み→「元に戻す」で、項目つきのデータが取り込み前と一致する（移行で書き換わらない）', un);
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = v; const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, exp);
		assert(JSON.stringify(await dk.page.evaluate((k) => UmaSkillDeckCore.getUserData().rosters[0][k], key)) === JSON.stringify(val), tag + ' 書き出したファイルを取り込み直しても、項目が保たれる', true);
		await dk.page.evaluate(() => switchTab('template'));
		await dk.page.click('[data-usd-act="template-tab"][data-tab-id="t1"]');
		await dk.page.waitForTimeout(250);
		await dk.page.click('[data-usd-act="template-duplicate"]');
		await dk.page.waitForTimeout(300);
		const aft = await dk.page.evaluate((k) => { const d = UmaSkillDeckCore.getUserData(); return { n: d.templates.length, v: d.rosters.map((r) => r[k]), base: d.templates.map((t) => t.baseRosterId) }; }, key);
		assert(aft.n === 3 && JSON.stringify(aft.v[0]) === JSON.stringify(val), tag + ' セットの複製（Deck）でも、roster の項目は保たれる（複製は同じ roster を指す）', aft);
		assert(dk.errors.length === 0, tag + ' Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
	};

	await block('オススメサポ④段8 保存（roster.race）: 触ったときだけ書く・指定なしで項目ごと消す・schemaVersion 7・①の次の書き込み／①②のリセットで消えない・書き出し／取り込み／元に戻す／複製／再読み込み・古いデータは1バイトも変わらない', async () => {
		const setOn = (page) => page.evaluate(() => UmaSkillDeckCore.outside.setRace(UmaSkillDeckCore.getUpcomingRaces()[0]));
		const setOff = (page) => page.evaluate(() => UmaSkillDeckCore.outside.setRace(null));
		await checkSaveRules('オススメサポ④段8 race:', 'race', setOn, setOff, SNAP(R0), [
			['一覧から消えたレース', { race: Object.assign(SNAP(R0), { id: 'race-9999', name: '消えたレース' }) }],
			['形の崩れた race', { race: { id: 5 } }]
		]);
	});

	await block('オススメサポ④段8 ①の固定: 距離・バ場はレースの値で選べない状態（錠の印）／脚質はそのまま／保存値（skillFilter）は書き換えない／指定なしに戻すと元の選択／公開されていない項目は固定しない／一覧から消えたレースも同じ条件', async () => {
		const own = { distance: 'short', style: 'nige', surface: 'dirt' };
		const seed = SAVED({}, own);
		const sp = await openSp({ userData: seed, roster: null, tab: 0 });
		await pickSet(sp.page, 't1');
		const u0 = await filterUi(sp.page);
		assert(u0.every((x) => !x.disabled && !x.lock) && u0.map((x) => x.value).join() === 'short,nige,dirt', 'オススメサポ④段8 レース条件が無いときは、3つとも利用者の選択（固定なし）', u0);
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setRace(UmaSkillDeckCore.getUpcomingRaces()[0]));
		await sp.page.waitForTimeout(250);
		const u1 = await filterUi(sp.page);
		const by = (u, a) => u.find((x) => x.axis === a);
		const d1 = await ud(sp.page);
		assert(by(u1, 'distance').disabled && by(u1, 'distance').value === R0.distanceCategory && by(u1, 'distance').lock && by(u1, 'surface').disabled && by(u1, 'surface').value === R0.surface && by(u1, 'surface').lock
			&& !by(u1, 'style').disabled && by(u1, 'style').value === 'nige' && !by(u1, 'style').lock,
			'オススメサポ④段8 レースを選ぶと、距離（' + R0.distanceCategory + '）・バ場（' + R0.surface + '）がレースの値で選べない状態になり、錠の印が付く。脚質は利用者の選択のまま', u1.map((x) => [x.axis, x.value, x.disabled, x.lock]));
		assert(u1.every((x) => x.opacity === '1') && by(u1, 'distance').bg === by(u1, 'style').bg && by(u1, 'distance').fg === by(u1, 'style').fg,
			'オススメサポ④段8 固定中の選択欄は、選んだ欄と同じ濃色（opacity は使わない）', u1.map((x) => [x.axis, x.opacity, x.bg]));
		assert(JSON.stringify(rr(d1).skillFilter) === JSON.stringify(own), 'オススメサポ④段8 保存値（skillFilter）は書き換えない', rr(d1).skillFilter);
		const rf = await sp.page.evaluate((r) => UmaSkillDeckCore.outside.resolvedFilterOf(r), rr(d1));
		assert(JSON.stringify(rf) === JSON.stringify({ distance: R0.distanceCategory, style: 'nige', surface: R0.surface }), 'オススメサポ④段8 resolvedFilterOf がレースの値で上書きして返す（①の表・②の本育成編成・オススメサポが同じ値を読む）', rf);
		// 押せない（無理に change を送っても書かない）
		await sp.page.evaluate(() => { const s = document.querySelector('#deck-roster-panel select[data-usd-act="filter"][data-axis="distance"]'); s.disabled = false; s.value = 'long'; s.dispatchEvent(new Event('change', { bubbles: true })); });
		await sp.page.waitForTimeout(200);
		assert(JSON.stringify(rr(await ud(sp.page)).skillFilter) === JSON.stringify(own) && by(await filterUi(sp.page), 'distance').value === R0.distanceCategory, 'オススメサポ④段8 固定中の軸は、変更が届いても保存しない', rr(await ud(sp.page)).skillFilter);
		// 指定なしに戻す → 元の選択
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setRace(null));
		await sp.page.waitForTimeout(250);
		const u2 = await filterUi(sp.page);
		assert(u2.every((x) => !x.disabled && !x.lock) && u2.map((x) => x.value).join() === 'short,nige,dirt', 'オススメサポ④段8 「指定なし」に戻すと、元の選択（短距離・逃げ・ダート）に戻る', u2.map((x) => [x.axis, x.value]));
		// 公開されていない項目は固定しない（距離の区分だけ公開・バ場だけ公開）
		for (const [label, row, locks] of [
			['距離の区分だけ', { id: 'race-x1', name: 'x', distanceCategory: 'long' }, { distance: 'long' }],
			['バ場だけ', { id: 'race-x2', name: 'x', surface: 'turf' }, { surface: 'turf' }],
			['どちらも公開なし', { id: 'race-x3', name: 'x', venue: 'track_tokyo' }, {}]
		]) {
			await sp.page.evaluate((r) => UmaSkillDeckCore.outside.setRace(r), row);
			await sp.page.waitForTimeout(200);
			const u = await filterUi(sp.page);
			const ok = u.every((x) => (locks[x.axis] !== undefined) === x.disabled && (locks[x.axis] !== undefined ? x.value === locks[x.axis] : x.value === own[x.axis]));
			assert(ok, 'オススメサポ④段8 公開されていない項目は固定しない（' + label + '）', u.map((x) => [x.axis, x.value, x.disabled]));
		}
		assert(JSON.stringify(rr(await ud(sp.page)).skillFilter) === JSON.stringify(own), 'オススメサポ④段8 何度レースを替えても、skillFilter は書き換わらない', true);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段8 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 一覧から消えたレースを持つセット: 保存値はそのまま、同じ条件で固定が効く
		const gone = Object.assign(SNAP(R0), { id: 'race-9999' });
		const seed2 = SAVED({ race: gone }, own);
		const sp2 = await openSp({ userData: seed2, roster: null, tab: 0 });
		await pickSet(sp2.page, 't1');
		const u3 = await filterUi(sp2.page);
		assert((await rawUd(sp2.page)) === JSON.stringify(seed2) && by(u3, 'distance').disabled && by(u3, 'distance').value === R0.distanceCategory && by(u3, 'surface').value === R0.surface,
			'オススメサポ④段8 一覧から消えたレース（race-9999）を持つセットは、保存値を書き換えず、同じ条件で固定が効く', u3.map((x) => [x.axis, x.value, x.disabled]));
		await sp2.ctx.close();
	});
}
