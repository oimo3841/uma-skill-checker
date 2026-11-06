// T106（2026-11-05 おいもさんの指摘 (1)〜(11)・回答 271〜277）: UmaStar の動画モードの画面と結合画像の設定の見直しの検査。
// run-smoke.mjs の末尾から register117() で呼ばれる（塊の見出しはすべて「T106」で始まる。`npm run test:visual -- --only=T106` で回せる）。
//
// 模式図の比率の基準は実際の結合画像 static-2col-on（2661×3961）を測った値。幅を 100 として 親 43.4・祖 36・3列目 17 前後、幅÷高さ 0.67、
// 親の上の欄は親の高さの約 1/3、理論値SP は幅 17・高さ 8.4 前後（検査の側で固定値として持つ。製品の値を読んで書かない）。
// 入口（静止画｜動画）は blocks-89 の T59(1)、小窓を無くしたことは T59(2)(3)、エラーの文は T59(7) が見る。
import { reloadReady } from './lib/page-ready.mjs';
import { SYNTH } from './blocks-80.mjs';
import { pickVideo } from './lib/video-entry.mjs';

const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'] } };
const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1)).concat(['32', '45']);
const ALL = { marker: true, roster: true, factor: true, sp: true, table: true, title: true };
const OFF = { marker: false, roster: false, factor: false, sp: false, table: false, title: false };
const HOWTO = ['撮り方', '・親から祖2の一番下までゆっくりスクロール。', '・スクロールの一時停止の前後で、スキルの行が1〜2行重なるようにする。'];

