// 育成ウマ娘のイベントで得られるスキルを①の本育成の表に出す（2026-10-12）の検査。run-smoke.mjs の末尾から register23() で呼ばれる
// （塊の見出しはすべて「育成イベント」で始まる。`npm run test:visual -- --only=育成イベント` で回せる。段2だけなら「育成イベント段2」）。
//
// 段2（①の計算）: ●/△・選ぶと●・results は先頭だけ・Pt（初期 Lv3＋イベント Lv、上限5）・「本育成で得る」への反映・赤字の数が変わらない・行の無い衣装
// 段3（小窓・列見出し）: ボタン（！／◇）・イベント名・条件文・「選択肢N」・保存と再読み込み・リセット・見た目（375・320・1280px／ライト・ダーク）・サポカ側が変わらない
// スキル名・イベント名・衣装名は検査の側に書かない（恒久ルール1）。実データ（data/training-event-skills.json）から読む。

import { decodePng, contrastRatio, hexOf } from './lib/pixels.mjs';

export async function register23(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EVDOC = readJson('data/training-event-skills.json');
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];

	/** 成功側（先頭の結果）の参照 */
	const successOf = (c) => (Array.isArray(c.skills) ? c.skills : (Array.isArray(c.results) && Array.isArray(c.results[0]) ? c.results[0] : []));
	/** データだけから、衣装のイベントの期待する出現を作る（実装とは別の書き方）。eventKey ごと・スキルごとに { sure, lv } */
	const expectedOf = (entry, picks) => {
		const out = [];
		entry.events.forEach((ev, idx) => {
			const sides = ev.choices.map(successOf);
			const dflt = Number.isInteger(ev.defaultChoice) && ev.defaultChoice >= 1 && ev.defaultChoice <= sides.length && sides.length >= 2 ? ev.defaultChoice - 1 : null;
			const pick = picks && Number.isInteger(picks[idx]) && sides.length >= 2 ? picks[idx] : dflt;
			const by = new Map();
			const put = (ref, sure) => {
				const cur = by.get(ref.skillId);
				if (!cur) by.set(ref.skillId, { skillId: ref.skillId, sure, hintLevel: ref.hintLevel });
				else { cur.sure = cur.sure || sure; cur.hintLevel = Math.max(cur.hintLevel, ref.hintLevel); }
			};
			if (pick !== null) sides[pick].forEach((r) => put(r, true));
			else if (sides.length === 1) sides[0].forEach((r) => put(r, true));
			else sides.forEach((side) => side.forEach((r) => put(r, sides.every((s) => s.some((x) => x.skillId === r.skillId)))));
			by.forEach((v) => out.push(Object.assign({ eventKey: 'uma:' + entry.umaId + '#' + idx }, v)));
		});
		return out;
	};
	const norm = (list) => list.map((x) => [x.eventKey, x.skillId, x.sure ? 1 : 0, x.hintLevel].join('|')).sort();

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		if (o.evDoc) await sp.page.route('**/data/training-event-skills.json*', (r) => r.fulfill(json(o.evDoc)));
		if (o.cardEvDoc) await sp.page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill(json(o.cardEvDoc)));
		await sp.page.evaluate(({ roster, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster === undefined ? null : o.roster, tab: o.tab === undefined ? 1 : o.tab });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(400);
		await sp.page.evaluate(() => UmaSkillDeckCore.loadTrainingSources(false));
		await sp.page.evaluate(() => UmaSkillDeckCore.loadSkillPtData(false));
		return sp;
	};

	/* ====================================================================
	 * 段2: ①の計算
	 * ==================================================================== */
	await block('育成イベント段2A 全271衣装で、計算の出現（kind:umaEvent）がデータから独立に作った期待と一致する（●／△・eventKey・Lv・results は先頭だけ）', async () => {
		const sp = await openSp();
		const got = await sp.page.evaluate((ids) => ids.map((id) => {
			const r = UmaSkillDeckCore.computeRosterSkills({ umaId: id, cardIds: [] });
			return { id, src: r.sources.filter((s) => s.kind === 'umaEvent').map((s) => ({ eventKey: s.eventKey, skillId: s.skillId, sure: s.sure, hintLevel: s.hintLevel, memberKey: s.memberKey })),
				unconfirmed: r.unconfirmed.length, missing: r.missing.length };
		}), EVDOC.entries.map((e) => e.umaId));
		const bad = [];
		let sureN = 0, maybeN = 0;
		EVDOC.entries.forEach((e, i) => {
			const exp = norm(expectedOf(e)), act = norm(got[i].src);
			if (JSON.stringify(exp) !== JSON.stringify(act)) bad.push(e.umaId);
			got[i].src.forEach((s) => { if (s.sure) sureN++; else maybeN++; });
		});
		assert(EVDOC.entries.length === 271 && bad.length === 0, '育成イベント段2A 271衣装ぶんの出現が期待と一致（不一致 ' + bad.length + '件）', bad.slice(0, 5));
		assert(sureN > 0 && maybeN > 0, '育成イベント段2A 前提: ●と△の両方が実データにある（検査が空振りでない。●' + sureN + '行・△' + maybeN + '行）', { sureN, maybeN });
		assert(got.every((g) => g.src.every((s) => s.memberKey === 0)) && got.every((g) => g.missing === 0), '育成イベント段2A 出どころは育成ウマ娘の列（memberKey 0）で、引けないスキルは無い', got.filter((g) => g.missing).map((g) => g.id).slice(0, 3));
		assert(got.every((g) => g.unconfirmed === 0), '育成イベント段2A 赤字（未収録）に育成ウマ娘のイベントは数えない（カード無しの編成は0件）', got.filter((g) => g.unconfirmed).map((g) => g.id).slice(0, 3));
		assert(jsErrors(sp.errors).length === 0, '育成イベント段2A コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('育成イベント段2B ●は skillIds に入り、△は入らない。選んだ選択肢の成功側が●になり、選ばなかった側にだけあるスキルは出ない', async () => {
		// 選択肢が2つ以上で、スキルが一部の選択肢にしか無いイベントのある衣装
		const pickUma = EVDOC.entries.find((e) => e.events.some((ev) => { const s = ev.choices.map(successOf); return s.length >= 2 && s[0].length > 0 && s.some((x) => x.length === 0); }));
		const idx = pickUma.events.findIndex((ev) => { const s = ev.choices.map(successOf); return s.length >= 2 && s[0].length > 0 && s.some((x) => x.length === 0); });
		const sides = pickUma.events[idx].choices.map(successOf);
		const sp = await openSp();
		const r = await sp.page.evaluate(({ umaId, key, choice }) => {
			const C = UmaSkillDeckCore;
			const ids = (x) => x.items.filter((i) => i.origins.some((o) => o.indexOf('イベント') !== -1)).map((i) => i.skillId);
			const none = C.computeRosterSkills({ umaId, cardIds: [] });
			const picked = C.computeRosterSkills({ umaId, cardIds: [], eventChoices: { [key]: choice } }, { eventChoices: { [key]: choice } });
			const evItem = (res, id) => res.items.find((i) => i.skillId === id);
			return { noneSure: none.skillIds, pickedSure: picked.skillIds, noneItems: none.items.map((i) => ({ id: i.skillId, sure: i.sure })), pickedItems: picked.items.map((i) => ({ id: i.skillId, sure: i.sure })), ev: none.events.filter((e) => e.eventKey === key).map((e) => ({ pending: e.pending, chosen: e.chosen })), evPicked: picked.events.filter((e) => e.eventKey === key).map((e) => ({ pending: e.pending, chosen: e.chosen })) };
		}, { umaId: pickUma.umaId, key: 'uma:' + pickUma.umaId + '#' + idx, choice: 0 });
		const first = sides[0].map((x) => x.skillId);
		const emptyOnly = sides.slice(1).flat().map((x) => x.skillId).filter((id) => !first.includes(id));
		assert(first.every((id) => !r.noneSure.includes(id)) || sides.every((s) => s.some((x) => first.includes(x.skillId))), '育成イベント段2B 選ぶ前: 一部の選択肢にしかないスキルは●（skillIds）に入らない', first);
		assert(first.every((id) => r.pickedSure.includes(id)), '育成イベント段2B 選択肢1を選ぶと、その成功側のスキルがすべて●（skillIds）に入る', { first, got: r.pickedSure.filter((id) => first.includes(id)) });
		const others = emptyOnly.filter((id) => !EVDOC.entries.find((e) => e.umaId === pickUma.umaId).events.some((ev, j) => j !== idx && ev.choices.some((c) => successOf(c).some((x) => x.skillId === id))));
		assert(others.every((id) => !r.pickedItems.some((i) => i.id === id && i.sure)), '育成イベント段2B 選ばなかった側にだけあるスキルは●にならない', others);
		assert(r.ev.length === 1 && r.ev[0].chosen === null && r.evPicked.length === 1 && r.evPicked[0].chosen === 0 && r.evPicked[0].pending === false, '育成イベント段2B 選択の状態（未選択→選択肢1）が events に出る', { ev: r.ev, evPicked: r.evPicked });
		assert(jsErrors(sp.errors).length === 0, '育成イベント段2B コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('育成イベント段2C results の先頭だけを使う: 失敗側（2番目以降）にだけあるスキルは出ない', async () => {
		let target = null;
		for (const e of EVDOC.entries) {
			const firstIds = new Set(e.events.flatMap((ev) => ev.choices.flatMap((c) => successOf(c).map((x) => x.skillId))));
			for (const ev of e.events) for (const c of ev.choices) if (Array.isArray(c.results)) c.results.slice(1).flat().forEach((x) => { if (!target && !firstIds.has(x.skillId)) target = { umaId: e.umaId, skillId: x.skillId }; });
			if (target) break;
		}
		assert(!!target, '育成イベント段2C 前提: 失敗側にだけあるスキルを持つ衣装が実データにある', target);
		if (!target) return;
		const sp = await openSp();
		const r = await sp.page.evaluate(({ umaId, skillId }) => {
			const res = UmaSkillDeckCore.computeRosterSkills({ umaId, cardIds: [] });
			return { inItems: res.items.some((i) => i.skillId === skillId), inSources: res.sources.some((s) => s.skillId === skillId && s.kind === 'umaEvent') };
		}, target);
		assert(r.inItems === false || r.inSources === false, '育成イベント段2C 失敗側にだけあるスキルは、イベントの出どころに載らない', r);
		await sp.ctx.close();
	});

	await block('育成イベント段2D Pt: 初期・覚醒（Lv3）にイベントの Lv を足し、上限5で切れる。イベントどうしは合計・同じイベントの中は最大', async () => {
		const sp = await openSp();
		const rows = await sp.page.evaluate((ids) => {
			const C = UmaSkillDeckCore;
			const pd = C.getSkillPtData();
			const out = [];
			ids.forEach((umaId) => {
				const res = C.computeRosterSkills({ umaId, cardIds: [] });
				const pt = C.computeRosterPt({ sources: res.sources, rules: pd.rules, skillPt: pd.skillPt, stepUp: pd.stepUp, statusId: 'none' });
				const byId = new Map(pt.items.map((i) => [i.skillId, i]));
				const sureOf = (id, kind) => res.sources.filter((s) => s.skillId === id && s.kind === kind && s.sure);
				const seen = new Set();
				res.sources.forEach((s) => {
					if (s.kind !== 'umaEvent' || !s.sure || seen.has(s.skillId)) return;
					seen.add(s.skillId);
					if (sureOf(s.skillId, 'uma').length === 0) return;
					const ev = new Map();
					sureOf(s.skillId, 'umaEvent').forEach((x) => ev.set(x.eventKey, Math.max(ev.get(x.eventKey) || 0, x.hintLevel)));
					const sum = Array.from(ev.values()).reduce((a, b) => a + b, 0);
					const it = byId.get(s.skillId);
					out.push({ umaId, skillId: s.skillId, sum, level: it && it.hintLevel, pt: it && it.pt, base: it && it.base, hasRoot: !!it });
				});
			});
			return { out, rules: pd.rules };
		}, EVDOC.entries.map((e) => e.umaId));
		const rows2 = rows.out;
		const bad = rows2.filter((x) => x.level !== Math.min(5, 3 + x.sum));
		const cut = rows2.filter((x) => 3 + x.sum > 5), under = rows2.filter((x) => 3 + x.sum <= 5);
		assert(rows2.length > 0 && bad.length === 0, '育成イベント段2D 初期・覚醒とイベントの両方にあるスキル ' + rows2.length + '件すべてで Lv＝min(5, 3＋イベントの合計)（不一致 ' + bad.length + '件）', bad.slice(0, 3));
		assert(cut.length > 0 && under.length > 0 && cut.every((x) => x.level === 5), '育成イベント段2D 上限5で切れる例（' + cut.length + '件）と切れない例（' + under.length + '件）の両方がある。切れる例は Lv5', { cut: cut.slice(0, 2), under: under.slice(0, 2) });
		const pct = rows.rules.hintDiscountPercent;
		const withPt = rows2.filter((x) => Number.isInteger(x.base));
		const badPt = withPt.filter((x) => x.pt !== Math.floor(x.base * (100 - pct[x.level - 1]) / 100));
		assert(withPt.length > 0 && badPt.length === 0, '育成イベント段2D Pt＝基礎値×(100−割引率)÷100 の切り捨て（Lv に応じた割引率。' + withPt.length + '件）', badPt.slice(0, 3));
		assert(jsErrors(sp.errors).length === 0, '育成イベント段2D コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('育成イベント段2E ●は「本育成で得る」に流れる（②のグレーアウト・オススメサポの母集団）。△は流れない', async () => {
		const e = EVDOC.entries.find((x) => x.events.some((ev) => ev.choices.length === 1 && successOf(ev.choices[0]).length > 0));
		const ev = e.events.find((v) => v.choices.length === 1 && successOf(v.choices[0]).length > 0);
		const id = successOf(ev.choices[0])[0].skillId;
		const sp = await openSp({ roster: { umaId: e.umaId, cardIds: [] }, tab: 1 });
		const r = await sp.page.evaluate(({ umaId, id }) => {
			const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
			const res = UmaSkillDeckCore.computeRosterSkills(roster);
			const pop = UmaSkillDeckCore.outside.populationOf(roster);
			return { sure: res.skillIds.includes(id), hidden: UmaSkillDeckCore.getPickerHiddenIds().includes(id), taken: pop.takenIds.includes(id), inPop: pop.ids.includes(id) };
		}, { umaId: e.umaId, id });
		assert(r.sure && r.hidden && r.taken && !r.inPop, '育成イベント段2E 確定のイベントのスキルは skillIds・②の選べない一覧・オススメサポの takenIds に入り、母集団（追加候補）には入らない', r);
		// △: 一部の選択肢にしかないスキル（選ぶまで●にならない）は takenIds に入らない
		// 画面は autoChoose（スキルを持つ選択肢が1つだけなら自動で選ぶ）で計算するので、スキルを持つ選択肢が2つ以上あるイベントを使う
		const e2 = EVDOC.entries.find((x) => x.events.some((v) => v.choices.map(successOf).filter((y) => y.length > 0).length >= 2));
		const sp2 = await openSp({ roster: { umaId: e2.umaId, cardIds: [] }, tab: 1 });
		const r2 = await sp2.page.evaluate(() => {
			const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
			const res = UmaSkillDeckCore.computeRosterSkills(roster, { autoChoose: true });
			const maybe = res.items.filter((i) => !i.sure).map((i) => i.skillId);
			const hid = UmaSkillDeckCore.getPickerHiddenIds();
			return { maybe: maybe.length, sure: maybe.filter((id) => res.skillIds.includes(id)), hidden: maybe.filter((id) => hid.includes(id)) };
		});
		assert(r2.maybe > 0 && r2.sure.length === 0 && r2.hidden.length === 0, '育成イベント段2E △のスキル（選択肢しだい。' + r2.maybe + '種）は skillIds・②の選べない一覧に入らない', r2);
		await sp.ctx.close();
		await sp2.ctx.close();
	});

	await block('育成イベント段2F 赤字「αテスト中：イベントスキル未収録」の数は、育成ウマ娘の有無・衣装によらず変わらない／行の無い衣装は「イベント無し」として動く', async () => {
		// 2026-10-15: 全563枚にイベントの行がそろい「行の無いカード」が実データに無くなった。未確認の扱いを見る検査なので、
		// 1枚（CARDS6 に入らない最初のカード）の行だけ外したイベントのデータに差し替えて開く
		const cardEvFull = readJson('data/support-card-event-skills.json');
		const pendingCard = readJson('data/support-cards.json').entries.find((c) => !CARDS6.includes(c.id)).id;
		const cardEvDoc = Object.assign({}, cardEvFull, { entries: cardEvFull.entries.filter((x) => x.cardId !== pendingCard) });
		const CARDS = [pendingCard].concat(CARDS6.slice(0, 5));
		const alertText = (page) => page.evaluate(() => { const a = document.querySelector('.usd-roster-alert'); return a ? a.textContent : ''; });
		const sp = await openSp({ cardEvDoc, roster: { cardIds: CARDS } });
		const noUma = await sp.page.evaluate((ids) => UmaSkillDeckCore.computeRosterSkills({ cardIds: ids }).unconfirmed.length, CARDS);
		const withUma = await sp.page.evaluate((ids) => UmaSkillDeckCore.computeRosterSkills({ umaId: 'uma-0001', cardIds: ids }).unconfirmed.length, CARDS);
		const t0 = await alertText(sp.page);
		assert(noUma > 0 && noUma === withUma, '育成イベント段2F 未収録の数（計算）は育成ウマ娘を足しても同じ', { noUma, withUma });
		await sp.ctx.close();
		const sp1 = await openSp({ cardEvDoc, roster: { umaId: 'uma-0001', cardIds: CARDS } });
		const t1 = await alertText(sp1.page);
		assert(t0 === t1, '育成イベント段2F 画面の赤字の文も同じ（「' + t0 + '」）', { t0, t1 });
		await sp1.ctx.close();
		// 行の無い衣装（entries から外した写しを返す）
		const doc = Object.assign({}, EVDOC, { entries: EVDOC.entries.filter((e) => e.umaId !== 'uma-0001') });
		const sp2 = await openSp({ cardEvDoc, evDoc: doc, roster: { umaId: 'uma-0001', cardIds: CARDS } });
		const r = await sp2.page.evaluate((ids) => {
			const a = UmaSkillDeckCore.computeRosterSkills({ umaId: 'uma-0001', cardIds: ids });
			return { ev: a.sources.filter((s) => s.kind === 'umaEvent').length, ch: a.events.filter((e) => e.kind === 'umaEvent').length, unconf: a.unconfirmed.length };
		}, CARDS);
		const t2 = await alertText(sp2.page);
		assert(r.ev === 0 && r.ch === 0 && r.unconf === noUma && t2 === t0, '育成イベント段2F entries に無い衣装: イベントの出どころ・選べるイベントとも0で、赤字も変わらない（エラーも出ない）', { r, t2 });
		assert(jsErrors(sp2.errors).length === 0, '育成イベント段2F コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});
	/* ====================================================================
	 * 段3: 列見出しのボタン・小窓（イベント名・条件文・「選択肢N」）
	 * ==================================================================== */
	// 小窓に出る＝選択肢が2つ以上で、どこかの成功側にスキルがある。「！」に数える（未選択）＝スキルを持つ選択肢が2つ以上（1つだけなら自動で選ばれる）
	const isListed = (ev) => ev.choices.length >= 2 && ev.choices.map(successOf).some((s) => s.length > 0);
	const hasDefault = (ev) => Number.isInteger(ev.defaultChoice) && ev.defaultChoice >= 1 && ev.defaultChoice <= ev.choices.length && ev.choices.length >= 2;
	const isPending = (ev) => !hasDefault(ev) && ev.choices.map(successOf).filter((s) => s.length > 0).length >= 2;
	// 読み取り専用で出る（段3の追補）＝選択肢が1つで条件文が空でない
	const isInfo = (ev) => ev.choices.length === 1 && typeof ev.condition === 'string' && ev.condition !== '';
	const choiceEvents = (entry) => entry.events.map((ev, i) => ({ ev, i })).filter((x) => isListed(x.ev));
	const pendingEvents = (entry) => choiceEvents(entry).filter((x) => isPending(x.ev));
	const UMA_LONG = EVDOC.entries.filter((e) => choiceEvents(e).some((x) => x.ev.condition))
		.sort((a, b) => Math.max(...choiceEvents(b).map((x) => x.ev.condition.length)) - Math.max(...choiceEvents(a).map((x) => x.ev.condition.length)))[0];
	const UMA_NONE = EVDOC.entries.find((e) => choiceEvents(e).length === 0);
	const UMA_SHORT = EVDOC.entries.find((e) => choiceEvents(e).length >= 2 && choiceEvents(e).some((x) => x.ev.condition === '') && choiceEvents(e).some((x) => x.ev.condition !== '') && e !== UMA_LONG);
	const openRoster = async (umaId, o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		if (o.evDoc) await sp.page.route('**/data/training-event-skills.json*', (r) => r.fulfill(json(o.evDoc)));
		await sp.page.evaluate(({ id, theme, ch }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ umaId: id, cardIds: [], eventChoices: ch || undefined }));
			localStorage.setItem('umaSkillDeck:stepTab', '0');
			if (theme) localStorage.setItem('uma-tools-theme', theme);
		}, { id: umaId, theme: o.theme || null, ch: o.choices || null });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const EVBTN = '[data-usd-el="events-btn"][data-member-key="0"]';
	const openPop = async (page) => { await page.click(EVBTN); await page.waitForSelector('[data-usd-el="event"]'); await page.waitForTimeout(300); };

	await block('育成イベント段3A 育成ウマ娘の列見出しは、小窓に出す行があるときだけボタン。未選択があれば「！」・無ければ ◇。出す行が無い衣装は今までの札', async () => {
		const sp = await openRoster(UMA_LONG.umaId);
		const need = pendingEvents(UMA_LONG).length;
		const b = await sp.page.evaluate((sel) => { const e = document.querySelector(sel); return e ? { text: e.textContent, unsel: e.getAttribute('data-unselected'), aria: e.getAttribute('aria-label'), diamond: !!e.querySelector('.usd-roster-evdiamond'), tag: e.tagName } : null; }, EVBTN);
		assert(!!b && b.tag === 'BUTTON' && b.text === '!' && b.unsel === String(need) && b.aria.includes('育成ウマ娘のイベントを選ぶ') && b.aria.includes('未選択' + need + '件'),
			'育成イベント段3A 未選択があるあいだは「！」のボタン（未選択' + need + '件。aria-label に件数）', b);
		const chip = await sp.page.evaluate(() => !!document.querySelector('.usd-roster-gh .usd-roster-umamark'));
		assert(chip === false, '育成イベント段3A ボタンのときは列見出しに名前の札（umaChip）を出さない（小窓の見出しへ移した）', chip);
		await sp.ctx.close();
		// すべて選ぶと ◇
		const ch = {};
		pendingEvents(UMA_LONG).forEach((x) => { ch['uma:' + UMA_LONG.umaId + '#' + x.i] = 0; });
		const sp2 = await openRoster(UMA_LONG.umaId, { choices: ch });
		const b2 = await sp2.page.evaluate((sel) => { const e = document.querySelector(sel); return e ? { text: e.textContent, unsel: e.getAttribute('data-unselected'), diamond: !!e.querySelector('.usd-roster-evdiamond'), alert: e.classList.contains('usd-roster-evbtn--alert') } : null; }, EVBTN);
		assert(!!b2 && b2.unsel === '0' && b2.diamond && b2.text === '' && !b2.alert, '育成イベント段3A すべて選ぶと「！」が消え、◇のボタンのまま（押すと小窓にもう一度入れる）', b2);
		await sp2.ctx.close();
		// 選ぶイベントが無い衣装（段3の追補で変えた: 実データのこの衣装には読み取り専用の行があるので、◇のボタンになる。「！」は出ない）
		const sp3 = await openRoster(UMA_NONE.umaId);
		const n = await sp3.page.evaluate((sel) => { const e = document.querySelector(sel); return { btn: !!e, unsel: e && e.getAttribute('data-unselected'), diamond: !!(e && e.querySelector('.usd-roster-evdiamond')), alert: !!(e && e.classList.contains('usd-roster-evbtn--alert')), chip: !!document.querySelector('.usd-roster-gh .usd-roster-umamark') }; }, EVBTN);
		assert(UMA_NONE.events.some(isInfo) && n.btn === true && n.unsel === '0' && n.diamond && !n.alert && n.chip === false,
			'育成イベント段3A 選ぶイベントが無く、読み取り専用の行だけがある衣装（' + UMA_NONE.umaId + '）は ◇ のボタン（「！」にならない）', n);
		assert(jsErrors(sp3.errors).length === 0, '育成イベント段3A コンソールのエラー0', jsErrors(sp3.errors).slice(0, 3));
		await sp3.ctx.close();
		// 小窓に出す行が無い衣装（実データには無いので、選べる行も読み取り専用の行も結果の切り替えも無い形にした写しを返す）。これまでどおり札でボタンにならない
		// （結果の切り替えを持つイベントがあるときは、それだけでボタンになる〔結果切替の変更。結果切替(2)(4) が見る〕ので、その行も外す）
		const resKey = (l) => (l || []).map((r) => r.skillId + ':' + r.hintLevel).sort().join(',');
		const isResultSwitch = (x) => !x.condition && (x.choices || []).some((c) => Array.isArray(c.results) && c.results.length >= 2 && c.results.some((r) => resKey(r) !== resKey(c.results[0])));
		const bare = Object.assign({}, EVDOC, { entries: EVDOC.entries.map((e) => e.umaId !== UMA_NONE.umaId ? e : Object.assign({}, e, { events: e.events.filter((x) => !isListed(x) && !isInfo(x) && !isResultSwitch(x)) })) });
		const sp4 = await openRoster(UMA_NONE.umaId, { evDoc: bare });
		const n4 = await sp4.page.evaluate((sel) => ({ btn: !!document.querySelector(sel), chip: !!document.querySelector('.usd-roster-gh .usd-roster-umamark') }), EVBTN);
		assert(n4.btn === false && n4.chip === true, '育成イベント段3A 小窓に出す行が無い衣装は、これまでどおり札（◇）でボタンにならない', n4);
		assert(jsErrors(sp4.errors).length === 0, '育成イベント段3A(出す行なし) コンソールのエラー0', jsErrors(sp4.errors).slice(0, 3));
		await sp4.ctx.close();
	});

	await block('育成イベント段3B 小窓: イベント名は eventName（配列の順）・直下に条件文の1要素（空なら要素なし）・選択肢は「選択肢N」・見出しに名前の札', async () => {
		for (const U of [UMA_LONG, UMA_SHORT]) {
			const sp = await openRoster(U.umaId);
			await openPop(sp.page);
			const want = choiceEvents(U);
			const r = await sp.page.evaluate(() => {
				const evs = Array.from(document.querySelectorAll('[data-usd-el="event"]'));
				return { events: evs.map((b) => {
					const t = b.querySelector('.usd-roster-eventtitle');
					const c = b.querySelector('.usd-roster-eventcond');
					const labs = Array.from(b.querySelectorAll('.usd-roster-choicelabel')).map((x) => x.textContent);
					return { key: b.getAttribute('data-event-key'), title: t.textContent.replace(/\s*自動$/, ''), cond: c ? c.textContent : null, next: t.nextElementSibling === c && !!c, nConds: b.querySelectorAll('.usd-roster-eventcond').length, labs };
				}), head: !!document.querySelector('.uma-popover-title .usd-roster-evdiamond'), headText: (document.querySelector('.usd-ev-title-text') || {}).textContent };
			});
			const tag = U.umaId;
			assert(r.events.length === want.length && r.events.every((e, k) => e.key === 'uma:' + U.umaId + '#' + want[k].i && e.title === want[k].ev.eventName),
				'育成イベント段3B(' + tag + ') イベント名は eventName で、配列の位置の順（' + want.length + '件）', r.events.map((e) => e.title));
			assert(r.events.every((e, k) => (want[k].ev.condition === '' ? e.cond === null && e.nConds === 0 : e.cond === want[k].ev.condition && e.next && e.nConds === 1)),
				'育成イベント段3B(' + tag + ') 条件文は condition をそのまま・イベント名の直下に1要素。空のイベントには要素そのものが無い', r.events.map((e) => e.cond));
			assert(r.events.some((e) => e.cond === null) === want.some((x) => x.ev.condition === '') && r.events.every((e) => e.labs.every((l, k) => l === '選択肢' + (k + 1))),
				'育成イベント段3B(' + tag + ') 選択肢のボタンの見出しは「選択肢N」の番号だけ', r.events.map((e) => e.labs));
			assert(r.head && !!r.headText, '育成イベント段3B(' + tag + ') 小窓の見出しに名前の札（◇）と衣装名がある', r);
			await sp.ctx.close();
		}
	});

	await block('育成イベント段3C 選択は uma:<umaId>#N で保存され、再読み込みで残り、「！」が減る。リセットで消える', async () => {
		const U = UMA_LONG;
		const first = pendingEvents(U)[0];
		const key = 'uma:' + U.umaId + '#' + first.i;
		const sp = await openRoster(U.umaId);
		await openPop(sp.page);
		await sp.page.click('[data-usd-el="event"][data-event-key="' + key + '"] [data-usd-el="event-choice"][data-choice="1"]');
		await sp.page.waitForTimeout(300);
		const saved = await sp.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')).eventChoices);
		assert(saved && saved[key] === 1 && Object.keys(saved).length === 1, '育成イベント段3C 選ぶと eventChoices に { ' + key + ': 1 } だけが保存される（保存の形は今までと同じ）', saved);
		const unsel = await sp.page.evaluate((sel) => document.querySelector(sel).getAttribute('data-unselected'), EVBTN);
		assert(unsel === String(pendingEvents(U).length - 1), '育成イベント段3C 未選択の件数が1つ減る', unsel);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		await openPop(sp.page);
		const on = await sp.page.evaluate((k) => { const b = document.querySelector('[data-usd-el="event"][data-event-key="' + k + '"] [data-usd-el="event-choice"][data-choice="1"]'); return b && b.getAttribute('aria-checked'); }, key);
		assert(on === 'true', '育成イベント段3C 再読み込みしても、選んだ選択肢が選ばれたまま', on);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		await sp.page.click('#deck-roster-panel [data-usd-act="roster-reset"]');
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(300);
		const after = await sp.page.evaluate(() => { const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || '{}'); return { choices: r.eventChoices === undefined, uma: !r.umaId }; });
		assert(after.choices && after.uma, '育成イベント段3C リセットで eventChoices と育成ウマ娘が消える（既存の ROSTER_RESET_KEYS）', after);
		assert(jsErrors(sp.errors).length === 0, '育成イベント段3C コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('育成イベント段3D 条件文の見た目: 11px・トークンの色（subtle）・折り返して全文・省略しない（375・320・1280px／ライト・ダーク）。コントラスト比を測る', async () => {
		const U = UMA_LONG;
		const longEv = choiceEvents(U).sort((a, b) => b.ev.condition.length - a.ev.condition.length)[0];
		const report = [];
		for (const w of [375, 320, 1280]) {
			for (const theme of ['light', 'dark']) {
				const sp = await openRoster(U.umaId, { w, theme, h: w === 1280 ? 900 : 812 });
				await openPop(sp.page);
				const r = await sp.page.evaluate((k) => {
					const c = document.querySelector('[data-usd-el="event"][data-event-key="' + k + '"] .usd-roster-eventcond');
					const cs = getComputedStyle(c);
					const probe = document.createElement('span'); probe.style.color = 'var(--uma-text-subtle)'; document.body.appendChild(probe);
					const subtle = getComputedStyle(probe).color; probe.remove();
					const rect = c.getBoundingClientRect();
					const lh = parseFloat(cs.lineHeight);
					return { fs: cs.fontSize, color: cs.color, subtle, ws: cs.whiteSpace, ov: cs.textOverflow, wrap: cs.overflowWrap, lines: Math.round(rect.height / lh), full: c.scrollHeight <= c.clientHeight + 1, sw: c.scrollWidth <= c.clientWidth + 1, left: rect.left, right: rect.right, vw: window.innerWidth, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, text: c.textContent, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
				}, 'uma:' + U.umaId + '#' + longEv.i);
				const tag = w + 'px・' + theme;
				assert(r.fs === '11px' && r.color === r.subtle && r.ws === 'normal' && r.ov !== 'ellipsis' && r.wrap === 'anywhere', '育成イベント段3D(' + tag + ') 11px・色は --uma-text-subtle・折り返す（省略しない）', { fs: r.fs, color: r.color, subtle: r.subtle, ws: r.ws, ov: r.ov, wrap: r.wrap });
				assert(r.text === longEv.ev.condition && r.full && r.sw && r.right <= r.vw + 0.5 && r.left >= -0.5 && !r.hscroll && r.lines <= 4, '育成イベント段3D(' + tag + ') いちばん長い条件文（' + longEv.ev.condition.length + '字）が全文出て、' + r.lines + '行（最悪4行以内）・横にはみ出さない', { lines: r.lines, full: r.full, sw: r.sw, left: r.left, right: r.right, vw: r.vw, hscroll: r.hscroll });
				// 地の色は、小窓のガラスと透けを合成した実際の見た目（文字の矩形の画素で最頻の色）から読む
				const shot = await sp.page.screenshot({ clip: { x: Math.max(0, r.rect.x), y: r.rect.y, width: Math.min(r.rect.w, r.vw - Math.max(0, r.rect.x)), height: r.rect.h } });
				const { w: pw, h: ph, bpp, px } = decodePng(shot);
				const counts = new Map();
				for (let i = 0; i < pw * ph; i++) { const k = px[i * bpp] + ',' + px[i * bpp + 1] + ',' + px[i * bpp + 2]; counts.set(k, (counts.get(k) || 0) + 1); }
				const bg = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
				const fg = (r.color.match(/\d+/g) || []).slice(0, 3).map(Number);
				const ratio = contrastRatio(fg, bg);
				report.push(tag + '：文字 ' + hexOf(fg) + '・地 ' + hexOf(bg) + '・コントラスト比 ' + ratio.toFixed(2));
				assert(Number.isFinite(ratio) && ratio > 1, '育成イベント段3D(' + tag + ') コントラスト比を測れた（' + ratio.toFixed(2) + '。文字 ' + hexOf(fg) + '・地 ' + hexOf(bg) + '。4.5 未満でも色は変えない）', { fg, bg, ratio });
				assert(jsErrors(sp.errors).length === 0, '育成イベント段3D(' + tag + ') コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			}
		}
		console.log('[報告] 条件文のコントラスト比\n  ' + report.join('\n  '));
	});

	await block('育成イベント段3E サポカ側のイベントは変わらない: 列見出しのボタン・小窓の見出し（「N回目」「共通イベント」）・条件文の要素が無い', async () => {
		const evCards = new Set(readJson('data/support-card-event-skills.json').entries.filter((x) => x.status === 'done' && x.chain.some((s) => s.choices.length >= 2)).map((x) => x.cardId));
		const cards = readJson('data/support-cards.json').entries.filter((c) => evCards.has(c.id)).slice(0, 2).map((c) => c.id);
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		await sp.page.evaluate((cs) => { localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ cardIds: cs })); localStorage.setItem('umaSkillDeck:stepTab', '0'); }, cards);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		const btns = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="events-btn"]')).map((b) => ({ key: b.getAttribute('data-member-key'), text: b.textContent, aria: b.getAttribute('aria-label'), cls: b.className })));
		assert(btns.length >= 1 && btns.every((b) => /^[1-6]$/.test(b.key) && /番のカードのイベントを選ぶ/.test(b.aria) && !/evbtn--uma/.test(b.cls) && (b.text === '!' || /^[1-6]$/.test(b.text))),
			'育成イベント段3E サポカの列見出しのボタンは番号か「！」のまま（◇のボタンにならない）', btns);
		await sp.page.click('[data-usd-el="events-btn"]');
		await sp.page.waitForSelector('[data-usd-el="event"]');
		const r = await sp.page.evaluate(() => ({ conds: document.querySelectorAll('.usd-roster-eventcond').length, titles: Array.from(document.querySelectorAll('.usd-roster-eventtitle')).map((t) => t.textContent.replace(/\s*自動$/, '')), diamond: !!document.querySelector('.uma-popover-title .usd-roster-evdiamond') }));
		assert(r.conds === 0 && !r.diamond && r.titles.length > 0 && r.titles.every((t) => /^(\d+回目|\d+つ目|共通イベント.*)$/.test(t)), '育成イベント段3E サポカの小窓: 条件文の要素は無く、イベント名は「N回目」「共通イベント…」のまま', r);
		assert(jsErrors(sp.errors).length === 0, '育成イベント段3E コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * 段3の追補: 選択肢が1つで条件のあるイベントを、小窓に読み取り専用の行として出す（2026-10-12・案A）
	 * ==================================================================== */
	const shownOf = (entry) => entry.events.map((ev, i) => ({ ev, i, info: isInfo(ev) })).filter((x) => x.info || isListed(x.ev));
	const openPopAny = async (page) => { await page.click(EVBTN); await page.waitForSelector('[data-usd-el="event"], [data-usd-el="event-info"]'); await page.waitForTimeout(300); };
	/** 小窓の左の行を、並びのまま読む */
	const readRows = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="events-pane-events"] [data-usd-el="event"], [data-usd-el="events-pane-events"] [data-usd-el="event-info"]')).map((b) => {
		const c = b.querySelector('.usd-roster-eventcond');
		const s = b.querySelector('[data-usd-el="event-info-skills"]');
		return { el: b.getAttribute('data-usd-el'), key: b.getAttribute('data-event-key'), title: b.querySelector('.usd-roster-eventtitle').textContent.replace(/\s*自動$/, ''),
			cond: c ? c.textContent : null, skills: s ? s.textContent : null, buttons: b.querySelectorAll('button').length, choiceBoxes: b.querySelectorAll('.usd-roster-choice').length,
			skillsBorder: s ? getComputedStyle(s).borderTopWidth : null };
	}));
	// 例に挙がった衣装（umaId で引く。名前は書かない）。選べる3件＋読み取り専用2件
	const U5 = EVDOC.entries.find((e) => e.umaId === 'uma-0064');
	// 選択肢が1つで条件が空のイベントを持つ衣装（実データから）
	const UMA_SE = EVDOC.entries.find((e) => e.events.some((x) => x.choices.length === 1 && x.condition === '' && successOf(x.choices[0]).length > 0) && e.events.some(isInfo));
	// 同名で条件だけ違うイベントを持つ衣装（実データから全部）
	const DUPS = EVDOC.entries.filter((e) => { const names = e.events.filter((x, i) => shownOf(e).some((s) => s.i === i)).map((x) => x.eventName); return names.length !== new Set(names).size; });

	await block('育成イベント段3F 読み取り専用の行: 例の衣装で5件（選べる3＋読み取り専用2）が配列の順に並び、条件文と「スキル名 LvN」が出て、ボタンも選択肢の枠も無い', async () => {
		const U = U5;
		const want = shownOf(U);
		assert(want.length === 5 && want.filter((x) => x.info).length === 2, '育成イベント段3F 例の衣装（' + U.umaId + '）のデータは、出す行が5件（読み取り専用2件）', want.map((x) => x.i + (x.info ? 'R' : 'C')));
		const sp = await openRoster(U.umaId);
		await openPopAny(sp.page);
		const rows = await readRows(sp.page);
		const names = await sp.page.evaluate((ids) => ids.map((id) => UmaSkillDeckCore.getSkillName(id)), want.flatMap((x) => x.info ? successOf(x.ev.choices[0]).map((r) => r.skillId) : []));
		let k = 0;
		const expSkills = want.map((x) => x.info ? successOf(x.ev.choices[0]).map((r) => names[k++] + ' Lv' + r.hintLevel).join('、') : null);
		assert(rows.length === 5 && rows.every((r, j) => r.key === 'uma:' + U.umaId + '#' + want[j].i && r.title === want[j].ev.eventName && r.el === (want[j].info ? 'event-info' : 'event')),
			'育成イベント段3F 5件がイベントの配列の順（位置 N）に、選べる行と読み取り専用の行を混ぜて並ぶ', rows.map((r) => r.key + ' ' + r.el));
		const ro = rows.filter((r) => r.el === 'event-info');
		assert(ro.length === 2 && ro.every((r) => r.buttons === 0 && r.choiceBoxes === 0 && r.skillsBorder === '0px'),
			'育成イベント段3F 読み取り専用の行にはボタンも選択肢の枠も無い', ro);
		assert(rows.every((r, j) => !want[j].info || (r.cond === want[j].ev.condition && r.skills === expSkills[j])),
			'育成イベント段3F 読み取り専用の行に、条件文（全文）と得るスキル（「スキル名 LvN」を「、」区切り）が出る', ro.map((r) => [r.cond, r.skills]));
		// 「未選択N件」と「！」の数は、選べるイベント（変更前の数え方）だけから決まる
		const need = pendingEvents(U).length;
		const cnt = await sp.page.evaluate((sel) => ({ btn: document.querySelector(sel).getAttribute('data-unselected'), head: (document.querySelector('[data-usd-el="events-unselected"]') || {}).textContent }), EVBTN);
		assert(cnt.btn === String(need) && cnt.head === '未選択' + need + '件', '育成イベント段3F 「！」と「未選択N件」は ' + need + ' 件のまま（読み取り専用の行を数えない）', cnt);
		assert(jsErrors(sp.errors).length === 0, '育成イベント段3F コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('育成イベント段3F 選択の鍵と数は変わらない: 全衣装で、選べるイベントの鍵（uma:<umaId>#N）と未選択の数は変更前の数え方どおり。読み取り専用の行は res.events に入らない', async () => {
		const sp = await openSp({ roster: null });
		const ids = EVDOC.entries.map((e) => e.umaId);
		const got = await sp.page.evaluate((list) => list.map((id) => {
			const a = UmaSkillDeckCore.computeRosterSkills({ umaId: id, cardIds: [] });
			const ev = a.events.filter((e) => e.kind === 'umaEvent');
			return { id, keys: ev.map((e) => e.eventKey), pending: ev.filter((e) => e.pending).length, info: (a.infoEvents || []).map((e) => e.eventKey) };
		}), ids);
		const bad = [];
		got.forEach((g) => {
			const e = EVDOC.entries.find((x) => x.umaId === g.id);
			const keys = choiceEvents(e).map((x) => 'uma:' + e.umaId + '#' + x.i);
			const info = e.events.map((x, i) => ({ x, i })).filter((y) => isInfo(y.x)).map((y) => 'uma:' + e.umaId + '#' + y.i);
			if (g.keys.join() !== keys.join() || g.pending !== pendingEvents(e).length || g.info.join() !== info.join() || g.info.some((k) => g.keys.includes(k))) bad.push({ g, keys, info });
		});
		assert(bad.length === 0 && got.length === EVDOC.entries.length, '育成イベント段3F ' + got.length + '衣装すべてで、選べるイベントの鍵・未選択の数が変更前と同じ・読み取り専用の行は別（' + got.reduce((s, g) => s + g.info.length, 0) + '件）', bad.slice(0, 3));
		assert(jsErrors(sp.errors).length === 0, '育成イベント段3F(鍵) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('育成イベント段3F 選択肢が1つで条件が空のイベントは出ない。同名で条件だけ違うイベントは条件文で区別できる', async () => {
		const U = UMA_SE;
		const sp = await openRoster(U.umaId);
		await openPopAny(sp.page);
		const rows = await readRows(sp.page);
		const hidden = U.events.map((x, i) => ({ x, i })).filter((y) => y.x.choices.length === 1 && y.x.condition === '').map((y) => 'uma:' + U.umaId + '#' + y.i);
		assert(hidden.length > 0 && rows.every((r) => !hidden.includes(r.key)) && rows.length === shownOf(U).length,
			'育成イベント段3F 選択肢が1つで条件が空のイベント（' + U.umaId + ' の ' + hidden.join('・') + '）は小窓に出ない', rows.map((r) => r.key));
		await sp.ctx.close();
		assert(DUPS.length >= 6, '育成イベント段3F 同名で条件だけ違うイベントを持つ衣装が実データにある（' + DUPS.length + '衣装）', DUPS.map((e) => e.umaId));
		for (const D of DUPS) {
			const s = await openRoster(D.umaId);
			await openPopAny(s.page);
			const rs = await readRows(s.page);
			const by = new Map();
			rs.forEach((r) => { if (!by.has(r.title)) by.set(r.title, []); by.get(r.title).push(r.cond); });
			const dupTitles = Array.from(by.entries()).filter(([, c]) => c.length > 1);
			assert(dupTitles.length > 0 && dupTitles.every(([, c]) => c.every((x) => typeof x === 'string' && x !== '') && new Set(c).size === c.length),
				'育成イベント段3F(' + D.umaId + ') 同名のイベントが、それぞれ違う条件文つきで出る', dupTitles);
			assert(jsErrors(s.errors).length === 0, '育成イベント段3F(' + D.umaId + ') コンソールのエラー0', jsErrors(s.errors).slice(0, 3));
			await s.ctx.close();
		}
	});

	await block('育成イベント段3F 320px: いちばん長い条件文（全イベント）と、読み取り専用の行でいちばん長い条件文が、折り返して全文出る。読み取り専用の条件文のコントラスト比を測る（ライト・ダーク）', async () => {
		const all = [];
		EVDOC.entries.forEach((e) => shownOf(e).forEach((x) => all.push({ e, x })));
		const longest = all.slice().sort((a, b) => b.x.ev.condition.length - a.x.ev.condition.length)[0];
		const longestInfo = all.filter((y) => y.x.info).sort((a, b) => b.x.ev.condition.length - a.x.ev.condition.length)[0];
		const report = [];
		for (const target of [longest, longestInfo]) {
			for (const theme of ['light', 'dark']) {
				const sp = await openRoster(target.e.umaId, { w: 320, theme });
				await openPopAny(sp.page);
				const key = 'uma:' + target.e.umaId + '#' + target.x.i;
				await sp.page.evaluate((k) => { const b = document.querySelector('[data-event-key="' + k + '"] .usd-roster-eventcond'); if (b) b.scrollIntoView({ block: 'center' }); }, key);
				await sp.page.waitForTimeout(150);
				const r = await sp.page.evaluate((k) => {
					const c = document.querySelector('[data-usd-el="events-pane-events"] [data-event-key="' + k + '"] .usd-roster-eventcond');
					const cs = getComputedStyle(c);
					const rect = c.getBoundingClientRect();
					return { text: c.textContent, color: cs.color, full: c.scrollHeight <= c.clientHeight + 1, sw: c.scrollWidth <= c.clientWidth + 1, left: rect.left, right: rect.right, vw: window.innerWidth, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, lines: Math.round(rect.height / parseFloat(cs.lineHeight)), rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
				}, key);
				const tag = target.e.umaId + '#' + target.x.i + (target.x.info ? '（読み取り専用）' : '（選べる行）') + '・' + theme;
				assert(r.text === target.x.ev.condition && r.full && r.sw && r.right <= r.vw + 0.5 && r.left >= -0.5 && !r.hscroll,
					'育成イベント段3F(' + tag + ') 320px で条件文（' + target.x.ev.condition.length + '字）が全文出て、' + r.lines + '行・横にはみ出さない', r);
				if (target.x.info) {
					const shot = await sp.page.screenshot({ clip: { x: Math.max(0, r.rect.x), y: r.rect.y, width: Math.min(r.rect.w, r.vw - Math.max(0, r.rect.x)), height: r.rect.h } });
					const { w: pw, h: ph, bpp, px } = decodePng(shot);
					const counts = new Map();
					for (let i = 0; i < pw * ph; i++) { const kk = px[i * bpp] + ',' + px[i * bpp + 1] + ',' + px[i * bpp + 2]; counts.set(kk, (counts.get(kk) || 0) + 1); }
					const bg = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
					const fg = (r.color.match(/\d+/g) || []).slice(0, 3).map(Number);
					const ratio = contrastRatio(fg, bg);
					report.push(tag + '：文字 ' + hexOf(fg) + '・地 ' + hexOf(bg) + '・コントラスト比 ' + ratio.toFixed(2));
					assert(Number.isFinite(ratio) && ratio > 1, '育成イベント段3F(' + tag + ') 読み取り専用の条件文のコントラスト比を測れた（' + ratio.toFixed(2) + '）', { fg, bg, ratio });
				}
				assert(jsErrors(sp.errors).length === 0, '育成イベント段3F(' + tag + ') コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			}
		}
		console.log('[報告] 読み取り専用の行の条件文のコントラスト比（320px）\n  ' + report.join('\n  '));
	});


	/* ====================================================================
	 * 2026-10-14a の取り込み（B）と defaultChoice（C-157）
	 * ==================================================================== */
	const withEvent = (doc, umaId, idx, patch) => Object.assign({}, doc, { entries: doc.entries.map((e) => e.umaId !== umaId ? e : Object.assign({}, e, { events: e.events.map((ev, i) => i !== idx ? ev : (typeof patch === 'function' ? patch(ev) : Object.assign({}, ev, patch))) })) });
	/** 警告を拾うために、読み込みの前に console を見張って開く */
	const openWatched = async (umaId, o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		sp.warns = [];
		sp.page.on('console', (m) => { if (m.type() === 'warning' && m.text().includes('defaultChoice')) sp.warns.push(m.text()); });
		if (o.evDoc) await sp.page.route('**/data/training-event-skills.json*', (r) => r.fulfill(json(o.evDoc)));
		await sp.page.evaluate(({ id, ch }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ umaId: id, cardIds: [], eventChoices: ch || undefined }));
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { id: umaId, ch: o.choices || null });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const eventsOf = (page, umaId, ch) => page.evaluate(({ umaId, ch }) => {
		const res = UmaSkillDeckCore.computeRosterSkills({ umaId, cardIds: [], eventChoices: ch || undefined }, { eventChoices: ch || {} });
		return { events: res.events.filter((e) => e.kind === 'umaEvent').map((e) => ({ key: e.eventKey, chosen: e.chosen, auto: e.auto, pending: e.pending })),
			sure: res.sources.filter((s) => s.kind === 'umaEvent').map((s) => ({ key: s.eventKey, skillId: s.skillId, sure: s.sure, lv: s.hintLevel })) };
	}, { umaId, ch });

	await block('育成イベント取り込みB 2026-10-14a: 実データで defaultChoice を持つイベントは範囲内の整数だけ。持つ衣装で既定が最初から選ばれ、「！」に数えない', async () => {
		const withDef = [];
		EVDOC.entries.forEach((e) => e.events.forEach((ev, i) => { if (ev.defaultChoice !== undefined) withDef.push({ umaId: e.umaId, i, ev }); }));
		assert(withDef.length > 0 && withDef.every((x) => hasDefault(x.ev)), '育成イベント取り込みB 前提: defaultChoice は実データにあり、すべて 1〜選択肢数 の整数（' + withDef.length + '件）', withDef.map((x) => x.umaId + '#' + x.i));
		const sp = await openWatched(withDef[0].umaId);
		const bad = [];
		for (const x of withDef) {
			const got = await eventsOf(sp.page, x.umaId, null);
			const ev = got.events.find((e) => e.key === 'uma:' + x.umaId + '#' + x.i);
			if (!ev || ev.chosen !== x.ev.defaultChoice - 1 || ev.pending || ev.auto) bad.push({ x: x.umaId + '#' + x.i, ev });
			const want = successOf(x.ev.choices[x.ev.defaultChoice - 1]).map((r2) => r2.skillId);
			const sure = got.sure.filter((s) => s.key === 'uma:' + x.umaId + '#' + x.i && s.sure).map((s) => s.skillId);
			if (!want.every((id) => sure.includes(id))) bad.push({ x: x.umaId + '#' + x.i, want, sure });
		}
		assert(bad.length === 0, '育成イベント取り込みB 実データの既定: 選ばれた状態（chosen）・「自動」でない・未選択でない・成功側が●（' + withDef.length + '件）', bad.slice(0, 3));
		await sp.ctx.close();
		for (const x of withDef) {
			const entry = EVDOC.entries.find((e) => e.umaId === x.umaId);
			const sp2 = await openWatched(x.umaId);
			const unsel = await sp2.page.evaluate((sel) => { const b = document.querySelector(sel); return b ? b.getAttribute('data-unselected') : null; }, EVBTN);
			assert(unsel === String(pendingEvents(entry).length), '育成イベント取り込みB ' + x.umaId + ': 列見出しの未選択の数は、既定のあるイベントを除いた ' + pendingEvents(entry).length + '件', unsel);
			await sp2.ctx.close();
		}
	});

	await block('育成イベント取り込みB ヒシアマゾン型（結果3→1）: 以前の保存（番号2）が残っていても壊れず、先頭の結果のスキルが●のまま・選ぶ行には出ない', async () => {
		const target = EVDOC.entries.map((e) => ({ e, i: e.events.findIndex((ev) => isInfo(ev) && successOf(ev.choices[0]).length > 0) })).find((x) => x.i >= 0);
		assert(!!target, '育成イベント取り込みB 前提: 読み取り専用の行を持つ衣装がある', null);
		const key = 'uma:' + target.e.umaId + '#' + target.i;
		const want = successOf(target.e.events[target.i].choices[0]).map((x) => x.skillId);
		const oldShape = withEvent(EVDOC, target.e.umaId, target.i, (ev) => Object.assign({}, ev, { choices: [{ results: [successOf(ev.choices[0]), [], []] }] }));
		for (const [label, doc] of [['新しい形', EVDOC], ['旧い形（results 3つ）', oldShape]]) {
			const sp = await openWatched(target.e.umaId, { evDoc: doc, choices: { [key]: 2 } });
			const got = await eventsOf(sp.page, target.e.umaId, { [key]: 2 });
			const sure = got.sure.filter((s) => s.key === key && s.sure).map((s) => s.skillId);
			assert(want.every((id) => sure.includes(id)) && !got.events.some((e) => e.key === key), '育成イベント取り込みB ' + label + ' + 古い保存(番号2): 先頭の結果のスキルが●で、選ぶ行には出ない', { sure, want, events: got.events.map((e) => e.key) });
			await sp.page.click(EVBTN).catch(() => {});
			await sp.page.waitForTimeout(300);
			assert(jsErrors(sp.errors).length === 0, '育成イベント取り込みB ' + label + ' + 古い保存: 小窓を開いてもコンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('育成イベントC defaultChoice（C-157・合成データ）: 既定が選択済み・「！」に数えない・別の選択肢に変えられて保存される・外すと外した状態を保つ', async () => {
		const U = UMA_LONG;
		const first = pendingEvents(U)[0];
		const key = 'uma:' + U.umaId + '#' + first.i;
		const n = first.ev.choices.length;
		const doc = withEvent(EVDOC, U.umaId, first.i, { defaultChoice: 2 });
		const total = pendingEvents(U).length;
		const sp = await openWatched(U.umaId, { evDoc: doc });
		const state = (p) => p.evaluate(({ sel, key }) => ({
			unsel: document.querySelector(sel) ? document.querySelector(sel).getAttribute('data-unselected') : null,
			on: Array.from(document.querySelectorAll('[data-usd-el="event"][data-event-key="' + key + '"] [data-usd-el="event-choice"]')).map((b) => b.getAttribute('aria-checked') === 'true'),
			autoTag: !!document.querySelector('[data-usd-el="event"][data-event-key="' + key + '"] [data-usd-el="event-auto"]'),
			saved: (JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')) || {}).eventChoices || null
		}), { sel: EVBTN, key });
		const press = async (p, c) => { await p.click('[data-usd-el="event"][data-event-key="' + key + '"] [data-usd-el="event-choice"][data-choice="' + c + '"]'); await p.waitForTimeout(300); };
		let st = await state(sp.page);
		assert(st.unsel === String(total - 1) && st.saved === null, '育成イベントC 既定のあるイベントは「！」に数えない（未選択 ' + (total - 1) + '件）・保存はまだ空', st);
		await openPop(sp.page);
		st = await state(sp.page);
		assert(st.on.length === n && st.on[1] === true && st.on.filter(Boolean).length === 1 && st.autoTag === false, '育成イベントC 小窓で既定の選択肢（2番目）が選択済み・「自動」の印は出ない', st);
		await press(sp.page, 0);
		st = await state(sp.page);
		assert(st.saved && st.saved[key] === 0 && st.on[0] === true && st.on.filter(Boolean).length === 1, '育成イベントC 別の選択肢に変えると、その番号が保存される', st);
		if (!(await sp.page.isVisible('[data-usd-el="event"]'))) await openPop(sp.page);
		await press(sp.page, 0);
		st = await state(sp.page);
		assert(st.on.filter(Boolean).length === 0 && st.saved && st.saved[key] === -1, '育成イベントC 外すと既定に戻らず、外した状態（保存は -1）', st);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		await openPop(sp.page);
		st = await state(sp.page);
		assert(st.on.filter(Boolean).length === 0 && st.unsel === String(total), '育成イベントC 再読み込みしても外したまま。「！」にまた数える（未選択 ' + total + '件）', st);
		await press(sp.page, 1);
		st = await state(sp.page);
		assert(st.on[1] === true && st.saved[key] === 1, '育成イベントC 外した状態から既定の選択肢を押すと選ばれる（保存は 1）', st);
		const sp2 = await openWatched(U.umaId, { evDoc: doc });
		await openPop(sp2.page);
		await press(sp2.page, 1);
		const st2 = await state(sp2.page);
		assert(st2.on.filter(Boolean).length === 0 && st2.saved[key] === -1, '育成イベントC 保存が空で既定が選ばれているとき、既定の選択肢を押すと外した状態になる', st2);
		assert(jsErrors(sp.errors).length === 0 && jsErrors(sp2.errors).length === 0, '育成イベントC コンソールのエラー0', jsErrors(sp.errors).concat(jsErrors(sp2.errors)).slice(0, 3));
		await sp.ctx.close();
		await sp2.ctx.close();
	});

	await block('育成イベントC defaultChoice の無いイベントは従来どおり／範囲外（0・選択肢数より大きい・数字以外・小数・負）は無視して従来どおり、コンソールに警告', async () => {
		const U = UMA_LONG;
		const first = pendingEvents(U)[0];
		const key = 'uma:' + U.umaId + '#' + first.i;
		const total = pendingEvents(U).length;
		const n = first.ev.choices.length;
		const sp0 = await openWatched(U.umaId);
		const g0 = await eventsOf(sp0.page, U.umaId, null);
		const u0 = await sp0.page.evaluate((sel) => document.querySelector(sel).getAttribute('data-unselected'), EVBTN);
		const ev0 = g0.events.find((e) => e.key === key);
		assert(ev0 && ev0.chosen === null && ev0.pending === true && u0 === String(total) && sp0.warns.length === 0, '育成イベントC defaultChoice の無いイベント: 未選択で「！」に数える・警告は出ない', { ev0, u0, warns: sp0.warns });
		await sp0.ctx.close();
		for (const bad of [0, n + 1, 99, '2', 'x', 1.5, -1, true]) {
			const sp = await openWatched(U.umaId, { evDoc: withEvent(EVDOC, U.umaId, first.i, { defaultChoice: bad }) });
			const g = await eventsOf(sp.page, U.umaId, null);
			const u = await sp.page.evaluate((sel) => document.querySelector(sel).getAttribute('data-unselected'), EVBTN);
			const ev = g.events.find((e) => e.key === key);
			assert(ev && ev.chosen === null && ev.pending === true && u === String(total) && sp.warns.some((m) => m.includes('defaultChoice')), '育成イベントC defaultChoice=' + JSON.stringify(bad) + ': 無視して未選択のまま（「！」は ' + total + '件）・コンソールに警告', { ev, u, warns: sp.warns });
			assert(jsErrors(sp.errors).length === 0, '育成イベントC defaultChoice=' + JSON.stringify(bad) + ' コンソールのエラー0', jsErrors(sp.errors).slice(0, 2));
			await sp.ctx.close();
		}
		const info = EVDOC.entries.map((e) => ({ e, i: e.events.findIndex((ev) => ev.choices.length === 1) })).find((x) => x.i >= 0);
		const sp3 = await openWatched(info.e.umaId, { evDoc: withEvent(EVDOC, info.e.umaId, info.i, { defaultChoice: 1 }) });
		const g3 = await eventsOf(sp3.page, info.e.umaId, null);
		assert(!g3.events.some((e) => e.key === 'uma:' + info.e.umaId + '#' + info.i) && sp3.warns.length === 0 && jsErrors(sp3.errors).length === 0, '育成イベントC 選択肢が1つのイベントの defaultChoice=1 は何も変えない（選ぶ行にならない・警告なし）', g3.events.map((e) => e.key));
		await sp3.ctx.close();
	});
}
