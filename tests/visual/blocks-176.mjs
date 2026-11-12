// T182（2026-11-12・決定 434・723・724・744〜749）: 動画で取り込み（βテスト）のお知らせ（UmaStar・UmaExam に1件ずつ）と、
// 動画の機能の表記の α → β・めろっぷのモードの名前の「（βテスト）」を外したこと。
// 塊の見出しは「T182」で始まる（`npm run test:visual -- --only=T182`）。run-smoke.mjs の末尾から register176() で呼ばれる。
//
//  (1) 文面: おいもさんの原文と1字も違わない（見出し・1行目・箇条4つ〔「・」は li::before〕・UmaStar だけ「レース欄に…」の1文）。
//      画像はページごとに1枚（alt=""・横 1100px の PNG）で、小窓の幅に収まる。375・1280px・横スクロールなし・エラー0。
//  (2) 履歴と自動で開く日付: 両ツールの履歴の先頭が video（2026/11/12）。初めての人には0日目・30日目に video で自動で開き、31日目は出ない。
//      閉じると uma-*-video-notice に告知の ID を書き、開き直すと出ない。メニューの「お知らせ」・?notice=force でも video から開く（force は何も書かない）。
//  (3) 動画の表記: 入口の切り替え「動画β」・動画を選ぶボタンの小さな字が「β」。動画の機能の字・読み上げ名・title に α が無い。
//      Deck (αテスト) とイベントスキル未収録の赤字（αテスト中）は今のまま。めろっぷのモードは「めろっぷ！【LTC】専用拡張モード」。
// 文面・ID・日付・画像の名前は検査の側に直書きする（実装から読んで作らない）。日付は withNoticeClock(…, { video: true }) で固定する
// （その間も video のお知らせを外さない＝実データ。ほかのお知らせの塊は lib/fixtures.mjs の取り決めで video を外して見る）。

import fs from 'node:fs';
import path from 'node:path';
import { reloadReady } from './lib/page-ready.mjs';
import { withNoticeClock } from './lib/fixtures.mjs';

