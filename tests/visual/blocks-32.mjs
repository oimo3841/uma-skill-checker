// ◎の行の Pt の合算と説明の小窓（C-168・2026-10-16）の検査。run-smoke.mjs の末尾から register32() で呼ばれる
// （塊の見出しはすべて「◎合算」で始まる。`npm run test:visual -- --only=◎合算` で回せる）。
//
// 決め: ◎として数えている行（○を前段に持つ行）の Pt は「○の分と◎の分の合算」として、行の表示と説明の小窓の両方に出す。
//   小窓の「基礎」「いまの設定」も合算にし、◎の行にだけ「リストのPtは○と◎の合算です」の1行を出す。「Lv は ○○ のものです」の行は削除（自明なため）。
//   ○に戻した行は今までどおり○だけ。合計 Pt・種数・●／△の数は変えない（計算の層は触らない）。
//
// (1) 計算の層は変わらない（271衣装の単独・REAL・VARY の出力ハッシュは、変更前の commit と同一。手で比べた値を固定で持つ）＋
//     ◎の行の総当たり: 行の Pt ＝ ○の分 ＋ ◎の分（独立な式）／行の Pt を全部足すと合計に一致する
// (2) 行の表示（実画面）
// (3) 説明の小窓（Lv の行が無い・合算の1行は◎の行にだけ・基礎／いまの設定が合算）

