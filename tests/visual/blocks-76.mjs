import { reloadReady } from './lib/page-ready.mjs';
import { pickEntry } from './lib/entry-search.mjs';
// 「緑スキルを追加」の小窓の直し（T26・2026-10-30 おいもさんの決定）の検査。
// run-smoke.mjs の末尾から register76() で呼ばれる（塊の見出しはすべて「T26緑スキル」で始まる。`npm run test:visual -- --only=T26緑スキル` で回せる）。
//
// 決め:
//  - 一覧の上の2行（「チェックするとその場で追加済みスキルに入り、外すと抜けます（このうちN種が追加済み）」「選べない：本育成編成 N件・レース条件 N件」）を消す。
//  - チェックボックスはほかの小窓と同じベースカラー（accent-color: --uma-control-mark）。
//  - 選べない行は名前に取り消し線＋行を薄く。右の表記は短く「レース条件不一致」「本育成で取得」。
//  - この見た目は「緑スキルを追加」の一覧だけ（オススメサポ・脚質オススメの一覧、「条件で検索」は変えない。後者は T27・T28 で当てる予定）。
//  - Deck 単体ページの同じ小窓にもかかる。
// オススメサポ・脚質オススメの「変わっていない」は、変更前の commit（246a76d）で実測した値を固定値として持つ（実装の側の値を読まない）。
// スキル名・レース名は検査の側に書かない（恒久ルール1。データか画面から読む）。

