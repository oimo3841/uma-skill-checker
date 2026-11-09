// T157（2026-11-09・決定 630〜632）: UmaStar 新UI の照合の直しの検査。run-smoke.mjs の末尾から register160() で呼ばれる
// （塊の見出しはすべて「T157」で始まる。`npm run test:visual -- --only=T157` で回せる）。
//
// 直したこと（special.html だけ。凍結の common.js は変えていない）:
//  - 453: ③の照合の辞書（allSkillNamesDictionary）から、名前に ◎ を含むものを外す。②の名簿（onDeckScopeSelected）は
//    buildScopeSkillDictionary で作り、◎ と ○ を別の項目として残す（重複の見方を「正規化＋◎の有無」に）。
//  - 544: ③の照合の辞書から金スキル（skill-pt.json の rarity が gold）を外す。照合のあと、同点で捨てた行は、同じ画のすぐ上・すぐ下の
//    決まった行のスキルの並び（core の compareGameOrder）の間に入る候補が1つだけなら採る（pickTiedRowsByGameOrder）。
// 検査は OCR を使わず、作った行（rowKey 付き）を matchWithAllSkillNames に渡して見る（速く、結果が揺れない）。
//  (1) ◎ と ○ の組（データから選ぶ）: ②＝○だけ → ○ が出る。②＝◎だけ → どちらも出ない（○ は②の外として捨てる）。
//      ②＝両方（どちらの順でも）→ ②の名簿に両方が残り、○ だけが出る。③の辞書に ◎ の名前が無い。
//  (2) 金スキル: ③の辞書に金が1つも無く、白は残る。②に金を入れて金の名前の行を渡しても出ない。
//  (3) 並び: データから「1文字だけ違い同点になる組」と、並びで組の1つだけをはさむ上下のスキルを選び、上・同点・下の3行を渡すと、
//      はさまれた1つが出る（★は同点の行の★）。上下を組の全部をはさむ位置にする・同点の行だけ別の画に置く・上の行を1つ離す
//      （となりの行でない）と、今までどおり出ない。
//  (4) 旧UI（手入力のリスト・parseSkillList）: ◎ を照合の索引に入れない。リスト＝◎だけ → ○ の行は出ない・両方 → ○ だけ（リストには両方）。
// 壊す確認: (1) は辞書の ◎ を外すのをやめる・②の名簿を buildSkillDictionary に戻すと NG、(2) は金を外すのをやめると NG、
// (3) は pickTiedRowsByGameOrder を呼ばないと NG（T157 の報告）。
// スキル名は検査の側に書かない（恒久ルール1。データから読んだ名前と id だけ）。

import { reloadReady } from './lib/page-ready.mjs';

