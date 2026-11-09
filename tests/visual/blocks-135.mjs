// T123（2026-11-08・C-324 のモック T120 への回答 401・404〜408／Chat 435〜438・447・449〜452）の検査。
// run-smoke.mjs の末尾から register135() で呼ばれる（塊の見出しはすべて「T123」で始まる。`npm run test:visual -- --only=T123` で回せる）。
//
//  (1) OCR 中のボタン（UmaStar・UmaExam）: 押したボタンが同じ高さのまま、主なボタンの塗りで「文・％・4px の帯」に切り替わる。
//      押せないが disabled にしない（薄くならない）。もう1つは disabled（UmaExam は一方の実行中にもう一方を押せない・408）。
//      今のゲージ（#progress-wrap・#stitch-progress-wrap）は無い（404）。％の分母は画像のある人数（406。3人なら 0・33・67）。
//      UmaStar の「画像を結合する（OCRしない）」も同じように切り替わる（407）。終わると元のボタン（class・高さ・読み上げ）に戻る。
//      本物の OCR は回さない（Tesseract の createWorker と1人分の読み取り・結合の組み立てを差し替え、進み具合の呼ばれ方とボタンの状態を記録する）。
//  (2) 「アップロード」の言い換え（435〜438）: タブ・見出し・トースト・エラーの文（index.html を含む）。
//  (3) ②因子周回のカードの枠に SR のバッジを出さない（447）。①の枠には今までどおり出す（C-187）。
//  (4) 新しいモード（roster.noPlan）の②の下の欄の見出しと＋の読み上げ（450・451）。デフォルトは今のまま。縦の行を増やさない（1行に収まる）。
// 期待値は製品の値を読まずに書く（文は決定の原文・塗りの色はトークンを当てた見本の要素と比べる）。スキル名は書かない（恒久ルール1）。

import { reloadReady } from './lib/page-ready.mjs';
import { settle } from './lib/settle.mjs';   // T148: 固定の待ちを条件待ちに（検査の速度 (d)③）

