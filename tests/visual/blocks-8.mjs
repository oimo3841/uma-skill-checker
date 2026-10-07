// 段8（2026-10-03・C-120）の検査。run-smoke.mjs の末尾から register8() で呼ばれる（塊の見出しは「段8」を含む。
// `npm run test:visual -- --only=段8` で回せる）。
//
// ①本育成編成と②因子周回を1つの「セット」（template ＋ その baseRosterId が指す roster）にし、
// 配置を「合計 → 設定 → 入力 → 一覧」に揃えた。
//   (A) データの移行（schemaVersion 5 → 6）と、書き出し・読み込みの往復
//   (B) 共通の見出しの帯（sticky・セット名・✎・一覧の小窓・削除・合計と?）
//   (C) ①の並び（合計 → パネル → 前段 → 絞り込み → 表）・回復の地・前段の「└」
//   (D) ②の白いパネル（段9 で外した。blocks-9.mjs の段9(C)(D)(E) へ）
//   (E) シナリオ因子／遺伝子のチェックは③の先頭
//   375px の高さ（帯・①の表の上端・②の一覧の上端・行の高さ）と合計の整合
export async function register8(env) {
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
	const rgb = (s) => (/rgba?\((\d+), (\d+), (\d+)/.exec(s) || []).slice(1, 4).join(',');

	/** 開いて、下書き（①②）とタブを仕込み直す。userData は openPage が毎回の読み込みで入れ直す */
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
	/** ①の表で、本育成で得る（●・オン）スキルの id */
	const takenOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]'))
		.filter((r) => r.querySelector('.usd-roster-got') && !r.classList.contains('usd-roster-grow--off')).map((r) => r.getAttribute('data-skill-id')));
	const barNums = (page) => page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		const tot = q('#deck-set-bar [data-usd-el="set-total"]');
		return { total: tot ? Number(tot.getAttribute('data-total')) : null, totalText: (q('#deck-set-bar [data-usd-el="set-total-num"]') || {}).textContent || null,
			sub: (q('#deck-set-bar [data-usd-el="set-total-sub"]') || {}).textContent || null, name: (q('#deck-set-bar [data-usd-el="set-name"]') || {}).textContent || null,
			count: (q('#deck-set-bar [data-usd-el="set-count"]') || {}).textContent || null };
	});

	/* ====================================================================
	 * (A) データの移行と往復
	 * ==================================================================== */
	await block('段8(A) セットへの移行（schemaVersion 5 → 6）と書き出し・読み込みの往復', async () => {
		const R = (id, name, uma) => ({ rosterId: id, name, umaId: uma, star: 3, awakeningLevel: 5, cardIds: ['card-0248', null, null, null, null, null], createdAt: 'x', updatedAt: 'x' });
		const Tp = (id, name, b) => Object.assign({ templateId: id, name, skillIds: ['1'], createdAt: 'x', updatedAt: 'x' }, b ? { baseRosterId: b } : {});
		const v5 = { schemaVersion: 5, records: [{ recordId: 'rec1', name: 'シート', sourceTemplateId: 't1', skillIds: ['1'], candidates: [], cells: {}, createdAt: 'x', updatedAt: 'x' }], customSkills: [],
			templates: [Tp('t1', 'A', 'r1'), Tp('t2', 'B', 'r1'), Tp('t3', 'C', 'rX'), Tp('t4', 'D')],
			rosters: [R('r1', '旧名', 'uma-0001'), R('r2', 'E', 'uma-0002'), R('r3', 'F', 'uma-0003'), R('r4', 'G', 'uma-0004'), R('r5', 'H', 'uma-0005'), R('r6', 'I', 'uma-0006'), R('r7', 'J', 'uma-0007'), R('r8', 'K', 'uma-0008')] };
		const sp = await openSet({ userData: v5, tab: 1, roster: null });
		const toastText = await sp.page.evaluate(() => document.getElementById('toast-message').textContent);
		const d = await ud(sp.page);
		const t = (id) => d.templates.find((x) => x.templateId === id);
		const rr = (id) => d.rosters.find((x) => x.rosterId === id);
		assert(d.schemaVersion === 6, '段8(A): 移行後の schemaVersion は 6', d.schemaVersion);
		assert(t('t1').baseRosterId === 'r1' && rr('r1').name === 'A', '段8(A)(a): 指している roster はそのまま1セット。roster の name を template.name に揃える', [t('t1'), rr('r1').name]);
		const copy = rr(t('t2').baseRosterId);
		assert(t('t2').baseRosterId !== 'r1' && copy && copy.name === 'B' && copy.umaId === 'uma-0001', '段8(A)(a\'): 同じ roster を指す2件目は写し（新しい rosterId・名前は自分の名前・中身は同じ）', [t('t2').baseRosterId, copy]);
		assert(!('baseRosterId' in t('t3')), '段8(A)(a\'\'): 指す先が無い baseRosterId は消す（①が空のセット）', t('t3'));
		assert(!('baseRosterId' in t('t4')) && t('t4').skillIds.length === 1, '段8(A)(c): roster の無い template は①が空のセット（何も足さない）', t('t4'));
		const made = d.templates.slice(4);
		assert(made.length === 6 && made.every((x) => x.skillIds.length === 0 && rr(x.baseRosterId) && rr(x.baseRosterId).name === x.name) && made.map((x) => x.name).join() === 'E,F,G,H,I,J',
			'段8(A)(b): 指されていない roster は、同じ名前の新しい template（スキル0件）を作って付ける（並び順に）', made.map((x) => x.name + '->' + x.baseRosterId));
		assert(d.templates.length === 10 && !!rr('r8') && !d.templates.some((x) => x.baseRosterId === 'r8'), '段8(A)(d): 10件を超えたぶん（K）はセットにしない。roster は残る（書き出しに含まれる）', d.templates.length);
		assert(toastText === 'セットが10件を超えたため、1件は読み込んでいません', '段8(A)(d): 知らせ「セットが10件を超えたため、N件は読み込んでいません」', toastText);
		assert(d.records.length === 1 && d.records[0].recordId === 'rec1', '段8(A): 比較シートは触らない', d.records);
		// 往復: いまのデータ（6）を書き出して読み込む → 何も変わらない（移行は走らない）
		const round = await sp.page.evaluate(() => {
			const before = localStorage.getItem('umaSkillDeck:userData');
			UmaSkillDeckCore.replaceUserData(JSON.parse(before));
			const after = localStorage.getItem('umaSkillDeck:userData');
			return { same: JSON.stringify(JSON.parse(before)) === JSON.stringify(JSON.parse(after)) };
		});
		assert(round.same, '段8(A): v6 の書き出し → 読み込みで、templates・rosters・records が欠けない（中身が同じ）', round);
		// v5 の書き出しを読み込むと、同じ移行が走る（取り込みの経路）
		const imp = await sp.page.evaluate((v) => { UmaSkillDeckCore.replaceUserData(JSON.parse(JSON.stringify(v))); return JSON.parse(localStorage.getItem('umaSkillDeck:userData')); }, v5);
		assert(imp.schemaVersion === 6 && imp.templates.length === 10 && imp.rosters.length === 9 && imp.rosters.some((x) => x.rosterId === 'r8'), '段8(A): v5 の書き出しを読み込むと、読み込み時と同じ移行が走る（roster は消えない）', { n: imp.templates.length, r: imp.rosters.length });
		assert(jsErrors(sp.errors).length === 0, '段8(A): コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
		// 移すものが無いデータ（rosters も baseRosterId も無い）は触らない（schemaVersion も上げない）
		const sp2 = await openSet({ tab: 1, roster: null });
		const d2 = await ud(sp2.page);
		assert(d2.schemaVersion === USER_DATA.schemaVersion && !('rosters' in d2), '段8(A): 移すものが無いデータは開いただけでは姿を変えない', { schema: d2.schemaVersion });
		await sp2.ctx.close();
	});

	/* ====================================================================
	 * (B) 共通の見出しの帯
	 * ==================================================================== */
	const SETS = { schemaVersion: 6, records: [], customSkills: [],
		templates: [{ templateId: 't1', name: '中距離・差し 想定', skillIds: ['1', '2'], createdAt: 'x', updatedAt: 'x', baseRosterId: 'r1' }, { templateId: 't2', name: 'ダート', skillIds: ['3'], createdAt: 'x', updatedAt: 'x' }],
		rosters: [Object.assign({ rosterId: 'r1', name: '中距離・差し 想定', star: 3, awakeningLevel: 5, createdAt: 'x', updatedAt: 'x', pt: { umaHintLevel: 3, status: 'kire' } }, { umaId: 'uma-0002', cardIds: ['card-0250', 'card-0251', null, null, null, null] })] };
	await block('段8(B) 共通の見出しの帯（sticky・名前・一覧・削除・合計）', async () => {
		for (const w of [375, 1280]) {
			const tag = '段8(B) ' + w + 'px: ';
			// C-132: スマホの本文の下の余白を「＋」の置き場だけにしたので、スクロールできる量を作るために 375px の画面の高さを 640 → 420 にした
			const sp = await openSet({ w, h: w === 375 ? 420 : 480, userData: SETS, tab: 1, scope: { skillIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], name: '', updatedAt: '' } });
			const g = await sp.page.evaluate(() => {
				const bar = document.getElementById('deck-set-bar');
				const tabs = document.querySelector('.step-tabs');
				return { shown: !bar.hidden, h: bar.getBoundingClientRect().height, beforeTabs: bar.getBoundingClientRect().bottom <= tabs.getBoundingClientRect().top + 1,
					rosterTabs: !!document.querySelector('#deck-roster-panel [data-usd-el="roster-tabs"]'), tmTabs: !!document.querySelector('#deck-template-panel [data-usd-el="tabs"]'),
					numFs: getComputedStyle(document.querySelector('#deck-set-bar [data-usd-el="set-total-num"]')).fontSize, numFw: getComputedStyle(document.querySelector('#deck-set-bar [data-usd-el="set-total-num"]')).fontWeight,
					subFs: getComputedStyle(document.querySelector('#deck-set-bar [data-usd-el="set-total-sub"]')).fontSize };
			});
			assert(g.shown && g.beforeTabs && (w !== 375 || g.h <= 40), tag + '帯はステップのタブの上にあり、375px で高さ 40px 以下（' + g.h + 'px）', g);
			assert(!g.rosterTabs && !g.tmTabs, tag + '①②のタブの帯（＋新規／保存済みのチップ）は無い', g);
			// 段9（C-121）: 数字は 18px（太字）、2行目は 10.5px。見出しの帯の細かい形は blocks-9.mjs の段9(D)
				assert(g.numFs === '18px' && Number(g.numFw) >= 700 && g.subFs === '10.5px', tag + '合計の数字は 18px の太字、2行目は 10.5px', g);
			let b = await barNums(sp.page);
			assert(b.name === '＋新規' && b.count === '2／10', tag + '左：セット名（＋新規）と「保存数／10」', b);
			// sticky: 下へスクロールしても帯は画面の上に残る（ヘッダーは残らない）
			// 帯の元の位置より下までスクロールする（画面の高さを小さくして、スクロールできる量を作ってある）
			await sp.page.evaluate(() => scrollTo(0, document.getElementById('deck-set-bar').getBoundingClientRect().top + scrollY + 120));
			await sp.page.waitForTimeout(150);
			const st = await sp.page.evaluate(() => ({ y: scrollY, bar: Math.round(document.getElementById('deck-set-bar').getBoundingClientRect().top), header: Math.round(document.querySelector('.site-header').getBoundingClientRect().bottom) }));
			assert(st.y > 0 && st.bar === 0 && st.header <= 0, tag + 'スクロールしても帯は画面の上（top 0）に残り、ヘッダーは残らない', st);
			await sp.page.evaluate(() => scrollTo(0, 0));
			// 一覧の小窓で t1 を選ぶ → ①は t1 の編成（uma-0002）、帯の名前・状態（切れ者）
			await sp.page.click(BAR + '[data-usd-act="set-list"]');
			const items = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="set-list"] label')).map((l) => l.textContent));
			assert(items.join() === '＋新規,中距離・差し 想定,ダート', tag + '一覧の小窓：＋新規と保存済みのセット（ラジオ）', items);
			await sp.page.click('[data-usd-el="set-list"] input[value="t1"]');
			await sp.page.waitForTimeout(250);
			await sp.page.evaluate(() => selectStepTab(0, { noSave: true }));
			await sp.page.waitForTimeout(200);
			const r1 = await sp.page.evaluate(() => ({ uma: document.querySelector('#deck-roster-panel .usd-roster-umabox').textContent, rosterPt: Number(document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]').textContent.replace(/[^0-9]/g, '')),
				factorPt: Number((document.querySelector('#deck-template-panel [data-usd-el="factor-pt"]') || {}).textContent.replace(/[^0-9]/g, '')) }));
			b = await barNums(sp.page);
			assert(/スペシャルウィーク/.test(r1.uma) && b.name === '中距離・差し 想定' && b.sub === '切れ者・①＋②', tag + 'セットを切り替えると①はそのセットの編成。2行目は①の割引（切れ者）', { r1, b });
			assert(b.total === r1.rosterPt + r1.factorPt && num(b.totalText) === b.total, tag + '見出しの合計 ＝ ①の X ＋ ②の X（' + r1.rosterPt + ' ＋ ' + r1.factorPt + '）', { b, r1 });
			await sp.page.click(BAR + '[data-usd-act="set-total-help"]');
			const formula = await sp.page.evaluate(() => (document.querySelector('[data-usd-el="set-total-formula"]') || {}).textContent);
			assert(formula === '合計 ＝ ① ' + r1.rosterPt.toLocaleString('en-US') + ' ＋ ② ' + r1.factorPt.toLocaleString('en-US'), tag + '?の中：合計 ＝ ① X ＋ ② Y', formula);
			await sp.page.keyboard.press('Escape');
			// ✎ で名前を変える → template と roster の両方。Esc は取り消し
			await sp.page.click(BAR + '[data-usd-act="name-edit"]');
			await sp.page.fill(BAR + '[data-usd-el="name"]', '取り消す');
			await sp.page.keyboard.press('Escape');
			await sp.page.waitForTimeout(150);
			b = await barNums(sp.page);
			assert(b.name === '中距離・差し 想定', tag + '✎ の入力は Esc で取り消し', b);
			await sp.page.click(BAR + '[data-usd-act="name-edit"]');
			await sp.page.fill(BAR + '[data-usd-el="name"]', '中距離2');
			await sp.page.keyboard.press('Enter');
			await sp.page.waitForTimeout(150);
			await sp.page.click(P + '[data-usd-act="clear-card"]');   // ①に触っても古い名前に戻らない
			await sp.page.waitForTimeout(150);
			let d = await ud(sp.page);
			assert(d.templates[0].name === '中距離2' && d.rosters.find((r) => r.rosterId === 'r1').name === '中距離2', tag + '名前は Enter で確定。template と付いている roster の両方が変わる（①を触っても戻らない）', [d.templates[0].name, d.rosters.map((r) => r.name)]);
			// ＋新規 → ✎ → Enter で保存（①の下書きに中身があれば、写しを付ける）
			await sp.page.click(BAR + '[data-usd-act="set-list"]');
			await sp.page.click('[data-usd-el="set-list"] input[value=""]');
			await sp.page.waitForTimeout(200);
			await sp.page.click(BAR + '[data-usd-act="name-edit"]');
			await sp.page.fill(BAR + '[data-usd-el="name"]', '新しいセット');
			await sp.page.keyboard.press('Enter');
			await sp.page.waitForTimeout(200);
			d = await ud(sp.page);
			const nt = d.templates.find((x) => x.name === '新しいセット');
			const nr = nt && d.rosters.find((r) => r.rosterId === nt.baseRosterId);
			b = await barNums(sp.page);
			assert(nt && nr && nr.name === '新しいセット' && nr.umaId === REAL.umaId && b.count === '3／10', tag + '＋新規に名前を付けると保存（①の下書きの写しを付ける。名前は同じ）', { nt, nr: nr && nr.name, b });
			// 削除（確認の小窓）→ template と roster の両方。右下の「元に戻す」で両方戻る
			await sp.page.click(BAR + '[data-usd-act="set-list"]');
			await sp.page.click('[data-usd-el="set-delete"]');
			await sp.page.click('[data-usd-el="confirm-ok"]');
			await sp.page.waitForTimeout(200);
			d = await ud(sp.page);
			assert(!d.templates.some((x) => x.name === '新しいセット') && !d.rosters.some((r) => r.rosterId === nr.rosterId), tag + '削除は確認の小窓のあと、template と付いている roster の両方を消す', d.templates.map((x) => x.name));
			await sp.page.click('#deck-undo-btn');
			await sp.page.waitForTimeout(200);
			d = await ud(sp.page);
			assert(d.templates.some((x) => x.name === '新しいセット') && d.rosters.some((r) => r.rosterId === nr.rosterId), tag + '「元に戻す」で両方戻る', d.templates.map((x) => x.name));
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		// 上限: 10件のときは「＋新規」へ移れない（一覧の小窓で選べず、知らせを出す）
		const ten = { schemaVersion: 6, records: [], customSkills: [], rosters: [], templates: Array.from({ length: 10 }, (_, i) => ({ templateId: 'tt' + i, name: 'S' + i, skillIds: [], createdAt: 'x', updatedAt: 'x' })) };
		const sp = await openSet({ userData: ten, tab: 1, roster: null });
		await sp.page.click(BAR + '[data-usd-act="set-list"]');
		await sp.page.click('[data-usd-el="set-list"] input[value="tt3"]');
		await sp.page.waitForTimeout(200);
		await sp.page.click(BAR + '[data-usd-act="set-list"]');
		const lim = await sp.page.evaluate(() => ({ dis: document.querySelector('[data-usd-el="set-list"] input[value=""]').disabled, note: (document.querySelector('[data-usd-el="info-pop"] [data-usd-el="limit-notice"]') || {}).textContent }));
		assert(lim.dis && /10件まで/.test(lim.note || ''), '段8(B): 10件のときは一覧の小窓で「＋新規」を選べず、知らせを出す', lim);
		await sp.ctx.close();
		// ①が空のセット: ①に触れたときに初めて編成を作り、セットに付ける（名前はセット名）
		const sp3 = await openSet({ userData: SETS, tab: 0, roster: null });
		await sp3.page.click(BAR + '[data-usd-act="set-list"]');
		await sp3.page.click('[data-usd-el="set-list"] input[value="t2"]');
		await sp3.page.waitForTimeout(200);
		let d3 = await ud(sp3.page);
		assert(!('baseRosterId' in d3.templates[1]), '段8(B): ①が空のセットは、開いただけでは編成を作らない', d3.templates[1]);
		await sp3.page.click(P + '[data-usd-act="pick-uma"]');
		await sp3.page.waitForTimeout(300);
		await sp3.page.click('[data-usd-act="take"]');   // 一覧の先頭の育成ウマ娘を選ぶ
		await sp3.page.waitForTimeout(200);
		d3 = await ud(sp3.page);
		const lr = d3.templates[1].baseRosterId && d3.rosters.find((r) => r.rosterId === d3.templates[1].baseRosterId);
		assert(lr && lr.name === 'ダート', '段8(B): ①に触れたときに編成を作り、そのセットに付ける（名前はセット名）', { t: d3.templates[1], lr });
		await sp3.ctx.close();
	});

	/* ====================================================================
	 * (C) ①の並びと表
	 * ==================================================================== */
	await block('段8(C) ①の並び（合計 → パネル → 前段 → 絞り込み → 表）・回復の地・前段の「└」', async () => {
		for (const w of [375, 1280]) {
			const tag = '段8(C) ' + w + 'px: ';
			const sp = await openSet({ w, h: w === 375 ? 812 : 900, tab: 0 });
			const o = await sp.page.evaluate(() => {
				const top = (s) => { const e = document.querySelector('#deck-roster-panel ' + s); return e ? e.getBoundingClientRect().top : null; };
				return { sum: top('[data-usd-el="pt-sum"]'), panel: top('.usd-roster-lower'), prev: top('[data-usd-el="pt-prev"]'), filter: top('[data-usd-el="filter-row"]'), grid: top('.usd-roster-grid-wrap') };
			});
			assert(o.sum !== null && o.prev !== null && o.sum < o.panel && o.panel < o.prev && o.prev < o.filter && o.filter < o.grid, tag + '並びは Pt の行 → パネル → 前段の行 → 絞り込み → 表', o);
			const rows = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')).map((r) => {
				const name = r.querySelector('.usd-roster-gc--name');
				return { id: r.getAttribute('data-skill-id'), cls: r.className, nameBg: getComputedStyle(name).backgroundColor, padL: parseFloat(getComputedStyle(name).paddingLeft),
					mark: (r.querySelector('[data-usd-el="prev-mark"]') || {}).textContent || '', markColor: r.querySelector('[data-usd-el="prev-mark"]') ? getComputedStyle(r.querySelector('[data-usd-el="prev-mark"]')).color : null,
					nameColor: getComputedStyle(r.querySelector('.usd-roster-skillname')).color };
			}));
			const heal = rows.filter((r) => r.cls.includes('usd-roster-grow--heal') && !r.cls.includes('--gold') && !r.cls.includes('--unique') && !r.cls.includes('--off'));
			assert(heal.length >= 2 && heal.every((r) => r.nameBg === 'rgb(255, 255, 255)' || r.nameBg === 'rgba(0, 0, 0, 0)') && heal.every((r) => rgb(r.nameColor) === '11,95,165'),
				tag + '回復の行は地が白で、名前の文字だけ青（' + heal.length + '行）', heal.slice(0, 3));
			const prevRows = rows.filter((r) => r.cls.includes('usd-roster-grow--prev'));
			const normal = rows.find((r) => !r.cls.includes('usd-roster-grow--prev'));
			assert(prevRows.length >= 2 && prevRows.every((r) => r.mark === '└' && r.padL === normal.padL) && rows.filter((r) => r.mark).length === prevRows.length,
				tag + '前段の白の行は字下げをやめ（左の余白はほかの行と同じ ' + normal.padL + 'px）、名前の先頭に「└」（' + prevRows.length + '行）', prevRows.slice(0, 2));
			assert(prevRows.every((r) => r.markColor !== r.nameColor), tag + '「└」は名前より薄い色', prevRows[0] && [prevRows[0].markColor, prevRows[0].nameColor]);
			// 金の直下に前段（段7e の決まりのまま）
			const ids = rows.map((r) => r.id);
			const bad = prevRows.filter((r) => { const i = ids.indexOf(r.id); const g = ids[i - 1]; return !(rarityOf.get(g) === 'gold' && (prevOf.get(g) || []).includes(r.id)); });
			assert(bad.length === 0, tag + '「└」の行は、その金スキルの直下（段7e のまま）', bad.map((r) => r.id));
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * (D) ②因子周回 ―― 段9（C-121）で外した。②は「帯・設定の枠・スキルのまとまり」の3つに組み直し、ランク（超優先／優先／通常）のチップと
	 * その ON/OFF（ptRanks）・分類のタブ・再分類・削除のモードをやめたので、見張る対象が無くなった。
	 * 新しい仕様は blocks-9.mjs の段9(C)（②の合計・①で取得・継承固有）・段9(D)（帯・設定の枠・まとまり・パレット・行）・段9(E)（リセット）。
	 * ==================================================================== */

	/* ====================================================================
	 * (E) シナリオ因子／遺伝子のチェックは③の先頭
	 * ==================================================================== */
	await block('段8(E) シナリオ因子／遺伝子のチェックは③の先頭の1行', async () => {
		const sp = await openSet({ tab: 2, roster: null });
		const g = await sp.page.evaluate(() => {
			const bar = document.getElementById('deck-scopes-bar');
			const panel = document.getElementById('step-panel-2');
			const first = Array.from(panel.children).find((c) => !c.hidden && c.getClientRects().length);
			return { inPanel: panel.contains(bar), first: first === bar, checks: bar.querySelectorAll('[data-usd-act="scope-check"]').length, help: bar.querySelectorAll('[data-usd-act="scope-help"]').length,
				inTwo: !!document.querySelector('#step-panel-1 [data-usd-act="scope-check"]'), rows: new Set(Array.from(bar.querySelectorAll('.uma-checkrow')).map((r) => Math.round(r.getBoundingClientRect().top))).size };
		});
		assert(g.inPanel && g.first && g.checks === 2 && g.help === 2 && !g.inTwo && g.rows === 1, '段8(E): ③のパネルの先頭の1行に、チェック2つと「?」2つ（②には無い）', g);
		await sp.page.check('#deck-scopes-bar [data-usd-act="scope-check"][data-scope="genes"]');
		await sp.page.waitForTimeout(150);
		const saved = await sp.page.evaluate(() => (JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special')) || {}).scopes);
		assert(saved && saved.genes === true, '段8(E): チェックの保存は今のまま（下書きの scopes）', saved);
		await sp.page.click('#deck-scopes-bar [data-usd-act="scope-help"][data-scope="genes"]');
		await sp.page.waitForTimeout(150);
		const list = await sp.page.evaluate(() => { const m = document.querySelector('[data-usd-el="scope-list-modal"]'); return m && !m.hidden ? m.querySelectorAll('li').length : 0; });
		assert(list === 10, '段8(E): 「?」で一覧の小窓（遺伝子 10種）', list);
		assert(jsErrors(sp.errors).length === 0, '段8(E): コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * 375px の高さ（段7f の最終：①の表の上端 351px・②の一覧の上端 474px・行 31px）
	 * ==================================================================== */
	await block('段8 375px の高さ（帯 40px 以下・①の表の上端 351px 以下・②の一覧の上端 400px 以下）', async () => {
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
			assert(jsErrors(sp.errors).length === 0, '段8 375px: コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		console.log('     [実測] 375px: 帯 ' + m.bar + 'px／①の表の上端 ' + m.grid + 'px（段7f 351px）／②の一覧の上端 ' + m.list + 'px（段7f 474px）／行 ' + m.row + 'px（段7f 31px）');
		assert(m.bar <= 40 && m.grid <= 351 && m.list <= 400 && m.row === 31, '段8 375px: 帯 ' + m.bar + 'px・①の表の上端 ' + m.grid + 'px・②の一覧の上端 ' + m.list + 'px・行 ' + m.row + 'px', m);
	});
}
