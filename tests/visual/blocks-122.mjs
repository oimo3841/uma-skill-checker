// T105 段2（2026-11-07）: 製品の PC のウィンドウの取り込み（special.html の③の動画モード・js/pc-capture.js）の検査。塊の見出しはすべて「T105 PC取り込み」で始まる。
// 決め: 249（入口は「動画を選ぶ」の並び）・250（止めるボタンと上限 3分）・251（領域を自動で見つける）・252・325（出す判定）・258（色の範囲）・304（anchorY）・
// 320〜324・333〜335（モックの文と置き場所）・348・349（右の余白の境・本文が左へ動く）。文の正はモック lab/pc-capture-mock.html。
// 本物の画面共有の選択は人にしかできないので、getDisplayMedia を作り物の窓（blocks-112 の FAKE_WINDOW）に差し替える。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH85 } from './blocks-100.mjs';
import { FAKE_WINDOW } from './blocks-112.mjs';
import { POINTER } from './blocks-119.mjs';

const WIN11 = { border: [2, 1, 2, 2], title: 56 };
const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));

export async function register122(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const closeNotices = async (page) => { for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {}); };
	const open = async (w = 1280, h = 900, theme = null) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		await sp.page.evaluate((th) => {
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			localStorage.setItem('uma-special-upload-mode', 'video');
			if (th) localStorage.setItem('uma-tools-theme', th);
		}, theme);
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.evaluate(() => { selectStepTab(2); window.scrollTo(0, 0); });
		sp.page.setDefaultTimeout(240000);
		await sp.page.addScriptTag({ content: SYNTH85 });
		await sp.page.addScriptTag({ content: FAKE_WINDOW });
		await sp.page.addScriptTag({ content: POINTER });
		return sp;
	};
	const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
	// スクロールする作り物のゲームを窓として流す
	const stubGame = (page, withPointer = false) => page.evaluate(({ WIN, withPointer }) => {
		const s = __synth85.make({ path: 'stops' });
		window.__s = s;
		window.__st = __win.stub(withPointer ? __ptr.wrap(s.source, () => [30, 900]) : s.source, WIN);
		return s.duration;
	}, { WIN: WIN11, withPointer });
	// 動かない絵を窓として流す（draw で好きな絵を描く）
	const stubStill = (page, W, H, kind) => page.evaluate(({ W, H, kind, WIN }) => {
		let paint;
		if (kind === 'blank') paint = (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); };
		else if (kind === 'aspect') paint = (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#ddd'; x.fillRect(0, 0, w, 40); x.fillStyle = '#333'; for (let k = 0; k < 20; k++) x.fillRect(40, 60 + k * 24, 300 + k * 20, 10); };
		else { const p = __win.paint(W, H, kind === 'thin' ? { border: [1, 1, 1, 1], title: 32 } : Object.assign({}, WIN)); paint = (x, w, h) => { x.drawImage(p.c, 0, 0, w, h); }; }
		const src = UmaVideoFrames.canvasSource({ width: W, height: H, duration: 600, draw(t, x, w, h) { paint(x, w, h); x.fillStyle = 'rgb(' + (Math.floor(t * 30) % 2) + ',0,0)'; x.fillRect(0, h - 1, 1, 1); } });
		window.__st = __win.stub(src, { border: [0, 0, 0, 0], title: 0 });
	}, { W, H, kind, WIN: WIN11 });
	const startCapture = async (page) => { await page.click('#personset-A-wrap .video-capture-btn'); await page.waitForSelector('#cap-box'); };
	const waitFound = (page) => page.waitForFunction(() => { const t = document.getElementById('cap-time'); return t && !t.hidden; });
	const state = (page) => page.evaluate(() => {
		const q = (id) => document.getElementById(id), vis = (e) => !!(e && e.getClientRects().length > 0);
		const panel = document.querySelector('#personset-A-wrap .upload-set-panel');
		return {
			box: vis(q('cap-box')), video: vis(q('cap-video')), howto: [...document.querySelectorAll('.cap-howto')].map((e) => e.textContent), time: vis(q('cap-time')) ? q('cap-time').textContent : '',
			frame: vis(q('cap-frame')), stop: vis(q('cap-stop')) ? q('cap-stop').textContent : '', fail: vis(q('cap-fail')) ? q('cap-fail').querySelector('p').textContent : '', retry: vis(q('cap-retry')) ? q('cap-retry').textContent : '',
			note: vis(q('cap-note')) ? q('cap-note').textContent : '', prog: vis(q('video-progress')), progInPanel: !!(q('video-progress') && panel.contains(q('video-progress'))), pick: vis(panel.querySelector('.video-pick-btn')), cap: vis(panel.querySelector('.video-capture-btn')),
			modeOff: [...document.querySelectorAll('[data-upload-mode-btn]')].every((b) => b.disabled), clearOff: panel.querySelector('.upload-set-clear > button').disabled, side: document.body.classList.contains('cap-side'), tracks: window.__st && __st.stream ? __st.stream.getTracks().filter((t) => t.readyState === 'live').length : -1
		};
	});

	await block('T105 PC取り込み(25) 製品 入口: 2つのボタンが同じ行・同じ高さ 76px で行は増えない・？に取り込みの文が出る', async () => {
		const sp = await open(); const { page, errors } = sp;
		const m = await page.evaluate(() => {
			const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right }; };
			const a = document.querySelector('#personset-A-wrap .video-pick-btn'), b = document.querySelector('#personset-A-wrap .video-capture-btn');
			document.querySelector('#personset-A-wrap .video-howto-btn').click();
			return { a: r(a), b: r(b), ta: a.textContent, tb: b.textContent, help: document.querySelector('#personset-A-wrap .video-howto-box').innerText };
		});
		assert(m.ta.includes('動画を選ぶ') && m.tb.includes('ウィンドウから取り込む'), 'T105 PC取り込み(25) 入口の2つの文', m);
		assert(m.a.y === m.b.y && m.a.h === 76 && m.b.h === 76 && m.a.w === m.b.w && m.b.x > m.a.right, 'T105 PC取り込み(25) 同じ行・高さ 76px・同じ幅', m);
		assert(m.help.includes('ウィンドウの一覧でウマ娘の画面を選び') && m.help.includes('映像はこの PC の中だけで使います。') && m.help.includes('撮り方'), 'T105 PC取り込み(25) ？に撮り方と取り込みの文', m.help);
		assert(await noOverflow(page), 'T105 PC取り込み(25) 横スクロールなし');
		assert(jsErrors(errors).length === 0, 'T105 PC取り込み(25) エラー 0', errors);
		await sp.ctx.close();
	});

	await block('T105 PC取り込み(26) 製品 スマホ・機能の無いブラウザでは入口が出ず、動画モードは今のまま（1つのボタンが枠いっぱい）', async () => {
		for (const [name, init] of [
			['スマホ', () => { Object.defineProperty(navigator, 'userAgentData', { value: { mobile: true } }); }],
			['iPhone の Safari', () => { delete MediaDevices.prototype.getDisplayMedia; }],
			['MediaStreamTrackProcessor なし', () => { delete window.MediaStreamTrackProcessor; }]
		]) {
			const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
			await ctx.addInitScript(() => { localStorage.setItem('umaSkillDeck:stepTab', '2'); localStorage.setItem('uma-special-upload-mode', 'video'); });
			await ctx.addInitScript(init);
			const page = await ctx.newPage();
			await page.goto(base + '/special.html');
			await page.waitForFunction(() => document.querySelector('#personset-A-wrap .video-pick-btn'));
			const r = await page.evaluate(() => {
				selectStepTab(2);
				const a = document.querySelector('#personset-A-wrap .video-pick-btn'), row = a.parentElement;
				document.querySelector('#personset-A-wrap .video-howto-btn').click();
				return { cap: document.querySelectorAll('.video-capture-btn').length, offer: UmaPcCapture.shouldOffer().offer, w: a.getBoundingClientRect().width, rowW: row.getBoundingClientRect().width, h: a.getBoundingClientRect().height, help: document.querySelector('#personset-A-wrap .video-howto-box').textContent, over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
			});
			assert(r.cap === 0 && !r.offer, `T105 PC取り込み(26) ${name}: 入口が出ない`, r);
			assert(r.w === r.rowW && r.h === 76 && !r.over, `T105 PC取り込み(26) ${name}: 「動画を選ぶ」は幅いっぱい・高さ 76px`, r);
			assert(!r.help.includes('ウィンドウ'), `T105 PC取り込み(26) ${name}: ？は撮り方の3行だけ`, r.help);
			await ctx.close();
		}
	});

	for (const theme of ['light', 'dark']) {
		await block(`T105 PC取り込み(27) 製品 ${theme} 流れ: 探している→見つかった→止める→処理→結合画像（カーソルも消える）`, async () => {
			const sp = await open(1280, 900, theme); const { page, errors } = sp;
			const D = await stubGame(page, true);
			await startCapture(page);
			const s0 = await state(page);
			assert(s0.box && s0.video && s0.howto.length === 2 && s0.howto[0].startsWith('・親から祖2') && s0.howto[1].startsWith('・スクロールの一時停止'), 'T105 PC取り込み(27) 取り込み中: 映像と撮り方の2行', s0);
			assert(s0.stop === '取り込みを止める', 'T105 PC取り込み(27) 探している間も止めるボタンがある（321）', s0);
			assert(!s0.pick && !s0.cap, 'T105 PC取り込み(27) 取り込み中は入口を出さない', s0);
			assert(s0.modeOff && s0.clearOff, 'T105 PC取り込み(27) 取り込み中は「静止画｜動画」「セットをクリア」を押せない', s0);
			await waitFound(page);
			await page.waitForTimeout(600);
			const s1 = await state(page);
			assert(s1.frame && /^残り 2:\d\d$/.test(s1.time), 'T105 PC取り込み(27) 見つかった: 青い枠と残り時間 ' + s1.time, s1);
			const fr = await page.evaluate(() => { const f = document.getElementById('cap-frame'), v = document.getElementById('cap-video'), a = f.getBoundingClientRect(), b = v.getBoundingClientRect(), cs = getComputedStyle(f); return { color: cs.borderTopColor, inside: a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1, share: (a.width * a.height) / (b.width * b.height) }; });
			assert(fr.color === 'rgb(10, 124, 255)' && fr.inside && fr.share > 0.5, 'T105 PC取り込み(27) 枠は青で映像の中', fr);
			await page.waitForTimeout(Math.round(D * 1000) + 300);
			await page.click('#cap-stop');
			await page.waitForFunction(() => document.getElementById('video-progress'));
			const s2 = await state(page);
			assert(s2.prog && s2.progInPanel && !s2.box && !s2.video && !s2.side, 'T105 PC取り込み(27) 処理の箱は枠の中に出て、映像は消え、本文は元に戻る', s2);
			assert(s2.tracks === 0 && s2.modeOff && s2.clearOff, 'T105 PC取り込み(27) 止めたら画面共有を閉じる・処理中も押せない', s2);
			const abort = await page.evaluate(() => { const b = document.querySelector('#video-progress [data-video-act="abort"]'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { hit: !!(e && b.contains(e)), op: getComputedStyle(document.querySelector('#personset-A-wrap')).opacity }; });
			assert(abort.op === '1', 'T105 PC取り込み(27) 処理の箱は薄くならない', abort);
			await page.waitForFunction(() => !document.getElementById('video-progress'));
			const r = await page.evaluate(() => {
				const box = document.querySelector('#personset-A-wrap .video-result'), c = box && box.querySelector('canvas, img');
				return { result: !!c, files: [0, 1, 2].map((i) => persons[i].files.length), anchor: [0, 1, 2].map((i) => persons[i].video && persons[i].video.anchorY), fail: !!document.getElementById('cap-fail'), err: !!document.getElementById('video-error'), bar: document.getElementById('upload-bar').hidden };
			});
			const s3 = await state(page);
			assert(r.result && r.files.every((n) => n > 0) && !r.fail && !r.err, 'T105 PC取り込み(27) 3人の枠に入り、結合画像が出る', r);
			assert(r.anchor.every((y) => typeof y === 'number'), 'T105 PC取り込み(27) 人ごとの anchorY を持つ（304）', r.anchor);
			assert(s3.pick && s3.cap && !s3.modeOff && !s3.clearOff, 'T105 PC取り込み(27) 終わると入口が戻り、押せる', s3);
			// カーソルの色の画素が人ごとの結合画像に無い（__ptr の色）
			const cnt = await page.evaluate(async () => { let n = 0; for (const i of [0, 1, 2]) { const v = persons[i].video; const c = await UmaVideoFrames.composePerson(v.files, v.shifts, v.uncertain, 'x', { still: v.still, anchorY: v.anchorY }); n += __ptr.count(c); } return n; });
			assert(cnt === 0, 'T105 PC取り込み(27) 結合の素材にカーソルが残らない', cnt);
			assert(await noOverflow(page), 'T105 PC取り込み(27) 横スクロールなし');
			assert(jsErrors(errors).length === 0, 'T105 PC取り込み(27) エラー 0', errors);
			await sp.ctx.close();
		});
	}

	await block('T105 PC取り込み(28) 製品 映像の置き場所: 右の余白（スクロールしても見える・本文に重ならない）／狭い窓は枠の中 200px／窓の大きさを変えると切り替わる', async () => {
		const sp = await open(1280, 900); const { page, errors } = sp;
		await stubGame(page);
		const before = await page.evaluate(() => document.getElementById('step-panel-2').getBoundingClientRect().left);
		await startCapture(page);
		const measure = () => page.evaluate(() => {
			const v = document.getElementById('cap-video').getBoundingClientRect(), p = document.getElementById('step-panel-2').getBoundingClientRect(), cs = getComputedStyle(document.getElementById('cap-video'));
			const bar = document.getElementById('upload-bar').getBoundingClientRect(), head = document.querySelector('.site-header').getBoundingClientRect(), barIn = document.getElementById('upload-bar').firstElementChild.getBoundingClientRect(), box = document.getElementById('cap-box').getBoundingClientRect();
			return { pos: cs.position, x: v.x, y: v.y, w: v.width, h: v.height, right: v.right, bottom: v.bottom, pLeft: p.left, pRight: p.right, pW: p.width, barTop: bar.top, headLeft: head.left, headRight: head.right, barInLeft: barIn.left, barInW: barIn.width, boxRight: box.right, W: document.documentElement.clientWidth, Vh: innerHeight, side: document.body.classList.contains('cap-side'), inBody: document.getElementById('cap-video').parentElement === document.body, playing: !document.querySelector('#cap-video video').paused, over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
		});
		for (const [w, h] of [[1280, 900], [1600, 900], [1920, 1080], [1280, 640], [971, 800]]) {
			await page.setViewportSize({ width: w, height: h });
			await page.waitForFunction((w) => document.documentElement.clientWidth <= w && document.body.classList.contains('cap-side'), w);
			await page.waitForTimeout(250);
			const m = await measure();
			assert(m.pos === 'fixed' && m.side && m.inBody && m.y === 16 && m.right === m.W - 16, `T105 PC取り込み(28) ${w}×${h} 映像は右の余白（上 16px・右 16px）`, m);
			assert(m.pRight <= m.x && m.headRight <= m.x, `T105 PC取り込み(28) ${w}×${h} 本文と見出しに重ならない`, m);
			assert(m.bottom <= m.barTop, `T105 PC取り込み(28) ${w}×${h} 下の欄に隠れない`, m);
			assert(Math.abs(m.w / m.h - 984 / 1804) < 0.01 && m.h >= 400, `T105 PC取り込み(28) ${w}×${h} 縦横比のまま・高さ 400px 以上（${Math.round(m.w)}×${Math.round(m.h)}）`, m);
			assert(Math.abs(m.barInLeft - m.pLeft) <= 1 && Math.abs(m.barInW - m.pW) <= 1, `T105 PC取り込み(28) ${w}×${h} 下の欄は本文にそろう`, m);
			assert(m.playing, `T105 PC取り込み(28) ${w}×${h} 映像は流れている`, m);
			assert(!m.over, `T105 PC取り込み(28) ${w}×${h} 横スクロールなし`, m);
			const y0 = m.y;
			await page.evaluate(() => window.scrollTo(0, 400));
			await page.waitForTimeout(50);
			const m2 = await measure();
			assert(m2.y === y0, `T105 PC取り込み(28) ${w}×${h} スクロールしても同じ場所`, m2);
			await page.evaluate(() => window.scrollTo(0, 0));
		}
		// 余白が足りる窓（2560）は本文を動かさない
		await page.setViewportSize({ width: 2560, height: 1440 });
		await page.waitForFunction(() => innerWidth === 2560);
		await page.waitForTimeout(300);
		const big = await page.evaluate(() => getComputedStyle(document.querySelector('.page-wrap')).left);
		assert(big === '0px', 'T105 PC取り込み(28) 2560×1440 本文は動かない', big);
		// 狭い窓は枠の中・200px（境 971／970。高さは 499／498）
		for (const [w, h] of [[970, 800], [900, 800], [1280, 498]]) {
			await page.setViewportSize({ width: w, height: h });
			await page.waitForFunction(() => !document.body.classList.contains('cap-side'));
			await page.waitForTimeout(250);
			const m = await measure();
			assert(!m.side && !m.inBody && m.pos === 'relative' && Math.round(m.h) === 200, `T105 PC取り込み(28) ${w}×${h} 映像は枠の中・200px`, m);
			assert(m.playing && !m.over, `T105 PC取り込み(28) ${w}×${h} 流れている・横スクロールなし`, m);
			await page.setViewportSize({ width: 1280, height: 900 });
			await page.waitForFunction(() => document.body.classList.contains('cap-side'));
		}
		// 右の境の値（幅 971・高さ 499 は右）。sideLayout は下の欄の高さを受ける
		const lay = await page.evaluate(() => { const bar = document.getElementById('upload-bar').offsetHeight; return { bar, a: UmaPcCapture.sideLayout(971, 800, 67).side, b: UmaPcCapture.sideLayout(970, 800, 67).side, c: UmaPcCapture.sideLayout(1280, 499, 67).side, d: UmaPcCapture.sideLayout(1280, 498, 67).side }; });
		assert(lay.a && !lay.b && lay.c && !lay.d, 'T105 PC取り込み(28) 境は幅 971px・高さ 499px（モックと同じ）', lay);
		// 別のタブへ移ると本文を元に戻す
		await page.evaluate(() => selectStepTab(1));
		await page.waitForTimeout(700);
		const off = await page.evaluate(() => ({ side: document.body.classList.contains('cap-side'), left: getComputedStyle(document.querySelector('.page-wrap')).left, vis: document.getElementById('cap-video').getClientRects().length }));
		assert(!off.side && off.vis === 0, 'T105 PC取り込み(28) ほかのタブの間は本文を動かさず、映像も出さない', off);
		await page.evaluate(() => selectStepTab(2));
		await page.waitForFunction(() => document.body.classList.contains('cap-side'));
		await page.click('#cap-stop');
		await page.waitForFunction(() => !document.body.classList.contains('cap-side'));
		const end = await page.evaluate(() => ({ left: document.getElementById('step-panel-2').getBoundingClientRect().left, W: document.documentElement.clientWidth, vars: document.documentElement.style.getPropertyValue('--cap-side-w') }));
		assert(end.left === before && end.vars === '', 'T105 PC取り込み(28) 止めると本文は元の位置に戻る', { end, before });
		await page.waitForFunction(() => !document.getElementById('video-progress'));
		// スクロールの途中で止めたので、3人に分かれない失敗は出てよい
		assert(jsErrors(errors).filter((x) => !/人が3人に分かれない/.test(x)).length === 0, 'T105 PC取り込み(28) エラー 0', errors);
		await sp.ctx.close();
	});

	await block('T105 PC取り込み(29) 製品 文がモックと同じ', async () => {
		const sp = await open(); const { page } = sp;
		const prod = await page.evaluate(() => {
			const t = {}; for (const k of ['video.btn.pick', 'video.btn.capture', 'video.howto.title', 'video.howto.step1', 'video.howto.step2', 'video.howto.capTitle', 'video.howto.cap', 'video.cap.remain', 'video.cap.stop', 'video.cap.limit', 'video.cap.retry', 'video.prog.foot', 'video.btn.abort']) t[k] = videoText(k, { t: '{t}' });
			const f = {}; for (const k of ['small', 'large', 'blank', 'aspect', 'unstable', 'band', 'toofew']) f[k] = videoText('video.cap.fail.' + k);
			return { t, f };
		});
		const m = await sp.ctx.newPage();
		await m.goto(base + '/lab/pc-capture-mock.html');
		const mock = await m.evaluate(() => ({ TXT: __mock.TXT, FAIL: __mock.FAIL, side: __mock.SIDE }));
		const pairs = [['video.btn.pick', 'pick'], ['video.btn.capture', 'capture'], ['video.howto.title', 'howtoTitle'], ['video.howto.step1', 'howto1'], ['video.howto.step2', 'howto2'], ['video.howto.capTitle', 'howtoCapTitle'], ['video.howto.cap', 'howtoCap'], ['video.cap.remain', 'remain'], ['video.cap.stop', 'stop'], ['video.cap.limit', 'limit'], ['video.cap.retry', 'retry'], ['video.prog.foot', 'progFoot'], ['video.btn.abort', 'abort']];
		for (const [a, b] of pairs) assert(prod.t[a] === mock.TXT[b], `T105 PC取り込み(29) ${a} がモックと同じ`, [prod.t[a], mock.TXT[b]]);
		for (const k of Object.keys(prod.f)) assert(prod.f[k] === mock.FAIL['fail-' + k][1], `T105 PC取り込み(29) 失敗 ${k} がモックと同じ`, [prod.f[k], mock.FAIL['fail-' + k]]);
		const side = await page.evaluate(() => UmaPcCapture.SIDE);
		assert(JSON.stringify(side) === JSON.stringify(mock.side), 'T105 PC取り込み(29) 右の余白の値がモックと同じ', [side, mock.side]);
		const read = (n) => fs.readFileSync(path.join(REPO_ROOT, n), 'utf8').replace(/\r\n/g, '\n');
		const of = (s) => (/\tfunction shouldOffer\(\) \{[\s\S]*?\n\t\}\n/.exec(s) || [''])[0];
		const a = of(read('js/pc-capture.js'));
		assert(a.length > 100 && a === of(read('lab/pc-capture-mock.html')), 'T105 PC取り込み(29) shouldOffer が今の文のまま（325）', a.length);
		// T158（決定 629）で速い動画の ages も同じ所で渡すようになった（, ages: v.ages）
		assert(/composePerson\(files, v\.shifts, v\.uncertain, label, \{ still: v\.still, anchorY: v\.anchorY(, ages: v\.ages)? \}\)/.test(read('special.html')), 'T105 PC取り込み(29) composePerson に anchorY を渡す（304）');
		await sp.ctx.close();
	});

	await block('T105 PC取り込み(30) 製品 失敗: 文と「もう一度」・入っていた画像はそのまま・もう一度で取り込み直せる', async () => {
		for (const [kind, want, W, H, how] of [
			['blank', 'blank', 984, 1804, 'still'],
			['aspect', 'aspect', 1200, 800, 'still'],
			['small', 'small', 492, 902, 'still'],
			['large', 'large', 1500, 2697, 'still'],
			['band', 'band', 984, 1804, 'still'],
			['resize', 'unstable', 0, 0, 'resize']
		]) {
			const sp = await open(); const { page, errors } = sp;
			if (how === 'resize') {
				await page.evaluate(() => {
					const s = __synth85.make({ path: 'stops' });
					window.__st = __win.stub(s.source, { border: [2, 1, 2, 2], title: 56 });
				});
			} else await stubStill(page, W, H, kind === 'small' || kind === 'large' ? 'thin' : kind === 'band' ? 'win' : kind);
			await page.evaluate(() => { persons[0].files = [new File(['x'], 'keep.png', { type: 'image/png' })]; });
			await startCapture(page);
			if (how === 'resize') {
				await waitFound(page);
				await page.waitForTimeout(2300);
				await page.evaluate(() => { const c = __st.stream.getVideoTracks()[0].canvas; c.width += 40; });
				await page.waitForFunction(() => document.getElementById('cap-fail') || document.getElementById('video-error'));
			} else {
				await page.waitForTimeout(2200);
				if (kind === 'aspect') { const q = await state(page); assert(!q.frame && !q.time && q.stop === '取り込みを止める', 'T105 PC取り込み(30) 見つからない間は枠も残り時間も出ない（探している）', q); }
				await page.click('#cap-stop');
				await page.waitForFunction(() => document.getElementById('cap-fail') || document.getElementById('video-error'));
			}
			const s = await state(page);
			const text = await page.evaluate((k) => videoText('video.cap.fail.' + k), want);
			assert(s.fail === text && s.retry === 'もう一度', `T105 PC取り込み(30) ${kind}: 「${want}」の文と「もう一度」`, s);
			assert(!s.pick && !s.box && !s.modeOff && s.tracks === 0, `T105 PC取り込み(30) ${kind}: 入口の代わりに出て、画面共有は閉じている`, s);
			const kept = await page.evaluate(() => persons[0].files.length === 1 && persons[0].files[0].name === 'keep.png');
			assert(kept, `T105 PC取り込み(30) ${kind}: 入っていた画像はそのまま`);
			if (kind === 'blank') {
				// もう一度 → 選ぶのをやめる → 入口に戻る
				await page.evaluate(() => { navigator.mediaDevices.getDisplayMedia = async () => { throw new DOMException('x', 'NotAllowedError'); }; });
				await page.click('#cap-retry');
				await page.waitForFunction(() => !document.getElementById('cap-fail'));
				const c = await state(page);
				assert(c.pick && c.cap && !c.box, 'T105 PC取り込み(30) もう一度で選ぶのをやめると入口に戻る', c);
				// もう一度で取り込み直せる
				await stubStill(page, 984, 1804, 'win');
				await startCapture(page);
				const again = await state(page);
				assert(again.box && again.stop === '取り込みを止める', 'T105 PC取り込み(30) もう一度取り込める', again);
				await page.click('#cap-stop');
				await page.waitForFunction(() => document.getElementById('cap-fail'));
			}
			await page.click('[data-upload-mode-btn="shot"]');
			const m = await page.evaluate(() => ({ fail: !!document.getElementById('cap-fail'), on: document.querySelector('#personset-A-wrap .upload-set-panel').classList.contains('cap-on') }));
			assert(!m.fail && !m.on, `T105 PC取り込み(30) ${kind}: モードを変えると消える`, m);
			assert(jsErrors(errors).filter((x) => !/取り込みの読み取り/.test(x)).length === 0, `T105 PC取り込み(30) ${kind}: エラー 0`, errors);
			await sp.ctx.close();
		}
	});

	await block('T105 PC取り込み(31) 製品 スクロールしなかったときは「動きが読み取れませんでした」', async () => {
		const sp = await open(); const { page, errors } = sp;
		// 動きのない窓（ゲームの形はある）
		await stubStill(page, 984, 1804, 'win');
		await startCapture(page);
		await waitFound(page);
		await page.waitForTimeout(800);
		await page.click('#cap-stop');
		await page.waitForFunction(() => document.getElementById('cap-fail') || document.getElementById('video-error'));
		const s = await state(page);
		assert(/見つけられませんでした|読み取れませんでした/.test(s.fail) && s.retry === 'もう一度', 'T105 PC取り込み(31) 動かない窓は案内と「もう一度」: ' + s.fail, s);
		const map = await page.evaluate(() => [videoText('video.cap.fail.toofew'), videoText('video.cap.fail.band')]);
		assert(map[0] === '動きが読み取れませんでした。因子の画面をスクロールしてください。', 'T105 PC取り込み(31) 文', map);
		assert(jsErrors(errors).length === 0, 'T105 PC取り込み(31) エラー 0', errors);
		await sp.ctx.close();
	});

	await block('T105 PC取り込み(32) 製品 上限で止まる（「3分で止めました」）・共有を止めても処理へ進む・取り消せる・選ぶのをやめると何も変わらない', async () => {
		const sp = await open(); const { page, errors } = sp;
		// 選ぶのをやめる
		await page.evaluate(() => { navigator.mediaDevices.getDisplayMedia = async () => { throw new DOMException('x', 'NotAllowedError'); }; });
		await page.click('#personset-A-wrap .video-capture-btn');
		await page.waitForTimeout(100);
		const c = await state(page);
		assert(c.pick && c.cap && !c.box && !c.fail && !c.modeOff, 'T105 PC取り込み(32) 選ぶのをやめると入口のまま・案内なし', c);
		// 上限（3分を検査の中だけ短くする。作りの既定は 180 秒）
		const def = await page.evaluate(() => UmaPcCapture.config.limitSec);
		assert(def === 180, 'T105 PC取り込み(32) 上限の既定は 3分', def);
		await page.evaluate(() => { UmaPcCapture.config.limitSec = 9; });
		await stubGame(page);
		await startCapture(page);
		await page.waitForFunction(() => document.getElementById('cap-note'));
		const s = await state(page);
		assert(s.note === '3分で止めました' && s.prog && s.progInPanel && !s.box, 'T105 PC取り込み(32) 上限で止まると1行と処理の箱', s);
		const pos = await page.evaluate(() => { const n = document.getElementById('cap-note'), p = document.getElementById('video-progress'); return n.getBoundingClientRect().bottom <= p.getBoundingClientRect().top; });
		assert(pos, 'T105 PC取り込み(32) 1行は処理の箱の上');
		// 処理の途中で取り消す
		await page.click('#video-progress [data-video-act="abort"]');
		await page.waitForFunction(() => !document.getElementById('video-progress'));
		const a = await state(page);
		assert(a.pick && a.cap && !a.note && !a.modeOff && a.tracks === 0, 'T105 PC取り込み(32) 取り消すと入口に戻る', a);
		const kept = await page.evaluate(() => persons[0].files.length);
		assert(kept === 0, 'T105 PC取り込み(32) 取り消すと枠は変わらない', kept);
		// ブラウザの「共有を停止」（track の ended）
		await page.evaluate(() => { UmaPcCapture.config.limitSec = 180; });
		await stubGame(page);
		await startCapture(page);
		await waitFound(page);
		await page.waitForTimeout(600);
		await page.evaluate(() => { const t = __st.stream.getVideoTracks()[0]; t.stop(); t.dispatchEvent(new Event('ended')); });
		await page.waitForFunction(() => !document.getElementById('cap-box'));
		const e = await state(page);
		assert(!e.box && e.tracks === 0, 'T105 PC取り込み(32) 共有を止めると取り込みが終わる', e);
		await page.waitForFunction(() => !document.getElementById('video-progress') && (document.getElementById('cap-fail') || document.getElementById('video-error') || persons[0].video));
		assert(jsErrors(errors).filter((x) => !/人が3人に分かれない/.test(x)).length === 0, 'T105 PC取り込み(32) エラー 0', errors);
		await sp.ctx.close();
	});

	await block('T105 PC取り込み(33) 製品 ほかのことをしない: 通信しない・動画ファイルの流れはカーソルを消さない', async () => {
		const sp = await open(); const { page, errors } = sp;
		await stubGame(page);
		const reqs = [];
		page.on('request', (q) => { if (/^(POST|PUT)$/.test(q.method()) || !q.url().startsWith(base)) reqs.push(q.method() + ' ' + q.url()); });
		await startCapture(page);
		await waitFound(page);
		await page.waitForTimeout(800);
		await page.click('#cap-stop');
		await page.waitForFunction(() => !document.getElementById('video-progress') && (document.getElementById('cap-fail') || document.getElementById('video-error') || persons[0].video));
		const filtered = reqs.filter((u) => !/cdn|fonts\.|tailwind|unpkg|jsdelivr|cloudflare/.test(u));
		assert(filtered.length === 0, 'T105 PC取り込み(33) 取り込みの間に外へ送らない', filtered);
		const read = (n) => fs.readFileSync(path.join(REPO_ROOT, n), 'utf8');
		const src = read('js/pc-capture.js');
		assert(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|RTCPeerConnection/.test(src), 'T105 PC取り込み(33) 部品に通信の処理が無い');
		const sp2 = read('special.html');
		// T156（決定 637）: DMM版の横画面の録画（wrapSource の出どころ。landscape の印つき）も取り込みと同じに扱う。ふつうの動画ファイル（縦画面）は今のまま
		assert(/const debug = \{\}, pcVideo = capture \|\| !!src\.landscape;/.test(sp2) && /if \(pcVideo && window\.UmaPcCapture\) await UmaVideoFrames\.untilAbort\(UmaPcCapture\.removePointer/.test(sp2) && /if \(pcVideo\) \{ selOpts\.debug = debug; selOpts\.effectVote = false; \}/.test(sp2), 'T105 PC取り込み(33) カーソルを消す処理と effectVote の切り替えは取り込みと横画面の録画のときだけ');
		assert(jsErrors(errors).filter((x) => !/人が3人に分かれない/.test(x)).length === 0, 'T105 PC取り込み(33) エラー 0', errors);
		await sp.ctx.close();
	});

	await block('T105 PC取り込み(34) 色の範囲: colr がフルレンジなら復号器に渡す・ふつうの範囲は何も足さない（258）', async () => {
		const sp = await open(); const { page, errors } = sp;
		const r = await page.evaluate(async () => {
			// 作り物のフレームを圧縮して MP4 を作る
			const sink = UmaPcCapture.encodeSink({});
			await sink.begin(320, 240);
			const c = new OffscreenCanvas(320, 240), x = c.getContext('2d');
			for (let i = 0; i < 12; i++) { x.fillStyle = 'rgb(240,240,240)'; x.fillRect(0, 0, 320, 240); x.fillStyle = '#222'; x.fillRect(i * 4, 20, 40, 40); const f = new VideoFrame(c, { timestamp: i * 33333 }); sink.frame(f, i * 33333); f.close(); }
			const src0 = await sink.end(12 * 33333); src0.close();
			const blob = sink.blob();
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let at = -1; for (let i = 0; i + 4 < bytes.length; i++) if (bytes[i] === 0x63 && bytes[i + 1] === 0x6f && bytes[i + 2] === 0x6c && bytes[i + 3] === 0x72) at = i;
			const seen = [];
			const cfg0 = VideoDecoder.prototype.configure;
			VideoDecoder.prototype.configure = function (cfg) { seen.push(cfg.colorSpace || null); return cfg0.call(this, cfg); };
			const open = async (b) => { const s = await UmaVideoFrames.openSource(b); const k = s.kind; s.close(); return k; };
			const set = (full) => { const u = bytes.slice(); u[at + 4 + 4 + 6] = full ? 0x80 : 0; return new Blob([u], { type: 'video/mp4' }); };
			const k1 = await open(set(true));
			const k2 = await open(set(false));
			VideoDecoder.prototype.configure = cfg0;
			return { at, k1, k2, seen, nclx: String.fromCharCode(...bytes.slice(at + 4, at + 8)) };
		});
		assert(r.at > 0 && r.nclx === 'nclx', 'T105 PC取り込み(34) 取り込みの MP4 に colr（nclx）がある', r);
		assert(r.k1 === 'webcodecs' && r.k2 === 'webcodecs', 'T105 PC取り込み(34) どちらも WebCodecs で開ける', r);
		assert(r.seen.length === 2 && r.seen[0] && r.seen[0].fullRange === true, 'T105 PC取り込み(34) フルレンジは復号器に渡す', r.seen);
		assert(r.seen[1] === null, 'T105 PC取り込み(34) ふつうの範囲は何も足さない（iPhone の動画は今までどおり）', r.seen);
		assert(jsErrors(errors).length === 0, 'T105 PC取り込み(34) エラー 0', errors);
		await sp.ctx.close();
	});
}
