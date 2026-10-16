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
		R1: { cand: 16, def: 8236, keep: 6949, defPrev: 1464, keepPrev: 360, kinds: 64 },
		R2: { cand: 10, def: 5043, keep: 4224, defPrev: 1050, keepPrev: 360, kinds: 38 }
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
		const rows = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')).map((r) => {
			const nm = r.querySelector('.usd-roster-skillname');
			const pt = r.querySelector('[data-usd-el="pt-line"]');
			return { id: r.getAttribute('data-skill-id'), circle: r.getAttribute('data-usd-circle'), name: nm ? nm.textContent : null, info: nm ? nm.getAttribute('data-usd-info') : null, pt: pt ? pt.textContent : null };
		}));
		const byId = new Map(rows.map((r) => [r.id, r]));
		assert(rows.length === d.vp.visibleIds.length, '◎切替(2) 行の数は○のまま（絞り込みに当たる行は ' + rows.length + '。◎に上げても増えも減りもしない）', { rows: rows.length, visible: d.vp.visibleIds.length });
		const okRows = cands.every(([o, u]) => {
			const r = byId.get(o);
			const lv = keepById.get(o).hintLevel;
			return r && r.circle === u && r.name === nameOf(u) && r.info === u && r.pt === ptOf(PT.get(u).pt, lv) + ' Pt';
		});
		assert(okRows, '◎切替(2) ◎に上げた行（' + cands.length + '種）は、名前と Pt が◎のもの（行の識別は○のまま・説明の小窓も◎）', cands.filter(([o, u]) => { const r = byId.get(o); return !(r && r.circle === u && r.name === nameOf(u)); }).slice(0, 3));
		const others = rows.filter((r) => !r.circle);
		assert(others.length > 0 && others.every((r) => r.name === nameOf(r.id) || r.name === null), '◎切替(2) 切り替えの対象でない行（' + others.length + '行）は従来どおり（名前は自分のもの）', others.slice(0, 3));
		// 帯の合計（①の「X Pt/N種」）と前段の1行
		const band = await sp.page.evaluate(() => {
			const t = (s) => { const e = document.querySelector('#deck-roster-panel ' + s); return e ? e.textContent : null; };
			return { total: t('[data-usd-el="pt-total"]'), count: t('[data-usd-el="pt-count"]'), prev: t('[data-usd-el="pt-prev"]') };
		});
		assert(numOf(band.total) === FIX.R2.def && numOf(band.count) === FIX.R2.kinds, '◎切替(2) 帯の「X Pt/N種」は ' + FIX.R2.def + ' Pt／' + FIX.R2.kinds + '種', band);
		const prevText = band.prev || '';
		assert(cands.every(([o]) => prevText.includes(nameOf(o))), '◎切替(2) 「前段として必要」の1行に、◎に上げた○の名前が出る', prevText.slice(0, 120));
		assert(jsErrors(sp.errors).length === 0, '◎切替(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
	function numOf(s) { return Number(String(s).replace(/[^0-9]/g, '')); }
}
