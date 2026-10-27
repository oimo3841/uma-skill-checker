// C-142（2026-10-11・ツール全体の微調整4）の検査。run-smoke.mjs の末尾から register22() で呼ばれる
// （塊の見出しはすべて「微調整4」で始まる。`npm run test:visual -- --only=微調整4` で回せる）。
//
// C1 効率を指定のバーの上の値（最小・境目3つ・最大）は小数第2位（最小は切り捨て・境目と最大は切り上げ）。初期は1行・重ならない・バーの幅の内側
// D1 「対象スキルN種の一覧を確認する」の行は必ず1行。名前が入らない行だけフェード（mask）・効率は全桁・title に全文
// D2 いちばん長い名前の行（320px）／D3 幅を変えるとフェードの有無が更新される
// E1 告知の文面（見出し無し・UmaExam OCR・本文・箇条書き3つ・UmaStar の節が無い）／exam だけに出す（special には自動表示もメニューの項目も無い）
// スキル名・効率の数値は検査の側に書かない（恒久ルール1。データから読む）。

export async function register22(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const openExam = async (o = {}) => {
		const r = await openPage(browser, base, 'exam.html', { width: o.w || 1280, height: o.h || 900 });
		const page = r.page;
		if (o.theme) { await page.evaluate((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) {} }, o.theme); await page.reload({ waitUntil: 'networkidle' }); }
		await page.waitForTimeout(500);
		if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
		await page.evaluate(() => selectStepTab(1));
		await page.waitForFunction(() => !!effValueById, null, { timeout: 15000 });
		await page.waitForTimeout(200);
		return r;
	};
	const fmt2 = (m, up) => { const h = up ? Math.ceil(m / 10) : Math.floor(m / 10); return Math.floor(h / 100) + '.' + String(h % 100).padStart(2, '0'); };

	/* ====================================================================
	 * C: バーの上の値
	 * ==================================================================== */
	const readVals = (page) => page.evaluate(() => {
		const sc = document.querySelector('#eff-panel .eff-scale').getBoundingClientRect();
		const vals = ['min', '0', '1', '2', 'max'].map((k) => { const e = document.querySelector('#eff-panel .eff-val[data-val="' + k + '"]'); const r = e.getBoundingClientRect(); return { k, text: e.textContent, l: r.left - sc.left, r: r.right - sc.left, t: Math.round(r.top - sc.top) }; });
		return { vals, W: sc.width, min: effData.min, max: effData.max, b: effBounds.slice(), ranges: [0, 1, 2, 3].map((k) => effRangeLabel(k, effBounds)), steps: effData.steps.slice() };
	});
	const overlaps = (vals) => { const bad = []; for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) { const a = vals[i], c = vals[j]; if (a.t === c.t && a.l < c.r + 3.5 && c.l < a.r + 3.5) bad.push(a.k + '×' + c.k); } return bad; };

	await block('微調整4C1 効率を指定のバーの上の値は小数第2位（最小は切り捨て・境目と最大は切り上げ。結合画像の範囲の表示と同じ）／初期は5つが1行に並び、重ならず（間4px以上）、バーの幅の内側（320〜1280px・ライト・ダーク）／境目を両端に寄せても重ならない', async () => {
		const report = [];
		for (const w of [320, 360, 375, 393, 430, 1280]) {
			for (const theme of ['light', 'dark']) {
				const { ctx, page, errors } = await openExam({ w, theme });
				await page.evaluate(() => setTargetScopeMode('efficiency'));
				await page.waitForFunction(() => !!effData && document.querySelectorAll('#eff-panel .eff-val').length === 5, null, { timeout: 15000 });
				await page.waitForTimeout(200);
				const r = await readVals(page);
				const tag = w + 'px・' + theme;
				const want = [fmt2(r.min, false), fmt2(r.b[0], true), fmt2(r.b[1], true), fmt2(r.b[2], true), fmt2(r.max, true)];
				const fromRanges = [r.ranges[0].split('-')[1], r.ranges[0].split('-')[0], r.ranges[1].split('-')[0], r.ranges[2].split('-')[0], r.ranges[3].split('-')[0]];
				assert(JSON.stringify(r.vals.map((v) => v.text)) === JSON.stringify(want) && JSON.stringify(want) === JSON.stringify(fromRanges),
					'微調整4C1(' + tag + '): 値は「' + want.join('／') + '」（小数第2位。結合画像の範囲の表示「' + r.ranges.slice().reverse().join('・') + '」と同じ）', { got: r.vals.map((v) => v.text), want, fromRanges });
				const sorted = r.vals.slice().sort((a, b) => a.l - b.l);
				const gaps = sorted.slice(1).map((v, i) => v.l - sorted[i].r);
				assert(new Set(r.vals.map((v) => v.t)).size === 1 && gaps.every((g) => g >= 3.5) && r.vals.every((v) => v.l >= -0.5 && v.r <= r.W + 0.5) && JSON.stringify(sorted.map((v) => v.k)) === JSON.stringify(['min', '0', '1', '2', 'max']),
					'微調整4C1(' + tag + '): 初期の5つの値は1行に並び（最大値が上の段に浮かない）、順番どおり・間4px以上・バーの幅の内側', { tops: r.vals.map((v) => v.t), gaps, W: r.W });
				// 境目を両端に寄せる
				const shapes = {};
				for (const [label, pick] of [['最小の側へ寄せ切り', (n) => [0, 1, 2]], ['最大の側へ寄せ切り', (n) => [n - 4, n - 3, n - 2]]]) {
					await page.evaluate((idx) => { effBounds = idx.map((i) => effData.steps[i]); layoutEffPanel(); }, pick(r.steps.length));
					await page.waitForTimeout(80);
					const s = await readVals(page);
					const bad = overlaps(s.vals);
					const rows = new Set(s.vals.map((v) => v.t)).size;
					shapes[label] = rows;
					assert(bad.length === 0 && s.vals.every((v) => v.l >= -0.5 && v.r <= s.W + 0.5) && s.vals.slice(1, 4).every((v, i) => v.text === fmt2(s.b[i], true)),
						'微調整4C1(' + tag + '・' + label + '): 値は重ならず（' + rows + '段）、バーの幅の内側', { bad, vals: s.vals });
				}
				await page.evaluate(() => { effBounds = defaultEffBounds(effData); layoutEffPanel(); });
				report.push(tag + ' 初期1段・寄せ切り ' + JSON.stringify(shapes));
				assert(jsErrors(errors).length === 0, '微調整4C1(' + tag + '): コンソールエラーなし', errors.slice(0, 3));
				await ctx.close();
			}
		}
		assert(report.length === 12, '微調整4C1: 6幅 × ライト・ダーク ＝ 12通りを確かめた（' + report.join(' ／ ') + '）', report.length);
	});

	/* ====================================================================
	 * D: 一覧の行（1行・フェードアウト）
	 * ==================================================================== */
	const setRange = async (page, range) => {
		await page.evaluate((m) => { setMelopMode(m === 'melop'); setTargetScopeMode(m === 'melop' ? 'default' : m); }, range);
		if (range === 'efficiency') await page.waitForFunction(() => !!effData, null, { timeout: 15000 });
		await page.waitForTimeout(80);
	};
	const readRows = (page) => page.evaluate(() => {
		const list = document.getElementById('skill-registry-list');
		const rows = [...list.children].map((d) => {
			const name = d.querySelector('.registry-name'), eff = d.querySelector('.registry-eff'), R = d.getBoundingClientRect(), N = name.getBoundingClientRect();
			const E = eff ? eff.getBoundingClientRect() : null;
			const ms = getComputedStyle(name).maskImage || getComputedStyle(name).webkitMaskImage || 'none';
			return { h: R.height, nameText: name.textContent, effText: eff ? eff.textContent : null, title: d.getAttribute('title'), over: name.scrollWidth > name.clientWidth + 0.5, fade: name.classList.contains('is-fade'),
				mask: ms, effFull: eff ? eff.scrollWidth <= eff.clientWidth + 0.5 && E.right <= R.right + 0.5 : true, sep: E ? N.right <= E.left + 0.5 : true,
				lines: Math.round(N.height / parseFloat(getComputedStyle(name).lineHeight)), nameNat: name.scrollWidth };
		});
		const wantNames = buildSkillRegistryRows(true).map((r) => r.name);   // 一覧の表示の並び（2026-10-27。既定の並び）
		return { rows, wantNames, listH: list.scrollHeight };
	});

	await block('微調整4D1 一覧の行は、どの幅・どのモードでも1行（高さの差1px以内）／名前が入らない行だけフェード（mask）・入る行にはかけない／効率は右端に全桁／名前と効率が重ならない／全行に title（全文＋効率）・名前の全文は DOM に残る（320〜1280px・ライト・ダーク・5つのモード × 並べ替え）', async () => {
		let states = 0, fadeMax = 0;
		for (const w of [320, 360, 375, 393, 430, 1280]) {
			for (const theme of ['light', 'dark']) {
				const { ctx, page, errors } = await openExam({ w, theme });
				await page.evaluate(() => { document.getElementById('skill-registry-list').closest('details').open = true; setScenarioFactorsAll(true); setAptitudeGenesAll(true); });
				for (const range of ['default', 'expanded', 'curated', 'melop', 'efficiency']) {
					await setRange(page, range);
					for (const sort of [false, true]) {
						await page.evaluate((s0) => { if (registrySortByEff !== s0) toggleRegistrySort(); }, sort);
						await page.waitForTimeout(60);
						const r = await readRows(page);
						const tag = '(' + w + 'px・' + theme + '・' + range + '・並べ替え' + (sort ? 'ON' : 'OFF') + ')';
						const hs = r.rows.map((x) => x.h);
						const bad = [];
						r.rows.forEach((x, i) => {
							if (x.lines !== 1) bad.push(x.nameText + ' が ' + x.lines + '行');
							if (x.fade !== x.over) bad.push(x.nameText + ' のフェードの有無が違う（入らない=' + x.over + '・フェード=' + x.fade + '）');
							if (x.fade !== /gradient/.test(x.mask)) bad.push(x.nameText + ' の mask が違う（' + x.mask + '）');
							if (!x.effFull) bad.push(x.nameText + ' の効率が欠けている');
							if (!x.sep) bad.push(x.nameText + ' の名前と効率が重なる');
							if (!x.title || !x.title.startsWith(x.nameText + (x.effText ? '　' + x.effText : ''))) bad.push(x.nameText + ' の title が全文でない（' + x.title + '）');
							if (x.nameText !== r.wantNames[i]) bad.push((i + 1) + '行目の名前の全文が DOM に無い');
						});
						assert(r.rows.length > 100 && Math.max(...hs) - Math.min(...hs) <= 1 && bad.length === 0,
							'微調整4D1' + tag + ': ' + r.rows.length + '行すべて1行（高さ ' + Math.min(...hs).toFixed(1) + '〜' + Math.max(...hs).toFixed(1) + 'px）・フェード ' + r.rows.filter((x) => x.fade).length + '行', { bad: bad.slice(0, 5) });
						fadeMax = Math.max(fadeMax, r.rows.filter((x) => x.fade).length);
						states++;
					}
				}
				assert(jsErrors(errors).length === 0, '微調整4D1(' + w + 'px・' + theme + '): コンソールエラーなし', errors.slice(0, 3));
				await ctx.close();
			}
		}
		assert(states === 120 && fadeMax > 0, '微調整4D1: 6幅 × ライト・ダーク × 5モード × 並べ替え ＝ 120通りを確かめた／フェードがかかる行がある（空振りでない。最大 ' + fadeMax + '行）', { states, fadeMax });
	});

	await block('微調整4D2 いちばん長い名前の行（320px・効率を指定・因子と遺伝子あり）: 1行・名前にフェード・効率は全桁・名前と効率が重ならない／幅を 320→1280→320 と変えると、フェードの有無が正しく更新される', async () => {
		const { ctx, page, errors } = await openExam({ w: 320 });
		await page.evaluate(() => { document.getElementById('skill-registry-list').closest('details').open = true; setScenarioFactorsAll(true); setAptitudeGenesAll(true); });
		await setRange(page, 'efficiency');
		const r = await readRows(page);
		const longest = r.rows.reduce((a, x) => (x.nameNat > a.nameNat ? x : a), r.rows[0]);
		assert(longest.fade && longest.lines === 1 && longest.effFull && longest.sep && longest.over,
			'微調整4D2(320px): いちばん長い名前「' + longest.nameText + '」（' + longest.nameNat + 'px）の行は1行で、名前にフェードがかかり、効率「' + longest.effText + '」は全桁', longest);
		const consistent = async (tag) => {
			const s = await readRows(page);
			const bad = s.rows.filter((x) => x.fade !== x.over || x.lines !== 1).map((x) => x.nameText);
			assert(bad.length === 0, '微調整4D2(' + tag + '): フェードは「名前が入らない行」だけ（' + s.rows.filter((x) => x.fade).length + '行）', bad.slice(0, 5));
			return s.rows.filter((x) => x.fade).length;
		};
		const n320 = await consistent('320px');
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.waitForTimeout(300);
		const n1280 = await consistent('320→1280px');
		await page.setViewportSize({ width: 320, height: 900 });
		await page.waitForTimeout(300);
		const back = await consistent('1280→320px');
		assert(n320 > n1280 && back === n320, '微調整4D2: 幅を変えるとフェードの行数が変わる（320px ' + n320 + '行 → 1280px ' + n1280 + '行 → 320px ' + back + '行）', { n320, n1280, back });
		// 閉じた一覧を開いたときにも測り直す
		await page.evaluate(() => { const d = document.getElementById('skill-registry-list').closest('details'); d.open = false; });
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.waitForTimeout(200);
		await page.evaluate(() => { document.getElementById('skill-registry-list').closest('details').open = true; });
		await page.waitForTimeout(200);
		await consistent('閉じたまま 320→1280px にしてから開いた');
		assert(jsErrors(errors).length === 0, '微調整4D2: コンソールエラーなし', errors.slice(0, 3));
		await ctx.close();
	});

	/* ====================================================================
	 * E: 告知（exam だけ）
	 * ==================================================================== */
	const WANT_LEAD = '新機能「効率を指定」モードを追加し、文面含め全体的な調整を行いました。';
	const WANT_LINES = ['評価点÷SPの「効率」で対象スキルを区別します。', '蹄鉄をドラッグして区間を調整、バーをタップすると区間が対象から外れます。', '結合画像には、検出数と、★の数に応じて補正された合計評価点が入ります。'];
	await block('微調整4E1 告知の文面はおいもさんの文面どおり（見出し「2nd Edition になりました」は無い・最初の行は「UmaExam OCR」・本文・箇条書き3つ・UmaStar の節は無い・読み上げの名前は「お知らせ」）／exam だけに出す（special には自動表示も ?notice=force もメニューの「お知らせ」も無い）', async () => {
		{
			const r = await openPage(browser, base, 'exam.html?notice=force', { width: 375, height: 800 });
			await r.page.waitForTimeout(1500);
			const b = await r.page.evaluate(() => {
				const body = document.getElementById('ui-notice-body-edition'), dlg = document.getElementById('ui-notice');
				const lab = dlg.getAttribute('aria-labelledby'), labEl = lab ? document.getElementById(lab) : null;
				const first = [...body.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 2 && e.getBoundingClientRect().width > 2);
				const h = body.querySelector('.announce-h');
				return { open: !dlg.hidden, kind: uiNoticeKind, headTool: dlg.querySelector('.notice-head-tool') ? dlg.querySelector('.notice-head-tool').textContent : null, text: body.innerText, heads: [...body.querySelectorAll('.announce-h')].map((e) => e.textContent), lead: [...body.querySelectorAll('.announce-lead')].map((e) => e.textContent),
					lines: [...body.querySelectorAll('.announce-lines li')].map((e) => e.textContent), label: dlg.getAttribute('aria-label') || (labEl ? labEl.textContent.trim() : ''), first: first ? first.textContent.trim() : '',
					hFs: h ? parseFloat(getComputedStyle(h).fontSize) : 0, hFw: h ? getComputedStyle(h).fontWeight : '', pages: UmaAnnounce.ANNOUNCE.pages };
			});
			assert(b.open && b.kind === 'edition' && JSON.stringify(b.heads) === JSON.stringify(['UmaExam OCR']) && JSON.stringify(b.lead) === JSON.stringify([WANT_LEAD]) && JSON.stringify(b.lines) === JSON.stringify(WANT_LINES),
				'微調整4E1(exam): 小窓は「UmaExam OCR」・本文・箇条書き3つ（おいもさんの文面どおり）', b);
			assert(!/2nd Edition になりました|UmaStar|β版|★の数で重みづけをした合計評価点も示します/.test(b.text) && b.first === WANT_LEAD && b.headTool === 'UmaExam OCR' && b.label === 'お知らせ' && b.hFs <= 14 && Number(b.hFw) >= 700,
				'微調整4E1(exam): 見出し「2nd Edition になりました」・UmaStar の節・4つ目の箇条書きは無い／最初の行は本文（ツール名「UmaExam OCR」は小窓の上〔お知らせの履歴・2026-10-25〕）／読み上げの名前は「お知らせ」', { first: b.first, headTool: b.headTool, label: b.label, hFs: b.hFs });
			assert(JSON.stringify(b.pages) === JSON.stringify(['exam']), '微調整4E1: 告知の定義に「どのページに出すか」があり、exam だけ', b.pages);
			await r.ctx.close();
		}
		// special: 既読の人（これまでの告知を見た人）でも、初めての人でも、?notice=force でも出ない。メニューに「お知らせ」が無い
		for (const [label, query, store] of [['既読の人', '', true], ['初めての人', '', false], ['?notice=force', '?notice=force', true]]) {
			const r = await openPage(browser, base, 'special.html' + query, { width: 375, height: 800 });
			if (store) {
				await r.page.evaluate(() => { localStorage.clear(); localStorage.setItem('uma-special-ui-notice', UI_NOTICE_ID); localStorage.setItem('uma-special-alpha-notice', ALPHA_NOTICE_ID); localStorage.setItem('uma-special-catalog-notice', CATALOG_NOTICE_ID); });
				await r.page.reload({ waitUntil: 'networkidle' });
			}
			await r.page.waitForTimeout(1500);
			const s = await r.page.evaluate(() => ({ open: !document.getElementById('ui-notice').hidden, kind: uiNoticeKind, menuBtn: !!document.getElementById('announce-menu-btn'), ed: localStorage.getItem('uma-special-edition-notice') }));
			// お知らせの履歴（2026-10-25）: special にも履歴（収録・改修中・画面の3件）があり、メニューに「お知らせ」の行がある。2nd Edition の告知は出ない・既読の値も書かない
			assert(!(s.open && s.kind === 'edition') && s.menuBtn && s.ed === null, '微調整4E1(special・' + label + '): 2nd Edition の告知は出ない・メニューに「お知らせ」の行がある（履歴）・2nd Edition の既読の値は書かない', s);
			assert(jsErrors(r.errors).length === 0, '微調整4E1(special・' + label + '): コンソールエラーなし', r.errors.slice(0, 3));
			await r.ctx.close();
		}
	});
}
