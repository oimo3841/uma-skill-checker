// ②因子周回 段6 結合画像の構成（C-228・2026-10-29。T36 で中段を作り直した）の検査。run-smoke.mjs の末尾から register63() で呼ばれる
// （塊の見出しはすべて「結合画像の構成」で始まる。`npm run test:visual -- --only=結合画像の構成` で回せる）。
//
// 決め（おいもさん・Step 0 の D1〜D12。T36 で T30〜T32・T34 の回答に置き換えた部分は「T36」と書く）:
//  ・親A の家系で1枚・親B の家系で1枚。最上段にタイトルのバー（全幅・高さ70・両端が丸い・ゲームの「ウマ娘詳細」の帯の色・白い文字「セット名｜レース条件」）。
//  ・T36: 中段は 左から 表 → 親 → 祖1 → 祖2。3人の高さをそろえ、祖の縮小率は親の縮小率を超えない。親の幅に上限なし。全体の幅の下限 2206。
//    継承画面の上部（ステータス）は置かない。人の画像は両側を削る（パネルの範囲を画像から見つける。見つからなければ削らない）。
//    人の上に見出しの行（顔のアイコン 64px＋ラベル。因子一覧の画面はラベルだけ）。
//  ・表: 行＝因子周回スキル（既定の並び）・列＝親・祖1・祖2・合計・最下行＝種数。★0 は 0、★を数えられない行は「?」。人がいない列は「（画像なし）」「−」。
//    T36: 幅は内容に見合う幅。行は全部描く（合計0 も消さない）。行の高さ 26〜40（40行を超えれば 16 まで縮める）。入らなければ中段を高くする。
//    画像の画素数の上限（16,000,000）に届くときは高くせず、行を 16 より小さくする。字は行の高さに合わせる（下限なし）。
//  ・ヒートマップは青の濃淡（#F3F5F8／#C9DCEE／#6F9FD0／#1F4E85。合計は同じ帯で 0〜9）。
//  ・T36: 枠の見かたは1行で、親の左端の下から（表の列は下まで使う）。断りの文なし。
//  ・画像に描く文字列に「①」「②」「③」を使わない（②は「因子周回スキル」）。OCR を押した時点の写しから描く。
// test-images（Git の外。worktree ではメインから写す）の実画像も使う。無ければ NG（空振りにしない）。スキル名は検査の側に書かない（恒久ルール1）。

