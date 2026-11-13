// T184（2026-11-13・決定 445・761）: OCR の速さの試しのページ lab/ocr-speed-test.html（iPhone で「今の読み方」と「並べて読む〔案4〕」
// 「先に用意する〔案2〕」を比べるための作業用のページ。製品の画面は変えていない）の検査。
// 塊の見出しは「T184」で始まる（`npm run test:visual -- --only=T184`）。run-smoke.mjs の末尾から register177() で呼ばれる。
//
//  (1) 開く: 375・1280px で横スクロールなし・エラー0。noindex・Content-Security-Policy（フォームの送信の禁止・通信は OCR のエンジンの読み先だけ）。
//      製品のページ（special.html・exam.html・index.html ほか）からリンクしていない。
//  (2) 写し: lab/ocr-speed-test-product.js の6つの関数が special.html の同じ名前の関数と一字も違わない（行頭の字下げだけを除いて比べる）。
//      製品の側が変わったら、ここが NG になる（写しを取り直す合図）。
//  (3) 結果が出る: OCR のエンジン（tesseract.js）を作り物に差し替え（CDN の読み込みを横取り）、作り物の画像4枚で
//      今の読み方 → 並べて読む 2本 → 並べて読む 1本＋先に用意 を回す。表に3行・「終わった」・認識の回数が同じ・
//      今の読み方との違いが「同じ」。2本のときは認識が同時に2つ走る。先に用意は押す前にエンジンを作り、読んだあとも閉じない。
//  (4) 白いページの印: 試しの途中の印を残したまま開き直すと「途中で止まった」の行と知らせが出る。結果のコピーの文に表の行が入る。
//  (5) 通信: ページが出した通信は、同じ場所の GET と、作り物に差し替えた cdnjs の GET だけ（POST なし・ほかの宛先なし）。
// 期待値（関数の名前・CSP の値・表の文言）は検査の側に直書きする。

import fs from 'node:fs';
import path from 'node:path';

// 作り物の tesseract.js。recognize は渡された画の大きさから決まった文字を、少し待ってから返す。同時に走っている数の最大を数える
const STUB = `
window.__tess = { created: 0, terminated: 0, running: 0, maxRunning: 0, calls: 0 };
window.Tesseract = {
	createWorker: async function () {
		window.__tess.created++;
		await new Promise((r) => setTimeout(r, 20));
		return {
			loadLanguage: async () => {}, initialize: async () => {}, setParameters: async () => {},
			terminate: async () => { window.__tess.terminated++; },
			recognize: async (cv) => {
				const s = window.__tess; s.calls++; s.running++; s.maxRunning = Math.max(s.maxRunning, s.running);
				await new Promise((r) => setTimeout(r, 40));
				s.running--;
				const t = 'w' + cv.width + 'h' + cv.height;
				return { data: { text: t, lines: [{ text: t, confidence: 90, bbox: { y0: 0, y1: 10 } }] } };
			}
		};
	}
};`;

const FNS = ['maskScrollbarThumb', 'restoreScrollbarThumb', 'rowGoldRuns', 'estimateStarSlots', 'countStarsInSlots', 'computeRowStarCountsSpecial'];
/** ソースから「function 名前(」で始まる関数の本文を括弧の対応で取り出し、行頭の字下げを除いた形にする。無ければ null */
function fnText(src, name) {
	const s = src.replace(/\r\n/g, '\n');
	const m = new RegExp('^[\\t ]*(async )?function ' + name + '\\(', 'm').exec(s);
	if (!m) return null;
	let depth = 0, j = s.indexOf('{', m.index);
	for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break; }
	return s.slice(m.index, j + 1).split('\n').map((l) => l.replace(/^[\t ]+/, '')).join('\n');
}

