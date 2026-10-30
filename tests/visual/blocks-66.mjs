// UmaStar のスキル名の共通様式と、②の「“オススメサポ”で除外されたスキル」のパネルの追加操作（C-238・2026-10-30）の検査。
// run-smoke.mjs の末尾から register66() で呼ばれる（塊の見出しはすべて「スキル名の様式」で始まる。`npm run test:visual -- --only=スキル名の様式` で回せる）。
//
// 決め（おいもさん・2026-10-30）:
//  (1) スキル名を押すと説明の小窓（下線）。説明文が最初から出ている場面（本育成編成のイベント／スキル）は除く。
//      回復（持久力回復）・デバフ・パッシブの名前の文字に、①の表と同じ色。判定は①の表と同じ（マスターの tags）。結合画像は対象外。
//  (2) 除外されたスキルのパネル: 追加は左の＋だけ（パネルのほかの部分・名前では足さない）。＋の押せる範囲は既存のボタンと同じ 44px。
//      名前は説明の小窓（下線・取り消し線なし）・文字は今の薄い色のまま・分類の色は付けない。地・見出し・件数の表記は今のまま。
// 色の期待値は製品の変数から読まず、①の表の名前の色（同じ変数を使う既存の部品）と比べる。分類の期待値はマスターの tags から検査の側で独立に出す。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。

import { reloadReady } from './lib/page-ready.mjs';
import { pickEntry } from './lib/entry-search.mjs';
import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';

