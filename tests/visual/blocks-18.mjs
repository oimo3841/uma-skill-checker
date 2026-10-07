// C-132（2026-10-07）の検査。run-smoke.mjs の末尾から register18() で呼ばれる
// （塊の見出しはすべて「C132」で始まる。`npm run test:visual -- --only=C132` で回せる。A だけなら「C132A」など）。
//
// A: ②のパレットの行（選択中のアイコンをもう一度押すと外れる・「削除」のブラシ・スキル名の横スクロール・オススメの確認の小窓・並び）
// B: ①のスマホ（640px 以下）はページ全体をスクロールし、帯と表の列見出しだけを残す。最下端は「＋」の直上で止まる
// C: ②のスマホは帯とパレットの行だけを残す。③も最下端の余白を詰める
// D: ①②③の左右スワイプ（タッチのときだけ。横にスクロールできる場所・小窓・入力欄から始まった動きは切り替えにしない）
// E: 誤認識の読み替え辞書は「スクショで追加」の小窓の中
// F: 右下の「＋」の展開に「セット」「レース」
// スキル名・レース名は検査の側に書かない（恒久ルール1。データか画面から読む）。

export async function register18(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const RACES = readJson('data/upcoming-races.json').races;
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const FILTER = { distance: 'medium', style: 'senko', surface: 'turf' };
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: FILTER };
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const T = '#deck-template-panel ';
	// 末尾の1文字だけが違う名前の組（例：レースの真髄・速／・体）。マスターから探す（先頭の6文字以上が同じ）
	const PAIR = (() => {
		for (const a of MASTER) for (const b of MASTER) {
			if (a.id >= b.id || a.name.length !== b.name.length || a.name.length < 7) continue;
			if (a.name.slice(0, -1) === b.name.slice(0, -1)) return [String(a.id), String(b.id)];
		}
		return null;
	})();
	const LONG = MASTER.slice(0, 40).map((s) => String(s.id));

	/** o.w・o.h＝画面の大きさ／o.tab＝開くタブ／o.ids＝②に入れておくスキル／o.roster＝①の編成 */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		await sp.page.evaluate(({ roster, tab, ids }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			if (ids) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids }));
			else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: o.roster || FULL, tab: o.tab === undefined ? 1 : o.tab, ids: o.ids || null });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(500);
		return sp;
	};
	const draftIds = (page) => page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
	const draftIcons = (page) => page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIcons) || {});
	const pressed = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel [data-usd-act="palette-pick"][aria-pressed="true"]')).map((b) => b.getAttribute('data-icon')));
	const tile = (id) => T + '.usd-panel[data-skill-id="' + id + '"]';
	const activeTab = (page) => page.evaluate(() => document.querySelector('.step-tab[aria-selected="true"]').id);

	/* ====================================================================
	 * A: パレットの行
	 * ==================================================================== */
	await block('C132A1 選択中のアイコンをもう一度押すと選択が外れる（何も選んでいない状態）。そのときタイルのアイコンを押しても何も付かない／「解除」のボタンは無い', async () => {
		const ids = LONG.slice(0, 4);
		const sp = await openSp({ ids });
		const p = sp.page;
		const first = await p.evaluate(() => document.querySelector('#deck-template-panel [data-usd-act="palette-pick"][aria-pressed="true"]').getAttribute('data-icon'));
		assert(!!first && !(await p.$(T + '[data-usd-el="palette-clear"]')), 'C132A1 最初は1つのアイコンが選ばれていて、「解除」のボタンは無い', { first });
		await p.click(T + '[data-usd-el="palette-' + first + '"]');
		assert((await pressed(p)).length === 0, 'C132A1 選択中のアイコンをもう一度押すと、どれも選ばれていない', await pressed(p));
		await p.click(tile(ids[0]) + ' [data-usd-act="skill-icon"]');
		assert(!(ids[0] in (await draftIcons(p))) && (await draftIds(p)).includes(ids[0]), 'C132A1 何も選んでいないときにタイルのアイコンを押しても、アイコンは付かない（スキルも消えない）', await draftIcons(p));
		await p.click(T + '[data-usd-el="palette-' + first + '"]');
		await p.click(tile(ids[0]) + ' [data-usd-act="skill-icon"]');
		assert((await draftIcons(p))[ids[0]] === first, 'C132A1 選び直すと、タイルのアイコンを押して付けられる', await draftIcons(p));
		await p.click(tile(ids[0]) + ' [data-usd-act="skill-icon"]');
		assert(!(ids[0] in (await draftIcons(p))), 'C132A1 同じアイコンが付いたタイルをもう一度押すと外れる（外す手段は今までどおり）', await draftIcons(p));
		assert(jsErrors(sp.errors).length === 0, 'C132A1 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C132A2 タイルに ✕ は無い／「削除」を押すと削除の状態（ボタンは選択中・タイルは破線と取り消しの線）で、タイルを押すと②から外れ「元に戻す」で戻る／もう一度押すかアイコンを選ぶと終わる', async () => {
		const ids = LONG.slice(0, 6);
		const sp = await openSp({ ids });
		const p = sp.page;
		const x = await p.evaluate(() => ({ del: document.querySelectorAll('#deck-template-panel .usd-skillgroup .usd-panel-del, #deck-template-panel .usd-skillgroup [data-usd-act="template-skill-remove"]').length }));
		assert(x.del === 0, 'C132A2 タイルに ✕（外すボタン）は無い', x);
		const look0 = await p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).borderTopStyle, tile(ids[0]));
		await p.click(T + '[data-usd-el="palette-delete"]');
		const st = await p.evaluate((sel) => {
			const b = document.querySelector('#deck-template-panel [data-usd-el="palette-delete"]');
			const t = document.querySelector(sel);
			const n = t.querySelector('.usd-panel-namebtn');
			return { pressed: b.getAttribute('aria-pressed'), ring: getComputedStyle(b).boxShadow, border: getComputedStyle(t).borderTopStyle, line: getComputedStyle(n).textDecorationLine };
		}, tile(ids[0]));
		assert(st.pressed === 'true' && st.ring !== 'none' && (await pressed(p)).join() === 'delete', 'C132A2 「削除」は選択中の見た目（輪）になり、アイコンの選択は外れる', { st, pressed: await pressed(p) });
		assert(look0 !== 'dashed' && st.border === 'dashed' && /line-through/.test(st.line), 'C132A2 削除の状態では、タイルは破線の枠と名前の取り消しの線（色だけに頼らない）', { look0, st });
		const undo0 = await p.evaluate(() => UmaSkillDeckCore.undoCount ? UmaSkillDeckCore.undoCount() : null);
		await p.click(tile(ids[1]) + ' .usd-panel-namebtn');
		await p.waitForTimeout(150);
		const infoOpen = await p.evaluate(() => { const pop = document.querySelector('.usd-info-pop'); return !!pop && !pop.hidden; });
		assert(!(await draftIds(p)).includes(ids[1]) && !infoOpen, 'C132A2 削除の状態で名前を押すと、そのスキルが②から外れる（説明の小窓は開かない）', { ids: await draftIds(p), infoOpen });
		await p.click(tile(ids[2]) + ' [data-usd-act="skill-icon"]');
		assert(!(await draftIds(p)).includes(ids[2]), 'C132A2 アイコンの部分を押しても外れる', await draftIds(p));
		const undo1 = await p.evaluate(() => UmaSkillDeckCore.undoCount ? UmaSkillDeckCore.undoCount() : null);
		assert(undo0 === null || undo1 === undo0 + 2, 'C132A2 外すたびに「元に戻す」に積む', { undo0, undo1 });
		await p.click('#deck-undo-btn');
		await p.waitForTimeout(150);
		assert((await draftIds(p)).includes(ids[2]), 'C132A2 「元に戻す」で戻る', await draftIds(p));
		assert((await pressed(p)).join() === 'delete', 'C132A2 外したあとも削除の状態は続く（続けて外せる）', await pressed(p));
		await p.click(T + '[data-usd-el="palette-delete"]');
		const off = await p.evaluate((sel) => ({ pressed: document.querySelector('#deck-template-panel [data-usd-el="palette-delete"]').getAttribute('aria-pressed'), border: getComputedStyle(document.querySelector(sel)).borderTopStyle }), tile(ids[0]));
		assert(off.pressed === 'false' && off.border !== 'dashed', 'C132A2 もう一度「削除」を押すと、削除の状態が終わる', off);
		await p.click(tile(ids[0]) + ' .usd-panel-namebtn');
		assert((await draftIds(p)).includes(ids[0]), 'C132A2 終わったあとに名前を押しても外れない', await draftIds(p));
		await p.keyboard.press('Escape');
		// アイコンを選ぶと削除の状態が終わる
		await p.click(T + '[data-usd-el="palette-delete"]');
		const icon = await p.evaluate(() => document.querySelector('#deck-template-panel .usd-palette-btn').getAttribute('data-icon'));
		await p.click(T + '[data-usd-el="palette-' + icon + '"]');
		assert((await pressed(p)).join() === icon, 'C132A2 削除の状態でアイコンを選ぶと、削除の状態が終わってそのアイコンが選ばれる', await pressed(p));
		await p.click(tile(ids[0]) + ' [data-usd-act="skill-icon"]');
		assert((await draftIds(p)).includes(ids[0]) && (await draftIcons(p))[ids[0]] === icon, 'C132A2 そのあとタイルを押すとアイコンが付く（外れない）', { icons: await draftIcons(p) });
		assert(jsErrors(sp.errors).length === 0, 'C132A2 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C132A3 スキル名は「…」で切らず名前の部分だけ横に送れる（末尾の1文字で区別する名前も見分けられる）／アイコンは小さく、375px で2列のまま', async () => {
		assert(!!PAIR, 'C132A3 材料: 末尾の1文字だけが違う名前の組がマスターにある', PAIR);
		for (const w of [375, 320]) {
			const sp = await openSp({ w, ids: PAIR.concat(LONG.slice(0, 4)) });
			const p = sp.page;
			const r = await p.evaluate((pair) => pair.map((id) => {
				const t = document.querySelector('#deck-template-panel .usd-panel[data-skill-id="' + id + '"]');
				const sc = t.querySelector('[data-usd-el="panel-namescroll"]');
				const n = t.querySelector('.usd-panel-namebtn');
				const before = { sw: sc.scrollWidth, cw: sc.clientWidth };
				sc.scrollLeft = sc.scrollWidth;
				const nr = n.getBoundingClientRect(), sr = sc.getBoundingClientRect();
				const icon = t.querySelector('.usd-icon').getBoundingClientRect();
				return { id, before, ox: getComputedStyle(sc).overflowX, ellipsis: getComputedStyle(n).textOverflow, endShown: nr.right <= sr.right + 1, text: n.textContent, icon: Math.round(icon.width),
					cols: getComputedStyle(t.parentElement).gridTemplateColumns.split(' ').length };
			}), PAIR);
			const tag = 'C132A3 ' + w + 'px: ';
			assert(r.every((x) => x.ox === 'auto' && x.ellipsis !== 'ellipsis' && x.endShown), tag + '名前は「…」で切らず、名前の部分だけ横に送って末尾まで見られる', r);
			assert(r[0].text !== r[1].text && r[0].text.slice(0, -1) === r[1].text.slice(0, -1), tag + '末尾の1文字だけが違う2つの名前が、そのまま出ている', r.map((x) => x.text));
			assert(r.every((x) => x.icon <= 15), tag + 'タイルのアイコンは 15px 以下（小さくした）', r.map((x) => x.icon));
			if (w === 375) assert(r.every((x) => x.cols === 2), tag + '2列のまま', r.map((x) => x.cols));
			// 名前の上で横に動かしても、タップの動き（説明の表示）は今までどおり
			await p.evaluate((id) => { const sc = document.querySelector('#deck-template-panel .usd-panel[data-skill-id="' + id + '"] [data-usd-el="panel-namescroll"]'); sc.scrollLeft = 0; }, PAIR[0]);
			await p.click(tile(PAIR[0]) + ' .usd-panel-namebtn');
			await p.waitForTimeout(200);
			const info = await p.evaluate(() => { const pop = document.querySelector('.usd-info-pop'); return !!pop && !pop.hidden; });
			assert(info, tag + '名前を押すと、今までどおり説明の小窓が開く', info);
			const sw = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
			assert(sw.sw <= sw.iw, tag + 'ページは横にはみ出さない', sw);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('C132A4 「先差追オススメ」を押すと、追加の前に確認の小窓（名前と Pt・追加しないもの）が出る／「やめる」で何も変わらない／「追加する」で追加され「元に戻す」に積む／0種なら小窓は出ずに知らせだけ', async () => {
		const sp = await openSp();
		const p = sp.page;
		await p.waitForSelector(T + '[data-usd-el="recommend-btn"]');
		const before = await draftIds(p);
		await p.click(T + '[data-usd-el="recommend-btn"]');
		await p.waitForSelector('[data-usd-el="recommend-confirm-list"]');
		const c = await p.evaluate(() => {
			const items = Array.from(document.querySelectorAll('[data-usd-el="recommend-confirm-list"] li'));
			return { n: items.length, rows: items.map((li) => ({ id: li.getAttribute('data-skill-id'), name: li.querySelector('.usd-rec-name').textContent, pt: li.querySelector('.usd-rec-pt').textContent })),
				head: (document.querySelector('[data-usd-el="recommend-confirm-head"]') || {}).textContent, skip: (document.querySelector('[data-usd-el="recommend-confirm-skip"]') || {}).textContent || null,
				add: !!document.querySelector('[data-usd-el="recommend-confirm-add"]'), cancel: !!document.querySelector('[data-usd-el="recommend-confirm-cancel"]') };
		});
		assert(c.n > 0 && c.head === '追加するスキル ' + c.n + '種' && c.rows.every((x) => x.name && /Pt/.test(x.pt)) && c.add && c.cancel, 'C132A4 小窓に、追加するスキルの名前と Pt・「追加する」「やめる」が出る', c);
		assert((await draftIds(p)).join() === before.join(), 'C132A4 小窓を出しただけでは追加しない', { before, now: await draftIds(p) });
		assert(c.skip === null || /^追加しないもの \d+種（.+）$/.test(c.skip), 'C132A4 追加しないものがあれば「追加しないもの M種（内訳）」', c.skip);
		await p.click('[data-usd-el="recommend-confirm-cancel"]');
		assert((await draftIds(p)).join() === before.join(), 'C132A4 「やめる」で何も変わらない', await draftIds(p));
		const u0 = await p.evaluate(() => UmaSkillDeckCore.undoCount ? UmaSkillDeckCore.undoCount() : null);
		await p.click(T + '[data-usd-el="recommend-btn"]');
		await p.click('[data-usd-el="recommend-confirm-add"]');
		await p.waitForTimeout(200);
		const after = await draftIds(p);
		const u1 = await p.evaluate(() => UmaSkillDeckCore.undoCount ? UmaSkillDeckCore.undoCount() : null);
		assert(c.rows.every((x) => after.includes(x.id)) && after.length === before.length + c.n, 'C132A4 「追加する」で、小窓に出たスキルがすべて追加される', { n: c.n, after: after.length });
		assert(u0 === null || u1 === u0 + 1, 'C132A4 「元に戻す」に1回で積む', { u0, u1 });
		// 0種: もう一度押すと、追加済みなので小窓は出ずに知らせだけ
		await p.click(T + '[data-usd-el="recommend-btn"]');
		await p.waitForTimeout(300);
		const z = await p.evaluate(() => ({ list: !!document.querySelector('[data-usd-el="recommend-confirm-list"]') && !document.querySelector('.usd-info-pop').hidden, toast: document.getElementById('toast-message').textContent }));
		assert(!z.list && /^追加できるスキルはありません/.test(z.toast), 'C132A4 追加できるものが0種なら、小窓は出さずに知らせだけ', z);
		assert(jsErrors(sp.errors).length === 0, 'C132A4 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C132A5 パレットの行の並びは「削除」→ 脚質のボタン → アイコン（◎○△◇★✕）。始まりは左端で、収まらないぶんは右へ送る／脚質が指定なしなら脚質のボタンは無い', async () => {
		const sp = await openSp({ ids: LONG.slice(0, 2) });
		const p = sp.page;
		await p.waitForSelector(T + '[data-usd-el="recommend-btn"]');
		const r = await p.evaluate(() => {
			const pal = document.querySelector('#deck-template-panel .usd-palette');
			const kids = Array.from(pal.children).filter((c) => !c.classList.contains('usd-palette-sep')).map((c) => c.getAttribute('data-usd-el'));
			return { kids, left: pal.scrollLeft, over: pal.scrollWidth > pal.clientWidth, ox: getComputedStyle(pal).overflowX };
		});
		assert(r.kids[0] === 'palette-delete' && r.kids[1] === 'recommend-btn' && r.kids.slice(2).every((k) => /^palette-[a-f]$/.test(k)) && r.kids.length === 8, 'C132A5 並びは 削除・脚質のボタン・アイコン6つ', r.kids);
		assert(r.left === 0 && r.ox === 'auto', 'C132A5 始まりは左端で、横に送れる', r);
		await sp.ctx.close();
		const sp2 = await openSp({ ids: LONG.slice(0, 2), roster: Object.assign({}, FULL, { skillFilter: { distance: 'medium', surface: 'turf' } }) });
		const k2 = await sp2.page.evaluate(() => Array.from(document.querySelector('#deck-template-panel .usd-palette').children).filter((c) => !c.classList.contains('usd-palette-sep')).map((c) => c.getAttribute('data-usd-el')));
		assert(k2[0] === 'palette-delete' && !k2.includes('recommend-btn'), 'C132A5 脚質が指定なしなら、「削除」の次はアイコン', k2);
		await sp2.ctx.close();
	});

	/* ====================================================================
	 * B・C: スマホのスクロールの作り
	 * ==================================================================== */
	/** 下までスクロールしたときの位置（帯の下端・固定するものの上端・最後の行・「＋」の上端・タブ） */
	const measureBottom = (page, lastSel, stickSel) => page.evaluate(async ({ lastSel, stickSel }) => {
		scrollTo(0, document.documentElement.scrollHeight);
		await new Promise((r) => setTimeout(r, 250));
		const rc = (el) => el ? el.getBoundingClientRect() : null;
		const all = document.querySelectorAll(lastSel);
		const last = rc(all[all.length - 1]);
		const bar = rc(document.getElementById('deck-set-bar'));
		const stick = rc(document.querySelector(stickSel));
		const fab = rc(document.getElementById('fab-toggle'));
		const tabs = rc(document.querySelector('.step-tabs'));
		return { y: Math.round(scrollY), docH: document.documentElement.scrollHeight, vh: innerHeight, barB: Math.round(bar.bottom), stickT: stick ? Math.round(stick.top) : null,
			lastB: Math.round(last.bottom), fabT: Math.round(fab.top), tabsB: Math.round(tabs.bottom), sw: document.documentElement.scrollWidth, iw: innerWidth };
	}, { lastSel, stickSel });

	await block('C132B ①のスマホはページ全体をスクロールし、下までスクロールしても帯と列見出しだけが残る（タブ・合計・編成などは隠れる）／最後の行は「＋」の直上で止まる／PC は変わらない', async () => {
		for (const size of [{ w: 375, h: 812 }, { w: 320, h: 568 }]) {
			const sp = await openSp({ w: size.w, h: size.h, tab: 0 });
			const p = sp.page;
			const wrap = await p.evaluate(() => { const w = document.querySelector('#deck-roster-panel .usd-roster-grid-wrap'); const cs = getComputedStyle(w); return { mh: cs.maxHeight, oy: cs.overflowY, inner: w.scrollHeight - w.clientHeight }; });
			const m = await measureBottom(p, '#deck-roster-panel .usd-roster-grow[data-skill-id] > .usd-roster-gc--name', '#deck-roster-panel .usd-roster-gh--skill');
			const tag = 'C132B ' + size.w + 'px: ';
			assert(wrap.mh === 'none' && wrap.oy === 'visible' && wrap.inner <= 1, tag + '表の中だけをスクロールする作りではない（高さの上限なし・表の中は縦に送らない）', wrap);
			assert(m.docH > m.vh && m.y > 0, tag + 'ページ全体がスクロールする', m);
			assert(Math.abs(m.stickT - m.barB) <= 1, tag + '下までスクロールしても、列見出しは帯の直下に残る（帯の下端 ' + m.barB + '・列見出しの上端 ' + m.stickT + '）', m);
			assert(m.tabsB <= m.barB, tag + 'タブ（①②③）はスクロールで隠れる', m);
			assert(m.lastB <= m.fabT && m.fabT - m.lastB <= 24, tag + '最後の行は「＋」の直上で止まる（差 ' + (m.fabT - m.lastB) + 'px）', m);
			assert(m.sw <= m.iw, tag + '横にはみ出さない', m);
			// 編成の欄・合計は隠れている（帯より上に出ている）
			const hidden = await p.evaluate(() => { const r = document.querySelector('#deck-roster-panel .usd-roster-sumrow, #deck-roster-panel .usd-roster-top'); return r ? Math.round(r.getBoundingClientRect().bottom) : null; });
			assert(hidden === null || hidden <= m.barB, tag + '本育成の合計・編成の欄はスクロールで隠れる', { hidden, barB: m.barB });
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		const pc = await openSp({ w: 1280, h: 900, tab: 0 });
		const w = await pc.page.evaluate(() => { const w = document.querySelector('#deck-roster-panel .usd-roster-grid-wrap'); const cs = getComputedStyle(w); const gh = getComputedStyle(document.querySelector('#deck-roster-panel .usd-roster-gh')); return { mh: cs.maxHeight, oy: cs.overflowY, ghTop: gh.top, pad: cs.paddingBottom }; });
		assert(w.mh !== 'none' && w.oy === 'auto' && w.ghTop === '0px' && w.pad === '0px', 'C132B 1280px: PC は今までどおり（表の中を縦に送り、列見出しは表の上端に固定）', w);
		await pc.ctx.close();
	});

	await block('C132C ②のスマホは帯とパレットの行だけが残る（入口のボタンの列・合計は隠れる）／最後のタイルは「＋」の直上で止まる／③も最下端の余白を詰める', async () => {
		for (const size of [{ w: 375, h: 812 }, { w: 320, h: 568 }]) {
			const sp = await openSp({ w: size.w, h: size.h, tab: 1, ids: LONG });
			const p = sp.page;
			const m = await measureBottom(p, T + '.usd-skillgroup .usd-panel', T + '.usd-palette');
			const tag = 'C132C ' + size.w + 'px: ';
			assert(Math.abs(m.stickT - m.barB) <= 1, tag + '下までスクロールしても、パレットの行は帯の直下に残る（帯の下端 ' + m.barB + '・パレットの上端 ' + m.stickT + '）', m);
			const entry = await p.evaluate(() => Math.round(document.querySelector('#deck-template-panel .usd-entry-row').getBoundingClientRect().bottom));
			assert(entry <= m.barB && m.tabsB <= m.barB, tag + '入口のボタンの列とタブはスクロールで隠れる', { entry, m });
			assert(m.lastB <= m.fabT && m.fabT - m.lastB <= 24, tag + '最後のタイルは「＋」の直上で止まる（差 ' + (m.fabT - m.lastB) + 'px）', m);
			assert(m.sw <= m.iw, tag + '横にはみ出さない', m);
			// ③
			await p.click('#step-tab-2');
			await p.waitForTimeout(200);
			const t3 = await p.evaluate(async () => {
				scrollTo(0, document.documentElement.scrollHeight);
				await new Promise((r) => setTimeout(r, 200));
				return { cardB: Math.round(document.querySelector('.main-card').getBoundingClientRect().bottom), fabT: Math.round(document.getElementById('fab-toggle').getBoundingClientRect().top), docH: document.documentElement.scrollHeight, vh: innerHeight };
			});
			assert(t3.docH <= t3.vh || t3.fabT - t3.cardB <= 24, tag + '③も最下端は「＋」の直上（差 ' + (t3.fabT - t3.cardB) + 'px）', t3);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
		const pc = await openSp({ w: 1280, h: 900, tab: 1, ids: LONG });
		const r = await pc.page.evaluate(() => ({ pos: getComputedStyle(document.querySelector('#deck-template-panel .usd-palette')).position, pad: getComputedStyle(document.querySelector('.page-wrap')).paddingBottom }));
		assert(r.pos === 'static' && parseFloat(r.pad) >= 300, 'C132C 1280px: PC は今までどおり（パレットは固定しない・本文の下の余白は「＋」の展開のぶん）', r);
		await pc.ctx.close();
	});

	/* ====================================================================
	 * D: 左右スワイプ
	 * ==================================================================== */
	/** sel の要素の上で、横 dx・縦 dy のタッチの動きを作る（Touch を合成して送る） */
	const swipe = (page, sel, dx, dy) => page.evaluate(({ sel, dx, dy }) => {
		const el = document.querySelector(sel);
		const r = el.getBoundingClientRect();
		const x = r.left + Math.min(r.width / 2, 120), y = r.top + Math.min(r.height / 2, 12);
		const mk = (type, cx, cy) => {
			const t = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
			return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] });
		};
		el.dispatchEvent(mk('touchstart', x, y));
		el.dispatchEvent(mk('touchmove', x + dx / 2, y + dy / 2));
		el.dispatchEvent(mk('touchend', x + dx, y + dy));
		return document.querySelector('.step-tab[aria-selected="true"]').id;
	}, { sel, dx, dy });

	await block('C132D 表の外で左右に払うと①②③が切り替わる（左＝次・右＝前・端では変わらない）／①の表・②のパレットの行・スキル名・入力欄・小窓から始まった動きや、縦に大きい動きでは変わらない', async () => {
		const sp = await openSp({ tab: 0, ids: LONG });
		const p = sp.page;
		const OUT = '.site-header h1';
		assert(await swipe(p, OUT, -120, 10) === 'step-tab-1', 'C132D 左へ払うと次（①→②）', await activeTab(p));
		assert(await swipe(p, OUT, -120, 10) === 'step-tab-2', 'C132D 左へ払うと次（②→③）', await activeTab(p));
		assert(await swipe(p, OUT, -120, 10) === 'step-tab-2', 'C132D 端（③）でさらに左へ払っても変わらない', await activeTab(p));
		assert(await swipe(p, OUT, 120, 10) === 'step-tab-1', 'C132D 右へ払うと前（③→②）', await activeTab(p));
		assert(await swipe(p, OUT, 40, 0) === 'step-tab-1', 'C132D 横の動きが小さい（40px）と変わらない', await activeTab(p));
		assert(await swipe(p, OUT, 120, 90) === 'step-tab-1', 'C132D 縦の動きが大きい（横の半分以上）と変わらない', await activeTab(p));
		// ②の中の横に送れる場所
		assert(await swipe(p, T + '.usd-palette', -120, 0) === 'step-tab-1', 'C132D ②のパレットの行から始まった動きでは変わらない', await activeTab(p));
		assert(await swipe(p, T + '[data-usd-el="panel-namescroll"]', -120, 0) === 'step-tab-1', 'C132D ②のスキル名から始まった動きでは変わらない', await activeTab(p));
		assert(await swipe(p, T + '.usd-entry-row', -120, 0) === 'step-tab-1', 'C132D ②の入口のボタンの列から始まった動きでは変わらない', await activeTab(p));
		// ①の表
		await p.click('#step-tab-0');
		await p.waitForTimeout(200);
		assert(await swipe(p, '#deck-roster-panel .usd-roster-grid-wrap .usd-roster-gc--name[role="rowheader"]', -120, 0) === 'step-tab-0', 'C132D ①の表の上で横に動かしてもタブは変わらない', await activeTab(p));
		assert(await swipe(p, '#deck-roster-panel select', -120, 0) === 'step-tab-0', 'C132D 選択欄から始まった動きでは変わらない', await activeTab(p));
		// 小窓が開いているあいだ
		await p.click('#deck-set-bar [data-usd-act="set-list"]');
		await p.waitForTimeout(200);
		assert(await swipe(p, '.usd-info-pop', -120, 0) === 'step-tab-0' && await swipe(p, OUT, -120, 0) === 'step-tab-0', 'C132D 小窓が開いているあいだは、小窓の上でも外でも変わらない', await activeTab(p));
		await p.keyboard.press('Escape');
		await p.waitForTimeout(150);
		// スクロール位置は、タブを押したときと同じ（動かさない）
		await p.evaluate(() => scrollTo(0, 120));
		const y0 = await p.evaluate(() => Math.round(scrollY));
		const tab1 = await swipe(p, '#deck-set-bar .usd-setbar-r', -120, 0);
		const y1 = await p.evaluate(() => Math.round(scrollY));
		assert(tab1 === 'step-tab-1' && Math.abs(y1 - y0) <= 1, 'C132D 帯の上で払っても切り替わり、スクロール位置はタブを押したときと同じ（動かさない）', { tab1, y0, y1 });
		assert(jsErrors(sp.errors).length === 0, 'C132D コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	/* ====================================================================
	 * E: 誤認識の読み替え辞書
	 * ==================================================================== */
	await block('C132E 誤認識の読み替え辞書は「スクショで追加」の小窓の中にあり、②の下には無い／保存の形（キー・中身）は変わらない／旧UIでは元の場所', async () => {
		const sp = await openSp({ ids: LONG.slice(0, 2) });
		const p = sp.page;
		await p.evaluate(() => localStorage.setItem('uma-special-ocr-dict', 'あいう = テスト'));
		await p.reload({ waitUntil: 'networkidle' });
		await p.waitForTimeout(500);
		const where = await p.evaluate(() => ({ inGuide: !!document.querySelector('#skillset-guide-box #ocr-dict-box'), inPanel: !!document.querySelector('#step-panel-1 #ocr-dict-box'), value: document.getElementById('ocr-dict').value }));
		assert(where.inGuide && !where.inPanel, 'C132E 新UIでは「スクショで追加」の小窓の中にあり、②の下には無い', where);
		assert(where.value === 'あいう = テスト', 'C132E 保存してある中身がそのまま読まれる（キーは uma-special-ocr-dict のまま）', where);
		await p.click(T + '[data-usd-act="editor-pick-screenshot"]');
		await p.waitForTimeout(200);
		const vis = await p.evaluate(() => { const d = document.getElementById('ocr-dict-box'); return { shown: d.getClientRects().length > 0, guide: !document.getElementById('skillset-guide-box').hidden }; });
		assert(vis.guide && vis.shown, 'C132E 「スクショで追加」を押すと、小窓の中に辞書が見える', vis);
		await p.click('#ocr-dict-box summary');
		await p.fill('#ocr-dict', 'かきく = テスト2');
		const saved = await p.evaluate(() => localStorage.getItem('uma-special-ocr-dict'));
		assert(saved === 'かきく = テスト2', 'C132E 小窓の中で書き換えても、同じキーに同じ形で保存される', saved);
		await sp.ctx.close();
		// 旧UI
		const old = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		// 告知を閉じて既読にしたあとなら、保存値 'old' が効く（恒久ルール20）
		for (let i = 0; i < 2; i++) if (await old.page.isVisible('#ui-notice')) await old.page.click('[data-act="notice-ok"]');
		await old.page.evaluate(() => localStorage.setItem('uma-special-ui-mode', 'old'));
		await old.page.reload({ waitUntil: 'networkidle' });
		await old.page.waitForTimeout(400);
		const o = await old.page.evaluate(() => ({ inHome: !!document.querySelector('#ocr-dict-home #ocr-dict-box') }));
		assert(o.inHome, 'C132E 旧UIでは元の場所（②の下）にある', o);
		await old.ctx.close();
	});

	/* ====================================================================
	 * F: 右下の「＋」の展開
	 * ==================================================================== */
	await block('C132F 「＋」を展開すると UmaSkill Deck の下（×の直上側）に「セット」「レース」があり、押すと帯のボタンと同じ小窓が開く／レースを選ぶと短い表記を添える', async () => {
		const sp = await openSp({ ids: LONG.slice(0, 2) });
		const p = sp.page;
		await p.click('#fab-toggle');
		await p.waitForTimeout(300);
		const order = await p.evaluate(() => Array.from(document.getElementById('fab-nav').children).filter((c) => !c.hidden).map((c) => c.id || c.className));
		const iDeck = order.indexOf('deck-drawer-trigger');
		assert(iDeck >= 0 && order[iDeck + 1] === 'fab-item-set' && order[iDeck + 2] === 'fab-item-race' && /uma-fab-main/.test(order[iDeck + 3]), 'C132F 並びは …・UmaSkill Deck・セット・レース・（×）', order);
		const lab = await p.evaluate(() => ({ set: document.getElementById('fab-item-set').textContent.trim(), race: document.getElementById('fab-item-race').textContent.trim() }));
		assert(lab.set === 'セット' && lab.race === 'レース', 'C132F 文字は「セット」「レース」（レースを選んでいないときは表記なし）', lab);
		await p.click('#fab-item-set');
		await p.waitForSelector('[data-usd-el="set-list"]');
		assert(!(await p.evaluate(() => document.getElementById('fab-nav').classList.contains('open'))), 'C132F 「セット」を押すと展開が閉じて、セットの一覧の小窓が開く', null);
		await p.keyboard.press('Escape');
		await p.click('#fab-toggle');
		await p.waitForTimeout(300);
		await p.click('#fab-item-race');
		await p.waitForSelector('[data-usd-el="race-list"]');
		const race = RACES[0];
		await p.click('[data-usd-el="race-opt"][data-race-id="' + race.id + '"] input');
		await p.waitForTimeout(500);
		await p.keyboard.press('Escape');
		await p.click('#fab-toggle');
		await p.waitForTimeout(300);
		const r = await p.evaluate(() => {
			const t = document.getElementById('fab-race-text');
			const item = document.getElementById('fab-item-race');
			return { text: t.textContent, hidden: t.hidden, bar: document.querySelector('#deck-set-bar [data-usd-el="set-race-text"]').textContent, oneLine: item.getBoundingClientRect().height <= 52, sw: document.documentElement.scrollWidth, iw: innerWidth };
		});
		assert(!r.hidden && r.text === r.bar && r.oneLine && r.sw <= r.iw, 'C132F レースを選ぶと、帯と同じ短い表記（' + r.text + '）を1行で添える', r);
		assert(jsErrors(sp.errors).length === 0, 'C132F コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
