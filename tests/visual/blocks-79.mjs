// ②因子周回の「分類」の表示（T29・2026-10-31。おいもさんの決定 2026-10-30・T24 の報告の推奨をすべて採用）の検査。
// run-smoke.mjs の末尾から register79() で呼ばれる（塊の見出しはすべて「T29分類」で始まる。`npm run test:visual -- --only=T29分類` で回せる）。
//
// 決め:
//  ・②の表示の切り替えのボタン1つを押すたびに カード一覧 → 表 → 分類 → カード一覧。保存しない（リロードでカード一覧）。28px のまま。
//    aria-pressed はやめ、aria-label と title で「表示：分類（押すと カード一覧）」のように今と次を言う。カード一覧以外のときに 2px の枠。絵は今の表示。
//  ・分類（タグの値のとおり。まとめない・読み替えない）: パッシブ → デバフ → フェーズ（コース位置も持てば中分類）→ コース位置 → 「フェーズ・コース位置の指定なし」→「その他」（タグを持たない id）。
//    最後を効果タイプで細分類。複数の値は「＋」でつないだ1つの値（組の最初の値の直後に並ぶ）。同じフェーズの中はコース位置の無い細分類が先。分類の中は compareGameOrder。
//  ・見出しは1行（「中盤／直線／持久力回復 1件」）。件数は②のスキルの数（除外の行は数えない）。パッシブの見出しだけ緑の文字。0件の分類は出さない。
//  ・「“オススメサポ”で除外されたスキル」の行は、当たる分類の最後尾（段の見出しは出さない）。除外の行だけの分類は見出しを出して「0件」。
// 分類の鍵の期待値（母集団 462件・77通り）は T24 の報告の付録 B、代表1 は付録 A（データに敏感な塊）。スキル名は検査の側に書かない（恒久ルール1。id とタグの名前だけ）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register79(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const GOLDS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/skill-pt.json'), 'utf8')).entries.filter((e) => e.rarity === 'gold').map((e) => e.skillId);
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	// 代表1（T22・T24 と同じ）: ①＝uma-0179＋6枚、②＝24種。SAVED5 はオススメサポの提案のカード（保存の項目に直接入れる。除外の行を出すため）
	const CARD_IDS = ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const REP1 = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417', '125', '124', '6', '27', '33', '230', '16', '23', '147', '117', '118', '145'];
	const R1 = { umaId: 'uma-0179', cardIds: CARD_IDS };
	const R1S = { umaId: 'uma-0179', cardIds: CARD_IDS, outsideOptions: { cards: SAVED5 } };
	// T24 の報告の付録 B（母集団 462件の分類・並び順・件数）
	const APPX_B = [
		['パッシブ（緑スキル）', 68], ['デバフ', 31], ['スタート時／加速度上昇', 3], ['序盤／加速度上昇', 2], ['序盤／コース取り', 2], ['序盤／コース取り＋視野', 1], ['序盤／視野', 1],
		['序盤＋中盤／速度上昇', 1], ['序盤＋中盤／前に出る', 3], ['序盤＋中盤／持久力回復＋コース取り', 1], ['中盤／速度上昇', 104], ['中盤／速度上昇＋加速度上昇', 1], ['中盤／速度上昇＋前に出る', 2],
		['中盤／速度上昇＋持久力回復', 7], ['中盤／速度上昇＋コース取り', 1], ['中盤／加速度上昇', 2], ['中盤／加速度上昇＋持久力回復', 1], ['中盤／加速度上昇＋コース取り', 2], ['中盤／前に出る', 7],
		['中盤／持久力回復', 20], ['中盤／視野', 1], ['中盤／コーナー／速度上昇', 4], ['中盤／コーナー／持久力回復', 1], ['中盤／直線／速度上昇', 2], ['中盤／直線／持久力回復', 2],
		['中盤＋終盤／速度上昇＋前に出る', 2], ['中間／持久力回復', 1], ['後半／速度上昇', 6], ['後半／速度上昇＋加速度上昇', 2], ['後半／速度上昇＋加速度上昇＋持久力回復', 1], ['後半／加速度上昇', 1],
		['後半／前に出る', 4], ['後半／前に出る＋持久力回復', 1], ['後半／コーナー／前に出る', 2], ['終盤／速度上昇', 1], ['終盤／速度上昇＋加速度上昇', 3], ['終盤／加速度上昇', 32],
		['終盤／加速度上昇＋コース取り', 1], ['終盤／前に出る', 10], ['終盤／持久力回復', 1], ['終盤／コース取り', 1], ['終盤／視野', 1], ['終盤／コーナー／前に出る', 1],
		['終盤／最終コーナー／加速度上昇', 3], ['終盤／最終コーナー／前に出る', 1], ['終盤／最終直線／速度上昇', 1], ['終盤／最終直線／前に出る', 1], ['最終盤＋ラストスパート／速度上昇', 19],
		['最終盤＋ラストスパート／前に出る', 1], ['ラストスパート／加速度上昇', 3], ['ラストスパート／前に出る', 1], ['ラストスパート／直線／加速度上昇', 4], ['ラストスパート／最終直線／速度上昇', 1],
		['コーナー／速度上昇', 12], ['コーナー／加速度上昇', 1], ['コーナー／前に出る', 1], ['第3コーナー／前に出る', 7], ['最終コーナー／速度上昇', 7], ['最終コーナー／速度上昇＋加速度上昇', 1],
		['最終コーナー／加速度上昇', 1], ['直線／速度上昇', 12], ['直線／加速度上昇', 1], ['最終直線／速度上昇', 7], ['最終直線／前に出る', 1], ['上り坂／速度上昇', 4], ['上り坂／加速度上昇', 1],
		['上り坂／持久力回復', 1], ['下り坂／速度上昇', 2], ['下り坂／加速度上昇', 3], ['下り坂／持久力回復', 1], ['フェーズ・コース位置の指定なし／速度上昇', 7], ['フェーズ・コース位置の指定なし／加速度上昇', 2],
		['フェーズ・コース位置の指定なし／前に出る', 5], ['フェーズ・コース位置の指定なし／伸び', 2], ['フェーズ・コース位置の指定なし／持久力回復', 5], ['フェーズ・コース位置の指定なし／スタート得意', 1],
		['フェーズ・コース位置の指定なし／視野', 1]
	];
	// T24 の報告の付録 A（代表1 の②24種。分類 11）
	const APPX_A1 = [
		['パッシブ（緑スキル）', 10], ['デバフ', 1], ['序盤／コース取り＋視野', 1], ['中盤／速度上昇', 1], ['中盤／コーナー／速度上昇', 1], ['中盤／コーナー／持久力回復', 1],
		['中盤／直線／持久力回復', 1], ['終盤／前に出る', 1], ['コーナー／速度上昇', 2], ['直線／速度上昇', 2], ['フェーズ・コース位置の指定なし／持久力回復', 3]
	];

	/** special.html を、①（下書きの編成）と②の下書きを入れて開く（blocks-60 と同じ作り）。②のタブを見せる */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		sp.errors = [];
		sp.page.on('pageerror', (e) => sp.errors.push(String(e)));
		await sp.page.evaluate(({ roster, ids }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster || null, ids: o.ids || [] });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const btnState = (page) => page.evaluate(() => {
		const b = document.querySelector('#deck-template-panel [data-usd-el="factor-view"]');
		if (!b) return null;
		const r = b.getBoundingClientRect();
		const svg = b.querySelector('svg');
		return { view: b.getAttribute('data-usd-view'), label: b.getAttribute('aria-label'), title: b.getAttribute('title'), pressed: b.hasAttribute('aria-pressed'),
			shadow: getComputedStyle(b).boxShadow, w: Math.round(r.width), h: Math.round(r.height),
			shape: svg ? Array.from(svg.children).map((c) => c.tagName).join(',') : '', focus: document.activeElement === b };
	});
	const setView = async (page, want) => {
		for (let i = 0; i < 3 && ((await btnState(page)) || {}).view !== want; i++) { await page.click(T + '[data-usd-el="factor-view"]'); await page.waitForTimeout(300); }
	};
	/** 分類の表示の並び: 見出しごとに { key, name, n, text, passive, color, on: [②の id], off: [除外の id], order: 'on'/'off' の並び }。各 id の正しい分類の鍵も返す */
	const readGroups = (page) => page.evaluate(() => {
		const C = UmaSkillDeckCore;
		const tagsById = new Map(C.taggedSkillPool().map((s) => [s.id, s.tags]));
		const keyOf = (id) => C.factorGroupOf(tagsById.has(id) ? tagsById.get(id) || {} : null).key;
		const el = document.querySelector('#deck-template-panel [data-usd-el="selected-list"]');
		const out = [];
		let stray = 0;
		Array.from(el.children).forEach((c) => {
			if (c.getAttribute('data-usd-el') === 'factor-group-head') {
				const nm = c.querySelector('.usd-factor-grouphead-name');
				out.push({ key: c.getAttribute('data-group-key'), name: nm ? nm.textContent : '', n: c.querySelector('.usd-factor-grouphead-n').textContent, count: Number(c.getAttribute('data-group-count')),
					passive: c.classList.contains('usd-factor-grouphead--passive'), color: nm ? getComputedStyle(nm).color : '', on: [], off: [], seq: [] });
				return;
			}
			const g = out[out.length - 1];
			if (!g) { stray++; return; }
			const off = c.getAttribute('data-off-skill-id');
			const id = c.getAttribute('data-skill-id');
			if (off) { g.off.push(off); g.seq.push('off'); } else if (id) { g.on.push(id); g.seq.push('on'); } else stray++;
		});
		out.forEach((g) => { g.wrong = g.on.concat(g.off).filter((id) => keyOf(id) !== g.key); });
		const css = (v) => { const s = document.createElement('span'); s.style.color = 'var(' + v + ')'; el.appendChild(s); const r = getComputedStyle(s).color; s.remove(); return r; };
		return { groups: out, stray, offHead: !!el.querySelector('[data-usd-el="factor-off-head"]'), passiveColor: css('--usd-skill-passive-text'), headingColor: css('--uma-text-heading'),
			sel: deckTemplateManager.getSelection().skillIds.slice(), sw: document.documentElement.scrollWidth, iw: window.innerWidth };
	});
	const offIdsCards = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="selected-list"] [data-usd-el="factor-off-row"]')).map((r) => r.getAttribute('data-off-skill-id')));
	const sortedKeys = (gs) => gs.map((g) => g.key).slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

	await block('T29分類(1) 母集団の分類の鍵: 462件が77通り・並びと件数が T24 の報告の付録 B と一致／タグの無いものは「その他」（鍵 Z・最後）', async () => {
		const sp = await openSp({ roster: R1, ids: [] });
		const r = await sp.page.evaluate(() => {
			const C = UmaSkillDeckCore;
			const pool = C.taggedSkillPool();
			const m = new Map();
			pool.forEach((s) => { const g = C.factorGroupOf(s.tags || {}); if (!m.has(g.key)) m.set(g.key, { l: g.levels.join('／'), n: 0 }); m.get(g.key).n++; });
			const keys = Array.from(m.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
			return { n: pool.length, maxKey: keys[keys.length - 1], rows: keys.map((k) => [m.get(k).l, m.get(k).n]), other: C.factorGroupOf(null), passive: C.factorGroupOf({ passive: ['passive'], effect: ['stat_up'] }) };
		});
		const want = APPX_B.map((x) => x.join(' ')), got = r.rows.map((x) => x.join(' '));
		const diff = want.filter((x) => got.indexOf(x) === -1).concat(got.filter((x) => want.indexOf(x) === -1).map((x) => '+' + x));
		assert(r.n === 462 && r.rows.length === 77, 'T29分類(1) 母集団は462件・分類は77通り', { n: r.n, groups: r.rows.length });
		assert(JSON.stringify(got) === JSON.stringify(want), 'T29分類(1) 分類の並び・名前・件数が付録 B と一致', diff.slice(0, 10));
		assert(r.other.key === 'Z' && r.other.levels.join() === 'その他' && r.maxKey < 'Z', 'T29分類(1) タグの無い id は「その他」（鍵 Z＝最後）', r.other);
		assert(r.passive.key === 'A' && r.passive.passive === true, 'T29分類(1) パッシブは鍵 A（先頭）', r.passive);
		await sp.ctx.close();
	});

	await block('T29分類(2) ボタンの3つの状態: カード一覧 → 表 → 分類 → カード一覧（押すたび）・絵は今の表示・aria-pressed なし・aria-label と title で今と次・カード一覧以外は 2px の枠・28px・フォーカスが残る・保存しない', async () => {
		const sp = await openSp({ roster: R1, ids: REP1 });
		const want = [
			{ view: 'cards', label: '表示：カード一覧（押すと 表）', shape: 'rect,rect,rect,rect', frame: false },
			{ view: 'table', label: '表示：表（押すと 分類）', shape: 'rect,path', frame: true },
			{ view: 'group', label: '表示：分類（押すと カード一覧）', shape: 'path,path,path,path', frame: true },
			{ view: 'cards', label: '表示：カード一覧（押すと 表）', shape: 'rect,rect,rect,rect', frame: false }
		];
		for (let i = 0; i < want.length; i++) {
			if (i > 0) { await sp.page.click(T + '[data-usd-el="factor-view"]'); await sp.page.waitForTimeout(300); }
			const s = await btnState(sp.page);
			const w = want[i];
			const shown = await sp.page.evaluate(() => {
				const el = document.querySelector('#deck-template-panel [data-usd-el="selected-list"]');
				return { table: !!el.querySelector('[data-usd-el="factor-table"]'), group: el.querySelectorAll('[data-usd-el="factor-group-head"]').length };
			});
			const shownOk = w.view === 'table' ? shown.table && shown.group === 0 : w.view === 'group' ? !shown.table && shown.group > 0 : !shown.table && shown.group === 0;
			assert(s && s.view === w.view && s.label === w.label && s.title === w.label && !s.pressed && s.shape === w.shape && /inset/.test(s.shadow) === w.frame && /2px/.test(s.shadow) === w.frame
				&& s.w === 28 && s.h === 28 && (i === 0 || s.focus) && shownOk,
				'T29分類(2) ' + i + '回押した: ' + w.label + '（絵・枠・28px・フォーカス・表示）', { s, shown });
		}
		await setView(sp.page, 'group');
		await reloadReady(sp.page);
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(800);
		const r = await btnState(sp.page);
		const heads = await sp.page.evaluate(() => document.querySelectorAll('#deck-template-panel [data-usd-el="factor-group-head"]').length);
		assert(r && r.view === 'cards' && heads === 0, 'T29分類(2) 分類の表示で読み込み直すとカード一覧（保存しない）', { r, heads });
		assert(jsErrors(sp.errors).length === 0, 'T29分類(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T29分類(3) 代表1（除外の行なし）: 見出しの並び・名前・件数が付録 A と一致／分類の中は compareGameOrder（カード一覧と同じ順）／パッシブの見出しだけ緑の文字／見出しは②の行の数', async () => {
		const sp = await openSp({ roster: R1, ids: REP1 });
		const cardsOrder = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="selected-list"] .usd-panel[data-skill-id]')).map((p) => p.getAttribute('data-skill-id')));
		await setView(sp.page, 'group');
		const r = await readGroups(sp.page);
		const got = r.groups.map((g) => g.name + ' ' + g.n);
		assert(JSON.stringify(got) === JSON.stringify(APPX_A1.map((x) => x[0] + ' ' + x[1] + '件')), 'T29分類(3) 見出しの並び・名前・件数が付録 A（代表1・11分類）と一致', got);
		assert(r.stray === 0 && r.groups.every((g) => g.wrong.length === 0 && g.off.length === 0 && g.count === g.on.length && g.n === g.on.length + '件'), 'T29分類(3) 各行は自分の分類の見出しの下・件数は行の数', r.groups.filter((g) => g.wrong.length || g.count !== g.on.length).slice(0, 3));
		const inGroup = r.groups.map((g) => g.on);
		const cardsInGroup = inGroup.map((ids) => cardsOrder.filter((id) => ids.indexOf(id) !== -1));
		assert(JSON.stringify(inGroup) === JSON.stringify(cardsInGroup) && inGroup.flat().length === REP1.length, 'T29分類(3) 分類の中の並びはカード一覧と同じ（compareGameOrder）・24種すべてが出る', inGroup.flat().length);
		assert(JSON.stringify(r.groups.map((g) => g.key)) === JSON.stringify(sortedKeys(r.groups)), 'T29分類(3) 見出しは鍵の順', r.groups.map((g) => g.key));
		const pas = r.groups.filter((g) => g.passive);
		assert(pas.length === 1 && pas[0] === r.groups[0] && pas[0].color === r.passiveColor && r.groups.slice(1).every((g) => g.color === r.headingColor && g.color !== r.passiveColor),
			'T29分類(3) パッシブの見出しだけ緑の文字（--usd-skill-passive-text）・ほかは見出しの色', { pas: pas.map((g) => g.color), others: Array.from(new Set(r.groups.slice(1).map((g) => g.color))), p: r.passiveColor, h: r.headingColor });
		assert(!r.offHead, 'T29分類(3) 除外の段の見出しは出ない', null);
		assert(jsErrors(sp.errors).length === 0, 'T29分類(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T29分類(4) 除外の行: 当たる分類の最後尾（②の行の後）・段の見出しは出さない・件数に数えない／除外の行だけの分類は「0件」で出す／顔ぶれはカード一覧の除外の段と同じ／カード一覧・表の除外の段は今のまま', async () => {
		const sp = await openSp({ roster: R1S, ids: REP1 });
		const offCards = await offIdsCards(sp.page);
		const headCards = await sp.page.evaluate(() => !!document.querySelector('#deck-template-panel [data-usd-el="factor-off-head"]'));
		assert(offCards.length > 0 && headCards, 'T29分類(4) 前提: カード一覧に除外の段（見出しと行）がある（空振りしない）', offCards.length);
		await setView(sp.page, 'group');
		const r = await readGroups(sp.page);
		const offGroup = r.groups.flatMap((g) => g.off);
		assert(JSON.stringify(offGroup.slice().sort()) === JSON.stringify(offCards.slice().sort()), 'T29分類(4) 除外の行の顔ぶれはカード一覧と同じ', { cards: offCards.length, group: offGroup.length });
		assert(!r.offHead && r.stray === 0, 'T29分類(4) 除外の段の見出しは出ない', null);
		assert(r.groups.every((g) => g.wrong.length === 0 && g.seq.join(',') === g.on.map(() => 'on').concat(g.off.map(() => 'off')).join(',')), 'T29分類(4) 除外の行は当たる分類の最後尾（②の行の後）',
			r.groups.filter((g) => g.wrong.length).slice(0, 3));
		assert(r.groups.every((g) => g.count === g.on.length && g.n === g.on.length + '件'), 'T29分類(4) 件数は②の行だけ（除外の行は数えない）', null);
		const mixed = r.groups.filter((g) => g.on.length > 0 && g.off.length > 0);
		const offOnly = r.groups.filter((g) => g.on.length === 0);
		assert(mixed.length > 0 && offOnly.length > 0 && offOnly.every((g) => g.off.length > 0 && g.n === '0件'), 'T29分類(4) ②の行と除外の行が混ざる分類・除外の行だけの分類（「0件」）がある（空振りしない）',
			{ mixed: mixed.length, offOnly: offOnly.map((g) => g.name + ' ' + g.n) });
		assert(r.groups.every((g) => g.on.length + g.off.length > 0), 'T29分類(4) 行の無い分類は出さない', null);
		const keys = new Set(r.groups.map((g) => g.key));
		assert(keys.size === r.groups.length, 'T29分類(4) 同じ分類の見出しは1つだけ', null);
		// ＋で足すと、その分類の②の行に入り、除外の行から消える（表示は分類のまま）
		const g0 = mixed[0], id = g0.off[0];
		await sp.page.click(T + '[data-usd-el="factor-enable"][data-off-skill-id="' + id + '"]');
		await sp.page.waitForTimeout(400);
		const r2 = await readGroups(sp.page);
		const g1 = r2.groups.find((g) => g.key === g0.key);
		assert(g1 && g1.on.indexOf(id) !== -1 && g1.off.indexOf(id) === -1 && g1.count === g0.count + 1 && r2.sel.indexOf(id) !== -1 && (await btnState(sp.page)).view === 'group',
			'T29分類(4) 除外の行の＋で②に足すと、同じ分類の②の行に入り件数が1増える（表示は分類のまま）', { id, g1 });
		// 表に切り替えると今の除外の段（見出し）が出る
		await setView(sp.page, 'table');
		const tableHead = await sp.page.evaluate(() => !!document.querySelector('#deck-template-panel [data-usd-el="factor-off-head"]'));
		assert(tableHead, 'T29分類(4) 表の除外の段は今のまま（見出しあり）', null);
		assert(jsErrors(sp.errors).length === 0, 'T29分類(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T29分類(5) 並びと複数の値の組: パッシブ → デバフ → フェーズ → コース位置 → 指定なし → その他／組は「＋」でつなぎ最初の値の直後／同じフェーズの中はコース位置の無いものが先', async () => {
		// ②に入れる id を母集団のタグから選ぶ（スキル名は書かない）。母集団の外の id は skill-pt.json の金（②の検索の母集団に無い）
		const sp0 = await openSp({ roster: R1, ids: [] });
		const pick = await sp0.page.evaluate((GOLDS) => {
			const C = UmaSkillDeckCore;
			const pool = C.taggedSkillPool();
			const inPool = new Set(pool.map((s) => s.id));
			const eq = (a, b) => JSON.stringify((a || []).slice().sort()) === JSON.stringify(b.slice().sort());
			const find = (fn) => { const s = pool.find(fn); return s ? s.id : null; };
			const t = (s) => s.tags || {};
			const plain = (s) => !(t(s).passive || []).length && !(t(s).effect || []).includes('debuff') && !(t(s).effect || []).includes('temptation_time');
			const want = {
				passive: find((s) => (t(s).passive || []).length > 0),
				debuff: find((s) => !(t(s).passive || []).length && (t(s).effect || []).includes('debuff')),
				early: find((s) => plain(s) && eq(t(s).phase, ['early']) && !(t(s).coursePos || []).length),
				earlyMid: find((s) => plain(s) && eq(t(s).phase, ['early', 'mid'])),
				start: find((s) => plain(s) && eq(t(s).phase, ['start'])),
				midSpeed: find((s) => plain(s) && eq(t(s).phase, ['mid']) && eq(t(s).effect, ['target_speed_up']) && !(t(s).coursePos || []).length),
				midSpeedSta: find((s) => plain(s) && eq(t(s).phase, ['mid']) && eq(t(s).effect, ['target_speed_up', 'stamina']) && !(t(s).coursePos || []).length),
				midAccel: find((s) => plain(s) && eq(t(s).phase, ['mid']) && eq(t(s).effect, ['accel_up']) && !(t(s).coursePos || []).length),
				midCorner: find((s) => plain(s) && eq(t(s).phase, ['mid']) && eq(t(s).coursePos, ['corner'])),
				finalLast: find((s) => plain(s) && eq(t(s).phase, ['final_stage', 'lastspurt'])),
				corner: find((s) => plain(s) && !(t(s).phase || []).length && eq(t(s).coursePos, ['corner'])),
				finalCorner: find((s) => plain(s) && !(t(s).phase || []).length && eq(t(s).coursePos, ['final_corner'])),
				none: find((s) => plain(s) && !(t(s).phase || []).length && !(t(s).coursePos || []).length)
			};
			// 母集団の外: 名前が引ける金の id（②の検索の母集団に無い）
			want.outside = GOLDS.find((id) => !inPool.has(id) && C.getSkillName(id) && C.getSkillName(id) !== id) || null;
			return want;
		}, GOLDS);
		await sp0.ctx.close();
		const ids = Object.values(pick).filter(Boolean);
		assert(Object.keys(pick).every((k) => !!pick[k]), 'T29分類(5) 前提: 各種類の id が母集団から見つかる（空振りしない）', pick);
		const sp = await openSp({ roster: R1, ids: ids });
		await setView(sp.page, 'group');
		const r = await readGroups(sp.page);
		const names = r.groups.map((g) => g.name);
		const at = (id) => r.groups.findIndex((g) => g.on.indexOf(id) !== -1);
		const nm = (id) => { const i = at(id); return i === -1 ? null : names[i]; };
		assert(r.groups.every((g) => g.wrong.length === 0) && ids.every((id) => at(id) !== -1), 'T29分類(5) すべての id が自分の分類に出る', { names, pick });
		assert(JSON.stringify(r.groups.map((g) => g.key)) === JSON.stringify(sortedKeys(r.groups)), 'T29分類(5) 見出しは鍵の順', names);
		const tops = r.groups.map((g) => g.key.charAt(0)).join('');
		assert(/^ABC+D+EZ$/.test(tops), 'T29分類(5) 大分類の並び: パッシブ → デバフ → フェーズ → コース位置 → 指定なし → その他', tops);
		assert(nm(pick.passive) === 'パッシブ（緑スキル）' && nm(pick.debuff) === 'デバフ' && nm(pick.outside) === 'その他' && at(pick.outside) === r.groups.length - 1 && /^フェーズ・コース位置の指定なし／/.test(nm(pick.none)),
			'T29分類(5) パッシブ・デバフ・指定なし・その他（最後）の名前', { p: nm(pick.passive), d: nm(pick.debuff), n: nm(pick.none), o: nm(pick.outside) });
		assert(/^序盤＋中盤／/.test(nm(pick.earlyMid)) && at(pick.start) < at(pick.early) && at(pick.early) < at(pick.earlyMid) && at(pick.earlyMid) < at(pick.midSpeed), 'T29分類(5) フェーズの組「序盤＋中盤」は「序盤」の直後・「中盤」より前（母集団に「前半」だけのものは無い）・「スタート時」は「序盤」より前', { s: nm(pick.start), e: nm(pick.early), em: nm(pick.earlyMid), m: nm(pick.midSpeed) });
		assert(nm(pick.midSpeedSta) === '中盤／速度上昇＋持久力回復' && at(pick.midSpeed) < at(pick.midSpeedSta) && at(pick.midSpeedSta) < at(pick.midAccel), 'T29分類(5) 効果タイプの組「速度上昇＋持久力回復」は「速度上昇」の直後・「加速度上昇」より前',
			{ s: nm(pick.midSpeed), ss: nm(pick.midSpeedSta), a: nm(pick.midAccel) });
		assert(/^中盤／コーナー／/.test(nm(pick.midCorner)) && at(pick.midAccel) < at(pick.midCorner) && at(pick.midCorner) < at(pick.finalLast),
			'T29分類(5) 同じフェーズの中はコース位置の無い細分類が先・コース位置の中分類が後', { mc: nm(pick.midCorner) });
		assert(/^最終盤＋ラストスパート／/.test(nm(pick.finalLast)) && at(pick.finalLast) < at(pick.corner) && at(pick.corner) < at(pick.finalCorner) && /^最終コーナー／/.test(nm(pick.finalCorner)) && at(pick.finalCorner) < at(pick.none),
			'T29分類(5) 最終盤＋ラストスパート → コース位置（コーナー → 最終コーナー。フェーズのすべての後）→ 指定なし', { fl: nm(pick.finalLast), c: nm(pick.corner), fc: nm(pick.finalCorner) });
		assert(jsErrors(sp.errors).length === 0, 'T29分類(5) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T29分類(6) 分類の表示で削除・◎を○に変えるモード・説明の小窓・Pt の小窓が効く（カード一覧と同じ）', async () => {
		const sp = await openSp({ roster: R1, ids: REP1 });
		await setView(sp.page, 'group');
		// 説明の小窓: 行の名前を押す
		const info = await sp.page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="selected-list"] .usd-panel[data-skill-id] .usd-panel-namebtn'); return b ? { id: b.getAttribute('data-usd-info'), text: b.textContent } : null; });
		await sp.page.click(T + '[data-usd-el="selected-list"] .usd-panel[data-skill-id] .usd-panel-namebtn');
		await sp.page.waitForTimeout(300);
		const pop = await sp.page.evaluate(() => { const p = document.querySelector('[data-usd-el="info-pop"]'); return p && !p.hidden ? p.querySelector('.uma-popover-title').textContent : null; });
		assert(!!info && pop === info.text, 'T29分類(6) 行の名前を押すと説明の小窓（題はその名前）', { info, pop });
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		// Pt の小窓（①と重なる行のマイナスの Pt のボタン）
		const ptBtn = await sp.page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="selected-list"] [data-usd-el="panel-ptbtn"]'); return b ? b.getAttribute('data-skill-id') : null; });
		assert(!!ptBtn, 'T29分類(6) 前提: Pt のボタンの行がある（空振りしない）', null);
		await sp.page.click(T + '[data-usd-el="selected-list"] [data-usd-el="panel-ptbtn"][data-skill-id="' + ptBtn + '"]');
		await sp.page.waitForTimeout(300);
		const ptPop = await sp.page.evaluate(() => { const p = document.querySelector('[data-usd-el="info-pop"]'); return !!p && !p.hidden; });
		assert(ptPop, 'T29分類(6) Pt のボタンで小窓が開く', null);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(200);
		// ◎を○に変えるモード: 分類の表示のまま、候補の行に切り替えが出て、押すと◎／○が変わる
		const hasMode = await sp.page.isVisible(T + '[data-usd-el="factor-circle-mode"]');
		assert(hasMode, 'T29分類(6) 前提: ◎のボタンがある（空振りしない）', null);
		await sp.page.click(T + '[data-usd-el="factor-circle-mode"]');
		await sp.page.waitForTimeout(300);
		const tg = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="selected-list"] [data-usd-el="factor-circle-toggle"]')).map((b) => ({ id: b.getAttribute('data-skill-id'), p: b.getAttribute('aria-pressed') })));
		const heads1 = await sp.page.evaluate(() => document.querySelectorAll('#deck-template-panel [data-usd-el="factor-group-head"]').length);
		assert(tg.length > 0 && heads1 > 0, 'T29分類(6) モードでは分類の表示のまま、候補の行に◎／○の切り替え', { n: tg.length, heads1 });
		await sp.page.click(T + '[data-usd-el="selected-list"] [data-usd-el="factor-circle-toggle"][data-skill-id="' + tg[0].id + '"]');
		await sp.page.waitForTimeout(400);
		const p2 = await sp.page.evaluate((id) => { const b = document.querySelector('#deck-template-panel [data-usd-el="selected-list"] [data-usd-el="factor-circle-toggle"][data-skill-id="' + id + '"]'); return b ? b.getAttribute('aria-pressed') : null; }, tg[0].id);
		assert(p2 !== null && p2 !== tg[0].p && (await btnState(sp.page)).view === 'group', 'T29分類(6) 切り替えを押すと◎／○が変わる（表示は分類のまま）', { before: tg[0].p, after: p2 });
		await sp.page.click(T + '[data-usd-el="factor-circle-mode"]');
		await sp.page.waitForTimeout(300);
		// 削除: 「削除」を選んで行を押すと②から外れ、件数が1減る
		const before = await readGroups(sp.page);
		const g = before.groups.find((x) => x.on.length >= 2);
		const id = g.on[0];
		await sp.page.click(T + '[data-usd-el="palette-delete"]');
		await sp.page.waitForTimeout(200);
		await sp.page.click(T + '[data-usd-el="selected-list"] .usd-panel[data-skill-id="' + id + '"] .usd-panel-namebtn');
		await sp.page.waitForTimeout(400);
		const after = await readGroups(sp.page);
		const g2 = after.groups.find((x) => x.key === g.key);
		assert(after.sel.indexOf(id) === -1 && after.sel.length === before.sel.length - 1 && g2 && g2.count === g.count - 1 && g2.on.indexOf(id) === -1 && (await btnState(sp.page)).view === 'group',
			'T29分類(6) 削除で行を押すと②から外れ、その分類の件数が1減る（表示は分類のまま）', { id, before: g.count, after: g2 && g2.count });
		assert(jsErrors(sp.errors).length === 0, 'T29分類(6) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('T29分類(7) 横スクロールなし（375・390・1280px・除外の行あり）', async () => {
		for (const w of [375, 390, 1280]) {
			const sp = await openSp({ w, h: w === 1280 ? 800 : 812, roster: R1S, ids: REP1 });
			await setView(sp.page, 'group');
			const r = await readGroups(sp.page);
			const over = await sp.page.evaluate(() => {
				const vw = document.documentElement.clientWidth;
				return Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="factor-group-head"]')).filter((h) => h.getBoundingClientRect().right > vw + 0.5).length;
			});
			assert(r.groups.length > 0 && r.sw <= r.iw && over === 0, 'T29分類(7) ' + w + 'px: 横スクロールなし・見出しが画面の外に出ない', { sw: r.sw, iw: r.iw, over, n: r.groups.length });
			assert(jsErrors(sp.errors).length === 0, 'T29分類(7) ' + w + 'px: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});
}
