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
	const FULLSYN = { umaId: 'uma-0001', cardIds: SYN_ROSTER, skillFilter: FILTER };
	const mkCard = (id, chara, rarity, order, skills) => ({ id, title: '二つ名' + id, charaName: chara, type: TYPE_NAMES[order - 1], typeOrder: order, rarity, isGroup: false,
		hintSkills: skills.map((s) => ({ skillId: s, name: 'x' })), dataStatus: { hint: 'done' } });
	let POOL = null;
	/** 合成のカードに使う白スキル（実データの母集団から、前段の関係が無いもの）。除外の初期値（デバフ・持久力回復）に当たらないものだけ */
	const needPool = async () => {
		if (POOL) return POOL;
		const probe = await openSp({ roster: FULL });
		POOL = await probe.page.evaluate((f) => {
			const C = UmaSkillDeckCore;
			return C.outside.populationOf({ umaId: 'uma-0001', cardIds: [], skillFilter: f }).ids.map((id) => [id, C.getSkillTags(id)]);
		}, FILTER);
		await probe.ctx.close();
		POOL = POOL.filter(([id]) => masterIds.has(id) && whiteSet.has(id) && !linked.has(id)).map(([id, t]) => ({ id, tags: t }));
		return POOL;
	};
	/** 合成のデータ。cands: [[id, chara, rarity, typeOrder, [skillId…]]…] */
	const synOf = (cands) => {
		const roster = SYN_ROSTER.map((id, i) => [id, 'ロスター' + i, 'SR', (i % 5) + 1, []]);
		const all = cands.concat(roster).map((c) => mkCard.apply(null, c));
		return { cards: all, events: all.map((c) => ({ cardId: c.id, status: 'done', chain: [] })) };
	};

	await block('オススメサポ段13A2・A3 満たせないとき: 候補そのものが足りない種類は「足りない種類：…」／種類ごとには足りているのに組み合わせで満たせないときは1行だけ／どちらもカードの欄とチェックリストの空白を出さない', async () => {
		const S = (await needPool()).map((x) => x.id);
		// スピード2キャラクター・スタミナ2キャラクター（どれも同じキャラクターが2つの種類のカードを持つ＝種類ごとには2人ずつ居るが、4枚は選べない）
		const syn = synOf([
			['syn-A1', 'テストA', 'SSR', 1, S.slice(0, 3)], ['syn-A2', 'テストA', 'SSR', 2, S.slice(3, 6)],
			['syn-B1', 'テストB', 'SSR', 1, S.slice(6, 9)], ['syn-B2', 'テストB', 'SSR', 2, S.slice(9, 12)],
			['syn-C', 'テストC', 'SR', 3, S.slice(12, 14)], ['syn-D', 'テストD', 'SR', 4, S.slice(14, 16)], ['syn-E', 'テストE', 'SR', 5, S.slice(16, 18)]
		]);
		const sp = await openSp({ roster: Object.assign({}, FULLSYN, { outsideOptions: { count: 4, typeMin: { 1: 2, 2: 2 } } }), syn });
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
			return { text: e ? Array.from(e.children).map((x) => x.textContent) : null, gapHeadToList: Math.round(list.top - head.bottom), listH: Math.round(list.height), noteH: p ? Math.round(p.height) : null,
				cardsH: Math.round(cr.height), cardsShown: getComputedStyle(cards).display !== 'none', foot: m.querySelector('[data-usd-el="outside-foot"]').hidden };
		});
		await sp.page.click(T + OPEN); await settle(sp.page);
		const v1 = await view();
		assert(v1.text && v1.text.length === 1 && v1.text[0] === 'この組み合わせでは指定を満たせません' && v1.foot, 'オススメサポ段13A2 画面（組み合わせで満たせない）: 種類を並べず「この組み合わせでは指定を満たせません」の1行だけ', v1);
		assert(v1.gapHeadToList <= 16 && v1.listH <= v1.noteH + 4, 'オススメサポ段13A3 見出しの行のすぐ下に文（間 ' + v1.gapHeadToList + 'px）・文の箱は文の高さ（' + v1.listH + 'px）。カードの欄の空白（120px）とチェックリストの高さ（268px）を取らない', v1);
		await close(sp.page);
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ typeMin: { 2: 3 } }));
		await sp.page.click(T + OPEN); await settle(sp.page);
		const v2 = await view();
		assert(v2.text && v2.text.join('|') === '指定を満たす組み合わせがありません|足りない種類：スタミナ' && v2.gapHeadToList <= 16 && v2.listH <= v2.noteH + 4,
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
}
