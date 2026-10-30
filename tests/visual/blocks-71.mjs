// ①と②の◎⇔○ の連動（C-245・2026-10-30）の検査。
// run-smoke.mjs の末尾から register71() で呼ばれる（塊の見出しはすべて「◎連動」で始まる。`npm run test:visual -- --only=◎連動` で回せる）。
//
// 決め（おいもさん・2026-10-30）:
//  ・①で取得する○（Lv0〜2 の白も Lv3 以上も。②では差の行・「①で取得」の薄い行）は、②の行の名前・説明の小窓の名前が①の状態（◎／○）に従う。
//  ・②の「◎を○に変えるモード」でその行を押すと、同じセットの①の roster.keepCircleIds を書き、①の同じスキルも切り替わる（①と同じ処理・元に戻すは1回）。
//    ②の keepCircleIds は書かない。①で切り替えたときは②の行（名前・Pt・マイナスの小窓の形）が従う。切り替えは行単位。
//  ・②の Pt・種数は今まで数えていないものを新しく数えない（「①で取得」の行は薄いまま。切り替えると①の Pt だけが変わる）。
//  ・入口の◎のボタンは、②独自の候補が無くても①に関わる行があれば出す。②独自の候補（①に無い○）は今のまま（②の keepCircleIds だけ）。
//  ・◎⇔○ の切り替えのトースト（「○のまま数えます：…」「◎に上げて数えます：…」）は①・②とも出さない。元に戻したときのトーストは残す。
//  ・②の keepCircleIds に残っている①に関わる○の id は読まずに無視する（書き換えない・消さない。ルール28）。
// スキル名は検査の側に書かない（恒久ルール1。id で書き、名前はデータから引く）。上位の◎はステップアップのデータで確かめる。
// 編成 A は C-242 の塊（blocks-68「マイナスの小窓」）と同じ実データ（uma-0179＋6枚・切れ者・共通スキルのヒントLv 3）。

import { reloadReady } from './lib/page-ready.mjs';
import { pickEntry } from './lib/entry-search.mjs';

