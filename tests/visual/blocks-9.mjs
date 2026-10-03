// 段9（2026-10-03・C-121）の検査。run-smoke.mjs の末尾から register9() で呼ばれる（塊の見出しは「段9」を含む。
// `npm run test:visual -- --only=段9` で回せる）。
//
// ①②の仕上げ: ランク（超優先／優先／通常）をアイコンに置き換え、リセットを①②別々にし、②を3つのまとまり
// （帯・設定の枠・スキルのまとまり）に組み直した。
//   (A) 移行（schemaVersion 5→7・6→7・取り込み）と、アイコンの保存・tiers の導出（Deck・結合画像の印との互換）
//   (B) アイコンの付け方（付ける・同じものを押して外す・付け替え・解除・選択が続く）と、アイコンが数字に影響しないこと
//   (C) ②の合計（アイコンの有無で変わらない・①で取得は数えない・継承固有を含む）・見出しの合計＝①＋②（Pt も種も）
//   (D) 帯（見出し・①・②）の寸法と、②の3つのまとまり・パレット・行
//   (E) リセット（①②を別々に・互いに触らない・戻せる・消すものが無いときは押せない）
//   (F) 3つのまとまりの見分け（ライト・ダーク）
//   375px の高さ
import { contrastRatio, deltaE } from './lib/pixels.mjs';

