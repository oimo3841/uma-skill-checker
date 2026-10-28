// ②因子周回 段2（②の合計も◎で数える。2026-10-28）の検査。run-smoke.mjs の末尾から register57() で呼ばれる
// （塊の見出しはすべて「②◎」で始まる。`npm run test:visual -- --only=②◎` で回せる）。
//
// 決め（おいもさん・段2）:
//  ・②の○のうち、上の段がちょうど1つの◎（circleUpOf）が引けるものは、Pt を数えるときだけ◎に差し替える。○のヒントLvはそのまま（①の C-165・C-168 と同じ）。
//  ・種数は○のまま（②の「N種」・見出しの種・C-178 の重なり）。②の検索の範囲（C-91）・③の表とコピー・Deck の記録・結合画像は○のまま。
//  ・◎の候補から外す: 上の段の◎が (a) ②にもある／(b) ①の計算の由来にある・①で取得する／(c) ①の前段にある。
//  ・②の行: ◎として数える行は名前を◎に（ⓘも◎）・行の Pt は◎＋前段の○の合算。切り替えは、入口の「削除」の右の◎のボタンで入る「◎を○に変えるモード」のときだけ
//    （すべての行の Pt を隠し、候補の行の Pt の位置に◎／○。もう一度押すと戻る。保存しない。候補0ではボタンなし）。
//  ・「○のまま数える」はセット（template）の keepCircleIds。触ったときだけ書く・空なら項目ごと消す・schemaVersion 7 のまま・読み込み時に補わない。
//    下書き・保存・セットへの写し・複製に乗る。切り替えは「元に戻す」に積む。「すべて消す」で消える（元に戻せる）。「アイコンだけ外す」は触らない。
//  ・脚質オススメの行の Pt（stylePtCalc）も◎で数える。オススメサポの Pt（outsidePtOf）は変えない。
// スキル名は検査の側に書かない（恒久ルール1。id で書く）。

