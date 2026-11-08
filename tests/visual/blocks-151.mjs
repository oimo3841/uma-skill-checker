// T144（2026-11-09 おいもさんの依頼・決定 568〜571）: 交流重賞の3スキルを、大井・川崎・船橋・盛岡のレースでだけ有効にする検査。
// run-smoke.mjs の末尾から register151() で呼ばれる（塊の見出しはすべて「T144」で始まる。`npm run test:visual -- --only=T144` で回せる）。
//
//  (1) 表（core の SKILL_VENUE_LIMITS）とデータ: 対象は 186・ex-0607・ex-0445 の3つで、データの名前に「交流重賞」を含み、trackVenue は空（データは変えない）。
//  (2) 中山（4つ以外）のダートのレース: raceRejectsSkill の呼び出し元（raceRejectsSkill・②の追加の経路 raceBlocksSkill・オススメサポの母集団
//      outside.populationOf の raceExcludedIds・探索の金スキルの数え方 outside.build の universe）のすべてで3つが外れる。
//  (3) 大井・川崎・船橋・盛岡のレース: 3つは、レース場を空にした同じレースと同じ判定（＝今までどおり残る）。
//  (4) レース場が決まっていない（レースの指定なし・レース場の無い実データのレース・レース場だけ空にした架空のレース）: 外さない。
//  (5) 進化先（交流重賞の鬼の進化先。データの skill-evolutions から読む）は、中山のダートでも大井と同じ判定・同じ進化の決定。
//  (6) 決定 571: 緑スキル（レース条件）の候補（raceConditionSkillIds・isRaceConditionSkill）に3つは入らない（4つのレース場・中山のどちらでも）。
//      サポカ外の一覧（non-support-skills.json）に3つは無い（＝「サポカ外」の項目の結果は変わらない）。
// 名前は検査の側に書かない（恒久ルール1。id と、データから読んだ名前だけ）。

