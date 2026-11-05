// 画像をアップロードの作り直し（T76・2026-11-02。おいもさんの決定 C-258 の T69 への回答。モック T69 の lab/upload-layout-mock.html の scene=new・add=lg）の検査。
// run-smoke.mjs の末尾から register96() で呼ばれる（塊の見出しはすべて「T76画像アップロード」で始まる。`npm run test:visual -- --only=T76画像アップロード` で回せる）。
//
// 決め（UmaStar＝special.html の③・UmaExam＝exam.html の②。同じ作り）:
//  1 親A・祖A1・祖A2 を横に3列（375px でも）、サムネイルを縦1列。人の欄の枠（角丸の線と地）は無し。
//  2・3・4 画像を足すボタンは列の幅（375px で 101px 前後）・高さ 76px・見える字は「追加」。今の文「親Aのスクショを選択」は読み上げ名と title。
//  5 3列の上の家系の図（親A → 祖A1・祖A2 の丸）は無い。
//  6 処理のボタン（UmaStar：「OCR処理＋画像結合を開始する」「画像を結合する（OCRしない）」、UmaExam：「OCR処理を開始する」「OCR処理＋画像結合を開始する」）は
//    画面の下に固定した欄の中。欄が出ている間は右下の丸（結果を開く）と左下の「元に戻す」を欄の高さだけ上げ、ページの下に欄の高さぶんの余白を足す。
//  10 1280px でもサムネイルの高さは 56px。11 × の押せる範囲は今のまま（20×20）。12 UmaExam も同じ（動画の入口は無い）。
//  動画の入口は今の場所（タブの行の右端・UmaStar だけ）。
import { reloadReady } from './lib/page-ready.mjs';
import { pickVideo } from './lib/video-entry.mjs';