export async function register135(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const ONE12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const WIDTHS = [360, 375, 390, 1280];
	const THEMES = ['light', 'dark'];

	// SR のカード2枚（①・②に置く）。ほかのカードと同じキャラクターでないもの（選べない組み合わせを避ける）
	const cardsData = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8'));
	const cardList = Array.isArray(cardsData) ? cardsData : (cardsData.cards || cardsData.entries || Object.values(cardsData));
	const charaOf = new Map(cardList.map((c) => [c.id, c.charaName]));
	const usedCharas = new Set(CARDS6.concat(SAVED5).map((id) => charaOf.get(id)));
	const srCards = cardList.filter((c) => c.rarity === 'SR' && !c.isGroup && !usedCharas.has(c.charaName));
	const SR_A = srCards[0] && srCards[0].id;
	const SR_B = srCards.find((c) => c.charaName !== (srCards[0] && srCards[0].charaName));
	const SR_B_ID = SR_B && SR_B.id;

	/** ページに入れる記録係: 進み具合の呼ばれ方（setBusyProgress）とボタンの状態 */
	const INSTALL_RECORDER = () => {
		window.__log = [];
		window.__snaps = [];
		const probe = document.createElement('span');
		probe.style.cssText = 'position:absolute;left:-9999px;background:var(--uma-control);color:var(--uma-control-text)';
		document.body.appendChild(probe);
		window.__ctrl = { bg: getComputedStyle(probe).backgroundColor, fg: getComputedStyle(probe).color };
		probe.remove();
		window.__snap = (id, tag) => {
			const b = document.getElementById(id);
			const cs = getComputedStyle(b);
			const t = b.querySelector('[data-busy-text]');
			const row = b.querySelector('.ocr-busy-row');
			const track = b.querySelector('.ocr-busy-track');
			const bar = document.getElementById('upload-bar');
			const s = {
				tag: tag, id: id, busy: b.classList.contains('ocr-busy'), disabled: b.disabled, aria: b.getAttribute('aria-disabled'), ariaBusy: b.getAttribute('aria-busy'),
				opacity: cs.opacity, h: Math.round(b.getBoundingClientRect().height), bg: cs.backgroundColor, color: cs.color,
				text: t ? t.textContent : null, pct: b.querySelector('[data-busy-pct]') ? b.querySelector('[data-busy-pct]').textContent : null,
				fill: b.querySelector('[data-busy-fill]') ? b.querySelector('[data-busy-fill]').style.width : null,
				valuenow: track ? track.getAttribute('aria-valuenow') : null, trackH: track ? Math.round(track.getBoundingClientRect().height) : null,
				textCut: !!t && t.scrollWidth > t.clientWidth + 1, rowOver: !!row && row.scrollWidth > row.clientWidth + 1,
				inside: !row || (row.getBoundingClientRect().right <= b.getBoundingClientRect().right + 0.5 && row.getBoundingClientRect().left >= b.getBoundingClientRect().left - 0.5),
				others: Array.from(document.querySelectorAll('#upload-bar .upload-bar-in > .uma-btn')).filter((x) => x !== b).map((x) => ({ id: x.id, disabled: x.disabled, busy: x.classList.contains('ocr-busy') })),
				barH: bar ? Math.round(bar.getBoundingClientRect().height) : null,
				gauge: !!document.getElementById('progress-wrap') || !!document.getElementById('stitch-progress-wrap'),
				hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
			};
			window.__snaps.push(s);
			return s;
		};
		const orig = setBusyProgress;
		setBusyProgress = (r, l) => { orig(r, l); window.__log.push({ pct: Math.round(r * 100), label: l }); };
		// 本物の OCR はしない
		window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {}, terminate: async () => {} }) };
	};
	const fakeFiles = (n) => Array.from({ length: n }, (_, i) => ({ name: 'p' + i + '.png' }));

	/* ---------------- (1) UmaStar ---------------- */
	const openStar = async (w, theme) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w >= 768 ? 900 : 844 }, EMPTY);
		await sp.page.evaluate(({ roster, ids, theme }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: { umaId: 'uma-0001', cardIds: CARDS6 }, ids: ONE12, theme });
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.waitForTimeout(200);
		await sp.page.evaluate(INSTALL_RECORDER);
		await sp.page.evaluate((files) => {
			for (let i = 0; i < 3; i++) persons[i].files = files.slice();
			updateProcessBtn();
		}, fakeFiles(2));
		return sp;
	};
	/** UmaStar の差し替え: 1人分の読み取りと、結合の組み立て（3人を1人ずつ） */
	const STUB_STAR = () => {
		processPersonImages = async (worker, files, label) => {
			window.__snap(window.__busyId, 'ocr ' + label);
			if (window.__holdAt === label) await new Promise((r) => { window.__release = r; });
			return { lines: [], skipped: [], warned: [], geometry: null };
		};
		readGreenFactor = async () => null;
		readTopBlueRed = async () => null;
		buildStitchedSetImage = async (setIdx, onPersonStart) => {
			window.__snap(window.__busyId, 'stitch-prep');
			for (const l of ['親A', '祖A1', '祖A2']) {
				if (onPersonStart) onPersonStart(l);
				window.__snap(window.__busyId, 'stitch ' + l);
			}
			const c = document.createElement('canvas');
			c.width = 60; c.height = 60; c._personMeta = []; c._stitchWarnings = [];
			return c;
		};
	};

	await block('T123(1) UmaStar の「OCR処理＋画像結合を開始する」: 押したボタンが同じ高さのまま主なボタンの塗りで文・％・4px の帯に切り替わる（薄くならない・disabled でない）・もう1つは押せない・今のゲージは無い・％の分母は画像のある人数（3人で 0→33→67）・終わると元に戻る／360・375・390・1280px × ライト・ダーク', async () => {
		for (const w of WIDTHS) for (const theme of THEMES) {
			const tag = 'T123(1) UmaStar ' + w + 'px ' + theme + ': ';
			const sp = await openStar(w, theme);
			const before = await sp.page.evaluate(() => {
				const b = document.getElementById('process-stitch-btn');
				return { cls: b.className, h: Math.round(b.getBoundingClientRect().height), dis: b.disabled, html: b.innerHTML, barH: Math.round(document.getElementById('upload-bar').getBoundingClientRect().height) };
			});
			assert(before.dis === false, tag + '前提: 画像とセットがあり一体のボタンを押せる', before);
			const r = await sp.page.evaluate(async (STUB) => {
				window.__busyId = 'process-stitch-btn';
				(new Function(STUB))();
				const origCreate = window.Tesseract.createWorker;
				window.Tesseract.createWorker = async () => { window.__snap('process-stitch-btn', 'init'); return origCreate(); };
				await processImagesAndStitch();
				return { log: window.__log, snaps: window.__snaps, ctrl: window.__ctrl, after: window.__snap('process-stitch-btn', 'after') };
			}, '(' + STUB_STAR.toString() + ')()');
			const during = r.snaps.filter((s) => s.tag !== 'after');
			const want = [[0, 'OCRエンジンを初期化中…'], [0, '親Aを処理中…'], [33, '祖A1を処理中…'], [67, '祖A2を処理中…'], [0, '画像結合を準備中…'], [0, '親Aセット 親Aを結合中…'], [33, '親Aセット 祖A1を結合中…'], [67, '親Aセット 祖A2を結合中…'], [100, '完了']];
			assert(JSON.stringify(r.log.map((x) => [x.pct, x.label])) === JSON.stringify(want), tag + '文と％の流れ（OCR は画像のある3人で 0→33→67・結合で 0 へ戻る〔決定 406〕・文は今のゲージの文のまま）', r.log);
			assert(during.length >= 7 && during.every((s) => s.busy && s.disabled === false && s.aria === 'true' && s.ariaBusy === 'true' && s.opacity === '1'), tag + '処理中は押したボタンが処理中の表示（disabled でない・aria-disabled・薄くならない）', during.map((s) => [s.tag, s.busy, s.disabled, s.aria, s.opacity]));
			assert(during.every((s) => s.bg === r.ctrl.bg && s.color === r.ctrl.fg), tag + '処理中のボタンは主なボタンの塗り（--uma-control・文字 --uma-control-text）', { bg: during[0].bg, want: r.ctrl });
			assert(during.every((s) => s.h === before.h && s.barH === before.barH), tag + '高さは押す前のまま（ボタン ' + before.h + 'px・固定の欄 ' + before.barH + 'px）', during.map((s) => [s.h, s.barH]));
			assert(during.every((s) => s.trackH === 4), tag + '帯は 4px', during.map((s) => s.trackH));
			assert(during.every((s) => s.text === null || (s.pct === s.fill && s.pct === s.valuenow + '%')), tag + '％・帯の長さ・読み上げの値がそろう', during.map((s) => [s.pct, s.fill, s.valuenow]));
			assert(during.every((s) => !s.textCut && !s.rowOver && s.inside), tag + '文は切れず、ボタンからはみ出さない', during.filter((s) => s.textCut || s.rowOver || !s.inside).map((s) => s.text));
			assert(during.every((s) => s.others.every((o) => o.disabled === true && !o.busy)), tag + '処理中はもう1つ（画像を結合する）は押せない', during.map((s) => s.others));
			assert(during.every((s) => s.gauge === false), tag + '今のゲージ（#progress-wrap・#stitch-progress-wrap）は無い（決定 404）', '');
			assert(during.every((s) => !s.hscroll), tag + '横スクロールなし', '');
			const back = await sp.page.evaluate(() => { const b = document.getElementById('process-stitch-btn'); return { cls: b.className, html: b.innerHTML, styleH: b.style.height, aria: b.getAttribute('aria-disabled'), busy: b.getAttribute('aria-busy'), dis: b.disabled, other: document.getElementById('stitch-btn').disabled }; });
			assert(back.cls === before.cls && back.html === before.html && back.styleH === '' && back.aria === null && back.busy === null && back.dis === false && back.other === false,
				tag + '終わると元のボタンに戻る（class・中身・高さの指定・読み上げ・押せる状態）', back);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T123(1) UmaStar の「画像を結合する（OCRしない）」も同じように切り替わる（決定 407）: 高さは押す前のまま・もう1つ（一体のボタン）は押せない・終わると元に戻る／動画のときの一体のボタンの名前（applyUploadMode）も処理中の表示のあと元に戻る', async () => {
		for (const w of [375, 1280]) for (const theme of THEMES) {
			const tag = 'T123(1) 結合だけ ' + w + 'px ' + theme + ': ';
			const sp = await openStar(w, theme);
			const before = await sp.page.evaluate(() => { const b = document.getElementById('stitch-btn'); return { cls: b.className, h: Math.round(b.getBoundingClientRect().height), html: b.innerHTML }; });
			const r = await sp.page.evaluate(async (STUB) => {
				window.__busyId = 'stitch-btn';
				(new Function(STUB))();
				await runImageStitching();
				return { log: window.__log, snaps: window.__snaps, ctrl: window.__ctrl };
			}, '(' + STUB_STAR.toString() + ')()');
			const during = r.snaps;
			assert(JSON.stringify(r.log.map((x) => x.pct)) === JSON.stringify([0, 0, 33, 67, 100]) && r.log[1].label === '親Aセット 親Aを結合中…', tag + '結合の文と％がこのボタンの中に出る', r.log);
			assert(during.length === 4 && during.every((s) => s.busy && s.disabled === false && s.aria === 'true' && s.opacity === '1' && s.bg === r.ctrl.bg && s.h === before.h && s.trackH === 4),
				tag + '処理中は主なボタンの塗り・薄くならない・高さ ' + before.h + 'px のまま・帯 4px', during.map((s) => [s.busy, s.disabled, s.opacity, s.bg, s.h, s.trackH]));
			assert(during.every((s) => s.others.every((o) => o.disabled === true)), tag + '処理中は一体のボタンを押せない', during.map((s) => s.others));
			assert(during.every((s) => !s.textCut && !s.rowOver && s.inside && !s.hscroll), tag + '文は切れず、はみ出さない・横スクロールなし', during.map((s) => s.text));
			const back = await sp.page.evaluate(() => { const b = document.getElementById('stitch-btn'); return { cls: b.className, html: b.innerHTML, styleH: b.style.height, aria: b.getAttribute('aria-disabled'), dis: b.disabled }; });
			assert(back.cls === before.cls && back.html === before.html && back.styleH === '' && back.aria === null && back.dis === false, tag + '終わると元のボタンに戻る', back);
			if (w === 375 && theme === 'light') {
				// 動画のとき: 一体のボタンの名前は applyUploadMode が書き換える（最初の span）。処理中の表示を足しても、戻ったあとの名前はその時のモードの名前
				const v = await sp.page.evaluate(async (STUB) => {
					(new Function(STUB))();
					window.__busyId = 'process-stitch-btn';
					startBtnBusy('process-stitch-btn');
					uploadMode = 'video'; applyUploadMode();
					const mid = document.querySelector('#process-stitch-btn span').textContent;
					endBtnBusy(); updateProcessBtn();
					const label = document.getElementById('process-stitch-btn').textContent.trim();
					uploadMode = 'shot'; applyUploadMode();
					return { mid, label, shot: document.getElementById('process-stitch-btn').textContent.trim() };
				}, '(' + STUB_STAR.toString() + ')()');
				assert(v.mid === 'OCR処理を開始する' && v.label === 'OCR処理を開始する' && v.shot === 'OCR処理＋画像結合を開始する', tag + '動画のときの名前の書き換えは元の文の span に当たり、戻ったあとも正しい', v);
			}
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ---------------- (1) UmaExam ---------------- */
	const openExam = async (w, theme) => {
		const sp = await openPage(browser, base, 'exam.html', { width: w, height: w >= 768 ? 900 : 844 }, EMPTY);
		await sp.page.evaluate((theme) => { localStorage.setItem('uma-tools-theme', theme); }, theme);
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.waitForTimeout(200);
		await sp.page.evaluate(INSTALL_RECORDER);
		await sp.page.evaluate((files) => {
			for (let i = 0; i < 3; i++) persons[i].files = files.slice();
			updateProcessBtn();
		}, fakeFiles(2));
		return sp;
	};
	const STUB_EXAM = () => {
		processPersonImages = async (worker, files, label) => {
			window.__snap(window.__busyId, 'ocr ' + label);
			if (window.__holdAt === label) await new Promise((r) => { window.__release = r; });
			return { lines: [], skipped: [], warned: [], geometry: null };
		};
		readGreenFactor = async () => null;
		readMelopTopRow = async () => ({ found: false, extraLines: [] });
		buildStitchedSetImage = async (setIdx, run, onPersonStart) => {
			window.__snap(window.__busyId, 'stitch-prep');
			for (const l of ['親A', '祖A1', '祖A2']) {
				if (onPersonStart) onPersonStart(l);
				window.__snap(window.__busyId, 'stitch ' + l);
			}
			const c = document.createElement('canvas');
			c.width = 60; c.height = 60; c._personMeta = []; c._stitchWarnings = [];
			return c;
		};
	};

	await block('T123(1) UmaExam の2つのボタン: 押したほうが同じ高さのまま主なボタンの塗りで文・％・4px の帯に切り替わる（薄くならない）・もう一方は押せない（決定 408）・今のゲージは無い・％の分母は画像のある人数・終わると元に戻る／360・375・390・1280px × ライト・ダーク', async () => {
		for (const w of WIDTHS) for (const theme of THEMES) for (const press of ['process-btn', 'process-stitch-btn']) {
			const tag = 'T123(1) UmaExam ' + w + 'px ' + theme + ' ' + press + ': ';
			const sp = await openExam(w, theme);
			const before = await sp.page.evaluate((id) => {
				const b = document.getElementById(id);
				return { cls: b.className, h: Math.round(b.getBoundingClientRect().height), dis: b.disabled, html: b.innerHTML, barH: Math.round(document.getElementById('upload-bar').getBoundingClientRect().height),
					other: Array.from(document.querySelectorAll('#upload-bar .upload-bar-in > .uma-btn')).filter((x) => x !== b).map((x) => ({ id: x.id, cls: x.className, dis: x.disabled })) };
			}, press);
			assert(before.dis === false && before.other.every((o) => o.dis === false), tag + '前提: 画像があり2つとも押せる', before);
			const r = await sp.page.evaluate(async ({ STUB, press }) => {
				window.__busyId = press;
				(new Function(STUB))();
				const origCreate = window.Tesseract.createWorker;
				window.Tesseract.createWorker = async () => { window.__snap(press, 'init'); return origCreate(); };
				if (press === 'process-btn') await processImages(); else await processImagesAndStitch();
				return { log: window.__log, snaps: window.__snaps, ctrl: window.__ctrl };
			}, { STUB: '(' + STUB_EXAM.toString() + ')()', press });
			const during = r.snaps;
			const wantOcr = [[0, 'OCRエンジンを初期化中…'], [0, '親Aを処理中…'], [33, '祖A1を処理中…'], [67, '祖A2を処理中…']];
			const want = press === 'process-btn' ? wantOcr : wantOcr.concat([[0, '画像結合を準備中…'], [0, '親Aセット 親Aを結合中…'], [33, '親Aセット 祖A1を結合中…'], [67, '親Aセット 祖A2を結合中…'], [100, '完了']]);
			assert(JSON.stringify(r.log.map((x) => [x.pct, x.label])) === JSON.stringify(want), tag + '文と％の流れ（OCR は画像のある3人で 0→33→67〔決定 406〕）', r.log);
			assert(during.length >= 4 && during.every((s) => s.busy && s.disabled === false && s.aria === 'true' && s.opacity === '1' && s.bg === r.ctrl.bg && s.color === r.ctrl.fg),
				tag + '処理中は押したボタンが主なボタンの塗り・disabled でない・薄くならない', during.map((s) => [s.tag, s.busy, s.disabled, s.opacity, s.bg]));
			assert(during.every((s) => s.h === before.h && s.barH === before.barH && s.trackH === 4), tag + '高さは押す前のまま（' + before.h + 'px・欄 ' + before.barH + 'px）・帯 4px', during.map((s) => [s.h, s.barH, s.trackH]));
			assert(during.every((s) => s.others.length === 1 && s.others[0].disabled === true && !s.others[0].busy), tag + '一方の実行中はもう一方を押せない（決定 408）', during.map((s) => s.others));
			assert(during.every((s) => !s.textCut && !s.rowOver && s.inside && !s.hscroll && s.gauge === false), tag + '文は切れず・はみ出さず・横スクロールなし・今のゲージは無い', during.filter((s) => s.textCut || s.rowOver || !s.inside).map((s) => s.text));
			const back = await sp.page.evaluate((id) => {
				const b = document.getElementById(id);
				return { cls: b.className, html: b.innerHTML, styleH: b.style.height, aria: b.getAttribute('aria-disabled'), dis: b.disabled,
					other: Array.from(document.querySelectorAll('#upload-bar .upload-bar-in > .uma-btn')).filter((x) => x !== b).map((x) => ({ id: x.id, cls: x.className, dis: x.disabled })) };
			}, press);
			assert(back.cls === before.cls && back.html === before.html && back.styleH === '' && back.aria === null && back.dis === false && JSON.stringify(back.other) === JSON.stringify(before.other),
				tag + '終わると2つとも元に戻る（class・中身・押せる状態）', back);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T123(1) UmaExam: 処理中に画像を足し引きしても（updateProcessBtn）、押したボタンは処理中の表示のまま・もう一方は押せないまま（決定 408）', async () => {
		const sp = await openExam(375, 'light');
		const r = await sp.page.evaluate(async (STUB) => {
			window.__busyId = 'process-btn';
			(new Function(STUB))();
			window.__holdAt = '祖A1';
			const run = processImages();
			for (let i = 0; i < 100 && !window.__release; i++) await new Promise((res) => setTimeout(res, 20));
			persons[3].files = [{ name: 'x.png' }];
			updateProcessBtn();
			const mid = { busy: document.getElementById('process-btn').classList.contains('ocr-busy'), dis: document.getElementById('process-btn').disabled, other: document.getElementById('process-stitch-btn').disabled };
			// 実行中にもう一方を呼んでも始まらない
			await processImagesAndStitch();
			const still = document.getElementById('process-btn').classList.contains('ocr-busy') && !document.getElementById('process-stitch-btn').classList.contains('ocr-busy');
			window.__release();
			await run;
			persons[3].files = [];
			updateProcessBtn();
			return { mid, still };
		}, '(' + STUB_EXAM.toString() + ')()');
		assert(r.mid.busy === true && r.mid.dis === false && r.mid.other === true, 'T123(1) UmaExam: 途中の updateProcessBtn でも処理中の表示・もう一方は押せない', r.mid);
		assert(r.still === true, 'T123(1) UmaExam: OCR の実行中に「OCR処理＋画像結合」を呼んでも始まらない', r.still);
		assert(jsErrors(sp.errors).length === 0, 'T123(1) UmaExam 足し引き: コンソールのエラー0', sp.errors.slice(0, 3));
		await sp.ctx.close();
	});

	/* ---------------- (2) 「アップロード」の言い換え ---------------- */
	await block('T123(2) 「アップロード」の言い換え（Chat 435〜438）: UmaStar ③・UmaExam ② のタブ「画像を選ぶ」・UmaExam の見出し「因子セットの画像を選ぶ」・トースト「少なくとも1人分の画像を選んでください」・エラー「選んだ画像は、…」・UmaSimple OCR の「画像を選ぶ & 設定」「画像を選んでください」', async () => {
		const src = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
		for (const f of ['special.html', 'exam.html']) {
			const s = src(f);
			assert(s.includes("showToast('少なくとも1人分の画像を選んでください')") && !s.includes('少なくとも1人分の画像をアップロードしてください'), 'T123(2) ' + f + ': トーストの文', '');
			assert(s.includes("'選んだ画像は、いずれもゲーム画面が小さすぎて読み取れませんでした。パソコン版をお使いの場合は、ゲームのウィンドウを大きくしてから撮り直してください。'") && !s.includes('アップロードされた画像は'), 'T123(2) ' + f + ': エラーの文（後ろは今のまま）', '');
		}
		const idx = src('index.html');
		assert(idx.includes('>画像を選ぶ & 設定</h2>') && idx.includes("showToast('画像を選んでください')") && !/画像をアップロード/.test(idx), 'T123(2) index.html: 見出しとトースト', '');
		const sp = await openStar(390, 'light');
		const st = await sp.page.evaluate(() => document.querySelector('#step-tab-2 .step-tab-label').textContent);
		assert(st === '画像を選ぶ', 'T123(2) UmaStar ③のタブ', st);
		await sp.ctx.close();
		const ex = await openExam(390, 'light');
		const et = await ex.page.evaluate(() => ({ tab: document.querySelector('#step-tab-2 .step-tab-label').textContent, h2: document.querySelector('#old-step2-card h2').textContent }));
		assert(et.tab === '画像を選ぶ' && et.h2 === '因子セットの画像を選ぶ', 'T123(2) UmaExam ②のタブと見出し', et);
		// 押して出る文: 画像が無いときのトースト（UmaExam。本物の showToast の文を読む）
		const toast = await ex.page.evaluate(async () => {
			for (let i = 0; i < 6; i++) persons[i].files = [];
			let msg = null;
			const o = showToast;
			showToast = (m) => { msg = m; o(m); };
			await processImages();
			showToast = o;
			return msg;
		});
		assert(toast === '少なくとも1人分の画像を選んでください', 'T123(2) UmaExam: 画像が無いときのトースト', toast);
		assert(jsErrors(ex.errors).length === 0, 'T123(2) コンソールのエラー0', ex.errors.slice(0, 3));
		await ex.ctx.close();
		// index.html は openPage の「整った」の合図（lib/page-ready.mjs）の対象外なので、素のページで読み込みだけ待つ
		const ixCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const ixPage = await ixCtx.newPage();
		await ixPage.goto(base + '/index.html', { waitUntil: 'load', timeout: 60000 });
		const ih = await ixPage.evaluate(() => Array.from(document.querySelectorAll('h2')).map((h) => h.textContent.trim()));
		assert(ih.includes('画像を選ぶ & 設定'), 'T123(2) UmaSimple OCR の見出し（画面）', ih);
		await ixCtx.close();
	});

	/* ---------------- (3)(4) ②因子周回 ---------------- */
	const openFactor = async (w, theme, roster) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: 900 }, EMPTY);
		await sp.page.evaluate(({ roster, ids, theme }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster, ids: ONE12, theme });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('[data-act="notice-ok"]').catch(() => {});
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		// 新しいモードでは帯に合計を出さない（C-309）ので、②のカードの枠がそろうのを待つ
		await sp.page.waitForSelector(T + '[data-usd-el="factor-card-slots"] [data-usd-el="factor-card-tile"][data-card-id]', { timeout: 20000 });
		await settle(sp.page);
		return sp;
	};
	const setView = async (page, want) => {
		const cur = () => page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-view"]'); return b ? b.getAttribute('data-usd-view') : null; });
		for (let i = 0; i < 3 && (await cur()) !== want; i++) { await page.click(T + '[data-usd-el="factor-view"]'); await settle(page); }
	};

	await block('T123(3) ②因子周回のカードの枠に SR のバッジを出さない（決定 447）・①の本育成編成の枠には今までどおり出す（C-187）／375・1280px × ライト・ダーク', async () => {
		assert(!!SR_A && !!SR_B_ID, 'T123(3) 前提: ほかのカードと別のキャラクターの SR のカードが2枚ある', [SR_A, SR_B_ID]);
		for (const w of [375, 1280]) for (const theme of THEMES) {
			const tag = 'T123(3) ' + w + 'px ' + theme + ': ';
			const roster = { umaId: 'uma-0001', cardIds: CARDS6.slice(0, 5).concat([SR_A]), outsideOptions: { cards: [SR_B_ID].concat(SAVED5.slice(0, 4)) } };
			const sp = await openFactor(w, theme, roster);
			const r = await sp.page.evaluate(() => {
				const f = Array.from(document.querySelectorAll('[data-usd-el="factor-card-tile"]'));
				const one = Array.from(document.querySelectorAll('[data-usd-el="roster-tile"]'));
				return {
					fSR: f.filter((t) => t.getAttribute('data-rarity') === 'SR').length,
					fIcons: f.reduce((n, t) => n + t.querySelectorAll('[data-usd-el="card-rarity-icon"]').length, 0),
					fAria: f.filter((t) => t.getAttribute('data-rarity') === 'SR').map((t) => t.querySelector('[data-usd-el="factor-card-pick"]').getAttribute('aria-label')),
					fX: f.filter((t) => t.getAttribute('data-rarity') === 'SR').map((t) => { const x = t.querySelector('[data-usd-el="factor-card-clear"]'); return x ? Math.round(x.getBoundingClientRect().width) : 0; }),
					oneSR: one.filter((t) => t.getAttribute('data-rarity') === 'SR').map((t) => t.querySelectorAll('[data-usd-el="card-rarity-icon"]').length),
					oneSSR: one.filter((t) => t.getAttribute('data-rarity') === 'SSR').reduce((n, t) => n + t.querySelectorAll('[data-usd-el="card-rarity-icon"]').length, 0),
					hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
				};
			});
			assert(r.fSR === 1, tag + '前提: ②の枠に SR のカードがある', r);
			assert(r.fIcons === 0, tag + '②の枠には SR・SSR ともレアリティのバッジが無い', r.fIcons);
			assert(r.fAria.every((a) => !/SR/.test(a)), tag + '②の枠の読み上げにも SR を出さない（バッジの代わりの文）', r.fAria);
			assert(r.fX.every((x) => x > 0), tag + '②の SR の枠の×は今のまま', r.fX);
			assert(r.oneSR.length === 1 && r.oneSR[0] === 1 && r.oneSSR === 0, tag + '①の枠は今までどおり（SR だけバッジ・SSR は出さない）', r);
			assert(!r.hscroll, tag + '横スクロールなし', '');
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T123(4) 新しいモード（レース指定なし／本育成編成なし）の②の下の欄の見出しは「編成サポカで得られるスキルのうち未追加のスキル N件」・＋の読み上げも同じ言い方（決定 450・451）・デフォルトは今のまま・見出しは1行（縦の行を増やさない）／カード一覧・星取表 × 360・375・390・1280px × ライト・ダーク', async () => {
		const NEW = '編成サポカで得られるスキルのうち未追加のスキル';
		const OLD = '“オススメサポ”で除外されたスキル';
		for (const mode of ['noPlan', 'default']) for (const w of (mode === 'noPlan' ? WIDTHS : [375])) for (const theme of (mode === 'noPlan' ? THEMES : ['light'])) for (const view of ['cards', 'table']) {
			const tag = 'T123(4) ' + mode + ' ' + w + 'px ' + theme + ' ' + view + ': ';
			const roster = mode === 'noPlan'
				? { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 }, noPlan: true, noPlanFactor: { cards: SAVED5 } }
				: { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
			const sp = await openFactor(w, theme, roster);
			await setView(sp.page, view);
			const r = await sp.page.evaluate((T) => {
				const h = document.querySelector(T + '[data-usd-el="factor-off-head"]');
				const rows = Array.from(document.querySelectorAll(T + '[data-usd-el="factor-off-row"]'));
				let lines = null;
				if (h) {
					const cs = getComputedStyle(h);
					const range = document.createRange();
					range.selectNodeContents(h);
					const rects = Array.from(range.getClientRects()).filter((x) => x.width > 0);
					lines = new Set(rects.map((x) => Math.round(x.top))).size;
					void cs;
				}
				return { head: h ? h.textContent : null, lines, n: rows.length,
					labels: rows.map((x) => { const b = x.querySelector('[data-usd-el="factor-enable"]'); return [b.getAttribute('aria-label'), b.getAttribute('title')]; }),
					hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
			}, T);
			assert(r.n >= 1, tag + '前提: 下の欄に行がある（' + r.n + '行）', r.n);
			const kind = mode === 'noPlan' ? NEW : OLD;
			assert(r.head === kind + ' ' + r.n + '件', tag + '見出しの文言と件数', r.head);
			assert(r.labels.every(([a, t]) => a === t && a.endsWith('（' + kind + '）を因子周回に追加する')), tag + '＋の読み上げ（aria-label・title）は見出しと同じ言い方', r.labels.slice(0, 2));
			if (mode === 'noPlan') assert(r.lines === 1, tag + '見出しは1行に収まる（縦の行を増やさない）', r.lines);
			assert(!r.hscroll, tag + '横スクロールなし', '');
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});
}
