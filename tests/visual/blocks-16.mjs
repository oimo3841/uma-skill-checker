// C-130（2026-10-06）の検査。run-smoke.mjs の末尾から register16() で呼ばれる
// （塊の見出しはすべて「C130」で始まる。`npm run test:visual -- --only=C130` で回せる。B・C・D・E だけなら「C130B」「C130C」「C130D」「C130E」）。
//
// A: data/recommended-skills.json（ページの読み込みでは取りに行かない。形は check:catalog の §13）
// B・C: 2026-10-21 に廃止（自動追加・パレットのボタン。blocks-43.mjs の C-184 に置き換え）
// D: オススメサポは、②で追加済みのスキルを、除外の設定に関わらず数える
// E: 「オススメサポαテスト」→「オススメサポ」
// スキル名・グループの文字・レース名は検査の側に書かない（恒久ルール1。データか画面から読む）。
import { pickEntry } from './lib/entry-search.mjs';

export async function register16(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const REC = readJson('data/recommended-skills.json');
	const RACES = readJson('data/upcoming-races.json').races;
	const DIST = readJson('data/race-distances.json');
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const EXT = readJson('data/extended-skills.json').entries;
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e.rarity]));
	const UMAS = readJson('data/training-umamusume.json').entries;
	const COURSE = readJson('data/course-conditions.json');
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6 };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const OM = '[data-usd-el="outside-modal"] ';
	const sleep = (page, ms) => page.waitForTimeout(ms);
	// 区分のキー（race-distances.json から。名前はデータの name）
	const classOf = (race) => race.distanceCategory || ((DIST.distanceCategories.find((c) => (c.minDistance == null || race.distance >= c.minDistance) && (c.maxDistance == null || race.distance <= c.maxDistance)) || {}).key) || null;

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
	const toastText = (page) => page.evaluate(() => document.getElementById('toast-message').textContent);
	const pickRace = async (page, id) => {
		await page.click('#hdr-race-slot [data-usd-act="set-race"]');
		await page.waitForSelector('[data-usd-el="race-list"]');
		await page.click('[data-usd-el="race-opt"][data-race-id="' + id + '"] input');
		await sleep(page, 500);
	};
	const addByText = async (page, names) => {
		await pickEntry(page, 'editor-pick-text');
		await page.fill('[data-usd-el="paste-input"]', names.join('\n'));
		await page.click('[data-usd-act="paste-run"]');
		await sleep(page, 200);
		await page.click('[data-usd-el="picker-commit"]');
		await sleep(page, 200);
		await page.click('[data-usd-act="picker-close"]');
		await sleep(page, 200);
	};
	const nameOf = (id) => { const s = MASTER.find((x) => String(x.id) === id) || EXT.find((x) => x.id === id); return s ? s.name : id; };

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

	/* B・C（レースを選んだときの②への自動追加／②のパレットの行の「逃げオススメ」「先差追オススメ」）は、2026-10-21 に廃止した。
	   自動追加は「レースを選んでも②が変わらない」・ボタンは入口の「脚質オススメ」の小窓になり、検査は blocks-43.mjs の C-184 に置き換えた。 */

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
			// C-185: 既定の除外は 低効果・デバフ・視野・持久力回復（緑スキルは外さない）。低効果と効果タイプで外れるものを1つずつ選ぶ
				const picks = [pickBy((id) => UmaSkillDeckCore.isLowEffectSkill(id)), pickBy((id) => !UmaSkillDeckCore.isLowEffectSkill(id))].filter(Boolean);
			const p1 = C.populationOf(roster, { addedSkillIds: picks });
			// 計算（outsideSolve の口）: 追加済みの印が付き、得られれば数える
			const s0 = C.solveSync({ roster, addedSkillIds: [], deadlineMs: 20000 });
			const s1 = C.solveSync({ roster, addedSkillIds: picks, deadlineMs: 20000 });
			return { picks, inP0: picks.filter((id) => p0.ids.includes(id)), inP1: picks.filter((id) => p1.ids.includes(id)), n0: p0.ids.length, n1: p1.ids.length,
				pop0: s0.stats.population, pop1: s1.stats.population, added1: s1.skills.filter((x) => x.added).map((x) => x.skillId) };
		}, paired);
		assert(r.picks.length >= 2, 'C130D 材料: 既定の除外で外れるスキル（低効果・効果タイプ）を1つずつ選べた（空振りでない）', r.picks);
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