export async function register76(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const RACE = readJson('data/upcoming-races.json').races[0];
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const ROSTER = { umaId: 'uma-0001', cardIds: CARDS6, race: RACE };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const DECK = { schemaVersion: 7, records: [{ recordId: 'rec1', name: 'シート', sourceTemplateId: null, skillIds: [], candidates: [], cells: {}, createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z' }], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	const SHORT = { race: 'レース条件不一致', sure: '本育成で取得' };

	const openSp = async (o) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		await sp.page.evaluate(({ roster, theme, scope }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			if (scope) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: scope })); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: o.roster || ROSTER, theme: o.theme, scope: o.scope || null });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(300);
		return sp;
	};

	/** 緑スキルの一覧を読む（ページの中で。色は計算済みの値・コントラスト比は行の地に対して） */
	const readPassive = (page) => page.evaluate(() => {
		const parse = (c) => {
			let m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(c);
			if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] === undefined ? 1 : +m[4]];
			m = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(c);
			if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
			return null;
		};
		const lum = (c) => { const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
		const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
		// 地: 行の地が透明なら一覧の箱・小窓の面へさかのぼる
		const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.99) return c; } return [1, 1, 1, 1]; };
		const probe = document.createElement('span');
		document.body.appendChild(probe);
		const tok = (v) => { probe.style.color = 'var(' + v + ')'; return getComputedStyle(probe).color; };
		const tokens = { mark: tok('--uma-control-mark'), sunken: (() => { probe.style.backgroundColor = 'var(--uma-surface-sunken)'; return getComputedStyle(probe).backgroundColor; })() };
		probe.remove();
		const el = (n) => document.querySelector('[data-usd-el="' + n + '"]');
		const box = el('passive-results');
		const rows = [...box.querySelectorAll('label.usd-row')];
		const one = (r) => {
			const name = r.querySelector('[data-usd-info]');
			const input = r.querySelector('input');
			const reason = r.querySelector('[data-usd-el="excluded-reason"]');
			const cs = getComputedStyle(r), ncs = getComputedStyle(name), ics = getComputedStyle(input);
			const bg = bgOf(r);
			return {
				id: input.value, rowBg: cs.backgroundColor, rowColor: cs.color, nameColor: ncs.color, deco: ncs.textDecorationLine,
				accent: ics.accentColor, opacity: ics.opacity, disabled: input.disabled,
				reason: reason ? reason.textContent : null,
				nameContrast: ratio(parse(ncs.color), bg), reasonContrast: reason ? ratio(parse(getComputedStyle(reason).color), bg) : null,
			};
		};
		const ex = rows.filter((r) => r.classList.contains('usd-row--excluded')).map(one);
		const ok = rows.filter((r) => !r.classList.contains('usd-row--excluded')).map(one);
		return {
			kids: [...el('mode-passive').children].map((c) => c.getAttribute('data-usd-el')),
			note: !!el('passive-note'), count: !!el('passive-count'), excludedLabel: !!el('passive-excluded'),
			modeText: [...el('mode-passive').children].filter((c) => c !== box).map((c) => c.textContent).join(''),
			tokens, ex, ok,
			hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		};
	});

	/** 見た目の決まり（special・Deck 共通）。tag は見出しの頭、want は出るべき理由の一覧 */
	const checkLook = (tag, p, want) => {
		assert(!p.note && !p.count && !p.excludedLabel && p.kids.join() === 'passive-results' && p.modeText === '',
			tag + '一覧の上の2行（「チェックすると…」「選べない：…」）は無く、小窓の中は一覧だけ', { kids: p.kids, text: p.modeText });
		const reasons = [...new Set(p.ex.map((x) => x.reason))].sort();
		assert(p.ex.length > 0 && p.ok.length > 0 && reasons.join() === want.slice().sort().join(),
			tag + '右の表記は短い形（' + want.join('・') + '）だけ（選べない ' + p.ex.length + '行・選べる ' + p.ok.length + '行）', reasons);
		const boxes = p.ex.concat(p.ok);
		assert(boxes.every((x) => x.accent === p.tokens.mark) && p.tokens.mark !== 'auto',
			tag + 'チェックボックスの色は --uma-control-mark（' + p.tokens.mark + '）', [...new Set(boxes.map((x) => x.accent))]);
		assert(p.ex.every((x) => /line-through/.test(x.deco) && /underline/.test(x.deco)) && p.ok.every((x) => !/line-through/.test(x.deco)),
			tag + '選べない行の名前に取り消し線（説明の小窓の下線は残る）・選べる行には無い', { ex: [...new Set(p.ex.map((x) => x.deco))], ok: [...new Set(p.ok.map((x) => x.deco))] });
		const okPlain = p.ok.filter((x) => x.rowBg !== p.tokens.sunken);   // ポインタが載った行（:hover で地が沈む）を除く
		assert(p.ex.every((x) => x.rowBg === p.tokens.sunken && x.disabled && x.opacity === '0.45') && okPlain.length > 0 && okPlain.every((x) => x.rowBg !== p.tokens.sunken && x.opacity === '1'),
			tag + '選べない行は地が --uma-surface-sunken（' + p.tokens.sunken + '）・チェックボックスは 45%・押せない／選べる行は地を沈めない・100%', { ex: [...new Set(p.ex.map((x) => x.rowBg + ' ' + x.opacity))], ok: [...new Set(okPlain.map((x) => x.rowBg + ' ' + x.opacity))] });
		// 薄さの実測: 名前の文字の地に対するコントラスト比。選べない行は選べる行より低い（差が分かる）
		const exMax = Math.max(...p.ex.map((x) => x.nameContrast));
		const okMin = Math.min(...p.ok.map((x) => x.nameContrast));
		// 基準は差の大きさ（選べる行の最小が、選べない行の最大の 1.5 倍以上）。実測（2026-10-31）は 2.1〜3.1 倍
		assert(okMin >= exMax * 1.5,
			tag + '選べない行の名前は選べる行より薄い（コントラスト比 選べない 最大 ' + exMax.toFixed(2) + '・選べる 最小 ' + okMin.toFixed(2) + '。1.5倍以上の差）', { exMax, okMin });
		assert(p.hscroll <= 0, tag + '横スクロールなし', p.hscroll);
		return { exMax, okMin };
	};

	const measured = [];

	await block('T26緑スキル(1) special の②: 上の2行が無い／右の表記は「レース条件不一致」「本育成で取得」／チェックボックスは --uma-control-mark／選べない行は名前に取り消し線＋行を薄く（ライト・ダークで選べる行との違いを実測）', async () => {
		for (const theme of ['light', 'dark']) {
			for (const [w, h] of [[375, 812], [1280, 800]]) {
				const tag = 'T26緑スキル(1) ' + theme + ' ' + w + ': ';
				const sp = await openSp({ w, h, theme });
				await pickEntry(sp.page, 'editor-pick-passive');
				await sp.page.waitForSelector('[data-usd-el="passive-results"] label.usd-row');
				await sp.page.waitForTimeout(200);
				const p = await readPassive(sp.page);
				const m = checkLook(tag, p, [SHORT.race, SHORT.sure]);
				measured.push({ page: 'special', theme, w, ...m });
				// 長い文言は、緑スキルの一覧のどこにも出ない
				const longLeft = await sp.page.evaluate(() => /ため選べな/.test(document.querySelector('[data-usd-el="passive-results"]').textContent));
				assert(!longLeft, tag + '長い文言（「…ため選べない／選べません」）は一覧に残っていない', longLeft);
				assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			}
		}
	});

	// T27（2026-10-31・おいもさんの決定）で「条件で検索」の一覧にも同じ表し方を当てた（取り消し線＋薄く・短い表記）。この塊の「条件で検索」の部分はその形を見る
	await block('T26緑スキル(2) 範囲: 「条件で検索」の選べない行は T27 で緑スキルと同じ表し方（取り消し線＋薄く・短い表記）・オススメサポ・脚質オススメの選べない行は変更前の実測値のまま（ライト・ダーク）', async () => {
		// 変更前（246a76d）の 375×812 の実測値。オススメサポは②に追加済みの行（.usd-row--excluded）、脚質オススメは灰色の行（.usd-sty-row--gray）
		const BEFORE = {
			light: { out: { row: 'rgb(113, 98, 80)', bg: 'rgba(0, 0, 0, 0)', deco: 'underline', reason: 'rgb(106, 91, 69)', accent: 'auto', opacity: '1' },
				sty: { row: 'rgb(42, 34, 22)', bg: 'rgba(0, 0, 0, 0)', name: 'rgb(113, 98, 80)', deco: 'underline', accent: 'auto', opacity: '1' } },
			dark: { out: { row: 'rgb(169, 165, 154)', bg: 'rgba(0, 0, 0, 0)', deco: 'underline', reason: 'rgb(189, 185, 176)', accent: 'auto', opacity: '1' },
				sty: { row: 'rgb(243, 241, 236)', bg: 'rgba(0, 0, 0, 0)', name: 'rgb(169, 165, 154)', deco: 'underline', accent: 'auto', opacity: '1' } },
		};
		for (const theme of ['light', 'dark']) {
			const tag = 'T26緑スキル(2) ' + theme + ': ';
			const want = BEFORE[theme];
			// 条件で検索
			const sp = await openSp({ theme });
			await pickEntry(sp.page, 'editor-pick');
			await sp.page.waitForSelector('[data-usd-el="results"] label.usd-row--excluded');
			const f = await sp.page.evaluate(() => {
				const rows = [...document.querySelectorAll('[data-usd-el="results"] label.usd-row--excluded')];
				return { n: rows.length, decos: [...new Set(rows.map((r) => getComputedStyle(r.querySelector('[data-usd-info]')).textDecorationLine))],
					bgs: [...new Set(rows.map((r) => getComputedStyle(r).backgroundColor))], opac: [...new Set(rows.map((r) => getComputedStyle(r.querySelector('input')).opacity))],
					reasons: [...new Set(rows.map((r) => r.querySelector('[data-usd-el="excluded-reason"]').textContent))] };
			});
			const sunk = await sp.page.evaluate(() => { const d = document.createElement('div'); d.style.background = 'var(--uma-surface-sunken)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
			assert(f.n > 0 && f.decos.join() === 'underline line-through' && f.bgs.join() === sunk && f.opac.join() === '0.45'
				&& f.reasons.includes(SHORT.race) && f.reasons.every((x) => x === SHORT.race || x === SHORT.sure),
				tag + '「条件で検索」の選べない行は緑スキルと同じ（取り消し線・地 --uma-surface-sunken・チェックボックス 45%・短い表記。T27）', { f, sunk });
			await sp.page.click('[data-usd-act="picker-close"]');
			await sp.page.waitForTimeout(200);
			// 脚質オススメの灰色の行
			await sp.page.click(T + '[data-usd-el="style-open"]');
			await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="style-modal"]'); return !!m && !m.hidden && m.querySelectorAll('.usd-sty-row--gray').length > 0; }, null, { timeout: 15000 });
			const s = await sp.page.evaluate(() => {
				const r = document.querySelector('[data-usd-el="style-modal"] .usd-sty-row--gray');
				const cs = getComputedStyle(r), n = getComputedStyle(r.querySelector('[data-usd-info]')), i = getComputedStyle(r.querySelector('input'));
				return { row: cs.color, bg: cs.backgroundColor, name: n.color, deco: n.textDecorationLine, accent: i.accentColor, opacity: i.opacity };
			});
			assert(JSON.stringify(s) === JSON.stringify(want.sty), tag + '脚質オススメの灰色の行は変更前と同じ', { got: s, want: want.sty });
			await sp.ctx.close();
			// オススメサポ: ②に追加済みの行。1回開いて先頭の行の id を読み、それを②に入れて開き直す
			const s1 = await openSp({ theme });
			await s1.page.click(T + '[data-usd-el="outside-open"]');
			await s1.page.waitForSelector('[data-usd-el="outside-row"]', { timeout: 20000 });
			const id = await s1.page.evaluate(() => document.querySelector('[data-usd-el="outside-row"]').getAttribute('data-skill-id'));
			await s1.ctx.close();
			const s2 = await openSp({ theme, scope: [id] });
			await s2.page.click(T + '[data-usd-el="outside-open"]');
			await s2.page.waitForSelector('[data-usd-el="outside-modal"] .usd-row--excluded', { timeout: 20000 });
			const o = await s2.page.evaluate(() => {
				const r = document.querySelector('[data-usd-el="outside-modal"] .usd-row--excluded');
				const cs = getComputedStyle(r), n = getComputedStyle(r.querySelector('[data-usd-info]')), i = getComputedStyle(r.querySelector('input'));
				return { row: cs.color, bg: cs.backgroundColor, deco: n.textDecorationLine, reason: getComputedStyle(r.querySelector('.usd-row-reason')).color, accent: i.accentColor, opacity: i.opacity };
			});
			assert(JSON.stringify(o) === JSON.stringify(want.out), tag + 'オススメサポの選べない行（追加済み）は変更前と同じ', { got: o, want: want.out });
			assert(jsErrors(s2.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(s2.errors).slice(0, 3));
			await s2.ctx.close();
		}
	});

	await block('T26緑スキル(3) Deck 単体ページの「緑スキルを追加」も同じ（上の2行が無い・「本育成で取得」・チェックボックスの色・取り消し線＋薄く。ライト・ダーク）', async () => {
		for (const theme of ['light', 'dark']) {
			const tag = 'T26緑スキル(3) ' + theme + ': ';
			const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 375, height: 812 }, DECK);
			await dk.page.evaluate((t) => localStorage.setItem('uma-tools-theme', t), theme);
			await reloadReady(dk.page);
			// Deck 単体ページには本育成編成が無いので、選べない行は検査の口（setPickerHiddenIds）で2件作る
			await dk.page.evaluate(() => { const ids = UmaSkillDeckCore.getPoolExcludedSkills().map((s) => s.id); UmaSkillDeckCore.setPickerHiddenIds([ids[2], ids[3]]); switchTab('record'); openRecordEditor('rec1'); });
			await dk.page.waitForTimeout(300);
			await dk.page.click('button[onclick="openRecordPassivePicker()"]');
			await dk.page.waitForSelector('[data-usd-el="passive-results"] label.usd-row');
			await dk.page.waitForTimeout(200);
			const p = await readPassive(dk.page);
			const m = checkLook(tag, p, [SHORT.sure]);
			measured.push({ page: 'deck', theme, w: 375, ...m });
			assert(p.ex.length === 2, tag + '選べない行は仕込んだ2件', p.ex.length);
			assert(jsErrors(dk.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(dk.errors).slice(0, 3));
			await dk.ctx.close();
		}
		console.log('    T26緑スキル 名前のコントラスト比（選べない 最大／選べる 最小）: ' + measured.map((x) => x.page + ' ' + x.theme + ' ' + x.w + ' ' + x.exMax.toFixed(2) + '／' + x.okMin.toFixed(2)).join('・'));
	});
}
