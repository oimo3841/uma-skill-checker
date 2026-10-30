// ②因子周回のマイナスの Pt を押して開く小窓（C-242・2026-10-30）の検査。
// run-smoke.mjs の末尾から register68() で呼ばれる（塊の見出しはすべて「マイナスの小窓」で始まる。`npm run test:visual -- --only=マイナスの小窓` で回せる）。
//
// 決め（おいもさん・2026-10-30）:
//  ・②の行の「①と重なり」の文言を消し、マイナスの Pt を押すと小窓（今の説明の小窓と同じ部品。題はスキル名）。
//  ・押せる見た目は点線の下線（太さ 1.5px・文字の色・幅は増やさない）。マイナスの行だけ（「①で取得」・普通の Pt には付けない）。押せる範囲は 44px。
//  ・小窓: ①の由来（1つ目のカード名の左に「①」・カード名は見出しと同じ強調）とスキルの行「スキル　ヒントLvN」。前段は「白　ヒントLvN（金　ヒントLvM）」。
//    由来が複数なら区切りと「合計　ヒントLvN」。「②因子周回で因子化」の下に「ヒントLvA (X Pt) → ヒントLvB (Y Pt) = −Z Pt」（全角の−・途中で折り返さない）。
//  ・◎の行（①で◎に上げた○。行の値は○と◎の軽減の合算）も同じ書式「○　ヒントLvN（◎　ヒントLvN）」で、Pt は○と◎の合算。
// 期待値の Pt は製品の計算を読まず、data/skill-pt.json と割引率の表から検査の側で出す（丸め(基礎値 × (100 − ヒントの割引 − 状態の割引) ÷ 100)）。
// カード名は data/ の題と名前から作る。スキル名は検査の側に書かない（恒久ルール1。id で書く）。
// 編成は C-239 のモックと同じ実データ（uma-0179＋6枚・切れ者・共通スキルのヒントLv 3・①の Lv0〜2 の白と①の前段の24行）。

import { reloadReady } from './lib/page-ready.mjs';
import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';

