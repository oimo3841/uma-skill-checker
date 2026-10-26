import { withEventScenarioFirst } from './lib/scenario-doc.mjs';
// 段G（2026-10-22・C-191）の検査。run-smoke.mjs の末尾から register50() で呼ばれる（塊の見出しはすべて「段G」で始まる。`npm run test:visual -- --only=段G` で回せる）。
//
// (4) 削除: 「削除」を選んでいる間、②の各スキルのパネルの右に×（押せる範囲44px・aria-label「<スキル名>を削除」）。パネルの点線の枠・赤い取り消し線は無い。パネルを押しても削除できる。削除のボタンは(6)の「選択中」の見た目。
// (5) 金・進化・固有: 進化と固有は、金と同じ作りの左の縦バー（名前のセルの左端 4px）。枠線・光は無い。バーの色・地のグラデーション・文字色は 0530272 で測った値
//     （tests/visual/lib/g-baseline-0530272.json。実装の側から読んで作らない固定値）と同一。金は今のまま。
// (6) 操作できる部品の強調（UmaStar だけ）: 通常＝細い枠（1px）／設定済み＝細い枠＋うすい地色／選択中＝太い枠（2px。排他の選択だけ）／主な操作＝塗りつぶし（1画面に1つ）。
//     色は今のトークンだけ。ライト・ダークとも、枠と地の差は 3:1 以上。Exam・Deck は変えない。
// スキル名・id・件数は検査の側に書かない（恒久ルール1。画面とデータから読む）。

