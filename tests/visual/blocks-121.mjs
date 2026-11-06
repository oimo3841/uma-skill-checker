// T105 段1（2026-11-06）: PC の取り込みの画面のモック lab/pc-capture-mock.html の検査。塊の見出しはすべて「T105 PC取り込み」で始まる。
// 決め: 249（入口は「動画を選ぶ」の並び）・252（スマホでは出さない）・250（止めるボタンと上限 3分）・260（幅が足りない窓の案内）・261（止めるボタンはブラウザの側）・305（カーソルの置き場所の文は入れない）。
export async function register121(env) {
	const { block, assert, browser, base, fs, path, REPO_ROOT } = env;
	const open = async (w, h, q = '') => {
		const ctx = await browser.newContext({ viewport: { width: w, height: h } });
		const page = await ctx.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.addInitScript(() => {
			window.__gdm = 0;
			if (navigator.mediaDevices) navigator.mediaDevices.getDisplayMedia = async () => { window.__gdm++; throw new Error('呼ばない'); };
		});
		await page.goto(base + '/lab/pc-capture-mock.html' + q);
		return { ctx, page, errors };
	};
	const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

	await block('T105 PC取り込み(13) モック 1280px 入口: 「動画を選ぶ」と「ウィンドウから取り込む」が同じ行・同じ高さ 76px で、行は増えない', async () => {
		const { ctx, page, errors } = await open(1280, 900);
		const m = await page.evaluate(() => {
			const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right }; };
			const [a, b] = document.querySelectorAll('.pick-btn');
			return { a: r(a), b: r(b), ta: a.textContent, tb: b.textContent, panel: r(document.getElementById('set-panel')) };
		});
		assert(m.ta.includes('動画を選ぶ') && m.tb.includes('ウィンドウから取り込む'), 'T105 PC取り込み(13) 入口の2つの文', m);
		assert(m.a.y === m.b.y && m.a.h === m.b.h && m.a.h === 76 && m.a.w === m.b.w, 'T105 PC取り込み(13) 同じ行・同じ高さ 76px・同じ幅', m);
		assert(m.b.x > m.a.right, 'T105 PC取り込み(13) 横に並ぶ', m);
		assert(await noOverflow(page), 'T105 PC取り込み(13) 横スクロールなし');
		assert(errors.length === 0, 'T105 PC取り込み(13) コンソールのエラー 0', errors);
		await ctx.close();
	});

	for (const theme of ['light', 'dark']) {
		await block(`T105 PC取り込み(14) モック 1280px ${theme} 全部の状態: 文が出て、横スクロールなし・エラー 0`, async () => {
			const { ctx, page, errors } = await open(1280, 900, '?theme=' + theme);
			const r = await page.evaluate(async () => {
				const out = [];
				for (const [k] of __mock.STATES) {
					__mock.setState(k);
					const q = (id) => document.getElementById(id);
					out.push({ k, text: q('stage').textContent, help: q('howto-box').hidden ? '' : q('howto-box').textContent, over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
						video: !!q('cap-video'), frame: !!(q('cap-video') && q('cap-video').querySelector('rect[stroke="#0a7cff"]')), stop: !!q('stop-btn'), retry: !!q('retry-btn'), time: !!q('cap-time'), prog: !!q('vprog'), locked: q('mode-video').disabled });
				}
				return { out, FAIL: __mock.FAIL };
			});
			const by = Object.fromEntries(r.out.map((x) => [x.k, x]));
			assert(r.out.every((x) => !x.over), `T105 PC取り込み(14) ${theme} 全部の状態で横スクロールなし`, r.out.filter((x) => x.over).map((x) => x.k));
			assert(by.searching.text.includes('ゲームの画面を探しています') && by.searching.video && !by.searching.frame && by.searching.stop && !by.searching.time, `T105 PC取り込み(14) ${theme} 探している: 映像だけ・枠なし`, by.searching);
			assert(by.found.text.includes('因子の画面をスクロールして、終わったら止めてください') && by.found.frame && by.found.stop && by.found.time, `T105 PC取り込み(14) ${theme} 見つかった: 枠・残り時間・止めるボタン`, by.found);
			assert(by.found.locked && by.processing.locked, `T105 PC取り込み(14) ${theme} 取り込み中と処理中は「静止画｜動画」を押せない`);
			assert(by.limit.text.includes('3分で止めました') && by.limit.prog, `T105 PC取り込み(14) ${theme} 上限で止まった: 文とそのまま処理`, by.limit);
			assert(by.processing.prog && by.processing.text.includes('処理中もほかの画面は見られます') && by.processing.text.includes('取り消す'), `T105 PC取り込み(14) ${theme} 処理中: 今の進捗の箱の文`, by.processing);
			for (const k of Object.keys(r.FAIL)) assert(by[k].text.includes(r.FAIL[k][1]) && by[k].retry && by[k].text.includes('もう一度'), `T105 PC取り込み(14) ${theme} ${k}: 案内の文と「もう一度」`, by[k]);
			assert(by['fail-small'].text.includes('ウィンドウが小さく'), `T105 PC取り込み(14) ${theme} 幅が足りない窓の案内（260）`);
			assert(by.howto.help.includes('ウィンドウの一覧で umamusume を選び') && by.howto.help.includes('映像はこの PC の中だけで使います'), `T105 PC取り込み(14) ${theme} ？の小窓`, by.howto.help);
			assert(!r.out.some((x) => /カーソル|左の余白/.test(x.text + x.help)), `T105 PC取り込み(14) ${theme} カーソルの置き場所の文は入れない（305）`);
			assert(errors.length === 0, `T105 PC取り込み(14) ${theme} コンソールのエラー 0`, errors);
			await ctx.close();
		});
	}

	await block('T105 PC取り込み(15) モック 押したときの流れ・本当の取り込みはしない', async () => {
		const { ctx, page, errors } = await open(1280, 900);
		await page.click('#capture-btn');
		assert((await page.textContent('#cap-msg')).includes('探しています'), 'T105 PC取り込み(15) 入口 → 探している');
		await page.click('#stop-btn');
		assert(await page.isVisible('#vprog'), 'T105 PC取り込み(15) 止める → 処理中');
		await page.click('[data-act="abort"]');
		assert(await page.isVisible('#capture-btn'), 'T105 PC取り込み(15) 取り消す → 始める前');
		await page.click('[data-state="fail-small"]');
		await page.click('#retry-btn');
		assert((await page.textContent('#cap-msg')).includes('探しています'), 'T105 PC取り込み(15) もう一度 → 探している');
		assert(await page.evaluate(() => window.__gdm === 0), 'T105 PC取り込み(15) getDisplayMedia を呼ばない');
		// 映像の高さの切り替え（縦長の映像が場所を取るのを見る）
		await page.click('[data-state="found"]');
		const heights = [];
		for (const h of [160, 200, 280]) { await page.click(`[data-h="${h}"]`); heights.push(await page.evaluate(() => { const b = document.getElementById('cap-video').getBoundingClientRect(); return [Math.round(b.height), +(b.width / b.height).toFixed(3)]; })); }
		assert(heights.every((v, i) => Math.abs(v[0] - [160, 200, 280][i]) <= 1 && Math.abs(v[1] - 984 / 1804) < 0.02), 'T105 PC取り込み(15) 映像の高さ 160／200／280・窓の縦横比のまま', heights);
		assert(errors.length === 0, 'T105 PC取り込み(15) コンソールのエラー 0', errors);
		await ctx.close();
	});

	for (const [w, h] of [[390, 844], [360, 740]]) {
		await block(`T105 PC取り込み(16) モック ${w}px スマホ: 入口が出ない（252）・「動画を選ぶ」は今のまま・？にも文が出ない`, async () => {
			const { ctx, page, errors } = await open(w, h, '?state=found');
			const m = await page.evaluate(() => {
				const p = document.querySelector('.pick-btn');
				document.getElementById('howto-btn').click();
				return { capture: !!document.getElementById('capture-btn'), video: !!document.getElementById('cap-video'), pick: p && p.textContent, pickW: p && Math.round(p.getBoundingClientRect().width), rowW: Math.round(document.getElementById('stage').getBoundingClientRect().width), help: document.getElementById('howto-box').textContent, states: getComputedStyle(document.getElementById('lab-states').querySelector('button')).display };
			});
			assert(!m.capture && !m.video, `T105 PC取り込み(16) ${w}px 入口も映像も出ない`, m);
			assert(m.pick.includes('動画を選ぶ') && m.pickW === m.rowW, `T105 PC取り込み(16) ${w}px 「動画を選ぶ」は幅いっぱい`, m);
			assert(!m.help.includes('ウィンドウ') && m.help.includes('撮り方'), `T105 PC取り込み(16) ${w}px ？に取り込みの文が出ない`, m.help);
			assert(m.states === 'none', `T105 PC取り込み(16) ${w}px 状態の切り替えを出さない`, m.states);
			assert(await noOverflow(page), `T105 PC取り込み(16) ${w}px 横スクロールなし`);
			assert(errors.length === 0, `T105 PC取り込み(16) ${w}px コンソールのエラー 0`, errors);
			await ctx.close();
		});
	}

	await block('T105 PC取り込み(17) モックと試しのページ: 製品からリンクしない・通信を禁止・試しのページの手順にカーソルの文が無い（305）', async () => {
		const read = (n) => fs.readFileSync(path.join(REPO_ROOT, n), 'utf8');
		for (const n of ['special.html', 'exam.html', 'index.html', 'uma-skill-deck.html']) assert(!read(n).includes('pc-capture-mock'), `T105 PC取り込み(17) ${n} からリンクしない`);
		const mock = read('lab/pc-capture-mock.html');
		assert(/connect-src 'none'/.test(mock) && /noindex/.test(mock), 'T105 PC取り込み(17) モックは通信を禁止・検索に出さない');
		assert(!/getDisplayMedia\(/.test(mock), 'T105 PC取り込み(17) モックは getDisplayMedia を呼ばない');
		const diag = read('lab/pc-capture-diag.html');
		assert(!diag.includes('左の余白'), 'T105 PC取り込み(17) 試しのページの手順に「左の余白」が無い');
		assert(/const LAB_VERSION = '2026-11-06b'/.test(diag), 'T105 PC取り込み(17) 試しのページの版');
	});
}