export async function register32(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const UMAS = readJson('data/training-umamusume.json').entries.map((u) => u.id);
	const CARDS = readJson('data/support-cards.json').entries.map((c) => c.id);
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const RULES = readJson('data/skill-pt-rules.json');
	const P = '#deck-roster-panel ';
	const R1 = { umaId: 'uma-0001', cardIds: CARDS6 };
	const R2 = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
	const VARY = { umaId: 'uma-0192', cardIds: ['card-0273', 'card-0288', 'card-0311', 'card-0346', 'card-0405', 'card-0248'] };
	/** 基礎値・ヒントLv・状態なし → 支払う Pt（rules の割引率・丸めの式を、検査の側で書く） */
	const ptOf = (base, level) => {
		const pct = level > 0 ? RULES.hintDiscountPercent[Math.min(level, RULES.hintDiscountPercent.length) - 1] : 0;
		const n = base * (100 - pct);
		return RULES.rounding === 'floor' ? Math.floor(n / 100) : Math.round(n / 100);
	};

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		const roster = Object.assign({}, R1, o.roster || {});
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

	/* 変更前（直前の commit）と同じ出力のハッシュ。変更前の commit（コアの版 2026-10-16n）で同じ検査を回して固定した（2026-10-16。271衣装の単独・REAL・R2〔絞り込み〕・VARY の
	 * getRosterPtDetail・getRosterVisiblePart・computeRosterSkills の出力を JSON にして SHA-256 の先頭16桁）。計算の層を変えたら変わる */
	const HASH = { solo271: '148b3434c01f7408', real: 'c233a84f582ba98d', r2: '2e74a955752d79c6', vary: '49545117935c03cb' };

	await block('◎合算(1) 計算の層は変わらない: 271衣装の単独・REAL・絞り込み・VARY の出力ハッシュが変更前と同一', async () => {
		const sp = await openSp({ roster: R1 });
		const got = await sp.page.evaluate(async ({ umas, REAL, R2, VARY }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData(); await C.loadScenarioEvents(false); await C.loadSkillEvolutions(false); await C.loadSkillDescriptions();
			const one = (r) => {
				const res = C.computeRosterSkills(r, { autoChoose: true });
				return JSON.stringify({ pt: C.getRosterPtDetail(r), vp: C.getRosterVisiblePart(r), ids: res.skillIds, n: res.items.length });
			};
			const hex = async (s) => {
				const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
				return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
			};
			const solo = umas.map((id) => one({ umaId: id, cardIds: [null, null, null, null, null, null] }));
			return { solo271: await hex(solo.join('\n')), n: solo.length, real: await hex(one(REAL)), r2: await hex(one(R2)), vary: await hex(one(VARY)) };
		}, { umas: UMAS, REAL: R1, R2, VARY });
		assert(got.n === 271 && got.solo271 === HASH.solo271, '◎合算(1) 271衣装の単独の出力ハッシュ（' + got.solo271 + '）が変更前と同一', got);
		assert(got.real === HASH.real && got.r2 === HASH.r2 && got.vary === HASH.vary, '◎合算(1) REAL・絞り込み・VARY の出力ハッシュが変更前と同一', got);
		assert(jsErrors(sp.errors).length === 0, '◎合算(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('◎合算(1b) 総当たり: ◎として数えている行すべて（実データ）で、行の Pt ＝ ○の分 ＋ ◎の分（独立な式）／行の Pt を全部足すと合計に一致する', async () => {
		const sp = await openSp({ roster: R1 });
		// 271衣装の単独・サポカ1枚ずつ（563枚。育成ウマ娘なし）・REAL・絞り込み・VARY
		const rosters = UMAS.map((id) => ({ umaId: id, cardIds: [null, null, null, null, null, null] }))
			.concat(CARDS.map((id) => ({ umaId: '', cardIds: [id, null, null, null, null, null] })), [R1, R2, VARY]);
		const r = await sp.page.evaluate(async ({ rosters }) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData();
			const rows = [];
			let rostersWithCircle = 0, sumBad = [];
			rosters.forEach((ro, i) => {
				const vp = C.getRosterVisiblePart(ro);
				const d = C.getRosterPtDetail(ro);
				if (!d || vp.circleOf.length === 0) return;
				rostersWithCircle++;
				// 行の Pt を全部足す: ◎でない項目 ＋ ◎の行（合算）＋ 前段の項目のうち◎の行の○でないもの
				const ups = new Map(vp.circleOf);   // ○ → ◎
				const baseIds = new Set(vp.circleOf.map((x) => x[0]));
				let sum = 0, bad = false;
				d.items.forEach((x) => { if (!Array.from(ups.values()).includes(x.skillId)) sum += x.pt === null ? 0 : x.pt; });
				d.prevItems.forEach((x) => { if (!baseIds.has(x.skillId)) sum += x.pt === null ? 0 : x.pt; });
				vp.circleOf.forEach(([o, u]) => {
					const up = d.items.find((x) => x.skillId === u);
					const prev = d.prevItems.find((x) => x.skillId === o);
					const cb = C.circleComboOf({ items: d.items, prevItems: d.prevItems }, o, u);
					rows.push({ ro: i, o, u, upBase: up ? up.base : null, upPt: up ? up.pt : null, upLv: up ? up.hintLevel : null, prevBase: prev ? prev.base : null, prevPt: prev ? prev.pt : null, prevLv: prev ? prev.hintLevel : null, cb });
					if (cb) sum += cb.pt; else { bad = true; sum += (up && up.pt !== null ? up.pt : 0) + (prev && prev.pt !== null ? prev.pt : 0); }
				});
				if (sum !== d.total) sumBad.push({ ro: i, sum, total: d.total });
			});
			return { rows, rostersWithCircle, sumBad: sumBad.slice(0, 5), sumBadN: sumBad.length };
		}, { rosters });
		const wrong = [];
		let combos = 0, nulls = 0;
		r.rows.forEach((x) => {
			if (!x.cb) { nulls++; return; }
			combos++;
			// 独立な式: 基礎値は skill-pt.json から、ヒントLv は計算の項目の値（◎は○の Lv を援用するので同じ）、それぞれ独立に割り引いて足す
			const eUp = PT.get(x.u), eO = PT.get(x.o);
			const want = ptOf(eUp.pt, x.upLv) + ptOf(eO.pt, x.prevLv);
			if (x.cb.pt !== want || x.cb.base !== eUp.pt + eO.pt || x.cb.pt !== x.upPt + x.prevPt || x.upLv !== x.prevLv) wrong.push(x);
		});
		assert(combos > 100 && wrong.length === 0, '◎合算(1b) ◎の行 ' + combos + '件（' + r.rostersWithCircle + '編成）すべてで、合算 ＝ ○の分 ＋ ◎の分', { combos, wrong: wrong.slice(0, 3) });
		assert(nulls === 0, '◎合算(1b) 合算できない行（Pt 未収録）は 0 件', nulls);
		assert(r.sumBadN === 0, '◎合算(1b) 行の Pt（◎は合算）を全部足すと、合計 Pt に一致する（' + r.rostersWithCircle + '編成）', r.sumBad);
		console.log('       ◎合算(1b) 総当たりの件数: ◎の行 ' + combos + '件／' + r.rostersWithCircle + '編成（' + rosters.length + '編成のうち）');
		await sp.ctx.close();
	});

	await block('◎合算(2) 行の表示: ◎の行の Pt は「○の分 ＋ ◎の分」（実画面）／○に戻した行は○だけ／○の行の Pt・帯の合計は変わらない', async () => {
		const sp = await openSp({ roster: R1 });
		const d = await detail(sp.page, R1);
		const cands = d.vp.circleCandidates;
		const rows = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')).map((r) => {
			const pt = r.querySelector('[data-usd-el="pt-line"]');
			return { id: r.getAttribute('data-skill-id'), circle: r.getAttribute('data-usd-circle'), pt: pt ? pt.textContent : null };
		}));
		const byId = new Map(rows.map((r) => [r.id, r]));
		const bad = [];
		cands.forEach(([o, u]) => {
			const up = d.pt.items.find((x) => x.skillId === u), prev = d.pt.prevItems.find((x) => x.skillId === o);
			const want = ptOf(PT.get(u).pt, up.hintLevel) + ptOf(PT.get(o).pt, prev.hintLevel);
			const r = byId.get(o);
			if (!r || r.circle !== u || r.pt !== want + ' Pt') bad.push({ o, u, want, r });
		});
		assert(cands.length > 0 && bad.length === 0, '◎合算(2) ◎の行（' + cands.length + '種）の Pt は ○の分 ＋ ◎の分', bad.slice(0, 3));
		// 合計の帯は変わらない（固定: R1 の既定◎の合計）
		const total = await sp.page.evaluate(() => Number(document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]').textContent.replace(/[^0-9]/g, '')));
		assert(total === 8236, '◎合算(2) 帯の合計は 8236 Pt のまま', total);
		// ○に戻した行は○だけ
		const keep = cands[0][0];
		const spK = await openSp({ roster: Object.assign({}, R1, { keepCircleIds: [keep] }) });
		const dk = await detail(spK.page, Object.assign({}, R1, { keepCircleIds: [keep] }));
		const rk = await spK.page.evaluate((id) => { const r = document.querySelector('#deck-roster-panel .usd-roster-grow[data-skill-id="' + id + '"]'); const pt = r.querySelector('[data-usd-el="pt-line"]'); return { circle: r.getAttribute('data-usd-circle'), pt: pt ? pt.textContent : null }; }, keep);
		const own = dk.pt.items.find((x) => x.skillId === keep);
		assert(!rk.circle && own && rk.pt === own.pt + ' Pt', '◎合算(2) ○に戻した行は今までどおり○だけの Pt', { rk, own: own && own.pt });
		assert(jsErrors(sp.errors).length === 0 && jsErrors(spK.errors).length === 0, '◎合算(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		await spK.ctx.close();
	});

	await block('◎合算(3) 説明の小窓: 「Lv は…のものです」の行が無い／◎の行にだけ「リストのPtは○と◎の合算です」／基礎・いまの設定が合算', async () => {
		const sp = await openSp({ roster: R1 });
		const d = await detail(sp.page, R1);
		const cands = d.vp.circleCandidates;
		const info = async (id) => {
			await sp.page.click(P + '.usd-roster-skillname[data-usd-info="' + id + '"]');
			await sp.page.waitForSelector('[data-usd-el="info-body"]', { state: 'visible' });
			const r = await sp.page.evaluate(() => {
				const t = (s) => { const e = document.querySelector('[data-usd-el="' + s + '"]'); return e ? e.textContent : null; };
				const lines = Array.from(document.querySelectorAll('[data-usd-el="info-body"] p')).map((p) => p.textContent);
				return { pt: t('info-pt'), now: t('info-pt-now'), combined: t('info-pt-combined'), root: t('info-root'), lines, combinedN: document.querySelectorAll('[data-usd-el="info-pt-combined"]').length };
			});
			await sp.page.click('[data-usd-el="info-close"]');
			await sp.page.waitForTimeout(150);
			return r;
		};
		// ◎の行（全部）
		const bad = [];
		let asked = 0;
		for (const [o, u] of cands) {
			const up = d.pt.items.find((x) => x.skillId === u), prev = d.pt.prevItems.find((x) => x.skillId === o);
			const r = await info(u);
			asked++;
			const base = PT.get(u).pt + PT.get(o).pt;
			const now = ptOf(PT.get(u).pt, up.hintLevel) + ptOf(PT.get(o).pt, prev.hintLevel);
			const okBase = base === 0 ? r.pt === 'Pt 不要' : r.pt === '基礎 ' + base + ' Pt';
			const okNow = base === 0 ? r.now === null : r.now === 'いまの設定：' + now + ' Pt（Lv' + up.hintLevel + '）';
			if (!(okBase && okNow && r.combined === 'リストのPtは○と◎の合算です' && r.combinedN === 1 && r.root === null && !r.lines.some((x) => /^Lv は/.test(x)))) bad.push({ o, u, r });
		}
		assert(asked > 0 && bad.length === 0, '◎合算(3) ◎の行（' + asked + '種）の小窓: 基礎・いまの設定は合算・合算の1行がちょうど1つ・Lv の行は無い', bad.slice(0, 2));
		// ◎として数えていない行（○に戻した行・◎の行でない行）には合算の1行も Lv の行も出ない
		const rowIds = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]:not([data-usd-circle]) .usd-roster-skillname')).map((e) => e.getAttribute('data-usd-info')));
		const others = [];
		for (const id of rowIds.slice(0, 12)) { const r = await info(id); if (r.combined !== null || r.root !== null || r.lines.some((x) => /^Lv は/.test(x))) others.push({ id, r }); }
		assert(rowIds.length > 0 && others.length === 0, '◎合算(3) ◎の行でない行（' + Math.min(rowIds.length, 12) + '行を確認）には合算の1行も「Lv は」の行も出ない', others.slice(0, 2));
		// ○に戻した行
		const keep = cands[0][0];
		const spK = await openSp({ roster: Object.assign({}, R1, { keepCircleIds: [keep] }) });
		await spK.page.click(P + '.usd-roster-skillname[data-usd-info="' + keep + '"]');
		await spK.page.waitForSelector('[data-usd-el="info-body"]', { state: 'visible' });
		const rk = await spK.page.evaluate(() => ({ combined: !!document.querySelector('[data-usd-el="info-pt-combined"]'), root: !!document.querySelector('[data-usd-el="info-root"]'), pt: (document.querySelector('[data-usd-el="info-pt"]') || {}).textContent }));
		assert(!rk.combined && !rk.root && rk.pt === (PT.get(keep).pt === 0 ? 'Pt 不要' : '基礎 ' + PT.get(keep).pt + ' Pt'), '◎合算(3) ○に戻した行の小窓は、○の基礎Ptのまま・合算の1行は出ない', rk);
		// 記号の字形は画面のスキル名と同じ（○＝U+25CB・◎＝U+25CE）
		const name = await sp.page.evaluate((id) => document.querySelector('#deck-roster-panel .usd-roster-skillname[data-usd-info="' + id + '"]').textContent, cands[0][1]);
		assert(name.includes('◎') && 'リストのPtは○と◎の合算です'.includes('○') && 'リストのPtは○と◎の合算です'.includes('◎'), '◎合算(3) 小窓の記号の字形は、画面のスキル名と同じ（○ U+25CB・◎ U+25CE）', name);
		assert(jsErrors(sp.errors).length === 0 && jsErrors(spK.errors).length === 0, '◎合算(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		await spK.ctx.close();
	});
}
