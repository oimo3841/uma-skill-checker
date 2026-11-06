// T105 段1（2026-11-06）: PC の取り込みの画面のモック lab/pc-capture-mock.html の検査。塊の見出しはすべて「T105 PC取り込み」で始まる。
// 決め: 249（入口は「動画を選ぶ」の並び）・252（スマホでは出さない）・250（止めるボタンと上限 3分）・260（幅が足りない窓の案内）・261（止めるボタンはブラウザの側）・305（カーソルの置き場所の文は入れない）。
export async function register121(env) {
	const { block, assert, browser, base, fs, path, REPO_ROOT } = env;
	const open = async (w, h, q = '', init = null) => {
		const ctx = await browser.newContext({ viewport: { width: w, height: h } });
		const page = await ctx.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.addInitScript(() => {
			window.__gdm = 0;
			if (navigator.mediaDevices) navigator.mediaDevices.getDisplayMedia = async () => { window.__gdm++; throw new Error('呼ばない'); };
		});
		if (init) await page.addInitScript(init.fn, init.arg);
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
			assert(by.searching.text.includes('・親から祖2の一番下までゆっくりスクロール。') && by.searching.text.includes('・スクロールの一時停止の前後で、スキルの行が1〜2行重なるようにする。') && by.searching.video && !by.searching.frame && by.searching.stop && !by.searching.time, `T105 PC取り込み(14) ${theme} 探している: 撮り方の2行・映像・枠なし・止めるボタン（321・334）`, by.searching);
			assert(by.found.text.includes('・親から祖2の一番下までゆっくりスクロール。') && by.found.text.includes('・スクロールの一時停止の前後で、スキルの行が1〜2行重なるようにする。') && by.found.frame && by.found.stop && by.found.time, `T105 PC取り込み(14) ${theme} 見つかった: 撮り方の2行・青い枠・残り時間・止めるボタン（334）`, by.found);
			assert(!r.out.some((x) => /ゲームの画面を探しています|終わったら止めてください/.test(x.text)), `T105 PC取り込み(14) ${theme} 前の文は出ない（334）`);
			assert(by.found.locked && by.processing.locked, `T105 PC取り込み(14) ${theme} 取り込み中と処理中は「静止画｜動画」を押せない`);
			assert(by.limit.text.includes('3分で止めました') && by.limit.prog, `T105 PC取り込み(14) ${theme} 上限で止まった: 文とそのまま処理`, by.limit);
			assert(by.processing.prog && by.processing.text.includes('処理中もほかの画面は見られます') && by.processing.text.includes('取り消す'), `T105 PC取り込み(14) ${theme} 処理中: 今の進捗の箱の文`, by.processing);
			for (const k of Object.keys(r.FAIL)) assert(by[k].text.includes(r.FAIL[k][1]) && by[k].retry && by[k].text.includes('もう一度'), `T105 PC取り込み(14) ${theme} ${k}: 案内の文と「もう一度」`, by[k]);
			assert(by['fail-small'].text.includes('ウィンドウが小さく'), `T105 PC取り込み(14) ${theme} 幅が足りない窓の案内（260）`);
			assert(by.howto.help.includes('ウィンドウの一覧でウマ娘の画面を選び') && !by.howto.help.includes('umamusume') && by.howto.help.includes('映像はこの PC の中だけで使います'), `T105 PC取り込み(14) ${theme} ？の小窓`, by.howto.help);
			assert(!r.out.some((x) => /カーソル|左の余白/.test(x.text + x.help)), `T105 PC取り込み(14) ${theme} カーソルの置き場所の文は入れない（305）`);
			assert(errors.length === 0, `T105 PC取り込み(14) ${theme} コンソールのエラー 0`, errors);
			await ctx.close();
		});
	}

	await block('T105 PC取り込み(15) モック 押したときの流れ・本当の取り込みはしない', async () => {
		const { ctx, page, errors } = await open(1280, 900);
		await page.click('#capture-btn');
		assert(await page.isVisible('#cap-video') && await page.isVisible('#stop-btn') && !(await page.isVisible('#cap-time')), 'T105 PC取り込み(15) 入口 → 探している');
		await page.click('#stop-btn');
		assert(await page.isVisible('#vprog'), 'T105 PC取り込み(15) 止める → 処理中');
		await page.click('[data-act="abort"]');
		assert(await page.isVisible('#capture-btn'), 'T105 PC取り込み(15) 取り消す → 始める前');
		await page.click('[data-state="fail-small"]');
		await page.click('#retry-btn');
		assert(await page.isVisible('#cap-video') && !(await page.isVisible('#cap-time')), 'T105 PC取り込み(15) もう一度 → 探している');
		assert(await page.evaluate(() => window.__gdm === 0), 'T105 PC取り込み(15) getDisplayMedia を呼ばない');
		assert(await page.locator('[data-h]').count() === 0, 'T105 PC取り込み(15) 「映像の高さ」の切り替えは無い（333）');
		assert(errors.length === 0, 'T105 PC取り込み(15) コンソールのエラー 0', errors);
		await ctx.close();
	});

	// スマホのまね（決定 325 の判定は幅を見ないので、機能と userAgentData でまねる）
	const PHONE = (kind) => {
		if (kind === 'iphone') navigator.mediaDevices.getDisplayMedia = undefined; // 呼ばれた数を見る差し替え（open）の上から消す
		if (kind === 'android') Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ mobile: true, platform: 'Android', brands: [] }), configurable: true });
	};
	for (const [w, h, kind] of [[390, 844, 'iphone'], [360, 740, 'android']]) {
		await block(`T105 PC取り込み(16) モック ${w}px ${kind} のまね: 入口も帯も出ない（252）・「動画を選ぶ」は今のまま・？にも文が出ない`, async () => {
			const { ctx, page, errors } = await open(w, h, '?state=found', { fn: PHONE, arg: kind });
			const m = await page.evaluate(() => {
				const p = document.querySelector('.pick-btn');
				const strip = document.getElementById('lab-strip');
				const stripGone = strip.hidden && strip.getBoundingClientRect().height === 0;
				document.getElementById('howto-btn').click();
				return { capture: !!document.getElementById('capture-btn'), video: !!document.getElementById('cap-video'), pick: p && p.textContent, pickW: p && Math.round(p.getBoundingClientRect().width), rowW: Math.round(document.getElementById('stage').getBoundingClientRect().width), help: document.getElementById('howto-box').textContent, stripGone };
			});
			assert(!m.capture && !m.video, `T105 PC取り込み(16) ${w}px 入口も映像も出ない`, m);
			assert(m.pick.includes('動画を選ぶ') && m.pickW === m.rowW, `T105 PC取り込み(16) ${w}px 「動画を選ぶ」は幅いっぱい`, m);
			assert(!m.help.includes('ウィンドウ') && m.help.includes('撮り方'), `T105 PC取り込み(16) ${w}px ？に取り込みの文が出ない`, m.help);
			assert(m.stripGone, `T105 PC取り込み(16) ${w}px ${kind} 切り替えの帯を出さない`, m);
			assert(await noOverflow(page), `T105 PC取り込み(16) ${w}px 横スクロールなし`);
			assert(errors.length === 0, `T105 PC取り込み(16) ${w}px コンソールのエラー 0`, errors);
			await ctx.close();
		});
	}

	await block('T105 PC取り込み(18) モック タッチだけと見える PC（Surface。決定 325）: 入口と帯が出て、帯で状態が変わる', async () => {
		const TOUCH = () => { window.matchMedia = (q) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} }); };
		const { ctx, page, errors } = await open(1280, 900, '', { fn: TOUCH });
		assert(await page.evaluate(() => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches), 'T105 PC取り込み(18) まねが効いている（タッチだけと見える）');
		assert(await page.isVisible('#capture-btn'), 'T105 PC取り込み(18) 「ウィンドウから取り込む」が出る');
		assert(await page.isVisible('#lab-strip'), 'T105 PC取り込み(18) 切り替えの帯が出る');
		await page.click('[data-state="found"]');
		assert(await page.isVisible('#cap-video') && await page.isVisible('#stop-btn'), 'T105 PC取り込み(18) 帯を押すと「見つかった」に変わる');
		assert(errors.length === 0, 'T105 PC取り込み(18) コンソールのエラー 0', errors);
		await ctx.close();
	});

	await block('T105 PC取り込み(19) モック 幅の狭い PC の窓（判定は幅を見ない）: 入口が出て、全部の状態で横スクロールなし', async () => {
		for (const w of [390, 360]) {
			const { ctx, page, errors } = await open(w, 800);
			const r = await page.evaluate(() => {
				const out = { capture: !!document.getElementById('capture-btn'), over: [] };
				for (const [k] of __mock.STATES) { __mock.setState(k); if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.over.push(k); }
				return out;
			});
			assert(r.capture, `T105 PC取り込み(19) ${w}px 入口が出る`, r);
			assert(r.over.length === 0, `T105 PC取り込み(19) ${w}px 全部の状態で横スクロールなし`, r.over);
			assert(errors.length === 0, `T105 PC取り込み(19) ${w}px コンソールのエラー 0`, errors);
			await ctx.close();
		}
	});

	await block('T105 PC取り込み(20) モックと製品の判定が同じ文・タッチの条件が無い（決定 325）', async () => {
		const read = (n) => fs.readFileSync(path.join(REPO_ROOT, n), 'utf8').replace(/\r\n/g, '\n');
		const of = (s) => (/\tfunction shouldOffer\(\) \{[\s\S]*?\n\t\}\n/.exec(s) || [''])[0];
		const a = of(read('lab/pc-capture-mock.html')), b = of(read('js/pc-capture.js'));
		assert(a.length > 100 && a === b, 'T105 PC取り込み(20) モックと製品の部品の shouldOffer が同じ文', { a: a.length, b: b.length });
		assert(!/pointer|coarse|innerWidth/.test(a), 'T105 PC取り込み(20) タッチと幅を見ない');
		assert(/getDisplayMedia/.test(a) && /MediaStreamTrackProcessor/.test(a) && /VideoEncoder/.test(a) && /VideoDecoder/.test(a) && /userAgentData/.test(a), 'T105 PC取り込み(20) 機能4つとスマホの判定を見る');
	});

	/* ── 決定 333: 取り込み中の映像を右の余白に ── */
	const measure = () => {
		const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
		const v = document.getElementById('cap-video');
		return { side: document.body.classList.contains('cap-side'), v: v && r(v), pos: v && getComputedStyle(v).position, inBox: !!(v && v.closest('#cap-box')), card: r(document.querySelector('.card')), bar: r(document.querySelector('.upload-bar')), body: r(document.querySelector('.cap-body') || document.body), over: document.documentElement.scrollWidth > document.documentElement.clientWidth, W: document.documentElement.clientWidth, Vh: innerHeight };
	};
	for (const [W, Vh] of [[1280, 900], [1600, 900], [1920, 1080], [1280, 640]]) {
		await block(`T105 PC取り込み(21) モック ${W}×${Vh} 映像は右の余白に・スクロールしても見え続ける・高さは画面に合わせる（333）`, async () => {
			const { ctx, page, errors } = await open(W, Vh);
			const before = await page.evaluate(`(${measure})()`);
			for (const st of ['searching', 'found']) {
				await page.click(`[data-state="${st}"]`);
				const m = await page.evaluate(`(${measure})()`);
				assert(m.side && m.pos === 'fixed', `T105 PC取り込み(21) ${W}px ${st} 映像が右の余白にある`, m);
				assert(m.v.x >= m.card.right + 8 && m.v.right <= W - 8, `T105 PC取り込み(21) ${W}px ${st} 本文の枠に重ならず窓の中`, m);
				assert(m.v.y >= 8 && m.v.bottom <= m.bar.y, `T105 PC取り込み(21) ${W}px ${st} 上下が画面に入り、下の欄に重ならない`, m);
				assert(m.Vh - m.v.h - (m.Vh - m.bar.y) <= 40 || m.card.right - m.card.x <= 722, `T105 PC取り込み(21) ${W}px ${st} 高さは画面いっぱい（本文を詰めきったときを除く）`, m);
				assert(Math.abs(m.v.w / m.v.h - 984 / 1804) < 0.01, `T105 PC取り込み(21) ${W}px ${st} 窓の縦横比のまま`, m.v);
				assert(m.v.h > 200, `T105 PC取り込み(21) ${W}px ${st} 枠の中の 200px より大きい`, m.v);
				assert(!m.over, `T105 PC取り込み(21) ${W}px ${st} 横スクロールなし`, m);
				// スクロールしても見え続ける
				await page.evaluate(() => { document.body.style.minHeight = '3000px'; window.scrollTo(0, 500); });
				const s2 = await page.evaluate(`(${measure})()`);
				assert(s2.v.y === m.v.y && s2.v.x === m.v.x && s2.card.y < m.card.y, `T105 PC取り込み(21) ${W}px ${st} スクロールしても同じ場所`, { y: [m.v.y, s2.v.y], card: [m.card.y, s2.card.y] });
				await page.evaluate(() => { document.body.style.minHeight = ''; window.scrollTo(0, 0); });
				// 映像に隠れず帯を押せる
				const ok = await page.evaluate(() => Array.from(document.querySelectorAll('#lab-strip button')).every((b) => { const q = b.getBoundingClientRect(); const e = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return e === b || b.contains(e); }));
				assert(ok, `T105 PC取り込み(21) ${W}px ${st} 切り替えの帯が映像に隠れない`);
				assert(m.body.right <= m.card.right, `T105 PC取り込み(21) ${W}px ${st} 文と止めるボタンは本文の枠の中`, m.body);
				assert(await page.evaluate(() => !!document.getElementById('cap-box').querySelector('#stop-btn')), `T105 PC取り込み(21) ${W}px ${st} 止めるボタンは枠の中`);
			}
			// 取り込み中でなければ元の位置
			await page.click('[data-state="processing"]');
			const end = await page.evaluate(`(${measure})()`);
			assert(!end.side && end.card.x === before.card.x && end.card.w === before.card.w, `T105 PC取り込み(21) ${W}px 処理中は本文が元の位置・元の幅`, { end: end.card, before: before.card });
			assert(errors.length === 0, `T105 PC取り込み(21) ${W}px コンソールのエラー 0`, errors);
			await ctx.close();
		});
	}

	await block('T105 PC取り込み(22) モック 余白が足りる窓は本文を動かさない・足りない窓は左に寄せる（333）', async () => {
		const pos = async (W, Vh) => {
			const { ctx, page } = await open(W, Vh);
			const a = await page.evaluate(`(${measure})()`);
			await page.click('[data-state="found"]');
			const b = await page.evaluate(`(${measure})()`);
			await ctx.close();
			return { a: a.card, b: b.card, v: b.v };
		};
		const big = await pos(2560, 900);
		assert(big.a.x === big.b.x && big.a.w === big.b.w, 'T105 PC取り込み(22) 余白が足りる窓（2560px）は本文を動かさない', big);
		const mid = await pos(1600, 900);
		assert(mid.b.x < mid.a.x, 'T105 PC取り込み(22) 余白が足りない窓（1600px）は本文を左に寄せる', mid);
		const nar = await pos(1280, 900);
		assert(nar.b.w < nar.a.w, 'T105 PC取り込み(22) もっと狭い窓（1280px）は本文を詰める', nar);
	});

	for (const [W, Vh, side] of [[971, 800, true], [970, 800, false], [800, 800, false], [1280, 499, true], [1280, 498, false]]) {
		await block(`T105 PC取り込み(23) モック ${W}×${Vh} 右に出す境: ${side ? '右の余白' : '枠の中・200px'}（333）`, async () => {
			const { ctx, page, errors } = await open(W, Vh);
			for (const st of ['searching', 'found']) {
				await page.click(`[data-state="${st}"]`);
				const m = await page.evaluate(`(${measure})()`);
				assert(m.side === side, `T105 PC取り込み(23) ${W}×${Vh} ${st} ${side ? '右の余白に出す' : '右に出さない'}`, m);
				if (!side) assert(m.pos !== 'fixed' && m.inBox && m.v.h >= 199 && m.v.h <= 201 && m.v.x >= m.card.x && m.v.right <= m.card.right, `T105 PC取り込み(23) ${W}×${Vh} ${st} 枠の中・200px`, m);
				else assert(m.v.x >= m.card.right, `T105 PC取り込み(23) ${W}×${Vh} ${st} 本文に重ならない`, m);
				assert(!m.over, `T105 PC取り込み(23) ${W}×${Vh} ${st} 横スクロールなし`, m);
			}
			assert(errors.length === 0, `T105 PC取り込み(23) ${W}×${Vh} コンソールのエラー 0`, errors);
			await ctx.close();
		});
	}

	await block('T105 PC取り込み(24) モック 窓の大きさを変えると、右の余白と枠の中が切り替わる（333）', async () => {
		const { ctx, page, errors } = await open(1280, 900, '?state=found');
		assert((await page.evaluate(`(${measure})()`)).side === true, 'T105 PC取り込み(24) 1280px は右');
		await page.setViewportSize({ width: 900, height: 900 });
		await page.waitForTimeout(100);
		const n = await page.evaluate(`(${measure})()`);
		assert(n.side === false && n.pos !== 'fixed' && n.inBox && n.v.h === 200, 'T105 PC取り込み(24) 900px に狭めると枠の中・200px', n);
		await page.setViewportSize({ width: 1600, height: 900 });
		await page.waitForTimeout(100);
		assert((await page.evaluate(`(${measure})()`)).side === true, 'T105 PC取り込み(24) 1600px に広げると右');
		assert(errors.length === 0, 'T105 PC取り込み(24) コンソールのエラー 0', errors);
		await ctx.close();
	});

	await block('T105 PC取り込み(17) モックと試しのページ: 製品からリンクしない・通信を禁止・試しのページの手順にカーソルの文が無い（305）', async () => {
		const read = (n) => fs.readFileSync(path.join(REPO_ROOT, n), 'utf8');
		for (const n of ['special.html', 'exam.html', 'index.html', 'uma-skill-deck.html']) assert(!read(n).includes('pc-capture-mock'), `T105 PC取り込み(17) ${n} からリンクしない`);
		const mock = read('lab/pc-capture-mock.html');
		assert(/connect-src 'none'/.test(mock) && /noindex/.test(mock), 'T105 PC取り込み(17) モックは通信を禁止・検索に出さない');
		assert(!/getDisplayMedia\(/.test(mock), 'T105 PC取り込み(17) モックは getDisplayMedia を呼ばない');
		const diag = read('lab/pc-capture-diag.html');
		assert(!diag.includes('左の余白'), 'T105 PC取り込み(17) 試しのページの手順に「左の余白」が無い');
		assert(/const LAB_VERSION = '2026-11-07a'/.test(diag), 'T105 PC取り込み(17) 試しのページの版');
	});
}
