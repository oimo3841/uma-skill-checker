import { withEventScenarioFirst } from './lib/scenario-doc.mjs';
import { clickEvents } from './lib/col-menu.mjs';
// ①の「既定と違う選択」の点（2026-10-21・C-179）の検査。run-smoke.mjs の末尾から register41() で呼ばれる
// （塊の見出しはすべて「C-179」で始まる。`npm run test:visual -- --only=C-179` で回せる）。
//
// 決め（おいもさん・C-179。badge-dot-step0.md の案1）:
//  1. 列見出しのバッジの角の点は「入口の合図」。条件は今のまま（結果の切り替えで結果1以外が有効なイベント、または取得の段階が有効に選ばれたイベントが、その列に1つ以上）。
//     小窓の中の、そのイベントの見出しの右にも同じ点。条件は1件について同じ式。列見出しの点が出ている ⟺ その列の小窓に点のある行が1つ以上。複数選択肢のイベントは、イベントに1つ。
//  2. 点の色は、列・ライト／ダークによらず同じ。塗りか縁のどちらかが、地に対して 3:1 以上（育成ウマ娘の列のライトで塗りが地に溶けて白い輪に見えるのを直す）。赤系は使わない。
//  3. 結果の切り替えと取得の段階は同じ点。4. 選んだ選択肢で効いていない切り替えも点。5. 保存値は読み込み時に補わず書き換えない（ルール28）。
//  6. 小窓の行の点は aria-hidden。読み上げは視覚的に隠した文（画面に出る文は足さない）。8. 点を付けても行の高さ・折り返しは変わらない。
// 代表の編成は uma-0030（[蒼炎の誉]グラスワンダー）＋ card-0273・0288・0311・0346・0405・0248。

