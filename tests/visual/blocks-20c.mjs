// C-140（2026-10-10・ツール全体の微調整2）C の検査: スキル名のコピー。run-smoke.mjs の末尾から register20c() で呼ばれる
// （塊の見出しはすべて「微調整2C」で始まる。`npm run test:visual -- --only=微調整2C` で回せる）。
//
// C1 3つのボタン・説明文の廃止／コピーの内容は一覧と同じ（全モード）／C2 件数の表記／C3 コピーのボタンはアイコンだけ（44px・崩れない）
// スキル名・効率の数値は検査の側に書かない（恒久ルール1。データから読む）。

export async function register20c(env) {
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
	const setMode = async (page, mode) => {
		await page.evaluate((m) => setTargetScopeMode(m), mode);
		if (mode === 'efficiency') await page.waitForFunction(() => !!effData, null, { timeout: 15000 });
		await page.waitForTimeout(150);
	};

	await block('微調整2C1 「スキル名のコピー」: 3つのボタン（全◯種・sp70緑・緑59種）と実質53種／59種個別の切り替えと冒頭の説明文は無い／コピーする内容は一覧と同じ（既定・広げる・絞る・効率を指定）', async () => {
		const { ctx, page, errors } = await openExam();
		await page.evaluate(() => { document.querySelectorAll('#step-panel-1 details').forEach((d) => { d.open = true; }); });
		const gone = await page.evaluate(() => ({
			ids: ['copylist-all133', 'copylist-sp70', 'copylist-green59', 'copylist-green59-mode', 'mode-equivalence-list', 'mode-individual-list', 'copylist-all133-count', 'copylist-sp70-count', 'copylist-all133-factor'].filter((id) => document.getElementById(id)),
			fns: ['selectCopyList', 'canonicalGreen59List'].filter((n) => typeof window[n] === 'function'),
			text: document.getElementById('skill-copy-textarea').closest('details').textContent,
			highlightModeBtns: ['mode-equivalence', 'mode-individual'].every((id) => !!document.getElementById(id)),
		}));
		assert(gone.ids.length === 0 && gone.fns.length === 0 && !/ご自身のスプレッドシート/.test(gone.text) && !/1行に1スキル名で出力/.test(gone.text) && gone.highlightModeBtns,
			'微調整2C1: 3つのコピーのボタン・緑59種の切り替え（コピー側）・冒頭の説明文は無い。技能試験ハイライトの切り替え（実質53種／59種個別）は残っている', gone);
		for (const [fact, gene] of [[true, true], [true, false], [false, true], [false, false]]) {
			await page.evaluate(([f, g]) => { setScenarioFactorsAll(f); setAptitudeGenesAll(g); }, [fact, gene]);
			for (const mode of ['default', 'expanded', 'curated', 'efficiency']) {
				await setMode(page, mode);
				for (const sort of [false, true]) {
					await page.evaluate((s0) => { if (registrySortByEff !== s0) toggleRegistrySort(); }, sort);
					const r = await page.evaluate(() => {
						const rows = [...document.querySelectorAll('#skill-registry-list > div')].map((d) => ({ name: d.children[1].firstElementChild.textContent, removed: !!d.querySelector('.registry-removed'), eff: d.querySelector('.registry-eff') ? d.querySelector('.registry-eff').textContent : '' }));
						const lines = document.getElementById('skill-copy-textarea').value.split('\n').map((l) => l.split('\t'));
						return { rows, lines, F: SCENARIO_INHERITANCE_FACTORS.length, G: APTITUDE_GENES.length };
					});
					const want = r.rows.filter((x) => !x.removed);
					const tag = '(' + mode + '・因子' + (fact ? 'あり' : 'なし') + '・遺伝子' + (gene ? 'あり' : 'なし') + '・並べ替え' + (sort ? 'ON' : 'OFF') + ')';
					assert(r.lines.length === want.length && r.lines.every((c, i) => c.length === 2 && c[0] === want[i].name && c[1] === want[i].eff) && want.length > 100,
						'微調整2C1' + tag + ': コピーの行は一覧の行と同じ（名前・並び・効率。2列のタブ区切り。効率の無い行は2列目が空。外した行は入らない）', { lines: r.lines.length, rows: want.length, head: r.lines.slice(0, 2) });
					if (sort) {
						const effs = r.lines.filter((c) => c[1] !== '').map((c) => Number(c[1]));
						// シナリオ因子・遺伝子（効率なし）は末尾に回り、効率のあるスキルは降順
						assert(effs.every((v, i) => i === 0 || effs[i - 1] >= v) && r.lines.slice(r.lines.length - ((fact ? r.F : 0) + (gene ? r.G : 0))).every((c) => c[1] === ''),
							'微調整2C1' + tag + ': 「効率の高い順」が ON なら、コピーも効率の降順で、末尾にシナリオ因子→遺伝子', { effsHead: effs.slice(0, 3) });
					}
				}
			}
		}
		// 効率を指定: 区間を外したスキルはコピーにも入らない
		await page.evaluate(() => { setScenarioFactorsAll(false); setAptitudeGenesAll(false); });
		await setMode(page, 'efficiency');
		await page.evaluate(() => { if (registrySortByEff) toggleRegistrySort(); });
		const before = await page.evaluate(() => document.getElementById('skill-copy-textarea').value.split('\n').length);
		await page.evaluate(() => { toggleEffTier(3); });
		const after = await page.evaluate(() => ({ n: document.getElementById('skill-copy-textarea').value.split('\n').length, want: effTargets().length, tier3: effData.targets.filter((t) => effTierOf(t.milli, effBounds) === 3).map((t) => t.name),
			names: document.getElementById('skill-copy-textarea').value.split('\n').map((l) => l.split('\t')[0]) }));
		assert(after.n === after.want && after.n === before - after.tier3.length && after.tier3.length > 0 && after.tier3.every((n) => !after.names.includes(n)),
			'微調整2C1(効率を指定): 区間を外すと、その区間のスキルはコピーにも入らない（一覧と同じ）', { before, after: after.n, want: after.want });
		assert(jsErrors(errors).length === 0, '微調整2C1: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	await block('微調整2C2 件数の表記は「スキルXXX種＋シナリオ因子24種＋遺伝子10種・ YYY行」（因子・遺伝子のチェックが外れていればその部分を書かない）', async () => {
		const { ctx, page, errors } = await openExam();
		for (const mode of ['default', 'expanded', 'curated', 'efficiency']) {
			await setMode(page, mode);
			for (const [fact, gene] of [[true, true], [true, false], [false, true], [false, false]]) {
				await page.evaluate(([f, g]) => { setScenarioFactorsAll(f); setAptitudeGenesAll(g); }, [fact, gene]);
				const r = await page.evaluate(() => {
					const rows = [...document.querySelectorAll('#skill-registry-list > div')].filter((d) => !d.querySelector('.registry-removed'));
					return { hint: document.getElementById('skill-copy-hint').textContent, F: activeScenarioFactors().length, G: activeAptitudeGenes().length, total: rows.length,
						lines: document.getElementById('skill-copy-textarea').value.split('\n').length };
				});
				const skillN = r.total - r.F - r.G;
				const want = 'スキル' + skillN + '種' + (r.F ? '＋シナリオ因子' + r.F + '種' : '') + (r.G ? '＋遺伝子' + r.G + '種' : '') + '・ ' + r.total + '行';
				assert(r.hint === want && r.lines === r.total && (fact ? r.F > 0 : r.F === 0) && (gene ? r.G > 0 : r.G === 0),
					'微調整2C2(' + mode + '・因子' + (fact ? 'あり' : 'なし') + '・遺伝子' + (gene ? 'あり' : 'なし') + '): 件数の表記は「' + want + '」（「・」の後ろに半角スペース1つ）', { got: r.hint, want });
			}
		}
		// 既定（因子・遺伝子なし）は「スキル133種・ 133行」
		await setMode(page, 'default');
		const d = await page.evaluate(() => document.getElementById('skill-copy-hint').textContent);
		assert(/^スキル\d+種・ \d+行$/.test(d), '微調整2C2: 因子・遺伝子を選んでいない既定は「スキルN種・ N行」だけ', d);
		assert(jsErrors(errors).length === 0, '微調整2C2: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	await block('微調整2C3 「コピー」のボタンは文字なしのアイコンだけ（44px以上の正方形・読み上げの名前は「コピー」・縦書きや折り返しが無い）／375・393・320・1280px／ライト・ダーク', async () => {
		for (const [w, theme] of [[375, 'light'], [393, 'light'], [320, 'light'], [1280, 'light'], [375, 'dark'], [320, 'dark']]) {
			const { ctx, page, errors } = await openExam({ w });
			await page.evaluate((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) {} document.documentElement.setAttribute('data-theme', t); }, theme);
			await page.evaluate(() => { document.querySelectorAll('#step-panel-1 details').forEach((d) => { d.open = true; }); setScenarioFactorsAll(true); setAptitudeGenesAll(true); });
			await page.evaluate(() => document.getElementById('skill-copy-btn').scrollIntoView({ block: 'center' }));
			await page.waitForTimeout(150);
			const r = await page.evaluate(() => {
				const b = document.getElementById('skill-copy-btn'), rc = b.getBoundingClientRect(), hint = document.getElementById('skill-copy-hint').getBoundingClientRect();
				const svg = b.querySelector('svg'), sr = svg ? svg.getBoundingClientRect() : null;
				const cs = getComputedStyle(b);
				return { w: rc.width, h: rc.height, text: b.textContent.trim(), label: b.getAttribute('aria-label'), hasSvg: !!svg, svgW: sr && sr.width, svgH: sr && sr.height, svgIn: !!sr && sr.left >= rc.left - 0.5 && sr.right <= rc.right + 0.5 && sr.top >= rc.top - 0.5 && sr.bottom <= rc.bottom + 0.5,
					writing: cs.writingMode, bg: cs.backgroundColor, rowRight: rc.right, panelRight: document.getElementById('skill-copy-textarea').getBoundingClientRect().right, hintBottom: hint.bottom, btnTop: rc.top,
					sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, hintLines: Math.round(hint.height / 14) };
			});
			assert(r.w >= 44 && r.h >= 44 && Math.abs(r.w - r.h) <= 0.5 && r.text === '' && r.label === 'コピー' && r.hasSvg && r.svgW >= 16 && r.svgIn && r.writing === 'horizontal-tb' && r.sw <= r.vw && r.rowRight <= r.panelRight + 0.5,
				'微調整2C3(' + w + 'px・' + theme + '): コピーのボタンは文字なし・アイコンが枠に収まる・44px以上の正方形（' + r.w.toFixed(1) + '×' + r.h.toFixed(1) + '）・名前は「コピー」・横書き・横にはみ出さない', r);
			// 押すと「コピーしました」の知らせ（今のまま）
			await page.evaluate(() => { document.getElementById('toast-message').textContent = ''; });
			await page.evaluate(() => { document.execCommand = (cmd) => true; });
			await page.click('#skill-copy-btn');
			const toast = await page.evaluate(() => document.getElementById('toast-message').textContent);
			assert(toast === 'スキル名をコピーしました', '微調整2C3(' + w + 'px・' + theme + '): 押すと「スキル名をコピーしました」と知らせる（今のまま）', toast);
			assert(jsErrors(errors).length === 0, '微調整2C3(' + w + 'px・' + theme + '): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});
}
