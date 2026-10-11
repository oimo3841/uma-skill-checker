// 育成ウマ娘のイベントで得られるスキルを①の本育成の表に出す（2026-10-12）の検査。run-smoke.mjs の末尾から register23() で呼ばれる
// （塊の見出しはすべて「育成イベント」で始まる。`npm run test:visual -- --only=育成イベント` で回せる。段2だけなら「育成イベント段2」）。
//
// 段2（①の計算）: ●/△・選ぶと●・results は先頭だけ・Pt（初期 Lv3＋イベント Lv、上限5）・「本育成で得る」への反映・赤字の数が変わらない・行の無い衣装
// スキル名・イベント名・衣装名は検査の側に書かない（恒久ルール1）。実データ（data/training-event-skills.json）から読む。

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
			const pick = picks && Number.isInteger(picks[idx]) && sides.length >= 2 ? picks[idx] : null;
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
	await block('育成イベント段2A 全270衣装で、計算の出現（kind:umaEvent）がデータから独立に作った期待と一致する（●／△・eventKey・Lv・results は先頭だけ）', async () => {
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
		assert(EVDOC.entries.length === 270 && bad.length === 0, '育成イベント段2A 270衣装ぶんの出現が期待と一致（不一致 ' + bad.length + '件）', bad.slice(0, 5));
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
		const evCards = new Set(readJson('data/support-card-event-skills.json').entries.map((x) => x.cardId));
		const pendingCard = readJson('data/support-cards.json').entries.find((c) => !evCards.has(c.id)).id;
		const CARDS = [pendingCard].concat(CARDS6.slice(0, 5));
		const alertText = (page) => page.evaluate(() => { const a = document.querySelector('.usd-roster-alert'); return a ? a.textContent : ''; });
		const sp = await openSp({ roster: { cardIds: CARDS } });
		const noUma = await sp.page.evaluate((ids) => UmaSkillDeckCore.computeRosterSkills({ cardIds: ids }).unconfirmed.length, CARDS);
		const withUma = await sp.page.evaluate((ids) => UmaSkillDeckCore.computeRosterSkills({ umaId: 'uma-0001', cardIds: ids }).unconfirmed.length, CARDS);
		const t0 = await alertText(sp.page);
		assert(noUma > 0 && noUma === withUma, '育成イベント段2F 未収録の数（計算）は育成ウマ娘を足しても同じ', { noUma, withUma });
		await sp.ctx.close();
		const sp1 = await openSp({ roster: { umaId: 'uma-0001', cardIds: CARDS } });
		const t1 = await alertText(sp1.page);
		assert(t0 === t1, '育成イベント段2F 画面の赤字の文も同じ（「' + t0 + '」）', { t0, t1 });
		await sp1.ctx.close();
		// 行の無い衣装（entries から外した写しを返す）
		const doc = Object.assign({}, EVDOC, { entries: EVDOC.entries.filter((e) => e.umaId !== 'uma-0001') });
		const sp2 = await openSp({ evDoc: doc, roster: { umaId: 'uma-0001', cardIds: CARDS } });
		const r = await sp2.page.evaluate((ids) => {
			const a = UmaSkillDeckCore.computeRosterSkills({ umaId: 'uma-0001', cardIds: ids });
			return { ev: a.sources.filter((s) => s.kind === 'umaEvent').length, ch: a.events.filter((e) => e.kind === 'umaEvent').length, unconf: a.unconfirmed.length };
		}, CARDS);
		const t2 = await alertText(sp2.page);
		assert(r.ev === 0 && r.ch === 0 && r.unconf === noUma && t2 === t0, '育成イベント段2F entries に無い衣装: イベントの出どころ・選べるイベントとも0で、赤字も変わらない（エラーも出ない）', { r, t2 });
		assert(jsErrors(sp2.errors).length === 0, '育成イベント段2F コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});
}
