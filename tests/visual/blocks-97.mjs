// オススメサポの「除外中」の行の部品と短い表記・見出しの？の小窓の2項目・②の「サポートカードを選ぶ」の小窓に R を出さない（T80・2026-11-02。C-270）の検査。
// run-smoke.mjs の末尾から register97() で呼ばれる（塊の見出しはすべて「T80除外中と説明とR」で始まる。`npm run test:visual -- --only=T80除外中と説明とR` で回せる）。
//
// 決め（C-270・2026-11-02 おいもさん）:
//  (1) カードの下の行: 虫眼鏡＋ピンのアイコンは丸い枠で囲む。「除外中」は上の「カード」の行のボタン（「種類 5▾」など）と同じ部品の楕円の枠（新しい部品は足さない）。
//      アイコンと「除外中」の間の縦の線は消す。「除外中」の隣の？は無くす。表記は PC でもスマホでもいつも短い形「除外中：X枚・Y種（距離）▾」（開いているときは ▴）。
//      カードの除外が0件なら枚数を書かない（「除外中：41種（長距離）▾」）。スキルの除外が0件なら種数と距離を書かない（「除外中：1枚▾」）。除外が無いときのアイコンだけの行も丸い枠。「すべて戻す」は今のまま。
//  (2) 見出しの？の小窓は [オススメロジック]・[除外中] の2項目をいつも両方出す（文はおいもさんの文を一字一句）。
//  (3) ②でカードを選ぶ・候補に出す場所（オススメサポの残りの枠「サポカを選ぶ」・②のパネルの枠）から R を出さない。①の小窓（SSR だけ）は変えない。
//      保存済みのセットの残りの枠に R が入っていれば、開いただけでは書き換えず、そのまま表示する。
// 「同じ部品」は、computed style（高さ・枠の線・角・地・文字）を「種類 ▾」のボタンと比べて確かめる。カード名・スキル名は検査の側に書かない（恒久ルール1。id だけ）。
// 変更前の製品（2596f01）では、縦の線と？があり表記が「除外中 カード1枚・スキル2種（長距離） ▾」で、②の小窓に R が出るので、この塊は NG になる（T80 の報告に結果）。
import { reloadReady } from './lib/page-ready.mjs';

