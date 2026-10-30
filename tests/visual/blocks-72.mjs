// 合計の式の小窓（帯のセット名の右の ?。C-246・2026-10-30）の検査。
// run-smoke.mjs の末尾から register72() で呼ばれる（塊の見出しはすべて「合計の小窓」で始まる。`npm run test:visual -- --only=合計の小窓` で回せる）。
//
// 決め（おいもさん・2026-10-30）:
//  (1) 種の式の「− K（①と②の両方にあるため1種に数える）」の括弧を「− K（①と②の両方にあるスキル：K種）」にする。K の数え方（①で取得する低い Lv の白＝重なりが sure）は変えない。
//  (2) 式の行の下に「①と②の両方にあるスキル：名前、名前、…」の1行。名前は文字だけ（押せない・下線なし）・並びは②の並び・①の状態（◎／○）で出す。
//      K が0なら括弧も名前の行も出さない。①の前段との重なり（K に入らない）は一覧に入れない。
//  (3) 「①で X Pt で数えている「名前」は、因子で得るため Y Pt に置き換えて数えています（差 −Z Pt）」と「①の前段として数えている「名前」X Pt は、…」の行（最大5行＋「ほか N 種」）は削除。
//  (4) 金と下位の白の括弧（C）と「合計 ＝ ① X ＋ ② Y」の行は変えない。
// スキル名は検査の側に書かない（恒久ルール1。id で書き、名前はデータから引く）。
// 編成 A は C-242・C-245 の塊（blocks-68・blocks-71）と同じ実データ（uma-0179＋6枚・切れ者・共通スキルのヒントLv 3）。

import { reloadReady } from './lib/page-ready.mjs';
import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';

