// 動画の読み込みの上限と成功後の流れ（T82・2026-11-02。C-259 の 2026-11-02 の決定・C-258 の T69 への回答 7・8・9）の検査。
// run-smoke.mjs の末尾から register98() で呼ばれる（塊の見出しはすべて「T82動画の上限と成功後」で始まる。`npm run test:visual -- --only=T82動画の上限と成功後` で回せる）。
//
// 決め:
//  - 動画の読み込みの待ち（loadeddata）に上限 20秒。当たったら今の「動画を読み込めませんでした…」の文（unreadable）を出す（文は変えない）。取り消し（untilAbort）は今のまま効く。
//  - 取り込みが成功したら、親ごとの画像を見せずに自動で「画像を結合する（OCRしない）」と同じ処理まで進め、結合画像を③のセットの枠の中に出す（モック lab/upload-layout-mock.html の vdone・res=inline）。
//    セットの枠の線は外す。知らせの2行目は「結合画像を作りました。OCRするときは「OCR処理＋画像結合を開始する」を押してください。」。結果の下に「親ごとの画像を見る／隠す」。
//  - ずれの警告があるとき（vwarn）は、結果の箱の中に今の警告・3列も出し、警告の人の列だけサムネイルを全部見せる。
//  - 静止画の取り込みの流れは変えない（結合画像は③に出さない）。
// 動画の代わりに blocks-80（T42）の作り物の画のフレームの列（UmaVideoFrames.canvasSource）を③の流れ（onVideoChosen）に渡す。
// 読み込みの上限は、どの video にも loadeddata を届けない「止まり」のまねで、本物の 20秒を待って見る。
// 変更前の製品（b8f1a89）では、結果が③に出ず・知らせの文が前のままで、読み込みは止まったまま終わらないので、この塊は NG になる（T82 の報告に結果）。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH } from './blocks-80.mjs';

const TEXT = {
	stitched: '結合画像を作りました。OCRするときは「OCR処理＋画像結合を開始する」を押してください。',
	show: '親ごとの画像を見る',
	hide: '親ごとの画像を隠す',
	unreadable: '動画を読み込めませんでした。このブラウザでは再生できない形式かもしれません（例: iPhone で撮った動画を Android で開いたとき）。撮った端末で開き直すか、スクショで入れてください。',
	keep: '入っていた画像はそのままです。',
	cancel: '取り消しました。入っていた画像はそのままです',
	warn: (who) => who + ' の結合の一部がずれているかもしれません。結果の画像を見て、ずれていたら動画を撮り直すか、スクショで入れ直してください。'
};

// どの video にも loadeddata・canplay・canplaythrough を届けず、readyState を 1 までに見せる（読み込みが返ってこない状態のまね）
const STALL = String.raw`
window.__stallVideo = function () {
	const rs = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState');
	Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() { return Math.min(rs.get.call(this), 1); } });
	const orig = Document.prototype.createElement;
	Document.prototype.createElement = function (tag, o) {
		const el = orig.call(this, tag, o);
		if (String(tag).toLowerCase() === 'video') for (const ev of ['loadeddata', 'canplay', 'canplaythrough']) el.addEventListener(ev, (e) => e.stopImmediatePropagation());
		return el;
	};
};
// 360×640 の WebM（1.2秒ほど）
window.__makeWebm = function () {
	return new Promise((resolve, reject) => {
		const c = document.createElement('canvas');
		c.width = 360; c.height = 640;
		const x = c.getContext('2d');
		const paint = () => { x.fillStyle = '#e02020'; x.fillRect(0, 0, 360, 640); };
		paint();
		const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' });
		const parts = [];
		rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
		rec.onstop = () => resolve(new Blob(parts, { type: 'video/webm' }));
		rec.onerror = (e) => reject(e.error || e);
		const iv = setInterval(paint, 30);
		rec.start();
		setTimeout(() => { clearInterval(iv); rec.stop(); }, 1250);
	});
};
`;