export async function register71(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const NAME = new Map();
	readJson('uma-skill-deck-skills.json').skills.forEach((s) => NAME.set(String(s.id), s.name));
	readJson('data/extended-skills.json').entries.forEach((s) => { if (!NAME.has(s.id)) NAME.set(s.id, s.name); });
	const N = (id) => NAME.get(id);
	const SU = readJson('data/skill-step-up.json').entries;
	const isPrevOf = (up, w) => SU.some((e) => e.skillId === up && (e.prevSkillIds || []).includes(w));
	const T = '#deck-template-panel ';
	const R = '#deck-roster-panel ';
	const ST = 'kire', F = 3;
	const A = { umaId: 'uma-0179', cardIds: ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'], pt: { status: ST } };
	const IDS = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417', '125', '124', '6', '27', '33', '230', '16', '23', '147', '117', '118', '145'];
	// 左回り○（①で取得する Lv0〜2 の白。②では差の行）・道悪○（①で取得する Lv3 以上。②では「①で取得」の行）・右回り○（①に無い。②独自の候補）
	const HIDARI = '2', HIDARI_UP = 'ex-0535', DOROI = '16', DOROI_UP = 'ex-0549', MIGI = '1';
	// 道悪○の再現（おいもさんの場面）: スタミナのサポートカード「キセキ」（SSR）。キャラクターの共通イベントで道悪○（ヒントLv1）
	const KISEKI = 'card-0549';

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ roster, scope }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster || A, scope: Object.assign({ skillIds: o.ids || IDS, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: F }, o.scope || {}) });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(400);
		return sp;
	};
	/** ②の行（カード一覧・星取表のどちらも同じ部品）と①の行と、保存（①・②の keepCircleIds）・セットの数字 */
	const readState = (page) => page.evaluate(() => {
		const rows = {};
		document.querySelectorAll('#deck-template-panel [data-usd-el="selected-list"] .usd-panel[data-skill-id]').forEach((p) => {
			const nb = p.querySelector('.usd-panel-namebtn');
			const tg = p.querySelector('[data-usd-el="factor-circle-toggle"]');
			const pt = p.querySelector('[data-usd-el="panel-pt"]');
			rows[p.dataset.skillId] = { name: nb ? nb.textContent : null, info: nb ? nb.getAttribute('data-usd-info') : null, circle: p.dataset.usdCircle || null,
				taken: p.classList.contains('usd-panel--taken'), pt: pt ? pt.textContent : null,
				tog: tg ? { pressed: tg.getAttribute('aria-pressed'), mark: tg.textContent, scope: tg.getAttribute('data-usd-scope') } : null };
		});
		const r1 = {};
		document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]:not([data-usd-derived])').forEach((r) => {
			const nm = r.querySelector('.usd-roster-skillname');
			const pt = r.querySelector('[data-usd-el="pt-line"]');
			r1[r.getAttribute('data-skill-id')] = { name: nm ? nm.textContent : null, circle: r.getAttribute('data-usd-circle'), pt: pt ? pt.textContent : null };
		});
		const dr = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || '{}');
		const ds = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}');
		const sum = deckTemplateManager.getSetSummary();
		return { rows, r1, keep1: dr.keepCircleIds === undefined ? null : dr.keepCircleIds, keep2: ds.keepCircleIds === undefined ? null : ds.keepCircleIds,
			sum: sum ? { roster: sum.rosterPt, factor: sum.factorPt, total: sum.total, kinds: sum.factorKinds } : null,
			modeBtn: !!document.querySelector('#deck-template-panel [data-usd-el="factor-circle-mode"]') };
	});
	const setMode = async (page, on) => {
		const cur = await page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-circle-mode"]'); return b ? b.getAttribute('aria-pressed') : null; });
		if (cur === null) return false;
		if ((cur === 'true') !== on) { await page.click(T + '[data-usd-el="factor-circle-mode"]'); await page.waitForTimeout(250); }
		return true;
	};
	const toggle2 = async (page, id) => { await page.click(T + '[data-usd-el="factor-circle-toggle"][data-skill-id="' + id + '"]'); await page.waitForTimeout(300); };
	/** ①の◎／○の切り替え（①のパネルは②のタブでは見えないので、列見出しの◎のボタンと行の切り替えを DOM の click で押す） */
	const toggle1 = async (page, id) => {
		await page.evaluate(() => {
			const on = document.querySelector('#deck-roster-panel [data-tone="circle"] button');
			if (on && on.getAttribute('aria-pressed') !== 'true') on.click();
		});
		await page.waitForTimeout(150);
		const ok = await page.evaluate((id) => { const b = document.querySelector('#deck-roster-panel [data-usd-el="circle-toggle"][data-skill-id="' + id + '"]'); if (!b) return false; b.click(); return true; }, id);
		await page.waitForTimeout(300);
		return ok;
	};
	const POP = '[data-usd-el="info-pop"]:not([hidden])';
	const infoTitle = async (page, id) => {
		await page.click(T + '.usd-panel[data-skill-id="' + id + '"] .usd-panel-namebtn');
		await page.waitForSelector(POP, { timeout: 5000 });
		const t = await page.evaluate((POP) => { const pop = document.querySelector(POP); const h = pop.querySelector('[data-usd-el="info-title"]') || pop.querySelector('h2, h3, .usd-info-title'); return h ? h.textContent : null; }, POP);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);
		return t;
	};
	const overlapKind = async (page, id) => {
		await page.click(T + '[data-usd-el="panel-ptbtn"][data-skill-id="' + id + '"]');
		await page.waitForSelector(POP + ' [data-usd-el="overlap-info"]', { timeout: 5000 });
		const k = await page.evaluate((POP) => document.querySelector(POP + ' [data-usd-el="overlap-info"]').dataset.kind, POP);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(100);
		return k;
	};
	const toastShown = (page) => page.evaluate(() => { const t = document.getElementById('toast'); return { shown: !!t && !t.classList.contains('opacity-0'), text: (document.getElementById('toast-message') || {}).textContent || '' }; });
	const signedPt = (t) => { const v = Number(String(t).replace(/[^0-9]/g, '')) || 0; return String(t).trim().startsWith('−') ? -v : v; };

	await block('◎連動(1) 名前: ①で◎の行は②の名前も◎（カード一覧・星取表・説明の小窓）／①で○に戻すと②も○。Lv0〜2 の行（左回り○）と「①で取得」の行（道悪○）の両方', async () => {
		assert(isPrevOf(HIDARI_UP, HIDARI) && isPrevOf(DOROI_UP, DOROI), '◎連動(1) 前提: 例の◎はステップアップのデータで○の上位');
		const sp = await openSp();
		const s = await readState(sp.page);
		assert(s.rows[HIDARI] && !s.rows[HIDARI].taken && s.rows[DOROI] && s.rows[DOROI].taken, '◎連動(1) 前提: 左回り○は②の差の行・道悪○は「①で取得」の行', { h: s.rows[HIDARI], d: s.rows[DOROI] });
		const okOn = (r, up) => r.name === N(up) && r.info === up && r.circle === up;
		assert(okOn(s.rows[HIDARI], HIDARI_UP) && okOn(s.rows[DOROI], DOROI_UP) && s.r1[HIDARI].circle === HIDARI_UP && s.r1[DOROI].circle === DOROI_UP,
			'◎連動(1) カード一覧: ①が◎の2行は、②の名前・説明の小窓の id が◎', { h: s.rows[HIDARI], d: s.rows[DOROI] });
		assert(await infoTitle(sp.page, HIDARI) === N(HIDARI_UP) && await infoTitle(sp.page, DOROI) === N(DOROI_UP), '◎連動(1) 説明の小窓の題も◎の名前');
		await sp.page.click(T + '[data-usd-el="factor-view"]');
		await sp.page.waitForTimeout(300);
		const t = await readState(sp.page);
		assert(okOn(t.rows[HIDARI], HIDARI_UP) && okOn(t.rows[DOROI], DOROI_UP), '◎連動(1) 星取表の行も◎', { h: t.rows[HIDARI], d: t.rows[DOROI] });
		await sp.ctx.close();
		// ①で○に戻した保存（①の keepCircleIds）で開くと、②も○
		const sp2 = await openSp({ roster: Object.assign({}, A, { keepCircleIds: [HIDARI, DOROI] }) });
		const u = await readState(sp2.page);
		const okOff = (r, id) => r.name === N(id) && r.info === id && r.circle === null;
		assert(okOff(u.rows[HIDARI], HIDARI) && okOff(u.rows[DOROI], DOROI) && u.r1[HIDARI].circle === null && u.r1[DOROI].circle === null,
			'◎連動(1) ①で○のままの2行は、②の名前も○', { h: u.rows[HIDARI], d: u.rows[DOROI] });
		assert(await infoTitle(sp2.page, HIDARI) === N(HIDARI) && await infoTitle(sp2.page, DOROI) === N(DOROI), '◎連動(1) ○のときは説明の小窓の題も○の名前');
		await sp2.page.click(T + '[data-usd-el="factor-view"]');
		await sp2.page.waitForTimeout(300);
		const v = await readState(sp2.page);
		assert(okOff(v.rows[HIDARI], HIDARI) && okOff(v.rows[DOROI], DOROI), '◎連動(1) 星取表の行も○', { h: v.rows[HIDARI], d: v.rows[DOROI] });
		assert(jsErrors(sp.errors).length === 0 && jsErrors(sp2.errors).length === 0, '◎連動(1) コンソールのエラー0', jsErrors(sp.errors).concat(jsErrors(sp2.errors)).slice(0, 3));
		await sp2.ctx.close();
	});

	await block('◎連動(2) ②のモードで①に関わる行を押すと、①の keepCircleIds が変わり、①の名前・Pt・帯が変わる（②の keepCircleIds は変わらない）。「①で取得」の行は②の Pt・種を変えない', async () => {
		const sp = await openSp();
		const s0 = await readState(sp.page);
		assert(await setMode(sp.page, true), '◎連動(2) 入口の◎のボタンがある');
		const m = await readState(sp.page);
		assert(m.rows[HIDARI].tog && m.rows[HIDARI].tog.pressed === 'true' && m.rows[HIDARI].tog.mark === '◎' && m.rows[HIDARI].tog.scope === 'roster'
			&& m.rows[DOROI].tog && m.rows[DOROI].tog.pressed === 'true' && m.rows[DOROI].tog.scope === 'roster', '◎連動(2) モード: ①に関わる2行に◎の切り替え（①の状態＝◎）', { h: m.rows[HIDARI].tog, d: m.rows[DOROI].tog });
		// 左回り○（差の行）: ①で○に戻る → ①の名前・Pt・帯、②の名前・Pt（差）が変わる
		await toggle2(sp.page, HIDARI);
		const a = await readState(sp.page);
		assert(JSON.stringify(a.keep1) === JSON.stringify([HIDARI]) && a.keep2 === null, '◎連動(2) 左回り○: ①の keepCircleIds が [左回り○]・②の keepCircleIds は無いまま', { keep1: a.keep1, keep2: a.keep2 });
		assert(a.r1[HIDARI].name === N(HIDARI) && a.r1[HIDARI].circle === null && a.r1[HIDARI].pt !== s0.r1[HIDARI].pt && a.sum.roster < s0.sum.roster,
			'◎連動(2) 左回り○: ①の名前が○・①の行の Pt と①の帯が下がる', { before: s0.r1[HIDARI], after: a.r1[HIDARI], roster: [s0.sum.roster, a.sum.roster] });
		assert(a.rows[HIDARI].name === N(HIDARI) && a.rows[HIDARI].tog.pressed === 'false' && a.rows[HIDARI].tog.mark === '○', '◎連動(2) 左回り○: ②の名前と切り替えも○', a.rows[HIDARI]);
		await setMode(sp.page, false);
		const a2 = await readState(sp.page);
		assert(signedPt(a2.rows[HIDARI].pt) !== signedPt(s0.rows[HIDARI].pt) && a2.sum.factor !== s0.sum.factor, '◎連動(2) 左回り○: ②の行の Pt（差）と②の帯が変わる（①の◎の軽減が抜ける）', { before: s0.rows[HIDARI].pt, after: a2.rows[HIDARI].pt, factor: [s0.sum.factor, a2.sum.factor] });
		// 道悪○（「①で取得」の行）: ①の Pt だけが変わる。②の Pt・帯・薄い行は変わらない
		await setMode(sp.page, true);
		await toggle2(sp.page, DOROI);
		await setMode(sp.page, false);
		const b = await readState(sp.page);
		assert(JSON.stringify(b.keep1) === JSON.stringify([HIDARI, DOROI]) && b.keep2 === null, '◎連動(2) 道悪○: ①の keepCircleIds に道悪○が足される・②の keepCircleIds は無いまま', { keep1: b.keep1, keep2: b.keep2 });
		assert(b.r1[DOROI].name === N(DOROI) && b.sum.roster < a2.sum.roster && b.sum.factor === a2.sum.factor && b.sum.kinds === a2.sum.kinds && b.rows[DOROI].taken && b.rows[DOROI].pt === a2.rows[DOROI].pt && b.rows[DOROI].name === N(DOROI),
			'◎連動(2) 道悪○: ①の名前が○・①の帯だけが下がる（②の帯・「①で取得」の薄い行はそのまま）・②の名前も○', { r1: b.r1[DOROI], roster: [a2.sum.roster, b.sum.roster], factor: [a2.sum.factor, b.sum.factor], row: b.rows[DOROI] });
		// ◎に戻す（②から）
		await setMode(sp.page, true);
		await toggle2(sp.page, DOROI);
		await toggle2(sp.page, HIDARI);
		await setMode(sp.page, false);
		const c = await readState(sp.page);
		assert(c.keep1 === null && c.keep2 === null && c.sum.roster === s0.sum.roster && c.sum.factor === s0.sum.factor && c.rows[HIDARI].name === N(HIDARI_UP) && c.r1[DOROI].name === N(DOROI_UP),
			'◎連動(2) ②から◎に戻すと①の keepCircleIds は項目ごと消え、①・②の数字と名前は最初と同じ', { keep1: c.keep1, sum: c.sum, s0: s0.sum });
		assert(jsErrors(sp.errors).length === 0, '◎連動(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('◎連動(3) ①で切り替えると、②の名前・Pt・マイナスの小窓の形（circle ↔ level）が変わる／モードの切り替えの状態も従う', async () => {
		const sp = await openSp();
		const s0 = await readState(sp.page);
		assert(await overlapKind(sp.page, HIDARI) === 'circle', '◎連動(3) 前: 左回り○のマイナスの小窓は circle の形');
		assert(await toggle1(sp.page, HIDARI), '◎連動(3) ①の左回り○の切り替えを押せる');
		const a = await readState(sp.page);
		assert(JSON.stringify(a.keep1) === JSON.stringify([HIDARI]) && a.keep2 === null && a.rows[HIDARI].name === N(HIDARI) && a.rows[HIDARI].circle === null && a.rows[HIDARI].pt !== s0.rows[HIDARI].pt,
			'◎連動(3) ①で○にすると、②の名前が○・Pt が変わる', { before: s0.rows[HIDARI], after: a.rows[HIDARI], keep1: a.keep1 });
		assert(await overlapKind(sp.page, HIDARI) === 'level', '◎連動(3) マイナスの小窓は level の形');
		await setMode(sp.page, true);
		const m = await readState(sp.page);
		assert(m.rows[HIDARI].tog && m.rows[HIDARI].tog.pressed === 'false' && m.rows[HIDARI].tog.mark === '○', '◎連動(3) ②のモードの切り替えも○', m.rows[HIDARI].tog);
		await setMode(sp.page, false);
		assert(await toggle1(sp.page, HIDARI), '◎連動(3) ①でもう一度押せる');
		const b = await readState(sp.page);
		assert(b.keep1 === null && b.rows[HIDARI].name === N(HIDARI_UP) && b.rows[HIDARI].pt === s0.rows[HIDARI].pt && await overlapKind(sp.page, HIDARI) === 'circle',
			'◎連動(3) ①で◎に戻すと、②の名前・Pt・小窓の形も元に戻る', b.rows[HIDARI]);
		assert(jsErrors(sp.errors).length === 0, '◎連動(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('◎連動(4) 行単位: 押した行だけが変わる（ほかの①に関わる行・①のほかの◎の行・②のほかの行は変わらない）', async () => {
		const sp = await openSp();
		const vp = await sp.page.evaluate((r) => UmaSkillDeckCore.getRosterVisiblePart(r).circleCandidates, A);
		const s0 = await readState(sp.page);
		await setMode(sp.page, true);
		const m0 = await readState(sp.page);
		const linkedRows = Object.keys(m0.rows).filter((id) => m0.rows[id].tog && m0.rows[id].tog.scope === 'roster');
		assert(linkedRows.length >= 3 && linkedRows.includes(HIDARI) && linkedRows.includes(DOROI) && linkedRows.every((id) => vp.some(([o]) => o === id)),
			'◎連動(4) 前提: ①に関わる行が3行以上（すべて①の◎の候補）', { linkedRows, vp: vp.map((x) => x[0]) });
		await toggle2(sp.page, HIDARI);
		await setMode(sp.page, false);
		const a = await readState(sp.page);
		const changed2 = Object.keys(s0.rows).filter((id) => s0.rows[id].name !== a.rows[id].name);
		const changed1 = Object.keys(s0.r1).filter((id) => s0.r1[id].name !== a.r1[id].name || s0.r1[id].circle !== a.r1[id].circle);
		assert(JSON.stringify(changed2) === JSON.stringify([HIDARI]) && JSON.stringify(changed1) === JSON.stringify([HIDARI]) && JSON.stringify(a.keep1) === JSON.stringify([HIDARI]),
			'◎連動(4) 名前が変わったのは②・①とも押した1行だけ', { changed2, changed1, keep1: a.keep1 });
		const ptChanged = Object.keys(s0.rows).filter((id) => s0.rows[id].pt !== a.rows[id].pt);
		assert(ptChanged.every((id) => id === HIDARI), '◎連動(4) ②の行の Pt が変わったのは押した行だけ', ptChanged);
		await sp.ctx.close();
	});

	await block('◎連動(5) ②独自の候補（①に無い○＝右回り○）は今のまま: ②の keepCircleIds だけが変わり、①は変わらない', async () => {
		const sp = await openSp({ ids: IDS.concat([MIGI]) });
		const s0 = await readState(sp.page);
		assert(s0.rows[MIGI] && s0.rows[MIGI].circle && s0.rows[MIGI].name === N(s0.rows[MIGI].circle) && !s0.r1[MIGI], '◎連動(5) 前提: 右回り○は①に無く、②では◎として数える', s0.rows[MIGI]);
		await setMode(sp.page, true);
		const m = await readState(sp.page);
		assert(m.rows[MIGI].tog && m.rows[MIGI].tog.scope === null && m.rows[MIGI].tog.pressed === 'true', '◎連動(5) ②独自の候補の切り替えは①向けの印が無い', m.rows[MIGI].tog);
		await toggle2(sp.page, MIGI);
		await setMode(sp.page, false);
		const a = await readState(sp.page);
		assert(JSON.stringify(a.keep2) === JSON.stringify([MIGI]) && a.keep1 === null && a.sum.roster === s0.sum.roster && a.sum.factor < s0.sum.factor && a.rows[MIGI].name === N(MIGI),
			'◎連動(5) ②の keepCircleIds が [右回り○]・①の keepCircleIds と①の帯は変わらない・②の帯と名前が変わる', { keep1: a.keep1, keep2: a.keep2, sum: a.sum, s0: s0.sum });
		await sp.ctx.close();
	});

	await block('◎連動(6) 入口の◎のボタンは、②独自の候補が無くても①に関わる行があれば出る（無ければ出ない）', async () => {
		const sp = await openSp({ ids: [DOROI] });
		const s = await readState(sp.page);
		const fc = await sp.page.evaluate(() => deckTemplateManager.getFactorCircles());
		assert(fc && fc.candidates.length === 0 && s.modeBtn, '◎連動(6) ②独自の候補 0・①に関わる行（道悪○）だけで、◎のボタンが出る', { fc: fc && fc.candidates, modeBtn: s.modeBtn });
		await setMode(sp.page, true);
		const m = await readState(sp.page);
		assert(m.rows[DOROI].tog && m.rows[DOROI].tog.scope === 'roster', '◎連動(6) モードで道悪○の行に切り替えが出る', m.rows[DOROI]);
		await sp.ctx.close();
		// ①の◎の候補でない②の行（2026-10-30 の実データで①の候補に入らない白）だけ
		const sp2 = await openSp({ ids: ['36', '69'] });
		const vp = await sp2.page.evaluate((r) => UmaSkillDeckCore.getRosterVisiblePart(r).circleCandidates.map((x) => x[0]), A);
		const fc2 = await sp2.page.evaluate(() => deckTemplateManager.getFactorCircles());
		const t = await readState(sp2.page);
		assert(!vp.includes('36') && !vp.includes('69') && fc2 && fc2.candidates.length === 0, '◎連動(6) 前提: 2行とも①の◎の候補でも②独自の候補でもない', { vp, fc: fc2 && fc2.candidates });
		assert(!t.modeBtn, '◎連動(6) ①に関わる行も②独自の候補も無いときは、◎のボタンは出ない', t.modeBtn);
		await sp2.ctx.close();
	});

	await block('◎連動(7) 道悪○の再現: ①に「キセキ」（スタミナ・SSR）の道悪○（ヒントLv1）→ ②にテキストで検索で道悪○を足す → ◎のボタンで道悪○の行に切り替えが出て、①の道悪○／道悪◎と連動する', async () => {
		const cardsJson = readJson('data/support-cards.json');
		const card = (cardsJson.entries || cardsJson).find((c) => c.id === KISEKI);
		assert(card && card.type === 'スタミナ' && card.rarity === 'SSR' && /キセキ/.test(card.charaName), '◎連動(7) 前提: 「キセキ」のスタミナのカード', card && { id: card.id, chara: card.charaName, type: card.type });
		const roster = { umaId: 'uma-0179', cardIds: [KISEKI] };
		const sp = await openSp({ roster, ids: [] });
		const vp = await sp.page.evaluate((r) => UmaSkillDeckCore.getRosterVisiblePart(r), roster);
		const cand = (vp.circleCandidates || []).find(([o]) => o === DOROI);
		assert(cand && cand[1] === DOROI_UP, '◎連動(7) 前提: ①は道悪○を取得し、◎（道悪◎）の候補', { cand, cands: vp.circleCandidates });
		await pickEntry(sp.page, 'editor-pick-text');
		await sp.page.fill('[data-usd-el="paste-input"]', N(DOROI));
		await sp.page.click('[data-usd-act="paste-run"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click('[data-usd-el="picker-commit"]');
		await sp.page.waitForTimeout(400);
		await sp.page.evaluate(() => { if (UmaSkillDeckCore.closeSkillPicker) UmaSkillDeckCore.closeSkillPicker(); });
		await sp.page.waitForTimeout(300);
		const s = await readState(sp.page);
		assert(s.rows[DOROI] && s.rows[DOROI].name === N(DOROI_UP) && s.modeBtn, '◎連動(7) ②に道悪○が入り、名前は①に従って◎・◎のボタンが出る', { row: s.rows[DOROI], modeBtn: s.modeBtn });
		await setMode(sp.page, true);
		const m = await readState(sp.page);
		assert(m.rows[DOROI].tog && m.rows[DOROI].tog.pressed === 'true' && m.rows[DOROI].tog.scope === 'roster', '◎連動(7) モードで道悪○の行に◎の切り替えが出る', m.rows[DOROI]);
		await toggle2(sp.page, DOROI);
		const a = await readState(sp.page);
		assert(JSON.stringify(a.keep1) === JSON.stringify([DOROI]) && a.keep2 === null && a.r1[DOROI].name === N(DOROI) && a.rows[DOROI].name === N(DOROI) && a.rows[DOROI].tog.pressed === 'false',
			'◎連動(7) 押すと①の道悪◎が道悪○に・②も○', { keep1: a.keep1, keep2: a.keep2, r1: a.r1[DOROI], row: a.rows[DOROI] });
		await setMode(sp.page, false);
		assert(await toggle1(sp.page, DOROI), '◎連動(7) ①の道悪○の切り替えを押せる');
		const b = await readState(sp.page);
		assert(b.keep1 === null && b.r1[DOROI].name === N(DOROI_UP) && b.rows[DOROI].name === N(DOROI_UP), '◎連動(7) ①で◎に戻すと②も道悪◎', { r1: b.r1[DOROI], row: b.rows[DOROI] });
		assert(jsErrors(sp.errors).length === 0, '◎連動(7) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('◎連動(8) 切り替えでトーストが出ない（②の①に関わる行・②独自の候補・①）／元に戻すは使え、そのトーストは出る', async () => {
		const sp = await openSp({ ids: IDS.concat([MIGI]) });
		await setMode(sp.page, true);
		await toggle2(sp.page, HIDARI);
		const t1 = await toastShown(sp.page);
		await toggle2(sp.page, MIGI);
		const t2 = await toastShown(sp.page);
		await setMode(sp.page, false);
		await toggle1(sp.page, DOROI);
		const t3 = await toastShown(sp.page);
		assert(!t1.shown && !t2.shown && !t3.shown, '◎連動(8) ②（①に関わる行・②独自）・①の切り替えでトーストは出ない', { t1, t2, t3 });
		const s = await readState(sp.page);
		assert(JSON.stringify(s.keep1) === JSON.stringify([HIDARI, DOROI]) && JSON.stringify(s.keep2) === JSON.stringify([MIGI]), '◎連動(8) 3つとも保存は切り替わっている', { keep1: s.keep1, keep2: s.keep2 });
		// 元に戻す（新しい順）: ①の道悪○ → ②の右回り○ → ①の左回り○（②から書いたもの）
		const undo = async () => { await sp.page.click('#deck-undo-btn'); await sp.page.waitForTimeout(250); const t = await toastShown(sp.page); return { t, s: await readState(sp.page) }; };
		const u1 = await undo();
		const u2 = await undo();
		const u3 = await undo();
		assert(JSON.stringify(u1.s.keep1) === JSON.stringify([HIDARI]) && JSON.stringify(u1.s.keep2) === JSON.stringify([MIGI]) && JSON.stringify(u2.s.keep1) === JSON.stringify([HIDARI]) && u2.s.keep2 === null,
			'◎連動(8) 元に戻す 1回目で①の道悪○・2回目で②の右回り○が戻る', { u1: [u1.s.keep1, u1.s.keep2], u2: [u2.s.keep1, u2.s.keep2] });
		assert(u3.s.keep1 === null && u3.s.keep2 === null && u3.s.rows[HIDARI].name === N(HIDARI_UP), '◎連動(8) 元に戻す 3回目で②から切り替えた①の左回り○が戻る（1回の操作で1回）', { keep1: u3.s.keep1, keep2: u3.s.keep2, row: u3.s.rows[HIDARI] });
		assert([u1, u2, u3].every((u) => u.t.shown && u.t.text === '◎／○の切り替えを戻しました'), '◎連動(8) 元に戻したときは「◎／○の切り替えを戻しました」のトーストが出る', [u1.t, u2.t, u3.t]);
		assert(jsErrors(sp.errors).length === 0, '◎連動(8) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('◎連動(9) 古い保存データ: ②の keepCircleIds に①に関わる○が入っていても、①の状態で表示し、②の保存値を書き換えない（切り替え・開き直しのあとも同じ）', async () => {
		const OLD = [HIDARI, DOROI, 'zz-unknown'];
		const sp = await openSp({ scope: { keepCircleIds: OLD } });
		const s = await readState(sp.page);
		assert(JSON.stringify(s.keep2) === JSON.stringify(OLD) && s.rows[HIDARI].name === N(HIDARI_UP) && s.rows[DOROI].name === N(DOROI_UP),
			'◎連動(9) ②の保存に○が残っていても、①が◎なので②の名前は◎・②の保存値はそのまま', { keep2: s.keep2, h: s.rows[HIDARI].name, d: s.rows[DOROI].name });
		await setMode(sp.page, true);
		await toggle2(sp.page, HIDARI);
		await setMode(sp.page, false);
		const a = await readState(sp.page);
		assert(JSON.stringify(a.keep1) === JSON.stringify([HIDARI]) && JSON.stringify(a.keep2) === JSON.stringify(OLD), '◎連動(9) ②から切り替えると①だけが書かれ、②の保存値は書き換えない', { keep1: a.keep1, keep2: a.keep2 });
		await reloadReady(sp.page);
		await sp.page.waitForTimeout(600);
		const b = await readState(sp.page);
		assert(JSON.stringify(b.keep2) === JSON.stringify(OLD) && JSON.stringify(b.keep1) === JSON.stringify([HIDARI]) && b.rows[HIDARI].name === N(HIDARI) && b.rows[DOROI].name === N(DOROI_UP),
			'◎連動(9) 開き直しても②の保存値はそのまま・名前は①の状態', { keep1: b.keep1, keep2: b.keep2, h: b.rows[HIDARI] && b.rows[HIDARI].name, d: b.rows[DOROI] && b.rows[DOROI].name });
		await sp.ctx.close();
	});
}