export async function register66(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const TAGS = new Map();
	readJson('uma-skill-deck-skills.json').skills.forEach((s) => TAGS.set(s.id, s.tags || {}));
	readJson('data/extended-skills.json').entries.forEach((s) => { if (!TAGS.has(s.id)) TAGS.set(s.id, s.tags || {}); });
	// ①の表と同じ優先（回復 > デバフ > パッシブ）。デバフは効果タイプの debuff と、それにまとめた掛かり時間
	const toneWant = (id) => {
		const t = TAGS.get(id) || {};
		const eff = Array.isArray(t.effect) ? t.effect : [];
		if (eff.includes('stamina')) return 'heal';
		if (eff.includes('debuff') || eff.includes('temptation_time')) return 'debuff';
		if (Array.isArray(t.passive) && t.passive.length > 0) return 'passive';
		return '';
	};
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const R1 = { umaId: 'uma-0001', cardIds: CARDS6 };
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const ONE12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';

	/** special の②を開く（①の下書き・②の下書き・配色） */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ roster, ids, theme }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: o.roster || R1S, ids: o.ids || ONE12, theme: o.theme || 'light' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(400);
		return sp;
	};
	const setTable = async (page) => {
		const p = await page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-view"]'); return b ? b.getAttribute('aria-pressed') : null; });
		if (p !== 'true') { await page.click(T + '[data-usd-el="factor-view"]'); await page.waitForTimeout(300); }
	};
	const popTitle = (page) => page.evaluate(() => { const p = document.querySelector('[data-usd-el="info-pop"]'); return p && !p.hidden ? p.querySelector('.uma-popover-title').textContent : null; });
	const sel = (page) => page.evaluate(() => deckTemplateManager.getSelection().skillIds.slice());
	const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
	const toneOfClass = (cls) => (String(cls).match(/usd-roster-skillname--(heal|debuff|passive)/) || [])[1] || '';
	/** 名前のボタン（root の中の data-usd-info）: id・色のクラス・下線・文字の色 */
	const readNames = (page, root) => page.evaluate((root) => Array.from(document.querySelectorAll(root + ' button[data-usd-info]')).map((b) => {
		const cs = getComputedStyle(b);
		return { id: b.getAttribute('data-usd-info'), cls: b.className, deco: cs.textDecorationLine, color: cs.color, skillInfo: b.getAttribute('data-usd-el') === 'skill-info-btn' };
	}), root);

	await block('スキル名の様式(1) 除外されたスキルのパネル: 左の＋はボタン（押せる範囲 44×44 以上・読み上げに「追加」）・パネルそのものは押せる部品でない・名前は説明の小窓のボタン（下線・取り消し線なし・薄い文字の色のまま・分類の色なし）・地と見出しは今のまま／375・1280px × ライト・ダーク × カード一覧・星取表', async () => {
		for (const w of [375, 1280]) for (const theme of ['light', 'dark']) for (const view of ['cards', 'table']) {
			const tag = 'スキル名の様式(1) ' + w + 'px ' + theme + ' ' + view + ': ';
			const sp = await openSp({ w, theme });
			if (view === 'table') await setTable(sp.page);
			const r = await sp.page.evaluate((T) => {
				const probe = document.createElement('span');
				probe.style.color = 'var(--uma-text-faint)';
				probe.style.background = 'var(--uma-surface-sunken)';
				document.body.appendChild(probe);
				const faint = getComputedStyle(probe).color, sunken = getComputedStyle(probe).backgroundColor;
				probe.remove();
				const rows = Array.from(document.querySelectorAll(T + '[data-usd-el="factor-off-row"]'));
				return {
					faint, sunken,
					head: (() => { const e = document.querySelector(T + '[data-usd-el="factor-off-head"]'); return e ? e.textContent : null; })(),
					rows: rows.map((row) => {
						const add = row.querySelector('button[data-usd-el="factor-enable"]');
						const nb = row.querySelector('.usd-panel-namebtn');
						const ar = add ? add.getBoundingClientRect() : null;
						const cs = nb ? getComputedStyle(nb) : null;
						return { id: row.dataset.offSkillId, rowAct: row.getAttribute('data-usd-act'), add: !!add, addAct: add && add.getAttribute('data-usd-act'), addW: ar && ar.width, addH: ar && ar.height,
							addLabel: add && add.getAttribute('aria-label'), addFirst: !!add && row.firstElementChild === add,
							nameInfo: nb && nb.getAttribute('data-usd-info'), nameAct: nb && nb.getAttribute('data-usd-act'), deco: cs && cs.textDecorationLine, color: cs && cs.color,
							tone: nb ? /usd-roster-skillname--/.test(nb.className) : null, bg: getComputedStyle(row).backgroundColor };
					})
				};
			}, T);
			assert(r.rows.length >= 3, tag + '前提: 除外されたスキルの行がある（' + r.rows.length + '行）', r.rows.length);
			assert(/^“オススメサポ”で除外されたスキル \d+件$/.test(r.head || '') && r.head.endsWith(' ' + r.rows.length + '件'), tag + '見出しの文言と件数は今のまま', r.head);
			assert(r.rows.every((x) => x.add && x.addFirst && x.addAct === 'factor-enable' && x.addW >= 44 && x.addH >= 44 && /追加/.test(x.addLabel || '')), tag + '＋は左端のボタン・押せる範囲 44×44 以上・読み上げに「追加」', r.rows.slice(0, 2));
			assert(r.rows.every((x) => x.rowAct === null && x.nameAct === null), tag + 'パネルと名前には追加の動作（data-usd-act）が無い', r.rows.slice(0, 2).map((x) => ({ row: x.rowAct, name: x.nameAct })));
			assert(r.rows.every((x) => x.nameInfo === x.id && x.deco === 'underline' && x.color === r.faint && x.tone === false), tag + '名前は説明の小窓のボタン・下線（取り消し線なし）・薄い文字の色・分類の色なし', r.rows.slice(0, 2));
			if (view === 'cards') assert(r.rows.every((x) => x.bg === r.sunken), tag + 'パネルの地は今のまま（沈めた面）', r.rows.slice(0, 2).map((x) => x.bg));
			assert(await noHScroll(sp.page), tag + '横スクロールなし', '');
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('スキル名の様式(2) 除外されたスキルのパネルの操作: 名前を押すと説明の小窓（足さない）・パネルの右端を押しても足さない・＋を押すと②に足して段から消える（合計・件数が変わる）・元に戻すで戻る／カード一覧・星取表', async () => {
		for (const view of ['cards', 'table']) {
			const tag = 'スキル名の様式(2) ' + view + ': ';
			const sp = await openSp({ w: 375 });
			if (view === 'table') await setTable(sp.page);
			const off0 = await sp.page.$$eval(T + '[data-usd-el="factor-off-row"]', (x) => x.map((e) => e.dataset.offSkillId));
			const id = off0[1];
			const ROW = T + '[data-usd-el="factor-off-row"][data-off-skill-id="' + id + '"]';
			const s0 = await sel(sp.page);
			const total0 = await sp.page.evaluate(() => deckTemplateManager.getSetSummary().total);
			await sp.page.click(ROW + ' .usd-panel-namebtn');
			await sp.page.waitForTimeout(300);
			const title = await popTitle(sp.page);
			assert(title !== null && title.length > 0 && (await sel(sp.page)).length === s0.length, tag + '名前を押すと説明の小窓が開き、足さない', { title });
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(200);
			const box = await sp.page.locator(ROW).boundingBox();
			for (const fx of [0.98, 0.5]) {
				// 0.5 は名前の右の空き（名前が短いとき）か名前の上。どちらでも足さない
				await sp.page.mouse.click(box.x + box.width * fx, box.y + box.height / 2);
				await sp.page.waitForTimeout(250);
				await sp.page.keyboard.press('Escape');
			}
			assert((await sel(sp.page)).length === s0.length && await sp.page.isVisible(ROW), tag + 'パネルの右端・中ほどを押しても足さない', null);
			await sp.page.click(ROW + ' [data-usd-el="factor-enable"]');
			await sp.page.waitForTimeout(400);
			const s1 = await sel(sp.page);
			const off1 = await sp.page.$$eval(T + '[data-usd-el="factor-off-row"]', (x) => x.map((e) => e.dataset.offSkillId));
			const total1 = await sp.page.evaluate(() => deckTemplateManager.getSetSummary().total);
			const head1 = await sp.page.evaluate((T) => document.querySelector(T + '[data-usd-el="factor-off-head"]').textContent, T);
			assert(s1.length === s0.length + 1 && s1.includes(id) && !off1.includes(id) && off1.length === off0.length - 1 && total1 > total0 && head1.endsWith(' ' + off1.length + '件'),
				tag + '＋を押すと②に入り、段から消え、合計と件数が変わる', { n: [s0.length, s1.length], off: [off0.length, off1.length], total: [total0, total1], head1 });
			await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
			await sp.page.waitForTimeout(300);
			const off2 = await sp.page.$$eval(T + '[data-usd-el="factor-off-row"]', (x) => x.map((e) => e.dataset.offSkillId));
			assert(JSON.stringify(off2) === JSON.stringify(off0) && (await sel(sp.page)).length === s0.length, tag + '元に戻すと段に戻る', { off2: off2.length });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('スキル名の様式(3) 分類の色: ②のパネル・緑スキルの一覧・オススメサポの一覧の名前に、①の表と同じ回復・デバフ・パッシブのクラス（マスターの tags から独立に出した期待と一致）／色は①の表の名前と同じ（②のパネルの緑だけ地に合わせて濃い）／文字のコントラスト 4.5 以上（ライト・ダーク）', async () => {
		for (const theme of ['light', 'dark']) {
			const tag = 'スキル名の様式(3) ' + theme + ': ';
			const pick3 = (tone) => Array.from(TAGS.keys()).filter((id) => /^\d+$/.test(id) && toneWant(id) === tone).slice(0, 3);
			const ids = ONE12.concat(pick3('heal'), pick3('debuff'));
			const sp = await openSp({ w: 375, theme, roster: R1, ids });
			// ②のパネル（①と重なる灰色の行〔取得済み〕は灰色のまま）
			const panels = await sp.page.evaluate((T) => Array.from(document.querySelectorAll(T + '[data-usd-el="selected-list"] .usd-panel[data-skill-id] .usd-panel-namebtn')).map((b) => ({ id: b.getAttribute('data-usd-info'), cls: b.className, taken: b.closest('.usd-panel').classList.contains('usd-panel--taken') })), T);
			const pmiss = panels.filter((p) => toneOfClass(p.cls) !== toneWant(p.id));
			assert(panels.length === ids.length && pmiss.length === 0 && panels.some((p) => toneWant(p.id) === 'heal') && panels.some((p) => toneWant(p.id) === 'debuff') && panels.some((p) => toneWant(p.id) === 'passive'),
				tag + '②のパネルの名前のクラスが期待と一致（回復・デバフ・パッシブを含む ' + panels.length + '行）', pmiss.slice(0, 4));
			const c2 = await sp.page.evaluate(scanTextContrastInPage, '#deck-template-panel [data-usd-el="selected-list"]');
			assert(c2.checked > 0 && c2.bad.length === 0, tag + '②の一覧の文字のコントラスト 4.5 以上（' + c2.checked + '要素）', formatContrast(c2.bad).slice(0, 4));
			// 緑スキルの一覧
			await pickEntry(sp.page, 'editor-pick-passive');
			await sp.page.waitForSelector('[data-usd-el="passive-results"] label.usd-row');
			await sp.page.waitForTimeout(300);
			const pas = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="passive-results"] label.usd-row')).map((r) => { const b = r.querySelector('button[data-usd-info]'); return { id: r.querySelector('input').value, gray: r.classList.contains('usd-row--excluded'), btn: !!b && b.getAttribute('data-usd-info') === r.querySelector('input').value, cls: b ? b.className : '' }; }));
			const qmiss = pas.filter((p) => !p.btn || toneOfClass(p.cls) !== (p.gray ? '' : toneWant(p.id)));
			assert(pas.length > 10 && qmiss.length === 0, tag + '緑スキルの一覧: すべての行の名前が説明の小窓のボタン・色のクラスが期待と一致（灰色の行は色なし。' + pas.length + '行）', qmiss.slice(0, 4));
			const c3 = await sp.page.evaluate(scanTextContrastInPage, '[data-usd-el="passive-results"]');
			assert(c3.checked > 0 && c3.bad.length === 0, tag + '緑スキルの一覧の文字のコントラスト 4.5 以上', formatContrast(c3.bad).slice(0, 4));
			await sp.page.click('[data-usd-act="picker-close"]');
			await sp.page.waitForTimeout(300);
			// オススメサポ（追加済みでない行に色・追加済みの灰色の行は色なし）
			await sp.page.click(T + '[data-usd-el="outside-open"]');
			await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
			await sp.page.waitForTimeout(300);
			const outs = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-row"]')).map((r) => { const b = r.querySelector('button[data-usd-info]'); return { id: r.dataset.skillId, added: r.getAttribute('data-usd-excluded') === '1', cls: b ? b.className : '' }; }));
			const omiss = outs.filter((p) => toneOfClass(p.cls) !== (p.added ? '' : toneWant(p.id)));
			assert(outs.length > 5 && omiss.length === 0, tag + 'オススメサポの一覧: 色のクラスが期待と一致（' + outs.length + '行）', omiss.slice(0, 4));
			const c4 = await sp.page.evaluate(scanTextContrastInPage, '[data-usd-el="outside-list"]');
			assert(c4.checked > 0 && c4.bad.length === 0, tag + 'オススメサポの一覧の文字のコントラスト 4.5 以上', formatContrast(c4.bad).slice(0, 4));
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(300);
			// 色は①の表の名前と同じ（回復・デバフ）。②のパネルの緑はライトだけ濃い（ダークは同じ）
			const colors = await sp.page.evaluate((T) => {
				const mk = (cls, inPanel) => {
					const host = document.createElement('div');
					if (inPanel) host.className = 'usd-panel';
					const b = document.createElement('button');
					b.className = 'usd-roster-skillname usd-roster-skillname--btn ' + cls;
					b.textContent = 'x';
					host.appendChild(b);
					(document.querySelector('#deck-roster-panel') || document.body).appendChild(host);
					const c = getComputedStyle(b).color;
					host.remove();
					return c;
				};
				const panelColor = (tone) => { const b = Array.from(document.querySelectorAll(T + '[data-usd-el="selected-list"] .usd-panel:not(.usd-panel--taken) .usd-roster-skillname--' + tone))[0]; return b ? getComputedStyle(b).color : null; };
				return { heal: [mk('usd-roster-skillname--heal'), panelColor('heal')], debuff: [mk('usd-roster-skillname--debuff'), panelColor('debuff')], passive: [mk('usd-roster-skillname--passive'), panelColor('passive')] };
			}, T);
			assert(colors.heal[0] === colors.heal[1] && colors.debuff[0] === colors.debuff[1] && (theme === 'dark' ? colors.passive[0] === colors.passive[1] : colors.passive[0] !== colors.passive[1]),
				tag + '回復・デバフの色は①の表の名前と同じ・緑は' + (theme === 'dark' ? '同じ' : '②のパネルだけ濃い'), colors);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('スキル名の様式(4) 説明の小窓のつなぎ: 緑スキルの一覧の名前（チェックは変わらない）・オススメサポの除外中のスキル・テキストで検索で選んだスキル・③の表の名前（因子の行はボタンでない）を押すと説明の小窓が開く', async () => {
		const sp = await openSp({ w: 375, roster: R1, ids: ONE12 });
		// 緑スキル
		await pickEntry(sp.page, 'editor-pick-passive');
		await sp.page.waitForSelector('[data-usd-el="passive-results"] label.usd-pick-row');
		const ROWP = '[data-usd-el="passive-results"] label.usd-pick-row';
		const c0 = await sp.page.evaluate((s) => document.querySelector(s + ' input').checked, ROWP);
		await sp.page.click(ROWP + ' button[data-usd-info]');
		await sp.page.waitForTimeout(300);
		const t1 = await popTitle(sp.page);
		const c1 = await sp.page.evaluate((s) => document.querySelector(s + ' input').checked, ROWP);
		assert(t1 !== null && c0 === c1, '緑スキルの一覧: 名前を押すと説明の小窓・チェックは変わらない', { t1, c0, c1 });
		await sp.page.keyboard.press('Escape');
		await sp.page.click('[data-usd-act="picker-close"]');
		await sp.page.waitForTimeout(300);
		// テキストで検索（完全一致でない名前の候補を選ぶと「→ 選んだスキル」の行になる）
		const nm = await sp.page.evaluate(() => UmaSkillDeckCore.getSkillEntries(['10'])[0].name);
		await pickEntry(sp.page, 'editor-pick-text');
		await sp.page.fill('[data-usd-el="paste-input"]', nm + 'x');
		await sp.page.click('[data-usd-act="paste-run"]');
		await sp.page.waitForTimeout(500);
		await sp.page.click('[data-usd-act="paste-pick"]');
		await sp.page.waitForTimeout(400);
		const picked = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="paste-report"] .usd-paste-picked')).map((b) => ({ tag: b.tagName, id: b.getAttribute('data-usd-info'), deco: getComputedStyle(b).textDecorationLine })));
		assert(picked.length === 1 && picked[0].tag === 'BUTTON' && picked[0].id && picked[0].deco === 'underline', 'テキストで検索: 選んだスキルの名前は下線のボタン', picked);
		await sp.page.click('[data-usd-el="paste-report"] .usd-paste-picked');
		await sp.page.waitForTimeout(300);
		assert((await popTitle(sp.page)) !== null, 'テキストで検索: 選んだスキルの名前を押すと説明の小窓', null);
		await sp.page.keyboard.press('Escape');
		await sp.page.click('[data-usd-act="picker-close"]');
		await sp.page.waitForTimeout(300);
		// ③の表（照合の結果を入れて引き出しを開く）
		const res = await sp.page.evaluate(() => {
			const entries = UmaSkillDeckCore.getSkillEntries(deckScope.skillIds);
			const lines = entries.map((e, i) => ({ text: e.name, stars: (i % 3) + 1, starsReliable: true, rowKey: 'r' + i }));
			personResults[0] = matchAllSkillsWithStars(lines, skillList, skillIndex, {});
			renderResults();
			openDrawer('result');
			return { n: entries.length };
		});
		await sp.page.waitForTimeout(500);
		const rows = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#result-tbody tr')).map((tr) => { const b = tr.querySelector('button[data-result-skill-id]'); return { btn: !!b, id: b && b.getAttribute('data-result-skill-id'), cls: b ? b.className : '', deco: b ? getComputedStyle(b).textDecorationLine : null, text: tr.cells[0] ? tr.cells[0].textContent.trim() : '' }; }));
		const btnRows = rows.filter((r) => r.btn);
		const tmiss = btnRows.filter((r) => toneOfClass(r.cls) !== toneWant(r.id) || r.deco !== 'underline');
		assert(btnRows.length === res.n && tmiss.length === 0, '③の表: ②のスキルの名前はすべて下線のボタン・色のクラスが期待と一致（' + btnRows.length + '行）', tmiss.slice(0, 3));
		await sp.page.click('#result-tbody button[data-result-skill-id]');
		await sp.page.waitForTimeout(300);
		assert((await popTitle(sp.page)) !== null, '③の表: 名前を押すと説明の小窓', null);
		await sp.page.keyboard.press('Escape');
		await sp.ctx.close();
		// オススメサポの除外中のスキル（以前の保存値 outsideSkillExcluded で2件を除外中にする）
		const sp2 = await openSp({ w: 375, roster: R1, ids: ['1'] });
		const openOutside = async (p) => {
			await p.click(T + '[data-usd-el="outside-open"]');
			await p.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
			await p.waitForTimeout(300);
		};
		await openOutside(sp2.page);
		const exIds = await sp2.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-check"]')).slice(0, 2).map((i) => i.value));
		await sp2.ctx.close();
		const sp3 = await openSp({ w: 375, roster: Object.assign({}, R1, { outsideSkillExcluded: exIds }), ids: ['1'] });
		await openOutside(sp3.page);
		await sp3.page.click('[data-usd-el="outside-excl-toggle"]');
		await sp3.page.waitForTimeout(300);
		const ex = await sp3.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-excl-skill"]')).map((r) => { const b = r.querySelector('button[data-usd-info]'); return { id: r.dataset.skillId, info: b && b.getAttribute('data-usd-info'), deco: b && getComputedStyle(b).textDecorationLine, tone: b ? /usd-roster-skillname--/.test(b.className) : null }; }));
		assert(ex.length === 2 && ex.every((x) => x.info === x.id && x.deco === 'underline' && x.tone === false), 'オススメサポの除外中のスキル: 名前は下線のボタン（除外中なので分類の色なし）', ex);
		await sp3.page.click('[data-usd-el="outside-excl-skill"] button[data-usd-info]');
		await sp3.page.waitForTimeout(300);
		assert((await popTitle(sp3.page)) !== null, 'オススメサポの除外中のスキル: 名前を押すと説明の小窓', null);
		assert(jsErrors(sp3.errors).length === 0, 'スキル名の様式(4) コンソールのエラー0', sp3.errors.slice(0, 3));
		await sp3.ctx.close();
	});
}
