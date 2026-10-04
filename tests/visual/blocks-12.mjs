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
		// 段13・B2: 読み込み直すと直前のセットが開くので、すでに選ばれていたら一覧を閉じるだけ（押しても change が起きず一覧が残るため）
		const already = await page.evaluate((v) => { const i = document.querySelector('[data-usd-el="set-list"] input[value="' + v + '"]'); return !!i && i.checked; }, id);
		if (already) await page.keyboard.press('Escape');
		else await page.click('[data-usd-el="set-list"] input[value="' + id + '"]');
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

	/* ====================================================================
	 * 段9: セットの帯の「レース ▾」と選択欄・母集団の規則
	 * ==================================================================== */
	const barInfo = (page) => page.evaluate(() => {
		const bar = document.querySelector('#deck-set-bar [data-usd-el="setbar"]');
		const b = bar.querySelector('[data-usd-el="set-race-btn"]');
		const sum = bar.querySelector('[data-usd-el="set-total"]');
		const caret = b ? b.querySelector('.usd-setbar-race-caret') : null;
		const rect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
		return { barH: Math.round(bar.getBoundingClientRect().height), btn: b ? rect(b) : null, text: b ? b.innerText.replace(/\s+/g, '') : null, caretShown: !!caret && getComputedStyle(caret).display !== 'none',
			on: b ? b.getAttribute('aria-pressed') === 'true' : null, bg: b ? getComputedStyle(b).backgroundColor : null, sumL: sum ? sum.getBoundingClientRect().left : null,
			pillR: bar.querySelector('[data-usd-el="set-pill"]').getBoundingClientRect().right, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
	});
	const raceRows = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="race-list"] [data-usd-el="race-opt"]')).map((l) => ({
		id: l.getAttribute('data-race-id'), checked: l.querySelector('input').checked, line1: (l.querySelector('[data-usd-el="race-line1"]') || l.querySelector('.usd-link-name')).textContent,
		line2: (l.querySelector('[data-usd-el="race-line2"]') || {}).textContent || null })));
	const openRaceList = async (page) => { await page.click(BAR + '[data-usd-act="set-race"]'); await page.waitForSelector('[data-usd-el="race-list"]'); };
	const chooseRace = async (page, id) => { await openRaceList(page); await page.click('[data-usd-el="race-opt"][data-race-id="' + id + '"] input'); await page.waitForTimeout(300); };

	await block('オススメサポ④段9 帯の「レース ▾」: 「0/10 ▾」の右・高さ28px・選ぶと濃色／帯の高さは変わらない／320px は「レース」だけ（320・375・414px）。選んだときの文字は段13・B1（blocks-13）', async () => {
		for (const w of [320, 375, 414]) {
			const sp = await openSp({ roster: FULL, w });
			const a = await barInfo(sp.page);
			await chooseRace(sp.page, R0.id);
			const b = await barInfo(sp.page);
			const tag = 'オススメサポ④段9 ' + w + 'px: ';
			assert(a.btn && Math.round(a.btn.h) === 28 && a.btn.l >= a.pillR && a.btn.r <= a.sumL && a.sw <= a.iw && !a.on, tag + '「レース」のボタンは札（0/10 ▾）の右・合計の左に入り、高さ28px。画面は横にはみ出さない', a);
			assert(a.text === (w < 360 ? 'レース' : 'レース▾') && a.caretShown === (w >= 360), tag + (w < 360 ? '320px は「レース」だけ（▾を省く）' : '「レース ▾」'), { text: a.text, caret: a.caretShown });
			assert(b.on && b.bg !== a.bg && b.barH === a.barH && b.btn.r <= b.sumL && b.sw <= b.iw, tag + '選ぶとボタンが濃色になる。帯の高さ（' + a.barH + 'px）は変わらない（文字は段13・B1 で条件の短い形）', { a: [a.barH, a.bg], b: [b.barH, b.bg, b.text] });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('オススメサポ④段9 レースの選択欄: 先頭に「指定なし」・1行目は日付＋レース名・2行目は公開された条件だけ／選ぶと①の固定とボタンに反映・指定なしで戻る／一覧から外れたレースは「（一覧から外れました）」で先頭近く／①が空のセットでも選べる', async () => {
		const sp = await openSp({ roster: FULL, tab: 1 });
		await openRaceList(sp.page);
		const rows = await raceRows(sp.page);
		const dateOf = (r) => (r.date ? Number(r.date.slice(5, 7)) + '/' + Number(r.date.slice(8, 10)) : r.dateLabel);
		assert(rows.length === racesReal.races.length + 1 && rows[0].id === '' && rows[0].line1 === '指定なし' && rows[0].checked && rows[0].line2 === null,
			'オススメサポ④段9 先頭は「指定なし」（選ばれている）。続けて一覧の' + racesReal.races.length + '行', rows.map((r) => r.line1));
		assert(rows.slice(1).every((r, i) => r.id === racesReal.races[i].id && r.line1 === dateOf(racesReal.races[i]) + ' ' + racesReal.races[i].name),
			'オススメサポ④段9 1行目は「日付（決まっていなければ「11月下旬」のような表示）＋レース名」で、並びはファイルの行の順', rows.slice(1).map((r) => r.line1));
		const line2 = rows.slice(1).map((r) => r.line2);
		assert(line2[0] === '京都 芝2200m 右・外・秋・曇・良・昼' && line2[1] === '京都 芝3000m 右・外・秋・昼' && line2[3] === '芝 中距離' && line2[4] === 'ダート 中距離' && line2[5] === '芝 マイル デバフなし'
			&& line2.every((t) => t && !/不明|null|undefined/.test(t)),
			'オススメサポ④段9 2行目は公開された条件だけ（天気・バ場状態が公開されていない行は、その語を出さない。「不明」とは書かない）。特殊ルールは「デバフなし」', line2);
		await sp.page.click('[data-usd-el="race-opt"][data-race-id="' + R0.id + '"] input');
		await sp.page.waitForTimeout(300);
		const closed = await sp.page.evaluate(() => !document.querySelector('[data-usd-el="race-list"]') || !document.querySelector('[data-usd-el="race-list"]').offsetParent);
		const b = await barInfo(sp.page);
		const dr = await draftRoster(sp.page);
		assert(closed && b.on && JSON.stringify(dr.race) === JSON.stringify(SNAP(R0)), 'オススメサポ④段9 行を選ぶと選択欄が閉じ、ボタンが濃色になり、①（＋新規の下書き）にレースの写しが入る', { closed, on: b.on, race: dr.race && dr.race.id });
		await sp.page.evaluate(() => selectStepTab(0, { noSave: true }));
		await sp.page.waitForTimeout(250);
		const u = await filterUi(sp.page);
		assert(u.find((x) => x.axis === 'distance').disabled && u.find((x) => x.axis === 'surface').disabled, 'オススメサポ④段9 ①の距離・バ場が固定される（段8 の仕組み）', u.map((x) => [x.axis, x.disabled]));
		await sp.page.evaluate(() => selectStepTab(1, { noSave: true }));
		await sp.page.waitForTimeout(250);
		await openRaceList(sp.page);
		const rows2 = await raceRows(sp.page);
		assert(rows2.find((r) => r.id === R0.id).checked && !rows2[0].checked, 'オススメサポ④段9 開き直すと、選んだレースに印', rows2.map((r) => r.checked));
		await sp.page.click('[data-usd-el="race-opt"][data-race-id=""] input');
		await sp.page.waitForTimeout(300);
		assert(!('race' in (await draftRoster(sp.page))) && !(await barInfo(sp.page)).on, 'オススメサポ④段9 「指定なし」を選ぶと、項目ごと消え、ボタンは元の見た目', true);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段9 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 一覧から外れたレース
		const gone = Object.assign(SNAP(R0), { id: 'race-9999' });
		const sp2 = await openSp({ userData: SAVED({ race: gone }), roster: null });
		await pickSet(sp2.page, 't1');
		await openRaceList(sp2.page);
		const rows3 = await raceRows(sp2.page);
		assert(rows3[1].id === 'race-9999' && rows3[1].checked && /（一覧から外れました）$/.test(rows3[1].line1) && rows3[1].line2 === line2[0] && rows3.length === racesReal.races.length + 2 && (await barInfo(sp2.page)).on,
			'オススメサポ④段9 セットが持っているレースが一覧に無いときは、「指定なし」の次にその行を出し（選ばれている）、「（一覧から外れました）」と添える', rows3.slice(0, 3));
		await sp2.ctx.close();
		// ①が空の保存済みのセット（roster が無い）: 選ぶと編成が作られ、そこに入る
		const sp3 = await openSp({ userData: SAVED(), roster: null });
		await pickSet(sp3.page, 't2');
		await chooseRace(sp3.page, racesReal.races[3].id);
		const d3 = await ud(sp3.page);
		const t2 = d3.templates.find((t) => t.templateId === 't2');
		const r2 = t2 && d3.rosters.find((r) => r.rosterId === t2.baseRosterId);
		assert(r2 && r2.race && r2.race.id === racesReal.races[3].id && d3.schemaVersion === 7, 'オススメサポ④段9 ①が空のセットでレースを選ぶと、編成が1つ作られ（名前はセット名）、そこにレースが入る', { r2: r2 && { name: r2.name, race: r2.race && r2.race.id } });
		await sp3.ctx.close();
	});

	/** 検査の側の母集団の規則（実装とは別に書いた物差し）。タグの語は値の形（_turn・season_ など）で群に分ける */
	const groupOf = { direction: (v) => /_turn$/.test(v), season: (v) => /^season_/.test(v), weather: (v) => /^weather_/.test(v), ground: (v) => /^ground_/.test(v) };
	const oracleRejects = (tags, race) => {
		const env = tags.environment || [], tv = tags.trackVenue || [];
		if (race.venue && tv.length > 0 && !tv.includes(race.venue)) return true;
		for (const f of Object.keys(groupOf)) {
			if (!race[f]) continue;
			const sv = env.filter(groupOf[f]);
			if (sv.length > 0 && !sv.includes(race[f])) return true;
		}
		// 段13・A1: 昼のレースでは、ナイターのタグを持つスキル（昼のタグを持たないもの）を外す
		if (race.time === 'time_day' && env.includes('time_night') && !env.includes('time_day')) return true;
		if (race.rule === 'no_debuff' && (tags.effect || []).some((v) => v === 'debuff' || v === 'temptation_time')) return true;
		return false;
	};

	await block('オススメサポ④段9 母集団の規則: 軸ごと（レース場・回り・季節・天気・バ場状態）に食い違うものだけ外す／公開されていない軸・タグの無いスキルは外さない／内外は効かせない・昼はナイターのスキルだけ外す（段13・A1）／特殊ルール「デバフなし」／実データで物差しと一致', async () => {
		const sp = await openSp({ roster: FULL });
		const base0 = await sp.page.evaluate(() => { const ids = UmaSkillDeckCore.outside.populationOf({}).ids; return ids.map((id) => [id, UmaSkillDeckCore.getSkillTags(id)]); });
		const cases = [
			['レース場だけ（京都）', { venue: 'track_kyoto' }],
			['右回りだけ', { direction: 'right_turn' }],
			['左回りだけ', { direction: 'left_turn' }],
			['季節だけ（冬）', { season: 'season_winter' }],
			['天気だけ（雨）', { weather: 'weather_rain' }],
			['バ場状態だけ（良）', { ground: 'ground_good' }],
			['バ場状態だけ（道悪）', { ground: 'ground_bad' }],
			['内外だけ（効かせない）', { course: 'outer' }],
			['昼だけ（ナイターのスキルを外す）', { time: 'time_day' }],
			['夜だけ（外さない）', { time: 'time_night' }],
			['デバフなしだけ', { rule: 'no_debuff' }],
			['公開なし（名前だけ）', {}],
			['一覧の1行目（全部公開）', R0],
			['一覧の6行目（芝・マイル・デバフなし）', racesReal.races[5]]
		];
		const out = [];
		for (const [label, fields] of cases) {
			const race = Object.assign({ id: 'race-t', name: 't' }, fields);
			const r = await sp.page.evaluate((rc) => { const p = UmaSkillDeckCore.outside.populationOf({ race: rc }); return { ids: p.ids, ex: p.raceExcludedIds }; }, race);
			// ①の固定（距離・バ場）で外れる分は、母集団の比較から除く（ここで見るのはレース条件の述語だけ）
			const base = await sp.page.evaluate((rc) => UmaSkillDeckCore.outside.populationOf({ skillFilter: UmaSkillDeckCore.outside.lockedFilterOf({ race: rc }) }).ids, race);
			const baseSet = new Set(base);
			const expected = base0.filter(([id, tags]) => baseSet.has(id) && oracleRejects(tags, race)).map(([id]) => id).sort();
			const got = r.ex.slice().sort();
			const keep = base.filter((id) => expected.indexOf(id) === -1).sort();
			out.push(label + ' ' + got.length);
			assert(JSON.stringify(got) === JSON.stringify(expected) && JSON.stringify(r.ids.slice().sort()) === JSON.stringify(keep),
				'オススメサポ④段9 ' + label + ': 外すスキル（' + got.length + '種）が物差しと一致し、残りは全部残る', { got: got.length, expected: expected.length });
			if (label.indexOf('公開なし') !== -1 || label.indexOf('内外だけ') !== -1 || label.indexOf('夜だけ') !== -1) assert(got.length === 0, 'オススメサポ④段9 ' + label + ': 1種も外さない', got);
			else if (label.indexOf('一覧') === -1) assert(got.length > 0, 'オススメサポ④段9 ' + label + ': 実データで外れるスキルがある（検査が空振りしていない）', got.length);
		}
		console.log('     [実測] レース条件で外れる白スキルの数: ' + out.join(' / '));
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段9 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ④段9 金スキル自身の条件: レースと食い違う金は点数に数えない（前段の白は白として数える）／合うレース・指定なしでは数える', async () => {
		// 合成の材料: 左回りの金（前段の鎖の根は、検査のために左回りのタグを外した白）を持つカード1枚
		const master = readJson('uma-skill-deck-skills.json');
		const step = readJson('data/skill-step-up.json').entries;
		const pt = readJson('data/skill-pt.json').entries;
		const ext = readJson('data/extended-skills.json').entries;
		const rar = new Map(pt.map((e) => [e.skillId, e.rarity]));
		const prev = new Map(step.map((e) => [e.skillId, e.prevSkillIds]));
		const mIds = new Set(master.skills.map((s) => s.id));
		const chain = (g) => { const o = []; const walk = (x) => (prev.get(x) || []).forEach((p) => { o.push(p); walk(p); }); walk(g); return o; };
		const gold = ext.find((e) => rar.get(e.id) === 'gold' && ((e.tags || {}).environment || []).includes('left_turn') && chain(e.id).some((p) => mIds.has(p)));
		assert(!!gold, 'オススメサポ④段9 前提: 左回りのタグを持ち、前段の鎖にマスターの白がある金スキルがある', !!gold);
		const root = chain(gold.id).find((p) => mIds.has(p));
		const patched = Object.assign({}, master, { skills: master.skills.map((s) => (s.id === root ? Object.assign({}, s, { tags: Object.assign({}, s.tags, { environment: [] }) }) : s)) });
		const mk = (id, chara, order, hint) => ({ id, title: 'T', charaName: chara, type: 'x', typeOrder: order, rarity: 'SSR', isGroup: false, hintSkills: hint.map((s) => ({ skillId: s, name: 'x' })), dataStatus: { hint: 'done' } });
		const syn = { cards: [mk('syn-g1', 'テスト金', 1, [gold.id])].concat(CARDS6.map((id, i) => mk(id, 'ロスター' + i, 1, []))), events: [] };
		syn.events = syn.cards.map((c) => ({ cardId: c.id, status: 'done', chain: [] }));
		const sp = await openSp({ roster: null, syn });
		await sp.page.route('**/uma-skill-deck-skills.json*', (r) => r.fulfill(json(patched)));
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadMasterSkills(true); await UmaSkillDeckCore.loadTrainingSources(true); await UmaSkillDeckCore.loadSkillPtData(true); });
		const res = await sp.page.evaluate(({ g, root }) => {
			const C = UmaSkillDeckCore.outside;
			const run = (race) => { const r = C.solveSync({ roster: race ? { race } : {}, addedSkillIds: [], count: 5, deadlineMs: 20000 }); return { golds: r.golds.map((x) => x.skillId), whites: r.skills.map((x) => x.skillId), score: r.score }; };
			return { none: run(null), right: run({ id: 'race-t', name: 't', direction: 'right_turn' }), left: run({ id: 'race-t', name: 't', direction: 'left_turn' }), g, root };
		}, { g: gold.id, root });
		assert(res.none.golds.includes(gold.id) && res.none.whites.includes(root) && res.left.golds.includes(gold.id) && res.left.whites.includes(root),
			'オススメサポ④段9 指定なし・左回りのレースでは、金（左回り）を数え、前段の白も数える', { none: res.none, left: res.left });
		assert(!res.right.golds.includes(gold.id) && res.right.whites.includes(root) && res.right.score === res.none.score - 1,
			'オススメサポ④段9 右回りのレースでは、金（左回り）は点数に数えず（金スキル 0）、前段の白（タグの無い白）は白として数える（点数は1少ない）', res.right);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段9 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ④段9 レースで外したスキルは、チェックリストに出さず「除外中」にも数えない／条件で検索・②の数字・①の数字には効かない', async () => {
		const sp = await openSp({ roster: FULL });
		const nums = () => sp.page.evaluate(() => { const q = (s) => { const e = document.querySelector(s); return e ? e.textContent : null; };
			return { f: [q('#deck-template-panel [data-usd-el="factor-pt"]'), q('#deck-template-panel [data-usd-el="factor-count"]')], r: [q('#deck-roster-panel [data-usd-el="pt-total"]'), q('#deck-roster-panel [data-usd-el="pt-count"]')], badge: q('#skill-count-badge') }; });
		// 条件で検索・緑スキルの一覧（選べる行の id）
		const pickerIds = async (act) => {
			await sp.page.click(T + '[data-usd-act="' + act + '"]');
			await sp.page.waitForTimeout(200);
			const ids = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="skill-check"]')).filter((i) => !i.disabled).map((i) => i.value).sort().join());
			await sp.page.click('[data-usd-act="picker-close"]');
			return ids;
		};
		const before = await nums();
		const pk0 = await pickerIds('editor-pick'), gr0 = await pickerIds('editor-pick-passive');
		// R0（中距離・芝）は FULL の絞り込みと同じ距離・バ場なので、①の固定で数字は変わらない
		await chooseRace(sp.page, R0.id);
		const after = await nums();
		assert(JSON.stringify(before) === JSON.stringify(after), 'オススメサポ④段9 ①の絞り込みと同じ距離・バ場のレースを選んでも、②の合計・①の合計・見出しの数は変わらない（母集団の規則はオススメサポにだけ効く）', { before, after });
		const pk1 = await pickerIds('editor-pick'), gr1 = await pickerIds('editor-pick-passive');
		assert(pk0.length > 0 && gr0.length > 0 && pk1 === pk0 && gr1 === gr0, 'オススメサポ④段9 条件で検索・緑スキルの一覧は、レースを選んでも同じ（レースに合わないスキルも出て、選べる）', { pk: pk0.split(',').length, gr: gr0.split(',').length });
		const ex = await sp.page.evaluate(() => UmaSkillDeckCore.outside.populationOf(UmaSkillDeckCore.outside.getRace() ? JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')) : {}).raceExcludedIds);
		assert(ex.length > 0, 'オススメサポ④段9 前提: このレースで外れるスキルがある（' + ex.length + '種）', ex.length);
		await open(sp.page);
		const s = await sp.page.evaluate(() => ({ rows: Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]')).map((r) => r.getAttribute('data-skill-id')), excl: !!document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-excl"]') }));
		assert(s.rows.length > 0 && s.rows.every((id) => ex.indexOf(id) === -1) && !s.excl, 'オススメサポ④段9 チェックリストにレースで外したスキルは出ず、「除外中」の行も出ない', { rows: s.rows.length, excl: s.excl });
		const noRace = await sp.page.evaluate((r) => UmaSkillDeckCore.outside.populationOf(r).ids, FULL);
		assert(ex.every((id) => noRace.indexOf(id) !== -1), 'オススメサポ④段9 外したスキルは、レースが無ければ母集団に入っている（レース条件だけで外れた）', ex.length);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段9 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * 段10: 枚数（4・5・6）と、指定の保存（roster.outsideOptions）・見出し行の3つのボタン
	 * ==================================================================== */
	/** 見出し行（「カード」＋3つのボタン）の見え方 */
	const headInfo = (page) => page.evaluate(() => {
		const m = document.querySelector('[data-usd-el="outside-modal"]');
		const bar = m.querySelector('.usd-out-cardsbar');
		const btns = ['outside-types-btn', 'outside-filter-btn', 'outside-count-btn'].map((el) => m.querySelector('[data-usd-el="' + el + '"]'));
		const br = bar.getBoundingClientRect();
		return { barH: Math.round(br.height), texts: btns.map((b) => (b ? b.innerText.replace(/\s+/g, '') : null)), pressed: btns.map((b) => b && b.getAttribute('aria-pressed') === 'true'),
			hs: btns.map((b) => (b ? Math.round(b.getBoundingClientRect().height) : 0)), tops: btns.map((b) => (b ? Math.round(b.getBoundingClientRect().top) : 0)),
			inside: btns.every((b) => b && b.getBoundingClientRect().right <= br.right + 0.5 && b.getBoundingClientRect().left >= br.left - 0.5), sw: document.documentElement.scrollWidth, iw: window.innerWidth };
	});
	const countOf = (page) => page.evaluate(() => document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').length);
	const setCount = async (page, n) => {
		await page.click(M + '[data-usd-el="outside-count-btn"]');
		await page.click('[data-usd-el="outside-count-list"] [data-usd-el="outside-count-' + n + '"]');
		await settle(page);
	};

	await block('オススメサポ④段10 保存（roster.outsideOptions）: 触ったときだけ書く・既定（5枚・指定なし）で項目ごと消す・schemaVersion 7・①の次の書き込み／①②のリセットで消えない・書き出し／取り込み／元に戻す／複製／再読み込み・古いデータは1バイトも変わらない', async () => {
		const setOn = (page) => page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ count: 6, typeMin: { 1: 2 }, filter: { phase: ['late'] } }));
		const setOff = (page) => page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ count: 5, typeMin: {}, filter: {} }));
		await checkSaveRules('オススメサポ④段10 outsideOptions:', 'outsideOptions', setOn, setOff, { count: 6, typeMin: { 1: 2 }, filter: { phase: ['late'] } }, [
			['形の崩れた outsideOptions', { outsideOptions: { count: 9, typeMin: 'x', filter: { nope: ['y'] } } }]
		]);
	});

	await block('オススメサポ④段10 見出し行: 「種類 ▾」「絞り込み ▾」「5枚 ▾」が1行（28px）に収まる（320・375・414・1280px）／指定があるボタンは濃色で数の印', async () => {
		for (const w of [320, 375, 414, 1280]) {
			for (const [label, opts] of [['指定なし', null], ['指定あり', { count: 6, typeMin: { 1: 2, 2: 1, 6: 1 }, filter: { phase: ['late', 'mid'], effect: ['accel_up'] } }]]) {
				const sp = await openSp({ roster: opts ? Object.assign({}, FULL, { outsideOptions: opts }) : FULL, w, h: w === 1280 ? 900 : 812 });
				await open(sp.page);
				const r = await headInfo(sp.page);
				const tag = 'オススメサポ④段10 ' + w + 'px・' + label + ': ';
				const exp = opts ? ['種類4▾', '絞り込み2▾', '6枚▾'] : ['種類▾', '絞り込み▾', '5枚▾'];
				assert(JSON.stringify(r.texts) === JSON.stringify(exp) && r.pressed.join() === (opts ? 'true,true,false' : 'false,false,false'),
					tag + 'ボタンの文字は「' + exp.join('」「') + '」。指定があるボタンは濃色', { texts: r.texts, pressed: r.pressed });
				assert(r.barH === 28 && r.hs.every((h) => h === 28) && new Set(r.tops).size === 1 && r.inside && r.sw <= r.iw, tag + '見出し行は1行・28px のまま（3つとも同じ行・行の中に収まる）', r);
				if (opts) assert((await countOf(sp.page)) === 6, tag + '保存された枚数（6枚）で計算する', await countOf(sp.page));
				assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			}
		}
	});

	await block('オススメサポ④段10 「5枚 ▾」: 4枚・5枚・6枚のチップ（いまの枚数に印）・押すとすぐ閉じて自動で計算し直す・種類の指定の合計より少ない枚数は押せない／指定の無いセットは5枚から', async () => {
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		assert((await countOf(sp.page)) === 5, 'オススメサポ④段10 指定の無いセットは5枚から', await countOf(sp.page));
		await sp.page.click(M + '[data-usd-el="outside-count-btn"]');
		const chips = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-count-list"] button')).map((b) => ({ t: b.textContent, on: b.getAttribute('aria-pressed') === 'true', dis: b.disabled })));
		assert(chips.map((c) => c.t).join() === '4枚,5枚,6枚' && chips.map((c) => c.on).join() === 'false,true,false' && chips.every((c) => !c.dis), 'オススメサポ④段10 選択欄は「4枚」「5枚」「6枚」の3つで、いまの枚数に印', chips);
		await sp.page.click('[data-usd-el="outside-count-list"] [data-usd-el="outside-count-4"]');
		const closed = await sp.page.evaluate(() => { const l = document.querySelector('[data-usd-el="outside-count-list"]'); return !l || !l.offsetParent; });
		await settle(sp.page);
		const exp4 = await sp.page.evaluate(() => UmaSkillDeckCore.outside.solveSync({ count: 4, addedSkillIds: [], deadlineMs: 20000 }).cards.map((c) => c.cardId).sort().join());
		const ui4 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]')).map((c) => c.getAttribute('data-card-id')).sort().join());
		assert(closed && (await countOf(sp.page)) === 4 && ui4 === exp4 && (await headInfo(sp.page)).texts[2] === '4枚▾', 'オススメサポ④段10 押すとすぐ閉じ、ボタンなしで自動で計算し直す（4枚の結果が純粋関数と一致）。ボタンの文字は「4枚」', { closed, ui4, exp4 });
		// 種類の指定の合計（5）より少ない枚数は押せない
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ count: 6, typeMin: { 1: 2, 2: 2, 3: 1 } }));
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		await open(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-count-btn"]');
		const chips2 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-count-list"] button')).map((b) => b.disabled));
		assert(chips2.join() === 'true,false,false', 'オススメサポ④段10 種類の指定の合計（5枚）より少ない「4枚」は押せない', chips2);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段10 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * 段11: 「種類」の指定（探索の拡張・友人は最大1枚・満たせないときの表示）
	 *   合成の材料: 種類ごとのカード（友人は2キャラクター・スタミナは増分0 のカードが2枚）。白のスキルは実データの母集団から（名前は書かない）
	 * ==================================================================== */
	const master = readJson('uma-skill-deck-skills.json').skills;
	const ptReal = readJson('data/skill-pt.json');
	const stepReal = readJson('data/skill-step-up.json');
	const whiteSet = new Set(ptReal.entries.filter((e) => e.rarity === 'white').map((e) => e.skillId));
	const masterIds = new Set(master.map((s) => s.id));
	const linked = new Set(); stepReal.entries.forEach((e) => { linked.add(e.skillId); (e.prevSkillIds || []).forEach((p) => linked.add(p)); });
	const TYPE_NAMES = ['スピード', 'スタミナ', 'パワー', '根性', '賢さ', '友人・その他'];
	const SYN_ROSTER = ['syn-r1', 'syn-r2', 'syn-r3', 'syn-r4', 'syn-r5', 'syn-r6'];
	const FULLSYN = { umaId: 'uma-0001', cardIds: SYN_ROSTER, skillFilter: FILTER };
	let SYN = null;
	const needSyn = async () => {
		if (SYN) return SYN;
		const probe = await openSp({ roster: FULL });
		const pop = await probe.page.evaluate((f) => UmaSkillDeckCore.outside.populationOf({ umaId: 'uma-0001', cardIds: [], skillFilter: f }).ids, FILTER);
		await probe.ctx.close();
		const S = pop.filter((id) => masterIds.has(id) && whiteSet.has(id) && !linked.has(id)).slice(0, 34);
		const mk = (id, chara, rarity, order, skills) => ({ id, title: '二つ名' + id, charaName: chara, type: TYPE_NAMES[order - 1], typeOrder: order, rarity, isGroup: false,
			hintSkills: skills.map((s) => ({ skillId: s, name: 'x' })), dataStatus: { hint: 'done' } });
		const cands = [
			['syn-A', 'テストA', 'SSR', 1, S.slice(0, 6)], ['syn-B', 'テストB', 'SR', 1, S.slice(6, 11)], ['syn-C', 'テストC', 'SSR', 2, S.slice(11, 15)],
			['syn-D', 'テストD', 'SSR', 3, S.slice(15, 18)], ['syn-E', 'テストE', 'SR', 4, S.slice(18, 20)], ['syn-F', 'テストF', 'SR', 5, [S[20]]],
			['syn-G', 'テストG', 'SSR', 6, S.slice(21, 28)], ['syn-H', 'テストH', 'SSR', 6, S.slice(28, 34)],
			['syn-I', 'テストI', 'SR', 2, []], ['syn-J', 'テストJ', 'SR', 2, []]
		];
		const roster = SYN_ROSTER.map((id, i) => [id, 'ロスター' + i, 'SR', (i % 5) + 1, []]);
		const all = cands.concat(roster).map((c) => mk.apply(null, c));
		SYN = { S, cards: all, events: all.map((c) => ({ cardId: c.id, status: 'done', chain: [] })) };
		return SYN;
	};
	const cardsOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]')).map((c) => ({ id: c.getAttribute('data-card-id'), gain: c.querySelector('[data-usd-el="outside-card-gain"]').textContent })));
	const typeUi = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-types-list"] [data-usd-el="outside-type-row"]')).map((r) => ({
		t: Number(r.getAttribute('data-type')), name: r.querySelector('.usd-out-typename').textContent, n: Number(r.querySelector('[data-usd-el="outside-type-num"]').textContent),
		minusDis: r.querySelector('[data-usd-el="outside-type-minus"]').disabled, plusDis: r.querySelector('[data-usd-el="outside-type-plus"]').disabled })));
	const typeSum = (page) => page.evaluate(() => (document.querySelector('[data-usd-el="outside-types-sum"]') || {}).textContent || null);
	const plus = async (page, t) => { await page.click('[data-usd-el="outside-type-row"][data-type="' + t + '"] [data-usd-el="outside-type-plus"]'); await settle(page); };
	const minus = async (page, t) => { await page.click('[data-usd-el="outside-type-row"][data-type="' + t + '"] [data-usd-el="outside-type-minus"]'); await settle(page); };

	await block('オススメサポ④段11 「種類 ▾」: 6行（スピード・スタミナ・パワー・根性・賢さ・友人）に「−」「数」「＋」・右下に「指定 N／5枚」／押すたびに保存して自動で計算し直す／合計は枚数まで・友人は0〜1', async () => {
		const syn = await needSyn();
		const sp = await openSp({ roster: FULLSYN, syn });
		await open(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-types-btn"]');
		await sp.page.waitForSelector('[data-usd-el="outside-types-list"]');
		const u0 = await typeUi(sp.page);
		assert(u0.map((x) => x.name).join() === 'スピード,スタミナ,パワー,根性,賢さ,友人' && u0.every((x) => x.n === 0 && x.minusDis && !x.plusDis) && (await typeSum(sp.page)) === '指定 0／5枚',
			'オススメサポ④段11 6行の名前（種類名はカードのデータから・友人は「友人」）・どれも0（「−」は押せない）・「指定 0／5枚」', u0);
		await plus(sp.page, 1); await plus(sp.page, 1);
		const d1 = await draftRoster(sp.page);
		const c1 = await cardsOf(sp.page);
		assert((await typeUi(sp.page))[0].n === 2 && (await typeSum(sp.page)) === '指定 2／5枚' && JSON.stringify(d1.outsideOptions) === JSON.stringify({ typeMin: { 1: 2 } })
			&& c1.filter((c) => ['syn-A', 'syn-B'].includes(c.id)).length === 2 && (await headInfo(sp.page)).texts[0] === '種類2▾',
			'オススメサポ④段11 「＋」2回: 数が2・「指定 2／5枚」・セットに保存（typeMin）・ボタンの印「種類 2」・自動で計算し直して、スピードのカードが2枚入る（選択欄は開いたまま）', { d1: d1.outsideOptions, c1 });
		await plus(sp.page, 6);
		let u = await typeUi(sp.page);
		assert(u[5].n === 1 && u[5].plusDis, 'オススメサポ④段11 友人は1まで（1にすると「＋」は押せない）', u[5]);
		await plus(sp.page, 2); await plus(sp.page, 3);
		u = await typeUi(sp.page);
		assert((await typeSum(sp.page)) === '指定 5／5枚' && u.every((x) => x.plusDis), 'オススメサポ④段11 合計が枚数（5枚）に達すると、どの「＋」も押せない', u.map((x) => [x.n, x.plusDis]));
		await minus(sp.page, 3);
		u = await typeUi(sp.page);
		assert(u[2].n === 0 && u[2].minusDis && (await typeSum(sp.page)) === '指定 4／5枚' && !u[0].plusDis && u[5].plusDis, 'オススメサポ④段11 「−」で減らせる（0 になると「−」は押せない。友人は1のまま「＋」は押せない）', u.map((x) => [x.n, x.minusDis, x.plusDis]));
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段11 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ④段11 探索: 友人は種類の指定に関係なく最大1枚／不足を埋めるなら増分0 のカードも選ぶ／指定を満たせないときは結果を出さず「指定を満たす組み合わせがありません」と足りない種類（チェックリスト・フッターの数字は出さない）', async () => {
		const syn = await needSyn();
		const sp = await openSp({ roster: FULLSYN, syn });
		const solve = (o) => sp.page.evaluate((a) => { const r = UmaSkillDeckCore.outside.solveSync(Object.assign({ addedSkillIds: [], deadlineMs: 20000 }, a)); return { ok: r.ok, infeasible: !!r.infeasible, short: r.shortTypes || null, cards: r.cards.map((c) => c.cardId).sort(), score: r.score, engine: r.stats.engineScore }; }, o);
		const a = await solve({ count: 5 });
		assert(a.cards.includes('syn-G') && !a.cards.includes('syn-H') && a.cards.join() === ['syn-A', 'syn-B', 'syn-C', 'syn-D', 'syn-G'].sort().join(),
			'オススメサポ④段11 指定なしの5枚: 友人（G・H）は増分が大きくても1枚だけ（G）。残りは友人以外の上位', a.cards);
		const b = await solve({ count: 5, typeMin: { 2: 3 } });
		assert(['syn-C', 'syn-I', 'syn-J'].every((id) => b.cards.includes(id)) && b.cards.length === 5 && b.score === b.engine,
			'オススメサポ④段11 スタミナ3枚の指定: 増分0 のスタミナ（I・J）も選んで満たす。点数は探索の点数と一致', b);
		const c = await solve({ count: 5, typeMin: { 6: 1, 1: 2 } });
		assert(['syn-G', 'syn-A', 'syn-B'].every((id) => c.cards.includes(id)) && c.cards.filter((id) => id === 'syn-H').length === 0, 'オススメサポ④段11 友人1＋スピード2: 満たせる（友人はGの1枚）', c);
		const d = await solve({ count: 5, typeMin: { 2: 4 } });
		assert(d.ok && d.infeasible && JSON.stringify(d.short) === '[2]' && d.cards.length === 0, 'オススメサポ④段11 スタミナ4枚（候補は3キャラクター）: 満たせない（infeasible・足りない種類＝スタミナ）', d);
		// 画面: 満たせないときの表示
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ typeMin: { 2: 4 } }));
		await open(sp.page);
		const v = await sp.page.evaluate(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); const e = m.querySelector('[data-usd-el="outside-infeasible"]');
			return { text: e ? Array.from(e.children).map((x) => x.textContent) : null, rows: m.querySelectorAll('[data-usd-el="outside-row"]').length, cards: m.querySelectorAll('[data-usd-el="outside-card"]').length, foot: m.querySelector('[data-usd-el="outside-foot"]').hidden, head: !!m.querySelector('[data-usd-el="outside-types-btn"]') }; });
		assert(v.text && v.text[0] === '指定を満たす組み合わせがありません' && v.text[1] === '足りない種類：スタミナ' && v.rows === 0 && v.cards === 0 && v.foot && v.head,
			'オススメサポ④段11 画面: 「指定を満たす組み合わせがありません」と「足りない種類：スタミナ」。カード・チェックリスト・フッターは出ない（見出し行のボタンは残り、指定を直せる）', v);
		// 指定を直すと（自動で）結果が出る
		await sp.page.click(M + '[data-usd-el="outside-types-btn"]');
		await minus(sp.page, 2);
		const v2 = await cardsOf(sp.page);
		assert(v2.length === 5 && ['syn-C', 'syn-I', 'syn-J'].every((id) => v2.some((x) => x.id === id)) && v2.find((x) => x.id === 'syn-I').gain === '＋0種',
			'オススメサポ④段11 指定をスタミナ3に直すと、自動で計算し直して結果が出る（増分0 のカードは「＋0種」）', v2);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段11 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ④段11 計算時間（実データ・256条件＝絞り込み8×①のカードあり／なし×枚数4・5・6×種類の指定8 のうち指定の合計が枚数以下）: 打ち切りなし・友人は1枚まで・指定を満たす・点数は探索と一致', async () => {
		const sp = await openSp({ roster: FULL, w: 1280, h: 900 });
		const r = await sp.page.evaluate(({ cards6 }) => {
			const C = UmaSkillDeckCore.outside;
			const F = { distance: 'medium', style: 'senko', surface: 'turf' };
			const filters = [{}, { distance: F.distance }, { distance: F.distance, style: F.style }, F, { distance: 'short', style: 'nige', surface: 'dirt' }, { distance: 'long', style: 'oikomi', surface: 'turf' }, { style: F.style }, { surface: F.surface }];
			const mins = [{}, { 6: 1, 1: 2 }, { 2: 1, 3: 1, 4: 1, 5: 1 }, { 1: 2, 2: 1, 3: 1, 5: 1 }, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, { 1: 2, 2: 2, 3: 1, 5: 1 }, { 1: 1, 2: 1, 3: 1, 4: 2, 5: 1 }, { 1: 2, 2: 1, 3: 1, 4: 1, 5: 1 }];
			const typeOf = new Map(C.candidatesOf({}).map((c) => [c.id, c.typeOrder]));
			const out = [];
			for (const f of filters) for (const withCards of [true, false]) for (const K of [4, 5, 6]) for (const tm of mins) {
				const sum = Object.keys(tm).reduce((s, k) => s + tm[k], 0);
				if (sum > K) continue;
				const roster = withCards ? { umaId: 'uma-0001', cardIds: cards6, skillFilter: f } : { skillFilter: f };
				const t0 = performance.now();
				const res = C.solveSync({ roster, addedSkillIds: [], count: K, typeMin: tm, deadlineMs: 1500 });
				const wall = performance.now() - t0;
				const types = res.cards.map((c) => typeOf.get(c.cardId));
				const meets = Object.keys(tm).every((k) => types.filter((t) => t === Number(k)).length >= tm[k]);
				out.push({ K, sum, ms: res.stats.ms, wall, partial: res.partial, infeasible: !!res.infeasible, friends: types.filter((t) => t === 6).length, meets: res.infeasible || meets, n: res.cards.length, scoreOk: res.partial || res.infeasible || res.score === res.stats.engineScore });
			}
			return out;
		}, { cards6: CARDS6 });
		const ms = r.map((x) => x.ms).sort((a, b) => a - b);
		const med = (a) => a[Math.floor((a.length - 1) / 2)];
		const by = (K) => { const a = r.filter((x) => x.K === K).map((x) => x.ms).sort((p, q) => p - q); return K + '枚 最悪 ' + Math.round(a[a.length - 1]) + 'ms・中央値 ' + Math.round(med(a)) + 'ms（' + a.length + '通り）'; };
		console.log('     [実測] 256条件の探索時間: 最悪 ' + Math.round(ms[ms.length - 1]) + 'ms・中央値 ' + Math.round(med(ms)) + 'ms／' + [4, 5, 6].map(by).join('／') + '／満たせない ' + r.filter((x) => x.infeasible).length + '回・打ち切り ' + r.filter((x) => x.partial).length + '回');
		assert(r.length === 256 && r.every((x) => !x.partial), 'オススメサポ④段11 256条件すべてで打ち切りなし（締め切り1.5秒）', { n: r.length, partial: r.filter((x) => x.partial).length });
		assert(r.every((x) => x.friends <= 1 && x.meets && x.scoreOk && (x.infeasible || x.n === x.K)), 'オススメサポ④段11 どの結果も、友人は1枚まで・種類の指定を満たす・枚数どおり・点数は探索の点数と一致', r.filter((x) => !(x.friends <= 1 && x.meets && x.scoreOk)).slice(0, 3));
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段11 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * 段12: 「絞り込み」（条件で検索と同じ軸・照合。オススメサポの母集団にだけ効く。状態は混ざらない）
	 * ==================================================================== */
	const filterPop = (page) => page.evaluate(() => {
		const list = document.querySelector('[data-usd-el="outside-filter-list"]');
		if (!list) return null;
		const pop = list.closest('.uma-popover');
		return { axes: Array.from(list.querySelectorAll('[data-usd-el="outside-filter-axis"]')).map((r) => ({ key: r.getAttribute('data-axis'), label: r.querySelector('.usd-out-filterlabel').textContent, n: r.querySelectorAll('[data-usd-el="outside-filter-chip"]').length })),
			on: Array.from(list.querySelectorAll('[data-usd-el="outside-filter-chip"][aria-pressed="true"]')).map((b) => b.getAttribute('data-axis') + ':' + b.getAttribute('data-value')),
			inputs: pop.querySelectorAll('input').length, ids: pop.querySelector('.uma-popover-body').querySelectorAll('[id]').length, helpHidden: pop.querySelector('[data-usd-el="outside-filter-helptext"]').hidden,
			help: Array.from(pop.querySelectorAll('[data-usd-el="outside-filter-helptext"] p')).map((p) => p.textContent), clearDis: pop.querySelector('[data-usd-el="outside-filter-clear"]').disabled,
			bodyScroll: getComputedStyle(pop.querySelector('.uma-popover-body')).overflowY, popH: Math.round(pop.getBoundingClientRect().height), vh: window.innerHeight };
	});
	const chip = async (page, axis, v) => { await page.click('[data-usd-el="outside-filter-chip"][data-axis="' + axis + '"][data-value="' + v + '"]'); await settle(page); };

	await block('オススメサポ④段12 「絞り込み ▾」: 条件で検索と同じ軸（距離・脚質・バ場を除く）・選択肢／入力欄は無い／？の中に軸内の読み方／押すたびに保存して自動で計算し直す・母集団に効く（物差しと一致）／「すべて解除」', async () => {
		const sp = await openSp({ roster: FULL });
		const expAxes = await sp.page.evaluate(() => { const C = UmaSkillDeckCore; return { keys: C.outside.filterAxes(), all: C.TAG_AXES ? null : null }; });
		await open(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-filter-btn"]');
		await sp.page.waitForSelector('[data-usd-el="outside-filter-list"]');
		const p0 = await filterPop(sp.page);
		assert(p0.axes.map((a) => a.key).join() === expAxes.keys.join() && expAxes.keys.length > 0 && !expAxes.keys.some((k) => ['distance', 'style', 'surface'].includes(k)) && p0.axes.every((a) => a.n > 0),
			'オススメサポ④段12 軸は条件で検索と同じ（隠す軸を除く）から距離・脚質・バ場を除いたもの（' + p0.axes.map((a) => a.label).join('・') + '）。軸ごとに1行（軸名＋チップ）', p0.axes);
		assert(p0.inputs === 0 && p0.ids === 0 && p0.on.length === 0 && p0.clearDis && p0.helpHidden && p0.bodyScroll === 'auto' && p0.popH <= p0.vh,
			'オススメサポ④段12 入力欄（目標のレースの距離など）は無い・id を持つ要素は無い（条件で検索と重ならない）・最初は何も選ばれていない（「すべて解除」は押せない）・中だけスクロール・？の中は閉じている', p0);
		await sp.page.click('[data-usd-el="outside-filter-help"]');
		const p1 = await filterPop(sp.page);
		assert(!p1.helpHidden && p1.help.length === p0.axes.length + 1 && p0.axes.every((a, i) => p1.help[i + 1].indexOf(a.label + '：') === 0), 'オススメサポ④段12 「？」を押すと、軸ごとの読み方（条件で検索と同じ文）が出る', p1.help);
		// 母集団に効く: フェーズ「終盤」→ 効果タイプ「デバフ」（まとめた値を含む）も足す
		const base = await sp.page.evaluate(() => UmaSkillDeckCore.outside.populationOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))).ids.map((id) => [id, UmaSkillDeckCore.getSkillTags(id)]));
		await chip(sp.page, 'phase', 'late');
		const dr1 = await draftRoster(sp.page);
		const pop1 = await sp.page.evaluate(() => UmaSkillDeckCore.outside.populationOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))).ids);
		const exp1 = base.filter(([, t]) => (t.phase || []).includes('late')).map(([id]) => id);
		const rows1 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]')).map((r) => r.getAttribute('data-skill-id')));
		assert(JSON.stringify(dr1.outsideOptions) === JSON.stringify({ filter: { phase: ['late'] } }) && JSON.stringify(pop1.sort()) === JSON.stringify(exp1.sort()) && exp1.length > 0 && exp1.length < base.length
			&& rows1.length > 0 && rows1.every((id) => exp1.includes(id)) && (await headInfo(sp.page)).texts[1] === '絞り込み1▾' && (await filterPop(sp.page)).on.join() === 'phase:late',
			'オススメサポ④段12 「終盤」を押すと、セットに保存（filter）・母集団が「終盤」のタグを持つ白だけになり（' + exp1.length + '／' + base.length + '種。物差しと一致）・自動で計算し直してチェックリストもその中から・ボタンの印「絞り込み 1」', { saved: dr1.outsideOptions, pop: pop1.length, exp: exp1.length, rows: rows1.length });
		await chip(sp.page, 'effect', 'debuff');
		const pop2 = await sp.page.evaluate(() => UmaSkillDeckCore.outside.populationOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))).ids);
		const exp2 = base.filter(([, t]) => (t.phase || []).includes('late') && (t.effect || []).some((v) => v === 'debuff' || v === 'temptation_time')).map(([id]) => id);
		assert(JSON.stringify(pop2.sort()) === JSON.stringify(exp2.sort()) && (await headInfo(sp.page)).texts[1] === '絞り込み2▾', 'オススメサポ④段12 軸どうしは「かつ」。効果タイプ「デバフ」は、まとめた値（掛かり時間）も当たる（条件で検索と同じ matchesFilters）', { pop: pop2.length, exp: exp2.length });
		await sp.page.click('[data-usd-el="outside-filter-clear"]'); await settle(sp.page);
		const dr3 = await draftRoster(sp.page);
		assert(!('outsideOptions' in dr3) && (await filterPop(sp.page)).on.length === 0 && (await headInfo(sp.page)).texts[1] === '絞り込み▾', 'オススメサポ④段12 「すべて解除」で、項目ごと消え（ほかの指定が無いので）、チップの印も消える', Object.keys(dr3));
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段12 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ④段12 条件で検索の状態と混ざらない: 小窓の絞り込みは条件で検索に出ず、条件で検索の選択は小窓に出ない（両方を開き直しても）／再読み込みのあとも小窓の絞り込みは残る', async () => {
		const sp = await openSp({ roster: FULL });
		const pickerChecked = async () => {
			await sp.page.click(T + '[data-usd-act="editor-pick"]');
			await sp.page.waitForTimeout(200);
			const v = await sp.page.evaluate(() => Array.from(document.querySelectorAll('input[data-usd-el="filter-check"]:checked')).map((i) => i.getAttribute('data-axis') + ':' + i.getAttribute('data-value')));
			return v;
		};
		await open(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-filter-btn"]');
		await chip(sp.page, 'phase', 'late');
		await sp.page.keyboard.press('Escape');
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		const c1 = await pickerChecked();
		assert(c1.length === 0, 'オススメサポ④段12 小窓で「終盤」を選んでも、条件で検索には何も選ばれていない', c1);
		await sp.page.evaluate(() => document.querySelector('input[data-usd-el="filter-check"][data-axis="phase"][data-value="mid"]').click());
		await sp.page.waitForTimeout(200);
		await sp.page.click('[data-usd-act="picker-close"]');
		await open(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-filter-btn"]');
		const p = await filterPop(sp.page);
		assert(p.on.join() === 'phase:late', 'オススメサポ④段12 条件で検索で「中盤」を選んでも、小窓の絞り込みは「終盤」だけ', p.on);
		await sp.page.keyboard.press('Escape');
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		const c2 = await pickerChecked();
		await sp.page.click('[data-usd-act="picker-close"]');
		assert(c2.join() === 'phase:mid', 'オススメサポ④段12 開き直すと、条件で検索は自分の選択（「中盤」）だけ（小窓の「終盤」は混ざらない）', c2);
		const dup = await sp.page.evaluate(() => ['usd-panel-phase', 'usd-tab-phase'].map((id) => document.querySelectorAll('#' + id).length));
		assert(dup.every((n) => n <= 1), 'オススメサポ④段12 条件で検索の id（usd-panel-・usd-tab-）は重ならない', dup);
		// 再読み込み
		const pg = await sp.ctx.newPage();
		await pg.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		await pg.goto(base + '/special.html', { waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await pg.isVisible('#ui-notice')) await pg.click('[data-act="notice-ok"]');
		await pg.waitForSelector(T + OPEN, { timeout: 10000 });
		await pg.waitForTimeout(300);
		await open(pg);
		await pg.click(M + '[data-usd-el="outside-filter-btn"]');
		assert((await filterPop(pg)).on.join() === 'phase:late' && (await headInfo(pg)).texts[1] === '絞り込み1▾', 'オススメサポ④段12 再読み込みのあとも、小窓の絞り込み（「終盤」）は残っている', (await filterPop(pg)).on);
		await pg.close();
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ④段12 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
