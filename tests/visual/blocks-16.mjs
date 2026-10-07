import { pressRecommend, removeFromSet } from './lib/fixtures.mjs';
// C-130（2026-10-06）の検査。run-smoke.mjs の末尾から register16() で呼ばれる
// （塊の見出しはすべて「C130」で始まる。`npm run test:visual -- --only=C130` で回せる。B・C・D・E だけなら「C130B」「C130C」「C130D」「C130E」）。
//
// A: data/recommended-skills.json（ページの読み込みでは取りに行かない。形は check:catalog の §13）
// B: セットのレースを選んだときの、②への既定の追加（回り・季節・デバフなしでなければ noDebuffExtra）と、その記録（roster.raceAutoSkillIds）
// C: ②のパレットの行の、①の脚質に応じたボタン（C-129 の②の「低効果を除外」を置き換えた）
// D: オススメサポは、②で追加済みのスキルを、除外の設定に関わらず数える
// E: 「オススメサポαテスト」→「オススメサポ」
// スキル名・グループの文字・レース名は検査の側に書かない（恒久ルール1。データか画面から読む）。

export async function register16(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const REC = readJson('data/recommended-skills.json');
	const GROUP = (key) => REC.groups.find((g) => g.key === key);
	const RACES = readJson('data/upcoming-races.json').races;
	const DIST = readJson('data/race-distances.json');
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const EXT = readJson('data/extended-skills.json').entries;
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e.rarity]));
	const UMAS = readJson('data/training-umamusume.json').entries;
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6 };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const OM = '[data-usd-el="outside-modal"] ';
	const sleep = (page, ms) => page.waitForTimeout(ms);
	// 区分のキー（race-distances.json から。名前はデータの name）
	const classOf = (race) => race.distanceCategory || ((DIST.distanceCategories.find((c) => (c.minDistance == null || race.distance >= c.minDistance) && (c.maxDistance == null || race.distance <= c.maxDistance)) || {}).key) || null;
	const ONLY = (() => { for (const g of REC.groups) for (const s of g.skills) if (s.onlyWhenRaceDistanceClass) return s; return null; })();
	const RACE_IN = ONLY ? RACES.find((r) => ONLY.onlyWhenRaceDistanceClass.includes(classOf(r))) : null;
	const RACE_OUT = ONLY ? RACES.find((r) => classOf(r) && !ONLY.onlyWhenRaceDistanceClass.includes(classOf(r))) : null;

	/** special.html を開く（blocks-15 の openSp と同じ形）。rec＝グループのファイルの差し替え（'fail' で 500） */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, o.userData || EMPTY);
		sp.recReqs = [];
		sp.effReqs = [];
		sp.page.on('request', (r) => { if (r.url().includes('recommended-skills.json')) sp.recReqs.push(r.url()); if (r.url().includes('skill-effect-levels.json')) sp.effReqs.push(r.url()); });
		if (o.rec === 'fail') await sp.page.route('**/data/recommended-skills.json*', (r) => r.fulfill({ status: 500, body: 'x' }));
		await sp.page.evaluate(({ roster, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster === undefined ? FULL : o.roster, tab: o.tab === undefined ? 1 : o.tab });
		sp.recReqs = [];
		sp.effReqs = [];
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sleep(sp.page, 300);
		return sp;
	};
	const draftIds = (page) => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null'); return d ? d.skillIds : []; });
	const record = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')) || {}).raceAutoSkillIds || null);
	const toastText = (page) => page.evaluate(() => document.getElementById('toast-message').textContent);
	const pickRace = async (page, id) => {
		await page.click(BAR + '[data-usd-act="set-race"]');
		await page.waitForSelector('[data-usd-el="race-list"]');
		await page.click('[data-usd-el="race-opt"][data-race-id="' + id + '"] input');
		await sleep(page, 500);
	};
	const addByText = async (page, names) => {
		await page.click(T + '[data-usd-act="editor-pick-text"]');
		await page.fill('[data-usd-el="paste-input"]', names.join('\n'));
		await page.click('[data-usd-act="paste-run"]');
		await sleep(page, 200);
		await page.click('[data-usd-el="picker-commit"]');
		await sleep(page, 200);
		await page.click('[data-usd-act="picker-close"]');
		await sleep(page, 200);
	};
	const nameOf = (id) => { const s = MASTER.find((x) => String(x.id) === id) || EXT.find((x) => x.id === id); return s ? s.name : id; };

	/** B の候補（検査の側で、データから組み立てる。core の raceAutoCandidateIds と同じ規則）。searchable は検索に出してよい拡張スキルの id */
	const expectedFor = (race, searchable) => {
		const pool = MASTER.map((s) => ({ id: String(s.id), tags: s.tags })).concat(EXT.filter((e) => e.tags && searchable.includes(e.id)).map((e) => ({ id: e.id, tags: e.tags })));
		const white = (id) => !PT.has(id) || PT.get(id) === 'white';
		const byEnv = (v) => (v ? pool.filter((s) => white(s.id) && ((s.tags.environment || []).includes(v))).map((s) => s.id) : []);
		const turn = byEnv(race.direction), season = byEnv(race.season);
		const extra = race.rule === 'no_debuff' ? [] : GROUP('noDebuffExtra').skills.filter((s) => !s.onlyWhenRaceDistanceClass || s.onlyWhenRaceDistanceClass.includes(classOf(race))).map((s) => s.skillId);
		const all = [];
		turn.concat(season, extra).forEach((id) => { if (!all.includes(id)) all.push(id); });
		return { turn, season, extra, all };
	};

	/* ====================================================================
	 * A: ページの読み込みでは取りに行かない
	 * ==================================================================== */
	await block('C130A ページの読み込みでは recommended-skills.json・skill-effect-levels.json を取りに行かない（①のタブ・脚質あり／②のタブ・脚質が指定なし）', async () => {
		const sp = await openSp({ roster: Object.assign({}, FULL, { skillFilter: { style: 'nige' } }), tab: 0 });
		assert(sp.recReqs.length === 0 && sp.effReqs.length === 0, 'C130A ①のタブを開いて読み込んだ: どちらも取りに行かない', { rec: sp.recReqs, eff: sp.effReqs });
		await sp.ctx.close();
		const sp2 = await openSp({ roster: FULL, tab: 1 });
		assert(sp2.recReqs.length === 0 && sp2.effReqs.length === 0, 'C130A ②のタブ（脚質が指定なし）を開いて読み込んだ: どちらも取りに行かない', { rec: sp2.recReqs, eff: sp2.effReqs });
		assert(jsErrors(sp2.errors).length === 0, 'C130A コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});

	/* ====================================================================
	 * B: レースを選んだときの②への既定の追加
	 * ==================================================================== */
	await block('C130B 6つのレースそれぞれ: 指定なしから選ぶと、回り・季節（各2種）と「デバフなし」でなければ noDebuffExtra が②に入り、記録される／知らせ', async () => {
		const sp = await openSp({ roster: FULL });
		const searchable = await sp.page.evaluate(() => UmaSkillDeckCore.getSearchableExtendedSkillIds());
		const lines = [];
		for (const race of RACES) {
			const exp = expectedFor(race, searchable);
			// 回り・季節は、レースに値があれば2種ずつ（ここが崩れたら、タグでスキルが特定できていない）
			assert((race.direction ? exp.turn.length === 2 : exp.turn.length === 0) && (race.season ? exp.season.length === 2 : exp.season.length === 0),
				'C130B ' + race.id + ': 回り・季節のタグで選べるスキルは、値のあるレースで2種ずつ', { turn: exp.turn, season: exp.season });
			await pickRace(sp.page, race.id);
			const ids = await draftIds(sp.page);
			const hidden = await sp.page.evaluate(() => UmaSkillDeckCore.getPickerHiddenIds());
			const want = exp.all.filter((id) => !hidden.includes(id));
			const rec = await record(sp.page);
			const t = await toastText(sp.page);
			assert(JSON.stringify(ids) === JSON.stringify(want) && JSON.stringify(rec || []) === JSON.stringify(want),
				'C130B ' + race.id + ': ②に入るのは候補のうち追加できるもの（' + want.length + '種）で、記録も同じ', { ids, want, rec });
			if (want.length > 0) assert(t === 'レースに合わせて' + want.length + '種を追加しました', 'C130B ' + race.id + ': 知らせ「レースに合わせて N種を追加しました」', t);
			lines.push(race.id + ': ' + (want.map((id) => id + ' ' + nameOf(id)).join('、') || '（なし）'));
			// 指定なしに戻すと、記録したものが外れて、記録も消える
			await pickRace(sp.page, '');
			const back = await draftIds(sp.page);
			assert(back.length === 0 && (await record(sp.page)) === null, 'C130B ' + race.id + ': 指定なしに戻すと、自動で入れたものが外れ、記録の項目も消える', { back, rec: await record(sp.page) });
			if (want.length > 0) assert((await toastText(sp.page)) === 'レースに合わせて' + want.length + '種を外しました', 'C130B ' + race.id + ': 外したときの知らせ', await toastText(sp.page));
		}
		console.log('     [実測] レースごとの既定の追加:\n       ' + lines.join('\n       '));
		const noDebuff = RACES.find((r) => r.rule === 'no_debuff');
		assert(!noDebuff || !expectedFor(noDebuff, searchable).all.some((id) => GROUP('noDebuffExtra').skills.some((s) => s.skillId === id)), 'C130B 「デバフなし」のレースでは noDebuffExtra を入れない', noDebuff && noDebuff.id);
		assert(jsErrors(sp.errors).length === 0, 'C130B コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C130B レースを変えると自動で入れたものが入れ替わる（両方で入るものは残す）／手で追加したもの・手で外して足し直したものは外さない／「元に戻す」で②と記録が戻る', async () => {
		const sp = await openSp({ roster: FULL });
		const searchable = await sp.page.evaluate(() => UmaSkillDeckCore.getSearchableExtendedSkillIds());
		// 季節が違い、回りが同じ2つのレース
		const a = RACES.find((r) => r.direction && r.season);
		const b = RACES.find((r) => r.direction === a.direction && r.season && r.season !== a.season);
		assert(!!a && !!b, 'C130B 材料: 回りが同じで季節が違う2つのレースがある', { a: a && a.id, b: b && b.id });
		const ea = expectedFor(a, searchable), eb = expectedFor(b, searchable);
		// 手で追加: a の回りの1種（自動の記録に入らない）
		const manual = ea.turn[0];
		await addByText(sp.page, [nameOf(manual)]);
		await pickRace(sp.page, a.id);
		const ids1 = await draftIds(sp.page), rec1 = await record(sp.page);
		assert(ids1[0] === manual && !rec1.includes(manual) && ea.all.every((id) => ids1.includes(id)), 'C130B 手で追加済みのものは記録に入らない（②にあるので足さない）', { ids1, rec1 });
		// 季節の1種を手で外して、手で足し直す → 記録から落ちる
		const readd = ea.season[0];
		await removeFromSet(sp.page, readd);   // C-132: タイルの × は無い（パレットの「削除」）
		await sleep(sp.page, 200);
		assert(!(await record(sp.page)).includes(readd), 'C130B 手で外したものは記録から落ちる', await record(sp.page));
		await addByText(sp.page, [nameOf(readd)]);
		await pickRace(sp.page, b.id);
		const ids2 = await draftIds(sp.page), rec2 = await record(sp.page);
		const gone = ea.season.filter((id) => id !== readd);
		assert(ids2.includes(manual) && ids2.includes(readd), 'C130B レースを変えても、手で追加したもの・手で足し直したものは外さない', ids2);
		assert(gone.every((id) => !ids2.includes(id)) && eb.season.every((id) => ids2.includes(id) && rec2.includes(id)), 'C130B 前のレースだけのもの（季節）は外れ、新しいレースのものが入る', { ids2, rec2 });
		assert(ea.extra.every((id) => ids2.includes(id) && rec2.includes(id)), 'C130B 両方のレースで入るもの（noDebuffExtra）は外さずに残し、記録にも残る', rec2);
		const t = await toastText(sp.page);
		assert(t === 'レースに合わせて' + eb.season.length + '種を追加しました（' + gone.length + '種を外しました）', 'C130B 知らせ: 実際に足した数と外した数だけ', t);
		// 元に戻す: ②と記録がレースを変える前に戻る（レースはそのまま）
		const before = ids1.filter((id) => id !== readd).concat([readd]);
		await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		await sleep(sp.page, 300);
		const ids3 = await draftIds(sp.page), rec3 = await record(sp.page);
		const race3 = await sp.page.evaluate(() => (UmaSkillDeckCore.outside.getRace() || {}).id);
		assert(JSON.stringify(ids3) === JSON.stringify(before) && rec3.every((id) => ea.all.includes(id)) && race3 === b.id, 'C130B 「元に戻す」で②と記録が戻り、レースはそのまま', { ids3, before, rec3, race3 });
		assert(jsErrors(sp.errors).length === 0, 'C130B コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C130B 本育成で得るスキルは入れない／ページの読み込み・レースつきのセットの読み込みでは何も書かない／データが読めないときは②を変えず知らせる', async () => {
		const race = RACES.find((r) => r.direction);
		const sp0 = await openSp({ roster: FULL });
		const searchable = await sp0.page.evaluate(() => UmaSkillDeckCore.getSearchableExtendedSkillIds());
		await sp0.ctx.close();
		const exp = expectedFor(race, searchable);
		// 覚醒レベル0（最初から持つ）のスキルに候補を持つ育成ウマ娘（データから探す）
		const uma = UMAS.find((u) => (u.awakeningSkills || []).some((a) => a.level === 0 && (a.skills || []).some((s) => exp.all.includes(s.skillId))));
		assert(!!uma, 'C130B 材料: 最初から持つスキルに候補を持つ育成ウマ娘がいる', !!uma);
		if (!uma) return;
		const sp = await openSp({ roster: Object.assign({}, FULL, { umaId: uma.id }) });
		await pickRace(sp.page, race.id);
		const hidden = await sp.page.evaluate(() => UmaSkillDeckCore.getPickerHiddenIds());
		const blocked = exp.all.filter((id) => hidden.includes(id));
		const ids = await draftIds(sp.page);
		assert(blocked.length > 0 && blocked.every((id) => !ids.includes(id)) && ids.length === exp.all.length - blocked.length, 'C130B 本育成で得るもの（' + blocked.length + '種）は入れない', { blocked, ids });
		await sp.ctx.close();
		// レースつきのセット（記録なし）を読み込んでも、②も保存データも変わらない
		const sp2 = await openSp({ roster: Object.assign({}, FULL, { race }) });
		await sleep(sp2.page, 300);
		const raw = await sp2.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		assert((await draftIds(sp2.page)).length === 0 && !JSON.parse(raw).raceAutoSkillIds && sp2.recReqs.length === 0, 'C130B レースつきのセットを読み込んでも、②は空のまま・記録の項目は無い・グループのファイルも取りに行かない', { raw: raw.length, rec: sp2.recReqs.length });
		await sp2.page.reload({ waitUntil: 'networkidle' });
		await sleep(sp2.page, 500);
		assert((await sp2.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'))) === raw, 'C130B 再読み込みしても、保存データは1バイトも変わらない', true);
		await sp2.ctx.close();
		// 読めないとき
		const sp3 = await openSp({ roster: FULL, rec: 'fail' });
		await pickRace(sp3.page, race.id);
		assert((await draftIds(sp3.page)).length === 0 && (await toastText(sp3.page)) === 'オススメのスキルのデータを読み込めませんでした' && (await record(sp3.page)) === null,
			'C130B グループのデータが読めないときは、②に何も入れず、短い知らせを出す', { ids: await draftIds(sp3.page), t: await toastText(sp3.page) });
		await sp3.ctx.close();
	});

	/* ====================================================================
	 * C: ②のパレットの行の、脚質に応じたボタン
	 * ==================================================================== */
	const readPalette = (page) => page.evaluate(() => {
		const row = document.querySelector('#deck-template-panel [data-usd-el="tier-row"]');
		const b = row.querySelector('[data-usd-el="recommend-btn"]');
		// C-132: 「解除」は無くなり、並びは「削除 │ 脚質のボタン │ アイコン」。ボタンは「削除」の次（区切りの線を挟む）
		const c = row.querySelector('[data-usd-el="palette-delete"]');
		const prevBtn = (el) => { let n = el.previousElementSibling; while (n && n.classList.contains('usd-palette-sep')) n = n.previousElementSibling; return n; };
		return { has: !!b, text: b ? b.textContent : null, dis: b ? b.disabled : null, group: b ? b.getAttribute('data-group') : null,
			next: !!b && prevBtn(b) === c, sameLine: !!b && Math.abs(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2 - (c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2)) <= 1,
			hscroll: /usd-hscroll/.test(row.className), rowH: row.getBoundingClientRect().height, low: !!document.querySelector('#deck-template-panel [data-usd-el="low-effect-btn"]') };
	});
	const setStyle = async (page, v) => {
		await page.evaluate((v) => { const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')); r.skillFilter = Object.assign({}, r.skillFilter || {}, { style: v }); if (!v) delete r.skillFilter.style; localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(r)); }, v);
		await page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await sleep(page, 600);
	};

	await block('C130C ①の脚質で②のパレットの行のボタンが切り替わる（逃げ→runnerEscape・先行／差し／追込→runnerNotEscape・指定なし→出さない）／「解除」の隣・同じ行／②の「低効果を除外」は無い／②が見えたときに1回だけ読む', async () => {
		const sp = await openSp({ roster: Object.assign({}, FULL, { skillFilter: { style: 'nige' } }), tab: 0 });
		assert(sp.recReqs.length === 0, 'C130C ①のタブを開いている間は読まない', sp.recReqs);
		await sp.page.click('#step-tab-1');
		await sp.page.waitForSelector(T + '[data-usd-el="recommend-btn"]', { timeout: 5000 }).catch(() => {});
		const p = await readPalette(sp.page);
		assert(p.has && p.text === GROUP('runnerEscape').label && p.group === 'runnerEscape' && sp.recReqs.length === 1, 'C130C 逃げ: ②を開くとグループのデータを1回だけ読み、ボタンの文字は runnerEscape の label', { p, reqs: sp.recReqs.length });
		assert(p.next && p.sameLine && p.hscroll && !p.low, 'C130C ボタンは「削除」の次で同じ行（入りきらなければ横に送る作り。C-132 で「解除」の隣から変えた）。②の「低効果を除外」は無い', p);
		// （C-130 の時点では「①の『低効果を除外』は残る」を見ていた。C-131 で①のボタンも削除したので、ここでは見ない＝blocks-17 の C131C）
		for (const v of ['senko', 'sashi', 'oikomi']) {
			await setStyle(sp.page, v);
			const q = await readPalette(sp.page);
			assert(q.has && q.text === GROUP('runnerNotEscape').label && q.group === 'runnerNotEscape', 'C130C ' + v + ': ボタンの文字は runnerNotEscape の label', q);
		}
		await setStyle(sp.page, null);
		const n = await readPalette(sp.page);
		assert(!n.has, 'C130C 脚質が指定なし: ボタンを出さない', n);
		assert(jsErrors(sp.errors).length === 0, 'C130C コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C130C 押すと（C-132 から確認の小窓の「追加する」を経て）まとめて追加・知らせに追加しなかったものの数と理由／0種なら押せない／「元に戻す」で戻る／onlyWhenRaceDistanceClass はレースが無い・区分が合わないときは入れない', async () => {
		assert(!!ONLY && !!RACE_IN && !!RACE_OUT, 'C130C 材料: onlyWhenRaceDistanceClass を持つスキルと、区分が合うレース・合わないレースがある', { only: ONLY && ONLY.skillId, in: RACE_IN && RACE_IN.id, out: RACE_OUT && RACE_OUT.id });
		const g = REC.groups.find((x) => x.skills.some((s) => s.skillId === ONLY.skillId) && x.key !== 'noDebuffExtra');
		const style = g.key === 'runnerEscape' ? 'nige' : 'senko';
		const allIds = g.skills.map((s) => s.skillId);
		// (1) レースなし: onlyWhen のスキルは入れない（理由はレース条件）
		const sp = await openSp({ roster: Object.assign({}, FULL, { skillFilter: { style } }), tab: 1 });
		await sp.page.waitForSelector(T + '[data-usd-el="recommend-btn"]');
		const hidden = await sp.page.evaluate(() => UmaSkillDeckCore.getPickerHiddenIds());
		// 先に1種を手で足しておく（「追加済み」の理由を作る）
		const pre = allIds.find((id) => id !== ONLY.skillId && !hidden.includes(id));
		await addByText(sp.page, [nameOf(pre)]);
		await pressRecommend(sp.page);   // C-132: 確認の小窓を挟む
		await sleep(sp.page, 300);
		const ids = await draftIds(sp.page);
		const blocked = allIds.filter((id) => hidden.includes(id));
		const want = allIds.filter((id) => id !== pre && id !== ONLY.skillId && !hidden.includes(id));
		assert(JSON.stringify(ids) === JSON.stringify([pre].concat(want)) && !ids.includes(ONLY.skillId), 'C130C レースなし: 追加できるもの（' + want.length + '種）だけをグループの順に足し、onlyWhenRaceDistanceClass のスキルは入れない', { ids, want });
		const why = ['追加済み 1種'].concat(blocked.length ? ['本育成編成のため ' + blocked.length + '種'] : [], ['レース条件に合わないため 1種']);
		const t = await toastText(sp.page);
		assert(t === g.label + ' ' + want.length + '種を追加しました。追加しなかったもの ' + (2 + blocked.length) + '種（' + why.join('・') + '）', 'C130C 知らせ: 追加した数・追加しなかったもの M種と理由', t);
		const p = await readPalette(sp.page);
		// C-131: 0種でも押せない状態にしない。押すと何も足さずに、理由の内訳を知らせる（詳しくは blocks-17 の C131D）
		assert(!p.dis, 'C130C→C-131 追加できるものが0種になっても押せる見た目のまま', p);
		const n0 = (await draftIds(sp.page)).length;
		await pressRecommend(sp.page);   // C-132: 確認の小窓を挟む
		await sleep(sp.page, 300);
		const t0 = await toastText(sp.page);
		assert((await draftIds(sp.page)).length === n0 && /^追加できるスキルはありません（追加済み \d+種/.test(t0), 'C130C→C-131 0種のときに押すと、何も足さずに「追加できるスキルはありません（…）」', t0);
		await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		await sleep(sp.page, 300);
		assert(JSON.stringify(await draftIds(sp.page)) === JSON.stringify([pre]) && !(await readPalette(sp.page)).dis, 'C130C 「元に戻す」で1回で戻り、また押せる', await draftIds(sp.page));
		// (2) 区分が合わないレース: 入れない ／ (3) 区分が合うレース: 入れる
		const rows = [];
		for (const race of [RACE_OUT, RACE_IN]) {
			await pickRace(sp.page, race.id);
			await pressRecommend(sp.page);   // C-132: 確認の小窓を挟む
			await sleep(sp.page, 300);
			rows.push({ race: race.id, cls: classOf(race), has: (await draftIds(sp.page)).includes(ONLY.skillId) });
			await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
			await sleep(sp.page, 300);
		}
		assert(!rows[0].has && rows[1].has, 'C130C onlyWhenRaceDistanceClass: 区分が合わないレースでは入れず、合うレースでは入れる', rows);
		assert(jsErrors(sp.errors).length === 0, 'C130C コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C130C 縦の行を増やさない: 375・320px でパレットの行は1行（はみ出しは横に送る）・高さはボタンが無いときと同じ／1280px で入口の列が収まる', async () => {
		for (const size of [{ w: 375, h: 812 }, { w: 320, h: 568 }, { w: 1280, h: 900 }]) {
			const sp = await openSp({ w: size.w, h: size.h, roster: Object.assign({}, FULL, { skillFilter: { style: 'senko' } }), tab: 1 });
			await sp.page.waitForSelector(T + '[data-usd-el="recommend-btn"]');
			const m = await sp.page.evaluate(() => {
				const row = document.querySelector('#deck-template-panel [data-usd-el="tier-row"]');
				const head = row.parentElement;
				const entry = document.querySelector('#deck-template-panel .usd-entry-row');
				const b = row.querySelector('[data-usd-el="recommend-btn"]');
				const h1 = head.getBoundingClientRect().height, r1 = row.getBoundingClientRect().height;
				const tops = new Set(Array.from(row.children).map((c) => Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2)));
				b.style.display = 'none';
				const h0 = head.getBoundingClientRect().height, r0 = row.getBoundingClientRect().height;
				b.style.display = '';
				return { h1, h0, r1, r0, lines: tops.size, entryFits: entry.scrollWidth <= entry.clientWidth + 1 || entry.getAttribute('data-usd-fade') !== null,
					entryFull: entry.scrollWidth <= entry.clientWidth + 1, pageW: document.documentElement.scrollWidth, vw: window.innerWidth, over: b.scrollWidth > b.clientWidth + 1 };
			});
			const tag = 'C130C ' + size.w + 'px: ';
			assert(m.lines === 1 && Math.abs(m.r1 - m.r0) < 0.5 && Math.abs(m.h1 - m.h0) < 0.5 && !m.over, tag + 'パレットの行は1行で、ボタンがあっても高さは同じ（' + m.r1 + 'px）', m);
			assert(m.pageW <= m.vw, tag + '画面は横にはみ出さない', m);
			if (size.w >= 1280) assert(m.entryFull, tag + '入口の列が収まる（横に送らずに全部見える）', m);
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * D: 追加済みのスキルは、除外の設定に関わらず数える
	 * ==================================================================== */
	await block('C130D オススメサポ: ②で追加済みのスキルは、既定の除外（緑スキル・低効果・視野など）に当てはまっても母集団に入り、数えられる（除外は追加済みでないスキルにだけ効く）', async () => {
		const FILTER = { distance: 'medium', style: 'senko', surface: 'turf' };
		const sp = await openSp({ roster: Object.assign({}, FULL, { skillFilter: FILTER }), tab: 1 });
		// C-131: 組（目覚めと対応するスキル）のスキルは、相手も追加済みとして数えるので、この塊の材料には選ばない（組の数え方は blocks-17 の C131B）
		const paired = (REC.equivalentPairs || []).flatMap((p) => p.skillIds);
		const r = await sp.page.evaluate(async (paired) => {
			await UmaSkillDeckCore.loadSkillEffectLevels();
			const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
			const C = UmaSkillDeckCore.outside;
			const p0 = C.populationOf(roster);
			// 既定の除外で外れたスキルを、軸ごと（緑スキル・低効果・視野などの効果タイプ）に1つずつ選ぶ
			const isPassive = (id) => { const s = UmaSkillDeckCore.findSkill(id); return !!s && ((s.tags && s.tags.passive) || []).length > 0; };
			const pickBy = (fn) => p0.optionExcludedIds.find((id) => !paired.includes(id) && fn(id));
			const picks = [pickBy(isPassive), pickBy((id) => UmaSkillDeckCore.isLowEffectSkill(id) && !isPassive(id)), pickBy((id) => !isPassive(id) && !UmaSkillDeckCore.isLowEffectSkill(id))].filter(Boolean);
			const p1 = C.populationOf(roster, { addedSkillIds: picks });
			// 計算（outsideSolve の口）: 追加済みの印が付き、得られれば数える
			const s0 = C.solveSync({ roster, addedSkillIds: [], deadlineMs: 20000 });
			const s1 = C.solveSync({ roster, addedSkillIds: picks, deadlineMs: 20000 });
			return { picks, inP0: picks.filter((id) => p0.ids.includes(id)), inP1: picks.filter((id) => p1.ids.includes(id)), n0: p0.ids.length, n1: p1.ids.length,
				pop0: s0.stats.population, pop1: s1.stats.population, added1: s1.skills.filter((x) => x.added).map((x) => x.skillId) };
		}, paired);
		assert(r.picks.length >= 3, 'C130D 材料: 既定の除外で外れるスキル（緑スキル・低効果・効果タイプ）を1つずつ選べた（空振りでない）', r.picks);
		assert(r.inP0.length === 0 && r.inP1.length === r.picks.length && r.n1 === r.n0 + r.picks.length, 'C130D 追加済みにすると、除外に当てはまっても母集団に入る（ほかは変わらない）', r);
		assert(r.pop1 === r.pop0 + r.picks.length && r.added1.every((id) => r.picks.includes(id)), 'C130D 計算（outsideSolve）の母集団にも入り、得られたものは「追加済み」の印で数えられる', { pop0: r.pop0, pop1: r.pop1, added: r.added1 });
		// 画面の口: ②に足してから開くと、母集団の数が増えている（小窓の計算は②の一覧を追加済みとして渡す）
		await addByText(sp.page, r.picks.map(nameOf));
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 20000 });
		const help = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-help"]'); b.click(); return new Promise((res) => setTimeout(() => res((document.querySelector('[data-usd-el="outside-help-text"]') || {}).textContent || ''), 200)); });
		assert(help.includes('追加済みのスキルも数えます'), 'C130D 「？」の文面は変えていない（追加済みのスキルも数えます）', help);
		assert(jsErrors(sp.errors).length === 0, 'C130D コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * E: 「オススメサポαテスト」→「オススメサポ」
	 * ==================================================================== */
	await block('C130E 入口の列のボタンと小窓の見出しは「オススメサポ」（375・320・1280px で入口の列・見出しの行が崩れない）／オススメサポに関して「αテスト」の語は画面に残らない', async () => {
		for (const size of [{ w: 375, h: 812 }, { w: 320, h: 568 }, { w: 1280, h: 900 }]) {
			const sp = await openSp({ w: size.w, h: size.h, roster: Object.assign({}, FULL, { skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } }), tab: 1 });
			const e = await sp.page.evaluate(() => {
				const b = document.querySelector('#deck-template-panel [data-usd-el="outside-open"]');
				const row = b.parentElement;
				const tops = new Set(Array.from(row.children).map((c) => Math.round(c.getBoundingClientRect().top)));
				return { text: b.textContent.trim(), tops: tops.size, bh: b.getBoundingClientRect().height, wrap: getComputedStyle(b).whiteSpace };
			});
			await sp.page.click(T + '[data-usd-el="outside-open"]');
			await sp.page.waitForSelector(OM + '[data-usd-el="outside-title"]');
			const m = await sp.page.evaluate(() => {
				const t = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-title"]');
				const p = t.parentElement;
				const panel = document.querySelector('[data-usd-el="outside-modal"] .usd-out-panel');
				const lh = parseFloat(getComputedStyle(t).lineHeight) || t.getBoundingClientRect().height;
				return { text: t.textContent, label: panel.getAttribute('aria-label'), lines: Math.round(t.getBoundingClientRect().height / lh), pH: p.getBoundingClientRect().height,
					alpha: (document.querySelector('[data-usd-el="outside-modal"]').textContent.match(/αテスト/g) || []).length };
			});
			const tag = 'C130E ' + size.w + 'px: ';
			assert(e.text === 'オススメサポ' && e.tops === 1 && e.wrap === 'nowrap' && e.bh <= 32, tag + '入口のボタンは「オススメサポ」で、入口の列は1行', e);
			assert(m.text === 'オススメサポ' && m.label === 'オススメサポ' && m.lines === 1 && m.alpha === 0, tag + '小窓の見出しは「オススメサポ」（1行）・小窓に「αテスト」の語は無い', m);
			const panelAlpha = await sp.page.evaluate(() => (document.querySelector('#deck-template-panel').textContent.match(/αテスト/g) || []).length);
			assert(panelAlpha === 0, tag + '②のパネルに「αテスト」の語は無い', panelAlpha);
			await sp.ctx.close();
		}
	});
}
