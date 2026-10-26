// 夜間のまとめ・作業3（2026-10-27）: 小さな見た目の直しの検査。
// run-smoke.mjs の末尾から register54() で呼ばれる（塊の見出しはすべて「夜間3」で始まる。`npm run test:visual -- --only=夜間3` で回せる）。
//
// UmaExam: (1) 文言（一言「技能試験用ツール」・①のタブの「（登録済み）」・冒頭の説明文・「既定」の補足・「効率を指定」の下の「βテスト」を削除。ほかの文言は残る）
//          (2) 配置（①②のタブの幅の差 1px 以内・「効率を指定（N種）?」は 360px 以上で1行〔640〜749px は収まらず2行のまま。報告済み〕・
//              数の小札は折り返すときだけ2列の表〔2つ目の左端のずれ 1px 以内〕・チェック欄の小札の先頭のずれ 1px 以内）
// UmaStar: (3) ①の表の「ウマ娘」の列は、見出し・セルとも、ほかの列と同じ色
// 見た目は 360・390・1280 × ライト・ダーク で、横スクロールなし・コンソールのエラー0・文字のコントラスト 4.5:1 以上。

import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';

export async function register54(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const VIEWS = [[360, 'light'], [360, 'dark'], [390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']];
	// 「効率を指定（N種）?」は 360px 以上で1行。ただし 641〜694px は2行を許す（641px 以上の箱の余白は変えない決まり〔C-140・微調整2A2〕を優先。2026-10-27 おいもさんの決定）
	const EFF_TWO_LINES_OK = (w) => w >= 641 && w <= 694;

	const openExam = async (w, theme) => {
		const r = await openPage(browser, base, 'exam.html', { width: w, height: w === 1280 ? 900 : 844 });
		await r.page.evaluate((t) => localStorage.setItem('uma-tools-theme', t), theme);
		await r.page.reload({ waitUntil: 'networkidle' });
		await r.page.waitForTimeout(600);
		for (let i = 0; i < 3; i++) if (await r.page.isVisible('#ui-notice')) { await r.page.click('#ui-notice-ok'); await r.page.waitForTimeout(250); }
		// 効率を指定の種数を出すため、データを読ませてから既定に戻す
		await r.page.evaluate(() => document.getElementById('scope-mode-efficiency').click());
		await r.page.waitForFunction(() => /^\d+$/.test(document.getElementById('scope-count-efficiency').textContent), null, { timeout: 10000 });
		await r.page.evaluate(() => document.getElementById('scope-mode-default').click());
		await r.page.waitForTimeout(300);
		return r;
	};
	// 測るもの（exam ①）
	const measureExam = (page) => page.evaluate(() => {
		const rect = (el) => el.getBoundingClientRect();
		// 題の行数: 文字の箱の上端の種類（「？」のボタンは上下の余白が負で行の高さに入らないので数えない）
		const lines = (el) => { const tops = new Set(); const walk = (n) => { if (n.nodeType === 3 && n.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(n); [...r.getClientRects()].forEach((x) => tops.add(Math.round(x.top))); } else if (n.nodeType === 1 && n.tagName !== 'BUTTON') n.childNodes.forEach(walk); }; walk(el); return tops.size; };
		const box = document.getElementById('count-chips');
		const chips = [...box.children].filter((c) => !c.classList.contains('hidden')).map((c) => ({ text: c.innerText.trim(), l: rect(c).left, t: Math.round(rect(c).top) }));
		const rows = []; chips.forEach((c) => { let r = rows.find((x) => x.t === c.t); if (!r) rows.push(r = { t: c.t, items: [] }); r.items.push(c); });
		const effTitle = document.querySelector('label[for="scope-mode-efficiency"] span.block');
		const l1 = document.getElementById('step1-title');
		return {
			tab1: rect(document.getElementById('step-tab-1')).width, tab2: rect(document.getElementById('step-tab-2')).width,
			label1Cut: l1.scrollWidth > l1.clientWidth, badge1: document.getElementById('step1-skill-badge').textContent,
			grid: box.classList.contains('is-grid'), chipRows: rows.length, col2: rows.filter((r) => r.items.length > 1).map((r) => r.items[1].l), chipTexts: chips.map((c) => c.text),
			effText: effTitle.innerText.replace(/\s+/g, ''), effLines: lines(effTitle),
			sfL: rect(document.getElementById('scenario-factors-badge')).left, geneL: rect(document.getElementById('genes-badge')).left,
			sw: document.documentElement.scrollWidth, vw: window.innerWidth,
		};
	});

	await block('夜間3(1) UmaExam の文言: 一言は「技能試験用ツール」・①のタブは「対象スキル」（「（登録済み）」なし）・冒頭の説明文なし・「既定（133種）」の補足なし・「効率を指定」の下の「βテスト」なし／ほかの選択肢の補足と「?」の説明の見出しは残る（390・1280）', async () => {
		for (const w of [390, 1280]) {
			const { ctx, page, errors } = await openExam(w, 'light');
			const r = await page.evaluate(() => ({
				tag: document.querySelector('header .header-tagline').textContent.trim(),
				tab1: document.getElementById('step1-title').textContent, tab1Html: document.getElementById('step1-title').innerHTML,
				p: !!document.querySelector('#step-panel-1 > p'),
				panelText: document.getElementById('step-panel-1').textContent,
				defLabel: document.querySelector('label[for="scope-mode-default"]').textContent.replace(/\s+/g, ''),
				effLabel: document.querySelector('label[for="scope-mode-efficiency"]').textContent.replace(/\s+/g, ''),
				subs: [...document.querySelectorAll('#step-panel-1 .scope-sub')].map((s) => s.textContent.trim()),
				help: (document.getElementById('eff-help-title') || document.querySelector('[id^="eff-help"] h2, [id^="eff-help"] h3') || {}).textContent || null,
			}));
			const tag = '夜間3(1) ' + w + 'px: ';
			assert(r.tag === '技能試験用ツール', tag + 'ヘッダーの一言は「技能試験用ツール」', r.tag);
			assert(r.tab1 === '対象スキル' && !r.tab1Html.includes('登録済み'), tag + '①のタブの見出しは「対象スキル」（「（登録済み）」は無い）', r.tab1Html);
			assert(!r.p && !r.panelText.includes('既定として登録済みの133種を対象にします') && !r.panelText.includes('「対象スキルの範囲」で調整可能です'), tag + '①の冒頭の説明文は無い', r.p);
			assert(/^既定（133種）$/.test(r.defLabel) && !r.panelText.includes('これまでどおりの対象です'), tag + '「既定（133種）」の補足「これまでどおりの対象です」は無い', r.defLabel);
			assert(/^効率を指定（\d+種）\?$/.test(r.effLabel) && !r.effLabel.includes('βテスト'), tag + '「効率を指定」の下の「βテスト」は無い（選択肢は「効率を指定（N種）?」だけ）', r.effLabel);
			assert(JSON.stringify(r.subs) === JSON.stringify(['既定に5種を足します', '既定から12種を外します']), tag + 'ほかの選択肢の補足（足す5種・外す12種）は残る', r.subs);
			assert(jsErrors(errors).length === 0, tag + 'コンソールのエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});

	await block('夜間3(2) UmaExam ①の配置: ①②のタブの幅の差 1px 以内（「調整あり」でも名前が欠けない）・「効率を指定（N種）?」は1行・数の小札は1行なら今のまま／折り返すときだけ2列の表（2つ目の左端のずれ 1px 以内）・チェック欄の小札の先頭のずれ 1px 以内・横スクロールなし・エラー0・コントラスト 4.5:1 以上（360・390・1280 × ライト・ダーク）', async () => {
		for (const [w, theme] of VIEWS) {
			const tag = '夜間3(2) ' + w + '・' + theme + ': ';
			const { ctx, page, errors } = await openExam(w, theme);
			const a = await measureExam(page);
			assert(Math.abs(a.tab1 - a.tab2) <= 1 && !a.label1Cut, tag + '既定: ①②のタブの幅の差 1px 以内・①の名前は欠けない', [a.tab1, a.tab2, a.label1Cut]);
			assert(a.effLines === (EFF_TWO_LINES_OK(w) ? a.effLines : 1) && a.effLines <= 2, tag + '「' + a.effText + '」は1行（641〜694px だけ2行まで許す）', a.effLines);
			assert(a.chipRows === 1 && !a.grid, tag + '既定（小札2つ）: 1行に並び、表の形にしない', a);
			assert(Math.abs(a.sfL - a.geneL) <= 1, tag + 'チェック欄の小札（シナリオ因子・遺伝子）の先頭のずれ 1px 以内', [a.sfL, a.geneL]);
			// 因子・遺伝子を入れる（小札4つ）→「対象を絞る」（小札5つ・タブのバッジは「調整あり」）
			await page.evaluate(() => { for (const id of ['scenario-factors-all', 'genes-all']) { const c = document.getElementById(id); if (!c.checked) c.click(); } });
			await page.waitForTimeout(300);
			const b = await measureExam(page);
			const fits4 = w >= 1024;
			assert(b.chipTexts.length === 4 && (fits4 ? (b.chipRows === 1 && !b.grid) : (b.grid && b.chipRows === 2 && b.col2.length === 2 && Math.abs(b.col2[0] - b.col2[1]) <= 1)),
				tag + '小札4つ（sp70緑・緑59種・シナリオ因子・遺伝子）: ' + (fits4 ? '1行なら今のまま' : '2行に折り返すので2列の表・2つ目の左端のずれ 1px 以内'), b);
			await page.evaluate(() => document.getElementById('scope-mode-curated').click());
			await page.waitForTimeout(300);
			const c = await measureExam(page);
			assert(Math.abs(c.tab1 - c.tab2) <= 1 && !c.label1Cut && /調整あり/.test(c.badge1), tag + '「調整あり」: ①②のタブの幅の差 1px 以内・①の名前は欠けない', [c.tab1, c.tab2, c.badge1, c.label1Cut]);
			assert(c.chipTexts.length === 5 && (c.chipRows === 1 ? !c.grid : (c.grid && c.col2.every((x) => Math.abs(x - c.col2[0]) <= 1))), tag + '小札5つ: 1行なら今のまま／折り返すときは2列の表で2つ目の左端がそろう', c);
			assert(a.sw <= a.vw && b.sw <= b.vw && c.sw <= c.vw, tag + '横スクロールなし', [a.sw, b.sw, c.sw, a.vw]);
			const ct = await page.evaluate(scanTextContrastInPage, '#step-panel-1');
			assert(ct.checked > 0 && ct.bad.length === 0, tag + '①の文字のコントラスト 4.5:1 以上（' + ct.checked + '要素）', formatContrast(ct.bad).slice(0, 5));
			assert(jsErrors(errors).length === 0, tag + 'コンソールのエラーなし', errors.slice(0, 3));
			await ctx.close();
		}
	});

	await block('夜間3(2b) UmaExam「効率を指定（N種）?」の境目: 640・695・767・1023px は1行／641・694px は2行まで（641〜694px だけ2行を許す。C-140・微調整2A2 を優先）', async () => {
		for (const w of [640, 641, 694, 695, 767, 1023]) {
			const { ctx, page, errors } = await openExam(w, 'light');
			const a = await measureExam(page);
			assert(EFF_TWO_LINES_OK(w) ? a.effLines <= 2 : a.effLines === 1, '夜間3(2b) ' + w + 'px: 「' + a.effText + '」は' + (EFF_TWO_LINES_OK(w) ? '2行まで' : '1行'), a.effLines);
			assert(a.sw <= a.vw && jsErrors(errors).length === 0, '夜間3(2b) ' + w + 'px: 横スクロールなし・エラーなし', [a.sw, a.vw, errors.slice(0, 2)]);
			await ctx.close();
		}
	});

	// UmaStar ①の表（blocks-53 と同じ編成）
	const SIX = ['card-0564', 'card-0565', 'card-0402', 'card-0248', 'card-0535', 'card-0478'];
	const ROSTER = { umaId: 'uma-0179', cardIds: SIX, skillFilter: {} };
	await block('夜間3(3) UmaStar ①の表の「ウマ娘」の列: 見出しはサポカの列の見出しと同じ面・文字色、セルは同じ行のサポカの列（縞でない列）と同じ地・横スクロールなし・エラー0・コントラスト 4.5:1 以上（360・390・1280 × ライト・ダーク）', async () => {
		for (const [w, theme] of VIEWS) {
			const tag = '夜間3(3) ' + w + '・' + theme + ': ';
			const sp = await openPage(browser, base, 'special.html', { width: w, height: w === 1280 ? 900 : 844 }, EMPTY);
			await sp.page.evaluate(({ roster, theme }) => {
				localStorage.setItem('uma-tools-theme', theme);
				localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
				localStorage.removeItem('umaSkillDeck:draftScope:special');
				localStorage.setItem('umaSkillDeck:stepTab', '0');
			}, { roster: ROSTER, theme });
			await sp.page.reload({ waitUntil: 'networkidle' });
			for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
			await sp.page.waitForSelector('#deck-roster-panel .usd-roster-grid', { timeout: 15000 });
			await sp.page.waitForTimeout(500);
			const r = await sp.page.evaluate(() => {
				const P = document.getElementById('deck-roster-panel');
				const heads = [...P.querySelectorAll('.usd-roster-gh')];
				const umaH = heads.find((h) => h.classList.contains('usd-roster-gc--uma'));
				const cardH = heads.find((h) => h.querySelector('[data-usd-el="col-menu-btn"][data-type-order]') && !h.classList.contains('usd-roster-gc--alt'));
				const cs = (el) => getComputedStyle(el);
				const rows = [...P.querySelectorAll('.usd-roster-grow')].filter((row) => !row.querySelector('.usd-roster-gh'));
				// 同じ行の、育成ウマ娘のセルとその右隣（1枚目のサポカ・縞でない列）のセル
				const pairs = rows.map((row) => { const cells = [...row.children].filter((c) => c.classList.contains('usd-roster-gc')); const i = cells.findIndex((c) => c.classList.contains('usd-roster-gc--uma')); return i < 0 ? null : { uma: cs(cells[i]).backgroundColor, next: cs(cells[i + 1]).backgroundColor, nextAlt: cells[i + 1].classList.contains('usd-roster-gc--alt'), cls: row.className }; }).filter(Boolean);
				return { umaBg: cs(umaH).backgroundColor, cardBg: cs(cardH).backgroundColor, umaColor: cs(umaH).color, cardColor: cs(cardH).color, umaShadow: cs(umaH).boxShadow, cardShadow: cs(cardH).boxShadow,
					pairs: pairs.length, bad: pairs.filter((p) => p.nextAlt || p.uma !== p.next).slice(0, 3), sw: document.documentElement.scrollWidth, vw: window.innerWidth };
			});
			assert(r.umaBg === r.cardBg && r.umaColor === r.cardColor && r.umaShadow === r.cardShadow, tag + '見出しはサポカの列の見出しと同じ面・文字色・縁', r);
			assert(r.pairs > 5 && r.bad.length === 0, tag + 'セルは、どの行も同じ行のサポカの列（縞でない列）と同じ地（' + r.pairs + '行）', r.bad);
			assert(r.sw <= r.vw, tag + '横スクロールなし', [r.sw, r.vw]);
			const ct = await sp.page.evaluate(scanTextContrastInPage, '#deck-roster-panel .usd-roster-grid');
			assert(ct.checked > 0 && ct.bad.length === 0, tag + '表の文字のコントラスト 4.5:1 以上（' + ct.checked + '要素）', formatContrast(ct.bad).slice(0, 5));
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラーなし', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});
}
