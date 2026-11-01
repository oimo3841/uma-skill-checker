// ②因子周回の調和の後半（T53・2026-11-01。おいもさんの決定 2026-10-31・C-262 の (3)(4) と、2026-11-01 の回答〔グループのカード〕。モックは T45・T48 の lab/factor-mock.html）の検査。
// run-smoke.mjs の末尾から register84() で呼ばれる（塊の見出しはすべて「T53②因子周回の後半」で始まる。`npm run test:visual -- --only=T53②因子周回の後半` で回せる）。
//
// 決め:
//  (3) ②の合計の行と距離／脚質／バ場の行の間に、①と同じ様式のサポートカード6枚のパネル（育成ウマ娘の枠なし）。中身は同じセットの①の outsideOptions.cards（星取表の列と同じ並び・空きは列に出さない）。
//      720px 以上は①の育成ウマ娘の枠と同じ位置・大きさの空白の領域（何も描かない）。641〜719px と 375px は置かない。720px 以上で②が①より 4px 上なのはこのまま。
//      直接選んだカードは残りの枠の指定（outsideOptions.pinned）にまとめる。直接指定・× で②のスキルは変えない。オススメサポの「追加」の「元に戻す」でカードも戻す。使い直しでは直接指定を残す。
//      グループのカードは①と同じ扱い（直接選べる・指定のカードとしてスキルを数える。オススメサポの探索の候補には入れない）。
//      ①と同じカードは不可・同じキャラクターは可・育成ウマ娘と同じキャラクターは不可。保存の形は変えない。special の新UI だけ。
//  (4) オススメサポの枚数 1〜6・既定 5・指定のカードがあると「6 − 指定の枚数」まで。
// 寸法の目標はモック lab/factor-mock.html を同じ測り方で測った値（T53 の報告の「モックとの寸法の比べ」）。スキル名・カード名は検査の側に書かない（恒久ルール1。id だけ）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register84(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const R = '#deck-roster-panel ';
	const MH = '[data-usd-el="roster-modal-host"] ';
	const OM = '[data-usd-el="outside-modal"] ';
	// 代表1（T22・T24・T29・T52 と同じ）: ①＝uma-0179＋6枚、②＝24種。SAVED5 はオススメサポの提案のカード
	const CARD_IDS = ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const REP1 = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417', '125', '124', '6', '27', '33', '230', '16', '23', '147', '117', '118', '145'];
	const R1S = { umaId: 'uma-0179', cardIds: CARD_IDS, outsideOptions: { cards: SAVED5 } };
	// 選ぶカード（データから選んだ id。名前は書かない）
	const FREE1 = 'card-0252';      // ①にも②にも無いキャラクターの SSR
	const FREE2 = 'card-0253';      // 同上（別のキャラクター）
	const SAME_R1 = 'card-0315';    // ①の card-0565 と同じキャラクターの別のカード（選べる）
	const SAME_R2 = 'card-0409';    // ②の card-0257 と同じキャラクター（選べない）
	const GROUP_MEMBER = 'card-0193';   // ②のグループのカード card-0310 のメンバー（代表者ではない）と同じキャラクター（選べない）
	const UMA_CHARA = 'card-0329';  // 育成ウマ娘 uma-0179 と同じキャラクター（知らせ）
	const GROUP_FREE = 'card-0324'; // グループのカード（メンバーは②と重ならない。①とは重なる＝選べる）
	const cardsData = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/support-cards.json'), 'utf8')).entries;
	const titleOf = (id) => (cardsData.find((c) => c.id === id) || {}).title || '';
	// T67: パネルと星取表の列は、保存の順ではなく種別の順（typeOrder）→ID の降順に並ぶ（保存の順は変わらない）。期待の並びはデータから作る
	const typeOf = (id) => { const c = cardsData.find((x) => x.id === id); return c && typeof c.typeOrder === 'number' ? c.typeOrder : 99; };
	const sortedIds = (ids) => ids.slice().sort((a, b) => (typeOf(a) - typeOf(b)) || (a < b ? 1 : a > b ? -1 : 0));

	/** special.html を、①（下書きの編成）と②の下書きを入れて開く（blocks-83 と同じ作り）。tab: '0'＝①・'1'＝② */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 900 }, EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		await sp.page.evaluate(({ roster, ids, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', tab);
		}, { roster: o.roster || R1S, ids: o.ids || REP1, tab: o.tab || '1' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const setView = async (page, want) => {
		for (let i = 0; i < 3 && (await page.getAttribute(T + '[data-usd-el="factor-view"]', 'data-usd-view')) !== want; i++) { await page.click(T + '[data-usd-el="factor-view"]'); await page.waitForTimeout(300); }
	};
	const roster = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || '{}'));
	const scopeIds = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}').skillIds || []).join());
	const optsOf = async (page) => { const r = await roster(page); const o = r.outsideOptions || {}; return { cards: o.cards || [], pinned: o.pinned || [], count: o.count === undefined ? null : o.count, raw: o }; };
	/** ②のパネルのタイル */
	const tiles = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-card-tile"]')).map((t) => {
		const b = t.getBoundingClientRect();
		const main = t.querySelector('[data-usd-el="factor-card-pick"]');
		const name = t.querySelector('[data-usd-el="factor-card-name"]');
		return { id: t.getAttribute('data-card-id') || '', empty: t.classList.contains('usd-roster-tile--empty'), name: name ? name.textContent : '', aria: main ? main.getAttribute('aria-label') : '', x: b.x, y: b.y + scrollY, w: b.width, h: b.height,
			x2: !!t.querySelector('[data-usd-el="factor-card-clear"]') };
	}));
	/** ②の星取表のカードの列（列見出しのボタンの番号と読み上げ） */
	const tableCols = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-col-menu"][data-no]')).map((b) => ({ no: b.getAttribute('data-no'), label: b.getAttribute('aria-label') || '' })));
	/** 空きか名前の枠を押して、カード選択の小窓を開く */
	const openPick = async (page, index) => { await page.click(T + '[data-usd-el="factor-card-pick"][data-index="' + index + '"]'); await page.waitForSelector(MH + '[data-usd-el="modal"]', { timeout: 5000 }); await page.waitForTimeout(150); };
	/** 小窓で、カードの題で探す。hits は [{ id, button, note }] */
	const findIn = async (page, id) => {
		await page.fill(MH + '[data-usd-el="find"]', titleOf(id));
		await page.waitForTimeout(250);
		return page.evaluate((title) => Array.from(document.querySelectorAll('[data-usd-el="roster-modal-host"] [data-usd-el="hits"] .usd-name-hit')).filter((h) => h.textContent.indexOf(title) !== -1)
			.map((h) => ({ id: h.getAttribute('data-entry-id') || '', button: h.tagName === 'BUTTON', note: (h.querySelector('.usd-name-added') || {}).textContent || '' })), titleOf(id));
	};
	const take = async (page, id) => { await findIn(page, id); await page.click(MH + '[data-usd-act="take"][data-entry-id="' + id + '"]'); await page.waitForTimeout(400); };
	const modalOpen = (page) => page.evaluate(() => !!document.querySelector('[data-usd-el="roster-modal-host"] [data-usd-el="modal"]'));
	const activeOf = (page) => page.evaluate(() => { const a = document.activeElement; return a ? { el: a.getAttribute('data-usd-el'), index: a.getAttribute('data-index') } : null; });

	/* ---- (1) パネルの位置と大きさ（モックと同じ値）---- */
	// 目標（モック lab/factor-mock.html を同じ測り方で測った値。y はページの上端から）: panel ＝ ②のパネル、blank ＝ 空白の領域（無ければ null）、tileX／tileW／tileY ＝ 6枚の x・幅・y、filter ＝ 距離の行の y、grid ＝ 星取表の上端
	const MOCK = {
		375: { panel: [11, 171, 353, 98], blank: null, tileX: [12, 190.5], tileW: 172.5, tileH: 30, tileY: [172, 205, 238], filter: 277, grid2: 368, grid1: 364 },
		641: { panel: [33, 234, 575, 116], blank: null, tileX: [46, 231, 416], tileW: 179, tileH: 44, tileY: [245, 295], filter: 358, grid2: 448, grid1: 497 },
		719: { panel: [33, 234, 653, 116], blank: null, tileX: [46, 257, 468], tileW: 205, tileH: 44, tileY: [245, 295], filter: 358, grid2: 448, grid1: 497 },
		720: { panel: [33, 234, 654, 116], blank: [33, 234, 214, 116], tileX: [272, 408, 544], tileW: 130, tileH: 44, tileY: [245, 295], filter: 358, grid2: 448, grid1: 427 },
		1280: { panel: [177, 234, 926, 116], blank: [177, 234, 304.7, 116], tileX: [506.7, 703.1, 899.5], tileW: 190.5, tileH: 44, tileY: [245, 295], filter: 358, grid2: 448, grid1: 427 }
	};
	const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
	for (const w of [375, 641, 719, 720, 1280]) {
		await block('T53②因子周回の後半 (1) ' + w + 'px: カードのパネルの位置と大きさがモックと同じ・空白の領域は 720px 以上だけ・①のカードと同じ位置と大きさ（720px 以上）・横スクロールなし', async () => {
			const sp = await openSp({ w });
			await setView(sp.page, 'table');
			const m = await sp.page.evaluate(() => {
				const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width === 0 && b.height === 0 ? null : [b.x, b.y + scrollY, b.width, b.height]; };
				const body = document.querySelector('#deck-template-panel .usd-setbody .uma-section-body');
				const p = document.querySelector('#deck-template-panel [data-usd-el="factor-cards"]');
				return {
					order: Array.from(body.children).filter((c) => !c.hidden).map((c) => c.getAttribute('data-usd-el') || c.className),
					panel: box(p), blank: box(document.querySelector('#deck-template-panel [data-usd-el="factor-cards-blank"]')),
					filter: box(document.querySelector('#deck-template-panel [data-usd-el="factor-filter"]')),
					grid: box(document.querySelector('#deck-template-panel .usd-roster-grid')),
					scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
					group: p ? p.querySelector('[data-usd-el="factor-card-slots"]').getAttribute('aria-label') : '',
					style: Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-card-tile"]')).slice(0, 1).map((t) => ({ cls: t.className, name: getComputedStyle(t.querySelector('.usd-out-card-name')).fontSize,
						nick: (t.querySelector('.usd-out-card-nick') ? getComputedStyle(t.querySelector('.usd-out-card-nick')).fontSize : ''), border: getComputedStyle(t).borderTopWidth }))[0]
				};
			});
			const tl = await tiles(sp.page);
			const want = MOCK[w];
			const okPanel = m.panel && want.panel.every((v, i) => near(m.panel[i], v));
			const okBlank = want.blank ? (m.blank && want.blank.every((v, i) => near(m.blank[i], v))) : m.blank === null;
			const xs = Array.from(new Set(tl.map((t) => Math.round(t.x * 10) / 10)));
			const ys = Array.from(new Set(tl.map((t) => Math.round(t.y))));
			const okTiles = tl.length === 6 && xs.length === want.tileX.length && want.tileX.every((v, i) => near(xs[i], v)) && tl.every((t) => near(t.w, want.tileW, 0.6) && near(t.h, want.tileH)) && want.tileY.every((v, i) => near(ys[i], v));
			assert(m.order.join() === 'pt-need,factor-cards,factor-filter,skill-group' || m.order.join() === 'pt-need,roster-link,factor-cards,factor-filter,skill-group',
				'T53(1) ' + w + 'px: パネルは合計の行と距離／脚質／バ場の行の間', m.order);
			assert(okPanel && okBlank && okTiles && near(m.filter[1], want.filter) && near(m.grid[1], want.grid2),
				'T53(1) ' + w + 'px: パネル ' + want.panel.join('/') + '・空白の領域 ' + (want.blank ? want.blank.join('/') : 'なし') + '・カード6枚・距離の行の上端 ' + want.filter + '・星取表の上端 ' + want.grid2 + '（モックと同じ）',
				{ panel: m.panel, blank: m.blank, xs, ys, wh: tl.map((t) => [t.w, t.h]), filter: m.filter, grid: m.grid });
			assert(!m.scrollX && m.group === '②因子周回のサポートカード' && jsErrors(sp.errors).length === 0, 'T53(1) ' + w + 'px: 横スクロールなし・パネルの読み上げ名「②因子周回のサポートカード」・コンソールのエラー0', { scrollX: m.scrollX, group: m.group, errors: jsErrors(sp.errors).slice(0, 3) });
			// ①のタブ: 育成ウマ娘の枠・カード6枚・星取表の上端
			await sp.page.evaluate(() => selectStepTab(0));
			await sp.page.waitForTimeout(500);
			const r1 = await sp.page.evaluate(() => {
				const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y + scrollY, b.width, b.height]; };
				const Rp = document.querySelector('#deck-roster-panel');
				const t = Rp.querySelector('[data-usd-el="roster-tile"]');
				return { lower: box(Rp.querySelector('.usd-roster-lower')), uma: box(Rp.querySelector('.usd-roster-lower > .usd-roster-sub')), tiles: Array.from(Rp.querySelectorAll('[data-usd-el="roster-tile"]')).map(box), grid: box(Rp.querySelector('.usd-roster-grid')),
					style: { cls: t.className, name: getComputedStyle(t.querySelector('.usd-out-card-name')).fontSize, nick: (t.querySelector('.usd-out-card-nick') ? getComputedStyle(t.querySelector('.usd-out-card-nick')).fontSize : ''), border: getComputedStyle(t).borderTopWidth } };
			});
			assert(near(r1.grid[1], want.grid1) && (w !== 375 || Math.abs(m.grid[1] - r1.grid[1]) <= 16), 'T53(1) ' + w + 'px: ①の表の上端 ' + want.grid1 + (w === 375 ? '・①と②の星取表の見出しの上端の差は 16px 以内（モックと同じ 4px）' : ''), { r1: r1.grid, r2: m.grid });
			assert(m.style && m.style.cls === r1.style.cls && m.style.name === r1.style.name && m.style.nick === r1.style.nick && m.style.border === r1.style.border,
				'T53(1) ' + w + 'px: タイルは①と同じ部品（クラス・名前と二つ名の字の大きさ・縁の太さが同じ）', { two: m.style, one: r1.style });
			if (w >= 720) {
				const same = tl.every((t, i) => near(t.x, r1.tiles[i][0]) && near(t.w, r1.tiles[i][2]) && near(t.h, r1.tiles[i][3]) && near(t.y - m.panel[1], r1.tiles[i][1] - r1.lower[1]));
				assert(same && near(m.blank[0], r1.uma[0]) && near(m.blank[2], r1.uma[2]) && near(m.blank[3], r1.uma[3]) && near(m.panel[1], r1.lower[1] - 4),
					'T53(1) ' + w + 'px: カード6枚は①と同じ x・幅・高さ・パネルの中の位置（±1px）。空白の領域は①の育成ウマ娘の枠と同じ x・幅・高さ。②のパネルは①より 4px 上（このまま）', { two: tl.map((t) => [t.x, t.y, t.w, t.h]), one: r1.tiles, blank: m.blank, uma: r1.uma, p2: m.panel, p1: r1.lower });
			}
			await sp.ctx.close();
		});
	}

	/* ---- (2) 中身と星取表の列 ---- */
	await block('T53②因子周回の後半 (2) パネルの中身は保存のカード（outsideOptions.cards）の並び・空きは後ろで「サポートカード」・星取表の列は同じ並びで空きは出さない・タイルと分類の表示にもパネル', async () => {
		const sp = await openSp({ w: 375 });
		const tl = await tiles(sp.page);
		assert(tl.map((t) => t.id).join() === sortedIds(SAVED5).concat(['']).join() && tl.slice(0, 5).every((t) => !t.empty && t.x2 && /^\d枚目：/.test(t.aria)) && tl[5].empty && tl[5].name === 'サポートカード' && tl[5].aria === '6枚目：サポートカードを選ぶ' && !tl[5].x2,
			'T53(2)→T67 6枚の枠に保存の5枚が種別の順→ID の降順で入り、6枚目は空き（名前「サポートカード」・読み上げ「6枚目：サポートカードを選ぶ」・× なし）。入っている枠は「N枚目：…」と ×', tl.map((t) => [t.id, t.name, t.aria, t.x2]));
		for (const v of ['cards', 'group']) {
			await setView(sp.page, v);
			const n = (await tiles(sp.page)).length;
			assert(n === 6, 'T53(2) 表示「' + v + '」でもパネルが出る（6枚の枠）', n);
		}
		await setView(sp.page, 'table');
		const cols = await tableCols(sp.page);
		const names = (await tiles(sp.page)).filter((t) => !t.empty).map((t) => t.name);
		assert(cols.length === 5 && names.every((nm, i) => cols[i].label.indexOf(nm) !== -1), 'T53(2) 星取表のカードの列はパネルと同じ並びの5列（空きの枠は列に出さない）', { cols, names });
		assert(jsErrors(sp.errors).length === 0, 'T53(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// Deck 単体ページには無い
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, EMPTY);
		await dk.page.waitForTimeout(800);
		const has = await dk.page.evaluate(() => !!document.querySelector('[data-usd-el="factor-cards"]:not([hidden])'));
		assert(!has, 'T53(2) Deck 単体ページにはパネルが無い', has);
		await dk.ctx.close();
	});

	/* ---- (3) 直接選ぶ ---- */
	await block('T53②因子周回の後半 (3) 直接選ぶ: ①のカード選択の小窓・①と同じカード／②と同じキャラクター（グループのメンバーを含む）は選べない・①と同じキャラクターは選べる・育成ウマ娘と同じキャラクターは知らせ・選ぶと残りの枠の指定にまとめ、②のスキルは変えない・枚数は「6 − 指定の枚数」まで下がる', async () => {
		const sp = await openSp({ w: 375 });
		await setView(sp.page, 'table');
		const ids0 = await scopeIds(sp.page);
		await openPick(sp.page, 5);
		const head = await sp.page.evaluate(() => { const h = document.querySelector('[data-usd-el="roster-modal-host"] .usd-roster-modal-head .usd-roster-h'); return h ? h.textContent : ''; });
		assert(head === 'サポートカードを選ぶ', 'T53(3) 空きの枠を押すと、①と同じ「サポートカードを選ぶ」の小窓', head);
		const inR1 = await findIn(sp.page, CARD_IDS[0]);
		const sameR1 = await findIn(sp.page, SAME_R1);
		const sameR2 = await findIn(sp.page, SAME_R2);
		const member = await findIn(sp.page, GROUP_MEMBER);
		const free = await findIn(sp.page, FREE1);
		assert(inR1.length === 1 && !inR1[0].button && inR1[0].note === 'この編成に入っています', 'T53(3) ①と同じカードは選べない（「この編成に入っています」）', inR1);
		assert(sameR1.length === 1 && sameR1[0].button, 'T53(3) ①と同じキャラクターの別のカードは選べる', sameR1);
		assert(sameR2.length === 1 && !sameR2[0].button && sameR2[0].note === '同じキャラクターが入っています', 'T53(3) ②のほかの枠と同じキャラクターのカードは選べない（「同じキャラクターが入っています」）', sameR2);
		assert(member.length === 1 && !member[0].button && member[0].note === '同じキャラクターが入っています', 'T53(3) ②のグループのカードのメンバー（代表者でない）と同じキャラクターのカードも選べない（①と同じくメンバー全員で見る）', member);
		assert(free.length === 1 && free[0].button, 'T53(3) 重ならないカードは選べる', free);
		// 育成ウマ娘と同じキャラクター: 知らせ（窓は開いたまま・入れない）
		await findIn(sp.page, UMA_CHARA);
		await sp.page.click(MH + '[data-usd-act="take"][data-entry-id="' + UMA_CHARA + '"]');
		await sp.page.waitForTimeout(300);
		const notice = await sp.page.evaluate(() => { const n = document.querySelector('[data-usd-el="roster-modal-host"] [data-usd-el="pick-notice"]'); return n ? n.textContent : ''; });
		assert((await modalOpen(sp.page)) && /育成ウマ娘にいるため、入れられません$/.test(notice) && (await optsOf(sp.page)).cards.join() === SAVED5.join(), 'T53(3) 育成ウマ娘と同じキャラクターは、窓を開いたまま知らせて入れない', notice);
		// 選ぶ
		await take(sp.page, FREE1);
		const o1 = await optsOf(sp.page);
		const tl1 = await tiles(sp.page);
		// T67: パネルでは種別の順の位置（p）に入る。保存（cards）は今までどおり後ろに足す
		const p = sortedIds(o1.cards).indexOf(FREE1);
		assert(!(await modalOpen(sp.page)) && o1.cards.join() === SAVED5.concat([FREE1]).join() && o1.pinned.join() === FREE1 && o1.count === null && p >= 0 && tl1[p].id === FREE1 && tl1.map((t) => t.id).join() === sortedIds(o1.cards).join(),
			'T53(3)→T67 選ぶと、列のカード（cards）の後ろと、残りの枠の指定（pinned）に入り、パネルでは種別の順の位置に並ぶ。枚数は既定の5のまま（6 − 1 = 5）', { o1, tl: tl1.map((t) => t.id) });
		assert((await scopeIds(sp.page)) === ids0, 'T53(3) 直接指定で②のスキルは変わらない', await scopeIds(sp.page));
		const cols1 = await tableCols(sp.page);
		const a1 = await activeOf(sp.page);
		assert(cols1.length === 6 && cols1[p].label.indexOf(tl1[p].name) !== -1 && a1 && a1.el === 'factor-card-pick' && a1.index === String(p), 'T53(3)→T67 星取表の列が6列になり（選んだカードはパネルと同じ位置の列）、フォーカスは選んだカードの枠', { cols1, a1, p });
		// 入っている枠を押して入れ替える（提案のカード SAVED5[0] → 指定）。指定が2枚になるので、枚数は 4 に下がる。T67: 枠はパネルの中の位置で探す
		const shownAt = async (id) => (await tiles(sp.page)).findIndex((t) => t.id === id);
		await openPick(sp.page, await shownAt(SAVED5[0]));
		await take(sp.page, FREE2);
		const o2 = await optsOf(sp.page);
		assert(o2.cards.join() === [FREE2].concat(SAVED5.slice(1), [FREE1]).join() && o2.pinned.join() === [FREE1, FREE2].join() && o2.count === 4,
			'T53(3) 入っている枠を押して選ぶと、その位置で入れ替わり、指定は2枚・枚数は 6 − 2 = 4 に下がる（C-262 の (4)）', o2);
		// ①と同じキャラクターの別のカードも入れられる
		await openPick(sp.page, await shownAt(SAVED5[1]));
		await take(sp.page, SAME_R1);
		const o3 = await optsOf(sp.page);
		assert(o3.cards[1] === SAME_R1 && o3.pinned.join() === [FREE1, FREE2, SAME_R1].join() && o3.count === 3, 'T53(3) ①と同じキャラクターの別のカードを入れると指定は3枚・枚数は 3', o3);
		assert((await scopeIds(sp.page)) === ids0, 'T53(3) 入れ替えても②のスキルは変わらない', null);
		// 読み込み直しても残る（保存の形は今のまま: cards・pinned・count）
		await reloadReady(sp.page);
		await sp.page.waitForTimeout(800);
		const tl4 = await tiles(sp.page);
		assert(tl4.map((t) => t.id).join() === sortedIds(o3.cards).join() && Object.keys(o3.raw).sort().join() === 'cards,count,pinned', 'T53(3) 読み込み直しても同じ6枚。保存は outsideOptions の cards・pinned・count だけ（形は今のまま）', { ids: tl4.map((t) => t.id), keys: Object.keys(o3.raw) });
		assert(jsErrors(sp.errors).length === 0, 'T53(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ---- (4) × ---- */
	await block('T53②因子周回の後半 (4) ×: 指定のカードは列のカードと指定の両方から外れる・提案のカードは列のカードから外れる・後ろの枠は詰める・枚数と②のスキルは変えない・フォーカスは同じ枠', async () => {
		const R = Object.assign({}, R1S, { outsideOptions: { cards: SAVED5.concat([FREE1]), pinned: [FREE1], count: 4 } });
		const sp = await openSp({ w: 1280, roster: R });
		await setView(sp.page, 'table');
		const ids0 = await scopeIds(sp.page);
		// T67: パネルは種別の順に並ぶので、外すカードの枠はパネルの中の位置で探す
		const shownAt = async (id) => (await tiles(sp.page)).findIndex((t) => t.id === id);
		const i1 = await shownAt(FREE1);
		await sp.page.click(T + '[data-usd-el="factor-card-clear"][data-index="' + i1 + '"]');
		await sp.page.waitForTimeout(300);
		const o1 = await optsOf(sp.page);
		const a1 = await activeOf(sp.page);
		assert(o1.cards.join() === SAVED5.join() && o1.pinned.length === 0 && o1.count === 4 && a1 && a1.el === 'factor-card-pick' && a1.index === String(i1), 'T53(4)→T67 指定のカードの × で、列のカードと指定の両方から外れる。枚数は 4 のまま。フォーカスは同じ枠', { o1, a1, i1 });
		const i2 = await shownAt(SAVED5[1]);
		await sp.page.click(T + '[data-usd-el="factor-card-clear"][data-index="' + i2 + '"]');
		await sp.page.waitForTimeout(300);
		const o2 = await optsOf(sp.page);
		const tl = await tiles(sp.page);
		const a2 = await activeOf(sp.page);
		assert(o2.cards.join() === [SAVED5[0]].concat(SAVED5.slice(2)).join() && tl.map((t) => t.id).join() === sortedIds(o2.cards).concat(['', '']).join() && a2 && a2.index === String(i2),
			'T53(4)→T67 提案のカードの × で、列のカードから外れ、後ろの枠は詰める（空きは後ろ2つ。パネルは種別の順）。フォーカスは同じ枠（次のカード）', { o2, tl: tl.map((t) => t.id), a2, i2 });
		assert((await scopeIds(sp.page)) === ids0 && (await tableCols(sp.page)).length === 4, 'T53(4) × で②のスキルは変わらない。星取表の列は残りの4列', { cols: await tableCols(sp.page) });
		assert(jsErrors(sp.errors).length === 0, 'T53(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ---- (5) 6枚目 ---- */
	await block('T53②因子周回の後半 (5) 指定が5枚（枚数 1）のときに6枚目を選ぶと、列のカードに入り、指定は5枚のまま（枚数は 1 より下げない）', async () => {
		const five = [FREE1, FREE2, SAME_R1, 'card-0254', 'card-0255'];
		const R = Object.assign({}, R1S, { outsideOptions: { cards: five, pinned: five, count: 1 } });
		const sp = await openSp({ w: 375, roster: R });
		await openPick(sp.page, 5);
		const six = 'card-0256';
		await take(sp.page, six);
		const o = await optsOf(sp.page);
		assert(o.cards.join() === five.concat([six]).join() && o.pinned.join() === five.join() && o.count === 1, 'T53(5) 6枚目は列のカードに入り、指定は5枚・枚数 1 のまま', o);
		assert(jsErrors(sp.errors).length === 0, 'T53(5) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ---- (6) グループのカード ---- */
	await block('T53②因子周回の後半 (6) グループのカード: 直接選べる（①とメンバーが重なっても可）・指定のカードとして探索の出発点に、メンバー全員の共通イベントのスキルを数える・探索の候補には入れない', async () => {
		const sp = await openSp({ w: 375 });
		await openPick(sp.page, 5);
		const g = await findIn(sp.page, GROUP_FREE);
		assert(g.length === 1 && g[0].button, 'T53(6) グループのカード（メンバーが①のカードのキャラクターと重なる）は選べる', g);
		await take(sp.page, GROUP_FREE);
		const o = await optsOf(sp.page);
		assert(o.cards[5] === GROUP_FREE && o.pinned.join() === GROUP_FREE, 'T53(6) グループのカードも指定（pinned）に入る', o);
		// 探索: 指定のグループのカードの被覆に、代表者でないメンバーの共通イベントにだけあるスキルが入る（母集団にあるもの）。候補にはグループのカードが無い。
		// スキルはデータから引く（代表者の共通イベントとカードのヒントに無く、代表者でないメンバーの共通イベントにあるもの。選択肢が分かれるイベントは、どれかの出発点に入る）
		const evRows = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/character-event-skills.json'), 'utf8')).entries;
		const evOf = (n) => (evRows.find((e) => e.charaName === n && e.status === 'done') || { events: [] }).events;
		const sure = (n) => evOf(n).filter((e) => (e.choices || []).length === 1).flatMap((e) => (e.choices[0].skills || []).map((s) => s.skillId));
		const allOf = (n) => evOf(n).flatMap((e) => (e.choices || []).flatMap((c) => (c.skills || []).map((s) => s.skillId)));
		const groups = cardsData.filter((c) => c.isGroup === true).map((c) => ({ id: c.id, ids: Array.from(new Set(c.groupMembers.filter((n) => n !== c.charaName).flatMap(allOf))).filter((id) => allOf(c.charaName).indexOf(id) === -1 && (c.hintSkills || []).every((h) => h.skillId !== id)) }));
		const r = await sp.page.evaluate((groups) => {
			const roster = { umaId: 'uma-0179', cardIds: [], skillFilter: {} };
			const bit = (m, i) => (m[i >> 5] >>> (i & 31)) & 1;
			for (const g of groups) {
				const p = UmaSkillDeckCore.outside.build({ roster: roster, addedSkillIds: [], pinnedCardIds: [g.id] });
				if (!p.ok) continue;
				const ids = g.ids.filter((id) => p.idx.has(id));
				if (ids.length === 0) continue;
				const covered = ids.filter((id) => p.bases.some((b) => bit(b.m, p.idx.get(id)) === 1));
				const cands = UmaSkillDeckCore.outside.candidatesOf(roster).filter((c) => c.isGroup === true).length;
				return { ok: true, card: g.id, ids, covered, cands, pinned: p.pinned.map((c) => c.id) };
			}
			return { ok: false };
		}, groups);
		assert(r.ok && r.ids.length > 0 && r.covered.join() === r.ids.join() && r.pinned.join() === r.card && r.cands === 0,
			'T53(6) 指定のグループのカードの被覆に、メンバー全員の共通イベントのスキルが入る（①と同じ）。探索の候補にグループのカードは入らない（今の決まり）', r);
		assert(jsErrors(sp.errors).length === 0, 'T53(6) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ---- (7) 枚数 1〜6 ---- */
	await block('T53②因子周回の後半 (7) オススメサポの枚数: 1〜6枚の6つ（既定 5）・指定のカードがあると「6 − 指定の枚数」より多い枚数は押せない・1枚を選ぶと1枚の結果・保存され読み込み直しても1枚', async () => {
		const sp = await openSp({ w: 375 });
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		const settle = () => sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 20000 });
		await settle();
		await sp.page.click(OM + '[data-usd-el="outside-count-btn"]');
		const chips = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-count-list"] button')).map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, on: b.getAttribute('aria-pressed') === 'true', dis: b.disabled, w: r.width, h: r.height }; }));
		assert(chips.map((c) => c.t).join() === '1枚,2枚,3枚,4枚,5枚,6枚' && chips.map((c) => c.on).join() === 'false,false,false,false,true,false' && chips.every((c) => !c.dis && c.h >= 28 && c.w >= 41 && c.w <= 44),
			'T53(7) 枚数の選択欄は「1枚」〜「6枚」の6つ（既定の5枚に印・どれも押せる・大きさはモックと同じ 41〜43×28）', chips);
		await sp.page.click('[data-usd-el="outside-count-list"] [data-usd-el="outside-count-1"]');
		await settle();
		const n1 = await sp.page.evaluate(() => document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]').length);
		const exp1 = await sp.page.evaluate(() => UmaSkillDeckCore.outside.solveSync({ count: 1, addedSkillIds: [], deadlineMs: 20000 }).cards.length);
		assert(n1 === 1 && exp1 === 1 && (await optsOf(sp.page)).count === 1, 'T53(7) 1枚を選ぶと1枚の結果（純粋関数と同じ）で、枚数 1 が保存される', { n1, exp1 });
		await sp.page.click(OM + '[data-usd-act="outside-close"]');
		await sp.page.waitForTimeout(200);
		// 指定が2枚のとき: 5枚・6枚は押せない
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ count: 4, pinned: ['card-0252', 'card-0253'] }));
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		await settle();
		await sp.page.click(OM + '[data-usd-el="outside-count-btn"]');
		const dis = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-count-list"] button')).map((b) => b.disabled).join());
		assert(dis === 'false,false,false,false,true,true', 'T53(7) 指定が2枚なら 1〜4枚だけ押せる（6 − 2 = 4）', dis);
		await sp.page.keyboard.press('Escape');
		await sp.page.click(OM + '[data-usd-act="outside-close"]').catch(() => {});
		await sp.page.evaluate(() => UmaSkillDeckCore.outside.setOptions({ count: 1, pinned: [] }));
		await reloadReady(sp.page);
		await sp.page.waitForTimeout(800);
		const c = await sp.page.evaluate(() => UmaSkillDeckCore.outside.getOptions().count);
		assert(c === 1, 'T53(7) 読み込み直しても枚数 1', c);
		assert(jsErrors(sp.errors).length === 0, 'T53(7) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ---- (8) 「追加」と「元に戻す」・使い直し ---- */
	await block('T53②因子周回の後半 (8) オススメサポの「追加」でパネルが提案のカードになり、「元に戻す」でカードも前に戻る・使い直しでは直接指定のカードを残す・追加のあとにパネルで変えたカードは元に戻すで戻さない', async () => {
		const sp = await openSp({ w: 375, ids: ['2'] });
		const settle = () => sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 20000 });
		// 直接指定を1枚
		await openPick(sp.page, 5);
		await take(sp.page, FREE1);
		const before = (await optsOf(sp.page)).cards.slice();
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		await settle();
		const rec = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card"]')).map((c) => c.getAttribute('data-card-id')));
		await sp.page.click(OM + '[data-usd-el="outside-add"]');
		await sp.page.waitForTimeout(500);
		const after = await optsOf(sp.page);
		const tlA = await tiles(sp.page);
		assert(after.cards.length === 5 + 1 && after.cards[5] === FREE1 && after.cards.slice(0, 5).every((id) => rec.indexOf(id) !== -1) && after.pinned.join() === FREE1 && tlA.map((t) => t.id).join() === sortedIds(after.cards).join(),
			'T53(8) 「追加」で、パネルは提案の5枚＋直接指定の1枚（後ろ）になる（使い直しでも直接指定を残す）', { after, rec, tl: tlA.map((t) => t.id) });
		const undo = await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		await sp.page.waitForTimeout(400);
		const back = await optsOf(sp.page);
		const tlB = await tiles(sp.page);
		assert(undo && back.cards.join() === before.join() && tlB.map((t) => t.id).join() === sortedIds(before).concat(before.length < 6 ? [''] : []).join() && (await scopeIds(sp.page)) === '2',
			'T53(8) 「元に戻す」で、足したスキルとカードの両方が「追加」の前に戻る（パネルも）', { back, before, ids: await scopeIds(sp.page) });
		// 追加 → パネルで1枚外す → 元に戻す: カードはパネルで変えた今のまま（スキルだけ戻す）
		await sp.page.click(T + '[data-usd-el="outside-open"]');
		await settle();
		await sp.page.click(OM + '[data-usd-el="outside-add"]');
		await sp.page.waitForTimeout(500);
		await sp.page.click(T + '[data-usd-el="factor-card-clear"][data-index="0"]');
		await sp.page.waitForTimeout(300);
		const edited = (await optsOf(sp.page)).cards.slice();
		await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		await sp.page.waitForTimeout(400);
		assert((await optsOf(sp.page)).cards.join() === edited.join() && (await scopeIds(sp.page)) === '2', 'T53(8) 追加のあとにパネルでカードを変えていたら、元に戻すはスキルだけを戻し、カードは今のまま', { edited, now: (await optsOf(sp.page)).cards });
		assert(jsErrors(sp.errors).length === 0, 'T53(8) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