export async function register50(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const BASE = readJson('tests/visual/lib/g-baseline-0530272.json').themes;
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const RACES = readJson('data/upcoming-races.json').races;
	const raceOf = (id) => { const r = RACES.find((x) => x.id === id); const { id: rid, ...rest } = r; return Object.assign({ id: rid }, rest); };
	const SCENARIO_DOC = withEventScenarioFirst(readJson('data/scenario-event-skills.json'));
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	// 金・進化・固有の行が1つずつ以上出る編成（オルフェーヴル総攬の衣装・追込・芝2200m）と、固有が出る編成（脚質・距離・バ場を指定）
	const ORFE = { rosterId: 'r_evo', name: '', umaId: 'uma-0241', star: 3, awakeningLevel: 5, cardIds: CARDS6, skillFilter: { style: 'oikomi' }, race: raceOf('race-0001') };
	const FULL = { umaId: 'uma-0001', cardIds: CARDS6, skillFilter: { distance: 'long', style: 'nige', surface: 'turf' } };
	const SK = MASTER.slice(0, 8).map((s) => String(s.id));
	const T = '#deck-template-panel ';
	const sleep = (page, ms) => page.waitForTimeout(ms);
	const rgb = (c) => (/rgba?\((\d+), (\d+), (\d+)/.exec(c || '') || []).slice(1, 4).map(Number);
	const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
	const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const CONDS = [[1280, 900, 'light'], [1280, 900, 'dark'], [390, 844, 'light'], [390, 844, 'dark'], [360, 844, 'light'], [360, 844, 'dark']];

	/** o.tab＝開くタブ／o.draft＝②に入れておく下書き／o.roster＝①の編成 */
	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, EMPTY);
		await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(SCENARIO_DOC)));
		await sp.page.evaluate(({ roster, tab, draft, theme }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			if (draft) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify(draft)); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
			try { localStorage.setItem('uma-tools-theme', theme || 'light'); } catch (e) {}
		}, { roster: o.roster || ORFE, tab: o.tab === undefined ? 0 : o.tab, draft: o.draft || null, theme: o.theme });
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sleep(sp.page, 600);
		await sp.page.evaluate(() => UmaSkillDeckCore.loadTrainingSources(false)).catch(() => {});
		await sp.page.evaluate(() => UmaSkillDeckCore.loadSkillPtData(false)).catch(() => {});
		await sleep(sp.page, 900);
		return sp;
	};
	/** 色のトークンを、いまのテーマで解いた色（rgb）にして返す */
	const tokens = (page) => page.evaluate(() => {
		const probe = (name) => { const e = document.createElement('i'); e.style.cssText = 'background-color: var(' + name + ')'; document.body.appendChild(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; };
		return { line: probe('--usd-ui-line'), sel: probe('--usd-ui-sel'), set: probe('--usd-ui-set'), surface: probe('--uma-surface'), control: probe('--uma-control'), heading: probe('--uma-text-heading'), muted: probe('--uma-text-muted') };
	});
	/** 部品の計算された見た目（枠の太さ・色・地・影）。2px＝1px の枠＋内側の 1px の輪 のものは ring に出す */
	const look = (page, sel) => page.evaluate((sel) => {
		const e = document.querySelector(sel);
		if (!e) return null;
		const cs = getComputedStyle(e);
		const ring = /inset/.test(cs.boxShadow) ? (/(rgba?\([^)]*\))\s+0px\s+0px\s+0px\s+1px\s+inset/.exec(cs.boxShadow) || [])[1] || 'other' : null;
		return { bw: cs.borderTopWidth, bs: cs.borderTopStyle, bc: cs.borderTopColor, bg: cs.backgroundColor, ring, shadow: cs.boxShadow, color: cs.color, h: Math.round(e.getBoundingClientRect().height * 10) / 10, w: Math.round(e.getBoundingClientRect().width * 10) / 10 };
	}, sel);
	/** 通常・設定済み・選択中・主な操作 のどれかに分ける（tk＝tokens の結果）。分からなければ 'other' */
	const stageOf = (l, tk) => {
		if (!l) return null;
		const sameC = (a, b) => JSON.stringify(rgb(a)) === JSON.stringify(rgb(b));
		const thick = (l.bw === '2px') || (l.ring && sameC(l.ring, tk.sel) && sameC(l.bc, tk.sel));
		if (sameC(l.bg, tk.control) && !thick) return 'primary';
		if (thick && sameC(l.bc, tk.sel)) return 'selected';
		if (l.bw === '1px' && sameC(l.bg, tk.set) && !l.ring) return 'set';
		if (l.bw === '1px' && !l.ring) return 'normal';
		return 'other';
	};

	/* ====================================================================
	 * (4) 削除
	 * ==================================================================== */
	await block('段G(4) 削除: 「削除」を選んでいる間、②の各スキルのパネルの右に×（押せる範囲44px・aria-label「<スキル名>を削除」）。点線の枠・赤い取り消し線は無い。×でもパネルでも外れて、「元に戻す」で戻る', async () => {
		for (const [w, h, theme] of [[390, 844, 'light'], [390, 844, 'dark'], [1280, 900, 'light']]) {
			const tag = '段G(4) ' + w + 'px・' + theme + ': ';
			const sp = await openSp({ w, h, tab: 1, theme, roster: FULL, draft: { skillIds: SK, name: '', updatedAt: '2026-10-22T00:00:00.000Z' } });
			const p = sp.page;
			const tk = await tokens(p);
			const draft = () => p.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
			const panels = () => p.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]')).map((e) => e.getAttribute('data-skill-id')));
			const n0 = (await panels()).length;
			const off = await p.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel-xbtn')).map((b) => { const r = b.getBoundingClientRect(); return r.width * r.height; }));
			assert(n0 === SK.length && off.length === n0 && off.every((a) => a === 0), tag + '削除を選んでいないときは、×は見えない（各パネルに1つずつ作ってあるが表示しない）', { n0, off });
			await p.click(T + '[data-usd-el="palette-delete"]'); await sleep(p, 250);
			const on = await p.evaluate(() => {
				const out = [];
				document.querySelectorAll('#deck-template-panel .usd-panel[data-skill-id]').forEach((pn) => {
					const x = pn.querySelector('.usd-panel-xbtn'), nm = pn.querySelector('.usd-panel-namebtn'), r = x.getBoundingClientRect(), pr = pn.getBoundingClientRect();
					const pcs = getComputedStyle(pn);
					out.push({ id: pn.getAttribute('data-skill-id'), name: nm.textContent, aria: x.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), inside: r.right <= pr.right + 1 && r.left >= pr.left,
						panelBorder: pcs.borderTopStyle, line: getComputedStyle(nm).textDecorationLine, act: x.getAttribute('data-usd-act'), glyph: !!x.querySelector('svg') });
				});
				return out;
			});
			assert(on.length === n0 && on.every((o) => o.w >= 44 && o.h >= 44 && o.aria === o.name + 'を削除' && o.glyph && o.act === 'template-skill-remove'), tag + '各パネルの右に×（押せる範囲44px以上・aria-label「<スキル名>を削除」・×の絵）', on.slice(0, 2));
			assert(on.every((o) => o.panelBorder !== 'dashed' && !/line-through/.test(o.line)), tag + 'パネルの点線の枠と赤い取り消し線は無い（削除の状態でも実線の枠・取り消しの線なし）', on.map((o) => [o.panelBorder, o.line]).slice(0, 3));
			const del = await look(p, T + '[data-usd-el="palette-delete"]');
			const pressed = await p.evaluate(() => document.querySelector('#deck-template-panel [data-usd-el="palette-delete"]').getAttribute('aria-pressed'));
			assert(pressed === 'true' && stageOf(del, tk) === 'selected' && JSON.stringify(rgb(del.color)) === JSON.stringify(rgb(tk.heading)), tag + '削除のボタンは(6)の「選択中」の見た目（2px の枠・色は選択中の枠の色・文字は赤くしない）', { del, tk });
			// ×で外す（押したスキルだけ）
			const first = on[0].id, second = on[1].id;
			await p.click(T + '.usd-panel[data-skill-id="' + first + '"] .usd-panel-xbtn'); await sleep(p, 200);
			const after1 = await draft();
			assert(!after1.includes(first) && after1.length === n0 - 1 && (await panels()).length === n0 - 1, tag + '×を押すと、そのスキルだけが②から外れる', { after1 });
			// パネル（名前）を押しても外れる（今の動きは残す）
			await p.click(T + '.usd-panel[data-skill-id="' + second + '"] .usd-panel-namebtn'); await sleep(p, 200);
			const after2 = await draft();
			const infoOpen = await p.evaluate(() => { const pop = document.querySelector('.usd-info-pop'); return !!pop && !pop.hidden; });
			assert(!after2.includes(second) && after2.length === n0 - 2 && !infoOpen, tag + 'パネルを押しても外れる（今の動きは残す。説明の小窓は開かない）', { after2, infoOpen });
			// 元に戻す
			await p.click('#deck-undo-btn'); await sleep(p, 200);
			await p.click('#deck-undo-btn'); await sleep(p, 200);
			const back = await draft();
			assert(back.length === n0 && SK.every((id) => back.includes(id)), tag + '「元に戻す」で2つとも戻る', back);
			assert((await p.evaluate(() => document.querySelector('#deck-template-panel [data-usd-el="palette-delete"]').getAttribute('aria-pressed'))) === 'true', tag + '外したあとも削除の状態は続く', true);
			// もう一度押すと終わり、×は見えなくなる
			await p.click(T + '[data-usd-el="palette-delete"]'); await sleep(p, 250);
			const end = await p.evaluate(() => Array.from(document.querySelectorAll('#deck-template-panel .usd-panel-xbtn')).map((b) => { const r = b.getBoundingClientRect(); return r.width * r.height; }));
			assert(end.every((a) => a === 0), tag + '削除の状態が終わると、×は見えなくなる', end);
			assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * (5) 金・進化・固有
	 * ==================================================================== */
	await block('段G(5) 金・進化・固有: 進化と固有は金と同じ作りの左の縦バー（4px）。枠線・光は無く、バーの色・地のグラデーション・文字色は 0530272 と同一。金は今のまま（ライト・ダーク）', async () => {
		for (const [w, h, theme] of CONDS) {
			const tag = '段G(5) ' + w + 'px・' + theme + ': ';
			const sp = await openSp({ w, h, tab: 0, theme });
			const p = sp.page;
			const m = await p.evaluate(() => {
				const o = {};
				for (const k of ['gold', 'evo', 'unique']) {
					const row = document.querySelector('#deck-roster-panel .usd-roster-grow--' + k);
					if (!row) { o[k] = null; continue; }
					const rcs = getComputedStyle(row), name = row.querySelector('.usd-roster-gc--name'), ncs = getComputedStyle(name);
					const sn = row.querySelector('.usd-roster-skillname'), pt = row.querySelector('.usd-roster-pt:not(.usd-roster-pt--ref)');
					const cells = Array.from(row.children).map((c) => c.getBoundingClientRect());
					o[k] = { outlineStyle: rcs.outlineStyle, outlineWidth: rcs.outlineWidth, rowShadow: rcs.boxShadow, bgImage: rcs.backgroundImage, nameShadow: ncs.boxShadow, nameBg: ncs.backgroundColor,
						skillnameColor: sn ? getComputedStyle(sn).color : null, ptColor: pt ? getComputedStyle(pt).color : null, barH: name.getBoundingClientRect().height, rowH: Math.max(...cells.map((c) => c.bottom)) - Math.min(...cells.map((c) => c.top)) };
				}
				return o;
			});
			const B = BASE[theme];
			assert(!!m.gold && !!m.evo && !!m.unique, tag + '金・進化・固有の行がそれぞれ1つ以上ある', { gold: !!m.gold, evo: !!m.evo, unique: !!m.unique });
			const barOf = (s) => { const x = /(rgba?\([^)]*\))\s+(\d+)px\s+0px\s+0px\s+0px\s+inset/.exec(s || ''); return x ? { color: x[1], px: Number(x[2]) } : null; };
			const outlineOf = (s) => { const x = /^(\d+)px solid (rgb\([^)]*\))$/.exec(s || ''); return x ? x[2] : null; };
			const baseBar = (kind) => barOf(B[kind].nameBoxShadow);
			// 金: 今のまま（0530272 と同一。ライトは透明のバー＝見えない・ダークは 4px の金のバー）
			// C-197（79b40ff）でライトの金スキルの左バーを #ffc83d（rgb(255, 200, 61)）に変えた。ダークと同じ色。意図した変更なので、ライトのバーの期待値だけをこの色に合わせる（地・文字色・ダークは 0530272 のまま）
			const goldBarWant = theme === 'light' ? 'rgb(255, 200, 61) 4px 0px 0px 0px inset' : B.gold.nameBoxShadow;
			assert(m.gold.nameShadow === goldBarWant && m.gold.nameBg === B.gold.nameBg && m.gold.rowShadow === 'none' && m.gold.skillnameColor === B.gold.skillnameColor, tag + '金スキルの行は今のまま（名前のセルの左のバー・地・文字色が 0530272 と同一）', { now: m.gold, base: B.gold });
			for (const kind of ['unique', 'evo']) {
				const bar = barOf(m[kind].nameShadow), want = outlineOf(B[kind].rowOutline);
				assert(m[kind].outlineStyle === 'none' && m[kind].rowShadow === 'none', tag + kind + ': 枠線（outline）と光（box-shadow）は無い', { outline: m[kind].outlineStyle, shadow: m[kind].rowShadow });
				assert(!!bar && bar.px === 4 && JSON.stringify(rgb(bar.color)) === JSON.stringify(rgb(want)), tag + kind + ': 名前のセルの左端に 4px の縦バー。色は 0530272 での枠線の色（' + want + '）そのまま', { bar, want });
				assert(m[kind].bgImage === B[kind].rowBgImage && m[kind].nameBg === 'rgba(0, 0, 0, 0)', tag + kind + ': 地のグラデーションは 0530272 と同一（識別性を落とさない）', { now: m[kind].bgImage, base: B[kind].rowBgImage });
				assert(m[kind].skillnameColor === B[kind].skillnameColor && m[kind].ptColor === B[kind].ptColor, tag + kind + ': 文字色は 0530272 と同一（コントラストは同じ）', { now: [m[kind].skillnameColor, m[kind].ptColor], base: [B[kind].skillnameColor, B[kind].ptColor] });
			}
			// 金と同じ作り: 3種のバーは同じ幅・同じ高さ（名前のセルいっぱい＝同じ上下の余白）
			const goldBar = barOf(m.gold.nameShadow);
			assert(goldBar.px === 4 && m.unique.barH === m.unique.rowH && m.evo.barH === m.evo.rowH && m.gold.barH > 0, tag + '進化・固有のバーは金と同じ幅（4px）で、行の高さいっぱい（上下の余白なし）', { goldBar, unique: [m.unique.barH, m.unique.rowH], evo: [m.evo.barH, m.evo.rowH] });
			assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('段G(5) 衣装の小窓の進化先の行・進化の選択画面: 太い枠線は無く、進化は左の縦バー（4px。色は変更前の枠の色）。選択画面の行は選んでいる行だけ内側 2px の枠（案Gで、行の左は 4px の縦バーに）', async () => {
		for (const [w, h, theme] of [[390, 844, 'light'], [390, 844, 'dark']]) {
			const tag = '段G(5) ' + w + 'px・' + theme + ': ';
			const sp = await openSp({ w, h, tab: 0, theme });
			const p = sp.page;
			const ev = await p.evaluate(() => {
				// 衣装の小窓の進化先の行（.usd-ev-skill--evo）と同じクラスの行を作って測る（本物の小窓の行の見た目は同じクラスで決まる）
				const ul = document.createElement('ul'); ul.className = 'usd-ev-skilllist'; ul.style.cssText = 'position:fixed;left:0;top:0;width:300px;';
				const li = document.createElement('li'); li.className = 'usd-ev-skill usd-ev-skill--evo'; li.innerHTML = '<p class="usd-ev-skill-name">x</p>';
				const li0 = document.createElement('li'); li0.className = 'usd-ev-skill'; li0.innerHTML = '<p class="usd-ev-skill-name">x</p>';
				ul.appendChild(li0); ul.appendChild(li); document.body.appendChild(ul);
				const cs = getComputedStyle(li), cs0 = getComputedStyle(li0);
				const o = { bw: cs.borderTopWidth, bwL: cs.borderLeftWidth, shadow: cs.boxShadow, bg: cs.backgroundImage, h: li.getBoundingClientRect().height, h0: li0.getBoundingClientRect().height };
				ul.remove();
				return o;
			});
			const edge = theme === 'light' ? 'rgb(240, 106, 174)' : 'rgb(184, 97, 143)';
			assert(ev.bw === '0px' && ev.bwL === '0px' && ev.shadow.indexOf(edge) !== -1 && /4px 0px 0px 0px inset/.test(ev.shadow) && /gradient/.test(ev.bg), tag + '衣装の小窓の進化先の行: 枠は無く、左に 4px の縦バー（色は変更前の枠の色 ' + edge + '）・地は進化先のグラデーションのまま', ev);
			await p.click('[data-usd-el="evo-btn"]'); await sleep(p, 600);
			const sheet = await p.evaluate(() => {
				const rows = Array.from(document.querySelectorAll('.usd-info-pop [data-usd-el="evo-target"], .usd-info-pop [data-usd-el="evo-none"]'));
				return rows.map((r) => { const cs = getComputedStyle(r), rc = r.getBoundingClientRect(); return { on: /--on/.test(r.className), none: r.getAttribute('data-usd-el') === 'evo-none', shadow: cs.boxShadow, bwL: cs.borderLeftWidth, h: Math.round(rc.height * 10) / 10 }; });
			});
			const selColor = (await tokens(p)).sel;
			const ons = sheet.filter((r) => r.on), offs = sheet.filter((r) => !r.on);
			const ringOf = (s) => { const x = /(rgba?\([^)]*\))\s+0px\s+0px\s+0px\s+2px\s+inset/.exec(s || ''); return x ? x[1] : null; };
			assert(sheet.length >= 2 && ons.length >= 1 && offs.length >= 1 && ons.every((r) => !!ringOf(r.shadow) && JSON.stringify(rgb(ringOf(r.shadow))) === JSON.stringify(rgb(selColor))) && offs.every((r) => r.shadow === 'none') && sheet.every((r) => r.none || r.bwL === '4px'), tag + '進化の選択画面: 選んでいる行（進化先・進化しない）だけ内側 2px の枠（色は選択中の枠 ' + selColor + '）・選んでいない行は枠なし・進化先の行の左は 4px の縦バー', sheet);
			assert(sheet.filter((r) => !r.none).every((r) => r.h >= 44) && sheet.filter((r) => r.none).every((r) => r.h >= 28 && r.h <= 32), tag + '行の高さ: 進化先は説明文を含めて 44px 以上・「進化しない」は1行の約 30px', sheet.map((r) => r.h));
			const btn = await look(p, '[data-usd-el="evo-btn"]');
			assert(btn.bw === '1px' && btn.bg !== 'rgba(0, 0, 0, 0)', tag + '「進化 N／最大」のボタンは 1px の枠＋地色（設定済み）', btn);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * (6) 操作できる部品の強調
	 * ==================================================================== */
	await block('段G(6) 色: 細い枠・選択中の枠・設定済みの地色は、ライト・ダークとも地との差が 3:1 以上（新しい色相は作らない）', async () => {
		for (const theme of ['light', 'dark']) {
			const sp = await openSp({ w: 390, h: 844, tab: 0, theme });
			const tk = await tokens(sp.page);
			const tag = '段G(6) ' + theme + ': ';
			assert(ratio(tk.line, tk.surface) >= 3 && ratio(tk.line, tk.set) >= 3, tag + '細い枠 ' + tk.line + ' は、通常の地（' + ratio(tk.line, tk.surface).toFixed(2) + ':1）・設定済みの地色（' + ratio(tk.line, tk.set).toFixed(2) + ':1）とも 3:1 以上', tk);
			assert(ratio(tk.sel, tk.surface) >= 3 && ratio(tk.sel, tk.set) >= 3, tag + '選択中の枠 ' + tk.sel + ' は地（' + ratio(tk.sel, tk.surface).toFixed(2) + ':1）・設定済みの地色（' + ratio(tk.sel, tk.set).toFixed(2) + ':1）と 3:1 以上', tk);
			const hue = (c) => { const [r, g, b] = rgb(c).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d === 0) return 0; const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return Math.round(((hh * 60) + 360) % 360); };
			const aux = await sp.page.evaluate(() => { const e = document.createElement('i'); e.style.cssText = 'background-color: var(--uma-aux-border)'; document.body.appendChild(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; });
			assert(Math.abs(hue(tk.line) - hue(aux)) <= 6, tag + '細い枠の色相は今の補助の枠（--uma-aux-border）と同じ（色相 ' + hue(tk.line) + '° と ' + hue(aux) + '°）', { line: tk.line, aux });
			await sp.ctx.close();
		}
	});

	await block('段G(6) ①の画面: タイルは通常は細い枠（1px）・選んでいる（選択の窓を開いている）ものだけ 2px。勉強家／切れ者は押すと 2px。値が入った選択・レースは 地色つき（設定済み）', async () => {
		for (const [w, h, theme] of CONDS) {
			const tag = '段G(6) ①' + w + 'px・' + theme + ': ';
			const sp = await openSp({ w, h, tab: 0, theme });
			const p = sp.page;
			const tk = await tokens(p);
			const tiles = () => p.evaluate(() => Array.from(document.querySelectorAll('#deck-roster-panel [data-usd-el="roster-tile"]')).map((t) => { const cs = getComputedStyle(t); return { i: t.getAttribute('data-index'), bw: cs.borderTopWidth, bc: cs.borderTopColor, bs: cs.borderTopStyle, pinned: t.classList.contains('usd-out-card--pinned'), h: Math.round(t.getBoundingClientRect().height * 10) / 10 }; }));
			const t0 = await tiles();
			assert(t0.length === 6 && t0.every((t) => t.bw === '1px' && t.bs === 'solid' && !t.pinned && JSON.stringify(rgb(t.bc)) === JSON.stringify(rgb(tk.line))), tag + 'カードの6枚のタイルは、通常は細い枠（1px・細い枠の色）', t0);
			const uma0 = await look(p, '#deck-roster-panel .usd-roster-umabox');
			assert(uma0.bw === '1px' && stageOf(uma0, tk) === 'normal' && JSON.stringify(rgb(uma0.bg)) === JSON.stringify(rgb(tk.surface)), tag + '育成ウマ娘のタイルも細い枠（1px）・濃い塗りではない（地は通常の地）', uma0);
			// 選んでいる枠だけ太くなる（カードの選択の窓を開く）
			await p.click('#deck-roster-panel [data-usd-el="pick-card"][data-index="1"]'); await sleep(p, 400);
			const t1 = await tiles();
			assert(t1.filter((t) => t.pinned).map((t) => t.i).join() === '1' && t1.find((t) => t.i === '1').bw === '2px' && JSON.stringify(rgb(t1.find((t) => t.i === '1').bc)) === JSON.stringify(rgb(tk.sel)) && t1.filter((t) => t.i !== '1').every((t) => t.bw === '1px'), tag + 'カードの選択の窓を開くと、その枠のタイルだけ 2px（選択中の枠の色）・ほかは 1px', t1);
			await p.keyboard.press('Escape'); await sleep(p, 200);
			if (await p.$('[data-usd-act="cancel-pick"]')) { await p.click('button[data-usd-act="cancel-pick"]').catch(() => {}); await sleep(p, 300); }
			await p.click('#deck-roster-panel [data-usd-act="pick-uma"]'); await sleep(p, 400);
			const uma1 = await look(p, '#deck-roster-panel .usd-roster-umabox');
			assert(stageOf(uma1, tk) === 'selected', tag + '育成ウマ娘の選択の窓を開くと、育成ウマ娘のタイルが 2px（選択中）', uma1);
			await sp.ctx.close();

			const sp2 = await openSp({ w, h, tab: 0, theme });
			const q = sp2.page;
			const st0 = await look(q, '#deck-roster-panel [data-usd-act="pt-status"]');
			assert(stageOf(st0, tk) === 'normal', tag + '勉強家（押していない）は通常（1px・通常の地）', st0);
			await q.click('#deck-roster-panel [data-usd-act="pt-status"]'); await sleep(q, 300);
			const st1 = await look(q, '#deck-roster-panel [data-usd-act="pt-status"]');
			assert(stageOf(st1, tk) === 'selected' && JSON.stringify(rgb(st1.bg)) === JSON.stringify(rgb(tk.surface)) && st1.h === st0.h && st1.w === st0.w, tag + '勉強家を押すと選択中（2px の枠・塗りつぶしではない）。大きさは変わらない', { st0, st1 });
			const flt = await look(q, '#deck-roster-panel .usd-roster-filtersel--on');
			assert(stageOf(flt, tk) === 'set', tag + '値が入った距離・脚質・バ場の選択は設定済み（1px の枠＋うすい地色）', flt);
			const race = await look(q, '[data-usd-el="set-race-btn"]');
			assert(stageOf(race, tk) === 'set', tag + 'レースを選んでいるときのレースのピルは設定済み', race);
			// 塗りつぶし（主な操作）は ①の画面には無い
			const filled = await q.evaluate((control) => Array.from(document.querySelectorAll('#deck-roster-panel button, #deck-roster-panel select, #deck-set-bar button')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).backgroundColor === control && !/usd-roster-evbtn--alert|usd-roster-legend-no/.test(e.className); }).map((e) => e.className), tk.control);
			assert(filled.length === 0, tag + '①の画面に、押している状態を示す塗りつぶし（主な操作の塗り）の部品は無い', filled);
			assert(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tag + '横スクロールなし', true);
			assert(jsErrors(sp2.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp2.errors).slice(0, 3));
			await sp2.ctx.close();
		}
	});

	await block('段G(6) ②の画面: パレットの選択中は 2px・「削除」も同じ。オススメサポ／脚質オススメの小窓: 排他は 2px・設定済みは地色つき・主な操作（塗り）は「追加」だけ', async () => {
		for (const [w, h, theme] of CONDS) {
			const tag = '段G(6) ②' + w + 'px・' + theme + ': ';
			const sp = await openSp({ w, h, tab: 1, theme, roster: FULL, draft: { skillIds: SK, name: '', updatedAt: '2026-10-22T00:00:00.000Z', skillIcons: { [SK[0]]: 'a' } } });
			const p = sp.page;
			const tk = await tokens(p);
			const iconSel = await p.evaluate(() => { const b = document.querySelector('#deck-template-panel .usd-palette-btn[aria-pressed="true"]'); return b ? getComputedStyle(b).boxShadow : null; });
			assert(!!iconSel && iconSel.indexOf(tk.sel.replace(/ /g, ' ')) !== -1, tag + 'パレットで選んでいるアイコンの輪は、選択中の枠の色（' + tk.sel + '）', iconSel);
			const del0 = await look(p, T + '[data-usd-el="palette-delete"]');
			assert(stageOf(del0, tk) === 'normal', tag + '削除（選んでいない）は通常（1px）', del0);
			await p.click(T + '[data-usd-el="palette-delete"]'); await sleep(p, 250);
			const del1 = await look(p, T + '[data-usd-el="palette-delete"]');
			assert(stageOf(del1, tk) === 'selected' && del1.h === del0.h && del1.w === del0.w, tag + '削除を選ぶと選択中（2px。大きさは変わらない）', { del0, del1 });
			await p.click(T + '[data-usd-el="palette-delete"]'); await sleep(p, 200);
			// ②の画面には塗りつぶし（主な操作）が無い
			const fills2 = await p.evaluate((control) => Array.from(document.querySelectorAll('#deck-template-panel button')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).backgroundColor === control; }).map((e) => e.className), tk.control);
			assert(fills2.length === 0, tag + '②の画面に塗りつぶしの部品は無い', fills2);
			// オススメサポの小窓
			await p.click(T + '[data-usd-el="outside-open"]');
			await p.waitForFunction(() => { const m = document.querySelector('[data-usd-el="outside-modal"]'); return !!m && !m.hidden && !m.querySelector('[data-usd-el="outside-busy"]'); }, null, { timeout: 30000 });
			await sleep(p, 400);
			const OM = '[data-usd-el="outside-modal"] ';
			const ex = await look(p, OM + '[data-usd-el="outside-exclude-btn"]');
			const cnt = await look(p, OM + '[data-usd-el="outside-count-btn"]');
			assert(stageOf(ex, tk) === 'set' && stageOf(cnt, tk) === 'normal', tag + 'オススメサポ: 「除外：…」（初期の除外が入っている）は設定済み・「5枚」（既定のまま）は通常', { ex: stageOf(ex, tk), cnt: stageOf(cnt, tk) });
			const prim = await p.evaluate((control) => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] button')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).backgroundColor === control; }).map((e) => e.getAttribute('data-usd-el')), tk.control);
			assert(prim.length === 1 && prim[0] === 'outside-add', tag + 'オススメサポ: 塗りつぶし（主な操作）は「追加」の1つだけ', prim);
			const cards = await p.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="outside-modal"] .usd-out-card')).map((c) => { const cs = getComputedStyle(c); return { pinned: c.classList.contains('usd-out-card--pinned'), bw: cs.borderTopWidth, bc: cs.borderTopColor }; }));
			assert(cards.length > 0 && cards.every((c) => c.pinned ? (c.bw === '2px' && JSON.stringify(rgb(c.bc)) === JSON.stringify(rgb(tk.sel))) : (c.bw === '1px' && JSON.stringify(rgb(c.bc)) === JSON.stringify(rgb(tk.line)))), tag + 'オススメサポ: カードのタイルは通常 1px・自分で選んだ（固定した）カードだけ 2px', cards);
			await p.keyboard.press('Escape'); await sleep(p, 300);
			if (await p.isVisible('[data-usd-el="outside-modal"]')) { await p.click('[data-usd-el="outside-close"]').catch(() => {}); await sleep(p, 300); }
			// 脚質オススメの小窓
			await p.click(T + '[data-usd-el="style-open"]');
			await p.waitForSelector('[data-usd-el="style-modal"] [data-usd-el="style-row"]', { timeout: 20000 }); await sleep(p, 400);
			const SMd = '[data-usd-el="style-modal"] ';
			const styles = await p.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="style-modal"] [data-usd-el="style-btn"]')).map((b, i) => ({ i, on: b.getAttribute('aria-pressed') })));
			const onIdx = styles.findIndex((s) => s.on === 'true');
			const stylesLook = [];
			for (let i = 0; i < styles.length; i++) stylesLook.push(stageOf(await look(p, SMd + '[data-usd-el="style-btn"]:nth-of-type(' + (i + 1) + ')'), tk));
			assert(styles.length === 4 && onIdx >= 0 && stylesLook.filter((s) => s === 'selected').length === 1 && stylesLook[onIdx] === 'selected' && stylesLook.filter((s) => s === 'normal').length === 3, tag + '脚質オススメ: 脚質（排他）は、選んでいる1つだけ 2px・ほかは通常', { styles, stylesLook });
			// レースのボタン: ①でレースを選んでいれば押している状態（設定済み）・選んでいなければ通常（この編成はレース無し）
			const raceBtn = await look(p, SMd + '[data-usd-el="style-race-btn"]');
			const racePressed = await p.evaluate(() => document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-race-btn"]').getAttribute('aria-pressed'));
			assert(racePressed === 'false' && stageOf(raceBtn, tk) === 'normal', tag + '脚質オススメ: レースを選んでいないときのレースのボタンは通常', { racePressed, raceBtn });
			const prim2 = await p.evaluate((control) => Array.from(document.querySelectorAll('[data-usd-el="style-modal"] button')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).backgroundColor === control; }).map((e) => e.getAttribute('data-usd-el')), tk.control);
			assert(prim2.length === 1 && prim2[0] === 'style-add', tag + '脚質オススメ: 塗りつぶし（主な操作）は「追加する」の1つだけ', prim2);
			assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tag + '横スクロールなし', true);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('段G(6) 脚質オススメ（レースを選んでいる編成）: レースのボタンは設定済み・選んでいる脚質は 2px・「追加する」だけが塗り', async () => {
		for (const [w, h, theme] of [[390, 844, 'light'], [390, 844, 'dark'], [1280, 900, 'light']]) {
			const tag = '段G(6) 脚質オススメ ' + w + 'px・' + theme + ': ';
			const sp = await openSp({ w, h, tab: 1, theme, roster: ORFE, draft: { skillIds: SK, name: '', updatedAt: '2026-10-22T00:00:00.000Z' } });
			const p = sp.page;
			const tk = await tokens(p);
			await p.click(T + '[data-usd-el="style-open"]');
			await p.waitForSelector('[data-usd-el="style-modal"] [data-usd-el="style-row"]', { timeout: 20000 }); await sleep(p, 400);
			const raceBtn = await look(p, '[data-usd-el="style-modal"] [data-usd-el="style-race-btn"]');
			const racePressed = await p.evaluate(() => document.querySelector('[data-usd-el="style-modal"] [data-usd-el="style-race-btn"]').getAttribute('aria-pressed'));
			assert(racePressed === 'true' && stageOf(raceBtn, tk) === 'set', tag + 'レースを選んでいるときのレースのボタンは設定済み（1px の枠＋うすい地色）', { racePressed, raceBtn, tk });
			const pickedStyle = await look(p, '[data-usd-el="style-modal"] [data-usd-el="style-btn"][aria-pressed="true"]');
			assert(stageOf(pickedStyle, tk) === 'selected' && pickedStyle.h === 32, tag + '選んでいる脚質は 2px の枠・大きさは変わらない（高さ32px）', pickedStyle);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('段G(6) リセットのシート（①②）・照合結果の絞り込み: ボタンは通常 1px（2px をやめた）・絞り込みは選んでいるものだけ 2px（塗りつぶしをやめた）', async () => {
		for (const [w, h, theme] of [[390, 844, 'light'], [390, 844, 'dark'], [1280, 900, 'light']]) {
			const tag = '段G(6) リセット ' + w + 'px・' + theme + ': ';
			const sp = await openSp({ w, h, tab: 0, theme, draft: { skillIds: SK, name: '', updatedAt: '2026-10-22T00:00:00.000Z' } });
			const p = sp.page;
			const tk = await tokens(p);
			const probe = (name) => p.evaluate((n) => { const e = document.createElement('i'); e.style.cssText = 'background-color: var(' + n + ')'; document.body.appendChild(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; }, name);
			await p.click('#deck-roster-panel [data-usd-el="roster-reset"]'); await sleep(p, 500);
			const r1 = { soft: await look(p, '[data-usd-el="roster-reset-off"]'), danger: await look(p, '[data-usd-el="roster-reset-all"]'), ghost: await look(p, '[data-usd-el="roster-reset-cancel"]') };
			assert(r1.soft.bw === '1px' && r1.danger.bw === '1px' && r1.ghost.bw === '1px' && [r1.soft, r1.danger, r1.ghost].every((x) => x.h >= 44), tag + '①のリセットのシートの3つのボタンは細い枠（1px）・高さ44px以上のまま', r1);
			assert(JSON.stringify(rgb(r1.soft.bc)) === JSON.stringify(rgb(await probe('--evo-edge'))) && JSON.stringify(rgb(r1.danger.bc)) === JSON.stringify(rgb(await probe('--evo-danger-edge'))) && JSON.stringify(rgb(r1.ghost.bc)) === JSON.stringify(rgb(tk.line)), tag + '枠の色は今のまま（淡いピンク・赤み）・やめるは細い枠の色', r1);
			await p.keyboard.press('Escape'); await sleep(p, 300);
			await p.evaluate(() => localStorage.setItem('umaSkillDeck:stepTab', '1')); await p.reload({ waitUntil: 'networkidle' }); await sleep(p, 900);
			if (await p.$('[data-usd-el="factor-reset"]')) {
				await p.click('[data-usd-el="factor-reset"]'); await sleep(p, 500);
				const r2 = await look(p, '[data-usd-el="factor-reset-cancel"]');
				assert(r2.bw === '1px' && r2.h >= 44, tag + '②のリセットのシートの「やめる」も細い枠（1px）', r2);
			}
			const pills = await p.evaluate(() => ['filter-all', 'filter-found', 'filter-not-found'].map((id) => { const e = document.getElementById(id), cs = getComputedStyle(e); return { id, active: e.classList.contains('active'), bw: cs.borderTopWidth, bc: cs.borderTopColor, bg: cs.backgroundColor, ring: cs.boxShadow }; }));
			assert(pills.filter((x) => x.active).length === 1 && pills.find((x) => x.active).id === 'filter-all' && JSON.stringify(rgb(pills[0].bc)) === JSON.stringify(rgb(tk.sel)) && pills[0].ring.indexOf(tk.sel) !== -1 && JSON.stringify(rgb(pills[0].bg)) === JSON.stringify(rgb(tk.surface))
				&& pills.slice(1).every((x) => x.bw === '1px' && JSON.stringify(rgb(x.bc)) === JSON.stringify(rgb(tk.line)) && x.ring === 'none'), tag + '照合結果の絞り込み: 選んでいる「すべて」だけ 2px の枠（塗りつぶしではない）・ほかは 1px', pills);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('段G(6) 全体: 押している・選んでいる状態を示す塗りつぶしの部品が無い（小窓の中も）／Exam・Deck は変えていない', async () => {
		for (const theme of ['light', 'dark']) {
			const tag = '段G(6) 全体・' + theme + ': ';
			const sp = await openSp({ w: 390, h: 844, tab: 0, theme });
			const p = sp.page;
			const tk = await tokens(p);
			// イベントの選択画面・レースの一覧・セットの一覧・カードの選択窓・進化の選択画面を順に開き、押している状態の部品を集める
			const scan = () => p.evaluate((tk) => {
				const bad = [];
				document.querySelectorAll('[aria-pressed="true"], [aria-checked="true"], .usd-roster-choice--on, .usd-link-opt--on, .usd-evo-target--on, .usd-evo-none--on').forEach((e) => {
					const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return;
					const bg = getComputedStyle(e).backgroundColor;
					if (bg === tk.control && !/usd-evo-target|usd-evo-none/.test(e.className)) bad.push((e.getAttribute('data-usd-el') || e.className) + ' ' + bg);
				});
				return bad;
			}, tk);
			const views = [
				['①', async () => {}],
				['レース', async () => { await p.click('[data-usd-el="set-race-btn"]'); await sleep(p, 500); }],
				['イベント', async () => { await p.keyboard.press('Escape'); await sleep(p, 200); await p.click('#deck-roster-panel [data-usd-el="col-menu-btn"][data-has-events] >> nth=0'); await p.click('[data-usd-el="colmenu-events"]'); await sleep(p, 500); }],
				['カードの選択', async () => { await p.keyboard.press('Escape'); await sleep(p, 200); await p.click('#deck-roster-panel [data-usd-el="pick-card"][data-index="0"]'); await sleep(p, 500); }]
			];
			for (const [name, act] of views) {
				try { await act(); } catch (e) { assert(false, tag + name + 'を開けた', String(e).slice(0, 100)); continue; }
				const bad = await scan();
				assert(bad.length === 0, tag + name + ': 押している状態の部品に塗りつぶし（主な操作の塗り）は無い', bad);
			}
			await sp.ctx.close();
		}
		// Exam・Deck は変えていない（段G の CSS・トークンは special.html の中だけ）
		const exam = fs.readFileSync(path.join(REPO_ROOT, 'exam.html'), 'utf8'), deck = fs.readFileSync(path.join(REPO_ROOT, 'uma-skill-deck.html'), 'utf8'), special = fs.readFileSync(path.join(REPO_ROOT, 'special.html'), 'utf8');
		assert(special.indexOf('--usd-ui-line') !== -1 && exam.indexOf('--usd-ui-line') === -1 && deck.indexOf('--usd-ui-line') === -1, '段G(6) 細い枠のトークン（--usd-ui-line）は special.html にだけある（Exam・Deck には無い）');
		const core = fs.readFileSync(path.join(REPO_ROOT, 'js/uma-skill-deck-core.js'), 'utf8');
		assert(core.indexOf('.usd-mode-btn[aria-pressed="true"] { background: var(--uma-control);') !== -1 && core.indexOf('.usd-roster-togglebtn[aria-pressed="true"] { background: var(--uma-control);') !== -1, '段G(6) 共有の core の CSS（Deck も読む）は、押している状態の塗りのまま（変えたのは special.html の上書きだけ）');
	});
}
