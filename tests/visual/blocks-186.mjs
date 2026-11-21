// T205（2026-11-21・おいもさんの決定 デ76・874・875。決定 857 の例外）: UmaStar の結合画像の引き出しの「結合画像の設定」の小窓（#stitch-drawer-pop）で、
// 「入れる人」の3つのボタン（3人｜親と祖1｜親だけ）の字が 320〜390px で縦に割れていた不具合の直しの検査。
// 原因: ③の中（#stitch-parts-panel）には 640px 以下で「入れる人」を詰める指定（T188）と模式図を縮める式（T106）があったが、
// 小窓には当たっておらず、小窓の模式図（130px）がボタンの幅を削っていた。直し: 同じ置き方を小窓にも当てた（special.html の CSS だけ）。
// run-smoke.mjs の末尾から register186() で呼ばれる（塊の見出しはすべて「T205」で始まる。`npm run test:visual -- --only=T205` で回せる）。
//
//  (1) 320・360・390・430・1280px（形は既定の3列と、全部 ON の2列）で、小窓の入れる人の3つのボタンがどれも1行・小窓の外に出ない・切れない。
//      小窓のほかの部品（見出し・形の2択・入れる人のラベル・6つのチェック・画像を更新）の行の数が、直す前の値（すべて1行）から増えない。
//      模式図は小窓の中にある・小窓の中のスクロールは 0。
//  (2) ③の中の「結合画像の設定」と UmaExam の引き出しの小窓は変わらない: 部品ごとの行の数・左端・幅と、パネルの大きさが直す前（f005704）と同じ。
//      直す前の値は tests/visual/lib/t205-stitch-baseline.json（直す前の製品で測った値。output/scratch/t205/before の measure.json から作った）。
//  壊す確認（2026-11-21）: 直す前の製品（f005704）で回すと (1) が NG になること（T205-check-1.md）。
import { reloadReady } from './lib/page-ready.mjs';

// ページの中: root の中の、文字を直に持つ見える要素ごとに、行の数（字の矩形の上端のまとまり）・左端・幅・root の外に出るか・切れるか
export const MEASURE_LINES = (sel) => {
	const root = document.querySelector(sel);
	const rr = root.getBoundingClientRect();
	const out = [];
	const seen = {};
	const walk = (el) => {
		if (!el.getClientRects().length) return;
		const cs = getComputedStyle(el);
		if (cs.visibility === 'hidden' || cs.display === 'none') return;
		const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
		if (texts.length) {
			const tops = [];
			let l = Infinity, r = -Infinity;
			texts.forEach((t) => { const rg = document.createRange(); rg.selectNodeContents(t); [...rg.getClientRects()].forEach((q) => { if (q.width > 0.5) { tops.push(q.top); l = Math.min(l, q.left); r = Math.max(r, q.right); } }); });
			tops.sort((a, b) => a - b);
			let lines = 0, last = -1e9;
			tops.forEach((t) => { if (t - last > 3) { lines++; last = t; } });
			const text = texts.map((t) => t.textContent.trim()).join('').slice(0, 24);
			const key0 = (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '')) + '「' + text + '」';
			seen[key0] = (seen[key0] || 0) + 1;
			const key = seen[key0] > 1 ? key0 + '#' + seen[key0] : key0;
			let clipped = false;
			for (let a = el; a && a !== root.parentElement; a = a.parentElement) {
				const ac = getComputedStyle(a);
				if (ac.overflowX !== 'visible' || ac.overflow !== 'visible') { const ar = a.getBoundingClientRect(); if (l < ar.left - 0.5 || r > ar.right + 0.5) clipped = true; }
			}
			const b = el.getBoundingClientRect();
			out.push({ key, lines, x: Math.round(b.left), w: Math.round(b.width), outside: l < rr.left - 0.5 || r > rr.right + 0.5, clipped });
		}
		[...el.children].forEach(walk);
	};
	walk(root);
	const wire = [...root.querySelectorAll('.stitch-wire')].find((e) => e.getClientRects().length);
	const wr = wire && wire.getBoundingClientRect();
	const body = root.querySelector('.uma-popover-body');
	return { root: { w: Math.round(rr.width), h: Math.round(rr.height) }, docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		bodyScroll: body ? body.scrollHeight - body.clientHeight : null,
		wire: wr ? { w: Math.round(wr.width), inside: wr.left >= rr.left - 0.5 && wr.right <= rr.right + 0.5 } : null, parts: out };
};

