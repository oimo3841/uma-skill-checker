import { reloadReady } from './lib/page-ready.mjs';
import { removeFromSet } from './lib/fixtures.mjs';
import { pickEntry } from './lib/entry-search.mjs';
// 小回り・直線コースのレース条件（C-155・2026-10-14）の画面の検査。run-smoke.mjs の末尾から register26() で呼ばれる
// （塊の見出しはすべて「小回り直線」で始まる。`npm run test:visual -- --only=小回り直線` で回せる）。
//
// 見るもの: (1) 緑スキルの一覧で、レースに合わない小回り・直線コースのスキルがグレーアウト（理由「レース条件に合わないため選べない」）になり、
//   合うレース・レースが未指定・指定が足りないレースでは選べる (2) スキルの説明の小窓に「対象レース場: …」の1行が出る（○と◎・
//   360／375／390px × ライト／ダークで画面の内側に収まる・ほかのスキルには出ない）。
// 対象のスキルは、タグ（レース環境の small_track／straight_course）で決める。スキル名は書かない（恒久ルール1）。

export async function register26(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const RACES = readJson('data/upcoming-races.json').races;
	const ALL = readJson('uma-skill-deck-skills.json').skills.concat(readJson('data/extended-skills.json').entries);
	const idsOf = (v) => ALL.filter((s) => ((s.tags && s.tags.environment) || []).includes(v)).map((s) => s.id);
	const SMALL = idsOf('small_track'), STRAIGHT = idsOf('straight_course');
	const COURSE = readJson('data/course-conditions.json');
	// レースの一覧から、条件に当たるレース・当たらないレース・指定が足りないレースを、データから選ぶ（レース名は書かない）
	const tracksOf = (key) => COURSE.conditions.find((c) => c.key === key).tracks;
	const hits = (key, r) => { const t = tracksOf(key).find((x) => x.venue === r.venue); return !!t && (!t.courses || t.courses.some((c) => c.surface === r.surface && c.distances.includes(r.distance))); };
	const full = (r) => !!(r.venue && r.surface && r.distance);
	const RACE_HIT = RACES.find((r) => full(r) && hits('small_track', r));
	const RACE_MISS = RACES.find((r) => full(r) && !hits('small_track', r) && !hits('straight_course', r));
	const RACE_PART = RACES.find((r) => !full(r) && r.surface);
	const CARDS6 = ['card-0248', 'card-0249', 'card-0250', 'card-0251', 'card-0252', 'card-0253'];
	const T = '#deck-template-panel ';

	const openSp = async (o = {}) => {
		const sp = await openPage(browser, base, 'special.html', { width: o.w || 375, height: o.h || 812 }, EMPTY);
		if (o.scheme) await sp.page.emulateMedia({ colorScheme: o.scheme });
		await sp.page.evaluate(({ roster, ids }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			if (ids) localStorage.setItem('umaSkillDeck:draftScope:special', JSON.stringify({ skillIds: ids })); else localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: Object.assign({ rosterId: 'r_c', name: '', umaId: 'uma-0001', star: 3, awakeningLevel: 5, cardIds: CARDS6 }, o.race ? { race: o.race } : {}), ids: o.ids || null });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForTimeout(400);
		return sp;
	};
	/** 緑スキルの一覧で、各 id の行が「レース条件に合わないため選べない」か（行が無ければ null） */
	const passiveState = async (page, ids) => {
		await pickEntry(page, 'editor-pick-passive');
		await page.waitForSelector('[data-usd-el="passive-results"] label.usd-row');
		const r = await page.evaluate((ids) => ids.map((id) => {
			const i = document.querySelector('[data-usd-el="passive-results"] input[value="' + id + '"]');
			if (!i) return null;
			const row = i.closest('label.usd-row');
			const why = (row.querySelector('[data-usd-el="excluded-reason"]') || {}).textContent || '';
			return { id, raceBlocked: why === 'レース条件不一致', disabled: i.disabled };
		}), ids);
		await page.click('[data-usd-act="picker-close"]');
		await page.waitForTimeout(200);
		return r;
	};

	await block('小回り直線 緑スキルの一覧: レースに合わない小回り・直線コースはグレーアウト（理由つき）／合うレース・未指定・指定が足りないレースでは選べる', async () => {
		assert(SMALL.length > 0 && STRAIGHT.length > 0 && RACE_HIT && RACE_MISS && RACE_PART, '小回り直線 前提: タグのスキルと、当たる／当たらない／指定が足りないレースをデータから選べる',
			{ SMALL, STRAIGHT, hit: RACE_HIT && RACE_HIT.id, miss: RACE_MISS && RACE_MISS.id, part: RACE_PART && RACE_PART.id });
		const ids = SMALL.concat(STRAIGHT);
		const cases = [
			{ race: RACE_MISS, want: { small: true, straight: true }, why: '当たらないレース（' + RACE_MISS.id + '）: どちらも選べない' },
			{ race: RACE_HIT, want: { small: false, straight: true }, why: '小回りに当たるレース（' + RACE_HIT.id + '）: 小回りは選べる・直線コースは選べない' },
			{ race: null, want: { small: false, straight: false }, why: 'レースが未指定: どちらも選べる' },
			{ race: RACE_PART, want: { small: false, straight: false }, why: '指定が足りないレース（' + RACE_PART.id + '）: 新しく外さない' }
		];
		for (const c of cases) {
			const sp = await openSp({ race: c.race });
			const st = await passiveState(sp.page, ids);
			// 一覧に出ない（◎は緑スキルの一覧に出ない拡張スキル）ものは見ない。出るものの中に、○が1つずつあること
			const shown = st.filter(Boolean);
			const bad = shown.filter((x) => x.raceBlocked !== (SMALL.includes(x.id) ? c.want.small : c.want.straight) || (x.raceBlocked && !x.disabled));
			assert(shown.some((x) => SMALL.includes(x.id)) && shown.some((x) => STRAIGHT.includes(x.id)) && bad.length === 0, '小回り直線 ' + c.why, { shown, bad });
			assert(jsErrors(sp.errors).length === 0, '小回り直線 コンソールのエラー0（' + (c.race ? c.race.id : '未指定') + '）', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});

	await block('小回り直線 説明の小窓: 「対象レース場: …」の1行（○と◎・新潟・中山の制限はそのまま）。360／375／390px × ライト／ダークで画面の内側／ほかのスキルには出ない', async () => {
		const want = {
			small_track: '対象レース場: 札幌・函館・福島・小倉・川崎・船橋・サンタアニタパーク・デルマー・新潟・中山（新潟は芝1200m・1400m・2000m・2200m・2400m、ダート1200m・1800m／中山は芝1800m・2000m・2500m・3600m、ダート1200m・1800m）',
			straight_course: '対象レース場: 新潟（芝1000m）'
		};
		const OTHER = ALL.find((s) => s.id === '1').id;   // 小回り・直線コースのタグを持たないスキル（マスターの先頭）
		const ids = SMALL.concat(STRAIGHT).concat([OTHER]);
		const bad = [];
		let n = 0;
		for (const w of [360, 375, 390]) {
			for (const scheme of ['light', 'dark']) {
				const sp = await openSp({ w, scheme, ids, race: null });
				for (const id of ids) {
					// ②因子周回 段2（2026-10-28）: ◎として数える行は名前とⓘが◎になるので、②のパネルの id（○のまま）から名前のボタンを引く
					const btn = await sp.page.$(T + '.usd-panel[data-skill-id="' + id + '"] .usd-panel-namebtn');
					if (!btn) { bad.push({ w, scheme, id, why: '名前のボタンが無い' }); continue; }
					await btn.scrollIntoViewIfNeeded();
					await btn.click();
					await sp.page.waitForSelector('.usd-info-pop:not([hidden])');
					await sp.page.waitForTimeout(150);
					const m = await sp.page.evaluate(() => {
						const pop = document.querySelector('.usd-info-pop');
						const c = pop.querySelector('[data-usd-el="info-course"]');
						const r = pop.getBoundingClientRect();
						const cr = c ? c.getBoundingClientRect() : null;
						return { text: c ? c.textContent : '', inside: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5,
							lineInside: !cr || (cr.left >= r.left - 0.5 && cr.right <= r.right + 0.5), color: c ? getComputedStyle(c).color : '', fs: c ? getComputedStyle(c).fontSize : '',
							pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
					});
					n++;
					const key = SMALL.includes(id) ? 'small_track' : STRAIGHT.includes(id) ? 'straight_course' : null;
					const expect = key ? want[key] : '';
					if (m.text !== expect || !m.inside || !m.lineInside || m.pageOverflow > 0) bad.push({ w, scheme, id, m });
					await sp.page.click('[data-usd-el="info-close"]');
					await sp.page.waitForTimeout(150);
				}
				if (jsErrors(sp.errors).length) bad.push({ w, scheme, errors: jsErrors(sp.errors).slice(0, 2) });
				await sp.ctx.close();
			}
		}
		assert(n === 30 && bad.length === 0, '小回り直線 小窓の1行（' + n + '回＝5スキル × 3幅 × ライト／ダーク）: 小回りの○◎は対象レース場と新潟・中山の制限、直線コースの○◎は「新潟（芝1000m）」、ほかのスキルには無い。小窓は画面の内側', bad.slice(0, 4));
	});

	/* ---- C-156: レースを選んだとき、小回り・直線コースのスキルを②へ自動で入れる（回り・季節と同じ仕組み） ---- */
	const PTR = new Map(readJson('data/skill-pt.json').entries.map((e) => [e.skillId, e.rarity]));
	const white = (id) => !PTR.has(id) || PTR.get(id) === 'white';
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	// 合成のレース（表の中身から作る。レース場の語・距離はデータから取る）
	const synRace = (id, v) => Object.assign({ id, name: 'syn ' + id, date: null, dateLabel: 'x', venue: null, surface: null, distance: null, distanceCategory: null, direction: null, course: null, season: null, weather: null, ground: null, time: null, rule: null }, v);
	const pickOf = (key, venueFilter) => { const t = tracksOf(key).find(venueFilter); return t; };
	const NAKA = tracksOf('small_track').find((t) => t.courses && t.courses.some((c) => c.surface === 'turf' && c.distances.length > 1));
	const NIIG = tracksOf('straight_course')[0];
	const SYN_RACES = [
		synRace('syn-hit-small', { venue: NAKA.venue, surface: 'turf', distance: NAKA.courses.find((c) => c.surface === 'turf').distances[0] }),
		synRace('syn-miss-small', { venue: 'track_kyoto', surface: 'turf', distance: 2200 }),
		synRace('syn-venue-only', { venue: NAKA.venue }),
		synRace('syn-dist-only', { distance: NAKA.courses.find((c) => c.surface === 'turf').distances[0] }),
		synRace('syn-hit-straight', { venue: NIIG.venue, surface: NIIG.courses[0].surface, distance: NIIG.courses[0].distances[0] })
	];
	await block('小回り直線 脚質オススメの「緑スキル（レース条件）」（C-156。2026-10-21 に自動追加から置き換え）: 当たるレースだけで小回り／直線コースが出る／3つそろわないレース・当たらないレースでは出ない／レースを選んでも②は変わらない', async () => {
		const sp = await openPage(browser, base, 'special.html', { width: 375, height: 812 }, EMPTY);
		await sp.page.route('**/data/upcoming-races.json*', (r) => r.fulfill(json({ dataVersion: 'syn', category: 'upcomingRace', note: 'x', races: SYN_RACES })));
		await sp.page.evaluate(({ roster }) => {
			localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
			localStorage.removeItem('umaSkillDeck:draftScope:special');
			localStorage.setItem('umaSkillDeck:stepTab', '1');
		}, { roster: { rosterId: 'r_c', name: '', umaId: 'uma-0001', star: 3, awakeningLevel: 5, cardIds: CARDS6 } });
		await reloadReady(sp.page);
		for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
		await sp.page.waitForSelector('#deck-set-bar [data-usd-el="setbar"]', { timeout: 10000 });
		await sp.page.waitForTimeout(300);
		const draftIds = () => sp.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('umaSkillDeck:draftScope:special') || 'null'); return d ? d.skillIds : []; });
		const pick = async (id) => {
			await sp.page.click('#hdr-race-slot [data-usd-act="set-race"]');
			await sp.page.waitForSelector('[data-usd-el="race-list"]');
			await sp.page.click('[data-usd-el="race-opt"][data-race-id="' + id + '"] input');
			await sp.page.waitForTimeout(500);
		};
		/** 脚質オススメの小窓を開いて、緑スキル（レース条件）の行の id を読む（閉じて返す） */
		const greenIds = async () => {
			await sp.page.click('#deck-template-panel [data-usd-el="style-open"]');
			await sp.page.waitForFunction(() => { const m = document.querySelector('[data-usd-el="style-modal"]'); return !!m && !m.hidden && m.querySelectorAll('[data-usd-el="style-row"]').length > 0; }, null, { timeout: 10000 });
			await sp.page.waitForTimeout(200);
			const ids = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="style-modal"] [data-section="green"] [data-usd-el="style-row"]')).map((r) => r.getAttribute('data-skill-id')));
			await sp.page.click('[data-usd-el="style-modal"] [data-usd-el="style-cancel"]');
			await sp.page.waitForTimeout(150);
			return ids;
		};
		const searchable = await sp.page.evaluate(() => UmaSkillDeckCore.getSearchableExtendedSkillIds());
		const ok = (id) => white(id) && (!id.startsWith('ex-') || searchable.includes(id));
		const small = SMALL.filter(ok), straight = STRAIGHT.filter(ok);
		assert(small.length > 0 && straight.length > 0, '小回り直線 前提: 緑スキルに出せる小回り・直線コースのスキルがある', { small, straight });
		const inc = (ids, want) => want.every((x) => ids.includes(x));
		const none = (ids, want) => want.every((x) => !ids.includes(x));
		await pick('syn-hit-small');
		let g = await greenIds();
		assert(inc(g, small) && none(g, straight), '小回り直線 当たるレース（小回り）: 小回りが出て、直線コースは出ない', { g, small, straight });
		assert((await draftIds()).length === 0, '小回り直線 レースを選んでも②は変わらない（自動追加は無い）', await draftIds());
		for (const [rid, label, expectSmall, expectStraight] of [
			['syn-miss-small', '当たらないレース（京都 芝2200m）', false, false],
			['syn-venue-only', 'レース場だけのレース', false, false],
			['syn-dist-only', '距離だけのレース', false, false],
			['syn-hit-straight', '新潟 芝1000m', false, true]
		]) {
			await pick(rid);
			g = await greenIds();
			assert((expectSmall ? inc(g, small) : none(g, small)) && (expectStraight ? inc(g, straight) : none(g, straight)), '小回り直線 ' + label + ': 小回り' + (expectSmall ? '○' : 'は出ない') + '／直線コース' + (expectStraight ? '○' : 'は出ない'), { g, small, straight });
		}
		await pick('');
		assert((await draftIds()).length === 0, '小回り直線 指定なしに戻しても②は変わらない', await draftIds());
		assert(jsErrors(sp.errors).length === 0, '小回り直線 コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
		await sp.ctx.close();
	});
}
