// 脚質オススメ（段A。2026-10-21・C-184）の検査。run-smoke.mjs の末尾から register43() で呼ばれる
// （塊の見出しはすべて「C-184」で始まる。`npm run test:visual -- --only=C-184` で回せる）。
//
// 入口「脚質オススメ」（オススメサポの直後）から開く小窓: レースの選択・脚質の4つ・項目ごとのリスト（緑スキル〔レース条件〕・シナリオスキル・ためらい・サポカ外・斜行）・
// 追加するスキル N種（合計 … Pt）［やめる］［追加する］。①のレース・脚質と共有する。①でレースを選んでも②へは自動で足さない。
// スキル名・id・件数は検査の側に書かない（恒久ルール1。データから独立に数える。代表の編成Aの実測〔31種・既定ON 26〕だけは、Step 0 の実測との照合として数字で持つ）。

export async function register43(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const { avgColor, deltaE } = await import('./lib/pixels.mjs');
	const { noticeText } = await import('./lib/add-notice.mjs');
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const REC = readJson('data/recommended-skills.json');
	const RACES = readJson('data/upcoming-races.json').races;
	const COURSE = readJson('data/course-conditions.json');
	const MASTER = readJson('uma-skill-deck-skills.json').skills;
	const EXT = readJson('data/extended-skills.json').entries;
	const SEARCHABLE = new Set(readJson('data/searchable-extended-ids.json').entries.map((e) => e.skillId));
	const PT = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e.rarity]));
	const NONSUP = readJson('data/non-support-skills.json').entries.map((e) => e.skillId);
	const EFF = readJson('data/skill-effect-levels.json');
	const RANK = new Map(EFF.stages.map((s) => [s.key, s.rank]));
	const LOWMAX = RANK.get(EFF.lowEffectMax.key !== undefined ? EFF.lowEffectMax.key : EFF.lowEffectMax);
	const LOW = new Set(EFF.entries.filter((e) => RANK.get(e.maxStage) <= LOWMAX).map((e) => e.skillId));
	const DIST = readJson('data/race-distances.json');
	const POOL = MASTER.map((s) => ({ id: String(s.id), tags: s.tags })).concat(EXT.filter((e) => e.tags && SEARCHABLE.has(e.id)).map((e) => ({ id: e.id, tags: e.tags })));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	// 代表の編成A（Step 0 と同じ）。①の絞り込みは芝だけ
	const ROSTER_A = { umaId: 'uma-0179', cardIds: ['card-0402', 'card-0499', 'card-0248', 'card-0249', 'card-0250', 'card-0251'], skillFilter: { surface: 'turf' } };
	const T = '#deck-template-panel ';
	const BAR = '#deck-set-bar ';
	const SM = '[data-usd-el="style-modal"] ';
	const sleep = (page, ms) => page.waitForTimeout(ms);
	const nameOf = (id) => { const s = MASTER.find((x) => String(x.id) === id) || EXT.find((x) => x.id === id); return s ? s.name : id; };
	const classOf = (race) => race.distanceCategory || ((DIST.distanceCategories.find((c) => (c.minDistance == null || race.distance >= c.minDistance) && (c.maxDistance == null || race.distance <= c.maxDistance)) || {}).key) || null;
	const STYLES = ['nige', 'senko', 'sashi', 'oikomi'];

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 390, height: o.h || 844 }, o.userData || EMPTY);
		sp.reqs = [];
		sp.page.on('request', (r) => { if (/recommended-skills|non-support-skills/.test(r.url())) sp.reqs.push(r.url()); });
		await sp.page.evaluate(({ roster, tab, theme }) => {
			if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster)); else localStorage.removeItem('umaSkillDeck:draftRoster:special');
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', String(tab));
			try { localStorage.setItem('uma-tools-theme', theme); } catch (e) {}
		}, { roster: o.roster === undefined ? ROSTER_A : o.roster, tab: o.tab === undefined ? 1 : o.tab, theme: o.theme || 'light' });
		sp.reqs = [];
		await sp.page.reload({ waitUntil: 'networkidle' });
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector(BAR + '[data-usd-el="setbar"]', { timeout: 10000 }).catch(() => {});
		await sleep(sp.page, 300);
		return sp;
	};
	const toastText = (page) => page.evaluate(() => document.getElementById('toast-message').textContent);
	const draftIds = (page) => page.evaluate(() => ((JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null') || {}).skillIds) || []);
	const rosterOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('umaSkillDeck:draftRoster:special') || 'null'));
	const modalOpen = (page) => page.evaluate(() => { const m = document.querySelector('[data-usd-el="style-modal"]'); return !!m && !m.hidden; });
	const openStyle = async (page) => {
		await page.click(T + '[data-usd-el="style-open"]');
		await page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="style-modal"]'); return !!m && !m.hidden && m.querySelectorAll('[data-usd-el="style-row"]').length > 0; }, null, { timeout: 10000 });
		await sleep(page, 150);
	};
	const closeStyle = async (page) => { await page.click(SM + '[data-usd-el="style-cancel"]'); await sleep(page, 150); };
	/** 小窓の中身を読む */
	const readModal = (page) => page.evaluate(() => {
		const m = document.querySelector('[data-usd-el="style-modal"]');
		return {
			head: m.querySelector('[data-usd-el="style-head"]').textContent,
			raceText: m.querySelector('[data-usd-el="style-race-text"]').textContent,
			styles: Array.from(m.querySelectorAll('[data-usd-el="style-btn"]')).map((b) => [b.getAttribute('data-style'), b.getAttribute('aria-pressed')]),
			sync: (m.querySelector('[data-usd-el="style-sync"]') || {}).textContent || '',
			secs: Array.from(m.querySelectorAll('[data-usd-el="style-sec"]')).map((s) => ({
				key: s.getAttribute('data-section'), label: s.querySelector('[data-usd-el="style-sec-title"]').textContent,
				note: (s.querySelector('[data-usd-el="style-sec-note"]') || {}).textContent || null,
				rows: Array.from(s.querySelectorAll('[data-usd-el="style-row"]')).map((r) => ({ id: r.getAttribute('data-skill-id'), state: r.getAttribute('data-state'), reason: r.getAttribute('data-reason'),
					checked: r.querySelector('input').checked, name: r.querySelector('.usd-sty-name').textContent, pt: r.querySelector('[data-usd-el="style-row-pt"]').textContent }))
			}))
		};
	});
	const setStyleBtn = async (page, v) => { await page.click(SM + '[data-usd-el="style-btn"][data-style="' + v + '"]'); await sleep(page, 400); };
	const pickRaceInModal = async (page, id) => {
		await page.click(SM + '[data-usd-el="style-race-btn"]');
		await page.waitForSelector('[data-usd-el="race-list"]');
		await page.click('[data-usd-el="race-opt"][data-race-id="' + id + '"] input');
		await sleep(page, 500);
	};
	/** 緑スキル（レース条件）の期待（実データから独立に数える）。白スキル（Pt 未収録を含む）のうち、回り・季節・小回り／直線（表に当たるときだけ）・レース場のタグを持つもの */
	const expectedGreen = (race) => {
		const white = (id) => !PT.has(id) || PT.get(id) === 'white';
		const want = new Set([race.direction, race.season].filter(Boolean));
		COURSE.conditions.forEach((c) => {
			const t = race.venue && race.surface && race.distance ? c.tracks.find((x) => x.venue === race.venue) : null;
			if (t && (!t.courses || t.courses.some((x) => x.surface === race.surface && x.distances.includes(race.distance)))) want.add(c.key);
		});
		return POOL.filter((s) => white(s.id) && (((s.tags.environment || []).some((x) => want.has(x))) || (race.venue && (s.tags.trackVenue || []).includes(race.venue)))).map((s) => s.id);
	};
	const bySection = (key) => REC.skills.filter((e) => e.section === key);
	const rowsOf = (m, key) => m.secs.find((s) => s.key === key).rows;

	/* ====================================================================
	 * 入口
	 * ==================================================================== */
	await block('C-184 入口: オススメサポの直後に「脚質オススメ」（入口の列は折り返さず1段・ボタンの高さはほかと同じ）／「脚質オススメ」はオススメサポと同じクラス・同じ見た目（段F0。C-187 は取り消し）／ライト・ダーク（390・360・1280px）', async () => {
		for (const theme of ['light', 'dark']) {
			for (const w of [1280, 390, 360]) {
				const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 844 });
				const tag = 'C-184 ' + w + 'px・' + theme + ': ';
				const e = await sp.page.evaluate(() => {
					const row = document.querySelector('#deck-template-panel .usd-entry-row');
					const kids = Array.from(row.children);
					const s = row.querySelector('[data-usd-el="style-open"]'), o = row.querySelector('[data-usd-el="outside-open"]'), f = row.querySelector('[data-usd-act="editor-pick"]');
					const cs = getComputedStyle(s), cso = getComputedStyle(o);
					const tops = new Set(kids.map((c) => Math.round(c.getBoundingClientRect().top)));
					return { order: kids.map((c) => c.getAttribute('data-usd-el') || c.getAttribute('data-usd-act')), text: s.textContent.trim(), tops: tops.size,
						hs: Math.round(s.getBoundingClientRect().height * 10) / 10, ho: Math.round(o.getBoundingClientRect().height * 10) / 10, hf: Math.round(f.getBoundingClientRect().height * 10) / 10,
						bw: cs.borderTopWidth, bg: cs.backgroundImage, cls: s.className, clsO: o.className, bgO: cso.backgroundImage, bwO: cso.borderTopWidth, bcO: cso.borderTopColor, bc: cs.borderTopColor, nowrap: cs.whiteSpace, pageW: document.documentElement.scrollWidth, vw: window.innerWidth,
						ariaHaspopup: s.getAttribute('aria-haspopup') };
				});
				assert(e.order[0] === 'outside-open' && e.order[1] === 'style-open' && e.text === '脚質オススメ' && e.tops === 1 && e.nowrap === 'nowrap', tag + '入口の並びは「オススメサポ」「脚質オススメ」の順で、列は1段', e);
				assert(Math.abs(e.hs - e.ho) <= 1 && Math.abs(e.hs - e.hf) <= 1 && e.pageW <= e.vw, tag + 'ボタンの高さはほかの入口と同じ（±1px）・横にはみ出さない', e);
				assert(e.cls === e.clsO && /usd-outside-entry/.test(e.cls) && e.bw === '1px' && e.bw === e.bwO && e.bc === e.bcO && e.bg === e.bgO && (e.bg.match(/linear-gradient/g) || []).length === 1 && e.ariaHaspopup === 'dialog', tag + '脚質オススメはオススメサポと同じクラス（usd-outside-entry）・同じ縁（1px）・同じ淡い3色のグラデーション', { cls: e.cls, clsO: e.clsO, bw: e.bw, bg: e.bg.slice(0, 120) });
				// 画素: 縁はほかの入口の縁と違う色／内側は、オススメサポと同じ淡い塗り
				if (w === 1280) {
					const box = await sp.page.evaluate(() => {
						const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
						return { s: r('#deck-template-panel [data-usd-el="style-open"]'), o: r('#deck-template-panel [data-usd-el="outside-open"]'), f: r('#deck-template-panel [data-usd-act="editor-pick"]'), p: r('#deck-template-panel .usd-skillgroup') };
					});
					const px = async (x, y) => avgColor(await sp.page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 3, height: 3 } }));
					const rimS = await px(box.s.x + box.s.w / 2, box.s.y + 0.5), rimF = await px(box.f.x + box.f.w / 2, box.f.y);
					const fillS = await px(box.s.x + 7, box.s.y + box.s.h / 2 - 1), fillO = await px(box.o.x + 4, box.o.y + box.o.h / 2 - 1);
					const paper = await px(box.p.x + box.p.w - 6, box.p.y + 6);
					assert(deltaE(rimS, rimF) > 8, tag + '縁の色は、ほかの入口の縁と違う（ΔE ' + deltaE(rimS, rimF).toFixed(1) + '）', { rimS, rimF });
					assert(deltaE(fillS, fillO) < 3, tag + '内側はオススメサポと同じ淡い塗り（ΔE ' + deltaE(fillS, fillO).toFixed(1) + ' < 3）・どちらも地に近い（地との差 ' + deltaE(fillS, paper).toFixed(1) + '）', { fillS, fillO, paper });
				}
				assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			}
		}
	});

	await block('C-184 パレットの行は「削除｜◎○△◇★✕」だけ（「サポカ外」「逃げオススメ／先差追オススメ」は無い）／ページの読み込み・②のタブを見ても recommended-skills.json・non-support-skills.json は取りに行かない', async () => {
		const sp = await openSp({ roster: Object.assign({}, ROSTER_A, { skillFilter: { surface: 'turf', style: 'nige' } }) });
		await sleep(sp.page, 600);
		const p = await sp.page.evaluate(() => {
			const row = document.querySelector('#deck-template-panel [data-usd-el="tier-row"]');
			return { els: Array.from(row.querySelectorAll('button')).map((b) => b.getAttribute('data-usd-el')), recBtn: !!document.querySelector('[data-usd-el="recommend-btn"]'), outBtn: !!document.querySelector('[data-usd-el="outside-skill-btn"]'),
				word: /逃げオススメ|先差追オススメ/.test(document.querySelector('#deck-template-panel').textContent) };
		});
		assert(p.els.length === 7 && p.els[0] === 'palette-delete' && !p.recBtn && !p.outBtn && !p.word, 'C-184 パレットの行は「削除」とアイコン6つだけ', p);
		assert(sp.reqs.length === 0, 'C-184 ②のタブを開いている間（脚質あり）はデータを取りに行かない', sp.reqs);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * リストの中身
	 * ==================================================================== */
	await block('C-184 項目ごとの件数: 緑スキル（レース条件）は実データから独立に数えた顔ぶれと一致／シナリオ・ためらい・斜行はデータの区分どおり／サポカ外は低効果なし・緑と重ならない／代表の編成A（逃げ×中山 芝2500m）は31種・既定ON 26（Step 0 の実測）', async () => {
		const race3 = RACES.find((r) => r.id === 'race-0003');
		const sp = await openSp();
		await openStyle(sp.page);
		// レースと脚質が未選択: 緑スキルの行は無く、項目名の下に「レースを選ぶと出ます」
		const m0 = await readModal(sp.page);
		const g0 = m0.secs.find((s) => s.key === 'green');
		assert(g0.rows.length === 0 && g0.note === 'レースを選ぶと出ます', 'C-184 レース未選択: 緑スキルの項目は行を出さず「レースを選ぶと出ます」', g0);
		assert(m0.secs.map((s) => s.label).join('／') === REC.sections.map((s) => s.label).join('／') && m0.secs.map((s) => s.label).join('／') === '緑スキル（レース条件）／シナリオスキル／ためらい／サポカ外／斜行', 'C-184 項目名と並び（全角括弧）', m0.secs.map((s) => s.label));
		assert(m0.sync === 'ここで選んだレース・脚質は①にも反映されます', 'C-184 小窓の中に「ここで選んだレース・脚質は①にも反映されます」', m0.sync);
		await setStyleBtn(sp.page, 'nige');
		await pickRaceInModal(sp.page, 'race-0003');
		const m = await readModal(sp.page);
		const ids = (key) => rowsOf(m, key).map((r) => r.id);
		const expG = expectedGreen(race3);
		assert(ids('green').slice().sort().join() === expG.slice().sort().join() && expG.length === 6, 'C-184 緑スキル（レース条件）= 独立に数えた ' + expG.length + '種（回り・季節・小回り・レース場）', { ui: ids('green'), exp: expG });
		assert(ids('scenario').join() === bySection('scenario').map((e) => e.skillId).join() && ids('tame').join() === bySection('tame').map((e) => e.skillId).join() && ids('lane').join() === bySection('lane').map((e) => e.skillId).join(), 'C-184 シナリオスキル・ためらい・斜行は data/recommended-skills.json の区分と並びのとおり', { scenario: ids('scenario'), tame: ids('tame'), lane: ids('lane') });
		assert(ids('tame').length === 4 && ids('scenario').length === 14 && ids('lane').length === 2, 'C-184 ためらい4・シナリオ14・斜行2', { t: ids('tame').length, s: ids('scenario').length, l: ids('lane').length });
		const out = ids('outside');
		assert(out.every((id) => NONSUP.includes(id) && !LOW.has(id) && !expG.includes(id)) && new Set(out).size === out.length, 'C-184 サポカ外は non-support-skills.json の中だけ・低効果（ちょっと以下）は出さない・緑スキルの項目と重ならない', out);
		const all = m.secs.reduce((a, s) => a.concat(s.rows), []);
		assert(new Set(all.map((r) => r.id)).size === all.length, 'C-184 どのスキルも1つの項目にだけ出る（重ならない）', all.length);
		const on = all.filter((r) => r.state === 'on').length;
		assert(all.length === 31 && on === 26 && out.length === 5 && /^追加するスキル 26種（合計 /.test(m.head), 'C-184 代表の編成A（逃げ×中山 芝2500m）: 緑6・シナリオ14・ためらい4・サポカ外5・斜行2＝31種、既定ON 26（Step 0 の実測と一致）', { total: all.length, on, outside: out.length, head: m.head });
		// 重なり（サポカ外にも入っているレース場○）は緑スキル側に出る
		const overlap = NONSUP.filter((id) => expG.includes(id));
		assert(overlap.length === 0 || overlap.every((id) => ids('green').includes(id) && !out.includes(id)), 'C-184 サポカ外と重なるレース場○は、緑スキルの項目に出て、サポカ外の項目からは除く', overlap);
		// ほかのレース（レースが決まっているが脚質は逃げ）: 独立に数えた緑スキルと一致
		for (const rid of ['race-0001', 'race-0002']) {
			await pickRaceInModal(sp.page, rid);
			const mm = await readModal(sp.page);
			const race = RACES.find((r) => r.id === rid);
			const exp = expectedGreen(race);
			assert(rowsOf(mm, 'green').map((r) => r.id).sort().join() === exp.slice().sort().join(), 'C-184 ' + rid + ': 緑スキルの顔ぶれも独立の数え方と一致（' + exp.length + '種）', { ui: rowsOf(mm, 'green').map((r) => r.id), exp });
		}
		assert(jsErrors(sp.errors).length === 0, 'C-184 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C-184 ON／OFF: 脚質が未選択ならグレー以外すべて ON／選ぶとシナリオ・斜行がデータの styles のとおり（逃げ＝逃げのグループ、先行・差し・追込＝先差追のグループ）／緑・ためらい・サポカ外は脚質によらず ON／バーニングソウルの距離の判定', async () => {
		const only = REC.skills.find((e) => e.onlyWhenRaceDistanceClass);
		const sp = await openSp();
		await openStyle(sp.page);
		await pickRaceInModal(sp.page, 'race-0003');   // 長距離（onlyWhen の区分に入らない）
		const lines = [];
		for (const st of [null].concat(STYLES)) {
			if (st) await setStyleBtn(sp.page, st);
			else { const pressed = (await readModal(sp.page)).styles.find((x) => x[1] === 'true'); if (pressed) await setStyleBtn(sp.page, pressed[0]); }
			const m = await readModal(sp.page);
			const tag = 'C-184 脚質 ' + (st || '未選択') + ': ';
			const bad = [];
			['scenario', 'lane'].forEach((k) => rowsOf(m, k).forEach((r) => {
				if (r.state === 'gray') return;
				const e = REC.skills.find((x) => x.skillId === r.id);
				const want = (e.onlyWhenRaceDistanceClass && !classOf(RACES.find((x) => x.id === 'race-0003'))) ? false : (!st || e.styles.includes(st));
				if (r.checked !== want || (r.state === 'on') !== want) bad.push(r.id);
			}));
			['green', 'tame', 'outside'].forEach((k) => rowsOf(m, k).forEach((r) => { if (r.state !== 'gray' && !r.checked) bad.push(k + ':' + r.id); }));
			assert(bad.length === 0, tag + 'シナリオ・斜行は styles のとおり、緑・ためらい・サポカ外は ON', bad);
			// 長距離のレース: バーニングソウルは「レース条件に合わない」でグレー
			const bs = rowsOf(m, 'scenario').find((r) => r.id === only.skillId);
			assert(bs.state === 'gray' && bs.reason === 'race', tag + 'バーニングソウルは長距離のレースではグレー（理由はレース条件）', bs);
			lines.push((st || '未選択') + ': ON ' + m.secs.reduce((a, s) => a + s.rows.filter((r) => r.state === 'on').length, 0));
		}
		console.log('     [実測] 脚質ごとの既定 ON: ' + lines.join(' / '));
		// レースが無いとき: ①の距離で判断（マイル・中距離なら ON・それ以外と未指定は OFF）
		await sp.ctx.close();
		for (const [dist, want] of [['medium', true], ['mile', true], ['long', false], [null, false]]) {
			const sp2 = await openSp({ roster: Object.assign({}, ROSTER_A, { skillFilter: Object.assign({ surface: 'turf' }, dist ? { distance: dist } : {}) }) });
			await openStyle(sp2.page);
			const bs = rowsOf(await readModal(sp2.page), 'scenario').find((r) => r.id === only.skillId);
			const inList = dist && only.onlyWhenRaceDistanceClass.includes(dist);
			assert((want ? bs.state === 'on' && bs.checked : (dist ? bs.state === 'gray' : bs.state === 'off' && !bs.checked)) && want === !!inList, 'C-184 レース無し・①の距離 ' + (dist || '指定なし') + ': バーニングソウルは' + (want ? 'ON' : (dist ? 'グレー（レース条件）' : 'OFF（押せる）')), bs);
			await sp2.ctx.close();
		}
		// レースがあるときはレースの距離の区分が優先（①の距離が中距離でも、長距離のレースなら OFF にならずグレー）
		const sp3 = await openSp({ roster: Object.assign({}, ROSTER_A, { skillFilter: { surface: 'turf', distance: 'medium' } }) });
		await openStyle(sp3.page);
		await pickRaceInModal(sp3.page, 'race-0001');   // 中距離のレース
		const b1 = rowsOf(await readModal(sp3.page), 'scenario').find((r) => r.id === only.skillId);
		assert(classOf(RACES.find((r) => r.id === 'race-0001')) === 'medium' && b1.state === 'on', 'C-184 中距離のレースを選ぶと、バーニングソウルは ON', b1);
		await sp3.ctx.close();
	});

	await block('C-184 グレーの行: ①で得る・②に追加済み・レース条件に合わない（デバフなしのレースのためらい4種）／チェックは外れたまま押せる見た目・押すと理由の1行／追加の合計・種数に数えない', async () => {
		const RACE_ND = RACES.find((r) => r.rule === 'no_debuff');
		const sp = await openSp();
		await openStyle(sp.page);
		await setStyleBtn(sp.page, 'nige');
		await pickRaceInModal(sp.page, 'race-0003');
		let m = await readModal(sp.page);
		const grays = m.secs.reduce((a, s) => a.concat(s.rows.filter((r) => r.state === 'gray').map((r) => Object.assign({ sec: s.key }, r))), []);
		const winter = grays.filter((r) => r.sec === 'green');
		assert(winter.length === 2 && winter.every((r) => r.reason === 'roster' && !r.checked), 'C-184 ①で得る: 編成Aでは緑スキルの2種（冬ウマ娘○・冬の目覚め）がグレー・理由は本育成', winter);
		assert(grays.length === 4 && grays.some((r) => r.sec === 'lane' && r.reason === 'roster') && grays.some((r) => r.reason === 'race'), 'C-184 グレーは緑2・斜行1（①で得る）・バーニングソウル（レース条件）の4種', grays.map((r) => r.sec + ':' + r.reason));
		// 押すと理由の1行（チェックは変わらない・小窓は閉じない・種数は変わらない）
		const head0 = m.head;
		const reasons = { roster: '①で得るため', already: '②に追加済みのため', race: 'レース条件に合わないため' };
		for (const r of [grays.find((x) => x.reason === 'roster'), grays.find((x) => x.reason === 'race')]) {
			await sp.page.click(SM + '[data-usd-el="style-row"][data-skill-id="' + r.id + '"] .usd-sty-check', { force: true });   // グレーの行は aria-disabled（読み上げ）。押せる見た目のまま・押すと理由
			await sleep(sp.page, 250);
			assert((await toastText(sp.page)) === reasons[r.reason], 'C-184 グレーの行（' + nameOf(r.id) + '）を押すと「' + reasons[r.reason] + '」', await toastText(sp.page));
		}
		m = await readModal(sp.page);
		assert(m.head === head0 && await modalOpen(sp.page) && rowsOf(m, 'green').filter((r) => r.state === 'gray').every((r) => !r.checked), 'C-184 押しても、チェックは外れたまま・追加の種数・合計は変わらず・小窓は閉じない', { head0, head: m.head });
		await sp.ctx.close();
		// ②に追加済み: 緑スキルを1つ手で足すと、その行がグレー（理由は②に追加済み）
		const sp2 = await openSp();
		await openStyle(sp2.page);
		await pickRaceInModal(sp2.page, 'race-0003');
		const first = rowsOf(await readModal(sp2.page), 'green').find((r) => r.state === 'on');
		await closeStyle(sp2.page);
		// 追加は画面の経路（テキストで検索）
		await sp2.page.click(T + '[data-usd-act="editor-pick-text"]');
		await sp2.page.fill('[data-usd-el="paste-input"]', nameOf(first.id));
		await sp2.page.click('[data-usd-act="paste-run"]');
		await sleep(sp2.page, 200);
		await sp2.page.click('[data-usd-el="picker-commit"]');
		await sleep(sp2.page, 200);
		await sp2.page.click('[data-usd-act="picker-close"]');
		await sleep(sp2.page, 200);
		await openStyle(sp2.page);
		const g2 = rowsOf(await readModal(sp2.page), 'green').find((r) => r.id === first.id);
		assert(g2.state === 'gray' && g2.reason === 'already' && !g2.checked, 'C-184 ②に追加済みの行はグレー（理由は「②に追加済みのため」）', g2);
		await sp2.page.click(SM + '[data-usd-el="style-row"][data-skill-id="' + first.id + '"] .usd-sty-check', { force: true });
		await sleep(sp2.page, 250);
		assert((await toastText(sp2.page)) === '②に追加済みのため', 'C-184 押すと「②に追加済みのため」', await toastText(sp2.page));
		await sp2.ctx.close();
		// レース条件: デバフなしのレースでは、ためらい4種が全部グレー（理由はレース条件）
		const sp3 = await openSp();
		await openStyle(sp3.page);
		await pickRaceInModal(sp3.page, RACE_ND.id);
		const m3 = await readModal(sp3.page);
		assert(rowsOf(m3, 'tame').length === 4 && rowsOf(m3, 'tame').every((r) => r.state === 'gray' && r.reason === 'race' && !r.checked), 'C-184 デバフなしのレース: ためらい4種が全部グレー（レース条件に合わない）', rowsOf(m3, 'tame'));
		const onN = m3.secs.reduce((a, s) => a + s.rows.filter((r) => r.state === 'on').length, 0);
		assert(new RegExp('^追加するスキル ' + onN + '種').test(m3.head), 'C-184 追加する種数にはグレーを数えない', { onN, head: m3.head });
		await sp3.ctx.close();
	});

	await block('C-184 スキル名を押すと説明の小窓が上に重なる（小窓は消えない・チェックは変わらない）／説明を閉じると小窓に戻る', async () => {
		const sp = await openSp();
		await openStyle(sp.page);
		const m = await readModal(sp.page);
		const row = rowsOf(m, 'scenario')[0];
		await sp.page.click(SM + '[data-usd-el="style-row"][data-skill-id="' + row.id + '"] .usd-sty-name');
		await sleep(sp.page, 400);
		const st = await sp.page.evaluate((id) => {
			const pop = document.querySelector('.usd-info-pop');
			const modal = document.querySelector('[data-usd-el="style-modal"]');
			const z = (el) => parseInt(getComputedStyle(el).zIndex, 10) || 0;
			return { popVisible: !!pop && !pop.hidden, modalVisible: !modal.hidden, zPop: pop ? z(pop.parentElement && pop.parentElement.classList.contains('usd-info-back') ? pop.parentElement : pop) : 0, zModal: z(modal),
				checked: modal.querySelector('[data-usd-el="style-row"][data-skill-id="' + id + '"] input').checked, title: pop ? (pop.querySelector('[data-usd-el="info-title"]') || pop.querySelector('h2,h3,.usd-info-title') || {}).textContent : '' };
		}, row.id);
		assert(st.popVisible && st.modalVisible && st.zPop >= st.zModal && st.checked === row.checked, 'C-184 名前を押すと説明の小窓が出て、脚質オススメの小窓も残り、チェックは変わらない', st);
		await sp.page.keyboard.press('Escape');
		await sleep(sp.page, 300);
		assert(await modalOpen(sp.page), 'C-184 説明を閉じると、脚質オススメの小窓に戻る', true);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * レースと脚質（①と共有）
	 * ==================================================================== */
	await block('C-184 レースと脚質は①と共有: 小窓で選ぶと①の roster に書かれる／①で選んでいれば小窓に出る／元に戻すには積まれない／「指定なし」と脚質のもう一度押しで戻る／小窓は閉じない', async () => {
		const sp = await openSp({ roster: Object.assign({}, ROSTER_A, { skillFilter: { surface: 'turf', style: 'sashi' } }) });
		const u0 = await sp.page.evaluate(() => UmaSkillDeckCore.undoCount());
		await openStyle(sp.page);
		let m = await readModal(sp.page);
		assert(m.styles.find((x) => x[1] === 'true')[0] === 'sashi' && m.raceText === 'レース：指定なし', 'C-184 ①で選んでいる脚質（差し）が小窓に出る・レースは指定なし', m.styles);
		await pickRaceInModal(sp.page, 'race-0003');
		let r = await rosterOf(sp.page);
		m = await readModal(sp.page);
		assert(r.race && r.race.name === RACES.find((x) => x.id === 'race-0003').name && /中山/.test(m.raceText) && await modalOpen(sp.page), 'C-184 小窓でレースを選ぶと①のセットのレースに書かれ、小窓はそのまま（ボタンに「中山 …」）', { race: r.race && r.race.name, text: m.raceText });
		await setStyleBtn(sp.page, 'nige');
		r = await rosterOf(sp.page);
		assert(r.skillFilter.style === 'nige', 'C-184 小窓で脚質を選ぶと①の絞り込みの脚質に書かれる', r.skillFilter);
		await setStyleBtn(sp.page, 'nige');   // もう一度押すと指定なし
		r = await rosterOf(sp.page);
		m = await readModal(sp.page);
		assert(r.skillFilter.style === undefined && m.styles.every((x) => x[1] === 'false'), 'C-184 もう一度押すと指定なし（①の保存からも項目が消える）', { f: r.skillFilter, styles: m.styles });
		await pickRaceInModal(sp.page, '');
		r = await rosterOf(sp.page);
		assert(r.race === undefined, 'C-184 レースを「指定なし」にすると①の項目が消える', r.race);
		assert(await sp.page.evaluate(() => UmaSkillDeckCore.undoCount()) === u0, 'C-184 レース・脚質の変更は元に戻すに積まない', u0);
		// ①の表と帯が変わっている（①のセレクトの値が小窓と同じ）
		await setStyleBtn(sp.page, 'oikomi');
		await closeStyle(sp.page);
		await sp.page.click('#step-tab-0');
		await sleep(sp.page, 500);
		const sel = await sp.page.evaluate(() => (document.querySelector('#deck-roster-panel select[data-axis="style"]') || {}).value);
		assert(sel === 'oikomi', 'C-184 ①の脚質のセレクトにも反映されている（追込）', sel);
		assert(jsErrors(sp.errors).length === 0, 'C-184 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C-184 ①でレースを選んでも②は変わらない（自動追加の廃止）・知らせも出ない・roster.raceAutoSkillIds は書かない・読まない・消さない（古いデータは1バイトも変わらない。ルール28）', async () => {
		const OLD = ['1', '17'];
		const sp = await openSp({ roster: Object.assign({}, ROSTER_A, { raceAutoSkillIds: OLD }) });
		const before = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		for (const race of RACES) {
			await sp.page.click(BAR + '[data-usd-act="set-race"]');
			await sp.page.waitForSelector('[data-usd-el="race-list"]');
			await sp.page.click('[data-usd-el="race-opt"][data-race-id="' + race.id + '"] input');
			await sleep(sp.page, 350);
			const ids = await draftIds(sp.page);
			const t = await toastText(sp.page);
			assert(ids.length === 0 && !/レースに合わせて/.test(t) && JSON.stringify((await rosterOf(sp.page)).raceAutoSkillIds) === JSON.stringify(OLD), 'C-184 ' + race.id + ': ②は空のまま・「レースに合わせて」の知らせは出ない・記録はそのまま', { ids, t });
		}
		await sp.page.click(BAR + '[data-usd-act="set-race"]');
		await sp.page.waitForSelector('[data-usd-el="race-list"]');
		await sp.page.click('[data-usd-el="race-opt"][data-race-id=""] input');
		await sleep(sp.page, 350);
		const after = await sp.page.evaluate(() => localStorage.getItem('umaSkillDeck:draftRoster:special'));
		// 下書きの保存で固定の項目（名前・星など）が足されることがあるので、元にあった項目が変わっていないことを見る
		const ob = JSON.parse(before), oa = JSON.parse(after);
		assert(Object.keys(ob).every((k) => JSON.stringify(oa[k]) === JSON.stringify(ob[k])) && oa.race === undefined, 'C-184 レースを選んで「指定なし」に戻すと、元にあった項目は変わらない（raceAutoSkillIds もそのまま）・レースの項目は残らない', { before: ob, after: oa });
		assert(sp.reqs.length === 0, 'C-184 レースを選んでも recommended-skills.json は取りに行かない', sp.reqs);
		await sp.ctx.close();
	});

	/* ====================================================================
	 * 追加
	 * ==================================================================== */
	await block('C-184 追加: チェックしたものだけが②に入る・知らせ「脚質オススメ N種を追加しました…」・元に戻すに1回積まれ戻る／チェックの付け外しで種数・合計 Pt が変わる／全部追加済みなら小窓は開かず従来の知らせ', async () => {
		const sp = await openSp();
		await openStyle(sp.page);
		await setStyleBtn(sp.page, 'senko');
		await pickRaceInModal(sp.page, 'race-0001');
		let m = await readModal(sp.page);
		const onIds = m.secs.reduce((a, s) => a.concat(s.rows.filter((r) => r.state === 'on').map((r) => r.id)), []);
		assert(new RegExp('^追加するスキル ' + onIds.length + '種（合計 [\\d,]+ Pt').test(m.head), 'C-184 見出し「追加するスキル ' + onIds.length + '種（合計 … Pt）」', m.head);
		// 1つ外す → 種数が1減り、合計が変わる。付け直すと戻る
		const pickId = rowsOf(m, 'scenario').find((r) => r.state === 'on').id;
		await sp.page.click(SM + '[data-usd-el="style-row"][data-skill-id="' + pickId + '"] .usd-sty-check');
		await sleep(sp.page, 200);
		const m1 = await readModal(sp.page);
		assert(new RegExp('^追加するスキル ' + (onIds.length - 1) + '種').test(m1.head) && m1.head !== m.head, 'C-184 チェックを1つ外すと種数と合計が変わる（' + m1.head + '）', m1.head);
		// レースを変えても、外したチェックは保つ（変えていないスキルは軸の変更に追随する）
		await setStyleBtn(sp.page, 'sashi');
		const m2 = await readModal(sp.page);
		assert(rowsOf(m2, 'scenario').find((r) => r.id === pickId).state === 'off', 'C-184 脚質を変えても、ユーザーが外したチェックは保つ', rowsOf(m2, 'scenario').find((r) => r.id === pickId));
		await setStyleBtn(sp.page, 'senko');
		const want = (await readModal(sp.page)).secs.reduce((a, s) => a.concat(s.rows.filter((r) => r.state === 'on').map((r) => r.id)), []);
		const u0 = await sp.page.evaluate(() => UmaSkillDeckCore.undoCount());
		await sp.page.click(SM + '[data-usd-el="style-add"]');
		await sleep(sp.page, 500);
		const ids = await draftIds(sp.page);
		const t = (await noticeText(sp.page)) || '';
		assert(!(await modalOpen(sp.page)) && JSON.stringify(ids.slice().sort()) === JSON.stringify(want.slice().sort()) && !ids.includes(pickId), 'C-184 「追加する」でチェックしたものだけが②に入り、小窓は閉じる（外した1種は入らない）', { n: ids.length, want: want.length });
		assert(t === '脚質オススメ ' + want.length + '種を追加しました', 'C-184 知らせ「脚質オススメ ' + want.length + '種を追加しました」の1行だけ（段F1: 追加しなかったものの内訳は出さない。消えない知らせ）', t);
		assert(await sp.page.evaluate(() => UmaSkillDeckCore.undoCount()) === u0 + 1, 'C-184 元に戻すに1回だけ積まれる', u0);
		await sp.page.evaluate(() => UmaSkillDeckCore.performUndo());
		await sleep(sp.page, 300);
		assert((await draftIds(sp.page)).length === 0, 'C-184 「元に戻す」で追加前に戻る', await draftIds(sp.page));
		// もう一度追加してから、全部追加済みにする
		await openStyle(sp.page);
		await sp.page.click(SM + '[data-usd-el="style-add"]');
		await sleep(sp.page, 400);
		const n1 = (await draftIds(sp.page)).length;
		await sp.page.click(T + '[data-usd-el="style-open"]');
		await sleep(sp.page, 500);
		const t2 = await toastText(sp.page);
		const shown = await modalOpen(sp.page);
		const m3 = shown ? await readModal(sp.page) : null;
		// 追加済みの行がグレーになり、ON のものが残っていれば小窓が開く（②へ足した以外に ON が残っていないことが多い）。開かないときは従来の知らせ
		if (!shown) assert(/^追加できるスキルはありません（追加済み \d+種/.test(t2) && (await draftIds(sp.page)).length === n1, 'C-184 全部追加済みなら小窓は開かず「追加できるスキルはありません（追加済み a種…）」', t2);
		else assert(m3.secs.some((s) => s.rows.some((r) => r.state === 'on')), 'C-184 追加できるものが残っているときだけ小窓が開く', m3.head);
		const btn = await sp.page.evaluate(() => { const b = document.querySelector('#deck-template-panel [data-usd-el="style-open"]'); return { dis: b.disabled }; });
		assert(!btn.dis, 'C-184 入口のボタンは0種でも押せる見た目のまま', btn);
		assert(jsErrors(sp.errors).length === 0, 'C-184 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});

	await block('C-184 データが読めないときは、小窓を開かず短い知らせ（recommended-skills.json・non-support-skills.json）', async () => {
		for (const [pat, msg] of [['**/data/recommended-skills.json*', 'オススメのスキルのデータを読み込めませんでした'], ['**/data/non-support-skills.json*', 'サポカ外のスキルのデータを読み込めませんでした']]) {
			const sp = await openSp();
			await sp.page.route(pat, (r) => r.fulfill({ status: 500, body: 'x' }));
			await sp.page.click(T + '[data-usd-el="style-open"]');
			await sleep(sp.page, 700);
			assert(!(await modalOpen(sp.page)) && (await toastText(sp.page)) === msg, 'C-184 ' + pat.replace(/\*/g, '') + ' が読めない: 小窓は開かず「' + msg + '」', await toastText(sp.page));
			await sp.ctx.close();
		}
	});

	/* ====================================================================
	 * 見え方
	 * ==================================================================== */
	await block('C-184 並び: 390px 以上は2列・360px は1列／上（見出し・レース・脚質）と下（追加）は固定でリストだけ縦に送る／チェックの押す範囲は44px／横スクロールなし・ライト・ダーク（1280・390・360px）', async () => {
		for (const theme of ['light', 'dark']) {
			for (const w of [1280, 390, 360]) {
				const sp = await openSp({ w, theme, h: w === 1280 ? 900 : 780 });
				await openStyle(sp.page);
				await setStyleBtn(sp.page, 'nige');
				await pickRaceInModal(sp.page, 'race-0003');
				const tag = 'C-184 ' + w + 'px・' + theme + ': ';
				const g = await sp.page.evaluate(() => {
					const m = document.querySelector('[data-usd-el="style-modal"]');
					const grid = m.querySelector('[data-section="scenario"] .usd-sty-grid');
					const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
					const body = m.querySelector('[data-usd-el="style-body"]');
					const top = m.querySelector('[data-usd-el="style-top"]'), foot = m.querySelector('[data-usd-el="style-foot"]'), head = m.querySelector('.usd-out-head');
					const panel = m.querySelector('.usd-sty-panel');
					const chk = m.querySelector('.usd-sty-check').getBoundingClientRect();
					const rows = Array.from(m.querySelectorAll('[data-section="scenario"] .usd-sty-row')).map((r) => r.getBoundingClientRect());
					const names = Array.from(m.querySelectorAll('.usd-sty-name')).map((n) => n.scrollWidth - n.clientWidth);
					return { cols: cols, scroll: body.scrollHeight > body.clientHeight + 1, bodyTop: body.getBoundingClientRect().top, topBottom: top.getBoundingClientRect().bottom, headBottom: head.getBoundingClientRect().bottom,
						footTop: foot.getBoundingClientRect().top, panelBottom: panel.getBoundingClientRect().bottom, vh: window.innerHeight, chk: [Math.round(chk.width), Math.round(chk.height)],
						pageW: document.documentElement.scrollWidth, vw: window.innerWidth, bodyW: body.scrollWidth - body.clientWidth, rowH: Math.round(rows[0].height), over: names.filter((x) => x > 1).length,
						panelW: Math.round(panel.getBoundingClientRect().width), foot: foot.getBoundingClientRect().height };
				});
				assert(g.cols === (w >= 390 ? 2 : 1), tag + (w >= 390 ? '2列' : '1列'), g.cols);
				assert(g.chk[0] >= 44 && g.chk[1] >= 44, tag + 'チェックの押す範囲は44px以上（' + g.chk.join('×') + '）', g.chk);
				assert(g.scroll && g.bodyTop >= g.topBottom - 1 && g.footTop >= g.bodyTop && g.panelBottom <= g.vh + 1, tag + 'リストだけが縦に送られ、上と下は固定のまま画面に収まる', g);
				assert(g.pageW <= g.vw && g.bodyW <= 1 && g.over === 0, tag + '横にはみ出さない（名前も切れずに折り返す）', g);
				if (w === 390 || w === 1280) await sp.page.screenshot({ path: path.join(REPO_ROOT, 'output', 'scratch', 'shots-a', 'A-modal-' + w + '-' + theme + '.png') });
				assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
				await sp.ctx.close();
			}
		}
	});
}
