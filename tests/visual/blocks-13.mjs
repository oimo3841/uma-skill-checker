// オススメサポ 段13（段7〜12 の確認で出た修正と、追加の改善。2026-10-04・C-127）の検査。run-smoke.mjs の末尾から register13() で呼ばれる
// （塊の見出しはすべて「オススメサポ段13」で始まる。`npm run test:visual -- --only=オススメサポ段13` で回せる。区切りごとに「段13A」のように回せる）。
//
// A: 昼のレースでナイターのスキルを外す・複数の環境タグ（仮のスキル）・満たせないときの文言と空白・注意の知らせ・？の文面
// B: セットの帯のレース名・再読み込みで直前のセット・①の列見出しの3つのアイコンと漏斗
// C1: 残りの枠のサポカの指定
// C2: 「絞り込み」→「除外」
// C3〜C5: ②の一覧の2列・カード名の小窓の最初のタブ・金スキルの帯
// スキル名・レース名・カード名は検査の側に書かない（恒久ルール1。データから引くか、画面に出る文字として読む）。

export async function register13(env) {
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
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const M = '[data-usd-el="outside-modal"] ';
	const OPEN = '[data-usd-el="outside-open"]';
	const MSG_PENDING = '①でイベントの選択が済んでいないものがあります';

	/** special.html を開く（既定は②の因子周回タブ）。roster＝下書きの①（null で無し）、userData＝保存データ、syn＝合成のカード */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, o.userData || EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		if (o.syn) {
			await sp.page.route('**/data/support-cards.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'supportCard', nextSerial: 'card-9999', note: 'x', entries: o.syn.cards })));
			await sp.page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'supportCardEventSkill', note: 'x', entries: o.syn.events })));
			await sp.page.route('**/data/character-event-skills.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'characterEventSkill', note: 'x', entries: [] })));
		}
		await sp.page.evaluate(({ roster, tab, extra }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
			Object.keys(extra || {}).forEach((k) => localStorage.setItem(k, extra[k]));
		}, { roster: o.roster === undefined ? FULL : o.roster, tab: o.tab === undefined ? 1 : o.tab, extra: o.storage || null });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const settle = (page) => page.waitForFunction(() => {
		const m = document.querySelector('[data-usd-el="outside-modal"]');
		return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]');
	}, null, { timeout: 20000 });
	const open = async (page) => { await page.click(T + OPEN); await settle(page); };
	const close = async (page) => { await page.click(M + '[data-usd-act="outside-close"]'); await page.waitForTimeout(150); };

	/* ====================================================================
	 * A: 段7〜12 の確認で出た修正
	 * ==================================================================== */
	await block('オススメサポ段13A1 昼のレースでは、ナイターのタグを持つスキルを母集団から外す（夜・時間帯なしのレースでは外さない）／一覧の昼のレースでも外れる', async () => {
		const sp = await openSp({ roster: FULL });
		const r = await sp.page.evaluate((rows) => {
			const C = UmaSkillDeckCore.outside;
			const night = C.populationOf({}).ids.filter((id) => (UmaSkillDeckCore.getSkillTags(id).environment || []).includes('time_night'));
			const pop = (race) => C.populationOf(race ? { race: Object.assign({ id: 'race-t', name: 't' }, race) } : {});
			const day = pop({ time: 'time_day' }), nightRace = pop({ time: 'time_night' }), none = pop(null);
			const real = rows.filter((x) => x.time === 'time_day').map((x) => pop(x).raceExcludedIds);
			return { night, day: day.raceExcludedIds, dayIds: day.ids, nightEx: nightRace.raceExcludedIds, noneIds: none.ids, real };
		}, racesReal.races);
		assert(r.night.length > 0, 'オススメサポ段13A1 前提: ナイターのタグを持つ白スキルが母集団にある（' + r.night.length + '種。検査が空振りしていない）', r.night.length);
		assert(r.night.every((id) => r.day.includes(id) && !r.dayIds.includes(id)) && r.day.length === r.night.length,
			'オススメサポ段13A1 昼のレース: ナイターのスキルだけが外れる（' + r.day.length + '種）', r.day);
		assert(r.nightEx.length === 0 && r.night.every((id) => r.noneIds.includes(id)), 'オススメサポ段13A1 夜のレース・時間帯の指定なし: 外さない', r.nightEx);
		assert(r.real.length > 0 && r.real.every((ex) => r.night.every((id) => ex.includes(id))), 'オススメサポ段13A1 一覧の昼のレース（' + r.real.length + '件）でも、ナイターのスキルが外れる', r.real.map((x) => x.length));
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13A1 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ段13A6 環境のタグを2つ以上持つスキル（実データは0件なので仮のスキル）: 1つでも食い違えば外す・全部合えば残す・公開されていない項目は見ない', async () => {
		const sp = await openSp({ roster: FULL });
		const r = await sp.page.evaluate(() => {
			const C = UmaSkillDeckCore;
			const arr = C.getMasterSkills();
			const tags = {};
			C.TAG_AXES.forEach((a) => { tags[a.key] = []; });
			tags.environment = ['season_spring', 'weather_rain'];
			arr.push({ id: 'probe-env2', name: '仮のスキル', tags: tags });
			const ex = (race) => C.outside.populationOf({ race: Object.assign({ id: 'race-t', name: 't' }, race) });
			const base = C.outside.populationOf({}).ids.includes('probe-env2');
			const out = {
				base,
				springRain: ex({ season: 'season_spring', weather: 'weather_rain' }).ids.includes('probe-env2'),
				springSunny: ex({ season: 'season_spring', weather: 'weather_sunny' }).raceExcludedIds.includes('probe-env2'),
				summerRain: ex({ season: 'season_summer', weather: 'weather_rain' }).raceExcludedIds.includes('probe-env2'),
				springOnly: ex({ season: 'season_spring' }).ids.includes('probe-env2'),
				rainOnly: ex({ weather: 'weather_rain' }).ids.includes('probe-env2')
			};
			arr.splice(arr.findIndex((s) => s.id === 'probe-env2'), 1);
			return out;
		});
		assert(r.base, 'オススメサポ段13A6 前提: 仮のスキルが母集団に入る（入れ方が効いている）', r);
		assert(r.springRain && r.springSunny && r.summerRain && r.springOnly && r.rainOnly,
			'オススメサポ段13A6 春・雨のスキル: 春・雨のレースで残る／春・晴れ、夏・雨で外れる（1つでも食い違えば外す）／春だけ・雨だけ公開のレースでは残る', r);
		await sp.ctx.close();
	});

	// 合成の材料（種類ごとのカード）。白のスキルは実データの母集団から（名前は書かない）
	const master = readJson('uma-skill-deck-skills.json').skills;
	const ptReal = readJson('data/skill-pt.json');
	const stepReal = readJson('data/skill-step-up.json');
	const whiteSet = new Set(ptReal.entries.filter((e) => e.rarity === 'white').map((e) => e.skillId));
	const masterIds = new Set(master.map((s) => s.id));
	const linked = new Set(); stepReal.entries.forEach((e) => { linked.add(e.skillId); (e.prevSkillIds || []).forEach((p) => linked.add(p)); });
	const TYPE_NAMES = ['スピード', 'スタミナ', 'パワー', '根性', '賢さ', '友人・その他'];
	const SYN_ROSTER = ['syn-r1', 'syn-r2', 'syn-r3', 'syn-r4', 'syn-r5', 'syn-r6'];
	// 合成の材料は除外の初期値（デバフ・持久力回復）を外して作り（exclude: {}）、計算も同じ条件にする（C2 の検査は別に初期値を見る）
	const FULLSYN = { umaId: 'uma-0001', cardIds: SYN_ROSTER, skillFilter: FILTER, outsideOptions: { exclude: {} } };
	const mkCard = (id, chara, rarity, order, skills) => ({ id, title: '二つ名' + id, charaName: chara, type: TYPE_NAMES[order - 1], typeOrder: order, rarity, isGroup: false,
		hintSkills: skills.map((s) => ({ skillId: s, name: 'x' })), dataStatus: { hint: 'done' } });
	let POOL = null;
	/** 合成のカードに使う白スキル（実データの母集団から、前段の関係が無いもの）。除外の初期値（デバフ・持久力回復）に当たらないものだけ */
	const needPool = async () => {
		if (POOL) return POOL;
		const probe = await openSp({ roster: FULL });
		POOL = await probe.page.evaluate((f) => {
			const C = UmaSkillDeckCore;
			return C.outside.populationOf({ umaId: 'uma-0001', cardIds: [], skillFilter: f, outsideOptions: { exclude: {} } }).ids.map((id) => [id, C.getSkillTags(id)]);
		}, FILTER);
		await probe.ctx.close();
		POOL = POOL.filter(([id]) => masterIds.has(id) && whiteSet.has(id) && !linked.has(id)).map(([id, t]) => ({ id, tags: t }));
		return POOL;
	};
	/** 合成のデータ。cands: [[id, chara, rarity, typeOrder, [skillId…]]…]。chains: { カードID: [イベント…] }（無ければ空） */
	const synOf = (cands, chains) => {
		const roster = SYN_ROSTER.map((id, i) => [id, 'ロスター' + i, 'SR', (i % 5) + 1, []]);
		const all = cands.concat(roster).map((c) => mkCard.apply(null, c));
		return { cards: all, events: all.map((c) => ({ cardId: c.id, status: 'done', chain: (chains && chains[c.id]) || [] })) };
	};
	const skE = (id) => ({ skillId: id, name: 'x', hintLevel: 1 });
	const evN = (...alts) => ({ step: 1, choices: alts.map((ids) => ({ skills: ids.map(skE) })) });

	await block('オススメサポ段13A2・A3 満たせないとき: 候補そのものが足りない種類は「足りない種類：…」／種類ごとには足りているのに組み合わせで満たせないときは1行だけ／どちらもカードの欄とチェックリストの空白を出さない', async () => {
		const S = (await needPool()).map((x) => x.id);
		// スピード2キャラクター・スタミナ2キャラクター（どれも同じキャラクターが2つの種類のカードを持つ＝種類ごとには2人ずつ居るが、4枚は選べない）
		const syn = synOf([
			['syn-A1', 'テストA', 'SSR', 1, S.slice(0, 3)], ['syn-A2', 'テストA', 'SSR', 2, S.slice(3, 6)],
			['syn-B1', 'テストB', 'SSR', 1, S.slice(6, 9)], ['syn-B2', 'テストB', 'SSR', 2, S.slice(9, 12)],
			['syn-C', 'テストC', 'SR', 3, S.slice(12, 14)], ['syn-D', 'テストD', 'SR', 4, S.slice(14, 16)], ['syn-E', 'テストE', 'SR', 5, S.slice(16, 18)]
		]);
		const sp = await openSp({ roster: Object.assign({}, FULLSYN, { outsideOptions: { count: 4, typeMin: { 1: 2, 2: 2 }, exclude: {} } }), syn });
		const solve = (o) => sp.page.evaluate((a) => { const r = UmaSkillDeckCore.outside.solveSync(Object.assign({ addedSkillIds: [], deadlineMs: 20000 }, a)); return { infeasible: !!r.infeasible, short: r.shortTypes || null }; }, o);
		const combo = await solve({ count: 4, typeMin: { 1: 2, 2: 2 } });
		const short = await solve({ count: 4, typeMin: { 2: 3 } });
		assert(combo.infeasible && JSON.stringify(combo.short) === '[]', 'オススメサポ段13A2 スピード2・スタミナ2（どちらも2人ずつ居るが、同じ2人）: 満たせない。足りない種類は空', combo);
		assert(short.infeasible && JSON.stringify(short.short) === '[2]', 'オススメサポ段13A2 スタミナ3（2人しか居ない）: 足りない種類＝スタミナ', short);
		const view = () => sp.page.evaluate(() => {
			const m = document.querySelector('[data-usd-el="outside-modal"]');
			const e = m.querySelector('[data-usd-el="outside-infeasible"]');
			const head = m.querySelector('.usd-out-cardsbar').getBoundingClientRect();
			const list = m.querySelector('[data-usd-el="outside-list"]').getBoundingClientRect();
			const cards = m.querySelector('[data-usd-el="outside-cards"]');
			const cr = cards.getBoundingClientRect();
			const p = e ? e.getBoundingClientRect() : null;
			// カードの欄に残るのは、残りの枠のタイル（段13・C1）だけ。欄の高さはタイルの行の高さぶんだけ
			const kids = Array.from(cards.children);
			const rows = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top))).size;
			const tilesH = kids.length ? Math.round(Math.max.apply(null, kids.map((k) => k.getBoundingClientRect().bottom)) - Math.min.apply(null, kids.map((k) => k.getBoundingClientRect().top))) : 0;
			return { text: e ? Array.from(e.children).map((x) => x.textContent) : null, gapHeadToList: Math.round(list.top - head.bottom), listH: Math.round(list.height), noteH: p ? Math.round(p.height) : null,
				cardsH: Math.round(cr.height), tilesH, rows, kids: kids.map((k) => k.getAttribute('data-usd-el')), cardsShown: getComputedStyle(cards).display !== 'none', foot: m.querySelector('[data-usd-el="outside-foot"]').hidden };
		});
		await sp.page.click(T + OPEN); await settle(sp.page);
		const v1 = await view();
		assert(v1.text && v1.text.length === 1 && v1.text[0] === 'この組み合わせでは指定を満たせません' && v1.foot, 'オススメサポ段13A2 画面（組み合わせで満たせない）: 種類を並べず「この組み合わせでは指定を満たせません」の1行だけ', v1);
		assert(v1.kids.every((k) => k === 'outside-slot') && v1.cardsH <= v1.tilesH + 1 && v1.gapHeadToList <= v1.cardsH + 16 && v1.listH <= v1.noteH + 4, 'オススメサポ段13A3 カードの欄は残りの枠のタイルの高さ（' + v1.cardsH + 'px）だけで、その下にすぐ文（間 ' + v1.gapHeadToList + 'px）・文の箱は文の高さ（' + v1.listH + 'px）。カードの欄の空白（120px）とチェックリストの高さ（268px）を取らない', v1);
		await close(sp.page);
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ typeMin: { 2: 3 } }));
		await sp.page.click(T + OPEN); await settle(sp.page);
		const v2 = await view();
		assert(v2.text && v2.text.join('|') === '指定を満たす組み合わせがありません|足りない種類：スタミナ' && v2.cardsH <= v2.tilesH + 1 && v2.gapHeadToList <= v2.cardsH + 16 && v2.listH <= v2.noteH + 4,
			'オススメサポ段13A2・A3 画面（候補が足りない）: 「指定を満たす組み合わせがありません」と「足りない種類：スタミナ」（今のまま）。空白は出さない', v2);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13A2 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ段13A4 知らせ「' + MSG_PENDING + '」は注意のアイコン（alert-triangle）／ほかの知らせは今までどおり完了のアイコン／小窓が短いときも小窓の見出しを隠さない', async () => {
		const sp = await openSp({ roster: FULL });
		const icons = () => sp.page.evaluate(() => Array.from(document.querySelectorAll('#toast [data-toast-icon]')).filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getAttribute('data-toast-icon') + ':' + (e.getAttribute('class') || '').split(' ').filter((c) => /^lucide-|^text-/.test(c)).join(',')));
		await open(sp.page);
		await sp.page.waitForTimeout(450);
		const a = await sp.page.evaluate(() => document.getElementById('toast-message').textContent);
		const ia = await icons();
		assert(a === MSG_PENDING && ia.length === 1 && /^warn:.*lucide-alert-triangle/.test(ia[0]) && /text-amber-500/.test(ia[0]), 'オススメサポ段13A4 イベントの選択漏れの知らせは、注意のアイコン（ほかの注意書きと同じ alert-triangle・amber）だけが出る', { a, ia });
		await close(sp.page);
		await sp.page.evaluate(() => showToast('x'));
		const ib = await icons();
		assert(ib.length === 1 && /^ok:.*lucide-check-circle-2/.test(ib[0]), 'オススメサポ段13A4 ほかの知らせ（showToast(msg)）は、完了のアイコンのまま', ib);
		await sp.page.waitForTimeout(2700);
		// 小窓が短いとき（指定を満たせない）: 知らせは小窓の上端より上
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ count: 4, typeMin: { 1: 3, 2: 2 } }));
		await sp.page.click(T + OPEN); await settle(sp.page);
		await sp.page.waitForTimeout(500);
		const pos = await sp.page.evaluate(() => {
			const t = document.getElementById('toast').getBoundingClientRect(), p = document.querySelector('[data-usd-el="outside-modal"] .usd-out-panel').getBoundingClientRect();
			return { toastBottom: Math.round(t.bottom), panelTop: Math.round(p.top), shown: !document.getElementById('toast').classList.contains('opacity-0'), short: !!document.querySelector('[data-usd-el="outside-infeasible"]') };
		});
		assert(pos.short && pos.shown && pos.toastBottom <= pos.panelTop, 'オススメサポ段13A4 小窓が短いとき（指定を満たせない）も、知らせ（下端 ' + pos.toastBottom + '）は小窓の上端（' + pos.panelTop + '）より上', pos);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13A4 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ段13A5 オススメサポの見出しの「？」の中身は、指示の文面のまま', async () => {
		const HELP = '本育成のサポカで得られない対象スキルを、できるだけ多く得られる組み合わせです。ランダムイベントのスキルも数えます。追加済みのスキルも数えます。金スキルの前段の白は、金スキルと合わせて1種ですが、金スキルによる因子化率を加味してオススメしています。';
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-help"]');
		const t = await sp.page.evaluate(() => (document.querySelector('[data-usd-el="outside-help-text"]') || {}).textContent || null);
		assert(t === HELP, 'オススメサポ段13A5 「？」の文面が一致する', t);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * B: ①（本育成編成）とセットの帯
	 * ==================================================================== */
	const R0 = racesReal.races[0];
	const PART = racesReal.races.find((x) => !x.venue && !x.distance && x.surface && x.distanceCategory);
	const barInfo = (page) => page.evaluate(() => {
		const bar = document.querySelector('#deck-set-bar [data-usd-el="setbar"]');
		const b = bar.querySelector('[data-usd-el="set-race-btn"]');
		const t = b.querySelector('[data-usd-el="set-race-text"]');
		const n = bar.querySelector('[data-usd-el="set-name"]');
		const sum = bar.querySelector('[data-usd-el="set-total"]');
		return { barH: Math.round(bar.getBoundingClientRect().height), text: t.textContent, cut: t.scrollWidth > t.clientWidth + 1, ellipsis: getComputedStyle(t).textOverflow, fs: parseFloat(getComputedStyle(t).fontSize),
			nameCut: n.scrollWidth > n.clientWidth + 1, btnTop: Math.round(b.getBoundingClientRect().top), nameTop: Math.round(n.getBoundingClientRect().top), btnR: b.getBoundingClientRect().right, sumL: sum ? sum.getBoundingClientRect().left : null,
			on: b.getAttribute('aria-pressed') === 'true', title: b.title, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
	});
	const raceLabel = (page, row) => page.evaluate((r) => {
		// 期待する文字（タグの表示名はデータの TAG_AXES から引く。検査の側に地名を書かない）
		const ax = (k) => UmaSkillDeckCore.TAG_AXES.find((a) => a.key === k);
		const lab = (k, v) => { const a = ax(k); const o = a && v ? a.options.find((x) => x.v === v) : null; return o ? o.t : ''; };
		const p = [];
		if (r.venue) p.push(lab('trackVenue', r.venue));
		if (r.distance) p.push(lab('surface', r.surface) + r.distance + 'm'); else { if (r.surface) p.push(lab('surface', r.surface)); if (r.distanceCategory) p.push(lab('distance', r.distanceCategory)); }
		return p.filter(Boolean).join(' ');
	}, row);

	await block('オススメサポ段13B1 帯の「レース」: 選ぶと条件の短い形（会場＋バ場＋距離／一部だけ公開なら公開分）・指定なしは「レース」／帯は1行のまま・入りきらなければ「…」（320・375・414px）', async () => {
		for (const w of [320, 375, 414]) {
			const sp = await openSp({ roster: FULL, w });
			const tag = 'オススメサポ段13B1 ' + w + 'px: ';
			const a = await barInfo(sp.page);
			assert(a.text === 'レース' && !a.on, tag + '指定なしは「レース」', a);
			await sp.page.evaluate((r) => UmaSkillDeckCore.outside.setRace(r), R0);
			await sp.page.waitForTimeout(250);
			const b = await barInfo(sp.page);
			const exp = await raceLabel(sp.page, R0);
			assert(exp && b.text === exp && b.on && b.title.indexOf(R0.name) !== -1, tag + '全部公開のレース: 「' + exp + '」（レース名の全文は title と選択欄）', { text: b.text, title: b.title });
			assert(b.barH === a.barH && b.btnTop === a.btnTop && !b.nameCut && b.btnR <= b.sumL + 0.5 && b.sw <= b.iw && b.ellipsis === 'ellipsis' && b.fs >= 10,
				tag + '帯は1行のまま（高さ ' + a.barH + 'px・ボタンの位置も同じ）・セット名は切れない・合計と重ならない・横にはみ出さない。入りきらないときは「…」（' + (b.cut ? '切れている' : '全部入っている') + '・' + b.fs + 'px）', b);
			await sp.page.evaluate((r) => UmaSkillDeckCore.outside.setRace(r), PART);
			await sp.page.waitForTimeout(250);
			const c = await barInfo(sp.page);
			const exp2 = await raceLabel(sp.page, PART);
			assert(c.text === exp2 && !c.cut && c.barH === a.barH, tag + '一部だけ公開のレース: 「' + exp2 + '」（公開されている分だけ）', c);
			await sp.page.evaluate(() => UmaSkillDeckCore.outside.setRace(null));
			await sp.page.waitForTimeout(250);
			assert((await barInfo(sp.page)).text === 'レース', tag + '指定なしに戻すと「レース」', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	const SAVED2 = { schemaVersion: 7, records: [], customSkills: [], templates: [
		{ templateId: 't1', name: 'S1', skillIds: ['1'], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' },
		{ templateId: 't2', name: 'S2', skillIds: ['2'], baseRosterId: 'r2', createdAt: 'x', updatedAt: 'x' }],
		rosters: [
			{ rosterId: 'r1', name: 'S1', umaId: 'uma-0001', star: 3, awakeningLevel: 5, cardIds: CARDS6.slice(), skillFilter: FILTER, createdAt: 'x', updatedAt: 'x' },
			{ rosterId: 'r2', name: 'S2', umaId: 'uma-0002', star: 3, awakeningLevel: 5, cardIds: CARDS6.slice(), skillFilter: FILTER, createdAt: 'x', updatedAt: 'x' }] };
	const setName = (page) => page.evaluate(() => document.querySelector('#deck-set-bar [data-usd-el="set-name"]').textContent);
	const reloadSp = async (page) => {
		await page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 });
		await page.waitForTimeout(300);
	};

	await block('オススメサポ段13B2 再読み込み: 直前まで開いていたセットを開く（①もそのセット）／「＋新規」なら「＋新規」／削除された・見つからないセットは「＋新規」／覚える値は書き出しの対象外', async () => {
		const sp = await openSp({ userData: SAVED2, roster: null, tab: 0 });
		assert((await setName(sp.page)) === '＋新規', 'オススメサポ段13B2 前提: 初めて開いたときは「＋新規」', await setName(sp.page));
		const umaLabel = () => sp.page.evaluate(() => document.querySelector('#deck-roster-panel [data-usd-el="pick-uma"]').getAttribute('aria-label'));
		await sp.page.click(BAR + '[data-usd-act="set-list"]');
		await sp.page.click('[data-usd-el="set-list"] input[value="t1"]');
		await sp.page.waitForTimeout(300);
		const um1 = await umaLabel();
		await sp.page.click(BAR + '[data-usd-act="set-list"]');
		await sp.page.click('[data-usd-el="set-list"] input[value="t2"]');
		await sp.page.waitForTimeout(300);
		const um2 = await umaLabel();
		await reloadSp(sp.page);
		const r1 = await sp.page.evaluate(() => ({ name: document.querySelector('#deck-set-bar [data-usd-el="set-name"]').textContent,
			key: localStorage.getItem('umaSkillDeck:lastSet:special'), ud: localStorage.getItem('umaSkillDeck:userData') }));
		assert(r1.name === 'S2' && r1.key === 't2', 'オススメサポ段13B2 S2 を選んで読み込み直すと、S2 が開く（帯の名前）', r1);
		const um = await umaLabel();
		assert(um1 !== um2 && um === um2 && r1.ud.indexOf('lastSet') === -1, 'オススメサポ段13B2 ①もそのセット（S2）の編成を開く／覚える値は保存データ（書き出しの対象）の外', { um1, um2, um });
		// 「＋新規」に戻して読み込み直す
		await sp.page.click(BAR + '[data-usd-act="set-list"]');
		await sp.page.click('[data-usd-el="set-list"] input[value=""]').catch(async () => { await sp.page.evaluate(() => { const i = Array.from(document.querySelectorAll('[data-usd-el="set-list"] input')).find((x) => !x.value || x.value === '__draft__'); if (i) i.click(); }); });
		await sp.page.waitForTimeout(300);
		await reloadSp(sp.page);
		assert((await setName(sp.page)) === '＋新規', 'オススメサポ段13B2 「＋新規」を開いて読み込み直すと「＋新規」', await setName(sp.page));
		// 見つからない（削除された）セット
		await sp.page.evaluate(() => localStorage.setItem('umaSkillDeck:lastSet:special', 't-gone'));
		await reloadSp(sp.page);
		assert((await setName(sp.page)) === '＋新規', 'オススメサポ段13B2 覚えていたセットが無いときは「＋新規」', await setName(sp.page));
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13B2 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 開いていたセット（S1）が削除された保存データ（検査の土台は読み込みのたびに保存データを入れ直すので、別の窓で開く）
		const gone = JSON.parse(JSON.stringify(SAVED2));
		gone.templates = gone.templates.filter((t) => t.templateId !== 't1');
		const sp2 = await openSp({ userData: gone, roster: null, tab: 0, storage: { 'umaSkillDeck:lastSet:special': 't1' } });
		assert((await setName(sp2.page)) === '＋新規', 'オススメサポ段13B2 開いていたセット（S1）が削除されていたら「＋新規」', await setName(sp2.page));
		const sp3 = await openSp({ userData: SAVED2, roster: null, tab: 0, storage: { 'umaSkillDeck:lastSet:special': 't1' } });
		assert((await setName(sp3.page)) === 'S1', 'オススメサポ段13B2 比べる側: 同じ値で、セットが在れば S1 が開く（上の「＋新規」は削除のため）', await setName(sp3.page));
		await sp2.ctx.close(); await sp3.ctx.close();
	});

	/** ①の表: スキル名の列見出しと、行の並び（まとまり＝金と直下の前段の白） */
	const gridInfo = (page) => page.evaluate(() => {
		const panel = document.getElementById('deck-roster-panel');
		const gh = panel.querySelector('.usd-roster-gh--skill');
		const heads = Array.from(panel.querySelectorAll('.usd-roster-gh'));
		const rows = Array.from(panel.querySelectorAll('.usd-roster-grow[data-skill-id]')).map((r) => ({ id: r.getAttribute('data-skill-id'), prev: r.classList.contains('usd-roster-grow--prev') }));
		const icons = gh ? Array.from(gh.querySelectorAll('.usd-roster-toneicon')).map((i) => ({ label: i.getAttribute('aria-label'), bg: getComputedStyle(i).backgroundColor, fg: getComputedStyle(i).color, svg: !!i.querySelector('svg'), cls: (i.querySelector('svg') || { getAttribute: () => '' }).getAttribute('class') })) : [];
		const btns = gh ? Array.from(gh.querySelectorAll('[data-usd-el="tone-sort-btn"]')).map((b) => ({ tone: b.getAttribute('data-tone'), on: b.getAttribute('aria-pressed') === 'true', w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })) : [];
		const t = gh ? gh.querySelector('.usd-roster-ghtitle') : null;
		return { icons, btns, titleCut: t ? t.scrollWidth > t.clientWidth + 1 : null, title: t ? t.textContent : null, ghH: gh ? Math.round(gh.getBoundingClientRect().height) : 0,
			rowH: heads.length ? Math.round(Math.max.apply(null, heads.map((h) => h.getBoundingClientRect().height))) : 0, memberH: heads.length > 1 ? Math.round(heads[1].getBoundingClientRect().height) : 0,
			memberOn: Array.from(panel.querySelectorAll('[data-usd-el="sort-btn"][aria-pressed="true"]')).length, rows, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
	});
	const tonesOf = (page, ids) => page.evaluate((list) => {
		// 段7e の行の色分けと同じ基準（効果タイプの持久力回復／デバフ〔まとめた値を含む〕・パッシブの軸）を、タグから検査の側で引く
		const C = UmaSkillDeckCore;
		const eff = C.TAG_AXES.find((a) => a.key === 'effect');
		const debuff = ['debuff'].concat(eff.options.filter((o) => o.mergedInto === 'debuff').map((o) => o.v));
		const out = {};
		list.forEach((id) => { const t = C.getSkillTags(id) || {}; const e = t.effect || []; out[id] = { heal: e.includes('stamina'), debuff: e.some((v) => debuff.includes(v)), passive: (t.passive || []).length > 0 }; });
		return out;
	}, ids);
	/** 行の並びを、まとまり（前段の行は直前のまとまりに入る）に分ける */
	const unitsOf = (rows) => { const u = []; rows.forEach((r) => { if (r.prev && u.length) u[u.length - 1].push(r.id); else u.push([r.id]); }); return u; };

	await block('オススメサポ段13B3 ①の列見出し: 「スキル名」の右に回復・緑・デバフの3つのアイコンと、その下に漏斗／375px で高さは変わらず、320px でも「スキル名」は切れない／押すとその種類を上へ（行は減らない・金と前段の白は崩さない）／同時に1つだけ・もう一度で元の並び・保存しない', async () => {
		for (const w of [375, 320]) {
			const sp = await openSp({ roster: FULL, tab: 0, w });
			const tag = 'オススメサポ段13B3 ' + w + 'px: ';
			const g0 = await gridInfo(sp.page);
			assert(g0.icons.map((i) => i.label).join() === '回復スキル,緑スキル,デバフスキル' && g0.icons.every((i) => i.svg) && g0.btns.map((b) => b.tone).join() === 'heal,passive,debuff' && g0.btns.every((b) => !b.on),
				tag + '3つのアイコン（回復・緑・デバフ）とその下の漏斗（どれも押していない）', g0.icons.map((i) => i.label));
			assert(/lucide-sparkles/.test(g0.icons[0].cls) && /lucide-sparkles/.test(g0.icons[2].cls) && /lucide-sprout/.test(g0.icons[1].cls) && g0.icons[0].bg !== g0.icons[2].bg && g0.icons[0].fg === 'rgb(255, 255, 255)' && g0.icons[2].fg === 'rgb(255, 255, 255)' && g0.icons[1].bg === 'rgba(0, 0, 0, 0)',
				tag + '回復・デバフは光の形（オススメサポのボタンと同じ）を色の違う角丸の四角に白で、緑は葉（「緑スキル」の入口と同じ）', g0.icons);
			assert(g0.ghH <= g0.memberH && g0.rowH === g0.memberH && !g0.titleCut && g0.title === 'スキル名' && g0.btns.every((b) => Math.min(b.w, b.h) >= 24) && g0.sw <= g0.iw,
				tag + '列見出しの高さは他の列（' + g0.memberH + 'px）と同じで増えない・「スキル名」は切れない・漏斗の押せる範囲は 24px 以上・横にはみ出さない', g0);
			const ids = g0.rows.map((r) => r.id);
			const tones = await tonesOf(sp.page, ids);
			const u0 = unitsOf(g0.rows);
			for (const kind of ['heal', 'passive', 'debuff']) {
				await sp.page.click('#deck-roster-panel [data-usd-act="sort-tone"][data-tone="' + kind + '"]');
				await sp.page.waitForTimeout(200);
				const g = await gridInfo(sp.page);
				const hit = (u) => u.some((id) => tones[id][kind]);
				const exp = u0.filter(hit).concat(u0.filter((u) => !hit(u)));
				const got = unitsOf(g.rows);
				const n = u0.filter(hit).length;
				assert(n > 0 && n < u0.length, tag + kind + ': 前提: その種類のスキルがある（' + n + '／' + u0.length + 'まとまり。空振りしていない）', n);
				assert(JSON.stringify(got) === JSON.stringify(exp) && g.rows.length === g0.rows.length,
					tag + kind + ': その種類を含むまとまりが上へ（並びは元のまま＝安定）。行は減らない・金と直下の前段の白は一緒に動く', { got: got.length, exp: exp.length });
				assert(g.btns.filter((b) => b.on).map((b) => b.tone).join() === kind && g.memberOn === 0, tag + kind + ': 押した漏斗だけが有効（同時に1つだけ）', g.btns);
			}
			// もう一度押すと元の並び
			await sp.page.click('#deck-roster-panel [data-usd-act="sort-tone"][data-tone="debuff"]');
			await sp.page.waitForTimeout(200);
			const g1 = await gridInfo(sp.page);
			assert(JSON.stringify(g1.rows) === JSON.stringify(g0.rows) && g1.btns.every((b) => !b.on), tag + 'もう一度押すと元の並びに戻る', true);
			// メンバーの列の漏斗とも同時に1つだけ
			await sp.page.click('#deck-roster-panel [data-usd-act="sort-tone"][data-tone="heal"]');
			await sp.page.waitForTimeout(200);
			await sp.page.click('#deck-roster-panel [data-usd-el="sort-btn"]');
			await sp.page.waitForTimeout(200);
			const g2 = await gridInfo(sp.page);
			assert(g2.memberOn === 1 && g2.btns.every((b) => !b.on), tag + 'メンバーの列の漏斗を押すと、種類の漏斗は外れる（全部で1つだけ）', { memberOn: g2.memberOn, btns: g2.btns });
			// 保存しない（既存の漏斗と同じ）: 押したまま読み込み直すと元の並び
			await sp.page.click('#deck-roster-panel [data-usd-act="sort-tone"][data-tone="passive"]');
			await sp.page.waitForTimeout(200);
			await reloadSp(sp.page);
			const g3 = await gridInfo(sp.page);
			assert(g3.btns.every((b) => !b.on) && g3.memberOn === 0 && JSON.stringify(g3.rows) === JSON.stringify(g0.rows), tag + '漏斗の状態は保存しない（既存の漏斗と同じ。読み込み直すと元の並び）', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * C1: 残りの枠のサポカの指定
	 * ==================================================================== */
	/** 合成の材料（C1）: 指定するカード P（スピード）・P と同じスキルの A（スピード）・P と同じキャラクターの P2・友人2枚・選択肢のあるカード Q と、Q の片方の選択肢と同じスキルの C */
	const c1Syn = async () => {
		const S = (await needPool()).map((x) => x.id);
		const cands = [
			['syn-P', 'テストP', 'SSR', 1, S.slice(0, 5)], ['syn-A', 'テストA', 'SSR', 1, S.slice(0, 5)], ['syn-P2', 'テストP', 'SSR', 3, S.slice(5, 11)],
			['syn-B', 'テストB', 'SR', 2, S.slice(11, 14)], ['syn-D', 'テストD', 'SR', 4, S.slice(14, 16)], ['syn-G', 'テストG', 'SR', 5, S.slice(16, 17)],
			['syn-F1', 'テストF1', 'SR', 6, S.slice(17, 18)], ['syn-F2', 'テストF2', 'SR', 6, S.slice(18, 25)],
			['syn-Q', 'テストQ', 'SR', 5, []], ['syn-C', 'テストC', 'SR', 4, S.slice(25, 29)]
		];
		// F2 は大きい（7種）ので、友人の上限に空きがあれば必ず選ばれる。C（4種）は、Q の1つ目の選択肢と同じスキル。Q の2つ目の選択肢は別の4種
		if (S.length < 33) throw new Error('合成に使う白スキルが足りない: ' + S.length);
		return { S, syn: synOf(cands, { 'syn-Q': [evN(S.slice(25, 29), S.slice(29, 33))] }) };
	};
	const solveC1 = (page, o) => page.evaluate((a) => {
		const r = UmaSkillDeckCore.outside.solveSync(Object.assign({ addedSkillIds: [], deadlineMs: 20000 }, a));
		return { ok: r.ok, infeasible: !!r.infeasible, rec: r.cards.filter((c) => !c.pinned).map((c) => c.cardId).sort(), pinned: r.cards.filter((c) => c.pinned).map((c) => ({ id: c.cardId, picks: c.picks, gain: c.kindGain })),
			skills: r.skills.map((s) => s.skillId), score: r.score, engine: r.stats.engineScore, kinds: r.counts.kinds, gains: r.cards.reduce((s, c) => s + c.kindGain, 0) };
	}, o);

	await block('オススメサポ段13C1 探索: 指定したカードのスキルは「得られる」として扱い、それ以外を補う／同じキャラクターのカードは候補から外す／種類の指定・友人の上限は指定したカードを数えない／選択肢のある指定カードは、補うカードと合わせて最良の選び方', async () => {
		const { S, syn } = await c1Syn();
		const sp = await openSp({ roster: FULLSYN, syn });
		const none = await solveC1(sp.page, { count: 4 });
		const pin = await solveC1(sp.page, { count: 4, pinnedCardIds: ['syn-P'] });
		assert(none.rec.includes('syn-P2') && pin.pinned.map((x) => x.id).join() === 'syn-P' && !pin.rec.includes('syn-A') && !pin.rec.includes('syn-P2') && pin.rec.length === 4,
			'オススメサポ段13C1 P を指定（4枚）: P と同じスキルしか持たない A は選ばれず（得られるものとして扱う）、P と同じキャラクターの P2 は候補から外れる', { none: none.rec, pin: pin.rec });
		assert(S.slice(0, 5).every((id) => pin.skills.includes(id)) && pin.score === pin.engine && pin.kinds === pin.gains && pin.pinned[0].gain === 5,
			'オススメサポ段13C1 結果のスキルに P のスキルも入る（追加の対象）。点数は探索と一致・種数は各カードの「＋N種」の合計と一致（P は先に数えて＋5種）', pin);
		const t = await solveC1(sp.page, { count: 4, pinnedCardIds: ['syn-P'], typeMin: { 1: 1 } });
		assert(!t.infeasible && t.rec.includes('syn-A'), 'オススメサポ段13C1 スピード1枚の指定: 指定したスピードの P は数えないので、オススメの4枚にスピード（A）が入る', t.rec);
		const f = await solveC1(sp.page, { count: 4, pinnedCardIds: ['syn-F1'] });
		assert(f.rec.includes('syn-F2') && f.rec.filter((id) => /^syn-F/.test(id)).length === 1, 'オススメサポ段13C1 友人 F1 を指定: オススメの4枚に友人（F2）を1枚選べる（指定したカードは友人の上限に数えない）', f.rec);
		const q = await solveC1(sp.page, { count: 4, pinnedCardIds: ['syn-Q'] });
		const qp = q.pinned[0];
		assert(qp && qp.picks.length === 1 && qp.picks[0].choiceIndex === 1 && q.rec.includes('syn-C') && S.slice(25, 33).every((id) => q.skills.includes(id)),
			'オススメサポ段13C1 Q（選択肢が2つ）を指定: C と重ならない側の選択肢（2つ目）を選んだ前提で、C を補う（8種とも得られる）', { picks: qp && qp.picks, rec: q.rec });
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13C1 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	const modalTiles = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-cards"] > *')).map((e) => ({
		el: e.getAttribute('data-usd-el'), id: e.getAttribute('data-card-id'), slot: e.getAttribute('data-slot'), text: e.textContent.replace(/\s+/g, ''), h: Math.round(e.getBoundingClientRect().height) })));

	await block('オススメサポ段13C1 画面: 残りの枠は「N サポカを選ぶ」・①と同じカード選択の小窓（オススメサポの小窓の上・Escape で選ぶ小窓だけ閉じる）・指定したカードは番号の札つき・「外す」で解除／枚数の選択肢・保存（セットごと）／追加で指定したカードのスキルも入る（①の本育成のスキルは入らない）', async () => {
		const { S, syn } = await c1Syn();
		const sp = await openSp({ roster: Object.assign({}, FULLSYN, { outsideOptions: { count: 4, exclude: {} } }), syn });
		await open(sp.page);
		const t0 = await modalTiles(sp.page);
		assert(t0.filter((x) => x.el === 'outside-card').length === 4 && t0.slice(4).map((x) => x.el + ':' + x.slot + ':' + x.text).join() === 'outside-slot:5:5サポカを選ぶ,outside-slot:6:6サポカを選ぶ' && t0.every((x) => x.h === 36),
			'オススメサポ段13C1 4枚のとき、残りの2枠は「5 サポカを選ぶ」「6 サポカを選ぶ」（高さはカードと同じ 36px）', t0);
		await sp.page.click(M + '[data-usd-el="outside-slot"][data-slot="5"]');
		await sp.page.waitForSelector('.usd-roster-modal[data-usd-over="1"] [data-usd-el="hits"]');
		const pk = await sp.page.evaluate(() => { const m = document.querySelector('.usd-roster-modal'); const o = document.querySelector('[data-usd-el="outside-modal"]');
			return { z: Number(getComputedStyle(m).zIndex), oz: Number(getComputedStyle(o).zIndex), title: m.querySelector('.usd-roster-h').textContent, types: m.querySelectorAll('[data-usd-act="type"]').length }; });
		assert(pk.z > pk.oz && pk.title === 'サポートカードを選ぶ' && pk.types > 0, 'オススメサポ段13C1 ①と同じ「サポートカードを選ぶ」の小窓が、オススメサポの小窓の上に出る（検索・種類の切り替えつき）', pk);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		const esc1 = await sp.page.evaluate(() => ({ picker: !!document.querySelector('.usd-roster-modal'), outside: !document.querySelector('[data-usd-el="outside-modal"]').hidden }));
		assert(!esc1.picker && esc1.outside, 'オススメサポ段13C1 Escape で選ぶ小窓だけが閉じ、オススメサポの小窓は開いたまま', esc1);
		const pickBy = async (slot, cardId) => {
			await sp.page.click(M + '[data-usd-el="outside-slot"][data-slot="' + slot + '"]');
			await sp.page.fill('[data-usd-el="roster-modal-host"] [data-usd-el="find"]', '二つ名' + cardId);
			await sp.page.waitForTimeout(150);
			await sp.page.click('[data-usd-el="roster-modal-host"] [data-usd-act="take"][data-entry-id="' + cardId + '"]');
			await settle(sp.page);
		};
		await pickBy(5, 'syn-P');
		const t1 = await modalTiles(sp.page);
		const d1 = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')).outsideOptions);
		assert(t1.find((x) => x.el === 'outside-pinned' && x.id === 'syn-P' && x.slot === '5' && /^5/.test(x.text) && /解除$/.test(x.text)) && t1.filter((x) => x.el === 'outside-card').every((x) => x.id !== 'syn-P2') && JSON.stringify(d1.pinned) === '["syn-P"]',
			'オススメサポ段13C1 選ぶと、5枠目に番号の札つきで入り（「解除」。段13 の仕上げ）、セットに保存（pinned）。同じキャラクターの P2 はオススメに出ない', { t1, d1 });
		// 同じキャラクターのカードは選べない
		await sp.page.click(M + '[data-usd-el="outside-slot"][data-slot="6"]');
		await sp.page.fill('[data-usd-el="roster-modal-host"] [data-usd-el="find"]', '二つ名syn-P');
		await sp.page.waitForTimeout(150);
		const hits = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="roster-modal-host"] .usd-name-hit')).map((e) => ({ t: e.textContent, btn: e.tagName === 'BUTTON' })));
		assert(hits.find((h) => /syn-P2]/.test(h.t) && !h.btn && /同じキャラクターが入っています/.test(h.t)) && hits.find((h) => /syn-P]/.test(h.t) && !h.btn && /この編成に入っています/.test(h.t)),
			'オススメサポ段13C1 指定済みのカードは「この編成に入っています」、同じキャラクターのカードは「同じキャラクターが入っています」で選べない', hits);
		await sp.page.keyboard.press('Escape');
		// 枚数: 指定が1枚なら 6枚は選べない
		await sp.page.click(M + '[data-usd-el="outside-count-btn"]');
		const chips = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-count-list"] button')).map((b) => b.disabled));
		assert(chips.join() === 'false,false,true', 'オススメサポ段13C1 指定が1枚のとき、枚数は 4・5 まで（6枚は押せない）', chips);
		await sp.page.keyboard.press('Escape');
		// 追加: 指定したカードのスキル（母集団に入るもの）も入る。①の本育成のスキルは入らない
		const r = await sp.page.evaluate(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return Array.from(m.querySelectorAll('[data-usd-el="outside-check"]')).map((i) => i.value); });
		assert(S.slice(0, 5).every((id) => r.includes(id)), 'オススメサポ段13C1 チェックリストに指定したカードのスキルも出る（最初は全部チェック）', r.length);
		await sp.page.click(M + '[data-usd-el="outside-add"]');
		await sp.page.waitForTimeout(300);
		const added = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{"skillIds":[]}').skillIds);
		const pop = await sp.page.evaluate(() => UmaSkillDeckCore.outside.populationOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))));
		assert(S.slice(0, 5).every((id) => added.includes(id)) && added.every((id) => pop.takenIds.indexOf(id) === -1),
			'オススメサポ段13C1 「追加」で、指定したカードのスキルも②に入る（①の本育成で得るスキルは入らない）', { added: added.length });
		// 外す → 指定が消え、項目ごと消える（ほかの指定は残る）
		await open(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-unpin"][data-card-id="syn-P"]');
		await settle(sp.page);
		const d2 = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')).outsideOptions);
		const t2 = await modalTiles(sp.page);
		assert(JSON.stringify(d2) === JSON.stringify({ count: 4, exclude: {} }) && t2.filter((x) => x.el === 'outside-slot').length === 2, 'オススメサポ段13C1 「外す」で指定が解除され（pinned の項目が消える）、2枠とも「サポカを選ぶ」に戻る', d2);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13C1 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ段13C1 保存（outsideOptions.pinned）: 触ったときだけ書く・指定なしで項目ごと消す・セットごと（別のセットには出ない）・再読み込みで残る・古いデータは1バイトも変わらない・引けないIDは読まない', async () => {
		const seed = JSON.parse(JSON.stringify(SAVED2));
		seed.rosters.forEach((r) => { r.cardIds = CARDS6.slice(); r.umaId = 'uma-0001'; });
		const sp = await openSp({ userData: seed, roster: null });
		const pick = async (id) => { await sp.page.click(BAR + '[data-usd-act="set-list"]'); const on = await sp.page.evaluate((v) => document.querySelector('[data-usd-el="set-list"] input[value="' + v + '"]').checked, id); if (on) await sp.page.keyboard.press('Escape'); else await sp.page.click('[data-usd-el="set-list"] input[value="' + id + '"]'); await sp.page.waitForTimeout(250); };
		await pick('t1');
		assert((await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'))) === JSON.stringify(seed), 'オススメサポ段13C1 項目の無いデータは、開いてセットを選んでも1バイトも変わらない', true);
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ pinned: ['card-0300', 'card-9999'] }));
		let d = JSON.parse(await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData')));
		assert(JSON.stringify(d.rosters.find((r) => r.rosterId === 'r1').outsideOptions) === '{"pinned":["card-0300"]}' && !d.rosters.find((r) => r.rosterId === 'r2').outsideOptions && d.schemaVersion === 7,
			'オススメサポ段13C1 書くと、そのセットの roster に pinned（引けないIDは入れない）。別のセットには書かない・schemaVersion は 7 のまま', d.rosters.map((r) => r.outsideOptions));
		await pick('t2');
		assert((await sp.page.evaluate(() => UmaSkillDeckCore.outside.getOptions().pinned)).length === 0, 'オススメサポ段13C1 別のセット（S2）では指定なし', true);
		await pick('t1');
		const pg = await sp.ctx.newPage();
		await pg.route('**/data/scenario-event-skills.json*', (rt) => rt.fulfill(json(scenReal)));
		await pg.goto(base + '/special.html', { waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await pg.isVisible('#ui-notice')) await pg.click('[data-act="notice-ok"]');
		await pg.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 });
		await pg.waitForTimeout(300);
		assert(JSON.stringify(await pg.evaluate(() => UmaSkillDeckCore.outside.getOptions().pinned)) === '["card-0300"]', 'オススメサポ段13C1 再読み込みのあとも残っている（S1 が開く）', true);
		await pg.close();
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ pinned: [] }));
		d = JSON.parse(await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData')));
		assert(!('outsideOptions' in d.rosters.find((r) => r.rosterId === 'r1')), 'オススメサポ段13C1 指定なしに戻すと、項目ごと消える（ほかの指定が無いので）', d.rosters[0]);
		const o = await sp.page.evaluate(() => UmaSkillDeckCore.outside.optionsOf({ outsideOptions: { count: 5, pinned: ['card-9999', 'card-0300', 'card-0300', 5] } }).pinned);
		assert(JSON.stringify(o) === '["card-0300"]', 'オススメサポ段13C1 読むときは、引けないID・重複・文字列でないものを読まない（保存値は書き換えない）', o);
		const o2 = await sp.page.evaluate(() => UmaSkillDeckCore.outside.optionsOf({ outsideOptions: { count: 6, pinned: ['card-0300'] } }).pinned);
		assert(o2.length === 0, 'オススメサポ段13C1 枠が無い（6枚）ときは、指定を読まない', o2);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13C1 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
	/* ====================================================================
	 * C2: 「絞り込み」→「除外」
	 * ==================================================================== */
	/** 検査の側の除外の規則（実装とは別に書いた物差し）。軸ごとに、スキルが持つ値（空でない）がすべて除外の値（まとめた値を含む）に入っていれば外す */
	const exOracle = (tags, ex, merged) => Object.keys(ex).some((k) => {
		const have = (tags && tags[k]) || [];
		if (have.length === 0) return false;
		const vals = ex[k].concat((merged[k] || []).filter((m) => ex[k].includes(m.into)).map((m) => m.v));
		return have.every((v) => vals.includes(v));
	});

	await block('オススメサポ段13C2 除外の規則: ある軸で持つ値がすべて除外のときだけ外す（ほかの値も持てば残す・その軸に値が無ければ残す・どれか1つの軸で外れれば外す）／デバフにまとめた掛かり時間も外れる／保存値の無いセットは初期値（デバフ・持久力回復）／実データで物差しと一致', async () => {
		const sp = await openSp({ roster: FULL });
		const r = await sp.page.evaluate(() => {
			const C = UmaSkillDeckCore;
			const merged = {};
			C.TAG_AXES.forEach((a) => { merged[a.key] = a.options.filter((o) => o.mergedInto).map((o) => ({ v: o.v, into: o.mergedInto })); });
			const arr = C.getMasterSkills();
			const probe = (id, t) => { const tags = {}; C.TAG_AXES.forEach((a) => { tags[a.key] = []; }); Object.assign(tags, t); arr.push({ id, name: '仮のスキル', tags }); };
			probe('probe-ex1', { effect: ['temptation_time'] });
			probe('probe-ex2', { effect: ['target_speed_up', 'stamina'] });
			probe('probe-ex3', { effect: [] });
			probe('probe-ex4', { effect: ['stamina'] });
			probe('probe-ex5', { effect: ['accel_up'], phase: ['late'] });
			probe('probe-ex6', { effect: ['accel_up'], phase: ['late', 'mid'] });
			const has = (p, id) => p.ids.includes(id);
			const def = C.outside.populationOf({});
			const noEx = C.outside.populationOf({ outsideOptions: { exclude: {} } });
			const late = C.outside.populationOf({ outsideOptions: { exclude: { phase: ['late'] } } });
			const out = { def: ['probe-ex1', 'probe-ex2', 'probe-ex3', 'probe-ex4'].map((id) => has(def, id)), noEx: ['probe-ex1', 'probe-ex4'].map((id) => has(noEx, id)),
				late: ['probe-ex5', 'probe-ex6', 'probe-ex4'].map((id) => has(late, id)), defaultOpt: C.outside.optionsOf({}).exclude, merged,
				real: noEx.ids.filter((id) => !/^probe-/.test(id)).map((id) => [id, C.getSkillTags(id)]), defIds: def.ids.filter((id) => !/^probe-/.test(id)), lateIds: late.ids.filter((id) => !/^probe-/.test(id)) };
			['probe-ex1', 'probe-ex2', 'probe-ex3', 'probe-ex4', 'probe-ex5', 'probe-ex6'].forEach((id) => arr.splice(arr.findIndex((s) => s.id === id), 1));
			return out;
		});
		assert(JSON.stringify(r.defaultOpt) === JSON.stringify({ effect: ['stamina', 'debuff'] }), 'オススメサポ段13C2 保存値の無いセットは、初期値（効果タイプの持久力回復・デバフ）で読む', r.defaultOpt);
		assert(r.noEx.join() === 'true,true', 'オススメサポ段13C2 前提: 何も除外しなければ、仮のスキル（掛かり時間だけ・持久力回復だけ）も母集団に入る', r.noEx);
		assert(r.def.join() === 'false,true,true,false', 'オススメサポ段13C2 初期値: 掛かり時間だけのスキル（デバフにまとめた値）は外れる／速度上昇と持久力回復を持つスキルは残る／効果タイプが空のスキルは残る／持久力回復だけのスキルは外れる', r.def);
		assert(r.late.join() === 'false,true,true', 'オススメサポ段13C2 フェーズ「終盤」を除外: 終盤だけのスキルは（効果タイプが除外でなくても）外れる＝どれか1つの軸で外れれば外す／終盤と中盤を持つスキルは残る', r.late);
		// 実データ: 物差しと一致（除外しないときの母集団から、物差しで外れるものを引いたもの）
		const expDef = r.real.filter(([, t]) => !exOracle(t, { effect: ['stamina', 'debuff'] }, r.merged)).map(([id]) => id).sort();
		const expLate = r.real.filter(([, t]) => !exOracle(t, { phase: ['late'] }, r.merged)).map(([id]) => id).sort();
		const tempOnly = r.real.filter(([, t]) => (t.effect || []).length > 0 && (t.effect || []).every((v) => v === 'temptation_time')).length;
		assert(JSON.stringify(r.defIds.slice().sort()) === JSON.stringify(expDef) && expDef.length < r.real.length && JSON.stringify(r.lateIds.slice().sort()) === JSON.stringify(expLate) && expLate.length < r.real.length,
			'オススメサポ段13C2 実データ: 初期値（' + (r.real.length - expDef.length) + '種を外す）・終盤（' + (r.real.length - expLate.length) + '種を外す）とも物差しと一致。掛かり時間だけのスキルは実データに ' + tempOnly + '種', { def: r.defIds.length, exp: expDef.length });
		await sp.ctx.close();
	});

	const exUi = (page) => page.evaluate(() => {
		const m = document.querySelector('[data-usd-el="outside-modal"]');
		const bar = m.querySelector('.usd-out-cardsbar');
		const b = m.querySelector('[data-usd-el="outside-exclude-btn"]');
		const lab = b.querySelector('[data-usd-el="outside-exclude-label"]');
		const btns = Array.from(bar.querySelectorAll('button'));
		return { text: b.innerText.replace(/\s+/g, ''), on: b.getAttribute('aria-pressed') === 'true', cut: lab.scrollWidth > lab.clientWidth + 1, order: btns.map((x) => x.getAttribute('data-usd-el')).join(),
			barH: Math.round(bar.getBoundingClientRect().height), tops: new Set(btns.map((x) => Math.round(x.getBoundingClientRect().top))).size, inside: btns.every((x) => x.getBoundingClientRect().right <= bar.getBoundingClientRect().right + 0.5), sw: document.documentElement.scrollWidth, iw: window.innerWidth };
	});
	const exPop = (page) => page.evaluate(() => {
		const list = document.querySelector('[data-usd-el="outside-exclude-list"]');
		if (!list) return null;
		const pop = list.closest('.uma-popover');
		return { axes: Array.from(list.querySelectorAll('[data-usd-el="outside-exclude-axis"]')).map((x) => x.getAttribute('data-axis')), on: Array.from(list.querySelectorAll('[data-usd-el="outside-exclude-chip"][aria-pressed="true"]')).map((x) => x.getAttribute('data-axis') + ':' + x.getAttribute('data-value')),
			title: pop.querySelector('.uma-popover-title, h2, [data-usd-el="info-title"]') ? pop.querySelector('.uma-popover-title, h2, [data-usd-el="info-title"]').textContent : null, ids: pop.querySelectorAll('.uma-popover-body [id]').length,
			help: Array.from(pop.querySelectorAll('[data-usd-el="outside-exclude-helptext"] p')).map((p) => p.textContent), helpHidden: pop.querySelector('[data-usd-el="outside-exclude-helptext"]').hidden, clearDis: pop.querySelector('[data-usd-el="outside-exclude-clear"]').disabled };
	});
	const exChip = async (page, axis, v) => { await page.click('[data-usd-el="outside-exclude-chip"][data-axis="' + axis + '"][data-value="' + v + '"]'); await settle(page); };
	const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));

	await block('オススメサポ段13C2 画面: 「除外：持久力回復・デバフ ▾」が「種類」の左（見出し行は 320px でも1行・入りきらない分は「…」）／チップで除外する・やめる（その場で保存して計算し直す）／初期値と同じなら保存しない・何も除外しないなら {} ／「除外 ▾」／？の文面', async () => {
		for (const w of [320, 375]) {
			const sp = await openSp({ roster: FULL, w });
			await open(sp.page);
			const tag = 'オススメサポ段13C2 ' + w + 'px: ';
			const u0 = await exUi(sp.page);
			assert(u0.text === '除外：持久力回復・デバフ▾' && u0.on && u0.order === 'outside-exclude-btn,outside-types-btn,outside-count-btn' && u0.barH === 28 && u0.tops === 1 && u0.inside && u0.sw <= u0.iw,
				tag + '保存値の無いセット: 「除外：持久力回復・デバフ ▾」（濃色）が「種類」の左。見出し行は1行・28px（' + (u0.cut ? '「…」で切れている' : '全部入っている') + '）', u0);
			if (w === 320) { await sp.ctx.close(); continue; }
			await sp.page.click(M + '[data-usd-el="outside-exclude-btn"]');
			await sp.page.waitForSelector('[data-usd-el="outside-exclude-list"]');
			const p0 = await exPop(sp.page);
			const axes = await sp.page.evaluate(() => UmaSkillDeckCore.outside.filterAxes());
			assert(p0.axes.join() === axes.join() && p0.on.join() === 'effect:stamina,effect:debuff' && p0.ids === 0 && p0.helpHidden && !p0.clearDis, tag + '選択欄: 軸は段12 と同じ（距離・脚質・バ場を除く）・初期値の2つに印・id を持つ要素なし・「？」は閉じている', p0);
			await sp.page.click('[data-usd-el="outside-exclude-help"]');
			const p1 = await exPop(sp.page);
			assert(!p1.helpHidden && p1.help.join('|') === '選んだ値しか持たないスキルを、オススメから外します。ほかの値も持つスキルは外しません。', tag + '「？」の文面', p1.help);
			// 持久力回復の除外をやめる → 保存（{ effect: ['debuff'] }）・文字「除外：デバフ」・母集団に持久力回復だけのスキルが戻る
			await exChip(sp.page, 'effect', 'stamina');
			let d = await draft(sp.page);
			const u1 = await exUi(sp.page);
			assert(JSON.stringify(d.outsideOptions) === JSON.stringify({ exclude: { effect: ['debuff'] } }) && u1.text === '除外：デバフ▾' && (await exPop(sp.page)).on.join() === 'effect:debuff',
				tag + '持久力回復を押すと除外をやめ、その場で保存（exclude）・文字は「除外：デバフ」・選択欄は開いたまま', { d: d.outsideOptions, t: u1.text });
			// 戻す → 初期値と同じなので項目ごと消える
			await exChip(sp.page, 'effect', 'stamina');
			d = await draft(sp.page);
			assert(!('outsideOptions' in d) && (await exUi(sp.page)).text === '除外：持久力回復・デバフ▾', tag + 'もう一度押して初期値と同じに戻すと、保存値は消える（初期値で読む）', Object.keys(d));
			// すべて解除 → {} を保存・「除外 ▾」（濃色でない）
			await sp.page.click('[data-usd-el="outside-exclude-clear"]'); await settle(sp.page);
			d = await draft(sp.page);
			const u2 = await exUi(sp.page);
			assert(JSON.stringify(d.outsideOptions) === JSON.stringify({ exclude: {} }) && u2.text === '除外▾' && !u2.on && (await exPop(sp.page)).clearDis, tag + '「すべて解除」で何も除外しない（{} を保存して初期値と区別）・文字は「除外 ▾」', { d: d.outsideOptions, u2 });
			// 別の軸も除外できる
			await exChip(sp.page, 'phase', 'late');
			assert((await exUi(sp.page)).text === '除外：終盤▾' && JSON.stringify((await draft(sp.page)).outsideOptions) === JSON.stringify({ exclude: { phase: ['late'] } }), tag + 'フェーズ「終盤」も除外できる', (await exUi(sp.page)).text);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('オススメサポ段13C2 段12 の「絞り込み」（filter）の保存値は読まない・消さない／「除外」は条件で検索・②の数字には効かない', async () => {
		const old = Object.assign({}, FULL, { outsideOptions: { filter: { phase: ['late'] } } });
		const sp = await openSp({ roster: old });
		const r = await sp.page.evaluate((ro) => { const C = UmaSkillDeckCore.outside; return { a: C.populationOf(ro).ids.length, b: C.populationOf(Object.assign({}, ro, { outsideOptions: {} })).ids.length, ex: C.optionsOf(ro).exclude }; }, old);
		assert(r.a === r.b && JSON.stringify(r.ex) === JSON.stringify({ effect: ['stamina', 'debuff'] }), 'オススメサポ段13C2 段12 の filter（終盤）は読まない（母集団は保存値なしと同じ・除外は初期値）', r);
		await open(sp.page);
		await sp.page.click(M + '[data-usd-el="outside-exclude-btn"]');
		await exChip(sp.page, 'phase', 'mid');
		const d = await draft(sp.page);
		assert(JSON.stringify(d.outsideOptions.filter) === JSON.stringify({ phase: ['late'] }) && JSON.stringify(d.outsideOptions.exclude) === JSON.stringify({ effect: ['stamina', 'debuff'], phase: ['mid'] }), 'オススメサポ段13C2 除外を書いても、段12 の filter は消さない（ルール28）', d.outsideOptions);
		await sp.page.keyboard.press('Escape');
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		const pick = await sp.page.evaluate(async () => { document.querySelector('#deck-template-panel [data-usd-act="editor-pick"]').click(); await new Promise((res) => setTimeout(res, 200)); const v = Array.from(document.querySelectorAll('input[data-usd-el="filter-check"]:checked')).length; document.querySelector('[data-usd-act="picker-close"]').click(); return v; });
		assert(pick === 0, 'オススメサポ段13C2 条件で検索には何も選ばれていない（状態は混ざらない）', pick);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13C2 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
	/* ====================================================================
	 * C3〜C5: ②の一覧の2列・カード名の小窓の最初のタブ・金スキルの帯
	 * ==================================================================== */
	await block('オススメサポ段13C3 ②のスキルの一覧: 375px・414px は2列（段9 の1列を置き換え）・320px は1列／横にはみ出さない', async () => {
		const ids = master.filter((s) => whiteSet.has(s.id)).slice(0, 12).map((s) => s.id);
		for (const [w, cols] of [[320, 1], [375, 2], [414, 2]]) {
			const sp = await openSp({ roster: FULL, w, storage: { 'umaSkillDeck:draftScope:special': JSON.stringify({ skillIds: ids, name: '', updatedAt: 'x' }) } });
			const r = await sp.page.evaluate(() => {
				const panels = Array.from(document.querySelectorAll('#deck-template-panel .usd-skillgroup .usd-panels .usd-panel'));
				const lefts = new Set(panels.map((p) => Math.round(p.getBoundingClientRect().left)));
				const rows = new Set(panels.map((p) => Math.round(p.getBoundingClientRect().top)));
				const names = panels.map((p) => p.querySelector('.usd-panel-namebtn')).filter(Boolean);
				return { n: panels.length, cols: lefts.size, rows: rows.size, w: panels.length ? Math.round(panels[0].getBoundingClientRect().width) : 0, cut: names.filter((x) => x.scrollWidth > x.clientWidth + 4).length, sw: document.documentElement.scrollWidth, iw: window.innerWidth };   // 下線と余白で 1〜3px はみ出すので、4px を超えたら「…」で切れていると数える
			});
			assert(r.n === ids.length && r.cols === cols && r.rows === Math.ceil(r.n / cols) && r.sw <= r.iw, 'オススメサポ段13C3 ' + w + 'px: ' + cols + '列（' + r.n + '件・' + r.rows + '行・1件の幅 ' + r.w + 'px・名前が「…」で切れる件 ' + r.cut + '）', r);
			assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13C3 ' + w + 'px: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/** 開いている「イベント」「取得できるスキル」の小窓の様子 */
	const evPop = (page) => page.evaluate(() => {
		const panes = document.querySelector('[data-usd-el="events-panes"]');
		if (!panes) return null;
		const sw = document.querySelector('[data-usd-el="events-switch"]');
		const pr = panes.getBoundingClientRect();
		const right = panes.querySelector('[data-usd-el="events-pane-skills"]').getBoundingClientRect();
		const probe = (css) => { const e = document.createElement('i'); e.style.cssText = css; document.body.appendChild(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; };
		const rows = Array.from(panes.querySelectorAll('[data-usd-el="ev-skill"]'));
		return { swipe: panes.scrollWidth > panes.clientWidth + 1, skillsShown: Math.abs(right.left - pr.left) < 2, switchText: sw ? sw.textContent : null,
			gold: rows.filter((li) => li.getAttribute('data-usd-gold') === '1').map((li) => ({ id: li.getAttribute('data-skill-id'), bg: getComputedStyle(li).backgroundColor })),
			plainBg: rows.filter((li) => li.getAttribute('data-usd-gold') !== '1').map((li) => getComputedStyle(li).backgroundColor), goldVar: probe('background-color: var(--uma-stitch-soft)'), n: rows.length };
	});
	const rarity = new Map(ptReal.entries.map((e) => [e.skillId, e.rarity]));

	await block('オススメサポ段13C4・C5 カード名の小窓: ②（オススメサポ）から開くと「取得できるスキル」から・①から開くと今のまま「イベント」から（375px）／金スキルの行に金色の帯（①の表の金の行と同じ変数）・①②とも', async () => {
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		// ②（オススメサポ）: 金スキルを得るカードを探して開く
		const cards = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card-main"]')).map((b) => b.getAttribute('data-card-id')));
		let a = null;
		for (const id of cards) {
			await sp.page.click(M + '[data-usd-el="outside-card-main"][data-card-id="' + id + '"]');
			await sp.page.waitForSelector('[data-usd-el="events-panes"]');
			await sp.page.waitForTimeout(150);
			a = await evPop(sp.page);
			if (a.gold.length > 0) break;
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(150);
		}
		assert(a && a.swipe && a.skillsShown && a.switchText === '‹ イベント', 'オススメサポ段13C4 ②から開くと、最初に「取得できるスキル」が見えている（切り替えのボタンは「‹ イベント」）', a && { swipe: a.swipe, shown: a.skillsShown, sw: a.switchText });
		assert(a && a.gold.length > 0 && a.gold.every((g) => rarity.get(g.id) === 'gold' && g.bg === a.goldVar) && a.plainBg.every((bg) => bg !== a.goldVar) && a.n > a.gold.length,
			'オススメサポ段13C5 ②から開いた小窓: 金スキルの行（' + (a ? a.gold.length : 0) + '件）だけ金色の帯（--uma-stitch-soft）。ほかの行は帯なし', a && { gold: a.gold, goldVar: a.goldVar });
		await sp.page.keyboard.press('Escape');
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		// ①: 列見出しの番号（イベントを選ぶ）から開く
		await sp.page.evaluate(() => selectStepTab(0, { noSave: true }));
		await sp.page.waitForTimeout(250);
		const keys = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-act="events"]')).map((b) => b.getAttribute('data-member-key')));
		let b = null, anyGold = null;
		for (const k of keys) {
			await sp.page.click('#deck-roster-panel [data-usd-act="events"][data-member-key="' + k + '"]');
			await sp.page.waitForSelector('[data-usd-el="events-panes"]');
			await sp.page.waitForTimeout(150);
			const x = await evPop(sp.page);
			if (!b) b = x;
			if (x.gold.length > 0) { anyGold = x; break; }
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(150);
		}
		assert(b && b.swipe && !b.skillsShown && b.switchText === 'スキル ›', 'オススメサポ段13C4 ①から開くと、今のまま「イベント」から（切り替えのボタンは「スキル ›」）', b && { shown: b.skillsShown, sw: b.switchText });
		if (anyGold) assert(anyGold.gold.every((g) => rarity.get(g.id) === 'gold' && g.bg === anyGold.goldVar), 'オススメサポ段13C5 ①から開いた小窓でも、金スキルの行に同じ金色の帯', anyGold.gold);
		else console.log('     [記録] ①の小窓（この編成）に金スキルを得るカードが無いので、①側の帯は ②と同じ部品（eventSkillRowEl）であることだけで確かめた');
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13C4・C5 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
	/* ====================================================================
	 * 段13 の仕上げ: 説明文の折り返し・「解除」・「オススメサポαテスト」
	 * ==================================================================== */
	/** 開いている「取得できるスキル」の説明文の様子（右のペインを見せてから測る） */
	const descInfo = (page) => page.evaluate(() => {
		const panes = document.querySelector('[data-usd-el="events-panes"]');
		const right = panes.querySelector('[data-usd-el="events-pane-skills"]');
		const rr = right.getBoundingClientRect();
		const ds = Array.from(right.querySelectorAll('[data-usd-el="ev-skill-desc"]')).filter((d) => d.textContent.trim().length > 0);
		return { n: ds.length, ws: ds.map((d) => getComputedStyle(d).whiteSpace), over: ds.filter((d) => d.scrollWidth > d.clientWidth + 1 || d.getBoundingClientRect().right > rr.right + 1).length,
			multi: ds.filter((d) => d.getBoundingClientRect().height > parseFloat(getComputedStyle(d).lineHeight) * 1.5).length, swipe: panes.scrollWidth > panes.clientWidth + 1 };
	});
	await block('オススメサポ段13仕上げ 説明文: 「取得できるスキル」の説明文は小窓の幅で折り返して全文を出す（右端で切れない）／②から開いても①から開いても同じ（375px）', async () => {
		const sp = await openSp({ roster: FULL });
		await open(sp.page);
		const ids = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card-main"]')).map((b) => b.getAttribute('data-card-id')));
		let all2 = { n: 0, over: 0, multi: 0, ws: [] };
		for (const id of ids) {
			await sp.page.click(M + '[data-usd-el="outside-card-main"][data-card-id="' + id + '"]');
			await sp.page.waitForSelector('[data-usd-el="events-panes"]');
			await sp.page.waitForTimeout(300);
			const d = await descInfo(sp.page);
			all2 = { n: all2.n + d.n, over: all2.over + d.over, multi: all2.multi + d.multi, ws: all2.ws.concat(d.ws) };
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(150);
		}
		assert(all2.n > 0 && all2.over === 0 && all2.multi > 0 && all2.ws.every((w) => w === 'normal'), 'オススメサポ段13仕上げ ②から開いた小窓（' + ids.length + '枚）: 説明文 ' + all2.n + '件がどれも小窓の幅に収まり、長いもの（' + all2.multi + '件）は折り返す', all2);
		await sp.page.click(M + '[data-usd-act="outside-close"]');
		await sp.page.evaluate(() => selectStepTab(0, { noSave: true }));
		await sp.page.waitForTimeout(250);
		const keys = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-act="events"]')).map((b) => b.getAttribute('data-member-key')));
		let all1 = { n: 0, over: 0, multi: 0, ws: [] };
		for (const k of keys) {
			await sp.page.click('#deck-roster-panel [data-usd-act="events"][data-member-key="' + k + '"]');
			await sp.page.waitForSelector('[data-usd-el="events-panes"]');
			await sp.page.click('[data-usd-el="events-switch"]');
			await sp.page.waitForTimeout(500);
			const d = await descInfo(sp.page);
			all1 = { n: all1.n + d.n, over: all1.over + d.over, multi: all1.multi + d.multi, ws: all1.ws.concat(d.ws) };
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(150);
		}
		assert(all1.n > 0 && all1.over === 0 && all1.ws.every((w) => w === 'normal'), 'オススメサポ段13仕上げ ①から開いた小窓（' + keys.length + '件）でも、説明文 ' + all1.n + '件が小窓の幅に収まる（折り返す ' + all1.multi + '件）', all1);
		assert(jsErrors(sp.errors).length === 0, 'オススメサポ段13仕上げ コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('オススメサポ段13仕上げ 表記: 入口と小窓の見出しは「オススメサポαテスト」（375・320px で入口の列は1行・見出しの行は崩れない）／指定したカードのタイルは「解除」・オススメのカードは「外す」', async () => {
		for (const w of [375, 320]) {
			const sp = await openSp({ roster: FULL, w });
			const e = await sp.page.evaluate(() => { const row = document.querySelector('#deck-template-panel .usd-entry-row'); const b = row.querySelector('[data-usd-el="outside-open"]'); const btns = Array.from(row.children);
				return { text: b.textContent.trim(), tops: new Set(btns.map((x) => Math.round(x.getBoundingClientRect().top))).size, bh: Math.round(b.getBoundingClientRect().height), wrap: getComputedStyle(row).flexWrap, sw: document.documentElement.scrollWidth, iw: window.innerWidth }; });
			await open(sp.page);
			const m = await sp.page.evaluate(() => { const head = document.querySelector('[data-usd-el="outside-modal"] .usd-out-head'); const t = head.querySelector('[data-usd-el="outside-title"]'); const help = head.querySelector('[data-usd-el="outside-help"]'); const x = head.querySelector('[data-usd-el="outside-close"]');
				const c = (el) => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2);
				return { text: t.textContent, lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)), mid: Math.abs(c(t) - c(x)) <= 3 && Math.abs(c(help) - c(x)) <= 3, headH: Math.round(head.getBoundingClientRect().height), label: document.querySelector('[data-usd-el="outside-modal"] .usd-out-panel').getAttribute('aria-label') }; });
			const tag = 'オススメサポ段13仕上げ ' + w + 'px: ';
			assert(e.text === 'オススメサポαテスト' && e.tops === 1 && e.wrap === 'nowrap' && e.bh <= 32 && e.sw <= e.iw, tag + '入口のボタンは「オススメサポαテスト」。入口の列は1行のまま（横に送る）', e);
			assert(m.text === 'オススメサポαテスト' && m.lines === 1 && m.mid && m.label === 'オススメサポαテスト', tag + '小窓の見出しは「オススメサポαテスト」で1行。？と×と同じ行（見出しの行の高さ ' + m.headH + 'px）', m);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		const sp = await openSp({ roster: Object.assign({}, FULL, { outsideOptions: { count: 5, pinned: ['card-0300'] } }) });
		await open(sp.page);
		const t = await sp.page.evaluate(() => ({ pinned: Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-unpin"]')).map((b) => b.textContent),
			rec: Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-exclude"]')).map((b) => b.textContent) }));
		assert(t.pinned.join() === '解除' && t.rec.length === 5 && t.rec.every((x) => x === '外す'), 'オススメサポ段13仕上げ 指定したカードのタイルは「解除」、オススメで選ばれたカードのタイルは「外す」のまま', t);
		await sp.ctx.close();
	});
}