export async function register177(env) {
	const { block, assert, browser, base, REPO_ROOT } = env;
	const URL_PATH = '/lab/ocr-speed-test.html';
	const open = async (vp = { width: 1280, height: 900 }) => {
		const ctx = await browser.newContext({ viewport: vp });
		const page = await ctx.newPage();
		page.setDefaultTimeout(30000);
		const errors = [], reqs = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		page.on('request', (r) => reqs.push({ url: r.url(), method: r.method() }));
		// OCR のエンジンは作り物にする（CDN へは出ない。ほかの外の宛先は塞いで、出たら (5) で数える）
		await ctx.route('https://cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: STUB }));
		await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)(?!cdnjs\.cloudflare\.com)/, (r) => r.abort());
		await page.goto(base + URL_PATH);
		await page.waitForFunction(() => !!window.__ocrSpeedTest && !!window.Tesseract);
		return { ctx, page, errors, reqs };
	};
	// 作り物の画像（白地に黒い字の行。製品の行の検出に当たるかは問わない。画質の足切りには当たらない）を n 枚選ぶ
	const chooseImages = (page, n) => page.evaluate(async (n) => {
		const dt = new DataTransfer();
		for (let k = 0; k < n; k++) {
			const c = document.createElement('canvas'); c.width = 720; c.height = 1280;
			const x = c.getContext('2d');
			x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
			x.fillStyle = '#222'; x.font = '34px sans-serif';
			for (let i = 0; i < 14; i++) { x.fillText('スキル' + (k * 14 + i) + ' テスト ' + 'あいうえお'.slice(0, 1 + (i % 5)), 40, 120 + i * 80); x.fillRect(560, 96 + i * 80, 120, 30); }
			const b = await new Promise((r) => c.toBlob(r, 'image/png'));
			dt.items.add(new File([b], 'img-' + k + '.png', { type: 'image/png' }));
		}
		const inp = document.getElementById('files');
		inp.files = dt.files;
		inp.dispatchEvent(new Event('change', { bubbles: true }));
	}, n);
	const pickMode = (page, v, prewarm) => page.evaluate(([v, p]) => {
		document.querySelector('input[name=mode][value="' + v + '"]').click();
		const cb = document.getElementById('prewarm');
		if (cb.checked !== p) cb.click();
	}, [v, prewarm]);
	const runOnce = async (page) => {
		const before = await page.evaluate(() => window.__ocrSpeedTest.store().runs.length);
		await page.click('#go');
		await page.waitForFunction((b) => window.__ocrSpeedTest.store().runs.length > b && !document.getElementById('go').disabled, before);
		return page.evaluate(() => { const rs = window.__ocrSpeedTest.store().runs; return rs[rs.length - 1]; });
	};
	const rowsOf = (page) => page.$$eval('#results tbody tr', (trs) => trs.map((tr) => Array.from(tr.cells).map((c) => c.textContent)));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|ERR_FAILED|net::/.test(m));

	await block('T184(1) OCR の速さの試しのページ: 開く・横スクロールなし・エラー0・noindex・CSP・製品からリンクしていない', async () => {
		for (const w of [375, 1280]) {
			const { ctx, page, errors } = await open({ width: w, height: 860 });
			const r = await page.evaluate(() => ({
				title: document.title,
				robots: (document.querySelector('meta[name=robots]') || {}).content || '',
				csp: (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '',
				sw: document.scrollingElement.scrollWidth, iw: window.innerWidth,
				go: document.getElementById('go').disabled,
				modes: Array.from(document.querySelectorAll('input[name=mode]')).map((i) => i.value)
			}));
			assert(r.title === 'OCR の速さの試し（作業用）', `T184(1) ${w}px: 題名`, r.title);
			assert(/noindex/.test(r.robots) && /nofollow/.test(r.robots), `T184(1) ${w}px: noindex・nofollow`, r.robots);
			const csp = r.csp;
			assert(/form-action 'none'/.test(csp) && /default-src 'none'/.test(csp) && /base-uri 'none'/.test(csp), `T184(1) ${w}px: CSP でフォームの送信を禁止・既定は何も許さない`, csp);
			const connect = (/connect-src ([^;]+)/.exec(csp) || [])[1] || '';
			assert(connect.trim().split(/\s+/).sort().join(' ') === 'data: https://tessdata.projectnaptha.com https://unpkg.com', `T184(1) ${w}px: 通信は OCR のエンジンの読み先だけ（同じ場所へも出さない）`, connect);
			assert(r.sw <= r.iw, `T184(1) ${w}px: 横スクロールなし`, { sw: r.sw, iw: r.iw });
			assert(r.go === true, `T184(1) ${w}px: 画像を選ぶまで「読み取りを始める」は押せない`);
			assert(r.modes.join(',') === 'seq,p1,p2,p3,p4', `T184(1) ${w}px: 読み方は5つ（今の読み方・並べて 1〜4本）`, r.modes);
			assert(jsErrors(errors).length === 0, `T184(1) ${w}px: エラー0`, errors.slice(0, 3));
			await ctx.close();
		}
		const linked = ['special.html', 'exam.html', 'index.html', 'card-event-input.html', 'deck-alpha.html', 'deck-alpha-register.html', 'uma-skill-deck.html']
			.filter((f) => fs.existsSync(path.join(REPO_ROOT, f)) && fs.readFileSync(path.join(REPO_ROOT, f), 'utf8').includes('ocr-speed-test'));
		assert(linked.length === 0, 'T184(1) 製品のページから試しのページへのリンクが無い', linked);
	});

	await block('T184(2) 試しのページの関数の写しが special.html と一字も違わない', async () => {
		const prod = fs.readFileSync(path.join(REPO_ROOT, 'special.html'), 'utf8');
		const copy = fs.readFileSync(path.join(REPO_ROOT, 'lab', 'ocr-speed-test-product.js'), 'utf8');
		for (const n of FNS) {
			const a = fnText(prod, n), b = fnText(copy, n);
			assert(a !== null && b !== null && a === b, `T184(2) ${n} が製品と同じ`, a === null ? '製品に無い' : b === null ? '写しに無い' : a === b ? undefined : '違う（写しを取り直す）');
		}
		const page = fs.readFileSync(path.join(REPO_ROOT, 'lab', 'ocr-speed-test.html'), 'utf8');
		const ver = (/COMMON_JS_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(REPO_ROOT, 'js', 'common.js'), 'utf8')) || [])[1];
		assert(page.includes('../js/common.js?v=' + ver), 'T184(2) 凍結の common.js は今の版を読み込むだけ', ver);
		assert(page.includes('tesseract.js/4.0.2/tesseract.min.js') && prod.includes('tesseract.js/4.0.2/tesseract.min.js'), 'T184(2) OCR のエンジンは製品と同じ tesseract.js 4.0.2');
		assert(/tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300'/.test(page), 'T184(2) エンジンの設定は製品と同じ（psm 6・dpi 300）');
	});

	await block('T184(3) 今の読み方・並べて読む 2本・先に用意して並べて読む 1本で、結果が出て、今の読み方と同じ', async () => {
		const { ctx, page, errors } = await open({ width: 390, height: 844 });
		await chooseImages(page, 4);
		const info = await page.textContent('#files-info');
		assert(/^4枚/.test(info), 'T184(3) 4枚を選んだ表示', info);
		await pickMode(page, 'seq', false);
		const r1 = await runOnce(page);
		const t1 = await page.evaluate(() => Object.assign({}, window.__tess));
		assert(r1.status === 'done' && r1.diff === 'base' && r1.jobs >= 4 && r1.n === 1, 'T184(3) 今の読み方: 終わった・基準・認識の回数', { status: r1.status, diff: r1.diff, jobs: r1.jobs });
		assert(t1.created === 1 && t1.terminated === 1 && t1.maxRunning === 1, 'T184(3) 今の読み方: エンジン1本を作って閉じる・同時に1つ', t1);
		await page.evaluate(() => { window.__tess.maxRunning = 0; window.__tess.created = 0; window.__tess.terminated = 0; });
		await pickMode(page, 'p2', false);
		const r2 = await runOnce(page);
		const t2 = await page.evaluate(() => Object.assign({}, window.__tess));
		assert(r2.status === 'done' && r2.diff === 0 && r2.jobs === r1.jobs && r2.fp === r1.fp, 'T184(3) 並べて読む 2本: 終わった・今の読み方と同じ（認識の回数・指紋）', { status: r2.status, diff: r2.diff, jobs: r2.jobs, fp: [r1.fp, r2.fp] });
		assert(t2.created === 2 && t2.terminated === 2 && t2.maxRunning === 2, 'T184(3) 並べて読む 2本: エンジン2本・同時に2つ走る・閉じる', t2);
		await page.evaluate(() => { window.__tess.maxRunning = 0; window.__tess.created = 0; window.__tess.terminated = 0; });
		await pickMode(page, 'p1', true);
		await page.waitForFunction(() => /1本を用意済み/.test(document.getElementById('state').textContent));
		const pre = await page.evaluate(() => Object.assign({}, window.__tess));
		assert(pre.created === 1 && pre.calls === t2.calls, 'T184(3) 先に用意: 押す前にエンジンを1本作る（まだ読まない）', pre);
		const r3 = await runOnce(page);
		const t3 = await page.evaluate(() => Object.assign({}, window.__tess));
		assert(r3.status === 'done' && r3.diff === 0 && r3.prewarm === true && r3.prepBeforeMs != null, 'T184(3) 先に用意して並べて読む 1本: 終わった・同じ・押す前に用意した時間がある', { status: r3.status, diff: r3.diff, prepBeforeMs: r3.prepBeforeMs });
		assert(t3.created === 1 && t3.terminated === 0, 'T184(3) 先に用意: 読んだあともエンジンを閉じない（使い回す）', t3);
		const rows = await rowsOf(page);
		assert(rows.length === 3 && rows.every((c) => c[10] === '終わった'), 'T184(3) 結果の表に3行・すべて「終わった」', rows);
		assert(rows[0][1] === '並べて読む 1本・先に用意' && rows[1][1] === '並べて読む 2本' && rows[2][1] === '今の読み方（1本・順に）', 'T184(3) 表の読み方の名前（新しい順）', rows.map((c) => c[1]));
		assert(rows[0][9] === '同じ' && rows[1][9] === '同じ' && rows[2][9] === '（これが基準）', 'T184(3) 今の読み方との違いの列', rows.map((c) => c[9]));
		const out = await page.inputValue('#out');
		assert(/^T184 OCR の速さの試し/.test(out) && out.split('\n').length === 6, 'T184(3) コピーの文: 見出し・端末・列名＋3行', out.split('\n').length);
		assert(jsErrors(errors).length === 0, 'T184(3) エラー0', errors.slice(0, 3));
		await ctx.close();
	});

	await block('T184(4) 試しの途中でページが読み直されたら「途中で止まった」と出る・(5) 通信は同じ場所と作り物のエンジンの GET だけ', async () => {
		const { ctx, page, errors, reqs } = await open({ width: 390, height: 844 });
		await page.evaluate(() => {
			localStorage.setItem('uma-lab-ocr-speed:v1', JSON.stringify({ runs: [], baselines: {}, running: { no: 1, at: new Date().toISOString(), mode: 'p3', label: '並べて読む 3本', n: 3, prewarm: false, images: 16, set: 'abcd1234', status: 'running', jobs: 0 } }));
		});
		await page.reload();
		await page.waitForFunction(() => !!window.__ocrSpeedTest);
		const r = await page.evaluate(() => ({ note: document.getElementById('lost-note').hidden ? null : document.getElementById('lost-note').textContent, store: JSON.parse(localStorage.getItem('uma-lab-ocr-speed:v1')) }));
		assert(r.note === '前の試し（#1・並べて読む 3本・16枚）は最後まで終わりませんでした。ページが読み直された（白いページになった）見込みです。', 'T184(4) 開き直すと知らせが出る', r.note);
		assert(r.store.running === null && r.store.runs.length === 1 && r.store.runs[0].status === 'lost', 'T184(4) 途中の印は「途中で止まった」の行に移る', r.store);
		const rows = await rowsOf(page);
		assert(rows.length === 1 && rows[0][10] === '途中で止まった（ページが読み直された見込み）', 'T184(4) 表に「途中で止まった」の行', rows);
		await chooseImages(page, 2);
		await pickMode(page, 'p2', false);
		await runOnce(page);
		const own = new URL(base).host;
		const bad = reqs.filter((q) => { const u = new URL(q.url); return q.method !== 'GET' || !(u.host === own || u.host === 'cdnjs.cloudflare.com') ; }).filter((q) => !/^(blob|data):/.test(q.url));
		assert(bad.length === 0, 'T184(5) 通信は同じ場所と cdnjs（作り物）の GET だけ', bad.slice(0, 5));
		assert(reqs.some((q) => /tesseract\.js\/4\.0\.2\/tesseract\.min\.js/.test(q.url)), 'T184(5) OCR のエンジンは cdnjs の tesseract.js 4.0.2 から読む（作り物に差し替え）');
		assert(jsErrors(errors).length === 0, 'T184(4)(5) エラー0', errors.slice(0, 3));
		await ctx.close();
	});
}
