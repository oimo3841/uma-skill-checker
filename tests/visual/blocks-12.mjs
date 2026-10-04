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
}
