// スキルのタグ整備（2026-10-17）と、レースで固定した距離の判定（同日）の検査。run-smoke.mjs の末尾から register35() で呼ばれる
// （塊の見出しはすべて「タグ整備」「レース距離」で始まる。`npm run test:visual -- --only=タグ整備,レース距離` で回せる）。
//
// 決め（2026-10-17。C-95 の4節を置き換え）: tags（distance・style・surface）には、説明文の末尾の＜…＞の語だけを入れる。
//   本文の「〇〇レースなら」のような追加の効果の条件の語は入れない。固有スキルが「中距離レースなら」のような追加の効果の条件でレース条件に合わないとされる誤りを直した。
// (a) タグ整備: 固有スキル（衣装自身のスキル）が、長距離・芝のレース固定で①の表に出る／説明文から機械的に導いた期待値と全レース固定で一致する／
//     ②のテキストで検索・スクショで追加でも「レース条件に合わないため選べない」にならない／タグに追加の効果の語を戻すと落ちる（破壊確認）
// (b) レース距離: レースの距離（m）が決まっているレースを固定したとき、距離の数値の限定を実際の距離で判定する／距離が無いレース・レース未指定は区分で判定
// スキル名・衣装名・レース名は検査の側に書かない（恒久ルール1。id で書く）。

