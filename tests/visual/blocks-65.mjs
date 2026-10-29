// タイトルの行・セットの帯・編成セットの小窓／②因子周回の合計の行と入口の行／UmaExam のタイトル（C-235・2026-10-30）の検査。
// run-smoke.mjs の末尾から register65() で呼ばれる（塊の見出しはすべて「タイトルと帯」で始まる。`npm run test:visual -- --only=タイトルと帯` で回せる）。
//
// 決め（おいもさん。モックの報告 set-bar-mock-report-20261029.md・factor-head-mock-report-20261029.md の寸法を初期値にする）:
//  ・UmaStar のタイトルの行: 「β版」「2nd Edition」「チャンミ/LoH用ツール」を消す。ライト／ダークはツール切り替えと同じ 34×38px（アイコン 16px）。
//    レース条件の部品はタイトルとボタンの間・ボタン寄せ。入りきらなければ 11→10px、それでも入らなければ「…」。スクロールで上に残す（帯はその下）。
//    PC: 上の余白 12・内側 上下8／左右20・角丸 16・カードとの間 8・文字 26（タイトル 56px）。スマホ: 上下の余白 4（47px）。
//  ・帯: 「✎｜3／10 ▾」とレース条件を無くし、セット名（下線）を押すと一覧の小窓。新規は「無題（新規）」。小窓の見出しは「編成セット 3/10」。
//    無題: 「名前を付けてセットを保存」（入力欄・キャンセル・保存）と小さく「空にする」。保存済み: 「セット名を変更」と「削除」。
//    空・同じ名前・10/10 は保存を押せない。Enter＝保存、Esc・キャンセル＝入力の部分だけ閉じる。
//  ・②の合計の行: ［N Pt／N種］［?］［継承固有｜種数▾｜Lv▾］［共通スキルのヒントLv｜Lv▾］。部品 28px・セレクト 26px。入らなければ文字を小さく、それでも入らない幅だけ2行目。
//    ? の小窓は「継承固有 …」「共通スキル …」の2行だけ。赤い点は無い。↺ は入口の行へ。
//  ・②の入口の行: ［オススメサポ］［脚質オススメ］…［削除（ゴミ箱）］［↺］［虫眼鏡］［◎］［表］。虫眼鏡の小窓に4つの入口。320px だけ横送りが残る。
//  ・UmaExam: ライト／ダーク 34×38。PC のタイトルは UmaStar と同じ値。スマホ 47px。「2nd Edition」「技能試験用ツール」は残す。スクロールで残さない。
// 寸法はモックの実測（変更前の commit に当てたモック）を固定値にした。スキル名は検査の側に書かない（恒久ルール1）。

import { pickEntry, ENTRY_SEARCH_BTN, entryItem } from './lib/entry-search.mjs';

