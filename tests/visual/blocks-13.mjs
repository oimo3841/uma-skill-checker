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
}
