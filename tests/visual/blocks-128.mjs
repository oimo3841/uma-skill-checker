// T117（2026-11-07・Chat 381〜385）: 動画の結合を取り込み直さずに作り直す（UmaStar の③と引き出しの「画像を更新」）の検査。
// run-smoke.mjs の末尾から register128() で呼ばれる（塊の見出しはすべて「T117」で始まる。`npm run test:visual -- --only=T117` で回せる）。
//
//  - 381: OCR の前に③で設定を変えたら、③の結合画像の所の「画像を更新」で作り直す。チェックを変えただけでは作り直さない。
//  - 382: 3列｜2列だけでなく6つのチェックも同じ扱い。
//  - 383: OCR の後の引き出しの「画像を更新」も動画から入れた人で作り直せる（composePerson を通り、動画のずれの値を使う）。
// 取り込み直さないことは selectFrames の呼び出しの数、動画のずれを使うことは composePerson と stitchOnePerson の呼び出しの数で見る。
// 動画は blocks-80 の作り物（SYNTH）。実物の動画の高さは tests/video/run-video-frames-local.mjs --special が見る。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH } from './blocks-80.mjs';
import { pickVideo } from './lib/video-entry.mjs';

const OFF = { marker: false, roster: false, factor: false, sp: false, table: false, title: true, cols: 3 };
const LABEL = '画像を更新';
const BUSY = '更新中…';
const DONE = '結合画像を更新しました';
const NOTE_VIDEO = '画像や集計の設定が変わったため、「OCR処理を開始する」からやり直してください。';
const CHECKS = ['marker', 'roster', 'factor', 'sp', 'table', 'title'];