export async function register57(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const RULES = readJson('data/skill-pt-rules.json');
	const STEP = new Map(readJson('data/skill-step-up.json').entries.map((e) => [e.skillId, e.prevSkillIds || []]));
	const master = readJson('uma-skill-deck-skills.json').skills;
	const isWhite = (id) => !!PT.get(id) && PT.get(id).rarity === 'white';
	// ○ → ◎ の独立な導出: 白のうち、前段にその白を持つ白（上の段）がちょうど1つあるもの
	const NEXT = new Map();
	STEP.forEach((prevs, id) => prevs.forEach((p) => { if (!NEXT.has(p)) NEXT.set(p, []); NEXT.get(p).push(id); }));
	const upOf = (id) => { if (!isWhite(id)) return null; const ups = (NEXT.get(id) || []).filter(isWhite); return ups.length === 1 ? ups[0] : null; };
	const ptOf = (b, level, statusId) => {
		const hint = level > 0 ? RULES.hintDiscountPercent[Math.min(level, RULES.hintDiscountPercent.length) - 1] : 0;
		const st = (RULES.statuses.find((s) => s.id === statusId) || { percent: 0 }).percent;
		const n = b * (100 - hint - st);
		return RULES.rounding === 'floor' ? Math.floor(n / 100) : Math.round(n / 100);
	};
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const R1 = { umaId: 'uma-0001', cardIds: CARDS6 };
	const R2 = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
	const A40 = { umaId: 'uma-0179', cardIds: ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'], skillFilter: { distance: 'long', style: 'senko', surface: 'turf' }, pt: { status: 'kire', umaHintLevel: 3 } };
	const ONE12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
	const WHITES30 = master.map((s) => s.id).filter(isWhite).slice(0, 30);
	// 固定の期待値（実データ。2026-10-28 に変更前〔f4d5d4a〕と変更後で測った。見積もり factor-loop-step2-estimate の S1・S2・S3・S4 と一致）
	// C-223（ヒントLvの件・2026-10-28）: S1・S2 の「2」「5」は①で Lv1 の白なので、②でも数えるようになった（行は差 −60 Pt ずつ・②の種は +2）。
	// S1・S2 の値はそのぶん動いた（after 1,680 → 1,560・before 1,212 → 1,092・種 14 → 16。◎の候補は変わらない）
	const FIX = {
		S1: { before: 1092, after: 1560, kinds: 16, roster: 4899, cand: 8 },
		S2: { before: 1092, after: 1560, kinds: 16, roster: 8092, cand: 8 },
		S3: { before: 648, after: 648, kinds: 8, roster: 4720, cand: 0 },
		S4: { before: 2400, after: 4320, kinds: 36, roster: 0, cand: 30 }
	};

	/** special.html を、①（下書きの編成）と②の下書き（ids・F・keepCircleIds）を入れて開く。②のタブを見せる。userData を渡せばセットで開く */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, o.userData || EMPTY);
		if (o.route) await o.route(sp.page);
		await sp.page.evaluate(({ roster, ids, F, keep }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (ids) {
				const d = { skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: F };
				if (keep !== undefined) d.keepCircleIds = keep;
				localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(d));
			} else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: o.roster || null, ids: o.ids || null, F: o.F === undefined ? 5 : o.F, keep: o.keep });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); try { await UmaSkillDeckCore.loadSkillEvolutions(); } catch (e) {} });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(500);
		return sp;
	};
	/** 製品の数（②の帯・見出し・①の帯・◎の候補・行） */
	const read = (page) => page.evaluate(() => {
		const s = deckTemplateManager.getSetSummary();
		const c = deckTemplateManager.getFactorCircles();
		const rows = Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]')).map((p) => {
			const t = p.querySelector('[data-usd-el="factor-circle-toggle"]');
			const nb = p.querySelector('.usd-panel-namebtn');
			const pt = p.querySelector('[data-usd-el="panel-pt"]');
			return { id: p.dataset.skillId, circle: p.dataset.usdCircle || null, info: nb ? nb.getAttribute('data-usd-info') : null, name: nb ? nb.textContent : null,
				pt: pt ? pt.textContent : '', ptShown: !!pt && getComputedStyle(pt).display !== 'none' && pt.textContent !== '', toggle: t ? t.getAttribute('aria-pressed') : null, h: p.getBoundingClientRect().height,
				toggleBox: t ? (() => { const r = t.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })() : null };
		});
		const n = (sel) => { const e = document.querySelector(sel); return e ? Number(e.textContent.replace(/[^0-9]/g, '')) : null; };
		return { factorPt: s.factorPt, factorKinds: s.factorKinds, commonPt: s.commonPt, rosterPt: s.rosterPt, rosterKinds: s.rosterKinds, total: s.total, totalKinds: s.totalKinds, crossPaired: s.crossPaired,
			bandPt: n('#deck-template-panel [data-usd-el="factor-pt"]'), bandKinds: n('#deck-template-panel [data-usd-el="factor-count"]'),
			headTotal: (() => { const e = document.querySelector('#deck-set-bar [data-usd-el="set-total"]'); return e ? Number(e.dataset.total) : null; })(),
			modeBtn: (() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-circle-mode"]'); return b ? b.getAttribute('aria-pressed') : null; })(),
			circles: c, rows: rows, sel: (deckTemplateManager.getSelection() || {}).skillIds || null,
			overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
	});
	/** ◎を○に変えるモード（入口の◎のボタン）に入る・出る */
	const setMode = async (page, on) => {
		const cur = await page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-circle-mode"]'); return b ? b.getAttribute('aria-pressed') : null; });
		if (cur === null) return false;
		if ((cur === 'true') !== on) { await page.click(T + '[data-usd-el="factor-circle-mode"]'); await page.waitForTimeout(250); }
		return true;
	};
	// C-223: ①と重なる行は差（「−60 Pt」）なので、符号も読む
	const rowPtNum = (t) => (String(t).trim().startsWith('−') ? -1 : 1) * (Number(String(t).replace(/[^0-9]/g, '')) || 0);
	const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')));
	const ud = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData')));

	await block('②◎(1) 計算: S1〜S4 の②の Pt は見積もりの値（S1 1,212→1,680・S2 同〔C-223 で①の Lv1 の白2つを数えて 1,092→1,560〕・S3 ±0・S4 2,400→4,320）／種数・①の Pt は変わらない／全部○に戻すと変更前の値', async () => {
		const cases = { S1: { roster: R2, ids: ONE12 }, S2: { roster: R1, ids: ONE12 }, S3: { roster: A40, ids: ['230', '200041'] }, S4: { roster: null, ids: WHITES30 } };
		for (const [k, c] of Object.entries(cases)) {
			const fx = FIX[k];
			let sp = await openSp(Object.assign({ w: 1280 }, c));
			const a = await read(sp.page);
			await sp.ctx.close();
			sp = await openSp(Object.assign({ w: 1280, keep: c.ids.slice() }, c));
			const b = await read(sp.page);
			await sp.ctx.close();
			assert(a.factorPt === fx.after && a.bandPt === fx.after, '②◎(1) ' + k + ' ②の Pt は ' + fx.after + '（帯も同じ）', { pt: a.factorPt, band: a.bandPt });
			assert(a.factorKinds === fx.kinds && b.factorKinds === fx.kinds && a.bandKinds === fx.kinds, '②◎(1) ' + k + ' ②の種数は○のまま ' + fx.kinds + '種（◎で数えても・○に戻しても）', { a: a.factorKinds, b: b.factorKinds });
			assert(a.rosterPt === fx.roster && b.rosterPt === fx.roster, '②◎(1) ' + k + ' ①の Pt は変わらない（' + fx.roster + '）', { a: a.rosterPt, b: b.rosterPt });
			assert(a.circles.candidates.length === fx.cand && a.circles.circleOf.length === fx.cand, '②◎(1) ' + k + ' ◎の候補 ' + fx.cand + '件・既定はすべて◎で数える', { cand: a.circles.candidates.length, on: a.circles.circleOf.length });
			assert(b.factorPt === fx.before && b.circles.circleOf.length === 0 && b.circles.candidates.length === fx.cand, '②◎(1) ' + k + ' 全部を○のまま数える（keepCircleIds に全部）と変更前の値 ' + fx.before, { pt: b.factorPt, on: b.circles.circleOf.length });
			assert(a.headTotal === a.rosterPt + a.factorPt && a.totalKinds === b.totalKinds, '②◎(1) ' + k + ' 見出しの合計 ＝ ① ＋ ②（種数は○のまま）', { head: a.headTotal, r: a.rosterPt, f: a.factorPt, k: [a.totalKinds, b.totalKinds] });
			// 帯の数＝行の Pt の和（共通スキル）。「①で取得」の行は数えない。S3 は①の前段の白を②に入れる形（C-178 の重なり）で、変更前から一致しない（変更前も 90 と −72）ので比べない
			const sum = a.rows.reduce((s, r) => s + rowPtNum(r.pt), 0);
			if (k !== 'S3') assert(sum === a.commonPt, '②◎(1) ' + k + ' 共通スキルの Pt ＝ ②の行の Pt の和（◎の行は合算）', { sum, common: a.commonPt });
			// 候補は独立な導出（○のうち上の段の白がちょうど1つ）の部分集合で、◎は②・①に無い
			const okCand = a.circles.candidates.every(([o, up]) => upOf(o) === up && c.ids.indexOf(up) === -1);
			assert(okCand, '②◎(1) ' + k + ' 候補は「上の段の白がちょうど1つ」の○で、◎は②に無い', a.circles.candidates.slice(0, 5));
			// ③・コピー・Deck の記録へ渡す id（getSelection）は○のまま
			assert(JSON.stringify(a.sel) === JSON.stringify(c.ids), '②◎(1) ' + k + ' ②の id（③・コピー・Deck の記録へ渡すもの）は○のまま・足した順のまま', a.sel && a.sel.slice(0, 5));
		}
	});

	await block('②◎(2) 計算: ①なしの S4 で、◎の行の Pt ＝ ◎（Lv5）＋ ○（Lv5）（独立に出した式）／名前とⓘは◎・切り替えは押した状態／行の高さは変わらない', async () => {
		const sp = await openSp({ w: 1280, ids: WHITES30 });
		const a = await read(sp.page);
		await setMode(sp.page, true);
		const am = await read(sp.page);
		const modeOf = new Map(am.rows.map((r) => [r.id, r]));
		const byId = new Map(a.rows.map((r) => [r.id, r]));
		let bad = [];
		WHITES30.forEach((o) => {
			const up = upOf(o), r = byId.get(o);
			if (!up || !r) { bad.push(['nocand', o]); return; }
			const want = ptOf(PT.get(up).pt, 5, 'none') + ptOf(PT.get(o).pt, 5, 'none');
			if (rowPtNum(r.pt) !== want) bad.push(['pt', o, r.pt, want]);
			if (r.circle !== up || r.info !== up || r.toggle !== null || modeOf.get(o).toggle !== 'true') bad.push(['row', o, r.circle, r.info, r.toggle, modeOf.get(o).toggle]);
		});
		assert(bad.length === 0, '②◎(2) 30行すべて: Pt ＝ ◎＋○（どちらも Lv5・状態なし）・data-usd-circle とⓘは◎・通常の表示では切り替えなし・モードでは aria-pressed=true', bad.slice(0, 5));
		const names = await sp.page.evaluate((ids) => ids.map((id) => UmaSkillDeckCore.getSkillName ? UmaSkillDeckCore.getSkillName(id) : null), WHITES30.map(upOf));
		assert(names.every((n, i) => n === null || byId.get(WHITES30[i]).name === n), '②◎(2) 行の名前は◎の名前', { got: a.rows.slice(0, 3).map((r) => r.name), want: names.slice(0, 3) });
		assert(a.rows.every((r) => r.h === a.rows[0].h), '②◎(2) 切り替えを出しても、行の高さはそろったまま', Array.from(new Set(a.rows.map((r) => r.h))));
		assert(jsErrors(sp.errors).length === 0, '②◎(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('②◎(3) 除外: (a) ◎が②にもある／(b) ◎が①の由来にある・①で取得／(c) ◎が①の前段 のとき、切り替えが出ず、○のまま数えた値と同じ', async () => {
		// (a) S4 の先頭の○と、その◎を両方②に入れる
		const o1 = WHITES30[0], u1 = upOf(o1);
		let sp = await openSp({ w: 1280, ids: [o1, u1] });
		let a = await read(sp.page);
		await sp.ctx.close();
		sp = await openSp({ w: 1280, ids: [o1, u1], keep: [o1] });
		let b = await read(sp.page);
		await sp.ctx.close();
		assert(a.circles.candidates.length === 0 && a.modeBtn === null && a.rows.every((r) => r.toggle === null) && a.factorPt === b.factorPt, '②◎(3)(a) ◎も②にあるときは候補にしない（切り替えなし・数は○のままと同じ）', { cand: a.circles.candidates, pt: [a.factorPt, b.factorPt] });
		// (b) 実データでは、①の由来に◎そのものが入るのは①の◎（C-165。①の○を◎に差し替えた由来）だけで、その○は①で取得するので②では数えない。
		//     そこで、サポカのイベントを差し替えて「◎を●で得る」編成を作る（card-0248 に、選択肢1つの段で◎を足す）
		const evReal = readJson('data/support-card-event-skills.json');
		sp = await openSp({ w: 1280, roster: R1, ids: ONE12 });
		const s2 = await read(sp.page);
		await sp.ctx.close();
		const pickB = s2.circles.candidates[s2.circles.candidates.length - 1];   // R1 で②の候補になる○ → ◎
		const routeB = (up) => async (page) => {
			const doc = JSON.parse(JSON.stringify(evReal));
			const e = doc.entries.find((x) => x.cardId === CARDS6[0]);
			const next = Math.max(0, ...e.chain.map((c) => c.step || 0)) + 1;
			e.chain.push({ step: next, choices: [{ skills: [{ skillId: up, name: 'x', hintLevel: 1 }] }] });
			await page.route('**/data/support-card-event-skills.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(doc) }));
		};
		assert(!!pickB, '②◎(3)(b) 前提: R1 で②の◎の候補がある', s2.circles.candidates);
		if (pickB) {
			const [o, up] = pickB;
			sp = await openSp({ w: 1280, roster: R1, ids: [o], route: routeB(up) });
			const tk = await sp.page.evaluate((r) => UmaSkillDeckCore.getRosterVisiblePart(r).takenIds, R1);
			a = await read(sp.page);
			await sp.ctx.close();
			sp = await openSp({ w: 1280, roster: R1, ids: [o], keep: [o], route: routeB(up) });
			b = await read(sp.page);
			await sp.ctx.close();
			assert(tk.indexOf(up) !== -1, '②◎(3)(b) 前提: 差し替えた編成は◎を①で取得する', { up, has: tk.indexOf(up) !== -1 });
			assert(a.circles.candidates.length === 0 && a.modeBtn === null && a.rows.every((r) => r.toggle === null) && a.factorPt === b.factorPt && a.rosterPt === b.rosterPt,
				'②◎(3)(b) ◎を①で取得する（①の由来にある）ときは候補にしない（切り替えなし・数は○のままと同じ）', { o, up, cand: a.circles.candidates, pt: [a.factorPt, b.factorPt] });
		}
		// (c) ①が「金←◎←○」の金を取る編成（C-178(3) と同じ探し方）。②に○を入れる
		const golds2 = [...STEP.keys()].filter((g) => PT.get(g) && PT.get(g).rarity === 'gold' && (STEP.get(STEP.get(g)[0]) || []).length > 0);
		const cands = [];
		readJson('data/training-umamusume.json').entries.forEach((u) => { const t = JSON.stringify([u.initialSkills, u.awakeningSkills]); golds2.forEach((g) => { if (t.includes('"' + g + '"')) cands.push({ g, r: { umaId: u.id, cardIds: [] } }); }); });
		evReal.entries.forEach((e) => { const t = JSON.stringify(e); golds2.forEach((g) => { if (t.includes('"' + g + '"')) cands.push({ g, r: { umaId: '', cardIds: [e.cardId] } }); }); });
		sp = await openSp({ w: 1280, roster: { umaId: 'uma-0001', cardIds: [] } });
		const pickC = await sp.page.evaluate(({ cands, step }) => {
			const C = UmaSkillDeckCore;
			for (const { g, r } of cands) {
				const vp = C.getRosterVisiblePart(r), d = C.getRosterPtDetail(r);
				const gate = step[g][0], circ = step[gate][0];
				if (vp.takenIds.includes(g) && !vp.visibleIds.includes(gate) && !vp.visibleIds.includes(circ) && d.prevItems.some((x) => x.skillId === gate)) return { r, g, gate, circ };
			}
			return null;
		}, { cands, step: Object.fromEntries(STEP) });
		await sp.ctx.close();
		assert(!!pickC && upOf(pickC.circ) === pickC.gate, '②◎(3)(c) 前提: 金←◎←○ の金を①で取る編成が見つかる（○の上の段は◎）', pickC);
		if (pickC) {
			sp = await openSp({ w: 1280, roster: pickC.r, ids: [pickC.circ] });
			a = await read(sp.page);
			await sp.ctx.close();
			sp = await openSp({ w: 1280, roster: pickC.r, ids: [pickC.circ], keep: [pickC.circ] });
			b = await read(sp.page);
			await sp.ctx.close();
			assert(a.circles.candidates.length === 0 && a.modeBtn === null && a.rows.every((r) => r.toggle === null) && a.factorPt === b.factorPt && a.rosterPt === b.rosterPt,
				'②◎(3)(c) ◎が①の前段にあるときは候補にしない（切り替えなし・数は○のままと同じ）', { pickC, cand: a.circles.candidates, pt: [a.factorPt, b.factorPt] });
		}
	});

	await block('②◎(4) 切り替え: 押すと○のまま数える（名前○・Pt は○だけ・keepCircleIds に書く）→ 元に戻す／もう一度押すと◎（空なら項目ごと消す）／知らない id は無視', async () => {
		const sp = await openSp({ w: 390, roster: R2, ids: ONE12 });
		await setMode(sp.page, true);
		const a0 = await read(sp.page);
		const on = a0.rows.find((r) => r.toggle === 'true');
		const id = on.id, up = on.circle;
		await sp.page.click(T + '[data-usd-el="factor-circle-toggle"][data-skill-id="' + id + '"]');
		await sp.page.waitForTimeout(300);
		const a1 = await read(sp.page);
		const r1 = a1.rows.find((r) => r.id === id);
		const d1 = await draft(sp.page);
		const focus1 = await sp.page.evaluate(() => { const e = document.activeElement; return e ? e.getAttribute('data-usd-el') + ':' + e.getAttribute('data-skill-id') : null; });
		assert(r1.toggle === 'false' && r1.circle === null && r1.info === id && JSON.stringify(d1.keepCircleIds) === JSON.stringify([id]),
			'②◎(4) 押すと○のまま（aria-pressed=false・ⓘは○・下書きの keepCircleIds に1つ）', { r1, keep: d1.keepCircleIds });
		const wantDelta = rowPtNum(on.pt) - rowPtNum(r1.pt);
		assert(a1.factorPt === a0.factorPt - wantDelta && wantDelta > 0 && a1.factorKinds === a0.factorKinds && a1.rosterPt === a0.rosterPt,
			'②◎(4) ②の Pt は行の差だけ下がる（種数・①は同じ）', { before: a0.factorPt, after: a1.factorPt, wantDelta });
		assert(focus1 === 'factor-circle-toggle:' + id, '②◎(4) 押したあとも、そのボタンにフォーカスがある', focus1);
		const un = await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		await sp.page.waitForTimeout(300);
		const a2 = await read(sp.page);
		const d2 = await draft(sp.page);
		assert(un === true && a2.factorPt === a0.factorPt && !('keepCircleIds' in d2) && a2.rows.find((r) => r.id === id).toggle === 'true',
			'②◎(4) 元に戻すと◎に戻り、keepCircleIds は項目ごと消える', { un, pt: a2.factorPt, keep: d2.keepCircleIds });
		// 押して○ → もう一度押して◎（空になったら項目ごと消す）
		await sp.page.click(T + '[data-usd-el="factor-circle-toggle"][data-skill-id="' + id + '"]');
		await sp.page.waitForTimeout(250);
		await sp.page.click(T + '[data-usd-el="factor-circle-toggle"][data-skill-id="' + id + '"]');
		await sp.page.waitForTimeout(250);
		const a3 = await read(sp.page);
		const d3 = await draft(sp.page);
		assert(a3.factorPt === a0.factorPt && !('keepCircleIds' in d3), '②◎(4) ○→◎と押し直すと元の値・keepCircleIds は空なので書かない', { pt: a3.factorPt, d3 });
		assert(!a3.overflowX && jsErrors(sp.errors).length === 0, '②◎(4) 横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 知らない id（壊れた値を含む）は無視し、保存値は書き換えない
		const sp2 = await openSp({ w: 390, roster: R2, ids: ONE12, keep: ['zzz-unknown', 7, id] });
		const b = await read(sp2.page);
		const d4 = await draft(sp2.page);
		assert(b.circles.circleOf.length === FIX.S1.cand - 1 && !b.circles.circleOf.some(([o]) => o === id) && JSON.stringify(d4.keepCircleIds) === JSON.stringify(['zzz-unknown', 7, id]),
			'②◎(4) keepCircleIds の知らない id・形の崩れた値は無視（その1つだけ○）・開いただけでは保存値を書き換えない', { on: b.circles.circleOf.length, keep: d4.keepCircleIds });
		await sp2.ctx.close();
	});

	await block('②◎(5) 保存の配線: セットへの保存（下書き→セット）・読み込み直し・複製に keepCircleIds が乗る／schemaVersion 7 のまま／項目の無いセットは開いても書かない', async () => {
		const seed = { schemaVersion: 7, records: [], customSkills: [], rosters: [Object.assign({ rosterId: 'r1', name: 'S1', createdAt: 'x', updatedAt: 'x' }, R2)],
			templates: [{ templateId: 't1', name: 'S1', skillIds: ONE12.slice(), skillIcons: {}, parentHintLevel: 5, baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }] };
		let sp = await openSp({ w: 1280, userData: seed });
		const raw0 = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
		await sp.page.click(BAR + '[data-usd-act="set-list"]');
		const already = await sp.page.evaluate(() => { const i = document.querySelector('[data-usd-el="set-list"] input[value="t1"]'); return !!i && i.checked; });
		if (already) await sp.page.keyboard.press('Escape'); else await sp.page.click('[data-usd-el="set-list"] input[value="t1"]');
		await sp.page.waitForTimeout(400);
		const a0 = await read(sp.page);
		const raw1 = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
		const t0 = JSON.parse(raw1).templates[0];
		assert(a0.factorPt === FIX.S1.after && !('keepCircleIds' in t0), '②◎(5) 項目の無いセットは全部◎で数え、開いても keepCircleIds を書かない', { pt: a0.factorPt, t0: Object.keys(t0) });
		await setMode(sp.page, true);
		const id = (await read(sp.page)).rows.find((r) => r.toggle === 'true').id;
		await sp.page.click(T + '[data-usd-el="factor-circle-toggle"][data-skill-id="' + id + '"]');
		await sp.page.waitForTimeout(300);
		let d = await ud(sp.page);
		assert(JSON.stringify(d.templates[0].keepCircleIds) === JSON.stringify([id]) && d.schemaVersion === 7, '②◎(5) セットの切り替えはセットの keepCircleIds に書く（schemaVersion 7 のまま）', { keep: d.templates[0].keepCircleIds, v: d.schemaVersion });
		const a1 = await read(sp.page);
		assert(jsErrors(sp.errors).length === 0, '②◎(5) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		assert(raw0 !== null, '②◎(5) 前提: userData がある', null);
		// 読み込み: 保存されたデータで新しく開く（openPage は再読み込みのたびに userData を仕込み直すので、別のページで開く）
		sp = await openSp({ w: 1280, userData: d });
		await sp.page.click(BAR + '[data-usd-act="set-list"]');
		const already2 = await sp.page.evaluate(() => { const i = document.querySelector('[data-usd-el="set-list"] input[value="t1"]'); return !!i && i.checked; });
		if (already2) await sp.page.keyboard.press('Escape'); else await sp.page.click('[data-usd-el="set-list"] input[value="t1"]');
		await sp.page.waitForTimeout(400);
		const a2n = await read(sp.page);
		await setMode(sp.page, true);
		const a2 = await read(sp.page);
		assert(a2n.modeBtn === 'false' && a2.factorPt === a1.factorPt && a1.factorPt < FIX.S1.after && a2.rows.find((r) => r.id === id).toggle === 'false', '②◎(5) 保存したデータを開き直しても、○のまま数える', { a1: a1.factorPt, a2: a2.factorPt });
		await sp.ctx.close();
		// 複製（Deck 単体ページ。special の②には複製のボタンが無い）
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, d);
		await dk.page.evaluate(() => switchTab('template'));
		await dk.page.click('[data-usd-act="template-tab"][data-tab-id="t1"]');
		await dk.page.waitForTimeout(250);
		await dk.page.click('[data-usd-act="template-duplicate"]');
		await dk.page.waitForTimeout(300);
		const dd = await dk.page.evaluate(() => UmaSkillDeckCore.getUserData());
		const copy = dd.templates.find((t) => t.templateId !== 't1');
		assert(!!copy && JSON.stringify(copy.keepCircleIds) === JSON.stringify([id]) && JSON.stringify(dd.templates[0].keepCircleIds) === JSON.stringify([id]), '②◎(5) 複製（Deck）に keepCircleIds も写す', copy && { keep: copy.keepCircleIds });
		assert(dk.errors.length === 0, '②◎(5) Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
		// 下書き → セットへの保存（名前を付けて保存）で写る
		sp = await openSp({ w: 1280, roster: R2, ids: ONE12, keep: [id] });
		await sp.page.click(BAR + '[data-usd-act="name-edit"]');
		await sp.page.fill(BAR + '[data-usd-el="name"]', '段2');
		await sp.page.keyboard.press('Enter');
		await sp.page.waitForTimeout(400);
		d = await ud(sp.page);
		const nt = d.templates.find((t) => t.name === '段2');
		assert(!!nt && JSON.stringify(nt.keepCircleIds) === JSON.stringify([id]) && d.schemaVersion === 7, '②◎(5) 下書きを名前を付けて保存すると、セットに keepCircleIds が写る', nt && { keep: nt.keepCircleIds });
		await sp.ctx.close();
	});

	await block('②◎(6) リセット: 「すべて消す」で keepCircleIds も消え、元に戻すで戻る／「アイコンだけ外す」は触らない', async () => {
		let sp = await openSp({ w: 390, roster: R2, ids: ONE12, keep: ['1'] });
		const a0 = await read(sp.page);
		await sp.page.click(T + '[data-usd-act="factor-reset"]');
		await sp.page.click('[data-usd-el="factor-reset-icons"]').catch(() => {});
		await sp.page.waitForTimeout(250);
		let d = await draft(sp.page);
		assert(JSON.stringify(d.keepCircleIds) === JSON.stringify(['1']), '②◎(6) 「アイコンだけ外す」（押せないときは押さない）は keepCircleIds を触らない', d.keepCircleIds);
		await sp.page.keyboard.press('Escape').catch(() => {});
		await sp.page.click(T + '[data-usd-act="factor-reset"]');
		await sp.page.click('[data-usd-el="factor-reset-all"]');
		await sp.page.waitForTimeout(300);
		d = await draft(sp.page);
		assert(d.skillIds.length === 0 && !('keepCircleIds' in d), '②◎(6) 「すべて消す」でスキルと keepCircleIds が消える', d);
		const un = await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		await sp.page.waitForTimeout(300);
		d = await draft(sp.page);
		const a1 = await read(sp.page);
		assert(un === true && JSON.stringify(d.skillIds) === JSON.stringify(ONE12) && JSON.stringify(d.keepCircleIds) === JSON.stringify(['1']) && a1.factorPt === a0.factorPt,
			'②◎(6) 元に戻すと、スキルと keepCircleIds が戻り、②の Pt も同じ', { un, keep: d.keepCircleIds, pt: [a0.factorPt, a1.factorPt] });
		assert(jsErrors(sp.errors).length === 0, '②◎(6) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('②◎(7) 見た目: 通常は行に切り替えなし・Pt あり／入口の行の右端の塊の◎のボタン（C-226 で「◎・表の切り替え・削除」の並びに）でモードに入ると、すべての行の Pt を隠し、候補の行だけ Pt の位置に◎／○（押せる範囲 44px・行の高さ 36px）／もう一度押すと戻る／モードは保存しない／候補0ではボタンなし', async () => {
		for (const w of [390, 1280]) {
			const tag = '②◎(7) ' + w + 'px: ';
			const sp = await openSp({ w, roster: R2, ids: ONE12, keep: ['6'] });
			const n0 = await read(sp.page);
			const pos = await sp.page.evaluate(() => {
				const del = document.querySelector('#deck-template-panel [data-usd-el="palette-delete"]'), b = document.querySelector('#deck-template-panel [data-usd-el="factor-circle-mode"]');
				if (!del || !b) return null;
				const d = del.getBoundingClientRect(), r = b.getBoundingClientRect();
				// C-226: 塊の並びは「◎・表の切り替え・削除」（削除が一番右）。◎は塊の先頭
				return { first: b.parentElement.firstElementChild === b && b.parentElement === del.parentElement, left: r.right <= d.left, sameRow: Math.abs((r.top + r.bottom) / 2 - (d.top + d.bottom) / 2) < 4, w: Math.round(r.width), h: Math.round(r.height) };
			});
			assert(n0.modeBtn === 'false' && !!pos && pos.first && pos.left && pos.sameRow && pos.w >= 24 && pos.h >= 24, tag + '◎のボタンは右端の塊の先頭（「削除」より左）・同じ行（押せる範囲 24px 以上）・入っていない', pos);
			assert(n0.rows.every((r) => r.toggle === null) && n0.rows.filter((r) => r.pt !== '').every((r) => r.ptShown), tag + '通常の表示: 行に切り替えは無く、Pt が見える', n0.rows.slice(0, 3));
			await setMode(sp.page, true);
			const m = await read(sp.page);
			const cand = new Map(m.circles.candidates);
			const bad = m.rows.filter((r) => r.ptShown || (cand.has(r.id) ? !(r.toggle === (r.id === '6' ? 'false' : 'true') && r.toggleBox.w >= 44) : r.toggle !== null));
			assert(m.modeBtn === 'true' && bad.length === 0 && cand.size === FIX.S1.cand, tag + 'モード: すべての行の Pt を隠し、候補の行だけ◎（○に戻した「6」は○）・押せる幅 44px、候補でない行は何も出さない', bad.slice(0, 3));
			assert(m.rows.every((r) => r.h === 36) && n0.rows.every((r) => r.h === 36) && !m.overflowX, tag + '行の高さは 36px のまま（通常・モード）・横スクロールなし', Array.from(new Set(m.rows.map((r) => r.h))));
			assert(m.factorPt === n0.factorPt && m.bandPt === n0.bandPt, tag + 'モードに入っても数は変わらない', { n: n0.factorPt, m: m.factorPt });
			const ls = await sp.page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
			assert(!/circleMode|factorCircleMode/.test(ls), tag + 'モードの状態は保存しない（localStorage に書かない）', null);
			await setMode(sp.page, false);
			const n1 = await read(sp.page);
			assert(n1.modeBtn === 'false' && n1.rows.every((r) => r.toggle === null) && n1.rows.filter((r) => r.pt !== '').every((r) => r.ptShown), tag + 'もう一度押すと通常の表示に戻る', n1.rows.slice(0, 2));
			// 入ったまま開き直すと通常の表示（保存しない）
			await setMode(sp.page, true);
			await sp.page.reload({ waitUntil: 'networkidle' });
			for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
			await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
			await sp.page.waitForTimeout(800);
			const n2 = await read(sp.page);
			assert(n2.modeBtn === 'false' && n2.rows.every((r) => r.toggle === null), tag + 'モードのまま読み込み直すと、通常の表示で開く', n2.modeBtn);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// 候補0（S3）ではボタンを出さない
		const sp3 = await openSp({ w: 390, roster: A40, ids: ['230', '200041'] });
		const z = await read(sp3.page);
		assert(z.modeBtn === null && z.circles.candidates.length === 0, '②◎(7) ◎の候補が1つも無いときは、◎のボタンを出さない', z.modeBtn);
		await sp3.ctx.close();
	});
}
