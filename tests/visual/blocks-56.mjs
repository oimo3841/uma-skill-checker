// セッションJ・作業3（2026-10-27）: ①本育成編成の「サポートカードを選ぶ」の小窓を SSR だけにした検査。
// run-smoke.mjs の末尾から register56() で呼ばれる（塊の見出しはすべて「J作業3」で始まる。`npm run test:visual -- --only=J作業3` で回せる）。
//
// (1) 小窓の一覧・検索・種類の絞り込みに出るのは SSR だけ。件数の文（「全N件のうち…」「N件」）の N は SSR の数（data/support-cards.json から数える）
// (2) 保存済みの①の編成に R・SR が入っていても、そのまま表示し、計算も今までどおり（変更前の commit 966ea94 で実測した固定値と同じ）
// (3) オススメサポの残りの枠から開く小窓は変えない（R・SR も出る。blocks-45 の C-186 の塊も R の候補を見ている）
// 見た目: 390・1280 で横スクロールなし・コンソールのエラー0
// 作業4（見出しは「J作業4」）: キャラクター共通のイベントの固定の印（fixed・when）で、見出しが「固定イベント（時期）」になる（合成のデータ）

import crypto from 'node:crypto';

export async function register56(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const CARDS = readJson('data/support-cards.json').entries;
	const rarityOf = new Map(CARDS.map((c) => [c.id, c.rarity]));
	const SSR = CARDS.filter((c) => c.rarity === 'SSR');
	const RP = '#deck-roster-panel ';
	const sleep = (page, ms) => page.waitForTimeout(ms);

	const openSp = async (w, roster) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w === 1280 ? 900 : 844 }, EMPTY);
		await sp.page.evaluate((ro) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(ro));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '0');
		}, roster);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(RP + '.usd-roster-grid', { timeout: 15000 });
		await sleep(sp.page, 600);
		return sp;
	};
	const readHits = (page) => page.evaluate(() => ({
		ids: [...document.querySelectorAll('[data-usd-el="modal"] [data-usd-el="hits"] .usd-name-hit')].map((h) => h.getAttribute('data-entry-id')),
		n: document.querySelectorAll('[data-usd-el="modal"] [data-usd-el="hits"] .usd-name-hit').length,
		note: (document.querySelector('[data-usd-el="modal"] [data-usd-el="hits"] .usd-roster-note') || {}).textContent || null,
		hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }));
	// 件数の文の期待（renderHits と同じ決まり。上限は PICK_LIST_LIMIT＝60）
	const noteOf = (total) => total > 60 ? '全' + total + '件のうち 60件を出しています。名前を入れると絞り込めます。' : total + '件';

	await block('J作業3(1) ①の「サポートカードを選ぶ」の小窓: 一覧・検索・種類の絞り込みは SSR だけ・件数の文は SSR の数（390・1280）', async () => {
		for (const w of [390, 1280]) {
			const tag = 'J作業3(1) ' + w + 'px: ';
			const sp = await openSp(w, { umaId: 'uma-0179', cardIds: [null, null, null, null, null, null], skillFilter: {} });
			await sp.page.click(RP + '[data-usd-el="roster-tile"][data-index="0"] [data-usd-act="pick-card"]');
			await sp.page.waitForSelector('[data-usd-el="modal"] [data-usd-el="find"]', { timeout: 10000 });
			await sleep(sp.page, 400);
			// すべて・名前なし
			const all = await readHits(sp.page);
			const nonSsr = all.ids.filter((id) => id && rarityOf.get(id) !== 'SSR');
			assert(all.n === Math.min(60, SSR.length) && all.ids.every(Boolean) && nonSsr.length === 0, tag + '「すべて」の一覧は SSR だけ（' + all.n + '件・SSR 以外 0件）', { n: all.n, nonSsr: nonSsr.slice(0, 3) });
			assert(all.note === noteOf(SSR.length), tag + '件数の文は SSR の数（' + SSR.length + '）: ' + all.note, all.note);
			// 検索: R・SR・SSR を持つキャラクター（吾妻は SSR 1・R 1）
			await sp.page.fill('[data-usd-el="modal"] [data-usd-el="find"]', '吾妻');
			await sleep(sp.page, 500);
			const az = await readHits(sp.page);
			const wantAz = SSR.filter((c) => c.charaName === '吾妻').map((c) => c.id);
			assert(az.ids.length === wantAz.length && az.ids.every((id) => wantAz.includes(id)) && az.note === noteOf(wantAz.length), tag + '「吾妻」で探すと SSR の ' + wantAz.join('・') + ' だけ（［巫女］吾妻〔R〕は出ない）', az);
			await sp.page.fill('[data-usd-el="modal"] [data-usd-el="find"]', '巫女');
			await sleep(sp.page, 500);
			const mk = await readHits(sp.page);
			assert(mk.n === 0, tag + '「巫女」（R だけ）で探すと 0件', mk);
			await sp.page.fill('[data-usd-el="modal"] [data-usd-el="find"]', '');
			await sleep(sp.page, 400);
			// 種類の絞り込み（6つ）
			const types = await sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="modal"] [data-usd-el="types"] .usd-roster-pill--typed')].map((b) => b.getAttribute('data-value')));
			assert(types.length === 6, tag + '種類のピルは6つ', types);
			for (const t of types) {
				await sp.page.click('[data-usd-el="modal"] [data-usd-el="types"] .usd-roster-pill[data-value="' + t + '"]');
				await sleep(sp.page, 300);
				const r = await readHits(sp.page);
				const want = SSR.filter((c) => c.type === t).length;
				const bad = r.ids.filter((id) => rarityOf.get(id) !== 'SSR');
				assert(bad.length === 0 && r.n === Math.min(60, want) && r.note === noteOf(want), tag + '種類「' + t + '」: SSR だけ・件数の文は ' + want, { n: r.n, note: r.note, bad: bad.slice(0, 3) });
			}
			assert(!all.hscroll && !(await readHits(sp.page)).hscroll, tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	// 変更前（966ea94）で実測した固定値: R 2枚（card-0002・card-0566）・SR 2枚（card-0147・card-0149）・SSR 2枚の編成。390・1280 とも同じ
	const SAVED = { umaId: 'uma-0179', cardIds: ['card-0002', 'card-0566', 'card-0147', 'card-0149', 'card-0402', 'card-0248'], skillFilter: {} };
	// 2026-10-27（スキルの既定の並び）: rowsHash は並びが変わったので変更後の値（a4ff69b4fad1a04a→fd7ef33c3080726e）。rowsCanon は並べ替えた形で、変更前 d2e8499 で測った値
	const BEFORE = { total: '6,447', rows: 52, rowsHash: 'fd7ef33c3080726e', rowsCanon: '4e60dd9d3e2cb5f7',
		tiles: ['[トレセン学園]サイレンススズカ×', '[巫女]吾妻×', '[やれやれ、お帰り]フジキセキ×', '[テッペンに立て！]ヒシアマゾン×', "[L'aubeは迫りて]佐岳メイ×", '[日本一のステージを]スペシャルウィーク×'] };
	await block('J作業3(2) 保存済みの①の編成の R・SR はそのまま表示し、計算も変わらない（変更前の実測と同じ。390・1280）', async () => {
		for (const w of [390, 1280]) {
			const tag = 'J作業3(2) ' + w + 'px: ';
			const sp = await openSp(w, SAVED);
			await sleep(sp.page, 900);
			const r = await sp.page.evaluate(() => ({
				total: (document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]') || document.querySelector('#deck-roster-panel .usd-roster-total') || {}).textContent || null,
				tiles: [...document.querySelectorAll('#deck-roster-panel [data-usd-el="roster-tile"]')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
				rows: [...document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')].map((x) => x.getAttribute('data-skill-id')),
				saved: JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || '{}').cardIds,
				hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }));
			const hash = crypto.createHash('md5').update(r.rows.join(',')).digest('hex').slice(0, 16);
			// 2026-10-27: 並べ替えた形（顔ぶれだけ）のハッシュ。並びは既定の並びに変わったので、顔ぶれが変更前と同じことはこちらで見る
			const canon = crypto.createHash('md5').update(r.rows.slice().sort().join(',')).digest('hex').slice(0, 16);
			assert(JSON.stringify(r.tiles) === JSON.stringify(BEFORE.tiles) && JSON.stringify(r.saved) === JSON.stringify(SAVED.cardIds), tag + 'タイルに R・SR のカードがそのまま出て、保存データも変わらない', { tiles: r.tiles, saved: r.saved });
			assert(r.total === BEFORE.total && r.rows.length === BEFORE.rows && hash === BEFORE.rowsHash && canon === BEFORE.rowsCanon, tag + '合計Pt ' + BEFORE.total + '・表の行 ' + BEFORE.rows + '（顔ぶれは変更前と同じ。並びは既定の並び〔2026-10-27〕）', { total: r.total, rows: r.rows.length, hash, canon });
			assert(!r.hscroll && jsErrors(sp.errors).length === 0, tag + '横スクロールなし・コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ---- セッションJ・作業4（2026-10-27）: キャラクター共通のイベントの固定の印（fixed・when）。見出しが「共通イベント N」の場面で、
	 * fixed のイベントは「固定イベント（when）」（when が無ければ「固定イベント」）。ほかの見た目は変えない。
	 * 合成のデータ: 実データの character-event-skills.json の写しで、ライトハロー（2択のイベントが2つ）の1つ目に fixed＋when、2つ目に fixed だけを付ける ---- */
	const CHARA = readJson('data/character-event-skills.json');
	const LH = 'ライトハロー';
	const LH_CARD = CARDS.find((c) => c.charaName === LH && c.rarity === 'SSR' && !c.isGroup);
	const WHEN = 'クラシック級1月前半';
	const synth = () => {
		const d = JSON.parse(JSON.stringify(CHARA));
		const row = d.entries.find((e) => e.charaName === LH);
		row.events[0] = Object.assign({ fixed: true, when: WHEN }, row.events[0]);
		row.events[1] = Object.assign({ fixed: true }, row.events[1]);
		return d;
	};
	const popTitles = async (w, doc) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w === 1280 ? 900 : 844 }, EMPTY);
		if (doc) await sp.page.route('**/data/character-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(doc) }));
		await sp.page.evaluate((c) => { localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ umaId: 'uma-0179', cardIds: [c, null, null, null, null, null], skillFilter: {} })); localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '0'); }, LH_CARD.id);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(RP + '.usd-roster-grid', { timeout: 15000 });
		await sleep(sp.page, 900);
		await sp.page.click(RP + '[data-usd-el="col-menu-btn"][data-member-key="1"]'); await sp.page.click('[data-usd-el="colmenu-events"]');
		await sleep(sp.page, 500);
		const r = await sp.page.evaluate(() => ({
			titles: [...document.querySelectorAll('[data-usd-el="info-pop"] .usd-roster-eventtitle')].map((t) => t.firstChild ? t.firstChild.textContent : t.textContent),
			// 見出しの文字と、見出しから作る読み上げ名（「…の選択肢」など）を除いて比べる
			html: [...document.querySelectorAll('[data-usd-el="info-pop"] .usd-roster-event')].map((b) => b.outerHTML.replace(/<p class="usd-roster-eventtitle">[^<]*/, '').replace(/ aria-label="[^"]*"/g, '')),
			labels: [...document.querySelectorAll('[data-usd-el="info-pop"] .usd-roster-event [aria-label]')].map((x) => x.getAttribute('aria-label')),
			hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }));
		r.errors = jsErrors(sp.errors);
		await sp.ctx.close();
		return r;
	};
	await block('J作業4(1) 共通イベントの固定の印: fixed のイベントの見出しは「固定イベント（時期）」・時期が無ければ「固定イベント」・印の無いものは「共通イベント N」のまま・ほかは同じ（合成のデータ・390・1280）', async () => {
		assert(!!LH_CARD && CHARA.entries.find((e) => e.charaName === LH).events.length === 2, 'J作業4(1) 材料: ' + LH + ' の SSR のカードがあり、共通イベントは2つ', LH_CARD && LH_CARD.id);
		for (const w of [390, 1280]) {
			const tag = 'J作業4(1) ' + w + 'px: ';
			const real = await popTitles(w, null);
			const syn = await popTitles(w, synth());
			const common = (t) => t.filter((x) => /^(共通|固定)イベント/.test(x));
			assert(JSON.stringify(common(real.titles)) === JSON.stringify(['共通イベント 1', '共通イベント 2']), tag + '印の無い実データでは「共通イベント 1」「共通イベント 2」のまま', real.titles);
			assert(JSON.stringify(common(syn.titles)) === JSON.stringify(['固定イベント（' + WHEN + '）', '固定イベント']), tag + 'fixed＋when は「固定イベント（' + WHEN + '）」・fixed だけは「固定イベント」', syn.titles);
			assert(syn.titles.length === real.titles.length && JSON.stringify(syn.titles.filter((x) => !/^(共通|固定)イベント/.test(x))) === JSON.stringify(real.titles.filter((x) => !/^(共通|固定)イベント/.test(x))), tag + 'ほかのイベントの見出し（N回目など）は同じ', { real: real.titles, syn: syn.titles });
			assert(JSON.stringify(syn.html) === JSON.stringify(real.html), tag + '見出しの文字（と読み上げ名）のほかは、小窓のイベントの箱の中身が同じ（ほかの見た目は変えない）', syn.html.length);
			assert(syn.labels.includes('固定イベント（' + WHEN + '）の選択肢') && syn.labels.includes('固定イベントの選択肢'), tag + '選択肢の欄の読み上げ名も見出しに合わせて「固定イベント…の選択肢」', syn.labels);
			assert(!real.hscroll && !syn.hscroll && real.errors.length === 0 && syn.errors.length === 0, tag + '横スクロールなし・コンソールのエラー0', syn.errors.slice(0, 3));
		}
	});

	/* ---- 作業4 の続き（2026-10-27）: 選択肢が1つで条件のない固定の共通イベント（吾妻・character-event-skills 2026-10-27a）は、
	 * 小窓の左の欄に、シナリオの固定のイベントと同じ箱（「固定イベント（時期）」＋「確定」＋スキル）で出す。
	 * 固定値は、変更前の commit 9926259 で同じ読み方をして測ったもの（1280px）。R1＝吾妻 SSR（card-0564）・R2＝吾妻 R（card-0566。変更前は列のメニューに「イベント/スキル」が無かった） ---- */
	const SCEN_DOC = readJson('data/scenario-event-skills.json');
	const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 16);
	// 2026-10-27（スキルの既定の並び）: 小窓の右の一覧の行（li）を並べ替えた形。顔ぶれが変更前と同じことを、並びに左右されずに見る
	const canonHtml = (h) => (h ? h.replace(/<li\b[\s\S]*?<\/li>/g, '') + (h.match(/<li\b[\s\S]*?<\/li>/g) || []).sort().join('') : h);
	const canonCol = (x) => Object.assign({}, x, { right: canonHtml(x.right), rightText: undefined });
	const R1 = ['card-0564', 'card-0565', 'card-0402', 'card-0248', 'card-0535', 'card-0478'];
	const R2 = ['card-0566', 'card-0002', 'card-0147', 'card-0149', 'card-0402', 'card-0248'];
	// 2026-10-27（スキルの既定の並び）: rowsHash・othersHash・rightHash は並びが変わったので変更後の値（R1 a50791516eb2f219→7d0680abed707734・c8fba2eca29f0fb3→660b4c21a38f7b0e・3527d527ab1ddb48→7f6f2e2784733e3d／
	// R2 0dfc95b7c8ce1790→79a1441f58d1a638・a8e4ccb9e6a2180d→8d44a49c6384c5e9）。*Canon は並べ替えた形で、変更前 d2e8499 で測った値（変更後も同じ＝変わったのは並びだけ）
	// 2026-10-29（吾妻のおでかけのトリガーのイベントを自動で選ばない・manualChoice）: R1 の合計 8,959→8,863（card-0564 の step 1 が自動で選ばれず△になり、−96 Pt）・
	// 吾妻の列の小窓 leftHash 3bd3bc372ae83bc7→78aa6a02cd962b23・rightHash 7f6f2e2784733e3d→766f5a64af63aec4・rightCanon 2482a4e3438cc9ad→126e0947b8b1dafc、
	// ほかの列 othersHash（R1 660b4c21a38f7b0e→95449442aa405282・R2 8d44a49c6384c5e9→54b158e30cbb3187）・othersCanon（R1 be6076a4d4de2659→ed9602c3b628e817・R2 5476187973a5f043→73c181fe0c2e876d）
	// は「自動」の札の class（usd-roster-autotag--auto）と、取得できるスキルの一覧の「自動」の札で変わった。印を外したデータで開き、札の差を取り除くと、
	// 変更前（ce28f00）の値（合計・行・吾妻の列・ほかの列の HTML）と一致することを確かめた。行の文字（rowsHash）は変わらない
	const BEFORE4 = {
		R1: { total: '8,863', rows: 83, rowsHash: '7d0680abed707734', othersHash: '95449442aa405282', leftHash: '78aa6a02cd962b23', rightHash: '766f5a64af63aec4', rowsCanon: '3fb5aa9f2c2a65d2', othersCanon: 'ed9602c3b628e817', rightCanon: '126e0947b8b1dafc' },
		R2: { total: '7,162', rows: 61, rowsHash: '79a1441f58d1a638', othersHash: '54b158e30cbb3187', rowsCanon: '14e40cb2351ce84e', othersCanon: '73c181fe0c2e876d' }
	};
	const dumpCols = async (cards) => {
		const sp = await openPage(browser, base, 'special.html', { width: 1280, height: 900 }, EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(SCEN_DOC) }));
		await sp.page.evaluate((c) => { localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ umaId: 'uma-0179', cardIds: c, skillFilter: {} })); localStorage.removeItem('umaSkillDeck:draftScope:special'); localStorage.setItem('umaSkillDeck:stepTab', '0'); }, cards);
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(RP + '.usd-roster-grid', { timeout: 15000 });
		await sleep(sp.page, 1500);
		const out = { cols: {} };
		out.table = await sp.page.evaluate(() => ({
			total: (document.querySelector('#deck-roster-panel [data-usd-el="pt-total"]') || document.querySelector('#deck-roster-panel .usd-roster-total') || {}).textContent || null,
			rows: [...document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]')].map((r) => r.getAttribute('data-skill-id') + '|' + r.textContent.replace(/\s+/g, ' ').trim()) }));
		const keys = await sp.page.evaluate(() => [...document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"]')].map((b) => b.getAttribute('data-member-key')));
		for (const k of keys) {
			await sp.page.click(RP + '[data-usd-el="col-menu-btn"][data-member-key="' + k + '"]');
			await sleep(sp.page, 200);
			const has = await sp.page.$('[data-usd-el="colmenu-events"]');
			if (!has) { out.cols[k] = { menu: false }; await sp.page.keyboard.press('Escape'); await sleep(sp.page, 200); continue; }
			await has.click();
			await sleep(sp.page, 500);
			out.cols[k] = await sp.page.evaluate(() => {
				const pop = document.querySelector('[data-usd-el="info-pop"]');
				const left = pop && pop.querySelector('[data-usd-el="events-pane-events"]');
				const right = pop && pop.querySelector('[data-usd-el="events-pane-skills"]');
				return { menu: true, left: left ? left.outerHTML : null, right: right ? right.outerHTML : null, leftText: left ? left.innerText : null,
					fixed: left ? [...left.querySelectorAll('[data-usd-el="event-fixed"]')].map((b) => ({ cls: b.className, title: b.querySelector('.usd-roster-eventtitle').textContent, skills: [...b.querySelectorAll('[data-usd-el="event-fixed-skill"]')].map((s) => s.textContent) })) : [],
					hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
			});
			await sp.page.keyboard.press('Escape'); await sleep(sp.page, 300);
		}
		out.errors = jsErrors(sp.errors);
		await sp.ctx.close();
		return out;
	};
	await block('J作業4(2) 吾妻の固定イベント: card-0564・card-0566 の列の小窓に「固定イベント（クラシック級1月前半）」＋「確定」＋末脚 Lv3 の箱（シナリオの固定のイベントと同じ部品）・表と合計Pt・ほかの列の小窓は変更前と同じ（1280）', async () => {
		const azuma = CHARA.entries.find((e) => e.charaName === '吾妻');
		assert(azuma && azuma.events.length === 1 && azuma.events[0].fixed === true && azuma.events[0].when === WHEN, 'J作業4(2) データ: 吾妻の共通イベントは fixed・when（' + WHEN + '）を持つ', azuma && azuma.events);
		for (const [name, cards] of [['R1', R1], ['R2', R2]]) {
			const tag = 'J作業4(2) ' + name + '（' + cards[0] + '）: ';
			const o = await dumpCols(cards);
			const want = BEFORE4[name];
			const c = o.cols['1'];
			const box = c && c.fixed ? c.fixed : [];
			const scenBox = (o.cols.scenario && o.cols.scenario.fixed) || [];
			assert(c && c.menu && box.length === 1 && box[0].title === '固定イベント（' + WHEN + '） 確定' && JSON.stringify(box[0].skills) === JSON.stringify(['末脚 Lv3']) && scenBox.length > 0 && box[0].cls === scenBox[0].cls,
				tag + '吾妻の列の小窓の左に「固定イベント（' + WHEN + '）」「確定」・末脚 Lv3 の箱（シナリオの固定のイベントの箱と同じ class）', { box, scen: scenBox[0] && scenBox[0].cls });
			assert(o.table.total === want.total && o.table.rows.length === want.rows && md5(o.table.rows.join('\n')) === want.rowsHash && md5(o.table.rows.slice().sort().join('\n')) === want.rowsCanon, tag + '表の行（' + want.rows + '）と合計Pt（' + want.total + '）は変更前と同じ', { total: o.table.total, rows: o.table.rows.length });
			const others = Object.keys(o.cols).filter((k) => k !== '1').sort().map((k) => k + ':' + JSON.stringify(o.cols[k])).join('\n');
			const othersCanon = Object.keys(o.cols).filter((k) => k !== '1').sort().map((k) => k + ':' + JSON.stringify(canonCol(o.cols[k]))).join('\n');
			assert(md5(others) === want.othersHash && md5(othersCanon) === want.othersCanon, tag + 'ほかの列（サポカ5枚・育成ウマ娘・シナリオ）の小窓の中身は変更前と同じ（右の一覧の並びは既定の並び〔2026-10-27〕）', { raw: md5(others), canon: md5(othersCanon), rows: md5(o.table.rows.join('\n')), rowsCanon: md5(o.table.rows.slice().sort().join('\n')), left: c && c.left ? md5(c.left) : null, right: c && c.right ? md5(c.right) : null, rightCanon: c && c.right ? md5(canonHtml(c.right)) : null });
			if (want.leftHash) {
				const b = c.left.indexOf('<div class="usd-roster-event" data-usd-el="event-fixed">');
				const stripped = b >= 0 ? c.left.slice(0, b) + c.left.slice(c.left.lastIndexOf('</div></section>') + 6) : c.left;
				assert(md5(stripped) === want.leftHash && md5(c.right) === want.rightHash && md5(canonHtml(c.right)) === want.rightCanon, tag + '吾妻の列の小窓は、変更前の中身の後ろに固定の箱が足されただけ（右の一覧の顔ぶれは同じ。並びは既定の並び〔2026-10-27〕）', { stripped: md5(stripped), right: md5(c.right), rightCanon: md5(canonHtml(c.right)) });
			}
			assert(Object.values(o.cols).every((x) => !x.hscroll) && o.errors.length === 0, tag + '横スクロールなし・コンソールのエラー0', o.errors.slice(0, 3));
		}
	});
}