export async function register176(env) {
	const { block, assert, browser, base, openPage, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const D = '2026-11-12';
	const D_SLASH = '2026/11/12';
	const ID = '2026-11-12-video-beta';
	const at = (iso, fn) => withNoticeClock(iso, fn, { video: true });
	const DAY0 = D + 'T12:00:00+09:00';
	// おいもさんの原文（行の並びのまま。箇条の「・」も含めて書く）
	const TEXT = {
		special: [
			'動画で取り込み（βテスト）',
			'動画から画像の結合と OCR ができるようになりました。',
			'・録画済みの動画を選ぶと画像の結合が始まります。',
			'・PC では、ゲームのウィンドウから直接取り込めます。',
			'・DMM版の横画面にも対応しました。',
			'・βテスト中の機能です。質と処理時間を改善中です。',
			'レース欄に「レース指定なし／本育成編成なし」を追加しました。',
		],
		exam: [
			'動画で取り込み（βテスト）',
			'動画から画像の結合と OCR ができるようになりました。',
			'・録画済みの動画を選ぶと画像の結合が始まります。',
			'・PC では、ゲームのウィンドウから直接取り込めます。',
			'・DMM版の横画面にも対応しました。',
			'・βテスト中の機能です。質と処理時間を改善中です。',
		],
	};
	const IMG = { special: ['img/announce-video-star-' + D + '.png', [1100, 592]], exam: ['img/announce-video-exam-' + D + '.png', [1100, 618]] };
	const FILE = { special: 'special.html', exam: 'exam.html' };
	const TOOL = { special: 'UmaStar OCR', exam: 'UmaExam OCR' };
	const KEY = { special: 'uma-special-video-notice', exam: 'uma-exam-video-notice' };
	// 履歴（新しい順）。新シナリオの知らせは実データでは外れている（on が false）
	const HIST = { special: [['video', D_SLASH], ['stitch', '2026/11/01']], exam: [['video', D_SLASH], ['edition', '2026/10/11']] };
	const allKeys = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
	const noticeOpen = (page) => page.evaluate(() => { const d = document.getElementById('ui-notice'); return !!d && !d.hidden; });
	const open = async (name, o = {}) => {
		const r = await openPage(browser, base, FILE[name] + (o.query || ''), { width: o.w || 1280, height: o.h || 900 });
		if (o.store) {
			await r.page.evaluate((s) => { try { localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } catch (e) {} }, o.store);
			await reloadReady(r.page);
		}
		await r.page.waitForTimeout(o.wait || 1200);
		if (o.img) await r.page.waitForFunction(() => [...document.querySelectorAll('#ui-notice img')].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
		return r;
	};
	const dlg = (page) => page.evaluate(() => {
		const d = document.getElementById('ui-notice');
		const shown = [...d.querySelectorAll('.notice-body > div')].filter((x) => /^ui-notice-body-/.test(x.id) && !x.hidden).map((x) => x.id);
		const b = document.getElementById('ui-notice-body-video');
		const sec = b ? b.querySelector('.announce-sec') : null;
		// 見える文字を行ごとに（箇条は li::before の「・」を付けて）。読み上げだけの見出しは除く
		const rows = [];
		if (sec) [...sec.children].forEach((c) => {
			if (c.tagName === 'UL') [...c.children].forEach((li) => rows.push(getComputedStyle(li, '::before').content.replace(/^"|"$/g, '') + li.textContent));
			else if (c.tagName !== 'FIGURE') rows.push(c.textContent);
		});
		const dr = d.getBoundingClientRect();
		const imgs = b ? [...b.querySelectorAll('img')].map((i) => { const r = i.getBoundingClientRect(); return { src: i.getAttribute('src'), alt: i.getAttribute('alt'), ok: i.complete && i.naturalWidth > 0, nat: [i.naturalWidth, i.naturalHeight], w: Math.round(r.width), fit: r.left >= dr.left - 0.5 && r.right <= dr.right + 0.5 }; }) : [];
		const lab = d.getAttribute('aria-labelledby'), labEl = lab ? document.getElementById(lab) : null;
		const pager = d.querySelector('.notice-pager');
		return {
			open: !d.hidden, kind: uiNoticeKind, shown, rows, imgs,
			tool: d.querySelector('.notice-head-tool') ? d.querySelector('.notice-head-tool').textContent : null,
			date: d.querySelector('.notice-head-date') ? d.querySelector('.notice-head-date').textContent : null,
			count: pager && getComputedStyle(pager).display !== 'none' ? d.querySelector('.notice-pager-count').textContent : null,
			label: labEl ? labEl.textContent.trim() : null, labelledby: lab,
			srHead: b ? [...b.querySelectorAll('.announce-sr')].length : 0,
			hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
			inView: dr.left >= -1 && dr.right <= window.innerWidth + 1,
		};
	});

	await block('T182(1) 動画のお知らせの文面は原文と1字も違わない（UmaStar はレース欄の1文あり・UmaExam はなし）・画像はページごとの1枚（alt=""）で小窓に収まる／375・1280px・横スクロールなし・エラー0', async () => {
		await at(DAY0, async () => {
			for (const name of ['special', 'exam']) {
				for (const w of [375, 1280]) {
					const tag = name + '・' + w + 'px';
					const r = await open(name, { query: '?notice=force', w, h: w < 768 ? 812 : 900, img: true });
					const d = await dlg(r.page);
					assert(d.open && d.kind === 'video' && JSON.stringify(d.shown) === '["ui-notice-body-video"]', `T182(1) ${tag}: 動画のお知らせが1件だけ出る`, JSON.stringify({ open: d.open, kind: d.kind, shown: d.shown }));
					assert(JSON.stringify(d.rows) === JSON.stringify(TEXT[name]), `T182(1) ${tag}: 文面が原文どおり（${TEXT[name].length}行）`, JSON.stringify(d.rows));
					assert(d.tool === TOOL[name] && d.date === D_SLASH && d.count === '1 / 2', `T182(1) ${tag}: 小窓の上に「${TOOL[name]} ${D_SLASH}」・1 / 2`, JSON.stringify({ tool: d.tool, date: d.date, count: d.count }));
					assert(d.labelledby === 'ui-notice-title-video' && d.label === 'お知らせ' && d.srHead === 1, `T182(1) ${tag}: 読み上げの名前は「お知らせ」`, JSON.stringify({ labelledby: d.labelledby, label: d.label }));
					assert(d.imgs.length === 1 && d.imgs[0].src === IMG[name][0] && d.imgs[0].alt === '' && d.imgs[0].ok && JSON.stringify(d.imgs[0].nat) === JSON.stringify(IMG[name][1]) && d.imgs[0].fit && d.imgs[0].w > 200,
						`T182(1) ${tag}: 画像は1枚（${IMG[name][0]}・alt=""）で読み込め、小窓の幅に収まる`, JSON.stringify(d.imgs));
					assert(!d.hScroll && d.inView, `T182(1) ${tag}: 横スクロールなし・小窓は画面に収まる`, JSON.stringify({ hScroll: d.hScroll, inView: d.inView }));
					assert(jsErrors(r.errors).length === 0, `T182(1) ${tag}: エラー0`, JSON.stringify(jsErrors(r.errors)));
					await r.ctx.close();
				}
				const p = path.join(REPO_ROOT, IMG[name][0]);
				const size = fs.existsSync(p) ? fs.statSync(p).size : -1;
				const head = size > 0 ? fs.readFileSync(p).subarray(0, 24) : null;
				const wh = head ? [head.readUInt32BE(16), head.readUInt32BE(20)] : null;
				assert(size > 0 && size <= 400 * 1024 && head && head.subarray(1, 4).toString() === 'PNG' && JSON.stringify(wh) === JSON.stringify(IMG[name][1]), `T182(1) ${name}: ${IMG[name][0]} は実在する PNG（${wh}・${Math.round(size / 1024)} KB）`, JSON.stringify({ size, wh }));
			}
			// 画像は両ページで別の1枚（723 を改めた）
			assert(IMG.special[0] !== IMG.exam[0], 'T182(1): 画像はページごとに別の1枚', '');
		});
	});

	await block('T182(2) 履歴の先頭は動画のお知らせ（2026/11/12・両ツール）／初めての人に0日目・30日目は自動で出て31日目は出ない／閉じると既読（ID）・開き直すと出ない／メニュー・?notice=force でも動画から開く（force は何も書かない）', async () => {
		await at(DAY0, async () => {
			for (const name of ['special', 'exam']) {
				const r = await open(name);
				const h = await r.page.evaluate((p) => ({ hist: UmaAnnounce.history(p).map((x) => [x.kind, x.date]), first: UmaAnnounce.NOTICE_LIST[0] }), name);
				assert(JSON.stringify(h.hist) === JSON.stringify(HIST[name]), `T182(2) ${name}: 履歴は video（${D_SLASH}）が先頭の2件`, JSON.stringify(h.hist));
				assert(h.first.kind === 'video' && JSON.stringify(h.first.pages) === '["exam","special"]', `T182(2) ${name}: NOTICE_LIST の先頭が video（両ツール）`, JSON.stringify(h.first));
				const d = await dlg(r.page);
				assert(d.open && d.kind === 'video', `T182(2) ${name}: 初めての人に0日目は動画のお知らせで自動で開く`, JSON.stringify({ open: d.open, kind: d.kind }));
				const before = await allKeys(r.page);
				assert(before[KEY[name]] === undefined, `T182(2) ${name}: 開いただけでは既読を書かない`, before[KEY[name]]);
				await r.page.click('#ui-notice-ok');
				await r.page.waitForTimeout(250);
				const k = await allKeys(r.page);
				assert(k[KEY[name]] === ID, `T182(2) ${name}: 閉じると ${KEY[name]} に「${ID}」を書く`, k[KEY[name]]);
				await reloadReady(r.page);
				await r.page.waitForTimeout(1500);
				assert(!(await noticeOpen(r.page)), `T182(2) ${name}: 閉じたあと再読み込みでは自動で開かない`, '');
				// メニューの「お知らせ」から読み直せる（既読の値は変わらない）
				const k1 = await allKeys(r.page);
				await r.page.click('#tool-dropdown-btn');
				await r.page.waitForTimeout(200);
				await r.page.click('#announce-menu-btn');
				await r.page.waitForTimeout(250);
				const dm = await dlg(r.page);
				assert(dm.open && dm.kind === 'video' && JSON.stringify(dm.rows) === JSON.stringify(TEXT[name]), `T182(2) ${name}: メニューの「お知らせ」から動画のお知らせを読み直せる`, JSON.stringify({ open: dm.open, kind: dm.kind }));
				await r.page.keyboard.press('Escape');
				await r.page.waitForTimeout(200);
				assert(JSON.stringify(await allKeys(r.page)) === JSON.stringify(k1), `T182(2) ${name}: 読み直して閉じても既読の値は変わらない`, '');
				await r.ctx.close();
				// 既読の人にも ?notice=force なら出る・何も書かない
				const f = await open(name, { query: '?notice=force', store: k1 });
				const df = await dlg(f.page);
				assert(df.open && df.kind === 'video', `T182(2) ${name}: 既読でも ?notice=force なら動画のお知らせが出る`, JSON.stringify({ open: df.open, kind: df.kind }));
				const kf = await allKeys(f.page);
				await f.page.click('#ui-notice-ok');
				await f.page.waitForTimeout(250);
				assert(JSON.stringify(await allKeys(f.page)) === JSON.stringify(kf), `T182(2) ${name}: force のときは何も書かない`, '');
				await f.ctx.close();
			}
		});
		// 自動で開く日付（お知らせの日を0日目として30日目まで）
		for (const [iso, label, want] of [['2026-12-12T23:30:00+09:00', '30日目（12/12）', true], ['2026-12-13T00:30:00+09:00', '31日目（12/13）', false]]) {
			await at(iso, async () => {
				for (const name of ['special', 'exam']) {
					const r = await open(name);
					const d = await dlg(r.page);
					if (want) assert(d.open && d.kind === 'video', `T182(2) ${name} ${label}: 初めての人に動画のお知らせで自動で開く`, JSON.stringify({ open: d.open, kind: d.kind }));
					else assert(!d.open && (await allKeys(r.page))[KEY[name]] === undefined, `T182(2) ${name} ${label}: 自動では出ず、既読も書かない`, JSON.stringify({ open: d.open, kind: d.kind }));
					await r.ctx.close();
				}
			});
		}
	});

	await block('T182(3) 動画の表記は β（入口「動画β」・動画を選ぶボタンの小さな字）／動画の機能の字・読み上げ名・title に α が無い／Deck (αテスト)・イベントスキル未収録の赤字は今のまま／めろっぷのモードの名前に「（βテスト）」が無い', async () => {
		for (const name of ['special', 'exam']) {
			const r = await openPage(browser, base, FILE[name], { width: 1280, height: 900 });
			await r.page.evaluate((n) => { localStorage.setItem('uma-' + n + '-upload-mode', 'video'); }, name);
			await reloadReady(r.page);
			const s = await r.page.evaluate(() => {
				const vb = document.querySelector('[data-upload-mode-btn="video"]');
				const marks = [...document.querySelectorAll('.video-alpha')].map((e) => e.textContent);
				const videoEls = [...document.querySelectorAll('#upload-mode, #upload-mode *, .video-pick-btn, .video-pick-btn *, .video-capture-btn, .video-capture-btn *')];
				const alpha = videoEls.filter((e) => /α/.test(e.textContent || '') || /α/.test(e.getAttribute('aria-label') || '') || /α/.test(e.getAttribute('title') || '')).map((e) => e.outerHTML.slice(0, 120));
				const pick = document.querySelector('.video-pick-btn');
				return { mode: document.body.getAttribute('data-upload-mode'), entry: vb ? vb.textContent : null, marks, pick: pick ? pick.textContent : null, alpha, text: VIDEO_TEXTS['video.entry.alpha'] };
			});
			assert(s.mode === 'video' && s.entry === '動画β' && s.text === 'β', `T182(3) ${name}: 入口の切り替えは「動画β」`, JSON.stringify(s));
			assert(s.marks.length >= 2 && s.marks.every((t) => t === 'β') && /^動画を選ぶβ$/.test((s.pick || '').trim()), `T182(3) ${name}: 動画を選ぶボタンの小さな字も「β」（.video-alpha ${s.marks.length}か所）`, JSON.stringify({ marks: s.marks, pick: s.pick }));
			assert(s.alpha.length === 0, `T182(3) ${name}: 動画の機能の字・読み上げ名・title に α が無い`, JSON.stringify(s.alpha));
			if (name === 'special') {
				const deck = await r.page.evaluate(() => document.body.textContent.includes('Deck (αテスト)'));
				assert(deck, 'T182(3) special: Deck (αテスト) の表記は今のまま', '');
			} else {
				const melop = await r.page.evaluate(() => document.querySelector('#melop-mode-wrap label span').textContent);
				assert(melop === 'めろっぷ！【LTC】専用拡張モード', 'T182(3) exam: めろっぷのモードの名前は「めろっぷ！【LTC】専用拡張モード」（「（βテスト）」なし）', melop);
			}
			assert(jsErrors(r.errors).length === 0, `T182(3) ${name}: エラー0`, JSON.stringify(jsErrors(r.errors)));
			await r.ctx.close();
		}
		const core = fs.readFileSync(path.join(REPO_ROOT, 'js', 'uma-skill-deck-core.js'), 'utf8');
		assert(core.includes("'<p class=\"usd-roster-alert\">αテスト中：イベントスキル未収録（'"), 'T182(3): UmaStar の赤字「αテスト中：イベントスキル未収録」は今のまま', '');
	});
}
