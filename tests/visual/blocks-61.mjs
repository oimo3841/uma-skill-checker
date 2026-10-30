// ②因子周回 段4 マーカー（画面。C-226・2026-10-28）の検査。run-smoke.mjs の末尾から register61() で呼ばれる
// （塊の見出しはすべて「②マーカー」で始まる。`npm run test:visual -- --only=②マーカー` で回せる）。
//
// 決め（おいもさん・段4 の Step 0 の D1〜D15 は推奨どおり）:
//  ・②のスキルすべてに自動のマーカーを1つ。判定は「周回サポカ → サポカ外 → その他」の順に1つ。
//    周回サポカ＝段3b で保存したオススメサポの提案のカード（roster.outsideOptions.cards）から得られるもの（星取表の列の●／○と同じ判定＝D3）。
//    カードが金を出すなら、その前段の白もカード（D2）。カードが白しか出さないとき、②の金はカードにしない。保存のカードが無いセットはカードの印0（D1）。
//    サポカ外＝data/non-support-skills.json。その他＝それ以外。
//  ・①と重なる行（C-223。C-242 から名前の脇の文言は無く、マイナスの Pt が押せる）も同じ規則。無効の段・星取表の表示だけの金の行には付けない（D11）。
//  ・置き場所: カード一覧のパネルの左端（アイコンのボタンを置き換え。ボタンではなく画像・読み上げは種類の名前）。星取表の名前セルにも同じ部品。
//  ・パレットの行（◎○△◇★× の印）を無くし、入口の行を「横に送る部分｜右端の固定の塊（◎・表の切り替え・削除。削除が一番右）」に（D5）。
//  ・skillIcons は special の②では読まず・書かない。保存値は消さない。tiers は触らない。リセットの小窓は「スキル○種をすべて消す」「やめる」の2つ（D6）。
//  ・③の結果の表の◎○▲ を自動のマーカーの小さい形（16px）に（D12）。シナリオ因子◆・遺伝子◇は残す。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。

