// ヒントLvの件（C-223・2026-10-28）の検査。run-smoke.mjs の末尾から register59() で呼ばれる
// （塊の見出しはすべて「ヒントLv」で始まる。`npm run test:visual -- --only=ヒントLv` で回せる）。
//
// 決め（おいもさん）:
//  ・①（本育成）での合計のヒントLv（computeRosterPt の items の hintLevel。◎に上げた行は根の○の Lv）が 0〜2 の白スキルは、②で選べる。
//    金・Lv3 以上（練習のヒント Lv5・初期／覚醒 Lv3 を含む）は今のまま選べない。閾値は core の定数。C-131 の組の相手も①のスキルと同じ扱い。
//  ・数え方は案A: ①の帯はそのまま。②の帯に、親で安くなったぶんをマイナスの差で出す。見出しの合計は computeFactorSetPt の今の式。
//  ・②の行: 差の Pt（例 −60 Pt）と、名前の脇の小さな「①と重なり」。C-178 の前段の重なりの行も同じ出し方（行の Pt の和＝②の帯）。
//  ・種数: ②の帯の N種には数え、見出しの合計では重なりを引いて1種。countCrossPairedKinds の二重引きを起こさない。
//  ・見出しの（?）: 重なりの行の文（●にも広げる）と、種の式の「− N（①と②の両方にあるため1種に数える）」。
//  ・②の◎の候補: ①で取得する○は候補にしない（(ア)。◎で数えるかは①の切り替えだけ）。
//  ・脚質オススメ: 対象のスキルは灰色を外し、行の Pt は足したときの差。オススメサポ: 対象のスキルを母集団に含める（点数の付け方は今のまま）。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。
import { pickEntry } from './lib/entry-search.mjs';

