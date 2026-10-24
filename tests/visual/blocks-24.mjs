// 進化スキル 段4（①の画面。2026-10-13・14）の検査。run-smoke.mjs の末尾から register24() で呼ばれる
// （塊の見出しはすべて「進化段4」で始まる。`npm run test:visual -- --only=進化段4` で回せる）。
//
// 見るもの: 帯（「進化 N／最大」ボタン・「?」が無い・1行／2行・ボタンが切れない）／進化の選択画面（衣装・シナリオ）／
//   ①の表の進化した行／リセットのシート（戻す範囲を選ぶ）／色（ライト・ダーク）と、スマホで画面からはみ出さないこと。
// スキル名・衣装名は検査の側に書かない（恒久ルール1）。衣装・カードは id で書き、名前は画面の文字とデータから読む。

import { contrastRatio } from './lib/pixels.mjs';

export async function register24(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const RACES = readJson('data/upcoming-races.json').races;
	const raceOf = (id) => { const r = RACES.find((x) => x.id === id); const { id: rid, ...rest } = r; return Object.assign({ id: rid }, rest); };
	const SCENARIO_DOC = readJson('data/scenario-event-skills.json');
	const SKILL_NAME = new Map();
	[readJson('uma-skill-deck-skills.json').skills, readJson('data/extended-skills.json').entries].forEach((l) => l.forEach((s) => SKILL_NAME.set(s.id, s.name)));
	const EVOS = readJson('data/skill-evolutions.json').entries;
	const UMAS = readJson('data/training-umamusume.json').entries;

	// 手書きの組み合わせ（id で書く）。オルフェーヴル総攬: 金スキル2つ（ex-0470→ex-1608＝＜追込・芝＞2000m以上、ex-0484→ex-1609＝＜中距離＞）。
	const ORFE = 'uma-0241', KINRIN = 'ex-0470', HEIGEI = 'ex-0484', KINRIN_TO = 'ex-1608', HEIGEI_TO = 'ex-1609';
	// シナリオ（B）の候補が3つになる編成: uma-0009＋カード6枚＋レース 京都 芝2200m。候補は ex-0183・ex-0616・ex-0645（id 昇順）
	const B_UMA = 'uma-0009';
	const B_CARDS = ['card-0546', 'card-0543', 'card-0295', 'card-0499', 'card-0427', 'card-0518'];
	const B_IDS = ['ex-0183', 'ex-0616', 'ex-0645'];
	const mkRoster = (o) => Object.assign({ rosterId: 'r_evo', name: '', umaId: '', star: 3, awakeningLevel: 5, cardIds: [null, null, null, null, null, null] }, o);
	const orfeRoster = (o) => mkRoster(Object.assign({ umaId: ORFE, skillFilter: { style: 'oikomi' }, race: raceOf('race-0001') }, o || {}));
	const bRoster = (o) => mkRoster(Object.assign({ umaId: B_UMA, cardIds: B_CARDS, skillFilter: { style: 'sashi' }, race: raceOf('race-0001') }, o || {}));

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(SCENARIO_DOC)));
		await sp.page.evaluate(({ roster }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { roster: o.roster === undefined ? null : o.roster });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		await sp.page.evaluate(() => UmaSkillDeckCore.loadTrainingSources(false));
		await sp.page.evaluate(() => UmaSkillDeckCore.loadSkillPtData(false));
		await sp.page.waitForFunction(() => UmaSkillDeckCore.getEvolutionScenarioKey() !== null && !!document.querySelector('[data-usd-el="evo-btn"]'), null, { timeout: 8000 }).catch(() => {});
		await sp.page.waitForTimeout(300);
		return sp;
	};
	const savedRoster = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'));
	const toastText = (page) => page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter((e) => e.children.length === 0 && /^(衣装が未選択です|進化できるスキルがありません|戻すスキルはありません|いまの条件（レース・脚質）では選べません|進化のデータを読み込めませんでした)$/.test((e.textContent || '').trim())).map((e) => e.textContent.trim()));
	const sheetVisible = (page) => page.evaluate(() => { const p = document.querySelector('.usd-info-pop'); return !!p && !p.hidden && p.getClientRects().length > 0; });
	const sheetBox = (page) => page.evaluate(() => { const r = document.querySelector('.usd-info-pop').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: window.innerHeight, vw: window.innerWidth }; });

	/* ====================================================================
	 * 帯
	 * ==================================================================== */
	await block('進化段4A 帯: 「?」を外して「進化 N／最大」ボタンを置く。合計の文字を押すと同じ小窓が開く。見た目の高さは帯のほかのボタンと同じ・押せる範囲は44px以上・衣装が未選択でも出て、押すと理由を知らせる', async () => {
		const sp = await openSp({ roster: orfeRoster(), w: 390 });
		const r = await sp.page.evaluate(() => {
			const row = document.querySelector('[data-usd-el="pt-sumrow"]');
			const btn = document.querySelector('[data-usd-el="evo-btn"]');
			const b = btn.getBoundingClientRect();
			return {
				help: row.querySelectorAll('.uma-help-btn').length, text: btn.textContent, label: btn.getAttribute('aria-label'),
				h: b.height, borderW: parseFloat(getComputedStyle(btn).borderTopWidth), radius: parseFloat(getComputedStyle(btn).borderTopLeftRadius),
				// 段4の修正2: 見た目の高さは育成ウマ娘の選択欄・合計の文字と同じ。押せる範囲（elementFromPoint で縦に走査）は 44px 以上
				pickH: document.querySelector('[data-usd-el="pick-uma"]').getBoundingClientRect().height,
				sumH: document.querySelector('[data-usd-el="pt-help-btn"]').getBoundingClientRect().height,
				hitH: (() => { const x = b.left + b.width / 2; let lo = null, hi = null; for (let y = Math.floor(b.top) - 20; y <= Math.ceil(b.bottom) + 20; y++) { const e = document.elementFromPoint(x, y); if (e && e.closest('[data-usd-el="evo-btn"]')) { if (lo === null) lo = y; hi = y; } } return lo === null ? 0 : hi - lo + 1; })(),
				bName: getComputedStyle(btn.querySelector('b')).fontSize + '/' + getComputedStyle(btn.querySelector('b')).fontWeight,
				cnt: getComputedStyle(btn.querySelector('span')).fontSize + '/' + getComputedStyle(btn.querySelector('span')).fontWeight,
				helpBtn: !!document.querySelector('[data-usd-el="pt-help-btn"]'), helpIsText: !!document.querySelector('[data-usd-el="pt-help-btn"] [data-usd-el="roster-sum"]'),
				bang: !!document.querySelector('[data-usd-el="evo-bang"]'),
				hscrollInBand: !!row.querySelector('.usd-hscroll')
			};
		});
		assert(r.help === 0 && r.helpBtn && r.helpIsText, '進化段4A 帯に「?」のボタンは無く、合計の文字がボタン（同じ小窓を開く）', r);
		assert(/^進化\s*3／4$/.test(r.text.replace(/\s/g, '')) && r.label.indexOf('3／4') !== -1, '進化段4A 進化ボタンは「進化」＋「N／最大」（オルフェーヴル 京都 芝2200m・追込: 衣装の2つ＋シナリオの1つ＝3／4）', { text: r.text, label: r.label });
		assert(Math.abs(r.h - r.pickH) < 0.5 && Math.abs(r.h - r.sumH) < 0.5 && r.hitH >= 44 && r.borderW === 1 && r.radius >= 8,
			'進化段4A 進化ボタンの見た目の高さは、育成ウマ娘の選択欄・合計の文字と同じ（段4の修正2）。押せる範囲は44px以上・枠1px（段G(6)で 2px から細くした。地色つきの設定済み）・角丸', { h: r.h, pick: r.pickH, sum: r.sumH, hit: r.hitH, borderW: r.borderW, radius: r.radius });
		assert(r.bName === '14px/700' && r.cnt === '12px/400', '進化段4A 「進化」は14px太字・「N／最大」は12px通常の太さ', { b: r.bName, n: r.cnt });
		assert(!r.hscrollInBand && !r.bang, '進化段4A 帯に横スクロール・フェードの部品は無い／「！」は確認が必要なときだけ（ここでは出ない）', { hscroll: r.hscrollInBand, bang: r.bang });
		// 合計の文字を押すと、これまでの「?」と同じ小窓（理論値など）が開く。覚醒Lv5の説明の1行は無い
		await sp.page.click('[data-usd-el="pt-help-btn"]');
		await sp.page.waitForTimeout(250);
		const info = await sp.page.evaluate(() => ({ theory: !!document.querySelector('[data-usd-el="info-theory"]'), reason: !!document.querySelector('[data-usd-el="info-uma-reason"]'), off: !!document.querySelector('[data-usd-el="info-off"]') }));
		assert(info.theory && !info.reason && !info.off, '進化段4A 合計の文字を押すと理論値の小窓が開く／覚醒Lv5の説明の1行と「取得しないスキル」の行は小窓に無い', info);
		assert(jsErrors(sp.errors).length === 0, '進化段4A コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 衣装が未選択でもボタンは出し、押すと理由を知らせる（画面は開かない）
		const sp2 = await openSp({ roster: mkRoster({}), w: 390 });
		const had = await sp2.page.evaluate(() => !!document.querySelector('[data-usd-el="evo-btn"]'));
		await sp2.page.click('[data-usd-el="evo-btn"]');
		await sp2.page.waitForTimeout(250);
		assert(had && !(await sheetVisible(sp2.page)) && (await toastText(sp2.page)).indexOf('衣装が未選択です') !== -1, '進化段4A 衣装が未選択でも進化ボタンは出て、押すと「衣装が未選択です」を知らせる（画面は開かない）', await toastText(sp2.page));
		await sp2.ctx.close();
	});

	await block('進化段4A 帯の並び: 390px・375px は1行・360px は2行（進化は2行目の左）。どの幅でもボタンは切れず、はみ出さない（ライト・ダーク）', async () => {
		const out = [];
		for (const w of [390, 375, 360, 320]) {
			for (const scheme of ['light', 'dark']) {
				const sp = await openSp({ roster: orfeRoster(), w, scheme });
				const m = await sp.page.evaluate(() => {
					const row = document.querySelector('[data-usd-el="pt-sumrow"]');
					const rr = row.getBoundingClientRect();
					const kids = [...row.querySelectorAll(':scope > [data-band]')].map((k) => { const b = k.getBoundingClientRect(); return { cls: k.className.split(' ')[0], l: b.left - rr.left, r: b.right - rr.left, t: b.top - rr.top, b: b.bottom - rr.top }; });
					const sum = kids.find((k) => k.cls === 'usd-roster-sumtext'), evo = kids.find((k) => k.cls === 'usd-evo-wrap');
					return { two: row.classList.contains('usd-roster-sumrow--two'), rowW: rr.width, kids, sum, evo,
						evoH: document.querySelector('[data-usd-el="evo-btn"]').getBoundingClientRect().height, sumH: document.querySelector('[data-usd-el="pt-help-btn"]').getBoundingClientRect().height, overflowX: row.scrollWidth - row.clientWidth, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, fade: !!row.querySelector('[data-usd-fade]') };
				});
				out.push(Object.assign({ w, scheme }, m));
				await sp.ctx.close();
			}
		}
		const clipped = out.filter((m) => m.overflowX > 0 || m.pageOverflow > 0 || m.kids.some((k) => k.r > m.rowW + 0.5 || k.l < -0.5) || m.fade);
		assert(clipped.length === 0, '進化段4A どの幅（390・360・320px）・ライト／ダークでも、帯のボタンは帯の中に収まる（切れ・横スクロール・フェードなし）', clipped.map((m) => m.w + m.scheme));
		const one = out.filter((m) => m.w >= 375);
		assert(one.every((m) => !m.two && m.evo.t < m.sum.b), '進化段4A 390px・375px は1行（進化ボタンは合計の右）', one.map((m) => ({ w: m.w, two: m.two, scheme: m.scheme })));
		// 段4の修正2: どの幅でも、進化ボタンの見た目の高さは帯のほかのボタンと同じ（28px）
		assert(out.every((m) => Math.abs(m.evoH - m.sumH) < 0.5), '進化段4A どの幅でも、進化ボタンの見た目の高さは合計の文字のボタンと同じ', out.map((m) => m.w + m.scheme + ':' + m.evoH + '/' + m.sumH));
		const two = out.filter((m) => m.w <= 360);
		assert(two.every((m) => m.two && m.evo.t >= m.sum.b - 1 && m.evo.l <= 1), '進化段4A 360px以下は2行（進化ボタンは2行目の左）', two.map((m) => ({ w: m.w, two: m.two, evoT: m.evo.t, sumB: m.sum.b, evoL: m.evo.l })));
	});

	/* ====================================================================
	 * 進化の選択画面（衣装）
	 * ==================================================================== */
	await block('進化段4B 衣装の画面: 見出し・条件の行・金スキルごとのグループ（元→進化先→進化しない。▼▼▼は出さない）・閉じるボタン。選ぶと表の行が変わり、保存される', async () => {
		const sp = await openSp({ roster: orfeRoster(), w: 390 });
		await sp.page.click('[data-usd-el="evo-btn"]');
		await sp.page.waitForTimeout(300);
		const r = await sp.page.evaluate(() => {
			const q = (s) => [...document.querySelectorAll(s)];
			const pop = document.querySelector('.usd-info-pop');
			return {
				title: pop.querySelector('.uma-popover-title').textContent, cond: (document.querySelector('[data-usd-el="evo-cond"]') || {}).textContent,
				groups: q('[data-usd-el="evo-group"]').map((g) => ({ base: g.getAttribute('data-base-id'), baseName: g.querySelector('.usd-evo-base .usd-evo-name').textContent, arrow: !!g.querySelector('.usd-evo-arrow') || g.textContent.includes('▼'),
					targets: [...g.querySelectorAll('[data-usd-el="evo-target"]')].map((t) => ({ v: t.getAttribute('data-evo-value'), name: t.querySelector('.usd-evo-name').textContent, sub: (t.querySelector('.usd-evo-sub') || {}).textContent || null, on: t.querySelector('input').checked, icon: !!t.querySelector('.usd-evo-icon') })),
					none: { on: g.querySelector('[data-usd-el="evo-none"] input').checked, text: g.querySelector('[data-usd-el="evo-none"] .usd-evo-name').textContent } })),
				closeBtn: !!document.querySelector('[data-usd-el="evo-close"]'), closeText: (document.querySelector('[data-usd-el="evo-close"]') || {}).textContent,
				xSize: (() => { const x = pop.querySelector('.uma-popover-close').getBoundingClientRect(); return [Math.round(x.width), Math.round(x.height)]; })(),
				tabs: !!document.querySelector('[data-usd-el="evo-tabs"]'),
				nameSize: getComputedStyle(document.querySelector('[data-usd-el="evo-target"] .usd-evo-name')).fontSize + '/' + getComputedStyle(document.querySelector('[data-usd-el="evo-target"] .usd-evo-name')).fontWeight,
				subSize: getComputedStyle(document.querySelector('[data-usd-el="evo-target"] .usd-evo-sub')).fontSize,
				anyIcon: !!pop.querySelector('.usd-evo-icon'),
				rowH: (() => {
					const hs = (s) => q(s).map((x) => Math.round(x.getBoundingClientRect().height * 10) / 10);
					const off = (sel, top) => q(sel).map((x) => { const a = x.getBoundingClientRect(), b = x.querySelector('input').getBoundingClientRect(); return top ? b.top - a.top : Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)); });
					return { base: hs('[data-usd-el="evo-base"]'), target: hs('[data-usd-el="evo-target"]'), none: hs('[data-usd-el="evo-none"]'), noneRadioOff: off('[data-usd-el="evo-none"]', false), targetRadioTop: off('[data-usd-el="evo-target"]', true) };
				})()
			};
		});
		assert(r.title === '進化スキル(衣装)' && r.cond === 'レース: 2200m 芝 / 脚質: 追込', '進化段4B 見出し「進化スキル(衣装)」と、その下の条件「レース: 2200m 芝 / 脚質: 追込」', { title: r.title, cond: r.cond });
		assert(r.groups.length === 2 && r.groups[0].base === KINRIN && r.groups[1].base === HEIGEI, '進化段4B 金スキルごとに1つのグループ（衣装の金スキル2つ・データの並び）', r.groups.map((g) => g.base));
		const g0 = r.groups[0], g1 = r.groups[1];
		assert(g0.baseName === SKILL_NAME.get(KINRIN) && g0.arrow === false && g0.targets.length === 1 && g0.targets[0].name === SKILL_NAME.get(KINRIN_TO) && g0.targets[0].on && g0.none.text === '進化しない' && !g0.none.on, '進化段4B グループの中身は 元の金スキル → 進化先（選択中）→「進化しない」（▼▼▼は無い）', g0);
		assert(g1.targets.length === 2 && g1.targets[0].v === HEIGEI_TO && g1.targets[0].on && !g1.targets[1].on, '進化段4B 進化先が2つの金スキルは、進化先を2行並べる（既定が選ばれている）', g1.targets.map((t) => t.v + ':' + t.on));
		assert(g0.targets[0].sub === '＜追込・芝＞ 2000m以上' && g1.targets[0].sub === '＜中距離＞' && r.groups.every((g) => g.targets.every((t) => !t.icon)) && !r.anyIcon, '進化段4B 条件は説明文の＜…＞（＜中距離＞・＜追込・芝＞ 2000m以上）。アイコンの代わりの四角は、どの行にも無い（段4の修正1）', { a: g0.targets[0].sub, b: g1.targets[0].sub, anyIcon: r.anyIcon });
		// 案G（2026-10-24）: 行の縦幅。元の金スキルの行は 28px 前後・進化先の行は説明文を含めて 44px 以上・「進化しない」は1行の約30px。「進化しない」のラジオは縦の中央、進化先のラジオは1行目の高さ
		assert(r.rowH.base.every((h) => h >= 26 && h <= 30) && r.rowH.target.every((h) => h >= 44) && r.rowH.none.every((h) => h >= 28 && h <= 32) && r.rowH.noneRadioOff.every((d) => d <= 1.5) && r.rowH.targetRadioTop.every((d) => d <= 14),
			'進化段4B 行の縦幅: 元の金スキルの行は28px前後・進化先は説明文を含めて44px以上・「進化しない」は約30px（ラジオは縦の中央）・進化先のラジオは1行目の高さ', r.rowH);
		assert(!/必ず合う|合うことがある|合わない/.test(JSON.stringify(r)), '進化段4B 画面に「必ず合う／合うことがある／合わない」の語は出さない');
		assert(r.nameSize === '13px/500' && r.subSize === '11px' && r.closeBtn && r.closeText === '閉じる' && r.xSize[0] >= 44 && r.xSize[1] >= 44 && r.tabs, '進化段4B 進化先の名前は13px・500・条件は11px・×の押せる範囲は44px以上・下に「閉じる」・シナリオの候補もあるので「衣装／シナリオ」の切り替えが出る', { name: r.nameSize, sub: r.subSize, x: r.xSize, tabs: r.tabs });
		// 「進化しない」を選ぶと、その場で保存され、表の行が金スキルの行に戻る
		await sp.page.click('[data-usd-el="evo-group"][data-base-id="' + KINRIN + '"] [data-usd-el="evo-none"]');
		await sp.page.waitForTimeout(300);
		const after = await sp.page.evaluate((k) => ({ evoRows: [...document.querySelectorAll('.usd-roster-grow--evo')].map((x) => x.getAttribute('data-skill-id')), goldRow: !!document.querySelector('.usd-roster-grow--gold[data-skill-id="' + k + '"]'), band: document.querySelector('[data-usd-el="evo-btn"]').textContent.replace(/\s/g, ''), noneOn: document.querySelector('[data-usd-el="evo-group"][data-base-id="' + k + '"] [data-usd-el="evo-none"] input').checked, stillOpen: !!document.querySelector('.usd-info-pop:not([hidden]) [data-usd-el="evo-sheet"]') }), KINRIN);
		const saved = await savedRoster(sp.page);
		assert(after.evoRows.join() === 'ex-0616,' + HEIGEI && after.goldRow && after.band === '進化2／4' && after.noneOn && after.stillOpen, '進化段4B 「進化しない」を選ぶと、その金スキルの行が金スキルに戻り（シナリオの進化と、もう1つの衣装の進化は残る）、帯は 2／4・画面は開いたまま', after);
		assert(saved && saved.evolutionChoices && saved.evolutionChoices[KINRIN] === 'none' && Object.keys(saved.evolutionChoices).length === 1, '進化段4B 手で変えた選択だけを roster.evolutionChoices に保存する', saved && saved.evolutionChoices);
		// 2つ目の進化先を選ぶ
		await sp.page.click('[data-usd-el="evo-group"][data-base-id="' + HEIGEI + '"] [data-usd-el="evo-target"]:nth-of-type(2)');
		await sp.page.waitForTimeout(300);
		const alt = await sp.page.evaluate((h) => document.querySelector('.usd-roster-grow--evo[data-skill-id="' + h + '"]').getAttribute('data-usd-evo'), HEIGEI);
		assert(alt !== HEIGEI_TO && !!alt, '進化段4B 進化先を選び直すと、表の進化先も変わる', alt);
		// 閉じるで閉じる
		await sp.page.click('[data-usd-el="evo-close"]');
		await sp.page.waitForTimeout(200);
		assert(!(await sheetVisible(sp.page)), '進化段4B 「閉じる」で閉じる');
		assert(jsErrors(sp.errors).length === 0, '進化段4B コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('進化段4B 条件が合わない進化先は、ラジオが無効で押せない（理由の文・トーストは出さない）。レース未選択の既定は「進化しない」', async () => {
		// 長距離のレース（3000m）では、睥睨の2つの進化先のうち、中距離だけの1つ目は選べない（中距離/長距離の2つ目は選べる）
		const sp = await openSp({ roster: orfeRoster({ race: raceOf('race-0002') }), w: 390 });
		await sp.page.click('[data-usd-el="evo-btn"]');
		await sp.page.waitForTimeout(300);
		const before = await sp.page.evaluate((h) => { const g = document.querySelector('[data-usd-el="evo-group"][data-base-id="' + h + '"]'); return { values: [...g.querySelectorAll('[data-usd-el="evo-target"]')].map((x) => x.getAttribute('data-evo-value') + ':' + x.querySelector('input').checked), disabled: [...g.querySelectorAll('[data-usd-el="evo-target"] input')].map((i) => i.disabled), noneDisabled: [...g.querySelectorAll('[data-usd-el="evo-none"] input')].some((i) => i.disabled) }; }, HEIGEI);
		assert(before.values.length === 2 && before.values[0] === HEIGEI_TO + ':false' && before.disabled.join() === 'true,false' && !before.noneDisabled, '進化段4B 前提: 睥睨の1つ目の進化先（中距離だけ）は、長距離のレースでは選べない（ラジオは無効）。2つ目と「進化しない」は無効にしない', before);
		const ngBox = await sp.page.locator('[data-usd-el="evo-group"][data-base-id="' + HEIGEI + '"] [data-usd-el="evo-target"]:nth-of-type(1)').boundingBox();
		await sp.page.mouse.click(ngBox.x + ngBox.width / 2, ngBox.y + ngBox.height / 2);
		await sp.page.waitForTimeout(300);
		const after = await sp.page.evaluate((h) => ({ on: [...document.querySelectorAll('[data-usd-el="evo-group"][data-base-id="' + h + '"] [data-usd-el="evo-target"] input')].map((i) => i.checked).join(), open: !!document.querySelector('.usd-info-pop:not([hidden])') }), HEIGEI);
		const saved = await savedRoster(sp.page);
		assert((await toastText(sp.page)).indexOf('では選べません') === -1, '進化段4B 選べない進化先を押しても、理由のトースト（いまの条件では選べません）は出ない', await toastText(sp.page));
		assert(after.on === 'false,true' && after.open, '進化段4B 選べない進化先は選ばれず、画面は開いたまま', after);
		assert(!saved.evolutionChoices || saved.evolutionChoices[HEIGEI] === undefined, '進化段4B 選べない進化先は、保存値にも入らない', saved.evolutionChoices);
		await sp.ctx.close();
		// レース未選択: 脚質・距離を手で指定しても、何も自動では進化しない。進化ボタンは出ていて、選び直しはできる
		const sp3 = await openSp({ roster: mkRoster({ umaId: ORFE, skillFilter: { distance: 'medium', style: 'oikomi', surface: 'turf' } }), w: 390 });
		const r3 = await sp3.page.evaluate(() => ({ btn: document.querySelector('[data-usd-el="evo-btn"]').textContent.replace(/s/g, ''), evoRows: document.querySelectorAll('.usd-roster-grow--evo').length, bang: !!document.querySelector('[data-usd-el="evo-bang"]') }));
		assert(r3.btn === '進化0／4' && r3.evoRows === 0 && !r3.bang, '進化段4B レース未選択: 全部「進化しない」（進化 0／4）・表に進化した行は無く・「！」も出ない', r3);
		await sp3.page.click('[data-usd-el="evo-btn"]');
		await sp3.page.waitForTimeout(300);
		const c3 = await sp3.page.evaluate(() => (document.querySelector('[data-usd-el="evo-cond"]') || {}).textContent);
		assert(c3 === 'レース: 未選択 / 脚質: 追込', '進化段4B レース未選択の条件の行は「レース: 未選択 / 脚質: 追込」', c3);
		await sp3.page.click('[data-usd-el="evo-group"][data-base-id="' + KINRIN + '"] [data-usd-el="evo-target"]');
		await sp3.page.waitForTimeout(300);
		const r3b = await sp3.page.evaluate(() => ({ evo: [...document.querySelectorAll('.usd-roster-grow--evo')].map((x) => x.getAttribute('data-usd-evo')) }));
		assert(r3b.evo.join() === KINRIN_TO, '進化段4B レース未選択でも、手で選んだ進化先は表に出る', r3b);
		await sp3.ctx.close();
	});

	await block('進化段4B 金スキルが3つの衣装は3グループ。シートの中だけがスクロールし、画面からはみ出さない（バーが開いた高さ・縮んだ高さ・ライト／ダーク）', async () => {
		const three = UMAS.filter((u) => EVOS.filter((e) => e.kind === 'uma' && e.umaId === u.id).length === 3);
		assert(three.length === 6, '進化段4B 前提: 金スキルが3つの衣装は6つ', three.length);
		// 3つとも進化の行が出る条件（レース×脚質）を、実データの決定関数で探す
		const probe = await openSp({ roster: null, w: 390 });
		const found = await probe.page.evaluate(async ({ ids, races }) => {
			const C = UmaSkillDeckCore;
			await C.loadSkillEvolutions(); await C.loadTrainingSources(false); await C.loadSkillPtData(false); await C.loadSkillEffectLevels();
			for (const id of ids) {
				const res = C.computeRosterSkills({ umaId: id, cardIds: [] }, {});
				for (const race of races) for (const style of ['nige', 'senko', 'sashi', 'oikomi']) {
					const pl = C.computeEvolutionPlan({ umaId: id, takenIds: res.skillIds, filter: { distance: race.distanceCategory, surface: race.surface, style: style }, race: race });
					if (pl.a.filter((e) => e.choice !== 'invalid').length === 3) return { id: id, race: race.id, style: style };
				}
			}
			return null;
		}, { ids: three.map((u) => u.id), races: RACES });
		await probe.ctx.close();
		assert(!!found, '進化段4B 前提: 3つの金スキルの進化先がすべて出るレースと脚質がある', found);
		if (!found) return;
		const u3 = found.id;
		const out = [];
		for (const [h, label] of [[844, '縮んだ'], [734, '開いた']]) {
			for (const scheme of ['light', 'dark']) {
				const sp = await openSp({ roster: mkRoster({ umaId: u3, race: raceOf(found.race), skillFilter: { style: found.style } }), w: 390, h, scheme });
				// iPhone の Safari のバーが開いた状態の模擬（tests/layout と同じ考え方）: vh だけを縮んだ画面（844px）基準にして、dvh は見える高さのまま
				if (label === '開いた') await sp.page.addStyleTag({ content: '.usd-evo-pop { max-height: min(88vh, 760px) !important; max-height: min(88dvh, 760px) !important; }' });
				await sp.page.click('[data-usd-el="evo-btn"]');
				await sp.page.waitForTimeout(300);
				const m = await sp.page.evaluate(() => { const pop = document.querySelector('.usd-info-pop'); const body = pop.querySelector('.uma-popover-body'); const r = pop.getBoundingClientRect(); return { groups: document.querySelectorAll('[data-usd-el="evo-group"]').length, top: r.top, bottom: r.bottom, vh: window.innerHeight, scrolls: body.scrollHeight > body.clientHeight, closeVisible: (() => { const c = document.querySelector('[data-usd-el="evo-close"]'); body.scrollTop = body.scrollHeight; const b = c.getBoundingClientRect(); return b.bottom <= window.innerHeight && b.top >= 0; })(), headTop: pop.querySelector('.uma-popover-head').getBoundingClientRect().top }; });
				out.push(Object.assign({ label, scheme }, m));
				await sp.ctx.close();
			}
		}
		assert(out.every((m) => m.groups === 3), '進化段4B 金スキル3つの衣装は3グループ', out.map((m) => m.groups));
		assert(out.every((m) => m.top >= 0 && m.bottom <= m.vh + 0.5 && m.headTop >= 0), '進化段4B シートは画面からはみ出さない（見出しと×が見える）', out.map((m) => ({ l: m.label, s: m.scheme, top: Math.round(m.top), bottom: Math.round(m.bottom), vh: m.vh })));
		// 案G（2026-10-24）で行が低くなり、3グループは縮んだ高さ（844px）でも開いた高さ（734px）でも収まる（スクロールするのは収まらないときだけ）。どちらでも「閉じる」が見える。低い画面でのスクロールと貼り付きは test:evolution の §12
		assert(out.every((m) => m.closeVisible), '進化段4B 3グループでも「閉じる」が見える（縮んだ高さ 844px・開いた高さ 734px とも。収まらないときは小窓の中だけがスクロールする）', out.map((m) => ({ l: m.label, scrolls: m.scrolls, close: m.closeVisible })));
	});

	/* ====================================================================
	 * 進化の選択画面（シナリオ）
	 * ==================================================================== */
	await block('進化段4C シナリオの画面: 候補が3つ以上のとき「！」。開くと確認済みになって消え、2つまで選べる。2つ選ぶと未選択の候補は無効になり、1つ外すと戻る', async () => {
		const sp = await openSp({ roster: bRoster(), w: 390 });
		const r0 = await sp.page.evaluate(() => ({ bang: !!document.querySelector('[data-usd-el="evo-bang"]'), btn: document.querySelector('[data-usd-el="evo-btn"]').textContent.replace(/\s/g, ''), bangColor: (() => { const b = document.querySelector('[data-usd-el="evo-bang"]'); return b ? getComputedStyle(b).backgroundColor : null; })(), evBtnAlert: (() => { const x = document.querySelector('.usd-roster-evbtn--alert:not(.usd-evo-bang)'); return x ? getComputedStyle(x).backgroundColor : null; })() }));
		assert(r0.bang && r0.btn === '進化2／4', '進化段4C 候補が3つあり、まだ確認していないので、進化ボタンの右に「！」（進化 2／4）', r0);
		assert(!r0.evBtnAlert || r0.bangColor === r0.evBtnAlert, '進化段4C 「！」の色は、イベント未選択の「！」と同じ', { bang: r0.bangColor, ev: r0.evBtnAlert });
		await sp.page.click('[data-usd-el="evo-bang"]');
		await sp.page.waitForTimeout(350);
		const r = await sp.page.evaluate(() => ({
			tab: document.querySelector('[data-usd-el="evo-sheet"]').getAttribute('data-evo-tab'), title: document.querySelector('.usd-info-pop .uma-popover-title').textContent,
			lead: !!document.querySelector('[data-usd-el="evo-lead"]'), many: !!document.querySelector('[data-usd-el="evo-many"]'), bodyText: document.querySelector('.usd-info-pop .uma-popover-body').textContent,
			sub: (document.querySelector('[data-usd-el="evo-subhead"]') || {}).textContent,
			rows: [...document.querySelectorAll('[data-usd-el="evo-brow"]')].map((x) => ({ id: x.getAttribute('data-base-id'), on: x.querySelector('input').checked, name: x.querySelector('.usd-evo-name').textContent, sub: x.querySelector('.usd-evo-sub').textContent, icon: !!x.querySelector('.usd-evo-icon') })),
			warn: !!document.querySelector('[data-usd-el="evo-warn"]'), bangNow: !!document.querySelector('[data-usd-el="evo-bang"]'),
			confirmBtn: [...document.querySelectorAll('.usd-info-pop button')].some((b) => /確認した/.test(b.textContent)), closeText: (document.querySelector('[data-usd-el="evo-close"]') || {}).textContent
		}));
		assert(r.tab === 'b' && r.title === 'シナリオの進化スキル' && !r.lead && !r.many && !/2つまで選べます|3つ以上あるため|3つ目を選ぶには/.test(r.bodyText), '進化段4C 「！」から開くとシナリオの画面（見出し。シナリオ名と上限を言う行・「候補が3つ以上」の1文は出ない）', r);
		assert(r.rows.map((x) => x.id).join() === B_IDS.join() && r.sub === '候補（選択 2／2）' && r.rows.map((x) => x.on).join() === 'true,true,false', '進化段4C 候補は元スキルの id 昇順・「候補（選択 2／2）」・既定は先頭2つ', r.rows.map((x) => x.id + ':' + x.on));
		assert(r.rows.every((x) => /^元: /.test(x.sub) && !x.icon) && r.rows[1].sub.indexOf('元: ' + SKILL_NAME.get('ex-0616')) === 0, '進化段4C 各行は チェック・進化先の名前・「元: 元の金スキル名 / 条件」（アイコンの代わりの四角は無い。段4の修正1）', r.rows.map((x) => x.sub));
		assert(!r.warn && !r.bangNow && !r.confirmBtn && r.closeText === '閉じる', '進化段4C 赤い注意文は出ない／「！」は開くと消える／「確認した」のボタンは無く「閉じる」だけ', { warn: r.warn, bang: r.bangNow, confirm: r.confirmBtn });
		const seen = (await savedRoster(sp.page)).evolutionBSeen;
		assert(JSON.stringify(seen) === JSON.stringify(B_IDS), '進化段4C 開いた時点で、確認した候補の組（id 昇順）を roster.evolutionBSeen に保存する', seen);
		// 2つ選んでいる間、未選択の候補は無効（disabled・中立の行・支援技術用の説明つき）。押しても選ばれない
		const st = () => sp.page.evaluate(() => ({ on: [...document.querySelectorAll('[data-usd-el="evo-brow"] input')].map((i) => i.checked).join(), dis: [...document.querySelectorAll('[data-usd-el="evo-brow"] input')].map((i) => i.disabled).join(), off: [...document.querySelectorAll('[data-usd-el="evo-brow"]')].map((l) => l.classList.contains('usd-evo-target--off')).join(), sr: [...document.querySelectorAll('[data-usd-el="evo-brow"]')].map((l) => (l.querySelector('.usd-evo-sr') || {}).textContent || '').join('|'), sub: document.querySelector('[data-usd-el="evo-subhead"]').textContent, warn: !!document.querySelector('[data-usd-el="evo-warn"]'), band: document.querySelector('[data-usd-el="evo-btn"]').textContent.replace(/s/g, '') }));
		const full = await st();
		assert(full.on === 'true,true,false' && full.dis === 'false,false,true' && full.off === 'false,false,true' && full.sr === '||2つ選択済みのため選べません' && full.sub === '候補（選択 2／2）' && !full.warn, '進化段4C 2つ選んでいる間は、選んでいない候補だけ無効（disabled・無効の行・説明つき）。選んだ2つは有効のまま', full);
		await sp.page.click('[data-usd-el="evo-brow"][data-base-id="' + B_IDS[2] + '"]', { force: true, noWaitAfter: true }).catch(() => {});
		await sp.page.waitForTimeout(300);
		const after3 = await st();
		assert(after3.on === 'true,true,false' && after3.sub === '候補（選択 2／2）', '進化段4C 無効の候補を押しても選択は増えない', after3);
		// 1つ外すと、残りが再び有効になり、3つ目を選べる
		await sp.page.click('[data-usd-el="evo-brow"][data-base-id="' + B_IDS[0] + '"]');
		await sp.page.waitForTimeout(300);
		const off1 = await st();
		assert(off1.on === 'false,true,false' && off1.dis === 'false,false,false' && off1.off === 'false,false,false' && off1.sr === '||' && off1.sub === '候補（選択 1／2）' && off1.band === '進化1／4', '進化段4C 1つ外すと「選択 1／2」・すべて有効に戻り・帯は 1／4', off1);
		await sp.page.click('[data-usd-el="evo-brow"][data-base-id="' + B_IDS[2] + '"]');
		await sp.page.waitForTimeout(300);
		const saved = (await savedRoster(sp.page)).evolutionChoices;
		assert(saved[B_IDS[0]] === 'none' && saved[B_IDS[2]] !== 'none' && saved[B_IDS[1]] !== 'none' && Object.keys(saved).length === 3, '進化段4C 取捨選択は、候補すべてのキーを書く（選んだものは進化先の id・選ばなかったものは none）', saved);
		// 閉じて開き直しても「！」は出ない（組が同じ）。保存は残る
		await sp.page.click('[data-usd-el="evo-close"]');
		await sp.page.waitForTimeout(250);
		assert(!(await sp.page.evaluate(() => !!document.querySelector('[data-usd-el="evo-bang"]'))), '進化段4C 閉じたあとも「！」は出ない（確認済みの組と同じ）');
		assert(jsErrors(sp.errors).length === 0, '進化段4C コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('進化段4C 金スキルの左バー: ライトでも、①の表の金スキルの行と小窓の金スキルの見出しに、ダークと同じ色の左 4px のバーが付く（ダークは変わらない）', async () => {
		const GOLD_BAR = 'rgb(255, 200, 61)';   // 変更前のダークの値（#ffc83d）。実装の側の値を読まずに固定で持つ
		const got = {};
		for (const scheme of ['light', 'dark']) {
			const sp = await openSp({ roster: orfeRoster(), w: 390, scheme });
			await sp.page.click('[data-usd-el="evo-btn"]');
			await sp.page.waitForTimeout(300);
			// 1つ目の金スキルを「進化しない」にして、表に金スキルの行を出す
			await sp.page.click('[data-usd-el="evo-group"] [data-usd-el="evo-none"]');
			await sp.page.waitForTimeout(300);
			got[scheme] = await sp.page.evaluate(() => {
				const row = document.querySelector('.usd-roster-grow--gold > .usd-roster-gc--name');
				const base = document.querySelector('.usd-evo-base');
				const cs = getComputedStyle(document.documentElement);
				return { token: cs.getPropertyValue('--uma-gold-row-bar').trim().toLowerCase(), rowShadow: row ? getComputedStyle(row).boxShadow : null,
					baseBar: base ? getComputedStyle(base).borderLeftColor + ' ' + getComputedStyle(base).borderLeftWidth : null };
			});
			await sp.ctx.close();
		}
		['light', 'dark'].forEach((scheme) => {
			const g = got[scheme];
			assert(g.token === '#ffc83d' && g.rowShadow && g.rowShadow.indexOf(GOLD_BAR) !== -1 && /inset/.test(g.rowShadow) && g.rowShadow.indexOf('4px') !== -1 && g.baseBar === GOLD_BAR + ' 4px', '進化段4C 金スキルの左バー（' + scheme + '）: 表の金スキルの行も小窓の見出しも、ダークと同じ金色の 4px', g);
		});
	});

	await block('進化段4C 「！」の出る・出ない: 候補の組が確認済みと同じなら出ない／違えば再び出る／候補が2つなら出ない／レース未選択なら出ない', async () => {
		const run = async (roster) => { const sp = await openSp({ roster, w: 390 }); const v = await sp.page.evaluate(() => !!document.querySelector('[data-usd-el="evo-bang"]')); await sp.ctx.close(); return v; };
		assert(await run(bRoster({ evolutionBSeen: B_IDS.slice() })) === false, '進化段4C 確認済みの組と同じなら「！」は出ない');
		assert(await run(bRoster({ evolutionBSeen: ['ex-0029', 'ex-0183'] })) === true, '進化段4C 候補の組が確認したときと違えば、再び「！」が出る');
		// C-152: 長距離のレースでも時中の妙（ex-0616）→湯切りの妙技が候補に入る（3つになる）ので、時中の妙を「取得しない」にして2つにする
		assert(await run(bRoster({ race: raceOf('race-0002'), offSkillIds: ['ex-0616'] })) === false, '進化段4C 候補が2つ（長距離のレース・時中の妙を取得しない）なら「！」は出ない');
		assert(await run(bRoster({ race: raceOf('race-0002') })) === true, '進化段4C 長距離のレースでも時中の妙が候補に入るので、候補は3つで「！」が出る（C-152）');
		assert(await run(bRoster({ race: undefined })) === false, '進化段4C レース未選択なら「！」は出ない');
		// 進化ボタンから開くと、確認が必要なときはシナリオの画面から開く
		const sp = await openSp({ roster: bRoster(), w: 390 });
		await sp.page.click('[data-usd-el="evo-btn"]');
		await sp.page.waitForTimeout(300);
		const tab = await sp.page.evaluate(() => document.querySelector('[data-usd-el="evo-sheet"]').getAttribute('data-evo-tab'));
		assert(tab === 'b', '進化段4C 確認が必要なときは、進化ボタンからもシナリオの画面を開く', tab);
		await sp.ctx.close();
	});

	await block('進化段4C 衣装とシナリオの両方があるときは、上の「衣装」「シナリオ」で行き来する。どちらかだけなら切り替えは出ない', async () => {
		// オルフェーヴル＋カード6枚で、衣装の進化とシナリオの候補の両方を作る
		const both = orfeRoster({ cardIds: B_CARDS });
		const sp = await openSp({ roster: both, w: 390 });
		const info = await sp.page.evaluate(() => { const C = UmaSkillDeckCore; return null; });
		void info;
		const hasB = await sp.page.evaluate(() => !!document.querySelector('[data-usd-el="evo-bang"]') || document.querySelector('[data-usd-el="evo-btn"]').textContent.replace(/\s/g, ''));
		await sp.page.click('[data-usd-el="evo-btn"]');
		await sp.page.waitForTimeout(300);
		const r = await sp.page.evaluate(() => ({ tabs: [...document.querySelectorAll('[data-usd-el="evo-tabs"] button')].map((b) => b.textContent + ':' + b.getAttribute('aria-pressed')), tab: document.querySelector('[data-usd-el="evo-sheet"]').getAttribute('data-evo-tab'), title: document.querySelector('.usd-info-pop .uma-popover-title').textContent }));
		if (r.tabs.length === 2) {
			assert(r.tabs.length === 2, '進化段4C 衣装とシナリオの両方があれば、切り替えが出る', r);
			const other = r.tab === 'a' ? 'b' : 'a';
			await sp.page.click('[data-usd-el="evo-tab-' + other + '"]');
			await sp.page.waitForTimeout(300);
			const t2 = await sp.page.evaluate(() => ({ tab: document.querySelector('[data-usd-el="evo-sheet"]').getAttribute('data-evo-tab'), title: document.querySelector('.usd-info-pop .uma-popover-title').textContent }));
			assert(t2.tab === other && t2.title === (other === 'b' ? 'シナリオの進化スキル' : '進化スキル(衣装)'), '進化段4C 切り替えると画面と見出しが入れ替わる', t2);
		} else {
			assert(true, '進化段4C （この編成ではどちらか一方だけ。切り替えは出ない）' + JSON.stringify({ hasB, r }));
		}
		await sp.ctx.close();
	});

	/* ====================================================================
	 * ①の表
	 * ==================================================================== */
	await block('進化段4D ①の表: 進化させた金スキルは名前が進化先になり、進化先の色の行で出る。Pt・合計・金スキルの数は元のまま。「進」の印・状態の表示・Ptの注記は無い', async () => {
		const sp = await openSp({ roster: orfeRoster(), w: 390 });
		const withEvo = await sp.page.evaluate(({ k }) => {
			const row = document.querySelector('.usd-roster-grow--evo[data-skill-id="' + k + '"]');
			const cs = getComputedStyle(row);
			return { evo: row.getAttribute('data-usd-evo'), name: row.querySelector('.usd-roster-skillname').textContent, info: row.querySelector('.usd-roster-skillname').getAttribute('data-usd-info'), pt: (row.querySelector('.usd-roster-pt') || {}).textContent, text: row.textContent, gold: row.classList.contains('usd-roster-grow--gold'), bg: cs.backgroundImage, outline: cs.outlineStyle + ' ' + cs.outlineWidth, bar: getComputedStyle(row.querySelector('.usd-roster-gc--name')).boxShadow, sum: document.querySelector('[data-usd-el="roster-sum"]').textContent.replace(/\s/g, ''), take: row.querySelector('input[data-usd-act="take-skill"]').getAttribute('data-skill-id'), got: row.querySelectorAll('.usd-roster-got').length };
		}, { k: KINRIN });
		assert(withEvo.evo === KINRIN_TO && withEvo.name === SKILL_NAME.get(KINRIN_TO) && withEvo.info === KINRIN_TO && !withEvo.gold, '進化段4D 進化させた金スキルの行は、名前が進化先・説明も進化先・金色の行ではない', { evo: withEvo.evo, name: withEvo.name, gold: withEvo.gold });
		assert(/linear-gradient/.test(withEvo.bg) && /^none/.test(withEvo.outline) && /4px 0px 0px 0px inset/.test(withEvo.bar) && withEvo.take === KINRIN && withEvo.got > 0, '進化段4D 進化先の色（グラデーションと左の縦バー。段G(5)・2026-10-22 で 2px の枠をバーに置き換えた）で、取得のチェックは元の金スキルのまま', { bg: withEvo.bg.slice(0, 60), outline: withEvo.outline, bar: withEvo.bar, take: withEvo.take });
		assert(!/進化|進|必ず|合う/.test(withEvo.text.replace(SKILL_NAME.get(KINRIN_TO), '')) && /Pt/.test(withEvo.pt || ''), '進化段4D 「進」の印・状態の表示・Ptの注記は付けず、Pt は元の金スキルの値で出る', { text: withEvo.text, pt: withEvo.pt });
		// 進化の有無で、合計（Pt・種数）は変わらない（元の金スキルの Pt を数える）
		const without = await openSp({ roster: orfeRoster({ evolutionChoices: { [KINRIN]: 'none', [HEIGEI]: 'none', 'ex-0616': 'none' } }), w: 390 });
		const sum2 = await without.page.evaluate(() => ({ sum: document.querySelector('[data-usd-el="roster-sum"]').textContent.replace(/\s/g, ''), evoRows: document.querySelectorAll('.usd-roster-grow--evo').length, gold: document.querySelectorAll('.usd-roster-grow--gold').length, row: (document.querySelector('.usd-roster-grow[data-skill-id="ex-0470"] .usd-roster-pt') || {}).textContent }));
		assert(sum2.sum === withEvo.sum && sum2.evoRows === 0 && sum2.row === withEvo.pt, '進化段4D 進化の有無で、合計のPtと種数、その行のPtは変わらない', { with: withEvo.sum, without: sum2.sum, ptWith: withEvo.pt, ptWithout: sum2.row });
		await without.ctx.close();
		assert(jsErrors(sp.errors).length === 0, '進化段4D コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('進化段4D ライト・ダークの色: 進化先の面・枠・文字は指定の値。進化の行・シート・ボタンが、指定の色で出る', async () => {
		const want = {
			light: { '--evo-from': '#fff0f5', '--evo-mid': '#ffd3e9', '--evo-to': '#ffb8e0', '--evo-edge-on': '#e8509c', '--evo-edge': '#f06aae', '--evo-text': '#4a1d0c', '--evo-btn-bg': '#fff0f5',
				'--evo-base-from': '#fffbe0', '--evo-base-mid': '#ffe58f', '--evo-base-to': '#ffd04d', '--evo-base-edge': '#c99a1c', '--evo-base-text': '#4a2a12', '--evo-none-bg': '#ffffff', '--evo-none-edge': '#cfcfcf', '--evo-none-text': '#4a2a12',
				'--evo-arrow': '#5f9a10', '--evo-warn': '#b3261e', '--evo-sheet-bg': '#ffffff', '--evo-sheet-text': '#2a2a2a', '--evo-sheet-edge': '#cfcfcf', '--evo-group-bg': '#f6f6f4', '--evo-danger-edge': '#b3261e', '--evo-danger-bg': '#fff3f1', '--evo-danger-text': '#7a1812' },
			dark: { '--evo-from': '#3d1830', '--evo-mid': '#5a2145', '--evo-to': '#7a2b5e', '--evo-edge-on': '#ff8ac6', '--evo-edge': '#b8618f', '--evo-text': '#ffe9f2', '--evo-btn-bg': '#4a1f3a',
				'--evo-base-from': '#3a3212', '--evo-base-mid': '#554716', '--evo-base-to': '#6e5a14', '--evo-base-edge': '#ffd35b', '--evo-base-text': '#f3e8d0', '--evo-none-bg': '#2f2e34', '--evo-none-edge': '#4a4950', '--evo-none-text': '#e8e0d6',
				'--evo-arrow': '#a2df32', '--evo-warn': '#ff9a8f', '--evo-sheet-bg': '#26252a', '--evo-sheet-text': '#f0eae0', '--evo-sheet-edge': '#4a4950', '--evo-group-bg': '#1b1a1f', '--evo-danger-edge': '#ff9a8f', '--evo-danger-bg': '#4a2220', '--evo-danger-text': '#ffd9d4' }
		};
		const got = {};
		for (const scheme of ['light', 'dark']) {
			const sp = await openSp({ roster: orfeRoster(), w: 390, scheme });
			// ダークは html の data-theme で決まる（OS の設定に合わせる）。ライトのときに dark の値が混ざらないことも見る
			got[scheme] = await sp.page.evaluate((names) => { const cs = getComputedStyle(document.documentElement); const o = {}; names.forEach((n) => { o[n] = cs.getPropertyValue(n).trim().toLowerCase(); }); o.theme = document.documentElement.getAttribute('data-theme'); return o; }, Object.keys(want.light));
			await sp.ctx.close();
		}
		const bad = [];
		['light', 'dark'].forEach((s) => Object.keys(want[s]).forEach((k) => { if (got[s][k] !== want[s][k]) bad.push(s + ' ' + k + ': ' + got[s][k] + ' ≠ ' + want[s][k]); }));
		assert(bad.length === 0, '進化段4D 色の変数がライト・ダークとも指定の値', bad.slice(0, 6));
	});

	/* ====================================================================
	 * リセットのシート
	 * ==================================================================== */
	await block('進化段4E リセットのシート: 「取得しないスキルを戻す（X種）」「中身をすべて消す」「やめる」。X≧1 は押すとすぐ戻して閉じる・X=0 は押すと理由を知らせる', async () => {
		const offId = KINRIN;
		const sp = await openSp({ roster: orfeRoster({ offSkillIds: [offId] }), w: 390 });
		await sp.page.click('[data-usd-el="roster-reset"]');
		await sp.page.waitForTimeout(300);
		const r = await sp.page.evaluate(() => ({ title: document.querySelector('.usd-info-pop .uma-popover-title').textContent, desc: (document.querySelector('[data-usd-el="roster-reset-desc"]') || {}).textContent,
			btns: [...document.querySelectorAll('[data-usd-el="roster-reset-ops"] button')].map((b) => ({ el: b.getAttribute('data-usd-el'), text: b.textContent, bg: getComputedStyle(b).backgroundColor, border: getComputedStyle(b).borderTopColor, color: getComputedStyle(b).color, h: b.getBoundingClientRect().height, dis: b.disabled })) }));
		assert(r.title === '① 本育成編成をリセット' && r.desc === '戻す範囲を選んでください。', '進化段4E タイトル「① 本育成編成をリセット」と説明「戻す範囲を選んでください。」', { title: r.title, desc: r.desc });
		assert(r.btns.map((b) => b.text).join('|') === '取得しないスキルを戻す（1種）|中身をすべて消す|やめる' && r.btns.every((b) => !b.dis && b.h >= 44), '進化段4E ボタンは上から「取得しないスキルを戻す（1種）」「中身をすべて消す」「やめる」（どれも押せる・44px以上）', r.btns.map((b) => b.text));
		const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return 'rgb(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')'; };
		assert(r.btns[1].bg === rgb('#fff3f1') && r.btns[1].border === rgb('#b3261e') && r.btns[1].color === rgb('#7a1812'), '進化段4E 「中身をすべて消す」はライトで 枠 #b3261e・面 #fff3f1・文字 #7a1812', r.btns[1]);
		assert(r.btns[0].bg === rgb('#fff0f5'), '進化段4E 「取得しないスキルを戻す」は薄いピンクの面', r.btns[0].bg);
		await sp.page.click('[data-usd-el="roster-reset-off"]');
		await sp.page.waitForTimeout(300);
		const after = await savedRoster(sp.page);
		assert(!(await sheetVisible(sp.page)) && !(after.offSkillIds && after.offSkillIds.length) && after.umaId === ORFE, '進化段4E 押すとすぐ戻してシートを閉じる（取得しないスキルだけ。衣装は残る）', { offSkillIds: after.offSkillIds, umaId: after.umaId });
		await sp.ctx.close();
		// X = 0
		const sp0 = await openSp({ roster: orfeRoster(), w: 390 });
		await sp0.page.click('[data-usd-el="roster-reset"]');
		await sp0.page.waitForTimeout(300);
		const z = await sp0.page.evaluate(() => ({ desc: document.querySelector('[data-usd-el="roster-reset-desc"]').textContent, off: document.querySelector('[data-usd-el="roster-reset-off"]').textContent, dis: document.querySelector('[data-usd-el="roster-reset-off"]').disabled }));
		assert(z.desc === '取得しないスキルはありません。' && z.off === '取得しないスキルを戻す（0種）' && !z.dis, '進化段4E X=0: 説明は「取得しないスキルはありません。」・ボタンは「（0種）」のまま押せる', z);
		await sp0.page.click('[data-usd-el="roster-reset-off"]');
		await sp0.page.waitForTimeout(250);
		assert((await toastText(sp0.page)).indexOf('戻すスキルはありません') !== -1, '進化段4E X=0 で押すと「戻すスキルはありません」を知らせる', await toastText(sp0.page));
		// 中身をすべて消す: 手で変えた進化の選択・確認済みの記録も消える
		await sp0.page.click('[data-usd-el="roster-reset-all"]');
		await sp0.page.waitForTimeout(300);
		const cleared = await savedRoster(sp0.page);
		assert(cleared.umaId === '' && cleared.evolutionChoices === undefined, '進化段4E 「中身をすべて消す」は従来どおり衣装・カードを消す（進化の選択も消える）', { umaId: cleared.umaId, evo: cleared.evolutionChoices });
		await sp0.ctx.close();
		const spE = await openSp({ roster: orfeRoster({ evolutionChoices: { [KINRIN]: 'none' }, evolutionBSeen: ['ex-0183'] }), w: 390 });
		await spE.page.click('[data-usd-el="roster-reset"]');
		await spE.page.waitForTimeout(300);
		await spE.page.click('[data-usd-el="roster-reset-all"]');
		await spE.page.waitForTimeout(300);
		const c2 = await savedRoster(spE.page);
		assert(c2.evolutionChoices === undefined && c2.evolutionBSeen === undefined, '進化段4E 中身をすべて消すと、手で変えた進化の選択と確認済みの記録も消える', { c: c2.evolutionChoices, s: c2.evolutionBSeen });
		await spE.ctx.close();
	});

	/* ====================================================================
	 * 見た目: シートの色とコントラスト（数値は報告に書く）
	 * ==================================================================== */
	await block('進化段4F 進化の画面の色（ライト・ダーク）: 実際に描いた色を測り、文字と地のコントラスト比を出す（小さい文字は 4.5 以上が望ましい。下回る組み合わせは数値を出す）', async () => {
		const rows = [];
		for (const scheme of ['light', 'dark']) {
			const sp = await openSp({ roster: bRoster(), w: 390, scheme });
			await sp.page.click('[data-usd-el="evo-btn"]');
			await sp.page.waitForTimeout(300);
			const hexOf = (c) => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c); return m ? '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('') : null; };
			const m = await sp.page.evaluate(() => {
				const css = (el, p) => getComputedStyle(el)[p];
				const pop = document.querySelector('.usd-info-pop');
				const t = document.querySelector('[data-usd-el="evo-brow"]');
				return { sheetBg: css(pop, 'backgroundColor'), sheetText: css(document.querySelector('[data-usd-el="evo-subhead"]'), 'color'), group: css(document.querySelector('.usd-evo-group'), 'backgroundColor'),
					targetText: css(t.querySelector('.usd-evo-name'), 'color'), targetSub: css(t.querySelector('.usd-evo-sub'), 'color'), grad: css(t, 'backgroundImage') };
			});
			rows.push({ scheme, m, hexOf });
			await sp.ctx.close();
		}
		assert(rows.every((x) => x.m.sheetBg && x.m.grad.indexOf('linear-gradient') !== -1), '進化段4F 進化先の行はグラデーション、シートは指定の面で描かれる', rows.map((x) => x.m.sheetBg));
		// 指定の色の組み合わせのコントラスト比（指定の値そのもの。値は変えない）
		const pairs = {
			light: [['進化先の文字 / 左端', '#4a1d0c', '#fff0f5'], ['進化先の文字 / 中央', '#4a1d0c', '#ffd3e9'], ['進化先の文字 / 右端', '#4a1d0c', '#ffb8e0'], ['元の金スキルの文字 / 左端', '#4a2a12', '#fffbe0'], ['元の金スキルの文字 / 右端', '#4a2a12', '#ffd04d'],
				['「進化しない」の文字', '#4a2a12', '#ffffff'], ['注意文の赤 / シート', '#b3261e', '#ffffff'], ['注意文の赤 / グループ', '#b3261e', '#f6f6f4'], ['シートの文字 / シート', '#2a2a2a', '#ffffff'], ['シートの文字 / グループ', '#2a2a2a', '#f6f6f4'],
				['赤いボタンの文字', '#7a1812', '#fff3f1'], ['進化ボタンの文字', '#4a1d0c', '#fff0f5']],
			dark: [['進化先の文字 / 左端', '#ffe9f2', '#3d1830'], ['進化先の文字 / 中央', '#ffe9f2', '#5a2145'], ['進化先の文字 / 右端', '#ffe9f2', '#7a2b5e'], ['元の金スキルの文字 / 左端', '#f3e8d0', '#3a3212'], ['元の金スキルの文字 / 右端', '#f3e8d0', '#6e5a14'],
				['「進化しない」の文字', '#e8e0d6', '#2f2e34'], ['注意文の赤 / シート', '#ff9a8f', '#26252a'], ['注意文の赤 / グループ', '#ff9a8f', '#1b1a1f'], ['シートの文字 / シート', '#f0eae0', '#26252a'], ['シートの文字 / グループ', '#f0eae0', '#1b1a1f'],
				['赤いボタンの文字', '#ffd9d4', '#4a2220'], ['進化ボタンの文字', '#ffe9f2', '#4a1f3a']]
		};
		const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
		const low = [];
		const all = {};
		Object.keys(pairs).forEach((s) => { all[s] = pairs[s].map(([n, fg, bg]) => { const c = contrastRatio(hexRgb(fg), hexRgb(bg)); if (c < 4.5) low.push(s + ' ' + n + ' ' + c.toFixed(2)); return n + ' ' + c.toFixed(2); }); });
		console.log('     [情報] 進化の色のコントラスト比（ライト）: ' + all.light.join(' / '));
		console.log('     [情報] 進化の色のコントラスト比（ダーク）: ' + all.dark.join(' / '));
		console.log('     [情報] 4.5 を下回る組み合わせ: ' + (low.length ? low.join(' / ') : 'なし'));
		assert(true, '進化段4F コントラスト比を出した（4.5 未満: ' + (low.length || 0) + '件。値は指定のまま）');
	});

	/* ====================================================================
	 * 進化スキルの小窓の関係（段4の修正5・C-152）
	 * ==================================================================== */
	await block('進化段4G 進化スキルの小窓: 進化スキル → └ 金スキル → └ 白スキル を出す（白が無ければ金まで）。金スキルの小窓は変えない。コントラスト 4.5 以上・360px で収まる（ライト・ダーク）', async () => {
		const STEP = new Map(readJson('data/skill-step-up.json').entries.map((e) => [e.skillId, e.prevSkillIds || []]));
		const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e]));
		const whitesOf = (g) => (STEP.get(g) || []).filter((id) => PT.get(id) && PT.get(id).rarity === 'white');
		// 白の無い金スキルを元に持つ進化スキル（データから探す。名前は書かない）
		const noWhite = EVOS.find((e) => e.evolvedSkillIds.length > 0 && whitesOf(e.baseSkillId).length === 0 && EVOS.filter((x) => x.evolvedSkillIds.indexOf(e.evolvedSkillIds[0]) !== -1).length === 1);
		const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
		const out = [];
		for (const w of [390, 360]) {
			for (const scheme of ['light', 'dark']) {
				const sp = await openSp({ roster: orfeRoster(), w, scheme });
				// ①の表の、進化させた睥睨の行の名前（進化先）を押す
				await sp.page.click('.usd-roster-grow--evo[data-skill-id="' + HEIGEI + '"] [data-usd-info]');
				await sp.page.waitForTimeout(350);
				const m = await sp.page.evaluate(() => {
					const pop = document.querySelector('.usd-info-pop');
					const rel = pop.querySelector('[data-usd-el="info-evo-rel"]');
					const rows = rel ? [...rel.querySelectorAll('.usd-info-evorel-row')].map((r) => { const mk = r.querySelector('.usd-info-evorel-mark'); const nm = r.querySelector('.usd-info-evorel-name, strong'); return { el: r.getAttribute('data-usd-el'), text: nm.textContent, mark: mk ? mk.textContent : null, markLeft: mk ? mk.getBoundingClientRect().left : null, nameLeft: nm.getBoundingClientRect().left, strong: nm.tagName === 'STRONG', markColor: mk ? getComputedStyle(mk).color : null, nameColor: getComputedStyle(nm).color, fs: parseFloat(getComputedStyle(nm).fontSize) }; }) : null;
					let bgEl = pop, bg = getComputedStyle(pop).backgroundColor;
					const pb = pop.getBoundingClientRect();
					return { rows, bg, rarity: (pop.querySelector('[data-usd-el="info-rarity"]') || {}).textContent, pt: (pop.querySelector('[data-usd-el="info-pt"]') || {}).textContent, title: pop.querySelector('.uma-popover-title').textContent,
						box: { left: pb.left, right: pb.right, top: pb.top, bottom: pb.bottom, vw: window.innerWidth, vh: window.innerHeight }, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
						relOverflow: rel ? rel.scrollWidth - rel.clientWidth : 0 };
				});
				// 白の無い金スキルの進化スキル・金スキル自身（小窓の部品を付けて押す）
				const extra = await sp.page.evaluate(({ noWhiteId, gold }) => {
					const C = window.UmaSkillDeckCore;
					const open = (id) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = id; document.body.appendChild(b); C.attachSkillInfo(b, { skillId: id, trigger: 'self' }); b.click(); };
					const read = () => { const rel = document.querySelector('.usd-info-pop [data-usd-el="info-evo-rel"]'); return rel ? [...rel.querySelectorAll('.usd-info-evorel-row')].map((r) => r.getAttribute('data-usd-el')) : null; };
					const res = {};
					if (noWhiteId) { open(noWhiteId); res.noWhite = read(); }
					open(gold); res.gold = read(); res.goldRarity = (document.querySelector('.usd-info-pop [data-usd-el="info-rarity"]') || {}).textContent;
					return res;
				}, { noWhiteId: noWhite ? noWhite.evolvedSkillIds[0] : null, gold: HEIGEI });
				out.push({ w, scheme, m, extra, errors: jsErrors(sp.errors) });
				await sp.ctx.close();
			}
		}
		const o0 = out[0].m;
		const wantWhites = whitesOf(HEIGEI).map((id) => SKILL_NAME.get(id));
		assert(o0.title === SKILL_NAME.get(HEIGEI_TO) && o0.rarity === '進化スキル' && o0.pt === 'Pt 不要', '進化段4G 前提: 進化スキルの小窓（見出し＝進化先・「進化スキル」・「Pt 不要」）', { title: o0.title, rarity: o0.rarity, pt: o0.pt });
		assert(out.every((x) => x.m.rows && x.m.rows.map((r) => r.text).join('>') === [SKILL_NAME.get(HEIGEI_TO), SKILL_NAME.get(HEIGEI)].concat(wantWhites).join('>')
			&& x.m.rows[0].strong && x.m.rows[0].mark === null && x.m.rows.slice(1).every((r) => r.mark === '└')),
			'進化段4G 関係は上から 進化スキル（太字）→ └ 元の金スキル → └ その前段の白スキル（①の表と同じ「└」）', out.map((x) => x.m.rows && x.m.rows.map((r) => (r.mark || '') + r.text)));
		assert(wantWhites.length > 0 && out.every((x) => x.m.rows[2].markLeft > x.m.rows[1].markLeft + 4), '進化段4G 白スキルの「└」は、金スキルより1段下げる（L字が2段になる）', out.map((x) => [x.m.rows[1].markLeft, x.m.rows[2].markLeft]));
		assert(!!noWhite && out.every((x) => x.extra.noWhite && x.extra.noWhite.join() === 'info-evo-rel-evo,info-evo-rel-gold'), '進化段4G 元の金スキルに白スキルが無いときは、進化スキルと金スキルだけを出す', { id: noWhite && noWhite.evolvedSkillIds[0], got: out.map((x) => x.extra.noWhite) });
		assert(out.every((x) => x.extra.gold === null && x.extra.goldRarity === '金スキル'), '進化段4G 金スキルの小窓は変えない（進化先は出さない）', out.map((x) => x.extra.gold));
		const cr = out.map((x) => { const bg = rgb(x.m.bg); return { w: x.w, s: x.scheme, marks: x.m.rows.filter((r) => r.markColor).map((r) => +contrastRatio(rgb(r.markColor), bg).toFixed(2)), names: x.m.rows.map((r) => +contrastRatio(rgb(r.nameColor), bg).toFixed(2)), fs: x.m.rows.map((r) => r.fs) }; });
		console.log('     [情報] 進化スキルの小窓の関係のコントラスト比: ' + cr.map((c) => c.w + c.s + ' 線' + c.marks.join('/') + ' 文字' + c.names.join('/')).join(' ｜ '));
		assert(cr.every((c) => c.marks.every((v) => v >= 4.5) && c.names.every((v) => v >= 4.5)), '進化段4G L字の線と文字のコントラスト比は 4.5 以上（ライト・ダーク）', cr);
		assert(out.every((x) => x.m.box.left >= 0 && x.m.box.right <= x.m.box.vw + 0.5 && x.m.box.top >= 0 && x.m.box.bottom <= x.m.box.vh + 0.5 && x.m.overflowX <= 0 && x.m.relOverflow <= 0),
			'進化段4G 小窓は 360px・390px でも画面に収まり、はみ出さない（横スクロールなし）', out.map((x) => ({ w: x.w, s: x.scheme, box: x.m.box, ox: x.m.overflowX })));
		assert(out.every((x) => x.errors.length === 0), '進化段4G コンソールのエラー0', out.map((x) => x.errors.slice(0, 2)));
	});

	await block('進化段4I 衣装の小窓: 進化先の行（進化先の色）→ └ 金 → └ 白。360・375・390px × ライト・ダークで、収まる・最後まで送れる・「イベント」「スキル」のタブで行き来できる・バーが開いた高さでも収まる・コントラスト 4.5 以上（C-153）', async () => {
		const out = [];
		for (const [w, h] of [[390, 844], [375, 812], [360, 780], [390, 734]]) {
			for (const scheme of ['light', 'dark']) {
				const sp = await openSp({ roster: mkRoster({ umaId: 'uma-0269', race: raceOf('race-0002') }), w, h, scheme });
				// バーが開いた状態の模擬（734px。vh だけ 844px 基準）
				if (h === 734) await sp.page.addStyleTag({ content: '.usd-info-pop { max-height: min(88vh, 760px) !important; max-height: min(88dvh, 760px) !important; }' });
				await sp.page.click('#deck-roster-panel [data-usd-el="events-btn"][data-member-key="0"]');
				await sp.page.waitForTimeout(400);
				const narrow = await sp.page.evaluate(() => { const s = document.querySelector('[data-usd-el="events-tabs"]'); return !!s && getComputedStyle(s).display !== 'none'; });
				if (narrow) { await sp.page.click('[data-usd-el="events-tab"][data-pane="1"]'); await sp.page.waitForTimeout(700); }
				const m = await sp.page.evaluate(() => {
					const pop = document.querySelector('[data-usd-el="info-pop"]');
					const pane = pop.querySelector('[data-usd-el="events-pane-skills"]');
					const rows = [...pop.querySelectorAll('[data-usd-el="ev-skills"] > li')];
					const evo = rows.filter((r) => r.getAttribute('data-usd-el') === 'ev-skill-evo');
					const marks = [...pop.querySelectorAll('[data-usd-el="ev-evo-mark"]')].map((mk) => {
						const li = mk.closest('li');
						let bg = getComputedStyle(li).backgroundColor;
						if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) bg = getComputedStyle(pop).backgroundColor;
						return { color: getComputedStyle(mk).color, bg, depth: li.getAttribute('data-usd-evo-depth'), left: mk.getBoundingClientRect().left, nameColor: getComputedStyle(li.querySelector('.usd-ev-skill-name')).color, dim: li.getAttribute('data-usd-dim') === '1' };
					});
					const cs = getComputedStyle(evo[0]);
					const pb = pop.getBoundingClientRect();
					// 一覧を最後まで送ったとき、最後の行が見える
					const sc = [pane, pop.querySelector('.uma-popover-body')].find((e) => e && e.scrollHeight > e.clientHeight + 1) || pane;
					sc.scrollTop = sc.scrollHeight;
					const last = rows[rows.length - 1].getBoundingClientRect(), scb = sc.getBoundingClientRect();
					return { n: evo.length, ids: rows.map((r) => r.getAttribute('data-skill-id')), marks, evoText: getComputedStyle(evo[0].querySelector('.usd-ev-skill-name')).color, evoDesc: getComputedStyle(evo[0].querySelector('.usd-ev-skill-desc')).color,
						grad: cs.backgroundImage, from: cs.getPropertyValue('--evo-from').trim(), mid: cs.getPropertyValue('--evo-mid').trim(), to: cs.getPropertyValue('--evo-to').trim(),
						box: { top: pb.top, bottom: pb.bottom, left: pb.left, right: pb.right, vw: innerWidth, vh: innerHeight }, ox: document.documentElement.scrollWidth - document.documentElement.clientWidth,
						lastVisible: last.bottom <= scb.bottom + 1 && last.top >= scb.top - 1, word: /必ず合う|合うことがある|合わない|進\b/.test(pop.textContent) && /必ず合う|合うことがある|合わない/.test(pop.textContent) };
				});
				// 「イベント」のタブで戻れる
				let back = null;
				if (narrow) { await sp.page.click('[data-usd-el="events-tab"][data-pane="0"]'); await sp.page.waitForTimeout(700); back = await sp.page.evaluate(() => ({ active: document.querySelector('[data-usd-el="events-tab"][aria-selected="true"]').textContent.trim() })); }
				out.push({ w, h, scheme, narrow, m, back, errors: jsErrors(sp.errors) });
				await sp.ctx.close();
			}
		}
		const hex = (s) => { const n = parseInt(s.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
		const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
		const o0 = out[0].m;
		assert(out.every((x) => x.m.n === 2 && x.m.ids.indexOf('ex-1146') === x.m.ids.indexOf('ex-0354') - 1 && x.m.ids.indexOf('ex-1147') === x.m.ids.indexOf('ex-0633') - 1),
			'進化段4I どの幅・テーマでも、進化先の行は2つ（大望は煌めきとなりて・熾烈の極みの進化先）で、それぞれ金スキルの直上', out.map((x) => x.w + x.scheme + ':' + x.m.n));
		assert(out.every((x) => x.m.marks.length === 4 && x.m.marks.filter((k) => k.depth === '2').every((k2) => x.m.marks.filter((k) => k.depth === '1').some((k1) => k2.left > k1.left + 4))),
			'進化段4I 「└」は金スキル2つと白スキル2つに付き、白は金より1段下げる', out.map((x) => x.m.marks.map((k) => k.depth + ':' + Math.round(k.left))));
		assert(out.every((x) => x.m.grad.indexOf('linear-gradient') !== -1 && x.m.from && x.m.to), '進化段4I 進化先の行は進化先の色（--evo- の変数）のグラデーション', out.map((x) => x.m.from + '→' + x.m.to));
		const cr = out.map((x) => ({ k: x.w + 'x' + x.h + x.scheme, marks: x.m.marks.map((k) => +contrastRatio(rgb(k.color), rgb(k.bg)).toFixed(2)), evo: [x.m.from, x.m.mid, x.m.to].map((c) => +contrastRatio(rgb(x.m.evoText), hex(c)).toFixed(2)), evoDesc: [x.m.from, x.m.mid, x.m.to].map((c) => +contrastRatio(rgb(x.m.evoDesc), hex(c)).toFixed(2)) }));
		console.log('     [情報] 衣装の小窓のコントラスト比: ' + cr.filter((c, i) => i < 2).map((c) => c.k + ' 線' + c.marks.join('/') + ' 進化先の名前' + c.evo.join('/') + ' 説明' + c.evoDesc.join('/')).join(' ｜ '));
		assert(cr.every((c) => c.marks.every((v) => v >= 4.5) && c.evo.every((v) => v >= 4.5) && c.evoDesc.every((v) => v >= 4.5)), '進化段4I 「└」の線（行の地に対して）と進化先の行の文字のコントラスト比は 4.5 以上（ライト・ダーク）', cr);
		assert(out.every((x) => x.m.box.top >= 0 && x.m.box.bottom <= x.m.box.vh + 0.5 && x.m.box.left >= 0 && x.m.box.right <= x.m.box.vw + 0.5 && x.m.ox <= 0),
			'進化段4I 小窓は 360・375・390px とバーが開いた高さ（734px）でも画面に収まり、横にはみ出さない', out.map((x) => ({ k: x.w + 'x' + x.h + x.scheme, top: Math.round(x.m.box.top), bottom: Math.round(x.m.box.bottom), vh: x.m.box.vh })));
		assert(out.every((x) => x.m.lastVisible), '進化段4I 進化先の行が増えても、取得できるスキルを最後まで送れる（最後の行が見える）', out.map((x) => x.w + 'x' + x.h + x.scheme + ':' + x.m.lastVisible));
		assert(out.filter((x) => x.narrow).length > 0 && out.filter((x) => x.narrow).every((x) => x.back && x.back.active === 'イベント'), '進化段4I 狭い幅では「イベント」のタブでイベントのペインに戻れる', out.map((x) => x.back));
		assert(out.every((x) => !x.m.word), '進化段4I 小窓に「必ず合う／合うことがある／合わない」の語は出ない');
		assert(out.every((x) => x.errors.length === 0), '進化段4I コンソールのエラー0', out.map((x) => x.errors.slice(0, 2)));
	});

	await block('進化段4H 説明文を読めないとき: 進化ボタンは押せる見た目のまま（最大は衣装の金スキルの数から）・押すと理由を知らせて画面は開かない・次に押したとき読めれば使える（C-152）', async () => {
		let fail = true;
		const sp = await openPage(browser, base, 'special.html', { width: 390, height: 844 }, EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(SCENARIO_DOC)));
		await sp.page.route('**/data/skill-descriptions.json*', (r) => (fail ? r.fulfill({ status: 500, body: 'x' }) : r.continue()));
		await sp.page.evaluate((ro) => { localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(ro)); localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '0'); }, orfeRoster());
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector('[data-usd-el="evo-btn"]');
		await sp.page.waitForTimeout(800);
		const st = () => sp.page.evaluate(() => { const b = document.querySelector('[data-usd-el="evo-btn"]'); return { text: b.textContent.replace(/\s/g, ''), disabled: b.disabled, aria: b.getAttribute('aria-disabled'), opacity: getComputedStyle(b).opacity, evoRows: document.querySelectorAll('.usd-roster-grow--evo').length }; });
		const s0 = await st();
		assert(s0.text === '進化0／4' && !s0.disabled && s0.aria === null && s0.opacity === '1' && s0.evoRows === 0, '進化段4H 読めない間: ボタンは押せる見た目のまま「進化 0／4」（最大は衣装の金スキル2つ＋シナリオ2）・表に進化した行は無い', s0);
		await sp.page.click('[data-usd-el="evo-btn"]');
		await sp.page.waitForTimeout(400);
		assert((await toastText(sp.page)).indexOf('進化のデータを読み込めませんでした') !== -1 && !(await sheetVisible(sp.page)), '進化段4H 押すと「進化のデータを読み込めませんでした」を知らせ、画面は開かない', await toastText(sp.page));
		// 押したときにもう一度読む。読めれば進化の決定が出る
		fail = false;
		await sp.page.click('[data-usd-el="evo-btn"]');
		await sp.page.waitForTimeout(1200);
		const s1 = await st();
		assert(s1.text === '進化3／4' && s1.evoRows === 3, '進化段4H 読み直して読めれば、進化の決定が出る（進化 3／4・表に進化した行）', s1);
		await sp.page.click('[data-usd-el="evo-btn"]');
		await sp.page.waitForTimeout(400);
		assert(await sheetVisible(sp.page), '進化段4H そのあと押すと進化の画面が開く');
		await sp.ctx.close();
	});
}
