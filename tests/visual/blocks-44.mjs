// オススメサポの入口・除外4つ・距離ごとの個別除外（段B。2026-10-21・C-185）の検査。run-smoke.mjs の末尾から register44() で呼ばれる
// （塊の見出しはすべて「C-185」で始まる。`npm run test:visual -- --only=C-185` で回せる）。
//
// B1 入口はいつも開く（欠けた編成のまま計算）・見出しの右に注記「本育成編成が完了していません」（狭い幅は題名の下）
// B2 除外の欄は4つの押しボタン（低効果・デバフ・視野・持久力回復）だけ。既定は4つとも ON。触ったセットの4つ以外は読まない（消さない）
// B3 レースを選んでいないときだけ、レース条件で決まる緑スキルをオススメサポの母集団から外す
// B4 距離ごとの除外（userData の recommendExcluded）。区分の決め方・保存・効かせ方。説明の小窓の切り替えと「個別に除外」は段F1 で廃止（blocks-49 が新しい動きを見る）
// スキル名・id・件数は検査の側に書かない（恒久ルール1。データから独立に数える。Step 0 の実測〔母集団の件数〕だけは照合として数字で持つ）。

export async function register44(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const RACES = readJson('data/upcoming-races.json').races;
	const COURSE = readJson('data/course-conditions.json');
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const EXT = readJson('data/extended-skills.json').entries;
	const SEARCHABLE = new Set(readJson('data/searchable-extended-ids.json').entries.map((e) => e.skillId));
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e.rarity]));
	const POOL = MASTER.map((s) => ({ id: String(s.id), tags: s.tags })).concat(EXT.filter((e) => e.tags && SEARCHABLE.has(e.id)).map((e) => ({ id: e.id, tags: e.tags })));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const REAL = { umaId: 'uma-0001', cardIds: CARDS6 };
	const FULL = Object.assign({}, REAL, { skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } });
	const ROSTER_A = { umaId: 'uma-0179', cardIds: ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'], skillFilter: { surface: 'turf' } };
	const T = '#deck-template-panel ';
	const OM = '[data-usd-el="outside-modal"] ';
	const SM = '[data-usd-el="style-modal"] ';
	const sleep = (page, ms) => page.waitForTimeout(ms);
	const DEFAULT_EX = { effect: ['debuff', 'stamina', 'vision'], extra: ['lowEffect'] };
	const LABELS = { short: '短距離', mile: 'マイル', medium: '中距離', long: '長距離', none: '距離指定なし' };

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, o.userData || EMPTY);
		await sp.page.evaluate(({ roster, tab, theme }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
			try { localStorage.setItem('uma-tools-theme', theme); } catch (e) {}
		}, { roster: o.roster === undefined ? null : o.roster, tab: o.tab === undefined ? 1 : o.tab, theme: o.theme || 'light' });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sleep(sp.page, 300);
		return sp;
	};
	const toastText = (page) => page.evaluate(() => document.getElementById('toast-message').textContent);
	const rosterOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'));
	const userData = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData') || 'null'));
	const waitOutside = (page) => page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
	const openOutside = async (page) => { await page.click(T + '[data-usd-el="outside-open"]'); await waitOutside(page); await sleep(page, 200); };
	const openExclude = async (page) => {
		await page.click(OM + '[data-usd-el="outside-exclude-btn"]');
		await page.waitForSelector('[data-usd-el="outside-exclude-chip"]');
		await sleep(page, 200);
	};
	const chipState = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-exclude-chip"]')).map((b) => [b.textContent, b.getAttribute('data-axis') + ':' + b.getAttribute('data-value'), b.getAttribute('aria-pressed')]));
	const clickChip = async (page, text) => {
		await page.click('[data-usd-el="outside-exclude-chip"]:text-is("' + text + '")');
		await waitOutside(page);
		await sleep(page, 200);
	};
	const pickRace = async (page, id) => {
		await page.click('#deck-set-bar [data-usd-act="set-race"]');
		await page.waitForSelector('[data-usd-el="race-list"]');
		await page.click('[data-usd-el="race-opt"][data-race-id="' + id + '"] input');
		await sleep(page, 400);
	};

	/* ====================================================================
	 * B1 入口
	 * ==================================================================== */
	await block('C-185 B1 入口: 本育成編成が欠けていても開く（知らせ「先に①本育成編成を設定してください」は出ない）／注記「本育成編成が完了していません」／そろっていれば注記なし／欠けた編成のまま計算する', async () => {
		const cases = [
			['編成なし（育成ウマ娘もカードも無い）', null, true],
			['育成ウマ娘だけ', { umaId: 'uma-0001' }, true],
			['カードが5枚（6枚未満）', { umaId: 'uma-0001', cardIds: CARDS6.slice(0, 5), skillFilter: FULL.skillFilter }, true],
			['6枚そろい・距離／脚質／バ場が指定なし', REAL, true],
			['6枚そろい・脚質が指定なし', Object.assign({}, REAL, { skillFilter: { distance: 'medium', surface: 'turf' } }), true],
			['育成ウマ娘なし・6枚＋距離・脚質・バ場', { cardIds: CARDS6, skillFilter: FULL.skillFilter }, true],
			['そろっている（育成ウマ娘・6枚・距離・脚質・バ場）', FULL, false],
		];
		for (const [label, roster, incomplete] of cases) {
			const sp = await openSp({ roster });
			await sp.page.click(T + '[data-usd-el="outside-open"]');
			await waitOutside(sp.page).catch(() => {});
			const r = await sp.page.evaluate(() => {
				const m = document.querySelector('[data-usd-el="outside-modal"]');
				const n = m && m.querySelector('[data-usd-el="outside-incomplete"]');
				return { open: !!m && !m.hidden, noteHidden: n ? n.hidden : null, noteText: n ? n.textContent : null, rows: m ? m.querySelectorAll('[data-usd-el="outside-row"]').length : 0, foot: m ? !m.querySelector('[data-usd-el="outside-foot"]').hidden : false,
					toast: document.getElementById('toast-message').textContent, result: m ? !!m.querySelector('[data-usd-el="outside-cards"] [data-usd-el="outside-card"]') : false };
			});
			assert(r.open && !/先に①本育成編成を設定してください/.test(r.toast), 'C-185 B1 ' + label + ': 小窓が開く（「先に①本育成編成を設定してください」は出ない）', r);
			assert(incomplete ? (r.noteHidden === false && r.noteText === '本育成編成が完了していません') : r.noteHidden === true, 'C-185 B1 ' + label + ': 注記は' + (incomplete ? '「本育成編成が完了していません」' : '出ない'), r);
			assert(r.rows > 0 && r.foot && r.result, 'C-185 B1 ' + label + ': 欠けた編成のまま計算して、カードとスキルが出る（' + r.rows + '行）', r);
			assert(jsErrors(sp.errors).length === 0, 'C-185 B1 ' + label + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('C-185 B1 注記の位置: PC（1280px）は題名の右・狭い幅（390・360px）は題名の下／小窓の見出しは崩れない', async () => {
		for (const w of [1280, 390, 360]) {
			const sp = await openSp({ w, h: w === 1280 ? 900 : 844, roster: null });
			await openOutside(sp.page);
			const g = await sp.page.evaluate(() => {
				const m = document.querySelector('[data-usd-el="outside-modal"]');
				const t = m.querySelector('[data-usd-el="outside-title"]').parentElement.getBoundingClientRect();
				const n = m.querySelector('[data-usd-el="outside-incomplete"]').getBoundingClientRect();
				const close = m.querySelector('[data-usd-el="outside-close"]').getBoundingClientRect();
				const panel = m.querySelector('.usd-out-panel').getBoundingClientRect();
				return { tTop: t.top, tBottom: t.bottom, tRight: t.right, nTop: n.top, nLeft: n.left, nRight: n.right, nBottom: n.bottom, closeLeft: close.left, panelRight: panel.right, panelLeft: panel.left, sw: document.documentElement.scrollWidth, vw: window.innerWidth };
			});
			const tag = 'C-185 B1 ' + w + 'px: ';
			if (w === 1280) assert(g.nTop < g.tBottom && g.nLeft >= g.tRight - 1, tag + '注記は題名の右（同じ行）', g);
			else assert(g.nTop >= g.tBottom - 1, tag + '注記は題名の下', g);
			assert(g.nRight <= g.closeLeft + 1 && g.nLeft >= g.panelLeft && g.sw <= g.vw, tag + '注記は閉じるボタンに重ならず、横にはみ出さない', g);
			if (w === 390 || w === 1280) await sp.page.screenshot({ path: path.join(REPO_ROOT, 'output', 'scratch', 'shots-b', 'B-incomplete-' + w + '.png') });
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * B2 除外の欄
	 * ==================================================================== */
	await block('C-185 B2 除外の欄は4つの押しボタン（低効果・デバフ・視野・持久力回復）だけ／既定は4つとも ON・見出し行の文言／押すと保存して計算し直す／初期値に戻すと項目ごと消える', async () => {
		const sp = await openSp({ roster: FULL });
		const before = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		await openOutside(sp.page);
		assert((await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'))) === before, 'C-185 B2 開いただけでは保存データは変わらない（既定は保存しない）', true);
		assert(JSON.stringify(await sp.page.evaluate(() => UmaSkillDeckCore.outside.EXCLUDE_DEFAULT)) === JSON.stringify(DEFAULT_EX), 'C-185 B2 既定の値は 低効果・デバフ・視野・持久力回復（緑スキルを含まない）', DEFAULT_EX);
		const label = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-exclude-label"]').textContent);
		assert(label === '除外：低効果・デバフ・視野・持久力回復', 'C-185 B2 見出し行のボタンの文言', label);
		await openExclude(sp.page);
		const st = await chipState(sp.page);
		assert(st.map((x) => x[0]).join() === '低効果,デバフ,視野,持久力回復' && st.every((x) => x[2] === 'true'), 'C-185 B2 押しボタンは4つだけ・この並び・既定はすべて ON', st);
		const others = await sp.page.evaluate(() => ({ axisRows: document.querySelectorAll('[data-usd-el="outside-exclude-axis"]').length, clear: !!document.querySelector('[data-usd-el="outside-exclude-clear"]'), help: !!document.querySelector('[data-usd-el="outside-exclude-help"]'),
			text: document.querySelector('.usd-info-pop').textContent }));
		assert(others.axisRows === 0 && !others.clear && !others.help && !/緑スキル|フェーズ|全般/.test(others.text), 'C-185 B2 緑スキル・フェーズ・軸の選択肢・「すべて解除」は無い', others);
		const n0 = await sp.page.evaluate(() => UmaSkillDeckCore.outside.populationOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))).ids.length);
		await clickChip(sp.page, 'デバフ');
		let r = await rosterOf(sp.page);
		assert(JSON.stringify(r.outsideOptions.exclude) === JSON.stringify({ effect: ['stamina', 'vision'], extra: ['lowEffect'] }), 'C-185 B2 「デバフ」を外すと保存される（残りの3つ）', r.outsideOptions);
		const n1 = await sp.page.evaluate(() => UmaSkillDeckCore.outside.populationOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))).ids.length);
		assert(n1 > n0, 'C-185 B2 除外を1つ外すと母集団が増える（' + n0 + ' → ' + n1 + '）', { n0, n1 });
		assert((await chipState(sp.page)).find((x) => x[0] === 'デバフ')[2] === 'false', 'C-185 B2 押したボタンは OFF の見た目', await chipState(sp.page));
		await clickChip(sp.page, 'デバフ');
		r = await rosterOf(sp.page);
		assert(r.outsideOptions === undefined && (await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'))).length > 0, 'C-185 B2 初期値に戻すと outsideOptions の項目ごと消える（既定と同じなら保存しない）', r.outsideOptions);
		// 4つとも外す → {} が保存され、何も除外しない
		for (const t of ['低効果', 'デバフ', '視野', '持久力回復']) await clickChip(sp.page, t);
		r = await rosterOf(sp.page);
		const all = await sp.page.evaluate(() => UmaSkillDeckCore.outside.getOptions().exclude);
		assert(JSON.stringify(r.outsideOptions.exclude) === '{}' && JSON.stringify(all) === '{}', 'C-185 B2 4つとも外すと {} が保存され、何も除外しない', { saved: r.outsideOptions, read: all });
		assert(jsErrors(sp.errors).length === 0, 'C-185 B2 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C-185 B2 保存の読み方: 保存値の無いセットは新しい既定／触ったセットの保存値のまま（4つ以外の緑スキル・フェーズは読まない）／4つを触っても4つ以外は書き換えず消さない（ルール28）', async () => {
		const oldDefault = { effect: ['debuff', 'stamina', 'vision'], extra: ['passive', 'lowEffect'] };
		const withOptions = (exclude) => Object.assign({}, FULL, { outsideOptions: { exclude } });
		// (1) 以前の既定（緑スキルを含む5つ）を保存してあるセット → 緑スキルは読まず、新しい既定と同じ
		let sp = await openSp({ roster: withOptions(oldDefault) });
		let read = await sp.page.evaluate(() => UmaSkillDeckCore.outside.getOptions().exclude);
		assert(JSON.stringify(read) === JSON.stringify(DEFAULT_EX), 'C-185 B2 以前の既定（緑スキル・低効果ほか）の保存値は、緑スキルを読まずに新しい既定と同じ', read);
		const raw0 = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		await openOutside(sp.page);
		assert((await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'))) === raw0, 'C-185 B2 開いても保存データは1バイトも変わらない', true);
		await openExclude(sp.page);
		assert((await chipState(sp.page)).every((x) => x[2] === 'true'), 'C-185 B2 画面は4つとも ON', await chipState(sp.page));
		// (2) 4つの1つを触ると、4つ以外（緑スキル）は保存値のまま残る
		await clickChip(sp.page, '視野');
		let r = await rosterOf(sp.page);
		assert(JSON.stringify(r.outsideOptions.exclude.extra) === JSON.stringify(['passive', 'lowEffect']) && JSON.stringify(r.outsideOptions.exclude.effect) === JSON.stringify(['debuff', 'stamina']), 'C-185 B2 「視野」を外しても、保存してある緑スキル（passive）は残る', r.outsideOptions);
		await clickChip(sp.page, '視野');
		r = await rosterOf(sp.page);
		assert(JSON.stringify(r.outsideOptions.exclude) === JSON.stringify({ effect: ['debuff', 'stamina', 'vision'], extra: ['passive', 'lowEffect'] }), 'C-185 B2 戻しても、緑スキルは消えない（4つが初期値と同じでも、ほかの保存値があれば項目は残す）', r.outsideOptions);
		await sp.ctx.close();
		// (3) フェーズだけを保存してあるセット: 4つは読まない（＝すべて OFF）。フェーズは読まないが消さない
		sp = await openSp({ roster: withOptions({ phase: ['early'], effect: ['debuff'] }) });
		read = await sp.page.evaluate(() => UmaSkillDeckCore.outside.getOptions().exclude);
		assert(JSON.stringify(read) === JSON.stringify({ effect: ['debuff'] }), 'C-185 B2 フェーズの保存値は読まない（効かない）。デバフだけが除外', read);
		await openOutside(sp.page);
		await openExclude(sp.page);
		await clickChip(sp.page, '持久力回復');
		r = await rosterOf(sp.page);
		assert(JSON.stringify(r.outsideOptions.exclude.phase) === JSON.stringify(['early']) && JSON.stringify(r.outsideOptions.exclude.effect) === JSON.stringify(['debuff', 'stamina']), 'C-185 B2 4つを触っても、フェーズの保存値は書き換えず・消さない', r.outsideOptions);
		for (const t of ['デバフ', '持久力回復']) await clickChip(sp.page, t);
		r = await rosterOf(sp.page);
		assert(JSON.stringify(r.outsideOptions.exclude) === JSON.stringify({ phase: ['early'] }), 'C-185 B2 4つを全部外しても、フェーズの保存値は残る', r.outsideOptions);
		await sp.ctx.close();
		// (4) 保存値が無いセット（除外を一度も触っていない）は、そのまま新しい既定
		sp = await openSp({ roster: FULL });
		read = await sp.page.evaluate(() => UmaSkillDeckCore.outside.getOptions().exclude);
		assert(JSON.stringify(read) === JSON.stringify(DEFAULT_EX), 'C-185 B2 保存値の無いセットは新しい既定（4つとも ON）', read);
		await sp.ctx.close();
	});

	await block('C-185 B2 母集団の件数: Step 0 の実測と一致（P1 編成A・逃げ・長距離・芝＋race-0003 ＝99／P2 実編成・先行・中距離・芝＋race-0001 ＝132）／4つの除外は、除外なしより減る分がそれぞれ独立の数え方と一致', async () => {
		const sp = await openSp({ roster: FULL });
		await openOutside(sp.page);   // 同じものとして扱うスキルの組と効果量のデータを読ませる（Step 0 の実測と同じ条件）
		const res = await sp.page.evaluate(async ({ A, FULL, races, pairs }) => {
			await UmaSkillDeckCore.loadSkillEffectLevels();
			const C = UmaSkillDeckCore.outside;
			const race = (id) => races.find((r) => r.id === id);
			// C-223（2026-10-28）: ①での合計のヒントLv が2以下の白（とその組の相手）は母集団に残るようになった。restored はそのぶん（変更前の件数 ＝ n − restored）
			const p = (roster, opts) => { const x = C.populationOf(roster, opts); const d = UmaSkillDeckCore.getRosterPtDetail(roster); const low = d ? d.lowHintIds : []; const back = new Set(low); pairs.forEach((pr) => pr.forEach((id, i) => { if (low.includes(id)) back.add(pr[1 - i]); }));
				const restored = x.ids.filter((id) => back.has(id)).length; const restoredNoRace = (x.noRaceExcludedIds || []).filter((id) => back.has(id)).length;
				return { n: x.ids.length, noRace: (x.noRaceExcludedIds || []).length, opt: x.optionExcludedIds.length, race: x.raceExcludedIds.length, user: (x.recommendExcludedIds || []).length, restored: restored + restoredNoRace, low: low.length }; };
			const P1 = Object.assign({}, A, { skillFilter: { surface: 'turf', style: 'nige', distance: 'long' }, race: race('race-0003') });
			const P2 = Object.assign({}, FULL, { race: race('race-0001') });
			const P3 = Object.assign({}, A, { skillFilter: { surface: 'turf', style: 'nige', distance: 'medium' } });
			return { P1: p(P1), P2: p(P2), P3: p(P3), P3none: p(P3, { exclude: {} }), P1none: p(P1, { exclude: {} }) };
		}, { A: ROSTER_A, FULL, races: RACES, pairs: readJson('data/recommended-skills.json').equivalentPairs.map((x) => x.skillIds) });
		console.log('     [実測] 母集団: P1 ' + JSON.stringify(res.P1) + ' / P2 ' + JSON.stringify(res.P2) + ' / P3 ' + JSON.stringify(res.P3));
		assert(res.P1.n - res.P1.restored === 105 && res.P2.n - res.P2.restored === 135 && res.P1.restored > 0, 'C-185 B2→C-223 P1・P2 の母集団は（①の Lv2 以下の白と組の相手で戻った分を除くと） Step 0 の実測（99・132）に、先行データ（2026-10-25a）で増えた分（逃げ・長距離＋5／先行・中距離＋2）と 2026-10-26 の ex-1693（距離・脚質の限定なし＋1）を足した値（105・135）と一致（レースを選んでいるので B3 は効かない）', { P1: res.P1, P2: res.P2 });
		assert(res.P1.noRace === 0 && res.P2.noRace === 0, 'C-185 B3 レースを選んでいれば、レース条件の緑スキルは外さない', { P1: res.P1, P2: res.P2 });
		assert(res.P3.n + res.P3.noRace - res.P3.restored === 150, 'C-185 B3→C-223 P3（レースなし）は、①の Lv2 以下の白と組の相手で戻った分を除き、緑スキルを外した分（' + res.P3.noRace + '種）を戻すと Step 0 の実測（146）に先行データ（2026-10-25a）で増えた3種と 2026-10-26 の ex-1693 を足した値（150）と一致', res.P3);
		assert(res.P1none.n > res.P1.n && res.P3none.n > res.P3.n, 'C-185 B2 除外なしの母集団は、4つを除外したときより多い', { P1: [res.P1none.n, res.P1.n], P3: [res.P3none.n, res.P3.n] });
		await sp.ctx.close();
	});

	/* ====================================================================
	 * B3 レースを選んでいないときだけ、レース条件の緑スキルを外す
	 * ==================================================================== */
	await block('C-185 B3 レースが無いとき、レース条件で決まる緑スキル（レース場・回り・季節・小回り／直線コース）を母集団から外す（独立に数えた顔ぶれと一致）／良バ場・天気・枠・非根幹距離などは外さない／②で追加済みは数える／レースを選べば外さない', async () => {
		const sp = await openSp({ roster: null });
		const white = (id) => !PT.has(id) || PT.get(id) === 'white';
		const shapeKeys = COURSE.conditions.map((c) => c.key);
		const RACE_ENV = ['right_turn', 'left_turn', 'season_spring', 'season_summer', 'season_autumn', 'season_winter'];
		const expected = POOL.filter((s) => white(s.id) && (((s.tags.trackVenue || []).length > 0) || (s.tags.environment || []).some((x) => RACE_ENV.includes(x) || shapeKeys.includes(x)))).map((s) => s.id);
		const r = await sp.page.evaluate(async (races) => {
			await UmaSkillDeckCore.loadSkillEffectLevels();
			const C = UmaSkillDeckCore.outside;
			const none = C.populationOf({}, { exclude: {} });
			const withRace = C.populationOf({ race: races[0] }, { exclude: {} });
			const added = C.populationOf({}, { exclude: {}, addedSkillIds: none.noRaceExcludedIds.slice(0, 2) });
			// 外さないもの: 良バ場・天気・枠などの環境のタグを持つスキルが、母集団に残っている
			const keep = none.ids.filter((id) => { const t = (UmaSkillDeckCore.findSkill(id).tags.environment || []); return t.length > 0; });
			return { noRace: none.noRaceExcludedIds, ids: none.ids, raceNoRace: withRace.noRaceExcludedIds, addedIn: added.noRaceExcludedIds.length, addedPicked: none.noRaceExcludedIds.slice(0, 2).filter((id) => added.ids.includes(id)).length, keepEnv: keep.length };
		}, RACES);
		console.log('     [実測] レースが無いときに母集団から外れる緑スキル: ' + r.noRace.length + '種（除外なし・①の絞り込みなしの全体 ' + (r.ids.length + r.noRace.length) + '種のうち）');
		assert(r.noRace.slice().sort().join() === expected.slice().sort().join() && expected.length > 20, 'C-185 B3 外れるのは、独立に数えた「レース条件で決まる緑スキル」' + expected.length + '種と同じ', { n: r.noRace.length, exp: expected.length });
		assert(r.noRace.every((id) => !r.ids.includes(id)) && r.keepEnv > 0, 'C-185 B3 外したものは母集団に残らない。良バ場・天気・枠などの環境のタグのスキルは外さない（残り ' + r.keepEnv + '種）', { keepEnv: r.keepEnv });
		assert(r.raceNoRace.length === 0, 'C-185 B3 レースを選べば、この規則では外さない', r.raceNoRace.length);
		assert(r.addedIn === r.noRace.length - 2 && r.addedPicked === 2, 'C-185 B3 ②で追加済みのスキルは、外さずに数える', { addedIn: r.addedIn, picked: r.addedPicked });
		await sp.ctx.close();
	});

	/* ====================================================================
	 * B4 距離ごとの個別除外
	 * ==================================================================== */
	await block('C-185 B4 区分の決め方: 距離の4つと「距離指定なし」／①の距離（レースで固定した距離を含む）／決まらなければ none／知らない値は none', async () => {
		const sp = await openSp({ roster: null });
		const r = await sp.page.evaluate((races) => {
			const E = UmaSkillDeckCore.outside.recommendExcluded;
			const key = (roster) => E.keyOf(roster);
			const byId = (id) => races.find((x) => x.id === id);
			return { keys: E.keys(), none: key({}), long: key({ skillFilter: { distance: 'long' } }), race3: key({ race: byId('race-0003') }), raceMile: key({ race: byId('race-0006') }),
				raceOverride: key({ skillFilter: { distance: 'short' }, race: byId('race-0003') }), raceNoDist: key({ skillFilter: { distance: 'mile' }, race: byId('race-0005') }), bad: key({ skillFilter: { distance: 'xxl' } }), labels: E.keys().map((k) => E.label(k)) };
		}, RACES);
		assert(r.keys.join() === 'short,mile,medium,long,none' && r.labels.join() === '短距離,マイル,中距離,長距離,距離指定なし', 'C-185 B4 区分は 短距離・マイル・中距離・長距離・距離指定なし（none）', r);
		assert(r.none === 'none' && r.long === 'long' && r.race3 === 'long' && r.raceMile === 'mile', 'C-185 B4 ①の距離がそのまま区分・レースの距離の区分・未指定は none', r);
		assert(r.raceOverride === 'long' && r.raceNoDist === 'medium' && r.bad === 'none', 'C-185 B4 レースで固定した距離が①の選択より優先（resolvedFilterOf）・知らない値は none', r);
		await sp.ctx.close();
	});

	await block('C-185 B4 保存（userData.recommendExcluded）: 触ったときだけ書く／空の区分は消す・全部空なら項目ごと消す／schemaVersion は 7／知らない区分・引けない id・重複は読まないが書き換えない／元に戻すで項目ごと戻る（1回ずつ積む）', async () => {
		const sp = await openSp({ roster: FULL });
		const ids = await sp.page.evaluate(() => UmaSkillDeckCore.outside.populationOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))).ids.slice(0, 4));
		assert((await userData(sp.page)).recommendExcluded === undefined, 'C-185 B4 触っていないデータに recommendExcluded は無い', Object.keys(await userData(sp.page)));
		const u0 = await sp.page.evaluate(() => UmaSkillDeckCore.undoCount());
		const set = (k, id, ex) => sp.page.evaluate(({ k, id, ex }) => UmaSkillDeckCore.outside.recommendExcluded.set(k, id, ex), { k, id, ex });
		assert(await set('medium', ids[0], true) === true, 'C-185 B4 外す', true);
		let d = await userData(sp.page);
		assert(JSON.stringify(d.recommendExcluded) === JSON.stringify({ medium: [ids[0]] }) && d.schemaVersion === 7, 'C-185 B4 最上位に1項目だけ書く（schemaVersion は 7 のまま）', d.recommendExcluded);
		assert(await set('medium', ids[0], true) === false && await sp.page.evaluate(() => UmaSkillDeckCore.undoCount()) === u0 + 1, 'C-185 B4 すでに外しているものをもう一度外しても何も起きない・元に戻すに積まない', true);
		await set('none', ids[1], true);
		await set('medium', ids[2], true);
		d = await userData(sp.page);
		assert(JSON.stringify(d.recommendExcluded) === JSON.stringify({ medium: [ids[0], ids[2]], none: [ids[1]] }), 'C-185 B4 区分ごとに並ぶ（外した順）', d.recommendExcluded);
		assert(await sp.page.evaluate(() => UmaSkillDeckCore.undoCount()) === u0 + 3, 'C-185 B4 外すごとに元に戻すに1回ずつ積まれる', u0);
		// 元に戻す: 1つずつ戻る
		await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		d = await userData(sp.page);
		assert(JSON.stringify(d.recommendExcluded) === JSON.stringify({ medium: [ids[0]], none: [ids[1]] }), 'C-185 B4 「元に戻す」で直前の1回だけが戻る（userData の項目がそのまま戻る）', d.recommendExcluded);
		// 戻す: 空の区分が消え、全部空なら項目ごと消える
		await set('none', ids[1], false);
		d = await userData(sp.page);
		assert(JSON.stringify(d.recommendExcluded) === JSON.stringify({ medium: [ids[0]] }), 'C-185 B4 戻すと空の区分は消える', d.recommendExcluded);
		await set('medium', ids[0], false);
		d = await userData(sp.page);
		assert(!('recommendExcluded' in d), 'C-185 B4 全部空なら項目ごと消える', Object.keys(d));
		// 元に戻すで、項目が無かった状態へ戻る／戻した状態へも戻る
		await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		assert(JSON.stringify((await userData(sp.page)).recommendExcluded) === JSON.stringify({ medium: [ids[0]] }), 'C-185 B4 「戻す」を元に戻すと、外した状態に戻る', (await userData(sp.page)).recommendExcluded);
		await sp.ctx.close();
		// 知らない値: 読まない・書き換えない
		const seed = Object.assign({}, EMPTY, { recommendExcluded: { long: ['ex-9999', '1', '1', 'zzz'], future: ['2'], none: ['3'] } });
		const sp2 = await openSp({ roster: FULL, userData: seed });
		const read = await sp2.page.evaluate(() => { const E = UmaSkillDeckCore.outside.recommendExcluded; return { long: E.idsOf('long'), future: E.idsOf('future'), none: E.idsOf('none') }; });
		assert(JSON.stringify(read) === JSON.stringify({ long: ['1'], future: [], none: ['3'] }), 'C-185 B4 引けない id・重複・知らない区分は読まない（使わない）', read);
		assert(JSON.stringify((await userData(sp2.page)).recommendExcluded) === JSON.stringify(seed.recommendExcluded), 'C-185 B4 開いても保存データは変わらない', true);
		await sp2.page.evaluate(() => UmaSkillDeckCore.outside.recommendExcluded.set('long', '4', true));
		assert(JSON.stringify((await userData(sp2.page)).recommendExcluded) === JSON.stringify({ long: ['ex-9999', '1', '1', 'zzz', '4'], future: ['2'], none: ['3'] }), 'C-185 B4 外すとその id だけを足す（知らない値は書き換えない）', (await userData(sp2.page)).recommendExcluded);
		await sp2.page.evaluate(() => UmaSkillDeckCore.outside.recommendExcluded.set('long', '1', false));
		assert(JSON.stringify((await userData(sp2.page)).recommendExcluded) === JSON.stringify({ long: ['ex-9999', 'zzz', '4'], future: ['2'], none: ['3'] }), 'C-185 B4 戻すと、その id だけを消す（重複もまとめて）。知らない値は残す', (await userData(sp2.page)).recommendExcluded);
		await sp2.ctx.close();
	});

	await block('C-185 B4 書き出し→取り込み→「元に戻す」で recommendExcluded が変わらない（ルール28）／Deck 単体ページでも保たれる', async () => {
		const seed = Object.assign({}, EMPTY, { recommendExcluded: { long: ['1'], none: ['2'], future: ['ex-9999'] } });
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, seed);
		await dk.page.click('#tab-btn-data');
		await dk.page.waitForTimeout(300);
		const state = () => dk.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const before = await state();
		const exported = await dk.page.evaluate(() => { exportData(); return document.getElementById('export-textarea').value; });
		assert(JSON.stringify(JSON.parse(exported).recommendExcluded) === JSON.stringify(seed.recommendExcluded), 'C-185 B4 書き出しに項目がそのまま入る（知らない区分・引けない id も）', exported.length);
		const other = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = JSON.stringify(v); const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, other);
		assert(!('recommendExcluded' in (await dk.page.evaluate(() => UmaSkillDeckCore.getUserData()))), 'C-185 B4 項目の無いデータを取り込むと、項目も無い（補わない）', true);
		const un = await dk.page.evaluate(() => ({ ok: performUndo() }));
		await dk.page.waitForTimeout(300);
		assert(un.ok && (await state()) === before, 'C-185 B4 取り込み→「元に戻す」で、メモリと保存先の両方が取り込み前と一致する（移行で書き換わらない）', un);
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = v; const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, exported);
		assert(JSON.stringify(await dk.page.evaluate(() => UmaSkillDeckCore.getUserData().recommendExcluded)) === JSON.stringify(seed.recommendExcluded) && (await dk.page.evaluate(() => UmaSkillDeckCore.getUserData().schemaVersion)) === 7, 'C-185 B4 書き出したファイルを取り込み直しても、項目が保たれる（schemaVersion は 7）', true);
		assert(dk.errors.length === 0, 'C-185 B4 Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
	});

	await block('C-185 B4 効かせ方: 除外したスキルは、オススメサポの母集団から出ない（②で追加済みは数える）／カードの点数にも入らない／区分が違えば効かない', async () => {
		const sp = await openSp({ roster: FULL });
		const r = await sp.page.evaluate(() => {
			const C = UmaSkillDeckCore.outside;
			const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
			const p0 = C.populationOf(roster);
			const id = p0.ids[0];
			C.recommendExcluded.set('medium', id, true);
			const p1 = C.populationOf(roster);
			const p1added = C.populationOf(roster, { addedSkillIds: [id] });
			const other = C.populationOf(Object.assign({}, roster, { skillFilter: Object.assign({}, roster.skillFilter, { distance: 'long' }) }));
			const s1 = C.solveSync({ roster, addedSkillIds: [], deadlineMs: 20000 });
			return { id, in0: p0.ids.includes(id), in1: p1.ids.includes(id), user: p1.recommendExcludedIds, addedIn: p1added.ids.includes(id), otherKey: other.distKey, otherUser: other.recommendExcludedIds, n0: p0.ids.length, n1: p1.ids.length,
				scored: s1.skills.some((x) => x.skillId === id), key: p1.distKey };
		});
		assert(r.in0 && !r.in1 && r.user.join() === r.id && r.n1 === r.n0 - 1 && r.key === 'medium', 'C-185 B4 外したスキルは母集団から出ない（' + r.n0 + ' → ' + r.n1 + '）', r);
		assert(r.addedIn && !r.scored, 'C-185 B4 ②で追加済みなら数える／提案の点数・チェックリストには入らない', r);
		assert(r.otherKey === 'long' && r.otherUser.length === 0, 'C-185 B4 区分が違えば効かない（長距離の①では、中距離の除外は読まない）', r);
		await sp.ctx.close();
	});

	await block('C-185 B4 画面→段F1: 説明の小窓の「（区分）のオススメから外す／に戻す」の切り替えと、除外の欄の「個別に除外 N種（区分）」は廃止した（オススメサポ・脚質オススメ・①の表のどこから開いても出ない）／スキル名を押すと説明は出る', async () => {
		const sp = await openSp({ roster: FULL });
		const look = (page) => page.evaluate(() => ({ toggle: !!document.querySelector('[data-usd-el="info-recommend-toggle"]'), action: !!document.querySelector('.usd-info-action'), pop: !!document.querySelector('.usd-info-pop'),
			text: (document.querySelector('.usd-info-pop') || { textContent: '' }).textContent }));
		// ①の表の名前から開く説明
		await sp.page.click('#step-tab-0');
		await sleep(sp.page, 500);
		await sp.page.click('#deck-roster-panel .usd-roster-skillname--btn');
		await sleep(sp.page, 300);
		let g = await look(sp.page);
		assert(g.pop && !g.toggle && !g.action, 'C-185 B4 ①の表の名前から開いた説明に、切り替えは出ない', g);
		await sp.page.keyboard.press('Escape');
		await sp.page.click('#step-tab-1');
		await sleep(sp.page, 400);
		// オススメサポの小窓から開く説明
		await openOutside(sp.page);
		const target = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]:not([data-usd-excluded]) .usd-out-namebtn').getAttribute('data-usd-info'));
		await sp.page.click(OM + '[data-usd-el="outside-row"][data-skill-id="' + target + '"] .usd-out-namebtn');
		await sleep(sp.page, 400);
		g = await look(sp.page);
		assert(g.pop && !g.toggle && !g.action && !/オススメから外す|オススメに戻す/.test(g.text), 'C-185 B4 オススメサポの小窓から開いた説明にも、「（区分）のオススメから外す」は出ない（説明そのものは出る）', g);
		await sp.page.keyboard.press('Escape');
		await waitOutside(sp.page);
		// 除外の欄: 押しボタン4つだけ。「個別に除外」は無い
		await openExclude(sp.page);
		const ex = await sp.page.evaluate(() => ({ ind: !!document.querySelector('[data-usd-el="outside-individual-btn"]'), tabs: document.querySelectorAll('[data-usd-el="outside-individual-tab"]').length, text: document.querySelector('.usd-info-pop').textContent }));
		assert(!ex.ind && ex.tabs === 0 && !/個別に除外/.test(ex.text), 'C-185 B4 除外の欄に「個別に除外」とその区分の切り替え（ピル）は無い', ex);
		await sp.page.keyboard.press('Escape');
		await sp.page.click(OM + '[data-usd-act="outside-close"]');
		await sleep(sp.page, 300);
		// 脚質オススメの小窓から開く説明
		await sp.page.click(T + '[data-usd-el="style-open"]');
		await sp.page.waitForSelector(SM + '[data-usd-el="style-row"]');
		await sleep(sp.page, 300);
		await sp.page.click(SM + '[data-usd-el="style-row"] .usd-sty-name');
		await sleep(sp.page, 300);
		g = await look(sp.page);
		assert(g.pop && !g.toggle && !g.action && !/オススメから外す|オススメに戻す/.test(g.text), 'C-185 B4 脚質オススメの小窓から開いた説明にも、切り替えは出ない（説明そのものは出る）', g);
		assert(jsErrors(sp.errors).length === 0, 'C-185 B4 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C-185 B5 脚質オススメ: 除外中のスキルは隠さず、チェックを外して「除外中（区分）」と示す／押せる見た目のまま・押すと「（区分）で除外中のため選べません」／追加の対象にしない', async () => {
		const sp = await openSp({ roster: Object.assign({}, ROSTER_A, { skillFilter: { surface: 'turf', style: 'nige', distance: 'long' } }) });
		await sp.page.click(T + '[data-usd-el="style-open"]');
		await sp.page.waitForSelector(SM + '[data-usd-el="style-row"]');
		await sleep(sp.page, 300);
		const pickOn = (sec) => sp.page.evaluate((sec) => { const r = Array.from(document.querySelectorAll('[data-usd-el="style-modal"] [data-section="' + sec + '"] [data-usd-el="style-row"]')).find((x) => x.getAttribute('data-state') === 'on'); return r ? r.getAttribute('data-skill-id') : null; }, sec);
		const scen = await pickOn('scenario'), out = await pickOn('outside');
		const head0 = await sp.page.evaluate(() => document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-head"]').textContent);
		// 段F1: 説明の小窓の切り替えは廃止した。除外は、オススメサポの一覧でチェックを外す操作が書くものと同じ保存（recommendExcluded）を、API で入れる（開いている小窓は計算し直される）
		await sp.page.evaluate(({ a, b }) => { const E = UmaSkillDeckCore.outside.recommendExcluded; E.set('long', a, true); E.set('long', b, true); }, { a: scen, b: out });
		await sleep(sp.page, 400);
		const rows = await sp.page.evaluate((ids) => ids.map((id) => { const r = document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-row"][data-skill-id="' + id + '"]'); return r ? { state: r.getAttribute('data-state'), reason: r.getAttribute('data-reason'), checked: r.querySelector('input').checked, tag: r.querySelector('[data-usd-el="style-row-pt"]').textContent } : null; }), [scen, out]);
		assert(rows.every((x) => x && x.state === 'gray' && x.reason === 'excluded' && !x.checked && x.tag === '除外中（' + LABELS.long + '）'), 'C-185 B5 除外したスキルは隠れず、チェックが外れて「除外中（' + LABELS.long + '）」と出る（シナリオ・サポカ外とも。段F1 で区分の名前を添えた）', rows);
		const head1 = await sp.page.evaluate(() => document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-head"]').textContent);
		assert(head1 !== head0 && /^追加するスキル \d+種/.test(head1), 'C-185 B5 追加の種数・合計から外れる（' + head0 + ' → ' + head1 + '）', { head0, head1 });
		await sp.page.click(SM + '[data-usd-el="style-row"][data-skill-id="' + scen + '"] .usd-sty-check', { force: true });
		await sleep(sp.page, 250);
		assert((await toastText(sp.page)) === LABELS.long + 'で除外中のため選べません', 'C-185 B5 押すと「' + LABELS.long + 'で除外中のため選べません」', await toastText(sp.page));
		// 追加しても入らない
		await sp.page.click(SM + '[data-usd-el="style-add"]');
		await sleep(sp.page, 500);
		const ids = await sp.page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
		assert(ids.length > 0 && !ids.includes(scen) && !ids.includes(out), 'C-185 B5 追加しても、除外中のスキルは②に入らない', ids.length);
		// 区分が違えば効かない（距離を変える）
		await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		await sleep(sp.page, 200);
		const rr = await rosterOf(sp.page);
		rr.skillFilter.distance = 'short';
		await sp.page.evaluate((r) => localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(r)), rr);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sleep(sp.page, 400);
		await sp.page.click(T + '[data-usd-el="style-open"]');
		await sp.page.waitForSelector(SM + '[data-usd-el="style-row"]');
		const sh = await sp.page.evaluate((id) => document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-row"][data-skill-id="' + id + '"]').getAttribute('data-reason'), scen);
		assert(sh !== 'excluded', 'C-185 B5 区分が違う（短距離）ときは、長距離の除外は効かない', sh);
		assert(jsErrors(sp.errors).length === 0, 'C-185 B5 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
