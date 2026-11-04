// UmaStar の「結合画像の設定」（T96・2026-11-04 おいもさんの決定 112〜118・C-284）の検査。
// run-smoke.mjs の末尾から register106() で呼ばれる（塊の見出しはすべて「T96結合画像の設定」で始まる。`npm run test:visual -- --only=T96結合画像の設定` で回せる）。
//
// 決め:
//  - 新UI の③（「画像をアップロード」）の「種類の枠」のチェックを「結合画像の設定」（チェック5つ〔分類マーカー／本育成編成／因子周回編成／理論値SP／星取表〕＋模式図）に置き換える。
//    結合画像の引き出しの中にも同じチェック（模式図なし）と「画像を更新」を置く（UmaExam と同じ）。旧UI は今までどおり「種類の枠」のチェック。
//  - 初期値は全部 OFF（シンプル）。保存キーは uma-special-stitch-parts。今の「種類の枠」の保存値（uma-special-tier-marks）は読まない。
//  - 全部 OFF＝②で選んだスキルを全部同じ緑の枠（#2F9E1F・塗り #E6F5DA）。遺伝子は遺伝子の色。タイトルのバーと人の見出しはいつも描く。
//    分類マーカー ON＝種類の3色の枠と「枠の見かた」の行。本育成編成・因子周回編成・理論値SP・星取表は ON のときだけ描く（上段は ON の欄を左から詰める）。
//  - 表示したあとに設定を変えても作り直さず、引き出しの「画像を更新」で OCR を回さずに作り直す（設定が同じなら押せない・画像が変わったら案内）。
// スキル名は検査の側に書かない（②の名前はページの中で core から引く。恒久ルール1）。

import { reloadReady } from './lib/page-ready.mjs';
import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';

