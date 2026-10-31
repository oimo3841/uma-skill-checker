// C-140（2026-10-10・ツール全体の微調整2）E の検査: 2nd Edition の告知（お知らせ）。run-smoke.mjs の末尾から register20e() で呼ばれる
// （塊の見出しはすべて「微調整2E」で始まる。`npm run test:visual -- --only=微調整2E` で回せる）。
//
// E1 既読の人に1度だけ出る・閉じ方4つで既読になる・開き直すと出ない／E2 初めての人は画面の告知だけ（2枚は重ねない）／E3 先に出す告知があれば次の読み込みで出る／
// E4 ?notice=force（既読でも出る・何も書かない）／E5 ツール切替のメニューの「お知らせ」から読み直せる／E6 画像（読み込める・alt・日付つきの名前・容量）／
// E7 文面と画像のパスは js/announce.js の1か所だけ／E8 見た目（ライト・ダーク・375・393・1280px。小窓の中でスクロール）

import { reloadReady } from './lib/page-ready.mjs';
import { withNoticeClock, NOTICE_FIXED_TIME } from './lib/fixtures.mjs';
export async function register20e(env) {
	// お知らせの塊なので、日付を固定して回す（C-260 の (a)・2026-10-31。lib/fixtures.mjs の NOTICE_FIXED_TIME）
	const block = (title, fn) => env.block(title, () => withNoticeClock(NOTICE_FIXED_TIME, fn));
	const { assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	// C-142（微調整4・E）: 告知は exam だけに出す（UmaStar の告知は完成後）。special には出ないことは 微調整4E1 が見る
	const TOOLS_ALL = [
		{ name: 'exam', file: 'exam.html', key: 'uma-exam-edition-notice', ok: '#ui-notice-ok', seen: { 'uma-exam-ui-notice': 'UI_NOTICE_ID', 'uma-exam-target-notice': 'TARGET_NOTICE_ID', 'uma-exam-scenario-notice': 'UmaAnnounce.SCENARIO_PENDING.id' }, back: '#ui-notice-backdrop' },
		{ name: 'special', file: 'special.html', key: 'uma-special-edition-notice', ok: '#ui-notice-ok', seen: { 'uma-special-ui-notice': 'UI_NOTICE_ID', 'uma-special-alpha-notice': 'ALPHA_NOTICE_ID', 'uma-special-catalog-notice': 'CATALOG_NOTICE_ID', 'uma-special-scenario-notice': 'UmaAnnounce.SCENARIO_PENDING.id' }, back: '#ui-notice-backdrop' },
	];
	const TOOLS = TOOLS_ALL.filter((t) => t.name === 'exam');
	const ID = async (page, names) => page.evaluate((ns) => Object.fromEntries(ns.map((n) => [n, eval(n)])), names);
	const noticeOpen = (page) => page.evaluate(() => { const d = document.getElementById('ui-notice'); return !!d && !d.hidden; });
	const noticeKind = (page) => page.evaluate(() => uiNoticeKind);
	/** ツールを開く。o.store＝開く前に仕込む保存値／o.query＝URLの後ろ／o.w・o.h・o.theme */
	const open = async (t, o = {}) => {
		const r = await openPage(browser, base, t.file + (o.query || ''), { width: o.w || 1280, height: o.h || 900 });
		const page = r.page;
		const store = Object.assign({}, o.store || {});
		if (o.theme) store['uma-tools-theme'] = o.theme;
		if (Object.keys(store).length) {
			// 最初の読み込みで、初めての人として保存されたものを消してから、仕込む（初めての人は告知を「見たこと」にするため）
			await page.evaluate((s) => { try { localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } catch (e) {} }, store);
			await reloadReady(page);
		}
		await page.waitForTimeout(o.wait || 1500);
		return r;
	};
	/** 「見た」ことにする保存値を、ページの定数から作る（告知のIDは検査に書かない） */
	const seenStore = async (t, except) => {
		const r = await openPage(browser, base, t.file, { width: 1280, height: 900 });
		const ids = await ID(r.page, Object.values(t.seen));
		await r.ctx.close();
		const s = {};
		Object.entries(t.seen).forEach(([k, v]) => { if (!except || !except.includes(k)) s[k] = ids[v]; });
		if (t.name === 'exam') s['uma-exam-ui-mode'] = 'new';
		return s;
	};
	const allKeys = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });

	await block('微調整2E1 既読の人（これまでの告知を見た人）には、2nd Edition の告知が1度だけ出る／✕・OK・背景・Esc のどれで閉じても既読になり、開き直すと出ない（exam・special）', async () => {
		for (const t of TOOLS) {
			for (const how of ['ok', 'x', 'backdrop', 'esc']) {
				const store = await seenStore(t);
				const { ctx, page, errors } = await open(t, { store });
				const id = await page.evaluate(() => UmaAnnounce.ANNOUNCE.id);
				const kind = await noticeKind(page);
				assert(await noticeOpen(page) && kind === 'edition', '微調整2E1(' + t.name + '・' + how + '): 起動すると2nd Edition の告知の小窓が出る', { open: await noticeOpen(page), kind });
				const body = await page.evaluate(() => { const b = document.getElementById('ui-notice-body-edition'); return { hidden: b.hidden, title: b.querySelector('#' + UmaAnnounce.TITLE_ID).textContent, h: [...b.querySelectorAll('.announce-h')].map((e) => e.textContent), label: document.getElementById('ui-notice').getAttribute('aria-labelledby'), layoutHidden: document.getElementById('ui-notice-body-layout').hidden }; });
				const want = await page.evaluate(() => ({ title: UmaAnnounce.ANNOUNCE.label, h: UmaAnnounce.ANNOUNCE.sections.map((s) => s.heading), tid: UmaAnnounce.TITLE_ID }));
				assert(!body.hidden && body.layoutHidden && body.title === want.title && JSON.stringify(body.h) === JSON.stringify(want.h) && body.label === want.tid && (await page.evaluate((i) => document.getElementById(i) !== null, want.tid)),
					'微調整2E1(' + t.name + '・' + how + '): 小窓の中身は定義（各ツールの節）どおりで、読み上げの名前は「お知らせ」（見えない見出し。微調整4E）', { body, want });
				assert((await page.evaluate((k) => localStorage.getItem(k), t.key)) === null, '微調整2E1(' + t.name + '・' + how + '): 出した時点では既読にしない（閉じたときに既読になる）', null);
				if (how === 'ok') await page.click(t.ok);
				else if (how === 'x') await page.click('#ui-notice .notice-close');
				else if (how === 'backdrop') await page.evaluate(() => document.getElementById('ui-notice-backdrop').click());
				else await page.keyboard.press('Escape');
				await page.waitForTimeout(150);
				const stored = await page.evaluate((k) => localStorage.getItem(k), t.key);
				assert(!(await noticeOpen(page)) && stored === id, '微調整2E1(' + t.name + '・' + how + '): 閉じると既読（保存した値は告知のID）', { stored, id });
				await reloadReady(page);
				await page.waitForTimeout(1500);
				assert(!(await noticeOpen(page)), '微調整2E1(' + t.name + '・' + how + '): 開き直すと出ない', null);
				assert(jsErrors(errors).length === 0, '微調整2E1(' + t.name + '・' + how + '): コンソールエラーなし', errors.slice(0, 3));
				await ctx.close();
			}
		}
	});

	await block('微調整2E2 初めての人には画面の告知だけを出し、2nd Edition の告知は「見たこと」にする（小窓は1枚だけ）／先に出す告知が未読の人には、そちらを先に出して次の読み込みで2nd Edition を出す', async () => {
		for (const t of TOOLS) {
			// 初めて: 保存値なし
			{
				const { ctx, page } = await open(t, {});
				const id = await page.evaluate(() => UmaAnnounce.ANNOUNCE.id);
				const kind = await noticeKind(page);
				// お知らせの履歴（2026-10-25）: 初めての人にも履歴の最新の1件（edition）で開く。閉じると、このツールの告知がすべて既読になる
				assert(await noticeOpen(page) && kind === 'edition', '微調整2E2(' + t.name + '・初めて): 履歴の最新の1件（2nd Edition の告知）で開く', kind);
				assert((await page.evaluate((k) => localStorage.getItem(k), t.key)) === null, '微調整2E2(' + t.name + '・初めて): 開いただけでは既読にしない（閉じたときに履歴の3件とも既読にする）', null);
				await page.click(t.ok);
				assert((await page.evaluate((k) => localStorage.getItem(k), t.key)) === id, '微調整2E2(' + t.name + '・初めて): 閉じると2nd Edition の告知も既読になる', null);
				await reloadReady(page);
				await page.waitForTimeout(1500);
				assert(!(await noticeOpen(page)), '微調整2E2(' + t.name + '・初めて): 次に開いても2nd Edition の告知は出ない', null);
				await ctx.close();
			}
			// 先に出す告知が未読（exam＝対象スキルの告知・special＝改修中の断り）の人: 先にそちらを出し、閉じたら次の読み込みで2nd Edition
			{
				const firstKey = t.name === 'exam' ? 'uma-exam-target-notice' : 'uma-special-alpha-notice';
				const store = await seenStore(t, [firstKey]);
				const { ctx, page } = await open(t, { store });
				const k1 = await noticeKind(page);
				// お知らせの履歴（2026-10-25）: 履歴の3件のどれかが未読なら、最新の1件（edition）で開く。先の告知は ‹ › の先にある。閉じると3件とも既読
				assert(await noticeOpen(page) && k1 === 'edition', '微調整2E2(' + t.name + '・先の告知が未読): 最新の1件（2nd Edition の告知）で開く（先の告知は › の先）', k1);
				await page.click('[data-notice-nav="older"]');
				const k1b = await noticeKind(page);
				assert(k1b === (t.name === 'exam' ? 'target' : 'alpha'), '微調整2E2(' + t.name + '・先の告知が未読): › で先の告知（' + k1b + '）に移れる', k1b);
				await page.click(t.ok);
				const firstSeen = await page.evaluate((k) => localStorage.getItem(k), firstKey);
				await reloadReady(page);
				await page.waitForTimeout(1500);
				const open2 = await noticeOpen(page);
				assert(firstSeen !== null && !open2, '微調整2E2(' + t.name + '・先の告知が未読): 閉じると先の告知も既読になり、次の読み込みでは出ない', { firstSeen, open2 });
				await ctx.close();
			}
		}
	});

	await block('微調整2E3 ?notice=force: 既読でも2nd Edition の告知だけが出る／閉じても既読の保存値は1つも変わらない（文面の確認用）／force なしでは従来どおり', async () => {
		for (const t of TOOLS) {
			for (const [stateName, makeStore] of [['既読', () => seenStore(t)], ['未読', async () => ({})]]) {
				const store0 = await makeStore();
				const store = Object.assign({}, store0);
				if (stateName === '既読') store[t.key] = await (async () => { const r = await openPage(browser, base, t.file, { width: 1280, height: 900 }); const id = await r.page.evaluate(() => UmaAnnounce.ANNOUNCE.id); await r.ctx.close(); return id; })();
				for (const how of ['ok', 'esc']) {
					const { ctx, page, errors } = await open(t, { store, query: '?notice=force' });
					const kind = await noticeKind(page);
					const before = await allKeys(page);
					assert(await noticeOpen(page) && kind === 'edition', '微調整2E3(' + t.name + '・' + stateName + '・' + how + '): ?notice=force で2nd Edition の告知が出る（既読でも）', { open: await noticeOpen(page), kind });
					if (how === 'ok') await page.click(t.ok); else await page.keyboard.press('Escape');
					await page.waitForTimeout(150);
					const after = await allKeys(page);
					assert(!(await noticeOpen(page)) && JSON.stringify(Object.keys(after).sort()) === JSON.stringify(Object.keys(before).sort()) && Object.keys(before).every((k) => after[k] === before[k]),
						'微調整2E3(' + t.name + '・' + stateName + '・' + how + '): 閉じても保存値は1つも変わらない（既読を書かない）', { before: Object.keys(before), after: Object.keys(after) });
					assert(jsErrors(errors).length === 0, '微調整2E3(' + t.name + '・' + stateName + '・' + how + '): コンソールエラーなし', errors.slice(0, 3));
					await ctx.close();
				}
			}
			// force なし（既読）では出ない／未読では force を付けて閉じたあと、force なしで開くと従来どおりの流れ
			{
				const store = await seenStore(t);
				const { ctx, page } = await open(t, { store, query: '?notice=force' });
				await page.click(t.ok);
				await page.goto(base + '/' + t.file, { waitUntil: 'networkidle' });
				await page.waitForTimeout(1500);
				assert((await noticeOpen(page)) && (await noticeKind(page)) === 'edition', '微調整2E3(' + t.name + '): force で閉じたあと、force なしで開くと（未読のままなので）2nd Edition の告知が出る', null);
				await ctx.close();
			}
		}
	});

	await block('微調整2E4 ツール切替のメニューの「お知らせ」から、いつでも2nd Edition の告知を読み直せる／メニューは閉じる／既読の人が読み直しても保存値は変わらない', async () => {
		for (const t of TOOLS) {
			const store = await seenStore(t);
			const id0 = await (async () => { const r = await openPage(browser, base, t.file, { width: 1280, height: 900 }); const id = await r.page.evaluate(() => UmaAnnounce.ANNOUNCE.id); await r.ctx.close(); return id; })();
			store[t.key] = id0;
			for (const w of [1280, 375]) {
				const { ctx, page, errors } = await open(t, { store, w });
				assert(!(await noticeOpen(page)), '微調整2E4(' + t.name + '・' + w + 'px): 既読の人には自動では出ない', null);
				const before = await allKeys(page);
				await page.click('#tool-dropdown-btn');
				const menu = await page.evaluate(() => { const b = document.getElementById('announce-menu-btn'); const r = b.getBoundingClientRect(); const m = document.getElementById('tool-dropdown-menu').getBoundingClientRect(); return { text: b.textContent.trim(), w: r.width, h: r.height, inMenu: r.left >= m.left - 0.5 && r.right <= m.right + 0.5 && r.bottom <= m.bottom + 0.5, menuVisible: !document.getElementById('tool-dropdown-menu').classList.contains('hidden'), vw: document.documentElement.clientWidth, right: r.right }; });
				assert(menu.text === 'お知らせ' && menu.menuVisible && menu.inMenu && menu.h >= 36 && menu.right <= menu.vw, '微調整2E4(' + t.name + '・' + w + 'px): メニューに「お知らせ」の項目がある（メニューの枠の中・押せる大きさ）', menu);
				await page.click('#announce-menu-btn');
				await page.waitForTimeout(150);
				const st = await page.evaluate(() => ({ open: !document.getElementById('ui-notice').hidden, kind: uiNoticeKind, menuHidden: document.getElementById('tool-dropdown-menu').classList.contains('hidden') }));
				assert(st.open && st.kind === 'edition' && st.menuHidden, '微調整2E4(' + t.name + '・' + w + 'px): 押すと2nd Edition の告知が出て、メニューは閉じる', st);
				await page.keyboard.press('Escape');
				await page.waitForTimeout(150);
				const after = await allKeys(page);
				assert(!(await noticeOpen(page)) && Object.keys(before).every((k) => after[k] === before[k]) && Object.keys(after).length === Object.keys(before).length, '微調整2E4(' + t.name + '・' + w + 'px): 読み直して閉じても、既読の保存値は変わらない', { before, after });
				assert(jsErrors(errors).length === 0, '微調整2E4(' + t.name + '・' + w + 'px): コンソールエラーなし', errors.slice(0, 3));
				await ctx.close();
			}
		}
	});

	await block('微調整2E5 告知の画像: 読み込める（壊れた画像がない）・alt がある・日付つきの名前・1枚約150KB以下・定義どおりのパス・小窓の幅に収まる（exam・special）', async () => {
		for (const t of TOOLS) {
			const { ctx, page, errors } = await open(t, { query: '?notice=force', w: 375 });
			await page.waitForFunction(() => [...document.querySelectorAll('#ui-notice-body-edition img')].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
			const r = await page.evaluate(() => {
				const imgs = [...document.querySelectorAll('#ui-notice-body-edition img')];
				const dlg = document.getElementById('ui-notice').getBoundingClientRect();
				const want = UmaAnnounce.ANNOUNCE.sections.flatMap((s) => s.images);
				return { n: imgs.length, wantN: want.length, srcs: imgs.map((i) => i.getAttribute('src')), wantSrcs: want.map((x) => x.src), alts: imgs.map((i) => i.alt), wantAlts: want.map((x) => x.alt),
					ok: imgs.map((i) => i.complete && i.naturalWidth > 0), nat: imgs.map((i) => [i.naturalWidth, i.naturalHeight]), fit: imgs.map((i) => { const b = i.getBoundingClientRect(); return b.left >= dlg.left && b.right <= dlg.right + 0.5 && b.width > 100; }), date: UmaAnnounce.ANNOUNCE.date };
			});
			assert(r.n === r.wantN && r.n >= 2 && JSON.stringify(r.srcs) === JSON.stringify(r.wantSrcs) && r.ok.every(Boolean) && r.fit.every(Boolean) && r.alts.every((a, i) => a.length > 5 && a === r.wantAlts[i]),
				'微調整2E5(' + t.name + '): 画像は定義どおりの数・パス・alt で、すべて読み込める。小窓の幅に収まる', r);
			for (const src of r.srcs) {
				const p = path.join(REPO_ROOT, src);
				const size = fs.existsSync(p) ? fs.statSync(p).size : -1;
				assert(size > 0 && size <= 150 * 1024 && /^img\/[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.(png|webp)$/.test(src) && src.includes(r.date), '微調整2E5(' + t.name + '): ' + src + ' は実在し、日付つきの名前で、150KB以下（' + Math.round(size / 1024) + 'KB）', { size });
			}
			assert(jsErrors(errors).length === 0, '微調整2E5(' + t.name + '): コンソールエラー（画像の読み込み失敗を含む）なし', errors.slice(0, 3));
			// 画像の読み込み失敗は 404 として console に出るので、ネットワークの失敗も見る
			await ctx.close();
		}
	});

	await block('微調整2E6 文面・画像のパス・告知の番号・日付は js/announce.js の1か所だけ（exam・special の HTML には書かない）／両ツールで同じ中身', async () => {
		const src = fs.readFileSync(path.join(REPO_ROOT, 'js/announce.js'), 'utf8');
		const { ctx, page } = await open(TOOLS[0], { query: '?notice=force' });
		const A = await page.evaluate(() => UmaAnnounce.ANNOUNCE);
		await ctx.close();
		// 各節の見出し（ツール名）は、ページの題などにも出る名前なので、文面の重複の検査からは外す
		const texts = [A.id].concat(A.sections.flatMap((s) => [s.lead].concat(s.lines, s.images.flatMap((i) => [i.src, i.alt]))));
		assert(texts.length >= 8 && texts.every((x) => src.includes(x)) && A.sections.every((s) => src.includes(s.heading)), '微調整2E6: 告知の文面・画像のパス・alt・番号は js/announce.js に書いてある', { n: texts.length });
		for (const f of ['exam.html', 'special.html']) {
			const html = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
			const dup = texts.filter((x) => html.includes(x));
			assert(dup.length === 0, '微調整2E6: ' + f + ' には告知の文面・画像のパス・alt・番号を書いていない（定義は1か所）', dup);
		}
		const bodies = [];
		for (const t of TOOLS) {
			const r = await open(t, { query: '?notice=force', w: 375 });
			bodies.push(await r.page.evaluate(() => document.getElementById('ui-notice-body-edition').innerText.replace(/\s+/g, ' ').trim()));
			await r.ctx.close();
		}
		// C-142（微調整4・E）: 告知は exam だけ。special と同じ中身かの比較は外し、exam の中身が定義の文面を含むことを見る
		assert(bodies.length === 1 && A.sections.every((sec) => bodies[0].includes(sec.lead)) && bodies[0].length > 60, '微調整2E6: 小窓の中身の文字は定義どおり（exam）', { exam: bodies[0].slice(0, 80) });
	});

	await block('微調整2E7 小窓の見た目: ライト・ダーク／375・393・1280px で崩れない（横にはみ出さない・画面の内側・小窓の中でスクロール・OKが見える）／画像の縁取り', async () => {
		for (const t of TOOLS) {
			for (const [w, h, theme] of [[375, 667, 'light'], [375, 667, 'dark'], [393, 852, 'light'], [1280, 800, 'light'], [1280, 800, 'dark']]) {
				const { ctx, page, errors } = await open(t, { query: '?notice=force', w, h, theme });
				await page.waitForFunction(() => [...document.querySelectorAll('#ui-notice-body-edition img')].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
				const r = await page.evaluate(() => {
					const d = document.getElementById('ui-notice'), b = d.querySelector('.notice-body'), f = d.querySelector('.notice-foot'), ok = document.getElementById('ui-notice-ok');
					const dr = d.getBoundingClientRect(), br = b.getBoundingClientRect(), fr = f.getBoundingClientRect(), or = ok.getBoundingClientRect();
					const img = document.querySelector('#ui-notice-body-edition img'), cs = getComputedStyle(img);
					const secs = [...document.querySelectorAll('#ui-notice-body-edition .announce-sec')].map((s) => s.getBoundingClientRect());
					return { sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight, dl: dr.left, dr: dr.right, dt: dr.top, db: dr.bottom,
						bodyOverflowY: getComputedStyle(b).overflowY, scrollH: b.scrollHeight, clientH: b.clientHeight, bodyScrollW: b.scrollWidth, bodyClientW: b.clientWidth, okIn: or.top >= dr.top && or.bottom <= dr.bottom + 0.5 && or.bottom <= window.innerHeight + 0.5 && or.height >= 30,
						imgBorder: cs.borderTopWidth + ' ' + cs.borderTopColor, imgBorderOk: parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopColor !== 'rgba(0, 0, 0, 0)', dlgBg: getComputedStyle(d).backgroundColor, theme: document.documentElement.getAttribute('data-theme'),
						secLeft: Math.min(...secs.map((s) => s.left)), secRight: Math.max(...secs.map((s) => s.right)) };
				});
				const tag = t.name + '・' + w + 'px・' + theme;
				assert(r.sw <= r.vw && r.dl >= 0 && r.dr <= r.vw && r.dt >= 0 && r.db <= r.vh + 0.5 && r.bodyScrollW <= r.bodyClientW + 0.5 && r.okIn && r.secLeft >= r.dl && r.secRight <= r.dr,
					'微調整2E7(' + tag + '): 小窓は画面の内側・横にはみ出さない・OKボタンが見える（小窓の中身が長くても本文だけがスクロールする）', r);
				// C-142（微調整4・E）: 文面が短くなり 375×667px でも収まるようになった。長いときは本文だけがスクロールする作り（overflow-y: auto）であることを見る
				if (h <= 700) assert(r.bodyOverflowY === 'auto' && r.scrollH >= r.clientH - 0.5, '微調整2E7(' + tag + '): 低い画面でも、本文は小窓の中でスクロールできる作り（' + r.scrollH + ' / ' + r.clientH + '）', { overflowY: r.bodyOverflowY, scrollH: r.scrollH, clientH: r.clientH });
				assert(r.imgBorderOk, '微調整2E7(' + tag + '): 画像には縁取りがある（ライトの画像を暗い面の上に置いても違和感がない）', r.imgBorder);
				if (theme === 'dark') assert(r.theme === 'dark' && r.dlgBg !== 'rgb(255, 255, 255)', '微調整2E7(' + tag + '): ダークでは小窓の地が暗い', { bg: r.dlgBg, theme: r.theme });
				assert(jsErrors(errors).length === 0, '微調整2E7(' + tag + '): コンソールエラーなし', errors.slice(0, 3));
				await ctx.close();
			}
		}
	});
}
