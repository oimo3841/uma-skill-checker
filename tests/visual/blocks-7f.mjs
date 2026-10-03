// 段7f（2026-10-03・C-119）の検査。run-smoke.mjs の末尾から register7f() で呼ばれる（塊の見出しは「段7f」を含む。
// `npm run test:visual -- --only=段7f` で回せる）。
//
// シナリオ『トレセン軒』の確定で得られるスキル（イベント3）に、時中の妙（ex-0616・Lv1）と極上の感謝を！（ex-0698・Lv2）が入ったこと。
// 実データ（scenario-event-skills・skill-pt・skill-step-up）をそのまま読む。カードのイベントは空にして、出どころがシナリオだけになるようにする。
export async function register7f(env) {
	const { block, assert, browser, base, openPage, fs, path, REPO_ROOT, USER_DATA } = env;
	const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
	const json = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
	const cardsAll = readJson('data/support-cards.json').entries;
	const master = readJson('uma-skill-deck-skills.json').skills;
	const ext = readJson('data/extended-skills.json').entries;
	const rules = readJson('data/skill-pt-rules.json');
	const ptReal = readJson('data/skill-pt.json');
	const stepReal = readJson('data/skill-step-up.json');
	const scenReal = readJson('data/scenario-event-skills.json');
	const nameOf = (id) => (master.find((s) => s.id === id) || ext.find((s) => s.id === id) || {}).name;
	const DISC = rules.hintDiscountPercent;
	const pay = (base0, L) => Math.floor(base0 * (100 - (L > 0 ? DISC[Math.min(L, DISC.length) - 1] : 0)) / 100);
	const jsErrors = (errors) => errors.filter((m) => !/Failed to load resource|status of 404|status of 500/.test(m));
	const pt = new Map(ptReal.entries.map((e) => [e.skillId, e]));
	const step = new Map(stepReal.entries.map((e) => [e.skillId, e.prevSkillIds]));
	const ev3 = scenReal.entries[0].events.find((e) => e.type === 'fixed');
	const NEW = [{ skillId: 'ex-0616', name: '時中の妙', hintLevel: 1 }, { skillId: 'ex-0698', name: '極上の感謝を！', hintLevel: 2 }];

	await block('段7f シナリオ『トレセン軒』の確定のスキルに時中の妙・極上の感謝を！', async () => {
		/* ---- データ ---- */
		for (const n of NEW) {
			const row = ev3.skills.find((s) => s.skillId === n.skillId);
			assert(row && row.hintLevel === n.hintLevel && nameOf(n.skillId) === n.name, '段7f データ: イベント3に ' + n.name + '（' + n.skillId + '）が Lv' + n.hintLevel + ' で入っている', row);
			assert(ev3.skills.filter((s) => s.skillId === n.skillId).length === 1, n.name + ' は1回だけ');
			assert(pt.get(n.skillId) && pt.get(n.skillId).rarity === 'gold', n.name + ' は金スキル（skill-pt.json の rarity）', pt.get(n.skillId));
			assert(Object.keys(row).sort().join() === 'hintLevel,skillId', n.name + ' の行は他の確定のスキルと同じ形（skillId と hintLevel だけ。時期は持たない）', Object.keys(row));
		}
		assert(scenReal.dataVersion >= '2026-10-03c', 'dataVersion は 2026-10-03c 以降', scenReal.dataVersion);
		const raw = fs.readFileSync(path.join(REPO_ROOT, 'data/scenario-event-skills.json'), 'utf8');
		assert(!raw.includes('時中の砂'), '誤記の「時中の砂」はデータのどこにも無い');
		const allIds = scenReal.entries.flatMap((en) => en.events.flatMap((e) => (e.choices ? e.choices.flatMap((c) => [].concat(c.linked || [], c.unlinked || [], c.skills || [])) : e.skills))).map((r) => r.skillId);
		assert(allIds.length === new Set(allIds).size, '登録するスキルに重複が無い（シナリオ全体）');

		/* ---- 画面（実データ）: 編成にだれがいても、この2件は確定（●）としてシナリオの列（7列目）に出る ---- */
		const emptyEv = { dataVersion: '2026-10-03a', category: 'supportCardEventSkill', entries: [] };
		const emptyChar = { dataVersion: '2026-09-30a', category: 'characterEventSkill', entries: [] };
		const cardOf = (chara) => cardsAll.filter((c) => c.charaName === chara).pop();
		const cases = [{ label: 'メイショウドトウ', card: cardOf('メイショウドトウ') }, { label: '駿川たづな', card: cardOf('駿川たづな') }];
		assert(cases.every((c) => c.card), '前提: 検査に使うカードがある');
		const fixedIds = ev3.skills.map((s) => s.skillId);
		for (const w of [375, 1280]) for (const cs of cases) {
			const tag = '段7f ' + w + 'px・' + cs.label + ': ';
			const sp = await openPage(browser, base, 'special.html', { width: w, height: w === 375 ? 812 : 900 }, USER_DATA);
			await sp.page.route('**/data/support-card-event-skills.json*', (r) => r.fulfill(json(emptyEv)));
			await sp.page.route('**/data/character-event-skills.json*', (r) => r.fulfill(json(emptyChar)));
			await sp.page.route('**/data/scenario-event-skills.json*', (r) => r.fulfill(json(scenReal)));   // openPage の既定は空のファイル。実データに差し替える
			await sp.page.evaluate(({ card }) => {
				localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify({ umaId: '', cardIds: [card, null, null, null, null, null] }));
				localStorage.removeItem('umaSkillDeck:draftScope:special');
			}, { card: cs.card.id });
			await sp.page.reload({ waitUntil: 'networkidle' });
			for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
			await sp.page.evaluate(() => selectStepTab(0, { noSave: true }));
			await sp.page.waitForSelector('#deck-roster-panel [data-usd-el="pt-sum"]', { timeout: 10000 }).catch(() => {});
			await sp.page.waitForTimeout(250);
			const v = await sp.page.evaluate(() => {
				const h = document.getElementById('deck-roster-panel');
				const rows = Array.from(h.querySelectorAll('.usd-roster-grow[data-skill-id]')).map((r) => {
					const cells = Array.from(r.querySelectorAll('[role="cell"]'));
					return { id: r.getAttribute('data-skill-id'), pt: (r.querySelector('.usd-roster-pt') || {}).textContent || null, last: cells.length ? (cells[cells.length - 1].querySelector('.usd-roster-got') ? '●' : cells[cells.length - 1].querySelector('.usd-roster-maybe') ? '△' : '') : null,
						anyGot: !!r.querySelector('.usd-roster-got') };
				});
				const t = (i) => { const e = h.querySelector('[data-usd-el="' + i + '"]'); return e ? e.textContent.trim() : null; };
				return { rows, count: Number((t('pt-count') || '').replace(/[^0-9]/g, '')), sw: document.documentElement.scrollWidth, iw: innerWidth };
			});
			for (const n of NEW) {
				const r = v.rows.find((x) => x.id === n.skillId);
				assert(r && r.last === '●', tag + n.name + ' はシナリオの列に ● で出る', r);
				assert(r.pt === pay(pt.get(n.skillId).pt, n.hintLevel) + ' Pt', tag + n.name + ' の Pt は基礎 ' + pt.get(n.skillId).pt + ' ×（1−Lv' + n.hintLevel + 'の割引）', { got: r.pt, want: pay(pt.get(n.skillId).pt, n.hintLevel) });
			}
			assert(fixedIds.every((id) => (v.rows.find((x) => x.id === id) || {}).last === '●'), tag + '確定の6件がすべてシナリオの列に ● で出る', fixedIds.map((id) => (v.rows.find((x) => x.id === id) || {}).last));
			// 種数: 金スキルと、その前段の白スキルがともに表にあれば1種（⑫）。独立に数えて合わせる
			const got = new Set(v.rows.filter((r) => r.anyGot).map((r) => r.id));
			let kinds = 0;
			got.forEach((id) => {
				const p = pt.get(id);
				if (p && p.rarity !== 'gold') { const goldOver = Array.from(got).some((g) => pt.get(g) && pt.get(g).rarity === 'gold' && (step.get(g) || []).includes(id)); if (goldOver) return; }
				kinds++;
			});
			assert(v.count === kinds, tag + '種数は「金スキルとその前段の白スキルを1種」と数えた値に合う（前段が表にある2組は各1種）', { shown: v.count, want: kinds });
			assert(v.sw <= v.iw, tag + '横にはみ出さない', { sw: v.sw, iw: v.iw });
			// 小窓: 「確定で得られるスキル」に6件（Lv つき）
			await sp.page.click('#deck-roster-panel button[data-usd-act="events"][data-member-key="scenario"]');
			await sp.page.waitForTimeout(300);
			const fx = await sp.page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="info-pop"] [data-usd-el="event-fixed"] [data-usd-el="event-fixed-skill"]')).map((s) => s.textContent.replace(/\s+/g, ' ').trim()));
			assert(fx.length === 6 && fx.some((t) => t.includes('時中の妙') && t.includes('Lv1')) && fx.some((t) => t.includes('極上の感謝を！') && t.includes('Lv2')),
				tag + '小窓の「確定で得られるスキル」に 時中の妙 Lv1・極上の感謝を！ Lv2 が入る（計6件）', fx);
			assert(jsErrors(sp.errors).length === 0, tag + 'コンソールのエラー0', jsErrors(sp.errors).slice(0, 3));
			await sp.ctx.close();
		}
	});
}
