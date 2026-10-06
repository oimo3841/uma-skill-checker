// C-131（2026-10-07）の検査。run-smoke.mjs の末尾から register17() で呼ばれる
// （塊の見出しはすべて「C131」で始まる。`npm run test:visual -- --only=C131` で回せる。A・C だけなら「C131A」「C131C」）。
//
// A: オススメサポで、②に追加済みのスキルを数える（タイルの「＋N種」・小窓の「対象」・下段の新しい表示）
// C: ①の「低効果を除外」ボタンと確認の小窓を削除した（オススメサポの除外の「低効果」は残る）
// B: 目覚めを、対応するスキルと同じものとして扱う（組は recommended-skills.json の equivalentPairs）
// D: 脚質のボタン（逃げオススメ・先差追オススメ）を、追加できるものが0種でも押せない状態にしない
// スキル名・レース名は検査の側に書かない（恒久ルール1。データか画面から読む）。

export async function register17(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const RACES = readJson('data/upcoming-races.json').races;
	const RACE = RACES.find((r) => r.direction && r.season);
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FILTER = { distance: 'medium', style: 'senko', surface: 'turf' };
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: FILTER };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const M = '[data-usd-el="outside-modal"] ';

	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	/** o.rec＝recommended-skills.json の差し替え（'fail' で 500）・o.umas＝training-umamusume.json の差し替え */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		sp.recReqs = [];
		sp.page.on('request', (r) => { if (r.url().includes('recommended-skills.json')) sp.recReqs.push(r.url()); });
		if (o.rec === 'fail') await sp.page.route('**/data/recommended-skills.json*', (r) => r.fulfill({ status: 500, body: 'x' }));
		else if (o.rec) await sp.page.route('**/data/recommended-skills.json*', (r) => r.fulfill(json(o.rec)));
		if (o.umas) await sp.page.route('**/data/training-umamusume.json*', (r) => r.fulfill(json(o.umas)));
		await sp.page.evaluate(({ roster, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster || FULL, tab: o.tab === undefined ? 1 : o.tab });
		sp.recReqs = [];
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(400);
		return sp;
	};
	const REC = readJson('data/recommended-skills.json');
	const UMAS_DOC = readJson('data/training-umamusume.json');
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const nameOf = (id) => (MASTER.find((s) => String(s.id) === id) || {}).name;
	const toastText = (page) => page.evaluate(() => document.getElementById('toast-message').textContent);
	const hiddenIds = (page) => page.evaluate(() => UmaSkillDeckCore.getPickerHiddenIds());
	const addByText = async (page, names) => {
		await page.click(T + '[data-usd-act="editor-pick-text"]');
		await page.fill('[data-usd-el="paste-input"]', names.join('\n'));
		await page.click('[data-usd-act="paste-run"]');
		await page.waitForTimeout(200);
		await page.click('[data-usd-el="picker-commit"]');
		await page.waitForTimeout(200);
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(200);
	};
	/** 緑スキルの一覧を開き、渡した id の行の様子（出ているか・押せないか・理由）を読む。閉じて返す */
	const passiveRows = async (page, ids) => {
		await page.click(T + '[data-usd-act="editor-pick-passive"]');
		await page.waitForSelector('[data-usd-el="passive-results"] label.usd-row');
		await page.waitForTimeout(400);
		const r = await page.evaluate((ids) => ids.map((id) => {
			const i = document.querySelector('[data-usd-el="passive-results"] input[value="' + id + '"]');
			return { id, shown: !!i, disabled: i ? i.disabled : null, reason: i ? ((i.closest('label').querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || '') : null };
		}), ids);
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(200);
		return r;
	};
	// 組（目覚め・対応するスキル）。①でどちらかを最初から持つ育成ウマ娘をデータから探す
	const PAIR = REC.equivalentPairs.find((p) => UMAS_DOC.entries.some((u) => (u.awakeningSkills || []).some((a) => a.level === 0 && (a.skills || []).some((s) => s.skillId === p.skillIds[1]))));
	const UMA_WITH = PAIR ? UMAS_DOC.entries.find((u) => (u.awakeningSkills || []).some((a) => a.level === 0 && (a.skills || []).some((s) => s.skillId === PAIR.skillIds[1]))) : null;
	const pickRace = async (page, id) => {
		await page.click('#deck-set-bar [data-usd-act="set-race"]');
		await page.waitForSelector('[data-usd-el="race-list"]');
		await page.click('[data-usd-el="race-opt"][data-race-id="' + id + '"] input');
		await page.waitForTimeout(600);
	};
	const openOutside = async (page) => {
		await page.click(T + '[data-usd-el="outside-open"]');
		await page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 20000 });
	};
	const draftIds = (page) => page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
	const footText = (kinds, added, gold) => {
		const parts = [];
		if (added > 0) parts.push('追加済み ' + added + '種');
		if (gold > 0) parts.push('金スキル ' + gold + '種');
		return '得られるスキル ' + kinds + '種' + (parts.length ? '（' + parts.join(', ') + '）' : '');
	};

	/* ====================================================================
	 * A: 追加済みのスキルを数える・下段の表示
	 * ==================================================================== */
	await block('C131A レースで②に入ったスキル（既定の除外に当たる緑スキル）も、そのカードの「＋N種」と小窓の「対象」に入る／一覧では「追加済み」で選べず、「追加」でも入らない', async () => {
		const sp = await openSp();
		await pickRace(sp.page, RACE.id);
		const added = await draftIds(sp.page);
		await openOutside(sp.page);
		const r = await sp.page.evaluate(async (added) => {
			await UmaSkillDeckCore.loadSkillEffectLevels();
			const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
			const res = UmaSkillDeckCore.outside.solveSync({ roster, addedSkillIds: added, deadlineMs: 20000 });
			const ex = UmaSkillDeckCore.outside.populationOf(roster).optionExcludedIds;
			const card = res.cards.find((c) => c.skillIds.some((id) => added.includes(id)));
			const tiles = Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]')).map((t) => ({ id: t.getAttribute('data-card-id'), gain: (t.querySelector('[data-usd-el="outside-card-gain"]') || {}).textContent }));
			return { card: card ? { id: card.cardId, kindGain: card.kindGain, hit: card.skillIds.filter((id) => added.includes(id)) } : null, tiles,
				hitExcludedByDefault: card ? card.skillIds.filter((id) => added.includes(id) && ex.includes(id)) : [],
				rows: Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]')).filter((x) => added.includes(x.getAttribute('data-skill-id')))
					.map((x) => ({ id: x.getAttribute('data-skill-id'), mark: (x.querySelector('[data-usd-el="outside-added-mark"]') || {}).textContent || null, dis: x.querySelector('input').disabled })) };
		}, added);
		assert(!!r.card && r.hitExcludedByDefault.length > 0, 'C131A 材料: 追加済みのスキルを得るカードが結果にあり、そのスキルは既定の除外（緑スキルなど）に当たる（空振りでない）', r.card);
		const tile = r.tiles.find((t) => t.id === r.card.id);
		assert(tile && tile.gain === '＋' + r.card.kindGain + '種', 'C131A そのカードのタイルの「＋N種」は、追加済みのスキルを含めた種数（' + (tile && tile.gain) + '）', { tile, card: r.card });
		assert(r.rows.length > 0 && r.rows.every((x) => x.mark === '追加済み' && x.dis), 'C131A 一覧では追加済みのスキルは「追加済み」で、チェックできない', r.rows);
		// 小窓の「対象」
		await sp.page.click(M + '[data-usd-el="outside-card-main"][data-card-id="' + r.card.id + '"]');
		await sp.page.waitForTimeout(400);
		const tags = await sp.page.evaluate((hit) => {
			const rows = Array.from(document.querySelectorAll('[data-usd-el="events-pane-skills"] [data-skill-id]'));
			return hit.map((id) => { const row = rows.find((x) => x.getAttribute('data-skill-id') === id); return { id, found: !!row, tag: row ? /対象/.test(row.textContent) : false }; });
		}, r.card.hit);
		assert(tags.length > 0 && tags.every((x) => x.found && x.tag), 'C131A カード名を押した小窓（取得できるスキル）で、追加済みのスキルに「対象」の札が付く', tags);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		// 「追加」を押しても、追加済みは二重に入らない
		if (await sp.page.isVisible(M + '[data-usd-el="outside-add"]')) {
			await sp.page.click(M + '[data-usd-el="outside-add"]');
			await sp.page.waitForTimeout(400);
			const ids = await draftIds(sp.page);
			assert(ids.slice(0, added.length).join() === added.join() && new Set(ids).size === ids.length, 'C131A 「追加」を押しても、追加済みは入り直さない（重なりなし）', { n: ids.length });
		}
		assert(jsErrors(sp.errors).length === 0, 'C131A コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C131A 下段は「得られるスキル XX種（追加済み YY種, 金スキル Z種）」と「N,NNN Pt」の1行（「選択」の行は無い）／チェックの付け外しで XX・Pt が変わる／375・320px で崩れず行は増えない', async () => {
		for (const size of [{ w: 375, h: 812 }, { w: 320, h: 568 }]) {
			const sp = await openSp({ w: size.w, h: size.h });
			await pickRace(sp.page, RACE.id);
			const added = await draftIds(sp.page);
			await openOutside(sp.page);
			const exp = await sp.page.evaluate(async (added) => {
				const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
				const res = UmaSkillDeckCore.outside.solveSync({ roster, addedSkillIds: added, deadlineMs: 20000 });
				const normal = res.skills.filter((s) => !s.added).map((s) => s.skillId);
				return { counts: res.counts, pt: UmaSkillDeckCore.outside.ptOf(normal).total, normal };
			}, added);
			const read = () => sp.page.evaluate(() => {
				const foot = document.querySelector('[data-usd-el="outside-foot"]');
				const k = foot.querySelector('[data-usd-el="outside-total"]'), p = foot.querySelector('[data-usd-el="outside-total-pt"]');
				const line = k.parentElement;
				const lh = parseFloat(getComputedStyle(line).lineHeight);
				return { kinds: k.textContent, pt: p.textContent, cut: k.scrollWidth > k.clientWidth + 1, sameLine: Math.abs(k.getBoundingClientRect().top - p.getBoundingClientRect().top) <= 2,
					oneLine: line.getBoundingClientRect().height <= lh + 1, selected: !!foot.querySelector('[data-usd-el="outside-selected"]'), hasSelWord: /選択/.test(foot.textContent),
					rows: Array.from(foot.children).filter((c) => !c.hidden && c.getBoundingClientRect().height > 0).length, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
			});
			const a = await read();
			const tag = 'C131A ' + size.w + 'px: ';
			assert(exp.counts.added > 0 && a.kinds === footText(exp.counts.kinds, exp.counts.added, exp.counts.gold) && a.pt === exp.pt.toLocaleString('en-US') + ' Pt',
				tag + '全部チェックのとき「' + a.kinds + '」「' + a.pt + '」（XX は追加済みを含む・Pt は追加済みを含めない）', { a, counts: exp.counts, pt: exp.pt });
			assert(!a.selected && !a.hasSelWord && a.sameLine && a.oneLine && !a.cut && a.rows === 2 && a.sw <= a.iw, tag + '「選択」の行は無く、1行目は折り返さず切れない。下段は2行のまま（1行目＋ボタンの行）', a);
			// 1つ外すと XX と Pt が変わる。追加済みの数（YY）は変わらない
			const target = exp.normal.find((id) => true);
			await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + target + '"] input');
			const b = await read();
			const kn = (s) => Number(/^得られるスキル (\d+)種/.exec(s)[1]);
			assert(kn(b.kinds) <= kn(a.kinds) && kn(b.kinds) >= kn(a.kinds) - 1 && b.pt !== a.pt && b.kinds.includes('追加済み ' + exp.counts.added + '種'), tag + '1つ外すと XX と Pt が数え直される（追加済みの数は同じ）', { a: a.kinds, b: b.kinds, pa: a.pt, pb: b.pt });
			// 全部外すと、XX は追加済みのぶん（と、その前段を持つ金スキル）だけ・Pt は 0
			for (const id of exp.normal.slice(1)) await sp.page.click(M + '[data-usd-el="outside-row"][data-skill-id="' + id + '"] input');
			const z = await read();
			const addDis = await sp.page.evaluate(() => document.querySelector('[data-usd-el="outside-add"]').disabled);
			assert(z.pt === '0 Pt' && kn(z.kinds) >= 1 && kn(z.kinds) <= exp.counts.added && z.kinds.includes('（追加済み ' + exp.counts.added + '種') && addDis, tag + '全部外すと XX は追加済みのぶんだけ・「0 Pt」・［追加］は押せない', { z, addDis });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * C: ①の「低効果を除外」を削除
	 * ==================================================================== */
	await block('C131C ①の列見出しに「低効果を除外」のボタンは無く、列見出しの高さは 375・320px で 49px のまま／オススメサポの除外の既定（低効果を含む5つ）は今までどおり効く', async () => {
		for (const size of [{ w: 375, h: 812 }, { w: 320, h: 568 }]) {
			const sp = await openSp({ w: size.w, h: size.h, tab: 0, roster: { umaId: 'uma-0001', cardIds: CARDS6 } });
			const m = await sp.page.evaluate(() => {
				const cell = document.querySelector('#deck-roster-panel .usd-roster-gh--skill');
				return { h: Math.round(cell.getBoundingClientRect().height), btn: !!document.querySelector('#deck-roster-panel [data-usd-el="roster-low-effect-btn"]'),
					word: /低効果/.test(document.querySelector('#deck-roster-panel').textContent), title: (cell.querySelector('.usd-roster-ghtitle') || {}).textContent };
			});
			assert(!m.btn && !m.word && m.title === 'スキル名' && m.h === 49, 'C131C ' + size.w + 'px: ①の列見出しに「低効果を除外」は無く（①に「低効果」の語も無い）、高さは 49px', m);
			await sp.ctx.close();
		}
		const sp = await openSp();
		await openOutside(sp.page);
		const r = await sp.page.evaluate(() => {
			const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
			const p = UmaSkillDeckCore.outside.populationOf(roster);
			return { def: UmaSkillDeckCore.outside.EXCLUDE_DEFAULT, label: document.querySelector('[data-usd-el="outside-exclude-label"]').textContent,
				lowOut: p.optionExcludedIds.filter((id) => UmaSkillDeckCore.isLowEffectSkill(id)).length, lowIn: p.ids.filter((id) => UmaSkillDeckCore.isLowEffectSkill(id)).length };
		});
		assert(JSON.stringify(r.def) === JSON.stringify({ effect: ['debuff', 'stamina', 'vision'], extra: ['passive', 'lowEffect'] }) && ['持久力回復', 'デバフ', '視野', '緑スキル', '低効果'].every((t) => r.label.includes(t)) && r.lowOut > 0 && r.lowIn === 0,
			'C131C オススメサポの除外の既定は5つ（低効果を含む）で、低効果のスキルは母集団から外れる', r);
		await sp.page.click(M + '[data-usd-el="outside-exclude-btn"]');
		await sp.page.waitForSelector('[data-usd-el="outside-exclude-chip"]');
		const chip = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-exclude-chip"][data-value="lowEffect"]'); return b ? { text: b.textContent, on: b.getAttribute('aria-pressed') } : null; });
		assert(chip && chip.text === '低効果' && chip.on === 'true', 'C131C 除外の小窓に「低効果」のチップがあり、既定で入っている', chip);
		assert(jsErrors(sp.errors).length === 0, 'C131C コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * B: 目覚めを、対応するスキルと同じものとして扱う（組は recommended-skills.json の equivalentPairs）
	 * ==================================================================== */
	await block('C131B ①で対応するスキルを得るセットでは、目覚めも「本育成で得る」になる: 緑スキルの一覧でグレーアウト（条件で検索には緑スキルは出ない）・レース選択の自動追加で入らない', async () => {
		assert(!!PAIR && !!UMA_WITH, 'C131B 材料: 組の対応するスキルを最初から持つ育成ウマ娘がいる', { pair: PAIR, uma: UMA_WITH && UMA_WITH.id });
		if (!PAIR || !UMA_WITH) return;
		const [awk, base1] = PAIR.skillIds;
		const sp = await openSp({ roster: { umaId: UMA_WITH.id, cardIds: CARDS6 } });
		assert(sp.recReqs.length === 0, 'C131B ページの読み込みでは recommended-skills.json を取りに行かない', sp.recReqs);
		// (1) 緑スキルの一覧（開いたときに組のデータを読み、組み直す）
		const rows = await passiveRows(sp.page, [awk, base1]);
		assert(rows.every((x) => x.shown && x.disabled && x.reason === '本育成で得るため選べません'), 'C131B (1) 緑スキルの一覧で、目覚めも対応するスキルと同じく「本育成で得るため選べません」のグレーアウト', rows);
		assert((await hiddenIds(sp.page)).includes(awk), 'C131B (1) 選べなくするスキル（条件で検索・テキストで検索・スクショで追加が使う）に目覚めが入る', true);
		await sp.page.click(T + '[data-usd-act="editor-pick"]');
		await sp.page.waitForSelector('[data-usd-el="results"] label.usd-row');
		const inFilter = await sp.page.evaluate((ids) => ids.filter((id) => !!document.querySelector('[data-usd-el="results"] input[value="' + id + '"]:not([disabled])')), [awk, base1]);
		assert(inFilter.length === 0, 'C131B (1) 条件で検索で、目覚め・対応するスキルは選べない（どちらも緑スキルなので、もともとこの一覧には出ない）', inFilter);
		await sp.page.click('[data-usd-act="picker-close"]');
		// テキストで検索: 目覚めの名前を貼っても「本育成編成のため追加しなかったもの」
		await sp.page.click(T + '[data-usd-act="editor-pick-text"]');
		await sp.page.fill('[data-usd-el="paste-input"]', nameOf(awk));
		await sp.page.click('[data-usd-act="paste-run"]');
		await sp.page.waitForTimeout(300);
		const pb = await sp.page.evaluate(() => (document.querySelector('[data-usd-el="paste-blocked"]') || {}).textContent || null);
		assert(pb === '本育成編成のため追加しなかったもの 1種', 'C131B (1) テキストで検索で、目覚めは「本育成編成のため追加しなかったもの 1種」', pb);
		await sp.page.click('[data-usd-act="picker-close"]');
		// (2) レース選択の自動追加: 組の回り・季節のレースを選んでも、目覚めも対応するスキルも入らない
		const env = (MASTER.find((s) => String(s.id) === awk).tags.environment || []);
		const race = RACES.find((r) => env.includes(r.direction) || env.includes(r.season));
		await pickRace(sp.page, race.id);
		const ids = await draftIds(sp.page);
		assert(ids.length > 0 && !ids.includes(awk) && !ids.includes(base1), 'C131B (2) レース（' + race.id + '）を選んでも、目覚め・対応するスキルは②に入らない（ほかは入る）', ids);
		assert(jsErrors(sp.errors).length === 0, 'C131B コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 組のデータが読めないときは今までどおり（目覚めは選べる）。知らせも出さない
		const sp2 = await openSp({ roster: { umaId: UMA_WITH.id, cardIds: CARDS6 }, rec: 'fail' });
		const rows2 = await passiveRows(sp2.page, [awk, base1]);
		const t2 = await toastText(sp2.page);
		assert(rows2.find((x) => x.id === awk).shown && !rows2.find((x) => x.id === awk).disabled && rows2.find((x) => x.id === base1).disabled && !/読み込めません/.test(t2), 'C131B 組のデータが読めないときは今までの動き（目覚めは選べる・対応するスキルは選べない）で、知らせも出ない', { rows2, t2 });
		await sp2.ctx.close();
	});

	await block('C131B 逆も同じ（①で目覚めを得ると対応するスキルが外れる）／脚質のボタンでも入らない（グループに目覚めを入れた差し替えのデータ）', async () => {
		if (!PAIR || !UMA_WITH) { assert(false, 'C131B 材料が無い', null); return; }
		const [awk, base1] = PAIR.skillIds;
		// 逆: 育成ウマ娘の最初から持つスキルを、対応するスキルから目覚めに差し替えたデータ（検査の中だけ）
		const umas = JSON.parse(JSON.stringify(UMAS_DOC));
		const u = umas.entries.find((x) => x.id === UMA_WITH.id);
		u.awakeningSkills.forEach((a) => { if (a.level === 0) a.skills = a.skills.map((s) => (s.skillId === base1 ? { skillId: awk, name: nameOf(awk) } : s)); });
		// 脚質のボタンのグループに、目覚めと対応するスキルを足したデータ（検査の中だけ）
		const rec = JSON.parse(JSON.stringify(REC));
		const g = rec.groups.find((x) => x.key === 'runnerNotEscape');
		g.skills = g.skills.concat([{ skillId: base1, name: nameOf(base1) }, { skillId: awk, name: nameOf(awk) }]);
		const sp = await openSp({ roster: { umaId: UMA_WITH.id, cardIds: CARDS6, skillFilter: { style: 'senko' } }, umas, rec });
		const rows = await passiveRows(sp.page, [awk, base1]);
		assert(rows.every((x) => x.shown && x.disabled && x.reason === '本育成で得るため選べません'), 'C131B 逆: ①で目覚めを得ると、対応するスキルもグレーアウト', rows);
		await sp.page.waitForSelector(T + '[data-usd-el="recommend-btn"]');
		await sp.page.click(T + '[data-usd-el="recommend-btn"]');
		await sp.page.waitForTimeout(300);
		const ids = await draftIds(sp.page);
		const t = await toastText(sp.page);
		assert(ids.length > 0 && !ids.includes(awk) && !ids.includes(base1) && /本育成編成のため \d+種/.test(t), 'C131B (3) 脚質のボタンでも、目覚め・対応するスキルは入らない（本育成編成のため）', { ids, t });
		assert(jsErrors(sp.errors).length === 0, 'C131B 逆 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C131B オススメサポ: ②に目覚めが入っているとき、カードが対応するスキルを持てば「追加済み」として数える（除外の設定に関わらず）／組を読めないときは数えない', async () => {
		if (!PAIR) { assert(false, 'C131B 材料が無い', null); return; }
		const [awk, base1] = PAIR.skillIds;
		const sp = await openSp();
		// 組の回り・季節のレースを選ぶ（目覚めと対応するスキルが②に入る）→ 対応するスキルだけを手で外す（②には目覚めだけが残る）
		const envB = (MASTER.find((s) => String(s.id) === awk).tags.environment || []);
		const raceB = RACES.find((r) => envB.includes(r.direction) || envB.includes(r.season));
		await pickRace(sp.page, raceB.id);
		if ((await draftIds(sp.page)).includes(base1)) { await sp.page.click(T + '[data-usd-act="template-skill-remove"][data-skill-id="' + base1 + '"]'); await sp.page.waitForTimeout(200); }
		if (!(await draftIds(sp.page)).includes(awk)) await addByText(sp.page, [nameOf(awk)]);
		const ids0 = await draftIds(sp.page);
		assert(ids0.includes(awk) && !ids0.includes(base1), 'C131B 材料: ②に目覚めがあり、対応するスキルは無い', ids0);
		await openOutside(sp.page);
		const r = await sp.page.evaluate(({ awk, base1 }) => {
			const roster = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
			const C = UmaSkillDeckCore.outside;
			const p1 = C.populationOf(roster, { addedSkillIds: [awk] });
			const p0 = C.populationOf(roster, { addedSkillIds: [] });
			const res = C.solveSync({ roster, addedSkillIds: JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')).skillIds, deadlineMs: 20000 });
			const row = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-row"][data-skill-id="' + base1 + '"]');
			return { in1: p1.ids.includes(base1), in0: p0.ids.includes(base1), entry: res.skills.find((s) => s.skillId === base1) || null, card: res.cards.find((c) => c.skillIds.includes(base1)) || null,
				rowMark: row ? ((row.querySelector('[data-usd-el="outside-added-mark"]') || {}).textContent || null) : 'no-row', foot: document.querySelector('[data-usd-el="outside-total"]').textContent };
		}, { awk, base1 });
		assert(!r.in0 && r.in1, 'C131B ②に目覚めがあると、対応するスキルは既定の除外（緑スキル）に当たっても母集団に入る', r);
		assert(!!r.entry && !!r.card && r.entry.added && r.rowMark === '追加済み' && /追加済み \d+種/.test(r.foot), 'C131B 結果のカード（' + (r.card && r.card.cardId) + '）が対応するスキルを持ち、その行は「追加済み」（一覧で選べない・下段の追加済みに数える）', r);
		if (r.card) {
			const tile = await sp.page.evaluate((cid) => (document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-card"][data-card-id="' + cid + '"] [data-usd-el="outside-card-gain"]') || {}).textContent, r.card.cardId);
			assert(tile === '＋' + r.card.kindGain + '種', 'C131B そのカードの「＋N種」は対応するスキルを含めた種数', { tile, gain: r.card.kindGain });
		}
		await sp.ctx.close();
		const sp2 = await openSp({ rec: 'fail' });
		await addByText(sp2.page, [nameOf(awk)]);
		await openOutside(sp2.page);
		const in2 = await sp2.page.evaluate(({ awk, base1 }) => UmaSkillDeckCore.outside.populationOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')), { addedSkillIds: [awk] }).ids.includes(base1), { awk, base1 });
		assert(!in2, 'C131B 組のデータが読めないときは、目覚めが②にあっても対応するスキルを追加済みとして数えない（今までの動き）', in2);
		await sp2.ctx.close();
	});

	/* ====================================================================
	 * D: 脚質のボタンを押せない状態にしない
	 * ==================================================================== */
	await block('C131D 脚質のボタンは追加できるものが0種でも押せる見た目のまま。押すと何も足さずに「追加できるスキルはありません（内訳）」／内訳も0なら一文だけ', async () => {
		const sp = await openSp({ roster: Object.assign({}, FULL, { skillFilter: { style: 'senko' } }) });
		await sp.page.waitForSelector(T + '[data-usd-el="recommend-btn"]');
		await sp.page.click(T + '[data-usd-el="recommend-btn"]');
		await sp.page.waitForTimeout(300);
		const n1 = (await draftIds(sp.page)).length;
		const look = await sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="recommend-btn"]'); return { dis: b.disabled, color: getComputedStyle(b).color, clear: getComputedStyle(document.querySelector('[data-usd-el="palette-clear"]')).color }; });
		assert(n1 > 0 && !look.dis && look.color === look.clear, 'C131D 全部足したあとも、ボタンは押せる見た目（disabled なし・「解除」と同じ色）', look);
		await sp.page.click(T + '[data-usd-el="recommend-btn"]');
		await sp.page.waitForTimeout(300);
		const t = await toastText(sp.page);
		assert((await draftIds(sp.page)).length === n1 && /^追加できるスキルはありません（追加済み \d+種(・本育成編成のため \d+種)?(・レース条件に合わないため \d+種)?）$/.test(t), 'C131D 押すと何も足さずに、内訳つきで知らせる', t);
		await sp.ctx.close();
		const rec = JSON.parse(JSON.stringify(REC));
		rec.groups.find((x) => x.key === 'runnerNotEscape').skills = [];
		const sp2 = await openSp({ roster: Object.assign({}, FULL, { skillFilter: { style: 'senko' } }), rec });
		await sp2.page.waitForSelector(T + '[data-usd-el="recommend-btn"]');
		await sp2.page.click(T + '[data-usd-el="recommend-btn"]');
		await sp2.page.waitForTimeout(300);
		assert((await toastText(sp2.page)) === '追加できるスキルはありません' && (await draftIds(sp2.page)).length === 0, 'C131D 内訳も0なら「追加できるスキルはありません」だけ', await toastText(sp2.page));
		assert(jsErrors(sp2.errors).length === 0, 'C131D コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});
}
