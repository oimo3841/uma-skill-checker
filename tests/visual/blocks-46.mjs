// ②因子周回の入口の作り直し 段D（2026-10-21・C-187）の検査。run-smoke.mjs の末尾から register46() で呼ばれる
// （塊の見出しはすべて「C-187」で始まる。`npm run test:visual -- --only=C-187` で回せる）。
//
// 対象: (a) 入口の2つのボタン（オススメサポ・脚質オススメ）が同じ見た目／(b) ①の6枚のカード（タイル）／(c) 同じ種別が2枚以上のときだけ出る小さな番号／
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

	await block('C-187(a) 入口の2つのボタン（オススメサポ・脚質オススメ）は同じ見た目: 同じクラス・同じ枠線（虹色・2px）・同じ内側の塗り（淡い虹色）・同じ文字色。ほかの入口より目立つ。文字は塗りの上で 4.5:1 以上（ライト・ダーク × 390・360・1280）', async () => {
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
				return { a: pick('[data-usd-el="outside-open"]'), b: pick('[data-usd-el="style-open"]'), other: pick('.usd-entry-row [data-usd-act="editor-pick"]'), from: root.getPropertyValue('--usd-rainbow-from'), mid: root.getPropertyValue('--usd-rainbow-mid'), to: root.getPropertyValue('--usd-rainbow-to') };
			});
			const tag = 'C-187(a) ' + w + 'px・' + theme + ': ';
			assert(r.a && r.b && r.a.cls === r.b.cls && /usd-rainbow-entry/.test(r.a.cls), tag + '2つは同じクラス（usd-rainbow-entry）で作られている', [r.a && r.a.cls, r.b && r.b.cls]);
			assert(r.a.bgImg === r.b.bgImg && r.a.bw === r.b.bw && r.a.bs === r.b.bs && r.a.color === r.b.color && r.a.bgClip === r.b.bgClip && r.a.h === r.b.h, tag + '枠線・内側の塗り（淡い虹色）・文字色・高さが同じ', { a: [r.a.bgImg.slice(0, 60), r.a.bw, r.a.color, r.a.h], b: [r.b.bgImg.slice(0, 60), r.b.bw, r.b.color, r.b.h] });
			assert(r.a.bw === '2px' && /linear-gradient.*linear-gradient/.test(r.a.bgImg), tag + '縁は2px の虹色・内側は淡い虹色（グラデーション2枚重ね）', r.a.bgImg.slice(0, 80));
			assert(r.a.text.indexOf('オススメサポ') !== -1 && r.b.text.indexOf('脚質オススメ') !== -1 && r.a.icon && r.b.icon, tag + '違いはアイコンと文字だけ', [r.a.text, r.b.text]);
			assert(r.other && r.other.bgImg === 'none' && r.other.bw !== '2px', tag + '入口の列のほかのボタン（条件で検索）は、虹色の縁・淡い塗りではない（2つのほうが目立つ）', [r.other && r.other.bgImg, r.other && r.other.bw]);
			const fills = [r.from, r.mid, r.to].map(hexRgb);
			const txt = rgbOf(r.a.color);
			const worst = Math.min.apply(null, fills.map((f) => contrast(txt, f)));
			assert(fills.every(Boolean) && worst >= 4.5, tag + '文字は淡い虹色の上で 4.5:1 以上（最小 ' + worst.toFixed(2) + '）', { fills: [r.from, r.mid, r.to], color: r.a.color });
			assert(/rgba\(0, 0, 0, 0\)|transparent/.test(r.a.bc) && r.a.bc === r.b.bc, tag + '縁は透明な 2px の枠の下に虹色を敷いた作り（2つで同じ）', r.a.bc);
			assert(await sp.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

}
