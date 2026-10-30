// 「条件で検索」の小窓の小さな追加4点（C-222・2026-10-28）の検査。run-smoke.mjs の末尾から register58() で呼ばれる
// （塊の見出しはすべて「検索小窓」で始まる。`npm run test:visual -- --only=検索小窓` で回せる）。
//
// 決め（おいもさん）:
//  1. 「その他」の軸に「サポカ外」。中身は non-support-skills.json（脚質オススメの「サポカ外」と同じ一覧）から、シナリオスキル（その他の軸の scenario）を除いたもの。
//     脚質・距離・レースにかかわらず全部を出す（選べるかどうかは 3 とレース条件に従う）。タグはツール側で付ける（データに値を足さない）。選び方は「シナリオスキル」と同じ（軸内 OR）。
//  2. スキル名を押すと、①の表などと同じ説明の小窓が開く。チェックはチェックボックスを押したときだけ。灰色の行でも名前で小窓が開く。
//  3. ①の絞り込み（距離・脚質・バ場）に合わないスキルは、灰色・チェック不可・理由「距離／脚質／バ場が合わないため選べない」。判定は①と同じ matchesFilters。
//     先頭の件数に「①の絞り込み N件」を足す。理由が重なる行は1つだけ（本育成編成 → レース条件 → ①の絞り込み〔距離 → 脚質 → バ場〕）。
//  4. スキル名の文字に、①の表と同じ色（回復・デバフ・パッシブ）。灰色の行は灰色のまま。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。
import { reloadReady } from './lib/page-ready.mjs';
import { pickEntry } from './lib/entry-search.mjs';

