// お知らせ段2＋3（T55・2026-11-01。おいもさんの決定 C-260 の (b)(c)・T54 の報告への回答 2026-11-01）の検査。
// run-smoke.mjs の末尾から register85() で呼ばれる（塊の見出しはすべて「T55お知らせ」で始まる。`npm run test:visual -- --only=T55お知らせ` で回せる）。
//
// 決め:
//  (c) 結合画像のリニューアルのお知らせを UmaStar（special.html）だけに1件。見出し「結合画像のリニューアル」・本文「1枚の結合画像で、編成と因子をまとめて見られるようになりました。」・画像1枚（alt=""）。
//      箇条書きは無い。見出しは js/announce.js の fill の形（.announce-h ＝ --uma-fs-sm の 12px・太字・左寄せ・アイコンなし。
//      指示と T54 の報告は「14px」と書いていたが、fill の形の実際の大きさ〔T54 のモックも同じ CSS〕は 12px。新しい CSS は足さないので 12px を正とする）。画像は img/announce-stitch-<日付>.png（1103×771）。
//      履歴（NOTICE_LIST）の先頭に { kind: 'stitch', date: <push の日>, pages: ['special'] }。既読のキーは uma-special-stitch-notice。
//  (b) S1（layout）・S2（alpha）・S3（catalog）・E1（layout）・E2（target）を外す。E3（edition）は「含め」だけを直す（ID は据え置き）。
//  自動で開くのは、お知らせの日（日本時間）を0日目として30日目まで（C-260 の (a)。段1 のまま）。
// 文面・ID・日付は検査の側に直書きする（実装から読んで作らない）。新シナリオの知らせは実データのまま（on は false）。
import { reloadReady } from './lib/page-ready.mjs';
import { withNoticeClock } from './lib/fixtures.mjs';