import { reloadReady } from './lib/page-ready.mjs';
export async function register35(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const RACES = readJson('data/upcoming-races.json').races;
	const raceOf = (id) => RACES.find((x) => x.id === id);
	const EXT = readJson('data/extended-skills.json');
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const DESC = new Map(readJson('data/skill-descriptions.json').entries.map((e) => [e.skillId, e.text]));
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const SKILL_NAME = new Map();
	[MASTER, EXT.entries].forEach((l) => l.forEach((s) => SKILL_NAME.set(s.id, s.name)));
	// uma-0221 の固有スキル。説明文に＜…＞が無く、本文の「中距離レースなら」が追加の効果の条件（調査で確認した例）
	const UMA = 'uma-0221', UNI = 'ex-0453';
	const LONG_TURF = raceOf('race-0002');   // 京都 芝3000m（長距離・芝）
	const mkRoster = (o) => Object.assign({ rosterId: 'r_tag', name: '', umaId: UMA, star: 3, awakeningLevel: 5, cardIds: [null, null, null, null, null, null] }, o);

	// 説明文の末尾の＜…＞の語（区分・バ場）。検査の期待値を説明文から機械的に導くために、ここで同じ読み方を持つ
	const BR_DIST = { '短距離': 'short', 'マイル': 'mile', '中距離': 'medium', '長距離': 'long' };
	const BR_SURF = { '芝': 'turf', 'ダート': 'dirt' };
	const bracketWords = (id) => {
		const t = DESC.get(id) || '';
		const m = /＜([^＞]*)＞\s*$/.exec(t);
		const words = m ? m[1].split(/[・/／、]/).map((w) => w.trim()) : [];
		return { has: !!m, dist: words.filter((w) => BR_DIST[w]).map((w) => BR_DIST[w]), surf: words.filter((w) => BR_SURF[w]).map((w) => BR_SURF[w]) };
	};
	const uniqueRows = EXT.entries.filter((e) => !e.tagsPending && PT.get(e.id) && PT.get(e.id).rarity === 'unique');

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		if (o.ext) await sp.page.route('**/data/extended-skills.json*', (r) => r.fulfill(json(o.ext)));
		await sp.page.evaluate(({ roster, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster === undefined ? null : o.roster, tab: o.tab === undefined ? 0 : o.tab });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		await sp.page.evaluate(() => UmaSkillDeckCore.loadTrainingSources(false));
		await sp.page.evaluate(() => UmaSkillDeckCore.loadSkillPtData(false));
		await sp.page.waitForTimeout(400);
		return sp;
	};
	const rowShown = (page, id) => page.evaluate((k) => !!document.querySelector('#deck-roster-panel .usd-roster-skillname[data-usd-info="' + k + '"]'), id);

	/* ====================================================================
	 * (a) タグ整備
	 * ==================================================================== */
	await block('タグ整備(a) 固有スキル（説明文に＜…＞が無く、本文に「中距離レースなら」がある1件）が、長距離・芝のレース固定で①の表に出る。タグの追加の効果の語を戻すと出なくなる（破壊確認）', async () => {
		const e = EXT.entries.find((x) => x.id === UNI);
		assert(!!e && !bracketWords(UNI).has && e.tags.distance.length === 0, 'タグ整備(a) 前提: その固有スキルは説明文に＜…＞が無く、tags.distance が空（追加の効果の語がタグに無い）', { tags: e && e.tags.distance, has: bracketWords(UNI).has });
		const sp = await openSp({ roster: mkRoster({ race: LONG_TURF }) });
		const shown = await rowShown(sp.page, UNI);
		const part = await sp.page.evaluate((r) => UmaSkillDeckCore.getRosterVisiblePart(r), mkRoster({ race: LONG_TURF }));
		assert(shown && part.visibleIds.includes(UNI) && part.takenIds.includes(UNI), 'タグ整備(a) 長距離・芝のレース固定で、①の表にその固有スキルの行が出て、取得に数える（画面と core の両方）', { shown, vis: part.visibleIds.includes(UNI), taken: part.takenIds.includes(UNI) });
		const err = [];
		sp.page.on('pageerror', (x) => err.push(String(x)));
		assert(await sp.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'タグ整備(a) 横スクロールが出ない（390px）');
		await sp.ctx.close();
		// 破壊確認: タグに追加の効果の語（中距離）を戻したデータだと、同じ条件で行が出ない
		const broken = JSON.parse(JSON.stringify(EXT));
		broken.entries.find((x) => x.id === UNI).tags.distance = ['medium'];
		const sp2 = await openSp({ roster: mkRoster({ race: LONG_TURF }), ext: broken });
		const shown2 = await rowShown(sp2.page, UNI);
		assert(shown2 === false, 'タグ整備(a) 破壊確認: tags.distance に "medium" を戻すと、長距離・芝のレース固定で①の表から外れる（この検査が落ちる）', { shown2 });
		await sp2.ctx.close();
	});

	await block('タグ整備(b) 固有スキルは、どのレース固定（区分×バ場の4種と、レースの距離つきの3件）でも、説明文の＜…＞から機械的に導いた期待値のとおりに出る・外れる', async () => {
		const sp = await openSp({ roster: null });
		const noBracket = uniqueRows.filter((e) => !bracketWords(e.id).has);
		const cases = [];
		RACES.forEach((r) => { if (r.distanceCategory && r.surface) cases.push({ race: r, withDist: !!r.distance }); });
		const res = await sp.page.evaluate(({ ids, cases }) => {
			const C = UmaSkillDeckCore;
			return ids.map((id) => {
				const s = C.findSkill(id);
				return { id, rd: !!s.raceDistance, pass: cases.map((cs) => {
					const lock = C.outside.lockedFilterOf({ race: cs.race });
					const f = {}; Object.keys(lock).forEach((k) => { f[k] = [lock[k]]; });
					return C.matchesFilters(s, f, C.raceLockedTargetOf(cs.race));
				}) };
			});
		}, { ids: uniqueRows.map((e) => e.id), cases: cases.map((c) => ({ race: c.race })) });
		const bad = [];
		let shownCells = 0;
		res.forEach((r) => {
			if (r.rd) return;   // 距離の数値の限定を持つ行は、下の塊（レース距離）で見る
			const w = bracketWords(r.id);
			cases.forEach((cs, i) => {
				const want = (w.dist.length === 0 || w.dist.includes(cs.race.distanceCategory)) && (w.surf.length === 0 || w.surf.every((v) => v === cs.race.surface));
				if (r.pass[i] !== want) bad.push(r.id + '@' + cs.race.id + ' 期待 ' + want);
				if (want) shownCells++;
			});
		});
		assert(bad.length === 0, 'タグ整備(b) 固有スキル（距離の数値の限定なし）× レース固定' + cases.length + '件: ①の述語の結果が、説明文の＜…＞から導いた期待値と全部一致する', bad.slice(0, 10));
		const allPass = noBracket.filter((e) => { const r = res.find((x) => x.id === e.id); return !r.rd && r.pass.every(Boolean); });
		assert(noBracket.length > 0 && allPass.length === noBracket.filter((e) => !res.find((x) => x.id === e.id).rd).length, 'タグ整備(b) 説明文に＜…＞が無い固有スキル（距離の数値の限定なし）' + allPass.length + '件は、どのレース固定でも距離・バ場を理由に外れない', { noBracket: noBracket.length, allPass: allPass.length });
		assert(shownCells > 0, 'タグ整備(b) 空振りしていない（出る側のセルがある）', { shownCells });
		await sp.ctx.close();
	});

	await block('タグ整備(c) ②のスクショで追加（画像から読み取る）の口: 同じ固有スキルが、長距離・芝のレース固定でも「レース条件に合わないため追加しなかったもの」にならず、追加できる（名前を入れて探す〔テキストで検索〕は、固有が検索の範囲外なので対象外）', async () => {
		const name = SKILL_NAME.get(UNI);
		const OTHER = 'uma-0001';   // 別の衣装（uma-0221 自身の編成だと、その固有スキルは「本育成で得るため選べません」になる）
		const sp = await openSp({ roster: mkRoster({ umaId: OTHER, race: LONG_TURF }), tab: 1 });
		const blocked = await sp.page.evaluate(({ id, race }) => UmaSkillDeckCore.raceBlocksSkill(UmaSkillDeckCore.findSkill(id), race), { id: UNI, race: LONG_TURF });
		assert(blocked === false, 'タグ整備(c) 前提: raceBlocksSkill（②の追加の4経路が共通で通る判定）が、その固有スキルを「合わない」としない', { blocked });
		const d = await sp.page.evaluate(({ id, name }) => {
			window.__rowsAdded = null;
			const rows = [{ raw: name, norm: name, kind: 'exact', matchedId: id, matchedName: name, candidates: [{ id: id, name: name, distance: 0 }] }];
			UmaSkillDeckCore.openSkillRowsPicker([], (list) => { window.__rowsAdded = list.slice(); }, rows, { white: 0, gold: 0, unreadable: 0 });
			return { race: (document.querySelector('[data-usd-el="paste-race-blocked"]') || {}).textContent || null, checked: document.querySelector('[data-usd-el="picker-checked-count"]').textContent };
		}, { id: UNI, name });
		assert(d.race === null && d.checked === '1種選択', 'タグ整備(c) スクショで追加: 「レース条件に合わないため追加しなかったもの」が出ず、1種が選択に入る', d);
		await sp.page.click('[data-usd-el="picker-commit"]');
		await sp.page.waitForTimeout(200);
		const added = await sp.page.evaluate(() => window.__rowsAdded);
		assert(Array.isArray(added) && added.length === 1 && added[0] === UNI, 'タグ整備(c) 確定で、その固有スキルが追加される', added);
		// 破壊確認の対: タグに追加の効果の語を戻したデータでは、同じ操作で「追加しなかったもの 1種」になる
		const broken = JSON.parse(JSON.stringify(EXT));
		broken.entries.find((x) => x.id === UNI).tags.distance = ['medium'];
		const sp2 = await openSp({ roster: mkRoster({ umaId: OTHER, race: LONG_TURF }), tab: 1, ext: broken });
		const d2 = await sp2.page.evaluate(({ id, name }) => {
			const rows = [{ raw: name, norm: name, kind: 'exact', matchedId: id, matchedName: name, candidates: [{ id: id, name: name, distance: 0 }] }];
			UmaSkillDeckCore.openSkillRowsPicker([], () => {}, rows, { white: 0, gold: 0, unreadable: 0 });
			return { race: (document.querySelector('[data-usd-el="paste-race-blocked"]') || {}).textContent || null, checked: document.querySelector('[data-usd-el="picker-checked-count"]').textContent };
		}, { id: UNI, name });
		assert(d2.race === 'レース条件に合わないため追加しなかったもの 1種' && d2.checked === '0種選択', 'タグ整備(c) 破壊確認: tags.distance に "medium" を戻すと、同じ操作で「レース条件に合わないため追加しなかったもの 1種」になる（この検査が落ちる）', d2);
		await sp.ctx.close();
		await sp2.ctx.close();
	});

	/* ====================================================================
	 * (b) レース距離
	 * ==================================================================== */
	// 距離の数値の限定（scope "all"）を持つ行の、距離 d への当たり方を、データから検査の側で読み直す（core の関数を使わない）
		const rdHit = (rd, d) => {
		const inRange = (rd.min == null || d >= rd.min) && (rd.max == null || d <= rd.max);
		if (typeof rd.standardDistance === 'boolean') {
			if ((rd.min != null || rd.max != null) && rd.standardDistanceScope === 'part') return inRange;
			return (d % 400 === 0) === rd.standardDistance;
		}
		return inRange;
	};

	await block('レース距離(a) レースの距離（m）が決まっているレースを固定すると、距離の数値の限定（scope all）を実際の距離で判定する。区分だけの判定との差が出るセルがある', async () => {
		const sp = await openSp({ roster: null });
		const rows = [].concat(MASTER, EXT.entries).filter((s) => s.raceDistance && s.raceDistance.scope === 'all' && !s.tagsPending);
		const withDist = RACES.filter((r) => typeof r.distance === 'number' && r.distanceCategory);
		const out = await sp.page.evaluate(({ ids, races }) => {
			const C = UmaSkillDeckCore;
			return ids.map((id) => {
				const s = C.findSkill(id);
				return { id, cells: races.map((r) => {
					const f = { distance: [r.distanceCategory] };
					const tgt = C.raceLockedTargetOf(r);
					return { raceId: r.id, withTarget: C.matchesFilters(s, f, tgt), classOnly: C.matchesFilters(s, f, null), hasTarget: !!tgt && tgt.distance === r.distance };
				}) };
			});
		}, { ids: rows.map((s) => s.id), races: withDist });
		const bad = [];
		let diff = 0, noTarget = 0;
		out.forEach((o) => {
			const rd = rows.find((s) => s.id === o.id).raceDistance;
			o.cells.forEach((c) => {
				const r = withDist.find((x) => x.id === c.raceId);
				if (!c.hasTarget) noTarget++;
				if (c.withTarget !== rdHit(rd, r.distance)) bad.push(o.id + '@' + c.raceId + ' 距離つき ' + c.withTarget);
				if (c.withTarget !== c.classOnly) diff++;
			});
		});
		assert(withDist.length >= 3 && rows.length > 0, 'レース距離(a) 前提: 距離つきのレースが3件以上・scope all の行がある', { races: withDist.length, rows: rows.length });
		assert(noTarget === 0, 'レース距離(a) 距離つきのレースは、距離を判定の目標として渡す（raceLockedTargetOf が距離を返す）', { noTarget });
		assert(bad.length === 0, 'レース距離(a) scope all の全行 × 距離つきのレース: 判定が、限定（範囲・根幹距離）をその距離に当てた結果と一致する', bad.slice(0, 10));
		assert(diff > 0, 'レース距離(a) 区分だけで判定したときと結果が違うセルがある（空振りでない。距離に当たらないのに出る誤りが直る）', { diff });
		await sp.ctx.close();
	});

	await block('レース距離(b) 距離の無いレース（区分だけ公開）・レース未指定は、これまでどおり区分で判定する（目標を渡さない）', async () => {
		const sp = await openSp({ roster: null });
		const noDist = RACES.filter((r) => r.distance == null);
		assert(noDist.length > 0, 'レース距離(b) 前提: 距離の無いレースがある', { n: noDist.length });
		const out = await sp.page.evaluate(({ races, ids }) => {
			const C = UmaSkillDeckCore;
			const nulls = races.map((r) => C.raceLockedTargetOf(r)).concat([C.raceLockedTargetOf(null), C.raceLockedTargetOf(undefined)]);
			const same = [];
			races.forEach((r) => {
				ids.forEach((id) => {
					const s = C.findSkill(id);
					const lock = C.outside.lockedFilterOf({ race: r }); const f = {}; Object.keys(lock).forEach((k) => { f[k] = [lock[k]]; });
					const blocked = C.raceBlocksSkill(s, r);
					const expect = C.raceRejectsSkill(s, r) || (Object.keys(f).length > 0 && !C.matchesFilters(s, f, null));
					if (blocked !== expect) same.push(id + '@' + r.id);
				});
			});
			return { nulls: nulls.every((x) => x === null), same };
		}, { races: noDist, ids: [].concat(MASTER, EXT.entries).filter((s) => s.raceDistance).map((s) => s.id) });
		assert(out.nulls, 'レース距離(b) 距離の無いレース・レース未指定・undefined では目標が null', out);
		assert(out.same.length === 0, 'レース距離(b) 距離の無いレースでの raceBlocksSkill は、区分とバ場だけで判定した結果と全行で一致する', out.same.slice(0, 10));
		await sp.ctx.close();
	});

	await block('レース距離(c) ①の表: 距離に当たらない限定を持つスキルは、そのレースを固定すると表から外れる（レース未指定・距離の無いレースでは出る）。②の追加の経路（raceBlocksSkill）も同じ判定', async () => {
		const sp = await openSp({ roster: null });
		const race = raceOf('race-0001');   // 京都 芝2200m
		const found = await sp.page.evaluate(async ({ race, umas }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(false); await C.loadSkillPtData(false);
			const lock = C.outside.lockedFilterOf({ race }); const f = {}; Object.keys(lock).forEach((k) => { f[k] = [lock[k]]; });
			for (const u of umas) {
				const res = C.computeRosterSkills({ umaId: u }, { autoChoose: true });
				for (const it of res.items) {
					if (!it.sure) continue;
					const s = C.findSkill(it.skillId);
					if (!s || !s.raceDistance || s.raceDistance.scope !== 'all') continue;
					if (C.matchesFilters(s, f, null) && !C.matchesFilters(s, f, C.raceLockedTargetOf(race))) return { uma: u, skillId: it.skillId };
				}
			}
			return null;
		}, { race, umas: readJson('data/training-umamusume.json').entries.map((u) => u.id) });
		assert(!!found, 'レース距離(c) 前提: 区分では出るが2200mには当たらない限定を持つスキルを、確実に得る衣装が見つかる', found);
		if (found) {
			const part = (r) => sp.page.evaluate((x) => UmaSkillDeckCore.getRosterVisiblePart(x), { umaId: found.uma, race: r });
			const withRace = await part(race), none = await part(undefined), noDist = await part(raceOf('race-0004'));
			assert(!withRace.visibleIds.includes(found.skillId), 'レース距離(c) 京都 芝2200m を固定: その限定を持つスキルは①の表に出ない', { id: found.skillId });
			assert(none.visibleIds.includes(found.skillId), 'レース距離(c) レース未指定: 表に出る', {});
			const blocked = await sp.page.evaluate(({ id, race }) => UmaSkillDeckCore.raceBlocksSkill(UmaSkillDeckCore.findSkill(id), race), { id: found.skillId, race });
			assert(blocked === true, 'レース距離(c) ②の追加の経路（raceBlocksSkill）も同じく「合わない」', { blocked });
			void noDist;
		}
		await sp.ctx.close();
	});
}
