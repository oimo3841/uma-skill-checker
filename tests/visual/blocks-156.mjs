// T153（2026-11-09・決定 609）: オススメサポの残りの枠にグループのカードを指定したとき（T53）、代表者でないメンバーの共通イベントの
// スキルが結果の点とスキルの一覧から落ちていた件の直しの検査。run-smoke.mjs の末尾から register156() で呼ばれる
// （塊の見出しはすべて「T153」で始まる。`npm run test:visual -- --only=T153` で回せる）。
//
// 直したこと（js/uma-skill-deck-core.js の outsideAssemble）: 結果の組み立てで、グループのカードはメンバー全員（outsideCharasOfCard）の
// 共通イベントを数える（探索の出発点 outsideBuild の bases と同じ数え方）。選択肢つきのイベントは、出発点の picks の chara（メンバー）で照らす。
// グループでないカードは今までと同じ（charaName の1人）。
//  (1) グループのカード5枚（データの isGroup のカード）をそれぞれ残りの枠に指定し、オススメの枚数 2・4・5（指定と合わせて 3・5・6枚）で、
//      探索の点（stats.engineScore）と画面に出す点（score）が一致する。指定したカードのスキルは、カード自身＋メンバー全員の共通イベント
//      （選択肢つきは picks の選び方。金スキルは前段の白も）と一致する。
//  (2) チーム＜シリウス＞（card-0324）: 代表者でないメンバーの共通イベントで得るスキル（選択肢つきのイベントは結果の picks のうち、chara が
//      そのメンバーの選び方）のうち、ほかのカード（その結果のオススメで選んだカード・代表者の共通イベント・指定したカード自身。どれも全選択肢）では
//      得られないものを、データと結果から選ぶ。それが結果の一覧に入り、由来のカードが card-0324 だけ。
//  (3) グループでないカードを指定したとき・何も指定しないとき: engineScore と score が一致し、どのカードのスキルもカード自身＋charaName の
//      1人ぶんの共通イベント（今までと同じ数え方）。直す前の core と結果が同じことは、94の目標で別に比べた（T153 の報告）。
// 壊す確認: 直しを戻すと (1) の card-0310・0324・0422 と (2) が NG になる（T153 の報告）。
// スキル名・カード名は検査の側に書かない（恒久ルール1。id と、データから読んだ名前だけ）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register156(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8')).entries;
	const GROUPS = CARDS.filter((c) => c.isGroup === true).map((c) => c.id);
	const MEMBERS = Object.fromEntries(CARDS.filter((c) => c.isGroup === true).map((c) => [c.id, c.groupMembers.slice()]));
	const SIRIUS = 'card-0324';
	const COUNTS = [2, 4, 5];
	const ROSTERS = {
		'絞り込みなし': { cardIds: [] },
		'中距離・先行・芝': { cardIds: [], skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } },
		'除外なし・長距離・差し・芝': { cardIds: [], skillFilter: { distance: 'long', style: 'sashi', surface: 'turf' }, outsideOptions: { exclude: {} } }
	};
	// グループでないカード: グループのメンバーと同じキャラクターの SSR を2枚（キャラクターが別のもの）と、メンバーでないキャラクターの SSR を1枚
	const memberNames = new Set(CARDS.filter((c) => c.isGroup === true).flatMap((c) => c.groupMembers || []));
	const plain = CARDS.filter((c) => c.isGroup === false && c.rarity === 'SSR');
	const NON_GROUP = [];
	plain.filter((c) => memberNames.has(c.charaName)).forEach((c) => { if (NON_GROUP.length < 2 && !NON_GROUP.some((id) => CARDS.find((x) => x.id === id).charaName === c.charaName)) NON_GROUP.push(c.id); });
	const other = plain.find((c) => !memberNames.has(c.charaName));
	if (other) NON_GROUP.push(other.id);

	const openSp = async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, EMPTY);
		await sp.page.evaluate(() => { localStorage.removeItem('umaSkillDeck:draftRoster:special'); localStorage.setItem('umaSkillDeck:stepTab', '1'); });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => {
			await UmaSkillDeckCore.loadMasterSkills(); await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData();
			try { await UmaSkillDeckCore.loadSkillEffectLevels(); } catch (e) { /* 低効果は読めなくてもよい */ }
		});
		await sp.page.evaluate((members) => {
			window.__t153members = members;   // グループのカード → メンバー（データの groupMembers）
			const C = UmaSkillDeckCore.outside;
			const solve = (a) => C.solveSync(Object.assign({ addedSkillIds: [], deadlineMs: 30000 }, a));
			const build = (a) => C.build(Object.assign({ addedSkillIds: [] }, a));
			// カード1枚で数えるはずのスキル（universe の中だけ・並べ替え済み）: ヒント・連続イベント・charas の共通イベント。
			// 選択肢が2つ以上のイベントは picks の選び方（共通イベントは、charas が2人以上〔グループ〕なら picks の chara で照らす）。金スキルは前段の白も
			const expectSet = (prob, cardId, picks, charas) => {
				const src = prob.cardSrc.get(cardId);
				const out = new Set(src.hint);
				const evs = (events, scope, chara) => events.forEach((ev) => {
					if (ev.alts.length === 1) { ev.alts[0].forEach((id) => out.add(id)); return; }
					const p = picks.find((x) => x.scope === scope && x.eventIndex === ev.idx && (chara === undefined || x.chara === chara));
					if (p) ev.alts[p.choiceIndex].forEach((id) => out.add(id));
				});
				evs(src.events, 'card');
				charas.forEach((n) => evs(prob.commonSrc.get(n) || [], 'chara', charas.length > 1 ? n : undefined));
				return Array.from(prob.expandIds(Array.from(out))).filter((id) => prob.idx.has(id)).sort();
			};
			const got = (c) => c.skillIds.concat(c.goldIds).slice().sort();
			// 結果のカードごとに、数えたスキルが期待と同じか（違うカードの id を返す）。グループのカードはメンバー全員、それ以外は charaName の1人
			const cardMismatches = (prob, r) => r.cards.filter((c) => {
				const charas = window.__t153members[c.cardId] ? window.__t153members[c.cardId].slice() : [c.charaName];
				return JSON.stringify(got(c)) !== JSON.stringify(expectSet(prob, c.cardId, c.picks, charas));
			}).map((c) => c.cardId);
			window.__t153 = { C, solve, build, expectSet, cardMismatches };
		}, MEMBERS);
		return sp;
	};

	await block('T153 (1) グループのカード5枚をそれぞれ残りの枠に指定（オススメ 2・4・5枚＝合わせて 3・5・6枚）: engineScore と score が一致し、指定したカードのスキルはメンバー全員の共通イベントを含む', async () => {
		const sp = await openSp();
		try {
			assert(GROUPS.length === 5, 'T153(1) データのグループのカードは5枚', GROUPS);
			const r = await sp.page.evaluate(({ rosters, groups, counts }) => {
				const { solve, build, cardMismatches } = window.__t153;
				const out = [];
				Object.keys(rosters).forEach((rk) => groups.forEach((gid) => counts.forEach((count) => {
					const args = { roster: rosters[rk], count, pinnedCardIds: [gid] };
					const res = solve(args);
					const prob = build(args);
					const pc = res.ok ? res.cards.find((c) => c.cardId === gid) : null;
					out.push({ rk, gid, count, ok: res.ok, partial: !!res.partial, engine: res.ok ? res.stats.engineScore : null, score: res.ok ? res.score : null,
						pinned: !!(pc && pc.pinned), bad: res.ok ? cardMismatches(prob, res) : ['(ok でない)'] });
				})));
				return out;
			}, { rosters: ROSTERS, groups: GROUPS, counts: COUNTS });
			GROUPS.forEach((gid) => {
				const rows = r.filter((x) => x.gid === gid);
				const ng = rows.filter((x) => !x.ok || x.partial || !x.pinned || x.engine !== x.score);
				assert(ng.length === 0, 'T153(1) ' + gid + ': ' + rows.length + '通り（目標3×枚数3）で engineScore＝score・打ち切りなし・指定のカードが結果にいる', ng.slice(0, 5));
				const bad = rows.filter((x) => x.bad.length > 0);
				assert(bad.length === 0, 'T153(1) ' + gid + ': 結果のどのカードも、数えたスキルが期待（指定のグループのカードはメンバー全員の共通イベント・ほかは charaName の1人）と同じ', bad.slice(0, 5));
			});
			assert(jsErrors(sp.errors).length === 0, 'T153(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T153 (2) チーム＜シリウス＞を指定: 代表者でないメンバーの共通イベントだけで得られるスキル（データから選ぶ）が結果の一覧に入る', async () => {
		const sp = await openSp();
		try {
			const r = await sp.page.evaluate(({ rosters, sirius, counts }) => {
				const { solve, build } = window.__t153;
				const rep = UmaSkillDeckCore.outside.build({ roster: { cardIds: [] }, pinnedCardIds: [sirius] }).pinned[0].charaName;
				const others = window.__t153members[sirius].filter((n) => n !== rep);
				const out = [];
				Object.keys(rosters).forEach((rk) => {
					const prob = build({ roster: rosters[rk], pinnedCardIds: [sirius] });
					// ほかのカードで得られるもの（どの結果でも同じ分）: 指定したカード自身（ヒント・連続イベントの全選択肢）・代表者の共通イベント（全選択肢）
					const fixed = new Set();
					const addAll = (set, events) => events.forEach((ev) => ev.alts.forEach((al) => prob.expandIds(al).forEach((id) => set.add(id))));
					{ const s = prob.cardSrc.get(sirius); prob.expandIds(s.hint).forEach((id) => fixed.add(id)); addAll(fixed, s.events); }
					addAll(fixed, prob.commonSrc.get(rep) || []);
					counts.forEach((count) => {
						const res = solve({ roster: rosters[rk], count, pinnedCardIds: [sirius] });
						const entries = res.ok ? res.skills.concat(res.golds) : [];
						// その結果のオススメで選んだカード（指定したカード以外）が得るもの（ヒント・連続イベントの全選択肢・charaName の共通イベントの全選択肢）
						const elsewhere = new Set(fixed);
						(res.ok ? res.cards : []).filter((c) => c.cardId !== sirius).forEach((c) => {
							const s = prob.cardSrc.get(c.cardId);
							prob.expandIds(s.hint).forEach((id) => elsewhere.add(id)); addAll(elsewhere, s.events); addAll(elsewhere, prob.commonSrc.get(c.charaName) || []);
						});
						// 代表者でないメンバーの共通イベントで得るスキル（選択肢が1つならそれ、2つ以上なら結果の picks のうち chara がそのメンバーの選び方）で、
						// universe にあり、ほかのカードでは得られないもの（今のデータでは、どれも選択肢つきのイベントのスキル）
						const pc = res.ok ? res.cards.find((c) => c.cardId === sirius) : null;
						const picks = pc ? pc.picks : [];
						const only = [];
						others.forEach((n) => (prob.commonSrc.get(n) || []).forEach((ev) => {
							let al = ev.alts.length === 1 ? ev.alts[0] : null;
							if (!al) { const p = picks.find((x) => x.scope === 'chara' && x.chara === n && x.eventIndex === ev.idx); al = p ? ev.alts[p.choiceIndex] : []; }
							al.forEach((id) => { if (prob.idx.has(id) && !elsewhere.has(id) && !only.some((x) => x.id === id)) only.push({ id, chara: n, name: UmaSkillDeckCore.getSkillName(id) }); });
						}));
						const miss = only.filter((x) => { const e = entries.find((s) => s.skillId === x.id); return !e || e.cardIds.join() !== sirius; });
						out.push({ rk, count, ok: res.ok, only: only.map((x) => x.id + '（' + x.name + '・' + x.chara + '）'), miss: miss.map((x) => x.id) });
					});
				});
				return out;
			}, { rosters: ROSTERS, sirius: SIRIUS, counts: COUNTS });
			const found = Array.from(new Set(r.flatMap((x) => x.only)));
			assert(found.length > 0, 'T153(2) 結果に、代表者でないメンバーの共通イベントだけで得るスキルがある（' + found.length + '種）', found);
			r.forEach((x) => assert(x.ok && x.miss.length === 0, 'T153(2) ' + x.rk + '・オススメ ' + x.count + '枚: そのスキル ' + x.only.length + '種がすべて一覧に入り、由来のカードは ' + SIRIUS + ' だけ', x));
			assert(jsErrors(sp.errors).length === 0, 'T153(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T153 (3) グループでないカードを指定したとき・何も指定しないとき: engineScore と score が一致し、どのカードも charaName の1人ぶんの共通イベントで数える（今までと同じ）', async () => {
		const sp = await openSp();
		try {
			assert(NON_GROUP.length === 3, 'T153(3) 検査のカード（メンバーと同じキャラクターの SSR 2枚・メンバーでない SSR 1枚）がデータから選べる', NON_GROUP);
			const r = await sp.page.evaluate(({ rosters, ids, counts }) => {
				const { solve, build, cardMismatches } = window.__t153;
				const out = [];
				Object.keys(rosters).forEach((rk) => [null].concat(ids).forEach((id) => counts.concat(id ? [] : [6]).forEach((count) => {
					const args = Object.assign({ roster: rosters[rk], count }, id ? { pinnedCardIds: [id] } : {});
					const res = solve(args);
					const prob = build(args);
					out.push({ rk, id, count, ok: res.ok, partial: !!res.partial, engine: res.ok ? res.stats.engineScore : null, score: res.ok ? res.score : null,
						pinned: id ? !!(res.ok && res.cards.some((c) => c.cardId === id && c.pinned)) : true, bad: res.ok ? cardMismatches(prob, res) : ['(ok でない)'] });
				})));
				return out;
			}, { rosters: ROSTERS, ids: NON_GROUP, counts: COUNTS });
			[null].concat(NON_GROUP).forEach((id) => {
				const rows = r.filter((x) => x.id === id);
				const label = id ? id + ' を指定' : '指定なし';
				const ng = rows.filter((x) => !x.ok || x.partial || !x.pinned || x.engine !== x.score);
				assert(ng.length === 0, 'T153(3) ' + label + ': ' + rows.length + '通りで engineScore＝score・打ち切りなし' + (id ? '・指定のカードが結果にいる' : ''), ng.slice(0, 5));
				const bad = rows.filter((x) => x.bad.length > 0);
				assert(bad.length === 0, 'T153(3) ' + label + ': 結果のどのカードも、数えたスキルがカード自身＋charaName の1人ぶんの共通イベント', bad.slice(0, 5));
			});
			assert(jsErrors(sp.errors).length === 0, 'T153(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});
}