export async function register97(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const IDS2 = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417'];
	const races = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/upcoming-races.json'), 'utf8')).races;
	const CARDS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8')).entries;
	const UMAS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/training-umamusume.json'), 'utf8')).entries;
	const byId = new Map(CARDS.map((c) => [c.id, c]));
	const labelOf = (c) => (c.title ? '[' + c.title + ']' : '') + (c.isGroup && c.groupName ? c.groupName : c.charaName);
	// blocks-94 と同じ状態（T66 のモックを写し取ったときの状態）: ①に uma-0272 とカード6枚・京都 3000m（長距離）・4枚＋残りの枠に card-0300・card-0559 を除外・長距離の除外2種
	const CARDS1 = ['card-0565', 'card-0564', 'card-0310', 'card-0281', 'card-0402', 'card-0248'];
	const R4 = { umaId: 'uma-0272', cardIds: CARDS1, race: races.find((r) => r.id === 'race-0002'), outsideOptions: { count: 4, pinned: ['card-0300'] }, outsideCardExcluded: ['card-0559'] };
	const EX2 = ['393', 'ex-0533'];
	const R4_NONE = Object.assign({}, R4, { outsideCardExcluded: [] });
	// 数の多い除外（カード3枚・スキル12種・距離指定なし。レースも距離の指定も無い編成）
	const RL = { umaId: 'uma-0272', cardIds: CARDS1, outsideCardExcluded: ['card-0559', 'card-0561', 'card-0540'] };
	// 残りの枠に入れる R（グループでなく、①の6枚とも育成ウマ娘とも別のキャラクター。id はデータから選ぶ）
	const usedCharas = new Set(CARDS1.map((id) => byId.get(id).charaName).concat([(UMAS.find((u) => u.id === 'uma-0272') || {}).charaName]));
	const R_CARD = CARDS.find((c) => c.rarity === 'R' && !c.isGroup && !usedCharas.has(c.charaName));
	// 候補に出る SR（R と同じ条件で選ぶ。一覧は新しい順に60件までなので、名前で探して出ることを見る）
	const SR_CARD = CARDS.find((c) => c.rarity === 'SR' && !c.isGroup && !usedCharas.has(c.charaName));
	const HELP = '[オススメロジック]条件に応じた本育成のサポカで得られないスキルを、できるだけ多く得られる組み合わせを自動計算します。ランダムイベントのスキルやリストに追加済みのスキルも数えます。金スキルは、因子化率の向上を加味して金スキル+白スキルで2個分として数えてオススメしていますが、表示上は金スキル+白スキルを1種類として数えています。'
		+ '[除外中]ここで除外したスキルは、距離区分（短距離/マイル/中距離/長距離/距離指定なし）ごとに保存され、レース条件が変わっても適用されます。例：京都3000mで除外したスキルは、中山2500mのオススメサポの計算においても除外される。';
	const OM = '[data-usd-el="outside-modal"] ';
	const MH = '[data-usd-el="roster-modal-host"] ';
	const T = '#deck-template-panel ';

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
	const STYLE_KEYS = ['height', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius', 'borderBottomRightRadius', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'lineHeight', 'paddingLeft', 'paddingRight'];
	/** 除外中の行（小窓の本文の左上から）と、「種類 ▾」のボタンとの computed style の比べ */
	const readRow = (page) => page.evaluate((KEYS) => {
		const M = document.querySelector('[data-usd-el="outside-modal"]');
		const body = M.querySelector('[data-usd-el="outside-main"]');
		const box = (e) => { if (!e || e.getClientRects().length === 0) return null; const b = e.getBoundingClientRect(); const o = body.getBoundingClientRect(); return [+(b.x - o.x).toFixed(1), +(b.y - o.y).toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)]; };
		const st = (e) => { if (!e) return null; const cs = getComputedStyle(e); const o = {}; KEYS.forEach((k) => { o[k] = cs[k]; }); return o; };
		const tg = M.querySelector('[data-usd-el="outside-excl-toggle"]');
		const lb = M.querySelector('[data-usd-el="outside-excl-label"]');
		const ic = M.querySelector('[data-usd-el="outside-pinsearch"]');
		const ty = M.querySelector('[data-usd-el="outside-types-btn"]');
		const ra = M.querySelector('[data-usd-el="outside-restore-all"]');
		const hit = ic ? getComputedStyle(ic, '::before') : null;
		const ics = ic ? getComputedStyle(ic) : null;
		return {
			head: box(M.querySelector('.usd-out-exhead')), icon: box(ic), toggle: box(tg), restore: box(ra), list: box(M.querySelector('[data-usd-el="outside-list"]')),
			text: tg ? tg.textContent : null, label: tg ? tg.getAttribute('aria-label') : null, expanded: tg ? tg.getAttribute('aria-expanded') : null,
			cls: tg ? tg.className : null, labelCut: lb ? lb.scrollWidth > lb.clientWidth + 1 : null, caretHidden: tg ? (tg.querySelector('.usd-out-optcaret') || {}).getAttribute('aria-hidden') : null,
			tgStyle: st(tg), tyStyle: st(ty),
			iconLabel: ic ? ic.getAttribute('aria-label') : null, iconTitle: ic ? ic.getAttribute('title') : null, iconHit: hit ? [hit.width, hit.height] : null,
			iconStyle: ics ? { bw: ics.borderTopWidth, bs: ics.borderTopStyle, bc: ics.borderTopColor, radius: ics.borderTopLeftRadius, bg: ics.backgroundColor } : null,
			iconSvg: box(ic ? ic.querySelector('svg') : null),
			sep: !!M.querySelector('[data-usd-el="outside-pinsep"], .usd-out-pinsep'), help: !!M.querySelector('[data-usd-el="outside-excl-help"]'),
			pinrow: !!M.querySelector('[data-usd-el="outside-pinrow"]'), exclRow: !!M.querySelector('[data-usd-el="outside-excl"]'), listOpen: !!M.querySelector('[data-usd-el="outside-excl-list"]'),
			scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
	}, STYLE_KEYS);
	const sameStyle = (a, b) => !!a && !!b && STYLE_KEYS.every((k) => a[k] === b[k]);
	const sameRow = (a, b) => !!a && !!b && Math.abs((a[1] + a[3] / 2) - (b[1] + b[3] / 2)) <= 1;
	const roundFrame = (r) => !!r.icon && !!r.iconStyle && r.icon[2] === 28 && r.icon[3] === 28 && r.iconStyle.bw === '1px' && r.iconStyle.bs === 'solid' && parseFloat(r.iconStyle.radius) >= 14
		&& !!r.iconSvg && r.iconSvg[2] === 20 && r.iconSvg[3] === 20 && r.iconHit && r.iconHit[0] === '44px' && r.iconHit[1] === '44px';

	await block('T80除外中と説明とR(1) 除外中の行: 「除外中：X枚・Y種（距離）▾」はいつも短い形（375px・1280px）・「種類 ▾」と同じ部品（computed style が同じ）・アイコンは丸い枠（28px・線1px・絵20px・押せる範囲44）・縦の線と？なし・枚だけ／種だけ／除外なし／数の多い除外・すべて戻すは同じ行', async () => {
		for (const w of [375, 1280]) {
			const tag = 'T80(1) ' + w + 'px: ';
			// A: カード1枚・スキル2種（長距離）
			const sp = await openSp(R4, w, EX2);
			await openOut(sp.page);
			const a = await readRow(sp.page);
			assert(a.exclRow && !a.pinrow && a.text === '除外中：1枚・2種（長距離）▾' && a.expanded === 'false' && a.caretHidden === 'true', tag + '表記は「除外中：1枚・2種（長距離）▾」（▾は読み上げない）', a);
			assert(a.label === '除外中：カード1枚・スキル2種（長距離）', tag + '読み上げ名は語を補った「除外中：カード1枚・スキル2種（長距離）」', a.label);
			assert(!a.sep && !a.help, tag + 'アイコンと「除外中」の間の縦の線と、隣の？は無い', { sep: a.sep, help: a.help });
			assert(/\busd-out-segbtn\b/.test(a.cls) && /\busd-out-optbtn\b/.test(a.cls) && sameStyle(a.tgStyle, a.tyStyle) && a.toggle && a.toggle[3] === 28,
				tag + '「除外中」は「種類 ▾」のボタンと同じ部品（同じクラス・高さ 28px・枠の線・角・地・文字の computed style が同じ）', { cls: a.cls, tg: a.tgStyle, ty: a.tyStyle });
			assert(roundFrame(a) && a.iconStyle.bc === a.tgStyle.borderTopColor && a.iconStyle.bg === a.tgStyle.backgroundColor, tag + 'アイコンは丸い枠（28 × 28・線 1px・角は半分以上・絵 20px・押せる範囲 44 × 44）。線と地の色はピルと同じ', { icon: a.icon, st: a.iconStyle, svg: a.iconSvg, hit: a.iconHit });
			assert(a.iconLabel === 'ピン止めするスキルを探す' && a.iconTitle === 'ピン止めするスキルを探す', tag + 'アイコンの読み上げ名・title は今のまま', { l: a.iconLabel, t: a.iconTitle });
			assert(a.head && a.head[3] === 28 && sameRow(a.icon, a.toggle) && sameRow(a.toggle, a.restore) && a.restore[0] > a.toggle[0] + a.toggle[2], tag + '行の高さ 28px・アイコン → 除外中 → 右端の「すべて戻す」が同じ行', { head: a.head, icon: a.icon, tg: a.toggle, ra: a.restore });
			assert(a.labelCut === false, tag + '文は「…」で切れていない', a.labelCut);
			await sp.page.click(OM + '[data-usd-el="outside-excl-toggle"]');
			await sp.page.waitForTimeout(300);
			const a2 = await readRow(sp.page);
			assert(a2.text === '除外中：1枚・2種（長距離）▴' && a2.expanded === 'true' && a2.listOpen && a2.label === a.label, tag + '押すと一覧が開き「▴」（読み上げ名は変わらない）', a2);
			await sp.page.click(OM + '[data-usd-el="outside-excl-toggle"]');
			await sp.page.waitForTimeout(300);
			const a3 = await readRow(sp.page);
			assert(a3.text === '除外中：1枚・2種（長距離）▾' && a3.expanded === 'false' && !a3.listOpen, tag + 'もう一度押すと閉じて「▾」', a3);
			assert(!a.scrollX && jsErrors(sp.errors).length === 0, tag + '横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
			// B: カードだけ（枚数だけ）
			const spB = await openSp(R4, w);
			await openOut(spB.page);
			const b = await readRow(spB.page);
			assert(b.exclRow && b.text === '除外中：1枚▾' && b.label === '除外中：カード1枚' && !b.help, tag + 'スキルの除外が0件なら「除外中：1枚▾」（種数と距離を書かない・？なし）', b);
			await spB.ctx.close();
			// C: スキルだけ（種数と距離だけ）
			const spC = await openSp(R4_NONE, w, EX2);
			await openOut(spC.page);
			const c = await readRow(spC.page);
			assert(c.exclRow && c.text === '除外中：2種（長距離）▾' && c.label === '除外中：スキル2種（長距離）' && !c.help && !c.sep, tag + 'カードの除外が0件なら「除外中：2種（長距離）▾」（枚数を書かない）', c);
			await spC.ctx.close();
			// D: 除外なし（アイコンだけの行。丸い枠）
			const spD = await openSp(R4_NONE, w);
			await openOut(spD.page);
			const d = await readRow(spD.page);
			assert(d.pinrow && !d.exclRow && !d.toggle && !d.restore && !d.sep && d.head && d.head[3] === 28 && roundFrame(d) && d.icon[0] === a.icon[0] && d.icon[1] === a.icon[1],
				tag + '除外が無いときは同じ位置にアイコンだけの行（28px）。アイコンは同じ丸い枠', { head: d.head, icon: d.icon, st: d.iconStyle });
			assert(!d.scrollX && jsErrors(spD.errors).length === 0, tag + '除外なしで横スクロールなし・コンソールのエラー0', jsErrors(spD.errors).slice(0, 3));
			await spD.ctx.close();
			// E: 数の多い除外（カード3枚・スキル12種・距離指定なし）。375px でも1行・「…」で切れない・すべて戻すは同じ行
			const ex12 = await (async () => {
				const t = await openSp(RL, w);
				await openOut(t.page);
				const ids = await t.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-row"]:not([data-usd-excluded])')).map((r) => r.getAttribute('data-skill-id')).slice(0, 12));
				await t.ctx.close();
				return ids;
			})();
			assert(ex12.length === 12, tag + '前提: 距離指定なしの一覧から12種を除外に回せる', ex12.length);
			const spE = await openSp(RL, w, ex12);
			await openOut(spE.page);
			const e = await readRow(spE.page);
			assert(e.text === '除外中：3枚・12種（距離指定なし）▾' && e.toggle && e.toggle[3] === 28 && e.labelCut === false && sameRow(e.toggle, e.restore) && e.restore[0] > e.toggle[0] + e.toggle[2] && !e.scrollX,
				tag + '数の多い除外でも「除外中：3枚・12種（距離指定なし）▾」が1行に入り（切れない）、「すべて戻す」と同じ行・横スクロールなし', e);
			assert(jsErrors(spE.errors).length === 0, tag + '数の多い除外でコンソールのエラー0', jsErrors(spE.errors).slice(0, 3));
			await spE.ctx.close();
		}
	});

	await block('T80除外中と説明とR(2) 見出しの？の小窓: [オススメロジック]・[除外中] の2項目をいつも両方出す（文は一字一句）・除外中の行の？とその小窓は無い（375px・1280px）', async () => {
		for (const w of [375, 1280]) {
			const tag = 'T80(2) ' + w + 'px: ';
			const sp = await openSp(R4, w, EX2);
			await openOut(sp.page);
			await sp.page.click(OM + '[data-usd-el="outside-help"]');
			await sp.page.waitForTimeout(300);
			const h = await sp.page.evaluate(() => {
				const box = document.querySelector('[data-usd-el="outside-help-text"]');
				const items = box ? Array.from(box.querySelectorAll('[data-usd-el="outside-help-item"]')) : [];
				const pop = document.querySelector('.usd-info-pop');
				return { text: box ? box.textContent : null, n: items.length, heads: items.map((p) => (p.querySelector('strong') || {}).textContent || null), ownLine: items.map((p) => !!p.querySelector('strong + br')),
					title: pop ? (pop.querySelector('.uma-popover-title') || {}).textContent : null, open: !!pop && !pop.hidden, gap: items.length === 2 ? +(items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().bottom).toFixed(1) : null,
					oldHelp: !!document.querySelector('[data-usd-el="outside-excl-help"], [data-usd-el="outside-excl-help-text"]'), over: pop ? pop.scrollWidth > pop.clientWidth + 1 : null };
			});
			assert(h.open && h.title === 'オススメサポ' && h.text === HELP, tag + '？を押すと、決められた2項目の文が一字一句そのまま出る', h.text);
			assert(h.n === 2 && h.heads.join('|') === '[オススメロジック]|[除外中]' && h.ownLine.every(Boolean) && h.gap !== null && h.gap >= 4, tag + '項目は2つ（見出しの行＋本文。項目の間に余白）', { n: h.n, heads: h.heads, ownLine: h.ownLine, gap: h.gap });
			assert(!h.oldHelp && h.over === false, tag + '除外中の行の？とその小窓は無い・小窓の中身がはみ出さない', { old: h.oldHelp, over: h.over });
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(300);
			const closed = await sp.page.evaluate(() => { const pop = document.querySelector('.usd-info-pop'); return !pop || pop.hidden; });
			assert(closed && jsErrors(sp.errors).length === 0, tag + 'Esc で閉じる・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('T80除外中と説明とR(3) ②の「サポートカードを選ぶ」の小窓（残りの枠・②のパネルの枠）: 候補は SSR と SR だけ（R は名前で探しても出ない）／保存済みの残りの枠の R は開いただけでは書き換えずそのまま表示（375px）', async () => {
		assert(!!R_CARD, 'T80(3) 前提: ①と育成ウマ娘と別のキャラクターの R（グループでない）がデータにある', !!R_CARD);
		const readHits = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="roster-modal-host"] [data-usd-el="hits"] .usd-name-hit')).map((h) => ({ label: (h.querySelector('.usd-name-hit-label') || {}).textContent || '', id: h.getAttribute('data-entry-id') || '' })));
		const checkHits = async (page, tag) => {
			await page.fill(MH + '[data-usd-el="find"]', '');
			await page.waitForTimeout(300);
			const hits = await readHits(page);
			const rar = hits.map((h) => { const c = h.id ? byId.get(h.id) : CARDS.find((x) => labelOf(x) === h.label); return c ? c.rarity : '?'; });
			assert(hits.length > 10 && rar.every((r) => r === 'SSR' || r === 'SR') && rar.indexOf('SSR') !== -1, tag + '候補は SSR と SR だけ（' + hits.length + '件。R は無い）', { n: hits.length, rar: rar.filter((r) => r !== 'SSR' && r !== 'SR') });
			await page.fill(MH + '[data-usd-el="find"]', labelOf(SR_CARD));
			await page.waitForTimeout(400);
			const sh = await readHits(page);
			assert(sh.some((h) => h.id === SR_CARD.id || h.label === labelOf(SR_CARD)), tag + 'SR のカードは名前で探すと出る（SR は今までどおり選べる）', sh.slice(0, 3));
			await page.fill(MH + '[data-usd-el="find"]', labelOf(R_CARD));
			await page.waitForTimeout(400);
			const rh = await readHits(page);
			assert(!rh.some((h) => h.label === labelOf(R_CARD) || h.id === R_CARD.id), tag + 'R のカードは名前で探しても出ない', rh.slice(0, 3));
			await page.keyboard.press('Escape');
			await page.waitForTimeout(300);
		};
		// 残りの枠から
		const sp = await openSp(R4, 375);
		await openOut(sp.page);
		await sp.page.click(OM + '[data-usd-el="outside-slot"]');
		await sp.page.waitForSelector(MH + '[data-usd-el="hits"] .usd-name-hit', { timeout: 10000 });
		await checkHits(sp.page, 'T80(3) 残りの枠: ');
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(300);
		// ②のパネルの枠から（空きの枠を押す）
		const pick = await sp.page.$(T + '[data-usd-el="factor-card-pick"]');
		assert(!!pick, 'T80(3) 前提: ②のパネルの枠がある', !!pick);
		await pick.click();
		await sp.page.waitForSelector(MH + '[data-usd-el="hits"] .usd-name-hit', { timeout: 10000 });
		await checkHits(sp.page, 'T80(3) ②のパネル: ');
		assert(jsErrors(sp.errors).length === 0, 'T80(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 保存済みの残りの枠に R: 開いただけでは書き換えない・タイルに出る
		const RR = Object.assign({}, R4, { outsideOptions: { count: 4, pinned: [R_CARD.id] } });
		const sp2 = await openSp(RR, 375);
		const before = await sp2.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		await openOut(sp2.page);
		const t = await sp2.page.evaluate((id) => { const e = document.querySelector('[data-usd-el="outside-modal"] [data-usd-el="outside-pinned"][data-card-id="' + id + '"]'); return e ? { text: e.textContent, slot: e.getAttribute('data-slot') } : null; }, R_CARD.id);
		const after = await sp2.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		assert(!!t && t.text.indexOf(R_CARD.charaName) !== -1, 'T80(3) 保存済みの残りの枠の R は、そのままタイルに出る（「解除」の枠）', t);
		assert(before === after && JSON.parse(after).outsideOptions.pinned.join() === R_CARD.id, 'T80(3) 開いただけでは保存データは1バイトも変わらない（pinned に R が残る）', { before: JSON.parse(before).outsideOptions, after: JSON.parse(after).outsideOptions });
		assert(jsErrors(sp2.errors).length === 0, 'T80(3) R の枠でコンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});
}
