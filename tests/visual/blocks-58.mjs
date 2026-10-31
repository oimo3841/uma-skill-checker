// 「条件で検索」の小窓の小さな追加4点（C-222・2026-10-28）の検査。run-smoke.mjs の末尾から register58() で呼ばれる
// （塊の見出しはすべて「検索小窓」で始まる。`npm run test:visual -- --only=検索小窓` で回せる）。
//
// 決め（おいもさん）:
//  1. 「その他」の軸に「サポカ外」。中身は non-support-skills.json（脚質オススメの「サポカ外」と同じ一覧）から、シナリオスキル（その他の軸の scenario）を除いたもの。
//     脚質・距離・レースにかかわらず全部を出す（選べるかどうかは 3 とレース条件に従う）。タグはツール側で付ける（データに値を足さない）。選び方は「シナリオスキル」と同じ（軸内 OR）。
//  2. スキル名を押すと、①の表などと同じ説明の小窓が開く。チェックはチェックボックスを押したときだけ。灰色の行でも名前で小窓が開く。
//  3. ①の絞り込み（距離・脚質・バ場）に合わないスキルは、灰色・チェック不可・理由「距離／脚質／バ場が合わないため選べない」。判定は①と同じ matchesFilters。
//     先頭の件数に「①の絞り込み N件」を足す。理由が重なる行は1つだけ（本育成編成 → レース条件 → ①の絞り込み〔距離 → 脚質 → バ場〕）。
//     → T27（2026-10-31・おいもさんの決定）で「①の絞り込みに合わないスキルは一覧に出さない・件数の文は消す」に置き換えた（検索小窓(3) を直した）。
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
			// T27 で件数の文（result-excluded）は消した。無ければ空
			label: (() => { const e = document.querySelector('[data-usd-el="result-excluded"]'); return !e || e.hidden ? '' : e.textContent; })(),
			// C-244: 件数の段落は flex の子で、文が折り返さないと段落ごと広がる（親の右端と比べても捕まらない）。小窓の本文の内側の右端と、本文の横スクロールで見る
			labelFits: (() => {
				const e = document.querySelector('[data-usd-el="result-excluded"]');
				const body = document.querySelector('[data-usd-el="picker-body"]');
				const br = body.getBoundingClientRect().right - parseFloat(getComputedStyle(body).paddingRight);
				return body.scrollWidth <= body.clientWidth + 1 && (!e || e.hidden || (e.getBoundingClientRect().right <= br + 0.5 && e.parentElement.getBoundingClientRect().right <= br + 0.5));
			})(),
			// C-244: 件数の文の行数（値が入ると入らない幅では折り返す。2行まで）
			labelLines: (() => { const e = document.querySelector('[data-usd-el="result-excluded"]'); if (!e || e.hidden) return 0; const tops = new Set(Array.from(e.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top))); return tops.size; })()
		};
	});
	/** C-244: ①の絞り込みの値の並び（距離 → 脚質 → バ場。選択肢の表示名は TAG_AXES から。検査の側で組む） */
	const filterValueText = (page, sel) => page.evaluate((sel) => {
		const C = UmaSkillDeckCore;
		return ['distance', 'style', 'surface'].map((k) => { const ax = C.TAG_AXES.find((a) => a.key === k); const o = sel[k] ? C.pickableOptions(ax).find((x) => x.v === sel[k]) : null; return o ? o.t : ''; }).filter(Boolean).join('・');
	}, sel);
	const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

	// T27（2026-10-31・おいもさんの決定）で、C-222 の「①の絞り込みに合わないスキルは灰色・チェック不可・理由つきで残す」を「一覧に出さない」に置き換えた。
	// 件数の文（「①の絞り込み（…）N件」など）も消した。判定は①と同じ（matchesFilters に①と同じ材料）のまま。
	await block('検索小窓(3) ①の絞り込み（距離・脚質・バ場）に合わないスキルは一覧に出さない（T27）／判定は①と同じ／件数の文は無く「N件」は追加できる行の数／絞り込みが無ければ今までどおり', async () => {
		const roster = { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null], skillFilter: FILTER };
		/** ①の判定（matchesFilters に①と同じ材料）で合わないか */
		const misfit = (page, ids, f) => page.evaluate(({ ids, f }) => {
			const C = UmaSkillDeckCore;
			const sel = {}; ['distance', 'style', 'surface'].forEach((k) => { if (f[k]) sel[k] = [f[k]]; });
			const hidden = C.getPickerHiddenIds();
			return ids.filter((id) => !hidden.includes(id) && !C.matchesFilters(C.findSkill(id), sel, null));
		}, { ids, f });
		const sp = await openSp({ roster });
		await openFilter(sp.page);
		const a = await readRows(sp.page);
		const shownMisfit = await misfit(sp.page, a.rows.map((r) => r.id), FILTER);
		assert(shownMisfit.length === 0, '検索小窓(3) 一覧（' + a.rows.length + '件）に、①の絞り込みに合わないスキル（本育成で得るものを除く）が無い', shownMisfit.slice(0, 8));
		assert(!a.rows.some((r) => /が合わないため/.test(r.reason)), '検索小窓(3) 「距離／脚質／バ場が合わないため選べない」の行は無い', a.rows.filter((r) => /が合わないため/.test(r.reason)).slice(0, 3));
		const ui = await sp.page.evaluate(() => ({ el: !!document.querySelector('[data-usd-el="result-excluded"]'), text: document.querySelector('.usd-modal:not([hidden]) .usd-picker-panel').textContent }));
		assert(!ui.el && !/選べない/.test(ui.text) && !/①の絞り込み/.test(ui.text), '検索小窓(3) 件数の文（「選べない：…」「①の絞り込み（…）N件」）が無い', { el: ui.el });
		assert(a.count === a.rows.filter((r) => !r.gray).length + '件', '検索小窓(3) 「N件」は追加できる行の数', { count: a.count, open: a.rows.filter((r) => !r.gray).length });
		// 押せてしまっても足さない（保険）: 灰色の行（本育成で取得）
		const g = a.rows.find((r) => r.gray);
		assert(!!g, '検索小窓(3) 前提: 本育成で得る灰色の行がある');
		await sp.page.evaluate((id) => { const i = document.querySelector('[data-usd-el="results"] input[value="' + id + '"]'); i.disabled = false; i.click(); }, g.id);
		await sp.page.waitForTimeout(200);
		const cnt = await sp.page.evaluate(() => document.querySelector('[data-usd-el="picker-checked-count"]').textContent);
		assert(cnt === '0種選択', '検索小窓(3) 灰色の行は、押せてしまってもチェックに入らない', cnt);
		await sp.page.click('[data-usd-act="picker-select-all"]');
		await sp.page.waitForTimeout(200);
		const cnt2 = await sp.page.evaluate(() => document.querySelector('[data-usd-el="picker-checked-count"]').textContent);
		assert(cnt2 === a.rows.filter((r) => !r.gray).length + '種選択', '検索小窓(3) 表示中を全て選択は、追加できる行だけ', cnt2);
		assert(await noHScroll(sp.page), '検索小窓(3) 横スクロールなし（390px）');
		assert(jsErrors(sp.errors).length === 0, '検索小窓(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 絞り込みが無ければ今までどおり。無いときの一覧から、①の判定で合わないもの（本育成で得るものを除く）を抜くと、ありのときの一覧と同じ
		const sp2 = await openSp({ roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null] } });
		await openFilter(sp2.page);
		const b = await readRows(sp2.page);
		// ①の絞り込みは①で得るスキル（本育成で取得の行）の顔ぶれも変えるので、行の差は「①の判定で合わないもの」だけであることを見る（本育成の扱いは問わずに判定する）
		const bIds = b.rows.map((r) => r.id), aIds = a.rows.map((r) => r.id);
		const gone = bIds.filter((id) => !aIds.includes(id));
		const goneFit = await sp2.page.evaluate(({ ids, f }) => { const C = UmaSkillDeckCore; const sel = {}; ['distance', 'style', 'surface'].forEach((k) => { if (f[k]) sel[k] = [f[k]]; }); return ids.filter((id) => C.matchesFilters(C.findSkill(id), sel, null)); }, { ids: gone, f: FILTER });
		const order = aIds.every((id, i) => i === 0 || bIds.indexOf(aIds[i - 1]) < bIds.indexOf(id));
		assert(gone.length > 0 && goneFit.length === 0 && aIds.every((id) => bIds.includes(id)) && order, '検索小窓(3) 絞り込みなしの一覧（' + b.rows.length + '件）から消えた ' + gone.length + '件は、どれも①の判定で合わないもの・ありのときの一覧（' + a.rows.length + '件）は並びも同じ', { gone: gone.length, goneFit: goneFit.slice(0, 3), order });
		await sp2.ctx.close();
		// バ場だけの絞り込み（芝）: ダートのタグを持つ行（本育成で得るものを除く）は出ない
		const sp4 = await openSp({ roster: { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null], skillFilter: { surface: 'turf' } } });
		await openFilter(sp4.page);
		const d4 = await readRows(sp4.page);
		const dirt = d4.rows.filter((r) => !r.gray && ((TAGS.get(r.id) || {}).surface || []).some((v) => v !== 'turf'));
		const wantGone = b.rows.filter((r) => !r.gray && ((TAGS.get(r.id) || {}).surface || []).some((v) => v !== 'turf'));
		assert(dirt.length === 0 && wantGone.length > 0 && d4.rows.length === b.rows.length - wantGone.length, '検索小窓(3) バ場（芝）だけ: ダートのタグを持つ ' + wantGone.length + '件が一覧から消える', { left: dirt.length, n: d4.rows.length, base: b.rows.length });
		await sp4.ctx.close();
		// 本育成編成・レース条件と重なるとき: 本育成で得る行・レース条件に合わない行は、短い表記で残る（①の絞り込みに合わない行は出ない）。320px
		const RACE = readJson('data/upcoming-races.json').races[0];
		const sp3 = await openSp({ w: 320, h: 568, roster: { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { style: 'nige' }, race: RACE } });
		await openFilter(sp3.page);
		const c = await readRows(sp3.page);
		const reasons = Array.from(new Set(c.rows.filter((r) => r.gray).map((r) => r.reason)));
		assert(reasons.includes('本育成で取得') && reasons.includes('レース条件不一致') && reasons.every((x) => ['本育成で取得', 'レース条件不一致', '本育成編成で不要にしているため選べません'].includes(x)) && c.rows.filter((r) => r.gray).every((r) => r.disabled),
			'検索小窓(3) 3つ重なるとき: 選べない行の右は「本育成で取得」「レース条件不一致」だけ・チェック不可', reasons);
		// 脚質（逃げ）に合わない行は出ない（レース条件・本育成で選べない行を除く。距離・バ場はレースの値で固定されるので脚質だけで見る）
		const fit3 = await misfit(sp3.page, c.rows.filter((r) => !r.gray).map((r) => r.id), { style: 'nige' });
		assert(fit3.length === 0 && c.count === c.rows.filter((r) => !r.gray).length + '件' && !c.label, '検索小窓(3) 3つ重なるとき: 脚質（逃げ）に合わない行は選べる行に無い・件数の文は無い', { misfit: fit3.slice(0, 3), count: c.count });
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
