// 段1a（2026-10-24）の検査: 新シナリオへの未対応の知らせ（暫定の公開メッセージ）。run-smoke.mjs の末尾から register51() で呼ばれる
// （塊の見出しはすべて「段1a」で始まる。`npm run test:visual -- --only=段1a` で回せる）。
//
// (1) 文面が依頼どおり（byte 一致）／(2) 初めての人にも出る・ほかの告知の下に並べて小窓は1枚／(3) 既読の人には1回だけ出て、閉じ方4つで既読になり、開き直すと出ない
// (4) ?notice=force で出る（何も書かない）／(5) exam の常時の1行・行番号がデータの最初と最後の行番号から出る（行を足した合成データで追従）
// (6) 横スクロールなし・エラー0・文字のコントラスト 4.5:1 以上（390・1280px × ライト・ダーク）
// 文面は、依頼文の「そのまま使う」文面を検査の側に直書きして比べる（実装から読んで作らない）。

export async function register51(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const HEAD = '新しいシナリオへの対応について';
	const INTRO = '10月26日 12:00 開始の新しいシナリオ「駿大祭（仮）」を含むゲームの更新に、このツールはまだ対応していません。';
	const LINES = {
		special: [
			'本育成（①）のシナリオの列は、これまでのシナリオのままです。',
			'新しいシナリオのシナリオ因子と専用のスキルは、まだ選べず、読み取りの対象にも入っていません。',
			'新しいサポートカード・育成ウマ娘・スキルは、分かっている範囲だけ先に入れています。足りない内容は、分かり次第追加します。',
			'対応が済んだら、この表示は外れます。',
		],
		exam: [
			'新しいシナリオのシナリオ因子と専用のスキルは、まだ選べず、読み取りの対象にも入っていません。',
			'めろっぷ！【LTC】専用拡張モードの行の並びは、新しいシナリオに未対応です。貼り付ける欄が {A}〜{B} 行目のままか確かめてから貼ってください。',
			'新しいスキルは、分かっている範囲だけ先に入れています。足りない内容は、分かり次第追加します。',
			'対応が済んだら、この表示は外れます。',
		],
	};
	const ALWAYS = '行の並びは新しいシナリオに未対応です。貼り付ける欄が {A}〜{B} 行目のままか確かめてください。';
	const fill = (s, a, b) => s.replace('{A}', String(a)).replace('{B}', String(b));
	const ROWS = readJson('data/melop-sheet-rows.json').rows.map((r) => r.row);
	const FIRST = Math.min(...ROWS), LAST = Math.max(...ROWS);
	const TOOLS = [
		{ name: 'exam', file: 'exam.html', key: 'uma-exam-scenario-notice', seenKeys: { 'uma-exam-ui-notice': 'UI_NOTICE_ID', 'uma-exam-target-notice': 'TARGET_NOTICE_ID', 'uma-exam-edition-notice': 'UmaAnnounce.ANNOUNCE.id' } },
		{ name: 'special', file: 'special.html', key: 'uma-special-scenario-notice', seenKeys: { 'uma-special-ui-notice': 'UI_NOTICE_ID', 'uma-special-alpha-notice': 'ALPHA_NOTICE_ID', 'uma-special-catalog-notice': 'CATALOG_NOTICE_ID' } },
	];
	const noticeOpen = (page) => page.evaluate(() => { const d = document.getElementById('ui-notice'); return !!d && !d.hidden; });
	const allKeys = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
	/** 開く。o.store＝開く前に仕込む保存値（null なら初めての人）／o.query／o.w／o.theme／o.route＝page.route を足す関数 */
	const open = async (t, o = {}) => {
		const r = await openPage(browser, base, t.file + (o.query || ''), { width: o.w || 1280, height: o.h || 900 });
		const page = r.page;
		if (o.route) await o.route(page);
		const store = Object.assign({}, o.store || {});
		if (o.theme) store['uma-tools-theme'] = o.theme;
		if (o.store || o.theme || o.route) {
			await page.evaluate((s) => { try { localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } catch (e) {} }, store);
			await page.reload({ waitUntil: 'networkidle' });
		}
		await page.waitForTimeout(o.wait || 1500);
		return r;
	};
	/** 新シナリオの知らせ以外を「見た」ことにする保存値（告知のIDはページの定数から読む） */
	const seenStore = async (t) => {
		const r = await openPage(browser, base, t.file, { width: 1280, height: 900 });
		const ids = await r.page.evaluate((m) => Object.fromEntries(Object.entries(m).map(([k, e]) => [k, eval(e)])), t.seenKeys);
		await r.ctx.close();
		const s = Object.assign({}, ids);
		s[t.name === 'exam' ? 'uma-exam-ui-mode' : 'uma-special-ui-mode'] = 'new';
		return s;
	};
	const bodyOf = (page) => page.evaluate(() => {
		const b = document.getElementById('ui-notice-body-scenario');
		const dlg = document.getElementById('ui-notice');
		const shown = [...dlg.querySelectorAll('.notice-body > div')].filter((d) => !d.hidden).map((d) => d.id);
		return {
			hidden: b.hidden, shown, kind: uiNoticeKind,
			head: b.querySelector('.announce-h') ? b.querySelector('.announce-h').textContent : null,
			headId: b.querySelector('.announce-h') ? b.querySelector('.announce-h').id : null,
			lead: b.querySelector('.announce-lead') ? b.querySelector('.announce-lead').textContent : null,
			lines: [...b.querySelectorAll('.announce-lines li')].map((e) => e.textContent),
			labelledby: dlg.getAttribute('aria-labelledby'), cls: b.className,
		};
	});

	await block('段1a(1) 小窓の文面が依頼どおり（見出し・導入・箇条）／ページごとに箇条が出し分けられる（exam は行番号がデータの最初と最後）／既読の人には新シナリオだけが1枚で出る', async () => {
		for (const t of TOOLS) {
			const store = await seenStore(t);
			const r = await open(t, { store });
			const b = await bodyOf(r.page);
			assert(await noticeOpen(r.page), `段1a(1) ${t.name}: 小窓が出る`, '');
			assert(b.kind === 'scenario' && !b.hidden && b.shown.join() === 'ui-notice-body-scenario', `段1a(1) ${t.name}: 新シナリオの知らせだけが1枚で出る`, JSON.stringify(b.shown));
			assert(b.head === HEAD, `段1a(1) ${t.name}: 見出しが一致`, b.head);
			assert(b.lead === INTRO, `段1a(1) ${t.name}: 導入が一致`, b.lead);
			const want = LINES[t.name].map((s) => fill(s, FIRST, LAST));
			assert(JSON.stringify(b.lines) === JSON.stringify(want), `段1a(1) ${t.name}: 箇条が一致（${want.length}行）`, JSON.stringify(b.lines));
			assert(b.labelledby === b.headId && b.headId, `段1a(1) ${t.name}: 読み上げの見出しが新シナリオの見出しを指す`, b.labelledby + ' / ' + b.headId);
			assert(!/ヒント|必ず合う|合うことがある|合わない/.test([b.head, b.lead, ...b.lines].join('')), `段1a(1) ${t.name}: 禁じた表現を使っていない`, '');
			assert(b.cls.indexOf('announce-scenario--with') === -1, `段1a(1) ${t.name}: 1枚で出すときは並べ用の線が付かない`, b.cls);
			await r.ctx.close();
		}
	});

	await block('段1a(2) 初めての人にも出る／ほかの告知を出す読み込みでは、その下に並べて小窓は1枚／閉じると両方が既読になり、開き直すと出ない', async () => {
		for (const t of TOOLS) {
			const r = await open(t);   // 初めての人
			const b = await bodyOf(r.page);
			assert(await noticeOpen(r.page), `段1a(2) ${t.name}: 初めての人にも小窓が出る`, '');
			assert(b.kind === 'layout' && !b.hidden, `段1a(2) ${t.name}: 先に出す告知（画面）の下に新シナリオの知らせが並ぶ`, JSON.stringify(b.shown));
			assert(b.cls.indexOf('announce-scenario--with') !== -1, `段1a(2) ${t.name}: 並べるときは線で区切る`, b.cls);
			assert(b.shown[0] === 'ui-notice-body-layout' && b.shown[b.shown.length - 1] === 'ui-notice-body-scenario', `段1a(2) ${t.name}: 新シナリオの知らせがいちばん下`, JSON.stringify(b.shown));
			assert((await r.page.locator('#ui-notice:not([hidden])').count()) === 1, `段1a(2) ${t.name}: 小窓は1枚`, '');
			await r.page.click('#ui-notice-ok');
			await r.page.waitForTimeout(300);
			const keys = await allKeys(r.page);
			const id = await r.page.evaluate(() => UmaAnnounce.SCENARIO_PENDING.id);
			assert(keys[t.key] === id, `段1a(2) ${t.name}: 閉じると ${t.key} に告知のIDが入る`, JSON.stringify(keys[t.key]));
			await r.page.reload({ waitUntil: 'networkidle' });
			await r.page.waitForTimeout(1500);
			assert(!(await noticeOpen(r.page)), `段1a(2) ${t.name}: 開き直すと出ない`, '');
			await r.ctx.close();
		}
	});

	await block('段1a(3) 既読の人には1回だけ出る／✕・OK・背景・Esc のどれで閉じても既読になり、開き直すと出ない／ほかの告知の既読の印は変わらない', async () => {
		for (const t of TOOLS) {
			const store = await seenStore(t);
			for (const how of ['ok', 'x', 'backdrop', 'esc']) {
				const r = await open(t, { store });
				assert(await noticeOpen(r.page), `段1a(3) ${t.name}/${how}: 出る`, '');
				const before = await allKeys(r.page);
				if (how === 'ok') await r.page.click('#ui-notice-ok');
				else if (how === 'x') await r.page.click('#ui-notice .notice-close');
				else if (how === 'backdrop') await r.page.evaluate(() => document.getElementById('ui-notice-backdrop').click());
				else await r.page.keyboard.press('Escape');
				await r.page.waitForTimeout(300);
				const after = await allKeys(r.page);
				const id = await r.page.evaluate(() => UmaAnnounce.SCENARIO_PENDING.id);
				assert(after[t.key] === id, `段1a(3) ${t.name}/${how}: 既読になる`, JSON.stringify(after[t.key]));
				const others = Object.keys(store);
				assert(others.every((k) => after[k] === before[k]), `段1a(3) ${t.name}/${how}: ほかの告知の既読の印は変わらない`, '');
				await r.page.reload({ waitUntil: 'networkidle' });
				await r.page.waitForTimeout(1500);
				assert(!(await noticeOpen(r.page)), `段1a(3) ${t.name}/${how}: 開き直すと出ない`, '');
				await r.ctx.close();
			}
		}
	});

	await block('段1a(4) ?notice=force で既読でも出る（何も書かない）／ID を変えれば再掲される（保存値が別のIDなら出る）', async () => {
		for (const t of TOOLS) {
			const store = Object.assign(await seenStore(t), { [t.key]: await (async () => { const r = await openPage(browser, base, t.file); const id = await r.page.evaluate(() => UmaAnnounce.SCENARIO_PENDING.id); await r.ctx.close(); return id; })() });
			const r = await open(t, { store, query: '?notice=force' });
			const b = await bodyOf(r.page);
			assert(await noticeOpen(r.page) && !b.hidden && b.lines.length === LINES[t.name].length, `段1a(4) ${t.name}: 既読でも ?notice=force で出る`, JSON.stringify(b.shown));
			const before = await allKeys(r.page);
			await r.page.click('#ui-notice-ok');
			await r.page.waitForTimeout(300);
			const after = await allKeys(r.page);
			assert(JSON.stringify(before) === JSON.stringify(after), `段1a(4) ${t.name}: force のときは何も書かない`, '');
			await r.ctx.close();
			// 別のIDが保存されている（＝ID を変えた後の状態）なら、既読でも出る
			const r2 = await open(t, { store: Object.assign({}, store, { [t.key]: 'old-id' }) });
			assert(await noticeOpen(r2.page), `段1a(4) ${t.name}: 保存値が別のIDなら、もう一度出る`, '');
			await r2.ctx.close();
		}
	});

	await block('段1a(5) exam: めろっぷの説明の下の常時の1行が出る（小窓を閉じた後も）／行番号はデータの最初と最後の行番号から出る（行を足した合成データで追従）', async () => {
		const t = TOOLS[0];
		const store = Object.assign(await seenStore(t), { [t.key]: await (async () => { const r = await openPage(browser, base, t.file); const id = await r.page.evaluate(() => UmaAnnounce.SCENARIO_PENDING.id); await r.ctx.close(); return id; })() });
		const r = await open(t, { store });
		assert(!(await noticeOpen(r.page)), '段1a(5) 小窓を閉じた状態（既読）', '');
		const note = await r.page.evaluate(() => { const e = document.getElementById('melop-scenario-note'); const d = e.previousElementSibling; const b = e.getBoundingClientRect(); return { text: e.textContent, hidden: e.hidden, next: !!d, y: b.top, py: d ? d.getBoundingClientRect().bottom : null }; });
		assert(note.text === fill(ALWAYS, FIRST, LAST) && !note.hidden, '段1a(5) 常時の1行の文面が一致し、見えている', note.text);
		assert(note.py !== null && note.y >= note.py - 1, '段1a(5) 常時の1行は、めろっぷの説明の下にある', JSON.stringify(note));
		await r.ctx.close();
		// 合成データ: 最初の行を前へ、最後の行を後ろへ足す
		const doc = readJson('data/melop-sheet-rows.json');
		const synth = JSON.parse(JSON.stringify(doc));
		synth.rows.unshift({ row: FIRST - 3, group: '合成', name: '合成の最初' });
		synth.rows.push({ row: LAST + 11, group: '合成', name: '合成の最後' });
		const route = async (page) => page.route('**/data/melop-sheet-rows.json*', (rt) => rt.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(synth) }));
		const r2 = await open(t, { store, route });
		const n2 = await r2.page.evaluate(() => document.getElementById('melop-scenario-note').textContent);
		assert(n2 === fill(ALWAYS, FIRST - 3, LAST + 11), '段1a(5) 行を足した合成データで、常時の1行の行番号が追従する', n2);
		await r2.ctx.close();
		const r3 = await open(t, { store: await seenStore(t), route });
		const b3 = await bodyOf(r3.page);
		assert(b3.lines[1] === fill(LINES.exam[1], FIRST - 3, LAST + 11), '段1a(5) 小窓の箇条の行番号も追従する', b3.lines[1]);
		await r3.ctx.close();
		// 読めないとき: 行番号を含む文は出さない（文字化けした {…} を出さない）
		const bad = async (page) => page.route('**/data/melop-sheet-rows.json*', (rt) => rt.fulfill({ status: 500, body: 'x' }));
		const r4 = await open(t, { store: await seenStore(t), route: bad });
		const b4 = await bodyOf(r4.page);
		const n4 = await r4.page.evaluate(() => { const e = document.getElementById('melop-scenario-note'); return { text: e.textContent, hidden: e.hidden }; });
		assert(b4.lines.every((s) => s.indexOf('{') === -1) && b4.lines.length === LINES.exam.length - 1 && n4.hidden && n4.text === '', '段1a(5) データを読めないときは、行番号を含む文だけを出さない', JSON.stringify([b4.lines.length, n4]));
		await r4.ctx.close();
		// special には常時の1行は無い
		const rs = await open(TOOLS[1]);
		assert((await rs.page.locator('#melop-scenario-note').count()) === 0, '段1a(5) special には常時の1行は無い', '');
		await rs.ctx.close();
	});

	await block('段1a(6) 見た目: 390・1280px × ライト・ダークで、小窓（1枚・並べた2枚分）と exam の常時の1行 ―― 横スクロールなし・エラー0・文字のコントラスト 4.5:1 以上', async () => {
		const toRgb = (c) => (/rgba?\((\d+), (\d+), (\d+)/.exec(c || '') || []).slice(1, 4).map(Number);
		const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
		const ratio = (a, b) => { const x = lum(toRgb(a)), y = lum(toRgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
		const worst = [];
		for (const t of TOOLS) {
			for (const w of [390, 1280]) {
				for (const theme of ['light', 'dark']) {
					for (const stacked of [false, true]) {
						const store = stacked ? null : await seenStore(t);
						const r = await open(t, { w, theme, store: stacked ? {} : store });
						const m = await r.page.evaluate(() => {
							const dlg = document.getElementById('ui-notice');
							const eff = (el) => { let e = el; while (e) { const bg = getComputedStyle(e).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg; e = e.parentElement; } return 'rgb(255, 255, 255)'; };
							const out = [];
							const targets = [...document.querySelectorAll('#ui-notice-body-scenario .announce-h, #ui-notice-body-scenario .announce-lead, #ui-notice-body-scenario .announce-lines li')];
							const note = document.getElementById('melop-scenario-note');
							if (note && !note.hidden) targets.push(note);
							targets.forEach((e) => out.push({ cls: e.className || e.tagName, fg: getComputedStyle(e).color, bg: eff(e) }));
							const scroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
							const dr = dlg.getBoundingClientRect();
							return { out, scroll, open: !dlg.hidden, inView: dr.left >= -1 && dr.right <= window.innerWidth + 1 };
						});
						const tag = `${t.name}/${w}/${theme}/${stacked ? '並べ' : '単独'}`;
						assert(m.open, `段1a(6) ${tag}: 小窓が出る`, '');
						assert(!m.scroll && m.inView, `段1a(6) ${tag}: 横スクロールなし・小窓が画面に収まる`, JSON.stringify(m));
						m.out.forEach((o) => { const c = ratio(o.fg, o.bg); worst.push(c); assert(c >= 4.5, `段1a(6) ${tag}: ${o.cls} のコントラスト ${c.toFixed(2)}:1`, o.fg + ' on ' + o.bg); });
						assert(jsErrors(r.errors).length === 0, `段1a(6) ${tag}: エラー0`, JSON.stringify(jsErrors(r.errors)));
						await r.ctx.close();
					}
				}
			}
		}
		console.log('     段1a(6) コントラストの最小 ' + Math.min(...worst).toFixed(2) + ':1');
	});
}