export async function register9(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const scenReal = readJson('data/scenario-event-skills.json');
	const master = readJson('uma-skill-deck-skills.json').skills;
	const ptReal = readJson('data/skill-pt.json');
	const stepReal = readJson('data/skill-step-up.json');
	const rarityOf = new Map(ptReal.entries.map((e) => [e.skillId, e.rarity]));
	const prevOf = new Map(stepReal.entries.map((e) => [e.skillId, e.prevSkillIds || []]));
	const REAL = { umaId: 'uma-0001', cardIds: ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'] };
	const P = '#deck-roster-panel ';
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const num = (s) => Number(String(s || '').replace(/[^0-9-]/g, ''));
	const parseRgb = (s) => (/rgba?\((\d+), (\d+), (\d+)/.exec(s) || []).slice(1, 4).map(Number);

	const openSet = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, o.userData || USER_DATA);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));
		await sp.page.evaluate(({ roster, scope, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(scope)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster === undefined ? REAL : o.roster, scope: o.scope || null, tab: o.tab === undefined ? 0 : o.tab });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const ud = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:userData')));
	const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')));
	const draftRoster = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special')));
	const takenOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]'))
		.filter((r) => r.querySelector('.usd-roster-got') && !r.classList.contains('usd-roster-grow--off')).map((r) => r.getAttribute('data-skill-id')));
	const rowIcons = (page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]'))
		.map((p) => [p.getAttribute('data-skill-id'), (p.querySelector('[data-usd-act="skill-icon"]') || {}).dataset ? (p.querySelector('[data-usd-act="skill-icon"]').dataset.icon || '') : null])));
	/** ②の数字（帯）。factor-pt / factor-count とタグ2つ、見出しの合計、①の数字 */
	const nums = (page) => page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		const n = (s) => { const e = q(s); return e ? Number((e.textContent || '').replace(/[^0-9-]/g, '')) : null; };
		const tag = (el) => { const e = q('#deck-template-panel [data-usd-el="' + el + '"]'); return e ? { pt: Number(e.dataset.pt), kinds: Number(e.dataset.kinds) } : null; };
		const tot = q('#deck-set-bar [data-usd-el="set-total"]');
		return { fPt: n('#deck-template-panel [data-usd-el="factor-pt"]'), fKinds: n('#deck-template-panel [data-usd-el="factor-count"]'),
			uniq: tag('pt-need-uniq'), common: tag('pt-need-common'),
			total: tot ? Number(tot.dataset.total) : null, totalKinds: tot ? Number(tot.dataset.kinds) : null,
			rPt: n('#deck-roster-panel [data-usd-el="pt-total"]'), rKinds: n('#deck-roster-panel [data-usd-el="pt-count"]'), badge: (q('#skill-count-badge') || {}).textContent };
	});

	// 検査に使うスキル: ①で得る白スキル2つ（重なり）と、①で得ない白スキル（前段を持たないもの。行の Pt の合計で ②の共通スキルの Pt を確かめる）
	let pick = [], free = [], freeAll = [];
	const probe = await openSet({ tab: 0 });
	const taken = await takenOf(probe.page);
	await probe.ctx.close();
	const takenSet = new Set(taken);
	pick = taken.filter((id) => rarityOf.get(id) === 'white').slice(0, 2);
	freeAll = master.filter((s) => !takenSet.has(s.id) && rarityOf.get(s.id) === 'white' && !(s.tags.passive || []).length && (prevOf.get(s.id) || []).length === 0).map((s) => s.id);
	free = freeAll.slice(0, 8);
	assert(pick.length === 2 && free.length === 8, '段9 前提: ①で得る白スキル2つと、①で得ない（前段の無い）白スキル8つを用意できる', { pick, free: free.length });
	// skillIcons: {} ＝ 段9 以降に作ったセットの姿（アイコンを1つも付けていない）。持たない下書きは tiers から導いた姿（○）で読むので、それは (A) で見る
	const SCOPE = { skillIds: pick.concat(free), name: '', updatedAt: '', skillIcons: {} };

	/* ====================================================================
	 * (A) 移行とアイコンの保存
	 * ==================================================================== */
	await block('段9(A) 移行（5→7・6→7・取り込み）と、アイコンの保存・tiers の導出', async () => {
		const Tp = (id, name, ids, extra) => Object.assign({ templateId: id, name, skillIds: ids, createdAt: 'x', updatedAt: 'x' }, extra || {});
		const v5 = { schemaVersion: 5, records: [], customSkills: [],
			templates: [Tp('t1', 'A', ['1', '2', '3', '4'], { tiers: { '1': 1, '3': 3 }, ptRanks: { high: false, mid: true, low: true } }), Tp('t2', 'B', ['5'])] };
		let sp = await openSet({ userData: v5, tab: 1, roster: null });
		let d = await ud(sp.page);
		const t1 = d.templates.find((t) => t.templateId === 't1'), t2 = d.templates.find((t) => t.templateId === 't2');
		assert(d.schemaVersion === 7, '段9(A) 5→7: 読み込みで schemaVersion が 7 になる', d.schemaVersion);
		assert(JSON.stringify(t1.skillIcons) === JSON.stringify({ '1': 'a', '2': 'b', '3': 'c', '4': 'b' }), '段9(A) 5→7: tiers（超優先→◎・優先〔無い id も〕→○・通常→△）が skillIcons に写る', t1.skillIcons);
		assert(!('ptRanks' in t1) && JSON.stringify(t1.tiers) === JSON.stringify({ '1': 1, '3': 3 }), '段9(A) 5→7: ptRanks は捨てる。tiers は残る（Deck・結合画像の印のため）', t1);
		assert(!('skillIcons' in t2), '段9(A) 読み込み: tiers も ptRanks も持たないセットは触らない（開いただけで姿を変えない）', t2);
		// skillIcons を持たないセットは tiers から導いて読む（持たない＝全部 ○）。持つセットはその値を読む
		await sp.page.evaluate(() => deckTemplateManager.setSelectedId('t1'));
		await sp.page.waitForTimeout(200);
		let ic = await rowIcons(sp.page);
		assert(JSON.stringify(ic) === JSON.stringify({ '1': 'a', '2': 'b', '3': 'c', '4': 'b' }), '段9(A) 画面: 保存したアイコンが行の先頭に出る（◎○△○）', ic);
		await sp.page.evaluate(() => deckTemplateManager.setSelectedId('t2'));
		await sp.page.waitForTimeout(200);
		ic = await rowIcons(sp.page);
		assert(JSON.stringify(ic) === JSON.stringify({ '5': 'b' }), '段9(A) 画面: skillIcons を持たないセットは tiers（無い＝優先）から導いて ○ と読む', ic);
		assert(jsErrors(sp.errors).length === 0, '段9(A) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// 6→7: ptRanks だけ持つセットは ptRanks を捨てて 7 にする（tiers が無ければアイコンは補わない）
		const v6 = { schemaVersion: 6, records: [], customSkills: [], templates: [Tp('t1', 'A', ['1', '2'], { ptRanks: { high: true, mid: false, low: true } })] };
		sp = await openSet({ userData: v6, tab: 1, roster: null });
		d = await ud(sp.page);
		assert(d.schemaVersion === 7 && !('ptRanks' in d.templates[0]) && !('skillIcons' in d.templates[0]), '段9(A) 6→7: ptRanks を捨てて schemaVersion 7（tiers が無ければアイコンは補わない）', d.templates[0]);
		await sp.ctx.close();
		// 7 のデータは何も変わらない
		const v7 = { schemaVersion: 7, records: [], customSkills: [], templates: [Tp('t1', 'A', ['1', '2'], { skillIcons: { '1': 'd' } })] };
		sp = await openSet({ userData: v7, tab: 1, roster: null });
		const raw = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
		assert(raw === JSON.stringify(v7), '段9(A) 7→7: 開いただけでは何も変わらない', raw);
		// 取り込み: 6 以前の書き出しは、スキルを持つセットすべてにアイコンを写す。7 は何も変わらない
		const imp = await sp.page.evaluate(({ a, b }) => {
			UmaSkillDeckCore.replaceUserData(JSON.parse(JSON.stringify(a)));
			const x = JSON.parse(localStorage.getItem('umaSkillDeck:userData'));
			UmaSkillDeckCore.replaceUserData(JSON.parse(JSON.stringify(b)));
			const y = localStorage.getItem('umaSkillDeck:userData');
			return { x, y };
		}, { a: v5, b: v7 });
		assert(imp.x.schemaVersion === 7 && JSON.stringify(imp.x.templates[0].skillIcons) === JSON.stringify({ '1': 'a', '2': 'b', '3': 'c', '4': 'b' })
			&& !('skillIcons' in imp.x.templates[1]) && !('ptRanks' in imp.x.templates[0]),
			'段9(A) 取り込み（5）: 読み込みと同じ移行が走る（tiers を持つセットだけアイコンを写す。持たないセットは取り込んでも姿を変えない）', imp.x.templates);
		assert(imp.y === JSON.stringify(v7), '段9(A) 取り込み（7）: 何も変わらない', imp.y);
		const imp6 = await sp.page.evaluate((a) => { UmaSkillDeckCore.replaceUserData(JSON.parse(JSON.stringify(a))); return JSON.parse(localStorage.getItem('umaSkillDeck:userData')); }, v6);
		assert(imp6.schemaVersion === 7 && !('ptRanks' in imp6.templates[0]) && !('skillIcons' in imp6.templates[0]), '段9(A) 取り込み（6）: ptRanks を捨てて 7（tiers が無ければアイコンは補わない）', imp6.templates[0]);
		await sp.ctx.close();

		// 下書きは skillIcons を持たないとき、tiers から導いて読む。触ると skillIcons と tiers が一緒に書かれる
		const dscope = { skillIds: free.slice(0, 3), name: '', updatedAt: '', tiers: { [free[0]]: 1, [free[2]]: 3 } };
		sp = await openSet({ tab: 1, scope: dscope });
		ic = await rowIcons(sp.page);
		assert(ic[free[0]] === 'a' && ic[free[1]] === 'b' && ic[free[2]] === 'c', '段9(A) 下書き: skillIcons を持たなければ tiers から導く（◎○△）', ic);
		await sp.page.click(T + '[data-usd-act="palette-pick"][data-icon="d"]');
		await sp.page.click(T + '.usd-panel[data-skill-id="' + free[1] + '"] [data-usd-act="skill-icon"]');
		await sp.page.waitForTimeout(150);
		const dd = await draft(sp.page);
		assert(JSON.stringify(dd.skillIcons) === JSON.stringify({ [free[0]]: 'a', [free[1]]: 'd', [free[2]]: 'c' }) && !('ptRanks' in dd),
			'段9(A) 下書き: 触ると、いまの姿（導いた分も）を skillIcons に書く', dd);
		assert(dd.tiers[free[0]] === 1 && dd.tiers[free[1]] === 3 && dd.tiers[free[2]] === 3, '段9(A) 下書き: tiers はアイコンから導いて書き直す（◎→1・◇→3・△→3）', dd.tiers);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (B) アイコンの付け方
	 * ==================================================================== */
	await block('段9(B) アイコンの付け方（付ける・外す・付け替え・解除・選択が続く）と、数字に影響しないこと', async () => {
		const sp = await openSet({ tab: 1, scope: SCOPE });
		const ids = SCOPE.skillIds;
		const btn = (id) => T + '.usd-panel[data-skill-id="' + id + '"] [data-usd-act="skill-icon"]';
		const pal = (k) => T + '[data-usd-el="palette-' + k + '"]';
		const pressed = () => sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-palette [aria-pressed="true"]')).map((b) => b.dataset.icon));
		const stored = async () => (await draft(sp.page));
		const before = await nums(sp.page);
		// パレット: 6つの丸と「解除」。初期は ◎
		const palInfo = await sp.page.evaluate(() => ({ marks: Array.from(document.querySelectorAll('#deck-template-panel .usd-palette-btn')).map((b) => b.textContent.trim()),
			clear: (document.querySelector('#deck-template-panel [data-usd-el="palette-clear"]') || {}).textContent, size: (() => { const r = document.querySelector('#deck-template-panel .usd-palette-btn .usd-icon').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() }));
		assert(palInfo.marks.join('') === '◎○△◇★✕' && palInfo.clear === '解除' && palInfo.size.join() === '24,24', '段9(B) パレットは「◎ ○ △ ◇ ★ ✕ │ 解除」。丸は 24px', palInfo);
		assert((await pressed()).join() === 'a', '段9(B) 初期の選択は ◎', await pressed());
		// 付ける
		await sp.page.click(btn(ids[2]));
		await sp.page.waitForTimeout(100);
		let ic = await rowIcons(sp.page);
		let s = await stored();
		assert(ic[ids[2]] === 'a' && s.skillIcons[ids[2]] === 'a', '段9(B) 選択中のアイコンを付ける（◎）。下書きに skillIcons が保存される', { ic: ic[ids[2]], s: s.skillIcons });
		assert(s.tiers[ids[2]] === 1, '段9(B) tiers はアイコンから導く（◎→超優先）', s.tiers);
		// 同じものをもう一度押すと外れる
		await sp.page.click(btn(ids[2]));
		await sp.page.waitForTimeout(100);
		ic = await rowIcons(sp.page);
		s = await stored();
		assert(ic[ids[2]] === '' && !(ids[2] in s.skillIcons), '段9(B) すでに同じアイコンなら外す', { ic: ic[ids[2]], s: s.skillIcons });
		// 付け替え
		await sp.page.click(btn(ids[3]));
		await sp.page.click(pal('c'));
		await sp.page.click(btn(ids[3]));
		await sp.page.waitForTimeout(100);
		ic = await rowIcons(sp.page);
		assert(ic[ids[3]] === 'c' && (await pressed()).join() === 'c', '段9(B) 別のアイコンが付いていれば付け替える（◎→△）。選択は △ のまま', { ic: ic[ids[3]], pressed: await pressed() });
		// 選択が続く: 続けて別の行にも同じアイコンを付けられる
		await sp.page.click(btn(ids[4]));
		await sp.page.click(btn(ids[5]));
		await sp.page.waitForTimeout(100);
		ic = await rowIcons(sp.page);
		assert(ic[ids[4]] === 'c' && ic[ids[5]] === 'c' && (await pressed()).join() === 'c', '段9(B) 選択は保たれ、続けて付けられる', ic);
		// ○ にして付け替え、★ にして付ける
		await sp.page.click(pal('b'));
		await sp.page.click(btn(ids[4]));
		await sp.page.click(pal('e'));
		await sp.page.click(btn(ids[6]));
		await sp.page.waitForTimeout(100);
		ic = await rowIcons(sp.page);
		s = await stored();
		assert(ic[ids[4]] === 'b' && ic[ids[6]] === 'e', '段9(B) ○ への付け替え・★ を付ける', ic);
		// 解除: 種類に関係なく外す。選択は解除のまま続く
		await sp.page.click(pal('clear'));
		await sp.page.click(btn(ids[4]));
		await sp.page.click(btn(ids[5]));
		await sp.page.click(btn(ids[6]));
		await sp.page.click(btn(ids[7]));   // 付いていない行を押しても何も起きない
		await sp.page.waitForTimeout(100);
		ic = await rowIcons(sp.page);
		s = await stored();
		assert(ic[ids[4]] === '' && ic[ids[5]] === '' && ic[ids[6]] === '' && ic[ids[7]] === '' && (await pressed()).join() === 'clear', '段9(B) 解除は、付いているアイコンを種類に関係なく外す（続けて押せる）。選択は解除のまま', { ic, pressed: await pressed() });
		assert(JSON.stringify(s.skillIcons) === JSON.stringify({ [ids[3]]: 'c' }), '段9(B) 保存されるのは、いま付いているアイコンだけ', s.skillIcons);
		// アイコンは Pt・種・合計に影響しない
		const after = await nums(sp.page);
		assert(JSON.stringify(after) === JSON.stringify(before), '段9(B) アイコンを付けても外しても、②・①・見出しの Pt と種は1つも変わらない', { before, after });
		// tiers の導出（Deck・結合画像の印との互換）: ◎→1・○→2・それ以外と無印→3
		await sp.page.click(pal('a'));
		await sp.page.click(btn(ids[0]));
		await sp.page.click(pal('b'));
		await sp.page.click(btn(ids[1]));
		await sp.page.click(pal('d'));
		await sp.page.click(btn(ids[2]));
		await sp.page.waitForTimeout(100);
		const tiers = await sp.page.evaluate((i) => { const sel = deckTemplateManager.getSelection(); return i.map((id) => UmaSkillDeckCore.tiers.of(sel.tiers, id)); }, ids.slice(0, 5));
		assert(tiers.join() === '1,2,3,3,3', '段9(B) 互換: 選択の tiers は ◎→超優先(1)・○→優先(2)・◇と無印→通常(3)', tiers);
		assert(jsErrors(sp.errors).length === 0, '段9(B) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// 保存済みのセットでは template.skillIcons と tiers に書き、schemaVersion は 7
		const sets = { schemaVersion: 6, records: [], customSkills: [], templates: [{ templateId: 't1', name: 'S', skillIds: ids.slice(0, 3), createdAt: 'x', updatedAt: 'x' }] };
		const sp2 = await openSet({ userData: sets, tab: 1, roster: null });
		await sp2.page.evaluate(() => deckTemplateManager.setSelectedId('t1'));
		await sp2.page.waitForTimeout(200);
		await sp2.page.click(T + '[data-usd-act="palette-pick"][data-icon="f"]');
		await sp2.page.click(T + '.usd-panel[data-skill-id="' + ids[1] + '"] [data-usd-act="skill-icon"]');
		await sp2.page.waitForTimeout(150);
		const d2 = await ud(sp2.page);
		assert(d2.schemaVersion === 7 && d2.templates[0].skillIcons[ids[1]] === 'f' && d2.templates[0].skillIcons[ids[0]] === 'b' && d2.templates[0].tiers[ids[1]] === 3 && !(ids[0] in (d2.templates[0].tiers || {})),
			'段9(B) 保存済みのセット: 触ったときに skillIcons（導いた姿＋付けた分）と tiers を書き、schemaVersion は 7', d2.templates[0]);
		await sp2.ctx.close();
	});

	/* ====================================================================
	 * (C) 合計と数え方
	 * ==================================================================== */
	await block('段9(C) ②の合計（アイコン非依存・①で取得は数えない・継承固有を含む）と、見出しの合計＝①＋②', async () => {
		for (const w of [375, 1280]) {
			const tag = '段9(C) ' + w + 'px: ';
			const sets = { schemaVersion: 7, records: [], customSkills: [], templates: [] };
			const sp = await openSet({ w, h: w === 375 ? 812 : 900, userData: sets, tab: 1, scope: SCOPE });
			const n = await nums(sp.page);
			assert(n.fPt === n.uniq.pt + n.common.pt && n.fKinds === n.uniq.kinds + n.common.kinds, tag + '②の Pt ＝ 継承固有 ＋ 共通スキル、種も同じ', n);
			assert(n.uniq.kinds === 6 && n.uniq.pt > 0, tag + '継承固有は既定の6種で、Pt を持つ（タブの種にも含む）', n.uniq);
			assert(n.common.kinds === free.length, tag + '共通スキルの種は①で取得する2種を除いた ' + free.length, n.common);
			// 共通スキルの Pt は、①で取得しない行の Pt の合計以下（①の前段として数えているスキルは、①の側で数えてあるぶん小さくなる）
			const rowSum = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]'))
				.filter((p) => !p.classList.contains('usd-panel--taken')).reduce((a, p) => a + Number(((p.querySelector('[data-usd-el="panel-pt"]') || {}).textContent || '').replace(/[^0-9]/g, '')), 0));
			assert(n.common.pt > 0 && n.common.pt <= rowSum, tag + '共通スキルの Pt は、①で取得しない行の Pt の合計（' + rowSum + '）以下', { common: n.common, rowSum });
			assert(n.badge === n.fKinds + '種', tag + '②のタブの「N種」は継承固有を含む②の種と同じ', n);
			assert(n.total === n.rPt + n.fPt && n.totalKinds === n.rKinds + n.fKinds, tag + '見出しの合計 ＝ ①＋②（Pt ' + n.rPt + '＋' + n.fPt + '、種 ' + n.rKinds + '＋' + n.fKinds + '）', n);
			const hdr = await sp.page.evaluate(() => ({ num: document.querySelector('#deck-set-bar [data-usd-el="set-total-num"]').textContent, kinds: document.querySelector('#deck-set-bar [data-usd-el="set-total-kinds"]').textContent }));
			assert(num(hdr.num) === n.total && hdr.kinds === '／' + n.totalKinds + '種', tag + '見出しの帯は「N Pt／M種」（' + hdr.num + ' ' + hdr.kinds + '）', hdr);
			await sp.page.click(BAR + '[data-usd-act="set-total-help"]');
			const forms = await sp.page.evaluate(() => ({ pt: (document.querySelector('[data-usd-el="set-total-formula"]') || {}).textContent, kinds: (document.querySelector('[data-usd-el="set-total-kinds-formula"]') || {}).textContent }));
			assert(forms.pt === '合計 ＝ ① ' + n.rPt.toLocaleString('en-US') + ' ＋ ② ' + n.fPt.toLocaleString('en-US') && forms.kinds === '種 ＝ ① ' + n.rKinds + ' ＋ ② ' + n.fKinds, tag + '?の中：合計 ＝ ① X ＋ ② Y、種 ＝ ① N ＋ ② M', forms);
			await sp.page.keyboard.press('Escape');
			// ②の ? の中
			await sp.page.click(T + '[data-usd-act="pt-need-help"]');
			const help = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el^="factor-help"]')).map((p) => p.getAttribute('data-usd-el') + ':' + p.textContent));
			assert(help.some((x) => /factor-help-theory:.*理論値/.test(x)) && help.some((x) => /factor-help-formula:② ＝ 継承固有 [\d,]+ ＋ 共通スキル [\d,]+/.test(x)) && help.some((x) => /factor-help-taken:①で取得するスキル 2種は数えていません/.test(x)),
				tag + '?の中：理論値・式（継承固有＋共通スキル）・①で取得するスキルは数えていない', help);
			await sp.page.keyboard.press('Escape');
			// 継承固有の種類を変えると、継承固有の Pt・種だけが変わる（共通スキルは変わらない）
			await sp.page.selectOption(T + '[data-usd-el="uniq-count"]', '3');
			await sp.page.waitForTimeout(150);
			const n3 = await nums(sp.page);
			assert(n3.uniq.kinds === 3 && n3.uniq.pt < n.uniq.pt && JSON.stringify(n3.common) === JSON.stringify(n.common) && n3.fKinds === 3 + free.length && n3.total === n3.rPt + n3.fPt,
				tag + '継承固有を3種にすると、継承固有の Pt と種だけが減り、合計も追随する', { n: n.uniq, n3 });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// ①が空のセットでは、共通スキルの Pt ＝ 行の Pt の合計（前段・重なりの影響が無い）。独立の数え方との一致
		const sp0 = await openSet({ tab: 1, scope: SCOPE, roster: null });
		const n0 = await nums(sp0.page);
		const sum0 = await sp0.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]')).reduce((a, p) => a + Number(((p.querySelector('[data-usd-el="panel-pt"]') || {}).textContent || '').replace(/[^0-9]/g, '')), 0));
		assert(n0.rPt === 0 && n0.rKinds === 0 && n0.common.pt === sum0 && n0.common.kinds === SCOPE.skillIds.length && n0.total === n0.fPt, '段9(C) ①が空: 共通スキルの Pt ＝ 行の Pt の合計（' + sum0 + '）、種 ＝ ' + SCOPE.skillIds.length + '、見出しの合計 ＝ ②', { n0, sum0 });
		await sp0.ctx.close();
		// ①で取得するスキルは、②に入っていても数えない。行は「①で取得」。?に赤い点
		const sp = await openSet({ tab: 1, scope: SCOPE });
		const info = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]')).map((p) => ({ id: p.getAttribute('data-skill-id'), taken: p.classList.contains('usd-panel--taken'), pt: (p.querySelector('[data-usd-el="panel-pt"]') || {}).textContent })));
		assert(info.filter((x) => pick.includes(x.id)).every((x) => x.taken && x.pt === '①で取得') && info.filter((x) => !pick.includes(x.id)).every((x) => !x.taken && /Pt/.test(x.pt || '')), '段9(C) ①で得るスキルは「①で取得」（薄い行）。それ以外は Pt が出る', info);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (D) 帯と、②の3つのまとまり
	 * ==================================================================== */
	await block('段9(D) 帯（見出し・①・②）の寸法と、②の3つのまとまり・パレット・行', async () => {
		for (const w of [375, 1280]) {
			const tag = '段9(D) ' + w + 'px: ';
			// ---- 見出しの帯と①の帯 ----
			let sp = await openSet({ w, h: w === 375 ? 812 : 900, tab: 0 });
			const g1 = await sp.page.evaluate(() => {
				const S = '#deck-roster-panel [data-usd-el="pt-sum"]';
				const cs = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; };
				const pill = document.querySelector('#deck-set-bar [data-usd-el="set-pill"]');
				const sumBtns = document.querySelector('#deck-roster-panel [data-usd-el="pt-sumbtns"]');
				const reset = document.querySelector('#deck-roster-panel [data-usd-el="roster-reset"]');
				return {
					bar: Math.round(document.getElementById('deck-set-bar').getBoundingClientRect().height),
					name: [cs('#deck-set-bar .usd-setbar-name', 'fontSize'), cs('#deck-set-bar .usd-setbar-name', 'fontWeight')],
					pill: [cs('#deck-set-bar [data-usd-el="set-count"]', 'fontSize'), pill ? getComputedStyle(pill).borderTopWidth : null, pill ? getComputedStyle(pill).borderTopLeftRadius : null, pill ? getComputedStyle(pill).backgroundColor : null, pill ? pill.textContent.replace(/\s+/g, '') : null],
					num: [cs('#deck-set-bar [data-usd-el="set-total-num"]', 'fontSize'), cs('#deck-set-bar [data-usd-el="set-total-num"]', 'fontWeight')],
					k: [cs('#deck-set-bar .usd-setbar-k', 'fontSize'), cs('#deck-set-bar .usd-setbar-k', 'fontWeight')],
					sub: [cs('#deck-set-bar [data-usd-el="set-total-sub"]', 'fontSize'), (document.querySelector('#deck-set-bar [data-usd-el="set-total-sub"]') || {}).textContent],
					subHelp: !!document.querySelector('#deck-set-bar .usd-setbar-subline [data-usd-el="set-total-help"]'),
					band: [cs(S, 'backgroundColor'), cs(S, 'borderTopLeftRadius'), cs(S, 'paddingTop'), cs(S, 'paddingLeft')],
					pt: [cs('#deck-roster-panel [data-usd-el="pt-total"]', 'fontSize'), cs('#deck-roster-panel [data-usd-el="pt-total"]', 'fontWeight'), cs('#deck-roster-panel [data-usd-el="pt-total"]', 'fontVariantNumeric')],
					unit: [cs('#deck-roster-panel .usd-band-unit', 'fontSize'), cs('#deck-roster-panel .usd-band-unit', 'fontWeight')],
					kinds: [cs('#deck-roster-panel [data-usd-el="pt-count"]', 'fontSize'), cs('#deck-roster-panel [data-usd-el="pt-count"]', 'fontWeight'), (document.querySelector('#deck-roster-panel .usd-band-slash') || {}).textContent],
					kunit: [cs('#deck-roster-panel .usd-band-kunit', 'fontSize'), (document.querySelector('#deck-roster-panel .usd-band-kunit') || {}).textContent],
					btns: Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="pt-sumbtns"] button')).map((b) => b.textContent),
					scroll: sumBtns ? getComputedStyle(sumBtns).overflowX : null,
					reset: reset ? [Math.round(reset.getBoundingClientRect().width), Math.round(reset.getBoundingClientRect().height), getComputedStyle(reset).borderTopLeftRadius, reset.textContent] : null,
					resetRight: reset && sumBtns ? reset.getBoundingClientRect().left >= sumBtns.getBoundingClientRect().right - 1 : null
				};
			});
			assert(g1.bar <= (w === 375 ? 40 : 60), tag + '見出しの帯の高さは 375px で 40px 以下（' + g1.bar + 'px）', g1.bar);
			assert(g1.name.join() === '16px,800' && g1.pill[0] === '11px' && g1.pill[1] === '1px' && g1.pill[2] === '999px' && g1.pill[4] === '2／10▾' && g1.pill[3] !== 'rgba(0, 0, 0, 0)',
				tag + '左：セット名 16px/800。「✎ 2／10 ▾」は 11px・1px の線・角丸999px・薄い地の札', g1);
			assert(g1.num.join() === '18px,800' && g1.k.join() === '12px,700' && g1.sub[0] === '10.5px' && /^(切れ者・|勉強家・)?①＋②$/.test(g1.sub[1]) && g1.subHelp,
				tag + '右：1行目「N」18px/800＋Pt・／M種 12px/700、2行目「…①＋②」10.5px＋?', g1);
			assert(g1.band[0] === 'rgb(233, 238, 246)' && g1.band[1] === '10px' && g1.band[2] === '8px' && g1.band[3] === '10px', tag + '①の「Pt／種」は薄い帯（角丸10px・横10px縦8px・背景 --uma-band）', g1.band);
			assert(g1.pt[0] === '22px' && g1.pt[1] === '800' && /tabular-nums/.test(g1.pt[2]) && g1.unit.join() === '12px,700' && g1.kinds[0] === '14px' && g1.kinds[1] === '800' && g1.kinds[2] === '／' && g1.kunit.join() === '11px,種',
				tag + '数字 22px/800・tabular-nums、Pt 12px/700、／N 14px/800、種 11px', g1);
			assert(g1.btns.join() === '勉強家,切れ者,覚醒Lv5' && g1.scroll === 'auto', tag + '①の帯の右側は「勉強家 切れ者 覚醒Lv5」（足りなければ横スクロール）', g1.btns);
			assert(g1.reset && g1.reset[0] === 28 && g1.reset[1] === 28 && g1.reset[2] === '999px' && g1.reset[3] === '↺' && g1.resetRight, tag + '右端に丸い「↺」（28px）', g1.reset);
			assert(jsErrors(sp.errors).length === 0, tag + '①: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();

			// ---- ②: 3つのまとまり ----
			sp = await openSet({ w, h: w === 375 ? 812 : 900, tab: 1, scope: Object.assign({}, SCOPE, { skillIcons: { [free[0]]: 'a', [free[1]]: 'f' } }) });
			const o = await sp.page.evaluate(() => {
				const q = (s) => document.querySelector('#deck-template-panel ' + s);
				const r = (s) => { const e = q(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
				const cs = (s, p) => { const e = q(s); return e ? getComputedStyle(e)[p] : null; };
				const rows = Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]'));
				const first = rows[0], firstFree = rows.find((x) => !x.classList.contains('usd-panel--taken'));
				const ib = firstFree.querySelector('[data-usd-act="skill-icon"]').getBoundingClientRect();
				const noneIcon = rows.find((x) => !x.querySelector('[data-icon]') && !x.classList.contains('usd-panel--taken')).querySelector('.usd-icon');
				const nameBtn = firstFree.querySelector('.usd-panel-namebtn');
				const cols = new Set(rows.map((x) => Math.round(x.getBoundingClientRect().left))).size;
				return {
					band: { bg: cs('[data-usd-el="set-head"]', 'backgroundColor'), radius: cs('[data-usd-el="set-head"]', 'borderTopLeftRadius'), pad: cs('[data-usd-el="set-head"]', 'paddingTop') + ' ' + cs('[data-usd-el="set-head"]', 'paddingLeft') },
					cfg: { style: cs('[data-usd-el="roster-link"]', 'borderTopStyle'), width: cs('[data-usd-el="roster-link"]', 'borderTopWidth'), radius: cs('[data-usd-el="roster-link"]', 'borderTopLeftRadius'), color: cs('[data-usd-el="roster-link"]', 'borderTopColor'), bg: cs('[data-usd-el="roster-link"]', 'backgroundColor') },
					grp: { style: cs('[data-usd-el="skill-group"]', 'borderTopStyle'), width: cs('[data-usd-el="skill-group"]', 'borderTopWidth'), radius: cs('[data-usd-el="skill-group"]', 'borderTopLeftRadius'), bg: cs('[data-usd-el="skill-group"]', 'backgroundColor'), padL: cs('[data-usd-el="skill-group"]', 'paddingLeft') },
					order: [r('[data-usd-el="set-head"]'), r('[data-usd-el="roster-link"]'), r('[data-usd-el="skill-group"]')].map((x) => x && x.top),
					inGroup: ['.usd-entry-row', '[data-usd-el="tier-row"]', '[data-usd-el="selected-list"]'].map((s) => !!q('[data-usd-el="skill-group"] ' + s)),
					tops: { entry: r('.usd-entry-row'), pal: r('.usd-palette'), list: r('[data-usd-el="selected-list"]') },
					tagBand: { sum: r('[data-usd-el="factor-sum"]'), tags: r('[data-usd-el="pt-chips"]'), tag: r('[data-usd-el="pt-need-uniq"]'), reset: r('[data-usd-el="factor-reset"]'), tagRadius: cs('[data-usd-el="pt-need-uniq"]', 'borderTopLeftRadius'), tagBg: cs('[data-usd-el="pt-need-uniq"]', 'backgroundColor'), tagBorder: cs('[data-usd-el="pt-need-uniq"]', 'borderTopWidth') },
					tagTexts: ['pt-need-uniq', 'pt-need-common'].map((k) => (q('[data-usd-el="' + k + '"]') || {}).textContent.replace(/\s+/g, ' ').trim()),
					sumText: (q('[data-usd-el="factor-sum"]') || {}).textContent,
					sumFs: [cs('[data-usd-el="factor-pt"]', 'fontSize'), cs('[data-usd-el="factor-pt"]', 'fontWeight')],
					cfgText: (q('[data-usd-el="roster-link-row"]') || {}).textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
					entries: Array.from(document.querySelectorAll('#deck-template-panel .usd-entry-row > button')).map((b) => b.textContent.replace(/\s+/g, '')),
					entryRowOverflow: cs('.usd-entry-row', 'overflowX'),
					gone: ['tier-total', 'mode-reclass', 'mode-delete', 'selected-count', 'clear-skills'].filter((k) => q('[data-usd-el="' + k + '"]')).concat(q('.usd-tier-tab') ? ['tier-tab'] : [], q('[data-usd-act="tier-move"]') ? ['tier-move'] : [], q('.usd-ptneed-chip--rank') ? ['rank-chip'] : []),
					rowN: rows.length, cols,
					iconBtn: [Math.round(ib.width), Math.round(ib.height)],
					icon: (() => { const b = firstFree.querySelector('.usd-icon').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(),
					noneIcon: noneIcon ? { bs: getComputedStyle(noneIcon).borderTopStyle, text: noneIcon.textContent } : null,
					firstPartsOrder: Array.from(firstFree.children).map((c) => c.getAttribute('data-usd-act') || c.className.split(' ')[0] + '|' + (c.getAttribute('data-usd-el') || '')),
					nameEll: { to: getComputedStyle(nameBtn).textOverflow, ws: getComputedStyle(nameBtn).whiteSpace, ov: getComputedStyle(nameBtn).overflowX },
					taken: rows.filter((x) => x.classList.contains('usd-panel--taken')).map((x) => ({ pt: x.querySelector('[data-usd-el="panel-pt"]').textContent, iconOp: getComputedStyle(x.querySelector('.usd-icon')).opacity })),
					x: rows.every((x) => !!x.querySelector('[data-usd-act="template-skill-remove"]')),
					firstId: first.getAttribute('data-skill-id')
				};
			});
			assert(o.band.bg === 'rgb(233, 238, 246)' && o.band.radius === '10px' && o.band.pad === '8px 10px', tag + '②の帯: 薄い地（--uma-band）・角丸10px・横10px縦8px', o.band);
			assert(o.cfg.style === 'dashed' && o.cfg.width === '1px' && o.cfg.radius === '10px' && o.cfg.bg !== 'rgba(0, 0, 0, 0)', tag + '②の設定の枠: 破線・薄い地・角丸10px', o.cfg);
			assert(o.grp.style === 'solid' && o.grp.width === '1px' && o.grp.radius === '10px' && o.grp.bg === 'rgb(255, 255, 255)' && o.grp.padL === '8px', tag + '②のスキルのまとまり: 白い枠・線あり・角丸10px・横8px', o.grp);
			assert(o.order.every((v, i) => v !== null && (i === 0 || v > o.order[i - 1])) && o.inGroup.every(Boolean), tag + '上から 帯 → 設定の枠 → スキルのまとまり（入口・パレット・一覧はまとまりの中）', o);
			assert(o.tagTexts[0].startsWith('継承固有') && /Pt／6種$/.test(o.tagTexts[0]) && o.tagTexts[1].startsWith('共通スキル') && /Pt／\d+種$/.test(o.tagTexts[1]) && /Pt／\d+種$/.test(o.sumText) && o.sumFs.join() === '22px,800',
				tag + '帯の1段目「X Pt／N種」、タグは［継承固有 … Pt／6種］［共通スキル … Pt／N種］', o);
			assert(o.tagBand.tagRadius === '7px' && o.tagBand.tagBorder === '1px' && o.tagBand.tagBg === 'rgb(255, 255, 255)', tag + 'タグは白地・線あり・角丸7px', o.tagBand);
			if (w === 375) assert(o.tagBand.tag.top >= o.tagBand.sum.bottom && o.tagBand.reset.top < o.tagBand.tag.top && o.tagBand.reset.right > o.tagBand.tags.right - 40, tag + '375px: タグは2段目に折り返し、「↺」は1段目の右端', o.tagBand);
			else assert(o.tagBand.tag.top < o.tagBand.sum.bottom && o.tagBand.reset.top < o.tagBand.sum.bottom, tag + '1280px: タグは1段目に並ぶ（「↺」も1段目の右端）', o.tagBand);
			assert(/^継承固有/.test(o.cfgText) && /共通スキルのヒントLv/.test(o.cfgText), tag + '設定の枠は「継承固有 [6種▾][Lv3▾]」「共通スキルのヒントLv [5▾]」', o.cfgText);
			assert(o.entries.map((x) => x.replace(/\d+$/, '')).join() === '条件で検索,緑スキル,テキストで検索,スクショで追加' && o.entryRowOverflow === 'auto', tag + '入口のボタン4つ（横スクロール）', o.entries);
			assert(o.gone.length === 0, tag + '超優先／優先／通常・再分類・削除（ランク）・ランク別の見出し・ランクのチップは無い', o.gone);
			assert(o.iconBtn[0] >= 32 && o.iconBtn[1] >= 32 && o.icon.join() === '18,18', tag + 'アイコンは 18px。押す範囲は 32px 以上（' + o.iconBtn.join('×') + '）', o);
			assert(o.noneIcon && o.noneIcon.bs === 'dashed' && o.noneIcon.text === '', tag + 'アイコンの無いスキルは破線の丸（中は空）', o.noneIcon);
			assert(o.firstPartsOrder[0] === 'skill-icon' && o.firstPartsOrder[1].startsWith('usd-panel-namebtn') && o.firstPartsOrder[2].startsWith('usd-panel-pt') && o.firstPartsOrder[3] === 'template-skill-remove', tag + '行は「アイコン／名前／Pt／×」の順', o.firstPartsOrder);
			assert(o.nameEll.to === 'ellipsis' && o.nameEll.ws === 'nowrap' && o.nameEll.ov === 'hidden' && o.x, tag + '名前は長いとき省略（…）。行ごとに「×」がある', o);
			assert(o.taken.length === 2 && o.taken.every((x) => x.pt === '①で取得' && Number(x.iconOp) < 1), tag + '①で取得するものは丸を薄くして「①で取得」と出す', o.taken);
			if (w === 1280) {
				assert(o.tops.entry.top < o.tops.pal.bottom && o.tops.pal.top < o.tops.entry.bottom && o.tops.pal.right >= o.tops.entry.right && o.tops.list.top >= o.tops.entry.bottom && o.cols === 4, tag + '1280px: 入口のボタンとパレットは同じ行（パレットは右寄せ）、一覧は4列（' + o.cols + '列）', o);
			} else assert(o.tops.pal.top >= o.tops.entry.bottom - 1 && o.tops.list.top >= o.tops.pal.bottom - 1, tag + '375px: 入口 → パレット → 一覧の順に縦に並ぶ', o.tops);
			assert(jsErrors(sp.errors).length === 0, tag + '②: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * (E) リセット
	 * ==================================================================== */
	await block('段9(E) リセット（①②を別々に・互いに触らない・戻せる・消すものが無いときは押せない）', async () => {
		// ---- ② ----
		const sets = { schemaVersion: 7, records: [], customSkills: [], templates: [] };
		const scope = Object.assign({}, SCOPE, { skillIcons: { [free[0]]: 'a', [free[1]]: 'c' }, scopes: { genes: true }, inheritedUnique: { count: 4 }, parentHintLevel: 3, name: '' });
		let sp = await openSet({ userData: sets, tab: 1, scope });
		const rBefore = await draftRoster(sp.page);
		const nBefore = await nums(sp.page);
		await sp.page.click(T + '[data-usd-el="factor-reset"]');
		const ops = await sp.page.evaluate(() => ({ title: (document.querySelector('[data-usd-el="info-pop"] [data-usd-el="info-title"]') || document.querySelector('[data-usd-el="info-pop"]') || { textContent: '' }).textContent,
			btns: ['factor-reset-all', 'factor-reset-icons', 'factor-reset-cancel'].map((k) => { const b = document.querySelector('[data-usd-el="' + k + '"]'); return b ? { text: b.textContent, red: /danger/.test(b.className), dis: b.disabled, top: Math.round(b.getBoundingClientRect().top) } : null; }) }));
		assert(/② 因子周回をリセット/.test(ops.title) && ops.btns.every(Boolean) && ops.btns[0].text === 'スキル' + (free.length + pick.length) + '種をすべて消す' && ops.btns[0].red && ops.btns[1].text === 'アイコンだけすべて外す' && ops.btns[2].text === 'やめる'
			&& ops.btns[0].top < ops.btns[1].top && ops.btns[1].top < ops.btns[2].top, '段9(E) ②の小窓: 縦3つ「スキル○種をすべて消す」（赤）／「アイコンだけすべて外す」／「やめる」（○は消える共通スキルの種。継承固有は含めない）', ops);
		// やめる → 何も変わらない
		await sp.page.click('[data-usd-el="factor-reset-cancel"]');
		await sp.page.waitForTimeout(150);
		assert(JSON.stringify(await draft(sp.page)) === JSON.stringify(Object.assign({}, scope, { updatedAt: (await draft(sp.page)).updatedAt }, { tiers: (await draft(sp.page)).tiers })) || (await draft(sp.page)).skillIds.length === SCOPE.skillIds.length, '段9(E) 「やめる」では何も変わらない', await draft(sp.page));
		// アイコンだけ外す: スキルは残り、アイコンだけが消える
		await sp.page.click(T + '[data-usd-el="factor-reset"]');
		await sp.page.click('[data-usd-el="factor-reset-icons"]');
		await sp.page.waitForTimeout(200);
		let dd = await draft(sp.page);
		let ic = await rowIcons(sp.page);
		assert(dd.skillIds.length === SCOPE.skillIds.length && JSON.stringify(dd.skillIcons) === '{}' && Object.values(ic).every((v) => v === ''), '段9(E) 「アイコンだけすべて外す」: スキルは残り、アイコンはすべて消える（空の skillIcons を持つ）', { n: dd.skillIds.length, icons: dd.skillIcons });
		assert(JSON.stringify(await nums(sp.page)) === JSON.stringify(nBefore), '段9(E) アイコンだけ外しても Pt と種は変わらない', await nums(sp.page));
		await sp.page.click('#deck-undo-btn');
		await sp.page.waitForTimeout(200);
		dd = await draft(sp.page);
		assert(JSON.stringify(dd.skillIcons) === JSON.stringify({ [free[0]]: 'a', [free[1]]: 'c' }), '段9(E) 「元に戻す」で外したアイコンが戻る', dd.skillIcons);
		// 全部消す: ②のスキルの一覧とアイコンだけ。継承固有・共通スキルのヒントLv・チェック・①は触らない
		await sp.page.click(T + '[data-usd-el="factor-reset"]');
		await sp.page.click('[data-usd-el="factor-reset-all"]');
		await sp.page.waitForTimeout(200);
		dd = await draft(sp.page);
		const rAfter = await draftRoster(sp.page);
		const afterNums = await nums(sp.page);
		assert(dd.skillIds.length === 0 && Object.keys(dd.skillIcons || {}).length === 0, '段9(E) 「スキル○種をすべて消す」: スキルの一覧とアイコンが空になる', dd);
		assert(JSON.stringify(dd.inheritedUnique) === JSON.stringify({ count: 4 }) && dd.parentHintLevel === 3 && JSON.stringify(dd.scopes) === JSON.stringify({ genes: true }), '段9(E) 継承固有の設定・共通スキルのヒントLv・シナリオ因子／遺伝子のチェックは触らない', dd);
		assert(JSON.stringify(rAfter) === JSON.stringify(rBefore) && afterNums.rPt === nBefore.rPt && afterNums.rKinds === nBefore.rKinds, '段9(E) ①（本育成編成）は触らない', { r: rAfter, afterNums });
		assert(afterNums.uniq.kinds === 4 && afterNums.common.kinds === 0 && afterNums.common.pt === 0, '段9(E) 消したあとの②は、継承固有（4種）だけが残る', afterNums);
		const dis = await sp.page.evaluate(() => document.querySelector('#deck-template-panel [data-usd-el="factor-reset"]').disabled);
		assert(dis === true, '段9(E) 消したあと（スキル0種・アイコン0。継承固有の設定は残る）は、②の「↺」が薄く、押せない', dis);
		await sp.page.click('#deck-undo-btn');
		await sp.page.waitForTimeout(250);
		dd = await draft(sp.page);
		assert(dd.skillIds.length === SCOPE.skillIds.length && JSON.stringify(dd.skillIcons) === JSON.stringify({ [free[0]]: 'a', [free[1]]: 'c' }), '段9(E) 「元に戻す」でスキルもアイコンも戻る', dd);
		assert(jsErrors(sp.errors).length === 0, '段9(E) ②: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// 消すものが無い（スキル0種・アイコン0）ときは薄くして押せない
		sp = await openSet({ tab: 1, scope: null });
		const empty = await sp.page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-reset"]'); return b ? { dis: b.disabled, color: getComputedStyle(b).color, ok: getComputedStyle(document.querySelector('#deck-roster-panel [data-usd-el="roster-reset"]')).color } : null; });
		assert(empty && empty.dis === true, '段9(E) スキル0種・アイコン0のときは、②の「↺」は薄く、押せない', empty);
		await sp.ctx.close();

		// ---- ① ----
		sp = await openSet({ userData: sets, tab: 0, scope: SCOPE });
		await sp.page.selectOption(P + '[data-axis="distance"]', { index: 1 });
		await sp.page.click(P + '[data-usd-act="pt-status"][data-value="kire"]');
		await sp.page.waitForTimeout(150);
		const off = await sp.page.evaluate(() => { const c = document.querySelector('#deck-roster-panel input[data-usd-act="take-skill"]'); c.click(); return c.getAttribute('data-skill-id'); });
		await sp.page.waitForTimeout(150);
		const r0 = await draftRoster(sp.page);
		const s0 = await draft(sp.page);
		assert(r0.skillFilter && r0.skillFilter.distance && r0.pt && r0.pt.status === 'kire' && (r0.offSkillIds || []).includes(off) && r0.umaId, '段9(E) 前提: ①に、絞り込み・切れ者・スキルのオフ・育成ウマ娘がある', r0);
		const rBtn = await sp.page.evaluate(() => { const b = document.querySelector('#deck-roster-panel [data-usd-el="roster-reset"]'); return { dis: b.disabled, w: b.getBoundingClientRect().width }; });
		assert(rBtn.dis === false, '段9(E) ①に中身があるので「↺」は押せる', rBtn);
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		const op1 = await sp.page.evaluate(() => ({ title: (document.querySelector('[data-usd-el="info-pop"]') || { textContent: '' }).textContent, all: (document.querySelector('[data-usd-el="roster-reset-all"]') || {}).textContent, red: /danger/.test((document.querySelector('[data-usd-el="roster-reset-all"]') || { className: '' }).className),
			cancel: (document.querySelector('[data-usd-el="roster-reset-cancel"]') || {}).textContent, n: document.querySelectorAll('[data-usd-el="roster-reset-ops"] button').length }));
		assert(/① 本育成編成をリセット/.test(op1.title) && op1.all === '中身をすべて消す' && op1.red && op1.cancel === 'やめる' && op1.n === 2, '段9(E) ①の小窓: 「中身をすべて消す」（赤）／「やめる」', op1);
		await sp.page.click('[data-usd-el="roster-reset-cancel"]');
		assert(JSON.stringify(await draftRoster(sp.page)) === JSON.stringify(r0), '段9(E) ①: 「やめる」では何も変わらない', await draftRoster(sp.page));
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(250);
		const r1 = await draftRoster(sp.page);
		const s1 = await draft(sp.page);
		assert(!r1.umaId && r1.cardIds.every((c) => !c) && !r1.offSkillIds && !r1.eventChoices, '段9(E) ①: 育成ウマ娘・サポカ・イベントの選択・スキルのオン/オフが消える', r1);
		assert(JSON.stringify(r1.skillFilter) === JSON.stringify(r0.skillFilter) && JSON.stringify(r1.pt) === JSON.stringify(r0.pt), '段9(E) ①: 絞り込み（距離・脚質・バ場）と、勉強家・切れ者・覚醒Lv の設定は触らない', { f: r1.skillFilter, pt: r1.pt });
		assert(JSON.stringify(s1.skillIds) === JSON.stringify(s0.skillIds), '段9(E) ①のリセットは②を触らない', s1.skillIds.length);
		const dis1 = await sp.page.evaluate(() => document.querySelector('#deck-roster-panel [data-usd-el="roster-reset"]').disabled);
		assert(dis1 === true, '段9(E) 中身が空になった①の「↺」は薄く、押せない', dis1);
		await sp.page.click('#deck-undo-btn');
		await sp.page.waitForTimeout(250);
		const r2 = await draftRoster(sp.page);
		assert(r2.umaId === r0.umaId && JSON.stringify(r2.cardIds) === JSON.stringify(r0.cardIds) && JSON.stringify(r2.offSkillIds) === JSON.stringify(r0.offSkillIds), '段9(E) ①: 「元に戻す」で編成の中身が戻る', r2);
		assert(jsErrors(sp.errors).length === 0, '段9(E) ①: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 保存済みのセットの①も同じ（付いている roster の中身だけが消える。名前は触らない）
		const sets2 = { schemaVersion: 7, records: [], customSkills: [], templates: [{ templateId: 't1', name: 'セット名', skillIds: free.slice(0, 2), createdAt: 'x', updatedAt: 'x', baseRosterId: 'r1' }],
			rosters: [Object.assign({ rosterId: 'r1', name: 'セット名', star: 3, awakeningLevel: 5, createdAt: 'x', updatedAt: 'x', pt: { umaHintLevel: 3, status: 'kire' } }, { umaId: 'uma-0002', cardIds: ['card-0250', null, null, null, null, null] })] };
		sp = await openSet({ userData: sets2, tab: 0, roster: null });
		await sp.page.evaluate(() => deckTemplateManager.setSelectedId('t1'));
		await sp.page.waitForTimeout(300);
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(250);
		const d3 = await ud(sp.page);
		assert(!d3.rosters[0].umaId && d3.rosters[0].cardIds.every((c) => !c) && d3.rosters[0].name === 'セット名' && d3.rosters[0].pt.status === 'kire' && d3.templates[0].skillIds.length === 2, '段9(E) 保存済みのセット: ①の中身だけが消え、名前・切れ者・②は残る', d3);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (F) 3つのまとまりの見分け（ライト・ダーク）
	 * ==================================================================== */
	await block('段9(F) 帯・設定の枠・スキルのまとまりの見分け（ライト・ダーク。濃淡と線の種類・コントラスト比 4.5 以上）', async () => {
		for (const theme of ['light', 'dark']) {
			const tag = '段9(F) ' + theme + ': ';
			const sp = await openSet({ w: 375, tab: 1, scope: Object.assign({}, SCOPE, { skillIcons: { [free[0]]: 'a' } }) });
			if (theme === 'dark') { await sp.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await sp.page.waitForTimeout(200); }
			const v = await sp.page.evaluate(() => {
				const c = (s, p, root) => { const e = (root || document).querySelector(s); return e ? getComputedStyle(e)[p] : null; };
				const T = '#deck-template-panel ';
				return {
					bg: { band: c(T + '[data-usd-el="set-head"]', 'backgroundColor'), cfg: c(T + '[data-usd-el="roster-link"]', 'backgroundColor'), grp: c(T + '[data-usd-el="skill-group"]', 'backgroundColor') },
					line: { cfg: [c(T + '[data-usd-el="roster-link"]', 'borderTopStyle'), c(T + '[data-usd-el="roster-link"]', 'borderTopColor')], grp: [c(T + '[data-usd-el="skill-group"]', 'borderTopStyle'), c(T + '[data-usd-el="skill-group"]', 'borderTopColor')], bandW: c(T + '[data-usd-el="set-head"]', 'borderTopWidth'), cfgW: c(T + '[data-usd-el="roster-link"]', 'borderTopWidth'), grpW: c(T + '[data-usd-el="skill-group"]', 'borderTopWidth') },
					text: [
						['帯の数字', c(T + '[data-usd-el="factor-pt"]', 'color'), c(T + '[data-usd-el="set-head"]', 'backgroundColor')],
						['帯の「種」', c(T + '.usd-band-kunit', 'color'), c(T + '[data-usd-el="set-head"]', 'backgroundColor')],
						['タグの名前', c(T + '.usd-band-tagname', 'color'), c(T + '.usd-band-tag', 'backgroundColor')],
						['タグの数字', c(T + '.usd-band-tag strong', 'color'), c(T + '.usd-band-tag', 'backgroundColor')],
						['設定の枠の文字', c(T + '.usd-uniq-label', 'color'), c(T + '[data-usd-el="roster-link"]', 'backgroundColor')],
						['入口のボタン', c(T + '.usd-entry-row .uma-btn', 'color'), c(T + '.usd-entry-row .uma-btn', 'backgroundColor')],
						['解除のボタン', c(T + '[data-usd-el="palette-clear"]', 'color'), c(T + '[data-usd-el="palette-clear"]', 'backgroundColor')],
						['アイコンの記号', c(T + '.usd-icon[data-icon="a"]', 'color'), c(T + '.usd-icon[data-icon="a"]', 'backgroundColor')]
					],
					iconColors: ['a', 'b', 'c', 'd', 'e', 'f'].map((i) => c(T + '.usd-palette-btn[data-icon="' + i + '"] .usd-icon', 'backgroundColor'))
				};
			});
			const rgbs = { band: parseRgb(v.bg.band), cfg: parseRgb(v.bg.cfg), grp: parseRgb(v.bg.grp) };
			const de = { bg: deltaE(rgbs.band, rgbs.grp), bc: deltaE(rgbs.band, rgbs.cfg), cg: deltaE(rgbs.cfg, rgbs.grp) };
			assert(v.line.cfg[0] === 'dashed' && v.line.grp[0] === 'solid' && v.line.bandW === '0px' && v.line.cfgW !== '0px' && v.line.grpW !== '0px', tag + '線の種類: 設定の枠は破線、まとまりは実線、帯は線なし（幅 0）', v.line);
			assert(de.bg >= 5 && de.bc >= 5, tag + '濃淡: 帯は、設定の枠・まとまりのどちらとも ΔE 5 以上（帯↔まとまり ' + de.bg.toFixed(1) + '、帯↔設定の枠 ' + de.bc.toFixed(1) + '）', de);
			if (theme === 'dark') assert(de.cg >= 5, tag + '濃淡: ダークでは設定の枠とまとまりも ΔE 5 以上（' + de.cg.toFixed(1) + '）', de);
			assert(parseRgb(v.line.grp[1]).join() !== rgbs.grp.join(), tag + 'まとまりの線は面と違う色', v.line.grp);
			if (theme === 'dark') assert(rgbs.grp[0] < 70 && rgbs.band[2] > rgbs.band[0], tag + 'ダークの面は暗い（まとまり ' + rgbs.grp.join() + '・帯は青み ' + rgbs.band.join() + '）', rgbs);
			const low = v.text.map(([name, fg, bg]) => ({ name, ratio: contrastRatio(parseRgb(fg), parseRgb(bg)) })).filter((x) => x.ratio < 4.5);
			assert(low.length === 0, tag + '文字のコントラスト比はすべて 4.5 以上（帯・タグ・設定の枠・入口・解除・アイコンの記号）', low.map((x) => x.name + ' ' + x.ratio.toFixed(2)));
			assert(new Set(v.iconColors).size === 6, tag + 'アイコン6つの色はすべて違う', v.iconColors);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * 375px の高さ
	 * ==================================================================== */
	await block('段9 375px の高さ（帯 40px 以下・①の表の上端 351px 以下・②の一覧の上端 400px 以下・行 31px）', async () => {
		const scope = { skillIds: ['1', '2', '3', '4', '5', '6'], name: '', updatedAt: '' };
		const m = {};
		for (const tab of [0, 1]) {
			const sp = await openSet({ w: 375, h: 812, tab, scope });
			Object.assign(m, await sp.page.evaluate((t) => {
				const r = (s) => { const e = document.querySelector(s); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
				const cell = document.querySelector('#deck-roster-panel .usd-roster-grow[data-skill-id] [role="cell"]');
				return t === 0 ? { bar: Math.round(document.getElementById('deck-set-bar').getBoundingClientRect().height), grid: r('#deck-roster-panel .usd-roster-grid-wrap'), row: cell ? Math.round(cell.getBoundingClientRect().height) : null }
					: { list: r('#deck-template-panel [data-usd-el="selected-list"]') };
			}, tab));
			assert(jsErrors(sp.errors).length === 0, '段9 375px: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		console.log('     [実測] 375px: 帯 ' + m.bar + 'px／①の表の上端 ' + m.grid + 'px（段8 336px）／②の一覧の上端 ' + m.list + 'px（段8 284px）／行 ' + m.row + 'px（31px）');
		assert(m.bar <= 40 && m.grid <= 351 && m.list <= 400 && m.row === 31, '段9 375px: 帯 ' + m.bar + 'px・①の表の上端 ' + m.grid + 'px・②の一覧の上端 ' + m.list + 'px・行 ' + m.row + 'px', m);
	});
}
