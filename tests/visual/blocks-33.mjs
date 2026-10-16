// ◎のボタン（①の列見出し）と、行の◎／○の切り替えの出し方（C-168・2026-10-16）の検査。run-smoke.mjs の末尾から register33() で呼ばれる
// （塊の見出しはすべて「◎ボタン」で始まる。`npm run test:visual -- --only=◎ボタン` で回せる）。
//
// 決め: 「スキル名」の見出しの絞り込み（並べ替え）のボタン、回復（aria-label「回復スキルを上に寄せる」・data-tone="heal"・act「sort-tone」）の隣に◎のボタン（data-tone="circle"）を足す。
//   仕組み・見た目・押し方・状態の持ち方（画面の中だけ・保存しない・同時に1つだけ）は回復のボタンと同じ。「入」のときは、◎／○の2つの状態を持つ行
//   （visiblePartOf の circleCandidates）を上へ寄せる（行は減らさない）。行の◎／○の切り替えボタンは「入」のときだけ出す（通常は出さない）。
//   切り替えの保存（keepCircleIds）・元に戻す・リセットは変えない。見出しの高さは増やさない。
//
// (1) 見出し: 回復の隣・同じ作り・高さ（PC・390・360px × ライト／ダーク）・横スクロールなし・アイコンはモノトーンでコントラスト 3 以上
// (2) 動き: 通常は行のボタンが無い／入で出る／入で対象の行が先頭／もう一度で戻る／回復と同時に入にならない／保存しない
// (3) 保存: 切り替えの保存が従来どおり・インポート→元に戻すで保存データが書き換わらない（ルール28）
// （切り替えの保存・元に戻す・リセットの細部は blocks-29.mjs「◎切替」。ここから「入」にして回す）

