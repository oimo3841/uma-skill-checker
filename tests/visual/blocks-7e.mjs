// 段7e（2026-10-03・C-118）の検査。run-smoke.mjs の末尾から register7e() で呼ばれる（塊の見出しはすべて「段7e」を含む。
// `npm run test:visual -- --only=段7e` で全部、`--only=段7e(1)` のように括弧つきの見出しで1つずつ回せる）。
//
//   (1) 並び … 金スキルの直下にその前段の白スキル（既定の並び・並べ替え・前段が表に無いとき・複数の金スキルの前段になる白・字下げ）
//   (2)〜(5) 色 … 回復／パッシブ／デバフ／固有／金と、その重なり（実データの編成で全行を独立に判定し、重なる例は仮のタグで固める）
//   (6) コントラスト比 4.5 以上（実際に描かれた色で）／行の高さ・表より上の高さが増えていないこと
//
// 判定の期待値は、データ（マスター・拡張スキルの tags と skill-pt.json の rarity と skill-step-up.json）から検査の側で独立に求める。
// 検査がデータを名前で引くのは構わない（恒久ルール1は製品のコードの話）。
import { avgColor, deltaE, contrastRatio } from './lib/pixels.mjs';

export async function register7e(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const cardsAll = readJson('data/support-cards.json').entries;
	const masterDoc = readJson('uma-skill-deck-skills.json');
	const master = masterDoc.skills;
	const ext = readJson('data/extended-skills.json').entries;
	const ptReal = readJson('data/skill-pt.json');
	const stepReal = readJson('data/skill-step-up.json');
	const scenReal = readJson('data/scenario-event-skills.json');
	const byId = new Map(master.map((s) => [s.id, s]));
	const nameOf = (id) => (master.find((s) => s.id === id) || ext.find((s) => s.id === id) || {}).name;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const P = '#deck-roster-panel ';
	const rgb = (s) => (/rgba?\((\d+), (\d+), (\d+)/.exec(s) || []).slice(1, 4).map(Number);
	const COLORS = { healBg: [230, 243, 253], healText: [11, 95, 165], passiveText: [27, 122, 58], debuffText: [179, 38, 30], uniqFrom: [227, 246, 230], uniqMid: [223, 241, 251], uniqTo: [251, 227, 241], uniqEdge: 'rgb(240, 168, 208)' };

	/* ---- 実データの編成（回復・パッシブ・デバフ・固有・金が1枚に見える。育成ウマ娘の固有スキル＋カード6枚＋シナリオ『トレセン軒』） ---- */
	const REAL = { umaId: 'uma-0001', cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'] };
	const rarityOf = new Map(ptReal.entries.map((e) => [e.skillId, e.rarity]));
	const prevOf = new Map(stepReal.entries.map((e) => [e.skillId, e.prevSkillIds]));
	const tagsOf = (id) => { const s = byId.get(id) || ext.find((x) => x.id === id); return (s && s.tags) || {}; };
	const kindOf = (id) => {
		const t = tagsOf(id), e = t.effect || [];
		return { heal: e.includes('stamina'), debuff: e.includes('debuff') || e.includes('temptation_time'), passive: (t.passive || []).length > 0, rarity: rarityOf.get(id) || null };
	};

	const openReal = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, USER_DATA);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		if (o.stepDoc) await sp.page.route('**/data/skill-step-up.json*', (r) => r.fulfill(json(o.stepDoc)));
		if (o.masterDoc) await sp.page.route('**/uma-skill-deck-skills.json*', (r) => r.fulfill(json(o.masterDoc)));
		if (o.ptDoc) await sp.page.route('**/data/skill-pt.json*', (r) => r.fulfill(json(o.ptDoc)));
		if (o.evDoc) await sp.page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill(json(o.evDoc)));
		await sp.page.evaluate(({ roster }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { roster: o.roster || REAL });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(P + '.usd-roster-grow[data-skill-id]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(250);
		return sp;
	};
	/** 表の行を、表示されている順に読む（id・クラス・名前の色・各セルの地・字下げ・高さ・○の列） */
	const readRows = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')).map((r) => {
		const cells = Array.from(r.querySelectorAll('[role="cell"], [role="rowheader"]'));
		const nm = r.querySelector('.usd-roster-skillname');
		const first = cells[0];
		const cs = getComputedStyle(first);
		const rcs = getComputedStyle(r);
		const pt = r.querySelector('.usd-roster-pt');
		return { id: r.getAttribute('data-skill-id'), cls: r.className, nameCls: nm.className, nameColor: getComputedStyle(nm).color, ptColor: pt && !pt.classList.contains('usd-roster-pt--ref') ? getComputedStyle(pt).color : null,   // 薄い△の参考値（--ref）は対象外
			bgs: cells.map((c) => getComputedStyle(c).backgroundColor), padL: parseFloat(cs.paddingLeft), h: Math.round(first.getBoundingClientRect().height * 10) / 10, off: r.classList.contains('usd-roster-grow--off'),
			marks: cells.slice(1).map((c) => (c.querySelector('.usd-roster-got') ? '●' : c.querySelector('.usd-roster-maybe') ? '△' : '')),
			rowBgImage: rcs.backgroundImage, outline: rcs.outlineStyle + ' ' + rcs.outlineWidth + ' ' + rcs.outlineColor, outlineOffset: rcs.outlineOffset, rowDisplay: rcs.display,
			rect: (() => { const b = r.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; })() };
	}));
	const gridTop = (page) => page.evaluate(() => Math.round(document.querySelector('#deck-roster-panel .usd-roster-grid-wrap').getBoundingClientRect().top + scrollY));

	/* ====================================================================
	 * (1) 並び: 金スキルの直下に、その前段の白スキル
	 * ==================================================================== */
	await block('段7e(1) 並び（金スキルの直下に前段の白スキル）', async () => {
		/* ---- 仮の材料（blocks-7d と同じ作り）: カード2枚に、金スキルと前段の白スキルが別の列に出るように置く ---- */
		const hintOk = cardsAll.filter((c) => c.dataStatus && c.dataStatus.hint === 'done' && (c.hintSkills || []).length > 0 && c.hintSkills.every((h) => byId.has(h.skillId) && !byId.get(h.skillId).raceDistance));
		const [cA, cB] = [hintOk[0], hintOk[1]];
		const hinted = new Set([cA, cB].flatMap((c) => c.hintSkills.map((s) => s.skillId)));
		const W = master.filter((s) => !hinted.has(s.id) && s.tags && (s.tags.style || []).length === 0 && (s.tags.surface || []).length === 0 && (s.tags.passive || []).length === 0 && (s.tags.distance || []).length === 0 && !s.raceDistance).slice(0, 12).map((s) => s.id);
		const ref = (id, lv) => ({ skillId: id, name: nameOf(id), hintLevel: lv });
		// 全部●（選択肢が1つ）。A の列: W0〜W4／B の列: W5〜W8
		const evDoc = { dataVersion: '2026-10-03a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries: [
			{ cardId: cA.id, status: 'done', chain: [{ step: 1, choices: [{ skills: [ref(W[0], 1), ref(W[1], 1)] }] }, { step: 2, choices: [{ skills: [ref(W[2], 1), ref(W[3], 1), ref(W[4], 1)] }] }] },
			{ cardId: cB.id, status: 'done', chain: [{ step: 1, choices: [{ skills: [ref(W[5], 1), ref(W[6], 1)] }] }, { step: 2, choices: [{ skills: [ref(W[7], 1), ref(W[8], 1)] }] }] },
		] };
		const hintIds = [...hinted];
		const BASE = Object.fromEntries(W.slice(0, 9).map((id, i) => [id, 100 + i * 10]));
		hintIds.forEach((id) => { BASE[id] = 50; });
		const RAR = (golds) => Object.fromEntries(golds.map((g) => [g, 'gold']));
		const mkPt = (golds) => ({ dataVersion: '2026-10-03a', category: 'skillPt', note: 'テスト用の仕込み', entries: Object.keys(BASE).map((skillId) => ({ skillId, pt: BASE[skillId], rarity: RAR(golds)[skillId] || 'white' })) });
		const mkStep = (entries) => ({ dataVersion: '2026-10-03a', category: 'skillStepUp', note: 'テスト用の仕込み', entries });
		const emptyChar = { dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] };
		const descDoc = { dataVersion: '2026-10-03a', category: 'skillDescription', note: 'テスト用の仕込み', entries: Object.keys(BASE).map((skillId) => ({ skillId, text: '説明' })) };
		const open = async (o) => {
			const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, USER_DATA);
			await sp.page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill(json(evDoc)));
			await sp.page.route('**/data/character-event-skills.json*', (r) => r.fulfill(json(emptyChar)));
			await sp.page.route('**/data/skill-pt.json*', (r) => r.fulfill(json(mkPt(o.golds))));
			await sp.page.route('**/data/skill-step-up.json*', (r) => r.fulfill(json(mkStep(o.step || []))));
			await sp.page.route('**/data/skill-descriptions.json*', (r) => r.fulfill(json(descDoc)));
			await sp.page.evaluate(({ cards }) => {
				localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ umaId: '', cardIds: cards }));
				localStorage.removeItem('umaSkillDeck:draftScope:special');
				localStorage.setItem('umaSkillDeck:stepTab', '0');
			}, { cards: [cA.id, cB.id, null, null, null, null] });
			await sp.page.reload({ waitUntil: 'networkidle' });
			for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
			await sp.page.waitForSelector(P + '.usd-roster-grow[data-skill-id]', { timeout: 10000 }).catch(() => {});
			await sp.page.waitForTimeout(250);
			return sp;
		};
		/** 期待する並び: 元の並び（前段データなし）から、金スキルの直下へ前段の白を移す（独立に計算） */
		const expectOrder = (baseline, golds, step) => {
			const inTable = new Set(baseline);
			const moved = new Set();
			const under = new Map();
			baseline.forEach((id) => {
				if (!golds.includes(id)) return;
				const ws = [];
				((step.find((e) => e.skillId === id) || {}).prevSkillIds || []).forEach((p) => { if (inTable.has(p) && !golds.includes(p) && !moved.has(p)) { moved.add(p); ws.push(p); } });
				if (ws.length) under.set(id, ws);
			});
			return { order: baseline.filter((id) => !moved.has(id)).flatMap((id) => [id].concat(under.get(id) || [])), moved };
		};

		// 既定の並び: 金 W3（A の列）の前段が W7（B の列）／金 W6（B の列）の前段が W7 と W9（W9 は表に無い）／金 W1 の前段が W8（B の列）／W2 は金で前段が表に無い W9
		const golds = [W[3], W[6], W[1], W[2]];
		const step = [{ skillId: W[3], prevSkillIds: [W[7]] }, { skillId: W[6], prevSkillIds: [W[7], W[9]] }, { skillId: W[1], prevSkillIds: [W[8]] }, { skillId: W[2], prevSkillIds: [W[9]] }];
		for (const w of [375, 1280]) {
			const tag = '段7e(1) ' + w + 'px: ';
			let sp = await open({ w, h: w === 375 ? 812 : 900, golds, step: [] });
			const baseRows = await readRows(sp.page);
			const baseline = baseRows.map((r) => r.id);
			await sp.ctx.close();
			assert(baseline.includes(W[3]) && baseline.includes(W[7]) && baseline.includes(W[8]) && !baseline.includes(W[9]), tag + '前提: 表に金 W3・W6・W1・W2 と前段の白 W7・W8 が出ていて、W9 は表に無い（前段が表に無いケース）', baseline.length);
			sp = await open({ w, h: w === 375 ? 812 : 900, golds, step });
			const rows = await readRows(sp.page);
			const exp = expectOrder(baseline, golds, step);
			assert(rows.map((r) => r.id).join() === exp.order.join(), tag + '既定の並び: 金スキルの直下に前段の白が来る。それ以外の行の並びは元のまま（独立に計算した並びと一致）', { got: rows.map((r) => r.id).slice(0, 14), want: exp.order.slice(0, 14) });
			const idx = (id) => rows.findIndex((r) => r.id === id);
			assert(idx(W[7]) === idx(W[3]) + 1 || idx(W[7]) === idx(W[6]) + 1, tag + '金 W3 と W6 の両方の前段になる白 W7 は、先に出る金スキルの直下に1回だけ出る', { w3: idx(W[3]), w6: idx(W[6]), w7: idx(W[7]), n: rows.filter((r) => r.id === W[7]).length });
			assert(idx(W[8]) === idx(W[1]) + 1, tag + '金 W1 の直下に前段の白 W8', { w1: idx(W[1]), w8: idx(W[8]) });
			assert(rows.length === baseRows.length && new Set(rows.map((r) => r.id)).size === rows.length, tag + '行は増えも減りもしない（' + rows.length + '行）');
			// 前段の行の見た目: 名前を左へ 4px 字下げするだけ（クラス --prev）。ほかは変えない
			const prevRows = rows.filter((r) => r.cls.includes('usd-roster-grow--prev'));
			const normal = rows.find((r) => !r.cls.includes('usd-roster-grow--prev'));
			assert(prevRows.map((r) => r.id).sort().join() === Array.from(exp.moved).sort().join() && prevRows.every((r) => Math.abs(r.padL - normal.padL - 4) < 0.5 && r.h === normal.h),
				tag + '動かした前段の白の行だけ名前が 4px 字下げ（左の余白 ' + normal.padL + 'px → ' + (prevRows[0] && prevRows[0].padL) + 'px）。行の高さは同じ（' + normal.h + 'px）', { prev: prevRows.map((r) => [r.id, r.padL, r.h]), normal: [normal.padL, normal.h] });
			// 並べ替え（↕）でも隣り合わせ: B の列（キー '2'）を押す。W3（A の列）と前段 W7（B の列）の組は、W7 に○があるので組ごと上へ
			const colMarks = (rs, k) => new Map(rs.map((r) => [r.id, r.marks[k]]));   // k: 0=育成ウマ娘の列, 1=カード1, 2=カード2 …
			const mark = colMarks(rows, 2);
			await sp.page.click(P + '[data-usd-el="sort-btn"][data-member-key="2"]');
			await sp.page.waitForTimeout(250);
			const sorted = await readRows(sp.page);
			// 期待: 元の単位（既定の並びの単位）を、「組のどれかに B の列の印がある」ものを先に（安定ソート）
			const units = [];
			exp.order.forEach((id) => { if (exp.moved.has(id)) units[units.length - 1].push(id); else units.push([id]); });
			const hit = (u) => u.some((id) => mark.get(id));
			const wantSorted = units.filter(hit).concat(units.filter((u) => !hit(u))).flat();
			assert(sorted.map((r) => r.id).join() === wantSorted.join(), tag + 'B の列で並べ替え: 組（金＋前段の白）は組のどちらかに印があれば組ごと上へ。残りは元の順（安定ソート）', { got: sorted.map((r) => r.id).slice(0, 12), want: wantSorted.slice(0, 12) });
			const sidx = (id) => sorted.findIndex((r) => r.id === id);
			assert(sidx(W[3]) >= 0 && (sidx(W[7]) === sidx(W[3]) + 1 || sidx(W[7]) === sidx(W[6]) + 1) && sidx(W[8]) === sidx(W[1]) + 1, tag + '並べ替えのあとも金スキルと前段の白は隣り合わせ（W7 は A の列に印の無い金 W3 の組にいても、B の列に印があるので組ごと上）', { w3: sidx(W[3]), w7: sidx(W[7]), w6: sidx(W[6]), w1: sidx(W[1]), w8: sidx(W[8]) });
			const aloneHit = units.find((u) => u.length === 2 && !mark.get(u[0]) && mark.get(u[1]));
			if (aloneHit) assert(sidx(aloneHit[0]) < wantSorted.length && sidx(aloneHit[0]) <= sorted.findIndex((r) => !hit(units.find((u) => u.includes(r.id)))) , tag + '金の側に印が無く、前段の白の側にだけ印がある組（' + aloneHit.join('+') + '）も、組ごと上に寄る', { aloneHit });
			await sp.page.click(P + '[data-usd-el="sort-btn"][data-member-key="2"]');   // もう一度で戻る
			await sp.page.waitForTimeout(250);
			assert((await readRows(sp.page)).map((r) => r.id).join() === exp.order.join(), tag + 'もう一度押すと既定の並びに戻る');
			// 金スキルの直下の前段の行も、取得のチェックが効く（合計・種数の計算は変えていない）
			const prevId = prevRows[0].id;
			await sp.page.click(P + '.usd-roster-grow[data-skill-id="' + prevId + '"] input[data-usd-act="take-skill"]');
			const after = await readRows(sp.page);
			assert(after.find((r) => r.id === prevId).off && after.map((r) => r.id).join() === exp.order.join(), tag + '前段の行のチェックを外すと「取得しない」になり、並びは変わらない', after.find((r) => r.id === prevId));
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}

		// 前段が表に無いときは何もしない（並びは前段データなしと同じ）
		{
			const sp0 = await open({ golds: [W[2]], step: [] });
			const b0 = (await readRows(sp0.page)).map((r) => r.id);
			await sp0.ctx.close();
			const sp1 = await open({ golds: [W[2]], step: [{ skillId: W[2], prevSkillIds: [W[9]] }] });
			const r1 = await readRows(sp1.page);
			assert(r1.map((x) => x.id).join() === b0.join() && !r1.some((x) => x.cls.includes('usd-roster-grow--prev')), '段7e(1): 前段の白が表に出ていない金スキルは、何も動かさない・字下げの行も出ない', { n: r1.length });
			await sp1.ctx.close();
		}

		// 実データ: 表のすべての金スキルについて、前段の白が表にあれば直下にいる（シナリオ『トレセン軒』の 時中の妙＋中盤巧者／極上の感謝を！＋恩返し、召し上がれ を含む）
		{
			const sp = await openReal({ w: 375 });
			const rows = await readRows(sp.page);
			const ids = rows.map((r) => r.id);
			let pairs = 0;
			const bad = [];
			rows.forEach((r, i) => {
				if (rarityOf.get(r.id) !== 'gold') return;
				(prevOf.get(r.id) || []).forEach((p) => { if (ids.includes(p) && rarityOf.get(p) !== 'gold') { pairs++; if (ids[i + 1] !== p && ids.indexOf(p) !== i + 1) bad.push([r.id, p, ids.indexOf(p) - i]); } });
			});
			// 1つの白が複数の金スキルの前段になっている場合は、先に出る金の直下にだけ置く（そうでないものを bad に数える）
			const sharedWhites = new Map();
			rows.forEach((r) => { if (rarityOf.get(r.id) === 'gold') (prevOf.get(r.id) || []).forEach((p) => { if (ids.includes(p) && rarityOf.get(p) !== 'gold') sharedWhites.set(p, (sharedWhites.get(p) || 0) + 1); }); });
			const multi = Array.from(sharedWhites.values()).filter((n) => n > 1).length;
			assert(pairs >= 8 && bad.filter(([g, p]) => (sharedWhites.get(p) || 0) <= 1).length === 0, '段7e(1) 実データ: 表の金スキル→前段の白の ' + pairs + ' 組がすべて直下に並ぶ（前段が表に無いものは動かない）', bad);
			for (const [g, p] of [['ex-0616', '236'], ['ex-0698', '439']]) assert(ids.indexOf(p) === ids.indexOf(g) + 1, '段7e(1) 実データ: シナリオ『トレセン軒』の ' + nameOf(g) + ' の直下に前段の ' + nameOf(p), { g: ids.indexOf(g), p: ids.indexOf(p) });
			console.log('     [実測] 実データの編成の表で、複数の金スキルの前段になっている白スキル: ' + multi + ' 件（データ全体でも 0 件）');
			assert(jsErrors(sp.errors).length === 0, 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * (2)〜(6) 色分けとコントラスト
	 * ==================================================================== */
	await block('段7e(2)〜(6) 色分け（回復・パッシブ・デバフ・固有・金）とコントラスト比', async () => {
		const UNIQ_BG = (page) => page;   // 読みやすさのための印（固有の地はグラデーション）
		void UNIQ_BG;
		// 実データの編成: すべての行を、データ（tags・rarity）から独立に判定して、色を突き合わせる
		for (const w of [375, 1280]) {
			const tag = '段7e(2)〜(5) ' + w + 'px: ';
			const sp = await openReal({ w, h: w === 375 ? 812 : 900 });
			const rows = await readRows(sp.page);
			const stitch = await sp.page.evaluate(() => { const d = document.createElement('i'); d.style.background = 'var(--uma-stitch-soft)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
			const head = await sp.page.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--uma-text-heading)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
			const defaultName = rows.find((r) => { const k = kindOf(r.id); return !k.heal && !k.debuff && !k.passive && !r.off; }).nameColor;
			const kinds = { heal: 0, debuff: 0, passive: 0, gold: 0, unique: 0, goldHeal: 0, plain: 0 };
			const bad = [];
			rows.forEach((r) => {
				const k = kindOf(r.id);
				if (r.off) return;
				const wantText = k.heal ? rgb('rgb(11, 95, 165)') : k.debuff ? rgb('rgb(179, 38, 30)') : k.passive ? rgb('rgb(27, 122, 58)') : rgb(defaultName);
				if (rgb(r.nameColor).join() !== wantText.join()) bad.push([r.id, 'text', r.nameColor]);
				const cellBg = r.bgs.slice(1).filter((_, i) => true);
				if (k.rarity === 'unique') {
					// 固有: 行の地がグラデーション・セルは透明・縁は 1px のピンク
					if (!(r.rowBgImage.includes('linear-gradient') && r.bgs.every((b) => b === 'rgba(0, 0, 0, 0)') && r.outline === 'solid 1px ' + COLORS.uniqEdge)) bad.push([r.id, 'unique', r.rowBgImage.slice(0, 40), r.outline]);
				} else if (k.rarity === 'gold') {
					if (!r.bgs.every((b) => b === stitch)) bad.push([r.id, 'gold-bg', r.bgs[0]]);
				} else if (k.heal) {
					if (!r.bgs.every((b) => rgb(b).join() === COLORS.healBg.join())) bad.push([r.id, 'heal-bg', r.bgs[0]]);
				} else if (r.bgs.some((b) => b === stitch || rgb(b).join() === COLORS.healBg.join())) bad.push([r.id, 'plain-bg', r.bgs[0]]);
				if (r.rowDisplay === 'grid' && k.rarity !== 'unique') bad.push([r.id, 'grid']);
				void cellBg;
				kinds[k.rarity === 'unique' ? 'unique' : k.rarity === 'gold' ? (k.heal ? 'goldHeal' : 'gold') : k.heal ? 'heal' : k.debuff ? 'debuff' : k.passive ? 'passive' : 'plain']++;
				if (k.rarity === 'gold' && !k.heal) kinds.gold += 0;
			});
			assert(bad.length === 0, tag + '表の ' + rows.length + ' 行すべてで、名前の色と地が独立の判定（tags・rarity）と一致する', bad.slice(0, 5));
			assert(kinds.heal >= 3 && kinds.debuff >= 2 && kinds.passive >= 3 && kinds.gold >= 3 && kinds.unique >= 1 && kinds.goldHeal >= 1, tag + '空振りでない: 回復 ' + kinds.heal + '／デバフ ' + kinds.debuff + '／パッシブ ' + kinds.passive + '／金 ' + kinds.gold + '／固有 ' + kinds.unique + '／金で回復 ' + kinds.goldHeal + '（行の色は上の判定どおり）', kinds);
			const goldHeal = rows.find((r) => { const k = kindOf(r.id); return k.rarity === 'gold' && k.heal; });
			assert(goldHeal && goldHeal.bgs.every((b) => b === stitch) && rgb(goldHeal.nameColor).join() === COLORS.healText.join(), tag + '金で回復のスキル（' + (goldHeal && nameOf(goldHeal.id)) + '）: 行の地は金のまま、名前だけ青', goldHeal && [goldHeal.bgs[0], goldHeal.nameColor]);
			assert(rgb(head).join() !== COLORS.healText.join() && rgb(defaultName).join() === rgb(head).join(), tag + '色の付かない行の名前は既定の濃さのまま');
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}

		// 重なる組み合わせ（仮のタグで固める）: 地は 固有 > 金 > 回復、文字は 回復 > デバフ > パッシブ。取得しない行は今までの見た目
		{
			const tag = '段7e(5) 重なり: ';
			const hintOk = cardsAll.filter((c) => c.dataStatus && c.dataStatus.hint === 'done' && (c.hintSkills || []).length > 0 && c.hintSkills.every((h) => byId.has(h.skillId) && !byId.get(h.skillId).raceDistance));
			const [cA, cB] = [hintOk[0], hintOk[1]];
			const hinted = new Set([cA, cB].flatMap((c) => c.hintSkills.map((s) => s.skillId)));
			const W = master.filter((s) => !hinted.has(s.id) && s.tags && (s.tags.style || []).length === 0 && (s.tags.surface || []).length === 0 && (s.tags.passive || []).length === 0 && (s.tags.distance || []).length === 0 && !s.raceDistance).slice(0, 12).map((s) => s.id);
			const ref = (id, lv) => ({ skillId: id, name: nameOf(id), hintLevel: lv });
			const evDoc = { dataVersion: '2026-10-03a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries: [
				{ cardId: cA.id, status: 'done', chain: [{ step: 1, choices: [{ skills: [ref(W[0], 1), ref(W[1], 1), ref(W[2], 1), ref(W[3], 1)] }] }] },
				{ cardId: cB.id, status: 'done', chain: [{ step: 1, choices: [{ skills: [ref(W[4], 1), ref(W[5], 1), ref(W[6], 1), ref(W[7], 1), ref(W[8], 1)] }] }] }] };
			// 仮のタグ: W0 固有＋回復／W1 金＋回復／W2 回復＋デバフ／W3 デバフ＋パッシブ／W4 パッシブ／W5 金＋パッシブ／W6 固有／W7 金＋デバフ／W8 取得しない（回復＋金）
			const SPEC = { [W[0]]: { r: 'unique', heal: 1 }, [W[1]]: { r: 'gold', heal: 1 }, [W[2]]: { r: 'white', heal: 1, debuff: 1 }, [W[3]]: { r: 'white', debuff: 1, passive: 1 }, [W[4]]: { r: 'white', passive: 1 },
				[W[5]]: { r: 'gold', passive: 1 }, [W[6]]: { r: 'unique' }, [W[7]]: { r: 'gold', debuff: 1 }, [W[8]]: { r: 'gold', heal: 1 } };
			const md = JSON.parse(JSON.stringify(masterDoc));
			md.skills.forEach((s) => {
				const sp = SPEC[s.id];
				if (!sp) return;
				s.tags.effect = [].concat(sp.heal ? ['stamina'] : [], sp.debuff ? ['debuff'] : []);
				s.tags.passive = sp.passive ? ['passive'] : [];
			});
			const ptDoc = { dataVersion: '2026-10-03a', category: 'skillPt', note: 'テスト用の仕込み', entries: [...hinted].map((skillId) => ({ skillId, pt: 50, rarity: 'white' })).concat(Object.keys(SPEC).map((skillId) => ({ skillId, pt: SPEC[skillId].r === 'unique' ? 0 : 120, rarity: SPEC[skillId].r }))) };
			const emptyChar = { dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] };
			const sp = await openReal({ w: 375, roster: { umaId: '', cardIds: [cA.id, cB.id, null, null, null, null] }, masterDoc: md, ptDoc, evDoc, stepDoc: { dataVersion: '2026-10-03a', category: 'skillStepUp', entries: [] } });
			await sp.page.route('**/data/character-event-skills.json*', (r) => r.fulfill(json(emptyChar)));
			await sp.page.click(P + '.usd-roster-grow[data-skill-id="' + W[8] + '"] input[data-usd-act="take-skill"]');   // W8 は取得しない
			await sp.page.waitForTimeout(200);
			const rows = await readRows(sp.page);
			const stitch = await sp.page.evaluate(() => { const d = document.createElement('i'); d.style.background = 'var(--uma-stitch-soft)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
			const R = (id) => rows.find((r) => r.id === id);
			const isText = (r, c) => rgb(r.nameColor).join() === c.join();
			const defaultName = rows.find((r) => !SPEC[r.id] && !r.off).nameColor;
			assert(R(W[0]).rowBgImage.includes('linear-gradient') && R(W[0]).bgs.every((b) => b === 'rgba(0, 0, 0, 0)') && isText(R(W[0]), COLORS.healText), tag + '固有で回復: 地は固有のグラデーション（回復の水色ではない）、名前は青', R(W[0]) && [R(W[0]).nameColor, R(W[0]).rowBgImage.slice(0, 30)]);
			assert(R(W[1]).bgs.every((b) => b === stitch) && isText(R(W[1]), COLORS.healText), tag + '金で回復: 地は金のまま、名前だけ青', [R(W[1]).bgs[0], R(W[1]).nameColor]);
			assert(R(W[2]).bgs.every((b) => rgb(b).join() === COLORS.healBg.join()) && isText(R(W[2]), COLORS.healText), tag + '回復でデバフ: 地は水色、名前は 回復 > デバフ で青', [R(W[2]).bgs[0], R(W[2]).nameColor]);
			assert(isText(R(W[3]), COLORS.debuffText) && R(W[3]).bgs.every((b) => b !== stitch && rgb(b).join() !== COLORS.healBg.join() && b !== 'rgba(0, 0, 0, 0)'), tag + 'デバフでパッシブ: 名前は デバフ > パッシブ で赤（地は変えない）', [R(W[3]).nameColor, R(W[3]).bgs[0]]);
			assert(isText(R(W[4]), COLORS.passiveText), tag + 'パッシブだけ: 名前は緑', R(W[4]).nameColor);
			assert(R(W[5]).bgs.every((b) => b === stitch) && isText(R(W[5]), COLORS.passiveText), tag + '金でパッシブ: 地は金、名前は緑', [R(W[5]).bgs[0], R(W[5]).nameColor]);
			assert(R(W[6]).rowBgImage.includes('linear-gradient') && rgb(R(W[6]).nameColor).join() === rgb(defaultName).join() && R(W[6]).outline === 'solid 1px ' + COLORS.uniqEdge, tag + '固有だけ: グラデーション＋1px のピンクの縁、名前は既定の濃さ', [R(W[6]).nameColor, R(W[6]).outline]);
			assert(R(W[7]).bgs.every((b) => b === stitch) && isText(R(W[7]), COLORS.debuffText), tag + '金でデバフ: 地は金、名前は赤', [R(W[7]).bgs[0], R(W[7]).nameColor]);
			assert(R(W[8]).off && !R(W[8]).nameCls.includes('--heal') && R(W[8]).bgs.every((b) => b !== stitch && b !== 'rgb(255, 255, 255)') , tag + '取得しない行は今までの見た目（地は沈んだ灰、名前に色は付けない）', [R(W[8]).bgs[0], R(W[8]).nameCls]);
			assert(rows.every((r) => r.h === rows[0].h), tag + '固有の行（箱）も含め、すべての行が同じ高さ（' + rows[0].h + 'px）', rows.map((r) => r.h));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * 固有スキルの見た目（グラデーションの向きと縁）／コントラスト比／高さ
	 * ==================================================================== */
	await block('段7e(4)(6)(7) 固有のグラデーション・コントラスト比・行の高さ', async () => {
		for (const w of [375, 1280]) {
			const tag = '段7e(4)(6) ' + w + 'px: ';
			const sp = await openReal({ w, h: w === 375 ? 812 : 900 });
			const rows = await readRows(sp.page);
			const uniq = rows.find((r) => kindOf(r.id).rarity === 'unique');
			assert(!!uniq && uniq.rowDisplay === 'grid' && uniq.outlineOffset === '-1px', tag + '固有の行（' + (uniq && nameOf(uniq.id)) + '）は箱（subgrid）になり、縁は outline（高さを変えない。offset -1px）', uniq && [uniq.rowDisplay, uniq.outlineOffset]);
			// グラデーションの向き: 行の左端付近は淡い緑、右端付近は淡いピンク（描かれた画素で見る）
			await sp.page.evaluate((id) => { document.querySelector('#deck-roster-panel .usd-roster-grow[data-skill-id="' + id + '"]').scrollIntoView({ block: 'center' }); }, uniq.id);
			await sp.page.waitForTimeout(200);
			const r = await sp.page.evaluate((id) => { const b = document.querySelector('#deck-roster-panel .usd-roster-grow[data-skill-id="' + id + '"]').getBoundingClientRect(); const wrap = document.querySelector('#deck-roster-panel .usd-roster-grid-wrap').getBoundingClientRect(); return { l: Math.max(b.left, wrap.left), r: Math.min(b.right, wrap.right), t: b.top, b: b.bottom }; }, uniq.id);
			const shot = (x, y) => sp.page.screenshot({ clip: { x, y, width: 3, height: 3 } });
			const leftC = avgColor(await shot(r.l + 3, r.t + 3)), rightC = avgColor(await shot(r.r - 8, r.t + 3));
			const dl = deltaE(leftC, COLORS.uniqFrom), dr = deltaE(rightC, COLORS.uniqTo);
			assert(dl < 6 && dr < 8 && dl < deltaE(leftC, COLORS.uniqTo) && dr < deltaE(rightC, COLORS.uniqFrom), tag + '固有の行は、左端が淡い緑（#e3f6e6）、右端が淡いピンク（#fbe3f1）に描かれる（左から右へ。ΔE ' + dl.toFixed(1) + '／' + dr.toFixed(1) + '）', { leftC, rightC });
			// コントラスト比（文字と地のすべての組み合わせ）: 名前・Pt の文字 × 行の地（固有はグラデーションの3つの色）
			const stitchRgb = rgb(await sp.page.evaluate(() => { const d = document.createElement('i'); d.style.background = 'var(--uma-stitch-soft)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; }));
			const pairs = new Map();
			const add = (name, fg, bgs) => bgs.forEach((bg) => { const k = name + ' ' + fg.join(',') + ' / ' + bg.join(','); pairs.set(k, contrastRatio(fg, bg)); });
			rows.forEach((row) => {
				if (row.off) return;
				const kd = kindOf(row.id);
				const bgs = kd.rarity === 'unique' ? [COLORS.uniqFrom, COLORS.uniqMid, COLORS.uniqTo] : kd.rarity === 'gold' ? [stitchRgb] : kd.heal ? [COLORS.healBg] : [[255, 255, 255]];
				add('名前', rgb(row.nameColor), bgs);
				if (row.ptColor) add('Pt', rgb(row.ptColor), bgs);
			});
			// 色の付く文字は、それぞれが乗りうるすべての地（白・金・水色・固有の3色）で確かめる
			const allBgs = [[255, 255, 255], stitchRgb, COLORS.healBg, COLORS.uniqFrom, COLORS.uniqMid, COLORS.uniqTo];
			add('回復の青', COLORS.healText, allBgs);
			add('パッシブの緑', COLORS.passiveText, [[255, 255, 255], stitchRgb]);
			add('デバフの赤', COLORS.debuffText, [[255, 255, 255], stitchRgb]);
			const worst = Array.from(pairs.entries()).sort((a, b) => a[1] - b[1])[0];
			const low = Array.from(pairs.entries()).filter(([, v]) => v < 4.5);
			assert(pairs.size >= 10 && low.length === 0, tag + '文字と地の組み合わせ ' + pairs.size + ' 通りがすべてコントラスト比 4.5 以上（最小 ' + worst[1].toFixed(2) + '：' + worst[0] + '）', low.slice(0, 4));
			if (w === 375) {
				const table = Array.from(pairs.entries()).filter(([k]) => /^(回復の青|パッシブの緑|デバフの赤)/.test(k)).map(([k, v]) => k + ' = ' + v.toFixed(2));
				console.log('     [実測] コントラスト比（色の付く文字 × 乗りうる地）:\n       ' + table.join('\n       '));
			}
			// 行の高さ（スマホ 31px）と、表より上の高さ（段7d の最終：① 351px）が増えていない
			if (w === 375) {
				assert(rows.every((x) => x.h === 31), tag + '行の高さはすべて 31px のまま（固有・金・回復・前段の字下げの行も）', Array.from(new Set(rows.map((x) => x.h))));
				const g = await gridTop(sp.page);
				assert(g <= 351, tag + '①の表より上の高さ ' + g + 'px は段7d の最終（351px）以下', { g });
				console.log('     [実測] 375px: ①の表より上 ' + g + 'px／表の行の高さ ' + Array.from(new Set(rows.map((x) => x.h))).join(',') + 'px（段7d の最終: 351px／31px）');
			}
			await sp.ctx.close();
		}
	});
}