export async function register151(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const IDS = ['186', 'ex-0607', 'ex-0445'];
	const GOLD = 'ex-0445';
	const VENUES = ['track_oi', 'track_kawasaki', 'track_funabashi', 'track_morioka'];
	const MASTER = readJson('uma-skill-deck-skills.json');
	const EXT = readJson('data/extended-skills.json');
	const EVOS = readJson('data/skill-evolutions.json').entries;
	const NON_SUPPORT = readJson('data/non-support-skills.json');
	const RACES = readJson('data/upcoming-races.json').races;
	const allSkills = [].concat(Array.isArray(MASTER) ? MASTER : (MASTER.skills || MASTER.entries || []), EXT.entries || EXT.skills || []);
	const skillOf = (id) => allSkills.find((s) => s.id === id);
	const evoRow = EVOS.find((e) => e.baseSkillId === GOLD);
	const EVOLVED = evoRow ? evoRow.evolvedSkillIds.slice() : [];
	// 架空のレース: 実データの中山のレースを、ダート1800m にしたもの（3つはダートのスキル。②の経路でバ場で外れないように）
	const nk = RACES.find((r) => r.venue === 'track_nakayama');
	const DIRT = Object.assign({}, nk, { id: 'race-t144-nakayama', name: 'T144 中山ダート', surface: 'dirt', distance: 1800, distanceCategory: 'mile' });
	const atVenue = (v) => Object.assign({}, DIRT, { id: 'race-t144-' + (v || 'none'), name: 'T144 ' + (v || 'none'), venue: v });
	const NO_VENUE_REAL = RACES.filter((r) => !r.venue);

	const openSp = async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 390, height: 844 }, EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(300);
		await sp.page.evaluate(async () => {
			const C = UmaSkillDeckCore;
			await C.loadSkillEvolutions(); await C.loadTrainingSources(false); await C.loadSkillPtData(false); await C.loadUpcomingRaces(false);
		});
		return sp;
	};

	await block('T144(1) 交流重賞の3つ: 表は 186・ex-0607・ex-0445 → 大井・川崎・船橋・盛岡。データの名前は「交流重賞」を含み、trackVenue は空のまま', async () => {
		const sp = await openSp();
		const lim = await sp.page.evaluate(() => UmaSkillDeckCore.getSkillVenueLimits());
		assert(Object.keys(lim).sort().join() === IDS.slice().sort().join() && IDS.every((id) => lim[id].join() === VENUES.join()),
			'T144(1) 表は3つの id だけで、どれも大井・川崎・船橋・盛岡', lim);
		const rows = IDS.map((id) => { const s = skillOf(id); return { id, name: s && s.name, tv: s && s.tags && s.tags.trackVenue }; });
		assert(rows.every((r) => r.name && r.name.indexOf('交流重賞') === 0 && Array.isArray(r.tv) && r.tv.length === 0), 'T144(1) データ: 3つとも名前が「交流重賞」で始まり、trackVenue は空', rows);
		assert(!!nk && EVOLVED.length === 2, 'T144(1) 前提: 実データに中山のレースがあり、交流重賞の鬼の進化先は2つ', { nk: nk && nk.id, EVOLVED });
		assert(sp.errors.length === 0, 'T144(1) ページのエラーは0', sp.errors);
		await sp.ctx.close();
	});

	await block('T144(2)(3)(4) raceRejectsSkill・raceBlocksSkill: 中山のダートでは3つとも外れる。4つのレース場ではレース場を空にしたのと同じ（外れない）。レース場の無いレース・指定なしでは外さない', async () => {
		const sp = await openSp();
		const out = await sp.page.evaluate(({ IDS, nak, four, none, real }) => {
			const C = UmaSkillDeckCore;
			const j = (id, race) => { const s = C.findSkill(id); return { rej: C.raceRejectsSkill(s, race), blk: C.raceBlocksSkill(s, race) }; };
			return {
				found: IDS.map((id) => !!C.findSkill(id)),
				nak: IDS.map((id) => j(id, nak)),
				four: four.map((r) => IDS.map((id) => ({ v: r.venue, got: j(id, r), base: j(id, Object.assign({}, r, { venue: null })) }))),
				none: IDS.map((id) => j(id, none)),
				real: real.map((r) => IDS.map((id) => ({ race: r.id, got: j(id, r) }))),
				nul: IDS.map((id) => j(id, null))
			};
		}, { IDS, nak: DIRT, four: VENUES.map(atVenue), none: atVenue(null), real: NO_VENUE_REAL });
		assert(out.found.every(Boolean), 'T144(2) 3つとも findSkill で引ける', out.found);
		assert(out.nak.every((x) => x.rej === true && x.blk === true), 'T144(2) 中山ダート: raceRejectsSkill・raceBlocksSkill（②の追加の経路）とも3つが外れる', out.nak);
		const four = out.four.flat();
		assert(four.every((x) => x.got.rej === false && x.got.rej === x.base.rej && x.got.blk === x.base.blk), 'T144(3) 大井・川崎・船橋・盛岡のダート: 3つは外れず、レース場を空にした同じレースと同じ判定', four);
		assert(out.none.every((x) => x.rej === false && x.blk === false), 'T144(4) レース場だけ空にした中山ダート: 外さない', out.none);
		const real = out.real.flat();
		assert(real.length > 0 && real.every((x) => x.got.rej === false), 'T144(4) レース場の無い実データのレース（' + NO_VENUE_REAL.map((r) => r.id).join('・') + '）: raceRejectsSkill は外さない', real);
		assert(out.nul.every((x) => x.rej === false && x.blk === false), 'T144(4) レースの指定なし（null）: 外さない', out.nul);
		await sp.ctx.close();
	});

	await block('T144(2)(3)(4) オススメサポ: 母集団（populationOf）の「レース条件で外したもの」と探索の金スキル（build の universe）。中山のダートでは3つが外れ、大井では今までどおり、レース場なしでも外さない', async () => {
		const sp = await openSp();
		const out = await sp.page.evaluate(({ IDS, GOLD, races }) => {
			const C = UmaSkillDeckCore;
			const res = {};
			for (const [k, race] of Object.entries(races)) {
				const roster = { umaId: null, cardIds: [null, null, null, null, null, null], skillFilter: { surface: 'dirt' }, race: race };
				const pop = C.outside.populationOf(roster, {});
				const b = C.outside.build({ roster: roster, addedSkillIds: [] });
				res[k] = {
					ok: pop.ok, raceOut: pop.ok ? IDS.filter((id) => pop.raceExcludedIds.indexOf(id) !== -1) : null,
					inPop: pop.ok ? IDS.filter((id) => pop.set.has(id)) : null,
					goldInUniverse: b.ok ? b.universe.indexOf(GOLD) !== -1 : null, bok: b.ok, breason: b.reason || null
				};
			}
			return res;
		}, { IDS, GOLD, races: { nak: DIRT, oi: atVenue('track_oi'), morioka: atVenue('track_morioka'), none: atVenue(null) } });
		assert(out.nak.ok && out.oi.ok && out.none.ok, 'T144 オススメサポ 前提: 母集団が作れる', out);
		const whites = out.oi.inPop;
		assert(whites && whites.length > 0, 'T144 オススメサポ 前提: 大井のダートでは、母集団に3つのうち白のもの（' + (whites || []).join('・') + '）が入る', out.oi);
		assert(whites.every((id) => out.nak.raceOut.indexOf(id) !== -1) && out.nak.inPop.length === 0, 'T144(2) 中山ダート: 母集団から外れ、レース条件で外したもの（raceExcludedIds）に入る', out.nak);
		assert(out.oi.raceOut.length === 0 && out.morioka.raceOut.length === 0 && out.morioka.inPop.join() === whites.join(), 'T144(3) 大井・盛岡のダート: レース条件では外れない（母集団の顔ぶれは同じ）', { oi: out.oi, morioka: out.morioka });
		assert(out.none.raceOut.length === 0 && out.none.inPop.join() === whites.join(), 'T144(4) レース場の無い中山ダート: 外さない（大井と同じ顔ぶれ）', out.none);
		// 実データ（2026-11-09）では GOLD を得られるサポカが無いので、大井でも universe に入らない。中山で数えないこと・大井とレース場なしが同じことを見る
		assert(out.nak.bok && out.oi.bok && out.none.bok && out.nak.goldInUniverse === false && out.oi.goldInUniverse === out.none.goldInUniverse,
			'T144(2)(3) 探索の金スキル（build の universe）: ' + GOLD + ' は中山では数えず、大井とレース場なしは同じ扱い', { nak: out.nak, oi: out.oi, none: out.none });
		await sp.ctx.close();
	});

	await block('T144(5) 交流重賞の鬼の進化先: 中山のダートでも、大井のダート・レース場なしと同じ判定（raceRejectsSkill）と同じ進化の決定（computeEvolutionPlan）', async () => {
		const sp = await openSp();
		const out = await sp.page.evaluate(({ GOLD, EVOLVED, umaId, nak, oi, none }) => {
			const C = UmaSkillDeckCore;
			const rej = (race) => EVOLVED.map((id) => C.raceRejectsSkill(C.findSkill(id), race));
			const plan = (race) => {
				const pl = C.computeEvolutionPlan({ umaId: umaId, takenIds: [GOLD], filter: { distance: race.distanceCategory, surface: race.surface }, race: race });
				const row = (pl.a || []).find((e) => e.baseId === GOLD) || null;
				return row ? JSON.stringify({ choice: row.choice, def: row.default, targets: (row.targets || []).map((t) => [t.id, t.fit, (t.missing || []).join()]) }) : null;
			};
			return { found: EVOLVED.map((id) => !!C.findSkill(id)), rej: { nak: rej(nak), oi: rej(oi), none: rej(none) }, plan: { nak: plan(nak), oi: plan(oi), none: plan(none) } };
		}, { GOLD, EVOLVED, umaId: evoRow && evoRow.umaId, nak: DIRT, oi: atVenue('track_oi'), none: atVenue(null) });
		assert(out.found.every(Boolean), 'T144(5) 進化先（' + EVOLVED.join('・') + '）が findSkill で引ける', out.found);
		assert(out.rej.nak.every((x) => x === false) && out.rej.nak.join() === out.rej.oi.join() && out.rej.nak.join() === out.rej.none.join(), 'T144(5) 進化先の raceRejectsSkill: 中山ダートで外れず、大井・レース場なしと同じ', out.rej);
		assert(!!out.plan.nak && out.plan.nak === out.plan.oi && out.plan.nak === out.plan.none, 'T144(5) computeEvolutionPlan の ' + GOLD + ' の行（選択・既定・進化先の fit）: 中山ダート・大井ダート・レース場なしで同じ', out.plan);
		await sp.ctx.close();
	});

	await block('T144(6) 決定 571: 緑スキル（レース条件）の候補に3つは入らない（4つのレース場・中山）・サポカ外の一覧に3つは無い', async () => {
		const sp = await openSp();
		const out = await sp.page.evaluate(({ IDS, races }) => {
			const C = UmaSkillDeckCore;
			return {
				isRace: IDS.map((id) => C.outside.isRaceConditionSkill(C.findSkill(id))),
				cond: races.map((r) => ({ v: r.venue, n: C.outside.raceConditionSkillIds(r).length, hit: IDS.filter((id) => C.outside.raceConditionSkillIds(r).indexOf(id) !== -1) }))
			};
		}, { IDS, races: [DIRT].concat(VENUES.map(atVenue)) });
		assert(out.isRace.every((x) => x === false), 'T144(6) isRaceConditionSkill: 3つとも false（レースを選んでいないときに母集団から外す扱いは受けない＝今までどおり）', out.isRace);
		assert(out.cond.every((c) => c.hit.length === 0 && c.n > 0), 'T144(6) raceConditionSkillIds: 中山・大井・川崎・船橋・盛岡のどれでも3つは入らない', out.cond);
		const ns = (NON_SUPPORT.skillIds || NON_SUPPORT.ids || NON_SUPPORT.entries || []).map((x) => typeof x === 'string' ? x : (x && (x.skillId || x.id)));
		assert(ns.length > 0 && IDS.every((id) => ns.indexOf(id) === -1), 'T144(6) サポカ外の一覧（non-support-skills.json）に3つは無い（「サポカ外」の項目の結果は変わらない）', { n: ns.length });
		await sp.ctx.close();
	});
}
