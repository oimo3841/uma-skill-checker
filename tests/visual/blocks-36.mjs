// 大逃げの「要るスキル」（2026-10-18。skill-requires.json）の検査。run-smoke.mjs の末尾から register36() で呼ばれる
// （塊の見出しはすべて「大逃げ」で始まる。`npm run test:visual -- --only=大逃げ` で回せる）。
//
// 決め（おいもさん）: ＜…＞に「大逃げ」を持つ進化スキル（ex-1415）は、①で大逃げ（ex-0601）を取得しているときだけ進化先として選べる。
//   取得している＝①の取得の集合（●で、取得しないでなく、脚質・距離・バ場の絞り込みに合うもの）に入っていること。
//   本文の追加の効果の条件に「大逃げ」がある4件（ex-0334・ex-0459・ex-0523・ex-1658）は、大逃げの取得の有無に関わらず今までどおり。
//   大逃げは①の本育成編成だけで扱う（②の緑スキルの入口・条件で検索の母集団・オススメサポ・サポカ外・UmaExam の辞書には出さない）。
//   ①の合計・種数・Pt・取得の決め方は変えない。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。

export async function register36(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const OONIGE = 'ex-0601', BASE = 'ex-0336', EVO = 'ex-1415', UMA = 'uma-0154';
	const TRAIN = readJson('data/training-event-skills.json').entries;
	const EXT = readJson('data/extended-skills.json');
	// 大逃げを得る「取得の切り替え」のイベント番号（衣装ごと）。キーは 'uma:<umaId>#<番号>'
	const acqKey = (umaId) => {
		const e = TRAIN.find((x) => x.umaId === umaId);
		const i = e.events.findIndex((ev) => ev.acquireMode === 'user' && JSON.stringify(ev).includes(OONIGE));
		return i < 0 ? null : 'uma:' + umaId + '#' + i;
	};
	const roster = (o) => Object.assign({ umaId: UMA, cardIds: [], evolutionChoices: { [BASE]: EVO } }, o);
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.requires) await sp.page.route('**/data/skill-requires.json*', (r) => r.fulfill(json(o.requires)));
		if (o.ext) await sp.page.route('**/data/extended-skills.json*', (r) => r.fulfill(json(o.ext)));
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		await sp.page.evaluate(({ roster }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { roster: o.roster === undefined ? null : o.roster });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(false); await UmaSkillDeckCore.loadSkillPtData(false); await UmaSkillDeckCore.loadSkillEvolutions(false); });
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const partOf = (page, r) => page.evaluate((r) => {
		const C = UmaSkillDeckCore;
		const vp = C.getRosterVisiblePart(r);
		const plan = C.computeEvolutionPlan({ umaId: r.umaId, takenIds: vp.takenIds, filter: { style: (r.skillFilter || {}).style || '' }, race: null, choices: r.evolutionChoices });
		return { vp, plan };
	}, r);
	const STYLES = [['nige', '逃げ'], ['senko', '先行'], [null, '指定なし']];

	await block('大逃げ(1) 要るスキル: 大逃げの取得あり／なし × 脚質（逃げ・先行・指定なし）で、ex-1415 を選べるのは「取得あり、かつ大逃げが絞り込みに合う」ときだけ', async () => {
		const sp = await openSp({ roster: null });
		const key = acqKey(UMA);
		assert(!!key, '大逃げ(1) 前提: uma-0154 に大逃げを得る「取得の切り替え」のイベントがある', key);
		const bad = [];
		const seen = [];
		for (const [acq, acqLabel] of [[true, '取得あり'], [false, '取得なし']]) {
			for (const [style, styleLabel] of STYLES) {
				const r = roster(Object.assign({ acquirePicks: acq ? { [key]: true } : {} }, style ? { skillFilter: { style } } : {}));
				const { vp, plan } = await partOf(sp.page, r);
				const row = plan.a.find((e) => e.baseId === BASE);
				const selectable = vp.evoChoices && vp.evoChoices[BASE] === EVO;
				const want = acq && style !== 'senko';
				const hasOonige = vp.takenIds.includes(OONIGE);
				seen.push(acqLabel + '×' + styleLabel + ':' + (selectable ? '選べる' : '選べない') + '/大逃げ' + (hasOonige ? '○' : '×'));
				if (!row) { bad.push(acqLabel + '×' + styleLabel + ': 進化元の行が無い'); continue; }
				if (selectable !== want) bad.push(acqLabel + '×' + styleLabel + ' 期待 ' + want + ' 実際 ' + selectable);
				if (hasOonige !== want) bad.push(acqLabel + '×' + styleLabel + ' 大逃げが取得の集合に入るか 期待 ' + want + ' 実際 ' + hasOonige);
				// 選べないとき: 行（元の金スキル）は出たまま・進化先に「要るスキル」の印（missing）が付く（取得していないときだけ）
				const t = row.targets.find((x) => x.id === EVO);
				if (!want && (!t || (t.missing || []).join() !== OONIGE)) bad.push(acqLabel + '×' + styleLabel + ': 進化先に missing=[' + OONIGE + '] が付かない');
				if (want && t && t.missing) bad.push(acqLabel + '×' + styleLabel + ': 取得しているのに missing が付いている');
				if (!vp.visibleIds.includes(BASE) && (style !== 'senko' || true) && !vp.takenIds.includes(BASE)) bad.push(acqLabel + '×' + styleLabel + ': 元の金スキルの行が出ない');
			}
		}
		assert(bad.length === 0, '大逃げ(1) 取得あり／なし × 脚質の6通りが期待どおり', { bad, seen });
		// ①の合計・種数は、取得の切り替えの有無で、要るスキルの判定に影響されない（大逃げ自身のPtの分だけ動く）。ここでは「選べない」ことが合計を変えないことを見る
		const noReq = JSON.parse(JSON.stringify(readJson('data/skill-requires.json'))); noReq.entries = [];
		const rr = roster({ acquirePicks: {} });
		const a = await sp.page.evaluate((r) => { const d = UmaSkillDeckCore.getRosterPtDetail(r); return { total: d.total, kinds: d.kinds }; }, rr);
		await sp.ctx.close();
		// 破壊確認: 要るスキルの判定を外した（requires を空にした）データでは、取得なしでも選べてしまう（この塊が落ちる）
		const sp2 = await openSp({ roster: null, requires: noReq });
		const { vp: vp2 } = await partOf(sp2.page, roster({ acquirePicks: {} }));
		assert(vp2.evoChoices && vp2.evoChoices[BASE] === EVO, '大逃げ(1) 破壊確認: skill-requires の entries を空にすると、大逃げを取得していなくても ex-1415 が選べる（この塊の期待が落ちる）', vp2.evoChoices);
		const b = await sp2.page.evaluate((r) => { const d = UmaSkillDeckCore.getRosterPtDetail(r); return { total: d.total, kinds: d.kinds }; }, rr);
		assert(a.total === b.total && a.kinds === b.kinds, '大逃げ(1) 要るスキルの判定は、①の合計・種数を変えない', { a, b });
		await sp2.ctx.close();
	});

	await block('大逃げ(2) 要るスキルを取っていない進化先は、ラジオが無効（理由の文・トーストは出さない・強調もしない）／取得すれば選べる（2026-10-25・段0a で、押してトーストを出す動きから変えた）', async () => {
		const key = acqKey(UMA);
		const sp = await openSp({ roster: roster({ evolutionChoices: {}, acquirePicks: {} }) });
		await sp.page.evaluate(() => { const b = document.querySelector('#deck-roster-panel [data-usd-act="evo-open"]'); if (b) b.click(); });
		await sp.page.waitForTimeout(400);
		const name = EXT.entries.find((e) => e.id === OONIGE).name;
		const radio = await sp.page.evaluate((evo) => {
			const el = document.querySelector('[data-evo-key="' + 'ex-0336:' + evo + '"]');
			const lab = el && el.closest('label');
			return el ? { disabled: el.disabled, checked: el.checked, off: lab.classList.contains('usd-evo-target--off'), aria: lab.getAttribute('aria-disabled'), ng: lab.hasAttribute('data-evo-ng'), marks: lab.querySelectorAll('.usd-evo-ng').length, sr: lab.querySelectorAll('.usd-evo-sr').length, text: lab.textContent } : null;
		}, EVO);
		assert(radio && radio.disabled === true && radio.checked === false && radio.off === true && radio.aria === 'true', '大逃げ(2) 要るスキルを取っていない進化先は、ラジオが無効（disabled）・行は無効の見た目（usd-evo-target--off・aria-disabled）', radio);
		assert(radio && radio.ng === false && radio.marks === 0 && radio.sr === 0 && radio.text.indexOf('取得していないため') === -1 && radio.text.indexOf(name + 'を') === -1, '大逃げ(2) 理由の文は足さない・条件の語の強調（usd-evo-ng）もしない（要るスキルだけが足りない行は、条件が合わない行ではない）', radio);
		await sp.page.click('[data-evo-key="ex-0336:' + EVO + '"]', { force: true, timeout: 1000 }).catch(() => {});
		await sp.page.waitForTimeout(300);
		const after = await sp.page.evaluate((evo) => ({ checked: document.querySelector('[data-evo-key="ex-0336:' + evo + '"]').checked, toast: (document.getElementById('toast-message') || {}).textContent || '', toastShown: !!document.querySelector('#toast:not(.hidden), .uma-toast--show') }), EVO);
		assert(after.checked === false && after.toast.indexOf('取得していないため選べません') === -1, '大逃げ(2) 押しても選ばれず、トースト（「…を取得していないため選べません」）は出ない', after);
		await sp.ctx.close();
		// 取得すれば選べる
		const sp2 = await openSp({ roster: roster({ evolutionChoices: {}, acquirePicks: { [key]: true } }) });
		await sp2.page.evaluate(() => { const b = document.querySelector('#deck-roster-panel [data-usd-act="evo-open"]'); if (b) b.click(); });
		await sp2.page.waitForTimeout(400);
		await sp2.page.click('[data-evo-key="ex-0336:' + EVO + '"]', { force: true });
		await sp2.page.waitForTimeout(300);
		const ok = await sp2.page.evaluate((evo) => document.querySelector('[data-evo-key="ex-0336:' + evo + '"]').checked, EVO);
		assert(ok === true, '大逃げ(2) 大逃げを取得していれば、押して選べる', ok);
		await sp2.ctx.close();
	});

	await block('大逃げ(3) 本文の追加の効果の条件に「大逃げ」を持つ4件（ex-0334・ex-0459・ex-0523・ex-1658）は、大逃げの取得の有無に関わらず今までどおり（行・Pt・選べるか）', async () => {
		const sp = await openSp({ roster: null });
		const owners = { 'ex-0334': 'uma-0154', 'ex-0459': 'uma-0224', 'ex-0523': 'uma-0263' };
		const bad = [];
		for (const [id, uma] of Object.entries(owners)) {
			const key = acqKey(uma);
			const run = async (acq, style) => {
				const r = { umaId: uma, cardIds: [] }; if (acq && key) r.acquirePicks = { [key]: true }; if (style) r.skillFilter = { style };
				return sp.page.evaluate(({ r, id }) => { const C = UmaSkillDeckCore; const vp = C.getRosterVisiblePart(r); const d = C.getRosterPtDetail(r); const it = d.items.find((x) => x.skillId === id); return { shown: vp.visibleIds.includes(id), taken: vp.takenIds.includes(id), pt: it ? it.pt : null }; }, { r, id });
			};
			for (const style of [null, 'nige', 'senko']) {
				const a = await run(true, style), b = await run(false, style);
				if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(id + '@' + (style || 'なし') + ': 取得あり ' + JSON.stringify(a) + ' / なし ' + JSON.stringify(b));
				if (!a.taken && style !== 'senko') bad.push(id + '@' + (style || 'なし') + ': 取得されない');
			}
		}
		// ex-1658 は uma-0263 の ex-0524 の進化先。要るスキルの印が付かず、取得の有無で選べるかが変わらない
		const key = acqKey('uma-0263');
		const sel = async (acq) => sp.page.evaluate(({ acq, key }) => {
			const C = UmaSkillDeckCore; const r = { umaId: 'uma-0263', cardIds: [], evolutionChoices: { 'ex-0524': 'ex-1658' } }; if (acq && key) r.acquirePicks = { [key]: true };
			const vp = C.getRosterVisiblePart(r);
			const plan = C.computeEvolutionPlan({ umaId: r.umaId, takenIds: vp.takenIds, filter: {}, race: null, choices: r.evolutionChoices });
			const row = plan.a.find((e) => e.baseId === 'ex-0524');
			return { choice: vp.evoChoices ? vp.evoChoices['ex-0524'] : null, missing: row ? row.targets.map((t) => t.missing || null) : 'no row' };
		}, { acq, key });
		const s1 = await sel(true), s2 = await sel(false);
		if (JSON.stringify(s1) !== JSON.stringify(s2) || s1.choice !== 'ex-1658' || JSON.stringify(s1.missing) !== '[null]') bad.push('ex-1658: ' + JSON.stringify([s1, s2]));
		// データの側: 要るスキルの対応に入っているのは ex-1415 だけ
		const reqs = readJson('data/skill-requires.json').entries;
		assert(reqs.length === 1 && reqs[0].skillId === EVO && reqs[0].requiresSkillIds.join() === OONIGE, '大逃げ(3) skill-requires.json は ex-1415 → ex-0601 の1行だけ', reqs);
		assert(bad.length === 0, '大逃げ(3) 4件は大逃げの取得の有無・脚質で、行・取得・Ptが変わらない（ex-1658 は選べる／要るスキルの印なし）', bad);
		await sp.ctx.close();
	});

	await block('大逃げ(4) 大逃げ（ex-0601）は、②の緑スキルの入口（68件）・条件で検索の母集団（455件）・オススメサポ・サポカ外・UmaExam の辞書に出ない（passive のタグを付けたあとも）／①の表では緑の行になる', async () => {
		const sp = await openSp({ roster: null });
		const r = await sp.page.evaluate(async (id) => {
			const C = UmaSkillDeckCore;
			const passive = C.getPoolExcludedSkills().map((s) => s.id);
			const pop = C.outside.populationOf({ outsideOptions: { exclude: {} } });
			const cand = JSON.stringify(C.outside.candidatesOf({ umaId: 'uma-0001', cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'] }));
			const s = C.findSkill(id);
			return { passiveN: passive.length, passiveHas: passive.includes(id), popN: pop.ids.length + pop.noRaceExcludedIds.length, popHas: pop.ids.includes(id), candHas: cand.includes('"' + id + '"'), tag: s && s.tags && s.tags.passive, idx: C.getSkillTextIndexSize({ searchableOnly: true }), idxAll: C.getSkillTextIndexSize({}) };
		}, OONIGE);
		assert(r.passiveN === 68 && !r.passiveHas, '大逃げ(4) ②の緑スキルの入口は68件で、大逃げを含まない', r);
		assert(r.popN === 462 && !r.popHas && !r.candHas, '大逃げ(4) 条件で検索の母集団は462件（2026-10-26 に ex-1693 で1件・2026-10-25a で6件増えた。オススメサポの母集団は、レースが無いと外れるレース条件の緑スキルを戻して462件）・オススメサポの母集団・候補のカードに大逃げが入らない', r);
		assert(JSON.stringify(r.tag) === '["passive"]', '大逃げ(4) 前提: 大逃げには passive のタグが付いている', r.tag);
		const nonSupport = readJson('data/non-support-skills.json').entries.map((e) => e.skillId);
		const searchable = readJson('data/searchable-extended-ids.json').entries.map((e) => e.skillId);
		assert(!nonSupport.includes(OONIGE) && !searchable.includes(OONIGE), '大逃げ(4) サポカ外の一覧にも、検索の範囲（searchable-extended-ids.json）にも入っていない', {});
		await sp.ctx.close();
		// passive のタグを外したデータ（2026-10-17a の状態）と、辞書の大きさが同じ（タグを付けても辞書は増えない・減らない）
		const old = JSON.parse(JSON.stringify(EXT));
		old.entries.find((e) => e.id === OONIGE).tags.passive = [];
		const sp2 = await openSp({ roster: null, ext: old });
		const r2 = await sp2.page.evaluate(() => ({ idx: UmaSkillDeckCore.getSkillTextIndexSize({ searchableOnly: true }), idxAll: UmaSkillDeckCore.getSkillTextIndexSize({}) }));
		assert(r2.idx === r.idx && r2.idxAll === r.idxAll, '大逃げ(4) UmaExam の辞書（searchableOnly）の大きさが、passive のタグを付けても変わらない', { r, r2 });
		await sp2.ctx.close();
		// ①の表: 取得したときに緑の行（名前が緑）になる
		const key = acqKey(UMA);
		const sp3 = await openSp({ roster: roster({ evolutionChoices: {}, acquirePicks: { [key]: true } }) });
		const cls = await sp3.page.evaluate((id) => { const b = document.querySelector('#deck-roster-panel .usd-roster-skillname[data-usd-info="' + id + '"]'); return b ? b.className : null; }, OONIGE);
		assert(cls && cls.includes('usd-roster-skillname--passive'), '大逃げ(4) ①の表で大逃げの行が緑（passive）の行になる', cls);
		await sp3.ctx.close();
	});
}
