// 「サポカ外」ボタン（②の操作。C-163・2026-10-16）の検査。run-smoke.mjs の末尾から register28() で呼ばれる
// （塊の見出しはすべて「サポカ外」で始まる。`npm run test:visual -- --only=サポカ外` で回せる）。
//
// 見るもの: (1) 公開用のサポカ外スキル（data/non-support-skills.json）が、サポートカード563枚のヒント・イベント・共通イベント
//   （グループのカードはメンバー全員）のどれでも得られないこと ―― 独立した検算（2通り: 製品の computeRosterSkills と、データを直接たどる）
// (2)〜(6) ②のパレットの行の「サポカ外」ボタン: 位置・押すまで取りに行かない／固定のシナリオ（候補の数・名前・合計 Pt）／確認の小窓と「元に戻す」／
//   0件の理由の知らせ／Pt 未収録・データを読めないとき

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
	await block('サポカ外(1) 公開用29件は、サポートカード563枚のどれからも得られない（独立した検算）', async () => {
		const ids = NS.entries.map((e) => String(e.skillId));
		assert(NS.dataVersion === '2026-10-16c' && ids.length === 29 && new Set(ids).size === 29,
			'サポカ外(1) 公開用は 29件（2026-10-16c・重複なし。データ側の報告と一致）', { 版: NS.dataVersion, 件数: ids.length });
		assert(CARDS.length === 563, 'サポカ外(1) サポートカードは563枚', CARDS.length);

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
		assert(hitRaw.length === 0, 'サポカ外(1)(a) データをたどって得られるスキル（' + raw.size + '種）に、公開用の29件が1件も入らない', hitRaw);
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
		assert(hitCore.length === 0, 'サポカ外(1)(b) 製品の計算で得られるスキル（' + viaCore.got.length + '種・△を含む）に、公開用の29件が1件も入らない', hitCore);
		assert(viaCore.got.length > 500 && viaCore.missing === 0 && viaCore.unconfirmed === 0,
			'サポカ外(1)(b) 563枚とも未収録・引けないスキルが0で、集合が空でない', { 種: viaCore.got.length, 未収録: viaCore.unconfirmed, 引けない: viaCore.missing });
		assert(jsErrors(sp.errors).length === 0, 'サポカ外(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		assert(missingChara.length === 0, 'サポカ外(1) 全カードのキャラクター（グループはメンバー全員）が共通イベントのデータに載っている', missingChara.slice(0, 5));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * ②のパレットの行の「サポカ外」ボタン（C-163）。固定のシナリオ（実データ）で、候補の数・名前・合計 Pt を固定する。
	 * 候補 = non-support-skills.json の全件のうち、②に無い・①の本育成編成で得ない・①の距離/脚質/バ場とレース条件に合うもの。
	 * ==================================================================== */
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const EXT = readJson('data/extended-skills.json').entries;
	const RACES = readJson('data/upcoming-races.json').races;
	const NS_IDS = NS.entries.map((e) => String(e.skillId));
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const T = '#deck-template-panel ';
	const BTN = T + '[data-usd-el="outside-skill-btn"]';
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
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		return sp;
	};
	const draftIds = (page) => page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
	/** 「サポカ外」を押して、確認の小窓（または知らせ）の中身を読む */
	const pressOutside = async (page) => {
		await page.click(BTN);
		await page.waitForTimeout(800);
		return page.evaluate(() => {
			const list = document.querySelector('[data-usd-el="recommend-confirm-list"]');
			const open = !!list && !document.querySelector('.usd-info-pop').hidden;
			const items = open ? Array.from(list.querySelectorAll('li')) : [];
			const q = (s) => { const e = document.querySelector(s); return e ? e.textContent : null; };
			return { open, title: open ? document.querySelector('.usd-info-pop .uma-popover-title').textContent : null,
				head: open ? q('[data-usd-el="recommend-confirm-head"]') : null, skip: open ? q('[data-usd-el="recommend-confirm-skip"]') : null,
				ids: items.map((li) => li.getAttribute('data-skill-id')), names: items.map((li) => li.querySelector('.usd-rec-name').textContent), pts: items.map((li) => li.querySelector('.usd-rec-pt').textContent),
				toast: document.getElementById('toast-message').textContent };
		});
	};
	const numOf = (s) => Number(String(s).replace(/[^0-9]/g, ''));
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

	// 固定の期待値（実データ。2026-10-16c）
	const S1 = ['7', '10', '11', '181', '291', '373', '375', '376', '381', '399', '406', 'ex-0531', 'ex-0990'];
	const S2 = ['7', '10', '11', '181', '190', '193', '196', '276', '345', '349', '375', '376', '403', '406'];
	const S4 = ['291', '373', '381', '399', '406', 'ex-0531', 'ex-0990'];

	await block('サポカ外(2) 「削除」の次に「サポカ外」／押せる見た目のまま（無効にしない）／押すまで data は取りに行かない', async () => {
		const sp = await openSp({ roster: { skillFilter: MSF } });
		const p = sp.page;
		const r = await p.evaluate(() => {
			const pal = document.querySelector('#deck-template-panel .usd-palette');
			const kids = Array.from(pal.children).filter((c) => !c.classList.contains('usd-palette-sep'));
			const b = pal.querySelector('[data-usd-el="outside-skill-btn"]');
			const d = pal.querySelector('[data-usd-el="palette-delete"]');
			const br = b.getBoundingClientRect(), dr = d.getBoundingClientRect();
			return { order: kids.slice(0, 2).map((c) => c.getAttribute('data-usd-el')), text: b.textContent.trim(), dis: b.disabled, aria: b.getAttribute('aria-disabled'),
				sameLine: Math.abs((br.top + br.height / 2) - (dr.top + dr.height / 2)) <= 1, h: Math.round(br.height), hd: Math.round(dr.height),
				loaded: performance.getEntriesByType('resource').some((e) => /non-support-skills/.test(e.name)) };
		});
		assert(r.order[0] === 'palette-delete' && r.order[1] === 'outside-skill-btn' && r.text === 'サポカ外' && r.sameLine && r.h === r.hd,
			'サポカ外(2) 「削除」の次・同じ行・同じ高さで、文言は「サポカ外」', r);
		assert(r.dis === false && r.aria === null, 'サポカ外(2) ボタンは無効（灰色）にしない', r);
		assert(r.loaded === false, 'サポカ外(2) 押すまでは non-support-skills.json を取りに行かない', r);
		await p.click(BTN);
		await p.waitForTimeout(800);
		const after = await p.evaluate(() => performance.getEntriesByType('resource').filter((e) => /non-support-skills\.json\?v=2026-10-16c/.test(e.name)).length);
		assert(after === 1, 'サポカ外(2) 押すと版つき（?v=）で1回だけ取りに行く', after);
		assert(jsErrors(sp.errors).length === 0, 'サポカ外(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('サポカ外(3) 固定のシナリオ: 候補の数・名前・合計 Pt（①の距離・脚質・バ場・レースを変えると候補が変わる）', async () => {
		const WANT = [
			// [見出し, openSp の引数, 候補の id, 見出しの文言, 追加しないものの文言]
			['中距離・先行・芝', { roster: { skillFilter: MSF } }, S1, '追加するスキル 13種（合計 865 Pt）', '追加しないもの 16種（レース条件に合わないため 16種）'],
			['短距離・逃げ・ダート', { roster: { skillFilter: SHD } }, S2, '追加するスキル 14種（合計 885 Pt）', '追加しないもの 15種（レース条件に合わないため 15種）'],
			['①の条件なし', { roster: {} }, NS_IDS, '追加するスキル 29種（合計 2,270 Pt）', null],
			['脚質 先行＋レース［' + RACES[0].name + '］', { roster: { skillFilter: { style: 'senko' } }, race: 0 }, S4, '追加するスキル 7種（合計 645 Pt）', '追加しないもの 22種（レース条件に合わないため 22種）'],
			['本育成編成（uma-0030）で得る 291 は入らない', { roster: { umaId: 'uma-0030', cardIds: [] } }, NS_IDS.filter((id) => id !== '291'), '追加するスキル 28種（合計 2,180 Pt）', '追加しないもの 1種（本育成編成のため 1種）'],
		];
		const seen = [];
		for (const [label, o, ids, head, skip] of WANT) {
			const sp = await openSp(o);
			const r = await pressOutside(sp.page);
			assert(r.open && r.ids.join() === ids.join() && r.names.join() === ids.map(nameOf).join(), 'サポカ外(3) ' + label + ': 候補は ' + ids.length + '種で、名前もデータどおり', { 画面: r.ids, 期待: ids });
			assert(r.head === head && r.skip === skip, 'サポカ外(3) ' + label + ': 「' + head + '」「' + skip + '」', { head: r.head, skip: r.skip });
			const sum = r.pts.reduce((n, t) => n + (/Pt$/.test(t) ? numOf(t) : 0), 0);
			assert(sum === numOf(r.head.replace(/^.*合計/, '')) && r.pts.every((t) => /^[0-9,]+ Pt$/.test(t)), 'サポカ外(3) ' + label + ': 合計 Pt は各行の Pt の和（Pt 未収録は無い）', { sum, pts: r.pts });
			assert(r.title === 'サポカ外', 'サポカ外(3) ' + label + ': 小窓の見出しは「サポカ外」', r.title);
			seen.push(r.ids.join());
			assert(jsErrors(sp.errors).length === 0, 'サポカ外(3) ' + label + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		assert(new Set(seen).size === 5, 'サポカ外(3) ①の条件・レース・本育成編成を変えると、候補が変わる（5つのシナリオで5通り）', seen.map((s) => s.split(',').length));
		// 検査の側で、データのタグから組み立てた期待値とも一致する（レースなしの3つ）
		assert(S1.join() === expectedIds(MSF).join() && S2.join() === expectedIds(SHD).join() && NS_IDS.join() === expectedIds({}).join(),
			'サポカ外(3) 固定の期待値は、データのタグから組み立てた期待値（距離・脚質・バ場。空は万能。パッシブも同じに絞る）と一致', { S1: expectedIds(MSF), S2: expectedIds(SHD) });
		assert(NS_IDS.every((id) => !skillOf(id).raceDistance), 'サポカ外(3) 29件にレースの距離の限定（raceDistance）は無い（上の期待値の組み立てに入れていない）', NS_IDS.filter((id) => skillOf(id).raceDistance));
	});

	await block('サポカ外(4) 確認の小窓: 「やめる」で何も変わらない／「追加する」で追加され、「元に戻す」で戻る', async () => {
		const have = ['16', '23'];   // ②に入れておくスキル（候補には無い）
		const sp = await openSp({ roster: { skillFilter: MSF }, ids: have });
		const p = sp.page;
		const r = await pressOutside(p);
		assert(r.open && r.ids.join() === S1.join(), 'サポカ外(4) 小窓が出る', r.ids);
		assert((await draftIds(p)).join() === have.join(), 'サポカ外(4) 小窓を出しただけでは追加しない', await draftIds(p));
		assert(await p.$('[data-usd-el="recommend-confirm-add"]') && await p.$('[data-usd-el="recommend-confirm-cancel"]'), 'サポカ外(4) 「追加する」「やめる」がある', true);
		await p.click('[data-usd-el="recommend-confirm-cancel"]');
		assert((await draftIds(p)).join() === have.join(), 'サポカ外(4) 「やめる」で何も変わらない', await draftIds(p));
		const u0 = await p.evaluate(() => UmaSkillDeckCore.undoCount());
		await p.click(BTN);
		await p.waitForSelector('[data-usd-el="recommend-confirm-add"]');
		await p.click('[data-usd-el="recommend-confirm-add"]');
		await p.waitForTimeout(300);
		const after = await draftIds(p);
		const u1 = await p.evaluate(() => UmaSkillDeckCore.undoCount());
		assert(after.join() === have.concat(S1).join(), 'サポカ外(4) 「追加する」で、小窓の13種が②の末尾に加わる（ほかは変わらない）', after);
		assert(u1 === u0 + 1, 'サポカ外(4) 「元に戻す」に1回で積む', { u0, u1 });
		const tl = await p.evaluate(() => document.getElementById('toast-message').textContent);
		assert(tl === 'サポカ外 13種を追加しました。追加しなかったもの 16種（レース条件に合わないため 16種）', 'サポカ外(4) 追加したあとの知らせ', tl);
		// 追加済みのスキルは②のタイルに出る（パッシブ〔緑スキル〕もほかと同じタイル）
		const tiles = await p.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]')).map((e) => e.getAttribute('data-skill-id')));
		assert(S1.every((id) => tiles.includes(id)), 'サポカ外(4) ②のタイルに追加したスキルが並ぶ（緑スキルを含む）', tiles);
		await p.click('#deck-undo-btn');
		await p.waitForTimeout(300);
		assert((await draftIds(p)).join() === have.join(), 'サポカ外(4) 「元に戻す」で追加前に戻る', await draftIds(p));
		assert(jsErrors(sp.errors).length === 0, 'サポカ外(4) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('サポカ外(5) 0件のとき: 押せる見た目のまま、押すと理由を知らせる（小窓は出ない）', async () => {
		// (a) 追加したあとにもう一度押す
		const sp = await openSp({ roster: { skillFilter: MSF } });
		const p = sp.page;
		await pressOutside(p);
		await p.click('[data-usd-el="recommend-confirm-add"]');
		await p.waitForTimeout(300);
		const z = await pressOutside(p);
		assert(!z.open && z.toast === '追加できるスキルはありません（追加済み 13種・レース条件に合わないため 16種）', 'サポカ外(5) 追加後にもう一度押すと、小窓は出ずに理由の知らせ', z);
		const look = await p.evaluate(() => { const b = document.querySelector('[data-usd-el="outside-skill-btn"]'); return { dis: b.disabled, aria: b.getAttribute('aria-disabled') }; });
		assert(look.dis === false && look.aria === null, 'サポカ外(5) 0件でもボタンは無効にしない', look);
		await sp.ctx.close();
		// (b) 29件すべてを②に入れておく
		const sp2 = await openSp({ roster: {}, ids: NS_IDS });
		const z2 = await pressOutside(sp2.page);
		assert(!z2.open && z2.toast === '追加できるスキルはありません（追加済み 29種）', 'サポカ外(5) 全件が②にあるときは「追加済み 29種」', z2);
		await sp2.ctx.close();
		// (c) 3つの理由がそろう: ②に1種・本育成編成で1種（uma-0030 の 291）・①の条件に合わない
		const sp3 = await openSp({ roster: { umaId: 'uma-0030', cardIds: [], skillFilter: MSF }, ids: ['7'] });
		const r3 = await pressOutside(sp3.page);
		assert(r3.open && r3.skip === '追加しないもの 18種（追加済み 1種・本育成編成のため 1種・レース条件に合わないため 16種）', 'サポカ外(5) 理由は「追加済み・本育成編成のため・レース条件に合わないため」の順に数える', r3.skip);
		await sp3.ctx.close();
	});

	await block('サポカ外(6) Pt 未収録のスキルは「Pt 未収録」のまま（合計から除き、数を添える）／データを読めないときは短い知らせだけ', async () => {
		const noPt = '291';
		const sp = await openSp({ roster: { skillFilter: MSF }, route: async (page) => {
			await page.route('**/data/skill-pt.json*', async (route) => {
				const res = await route.fetch();
				const doc = await res.json();
				doc.entries = doc.entries.filter((e) => e.skillId !== noPt);
				await route.fulfill({ response: res, json: doc });
			});
		} });
		const r = await pressOutside(sp.page);
		const i = r.ids.indexOf(noPt);
		assert(r.open && i !== -1 && r.pts[i] === 'Pt 未収録' && r.head === '追加するスキル 13種（合計 775 Pt・Pt 未収録 1種を除く）',
			'サポカ外(6) Pt が無いスキルの行は「Pt 未収録」・合計は 865 − 90 = 775 Pt で数を添える', { pt: r.pts[i], head: r.head });
		await sp.ctx.close();
		const sp2 = await openSp({ roster: { skillFilter: MSF }, route: async (page) => { await page.route('**/data/non-support-skills.json*', (route) => route.fulfill({ status: 500, body: 'x' })); } });
		const before = await draftIds(sp2.page);
		const r2 = await pressOutside(sp2.page);
		assert(!r2.open && r2.toast === 'サポカ外のスキルのデータを読み込めませんでした' && (await draftIds(sp2.page)).join() === before.join(), 'サポカ外(6) データを読めないときは、②に何も入れず短い知らせだけ', r2.toast);
		await sp2.ctx.close();
	});
	await block('サポカ外(7) パッシブも①の距離で絞る: 遊び心（ex-0990）は短距離の①では候補に出ず、中距離・長距離では出る／①の条件なしでは29種のまま', async () => {
		const YU = 'ex-0990';
		assert((skillOf(YU).tags.passive || []).length > 0 && skillOf(YU).tags.distance.join() === 'long,medium', 'サポカ外(7) 前提: 遊び心はパッシブで、距離のタグは長距離・中距離', skillOf(YU).tags);
		for (const [d, want] of [['short', false], ['medium', true], ['long', true]]) {
			const sp = await openSp({ roster: { skillFilter: { distance: d } } });
			const r = await pressOutside(sp.page);
			assert(r.open && r.ids.includes(YU) === want, 'サポカ外(7) 距離 ' + d + ': 遊び心は候補に' + (want ? '出る' : '出ない'), r.ids);
			await sp.ctx.close();
		}
		const sp = await openSp({ roster: {} });
		const r = await pressOutside(sp.page);
		assert(r.open && r.ids.length === 29 && r.ids.includes(YU) && NS_IDS.filter((id) => (skillOf(id).tags.passive || []).length > 0).every((id) => r.ids.includes(id)), 'サポカ外(7) ①の条件なしでは、パッシブも含む29種のまま', r.ids.length);
		await sp.ctx.close();
	});

}
