// オススメサポのピン止めの計算（C-247・2026-10-30。計算だけ。ピンのボタン・保存・画面は次の作業）の検査。
// run-smoke.mjs の末尾から register73() で呼ばれる（塊の見出しはすべて「ピン計算」で始まる。`npm run test:visual -- --only=ピン計算` で回せる）。
//
// 決め（おいもさん・2026-10-30）:
//  (1) ピン止めしたスキルは、必ず取得候補に含めて計算する（含められるカードの組み合わせだけを探す）。
//  (2) 除外（小窓の「除外」・このセットだけの個別除外・距離の区分ごとの個別除外・レースを選んでいないときのレース条件のスキル）に当たるピンは、母集団に入れ直す（除外の設定は変えない）。
//  (3) 金スキル・①の絞り込みに合わない・①で取得・①でOFF・選択中のレースの条件に合わない・②で追加済み・候補のカードの除外 には入れ直さない。
//  (4) 入れ直せなかったピンは理由を返す（内部の値: taken・distance・style・surface・off・race・added・none〔組み合わせがない〕。ほかに gold・unknown）。
//  (5) 含められる組み合わせが無いときは探索せず、pinInfeasible と、そのピン（理由 none）を返す。
//  (6) 判定は探索とは別の関数（pinFeasible・pinCheck。案A）。表示中の結果の問題を持つ口（heldProblem）。
// 期待値（R1〜R3 の点数・カードの並び）は、変更の前の版（d499a61）を node で回して取った値（ピンが空なら変わらないことを見る。実データに敏感）。
// スキル名は検査の側に書かない（恒久ルール1。id はデータ・計算の結果から引く）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register73(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS = ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'];
	const ROSTERS = {
		R1: { umaId: 'uma-0179', cardIds: CARDS, skillFilter: {} },
		R2: { umaId: 'uma-0179', cardIds: CARDS, skillFilter: { distance: 'long', style: 'oikomi', surface: 'turf' } },
		R3: { umaId: 'uma-0179', cardIds: CARDS, skillFilter: { distance: 'short', style: 'nige', surface: 'dirt' } }
	};
	// 変更の前（d499a61）の結果（5枚・既定の除外・②は空・締め切り 30 秒）
	const BEFORE = {
		R1: { score: 78, cards: ['card-0559', 'card-0534', 'card-0538', 'card-0543', 'card-0554'] },
		R2: { score: 44, cards: ['card-0554', 'card-0544', 'card-0488', 'card-0546', 'card-0251'] },
		R3: { score: 53, cards: ['card-0534', 'card-0509', 'card-0538', 'card-0359', 'card-0557'] }
	};

	const openSp = async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, EMPTY);
		await sp.page.evaluate(() => { localStorage.removeItem('umaSkillDeck:draftRoster:special'); localStorage.setItem('umaSkillDeck:stepTab', '1'); });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => {
			await UmaSkillDeckCore.loadMasterSkills(); await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData();
			try { await UmaSkillDeckCore.loadSkillEffectLevels(); } catch (e) { /* 低効果は読めなくてもよい */ }
		});
		// 検査の中で使う部品（ページに置く）
		await sp.page.evaluate(() => {
			const C = UmaSkillDeckCore.outside;
			const strip = (r) => { const o = JSON.parse(JSON.stringify(r)); if (o && o.stats) delete o.stats.ms; return o; };
			const solve = (a) => C.solveSync(Object.assign({ addedSkillIds: [], deadlineMs: 30000 }, a));
			// 母集団（除外なし）にいて、カードで得られる（ピンにすると含められる）スキルを、list から先頭 n 個
			const obtainable = (roster, list, n, extra) => {
				const out = [];
				for (const id of list) {
					if (out.length >= n) break;
					const r = solve(Object.assign({ roster, pinSkillIds: [id] }, extra || {}));
					if (r.ok && !r.pinInfeasible && r.skills.some((s) => s.skillId === id && s.pinned)) out.push(id);
				}
				return out;
			};
			window.__pin = { C, strip, solve, obtainable };
		});
		return sp;
	};

	await block('ピン計算(1) ピンが空のとき: 代表の3編成（R1〜R3）で、カード・点数・並びが変更の前と同じ／pinSkillIds: [] でも結果は1バイトも変わらない（pins・pinned を足さない）／母集団も同じ形', async () => {
		const sp = await openSp();
		const r = await sp.page.evaluate(({ rosters }) => {
			const { C, strip, solve } = window.__pin;
			const out = {};
			Object.keys(rosters).forEach((k) => {
				const a = solve({ roster: rosters[k] });
				const b = solve({ roster: rosters[k], pinSkillIds: [] });
				const pa = C.populationOf(rosters[k], {}), pb = C.populationOf(rosters[k], { pins: [] });
				const popKeys = (p) => Object.keys(p).sort().join();
				out[k] = { score: a.score, cards: a.cards.map((c) => c.cardId), partial: a.partial, same: JSON.stringify(strip(a)) === JSON.stringify(strip(b)),
					noPinKeys: !('pins' in a) && !('pinInfeasible' in a) && a.skills.every((s) => !('pinned' in s)),
					popSame: popKeys(pa) === popKeys(pb) && JSON.stringify(pa.ids) === JSON.stringify(pb.ids) && !('pinIds' in pa) };
			});
			return out;
		}, { rosters: ROSTERS });
		Object.keys(BEFORE).forEach((k) => {
			assert(r[k].score === BEFORE[k].score && JSON.stringify(r[k].cards) === JSON.stringify(BEFORE[k].cards) && !r[k].partial,
				'ピン計算(1) ' + k + ': ピンが空の結果が変更の前と同じ（点数 ' + BEFORE[k].score + '・カード5枚の並び）', r[k]);
			assert(r[k].same && r[k].noPinKeys && r[k].popSame, 'ピン計算(1) ' + k + ': pinSkillIds: [] でも結果・母集団の形が同じ（pins・pinned・pinIds を足さない）', r[k]);
		});
		assert(jsErrors(sp.errors).length === 0, 'ピン計算(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン計算(2) ピンを含む結果: 一覧から選んだピン・除外に当たるピン（小窓の除外・このセットだけの個別除外・距離の区分ごとの個別除外・レースを選んでいないときのレース条件）が、すべて結果に入る（pinned の印・restored）', async () => {
		const sp = await openSp();
		const r = await sp.page.evaluate(({ R1, R2 }) => {
			const { C, solve, obtainable } = window.__pin;
			const base = solve({ roster: R1 });
			const baseIds = base.skills.map((s) => s.skillId);
			const top = new Set(base.cards[0].skillIds);
			// 一覧から: 先頭のカード以外のカードの行から2つ・先頭のカードの行から1つ
			const listPins = baseIds.filter((id) => !top.has(id)).slice(0, 2).concat(baseIds.filter((id) => top.has(id)).slice(0, 1));
			const list = solve({ roster: R1, pinSkillIds: listPins });
			// 小窓の「除外」（既定の4つ）に当たるもの
			const pop = C.populationOf(R1, {});
			const exPin = obtainable(R1, pop.optionExcludedIds, 1)[0];
			// レースを選んでいないときのレース条件のスキル（C-185）
			const noRacePin = obtainable(R1, pop.noRaceExcludedIds, 1)[0];
			// このセットだけの個別除外（roster.outsideSkillExcluded）: 結果の行の1つを外す
			const skipId = baseIds.filter((id) => !top.has(id) && listPins.indexOf(id) === -1)[0];
			const R1skip = Object.assign({}, R1, { outsideSkillExcluded: [skipId] });
			const skipNo = solve({ roster: R1skip });
			const skipPin = solve({ roster: R1skip, pinSkillIds: [skipId] });
			// 距離の区分ごとの個別除外（userData の recommendExcluded。R2 は長距離）
			const key = C.recommendExcluded.keyOf(R2);
			const base2 = solve({ roster: R2 });
			const userId = base2.skills.map((s) => s.skillId)[1];
			C.recommendExcluded.set(key, userId, true, { quiet: true, silent: true });
			const userNo = solve({ roster: R2 });
			const userPin = solve({ roster: R2, pinSkillIds: [userId] });
			// 4種類まとめて（R1。個別除外つき）
			const all = solve({ roster: R1skip, pinSkillIds: [exPin, noRacePin, skipId] });
			const has = (res, id) => res.skills.some((s) => s.skillId === id && s.pinned === true);
			return {
				listPins, listOk: listPins.every((id) => has(list, id)) && list.skills.filter((s) => s.pinned).length === listPins.length && JSON.stringify(list.pins.ids) === JSON.stringify(listPins),
				listScore: list.score, baseScore: base.score, listRestored: list.pins.restored, listRejected: list.pins.rejected,
				exPin, exIn: pop.optionExcludedIds.indexOf(exPin) !== -1 && !base.skills.some((s) => s.skillId === exPin), exPinRes: exPin ? (() => { const x = solve({ roster: R1, pinSkillIds: [exPin] }); return { has: has(x, exPin), restored: x.pins.restored }; })() : null,
				noRacePin, noRaceRes: noRacePin ? (() => { const x = solve({ roster: R1, pinSkillIds: [noRacePin] }); return { has: has(x, noRacePin), restored: x.pins.restored }; })() : null,
				skipId, skipNoHas: skipNo.skills.some((s) => s.skillId === skipId), skipPinHas: has(skipPin, skipId), skipRestored: skipPin.pins.restored,
				userId, userNoHas: userNo.skills.some((s) => s.skillId === userId), userPinHas: has(userPin, userId), userRestored: userPin.pins.restored,
				all: { has: [exPin, noRacePin, skipId].every((id) => has(all, id)), ids: all.pins.ids, restored: all.pins.restored, partial: all.partial, pinInfeasible: !!all.pinInfeasible }
			};
		}, { R1: ROSTERS.R1, R2: ROSTERS.R2 });
		assert(r.listPins.length === 3 && r.listOk && r.listRestored.length === 0 && r.listRejected.length === 0, 'ピン計算(2) 一覧から選んだ3つのピンがすべて結果に入り、pinned の印・pins.ids（押した順）', r);
		assert(r.listScore === r.baseScore, 'ピン計算(2) 一覧から選んだピンなら点数はピンなしと同じ（その組がすでにピンを持つ）', { list: r.listScore, base: r.baseScore });
		assert(!!r.exPin && r.exIn && r.exPinRes.has && JSON.stringify(r.exPinRes.restored) === JSON.stringify([r.exPin]), 'ピン計算(2) 小窓の「除外」（既定の4つ）に当たるピンが結果に入り、restored に出る', r);
		assert(!!r.noRacePin && r.noRaceRes.has && JSON.stringify(r.noRaceRes.restored) === JSON.stringify([r.noRacePin]), 'ピン計算(2) レースを選んでいないときのレース条件のスキル（C-185）のピンが結果に入る', r);
		assert(!!r.skipId && !r.skipNoHas && r.skipPinHas && JSON.stringify(r.skipRestored) === JSON.stringify([r.skipId]), 'ピン計算(2) このセットだけの個別除外に当たるピンが結果に入る（ピンなしでは入らない）', r);
		assert(!!r.userId && !r.userNoHas && r.userPinHas && JSON.stringify(r.userRestored) === JSON.stringify([r.userId]), 'ピン計算(2) 距離の区分ごとの個別除外に当たるピンが結果に入る（ピンなしでは入らない）', r);
		assert(r.all.has && r.all.ids.length === 3 && r.all.restored.length === 3 && !r.all.partial && !r.all.pinInfeasible, 'ピン計算(2) 3種類の除外に当たるピンをまとめても、すべて結果に入る', r.all);
		assert(jsErrors(sp.errors).length === 0, 'ピン計算(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン計算(3) 除外の設定・個別除外は変わらない: ピンで入れ直しても roster.outsideOptions・outsideSkillExcluded・userData の recommendExcluded は1バイトも変わらず、ピンなしの計算・母集団は今までどおり除外する', async () => {
		const sp = await openSp();
		const r = await sp.page.evaluate(({ R1, R2 }) => {
			const { C, solve, strip } = window.__pin;
			const base = solve({ roster: R1 });
			const ids = base.skills.map((s) => s.skillId);
			const key = C.recommendExcluded.keyOf(R1);
			C.recommendExcluded.set(key, ids[2], true, { quiet: true, silent: true });
			const roster = Object.assign({}, R1, { outsideOptions: { exclude: { effect: ['debuff'], extra: ['lowEffect'] } }, outsideSkillExcluded: [ids[3]] });
			const snapRoster = JSON.stringify(roster);
			const snapUd = localStorage.getItem('umaSkillDeck:userData');
			const pop0 = C.populationOf(roster, {});
			const before = strip(solve({ roster }));
			const pins = [ids[2], ids[3]].concat(pop0.optionExcludedIds.slice(0, 2));
			const withPins = solve({ roster, pinSkillIds: pins });
			const popPins = C.populationOf(roster, { pins });
			const after = strip(solve({ roster }));
			const pop1 = C.populationOf(roster, {});
			return {
				rosterSame: JSON.stringify(roster) === snapRoster, udSame: localStorage.getItem('umaSkillDeck:userData') === snapUd,
				optsSame: JSON.stringify(C.optionsOf(roster)) === JSON.stringify(C.optionsOf(JSON.parse(snapRoster))),
				solveSame: JSON.stringify(before) === JSON.stringify(after), popSame: JSON.stringify(pop0.ids) === JSON.stringify(pop1.ids),
				excludedStill: pop1.ids.indexOf(ids[2]) === -1 && pop1.ids.indexOf(ids[3]) === -1 && pop0.optionExcludedIds.slice(0, 2).every((id) => pop1.ids.indexOf(id) === -1),
				pinPopHas: pins.every((id) => popPins.ids.indexOf(id) !== -1), restored: popPins.pinRestoredIds,
				pinResultOk: !!withPins.pins && withPins.pins.ids.length + withPins.pins.rejected.length === pins.length
			};
		}, { R1: ROSTERS.R1, R2: ROSTERS.R2 });
		assert(r.rosterSame && r.udSame && r.optsSame, 'ピン計算(3) ピンの計算のあとも、編成（outsideOptions・outsideSkillExcluded）と userData（recommendExcluded）が1バイトも変わらない', r);
		assert(r.solveSame && r.popSame && r.excludedStill, 'ピン計算(3) ピンの計算のあとも、ピンなしの計算・母集団は今までどおり除外する', r);
		assert(r.pinPopHas && r.restored.length === 4 && r.pinResultOk, 'ピン計算(3) 入れ直しはピンの計算の中だけ（ピンを渡した母集団にだけ入り、restored に4つ）', r);
		assert(jsErrors(sp.errors).length === 0, 'ピン計算(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン計算(4) 入れ直さないもの: ①で取得・距離／脚質／バ場が合わない・①でOFF・レース条件に合わない・②で追加済み・金スキル・候補のカードの除外 のピンは結果に入らず、理由（taken・distance・style・surface・off・race・added・gold・none）が返る', async () => {
		const sp = await openSp();
		const r = await sp.page.evaluate(({ R1, races }) => {
			const { C, solve } = window.__pin;
			const reasonOf = (roster, id, extra) => { const x = solve(Object.assign({ roster, pinSkillIds: [id] }, extra || {})); const rj = (x.pins && x.pins.rejected) || [];
				return { reason: rj.length === 1 && rj[0].skillId === id ? rj[0].reason : null, pinnedRow: x.skills.some((s) => s.skillId === id && s.pinned), ids: x.pins ? x.pins.ids : null, cards: x.cards.length, pinInfeasible: !!x.pinInfeasible }; };
			const out = {};
			const pop = C.populationOf(R1, { exclude: {} });
			// ①で取得（母集団の元にあるもの＝一覧に出うるもの。元に無いものも理由は taken）
			const poolIds = new Set(C.populationOf({}, { exclude: {} }).ids);
			const takenInPool = pop.takenIds.find((id) => poolIds.has(id));
			out.taken = Object.assign({ id: takenInPool }, reasonOf(R1, takenInPool));
			out.takenOut = Object.assign({ id: pop.takenIds.find((id) => !poolIds.has(id)) || null }, reasonOf(R1, pop.takenIds.find((id) => !poolIds.has(id)) || pop.takenIds[0]));
			// ①でOFF（①で取得するスキルの1つを OFF にした編成）
			const offId = pop.takenIds.find((id) => { const p = C.populationOf(Object.assign({}, R1, { offSkillIds: [id] }), { exclude: {}, pins: [id] }); return p.pinRejected[0] && p.pinRejected[0].reason === 'off'; });
			out.off = Object.assign({ id: offId || null }, offId ? reasonOf(Object.assign({}, R1, { offSkillIds: [offId] }), offId) : {});
			// ①の絞り込み（軸ごと）
			[['distance', 'long'], ['style', 'oikomi'], ['surface', 'turf']].forEach(([axis, v]) => {
				const roster = Object.assign({}, R1, { skillFilter: { [axis]: v } });
				const p = C.populationOf(roster, { exclude: {} });
				const set = new Set(p.ids.concat(p.raceExcludedIds, p.noRaceExcludedIds, p.recommendExcludedIds, p.optionExcludedIds));
				const id = pop.ids.find((x) => !set.has(x) && p.takenIds.indexOf(x) === -1 && p.offIds.indexOf(x) === -1);
				out[axis] = Object.assign({ id: id || null }, id ? reasonOf(roster, id) : {});
			});
			// 選択中のレースの条件に合わない
			let raceRow = null, raceId = null;
			for (const row of races) { const p = C.populationOf(Object.assign({}, R1, { race: row }), { exclude: {} }); if (p.raceExcludedIds.length > 0) { raceRow = row; raceId = p.raceExcludedIds[0]; break; } }
			out.race = Object.assign({ id: raceId }, raceRow ? reasonOf(Object.assign({}, R1, { race: raceRow }), raceId) : {});
			// ②で追加済み（結果の行の1つを②に入れた）
			const base = solve({ roster: R1 });
			const addedId = base.skills[0].skillId;
			const ad = solve({ roster: R1, pinSkillIds: [addedId], addedSkillIds: [addedId] });
			out.added = { id: addedId, reason: ad.pins.rejected[0] && ad.pins.rejected[0].reason, row: ad.skills.find((s) => s.skillId === addedId) || null };
			// 金スキル
			const goldId = base.golds[0].skillId;
			out.gold = Object.assign({ id: goldId }, reasonOf(R1, goldId));
			// 候補のカードの除外（そのスキルを得られるカードを全部外す＝カードの指定がピンより優先）
			const pinId = base.skills.find((s) => s.cardIds.length === 1 && !s.added).skillId;
			const prob = C.build({ roster: R1, addedSkillIds: [] });
			// そのスキルを得られる候補のカード（ヒント・連続イベント・キャラクター共通のイベントのどれかの選択肢。金を得たら前段の白も）
			const holdersAll = prob.cands.filter((c) => {
				const src = prob.cardSrc.get(c.id);
				const ids = src.hint.slice();
				src.events.concat(prob.commonSrc.get(c.charaName) || []).forEach((ev) => ev.alts.forEach((al) => al.forEach((id) => ids.push(id))));
				return prob.expandIds(ids).has(pinId);
			}).map((c) => c.id);
			const ex =solve({ roster: Object.assign({}, R1, { outsideCardExcluded: holdersAll }), pinSkillIds: [pinId] });
			out.card = { id: pinId, holders: holdersAll.length, reason: ex.pins.rejected[0] && ex.pins.rejected[0].reason, pinInfeasible: !!ex.pinInfeasible, cards: ex.cards.length, skills: ex.skills.length };
			// 入れ直せないピンだけなら、計算はピンなしと同じ点数（ピンを効かせない）
			const mixed = solve({ roster: R1, pinSkillIds: [pop.takenIds[0], goldId] });
			out.mixed = { score: mixed.score, base: base.score, ids: mixed.pins.ids, rejected: mixed.pins.rejected.map((x) => x.reason) };
			return out;
		}, { R1: ROSTERS.R1, races: await sp.page.evaluate(async () => { const res = await fetch('data/upcoming-races.json'); const j = await res.json(); return j.races; }) });
		const want = { taken: 'taken', takenOut: 'taken', off: 'off', distance: 'distance', style: 'style', surface: 'surface', race: 'race', gold: 'gold' };
		Object.keys(want).forEach((k) => {
			assert(!!r[k].id && r[k].reason === want[k] && !r[k].pinnedRow && Array.isArray(r[k].ids) && r[k].ids.length === 0 && !r[k].pinInfeasible && r[k].cards > 0,
				'ピン計算(4) ' + k + ': ピンが結果に入らず、理由 ' + want[k] + ' が返る（計算はピンなしで続く）', r[k]);
		});
		assert(r.added.reason === 'added' && r.added.row && r.added.row.added === true && !('pinned' in r.added.row), 'ピン計算(4) ②で追加済みのピンは効かせない（理由 added・行は追加済みのまま・pinned の印なし）', r.added);
		assert(r.card.holders >= 1 && r.card.reason === 'none' && r.card.pinInfeasible && r.card.cards === 0 && r.card.skills === 0, 'ピン計算(4) 候補のカードの除外はピンより優先（得られるカードを全部外すと、理由 none・組み合わせなし）', r.card);
		assert(r.mixed.score === r.mixed.base && r.mixed.ids.length === 0 && JSON.stringify(r.mixed.rejected) === JSON.stringify(['taken', 'gold']), 'ピン計算(4) 入れ直せないピンだけなら、計算はピンなしと同じ点数（理由は押した順）', r.mixed);
		assert(jsErrors(sp.errors).length === 0, 'ピン計算(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン計算(5) 途中の結果（setDeadline を 0 にする）でも、ピンがすべて結果に入る（判定の組を出発点にするため）', async () => {
		const sp = await openSp();
		const r = await sp.page.evaluate(async ({ R1, R2 }) => {
			const { C, solve, obtainable } = window.__pin;
			const out = [];
			C.setDeadline(0);
			try {
				for (const roster of [R1, R2]) {
					const pop = C.populationOf(roster, {});
					const pins = obtainable(roster, pop.optionExcludedIds.concat(pop.noRaceExcludedIds), 3);
					const a = C.solveSync({ roster, addedSkillIds: [], pinSkillIds: pins });
					const b = await C.solve({ roster, addedSkillIds: [], pinSkillIds: pins });
					const has = (x) => pins.every((id) => x.skills.some((s) => s.skillId === id && s.pinned));
					out.push({ pins, syncPartial: a.partial, syncHas: has(a), asyncPartial: b.partial, asyncHas: has(b), cards: a.cards.length });
				}
			} finally { C.setDeadline(null); }
			return out;
		}, { R1: ROSTERS.R1, R2: ROSTERS.R2 });
		r.forEach((x, i) => {
			assert(x.pins.length === 3 && x.syncPartial && x.asyncPartial && x.syncHas && x.asyncHas && x.cards === 5,
				'ピン計算(5) ' + ['R1', 'R2'][i] + ': 締め切り 0 の途中の結果（同期・非同期）でも、除外から戻した3つのピンがすべて入る', x);
		});
		assert(jsErrors(sp.errors).length === 0, 'ピン計算(5) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン計算(6) 組み合わせがない: 枚数を超えるピン・種類の指定で入らないピンでは探索せず pinInfeasible と理由 none／種類の指定そのものが満たせないときは今までどおり infeasible／判定の差し替え（setPinJudge）と pinCheck', async () => {
		const sp = await openSp();
		const r = await sp.page.evaluate(({ R1 }) => {
			const { C, solve } = window.__pin;
			const prob = C.build({ roster: R1, addedSkillIds: [] });
			const hasBit = (m, b) => (m[b >> 5] & (1 << (b & 31))) !== 0;
			const nPop = prob.pop.ids.length;
			// 1つのグループだけが持つ白（グループの番号ごとに1つ）
			const owners = new Map();
			for (let b = 0; b < nPop; b++) {
				const gs = prob.groups.map((g, gi) => (g.options.some((o) => hasBit(o.m, b)) ? gi : -1)).filter((gi) => gi >= 0);
				if (gs.length === 1 && !owners.has(gs[0])) owners.set(gs[0], prob.universe[b]);
			}
			const five = Array.from(owners.values()).slice(0, 5);
			const k4 = solve({ roster: R1, count: 4, pinSkillIds: five });
			const judge = C.pinFeasible(C.build({ roster: R1, addedSkillIds: [], pinSkillIds: five }), 4);
			const k5 = solve({ roster: R1, count: 5, pinSkillIds: five });
			// 種類の指定: スピード4枚＋スピードのカードを持たないキャラクターだけが持つピン
			const nonSpeed = Array.from(owners.entries()).find(([gi]) => prob.groups[gi].options.every((o) => o.type !== 1) && !prob.cons.fill.find((f) => f.key === prob.groups[gi].key).types.includes(1));
			const typeNone = solve({ roster: R1, count: 4, typeMin: { 1: 4 }, pinSkillIds: [nonSpeed[1]] });
			const typeOkPin = solve({ roster: R1, count: 5, typeMin: { 1: 4 }, pinSkillIds: [nonSpeed[1]] });
			// 種類の指定そのものが満たせない（4枚に指定が5枚）→ 今までどおり infeasible（ピンのせいにしない）
			const typeBad = solve({ roster: R1, count: 4, typeMin: { 1: 4, 2: 1 }, pinSkillIds: [five[0]] });
			// 判定の差し替え
			const base = solve({ roster: R1 });
			const listPin = base.skills[1].skillId;
			C.setPinJudge(() => ({ result: 'ng' }));
			let forced, checkJudge, checkResult;
			try {
				forced = solve({ roster: R1, pinSkillIds: [listPin] });
				const held = { prob: C.build({ roster: R1, addedSkillIds: [] }), K: 5, result: base };
				checkResult = C.pinCheck([listPin], held);
				checkJudge = C.pinCheck([listPin], { prob: held.prob, K: 5, result: null });
			} finally { C.setPinJudge(null); }
			const after = solve({ roster: R1, pinSkillIds: [listPin] });
			return {
				five, k4: { pinInfeasible: !!k4.pinInfeasible, cards: k4.cards.length, skills: k4.skills.length, score: k4.score, partial: k4.partial, none: k4.pins.rejected.filter((x) => x.reason === 'none').map((x) => x.skillId), ids: k4.pins.ids, nodes: k4.stats.nodes },
				judge: { result: judge.result, nodes: judge.nodes },
				k5: { pinInfeasible: !!k5.pinInfeasible, has: five.every((id) => k5.skills.some((s) => s.skillId === id && s.pinned)) },
				typeNone: { pin: nonSpeed && nonSpeed[1], pinInfeasible: !!typeNone.pinInfeasible, infeasible: !!typeNone.infeasible, none: typeNone.pins.rejected.map((x) => x.reason) },
				typeOkPin: { pinInfeasible: !!typeOkPin.pinInfeasible, has: typeOkPin.skills.some((s) => s.skillId === (nonSpeed && nonSpeed[1]) && s.pinned) },
				typeBad: { infeasible: !!typeBad.infeasible, pinInfeasible: !!typeBad.pinInfeasible },
				forced: { pinInfeasible: !!forced.pinInfeasible, none: forced.pins.rejected.map((x) => x.reason), cards: forced.cards.length },
				checkResult, checkJudge, after: { pinInfeasible: !!after.pinInfeasible, has: after.skills.some((s) => s.skillId === listPin && s.pinned) }
			};
		}, { R1: ROSTERS.R1 });
		assert(r.five.length === 5 && r.k4.pinInfeasible && r.k4.cards === 0 && r.k4.skills === 0 && r.k4.score === 0 && !r.k4.partial && r.k4.none.length === 5 && r.k4.ids.length === 0,
			'ピン計算(6) 4枚で、別々のキャラクターだけが持つ5つのピン: pinInfeasible・カードとスキルは空・5つとも理由 none', r.k4);
		assert(r.judge.result === 'ng' && r.k4.nodes === r.judge.nodes, 'ピン計算(6) 組み合わせがないときは探索しない（結果の nodes は判定の nodes と同じ）', { k4: r.k4.nodes, judge: r.judge });
		assert(!r.k5.pinInfeasible && r.k5.has, 'ピン計算(6) 同じ5つのピンでも、5枚なら含められる（全部入る）', r.k5);
		assert(!!r.typeNone.pin && r.typeNone.pinInfeasible && !r.typeNone.infeasible && JSON.stringify(r.typeNone.none) === JSON.stringify(['none']), 'ピン計算(6) 4枚・スピード4枚の指定で、スピードのカードを持たないキャラクターのピン: pinInfeasible（理由 none）', r.typeNone);
		assert(!r.typeOkPin.pinInfeasible && r.typeOkPin.has, 'ピン計算(6) 5枚・スピード4枚なら、そのピンは入る', r.typeOkPin);
		assert(r.typeBad.infeasible && !r.typeBad.pinInfeasible, 'ピン計算(6) 種類の指定そのものが満たせないときは、今までどおり infeasible（ピンのせいにしない）', r.typeBad);
		assert(r.forced.pinInfeasible && JSON.stringify(r.forced.none) === JSON.stringify(['none']) && r.forced.cards === 0, 'ピン計算(6) setPinJudge で判定を「含められない」に差し替えると、一覧のピンでも pinInfeasible（理由 none）', r.forced);
		assert(r.checkResult.result === 'ok' && r.checkResult.via === 'result' && r.checkJudge.result === 'ng' && r.checkJudge.via === 'judge', 'ピン計算(6) pinCheck: 表示中の結果がピンを持てば判定せず ok（via result）・結果が無ければ判定（差し替えで ng）', { checkResult: r.checkResult, checkJudge: r.checkJudge });
		assert(!r.after.pinInfeasible && r.after.has, 'ピン計算(6) setPinJudge(null) で元に戻る', r.after);
		assert(jsErrors(sp.errors).length === 0, 'ピン計算(6) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン計算(7) 判定の時間: ピンの数 1・2・3・5・10 × 3編成（一覧から・含めうる白から）で中央値と最大を測る（打ち切り 100ms に当たらない）／pinCheck の unknown（問題に無いピン）', async () => {
		const sp = await openSp();
		const r = await sp.page.evaluate(({ rosters }) => {
			const { C, solve } = window.__pin;
			const hasBit = (m, b) => (m[b >> 5] & (1 << (b & 31))) !== 0;
			let s = 12345;
			const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
			const q = (a, p) => { const x = a.slice().sort((u, v) => u - v); return x[Math.min(x.length - 1, Math.floor((x.length - 1) * p))]; };
			const rows = [];
			let timeouts = 0;
			Object.keys(rosters).forEach((k) => {
				const prob = C.build({ roster: rosters[k], addedSkillIds: [] });
				const base = solve({ roster: rosters[k] });
				const list = base.skills.map((x) => x.skillId);
				const nPop = prob.pop.ids.length;
				const any = [];
				for (let b = 0; b < nPop; b++) if (prob.groups.some((g) => g.options.some((o) => hasBit(o.m, b)))) any.push(prob.universe[b]);
				[['一覧', list], ['含めうる白', any]].forEach(([mode, pool]) => {
					[1, 2, 3, 5, 10].forEach((n) => {
						const ms = [];
						let ng = 0;
						for (let t = 0; t < 20; t++) {
							const pins = pool.slice().sort(() => rnd() - 0.5).slice(0, n);
							C.pinFeasible(prob, 5, { pins });
							const j = C.pinFeasible(prob, 5, { pins });
							ms.push(j.ms);
							if (j.result === 'timeout') timeouts++;
							if (j.result === 'ng') ng++;
						}
						rows.push({ k, mode, n, median: q(ms, 0.5), max: Math.max(...ms), ng });
					});
				});
			});
			// 問題の universe に無いピン（除外から戻すピン）は unknown
			const prob1 = C.build({ roster: rosters.R1, addedSkillIds: [] });
			const exId = C.populationOf(rosters.R1, {}).optionExcludedIds[0];
			const unk = C.pinCheck([exId], { prob: prob1, K: 5, result: null });
			const noHeld = C.pinCheck([exId], { prob: null });
			return { rows, timeouts, unk, noHeld, JUDGE_MS: C.PIN_JUDGE_MS };
		}, { rosters: ROSTERS });
		r.rows.forEach((x) => console.log('     [実測] 判定 ' + x.k + '・' + x.mode + '・ピン ' + x.n + ': 中央値 ' + x.median.toFixed(2) + 'ms・最大 ' + x.max.toFixed(2) + 'ms（含められない ' + x.ng + '/20）'));
		const max = Math.max(...r.rows.map((x) => x.max));
		assert(r.rows.length === 30 && r.timeouts === 0 && max < r.JUDGE_MS, 'ピン計算(7) 判定は 30 条件×20 回すべて打ち切り（' + r.JUDGE_MS + 'ms）に当たらない（最大 ' + max.toFixed(2) + 'ms）', { max, timeouts: r.timeouts });
		assert(r.rows.filter((x) => x.mode === '一覧').every((x) => x.ng === 0), 'ピン計算(7) 一覧から選んだピンは、判定が常に「含められる」', r.rows.filter((x) => x.mode === '一覧' && x.ng > 0));
		assert(r.unk.result === 'unknown' && r.unk.missing.length === 1 && r.noHeld.result === 'unknown', 'ピン計算(7) 問題の universe に無いピン・問題が無いときは unknown（画面は再計算に任せる）', { unk: r.unk, noHeld: r.noHeld });
		assert(jsErrors(sp.errors).length === 0, 'ピン計算(7) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ピン計算(8) 問題を持っておく口: オススメサポの小窓の計算が終わると heldProblem() に問題と結果が入り（結果は表示中のもの）、再計算を始めると空になる／pinCheck は持っている問題を使う／小窓の見た目は変わらない（ピンの印・文言なし）', async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		await sp.page.evaluate(({ roster }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: Object.assign({ pt: { status: 'kire' } }, ROSTERS.R1) });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		const before = await sp.page.evaluate(() => UmaSkillDeckCore.outside.heldProblem());
		await sp.page.click('#deck-template-panel [data-usd-el="outside-open"]');
		await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]') && !!UmaSkillDeckCore.outside.heldProblem(); }, null, { timeout: 20000 });
		const r = await sp.page.evaluate(() => {
			const C = UmaSkillDeckCore.outside;
			const h = C.heldProblem();
			const rows = Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"][data-skill-id]')).map((e) => e.getAttribute('data-skill-id'));
			const listed = h.result.skills.filter((s) => !s.added).map((s) => s.skillId);
			const c1 = C.pinCheck([listed[0], listed[1]]);
			const modalText = document.querySelector('[data-usd-el="outside-modal"]').textContent;
			return { hasProb: !!h.prob && h.prob.ok, K: h.K, score: h.result.score, rowsInList: listed.filter((id) => rows.indexOf(id) !== -1).length, listed: listed.length,
				noPins: !('pins' in h.result) && h.result.skills.every((s) => !('pinned' in s)), c1, pinText: /ピン/.test(modalText) };
		});
		// 再計算を始めると空になる（計算中）
		// 「再計算」のボタン（ふだんは隠れている）を JS で押して、計算を始めた直後を見る
		const during = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-modal"] [data-usd-act="outside-recalc"]'); if (!b) return 'no-button'; b.click(); return UmaSkillDeckCore.outside.heldProblem() === null ? 'cleared' : 'kept'; });
		assert(before === null && r.hasProb && r.K === 5 && r.listed > 0 && r.rowsInList === r.listed, 'ピン計算(8) 小窓の計算が終わると、表示中の結果（一覧の行と同じスキル）と問題を持つ（開く前は null）', { before, r });
		assert(r.noPins && !r.pinText, 'ピン計算(8) ピンが無いので、結果にピンの項目が無く、小窓にピンの文言も出ない', r);
		assert(r.c1.result === 'ok' && r.c1.via === 'result', 'ピン計算(8) pinCheck は持っている結果を使う（一覧の行なら判定せず ok）', r.c1);
		assert(during === 'cleared', 'ピン計算(8) 再計算を始めると、持っている問題は空になる（計算中）', during);
		assert(jsErrors(sp.errors).length === 0, 'ピン計算(8) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
