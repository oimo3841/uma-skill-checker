// 「サポカ外」（C-163・2026-10-16。2026-10-21 に②のパレットのボタンから、脚質オススメの小窓の項目へ移した）の検査。run-smoke.mjs の末尾から register28() で呼ばれる
// （塊の見出しはすべて「サポカ外」で始まる。`npm run test:visual -- --only=サポカ外` で回せる）。
//
// 見るもの: (1) 公開用のサポカ外スキル（data/non-support-skills.json）が、サポートカード563枚のヒント・イベント・共通イベント
//   （グループのカードはメンバー全員）のどれでも得られないこと ―― 独立した検算（2通り: 製品の computeRosterSkills と、データを直接たどる）
// (2)〜(8) 脚質オススメの小窓の「サポカ外」の項目: 押すまで取りに行かない／固定のシナリオ（候補）／Pt 未収録／パッシブも①の距離で絞る／②の「N種」。
//   確認の小窓・追加・元に戻す・0件の知らせ・データを読めないときは blocks-43.mjs の C-184 と blocks-17.mjs の C131D

import { reloadReady } from './lib/page-ready.mjs';
export async function register28(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const NS = readJson('data/non-support-skills.json');
	const CARDS = readJson('data/support-cards.json').entries;
	const EVS = readJson('data/support-card-event-skills.json').entries;
	const CHARA = readJson('data/character-event-skills.json').entries;

	/** オブジェクトの中の skillId をすべて集める（形に依存しない） */
	const collectSkillIds = (v, out) => {
		if (Array.isArray(v)) v.forEach((x) => collectSkillIds(x, out));
		else if (v && typeof v === 'object') {
			Object.keys(v).forEach((k) => { if (k === 'skillId') out.add(String(v[k])); else collectSkillIds(v[k], out); });
		}
		return out;
	};

	/* ---- (1) 独立した検算 ---- */
	await block('サポカ外(1) 公開用の全件は、サポートカードのどれからも得られない（独立した検算）', async () => {
		const ids = NS.entries.map((e) => String(e.skillId));
		assert(/^\d{4}-\d{2}-\d{2}[a-z]$/.test(String(NS.dataVersion)) && ids.length > 0 && new Set(ids).size === ids.length,
			'サポカ外(1) 公開用は ' + ids.length + '件（' + NS.dataVersion + '・重複なし。版は YYYY-MM-DD＋英小文字の形）', { 版: NS.dataVersion, 件数: ids.length });
		assert(CARDS.length > 500, 'サポカ外(1) サポートカードが読めている（' + CARDS.length + '枚）', CARDS.length);

		/* (a) データを直接たどる: ヒント・イベント（全選択肢・失敗側も）・キャラクター共通のイベント（グループのカードはメンバー全員） */
		const raw = new Set();
		const charaDoc = new Map(CHARA.map((c) => [c.charaName, c]));
		const evDoc = new Map(EVS.map((e) => [e.cardId, e]));
		const missingChara = [];
		CARDS.forEach((c) => {
			collectSkillIds(c.hintSkills, raw);
			collectSkillIds(evDoc.get(c.id), raw);
			(c.isGroup ? c.groupMembers : [c.charaName]).forEach((name) => {
				if (!charaDoc.has(name)) { missingChara.push(c.id + ':' + name); return; }
				collectSkillIds(charaDoc.get(name), raw);
			});
		});
		const hitRaw = ids.filter((id) => raw.has(id));
		assert(hitRaw.length === 0, 'サポカ外(1)(a) データをたどって得られるスキル（' + raw.size + '種）に、公開用の' + ids.length + '件が1件も入らない', hitRaw);
		assert(raw.size > 500, 'サポカ外(1)(a) たどった集合が空でない（検算が空振りしていない）', raw.size);

		/* (b) 製品の関数: 563枚それぞれを編成に入れて、得られるスキル（△も含む）を集める */
		const sp = await openPage(browser, base, 'special.html', { width: 390, height: 900 }, EMPTY);
		const viaCore = await sp.page.evaluate(async (cardIds) => {
			await UmaSkillDeckCore.loadTrainingSources();
			const got = new Set();
			let unconfirmed = 0, missing = 0;
			cardIds.forEach((id) => {
				const res = UmaSkillDeckCore.computeRosterSkills({ umaId: null, cardIds: [id] }, { autoChoose: true });
				res.items.forEach((it) => got.add(String(it.skillId)));
				unconfirmed += res.unconfirmed.length; missing += res.missing.length;
			});
			return { got: Array.from(got), unconfirmed, missing };
		}, CARDS.map((c) => c.id));
		const hitCore = ids.filter((id) => viaCore.got.includes(id));
		assert(hitCore.length === 0, 'サポカ外(1)(b) 製品の計算で得られるスキル（' + viaCore.got.length + '種・△を含む）に、公開用の' + ids.length + '件が1件も入らない', hitCore);
		assert(viaCore.got.length > 500 && viaCore.missing === 0 && viaCore.unconfirmed === 0,
			'サポカ外(1)(b) ' + CARDS.length + '枚とも未収録・引けないスキルが0で、集合が空でない', { 種: viaCore.got.length, 未収録: viaCore.unconfirmed, 引けない: viaCore.missing });
		assert(jsErrors(sp.errors).length === 0, 'サポカ外(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		assert(missingChara.length === 0, 'サポカ外(1) 全カードのキャラクター（グループはメンバー全員）が共通イベントのデータに載っている', missingChara.slice(0, 5));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * 脚質オススメの小窓の「サポカ外」の項目（C-163。2026-10-21 に②のパレットの「サポカ外」ボタンから移した）。固定のシナリオ（実データ）で、候補を固定する。
	 * 候補 = non-support-skills.json の全件のうち、②に無い・①の本育成編成で得ない・①の距離/脚質/バ場とレース条件に合うもの。
	 * 新しい小窓では、低効果（ちょっと以下）は出さず、緑スキル（レース条件）の項目に出るものは重ねない。
	 * ==================================================================== */
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const EXT = readJson('data/extended-skills.json').entries;
	const RACES = readJson('data/upcoming-races.json').races;
	const NS_IDS = NS.entries.map((e) => String(e.skillId));
	const EFF = readJson('data/skill-effect-levels.json');
	const RANK = new Map(EFF.stages.map((s) => [s.key, s.rank]));
	const LOWMAX = RANK.get(EFF.lowEffectMax.key !== undefined ? EFF.lowEffectMax.key : EFF.lowEffectMax);
	const LOW = new Set(EFF.entries.filter((e) => RANK.get(e.maxStage) <= LOWMAX).map((e) => e.skillId));
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const T = '#deck-template-panel ';
	const BTN = T + '[data-usd-el="style-open"]';
	const SM = '[data-usd-el="style-modal"] ';
	const skillOf = (id) => MASTER.find((s) => String(s.id) === id) || EXT.find((s) => s.id === id);
	const nameOf = (id) => skillOf(id).name;

	/** o.roster＝①に足す項目／o.race＝レースの行の番号／o.ids＝②に入れておくスキル／o.route＝読み込み前に呼ぶ関数（通信の差し替え） */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		if (o.route) await o.route(sp.page);
		const roster = Object.assign({ umaId: 'uma-0001', cardIds: CARDS6 }, o.roster || {});
		if (o.race !== undefined) roster.race = RACES[o.race];
		await sp.page.evaluate(({ roster, ids }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			if (ids) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids })); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster, ids: o.ids || null });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		return sp;
	};
	const draftIds = (page) => page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
	/** 「脚質オススメ」を開いて、「サポカ外」と「緑スキル（レース条件）」の行を読む（開かなければ open:false） */
	const pressOutside = async (page) => {
		await page.click(BTN);
		await page.waitForTimeout(800);
		return page.evaluate(() => {
			const m = document.querySelector('[data-usd-el="style-modal"]');
			const open = !!m && !m.hidden;
			const rows = (key) => open ? Array.from(m.querySelectorAll('[data-section="' + key + '"] [data-usd-el="style-row"]')).map((r) => ({ id: r.getAttribute('data-skill-id'), name: r.querySelector('.usd-sty-name').textContent, pt: r.querySelector('[data-usd-el="style-row-pt"]').textContent, state: r.getAttribute('data-state') })) : [];
			return { open, outside: rows('outside'), green: rows('green'), head: open ? m.querySelector('[data-usd-el="style-head"]').textContent : null, toast: document.getElementById('toast-message').textContent };
		});
	};
	/** 検査の側で、データのタグから組み立てた期待値（①の距離・脚質・バ場だけ。レースなし）。パッシブも白スキルと同じに絞る（C-164。タグに距離・脚質・バ場を持たないものは残る） */
	const expectedIds = (f, have = [], hidden = []) => NS_IDS.filter((id) => {
		if (have.includes(id) || hidden.includes(id)) return false;
		const t = skillOf(id).tags;
		const ok = (axis, v) => !v || (t[axis] || []).length === 0 || (t[axis] || []).includes(v);
		const surf = !f.surface || (t.surface || []).every((x) => x === f.surface);
		return ok('distance', f.distance) && ok('style', f.style) && surf;
	});
	const MSF = { distance: 'medium', style: 'senko', surface: 'turf' };
	const SHD = { distance: 'short', style: 'nige', surface: 'dirt' };

	await block('サポカ外(2) 「サポカ外」は脚質オススメの小窓の項目（パレットの行にボタンは無い）／押すまで non-support-skills.json は取りに行かない／入口は押せる見た目', async () => {
		const sp = await openSp({ roster: { skillFilter: MSF } });
		const p = sp.page;
		const r = await p.evaluate(() => {
			const b = document.querySelector('#deck-template-panel [data-usd-el="style-open"]');
			return { palBtn: !!document.querySelector('#deck-template-panel .usd-palette [data-usd-el="outside-skill-btn"]'), dis: b.disabled, aria: b.getAttribute('aria-disabled'),
				loaded: performance.getEntriesByType('resource').some((e) => /non-support-skills/.test(e.name)) };
		});
		assert(!r.palBtn && r.dis === false && r.aria === null, 'サポカ外(2) パレットの行にボタンは無く、入口は無効にしない', r);
		assert(r.loaded === false, 'サポカ外(2) 押すまでは non-support-skills.json を取りに行かない', r);
		await p.click(BTN);
		await p.waitForTimeout(800);
		const after = await p.evaluate((ver) => performance.getEntriesByType('resource').filter((e) => e.name.includes('non-support-skills.json?v=' + ver)).length, NS.dataVersion);
		assert(after === 1, 'サポカ外(2) 押すと版つき（?v=）で1回だけ取りに行く', after);
		assert(jsErrors(sp.errors).length === 0, 'サポカ外(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('サポカ外(3) 固定のシナリオ: 「サポカ外」の項目の候補（①の距離・脚質・バ場・レース・本育成編成を変えると候補が変わる）。低効果は出さない・緑スキルの項目と重ならない', async () => {
		const WANT = [
			// [見出し, openSp の引数, 期待（データのタグから組み立てる）]
			['中距離・先行・芝', { roster: { skillFilter: MSF } }, expectedIds(MSF)],
			['短距離・逃げ・ダート', { roster: { skillFilter: SHD } }, expectedIds(SHD)],
			['①の条件なし', { roster: {} }, NS_IDS],
			['脚質 先行＋レース［' + RACES[0].name + '］', { roster: { skillFilter: { style: 'senko' } }, race: 0 }, null],
			['本育成編成（uma-0030）で得る 291 は入らない', { roster: { umaId: 'uma-0030', cardIds: [] } }, NS_IDS.filter((id) => id !== '291')],
		];
		const seen = [];
		for (const [label, o, want] of WANT) {
			const sp = await openSp(o);
			const r = await pressOutside(sp.page);
			const ids = r.outside.map((x) => x.id);
			const greenIds = r.green.map((x) => x.id);
			assert(r.open, 'サポカ外(3) ' + label + ': 小窓が開く', r.toast);
			if (want) {
				// 期待の各 id は、「サポカ外」に出る／低効果で出さない／緑スキルの項目に出る（重ならない）のどれか1つ
				const bad = want.filter((id) => !(ids.includes(id) ? !LOW.has(id) && !greenIds.includes(id) : (LOW.has(id) || greenIds.includes(id))));
				assert(bad.length === 0 && ids.every((id) => want.includes(id)), 'サポカ外(3) ' + label + ': 候補は期待（' + want.length + '種）から低効果と緑スキルの項目に出るものを除いた ' + ids.length + '種', { 画面: ids, 期待: want, bad });
			} else {
				assert(ids.every((id) => NS_IDS.includes(id) && !LOW.has(id) && !greenIds.includes(id)), 'サポカ外(3) ' + label + ': 候補は non-support-skills.json の中だけ・低効果・緑スキルと重ならない', ids);
			}
			assert(r.outside.every((x) => /^[0-9,]+ Pt$|^Pt 不要$|^Pt 未収録$/.test(x.pt)) && r.outside.every((x) => x.name === nameOf(x.id)), 'サポカ外(3) ' + label + ': 名前はデータどおり・各行に Pt', r.outside.map((x) => x.pt));
			seen.push(ids.join());
			assert(jsErrors(sp.errors).length === 0, 'サポカ外(3) ' + label + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// 「①の条件なし」と「本育成編成で 291 を得る」は同じになる（291 は低効果で、どちらでも出さない）。残りの4通りは違う
		assert(LOW.has('291') && new Set(seen).size === 4, 'サポカ外(3) ①の条件・レース・本育成編成を変えると、候補が変わる（5つのシナリオで4通り。291 は低効果で出さないので、条件なしと本育成編成のシナリオは同じ）', seen.map((s) => s.split(',').length));
		assert(NS_IDS.every((id) => !skillOf(id).raceDistance), 'サポカ外(3) 全' + NS_IDS.length + '件にレースの距離の限定（raceDistance）は無い（上の期待値の組み立てに入れていない）', NS_IDS.filter((id) => skillOf(id).raceDistance));
	});

	await block('サポカ外(6) Pt 未収録のスキルは「Pt 未収録」のまま（合計から除き、数を添える）', async () => {
		const noPt = expectedIds(MSF).find((id) => !LOW.has(id) && !skillOf(id).tags.passive.length);   // 低効果でない候補（出る行）
		const sp = await openSp({ roster: { skillFilter: MSF }, route: async (page) => {
			await page.route('**/data/skill-pt.json*', async (route) => {
				const res = await route.fetch();
				const doc = await res.json();
				doc.entries = doc.entries.filter((e) => e.skillId !== noPt);
				await route.fulfill({ response: res, json: doc });
			});
		} });
		const r = await pressOutside(sp.page);
		const row = r.outside.find((x) => x.id === noPt);
		assert(r.open && !!row && row.pt === 'Pt 未収録' && /Pt 未収録 \d+種を除く）$/.test(r.head), 'サポカ外(6) Pt が無いスキルの行は「Pt 未収録」・合計は数を添えて除く', { pt: row && row.pt, head: r.head });
		await sp.ctx.close();
	});

	await block('サポカ外(7) パッシブも①の距離で絞る: 遊び心（ex-0990）は短距離の①では「サポカ外」に出ず、中距離・長距離では出る／①の条件なしでは全種から低効果・緑スキルに出るものを除いたもの', async () => {
		const YU = 'ex-0990';
		assert((skillOf(YU).tags.passive || []).length > 0 && skillOf(YU).tags.distance.join() === 'long,medium', 'サポカ外(7) 前提: 遊び心はパッシブで、距離のタグは長距離・中距離', skillOf(YU).tags);
		assert(!LOW.has(YU), 'サポカ外(7) 前提: 遊び心は低効果ではない', true);
		for (const [d, want] of [['short', false], ['medium', true], ['long', true]]) {
			const sp = await openSp({ roster: { skillFilter: { distance: d } } });
			const r = await pressOutside(sp.page);
			assert(r.open && r.outside.some((x) => x.id === YU) === want, 'サポカ外(7) 距離 ' + d + ': 遊び心は候補に' + (want ? '出る' : '出ない'), r.outside.map((x) => x.id));
			await sp.ctx.close();
		}
		const sp = await openSp({ roster: {} });
		const r = await pressOutside(sp.page);
		assert(r.open && r.outside.some((x) => x.id === YU) && r.outside.length === NS_IDS.filter((id) => !LOW.has(id)).length, 'サポカ外(7) ①の条件なしでは、パッシブも含む全' + NS_IDS.length + '種から低効果を除いたもの', r.outside.length);
		await sp.ctx.close();
	});

	/* ②のタブの脇の「N種」（C-164）: ②が空のときは出さない（古い値も残さない）。①③のタブの表示は変えない */
	await block('サポカ外(8) ②が空のときは、②のタブの脇に「N種」を出さない／1種以上あるときは従来どおり／追加を「元に戻す」で空に戻しても出ない', async () => {
		const badge = (page) => page.evaluate(() => {
			const b = document.getElementById('skill-count-badge');
			const o = (id) => { const e = document.getElementById(id); return e ? { hidden: e.hidden || e.classList.contains('hidden'), text: e.textContent } : null; };
			return { text: b.textContent, hidden: b.classList.contains('hidden'), shown: getComputedStyle(b).display !== 'none', excluded: o('deck-roster-excluded'), image: o('image-count-badge') };
		});
		const sp0 = await openSp({ roster: { skillFilter: MSF }, ids: [] });
		const e0 = await badge(sp0.page);
		assert(e0.hidden && !e0.shown && e0.text === '', 'サポカ外(8) ②が空のセットを開くと「N種」は出ない', e0);
		await sp0.ctx.close();
		const sp1 = await openSp({ roster: { skillFilter: MSF }, ids: ['16', '23'] });
		const e1 = await badge(sp1.page);
		assert(!e1.hidden && e1.shown && /^[0-9]+種$/.test(e1.text), 'サポカ外(8) 1種以上あるときは従来どおり「N種」が出る', e1);
		// ②を削除で空にすると出ない（古い値も残さない）。①③のタブの表示は変わらない
		await sp1.page.click(T + '[data-usd-el="palette-delete"]');
		for (const id of ['16', '23']) { await sp1.page.click(T + '.usd-panel[data-skill-id="' + id + '"] .usd-panel-namebtn'); await sp1.page.waitForTimeout(200); }
		const e2 = await badge(sp1.page);
		assert(e2.hidden && !e2.shown && e2.text === '', 'サポカ外(8) 削除で②を空にすると「N種」は消え、古い値も残らない', e2);
		assert(JSON.stringify(e2.excluded) === JSON.stringify(e1.excluded) && JSON.stringify(e2.image) === JSON.stringify(e1.image), 'サポカ外(8) ①（除外）・③（画像）のタブの表示は変わらない', { e1: [e1.excluded, e1.image], e2: [e2.excluded, e2.image] });
		// A-0（2026-10-16）: 空にしたあと「元に戻す」で戻すと、「N種」が出る（「＋ 新規」の選択に戻るため）。N は②の先頭の「X Pt/N種」の N（継承固有を含む）なので、
		// 同じ中身のセットを開き直したときの値と比べる
		await sp1.page.click('#deck-undo-btn');
		await sp1.page.waitForTimeout(400);
		const e2b = await badge(sp1.page);
		const ids2b = await draftIds(sp1.page);
		const ref1 = await openSp({ roster: { skillFilter: MSF }, ids: ids2b });
		const r1 = await badge(ref1.page);
		await ref1.ctx.close();
		assert(ids2b.length === 1 && !e2b.hidden && e2b.shown && /^[0-9]+種$/.test(e2b.text) && e2b.text === r1.text, 'サポカ外(8) 空にしたあと「元に戻す」で1種戻すと、②のタブの脇に「N種」が出る（同じ中身のセットを開いたときと同じ値）', { ids2b, e2b: e2b.text, r1: r1.text });
		await sp1.page.click('#deck-undo-btn');
		await sp1.page.waitForTimeout(400);
		const e2c = await badge(sp1.page);
		assert((await draftIds(sp1.page)).length === 2 && !e2c.hidden && e2c.text === e1.text, 'サポカ外(8) もう一度「元に戻す」で2種に戻ると、最初と同じ「N種」が出る', { e1: e1.text, e2c: e2c.text });
		await sp1.ctx.close();
		// 空の②へ「脚質オススメ」で追加し、「元に戻す」で空に戻す
		const sp2 = await openSp({ roster: { skillFilter: MSF }, ids: [] });
		await pressOutside(sp2.page);
		await sp2.page.click(SM + '[data-usd-el="style-add"]');
		await sp2.page.waitForTimeout(400);
		const e3 = await badge(sp2.page);
		assert(!e3.hidden && /^[0-9]+種$/.test(e3.text), 'サポカ外(8) 追加すると「N種」が出る', e3);
		await sp2.page.click('#deck-undo-btn');
		await sp2.page.waitForTimeout(400);
		const e4 = await badge(sp2.page);
		assert((await draftIds(sp2.page)).length === 0 && e4.hidden && !e4.shown && e4.text === '', 'サポカ外(8) 「元に戻す」で②が空に戻ったら「N種」は出ない（古い値も残らない）', e4);
		assert(jsErrors(sp2.errors).length === 0, 'サポカ外(8) コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
		await sp2.ctx.close();
	});

}
