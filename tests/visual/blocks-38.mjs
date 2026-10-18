// 「サポカ外」の確認の小窓（2026-10-18・作業3）の検査。run-smoke.mjs の末尾から register38() で呼ばれる
// （塊の見出しはすべて「サポカ外確認」で始まる。`npm run test:visual -- --only=サポカ外確認` で回せる）。
//
// 決め（おいもさん）: 確認の小窓の各スキルに、(a) 追加するかを選ぶチェックボックス、(b) 公式の説明文（小さな灰色の文字。折り返してよい）。
//   (c) 最大の効果が lowEffectMax 以下の低効果のスキルは最初からチェックを外す（効果量が分からないスキルは入れる）。
//   (d) 「追加するスキル N種（合計 … Pt）」はチェックしたものだけで、選ぶたびに数え直す。(e) 「追加する」はチェックしたものだけを②に足す（元に戻すに1回）。
//   1つもチェックされていないときも押せる見た目のまま、押すと「追加するスキルが選ばれていません」を知らせる。(f) 「追加しないもの」はそのまま。
//   説明文が読めないときは説明文を出さず、ほかは同じ。説明文と効果量のデータは小窓を開く時点で読む（ページの初期読み込みを増やさない）。
// スキル名は検査の側に書かない（恒久ルール1）。

