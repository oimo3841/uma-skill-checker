// 動画V1-2（T59・2026-11-01。おいもさんの決定 C-258 の (3)・C-259 の V1-2 の回答）: UmaStar（special.html）の「画像をアップロード」の画面の、動画から取り込む入口と流れの検査。
// run-smoke.mjs の末尾から register89() で呼ばれる（塊の見出しはすべて「T59動画」で始まる。`npm run test:visual -- --only=T59動画` で回せる）。
//
// 形はモック lab/upload-mock.html（T43）の動画の場面: 入口＝?scene=new・押した直後＝vopen の v=1（g=2）・すでに画像がある＝vexist の v=1・
// 進捗＝vprog の v=1・終わった後＝vdone の v=2・人の単位の警告＝vwarn・失敗＝verr・取り消した後＝vcancel。寸法はモックを同じ測り方で測った値。
// 動画の代わりに、blocks-80（T42）の作り物の画のフレームの列（UmaVideoFrames.canvasSource）を、③の流れ（onVideoChosen）に渡す。
// 本物の動画2本は手元だけ（npm run test:video-local -- --special）。
//
// 見ること: 入口の位置と大きさ（375・1280px）・小窓・すでに画像があるときの3つのボタン・進捗と取り消し（枠は元のまま）・終わった後の「動画から N枚」と枠の中身・
// 失敗の文の出し分け（e.code ごと・人が3人でない）・結合で動画から来た人は composePerson、枠を触った人は stitchOnePerson に戻る・人の単位の警告・
// UmaExam に入口が無い・文面の表（VIDEO_TEXTS）とモックの文・CSV の行が一致する。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH } from './blocks-80.mjs';

// モックの文（T43。lab/upload-mock.html の (3) 動画の場面から写した。製品の文面の表がこの文と同じであることを見る）
const MOCK = {
	entry: '動画から取り込む（αテスト）',
	title: '動画から取り込む',
	tag: 'αテスト',
	targetA: '入れる先: 親Aセット（親A・祖A1・祖A2）',
	targetB: '入れる先: 親Bセット（親B・祖B1・祖B2）',
	note: 'αテスト中の動画によるOCR/結合機能です。質の改善・処理時間の改善をテスト中です',
	howto: ['因子の一覧のいちばん上（親）から撮り始める', '上から下へ、ゆっくり一定の速さでスクロールする', '祖2 のいちばん下まで来たら止める'],
	steps: ['動画を読み込み中', '親A のフレームを選んでいます', '祖A1 のフレームを選んでいます', '祖A2 のフレームを選んでいます', '完了'],
	foot: '処理中もほかの画面は見られます',
	next: 'このあと「OCR処理＋画像結合を開始する」か「画像を結合する（OCRしない）」を押してください。',
	// T82（モック T69 の vdone。C-258 の T69 への回答 8）
	stitched: '結合画像を作りました。OCRするときは「OCR処理＋画像結合を開始する」を押してください。',
	cancel: '取り消しました。入っていた画像はそのままです',
	keep: '入っていた画像はそのままです。',
	err: {
		unreadable: '動画を読み込めませんでした。このブラウザでは再生できない形式かもしれません（例: iPhone で撮った動画を Android で開いたとき）。撮った端末で開き直すか、スクショで入れてください。',
		noscreen: '動画の中に継承の画面（因子の一覧）が見つかりませんでした。因子の一覧を開いてから撮り直してください。',
		split: (n) => '親・祖1・祖2 の区切りが見つからず、人ごとに分けられませんでした（見つかったのは ' + n + '人）。3人ぶんを上から下まで、1本に続けて撮ってください。',
		fast: 'スクロールが速すぎて、画面をつなげられない所がありました。上から下へ、ゆっくり一定の速さで撮り直してください。'
	},
	warn: (who) => who + ' の結合の一部がずれているかもしれません。結果の画像を見て、ずれていたら動画を撮り直すか、スクショで入れ直してください。'
};
// モックの寸法（output/scratch/t59/measure.mjs でモックを測った値。ライト・ダークで同じ）
const SIZE = {
	375: { row: { x: 11, w: 353, h: 32 }, tabsW: 311, btn: { x: 326, dy: -6, w: 44, h: 44 }, sheet: { x: 0, w: 375, bottom: 812 }, sheetPickRow: [64, 111], stack: 343 },
	1280: { row: { x: 177, w: 926, h: 32 }, tabsW: 884, btn: { x: 1065, dy: -6, w: 44, h: 44 }, sheet: { x: 400, w: 480 }, sheetPickRow: [64, 111], stack: 448 }
};