export async function register58(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const EXT = readJson('data/extended-skills.json').entries;
	const SEARCHABLE = new Set(readJson('data/searchable-extended-ids.json').entries.map((e) => e.skillId));
	const NONSUP = readJson('data/non-support-skills.json');
	const TAGS = new Map();
	MASTER.forEach((s) => TAGS.set(s.id, s.tags));
	EXT.forEach((s) => { if (!TAGS.has(s.id)) TAGS.set(s.id, s.tags || {}); });
	const isScenario = (id) => ((TAGS.get(id) || {}).scenario || []).includes('scenario');
	const inPool = (id) => MASTER.some((s) => s.id === id) || (SEARCHABLE.has(id) && EXT.some((e) => e.id === id && !e.tagsPending));
	// 期待値（データから独立に）: サポカ外の一覧のうち、シナリオスキルでなく、検索の母集団にあるもの
	const WANT_NS = NONSUP.entries.map((e) => e.skillId).filter((id) => !isScenario(id) && inPool(id));
	const SCENARIO_POOL = Array.from(TAGS.keys()).filter((id) => isScenario(id) && inPool(id) && !((TAGS.get(id) || {}).passive || []).length);
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FILTER = { distance: 'long', style: 'nige', surface: 'dirt' };
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		if (o.nonSupport) await sp.page.route('**/data/non-support-skills.json*', (r) => r.fulfill(json(o.nonSupport)));
		await sp.page.evaluate(({ roster, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster === undefined ? null : o.roster, tab: o.tab === undefined ? 1 : o.tab });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const openFilter = async (page) => {
		await pickEntry(page, 'editor-pick');
		await page.waitForSelector('[data-usd-el="results"] label.usd-row');
		await page.waitForTimeout(300);
	};
	const filterBy = async (page, axis, value, on = true) => {
		await page.evaluate(({ axis, value, on }) => { const c = document.querySelector('[data-usd-el="filter-check"][data-axis="' + axis + '"][data-value="' + value + '"]'); if (c && c.checked !== on) c.click(); }, { axis, value, on });
		await page.waitForTimeout(300);
	};
	/** 一覧の行（id・灰色か・理由・チェックの可否・名前のボタンの色のクラス） */
	const readRows = (page) => page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('[data-usd-el="results"] label.usd-row'));
		const toneOf = (b) => !b ? null : b.classList.contains('usd-roster-skillname--heal') ? 'heal' : b.classList.contains('usd-roster-skillname--debuff') ? 'debuff' : b.classList.contains('usd-roster-skillname--passive') ? 'passive' : '';
		return {
			rows: rows.map((r) => {
				const i = r.querySelector('input');
				const b = r.querySelector('button[data-usd-info]');
				return { id: i.value, gray: r.classList.contains('usd-row--excluded'), disabled: i.disabled, reason: (r.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || '',
					btn: !!b && b.getAttribute('data-usd-info') === i.value, tone: toneOf(b), color: b ? getComputedStyle(b).color : null };
			}),
			count: document.querySelector('[data-usd-el="result-count"]').textContent,
			label: (() => { const e = document.querySelector('[data-usd-el="result-excluded"]'); return e.hidden ? '' : e.textContent; })(),
			labelFits: (() => { const e = document.querySelector('[data-usd-el="result-excluded"]'); return e.hidden || e.getBoundingClientRect().right <= e.parentElement.getBoundingClientRect().right + 0.5; })()
		};
	});
	const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

	await block('検索小窓(1) 「その他」の軸の「サポカ外」: non-support-skills.json からシナリオスキルを除いたものだけが出る（パッシブも出る）／「シナリオスキル」と OR／シナリオスキルを一覧に混ぜると外れる（破壊確認）', async () => {
		assert(WANT_NS.length > 0, '検索小窓(1) 前提: 期待値が空振りでない（' + WANT_NS.length + '件）');
		const sp = await openSp({ roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null] } });
		await openFilter(sp.page);
		const opt = await sp.page.evaluate(() => { const c = document.querySelector('[data-usd-el="filter-check"][data-axis="scenario"][data-value="non_support"]'); return c ? (c.closest('label') || c.parentElement).textContent.trim() : null; });
		assert(opt === 'サポカ外', '検索小窓(1) その他の軸に「サポカ外」の選択肢がある', { opt });
		await filterBy(sp.page, 'scenario', 'non_support');
		const a = await readRows(sp.page);
		const got = a.rows.map((r) => r.id);
		const miss = WANT_NS.filter((id) => !got.includes(id)), extra = got.filter((id) => !WANT_NS.includes(id));
		assert(miss.length === 0 && extra.length === 0 && got.length === WANT_NS.length, '検索小窓(1) サポカ外: 一覧（灰色の行を含む）が期待値と一致（' + got.length + '件）', { miss, extra });
		const passives = got.filter((id) => ((TAGS.get(id) || {}).passive || []).length > 0);
		assert(passives.length > 0, '検索小窓(1) サポカ外: パッシブ（緑スキル）も出る（' + passives.length + '件）', passives);
		assert(a.count === a.rows.filter((r) => !r.gray).length + '件', '検索小窓(1) 「N件」は追加できる行の数', { count: a.count });
		// OR: シナリオスキルも選ぶと、両方の和
		await filterBy(sp.page, 'scenario', 'scenario');
		const b = await readRows(sp.page);
		const wantOr = new Set(WANT_NS.concat(SCENARIO_POOL));
		const gotOr = b.rows.map((r) => r.id);
		assert(gotOr.length === wantOr.size && gotOr.every((id) => wantOr.has(id)), '検索小窓(1) シナリオスキルと一緒に選ぶと、両方の和（軸内 OR。' + gotOr.length + '件）', { got: gotOr.length, want: wantOr.size });
		// 外すと今までどおり（シナリオスキルだけ）
		await filterBy(sp.page, 'scenario', 'non_support', false);
		const c = await readRows(sp.page);
		assert(c.rows.length === SCENARIO_POOL.length && c.rows.every((r) => SCENARIO_POOL.includes(r.id)), '検索小窓(1) サポカ外を外すと、シナリオスキルだけ（今までどおり）', { n: c.rows.length });
		// 他の軸と AND: 効果タイプ（持久力回復）を足すと、サポカ外のうちその効果を持つものだけ
		await filterBy(sp.page, 'scenario', 'scenario', false);
		await filterBy(sp.page, 'scenario', 'non_support');
		await filterBy(sp.page, 'effect', 'stamina');
		const d = await readRows(sp.page);
		const wantAnd = WANT_NS.filter((id) => ((TAGS.get(id) || {}).effect || []).includes('stamina'));
		assert(d.rows.length === wantAnd.length && d.rows.every((r) => wantAnd.includes(r.id)), '検索小窓(1) 効果タイプ（持久力回復）と AND（' + wantAnd.length + '件）', { got: d.rows.map((r) => r.id), want: wantAnd });
		assert(jsErrors(sp.errors).length === 0, '検索小窓(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		// 保存データに書かない（絞り込みはページの中だけ）
		const saved = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData') || '');
		assert(!/non_support/.test(saved), '検索小窓(1) 保存データに「サポカ外」の値が入らない');
		await sp.ctx.close();
		// 破壊確認: 一覧にシナリオスキルを1件混ぜても、出ない（混ぜなければ出ない＝外しているのはシナリオスキルの判定）
		const sc = SCENARIO_POOL[0];
		const broken = JSON.parse(JSON.stringify(NONSUP));
		broken.entries.push({ skillId: sc, name: 'x' });
		const sp2 = await openSp({ roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null] }, nonSupport: broken });
		await openFilter(sp2.page);
		await filterBy(sp2.page, 'scenario', 'non_support');
		const e = await readRows(sp2.page);
		assert(e.rows.length === WANT_NS.length && !e.rows.some((r) => r.id === sc), '検索小窓(1) 破壊確認: 一覧にシナリオスキルを混ぜても出ない（件数は同じ）', { n: e.rows.length, has: e.rows.some((r) => r.id === sc) });
		await sp2.ctx.close();
	});

	await block('検索小窓(2) スキル名を押すと説明の小窓が開き、チェックは変わらない／チェックボックスではチェックだけ変わる／灰色の行でも名前で開く', async () => {
		const sp = await openSp({ roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null], skillFilter: FILTER } });
		await openFilter(sp.page);
		const a = await readRows(sp.page);
		assert(a.rows.length > 0 && a.rows.every((r) => r.btn), '検索小窓(2) すべての行のスキル名が、その行のスキルの説明のボタン', { n: a.rows.length });
		const open = a.rows.find((r) => !r.gray), gray = a.rows.find((r) => r.gray);
		assert(!!open && !!gray, '検索小窓(2) 前提: 選べる行と灰色の行がある');
		const state = (id) => sp.page.evaluate((id) => {
			const pop = document.querySelector('[data-usd-el="info-pop"]');
			const i = document.querySelector('[data-usd-el="results"] input[value="' + id + '"]');
			return { pop: !!pop && !pop.hidden, title: pop && !pop.hidden ? pop.textContent : '', checked: i.checked, count: document.querySelector('[data-usd-el="picker-checked-count"]').textContent };
		}, id);
		const nameOf = (id) => sp.page.evaluate((id) => UmaSkillDeckCore.getSkillName(id), id);
		await sp.page.click('[data-usd-el="results"] button[data-usd-info="' + open.id + '"]');
		await sp.page.waitForTimeout(300);
		const s1 = await state(open.id);
		const n1 = await nameOf(open.id);
		assert(s1.pop && s1.title.indexOf(n1) !== -1 && !s1.checked && s1.count === '0種選択', '検索小窓(2) 名前を押すと、そのスキルの説明の小窓が開き、チェックは入らない', s1);
		// 説明の小窓が「条件で検索」の小窓の上に見えている（重なりの一番上がその小窓）
		const onTop = await sp.page.evaluate(() => { const p = document.querySelector('[data-usd-el="info-pop"]'); const r = p.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2)); return !!el && p.contains(el); });
		assert(onTop, '検索小窓(2) 説明の小窓が、条件で検索の小窓の上に見えている');
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		const pickerOpen = await sp.page.evaluate(() => { const r = document.querySelector('[data-usd-el="results"]'); return !!r && r.getBoundingClientRect().height > 0; });
		assert(pickerOpen, '検索小窓(2) 説明の小窓を閉じても、条件で検索の小窓は開いたまま');
		await sp.page.click('[data-usd-el="results"] input[value="' + open.id + '"]');
		await sp.page.waitForTimeout(200);
		const s2 = await state(open.id);
		assert(!s2.pop && s2.checked && s2.count === '1種選択', '検索小窓(2) チェックボックスを押すと、チェックだけが入る（小窓は開かない）', s2);
		// チェックが入った行の名前を押しても、チェックは外れない
		await sp.page.click('[data-usd-el="results"] button[data-usd-info="' + open.id + '"]');
		await sp.page.waitForTimeout(300);
		const s3 = await state(open.id);
		assert(s3.pop && s3.checked && s3.count === '1種選択', '検索小窓(2) チェックの入った行の名前を押しても、チェックは外れない', s3);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		await sp.page.click('[data-usd-el="results"] button[data-usd-info="' + gray.id + '"]');
		await sp.page.waitForTimeout(300);
		const s4 = await state(gray.id);
		const n4 = await nameOf(gray.id);
		assert(s4.pop && s4.title.indexOf(n4) !== -1 && !s4.checked, '検索小窓(2) 灰色の行でも、名前を押すと説明の小窓が開く（チェックは入らない）', s4);
		assert(jsErrors(sp.errors).length === 0, '検索小窓(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('検索小窓(3) ①の絞り込み（距離・脚質・バ場）に合わないスキルは、灰色・チェック不可・理由つき／判定は①と同じ／件数「①の絞り込み N件」／絞り込みが無ければ今までどおり', async () => {
		const roster = { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null], skillFilter: FILTER };
		const sp = await openSp({ roster });
		await openFilter(sp.page);
		const a = await readRows(sp.page);
		// 期待値: ①の判定（matchesFilters に①と同じ材料）を軸ごとに当て、最初に合わない軸（距離 → 脚質 → バ場）
		const want = await sp.page.evaluate(({ ids, f }) => {
			const C = UmaSkillDeckCore;
			const label = { distance: '距離', style: '脚質', surface: 'バ場' };
			return ids.map((id) => {
				const s = C.findSkill(id);
				const all = { distance: [f.distance], style: [f.style], surface: [f.surface] };
				if (C.matchesFilters(s, all, null)) return { id, reason: '' };
				const k = ['distance', 'style', 'surface'].find((k) => { const o = {}; o[k] = [f[k]]; return !C.matchesFilters(s, o, null); });
				return { id, reason: label[k] + 'が合わないため選べない' };
			});
		}, { ids: a.rows.map((r) => r.id), f: FILTER });
		const bad = [];
		a.rows.forEach((r, i) => {
			const w = want[i];
			if (w.reason) { if (!(r.gray && r.disabled && r.reason === w.reason)) bad.push(r.id + ' 期待 ' + w.reason + ' 実際 ' + r.reason); }
			else if (r.gray && /が合わないため/.test(r.reason)) bad.push(r.id + ' 合うのに ' + r.reason);
		});
		const blocked = want.filter((w) => w.reason);
		const kinds = Array.from(new Set(blocked.map((w) => w.reason)));
		assert(bad.length === 0, '検索小窓(3) 一覧の全行（' + a.rows.length + '件）: ①の判定で合わない行だけが灰色・チェック不可で、理由は最初に合わない軸', bad.slice(0, 8));
		assert(blocked.length > 0 && kinds.length >= 2, '検索小窓(3) 空振りしていない（合わない行 ' + blocked.length + '件・理由 ' + kinds.length + '種）', kinds);
		// 育成ウマ娘自身のスキル（本育成編成）の分もあるので、①の分は短い形「…・①の絞り込み N件」。N は①の理由の行の数（本育成の理由が先なので、期待値の合わない行より少ないことがある）
		const filtRows = a.rows.filter((r) => /が合わないため/.test(r.reason)).length;
		const mA = /①の絞り込み(?:に合わないため選べない)? (\d+)件/.exec(a.label);
		assert(a.count === a.rows.filter((r) => !r.gray).length + '件' && mA && Number(mA[1]) === filtRows && filtRows > 0 && a.labelFits, '検索小窓(3) 件数: 「N件」は追加できる行・先頭の行に「①の絞り込み N件」（N は①の理由の行の数・1行に収まる）', { count: a.count, label: a.label, filtRows });
		// ①の表の絞り込み（filterPredicateOf）と同じ結果か: 下書きの①の可視の判定と、灰色かどうかが一致
		const same = await sp.page.evaluate(({ ids, roster }) => {
			const C = UmaSkillDeckCore;
			const hidden = C.getPickerHiddenIds();
			ids = ids.filter((id) => !hidden.includes(id));
			const lock = {}; ['distance', 'style', 'surface'].forEach((k) => { if (roster.skillFilter[k]) lock[k] = [roster.skillFilter[k]]; });
			return ids.filter((id) => C.matchesFilters(C.findSkill(id), lock, null)).length;
		}, { ids: a.rows.map((r) => r.id), roster });
		assert(same === a.rows.filter((r) => !r.gray).length, '検索小窓(3) 灰色でない行の数が、①の絞り込みに合う行（本育成で得るものを除く）の数と同じ', { same, open: a.rows.filter((r) => !r.gray).length });
		// 押せてしまっても足さない（保険）
		const g = a.rows.find((r) => r.gray);
		await sp.page.evaluate((id) => { const i = document.querySelector('[data-usd-el="results"] input[value="' + id + '"]'); i.disabled = false; i.click(); }, g.id);
		await sp.page.waitForTimeout(200);
		const cnt = await sp.page.evaluate(() => document.querySelector('[data-usd-el="picker-checked-count"]').textContent);
		assert(cnt === '0種選択', '検索小窓(3) 灰色の行は、押せてしまってもチェックに入らない', cnt);
		// 「表示中を全て選択」は追加できる行だけ
		await sp.page.click('[data-usd-act="picker-select-all"]');
		await sp.page.waitForTimeout(200);
		const cnt2 = await sp.page.evaluate(() => document.querySelector('[data-usd-el="picker-checked-count"]').textContent);
		assert(cnt2 === a.rows.filter((r) => !r.gray).length + '種選択', '検索小窓(3) 表示中を全て選択は、追加できる行だけ', cnt2);
		assert(await noHScroll(sp.page), '検索小窓(3) 横スクロールなし（390px）');
		assert(jsErrors(sp.errors).length === 0, '検索小窓(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 絞り込みが無ければ今までどおり（①の理由の行は無い）
		const sp2 = await openSp({ roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null] } });
		await openFilter(sp2.page);
		const b = await readRows(sp2.page);
		assert(b.rows.length === a.rows.length && !b.rows.some((r) => /が合わないため/.test(r.reason)) && !/①/.test(b.label), '検索小窓(3) ①の絞り込みが無ければ、①の理由の行も件数も出ない（行の数は同じ）', { n: b.rows.length, label: b.label });
		await sp2.ctx.close();
		// バ場だけの絞り込み: 「バ場が合わないため選べない」（距離・脚質の理由の陰に隠れない形で確かめる）
		const sp4 = await openSp({ roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null], skillFilter: { surface: 'turf' } } });
		await openFilter(sp4.page);
		const d4 = await readRows(sp4.page);
		const surf = d4.rows.filter((r) => r.reason === 'バ場が合わないため選べない');
		const wantSurf = d4.rows.filter((r) => ((TAGS.get(r.id) || {}).surface || []).some((v) => v !== 'turf') && !/本育成/.test(r.reason));
		assert(surf.length > 0 && surf.length === wantSurf.length && surf.every((r) => r.disabled), '検索小窓(3) バ場（芝）だけ: ダートのタグを持つ行が「バ場が合わないため選べない」（' + surf.length + '件）', { got: surf.length, want: wantSurf.length });
		await sp4.ctx.close();
		// 本育成編成・レース条件と重なるとき: 理由は1つだけ（本育成 → レース → ①）。件数は短い形で並ぶ
		const RACE = readJson('data/upcoming-races.json').races[0];
		const sp3 = await openSp({ w: 320, h: 568, roster: { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { style: 'nige' }, race: RACE } });
		await openFilter(sp3.page);
		const c = await readRows(sp3.page);
		const reasonsPer = c.rows.filter((r) => r.gray).every((r) => r.reason && !/・/.test(r.reason));
		const hasAll = /本育成/.test(c.label) && /レース条件/.test(c.label) && /①の絞り込み/.test(c.label);
		const order = c.label.indexOf('本育成') < c.label.indexOf('レース条件') && c.label.indexOf('レース条件') < c.label.indexOf('①の絞り込み');
		const filt = c.rows.filter((r) => /が合わないため/.test(r.reason)).length;
		const m = /①の絞り込み (\d+)件/.exec(c.label);
		assert(hasAll && order && /^選べない：/.test(c.label) && m && Number(m[1]) === filt && reasonsPer, '検索小窓(3) 3つ重なるとき: 「選べない：本育成編成 N件・レース条件 N件・①の絞り込み N件」の順・①の数は①の理由の行の数・行の理由は1つ', { label: c.label, filt });
		// ①の理由の行は、本育成の理由・レース条件の理由に当たらないものだけ
		const overlap = await sp3.page.evaluate((ids) => ids.filter((id) => UmaSkillDeckCore.getPickerHiddenIds().includes(id)), c.rows.filter((r) => /が合わないため/.test(r.reason)).map((r) => r.id));
		assert(overlap.length === 0, '検索小窓(3) ①の理由の行に、本育成で得るスキルは無い（本育成の理由が先）', overlap);
		assert(await noHScroll(sp3.page), '検索小窓(3) 横スクロールなし（320px）');
		await sp3.ctx.close();
	});

	await block('検索小窓(4) スキル名の文字の色（回復・デバフ・パッシブ）が、①の表の同じスキルと一致する／灰色の行は灰色', async () => {
		// ①の表の色（カードを入れた編成で、表に出るスキルの名前のクラス）
		const spA = await openSp({ roster: { umaId: 'uma-0001', cardIds: CARDS6 }, tab: 0 });
		await spA.page.evaluate(() => UmaSkillDeckCore.loadTrainingSources(false));
		await spA.page.waitForTimeout(600);
		const table = await spA.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-skillname[data-usd-info]')).map((b) => ({ id: b.getAttribute('data-usd-info'),
			tone: b.classList.contains('usd-roster-skillname--heal') ? 'heal' : b.classList.contains('usd-roster-skillname--debuff') ? 'debuff' : b.classList.contains('usd-roster-skillname--passive') ? 'passive' : '',
			color: getComputedStyle(b).color, off: b.classList.contains('usd-roster-skillname--off') })));
		await spA.ctx.close();
		// 「条件で検索」（①の編成なし＝灰色にならない）。緑スキルも並ぶよう「サポカ外」とシナリオスキルの両方、それと絞り込みなしの全件を見る
		const spB = await openSp({ roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null] } });
		await openFilter(spB.page);
		const all = await readRows(spB.page);
		await filterBy(spB.page, 'scenario', 'non_support');
		const ns = await readRows(spB.page);
		const rows = all.rows.concat(ns.rows.filter((r) => !all.rows.some((x) => x.id === r.id)));
		const byId = new Map(rows.map((r) => [r.id, r]));
		const common = table.filter((t) => !t.off && byId.has(t.id) && !byId.get(t.id).gray);
		const mism = common.filter((t) => byId.get(t.id).tone !== t.tone || byId.get(t.id).color !== t.color);
		assert(common.length > 0 && common.some((t) => t.tone) && mism.length === 0, '検索小窓(4) ①の表と同じスキル（' + common.length + '件・色つき ' + common.filter((t) => t.tone).length + '件）で、色のクラスと文字の色が一致', mism.slice(0, 5));
		// 全行: タグから独立に導いた色の区分と一致（回復＝持久力回復・デバフ＝デバフ／掛かり時間・パッシブ＝パッシブの軸。この順で1つ）
		const toneOf = (id) => { const t = TAGS.get(id) || {}; const e = t.effect || []; return e.includes('stamina') ? 'heal' : (e.includes('debuff') || e.includes('temptation_time')) ? 'debuff' : (t.passive || []).length ? 'passive' : ''; };
		const bad = rows.filter((r) => !r.gray && r.tone !== toneOf(r.id)).map((r) => r.id + ':' + r.tone + '≠' + toneOf(r.id));
		const counts = ['heal', 'debuff', 'passive'].map((k) => rows.filter((r) => !r.gray && r.tone === k).length);
		assert(bad.length === 0 && counts.every((n) => n > 0), '検索小窓(4) 一覧の全行（' + rows.length + '件）で、色の区分がタグから導いたものと一致（回復 ' + counts[0] + '・デバフ ' + counts[1] + '・パッシブ ' + counts[2] + '）', bad.slice(0, 5));
		assert(jsErrors(spB.errors).length === 0, '検索小窓(4) コンソールのエラー0', jsErrors(spB.errors).slice(0, 3));
		await spB.ctx.close();
		// 灰色の行は灰色（色のクラスを付けない）
		const spC = await openSp({ roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null], skillFilter: FILTER } });
		await openFilter(spC.page);
		const c = await readRows(spC.page);
		const grayColored = c.rows.filter((r) => r.gray && r.tone);
		assert(c.rows.some((r) => r.gray) && grayColored.length === 0, '検索小窓(4) 灰色の行には色のクラスを付けない', grayColored.slice(0, 3).map((r) => r.id));
		await spC.ctx.close();
	});
}
