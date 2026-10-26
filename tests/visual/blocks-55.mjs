// 夜間のまとめ・作業4（2026-10-27）: イベントの小窓の見た目（①本育成編成の見た目を当てはめる）の検査。
// run-smoke.mjs の末尾から register55() で呼ばれる（塊の見出しはすべて「夜間4」で始まる。`npm run test:visual -- --only=夜間4` で回せる）。
//
// 対象: ①の表のサポカの列のメニューから開く小窓・シナリオの列の小窓・オススメサポのカード名の小窓（同じ部品 buildEventsInfo）
// (1) 選んだ選択肢のボタン: 太い枠（今のまま）＋地は --usd-ui-set（hover は足さない）
// (2) 金スキル: ①の表の金の行と同じ地＋左の縦バー 4px（--uma-gold-row-bar）。名前の文字色は変えない
// (3) 一覧にある下位の白だけを金の直下に「└」で並べる（字下げなし）。組は「確定」どうし・「未選択」どうしだけ
// (4) 回復・デバフ・緑の文字の色を①と同じに（右の一覧と左の選択肢のスキル名。太さは変えない）
// (5) 条件を満たしていないスキル: 灰色の文字＋スキル名に灰色の取り消し線・地の色と縦バーなし（右の一覧と左の選択肢）
// 見た目は 1280・390・360 × ライト・ダーク で、横スクロールなし・コンソールのエラー0・文字のコントラスト 4.5:1 以上。

import { scanTextContrastInPage, formatContrast } from './lib/contrast.mjs';
import { clickEvents } from './lib/col-menu.mjs';

