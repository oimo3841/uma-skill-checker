// T185（2026-11-15・決定 763〜765・473）: OCR を並べて読む（案4）・エンジンを先に用意して使い回す（案2）。js/ocr-pool.js と
// special.html・exam.html の processImages / processPersonImages の検査。塊の見出しは「T185」で始まる（`npm run test:visual -- --only=T185`）。
// run-smoke.mjs の末尾から register178() で呼ばれる。
//
// OCR のエンジン（tesseract.js）は作り物に差し替える（cdnjs の tesseract.min.js の読み込みを横取り）。作り物の recognize は、渡された画の
// 大きさと中身の一部から決まった文字を返し、画ごとに違う時間だけ待つ（読み終わる順が積んだ順と変わるようにする）。同時に走っている数の最大を数える。
// 自動の検査では navigator.webdriver が真なので製品は先に用意しない。先に用意の時機を見るときだけ webdriver を偽に見せる（ふつうのブラウザと同じ動き）。
//
//  (1) 本数（764）: スマホ（iPhone・iPad〔Macintosh と名乗り触れる点がある〕・Android）は 2・PC は論理コア 8 以上で 3・それより少なければ 2。
//      両ページが ocr-pool.js を版つきで読む。スキルセットの OCR・index.html は池を使わない。
//  (2) 先に用意の時機（765）: ページを開いたときは用意しない・画像を選んだときに N 本用意する・自動の検査（webdriver）では用意しない・
//      動画と取り込みは組み立て（結合画像）のあとに用意する（ソースの順で確かめる）。
//  (3) 使い回しと閉じる時機（765）: 読み終わっても閉じない・2回目は作り直さない（[時間] の行が「先に用意していた」）・pagehide で閉じる・
//      使わない時間（既定 5分）が過ぎたら閉じる。
//  (4) 失敗: エンジンを作るのに1本失敗したら本数を1つ減らして続ける・1本も作れなければ今までの1本・順の読み方に戻る（結果は同じ）。
//  (5) 結果の並び・％（473）・同時に2つの OCR を走らせない: 池（並べて読む）と今までの読み方で、照合に渡す行・照合の結果・緑因子・青赤・
//      進み具合の表示の列が同じ。並べて読む間は認識が同時に N 本走る。open() は前の回が終わるまで待つ。UmaExam も同じ（めろっぷの経路を含む）。
//  (6) 画像全体の読み（行の検出に失敗した画）は、1回の OCR の中で1本のエンジンが積んだ順に読む（Tesseract は同じエンジンで前に読んだ画像全体に
//      結果が左右されるため。T185 の確かめ）。OCR が終わったらそのエンジンだけを初期化し直す。
// 期待値（本数・表示の文・5分）は検査の側に直書きする。

// 作り物の tesseract.js。window.__tessFail に「何本目の createWorker を失敗させるか」（1 から）を入れられる
const STUB = `
window.__tess = { created: 0, terminated: 0, running: 0, maxRunning: 0, calls: 0, failed: 0, inits: {}, log: [] };
window.__tessFail = window.__tessFail || [];
window.Tesseract = {
	createWorker: async function () {
		const s = window.__tess;
		const no = ++s.created;
		await new Promise((r) => setTimeout(r, 15));
		if (window.__tessFail.indexOf(no) >= 0) { s.failed++; throw new Error('作り物のエンジンの失敗 ' + no); }
		s.inits[no] = 0;
		return {
			loadLanguage: async () => {}, initialize: async () => { s.inits[no]++; await new Promise((r) => setTimeout(r, 10)); }, setParameters: async () => {},
			terminate: async () => { s.terminated++; },
			recognize: async (cv) => {
				s.calls++; s.running++; s.maxRunning = Math.max(s.maxRunning, s.running);
				if (cv.__tag) s.log.push([no, cv.__tag]);
				let sum = 0;
				try { const d = cv.getContext('2d').getImageData(0, 0, Math.min(cv.width, 40), Math.min(cv.height, 40)).data; for (let i = 0; i < d.length; i += 97) sum += d[i]; } catch (e) {}
				await new Promise((r) => setTimeout(r, 5 + ((cv.width * 7 + cv.height * 13 + sum) % 45)));
				s.running--;
				const t = 'スキル' + cv.width + 'x' + cv.height + 'の' + (sum % 1000);
				return { data: { text: t, lines: [{ text: t, confidence: 88, bbox: { x0: 0, y0: 0, x1: cv.width, y1: 20 }, words: [] }] } };
			}
		};
	}
};`;

