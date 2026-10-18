// ①の◎／○の切り替え（C-165・2026-10-16）の検査。run-smoke.mjs の末尾から register29() で呼ばれる
// （塊の見出しはすべて「◎切替」で始まる。`npm run test:visual -- --only=◎切替` で回せる）。
//
// 決め: ①の「得られるスキル」に○として出ている行のうち、上の段の◎があるものは、既定で◎として数える
//   （名前・Pt を◎のものに。合計は「○＋◎」。ヒントLvは根の○のものを援用）。利用者は行ごとに○へ戻せる（roster.keepCircleIds）。
//   絞り込み・グループ分け・並び・種数は○の行のまま。②・Deck の比較・結合画像・OCR の辞書は触らない。
//
// (1) 計算の層（固定の編成・実データ）: 候補の数、既定◎の合計 Pt が「○のまま」＋ 各◎の Pt（独立に式で出す）であること、種数が変わらないこと、
//     ○に戻した行だけが従来どおりで、ほかの行は影響を受けないこと
// (2) ①の表の表示: 名前と Pt が◎のものになる／行の識別・種数は○のまま／前段の1行に○が出る
// (3) 切り替え・保存・リセット・Undo（A-2 で足す）

export async function register29(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const EXT = readJson('data/extended-skills.json').entries;
	const STEP = readJson('data/skill-step-up.json').entries;
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const RULES = readJson('data/skill-pt-rules.json');
	const nameOf = (id) => (MASTER.find((s) => String(s.id) === id) || EXT.find((s) => s.id === id)).name;
	const T = '#deck-roster-panel ';

	/** 独立の検算に使う前段の表（データを直接読む。製品の関数は通さない） */
	const nextOf = new Map();
	STEP.forEach((e) => (e.prevSkillIds || []).forEach((p) => { if (!nextOf.has(p)) nextOf.set(p, []); nextOf.get(p).push(e.skillId); }));
	const white = (id) => !!PT.get(id) && PT.get(id).rarity === 'white';
	const upOf = (id) => { if (!white(id)) return null; const u = (nextOf.get(id) || []).filter(white); return u.length === 1 ? u[0] : null; };
	/** 基礎値・ヒントLv・状態なし → 支払う Pt（rules の割引率・丸めの式を、検査の側で書く） */
	const ptOf = (base, level) => {
		const pct = level > 0 ? RULES.hintDiscountPercent[Math.min(level, RULES.hintDiscountPercent.length) - 1] : 0;
		const n = base * (100 - pct);
		return RULES.rounding === 'floor' ? Math.floor(n / 100) : Math.round(n / 100);
	};

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, o.userData || EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		const roster = Object.assign({ umaId: 'uma-0001', cardIds: CARDS6 }, o.roster || {});
		await sp.page.evaluate(({ roster }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { roster });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(700);
		return sp;
	};
	const detail = (page, roster) => page.evaluate(async (roster) => {
		await UmaSkillDeckCore.loadTrainingSources();
		await UmaSkillDeckCore.loadSkillPtData();
		return { vp: UmaSkillDeckCore.getRosterVisiblePart(roster), pt: UmaSkillDeckCore.getRosterPtDetail(roster) };
	}, roster);

	/* 固定の編成（実データ）。育成ウマ娘 uma-0001 ＋ サポカ6枚（card-0248〜0253）。条件なし／中距離・先行・芝 */
	const R1 = { umaId: 'uma-0001', cardIds: CARDS6 };
	const R2 = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
	// 固定の期待値（実データ。2026-10-16）: 候補の数・既定◎の合計・○のままの合計・前段の合計・種数
	const FIX = {
		// 2026-10-17: 育成ウマ娘の user のイベント（取得の切り替え）は既定で数えないので、合計 Pt と種数が下がった（R1 8236→8092・6949→6805・64種→63種／R2 5043→4899・4224→4080・38種→37種。前段・◎の数は同じ）
		R1: { cand: 16, def: 8092, keep: 6805, defPrev: 1464, keepPrev: 360, kinds: 63 },
		R2: { cand: 10, def: 4899, keep: 4080, defPrev: 1050, keepPrev: 360, kinds: 37 }
	};

	await block('◎切替(1) 計算: 既定◎の合計は「○のまま」＋各◎のPt（独立に出した式と一致）／種数は変わらない／○に戻した行だけ従来どおり', async () => {
		const sp = await openSp({ roster: R1 });
		for (const [key, roster] of [['R1', R1], ['R2', R2]]) {
			const fx = FIX[key];
			const d = await detail(sp.page, roster);
			const cands = d.vp.circleCandidates;
			// 候補の独立な導出: 取得する○のうち、上の段の◎が（データ上）ちょうど1つあるもの
			const expectCands = d.vp.takenIds.filter((id) => upOf(id)).map((id) => [id, upOf(id)]);
			assert(JSON.stringify(cands) === JSON.stringify(expectCands) && cands.length === fx.cand,
				'◎切替(1) ' + key + ' 切り替えの対象は ' + fx.cand + '種（データの前段から独立に出した組と一致）', { n: cands.length, expect: expectCands.length });
			assert(JSON.stringify(d.vp.circleOf) === JSON.stringify(cands), '◎切替(1) ' + key + ' 既定はすべて◎として数える', d.vp.circleOf.length);

			const keepAll = await detail(sp.page, Object.assign({}, roster, { keepCircleIds: cands.map((c) => c[0]) }));
			assert(keepAll.vp.circleOf.length === 0 && keepAll.vp.circleCandidates.length === fx.cand, '◎切替(1) ' + key + ' 全部を○に戻すと、◎として数える行は0（対象は同じ）', keepAll.vp.circleOf.length);
			assert(d.pt.total === fx.def && keepAll.pt.total === fx.keep && d.pt.prevTotal === fx.defPrev && keepAll.pt.prevTotal === fx.keepPrev,
				'◎切替(1) ' + key + ' 固定の合計 Pt（既定◎ ' + fx.def + '／○のまま ' + fx.keep + '。前段 ' + fx.defPrev + '／' + fx.keepPrev + '）', { d: [d.pt.total, d.pt.prevTotal], k: [keepAll.pt.total, keepAll.pt.prevTotal] });
			assert(d.pt.kinds === fx.kinds && keepAll.pt.kinds === fx.kinds, '◎切替(1) ' + key + ' 種数（N種）は変わらない（前段と上の段は1種）', [d.pt.kinds, keepAll.pt.kinds]);

			// 独立な検算: 既定◎の合計 ＝ ○のままの合計 ＋ Σ（◎の基礎値を、根の○のヒントLvで割り引いた Pt）
			const levelOf = new Map(keepAll.pt.items.map((x) => [x.skillId, x.hintLevel]));
			let add = 0;
			cands.forEach(([o, u]) => { add += ptOf(PT.get(u).pt, levelOf.get(o)); });
			assert(d.pt.total === keepAll.pt.total + add, '◎切替(1) ' + key + ' 既定◎の合計 ＝ ○のまま ＋ 各◎のPt（' + add + '。ヒントLvは根の○のものを援用）', { d: d.pt.total, keep: keepAll.pt.total, add });
			// ○は「前段として必要」に出て、Pt・ヒントLvは○のまま。◎の行はヒントLvが○と同じ
			const prevById = new Map(d.pt.prevItems.map((x) => [x.skillId, x]));
			const keepItemById = new Map(keepAll.pt.items.map((x) => [x.skillId, x]));
			const okPrev = cands.every(([o]) => prevById.has(o) && prevById.get(o).pt === keepItemById.get(o).pt && prevById.get(o).hintLevel === keepItemById.get(o).hintLevel);
			assert(okPrev, '◎切替(1) ' + key + ' ○は「前段として必要」に出て、Pt・ヒントLvは○のまま', cands.filter(([o]) => !prevById.has(o)).slice(0, 3));
			const itemById = new Map(d.pt.items.map((x) => [x.skillId, x]));
			assert(cands.every(([o, u]) => itemById.has(u) && !itemById.has(o) && itemById.get(u).hintLevel === keepItemById.get(o).hintLevel && itemById.get(u).pt === ptOf(PT.get(u).pt, keepItemById.get(o).hintLevel)),
				'◎切替(1) ' + key + ' 行は◎のPt（基礎値 × 根の○のヒントLvの割引）で数える', null);

			// ○に戻した行だけ従来どおり。ほかの行は影響を受けない（1行ずつ全部）
			let bad = [];
			for (const [o, u] of cands) {
				const one = await detail(sp.page, Object.assign({}, roster, { keepCircleIds: [o] }));
				const oneItems = new Map(one.pt.items.map((x) => [x.skillId, x]));
				const expectTotal = d.pt.total - ptOf(PT.get(u).pt, keepItemById.get(o).hintLevel);
				// ○の行の Pt は、前段ではなく自分の行として数える（合計は ○＋◎ から ◎ を引いた値）
				const sameOthers = d.pt.items.filter((x) => x.skillId !== u).every((x) => oneItems.has(x.skillId) && oneItems.get(x.skillId).pt === x.pt && oneItems.get(x.skillId).hintLevel === x.hintLevel);
				if (one.pt.total !== expectTotal || !oneItems.has(o) || oneItems.has(u) || !sameOthers || one.pt.kinds !== fx.kinds || one.vp.circleOf.length !== cands.length - 1) bad.push({ o, u, total: one.pt.total, expectTotal });
			}
			assert(bad.length === 0, '◎切替(1) ' + key + ' ' + cands.length + '種を1つずつ○に戻すと、その行だけが従来どおり（合計・ほかの行の Pt・種数）', bad.slice(0, 3));
			// 知らない id は無視する（候補にも合計にも影響しない）
			const withUnknown = await detail(sp.page, Object.assign({}, roster, { keepCircleIds: ['no-such-id', 7, null, ''] }));
			assert(withUnknown.pt.total === fx.def && withUnknown.vp.circleOf.length === fx.cand, '◎切替(1) ' + key + ' keepCircleIds の知らない id・形が崩れた値は無視する', [withUnknown.pt.total, withUnknown.vp.circleOf.length]);
		}
		assert(jsErrors(sp.errors).length === 0, '◎切替(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('◎切替(2) 表示: ◎に上げた行は名前とPtが◎のもの（行の識別・絞り込み・種数は○のまま）／帯の合計・前段の1行', async () => {
		const sp = await openSp({ roster: R2 });
		const d = await detail(sp.page, R2);
		const cands = d.vp.circleCandidates;
		const keepAll = await detail(sp.page, Object.assign({}, R2, { keepCircleIds: cands.map((c) => c[0]) }));
		const keepById = new Map(keepAll.pt.items.map((x) => [x.skillId, x]));
		const rows = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]:not([data-usd-derived])')).map((r) => {
			const nm = r.querySelector('.usd-roster-skillname');
			const pt = r.querySelector('[data-usd-el="pt-line"]');
			return { id: r.getAttribute('data-skill-id'), circle: r.getAttribute('data-usd-circle'), name: nm ? nm.textContent : null, info: nm ? nm.getAttribute('data-usd-info') : null, pt: pt ? pt.textContent : null };
		}));
		const byId = new Map(rows.map((r) => [r.id, r]));
		assert(rows.length === d.vp.visibleIds.length, '◎切替(2) 行の数は○のまま（絞り込みに当たる行は ' + rows.length + '。◎に上げても増えも減りもしない）', { rows: rows.length, visible: d.vp.visibleIds.length });
		const okRows = cands.every(([o, u]) => {
			const r = byId.get(o);
			const lv = keepById.get(o).hintLevel;
			// C-168: 行の Pt は「○の分と◎の分の合算」（◎は○のヒントLvを援用するので、同じ Lv でそれぞれ割り引いて足す）。詳しくは blocks-32.mjs「◎合算」
			return r && r.circle === u && r.name === nameOf(u) && r.info === u && r.pt === (ptOf(PT.get(u).pt, lv) + ptOf(PT.get(o).pt, lv)) + ' Pt';
		});
		assert(okRows, '◎切替(2) ◎に上げた行（' + cands.length + '種）は、名前が◎のもの・Pt は○の分と◎の合算（行の識別は○のまま・説明の小窓も◎）', cands.filter(([o, u]) => { const r = byId.get(o); return !(r && r.circle === u && r.name === nameOf(u)); }).slice(0, 3));
		const others = rows.filter((r) => !r.circle);
		assert(others.length > 0 && others.every((r) => r.name === nameOf(r.id) || r.name === null), '◎切替(2) 切り替えの対象でない行（' + others.length + '行）は従来どおり（名前は自分のもの）', others.slice(0, 3));
		// 帯の合計（①の「X Pt/N種」）と前段の1行
		const band = await sp.page.evaluate(() => {
			const t = (s) => { const e = document.querySelector('#deck-roster-panel ' + s); return e ? e.textContent : null; };
			return { total: t('[data-usd-el="pt-total"]'), count: t('[data-usd-el="pt-count"]'), prev: t('[data-usd-el="pt-prev"]') };
		});
		assert(numOf(band.total) === FIX.R2.def && numOf(band.count) === FIX.R2.kinds, '◎切替(2) 帯の「X Pt/N種」は ' + FIX.R2.def + ' Pt／' + FIX.R2.kinds + '種', band);
		const prevText = band.prev || '';
		// 2026-10-18（作業4・おいもさんの決定）: 上の1行は「ヒントLv0」のグループだけ。◎に上げた○（行の Pt に合算済み）は出さない。出るのは金スキルの下位の白だけ
		assert(cands.every(([o]) => !prevText.includes(nameOf(o))) && /^ヒントLv0：/.test(prevText) && !/ヒントLv[1-9]/.test(prevText), '◎切替(2) 上の1行に、◎に上げた○の名前は出ない（ヒントLv0 のグループだけ）', prevText.slice(0, 120));
		assert(jsErrors(sp.errors).length === 0, '◎切替(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
	/* ====================================================================
	 * (3)〜(5) 切り替え・保存・リセット・元に戻す・説明の小窓（A-2）
	 * ==================================================================== */
	const BAR = '#deck-set-bar ';
	const P = '#deck-roster-panel ';
	const TOG = P + '[data-usd-el="circle-toggle"]';
	// C-168: 行の◎／○の切り替えボタンは、見出しの◎のボタンが「入」のときだけ出る。この塊（3)〜(5)）は切り替えを使うので、先に「入」にする。
	// 通常の状態で出ないこと・入で出ること・並びは blocks-33.mjs「◎ボタン」で見る
	const circleOn = async (page) => {
		const b = page.locator(P + '[data-usd-act="sort-tone"][data-tone="circle"]');
		if ((await b.getAttribute('aria-pressed')) !== 'true') { await b.click(); await page.waitForTimeout(250); }
	};
	const rawDraft = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
	const draftR = async (page) => JSON.parse(await rawDraft(page));
	const rawUd = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
	const rowInfo = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]:not([data-usd-derived])')).map((r) => {
		const nm = r.querySelector('.usd-roster-skillname');
		const pt = r.querySelector('[data-usd-el="pt-line"]');
		const tg = r.querySelector('[data-usd-el="circle-toggle"]');
		return { id: r.getAttribute('data-skill-id'), circle: r.getAttribute('data-usd-circle'), name: nm ? nm.textContent : null, pt: pt ? pt.textContent : null,
			tog: tg ? { mark: tg.textContent, pressed: tg.getAttribute('aria-pressed') } : null };
	}));
	const bandTotal = (page) => page.evaluate(() => Number(document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]').textContent.replace(/[^0-9]/g, '')));
	const undo = async (page) => { await page.click('#deck-undo-btn'); await page.waitForTimeout(350); };

	await block('◎切替(3) 切り替え: 既定は◎・押すと○（名前とPtと合計が変わる）・もう一度で◎・タップ領域44px以上で行の高さは増えない・押せない見た目にしない', async () => {
		const sp = await openSp({ roster: R2, w: 390 });
		await circleOn(sp.page);
		const rows0 = await rowInfo(sp.page);
		const cand = rows0.filter((r) => r.tog);
		assert(cand.length === FIX.R2.cand && cand.every((r) => r.tog.mark === '◎' && r.tog.pressed === 'true' && r.circle), '◎切替(3) 切り替えは対象の ' + FIX.R2.cand + '行だけに出て、既定は◎（押している）', cand.length);
		assert(rows0.filter((r) => !r.tog).every((r) => !r.circle), '◎切替(3) 対象でない行には切り替えを出さない（' + rows0.filter((r) => !r.tog).length + '行）', null);
		// 見た目: 押せる（無効にしない）・幅44px以上・行の高さは対象でない行と同じ
		const geo = await sp.page.evaluate(() => {
			const btn = document.querySelector('#deck-roster-panel [data-usd-el="circle-toggle"]');
			const cell = btn.closest('.usd-roster-gc--name');
			const hs = (rows) => rows.map((r) => r.querySelector('.usd-roster-gc--name').getBoundingClientRect().height);
			const all = Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]:not([data-usd-derived])'));
			const withBtn = all.filter((r) => r.querySelector('[data-usd-el="circle-toggle"]'));
			const without = all.filter((r) => !r.querySelector('[data-usd-el="circle-toggle"]'));
			const b = btn.getBoundingClientRect(), c = cell.getBoundingClientRect();
			const mark = btn.querySelector('.usd-circle-mark').getBoundingClientRect();
			const cs = getComputedStyle(btn);
			return { w: b.width, h: b.height, cellH: c.height, markW: mark.width, markH: mark.height, disabled: btn.disabled, opacity: cs.opacity, cursor: cs.cursor, pe: cs.pointerEvents,
				hWith: hs(withBtn), hWithout: hs(without), docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
		});
		const minWithout = Math.min(...geo.hWithout), maxWithout = Math.max(...geo.hWithout);
		assert(geo.w >= 44 && geo.h >= geo.cellH - 1 && !geo.disabled && geo.opacity === '1' && geo.cursor === 'pointer' && geo.pe !== 'none', '◎切替(3) 押せる範囲は幅44px以上で行の高さいっぱい（無効の灰色にしない）', geo);
		assert(geo.hWith.every((h) => h >= minWithout - 0.5 && h <= maxWithout + 0.5), '◎切替(3) 切り替えのある行の高さは、ない行と同じ（行の高さを増やさない）', { with: geo.hWith, without: [minWithout, maxWithout] });
		assert(geo.docScroll <= 0, '◎切替(3) 390px で横スクロールが出ない', geo.docScroll);
		const before = await bandTotal(sp.page);
		const first = cand[0];
		const lv = (await detail(sp.page, Object.assign({}, R2, { keepCircleIds: [first.id] }))).pt.items.find((x) => x.skillId === first.id).hintLevel;
		const upPt = ptOf(PT.get(first.circle).pt, lv);
		await sp.page.click(TOG);
		await sp.page.waitForTimeout(300);
		const rows1 = await rowInfo(sp.page);
		const r1 = rows1.find((r) => r.id === first.id);
		const mid = await bandTotal(sp.page);
		assert(r1.tog.mark === '○' && r1.tog.pressed === 'false' && !r1.circle && r1.name === nameOf(first.id) && r1.pt && r1.pt !== first.pt, '◎切替(3) 押すとその行が○に戻る（名前・Pt・印）', { first, r1 });
		assert(mid === before - upPt, '◎切替(3) 合計は◎のぶんだけ減る（' + before + ' − ' + upPt + ' ＝ ' + mid + '）', { before, upPt, mid });
		assert(JSON.stringify(rows0.filter((r) => r.id !== first.id)) === JSON.stringify(rows1.filter((r) => r.id !== first.id)), '◎切替(3) ほかの行は1つも変わらない', null);
		assert(rows1.length === rows0.length, '◎切替(3) 行の数は変わらない（絞り込みで出たり消えたりしない）', [rows0.length, rows1.length]);
		const kept = (await draftR(sp.page)).keepCircleIds;
		assert(JSON.stringify(kept) === JSON.stringify([first.id]), '◎切替(3) 保存は keepCircleIds に○のidだけ', kept);
		await sp.page.click(TOG);
		await sp.page.waitForTimeout(300);
		const back = await draftR(sp.page);
		assert(!('keepCircleIds' in back) && (await bandTotal(sp.page)) === before && JSON.stringify(await rowInfo(sp.page)) === JSON.stringify(rows0), '◎切替(3) もう一度押すと◎に戻り、keepCircleIds は項目ごと消える・表も最初と同じ', back.keepCircleIds);
		assert(jsErrors(sp.errors).length === 0, '◎切替(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('◎切替(4) 保存・読み込み・リセット・元に戻す: 項目の無い保存は1バイトも変わらない／知らないidは残す／開き直しで同じ／リセットで既定／1操作で1回戻る', async () => {
		const SAVED = (extra) => ({ schemaVersion: 7, records: [], customSkills: [], templates: [
			{ templateId: 't1', name: 'S1', skillIds: [], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }],
			rosters: [Object.assign({ rosterId: 'r1', name: 'S1', umaId: 'uma-0001', star: 3, awakeningLevel: 5, cardIds: CARDS6.slice(), skillFilter: R2.skillFilter, createdAt: 'x', updatedAt: 'x' }, extra || {})] });
		const open2 = async (userData) => {
			const sp = await openPage(browser, base, 'special.html', { width: 390, height: 900 }, userData);
			await sp.page.evaluate(() => { localStorage.removeItem('umaSkillDeck:draftRoster:special'); localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '0'); });
			await sp.page.reload({ waitUntil: 'networkidle' });
			for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
			await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
			await sp.page.click(BAR + '[data-usd-act="set-list"]');
			const already = await sp.page.evaluate(() => { const i = document.querySelector('[data-usd-el="set-list"] input[value="t1"]'); return !!i && i.checked; });
			if (already) await sp.page.keyboard.press('Escape'); else await sp.page.click('[data-usd-el="set-list"] input[value="t1"]');
			await sp.page.waitForTimeout(900);
			await circleOn(sp.page);
			return sp;
		};
		const rosterOf = async (page) => JSON.parse(await rawUd(page)).rosters[0];
		// (a) keepCircleIds が無い保存データ: 開いて、表を見て、帯の合計を出しても、1バイトも変わらない
		const seed = SAVED();
		const seedRaw = JSON.stringify(seed);
		const sp = await open2(seed);
		assert((await rawUd(sp.page)) === seedRaw, '◎切替(4)(a) keepCircleIds の無い保存データを開いてセットを選んでも、1バイトも変わらない（読み込み時に補わない）', (await rawUd(sp.page) || '').length);
		const rows0 = await rowInfo(sp.page);
		const cand = rows0.filter((r) => r.tog);
		assert(cand.length === FIX.R2.cand && cand.every((r) => r.tog.pressed === 'true'), '◎切替(4)(a) 保存済みの編成も、開き直すと既定の◎（' + FIX.R2.cand + '種）', cand.length);
		assert((await bandTotal(sp.page)) === FIX.R2.def, '◎切替(4)(a) 保存済みの編成の合計 Pt は ' + FIX.R2.def + '（○のままだった ' + FIX.R2.keep + ' から、◎の分だけ増える）', await bandTotal(sp.page));
		// (b) 切り替え→保存→開き直しで同じ
		const a = cand[0], b = cand[1];
		await sp.page.click(P + '[data-usd-el="circle-toggle"][data-skill-id="' + a.id + '"]');
		await sp.page.waitForTimeout(250);
		await sp.page.click(P + '[data-usd-el="circle-toggle"][data-skill-id="' + b.id + '"]');
		await sp.page.waitForTimeout(250);
		const d1 = JSON.parse(await rawUd(sp.page));
		assert(JSON.stringify(d1.rosters[0].keepCircleIds) === JSON.stringify([a.id, b.id]) && d1.schemaVersion === 7, '◎切替(4)(b) 2つ切り替えると rosters の keepCircleIds に○のidが順に入る（schemaVersion は 7 のまま）', d1.rosters[0].keepCircleIds);
		const total2 = await bandTotal(sp.page);
		const rowsAfter = await rowInfo(sp.page);
		// 開き直し: 保存した中身をそのまま別の画面に入れて開く（この画面のまま読み込み直すと、検査の仕組みが元のデータを入れ直すため）
		const savedNow = await rawUd(sp.page);
		const spR = await open2(JSON.parse(savedNow));
		assert(JSON.stringify(await rowInfo(spR.page)) === JSON.stringify(rowsAfter) && (await bandTotal(spR.page)) === total2 && (await rawUd(spR.page)) === savedNow,
			'◎切替(4)(b) 開き直しても、行の名前・Pt・印・合計が同じ（保存データも1バイトも変わらない）', { total2, now: await bandTotal(spR.page) });
		await spR.ctx.close();
		// (c) 元に戻す: 1回の操作で1回。2回押すと2つとも戻る
		await undo(sp.page);
		let k = (await rosterOf(sp.page)).keepCircleIds;
		assert(JSON.stringify(k) === JSON.stringify([a.id]), '◎切替(4)(c) 「元に戻す」1回で、直前の1つだけが戻る', k);
		await undo(sp.page);
		const r0 = await rosterOf(sp.page);
		assert(!('keepCircleIds' in r0) && (await bandTotal(sp.page)) === FIX.R2.def, '◎切替(4)(c) もう1回で最初に戻る（keepCircleIds は項目ごと消え、合計も既定）', r0.keepCircleIds);
		// (d) リセット（中身をすべて消す）で keepCircleIds も消える。元に戻すで戻る
		await sp.page.click(P + '[data-usd-el="circle-toggle"][data-skill-id="' + a.id + '"]');
		await sp.page.waitForTimeout(250);
		assert(JSON.stringify((await rosterOf(sp.page)).keepCircleIds) === JSON.stringify([a.id]), '◎切替(4)(d) 前提: ○に戻した状態を保存できた', null);
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(400);
		const cleared = await rosterOf(sp.page);
		assert(!('keepCircleIds' in cleared) && cleared.umaId === '', '◎切替(4)(d) 「中身をすべて消す」で keepCircleIds も消える（既定の◎に戻る）', cleared.keepCircleIds);
		await undo(sp.page);
		const restored = await rosterOf(sp.page);
		assert(JSON.stringify(restored.keepCircleIds) === JSON.stringify([a.id]) && restored.umaId === 'uma-0001', '◎切替(4)(d) 「元に戻す」で、リセット前（keepCircleIds も衣装も）に戻る', restored.keepCircleIds);
		assert(jsErrors(sp.errors).length === 0, '◎切替(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// (e) 知らない id・形が崩れた値は無視し、保存値は書き換えない。切り替えたのはその1つだけ（知らない id は残る）
		const seed2 = SAVED({ keepCircleIds: ['no-such-id', 5] });
		const sp2 = await open2(seed2);
		assert((await rawUd(sp2.page)) === JSON.stringify(seed2), '◎切替(4)(e) 知らない id・崩れた値の入った保存データも、開いただけでは1バイトも変わらない', null);
		const r2 = await rowInfo(sp2.page);
		assert(r2.filter((r) => r.tog && r.tog.pressed === 'true').length === FIX.R2.cand && (await bandTotal(sp2.page)) === FIX.R2.def, '◎切替(4)(e) 知らない id は無視して、すべて既定の◎で数える', await bandTotal(sp2.page));
		const t = r2.find((r) => r.tog).id;
		await sp2.page.click(P + '[data-usd-el="circle-toggle"][data-skill-id="' + t + '"]');
		await sp2.page.waitForTimeout(250);
		const k2 = (await rosterOf(sp2.page)).keepCircleIds;
		assert(JSON.stringify(k2) === JSON.stringify(['no-such-id', 5, t]), '◎切替(4)(e) 切り替えたのはその1つだけ（知らない id は残したまま足す）', k2);
		await sp2.page.click(P + '[data-usd-el="circle-toggle"][data-skill-id="' + t + '"]');
		await sp2.page.waitForTimeout(250);
		const k3 = (await rosterOf(sp2.page)).keepCircleIds;
		assert(JSON.stringify(k3) === JSON.stringify(['no-such-id', 5]), '◎切替(4)(e) ◎に戻すと、その1つだけを外す（知らない id は残る）', k3);
		await sp2.ctx.close();
	});

	await block('◎切替(5) 説明の小窓: ◎に上げると、○を取得したうえで◎を買う前提でPtを数えます（対象があるときだけ。1〜2行）', async () => {
		const sp = await openSp({ roster: R2, w: 390 });
		await sp.page.click(P + '[data-usd-act="pt-help"]');
		await sp.page.waitForTimeout(300);
		const t = await sp.page.evaluate(() => { const e = document.querySelector('[data-usd-el="info-circle"]'); return e ? { text: e.textContent, h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) } : null; });
		// 対象の○をすべて「取得しない」にすると、切り替えの対象は0（表の行はある）
		const candIds = (await detail(sp.page, R2)).vp.circleCandidates.map((c) => c[0]);
		assert(t && t.text === '◎に上げると、○を取得したうえで◎を買う前提でPtを数えます' && t.h <= t.lh * 2 + 1, '◎切替(5) 説明の小窓に1〜2行の説明が出る', t);
		await sp.ctx.close();
		const spN = await openSp({ roster: Object.assign({}, R2, { offSkillIds: candIds }), w: 390 });
		await spN.page.click(P + '[data-usd-act="pt-help"]');
		await spN.page.waitForTimeout(300);
		const n = await spN.page.evaluate(() => !!document.querySelector('[data-usd-el="info-circle"]'));
		const cnt = (await detail(spN.page, Object.assign({}, R2, { offSkillIds: candIds }))).vp.circleCandidates.length;
		assert(cnt === 0 && !n, '◎切替(5) 切り替えの対象が無い編成では、説明も出さない（対象 ' + cnt + '種）', { n, cnt });
		await spN.ctx.close();
	});

	function numOf(s) { return Number(String(s).replace(/[^0-9]/g, '')); }
}
