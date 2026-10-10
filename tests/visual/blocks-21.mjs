// C-141（2026-10-10・ツール全体の微調整3）の検査。run-smoke.mjs の末尾から register21() で呼ばれる
// （塊の見出しはすべて「微調整3」で始まる。`npm run test:visual -- --only=微調整3` で回せる）。
//
// A1 スキル名のコピー: 一覧の見出しとコピー欄の種数が同じ／行数＝種数の合計・並びが一覧と同じ（5つの範囲 × 並べ替え × 因子・遺伝子）／旧い部品が無い
// A2 見出し: 一言はどの幅でも「2nd Edition」のバッジの右隣（同じ行）・2行まで・8〜11px／見出しの高さは増えない／重ならない・はみ出さない
// B1 合計評価点（★補正）の計算（右回り○の例・複数・★を測れなかった行）／B2 結合画像の脚注の1行・折り返し・262px で1行
// C1 「効率を指定（βテスト）」の「？」の本文（3行・はみ出さない）
// スキル名・効率の数値は検査の側に書かない（恒久ルール1。データから読む）。ただし B1 の「右回り〇」だけは、おいもさんの指示の例として名前で引く（評価点はデータから読む）。

export async function register21(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const openExam = async (o = {}) => {
		const r = await openPage(browser, base, 'exam.html', { width: o.w || 1280, height: o.h || 900 });
		const page = r.page;
		await page.waitForTimeout(500);
		if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
		await page.evaluate(() => selectStepTab(1));
		await page.waitForFunction(() => !!effValueById, null, { timeout: 15000 });
		await page.waitForTimeout(200);
		return r;
	};
	// 5つの範囲（拡張モードは「既定」の範囲＋拡張モード）
	const setRange = async (page, range) => {
		await page.evaluate((m) => { setMelopMode(m === 'melop'); setTargetScopeMode(m === 'melop' ? 'default' : m); }, range);
		if (range === 'efficiency') await page.waitForFunction(() => !!effData, null, { timeout: 15000 });
		await page.waitForTimeout(120);
	};
	// 表示されている文字（script・style・textarea の中身を除く）
	const visibleText = (page) => page.evaluate(() => {
		const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
		let s = ''; while (w.nextNode()) s += w.currentNode.nodeValue; return s;
	});

	await block('微調整3A1 スキル名のコピー: 一覧の見出しとコピー欄の種数が一致・行数＝種数＋因子＋遺伝子・並びが一覧と同じ（既定・広げる・絞る・拡張モード・効率を指定 × 並べ替え × 因子・遺伝子）／効率を指定の既定（因子・遺伝子あり）は効率の対象の全部＋24＋10行／旧い3ボタン・説明文・「全133種」は無い', async () => {
		const { ctx, page, errors } = await openExam();
		await page.evaluate(() => { document.querySelectorAll('#step-panel-1 details').forEach((d) => { d.open = true; }); });
		let checked = 0;
		for (const range of ['default', 'expanded', 'curated', 'melop', 'efficiency']) {
			await setRange(page, range);
			for (const [fact, gene] of [[true, true], [true, false], [false, true], [false, false]]) {
				await page.evaluate(([f, g]) => { setScenarioFactorsAll(f); setAptitudeGenesAll(g); }, [fact, gene]);
				for (const sort of [false, true]) {
					await page.evaluate((s0) => { if (registrySortByEff !== s0) toggleRegistrySort(); }, sort);
					const r = await page.evaluate(() => {
						const head = [...document.querySelectorAll('#step-panel-1 summary')].find((s) => /一覧を確認する/.test(s.textContent)).textContent.replace(/\s+/g, '');
						const hint = document.getElementById('skill-copy-hint').textContent;
						const rows = [...document.querySelectorAll('#skill-registry-list > div')].filter((d) => !d.querySelector('.registry-removed')).map((d) => d.children[1].firstElementChild.textContent);
						const lines = document.getElementById('skill-copy-textarea').value.split('\n');
						return { head, hint, rows, names: lines.map((l) => l.split('\t')[0]), cols: lines.map((l) => l.split('\t').length), F: activeScenarioFactors().length, G: activeAptitudeGenes().length };
					});
					const tag = '(' + range + '・因子' + (fact ? 'あり' : 'なし') + '・遺伝子' + (gene ? 'あり' : 'なし') + '・並べ替え' + (sort ? 'ON' : 'OFF') + ')';
					const hm = r.head.match(/^対象スキル(\d+)種(.*)の一覧を確認する$/), cm = r.hint.match(/^スキル(\d+)種(.*)・ (\d+)行$/);
					assert(hm && cm && hm[1] === cm[1] && hm[2] === cm[2] && Number(hm[1]) > 100,
						'微調整3A1' + tag + ': 一覧の見出し「' + r.head + '」とコピー欄「' + r.hint + '」の種数（スキル・シナリオ因子・遺伝子）が一致', { head: r.head, hint: r.hint });
					const skills = cm ? Number(cm[1]) : -1;
					assert(cm && Number(cm[3]) === r.names.length && r.names.length === skills + r.F + r.G && r.cols.every((c) => c === 2) && JSON.stringify(r.names) === JSON.stringify(r.rows),
						'微調整3A1' + tag + ': 行数 ' + r.names.length + ' ＝ 種数の合計（' + skills + '＋' + r.F + '＋' + r.G + '）・並びは一覧と同じ・2列', { lines: r.names.length, skills, F: r.F, G: r.G });
					checked++;
				}
			}
		}
		assert(checked === 40, '微調整3A1: 5つの範囲 × 因子・遺伝子4通り × 並べ替え2通り ＝ 40通りを確かめた（空振りでない）', checked);
		// 効率を指定の既定（全区間・因子と遺伝子あり・並べ替え ON）: 効率の対象の全部＋シナリオ因子＋遺伝子。効率の降順で末尾に因子→遺伝子
		await setRange(page, 'efficiency');
		await page.evaluate(() => { resetEffSettings(); setScenarioFactorsAll(true); setAptitudeGenesAll(true); if (!registrySortByEff) toggleRegistrySort(); });
		const e = await page.evaluate(() => ({ all: effData.targets.length, now: effTargets().length, F: SCENARIO_INHERITANCE_FACTORS.length, G: APTITUDE_GENES.length, factors: SCENARIO_INHERITANCE_FACTORS.slice(), genes: APTITUDE_GENES.slice(),
			hint: document.getElementById('skill-copy-hint').textContent, lines: document.getElementById('skill-copy-textarea').value.split('\n').map((l) => l.split('\t')) }));
		const n = e.all + e.F + e.G;
		const effs = e.lines.slice(0, e.all).map((c) => Number(c[1]));
		const tail = e.lines.slice(e.all).map((c) => c[0]);
		assert(e.now === e.all && e.lines.length === n && e.hint === 'スキル' + e.all + '種＋シナリオ因子' + e.F + '種＋遺伝子' + e.G + '種・ ' + n + '行'
			&& effs.every((v, i) => !Number.isNaN(v) && (i === 0 || effs[i - 1] >= v)) && JSON.stringify(tail) === JSON.stringify(e.factors.concat(e.genes)),
			'微調整3A1(効率を指定の既定): 「' + e.hint + '」（いまのデータで ' + n + '行）。効率の降順で、末尾にシナリオ因子→遺伝子', { hint: e.hint, lines: e.lines.length });
		// 旧い部品・文言は DOM のどこにも無い
		const txt = await visibleText(page);
		const old = await page.evaluate(() => ['copylist-all133', 'copylist-sp70', 'copylist-green59', 'copylist-green59-mode', 'copylist-all133-count'].filter((id) => document.getElementById(id)));
		assert(old.length === 0 && !/全133種/.test(txt) && !/ご自身のスプレッドシート/.test(txt) && !/登録順・範囲とカスタム設定を反映/.test(txt) && !/167行/.test(e.hint),
			'微調整3A1: 旧い3ボタン・説明文「ご自身のスプレッドシート…」・「全133種」・「登録順・範囲とカスタム設定を反映」は無い（効率を指定の既定で「167行」でもない）', { old, has133: /全133種/.test(txt) });
		assert(jsErrors(errors).length === 0, '微調整3A1: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	// 見出しの高さの基準（微調整2の先端 7152a07 の実測）: 640px以下は57px・1280px は110px
	const HDR_MAX = (w) => (w <= 640 ? 57 : 110);
	const openTool = async (which, w, theme) => {
		const r = await openPage(browser, base, which + '.html', { width: w, height: 800 });
		const page = r.page;
		if (theme) { await page.evaluate((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) {} }, theme); await page.reload({ waitUntil: 'networkidle' }); }
		await page.waitForTimeout(500);
		return r;
	};
	const headerProbe = (page) => page.evaluate(() => {
		const hd = document.querySelector('header'), h1 = hd.querySelector('h1'), pill = hd.querySelector('.header-edition-pill'), tag = hd.querySelector('.header-tagline');
		const acts = h1.parentElement.parentElement.nextElementSibling;
		const R = (el) => el.getBoundingClientRect();
		const H = R(hd), T = R(h1), P = R(pill), G = R(tag), A = R(acts);
		const lh = parseFloat(getComputedStyle(tag).lineHeight);
		return { hdrH: H.height, hdrL: H.left, hdrR: H.right, hdrT: H.top, hdrB: H.bottom, h1fs: parseFloat(getComputedStyle(h1).fontSize), h1T: T.top, h1B: T.bottom, h1R: T.right,
			pillL: P.left, pillR: P.right, pillT: P.top, pillB: P.bottom, pillText: pill.innerText.trim(), pillFs: parseFloat(getComputedStyle(pill).fontSize),
			tagL: G.left, tagR: G.right, tagT: G.top, tagB: G.bottom, tagFs: parseFloat(getComputedStyle(tag).fontSize), tagLines: Math.round(G.height / lh), tagText: tag.textContent.trim(),
			actsL: A.left, beta: hd.querySelector('.header-edition') ? hd.querySelector('.header-edition').textContent : null,
			belowP: [...hd.querySelectorAll('p')].filter((p) => /技能試験特化ツール|チャンミ\/LoH用ツール/.test(p.textContent)).length,
			sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
	});

	await block('微調整3A2 見出しの一言（チャンミ/LoH用ツール・技能試験特化ツール）は、どの幅でも「2nd Edition」のバッジの右隣（タイトルと同じ行）・2行まで・8〜11px／見出しの高さは微調整2の先端以下／バッジ・ボタンと重ならず、見出しからはみ出さない／タイトルの文字は両ツールで同じ／exam にバッジがあり、見出しの下の一言の行は無い（320〜1280px・ライト・ダーク）', async () => {
		let n = 0;
		for (const w of [320, 360, 375, 393, 430, 640, 1280]) {
			for (const theme of ['light', 'dark']) {
				const fsBy = {};
				for (const which of ['special', 'exam']) {
					const { ctx, page, errors } = await openTool(which, w, theme);
					const p = await headerProbe(page);
					const tag = which + '・' + w + 'px・' + theme;
					fsBy[which] = p.h1fs;
					assert(p.tagText === (which === 'special' ? 'チャンミ/LoH用ツール' : '技能試験特化ツール') && /^2nd( Edition)?$/.test(p.pillText) && p.pillFs >= 10,
						'微調整3A2(' + tag + '): 「2nd Edition」のバッジ（文字10px以上）と一言がある', { tag: p.tagText, pill: p.pillText, pillFs: p.pillFs });
					assert(p.tagL >= p.pillR - 0.5 && p.pillL >= p.h1R - 0.5 && p.tagT >= p.h1T - 0.5 && p.tagB <= p.h1B + 0.5,
						'微調整3A2(' + tag + '): 一言はバッジの右隣（左端 ' + p.tagL.toFixed(1) + ' ≥ バッジの右端 ' + p.pillR.toFixed(1) + '）で、縦はタイトルの行の内側（' + p.tagT.toFixed(1) + '〜' + p.tagB.toFixed(1) + ' ⊂ ' + p.h1T.toFixed(1) + '〜' + p.h1B.toFixed(1) + '）', p);
					assert(p.tagLines >= 1 && p.tagLines <= 2 && p.tagFs >= 8 - 0.01 && p.tagFs <= 11 + 0.01,
						'微調整3A2(' + tag + '): 一言は ' + p.tagFs + 'px・' + p.tagLines + '行（8〜11px・2行まで）', { fs: p.tagFs, lines: p.tagLines });
					assert(p.hdrH <= HDR_MAX(w) + 0.5 && p.tagR <= p.actsL + 0.5 && p.tagR <= p.hdrR + 0.5 && p.tagT >= p.hdrT && p.tagB <= p.hdrB && p.sw <= p.vw,
						'微調整3A2(' + tag + '): 見出しの高さ ' + p.hdrH + 'px（基準 ' + HDR_MAX(w) + 'px 以下）・一言はボタンより左で見出しの内側・横にはみ出さない', p);
					if (which === 'exam') assert(p.beta === null && p.belowP === 0, '微調整3A2(' + tag + '): exam に「β版」は無く、見出しの下の一言の行（<p>）も無い', { beta: p.beta, belowP: p.belowP });
					else assert(p.beta === 'β版', '微調整3A2(' + tag + '): special の「β版」は残っている', p.beta);
					assert(jsErrors(errors).length === 0, '微調整3A2(' + tag + '): コンソールエラーなし', errors.slice(0, 3));
					n++;
					await ctx.close();
				}
				assert(fsBy.special === fsBy.exam, '微調整3A2(' + w + 'px・' + theme + '): タイトルの文字の大きさは両ツールで同じ（' + fsBy.special + 'px）', fsBy);
			}
		}
		assert(n === 28, '微調整3A2: 7幅 × ライト・ダーク × 2ツール ＝ 28通りを確かめた', n);
	});

	/* ====================================================================
	 * B: 合計評価点（★補正）と脚注（効率を指定の結合画像）
	 * ==================================================================== */
	// 拡張モードの照合を、仕込んだ行（名前・★）で作り、効率を指定の合計を計算させる
	const starTotals = (page, rows) => page.evaluate((rows) => {
		const lines = rows.map((r, i) => ({ text: r.name, stars: r.stars, starsReliable: true, rowKey: '0:' + i }));
		const keep = personMelop;
		personMelop = PERSON_LABELS.map(() => null);
		personMelop[0] = { res: matchMelopLines(lines, melopSheet), top: { found: true, uniqueStars: 1, blue: null, red: null, extraLines: [] } };
		try {
			const run = { eff: { bounds: effBounds.slice(), tiers: [true, true, true, true] } };
			const tot = effTotals(0, run);
			return { tot, lines: effTotalLines(tot) };
		} finally { personMelop = keep; }
	}, rows);
	// C-142（微調整4・B）: 切り捨ての整数・3桁区切り（小数点は出さない）
	const fmt1 = (v) => Math.floor(v + 1e-9).toLocaleString('en-US');

	await block('微調整3B1 「合計評価点（★補正）」＝Σ(評価点×★の数)÷3（★3＝1・★2＝2/3・★1＝1/3）・切り捨ての整数・3桁区切り（微調整4・B）／右回り○（おいもさんの例 529×2/3 → 352）／複数のスキルの合計／★を測れなかった行は入れない／1行目は補正なしのまま', async () => {
		const { ctx, page, errors } = await openExam();
		await page.evaluate(() => setTargetScopeMode('efficiency'));
		await page.waitForFunction(() => !!effData && !!melopSheet, null, { timeout: 15000 });
		// おいもさんの例。評価点はデータから読む（例の 529 と違えば、データの値で確かめる）
		const ex = await page.evaluate(() => { const t = effData.targets.find((x) => /^右回り[○〇]$/.test(x.name)); return t ? { name: t.name, score: t.score, sp: t.sp } : null; });
		assert(!!ex && ex.score > 0, '微調整3B1: 例の「右回り○」が効率のデータにある（評価点 ' + (ex && ex.score) + '）', ex);
		for (const k of [1, 2, 3]) {
			const r = await starTotals(page, [{ name: ex.name, stars: k }]);
			const want = '合計評価点（★補正）:' + fmt1(ex.score * k / 3);
			assert(r.lines[1] === want && r.tot.starScore === ex.score * k && r.tot.starCount === 1 && r.lines[0] === '合計評価点/合計SP:' + (ex.score / ex.sp).toFixed(3),
				'微調整3B1(右回り○・★' + k + '): 2行目は「' + want + '」（' + ex.score + '×' + k + '/3 の切り捨て）。1行目は★を掛けない「合計評価点/合計SP」のまま', r);
			// 微調整4・B: 小数点は出さない。おいもさんの例（評価点 529）なら ★1＝176・★2＝352（352.67 の端数を切り捨て）・★3＝529
			assert(!/\./.test(r.lines[1].split(':')[1]) && (ex.score !== 529 || r.lines[1] === '合計評価点（★補正）:' + ({ 1: '176', 2: '352', 3: '529' })[k]),
				'微調整4B(右回り○・★' + k + '): 値は切り捨ての整数で、小数点が出ない（' + r.lines[1] + '）', r.lines);
		}
		// 複数のスキル（データの並びから、区間の違う何種かを★1〜3で）
		const many = await page.evaluate(() => { const ts = effData.targets.filter((t) => t.id && !/\+$/.test(t.name)); return [0, 7, 19, 40, 61, 88].map((i, j) => ({ name: ts[i].name, stars: (j % 3) + 1, score: ts[i].score, sp: ts[i].sp })); });
		const r2 = await starTotals(page, many);
		const W = many.reduce((a, x) => a + x.score * x.stars, 0), S = many.reduce((a, x) => a + x.score, 0), P = many.reduce((a, x) => a + x.sp, 0);
		assert(r2.tot.count === many.length && r2.tot.starScore === W && r2.lines[1] === '合計評価点（★補正）:' + fmt1(W / 3) && r2.lines[0] === '合計評価点/合計SP:' + (S / P).toFixed(3),
			'微調整3B1(' + many.length + '種・★1〜3): 2行目は「評価点×★の数」の合計（' + W + '）÷3 ＝ ' + fmt1(W / 3) + '（途中で丸めない）', { lines: r2.lines, W, count: r2.tot.count });
		assert(Math.abs(W / 3 - many.reduce((a, x) => a + x.score * ({ 1: 1 / 3, 2: 2 / 3, 3: 1 })[x.stars], 0)) < 1e-6,
			'微調整3B1: 重みは ★3＝1・★2＝2/3・★1＝1/3（「×★の数÷3」と同じ）', W);
		// ★を測れなかった行（null）は★補正の合計に入れない（1行目の補正なしには入る）
		const r3 = await starTotals(page, many.map((x, i) => (i === 0 ? Object.assign({}, x, { stars: null }) : x)));
		const W3 = many.slice(1).reduce((a, x) => a + x.score * x.stars, 0);
		assert(r3.tot.starSkipped === 1 && r3.tot.starCount === many.length - 1 && r3.tot.starScore === W3 && r3.lines[0] === r2.lines[0] && r3.lines[1] === '合計評価点（★補正）:' + fmt1(W3 / 3),
			'微調整3B1: ★を測れなかった行は★補正の合計に入れない（1行目は変わらない）', r3.tot);
		// 該当が無いとき・ほかの表示
		const zero = await page.evaluate(() => effTotalLines({ score: 0, sp: 0, count: 0, starScore: 0, starCount: 0 }));
		assert(zero[1] === '合計評価点（★補正）:0', '微調整3B1: 該当が無いときは「0」', zero);
		// 「合計評価点:」（補正なしの単純な合計）の行は、結合画像のどこにも作らない（ソースにも残っていない）
		const src = await page.evaluate(async () => (await (await fetch('exam.html', { cache: 'no-store' })).text()));
		assert(!/'合計評価点:'/.test(src) && /合計評価点（★補正）/.test(src), '微調整3B1: 補正なしの「合計評価点:」の行は無い（2行目は「合計評価点（★補正）」に置き換えた）', null);
		assert(jsErrors(errors).length === 0, '微調整3B1: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	await block('微調整3B2 効率を指定の結合画像の脚注: 既存の脚注の下に「※”合計評価点（★補正）”は、…（★3＝1、★2＝2/3、★1＝1/3）。」を別の行で（検出数カードのオン・オフに関わらず）／収まらなければ句読点の切れ目で折り返す／ほかのモードには出さない／ラベルが長くなっても1行・最小6px（列の幅262px）', async () => {
		const { ctx, page, errors } = await openExam();
		await page.evaluate(() => setTargetScopeMode('efficiency'));
		await page.waitForFunction(() => !!effData, null, { timeout: 15000 });
		const WANT = '※”合計評価点（★補正）”は、各スキルの評価点に重みづけをした合計値です（★3＝1、★2＝2/3、★1＝1/3）。';
		for (const w of [262, 765, 1170, 2340]) {
			const r = await page.evaluate(({ w }) => {
				const rows = [];
				const orig = stitchNoteTextRow;
				stitchNoteTextRow = (ctx, text) => { rows.push(text); return orig(ctx, text); };
				const out = {};
				try {
					for (const [k, info] of [['eff', { effNote: true }], ['effNoCards', { effNote: true, suppressed: [] }], ['other', { kinds: [] }]]) {
						rows.length = 0;
						stitchDrawSharedNoteBar(w, w, info, { legend: k !== 'eff', conditions: false }, null, []);
						out[k] = rows.slice();
					}
				} finally { stitchNoteTextRow = orig; }
				const ctx = document.createElement('canvas').getContext('2d');
				const m = stitchNoteMetrics(ctx, w, w, STITCH_COUNT_NOTE);
				out.maxW = m.maxTextWidth;
				out.widths = out.eff.map((t) => ctx.measureText(t).width);
				out.countLines = stitchWrapText(ctx, EFF_COUNT_NOTE, m.maxTextWidth).length > 1 ? EFF_COUNT_NOTE.split('。').filter(Boolean).length : 1;
				out.note = EFF_STAR_NOTE;
				out.countNote = EFF_COUNT_NOTE;
				return out;
			}, { w });
			const idx = r.eff.findIndex((t) => t.startsWith('※”'));
			const starLines = idx >= 0 ? r.eff.slice(idx) : [];
			assert(r.note === WANT && idx >= 1 && starLines.join('') === WANT && r.eff.slice(0, idx).join('') === r.countNote,
				'微調整3B2(' + w + 'px): 既存の脚注（' + idx + '行）の下に、★補正の脚注を別の行で置く（文面は指定のとおり）', { rows: r.eff });
			assert(r.widths.every((x) => x <= r.maxW + 0.5) && starLines.slice(0, -1).every((t, i) => /[、。]$/.test(t) || /^（/.test(starLines[i + 1])),
				'微調整3B2(' + w + 'px): 脚注は ' + starLines.length + '行。幅に収まり、折り返すときは「、」「。」のあとか括弧の前（語の途中では切らない）', { starLines, maxW: r.maxW });
			assert(JSON.stringify(r.effNoCards) === JSON.stringify(r.eff) && !r.other.some((t) => /★補正/.test(t)),
				'微調整3B2(' + w + 'px): 検出数カードの設定に関わらず出す／効率を指定でないときは出さない', { other: r.other });
		}
		// 列の幅262px: 2行目のラベルが長くなっても、1行に収める（収まらないときは文字と数字を一緒に縮める・最小6px）。数字の左端は2行でそろう
		const L = await page.evaluate(() => { const L = effTotalLayout(262, ['合計評価点/合計SP:6.220', '合計評価点（★補正）:14,533']); return { lab: L.lab, num: L.num, lab0: L.lab0, num0: L.num0, need: L.need, innerW: L.innerW, labelW: L.labelW }; });
		assert(L.need <= L.innerW + 0.5 && L.lab >= 6, '微調整3B2: 列の幅262pxで、2行目「合計評価点（★補正）:14,533」も1行に収まる（ラベル ' + L.lab + 'px・数字 ' + L.num + 'px）', L);
		assert(jsErrors(errors).length === 0, '微調整3B2: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	/* ====================================================================
	 * C: 「効率を指定（βテスト）」の「？」の説明
	 * ==================================================================== */
	await block('微調整3C1 「効率を指定（βテスト）」の「？」の本文は指定の3行（1行目は「…”合計評価点（★補正）”を示すモードです。」）／見出し・閉じ方は変えない／折り返しても小窓からはみ出さない（375・393・1280px・ライト・ダーク）', async () => {
		const WANT = ['・効率（合計評価点÷合計消費SP）や、各スキルの評価点に★の数で重みづけをした”合計評価点（★補正）”を示すモードです。',
			'・効率はすべての適性がAであるものとして示しています。',
			'・継承固有・レース因子(スキル)は対象に含まれません。'];
		for (const [w, theme] of [[375, 'light'], [393, 'light'], [1280, 'light'], [375, 'dark'], [393, 'dark'], [1280, 'dark']]) {
			const { ctx, page, errors } = await openExam({ w });
			await page.evaluate((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) {} document.documentElement.setAttribute('data-theme', t); }, theme);
			await page.evaluate(() => document.getElementById('eff-help-btn').scrollIntoView({ block: 'center' }));
			await page.click('#eff-help-btn');
			await page.waitForTimeout(150);
			const r = await page.evaluate(() => {
				const box = document.getElementById('eff-help-box'), el = document.getElementById('eff-help-text');
				const B = box.getBoundingClientRect(), T = el.getBoundingClientRect();
				return { text: el.textContent, hidden: box.hidden, title: (box.querySelector('h2, h3, [id$="title"]') || {}).textContent || '',
					inside: T.left >= B.left - 0.5 && T.right <= B.right + 0.5 && T.top >= B.top - 0.5 && T.bottom <= B.bottom + 0.5,
					overflowX: el.scrollWidth > el.clientWidth + 0.5, boxInView: B.left >= -0.5 && B.right <= innerWidth + 0.5, sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
			});
			const tag = w + 'px・' + theme;
			assert(!r.hidden && r.text === WANT.join('\n') && /効率を指定（βテスト）/.test(r.title),
				'微調整3C1(' + tag + '): 見出しは「効率を指定（βテスト）」のまま、本文は指定の3行', { text: r.text, title: r.title });
			assert(r.inside && !r.overflowX && r.boxInView && r.sw <= r.vw, '微調整3C1(' + tag + '): 本文は折り返しても小窓の内側（はみ出さない・横にはみ出さない）', r);
			await page.keyboard.press('Escape');
			await page.waitForTimeout(100);
			assert(await page.evaluate(() => document.getElementById('eff-help-box').hidden), '微調整3C1(' + tag + '): Esc で閉じる（閉じ方は変えていない）', null);
			assert(jsErrors(errors).length === 0, '微調整3C1(' + tag + '): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});
}