/** 作り物の画像（白地に黒い字の行・右に黒い帯）を n 枚作って File の配列にする（ページの中で） */
const MAKE_FILES = `async (n, seed) => {
	const out = [];
	for (let k = 0; k < n; k++) {
		const c = document.createElement('canvas'); c.width = 720; c.height = 1280;
		const x = c.getContext('2d');
		x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
		x.fillStyle = '#222'; x.font = '34px sans-serif';
		for (let i = 0; i < 14; i++) { x.fillText('スキル' + (seed * 100 + k * 14 + i) + ' テスト ' + 'あいうえお'.slice(0, 1 + ((i + seed) % 5)), 40, 120 + i * 80); x.fillRect(560 - ((k + i + seed) % 4) * 30, 96 + i * 80, 120, 30); }
		const b = await new Promise((r) => c.toBlob(r, 'image/png'));
		out.push(new File([b], 'p' + seed + '-' + k + '.png', { type: 'image/png' }));
	}
	return out;
}`;

export async function register178(env) {
	const { block, assert, browser, base, fs, path, REPO_ROOT, USER_DATA } = env;
	const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8').replace(/\r\n/g, '\n');
	const poolSrc = read('js/ocr-pool.js');
	const VER = (/OCR_POOL_JS_VERSION = '([^']+)'/.exec(poolSrc) || [])[1];
	const IDS = JSON.parse(read('uma-skill-deck-skills.json')).skills.slice(0, 40).map((s) => String(s.id));

	/** ページを開く。o.real … webdriver を偽に見せる（先に用意が効く）。o.fail … 失敗させる createWorker の番号 */
	const open = async (file, o = {}) => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await ctx.newPage();
		page.setDefaultTimeout(20000);
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.addInitScript((d) => localStorage.setItem('umaSkillDeck:userData', JSON.stringify(d)), USER_DATA);
		// UmaStar は②のスキル（先頭 40 件）を入れておく（無いと OCR の前で止まる）
		if (file === 'special.html') {
			await page.addInitScript((ids) => {
				localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			}, IDS);
		}
		if (o.real) await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); });
		if (o.fail) await page.addInitScript((f) => { window.__tessFail = f; }, o.fail);
		await page.route('**/tesseract.js/4.0.2/tesseract.min.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: STUB }));
		await page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8',
			body: JSON.stringify({ dataVersion: '2026-10-03a', category: 'scenarioEventSkills', note: 'テスト用の空のファイル', entries: [] }) }));
		await page.goto(base + '/' + file, { waitUntil: 'load', timeout: 60000 });
		await page.waitForFunction(() => !!window.UmaOcrPool && !!window.Tesseract && window.Tesseract.createWorker && typeof processImages === 'function' && typeof persons !== 'undefined');
		// UmaStar は②のスキルが読み込まれるまで待つ（読み込まれる前に押すと OCR の前で止まる）
		if (file === 'special.html') await page.waitForFunction(() => typeof skillList !== 'undefined' && skillList.length > 0);
		return { ctx, page, errors };
	};
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|ERR_FAILED|net::/.test(m));
	const tess = (page) => page.evaluate(() => Object.assign({}, window.__tess));
	const poolState = (page) => page.evaluate(() => UmaOcrPool.state());

	/** ページの中: 3人に画像を入れて processImages を回し、結果（照合に渡した行・照合の結果ほか）と進み具合の表示の列を返す。
	 *  usePool=false なら池を外して今までの読み方で回す */
	const OCR = `async ({ usePool, counts, makeFiles }) => {
		const mk = eval(makeFiles);
		for (let i = 0; i < persons.length; i++) { persons[i].files = i < counts.length ? await mk(counts[i], i + 1) : []; persons[i].video = null; }
		const saved = window.UmaOcrPool;
		if (!usePool) window.UmaOcrPool = undefined;
		const progress = [];
		const sp = window.setBusyProgress;
		window.setBusyProgress = function (r, l) { progress.push([Math.round(r * 1000) / 1000, l]); return sp.apply(this, arguments); };
		const st0 = window.showToast; window.showToast = () => {};
		let ok;
		try { ok = await processImages({ keepClosed: true, quiet: true }); }
		finally { window.UmaOcrPool = saved; window.setBusyProgress = sp; window.showToast = st0; }
		const ser = (v, d) => {
			if (d > 7) return '…';
			if (v === null || v === undefined || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
			if (v instanceof Map) return { m: [...v.entries()].map(([k, x]) => [ser(k, d + 1), ser(x, d + 1)]) };
			if (v instanceof Set) return { s: [...v].map((x) => ser(x, d + 1)) };
			if (v instanceof HTMLCanvasElement || v instanceof Blob) return '[obj]';
			if (Array.isArray(v)) return v.map((x) => ser(x, d + 1));
			const o = {}; for (const k of Object.keys(v).sort()) { const x = ser(v[k], d + 1); if (x !== undefined) o[k] = x; } return o;
		};
		const g = (n) => { try { return eval(n); } catch (e) { return undefined; } };
		return { ok, progress, lines: JSON.stringify(ser(g('personLines'), 0)), results: JSON.stringify(ser(g('personResults'), 0)),
			green: JSON.stringify(ser(g('personGreen'), 0)), top: JSON.stringify(ser(g('personTop'), 0)), melop: JSON.stringify(ser(g('personMelop'), 0)),
			nLines: (g('personLines') || []).map((l) => (l ? l.length : null)),
			dev: (g('devGeometry') || []).map(String).filter((l) => !/^\\[時間\\]/.test(l)).join('\\n'),
			time: (g('devGeometry') || []).map(String).filter((l) => /^\\[時間\\] OCR/.test(l)) };
	}`;
	const runOcr = (page, usePool, counts = [2, 1, 2]) => page.evaluate(`(${OCR})(${JSON.stringify({ usePool, counts, makeFiles: MAKE_FILES })})`);
	const resetTess = (page) => page.evaluate(() => { const s = window.__tess; s.maxRunning = 0; s.calls = 0; });

	await block('T185(1) OCR の池の本数（スマホ 2・PC はコア 8 以上で 3・少なければ 2）・両ページが版つきで読む・スキルセットの OCR と index.html は使わない', async () => {
		const { ctx, page, errors } = await open('special.html');
		const r = await page.evaluate(() => {
			const f = (ua, cores, touch) => UmaOcrPool.sizeFor({ userAgent: ua, hardwareConcurrency: cores, maxTouchPoints: touch });
			const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
			const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15';
			const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
			const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
			return {
				iphone: f(IPHONE, 6, 5), iphone8: f(IPHONE, 8, 5), ipad: f(IPAD, 8, 5), android: f(ANDROID, 8, 5),
				win12: f(WIN, 12, 0), win8: f(WIN, 8, 0), win4: f(WIN, 4, 0), winTouch12: f(WIN, 12, 10), mac10: f(IPAD, 10, 0), none: f(WIN, 0, 0),
				ver: UmaOcrPool.VERSION, params: UmaOcrPool.PARAMS
			};
		});
		assert(r.iphone === 2 && r.iphone8 === 2 && r.ipad === 2 && r.android === 2, 'T185(1) スマホ（iPhone・iPad・Android）は 2本（コアの数に依らない）', r);
		assert(r.win12 === 3 && r.win8 === 3 && r.mac10 === 3, 'T185(1) PC は論理コア 8 以上で 3本', r);
		assert(r.win4 === 2 && r.none === 2, 'T185(1) コアの少ない PC（と数が分からない PC）は 2本', r);
		assert(r.winTouch12 === 3, 'T185(1) 触れる画面の Windows の PC はスマホに数えない（ポインターでは判定しない＝325）', r);
		assert(r.ver === VER && JSON.stringify(r.params) === JSON.stringify({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' }), 'T185(1) 版・エンジンの設定（今までと同じ psm 6・dpi 300）', r);
		for (const f of ['special.html', 'exam.html']) {
			const s = read(f);
			assert(s.includes('<script src="js/ocr-pool.js?v=' + VER + '"></script>'), `T185(1) ${f} が ocr-pool.js を版 ${VER} で読む`);
		}
		const sp = read('special.html');
		const sk = (/async function runSkillsetScreenshots[\s\S]*?\n\t\t}\n/.exec(sp) || [''])[0];
		assert(sk.length > 0 && /Tesseract\.createWorker\(\)/.test(sk) && !/UmaOcrPool/.test(sk), 'T185(1) スキルセットの OCR（runSkillsetScreenshots）は池を使わず今までどおり1本を作る');
		assert(!/ocr-pool/.test(read('index.html')) && !/UmaOcrPool/.test(read('js/skillset-ocr.js')), 'T185(1) index.html・skillset-ocr.js は池を使わない');
		assert(jsErrors(errors).length === 0, 'T185(1) エラー0', errors.slice(0, 3));
		await ctx.close();
	});

	await block('T185(2) 先に用意の時機: ページを開いたときは用意しない・画像を選んだときに用意する・自動の検査では用意しない・動画は組み立てのあと', async () => {
		for (const file of ['special.html', 'exam.html']) {
			const { ctx, page, errors } = await open(file, { real: true });
			await page.waitForTimeout(600);
			const t0 = await tess(page);
			const s0 = await poolState(page);
			assert(t0.created === 0 && s0.engines === 0 && s0.prewarm === true, `T185(2) ${file}: ページを開いただけではエンジンを作らない`, { t0, s0 });
			const n = await page.evaluate(() => UmaOcrPool.sizeFor());
			await page.evaluate(`(async () => { addPersonFiles(0, await (${MAKE_FILES})(1, 1)); })()`);
			await page.waitForFunction((n) => UmaOcrPool.state().engines === n, n);
			const t1 = await tess(page);
			assert(t1.created === n && t1.calls === 0, `T185(2) ${file}: 画像を選ぶと ${n} 本を用意する（まだ読まない）`, t1);
			await page.evaluate(`(async () => { addPersonFiles(1, await (${MAKE_FILES})(1, 2)); })()`);
			await page.waitForTimeout(200);
			assert((await tess(page)).created === n, `T185(2) ${file}: もう一度選んでも作り足さない`);
			assert(jsErrors(errors).length === 0, `T185(2) ${file}: エラー0`, errors.slice(0, 3));
			await ctx.close();
		}
		{
			const { ctx, page } = await open('special.html');
			await page.evaluate(`(async () => { addPersonFiles(0, await (${MAKE_FILES})(1, 1)); })()`);
			await page.waitForTimeout(400);
			const t = await tess(page);
			assert(t.created === 0 && (await poolState(page)).prewarm === false, 'T185(2) 自動の検査（webdriver）では、画像を選んでも用意しない', t);
			await ctx.close();
		}
		for (const f of ['special.html', 'exam.html']) {
			const s = read(f);
			const a = s.indexOf('async function onVideoChosen');
			const b = s.indexOf('\n\t\t}\n', a);
			const body = s.slice(a, b);
			const iStitch = body.indexOf('await autoStitchVideoSet(setIdx)'), iPre = body.indexOf('UmaOcrPool.prewarm(');
			assert(iStitch > 0 && iPre > iStitch && body.indexOf('UmaOcrPool.prewarm(', iPre + 1) < 0, `T185(2) ${f}: 動画・取り込みは組み立て（autoStitchVideoSet）のあとに1回だけ用意する`, { iStitch, iPre });
			const af = s.slice(s.indexOf('function addPersonFiles'), s.indexOf('\n\t\t}\n', s.indexOf('function addPersonFiles')));
			assert(/if \(added\.length && window\.UmaOcrPool\) UmaOcrPool\.prewarm\(/.test(af), `T185(2) ${f}: 画像を選んだ（足した画像がある）ときに用意する`);
			assert((s.match(/UmaOcrPool\.prewarm\(/g) || []).length === 2, `T185(2) ${f}: 先に用意を呼ぶのはその2か所だけ（ページを開いたときには呼ばない）`);
		}
	});

	await block('T185(3) 使い回しと閉じる時機: 読み終わっても閉じない・2回目は先に用意していた・pagehide で閉じる・使わない時間（5分）で閉じる', async () => {
		const { ctx, page, errors } = await open('special.html', { real: true });
		const n = await page.evaluate(() => UmaOcrPool.sizeFor());
		const r1 = await runOcr(page, true);
		const t1 = await tess(page), s1 = await poolState(page);
		assert(r1.ok === true && t1.created === n && t1.terminated === 0, 'T185(3) 1回目: 読み終わってもエンジンを閉じない', { ok: r1.ok, t1 });
		assert(s1.engines === n && s1.session === false && s1.idle === true && s1.idleMs === 5 * 60 * 1000, 'T185(3) 1回目のあと: 池に残り、5分の時計が動いている', s1);
		assert(r1.time.length === 1 && new RegExp('^\\[時間\\] OCR: 準備（OCR の読み込み） \\d+\\.\\d秒・エンジン ' + n + '本（押してから用意）・認識 \\d+回（エンジンの時間の合計 \\d+\\.\\d秒(・うち画像全体 \\d+回は1本で順に)?）・整える \\d+\\.\\d秒・終わり 親A \\d+\\.\\d秒／祖A1 \\d+\\.\\d秒／祖A2 \\d+\\.\\d秒／青と赤の因子 \\d+\\.\\d秒・合計 \\d+\\.\\d秒$').test(r1.time[0]),
			'T185(3) 開発ログの [時間] の行: 準備・本数（押してから用意）・認識・整える・人ごとの終わり・合計', r1.time);
		const r2 = await runOcr(page, true);
		const t2 = await tess(page);
		assert(r2.ok === true && t2.created === n && t2.terminated === 0, 'T185(3) 2回目: エンジンを作り直さない（使い回す）', t2);
		assert(/・エンジン \d本（先に用意していた）・/.test(r2.time[0] || ''), 'T185(3) 2回目の [時間] の行は「先に用意していた」', r2.time);
		await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
		await page.waitForTimeout(100);
		const t3 = await tess(page), s3 = await poolState(page);
		assert(t3.terminated === n && s3.engines === 0, 'T185(3) ページを離れた（pagehide）ら全部閉じる', { t3, s3 });
		// 使わない時間: 時計を短くして、用意 → 何もしない → 閉じる
		await page.evaluate(() => UmaOcrPool.configure({ idleMs: 300 }));
		await page.evaluate(`(async () => { addPersonFiles(2, await (${MAKE_FILES})(1, 9)); })()`);
		await page.waitForFunction((n) => UmaOcrPool.state().engines === n, n);
		await page.waitForFunction(() => UmaOcrPool.state().engines === 0, null, { timeout: 5000 });
		const t4 = await tess(page);
		assert(t4.created === 2 * n && t4.terminated === 2 * n, 'T185(3) 使わない時間が過ぎたら閉じる（次に選んだら作り直す）', t4);
		assert(jsErrors(errors).length === 0, 'T185(3) エラー0', errors.slice(0, 3));
		await ctx.close();
	});

	await block('T185(4) エンジンを作るのに失敗したら本数を1つ減らして続ける・1本も作れなければ今までの読み方に戻る（結果は同じ）', async () => {
		let base0 = null;
		{
			const { ctx, page } = await open('special.html');
			base0 = await runOcr(page, false);
			await ctx.close();
		}
		{
			const { ctx, page, errors } = await open('special.html', { fail: [2] });
			const n = await page.evaluate(() => UmaOcrPool.sizeFor());
			const r = await runOcr(page, true);
			const t = await tess(page), s = await poolState(page);
			assert(r.ok === true && t.failed === 1 && s.engines === n - 1 && s.target === n - 1, `T185(4) 2本目の失敗: ${n - 1} 本で続ける`, { t, s });
			assert(new RegExp('・エンジン ' + (n - 1) + '本（').test(r.time[0] || ''), 'T185(4) [時間] の行の本数も減る', r.time);
			assert(r.lines === base0.lines && r.results === base0.results, 'T185(4) 本数が減っても結果は今までの読み方と同じ', { a: r.nLines, b: base0.nLines });
			assert(jsErrors(errors).length === 0, 'T185(4) エラー0', errors.slice(0, 3));
			await ctx.close();
		}
		{
			const { ctx, page, errors } = await open('special.html', { fail: [1, 2, 3] });
			const r = await runOcr(page, true);
			const t = await tess(page), s = await poolState(page);
			assert(r.ok === true && t.failed === 3 && s.engines === 0, 'T185(4) 1本も作れない: OCR は終わる（池は空）', { ok: r.ok, t, s });
			assert(/・エンジン 1本（今までの読み方）・読み取り \d+\.\d秒・/.test(r.time[0] || '') && t.maxRunning === 1, 'T185(4) 1本も作れない: 今までの1本・順の読み方に戻る', { time: r.time, t });
			assert(r.lines === base0.lines && r.results === base0.results && r.green === base0.green && r.top === base0.top, 'T185(4) 今までの読み方に戻ったときも結果は同じ');
			assert(jsErrors(errors).length === 0, 'T185(4) エラー0', errors.slice(0, 3));
			await ctx.close();
		}
	});

	await block('T185(5) 並べて読んでも照合に渡す行・結果・％の表示は今までの読み方と同じ・同時に N 本走る・同時に2つの OCR は走らない（UmaStar・UmaExam）', async () => {
		for (const file of ['special.html', 'exam.html']) {
			const { ctx, page, errors } = await open(file);
			const n = await page.evaluate(() => UmaOcrPool.sizeFor());
			for (const counts of [[2, 1, 2], [3, 0, 1]]) {
				await resetTess(page);
				const seq = await runOcr(page, false, counts);
				const ts = await tess(page);
				await resetTess(page);
				const par = await runOcr(page, true, counts);
				const tp = await tess(page);
				const tag = `T185(5) ${file} ${counts.join('/')}枚`;
				assert(seq.ok === true && par.ok === true && seq.nLines.some((x) => x > 0), `${tag}: どちらも判定まで進む`, { seq: seq.nLines, par: par.nLines });
				assert(par.lines === seq.lines, `${tag}: 照合に渡す行（並び・文字・★・rowKey）が同じ`, { seq: seq.nLines, par: par.nLines });
				assert(par.results === seq.results && par.green === seq.green && par.top === seq.top && par.melop === seq.melop, `${tag}: 照合の結果・緑因子・青赤・いちばん上の段が同じ`);
				assert(par.dev === seq.dev, `${tag}: 開発ログの行の検出の内訳（[時間] の行を除く）が同じ並び`);
				assert(JSON.stringify(par.progress) === JSON.stringify(seq.progress), `${tag}: 進み具合の表示の列（％と文）が同じ（473）`, { seq: seq.progress, par: par.progress });
				assert(ts.maxRunning === 1 && tp.maxRunning === n && tp.calls === ts.calls, `${tag}: 今までは1本ずつ・池は同時に ${n} 本・認識の回数は同じ`, { ts, tp });
			}
			// 進み具合の表示の形（3人）: 0% 初期化 → 0% 1人目 → 33% → 67%
			const p3 = (await runOcr(page, true)).progress;
			assert(JSON.stringify(p3) === JSON.stringify([[0, 'OCRエンジンを初期化中…'], [0, '親Aを処理中…'], [0.333, '祖A1を処理中…'], [0.667, '祖A2を処理中…']]), `T185(5) ${file}: ％は人ごとの区切り（0 → 33 → 67%）`, p3);
			// 同時に2つの OCR は走らない: 2回目の open は1回目の close まで待つ
			const both = await page.evaluate(async () => {
				const a = await UmaOcrPool.open();
				let bDone = false;
				const pb = UmaOcrPool.open().then((b) => { bDone = true; return b; });
				await new Promise((r) => setTimeout(r, 150));
				const waited = !bDone;
				a.close();
				const b = await pb;
				b.close();
				return { waited, after: bDone };
			});
			assert(both.waited === true && both.after === true, `T185(5) ${file}: 2つ目の OCR は1つ目が終わるまで始まらない`, both);
			assert(jsErrors(errors).length === 0, `T185(5) ${file}: エラー0`, errors.slice(0, 3));
			await ctx.close();
		}
		// UmaExam のめろっぷの経路（いちばん上の段の読み・開発ログの【めろっぷ】の行の場所）も同じ
		{
			const { ctx, page, errors } = await open('exam.html');
			await page.evaluate(() => { melopModeEnabled = true; });
			const seq = await runOcr(page, false);
			const par = await runOcr(page, true);
			assert(seq.ok === true && /【めろっぷ 親A】/.test(seq.dev), 'T185(5) UmaExam めろっぷ: 今までの読み方で【めろっぷ】の行が出る', seq.dev.slice(-200));
			assert(par.lines === seq.lines && par.results === seq.results && par.melop === seq.melop && par.dev === seq.dev, 'T185(5) UmaExam めろっぷ: 行・結果・めろっぷの結果・開発ログの並びが同じ');
			assert(jsErrors(errors).length === 0, 'T185(5) UmaExam めろっぷ: エラー0', errors.slice(0, 3));
			await ctx.close();
		}
	});

	await block('T185(6) 画像全体の読み（行の検出に失敗した画）は1回の OCR の中で1本のエンジンが積んだ順に読み、OCR のあとにそのエンジンを初期化し直す', async () => {
		for (const f of ['special.html', 'exam.html']) {
			const s = read(f);
			const a = s.indexOf('async function processPersonImages');
			const body = s.slice(a, s.indexOf('\n\t\t}\n', a));
			assert(body.includes('(!detection && worker.recognizeInOrder) ? worker.recognizeInOrder(variants[v]) : worker.recognize(variants[v])') && (body.match(/recognizeInOrder\(/g) || []).length === 1,
				`T185(6) ${f}: processPersonImages は行が取れなかった画（画像全体）だけを順に読む列へ積む`);
		}
		const { ctx, page, errors } = await open('special.html');
		const r = await page.evaluate(async () => {
			const mk = (tag, w) => { const c = document.createElement('canvas'); c.width = w; c.height = 60; c.__tag = tag; return c; };
			const s = await UmaOcrPool.open();
			const n = UmaOcrPool.sizeFor();
			const jobs = [['A1', true, 300], ['n1', false, 101], ['n2', false, 133], ['A2', true, 301], ['n3', false, 157], ['n4', false, 171], ['A3', true, 302], ['n5', false, 199]]
				.map(([t, ord, w]) => (ord ? s.recognizeInOrder(mk(t, w)) : s.recognize(mk(t, w))));
			await Promise.all(jobs);
			const log1 = window.__tess.log.slice();
			const inits0 = Object.assign({}, window.__tess.inits);
			const st1 = UmaOcrPool.state();
			s.close();
			await new Promise((r) => setTimeout(r, 150));
			const inits1 = Object.assign({}, window.__tess.inits);
			const st2 = UmaOcrPool.state();
			const s2 = await UmaOcrPool.open();
			await s2.recognizeInOrder(mk('B1', 303));
			await s2.recognize(mk('m1', 111));
			s2.close();
			await new Promise((r) => setTimeout(r, 150));
			return { n, log1, inits0, inits1, inits2: Object.assign({}, window.__tess.inits), st1, st2, st3: UmaOcrPool.state(), log2: window.__tess.log.slice(log1.length) };
		});
		const ordered = r.log1.filter(([, t]) => /^A/.test(t));
		const owner = ordered.length ? ordered[0][0] : null;
		assert(ordered.length === 3 && ordered.every(([id]) => id === owner) && ordered.map(([, t]) => t).join(',') === 'A1,A2,A3', 'T185(6) 順に読む列は1本のエンジンが積んだ順に読む', r.log1);
		assert(new Set(r.log1.filter(([, t]) => /^n/.test(t)).map(([id]) => id)).size >= 2, 'T185(6) ほかの読みは池のエンジンに分かれる（並べて読む）', r.log1);
		assert(r.st1.dirty === 1 && r.inits1[owner] === r.inits0[owner] + 1 && Object.keys(r.inits1).every((k) => Number(k) === owner || r.inits1[k] === r.inits0[k]),
			'T185(6) OCR が終わったら、順に読む列を読んだエンジンだけを初期化し直す', { owner, inits0: r.inits0, inits1: r.inits1, st1: r.st1 });
		assert(r.st2.dirty === 0 && r.st2.engines === r.n, 'T185(6) 初期化し直したあとも本数は同じ', r.st2);
		const owner2 = (r.log2.find(([, t]) => t === 'B1') || [])[0];
		assert(owner2 != null && r.inits2[owner2] === r.inits1[owner2] + 1 && r.st3.dirty === 0, 'T185(6) 次の回の順に読む列も、終わったら初期化し直す', { owner2, inits1: r.inits1, inits2: r.inits2 });
		assert(jsErrors(errors).length === 0, 'T185(6) エラー0', errors.slice(0, 3));
		await ctx.close();
	});
}