export async function register117(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const closeNotices = async (page) => { for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice').catch(() => false)) await page.click('#ui-notice-ok, [data-act="notice-ok"]').catch(() => {}); };
	const open = async ({ w = 390, h = 844, mode = 'shot', parts = ALL, theme = null, data = false } = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: h }, EMPTY);
		await sp.page.evaluate(({ mode, parts, theme, R1S, IDS, data }) => {
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			localStorage.setItem('uma-special-upload-mode', mode);
			localStorage.setItem('uma-special-stitch-parts', JSON.stringify(parts));
			if (theme) localStorage.setItem('uma-tools-theme', theme);
			if (data) {
				localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(R1S));
				localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: IDS, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			}
		}, { mode, parts, theme, R1S, IDS, data });
		await reloadReady(sp.page);
		await closeNotices(sp.page);
		await sp.page.waitForTimeout(300);
		if (data) {
			await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
			await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		}
		await sp.page.evaluate(() => { selectStepTab(2); window.scrollTo(0, 0); });
		await sp.page.addScriptTag({ content: SYNTH });
		await sp.page.waitForTimeout(150);
		return sp;
	};
	const runVideo = async (page) => {
		await pickVideo(page);
		return page.evaluate(() => Promise.race([onVideoChosen(__synth.make({}).source), new Promise((r) => setTimeout(() => r('timeout'), 90000))]));
	};
	const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };

	/* ── (1)(5)(6) 動画モードの枠の中 ── */
	for (const [w, h] of [[390, 844], [360, 740], [1280, 900]]) {
		await block(`T106(1)(5)(6) ${w}px 動画モード: 「セットをクリア」と「？」は「動画を選ぶ」の枠に重ならない・親A などの字は無い・「？」で撮り方の文`, async () => {
			const sp = await open({ w, h, mode: 'video' });
			const m = await sp.page.evaluate(`(${String(rect)}, (() => { const rect = ${String(rect)};
				const p = document.querySelector('#personset-A-wrap .upload-set-panel');
				const pick = p.querySelector('.video-pick-btn'), row = p.querySelector('.upload-set-clear'), clear = row.querySelector('button'), q = p.querySelector('.video-howto-btn');
				return { pick: rect(pick), clear: rect(clear), q: rect(q), labels: [...p.querySelectorAll('.upload-col > p')].filter((e) => e.getClientRects().length).map((e) => e.textContent), box: p.querySelector('.video-howto-box').hidden, exp: q.getAttribute('aria-expanded'), cls: q.className, text: q.textContent, name: q.getAttribute('aria-label'), sw: document.documentElement.scrollWidth, iw: innerWidth };
			})())`);
			assert(m.clear.bottom <= m.pick.y && m.q.bottom <= m.pick.y, `T106(1) ${w}px 「セットをクリア」と「？」は「動画を選ぶ」の枠の上で、重ならない`, m);
			assert(m.labels.length === 0, `T106(5) ${w}px 「動画を選ぶ」の下に「親A」「祖A1」「祖A2」は無い`, m.labels);
			assert(m.q.x >= m.clear.right && Math.abs((m.q.y + m.q.h / 2) - (m.clear.y + m.clear.h / 2)) <= 2, `T106(6) ${w}px 「？」は「セットをクリア」の右（同じ行）`, m);
			assert(/uma-help-btn/.test(m.cls) && m.text === '?' && m.name && m.exp === 'false' && m.box, `T106(6) ${w}px 「？」はページの他の「？」と同じ部品（.uma-help-btn）で、初めは閉じている`, m);
			await sp.page.click('#personset-A-wrap .video-howto-btn');
			const o = await sp.page.evaluate(() => { const b = document.querySelector('#personset-A-wrap .video-howto-box'); const q = document.querySelector('#personset-A-wrap .video-howto-btn'); const pick = document.querySelector('#personset-A-wrap .video-pick-btn'); return { shown: b.getClientRects().length > 0, lines: b.innerText.split(/\n/).map((s) => s.trim()).filter(Boolean), exp: q.getAttribute('aria-expanded'), cls: b.className, above: b.getBoundingClientRect().bottom <= pick.getBoundingClientRect().y }; });
			assert(o.shown && JSON.stringify(o.lines.slice(0, 3)) === JSON.stringify(HOWTO) && o.exp === 'true' && /uma-help-box/.test(o.cls) && o.above, `T106(6) ${w}px 押すと決めた文が「動画を選ぶ」の上に出る（.uma-help-box）`, o);
			await sp.page.click('#personset-A-wrap .video-howto-btn');
			assert(await sp.page.evaluate(() => document.querySelector('#personset-A-wrap .video-howto-box').hidden), `T106(6) ${w}px もう一度押すと閉じる`, null);
			assert(m.sw <= m.iw, `T106 ${w}px 横スクロールなし`, m);
			assert(jsErrors(sp.errors).length === 0, `T106 ${w}px コンソールのエラー0`, sp.errors);
			await sp.ctx.close();
		});
	}

	await block('T106 静止画モードの枠は今のまま: 親A などの字と「追加」・「セットをクリア」は右上に重ねる・「？」は無い', async () => {
		const sp = await open({ w: 390, mode: 'shot' });
		const m = await sp.page.evaluate(() => {
			const p = document.querySelector('#personset-A-wrap .upload-set-panel');
			const row = p.querySelector('.upload-set-clear');
			return { labels: [...p.querySelectorAll('.upload-col > p')].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()), pos: getComputedStyle(row).position, adds: [...p.querySelectorAll('.upload-add')].filter((e) => e.getClientRects().length).length, q: p.querySelector('.video-howto-btn').getClientRects().length, pick: p.querySelector('.video-pick-btn').getClientRects().length };
		});
		assert(m.labels.join() === '親A,祖A1,祖A2' && m.pos === 'absolute' && m.adds === 3 && m.q === 0 && m.pick === 0, 'T106 静止画モードは親A・祖A1・祖A2・「追加」3つ・右上の「セットをクリア」のまま', m);
		await sp.ctx.close();
	});

	/* ── (7) 6つのチェックは2列3行で、スクロールせずに全部見える ── */
	for (const mode of ['shot', 'video']) for (const [w, h] of [[390, 600], [360, 600]]) {
		await block(`T106(7) ${w}×${h} ${mode === 'shot' ? '静止画' : '動画'}モード: ③の6つのチェックは2列3行で、スクロールせずに下の固定の欄より上に全部見える`, async () => {
			const sp = await open({ w, h, mode, parts: OFF });
			const m = await sp.page.evaluate(() => {
				const items = [...document.querySelectorAll('#stitch-parts-panel .stitch-show-item')];
				const rs = items.map((e) => e.getBoundingClientRect());
				const bar = document.getElementById('upload-bar').getBoundingClientRect();
				const panel = document.querySelector('#stitch-parts-panel .stitch-show').getBoundingClientRect();
				const hitAll = rs.every((r) => { const el = document.elementFromPoint(r.x + 10, r.y + r.height / 2); return el && !!el.closest('.stitch-show-item'); });
				return { texts: items.map((e) => e.textContent.trim()), xs: rs.map((r) => Math.round(r.x)), ys: rs.map((r) => Math.round(r.y)), bottom: Math.max(...rs.map((r) => r.bottom)), right: Math.max(...rs.map((r) => r.right)), barTop: bar.top, scrollY: window.scrollY, panelR: panel.right, hitAll, wire: document.querySelector('#stitch-parts-panel .stitch-wire').getBoundingClientRect().left, sw: document.documentElement.scrollWidth, iw: innerWidth };
			});
			const cols = new Set(m.xs).size, rows = new Set(m.ys).size;
			assert(m.texts.join() === '分類マーカー,本育成編成,因子周回編成,理論値SP,星取表,タイトルのバー' && cols === 2 && rows === 3, `T106(7) ${w}px 2列3行（分類マーカー〜タイトルのバーの順）`, m);
			assert(m.scrollY === 0 && m.bottom <= m.barTop && m.hitAll, `T106(7) ${w}×${h} スクロールなしで6つとも下の欄より上（いちばん下 ${Math.round(m.bottom)}・欄の上端 ${Math.round(m.barTop)}）`, m);
			assert(m.right <= m.wire && m.sw <= m.iw, `T106(7) ${w}px チェックは模式図に重ならない・横スクロールなし`, m);
			await sp.ctx.close();
		});
	}

	/* ── (2) 模式図 ── */
	await block('T106(2) 模式図 2列: 実際の結合画像の比率に近い・人ごとのスキルの枠は2列・祖は2人が縦に並ぶ・親は因子の画面をつないだ形', async () => {
		const sp = await open({ w: 1280, parts: { ...ALL, cols: 2 } });
		const read = () => sp.page.evaluate(() => {
			const sh = document.querySelector('#stitch-parts-panel [data-stitch-wire-cols="2"]');
			const r = (s) => { const e = sh.querySelector(s); if (!e || !e.getClientRects().length) return null; const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, right: q.right, bottom: q.bottom }; };
			const s = sh.getBoundingClientRect();
			const grids = [...sh.querySelectorAll('.stitch-wire-panels')].map((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
			const inside = [...sh.querySelectorAll('*')].filter((e) => e.getClientRects().length).every((e) => { const q = e.getBoundingClientRect(); return q.right <= s.right + 0.5 && q.bottom <= s.bottom + 0.5; });
			return { w: s.width, h: s.height, parent: r('[data-wire-person="parent"]'), status: r('.w2-status'), g1: r('[data-wire-person="grand1"]'), g2: r('[data-wire-person="grand2"]'), sp: r('[data-stitch-part="sp"]'), table: r('[data-stitch-part="table"]'), people: r('[data-stitch-part="people"]'),
				faces: [...sh.querySelectorAll('.w2-face')].length, grids, inside, parts: ['.w2-band', '.w2-hero', '.w2-stats', '.w2-apt', '.w2-btn', '.w2-tabs'].every((q) => !!sh.querySelector(q)) };
		});
		const m = await read();
		const pct = (v) => v / m.w * 100;
		const near = (a, b, tol) => Math.abs(a - b) <= tol;
		assert(near(m.w / m.h, 0.67, 0.04), 'T106(2) 全体の幅÷高さは実物の 0.67 に近い', { w: m.w, h: m.h });
		assert(near(pct(m.parent.w), 43.4, 1.5) && near(pct(m.g1.w), 36, 1.5) && near(pct(m.sp.w), 17, 1.5), 'T106(2) 親・祖・3列目の幅は実物の比率（43.4・36・17）に近い', { parent: pct(m.parent.w), grand: pct(m.g1.w), sp: pct(m.sp.w) });
		assert(near(m.status.h / m.parent.h, 1 / 3, 0.04) && m.parts, 'T106(2)(B) 親の上の欄は親の高さの約 1/3 で、因子の画面の上半分の形（帯・肖像・ステータス・適性・ボタン・タブ）', { ratio: m.status.h / m.parent.h });
		assert(near(m.parent.w / m.parent.h, 0.33, 0.03), 'T106(2)(B) 親の縦横比は実物（0.33）に近い', { ratio: m.parent.w / m.parent.h });
		assert(m.g1.y < m.g2.y && m.g1.bottom <= m.g2.y && m.g1.x === m.g2.x && m.g1.x >= m.parent.right && m.faces === 3, 'T106(2)(A) 親の右の列に祖A1・祖A2 の2人が縦に並び、顔の丸は3人ぶん', m);
		assert(near(m.g2.bottom, m.parent.bottom, m.parent.h * 0.04), 'T106(2) 祖2人の高さの合計は親にそろう', { g2: m.g2.bottom, parent: m.parent.bottom });
		assert(m.grids.length === 3 && m.grids.every((n) => n === 2), 'T106(2)(A) 3人ともスキルの枠は2列', m.grids);
		assert(near(pct(m.sp.h), 8.4, 1.5) && m.sp.y === m.table.y - (m.table.y - m.sp.y) && m.sp.bottom <= m.table.y, 'T106(2)(C) 理論値SP の欄の高さは実物（8.4）に近く、星取表の上にある', { h: pct(m.sp.h) });
		assert(m.inside, 'T106(2) 中身が模式図の枠の外にはみ出さない', null);
		// (D): 星取表を ON／OFF しても理論値SP が消えない
		const set = (p) => sp.page.evaluate((p) => { Object.keys(p).forEach((k) => { stitchParts[k] = p[k]; }); syncStitchPartsUi(); }, p);
		await set({ table: false });
		const a = await read();
		await set({ table: true });
		const b = await read();
		assert(a.sp && a.sp.h > 5 && !a.table && b.sp && b.sp.h === a.sp.h && b.table, 'T106(2)(D) 星取表 OFF でも ON でも理論値SP の欄は同じ大きさで見える', { off: a.sp, on: b.sp });
		await set({ sp: false, table: false });
		const c = await read();
		assert(!c.sp && !c.table && c.w < b.w * 0.9 && c.parent.w === b.parent.w, 'T106(2) 理論値SP・星取表が両方 OFF なら3列目は無く、画像の幅が狭くなる（親の幅は同じ）', { off: c.w, on: b.w });
		await set({ sp: true, table: true, roster: false, factor: false });
		const d = await read();
		assert(d.sp.y === d.people.y, 'T106(2) 上段が OFF なら3列目と人の上端がそろう', { sp: d.sp.y, people: d.people.y });
		assert(jsErrors(sp.errors).length === 0, 'T106(2) コンソールのエラー0', sp.errors);
		await sp.ctx.close();
	});

	await block('T106(2) 模式図 3列: 人ごとのスキルの枠は2列（ほかの形は今のまま）・幅はスマホのチェックの残りに収まる', async () => {
		const sp = await open({ w: 390, parts: { ...ALL, cols: 3 } });
		const m = await sp.page.evaluate(() => {
			const sh = document.querySelector('#stitch-parts-panel [data-stitch-wire-cols="3"]');
			const s = sh.getBoundingClientRect();
			const inside = [...sh.querySelectorAll('*')].filter((e) => e.getClientRects().length).every((e) => { const q = e.getBoundingClientRect(); return q.right <= s.right + 0.5 && q.bottom <= s.bottom + 0.5; });
			const panel = document.querySelector('#stitch-parts-panel .stitch-show').getBoundingClientRect();
			return { grids: [...sh.querySelectorAll('.stitch-wire-people .stitch-wire-panels')].map((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length), persons: sh.querySelectorAll('.stitch-wire-person').length, inside, w: s.width, right: s.right, panelRight: panel.right, table: !!sh.querySelector('[data-stitch-part="table"]'), sp: !!sh.querySelector('[data-stitch-part="sp"]') };
		});
		assert(m.persons === 3 && m.grids.length === 3 && m.grids.every((n) => n === 2), 'T106(2) 3列の模式図: 3人ともスキルの枠は2列', m);
		assert(m.inside && m.right <= m.panelRight && m.w > 90, 'T106(2) 3列の模式図は枠の中に収まる', m);
		await sp.page.evaluate(() => { stitchParts.table = false; stitchParts.sp = false; stitchParts.roster = false; stitchParts.factor = false; syncStitchPartsUi(); });
		const off = await sp.page.evaluate(() => document.querySelector('#stitch-parts-panel [data-stitch-wire-cols="3"]').getBoundingClientRect().width);
		assert(Math.abs(off - m.w) < 1, 'T106(2) 3列の模式図の幅は欄を消しても変わらない（実物も 2206px のまま）', { off, on: m.w });
		await sp.ctx.close();
	});

	/* ── 通しの流れ・(8)(9)(10) ── */
	for (const [w, h] of [[390, 844], [1280, 900]]) {
		await block(`T106(3)(8)(9)(10) ${w}px 通し: 動画を選ぶ → 結合 → ③に結合画像（知らせ・枚数・見出し・「画像を更新」は無し・ダウンロードは控えめなアイコン）→ OCR処理を開始する → 引き出し`, async () => {
			const sp = await open({ w, h, mode: 'video', data: true });
			const res = await runVideo(sp.page);
			assert(res && res.ok === true && res.stitched === true, `T106 ${w}px 結合まで自動で進む`, res);
			const m = await sp.page.evaluate(() => {
				const box = document.querySelector('#personset-A-wrap .video-result');
				const a = box.querySelector('a');
				const cs = getComputedStyle(a);
				const area = document.getElementById('personset-A-wrap').parentElement;
				return { sum: !!document.getElementById('video-summary'), text: area.innerText, boxText: box.innerText,
					refresh: !!box.querySelector('[data-video-refresh]'), a: { aria: a.getAttribute('aria-label'), title: a.title, text: a.textContent.trim(), svg: !!a.querySelector('svg'), w: a.getBoundingClientRect().width, h: a.getBoundingClientRect().height, bg: cs.backgroundColor, download: !!a.getAttribute('download') || !!a.href }, img: !!box.querySelector('img'),
					tab: (document.querySelector('#personset-tabs [data-tab-id="0"] .uma-subtab-count') || {}).textContent || null, badge: document.getElementById('image-count-badge').hidden };
			});
			assert(!m.sum && !/\d+\s*枚/.test(m.text.replace('それぞれで1枚にまとめて', '')) &&!/動画から/.test(m.text) && !/OCR処理を開始する」を押/.test(m.text), `T106(8) ${w}px 読み取り後に何枚取ったかの文・「このあと…」の文は無い`, m.text);
			assert(!m.tab && m.badge, `T106(8) ${w}px タブとステップの枚数にも出ない`, m);
			assert(!/親Aセット/.test(m.boxText) && !/画像を更新/.test(m.boxText) && !m.refresh && m.img, `T106(9) ${w}px ③の結合画像の上に「親Aセット」と「画像を更新」は無い`, m.boxText);
			assert(m.a.aria === 'PNGをダウンロード' && m.a.text === '' && m.a.svg && m.a.w <= 44 && m.a.h <= 44 && m.a.bg === 'rgba(0, 0, 0, 0)' && m.a.download, `T106(10) ${w}px ダウンロードは地の無いアイコンのボタン（読み上げ名は「PNGをダウンロード」）`, m.a);
			// 親ごとの画像を見ると、列の字が出る
			await sp.page.click('#personset-A-wrap .video-showcols');
			const l = await sp.page.evaluate(() => [...document.querySelectorAll('#personset-A-wrap .upload-col > p')].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()).join());
			assert(l === '親A,祖A1,祖A2', `T106(5) ${w}px 「親ごとの画像を見る」で出した3列には誰の列かの字を残す`, l);
			await sp.page.click('#personset-A-wrap .video-showcols');
			// OCR処理を開始する → 引き出し（結合画像のタブには今までどおりの見出しとダウンロード）
			await sp.page.click('#process-stitch-btn');
			await sp.page.waitForFunction(() => !combinedInProgress && document.querySelector('#stitch-result-content img'), null, { timeout: 180000 });
			await sp.page.waitForTimeout(400);
			const d = await sp.page.evaluate(() => { const a = document.querySelector('#stitch-result-content a.uma-btn'); return { open: !!openDrawerKey, step3: !!document.querySelector('#personset-A-wrap .video-result img'), dl: a && a.textContent.trim(), primary: a && a.classList.contains('uma-btn--primary'), head: (document.querySelector('#stitch-result-content p.text-xs.font-bold') || {}).textContent }; });
			assert(d.open && d.step3, `T106 ${w}px OCR のあと引き出しが開き、③にも結合画像がある`, d);
			assert(d.dl === 'PNGをダウンロード' && d.primary && d.head === '親Aセット', `T106(10) ${w}px 引き出しの結合画像のタブのダウンロードと見出しは今のまま`, d);
			assert(jsErrors(sp.errors).length === 0, `T106 ${w}px コンソールのエラー0`, jsErrors(sp.errors));
			await sp.ctx.close();
		});
	}

	/* ── (11) 引き出しの小窓 ── */
	for (const [w, h] of [[390, 844], [390, 664], [390, 600], [1280, 900]]) {
		await block(`T106(11) ${w}×${h} 引き出しの「結合画像の設定」: 6つのチェックは1列6行・模式図あり・スクロールせずに「画像を更新」まで見える`, async () => {
			const sp = await open({ w, h, mode: 'video', parts: { ...ALL, cols: 2 } });
			await runVideo(sp.page);
			await sp.page.evaluate(() => runImageStitching({ keepClosed: false, quiet: true, withMarks: false }));
			await sp.page.waitForTimeout(500);
			await sp.page.click('#stitch-drawer-fab');
			await sp.page.waitForTimeout(250);
			const m = await sp.page.evaluate(() => {
				const pop = document.getElementById('stitch-drawer-pop'), body = pop.querySelector('.uma-popover-body');
				const items = [...pop.querySelectorAll('.stitch-show-item')].map((e) => e.getBoundingClientRect());
				const btn = document.getElementById('stitch-refresh-btn').getBoundingClientRect();
				const wire = pop.querySelector('.stitch-wire'), wr = wire && wire.getBoundingClientRect();
				const p = pop.getBoundingClientRect();
				return { xs: new Set(items.map((r) => Math.round(r.x))).size, ys: new Set(items.map((r) => Math.round(r.y))).size, wire: !!wire && wire.getClientRects().length > 0, wireH: wr && wr.height, wireBottom: wr && wr.bottom, popTop: p.top, popBottom: p.bottom, popRight: p.right, btnBottom: btn.bottom, btnH: btn.height, scroll: body.scrollHeight - body.clientHeight, vh: innerHeight, vw: innerWidth, wireRight: wr && wr.right };
			});
			assert(m.xs === 1 && m.ys === 6, `T106(11) ${w}×${h} チェックは1列6行のまま`, m);
			assert(m.wire && m.wireRight <= m.popRight, `T106(11) ${w}×${h} 模式図がある`, m);
			assert(m.scroll <= 1 && m.btnBottom <= m.popBottom && m.popBottom <= m.vh && m.popTop >= 0, `T106(11) ${w}×${h} スクロールせずに「画像を更新」まで見える（小窓の中のスクロール ${m.scroll}px）`, m);
			assert(jsErrors(sp.errors).length === 0, `T106(11) ${w}×${h} コンソールのエラー0`, sp.errors);
			await sp.ctx.close();
		});
	}

	/* ── 試しのページ（T106-1・回答 300。製品からはリンクしない） ── */
	await block('T106 lab/video-pick-test.html: 2つのボタン（multiple なし／あり。accept は製品と同じ）・本数・名前・大きさ・種類・時間・選ばずに戻ったときを出す', async () => {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await ctx.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
		await page.goto(base + '/lab/video-pick-test.html');
		const productAccept = await (async () => { const sp = await openPage(browser, base, 'special.html', { width: 390, height: 844 }, EMPTY); const a = await sp.page.getAttribute('#video-file-input', 'accept'); await sp.ctx.close(); return a; })();
		const attrs = await page.evaluate(() => ['single', 'multiple'].map((k) => { const i = document.getElementById('input-' + k); return { accept: i.accept, multiple: i.multiple }; }));
		assert(attrs[0].accept === productAccept && attrs[1].accept === productAccept && !attrs[0].multiple && attrs[1].multiple, 'T106 lab: accept は製品と同じで、multiple は片方だけ', { attrs, productAccept });
		const pick = async (id, files) => {
			const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click(id)]);
			await ch.setFiles(files);
			await page.waitForTimeout(100);
			return page.evaluate(() => (document.querySelector('#log .rec') || {}).innerText);
		};
		const f = (name, n) => ({ name, mimeType: 'video/mp4', buffer: Buffer.alloc(n) });
		const a = await pick('#pick-single', [f('a.mp4', 2048)]);
		assert(/1本だけ/.test(a) && /1本 返った/.test(a) && /a\.mp4／2 KB／video\/mp4/.test(a) && /押してから戻るまで: \d+\.\d秒/.test(a), 'T106 lab: 1本だけ: 本数・名前・大きさ・種類・時間が出る', a);
		const b = await pick('#pick-multiple', [f('b.mp4', 1024), f('c.mp4', 2097152)]);
		assert(/今と同じ/.test(b) && /2本 返った/.test(b) && /b\.mp4／1 KB／video\/mp4/.test(b) && /c\.mp4／2\.0 MB／video\/mp4/.test(b), 'T106 lab: 今と同じ: 2本とも出る', b);
		const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click('#pick-multiple')]);
		await ch.element().evaluate((i) => i.dispatchEvent(new Event('cancel')));
		const none = await page.evaluate(() => document.querySelector('#log .rec').innerText);
		assert(/何も選ばずに戻った/.test(none) && /押してから戻るまで/.test(none), 'T106 lab: 何も選ばずに戻ったことが分かる', none);
		const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#pick-single')]);
		await ch2.element().evaluate((i) => { i.value = ''; i.dispatchEvent(new Event('change')); });
		const zero = await page.evaluate(() => document.querySelector('#log .rec').innerText);
		assert(/何も選ばずに戻った（change・0本）/.test(zero), 'T106 lab: 0本の change も選ばずに戻ったと出る', zero);
		const m = await page.evaluate(() => ({ steps: document.querySelectorAll('ol li').length, sw: document.documentElement.scrollWidth, iw: innerWidth, top: document.querySelector('ol').getBoundingClientRect().top < document.getElementById('pick-single').getBoundingClientRect().top }));
		assert(m.steps === 4 && m.top && m.sw <= m.iw, 'T106 lab: 手順はボタンの上・横スクロールなし', m);
		const linked = ['special.html', 'exam.html', 'index.html'].some((n) => env.fs.readFileSync(env.path.join(env.REPO_ROOT, n), 'utf8').includes('video-pick-test'));
		assert(!linked, 'T106 lab: 製品からリンクしない', linked);
		assert(errors.length === 0, 'T106 lab: コンソールのエラー0', errors);
		await ctx.close();
	});
}