import { reloadReady } from './lib/page-ready.mjs';
export async function register61(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const STEP = new Map(readJson('data/skill-step-up.json').entries.map((e) => [e.skillId, e.prevSkillIds || []]));
	const STAR = new Set(readJson('data/non-support-skills.json').entries.map((e) => e.skillId));
	const isGold = (id) => !!PT.get(id) && PT.get(id).rarity === 'gold';
	// 前段の鎖（検査の側の独立な導出。前段データを下へ根までたどる）
	const ancestors = (id) => {
		const out = [], seen = new Set([id]);
		const walk = (x) => (STEP.get(x) || []).forEach((p) => { if (seen.has(p)) return; seen.add(p); out.push(p); walk(p); });
		walk(id);
		return out;
	};
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const SAVED5 = ['card-0257', 'card-0402', 'card-0499', 'card-0300', 'card-0310'];
	const FILT = { distance: 'medium', style: 'senko', surface: 'turf' };
	const R1 = { umaId: 'uma-0001', cardIds: CARDS6 };
	const R1S = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: SAVED5 } };
	const R2S = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: FILT, outsideOptions: { cards: SAVED5 } };
	const RG = { umaId: 'uma-0001', cardIds: [null, null, null, null, null, null], outsideOptions: { cards: CARDS6 } };
	const ONE12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
	const STAR3 = [...STAR].slice(0, 3);
	const GIDS = ONE12.concat(['32', '45']).concat(STAR3.filter((id) => ONE12.indexOf(id) === -1));

	/** special.html を、①（下書きの編成）と②の下書きを入れて開く（blocks-60 と同じ作り）。②のタブを見せる */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, o.userData || EMPTY);
		if (o.route) await sp.page.route(o.route, (r) => r.fulfill({ status: 404, body: '' }));
		await sp.page.evaluate(({ roster, scope }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster || null, scope: o.scope || (o.ids ? { skillIds: o.ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 } : null) });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); try { await UmaSkillDeckCore.loadSkillEvolutions(); } catch (e) {} });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const setView = async (page, table) => {
		const on = await page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-view"]'); return b ? b.getAttribute('aria-pressed') === 'true' : false; });
		if (on !== table) { await page.click(T + '[data-usd-el="factor-view"]'); await page.waitForTimeout(300); }
	};
	/** ②の行のマーカー（カード一覧・星取表のどちらでも）と、無効の行・金の行の印の数 */
	const readMarkers = (page) => page.evaluate(() => {
		const list = document.querySelector('#deck-template-panel [data-usd-el="selected-list"]');
		const panels = Array.from(list.querySelectorAll('.usd-panel[data-skill-id]')).map((p) => {
			const ms = p.querySelectorAll('[data-usd-el="factor-marker"]');
			const m = ms[0];
			return { id: p.dataset.skillId, n: ms.length, kind: m ? m.dataset.marker : null, role: m ? m.getAttribute('role') : null, label: m ? m.getAttribute('aria-label') : null,
				button: !!(m && m.closest('button')), overlap: p.hasAttribute('data-usd-overlap'), taken: p.classList.contains('usd-panel--taken') };
		});
		const offMarks = Array.from(list.querySelectorAll('[data-usd-el="factor-off-row"]')).reduce((s, r) => s + r.querySelectorAll('[data-usd-el="factor-marker"]').length, 0);
		const goldRows = Array.from(list.querySelectorAll('[data-usd-el="factor-table-row"][data-usd-goldref="1"]'));
		const offRows = list.querySelectorAll('[data-usd-el="factor-off-row"], [data-usd-el="factor-table-row"][data-usd-fstar-off="1"]').length;
		return { panels, offMarks: offMarks + Array.from(list.querySelectorAll('[data-usd-el="factor-table-row"][data-usd-fstar-off="1"]')).reduce((s, r) => s + r.querySelectorAll('[data-usd-el="factor-marker"]').length, 0),
			offRows, goldRows: goldRows.length, goldMarks: goldRows.reduce((s, r) => s + r.querySelectorAll('[data-usd-el="factor-marker"]').length, 0),
			api: deckTemplateManager.getMarkerKinds(), labels: Object.fromEntries(UmaSkillDeckCore.markers.list.map((m) => [m.id, m.label])) };
	});
	/** ①の表の行の印（サポカの列だけ）。合成の「└」の行は除く */
	const readRosterMarks = (page, n = 6) => page.evaluate((n) => {
		const out = {};
		document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]:not([data-usd-derived])').forEach((r) => {
			const cells = Array.from(r.querySelectorAll('[role="cell"]')).slice(1, 1 + n);
			out[r.dataset.skillId] = cells.map((c) => c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '○' : '-').join('');
		});
		return out;
	}, n);
	/**
	 * マーカーの期待値（検査の側で独立に割り出す）: ①の編成のカードを保存のカードに置き換えた①の表（別のページで開く）のサポカの列に印（●か○）がある行＝カード。
	 * カードの金の前段の白（前段データを根まで）もカード。次に non-support-skills.json にあるもの＝★。残り＝その他。保存が無ければカードは0
	 */
	const expectKinds = async (roster, ids) => {
		const card = new Set();
		const saved = roster && roster.outsideOptions && roster.outsideOptions.cards ? roster.outsideOptions.cards : [];
		let viaGold = [];
		if (saved.length > 0) {
			const alt = Object.assign({}, roster, { cardIds: saved.concat([null, null, null, null, null, null]).slice(0, 6) });
			delete alt.outsideOptions;
			const sp = await openSp({ w: 1280, roster: alt, ids: [] });
			const rm = await readRosterMarks(sp.page, saved.length);
			await sp.ctx.close();
			Object.keys(rm).forEach((id) => { if (/[●○]/.test(rm[id])) card.add(id); });
			const direct = new Set(card);
			[...direct].forEach((id) => { if (isGold(id)) ancestors(id).forEach((p) => card.add(p)); });
			viaGold = ids.filter((id) => card.has(id) && !direct.has(id));
		}
		const out = {};
		ids.forEach((id) => { out[id] = card.has(id) ? 'card' : STAR.has(id) ? 'star' : 'other'; });
		return { kinds: out, viaGold };
	};

	await block('②マーカー(1) 判定: ②の行のマーカー（カード一覧・星取表）と getMarkerKinds が、検査の側で独立に割り出した3種（周回サポカ → サポカ外 → その他）と一致／各行に1つ・画像（ボタンでない・読み上げは種類の名前）', async () => {
		const cases = [{ k: 'R1S', roster: R1S, ids: GIDS }, { k: 'R2S（絞り込み）', roster: R2S, ids: GIDS }, { k: 'RG（金）', roster: RG, ids: GIDS }];
		const seen = { card: 0, star: 0, other: 0 };
		for (const c of cases) {
			const ex = await expectKinds(c.roster, c.ids);
			const sp = await openSp({ w: 1280, roster: c.roster, ids: c.ids });
			const errors = [];
			sp.page.on('pageerror', (e) => errors.push(String(e)));
			for (const view of ['cards', 'table']) {
				await setView(sp.page, view === 'table');
				const m = await readMarkers(sp.page);
				const bad = m.panels.filter((p) => p.n !== 1 || p.kind !== ex.kinds[p.id] || p.role !== 'img' || p.button || p.label !== m.labels[p.kind]);
				assert(m.panels.length === c.ids.length && bad.length === 0, '②マーカー(1) ' + c.k + ' ' + view + ': 各行にマーカー1つ・種類が独立の割り出しと一致・画像で読み上げは種類の名前', bad.slice(0, 4).map((p) => ({ id: p.id, got: p.kind, want: ex.kinds[p.id], n: p.n, role: p.role })));
				const apiBad = c.ids.filter((id) => m.api[id] !== ex.kinds[id]);
				assert(apiBad.length === 0 && Object.keys(m.api).length === c.ids.length, '②マーカー(1) ' + c.k + ' ' + view + ': getMarkerKinds も同じ', apiBad.slice(0, 4));
				if (view === 'cards') m.panels.forEach((p) => { seen[p.kind]++; });
			}
			assert(jsErrors(errors).length === 0, '②マーカー(1) ' + c.k + ' コンソールのエラー0', jsErrors(errors));
			await sp.ctx.close();
		}
		assert(seen.card > 0 && seen.star > 0 && seen.other > 0, '②マーカー(1) 3種とも実際に出ている（検査が空振りしていない）', seen);
	});

	await block('②マーカー(2) 保存のカードが無いセット: カードの印は0（★かその他だけ）・案内の文は出さない／①なしも同じ', async () => {
		for (const c of [{ k: 'R1（保存なし）', roster: R1 }, { k: '①なし', roster: null }]) {
			const sp = await openSp({ w: 1280, roster: c.roster, ids: GIDS });
			for (const view of ['cards', 'table']) {
				await setView(sp.page, view === 'table');
				const m = await readMarkers(sp.page);
				const bad = m.panels.filter((p) => p.kind !== (STAR.has(p.id) ? 'star' : 'other'));
				assert(bad.length === 0 && m.panels.some((p) => p.kind === 'star') && m.panels.length === GIDS.length, '②マーカー(2) ' + c.k + ' ' + view + ': カードの印0・non-support-skills.json は★・ほかはその他', bad.slice(0, 3));
			}
			const text = await sp.page.evaluate(() => document.querySelector('#deck-template-panel').textContent);
			assert(!/オススメサポで追加すると/.test(text), '②マーカー(2) ' + c.k + ': カードの印が無いことの案内の文は出さない', null);
			await sp.ctx.close();
		}
	});

	await block('②マーカー(3) 金と前段の白: カードが金を出すなら前段の白もカード／カードが白しか出さないとき、②の金はカードにしない', async () => {
		// RG（列のカード＝CARDS6）で、②の白の上の金のうちカードが持つものを②に入れる。カードが持たない金で、前段の白をカードが持つものも入れる
		const alt = { umaId: 'uma-0001', cardIds: CARDS6 };
		const sp0 = await openSp({ w: 1280, roster: alt, ids: [] });
		const rm = await readRosterMarks(sp0.page);
		await sp0.ctx.close();
		const has = (id) => !!rm[id] && /[●○]/.test(rm[id]);
		const golds = [...PT.keys()].filter((id) => isGold(id) && STEP.has(id));
		const goldCard = golds.filter((g) => has(g) && ancestors(g).some((w) => !isGold(w))).slice(0, 3);
		const goldNot = golds.filter((g) => !has(g) && ancestors(g).some((w) => has(w))).slice(0, 2);
		const whites = goldCard.flatMap((g) => ancestors(g).filter((w) => !isGold(w)));
		const ids = [...new Set(goldCard.concat(whites).concat(goldNot))];
		const ex = await expectKinds(RG, ids);
		const sp = await openSp({ w: 1280, roster: RG, ids });
		const m = await readMarkers(sp.page);
		const kind = Object.fromEntries(m.panels.map((p) => [p.id, p.kind]));
		assert(goldCard.length > 0 && goldCard.every((g) => kind[g] === 'card') && whites.every((w) => kind[w] === 'card'), '②マーカー(3) カードが持つ金と、その前段の白はカード', { goldCard, whites: whites.map((w) => w + ':' + kind[w]) });
		assert(goldNot.length > 0 && goldNot.every((g) => kind[g] !== 'card' && kind[g] === ex.kinds[g]), '②マーカー(3) カードが前段の白しか持たない金はカードにしない（★かその他）', goldNot.map((g) => g + ':' + kind[g]));
		assert(ex.viaGold.length > 0, '②マーカー(3) 「金があるので白もカード」になった白がある（検査が空振りしていない）', { viaGold: ex.viaGold });
		await sp.ctx.close();
	});

	await block('②マーカー(4) ①と重なる行・「①で取得」の行も同じ規則で付く／無効の段・星取表の表示だけの金の行には付かない', async () => {
		// C-223 の重なり（①での合計のヒントLv が低い白を②に入れる）が出る編成: ①の6枚と同じカードを列にも保存する
		const R = { umaId: 'uma-0001', cardIds: CARDS6, outsideOptions: { cards: CARDS6 } };
		const ids = GIDS;
		const ex = await expectKinds(R, ids);
		const sp = await openSp({ w: 1280, roster: R, ids });
		const m = await readMarkers(sp.page);
		const special = m.panels.filter((p) => p.overlap || p.taken);
		assert(special.length > 0 && special.every((p) => p.n === 1 && p.kind === ex.kinds[p.id]), '②マーカー(4) ①と重なる行・「①で取得」の行もマーカー1つ・同じ規則', special.map((p) => p.id + ':' + p.kind + (p.overlap ? '(重)' : '') + (p.taken ? '(取)' : '')).slice(0, 6));
		assert(m.offRows > 0 && m.offMarks === 0, '②マーカー(4) カード一覧: 無効の段の行にはマーカーが無い', { offRows: m.offRows, offMarks: m.offMarks });
		await sp.ctx.close();
		const sp2 = await openSp({ w: 1280, roster: RG, ids: GIDS });
		await setView(sp2.page, true);
		const t = await readMarkers(sp2.page);
		assert(t.goldRows > 0 && t.goldMarks === 0 && t.offRows > 0 && t.offMarks === 0, '②マーカー(4) 星取表: 表示だけの金の行・無効の行にはマーカーが無い', { goldRows: t.goldRows, goldMarks: t.goldMarks, offRows: t.offRows, offMarks: t.offMarks });
		await sp2.ctx.close();
	});

	await block('②マーカー(5) ★の一覧が読めないとき: ★の印は出ず（その他）・カードの印はそのまま・コンソールのエラー0', async () => {
		const ex = await expectKinds(R1S, GIDS);
		const sp = await openSp({ w: 1280, roster: R1S, ids: GIDS, route: '**/data/non-support-skills.json*' });
		const errors = [];
		sp.page.on('pageerror', (e) => errors.push(String(e)));
		const m = await readMarkers(sp.page);
		const bad = m.panels.filter((p) => p.kind !== (ex.kinds[p.id] === 'star' ? 'other' : ex.kinds[p.id]));
		assert(bad.length === 0 && m.panels.every((p) => p.kind !== 'star') && Object.values(ex.kinds).some((k) => k === 'star'), '②マーカー(5) ★だった行はその他・ほかは同じ', bad.slice(0, 3));
		assert(jsErrors(errors).length === 0, '②マーカー(5) コンソールのエラー0', jsErrors(errors));
		await sp.ctx.close();
	});

	await block('②マーカー(6) 入口の行: パレットの行は無い／右端の固定の塊は「◎・表の切り替え・削除」（削除が一番右）／1280・390・360px で塊が画面内に見え、横スクロールなし／◎の候補が無いとき◎は出ず、削除の位置は動かない', async () => {
		for (const w of [1280, 390, 360]) {
			const pos = {};
			for (const c of [{ k: '◎あり', roster: R1S, ids: GIDS }, { k: '◎なし', roster: null, ids: ['230'] }]) {
				const sp = await openSp({ w, roster: c.roster, ids: c.ids });
				const r = await sp.page.evaluate(() => {
					const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
					const tools = document.querySelector('#deck-template-panel [data-usd-el="tier-row"]');
					const head = tools ? tools.parentElement : null;
					const entry = head ? head.querySelector('.usd-entry-row') : null;
					return { order: tools ? Array.from(tools.children).map((e) => e.getAttribute('data-usd-el')) : null,
						tools: box(tools), entry: box(entry), del: box(document.querySelector('#deck-template-panel [data-usd-el="factor-view"]')), vw: window.innerWidth,
						overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
						palette: document.querySelectorAll('#deck-template-panel .usd-palette-btn, #deck-template-panel [data-usd-act="skill-icon"], #deck-template-panel .usd-palette').length,
						sameRow: !!(tools && entry && Math.abs((tools.getBoundingClientRect().top + tools.getBoundingClientRect().bottom) / 2 - (entry.getBoundingClientRect().top + entry.getBoundingClientRect().bottom) / 2) < 6) };
				});
				// C-235: 並びは 削除・↺・虫眼鏡・（◎）・表の切り替え（表が一番右。下の del は表の切り替えのボタンの位置）
				const want = ['palette-delete', 'factor-reset', 'entry-search'].concat(c.k === '◎あり' ? ['factor-circle-mode'] : []).concat(['factor-view']);
				assert(JSON.stringify(r.order) === JSON.stringify(want), '②マーカー(6) ' + w + 'px ' + c.k + ': 塊の並びは ' + want.join('・'), r.order);
				assert(r.palette === 0, '②マーカー(6) ' + w + 'px ' + c.k + ': パレット（アイコンの印・行の先頭のアイコンのボタン）は無い', r.palette);
				assert(r.tools && r.del && r.tools.l >= 0 && r.del.r <= r.vw && r.del.r >= r.tools.r - 1 && r.entry.r <= r.tools.l + 1 && r.sameRow && !r.overflowX,
					'②マーカー(6) ' + w + 'px ' + c.k + ': 塊は画面内・表の切り替えが一番右（C-235）・入口のボタンと同じ行で重ならない・横スクロールなし', r);
				pos[c.k] = r.del;
				await sp.ctx.close();
			}
			assert(Math.abs(pos['◎あり'].r - pos['◎なし'].r) < 1 && Math.abs(pos['◎あり'].l - pos['◎なし'].l) < 1, '②マーカー(6) ' + w + 'px: ◎が出ても出なくても表の切り替え（一番右）の位置は同じ', pos);
		}
	});

	await block('②マーカー(7) skillIcons: 読まない（マーカーは保存のアイコンに依らない）・書かない（足す・外す・リセット・元に戻すで保存値と tiers が変わらない）・消さない（書き出しにそのまま）', async () => {
		const icons = { '1': 'a', '2': 'e', '3': 'f' };
		const tiers = { '1': 1, '3': 3 };
		const ud = { schemaVersion: 7, records: [], customSkills: [], rosters: [Object.assign({ rosterId: 'r1', name: 'R', createdAt: 'x', updatedAt: 'x' }, R1S)],
			templates: [{ templateId: 't1', name: 'S1', skillIds: ONE12.slice(), skillIcons: icons, tiers, parentHintLevel: 5, baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }] };
		const sp = await openSp({ w: 1280, userData: ud, roster: R1S, scope: { skillIds: ONE12.slice(), name: '', updatedAt: '', skillIcons: icons, tiers, parentHintLevel: 5 } });
		const st = () => sp.page.evaluate(() => ({ d: JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')), u: JSON.parse(localStorage.getItem('umaSkillDeck:userData')) }));
		const ex = await expectKinds(R1S, ONE12);
		const m = await readMarkers(sp.page);
		assert(m.panels.every((p) => p.kind === ex.kinds[p.id]), '②マーカー(7) 保存のアイコン（◎★✕）があっても、マーカーは判定のとおり', m.panels.map((p) => p.id + ':' + p.kind).slice(0, 4));
		// 足す（無効の行の＋を押す。C-238 から追加は＋だけ）→ 外す（削除のブラシ）→ リセット → 元に戻す
		await sp.page.click(T + '[data-usd-el="factor-off-row"] [data-usd-el="factor-enable"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click(T + '[data-usd-el="palette-delete"]');
		await sp.page.click(T + '.usd-panel[data-skill-id="1"]');
		await sp.page.click(T + '[data-usd-el="palette-delete"]');
		await sp.page.waitForTimeout(300);
		const mid = await st();
		assert(JSON.stringify(mid.d.skillIcons) === JSON.stringify(icons) && JSON.stringify(mid.d.tiers) === JSON.stringify(tiers) && mid.d.skillIds.indexOf('1') === -1 && mid.d.skillIds.length === 12,
			'②マーカー(7) 足す・外すで、下書きの skillIcons と tiers は保存のまま（外したスキルの分も消さない）', { icons: mid.d.skillIcons, tiers: mid.d.tiers, n: mid.d.skillIds.length });
		await sp.page.click(T + '[data-usd-act="factor-reset"]');
		await sp.page.waitForSelector('[data-usd-el="factor-reset-ops"]');
		const ops = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="factor-reset-ops"] button')).map((b) => ({ el: b.getAttribute('data-usd-el'), text: b.textContent })));
		assert(ops.length === 2 && ops[0].el === 'factor-reset-all' && /^スキル\d+種をすべて消す$/.test(ops[0].text) && ops[1].el === 'factor-reset-cancel' && ops[1].text === 'やめる',
			'②マーカー(7) リセットの小窓のボタンは「スキル○種をすべて消す」「やめる」の2つ（「アイコンだけすべて外す」は無い）', ops);
		await sp.page.click('[data-usd-el="factor-reset-all"]');
		await sp.page.waitForTimeout(300);
		const after = await st();
		const resetBtn = await sp.page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-act="factor-reset"]'); return b ? b.disabled : null; });
		assert(after.d.skillIds.length === 0 && JSON.stringify(after.d.skillIcons) === JSON.stringify(icons) && JSON.stringify(after.d.tiers) === JSON.stringify(tiers) && resetBtn === true,
			'②マーカー(7) すべて消すと②は空・skillIcons と tiers は保存のまま・↺ は押せない（アイコンが残っていても）', { ids: after.d.skillIds.length, icons: after.d.skillIcons, resetBtn });
		await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		await sp.page.waitForTimeout(300);
		const und = await st();
		assert(und.d.skillIds.length === 12 && JSON.stringify(und.d.skillIcons) === JSON.stringify(icons), '②マーカー(7) 元に戻すと②が戻り、skillIcons は保存のまま', { n: und.d.skillIds.length });
		// セットに切り替えて、足す・外す
		await sp.ctx.close();
		// セット t1 を開いた状態（直前に開いていたセットの保存キー）で開き直す
		const sp2 = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, ud);
		await sp2.page.evaluate(() => { localStorage.setItem('umaSkillDeck:lastSet:special', 't1'); localStorage.setItem('umaSkillDeck:stepTab', '1'); localStorage.removeItem('umaSkillDeck:draftScope:special'); });
		await reloadReady(sp2.page);
		for (let i = 0; i < 2; i++) if (await sp2.page.isVisible('#ui-notice')) await sp2.page.click('[data-act="notice-ok"]');
		await sp2.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp2.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp2.page.waitForTimeout(500);
		const picked = await sp2.page.evaluate(() => (deckTemplateManager.getSelection() || {}).templateId === 't1' || !!document.querySelector('#deck-template-panel .usd-panel[data-skill-id="2"]'));
		if (picked) {
			await sp2.page.click(T + '[data-usd-el="palette-delete"]');
			await sp2.page.click(T + '.usd-panel[data-skill-id="2"]');
			await sp2.page.waitForTimeout(300);
			const u = await sp2.page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData')).templates[0]);
			assert(u.skillIds.indexOf('2') === -1 && JSON.stringify(u.skillIcons) === JSON.stringify(icons) && JSON.stringify(u.tiers) === JSON.stringify(tiers),
				'②マーカー(7) セット: 外しても skillIcons・tiers は保存のまま（userData＝書き出しの中身にそのまま残る）', { ids: u.skillIds.length, icons: u.skillIcons, tiers: u.tiers });
		}
		assert(picked, '②マーカー(7) セットに切り替えられた', null);
		await sp2.ctx.close();
	});

	await block('②マーカー(8) ③の結果の表: スキルの行の名前の左は自動のマーカー（16px・②と同じ種類）／◎○▲は無い／シナリオ因子◆は残る', async () => {
		const sp = await openSp({ w: 1280, roster: R1S, ids: GIDS });
		const page = sp.page;
		await page.evaluate(() => selectStepTab(2));   // ③の表とシナリオ因子のチェック（③の先頭の行）を見えるように
		await page.waitForTimeout(300);
		await page.click('#deck-scopes-bar [data-usd-act="scope-check"][data-scope="scenarioFactors"]');
		await page.waitForTimeout(400);
		const res = await page.evaluate(() => {
			const mk = (texts) => texts.map((t, i) => ({ text: t, stars: (i % 3) + 1, starsReliable: true, rowKey: 'r' + i }));
			const names = UmaSkillDeckCore.getCatalogEntries('scenarioFactor').map((e) => e.name);
			const lines = mk(skillOnlyList.slice().concat(names.slice(0, 1)));
			personResults[0] = applyFactorStrictMatch(matchAllSkillsWithStars(lines, skillList, skillIndex, {}), lines);
			personLines[0] = lines;
			renderResults();
			const kinds = deckTemplateManager.getMarkerKinds();
			const byName = {};
			UmaSkillDeckCore.getSkillEntries(deckScope.skillIds).forEach((e) => { byName[e.name] = kinds[e.id]; });
			const rows = Array.from(document.querySelectorAll('#result-tbody tr')).filter((r) => r.querySelector('td'));
			const skillNames = new Set(skillOnlyList);
			return rows.map((r) => {
				const td = r.querySelector('td');
				const m = td.querySelector('[data-usd-el="factor-marker"]');
				const name = td.textContent.replace(/^[◆\s]+/, '').trim();
				return { skill: skillNames.has(name), kind: m ? m.dataset.marker : null, want: byName[name] || null, size: m ? Number((m.querySelector('svg') || { getAttribute: () => null }).getAttribute('width')) : null,
					tier: !!td.querySelector('.uma-tier-mark'), diamond: !!td.querySelector('.text-\\[var\\(--uma-mark-catalog\\)\\]') };
			});
		});
		const skills = res.filter((r) => r.skill);
		const bad = skills.filter((r) => !r.kind || r.kind !== r.want || r.size !== 16 || r.tier);
		assert(skills.length === GIDS.length && bad.length === 0, '②マーカー(8) スキルの行はすべて自動のマーカー（16px・getMarkerKinds と同じ種類）・◎○▲ は無い', { n: skills.length, bad: bad.slice(0, 3) });
		assert(new Set(skills.map((r) => r.kind)).size === 3, '②マーカー(8) 3種とも出ている', [...new Set(skills.map((r) => r.kind))]);
		const factors = res.filter((r) => !r.skill);
		assert(factors.length > 0 && factors.every((r) => r.diamond && !r.kind), '②マーカー(8) シナリオ因子の行は◆のまま（マーカーは付かない）', factors.slice(0, 2));
		await sp.ctx.close();
	});

	await block('②マーカー(9) ダーク: マーカーの色はダークのトークン（外枠・内側）・記号は白／ライトと違う値', async () => {
		const read = async (theme) => {
			const sp = await openSp({ w: 390, roster: R1S, ids: GIDS });
			await sp.page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
			await sp.page.waitForTimeout(100);
			const r = await sp.page.evaluate(() => {
				const out = {};
				['card', 'star', 'other'].forEach((k) => {
					const m = document.querySelector('#deck-template-panel [data-usd-el="factor-marker"][data-marker="' + k + '"]');
					if (!m) return;
					out[k] = { edge: getComputedStyle(m.querySelector('.usd-mk-edge')).fill, fill: getComputedStyle(m.querySelector('.usd-mk-fill')).fill, sym: getComputedStyle(m.querySelector('.usd-mk-symbol'))[k === 'other' ? 'stroke' : 'fill'] };
				});
				const list = UmaSkillDeckCore.markers.list;
				return { out, list };
			});
			await sp.ctx.close();
			return r;
		};
		const hex = (c) => { const m = c.match(/\d+/g); return '#' + m.slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase(); };
		const L = await read('light'), D = await read('dark');
		const bad = [];
		L.list.forEach((m) => {
			['light', 'dark'].forEach((t) => {
				const got = (t === 'light' ? L : D).out[m.id];
				if (!got || hex(got.edge) !== m[t].edge.toUpperCase() || hex(got.fill) !== m[t].fill.toUpperCase() || hex(got.sym) !== '#FFFFFF') bad.push({ id: m.id, t, got });
			});
			if (m.light.fill.toUpperCase() === m.dark.fill.toUpperCase()) bad.push({ id: m.id, why: 'same' });
		});
		assert(bad.length === 0 && Object.keys(L.out).length === 3, '②マーカー(9) ライト・ダークとも、外枠・内側は core のトークンの値・記号は白／ダークの値はライトと違う', bad);
		assert(L.list.map((m) => m.light.fill.toUpperCase()).join() === '#008070,#9C6A00,#7A3FB0', '②マーカー(9) ライトの色は決定の値（青緑 #008070・琥珀 #9C6A00・紫 #7A3FB0）', L.list.map((m) => m.light.fill));
		assert(L.list.every((m) => !/遺伝子/.test(m.label)), '②マーカー(9) 呼び名に「遺伝子」の語を使わない', L.list.map((m) => m.label));
	});
}