export async function register65(env) {
	const { block, assert, browser, base, openPage } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const NAMES = ['中距離・差し 想定', 'ダート短距離 想定', '長距離・先行', 'マイル 逃げ', '春天 用', '有馬 用', 'チャンミ 10月', 'LoH 中距離', '予備1', '予備2'];
	const IDS = Array.from({ length: 40 }, (_, i) => String(i + 1));
	const userDataWith = (n) => ({ schemaVersion: 7, records: [], customSkills: [], rosters: [],
		templates: NAMES.slice(0, n).map((name, i) => ({ templateId: 'tpl_t' + i, name, skillIds: i === 0 ? IDS : IDS.slice(i, i + 4), createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' })) });
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const R1 = { umaId: 'uma-0001', cardIds: CARDS6 };

	/** special を開く（o.sets＝保存済みのセットの数・o.ids＝無題の②・o.roster＝無題の①・o.tab＝開くタブ） */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 800 }, userDataWith(o.sets === undefined ? 3 : o.sets));
		await sp.page.evaluate(({ roster, ids, tab }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			if (ids) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: 5 }));
			else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster || null, ids: o.ids || null, tab: o.tab === undefined ? 1 : o.tab });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 3; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForTimeout(400);
		return sp;
	};
	const box = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; })()`;
	const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
	const selectSet = async (page, i) => {
		await page.click('#deck-set-bar [data-usd-el="set-name"]');
		await page.locator('[data-usd-el="set-radio"]').nth(i).check();
		await page.waitForTimeout(400);
	};

	await block('タイトルと帯(1) タイトルの行: 消した表示・ボタンの大きさ（34×38・アイコン16）・レース条件はタイトルとボタンの間のボタン寄せ・高さ（PC 56／スマホ 47）・PC の余白と角丸と文字（1280・390・360・320 × ライト・ダーク）', async () => {
		for (const w of [1280, 390, 360, 320]) for (const theme of ['light', 'dark']) {
			const { ctx, page, errors } = await openSp({ w, h: w > 640 ? 800 : 780, ids: IDS.slice(0, 8) });
			await page.emulateMedia({ colorScheme: theme });
			await page.waitForTimeout(200);
			const tag = w + '・' + theme;
			const m = await page.evaluate(`({
				gone: ['.header-edition', '.header-edition-pill', '.header-tagline'].filter((s) => document.querySelector('header.site-header ' + s)),
				h1: document.querySelector('header.site-header h1').textContent.trim(), h1fs: getComputedStyle(document.querySelector('header.site-header h1')).fontSize,
				header: ${box('header.site-header')}, radius: getComputedStyle(document.querySelector('header.site-header')).borderTopLeftRadius,
				h1box: ${box('header.site-header h1')}, tool: ${box('#tool-dropdown-btn')}, theme: ${box('#theme-cycle-btn')},
				icon: (() => { const s = Array.from(document.querySelectorAll('#theme-cycle-btn svg')).find((x) => getComputedStyle(x).display !== 'none'); return s ? Math.round(s.getBoundingClientRect().width) : null; })(),
				race: ${box('#hdr-race-slot [data-usd-act="set-race"]')}, raceInBar: !!document.querySelector('#deck-set-bar [data-usd-act="set-race"]'),
				bar: ${box('#deck-set-bar')}, card: ${box('.main-card')},
			})`);
			assert(m.gone.length === 0 && m.h1 === 'UmaStar OCR', 'タイトルと帯(1) ' + tag + ': 「β版」「2nd Edition」「チャンミ/LoH用ツール」は無く、タイトルは「UmaStar OCR」だけ', m);
			assert(m.tool && m.theme && m.tool.w === 34 && m.tool.h === 38 && m.theme.w === 34 && m.theme.h === 38 && m.icon === 16,
				'タイトルと帯(1) ' + tag + ': ライト／ダークはツール切り替えと同じ 34×38px・アイコン 16px', { tool: m.tool, theme: m.theme, icon: m.icon });
			assert(m.race && !m.raceInBar && m.race.x >= m.h1box.r && m.race.r <= m.tool.x && m.tool.x - m.race.r <= 16,
				'タイトルと帯(1) ' + tag + ': レース条件はタイトルの行の、タイトルとボタンの間・ボタン寄せ（帯には無い）', { race: m.race, h1: m.h1box, tool: m.tool });
			if (w > 640) {
				assert(m.header.h === 56 && m.header.y === 12 && m.radius === '16px' && m.h1fs === '26px' && m.bar.y - m.header.b === 9,
					'タイトルと帯(1) ' + tag + ': PC はタイトル 56px・上の余白 12px・角丸 16px・文字 26px・カードとの間 8px（帯の上端 77px）', m);
			} else {
				assert(m.header.h === 47 && m.header.y === 0, 'タイトルと帯(1) ' + tag + ': スマホはタイトル 47px（上下の余白 4px）', m.header);
			}
			assert(await noHScroll(page), 'タイトルと帯(1) ' + tag + ': 横スクロールなし');
			assert(jsErrors(errors).length === 0, 'タイトルと帯(1) ' + tag + ': エラー 0', errors);
			await ctx.close();
		}
	});

	await block('タイトルと帯(2) 上に残る: スクロールしてもタイトルの行（地は不透明）と帯が上に残り、--usd-sticky-top はタイトル＋帯の高さ・PC の①の表の高さから上に残る高さを引く・ツール切り替えのメニューと小窓との重なり', async () => {
		for (const w of [1280, 390]) {
			const { ctx, page, errors } = await openSp({ w, h: w > 640 ? 800 : 780, ids: IDS, roster: R1 });
			await page.evaluate(() => window.scrollTo(0, 900));
			await page.waitForTimeout(300);
			const m = await page.evaluate(`({ header: ${box('header.site-header')}, bar: ${box('#deck-set-bar')}, top: document.documentElement.style.getPropertyValue('--usd-sticky-top'),
				bg: getComputedStyle(document.querySelector('header.site-header')).backgroundColor, z: [getComputedStyle(document.querySelector('header.site-header')).zIndex, getComputedStyle(document.getElementById('deck-set-bar')).zIndex] })`);
			const want = w > 640 ? { h: 56, top: '95px' } : { h: 47, top: '84px' };
			assert(m.header.y === 0 && m.header.h === want.h && m.bar.y === want.h && m.top === want.top,
				'タイトルと帯(2) ' + w + ': スクロールしてもタイトルが上端・帯がその直下に残る（--usd-sticky-top＝' + want.top + '）', m);
			assert(!/rgba\(.*, 0\)$/.test(m.bg) && m.bg !== 'transparent' && Number(m.z[0]) > Number(m.z[1]),
				'タイトルと帯(2) ' + w + ': タイトルの行の地は不透明・帯より上に重なる', m);
			// ツール切り替えのメニューは、帯や本文の上に出る
			await page.click('#tool-dropdown-btn');
			await page.waitForTimeout(200);
			const menuTop = await page.evaluate(() => { const mn = document.getElementById('tool-dropdown-menu'); const b = mn.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, Math.min(b.bottom - 4, b.top + 90)); return { inMenu: !!(e && mn.contains(e)), b: Math.round(b.bottom) }; });
			assert(menuTop.inMenu, 'タイトルと帯(2) ' + w + ': ツール切り替えのメニューは帯・本文の上に出る（隠れない）', menuTop);
			await page.click('#tool-dropdown-btn');
			// 編成セットの小窓は、タイトルの行より上に出る
			await page.click('#deck-set-bar [data-usd-el="set-name"]');
			await page.waitForTimeout(200);
			const pop = await page.evaluate(() => { const p = document.querySelector('[data-usd-el="info-pop"]'); const b = p.getBoundingClientRect(); const e = document.elementFromPoint(b.left + 20, b.top + 12); return { inPop: !!(e && p.contains(e)) }; });
			assert(pop.inPop, 'タイトルと帯(2) ' + w + ': 小窓はタイトルの行・帯より上に出る', pop);
			await page.keyboard.press('Escape');
			if (w > 640) {
				// ①のタブ: 表の高さ＝max(360, 画面の高さ − 右下の置き場 − 24 − 上に残る高さ)
				await page.click('#step-tab-0');
				await page.waitForTimeout(500);
				// 変更前の式（上に残る高さを引かない値）を同じページで解いて、そこから 95px（タイトル 56＋帯 39）減っていることを見る
				const g = await page.evaluate(() => {
					const el = document.querySelector('.usd-roster-grid-wrap');
					if (!el) return null;
					const probe = document.createElement('div');
					probe.style.cssText = 'position:absolute;left:-9999px;max-height:max(360px, calc(100dvh - var(--usd-fab-dock, 96px) - var(--uma-sp-6)))';
					document.body.appendChild(probe);
					const before = parseFloat(getComputedStyle(probe).maxHeight);
					probe.remove();
					return { now: parseFloat(getComputedStyle(el).maxHeight), before };
				});
				assert(g && g.before > 360 + 95 && Math.abs((g.before - g.now) - 95) < 1,
					'タイトルと帯(2): PC の①の表の高さは、上に残る高さ（95px）を引いた値', g);
			}
			assert(jsErrors(errors).length === 0, 'タイトルと帯(2) ' + w + ': エラー 0', errors);
			await ctx.close();
		}
	});

	await block('タイトルと帯(3) レース条件: 選んだときは短い形・入りきらなければ 11→10px、それでも入らなければ末尾「…」・押すとレースの小窓（aria-expanded）', async () => {
		const { ctx, page, errors } = await openSp({ w: 360, h: 780, ids: IDS.slice(0, 8) });
		const RB = '#hdr-race-slot [data-usd-act="set-race"]';
		const fs0 = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).fontSize, RB);
		assert(fs0 === '11px', 'タイトルと帯(3): ふだんは 11px', fs0);
		await page.click(RB);
		await page.waitForTimeout(200);
		const opened = await page.evaluate((s) => ({ exp: document.querySelector(s).getAttribute('aria-expanded'), list: !!document.querySelector('[data-usd-el="race-list"]'), title: document.querySelector('[data-usd-el="info-pop"] .uma-popover-title').textContent }), RB);
		assert(opened.exp === 'true' && opened.list && opened.title === 'レース', 'タイトルと帯(3): 押すとレースの小窓が開き、aria-expanded が true', opened);
		await page.locator('[data-usd-el="race-radio"]').nth(1).check();
		await page.waitForTimeout(400);
		const picked = await page.evaluate((s) => { const b = document.querySelector(s); return b ? { on: b.getAttribute('aria-pressed'), text: b.textContent.replace('▾', '').trim() } : null; }, RB);
		assert(picked && picked.on === 'true' && picked.text && picked.text !== 'レース', 'タイトルと帯(3): 選ぶとタイトルの行のボタンが濃色・短い形で描き直る', picked);
		// 入りきらない表示（データに無い仮の長い文字）: 置き場の幅が変わったとき（画面の幅の変化）に測り直す
		const fit = async (text, vw) => {
			await page.evaluate((t) => { document.querySelector('#hdr-race-slot [data-usd-el="set-race-text"]').textContent = t; }, text);
			await page.setViewportSize({ width: vw + 1, height: 780 });
			await page.waitForTimeout(150);
			await page.setViewportSize({ width: vw, height: 780 });
			await page.waitForTimeout(250);
			return page.evaluate((s) => { const b = document.querySelector(s); const t = b.querySelector('[data-usd-el="set-race-text"]'); const cs = getComputedStyle(b);
				return { tight: b.hasAttribute('data-usd-tight'), fs: cs.fontSize, cut: t.scrollWidth > t.clientWidth + 1, ell: getComputedStyle(t).textOverflow, right: Math.round(b.getBoundingClientRect().right), tool: Math.round(document.getElementById('tool-dropdown-btn').getBoundingClientRect().left) }; }, RB);
		};
		const a = await fit('東京 ダート2100m 左回り', 360);
		assert(a.tight && a.fs === '10px' && !a.cut, 'タイトルと帯(3): 少し長いときは 10px にして全部入る', a);
		const b = await fit('東京 ダート2100m 左回り・外・秋', 360);
		assert(b.tight && b.fs === '10px' && b.cut && b.ell === 'ellipsis' && b.right <= b.tool, 'タイトルと帯(3): それでも入らなければ 10px のまま末尾を「…」で切る（ボタンに重ならない）', b);
		assert(await noHScroll(page), 'タイトルと帯(3): 横スクロールなし');
		assert(jsErrors(errors).length === 0, 'タイトルと帯(3): エラー 0', errors);
		await ctx.close();
	});

	await block('タイトルと帯(4) 帯と小窓: 「無題（新規）」・セット名に下線・押すと「編成セット N/10」・読み上げの名前・「✎｜3／10 ▾」は無い・右下「＋」の「セット」「レース」は新しい場所を呼ぶ', async () => {
		const { ctx, page, errors } = await openSp({ w: 390, h: 780, sets: 3 });
		const bar = await page.evaluate(() => { const n = document.querySelector('#deck-set-bar [data-usd-el="set-name"]'); const cs = getComputedStyle(n);
			return { tag: n.tagName, text: n.textContent, act: n.getAttribute('data-usd-act'), aria: n.getAttribute('aria-label'), deco: cs.textDecorationLine, pill: !!document.querySelector('#deck-set-bar [data-usd-el="set-pill"], #deck-set-bar [data-usd-act="name-edit"], #deck-set-bar [data-usd-el="set-list-btn"]'),
				snap: typeof captureStitchSnapshot === 'function' ? captureStitchSnapshot().setName : null }; });
		assert(bar.tag === 'BUTTON' && bar.text === '無題（新規）' && bar.act === 'set-list' && bar.aria === 'セットの一覧（3／10件）' && /underline/.test(bar.deco) && !bar.pill,
			'タイトルと帯(4): 帯は「無題（新規）」（下線のボタン・読み上げは「セットの一覧（3／10件）」）だけで、✎・「3／10 ▾」は無い', bar);
		assert(bar.snap === '無題（新規）', 'タイトルと帯(4): 結合画像のバーのセット名も「無題（新規）」', bar.snap);
		await page.click('#deck-set-bar [data-usd-el="set-name"]');
		await page.waitForTimeout(200);
		const pop = await page.evaluate(() => ({ title: document.querySelector('[data-usd-el="info-pop"] .uma-popover-title').textContent, first: document.querySelector('[data-usd-el="set-list"] label').textContent,
			exp: document.querySelector('#deck-set-bar [data-usd-el="set-name"]').getAttribute('aria-expanded') }));
		assert(pop.title === '編成セット3/10' && pop.first === '無題（新規）' && pop.exp === 'true', 'タイトルと帯(4): 小窓の見出しは「編成セット 3/10」・先頭は「無題（新規）」', pop);
		await page.keyboard.press('Escape');
		// 右下「＋」の「セット」「レース」
		for (const [item, want] of [['#fab-item-set', 'set-list'], ['#fab-item-race', 'race-list']]) {
			await page.click('#fab-toggle');
			await page.waitForTimeout(300);
			await page.click(item);
			await page.waitForTimeout(300);
			const got = await page.evaluate((w) => ({ open: !document.querySelector('[data-usd-el="info-pop"]').hidden, has: !!document.querySelector('[data-usd-el="' + w + '"]') }), want);
			assert(got.open && got.has, 'タイトルと帯(4): 右下「＋」の ' + item + ' は新しい場所（セット名・タイトルの行のレース）の小窓を開く', got);
			await page.keyboard.press('Escape');
			await page.waitForTimeout(200);
		}
		assert(jsErrors(errors).length === 0, 'タイトルと帯(4): エラー 0', errors);
		await ctx.close();
	});

	await block('タイトルと帯(5) 名前を付けてセットを保存: 空・同じ名前・10/10 は保存を押せない（一言）・Esc とキャンセルは入力の部分だけ閉じる・Enter で保存して新しいセットを選び小窓を閉じる・無題の中身は残る・「空にする」は今の確認', async () => {
		const st = (page) => page.evaluate(() => { const q = (s) => document.querySelector('[data-usd-el="info-body"] [data-usd-el="' + s + '"]');
			return { open: !document.querySelector('[data-usd-el="info-pop"]').hidden, box: !!q('set-name-box'), save: q('set-name-save') ? q('set-name-save').disabled : null, msg: q('set-name-msg') ? q('set-name-msg').textContent : null,
				ops: Array.from(document.querySelectorAll('[data-usd-el="info-body"] .usd-setlist-ops > button')).map((b) => b.textContent), focus: document.activeElement ? document.activeElement.getAttribute('data-usd-el') : null }; });
		{
			const { ctx, page, errors } = await openSp({ w: 1280, sets: 3, ids: IDS.slice(0, 6) });
			await page.click('#deck-set-bar [data-usd-el="set-name"]');
			const s0 = await st(page);
			assert(s0.ops.join('|') === '空にする|名前を付けてセットを保存', 'タイトルと帯(5): 無題のときは「空にする」と「名前を付けてセットを保存」（削除は無い）', s0);
			await page.click('[data-usd-el="set-save-open"]');
			const s1 = await st(page);
			assert(s1.box && s1.save === true && s1.msg === '' && s1.focus === 'set-name-input', 'タイトルと帯(5): 押すと入力欄・キャンセル・保存の囲み。空のときは保存を押せない', s1);
			await page.keyboard.type(NAMES[1]);
			const s2 = await st(page);
			assert(s2.save === true && s2.msg === '同じ名前のセットがあります。別の名前にしてください。', 'タイトルと帯(5): 同じ名前は保存できず一言が出る', s2);
			await page.keyboard.press('Enter');
			const s2b = await st(page);
			assert(s2b.open && s2b.box, 'タイトルと帯(5): 押せないときの Enter では保存しない', s2b);
			await page.keyboard.press('Escape');
			const s3 = await st(page);
			assert(s3.open && !s3.box && s3.focus === 'set-save-open', 'タイトルと帯(5): Esc は入力の部分だけ閉じる（小窓は開いたまま）', s3);
			await page.click('[data-usd-el="set-save-open"]');
			await page.click('[data-usd-el="set-name-cancel"]');
			const s4 = await st(page);
			assert(s4.open && !s4.box, 'タイトルと帯(5): キャンセルも入力の部分だけ閉じる', s4);
			await page.click('[data-usd-el="set-save-open"]');
			await page.keyboard.type('新しいセット');
			await page.keyboard.press('Enter');
			await page.waitForTimeout(500);
			const s5 = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('umaSkillDeck:userData')); const t = d.templates.find((x) => x.name === '新しいセット');
				return { open: !document.querySelector('[data-usd-el="info-pop"]').hidden, bar: document.querySelector('#deck-set-bar [data-usd-el="set-name"]').textContent, n: d.templates.length, skills: t ? t.skillIds.length : -1,
					draft: (JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}').skillIds || []).length }; });
			assert(!s5.open && s5.bar === '新しいセット' && s5.n === 4 && s5.skills === 6 && s5.draft === 6,
				'タイトルと帯(5): Enter で①②の中身ごと新しいセットとして保存し、そのセットを選んで小窓を閉じる（無題の中身は残る）', s5);
			// 無題に戻って「空にする」（今の「削除」と同じ確認の文）
			await selectSet(page, 0);
			await page.click('#deck-set-bar [data-usd-el="set-name"]');
			await page.click('[data-usd-el="set-clear"]');
			await page.waitForTimeout(200);
			const cf = await page.evaluate(() => { const d = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).find((e) => e.offsetParent && /空にしますか/.test(e.textContent)); return d ? d.textContent.replace(/\s+/g, ' ').trim() : null; });
			assert(cf && /＋新規の中身を空にしますか？/.test(cf), 'タイトルと帯(5): 「空にする」は今の無題の「削除」と同じ確認の文', cf);
			await page.click('button[data-usd-act="confirm-ok"]');
			await page.waitForTimeout(400);
			const emptied = await page.evaluate(() => (JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || '{}').skillIds || []).length);
			assert(emptied === 0, 'タイトルと帯(5): OK で無題の②が空になる', emptied);
			assert(jsErrors(errors).length === 0, 'タイトルと帯(5): エラー 0', errors);
			await ctx.close();
		}
		{
			const { ctx, page, errors } = await openSp({ w: 390, h: 780, sets: 10 });
			await page.click('#deck-set-bar [data-usd-el="set-name"]');
			await page.click('[data-usd-el="set-save-open"]');
			await page.keyboard.type('11件目');
			const s = await st(page);
			const title = await page.evaluate(() => document.querySelector('[data-usd-el="info-pop"] .uma-popover-title').textContent);
			assert(title === '編成セット10/10' && s.save === true && s.msg === 'セットは10件までです。削除してから保存してください。', 'タイトルと帯(5): 10/10 のときは保存できず一言が出る', { title, s });
			assert(jsErrors(errors).length === 0, 'タイトルと帯(5) 10/10: エラー 0', errors);
			await ctx.close();
		}
	});

	await block('タイトルと帯(6) セット名を変更: 今の名前から・空と同じ名前は保存を押せない・保存で名前が変わり、付いている①の編成の名前も同じになる', async () => {
		const { ctx, page, errors } = await openSp({ w: 360, h: 780, sets: 3, roster: R1, ids: IDS.slice(0, 4) });
		// ①の中身つきで保存して（①の編成が付く）、その名前を変える
		await page.click('#deck-set-bar [data-usd-el="set-name"]');
		await page.click('[data-usd-el="set-save-open"]');
		await page.keyboard.type('変える前');
		await page.keyboard.press('Enter');
		await page.waitForTimeout(500);
		await page.click('#deck-set-bar [data-usd-el="set-name"]');
		const ops = await page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-body"] .usd-setlist-ops > button')).map((b) => b.textContent));
		assert(ops.join('|') === 'セット名を変更|削除', 'タイトルと帯(6): 保存済みのときは「セット名を変更」と「削除」', ops);
		await page.click('[data-usd-el="set-rename-open"]');
		const v0 = await page.inputValue('[data-usd-el="set-name-input"]');
		assert(v0 === '変える前', 'タイトルと帯(6): 欄には今の名前が入っている', v0);
		await page.fill('[data-usd-el="set-name-input"]', '');
		const e = await page.isDisabled('[data-usd-el="set-name-save"]');
		await page.fill('[data-usd-el="set-name-input"]', NAMES[0]);
		const d = await page.evaluate(() => ({ dis: document.querySelector('[data-usd-el="set-name-save"]').disabled, msg: document.querySelector('[data-usd-el="set-name-msg"]').textContent }));
		assert(e && d.dis && d.msg === '同じ名前のセットがあります。別の名前にしてください。', 'タイトルと帯(6): 空・同じ名前は保存を押せない（保存済みの名前を空にはできない）', { e, d });
		await page.fill('[data-usd-el="set-name-input"]', '変えた後');
		await page.click('[data-usd-el="set-name-save"]');
		await page.waitForTimeout(500);
		const r = await page.evaluate(() => { const dd = JSON.parse(localStorage.getItem('umaSkillDeck:userData')); const t = dd.templates.find((x) => x.name === '変えた後'); const ro = t && (dd.rosters || []).find((x) => x.rosterId === t.baseRosterId);
			return { open: !document.querySelector('[data-usd-el="info-pop"]').hidden, bar: document.querySelector('#deck-set-bar [data-usd-el="set-name"]').textContent, t: !!t, roster: ro ? ro.name : null }; });
		assert(!r.open && r.bar === '変えた後' && r.t && r.roster === '変えた後', 'タイトルと帯(6): 保存で名前が変わり、付いている①の編成の名前も同じになる（小窓は閉じる）', r);
		assert(jsErrors(errors).length === 0, 'タイトルと帯(6): エラー 0', errors);
		await ctx.close();
	});

	await block('タイトルと帯(7) ②の合計の行: 並び［N Pt／N種］［?］［継承固有］［共通スキルのヒントLv］・部品 28px／セレクト 26px・設定の枠の行は無い・入らない幅は小さく→2行目・? の小窓は2行だけ・赤い点なし（1280・480・390・320）', async () => {
		for (const w of [1280, 480, 390, 320]) {
			const { ctx, page, errors } = await openSp({ w, h: 800, ids: IDS, roster: R1 });
			const m = await page.evaluate(() => {
				const band = document.querySelector('#deck-template-panel [data-usd-el="set-head"]');
				const main = band.querySelector('.usd-band-main');
				const kids = Array.from(main.children).map((e) => e.getAttribute('data-usd-el'));
				const r = (e) => { const b = e.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height), x: Math.round(b.x), r: Math.round(b.right) }; };
				const uniq = Array.from(band.querySelectorAll('.usd-uniq')).map((e) => ({ el: e.getAttribute('data-usd-el'), label: e.querySelector('.usd-uniq-label').textContent, ...r(e), fs: getComputedStyle(e).fontSize }));
				const sels = Array.from(band.querySelectorAll('.usd-uniq-sel')).map((e) => Math.round(e.getBoundingClientRect().height));
				const help = band.querySelector('[data-usd-act="pt-need-help"]');
				const link = document.querySelector('#deck-template-panel [data-usd-el="roster-link"]');
				return { kids, uniq, sels, band: r(band), sum: r(band.querySelector('[data-usd-el="factor-sum"]')), fit: band.getAttribute('data-usd-fit'), wrap: band.hasAttribute('data-usd-wrap'),
					dot: help.classList.contains('usd-help-dot') || getComputedStyle(help, '::after').content !== 'none', reset: !!band.querySelector('[data-usd-act="factor-reset"]'), stats: !!band.querySelector('.usd-band-stat'),
					linkShown: !!(link && !link.hidden && link.getClientRects().length), sumFs: getComputedStyle(band.querySelector('.usd-band-pt')).fontSize };
			});
			const tag = String(w);
			assert(m.kids.join(',') === 'factor-sum,pt-need-help-btn,band-cfg' && m.uniq.map((u) => u.label).join('|') === '継承固有|共通スキルのヒントLv',
				'タイトルと帯(7) ' + tag + ': 合計の行は［N Pt／N種］［?］［継承固有｜種数▾｜Lv▾］［共通スキルのヒントLv｜Lv▾］', m.kids);
			assert(m.uniq.every((u) => u.h === 28) && m.sels.every((h) => h === 26) && !m.linkShown && !m.reset && !m.stats && !m.dot,
				'タイトルと帯(7) ' + tag + ': 部品 28px・セレクト 26px・設定の枠の行は無い・↺ と2行は行から外した・? に赤い点は無い（①で取得するスキルがあっても）', m);
			if (w === 1280) assert(!m.fit && !m.wrap && m.band.h === 44 && m.uniq[1].r <= m.band.r, 'タイトルと帯(7) 1280: 1行・文字はそのまま（帯 44px）', m);
			if (w === 480) assert(m.fit && !m.wrap && m.band.h === 36, 'タイトルと帯(7) 480: 文字を小さくして1行に入る（帯 36px）', m);
			if (w === 390) assert(!m.fit && m.wrap && m.uniq[0].y > m.sum.y + 10 && m.uniq[0].fs === '12px' && m.band.h === 66, 'タイトルと帯(7) 390: 入らない幅は部品2つを2行目に（文字は元の大きさ・帯 66px）', m);
			if (w === 320) assert(m.wrap && m.sumFs === '22px', 'タイトルと帯(7) 320: 2行目（数字は元の大きさ）', m);
			assert(await noHScroll(page), 'タイトルと帯(7) ' + tag + ': 横スクロールなし');
			if (w === 390) {
				await page.click('#deck-template-panel [data-usd-act="pt-need-help"]');
				await page.waitForTimeout(200);
				const h = await page.evaluate(() => ({ title: document.querySelector('[data-usd-el="info-pop"] .uma-popover-title').textContent, lines: Array.from(document.querySelectorAll('[data-usd-el="info-body"] > *')).map((e) => ({ el: e.getAttribute('data-usd-el'), text: e.textContent })) }));
				assert(h.title === '②の Pt' && h.lines.length === 2 && h.lines[0].el === 'pt-need-uniq' && /^継承固有 [\d,]+ Pt／\d+種$/.test(h.lines[0].text) && h.lines[1].el === 'pt-need-common' && /^共通スキル [\d,]+ Pt／\d+種$/.test(h.lines[1].text),
					'タイトルと帯(7): ? の小窓は「継承固有 … Pt／…種」「共通スキル … Pt／…種」の2行だけ（題は「②の Pt」）', h);
				await page.keyboard.press('Escape');
			}
			assert(jsErrors(errors).length === 0, 'タイトルと帯(7) ' + tag + ': エラー 0', errors);
			await ctx.close();
		}
	});

	await block('タイトルと帯(8) ②の入口の行: 並び（オススメサポ・脚質オススメ｜削除・↺・虫眼鏡・◎・表）・削除はゴミ箱だけの 28px の丸（読み上げ「削除」）・虫眼鏡の小窓に4つの入口・押すと小窓を閉じて今と同じ画面・入らない幅は文字を小さく・320px だけ横送り', async () => {
		for (const w of [1280, 390, 360, 320]) {
			const { ctx, page, errors } = await openSp({ w, h: 800, ids: IDS });
			const m = await page.evaluate(() => {
				const head = document.querySelector('#deck-template-panel .usd-skillgroup-head');
				const row = head.querySelector('.usd-entry-row');
				const r = (e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), r: Math.round(b.right) }; };
				const tools = Array.from(head.querySelectorAll('.usd-factor-tools > button')).map((b) => ({ el: b.getAttribute('data-usd-el'), ...r(b), text: b.textContent.trim(), aria: b.getAttribute('aria-label'), radius: getComputedStyle(b).borderTopLeftRadius }));
				return { left: Array.from(row.children).map((b) => b.getAttribute('data-usd-act')), tools, fit: head.getAttribute('data-usd-fit'), fade: row.getAttribute('data-usd-fade'),
					head: r(head), fs: getComputedStyle(row.querySelector('.usd-outside-entry')).fontSize, picks: document.querySelectorAll('#deck-template-panel [data-usd-act^="editor-pick"]').length };
			});
			const tag = String(w);
			const order = m.tools.map((t) => t.el).join(',');
			assert(m.left.join(',') === 'outside-open,style-open' && /^palette-delete,factor-reset,entry-search,(factor-circle-mode,)?factor-view$/.test(order) && m.picks === 0,
				'タイトルと帯(8) ' + tag + ': 入口の行は［オススメサポ］［脚質オススメ］…［削除］［↺］［虫眼鏡］［◎］［表］（4つの入口は行に無い）', { left: m.left, order });
			const del = m.tools.find((t) => t.el === 'palette-delete'), srch = m.tools.find((t) => t.el === 'entry-search'), rst = m.tools.find((t) => t.el === 'factor-reset');
			assert(del.w === 28 && del.h === 28 && del.text === '' && del.aria === '削除' && srch.w === 28 && srch.h === 28 && srch.radius === rst.radius && del.radius !== '0px',
				'タイトルと帯(8) ' + tag + ': 削除はゴミ箱のアイコンだけの 28px の丸（読み上げ「削除」）・虫眼鏡は ↺ と同じ 28px の丸', { del, srch, rst });
			assert(m.tools[m.tools.length - 1].r <= m.head.r + 1, 'タイトルと帯(8) ' + tag + ': 右端の塊は行の右端に寄る', m);
			if (w === 1280) assert(!m.fit && !m.fade && m.fs === '11px', 'タイトルと帯(8) 1280: 文字はそのまま・横送りなし', m);
			if (w === 390 || w === 360) assert(m.fit && Number(m.fit) >= 1 && !m.fade && /^(9|10)px$/.test(m.fs), 'タイトルと帯(8) ' + tag + ': 入らない幅はオススメサポ・脚質オススメの文字を小さくして1行に入る（横送りなし）', m);
			if (w === 320) assert(m.fit === '3' && m.fade === 'right', 'タイトルと帯(8) 320: それでも入らない幅だけ今の横送り（端のフェード）', m);
			assert(await noHScroll(page), 'タイトルと帯(8) ' + tag + ': 横スクロールなし');
			if (w === 390) {
				await page.click(ENTRY_SEARCH_BTN);
				await page.waitForTimeout(200);
				const pop = await page.evaluate(() => ({ title: document.querySelector('[data-usd-el="info-pop"] .uma-popover-title').textContent, exp: document.querySelector('#deck-template-panel [data-usd-act="entry-search"]').getAttribute('aria-expanded'),
					items: Array.from(document.querySelectorAll('[data-usd-el="entry-search-list"] > button')).map((b) => ({ act: b.getAttribute('data-usd-act'), text: b.textContent.trim(), icon: (b.querySelector('svg, i') || {}).getAttribute ? (b.querySelector('svg, i').getAttribute('data-lucide') || b.querySelector('svg, i').getAttribute('class')) : null })) }));
				assert(pop.title === 'スキルを探して追加' && pop.exp === 'true' && pop.items.map((i) => i.act).join(',') === 'editor-pick,editor-pick-passive,editor-pick-text,editor-pick-screenshot'
					&& /^条件で検索$/.test(pop.items[0].text) && /^緑スキル/.test(pop.items[1].text) && pop.items[2].text === 'テキストで検索' && pop.items[3].text === 'スクショで追加'
					&& /filter/.test(pop.items[0].icon) && /sprout/.test(pop.items[1].icon) && /file-text/.test(pop.items[2].icon) && /upload-cloud|cloud-upload/.test(pop.items[3].icon),
					'タイトルと帯(8): 虫眼鏡の小窓（題「スキルを探して追加」）に4つの入口を今と同じ名前・アイコンで縦に並べる', pop);
				await page.keyboard.press('Escape');
				const where = { 'editor-pick': '[data-usd-el="picker-modal"], .usd-modal', 'editor-pick-passive': '.usd-modal', 'editor-pick-text': '.usd-modal' };
				for (const act of ['editor-pick', 'editor-pick-passive', 'editor-pick-text']) {
					await pickEntry(page, act);
					await page.waitForTimeout(500);
					const got = await page.evaluate((sel) => ({ popHidden: document.querySelector('[data-usd-el="info-pop"]').hidden, modal: Array.from(document.querySelectorAll(sel)).some((e) => e.offsetParent || getComputedStyle(e).position === 'fixed' && getComputedStyle(e).display !== 'none') }), where[act]);
					assert(got.popHidden && got.modal, 'タイトルと帯(8): 小窓の「' + act + '」を押すと小窓が閉じて今と同じ画面が開く', got);
					await page.evaluate(() => UmaSkillDeckCore.closeSkillPicker());
					await page.waitForTimeout(300);
				}
				// ↺ は入口の行で今と同じリセットの小窓を開く
				await page.click('#deck-template-panel .usd-factor-tools [data-usd-act="factor-reset"]');
				await page.waitForTimeout(200);
				const rs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-body"] button')).map((b) => b.textContent.trim()));
				assert(rs.length === 2 && /をすべて消す$/.test(rs[0]) && rs[1] === 'やめる', 'タイトルと帯(8): ↺ は入口の行から今と同じリセットの小窓を開く', rs);
				await page.keyboard.press('Escape');
			}
			assert(jsErrors(errors).length === 0, 'タイトルと帯(8) ' + tag + ': エラー 0', errors);
			await ctx.close();
		}
	});

	await block('タイトルと帯(9) UmaExam: ライト／ダーク 34×38・PC のタイトルは UmaStar と同じ値（56px・上 12・角丸 16・文字 26・カードの上端 76）・スマホ 47px・「2nd Edition」「技能試験用ツール」は残す・スクロールで残さない・効率を指定で「スキル名のコピー」の下端が画面に入る', async () => {
		for (const [w, h] of [[1366, 768], [1920, 1080], [390, 844], [360, 780]]) for (const theme of ['light', 'dark']) {
			const { ctx, page, errors } = await openPage(browser, base, 'exam.html', { width: w, height: h });
			await page.emulateMedia({ colorScheme: theme });
			for (let i = 0; i < 3; i++) if (await page.isVisible('#ui-notice')) await page.click('#ui-notice-ok');
			if (w > 640) { await page.check('#scope-mode-efficiency'); await page.waitForTimeout(400); }
			await page.mouse.move(0, h - 1);
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.waitForTimeout(250);
			const m = await page.evaluate(`({ header: ${box('header.exam-header')}, theme: ${box('#theme-cycle-btn')}, tool: ${box('#tool-dropdown-btn')}, card: ${box('#new-step-card')},
				icon: (() => { const s = Array.from(document.querySelectorAll('#theme-cycle-btn svg')).find((x) => getComputedStyle(x).display !== 'none'); return s ? Math.round(s.getBoundingClientRect().width) : null; })(),
				radius: getComputedStyle(document.querySelector('header.exam-header')).borderTopLeftRadius, fs: getComputedStyle(document.querySelector('.exam-title')).fontSize, pos: getComputedStyle(document.querySelector('header.exam-header')).position,
				pill: (document.querySelector('header.exam-header .header-edition-pill') || {}).textContent, tag: (document.querySelector('header.exam-header .header-tagline') || {}).textContent,
				copy: (() => { const d = Array.from(document.querySelectorAll('details')).find((x) => /スキル名のコピー/.test(x.querySelector('summary') ? x.querySelector('summary').textContent : '')); return d ? Math.round(d.getBoundingClientRect().bottom) : null; })(),
				open: Array.from(document.querySelectorAll('#step-panel-1 details')).filter((d) => d.open).length, vh: window.innerHeight })`);
			const tg = w + 'x' + h + '・' + theme;
			assert(m.theme.w === 34 && m.theme.h === 38 && m.icon === 16 && m.tool.w === 34 && m.tool.h === 38, 'タイトルと帯(9) ' + tg + ': ライト／ダークは 34×38・アイコン 16px', m);
			assert(m.pill && /2nd/.test(m.pill) && m.tag === '技能試験用ツール' && m.pos !== 'sticky' && m.pos !== 'fixed', 'タイトルと帯(9) ' + tg + ': 「2nd Edition」「技能試験用ツール」は残り、タイトルは上に残さない', m);
			if (w > 640) {
				assert(m.header.h === 56 && m.header.y === 12 && m.radius === '16px' && m.fs === '26px' && m.card.y === 76, 'タイトルと帯(9) ' + tg + ': PC のタイトルは UmaStar と同じ値（56px・上 12・角丸 16・文字 26・カードとの間 8）', m);
				assert(m.open === 0 && m.copy !== null && m.copy <= m.vh, 'タイトルと帯(9) ' + tg + ': 効率を指定・パネルを開いていない開いた位置で「スキル名のコピー」の下端が画面に入る', { copy: m.copy, vh: m.vh, open: m.open });
			} else {
				assert(m.header.h === 47 && m.header.y === 0, 'タイトルと帯(9) ' + tg + ': スマホのタイトルは 47px（上下の余白 4px）', m.header);
			}
			assert(await noHScroll(page), 'タイトルと帯(9) ' + tg + ': 横スクロールなし');
			assert(jsErrors(errors).length === 0, 'タイトルと帯(9) ' + tg + ': エラー 0', errors);
			await ctx.close();
		}
	});
}