import { reloadReady } from './lib/page-ready.mjs';
export async function register63(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1)).concat(['32', '45']);
	const TI = path.join(REPO_ROOT, 'test-images');
	const imgs = (c) => { const d = path.join(TI, c); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /\.png$/i.test(f)).sort().map((f) => '/test-images/' + c + '/' + f) : []; };
	const CASES = { pc976: '2026-09-15_3', ph1179: '2026-09-16_1', own765: '2026-09-17_1', list1170: '2026-09-26_1', list1170b: '2026-09-26_3', ph1179b: '2026-09-15_5', ph1179c: '2026-09-15_6' };
	const haveImages = Object.values(CASES).every((c) => imgs(c).length >= 2);

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, o.userData || EMPTY);
		await sp.page.evaluate(({ roster, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster || null, scope: o.ids ? { skillIds: o.ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 } : null });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		if (o.ids && o.ids.length) await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(400);
		return sp;
	};
	// ページの中: URL の画像を File の配列に
	const FILES_JS = `window.__filesOf = async (urls) => { const out = []; for (const u of urls) { const b = await (await fetch(u)).blob(); out.push(new File([b], u.split('/').pop(), { type: 'image/png' })); } return out; };`;
	// ページの中: 合成の1人分（幅 W・高さ H。地は 242 の灰。左の帯にアイコンの代わりの色の塊、右に2列のパネル〔灰 226＋濃い字の帯〕）。
	// パネルの横の範囲（整数 px）: 左 0.19〜0.58 W・右 0.60〜0.98 W（間 0.02 W はつながる）。opts.oneColumn なら左の列だけ（幅の 39%）
	const SYNTH_PERSON = `window.__person = (W, H, icon, opts) => { const o = opts || {}; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, H);
		const cols = [[Math.round(W * 0.19), Math.round(W * 0.58)]].concat(o.oneColumn ? [] : [[Math.round(W * 0.60), Math.round(W * 0.98)]]);
		if (!o.blank) for (let y = 10; y < H - 60; y += 80) cols.forEach(([a, b]) => { g.fillStyle = 'rgb(226,226,226)'; g.fillRect(a, y, b - a, 60); g.fillStyle = 'rgb(90,60,30)'; g.fillRect(a + 2, y + 22, b - a - 4, 14); });
		if (icon) { g.fillStyle = 'rgb(200,120,40)'; g.fillRect(icon.x0, icon.y0, icon.x1 - icon.x0 + 1, icon.y1 - icon.y0 + 1); }
		c._sourcePlacements = []; c._profileHeader = { kept: false, ratio: 0.31, height: 0 }; c._cols = cols; return c; };`;
	const SNAP_OF = `window.__snap = (n, results, kinds, nameOf) => { const entries = Array.from({ length: n }, (_, i) => ({ id: 's' + i, name: nameOf ? nameOf(i) : 'N' + i }));
		const kindByName = {}; entries.forEach((e, i) => { kindByName[e.name] = kinds ? kinds[i % kinds.length] : 'other'; });
		return { entries, kindByName, setName: 'S', raceLabels: [], results }; };
		window.__res = (stars) => ({ detectedSkills: new Set(Object.keys(stars)), skillStars: Object.fromEntries(Object.entries(stars)), skillSources: {}, matchReasons: {} });
		window.__compose = (o) => composeFamilyImage({ idxs: [0, 1, 2], canvases: o.c, heads: o.heads || [null, null, null], table: o.table || null, legend: o.legend || null, barText: o.bar || '' });
		window.__icon = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = 'rgb(200,120,40)'; g.fillRect(0, 0, w, h); return c; };`;
	const prep = async (page) => { await page.evaluate(FILES_JS); await page.evaluate(SYNTH_PERSON); await page.evaluate(SNAP_OF); };
	// ページの中: 実画像の1人分を OCR の行の位置（detectSkillRows）で枠を描ける状態にして結合する（(1) と (10) が使う）
	const FRAMED_JS = `window.__framed = async (list) => {
		const fl = await __filesOf(list);
		const geometry = [], lines = [];
		for (let i = 0; i < fl.length; i++) {
			const img = await loadImage(fl[i]);
			const base = toBaseCanvas(img);
			const det = detectSkillRows(base, []);
			geometry.push({ rows: det ? det.rows : null, columnXs: det ? det.columnXs : null, scale: img.naturalWidth / base.width });
			if (det) det.rows.forEach((row, ri) => lines.push({ text: 'S' + i + ':' + ri, rowKey: i + ':' + ri }));
		}
		const kind = {}; lines.forEach((l) => { kind[l.text] = 'card'; });
		const keep = { k: window.deckMarkerKindByName, snap: stitchSnapshot, g: personGeometry[0], l: personLines[0], r: personResults[0], t: tierMarksEnabled };
		const restore = () => { window.deckMarkerKindByName = keep.k; stitchSnapshot = keep.snap; personGeometry[0] = keep.g; personLines[0] = keep.l; personResults[0] = keep.r; tierMarksEnabled = keep.t; };
		stitchSnapshot = null; tierMarksEnabled = true;
		window.deckMarkerKindByName = () => kind;
		personGeometry[0] = geometry; personLines[0] = lines;
		personResults[0] = { detectedSkills: new Set(lines.map((l) => l.text)), skillSources: Object.fromEntries(lines.map((l, i) => [l.text, [i]])), skillStars: {}, matchReasons: {} };
		const c = await stitchOnePerson(fl, 'x');
		return { c, restore };
	};`;

	// T36: 継承画面の上部の切り出し（旧(1)(2)）は無くなった。代わりに両側を削る範囲を見る。
	// 期待値は T34 の §5 の表（T32 の detectPanelRange〔製品とは別の写し〕で、製品の stitchOnePerson の結合に当てて測った値）
	await block('結合画像の構成(1) 両側を削る範囲: 継承画面3サイズ（976・1179・765）で左 18.6〜18.7%・右 95.7%／因子一覧は左 4.2%（ほとんど削れない）・右 95.7%／OCR の枠（パネルの縁）は削る範囲の内側', async () => {
		assert(haveImages, '結合画像の構成(1): 前提: test-images に素材がある（worktree ではメインの test-images を写す）', Object.values(CASES).map((c) => c + ':' + imgs(c).length));
		if (!haveImages) return;
		const { ctx, page, errors } = await openSp();
		await prep(page);
		await page.evaluate(FRAMED_JS);
		const r = await page.evaluate(async (u) => {
			const out = {};
			for (const [k, list] of Object.entries(u)) {
				const { c, restore } = await __framed(list);
				const icon = stitchPersonIconBox(c);
				const before = stitchPanelRange(c, icon);   // 枠を描く前（_frameSpan なし）
				const n = drawFactorFramesOnPerson(c, 0);
				restore();
				const after = stitchPanelRange(c, icon);    // 枠を描いた後（枠の位置で確かめる）
				const cropped = stitchSideCrop(c, icon);
				out[k] = { W: c.width, kept: !!(icon && icon.kept), before, after, frames: n, span: c._frameSpan || null, cw: cropped.width, sameCanvas: cropped === c };
			}
			return out;
		}, { pc976: imgs(CASES.pc976), ph1179: imgs(CASES.ph1179), ph1179b: imgs(CASES.ph1179b), ph1179c: imgs(CASES.ph1179c), own765: imgs(CASES.own765), list1170: imgs(CASES.list1170), list1170b: imgs(CASES.list1170b) });
		const WANT = { pc976: [182, 934], ph1179: [220, 1128], ph1179b: [220, 1128], ph1179c: [220, 1128], own765: [142, 732], list1170: [49, 1120], list1170b: [49, 1120] };
		Object.entries(WANT).forEach(([k, [l, rr]]) => {
			const x = r[k];
			assert(x.before.ok && Math.abs(x.before.L - l) <= 2 && Math.abs(x.before.R - rr) <= 2, '結合画像の構成(1): ' + k + '（' + x.W + '幅）の削る範囲が T34 の実測どおり（左 ' + l + '・右 ' + rr + ' ±2）', x.before);
			const inherit = !/^list/.test(k);
			if (inherit) assert(Math.abs(x.before.L / x.W - 0.1865) <= 0.002 && Math.abs(x.before.R / x.W - 0.957) <= 0.002, '結合画像の構成(1): ' + k + ' の割合は左 18.6〜18.7%・右 95.7%', [x.before.L / x.W, x.before.R / x.W]);
			else assert(x.kept && x.before.L / x.W < 0.05 && Math.abs(x.before.R / x.W - 0.957) <= 0.002, '結合画像の構成(1): ' + k + '（因子一覧）は左がほとんど削れない（5% 未満）・右 95.7%', [x.before.L / x.W, x.before.R / x.W]);
			assert(!x.sameCanvas && x.cw === x.after.R - x.after.L, '結合画像の構成(1): ' + k + ' は実際に削った Canvas を返す（幅＝範囲の幅）', { cw: x.cw, after: x.after });
		});
		// 削った外にパネル・枠・★が無い: OCR の行の位置から描いた枠（パネルの縁・★の範囲を含む）の左右の端が、枠を描く前に見つけた範囲の内側
		['pc976', 'ph1179', 'ph1179b', 'own765'].forEach((k) => {
			const x = r[k];
			assert(x.frames >= 8 && x.span && x.span.left >= x.before.L && x.span.right <= x.before.R,
				'結合画像の構成(1): ' + k + ' の枠（' + x.frames + '枠）は、画像から見つけた削る範囲の内側', { span: x.span, range: x.before });
			// 枠を描いた後は塗りと枠の画素で中身の列が数px 広がる（枠の外側の線の分）。枠を含み、削る前の範囲から 6px 以内
			assert(x.after.ok && x.after.frameChecked && x.span.left >= x.after.L && x.span.right <= x.after.R && Math.abs(x.after.L - x.before.L) <= 6 && Math.abs(x.after.R - x.before.R) <= 6,
				'結合画像の構成(1): ' + k + ' は枠を描いた後も削り、枠は範囲の内側（範囲の動きは 6px 以内）', { after: x.after, before: x.before, span: x.span });
		});
		assert(jsErrors(errors).length === 0, '結合画像の構成(1): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(2) 削る範囲が見つからない・おかしいときは削らない（中身が無い・いちばん広い塊が幅の 60% 未満・OCR の枠が範囲の外へ幅の 2% を超えてはみ出す）／枠のはみ出しが 2% 以内なら範囲を広げて含める／合成の画像でも削れる（空振りでない）', async () => {
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(() => {
			const W = 1179, icon = { x0: 40, x1: 170, y0: 0, y1: 140 };
			const ok = __person(W, 1600, icon);
			const okRange = stitchPanelRange(ok, icon);
			const okCrop = stitchSideCrop(ok, icon);
			const blank = __person(W, 1600, icon, { blank: true });
			const blankCrop = stitchSideCrop(blank, icon);
			const narrow = __person(W, 1600, icon, { oneColumn: true });
			const narrowCrop = stitchSideCrop(narrow, icon);
			const far = __person(W, 1600, icon); far._frameSpan = { left: okRange.L - Math.round(W * 0.05), right: okRange.R - 10 };
			const farCrop = stitchSideCrop(far, icon);
			const near = __person(W, 1600, icon); near._frameSpan = { left: okRange.L - 5.5, right: okRange.R + 3.2 };
			const nearRange = stitchPanelRange(near, icon);
			return { cols: ok._cols, pad: Math.round(W * 0.006), okRange, okCrop: { same: okCrop === ok, w: okCrop.width, h: okCrop.height, sc: okCrop._sideCrop },
				blank: { same: blankCrop === blank, sc: blankCrop._sideCrop }, narrow: { same: narrowCrop === narrow, sc: narrowCrop._sideCrop },
				far: { same: farCrop === far, sc: farCrop._sideCrop }, near: nearRange };
		});
		const [[a1], [, b2]] = r.cols;
		// 中身の列は濃い字の帯（パネルの左右 2px 内側）。範囲＝その両端に余白 0.6%
		assert(r.okRange.ok && r.okRange.L === a1 + 2 - r.pad && r.okRange.R === b2 - 2 + r.pad, '結合画像の構成(2): 合成の画像で、パネルの範囲＋余白を見つける（空振りでない）', { range: r.okRange, cols: r.cols, pad: r.pad });
		assert(!r.okCrop.same && r.okCrop.w === r.okRange.R - r.okRange.L && r.okCrop.h === 1600 && r.okCrop.sc.srcW === 1179, '結合画像の構成(2): 合成の画像は削った Canvas になる（高さは同じ）', r.okCrop);
		assert(r.blank.same && !r.blank.sc.ok && r.blank.sc.L === 0 && r.blank.sc.R === 1179 && /見つからない/.test(r.blank.sc.reason), '結合画像の構成(2): 中身が無ければ削らない（元の Canvas のまま）', r.blank);
		assert(r.narrow.same && !r.narrow.sc.ok && /狭すぎる/.test(r.narrow.sc.reason), '結合画像の構成(2): いちばん広い塊が幅の 60% 未満（列が1つ＝39%）なら削らない', r.narrow);
		assert(r.far.same && !r.far.sc.ok && /OCR の枠/.test(r.far.sc.reason), '結合画像の構成(2): OCR の枠が範囲の外へ 2% を超えてはみ出すなら削らない', r.far);
		assert(r.near.ok && r.near.frameChecked && r.near.L === Math.floor(r.okRange.L - 5.5) - 2 && r.near.R === Math.ceil(r.okRange.R + 3.2) + 2, '結合画像の構成(2): 枠のはみ出しが 2% 以内なら、枠を含むよう範囲を広げる', { near: r.near, ok: r.okRange });
		assert(jsErrors(errors).length === 0, '結合画像の構成(2): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(3) 表の中身: 行＝因子周回スキル（既定の並び・数は②と同じ）・★の数・読めなかった＝0・数えられない＝「?」（合計は分かる分＋?・種数には数える）・人がいない列は「−」で種数・合計に入れない', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS });
		await prep(page);
		const r = await page.evaluate(() => {
			const snap = captureStitchSnapshot();
			const order = snap.entries.map((e) => e.id);
			const sorted = order.slice().sort((a, b) => UmaSkillDeckCore.compareGameOrder(a, b));
			const names = snap.entries.map((e) => e.name);
			// 親: 1番目★3・2番目★なし（読めない＝null）、祖1: 1番目★1・3番目★2、祖2: いない
			const a = {}; a[names[0]] = 3; a[names[1]] = null;
			const b = {}; b[names[0]] = 1; b[names[2]] = 2;
			snap.results = [__res(a), __res(b), null];
			const d = stitchTableData(snap, [0, 1, 2]);
			return { n: snap.entries.length, ids: deckScope.skillIds.length, order, sorted, kinds: Object.keys(snap.kindByName).length, d: JSON.parse(JSON.stringify(d)) };
		});
		assert(r.n === r.ids && r.n === IDS.length, '結合画像の構成(3): 行の数＝因子周回スキルの数', { n: r.n, ids: r.ids });
		assert(JSON.stringify(r.order) === JSON.stringify(r.sorted), '結合画像の構成(3): 行は既定の並び（compareGameOrder）', r.order);
		assert(r.kinds === r.n, '結合画像の構成(3): すべての行に種類（段4 の判定）がある', r.kinds);
		const [x0, x1, x2] = r.d.rows;
		assert(JSON.stringify(x0.vals) === JSON.stringify([3, 1, null]) && x0.total === 4 && !x0.unknown, '結合画像の構成(3): ★の数・人がいない列は値なし・合計＝居る人の和', x0);
		assert(x1.vals[0] === null && x1.vals[1] === 0 && x1.unknown && x1.total === 0, '結合画像の構成(3): ★を数えられない行は null（「?」）・読めなかった人は 0・合計は分かる分', x1);
		assert(x2.vals[0] === 0 && x2.vals[1] === 2 && x2.total === 2, '結合画像の構成(3): 読めなかった＝0', x2);
		assert(r.d.people[2].present === false && r.d.kinds[2] === null && r.d.kinds[0] === 2 && r.d.kinds[1] === 2 && r.d.totalKinds === 3,
			'結合画像の構成(3): 種数（人ごと＝★1以上か ? の行・合計＝誰かが持つ行）。人がいない列は数えない', { kinds: r.d.kinds, total: r.d.totalKinds });
		// 描いた表の文字: 「?」「4」「0+?」「−」「（画像なし）」「因子周回スキル」「種数」
		const texts = await page.evaluate(() => {
			const snap = __snap(3, [__res({ N0: 3, N1: null }), __res({ N0: 1, N2: 2 }), null], ['card', 'star', 'other']);
			const t = []; const o = CanvasRenderingContext2D.prototype.fillText;
			CanvasRenderingContext2D.prototype.fillText = function (s) { t.push(String(s)); return o.apply(this, arguments); };
			stitchDrawTable(stitchTableData(snap, [0, 1, 2]), 30);
			CanvasRenderingContext2D.prototype.fillText = o;
			return t;
		});
		['因子周回スキル', '親A', '祖A1', '祖A2', '（画像なし）', '合計', '?', '0+?', '4', '−', '種数', '2種', '3種'].forEach((w) => {
			assert(texts.indexOf(w) !== -1, '結合画像の構成(3): 表に「' + w + '」が描かれる', texts);
		});
		assert(jsErrors(errors).length === 0, '結合画像の構成(3): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(4) 表の色: 人の列 ★0〜3＝#F3F5F8／#C9DCEE／#6F9FD0／#1F4E85・合計は同じ帯で 0〜9（9＝#1F4E85）・濃い地は白い字・名前のセルは種類の塗りと枠', async () => {
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(() => {
			const person = [0, 1, 2, 3].map((v) => stitchHeatColor(v, false));
			const total = [0, 3, 6, 9].map((v) => stitchHeatColor(v, true));
			const mid = stitchHeatColor(4, true);
			const inks = ['#F3F5F8', '#1F4E85'].map(stitchInkOn);
			const snap = __snap(3, [__res({ N0: 3 }), __res({}), __res({})], ['card', 'star', 'other']);
			const c = stitchDrawTable(stitchTableData(snap, [0, 1, 2]), 40);
			const g = c.getContext('2d'); const rh = c._rowH;
			const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); };
			const { nameW, cw } = c._metrics;
			const cells = { p0: px(nameW + 4, rh + 4), totalBorder: px(nameW + cw * 3, rh + 4), name: [0, 1, 2].map((i) => ({ fill: px(nameW / 2, rh * (i + 1) + 4 + Math.round(rh / 14)), edge: px(1, rh * (i + 1) + rh / 2) })) };
			const st = ['card', 'star', 'other'].map((k) => factorFrameStyleOf(k));
			return { person, total, mid, inks, cells, st: st.map((s) => ({ frame: s.frame.toUpperCase(), tint: s.tint.toUpperCase() })) };
		});
		assert(JSON.stringify(r.person) === JSON.stringify(['#F3F5F8', '#C9DCEE', '#6F9FD0', '#1F4E85']), '結合画像の構成(4): 人の列の色（★0〜3）', r.person);
		assert(JSON.stringify(r.total) === JSON.stringify(['#F3F5F8', '#C9DCEE', '#6F9FD0', '#1F4E85']) && r.mid !== r.total[1] && r.mid !== r.total[2], '結合画像の構成(4): 合計の列は同じ帯で 0〜9 の連続（0・3・6・9 が段の色・間は間の色）', r);
		assert(r.inks[0] === '#333333' && r.inks[1] === '#FFFFFF', '結合画像の構成(4): 薄い地は濃い灰の字・濃い地は白い字', r.inks);
		assert(r.cells.p0 === '#1F4E85' && r.cells.totalBorder === '#888888', '結合画像の構成(4): マスの色（★3）と合計の列の左の区切り線', r.cells);
		r.cells.name.forEach((n, i) => {
			assert(n.fill === r.st[i].tint && n.edge === r.st[i].frame, '結合画像の構成(4): 名前のセル ' + i + ' は種類の塗り（薄め）と同じ種類の枠の色', { n, st: r.st[i] });
		});
		assert(jsErrors(errors).length === 0, '結合画像の構成(4): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(5) 配置: 表 → 親 → 祖1 → 祖2・3人の高さをそろえ祖の縮小率は親以下・幅の下限 2206／行は全部描く: 40以下は 26〜40px（入らなければ中段を高くする）・40超は 16px まで縮める（なお入らなければ高くする）・画素数の上限で止めて 16 より小さく／表の幅は内容に見合う・字は行に合わせる／枠の見かたは親の左端の下', async () => {
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(() => {
			const L = STITCH_LAYOUT;
			const legend = buildFactorFrameLegendBar(L.legendMaxW, L.legendRef, true);
			const tab = (n, nameOf) => stitchTableData(__snap(n, [__res({}), __res({}), __res({})], null, nameOf), [0, 1, 2]);
			const fam = (hs) => hs.map((h) => __person(1179, h));
			const mk = (n, hs, nameOf) => { const c = __compose({ c: fam(hs || [2342, 1757, 2521]), table: n === null ? null : tab(n, nameOf), legend }); const l = c._layout; return Object.assign(l, { tableW: l.table ? l.table.w : 0 }); };
			const t0 = performance.now();
			const out = { L, legendH: legend.height, r10: mk(10), r38: mk(38), r40short: mk(40, [1200, 1100, 1300]), r60: mk(60), r120: mk(120), cap: mk(900), none: mk(null),
				longName: mk(10, null, (i) => 'あ'.repeat(24) + i), r0: mk(0) };
			out.ms = performance.now() - t0;
			return out;
		});
		const { L } = r;
		const headH = 64 + 6;
		const chk = (k, l) => {
			const [p, g1, g2] = l.persons;
			// 並び・見出しの下に3人・上端そろえ
			assert(l.table.x === 28 && p.x === 28 + l.tableW + 24 && g1.x === p.x + p.w + 16 && g2.x === g1.x + g1.w + 16 && [p, g1, g2].every((q) => q.y === l.bodyY + headH),
				'結合画像の構成(5): ' + k + ' 左から 表 → 親 → 祖1 → 祖2（間 24・16）・3人は見出しの行の下で上端がそろう', { table: l.table, persons: l.persons });
			assert(l.width >= 2206 && g2.x + g2.w + 28 <= l.width && l.width - (g2.x + g2.w + 28) <= 6, '結合画像の構成(5): ' + k + ' 幅は 2206 以上で、人が右の余白まで詰まって収まる', { width: l.width, right: g2.x + g2.w });
			// 3人の高さ（祖1 は親より短い画像・祖2 は長い画像）: 親と祖2 は同じ高さ・祖1 は親の縮小率で下が空く
			assert(Math.abs(g2.h - p.h) <= 1 && g1.h < p.h && g1.scale <= p.scale + 1e-9 && g2.scale <= p.scale + 1e-9, '結合画像の構成(5): ' + k + ' 3人の高さをそろえ、祖の縮小率は親を超えない（短い祖は下が空く）', { p, g1, g2 });
			// 表は全部の行・行が中段（見出し＋人＋枠の見かた）に入る
			assert(l.table.rows === k.n && l.table.h === l.table.rowH * (k.n + 2) && l.table.y + l.table.h <= l.legend.y + l.legend.h, '結合画像の構成(5): ' + k.name + ' 表は全部の行（' + k.n + '）を描き、枠の見かたの行の下端までに収まる', l.table);
			// 枠の見かた: 親の左端の下
			assert(l.legend.x === p.x && l.legend.y === p.y + Math.max(p.h, g1.h, g2.h) + 16 && l.height === l.bodyY + l.room + 28, '結合画像の構成(5): ' + k.name + ' 枠の見かたは親の左端の下（人の下から 16）・全体の高さ＝中段＋余白', { legend: l.legend, p });
			// 字は行に合わせる（下限なし）
			assert(l.table.fontSize === Math.max(1, Math.round(l.table.rowH * 0.56)), '結合画像の構成(5): ' + k.name + ' 字は行の高さの 0.56 倍（' + l.table.rowH + 'px → ' + l.table.fontSize + 'px）', l.table);
		};
		chk({ name: '10行', n: 10, toString: () => '10行' }, r.r10);
		chk({ name: '38行', n: 38, toString: () => '38行' }, r.r38);
		chk({ name: '40行（人が短い）', n: 40, toString: () => '40行（人が短い）' }, r.r40short);
		chk({ name: '60行', n: 60, toString: () => '60行' }, r.r60);
		chk({ name: '120行', n: 120, toString: () => '120行' }, r.r120);
		assert(r.r10.table.rowH === 40 && r.r10.width === 2206 && !r.r10.grown, '結合画像の構成(5): 10行は上限の 40px・幅 2206', r.r10.table);
		assert(r.r38.table.rowH >= 26 && r.r38.table.rowH <= 40 && r.r38.width === 2206 && !r.r38.grown, '結合画像の構成(5): 38行は 26〜40px で幅 2206 のまま', r.r38.table);
		assert(r.r40short.grown && r.r40short.table.rowH === 26 && r.r40short.width > 2206 && r.r40short.room >= 42 * 26, '結合画像の構成(5): 人が短く 40行が 26px で入らなければ、中段を高くする（幅が広がる）', { w: r.r40short.width, room: r.r40short.room, rowH: r.r40short.table.rowH });
		assert(!r.r60.grown && r.r60.table.rowH < 26 && r.r60.table.rowH >= 16 && r.r60.width === 2206, '結合画像の構成(5): 60行（40超）は行を 26 より小さく（16 以上）して中段に収め、幅は 2206 のまま', { rowH: r.r60.table.rowH, w: r.r60.width });
		assert(r.r120.grown && r.r120.table.rowH === 16 && r.r120.width > 2206 && !r.r120.capped, '結合画像の構成(5): 120行は 16px でも入らないので中段を高くする（下限 16）', { rowH: r.r120.table.rowH, w: r.r120.width, h: r.r120.height });
		// 900行: 人は元の大きさ（縮小率 1）までしか大きくしないので、上限の手前で人は止まり、表の列が上限の高さまで伸びる
		const capNext = r.cap.width * (r.cap.bodyY + Math.max(r.cap.room, 902 * (r.cap.table.rowH + 1)) + 28);
		assert(r.cap.capped && r.cap.table.rowH < 16 && r.cap.table.rows === 900 && r.cap.width * r.cap.height <= 16000000 && capNext > 16000000 && L.maxPixels === 16000000,
			'結合画像の構成(5): 900行は画素数の上限（16,000,000）で高くするのを止め、行を 16 より小さく（上限に入るいちばん高い行）して全部の行を収める', { rowH: r.cap.table.rowH, w: r.cap.width, h: r.cap.height, px: r.cap.width * r.cap.height, next: capNext });
		assert(r.cap.persons.every((p) => p.scale <= 1), '結合画像の構成(5): 人は元の大きさより大きくしない（縮小率 1 まで）', r.cap.persons.map((p) => p.scale));
		assert(r.cap.table.y + r.cap.table.h <= r.cap.height - 28, '結合画像の構成(5): 上限で止めたときも、表は画像の中に収まる', r.cap.table);
		assert(r.longName.tableW > r.r10.tableW + 200, '結合画像の構成(5): 表の幅は内容に見合う（長い名前なら広く・短い名前なら狭い）', { long: r.longName.tableW, short: r.r10.tableW });
		assert(r.r10.tableW < 500, '結合画像の構成(5): 短い名前の表は詰めた幅（変更前の固定の 820 より狭い 500 未満）', r.r10.tableW);
		assert(!r.none.table && r.none.persons[0].x === 28 && r.none.legend.x === 28 && r.none.width === 2206, '結合画像の構成(5): 表が無ければ人は左端から・枠の見かたも親の左端の下', { p: r.none.persons[0], legend: r.none.legend });
		assert(r.r0.table && r.r0.table.rows === 0 && r.r0.table.rowH === 40, '結合画像の構成(5): 行が0 でも見出しと種数の行は描く', r.r0.table);
		assert(r.ms < 5000, '結合画像の構成(5): 組み立ての計算は速い（9枚で 5 秒未満）', r.ms);
		assert(jsErrors(errors).length === 0, '結合画像の構成(5): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(6) 人の見出し: 顔のアイコン（高さ 64・箱から 8px 広げて切り出す）＋右にラベル・3人とも同じ大きさ（24px）／アイコンが無い・因子一覧の画面（顔が画像に残る）はラベルだけ／見出しは人の画像に重ならない／実画像でも同じ', async () => {
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(async (u) => {
			const icon = { x0: 40, x1: 170, y0: 0, y1: 140 };
			const pc = __person(1179, 2342, icon);
			const found = stitchPersonIconBox(pc);
			const head = stitchHeadIconOf(pc, found);
			const keptHead = stitchHeadIconOf(pc, Object.assign({}, found, { kept: true }));
			const none = stitchHeadIconOf(pc, null);
			const lay = __compose({ c: [pc, __person(1179, 1757, icon), __person(1179, 2521)], heads: [head, head, null] })._layout;
			const real = {};
			if (u.ph.length) {
				for (const [k, list] of Object.entries(u)) real[k] = stitchPersonIconBox(await stitchOnePerson(await __filesOf(list), k));
				// 実画像の結合（OCRしない）: 親＝継承画面・祖1＝因子一覧
				const keep = persons.slice(0, 3).map((p) => p.files);
				persons[0].files = await __filesOf(u.ph); persons[1].files = await __filesOf(u.list); persons[2].files = [];
				const c = await buildStitchedSetImage(0, null, false);
				for (let i = 0; i < 3; i++) persons[i].files = keep[i];
				real.layout = c._layout;
			}
			return { found, head: head && { w: head.width, h: head.height }, keptHead, none, lay, real };
		}, haveImages ? { ph: imgs(CASES.ph1179), own: imgs(CASES.own765), list: imgs(CASES.list1170) } : { ph: [] });
		assert(r.found && r.found.x0 === 40 && r.found.x1 === 170 && r.found.y0 === 0 && r.found.y1 === 140, '結合画像の構成(6): 合成の画像でアイコンの範囲を見つける', r.found);
		assert(r.head && r.head.w === (170 + 8) - (40 - 8) && r.head.h === 142, '結合画像の構成(6): 見出しのアイコンは箱から左右 8px 広げ、下は 2px 足して切り出す', r.head);
		assert(r.keptHead === null && r.none === null, '結合画像の構成(6): 因子一覧の画面（kept）とアイコンが無いときは、見出しにアイコンを写さない', { kept: r.keptHead, none: r.none });
		const [h0, h1, h2] = r.lay.heads;
		const ps = r.lay.persons;
		[h0, h1].forEach((h, i) => {
			assert(h.icon && h.icon.h === 64 && h.icon.x === ps[i].x && h.icon.y === r.lay.bodyY && h.label.x === h.icon.x + h.icon.w + 8,
				'結合画像の構成(6): ' + i + ' の見出しは、人の左端に高さ 64 の顔・その右（間 8）にラベル', h);
		});
		assert(!h2.icon && h2.label.x === ps[2].x, '結合画像の構成(6): アイコンが無い人はラベルだけ（人の左端から）', h2);
		assert([h0, h1, h2].every((h) => h.label.size === 24 && h.label.h === h0.label.h && h.label.y === h0.label.y),
			'結合画像の構成(6): ラベルは3人とも同じ大きさ（24px）・同じ高さの位置', [h0.label, h1.label, h2.label]);
		assert([h0, h1, h2].every((h, i) => h.label.y + h.label.h <= ps[i].y && (!h.icon || h.icon.y + h.icon.h <= ps[i].y)), '結合画像の構成(6): 見出し（顔・ラベル）は人の画像に重ならない', { heads: r.lay.heads, persons: ps });
		if (haveImages) {
			assert(r.real.ph && r.real.ph.y0 <= 5 && r.real.ph.y1 > 100 && r.real.ph.x1 < 1179 * 0.18, '結合画像の構成(6): 実画像（継承画面・1179幅）でアイコンを見つける', r.real.ph);
			assert(r.real.own && r.real.own.y1 > 60, '結合画像の構成(6): 実画像（自分の画面・765幅・銀髪のアイコン）でもアイコンを見つける', r.real.own);
			assert(r.real.list && r.real.list.kept && r.real.list.y1 > 200, '結合画像の構成(6): 因子一覧ではキャラクターの情報の欄のアイコン（kept）', r.real.list);
			const l = r.real.layout;
			assert(l.heads.length === 2 && l.heads[0].icon && l.heads[0].icon.h === 64 && !l.heads[1].icon && l.heads[1].label.size === 24,
				'結合画像の構成(6): 実画像の結合: 継承画面の親は顔＋ラベル・因子一覧の祖はラベルだけ', l.heads);
			assert(l.persons[0].crop && l.persons[0].crop.ok && Math.abs(l.persons[0].crop.L - 220) <= 2 && l.persons[1].crop.ok && Math.abs(l.persons[1].crop.L - 49) <= 2,
				'結合画像の構成(6): 実画像の結合（OCRしない）でも両側を削る（継承画面 左 220・因子一覧 左 49）', l.persons.map((p) => p.crop));
		} else assert(false, '結合画像の構成(6): 前提: test-images に素材がある', null);
		assert(jsErrors(errors).length === 0, '結合画像の構成(6): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(7) タイトルのバー: 全幅・高さ70・両端が丸い・色は上 #94D709 → 下 #6BC20C・白い文字「セット名｜レース条件（①の絞り込みの言い方・「・」でつなぐ）」・条件が無ければセット名だけ・長ければ 20px まで縮めて末尾を「…」', async () => {
		const ud = { schemaVersion: 7, records: [], customSkills: [], rosters: [Object.assign({ rosterId: 'r1', name: 'R', createdAt: 'x', updatedAt: 'x', skillFilter: { distance: 'medium', style: 'sashi' } }, R1S)],
			templates: [{ templateId: 't1', name: '名前のあるセット', skillIds: IDS.slice(), skillIcons: {}, parentHintLevel: 5, baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }] };
		const { ctx, page, errors } = await openSp({ userData: ud, roster: Object.assign({ skillFilter: { distance: 'medium', style: 'sashi' } }, R1S) });
		await page.evaluate(() => localStorage.setItem('umaSkillDeck:lastSet:special', 't1'));
		await reloadReady(page);
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await page.waitForTimeout(500);
		await prep(page);
		const r = await page.evaluate(() => {
			const shown = document.querySelector('#deck-set-bar [data-usd-el="set-name"]').textContent.trim();
			const snap = captureStitchSnapshot();
			const text = stitchBarText(snap);
			const filterTexts = Array.from(document.querySelectorAll('[data-usd-act="filter"]')).map((s) => s.selectedOptions[0] ? s.selectedOptions[0].textContent : '');
			const plain = stitchBarText(Object.assign({}, snap, { raceLabels: [] }));
			const lay = __compose({ c: [__person(1179, 2342), null, null], bar: text });
			const g = lay.getContext('2d');
			const px = (x, y) => { const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; };
			const b = lay._layout.bar;
			const xs = b.x + b.w * 0.1;
			const long = __compose({ c: [__person(1179, 2342), null, null], bar: 'あ'.repeat(200) })._layout.barFit;
			const texts = []; const o = CanvasRenderingContext2D.prototype.fillText;
			CanvasRenderingContext2D.prototype.fillText = function (s, x, y) { texts.push({ s: String(s), color: this.fillStyle }); return o.apply(this, arguments); };
			__compose({ c: [__person(1179, 2342), null, null], bar: text });
			CanvasRenderingContext2D.prototype.fillText = o;
			return { shown, text, plain, filterTexts, bar: b, top: px(xs, b.y + 3), mid: px(xs, b.y + b.h / 2), bottom: px(xs, b.y + b.h - 3), corner: px(b.x + 3, b.y + 3), edgeMid: px(b.x + 3, b.y + b.h / 2), long, fit: lay._layout.barFit, barTexts: texts.filter((t) => t.s === text) };
		});
		assert(r.shown === '名前のあるセット' && r.text === r.shown + '｜中距離・差し', '結合画像の構成(7): バーの文字は「帯のセット名｜レース条件」', r);
		assert(r.filterTexts.indexOf('中距離') !== -1 && r.filterTexts.indexOf('差し') !== -1, '結合画像の構成(7): レース条件の言い方は①の選択欄の表示と同じ', r.filterTexts);
		assert(r.plain === '名前のあるセット', '結合画像の構成(7): 条件が無ければセット名だけ', r.plain);
		assert(r.bar.h === 70 && r.bar.x === 28 && r.bar.w === 2206 - 56, '結合画像の構成(7): 全幅（余白を除く）・高さ70', r.bar);
		const near = (a, hex, tol) => { const v = parseInt(hex.slice(1), 16); return Math.abs(a[0] - ((v >> 16) & 255)) <= tol && Math.abs(a[1] - ((v >> 8) & 255)) <= tol && Math.abs(a[2] - (v & 255)) <= tol; };
		assert(near(r.top, '#94D709', 6) && near(r.mid, '#82CE0A', 6) && near(r.bottom, '#6BC20C', 6), '結合画像の構成(7): 上・中・下の色が読んだ値のグラデーション', { top: r.top, mid: r.mid, bottom: r.bottom });
		assert(r.corner.join() === '255,255,255' && near(r.edgeMid, '#82CE0A', 12), '結合画像の構成(7): 両端が丸い（角は白地・端の中ほどは帯の色）', { corner: r.corner, edgeMid: r.edgeMid });
		assert(r.barTexts.length === 1 && /^#?(fff|ffffff)$/i.test(String(r.barTexts[0].color).replace('#', '#')), '結合画像の構成(7): 文字は白', r.barTexts);
		assert(r.long && r.long.size === 20 && r.long.text.endsWith('…'), '結合画像の構成(7): 入りきらないときは 20px まで縮め、末尾を「…」で省く', r.long);
		assert(jsErrors(errors).length === 0, '結合画像の構成(7): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(8) 凡例の文と画像に描く文字列: 枠の見かたは1行（見出し＋3種）・断りの文（「枠の無いパネルは…」「数字は★の数…」）は無い／組み立てで描くすべての文字列と、画像に描く文字列の定数に「①」「②」「③」が無い', async () => {
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(() => {
			const texts = []; const o = CanvasRenderingContext2D.prototype.fillText;
			CanvasRenderingContext2D.prototype.fillText = function (s) { texts.push(String(s)); return o.apply(this, arguments); };
			const L = STITCH_LAYOUT;
			const legend = buildFactorFrameLegendBar(L.legendMaxW, L.legendRef, true);
			const legendTexts = texts.slice();
			const pc = __person(1179, 2342, { x0: 40, x1: 170, y0: 0, y1: 140 });
			__compose({ c: [pc, __person(1179, 1757), null], heads: [stitchHeadIconOf(pc, stitchPersonIconBox(pc)), null, null],
				table: stitchTableData(__snap(4, [__res({ N0: 3, N1: null }), __res({}), null], ['card', 'star', 'other']), [0, 1, 2]), legend, bar: 'S｜中距離' });
			CanvasRenderingContext2D.prototype.fillText = o;
			return { legendTexts, texts, h: legend.height, w: legend.width, noteGone: typeof FACTOR_LEGEND_NOTE === 'undefined' && typeof FACTOR_LEGEND_TABLE_NOTE === 'undefined' };
		});
		assert(JSON.stringify(r.legendTexts) === JSON.stringify(['枠の見かた：', ' 周回サポカスキル', ' サポカ外スキル', ' その他（親から継承）']) && r.h === 40 && r.w < 1600,
			'結合画像の構成(8): 枠の見かたは1行（高さ 40）に見出しと3種だけ', { t: r.legendTexts, h: r.h, w: r.w });
		assert(r.noteGone && !r.texts.some((s) => /枠の無いパネル|数字は★の数/.test(s)), '結合画像の構成(8): 断りの文（「枠の無いパネルは…」「数字は★の数…」）は描かない・定数も無い', r.texts.filter((s) => /パネル|★/.test(s)));
		const bad = r.texts.filter((s) => /[①②③]/.test(s));
		assert(bad.length === 0 && r.texts.length > 20, '結合画像の構成(8): 組み立てで描いた文字列（バー・表・見出し・凡例）に ①②③ が無い', bad);
		// コード側: 画像に描く文字列の定数（STITCH_TABLE_*・FACTOR_LEGEND_HEAD）
		const src = fs.readFileSync(path.join(REPO_ROOT, 'special.html'), 'utf8');
		const consts = [...src.matchAll(/const (STITCH_TABLE_[A-Z_]+|FACTOR_LEGEND_HEAD) = '([^']*)'/g)].map((m) => m[1] + '=' + m[2]);
		assert(consts.length >= 7 && consts.every((s) => !/[①②③]/.test(s)), '結合画像の構成(8): 画像に描く文字列の定数に ①②③ が無い', consts);
		assert(jsErrors(errors).length === 0, '結合画像の構成(8): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(9) OCR を押した時点の写し: その後に②や判定が変わっても、表の行・種類・バーの文字は写しのまま／「OCRしない」結合は表・凡例なし（バーと3人だけ・人は両側を削る）／旧UI（写しの行が空）は表なし', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS });
		await prep(page);
		const r = await page.evaluate(async () => {
			const keep = { s: window.stitchOnePerson, f: persons[0].files, snap: stitchSnapshot, scope: deckScope };
			const snap = captureStitchSnapshot();
			const n = snap.entries.length;
			snap.results = [__res({}), null, null];
			stitchSnapshot = snap;
			const icon = { x0: 40, x1: 170, y0: 0, y1: 140 };
			window.stitchOnePerson = async () => __person(1179, 2342, icon);
			persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
			const kindsBefore = JSON.stringify(stitchKindByName());
			// 押した後に②を変える（行を1つに減らす）
			deckScope = Object.assign({}, deckScope, { skillIds: deckScope.skillIds.slice(0, 1) });
			const kindsAfter = JSON.stringify(stitchKindByName());
			const withOcr = await buildStitchedSetImage(0, null, true);
			const noOcr = await buildStitchedSetImage(0, null, false);
			// 旧UI の写し（行が空）
			stitchSnapshot = Object.assign({}, snap, { entries: [] });
			const legacy = await buildStitchedSetImage(0, null, true);
			window.stitchOnePerson = keep.s; persons[0].files = keep.f; stitchSnapshot = keep.snap; deckScope = keep.scope;
			const L = (c) => c._layout;
			return { n, rows: L(withOcr).table ? L(withOcr).table.rows : -1, legend: !!L(withOcr).legend, kindsSame: kindsBefore === kindsAfter,
				no: { table: !!L(noOcr).table, legend: !!L(noOcr).legend, parent: !!L(noOcr).parent, bar: !!L(noOcr).bar, crop: L(noOcr).parent.crop, head: L(noOcr).heads[0], width: L(noOcr).width },
				legacy: { table: !!L(legacy).table, parent: !!L(legacy).parent, crop: L(legacy).parent.crop } };
		});
		assert(r.n === IDS.length && r.rows === r.n && r.legend, '結合画像の構成(9): 押した後に②を変えても、表の行は押した時点のまま・凡例あり', r);
		assert(r.kindsSame, '結合画像の構成(9): 枠と表の種類も押した時点の判定のまま', r.kindsSame);
		assert(!r.no.table && !r.no.legend && r.no.parent && r.no.bar && r.no.width === 2206, '結合画像の構成(9): 「OCRしない」結合は表・凡例なし（バーと人の画像だけ・幅 2206）', r.no);
		assert(r.no.crop && r.no.crop.ok && r.no.crop.R - r.no.crop.L < 1179 * 0.85 && r.no.head.icon && r.no.head.icon.h === 64, '結合画像の構成(9): 「OCRしない」結合でも両側を削り、見出しに顔とラベル', r.no);
		assert(!r.legacy.table && r.legacy.parent && r.legacy.crop && r.legacy.crop.ok, '結合画像の構成(9): 旧UI（写しの行が空）は表なし・人は両側を削る', r.legacy);
		assert(jsErrors(errors).length === 0, '結合画像の構成(9): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(10) 実画像で枠がパネルの縁に合う: 1179幅・765幅の結合画像で、行の位置（detectSkillRows）から描いた枠の左の辺と上の辺が、元の画素のパネルの縁から ±（線の太さ＋1）px 以内', async () => {
		if (!haveImages) { assert(false, '結合画像の構成(10): 前提: test-images に素材がある', null); return; }
		const { ctx, page, errors } = await openSp();
		await prep(page);
		await page.evaluate(FRAMED_JS);
		const r = await page.evaluate(async (u) => {
			const out = {};
			for (const [k, list] of Object.entries(u)) {
				const { c, restore } = await __framed(list);
				const before = c.getContext('2d').getImageData(0, 0, c.width, c.height);
				// 枠を描く位置を拾う（strokeFactorFrame の呼び出しを見る）
				const boxes = []; const os = window.strokeFactorFrame;
				window.strokeFactorFrame = function (ctx2, box, color) { boxes.push(Object.assign({}, box)); return os.apply(this, arguments); };
				drawFactorFramesOnPerson(c, 0);
				window.strokeFactorFrame = os;
				restore();
				const W = c.width, d = before.data;
				const isBg = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return Math.abs(d[i] - 242) <= 6 && Math.abs(d[i + 1] - 242) <= 6 && Math.abs(d[i + 2] - 242) <= 6; };
				// 元の画素で、パネルの縁を探す: パネルの内側（縁から線の太さ＋2px 内）から外へ進み、地（242）に出た位置の1つ手前が縁
				const res = boxes.filter((b) => b.top - 14 >= 0).map((b) => {
					const cy = (b.top + b.bottom) / 2 - (b.bottom - b.top) * 0.25, cx = b.left + (b.right - b.left) * 0.75;
					let lx = null; for (let x = Math.round(b.left + b.line + 2); x >= b.left - 14; x--) if (isBg(x, cy)) { lx = x + 1; break; }
					let ty = null; for (let y = Math.round(b.top + b.line + 2); y >= b.top - 14; y--) if (isBg(cx, y)) { ty = y + 1; break; }
					return { dl: lx === null ? null : lx - b.left, dt: ty === null ? null : ty - b.top, line: b.line };
				});
				out[k] = res;
			}
			return out;
		}, { ph1179: imgs(CASES.ph1179), own765: imgs(CASES.own765) });
		Object.entries(r).forEach(([k, list]) => {
			const measured = list.filter((x) => x.dl !== null && x.dt !== null);
			const bad = measured.filter((x) => Math.abs(x.dl) > x.line + 1 || Math.abs(x.dt) > x.line + 1);
			const med = (key) => { const v = measured.map((x) => Math.abs(x[key])).sort((a, b) => a - b); return v[v.length >> 1]; };
			// 1枠ずつの画素の読みは、継ぎ目・固有スキルの帯の色などで外れることがある（2026-10-29 に 1179幅で 43枠中1枠）。
			// 中央値が線の太さ以内で、95% 以上の枠が ±（線の太さ＋1）px 以内なら合っているとみる
			assert(measured.length >= 8 && med('dl') <= measured[0].line && med('dt') <= measured[0].line && bad.length <= Math.floor(measured.length * 0.05),
				'結合画像の構成(10): ' + k + ' の枠の左と上の辺がパネルの縁に合う（測った ' + measured.length + ' 枠・外れ ' + bad.length + '）', { med: [med('dl'), med('dt')], bad: bad.slice(0, 5), n: list.length });
		});
		assert(jsErrors(errors).length === 0, '結合画像の構成(10): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(11) ライトとダークで同じ画像: 表・人の見出し・枠の見かたを含む組み立ての Canvas が、画面の表示（ライト・ダーク）で画素まで同じ', async () => {
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const draw = () => page.evaluate(() => {
			const L = STITCH_LAYOUT;
			const pc = __person(1179, 2342, { x0: 40, x1: 170, y0: 0, y1: 140 });
			const head = stitchHeadIconOf(pc, stitchPersonIconBox(pc));
			const c = __compose({ c: [stitchSideCrop(pc, stitchPersonIconBox(pc)), __person(1179, 1757), __person(1179, 2000)], heads: [head, null, head],
				table: stitchTableData(__snap(12, [__res({ N0: 3, N1: null, N2: 1 }), __res({ N3: 2 }), __res({})], ['card', 'star', 'other']), [0, 1, 2]),
				legend: buildFactorFrameLegendBar(L.legendMaxW, L.legendRef, true), bar: 'S｜中距離' });
			return { url: c.toDataURL(), attr: document.documentElement.getAttribute('data-theme') };
		});
		await page.evaluate(() => window.UmaTheme.set('light'));
		const light = await draw();
		await page.evaluate(() => window.UmaTheme.set('dark'));
		const dark = await draw();
		await page.evaluate(() => window.UmaTheme.set('auto'));
		assert(dark.attr === 'dark' && light.attr !== 'dark', '結合画像の構成(11): 前提: 画面はライトとダークに切り替わっている', [light.attr, dark.attr]);
		assert(light.url.length > 10000 && light.url === dark.url, '結合画像の構成(11): ライトとダークで、組み立てた結合画像が画素まで同じ', [light.url.length, dark.url.length]);
		assert(jsErrors(errors).length === 0, '結合画像の構成(11): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});
}