export async function register33(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const P = '#deck-roster-panel ';
	const CIRCLE = P + '[data-usd-act="sort-tone"][data-tone="circle"]';
	const HEAL = P + '[data-usd-act="sort-tone"][data-tone="heal"]';
	const R2 = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'medium', style: 'senko', surface: 'turf' } };
	const CAND = 10;   // R2 で◎／○の2つの状態を持つ行の数（blocks-29 の FIX.R2.cand）

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 900 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		const roster = Object.assign({}, R2, o.roster || {});
		await sp.page.evaluate(({ roster }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, { roster });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(700);
		return sp;
	};
	const rowsOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')).map((r) => ({
		id: r.getAttribute('data-skill-id'), circle: r.getAttribute('data-usd-circle'), tog: !!r.querySelector('[data-usd-el="circle-toggle"]'),
		h: Math.round(r.querySelector('.usd-roster-gc--name').getBoundingClientRect().height), nameW: Math.round(r.querySelector('.usd-roster-namescroll').getBoundingClientRect().width) })));
	const draft = (page) => page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
	const pressed = (page, sel) => page.getAttribute(sel, 'aria-pressed');

	await block('◎ボタン(1) 見出し: ◎のボタンは回復の隣・同じ作り／見出しの高さは増えない／横スクロールなし／アイコンはモノトーンでコントラスト3以上（390・360・1280px × ライト／ダーク）', async () => {
		for (const scheme of ['light', 'dark']) {
			for (const [w, headH] of [[1280, 73], [390, 49], [360, 49]]) {
				const sp = await openSp({ w, scheme });
				const g = await sp.page.evaluate(() => {
					const h = document.querySelector('#deck-roster-panel .usd-roster-gh--skill');
					const tones = Array.from(h.querySelectorAll('.usd-roster-tone')).map((t) => {
						const b = t.querySelector('button'); const r = b.getBoundingClientRect(); const ic = t.querySelector('.usd-roster-toneicon');
						return { key: t.getAttribute('data-tone'), cls: b.className, label: b.getAttribute('aria-label'), act: b.getAttribute('data-usd-act'), title: b.title, pressed: b.getAttribute('aria-pressed'), w: Math.round(r.width), hgt: Math.round(r.height), disabled: b.disabled,
							icon: ic ? ic.getAttribute('aria-label') : null };
					});
					const heal = h.querySelector('[data-tone="heal"]'), circle = h.querySelector('[data-tone="circle"]');
					const ic = circle ? circle.querySelector('.usd-roster-toneicon') : null;
					const svg = ic ? ic.querySelector('svg') : null;
					const probe = document.createElement('span'); probe.style.color = 'var(--uma-text-heading)'; h.appendChild(probe);
					const token = getComputedStyle(probe).color; probe.remove();
					// 見出しの地（祖先をたどって最初の不透明な背景）
					let bgEl = h, bg = 'rgba(0, 0, 0, 0)';
					while (bgEl) { const c = getComputedStyle(bgEl).backgroundColor; if (c && !/rgba\(\s*0,\s*0,\s*0,\s*0\)|transparent/.test(c)) { bg = c; break; } bgEl = bgEl.parentElement; }
					const title = h.querySelector('.usd-roster-ghtitle');
					return { tones, order: tones.map((t) => t.key), adjacent: !!heal && heal.nextElementSibling === circle, headH: Math.round(h.getBoundingClientRect().height),
						iconColor: ic ? getComputedStyle(ic).color : null, token, bg, svgStroke: svg ? getComputedStyle(svg).stroke : null, svgFill: svg ? getComputedStyle(svg).fill : null,
						titleCut: title ? title.scrollWidth > title.clientWidth + 1 : null, titleShown: title ? getComputedStyle(title).display !== 'none' : null,
						doc: document.documentElement.scrollWidth - document.documentElement.clientWidth };
				});
				const tag = '◎ボタン(1) ' + w + 'px ' + scheme;
				const heal = g.tones.find((t) => t.key === 'heal'), circle = g.tones.find((t) => t.key === 'circle');
				assert(g.order.join() === 'heal,circle,passive,debuff' && g.adjacent, tag + ': ◎のボタンは回復の隣（回復・◎・緑・デバフの順）', g.order);
				assert(heal.label === '回復スキルを上に寄せる' && !!circle && circle.label === '◎と○を切り替えられるスキルを上に寄せる' && circle.act === 'sort-tone' && circle.pressed === 'false', tag + ': 回復のボタンの aria-label は「回復スキルを上に寄せる」・◎のボタンは同じ act で押していない状態から', { heal: heal.label, circle: circle && circle.label });
				assert(circle.cls === heal.cls && circle.title === heal.title && circle.w === heal.w && circle.hgt === heal.hgt && circle.w >= 24 && circle.hgt >= 24 && !circle.disabled,
					tag + ': 作り・大きさは回復と同じ（押せる大きさ・押せない見た目にしない）', { heal, circle });
				assert(g.headH === headH, tag + ': 見出しの高さは増えない（' + headH + 'px のまま）', g.headH);
				assert(g.doc <= 0, tag + ': 横スクロールが出ない', g.doc);
				if (w >= 360) assert(g.titleShown === true && g.titleCut === false, tag + ': 「スキル名」は切れない', { shown: g.titleShown, cut: g.titleCut });
				// モノトーン: 線画（塗りなし・色は currentColor）で、色は見出しの文字のトークン（--uma-text-heading）と同じ。地とのコントラストは 3 以上
				const lum = async (c) => sp.page.evaluate((c) => {
					const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
					const d = cx.getImageData(0, 0, 1, 1).data; const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
					return 0.2126 * lin(d[0]) + 0.7152 * lin(d[1]) + 0.0722 * lin(d[2]);
				}, c);
				const a = await lum(g.iconColor), b = await lum(g.bg);
				const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
				assert(g.iconColor === g.token && g.svgFill === 'none' && ratio >= 3, tag + ': アイコンはモノトーンの線画（色はトークン --uma-text-heading）・地とのコントラスト ' + ratio.toFixed(1) + '（3以上）', { color: g.iconColor, token: g.token, fill: g.svgFill, bg: g.bg });
				assert(jsErrors(sp.errors).length === 0, tag + ': コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			}
		}
	});

	await block('◎ボタン(2) 動き: 通常は行のボタンが無い／入で出る／入で対象の行が先頭に並ぶ（行は減らさない）／もう一度で元の並び／回復と同時に入にならない／保存しない', async () => {
		const sp0 = await openSp({ w: 390 });
		const sp = await openSp({ w: 390 });
		const before = await rowsOf(sp.page);
		const draft0 = await draft(sp.page);
		assert(before.length > 0 && before.every((r) => !r.tog), '◎ボタン(2) 通常の状態では、どの行にも切り替えのボタンが無い（' + before.length + '行）', before.filter((r) => r.tog).length);
		assert(before.filter((r) => r.circle).length === CAND, '◎ボタン(2) 前提: ◎として数える行は ' + CAND + '行ある', before.filter((r) => r.circle).length);
		await sp.page.click(CIRCLE);
		await sp.page.waitForTimeout(300);
		const on = await rowsOf(sp.page);
		const cands = on.filter((r) => r.tog);
		assert(await pressed(sp.page, CIRCLE) === 'true' && cands.length === CAND && cands.every((r) => r.circle) && on.filter((r) => !r.tog).every((r) => !r.circle),
			'◎ボタン(2) 入にすると、◎／○の2つの状態を持つ行（' + CAND + '行）にだけ切り替えのボタンが出る', { n: cands.length });
		assert(on.length === before.length && JSON.stringify(on.slice(0, CAND).map((r) => r.tog)) === JSON.stringify(new Array(CAND).fill(true)),
			'◎ボタン(2) 入では対象の行が先頭に並ぶ（行は減らさない。' + before.length + '行のまま）', on.slice(0, CAND + 2).map((r) => r.tog));
		// 並べ替えは安定: 対象の中・対象外の中の相対順は、通常の並びのまま
		const idsBefore = before.map((r) => r.id);
		const stable = JSON.stringify(on.slice(0, CAND).map((r) => r.id)) === JSON.stringify(idsBefore.filter((id) => cands.some((c) => c.id === id)))
			&& JSON.stringify(on.slice(CAND).map((r) => r.id)) === JSON.stringify(idsBefore.filter((id) => !cands.some((c) => c.id === id)));
		assert(stable, '◎ボタン(2) 並べ替えは安定（相対順は通常の並びのまま。回復のボタンと同じ動き）', null);
		// 見出しは同じ高さ・行の高さは増えない
		const hs = on.map((r) => r.h), hb = before.map((r) => r.h);
		assert(Math.max(...hs) <= Math.max(...hb) + 0.5, '◎ボタン(2) 切り替えのボタンを出しても、行の高さは増えない', { on: Math.max(...hs), before: Math.max(...hb) });
		// 名前の欄は、通常の状態のほうが広い
		const wBefore = before.filter((r) => r.circle).map((r) => r.nameW), wOn = cands.map((r) => r.nameW);
		assert(wBefore.length > 0 && wBefore.every((w, i) => w > wOn[i]), '◎ボタン(2) 通常の状態は名前の欄が広い（切り替えのボタンの幅ぶん）', { before: wBefore.slice(0, 3), on: wOn.slice(0, 3) });
		assert((await draft(sp.page)) === draft0, '◎ボタン(2) ◎のボタンの状態は保存しない（下書きは1バイトも変わらない）', null);
		// 回復のボタンを押すと、◎のボタンは切れる（同時に1つだけ）。切り替えのボタンも消える
		await sp.page.click(HEAL);
		await sp.page.waitForTimeout(300);
		assert(await pressed(sp.page, CIRCLE) === 'false' && await pressed(sp.page, HEAL) === 'true' && (await rowsOf(sp.page)).every((r) => !r.tog), '◎ボタン(2) 回復のボタンを押すと◎のボタンは切れ、切り替えのボタンも消える（同時に1つだけ）', null);
		await sp.page.click(HEAL);
		await sp.page.waitForTimeout(200);
		// もう一度押すと元の並び
		await sp.page.click(CIRCLE);
		await sp.page.waitForTimeout(250);
		await sp.page.click(CIRCLE);
		await sp.page.waitForTimeout(300);
		const off = await rowsOf(sp.page);
		assert(JSON.stringify(off.map((r) => r.id)) === JSON.stringify(idsBefore) && off.every((r) => !r.tog) && await pressed(sp.page, CIRCLE) === 'false', '◎ボタン(2) もう一度押すと元の並びに戻り、切り替えのボタンも消える', null);
		// 開き直すと切れている（保存しない）
		await sp.page.click(CIRCLE);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(600);
		assert(await pressed(sp.page, CIRCLE) === 'false' && (await rowsOf(sp.page)).every((r) => !r.tog), '◎ボタン(2) 開き直すと切れている（画面の中だけの状態）', null);
		assert(jsErrors(sp.errors).length === 0, '◎ボタン(2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 対象の行が無い編成でも、押せる（何も変わらない）
		// 対象の○をすべて「取得しない」にした編成（表の行はあるが、◎／○の2つの状態を持つ行は0）
		const candIds = await sp0.page.evaluate(async (r) => { await UmaSkillDeckCore.loadTrainingSources(); await UmaSkillDeckCore.loadSkillPtData(); return UmaSkillDeckCore.getRosterVisiblePart(r).circleCandidates.map((c) => c[0]); }, R2);
		await sp0.ctx.close();
		const spN = await openSp({ w: 390, roster: { offSkillIds: candIds } });
		const b0 = await rowsOf(spN.page);
		await spN.page.click(CIRCLE);
		await spN.page.waitForTimeout(250);
		const b1 = await rowsOf(spN.page);
		assert(await pressed(spN.page, CIRCLE) === 'true' && JSON.stringify(b0.map((r) => r.id)) === JSON.stringify(b1.map((r) => r.id)) && b1.every((r) => !r.tog), '◎ボタン(2) 対象の行が無い編成でも押せて、何も変わらない', { n: b1.length, cands: candIds.length });
		await spN.ctx.close();
	});

	await block('◎ボタン(3) 保存: 「入」で切り替えると keepCircleIds に従来どおり書かれる／書き出し→取り込み→「元に戻す」で保存データが書き換わらない（ルール28）', async () => {
		const sp = await openSp({ w: 390 });
		await sp.page.click(CIRCLE);
		await sp.page.waitForTimeout(300);
		const first = (await rowsOf(sp.page)).find((r) => r.tog);
		await sp.page.click(P + '[data-usd-el="circle-toggle"][data-skill-id="' + first.id + '"]');
		await sp.page.waitForTimeout(300);
		const d1 = JSON.parse(await draft(sp.page));
		assert(JSON.stringify(d1.keepCircleIds) === JSON.stringify([first.id]), '◎ボタン(3) 切り替えると keepCircleIds に○のidだけ（従来どおり）', d1.keepCircleIds);
		assert(!('circleMode' in d1) && !Object.keys(d1).some((k) => /circle/i.test(k) && k !== 'keepCircleIds'), '◎ボタン(3) ◎のボタンの状態は保存データに入らない', Object.keys(d1));
		await sp.page.click('#deck-undo-btn');
		await sp.page.waitForTimeout(350);
		assert(!('keepCircleIds' in JSON.parse(await draft(sp.page))), '◎ボタン(3) 「元に戻す」で keepCircleIds が項目ごと消える（従来どおり）', null);
		await sp.ctx.close();
		// Deck: keepCircleIds つきの保存データを書き出し→取り込み→「元に戻す」で、取り込み前と一致する
		const seed = { schemaVersion: 7, records: [], customSkills: [], templates: [{ templateId: 't1', name: 'S1', skillIds: [], baseRosterId: 'r1', createdAt: 'x', updatedAt: 'x' }],
			rosters: [{ rosterId: 'r1', name: 'S1', umaId: 'uma-0001', star: 3, awakeningLevel: 5, cardIds: CARDS6.slice(), skillFilter: R2.skillFilter, keepCircleIds: [first.id, 'no-such-id'], createdAt: 'x', updatedAt: 'x' }] };
		const dk = await openPage(browser, base, 'uma-skill-deck.html', { width: 1280, height: 900 }, seed);
		await dk.page.click('#tab-btn-data');
		await dk.page.waitForTimeout(300);
		const state = () => dk.page.evaluate(() => JSON.stringify(UmaSkillDeckCore.getUserData()) + '|' + localStorage.getItem('umaSkillDeck:userData'));
		const bef = await state();
		const exp = await dk.page.evaluate(() => { exportData(); return document.getElementById('export-textarea').value; });
		assert(JSON.stringify(JSON.parse(exp).rosters[0].keepCircleIds) === JSON.stringify([first.id, 'no-such-id']), '◎ボタン(3) 書き出しに keepCircleIds が入る（知らない id も含めてそのまま）', null);
		await dk.page.evaluate((v) => { document.getElementById('import-textarea').value = JSON.stringify(v); const c = window.confirm; window.confirm = () => true; importData(); window.confirm = c; }, EMPTY);
		const un = await dk.page.evaluate(() => ({ ok: performUndo() }));
		await dk.page.waitForTimeout(300);
		assert(un.ok && (await state()) === bef, '◎ボタン(3) 取り込み→「元に戻す」で、keepCircleIds つきのデータが取り込み前と一致する（移行で書き換わらない）', un);
		assert(dk.errors.length === 0, '◎ボタン(3) Deck: コンソールのエラー0', dk.errors.slice(0, 3));
		await dk.ctx.close();
	});
}