export async function register106(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1)).concat(['32', '45']);
	const KEYS = ['marker', 'roster', 'factor', 'sp', 'table'];
	const LABELS = ['分類マーカー', '本育成編成', '因子周回編成', '理論値SP', '星取表'];
	// T98（C-285・決定 161・162）: チェックの6つ目に「タイトルのバー」（初期値 ON）
	const LABELS6 = LABELS.concat(['タイトルのバー']);
	const KEYS6 = KEYS.concat(['title']);

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ roster, scope, pre }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '2');
			Object.keys(pre || {}).forEach((k) => { if (pre[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, pre[k]); });
		}, { roster: o.roster || null, scope: o.ids ? { skillIds: o.ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 } : null, pre: o.pre || null });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		if (o.ids && o.ids.length) {
			await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
			await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
			await sp.page.waitForTimeout(300);
		}
		await sp.page.evaluate(HELPERS);
		return sp;
	};
	// ページの中の道具。__person は blocks-82 と同じ合成の1人分（灰の地に2列のパネル。行は y = 10 + 80k・高さ 60）。
	// __build(parts, withMarks) … ②の先頭のスキル（core から引く）を 0:2 の行に、2つめを 0:5 の行に読めたことにして buildStitchedSetImage を呼ぶ
	const HELPERS = `
		window.__person = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = 'rgb(242,242,242)'; g.fillRect(0, 0, W, H);
			const cols = [[Math.round(W * 0.19), Math.round(W * 0.58)], [Math.round(W * 0.60), Math.round(W * 0.98)]];
			for (let y = 10; y < H - 60; y += 80) cols.forEach(([a, b]) => { g.fillStyle = 'rgb(226,226,226)'; g.fillRect(a, y, b - a, 60); g.fillStyle = 'rgb(90,60,30)'; g.fillRect(a + 2, y + 22, b - a - 4, 14); });
			c._sourcePlacements = []; c._profileHeader = { kept: false, ratio: 0.31, height: 0 }; return c; };
		window.__count = (c, rgb, tol) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
			for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol) n++; return n; };
		window.__build = async (parts, withMarks) => {
			const W = 1179, H = 2342;
			const rows = []; for (let y = 10; y < H - 60; y += 80) { rows.push({ y: y, h: 60, col: 0 }); rows.push({ y: y, h: 60, col: 1 }); }
			const geo = [{ rows: rows, columnXs: [Math.round(W * 0.19) + 50, Math.round(W * 0.60) + 50], scale: 1 }];
			const snap = captureStitchSnapshot();
			const a = snap.entries[0].name, b = snap.entries[1].name;
			const lines = [{ text: a, rowKey: '0:2' }, { text: b, rowKey: '0:5' }];
			const res = { detectedSkills: new Set([a, b]), skillStars: { [a]: 3, [b]: 1 }, skillSources: { [a]: [0], [b]: [1] }, matchReasons: {} };
			snap.kindByName = { [a]: 'card', [b]: 'star' };
			snap.geneNames = [];
			snap.results = [res, null, null];
			const keep = { s: window.stitchOnePerson, f: persons[0].files, snap: stitchSnapshot, g: personGeometry[0], l: personLines[0], r: personResults[0] };
			stitchSnapshot = snap; personGeometry[0] = geo; personLines[0] = lines; personResults[0] = res;
			window.stitchOnePerson = async () => __person(W, H);
			persons[0].files = [{ name: 'a.png' }];
			try {
				const c = await buildStitchedSetImage(0, null, withMarks !== false, parts);
				const L = c._layout;
				return { c: c, url: c.toDataURL('image/png'), W: L.width, H: L.height, bar: !!L.bar && L.bar.h === 70, heads: L.heads.length, bodyY: L.bodyY,
					top: L.top ? { h: L.top.h, keys: ['sp', 'roster', 'factor'].filter((k) => L.top[k]), x: Object.fromEntries(['sp', 'roster', 'factor'].filter((k) => L.top[k]).map((k) => [k, L.top[k].x])), seps: L.top.seps.length } : null,
					table: !!L.table, legend: !!L.legend, mark: c._markCount,
					green: __count(c, [47, 158, 31], 8), teal: __count(c, [0, 128, 112], 8), ochre: __count(c, [156, 106, 0], 8) };
			} finally {
				window.stitchOnePerson = keep.s; persons[0].files = keep.f; stitchSnapshot = keep.snap; personGeometry[0] = keep.g; personLines[0] = keep.l; personResults[0] = keep.r;
			}
		};
		window.__parts = (on, extra) => Object.assign(stitchPartsAll(false), { legacy: false }, Object.fromEntries((on || []).map((k) => [k, true])), extra || {});
	`;

	await block('T96結合画像の設定(1) 初めて開いた人: ③のパネル（見出し「結合画像の設定」・チェック5つの名前と並び・模式図）は全部 OFF。今の「種類の枠」が ON の保存値でも OFF・旧UI は「種類の枠」のチェックのまま', async () => {
		const read = async (pre) => {
			const { ctx, page, errors } = await openSp({ pre });
			const r = await page.evaluate(() => {
				const panel = document.getElementById('stitch-parts-panel');
				const labels = Array.from(panel.querySelectorAll('.stitch-show-item')).map((l) => l.textContent.trim());
				return { panelShown: !panel.hidden && panel.getClientRects().length > 0, rowShown: !document.getElementById('tier-marks-row').hidden,
					title: (panel.querySelector('.stitch-show-title') || {}).textContent, labels,
					checked: Array.from(panel.querySelectorAll('input[data-stitch-part-key]')).map((i) => i.checked),
					drawerChecked: Array.from(document.querySelectorAll('#stitch-parts-panel-drawer input[data-stitch-part-key]')).map((i) => i.checked),
					drawerIds: Array.from(document.querySelectorAll('#stitch-parts-panel-drawer input')).map((i) => i.id),
					wire: !!panel.querySelector('.stitch-wire'), drawerWire: !!document.querySelector('#stitch-parts-panel-drawer .stitch-wire'),
					drawerTitle: !!document.querySelector('#stitch-parts-panel-drawer .stitch-show-title'),
					now: stitchPartsNow(), status: document.getElementById('tier-marks-status').textContent, deckMode };
			});
			await ctx.close();
			return Object.assign(r, { errors: jsErrors(errors) });
		};
		const fresh = await read(null);
		const oldOn = await read({ 'uma-special-tier-marks': '1' });
		const broken = await read({ 'uma-special-stitch-parts': '{oops' });
		assert(fresh.deckMode && fresh.panelShown && !fresh.rowShown, 'T96(1): 新UI では③に「結合画像の設定」を出し、「種類の枠」のチェックは出さない', fresh);
		assert(fresh.title === '結合画像の設定' && JSON.stringify(fresh.labels) === JSON.stringify(LABELS6), 'T96(1): 見出し「結合画像の設定」・チェックは 分類マーカー／本育成編成／因子周回編成／理論値SP／星取表／タイトルのバー（T98）の順（括弧の補足なし）', { title: fresh.title, labels: fresh.labels });
		assert(fresh.wire && !fresh.drawerWire && !fresh.drawerTitle && fresh.drawerIds.join(',') === KEYS6.map((k) => 'drawer-opt-stitch-' + k).join(','), 'T96(1): ③は模式図つき・引き出しの中は模式図と見出しなし（id は drawer-）', { wire: fresh.wire, drawerWire: fresh.drawerWire, ids: fresh.drawerIds });
		[fresh, oldOn, broken].forEach((x, i) => {
			assert(x.checked.slice(0, 5).every((c) => !c) && x.drawerChecked.slice(0, 5).every((c) => !c) && x.checked[5] === true && x.drawerChecked[5] === true && KEYS.every((k) => x.now[k] === false) && x.now.title === true && x.now.cols === 3, 'T96(1): 全部 OFF・タイトルのバーは ON・3列（T98）（' + ['保存値なし', '「種類の枠」ON の保存値あり', '壊れた保存値'][i] + '）', { checked: x.checked, now: x.now });
		});
		assert(fresh.status === '', 'T96(1): 全部 OFF のとき③の下の「種類の枠は付けません」の文は出さない', fresh.status);
		// 旧UI: 告知の既読と保存値 'old' を入れて開き直す（blocks-18 と同じ手順。恒久ルール20）
		const { ctx, page, errors } = await openSp();
		await page.evaluate(() => { localStorage.setItem(UI_NOTICE_STORAGE_KEY, UI_NOTICE_ID); localStorage.setItem('uma-special-ui-mode', 'old'); });
		await reloadReady(page);
		await page.waitForTimeout(400);
		const old = await page.evaluate(() => ({ deckMode, panelShown: !document.getElementById('stitch-parts-panel').hidden, rowShown: !document.getElementById('tier-marks-row').hidden,
			row: document.getElementById('tier-marks-row').textContent.trim(), checked: document.getElementById('opt-tier-marks').checked, now: stitchPartsNow() }));
		await ctx.close();
		assert(!old.deckMode && !old.panelShown && old.rowShown && old.row === '種類の枠（周回サポカ・サポカ外・その他）を付ける' && old.checked && old.now.legacy && old.now.marker && old.now.table,
			'T96(1): 旧UI は今までどおり「種類の枠」のチェック（既定 ON）でパネルを出さない', old);
		assert(fresh.errors.length + oldOn.errors.length + broken.errors.length + jsErrors(errors).length === 0, 'T96(1): コンソールエラー0', fresh.errors.concat(oldOn.errors, broken.errors, jsErrors(errors)).slice(0, 3));
	});

	await block('T96結合画像の設定(2) 選んだ設定は保存キー uma-special-stitch-parts に覚え、再読み込みのあとも残る・③と引き出しのどちらで変えても同じ設定・模式図はチェックに合わせて消える', async () => {
		const { ctx, page, errors } = await openSp();
		await page.check('#opt-stitch-roster');
		await page.check('#opt-stitch-table');
		const a = await page.evaluate(() => ({ drawer: Array.from(document.querySelectorAll('#stitch-parts-panel-drawer input')).map((i) => i.checked), saved: localStorage.getItem('uma-special-stitch-parts'),
			wire: ['sp', 'roster', 'factor', 'table', 'marker'].map((k) => !document.querySelector('#stitch-parts-panel [data-stitch-part="' + k + '"]').hidden),
			top: !document.querySelector('#stitch-parts-panel [data-stitch-wire-top]').hidden, marker: document.querySelector('#stitch-parts-panel .stitch-wire-sheet').classList.contains('is-marker') }));
		// 引き出しの中のチェックで変える（引き出しは閉じたまま、要素を直接押す）
		await page.evaluate(() => { const i = document.getElementById('drawer-opt-stitch-marker'); i.click(); });
		const b = await page.evaluate(() => ({ main: Array.from(document.querySelectorAll('#stitch-parts-panel input')).map((i) => i.checked), now: stitchPartsNow(),
			marker: document.querySelector('#stitch-parts-panel .stitch-wire-sheet').classList.contains('is-marker'), legendShown: !document.querySelector('#stitch-parts-panel [data-stitch-part="marker"]').hidden }));
		await reloadReady(page);
		for (let i = 0; i < 2; i++) if (await page.isVisible('#ui-notice')) await page.click('[data-act="notice-ok"]');
		const c = await page.evaluate(() => ({ main: Array.from(document.querySelectorAll('#stitch-parts-panel input')).map((i) => i.checked),
			drawer: Array.from(document.querySelectorAll('#stitch-parts-panel-drawer input')).map((i) => i.checked) }));
		await page.uncheck('#opt-stitch-roster'); await page.uncheck('#opt-stitch-table'); await page.uncheck('#opt-stitch-marker');
		const d = await page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem('uma-special-stitch-parts')), top: !document.querySelector('#stitch-parts-panel [data-stitch-wire-top]').hidden }));
		assert(JSON.stringify(a.drawer) === JSON.stringify([false, true, false, false, true, true]) && JSON.parse(a.saved).roster === true && JSON.parse(a.saved).table === true,
			'T96(2): ③で入れたチェックは引き出しのパネルにも映り、保存キーに入る', a);
		assert(JSON.stringify(a.wire) === JSON.stringify([false, true, false, true, false]) && a.top && !a.marker, 'T96(2): 模式図は ON の部分だけ出る（上段は本育成編成だけ・星取表あり・枠の見かたなし・枠は緑）', a);
		assert(JSON.stringify(b.main) === JSON.stringify([true, true, false, false, true, true]) && b.now.marker && b.marker && b.legendShown, 'T96(2): 引き出しで変えた分類マーカーも③に映る（模式図の枠が種類の色・枠の見かたが出る）', b);
		assert(JSON.stringify(c.main) === JSON.stringify([true, true, false, false, true, true]) && JSON.stringify(c.drawer) === JSON.stringify(c.main), 'T96(2): 再読み込みのあとも残る', c);
		assert(KEYS.every((k) => d.saved[k] === false) && !d.top, 'T96(2): 全部外すと全部 OFF で保存し、模式図の上段も消える', d);
		assert(jsErrors(errors).length === 0, 'T96(2): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T96結合画像の設定(3) 結合画像: 全部 OFF・1つずつ ON の5通り・全部 ON の7通りで、ON のパーツだけを描く（バーと人の見出しはいつも）・全部 OFF は②のスキルを同じ緑の枠・全部 ON は旧来の組み立て（legacy）と同じ画', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS });
		const r = await page.evaluate(async (KEYS) => {
			const out = {};
			const combos = [['none', []]].concat(KEYS.map((k) => [k, [k]])).concat([['all', KEYS]]);
			for (const [name, on] of combos) { const x = await __build(__parts(on)); delete x.c; out[name] = x; }
			const legacy = await __build(Object.assign(stitchPartsAll(true), { legacy: true }));
			out.allSame = legacy.url === out.all.url;
			Object.keys(out).forEach((k) => { if (out[k] && out[k].url) out[k].url = out[k].url.length; });
			out.L = { margin: STITCH_LAYOUT.margin, spW: STITCH_LAYOUT.spW, zone: STITCH_LAYOUT.gap * 2 + STITCH_LAYOUT.sepW };
			out.simpleStyle = factorFrameStyleOf('simple');
			return out;
		}, KEYS);
		const all7 = ['none', 'marker', 'roster', 'factor', 'sp', 'table', 'all'];
		all7.forEach((n) => assert(r[n].bar && r[n].heads === 1 && r[n].W >= 2206, 'T96(3): ' + n + ': タイトルのバーと人の見出しはいつも描く', { bar: r[n].bar, heads: r[n].heads, W: r[n].W }));
		assert(r.simpleStyle && r.simpleStyle.frame === '#2F9E1F' && r.simpleStyle.tint === '#E6F5DA' && r.simpleStyle.marker === null, 'T96(3): シンプルの枠の色は #2F9E1F・塗り #E6F5DA', r.simpleStyle);
		assert(!r.none.top && !r.none.table && !r.none.legend && r.none.mark === 2 && r.none.green > 100 && r.none.teal === 0 && r.none.ochre === 0 && r.none.bodyY === 28 + 70 + 20,
			'T96(3): 全部 OFF: 上段・星取表・枠の見かたなし。②のスキル2行を同じ緑の枠（種類の色は出ない）・中段はバーのすぐ下', r.none);
		assert(r.marker.mark === 2 && r.marker.legend && r.marker.teal > 100 && r.marker.ochre > 100 && r.marker.green === 0 && !r.marker.top && !r.marker.table,
			'T96(3): 分類マーカーだけ: 種類の色の枠（周回サポカ・サポカ外）と枠の見かた・緑の枠なし', r.marker);
		assert(r.roster.top && JSON.stringify(r.roster.top.keys) === '["roster"]' && r.roster.top.h === 176 && r.roster.top.seps === 0 && r.roster.top.x.roster === r.L.margin && !r.roster.table && !r.roster.legend && r.roster.green > 100,
			'T96(3): 本育成編成だけ: 上段は本育成編成の欄だけ（左端から・区切りなし・カードの高さ 176）', r.roster.top);
		assert(r.factor.top && JSON.stringify(r.factor.top.keys) === '["factor"]' && r.factor.top.h === 176 && r.factor.top.x.factor === r.L.margin, 'T96(3): 因子周回編成だけ: 上段は因子周回編成の欄だけ（左端から）', r.factor.top);
		assert(r.sp.top && JSON.stringify(r.sp.top.keys) === '["sp"]' && r.sp.top.h === 228 && r.sp.top.seps === 0, 'T96(3): 理論値SP だけ: 上段は理論値SP の欄だけ（高さ 228）', r.sp.top);
		assert(r.table.table && !r.table.top && !r.table.legend && r.table.green > 100, 'T96(3): 星取表だけ: 星取表あり・上段・枠の見かたなし・枠は緑', r.table);
		assert(r.all.top && JSON.stringify(r.all.top.keys) === '["sp","roster","factor"]' && r.all.top.h === 228 && r.all.top.seps === 2 && r.all.table && r.all.legend && r.all.teal > 100 && r.all.green === 0,
			'T96(3): 全部 ON: 上段3欄（区切り2本・高さ 228）・星取表・枠の見かた・種類の色の枠', r.all);
		assert(r.allSame, 'T96(3): 全部 ON の画は、旧来の組み立て（種類の枠 ON・ほかは材料があれば描く）と1画素も違わない', r.allSame);
		assert(r.roster.bodyY === 28 + 70 + 20 + 176 + 30 && r.sp.bodyY === 28 + 70 + 20 + 228 + 30, 'T96(3): 中段の上端は描いた上段の高さに合わせる（レイアウトが崩れない）', { roster: r.roster.bodyY, sp: r.sp.bodyY });
		assert(jsErrors(errors).length === 0, 'T96(3): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T96結合画像の設定(4) 上段の詰め方: OFF の欄を除いて左から詰める（欄の幅は3つとも描くときと同じ）・理論値SP なしは高さ 176・3つとも OFF は上段なし／「OCRしない」結合も設定に従う（枠・表は今までどおり描かない）', async () => {
		const { ctx, page, errors } = await openSp({ roster: R1S, ids: IDS });
		const r = await page.evaluate(async () => {
			const all = await __build(__parts(['sp', 'roster', 'factor']));
			const noSp = await __build(__parts(['roster', 'factor']));
			const noRoster = await __build(__parts(['sp', 'factor']));
			const pick = (x) => ({ top: x.top, bodyY: x.bodyY });
			const noOcrOff = await __build(__parts([]), false);
			const noOcrAll = await __build(__parts(['marker', 'roster', 'factor', 'sp', 'table']), false);
			return { all: pick(all), noSp: pick(noSp), noRoster: pick(noRoster), noOcrOff: { top: noOcrOff.top, table: noOcrOff.table, legend: noOcrOff.legend, mark: noOcrOff.mark, green: noOcrOff.green },
				noOcrAll: { top: noOcrAll.top, table: noOcrAll.table, legend: noOcrAll.legend, mark: noOcrAll.mark, green: noOcrAll.green, teal: noOcrAll.teal } };
		});
		assert(r.noSp.top.h === 176 && r.noSp.top.x.roster === 28 && r.noSp.top.x.factor === r.all.top.x.factor - (r.all.top.x.roster - 28) && r.noSp.top.seps === 1,
			'T96(4): 理論値SP なし: 本育成編成を左端へ詰め、因子周回編成も同じだけ左へ（区切り1本・高さ 176）', { noSp: r.noSp.top, all: r.all.top });
		assert(r.noRoster.top.h === 228 && r.noRoster.top.x.sp === 28 && r.noRoster.top.x.factor === r.all.top.x.roster && r.noRoster.top.seps === 1, 'T96(4): 本育成編成なし: 因子周回編成が本育成編成の場所へ詰まる', r.noRoster.top);
		assert(!r.noOcrOff.top && !r.noOcrOff.table && !r.noOcrOff.legend && r.noOcrOff.mark === 0 && r.noOcrOff.green === 0, 'T96(4): 「OCRしない」結合・全部 OFF: 上段なし・枠なし', r.noOcrOff);
		assert(r.noOcrAll.top && r.noOcrAll.top.keys.length === 3 && !r.noOcrAll.table && !r.noOcrAll.legend && r.noOcrAll.mark === 0 && r.noOcrAll.green === 0 && r.noOcrAll.teal === 0,
			'T96(4): 「OCRしない」結合・全部 ON: 上段は描く・枠・表・枠の見かたは今までどおり描かない', r.noOcrAll);
		assert(jsErrors(errors).length === 0, 'T96(4): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T96結合画像の設定(5) 表示したあとに変えたとき（UmaExam と同じ）: 引き出しの丸ボタン → パネル。設定が同じ間は「画像を更新」を押せず、変えると押せて OCR を回さずに作り直す（未読の印は立てない）・画像が変わったら押せず案内・Esc はパネルから閉じる', async () => {
		const { ctx, page, errors } = await openSp({ w: 375, h: 812, roster: R1S, ids: IDS });
		await page.evaluate(async () => {
			window.__stub = { n: 0 };
			window.stitchOnePerson = async () => { __stub.n++; return __person(1179, 2342); };
			persons[0].files = [{ name: 'a.png' }];
			await runImageStitching({ keepClosed: false, quiet: true, withMarks: false });
		});
		await page.waitForTimeout(500);
		const s0 = await page.evaluate(() => ({ open: openDrawerKey, fab: !document.getElementById('stitch-drawer-fab').hidden, state: stitchRefreshState(), n: __stub.n }));
		await page.click('#stitch-drawer-fab');
		const s1 = await page.evaluate(() => ({ pop: !document.getElementById('stitch-drawer-pop').hidden, btn: document.getElementById('stitch-refresh-btn').disabled,
			note: !document.getElementById('stitch-refresh-note').hidden, focus: document.activeElement && document.activeElement.id, title: document.getElementById('stitch-drawer-pop-title').textContent.trim() }));
		await page.check('#drawer-opt-stitch-roster');
		const s2 = await page.evaluate(() => ({ state: stitchRefreshState(), btn: document.getElementById('stitch-refresh-btn').disabled, n: __stub.n, main: document.getElementById('opt-stitch-roster').checked }));
		await page.evaluate(() => { fabUnseen.stitch = false; });
		await page.click('#stitch-refresh-btn');
		await page.waitForFunction(() => !stitchInProgress && !stitchRefreshBusy, null, { timeout: 20000 });
		const s3 = await page.evaluate(() => ({ state: stitchRefreshState(), btn: document.getElementById('stitch-refresh-btn').disabled, n: __stub.n, unseen: fabUnseen.stitch,
			pop: !document.getElementById('stitch-drawer-pop').hidden, open: openDrawerKey, toast: document.getElementById('toast').textContent.trim(), imgs: document.querySelectorAll('#stitch-result-content img').length,
			withMarks: lastStitchShown.withMarks, parts: lastStitchShown.parts.roster }));
		// 画像が変わったら作り直せない（OCR からやり直し）
		await page.evaluate(() => { persons[0].files = [{ name: 'a.png' }, { name: 'b.png' }]; updateProcessBtn(); });
		await page.uncheck('#drawer-opt-stitch-roster');
		const s4 = await page.evaluate(() => ({ state: stitchRefreshState(), btn: document.getElementById('stitch-refresh-btn').disabled, note: !document.getElementById('stitch-refresh-note').hidden }));
		await page.keyboard.press('Escape');
		const s5 = await page.evaluate(() => ({ pop: !document.getElementById('stitch-drawer-pop').hidden, open: openDrawerKey, expanded: document.getElementById('stitch-drawer-fab').getAttribute('aria-expanded') }));
		await page.keyboard.press('Escape');
		const s6 = await page.evaluate(() => ({ open: openDrawerKey, fab: !document.getElementById('stitch-drawer-fab').hidden }));
		assert(s0.open === 'stitch' && s0.fab && s0.state === 'same' && s0.n === 1, 'T96(5): 結合画像ができると引き出しの中に丸ボタンが出る（設定が同じなので「same」）', s0);
		assert(s1.pop && s1.btn && !s1.note && s1.focus === 'stitch-drawer-pop-close' && s1.title === '結合画像の設定', 'T96(5): 丸ボタンでパネル（見出し「結合画像の設定」）が開き、設定が同じ間は「画像を更新」を押せない', s1);
		assert(s2.state === 'ready' && !s2.btn && s2.n === 1 && s2.main, 'T96(5): チェックを変えただけでは作り直さず、「画像を更新」が押せるようになる（③のチェックにも映る）', s2);
		assert(s3.n === 2 && s3.state === 'same' && s3.btn && !s3.unseen && s3.pop && s3.open === 'stitch' && s3.toast === '結合画像を更新しました' && s3.imgs === 1 && s3.withMarks === false && s3.parts === true,
			'T96(5): 「画像を更新」で、前と同じ入口（OCRしない）のまま今の設定で作り直す（パネルは開いたまま・未読の印なし・トースト）', s3);
		assert(s4.state === 'stale' && s4.btn && s4.note, 'T96(5): 結合したあとに画像が変わったら押せず、「OCR処理＋画像結合を開始する」からやり直す案内を出す', s4);
		assert(!s5.pop && s5.open === 'stitch' && s5.expanded === 'false' && s6.open === null, 'T96(5): Esc はパネルを先に閉じ、次の Esc で引き出しを閉じる', { s5, s6 });
		assert(jsErrors(errors).length === 0, 'T96(5): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T96結合画像の設定(6) 分類マーカー ON で②が因子周回でないときは③の下に今の注意の文（種類の枠を付けられない）・OFF なら出さない', async () => {
		const { ctx, page, errors } = await openSp();
		const r = await page.evaluate(() => {
			const a = tierMarksStatusText();
			setStitchPart('marker', true);
			const b = tierMarksStatusText();
			const shown = document.getElementById('tier-marks-status').textContent;
			setStitchPart('marker', false);
			return { a, b, shown, tier: Object.keys(deckTierByName).length };
		});
		assert(r.tier === 0 && r.a.tone === 'none' && r.b.tone === 'warn' && r.b.text === '②で因子周回を選ぶと、種類の枠を付けられるようになります。' && r.shown === r.b.text,
			'T96(6): 分類マーカー ON で②が因子周回でないときだけ今の注意の文を出す', r);
		assert(jsErrors(errors).length === 0, 'T96(6): コンソールエラー0', jsErrors(errors).slice(0, 3));
		await ctx.close();
	});

	await block('T96結合画像の設定(7) パネルの見た目: 375px と 1280px × ライトとダークで横にはみ出さない・パネルの文字のコントラスト 4.5 以上（③と引き出しの中）', async () => {
		const out = [];
		for (const w of [375, 1280]) for (const theme of ['light', 'dark']) {
			const { ctx, page, errors } = await openSp({ w, h: w < 600 ? 812 : 900, roster: R1S, ids: IDS, pre: { 'uma-tools-theme': theme, 'uma-special-stitch-parts': JSON.stringify({ marker: true, roster: true, factor: false, sp: true, table: false }) } });
			await page.evaluate(() => selectStepTab(2));
			await page.locator('#stitch-parts-panel').scrollIntoViewIfNeeded();
			const main = await page.evaluate(() => {
				const p = document.querySelector('#stitch-parts-panel .stitch-show').getBoundingClientRect();
				return { w: document.documentElement.scrollWidth, vw: window.innerWidth, l: p.left, r: p.right, theme: document.documentElement.getAttribute('data-theme') };
			});
			const c1 = await page.evaluate(scanTextContrastInPage, '#stitch-parts-panel');
			await page.evaluate(async () => {
				window.stitchOnePerson = async () => __person(1179, 2342);
				persons[0].files = [{ name: 'a.png' }];
				await runImageStitching({ keepClosed: false, quiet: true, withMarks: false });
			});
			await page.waitForTimeout(500);
			await page.click('#stitch-drawer-fab');
			await page.waitForTimeout(200);
			const pop = await page.evaluate(() => { const p = document.getElementById('stitch-drawer-pop').getBoundingClientRect(); return { l: p.left, r: p.right, vw: window.innerWidth }; });
			const c2 = await page.evaluate(scanTextContrastInPage, '#stitch-drawer-pop');
			out.push({ w, theme, main, pop, bad: c1.bad.concat(c2.bad), checked: c1.checked + c2.checked, errors: jsErrors(errors) });
			await ctx.close();
		}
		out.forEach((o) => {
			assert(o.main.theme === o.theme && o.main.w <= o.main.vw && o.main.l >= 0 && o.main.r <= o.main.vw && o.pop.l >= 0 && o.pop.r <= o.pop.vw, 'T96(7): ' + o.w + 'px・' + o.theme + ': 横にはみ出さない（③のパネル・引き出しのパネル）', { main: o.main, pop: o.pop });
			assert(o.checked >= 10 && o.bad.length === 0, 'T96(7): ' + o.w + 'px・' + o.theme + ': パネルの文字のコントラスト 4.5 以上（' + o.checked + '件）', formatContrast(o.bad));
			assert(o.errors.length === 0, 'T96(7): ' + o.w + 'px・' + o.theme + ': コンソールエラー0', o.errors.slice(0, 3));
		});
	});
}