export async function register85(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	// (c) の日付（push の日・日本時間）。ここから 0日目・30日目・31日目を作る
	const D = '2026-11-01';
	const D_SLASH = D.replace(/-/g, '/');
	const dayIso = (offset, hm) => { const t = Date.UTC(+D.slice(0, 4), +D.slice(5, 7) - 1, +D.slice(8, 10) + offset); const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' + hm + ':00+09:00'; };
	const AT_DAY0 = dayIso(0, '12:00');
	const HEAD = '結合画像のリニューアル';
	const LEAD = '1枚の結合画像で、編成と因子をまとめて見られるようになりました。';
	const IMG = 'img/announce-stitch-' + D + '.png';
	const STITCH_KEY = 'uma-special-stitch-notice';
	const STITCH_ID = D + '-stitch-renewal';
	const UI_KEY = { special: ['uma-special-ui-notice', '2026-09-new-ui-default'], exam: ['uma-exam-ui-notice', '2026-09-exam-drawer-layout'] };
	const E3_LEAD = '新機能「効率を指定」モードを追加し、全体の文面も見直しました。';
	const E3_ID = '2026-10-11-exam-2nd-edition';
	// (b) で外したものの文面（見出し）と既読のキー
	const GONE = {
		special: { kinds: ['layout', 'alpha', 'catalog'], bodies: ['ui-notice-body-layout', 'ui-notice-body-alpha', 'ui-notice-body-catalog'], keys: ['uma-special-alpha-notice', 'uma-special-catalog-notice'],
			texts: ['スキルの選び方が新しくなりました', '機能を大幅に改修中です', '最新のスキルまで'] },
		exam: { kinds: ['layout', 'target'], bodies: ['ui-notice-body-layout', 'ui-notice-body-target'], keys: ['uma-exam-target-notice'],
			texts: ['画面が新しくなりました', '対象スキルの選択方法がアップデートされました'] },
	};
	const FILE = { special: 'special.html', exam: 'exam.html' };
	const at = (iso, fn) => withNoticeClock(iso, fn);
	const allKeys = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
	const noticeOpen = (page) => page.evaluate(() => { const d = document.getElementById('ui-notice'); return !!d && !d.hidden; });
	/** 開く。o.store＝開く前に仕込む保存値（無ければ初めての人）／o.query／o.w／o.h／o.theme */
	const open = async (name, o = {}) => {
		const r = await openPage(browser, base, FILE[name] + (o.query || ''), { width: o.w || 1280, height: o.h || 900 });
		const store = Object.assign({}, o.store || {});
		if (o.theme) store['uma-tools-theme'] = o.theme;
		if (Object.keys(store).length) {
			await r.page.evaluate((s) => { try { localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } catch (e) {} }, store);
			await reloadReady(r.page);
		}
		await r.page.waitForTimeout(o.wait || 1500);
		if (o.img) await r.page.waitForFunction(() => [...document.querySelectorAll('#ui-notice img')].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
		return r;
	};
	const dlg = (page) => page.evaluate(() => {
		const d = document.getElementById('ui-notice');
		const bodies = [...d.querySelectorAll('.notice-body > div')].filter((x) => /^ui-notice-body-/.test(x.id));
		const shown = bodies.filter((x) => !x.hidden).map((x) => x.id);
		const b = document.getElementById('ui-notice-body-stitch');
		const lab = d.getAttribute('aria-labelledby'), labEl = lab ? document.getElementById(lab) : null;
		const h = b ? b.querySelector('.announce-h') : null;
		const hs = h ? getComputedStyle(h) : null;
		const icon = b ? [...b.querySelectorAll('.notice-icon, [data-lucide], svg')].filter((e) => e.getClientRects().length > 0).length : -1;
		const imgs = b ? [...b.querySelectorAll('img')] : [];
		const dr = d.getBoundingClientRect();
		const pager = d.querySelector('.notice-pager');
		return {
			open: !d.hidden, kind: typeof uiNoticeKind === 'undefined' ? null : uiNoticeKind, shown, bodyIds: bodies.map((x) => x.id),
			tool: d.querySelector('.notice-head-tool') ? d.querySelector('.notice-head-tool').textContent : null,
			date: d.querySelector('.notice-head-date') ? d.querySelector('.notice-head-date').textContent : null,
			pagerHidden: pager ? getComputedStyle(pager).display === 'none' : null,
			labelledby: lab, label: labEl ? labEl.textContent.trim() : null,
			heads: b ? [...b.querySelectorAll('.announce-h')].map((e) => e.textContent) : null,
			leads: b ? [...b.querySelectorAll('.announce-lead')].map((e) => e.textContent) : null,
			lines: b ? b.querySelectorAll('.announce-lines, li').length : null,
			// 見える文字（読み上げだけの見出し「お知らせ」は除く）
			text: b ? (() => { const c = b.cloneNode(true); c.querySelectorAll('.announce-sr').forEach((e) => e.remove()); return c.textContent.replace(/\s+/g, ''); })() : null,
			hFs: hs ? parseFloat(hs.fontSize) : 0, hFw: hs ? hs.fontWeight : '', hAlign: hs ? hs.textAlign : '', hShown: !!h && h.getClientRects().length > 0 && hs.display !== 'none',
			hLeft: h ? Math.round(h.getBoundingClientRect().left - b.getBoundingClientRect().left) : null,
			icon,
			imgs: imgs.map((i) => { const r = i.getBoundingClientRect(); return { src: i.getAttribute('src'), alt: i.getAttribute('alt'), ok: i.complete && i.naturalWidth > 0, nat: [i.naturalWidth, i.naturalHeight], w: Math.round(r.width), fit: r.left >= dr.left - 0.5 && r.right <= dr.right + 0.5 }; }),
		};
	});

	await block('T55お知らせ(1) (c) の文面と形（UmaStar）: 見出し「結合画像のリニューアル」・本文1文・箇条書きなし・画像1枚（alt=""・1103×771）・見出しは fill の形（12px 太字・左寄せ・アイコンなし）／日付・‹ › なし（履歴は1件）／読み上げの名前は「お知らせ」', async () => {
		await at(AT_DAY0, async () => {
			for (const w of [375, 1280]) {
				const r = await open('special', { query: '?notice=force', w, img: true });
				const d = await dlg(r.page);
				const tag = 'special・' + w + 'px';
				assert(d.open && d.kind === 'stitch' && JSON.stringify(d.shown) === JSON.stringify(['ui-notice-body-stitch']), `T55お知らせ(1) ${tag}: (c) の小窓が出る（本文は1つだけ）`, JSON.stringify({ open: d.open, kind: d.kind, shown: d.shown }));
				assert(JSON.stringify(d.heads) === JSON.stringify([HEAD]) && d.hShown && JSON.stringify(d.leads) === JSON.stringify([LEAD]) && d.lines === 0, `T55お知らせ(1) ${tag}: 見出し「${HEAD}」・本文「${LEAD}」・箇条書きなし`, JSON.stringify({ heads: d.heads, leads: d.leads, lines: d.lines }));
				assert(d.text === (HEAD + LEAD).replace(/\s+/g, ''), `T55お知らせ(1) ${tag}: 小窓の本文の文字は見出しと本文だけ（文を足していない）`, d.text);
				assert(d.hFs === 12 && Number(d.hFw) >= 700 && /left|start/.test(d.hAlign) && d.hLeft === 0 && d.icon === 0, `T55お知らせ(1) ${tag}: 見出しは fill の形（12px 太字・左寄せ・アイコンなし）`, JSON.stringify({ fs: d.hFs, fw: d.hFw, align: d.hAlign, left: d.hLeft, icon: d.icon }));
				assert(d.imgs.length === 1 && d.imgs[0].src === IMG && d.imgs[0].alt === '' && d.imgs[0].ok && JSON.stringify(d.imgs[0].nat) === '[1103,771]' && d.imgs[0].fit && d.imgs[0].w > 200, `T55お知らせ(1) ${tag}: 画像は1枚（${IMG}・alt=""・1103×771）で読み込め、小窓の幅に収まる`, JSON.stringify(d.imgs));
				assert(d.tool === 'UmaStar OCR' && d.date === D_SLASH && d.pagerHidden === true, `T55お知らせ(1) ${tag}: 小窓の上に「UmaStar OCR ${D_SLASH}」・履歴は1件なので ‹ n / N › は出ない`, JSON.stringify({ tool: d.tool, date: d.date, pagerHidden: d.pagerHidden }));
				assert(d.labelledby === 'ui-notice-title-stitch' && d.label === 'お知らせ', `T55お知らせ(1) ${tag}: 読み上げの名前は「お知らせ」`, JSON.stringify({ labelledby: d.labelledby, label: d.label }));
				assert(jsErrors(r.errors).length === 0, `T55お知らせ(1) ${tag}: エラー0`, JSON.stringify(jsErrors(r.errors)));
				await r.ctx.close();
			}
			const p = path.join(REPO_ROOT, IMG);
			const size = fs.existsSync(p) ? fs.statSync(p).size : -1;
			const head = size > 0 ? fs.readFileSync(p).subarray(0, 24) : null;
			const wh = head ? [head.readUInt32BE(16), head.readUInt32BE(20)] : null;
			assert(size > 400 * 1024 && size <= 700 * 1024 && head && head.subarray(1, 4).toString() === 'PNG' && JSON.stringify(wh) === '[1103,771]', `T55お知らせ(1): ${IMG} は実在する PNG・1103×771・約 550 KB（${Math.round(size / 1024)} KB）`, JSON.stringify({ size, wh }));
		});
	});

	await block('T55お知らせ(2) 履歴: UmaStar は (c) の1件だけ・UmaExam は E3（2nd Edition）の1件だけ／(c) は UmaExam に出ない（初めての人・?notice=force・メニュー）・UmaExam に (c) の本文の入れ物・文面・既読のキーは無い', async () => {
		await at(AT_DAY0, async () => {
			const hist = {};
			for (const name of ['special', 'exam']) {
				const r = await open(name);
				hist[name] = await r.page.evaluate((p) => ({ h: UmaAnnounce.history(p).map((x) => [x.kind, x.date]), list: UmaAnnounce.NOTICE_LIST.map((n) => [n.kind, n.date, n.pages.join('+')]) }), name);
				await r.ctx.close();
			}
			assert(JSON.stringify(hist.special.h) === JSON.stringify([['stitch', D_SLASH]]), 'T55お知らせ(2) special: 履歴は (c) の1件だけ', JSON.stringify(hist.special.h));
			assert(JSON.stringify(hist.exam.h) === JSON.stringify([['edition', '2026/10/11']]), 'T55お知らせ(2) exam: 履歴は 2nd Edition の1件だけ', JSON.stringify(hist.exam.h));
			assert(JSON.stringify(hist.special.list) === JSON.stringify([['stitch', D_SLASH, 'special'], ['scenario', '2026/10/24', 'exam+special'], ['edition', '2026/10/11', 'exam']]), 'T55お知らせ(2): NOTICE_LIST は (c)（special だけ・先頭）・新シナリオ（履歴の外）・2nd Edition の3行', JSON.stringify(hist.special.list));
			// UmaExam には出ない
			for (const [label, query, menu] of [['初めての人', '', false], ['?notice=force', '?notice=force', false], ['メニューの「お知らせ」', '', true]]) {
				const r = await open('exam', { query });
				if (menu) {
					if (await noticeOpen(r.page)) { await r.page.keyboard.press('Escape'); await r.page.waitForTimeout(200); }
					await r.page.click('#tool-dropdown-btn');
					await r.page.waitForTimeout(200);
					await r.page.click('#announce-menu-btn');
					await r.page.waitForTimeout(200);
				}
				const d = await dlg(r.page);
				const ex = await r.page.evaluate((a) => ({ body: !!document.getElementById('ui-notice-body-stitch'), text: document.documentElement.outerHTML.includes(a.head) || document.documentElement.outerHTML.includes(a.lead), img: [...document.querySelectorAll('img')].some((i) => (i.getAttribute('src') || '').indexOf('announce-stitch') !== -1) }), { head: HEAD, lead: LEAD });
				assert(d.open && d.kind === 'edition' && !ex.body && !ex.text && !ex.img, `T55お知らせ(2) exam・${label}: 出るのは 2nd Edition で、(c) の本文の入れ物・文面・画像は無い`, JSON.stringify({ open: d.open, kind: d.kind, ex }));
				await r.page.click('#ui-notice-ok');
				await r.page.waitForTimeout(250);
				const k = await allKeys(r.page);
				assert(k['uma-special-stitch-notice'] === undefined && k['uma-exam-stitch-notice'] === undefined, `T55お知らせ(2) exam・${label}: 閉じても (c) の既読のキーは書かない`, JSON.stringify(Object.keys(k)));
				assert(jsErrors(r.errors).length === 0, `T55お知らせ(2) exam・${label}: エラー0`, JSON.stringify(jsErrors(r.errors)));
				await r.ctx.close();
			}
			const html = fs.readFileSync(path.join(REPO_ROOT, 'exam.html'), 'utf8');
			assert(html.indexOf('stitch-notice') === -1 && html.indexOf('ui-notice-body-stitch') === -1, 'T55お知らせ(2): exam.html に (c) の既読のキー・本文の入れ物は無い', '');
		});
	});

	await block('T55お知らせ(3) 自動で開く日数（(c)・UmaStar）: お知らせの日を0日目として30日目までは初めての人に自動で出る／31日目は出ず既読も書かない（読み込み直しても）／31日目でもメニューと ?notice=force は開く', async () => {
		const days = [
			{ iso: dayIso(0, '00:30'), label: '0日目（0:30 JST）', open: true },
			{ iso: dayIso(30, '23:30'), label: '30日目（23:30 JST）', open: true },
			{ iso: dayIso(31, '00:30'), label: '31日目（0:30 JST）', open: false },
		];
		for (const day of days) {
			await at(day.iso, async () => {
				const r = await open('special');
				const d = await dlg(r.page);
				if (day.open) {
					assert(d.open && d.kind === 'stitch', `T55お知らせ(3) ${day.label}: 初めての人に (c) が自動で出る`, JSON.stringify({ open: d.open, kind: d.kind }));
				} else {
					assert(!d.open, `T55お知らせ(3) ${day.label}: 初めての人にも自動では出ない`, JSON.stringify({ open: d.open, kind: d.kind }));
					const k = await allKeys(r.page);
					assert(k[STITCH_KEY] === undefined && k[UI_KEY.special[0]] === undefined, `T55お知らせ(3) ${day.label}: 既読の印を書かない`, JSON.stringify(Object.keys(k)));
					await reloadReady(r.page);
					await r.page.waitForTimeout(1500);
					const k2 = await allKeys(r.page);
					assert(!(await noticeOpen(r.page)) && k2[STITCH_KEY] === undefined, `T55お知らせ(3) ${day.label}: 読み込み直しても出ず、書かない`, '');
					await r.page.click('#tool-dropdown-btn');
					await r.page.waitForTimeout(200);
					await r.page.click('#announce-menu-btn');
					await r.page.waitForTimeout(200);
					const dm = await dlg(r.page);
					assert(dm.open && dm.kind === 'stitch', `T55お知らせ(3) ${day.label}: メニューの「お知らせ」からは (c) が開く`, JSON.stringify({ open: dm.open, kind: dm.kind }));
					const f = await open('special', { query: '?notice=force' });
					const df = await dlg(f.page);
					assert(df.open && df.kind === 'stitch', `T55お知らせ(3) ${day.label}: ?notice=force は (c) を開く`, JSON.stringify({ open: df.open, kind: df.kind }));
					await f.ctx.close();
				}
				await r.ctx.close();
			});
		}
	});

	await block('T55お知らせ(4) 既読の読み書き（(c)）: 開いただけでは書かない／✕・OK・背景・Esc のどれで閉じても uma-special-stitch-notice に告知の ID を書く（画面の切り替えの既読の印も今までどおり書く）／開き直すと出ない／既読の人には出ない・ID が違えば出る／?notice=force は何も書かない', async () => {
		await at(AT_DAY0, async () => {
			for (const how of ['ok', 'x', 'backdrop', 'esc']) {
				const r = await open('special');
				const d = await dlg(r.page);
				assert(d.open && d.kind === 'stitch', `T55お知らせ(4) ${how}: 初めての人に (c) が出る`, JSON.stringify({ open: d.open, kind: d.kind }));
				assert((await allKeys(r.page))[STITCH_KEY] === undefined, `T55お知らせ(4) ${how}: 開いただけでは既読を書かない`, '');
				if (how === 'ok') await r.page.click('#ui-notice-ok');
				else if (how === 'x') await r.page.click('#ui-notice .notice-close');
				else if (how === 'backdrop') await r.page.evaluate(() => document.getElementById('ui-notice-backdrop').click());
				else await r.page.keyboard.press('Escape');
				await r.page.waitForTimeout(250);
				const k = await allKeys(r.page);
				assert(!(await noticeOpen(r.page)) && k[STITCH_KEY] === STITCH_ID && k[UI_KEY.special[0]] === UI_KEY.special[1], `T55お知らせ(4) ${how}: 閉じると ${STITCH_KEY} ＝ ${STITCH_ID}（画面の切り替えの既読の印も書く）`, JSON.stringify({ stitch: k[STITCH_KEY], ui: k[UI_KEY.special[0]] }));
				assert(GONE.special.keys.every((x) => k[x] === undefined), `T55お知らせ(4) ${how}: 外したお知らせの既読のキーは書かない`, JSON.stringify(Object.keys(k)));
				await reloadReady(r.page);
				await r.page.waitForTimeout(1500);
				assert(!(await noticeOpen(r.page)), `T55お知らせ(4) ${how}: 開き直すと出ない`, '');
				assert(jsErrors(r.errors).length === 0, `T55お知らせ(4) ${how}: エラー0`, JSON.stringify(jsErrors(r.errors)));
				await r.ctx.close();
			}
			const seen = { [STITCH_KEY]: STITCH_ID, 'uma-special-ui-mode': 'new' };
			const r2 = await open('special', { store: seen });
			assert(!(await noticeOpen(r2.page)), 'T55お知らせ(4): (c) を既読の人には自動で出ない', '');
			await r2.ctx.close();
			const r3 = await open('special', { store: { [STITCH_KEY]: 'other-id', 'uma-special-ui-mode': 'new' } });
			const d3 = await dlg(r3.page);
			assert(d3.open && d3.kind === 'stitch', 'T55お知らせ(4): 既読の値が告知の ID と違えば出る', JSON.stringify({ open: d3.open, kind: d3.kind }));
			await r3.ctx.close();
			const f = await open('special', { query: '?notice=force', store: seen });
			const b4 = await allKeys(f.page);
			assert(await noticeOpen(f.page), 'T55お知らせ(4): ?notice=force は既読でも出る', '');
			await f.page.click('#ui-notice-ok');
			await f.page.waitForTimeout(250);
			assert(JSON.stringify(await allKeys(f.page)) === JSON.stringify(b4), 'T55お知らせ(4): ?notice=force は閉じても何も書かない', '');
			await f.ctx.close();
		});
	});

	await block('T55お知らせ(5) (b) で外したもの（S1・S2・S3・E1・E2）: 履歴・NOTICE_LIST・本文の入れ物・HTML の文面に無い／閉じても外したお知らせの既読のキーは書かない／新シナリオの知らせ（X1）は履歴の外のまま', async () => {
		await at(AT_DAY0, async () => {
			for (const name of ['special', 'exam']) {
				const g = GONE[name];
				const r = await open(name);
				const s = await r.page.evaluate((a) => ({
					hist: UmaAnnounce.history(a.name).map((h) => h.kind),
					list: UmaAnnounce.NOTICE_LIST.map((n) => n.kind),
					kinds: Object.keys(NOTICE_KINDS),
					bodies: a.bodies.filter((id) => !!document.getElementById(id)),
					on: UmaAnnounce.SCENARIO_PENDING.on,
				}), { name, bodies: g.bodies });
				assert(g.kinds.every((k) => s.hist.indexOf(k) === -1 && s.list.indexOf(k) === -1 && s.kinds.indexOf(k) === -1), `T55お知らせ(5) ${name}: 外した種類（${g.kinds.join('・')}）は履歴・NOTICE_LIST・NOTICE_KINDS に無い`, JSON.stringify(s));
				assert(s.bodies.length === 0, `T55お知らせ(5) ${name}: 外したお知らせの本文の入れ物は無い`, JSON.stringify(s.bodies));
				assert(s.on === false && s.hist.indexOf('scenario') === -1, `T55お知らせ(5) ${name}: 新シナリオの知らせは履歴の外のまま`, JSON.stringify(s));
				if (await noticeOpen(r.page)) await r.page.click('#ui-notice-ok');
				await r.page.waitForTimeout(250);
				const k = await allKeys(r.page);
				assert(g.keys.every((x) => k[x] === undefined), `T55お知らせ(5) ${name}: 閉じても外したお知らせの既読のキー（${g.keys.join('・')}）は書かない`, JSON.stringify(Object.keys(k)));
				assert(jsErrors(r.errors).length === 0, `T55お知らせ(5) ${name}: エラー0`, JSON.stringify(jsErrors(r.errors)));
				await r.ctx.close();
				const html = fs.readFileSync(path.join(REPO_ROOT, FILE[name]), 'utf8');
				const left = g.texts.filter((t) => html.indexOf(t) !== -1);
				assert(left.length === 0, `T55お知らせ(5) ${name}.html: 外したお知らせの文面が残っていない`, JSON.stringify(left));
			}
			const src = fs.readFileSync(path.join(REPO_ROOT, 'js/announce.js'), 'utf8');
			assert(!/kind: '(layout|alpha|catalog|target)'/.test(src), 'T55お知らせ(5) js/announce.js: NOTICE_LIST に外した種類の行が無い', '');
		});
	});

	await block('T55お知らせ(6) E3（UmaExam の 2nd Edition）の文面: 本文は「新機能『効率を指定』モードを追加し、全体の文面も見直しました。」・ID は据え置き／公開のお知らせに「含め」「想定SP」の語が無い', async () => {
		await at(AT_DAY0, async () => {
			const r = await open('exam', { query: '?notice=force', w: 375 });
			const e = await r.page.evaluate(() => {
				const b = document.getElementById('ui-notice-body-edition');
				return { kind: uiNoticeKind, leads: [...b.querySelectorAll('.announce-lead')].map((x) => x.textContent), id: UmaAnnounce.ANNOUNCE.id, text: b.innerText };
			});
			assert(e.kind === 'edition' && JSON.stringify(e.leads) === JSON.stringify([E3_LEAD]) && e.id === E3_ID, 'T55お知らせ(6) exam: 本文は直した文面・ID は ' + E3_ID + ' のまま', JSON.stringify(e));
			await r.ctx.close();
			const s = await open('special', { query: '?notice=force', w: 375 });
			const st = await s.page.evaluate(() => document.getElementById('ui-notice-body-stitch').innerText);
			await s.ctx.close();
			const all = [e.text, st].join('\n');
			assert(!/含め|想定SP/.test(all), 'T55お知らせ(6): 両方のお知らせに「含め…」「想定SP」の語が無い', all.slice(0, 120));
			const src = fs.readFileSync(path.join(REPO_ROOT, 'js/announce.js'), 'utf8');
			assert(src.indexOf(E3_LEAD) !== -1 && src.indexOf('文面含め') === -1, 'T55お知らせ(6) js/announce.js: 直した文面があり、元の「文面含め」は無い', '');
		});
	});

	await block('T55お知らせ(7) 見た目（(c)）: 360・375・1280px × ライト・ダーク で、横スクロールなし・小窓と OK が画面に収まる・本文が横にはみ出さない・文字のコントラスト 4.5:1 以上・画像の縁取り・エラー0', async () => {
		const toRgb = (c) => (/rgba?\((\d+), (\d+), (\d+)/.exec(c || '') || []).slice(1, 4).map(Number);
		const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
		const ratio = (a, b) => { const x = lum(toRgb(a)), y = lum(toRgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
		await at(AT_DAY0, async () => {
			for (const [w, h] of [[360, 740], [375, 667], [1280, 800]]) {
				for (const theme of ['light', 'dark']) {
					const tag = w + 'px・' + theme;
					const r = await open('special', { query: '?notice=force', w, h, theme, img: true });
					const m = await r.page.evaluate(() => {
						const d = document.getElementById('ui-notice'), b = d.querySelector('.notice-body'), ok = document.getElementById('ui-notice-ok');
						const eff = (el) => { let e = el; while (e) { const bg = getComputedStyle(e).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg; e = e.parentElement; } return 'rgb(255, 255, 255)'; };
						const out = [...d.querySelectorAll('.notice-head-tool, .notice-head-date, #ui-notice-body-stitch .announce-h, #ui-notice-body-stitch .announce-lead')].filter((e) => e.getClientRects().length).map((e) => ({ cls: e.className, fg: getComputedStyle(e).color, bg: eff(e) }));
						const dr = d.getBoundingClientRect(), or = ok.getBoundingClientRect();
						const img = d.querySelector('#ui-notice-body-stitch img'), cs = img ? getComputedStyle(img) : null;
						return { out, scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, inView: dr.left >= -1 && dr.right <= window.innerWidth + 1 && dr.top >= -1 && dr.bottom <= window.innerHeight + 1,
							okIn: or.bottom <= window.innerHeight + 0.5 && or.top >= dr.top && or.height >= 30, bodyX: b.scrollWidth <= b.clientWidth + 0.5,
							imgBorder: cs ? parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopColor !== 'rgba(0, 0, 0, 0)' : false, theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(d).backgroundColor };
					});
					assert(!m.scroll && m.inView && m.okIn && m.bodyX, `T55お知らせ(7) ${tag}: 横スクロールなし・小窓と OK が画面に収まる・本文が横にはみ出さない`, JSON.stringify({ scroll: m.scroll, inView: m.inView, okIn: m.okIn, bodyX: m.bodyX }));
					assert(m.out.length === 4, `T55お知らせ(7) ${tag}: ツール名・日付・見出し・本文が見える`, JSON.stringify(m.out.map((o) => o.cls)));
					m.out.forEach((o) => { const c = ratio(o.fg, o.bg); assert(c >= 4.5, `T55お知らせ(7) ${tag}: ${o.cls} のコントラスト ${c.toFixed(2)}:1`, o.fg + ' on ' + o.bg); });
					assert(m.imgBorder, `T55お知らせ(7) ${tag}: 画像に縁取りがある`, '');
					if (theme === 'dark') assert(m.theme === 'dark' && m.bg !== 'rgb(255, 255, 255)', `T55お知らせ(7) ${tag}: ダークでは小窓の地が暗い`, m.bg);
					assert(jsErrors(r.errors).length === 0, `T55お知らせ(7) ${tag}: エラー0`, JSON.stringify(jsErrors(r.errors)));
					await r.ctx.close();
				}
			}
		});
	});
}
