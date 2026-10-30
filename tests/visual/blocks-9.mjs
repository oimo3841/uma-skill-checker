import { reloadReady } from './lib/page-ready.mjs';
import { withEventScenarioFirst } from './lib/scenario-doc.mjs';
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
import { contrastRatio, deltaE, tokRgb } from './lib/pixels.mjs';

export async function register9(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const scenReal = withEventScenarioFirst(readJson('data/scenario-event-skills.json'));
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
		await reloadReady(sp.page);
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
	// C-226: 行の先頭の自動のマーカーの種類（'card'｜'star'｜'other'）
	const rowMarkers = (page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]'))
		.map((p) => [p.getAttribute('data-skill-id'), (p.querySelector('[data-usd-el="factor-marker"]') || { dataset: {} }).dataset.marker || null])));
	/** ②の数字（帯）。factor-pt / factor-count とタグ2つ、見出しの合計、①の数字 */
	// C-235: 継承固有・共通スキルの「Pt／種」は②の「?」の小窓の中だけ。開いて読み、閉じる（? が無いときは読まない）
	const nums = async (page) => {
		const HELP = '#deck-template-panel [data-usd-act="pt-need-help"]';
		const has = !!(await page.$(HELP)) && (await page.isVisible(HELP));
		if (has) await page.click(HELP);
		const r = await numsIn(page);
		if (has) await page.keyboard.press('Escape');
		return r;
	};
	const numsIn = (page) => page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		const n = (s) => { const e = q(s); return e ? Number((e.textContent || '').replace(/[^0-9-]/g, '')) : null; };
		const tag = (el) => { const e = q('[data-usd-el="info-body"] [data-usd-el="' + el + '"]'); return e ? { pt: Number(e.dataset.pt), kinds: Number(e.dataset.kinds) } : null; };
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
	// C-223（2026-10-28）: ①での合計のヒントLv が2以下の白は②でも数える（「①で取得」にならない）ので、重なりの2つはそれ以外の白から選ぶ
	const lowHint = await probe.page.evaluate(async (r) => { await UmaSkillDeckCore.loadSkillPtData(); const d = UmaSkillDeckCore.getRosterPtDetail(r); return d ? d.lowHintIds : null; }, REAL);
	await probe.ctx.close();
	const takenSet = new Set(taken);
	pick = taken.filter((id) => rarityOf.get(id) === 'white' && lowHint && lowHint.indexOf(id) === -1).slice(0, 2);
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
		// C-226（②因子周回 段4）: special の②はアイコン（skillIcons）を読まない。行の先頭は自動のマーカー（保存のアイコン・tiers に依らない）
		await sp.page.evaluate(() => deckTemplateManager.setSelectedId('t1'));
		await sp.page.waitForTimeout(200);
		let ic = await rowIcons(sp.page);
		let mk = await rowMarkers(sp.page);
		assert(JSON.stringify(ic) === JSON.stringify({ '1': null, '2': null, '3': null, '4': null }) && Object.keys(mk).length === 4 && Object.values(mk).every((k) => k === 'card' || k === 'star' || k === 'other'),
			'段9(A) 画面（C-226）: 保存したアイコンは出さず、行の先頭は自動のマーカー', { ic, mk });
		await sp.page.evaluate(() => deckTemplateManager.setSelectedId('t2'));
		await sp.page.waitForTimeout(200);
		ic = await rowIcons(sp.page);
		assert(JSON.stringify(ic) === JSON.stringify({ '5': null }), '段9(A) 画面（C-226）: skillIcons を持たないセットもアイコンは出ない', ic);
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

		// 下書き（C-226）: skillIcons を持たなくてもアイコンは出さない。②を触っても（外す）skillIcons は書かず、tiers は保存のまま（外したスキルの分も消さない）
		const dscope = { skillIds: free.slice(0, 3), name: '', updatedAt: '', tiers: { [free[0]]: 1, [free[2]]: 3 } };
		sp = await openSet({ tab: 1, scope: dscope });
		ic = await rowIcons(sp.page);
		assert(ic[free[0]] === null && ic[free[1]] === null && ic[free[2]] === null, '段9(A) 下書き（C-226）: アイコンは出さない', ic);
		await sp.page.click(T + '[data-usd-el="palette-delete"]');
		await sp.page.click(T + '.usd-panel[data-skill-id="' + free[1] + '"]');
		await sp.page.waitForTimeout(150);
		const dd = await draft(sp.page);
		assert(!('skillIcons' in dd) && !('ptRanks' in dd) && JSON.stringify(dd.skillIds) === JSON.stringify([free[0], free[2]]),
			'段9(A) 下書き（C-226）: 触っても skillIcons は書かない', dd);
		assert(JSON.stringify(dd.tiers) === JSON.stringify({ [free[0]]: 1, [free[2]]: 3 }), '段9(A) 下書き（C-226）: tiers は保存のまま（アイコンから導いて書き直さない）', dd.tiers);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * (B) アイコンの付け方
	 * ==================================================================== */
	await block('段9(B) アイコンの付け方は無くした（C-226）: パレットのアイコンも行の先頭のアイコンのボタンも無い／保存のアイコンの有無で数字は変わらない／触っても skillIcons・tiers を書かない', async () => {
		const ids = SCOPE.skillIds;
		const icons = { [ids[0]]: 'a', [ids[2]]: 'c', [ids[3]]: 'e' };
		const sp = await openSet({ tab: 1, scope: SCOPE });
		const before = await nums(sp.page);
		const ui = await sp.page.evaluate(() => ({ pal: document.querySelectorAll('#deck-template-panel .usd-palette-btn, #deck-template-panel [data-usd-el^="palette-"]:not([data-usd-el="palette-delete"])').length,
			btns: document.querySelectorAll('#deck-template-panel [data-usd-act="skill-icon"]').length, del: (document.querySelector('#deck-template-panel [data-usd-el="palette-delete"]') || { getAttribute: () => null }).getAttribute('aria-label') }));
		// C-235: 「削除」は文字を消したゴミ箱のアイコンのボタン（読み上げの名前は「削除」）
		assert(ui.pal === 0 && ui.btns === 0 && ui.del === '削除', '段9(B) C-226: パレットのアイコン・行の先頭のアイコンのボタンは無い（「削除」は残る。C-235 でゴミ箱のアイコン・読み上げは「削除」）', ui);
		await sp.ctx.close();
		const sp1 = await openSet({ tab: 1, scope: Object.assign({}, SCOPE, { skillIcons: icons }) });
		const withIcons = await nums(sp1.page);
		assert(JSON.stringify(withIcons) === JSON.stringify(before), '段9(B) 保存のアイコンがあってもなくても、②・①・見出しの Pt と種は1つも変わらない', { before, withIcons });
		assert(jsErrors(sp1.errors).length === 0, '段9(B) コンソールのエラー0', jsErrors(sp1.errors).slice(0, 3));
		await sp1.ctx.close();
		// 保存済みのセット: 触っても（外す）skillIcons と tiers は書かない（保存の値のまま）
		const sets = { schemaVersion: 7, records: [], customSkills: [], templates: [{ templateId: 't1', name: 'S', skillIds: ids.slice(0, 3), skillIcons: { [ids[0]]: 'b' }, tiers: { [ids[1]]: 3 }, createdAt: 'x', updatedAt: 'x' }] };
		const sp2 = await openSet({ userData: sets, tab: 1, roster: null });
		await sp2.page.evaluate(() => deckTemplateManager.setSelectedId('t1'));
		await sp2.page.waitForTimeout(200);
		await sp2.page.click(T + '[data-usd-el="palette-delete"]');
		await sp2.page.click(T + '.usd-panel[data-skill-id="' + ids[1] + '"]');
		await sp2.page.waitForTimeout(150);
		const d2 = await ud(sp2.page);
		assert(JSON.stringify(d2.templates[0].skillIds) === JSON.stringify([ids[0], ids[2]]) && JSON.stringify(d2.templates[0].skillIcons) === JSON.stringify({ [ids[0]]: 'b' }) && JSON.stringify(d2.templates[0].tiers) === JSON.stringify({ [ids[1]]: 3 }),
			'段9(B) 保存済みのセット: 外しても skillIcons と tiers は保存の値のまま（書かない・消さない）', d2.templates[0]);
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
			// C-178: ①で取る金と、②にあるその前段の白は、見出しの合計の種数だけ1種に数える（1つの金につき1種まで）。引く数はデータから独立に数える
			const cross = (() => {
				const used = new Set(); let c = 0;
				taken.filter((id) => rarityOf.get(id) === 'gold').forEach((g) => {
					const seen = new Set([g]); let hit = null;
					const walk = (x) => (prevOf.get(x) || []).forEach((p) => { if (seen.has(p)) return; seen.add(p); if (!hit && free.includes(p) && !used.has(p)) hit = p; walk(p); });
					walk(g);
					if (hit) { used.add(hit); c++; }
				});
				return c;
			})();
			assert(n.total === n.rPt + n.fPt && n.totalKinds === n.rKinds + n.fKinds - cross, tag + '見出しの合計 ＝ ①＋②（Pt ' + n.rPt + '＋' + n.fPt + '、種 ' + n.rKinds + '＋' + n.fKinds + '−' + cross + '）', Object.assign({ cross }, n));
			const hdr = await sp.page.evaluate(() => ({ num: document.querySelector('#deck-set-bar [data-usd-el="set-total-num"]').textContent, kinds: document.querySelector('#deck-set-bar [data-usd-el="set-total-kinds"]').textContent }));
			assert(num(hdr.num) === n.total && hdr.kinds === '／' + n.totalKinds + '種', tag + '見出しの帯は「N Pt／M種」（' + hdr.num + ' ' + hdr.kinds + '）', hdr);
			await sp.page.click(BAR + '[data-usd-act="set-total-help"]');
			const forms = await sp.page.evaluate(() => ({ pt: (document.querySelector('[data-usd-el="set-total-formula"]') || {}).textContent, kinds: (document.querySelector('[data-usd-el="set-total-kinds-formula"]') || {}).textContent }));
			assert(forms.pt === '合計 ＝ ① ' + n.rPt.toLocaleString('en-US') + ' ＋ ② ' + n.fPt.toLocaleString('en-US') && forms.kinds === '種 ＝ ① ' + n.rKinds + ' ＋ ② ' + n.fKinds + (cross > 0 ? ' − ' + cross + '（金+白で1種）' : ''), tag + '?の中：合計 ＝ ① X ＋ ② Y、種 ＝ ① N ＋ ② M', forms);
			await sp.page.keyboard.press('Escape');
			// ②の ? の中
			await sp.page.click(T + '[data-usd-act="pt-need-help"]');
			// C-235: ? の中は「継承固有 … Pt／…種」「共通スキル … Pt／…種」の2行だけ（理論値・式・①で取得の1行は消した）
			const help = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-body"] > *')).map((p) => p.getAttribute('data-usd-el') + ':' + p.textContent));
			assert(help.length === 2 && /^pt-need-uniq:継承固有 [\d,]+ Pt／\d+種$/.test(help[0]) && /^pt-need-common:共通スキル [\d,]+ Pt／\d+種$/.test(help[1]),
				tag + '?の中：継承固有・共通スキルの2行だけ', help);
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
			// C-235: 「✎ 2／10 ▾」の札は無くした（セット名を押すと編成セットの小窓）
			assert(g1.name.join() === '16px,800' && g1.pill.every((x) => x === null),
				tag + '左：セット名 16px/800。「✎ 2／10 ▾」の札は無い（C-235）', g1);
			assert(g1.num.join() === '18px,800' && g1.k.join() === '12px,700' && g1.sub[0] === '10.5px' && /^(切れ者・|勉強家・)?①＋②$/.test(g1.sub[1]) && g1.subHelp,
				tag + '右：1行目「N」18px/800＋Pt・／M種 12px/700、2行目「…①＋②」10.5px＋?', g1);
			assert(g1.band[0] === await tokRgb(sp.page, 'var(--uma-band)') &&   /* C-144: 帯の地はトークンの値（UmaStar は暖色 #efe4cf） */ g1.band[1] === '10px' && g1.band[2] === (w <= 640 ? '4px' : '8px') && g1.band[3] === (w <= 640 ? '4px' : '10px'), tag + '①の「Pt／種」は薄い帯（角丸10px・スマホは縦横4px（段4で進化ボタン44pxのために詰めた）／PC は縦8px・横10px・背景 --uma-band）', g1.band);
			assert(g1.pt[0] === '22px' && g1.pt[1] === '800' && /tabular-nums/.test(g1.pt[2]) && g1.unit.join() === '12px,700' && g1.kinds[0] === '14px' && g1.kinds[1] === '800' && g1.kinds[2] === '／' && g1.kunit.join() === '11px,種',
				tag + '数字 22px/800・tabular-nums、Pt 12px/700、／N 14px/800、種 11px', g1);
			assert(g1.btns.join() === '勉強家,切れ者,覚醒Lv5' && g1.scroll === 'visible', tag + '①の帯の右側は「勉強家 切れ者 覚醒Lv5」（段4で横スクロール・フェードをやめた。足りなければ帯が2行になる）', { b: g1.btns, s: g1.scroll });
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
				// C-226: 行の先頭はアイコンのボタンに代えて自動のマーカー（20px の画像。箱は幅 26px）
				const ib = firstFree.querySelector('.usd-panel-marker').getBoundingClientRect();
				const nameBtn = firstFree.querySelector('.usd-panel-namebtn');
				const cols = new Set(rows.map((x) => Math.round(x.getBoundingClientRect().left))).size;
				return {
					band: { bg: cs('[data-usd-el="set-head"]', 'backgroundColor'), radius: cs('[data-usd-el="set-head"]', 'borderTopLeftRadius'), pad: cs('[data-usd-el="set-head"]', 'paddingTop') + ' ' + cs('[data-usd-el="set-head"]', 'paddingLeft') },
					cfg: { style: cs('[data-usd-el="roster-link"]', 'borderTopStyle'), width: cs('[data-usd-el="roster-link"]', 'borderTopWidth'), radius: cs('[data-usd-el="roster-link"]', 'borderTopLeftRadius'), color: cs('[data-usd-el="roster-link"]', 'borderTopColor'), bg: cs('[data-usd-el="roster-link"]', 'backgroundColor') },
					grp: { style: cs('[data-usd-el="skill-group"]', 'borderTopStyle'), width: cs('[data-usd-el="skill-group"]', 'borderTopWidth'), radius: cs('[data-usd-el="skill-group"]', 'borderTopLeftRadius'), bg: cs('[data-usd-el="skill-group"]', 'backgroundColor'), padL: cs('[data-usd-el="skill-group"]', 'paddingLeft') },
					order: [r('[data-usd-el="set-head"]'), r('[data-usd-el="roster-link"]'), r('[data-usd-el="skill-group"]')].map((x) => x && x.top),
					inGroup: ['.usd-entry-row', '[data-usd-el="tier-row"]', '[data-usd-el="selected-list"]'].map((s) => !!q('[data-usd-el="skill-group"] ' + s)),
					tops: { entry: r('.usd-entry-row'), pal: r('[data-usd-el="tier-row"]'), list: r('[data-usd-el="selected-list"]') },
					tagBand: { band: r('[data-usd-el="set-head"]'), sum: r('[data-usd-el="factor-sum"]'), help: r('[data-usd-el="pt-need-help-btn"]'), tags: r('[data-usd-el="pt-chips"]'), tag: r('[data-usd-el="pt-need-uniq"]'), tag2: r('[data-usd-el="pt-need-common"]'), reset: r('[data-usd-el="factor-reset"]'), resetInBand: !!document.querySelector('#deck-template-panel [data-usd-el="set-head"] [data-usd-el="factor-reset"]'),
						tagFs: [cs('[data-usd-el="pt-need-uniq"]', 'fontSize'), cs('[data-usd-el="pt-chips"]', 'lineHeight')], tagBg: cs('[data-usd-el="pt-need-uniq"]', 'backgroundColor'), tagBorder: cs('[data-usd-el="pt-need-uniq"]', 'borderTopWidth') },
					tagTexts: ['pt-need-uniq', 'pt-need-common'].map((k) => (q('[data-usd-el="' + k + '"]') || { textContent: null }).textContent),
					sumText: (q('[data-usd-el="factor-sum"]') || {}).textContent,
					sumFs: [cs('[data-usd-el="factor-pt"]', 'fontSize'), cs('[data-usd-el="factor-pt"]', 'fontWeight')],
					// C-235: 継承固有・共通スキルのヒントLv の部品は合計の行（band-cfg）に移した。点線の設定の枠の行は無い
					cfgText: (q('[data-usd-el="band-cfg"]') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim().slice(0, 60), cfgBox: r('[data-usd-el="band-cfg"]'),
					entries: Array.from(document.querySelectorAll('#deck-template-panel .usd-entry-row > button:not([data-usd-act="outside-open"])')).map((b) => b.textContent.replace(/\s+/g, '')),
					entryRowOverflow: cs('.usd-entry-row', 'overflowX'),
					gone: ['tier-total', 'mode-reclass', 'mode-delete', 'selected-count', 'clear-skills'].filter((k) => q('[data-usd-el="' + k + '"]')).concat(q('.usd-tier-tab') ? ['tier-tab'] : [], q('[data-usd-act="tier-move"]') ? ['tier-move'] : [], q('.usd-ptneed-chip--rank') ? ['rank-chip'] : []),
					rowN: rows.length, cols,
					iconBtn: [Math.round(ib.width), Math.round(ib.height)],
					icon: (() => { const b = firstFree.querySelector('[data-usd-el="factor-marker"]').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(),
					markerRole: (firstFree.querySelector('[data-usd-el="factor-marker"]') || { getAttribute: () => null }).getAttribute('role'),
					firstPartsOrder: Array.from(firstFree.children).map((c) => c.getAttribute('data-usd-act') || c.className.split(' ')[0] + '|' + (c.getAttribute('data-usd-el') || '')),
					nameEll: { to: getComputedStyle(nameBtn).textOverflow, ws: getComputedStyle(nameBtn).whiteSpace, ov: getComputedStyle(nameBtn).overflowX },
					taken: rows.filter((x) => x.classList.contains('usd-panel--taken')).map((x) => ({ pt: x.querySelector('[data-usd-el="panel-pt"]').textContent, marker: !!x.querySelector('[data-usd-el="factor-marker"]') })),
					x: rows.every((x) => !!x.querySelector('[data-usd-act="template-skill-remove"]')),
					xVisible: rows.some((x) => { const b = x.querySelector('.usd-panel-xbtn'); const r = b ? b.getBoundingClientRect() : null; return !!r && r.width > 0 && r.height > 0; }),
					firstId: first.getAttribute('data-skill-id')
				};
			});
			assert(o.band.bg === await tokRgb(sp.page, 'var(--uma-band)') &&   /* C-144 */ o.band.radius === '10px' && o.band.pad === (w <= 640 ? '4px 4px' : '8px 10px'), tag + '②の帯: 薄い地（--uma-band）・角丸10px・PC は横10px縦8px／スマホは①と同じ縦横4px（②因子周回 段1）', o.band);
			assert(o.order[1] === null, tag + '②の設定の枠（破線）の行は無い（C-235。部品は合計の行へ）', o.order);
			assert(o.grp.style === 'solid' && o.grp.width === '1px' && o.grp.radius === '10px' && o.grp.bg === await tokRgb(sp.page, 'var(--uma-group-bg)') &&   /* C-144: まとまりの面はトークンの値（UmaStar は #fffdf8） */ o.grp.padL === '8px', tag + '②のスキルのまとまり: 白い枠・線あり・角丸10px・横8px', o.grp);
			assert(o.order[0] !== null && o.order[2] !== null && o.order[2] > o.order[0] && o.inGroup.every(Boolean), tag + '上から 帯 → スキルのまとまり（入口・右端の塊・一覧はまとまりの中）', o);
			// C-235: 継承固有・共通スキルの「Pt／種」の2行は帯から消し、? の小窓の中だけに出す（小窓の中身は 段9(C)）
			assert(o.tagTexts[0] === null && o.tagTexts[1] === null && /Pt／\d+種$/.test(o.sumText) && o.sumFs.join() === '22px,800',
				tag + '帯の1段目「X Pt／N種」。継承固有・共通スキルの2行は帯に無い（C-235）', o);
			// どの幅でも1行目: 合計 → ? → 2行（右寄せ）→ ↺。2行は縦に重なり、↺ の左に接する。帯の高さは 375px で①と同じ 36px（1280px は 44px）
			const tb = o.tagBand;
			// C-235: 合計 → ? → 右寄せの部品2つ。入らない幅（375px）は部品2つが2行目（帯 66px）、1280px は1行（44px）。↺ は入口の行へ
			assert(o.cfgBox && tb.resetInBand === false && (w === 375 ? (o.cfgBox.top >= tb.sum.bottom - 1 && tb.band.h === 66) : (o.cfgBox.top < tb.sum.bottom && o.cfgBox.left > tb.help.right && tb.band.h === 44)),
				tag + w + 'px: 部品2つは ' + (w === 375 ? '2行目' : '1行目の右寄せ') + '・帯の高さ ' + tb.band.h + 'px・↺ は帯に無い', { tb, cfg: o.cfgBox });
			assert(/^継承固有/.test(o.cfgText) && /共通スキルのヒントLv/.test(o.cfgText), tag + '合計の行の部品は「継承固有 [6種▾][Lv3▾]」「共通スキルのヒントLv [5▾]」', o.cfgText);
			// C-235: 4つの入口は虫眼鏡の小窓へ。行に残るのは「オススメサポ」「脚質オススメ」
			assert(o.entries.join() === '脚質オススメ' && o.entryRowOverflow === 'auto', tag + '入口の行のボタンはオススメサポと脚質オススメだけ（横スクロールの作りは残る）', o.entries);
			assert(o.gone.length === 0, tag + '超優先／優先／通常・再分類・削除（ランク）・ランク別の見出し・ランクのチップは無い', o.gone);
			// C-226: 行の先頭は自動のマーカー（20px の画像）。箱は段9 のアイコンのボタンと同じ幅 26px・高さ 32px（名前の位置を変えない）
			assert(o.iconBtn.join() === '26,32' && o.icon.join() === '20,20' && o.markerRole === 'img', tag + '行の先頭は自動のマーカー（20px・画像）。箱は 26×32px（' + o.iconBtn.join('×') + '）', o);
			// C-132: 名前は「…」で切らず、名前の部分（panel-namescroll）だけ横に送る。段G(4)（2026-10-22）: 行の末尾に×を作ってある（「削除」を選んでいる間だけ見える。段G の検査）
			assert(o.firstPartsOrder.length === 4 && o.firstPartsOrder[0] === 'usd-panel-marker|' && o.firstPartsOrder[1] === 'usd-panel-namescroll|panel-namescroll' && o.firstPartsOrder[2].startsWith('usd-panel-pt') && o.firstPartsOrder[3] === 'template-skill-remove', tag + '行は「マーカー／名前／Pt／×（削除の状態のときだけ見える）」の順', o.firstPartsOrder);
			assert(o.nameEll.to !== 'ellipsis' && o.nameEll.ws === 'nowrap' && o.x && !o.xVisible, tag + '名前は「…」で切らない（横に送る）。×は作ってあるが、削除の状態でなければ見えない', o);
			assert(o.taken.length === 2 && o.taken.every((x) => x.pt === '①で取得' && x.marker), tag + '①で取得するものは「①で取得」と出す（マーカーは同じ規則で付く）', o.taken);
			// C-226: パレットの行を無くし、どの幅でも「入口のボタン｜右端の固定の塊（◎・表・削除）」の1行
			assert(o.tops.entry.top < o.tops.pal.bottom && o.tops.pal.top < o.tops.entry.bottom && o.tops.pal.right >= o.tops.entry.right && o.tops.list.top >= o.tops.entry.bottom && (w !== 1280 || o.cols === 4),
				tag + '入口のボタンと右端の塊は同じ行（塊は右寄せ）・一覧はその下' + (w === 1280 ? '・4列（' + o.cols + '列）' : ''), o.tops);
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
			btns: ['factor-reset-all', 'factor-reset-cancel'].map((k) => { const b = document.querySelector('[data-usd-el="' + k + '"]'); return b ? { text: b.textContent, red: /danger/.test(b.className), dis: b.disabled, top: Math.round(b.getBoundingClientRect().top) } : null; }),
			icons: !!document.querySelector('[data-usd-el="factor-reset-icons"]'), n: document.querySelectorAll('[data-usd-el="factor-reset-ops"] button').length }));
		assert(/② 因子周回をリセット/.test(ops.title) && ops.btns.every(Boolean) && ops.btns[0].text === 'スキル' + (free.length + pick.length) + '種をすべて消す' && ops.btns[0].red && ops.btns[1].text === 'やめる' && !ops.icons && ops.n === 2
			&& ops.btns[0].top < ops.btns[1].top, '段9(E) ②の小窓: 縦2つ「スキル○種をすべて消す」（赤）／「やめる」（C-226 で「アイコンだけすべて外す」は無くした。○は消える共通スキルの種。継承固有は含めない）', ops);
		// やめる → 何も変わらない
		await sp.page.click('[data-usd-el="factor-reset-cancel"]');
		await sp.page.waitForTimeout(150);
		assert(JSON.stringify(await draft(sp.page)) === JSON.stringify(Object.assign({}, scope, { updatedAt: (await draft(sp.page)).updatedAt }, { tiers: (await draft(sp.page)).tiers })) || (await draft(sp.page)).skillIds.length === SCOPE.skillIds.length, '段9(E) 「やめる」では何も変わらない', await draft(sp.page));
		let dd;
		// 全部消す: ②のスキルの一覧だけ（C-226: 保存のアイコン skillIcons は消さない）。継承固有・共通スキルのヒントLv・チェック・①は触らない
		await sp.page.click(T + '[data-usd-el="factor-reset"]');
		await sp.page.click('[data-usd-el="factor-reset-all"]');
		await sp.page.waitForTimeout(200);
		dd = await draft(sp.page);
		const rAfter = await draftRoster(sp.page);
		const afterNums = await nums(sp.page);
		assert(dd.skillIds.length === 0 && JSON.stringify(dd.skillIcons) === JSON.stringify({ [free[0]]: 'a', [free[1]]: 'c' }), '段9(E) 「スキル○種をすべて消す」: スキルの一覧が空になる（保存のアイコンは消さない＝C-226）', dd);
		assert(JSON.stringify(dd.inheritedUnique) === JSON.stringify({ count: 4 }) && dd.parentHintLevel === 3 && JSON.stringify(dd.scopes) === JSON.stringify({ genes: true }), '段9(E) 継承固有の設定・共通スキルのヒントLv・シナリオ因子／遺伝子のチェックは触らない', dd);
		assert(JSON.stringify(rAfter) === JSON.stringify(rBefore) && afterNums.rPt === nBefore.rPt && afterNums.rKinds === nBefore.rKinds, '段9(E) ①（本育成編成）は触らない', { r: rAfter, afterNums });
		assert(afterNums.uniq.kinds === 4 && afterNums.common.kinds === 0 && afterNums.common.pt === 0, '段9(E) 消したあとの②は、継承固有（4種）だけが残る', afterNums);
		const dis = await sp.page.evaluate(() => document.querySelector('#deck-template-panel [data-usd-el="factor-reset"]').disabled);
		assert(dis === true, '段9(E) 消したあと（スキル0種。保存のアイコン・継承固有の設定は残る）は、②の「↺」が薄く、押せない', dis);
		await sp.page.click('#deck-undo-btn');
		await sp.page.waitForTimeout(250);
		dd = await draft(sp.page);
		assert(dd.skillIds.length === SCOPE.skillIds.length && JSON.stringify(dd.skillIcons) === JSON.stringify({ [free[0]]: 'a', [free[1]]: 'c' }), '段9(E) 「元に戻す」でスキルが戻る（保存のアイコンはそのまま）', dd);
		assert(jsErrors(sp.errors).length === 0, '段9(E) ②: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// 消すものが無い（スキル0種）ときは薄くして押せない
		sp = await openSet({ tab: 1, scope: null });
		const empty = await sp.page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-reset"]'); return b ? { dis: b.disabled, color: getComputedStyle(b).color, ok: getComputedStyle(document.querySelector('#deck-roster-panel [data-usd-el="roster-reset"]')).color } : null; });
		assert(empty && empty.dis === true, '段9(E) スキル0種のときは、②の「↺」は薄く、押せない', empty);
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
		assert(/① 本育成編成をリセット/.test(op1.title) && op1.all === '中身をすべて消す' && op1.red && op1.cancel === 'やめる' && op1.n === 3, '段9(E) ①の小窓: 「取得しないスキルを戻す」／「中身をすべて消す」（赤）／「やめる」（段4で、戻す範囲を選べるようにした）', op1);
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
			// C-226: 3種のマーカーが出るように、サポカ外の一覧のスキルを2つ足す（①の6枚＝REAL がカードを持たないので、カードの印は出ない＝2種を見る）
			const starIds = readJson('data/non-support-skills.json').entries.map((e) => e.skillId).filter((id) => SCOPE.skillIds.indexOf(id) === -1).slice(0, 2);
			const sp = await openSet({ w: 375, tab: 1, scope: Object.assign({}, SCOPE, { skillIds: SCOPE.skillIds.concat(starIds) }) });
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
						// ②因子周回 段1: タグをやめて帯の地の上の2行にした（地は帯）
						['2行の名前', c(T + '.usd-band-statname', 'color'), c(T + '[data-usd-el="set-head"]', 'backgroundColor')],
						['2行の数字', c(T + '.usd-band-stat strong', 'color'), c(T + '[data-usd-el="set-head"]', 'backgroundColor')],
						['2行の Pt／種', c(T + '.usd-band-stat', 'color'), c(T + '[data-usd-el="set-head"]', 'backgroundColor')],
						['設定の枠の文字', c(T + '.usd-uniq-label', 'color'), c(T + '[data-usd-el="roster-link"]', 'backgroundColor')],
						['入口のボタン', c(T + '.usd-entry-row .uma-btn--secondary', 'color'), c(T + '.usd-entry-row .uma-btn--secondary', 'backgroundColor')],
						['削除のボタン', c(T + '[data-usd-el="palette-delete"]', 'color'), c(T + '[data-usd-el="palette-delete"]', 'backgroundColor')]   // C-132: 「解除」→「削除」
					],
					// C-226: パレットのアイコンは無くした。行の先頭の自動のマーカー（3種）の内側の色と、記号（白）
					iconColors: ['card', 'star', 'other'].map((k) => c(T + '[data-usd-el="factor-marker"][data-marker="' + k + '"] .usd-mk-fill', 'fill')),
					markerSym: ['card', 'star', 'other'].map((k) => [c(T + '[data-usd-el="factor-marker"][data-marker="' + k + '"] .usd-mk-symbol', k === 'other' ? 'stroke' : 'fill'), c(T + '[data-usd-el="factor-marker"][data-marker="' + k + '"] .usd-mk-fill', 'fill')])
				};
			});
			const rgbs = { band: parseRgb(v.bg.band), cfg: parseRgb(v.bg.cfg), grp: parseRgb(v.bg.grp) };
			const de = { bg: deltaE(rgbs.band, rgbs.grp), bc: deltaE(rgbs.band, rgbs.cfg), cg: deltaE(rgbs.cfg, rgbs.grp) };
			assert(v.line.cfg[0] === 'dashed' && v.line.grp[0] === 'solid' && v.line.bandW === '0px' && v.line.cfgW !== '0px' && v.line.grpW !== '0px', tag + '線の種類: 設定の枠は破線、まとまりは実線、帯は線なし（幅 0）', v.line);
			assert(de.bg >= 5 && de.bc >= 5, tag + '濃淡: 帯は、設定の枠・まとまりのどちらとも ΔE 5 以上（帯↔まとまり ' + de.bg.toFixed(1) + '、帯↔設定の枠 ' + de.bc.toFixed(1) + '）', de);
			if (theme === 'dark') assert(de.cg >= 5, tag + '濃淡: ダークでは設定の枠とまとまりも ΔE 5 以上（' + de.cg.toFixed(1) + '）', de);
			assert(parseRgb(v.line.grp[1]).join() !== rgbs.grp.join(), tag + 'まとまりの線は面と違う色', v.line.grp);
			// C-144: UmaStar のダークはほぼモノトーン（帯＝合計パネル #3a3834）。帯は青みではなく、まとまりより明るい
			if (theme === 'dark') assert(rgbs.grp[0] < 70 && rgbs.band[0] > rgbs.grp[0], tag + 'ダークの面は暗い（まとまり ' + rgbs.grp.join() + '・帯はまとまりより明るい ' + rgbs.band.join() + '）', rgbs);
			const low = v.text.map(([name, fg, bg]) => ({ name, ratio: contrastRatio(parseRgb(fg), parseRgb(bg)) })).filter((x) => x.ratio < 4.5);
			assert(low.length === 0, tag + '文字のコントラスト比はすべて 4.5 以上（帯・タグ・設定の枠・入口・削除）', low.map((x) => x.name + ' ' + x.ratio.toFixed(2)));
			const shown = v.iconColors.filter(Boolean);
			assert(shown.length >= 2 && new Set(shown).size === shown.length, tag + 'マーカーの内側の色は種類ごとに違う（出ている ' + shown.length + '種）', v.iconColors);
			const symLow = v.markerSym.filter(([fg, bg]) => fg && bg && contrastRatio(parseRgb(fg), parseRgb(bg)) < 3);
			assert(symLow.length === 0, tag + 'マーカーの記号（白）と内側の色のコントラスト比は 3 以上（図形の目安）', v.markerSym);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * (A2) schemaVersion 5 から 7 へ1回で移す（段8 のセット振り分け＋段9 のアイコン移行）・何度かけても同じ・インポートの「元に戻す」（ルール28）
	 *   経路は2つ: (1) エクスポートファイルとして読み込む（replaceUserData）／(2) localStorage に置いてページを開く
	 * ==================================================================== */
	await block('段9(A2) 5→7 の直接移行（取り込み・ページを開く）・移行済みを再度かけても同じ・インポートの「元に戻す」', async () => {
		const R = (id, name, uma) => ({ rosterId: id, name, umaId: uma, star: 3, awakeningLevel: 5, cardIds: ['card-0248', null, null, null, null, null], createdAt: 'x', updatedAt: 'x' });
		const Tp = (id, name, ids, extra) => Object.assign({ templateId: id, name, skillIds: ids, createdAt: 'x', updatedAt: 'x' }, extra || {});
		// 実際の5の形: tiers・ptRanks あり（roster を指す）／tiers なし／同じ roster を指す2件目／どこからも指されない roster
		const V5 = { schemaVersion: 5, records: [], customSkills: [],
			templates: [
				Tp('t1', 'A', ['1', '2', '3', '4'], { tiers: { '1': 1, '2': 3 }, ptRanks: { high: false, mid: true, low: true }, baseRosterId: 'r1' }),
				Tp('t2', 'B', ['5', '6']),
				Tp('t3', 'C', ['7'], { baseRosterId: 'r1' })],
			rosters: [R('r1', '旧名1', 'uma-0001'), R('r2', 'どこからも指されない編成', 'uma-0002')] };
		const check = (d, tag) => {
			const t = (id) => d.templates.find((x) => x.templateId === id);
			const rs = (id) => d.rosters.find((x) => x.rosterId === id);
			const orphan = d.templates.find((x) => x.baseRosterId === 'r2');
			assert(d.schemaVersion === 7, tag + 'schemaVersion が 7 になる（6 を経由しない）', d.schemaVersion);
			assert(t('t1').baseRosterId === 'r1' && rs('r1').name === 'A' && t('t3').baseRosterId !== 'r1' && rs(t('t3').baseRosterId) && rs(t('t3').baseRosterId).name === 'C' && rs(t('t3').baseRosterId).umaId === 'uma-0001'
				&& orphan && orphan.name === 'どこからも指されない編成' && orphan.skillIds.length === 0 && !('baseRosterId' in t('t2')),
				tag + '段8のセット振り分け: 指す編成は名前を揃える／2件目は写し／どこからも指されない編成は新しいセットに／編成の無いセットは触らない', d.templates.map((x) => x.name + ':' + x.baseRosterId));
			assert(JSON.stringify(t('t1').skillIcons) === JSON.stringify({ '1': 'a', '2': 'c', '3': 'b', '4': 'b' }) && !('ptRanks' in t('t1')) && JSON.stringify(t('t1').tiers) === JSON.stringify({ '1': 1, '2': 3 })
				&& !('skillIcons' in t('t2')) && !('skillIcons' in t('t3')), tag + '段9のアイコン移行: tiers を持つセットだけ写し（超優先→◎・通常→△・書かれていない→○）、ptRanks は捨て、tiers は残す。持たないセットは触らない', t('t1'));
		};
		// (1) 取り込み
		let sp = await openSet({ userData: { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] }, tab: 1, roster: null });
		const imp = await sp.page.evaluate((v) => { UmaSkillDeckCore.replaceUserData(JSON.parse(JSON.stringify(v))); return JSON.parse(localStorage.getItem('umaSkillDeck:userData')); }, V5);
		check(imp, '段9(A2) 取り込み: ');
		// 移行済みのデータをもう一度取り込んでも、結果が変わらない（何度かけても同じ）
		const again = await sp.page.evaluate((v) => { UmaSkillDeckCore.replaceUserData(JSON.parse(JSON.stringify(v))); return JSON.parse(localStorage.getItem('umaSkillDeck:userData')); }, imp);
		assert(JSON.stringify(again) === JSON.stringify(imp) && imp.templates.length === 4 && imp.rosters.length === 3, '段9(A2) 取り込み: 移行済みのデータを再度取り込んでも結果が変わらない（テンプレート4・編成3のまま）', { a: again.templates.length, b: imp.templates.length });
		await sp.ctx.close();
		// (2) localStorage に置いてページを開く
		sp = await openSet({ userData: V5, tab: 1, roster: null });
		const opened = await ud(sp.page);
		check(opened, '段9(A2) ページを開く: ');
		assert(JSON.stringify(opened) === JSON.stringify(imp) || JSON.stringify(opened.templates.map((x) => x.name)) === JSON.stringify(imp.templates.map((x) => x.name)), '段9(A2) 2つの経路で、セットの顔ぶれは同じ', opened.templates.map((x) => x.name));
		assert(jsErrors(sp.errors).length === 0, '段9(A2) ページを開く: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 移行済みの保存データでもう一度開いても、保存データは1バイトも変わらない
		sp = await openSet({ userData: imp, tab: 1, roster: null });
		const raw2 = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:userData'));
		assert(raw2 === JSON.stringify(imp), '段9(A2) 移行済みの保存データを開いても、1バイトも変わらない', raw2.length);
		await sp.ctx.close();
		// (c) Deck のインポート → 元に戻す: tiers を持つ5のデータを開いた状態から、別の5のデータを取り込み、戻す。メモリと保存先が取り込み前と一致（ルール28）
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, V5);
		await dk.page.click('#tab-btn-data');
		await dk.page.waitForTimeout(300);
		const state = () => dk.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const before = await state();
		const hasIcons = await dk.page.evaluate(() => !!UmaSkillDeckCore.getUserData().templates[0].skillIcons);
		const V5b = Object.assign({}, V5, { templates: [Tp('u1', 'U', ['9', '10'], { tiers: { '9': 3 }, ptRanks: { high: true } })], rosters: [] });
		const done = await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = JSON.stringify(v); const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; const d = UmaSkillDeckCore.getUserData(); return { n: d.templates.length, v: d.schemaVersion, icons: d.templates[0].skillIcons }; }, V5b);
		assert(hasIcons && done.n === 1 && done.v === 7 && JSON.stringify(done.icons) === JSON.stringify({ '9': 'c', '10': 'b' }), '段9(A2) Deck: tiers を持つ5のデータの読み込み・取り込みが移行される（前提。空振りでない）', { hasIcons, done });
		const un = await dk.page.evaluate(() => ({ ok: performUndo(), toast: document.getElementById('toast-message').textContent }));
		await dk.page.waitForTimeout(300);
		assert(un.ok && un.toast === 'インポート前のデータに戻しました' && (await state()) === before, '段9(A2) Deck: インポートの「元に戻す」で、復元したデータが移行で書き換わらない（メモリと保存先が取り込み前と一致）', un);
		assert(dk.errors.length === 0, '段9(A2) Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
		// 移行が要らない古いデータ（tiers も ptRanks も無い。スキルを持つセットあり）から取り込み → 元に戻す: 復元したデータにアイコンを足さない（本番で見つけた不具合の再発防止）
		const dk2 = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, USER_DATA);
		await dk2.page.click('#tab-btn-data');
		await dk2.page.waitForTimeout(300);
		const state2 = () => dk2.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const before2 = await state2();
		const old = await dk2.page.evaluate(() => UmaSkillDeckCore.getUserData().templates.filter((t) => t.skillIds.length > 0 && !t.tiers && !('skillIcons' in t)).length);
		await dk2.page.evaluate((v) => { document.getElementById('import-textarea').value = JSON.stringify(v); const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, V5b);
		const un2 = await dk2.page.evaluate(() => ({ ok: performUndo() }));
		await dk2.page.waitForTimeout(300);
		assert(old >= 1 && un2.ok && (await state2()) === before2 && !before2.includes('skillIcons'), '段9(A2) Deck: tiers の無い古いデータからの取り込み→「元に戻す」で、復元したデータにアイコンが足されない（取り込み前と一致。' + old + 'セットで確認）', { old, ok: un2.ok });
		await dk2.ctx.close();
	});

	/* ====================================================================
	 * 375px の高さ
	 * ==================================================================== */
	await block('段9 375px の高さ（帯 40px 以下・①の表の上端 361px 以下（351px ＋ 微調整2・D の見出しの余白 10px）・②の一覧の上端 400px 以下・行 31px）', async () => {
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
		assert(m.bar <= 40 && m.grid <= 415 && m.list <= 400 && m.row === 31,   // grid: 段4（C-150）で帯に44pxの進化ボタン。帯が2行になる編成では 400px（361 → 410）。C-187 で①のカードを44pxのタイル（375pxは2列×3行）にしたぶん 415px（実測 407px。C-188 で2列表示のタイルを低くした）
		 '段9 375px: 帯 ' + m.bar + 'px・①の表の上端 ' + m.grid + 'px・②の一覧の上端 ' + m.list + 'px・行 ' + m.row + 'px', m);
	});

	/* ====================================================================
	 * ②因子周回 段1（2026-10-27）: パネルの並び（因子画面の順）と、帯の2行
	 * ==================================================================== */
	await block('段9 ②因子周回 段1: ②のパネルは因子画面の順（一覧に無いものは末尾に ID の順・保存の順は足した順のまま）、帯の2行は1行目に収まる（375・360px／320px は塊ごと2行目）', async () => {
		const posOf = new Map();
		readJson('data/skill-display-order.json').entries.forEach((e) => { if (!posOf.has(e.id)) posOf.set(e.id, posOf.size); });
		// 足した順に見立てた並び（並びのファイルの順にも ID の順にもならないように、前後を入れ替える）。カスタムスキル2つを途中に挟む
		const known = freeAll.slice(0, 12).concat(pick).reverse();
		const input = known.slice(0, 5).concat(['custom_zz9'], known.slice(5), ['custom_aa1']);
		const custom = (id, name) => ({ customId: id, name, tags: { effect: ['speed_up'] }, createdAt: '2026-10-27T00:00:00.000Z' });
		const userData = Object.assign({}, USER_DATA, { customSkills: [custom('custom_zz9', '段1の自作スキルZ'), custom('custom_aa1', '段1の自作スキルA')] });
		const want = known.slice().sort((a, b) => posOf.get(a) - posOf.get(b)).concat(['custom_aa1', 'custom_zz9']);
		const sp = await openSet({ w: 1280, tab: 1, userData, scope: { skillIds: input, name: '', updatedAt: '', skillIcons: {} } });
		const got = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]')).map((p) => p.getAttribute('data-skill-id')));
		assert(known.every((id) => posOf.has(id)) && JSON.stringify(input) !== JSON.stringify(want), '段1 前提: 一覧にあるスキル ' + known.length + ' 種と、一覧に無いカスタムスキル2つ（足した順は既定の並びと違う）', { input, want });
		assert(JSON.stringify(got) === JSON.stringify(want), '段1: ②のパネルは因子画面の順（compareGameOrder）。一覧に無いカスタムスキルは末尾に ID の順', { got, want });
		const saved = (await draft(sp.page)) || {};
		assert(JSON.stringify(saved.skillIds) === JSON.stringify(input), '段1: 並べ替えは表示だけ。保存の順（足した順）は変わらない', saved.skillIds);
		assert(jsErrors(sp.errors).length === 0, '段1: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();

		// 帯（桁の多い例: 共通スキル 1万 Pt 台・100種前後）。Pt の高い白・金（前段の無いもの・パッシブでないもの）を112種
		const big = master.filter((s) => ['white', 'gold'].includes(rarityOf.get(s.id)) && !(prevOf.get(s.id) || []).length && !(s.tags.passive || []).length)
			.map((s) => s.id).filter((id) => ptReal.entries.some((e) => e.skillId === id && e.pt > 0))
			.sort((a, b) => ptReal.entries.find((e) => e.skillId === b).pt - ptReal.entries.find((e) => e.skillId === a).pt).slice(0, 112);
		for (const w of [375, 360, 320]) {
			const s2 = await openSet({ w, tab: 1, scope: { skillIds: big, name: '', updatedAt: '', skillIcons: {}, inheritedUnique: { count: 3 } } });
			const g = await s2.page.evaluate(() => {
				const r = (s) => { const e = document.querySelector('#deck-template-panel ' + s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height) }; };
				const head = document.querySelector('#deck-template-panel [data-usd-el="head"]');
				// C-235: 帯は「合計・?・部品2つ（継承固有・共通スキルのヒントLv）」。共通スキルの「Pt／種」は ? の小窓の中（下で開いて読む）
				return { band: r('[data-usd-el="set-head"]'), sum: r('[data-usd-el="factor-sum"]'), help: r('[data-usd-el="pt-need-help-btn"]'), cfg: r('[data-usd-el="band-cfg"]'), wrap: document.querySelector('#deck-template-panel [data-usd-el="set-head"]').hasAttribute('data-usd-wrap'),
					headShown: !!(head && head.getClientRects().length),
					tabsToBand: Math.round(document.querySelector('#deck-template-panel [data-usd-el="set-head"]').getBoundingClientRect().top - document.querySelector('.main-card .step-tabs').getBoundingClientRect().bottom),
					page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
			});
			await s2.page.click('#deck-template-panel [data-usd-act="pt-need-help"]');
			g.common = await s2.page.evaluate(() => (document.querySelector('[data-usd-el="info-body"] [data-usd-el="pt-need-common"]') || {}).textContent);
			await s2.page.keyboard.press('Escape');
			const t = '段1 ' + w + 'px（' + g.common + '）: ';
			assert(/共通スキル \d{2},\d{3} Pt／\d{2,3}種/.test(g.common || ''), t + '桁の多い例（共通スキル 1万 Pt 台）', g.common);
			assert(g.page <= 0 && !g.headShown && g.tabsToBand === 4, t + '横にはみ出さない・②の空の見出しの行は隠れ、タブの下から帯まで 4px（タブの下の余白だけ）', g);
			// C-235: スマホの幅では部品2つが2行目に折り返す（帯 66px）。横にははみ出さない
			assert(g.wrap && g.cfg && g.cfg.top >= g.sum.bottom - 1 && g.cfg.right <= g.band.right && g.band.h === 66, t + '入らない幅では部品2つ（継承固有・共通スキルのヒントLv）が2行目に折り返す（帯 ' + g.band.h + 'px）', g);
			assert(jsErrors(s2.errors).length === 0, t + 'コンソールのエラー0', jsErrors(s2.errors).slice(0, 3));
			await s2.ctx.close();
		}
	});
}
