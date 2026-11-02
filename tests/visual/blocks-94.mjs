// オススメサポのタイルとピン止めの検索（T75・2026-11-02。C-266 の (4)(5)）の検査。
// run-smoke.mjs の末尾から register94() で呼ばれる（塊の見出しはすべて「T75タイルとピン止め」で始まる。`npm run test:visual -- --only=T75タイルとピン止め` で回せる）。
//
// 決め（C-266 の (4)(5) と T66 の報告への回答 6〜12）:
//  (4) オススメのカードと残りの枠に指定したカードのタイルは案2: SSR の札を左の種別アイコンの下へ（22px → 16px）・右の上の段に「＋X種」・右上に ×・下の段に小さい字で「対象Y種」。
//      Y＝カード名の小窓で「対象」の札が付くスキルの種数（金と、その下位の白で1種）。× の押せる範囲（44 × 44）と名前の押せる部分の高さは今より小さくしない。
//  (5) 「除外中」の行の左に、虫眼鏡とピンのアイコン・縦の線の区切り。除外が無いときは同じ位置にアイコンだけの行（28px・区切りなし）。
//      アイコンの読み上げ名・title と小窓の題は「ピン止めするスキルを探す」。押すと②の「テキストで検索」の部品の小窓（追加候補の欄と「追加（N種）」なし）。
//      候補は白と金。金は「金スキル」・②で追加済みは「追加済み」・ほかは今のピンの理由の文で選べない行。選べる行を押すとすぐピン止め（結果の先頭にピンの状態で出る）。
//      「除外中」の表記は、行に入らない幅のときだけ「除外中 X枚/Y種（距離）」（読み上げ名は今の全文）。
// 見た目の正は T71 のモック lab/outside-tile-mock.html（既定・?excl=none・?excl=long・?scene=search・?scene=pinned）。同じ状態の製品とモックの寸法（タイルの中の位置と大きさ・除外中の行）を比べる。
// 名前の押せる部分の高さ（36.2px）と × の押せる範囲（44 × 44）は、変更前（bc17568）の製品を測った値。
// 変更前の製品では、タイルに「対象Y種」もアイコンも無いので、この塊は NG になる（T75 の報告に結果）。
import { reloadReady } from './lib/page-ready.mjs';

