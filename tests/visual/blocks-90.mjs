// 遺伝子をレース条件で絞る（T60・2026-11-01。おいもさんの決定 C-258 の (2)-1 の続き）の検査。
// run-smoke.mjs の末尾から register90() で呼ばれる（塊の見出しはすべて「T60遺伝子の絞り込み」で始まる。`npm run test:visual -- --only=T60遺伝子の絞り込み` で回せる）。
//
// 決め（UmaStar＝special.html）:
//  - OCR の対象の遺伝子は、①の距離・脚質・バ場の指定に合うものだけ。指定の無い項目は、その項目の遺伝子を全部。どれも指定が無ければ data の全部（10種）。
//  - 遺伝子の id（ap- の後ろの語）と項目の値は同じ綴り（data/aptitude-genes.json の idNote）。
//  - 決まるのは「OCR処理＋画像結合を開始する」を押した時点の指定。押した後に指定を変えても、出た結果と結合画像は変えない。
//  - 照合結果の「＋遺伝子N種」・人ごとの「＋遺伝子N」・結合画像の遺伝子の枠と「名前：★N」・UmaSkill Deck へ渡す結果は、対象の遺伝子だけ。
//    対象外の遺伝子が写っていても検出しない（枠を付けない）。「枠の見かた」の「遺伝子」はいつも出す（C-261 の回答 2）。
//  - UmaExam は変えない。
// 遺伝子の名前は検査の側に書かない（data/aptitude-genes.json を Node 側で読む。恒久ルール1）。
import { reloadReady } from './lib/page-ready.mjs';