export async function register96(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const WIDTHS = [375, 1280];
	const NAME = { special: 'UmaStar', exam: 'UmaExam' };
	const BTNS = {
		special: 'process-stitch-btn:OCR処理＋画像結合を開始する|stitch-btn:画像を結合する（OCRしない）',
		exam: 'process-btn:OCR処理を開始する|process-stitch-btn:OCR処理＋画像結合を開始する',
	};
	const LABELS = ['親A', '祖A1', '祖A2', '親B', '祖B1', '祖B2'];

	const closeNotices = async (page) => {
		for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {});
	};
	const openTool = async (tool, w) => {
		const vp = { width: w, height: w < 641 ? 812 : 800 };
		let r;
		if (tool === 'special') {
			r = await openPage(browser, base, 'special.html', vp, EMPTY);
			await r.page.evaluate(() => { localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '2'); });
			await reloadReady(r.page);
		} else {
			r = await openPage(browser, base, 'exam.html', vp);
		}
		await closeNotices(r.page);
		await r.page.waitForTimeout(300);
		await r.page.evaluate(() => selectStepTab(2));
		await r.page.waitForTimeout(300);
		return r;
	};
	// 画像を入れる（作り物の PNG。サムネイルの寸法は CSS で決まるので中身は問わない）
	const addImages = (page, counts) => page.evaluate((counts) => {
		counts.forEach((n, p) => { if (n > 0) addPersonFiles(p, Array.from({ length: n }, (_, k) => new File([new Uint8Array([137, 80, 78, 71, k])], 'p' + p + '_' + k + '.png', { type: 'image/png' }))); });
	}, counts);

	const MEASURE = (labels) => {
		const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1) }; };
		const hit = (el) => {
			const b = el.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
			let w = 0, h = 0;
			for (let x = Math.floor(b.left) - 10; x <= b.right + 10; x++) { const e = document.elementFromPoint(x, cy); if (e && el.contains(e)) w++; }
			for (let y = Math.floor(b.top) - 10; y <= b.bottom + 10; y++) { const e = document.elementFromPoint(cx, y); if (e && el.contains(e)) h++; }
			return { w, h };
		};
		const sets = ['A', 'B'].map((id, si) => {
			const wrap = document.getElementById('personset-' + id + '-wrap');
			const panel = wrap && wrap.querySelector('.upload-set-panel');
			const grid = panel && panel.querySelector('.upload-cols');
			const cols = grid ? [...grid.children] : [];
			return {
				shown: !!(wrap && wrap.offsetParent),
				grid: grid ? { cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length, gap: getComputedStyle(grid).columnGap } : null,
				cols: cols.map((c) => {
					const head = c.querySelector(':scope > p');
					const zone = c.querySelector(':scope > .person-drop-zone');
					const list = c.querySelector(':scope > .person-image-list');
					const cs = getComputedStyle(c);
					const thumbs = list ? [...list.querySelectorAll(':scope > div.group')] : [];
					return {
						person: Number(c.getAttribute('data-person')), rect: r(c), head: head ? head.textContent.trim() : null,
						frame: { bw: cs.borderTopWidth, bg: cs.backgroundColor, pad: cs.paddingTop, radius: cs.borderTopLeftRadius },
						zone: zone ? { rect: r(zone), text: zone.innerText.trim(), aria: zone.getAttribute('aria-label'), title: zone.getAttribute('title'), person: Number(zone.getAttribute('data-person')), dashed: getComputedStyle(zone).borderTopStyle } : null,
						thumbs: thumbs.map((t) => ({ rect: r(t), img: r(t.querySelector('img')), x: r(t.querySelector('.person-image-remove')) })),
						listW: list ? +list.getBoundingClientRect().width.toFixed(1) : null,
					};
				}),
				// 家系の図: 丸（rounded-full）の中の「親A」「祖A1」などの印・svg の線
				tree: panel ? [...panel.querySelectorAll('.rounded-full, svg path')].filter((e) => e.tagName === 'path' ? /M2 22 H12/.test(e.getAttribute('d') || '') : labels.slice(si * 3, si * 3 + 3).includes(e.textContent.trim())).length : -1,
				labelHits: panel ? [...panel.querySelectorAll('*')].filter((e) => e.children.length === 0 && labels.slice(si * 3, si * 3 + 3).includes(e.textContent.trim())).length : -1,
			};
		});
		const bar = document.getElementById('upload-bar');
		const barIn = bar && bar.firstElementChild;
		const panel2 = document.getElementById('step-panel-2');
		const fab = document.getElementById('fab-nav');
		const undo = document.getElementById('deck-undo-btn');
		const edgeProbe = (() => { const d = document.createElement('div'); d.style.width = 'var(--uma-fab-edge)'; d.style.position = 'absolute'; document.body.appendChild(d); const v = d.getBoundingClientRect().width; d.remove(); return v; })();
		const btns = bar ? [...bar.querySelectorAll('button')] : [];
		return {
			vw: window.innerWidth, vh: window.innerHeight,
			sets,
			bar: bar ? { rect: r(bar), shown: bar.getClientRects().length > 0, pos: getComputedStyle(bar).position, z: getComputedStyle(bar).zIndex, inRect: r(barIn), atBody: bar.parentElement === document.body } : null,
			barBtns: btns.map((b) => ({ id: b.id, text: b.textContent.trim(), rect: r(b) })),
			barVar: getComputedStyle(document.documentElement).getPropertyValue('--upload-bar-h').trim(),
			bodyCls: document.body.classList.contains('has-upload-bar'),
			bodyPad: getComputedStyle(document.body).paddingBottom,
			panel2: r(panel2),
			fab: fab && fab.getClientRects().length ? r(fab) : null,
			undo: undo && undo.getClientRects().length ? r(undo) : null,
			edge: edgeProbe,
			video: (() => { const v = document.getElementById('upload-mode'); const t = document.getElementById('personset-tabs'); return v ? { rect: r(v), row: v.parentElement === (t && t.parentElement), last: v.parentElement && v.parentElement.lastElementChild === v } : null; })(),
			zoneHit: (() => { const z = document.querySelector('#personset-A-wrap .person-drop-zone'); if (!z) return null; z.scrollIntoView({ block: 'center' }); const h = hit(z); window.scrollTo(0, 0); return h; })(),
			xHit: (() => { const x = document.querySelector('#personset-A-wrap .person-image-remove'); if (!x) return null; x.scrollIntoView({ block: 'center' }); const h = hit(x); window.scrollTo(0, 0); return h; })(),
			hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
		};
	};

	for (const tool of ['special', 'exam']) {
		const name = NAME[tool];
		await block('T76画像アップロード(1) ' + name + ' の並び（375・1280px）: 親A・祖A1・祖A2 が横に3列（列の間 8px・人の欄の枠なし）・各列の見出し → 「追加」（高さ 76・列の幅・読み上げ名と title は「親Aのスクショを選択」など）→ サムネイルを縦1列（高さ 56・× 20×20）・家系の図が無い・親Bセットも同じ・横スクロールなし', async () => {
			for (const w of WIDTHS) {
				const { ctx, page, errors } = await openTool(tool, w);
				await addImages(page, [0, 3, 10, 2, 0, 1]);
				await page.waitForTimeout(200);
				const m = await page.evaluate(MEASURE, LABELS);
				const tag = 'T76(1) ' + name + ' ' + w + 'px';
				for (const si of [0, 1]) {
					const s = m.sets[si];
					const st = tag + ' 親' + 'AB'[si] + 'セット';
					assert(s.grid && s.grid.cols === 3 && s.grid.gap === '8px' && s.cols.length === 3 && s.cols.map((c) => c.person).join(',') === [0, 1, 2].map((r) => si * 3 + r).join(','),
						st + ': 3列の格子（列の間 8px）に3人', { grid: s.grid, n: s.cols.length });
					assert(s.cols.map((c) => c.head).join(',') === LABELS.slice(si * 3, si * 3 + 3).join(','), st + ': 列の見出しは ' + LABELS.slice(si * 3, si * 3 + 3).join('・'), s.cols.map((c) => c.head));
					assert(s.cols.every((c) => c.frame.bw === '0px' && c.frame.bg === 'rgba(0, 0, 0, 0)' && c.frame.pad === '0px'), st + ': 人の欄の枠（線・地・内側の余白）が無い', s.cols.map((c) => c.frame));
					assert(s.tree === 0 && s.labelHits === 3, st + ': 家系の図（丸の印と線）が無い（「親A」などの字は列の見出しの3つだけ）', { tree: s.tree, labelHits: s.labelHits });
					assert(s.cols.every((c) => c.zone && c.zone.text === '追加' && c.zone.aria === LABELS[c.person] + 'のスクショを選択' && c.zone.title === c.zone.aria && c.zone.person === c.person && c.zone.dashed === 'dashed'),
						st + ': 画像を足すボタンの見える字は「追加」・読み上げ名と title は「（人）のスクショを選択」・点線の枠', s.cols.map((c) => c.zone));
					if (s.shown) {
						const c0 = s.cols[0].rect;
						assert(s.cols.every((c, i) => Math.abs(c.rect.y - c0.y) < 0.5 && (i === 0 || Math.abs(c.rect.x - s.cols[i - 1].rect.r - 8) < 0.6) && Math.abs(c.rect.w - c0.w) < 0.6),
							st + ': 3列は同じ高さから横に並ぶ（同じ幅・間 8px）', s.cols.map((c) => c.rect));
						assert(s.cols.every((c) => Math.abs(c.zone.rect.h - 76) < 0.6 && Math.abs(c.zone.rect.w - c.rect.w) < 0.6 && c.zone.rect.y > c.rect.y),
							st + ': 「追加」は高さ 76・列の幅・見出しの下', s.cols.map((c) => ({ zone: c.zone.rect, col: c.rect })));
						if (w === 375) assert(c0.w >= 95 && c0.w <= 110, st + ': 375px の列の幅は 101px 前後（95〜110）', c0);
						assert(s.cols.every((c) => c.thumbs.every((t, k) => Math.abs(t.rect.x - c.rect.x) < 0.6 && Math.abs(t.rect.w - c.listW) < 0.6 && Math.abs(t.img.h - 56) < 0.6
							&& (k === 0 ? t.rect.y >= c.zone.rect.b : Math.abs(t.rect.y - c.thumbs[k - 1].rect.b - 8) < 0.6) && Math.abs(t.x.w - 20) < 0.6 && Math.abs(t.x.h - 20) < 0.6)),
							st + ': サムネイルは「追加」の下に縦1列（列の幅・高さ 56・間 8・× 20×20）', s.cols.map((c) => c.thumbs.map((t) => t.rect.y + '/' + t.img.h)));
					}
				}
				assert(m.sets[0].shown && !m.sets[1].shown, tag + ': 開いているのは親Aセット', m.sets.map((s) => s.shown));
				assert(m.sets[0].cols.map((c) => c.thumbs.length).join(',') === '0,3,10', tag + ': サムネイルの枚数 0・3・10', m.sets[0].cols.map((c) => c.thumbs.length));
				assert(m.zoneHit && m.zoneHit.h >= 76 && m.zoneHit.w >= 90, tag + ': 「追加」の押せる範囲は高さ 76 以上', m.zoneHit);
				assert(m.xHit && m.xHit.w >= 20 && m.xHit.h >= 20, tag + ': × の押せる範囲は 20×20（今のまま）', m.xHit);
				assert(!m.hscroll, tag + ': 横スクロールなし');
				assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
				await ctx.close();
			}
		});

		await block('T76画像アップロード(2) ' + name + ' の下に固定した欄（375・1280px）: 処理のボタン2つは画面の下に固定した欄の中（375px は縦に2段・1280px は横に2つ・左右は③／②のパネルと同じ）・右下の丸' + (tool === 'special' ? 'と左下の「元に戻す」' : '') + 'は欄のすぐ上（端からの距離は今のまま）・いちばん下まで送っても最後のサムネイルと「!」が欄に隠れない・ほかのタブでは欄が無く丸は元の位置', async () => {
			for (const w of WIDTHS) {
				const { ctx, page, errors } = await openTool(tool, w);
				await addImages(page, [10, 10, 10]);
				if (tool === 'special') await page.evaluate(() => { document.getElementById('deck-undo-btn').style.display = ''; });
				await page.waitForTimeout(300);
				const m = await page.evaluate(MEASURE, LABELS);
				const tag = 'T76(2) ' + name + ' ' + w + 'px';
				assert(m.bar && m.bar.shown && m.bar.pos === 'fixed' && m.bar.atBody && Math.abs(m.bar.rect.b - m.vh) < 0.6 && m.bar.rect.x === 0 && Math.abs(m.bar.rect.w - m.vw) < 20,
					tag + ': 欄は画面の下に固定（下端＝画面の下端・幅は画面いっぱい）', m.bar);
				assert(m.barBtns.map((b) => b.id + ':' + b.text).join('|') === BTNS[tool], tag + ': 欄の中のボタンは ' + BTNS[tool], m.barBtns.map((b) => b.id + ':' + b.text));
				assert(Math.abs(m.bar.inRect.x - m.panel2.x) < 1 && Math.abs(m.bar.inRect.r - m.panel2.r) < 1 && m.barBtns.every((b) => b.rect.x >= m.panel2.x - 1 && b.rect.r <= m.panel2.r + 1 && b.rect.y >= m.bar.rect.y && b.rect.b <= m.bar.rect.b),
					tag + ': 欄の中身の左右はパネルと同じ・ボタンは欄の中', { inner: m.bar.inRect, panel: m.panel2, btns: m.barBtns.map((b) => b.rect) });
				const [b0, b1] = m.barBtns.map((b) => b.rect);
				if (w === 375) assert(Math.abs(b0.x - b1.x) < 1 && b1.y >= b0.b && b0.h === 50 && b1.h === (tool === 'special' ? 38 : 50),
					tag + ': 375px はボタンが縦に2段（高さ 50・' + (tool === 'special' ? '38' : '50') + '。モックと同じ）', { b0, b1 });
				else assert(Math.abs(b0.y - b1.y) < 1 && b1.x >= b0.r, tag + ': 1280px はボタンが横に2つ', { b0, b1 });
				assert(m.bodyCls && m.barVar === Math.round(m.bar.rect.h) + 'px' && m.bodyPad === Math.round(m.bar.rect.h) + 'px', tag + ': ページの下に欄の高さぶんの余白（--upload-bar-h・body の下の余白）', { v: m.barVar, pad: m.bodyPad, h: m.bar.rect.h });
				assert(m.fab && Math.abs((m.bar.rect.y - m.fab.b) - m.edge) < 1, tag + ': 右下の丸は欄の上端から ' + m.edge + 'px 上（欄に重ならない）', { fab: m.fab, bar: m.bar.rect, edge: m.edge });
				if (tool === 'special') assert(m.undo && Math.abs((m.bar.rect.y - m.undo.b) - m.edge) < 1, tag + ': 左下の「元に戻す」は欄の上端から ' + m.edge + 'px 上', { undo: m.undo, bar: m.bar.rect });
				// いちばん下まで送る
				const end = await page.evaluate(() => {
					window.scrollTo(0, document.documentElement.scrollHeight);
					const bar = document.getElementById('upload-bar').getBoundingClientRect();
					const thumbs = [0, 1, 2].map((p) => { const l = document.querySelectorAll('.person-image-list[data-person="' + p + '"] > div.group'); return l.length ? l[l.length - 1].getBoundingClientRect().bottom : null; });
					const adv = document.getElementById('adv-opts-btn').getBoundingClientRect();
					const r = { barTop: bar.top, thumbs, adv: adv.bottom, scrolled: window.scrollY };
					window.scrollTo(0, 0);
					return r;
				});
				assert(end.scrolled > 0 && end.thumbs.every((b) => b !== null && b <= end.barTop) && end.adv <= end.barTop, tag + ': いちばん下まで送ると、各列の最後のサムネイルと「!」は欄の上で切れない', end);
				assert(!m.hscroll, tag + ': 横スクロールなし');
				// ほかのタブ（①の結果の手前の入力。UmaStar は②・UmaExam は①）では欄が無く、丸は元の位置
				await page.evaluate(() => selectStepTab(1));
				await page.waitForTimeout(300);
				const o = await page.evaluate(MEASURE, LABELS);
				assert(o.bar && !o.bar.shown && !o.bodyCls && o.barVar === '0px' && o.fab && Math.abs((o.vh - o.fab.b) - o.edge) < 1, tag + ': ほかのタブでは欄が出ず、丸は画面の下端から ' + o.edge + 'px（元の位置）', { bar: o.bar, cls: o.bodyCls, v: o.barVar, fab: o.fab, vh: o.vh });
				await page.evaluate(() => selectStepTab(2));
				await page.waitForTimeout(300);
				const back = await page.evaluate(MEASURE, LABELS);
				assert(back.bar.shown && back.bodyCls && back.fab && Math.abs((back.bar.rect.y - back.fab.b) - back.edge) < 1, tag + ': 戻ると欄が出て丸は欄の上', { bar: back.bar, fab: back.fab });
				assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
				await ctx.close();
			}
		});

		await block('T76画像アップロード(3) ' + name + ' の操作は今どおり（375px）: 「追加」からファイルを選ぶとその人のサムネイルが縦に増えタブの枚数も増える・× で外れる・欄のボタンは画像が入ると押せる・親Bセットのタブで親Bの3列に切り替わる（画像は保持）' + (tool === 'special' ? '・動画の入口はタブの行の右端にあり押すと小窓が開く' : '・動画の入口は無い'), async () => {
			const { ctx, page, errors } = await openTool(tool, 375);
			const tag = 'T76(3) ' + name;
			const before = await page.evaluate((ids) => ids.map((id) => document.getElementById(id).disabled), BTNS[tool].split('|').map((s) => s.split(':')[0]));
			const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click('#personset-A-wrap .person-drop-zone[data-person="1"]')]);
			assert(!!chooser, tag + ': 祖A1 の「追加」を押すとファイルの選択が開く');
			if (chooser) await chooser.setFiles([1, 2].map((k) => ({ name: 'g' + k + '.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, k]) })));
			await page.waitForTimeout(300);
			const s1 = await page.evaluate(() => ({ n: document.querySelectorAll('.person-image-list[data-person="1"] > div.group').length, files: persons[1].files.length,
				tab: (document.querySelector('#personset-tabs .uma-subtab .uma-subtab-count') || {}).textContent }));
			assert(s1.n === 2 && s1.files === 2 && s1.tab === '2枚', tag + ': 祖A1 にサムネイル2枚・タブ「2枚」', s1);
			if (tool === 'special') {
				const after = await page.evaluate(() => document.getElementById('stitch-btn').disabled);
				assert(before[1] === true && after === false, tag + ': 「画像を結合する（OCRしない）」は画像が入ると押せる', { before, after });
			} else {
				const after = await page.evaluate(() => ['process-btn', 'process-stitch-btn'].map((id) => document.getElementById(id).disabled));
				assert(before.every(Boolean) && after.every((d) => !d), tag + ': 欄の2つのボタンは画像が入ると押せる', { before, after });
			}
			await page.click('.person-image-list[data-person="1"] > div.group:first-child .person-image-remove');
			await page.waitForTimeout(200);
			const s2 = await page.evaluate(() => ({ n: document.querySelectorAll('.person-image-list[data-person="1"] > div.group').length, files: persons[1].files.length }));
			assert(s2.n === 1 && s2.files === 1, tag + ': × で1枚外れる', s2);
			await page.click('#personset-tabs .uma-subtab:nth-child(2)');
			await page.waitForTimeout(300);
			const m = await page.evaluate(MEASURE, LABELS);
			assert(!m.sets[0].shown && m.sets[1].shown && m.sets[1].cols.length === 3 && m.sets[1].cols.map((c) => c.head).join(',') === '親B,祖B1,祖B2' && Math.abs(m.sets[1].cols[1].rect.x - m.sets[1].cols[0].rect.r - 8) < 0.6,
				tag + ': 親Bセットのタブで親Bの3列に切り替わる', m.sets.map((s) => ({ shown: s.shown, heads: s.cols.map((c) => c.head) })));
			const kept = await page.evaluate(() => persons[1].files.length);
			assert(kept === 1, tag + ': 親Aセットの画像は保持', kept);
			if (tool === 'special') {
				assert(m.video && m.video.row && m.video.last && m.video.rect.h === 32, tag + ': 入れ方の切り替え（静止画｜動画）はタブの行の右端（T106）', m.video);
				const chooser = await pickVideo(page);
				const pend = await page.evaluate(() => videoPending && videoPending.setIdx);
				assert(!!chooser && pend === 1, tag + ': 「動画を選ぶ」ですぐファイルの選択が開く（入れる先は今見ている親Bセット。T106）', { chooser: !!chooser, pend });
				await page.evaluate(() => setUploadMode('shot'));
			} else {
				assert(m.video === null, tag + ': 動画の入口は無い', m.video);
			}
			assert(jsErrors(errors).length === 0, tag + ': コンソールエラー0', jsErrors(errors).slice(0, 3));
			await ctx.close();
		});
	}
}
