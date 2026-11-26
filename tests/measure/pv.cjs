// T212（DG の pv9.cjs の写し。waitFn の段を足した）：製品（見るだけ）と見本を手元の http で開いて、撮る・測る（使い捨て）。
// 使い方: node output/scratch/t212/pv9.cjs <spec.json>
// spec: { outDir, jobs: [ { name, url, w, h, theme, ls: {key: value}, steps: [ {click:sel} | {text:'…'} | {eval:'js'} | {wait:ms} | {key:'Escape'} ], shot: true|sel, full, dump: sel, measure: 'js' } ] }
// 製品のファイルは書き換えない。localStorage は Playwright の使い捨ての文脈の中だけ。
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const LOCK = path.join(os.tmpdir(), 'uma-test-visual.lock');
function alive(pid) { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return !!e && e.code === 'EPERM'; } }
function busy() { try { const h = JSON.parse(fs.readFileSync(LOCK, 'utf8')); return alive(h.pid) ? h : null; } catch (e) { return null; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// T219: 組の waitFn（文字列）を待つ。文字列が関数（() => {…}）なら呼び、式ならその値を見る。文字列をそのまま
// page.waitForFunction に渡すと関数は呼ばれず、関数そのものが「真」になって、待たずに進む（T217 で見つけた）。
// 上限（waitMs。無ければ 300秒）に達したとき・条件が例外を投げたとき（失敗した画面）は例外にして、その組を失敗にする。
async function waitFor(page, s) {
	const ms = s.waitMs || 300000;
	try { await page.waitForFunction('(() => { const f = (' + s.waitFn + '\n); return typeof f === "function" ? f() : f; })()', null, { timeout: ms }); }
	catch (e) { throw new Error((e.name === 'TimeoutError' ? '待ちの上限（' + Math.round(ms / 1000) + '秒）に達した: ' : '待ちの条件が例外: ') + e.message); }
}
// PV_ROOT: 別の版の木（git archive で取り出したもの）を測るとき。ふだんはこのリポジトリ
const ROOT = process.env.PV_ROOT ? path.resolve(process.env.PV_ROOT) : path.resolve(__dirname, '../..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function serve() {
	return new Promise(res => {
		const srv = http.createServer((req, rsp) => {
			let p = decodeURIComponent(req.url.split('?')[0]);
			const f = path.join(ROOT, p);
			if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
			rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
		}).listen(0, '127.0.0.1', () => res(srv));
	});
}
(async () => {
	const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
	let freeSince = Date.now();
	// T212: ロックを取った包み（locked.mjs）の中から呼ぶときは、自分の包みのロックを待たない
	if (!process.env.PV_LOCKED && !process.env.T214_LOCKED && !process.env.T212_LOCKED) for (;;) { const h = busy(); if (h) { freeSince = Date.now(); console.log('待ち: PID ' + h.pid); await sleep(8000); } else if (Date.now() - freeSince >= 20000) break; await sleep(2000); }
	console.log('ロック: 20秒続けて空き');
	if (spec.outDir) fs.mkdirSync(spec.outDir, { recursive: true });
	const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
	const browser = await chromium.launch(process.env.PV_CHANNEL ? { channel: process.env.PV_CHANNEL } : {});
	const results = {};
	for (const j of spec.jobs) {
		const ctx = await browser.newContext({ viewport: { width: j.w || 390, height: j.h || 844 }, deviceScaleFactor: j.dpr || 2, colorScheme: j.theme === 'dark' ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.setDefaultTimeout(6000);
		const errs = [];
		page.on('pageerror', e => errs.push(e.message));
		const ls = Object.assign({}, j.ls || {}); if (j.theme === 'dark' && !/^\/lab\//.test(j.url)) ls['uma-tools-theme'] = 'dark';
		await page.addInitScript((d) => { try { if (!sessionStorage.getItem('__fx')) { sessionStorage.setItem('__fx', '1'); for (const k in d) localStorage.setItem(k, typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k])); } } catch (e) {} }, ls);
		try {
			await page.goto(base + j.url, { waitUntil: 'networkidle', timeout: 60000 });
			if (!/^\/lab\//.test(j.url)) {
				await sleep(1500);
				for (let k = 0; k < 6; k++) { let hit = false; for (const sel of ['[data-act="notice-ok"]', '#ui-notice-ok']) if (await page.isVisible(sel).catch(() => false)) { await page.click(sel); await sleep(350); hit = true; } if (!hit) break; }
			}
			for (const s of (j.steps || [])) {
				if (s.click) await page.click(s.click, { force: !!s.force });
				else if (s.text) await page.getByText(s.text, { exact: !!s.exact }).first().click({ force: !!s.force });
				else if (s.eval) await page.evaluate(s.eval);
				else if (s.fill) await page.fill(s.fill, s.value || '');
				else if (s.type) await page.keyboard.type(s.type);
				else if (s.files) await page.setInputFiles(s.files, s.paths.map(x => path.isAbsolute(x) ? x : path.join(ROOT, x)));
				else if (s.focus) await page.focus(s.focus);
				else if (s.chooser) { const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), page.click(s.chooser)]); await fc.setFiles(s.paths.map(x => path.isAbsolute(x) ? x : path.join(ROOT, x))); if (s.waitSel) await page.waitForSelector(s.waitSel, { timeout: s.waitMs || 300000 }); if (s.waitFn) await waitFor(page, s); }
				else if (s.waitFn) { await waitFor(page, s); }
				else if (s.goto) { await page.goto(base + s.goto, { waitUntil: 'networkidle', timeout: 60000 }); }
				else if (s.shot && spec.outDir) { await page.screenshot({ path: path.join(spec.outDir, j.name + '-' + s.shot + '.png'), fullPage: !!s.full, animations: 'disabled' }); }
				else if (s.key) await page.keyboard.press(s.key);
				else if (s.size) await page.setViewportSize(s.size);
				await sleep(s.wait || 250);
			}
			await page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
			await page.mouse.move(0, 0); await sleep(300);
			const r = {};
			if (j.dump) r.dump = await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map(e => e.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 6000)), j.dump);
			if (j.measure) r.measure = await page.evaluate(j.measure);
			if (j.widths) { r.byW = {}; const code = fs.readFileSync(path.join(__dirname, j.measureFile || 'collect.js'), 'utf8');
				let firstW = true; r.parts = null;
				for (const w of j.widths) { await page.setViewportSize({ width: w, height: j.h || 844 }); await sleep(j.settle || 450); if (j.after) { await page.evaluate(j.after); await sleep(200); } await page.mouse.move(0, 0);
					if (spec.parts) await page.evaluate(() => { window.__wantParts = true; });
					r.byW[w] = await page.evaluate(code);
					if (spec.parts) await page.evaluate(() => { window.__wantParts = false; });
					if (r.byW[w] && r.byW[w].parts) {   // 幅ごとの部品を合わせる（PC の幅だけに出る部品も地図に入れる）
						const p = r.byW[w].parts; delete r.byW[w].parts;
						if (!r.parts) r.parts = { classes: [], ids: [], contains: {} };
						r.parts.classes = Array.from(new Set(r.parts.classes.concat(p.classes))).sort(); r.parts.ids = Array.from(new Set(r.parts.ids.concat(p.ids))).sort();
						for (const k of Object.keys(p.contains)) r.parts.contains[k] = Array.from(new Set((r.parts.contains[k] || []).concat(p.contains[k]))).sort();
					}
					firstW = false;
					if (j.shotW && spec.outDir && j.shotW.indexOf(w) >= 0) await page.screenshot({ path: path.join(spec.outDir, j.name + '-' + w + '.png'), fullPage: !!j.full, animations: 'disabled' }); } }
			r.sx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
			if (j.shot && spec.outDir) {
				const p = path.join(spec.outDir, j.name + '.png');
				if (typeof j.shot === 'string') await page.locator(j.shot).first().screenshot({ path: p, animations: 'disabled' });
				else await page.screenshot({ path: p, fullPage: !!j.full, animations: 'disabled' });
			}
			if (errs.length) r.errs = errs.slice(0, 5);
			results[j.name] = r;
		} catch (e) { results[j.name] = { fail: String(e).slice(0, 400), failWidths: j.widths || [j.w || 390], errs: errs.slice(0, 5) }; console.log('失敗 ' + j.name + '（幅 ' + results[j.name].failWidths.join(',') + '）: ' + String(e).split('\n')[0].slice(0, 300)); try { if (spec.outDir) await page.screenshot({ path: path.join(spec.outDir, j.name + '-FAIL.png') }); } catch (e2) {} }
		await ctx.close();
	}
	await browser.close(); srv.close();
	const out = process.argv[3] || path.join(__dirname, 'pv9-out.json');
	fs.writeFileSync(out, JSON.stringify(results, null, 1));
	const fails = Object.keys(results).filter(k => results[k].fail);
	console.log('jobs ' + spec.jobs.length + '・失敗 ' + fails.length + (fails.length ? ': ' + fails.join(', ') : '') + ' → ' + out);
	console.log('DONE');
})().catch(e => { console.error(e); console.log('DONE (失敗)'); process.exit(1); });
