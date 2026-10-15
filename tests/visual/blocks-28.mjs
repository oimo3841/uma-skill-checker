// 「サポカ外」ボタン（②の操作。C-163・2026-10-16）の検査。run-smoke.mjs の末尾から register28() で呼ばれる
// （塊の見出しはすべて「サポカ外」で始まる。`npm run test:visual -- --only=サポカ外` で回せる）。
//
// 見るもの: (1) 公開用のサポカ外スキル（data/non-support-skills.json）が、サポートカード563枚のヒント・イベント・共通イベント
//   （グループのカードはメンバー全員）のどれでも得られないこと ―― 独立した検算（2通り: 製品の computeRosterSkills と、データを直接たどる）

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
}