export async function register186(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const ALL = { marker: true, roster: true, factor: true, sp: true, table: true, title: true };
	const STATES = { def: null, all2: { ...ALL, cols: 2 } };
	const WIDTHS = [320, 360, 390, 430, 1280];
	const PERSONS = /「(3人|親と祖1|親だけ)」/;
	const BASE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests/visual/lib/t205-stitch-baseline.json'), 'utf8'));
	// 部品ごとの行の数・左端・幅（直す前と同じか）
	const sameAs = (now, was) => {
		const diff = [];
		if (now.root.w !== was.root.w || now.root.h !== was.root.h) diff.push({ root: now.root, was: was.root });
		const m = new Map(was.parts.map((p) => [p.key, p]));
		now.parts.forEach((p) => { const q = m.get(p.key); if (!q) diff.push({ extra: p.key }); else if (q.lines !== p.lines || q.x !== p.x || q.w !== p.w) diff.push({ key: p.key, now: [p.lines, p.x, p.w], was: [q.lines, q.x, q.w] }); m.delete(p.key); });
		m.forEach((q) => diff.push({ missing: q.key }));
		return diff;
	};

	// UmaStar: ③を測り、結合画像を作って引き出しの丸ボタンから小窓を開いて測る（blocks-106 の T96(5)(7) と同じ作り物の1人分）
	const openStar = async (w, parts) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w < 600 ? 812 : 900 }, EMPTY);
		const page = sp.page;
		await page.evaluate((parts) => {
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			if (parts) localStorage.setItem('uma-special-stitch-parts', JSON.stringify(parts)); else localStorage.removeItem('uma-special-stitch-parts');
		}, parts);
		await reloadReady(page);
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		await page.waitForTimeout(300);
		await page.evaluate(() => selectStepTab(2));
		await page.locator('#stitch-parts-panel').scrollIntoViewIfNeeded();
		await page.mouse.move(0, 0);
		await page.waitForTimeout(150);
		const step3 = await page.evaluate(MEASURE_LINES, '#stitch-parts-panel');
		await page.evaluate(async () => {
			window.stitchOnePerson = async () => { const c = document.createElement('canvas'); c.width = 1179; c.height = 2342; const g = c.getContext('2d'); g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, c.width, c.height);
				c._sourcePlacements = []; c._profileHeader = { kept: false, ratio: 0.31, height: 0 }; return c; };
			persons[0].files = [{ name: 'a.png' }];
			await runImageStitching({ keepClosed: false, quiet: true, withMarks: false });
		});
		await page.waitForTimeout(400);
		await page.click('#stitch-drawer-fab');
		await page.waitForTimeout(250);
		await page.mouse.move(0, 0);
		const pop = await page.evaluate(MEASURE_LINES, '#stitch-drawer-pop');
		const errors = jsErrors(sp.errors);
		await sp.ctx.close();
		return { step3, pop, errors };
	};

	const star = {};
	for (const w of WIDTHS) {
		await block(`T205(1) ${w}px UmaStar の引き出しの「結合画像の設定」: 入れる人の3つのボタンが1行（割れない・切れない）・ほかの部品の行の数は直す前から増えない（既定の3列・全部 ON の2列）`, async () => {
			for (const [st, parts] of Object.entries(STATES)) {
				const r = await openStar(w, parts);
				star[w + '-' + st] = r;
				const p = r.pop;
				const btns = p.parts.filter((q) => PERSONS.test(q.key));
				assert(btns.length === 3 && btns.every((q) => q.lines === 1 && !q.outside && !q.clipped), `T205(1) ${w}px ${st}: 入れる人の3つのボタンの字がどれも1行・小窓の外に出ない・切れない`, btns);
				const was = BASE['star-pop-' + st + '-' + w];
				const wasLines = new Map(was.parts.map((q) => [q.key, q.lines]));
				const others = p.parts.filter((q) => !PERSONS.test(q.key));
				const grew = others.filter((q) => !wasLines.has(q.key) || q.lines > wasLines.get(q.key));
				const bad = others.filter((q) => q.outside || q.clipped);
				assert(others.length === was.parts.length - 3 && grew.length === 0 && bad.length === 0, `T205(1) ${w}px ${st}: 小窓のほかの部品（${others.length}個）の行の数が直す前から増えない・外に出ない・切れない`, { grew, bad, n: others.length });
				assert(p.wire && p.wire.inside && p.bodyScroll <= 1 && p.docOverflow <= 0, `T205(1) ${w}px ${st}: 模式図は小窓の中・小窓の中のスクロールなし・ページの横スクロールなし`, { wire: p.wire, scroll: p.bodyScroll, doc: p.docOverflow });
				assert(r.errors.length === 0, `T205(1) ${w}px ${st}: コンソールのエラー0`, r.errors.slice(0, 3));
			}
		});
	}

	await block('T205(2) ③の中の「結合画像の設定」と UmaExam の引き出しの小窓は直す前と同じ（5つの幅・部品ごとの行の数・左端・幅とパネルの大きさ）', async () => {
		for (const w of WIDTHS) {
			for (const st of Object.keys(STATES)) {
				const r = star[w + '-' + st] || await openStar(w, STATES[st]);
				const d = sameAs(r.step3, BASE['star-step3-' + st + '-' + w]);
				assert(d.length === 0, `T205(2) ${w}px ${st}: ③の中の「結合画像の設定」は直す前と同じ`, d.slice(0, 4));
			}
			const ex = await openPage(browser, base, 'exam.html', { width: w, height: w < 600 ? 812 : 900 });
			const page = ex.page;
			await page.waitForTimeout(500);
			if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
			await page.waitForTimeout(200);
			await page.evaluate(async () => {
				stitchOnePerson = async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; c._stitchWarnings = []; c._sourcePlacements = []; return c; };
				persons[0].files = [{ name: 'a.png' }];
				const run = captureRun();
				lastOcrRun = run;
				await runImageStitching(run);
				selectResultTab('stitch');
				openDrawer('result');
			});
			await page.waitForTimeout(400);
			await page.click('#stitch-drawer-fab');
			await page.waitForTimeout(250);
			await page.mouse.move(0, 0);
			const m = await page.evaluate(MEASURE_LINES, '#stitch-drawer-pop');
			const d = sameAs(m, BASE['exam-pop-' + w]);
			assert(d.length === 0, `T205(2) ${w}px UmaExam の引き出しの「結合画像の設定」は直す前と同じ`, d.slice(0, 4));
			assert(jsErrors(ex.errors).length === 0, `T205(2) ${w}px UmaExam: コンソールのエラー0`, jsErrors(ex.errors).slice(0, 3));
			await ex.ctx.close();
		}
	});
}