export async function register38(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const EL = readJson('data/skill-effect-levels.json');
	const RANK = new Map(EL.stages.map((s) => [s.key, s.rank]));
	const LOW_IDS = new Set(EL.entries.filter((e) => e.maxStage !== null && RANK.get(e.maxStage) <= EL.lowEffectMax.rank).map((e) => e.skillId));
	const DESC = new Map(readJson('data/skill-descriptions.json').entries.map((e) => [e.skillId, e.text]));
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const BTN = '#deck-template-panel [data-usd-el="outside-skill-btn"]';
	const MSF = { distance: 'medium', style: 'senko', surface: 'turf' };   // 中距離・先行・芝（候補13種・サポカ外(3)と同じ）

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		const reqs = [];
		sp.page.on('request', (r) => reqs.push(r.url()));
		if (o.route) await o.route(sp.page);
		const roster = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: MSF };
		await sp.page.evaluate(({ roster, ids }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			if (ids) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids })); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster, ids: o.ids || null });
		reqs.length = 0;
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		sp.reqs = reqs;
		return sp;
	};
	const draftIds = (page) => page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
	const press = async (page) => { await page.click(BTN); await page.waitForTimeout(900); };
	const readDialog = (page) => page.evaluate(() => {
		const list = document.querySelector('[data-usd-el="recommend-confirm-list"]');
		const open = !!list && !document.querySelector('.usd-info-pop').hidden;
		const items = open ? Array.from(list.querySelectorAll('li')) : [];
		const q = (s) => { const e = document.querySelector(s); return e ? e.textContent : null; };
		return {
			open, head: open ? q('[data-usd-el="recommend-confirm-head"]') : null, skip: open ? q('[data-usd-el="recommend-confirm-skip"]') : null,
			rows: items.map((li) => {
				const cb = li.querySelector('[data-usd-el="recommend-confirm-check"]');
				const d = li.querySelector('[data-usd-el="recommend-confirm-desc"]');
				const lab = li.querySelector('.usd-rec-check');
				const r = lab ? lab.getBoundingClientRect() : null;
				return { id: li.getAttribute('data-skill-id'), checked: !!cb && cb.checked, hasCb: !!cb, desc: d ? d.textContent : null, descSize: d ? parseFloat(getComputedStyle(d).fontSize) : null, nameSize: parseFloat(getComputedStyle(li.querySelector('.usd-rec-name')).fontSize),
					pt: li.querySelector('.usd-rec-pt').textContent, tap: r ? [Math.round(r.width), Math.round(r.height)] : null };
			}),
			toast: (document.getElementById('toast-message') || {}).textContent || '',
			overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
			addDisabled: (() => { const b = document.querySelector('[data-usd-el="recommend-confirm-add"]'); return b ? b.disabled : null; })()
		};
	});
	const ptSum = (rows) => rows.reduce((s, r) => s + (/^\d+ Pt$/.test(r.pt) ? Number(r.pt.replace(/[^0-9]/g, '')) : 0), 0);
	const fmt = (n) => n.toLocaleString('en-US');
	const headOf = (rows) => '追加するスキル ' + rows.length + '種（合計 ' + fmt(ptSum(rows)) + ' Pt）';

	await block('サポカ外確認(1) 既定: 低効果のスキルはチェックを外した状態・ほかはチェック済み。数と合計 Pt はチェックしたものだけ／追加しないもの（理由の内訳）は今のまま', async () => {
		const sp = await openSp();
		await press(sp.page);
		const r = await readDialog(sp.page);
		assert(r.open && r.rows.length === 13 && r.rows.every((x) => x.hasCb), 'サポカ外確認(1) 小窓が出て、13種すべてにチェックボックスがある', r.rows.length);
		const bad = r.rows.filter((x) => x.checked === LOW_IDS.has(x.id));
		assert(bad.length === 0, 'サポカ外確認(1) 低効果（データの lowEffectMax 以下）のスキルはチェックが外れ、それ以外は入っている', bad.map((x) => x.id));
		const lows = r.rows.filter((x) => LOW_IDS.has(x.id));
		assert(lows.length > 0 && lows.length < r.rows.length, 'サポカ外確認(1) 前提: この編成には低効果のスキルと、そうでないスキルが両方ある（低効果 ' + lows.length + '種）', lows.map((x) => x.id));
		const on = r.rows.filter((x) => x.checked);
		assert(r.head === headOf(on), 'サポカ外確認(1) 「追加するスキル N種（合計 … Pt）」はチェックしたものだけ（' + headOf(on) + '）', r.head);
		assert(r.skip === '追加しないもの 16種（レース条件に合わないため 16種）', 'サポカ外確認(1) 「追加しないもの」は今のまま（チェックを外したものは数えない）', r.skip);
		assert(r.rows.every((x) => x.tap && x.tap[0] >= 44 && x.tap[1] >= 44), 'サポカ外確認(1) チェックの押す場所は44px以上', r.rows.map((x) => x.tap));
		assert(r.overflowX === false && jsErrors(sp.errors).length === 0, 'サポカ外確認(1) 横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('サポカ外確認(2) 各スキルに公式の説明文（skill-descriptions.json の文。小さな灰色の文字）が付く／読めないときは説明文だけ出さない／効果量・説明文は小窓を開くときに読む', async () => {
		const sp = await openSp();
		const cnt = (re) => sp.reqs.filter((u) => re.test(u)).length;
		const before = { eff: cnt(/skill-effect-levels/), desc: cnt(/skill-descriptions/) };
		await press(sp.page);
		const r = await readDialog(sp.page);
		const want = (id) => String(DESC.get(id) || '').replace(/\n/g, '');
		const bad = r.rows.filter((x) => x.desc !== want(x.id));
		assert(bad.length === 0 && r.rows.every((x) => x.desc && x.desc.length > 0), 'サポカ外確認(2) 説明文はデータの文（改行を除いたもの）と一致する', bad.slice(0, 3));
		assert(r.rows.every((x) => x.descSize < x.nameSize), 'サポカ外確認(2) 説明文は名前より小さい文字', r.rows.map((x) => [x.descSize, x.nameSize]));
		const after = { eff: cnt(/skill-effect-levels/), desc: cnt(/skill-descriptions/) };
		// 効果量のデータは、ページの読み込みでは取りに行かず、ボタンを押したときに読む。説明文は、進化の画面など別の入口が先に読むことがある（読み込みは1回だけ）ので、押したあとに読み込み済みであることを見る
		assert(before.eff === 0 && after.eff === 1 && after.desc === 1, 'サポカ外確認(2) 効果量のデータはボタンを押したときに1回だけ読む／説明文も1回だけ（ページの初期読み込みを増やさない）', { before, after });
		await sp.ctx.close();
		// 説明文が読めない（読み込み失敗）
		const sp2 = await openSp({ route: (p) => p.route('**/data/skill-descriptions.json*', (rt) => rt.fulfill({ status: 500, body: 'x' })) });
		await press(sp2.page);
		const f = await readDialog(sp2.page);
		const on = f.rows.filter((x) => x.checked);
		assert(f.open && f.rows.length === 13 && f.rows.every((x) => x.desc === null && x.hasCb), 'サポカ外確認(2) 説明文を読めないときは、説明文を出さず、チェックボックスなどは同じ', f.rows.length);
		assert(f.head === headOf(on) && on.length === f.rows.filter((x) => !LOW_IDS.has(x.id)).length, 'サポカ外確認(2) 説明文を読めなくても、既定のチェック（低効果は外す）と数・合計は同じ', f.head);
		await sp2.ctx.close();
		// 効果量が読めない: 低効果が分からないので、すべてチェック済み
		const sp3 = await openSp({ route: (p) => p.route('**/data/skill-effect-levels.json*', (rt) => rt.fulfill({ status: 500, body: 'x' })) });
		await press(sp3.page);
		const g = await readDialog(sp3.page);
		assert(g.open && g.rows.every((x) => x.checked), 'サポカ外確認(2) 効果量を読めないときは、低効果を判定できないので、すべてチェックした状態', g.rows.filter((x) => !x.checked).map((x) => x.id));
		await sp3.ctx.close();
	});

	await block('サポカ外確認(3) チェックを変えると、数と合計 Pt が選ぶたびに数え直される／「追加する」はチェックしたものだけを足し、「元に戻す」に1回で積む', async () => {
		const have = ['16', '23'];
		const sp = await openSp({ ids: have });
		const p = sp.page;
		await press(p);
		const r0 = await readDialog(p);
		const lowRow = r0.rows.find((x) => LOW_IDS.has(x.id));
		const hiRow = r0.rows.find((x) => !LOW_IDS.has(x.id));
		// 低効果を1つチェック → +1種
		await p.click('[data-usd-el="recommend-confirm-list"] li[data-skill-id="' + lowRow.id + '"] .usd-rec-check input');
		const r1 = await readDialog(p);
		const on1 = r1.rows.filter((x) => x.checked);
		assert(on1.length === r0.rows.filter((x) => x.checked).length + 1 && r1.head === headOf(on1), 'サポカ外確認(3) 低効果を1つチェックすると、種数と合計 Pt が数え直される（' + r1.head + '）', r1.head);
		// 通常を1つ外す → -1種
		await p.click('[data-usd-el="recommend-confirm-list"] li[data-skill-id="' + hiRow.id + '"] .usd-rec-check input');
		const r2 = await readDialog(p);
		const on2 = r2.rows.filter((x) => x.checked);
		assert(on2.length === on1.length - 1 && r2.head === headOf(on2), 'サポカ外確認(3) チェックを1つ外すと、種数と合計 Pt がまた数え直される（' + r2.head + '）', r2.head);
		const want = on2.map((x) => x.id);
		const u0 = await p.evaluate(() => UmaSkillDeckCore.undoCount());
		await p.click('[data-usd-el="recommend-confirm-add"]');
		await p.waitForTimeout(400);
		const after = await draftIds(p);
		assert(after.join() === have.concat(want).join(), 'サポカ外確認(3) 「追加する」は、チェックしたものだけを②の末尾に足す（外したものは足さない）', { after, want });
		const u1 = await p.evaluate(() => UmaSkillDeckCore.undoCount());
		assert(u1 === u0 + 1, 'サポカ外確認(3) 「元に戻す」に1回で積む', { u0, u1 });
		const tl = await p.evaluate(() => document.getElementById('toast-message').textContent);
		assert(tl === 'サポカ外 ' + want.length + '種を追加しました。追加しなかったもの 16種（レース条件に合わないため 16種）', 'サポカ外確認(3) 追加したあとの知らせは、足した数と、追加しなかったもの（理由の内訳）', tl);
		await p.click('#deck-undo-btn');
		await p.waitForTimeout(300);
		assert((await draftIds(p)).join() === have.join(), 'サポカ外確認(3) 「元に戻す」で追加前に戻る', await draftIds(p));
		assert(jsErrors(sp.errors).length === 0, 'サポカ外確認(3) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('サポカ外確認(4) 1つもチェックされていないときも「追加する」は押せる見た目のまま、押すと「追加するスキルが選ばれていません」を知らせ、小窓は閉じず、何も足さない', async () => {
		const sp = await openSp();
		const p = sp.page;
		await press(p);
		await p.evaluate(() => document.querySelectorAll('[data-usd-el="recommend-confirm-check"]').forEach((c) => { if (c.checked) c.click(); }));
		const r0 = await readDialog(p);
		assert(r0.rows.every((x) => !x.checked) && r0.head === '追加するスキル 0種（合計 0 Pt）' && r0.addDisabled === false, 'サポカ外確認(4) 全部外すと「0種（合計 0 Pt）」で、「追加する」は無効にしない', { head: r0.head, dis: r0.addDisabled });
		const u0 = await p.evaluate(() => UmaSkillDeckCore.undoCount());
		await p.click('[data-usd-el="recommend-confirm-add"]');
		await p.waitForTimeout(300);
		const r1 = await readDialog(p);
		assert(r1.open && r1.toast === '追加するスキルが選ばれていません', 'サポカ外確認(4) 押すと理由を1行で知らせ、小窓は閉じない', { open: r1.open, toast: r1.toast });
		assert((await draftIds(p)).length === 0 && (await p.evaluate(() => UmaSkillDeckCore.undoCount())) === u0, 'サポカ外確認(4) 何も足さず、「元に戻す」にも積まない', await draftIds(p));
		await sp.ctx.close();
	});
}
