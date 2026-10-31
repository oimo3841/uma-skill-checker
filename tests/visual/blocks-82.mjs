// 結合画像の次の直し（T51・2026-10-31 おいもさんの決定。C-258 (4)・C-261。モックは T44・T49・T50 の lab/stitch-next-mock.js）の検査。
// run-smoke.mjs の末尾から register82() で呼ばれる（塊の見出しはすべて「T51結合画像の次の直し」で始まる。`npm run test:visual -- --only=T51結合画像の次の直し` で回せる）。
//
// 決め:
//  (1) 上段の左の欄は「理論値SP」の6行（見出し 20px 太字／「合計 Pt／N種／状態」／「①　本育成編成：N Pt」／「②　因子周回：N Pt」／
//      「・継承固有N種／ヒントLvN含む」（0種は「・継承固有0種」）／「・共通スキルヒントLvN」）。上段の高さ 228。
//  (2) 2行目の合計は 46px 太字。後ろの部分は太字で、いちばん幅の広い見本（99,999・999種・勉強家と切れ者の広いほう）が字に使える幅 396px に入る大きさを
//      26px から 1px ずつ下げて決める（下限 20px）。状態によって変えない。3〜6行目は 23px・行の高さ 34。
//  (3) 値は core の getSetSummary()（setSummaryOf）。継承固有のヒントLv（uniqLevel）と共通スキルのヒントLv（commonLevel）は T51 で core に足した口。写しに入れる（画面の選択欄からは読まない）。
//  (4) 遺伝子（③の「遺伝子」のチェックが入っているとき OCR の対象）: 読めた遺伝子のパネルを②のスキルの枠と同じ求め方・太さ・塗り方で、G1（枠 #BE185D・塗り #FCE7F0）で囲む。
//  (5) 人の見出しの行の右に「名前：★N」（★を測れなければ ★?）を縦に最大3段（18px 太字・1段 21px・遺伝子の色・名前の左に 14×12 の見本・間 6px）。
//      人の列に入らなければ字を縮める（下限 14px）。(6) 「枠の見かた」の最後に「遺伝子」。(7) 遺伝子は帯の Pt・種数・表の行・②の枠の数に数えない。
// 遺伝子の名前は検査の側に書かない（data/aptitude-genes.json を Node 側で読む。恒久ルール1）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register82(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1)).concat(['32', '45']);
	const GENES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'aptitude-genes.json'), 'utf8')).entries.map((e) => e.name);
	const GENE = { frame: [190, 24, 93], tint: [252, 231, 240] };   // #BE185D・#FCE7F0
	const SP = { total: 12321, totalKinds: 106, rosterPt: 8655, factorPt: 3666, statusLabel: '切れ者', uniqKinds: 6, uniqLevel: 3, commonLevel: 5 };

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ roster, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster || null, scope: o.ids ? Object.assign({ skillIds: o.ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }, o.scope || {}) : null });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		if (o.ids && o.ids.length) await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(400);
		await sp.page.evaluate(HELPERS);
		return sp;
	};
	// ページの中の道具: 合成の1人分（blocks-63 の __person と同じ作り）・組み立て・fillText の記録・1画素
	const HELPERS = `
		window.__person = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, H);
			const cols = [[Math.round(W * 0.19), Math.round(W * 0.58)], [Math.round(W * 0.60), Math.round(W * 0.98)]];
			for (let y = 10; y < H - 60; y += 80) cols.forEach(([a, b]) => { g.fillStyle = 'rgb(226,226,226)'; g.fillRect(a, y, b - a, 60); g.fillStyle = 'rgb(90,60,30)'; g.fillRect(a + 2, y + 22, b - a - 4, 14); });
			c._sourcePlacements = []; c._profileHeader = { kept: false, ratio: 0.31, height: 0 }; return c; };
		window.__compose = (o) => composeFamilyImage({ idxs: [0, 1, 2], canvases: o.c, heads: [null, null, null], table: o.table || null, legend: o.legend || null, barText: 'S', top: o.top || null, genes: o.genes || null });
		window.__texts = (fn) => { const t = []; const o = CanvasRenderingContext2D.prototype.fillText;
			CanvasRenderingContext2D.prototype.fillText = function (s) { t.push({ s: String(s), font: this.font, color: this.fillStyle }); return o.apply(this, arguments); };
			try { const v = fn(); return { v, t }; } finally { CanvasRenderingContext2D.prototype.fillText = o; } };
		window.__px = (c, x, y) => Array.from(c.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3));
		window.__top = (sp) => ({ sp: sp, roster: [], factor: [] });
		// 白地の Canvas に、行の位置（geometry）だけを持つ1人分を作る（枠の位置の計算は製品の drawFactorFramesOnPerson のまま）。
		// 行は左の列に3つ（中心 115・215・315・高さ 30）。列は 100・500。名前 names[i] が行 i にある
		window.__framePerson = (names) => {
			const c = document.createElement('canvas'); c.width = 1000; c.height = 600;
			const g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 1000, 600);
			personGeometry[0] = [{ rows: [{ y: 100, h: 30, col: 0 }, { y: 200, h: 30, col: 0 }, { y: 300, h: 30, col: 0 }], columnXs: [100, 500], scale: 1 }];
			personLines[0] = names.map((n, i) => ({ text: n, rowKey: '0:' + i }));
			personResults[0] = { detectedSkills: new Set(names), skillStars: {}, skillSources: Object.fromEntries(names.map((n, i) => [n, [i]])), matchReasons: {} };
			return c; };
	`;
	const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= (tol || 2));

	await block('T51結合画像の次の直し(1) 理論値SP の欄の6行: 見出し「理論値SP」（20px 太字）・切れ者／勉強家／状態なし（「／状態」を付けない）・①②の行に種数なし・継承固有0種は「・継承固有0種」だけ・上段の高さ 228・中段の上端 376', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate((SP) => {
			const L = STITCH_LAYOUT;
			const one = (sp) => { const x = __texts(() => __compose({ c: [__person(1179, 2342), null, null], top: __top(sp) })); const T = x.v._layout.top;
				return { lines: T.sp.lines.slice(), rows: T.sp.lines._rows, h: T.h, y: T.y, bodyY: x.v._layout.bodyY, head: x.t.find((e) => e.s === '理論値SP') }; };
			return { kire: one(SP), ben: one(Object.assign({}, SP, { statusLabel: '勉強家' })), none: one(Object.assign({}, SP, { statusLabel: '' })),
				uniq0: one(Object.assign({}, SP, { uniqKinds: 0 })), H: stitchTopRowH(), midTop: stitchMidTop(stitchTopRowH()), head: STITCH_TOP_HEAD_SP, sepH: L.topHeadH };
		}, SP);
		const tail = ['①　本育成編成：8,655 Pt', '②　因子周回：3,666 Pt', '・継承固有6種／ヒントLv3含む', '・共通スキルヒントLv5'];
		assert(JSON.stringify(r.kire.lines) === JSON.stringify(['12,321 Pt／106種／切れ者'].concat(tail)), 'T51(1): 切れ者の6行（見出しを除く5行）', r.kire.lines);
		assert(JSON.stringify(r.ben.lines) === JSON.stringify(['12,321 Pt／106種／勉強家'].concat(tail)), 'T51(1): 勉強家は「／勉強家」', r.ben.lines);
		assert(JSON.stringify(r.none.lines) === JSON.stringify(['12,321 Pt／106種'].concat(tail)), 'T51(1): 状態なしは「／状態」を付けない', r.none.lines);
		assert(r.uniq0.lines[3] === '・継承固有0種', 'T51(1): 継承固有0種は「・継承固有0種」だけ（ヒントLv を付けない）', r.uniq0.lines);
		assert(![r.kire, r.ben, r.none].some((k) => k.lines.some((s) => /含む|固有スキル/.test(s) && !/^・継承固有/.test(s))) && !r.kire.lines[1].includes('種') && !r.kire.lines[2].includes('種'),
			'T51(1): 「（固有スキル含む）」は付けない・①②の行に種数は出さない', r.kire.lines);
		assert(r.head === '理論値SP' && r.kire.head && /bold 20px/.test(r.kire.head.font), 'T51(1): 見出しは「理論値SP」（20px 太字）', r.kire.head);
		assert(r.H === 228 && r.kire.h === 228 && r.kire.bodyY === 376 && r.midTop === 376, 'T51(1): 上段の高さ 228（34＋6＋52＋34×4）・中段の上端 376', { H: r.H, h: r.kire.h, bodyY: r.kire.bodyY });
		const rows = r.kire.rows;
		assert(rows.length === 5 && rows[0].h === 52 && rows.slice(1).every((x) => x.px === 23 && x.h === 34) && rows[1].top === rows[0].top + 52 && rows[4].top + 34 === r.kire.y + 228,
			'T51(1): 2行目の高さ 52・3〜6行目は 23px・行の高さ 34・最後の行の下端が上段の下端', rows);
		assert(jsErrors(errors).length === 0, 'T51(1): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T51結合画像の次の直し(2) 2行目の字: 合計 46px 太字・後ろの部分は状態で変わらない1つの大きさ（いちばん幅の広い見本が 396px に入る、26px から下げた最大・下限 20px）・はみ出しなし', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate((SP) => {
			const run = (sp) => { const x = __texts(() => __compose({ c: [__person(1179, 2342), null, null], top: __top(sp) })); const T = x.v._layout.top;
				const num = x.t.find((e) => /^[0-9,]+$/.test(e.s)); const tl = x.t.find((e) => /^ Pt／/.test(e.s));
				return { rows: T.sp.lines._rows, numFont: num && num.font, tailFont: tl && tl.font, sp: T.sp }; };
			// 期待値は検査の側で別に測る（同じ字体・同じ見本）
			const c = document.createElement('canvas').getContext('2d');
			c.font = 'bold 46px sans-serif'; const nw = c.measureText('99,999').width;
			const tw = (px) => { c.font = 'bold ' + px + 'px sans-serif'; return Math.max(c.measureText(' Pt／999種／勉強家').width, c.measureText(' Pt／999種／切れ者').width); };
			let want = 26; while (want > 20 && nw + tw(want) > 396) want--;
			return { kire: run(SP), ben: run(Object.assign({}, SP, { statusLabel: '勉強家' })), none: run(Object.assign({}, SP, { statusLabel: '' })),
				widest: run(Object.assign({}, SP, { total: 99999, totalKinds: 999, statusLabel: '勉強家' })), want, widestW: Math.ceil(nw + tw(want)), w26: Math.ceil(nw + tw(26)) };
		}, SP);
		const all = [r.kire, r.ben, r.none, r.widest];
		const px = all.map((k) => k.rows[0].tailPx);
		assert(px.every((v) => v === r.want) && r.want >= 20 && r.want <= 26, 'T51(2): 後ろの部分の字は状態で変わらず、見本が 396px に入る最大の大きさ（26 から下げた値・下限 20）', { px, want: r.want, w26: r.w26 });
		assert(all.every((k) => /bold 46px/.test(k.numFont) && new RegExp('bold ' + r.want + 'px').test(k.tailFont)), 'T51(2): 合計は 46px 太字・後ろの部分は太字', all.map((k) => [k.numFont, k.tailFont]));
		assert(r.widest.rows[0].widestW <= 396 && r.widest.rows[0].width <= 396 && r.widestW <= 396, 'T51(2): いちばん幅の広い見本（99,999 Pt／999種／勉強家）が 396px に入る', { widestW: r.widest.rows[0].widestW, width: r.widest.rows[0].width });
		assert(all.every((k) => k.rows.every((x) => x.width <= 396) && k.sp.w === 400), 'T51(2): どの行も欄（幅 400・字に使える幅 396）からはみ出さない', all.map((k) => k.rows.map((x) => x.width)));
		assert(r.w26 > 396, 'T51(2): 前提: 26px のままでは見本が入らない（縮める決まりの空振りでない）', r.w26);
		assert(jsErrors(errors).length === 0, 'T51(2): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T51結合画像の次の直し(3) 写しの値: 継承固有の種類・ヒントLv と共通スキルのヒントLv は core の getSetSummary（保存したセットの値）を写しに入れる・押した後に画面の値を変えても写しのまま', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS, scope: { parentHintLevel: 2, inheritedUnique: { count: 4, hintLevel: 2 } } });
		const r = await page.evaluate(async () => {
			const sum = deckTemplateManager.getSetSummary();
			const uiUniq = document.querySelector('[data-usd-el="uniq-count"]'), uiLv = document.querySelector('[data-usd-el="uniq-level"]'), uiF = document.querySelector('#deck-scope-host [data-usd-el="pt-parent-level"], [data-usd-el="pt-parent-level"]');
			const snap = captureStitchSnapshot();
			snap.results = [{ detectedSkills: new Set(), skillStars: {}, skillSources: {}, matchReasons: {} }, null, null];
			const keep = { s: window.stitchOnePerson, f: persons[0].files, snap: stitchSnapshot, sum: deckTemplateManager.getSetSummary };
			stitchSnapshot = snap;
			window.stitchOnePerson = async () => __person(1179, 2342);
			persons[0].files = [{ name: 'a.png' }];
			const before = JSON.parse(JSON.stringify(snap.set.sp));
			// 押した後に画面の値が変わる
			deckTemplateManager.getSetSummary = () => Object.assign({}, sum, { uniqKinds: 6, uniqLevel: 5, commonLevel: 1 });
			const built = await buildStitchedSetImage(0, null, true);
			const lines = built._layout.top.sp.lines.slice();
			const noOcr = await buildStitchedSetImage(0, null, false);
			deckTemplateManager.getSetSummary = keep.sum; window.stitchOnePerson = keep.s; persons[0].files = keep.f; stitchSnapshot = keep.snap;
			return { sum: { uniqKinds: sum.uniqKinds, uniqLevel: sum.uniqLevel, commonLevel: sum.commonLevel }, before, lines, noLines: noOcr._layout.top.sp.lines.slice(),
				ui: { uniq: uiUniq && uiUniq.value, lv: uiLv && uiLv.value, f: uiF && uiF.value } };
		});
		assert(r.sum.uniqKinds === 4 && r.sum.uniqLevel === 2 && r.sum.commonLevel === 2, 'T51(3): getSetSummary が保存したセットの継承固有 4種・Lv2・共通スキル Lv2 を返す（core に足した口）', r.sum);
		assert(String(r.ui.uniq) === '4' && String(r.ui.lv) === '2' && String(r.ui.f) === '2', 'T51(3): 前提: 画面の選択欄も同じ値（4種・Lv2・2）', r.ui);
		assert(r.before.uniqKinds === 4 && r.before.uniqLevel === 2 && r.before.commonLevel === 2, 'T51(3): 写しの sp に uniqKinds・uniqLevel・commonLevel が入る', r.before);
		assert(r.lines[3] === '・継承固有4種／ヒントLv2含む' && r.lines[4] === '・共通スキルヒントLv2', 'T51(3): 押した後に画面の値が変わっても、OCR の結合は写しの値のまま', r.lines);
		assert(r.noLines[3] === '・継承固有6種／ヒントLv5含む' && r.noLines[4] === '・共通スキルヒントLv1', 'T51(3): 「OCRしない」結合は結合した時点の値（空振りでない）', r.noLines);
		assert(jsErrors(errors).length === 0, 'T51(3): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T51結合画像の次の直し(4) 遺伝子の枠: ②のスキルの枠と同じ位置・同じ太さで、枠 #BE185D・塗り #FCE7F0（白地は 252,231,240）／遺伝子の枠は②の枠の数に数えない／写しに遺伝子が無い（③の「遺伝子」のチェックなし）なら枠を描かない', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate((G) => {
			const keep = { k: window.deckMarkerKindByName, snap: stitchSnapshot, t: tierMarksEnabled, g: personGeometry[0], l: personLines[0], r: personResults[0] };
			tierMarksEnabled = true;
			const nm = 'X0';
			const run = (kindByName, geneNames, names) => {
				stitchSnapshot = { entries: [], kindByName: kindByName, geneNames: geneNames, results: null };
				const c = __framePerson(names);
				const n = drawFactorFramesOnPerson(c, 0);
				return { n, gene: c._geneFrameCount, span: c._frameSpan || null,
					edge: __px(c, 33, 120), inner: __px(c, 250, 120), edge2: __px(c, 33, 220), inner2: __px(c, 250, 220), outside: __px(c, 20, 120) };
			};
			const gene = run({ [nm]: 'card' }, [G[0]], [G[0], nm]);
			const card = run({ [G[0]]: 'card', [nm]: 'card' }, [], [G[0], nm]);
			const off = run({ [nm]: 'card' }, [], [G[0], nm]);
			const cardColor = factorFrameStyleOf('card');
			window.deckMarkerKindByName = keep.k; stitchSnapshot = keep.snap; tierMarksEnabled = keep.t; personGeometry[0] = keep.g; personLines[0] = keep.l; personResults[0] = keep.r;
			return { gene, card, off, style: factorFrameStyleOf('gene'), cardFrame: cardColor && cardColor.frame, cssGene: getComputedStyle(document.documentElement).getPropertyValue('--uma-mark-gene').trim() };
		}, GENES);
		assert(r.style && r.style.frame === '#BE185D' && r.style.tint === '#FCE7F0' && r.style.marker === null, 'T51(4): 遺伝子の色は G1（枠 #BE185D・塗り #FCE7F0・②のマーカーなし）', r.style);
		assert(near(r.gene.edge, GENE.frame, 0) && near(r.gene.inner, GENE.tint, 1) && !near(r.gene.edge2, GENE.frame, 30), 'T51(4): 遺伝子の行のパネルは枠 #BE185D・内側の白地に #FCE7F0（隣の②の行は②の色）', r.gene);
		assert(JSON.stringify(r.gene.span) === JSON.stringify(r.card.span) && near(r.card.edge, r.gene.edge2, 0) && near(r.gene.outside, [255, 255, 255], 0),
			'T51(4): 枠の位置・太さは②のスキルの枠と同じ（同じ行を②の種類にしたときと左右の端が一致・枠の外は白のまま）', { gene: r.gene.span, card: r.card.span });
		assert(r.gene.n === 1 && r.gene.gene === 1 && r.card.n === 2 && r.card.gene === 0, 'T51(4): 遺伝子の枠は返り値（②の枠の数）に数えず _geneFrameCount に数える', { gene: [r.gene.n, r.gene.gene], card: [r.card.n, r.card.gene] });
		assert(r.off.n === 1 && r.off.gene === 0 && near(r.off.edge, [255, 255, 255], 0) && near(r.off.inner, [255, 255, 255], 0), 'T51(4): 写しに遺伝子が無ければ、遺伝子の行に枠も塗りも描かない', r.off);
		assert(r.cssGene && !/be185d/i.test(r.cssGene), 'T51(4): 画面の --uma-mark-gene は変えない（G1 は結合画像の定数）', r.cssGene);
		assert(jsErrors(errors).length === 0, 'T51(4): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T51結合画像の次の直し(5) 人の見出しの行の遺伝子: 写しの人ごとの結果から「名前：★N」（測れなければ ★?・未検出は並べない）を縦に最大3段・18px 太字・1段 21px・遺伝子の色・名前の左に 14×12 の見本・ラベルとの間 14／4つ以上は★の多い順に3つ', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate((G) => {
			const res = (stars) => ({ detectedSkills: new Set(Object.keys(stars)), skillStars: stars, skillSources: {}, matchReasons: {} });
			const snap = { geneNames: G.slice(), results: [res({ [G[1]]: 2, [G[3]]: null }), res({}), res({ [G[0]]: 1, [G[2]]: 3, [G[4]]: 0, [G[5]]: 2 })] };
			const list0 = stitchGenesOfPerson(snap, 0), list1 = stitchGenesOfPerson(snap, 1), list2 = stitchGenesOfPerson(snap, 2), noGenes = stitchGenesOfPerson(Object.assign({}, snap, { geneNames: [] }), 0);
			const x = __texts(() => __compose({ c: [__person(1179, 2342), __person(1179, 1757), null], genes: [list0, list1, null] }));
			const lay = x.v._layout;
			const h0 = lay.heads.find((h) => h.k === 0);
			const geneTexts = x.t.filter((e) => /：★/.test(e.s));
			const g = h0.genes;
			// 見本（名前の左 14×12）: 中心は塗り、縁は枠の色
			const cy = g.y + g.lineH / 2;
			return { list0, list1, list2, noGenes, g, label: h0.label, geneTexts, h1: lay.heads.find((h) => h.k === 1),
				swIn: __px(x.v, g.x + 7, cy), swEdge: __px(x.v, g.x + 1, cy), textPx: (() => { const d = x.v.getContext('2d').getImageData(g.x + 20, g.y, g.w - 20, g.h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 190) < 20 && Math.abs(d[i + 1] - 24) < 20 && Math.abs(d[i + 2] - 93) < 20) n++; return n; })() };
		}, GENES);
		assert(JSON.stringify(r.list0) === JSON.stringify([{ name: GENES[1], stars: 2 }, { name: GENES[3], stars: null }]) && r.list1.length === 0 && r.noGenes.length === 0,
			'T51(5): 写しの結果から読めた遺伝子だけ（並びは data の順・★を測れなければ null・写しに遺伝子が無ければ空）', { list0: r.list0, list1: r.list1 });
		assert(JSON.stringify(r.list2) === JSON.stringify([{ name: GENES[2], stars: 3 }, { name: GENES[5], stars: 2 }, { name: GENES[0], stars: 1 }]), 'T51(5): 4つ以上なら★の多い順に3つ', r.list2);
		assert(JSON.stringify(r.g.texts) === JSON.stringify([GENES[1] + '：★2', GENES[3] + '：★?']) && r.geneTexts.length === 2 && r.geneTexts.every((e) => /bold 18px/.test(e.font) && /^#be185d$/i.test(e.color)),
			'T51(5): 「名前：★N」「名前：★?」を 18px 太字・遺伝子の色で', { texts: r.g.texts, t: r.geneTexts });
		assert(r.g.font === 18 && r.g.lineH === 21 && r.g.h === 42 && r.g.x === r.label.x + r.label.w + 14 && r.g.fits, 'T51(5): 1段 21px・2段で高さ 42・ラベルの右 14px から', r.g);
		assert(near(r.swIn, GENE.tint, 1) && near(r.swEdge, GENE.frame, 2) && r.textPx > 50, 'T51(5): 名前の左に見本（塗り #FCE7F0・枠 #BE185D）・字は遺伝子の色', { swIn: r.swIn, swEdge: r.swEdge, textPx: r.textPx });
		assert(r.h1 && !r.h1.genes, 'T51(5): 遺伝子の無い人の見出しの行には何も足さない', r.h1);
		assert(jsErrors(errors).length === 0, 'T51(5): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T51結合画像の次の直し(6) 遺伝子の字を縮める: 人の列（右端＝人の画像の右端）に入らなければ 18px から下げる（下限 14px。入らなくても 14px より小さくしない）', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate((G) => {
			const list = [{ name: G[0], stars: 3 }, { name: G[1], stars: null }, { name: G[2], stars: 1 }];
			const c = document.createElement('canvas'); c.width = 2000; c.height = 200; const g = c.getContext('2d');
			const free = stitchDrawPersonGenes(g, 100, 10, list, Infinity);
			const mid = stitchDrawPersonGenes(g, 100, 10, list, 100 + Math.floor(free.w * 16 / 18));
			const tight = stitchDrawPersonGenes(g, 100, 10, list, 120);
			// 組み立ての中: 細い人（人の列が狭い）
			const lay = __compose({ c: [__person(230, 2342), null, null], genes: [list, null, null] })._layout;
			const p = lay.persons[0], h = lay.heads[0];
			return { free, mid, tight, narrow: h.genes, pRight: p.x + p.w };
		}, GENES);
		assert(r.free.font === 18 && r.free.texts.length === 3 && r.free.h === 63, 'T51(6): 入るときは 18px・3段で高さ 63', r.free);
		assert(r.mid.font < 18 && r.mid.font >= 14 && r.mid.fits && r.mid.w <= r.mid.room, 'T51(6): 入らなければ字を縮めて入れる', r.mid);
		assert(r.tight.font === 14 && !r.tight.fits, 'T51(6): どうしても入らなければ下限 14px のまま（それ以上縮めない）', r.tight);
		assert(r.narrow && r.narrow.room === r.pRight - r.narrow.x && r.narrow.font < 18 && r.narrow.font >= 14 && r.free.w > r.narrow.room, 'T51(6): 組み立てでは人の画像の右端までを人の列として字を縮める', { narrow: r.narrow, pRight: r.pRight });
		assert(jsErrors(errors).length === 0, 'T51(6): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T51結合画像の次の直し(7) 「枠の見かた」の最後に「遺伝子」（枠と塗りの見本だけ。②のマーカーなし）・高さ 40 の1行のまま', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate(() => {
			const x = __texts(() => buildFactorFrameLegendBar(STITCH_LAYOUT.legendMaxW, STITCH_LAYOUT.legendRef, true));
			const c = x.v, d = c._fontSize;
			const last = x.t[x.t.length - 1];
			// 「遺伝子」の字の左に見本（幅 1.5 文字・高さ 0.86 文字）。見本の中は塗り（パネルの灰 226 に掛けた色）、縁は枠の色
			const g = c.getContext('2d');
			let sx = -1;
			const row = g.getImageData(0, Math.round(c.height / 2), c.width, 1).data;
			for (let i = 0; i < c.width; i++) { const p = [row[i * 4], row[i * 4 + 1], row[i * 4 + 2]]; if (Math.abs(p[0] - 190) < 6 && Math.abs(p[1] - 24) < 6 && Math.abs(p[2] - 93) < 6) { sx = i; break; } }
			const inner = sx >= 0 ? __px(c, sx + d * 0.75, c.height / 2) : null;
			return { texts: x.t.map((e) => e.s), last, h: c.height, w: c.width, d, sx, inner, off: buildFactorFrameLegendBar(1600, 450, false) };
		});
		const panel = GENE.tint.map((v) => Math.round(226 * v / 255));
		assert(r.texts[r.texts.length - 1] === ' 遺伝子' && r.texts.length === 5 && r.h === 40, 'T51(7): 最後の項目は「遺伝子」・行の高さ 40', r.texts);
		assert(r.sx > 0 && r.inner && near(r.inner, panel, 2), 'T51(7): 「遺伝子」の見本は枠 #BE185D と塗り（パネルの灰に #FCE7F0 を掛けた色）', { sx: r.sx, inner: r.inner, panel });
		assert(r.off === null, 'T51(7): 枠も表も無いときは今までどおり行を置かない', r.off);
		assert(jsErrors(errors).length === 0, 'T51(7): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T51結合画像の次の直し(8) 遺伝子は数えない: ③の「遺伝子」のチェックを入れても帯の合計の Pt・種数・表の行（因子周回スキル）は変わらない・写しの遺伝子は data の10種', async () => {
		const read = async (scopes) => {
			const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS, scope: scopes ? { scopes } : {} });
			const r = await page.evaluate(() => { const s = deckTemplateManager.getSetSummary(); const snap = captureStitchSnapshot();
				return { total: s.total, kinds: s.totalKinds, factorPt: s.factorPt, factorKinds: s.factorKinds, entries: snap.entries.length, genes: snap.geneNames.slice(),
					bar: document.querySelector('#deck-set-bar [data-usd-el="set-total"]').getAttribute('data-kinds') }; });
			const e = jsErrors(errors);
			await ctx.close();
			return Object.assign(r, { errors: e });
		};
		const off = await read(null), on = await read({ genes: true });
		assert(JSON.stringify(on.genes) === JSON.stringify(GENES) && off.genes.length === 0, 'T51(8): 写しの遺伝子は、チェックを入れたときだけ data の10種（並びも data の順）', { on: on.genes, off: off.genes });
		assert(on.total === off.total && on.kinds === off.kinds && on.factorPt === off.factorPt && on.factorKinds === off.factorKinds && on.bar === off.bar && on.entries === off.entries && on.entries === IDS.length,
			'T51(8): 遺伝子を対象にしても帯の Pt・種数・②の数・表の行は同じ', { on, off });
		assert(on.errors.length === 0 && off.errors.length === 0, 'T51(8): コンソールエラー0', on.errors.concat(off.errors).slice(0, 3));
	});

	await block('T51結合画像の次の直し(9) 実際の組み立て（buildStitchedSetImage）: 遺伝子があれば枠と見出しの行の「名前：★N」・凡例の「遺伝子」／写しに遺伝子が無ければどれも描かない／「OCRしない」結合は描かない／旧UI（写しにセットなし）は上段なし', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS });
		const r = await page.evaluate(async (G) => {
			const keep = { s: window.stitchOnePerson, f: persons[0].files, snap: stitchSnapshot, t: tierMarksEnabled, g: personGeometry[0], l: personLines[0], r: personResults[0] };
			tierMarksEnabled = true;
			// __person(1179, 2342) のパネルの行（左の列 0.19W・右の列 0.60W・y = 10 + 80k・高さ 60）を OCR の行として持たせる
			const W = 1179, H = 2342;
			const rows = []; for (let y = 10, k = 0; y < H - 60; y += 80, k++) { rows.push({ y: y, h: 60, col: 0 }); rows.push({ y: y, h: 60, col: 1 }); }
			const geo = [{ rows: rows, columnXs: [Math.round(W * 0.19) + 50, Math.round(W * 0.60) + 50], scale: 1 }];
			const lines = [{ text: G[1], rowKey: '0:2' }];
			const res = { detectedSkills: new Set([G[1]]), skillStars: { [G[1]]: 3 }, skillSources: { [G[1]]: [0] }, matchReasons: {} };
			const snapOf = (geneNames, set) => Object.assign(captureStitchSnapshot(), { geneNames: geneNames, results: [res, null, null] }, set === undefined ? {} : { set: set });
			const build = async (snap, withMarks) => {
				stitchSnapshot = snap; personGeometry[0] = geo; personLines[0] = lines; personResults[0] = res;
				window.stitchOnePerson = async () => __person(W, H);
				persons[0].files = [{ name: 'a.png' }];
				const t = []; const o = CanvasRenderingContext2D.prototype.fillText;
				CanvasRenderingContext2D.prototype.fillText = function (s) { t.push(String(s)); return o.apply(this, arguments); };
				let c; try { c = await buildStitchedSetImage(0, null, withMarks); } finally { CanvasRenderingContext2D.prototype.fillText = o; }
				const L = c._layout;
				return { gene: c._geneFrameCount, mark: c._markCount, head: L.heads[0].genes || null, legend: !!L.legend, gTexts: t.filter((s) => /：★/.test(s)), hasLegendGene: t.includes(' 遺伝子'), top: !!L.top,
					rows: L.table ? L.table.rows : -1, H: L.height };
			};
			const on = await build(snapOf([G[1]]), true);
			const off = await build(snapOf([]), true);
			const noOcr = await build(snapOf([G[1]]), false);
			const legacy = await build(Object.assign(snapOf([G[1]], null), { entries: [] }), true);
			window.stitchOnePerson = keep.s; persons[0].files = keep.f; stitchSnapshot = keep.snap; tierMarksEnabled = keep.t; personGeometry[0] = keep.g; personLines[0] = keep.l; personResults[0] = keep.r;
			return { on, off, noOcr, legacy };
		}, GENES);
		assert(r.on.gene === 1 && r.on.mark === 0 && r.on.head && JSON.stringify(r.on.head.texts) === JSON.stringify([GENES[1] + '：★3']) && r.on.hasLegendGene && r.on.legend,
			'T51(9): 写しに遺伝子があれば、枠1つ（②の枠の数は0のまま）・見出しの行に「名前：★3」・凡例に「遺伝子」', r.on);
		assert(r.on.rows === IDS.length && r.off.rows === IDS.length, 'T51(9): 表の行は②の因子周回スキルだけ（遺伝子を入れない）', [r.on.rows, r.off.rows]);
		assert(r.off.gene === 0 && !r.off.head && r.off.gTexts.length === 0, 'T51(9): 写しに遺伝子が無ければ（チェックなし）枠も「名前：★N」も描かない', r.off);
		assert(r.noOcr.gene === 0 && !r.noOcr.head && !r.noOcr.legend, 'T51(9): 「OCRしない」結合は遺伝子を描かない（枠・見出し・凡例なし）', r.noOcr);
		assert(!r.legacy.top && r.legacy.rows === -1, 'T51(9): 旧UI（写しにセットなし・行なし）は上段なし・表なし', r.legacy);
		assert(r.on.top && r.on.H === r.off.H, 'T51(9): 上段あり・遺伝子の有無で画像の高さは変わらない', [r.on.H, r.off.H]);
		assert(jsErrors(errors).length === 0, 'T51(9): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});
}
