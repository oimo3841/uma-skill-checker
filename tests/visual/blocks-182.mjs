// T193（2026-11-18・おいもさんの決定 774 の続き「動画対応も確認無しで Push まで」）: 本育成結果の動画の入口と流れの検査。
// run-smoke.mjs の末尾から register182() で呼ばれる（塊の見出しはすべて「T193」で始まる。`npm run test:visual -- --only=T193` で回せる）。
//
//  (1) 入口（UmaStar・UmaExam）: 本育成結果のタブでも「静止画｜動画」が見える。「静止画」は今まで通り「画像を選ぶ」、「動画」は親A と同じ
//      「動画を選ぶ β」（と PC では「ウィンドウから取り込む β」）の点線のボタン（同じ class・同じ高さ）で、「画像を選ぶ」と静止画の案内は隠れる。
//  (2) 流れ（UmaStar・UmaExam）: 作り物のスキル画面の動画（blocks-180 の SKILL_SYNTH.video。先頭で一覧を引っぱりすぎてから戻る）を UmaSkillResult.runVideo に渡す
//      → 進み具合の箱（親A と同じ文と段）→ コマに分け、先頭の引っぱりすぎのコマを外し、静止画と同じ組み立てで結合画像。色で数えた数が正しい・一覧の頭に空きが無い・
//      「動画の画像」の1行（押すと全部）・タブの枚数に数えない・persons（親A〜祖B2）に入らない・「結合画像の設定」（1列｜2列・数）が効く・画像を足すと動画の印が外れる。
//  (3) 失敗と取り消し（UmaStar）: スキル画面の無い動画は本育成結果の文（sr.video.err.noscreen）＋「入っていた画像はそのままです。」で、入っていた画像は残る。
//      取り消すと親A と同じトースト（video.toast.cancel）で、入っていた画像は残る。
//  (4) ウィンドウから取り込む（UmaStar・UmaExam）: UmaPcCapture.begin を作り物の一回分に差し替え、取り込みの箱（本育成結果の撮り方の1行・親A の2行目・残り時間・止める）→
//      止める → 組み立て・一回分を手放す。見つからないとき（capFail 'band'）は本育成結果の文と「もう一度」。
//  (5) 数え方と上の欄の見分け（UmaStar。T193 で直した所）: タッチの光が金の右に乗っても金・光で上下2枚がつながっても2枚に数える・
//      「スピード〜賢さ」の枠の上の縁が3行にじんでも上の欄の区切りが見つかる。
// 本物の録画（スマホ・DMM版）は test:video-local -- --skill が見る（HEVC を復号できる Chrome で回す）。
import { reloadReady } from './lib/page-ready.mjs';
import { SKILL_SYNTH, TESS_STUB } from './blocks-180.mjs';

const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