export async function register98(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const openSp = async (w = 375, theme) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w < 641 ? 812 : 800 }, EMPTY);
		await sp.page.evaluate((t) => { localStorage.setItem('umaSkillDeck:stepTab', '2'); if (t) localStorage.setItem('uma-tools-theme', t); }, theme || null);
		await reloadReady(sp.page);
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice').catch(() => false)) await sp.page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
		await sp.page.waitForTimeout(300);
		await sp.page.evaluate(() => selectStepTab(2));
		await sp.page.addScriptTag({ content: SYNTH });
		await sp.page.waitForTimeout(150);
		return sp;
	};
	// 入口 → 小窓のボタン → ファイルの選択（開かせて閉じる）→ 作り物の画を渡す。warnWho … 自動の結合の前に、その人の最初の継ぎ目を「確かでない」にする
	const runSynth = async (page, act, warnWho) => {
		await page.click('#video-import-btn');
		await page.waitForSelector('#video-sheet [data-video-act="' + act + '"]');
		await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click('#video-sheet [data-video-act="' + act + '"]')]);
		return page.evaluate(async (warnWho) => {
			if (warnWho != null) {
				const orig = window.buildStitchedSetImage;
				window.buildStitchedSetImage = (si, cb, wm) => { const v = persons[si * 3 + warnWho].video; if (v) v.uncertain = v.uncertain.map((_, k) => k === 0); window.buildStitchedSetImage = orig; return orig(si, cb, wm); };
			}
			return Promise.race([onVideoChosen(__synth.make({}).source), new Promise((r) => setTimeout(() => r('timeout'), 60000))]);
		}, warnWho == null ? null : warnWho);
	};
	const state = (page) => page.evaluate(() => {
		const rr = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) }; };
		const panel = document.querySelector('#personset-A-wrap .upload-set-panel');
		const box = panel && panel.querySelector('.video-result');
		const blk = box && box.firstElementChild;
		const cols = panel && panel.querySelector('.upload-cols');
		const btn = box && box.querySelector('.video-showcols');
		const sum = document.getElementById('video-summary');
		const drawer = document.getElementById('stitch-drawer');
		const clear = panel && panel.querySelector('.upload-set-clear');
		return {
			sum: sum ? sum.textContent.trim() : null,
			box: !!box, afterClear: !!(box && clear && box.previousElementSibling === clear),
			head: blk ? (blk.querySelector('p.text-xs.font-bold') || {}).textContent : null,
			png: blk ? (blk.querySelector('a') || {}).textContent : null, img: !!(blk && blk.querySelector('img') && blk.querySelector('img').src.startsWith('data:image/png')),
			warn: blk && blk.querySelector('.video-warn') ? blk.querySelector('.video-warn').textContent.trim() : null,
			panelBorder: panel ? getComputedStyle(panel).borderTopColor : null, hasClass: !!(panel && panel.classList.contains('video-has-result')),
			colsShown: !!(cols && cols.offsetParent !== null),
			btn: btn ? { t: btn.textContent, exp: btn.getAttribute('aria-expanded'), r: rr(btn), inBlk: btn.parentElement === blk, under: !!(blk.querySelector('img').compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) } : null,
			tiles: [0, 1, 2].map((i) => !!document.querySelector('.person-image-list[data-person="' + i + '"] .video-tile')),
			thumbs: [0, 1, 2].map((i) => document.querySelectorAll('.person-image-list[data-person="' + i + '"] > div.group').length),
			n: persons.slice(0, 3).map((p) => p.files.length),
			boxR: rr(box), clearR: rr(clear && clear.querySelector('button')), panelR: rr(panel),
			drawerOpen: !!(drawer && drawer.classList.contains('open')), drawerImg: !!document.querySelector('#stitch-result-content img'),
			prog: !!document.getElementById('video-progress'), busy: !!document.querySelector('.video-busy'),
			stitchDis: document.getElementById('stitch-btn').disabled, entryDis: document.getElementById('video-import-btn').disabled,
			sw: document.documentElement.scrollWidth, iw: window.innerWidth
		};
	});

	/* ── (1) 成功 → 自動で結合 → ③の中に結合画像（vdone） ── */
	for (const w of [375, 1280]) {
		await block(`T82動画の上限と成功後(1) ${w}px 取り込みが成功すると、自動で結合して③のセットの枠の中に結合画像を出す・3列は隠す・枠の線を外す・知らせの2行目・「親ごとの画像を見る／隠す」`, async () => {
			const sp = await openSp(w);
			const lineBefore = await sp.page.evaluate(() => getComputedStyle(document.querySelector('#personset-A-wrap .upload-set-panel')).borderTopColor);
			const res = await runSynth(sp.page, 'pick');
			const m = await state(sp.page);
			const total = m.n.reduce((a, b) => a + b, 0);
			assert(res && res.ok === true && res.stitched === true, `T82(1) ${w}px 取り込みが成功し、自動の結合で結合画像ができた`, res);
			assert(m.sum === '動画から ' + total + '枚 を入れました（親A ' + m.n[0] + '枚・祖A1 ' + m.n[1] + '枚・祖A2 ' + m.n[2] + '枚）。' + TEXT.stitched, `T82(1) ${w}px 知らせの2行目は「${TEXT.stitched}」`, m.sum);
			assert(m.box && m.afterClear && m.head === '親Aセット' && m.png === 'PNGをダウンロード' && m.img && m.warn === null, `T82(1) ${w}px セットの枠の中（「セットをクリア」のすぐ後）に結合の結果の箱（見出し「親Aセット」・PNGをダウンロード・結合画像）`, m);
			assert(!m.colsShown, `T82(1) ${w}px 親ごとの画像（3列）は見せない`, m.colsShown);
			assert(m.hasClass && m.panelBorder === 'rgba(0, 0, 0, 0)' && lineBefore !== m.panelBorder, `T82(1) ${w}px セットの枠の線を外す（前は ${lineBefore}）`, { before: lineBefore, after: m.panelBorder });
			assert(m.boxR && m.clearR && m.boxR.y >= m.clearR.bottom && m.boxR.x >= m.panelR.x && m.boxR.right <= m.panelR.right, `T82(1) ${w}px 結果の箱は「セットをクリア」の下から始まり、セットの枠の中に収まる`, { box: m.boxR, clear: m.clearR, panel: m.panelR });
			assert(m.btn && m.btn.t === TEXT.show && m.btn.exp === 'false' && m.btn.inBlk && m.btn.under && m.btn.r.h >= 44, `T82(1) ${w}px 結果の下に「${TEXT.show}」（押せる高さ 44px 以上・aria-expanded=false）`, m.btn);
			assert(!m.drawerOpen && !m.drawerImg, `T82(1) ${w}px 結合画像の引き出しは開かない・中身も変えない`, m);
			assert(!m.prog && !m.busy && !m.stitchDis && !m.entryDis, `T82(1) ${w}px 終わると進捗の箱が消え、処理のボタンと入口はまた押せる`, m);
			assert(m.sw <= m.iw, `T82(1) ${w}px 横スクロールなし`, m);
			await sp.page.click('#personset-A-wrap .video-showcols');
			const s = await state(sp.page);
			assert(s.colsShown && s.btn.t === TEXT.hide && s.btn.exp === 'true' && s.tiles.every(Boolean), `T82(1) ${w}px 押すと3列（「動画から N枚」の形）が出て「${TEXT.hide}」になる`, s);
			await sp.page.click('#personset-A-wrap .video-showcols');
			const h = await state(sp.page);
			assert(!h.colsShown && h.btn.t === TEXT.show && h.btn.exp === 'false', `T82(1) ${w}px もう一度押すと隠れて「${TEXT.show}」に戻る`, h);
			assert(jsErrors(sp.errors).length === 0, `T82(1) ${w}px コンソールのエラー0`, sp.errors);
			await sp.ctx.close();
		});
	}

	/* ── (2) ずれの警告（vwarn） ── */
	await block('T82動画の上限と成功後(2) ずれの警告があるとき: 結果の箱の中に警告・3列も出す・警告の人の列だけサムネイルを全部見せる（ほかは「動画から N枚」のまま）', async () => {
		const sp = await openSp(375);
		const res = await runSynth(sp.page, 'pick', 1);
		const m = await state(sp.page);
		assert(res && res.ok === true && res.stitched === true, 'T82(2) 取り込みが成功し、結合画像ができた', res);
		assert(m.box && m.warn === TEXT.warn('祖A1') && m.img, 'T82(2) 結果の箱の中に「祖A1 の結合の一部が…」の警告', m.warn);
		assert(m.colsShown && !m.btn, 'T82(2) 3列も出す（「親ごとの画像を見る」は出さない）', m);
		assert(m.tiles[0] && !m.tiles[1] && m.tiles[2] && m.thumbs[1] === m.n[1] && m.thumbs[0] === 0 && m.thumbs[2] === 0, 'T82(2) 警告の人（祖A1）だけサムネイルを全部、親A・祖A2 は「動画から N枚」のまま', m);
		assert(m.sum && m.sum.endsWith(TEXT.stitched) && m.hasClass, 'T82(2) 知らせの2行目は同じ文・セットの枠の線は外す', m);
		assert(jsErrors(sp.errors).length === 0, 'T82(2) コンソールのエラー0', sp.errors);
		await sp.ctx.close();
	});

	/* ── (3) 枠を触ると結果は外れる・静止画の流れは変えない ── */
	await block('T82動画の上限と成功後(3) 枠の画像を消す／「セットをクリア」で③の中の結合画像は外れ、3列と枠の線が戻る・静止画を入れただけでは③に結合画像を出さない', async () => {
		const sp = await openSp(375);
		await runSynth(sp.page, 'pick');
		await sp.page.evaluate(() => removePersonImage(2, persons[2].files.length - 1));
		const a = await state(sp.page);
		assert(!a.box && !a.hasClass && a.colsShown && a.sum === null, 'T82(3) 枠の画像を消すと、③の中の結合画像と知らせは外れ、3列が出る', a);
		await runSynth(sp.page, 'replace');
		await sp.page.evaluate(() => clearPersonSet(0));
		const b = await state(sp.page);
		assert(!b.box && !b.hasClass && b.colsShown, 'T82(3) 「セットをクリア」でも外れる', b);
		await sp.page.evaluate(() => { const f = new File([new Uint8Array([137, 80, 78, 71])], 's.png', { type: 'image/png' }); addPersonFiles(0, [f]); });
		const c = await state(sp.page);
		assert(!c.box && c.colsShown && c.thumbs[0] === 1, 'T82(3) 静止画を入れただけでは③に結合画像を出さない（今の流れのまま）', c);
		assert(jsErrors(sp.errors).length === 0, 'T82(3) コンソールのエラー0', sp.errors);
		await sp.ctx.close();
	});

	/* ── (4) 読み込みの待ちの上限 20秒 ── */
	await block('T82動画の上限と成功後(4) 読み込みが返ってこないとき: 20秒で打ち切って「動画を読み込めませんでした…」・枠は元のまま・その前なら「取り消す」が効く', async () => {
		const sp = await openSp(375);
		const { page } = sp;
		await page.addScriptTag({ content: STALL });
		const unit = await page.evaluate(async () => {
			const blob = await __makeWebm();
			window.__blob = blob;
			__stallVideo();
			const t0 = performance.now();
			let code = null;
			try { const s = await Promise.race([UmaVideoFrames.videoSource(blob, { loadTimeoutMs: 600 }), new Promise((_, rej) => setTimeout(() => rej(new Error('test-timeout')), 5000))]); s.close(); } catch (e) { code = e.code || e.message; }
			return { code, ms: Math.round(performance.now() - t0), limit: UmaVideoFrames.LOAD_TIMEOUT_MS, videos: document.querySelectorAll('video').length };
		});
		assert(unit.limit === 20000, 'T82(4) 読み込みの待ちの上限は 20000ms（UmaVideoFrames.LOAD_TIMEOUT_MS）', unit);
		assert(unit.code === 'load-timeout' && unit.ms >= 550 && unit.ms < 3000 && unit.videos === 0, 'T82(4) 上限を超えると code=load-timeout で返り、video はページに残らない', unit);
		// 画像を入れたセットに「置き換えて…」で、止まる動画を入れる → 20秒で打ち切り
		await page.evaluate(() => { [0, 1, 2].forEach((r) => addPersonFiles(r, [new File([new Uint8Array([137, 80, 78, 71, r])], 'k' + r + '.png', { type: 'image/png' })])); window.__before = persons.map((p) => p.files.slice()); });
		await page.click('#video-import-btn');
		await page.waitForSelector('#video-sheet [data-video-act="replace"]');
		await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click('#video-sheet [data-video-act="replace"]')]);
		const r = await page.evaluate(async () => {
			const t0 = performance.now();
			const res = await Promise.race([onVideoChosen(new File([__blob], 'rec.webm', { type: 'video/webm' })), new Promise((rs) => setTimeout(() => rs('timeout'), 40000))]);
			const e = document.getElementById('video-error');
			return { res, ms: Math.round(performance.now() - t0), err: e ? e.querySelector('.video-error-text').textContent : null, prog: !!document.getElementById('video-progress'),
				same: persons.every((p, i) => p.files.length === window.__before[i].length && p.files.every((f, k) => f === window.__before[i][k])), videos: document.querySelectorAll('video').length,
				log: (window.devGeometry || []).filter((s) => String(s).startsWith('[動画]')).slice(-1)[0] };
		});
		assert(r.res !== 'timeout' && r.res.ok === false && r.res.error === 'load-timeout' && r.ms >= 19500 && r.ms < 26000, 'T82(4) 20秒で打ち切る（code=load-timeout・かかった時間 19.5〜26秒）', r);
		assert(r.err === TEXT.unreadable + TEXT.keep && !r.prog && r.same && r.videos === 0, 'T82(4) 今の「動画を読み込めませんでした…」＋「入っていた画像はそのままです。」・進捗の箱は消え、枠は元のまま', r);
		// 上限の前に「取り消す」を押すと、今までどおり取り消せる
		await page.click('#video-import-btn');
		await page.waitForSelector('#video-sheet [data-video-act="replace"]');
		await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click('#video-sheet [data-video-act="replace"]')]);
		await page.evaluate(() => { window.__run = onVideoChosen(new File([__blob], 'rec.webm', { type: 'video/webm' })); });
		await page.waitForSelector('#video-progress [data-video-act="abort"]');
		await page.waitForTimeout(1000);
		const t1 = Date.now();
		await page.click('#video-progress [data-video-act="abort"]');
		const c = await page.evaluate(async () => ({ res: await window.__run, toast: document.getElementById('toast-message').textContent, err: !!document.getElementById('video-error') }));
		assert(c.res.aborted === true && Date.now() - t1 < 3000 && c.toast === TEXT.cancel && !c.err, 'T82(4) 読み込みの待ちの途中でも「取り消す」でその場で止まる（トースト「' + TEXT.cancel + '」）', c);
		assert(jsErrors(sp.errors).filter((e) => !/動画の読み込みが \d+ms で終わらない/.test(e)).length === 0, 'T82(4) コンソールのエラー0（打ち切りの記録を除く）', sp.errors);
		await sp.ctx.close();
	});
}
