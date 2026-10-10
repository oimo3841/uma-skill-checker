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

}
