// T139（2026-11-08・決定 402・428・519〜522）: UmaExam（exam.html）の②に動画の取り込みを入れた（UmaStar の③の動画の入口と流れを写した）検査。
// run-smoke.mjs の末尾から register146() で呼ばれる（塊の見出しはすべて「T139」で始まる。`npm run test:visual -- --only=T139` で回せる）。
//
//  (1) 入口: タブの行の右端の「静止画｜動画α」・動画モードの見た目（「動画を選ぶ」・「追加」と「OCR処理を開始する」〔OCR だけ〕を隠す・一体のボタンの名前）・
//      モードの保存（uma-exam-upload-mode）と再読み込み・静止画に戻すと今のまま・横スクロールなし／390・1280px × ライト・ダーク
//  (2) 取り込み: 作り物の動画（blocks-80 の SYNTH）で3人の枠に入り、②に OCR の前の結合画像（列見出しと3人だけ。3人とも composePerson）・
//      タブと②の枚数に動画の画は数えない・OCR の前の②に「画像を更新」が出る（決定 556 で出さないでいたのを T160・決定 656 で出す）・セットをクリアで外れる
//  (3) OCR: 動画モードの「OCR処理を開始する」で、OCR の前に整える画（persons[].video）が渡り、結合は composePerson・結果画像が引き出しと②の両方に出る。
//      静止画で入れた画像の流れは今のまま（②に結合画像を出さない・stitchOnePerson）
// OCR そのもの（Tesseract）は回さない（processPersonImages を差し替える）。本物の動画の OCR は tests/video/run-video-frames-local.mjs --exam が見る。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH } from './blocks-80.mjs';
import { pickVideo } from './lib/video-entry.mjs';

const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
const NOTE_VIDEO = '画像や集計の設定が変わったため、「OCR処理を開始する」からやり直してください。';
const NOTE_SHOT = '画像や集計の設定が変わったため、「OCR処理＋画像結合を開始する」からやり直してください。';