export async function register72(env) {
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
	const BAR = '#deck-set-bar ';
	const POP = '[data-usd-el="info-pop"]:not([hidden])';
	const ST = 'kire', F = 3;
	const A = { umaId: 'uma-0179', cardIds: ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'], pt: { status: ST } };
	const IDS = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417', '125', '124', '6', '27', '33', '230', '16', '23', '147', '117', '118', '145'];
	// 左回り○（①で取得する Lv0〜2 の白。①で◎に上げている）・右回り○（①に無い。②独自）・折れない心（①の前段。K に入らない）
	const HIDARI = '2', HIDARI_UP = 'ex-0535', MIGI = '1', ORENAI = '230';

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ roster, ids, F, theme }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: F }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: o.roster || A, ids: o.ids || IDS, F, theme: o.theme || 'light' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(400);
		return sp;
	};
	/** セットの数字と、②のパネルの行（カード一覧の並び・出ている名前）と、重なりの種類（core の st.overlap） */
	const readSet = (page) => page.evaluate(() => {
		const sum = deckTemplateManager.getSetSummary();
		const rows = Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="selected-list"] .usd-panel[data-skill-id]'))
			.map((p) => ({ id: p.dataset.skillId, name: (p.querySelector('.usd-panel-namebtn') || {}).textContent || null }));
		const overlap = sum && sum.st && sum.st.overlap ? Array.from(sum.st.overlap.entries()) : [];
		return { rosterKinds: sum.rosterKinds, factorKinds: sum.factorKinds, crossPaired: sum.crossPaired, overlapKinds: sum.overlapKinds,
			rosterPt: sum.rosterPt, factorPt: sum.factorPt, rows, overlap };
	});
	const openHelp = async (page) => {
		await page.click(BAR + '[data-usd-act="set-total-help"]');
		await page.waitForSelector(POP, { timeout: 5000 });
		await page.waitForTimeout(200);
		return page.evaluate((POP) => {
			const pop = document.querySelector(POP);
			const t = (s) => { const e = pop.querySelector(s); return e ? e.textContent : null; };
			const nm = pop.querySelector('[data-usd-el="set-total-overlap-names"]');
			const cs = nm ? getComputedStyle(nm) : null;
			return { text: pop.textContent, pt: t('[data-usd-el="set-total-formula"]'), kinds: t('[data-usd-el="set-total-kinds-formula"]'),
				names: pop.querySelectorAll('[data-usd-el="set-total-overlap-names"]').length, namesText: nm ? nm.textContent : null,
				old: pop.querySelectorAll('[data-usd-el="set-total-overlap"], [data-usd-el="set-total-overlap-more"]').length,
				// 文字だけ: 中に押せる部品・説明の小窓の印が無い・下線なし・矢印のカーソルでない
				namesPlain: nm ? (nm.querySelectorAll('button, a, [data-usd-info], [role="button"], [tabindex]').length === 0 && !nm.hasAttribute('data-usd-info') && !nm.hasAttribute('tabindex')
					&& !/underline/.test(cs.textDecorationLine) && cs.cursor !== 'pointer') : null,
				order: Array.from(pop.querySelectorAll('.usd-info-body p, p')).filter((p) => pop.contains(p)).map((p) => p.getAttribute('data-usd-el')) };
		}, POP);
	};
	const closePop = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
	const LIST = '①と②の両方にあるスキル：';

	await block('合計の小窓(1) 実データの編成 A: 種の式の括弧は「− K（①と②の両方にあるスキル：K種）」・名前の行は K 個・②の並び・②の行の名前と同じ・合計の式は変わらない', async () => {
		const sp = await openSp();
		const s = await readSet(sp.page);
		const sure = s.overlap.filter(([, k]) => k === 'sure').map(([id]) => id);
		assert(s.overlapKinds >= 2 && s.overlapKinds === sure.length, '合計の小窓(1) 前提: 編成 A の②に①と重なる白（sure）が2つ以上・K は sure の数', { K: s.overlapKinds, sure });
		const h = await openHelp(sp.page);
		const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		assert(h.pt === '合計 ＝ ① ' + fmt(s.rosterPt) + ' ＋ ② ' + fmt(s.factorPt), '合計の小窓(1) 「合計 ＝ ① X ＋ ② Y」は今のまま', h.pt);
		const c = s.crossPaired > 0 ? ' − ' + s.crossPaired + '（金+白で1種）' : '';
		const want = '種 ＝ ① ' + s.rosterKinds + ' ＋ ② ' + s.factorKinds + c + ' − ' + s.overlapKinds + '（①と②の両方にあるスキル：' + s.overlapKinds + '種）';
		assert(h.kinds === want, '合計の小窓(1) 種の式「' + want + '」', h.kinds);
		assert(h.names === 1 && h.namesText.startsWith(LIST), '合計の小窓(1) 式の下に名前の行が1行', h);
		const names = h.namesText.slice(LIST.length).split('、');
		// ②のパネル（カード一覧）の並びで、K の行の名前（②の行に出ている名前＝①の状態）を拾ったもの
		const exp = s.rows.filter((r) => sure.includes(r.id)).map((r) => r.name);
		assert(names.length === s.overlapKinds && JSON.stringify(names) === JSON.stringify(exp), '合計の小窓(1) 名前の数は K と一致・②の並び・②の行の名前と同じ（読点「、」区切り）', { names, exp });
		assert(h.order.indexOf('set-total-overlap-names') === h.order.indexOf('set-total-kinds-formula') + 1, '合計の小窓(1) 名前の行は種の式の行のすぐ下', h.order);
		assert(jsErrors(sp.errors).length === 0, '合計の小窓(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('合計の小窓(2) 名前は文字だけ（押せる部品なし・下線なし・押しても小窓は変わらない）／削除した2種類の文（置き換えて数えています・前段として数えている・ほか N 種）は出ない', async () => {
		const sp = await openSp();
		const h = await openHelp(sp.page);
		assert(h.namesPlain === true, '合計の小窓(2) 名前の行に押せる部品・説明の小窓の印・下線・指のカーソルが無い', h);
		assert(h.old === 0 && !/置き換えて数えています|前段として数えている|ほか \d+ 種|両方にあるため/.test(h.text), '合計の小窓(2) 削除した文・古い括弧の文面は出ない', h.text);
		// 名前の行を押しても、合計の小窓のまま（説明の小窓に置き換わらない）
		const box = await sp.page.locator(POP + ' [data-usd-el="set-total-overlap-names"]').boundingBox();
		await sp.page.mouse.click(box.x + 4 * 13 + 40, box.y + box.height / 2);
		await sp.page.waitForTimeout(300);
		const after = await sp.page.evaluate((POP) => { const p = document.querySelector(POP); return p ? { names: !!p.querySelector('[data-usd-el="set-total-overlap-names"]'), formula: !!p.querySelector('[data-usd-el="set-total-kinds-formula"]') } : null; }, POP);
		assert(!!after && after.names && after.formula, '合計の小窓(2) 名前を押しても合計の小窓のまま', after);
		await sp.ctx.close();
	});

	await block('合計の小窓(3) K が0のとき（②に①と重ならない白だけ）: 種の式に K の括弧も名前の行も出ない', async () => {
		const sp = await openSp({ ids: [MIGI] });
		const s = await readSet(sp.page);
		assert(s.overlapKinds === 0, '合計の小窓(3) 前提: K＝0', s.overlapKinds);
		const h = await openHelp(sp.page);
		assert(!/両方にある/.test(h.kinds || '') && h.names === 0 && h.old === 0, '合計の小窓(3) 括弧・名前の行・削除した文は出ない', h);
		const c = s.crossPaired > 0 ? ' − ' + s.crossPaired + '（金+白で1種）' : '';
		assert(h.kinds === '種 ＝ ① ' + s.rosterKinds + ' ＋ ② ' + s.factorKinds + c, '合計の小窓(3) 種の式は「種 ＝ ① N ＋ ② M」（C の括弧は今のまま）', h.kinds);
		await sp.ctx.close();
	});

	await block('合計の小窓(4) ①が◎の行は名前が◎（左回り）・①で○に戻すと○／①の前段との重なり（折れない心）は一覧に入らない', async () => {
		assert(isPrevOf(HIDARI_UP, HIDARI), '合計の小窓(4) 前提: 左回り◎は左回り○の上位（ステップアップのデータ）');
		let sp = await openSp();
		let s = await readSet(sp.page);
		const kinds = new Map(s.overlap);
		assert(kinds.get(HIDARI) === 'sure' && kinds.get(ORENAI) === 'prev', '合計の小窓(4) 前提: 左回り○は K（sure）・折れない心は前段の重なり（prev）', { h: kinds.get(HIDARI), o: kinds.get(ORENAI) });
		let h = await openHelp(sp.page);
		let names = h.namesText.slice(LIST.length).split('、');
		assert(names.includes(N(HIDARI_UP)) && !names.includes(N(HIDARI)), '合計の小窓(4) ①が◎: 名前の行は左回り◎（○の名前は出ない）', names);
		assert(!names.includes(N(ORENAI)) && names.length === s.overlapKinds, '合計の小窓(4) 折れない心（前段の重なり）は名前の行に入らない・名前の数は K', { names, K: s.overlapKinds });
		await sp.ctx.close();
		// ①で○に戻した保存（①の keepCircleIds）で開くと○
		sp = await openSp({ roster: Object.assign({}, A, { keepCircleIds: [HIDARI] }) });
		s = await readSet(sp.page);
		h = await openHelp(sp.page);
		names = h.namesText.slice(LIST.length).split('、');
		assert(names.includes(N(HIDARI)) && !names.includes(N(HIDARI_UP)) && names.length === s.overlapKinds, '合計の小窓(4) ①が○: 名前の行は左回り○・数は K のまま', names);
		await sp.ctx.close();
	});

	await block('合計の小窓(5) 375px・320px: 名前の行は折り返し、小窓・ページに横スクロールなし・エラー0', async () => {
		for (const [w, hgt] of [[375, 812], [320, 568]]) {
			const sp = await openSp({ w, h: hgt });
			await openHelp(sp.page);
			const m = await sp.page.evaluate((POP) => {
				const pop = document.querySelector(POP);
				const nm = pop.querySelector('[data-usd-el="set-total-overlap-names"]');
				const lh = parseFloat(getComputedStyle(nm).lineHeight) || 20;
				const over = (e) => e.scrollWidth > e.clientWidth + 1;
				return { lines: Math.round(nm.getBoundingClientRect().height / lh), popOver: over(pop) || Array.from(pop.querySelectorAll('*')).some((e) => e.clientWidth > 0 && over(e) && getComputedStyle(e).overflowX !== 'visible'),
					right: nm.getBoundingClientRect().right, popRight: pop.getBoundingClientRect().right, pageOver: document.documentElement.scrollWidth > innerWidth + 1 };
			}, POP);
			assert(m.lines >= 2 && !m.popOver && !m.pageOver && m.right <= m.popRight + 0.5, '合計の小窓(5) ' + w + 'px: 名前の行は折り返し（' + m.lines + '行）・横スクロールなし', m);
			assert(jsErrors(sp.errors).length === 0, '合計の小窓(5) ' + w + 'px コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('合計の小窓(6) ライト・ダーク: 小窓の文字（式・名前の行）のコントラスト 4.5 以上', async () => {
		for (const theme of ['light', 'dark']) {
			const sp = await openSp({ w: 375, h: 812, theme });
			await openHelp(sp.page);
			const c = await sp.page.evaluate(scanTextContrastInPage, POP);
			const nm = await sp.page.evaluate(scanTextContrastInPage, POP + ' [data-usd-el="set-total-overlap-names"]');
			assert(c.checked >= 3 && c.bad.length === 0 && c.undecided.length === 0, '合計の小窓(6) ' + theme + ': 小窓の文字のコントラスト 4.5 以上（' + c.checked + '要素）', formatContrast(c.bad).slice(0, 4));
			assert(nm.checked >= 1 && nm.bad.length === 0, '合計の小窓(6) ' + theme + ': 名前の行も測っている', nm);
			await sp.ctx.close();
		}
	});
}
