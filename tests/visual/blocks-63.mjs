// ②因子周回 段6 結合画像の構成（C-228・2026-10-29）の検査。run-smoke.mjs の末尾から register63() で呼ばれる
// （塊の見出しはすべて「結合画像の構成」で始まる。`npm run test:visual -- --only=結合画像の構成` で回せる）。
//
// 決め（おいもさん・Step 0 の D1〜D12 の最終版）:
//  ・親A の家系で1枚・親B の家系で1枚。最上段にタイトルのバー（全幅・高さ70・両端が丸い・ゲームの「ウマ娘詳細」の帯の色・白い文字「セット名｜レース条件」）。
//  ・左上＝親の継承画面の上部（タイトル帯の下〜ステータスの見出しの上端＋0.305 W）、左下＝表、右＝親（大きく）・祖1・祖2（小さく縦に）、右下＝凡例。
//  ・表: 行＝因子周回スキル（既定の並び）・列＝親・祖1・祖2・合計・最下行＝種数。★0 は 0、★を数えられない行は「?」。人がいない列は「（画像なし）」「−」。
//  ・ヒートマップは青の濃淡（#F3F5F8／#C9DCEE／#6F9FD0／#1F4E85。合計は同じ帯で 0〜9）。
//  ・右の高さ（親）を基準に、表の行の高さは 26〜54px。収まらなければ全体を下へ伸ばす。祖は凡例を引いた残りに収まる幅（上限は親の半分）。
//  ・ラベル（親A など）はアイコンの直下（アイコンもパネルも隠さない）。アイコンが無ければ画像の上端。
//  ・画像に描く文字列に「①」「②」「③」を使わない（②は「因子周回スキル」）。OCR を押した時点の写しから描く。
// test-images（Git の外。worktree ではメインから写す）の実画像も使う。無ければ NG（空振りにしない）。スキル名は検査の側に書かない（恒久ルール1）。

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
	const CASES = { pc976: '2026-09-15_3', ph1179: '2026-09-16_1', own765: '2026-09-17_1', list1170: '2026-09-26_1', list1170b: '2026-09-26_3', ph1179b: '2026-09-15_5' };
	const haveImages = Object.values(CASES).every((c) => imgs(c).length >= 2);

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, o.userData || EMPTY);
		await sp.page.evaluate(({ roster, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster || null, scope: o.ids ? { skillIds: o.ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 } : null });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		if (o.ids && o.ids.length) await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(400);
		return sp;
	};
	// ページの中: URL の画像を File の配列に
	const FILES_JS = `window.__filesOf = async (urls) => { const out = []; for (const u of urls) { const b = await (await fetch(u)).blob(); out.push(new File([b], u.split('/').pop(), { type: 'image/png' })); } return out; };`;
	// ページの中: 合成の1人分（幅 W・高さ H の白地。左の帯にアイコンの代わりの色の塊、右に灰のパネル）
	const SYNTH_PERSON = `window.__person = (W, H, icon) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, H);
		g.fillStyle = 'rgb(226,226,226)'; for (let y = 10; y < H - 60; y += 80) { g.fillRect(W * 0.19, y, W * 0.38, 60); g.fillRect(W * 0.6, y, W * 0.38, 60); }
		if (icon) { g.fillStyle = 'rgb(200,120,40)'; g.fillRect(icon.x0, icon.y0, icon.x1 - icon.x0 + 1, icon.y1 - icon.y0 + 1); }
		c._sourcePlacements = []; c._profileHeader = { kept: false, ratio: 0.31, height: 0 }; return c; };`;
	const SNAP_OF = `window.__snap = (n, results, kinds) => { const entries = Array.from({ length: n }, (_, i) => ({ id: 's' + i, name: 'N' + i }));
		const kindByName = {}; entries.forEach((e, i) => { kindByName[e.name] = kinds ? kinds[i % kinds.length] : 'other'; });
		return { entries, kindByName, setName: 'S', raceLabels: [], results }; };
		window.__res = (stars) => ({ detectedSkills: new Set(Object.keys(stars)), skillStars: Object.fromEntries(Object.entries(stars)), skillSources: {}, matchReasons: {} });`;
	const prep = async (page) => { await page.evaluate(FILES_JS); await page.evaluate(SYNTH_PERSON); await page.evaluate(SNAP_OF); };

	await block('結合画像の構成(1) 継承画面の上部: 3サイズ（976・1179・765）でタイトル帯の下〜ステータスの見出し＋0.305 W・左右はタイトル帯の端／自分の画面の左右の矢印は画像ごとに違っても範囲は同じ／因子一覧には上部が無い', async () => {
		assert(haveImages, '結合画像の構成(1): 前提: test-images に素材がある（worktree ではメインの test-images を写す）', Object.values(CASES).map((c) => c + ':' + imgs(c).length));
		if (!haveImages) return;
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(async (urls) => {
			const out = {};
			for (const [k, list] of Object.entries(urls)) {
				out[k] = [];
				for (const u of list.slice(0, 3)) {
					const f = (await __filesOf([u]))[0];
					const c = stitchImgToCanvas(await loadImage(f));
					const b = stitchStatusTopBox(c);
					out[k].push({ W: c.width, b });
				}
			}
			return out;
		}, { pc976: imgs(CASES.pc976), ph1179: imgs(CASES.ph1179), own765: imgs(CASES.own765), list1170: imgs(CASES.list1170) });
		// 実測（Step 0 の §1-2）: タイトル帯の下端 126／382／98・ステータスの見出しの上端 414／730／324・タイトル帯の横 11〜965／13〜1165／8〜756
		const WANT = { pc976: { y0: 127, statsTop: 414, x0: 11, x1: 965 }, ph1179: { y0: 383, statsTop: 730, x0: 13, x1: 1165 }, own765: { y0: 99, statsTop: 324, x0: 8, x1: 756 } };
		Object.entries(WANT).forEach(([k, w]) => {
			const { W, b } = r[k][0];
			assert(b && Math.abs(b.y0 - w.y0) <= 2 && Math.abs(b.y1 - (w.statsTop + Math.round(0.305 * W))) <= 2 && Math.abs(b.x0 - w.x0) <= 3 && Math.abs(b.x1 - w.x1) <= 3,
				'結合画像の構成(1): ' + k + '（' + W + '幅）の上部の範囲が実測どおり（上端＝タイトル帯の下・下端＝見出し＋0.305 W・左右＝帯の端）', { b, want: w });
			assert(b && Math.abs((b.y1 - b.y0) / W - 0.60) <= 0.012, '結合画像の構成(1): ' + k + ' の上部の高さは幅の 0.60 倍', b && (b.y1 - b.y0) / W);
		});
		const own = r.own765.map((x) => JSON.stringify(x.b));
		assert(own.length === 3 && own.every((s) => s === own[0]), '結合画像の構成(1): 自分の画面（左右の矢印が動く）でも、3枚の上部の範囲は同じ', own);
		// 因子一覧の画面は、上部の範囲だけなら見つかってしまう（所持因子の帯がステータスの見出しと同じ位置に来る）。
		// 見分けは結合の stitchDetectProfileHeader の kept で行う（(2) で確かめる）
		assert(r.list1170[0].b !== undefined, '結合画像の構成(1): 因子一覧の画像も読める（見分けは (2) の kept）', r.list1170);
		assert(jsErrors(errors).length === 0, '結合画像の構成(1): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(2) 上部をどの人から取るか: 親の1枚目／因子一覧の親は置かない（表が上に詰まる）／親がいないときだけ祖の1枚目から', async () => {
		if (!haveImages) { assert(false, '結合画像の構成(2): 前提: test-images に素材がある', null); return; }
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(async (u) => {
			const keep = persons.slice(0, 3).map((p) => p.files);
			const run = async (lists) => {
				for (let i = 0; i < 3; i++) persons[i].files = lists[i] ? await __filesOf(lists[i]) : [];
				const stitched = {};
				for (let i = 0; i < 3; i++) if (persons[i].files.length) stitched[i] = await stitchOnePerson(persons[i].files, PERSON_LABELS[i]);
				const top = await stitchFamilyTop([0, 1, 2], stitched);
				return top ? { w: top.width, h: top.height, box: top._topBox } : null;
			};
			const parent = await run([u.ph1179, u.pc976, null]);
			const list = await run([u.list1170, u.ph1179, null]);
			const noParent = await run([null, u.ph1179b, null]);
			// 因子一覧の親で、組み立ての左の表が上端から始まる
			persons[0].files = await __filesOf(u.list1170);
			const c = await buildStitchedSetImage(0, null, false);
			for (let i = 0; i < 3; i++) persons[i].files = keep[i];
			return { parent, list, noParent, layout: c._layout };
		}, { ph1179: imgs(CASES.ph1179), pc976: imgs(CASES.pc976), list1170: imgs(CASES.list1170), ph1179b: imgs(CASES.ph1179b) });
		assert(r.parent && r.parent.w === 1153 && Math.abs(r.parent.h - 706) <= 3, '結合画像の構成(2): 親の画像があれば、親の1枚目の上部（1179幅で 1153×約706）', r.parent);
		assert(r.list === null && !r.layout.top, '結合画像の構成(2): 親が因子一覧の画面なら上部を置かない（祖の画像に代えない）', { list: r.list, top: r.layout.top });
		assert(r.noParent && r.noParent.w === 1153, '結合画像の構成(2): 親がいないときだけ、祖の1枚目から上部を取る', r.noParent);
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
			stitchDrawTable(820, 400, stitchTableData(snap, [0, 1, 2]));
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
			const c = stitchDrawTable(820, 300, stitchTableData(snap, [0, 1, 2]));
			const g = c.getContext('2d'); const rh = c._rowH;
			const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); };
			const nameW = Math.round(820 * 0.46), cw = Math.floor((820 - nameW) / 4);
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

	await block('結合画像の構成(5) 配置: 右の高さ（親を幅860に）が基準・表の行は 26〜54px・収まらなければ全体を下へ伸ばす・余れば表の下が余白・祖は凡例を引いた残りに収まる幅（上限 430）・右下に凡例', async () => {
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(() => {
			const L = STITCH_LAYOUT;
			const legend = buildFactorFrameLegendBar(L.rightW, L.legendRef, true, { withTable: true, wrapNotes: true });
			const mk = (rows, top, gH) => composeFamilyImage({ idxs: [0, 1, 2], canvases: [__person(1179, 2342), __person(1179, gH || 1757), __person(1179, gH || 2521)], icons: [null, null, null],
				top: top ? (() => { const c = document.createElement('canvas'); c.width = 1153; c.height = 706; return c; })() : null,
				table: stitchTableData(__snap(rows, [__res({}), __res({}), __res({})]), [0, 1, 2]), legend, barText: 'S' })._layout;
			return { L, legendH: legend.height, r30: mk(30, true), r10: mk(10, true), r80: mk(80, true), r5: mk(5, false), short: mk(30, true, 400) };
		});
		const { L } = r;
		const pH = Math.round(2342 * 860 / 1179);
		assert(r.r30.parent.h === pH && r.r30.rightH === pH && r.r30.width === L.margin * 2 + L.leftW + L.gap + L.parentW + L.innerGap + L.rightW, '結合画像の構成(5): 親は幅860・右の高さ＝親の高さ・全体の幅は寸法どおり', r.r30);
		assert(r.r30.table.rowH >= 26 && r.r30.table.rowH <= 54 && r.r30.table.y + r.r30.table.h <= r.r30.bodyY + r.r30.rightH && r.r30.height === r.r30.bodyY + pH + L.margin,
			'結合画像の構成(5): 30行は 26〜54px の行で右の高さに収まる（全体は伸びない）', r.r30.table);
		assert(r.r10.table.rowH === 54 && r.r10.table.y + r.r10.table.h < r.r10.bodyY + r.r10.rightH - 100, '結合画像の構成(5): 10行は上限の 54px・表の下が余白', r.r10.table);
		assert(r.r80.table.rowH === 26 && r.r80.height === r.r80.table.y + r.r80.table.h + L.margin && r.r80.height > r.r80.bodyY + pH + L.margin,
			'結合画像の構成(5): 収まらない（80行）ときは下限の 26px で、全体を下へ伸ばす（2段組みにしない）', r.r80.table);
		assert(!r.r5.top && r.r5.table.y === r.r5.bodyY, '結合画像の構成(5): 上部が無いときは表が上に詰まる', r.r5.table);
		const g = r.r30.grands;
		assert(g.length === 2 && g[0].w === g[1].w && g[0].w <= 430 && g[1].y + g[1].h + L.gap + r.legendH <= r.r30.bodyY + pH + 1, '結合画像の構成(5): 祖2人は同じ幅・上限 430・凡例を引いた親の高さに収まる', g);
		assert(r.short.grands[0].w === 430, '結合画像の構成(5): 祖が短いときは上限の幅（親の半分）', r.short.grands);
		assert(r.r30.legend.x === g[0].x && r.r30.legend.y + r.r30.legend.h === r.r30.bodyY + pH, '結合画像の構成(5): 凡例は右下（祖の列・親の下端にそろえる）', r.r30.legend);
		assert(jsErrors(errors).length === 0, '結合画像の構成(5): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(6) ラベル: アイコンの直下・アイコンもパネルも隠さない（パネルより左の帯に収まる）・アイコンが無ければ画像の上端・実画像（継承画面と因子一覧）でもアイコンを見つける', async () => {
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(async (u) => {
			const icon = { x0: 40, x1: 170, y0: 0, y1: 140 };
			const pc = __person(1179, 2342, icon);
			const found = stitchPersonIconBox(pc);
			const lay = composeFamilyImage({ idxs: [0, 1, 2], canvases: [pc, __person(1179, 1757, icon), __person(1179, 2521)], icons: [found, stitchPersonIconBox(__person(1179, 1757, icon)), null],
				top: null, table: null, legend: null, barText: '' })._layout;
			const real = {};
			if (u.ph.length) for (const [k, list] of Object.entries(u)) real[k] = stitchPersonIconBox(await stitchOnePerson(await __filesOf(list), k));
			return { found, lay, real };
		}, haveImages ? { ph: imgs(CASES.ph1179), own: imgs(CASES.own765), list: imgs(CASES.list1170) } : { ph: [] });
		assert(r.found && r.found.x0 === 40 && r.found.x1 === 170 && r.found.y0 === 0 && r.found.y1 === 140, '結合画像の構成(6): 合成の画像でアイコンの範囲を見つける', r.found);
		r.lay.labels.forEach((l) => {
			if (l.icon) {
				assert(l.y >= l.icon.y1 && l.x + l.w <= l.stripRight + 0.5 && l.x >= l.icon.x0 - l.w, '結合画像の構成(6): ラベル ' + l.k + ' はアイコンの直下（アイコンより下）で、パネルより左の帯に収まる', l);
			} else {
				const g = r.lay.grands.find((x) => x.k === l.k);
				assert(g && l.y === g.y + 2 && l.x === g.x + 2 && l.x + l.w <= l.stripRight + 0.5, '結合画像の構成(6): アイコンが無い画像では、画像の上端（帯の左上）', { l, g });
			}
		});
		assert(r.lay.labels.length === 3, '結合画像の構成(6): 3人ともラベルがある', r.lay.labels.length);
		if (haveImages) {
			assert(r.real.ph && r.real.ph.y0 <= 5 && r.real.ph.y1 > 100 && r.real.ph.x1 < 1179 * 0.18, '結合画像の構成(6): 実画像（継承画面・1179幅）でアイコンを見つける', r.real.ph);
			assert(r.real.own && r.real.own.y1 > 60, '結合画像の構成(6): 実画像（自分の画面・765幅・銀髪のアイコン）でもアイコンを見つける', r.real.own);
			assert(r.real.list && r.real.list.kept && r.real.list.y1 > 200 && isFinite(r.real.list.freeBelow) && r.real.list.freeBelow > 0, '結合画像の構成(6): 因子一覧ではキャラクターの情報の欄のアイコンと、その下の空き（所持因子の帯まで）', r.real.list);
		} else assert(false, '結合画像の構成(6): 前提: test-images に素材がある', null);
		assert(jsErrors(errors).length === 0, '結合画像の構成(6): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(7) タイトルのバー: 全幅・高さ70・両端が丸い・色は上 #94D709 → 下 #6BC20C・白い文字「セット名｜レース条件（①の絞り込みの言い方・「・」でつなぐ）」・条件が無ければセット名だけ・長ければ 20px まで縮めて末尾を「…」', async () => {
		const ud = { schemaVersion: 7, records: [], customSkills: [], rosters: [Object.assign({ rosterId: 'r1', name: 'R', createdAt: 'x', updatedAt: 'x', skillFilter: { distance: 'medium', style: 'sashi' } }, R1S)],
			templates: [{ templateId: 't1', name: '名前のあるセット', skillIds: IDS.slice(), skillIcons: {}, parentHintLevel: 5, baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }] };
		const { ctx, page, errors } = await openSp({ userData: ud, roster: Object.assign({ skillFilter: { distance: 'medium', style: 'sashi' } }, R1S) });
		await page.evaluate(() => localStorage.setItem('umaSkillDeck:lastSet:special', 't1'));
		await page.reload({ waitUntil: 'networkidle' });
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
			const lay = composeFamilyImage({ idxs: [0, 1, 2], canvases: [__person(1179, 2342), null, null], icons: [null, null, null], top: null, table: null, legend: null, barText: text });
			const g = lay.getContext('2d');
			const px = (x, y) => { const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; };
			const b = lay._layout.bar;
			const xs = b.x + b.w * 0.1;
			const long = composeFamilyImage({ idxs: [0, 1, 2], canvases: [__person(1179, 2342), null, null], icons: [null, null, null], top: null, table: null, legend: null, barText: 'あ'.repeat(200) })._layout.barFit;
			const texts = []; const o = CanvasRenderingContext2D.prototype.fillText;
			CanvasRenderingContext2D.prototype.fillText = function (s, x, y) { texts.push({ s: String(s), color: this.fillStyle }); return o.apply(this, arguments); };
			composeFamilyImage({ idxs: [0, 1, 2], canvases: [__person(1179, 2342), null, null], icons: [null, null, null], top: null, table: null, legend: null, barText: text });
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

	await block('結合画像の構成(8) 凡例の文と画像に描く文字列: 凡例は3行＋「枠の無いパネルは、因子周回スキルに入れていないスキルです。」＋「数字は★の数・種数は★1以上」／組み立てで描くすべての文字列と、画像に描く文字列の定数に「①」「②」「③」が無い', async () => {
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(() => {
			const texts = []; const o = CanvasRenderingContext2D.prototype.fillText;
			CanvasRenderingContext2D.prototype.fillText = function (s) { texts.push(String(s)); return o.apply(this, arguments); };
			const L = STITCH_LAYOUT;
			const legend = buildFactorFrameLegendBar(L.rightW, L.legendRef, true, { withTable: true, wrapNotes: true });
			const legendTexts = texts.slice();
			composeFamilyImage({ idxs: [0, 1, 2], canvases: [__person(1179, 2342, { x0: 40, x1: 170, y0: 0, y1: 140 }), __person(1179, 1757), null], icons: [{ x0: 40, x1: 170, y0: 0, y1: 140, freeBelow: Infinity }, null, null],
				top: null, table: stitchTableData(__snap(4, [__res({ N0: 3, N1: null }), __res({}), null], ['card', 'star', 'other']), [0, 1, 2]), legend, barText: 'S｜中距離' });
			CanvasRenderingContext2D.prototype.fillText = o;
			return { legendTexts, texts, note: FACTOR_LEGEND_NOTE, tableNote: FACTOR_LEGEND_TABLE_NOTE, h: legend.height, w: legend.width };
		});
		assert(r.note === '枠の無いパネルは、因子周回スキルに入れていないスキルです。' && r.tableNote === '数字は★の数・種数は★1以上', '結合画像の構成(8): 凡例の断りの文が決定のとおり', r);
		const joined = r.legendTexts.join('');
		assert(['枠の見かた：', '周回サポカスキル', 'サポカ外スキル', 'その他（親から継承）'].every((s) => joined.includes(s)) && joined.includes(r.note) && joined.includes(r.tableNote) && r.w === 430,
			'結合画像の構成(8): 凡例（幅430）に3行と断りの2つの文（折り返し）がある', r.legendTexts);
		const bad = r.texts.filter((s) => /[①②③]/.test(s));
		assert(bad.length === 0 && r.texts.length > 20, '結合画像の構成(8): 組み立てで描いた文字列（バー・表・ラベル・凡例）に ①②③ が無い', bad);
		// コード側: 画像に描く文字列の定数（STITCH_TABLE_*・FACTOR_LEGEND_*）
		const src = fs.readFileSync(path.join(REPO_ROOT, 'special.html'), 'utf8');
		const consts = [...src.matchAll(/const (STITCH_TABLE_[A-Z_]+|FACTOR_LEGEND_(?:HEAD|NOTE|TABLE_NOTE)) = '([^']*)'/g)].map((m) => m[1] + '=' + m[2]);
		assert(consts.length >= 7 && consts.every((s) => !/[①②③]/.test(s)), '結合画像の構成(8): 画像に描く文字列の定数に ①②③ が無い', consts);
		assert(jsErrors(errors).length === 0, '結合画像の構成(8): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(9) OCR を押した時点の写し: その後に②や判定が変わっても、表の行・種類・バーの文字は写しのまま／「OCRしない」結合は表・凡例なし（バー・上部・右の3人だけ）', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS });
		await prep(page);
		const r = await page.evaluate(async () => {
			const keep = { s: window.stitchOnePerson, f: persons[0].files, snap: stitchSnapshot, scope: deckScope };
			const snap = captureStitchSnapshot();
			const n = snap.entries.length;
			snap.results = [__res({}), null, null];
			stitchSnapshot = snap;
			window.stitchOnePerson = async () => __person(1179, 2342);
			persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }];
			const kindsBefore = JSON.stringify(stitchKindByName());
			// 押した後に②を変える（行を1つに減らす）
			deckScope = Object.assign({}, deckScope, { skillIds: deckScope.skillIds.slice(0, 1) });
			const kindsAfter = JSON.stringify(stitchKindByName());
			const withOcr = await buildStitchedSetImage(0, null, true);
			const noOcr = await buildStitchedSetImage(0, null, false);
			window.stitchOnePerson = keep.s; persons[0].files = keep.f; stitchSnapshot = keep.snap; deckScope = keep.scope;
			return { n, rows: withOcr._layout.table ? withOcr._layout.table.rows : -1, legend: !!withOcr._layout.legend, kindsSame: kindsBefore === kindsAfter,
				no: { table: !!noOcr._layout.table, legend: !!noOcr._layout.legend, parent: !!noOcr._layout.parent, bar: !!noOcr._layout.bar } };
		});
		assert(r.n === IDS.length && r.rows === r.n && r.legend, '結合画像の構成(9): 押した後に②を変えても、表の行は押した時点のまま・凡例あり', r);
		assert(r.kindsSame, '結合画像の構成(9): 枠と表の種類も押した時点の判定のまま', r.kindsSame);
		assert(!r.no.table && !r.no.legend && r.no.parent && r.no.bar, '結合画像の構成(9): 「OCRしない」結合は表・凡例なし（バーと右の画像はある）', r.no);
		assert(jsErrors(errors).length === 0, '結合画像の構成(9): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('結合画像の構成(10) 実画像で枠がパネルの縁に合う: 1179幅・765幅の結合画像で、行の位置（detectSkillRows）から描いた枠の左の辺と上の辺が、元の画素のパネルの縁から ±（線の太さ＋1）px 以内', async () => {
		if (!haveImages) { assert(false, '結合画像の構成(10): 前提: test-images に素材がある', null); return; }
		const { ctx, page, errors } = await openSp();
		await prep(page);
		const r = await page.evaluate(async (u) => {
			const out = {};
			for (const [k, list] of Object.entries(u)) {
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
				stitchSnapshot = null; tierMarksEnabled = true;
				window.deckMarkerKindByName = () => kind;
				personGeometry[0] = geometry; personLines[0] = lines;
				personResults[0] = { detectedSkills: new Set(lines.map((l) => l.text)), skillSources: Object.fromEntries(lines.map((l, i) => [l.text, [i]])), skillStars: {}, matchReasons: {} };
				const c = await stitchOnePerson(fl, k);
				const before = c.getContext('2d').getImageData(0, 0, c.width, c.height);
				// 枠を描く位置を拾う（strokeFactorFrame の呼び出しを見る）
				const boxes = []; const os = window.strokeFactorFrame;
				window.strokeFactorFrame = function (ctx2, box, color) { boxes.push(Object.assign({}, box)); return os.apply(this, arguments); };
				drawFactorFramesOnPerson(c, 0);
				window.strokeFactorFrame = os;
				window.deckMarkerKindByName = keep.k; stitchSnapshot = keep.snap; personGeometry[0] = keep.g; personLines[0] = keep.l; personResults[0] = keep.r; tierMarksEnabled = keep.t;
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
}
