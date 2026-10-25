// C-140（2026-10-10・ツール全体の微調整2）D の検査: 見出し（タイトル部分）。run-smoke.mjs の末尾から register20d() で呼ばれる
// （塊の見出しはすべて「微調整2D」で始まる。`npm run test:visual -- --only=微調整2D` で回せる）。
//
// D1 タイトルの文字サイズ（両ツールで同じ・セット名より大きい・幅ごとの規則）／D2 バッジと一言の置き方（折り返しで崩れない）／D3 見出しの高さ／D4 「？」が無く、画面の色のボタンがある
// 数値は special.html を実際に開いて読む（セット名の文字サイズなど）。

export async function register20d(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const openTool = async (which, w, theme) => {
		const r = await openPage(browser, base, which + '.html', { width: w, height: 800 });
		const page = r.page;
		if (theme) await page.evaluate((t) => { try { localStorage.setItem('uma-tools-theme', t); } catch (e) {} }, theme);
		if (theme) await page.reload({ waitUntil: 'networkidle' });
		await page.waitForTimeout(700);
		if (which === 'special') { if (await page.isVisible('#ui-notice')) { try { await page.click('[data-act="notice-ok"]'); } catch (e) {} } }
		else if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
		await page.waitForTimeout(300);
		return r;
	};
	const probe = (page) => page.evaluate(() => {
		const hd = document.querySelector('header'); const r = hd.getBoundingClientRect(); const h1 = hd.querySelector('h1');
		const pill = hd.querySelector('.header-edition-pill'), tag = hd.querySelector('.header-tagline');
		const pr = pill.getBoundingClientRect(), tg = tag.getBoundingClientRect(), tr = h1.getBoundingClientRect();
		const beta = hd.querySelector('.header-edition');
		return { hdrH: r.height, hdrW: r.width, hdrRight: r.right, h1fs: parseFloat(getComputedStyle(h1).fontSize), h1Text: h1.textContent.replace(/\s+/g, ''), h1Top: tr.top - r.top, h1Bottom: r.bottom - tr.bottom, h1Lines: Math.round(tr.height / parseFloat(getComputedStyle(h1).lineHeight)),
			pillText: pill.innerText.replace(/\s+/g, ' ').trim(), short: hd.hasAttribute('data-hdr-short'), pillRow: Math.abs(pr.top - tr.top) < tr.height, pillRight: pr.right, tagText: tag.textContent.trim(), tagfs: parseFloat(getComputedStyle(tag).fontSize), tagLines: Math.round(tg.height / parseFloat(getComputedStyle(tag).lineHeight)),
			tagSameRowAsPill: Math.abs(tg.top - pr.top) < 12, tagRight: tg.right, tagLeft: tg.left, tagBottom: tg.bottom, hdrBottom: r.bottom, beta: beta ? beta.textContent.trim() : null,
			helpBtns: hd.querySelectorAll('.uma-help-btn, [aria-haspopup="dialog"]').length, qMarks: [...hd.querySelectorAll('button')].filter((b) => /^[?？]$/.test(b.textContent.trim())).length,
			themeBtn: !!hd.querySelector('#theme-cycle-btn'), toolBtn: !!hd.querySelector('#tool-dropdown-btn'), sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth,
			// ツール切り替えのメニュー（開くまで隠れている。UmaStar の説明に「β版」を含む〔2026-10-25〕）は、見出しの文字には数えない
			headerText: (() => { const c = hd.cloneNode(true); const m = c.querySelector('#tool-dropdown-menu'); if (m) m.remove(); return c.textContent.replace(/\s+/g, ' '); })() };
	});

	await block('微調整2D1 タイトル（UmaStar OCR・UmaExam OCR）の文字サイズは両ツールで同じ／special のセット名より大きい（セット名の1.1倍以上）／360px以下は20px・361〜640pxは22px・641〜767pxは24px・768px以上は30px（広い画面は従来のまま）', async () => {
		// special のセット名（帯の見出し）の文字サイズを、実際に開いて読む
		const sp = await openTool('special', 375);
		const setName = await sp.page.evaluate(() => { const e = document.querySelector('#deck-set-bar [data-usd-el="set-name"]') || document.querySelector('.usd-setbar-name'); return e ? parseFloat(getComputedStyle(e).fontSize) : null; });
		await sp.ctx.close();
		assert(setName > 0, '微調整2D1: special のセット名の文字サイズを読めた（' + setName + 'px）', setName);
		const want = (w) => (w <= 360 ? 20 : w <= 640 ? 22 : w <= 767 ? 24 : 30);
		for (const w of [320, 360, 361, 375, 393, 600, 640, 641, 1280]) {
			const a = await openTool('special', w), b = await openTool('exam', w);
			const pa = await probe(a.page), pb = await probe(b.page);
			assert(pa.h1fs === pb.h1fs && pa.h1fs === want(w) && pa.h1fs >= Math.round(setName * 1.1) && pa.h1fs > setName,
				'微調整2D1(' + w + 'px): 両ツールのタイトルは同じ大きさ（' + pa.h1fs + 'px・exam ' + pb.h1fs + 'px）で、セット名（' + setName + 'px）の1.1倍（' + (setName * 1.1).toFixed(1) + 'px）以上', { special: pa.h1fs, exam: pb.h1fs, setName });
			assert(pa.h1Text === 'UmaStarOCRβ版' && pb.h1Text === 'UmaExamOCR', '微調整2D1(' + w + 'px): タイトルの文字は special「UmaStar OCR」（＋β版）・exam「UmaExam OCR」（β版なし）', { sp: pa.h1Text, ex: pb.h1Text });
			await a.ctx.close(); await b.ctx.close();
		}
	});

	await block('微調整2D2 見出しの「2nd Edition」バッジと一言（special＝チャンミ/LoH用ツール・exam＝技能試験特化ツール）: 折り返しで崩れない／exam に「β版」「新UI」・見出しの下の説明は無い／special の「β版」は残る', async () => {
		for (const [w, theme] of [[1280, 'light'], [768, 'light'], [600, 'light'], [393, 'light'], [375, 'light'], [361, 'light'], [360, 'light'], [323, 'light'], [320, 'light'], [375, 'dark'], [320, 'dark']]) {
			for (const which of ['special', 'exam']) {
				const { ctx, page, errors } = await openTool(which, w, theme);
				const p = await probe(page);
				const tag = which + '・' + w + 'px・' + theme;
				const wantTag = which === 'special' ? 'チャンミ/LoH用ツール' : '技能試験特化ツール';
				// C-141（微調整3・A-2）: 一言を入れる幅が足りないときは「2nd」だけ（data-hdr-short）。373px 以上は必ず「2nd Edition」
				assert(p.tagText === wantTag && p.pillText === ((w <= 322 || p.short) ? '2nd' : '2nd Edition') && (w < 373 || !p.short),
					'微調整2D2(' + tag + '): 「' + ((w <= 322 || p.short) ? '2nd' : '2nd Edition') + '」のバッジと、その脇の一言「' + wantTag + '」', { tag: p.tagText, pill: p.pillText, short: p.short });
				// C-141（微調整3・A-2）: 一言は自分の枠の中で2行まで折り返してよい（下の行へは回さない。位置の詳しい検査は 微調整3A2）
				assert(p.h1Lines === 1 && p.pillRow && p.tagLines >= 1 && p.tagLines <= 2 && p.tagRight <= p.hdrRight + 0.5 && p.tagLeft >= -0.5 && p.pillRight <= p.hdrRight - 4 && p.sw <= p.vw,
					'微調整2D2(' + tag + '): タイトル・バッジは1行に並び、一言は2行まで（見出しの幅の内側）／横にはみ出さない', p);
				// 一言: 小さくして収める（最小8px）。C-141（微調整3・A-2）で「収まらなければバッジの下の行へ」を取り消した。いつもバッジの右隣
				assert(p.tagfs >= 8 - 0.01 && p.tagfs <= 11 + 0.01 && p.tagSameRowAsPill && p.tagLeft >= p.pillRight - 0.5,
					'微調整2D2(' + tag + '): 一言の文字は8〜11px。いつもバッジの右隣（下の行へは回さない）', { fs: p.tagfs, same: p.tagSameRowAsPill, left: p.tagLeft, pillRight: p.pillRight });
				if (which === 'special') assert(p.beta === 'β版', '微調整2D2(' + tag + '): special の「β版」は残っている', p.beta);
				else assert(p.beta === null && !/β|新UI/.test(p.headerText), '微調整2D2(' + tag + '): exam の見出しに「β版」「新UI」は付けない', p.headerText);
				if (which === 'exam') {
					const below = await page.evaluate(() => { const hd = document.querySelector('header'); return [...hd.querySelectorAll('p')].filter((e) => e.textContent.includes('技能試験特化ツール')).length; });
					assert(below === 0, '微調整2D2(' + tag + '): 見出しの下にあった説明の1行（<p>）は、バッジの脇へ移したので無い', below);
				}
				assert(jsErrors(errors).length === 0, '微調整2D2(' + tag + '): コンソールエラーなし', errors.slice(0, 3));
				await ctx.close();
			}
		}
	});

	await block('微調整2D3 見出しの高さ（スマホは special と exam で同じ・大きく増えない／広い画面は special が従来のまま110px）／タイトルの上下に余白', async () => {
		for (const w of [375, 393, 360, 320, 600]) {
			const a = await openTool('special', w), b = await openTool('exam', w);
			const pa = await probe(a.page), pb = await probe(b.page);
			// 旧（微調整1の先端）: special は 47px、exam は 96px（375px）。新: 6px の上下の余白を取り、ボタン 44px ＋ 12px ＋ 罫線 1px
			assert(Math.abs(pa.hdrH - pb.hdrH) <= 1 && pa.hdrH <= 60 && pa.hdrH >= 56 && pa.h1Top >= 6 - 0.5 && pb.h1Top >= 6 - 0.5,
				'微調整2D3(' + w + 'px): 見出しの高さは special ' + pa.hdrH + 'px・exam ' + pb.hdrH + 'px（同じ。60px以下）／タイトルの上の余白は6px以上', { special: pa, exam: pb });
			await a.ctx.close(); await b.ctx.close();
		}
		{
			const a = await openTool('special', 1280), b = await openTool('exam', 1280);
			const pa = await probe(a.page), pb = await probe(b.page);
			assert(Math.abs(pa.hdrH - 110) <= 1 && pb.hdrH <= 128 && Math.abs(pa.hdrH - pb.hdrH) <= 1,
				'微調整2D3(1280px): 見出しの高さは special ' + pa.hdrH + 'px（従来どおり110px）・exam ' + pb.hdrH + 'px（旧128px から増えていない）', { special: pa.hdrH, exam: pb.hdrH });
			await a.ctx.close(); await b.ctx.close();
		}
	});

	await block('微調整2D4 見出しの右に「？」は無い（special・exam とも）。ツール切替と画面の色の切り替えボタン（自動→ライト→ダーク）が右端にある', async () => {
		for (const [which, w] of [['special', 375], ['special', 1280], ['exam', 375], ['exam', 1280]]) {
			const { ctx, page, errors } = await openTool(which, w);
			const p = await probe(page);
			assert(p.helpBtns === 0 && p.qMarks === 0 && p.themeBtn && p.toolBtn && !/[?？]/.test(p.headerText),
				'微調整2D4(' + which + '・' + w + 'px): 見出しに「？」のボタン・小窓は無い。ツール切替と画面の色のボタンがある', { help: p.helpBtns, q: p.qMarks, theme: p.themeBtn, tool: p.toolBtn, text: p.headerText.slice(0, 80) });
			// 画面の色のボタンは押すたびに 自動 → ライト → ダーク（UmaStar にも効いている）
			const seq = [];
			seq.push(await page.evaluate(() => document.getElementById('theme-cycle-btn').getAttribute('data-theme-state')));
			for (let i = 0; i < 3; i++) { await page.click('#theme-cycle-btn'); seq.push(await page.evaluate(() => document.getElementById('theme-cycle-btn').getAttribute('data-theme-state'))); }
			assert(JSON.stringify(seq) === JSON.stringify(['auto', 'light', 'dark', 'auto']), '微調整2D4(' + which + '・' + w + 'px): 画面の色のボタンは 自動→ライト→ダーク→自動 と回る', seq);
			assert(jsErrors(errors).length === 0, '微調整2D4(' + which + '・' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});
}