export async function register182(env) {
	const { block, assert, browser, base, openPage, USER_DATA } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const open = async (file, { w = 390, h = 844, mode = 'video' } = {}) => {
		const sp = await openPage(browser, base, file + '.html', { width: w, height: h }, file === 'special' ? USER_DATA : EMPTY);
		await sp.page.evaluate(({ mode, file }) => {
			localStorage.setItem(file === 'special' ? 'uma-special-upload-mode' : 'uma-exam-upload-mode', mode);
			if (file === 'exam') localStorage.setItem('uma-exam-last-step', '2');
		}, { mode, file });
		await sp.page.route('**/tesseract.js/4.0.2/tesseract.min.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: TESS_STUB }));
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok').catch(() => {});
		await sp.page.evaluate(() => { selectStepTab(2); window.scrollTo(0, 0); });
		await sp.page.addScriptTag({ content: SKILL_SYNTH });
		await sp.page.click('#personset-tabs [data-tab-id="skill"]');
		return sp;
	};
	const T = (page) => page.evaluate(() => UmaSkillResult.texts);
	const vtext = (page, key, vars) => page.evaluate(({ key, vars }) => videoText(key, vars), { key, vars: vars || null });
	const waitBuilt = (page) => page.waitForFunction(() => { const p = UmaSkillResult.peek(); const im = document.querySelector('.sr-img'); return !p.vbusy && p.built && p.url && im && im.getAttribute('src') === p.url && im.complete && im.naturalWidth > 0; }, null, { timeout: 120000 });

	for (const file of ['special', 'exam']) {
		const NAME = file === 'special' ? 'UmaStar' : 'UmaExam';
		await block('T193(1) ' + NAME + ' の本育成結果の動画の入口: 「静止画｜動画」が見える・動画は親A と同じ「動画を選ぶ β」（と「ウィンドウから取り込む β」）・静止画は今まで通り', async () => {
			const sp = await open(file, { mode: 'shot' });
			const { page, errors } = sp;
			const look = () => page.evaluate(() => {
				const vis = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none');
				const pick = document.querySelector('[data-sr-act="video"]'), cap = document.querySelector('[data-sr-act="capture"]');
				const parentPick = document.querySelector('#personset-A-wrap .video-pick-btn');
				return { mode: vis(document.getElementById('upload-mode')), pick: vis(pick), pickText: pick ? pick.textContent.replace(/\s+/g, '') : null, pickCls: pick && pick.className,
					pickH: pick && vis(pick) ? Math.round(pick.getBoundingClientRect().height) : null, cap: cap ? vis(cap) : null, capText: cap ? cap.textContent.replace(/\s+/g, '') : null,
					img: vis(document.querySelector('.sr-pick')), leadShot: vis(document.querySelector('.sr-lead-shot')), leadVideo: vis(document.querySelector('.sr-lead-video')),
					leadVideoText: (document.querySelector('.sr-lead-video') || {}).textContent, parentCls: parentPick && parentPick.className,
					sw: document.documentElement.scrollWidth - document.documentElement.clientWidth };
			});
			const shot = await look();
			assert(shot.mode && !shot.pick && shot.img && shot.leadShot && !shot.leadVideo, 'T193(1) ' + NAME + ' 静止画のときは今まで通り「画像を選ぶ」と静止画の案内（動画のボタンは出ない）。「静止画｜動画」は見える', shot);
			await page.click('[data-upload-mode-btn="video"]');
			const vid = await look();
			const t = await T(page);
			const want = (await vtext(page, 'video.btn.pick')) + (await vtext(page, 'video.entry.alpha'));
			assert(vid.pick && vid.pickText === want && /(^|\s)video-pick-btn(\s|$)/.test(vid.pickCls || '') && /(^|\s)video-pick-btn(\s|$)/.test(vid.parentCls || '') && vid.pickH === 76 && !vid.img && !vid.leadShot && vid.leadVideo && vid.leadVideoText === t['sr.lead.video'],
				'T193(1) ' + NAME + ' 動画のときは親A と同じ「動画を選ぶ β」（同じ class・高さ 76px）・「画像を選ぶ」と静止画の案内は隠れ、動画の案内（sr.lead.video）', vid);
			const offer = await page.evaluate(() => captureOffered());
			const wantCap = (await vtext(page, 'video.btn.capture')) + (await vtext(page, 'video.entry.alpha'));
			assert(offer ? (vid.cap === true && vid.capText === wantCap) : vid.cap === null, 'T193(1) ' + NAME + ' 「ウィンドウから取り込む β」は親A と同じく取り込める端末だけ（この端末: ' + offer + '）', vid);
			assert(vid.sw <= 0, 'T193(1) ' + NAME + ' 390px で横にはみ出さない', vid.sw);
			await page.click('[data-upload-mode-btn="shot"]');
			const back = await look();
			assert(!back.pick && back.img && back.leadShot, 'T193(1) ' + NAME + ' 静止画へ戻すと「画像を選ぶ」に戻る', back);
			assert(jsErrors(errors).length === 0, 'T193(1) ' + NAME + ' コンソールのエラーなし', errors);
			await page.context().close();
		});

		await block('T193(2) ' + NAME + ' の本育成結果の動画の流れ: 作り物のスキル画面の動画 → 進み具合 → 先頭の引っぱりすぎのコマを外す → 静止画と同じ組み立て・数・設定・「動画の画像」の1行・タブの枚数に数えない', async () => {
			const sp = await open(file);
			const { page, errors } = sp;
			// 進み具合の箱（親A と同じ文と段）を、選ぶ段の途中で控える
			await page.evaluate(() => { window.__srProg = []; const mo = new MutationObserver(() => { const el = document.querySelector('.sr-video-progress'); if (el) window.__srProg.push([...el.querySelectorAll('.video-steps li')].map((li) => li.textContent).join('|') + '#' + (el.querySelector('.video-prog-label') || {}).textContent); }); mo.observe(document.body, { subtree: true, childList: true, characterData: true }); window.__srMo = mo; });
			const res = await page.evaluate(async () => { const out = await UmaSkillResult.runVideo(__skillSynth.video(30, 21)); window.__srMo.disconnect(); return out; });
			await waitBuilt(page);
			const r = await page.evaluate(() => ({ p: UmaSkillResult.peek(), truth: window.__skillTruth, prog: window.__srProg.slice(), progLeft: !!document.querySelector('.sr-video-progress'),
				tab: document.querySelector('#personset-tabs [data-tab-id="skill"]').textContent.trim(), tile: (document.querySelector('.sr-thumbs .video-tile') || {}).textContent || null,
				thumbs: document.querySelectorAll('.sr-thumb').length, persons: persons.map((x) => x.files.length).join(','), err: !!document.querySelector('.sr-video-error') }));
			const names = [await vtext(page, 'video.prog.read'), await vtext(page, 'video.prog.person', { 人: '本育成結果' }), await vtext(page, 'video.prog.done')];
			assert(res.ok && !r.err && r.p.built && r.p.video && r.p.video.kind === 'portrait', 'T193(2) ' + NAME + ' 動画から結合画像ができる', { res, video: r.p.video });
			assert(r.prog.some((s) => s.startsWith('✓' + names[0] + '|▸' + names[1] + '|・' + names[2])) && r.prog.some((s) => s.endsWith('#' + names[2])) && !r.progLeft,
				'T193(2) ' + NAME + ' 進み具合は親A と同じ文の3段（' + names.join('→') + '）・組み立てが終わると消える', r.prog.slice(-3));
			const c = r.p.counts || {};
			assert(c.all === r.truth.all && c.unique === r.truth.unique && c.evo === r.truth.evo && c.gold === r.truth.gold && c.white === r.truth.white, 'T193(2) ' + NAME + ' 色で数えた数が正しい', { c: [c.all, c.unique, c.evo, c.gold, c.white], truth: r.truth });
			assert(r.p.video.dropped === 1 && r.p.video.used === r.p.video.frames - 1 && c.panels && c.panels[0].y0 <= 40, 'T193(2) ' + NAME + ' 先頭の引っぱりすぎのコマを外す（一覧の頭に空きが無い。最初のパネルが 40行以内）', { video: r.p.video, first: c.panels && c.panels[0] });
			assert(r.p.sr && r.p.sr.head && r.p.sr.head.ok, 'T193(2) ' + NAME + ' 上の欄の区切りが見つかる（静止画と同じ組み立て）', r.p.sr && r.p.sr.head);
			const tileText = (await vtext(page, 'video.tile.text')) + (await vtext(page, 'video.tile.hint'));
			assert(r.tile === tileText && r.thumbs === 0 && !/枚/.test(r.tab) && r.persons === '0,0,0,0,0,0', 'T193(2) ' + NAME + ' 「動画の画像」の1行で見せ、タブの枚数に数えない・persons に入らない', { tile: r.tile, tab: r.tab, persons: r.persons });
			await page.click('.sr-thumbs .video-tile');
			const exp = await page.evaluate(() => document.querySelectorAll('.sr-thumb').length);
			assert(exp === r.p.video.used, 'T193(2) ' + NAME + ' 「動画の画像」を押すと全部のコマ（' + r.p.video.used + '枚）', exp);
			// 結合画像の設定が効く（静止画と同じ）
			const form = async (cols, count) => {
				const before = await page.evaluate(() => UmaSkillResult.peek());
				if (before.cols !== cols) await page.click('[data-sr-cols="' + cols + '"]');
				if (before.withCount !== count) await page.click('[data-sr-opt="count"]');
				await page.waitForFunction(({ cols, count }) => { const p = UmaSkillResult.peek(); const im = document.querySelector('.sr-img'); return p.sr && p.sr.cols === cols && p.sr.info === count && im && im.getAttribute('src') === p.url && im.complete && im.naturalWidth > 0; }, { cols, count }, { timeout: 60000 });
				return page.evaluate(() => { const im = document.querySelector('.sr-img'); const p = UmaSkillResult.peek(); return { w: im.naturalWidth, h: im.naturalHeight, card: !!p.sr.card, pieces: (p.sr.pieces || []).map((q) => q.s || q.kind).join('') }; });
			};
			const f2c = await form(2, true), f2 = await form(2, false), f1c = await form(1, true);
			assert(f2c.card && f2c.w > f1c.w * 1.9 && f2.w === f2c.w && !f2.card && f1c.card && f1c.h > f2c.h && f2c.pieces.indexOf(String(r.truth.all)) >= 0,
				'T193(2) ' + NAME + ' 結合画像の設定（2列・数あり／2列・数なし／1列・数あり）が動画でも効く', { f2c, f2, f1c });
			// 画像を足すと動画の印が外れる（コマはそのまま。タブに枚数が出る）
			await page.evaluate(async () => { UmaSkillResult.addFiles(await __skillSynth.make(1, 8, 5)); });
			const add = await page.evaluate(() => ({ video: UmaSkillResult.peek().video, n: UmaSkillResult.peek().files, tab: document.querySelector('#personset-tabs [data-tab-id="skill"]').textContent.trim() }));
			assert(add.video === null && add.n === r.p.video.used + 1 && add.tab === '本育成結果', 'T193(2) ' + NAME + ' 画像を足すと動画の印が外れる（タブに枚数は出さない。T212-H1）', add);
			assert(jsErrors(errors).length === 0, 'T193(2) ' + NAME + ' コンソールのエラーなし', errors);
			await page.context().close();
		});

		await block('T193(4) ' + NAME + ' の本育成結果の「ウィンドウから取り込む」: 取り込みの箱（撮り方・残り時間・止める）→ 止める → 組み立て・一回分を手放す／見つからないときの文と「もう一度」', async () => {
			const sp = await open(file);
			const { page, errors } = sp;
			// 取り込みを作り物の一回分に差し替える（選ぶ・映像は人にしかできない）。open は作り物の動画の出どころを返す
			await page.evaluate(() => {
				UmaPcCapture.shouldOffer = () => ({ offer: true });
				window.__capMode = 'ok';
				UmaPcCapture.begin = async (hooks) => {
					const cv = document.createElement('canvas'); cv.width = 120; cv.height = 200;
					const stream = cv.captureStream ? cv.captureStream(5) : new MediaStream();
					window.__capHooks = hooks; window.__capDisposed = false;
					return { stream, stop: (reason) => hooks.onStop(reason || 'stop'),
						open: async () => { if (window.__capMode === 'band') throw Object.assign(new Error('因子の画面が無い'), { capFail: 'band' }); return __skillSynth.video(30, 21); },
						dispose: () => { window.__capDisposed = true; } };
				};
			});
			await page.click('[data-sr-cols="1"]');   // 描き直して取り込みのボタンを出す
			await page.click('[data-sr-act="capture"]');
			await page.waitForSelector('.sr-video-stage .cap-box');
			await page.evaluate(() => window.__capHooks.onTick({ area: { ok: true, x: 10, y: 10, w: 60, h: 120 }, width: 120, height: 200, rest: 170 }));
			const t = await T(page);
			const box = await page.evaluate(() => ({ howto: [...document.querySelectorAll('.sr-video-stage .cap-howto')].map((p) => p.textContent), time: document.querySelector('.sr-video-stage .cap-time').textContent,
				timeHidden: document.querySelector('.sr-video-stage .cap-time').hidden, stop: document.querySelector('[data-sr-act="cap-stop"]').textContent,
				row: getComputedStyle(document.querySelector('.sr-video-row')).display, video: !!document.querySelector('.sr-video-stage video') && !!document.querySelector('.sr-video-stage video').srcObject }));
			const step2 = await vtext(page, 'video.howto.step2'), remain = await vtext(page, 'video.cap.remain', { t: '2:50' }), stopText = await vtext(page, 'video.cap.stop');
			assert(box.howto.join('|') === t['sr.video.howto1'] + '|' + step2 && box.time === remain && !box.timeHidden && box.stop === stopText && box.row === 'none' && box.video,
				'T193(4) ' + NAME + ' 取り込みの箱: 本育成結果の撮り方の1行（sr.video.howto1）と親A の2行目・残り時間・「取り込みを止める」・入口のボタンは隠れる', box);
			await page.click('[data-sr-act="cap-stop"]');
			await waitBuilt(page);
			const r = await page.evaluate(() => ({ p: UmaSkillResult.peek(), truth: window.__skillTruth, disposed: window.__capDisposed, box: !!document.querySelector('.sr-video-stage .cap-box'), row: getComputedStyle(document.querySelector('.sr-video-row')).display }));
			const c = r.p.counts || {};
			assert(r.p.built && r.p.video && r.p.video.kind === 'capture' && r.disposed && !r.box && r.row === 'flex' && c.all === r.truth.all && c.gold === r.truth.gold,
				'T193(4) ' + NAME + ' 止めると動画と同じ処理で組み立て・一回分を手放す・入口が戻る', { video: r.p.video, disposed: r.disposed, c: [c.all, c.gold], truth: r.truth, row: r.row });
			// 見つからない（capFail 'band'）: 本育成結果の文と「もう一度」
			await page.evaluate(() => { window.__capMode = 'band'; });
			await page.click('[data-sr-act="capture"]');
			await page.waitForSelector('.sr-video-stage .cap-box');
			await page.click('[data-sr-act="cap-stop"]');
			await page.waitForSelector('.sr-cap-fail');
			const fail = await page.evaluate(() => ({ text: document.querySelector('.sr-cap-fail p').textContent, retry: document.querySelector('.sr-cap-fail button').textContent, still: UmaSkillResult.peek().built, video: UmaSkillResult.peek().video }));
			assert(fail.text === t['sr.cap.fail.band'] && fail.retry === (await vtext(page, 'video.cap.retry')) && fail.still && fail.video && fail.video.kind === 'capture',
				'T193(4) ' + NAME + ' スキル画面が見つからないときは本育成結果の文（sr.cap.fail.band）と「もう一度」・前の結合画像はそのまま', fail);
			assert(jsErrors(errors).length === 0, 'T193(4) ' + NAME + ' コンソールのエラーなし', errors);
			await page.context().close();
		});
	}

	await block('T193(3) UmaStar の本育成結果の動画の失敗と取り消し: スキル画面の無い動画は本育成結果の文・取り消しは親A と同じトースト・どちらも入っていた画像はそのまま', async () => {
		const sp = await open('special');
		const { page, errors } = sp;
		await page.evaluate(async () => { UmaSkillResult.addFiles(await __skillSynth.make(3, 14, 9)); });
		const t = await T(page);
		// 画面全体が動く動画（上の欄も一覧の帯も無い → 一覧の帯が見つからない〔code 'band'〕。親A なら video.err.noscreen の場面）
		const res = await page.evaluate(async () => {
			const tall = document.createElement('canvas'); tall.width = 1200; tall.height = 8000;
			const x = tall.getContext('2d');
			for (let y = 0; y < 8000; y += 100) { x.fillStyle = 'rgb(' + (40 + (y * 7) % 200) + ',' + (60 + (y * 13) % 180) + ',' + (80 + (y * 3) % 160) + ')'; x.fillRect(0, y, 1200, 100); x.fillStyle = '#fff'; x.fillRect(100 + (y * 17) % 800, y + 20, 200, 50); }
			const src = UmaVideoFrames.canvasSource({ width: 1200, height: 2600, duration: 5, exact: true, draw: (tt, ctx, dw, dh) => ctx.drawImage(tall, 0, Math.round(Math.min(tt, 4) * 1000), 1200, 2600, 0, 0, dw, dh) });
			return UmaSkillResult.runVideo(src);
		});
		const err = await page.evaluate(() => ({ text: (document.querySelector('.sr-video-error .video-error-text') || {}).textContent || null, files: UmaSkillResult.peek().files, video: UmaSkillResult.peek().video }));
		const keep = await vtext(page, 'video.err.keep');
		assert(!res.ok && err.text === t['sr.video.err.noscreen'] + keep && err.files === 3 && err.video === null, 'T193(3) スキル画面の無い動画: 本育成結果の文（sr.video.err.noscreen）＋「' + keep + '」・入っていた3枚はそのまま', { res, err });
		// 取り消す: 遅い出どころで始め、進み具合の「取り消す」を押す
		await page.evaluate(() => {
			const base = __skillSynth.video(30, 21);
			const slow = Object.assign({}, base, { drawAt: async (tt, ctx, dw, dh, sig, how) => { await new Promise((r) => setTimeout(r, 60)); return base.drawAt(tt, ctx, dw, dh, sig, how); } });
			window.__toasts = [];
			const st0 = window.showToast;
			window.showToast = function (m) { window.__toasts.push(m); return st0.apply(this, arguments); };
			window.__abortRun = UmaSkillResult.runVideo(slow);
		});
		await page.waitForSelector('.sr-video-progress [data-sr-act="abort"]');
		await page.click('.sr-video-progress [data-sr-act="abort"]');
		const ab = await page.evaluate(async () => { const out = await window.__abortRun; return { out, toasts: window.__toasts.slice(), files: UmaSkillResult.peek().files, prog: !!document.querySelector('.sr-video-progress'), vbusy: UmaSkillResult.peek().vbusy }; });
		assert(ab.out.aborted && ab.toasts.includes(await vtext(page, 'video.toast.cancel')) && ab.files === 3 && !ab.prog && !ab.vbusy, 'T193(3) 取り消すと親A と同じトースト（video.toast.cancel）・入っていた3枚はそのまま・進み具合の箱は消える', ab);
		assert(jsErrors(errors).filter((m) => !/人が|帯|band|too-few|使えるフレーム/.test(m)).length === 0, 'T193(3) 想定外のエラーなし', errors);
		await page.context().close();
	});

	await block('T193(5) UmaStar の本育成結果の数え方と上の欄（T193 の直し）: 光が金の右に乗っても金・光で上下2枚がつながっても2枚・枠の上の縁が3行にじんでも区切りが見つかる', async () => {
		const sp = await open('special');
		const { page, errors } = sp;
		const r = await page.evaluate(async () => {
			const S = UmaSkillResult;
			// 一覧のまね（幅 1160。2列のパネル・高さ 96・間 26・地 242）。左の列: 白・金（右に白い光）・白・白（下の2枚の間を光がふさぐ）・金。右の列: 白×5
			const W = 1160, PH = 96, G = 26;
			const c = document.createElement('canvas'); c.width = W; c.height = 30 + 5 * (PH + G);
			const x = c.getContext('2d');
			x.fillStyle = 'rgb(242,242,242)'; x.fillRect(0, 0, W, c.height);
			const KIND = { white: [[246, 239, 233], [191, 191, 222]], gold: [[234, 245, 253], [255, 194, 40]] };
			const cols = [[40, 560], [600, 1120]];
			const panel = (col, row, k) => { const [a, b] = cols[col], y = 30 + row * (PH + G); const g = x.createLinearGradient(a, 0, b, 0); g.addColorStop(0, 'rgb(' + KIND[k][0] + ')'); g.addColorStop(1, 'rgb(' + KIND[k][1] + ')'); x.fillStyle = g; x.fillRect(a, y, b - a, PH); return y; };
			['white', 'gold', 'white', 'white', 'gold'].forEach((k, i) => panel(0, i, k));
			for (let i = 0; i < 5; i++) panel(1, i, 'white');
			// 光: 金（2行目）の右寄りに白っぽい輪
			const y1 = 30 + 1 * (PH + G);
			const glow = (cx, cy, r) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,250,240,0.9)'); g.addColorStop(1, 'rgba(255,250,240,0.55)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
			glow(470, y1 + PH / 2, 70);
			// 光: 4行目と5行目の間をふさぐ（縦の帯の行の間を明るくない色で埋める）
			const y4 = 30 + 3 * (PH + G);
			x.fillStyle = 'rgba(230,210,200,1)'; x.fillRect(300, y4 + PH, 260, G);
			const cnt = S.countSkills(c);
			// 上の欄: 作り物のスキル画面の1枚目から上の欄を作り、「スピード〜賢さ」の枠（帯の上端から 340 の行）の上の3行をにじませる
			const f = (await __skillSynth.make(1, 14, 3))[0];
			const im = new Image(); im.src = URL.createObjectURL(f); await im.decode();
			const head = document.createElement('canvas'); head.width = 1160; head.height = 700;
			head.getContext('2d').drawImage(im, 20, 200, 1160, 700, 0, 0, 1160, 700);
			const hx = head.getContext('2d');
			const before = S.headLayout(head);
			hx.fillStyle = 'rgb(205,228,190)'; hx.fillRect(60, before.statsTop - 3, 1040, 3);   // 枠の左右の幅だけ、緑でも地でもない色に
			const blurred = S.headLayout(head);
			return { counts: { all: cnt.all, gold: cnt.gold, white: cnt.white }, split: cnt.panels.filter((p) => p.split).length, before: { ok: before.ok, statsTop: before.statsTop, faceEnd: before.faceEnd }, blurred: { ok: blurred.ok, statsTop: blurred.statsTop, faceEnd: blurred.faceEnd } };
		});
		assert(r.counts.gold === 2, 'T193(5) タッチの光が金のパネルの右寄りに乗っても金に数える（左寄りが金寄り）', r.counts);
		assert(r.counts.all === 10 && r.counts.white === 8 && r.split === 2, 'T193(5) 光で上下2枚のパネルがつながっても2枚に数える（パネルの高さと行の間で割る）', r);
		assert(r.before.ok && r.blurred.ok && r.blurred.statsTop === r.before.statsTop && r.blurred.faceEnd <= r.before.statsTop - 4, 'T193(5) 「スピード〜賢さ」の枠の上の縁が3行にじんでも上の欄の区切りが見つかる', r);
		assert(jsErrors(errors).length === 0, 'T193(5) コンソールのエラーなし', errors);
		await page.context().close();
	});
}
