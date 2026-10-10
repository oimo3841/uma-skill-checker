// C-140（2026-10-10・ツール全体の微調整2）の検査。run-smoke.mjs の末尾から register20() で呼ばれる
// （塊の見出しはすべて「微調整2」で始まる。`npm run test:visual -- --only=微調整2` で回せる。A だけなら「微調整2A」など）。
//
// A: スマホの余白（special.html と同じ作り）
// B: 効率を指定のバーと蹄鉄の操作
// C: スキル名のコピー
// D: 見出し（タイトル部分）
// E: 告知
// スキル名・効率の数値は検査の側に書かない（恒久ルール1。データから読む）。

export async function register20(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));

	/** exam.html を開いて①へ。o.w＝幅／o.h＝高さ／o.eff＝「効率を指定」を選ぶ／o.theme＝画面の色／o.store＝開く前に仕込む保存値 */
	const openExam = async (o = {}) => {
		const r = await openPage(browser, base, 'exam.html' + (o.query || ''), { width: o.w || 1280, height: o.h || 900 });
		const page = r.page;
		await page.evaluate(({ theme, store }) => {
			try {
				if (theme) localStorage.setItem('uma-tools-theme', theme);
				Object.keys(store || {}).forEach((k) => localStorage.setItem(k, store[k]));
			} catch (e) {}
		}, { theme: o.theme || 'light', store: o.store || null });
		if (o.theme || o.store) await page.reload({ waitUntil: 'networkidle' });
		await page.waitForTimeout(400);
		if (!o.keepNotice && await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
		await page.evaluate(() => selectStepTab(1));
		await page.waitForFunction(() => !!effValueById, null, { timeout: 15000 });
		if (o.eff) {
			await page.click('label[for="scope-mode-efficiency"]', { position: { x: 6, y: 6 } });
			await page.waitForFunction(() => !!effData && document.querySelectorAll('.eff-seg').length === 4, null, { timeout: 15000 });
		}
		await page.waitForTimeout(300);
		return r;
	};

	/* ====================================================================
	 * A: スマホの余白（special.html と同じ作り）
	 * ==================================================================== */
	await block('微調整2A1 スマホ幅（640px以下）: exam の余白の作りが special.html の実測と同じ（外枠0・ヘッダーは帯・カードは外4px／内6px・箱の内側8px）／横にはみ出さない', async () => {
		// special の値は実際に special.html を開いて読む（数字を検査に書かない）
		const sp = {};
		for (const w of [375, 393, 320]) {
			const { ctx, page } = await openPage(browser, base, 'special.html', { width: w, height: 900 });
			sp[w] = await page.evaluate(() => {
				const c = (s, p) => getComputedStyle(document.querySelector(s))[p];
				const r = document.querySelector('.main-card').getBoundingClientRect();
				return { wrapPadL: c('.page-wrap', 'paddingLeft'), wrapPadT: c('.page-wrap', 'paddingTop'), cardX: r.x, cardR: document.documentElement.clientWidth - r.right,
					cardPad: c('.main-card', 'paddingLeft'), cardRadius: c('.main-card', 'borderTopLeftRadius'), hdrRadius: c('.site-header', 'borderTopLeftRadius'),
					hdrShadow: c('.site-header', 'boxShadow'), hdrBorderL: c('.site-header', 'borderLeftWidth'), hdrMarginB: c('.site-header', 'marginBottom'),
					hdrX: document.querySelector('.site-header').getBoundingClientRect().x };
			});
			await ctx.close();
		}
		for (const w of [375, 393, 320]) {
			const { ctx, page, errors } = await openExam({ w, eff: true });
			const e = await page.evaluate(() => {
				const c = (s, p) => getComputedStyle(document.querySelector(s))[p];
				const r = document.getElementById('new-step-card').getBoundingClientRect();
				const hr = document.querySelector('header').getBoundingClientRect();
				const box = document.querySelector('#step-panel-1 > .rounded-xl.p-4');
				return { wrapPadL: c('.exam-page-wrap', 'paddingLeft'), wrapPadT: c('.exam-page-wrap', 'paddingTop'), cardX: r.x, cardR: document.documentElement.clientWidth - r.right,
					cardPad: c('#new-step-card', 'paddingLeft'), cardRadius: c('#new-step-card', 'borderTopLeftRadius'), hdrRadius: c('header', 'borderTopLeftRadius'),
					hdrShadow: c('header', 'boxShadow'), hdrBorderL: c('header', 'borderLeftWidth'), hdrMarginB: c('header', 'marginBottom'), hdrX: hr.x, hdrW: hr.width,
					boxPad: box ? getComputedStyle(box).paddingLeft : null, sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
			});
			const s = sp[w];
			assert(e.wrapPadL === s.wrapPadL && e.wrapPadT === s.wrapPadT && e.cardX === s.cardX && e.cardR === s.cardR && e.cardPad === s.cardPad && e.cardRadius === s.cardRadius,
				'微調整2A1(' + w + 'px): ページ外枠の余白・カードの外側と内側の余白・角丸が special と同じ', { exam: e, special: s });
			assert(e.hdrRadius === s.hdrRadius && e.hdrShadow === s.hdrShadow && e.hdrBorderL === s.hdrBorderL && e.hdrMarginB === s.hdrMarginB && e.hdrX === s.hdrX && Math.abs(e.hdrW - e.vw) < 0.5,
				'微調整2A1(' + w + 'px): ヘッダーは画面の両端まで伸びる帯（角丸なし・影なし・下の間も special と同じ）', { exam: e, special: s });
			assert(e.boxPad === '8px' && e.sw <= e.vw, '微調整2A1(' + w + 'px): カードの中の箱の内側は8px・横にはみ出さない', e);
			assert(jsErrors(errors).length === 0, '微調整2A1(' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});

	await block('微調整2A2 広い画面（641px以上）は余白を変えていない（1280・768・700px）', async () => {
		const want = { 1280: { wrapPadL: '24px', wrapPadT: '48px', cardPad: '24px', hdrRadius: '24px', boxPad: '16px' },
			768: { wrapPadL: '24px', wrapPadT: '48px', cardPad: '24px', hdrRadius: '24px', boxPad: '16px' },
			700: { wrapPadL: '16px', wrapPadT: '32px', cardPad: '20px', hdrRadius: '24px', boxPad: '16px' } };
		for (const w of [1280, 768, 700]) {
			const { ctx, page, errors } = await openExam({ w, eff: true });
			const e = await page.evaluate(() => {
				const c = (s, p) => getComputedStyle(document.querySelector(s))[p];
				const box = document.querySelector('#step-panel-1 > .rounded-xl.p-4');
				return { wrapPadL: c('.exam-page-wrap', 'paddingLeft'), wrapPadT: c('.exam-page-wrap', 'paddingTop'), cardPad: c('#new-step-card', 'paddingLeft'),
					hdrRadius: c('header', 'borderTopLeftRadius'), boxPad: getComputedStyle(box).paddingLeft, hdrShadow: c('header', 'boxShadow'), cardMarginL: c('#new-step-card', 'marginLeft'),
					sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
			});
			const x = want[w];
			assert(e.wrapPadL === x.wrapPadL && e.wrapPadT === x.wrapPadT && e.cardPad === x.cardPad && e.hdrRadius === x.hdrRadius && e.boxPad === x.boxPad && e.hdrShadow !== 'none' && e.cardMarginL === '0px' && e.sw <= e.vw,
				'微調整2A2(' + w + 'px): 外枠・カード・ヘッダー（角丸・影）・箱の余白は従来のまま', { got: e, want: x });
			assert(jsErrors(errors).length === 0, '微調整2A2(' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});

	await block('微調整2A3 スマホ幅で効率を指定のバーが広がった（375・393px。旧187・205px より広く、1280px は変わらない）', async () => {
		// 旧（微調整1の先端）の実測: 375px→187px・393px→205px・1280px→812px（バーの右にリセットのボタンがあったときの値）
		const OLD = { 375: 187, 393: 205, 1280: 812 };
		for (const w of [375, 393, 1280]) {
			const { ctx, page } = await openExam({ w, eff: true });
			const bw = await page.evaluate(() => document.getElementById('eff-bar').getBoundingClientRect().width);
			if (w === 1280) assert(Math.abs(bw - OLD[w]) < 1 || bw >= OLD[w], '微調整2A3(1280px): バーの幅は旧（' + OLD[w] + 'px）より狭くならない', bw);
			else assert(bw > OLD[w] + 40, '微調整2A3(' + w + 'px): バーの幅（' + bw + 'px）は旧（' + OLD[w] + 'px）より40px以上広い', bw);
			await ctx.close();
		}
	});
}
