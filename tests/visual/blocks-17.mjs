// C-131（2026-10-07）の検査。run-smoke.mjs の末尾から register17() で呼ばれる
// （塊の見出しはすべて「C131」で始まる。`npm run test:visual -- --only=C131` で回せる。A・C だけなら「C131A」「C131C」）。
//
// A: オススメサポで、②に追加済みのスキルを数える（タイルの「＋N種」・小窓の「対象」・下段の新しい表示）
// C: ①の「低効果を除外」ボタンと確認の小窓を削除した（オススメサポの除外の「低効果」は残る）
// B（目覚めと対応するスキルの同一扱い）は、組のつけ方に使う独自カテゴリが公開データに無いので実装していない（C-131 の記録）。
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

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		await sp.page.evaluate(({ roster, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster || FULL, tab: o.tab === undefined ? 1 : o.tab });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(400);
		return sp;
	};
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
}