export async function register55(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const SCEN = readJson('data/scenario-event-skills.json');
	// サポカの列 2（card-0402）は、距離＝短距離の絞り込みで、選択肢・金と白の組（英俊豪傑 └比類なき）・条件外のスキルがそろう
	const ROSTER = { umaId: 'uma-0179', cardIds: ['card-0564', 'card-0565', 'card-0402', 'card-0248', 'card-0535', 'card-0478'], skillFilter: { distance: 'short' } };
	const VIEWS = [[1280, 'light'], [1280, 'dark'], [390, 'light'], [390, 'dark'], [360, 'light'], [360, 'dark']];

	const openSp = async (w, theme, tab) => {
		const sp = await openPage(browser, base, 'special.html', { width: w, height: w === 1280 ? 900 : 844 }, EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(SCEN)));
		await sp.page.evaluate(({ roster, theme, tab }) => {
			localStorage.setItem('uma-tools-theme', theme);
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
		}, { roster: ROSTER, theme, tab });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(400);
		return sp;
	};
	// 小窓の中を測る（ペインが隠れていても計算された値で見る）
	const measurePop = (page) => page.evaluate(() => {
		const panes = document.querySelector('[data-usd-el="events-panes"]');
		const cs = (el) => getComputedStyle(el);
		const probe = (decl) => { const d = document.createElement('div'); d.style.cssText = decl; panes.appendChild(d); const c = cs(d).backgroundColor; const col = cs(d).color; d.remove(); return { bg: c, color: col }; };
		const rootVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
		const goldRowCell = document.querySelector('#deck-roster-panel .usd-roster-grow--gold:not(.usd-roster-grow--off) > .usd-roster-gc--name');
		const toneWant = { heal: probe('color: var(--usd-skill-heal-text)').color, debuff: probe('color: var(--usd-skill-debuff-text)').color, passive: probe('color: var(--usd-skill-passive-text)').color };
		const faint = probe('color: var(--uma-text-faint)').color;
		const heading = probe('color: var(--uma-text-heading)').color;
		const goldBg = probe('background-color: var(--uma-gold-row-bg, var(--uma-stitch-soft))').bg;
		const barProbe = (() => { const d = document.createElement('div'); d.style.cssText = 'color: var(--uma-gold-row-bar, transparent)'; panes.appendChild(d); const c = cs(d).color; d.remove(); return c; })();
		const setBg = probe('background-color: var(--usd-ui-set)').bg;
		const rows = [...panes.querySelectorAll('.usd-ev-skilllist > li')];
		const nameOf = (li) => li.querySelector('.usd-ev-skill-name');
		const toneOf = (el) => (el.className.match(/usd-ev-tone--(heal|debuff|passive)/) || [])[1] || null;
		return {
			setBg, goldBg, bar: barProbe, faint, heading, toneWant, tableGoldBg: goldRowCell ? cs(goldRowCell).backgroundColor : null,
			on: [...panes.querySelectorAll('.usd-roster-choice--on')].map((b) => ({ bg: cs(b).backgroundColor, shadow: cs(b).boxShadow, bw: cs(b).borderTopWidth })),
			gold: rows.filter((li) => li.classList.contains('usd-ev-skill--gold')).map((li) => ({ id: li.getAttribute('data-skill-id'), bg: cs(li).backgroundColor, shadow: cs(li).boxShadow, dim: li.classList.contains('usd-ev-skill--dim'), maybe: li.classList.contains('usd-ev-skill--maybe'), nameColor: cs(nameOf(li)).color, tone: toneOf(nameOf(li)), weight: cs(nameOf(li)).fontWeight })),
			goldWhite: rows.filter((li) => li.classList.contains('usd-ev-skill--goldwhite')).map((li) => {
				const of = li.getAttribute('data-usd-gold-white-of');
				let p = li.previousElementSibling;
				while (p && p.classList.contains('usd-ev-skill--goldwhite')) p = p.previousElementSibling;
				return { id: li.getAttribute('data-skill-id'), of, prevId: p ? p.getAttribute('data-skill-id') : null, mark: (li.querySelector('[data-usd-el="ev-gold-white-mark"]') || {}).textContent || null,
					padL: cs(li).paddingLeft, maybe: li.classList.contains('usd-ev-skill--maybe'), prevMaybe: p ? p.classList.contains('usd-ev-skill--maybe') : null, bg: cs(li).backgroundColor };
			}),
			plainPadL: (() => { const li = rows.find((x) => !x.className.match(/--gold\b|--goldwhite|--evo/)); return li ? cs(li).paddingLeft : null; })(),
			dim: rows.filter((li) => li.classList.contains('usd-ev-skill--dim')).map((li) => ({ id: li.getAttribute('data-skill-id'), color: cs(nameOf(li)).color, deco: cs(nameOf(li)).textDecorationLine, decoColor: cs(nameOf(li)).textDecorationColor, bg: cs(li).backgroundColor, shadow: cs(li).boxShadow, gold: li.classList.contains('usd-ev-skill--gold') })),
			dimLeft: [...panes.querySelectorAll('.usd-roster-choiceskill--dim')].map((s) => ({ color: cs(s).color, deco: cs(s).textDecorationLine, decoColor: cs(s).textDecorationColor, tone: toneOf(s), inOn: !!s.closest('.usd-roster-choice--on') })),
			subtle: probe('color: var(--uma-text-subtle)').color, dark: document.documentElement.getAttribute('data-theme') === 'dark',
			toned: [...panes.querySelectorAll('.usd-ev-tone--heal, .usd-ev-tone--debuff, .usd-ev-tone--passive')].map((el) => ({ tone: toneOf(el), color: cs(el).color, weight: cs(el).fontWeight, inGold: !!el.closest('.usd-ev-skill--gold') || (document.documentElement.getAttribute('data-theme') === 'dark' && !!el.closest('.usd-roster-choice--on')), left: !!el.closest('.usd-ev-pane--events') })),
			untonedWeights: { name: (() => { const n = rows.map(nameOf).find((x) => x && !toneOf(x)); return n ? cs(n).fontWeight : null; })(), left: (() => { const s = [...panes.querySelectorAll('.usd-roster-choiceskill:not([class*="usd-ev-tone"])')][0]; return s ? cs(s).fontWeight : null; })() },
			sw: document.documentElement.scrollWidth, vw: window.innerWidth,
		};
	});
	// 共通の判定。kind はラベル、need は「その小窓で必ずあるはずのもの」
	const judge = (tag, r, need) => {
		if (need.on) assert(r.on.length > 0 && r.on.every((b) => b.bg === r.setBg && /inset/.test(b.shadow)), tag + '(1) 選んだ選択肢のボタンは太い枠（内側の輪）＋地は --usd-ui-set（' + r.setBg + '）', r.on);
		if (need.gold) assert(r.gold.length > 0, tag + '金スキルの行がある', r.gold.length);
		assert(r.gold.every((g) => !g.dim && g.bg === r.goldBg && g.shadow.includes(r.bar) && /4px 0px 0px 0px inset/.test(g.shadow)), tag + '(2) 金スキルの地は①と同じ（' + r.goldBg + '）＋左の縦バー 4px（' + r.bar + '）', r.gold.slice(0, 3));
		if (r.tableGoldBg) assert(r.goldBg === r.tableGoldBg, tag + '(2) 金の地は①の表の金の行の地と同じ', [r.goldBg, r.tableGoldBg]);
		// 「未選択」の金は、これまでどおり薄い文字（ダークは金の地の上で読める灰色）
		assert(r.gold.filter((g) => !g.maybe).every((g) => g.tone ? g.nameColor !== r.faint : g.nameColor === r.heading), tag + '(2) 金スキルの名前の文字色は変えない（見出しの色。回復などの色の名前はその色）', r.gold.slice(0, 3));
		if (need.goldWhite) assert(r.goldWhite.length > 0, tag + '金と白の組がある', r.goldWhite.length);
		assert(r.goldWhite.every((x) => x.prevId === x.of && x.mark === '└' && x.padL === r.plainPadL && x.maybe === x.prevMaybe), tag + '(3) 下位の白は金の直下に「└」（字下げなし・確定どうし／未選択どうし）', { gw: r.goldWhite, plainPadL: r.plainPadL });
		if (need.dim) assert(r.dim.length > 0 && r.dimLeft.length > 0, tag + '条件外のスキルが右の一覧と左の選択肢にある', [r.dim.length, r.dimLeft.length]);
		assert(r.dim.every((d) => d.color === r.faint && d.deco === 'line-through' && d.decoColor === r.faint && !d.gold && !/inset 4px/.test(d.shadow)), tag + '(5) 右の一覧の条件外: 灰色の文字＋灰色の取り消し線・金の地と縦バーなし', r.dim.slice(0, 3));
		// ダークの選んだ選択肢（地が --usd-ui-set）の中だけは、4.5:1 に届かせるため一段明るい灰色（--uma-text-subtle）
		const dimWant = (d) => (r.dark && d.inOn) ? r.subtle : r.faint;
		assert(r.dimLeft.every((d) => d.color === dimWant(d) && d.deco === 'line-through' && d.decoColor === dimWant(d) && !d.tone), tag + '(5) 左の選択肢の条件外: 灰色の文字＋灰色の取り消し線', r.dimLeft.slice(0, 3));
		if (need.tone) assert(r.toned.length > 0, tag + '回復・デバフ・緑の名前がある', r.toned.length);
		assert(r.toned.every((t) => t.inGold || t.color === r.toneWant[t.tone]), tag + '(4) 回復・デバフ・緑の文字の色は①と同じ（ダークの金の地・選んだ選択肢の地の上は明るい側）', r.toned.filter((t) => !t.inGold && t.color !== r.toneWant[t.tone]).slice(0, 3));
		assert(r.toned.every((t) => t.weight === (t.left ? r.untonedWeights.left : r.untonedWeights.name) || r.untonedWeights.left === null), tag + '(4) 色だけで、太さは変えない', { toned: r.toned.slice(0, 3), base: r.untonedWeights });
		assert(r.sw <= r.vw, tag + '横スクロールなし', [r.sw, r.vw]);
	};
	const contrast = async (page, tag) => {
		for (const pane of [0, 1]) {
			const hasTabs = await page.evaluate(() => { const t = document.querySelector('[data-usd-el="events-tabs"]'); return !!t && getComputedStyle(t).display !== 'none'; });
			if (hasTabs) { await page.click('[data-usd-el="events-tab"][data-pane="' + pane + '"]'); await page.waitForTimeout(200); }
			const c = await page.evaluate(scanTextContrastInPage, '[data-usd-el="events-panes"]');
			assert(c.checked > 0 && c.bad.length === 0, tag + '文字のコントラスト 4.5:1 以上（' + (hasTabs ? (pane ? 'スキル' : 'イベント') + 'のタブ・' : '') + c.checked + '要素）', formatContrast(c.bad).slice(0, 5));
			if (!hasTabs) break;
		}
	};

	await block('夜間4(1) サポカの列の小窓（card-0402・短距離）: 選んだ選択肢の地・金の地と縦バー・金の直下の「└」白・回復/デバフ/緑の色・条件外の灰色と取り消し線・コントラスト・エラー0（1280・390・360 × ライト・ダーク）', async () => {
		for (const [w, theme] of VIEWS) {
			const tag = '夜間4(1) ' + w + '・' + theme + ': ';
			const sp = await openSp(w, theme, 0);
			await sp.page.waitForSelector('#deck-roster-panel .usd-roster-grid', { timeout: 15000 });
			await clickEvents(sp.page, '#deck-roster-panel ', '2');
			await sp.page.waitForSelector('[data-usd-el="events-panes"]');
			await sp.page.waitForTimeout(350);
			const r = await measurePop(sp.page);
			judge(tag, r, { on: true, gold: true, goldWhite: true, dim: true, tone: true });
			assert(r.goldWhite.some((x) => x.of === 'ex-0640'), tag + '英俊豪傑（ex-0640）の直下に下位の白（比類なき）', r.goldWhite);
			await contrast(sp.page, tag);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラーなし', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('夜間4(2) シナリオの列の小窓（駿大祭の6択）: 金の地と縦バー・条件外の灰色と取り消し線（左の6択の中）・コントラスト・エラー0（1280・390・360 × ライト・ダーク）', async () => {
		for (const [w, theme] of VIEWS) {
			const tag = '夜間4(2) ' + w + '・' + theme + ': ';
			const sp = await openSp(w, theme, 0);
			await sp.page.waitForSelector('#deck-roster-panel .usd-roster-grid', { timeout: 15000 });
			await clickEvents(sp.page, '#deck-roster-panel ', 'scenario');
			await sp.page.waitForSelector('[data-usd-el="events-panes"]');
			await sp.page.waitForTimeout(350);
			const r = await measurePop(sp.page);
			const six = await sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="event-choice"]')].length);
			assert(six === 6, tag + '6択の選択肢がある', six);
			judge(tag, r, { gold: true });
			await contrast(sp.page, tag);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラーなし', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('夜間4(3) オススメサポのカード名の小窓（同じ部品）: 金の地と縦バー・金の直下の「└」白・回復/デバフ/緑の色・条件外の見た目・コントラスト・エラー0（1280・390・360 × ライト・ダーク）', async () => {
		for (const [w, theme] of VIEWS) {
			const tag = '夜間4(3) ' + w + '・' + theme + ': ';
			const sp = await openSp(w, theme, 1);
			await sp.page.click('#deck-template-panel [data-usd-el="outside-open"]');
			await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 20000 });
			const ids = await sp.page.evaluate(() => [...document.querySelectorAll('[data-usd-el="outside-modal"] [data-usd-el="outside-card-main"]')].map((b) => b.getAttribute('data-card-id')));
			let r = null;
			for (const id of ids) {
				await sp.page.click('[data-usd-el="outside-modal"] [data-usd-el="outside-card-main"][data-card-id="' + id + '"]');
				await sp.page.waitForSelector('[data-usd-el="events-panes"]');
				await sp.page.waitForTimeout(250);
				const x = await measurePop(sp.page);
				judge(tag + id + ' ', x, {});
				if (!r && x.gold.length > 0 && x.toned.length > 0) { r = x; await contrast(sp.page, tag + id + ' '); }
				await sp.page.keyboard.press('Escape');
				await sp.page.waitForTimeout(200);
			}
			assert(ids.length > 0 && r, tag + '金スキルと色の付いた名前のあるカードがある（' + ids.length + '枚を見た）', ids.length);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラーなし', sp.errors.slice(0, 3));
			await sp.ctx.close();
		}
	});
}