export async function register128(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

	const open = async ({ w = 390, h = 844, mode = 'video', parts = OFF, theme = null } = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		await sp.page.evaluate(({ mode, parts, theme }) => {
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			localStorage.setItem('uma-special-upload-mode', mode);
			localStorage.setItem('uma-special-stitch-parts', JSON.stringify(parts));
			if (theme) localStorage.setItem('uma-tools-theme', theme);
		}, { mode, parts, theme });
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await sp.page.evaluate(() => { selectStepTab(2); window.scrollTo(0, 0); });
		await sp.page.addScriptTag({ content: SYNTH });
		// 呼び出しの数を数える（作り直しが動画のずれで組み立て、取り込み直さないことを見る）
		await sp.page.evaluate(() => {
			window.__n = { compose: 0, stitchOne: 0, select: 0, ocr: 0 };
			// 部品は Object.freeze なので、写しに差し替える
			const vf = window.UmaVideoFrames = Object.assign({}, UmaVideoFrames);
			const c = vf.composePerson, s = vf.selectFrames, one = stitchOnePerson, pi = processImages;
			vf.composePerson = function () { window.__n.compose++; return c.apply(this, arguments); };
			vf.selectFrames = function () { window.__n.select++; return s.apply(this, arguments); };
			stitchOnePerson = function () { window.__n.stitchOne++; return one.apply(this, arguments); };
			processImages = function () { window.__n.ocr++; return pi.apply(this, arguments); };
		});
		return sp;
	};
	const runVideo = async (page) => {
		await pickVideo(page);
		return page.evaluate(() => Promise.race([onVideoChosen(__synth.make({}).source), new Promise((r) => setTimeout(() => r('timeout'), 90000))]));
	};
	/** セット setIdx の③の状態 */
	const read = (page, setIdx = 0) => page.evaluate((setIdx) => {
		const box = document.querySelector('#personset-' + PERSON_SETS[setIdx].id + '-wrap .video-result');
		const btn = box && box.querySelector('[data-video-refresh]');
		const img = box && box.querySelector('img');
		const note = box && box.querySelector('.video-refresh-note');
		return {
			box: !!box, btn: !!btn, disabled: btn ? btn.disabled : null, state: btn ? btn.getAttribute('data-state') : null, label: btn ? btn.textContent.trim() : null,
			src: img ? img.src : null, note: note && !note.hidden ? note.textContent : null, n: Object.assign({}, window.__n),
			stitchReady: !!sectionReady.stitch, lastShown: !!lastStitchShown, drawerImgs: document.querySelectorAll('#stitch-result-content img').length,
			openDrawer: openDrawerKey
		};
	}, setIdx);
	const imgSize = (page, src) => page.evaluate(async (src) => { const i = new Image(); i.src = src; await i.decode(); return { w: i.naturalWidth, h: i.naturalHeight }; }, src);
	/** 押して、終わるまで待つ */
	const pressStep3 = async (page, setIdx = 0) => {
		await page.click('#personset-' + (setIdx ? 'B' : 'A') + '-wrap [data-video-refresh]');
		await page.waitForFunction(() => videoRefreshBusy < 0 && !stitchInProgress, null, { timeout: 30000 });
		await page.waitForTimeout(50);
	};
	const setCols = (page, n) => page.click(`#stitch-parts-panel [data-stitch-cols="${n}"]`);
	const ocrLikeStitch = (page) => page.evaluate(async () => {
		stitchSnapshot = captureStitchSnapshot();
		stitchSnapshot.results = [null, null, null, null, null, null];
		await runImageStitching({ keepClosed: true, quiet: true, withMarks: true });
	});

	/* ── OCR の前の③: 3列⇄2列 ── */
	for (const [w, h] of [[390, 844], [1280, 900]]) {
		await block(`T117(1) ${w}px OCR の前の③: 取り込み直後は押せない → 2列にしても作り直さない → 押すと2列に → 3列に戻すと元の画像`, async () => {
			const sp = await open({ w, h });
			const { page, errors } = sp;
			const res = await runVideo(page);
			assert(res && res.ok === true && res.stitched === true, `T117(1) ${w}px 自動の結合は今のまま動く`, res);
			const s0 = await read(page);
			assert(s0.btn && s0.disabled === true && s0.state === 'same' && s0.label === LABEL, `T117(1) ${w}px ボタンが出て、設定が同じなので押せない`, s0);
			assert(s0.n.select === 1 && s0.n.compose === 3 && s0.n.stitchOne === 0, `T117(1) ${w}px 取り込みは1回・3人とも composePerson`, s0.n);
			assert(!s0.stitchReady && !s0.lastShown && s0.drawerImgs === 0, `T117(1) ${w}px 取り込みでは引き出しの中身は変わらない`, s0);
			const geo = await page.evaluate(() => {
				const b = document.querySelector('#personset-A-wrap [data-video-refresh]').getBoundingClientRect();
				const d = document.querySelector('#personset-A-wrap .video-dl-btn').getBoundingClientRect();
				return { sameRow: Math.abs((b.top + b.height / 2) - (d.top + d.height / 2)) <= 1, left: b.right <= d.left, h: b.height, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
			});
			assert(geo.sameRow && geo.left && geo.h <= 44, `T117(1) ${w}px ダウンロードの左・同じ行`, geo);
			assert(geo.sw <= geo.cw, `T117(1) ${w}px 横スクロールなし`, geo);

			await setCols(page, 2);
			const s1 = await read(page);
			assert(s1.src === s0.src && s1.n.compose === 3, `T117(1) ${w}px 変えただけでは作り直さない`, s1.n);
			assert(s1.disabled === false && s1.state === 'ready', `T117(1) ${w}px 設定が違うと押せる`, s1);

			await page.evaluate(() => window.scrollTo(0, 120));
			const y0 = await page.evaluate(() => window.scrollY);
			await pressStep3(page);
			const s2 = await read(page);
			const y1 = await page.evaluate(() => window.scrollY);
			const sz0 = await imgSize(page, s0.src), sz2 = await imgSize(page, s2.src);
			assert(s2.src !== s0.src && sz2.w !== sz0.w, `T117(1) ${w}px 2列の画像に作り直された`, { sz0, sz2 });
			assert(s2.n.select === 1 && s2.n.compose === 6 && s2.n.stitchOne === 0 && s2.n.ocr === 0, `T117(1) ${w}px 取り込み直さず、動画のずれで組み立て、OCR は回さない`, s2.n);
			assert(s2.btn && s2.disabled === true && s2.state === 'same' && s2.label === LABEL, `T117(1) ${w}px 作り直したあとは押せない`, s2);
			assert(!s2.stitchReady && !s2.lastShown && s2.drawerImgs === 0 && !s2.openDrawer, `T117(1) ${w}px 引き出しは開かず、中身も変えない`, s2);
			assert(y1 === y0, `T117(1) ${w}px スクロール位置が保たれる`, { y0, y1 });
			assert(await page.evaluate((t) => document.getElementById('toast-message').textContent === t, DONE), `T117(1) ${w}px トースト「${DONE}」`, null);

			await setCols(page, 3);
			const s3 = await read(page);
			assert(s3.state === 'ready' && s3.disabled === false, `T117(1) ${w}px 3列に戻すと押せる`, s3);
			await pressStep3(page);
			const s4 = await read(page);
			assert(s4.src === s0.src, `T117(1) ${w}px 3列に戻して作り直すと最初の画像と同じ`, null);
			assert(s4.n.select === 1 && s4.n.compose === 9, `T117(1) ${w}px ここでも取り込み直さない`, s4.n);
			assert(jsErrors(errors).length === 0, `T117(1) ${w}px コンソールエラー0`, jsErrors(errors).slice(0, 3));
			await sp.ctx.close();
		});
	}

	/* ── 6つのチェック ── */
	await block('T117(2) OCR の前の③: 6つのチェックも同じ扱い（変えると押せる・戻すと押せない・押すと今の設定で作り直す）', async () => {
		const sp = await open({ w: 1280, h: 900 });
		const { page, errors } = sp;
		await runVideo(page);
		for (const k of CHECKS) {
			const box = `#stitch-parts-panel input[data-stitch-part-key="${k}"]`;
			const before = await read(page);
			await page.click(box);
			const on = await read(page);
			assert(on.state === 'ready' && on.disabled === false && on.src === before.src, `T117(2) ${k}: 変えると押せて、画像はそのまま`, on.state);
			await page.click(box);
			const back = await read(page);
			assert(back.state === 'same' && back.disabled === true, `T117(2) ${k}: 戻すと押せない`, back.state);
			await page.click(box);
			await pressStep3(page);
			const made = await read(page);
			assert(made.state === 'same' && made.n.compose === before.n.compose + 3 && made.n.select === 1, `T117(2) ${k}: 押すと作り直す（取り込み直さない）`, made.n);
			if (k === 'title') assert(made.src !== before.src, 'T117(2) title: タイトルのバーを外すと画像が変わる', null);
			await page.click(box);
			await pressStep3(page);
		}
		assert(jsErrors(errors).length === 0, 'T117(2) コンソールエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ── 押せない条件 ── */
	await block('T117(3) OCR の前の③の押せない条件: 処理中・画像の並びが変わった（案内）・画像を消すとボタンごと無くなる', async () => {
		const sp = await open({ w: 390, h: 844 });
		const { page, errors } = sp;
		await runVideo(page);
		await setCols(page, 2);
		// 処理中の印
		for (const flag of ['stitchInProgress', 'combinedInProgress']) {
			const d = await page.evaluate((flag) => {
				const set = (v) => { if (flag === 'stitchInProgress') stitchInProgress = v; else combinedInProgress = v; };
				set(true); updateStitchRefreshUi();
				const r = document.querySelector('#personset-A-wrap [data-video-refresh]').disabled;
				set(false); updateStitchRefreshUi();
				return { during: r, after: document.querySelector('#personset-A-wrap [data-video-refresh]').disabled };
			}, flag);
			assert(d.during === true && d.after === false, `T117(3) ${flag} の間は押せない`, d);
		}
		const vb = await page.evaluate(() => { videoBusy = { setIdx: 1 }; updateStitchRefreshUi(); const r = document.querySelector('#personset-A-wrap [data-video-refresh]').disabled; videoBusy = null; updateStitchRefreshUi(); return r; });
		assert(vb === true, 'T117(3) 取り込みの間は押せない', vb);
		// 作っている間: 「更新中…」・二重に走らない・OCR のボタンも押せない
		const during = await page.evaluate(async () => {
			const vf = UmaVideoFrames, c = vf.composePerson;
			let go;
			const gate = new Promise((r) => { go = r; });
			vf.composePerson = async function () { await gate; return c.apply(this, arguments); };
			const p = refreshVideoResult(0);
			const btn = document.querySelector('#personset-A-wrap [data-video-refresh]');
			const r = { label: btn.textContent.trim(), disabled: btn.disabled, process: document.getElementById('process-stitch-btn').disabled };
			const before = window.__n.compose;
			await refreshVideoResult(0);   // 二重に押しても何もしない
			r.second = window.__n.compose === before;
			go();
			await p;
			vf.composePerson = c;
			return r;
		});
		assert(during.label === BUSY && during.disabled === true && during.process === true && during.second, 'T117(3) 作っている間は「更新中…」で押せない（OCR のボタンも）', during);
		const after = await read(page);
		assert(after.label === LABEL && after.state === 'same', 'T117(3) 終わると文が戻る', after);
		// 画像の並びが変わった（画面の操作では③の画像ごと外れるので、並びだけを変えて判定を見る）
		await setCols(page, 3);
		const stale = await page.evaluate(async () => {
			const list = persons[0].files, keep = list.slice();
			persons[0].files = list.slice().reverse();
			updateStitchRefreshUi();
			const b = document.querySelector('#personset-A-wrap [data-video-refresh]');
			const note = document.querySelector('#personset-A-wrap .video-refresh-note');
			const r = { state: b.getAttribute('data-state'), disabled: b.disabled, note: note.hidden ? null : note.textContent };
			const before = window.__n.compose;
			await refreshVideoResult(0);
			r.noop = window.__n.compose === before;
			persons[0].files = keep;
			updateStitchRefreshUi();
			r.back = b.getAttribute('data-state');
			r.noteBack = note.hidden;
			return r;
		});
		assert(stale.state === 'stale' && stale.disabled === true && stale.note === NOTE_VIDEO && stale.noop, 'T117(3) 画像の並びが変わると押せず、引き出しと同じ案内を出す', stale);
		assert(stale.back === 'ready' && stale.noteBack, 'T117(3) 並びを戻すと案内が消える', stale);
		// 作っている間にセットをクリアしたら、古い材料の画像を出さない
		const cleared = await page.evaluate(async () => {
			const vf = UmaVideoFrames, c = vf.composePerson;
			let go;
			const gate = new Promise((r) => { go = r; });
			vf.composePerson = async function () { await gate; return c.apply(this, arguments); };
			const list = persons.map((p) => ({ files: p.files, video: p.video }));
			const p = refreshVideoResult(0);
			clearPersonSet(0);
			go();
			await p;
			vf.composePerson = c;
			return { box: !!document.querySelector('#personset-A-wrap .video-result'), n: list.length, restitch: videoRestitch[0], busy: videoRefreshBusy, sip: stitchInProgress };
		});
		assert(!cleared.box && cleared.restitch === null && cleared.busy === -1 && !cleared.sip, 'T117(3) 作っている間にクリアしたら古い画像を出さない', cleared);
		assert(jsErrors(errors).length === 0, 'T117(3) コンソールエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T117(4) OCR の前の③: 画像を消すと③の画像とボタンが無くなる／作り直しに失敗したら今の画像を残す', async () => {
		const sp = await open({ w: 390, h: 844 });
		const { page, errors } = sp;
		await runVideo(page);
		await setCols(page, 2);
		const s0 = await read(page);
		const failed = await page.evaluate(async () => {
			const vf = UmaVideoFrames, c = vf.composePerson;
			vf.composePerson = async function () { throw new Error('作り物の失敗'); };
			await refreshVideoResult(0);
			vf.composePerson = c;
			return { busy: videoRefreshBusy, sip: stitchInProgress };
		});
		const s1 = await read(page);
		assert(s1.src === s0.src && s1.state === 'ready' && s1.disabled === false && failed.busy === -1 && !failed.sip, 'T117(4) 失敗しても今の画像を残し、また押せる', s1.state);
		await page.evaluate(() => removePersonImage(0, 0));
		const s2 = await read(page);
		assert(!s2.box && !s2.btn, 'T117(4) 画像を消すと③の画像とボタンが無くなる', s2);
		assert(jsErrors(errors).length === 0, 'T117(4) コンソールエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ── 親A・親B ── */
	await block('T117(5) 親A・親B の両方に動画の結果があるとき: ボタンはセットごと・押したセットだけ作り直す', async () => {
		const sp = await open({ w: 1280, h: 900 });
		const { page, errors } = sp;
		await runVideo(page);
		await page.evaluate(() => selectPersonSet(1));
		await runVideo(page);
		const a0 = await read(page, 0), b0 = await read(page, 1);
		assert(a0.btn && b0.btn && a0.state === 'same' && b0.state === 'same', 'T117(5) 両方のセットにボタンが出る', { a: a0.state, b: b0.state });
		await setCols(page, 2);
		const a1 = await read(page, 0), b1 = await read(page, 1);
		assert(a1.state === 'ready' && b1.state === 'ready', 'T117(5) 設定を変えると両方押せる', { a: a1.state, b: b1.state });
		await page.evaluate(() => refreshVideoResult(1));
		const a2 = await read(page, 0), b2 = await read(page, 1);
		assert(b2.state === 'same' && b2.src !== b1.src, 'T117(5) 親B を押すと親B だけ作り直す', b2.state);
		assert(a2.state === 'ready' && a2.src === a1.src, 'T117(5) 親A はそのまま・まだ押せる', a2.state);
		assert(b2.n.compose === a0.n.compose + 3, 'T117(5) 作り直すのは3人ぶん', b2.n);
		assert(jsErrors(errors).length === 0, 'T117(5) コンソールエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ── OCR の後: 引き出し ── */
	await block('T117(6) OCR の後の引き出し: 動画から入れた人で 3列→2列・2列→3列・チェックが作り直せる（composePerson を通る）。③の画像も一緒に変わり、③のボタンは出ない', async () => {
		const sp = await open({ w: 1280, h: 900 });
		const { page, errors } = sp;
		await runVideo(page);
		await ocrLikeStitch(page);
		const s0 = await read(page);
		assert(s0.box && !s0.btn && s0.drawerImgs === 1 && s0.stitchReady, 'T117(6) OCR のあと③のボタンは無く、引き出しに画像がある', s0);
		await page.evaluate(() => openDrawer('stitch'));
		await page.waitForTimeout(300);
		await page.click('#stitch-drawer-fab');
		const drawerSrc = () => page.evaluate(() => document.querySelector('#stitch-result-content img').src);
		const refresh = async () => {
			await page.click('#stitch-refresh-btn');
			await page.waitForFunction(() => !stitchRefreshBusy && !stitchInProgress, null, { timeout: 30000 });
			await page.waitForTimeout(50);
		};
		const flow = async (name, change) => {
			const before = await read(page);
			const src = await drawerSrc();
			await page.click(change);
			const st = await page.evaluate(() => ({ state: stitchRefreshState(), disabled: document.getElementById('stitch-refresh-btn').disabled }));
			assert(st.state === 'ready' && !st.disabled, `T117(6) ${name}: 変えると押せる`, st);
			assert(await drawerSrc() === src, `T117(6) ${name}: 変えただけでは作り直さない`, null);
			await refresh();
			const after = await read(page);
			const src2 = await drawerSrc();
			assert(after.n.compose === before.n.compose + 3 && after.n.stitchOne === 0 && after.n.select === 1 && after.n.ocr === 0, `T117(6) ${name}: 動画のずれで作り直す（取り込み直さない・OCR なし）`, after.n);
			assert(src2 !== src && after.src === src2, `T117(6) ${name}: 引き出しと③が同じ新しい画像になる`, null);
			assert(!after.btn, `T117(6) ${name}: ③のボタンは出ないまま`, after.btn);
			const st2 = await page.evaluate(() => stitchRefreshState());
			assert(st2 === 'same', `T117(6) ${name}: 作り直したあとは押せない`, st2);
			return src2;
		};
		const three = await drawerSrc();
		const two = await flow('3列→2列', '#stitch-parts-panel-drawer [data-stitch-cols="2"]');
		const szTwo = await imgSize(page, two), szThree = await imgSize(page, three);
		assert(szTwo.w !== szThree.w, 'T117(6) 2列の画像は3列と幅が違う', { szTwo, szThree });
		const back = await flow('2列→3列', '#stitch-parts-panel-drawer [data-stitch-cols="3"]');
		assert(back === three, 'T117(6) 3列に戻すと最初の画像と同じ', null);
		await flow('タイトルのバー', '#stitch-parts-panel-drawer input[data-stitch-part-key="title"]');
		assert(await page.evaluate((t) => document.getElementById('toast-message').textContent === t, DONE), `T117(6) トースト「${DONE}」`, null);
		assert(jsErrors(errors).length === 0, 'T117(6) コンソールエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T117(7) OCR の後に取り込み直すと③のボタンが戻り、引き出しは stale の案内になる', async () => {
		const sp = await open({ w: 1280, h: 900 });
		const { page, errors } = sp;
		await runVideo(page);
		await ocrLikeStitch(page);
		await runVideo(page);
		const s = await read(page);
		const d = await page.evaluate(() => ({ state: stitchRefreshState(), note: document.getElementById('stitch-refresh-note').hidden }));
		assert(s.btn && s.state === 'same' && s.n.select === 2, 'T117(7) 取り込み直すと③のボタンが戻る', s.state);
		assert(d.state === 'stale' && d.note === false, 'T117(7) 引き出しは stale', d);
		assert(jsErrors(errors).length === 0, 'T117(7) コンソールエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ── 静止画モード ── */
	await block('T117(8) 静止画モードの流れは変わらない: ③に結合画像もボタンも出ない・結合は stitchOnePerson・引き出しの更新はそのまま', async () => {
		const sp = await open({ w: 1280, h: 900, mode: 'shot' });
		const { page, errors } = sp;
		await page.evaluate(async () => {
			// 結合の入口と③の動きを見る。結合そのものは作り物（静止画の継ぎ目の検査は別の塊）
			const inner = stitchOnePerson;
			stitchOnePerson = async function () {
				window.__n.stitchOne++;
				const c = document.createElement('canvas'); c.width = 720; c.height = 1000;
				const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 720, 1000);
				return c;
			};
			const c = document.createElement('canvas'); c.width = 8; c.height = 8;
			const b = await new Promise((r) => c.toBlob(r, 'image/png'));
			addPersonFiles(0, [new File([b], 's1.png', { type: 'image/png' })]);
		});
		await page.click('#stitch-btn');
		await page.waitForFunction(() => !stitchInProgress, null, { timeout: 30000 });
		const m = await page.evaluate(() => ({ video: !!document.querySelector('.video-result'), btn: !!document.querySelector('[data-video-refresh]'), drawer: document.querySelectorAll('#stitch-result-content img').length, n: Object.assign({}, window.__n), state: stitchRefreshState(), label: document.getElementById('stitch-refresh-label').textContent }));
		assert(!m.video && !m.btn, 'T117(8) ③に結合画像もボタンも出ない', m);
		assert(m.n.stitchOne === 1 && m.n.compose === 0 && m.drawer === 1, 'T117(8) 結合は今までどおり stitchOnePerson で引き出しに出る', m);
		assert(m.state === 'same' && m.label === LABEL, 'T117(8) 引き出しの更新の状態は今のまま', m);
		assert(jsErrors(errors).length === 0, 'T117(8) コンソールエラー0', jsErrors(errors).slice(0, 3));
		await sp.ctx.close();
	});
}