export async function register146(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));

	const open = async ({ w = 390, theme = 'light', mode = null } = {}) => {
		const sp = await openPage(browser, base, 'exam.html', { width: w, height: w >= 768 ? 900 : 844 }, EMPTY);
		await sp.page.evaluate(({ theme, mode }) => {
			localStorage.setItem('uma-tools-theme', theme);
			localStorage.setItem('uma-exam-last-step', '2');
			if (mode) localStorage.setItem('uma-exam-upload-mode', mode); else localStorage.removeItem('uma-exam-upload-mode');
		}, { theme, mode });
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok').catch(() => {});
		await sp.page.evaluate(() => { selectStepTab(2); window.scrollTo(0, 0); });
		return sp;
	};
	const ui = (page) => page.evaluate(() => {
		const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
		const row = document.getElementById('upload-mode').parentElement;
		const tabs = document.getElementById('personset-tabs');
		const btns = Array.from(document.querySelectorAll('[data-upload-mode-btn]'));
		return {
			mode: document.body.getAttribute('data-upload-mode'),
			labels: btns.map((b) => b.textContent.trim()),
			pressed: btns.map((b) => b.getAttribute('aria-pressed')),
			stored: localStorage.getItem('uma-exam-upload-mode'),
			pick: vis(document.querySelector('#personset-A-wrap .video-pick-btn')),
			add: vis(document.querySelector('#personset-A-wrap .upload-add')),
			ocrOnly: vis(document.getElementById('process-btn')),
			combo: document.querySelector('#process-stitch-btn span').textContent.trim(),
			note: document.getElementById('stitch-refresh-note').textContent.trim(),
			rowH: Math.round(row.getBoundingClientRect().height), tabsH: Math.round(tabs.getBoundingClientRect().height),
			modeTop: Math.round(document.getElementById('upload-mode').getBoundingClientRect().top), tabsTop: Math.round(tabs.getBoundingClientRect().top),
			sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
		};
	});

	/* ── (1) 入口と動画モード ── */
	await block('T139(1) UmaExam の②の入口「静止画｜動画α」: 動画モードで「動画を選ぶ」・「追加」と OCR だけのボタンを隠す・一体のボタンは「OCR処理を開始する」・保存して再読み込みでも動画・静止画に戻すと今のまま／390・1280px × ライト・ダーク', async () => {
		for (const w of [390, 1280]) for (const theme of ['light', 'dark']) {
			const tag = `T139(1) ${w}px ${theme}: `;
			const sp = await open({ w, theme });
			const { page, errors } = sp;
			const s0 = await ui(page);
			assert(s0.mode === 'shot' && s0.labels.join('|') === '静止画|動画β' && s0.pressed.join('|') === 'true|false' && s0.stored === null, tag + '保存が空なら静止画・2つ並びの切り替え', s0);
			assert(!s0.pick && s0.add && s0.ocrOnly && s0.combo === 'OCR処理＋画像結合を開始する' && s0.note === NOTE_SHOT, tag + '静止画では今のまま（追加・2つのボタン）', s0);
			assert(Math.abs(s0.modeTop - s0.tabsTop) <= 8 && s0.rowH <= s0.tabsH + 2, tag + '切り替えはタブと同じ行（行は折り返さない）', s0);
			assert(s0.sw <= s0.cw, tag + '横スクロールなし', s0);
			await page.click('[data-upload-mode-btn="video"]');
			const s1 = await ui(page);
			assert(s1.mode === 'video' && s1.pressed.join('|') === 'false|true' && s1.stored === 'video', tag + '動画に切り替わり保存される（uma-exam-upload-mode）', s1);
			assert(s1.pick && !s1.add && !s1.ocrOnly && s1.combo === 'OCR処理を開始する' && s1.note === NOTE_VIDEO, tag + '動画モード: 動画を選ぶ・追加と OCR だけのボタンは無し・一体のボタンは「OCR処理を開始する」', s1);
			assert(s1.sw <= s1.cw, tag + '動画モードでも横スクロールなし', s1);
			await reloadReady(page);
			for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok').catch(() => {});
			await page.evaluate(() => selectStepTab(2));
			const s2 = await ui(page);
			assert(s2.mode === 'video' && s2.pick && s2.combo === 'OCR処理を開始する', tag + '再読み込みでも動画モード', s2);
			// 「？」を押すと撮り方が出る
			const howto = await page.evaluate(() => {
				const b = document.querySelector('#personset-A-wrap .video-howto-btn');
				b.click();
				const box = document.querySelector('#personset-A-wrap .video-howto-box');
				return { shown: !box.hidden && box.getClientRects().length > 0, text: box.textContent, exp: b.getAttribute('aria-expanded') };
			});
			assert(howto.shown && howto.exp === 'true' && howto.text.indexOf('撮り方') === 0 && howto.text.indexOf('親から祖2の一番下までゆっくりスクロール') > 0, tag + '「？」で撮り方を出す', howto);
			await page.click('[data-upload-mode-btn="shot"]');
			const s3 = await ui(page);
			assert(s3.mode === 'shot' && s3.stored === 'shot' && !s3.pick && s3.add && s3.ocrOnly && s3.combo === 'OCR処理＋画像結合を開始する' && s3.note === NOTE_SHOT, tag + '静止画に戻すと今のまま', s3);
			assert(jsErrors(errors).length === 0, tag + 'コンソールのエラー0', jsErrors(errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	// 作り物の動画で取り込む（呼び出しの数を数える）
	const openVideo = async (w = 390) => {
		const sp = await open({ w, mode: 'video' });
		await sp.page.addScriptTag({ content: SYNTH });
		await sp.page.evaluate(() => {
			window.__n = { compose: 0, stitchOne: 0, select: 0 };
			const vf = window.UmaVideoFrames = Object.assign({}, UmaVideoFrames);
			const c = vf.composePerson, s = vf.selectFrames, one = stitchOnePerson;
			vf.composePerson = function () { window.__n.compose++; return c.apply(this, arguments); };
			vf.selectFrames = function () { window.__n.select++; return s.apply(this, arguments); };
			stitchOnePerson = function () { window.__n.stitchOne++; return one.apply(this, arguments); };
		});
		return sp;
	};
	const runVideo = async (page) => {
		await pickVideo(page);
		return page.evaluate(() => Promise.race([onVideoChosen(__synth.make({}).source), new Promise((r) => setTimeout(() => r('timeout'), 90000))]));
	};
	const panel = (page) => page.evaluate(() => {
		const box = document.querySelector('#personset-A-wrap .video-result');
		const img = box && box.querySelector('img');
		const btn = box && box.querySelector('[data-video-refresh]');
		const cols = document.querySelector('#personset-A-wrap .upload-cols');
		return {
			// src は長い data URL なので、長さと末尾だけ（ログが大きくならないように）
			box: !!box, img: img ? img.src.slice(0, 22) : null, src: img ? img.src.length + ':' + img.src.slice(-32) : null, h: img ? img.naturalHeight : 0,
			dl: !!(box && box.querySelector('.video-dl-btn')), head: box ? (box.querySelector('.video-result-head p') || null) === null : null,
			note: !!(box && box.querySelector('.video-refresh-note')),
			btn: !!btn, disabled: btn ? btn.disabled : null, state: btn ? btn.getAttribute('data-state') : null, label: btn ? btn.textContent.trim() : null,
			showcols: !!(box && box.querySelector('.video-showcols')), colsHidden: cols ? cols.hidden : null,
			video: persons.slice(0, 3).map((p) => !!p.video), files: persons.slice(0, 3).map((p) => p.files.length),
			tiles: document.querySelectorAll('#personset-A-wrap .video-tile').length,
			tab: document.querySelector('#personset-tabs .uma-subtab[data-tab-id="0"]').textContent.trim(),
			badge: (() => { const b = document.getElementById('image-count-badge'); return b ? (b.hidden ? null : b.textContent) : 'none'; })(),
			drawerImgs: document.querySelectorAll('#stitch-result-content img').length, n: Object.assign({}, window.__n || {})
		};
	});

	/* ── (2) 取り込み ── */
	await block('T139(2) UmaExam の動画の取り込み: 3人の枠に入り、②に OCR の前の結合画像（3人とも composePerson）・枚数に数えない・「画像を更新」が出る（押せない）・セットをクリアで外れる', async () => {
		for (const w of [390, 1280]) {
			const tag = `T139(2) ${w}px: `;
			const sp = await openVideo(w);
			const { page, errors } = sp;
			const res = await runVideo(page);
			assert(res && res.ok === true && res.stitched === true, tag + '取り込みと自動の結合が成功', res);
			const s = await panel(page);
			assert(s.box && s.img === 'data:image/png;base64,' && s.dl && s.head, tag + '②の枠の中に結合画像（見出しなし・ダウンロードはアイコン）', s);
			assert(s.video.every(Boolean) && s.files.every((n) => n > 0) && s.tiles === 3, tag + '3人の枠に動画の画（「動画の画像」の1行）', s);
			assert(s.n.select === 1 && s.n.compose === 3 && s.n.stitchOne === 0, tag + '取り込みは1回・3人とも composePerson', s.n);
			assert(s.tab === '親Aセット' && s.badge === null, tag + 'タブと②の枚数に動画の画は数えない', { tab: s.tab, badge: s.badge });
			// 決定 556（T139-2）で出さないでいた「画像を更新」を、T160（決定 656）で出す。作ったときと同じ設定なので押せない。案内は隠れたまま。押したときの動きは blocks-163
			assert(s.btn && s.disabled === true && s.state === 'same' && s.label === '画像を更新' && s.note, tag + 'OCR の前の②に「画像を更新」が出る（同じ設定なので押せない。T160・決定 656）', { btn: s.btn, disabled: s.disabled, state: s.state, label: s.label, note: s.note });
			assert(s.showcols && s.colsHidden === true, tag + '3列は隠し「親ごとの画像を見る」で出せる', s);
			assert(s.drawerImgs === 0, tag + '引き出しの中身は変えない', s);
			const geo = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
			assert(geo.sw <= geo.cw, tag + '横スクロールなし', geo);
			// 作り物の画の結合の高さ（列見出しの帯の分だけ高い）
			const hs = await page.evaluate(() => devGeometry.filter((l) => /composePerson/.test(l)).map((l) => +/高さ (\d+)px/.exec(l)[1]));
			assert(hs.length === 3 && s.h > Math.max(...hs), tag + '画像の高さ＝列見出しの帯＋いちばん高い人', { hs, h: s.h });
			await page.evaluate(() => clearPersonSet(0));
			const c = await panel(page);
			assert(!c.box && c.video.every((v) => !v) && c.files.every((n) => n === 0) && c.colsHidden === false, tag + 'セットをクリアで②の画像と動画の印が外れる', c);
			assert(jsErrors(errors).length === 0, tag + 'コンソールのエラー0', jsErrors(errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ── (3) OCR ── */
	await block('T139(3) UmaExam の動画モードの「OCR処理を開始する」: OCR の前に整える画が渡り、結合は composePerson・引き出しと②の両方に出る／静止画の流れは今のまま', async () => {
		const sp = await openVideo(390);
		const { page, errors } = sp;
		await runVideo(page);
		const before = await panel(page);
		await page.evaluate(() => {
			window.__ocrVideo = [];
			processPersonImages = async (worker, files, label, usePre, multi, wantPreview, video) => {
				window.__ocrVideo.push(label + ':' + (video ? video.files.length + '/' + files.length : 'none'));
				return { lines: [], skipped: [], warned: [], geometry: files.map(() => null) };
			};
			readMelopTopRow = async () => ({ found: false, extraLines: [] });
		});
		await page.click('#process-stitch-btn');
		await page.waitForFunction(() => !stitchInProgress && !busyBtnId && document.querySelectorAll('#stitch-result-content img').length > 0, null, { timeout: 60000 });
		const after = await panel(page);
		const ocr = await page.evaluate(() => window.__ocrVideo);
		assert(ocr.length === 3 && ocr.every((x, i) => /^(親A|祖A1|祖A2):(\d+)\/(\d+)$/.test(x) && x.split(':')[1].split('/')[0] === x.split(':')[1].split('/')[1]), '動画の画の控え（persons[].video）が OCR に渡る', ocr);
		assert(after.n.compose === before.n.compose + 3 && after.n.stitchOne === 0 && after.n.select === 1, 'OCR のあとの結合も composePerson（取り込み直さない）', after.n);
		assert(after.drawerImgs === 1 && after.box && after.src !== before.src && !after.btn, '結果画像が引き出しと②の両方に出る（②の「画像を更新」は OCR のあとは出さない）', after);
		assert(jsErrors(errors).length === 0, 'T139(3) 動画 コンソールのエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();

		// 静止画の流れは今のまま: ②に結合画像を出さない・stitchOnePerson を通る
		const sh = await open({ w: 390 });
		await sh.page.addScriptTag({ content: SYNTH });
		const shot = await sh.page.evaluate(async () => {
			const n = { stitchOne: 0, compose: 0 };
			const one = stitchOnePerson;
			stitchOnePerson = function () { n.stitchOne++; return one.apply(this, arguments); };
			const vf = window.UmaVideoFrames = Object.assign({}, UmaVideoFrames);
			const c = vf.composePerson;
			vf.composePerson = function () { n.compose++; return c.apply(this, arguments); };
			// 作り物の動画のフレームを、静止画として親A の枠に入れる（動画の印は付けない）
			const src = __synth.make({}).source;
			const sel = await UmaVideoFrames.selectFrames(src, { labels: ['親A', '祖A1', '祖A2'] });
			addPersonFiles(0, sel.persons[0].files.slice());
			processPersonImages = async (worker, files) => ({ lines: [], skipped: [], warned: [], geometry: files.map(() => null) });
			readMelopTopRow = async () => ({ found: false, extraLines: [] });
			document.getElementById('process-stitch-btn').click();
			await new Promise((r) => { const t = setInterval(() => { if (!stitchInProgress && !busyBtnId && document.querySelector('#stitch-result-content img')) { clearInterval(t); r(); } }, 100); });
			return { n, box: !!document.querySelector('#personset-A-wrap .video-result'), video: !!persons[0].video, mode: document.body.getAttribute('data-upload-mode') };
		});
		assert(shot.mode === 'shot' && !shot.video && !shot.box && shot.n.stitchOne === 1 && shot.n.compose === 0, 'T139(3) 静止画: ②に結合画像を出さず、stitchOnePerson で結合（今のまま）', shot);
		assert(jsErrors(sh.errors).length === 0, 'T139(3) 静止画 コンソールのエラー0', jsErrors(sh.errors).slice(0, 3));
		await sh.ctx.close();
	});
}