export async function register41(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const P = '#deck-roster-panel ';
	const DRAFT = 'umaSkillDeck:draftRoster:special';
	const U = 'uma-0030';
	const CARDS = ['card-0273', 'card-0288', 'card-0311', 'card-0346', 'card-0405', 'card-0248'];
	const K_CHOICE = 'uma:' + U + '#2', K_USER = 'uma:' + U + '#4', K_RANDOM = 'uma:' + U + '#5', K_CARD = 'card:card-0273#0';
	const lum = (rgb) => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
	const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		const scen = withEventScenarioFirst(readJson('data/scenario-event-skills.json'));
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(scen) }));
		const roster = Object.assign({ umaId: U, cardIds: CARDS.slice(), acquireSeen: U }, o.roster || {});
		await sp.page.evaluate(({ roster, DRAFT }) => {
			localStorage.setItem(DRAFT, JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { roster, DRAFT });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(P + '[data-usd-el="col-menu-btn"][data-member-key="0"]', { timeout: 15000 });   // 2026-10-26: 育成ウマ娘の列もメニューのボタン
		await sp.page.waitForTimeout(700);
		return sp;
	};
	const members = (page) => page.evaluate((P) => Array.from(document.querySelectorAll(P + '[data-usd-el="events-btn"], ' + P + '[data-usd-el="col-menu-btn"]')).map((b) => ({ key: b.getAttribute('data-member-key'), dot: !!b.querySelector('[data-usd-el="result-dot"]'), text: b.textContent, un: b.getAttribute('data-unselected') })), P);
	const openPop = async (page, key) => { await clickEvents(page, P, key); await page.waitForTimeout(400); };
	const closePop = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(250); };
	const rowDots = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="event-nondefault-dot"]')).map((d) => { const box = d.parentElement.closest('[data-usd-el^="event"]'); return box ? box.getAttribute('data-event-key') : null; }));
	/** 全ての列について、列見出しの点の有無と、小窓の点のある行の件数を取る */
	const scan = async (page) => {
		const ms = await members(page);
		const out = [];
		for (const m of ms) {
			await openPop(page, m.key);
			const rows = await rowDots(page);
			await closePop(page);
			out.push({ key: m.key, col: m.dot, rows });
		}
		return out;
	};
	const iffOk = (s) => s.every((x) => x.col === (x.rows.length > 0));
	const fmt = (s) => s.map((x) => x.key + (x.col ? '•' : '-') + x.rows.length).join(' ');
	const rawDraft = (page) => page.evaluate((k) => localStorage.getItem(k), DRAFT);
	const draftR = async (page) => JSON.parse(await rawDraft(page));

	await block('C-179(a) 列見出しの点 ⟺ 小窓に点のある行（状態表の (a)〜(h)・(i)・(x)）／複数選択肢のイベントは点が1つ／読み上げ', async () => {
		const cases = [
			['(a) 既定', {}, {}],
			['(c) 取得の段階を選ぶ', { acquirePicks: { [K_USER]: true } }, { '0': [K_USER] }],
			['(e) 結果を2に', { resultPicks: { [K_CHOICE]: 1 } }, { '0': [K_CHOICE] }],
			['(g) ランダム目印をスキルなしに', { resultPicks: { [K_RANDOM]: 1 } }, { '0': [K_RANDOM] }],
			['(card1) 1番のカードの結果を2に', { resultPicks: { [K_CARD]: 1 } }, { '1': [K_CARD] }],
			['(複数) 育成ウマ娘と1番のカード', { resultPicks: { [K_CHOICE]: 1, [K_CARD]: 1 }, acquirePicks: { [K_USER]: true } }, { '0': [K_CHOICE, K_USER], '1': [K_CARD] }],
			// 条件文のイベント（目印なし）の保存値は無視される・無効な値は点にならない（(x)）
			['(x3) 無効な値（範囲外・知らない鍵）', { resultPicks: { [K_CHOICE]: 99, 'no-such#1': 1, 'card:card-9999#0': 2 }, acquirePicks: { [K_USER]: 5 } }, {}]
		];
		for (const [name, extra, exp] of cases) {
			const sp = await openSp({ roster: extra });
			const s = await scan(sp.page);
			assert(iffOk(s), 'C-179(a) ' + name + ': 列見出しの点が出ている ⟺ その列の小窓に点のある行が1つ以上（' + fmt(s) + '）', s);
			const got = {};
			s.forEach((x) => { if (x.rows.length) got[x.key] = x.rows.slice().sort(); });
			const want = {};
			Object.entries(exp).forEach(([k, v]) => { want[k] = v.slice().sort(); });
			assert(JSON.stringify(got) === JSON.stringify(want), 'C-179(a) ' + name + ': 点のある行のイベントが期待どおり', { got, want });
			assert(jsErrors(sp.errors).length === 0, 'C-179(a) ' + name + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// 複数選択肢のイベント（#2＝選択肢2つ）: 結果を2にすると、箱の見出しに点は1つだけ（選択肢ごとには付けない）。読み上げの文・aria-hidden
		const sp = await openSp({ roster: { resultPicks: { [K_CHOICE]: 1, [K_CARD]: 1 } } });
		await openPop(sp.page, '0');
		const box = await sp.page.evaluate((k) => {
			const b = document.querySelector('[data-usd-el="event"][data-event-key="' + k + '"]');
			if (!b) return null;
			const t = b.querySelector('.usd-roster-eventtitle');
			const d = t.querySelectorAll('[data-usd-el="event-nondefault-dot"]');
			const sr = t.querySelector('.usd-roster-srnote');
			return { choices: b.querySelectorAll('[data-usd-el="event-choice"]').length, dotsInBox: b.querySelectorAll('[data-usd-el="event-nondefault-dot"]').length, dotsInTitle: d.length,
				hidden: d[0] && d[0].getAttribute('aria-hidden'), sr: sr && sr.textContent, dotText: d[0] && d[0].textContent, onResult: b.querySelector('.usd-roster-result.usd-roster-choice--on') && b.querySelector('.usd-roster-result.usd-roster-choice--on').getAttribute('data-result') };
		}, K_CHOICE);
		assert(box && box.choices >= 2 && box.dotsInBox === 1 && box.dotsInTitle === 1 && box.onResult === '1', 'C-179(a) 複数選択肢のイベントは、点がイベントに1つ（選択肢ごとには付けない）', box);
		assert(box.hidden === 'true' && box.sr === '（既定と違う選択）' && box.dotText === '', 'C-179(a) 点は aria-hidden・中に字なし。読み上げは見出しの中の視覚的に隠した文「（既定と違う選択）」', box);
		// 結果1に戻すと、その行の点だけが消える。選んだ選択肢が結果を持たなくても（効いていない切り替えでも）、点は残る（決定4）
		await sp.page.click('[data-usd-el="result-choice"][data-event-key="' + K_CHOICE + '"][data-result="0"]');
		await sp.page.waitForTimeout(350);
		assert((await rowDots(sp.page)).length === 0, 'C-179(a) 結果1に戻すと、小窓の行の点が消える（作り直されても保たれ、消えるべきときに消える）', await rowDots(sp.page));
		assert(!(await members(sp.page)).find((m) => m.key === '0').dot, 'C-179(a) 結果1に戻すと、列見出しの点も消える', null);
		await sp.page.click('[data-usd-el="result-choice"][data-event-key="' + K_CHOICE + '"][data-result="1"]');
		await sp.page.waitForTimeout(350);
		assert((await rowDots(sp.page)).includes(K_CHOICE), 'C-179(a) 結果2に切り替えると、その行に点が付く（小窓を開いたまま作り直しても保たれる）', await rowDots(sp.page));
		// 選択肢を押し替えても（結果を持たない選択肢を選んでも）保存値が結果2のままなら点は残る
		const n0 = await sp.page.evaluate((k) => document.querySelectorAll('[data-usd-el="event"][data-event-key="' + k + '"] [data-usd-el="event-choice"]').length, K_CHOICE);
		for (let ci = 0; ci < n0; ci++) {
			await sp.page.click('[data-usd-el="event-choice"][data-event-key="' + K_CHOICE + '"][data-choice="' + ci + '"]');
			await sp.page.waitForTimeout(300);
			const r = await draftR(sp.page);
			const rows = await rowDots(sp.page);
			assert(rows.includes(K_CHOICE) === (r.resultPicks[K_CHOICE] === 1), 'C-179(a) 選択肢' + (ci + 1) + 'を選んだあとも、点の有無は保存値（結果2）と一致する（効いていない切り替えも点）', { rows, picks: r.resultPicks });
		}
		await sp.ctx.close();
	});

	await block('C-179(b)(c) 点の色: 4通りの地（ライト・ダーク × 育成ウマ娘の列・カードの列）と小窓の行の地で、塗りか縁が 3:1 以上／列・モード・場所によらず同じ色／赤系でない', async () => {
		const seen = new Set();
		for (const scheme of ['light', 'dark']) {
			const sp = await openSp({ w: 1280, scheme, roster: { resultPicks: { [K_CHOICE]: 1, [K_CARD]: 1 } } });
			const col = await sp.page.evaluate((P) => {
				const walk = (el) => { let n = el.parentElement; while (n) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; n = n.parentElement; } return null; };
				const cs = (d) => { const c = getComputedStyle(d); return { fill: c.backgroundColor, ring: c.borderTopColor, w: d.getBoundingClientRect().width }; };
				const bs = Array.from(document.querySelectorAll(P + '[data-usd-el="events-btn"], ' + P + '[data-usd-el="col-menu-btn"]'));
				return { dots: bs.filter((b) => b.querySelector('[data-usd-el="result-dot"]')).map((b) => Object.assign({ key: b.getAttribute('data-member-key') }, cs(b.querySelector('[data-usd-el="result-dot"]')))),
					grounds: bs.map((b) => ({ key: b.getAttribute('data-member-key'), kind: b.className, face: getComputedStyle(b).backgroundColor, ground: walk(b) })) };
			}, P);
			await openPop(sp.page, '0');
			const row = await sp.page.evaluate(() => {
				const walk = (el) => { let n = el; while (n) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; n = n.parentElement; } return null; };
				const d = document.querySelector('[data-usd-el="event-nondefault-dot"]'); const c = getComputedStyle(d);
				return { fill: c.backgroundColor, ring: c.borderTopColor, w: d.getBoundingClientRect().width, ground: walk(d.parentElement) };
			});
			const all = col.dots.concat([row]);
			all.forEach((d) => seen.add(d.fill + '|' + d.ring));
			assert(all.length >= 3 && all.every((d) => d.w >= 7 && d.w <= 9), 'C-179(b) ' + scheme + ' 点は育成ウマ娘の列・カードの列・小窓の行にあり、大きさは約8px', all.map((d) => d.w));
			const f = row.fill, r = row.ring;
			const need = [['小窓の行', row.ground]].concat(...col.grounds.map((g) => [[g.key + '番の見出しの地', g.ground], [g.key + '番のバッジの面', /rgba\(0, 0, 0, 0\)|transparent/.test(g.face || '') ? null : g.face]]));   // C-187: サポカの列の見出しは透明なボタン（面は見出しの地）
			const bad = need.filter(([, g]) => g && Math.max(ratio(f, g), ratio(r, g)) < 3).map(([n, g]) => [n, g, ratio(f, g).toFixed(2), ratio(r, g).toFixed(2)]);
			assert(bad.length === 0, 'C-179(b) ' + scheme + ' 点の塗りか縁が、すべての地（見出しの地・バッジの面・小窓の行 計' + need.length + '）に対して 3:1 以上', bad);
			const uma = col.grounds.find((g) => g.key === '0'), card = col.grounds.find((g) => g.key === '1');
			// 2026-10-27（夜間のまとめ・作業3(10)）: 育成ウマ娘の列の見出しの濃い地を外し、ほかの列と同じ地にした（前提は「別の地」から「同じ地」へ）
			assert(uma && card && uma.ground === card.ground, 'C-179(b) ' + scheme + ' 前提: 育成ウマ娘の列とカードの列は同じ地（2026-10-27 から）', [uma.ground, card.ground]);
			const [fr, fg, fb] = f.match(/[\d.]+/g).map(Number);
			assert(fr > fg + 30 && fr >= fb + 60, 'C-179(b) ' + scheme + ' 塗りは赤系でない（赤が緑より十分に強い色＝赤・ピンクでない。琥珀）', f);
			assert(jsErrors(sp.errors).length === 0, 'C-179(b) ' + scheme + ' コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		assert(seen.size === 1, 'C-179(c) 点の塗りと縁は、育成ウマ娘の列・カードの列・小窓の行・ライト・ダークのすべてで同じ色', Array.from(seen));
	});

	await block('C-179(d)(e) 点が付いても、「！」の数・字、列見出しの高さ・列の幅、小窓の見出しの高さは変わらない（PC・390・360）', async () => {
		const measure = (page) => page.evaluate((P) => {
			const bs = Array.from(document.querySelectorAll(P + '[data-usd-el="events-btn"], ' + P + '[data-usd-el="col-menu-btn"]'));
			const gh = document.querySelector(P + '.usd-roster-gh');
			const gcs = Array.from(document.querySelectorAll(P + '.usd-roster-gh'));
			const btn28 = document.querySelector(P + '.usd-roster-ghbtn');
			return { badges: bs.map((b) => [b.getAttribute('data-member-key'), b.textContent, b.getAttribute('data-unselected'), Math.round(b.getBoundingClientRect().width * 10) / 10, Math.round(b.getBoundingClientRect().height * 10) / 10]),
				ghH: gh ? Math.round(gh.getBoundingClientRect().height * 10) / 10 : null, cols: gcs.map((g) => Math.round(g.getBoundingClientRect().width * 10) / 10), btnH: btn28 ? btn28.getBoundingClientRect().height : null,
				sw: document.documentElement.scrollWidth - document.documentElement.clientWidth };
		}, P);
		const titleH = (page, k) => page.evaluate((k) => { const t = document.querySelector('[data-event-key="' + k + '"] .usd-roster-eventtitle'); return t ? Math.round(t.getBoundingClientRect().height * 10) / 10 : null; }, k);
		const picks = { [K_CHOICE]: 1, [K_RANDOM]: 1, [K_CARD]: 1 };
		for (const w of [1280, 390, 360]) {
			const plain = await openSp({ w });
			const m0 = await measure(plain.page);
			await openPop(plain.page, '0');
			const h0 = { c: await titleH(plain.page, K_CHOICE), r: await titleH(plain.page, K_RANDOM) };
			await plain.ctx.close();
			const sp = await openSp({ w, roster: { resultPicks: picks } });
			const m1 = await measure(sp.page);
			assert(m1.badges.every((b, i) => b[1] === m0.badges[i][1] && b[2] === m0.badges[i][2]), 'C-179(d) ' + w + 'px 結果の切り替えに点が付いても、「！」の有無・未選択の件数・番号は変わらない', { m0: m0.badges, m1: m1.badges });
			assert(m1.badges.some((b) => b[0] === '0') && (await members(sp.page)).filter((m) => m.dot).length === 2, 'C-179(d) ' + w + 'px 前提: 点が2つの列（育成ウマ娘・1番）に出ている', await members(sp.page));
			assert(JSON.stringify(m1.badges.map((b) => [b[3], b[4]])) === JSON.stringify(m0.badges.map((b) => [b[3], b[4]])), 'C-179(e) ' + w + 'px バッジの幅・高さは変わらない', { m0: m0.badges, m1: m1.badges });
			assert(m1.ghH === m0.ghH && JSON.stringify(m1.cols) === JSON.stringify(m0.cols) && m0.cols.length >= 8 && m1.btnH === m0.btnH && (w !== 1280 || m1.btnH === 28), 'C-179(e) ' + w + 'px 列見出しの高さ（' + m0.ghH + 'px）・列の幅・漏斗のボタンの高さ（PC 28px・スマホ '+m0.btnH+'px）は変わらない', { m0, m1 });
			assert(m1.sw <= 0, 'C-179(e) ' + w + 'px 横スクロールが出ない', m1.sw);
			await openPop(sp.page, '0');
			const h1 = { c: await titleH(sp.page, K_CHOICE), r: await titleH(sp.page, K_RANDOM) };
			assert(h0.c !== null && h1.c === h0.c && h1.r === h0.r, 'C-179(e) ' + w + 'px 小窓の見出しの高さは、点が付いても変わらない（折り返しも増えない）', { h0, h1 });
			const lines = await sp.page.evaluate(() => Array.from(document.querySelectorAll('.usd-roster-eventtitle')).map((t) => { const dot = t.querySelector('[data-usd-el="event-nondefault-dot"]'); return dot ? Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)) : null; }).filter((x) => x !== null));
			assert(lines.length === 2 && lines.every((n) => n >= 1 && n <= 2), 'C-179(e) ' + w + 'px 点のある見出し2つの行数は 1〜2（点のせいで増えていない）', lines);
			assert((await sp.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, 'C-179(e) ' + w + 'px 小窓を開いても横スクロールが出ない', null);
			assert(jsErrors(sp.errors).length === 0, 'C-179(e) ' + w + 'px コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('C-179(f) 保存値は書き換わらない（ルール28）: 点が出ても開くだけで1バイトも変わらない／小窓を開閉しても変わらない／中身をすべて消す→元に戻すで元の保存値に戻る', async () => {
		const extra = { resultPicks: { [K_CHOICE]: 1, [K_CARD]: 1, 'no-such#1': 3 }, acquirePicks: { [K_USER]: true } };
		const sp = await openSp({ roster: extra });
		const seeded = await rawDraft(sp.page);
		const r0 = JSON.parse(seeded);
		const ms = await members(sp.page);
		assert(ms.filter((m) => m.dot).length === 2, 'C-179(f) 前提: 点が出ている（育成ウマ娘・1番）', ms);
		await scan(sp.page);
		const after = JSON.parse(await rawDraft(sp.page));
		assert(JSON.stringify(after.resultPicks) === JSON.stringify(r0.resultPicks) && JSON.stringify(after.acquirePicks) === JSON.stringify(r0.acquirePicks) && after.umaId === r0.umaId && JSON.stringify(after.cardIds) === JSON.stringify(r0.cardIds),
			'C-179(f) 点が出た状態で、全部の列の小窓を開閉しても、resultPicks・acquirePicks・衣装・カードは1バイトも変わらない（知らない鍵も残る）', { r0, after });
		// 衣装を外すと点は消え、保存値は残る（鍵が別の衣装）。戻すと点が出る（今のまま。点は理由を小窓で示す）
		await sp.page.click(P + '[data-usd-el="roster-reset"]');
		await sp.page.waitForTimeout(300);
		await sp.page.click('[data-usd-el="roster-reset-all"]');
		await sp.page.waitForTimeout(500);
		const cleared = await draftR(sp.page);
		assert(!('resultPicks' in cleared) && !('acquirePicks' in cleared) && !(await members(sp.page)).some((m) => m.dot), 'C-179(f) 「中身をすべて消す」で保存値も点も消える', cleared);
		await sp.page.keyboard.press('Escape');
		await sp.page.waitForTimeout(250);
		await sp.page.click('#deck-undo-btn');
		await sp.page.waitForTimeout(500);
		const restored = await draftR(sp.page);
		assert(JSON.stringify(restored.resultPicks) === JSON.stringify(r0.resultPicks) && JSON.stringify(restored.acquirePicks) === JSON.stringify(r0.acquirePicks) && restored.umaId === U, 'C-179(f) 「元に戻す」で、元の保存値（知らない鍵も）に戻る', { r0, restored });
		assert((await members(sp.page)).filter((m) => m.dot).length === 2, 'C-179(f) 元に戻すと点も戻る', await members(sp.page));
		// 開き直し（再読み込み）でも保存値は変わらず、点は同じ
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(800);
		const again = await draftR(sp.page);
		assert(JSON.stringify(again.resultPicks) === JSON.stringify(r0.resultPicks) && (await members(sp.page)).filter((m) => m.dot).length === 2, 'C-179(f) 再読み込みしても保存値は同じで、点も同じ', again);
		assert(jsErrors(sp.errors).length === 0, 'C-179(f) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