export async function register59(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const RULES = readJson('data/skill-pt-rules.json');
	const STEPDOC = readJson('data/skill-step-up.json').entries;
	const ROOT = new Map(STEPDOC.filter((e) => e.hintRootSkillId).map((e) => [e.skillId, e.hintRootSkillId]));
	const PREV = new Map(STEPDOC.map((e) => [e.skillId, e.prevSkillIds || []]));
	const PAIRS = readJson('data/recommended-skills.json').equivalentPairs.map((p) => p.skillIds);
	const rarity = (id) => (PT.get(id) || {}).rarity;
	const ptOf = (b, level, statusId) => {
		const hint = level > 0 ? RULES.hintDiscountPercent[Math.min(level, RULES.hintDiscountPercent.length) - 1] : 0;
		const st = (RULES.statuses.find((s) => s.id === statusId) || { percent: 0 }).percent;
		const n = b * (100 - hint - st);
		return RULES.rounding === 'floor' ? Math.floor(n / 100) : Math.round(n / 100);
	};
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const SM = '[data-usd-el="style-modal"] ';
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const R1 = { umaId: 'uma-0001', cardIds: CARDS6 };
	const R2 = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
	const A40 = { umaId: 'uma-0179', cardIds: ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'], skillFilter: { distance: 'long', style: 'senko', surface: 'turf' }, pt: { status: 'kire', umaHintLevel: 3 } };
	const M = { umaId: 'uma-0001', cardIds: ['card-0565'] };
	const AOHARU = '417';   // card-0565 の連続イベントで Lv1 しか取れない白（調べ hint-lv-factor-step0 の例）
	// 固定の期待値（実データ。2026-10-28 に変更前〔d835bd5〕と変更後で測った。①の Lv0〜2 の白を全部②に入れた・F=5。種数は②が空のときと同じ）
	const FIX = {
		R1: { empty: 8932, low: 8419, roster: 8092, lowN: 10 },
		R2: { empty: 5739, low: 5367, roster: 4899, lowN: 7 },
		A40: { empty: 5440, low: 4943, roster: 4720, lowN: 12 },
		M: { empty: 4333, low: 4162, roster: 3493, lowN: 3 }
	};

	/** special.html を、①（下書きの編成）と②の下書き（ids・F）を入れて開く。②のタブを見せる */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ roster, ids, F }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			if (ids) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: F }));
			else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster, ids: o.ids || null, F: o.F === undefined ? 5 : o.F });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); try { await UmaSkillDeckCore.loadSkillEvolutions(); } catch (e) {} });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};
	/** 製品の数と②の行、①の取得と Lv（独立に: ①の items の Lv を◎→○へ当て直す）、選べないスキル */
	const read = (page, roster) => page.evaluate((roster) => {
		const s = deckTemplateManager.getSetSummary();
		const d = UmaSkillDeckCore.getRosterPtDetail(roster);
		const vp = UmaSkillDeckCore.getRosterVisiblePart(roster);
		const circ = new Map(vp.circleOf);
		const lv = new Map(d.items.map((x) => [x.skillId, x.hintLevel]));
		const rows = Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]')).map((p) => {
			const mk = p.querySelector('[data-usd-el="panel-overlap"]');
			return { id: p.dataset.skillId, pt: (p.querySelector('[data-usd-el="panel-pt"]') || {}).textContent || '', mark: mk ? mk.textContent : null,
				markInName: !!(mk && mk.closest('[data-usd-el="panel-namescroll"]')), overlap: p.getAttribute('data-usd-overlap'), taken: p.classList.contains('usd-panel--taken'), h: Math.round(p.getBoundingClientRect().height) };
		});
		const n = (sel) => { const e = document.querySelector(sel); return e ? Number(e.textContent.replace(/[^0-9]/g, '')) : null; };
		return { total: s.total, totalKinds: s.totalKinds, rosterPt: s.rosterPt, rosterKinds: s.rosterKinds, factorPt: s.factorPt, factorKinds: s.factorKinds, commonPt: s.commonPt,
			uniqPt: s.uniqPt, crossPaired: s.crossPaired, overlapKinds: s.overlapKinds, taken: s.takenIds,
			bandPt: n('#deck-template-panel [data-usd-el="factor-pt"]'), bandKinds: n('#deck-template-panel [data-usd-el="factor-count"]'),
			headTotal: (() => { const e = document.querySelector('#deck-set-bar [data-usd-el="set-total"]'); return e ? Number(e.dataset.total) : null; })(),
			sure: vp.takenIds.map((id) => ({ id, L: lv.get(circ.get(id) || id), circle: circ.get(id) || null })), lowApi: d.lowHintIds,
			hidden: UmaSkillDeckCore.getPickerHiddenIds(), circles: deckTemplateManager.getFactorCircles(), rows,
			overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
	}, roster);
	const signedPt = (t) => { const v = Number(String(t).replace(/[^0-9]/g, '')) || 0; return String(t).trim().startsWith('−') ? -v : v; };
	const lowWhitesOf = (a) => a.sure.filter((x) => x.L <= 2 && rarity(x.id) === 'white').map((x) => x.id);
	/** C-131 の組を読ませる（②の追加の入口を開くと読む）。読めたら選べないスキルが組み直る */
	const loadPairs = async (page) => {
		await pickEntry(page, 'editor-pick-text');
		await page.waitForTimeout(600);
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(300);
	};

	await block('ヒントLv(1) アオハル点火・賢（M＝uma-0001＋card-0565）: ①は Lv1・180 Pt／②で選べる／②に入れると行は差（F=1〜5 で −20・−40・−50・−60・−60 Pt＝独立に出した式）・「①と重なり」／①の帯は不変・見出しは ①だけ＋差', async () => {
		let sp = await openSp({ roster: M });
		const a = await read(sp.page, M);
		await sp.ctx.close();
		const me = a.sure.find((x) => x.id === AOHARU);
		const base = PT.get(AOHARU).pt;
		assert(!!me && me.L === 1 && rarity(AOHARU) === 'white', 'ヒントLv(1) 前提: ①で取得・合計のヒントLv 1・白', me);
		assert(ptOf(base, 1, 'none') === 180, 'ヒントLv(1) ①だけのときの Pt は 180（独立の式）', ptOf(base, 1, 'none'));
		assert(a.hidden.indexOf(AOHARU) === -1 && a.lowApi.indexOf(AOHARU) !== -1, 'ヒントLv(1) ②の追加の一覧で選べる（選べないスキルに入らない）', { hidden: a.hidden.includes(AOHARU), low: a.lowApi });
		assert(a.headTotal === FIX.M.empty && a.rosterPt === FIX.M.roster, 'ヒントLv(1) ②が空のとき見出し ' + FIX.M.empty + '・①の帯 ' + FIX.M.roster, { head: a.headTotal, r: a.rosterPt });
		for (const F of [1, 2, 3, 4, 5]) {
			sp = await openSp({ roster: M, ids: [AOHARU], F });
			const b = await read(sp.page, M);
			const want = ptOf(base, Math.min(5, 1 + F), 'none') - ptOf(base, 1, 'none');
			const row = b.rows.find((r) => r.id === AOHARU);
			assert(!!row && signedPt(row.pt) === want && row.pt === '−' + Math.abs(want) + ' Pt', 'ヒントLv(1) F=' + F + ': 行は「−' + Math.abs(want) + ' Pt」', row);
			assert(row.mark === '①と重なり' && row.markInName && row.overlap === 'sure' && !row.taken, 'ヒントLv(1) F=' + F + ': 名前の脇に「①と重なり」・薄くしない（①で取得 ではない）', row);
			assert(b.rosterPt === FIX.M.roster && b.headTotal === FIX.M.empty + want && b.total === b.rosterPt + b.factorPt, 'ヒントLv(1) F=' + F + ': ①の帯は不変・見出し ＝ ' + FIX.M.empty + ' − ' + Math.abs(want), { head: b.headTotal, r: b.rosterPt, f: b.factorPt });
			assert(b.commonPt === want && b.bandPt === b.factorPt, 'ヒントLv(1) F=' + F + ': 共通スキルの Pt ＝ 行の差（帯も同じ）', { common: b.commonPt, band: b.bandPt });
			assert(b.factorKinds === a.factorKinds + 1 && b.totalKinds === a.totalKinds && b.overlapKinds === 1, 'ヒントLv(1) F=' + F + ': ②の帯の種は +1・見出しの種は変わらない（重なりを1種に数える）', { f: [a.factorKinds, b.factorKinds], t: [a.totalKinds, b.totalKinds], o: b.overlapKinds });
			assert(b.taken.length === 0, 'ヒントLv(1) F=' + F + ': 「①で取得するスキル N種は数えていません」に入らない', b.taken);
			if (F === 5) assert(jsErrors(sp.errors).length === 0 && !b.overflowX, 'ヒントLv(1) コンソールのエラー0・横スクロールなし', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('ヒントLv(2) 検査の編成 R1・R2・A40・M: ①の Lv0〜2 の白を全部②に入れると、見出しは測った値（①の帯は不変・種は変わらない）／行の和＝②の帯／単独の根の行は独立の式の差', async () => {
		for (const [k, roster] of Object.entries({ R1, R2, A40, M })) {
			const fx = FIX[k];
			let sp = await openSp({ roster });
			const a = await read(sp.page, roster);
			await sp.ctx.close();
			const low = lowWhitesOf(a);
			assert(low.length === fx.lowN && JSON.stringify(low.slice().sort()) === JSON.stringify(a.lowApi.slice().sort()), 'ヒントLv(2) ' + k + ' ①の Lv0〜2 の白は ' + fx.lowN + '種（独立に数えた集合と製品の集合が一致）', { low, api: a.lowApi });
			assert(a.headTotal === fx.empty && a.rosterPt === fx.roster, 'ヒントLv(2) ' + k + ' ②が空: 見出し ' + fx.empty + '・①の帯 ' + fx.roster, { head: a.headTotal, r: a.rosterPt });
			sp = await openSp({ roster, ids: low });
			const b = await read(sp.page, roster);
			await sp.ctx.close();
			assert(b.headTotal === fx.low && b.total === b.rosterPt + b.factorPt, 'ヒントLv(2) ' + k + ' 全部入れると見出し ' + fx.low + '（① ＋ ②）', { head: b.headTotal, r: b.rosterPt, f: b.factorPt });
			assert(b.rosterPt === fx.roster && b.rosterKinds === a.rosterKinds, 'ヒントLv(2) ' + k + ' ①の帯（Pt・種）は変わらない', { r: [a.rosterPt, b.rosterPt], k: [a.rosterKinds, b.rosterKinds] });
			assert(b.totalKinds === a.totalKinds && b.overlapKinds === low.length && b.factorKinds === a.factorKinds + low.length, 'ヒントLv(2) ' + k + ' 見出しの種は②が空のときと同じ（②の帯は +' + low.length + '・重なり ' + low.length + '）', { t: [a.totalKinds, b.totalKinds], f: [a.factorKinds, b.factorKinds], o: b.overlapKinds, x: b.crossPaired });
			const sum = b.rows.reduce((s, r) => s + signedPt(r.pt), 0);
			assert(sum === b.commonPt && b.commonPt === fx.low - fx.empty, 'ヒントLv(2) ' + k + ' 共通スキルの Pt ＝ 行の Pt の和 ＝ 見出しの差（' + (fx.low - fx.empty) + '）', { sum, common: b.commonPt });
			assert(b.rows.every((r) => r.mark === '①と重なり' && r.overlap === 'sure' && signedPt(r.pt) < 0), 'ヒントLv(2) ' + k + ' すべての行に「①と重なり」・Pt はマイナス', b.rows.filter((r) => r.mark !== '①と重なり' || signedPt(r.pt) >= 0).slice(0, 3));
			const st = (roster.pt && roster.pt.status) || 'none';
			const bad = [];
			low.forEach((id) => {
				const s = a.sure.find((x) => x.id === id);
				if (s.circle || ROOT.has(id) || STEPDOC.some((e) => e.hintRootSkillId === id)) return;   // ◎に上げた行・系列のある白は根でまとめるので、式は単独のときだけ見る
				const want = ptOf(PT.get(id).pt, Math.min(5, s.L + 5), st) - ptOf(PT.get(id).pt, s.L, st);
				const r = b.rows.find((x) => x.id === id);
				if (!r || signedPt(r.pt) !== want) bad.push([id, r && r.pt, want]);
			});
			assert(bad.length === 0, 'ヒントLv(2) ' + k + ' 系列の無い白の行は「Lv(L＋5) の Pt − Lv L の Pt」（独立の式）', bad.slice(0, 5));
			assert(b.circles.candidates.every(([o]) => low.indexOf(o) === -1), 'ヒントLv(2) ' + k + ' ①で取得する○は②の◎の候補にしない（(ア)）', b.circles.candidates.slice(0, 5));
		}
	});

	await block('ヒントLv(3) 選べないまま: Lv3 以上（練習のヒント・初期／覚醒を含む）・金は選べない／C-131 の組の相手は①のスキルと同じ扱い', async () => {
		for (const [k, roster] of Object.entries({ R1, A40 })) {
			const sp = await openSp({ roster });
			await loadPairs(sp.page);
			const a = await read(sp.page, roster);
			const detail = await sp.page.evaluate((r) => {
				const res = UmaSkillDeckCore.computeRosterSkills(Object.assign({ cardIds: [] }, r));
				return { practice: (res.sources || []).filter((s) => s.kind === 'hint' && s.sure).map((s) => s.skillId), uma: (res.sources || []).filter((s) => s.kind === 'uma' && s.sure).map((s) => s.skillId) };
			}, roster);
			await sp.ctx.close();
			const low = new Set(lowWhitesOf(a));
			const fixed = a.sure.filter((x) => !low.has(x.id)).map((x) => x.id);
			assert(fixed.length > 0 && fixed.every((id) => a.hidden.indexOf(id) !== -1), 'ヒントLv(3) ' + k + ' ①の取得のうち Lv0〜2 の白以外（' + fixed.length + '種）は、すべて選べない', fixed.filter((id) => a.hidden.indexOf(id) === -1).slice(0, 5));
			assert(Array.from(low).every((id) => a.hidden.indexOf(id) === -1), 'ヒントLv(3) ' + k + ' Lv0〜2 の白は選べる', Array.from(low).filter((id) => a.hidden.indexOf(id) !== -1));
			const lowGold = a.sure.filter((x) => x.L <= 2 && rarity(x.id) === 'gold').map((x) => x.id);
			assert(lowGold.length > 0 && lowGold.every((id) => a.hidden.indexOf(id) !== -1), 'ヒントLv(3) ' + k + ' Lv0〜2 の金（' + lowGold.length + '種）は選べない', lowGold);
			const prac = a.sure.filter((x) => detail.practice.indexOf(x.id) !== -1);
			assert(prac.length > 0 && prac.every((x) => x.L >= 3 && a.hidden.indexOf(x.id) !== -1), 'ヒントLv(3) ' + k + ' 練習のヒントで得るもの（' + prac.length + '種）は Lv3 以上で選べない', prac.filter((x) => x.L < 3 || a.hidden.indexOf(x.id) === -1).slice(0, 3));
			const umaS = a.sure.filter((x) => detail.uma.indexOf(x.id) !== -1);
			assert(umaS.length > 0 && umaS.every((x) => x.L >= 3 && a.hidden.indexOf(x.id) !== -1), 'ヒントLv(3) ' + k + ' 初期・覚醒スキル（' + umaS.length + '種）は Lv3 以上で選べない', umaS.filter((x) => x.L < 3 || a.hidden.indexOf(x.id) === -1).slice(0, 3));
			// C-131: 組の片方が①の選べないスキルなら相手も選べない。片方が①の Lv0〜2 の白で、相手が①の選べないスキルでなければ、相手も選べる
			const fixedSet = new Set(fixed);
			const checks = [];
			PAIRS.forEach((p) => p.forEach((id, i) => {
				const other = p[1 - i];
				if (fixedSet.has(id)) checks.push([id, other, a.hidden.indexOf(other) !== -1, 'fixed']);
				else if (low.has(id) && !fixedSet.has(other)) checks.push([id, other, a.hidden.indexOf(other) === -1, 'low']);
			}));
			assert(checks.some((c) => c[3] === 'low') && checks.every((c) => c[2]), 'ヒントLv(3) ' + k + ' C-131 の組: 相手は①のスキルと同じ扱い（Lv0〜2 の白の相手は選べる）', checks);
		}
	});

	await block('ヒントLv(4) 種数: A40 の金 ex-0645 と①の Lv2 の白 319（前段）を②に入れても、二重に引かない（見出しの種は②が空のときと同じ・crossPaired 0・重なり 1）', async () => {
		let sp = await openSp({ roster: A40 });
		const a = await read(sp.page, A40);
		await sp.ctx.close();
		const W = '319', G = 'ex-0645';
		const anc = new Set(); const walk = (x) => (PREV.get(x) || []).forEach((p) => { if (!anc.has(p)) { anc.add(p); walk(p); } }); walk(G);
		assert(a.sure.some((x) => x.id === G) && a.sure.some((x) => x.id === W && x.L <= 2) && anc.has(W) && rarity(G) === 'gold' && rarity(W) === 'white', 'ヒントLv(4) 前提: ①で金 ' + G + ' と、その前段の白 ' + W + '（Lv0〜2）を取得', a.sure.filter((x) => x.id === G || x.id === W));
		sp = await openSp({ roster: A40, ids: [W] });
		const b = await read(sp.page, A40);
		assert(b.crossPaired === 0 && b.overlapKinds === 1 && b.factorKinds === a.factorKinds + 1 && b.totalKinds === a.totalKinds, 'ヒントLv(4) ②の帯は +1 種・見出しの種は変わらない（金と前段の白の組を二重に引かない）', { cross: b.crossPaired, o: b.overlapKinds, f: [a.factorKinds, b.factorKinds], t: [a.totalKinds, b.totalKinds] });
		// 見出しの（?）: 種の式に「− 1（①と②の両方にあるため1種に数える）」・「金と下位の白」の項は無い
		await sp.page.click(BAR + '[data-usd-act="set-total-help"]');
		await sp.page.waitForTimeout(300);
		const kf = await sp.page.evaluate(() => (document.querySelector('[data-usd-el="set-total-kinds-formula"]') || {}).textContent || '');
		assert(kf === '種 ＝ ① ' + b.rosterKinds + ' ＋ ② ' + b.factorKinds + ' − 1（①と②の両方にあるため1種に数える）', 'ヒントLv(4) 種の式「種 ＝ ① ' + b.rosterKinds + ' ＋ ② ' + b.factorKinds + ' − 1（①と②の両方にあるため1種に数える）」', kf);
		await sp.ctx.close();
	});

	await block('ヒントLv(5) 見出しの（?）: ●の重なりの文「①で X Pt で数えている「名前」は、因子で得るため Y Pt に置き換えて数えています（差 −Z Pt）」／C-178 の前段の重なり（A40＋230）も行は差・「①と重なり」・帯＝行の和', async () => {
		let sp = await openSp({ roster: M, ids: [AOHARU] });
		await sp.page.click(BAR + '[data-usd-act="set-total-help"]');
		await sp.page.waitForTimeout(300);
		const info = await sp.page.evaluate((id) => ({ name: UmaSkillDeckCore.getSkillName(id), lines: Array.from(document.querySelectorAll('[data-usd-el="set-total-overlap"]')).map((p) => ({ id: p.dataset.skillId, kind: p.dataset.overlap, text: p.textContent })),
			kinds: (document.querySelector('[data-usd-el="set-total-kinds-formula"]') || {}).textContent }), AOHARU);
		await sp.ctx.close();
		assert(info.lines.length === 1 && info.lines[0].id === AOHARU && info.lines[0].kind === 'sure'
			&& info.lines[0].text === '①で 180 Pt で数えている「' + info.name + '」は、因子で得るため 120 Pt に置き換えて数えています（差 −60 Pt）', 'ヒントLv(5) ●の重なりの文（180 → 120・差 −60）', info.lines);
		assert(/ − 1（①と②の両方にあるため1種に数える）$/.test(info.kinds), 'ヒントLv(5) 種の式に「− 1（①と②の両方にあるため1種に数える）」', info.kinds);
		// C-178: A40 ＋ ②「230」（①の前段 Lv0 の白）。変更前は行 90・帯 −72 で合っていなかった → 行も −72
		sp = await openSp({ roster: A40, ids: ['230'] });
		const b = await read(sp.page, A40);
		await sp.page.click(BAR + '[data-usd-act="set-total-help"]');
		await sp.page.waitForTimeout(300);
		const l2 = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="set-total-overlap"]')).map((p) => ({ id: p.dataset.skillId, kind: p.dataset.overlap, text: p.textContent })));
		await sp.ctx.close();
		const row = b.rows.find((r) => r.id === '230');
		assert(!!row && row.pt === '−72 Pt' && row.mark === '①と重なり' && row.overlap === 'prev' && b.commonPt === -72, 'ヒントLv(5) C-178: 前段の重なりの行は「−72 Pt」・「①と重なり」・共通スキルの Pt と一致', { row, common: b.commonPt });
		assert(l2.length === 1 && l2[0].kind === 'prev' && /^①の前段として数えている「.+」162 Pt は、因子で得るため 90 Pt に置き換えて数えています（差 −72 Pt）$/.test(l2[0].text), 'ヒントLv(5) C-178 の（?）の文は今までの形（162 → 90・差 −72）', l2);
		assert(b.overlapKinds === 0 && b.totalKinds === b.rosterKinds + b.factorKinds - b.crossPaired, 'ヒントLv(5) 前段の重なりは見出しの種から引かない（①の種に入っていない）', { o: b.overlapKinds, t: b.totalKinds });
	});

	await block('ヒントLv(6) 脚質オススメ: 逃げの M でアオハル点火・賢の行は灰色でなく、Pt は足したときの差「−60 Pt」／オススメサポの母集団に①の Lv0〜2 の白が入る', async () => {
		const MN = Object.assign({}, M, { skillFilter: { style: 'nige' } });
		const sp = await openSp({ roster: MN, w: 390, h: 844 });
		const a = await read(sp.page, MN);
		assert(a.sure.some((x) => x.id === AOHARU && x.L === 1), 'ヒントLv(6) 前提: 逃げの絞り込みでも①で Lv1 で取得', a.sure.find((x) => x.id === AOHARU));
		await sp.page.click(T + '[data-usd-el="style-open"]');
		await sp.page.waitForSelector(SM + '[data-usd-el="style-row"]');
		await sp.page.waitForTimeout(400);
		const row = await sp.page.evaluate((id) => { const r = document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-row"][data-skill-id="' + id + '"]'); return r ? { state: r.getAttribute('data-state'), reason: r.getAttribute('data-reason'), pt: r.querySelector('[data-usd-el="style-row-pt"]').textContent, dis: r.querySelector('input').disabled } : null; }, AOHARU);
		assert(!!row && row.state !== 'gray' && !row.dis && row.pt === '−60 Pt', 'ヒントLv(6) 脚質オススメの行: 灰色でない・Pt は「−60 Pt」', row);
		const pop = await sp.page.evaluate((r) => { const p = UmaSkillDeckCore.outside.populationOf(Object.assign({ outsideOptions: { exclude: {} } }, r), {}); return { ids: p.ids, taken: p.takenIds }; }, MN);
		const low = lowWhitesOf(a);
		assert(low.length > 0 && low.every((id) => pop.taken.indexOf(id) === -1), 'ヒントLv(6) オススメサポ: ①の Lv0〜2 の白は「①で得る」に入らない', { low, inTaken: low.filter((id) => pop.taken.indexOf(id) !== -1) });
		assert(pop.ids.indexOf(AOHARU) !== -1, 'ヒントLv(6) オススメサポ: アオハル点火・賢は母集団にある', pop.ids.length);
		const fixed = a.sure.filter((x) => low.indexOf(x.id) === -1).map((x) => x.id);
		assert(fixed.every((id) => pop.ids.indexOf(id) === -1), 'ヒントLv(6) オススメサポ: ①のそのほかの取得は母集団に入らない（今のまま）', fixed.filter((id) => pop.ids.indexOf(id) !== -1));
		assert(jsErrors(sp.errors).length === 0, 'ヒントLv(6) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('ヒントLv(7) 見た目: 390・360・1280px で「①と重なり」の行の高さは他の行と同じ・横スクロールなし／狭い幅でも印は名前の横送りの中', async () => {
		for (const w of [1280, 390, 360]) {
			const sp = await openSp({ roster: M, ids: [AOHARU, '1', '3'], w, h: w === 1280 ? 900 : 844 });
			const b = await read(sp.page, M);
			const hs = Array.from(new Set(b.rows.map((r) => r.h)));
			const row = b.rows.find((r) => r.id === AOHARU);
			assert(hs.length === 1 && !b.overflowX && row && row.markInName, 'ヒントLv(7) ' + w + 'px: 行の高さはそろう（' + hs.join(',') + 'px）・横スクロールなし・印は名前の横送りの中', { hs, ov: b.overflowX, row });
			await sp.ctx.close();
		}
	});
}