export async function register160(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };

	const openSp = async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, EMPTY);
		await sp.page.evaluate(() => { localStorage.setItem('umaSkillDeck:stepTab', '1'); });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => {
			await UmaSkillDeckCore.loadMasterSkills(); await UmaSkillDeckCore.loadSkillPtData(); await UmaSkillDeckCore.loadSkillEvolutions(false);
			const line = (text, rowKey, stars) => ({ text: text, conf: 90, stars: stars === undefined ? 2 : stars, starsReliable: true, rowKey: rowKey });
			const setScope = (ids) => { onDeckScopeSelected({ skillIds: ids, name: '', tiers: {} }); allSkillNamesDict = null; };
			const match = (lines) => {
				allSkillNamesDict = null;
				const r = matchWithAllSkillNames(lines);
				return { detected: Array.from(r.detectedSkills), stars: r.skillStars, outside: (r.devOutsideScope || []).map((x) => x.name),
					amb: (r.devAmbiguous || []).map((a) => ({ rowKey: a.rowKey, resolved: a.resolved, survivors: a.survivors, byOrder: a.byOrder || null })) };
			};
			const all = UmaSkillDeckCore.getMasterSkills().map((s) => ({ id: s.id, name: s.name }))
				.concat(UmaSkillDeckCore.getExtraCatalog().filter((x) => !UmaSkillDeckCore.isEvolvedSkillId(x.id)).map((x) => ({ id: x.id, name: x.name })));
			window.__t157 = { line, setScope, match, all };
		});
		return sp;
	};

	await block('T157 (1) ◎と○（453）: ②に◎だけなら○を出さない・両方なら②の名簿に両方残り○だけが出る・③の辞書に◎が無い', async () => {
		const sp = await openSp();
		try {
			const r = await sp.page.evaluate(() => {
				const { line, setScope, match, all } = window.__t157;
				const byName = new Map(all.map((s) => [s.name, s]));
				const pair = all.filter((s) => /◎$/.test(s.name) && byName.has(s.name.replace(/◎$/, '○')))
					.map((s) => ({ dbl: s, cir: byName.get(s.name.replace(/◎$/, '○')) }))[0];
				if (!pair) return { pair: null };
				const lines = [line(pair.cir.name, '0:0')];
				const out = { pair: { dbl: pair.dbl.name, cir: pair.cir.name } };
				setScope([pair.cir.id]); out.cir = { list: skillList.slice(), m: match(lines) };
				setScope([pair.dbl.id]); out.dbl = { list: skillList.slice(), m: match(lines) };
				setScope([pair.dbl.id, pair.cir.id]); out.both = { list: skillList.slice(), m: match(lines) };
				setScope([pair.cir.id, pair.dbl.id]); out.bothR = { list: skillList.slice(), m: match(lines) };
				out.dictDbl = allSkillNamesDictionary().list.filter((n) => n.indexOf('◎') !== -1);
				return out;
			});
			assert(!!r.pair, 'T157(1) データに ◎ と ○ の組がある', r.pair);
			if (!r.pair) return;
			const { dbl, cir } = r.pair;
			assert(r.cir.m.detected.includes(cir) && !r.cir.m.detected.includes(dbl), 'T157(1) ②＝○だけ: ○ が出る', r.cir.m.detected);
			assert(!r.dbl.m.detected.includes(cir) && !r.dbl.m.detected.includes(dbl) && r.dbl.m.outside.includes(cir), 'T157(1) ②＝◎だけ: ○ も ◎ も出ない（○ は②の外として捨てる）', r.dbl.m);
			for (const k of ['both', 'bothR']) {
				assert(r[k].list.includes(dbl) && r[k].list.includes(cir), 'T157(1) ②＝両方（' + (k === 'both' ? '◎→○' : '○→◎') + '）: ②の名簿に ◎ と ○ が両方残る', r[k].list);
				assert(r[k].m.detected.includes(cir) && !r[k].m.detected.includes(dbl), 'T157(1) ②＝両方（' + (k === 'both' ? '◎→○' : '○→◎') + '）: ○ だけが出る', r[k].m.detected);
			}
			assert(r.dictDbl.length === 0, 'T157(1) ③の照合の辞書に ◎ の名前が無い', r.dictDbl.slice(0, 5));
			assert(jsErrors(sp.errors).length === 0, 'T157(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T157 (2) 金スキル（544）: ③の照合の辞書に金が無く、②に金を入れても金の名前の行は出ない', async () => {
		const sp = await openSp();
		try {
			const r = await sp.page.evaluate(() => {
				const { line, setScope, match, all } = window.__t157;
				const pt = UmaSkillDeckCore.getSkillPtData().skillPt;
				const rarity = (id) => { const row = pt instanceof Map ? pt.get(id) : null; return row ? row.rarity : null; };
				const golds = all.filter((s) => rarity(s.id) === 'gold');
				const whites = all.filter((s) => rarity(s.id) === 'white');
				const dict = allSkillNamesDictionary().list;
				const goldNames = new Set(golds.map((s) => s.name));
				const g = golds[0], w = whites[0];
				setScope([g.id, w.id]);
				const m = match([line(g.name, '0:0'), line(w.name, '0:1')]);
				return { golds: golds.length, whites: whites.length, goldInDict: dict.filter((n) => goldNames.has(n)), whiteMissing: whites.filter((s) => s.name.indexOf('◎') === -1 && !dict.some((n) => normalizeText(n) === normalizeText(s.name))).map((s) => s.name),
					g: g.name, w: w.name, detected: m.detected };
			});
			assert(r.golds > 0 && r.whites > 0, 'T157(2) データに金と白がある', { golds: r.golds, whites: r.whites });
			assert(r.goldInDict.length === 0, 'T157(2) ③の照合の辞書に金の名前が無い', r.goldInDict.slice(0, 5));
			assert(r.whiteMissing.length === 0, 'T157(2) 白（◎ を除く）は全部辞書に残る（正規化が同じ名前はどちらか1つ）', r.whiteMissing.slice(0, 10));
			assert(!r.detected.includes(r.g) && r.detected.includes(r.w), 'T157(2) ②に金を入れても金の名前の行は出ない（白は出る）', r.detected);
			assert(jsErrors(sp.errors).length === 0, 'T157(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T157 (3) 同点の行を並びで決める（544）: 上下の行が組の1つだけをはさめば採り、決まらなければ今までどおり捨てる', async () => {
		const sp = await openSp();
		try {
			const r = await sp.page.evaluate(() => {
				const { line, setScope, match } = window.__t157;
				const dict = allSkillNamesDictionary();
				const cmp = UmaSkillDeckCore.compareGameOrder;
				const known = (n) => { const id = allSkillIdByName.get(n); return (id !== undefined && cmp(id, '0') < 0) ? id : null; };
				const order = dict.list.filter((n) => known(n) !== null).sort((a, b) => cmp(known(a), known(b)));
				// 1文字だけ違う組（正規化のあと6文字以上・同じ長さ）
				const groups = new Map();
				dict.index.forEach((s) => {
					if (s.norm.length < 6 || known(s.raw) === null) return;
					for (let i = 0; i < s.norm.length; i++) {
						const k = s.norm.slice(0, i) + '\u0000' + s.norm.slice(i + 1);
						if (!groups.has(k)) groups.set(k, []);
						groups.get(k).push(s.raw);
					}
				});
				const DUMMY = '鬱';
				for (const [k, members] of groups) {
					if (members.length < 2 || k.indexOf(DUMMY) !== -1) continue;
					const sorted = members.slice().sort((a, b) => cmp(known(a), known(b)));
					const x = sorted[0], last = sorted[sorted.length - 1];
					const ix = order.indexOf(x), il = order.indexOf(last);
					const up = order[ix - 1], down = order[ix + 1], wideDown = order[il + 1];
					if (!up || !down || !wideDown || members.includes(up) || members.includes(down) || members.includes(wideDown)) continue;
					const pos = k.indexOf('\u0000');
					const norm = normalizeText(x);
					const tieText = norm.slice(0, pos) + DUMMY + norm.slice(pos + 1);
					const ids = members.map(known).concat([known(up), known(down), known(wideDown)]);
					setScope(ids);
					// 同点の行だけ（上下なし）で、組の2つ以上が残って捨てられることを先に確かめる
					const solo = match([line(tieText, '0:4')]);
					const a0 = solo.amb.find((a) => a.rowKey === '0:4');
					if (!a0 || a0.resolved || a0.survivors.length < 2 || solo.detected.length > 0) continue;
					return {
						group: members, x, up, down, wideDown, tieText, solo,
						pos: match([line(up, '0:3'), line(tieText, '0:4', 3), line(down, '0:5')]),
						wide: match([line(up, '0:3'), line(tieText, '0:4', 3), line(wideDown, '0:5')]),
						otherImg: match([line(up, '0:3'), line(tieText, '1:4', 3), line(down, '0:5')]),
						gap: match([line(up, '0:2'), line(tieText, '0:4', 3), line(down, '0:5')])
					};
				}
				return null;
			});
			assert(!!r, 'T157(3) データから、同点になる組と、並びで組の1つだけをはさむ上下のスキルが選べる', r);
			if (!r) return;
			const info = { group: r.group, x: r.x, up: r.up, down: r.down, wideDown: r.wideDown };
			assert(r.pos.detected.includes(r.x) && r.pos.detected.length === 3, 'T157(3) 上・同点・下の3行: はさまれた1つ（' + r.group.length + '個の組の先頭）が出る', { ...info, detected: r.pos.detected });
			assert(r.pos.stars[r.x] === 3, 'T157(3) 並びで決めたスキルの★は同点の行の★', r.pos.stars);
			const amb = r.pos.amb.find((a) => a.rowKey === '0:4');
			assert(!!amb && !amb.resolved && amb.byOrder && amb.byOrder.picked === r.x, 'T157(3) 開発ログの同点の記録に、並びで決めたことが残る', amb);
			assert(!r.wide.detected.some((n) => r.group.includes(n)), 'T157(3) 上下が組の全部をはさむ: 決めない（今までどおり捨てる）', { ...info, detected: r.wide.detected, amb: r.wide.amb });
			assert(!r.otherImg.detected.some((n) => r.group.includes(n)), 'T157(3) 同点の行だけ別の画: 上下が無いので決めない', { ...info, detected: r.otherImg.detected });
			assert(!r.gap.detected.some((n) => r.group.includes(n)), 'T157(3) 上の決まった行と同点の行の間に決まっていない行がある（となりでない）: 決めない', { ...info, detected: r.gap.detected });
			assert(jsErrors(sp.errors).length === 0, 'T157(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});

	await block('T157 (4) 旧UI の◎と○（453）: 手入力のリストに◎だけなら○の行は出ない・両方なら○だけが出る（リストには両方残る）', async () => {
		const rdj = (p) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, p), 'utf8'));
		const names = [...new Set(rdj('uma-skill-deck-skills.json').skills.map((s) => s.name).concat(rdj('data/extended-skills.json').entries.map((e) => e.name)))];
		const set = new Set(names);
		const dbl = names.find((n) => /◎$/.test(n) && set.has(n.replace(/◎$/, '○')));
		assert(!!dbl, 'T157(4) データに ◎ と ○ の組がある', null);
		if (!dbl) return;
		const cir = dbl.replace(/◎$/, '○');
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, EMPTY);
		try {
			await sp.page.evaluate(() => { localStorage.setItem(UI_NOTICE_STORAGE_KEY, UI_NOTICE_ID); localStorage.setItem('uma-special-ui-mode', 'old'); });
			await reloadReady(sp.page);
			for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
			const r = await sp.page.evaluate(({ dbl, cir }) => {
				const run = (list) => {
					document.getElementById('skill-list').value = list.join('\n');
					parseSkillList();
					const res = matchWithAllSkillNames([{ text: cir, conf: 90, stars: 2, starsReliable: true, rowKey: '0:0' }]);
					return { list: skillList.slice(), detected: Array.from(res.detectedSkills) };
				};
				return { deckMode, cir: run([cir]), dbl: run([dbl]), both: run([dbl, cir]), bothR: run([cir, dbl]) };
			}, { dbl, cir });
			assert(r.deckMode === false, 'T157(4) 旧UI で開いている', r.deckMode);
			assert(r.cir.detected.includes(cir) && !r.cir.detected.includes(dbl), 'T157(4) リスト＝○だけ: ○ が出る', r.cir.detected);
			assert(r.dbl.detected.length === 0, 'T157(4) リスト＝◎だけ: ○ の行は ◎ でも出ない', r.dbl.detected);
			for (const k of ['both', 'bothR']) {
				assert(r[k].list.includes(dbl) && r[k].list.includes(cir), 'T157(4) リスト＝両方（' + k + '）: リストには両方残る', r[k].list);
				assert(r[k].detected.length === 1 && r[k].detected[0] === cir, 'T157(4) リスト＝両方（' + k + '）: ○ だけが出る', r[k].detected);
			}
			assert(jsErrors(sp.errors).length === 0, 'T157(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		} finally { await sp.ctx.close(); }
	});
}
