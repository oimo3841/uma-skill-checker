// C-141（2026-10-10・ツール全体の微調整3）の検査。run-smoke.mjs の末尾から register21() で呼ばれる
// （塊の見出しはすべて「微調整3」で始まる。`npm run test:visual -- --only=微調整3` で回せる）。
//
// A1 スキル名のコピー: 一覧の見出しとコピー欄の種数が同じ／行数＝種数の合計・並びが一覧と同じ（5つの範囲 × 並べ替え × 因子・遺伝子）／旧い部品が無い
// A2 見出し: 一言はどの幅でも「2nd Edition」のバッジの右隣（同じ行）・2行まで・8〜11px／見出しの高さは増えない／重ならない・はみ出さない
// スキル名・効率の数値は検査の側に書かない（恒久ルール1。データから読む）。

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
}
