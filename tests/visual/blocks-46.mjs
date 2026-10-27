// ②因子周回の入口の作り直し 段D（2026-10-21・C-187）の検査。run-smoke.mjs の末尾から register46() で呼ばれる
// （塊の見出しはすべて「C-187」で始まる。`npm run test:visual -- --only=C-187` で回せる）。
//
// 対象: (a) 入口の2つのボタン（オススメサポ・脚質オススメ）が同じ見た目（段F0〔2026-10-22〕で書き直した。C-187 の「虹色の縁」は取り消し。オススメサポは 0530272 の見た目、脚質オススメは同じクラス）／(b) ①の6枚のカード（タイル）／(c) 同じ種別が2枚以上のときだけ出る小さな番号／
// (d) 表の列見出し（サポカの6列。アイコンのメニュー）／(e) 育成ウマ娘の列の見出しは変わらない／(f) 横スクロールなし・ライト・ダーク／(g) ①のカード選択の窓の SSR・SR の印。
// カード名・種別・レアリティは検査の側に書かない（恒久ルール1。データから読む）。

export async function register46(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const CARDS = readJson('data/support-cards.json').entries;
	const byId = new Map(CARDS.map((c) => [c.id, c]));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const TYPE_NAMES = { 1: 'スピード', 2: 'スタミナ', 3: 'パワー', 4: '根性', 5: '賢さ', 6: '友人' };
	const KEYS = { 1: 'speed', 2: 'stamina', 3: 'power', 4: 'guts', 5: 'wisdom', 6: 'friend' };
	const firstOf = (t) => CARDS.find((c) => c.rarity === 'SSR' && !c.isGroup && c.typeOrder === t);
	// 同じ種別が2組（友人×2・スピード×2）と、1枚だけの種別（根性・スタミナ）を含む編成
	const SAME_IDS = ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'];
	// 6枚とも種別が違う編成（種別ごとに最初の SSR）
	const DIFF_IDS = [1, 2, 3, 4, 5, 6].map((t) => firstOf(t).id);
	const SR_CARD = CARDS.find((c) => c.rarity === 'SR' && !c.isGroup);
	// 選ぶ必要のあるイベント（選択肢が2つ以上）を持つカードと、持たないカード（実データから。名前は書かない）。イベントの有無は画面の data-has-events で確かめる
	const EV_CARD_IDS = new Set(readJson('data/support-card-event-skills.json').entries.filter((x) => x.status === 'done' && x.chain.some((st) => st.choices.length >= 2)).map((x) => x.cardId));
	const pickDistinct = (list, n) => { const out = [], seen = new Set(); for (const c of list) { if (!seen.has(c.charaName)) { seen.add(c.charaName); out.push(c.id); if (out.length === n) break; } } return out; };
	const MIXED_IDS = pickDistinct(CARDS.filter((c) => c.rarity === 'SSR' && !c.isGroup && EV_CARD_IDS.has(c.id)), 3).concat(pickDistinct(CARDS.filter((c) => c.rarity === 'SSR' && !c.isGroup && !EV_CARD_IDS.has(c.id)), 3));
	const FILTER = { surface: 'turf', style: 'nige', distance: 'medium' };
	// 変更前（段C の最後の状態）の見出しの高さ（実測。PC・390・360）
	const BEFORE_HEAD = { 1280: 73, 390: 49, 360: 49 };
	const sleep = (page, ms) => page.waitForTimeout(ms);
	const srcKey = (src) => { const m = /osusume-(type|rarity)-([a-z]+)-2026-10-21\.png/.exec(src || ''); return m ? m[1] + ':' + m[2] : null; };

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, EMPTY);
		await sp.page.evaluate(({ roster, theme, tab }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', tab);
			try { localStorage.setItem('uma-tools-theme', theme); } catch (e) {}
		}, { roster: o.roster || { umaId: 'uma-0179', cardIds: SAME_IDS, skillFilter: FILTER }, theme: o.theme || 'light', tab: o.tab || '0' });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(o.tab === '1' ? '#deck-template-panel .usd-entry-row' : '#deck-roster-panel .usd-roster-grid', { timeout: 15000 });
		await sleep(sp.page, 400);
		return sp;
	};
	const RP = '#deck-roster-panel ';
	// 色の文字列 → [r,g,b,a]
	const rgbOf = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
	const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
	const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const hexRgb = (h) => { const m = /#([0-9a-f]{6})/i.exec(h || ''); return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1] : null; };

	await block('C-187(a)→段F0 入口の2つのボタン（オススメサポ・脚質オススメ）は同じ見た目: 同じクラス（usd-outside-entry）・同じ枠線（1px・固有スキルの縁の色）・同じ内側の塗り（淡い3色のグラデーション）・同じ文字色。ほかの入口より目立つ。文字は塗りの上で 4.5:1 以上（ライト・ダーク × 390・360・1280）', async () => {
		for (const [w, theme] of [[390, 'light'], [390, 'dark'], [360, 'light'], [360, 'dark'], [1280, 'light'], [1280, 'dark']]) {
			const sp = await openSp({ w, theme, tab: '1', h: w === 1280 ? 900 : 844 });
			const r = await sp.page.evaluate(() => {
				const pick = (sel) => {
					const b = document.querySelector('#deck-template-panel ' + sel);
					if (!b) return null;
					const cs = getComputedStyle(b), rc = b.getBoundingClientRect();
					return { cls: b.className, bgImg: cs.backgroundImage, bw: cs.borderTopWidth, bs: cs.borderTopStyle, bc: cs.borderTopColor, color: cs.color, bgClip: cs.backgroundClip, h: Math.round(rc.height), text: b.textContent.trim(), icon: !!b.querySelector('[data-lucide], svg') };
				};
				const root = getComputedStyle(document.documentElement);
				return { a: pick('[data-usd-el="outside-open"]'), b: pick('[data-usd-el="style-open"]'), other: pick('.usd-entry-row [data-usd-act="editor-pick"]'), from: root.getPropertyValue('--usd-skill-unique-from'), mid: root.getPropertyValue('--usd-skill-unique-mid'), to: root.getPropertyValue('--usd-skill-unique-to'), edge: root.getPropertyValue('--usd-skill-unique-edge') };
			});
			const tag = 'C-187(a) ' + w + 'px・' + theme + ': ';
			assert(r.a && r.b && r.a.cls === r.b.cls && /usd-outside-entry/.test(r.a.cls), tag + '2つは同じクラス（usd-outside-entry）で作られている', [r.a && r.a.cls, r.b && r.b.cls]);
			assert(r.a.bgImg === r.b.bgImg && r.a.bw === r.b.bw && r.a.bs === r.b.bs && r.a.bc === r.b.bc && r.a.color === r.b.color && r.a.bgClip === r.b.bgClip && r.a.h === r.b.h, tag + '枠線・内側の塗り（淡い3色）・文字色・高さが同じ', { a: [r.a.bgImg.slice(0, 60), r.a.bw, r.a.color, r.a.h], b: [r.b.bgImg.slice(0, 60), r.b.bw, r.b.color, r.b.h] });
			assert(r.a.bw === '1px' && (r.a.bgImg.match(/linear-gradient/g) || []).length === 1, tag + '縁は1px・内側は淡い3色のグラデーション1枚（0530272 のオススメサポのまま）', r.a.bgImg.slice(0, 80));
			assert(r.a.text.indexOf('オススメサポ') !== -1 && r.b.text.indexOf('脚質オススメ') !== -1 && r.a.icon && r.b.icon, tag + '違いはアイコンと文字だけ', [r.a.text, r.b.text]);
			assert(r.other && r.other.bgImg === 'none' && r.other.bc !== r.a.bc, tag + '入口の列のほかのボタン（条件で検索）は、淡い3色の塗り・ピンクの縁ではない（2つのほうが目立つ）', [r.other && r.other.bgImg, r.other && r.other.bw]);
			const fills = [r.from, r.mid, r.to].map(hexRgb);
			const txt = rgbOf(r.a.color);
			const worst = Math.min.apply(null, fills.map((f) => contrast(txt, f)));
			assert(fills.every(Boolean) && worst >= 4.5, tag + '文字は淡い3色の上で 4.5:1 以上（最小 ' + worst.toFixed(2) + '）', { fills: [r.from, r.mid, r.to], color: r.a.color });
			const edge = hexRgb(r.edge), bcRgb = rgbOf(r.a.bc);
			assert(edge && bcRgb && edge[0] === bcRgb[0] && edge[1] === bcRgb[1] && edge[2] === bcRgb[2] && r.a.bc === r.b.bc, tag + '縁の色は固有スキルの縁の色（--usd-skill-unique-edge）で、2つで同じ', [r.a.bc, r.edge]);
			assert(await sp.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	// ①の6枚のタイルと列見出しの計測（共通）
	const measure = (page) => page.evaluate(() => {
		const q = (s, r) => Array.from((r || document).querySelectorAll(s));
		const rect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
		const tiles = q('#deck-roster-panel [data-usd-el="roster-tile"]').map((t) => {
			const cs = getComputedStyle(t), ti = t.querySelector('[data-usd-el="card-type-icon"]'), ri = t.querySelector('[data-usd-el="card-rarity-icon"]');
			const no = t.querySelector('[data-usd-el="card-no"]'), nick = t.querySelector('[data-usd-el="roster-tile-nick"]'), name = t.querySelector('[data-usd-el="roster-tile-name"]');
			const x = t.querySelector('[data-usd-el="clear-card"]'), main = t.querySelector('[data-usd-el="pick-card"]');
			const tr = rect(t);
			return {
				index: Number(t.getAttribute('data-index')), empty: t.classList.contains('usd-roster-tile--empty'), h: Math.round(tr.h), bg: cs.backgroundColor, bgImg: cs.backgroundImage, bw: cs.borderTopWidth, bs: cs.borderTopStyle, bc: cs.borderTopColor,
				type: ti ? ti.getAttribute('src') : null, typeAlt: ti ? ti.getAttribute('alt') : null, typeW: ti ? Math.round(rect(ti).w) : null, rar: ri ? ri.getAttribute('src') : null, rarAlt: ri ? ri.getAttribute('alt') : null,
				no: no ? no.textContent : null, noBox: no ? { w: rect(no).w, h: rect(no).h, cx: (rect(no).l + rect(no).r) / 2, cy: (rect(no).t + rect(no).b) / 2, bg: getComputedStyle(no).backgroundColor, color: getComputedStyle(no).color } : null,
				iconBox: ti ? { cx: (rect(ti).l + rect(ti).r) / 2, cy: (rect(ti).t + rect(ti).b) / 2, w: rect(ti).w } : null,
				nickText: nick ? nick.textContent : null, nickSize: nick ? parseFloat(getComputedStyle(nick).fontSize) : null, nameText: name ? name.textContent : null, nameSize: name ? parseFloat(getComputedStyle(name).fontSize) : null,
				nameOver: name ? (rect(name).r > tr.r + 0.5 || rect(name).l < tr.l - 0.5) : null,
				x: x ? { w: Math.round(rect(x).w), h: Math.round(rect(x).h), label: x.getAttribute('aria-label'), text: x.textContent } : null, mainLabel: main ? main.getAttribute('aria-label') : null, cardCls: t.className
			};
		});
		const heads = q('#deck-roster-panel .usd-roster-grow[role="row"]:first-child .usd-roster-gh').map((c) => {
			const cs = getComputedStyle(c), btn = c.querySelector('[data-usd-el="col-menu-btn"]'), ti = c.querySelector('[data-usd-el="card-type-icon"]'), no = c.querySelector('[data-usd-el="card-no"]');
			return {
				label: c.getAttribute('aria-label'), cls: c.className, h: Math.round(rect(c).h * 10) / 10, w: Math.round(rect(c).w * 10) / 10, bg: cs.backgroundColor, bgImg: cs.backgroundImage,
				funnel: !!c.querySelector('.usd-roster-funnel'), sortBtn: !!c.querySelector('[data-usd-el="sort-btn"]'), legendNo: !!c.querySelector('.usd-roster-legend-no'), evBtn: !!c.querySelector('[data-usd-el="events-btn"]'),
				btn: btn ? { w: rect(btn).w, h: rect(btn).h, no: Number(btn.getAttribute('data-no')), type: btn.getAttribute('data-type-order'), label: btn.getAttribute('aria-label'), key: btn.getAttribute('data-member-key'), bw: getComputedStyle(btn).borderTopWidth, bc: getComputedStyle(btn).borderTopColor, bs: getComputedStyle(btn).borderTopStyle, unsel: btn.getAttribute('data-unselected'), sorted: btn.getAttribute('data-sorted') } : null,
				typeSrc: ti ? ti.getAttribute('src') : null, typeW: ti ? Math.round(rect(ti).w) : null, no: no ? no.textContent : null,
				noBox: no ? { w: rect(no).w, h: rect(no).h, cx: (rect(no).l + rect(no).r) / 2, cy: (rect(no).t + rect(no).b) / 2 } : null, iconBox: ti ? { cx: (rect(ti).l + rect(ti).r) / 2, cy: (rect(ti).t + rect(ti).b) / 2 } : null,
				cap: !!c.querySelector('.usd-roster-gh-name') && getComputedStyle(c.querySelector('.usd-roster-gh-name')).display !== 'none', isUma: c.classList.contains('usd-roster-gc--uma'), isName: c.classList.contains('usd-roster-gc--name'), empty: c.classList.contains('usd-roster-gh--empty')
			};
		});
		return { tiles, heads, sw: document.documentElement.scrollWidth, vw: window.innerWidth };
	});

	await block('C-187(b) ①の6枚のカード: 種別アイコン・名前12px・二つ名10px・×（押せる範囲44px）。面は無彩色（種別で色を変えない）・編成のカードは2pxの縁。番号の丸バッジ・種類色の塗りは無い（390・360・1280・ライト・ダーク）', async () => {
		for (const [w, theme] of [[390, 'light'], [390, 'dark'], [360, 'light'], [1280, 'light'], [1280, 'dark']]) {
			const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844 });
			const m = await measure(sp.page);
			const tag = 'C-187(b) ' + w + 'px・' + theme + ': ';
			assert(m.tiles.length === 6 && m.tiles.every((t) => !t.empty), tag + 'カードは6枚（空きなし）', m.tiles.length);
			const bad = m.tiles.filter((t) => {
				const c = byId.get(SAME_IDS[t.index]);
				return srcKey(t.type) !== 'type:' + KEYS[c.typeOrder] || t.typeAlt !== TYPE_NAMES[c.typeOrder] || t.typeW !== 20 || t.nickText !== '[' + c.title + ']' || !t.nameText || t.nameText.indexOf(c.charaName) === -1;
			});
			assert(bad.length === 0, tag + '種別アイコン（20px・alt）・二つ名・名前がデータどおり', bad);
			assert(m.tiles.every((t) => (w <= 639 ? t.nameSize === 11 && t.nickSize === 9 : t.nameSize === 12 && t.nickSize === 10)), tag + '名前・二つ名の大きさ（2列表示は 11px・9px〔C-188〕／3列表示は 12px・10px）', m.tiles.map((t) => [t.nameSize, t.nickSize]));
			assert(new Set(m.tiles.map((t) => t.bg)).size === 1 && m.tiles.every((t) => t.bgImg === 'none'), tag + '面は種別によらず同じ無彩色（色の塗り・グラデーションなし）', m.tiles.map((t) => t.bg));
			// 段G(6)（2026-10-22）: 通常は細い枠（1px）にした。太い枠（2px）は、選んでいる（選択の窓を開いている）タイルだけ（段G の検査）
			assert(m.tiles.every((t) => t.bw === '1px' && t.bs === 'solid') && new Set(m.tiles.map((t) => t.bc)).size === 1, tag + '編成のカードは通常は細い縁（1px・同じ色）', m.tiles.map((t) => [t.bw, t.bc]));
			assert(m.tiles.every((t) => t.x && t.x.w >= 44 && t.x.h >= 44 && t.x.text === '×' && /枚目を外す$/.test(t.x.label)), tag + '×の押せる範囲は44px以上・読み上げは「N枚目を外す」', m.tiles.map((t) => t.x));
			assert(m.tiles.every((t) => (w <= 639 ? t.h >= 28 && t.h <= 33 : t.h === 44) && !t.nameOver && t.mainLabel.indexOf((t.index + 1) + '枚目：') === 0), tag + 'タイルの高さは44px・名前がはみ出さない・読み上げは「N枚目：…」', m.tiles.map((t) => [t.h, t.mainLabel]));
			assert(!(await sp.page.evaluate(() => !!document.querySelector('#deck-roster-panel .usd-roster-slot, #deck-roster-panel [data-usd-el="badge"], #deck-roster-panel .usd-roster-slots .usd-roster-legend-no'))), tag + '番号の丸バッジ（旧）は無い', true);
			assert(m.sw <= m.vw, tag + '横スクロールなし', [m.sw, m.vw]);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('C-187(b2) ①のカードの空きの枠は破線の「サポカを選ぶ」（種別アイコン・番号・×なし）。押すとカード選択の窓が開く', async () => {
		const sp = await openSp({ roster: { umaId: 'uma-0179', cardIds: [SAME_IDS[0], null, SAME_IDS[2]], skillFilter: FILTER } });
		const m = await measure(sp.page);
		const empties = m.tiles.filter((t) => t.empty);
		assert(m.tiles.length === 6 && empties.length === 4 && empties.every((t) => t.bs === 'dashed' && t.type === null && t.no === null && t.x === null && t.nameText === 'サポカを選ぶ'), 'C-187(b2) 空き4枠は破線・アイコン・番号・×なし・文言は「サポカを選ぶ」', empties);
		await sp.page.click(RP + '[data-usd-el="roster-tile"][data-index="1"] [data-usd-act="pick-card"]');
		await sp.page.waitForSelector('[data-usd-el="hits"] .usd-name-hit', { timeout: 10000 });
		assert(await sp.page.isVisible('[data-usd-el="modal"]'), 'C-187(b2) 空きの枠を押すとカード選択の窓が開く', true);
		await sp.ctx.close();
	});

	await block('C-187(b3) レアリティの印: ①のカードに SSR の印は出ない／SR のカードを置いたときだけ SR の印が出る。②のオススメサポの小窓では SSR・SR の両方が出る', async () => {
		const sr = [SAME_IDS[0], SAME_IDS[1], SAME_IDS[2], SAME_IDS[3], SAME_IDS[4], SR_CARD.id];
		const sp = await openSp({ roster: { umaId: 'uma-0179', cardIds: sr, skillFilter: FILTER, outsideOptions: { count: 4 } } });
		const m = await measure(sp.page);
		assert(m.tiles.slice(0, 5).every((t) => t.rar === null), 'C-187(b3) ①の SSR のカード5枚には、レアリティの印が出ない', m.tiles.map((t) => t.rar));
		assert(srcKey(m.tiles[5].rar) === 'rarity:sr' && m.tiles[5].rarAlt === 'SR' && /（[^）]*SR[^）]*）$/.test(m.tiles[5].mainLabel), 'C-187(b3) SR のカードだけ SR の印（alt・読み上げにも SR）', m.tiles[5]);
		assert(m.tiles.slice(0, 5).every((t) => t.mainLabel.indexOf('SSR') === -1), 'C-187(b3) SSR は読み上げにも出さない', m.tiles.map((t) => t.mainLabel));
		// ②のオススメサポの小窓（SSR・SR の両方）
		await sp.page.click('#step-tab-1');
		await sp.page.waitForSelector('#deck-template-panel [data-usd-el="outside-open"]', { timeout: 10000 });
		await sp.page.click('#deck-template-panel [data-usd-el="outside-open"]');
		await sp.page.waitForFunction(() => { const mm = document.querySelector('[data-usd-el="outside-modal"]'); return !!mm && !mm.hidden && !mm.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
		await sleep(sp.page, 300);
		const tiles = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] .usd-out-card')).map((t) => ({ id: t.getAttribute('data-card-id'), rar: t.getAttribute('data-rarity'), icon: (t.querySelector('[data-usd-el="card-rarity-icon"]') || {}).alt || null })));
		const ssr = tiles.filter((t) => t.rar === 'SSR'), srs = tiles.filter((t) => t.rar === 'SR');
		assert(ssr.length > 0 && ssr.every((t) => t.icon === 'SSR'), 'C-187(b3) ②のオススメサポの小窓では、SSR のカードに SSR の印が出る（' + ssr.length + '枚）', tiles);
		assert(srs.every((t) => t.icon === 'SR'), 'C-187(b3) ②のオススメサポの小窓では、SR のカードに SR の印が出る（' + srs.length + '枚）', tiles);
		await sp.ctx.close();
	});

	await block('C-187(c)→C-188 番号の丸は廃止: 同じ種別が2枚以上でも、タイル・列見出しのどこにも番号の丸が出ない。並びは aria-label の「N枚目」だけ。見出しの高さは全列で同じで変更前以下', async () => {
		for (const [ids, label] of [[SAME_IDS, '同じ種別あり'], [DIFF_IDS, '全部違う種別']]) {
			for (const [w, theme] of [[390, 'light'], [360, 'dark'], [1280, 'light']]) {
				const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844, roster: { umaId: 'uma-0179', cardIds: ids, skillFilter: FILTER } });
				const m = await measure(sp.page);
				const tag = 'C-188 ' + label + ' ' + w + 'px・' + theme + ': ';
				assert(m.tiles.every((t) => t.no === null) && m.heads.every((h) => h.no === null), tag + 'タイルにも列見出しにも番号の丸が無い', true);
				assert(m.tiles.every((t, i) => t.mainLabel.indexOf((i + 1) + '枚目：') === 0), tag + 'タイルの読み上げに「N枚目」がある', m.tiles.map((t) => t.mainLabel));
				assert(m.heads.filter((h) => h.btn && h.btn.no).every((h, i) => h.btn.label.indexOf((i + 1) + '枚目：') === 0), tag + '列見出し（サポカの列）の読み上げにも「N枚目」がある', m.heads.filter((h) => h.btn && h.btn.no).map((h) => h.btn.label));
				assert(new Set(m.heads.map((h) => h.h)).size === 1 && m.heads[0].h <= BEFORE_HEAD[w], tag + '見出しの高さは全列で同じ（' + m.heads[0].h + 'px）で変更前（' + BEFORE_HEAD[w] + 'px）以下', m.heads.map((h) => h.h));
				assert(m.sw <= m.vw, tag + '横スクロールなし', [m.sw, m.vw]);
				await sp.ctx.close();
			}
		}
	});

	await block('C-187(d1) 列見出し（サポカの6列）: 塗りが無い（ほかの列と同じ面）・じょうごと番号の丸が無い・種別アイコン24px・押せる範囲は高さ44px以上で列の幅いっぱい・細い無彩色の輪・aria-label', async () => {
		for (const [w, theme] of [[390, 'light'], [390, 'dark'], [360, 'light'], [1280, 'light'], [1280, 'dark']]) {
			const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844 });
			const m = await measure(sp.page);
			const tag = 'C-187(d1) ' + w + 'px・' + theme + ': ';
			const cards = m.heads.filter((h) => h.btn && h.btn.no);   // サポカの列（data-no がある。2026-10-26 から育成ウマ娘・シナリオの列も同じボタンだが data-no は無い）
			const nameCol = m.heads.find((h) => h.isName);
			assert(cards.length === 6, tag + 'サポカの6列', cards.length);
			assert(cards.every((h) => h.bg === nameCol.bg && h.bgImg === 'none' && !/usd-roster-typed/.test(h.cls)), tag + '見出しの面は「スキル名」の列と同じ（種別色の塗りなし）', cards.map((h) => [h.bg, h.cls]));
			assert(cards.every((h) => !h.funnel && !h.sortBtn && !h.legendNo && !h.evBtn), tag + 'じょうご・番号の丸・イベントのボタン（旧）が無い', cards.map((h) => [h.funnel, h.legendNo, h.evBtn]));
			assert(cards.every((h) => h.typeW === 24 && h.typeSrc), tag + '種別アイコンは24px', cards.map((h) => h.typeW));
			assert(cards.every((h) => h.btn.h >= 44 && h.btn.w >= 24 && h.btn.w >= Math.min(44, h.w - 8)), tag + '押せる範囲: 高さ44px以上・幅は列の幅いっぱい（' + cards.map((h) => Math.round(h.btn.w)).join('/') + 'px）', cards.map((h) => [h.btn.w, h.btn.h, h.w]));
			assert(cards.every((h) => h.btn.bs === 'solid' && h.btn.bw === '1px'), tag + '押せるボタンだと分かる細い輪（1px の実線）', cards.map((h) => [h.btn.bs, h.btn.bw, h.btn.bc]));
			const idsNow = SAME_IDS;
			assert(cards.every((h, i) => { const c = byId.get(idsNow[i]); return h.btn.label.indexOf((i + 1) + '枚目：' + c.charaName + '（' + TYPE_NAMES[c.typeOrder] + '）のメニュー') === 0; }), tag + 'aria-label は「N枚目：名前（種別）のメニュー」（C-188）', cards.map((h) => h.btn.label));
			if (w >= 768) assert(cards.every((h) => h.cap), tag + '幅が広い画面では、見出しにカード名が今の位置（アイコンの下）に残る', cards.map((h) => h.cap));
			assert(m.heads[0].h <= BEFORE_HEAD[w], tag + '見出しの高さ ' + m.heads[0].h + 'px は変更前（' + BEFORE_HEAD[w] + 'px）以下', m.heads.map((h) => h.h));
			assert(m.sw <= m.vw, tag + '横スクロールなし', [m.sw, m.vw]);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	// 並べ替えの期待値（独立に数える）: 行をまとまり（行＋直後の前段の行）にし、その列に印のあるまとまりを上へ（安定）
	const rowsOf = (page) => page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('#deck-roster-panel .usd-roster-grow[data-skill-id]'));
		return rows.map((r) => ({ id: r.getAttribute('data-skill-id'), prev: r.classList.contains('usd-roster-grow--prev'), marks: Array.from(r.querySelectorAll('[role="cell"]')).map((c) => c.children.length > 0 || c.textContent.trim() !== '') }));
	});
	const expectedOrder = (rows, col) => {
		const units = [];
		rows.forEach((r) => { if (r.prev && units.length) units[units.length - 1].push(r); else units.push([r]); });
		const hit = (u) => u.some((r) => r.marks[col]);
		return [].concat.apply([], units.filter(hit).concat(units.filter((u) => !hit(u)))).map((r) => r.id);
	};

	await block('C-187(d2) アイコンを押すとメニューが開き、じょうごの動作（この列で並べ替え）が残っている: 結果は独立に数えた期待値と一致・もう一度で元の並び・押している列は印と aria-pressed で分かる・別の列に切り替えるともとの列は戻る', async () => {
		const sp = await openSp({ w: 390 });
		const base0 = await rowsOf(sp.page);
		const keys = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"][data-no]')).map((b) => b.getAttribute('data-member-key')));
		assert(keys.length === 6 && base0.length > 20, 'C-187(d2) 6列・行は20以上', [keys.length, base0.length]);
		// 列番号: 先頭のセルは行見出し、次が育成ウマ娘の列、その次からカードの6列（cells[0]＝育成ウマ娘）
		const colOfKey = (k) => 1 + Number(k);   // members: 育成ウマ娘(0)・カード1〜6(1〜6)
		const firstKey = keys[0], thirdKey = keys[2];
		await sp.page.click(RP + '[data-usd-el="col-menu-btn"][data-member-key="' + firstKey + '"]');
		await sp.page.waitForSelector('[data-usd-el="colmenu-ops"]', { timeout: 5000 });
		const menu = await sp.page.evaluate(() => ({ items: Array.from(document.querySelectorAll('[data-usd-el="colmenu-ops"] button')).map((b) => ({ el: b.getAttribute('data-usd-el'), text: b.textContent, pressed: b.getAttribute('aria-pressed'), h: Math.round(b.getBoundingClientRect().height) })), expanded: document.querySelector('[data-usd-el="col-menu-btn"][aria-expanded="true"]') ? true : false, title: (document.querySelector('.usd-info-title, [data-usd-el="skill-info-title"]') || {}).textContent }));
		assert(menu.items.some((i) => i.el === 'colmenu-sort' && i.text === 'ソート' && i.pressed === 'false' && i.h >= 44), 'C-187(d2) メニューに「ソート」（押していない・押せる範囲44px以上）がある（2026-10-26 に「並べ替え：この列が得るスキルを上に寄せる」から）', menu);
		assert(menu.expanded === true, 'C-187(d2) アイコンのボタンは aria-expanded=true になる', menu.expanded);
		await sp.page.click('[data-usd-el="colmenu-sort"]');
		await sleep(sp.page, 300);
		const sorted1 = await rowsOf(sp.page);
		const colIdx = (k) => { const i = keys.indexOf(k); return 1 + i; };   // 育成ウマ娘の列の次からカードの列
		assert(JSON.stringify(sorted1.map((r) => r.id)) === JSON.stringify(expectedOrder(base0, colIdx(firstKey))), 'C-187(d2) 1列目で並べ替え: 結果は独立に数えた期待値（その列の○を持つまとまりを上へ・安定）と一致', { got: sorted1.slice(0, 6).map((r) => r.id), want: expectedOrder(base0, colIdx(firstKey)).slice(0, 6) });
		assert(JSON.stringify(sorted1.map((r) => r.id)) !== JSON.stringify(base0.map((r) => r.id)), 'C-187(d2) 並びは実際に変わっている', true);
		const st = await sp.page.evaluate((k) => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"]')).map((b) => [b.getAttribute('data-member-key'), b.getAttribute('data-sorted')]), firstKey);
		assert(st.filter((s) => s[1] === '1').length === 1 && st.find((s) => s[0] === firstKey)[1] === '1', 'C-187(d2) 押している列だけ並べ替え中の印（data-sorted）', st);
		// 別の列に切り替える
		await sp.page.click(RP + '[data-usd-el="col-menu-btn"][data-member-key="' + thirdKey + '"]');
		await sp.page.waitForSelector('[data-usd-el="colmenu-ops"]', { timeout: 5000 });
		await sp.page.click('[data-usd-el="colmenu-sort"]');
		await sleep(sp.page, 300);
		const sorted3 = await rowsOf(sp.page);
		assert(JSON.stringify(sorted3.map((r) => r.id)) === JSON.stringify(expectedOrder(base0, colIdx(thirdKey))), 'C-187(d2) 別の列に切り替えると、その列の並び（元の並びからの期待値）になる', { got: sorted3.slice(0, 6).map((r) => r.id) });
		// 同じ列でもう一度押すと元の並び。押している状態は aria-pressed
		await sp.page.click(RP + '[data-usd-el="col-menu-btn"][data-member-key="' + thirdKey + '"]');
		await sp.page.waitForSelector('[data-usd-el="colmenu-ops"]', { timeout: 5000 });
		assert(await sp.page.getAttribute('[data-usd-el="colmenu-sort"]', 'aria-pressed') === 'true', 'C-187(d2) 並べ替え中の列のメニューは、並べ替えが押した状態（aria-pressed=true）', true);
		await sp.page.click('[data-usd-el="colmenu-sort"]');
		await sleep(sp.page, 300);
		const back = await rowsOf(sp.page);
		assert(JSON.stringify(back.map((r) => r.id)) === JSON.stringify(base0.map((r) => r.id)), 'C-187(d2) もう一度押すと元の並びに戻る', true);
		// 閉じるとフォーカスはアイコンのボタンへ戻る
		const focused = await sp.page.evaluate(() => { const a = document.activeElement; return a ? a.getAttribute('data-usd-el') + ':' + a.getAttribute('data-member-key') : null; });
		assert(focused === 'col-menu-btn:' + thirdKey, 'C-187(d2) 並べ替えたあと、フォーカスはその列のアイコンのボタンへ戻る', focused);
		assert(jsErrors(sp.errors).length === 0, 'C-187(d2) コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C-187(d3) メニューの「イベント/スキル」: 番号の丸が持っていた動作（選ぶ必要のあるイベントの小窓を開く・未選択の「！」と件数）が残っている。イベントの無いカードのメニューは並べ替えだけ', async () => {
		// 選ぶ必要のあるイベントも結果の切り替えも持たないカードを、画面の計算（computeRosterSkills）で探す（見つからなければ、前提として失敗にする）
		const probe = await openSp({ w: 390 });
		const noEv = await probe.page.evaluate(async (cands) => {
			const C = UmaSkillDeckCore;
			await C.loadTrainingSources(); await C.loadSkillPtData(); await C.loadScenarioEvents(false);
			const out = [];
			for (const id of cands) {
				const r = C.computeRosterSkills({ cardIds: [id] }, { autoChoose: true });
				const m = r.members.find((x) => x.kind === 'card' && x.label);
				if (m && r.events.every((e) => e.memberKey !== m.key) && (r.resultEvents || []).every((e) => e.memberKey !== m.key)) out.push(id);
				if (out.length >= 3) break;
			}
			return out;
		}, CARDS.filter((c) => c.rarity === 'SSR' && !c.isGroup).map((c) => c.id));
		await probe.ctx.close();
		assert(noEv.length >= 1, 'C-187(d3) 前提: 選ぶイベントも結果の切り替えも持たないカードがデータにある（' + noEv.length + '枚）', noEv);
		const mixed = MIXED_IDS.slice(0, 3).concat(noEv.slice(0, 3));
		const sp = await openSp({ w: 390, roster: { umaId: 'uma-0179', cardIds: mixed, skillFilter: FILTER } });
		const info = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"]')).map((b) => ({ key: b.getAttribute('data-member-key'), unsel: Number(b.getAttribute('data-unselected')), bang: !!b.querySelector('[data-usd-el="gh-bang"]'), label: b.getAttribute('aria-label') })));
		const withEv = [];
		for (const i of info) {
			await sp.page.click(RP + '[data-usd-el="col-menu-btn"][data-member-key="' + i.key + '"]');
			await sp.page.waitForSelector('[data-usd-el="colmenu-ops"]', { timeout: 5000 });
			const has = await sp.page.evaluate(() => !!document.querySelector('[data-usd-el="colmenu-events"]'));
			const txt = has ? await sp.page.textContent('[data-usd-el="colmenu-events"]') : '';
			withEv.push({ key: i.key, has, txt });
			await sp.page.keyboard.press('Escape');
			await sleep(sp.page, 150);
		}
		const hasAttr = await sp.page.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="col-menu-btn"]')).map((b) => [b.getAttribute('data-member-key'), b.hasAttribute('data-has-events')]));
		assert(withEv.some((x) => x.has) && withEv.some((x) => !x.has) && withEv.every((x) => hasAttr.find((a) => a[0] === x.key)[1] === x.has), 'C-187(d3) イベントのあるカードにだけ「イベント/スキル」がある（あり ' + withEv.filter((x) => x.has).length + '・なし ' + withEv.filter((x) => !x.has).length + '。data-has-events と一致）', { withEv, hasAttr });
		assert(info.every((i) => i.bang === (i.unsel > 0)), 'C-187(d3) 未選択があるカードのアイコンには「！」が出る（件数は data-unselected・aria-label にも）', info);
		assert(info.filter((i) => i.unsel > 0).every((i) => i.label.indexOf('（未選択' + i.unsel + '件）') !== -1) && withEv.filter((x) => x.has).every((x, n) => { const i = info.find((y) => y.key === x.key); return i.unsel === 0 ? x.txt === 'イベント/スキル' || x.txt.indexOf('結果を切り替え中') !== -1 : x.txt.indexOf('未選択' + i.unsel + '件') !== -1; }), 'C-187(d3) メニューの文言にも未選択の件数が出る', withEv);
		const key = withEv.find((x) => x.has).key;
		await sp.page.click(RP + '[data-usd-el="col-menu-btn"][data-member-key="' + key + '"]');
		await sp.page.waitForSelector('[data-usd-el="colmenu-events"]', { timeout: 5000 });
		await sp.page.click('[data-usd-el="colmenu-events"]');
		await sp.page.waitForSelector('[data-usd-el="events-panes"], [data-usd-el="events-pane-events"]', { timeout: 5000 });
		const ev = await sp.page.evaluate(() => ({ choices: document.querySelectorAll('[data-usd-el="events-pane-events"]').length, expanded: !!document.querySelector('[data-usd-el="col-menu-btn"][aria-expanded="true"]') }));
		assert(ev.choices > 0 && ev.expanded, 'C-187(d3) 「イベント/スキル」でイベントの小窓が開く（選択肢が出る・アイコンが開いた状態）', ev);
		await sp.page.keyboard.press('Escape');
		await sleep(sp.page, 200);
		const focus = await sp.page.evaluate(() => { const a = document.activeElement; return a ? a.getAttribute('data-usd-el') + ':' + a.getAttribute('data-member-key') : null; });
		assert(focus === 'col-menu-btn:' + key, 'C-187(d3) 小窓を閉じると、フォーカスはその列のアイコンのボタンへ戻る', focus);
		await sp.ctx.close();
	});

	await block('C-187(e) 育成ウマ娘の列の見出しは、サポカと同じメニューのボタン（キャラアイコン 24px・じょうご無し。2026-10-26）で、見出しの面はほかの列と同じ（2026-10-27）／サポカの6列と同じ高さ／横スクロールなし（390・360・1280・ライト・ダーク）', async () => {
		for (const [w, theme] of [[390, 'light'], [360, 'dark'], [1280, 'light'], [1280, 'dark']]) {
			const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844 });
			const m = await measure(sp.page);
			const tag = 'C-187(e) ' + w + 'px・' + theme + ': ';
			const uma = m.heads.find((h) => h.isUma);
			const card1 = m.heads.find((h) => h.btn && h.btn.no === 1);
			const umaIco = await sp.page.evaluate(() => { const i = document.querySelector('#deck-roster-panel .usd-roster-gc--uma [data-usd-el="col-menu-btn"] [data-usd-el="uma-icon"]'); return i ? Math.round(i.getBoundingClientRect().width) : null; });
			assert(uma && !uma.funnel && !uma.sortBtn && !uma.evBtn && uma.btn && card1 && uma.btn.w === card1.btn.w && uma.btn.h === card1.btn.h && uma.btn.bw === card1.btn.bw && umaIco === 24,
				tag + '育成ウマ娘の列は、じょうごが無く、サポカと同じ大きさ・同じ枠のメニューのボタン（キャラアイコン 24px）', { uma: uma && uma.btn, card: card1 && card1.btn, umaIco });
			const root = await sp.page.evaluate(() => { const c = document.querySelector('#deck-roster-panel .usd-roster-gh.usd-roster-gc--uma'); return { bg: getComputedStyle(c).backgroundColor, diamond: !!c.querySelector('[data-usd-el="uma-icon"]'), key: getComputedStyle(document.documentElement).getPropertyValue('--uma-table-head-key-bg').trim() }; });
			// 2026-10-27（夜間のまとめ・作業3(10)）: 濃い面は外した。見出しはほかの列と同じ面で、列は印（キャラアイコン）で見分ける
			assert(root.diamond && root.bg === card1.bg, tag + '育成ウマ娘の印（画像）があり、見出しの面はサポカの列と同じ（濃い面ではない）', { root, card: card1.bg });
			assert(new Set(m.heads.map((h) => h.h)).size === 1, tag + '全列の見出しの高さが同じ', m.heads.map((h) => h.h));
			assert(m.sw <= m.vw, tag + '横スクロールなし', [m.sw, m.vw]);
			await sp.ctx.close();
		}
	});

	await block('C-187(g) ①のカード選択の窓: SSR の印は出ない／SR のカードは出ない（2026-10-27 から SSR だけ。②のオススメサポから開いた窓とは別）／390・360・1280・ライト・ダーク', async () => {
		for (const [w, theme] of [[390, 'light'], [390, 'dark'], [360, 'light'], [1280, 'light']]) {
			const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844, roster: { umaId: 'uma-0179', cardIds: [], skillFilter: FILTER } });
			await sp.page.click(RP + '[data-usd-el="roster-tile"][data-index="0"] [data-usd-act="pick-card"]');
			await sp.page.waitForSelector('[data-usd-el="hits"] .usd-name-hit', { timeout: 10000 });
			await sleep(sp.page, 300);
			const tag = 'C-187(g) ' + w + 'px・' + theme + ': ';
			const read = () => sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="hits"] button.usd-name-hit')).map((b) => ({ label: b.querySelector('.usd-name-hit-label').textContent, rar: (b.querySelector('[data-usd-el="card-rarity-icon"]') || {}).alt || null, type: !!b.querySelector('[data-usd-el="card-type-icon"]') })));
			const rows = await read();
			assert(rows.length > 10 && rows.every((r) => r.rar !== 'SSR'), tag + '候補の行に SSR の印は出ない（' + rows.length + '件）', rows.filter((r) => r.rar === 'SSR').slice(0, 3));
			// 2026-10-27（セッションJ・作業3）: ①の小窓は SSR だけになったので、SR を名前で絞っても出ない（SR の印は②のオススメサポから開いた窓で見る＝blocks-45 の C-186）
			const labelOf = (c) => (c.title ? '[' + c.title + ']' : '') + (c.isGroup && c.groupName ? c.groupName : c.charaName);
			await sp.page.fill('[data-usd-el="find"]', labelOf(SR_CARD));
			await sleep(sp.page, 400);
			const srRows = await read();
			const hit = srRows.find((r) => r.label === labelOf(SR_CARD));
			assert(!hit && srRows.every((r) => r.rar === null), tag + 'SR のカード（' + labelOf(SR_CARD) + '）は①の候補に出ない（SSR だけ）', srRows.slice(0, 3));
			assert(await sp.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});
}
