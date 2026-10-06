// C-129（2026-10-06）の検査。run-smoke.mjs の末尾から register15() で呼ばれる
// （塊の見出しはすべて「C129」で始まる。`npm run test:visual -- --only=C129` で回せる。B・C・D だけなら「C129B」「C129C」「C129D」）。
//
// B: セットのレース条件を、②の追加の4経路（条件で検索・緑スキル・テキストで検索・スクショで追加）にも効かせる
// C: 「低効果を除外」（①の列見出し。②のパレットのボタンは C-130 で脚質のボタンに置き換えて削除した＝その塊は下で外した）
// D: オススメサポ（当時は「オススメサポαテスト」）の除外の既定（デバフ・持久力回復・視野・緑スキル・低効果）と、新しい2つのチップ
// スキル名・レース名・段階の名前は検査の側に書かない（恒久ルール1。データか画面から読む）。

export async function register15(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const RACE = readJson('data/upcoming-races.json').races[0];
	const EFFECT = readJson('data/skill-effect-levels.json');
	const rankOf = new Map(EFFECT.stages.map((s) => [s.key, s.rank]));
	const isLow = (id) => { const e = EFFECT.entries.find((x) => x.skillId === id); return !!e && e.maxStage !== null && rankOf.get(e.maxStage) <= EFFECT.lowEffectMax.rank; };
	const LOW_IDS = EFFECT.entries.filter((e) => isLow(e.skillId)).map((e) => e.skillId);
	const NULL_IDS = EFFECT.entries.filter((e) => e.maxStage === null).map((e) => e.skillId);
	const HIGH_IDS = EFFECT.entries.filter((e) => e.maxStage !== null && !isLow(e.skillId)).map((e) => e.skillId);
	const TOP_STAGE = EFFECT.stages.slice().sort((a, b) => b.rank - a.rank)[0].key;
	const LOW_STAGE = EFFECT.lowEffectMax.key;
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FILTER = { distance: 'medium', style: 'senko', surface: 'turf' };
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6 };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const P = '#deck-roster-panel ';
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const OM = '[data-usd-el="outside-modal"] ';

	/** special.html を開く。roster＝下書きの①、userData＝保存データ、tab＝ステップのタブ、effect＝効果の段階のファイルの差し替え（'fail' で 500） */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, o.userData || EMPTY);
		sp.effReqs = [];
		sp.page.on('request', (r) => { if (r.url().includes('skill-effect-levels.json')) sp.effReqs.push(r.url()); });
		if (o.effect === 'fail') await sp.page.route('**/data/skill-effect-levels.json*', (r) => r.fulfill({ status: 500, body: 'x' }));
		else if (o.effect) await sp.page.route('**/data/skill-effect-levels.json*', (r) => r.fulfill(json(o.effect)));
		await sp.page.evaluate(({ roster, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster === undefined ? FULL : o.roster, tab: o.tab === undefined ? 1 : o.tab });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(300);
		if (o.set) {
			await sp.page.click(BAR + '[data-usd-act="set-list"]');
			const already = await sp.page.evaluate((v) => { const i = document.querySelector('[data-usd-el="set-list"] input[value="' + v + '"]'); return !!i && i.checked; }, o.set);
			if (already) await sp.page.keyboard.press('Escape'); else await sp.page.click('[data-usd-el="set-list"] input[value="' + o.set + '"]');
			await sp.page.waitForTimeout(300);
		}
		return sp;
	};
	const closePicker = async (page) => { await page.click('[data-usd-act="picker-close"]'); await page.waitForTimeout(200); };
	const draftIds = (page) => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null'); return d ? d.skillIds : []; });
	/** 条件で検索の一覧（理由ごとの行と、追加できる行の数） */
	const readFilterList = (page) => page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('[data-usd-el="results"] label.usd-row'));
		const race = rows.filter((r) => /レース条件/.test((r.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || ''));
		return {
			count: document.querySelector('[data-usd-el="result-count"]').textContent,
			addable: rows.filter((r) => !r.classList.contains('usd-row--excluded')).length,
			race: race.length, raceDisabled: race.every((r) => r.querySelector('input').disabled),
			raceNames: race.map((r) => r.querySelector('span').textContent),
			addableNames: rows.filter((r) => !r.classList.contains('usd-row--excluded')).map((r) => r.querySelector('span').textContent),
			label: document.querySelector('[data-usd-el="result-excluded"]').textContent,
			// 件数の行は折り返さない作り（nowrap）なので、はみ出していないこと（右端が箱の中）
			labelFits: (() => { const e = document.querySelector('[data-usd-el="result-excluded"]'); return e.hidden || e.getBoundingClientRect().right <= e.parentElement.getBoundingClientRect().right + 0.5; })(),
			reasons: Array.from(new Set(rows.map((r) => (r.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent).filter(Boolean)))
		};
	});
	const readPassiveList = (page) => page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('[data-usd-el="passive-results"] label.usd-row'));
		const race = rows.filter((r) => /レース条件/.test((r.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || ''));
		return { race: race.length, raceDisabled: race.every((r) => r.querySelector('input').disabled), raceIds: race.map((r) => r.querySelector('input').value),
			label: document.querySelector('[data-usd-el="passive-excluded"]').textContent };
	});

	/* ====================================================================
	 * B: レース条件を②の追加の4経路にも
	 * ==================================================================== */
	await block('C129B 条件で検索・緑スキル: レース条件に合わないスキルは、チェック不可のグレーアウトで残り、理由「レース条件に合わないため選べない」／「N件」は追加できる行だけ／指定なしでは今までどおり', async () => {
		const sp = await openSp({ roster: Object.assign({}, FULL, { race: RACE }) });
		await sp.page.click(T + '[data-usd-act="editor-pick"]');
		await sp.page.waitForSelector('[data-usd-el="results"] label.usd-row');
		const a = await readFilterList(sp.page);
		assert(a.race > 0 && a.raceDisabled, 'C129B(a) 条件で検索: レース条件に合わない行がグレーアウト（チェック不可）で残る（' + a.race + '件。空振りでない）', { race: a.race });
		assert(a.count === a.addable + '件', 'C129B(a) 「N件」は追加できる行だけを数える', { count: a.count, addable: a.addable });
		// 件数: レース条件だけなら「レース条件に合わないため選べない N件」、本育成の分もあるときは短い形「選べない：本育成編成 M件・レース条件 N件」
		const raceNum = (label) => { const m = /レース条件(?:に合わないため選べない)? (\d+)件/.exec(label); return m ? Number(m[1]) : -1; };
		assert(a.reasons.includes('レース条件に合わないため選べない') && raceNum(a.label) === a.race && a.labelFits, 'C129B(a) 理由と件数の文言（件数の行は1行に収まる）', { reasons: a.reasons, label: a.label, fits: a.labelFits });
		// 本育成の理由が重なるものは、本育成の理由が先（レース条件の件数には数えない）
		assert(a.label.indexOf('本育成') === -1 || a.label.indexOf('本育成') < a.label.indexOf('レース条件'), 'C129B(a) 件数の並びは本育成の分が先', a.label);
		await closePicker(sp.page);
		await sp.page.click(T + '[data-usd-act="editor-pick-passive"]');
		await sp.page.waitForSelector('[data-usd-el="passive-results"] label.usd-row');
		const b = await readPassiveList(sp.page);
		assert(b.race > 0 && b.raceDisabled && raceNum(b.label) === b.race, 'C129B(b) 緑スキル: レース条件に合わない行がグレーアウト（チェック不可）で残る（' + b.race + '件）', b);
		// チェック不可の行を押しても足されない（保険の経路）
		await sp.page.evaluate((id) => { const i = document.querySelector('[data-usd-el="passive-results"] input[value="' + id + '"]'); i.disabled = false; i.click(); }, b.raceIds[0]);
		await sp.page.waitForTimeout(200);
		const ids1 = await draftIds(sp.page);
		assert(ids1.indexOf(b.raceIds[0]) === -1, 'C129B(b) 押せてしまっても、レース条件に合わない緑スキルは足されない', ids1);
		await closePicker(sp.page);
		assert(jsErrors(sp.errors).length === 0, 'C129B(a)(b) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 指定なしでは今までどおり（レース条件の行は無い）
		const sp2 = await openSp({ roster: FULL });
		await sp2.page.click(T + '[data-usd-act="editor-pick"]');
		await sp2.page.waitForSelector('[data-usd-el="results"] label.usd-row');
		const n = await readFilterList(sp2.page);
		// （レースは①の距離・バ場も固定するので、本育成で得るスキルの顔ぶれも変わる。比べるのは追加できる行の数だけ）
		assert(n.race === 0 && n.addable > a.addable && !/レース条件/.test(n.label), 'C129B 指定なし: レース条件の行は無く、追加できる行はレースありより多い', { none: n.addable, race: a.addable });
		await closePicker(sp2.page);
		await sp2.page.click(T + '[data-usd-act="editor-pick-passive"]');
		await sp2.page.waitForSelector('[data-usd-el="passive-results"] label.usd-row');
		const n2 = await readPassiveList(sp2.page);
		assert(n2.race === 0, 'C129B 指定なし: 緑スキルにもレース条件の行は無い', n2);
		await sp2.ctx.close();
		// 320px でも、件数の行（本育成とレース条件の両方）は1行に収まる
		const sp3 = await openSp({ w: 320, h: 568, roster: Object.assign({}, FULL, { race: RACE }) });
		await sp3.page.click(T + '[data-usd-act="editor-pick"]');
		await sp3.page.waitForSelector('[data-usd-el="results"] label.usd-row');
		const n3 = await readFilterList(sp3.page);
		assert(n3.race > 0 && n3.labelFits && /^選べない：本育成編成 \d+件・レース条件 \d+件$/.test(n3.label), 'C129B 320px: 両方あるときの件数は短い形で、1行に収まる', { label: n3.label, fits: n3.labelFits });
		await sp3.ctx.close();
	});

	await block('C129B テキストで検索・スクショで追加: 一致した行のうちレース条件に合わないものは追加せず、「レース条件に合わないため追加しなかったもの N種」を出す／指定なしでは今までどおり', async () => {
		const sp = await openSp({ roster: Object.assign({}, FULL, { race: RACE }) });
		// 名前は画面から読む（条件で検索の一覧の、合わない行と追加できる行）
		await sp.page.click(T + '[data-usd-act="editor-pick"]');
		await sp.page.waitForSelector('[data-usd-el="results"] label.usd-row');
		const a = await readFilterList(sp.page);
		await closePicker(sp.page);
		const bad = a.raceNames[0], ok = a.addableNames[0];
		assert(!!bad && !!ok, 'C129B(c) 材料: レース条件に合わない名前と、追加できる名前がある', { bad, ok });
		// (c) テキストで検索
		await sp.page.click(T + '[data-usd-act="editor-pick-text"]');
		await sp.page.fill('[data-usd-el="paste-input"]', bad + '\n' + ok);
		await sp.page.click('[data-usd-act="paste-run"]');
		await sp.page.waitForTimeout(300);
		const c = await sp.page.evaluate(() => ({
			race: (document.querySelector('[data-usd-el="paste-race-blocked"]') || {}).textContent || null,
			ok: (document.querySelector('[data-usd-el="paste-report"] .usd-paste-ok') || {}).textContent || null,
			checked: document.querySelector('[data-usd-el="picker-checked-count"]').textContent }));
		assert(c.race === 'レース条件に合わないため追加しなかったもの 1種' && c.ok === '選択 1件' && c.checked === '1種選択', 'C129B(c) 合わないものは選択に入れず「追加しなかったもの 1種」・選択は1件', c);
		await sp.page.click('[data-usd-el="picker-commit"]');
		await sp.page.waitForTimeout(300);
		const ids = await draftIds(sp.page);
		const names = await sp.page.evaluate((list) => list.map((id) => UmaSkillDeckCore.findSkill(id) ? UmaSkillDeckCore.findSkill(id).name : id), ids);
		assert(names.includes(ok) && !names.includes(bad), 'C129B(c) 確定で足されるのは合うものだけ', names);
		await closePicker(sp.page);
		// (d) スクショで追加（画像から読み取る）の口
		const d = await sp.page.evaluate(({ bad, ok2 }) => {
			const m = UmaSkillDeckCore.matchPastedSkillText(bad + '\n' + ok2);
			const rows = m.rows.map((r) => ({ raw: r.matchedName, norm: r.matchedName, kind: 'exact', matchedId: r.matchedId, matchedName: r.matchedName, candidates: [{ id: r.matchedId, name: r.matchedName, distance: 0 }] }));
			window.__rowsAdded = null;
			UmaSkillDeckCore.openSkillRowsPicker([], (list) => { window.__rowsAdded = list.slice(); }, rows, { white: 2, gold: 0, unreadable: 0 });
			return { race: (document.querySelector('[data-usd-el="paste-race-blocked"]') || {}).textContent || null, checked: document.querySelector('[data-usd-el="picker-checked-count"]').textContent, badId: rows[0].matchedId };
		}, { bad, ok2: a.addableNames[1] });
		assert(d.race === 'レース条件に合わないため追加しなかったもの 1種' && d.checked === '1種選択', 'C129B(d) スクショで追加: 合わないものは選択に入れず「追加しなかったもの 1種」', d);
		await sp.page.click('[data-usd-el="picker-commit"]');
		await sp.page.waitForTimeout(200);
		const added = await sp.page.evaluate(() => window.__rowsAdded);
		assert(Array.isArray(added) && added.length === 1 && added.indexOf(d.badId) === -1, 'C129B(d) 確定で足されるのは合うものだけ', added);
		assert(jsErrors(sp.errors).length === 0, 'C129B(c)(d) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 指定なし: 同じ2つがどちらも選択に入る（今までどおり）
		const sp2 = await openSp({ roster: FULL });
		await sp2.page.click(T + '[data-usd-act="editor-pick-text"]');
		await sp2.page.fill('[data-usd-el="paste-input"]', bad + '\n' + ok);
		await sp2.page.click('[data-usd-act="paste-run"]');
		await sp2.page.waitForTimeout(300);
		const c2 = await sp2.page.evaluate(() => ({ race: !!document.querySelector('[data-usd-el="paste-race-blocked"]'), checked: document.querySelector('[data-usd-el="picker-checked-count"]').textContent }));
		assert(!c2.race && c2.checked === '2種選択', 'C129B 指定なし: テキストで検索では2つとも選択に入る（今までどおり）', c2);
		await sp2.ctx.close();
	});

	await block('C129B レースを選んだあとも、手で追加済みのスキルは②の一覧から消えない', async () => {
		const sp = await openSp({ roster: FULL });
		await sp.page.click(T + '[data-usd-act="editor-pick"]');
		await sp.page.waitForSelector('[data-usd-el="results"] label.usd-row');
		const names = (await readFilterList(sp.page)).addableNames;
		await closePicker(sp.page);
		// 足しておく（全部）→ レースを選ぶ（保存の口から直接）
		await sp.page.click(T + '[data-usd-act="editor-pick-text"]');
		await sp.page.fill('[data-usd-el="paste-input"]', names.slice(0, 30).join('\n'));
		await sp.page.click('[data-usd-act="paste-run"]');
		await sp.page.waitForTimeout(200);
		await sp.page.click('[data-usd-el="picker-commit"]');
		await closePicker(sp.page);
		const before = await draftIds(sp.page);
		await sp.page.evaluate((race) => { const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')); r.race = race; localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(r)); }, RACE);
		await sp.page.reload({ waitUntil: 'networkidle' });
		await sp.page.waitForTimeout(600);
		const after = await draftIds(sp.page);
		assert(before.length >= 20 && JSON.stringify(before) === JSON.stringify(after), 'C129B 追加済みの ' + before.length + '種は、レースを選んだあとも同じ（消さない）', { before: before.length, after: after.length });
		await sp.ctx.close();
	});

	/* ====================================================================
	 * C: 「低効果を除外」
	 * ==================================================================== */
	/** ①の表（DOM の順）を、金と直下の前段の白のまとまりに分けて読む */
	const readRosterUnits = (page) => page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grid > .usd-roster-grow[data-skill-id]'));
		const units = [];
		rows.forEach((r) => {
			const box = r.querySelector('input[data-usd-act="take-skill"]');
			const it = { id: r.getAttribute('data-skill-id'), prev: r.classList.contains('usd-roster-grow--prev'), sure: !!box, checked: !!box && box.checked };
			if (it.prev && units.length) units[units.length - 1].push(it); else units.push([it]);
		});
		return units;
	});
	const offIds = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')) || {}).offSkillIds || []);

	/* C-131（2026-10-07）で外した塊（3つ）: 「C129C ①の列見出し: 「低効果を除外」は…」「C129C ①: 確認の小窓…」「C129C ①: 金スキルの段階でまとまりごと判定する…」。
	   ①の「低効果を除外」のボタンと確認の小窓を削除したため（低効果の除外が要るのは②の場面で、①では不要。おいもさんの判断）。
	   ①の列見出しにボタンが無いこと・高さが 49px のままであることは blocks-17 の「C131C」が見る。 */

	/* C-130（2026-10-06）で外した塊: 「C129C ②: 低効果のスキルだけ一覧から外れる…」。
	   ②の「低効果を除外」のボタンと確認の小窓を削除し、同じ場所を①の脚質に応じたボタン（逃げオススメ・先差追オススメ）に置き換えたため。
	   ②にボタンが無いこと・①のボタンが残ることは blocks-16 の「C130C ①の脚質で…」が見る。
	   ①の「低効果を除外」（上の2つの塊）は残る。 */

	/* ====================================================================
	 * D: オススメサポαテストの除外の既定
	 * ==================================================================== */
	const settle = (page) => page.waitForFunction(() => {
		const m = document.querySelector('[data-usd-el="outside-modal"]');
		return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]');
	}, null, { timeout: 20000 });
	const readExclude = (page) => page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('[data-usd-el="outside-exclude-axis"]'));
		return {
			heads: rows.map((r) => r.querySelector('.usd-out-filterlabel').textContent),
			first: rows[0] ? Array.from(rows[0].querySelectorAll('[data-usd-el="outside-exclude-chip"]')).map((b) => b.textContent + ':' + b.getAttribute('aria-pressed')) : [],
			pressed: Array.from(document.querySelectorAll('[data-usd-el="outside-exclude-chip"][aria-pressed="true"]')).map((b) => b.getAttribute('data-axis') + ':' + b.getAttribute('data-value'))
		};
	});
	const savedOpts = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')) || {}).outsideOptions || null);

	await block('C129D 既定の除外は デバフ・持久力回復・視野・緑スキル・低効果 の5つ（保存値の無いセット）／ボタンの文字は列挙／小窓の先頭に新しい2つのチップ', async () => {
		const def = await (async () => { const sp = await openSp({ roster: Object.assign({}, FULL, { skillFilter: FILTER }) }); const v = await sp.page.evaluate(() => UmaSkillDeckCore.outside.EXCLUDE_DEFAULT); await sp.ctx.close(); return v; })();
		assert(JSON.stringify(def) === JSON.stringify({ effect: ['debuff', 'stamina', 'vision'], extra: ['passive', 'lowEffect'] }), 'C129D 既定（EXCLUDE_DEFAULT）は デバフ・持久力回復・視野＋緑スキル・低効果', def);
		const sp = await openSp({ roster: Object.assign({}, FULL, { skillFilter: FILTER }) });
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		await settle(sp.page);
		const label = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-exclude-label"]').textContent);
		const labels = ['デバフ', '持久力回復', '視野', '緑スキル', '低効果'];
		assert(label.startsWith('除外：') && labels.every((l) => label.includes(l)), 'C129D ボタンの文字は「除外：」＋5つの列挙', label);
		// 母集団: 既定で、低効果・緑スキルのスキルが外れている（データは開いたときに読まれている）
		const pop = await sp.page.evaluate((low) => {
			const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
			const p = UmaSkillDeckCore.outside.populationOf(r);
			const isPassive = (id) => { const s = UmaSkillDeckCore.findSkill(id); return !!s && ((s.tags && s.tags.passive) || []).length > 0; };
			return { ok: p.ok, inLow: p.ids.filter((id) => low.indexOf(id) !== -1).length, inPassive: p.ids.filter(isPassive).length,
				exLow: p.optionExcludedIds.filter((id) => low.indexOf(id) !== -1).length, exPassive: p.optionExcludedIds.filter(isPassive).length };
		}, LOW_IDS);
		assert(pop.ok && pop.inLow === 0 && pop.inPassive === 0 && pop.exLow > 0 && pop.exPassive > 0, 'C129D 既定で、低効果・緑スキルのスキルは母集団から外れる（どちらも空振りでない）', pop);
		await sp.page.click(OM + '[data-usd-el="outside-exclude-btn"]');
		await sp.page.waitForSelector('[data-usd-el="outside-exclude-chip"]');
		const ex = await readExclude(sp.page);
		assert(ex.heads[0] === '全般' && JSON.stringify(ex.first) === JSON.stringify(['緑スキル:true', '低効果:true']), 'C129D 小窓の先頭は見出し「全般」で、緑スキル・低効果（既定で押されている）', ex);
		assert(['effect:debuff', 'effect:stamina', 'effect:vision', 'extra:passive', 'extra:lowEffect'].every((k) => ex.pressed.includes(k)) && ex.pressed.length === 5, 'C129D 押されているのは既定の5つだけ', ex.pressed);
		assert((await savedOpts(sp.page)) === null, 'C129D 開いただけでは保存しない', await savedOpts(sp.page));
		// 切り替え・保存・復元
		await sp.page.click('[data-usd-el="outside-exclude-chip"][data-axis="extra"][data-value="passive"]');
		await sp.page.waitForTimeout(300);
		const s1 = await savedOpts(sp.page);
		assert(s1 && JSON.stringify(s1.exclude) === JSON.stringify({ effect: ['stamina', 'debuff', 'vision'], extra: ['lowEffect'] }), 'C129D 「緑スキル」を外すと、extra は低効果だけで保存される', s1);
		await sp.page.click('[data-usd-el="outside-exclude-chip"][data-axis="extra"][data-value="lowEffect"]');
		await sp.page.waitForTimeout(300);
		const s2 = await savedOpts(sp.page);
		assert(s2 && JSON.stringify(s2.exclude) === JSON.stringify({ effect: ['stamina', 'debuff', 'vision'] }), 'C129D 「低効果」も外すと、extra の項目ごと消える', s2);
		await sp.page.click('[data-usd-el="outside-exclude-chip"][data-axis="extra"][data-value="passive"]');
		await sp.page.waitForTimeout(300);
		await sp.page.reload({ waitUntil: 'networkidle' });
		await sp.page.waitForTimeout(600);
		const s3 = await savedOpts(sp.page);
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		await settle(sp.page);
		await sp.page.click(OM + '[data-usd-el="outside-exclude-btn"]');
		await sp.page.waitForSelector('[data-usd-el="outside-exclude-chip"]');
		const ex3 = await readExclude(sp.page);
		assert(s3 && JSON.stringify(s3.exclude) === JSON.stringify({ effect: ['stamina', 'debuff', 'vision'], extra: ['passive'] }) && JSON.stringify(ex3.first) === JSON.stringify(['緑スキル:true', '低効果:false']),
			'C129D 再読み込みのあとも、保存した選び方（緑スキルだけ）が戻る', { s3, first: ex3.first });
		assert(jsErrors(sp.errors).length === 0, 'C129D コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C129D すでに除外を保存してあるセットは今までの値のまま読む（緑スキル・低効果を足さない・保存値を書き換えない）／段階のデータが読めなくてもオススメは落ちない', async () => {
		const old = Object.assign({}, FULL, { skillFilter: FILTER, outsideOptions: { exclude: { effect: ['debuff', 'stamina'] } } });
		const sp = await openSp({ roster: old });
		const raw0 = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		await settle(sp.page);
		const label = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-exclude-label"]').textContent);
		assert(label === '除外：持久力回復・デバフ', 'C129D 保存してある除外（デバフ・持久力回復）はそのまま読む', label);
		const raw1 = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		assert(raw0 === raw1, 'C129D 開いても保存値は1バイトも変わらない', { raw0: raw0.length, raw1: raw1.length });
		await sp.ctx.close();
		// 読めないとき（既定＝低効果あり）
		const sp2 = await openSp({ roster: Object.assign({}, FULL, { skillFilter: FILTER }), effect: 'fail' });
		await sp2.page.click(T + '[data-usd-el="outside-open"]');
		await settle(sp2.page);
		const r = await sp2.page.evaluate(() => ({ cards: document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').length,
			err: !!document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-error"]') }));
		assert(r.cards > 0 && !r.err, 'C129D 段階のデータが読めなくても、オススメは出る（低効果では何も外さない）', r);
		assert(jsErrors(sp2.errors).length === 0, 'C129D 読めないとき: コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});
}