export async function register89(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const closeNotices = async (page) => {
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
	};
	/** special を③で開き、作り物の画（__synth）を読み込んでおく */
	const openSp = async (w = 375, theme) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w < 641 ? 812 : 800 }, EMPTY);
		await sp.page.evaluate((t) => { localStorage.setItem('umaSkillDeck:stepTab', '2'); if (t) localStorage.setItem('uma-tools-theme', t); }, theme || null);
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.waitForTimeout(300);
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.addScriptTag({ content: SYNTH });
		await sp.page.waitForTimeout(150);
		return sp;
	};
	// 枠に作り物のスクショを入れる（人ごとの枚数）。File は 4バイトの PNG の頭（サムネイルは壊れて見えるが、数と同一性だけを見る）
	const seed = (page, counts, si = 0) => page.evaluate(({ counts, si }) => {
		counts.forEach((n, r) => { for (let k = 0; k < n; k++) addPersonFiles(si * 3 + r, [new File([new Uint8Array([137, 80, 78, 71, r, k])], 'shot-' + r + '-' + k + '.png', { type: 'image/png' })]); });
	}, { counts, si });
	const snapshotFiles = (page) => page.evaluate(() => { window.__before = persons.map((p) => p.files.slice()); return persons.map((p) => p.files.map((f) => f.name)); });
	const sameAsBefore = (page) => page.evaluate(() => persons.every((p, i) => p.files.length === window.__before[i].length && p.files.every((f, k) => f === window.__before[i][k])));
	// 小窓のボタンを押して動画を選ぶまで（ファイルの選択の窓は開かせて閉じる）→ 作り物の画を渡す。o.slow … フレームを描く前の待ち ms（進捗・取り消しを見るため）
	const runSynth = async (page, act, o = {}) => {
		await page.click('#video-import-btn');
		await page.waitForSelector('#video-sheet [data-video-act="' + act + '"]');
		const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click('#video-sheet [data-video-act="' + act + '"]')]);
		const accept = chooser ? await chooser.element().getAttribute('accept') : null;
		await page.evaluate(({ path, slow }) => {
			const s = __synth.make(path ? { path } : {});
			const src = slow ? Object.assign({}, s.source, { drawAt: async (...a) => { await new Promise((r) => setTimeout(r, slow)); return s.source.drawAt(...a); } }) : s.source;
			window.__videoRun = onVideoChosen(src);
		}, { path: o.path || null, slow: o.slow || 0 });
		return { chooser: !!chooser, accept };
	};
	const waitRun = (page) => page.evaluate(() => window.__videoRun);

	/* ── (1) 入口 ─────────────────────────────── */
	for (const w of [375, 1280]) {
		await block(`T59動画(1) ${w}px 入口: 親A／＋親Bセットのタブの行の右端の動画のアイコン（44px・α・title と読み上げ名）・モックと同じ位置と大きさ`, async () => {
			const sp = await openSp(w);
			const m = await sp.page.evaluate(() => {
				const rr = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; };
				const btn = document.getElementById('video-import-btn');
				const row = btn && btn.parentElement;
				const svg = btn && btn.querySelector('svg');
				const alpha = btn && btn.querySelector('.video-alpha');
				const cs = alpha ? getComputedStyle(alpha) : null;
				const mid = btn ? { x: rr(btn).x + 22, y: rr(btn).y + 22 } : null;
				return {
					has: !!btn, inRow: !!(row && row.querySelector('#personset-tabs')), last: !!(row && row.lastElementChild === btn),
					row: rr(row), tabs: rr(document.getElementById('personset-tabs')), btn: rr(btn), svg: rr(svg),
					title: btn && btn.title, aria: btn && btn.getAttribute('aria-label'), type: btn && btn.type,
					alpha: alpha && alpha.textContent, alphaHidden: alpha && alpha.getAttribute('aria-hidden'), alphaFs: cs && cs.fontSize, alphaFw: cs && cs.fontWeight,
					hit: mid ? (document.elementFromPoint(mid.x, mid.y) || {}).closest?.('#video-import-btn') === btn : false,
					// 丸いボタンなので、角ではなく上下左右の端の中ほど（端から 2px）で押せるかを見る（モックも同じ形）
					hitCorner: btn ? [[2, 22], [42, 22], [22, 2], [22, 42]].every(([dx, dy]) => { const el = document.elementFromPoint(rr(btn).x + dx, rr(btn).y + dy); return !!(el && el.closest('#video-import-btn')); }) : false,
					lib: typeof UmaVideoFrames === 'object' && /^\d{4}-\d{2}-\d{2}[a-z]$/.test(UmaVideoFrames.VERSION),
					script: [...document.scripts].map((s) => s.getAttribute('src') || '').filter((s) => /js\/(common|stitch|video-frames)\.js/.test(s)).map((s) => s.replace(/\?.*/, '')),
					sw: document.documentElement.scrollWidth, iw: window.innerWidth
				};
			});
			const S = SIZE[w];
			assert(m.has && m.inRow && m.last, `T59(1) ${w}px 入口のボタン #video-import-btn がタブの行（#personset-tabs と同じ行）の右端にある`, m);
			assert(m.btn && m.btn.w === 44 && m.btn.h === 44 && m.btn.x === S.btn.x && m.btn.y - m.row.y === S.btn.dy, `T59(1) ${w}px 入口は 44×44・位置はモックと同じ（x=${S.btn.x}・行の上から ${S.btn.dy}px）`, { btn: m.btn, row: m.row });
			assert(m.row.x === S.row.x && m.row.w === S.row.w && m.row.h === S.row.h && m.tabs.w === S.tabsW, `T59(1) ${w}px タブの行の幅・高さ（${S.row.h}px）とタブの帯の幅（${S.tabsW}px）がモックと同じ（行は折り返さない）`, { row: m.row, tabs: m.tabs });
			assert(m.svg && m.svg.w === 22 && m.svg.h === 22, `T59(1) ${w}px アイコンは 22px（lucide の video）`, m.svg);
			assert(m.alpha === 'α' && m.alphaHidden === 'true' && m.alphaFs === '9px' && m.alphaFw === '800', `T59(1) ${w}px 小さな「α」（9px・800・読み上げない）`, m);
			assert(m.title === MOCK.entry && m.aria === MOCK.entry && m.type === 'button', `T59(1) ${w}px title と読み上げ名は「${MOCK.entry}」`, m);
			assert(m.hit && m.hitCorner, `T59(1) ${w}px 押せる範囲が 44×44（中心と上下左右の端で入口を押せる）`, m);
			assert(m.lib && JSON.stringify(m.script) === JSON.stringify(['js/common.js', 'js/stitch.js', 'js/video-frames.js']), `T59(1) ${w}px js/video-frames.js を common.js・stitch.js の後に読む`, m.script);
			assert(m.sw <= m.iw, `T59(1) ${w}px 横スクロールなし`, m);
			assert(jsErrors(sp.errors).length === 0, `T59(1) ${w}px コンソールのエラー0`, sp.errors);
			await sp.ctx.close();
		});
	}

	await block('T59動画(1b) UmaExam に動画の入口が無い（js/video-frames.js も読まない）', async () => {
		const ex = await openPage(browser, base, 'exam.html', { width: 375, height: 812 });
		await closeNotices(ex.page);
		await ex.page.evaluate(() => selectStepTab(2));
		await ex.page.waitForTimeout(200);
		const r = await ex.page.evaluate(() => ({ btn: !!document.querySelector('#video-import-btn, .video-btn'), lib: typeof window.UmaVideoFrames, script: [...document.scripts].some((s) => /video-frames/.test(s.src)), tabs: !!document.getElementById('personset-tabs') }));
		assert(r.tabs && !r.btn && r.lib === 'undefined' && !r.script, 'T59(1b) UmaExam にはタブの行があるが、動画の入口は無く、video-frames.js も読まない', r);
		await ex.ctx.close();
	});

	/* ── (2) 押した直後の小窓 ─────────────────────── */
	for (const w of [375, 1280]) {
		await block(`T59動画(2) ${w}px 押した直後の小窓（モックの vopen の v=1・撮り方は g=2）: 入れる先・注意書き・撮り方3つ・やめる／動画を選ぶ・スマホは下から`, async () => {
			const sp = await openSp(w);
			await sp.page.click('#video-import-btn');
			await sp.page.waitForSelector('#video-sheet .video-sheet');
			const m = await sp.page.evaluate(() => {
				const sh = document.querySelector('#video-sheet .video-sheet');
				const r = sh.getBoundingClientRect();
				const h2 = sh.querySelector('h2');
				return {
					role: sh.getAttribute('role'), modal: sh.getAttribute('aria-modal'), labelled: h2 && sh.getAttribute('aria-labelledby') === h2.id,
					title: h2 && h2.firstChild && [...h2.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(), tag: h2 && (h2.querySelector('.video-tag') || {}).textContent,
					target: (sh.querySelector('.video-target') || {}).textContent, targetBold: (sh.querySelector('.video-target b') || {}).textContent,
					note: (sh.querySelector('.video-note') || {}).textContent,
					howtoHead: (sh.querySelector('.video-howto > strong') || {}).textContent,
					howto: [...sh.querySelectorAll('.video-howto li')].map((li) => li.textContent), howtoStrong: (sh.querySelector('.video-howto li strong') || {}).textContent,
					btns: [...sh.querySelectorAll('.uma-btn')].map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent.trim(), act: b.getAttribute('data-video-act'), primary: b.classList.contains('uma-btn--primary'), w: Math.round(q.width), h: Math.round(q.height) }; }),
					exist: !!sh.querySelector('.video-exist'),
					rect: { x: Math.round(r.x), w: Math.round(r.width), bottom: Math.round(r.bottom) }, ih: window.innerHeight,
					focus: document.activeElement && document.activeElement.getAttribute('data-video-act')
				};
			});
			assert(m.role === 'dialog' && m.modal === 'true' && m.labelled, `T59(2) ${w}px 小窓は dialog（aria-modal・見出しで名前）`, m);
			assert(m.title === MOCK.title && m.tag === MOCK.tag, `T59(2) ${w}px 見出し「${MOCK.title}」＋札「${MOCK.tag}」`, m);
			assert(m.target === MOCK.targetA && m.targetBold === '親Aセット', `T59(2) ${w}px 入れる先「${MOCK.targetA}」（セットの名前は太字）`, m);
			assert(m.note === MOCK.note, `T59(2) ${w}px 注意書きはモックの文`, m.note);
			assert(m.howtoHead === '撮り方' && JSON.stringify(m.howto) === JSON.stringify(MOCK.howto) && m.howtoStrong === '上から下へ、ゆっくり一定の速さで', `T59(2) ${w}px 撮り方の案内は g=2（手順3つ。2つ目の「上から下へ、ゆっくり一定の速さで」を太字）`, m);
			assert(!m.exist && m.btns.length === 2 && m.btns[0].t === 'やめる' && m.btns[0].act === 'cancel' && !m.btns[0].primary && m.btns[1].t === '動画を選ぶ' && m.btns[1].act === 'pick' && m.btns[1].primary,
				`T59(2) ${w}px 画像が無いセットではボタンは「やめる」「動画を選ぶ」（主）の2つ`, m.btns);
			assert(m.btns.every((b) => b.h === 44) && m.btns[0].w === SIZE[w].sheetPickRow[0] && m.btns[1].w === SIZE[w].sheetPickRow[1], `T59(2) ${w}px ボタンの大きさがモックと同じ（高さ 44・幅 ${SIZE[w].sheetPickRow.join('／')}）`, m.btns);
			if (w === 375) assert(m.rect.x === 0 && m.rect.w === 375 && m.rect.bottom === m.ih, 'T59(2) 375px 小窓は画面の下から出る（幅いっぱい・下端が画面の下端）', m.rect);
			else assert(m.rect.x === SIZE[w].sheet.x && m.rect.w === SIZE[w].sheet.w && m.rect.bottom < m.ih, 'T59(2) 1280px 小窓は画面の中ほど（幅 480px）', m.rect);
			assert(m.focus === 'pick', `T59(2) ${w}px 開いたら「動画を選ぶ」に焦点`, m.focus);
			// やめる・Esc・外側を押すと閉じる。動画を選ぶはファイルの選択（accept="video/*"）を開く
			await sp.page.click('#video-sheet [data-video-act="cancel"]');
			const c1 = await sp.page.evaluate(() => ({ open: !!document.getElementById('video-sheet'), focus: document.activeElement && document.activeElement.id }));
			await sp.page.click('#video-import-btn');
			await sp.page.keyboard.press('Escape');
			const c2 = await sp.page.evaluate(() => !!document.getElementById('video-sheet'));
			await sp.page.click('#video-import-btn');
			await sp.page.mouse.click(5, 5);
			const c3 = await sp.page.evaluate(() => !!document.getElementById('video-sheet'));
			assert(!c1.open && c1.focus === 'video-import-btn' && !c2 && !c3, `T59(2) ${w}px 「やめる」・Esc・小窓の外を押すと閉じる（焦点は入口へ戻る）`, { c1, c2, c3 });
			await sp.page.click('#video-import-btn');
			const [chooser] = await Promise.all([sp.page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), sp.page.click('#video-sheet [data-video-act="pick"]')]);
			const acc = chooser ? await chooser.element().getAttribute('accept') : null;
			const after = await sp.page.evaluate(() => ({ open: !!document.getElementById('video-sheet'), pend: window.videoPending ? null : null }));
			assert(chooser && acc === 'video/*' && !after.open, `T59(2) ${w}px 「動画を選ぶ」でファイルの選択（accept="video/*"）が開き、小窓は閉じる`, { chooser: !!chooser, acc, after });
			// 親Bセットのタブでは入れる先が親Bセット
			await sp.page.evaluate(() => selectPersonSet(1));
			await sp.page.click('#video-import-btn');
			const tb = await sp.page.textContent('#video-sheet .video-target');
			assert(tb === MOCK.targetB, `T59(2) ${w}px 親Bセットのタブでは「${MOCK.targetB}」`, tb);
			assert(jsErrors(sp.errors).length === 0, `T59(2) ${w}px コンソールのエラー0`, sp.errors);
			await sp.ctx.close();
		});
	}

	/* ── (3) すでに画像があるとき ─────────────────── */
	await block('T59動画(3) すでに画像があるセット: 「置き換えて動画を選ぶ」「後ろに足して動画を選ぶ」「やめる」の3つ（モックの vexist の v=1）・やめるで枠はそのまま', async () => {
		const sp = await openSp(375);
		await seed(sp.page, [2, 2, 1]);
		await snapshotFiles(sp.page);
		await sp.page.click('#video-import-btn');
		const m = await sp.page.evaluate(() => {
			const sh = document.querySelector('#video-sheet .video-sheet');
			return { exist: (sh.querySelector('.video-exist') || {}).textContent, target: (sh.querySelector('.video-target') || {}).textContent,
				btns: [...sh.querySelectorAll('.uma-btn')].map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent.trim(), act: b.getAttribute('data-video-act'), primary: b.classList.contains('uma-btn--primary'), w: Math.round(q.width), h: Math.round(q.height), x: Math.round(q.x) }; }),
				bottom: Math.round(sh.getBoundingClientRect().bottom) };
		});
		assert(m.exist === '親Aセットには画像が 5枚入っています。' && m.target === MOCK.targetA, 'T59(3) 「親Aセットには画像が 5枚入っています。」（枚数はセットの3人の合計）', m);
		assert(JSON.stringify(m.btns.map((b) => [b.t, b.act, b.primary])) === JSON.stringify([['置き換えて動画を選ぶ', 'replace', true], ['後ろに足して動画を選ぶ', 'append', false], ['やめる', 'cancel', false]]),
			'T59(3) ボタンは「置き換えて動画を選ぶ」（主）→「後ろに足して動画を選ぶ」→「やめる」の順', m.btns);
		assert(m.btns.every((b) => b.w === SIZE[375].stack && b.h === 44 && b.x === 16) && m.bottom === 812, 'T59(3) 3つのボタンは縦に並び、幅 343・高さ 44（モックと同じ）・小窓は下から', m);
		await sp.page.click('#video-sheet [data-video-act="cancel"]');
		assert(await sameAsBefore(sp.page), 'T59(3) 「やめる」で枠の画像はそのまま', null);
		assert(jsErrors(sp.errors).length === 0, 'T59(3) コンソールのエラー0', sp.errors);
		await sp.ctx.close();
	});

	/* ── (4) 置き換え・終わった後 ──────────────────── */
	for (const w of [375, 1280]) {
		await block(`T59動画(4) ${w}px 置き換えて取り込む: 人ごとの「動画から N枚」の1行（モックの vdone の v=2）・終わった知らせ・枠の中身は動画のフレームだけ`, async () => {
			const sp = await openSp(w);
			await seed(sp.page, [2, 2, 1]);
			const pick = await runSynth(sp.page, 'replace');
			const res = await waitRun(sp.page);
			const m = await sp.page.evaluate(() => {
				const tiles = [0, 1, 2].map((i) => { const t = document.querySelector('.person-image-list[data-person="' + i + '"] .video-tile'); return t ? { text: [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(), hint: (t.querySelector('small') || {}).textContent, img: !!t.querySelector('img'), tag: t.tagName } : null; });
				const thumbs = [0, 1, 2].map((i) => document.querySelectorAll('.person-image-list[data-person="' + i + '"] > div.group').length);
				const sum = document.getElementById('video-summary');
				return {
					n: persons.slice(0, 3).map((p) => p.files.length), names: persons.slice(0, 3).map((p) => p.files.every((f) => /^frame-\d{6}\.jpg$/.test(f.name))),
					video: persons.slice(0, 3).map((p) => !!(p.video && p.video.files.length === p.files.length && p.video.shifts.length === p.files.length - 1 && p.video.uncertain.length === p.files.length - 1)),
					tiles, thumbs, sumText: sum && sum.textContent.trim(), sumRole: sum && sum.getAttribute('role'), sumBold: sum && (sum.querySelector('b') || {}).textContent,
					sumAfterRow: sum && sum.previousElementSibling && sum.previousElementSibling.classList.contains('uma-subtabs-row'),
					tab: (document.querySelector('#personset-tabs [data-tab-id="0"] .uma-subtab-count') || {}).textContent,
					prog: !!document.getElementById('video-progress'), err: !!document.getElementById('video-error'),
					busy: !!document.querySelector('.video-busy'), btnDis: document.getElementById('video-import-btn').disabled,
					tileH: (() => { const t = document.querySelector('.video-tile'); return t ? Math.round(t.getBoundingClientRect().height) : null; })()
				};
			});
			const total = m.n.reduce((a, b) => a + b, 0);
			assert(pick.chooser && pick.accept === 'video/*', `T59(4) ${w}px 「置き換えて動画を選ぶ」でファイルの選択が開く`, pick);
			assert(res && res.ok === true && m.n.every((x) => x >= 2) && m.names.every(Boolean) && m.video.every(Boolean), `T59(4) ${w}px 3人の枠が動画のフレーム（frame-NNNNNN.jpg）だけに置き換わり、人ごとのずれ・確かでない継ぎ目を持つ`, { res, m });
			assert(m.tiles.every((t, i) => t && t.tag === 'BUTTON' && t.text === '動画から ' + m.n[i] + '枚' && t.hint === '押すと全部を表示' && t.img) && m.thumbs.every((x) => x === 0),
				`T59(4) ${w}px 人ごとに「動画から N枚」の1行（押すと全部を表示）だけで、サムネイルは並べない`, m.tiles);
			// T82: 取り込みのあと自動で結合するので、2行目は「結合画像を作りました。…」（C-258 の T69 への回答 8。自動の結合ができなかったときだけ MOCK.next）
			assert(m.sumText === '動画から ' + total + '枚 を入れました（親A ' + m.n[0] + '枚・祖A1 ' + m.n[1] + '枚・祖A2 ' + m.n[2] + '枚）。' + MOCK.stitched && m.sumBold === total + '枚' && m.sumRole === 'status' && m.sumAfterRow,
				`T59(4) ${w}px 終わった知らせ「動画から ${total}枚 を入れました（親A …）。」＋次の操作（タブのすぐ下・role=status）`, m);
			assert(m.tab === total + '枚', `T59(4) ${w}px タブの枚数は ${total}枚`, m.tab);
			assert(!m.prog && !m.err && !m.busy && !m.btnDis, `T59(4) ${w}px 終わると進捗の箱が消え、枠は元の濃さ・入口はまた押せる`, m);
			// 「動画から N枚」を押すと全部のサムネイルが出る（T82: 3列は結合画像の下の「親ごとの画像を見る」で出してから）
			await sp.page.click('#personset-A-wrap .video-showcols');
			await sp.page.click('.person-image-list[data-person="1"] .video-tile');
			const ex = await sp.page.evaluate(() => ({ tile: !!document.querySelector('.person-image-list[data-person="1"] .video-tile'), thumbs: document.querySelectorAll('.person-image-list[data-person="1"] > div.group').length, still: !!persons[1].video }));
			assert(!ex.tile && ex.thumbs === m.n[1] && ex.still, `T59(4) ${w}px 「動画から N枚」を押すと、その人のサムネイル ${m.n[1]}枚が並ぶ（動画から来たことは変わらない）`, ex);
			assert(jsErrors(sp.errors).length === 0, `T59(4) ${w}px コンソールのエラー0`, sp.errors);
			await sp.ctx.close();
		});
	}

	await block('T59動画(5) 後ろに足して取り込む: 今の画像の後ろに動画のフレームが足される・画像が無いセットでは「動画を選ぶ」で入る・親Bセットのタブなら親Bへ', async () => {
		const sp = await openSp(375);
		await seed(sp.page, [2, 2, 1]);
		await snapshotFiles(sp.page);
		await runSynth(sp.page, 'append');
		await waitRun(sp.page);
		const m = await sp.page.evaluate(() => persons.slice(0, 3).map((p, i) => ({
			keep: window.__before[i].every((f, k) => p.files[k] === f), added: p.files.length - window.__before[i].length,
			tail: p.files.slice(window.__before[i].length).every((f) => /^frame-/.test(f.name)),
			tile: (document.querySelector('.person-image-list[data-person="' + i + '"] .video-tile') || {}).textContent,
			thumbs: document.querySelectorAll('.person-image-list[data-person="' + i + '"] > div.group').length,
			vf: p.video ? p.video.files.length : -1
		})));
		assert(m.every((x, i) => x.keep && x.added >= 2 && x.tail && x.vf === x.added), 'T59(5) 「後ろに足して…」: 今の画像はそのまま前に残り、後ろに動画のフレームが足される', m);
		assert(m.every((x, i) => x.thumbs === [2, 2, 1][i] && x.tile && x.tile.indexOf('動画から ' + x.added + '枚') === 0), 'T59(5) 枠には今の画像のサムネイルと「動画から N枚」の1行', m);
		// 親Bセット（画像なし）に「動画を選ぶ」で入れる
		await sp.page.evaluate(() => selectPersonSet(1));
		await runSynth(sp.page, 'pick');
		await waitRun(sp.page);
		const b = await sp.page.evaluate(() => ({ a: persons.slice(0, 3).map((p) => p.files.length), b: persons.slice(3).map((p) => p.files.length), sum: (document.getElementById('video-summary') || {}).textContent }));
		assert(b.b.every((x) => x >= 2) && /（親B \d+枚・祖B1 \d+枚・祖B2 \d+枚）/.test(b.sum || ''), 'T59(5) 親Bセットのタブでは親B・祖B1・祖B2 に入り、知らせも親B…の名前', b);
		assert(jsErrors(sp.errors).length === 0, 'T59(5) コンソールのエラー0', sp.errors);
		await sp.ctx.close();
	});

	/* ── (6) 進捗と取り消し ─────────────────────── */
	for (const w of [375, 1280]) {
		await block(`T59動画(6) ${w}px 進捗（割合のバー・段の一覧・取り消す。目安の時間なし）・処理中は枠を薄くして触れない・取り消すと枠は元のまま＋トースト`, async () => {
			const sp = await openSp(w);
			await seed(sp.page, [2, 2, 1]);
			await snapshotFiles(sp.page);
			await runSynth(sp.page, 'replace', { slow: 30 });
			await sp.page.waitForSelector('#video-progress');
			await sp.page.waitForFunction(() => { const p = document.getElementById('video-progress'); return p && parseInt(p.querySelector('.video-prog-pct').textContent, 10) >= 5; }, null, { timeout: 20000 });
			const m = await sp.page.evaluate(() => {
				const p = document.getElementById('video-progress');
				const r = p.getBoundingClientRect();
				const ab = p.querySelector('[data-video-act="abort"]');
				const ar = ab.getBoundingClientRect();
				const wa = document.getElementById('personset-A-wrap');
				const bar = p.querySelector('.video-prog-bar');
				return {
					role: p.getAttribute('role'), live: p.getAttribute('aria-live'), afterRow: p.previousElementSibling && p.previousElementSibling.classList.contains('uma-subtabs-row'),
					label: p.querySelector('.video-prog-label').textContent, pct: p.querySelector('.video-prog-pct').textContent, barW: bar.style.width,
					steps: [...p.querySelectorAll('.video-steps li')].map((li) => ({ t: li.textContent.replace(/^[✓▸・]/, ''), st: li.getAttribute('data-st') })),
					foot: p.querySelector('.video-prog-foot small').textContent, abort: ab.textContent.trim(), abortH: Math.round(ar.height),
					w: Math.round(r.width), x: Math.round(r.x),
					op: getComputedStyle(wa).opacity, pe: getComputedStyle(wa).pointerEvents, btnDis: document.getElementById('video-import-btn').disabled,
					combo: document.getElementById('process-stitch-btn').disabled, stitch: document.getElementById('stitch-btn').disabled,
					eta: /目安/.test(p.textContent)
				};
			});
			assert(m.role === 'status' && m.live === 'polite' && m.afterRow, `T59(6) ${w}px 進捗の箱はタブのすぐ下（role=status・aria-live=polite）`, m);
			assert(JSON.stringify(m.steps.map((s) => s.t)) === JSON.stringify(MOCK.steps) && m.steps.filter((s) => s.st === 'now').length === 1, `T59(6) ${w}px 段の一覧は「${MOCK.steps.join('→')}」で、今の段が1つ`, m.steps);
			const now = m.steps.find((s) => s.st === 'now');
			assert(m.label === now.t + '…' && /^\d+%$/.test(m.pct) && m.barW === m.pct, `T59(6) ${w}px 見出しは今の段＋「…」、割合（%）とバーの幅が同じ`, m);
			assert(m.foot === MOCK.foot && !m.eta && m.abort === '取り消す' && m.abortH === 44, `T59(6) ${w}px 下の行は「${MOCK.foot}」（目安の時間は出さない）と「取り消す」（高さ 44）`, m);
			assert(m.x === SIZE[w].row.x && m.w === SIZE[w].row.w, `T59(6) ${w}px 進捗の箱の幅はタブの行と同じ（モックと同じ）`, m);
			assert(m.op === '0.55' && m.pe === 'none' && m.btnDis && m.combo && m.stitch, `T59(6) ${w}px 処理中は枠を薄く（0.55）して触れない・入口と処理のボタンは押せない`, m);
			await sp.page.click('#video-progress [data-video-act="abort"]');
			await waitRun(sp.page);
			const c = await sp.page.evaluate(() => {
				const t = document.getElementById('toast');
				return { prog: !!document.getElementById('video-progress'), toast: document.getElementById('toast-message').textContent, shown: !t.classList.contains('opacity-0'),
					op: getComputedStyle(document.getElementById('personset-A-wrap')).opacity, btnDis: document.getElementById('video-import-btn').disabled, err: !!document.getElementById('video-error'), sum: !!document.getElementById('video-summary'),
					video: persons.some((p) => p.video) };
			});
			assert(await sameAsBefore(sp.page), `T59(6) ${w}px 取り消すと枠の画像は元のまま`, null);
			assert(!c.prog && c.toast === MOCK.cancel && c.shown && c.op === '1' && !c.btnDis && !c.err && !c.sum && !c.video, `T59(6) ${w}px 取り消した後: トースト「${MOCK.cancel}」・進捗の箱は消え、失敗・知らせの箱は出ない`, c);
			assert(jsErrors(sp.errors).length === 0, `T59(6) ${w}px コンソールのエラー0`, sp.errors);
			await sp.ctx.close();
		});
	}

	/* ── (7) 失敗の出し分け ─────────────────────── */
	await block('T59動画(7) 失敗の文の出し分け（e.code ごと・人が3人でない）: タブのすぐ下の赤の箱・枠は元のまま', async () => {
		const sp = await openSp(375);
		await seed(sp.page, [2, 2, 1]);
		await snapshotFiles(sp.page);
		const CASES = [['decode', 'unreadable'], ['no-video-track', 'unreadable'], ['no-duration', 'unreadable'], ['blank-grab', 'unreadable'], ['band', 'noscreen'], ['too-few', 'noscreen'], ['too-many', 'fast']];
		const got = [];
		for (const [code] of CASES) {
			await sp.page.click('#video-import-btn');
			await sp.page.click('#video-sheet [data-video-act="replace"]').catch(() => {});
			await sp.page.evaluate((code) => {
				const src = { kind: 'canvas', width: 720, height: 1560, duration: 4, drawAt: async () => { const e = new Error('作り物の失敗'); e.code = code; throw e; }, close() {} };
				return onVideoChosen(src);
			}, code);
			got.push(await sp.page.evaluate(() => { const e = document.getElementById('video-error'); return e ? { t: e.querySelector('.video-error-text').textContent, role: e.getAttribute('role'), afterRow: e.previousElementSibling && e.previousElementSibling.classList.contains('uma-subtabs-row'), n: document.querySelectorAll('#video-error').length } : null; }));
		}
		CASES.forEach(([code, key], i) => {
			assert(got[i] && got[i].t === MOCK.err[key] + MOCK.keep && got[i].role === 'alert' && got[i].afterRow && got[i].n === 1, `T59(7) e.code=${code} → 「${MOCK.err[key].slice(0, 16)}…」＋「${MOCK.keep}」（タブのすぐ下・role=alert・1つだけ）`, got[i]);
		});
		// 本物の失敗: 動画でないファイル（videoSource が decode）・人が1人（速すぎて祖1・祖2 の頭を通り過ぎる作り物の画）
		await sp.page.click('#video-import-btn');
		await sp.page.click('#video-sheet [data-video-act="replace"]');
		await sp.page.evaluate(() => onVideoChosen(new File([new Uint8Array(64)], 'broken.mp4', { type: 'video/mp4' })));
		const dec = await sp.page.evaluate(() => (document.querySelector('#video-error .video-error-text') || {}).textContent);
		assert(dec === MOCK.err.unreadable + MOCK.keep, 'T59(7) 本物の読めないファイル → 読めない動画の文', dec);
		await runSynth(sp.page, 'replace', { path: 'jump' });
		await waitRun(sp.page);
		const sp1 = await sp.page.evaluate(() => (document.querySelector('#video-error .video-error-text') || {}).textContent);
		assert(sp1 === MOCK.err.split(1) + MOCK.keep, 'T59(7) 人が3人でない（見つかったのは 1人）→ 人が分けられない文（数はその時の値）', sp1);
		assert(await sameAsBefore(sp.page), 'T59(7) どの失敗でも枠の画像は元のまま', null);
		const other = await sp.page.evaluate(() => ({ prog: !!document.getElementById('video-progress'), sum: !!document.getElementById('video-summary'), video: persons.some((p) => p.video), op: getComputedStyle(document.getElementById('personset-A-wrap')).opacity }));
		assert(!other.prog && !other.sum && !other.video && other.op === '1', 'T59(7) 失敗の後は進捗の箱が消え、知らせは出ず、枠は元の濃さ', other);
		const long = await sp.page.evaluate(() => Object.values(VIDEO_TEXTS).some((t) => /長すぎ/.test(t)));
		assert(!long, 'T59(7) 「長すぎます」の失敗は無い（V1-2 では長さの上限を設けない）', null);
		// 次に動画を選ぶと失敗の箱は消える
		await runSynth(sp.page, 'replace');
		await waitRun(sp.page);
		const cleared = await sp.page.evaluate(() => ({ err: !!document.getElementById('video-error'), sum: !!document.getElementById('video-summary') }));
		assert(!cleared.err && cleared.sum, 'T59(7) 次に取り込むと失敗の箱は消え、終わった知らせになる', cleared);
		assert(jsErrors(sp.errors).filter((e) => !/作り物の失敗|動画を読めない|人が3人に分かれない/.test(e)).length === 0, 'T59(7) コンソールのエラー0（失敗の記録を除く）', sp.errors);
		await sp.ctx.close();
	});

	/* ── (8) 結合: composePerson と stitchOnePerson ─────── */
	await block('T59動画(8) 結合: 動画から来た人は composePerson（ずれで組み立て）・枠の画像を消す／足すをした人は stitchOnePerson に戻る・高さは stitchOnePerson と同じ', async () => {
		const sp = await openSp(1280);
		await runSynth(sp.page, 'pick');
		await waitRun(sp.page);
		const run = () => sp.page.evaluate(async () => {
			const calls = [];
			const orig = window.stitchOnePerson;
			window.stitchOnePerson = async (files, label) => { calls.push(label); return orig(files, label); };
			devGeometry = [];
			try { await runImageStitching({ keepClosed: true, quiet: true }); } finally { window.stitchOnePerson = orig; }
			const img = document.querySelector('#stitch-result-content img');
			return { stitch: calls, video: devGeometry.filter((l) => /^\[動画\] .+: 動画のずれで組み立て/.test(l)).map((l) => /^\[動画\] (\S+):/.exec(l)[1]), img: !!img,
				err: (document.querySelector('#stitch-result-content .border-red-200') || {}).textContent || null };
		});
		const r1 = await run();
		assert(r1.img && !r1.err && r1.stitch.length === 0 && JSON.stringify(r1.video) === JSON.stringify(['親A', '祖A1', '祖A2']), 'T59(8) 取り込んだ直後: 3人とも composePerson（stitchOnePerson は呼ばない）で結合画像ができる', r1);
		// 高さの比べ: 同じ files で stitchOnePerson と composePerson
		const hh = await sp.page.evaluate(async () => {
			const out = [];
			for (let i = 0; i < 3; i++) {
				const p = persons[i];
				const a = await UmaVideoFrames.composePerson(p.files, p.video.shifts, p.video.uncertain, PERSON_LABELS[i]);
				const b = await stitchOnePerson(p.files, PERSON_LABELS[i]);
				out.push([a.height, b.height]);
			}
			return out;
		});
		assert(hh.every(([a, b]) => a === b && a > 1000), 'T59(8) 3人の composePerson の高さが、同じ画像の stitchOnePerson と同じ', hh);
		// 祖A1 の画像を1枚消す・祖A2 に1枚足す → その2人は stitchOnePerson に戻る
		await sp.page.evaluate(() => {
			removePersonImage(1, persons[1].files.length - 1);
			const f = persons[0].files[0];
			addPersonFiles(2, [new File([f], 'extra.jpg', { type: 'image/jpeg' })]);
		});
		const st = await sp.page.evaluate(() => ({ v: persons.slice(0, 3).map((p) => !!p.video), tile: [0, 1, 2].map((i) => !!document.querySelector('.person-image-list[data-person="' + i + '"] .video-tile')),
			thumbs: [1, 2].map((i) => document.querySelectorAll('.person-image-list[data-person="' + i + '"] > div.group').length), n: [1, 2].map((i) => persons[i].files.length) }));
		assert(JSON.stringify(st.v) === '[true,false,false]' && JSON.stringify(st.tile) === '[true,false,false]' && st.thumbs[0] === st.n[0] && st.thumbs[1] === st.n[1],
			'T59(8) 枠を触った人（祖A1 消す・祖A2 足す）は動画の印が外れ、サムネイルが全部並ぶ', st);
		const r2 = await run();
		assert(JSON.stringify(r2.video) === '["親A"]' && JSON.stringify(r2.stitch) === '["祖A1","祖A2"]', 'T59(8) 次の結合: 親A は composePerson、祖A1・祖A2 は stitchOnePerson', r2);
		// 「セットをクリア」で動画の印も消える
		await sp.page.evaluate(() => clearPersonSet(0));
		const cl = await sp.page.evaluate(() => persons.slice(0, 3).map((p) => p.video || null));
		assert(cl.every((v) => v === null), 'T59(8) 「セットをクリア」で動画の印も消える', cl);
		assert(jsErrors(sp.errors).length === 0, 'T59(8) コンソールのエラー0', sp.errors);
		await sp.ctx.close();
	});

	/* ── (9) 人の単位の警告 ─────────────────────── */
	await block('T59動画(9) 人の単位の警告（モックの vwarn）: 確かでない継ぎ目のある人を結合の結果の上の黄色の箱で知らせる（0人は出さない・1人・3人）', async () => {
		const sp = await openSp(375);
		await runSynth(sp.page, 'pick');
		await waitRun(sp.page);
		const run = (flags) => sp.page.evaluate(async (flags) => {
			persons.slice(0, 3).forEach((p, i) => { p.video.uncertain = p.video.uncertain.map((_, k) => flags[i] && k === 0); });
			await runImageStitching({ keepClosed: true, quiet: true });
			const blk = document.querySelector('#stitch-result-content > div');
			const w = blk && blk.querySelector('.video-warn');
			const img = blk && blk.querySelector('img');
			return { warn: w ? w.textContent.trim() : null, role: w && w.getAttribute('role'), amber: w ? w.classList.contains('border-amber-200') && w.classList.contains('bg-amber-50') : null,
				aboveImg: !!(w && img && (w.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING)), icon: !!(w && w.querySelector('svg')),
				seamBox: !!(blk && [...blk.querySelectorAll('p')].some((p) => /一部の継ぎ目の一致度が低いため/.test(p.textContent))) };
		}, flags);
		const r0 = await run([false, false, false]);
		assert(r0.warn === null && !r0.seamBox, 'T59(9) 0人: 黄色の箱は出ない', r0);
		const r1 = await run([false, true, false]);
		assert(r1.warn === MOCK.warn('祖A1') && r1.role === 'status' && r1.amber && r1.aboveImg && r1.icon, 'T59(9) 1人: 「祖A1 の結合の一部が…」（黄色の箱・三角のアイコン・結果の画像の上）', r1);
		assert(!r1.seamBox, 'T59(9) 動画から来た人の継ぎ目は、画像の番号の継ぎ目の警告（一部の継ぎ目の一致度が低いため…）には出さない', r1);
		const r3 = await run([true, true, true]);
		assert(r3.warn === MOCK.warn('親A・祖A1・祖A2'), 'T59(9) 3人: 「親A・祖A1・祖A2 の結合の一部が…」', r3);
		assert(jsErrors(sp.errors).length === 0, 'T59(9) コンソールのエラー0', sp.errors);
		await sp.ctx.close();
	});

	/* ── (10) 文面の表と CSV ─────────────────────── */
	await block('T59動画(10) 文面の表（VIDEO_TEXTS）: モックの文と同じ・「含め」を使わない・Handoff の CSV（text-list）の行と一致', async () => {
		const sp = await openSp(375);
		const T = await sp.page.evaluate(() => Object.assign({}, VIDEO_TEXTS));
		const pairs = [['video.entry.label', MOCK.entry], ['video.sheet.title', MOCK.title], ['video.sheet.tag', MOCK.tag], ['video.sheet.note', MOCK.note],
			['video.howto.step1', MOCK.howto[0]], ['video.howto.step2', MOCK.howto[1]], ['video.howto.step3', MOCK.howto[2]], ['video.prog.read', MOCK.steps[0]], ['video.prog.done', MOCK.steps[4]],
			['video.prog.foot', MOCK.foot], ['video.done.next', MOCK.next], ['video.toast.cancel', MOCK.cancel], ['video.err.keep', MOCK.keep],
			['video.err.unreadable', MOCK.err.unreadable], ['video.err.noscreen', MOCK.err.noscreen], ['video.err.fast', MOCK.err.fast]];
		const bad = pairs.filter(([k, v]) => T[k] !== v);
		assert(bad.length === 0, 'T59(10) 文面の表の文がモックの文と同じ（' + pairs.length + '件）', bad.map(([k, v]) => ({ k, table: T[k], mock: v })));
		assert(T['video.prog.person'] === '{人} のフレームを選んでいます' && T['video.err.split'] === MOCK.err.split('{N}') && T['video.warn.person'] === MOCK.warn('{人}') && T['video.exist.text'] === '{セット}には画像が {N}枚入っています。',
			'T59(10) 数や名前が入る文は {人}・{N}・{セット} で書く', T);
		assert(!Object.values(T).some((t) => /含め/.test(t)), 'T59(10) 文面に「含め…」「含められません」を使わない', null);
		// 画面の文がすべて表から来ている（コードの中に同じ文を直書きしていない）: special.html の中で、表の値が表の外に出てこない
		const src = fs.readFileSync(path.join(REPO_ROOT, 'special.html'), 'utf8');
		const tbl = /const VIDEO_TEXTS = \{([\s\S]*?)\r?\n\t\t\};/.exec(src);
		const outside = tbl ? src.replace(tbl[0], '') : src;
		const dup = Object.entries(T).filter(([, v]) => v.length >= 6 && !/\{/.test(v) && outside.includes(v) && !/^(OCR処理|画像を結合)/.test(v));
		assert(tbl && dup.length === 0, 'T59(10) 表の文を表の外に直書きしていない（special.html）', dup);
		// CSV（Handoff の text-list。置き場は .skillset-assets.json の "textList"。無い環境では飛ばす）
		let csvPath = null;
		try { const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.skillset-assets.json'), 'utf8')); if (cfg.textList) csvPath = path.join(cfg.textList, 'T59-video-texts.csv'); } catch { /* 無い */ }
		if (!csvPath || !fs.existsSync(csvPath)) { console.log('     [飛ばした] T59(10) CSV の置き場が設定されていない（.skillset-assets.json の "textList"）'); }
		else {
			const raw = fs.readFileSync(csvPath, 'utf8');
			const bom = raw.charCodeAt(0) === 0xFEFF;
			const rows = parseCsv(raw.replace(/^﻿/, ''));
			const head = rows.shift();
			const byId = new Map(rows.map((r) => [r[0], r]));
			const miss = Object.keys(T).filter((k) => !byId.has(k) || byId.get(k)[4] !== T[k]);
			const extra = rows.filter((r) => !(r[0] in T)).map((r) => r[0]);
			assert(bom && JSON.stringify(head) === JSON.stringify(['ID', 'ツール', '場所', '種類', '今の文', '修正案', 'メモ', '状態']), 'T59(10) CSV は UTF-8（BOM 付き）・列は ID・ツール・場所・種類・今の文・修正案・メモ・状態', head);
			assert(miss.length === 0 && extra.length === 0 && rows.length === Object.keys(T).length, 'T59(10) CSV の行（' + rows.length + '）と文面の表（' + Object.keys(T).length + '）の ID と今の文が一致', { miss, extra });
			assert(rows.every((r) => r[1] === 'UmaStar' && r[5] === '' && r[7] === '未確認'), 'T59(10) CSV のツールは UmaStar・修正案は空・状態は「未確認」', rows.filter((r) => !(r[1] === 'UmaStar' && r[5] === '' && r[7] === '未確認')).map((r) => r[0]));
		}
		await sp.ctx.close();
	});

	/* ── (11) ダーク ──────────────────────────── */
	await block('T59動画(11) 375px ダーク: 入口・小窓・進捗・知らせ・失敗が今の色のトークンで描かれる（地の色が画面の地と違う・字が読める）', async () => {
		const sp = await openSp(375, 'dark');
		const theme = await sp.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
		await sp.page.click('#video-import-btn');
		const sh = await sp.page.evaluate(() => { const s = document.querySelector('.video-sheet'); const cs = getComputedStyle(s); return { bg: cs.backgroundColor, color: cs.color, h: getComputedStyle(s.querySelector('h2')).color }; });
		assert(theme === 'dark' && sh.bg !== 'rgb(255, 255, 255)' && sh.bg !== sh.color, 'T59(11) ダークの小窓は暗い地（--uma-surface）', { theme, sh });
		await sp.page.keyboard.press('Escape');
		assert(jsErrors(sp.errors).length === 0, 'T59(11) コンソールのエラー0', sp.errors);
		await sp.ctx.close();
	});
}

function parseCsv(s) {
	const rows = []; let row = [], cur = '', q = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
		if (c === '"') q = true;
		else if (c === ',') { row.push(cur); cur = ''; }
		else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
		else cur += c;
	}
	if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
	return rows;
}