export async function register90(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
	const GENE_ENTRIES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'aptitude-genes.json'), 'utf8')).entries;
	const GENES = GENE_ENTRIES.map((e) => e.name);
	const nameOf = (tail) => GENE_ENTRIES.find((e) => e.id === 'ap-' + tail).name;
	const WIDTHS = [375, 1280];
	// 遺伝子の id の後ろの語 → 項目（決めの対応表。data の idNote と同じ）
	const AXIS_OF = { short: 'distance', mile: 'distance', medium: 'distance', long: 'distance', nige: 'style', senko: 'style', sashi: 'style', oikomi: 'style', turf: 'surface', dirt: 'surface' };
	const expectGenes = (sel) => GENE_ENTRIES.filter((e) => { const t = e.id.replace(/^ap-/, ''); return !sel[AXIS_OF[t]] || sel[AXIS_OF[t]] === t; }).map((e) => e.name);
	// OCR の代わりに返す遺伝子の行（★）。対象外のものも混ぜる
	const LINES = [['long', 3], ['medium', 2], ['senko', 1], ['nige', 2], ['turf', 1]].map(([t, s]) => ({ name: nameOf(t), stars: s }));
	// 人の見出しの行の並び（3つまでは data の順・4つ以上は★の多い順に3つ。同じ★は data の順）
	const expectHead = (target) => {
		const found = target.filter((n) => LINES.some((l) => l.name === n)).map((n, i) => ({ n, s: LINES.find((l) => l.name === n).stars, i }));
		const list = found.length <= 3 ? found : found.slice().sort((a, b) => (b.s - a.s) || (a.i - b.i)).slice(0, 3);
		return list.map((g) => g.n + '：★' + g.s);
	};
	const CASES = [
		{ label: '全部指定（長距離・先行・芝）', sel: { distance: 'long', style: 'senko', surface: 'turf' }, n: 3 },
		{ label: '脚質だけ指定なし（長距離・芝）', sel: { distance: 'long', surface: 'turf' }, n: 6 },
		{ label: 'どれも指定なし', sel: {}, n: 10 }
	];

	const closeNotices = async (page) => {
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
	};
	const openSp = async (w) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w < 641 ? 812 : 800 }, EMPTY);
		await sp.page.evaluate((ids) => {
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			// ①の絞り込みの行は育成ウマ娘を選んでいるときに出る
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ umaId: 'uma-0001', cardIds: [] }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, IDS);
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.waitForTimeout(500);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForFunction(() => typeof deckScope !== 'undefined' && deckScope && skillList.length > 0 && deckRosterPanel
			&& document.querySelector('#deck-roster-panel select[data-usd-act="filter"][data-axis="distance"]'), null, { timeout: 15000 }).catch(() => {});
		return sp;
	};
	/** ①の距離・脚質・バ場のセレクトを変える（①の画面の操作と同じ change） */
	const setFilter = (page, sel) => page.evaluate((sel) => {
		['distance', 'style', 'surface'].forEach((k) => {
			const el = document.querySelector('#deck-roster-panel select[data-usd-act="filter"][data-axis="' + k + '"]');
			if (!el) return;
			const v = sel[k] || '';
			if (el.value === v) return;
			el.value = v;
			el.dispatchEvent(new Event('change', { bubbles: true }));
		});
		return UmaSkillDeckCore.outside.resolvedFilterOf(deckRosterPanel.getRoster());
	}, sel);
	/** 押す（一体のボタンと同じ processImages）→ 結合画像（印つき）。OCR と人の画像は作り物 */
	const RUN = async (lines) => {
		const keep = { ppi: processPersonImages, tess: window.Tesseract, s: window.stitchOnePerson, t: tierMarksEnabled };
		const W = 1179, H = 2342;
		const rows = []; for (let y = 10; y < H - 60; y += 80) { rows.push({ y: y, h: 60, col: 0 }); rows.push({ y: y, h: 60, col: 1 }); }
		const geo = { rows: rows, columnXs: [Math.round(W * 0.19) + 50, Math.round(W * 0.60) + 50], scale: 1, naturalW: W, naturalH: H };
		processPersonImages = async () => ({ lines: lines.map((l, i) => ({ text: l.name, stars: l.stars, starsReliable: true, rowKey: '0:' + (4 + i * 2) })), skipped: [], warned: [], geometry: [geo] });
		window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, recognize: async () => ({ data: { text: '', lines: [] } }), terminate: async () => {} }) };
		persons.forEach((p) => { p.files = []; });
		persons[0].files = [new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })];
		const judged = await processImages({ keepClosed: true, quiet: true });
		const mkPerson = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, H);
			[[Math.round(W * 0.19), Math.round(W * 0.58)], [Math.round(W * 0.60), Math.round(W * 0.98)]].forEach(([a, b]) => { for (let y = 10; y < H - 60; y += 80) { g.fillStyle = 'rgb(226,226,226)'; g.fillRect(a, y, b - a, 60); } });
			c._sourcePlacements = []; c._profileHeader = { kept: false, ratio: 0.31, height: 0 }; return c; };
		window.stitchOnePerson = async () => mkPerson();
		tierMarksEnabled = true;
		window.__t60keep = keep;
		return judged;
	};
	/** 今の結果と、写しから描いた結合画像を読む */
	const READ = async () => {
		const res = personResults[0];
		const handoff = JSON.parse(localStorage.getItem('umaSkillDeck:ocrHandoff:special') || 'null');
		const texts = []; const o = CanvasRenderingContext2D.prototype.fillText;
		CanvasRenderingContext2D.prototype.fillText = function (s) { texts.push(String(s)); return o.apply(this, arguments); };
		let c = null, err = null;
		try { c = await buildStitchedSetImage(0, null, true); } catch (e) { err = String(e); } finally { CanvasRenderingContext2D.prototype.fillText = o; }
		const L = c ? c._layout : null;
		const gf = UmaSkillDeckCore.getCatalogEntries('geneFactor').map((e) => e.name);
		return {
			dictGenes: gf.filter((n) => skillList.includes(n)),
			detected: gf.filter((n) => res && res.detectedSkills.has(n)),
			snapGenes: stitchSnapshot ? stitchSnapshot.geneNames.slice() : null,
			total: document.getElementById('stat-total-factor').textContent, totalHidden: document.getElementById('stat-total-factor').hidden,
			found: document.getElementById('stat-found-factor-1').textContent,
			handoffGenes: handoff ? gf.filter((n) => handoff.skillNames.includes(n)) : null,
			handoffStars: handoff && handoff.persons[0] ? gf.filter((n) => Object.prototype.hasOwnProperty.call(handoff.persons[0].stars, n)) : null,
			err, gene: c ? c._geneFrameCount : null, head: L && L.heads[0] && L.heads[0].genes ? L.heads[0].genes.texts : [],
			legendGene: texts.includes(' 遺伝子')
		};
	};
	const RESTORE = () => {
		const k = window.__t60keep;
		if (k) { processPersonImages = k.ppi; window.Tesseract = k.tess; window.stitchOnePerson = k.s; tierMarksEnabled = k.t; }
		persons.forEach((p) => { p.files = []; });
	};

	await block('T60遺伝子の絞り込み(0) 遺伝子の id（ap- の後ろの語）と①の距離・脚質・バ場の値の綴りが1対1で対応する', async () => {
		const { ctx, page, errors } = await openSp(1280);
		const r = await page.evaluate(() => {
			const axes = UmaSkillDeckCore.ROSTER_FILTER_AXIS_KEYS.map((k) => UmaSkillDeckCore.TAG_AXES.find((a) => a.key === k));
			return { axes: axes.map((a) => ({ key: a.key, vs: a.options.map((o) => o.v) })), ids: UmaSkillDeckCore.getCatalogEntries('geneFactor').map((e) => e.id) };
		});
		const tails = r.ids.map((id) => id.replace(/^ap-/, ''));
		const values = r.axes.flatMap((a) => a.vs.map((v) => a.key + ':' + v));
		const fromGenes = tails.map((t) => (AXIS_OF[t] || '?') + ':' + t);
		assert(JSON.stringify(values.slice().sort()) === JSON.stringify(fromGenes.slice().sort()) && tails.every((t) => r.axes.find((a) => a.key === AXIS_OF[t]).vs.includes(t)),
			'T60(0): 項目の値（' + values.length + '）と遺伝子の id（' + tails.length + '）が1対1', { values, fromGenes });
		assert(jsErrors(errors).length === 0, 'T60(0): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	for (const cs of CASES) {
		await block('T60遺伝子の絞り込み(1) ' + cs.label + ': 照合の辞書の遺伝子・写し・「＋遺伝子N種」・人ごとの「＋遺伝子N」・Deck へ渡す結果・結合画像の遺伝子の枠と「名前：★N」が対象の遺伝子だけ（対象外は写っていても検出しない）・「枠の見かた」の「遺伝子」はいつも（375・1280px）', async () => {
			const want = expectGenes(cs.sel);
			const wantDet = want.filter((n) => LINES.some((l) => l.name === n));
			for (const w of WIDTHS) {
				const { ctx, page, errors } = await openSp(w);
				const got = await setFilter(page, cs.sel);
				const judged = await page.evaluate(RUN, LINES);
				const r = await page.evaluate(READ);
				await page.evaluate(RESTORE);
				const tag = 'T60(1) ' + cs.label + ' ' + w + 'px';
				assert(JSON.stringify(got) === JSON.stringify(cs.sel), tag + ': ①の指定が入った', got);
				assert(want.length === cs.n && judged && JSON.stringify(r.dictGenes) === JSON.stringify(want) && JSON.stringify(r.snapGenes) === JSON.stringify(want),
					tag + ': 照合の辞書と写しの遺伝子は ' + cs.n + '種（data の順）', { want, dict: r.dictGenes, snap: r.snapGenes });
				assert(JSON.stringify(r.detected) === JSON.stringify(wantDet), tag + ': 検出は対象の遺伝子だけ（対象外は写っていても検出しない）', { want: wantDet, got: r.detected });
				assert(!r.totalHidden && r.total === '＋遺伝子' + cs.n + '種' && r.found === '＋遺伝子' + wantDet.length, tag + ': 「＋遺伝子' + cs.n + '種」・親A の「＋遺伝子' + wantDet.length + '」', { total: r.total, found: r.found });
				assert(JSON.stringify(r.handoffGenes) === JSON.stringify(want) && JSON.stringify(r.handoffStars) === JSON.stringify(wantDet), tag + ': UmaSkill Deck へ渡す結果も対象の遺伝子だけ', { names: r.handoffGenes, stars: r.handoffStars });
				assert(!r.err && r.gene === wantDet.length && JSON.stringify(r.head) === JSON.stringify(expectHead(want)) && r.legendGene,
					tag + ': 結合画像の遺伝子の枠 ' + wantDet.length + '・人の見出しの行の「名前：★N」は対象だけ・「枠の見かた」に「遺伝子」', { err: r.err, gene: r.gene, head: r.head, want: expectHead(want), legend: r.legendGene });
				assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
				await ctx.close();
			}
		});
	}

	await block('T60遺伝子の絞り込み(2) 押した時点の指定で決まる: 押す前に指定を変えると変えた後の指定・押した後に指定を変えても結果（数・検出・Deck へ渡す結果）と結合画像は変わらない（375・1280px）', async () => {
		const A = CASES[0], NONE = CASES[2];
		for (const w of WIDTHS) {
			const { ctx, page, errors } = await openSp(w);
			// 押す前: 指定なしで辞書ができたあと、長距離・先行・芝に変えてから押す
			await setFilter(page, NONE.sel);
			await setFilter(page, A.sel);
			await page.evaluate(RUN, LINES);
			const before = await page.evaluate(READ);
			// 押した後: 指定を外す・別の指定に変える。②の中身が変わったとき（onChange）の作り直しも起こす
			await setFilter(page, NONE.sel);
			await page.evaluate(() => onDeckScopeSelected(deckTemplateManager.getSelection()));
			const after1 = await page.evaluate(READ);
			await setFilter(page, { distance: 'short', style: 'nige', surface: 'dirt' });
			const after2 = await page.evaluate(READ);
			await page.evaluate(RESTORE);
			const tag = 'T60(2) ' + w + 'px';
			const want = expectGenes(A.sel);
			assert(JSON.stringify(before.snapGenes) === JSON.stringify(want) && before.total === '＋遺伝子3種', tag + ': 押す前に変えた指定（長距離・先行・芝）で決まる', before);
			const pick = (r) => ({ detected: r.detected, snap: r.snapGenes, total: r.total, found: r.found, handoff: r.handoffGenes, stars: r.handoffStars, gene: r.gene, head: r.head });
			assert(JSON.stringify(pick(after1)) === JSON.stringify(pick(before)) && JSON.stringify(pick(after2)) === JSON.stringify(pick(before)),
				tag + ': 押した後に指定を変えても、結果と結合画像は押した時点のまま', { before: pick(before), after1: pick(after1), after2: pick(after2) });
			assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
			await ctx.close();
		}
	});

	await block('T60遺伝子の絞り込み(3) UmaExam は今までどおり（遺伝子は data の全部・レース条件で絞らない）（375・1280px）', async () => {
		for (const w of WIDTHS) {
			const { ctx, page, errors } = await openPage(browser, base, 'exam.html', { width: w, height: w < 641 ? 812 : 800 });
			await closeNotices(page);
			const r = await page.evaluate(() => ({ genes: APTITUDE_GENES.slice(), active: activeAptitudeGenes().slice(), hasScopeFn: typeof ocrFactorEntries !== 'undefined' }));
			const tag = 'T60(3) ' + w + 'px';
			assert(JSON.stringify(r.genes) === JSON.stringify(GENES) && (r.active.length === 0 || JSON.stringify(r.active) === JSON.stringify(GENES)) && !r.hasScopeFn,
				tag + ': UmaExam の遺伝子は data の全部（入れるときは全部）・絞り込みの関数は無い', r);
			assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
			await ctx.close();
		}
	});
}
