// 本育成サポカ外スキル（段1・段2。2026-10-04・C-122）の検査。run-smoke.mjs の末尾から register10() で呼ばれる
// （塊の見出しは「段10」を含む。`npm run test:visual -- --only=段10` で回せる）。
//
// 段1（純粋関数）: 母集団・候補・評価（金スキルは前段の鎖の白も足す）・探索（総当たりと一致・同点の選び方・締め切り）・表示の数・Pt
// 段2（保存）: roster.outsideCardExcluded（受け口は①のメモリ上の roster 経由。schemaVersion は 7 のまま・移行なし）
//
// 小さな固定の材料（合成したカード）は、実データのスキルID を使って作る（スキルの名前は書かない。恒久ルール1）。
// 合成したカードは data/support-cards.json などの応答を差し替えて渡す（本番のデータには触らない）。

export async function register10(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const scenReal = readJson('data/scenario-event-skills.json');
	const master = readJson('uma-skill-deck-skills.json').skills;
	const ptReal = readJson('data/skill-pt.json');
	const stepReal = readJson('data/skill-step-up.json');
	const rarityOf = new Map(ptReal.entries.map((e) => [e.skillId, e.rarity]));
	const prevOf = new Map(stepReal.entries.map((e) => [e.skillId, e.prevSkillIds || []]));
	const masterIds = new Set(master.map((s) => s.id));
	const REAL = { umaId: 'uma-0001', cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'] };
	const P = '#deck-roster-panel ';
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const ud = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData')));
	const rawUd = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
	const draftRoster = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));

	/* ---- 合成の材料: 実データから、条件に合うスキルIDを選ぶ ---- */
	const plain = (s) => rarityOf.get(s.id) === 'white' && (prevOf.get(s.id) || []).length === 0 && (s.tags.distance || []).length === 0 && (s.tags.style || []).length === 0 && (s.tags.surface || []).length === 0;
	// 金スキルの前段になっている・前段を持つスキルは、評価の検査の材料にしない（偶然の組み合わせを避ける）
	const isPrevOfSomething = new Set(); prevOf.forEach((list) => list.forEach((p) => isPrevOfSomething.add(p)));
	const W = master.filter((s) => plain(s) && !isPrevOfSomething.has(s.id)).slice(0, 20).map((s) => s.id);
	const gold1 = Array.from(prevOf.keys()).find((g) => rarityOf.get(g) === 'gold' && prevOf.get(g).length === 1 && masterIds.has(prevOf.get(g)[0]) && rarityOf.get(prevOf.get(g)[0]) === 'white' && (prevOf.get(prevOf.get(g)[0]) || []).length === 0);
	const p1 = prevOf.get(gold1)[0];
	// 鎖が2段の金: 金 → a → b。b だけが母集団（マスター）にある
	const gold2 = Array.from(prevOf.keys()).find((g) => rarityOf.get(g) === 'gold' && prevOf.get(g).length === 1 && (prevOf.get(prevOf.get(g)[0]) || []).length === 1 && masterIds.has(prevOf.get(prevOf.get(g)[0])[0]) && rarityOf.get(prevOf.get(prevOf.get(g)[0])[0]) === 'white');
	const a2 = prevOf.get(gold2)[0], b2 = prevOf.get(a2)[0];
	const wShort = master.find((s) => rarityOf.get(s.id) === 'white' && (prevOf.get(s.id) || []).length === 0 && !isPrevOfSomething.has(s.id) && JSON.stringify(s.tags.distance) === '["short"]' && !(s.tags.passive || []).length).id;
	const wMed = master.find((s) => rarityOf.get(s.id) === 'white' && (prevOf.get(s.id) || []).length === 0 && !isPrevOfSomething.has(s.id) && JSON.stringify(s.tags.distance) === '["medium"]' && !(s.tags.passive || []).length).id;
	const noPtId = master.find((s) => !rarityOf.has(s.id)).id;

	const sk = (id) => ({ skillId: id, name: 'x', hintLevel: 1 });
	const card = (id, chara, rarity, o = {}) => ({ id, title: 'T' + id, charaName: chara, type: 'スピード', typeOrder: 0, rarity, isGroup: !!o.group,
		hintSkills: (o.hint || []).map((s) => ({ skillId: s, name: 'x' })), dataStatus: { hint: o.hintStatus || 'done' } });
	const evRow = (cardId, status, chain) => Object.assign({ cardId, status }, status === 'seeded' ? { unplaced: chain } : { chain });
	const ev1 = (ids) => ({ step: 1, choices: [{ skills: ids.map(sk) }] });                  // 選択肢が1つ（●）
	const evN = (...alts) => ({ step: 1, choices: alts.map((ids) => ({ skills: ids.map(sk) })) });   // 選択肢が2つ以上（△）
	const CARDS = [];
	const EVENTS = [];
	const add = (c, status, chain) => { CARDS.push(c); EVENTS.push(evRow(c.id, status || 'done', chain || [])); };
	add(card('syn-c01', 'テストA', 'SSR', { hint: [p1, W[0]] }));                          // 例のカードA: 前段の白と右回り○にあたる2つ → 2点
	add(card('syn-c02', 'テストB', 'SSR', { hint: [gold1, W[0]] }));                       // 例のカードB: 金と右回り○にあたる1つ → 金＋前段の白＋白 = 3点
	add(card('syn-c03', 'テストC', 'SR'), 'done', [ev1([W[1]])]);
	add(card('syn-c04', 'テストC', 'SR'), 'done', [ev1([W[2]])]);                         // c03 と同じキャラクター
	add(card('syn-c05', 'テストD', 'SSR'), 'done', [evN([W[3]], [W[4], W[5]])]);           // △: 2つ得られる選択肢が最良
	add(card('syn-c06', 'テストE', 'SSR', { hint: [gold2] }));                             // 鎖が2段の金
	add(card('syn-c07', 'テストF', 'SR'));                                                 // 共通イベントだけ
	add(card('syn-c08', 'テストG', 'SSR', { hint: [W[7], W[8]] }), 'done', [ev1([W[8], W[9]])]);   // ヒントだけ W7／ヒントとイベント W8／イベントだけ W9
	add(card('syn-c09', 'テストH', 'SSR', { hint: [W[10]], group: true }));                // グループ → 候補にならない
	add(card('syn-c10', 'テストI', 'SSR'), 'seeded', [sk(W[10])]);                         // seeded → 候補にならない
	add(card('syn-c11', 'テストJ', 'R', { hint: [W[10]] }));                               // R → 候補にならない
	add(card('syn-c12', 'テストK', 'SSR', { hint: [W[11]], hintStatus: 'pending' }));      // ヒントが未確認 → ヒントは使わない（候補にはなる）
	add(card('syn-c13', 'テストL', 'SR', { hint: [wShort] }));
	add(card('syn-c14', 'テストM', 'SR', { hint: [wMed] }));
	add(card('syn-c15', 'テストN', 'SSR', { hint: [W[12], W[13]] }));                      // ①の6枚に入れるカード
	add(card('syn-c16', 'テストN', 'SR', { hint: [W[14]] }));                              // ①のカードと同じキャラクター（候補に残る）
	add(card('syn-c17', 'テストP', 'SSR', { hint: [W[12], W[13], W[15]] }));               // ①で得るスキルを持つ（それは数えない）
	add(card('syn-c18', 'テストQ', 'SSR', { hint: [a2] }));                                // ①のカード（鎖の途中の白を①で得る）
	add(card('syn-c19', 'テストR', 'SSR', { hint: [a2, b2] }));                            // ①のカード（鎖の根の白まで①で得る）
	// 同点の検査用
	add(card('syn-t01', 'テストS', 'SR', { hint: [W[16]] }));
	add(card('syn-t02', 'テストT', 'SSR', { hint: [W[16]] }));                             // 同点: SSR が多いほう
	add(card('syn-t03', 'テストU', 'SSR', { hint: [W[17]] }));
	add(card('syn-t04', 'テストV', 'SSR', { hint: [W[17]] }));                             // 同点: カード番号の小さいほう
	add(card('syn-t05', 'テストW', 'SR', { hint: [W[18], W[19]] }));                       // 同点: 1枚で足りるほう
	add(card('syn-t06', 'テストX', 'SSR', { hint: [W[18]] }));
	add(card('syn-t07', 'テストY', 'SSR', { hint: [W[19]] }));
	const CHARA_EVENTS = [{ charaName: 'テストF', status: 'done', events: [evN([W[6]], [])] }];
	const ALL_IDS = CARDS.map((c) => c.id);
	const onlyOf = (ids) => ALL_IDS.filter((id) => ids.indexOf(id) === -1);   // 「この候補だけ残す」ための除外の指定

	/** 合成のデータで special.html を開く（応答を差し替えて再読み込み。読み込みが済んだ状態で返す） */
	const openSynth = async (userData) => {
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, userData || EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		await sp.page.route('**/data/support-cards.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'supportCard', nextSerial: 'card-9999', note: 'x', entries: CARDS })));
		await sp.page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'supportCardEventSkill', note: 'x', entries: EVENTS })));
		await sp.page.route('**/data/character-event-skills.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'characterEventSkill', note: 'x', entries: CHARA_EVENTS })));
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(true); await UmaSkillDeckCore.loadSkillPtData(true); });
		return sp;
	};
	/** 実データで special.html を開く（保存の検査用。blocks-9 の openSet と同じ） */
	const openReal = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, o.userData || EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		await sp.page.evaluate(({ roster, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster === undefined ? REAL : o.roster, tab: o.tab === undefined ? 0 : o.tab });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const solve = (page, args) => page.evaluate((a) => UmaSkillDeckCore.outside.solveSync(a), args);
	const brief = (r) => ({ ok: r.ok, score: r.score, cards: r.cards.map((c) => c.cardId + ':' + c.gain), counts: r.counts, partial: r.partial });

	assert(!!gold1 && !!gold2 && W.length === 20 && !!wShort && !!wMed && !!noPtId && !masterIds.has(a2), '段10 前提: 実データから、金（前段1つ）・金（鎖が2段で途中の白は母集団の外）・平凡な白20・距離のタグを持つ白2・Pt 未収録のスキルを用意できる', { gold1, gold2, a2, b2, W: W.length });

	/* ====================================================================
	 * (A) 探索の部品: 総当たりと一致・同点の選び方・締め切り・決まった結果
	 * ==================================================================== */
	await block('段10(A) 探索: ランダムな小さな問題300個で総当たりと一致（同点の選び方まで）・毎回同じ結果・締め切りで途中の結果', async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, EMPTY);
		const r = await sp.page.evaluate(() => {
			const C = UmaSkillDeckCore.outside;
			let seed = 99; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
			let bad = 0, n = 0; const firstBad = [];
			for (let trial = 0; trial < 300; trial++) {
				const U = 8 + Math.floor(rnd() * 20), G = 4 + Math.floor(rnd() * 7), K = 2 + Math.floor(rnd() * 4);
				const groups = [];
				for (let g = 0; g < G; g++) {
					const opts = []; const no = 1 + Math.floor(rnd() * 3);
					for (let o = 0; o < no; o++) {
						const bits = []; const nb = Math.floor(rnd() * 5);
						for (let b = 0; b < nb; b++) bits.push(Math.floor(rnd() * U));
						opts.push({ card: 'c' + String(g).padStart(2, '0') + String.fromCharCode(97 + o), ssr: rnd() < 0.5 ? 1 : 0, bits: bits });
					}
					groups.push({ key: 'g' + g, options: opts });
				}
				let best = null;
				const rec = (gi, picks) => {
					if (gi === G) {
						if (picks.length === 0 || picks.length > K) return;
						const cov = new Set(); picks.forEach((o) => o.bits.forEach((b) => cov.add(b)));
						const cand = { score: cov.size, size: picks.length, ssr: picks.reduce((s, o) => s + o.ssr, 0), ids: picks.map((o) => o.card).sort() };
						if (cand.score === 0) return;
						const better = !best || cand.score > best.score || (cand.score === best.score && (cand.size < best.size || (cand.size === best.size && (cand.ssr > best.ssr || (cand.ssr === best.ssr && cand.ids.join() < best.ids.join())))));
						if (better) best = cand;
						return;
					}
					rec(gi + 1, picks);
					groups[gi].options.forEach((o) => rec(gi + 1, picks.concat([o])));
				};
				rec(0, []);
				const res = C.solveGroups(groups, U, K, { deadlineMs: 5000 });
				const res2 = C.solveGroups(groups, U, K, { deadlineMs: 5000 });
				n++;
				const same = res.score === res2.score && res.cards.join() === res2.cards.join();
				if (!same || (!best ? res.score !== 0 : (res.score !== best.score || res.cards.join() !== best.ids.join()))) { bad++; if (firstBad.length < 3) firstBad.push({ trial, engine: res.score + ' ' + res.cards.join(), brute: best && (best.score + ' ' + best.ids.join()), same }); }
			}
			// 締め切り: 探索に数十万ノードかかる問題（最後まで回すと約0.3秒）を締め切り 0ms で回すと、途中の結果の印が付き、それまでの最良（貪欲法の解以上）が返る
			const groups = []; let s2 = 5; const r2 = () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; };
			for (let g = 0; g < 20; g++) { const opts = []; for (let o = 0; o < 3; o++) { const bits = []; for (let b = 0; b < 4; b++) bits.push(Math.floor(r2() * 50)); opts.push({ card: 'c' + String(g).padStart(2, '0') + o, ssr: 0, bits: bits }); } groups.push({ key: 'g' + g, options: opts }); }
			const cut = C.solveGroups(groups, 50, 6, { deadlineMs: 0 });
			const full = C.solveGroups(groups, 50, 6, { deadlineMs: 20000 });
			return { n, bad, firstBad, cut: { partial: cut.partial, score: cut.score, size: cut.size }, full: { partial: full.partial, score: full.score } };
		});
		assert(r.n === 300 && r.bad === 0, '段10(A) 探索: 300問すべてで、総当たり（点数・同点の選び方〔枚数が少ない→SSRが多い→番号〕）と一致し、2回回しても同じ結果', r);
		assert(r.cut.partial === true && r.cut.score > 0 && r.cut.score <= r.full.score && r.full.partial === false, '段10(A) 締め切りに達したとき、途中の結果の印（partial）が付き、それまでの最良（最適以下）を返す。最後まで回れば印は付かない', r);
		assert(jsErrors(sp.errors).length === 0, '段10(A) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (B) 合成のカードで: 候補・母集団・評価・由来・表示の数・同点・Pt
	 * ==================================================================== */
	await block('段10(B) 候補のカード（SSR・SR・グループでない・イベント行 done）と、①の6枚・除外の扱い', async () => {
		const sp = await openSynth();
		const ids = await sp.page.evaluate(() => {
			const C = UmaSkillDeckCore.outside;
			const idsOf = (list) => list.map((c) => c.id).sort();
			return {
				all: idsOf(C.candidatesOf({})),
				inRoster: idsOf(C.candidatesOf({ cardIds: ['syn-c15', null, null] })),
				excluded: idsOf(C.candidatesOf({ outsideCardExcluded: ['syn-c13', 'syn-9999'] })),
				extra: idsOf(C.candidatesOf({}, ['syn-c14']))
			};
		});
		const not = ['syn-c09', 'syn-c10', 'syn-c11'];
		assert(not.every((id) => !ids.all.includes(id)) && ids.all.includes('syn-c12') && ids.all.length === ALL_IDS.length - not.length,
			'段10(B) 候補: グループ（c09）・seeded（c10）・R（c11）は入らない。ヒントが未確認のカード（c12）は候補になる', { all: ids.all.length, expected: ALL_IDS.length - not.length });
		assert(!ids.inRoster.includes('syn-c15') && ids.inRoster.includes('syn-c16') && ids.inRoster.length === ids.all.length - 1,
			'段10(B) 候補: ①の6枚（cardIds）のカードだけが除かれ、同じキャラクターの別のカード（c16）は残る', ids.inRoster.length);
		assert(!ids.excluded.includes('syn-c13') && ids.excluded.length === ids.all.length - 1 && !ids.extra.includes('syn-c14') && ids.extra.length === ids.all.length - 1,
			'段10(B) 候補: 提案から外したカード（outsideCardExcluded。引けないIDは無視）と、引数で外したカードが除かれる', { ex: ids.excluded.length, extra: ids.extra.length });
		assert(jsErrors(sp.errors).length === 0, '段10(B) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('段10(B) 母集団: ②に追加できる白（金は入らない）・①の絞り込み・●・OFFを除く・すでに②にあるものは残る・タグを持たないものは絞り込みで残る', async () => {
		const sp = await openSynth();
		const r = await sp.page.evaluate(({ W, wShort, wMed, noPtId, gold1, gold2, p1, b2 }) => {
			const C = UmaSkillDeckCore.outside;
			const pop = (roster) => { const p = C.populationOf(roster); return p.ok ? new Set(p.ids) : null; };
			const base = pop({});
			const poolIds = new Set(UmaSkillDeckCore.getMasterSkills().map((s) => s.id));
			const short = pop({ skillFilter: { distance: 'short' } });
			const med = pop({ skillFilter: { distance: 'medium' } });
			const withRoster = pop({ cardIds: ['syn-c15'], offSkillIds: [W[13]] });
			const added = C.build({ roster: {}, addedSkillIds: [W[0]] });
			return {
				size: base.size, hasGold: base.has(gold1) || base.has(gold2), hasP1: base.has(p1), hasNoPt: base.has(noPtId), allInPool: Array.from(base).every((id) => poolIds.has(id) || id.startsWith('ex-')),
				shortHas: [short.has(wShort), short.has(wMed), short.has(W[0])], medHas: [med.has(wShort), med.has(wMed), med.has(W[0])],
				rosterHas: [withRoster.has(W[12]), withRoster.has(W[13]), withRoster.has(W[14]), withRoster.has(W[0])],
				addedStill: added.pop.set.has(W[0])
			};
		}, { W, wShort, wMed, noPtId, gold1, gold2, p1, b2 });
		assert(r.size === 452 && !r.hasGold && r.hasP1 && r.hasNoPt, '段10(B) 母集団: 条件で検索と緑スキルの合計の452種（白444＋Pt 未収録8）。金は入らず、Pt 未収録も残る', r);
		assert(r.shortHas.join() === 'true,false,true' && r.medHas.join() === 'false,true,true', '段10(B) 母集団: ①の絞り込み（距離）に合うものだけが残り、距離のタグを持たないスキルは絞り込みでも残る', r);
		assert(r.rosterHas.join() === 'false,false,true,true', '段10(B) 母集団: ①の●（c15 のヒント）と、①でOFFにしたスキルは入らない。①で得ないスキルは残る', r);
		assert(r.addedStill, '段10(B) 母集団: すでに②にあるスキルは入れたまま', r);
		await sp.ctx.close();
	});

	await block('段10(B) 評価: 金スキルを得たら前段の白も足し、金を別に1点（カードA 2点・カードB 3点）。表示の数は 2種（金スキル1種）', async () => {
		const sp = await openSynth();
		const A = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-c01']) });
		const B = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-c02']) });
		const AB = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-c01', 'syn-c02']) });
		assert([A, B, AB].every((x) => x.stats.engineScore === x.score), '段10(B) 探索の点数（ビットの数）と、結果の組み立ての点数（白＋金）が一致する', [A, B, AB].map((x) => [x.stats.engineScore, x.score]));
		assert(A.score === 2 && A.counts.kinds === 2 && A.counts.gold === 0, '段10(B) カードA（前段の白と白の2つ）は 2点・2種・金スキル0', brief(A));
		assert(B.score === 3 && B.counts.kinds === 2 && B.counts.gold === 1 && B.counts.white === 2 && B.golds.length === 1 && B.golds[0].skillId === gold1,
			'段10(B) カードB（金と白）は、金＋前段の白＋白の 3点。表示は 2種（金スキル1種）で、白の行は2つ。Bのほうが高く評価される', brief(B));
		assert(B.score > A.score && AB.score === 3 && AB.counts.kinds === 2 && AB.cards.length === 2, '段10(B) 2枚を合わせても、重なりは1回ずつ（前段の白と白は共通なので 3点）', brief(AB));
		const b = await sp.page.evaluate(({ gold2, a2, b2, p1, gold1 }) => {
			const prob = UmaSkillDeckCore.outside.build({ roster: {} });
			const ex = Array.from(prob.expandIds([gold2]));
			return { ex, chainBoth: ex.includes(a2) && ex.includes(b2), gold1Countable: prob.countableGolds.has(gold1), gold2Countable: prob.countableGolds.has(gold2), inUniverse: [prob.idx.has(a2), prob.idx.has(b2), prob.idx.has(p1)] };
		}, { gold2, a2, b2, p1, gold1 });
		assert(b.chainBoth && b.gold1Countable && b.gold2Countable && b.inUniverse.join() === 'false,true,true',
			'段10(B) 鎖が2段の金（金→a→b）は、前段の白を全部（a も b も）足す。数えるのは母集団にある b だけ。b が母集団にあるので金は点数になる（前段の鎖のどこかに母集団の白を持つ）', b);
		const C6 = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-c06']) });
		assert(C6.stats.engineScore === C6.score, '段10(B) 鎖が2段の金でも、探索の点数と組み立ての点数が一致する', [C6.stats.engineScore, C6.score]);
		assert(C6.score === 2 && C6.counts.gold === 1 && C6.counts.white === 1 && C6.counts.kinds === 1, '段10(B) 鎖が2段の金だけを持つカード: 点数 2（金＋b）・金スキル1・種数は 1（金と前段の白で1種）', brief(C6));
		const noB = await solve(sp.page, { roster: { cardIds: ['syn-c19'] }, count: 5, excludedCardIds: onlyOf(['syn-c06']) });
		const onlyA = await solve(sp.page, { roster: { cardIds: ['syn-c18'] }, count: 5, excludedCardIds: onlyOf(['syn-c06']) });
		assert(noB.score === 0 && onlyA.score === 2, '段10(B) 前段の鎖の白が全部①で得るものなら金は数えない（点数0）。根の白が残っていれば金も数える（点数2）', { noB: noB.score, onlyA: onlyA.score });
		assert(jsErrors(sp.errors).length === 0, '段10(B) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('段10(B) 同じキャラクターは入らない・5枚と6枚・除外が効く・△の最良・ヒント／共通イベントの由来・ヒントでは得られないものは数えない', async () => {
		const sp = await openSynth();
		const six = await solve(sp.page, { roster: {}, count: 6 });
		const five = await solve(sp.page, { roster: {}, count: 5 });
		const chars = (r) => r.cards.map((c) => c.charaName);
		assert(six.cards.length === 6 && five.cards.length === 5 && new Set(chars(six)).size === 6 && new Set(chars(five)).size === 5, '段10(B) 6枚と5枚が返り、同じキャラクターは入らない', { six: chars(six), five: chars(five) });
		assert(!(six.cards.some((c) => c.cardId === 'syn-c03') && six.cards.some((c) => c.cardId === 'syn-c04')), '段10(B) 同じキャラクターの2枚（c03・c04）が両方入ることはない', six.cards.map((c) => c.cardId));
		const ex = await solve(sp.page, { roster: { outsideCardExcluded: [six.cards[0].cardId] }, count: 6 });
		assert(!ex.cards.some((c) => c.cardId === six.cards[0].cardId), '段10(B) 提案から外したカード（roster.outsideCardExcluded）は入らない', six.cards[0].cardId);
		const r5 = await solve(sp.page, { roster: { cardIds: ['syn-c15'] }, count: 6 });
		assert(!r5.cards.some((c) => c.cardId === 'syn-c15'), '段10(B) ①の6枚のカードは入らない', r5.cards.map((c) => c.cardId));
		const tri = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-c05']) });
		assert(tri.score === 2 && tri.skills.map((s) => s.skillId).sort().join() === [W[4], W[5]].sort().join() && tri.skills.every((s) => s.unsure === true && s.event && !s.hint)
			&& tri.cards[0].picks.length === 1 && tri.cards[0].picks[0].choiceIndex === 1, '段10(B) △（選択肢が2つ）は最良の選び方で数える（2つ得られる選択肢）。由来はイベント・△。選んだ選択肢が結果に残る', tri.skills.map((s) => s.skillId));
		const hint = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-c08']) });
		const by = Object.fromEntries(hint.skills.map((s) => [s.skillId, s]));
		assert(hint.score === 3 && by[W[7]].hint && !by[W[7]].event && by[W[8]].hint && by[W[8]].event && !by[W[9]].hint && by[W[9]].event && by[W[7]].unsure === false
			&& hint.counts.hintWhiteCount === 2 && hint.counts.white === 3, '段10(B) ヒントで得られる白の種数: ヒントだけ(W7)・ヒントとイベント(W8)は数え、イベントだけ(W9)は数えない（2種）', { counts: hint.counts });
		const unk = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-c12']) });
		assert(unk.score === 0 && unk.skills.length === 0 && unk.counts.hintWhiteCount === 0, '段10(B) ヒントが未確認のカードのヒントは数えない（点数0・ヒントの種数0）', brief(unk));
		const com = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-c07']) });
		assert(com.score === 1 && com.skills[0].skillId === W[6] && com.skills[0].event && !com.skills[0].hint && com.skills[0].unsure === true && com.cards[0].picks[0].scope === 'chara',
			'段10(B) キャラクター共通のイベントのスキルも数える（選択肢が2つ＝△）', brief(com));
		const added = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-c01']), addedSkillIds: [W[0]] });
		assert(added.score === 2 && added.skills.find((s) => s.skillId === W[0]).added === true && added.counts.added === 1, '段10(B) すでに②にあるスキルは結果に残り、追加済みの印が付き、点数にも数える', brief(added));
		const rf = await solve(sp.page, { roster: { skillFilter: { distance: 'short' } }, count: 5, excludedCardIds: onlyOf(['syn-c13', 'syn-c14']) });
		assert(rf.score === 1 && rf.skills[0].skillId === wShort, '段10(B) ①の絞り込み（距離）に合わないスキル(wMed)を持つカードは増分0。合うスキル(wShort)だけが点数になる', brief(rf));
		const tk = await solve(sp.page, { roster: { cardIds: ['syn-c15'], offSkillIds: [W[13]] }, count: 5, excludedCardIds: onlyOf(['syn-c17']) });
		assert(tk.score === 1 && tk.skills[0].skillId === W[15], '段10(B) ①の●・OFFにしたスキルは数えない（c17 の W12・W13 は数えず、W15 だけ 1点）', brief(tk));
		assert(jsErrors(sp.errors).length === 0, '段10(B) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('段10(B) 同点の選び方（枚数が少ない→SSRが多い→カード番号の順）・足りない枚数は SSR→番号で埋める・毎回同じ', async () => {
		const sp = await openSynth();
		const pos = (r) => r.cards.filter((c) => c.gain > 0).map((c) => c.cardId).sort();
		const t2 = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-t01', 'syn-t02']) });
		assert(pos(t2).join() === 'syn-t02', '段10(B) 同点(2): SSR が多いほう（SR の t01 より SSR の t02）', t2.cards.map((c) => c.cardId + ':' + c.gain));
		const t3 = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-t03', 'syn-t04']) });
		assert(pos(t3).join() === 'syn-t03', '段10(B) 同点(3): カード番号の小さいほう（t03）', t3.cards.map((c) => c.cardId + ':' + c.gain));
		const t1 = await solve(sp.page, { roster: {}, count: 5, excludedCardIds: onlyOf(['syn-t05', 'syn-t06', 'syn-t07']) });
		assert(t1.score === 2 && pos(t1).join() === 'syn-t05', '段10(B) 同点(1): 増分が正のカードの枚数が少ないほう（SR 1枚の t05 が、SSR 2枚の t06＋t07 に勝つ）', t1.cards.map((c) => c.cardId + ':' + c.gain));
		assert(t1.cards.map((c) => c.cardId).join() === ['syn-t05', 'syn-t06', 'syn-t07'].join() && t1.cards[1].gain === 0 && t1.cards[2].gain === 0,
			'段10(B) 増分が正のカードが5枚に満たないときは、残りを SSR → カード番号の昇順で埋める（埋めたカードの増分は 0。印は付けない）', t1.cards.map((c) => c.cardId + ':' + c.gain));
		const again = await solve(sp.page, { roster: {}, count: 6 });
		const again2 = await solve(sp.page, { roster: {}, count: 6 });
		assert(JSON.stringify(again.cards.map((c) => c.cardId)) === JSON.stringify(again2.cards.map((c) => c.cardId)) && again.score === again2.score, '段10(B) 同じ引数なら、結果は毎回同じ', again.cards.map((c) => c.cardId));
		await sp.ctx.close();
	});

	await block('段10(B) Pt: 切れ者・ヒントLv5 固定で既存の計算を呼ぶ（前段込み・Pt 未収録は unpriced）。チェックの組み合わせで数字が変わる', async () => {
		const sp = await openSynth();
		const r = await sp.page.evaluate(({ W, a2, b2, noPtId }) => {
			const C = UmaSkillDeckCore, o = C.outside;
			const pd = C.getSkillPtData(), rules = pd.rules;
			const unit = (id) => C.computeSkillPt(pd.skillPt.get(id).pt, 5, 'kire', rules);
			const one = o.ptOf([W[0]]), two = o.ptOf([W[0], W[1]]), withNoPt = o.ptOf([W[0], noPtId]), none = o.ptOf([]);
			const prev = o.ptOf([b2]);   // b2 は根。a2（途中）を足すと前段が増える ―― ここでは根だけと、途中の白（a2）を含む場合を比べる
			const diffStatus = C.computeSkillPt(pd.skillPt.get(W[0]).pt, 5, 'none', rules);
			return { one, two, withNoPt, none, expect: { w0: unit(W[0]), w1: unit(W[1]) }, diffStatus: diffStatus, prev: prev };
		}, { W, a2, b2, noPtId });
		assert(r.one.ok && r.one.statusId === 'kire' && r.one.hintLevel === 5 && r.one.total === r.expect.w0 && r.one.own === r.expect.w0 && r.one.unpriced.length === 0,
			'段10(B) Pt: 1つのスキルは computeSkillPt(基礎Pt, Lv5, 切れ者) と一致（割引なしの値とは違う）', { one: r.one, expect: r.expect });
		assert(r.two.total === r.expect.w0 + r.expect.w1 && r.two.total > r.one.total, '段10(B) Pt: チェックを増やすと数字が増える（2つの合計）', { two: r.two.total, expect: r.expect });
		assert(r.withNoPt.total === r.expect.w0 && r.withNoPt.unpriced.indexOf(noPtId) !== -1 && r.none.total === 0, '段10(B) Pt: Pt 未収録のスキルは合計に入れず unpriced に返す。空なら 0', { withNoPt: r.withNoPt, none: r.none });
		assert(r.expect.w0 !== r.diffStatus, '段10(B) Pt: 切れ者の割引が効いている（「なし」と値が違う）', { kire: r.expect.w0, none: r.diffStatus });
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (C) 実データで: 締め切り・画面を止めない・①②の数字が変わらない・実行時間
	 * ==================================================================== */
	await block('段10(C) 実データ: 締め切りで途中の結果の印・時間で区切って譲る・①②の見出しの数字は変わらない', async () => {
		const sp = await openReal({ userData: USER_DATA, tab: 1, roster: REAL });
		const nums = () => sp.page.evaluate(() => {
			const q = (s) => document.querySelector(s);
			const tot = q('#deck-set-bar [data-usd-el="set-total"]');
			return JSON.stringify({ total: tot ? [tot.dataset.total, tot.dataset.kinds] : null, f: (q('#deck-template-panel [data-usd-el="factor-pt"]') || {}).textContent, fk: (q('#deck-template-panel [data-usd-el="factor-count"]') || {}).textContent,
				r: (q('#deck-roster-panel [data-usd-el="pt-total"]') || {}).textContent, rk: (q('#deck-roster-panel [data-usd-el="pt-count"]') || {}).textContent });
		});
		const before = await nums();
		const cut = await sp.page.evaluate(async () => { const r = await UmaSkillDeckCore.outside.solve({ roster: {}, count: 6, deadlineMs: 0 }); return { ok: r.ok, partial: r.partial, score: r.score, cards: r.cards.length }; });
		const full = await sp.page.evaluate(async () => { const r = await UmaSkillDeckCore.outside.solve({ roster: {}, count: 6, deadlineMs: 20000 }); return { ok: r.ok, partial: r.partial, score: r.score, cards: r.cards.length, counts: r.counts, stats: r.stats }; });
		assert(cut.ok && cut.partial === true && cut.score > 0 && cut.cards === 6 && full.ok && full.partial === false && cut.score <= full.score, '段10(C) 実データ: 締め切り 0ms だと途中の結果（partial）で、それまでの最良（6枚）を返す。十分な時間なら印は付かない', { cut, full: { partial: full.partial, score: full.score } });
		assert(full.stats.engineScore === full.score, '段10(C) 実データでも、探索の点数と組み立ての点数が一致する', [full.stats.engineScore, full.score]);
		assert(full.counts.kinds + full.counts.gold === full.score && full.stats.population === 452 && full.stats.candidates === 407 && full.stats.groups === 145, '段10(C) 実データ: 点数 ＝ 種数（countSkillKinds）＋ 金スキル。母集団452・候補407枚・145キャラクター', { counts: full.counts, stats: full.stats });
		const ticks = await sp.page.evaluate(async () => {
			let n = 0; const iv = setInterval(() => { n++; }, 0);
			const roster = { cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'], skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
			const r = await UmaSkillDeckCore.outside.solve({ roster, count: 6, deadlineMs: 20000, sliceMs: 1 });
			clearInterval(iv);
			return { ticks: n, ok: r.ok, ms: Math.round(r.stats.ms) };
		});
		assert(ticks.ok && ticks.ticks >= 3, '段10(C) 時間で区切って画面に譲る（探索の途中でタイマーが走る）', ticks);
		const after = await nums();
		assert(before === after, '段10(C) 計算しても、①②と見出しの数字（合計・種数）は変わらない（この機能は①②の計算に何も書き込まない）', { before, after });
		assert(jsErrors(sp.errors).length === 0, '段10(C) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('段10(C) 実行時間: 64条件（絞り込み8×①の●4×5枚・6枚）で打ち切りが起きない（最悪の時間は表示する。目標 150ms は機械の負荷で揺れるので、検査では 500ms 以下）', async () => {
		const sp = await openReal({ userData: USER_DATA, tab: 1, roster: REAL });
		const m = await sp.page.evaluate(async () => {
			const c = UmaSkillDeckCore;
			let seed = 777; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
			const ids = c.getTrainingSources().supportCard.entries.filter((x) => (x.rarity === 'SSR' || x.rarity === 'SR') && x.isGroup === false).map((x) => x.id);
			const rosters = [{ cardIds: [] }, null, null, null].map((r) => r || { cardIds: ids.slice().sort(() => rnd() - 0.5).slice(0, 6) });
			const combos = [{}, { distance: 'medium' }, { distance: 'medium', style: 'senko' }, { distance: 'medium', style: 'senko', surface: 'turf' }, { distance: 'short', style: 'nige', surface: 'dirt' }, { distance: 'long', style: 'oikomi', surface: 'turf' }, { style: 'sashi' }, { surface: 'dirt' }];
			const t = [], partial = [];
			for (const f of combos) for (const ro of rosters) for (const K of [5, 6]) {
				const roster = Object.assign({}, ro); if (Object.keys(f).length) roster.skillFilter = f;
				const r = await c.outside.solve({ roster, count: K, deadlineMs: 20000 });
				t.push(r.stats.ms); partial.push(r.partial);
			}
			t.sort((a, b) => a - b);
			return { n: t.length, max: Math.round(t[t.length - 1]), median: Math.round(t[Math.floor(t.length / 2)]), partial: partial.filter(Boolean).length };
		});
		console.log('     [実測] 64条件の探索時間（検査のブラウザ・隠れた画面）: 最悪 ' + m.max + 'ms／中央値 ' + m.median + 'ms／打ち切り ' + m.partial + '回');
		assert(m.n === 64 && m.partial === 0 && m.max <= 500, '段10(C) 64条件で打ち切りが起きず、探索の最悪が 500ms 以下（' + m.max + 'ms。目標は150ms。単独で回したときの実測は報告に別記）', m);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (D) 保存（段2）: roster.outsideCardExcluded
	 * ==================================================================== */
	const SAVED = (extra) => ({ schemaVersion: 7, records: [], customSkills: [], templates: [
		{ templateId: 't1', name: 'S1', skillIds: ['1', '2', '3'], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' },
		{ templateId: 't2', name: 'S2', skillIds: ['4'], createdAt: 'x', updatedAt: 'x' }],
		rosters: [Object.assign({ rosterId: 'r1', name: 'S1', umaId: REAL.umaId, star: 3, awakeningLevel: 5, cardIds: REAL.cardIds.slice(), createdAt: 'x', updatedAt: 'x' }, extra || {})] });
	const pickSet = async (page, id) => {
		await page.click(BAR + '[data-usd-act="set-list"]');
		await page.click('[data-usd-el="set-list"] input[value="' + id + '"]');
		await page.waitForTimeout(250);
	};
	const rosterOf = (d, id) => d.rosters.find((r) => r.rosterId === id);
	const OTHER = 'card-0300';

	await block('段10(D) 保存: 項目の無いデータを開いても1バイトも変わらない・付け外しはそのIDだけ・空になったら項目ごと消える・schemaVersion は 7 のまま', async () => {
		const seed = SAVED();
		const sp = await openReal({ userData: seed, tab: 0, roster: null });
		await pickSet(sp.page, 't1');
		const raw0 = await rawUd(sp.page);
		assert(raw0 === JSON.stringify(seed), '段10(D)(a) 項目の無いデータを開き、セットを選んでも、保存データは1バイトも変わらない', raw0.length);
		const ok1 = await sp.page.evaluate((id) => UmaSkillDeckCore.outside.setExcluded(id, true), REAL.cardIds[0]);
		const ok2 = await sp.page.evaluate((id) => UmaSkillDeckCore.outside.setExcluded(id, true), OTHER);
		const bad = await sp.page.evaluate(() => UmaSkillDeckCore.outside.setExcluded('card-9999', true));
		let d = await ud(sp.page);
		const withField = JSON.parse(JSON.stringify(d));
		assert(ok1 && ok2 && !bad && JSON.stringify(rosterOf(d, 'r1').outsideCardExcluded) === JSON.stringify([REAL.cardIds[0], OTHER]) && d.schemaVersion === 7,
			'段10(D) 受け口(①のメモリ上の roster 経由)で付けると roster に保存される。引けないIDは付けない。schemaVersion は 7 のまま', { ok1, ok2, bad, ex: rosterOf(d, 'r1').outsideCardExcluded, v: d.schemaVersion });
		await sp.page.evaluate((id) => UmaSkillDeckCore.outside.setExcluded(id, false), REAL.cardIds[0]);
		d = await ud(sp.page);
		assert(JSON.stringify(rosterOf(d, 'r1').outsideCardExcluded) === JSON.stringify([OTHER]), '段10(D) 外すのはそのIDだけ（もう1つは残る）', rosterOf(d, 'r1').outsideCardExcluded);
		await sp.page.evaluate((id) => UmaSkillDeckCore.outside.setExcluded(id, false), OTHER);
		d = await ud(sp.page);
		const noStamp = (x) => JSON.stringify(x, (k, v) => (k === 'updatedAt' ? undefined : v));   // 書くたびに更新日時は進む
		delete rosterOf(withField, 'r1').outsideCardExcluded;   // ①が最初の書き込みで整える項目（星・覚醒レベル）は、項目の有無に関係なく同じ
		assert(!('outsideCardExcluded' in rosterOf(d, 'r1')) && noStamp(d) === noStamp(withField), '段10(D) 空になったら項目ごと消え、更新日時のほかは元に戻る（空の配列を残さない）', Object.keys(rosterOf(d, 'r1')));
		assert(jsErrors(sp.errors).length === 0, '段10(D) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('段10(D) 保存: 消えたカードの古いIDは読んでも書き換えない（付け外しはそのIDだけ）', async () => {
		const seed = SAVED({ outsideCardExcluded: ['card-9998', REAL.cardIds[0]] });
		const sp = await openReal({ userData: seed, tab: 0, roster: null });
		await pickSet(sp.page, 't1');
		const read = await sp.page.evaluate(() => UmaSkillDeckCore.outside.getExcluded());
		const raw = await rawUd(sp.page);
		assert(JSON.stringify(read) === JSON.stringify([REAL.cardIds[0]]) && raw === JSON.stringify(seed), '段10(D)(c) 読むときは引けるカードIDだけを使い、保存データは1バイトも変わらない', { read, same: raw === JSON.stringify(seed) });
		const cand = await sp.page.evaluate(() => UmaSkillDeckCore.outside.candidatesOf({ cardIds: [], outsideCardExcluded: ['card-9998', 'card-0248'] }).some((c) => c.id === 'card-0248'));
		assert(cand === false, '段10(D) 引けるIDは候補から外れ、引けないIDは無視される', cand);
		await sp.page.evaluate((id) => UmaSkillDeckCore.outside.setExcluded(id, false), REAL.cardIds[0]);
		const d = await ud(sp.page);
		assert(JSON.stringify(rosterOf(d, 'r1').outsideCardExcluded) === JSON.stringify(['card-9998']), '段10(D) 外すとき、触るのはそのIDだけ（古いIDは残る）', rosterOf(d, 'r1').outsideCardExcluded);
		await sp.ctx.close();
	});

	await block('段10(D) 保存: ①の次の書き込み（絞り込み・スキルのオン/オフ）のあとも項目が残る・①のリセットと②のリセットは触らない', async () => {
		const sp = await openReal({ userData: SAVED(), tab: 0, roster: null });
		await pickSet(sp.page, 't1');
		await sp.page.evaluate((id) => UmaSkillDeckCore.outside.setExcluded(id, true), OTHER);
		const field = async () => (rosterOf(await ud(sp.page), 'r1') || {}).outsideCardExcluded;
		assert(JSON.stringify(await field()) === JSON.stringify([OTHER]), '段10(D) 前提: 項目が保存されている', await field());
		// ①の絞り込み
		await sp.page.selectOption(P + 'select[data-usd-act="filter"][data-axis="distance"]', 'medium');
		await sp.page.waitForTimeout(250);
		let d = await ud(sp.page);
		assert(JSON.stringify(rosterOf(d, 'r1').outsideCardExcluded) === JSON.stringify([OTHER]) && rosterOf(d, 'r1').skillFilter && rosterOf(d, 'r1').skillFilter.distance === 'medium', '段10(D)(d) ①の絞り込みを変えても、項目が残る（①の書き込みが上書きして消さない）', { f: rosterOf(d, 'r1').skillFilter, e: rosterOf(d, 'r1').outsideCardExcluded });
		// ①のスキルのオン/オフ
		const target = await sp.page.evaluate(() => { const e = document.querySelector('#deck-roster-panel input[data-usd-act="take-skill"]'); return e ? e.getAttribute('data-skill-id') : null; });
		if (target) { await sp.page.click(P + 'input[data-usd-act="take-skill"][data-skill-id="' + target + '"]'); await sp.page.waitForTimeout(250); }
		d = await ud(sp.page);
		assert(!!target && Array.isArray(rosterOf(d, 'r1').offSkillIds) && rosterOf(d, 'r1').offSkillIds.indexOf(target) !== -1 && JSON.stringify(rosterOf(d, 'r1').outsideCardExcluded) === JSON.stringify([OTHER]),
			'段10(D)(d) ①のスキルをオフにしても、項目が残る', { target, off: rosterOf(d, 'r1').offSkillIds, e: rosterOf(d, 'r1').outsideCardExcluded });
		// ①のカードを1枚外す
		await sp.page.click(P + '[data-usd-act="clear-card"]');
		await sp.page.waitForTimeout(250);
		d = await ud(sp.page);
		assert(JSON.stringify(rosterOf(d, 'r1').outsideCardExcluded) === JSON.stringify([OTHER]), '段10(D)(d) ①のカードを外しても、項目が残る', rosterOf(d, 'r1').outsideCardExcluded);
		// ①のリセット
		await sp.page.click(P + '[data-usd-act="roster-reset"]');
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(300);
		d = await ud(sp.page);
		const r1 = rosterOf(d, 'r1');
		assert(!r1.umaId && (r1.cardIds || []).every((x) => !x) && !('offSkillIds' in r1) && JSON.stringify(r1.outsideCardExcluded) === JSON.stringify([OTHER]), '段10(E) ①のリセット（育成ウマ娘・カード・オン/オフを消す）は、除外のカードを消さない', { uma: r1.umaId, cards: r1.cardIds, e: r1.outsideCardExcluded });
		// ②のリセット
		await sp.page.evaluate(() => selectStepTab(1, { noSave: true }));
		await sp.page.waitForTimeout(250);
		await sp.page.click(T + '[data-usd-act="factor-reset"]');
		await sp.page.click('[data-usd-el="factor-reset-all"]');
		await sp.page.waitForTimeout(300);
		d = await ud(sp.page);
		assert(d.templates.find((t) => t.templateId === 't1').skillIds.length === 0 && JSON.stringify(rosterOf(d, 'r1').outsideCardExcluded) === JSON.stringify([OTHER]), '段10(E) ②のリセット（スキルをすべて消す）は、除外のカードを消さない（②のスキルは実際に消えた）', { skills: d.templates.find((t) => t.templateId === 't1').skillIds.length, e: rosterOf(d, 'r1').outsideCardExcluded });
		assert(jsErrors(sp.errors).length === 0, '段10(D) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('段10(D) 保存: ①が空のセットに初めて書くと roster が作られる／下書き（＋新規）に書ける／「＋新規の保存」でこの項目だけの下書きも写される', async () => {
		// ①が空のセット（t2）に書く
		let sp = await openReal({ userData: SAVED(), tab: 0, roster: null });
		await pickSet(sp.page, 't2');
		const before = await ud(sp.page);
		const ok = await sp.page.evaluate((id) => UmaSkillDeckCore.outside.setExcluded(id, true), OTHER);
		let d = await ud(sp.page);
		const t2 = d.templates.find((t) => t.templateId === 't2');
		const nr = t2 && rosterOf(d, t2.baseRosterId);
		assert(!before.templates.find((t) => t.templateId === 't2').baseRosterId && ok && nr && nr.name === 'S2' && JSON.stringify(nr.outsideCardExcluded) === JSON.stringify([OTHER]) && d.rosters.length === 2 && d.schemaVersion === 7,
			'段10(D) ①が空のセットに書くと、①の既存の経路で roster が作られてセットに付く（名前はセット名）', { ok, nr, n: d.rosters.length });
		await sp.ctx.close();
		// 下書き（＋新規）に書く
		sp = await openReal({ userData: EMPTY, tab: 0, roster: null });
		const ok2 = await sp.page.evaluate((id) => UmaSkillDeckCore.outside.setExcluded(id, true), OTHER);
		const dr = await draftRoster(sp.page);
		assert(ok2 && dr && JSON.stringify(dr.outsideCardExcluded) === JSON.stringify([OTHER]), '段10(D) 下書き（＋新規）の①にも書ける（下書きの roster に保存される）', dr);
		// ＋新規に名前を付けて保存 → この項目だけを持つ下書きの①が写される
		await sp.page.click(BAR + '[data-usd-act="name-edit"]');
		await sp.page.fill(BAR + '[data-usd-el="name"]', '除外だけ');
		await sp.page.keyboard.press('Enter');
		await sp.page.waitForTimeout(250);
		d = await ud(sp.page);
		const nt = d.templates.find((t) => t.name === '除外だけ');
		const nr2 = nt && rosterOf(d, nt.baseRosterId);
		assert(nt && nr2 && JSON.stringify(nr2.outsideCardExcluded) === JSON.stringify([OTHER]) && nr2.name === '除外だけ', '段10(D)(f) 「＋新規の保存」で、この項目だけを持つ下書きの①も写される（rosterHasContent）', { nt: !!nt, nr2 });
		await sp.ctx.close();
	});

	await block('段10(D) 保存: 書き出し→取り込み→「元に戻す」で項目が保たれ、移行で書き換わらない／Deck 単体ページ（①が無い）では何もしない／Deck の複製でも保たれる', async () => {
		const seed = SAVED({ outsideCardExcluded: [REAL.cardIds[1], 'card-9998'] });
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, seed);
		await dk.page.click('#tab-btn-data');
		await dk.page.waitForTimeout(300);
		const state = () => dk.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const before = await state();
		const exported = await dk.page.evaluate(() => { exportData(); return document.getElementById('export-textarea').value; });
		assert(JSON.parse(exported).rosters[0].outsideCardExcluded.join() === [REAL.cardIds[1], 'card-9998'].join(), '段10(D)(b) 書き出しに項目が入る（古いIDもそのまま）', exported.length);
		// 別のデータを取り込み → 「元に戻す」
		const other = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = JSON.stringify(v); const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, other);
		const un = await dk.page.evaluate(() => ({ ok: performUndo() }));
		await dk.page.waitForTimeout(300);
		assert(un.ok && (await state()) === before, '段10(D)(b) 取り込み→「元に戻す」で、項目つきのデータがメモリと保存先の両方で取り込み前と一致する（移行で書き換わらない）', un);
		// 書き出したものを取り込み直しても同じ
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = v; const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, exported);
		assert(JSON.stringify(await dk.page.evaluate(() => UmaSkillDeckCore.getUserData().rosters[0].outsideCardExcluded)) === JSON.stringify([REAL.cardIds[1], 'card-9998']), '段10(D)(b) 書き出したファイルを取り込み直しても、項目が保たれる', true);
		// Deck 単体ページ: ①が無い（受け口が無い）ので何もしない
		const noop = await dk.page.evaluate((id) => ({ r: UmaSkillDeckCore.outside.setExcluded(id, true), g: UmaSkillDeckCore.outside.getExcluded() }), OTHER);
		assert(noop.r === false && JSON.stringify(noop.g) === JSON.stringify([]), '段10(D) Deck 単体ページでは、除外の付け外しは何もしない（false）', noop);
		// Deck の複製（roster は同じ id を指したまま）でも項目が保たれる
		await dk.page.evaluate(() => switchTab('template'));
		await dk.page.click('[data-usd-act="template-tab"][data-tab-id="t1"]');
		await dk.page.waitForTimeout(250);
		const dup = await dk.page.evaluate(() => { const b = document.querySelector('[data-usd-act="template-duplicate"]'); return !!b && !b.hidden; });
		if (dup) {
			await dk.page.click('[data-usd-act="template-duplicate"]');
			await dk.page.waitForTimeout(300);
		}
		const after = await dk.page.evaluate(() => { const d = UmaSkillDeckCore.getUserData(); return { n: d.templates.length, ex: d.rosters.map((r) => r.outsideCardExcluded), bases: d.templates.map((t) => t.baseRosterId) }; });
		assert(dup && after.n === 3 && after.ex[0].join() === [REAL.cardIds[1], 'card-9998'].join() && after.bases.filter((b) => b === 'r1').length >= 1, '段10(D)(g) セットの複製（Deck）でも、roster の項目は保たれる（複製は同じ roster を指す）', { dup, after });
		assert(dk.errors.length === 0, '段10(D) Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
	});
}
