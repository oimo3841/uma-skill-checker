// 動画の取り消し（T68・2026-11-02。iPhone の αテストで、動画の読み込みの段で止まったまま「取り消す」が効かなかった）の検査。
// run-smoke.mjs の末尾から register92() で呼ばれる（塊の見出しはすべて「T68動画の取り消し」で始まる。`npm run test:visual -- --only=T68動画の取り消し` で回せる）。
//
// 見ること: 処理がどの段で止まっていても、「取り消す」を押すとすぐ取り消され、枠は元のまま・トースト「取り消しました。入っていた画像はそのままです」・
// 進捗の箱が消え、入口と枠がまた押せる。止まり方は3つ作る:
//  (1) 動画の読み込みが返ってこない（video の src を入れても何も起きない＝ loadeddata も error も来ない。iPhone で起きたこと）
//  (2) フレームの出どころの drawAt（シークの待ち）が返ってこず、取り消しの合図も聞かない
//  (3) UmaVideoFrames.canvasSource の draw が返ってこない
// 変更前（T68 の前）の製品では (1)〜(3) とも取り消しても処理が終わらず、この塊は NG になる（T68 の報告に結果）。
import { reloadReady } from './lib/page-ready.mjs';
import { openVideoSheet } from './lib/video-entry.mjs';

const CANCEL = '取り消しました。入っていた画像はそのままです';

export async function register92(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const closeNotices = async (page) => {
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
	};
	const openSp = async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		await sp.page.evaluate(() => localStorage.setItem('umaSkillDeck:stepTab', '2'));
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.waitForTimeout(300);
		await sp.page.evaluate(() => selectStepTab(2));
		return sp;
	};

	const KINDS = [
		['(1)', '動画の読み込みが返ってこない', 'file'],
		['(2)', 'シーク（drawAt）が返ってこず取り消しも聞かない', 'hang'],
		['(3)', 'canvasSource の draw が返ってこない', 'canvas']
	];
	for (const [no, what, kind] of KINDS) {
		await block(`T68動画の取り消し${no} ${what}: 「取り消す」ですぐ取り消され、枠は元のまま＋トースト`, async () => {
			const sp = await openSp();
			const { page } = sp;
			// 枠に画像を入れておく（親A 2枚・祖A1 1枚）
			await page.evaluate(() => {
				[[0, 2], [1, 1]].forEach(([r, n]) => { for (let k = 0; k < n; k++) addPersonFiles(r, [new File([new Uint8Array([137, 80, 78, 71, r, k])], 'shot-' + r + '-' + k + '.png', { type: 'image/png' })]); });
				window.__before = persons.map((p) => p.files.slice());
			});
			if (kind === 'file') {
				// video の src を入れても読み込みが始まらない（loadeddata も error も来ない）
				await page.evaluate(() => {
					const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
					Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true, get() { return ''; }, set(v) { window.__srcSet = (window.__srcSet || 0) + 1; } });
					window.__restoreSrc = () => Object.defineProperty(HTMLMediaElement.prototype, 'src', d);
				});
			}
			await openVideoSheet(page);
			await page.waitForSelector('#video-sheet [data-video-act="replace"]');
			await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click('#video-sheet [data-video-act="replace"]')]);
			await page.evaluate((kind) => {
				window.__draws = 0;
				let input;
				if (kind === 'file') input = new File([new Uint8Array(64)], 'rec.mp4', { type: 'video/mp4' });
				else if (kind === 'hang') input = { kind: 'video', width: 390, height: 844, duration: 24, drawAt() { window.__draws++; return new Promise(() => {}); }, close() {} };
				else input = UmaVideoFrames.canvasSource({ width: 390, height: 844, duration: 24, draw() { window.__draws++; return new Promise(() => {}); } });
				window.__runDone = false;
				window.__videoRun = onVideoChosen(input).then((r) => { window.__runDone = true; return r; });
			}, kind);
			await page.waitForSelector('#video-progress [data-video-act="abort"]');
			await page.waitForTimeout(600);   // 止まったまま（返ってこない待ちの中）にする
			const mid = await page.evaluate(() => ({ done: window.__runDone, draws: window.__draws, srcSet: window.__srcSet || 0, label: document.querySelector('#video-progress .video-prog-label').textContent, busy: document.getElementById('video-import-btn').disabled }));
			assert(!mid.done && mid.busy && (kind === 'file' ? mid.srcSet >= 1 : mid.draws >= 1), `T68${no} 取り消す前は処理が止まったまま（空振りでない）`, mid);
			const t0 = Date.now();
			await page.click('#video-progress [data-video-act="abort"]');
			const r = await page.evaluate(() => Promise.race([window.__videoRun, new Promise((res) => setTimeout(() => res('timeout'), 3000))]));
			const ms = Date.now() - t0;
			const c = await page.evaluate(() => {
				const t = document.getElementById('toast');
				return {
					same: persons.every((p, i) => p.files.length === window.__before[i].length && p.files.every((f, k) => f === window.__before[i][k])),
					prog: !!document.getElementById('video-progress'), err: !!document.getElementById('video-error'), sum: !!document.getElementById('video-summary'),
					toast: document.getElementById('toast-message').textContent, shown: !t.classList.contains('opacity-0'),
					btnDis: document.getElementById('video-import-btn').disabled, op: getComputedStyle(document.getElementById('personset-A-wrap')).opacity,
					video: persons.some((p) => p.video)
				};
			});
			if (kind === 'file') await page.evaluate(() => window.__restoreSrc());
			assert(r && r !== 'timeout' && r.aborted === true && r.ok === false, `T68${no} 取り消すと処理が抜ける（{ ok: false, aborted: true }）`, r);
			assert(ms < 1500, `T68${no} 押してから抜けるまで 1.5秒未満`, ms);
			assert(c.same && !c.video, `T68${no} 枠の画像は元のまま（動画から来た印も付かない）`, c);
			assert(!c.prog && !c.err && !c.sum && c.toast === CANCEL && c.shown, `T68${no} 進捗の箱は消え、トースト「${CANCEL}」（失敗・知らせの箱は出ない）`, c);
			assert(!c.btnDis && c.op === '1', `T68${no} 入口と枠がまた押せる`, c);
			assert(jsErrors(sp.errors).length === 0, `T68${no} コンソールのエラー0`, sp.errors);
			await sp.ctx.close();
		});
	}
}