export async function register68(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const NAME = new Map();
	readJson('uma-skill-deck-skills.json').skills.forEach((s) => NAME.set(s.id, s.name));
	readJson('data/extended-skills.json').entries.forEach((s) => { if (!NAME.has(s.id)) NAME.set(s.id, s.name); });
	const N = (id) => NAME.get(id);
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
	const RULES = readJson('data/skill-pt-rules.json');
	const ptOf = (id, level, statusId) => {
		const b = PT.get(id).pt;
		const hint = level > 0 ? RULES.hintDiscountPercent[Math.min(level, RULES.hintDiscountPercent.length) - 1] : 0;
		const st = (RULES.statuses.find((s) => s.id === statusId) || { percent: 0 }).percent;
		const n = b * (100 - hint - st);
		return RULES.rounding === 'floor' ? Math.floor(n / 100) : Math.round(n / 100);
	};
	const cardsJson = readJson('data/support-cards.json');
	const CARDS = cardsJson.entries || cardsJson.cards || cardsJson;
	const umaJson = readJson('data/training-umamusume.json');
	const UMAS = umaJson.entries || umaJson.umas || umaJson;
	const label = (list, id) => { const e = list.find((x) => x.id === id); return '[' + e.title + ']' + e.charaName; };
	const CARD = (id) => label(CARDS, id), UMA = (id) => label(UMAS, id);
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const ST = 'kire', F = 3;
	const A = { umaId: 'uma-0179', cardIds: ['card-0565', 'card-0281', 'card-0402', 'card-0499', 'card-0248', 'card-0249'], pt: { status: ST } };
	const IDS = ['2', '15', '20', '36', '69', '107', '113', '123', '157', '224', '255', '417', '125', '124', '6', '27', '33', '230', '16', '23', '147', '117', '118', '145'];
	// 例の行（id）: (a) ヒントLvの差・(b) 金の前段・(c) 由来が2つ・◎の行（①で◎に上げた○）。上位のスキルはステップアップのデータで確かめる
	const AOHARU = '417', ORENAI = '230', ORENAI_GOLD = 'ex-0238', PASS = '113', HIDARI = '2', HIDARI_UP = 'ex-0535';
	const SU = readJson('data/skill-step-up.json').entries;
	const isPrevOf = (up, w) => SU.some((e) => e.skillId === up && (e.prevSkillIds || []).includes(w));

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 1280, height: o.h || 900 }, EMPTY);
		await sp.page.evaluate(({ roster, ids, F, theme }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids, name: '', updatedAt: '', skillIcons: {}, parentHintLevel: F }));
			localStorage.setItem('umaSkillDeck:stepTab', '1');
			localStorage.setItem('uma-tools-theme', theme);
		}, { roster: o.roster || A, ids: o.ids || IDS, F, theme: o.theme || 'light' });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.evaluate(async () => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); });
		await sp.page.waitForSelector(BAR + '[data-usd-el="set-total"]', { timeout: 20000 });
		await sp.page.waitForTimeout(400);
		return sp;
	};
	const signedPt = (t) => { const v = Number(String(t).replace(/[^0-9]/g, '')) || 0; return String(t).trim().startsWith('−') ? -v : v; };
	const readRows = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-el="selected-list"] .usd-panel[data-skill-id]')).map((p) => {
		const sp = p.querySelector('[data-usd-el="panel-pt"]');
		const b = p.querySelector('[data-usd-el="panel-ptbtn"]');
		return { id: p.dataset.skillId, pt: sp ? sp.textContent : '', overlap: p.getAttribute('data-usd-overlap'), taken: p.classList.contains('usd-panel--taken'), btn: !!b,
			mark: !!p.querySelector('[data-usd-el="panel-overlap"]'), h: Math.round(p.getBoundingClientRect().height) };
	}));
	const POP = '[data-usd-el="info-pop"]:not([hidden])';
	const openRow = async (page, id) => {
		await page.click(T + '[data-usd-el="panel-ptbtn"][data-skill-id="' + id + '"]');
		await page.waitForSelector(POP + ' [data-usd-el="overlap-info"]', { timeout: 5000 });
		return page.evaluate((POP) => {
			const pop = document.querySelector(POP);
			const box = pop.querySelector('[data-usd-el="overlap-info"]');
			const title = pop.querySelector('[data-usd-el="info-title"]') || pop.querySelector('h2, h3, .usd-info-title');
			return { title: title ? title.textContent : null, kind: box.dataset.kind, lines: Array.from(box.children).map((c) => c.textContent),
				diff: Number(box.querySelector('[data-usd-el="overlap-calc"]').dataset.diff), diffText: box.querySelector('[data-usd-el="overlap-diff"]').textContent };
		}, POP);
	};
	const closePop = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(80); };

	await block('マイナスの小窓(1) 押せる見た目: マイナスの行だけ Pt が点線の下線のボタン（1.5px・文字の色・幅は増えない・押せる範囲 44px）／「①で取得」・普通の Pt には付かない／名前の脇の「①と重なり」は無い／行の高さは同じ', async () => {
		const sp = await openSp({ ids: IDS.concat(['1', '3']) });
		const rows = await readRows(sp.page);
		const neg = rows.filter((r) => signedPt(r.pt) < 0 && !r.taken);
		assert(neg.length === 14 && neg.every((r) => r.btn && r.overlap), 'マイナスの小窓(1) マイナスの行は14行で、すべて Pt がボタン（①と重なる行）', rows.filter((r) => signedPt(r.pt) < 0).map((r) => r.id + ':' + r.btn));
		const other = rows.filter((r) => !(signedPt(r.pt) < 0) || r.taken);
		assert(other.length === rows.length - 14 && other.every((r) => !r.btn) && other.some((r) => r.taken) && other.some((r) => !r.taken && /^\d+ Pt$/.test(r.pt)),
			'マイナスの小窓(1) 「①で取得」の行・普通の Pt の行にはボタンが無い', other.filter((r) => r.btn).map((r) => r.id));
		assert(rows.every((r) => !r.mark) && Array.from(new Set(rows.map((r) => r.h))).length === 1, 'マイナスの小窓(1) 名前の脇の文言は無い・行の高さはそろう', Array.from(new Set(rows.map((r) => r.h))));
		const look = await sp.page.evaluate((id) => {
			const b = document.querySelector('#deck-template-panel [data-usd-el="panel-ptbtn"][data-skill-id="' + id + '"]');
			const sp = b.parentElement;
			const cs = getComputedStyle(b), sps = getComputedStyle(sp), af = getComputedStyle(b, '::after');
			const r = b.getBoundingClientRect();
			// 同じ文字を、ボタンでない文字として測る（幅が増えていないこと）
			const probe = document.createElement('span');
			probe.textContent = b.textContent;
			probe.style.cssText = 'font:' + cs.font + ';letter-spacing:' + cs.letterSpacing + ';white-space:nowrap;position:absolute;visibility:hidden';
			document.body.appendChild(probe);
			const pw = probe.getBoundingClientRect().width;
			probe.remove();
			const hit = (dx, dy) => { const e = document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2 + dy); return !!e && (e === b || b.contains(e)); };
			return { line: cs.textDecorationLine, style: cs.textDecorationStyle, thick: cs.textDecorationThickness, decoColor: cs.textDecorationColor, color: cs.color, spanColor: sps.color,
				w: r.width, pw, padding: cs.padding, border: cs.borderTopWidth, afterH: parseFloat(af.height), afterW: parseFloat(af.width),
				hitUp: hit(0, -21), hitDown: hit(0, 21), hitLeft: hit(-21, 0), hitRight: hit(21, 0) };
		}, AOHARU);
		assert(look.line === 'underline' && look.style === 'dotted' && look.thick === '1.5px' && look.decoColor === look.color && look.color === look.spanColor,
			'マイナスの小窓(1) 点線の下線・太さ 1.5px・下線の色＝文字の色＝今の Pt の色', look);
		assert(Math.abs(look.w - look.pw) < 0.5 && look.padding === '0px' && look.border === '0px', 'マイナスの小窓(1) ボタンの幅は文字の幅のまま（余白・枠なし）', look);
		assert(look.afterH === 44 && look.afterW >= 44 && look.hitUp && look.hitDown && look.hitLeft && look.hitRight, 'マイナスの小窓(1) 押せる範囲は縦 44px・横 44px 以上（中心から上下左右 21px でボタンに当たる）', look);
		assert(jsErrors(sp.errors).length === 0, 'マイナスの小窓(1) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('マイナスの小窓(2) 押すと小窓（題はスキル名・aria-expanded）／Esc で閉じてボタンにフォーカスが戻る／星取表の行からも開く', async () => {
		const sp = await openSp();
		const p = await openRow(sp.page, AOHARU);
		const st = await sp.page.evaluate((id) => {
			const b = document.querySelector('#deck-template-panel [data-usd-el="panel-ptbtn"][data-skill-id="' + id + '"]');
			const pop = document.querySelector('[data-usd-el="info-pop"]');
			return { expanded: b.getAttribute('aria-expanded'), haspopup: b.getAttribute('aria-haspopup'), popText: pop.textContent };
		}, AOHARU);
		assert(p.title === N(AOHARU) && st.expanded === 'true' && st.haspopup === 'dialog', 'マイナスの小窓(2) 題はスキル名・ボタンは aria-expanded="true"', { title: p.title, st });
		assert(!/重なり/.test(st.popText), 'マイナスの小窓(2) 小窓に「重なり」の語は無い', st.popText);
		await closePop(sp.page);
		const after = await sp.page.evaluate((id) => ({ open: !!document.querySelector('[data-usd-el="info-pop"]:not([hidden])'), focus: document.activeElement && document.activeElement.getAttribute('data-skill-id'),
			act: document.activeElement && document.activeElement.getAttribute('data-usd-act'), expanded: document.querySelector('#deck-template-panel [data-usd-el="panel-ptbtn"][data-skill-id="' + id + '"]').getAttribute('aria-expanded') }), AOHARU);
		assert(!after.open && after.focus === AOHARU && after.act === 'factor-overlap-info' && after.expanded === 'false', 'マイナスの小窓(2) Esc で閉じ、押したボタンにフォーカスが戻る', after);
		// 星取表（C-224）でも同じ行の部品
		const pv = await sp.page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="factor-view"]'); return b ? b.getAttribute('aria-pressed') : null; });
		if (pv !== 'true') { await sp.page.click(T + '[data-usd-el="factor-view"]'); await sp.page.waitForTimeout(300); }
		const q = await openRow(sp.page, PASS);
		assert(q.title === N(PASS) && q.kind === 'level' && q.diffText === '−32 Pt', 'マイナスの小窓(2) 星取表の行の Pt からも同じ小窓が開く', q);
		await closePop(sp.page);
		assert(jsErrors(sp.errors).length === 0, 'マイナスの小窓(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('マイナスの小窓(3) 文面（実データ）: (a) ヒントLvの差・(b) 金の前段・(c) 由来が2つ・◎の行（①で◎に上げた○。○と◎の合算）。Pt は検査の側で計算した値', async () => {
		assert(isPrevOf(ORENAI_GOLD, ORENAI) && PT.get(ORENAI_GOLD).rarity === 'gold' && isPrevOf(HIDARI_UP, HIDARI) && PT.get(HIDARI_UP).rarity === 'white', 'マイナスの小窓(3) 前提: 例の上位のスキルはステップアップのデータの上位（金・◎）');
		const sp = await openSp();
		const calc = (lo, hi, a, b) => 'ヒントLv' + lo + ' (' + a + ' Pt) → ヒントLv' + hi + ' (' + b + ' Pt) = −' + Math.abs(b - a) + ' Pt';
		const want = {
			[AOHARU]: { kind: 'level', lines: ['①' + CARD('card-0565'), N(AOHARU) + '　ヒントLv1', '②因子周回で因子化', calc(1, 4, ptOf(AOHARU, 1, ST), ptOf(AOHARU, 4, ST))] },
			[ORENAI]: { kind: 'prev', lines: ['①' + CARD('card-0402'), N(ORENAI) + '　ヒントLv0（' + N(ORENAI_GOLD) + '　ヒントLv3）', '②因子周回で因子化', calc(0, 3, ptOf(ORENAI, 0, ST), ptOf(ORENAI, 3, ST))] },
			[PASS]: { kind: 'level', lines: ['①' + UMA('uma-0179'), N(PASS) + '　ヒントLv1', CARD('card-0281'), N(PASS) + '　ヒントLv1', '合計　ヒントLv2', '②因子周回で因子化', calc(2, 5, ptOf(PASS, 2, ST), ptOf(PASS, 5, ST))] },
			[HIDARI]: { kind: 'circle', lines: ['①' + CARD('card-0249'), N(HIDARI) + '　ヒントLv1（' + N(HIDARI_UP) + '　ヒントLv1）', '②因子周回で因子化',
				calc(1, 4, ptOf(HIDARI, 1, ST) + ptOf(HIDARI_UP, 1, ST), ptOf(HIDARI, 4, ST) + ptOf(HIDARI_UP, 4, ST))] }
		};
		// 指示の例と同じ値（(a) 160 → 110・(b) 162 → 108・(c) 112 → 80）になること
		assert(want[AOHARU].lines[3] === 'ヒントLv1 (160 Pt) → ヒントLv4 (110 Pt) = −50 Pt' && want[ORENAI].lines[3] === 'ヒントLv0 (162 Pt) → ヒントLv3 (108 Pt) = −54 Pt'
			&& want[PASS].lines[6] === 'ヒントLv2 (112 Pt) → ヒントLv5 (80 Pt) = −32 Pt', 'マイナスの小窓(3) 前提: 検査の側の計算が指示の例の値と同じ', [want[AOHARU].lines[3], want[ORENAI].lines[3], want[PASS].lines[6]]);
		const rows = await readRows(sp.page);
		for (const [id, w] of Object.entries(want)) {
			const p = await openRow(sp.page, id);
			await closePop(sp.page);
			const row = rows.find((r) => r.id === id);
			assert(p.title === N(id) && p.kind === w.kind && JSON.stringify(p.lines) === JSON.stringify(w.lines), 'マイナスの小窓(3) ' + id + '（' + w.kind + '）の文面', { got: p.lines, want: w.lines });
			assert(signedPt(row.pt) === p.diff && row.pt === p.diffText, 'マイナスの小窓(3) ' + id + ' の「= −N Pt」は行の値と同じ（' + row.pt + '）', { row: row.pt, pop: p.diffText });
		}
		await sp.ctx.close();
	});

	await block('マイナスの小窓(4) すべてのマイナスの行で、小窓の「= −N Pt」と data-diff が行の値と一致する／小窓の中の Lv と Pt の式が差と合う', async () => {
		const sp = await openSp();
		const rows = (await readRows(sp.page)).filter((r) => r.btn);
		const bad = [];
		for (const r of rows) {
			const p = await openRow(sp.page, r.id);
			await closePop(sp.page);
			const m = /^ヒントLv(\d) \((\d+) Pt\) → ヒントLv(\d) \((\d+) Pt\) = −(\d+) Pt$/.exec(p.lines[p.lines.length - 1]);
			const ok = !!m && Number(m[4]) - Number(m[2]) === p.diff && -Number(m[5]) === p.diff && p.diff === signedPt(r.pt) && p.diffText === r.pt && p.lines[0].startsWith('①');
			if (!ok) bad.push({ id: r.id, row: r.pt, lines: p.lines, diff: p.diff });
		}
		assert(rows.length === 14 && bad.length === 0, 'マイナスの小窓(4) 14行すべて一致', bad.slice(0, 3));
		await sp.ctx.close();
	});

	await block('マイナスの小窓(5) 375px・320px: 「= −N Pt」は途中で折り返さない（折り返すなら矢印の前）・小窓と画面に横スクロールなし', async () => {
		for (const [w, h] of [[375, 812], [320, 568]]) {
			const sp = await openSp({ w, h });
			const rows = (await readRows(sp.page)).filter((r) => r.btn);
			const bad = [];
			for (const r of rows) {
				await openRow(sp.page, r.id);
				const m = await sp.page.evaluate(() => {
					const pop = document.querySelector('[data-usd-el="info-pop"]:not([hidden])');
					const calc = pop.querySelector('[data-usd-el="overlap-calc"]');
					const parts = calc.querySelectorAll('.usd-ovp-nowrap');
					const lines = (el) => { const rs = Array.from(el.getClientRects()); return new Set(rs.map((x) => Math.round(x.top))).size; };
					const tail = parts[1], diff = calc.querySelector('[data-usd-el="overlap-diff"]');
					const box = pop.querySelector('[data-usd-el="overlap-info"]');
					return { head: lines(parts[0]), tail: lines(tail), diff: lines(diff), calcLines: Math.round(calc.getBoundingClientRect().height / parseFloat(getComputedStyle(calc).lineHeight)),
						tailStartsArrow: tail.textContent.startsWith('→'), popOver: box.scrollWidth > box.clientWidth + 1 || pop.scrollWidth > pop.clientWidth + 1,
						tailRight: tail.getBoundingClientRect().right, popRight: pop.getBoundingClientRect().right, pageOver: document.documentElement.scrollWidth > innerWidth + 1 };
				});
				await closePop(sp.page);
				if (!(m.head === 1 && m.tail === 1 && m.diff === 1 && m.tailStartsArrow && m.calcLines <= 2 && !m.popOver && m.tailRight <= m.popRight && !m.pageOver)) bad.push({ id: r.id, m });
			}
			assert(rows.length === 14 && bad.length === 0, 'マイナスの小窓(5) ' + w + 'px: 14行の小窓で「= −N Pt」を含む後半は1行・前半も1行（折り返すのは矢印の前だけ）・横スクロールなし', bad.slice(0, 3));
			// 今の文字数では 320px でも1行に収まり折り返しが起きないので、計算の行の幅を後半の幅まで狭めて、折り返す位置が矢印の前になることを見る
			await openRow(sp.page, PASS);
			const nar = await sp.page.evaluate(() => {
				const calc = document.querySelector('[data-usd-el="info-pop"]:not([hidden]) [data-usd-el="overlap-calc"]');
				const tail = calc.querySelectorAll('.usd-ovp-nowrap')[1];
				const lines = (el) => new Set(Array.from(el.getClientRects()).map((x) => Math.round(x.top))).size;
				const before = lines(calc.querySelectorAll('.usd-ovp-nowrap')[0]) + lines(tail);
				calc.style.width = Math.ceil(tail.getBoundingClientRect().width + 2 + parseFloat(getComputedStyle(calc).paddingLeft)) + 'px';
				const out = { head: lines(calc.querySelectorAll('.usd-ovp-nowrap')[0]), tail: lines(tail), calcLines: Math.round(calc.getBoundingClientRect().height / parseFloat(getComputedStyle(calc).lineHeight)), before };
				calc.style.width = '';
				return out;
			});
			await closePop(sp.page);
			assert(nar.head === 1 && nar.tail === 1 && nar.calcLines === 2, 'マイナスの小窓(5) ' + w + 'px: 幅を狭めると矢印の前で2行に分かれ、前半・後半はそれぞれ1行のまま', nar);
			assert(jsErrors(sp.errors).length === 0, 'マイナスの小窓(5) ' + w + 'px コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('マイナスの小窓(6) ライト・ダーク: 小窓の文字（カード名を含む）のコントラスト 4.5 以上・カード名は見出しと同じ強調（大きさ・太さ・色。灰色にしない）', async () => {
		for (const theme of ['light', 'dark']) {
			const sp = await openSp({ w: 375, h: 812, theme });
			await openRow(sp.page, PASS);
			const c = await sp.page.evaluate(scanTextContrastInPage, '[data-usd-el="info-pop"]:not([hidden]) [data-usd-el="overlap-info"]');
			const st = await sp.page.evaluate(() => {
				const box = document.querySelector('[data-usd-el="info-pop"]:not([hidden]) [data-usd-el="overlap-info"]');
				const pick = (el) => { const s = getComputedStyle(el); return { size: s.fontSize, weight: s.fontWeight, color: s.color }; };
				return { cards: Array.from(box.querySelectorAll('[data-usd-el="overlap-card"]')).map(pick), head: pick(box.querySelector('[data-usd-el="overlap-head2"]')),
					line: pick(box.querySelector('[data-usd-el="overlap-route"]')),
					// 共有の小窓の段落の余白（margin: 0）に消されないこと: 「②」の見出しの上・合計の行の字下げ・2つ目のカード名の上
					gap: { head2: getComputedStyle(box.querySelector('[data-usd-el="overlap-head2"]')).marginTop, sum: getComputedStyle(box.querySelector('[data-usd-el="overlap-sum"]')).marginLeft,
						next: getComputedStyle(box.querySelectorAll('[data-usd-el="overlap-card"]')[1]).marginTop } };
			});
			assert(st.gap.head2 === '8px' && st.gap.sum === '13px' && st.gap.next === '4px', 'マイナスの小窓(6) ' + theme + ': 「②」の見出しの上 8px・合計の行の字下げ 13px（1字）・2つ目のカード名の上 4px', st.gap);
			await closePop(sp.page);
			assert(c.checked >= 6 && c.bad.length === 0 && c.undecided.length === 0, 'マイナスの小窓(6) ' + theme + ': 小窓の文字のコントラスト 4.5 以上（' + c.checked + '要素）', formatContrast(c.bad).slice(0, 4));
			assert(st.cards.length === 2 && st.cards.every((x) => JSON.stringify(x) === JSON.stringify(st.head)) && st.head.weight === '700',
				'マイナスの小窓(6) ' + theme + ': カード名は「②因子周回で因子化」と同じ大きさ・太さ・色', st);
			await sp.ctx.close();
		}
	});
}