export async function register94(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const IDS2 = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417'];
	const races = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/upcoming-races.json'), 'utf8')).races;
	// T66 のモックを写し取ったときの状態（T66 の報告の「作り方」・blocks-93 の R4）
	const CARDS1 = ['card-0565', 'card-0564', 'card-0310', 'card-0281', 'card-0402', 'card-0248'];
	const R4 = { umaId: 'uma-0272', cardIds: CARDS1, race: races.find((r) => r.id === 'race-0002'), outsideOptions: { count: 4, pinned: ['card-0300'] }, outsideCardExcluded: ['card-0559'] };
	const R4_EX_SKILLS = ['393', 'ex-0533'];
	const R4_NONE = Object.assign({}, R4, { outsideCardExcluded: [] });
	// 数の多い除外（モックの ?excl=long と同じ「カード3枚・スキル12種（距離指定なし）」。レースも距離の指定も無い編成）
	const RL = { umaId: 'uma-0272', cardIds: CARDS1, outsideCardExcluded: ['card-0559', 'card-0561', 'card-0540'] };
	// 変更前（bc17568）の製品の実測: 名前の押せる部分の高さ・× の押せる範囲
	const MAIN_H0 = 36.2, X0 = 44;
	const REASON = { taken: '本育成で取得', off: '本育成で不要', distance: '①の絞り込み不一致', style: '①の絞り込み不一致', surface: '①の絞り込み不一致', race: 'レース条件不一致', gold: '金スキル' };
	const OM = '[data-usd-el="outside-modal"] ';
	const PK = '.usd-modal[data-usd-picker-over] ';

	/** モックの写しのデータ（候補・ピン止めの例・Y）と、場面ごとの寸法（T66.measure と、除外中の行の位置） */
	let mock = null;
	const loadMock = async () => {
		if (mock) return mock;
		mock = { m: {} };
		for (const [excl, w] of [['auto', 375], ['auto', 1280], ['none', 375], ['none', 1280], ['long', 375], ['long', 1280]]) {
			const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
			const page = await ctx.newPage();
			await page.goto(base + '/lab/outside-tile-mock.html?shot=1' + (excl !== 'auto' ? '&excl=' + excl : ''));
			await page.waitForFunction(() => !!window.T66, null, { timeout: 15000 });
			await page.waitForTimeout(300);
			mock.m[excl + w] = await page.evaluate(() => {
				const m = window.T66.measure();
				const body = document.querySelector('#t66-stage [data-usd-el="outside-main"]');
				const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(), o = body.getBoundingClientRect(); return [+(b.x - o.x).toFixed(1), +(b.y - o.y).toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)]; };
				const tg = document.querySelector('#t66-stage [data-usd-el="outside-excl-toggle"]');
				m.rel = { head: box(document.querySelector('#t66-stage .usd-out-exhead')), icon: box(document.querySelector('#t66-stage [data-usd-el="t66-pinsearch"]')), sep: box(document.querySelector('#t66-stage [data-usd-el="t66-pinsep"]')), toggle: box(tg), list: box(document.querySelector('#t66-stage [data-usd-el="outside-list"]')) };
				return m;
			});
			if (!mock.data) mock.data = await page.evaluate(() => { const D = JSON.parse(document.getElementById('t66-data').textContent); return { cand: D.cand, pinId: D.pinId, tgt: D.tgt, pinTgt: D.pinTgt }; });
			await ctx.close();
		}
		return mock;
	};

	const openSp = async (roster, w, ex) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: 900 }, EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		await sp.page.evaluate(({ roster, ids }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster, ids: IDS2 });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 }).catch(() => {});
		await sp.page.waitForTimeout(500);
		if (ex && ex.length) await sp.page.evaluate(({ ex }) => { const O = UmaSkillDeckCore.outside; const key = O.recommendExcluded.keyOf(JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'))); ex.forEach((id) => O.recommendExcluded.set(key, id, true)); }, { ex });
		return sp;
	};
	const waitDone = (page) => page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
	const openOut = async (page) => {
		await page.click('#deck-template-panel [data-usd-el="outside-open"]');
		await waitDone(page);
		await page.waitForTimeout(300);
	};
	/** 製品のタイル（中の部品の位置と大きさはタイルの左上から）と、除外中の行（小窓の本文の左上から） */
	const readOut = (page) => page.evaluate(() => {
		const M = document.querySelector('[data-usd-el="outside-modal"]');
		const body = M.querySelector('[data-usd-el="outside-main"]');
		const box = (e, t) => { if (!e || e.getClientRects().length === 0) return null; const b = e.getBoundingClientRect(); const o = (t || body).getBoundingClientRect(); return [+(b.x - o.x).toFixed(1), +(b.y - o.y).toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)]; };
		const tiles = Array.from(M.querySelectorAll('[data-usd-el="outside-card"], [data-usd-el="outside-pinned"]')).map((t) => ({
			el: t.getAttribute('data-usd-el'), id: t.getAttribute('data-card-id'), h: +t.getBoundingClientRect().height.toFixed(1),
			main: box(t.querySelector('.usd-out-card-main'), t), rarity: box(t.querySelector('.usd-card-ico--rarity'), t), type: box(t.querySelector('.usd-card-ico--type'), t),
			rarityInLead: !!t.querySelector('.usd-out-card-lead > .usd-card-ico--rarity'), gain: box(t.querySelector('[data-usd-el="outside-card-gain"]'), t), x: box(t.querySelector('.usd-out-card-x'), t),
			y: box(t.querySelector('[data-usd-el="outside-card-target"]'), t), gainText: (t.querySelector('[data-usd-el="outside-card-gain"]') || {}).textContent || null, yText: (t.querySelector('[data-usd-el="outside-card-target"]') || {}).textContent || null }));
		const tg = M.querySelector('[data-usd-el="outside-excl-toggle"]');
		const ic = M.querySelector('[data-usd-el="outside-pinsearch"]');
		const hit = ic ? getComputedStyle(ic, '::before') : null;
		return { tiles, excl: { head: box(M.querySelector('.usd-out-exhead')), icon: box(ic), sep: box(M.querySelector('[data-usd-el="outside-pinsep"]')), toggle: box(tg), list: box(M.querySelector('[data-usd-el="outside-list"]')),
			text: tg ? tg.textContent : null, label: tg ? tg.getAttribute('aria-label') : null, short: !!(tg && tg.getAttribute('data-usd-short-on')),
			iconLabel: ic ? ic.getAttribute('aria-label') : null, iconTitle: ic ? ic.getAttribute('title') : null, iconHit: hit ? [hit.width, hit.height] : null,
			pinrow: !!M.querySelector('[data-usd-el="outside-pinrow"]'), exclRow: !!M.querySelector('[data-usd-el="outside-excl"]'), restore: !!M.querySelector('[data-usd-el="outside-restore-all"]') },
			scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
	});
	const near = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 0.6);
	/** カード名の小窓の「対象」の札が付く行の種数（金と、その下位の白〔data-usd-gold-white-of〕は1種） */
	const targetKindsInInfo = async (page, cardId) => {
		await page.click(OM + '[data-usd-el="outside-card-main"][data-card-id="' + cardId + '"]');
		await page.waitForSelector('[data-usd-el="ev-skills"]', { state: 'attached', timeout: 8000 });
		await page.waitForTimeout(400);
		const r = await page.evaluate(() => {
			const rows = Array.from(document.querySelectorAll('[data-usd-el="ev-skills"] > li')).filter((li) => Array.from(li.querySelectorAll('.usd-roster-autotag, .usd-ev-tag')).some((t) => t.textContent.trim() === '対象'));
			const ids = new Set(rows.map((li) => li.getAttribute('data-skill-id')));
			return { rows: rows.length, kinds: rows.filter((li) => { const g = li.getAttribute('data-usd-gold-white-of'); return !(g && ids.has(g)); }).length };
		});
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);
		return r;
	};

	await block('T75タイルとピン止め(4) オススメサポのタイル（案2）: SSR の札は種別アイコンの下（16px）・右上に「＋X種」と ×・下の段に「対象Y種」= モックの寸法・× は 44×44・名前の押せる高さは今と同じ・Y は「対象」の札の種数（375px・1280px）', async () => {
		const M = await loadMock();
		for (const w of [375, 1280]) {
			const sp = await openSp(R4, w, R4_EX_SKILLS);
			await openOut(sp.page);
			const o = await readOut(sp.page);
			const mt = M.m['auto' + w].tiles;
			assert(o.tiles.length === 5 && o.tiles.map((t) => t.id).join(',') === mt.filter((t) => t.y).map((t) => t.id).join(','), 'T75(4) ' + w + 'px: 前提: タイルの顔ぶれと並びがモックと同じ', { got: o.tiles.map((t) => t.id), mock: mt.map((t) => t.id) });
			const bad = [];
			o.tiles.forEach((t) => {
				const m = mt.find((x) => x.id === t.id);
				if (!m) { bad.push({ id: t.id, mock: null }); return; }
				for (const k of ['main', 'rarity', 'gain', 'x', 'y']) if (!near(t[k], m[k])) bad.push({ id: t.id, k, got: t[k], mock: m[k] });
				if (Math.abs(t.h - m.h) > 0.2) bad.push({ id: t.id, k: 'h', got: t.h, mock: m.h });
			});
			assert(bad.length === 0, 'T75(4) ' + w + 'px: タイルの中の SSR の札・＋X種・×・対象Y種・名前の位置と大きさがモック（案2）と同じ', bad.slice(0, 6));
			assert(o.tiles.every((t) => t.rarityInLead && t.rarity && t.rarity[2] === 16 && t.rarity[3] === 16 && t.type && t.rarity[1] >= t.type[1] + t.type[3] - 0.5 && Math.abs((t.rarity[0] + 8) - (t.type[0] + 10)) <= 0.6),
				'T75(4) ' + w + 'px: SSR の札は左の種別アイコンの下（16 × 16・中心をそろえる）', o.tiles.map((t) => ({ id: t.id, r: t.rarity, type: t.type })));
			assert(o.tiles.every((t) => t.gain && t.x && t.y && t.gain[1] < t.y[1] && t.gain[0] + t.gain[2] <= t.x[0] + t.x[2] && t.x[1] <= t.gain[1] && t.y[1] + t.y[3] <= t.h + 0.5),
				'T75(4) ' + w + 'px: 「＋X種」は右の上の段（× の左）・「対象Y種」は下の段', o.tiles.map((t) => ({ id: t.id, g: t.gain, x: t.x, y: t.y })));
			assert(o.tiles.every((t) => t.x[2] >= X0 && t.x[3] >= X0 && t.main[3] >= MAIN_H0 - 0.05), 'T75(4) ' + w + 'px: × の押せる範囲は 44 × 44 以上・名前の押せる部分の高さは今（' + MAIN_H0 + 'px）以上', o.tiles.map((t) => ({ id: t.id, x: t.x, main: t.main })));
			assert(o.tiles.every((t) => /^対象\d+種$/.test(t.yText) && M.data.tgt[t.id] && t.yText === '対象' + M.data.tgt[t.id].y + '種' && t.gainText === '＋' + M.data.tgt[t.id].gain + '種'),
				'T75(4) ' + w + 'px: 「＋X種」「対象Y種」の値がモック（同じ状態で計算した値）と同じ', o.tiles.map((t) => [t.id, t.gainText, t.yText]));
			// Y は、カード名の小窓で「対象」の札が付くスキルの種数
			const ys = [];
			for (const t of o.tiles) { const k = await targetKindsInInfo(sp.page, t.id); ys.push({ id: t.id, y: t.yText, kinds: k.kinds, rows: k.rows }); }
			assert(ys.every((x) => x.y === '対象' + x.kinds + '種') && ys.some((x) => x.rows > x.kinds), 'T75(4) ' + w + 'px: Y＝カード名の小窓で「対象」の札が付くスキルの種数（金と下位の白で1種。札の付く行の数より少ないカードがある）', ys);
			assert(!o.scrollX, 'T75(4) ' + w + 'px: 横スクロールなし');
			assert(jsErrors(sp.errors).length === 0, 'T75(4) ' + w + 'px: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T75タイルとピン止め(5a) 除外中の行の左のアイコン・区切り・除外が無いときのアイコンだけの行（28px）・短い表記は入らない幅でだけ = モック（375px・1280px）', async () => {
		const M = await loadMock();
		for (const w of [375, 1280]) {
			// 既定（カード1枚・スキル2種〔長距離〕）: 今の表記のまま・アイコン → 区切り → 除外中…
			const sp = await openSp(R4, w, R4_EX_SKILLS);
			await openOut(sp.page);
			const a = await readOut(sp.page);
			const ma = M.m['auto' + w].rel;
			assert(near(a.excl.head, ma.head) && near(a.excl.icon, ma.icon) && near(a.excl.sep, ma.sep) && near(a.excl.toggle, ma.toggle), 'T75(5a) ' + w + 'px: アイコン・区切り・「除外中…」の位置と大きさがモックと同じ', { got: a.excl, mock: ma });
			assert(a.excl.iconLabel === 'ピン止めするスキルを探す' && a.excl.iconTitle === 'ピン止めするスキルを探す' && a.excl.iconHit && a.excl.iconHit[0] === '44px' && a.excl.iconHit[1] === '44px', 'T75(5a) ' + w + 'px: アイコンの読み上げ名・title は「ピン止めするスキルを探す」・押せる範囲 44 × 44', a.excl);
			assert(a.excl.text === '除外中 カード1枚・スキル2種（長距離） ▾' && !a.excl.short && a.excl.label === null, 'T75(5a) ' + w + 'px: 入る幅では今の表記のまま（読み上げ名も今のまま）', a.excl);
			assert(jsErrors(sp.errors).length === 0, 'T75(5a) ' + w + 'px: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
			// 除外が1件も無い: 同じ位置にアイコンだけの行（28px・区切り・文・すべて戻す なし）
			const sp2 = await openSp(R4_NONE, w);
			await openOut(sp2.page);
			const n = await readOut(sp2.page);
			const mn = M.m['none' + w].rel;
			assert(n.excl.pinrow && !n.excl.exclRow && !n.excl.sep && !n.excl.toggle && !n.excl.restore && n.excl.head && n.excl.head[3] === 28 && near(n.excl.head, mn.head) && near(n.excl.icon, mn.icon) && near(n.excl.list, mn.list),
				'T75(5a) ' + w + 'px: 除外が無いときは、同じ位置にアイコンだけの行（高さ 28px・区切りなし。下の一覧の位置もモックと同じ）', { got: n.excl, mock: mn });
			assert(!n.scrollX && jsErrors(sp2.errors).length === 0, 'T75(5a) ' + w + 'px: 除外なしで横スクロールなし・コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
			await sp2.ctx.close();
			// 数の多い除外（カード3枚・スキル12種〔距離指定なし〕）: 375px だけ短い表記
			const ex12 = M.data.cand.filter((c) => !c[2] && IDS2.indexOf(c[0]) === -1).slice(0, 12).map((c) => c[0]);
			const sp3 = await openSp(RL, w, ex12);
			await openOut(sp3.page);
			const l = await readOut(sp3.page);
			const full = '除外中 カード3枚・スキル12種（距離指定なし）';
			if (w === 375) assert(l.excl.short && l.excl.text === '除外中 3枚/12種（距離指定なし） ▾' && l.excl.label === full, 'T75(5a) 375px: 入らない幅では「除外中 3枚/12種（距離指定なし）」（読み上げ名は今の全文）', l.excl);
			else assert(!l.excl.short && l.excl.text === full + ' ▾' && l.excl.label === null, 'T75(5a) 1280px: 入る幅では今の表記のまま', l.excl);
			const ml = M.m['long' + w].rel;
			assert(near(l.excl.toggle, ml.toggle) && l.excl.toggle[3] === 28, 'T75(5a) ' + w + 'px: 数の多い除外の「除外中…」の幅と高さ（1行）がモック（?excl=long）と同じ', { got: l.excl.toggle, mock: ml.toggle });
			assert(!l.scrollX && jsErrors(sp3.errors).length === 0, 'T75(5a) ' + w + 'px: 数の多い除外で横スクロールなし・コンソールのエラー0', jsErrors(sp3.errors).slice(0, 3));
			await sp3.ctx.close();
		}
	});

	await block('T75タイルとピン止め(5b) ピン止めの検索の小窓: 題・追加候補の欄と「追加」なし・金は「金スキル」・選べない行は今のピンの理由・押すとすぐピン止めして結果の先頭にピンの状態・Esc は小窓だけ閉じる（375px・1280px）', async () => {
		const M = await loadMock();
		const candBy = new Map(M.data.cand.map((c) => [c[0], c]));
		// 理由の種類ごとに1つずつ、その名前で探す（名前は検査に書かない。モックの候補から引く）
		const picks = ['gold', 'race', 'taken', 'distance', 'surface', ''].map((why) => M.data.cand.find((c) => c[2] === why && IDS2.indexOf(c[0]) === -1 && c[1].length >= 3));
		const added = M.data.cand.find((c) => IDS2.indexOf(c[0]) !== -1);
		const pinName = candBy.get(M.data.pinId)[1];
		for (const w of [375, 1280]) {
			const sp = await openSp(R4, w, R4_EX_SKILLS);
			await openOut(sp.page);
			await sp.page.click(OM + '[data-usd-el="outside-pinsearch"]');
			await sp.page.waitForSelector(PK + '[data-usd-el="search-input"]', { state: 'visible', timeout: 5000 });
			const shell = await sp.page.evaluate(() => {
				const pk = document.querySelector('.usd-modal[data-usd-picker-over]');
				const vis = (e) => !!e && e.getClientRects().length > 0;
				const om = document.querySelector('[data-usd-el="outside-modal"]');
				return { title: pk.querySelector('[data-usd-el="picker-title"]').textContent, tray: vis(pk.querySelector('[data-usd-el="search-tray"]')), foot: vis(pk.querySelector('[data-usd-el="picker-footer"]')),
					z: [getComputedStyle(pk).zIndex, getComputedStyle(om).zIndex], expanded: om.querySelector('[data-usd-el="outside-pinsearch"]').getAttribute('aria-expanded'), outsideOpen: !om.hidden };
			});
			assert(shell.title === 'ピン止めするスキルを探す' && !shell.tray && !shell.foot && Number(shell.z[0]) > Number(shell.z[1]) && shell.expanded === 'true' && shell.outsideOpen,
				'T75(5b) ' + w + 'px: 小窓の題は「ピン止めするスキルを探す」・追加候補の欄と「追加（N種）」の帯は出ない・オススメサポの上に重なる', shell);
			// 候補の行: 選べる＝＋の輪／選べない＝理由（金スキル・追加済み・今のピンの理由の文）
			const rowsFor = async (q) => {
				await sp.page.fill(PK + '[data-usd-el="search-input"]', q);
				await sp.page.waitForTimeout(250);
				return sp.page.evaluate(() => Array.from(document.querySelectorAll('.usd-modal[data-usd-picker-over] [data-usd-el="search-results"] .usd-tsearch-row')).map((r) => ({
					id: r.getAttribute('data-skill-id'), pick: r.getAttribute('data-usd-act') === 'search-pick', dis: r.getAttribute('aria-disabled') === 'true', side: (r.querySelector('.usd-tsearch-side') || {}).textContent || '' })));
			};
			const wrong = [];
			for (const c of picks.concat([added])) {
				const rows = await rowsFor(c[1]);
				if (!rows.some((r) => r.id === c[0])) wrong.push({ q: c[1], missing: c[0] });
				rows.forEach((r) => {
					const m = candBy.get(r.id);
					const want = IDS2.indexOf(r.id) !== -1 ? '追加済み' : m ? (REASON[m[2]] || '') : undefined;
					if (want === undefined || r.side !== want || r.pick === !!want || r.dis !== !!want) wrong.push({ q: c[1], id: r.id, got: r.side, pick: r.pick, want });
				});
			}
			assert(picks.every(Boolean) && wrong.length === 0, 'T75(5b) ' + w + 'px: 候補の行の選べる・選べないと理由（金スキル・追加済み・本育成で取得・①の絞り込み不一致・レース条件不一致）がモックと同じ', wrong.slice(0, 6));
			// Esc は検索の小窓だけ閉じる（オススメサポは開いたまま・フォーカスはアイコンへ）
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(300);
			const esc = await sp.page.evaluate(() => ({ pk: !document.querySelector('.usd-modal[data-usd-picker-over]') || document.querySelector('.usd-modal[data-usd-picker-over]').hidden, out: !document.querySelector('[data-usd-el="outside-modal"]').hidden,
				focus: document.activeElement && document.activeElement.getAttribute('data-usd-el'), expanded: document.querySelector('[data-usd-el="outside-pinsearch"]').getAttribute('aria-expanded') }));
			assert(esc.pk && esc.out && esc.focus === 'outside-pinsearch' && esc.expanded === 'false', 'T75(5b) ' + w + 'px: Esc で検索の小窓だけ閉じる（オススメサポは開いたまま・フォーカスはアイコンへ）', esc);
			// 選べる行を押すと、すぐピン止め（小窓は閉じる）→ 計算し直して、結果の一覧の先頭にピンの状態で出る（今のピンと同じ扱い。保存される）
			await sp.page.click(OM + '[data-usd-el="outside-pinsearch"]');
			const rows = await rowsFor(pinName);
			assert(rows.some((r) => r.id === M.data.pinId && r.pick), 'T75(5b) ' + w + 'px: 前提: ピン止めの例（モックの結果の例）が選べる行で出る', rows.slice(0, 5));
			await sp.page.click(PK + '.usd-tsearch-row[data-skill-id="' + M.data.pinId + '"]');
			await sp.page.waitForTimeout(200);
			await waitDone(sp.page);
			await sp.page.waitForTimeout(300);
			const after = await sp.page.evaluate((id) => {
				const pk = document.querySelector('.usd-modal[data-usd-picker-over]');
				const first = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]');
				const pin = first ? first.querySelector('[data-usd-el="outside-pin"]') : null;
				const r = JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special'));
				return { pkClosed: !pk || pk.hidden, first: first && first.getAttribute('data-skill-id'), pinned: first && first.getAttribute('data-usd-pinned'), pressed: pin && pin.getAttribute('aria-pressed'),
					saved: (r.outsideOptions && r.outsideOptions.skillPins) || [], focus: document.activeElement && document.activeElement.getAttribute('data-skill-id') };
			}, M.data.pinId);
			assert(after.pkClosed && after.first === M.data.pinId && after.pinned === '1' && after.pressed === 'true' && after.saved.join(',') === M.data.pinId && after.focus === M.data.pinId,
				'T75(5b) ' + w + 'px: 押すと小窓が閉じてピン止め（保存）・結果の一覧の先頭にピンの状態で出る・フォーカスはその行のピン', after);
			const o = await readOut(sp.page);
			const tg = M.data.pinTgt;
			assert(o.tiles.length === Object.keys(tg).length && o.tiles.every((t) => tg[t.id] && t.gainText === '＋' + tg[t.id].gain + '種' && t.yText === '対象' + tg[t.id].y + '種'),
				'T75(5b) ' + w + 'px: ピン止めした後のタイルの顔ぶれと「＋X種」「対象Y種」がモック（?scene=pinned）と同じ（X と Y が違うカードがある）', o.tiles.map((t) => [t.id, t.gainText, t.yText]));
			assert(Object.keys(tg).some((id) => tg[id].gain !== tg[id].y), 'T75(5b) 前提: モックのピン止めした後の例に X と Y が違うカードがある', tg);
			assert(!o.scrollX && jsErrors(sp.errors).length === 0, 'T75(5b) ' + w + 'px: 横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});
}
