// UmaStar のタブの下の二重線（C-154・2026-10-14）の検査。run-smoke.mjs の末尾から register25() で呼ばれる
// （塊の見出しはすべて「二重線」で始まる。`npm run test:visual -- --only=二重線` で回せる）。
//
// 見るもの: ①②③のタブ・初期画面（ウマ娘・サポカが未選択）と選んだ画面・ライト／ダーク・360／375／390px と PC で、
//   (1) ステップのタブの区切り線（.step-tabs の下罫線）は残っている
//   (2) 選んでいるタブの下線は、その区切り線に重なっている（下端が同じ位置）
//   (3) 区切り線のすぐ下（24px 以内）に、幅の半分を超える別の横線が無い（①の空の上位層の下線が並んでいたのが二重線の正体）
// 衣装・カードは id で書く（恒久ルール1）。

export async function register25(env) {
	const { block, assert, browser, base, openPage } = env;
	const EMPTY = { schemaVersion: 7, records: [], customSkills: [], templates: [], rosters: [] };
	const PICKED = { rosterId: 'r_dl', name: '', umaId: 'uma-0009', star: 3, awakeningLevel: 5,
		cardIds: ['card-0546', 'card-0543', 'card-0295', 'card-0499', 'card-0427', 'card-0518'] };

	const measure = (page) => page.evaluate(() => {
		const st = document.querySelector('.step-tabs');
		const tb = st.getBoundingClientRect();
		const cs = getComputedStyle(st);
		const sel = document.querySelector('.step-tab[aria-selected="true"]');
		const sb = sel.getBoundingClientRect();
		const lines = [];
		for (const el of document.querySelectorAll('.main-card *')) {
			if (el.closest('.step-tabs')) continue;
			const r = el.getBoundingClientRect();
			if (!r.width || r.width < tb.width * 0.5) continue;
			const c = getComputedStyle(el);
			if (c.visibility === 'hidden') continue;
			for (const side of ['Top', 'Bottom']) {
				const wd = parseFloat(c['border' + side + 'Width']);
				const y = side === 'Top' ? r.top : r.bottom;
				if (wd > 0 && c['border' + side + 'Style'] !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(c['border' + side + 'Color']) && y > tb.bottom && y <= tb.bottom + 24)
					lines.push(String(el.className).split(' ')[0] + ' ' + side + '@' + Math.round(y - tb.bottom));
			}
		}
		return { sepW: parseFloat(cs.borderBottomWidth), sepStyle: cs.borderBottomStyle, selBottom: sb.bottom, tabsBottom: tb.bottom,
			selLine: parseFloat(getComputedStyle(sel).borderBottomWidth), lines, tab: sel.id };
	});

	await block('二重線 UmaStar のタブ: ①②③・初期画面／選んだ画面・ライト／ダーク・360／375／390px・PC で、タブの区切り線は1本（選んだタブの下線は区切り線に重なり、すぐ下に別の線が並ばない）', async () => {
		const bad = [];
		let n = 0;
		for (const scheme of ['light', 'dark']) {
			for (const w of [360, 375, 390, 1280]) {
				for (const state of ['empty', 'picked']) {
					const sp = await openPage(browser, base, 'special.html', { width: w, height: 900 }, EMPTY);
					await sp.page.emulateMedia({ colorScheme: scheme });
					await sp.page.evaluate(({ roster }) => {
						if (roster) localStorage.setItem('umaSkillDeck:draftRoster:special', JSON.stringify(roster));
						else localStorage.removeItem('umaSkillDeck:draftRoster:special');
						localStorage.setItem('umaSkillDeck:stepTab', '0');
					}, { roster: state === 'picked' ? PICKED : null });
					await sp.page.reload({ waitUntil: 'networkidle' });
					for (let i = 0; i < 2; i++) if (await sp.page.isVisible('#ui-notice')) await sp.page.click('[data-act="notice-ok"]');
					await sp.page.waitForTimeout(400);
					for (const k of [0, 1, 2]) {
						await sp.page.evaluate((x) => selectStepTab(x), k);
						await sp.page.waitForTimeout(150);
						const m = await measure(sp.page);
						n++;
						if (!(m.sepW >= 1 && m.sepStyle !== 'none' && m.selLine >= 1 && Math.abs(m.selBottom - m.tabsBottom) < 0.5 && m.lines.length === 0))
							bad.push(Object.assign({ scheme, w, state, k: k + 1 }, m));
					}
					await sp.ctx.close();
				}
			}
		}
		assert(n === 48 && bad.length === 0, '二重線 48通り（ライト／ダーク × 4幅 × 未選択／選択 × ①②③）すべてで、区切り線が残り・選んだタブの下線が重なり・すぐ下に別の線が無い', { n, bad: bad.slice(0, 4) });
	});

	await block('二重線 上位層に中身があるとき（Deck 単体の編成のタブ）は、上位層の下線をそのまま出す', async () => {
		const sp = await openPage(browser, base, 'uma-skill-deck.html', { width: 390, height: 900 }, EMPTY);
		const r = await sp.page.evaluate(() => {
			const t = document.querySelector('.usd-roster-top');
			if (!t) return { none: true };
			return { empty: t.children.length === 0, display: getComputedStyle(t).display, bw: parseFloat(getComputedStyle(t).borderBottomWidth) };
		});
		// Deck の画面に編成パネルが無い構成なら、special の上位層に赤字の知らせを入れて確かめる
		if (r.none) {
			const sp2 = await openPage(browser, base, 'special.html', { width: 390, height: 900 }, EMPTY);
			await sp2.page.evaluate(() => localStorage.setItem('umaSkillDeck:stepTab', '0'));
			await sp2.page.reload({ waitUntil: 'networkidle' });
			const r2 = await sp2.page.evaluate(() => {
				const t = document.querySelector('.usd-roster-top');
				const hidden = getComputedStyle(t).display === 'none';
				t.innerHTML = '<p class="usd-roster-alert">x</p>';
				return { hiddenWhenEmpty: hidden, shownWithContent: getComputedStyle(t).display !== 'none', bw: parseFloat(getComputedStyle(t).borderBottomWidth) };
			});
			assert(r2.hiddenWhenEmpty && r2.shownWithContent && r2.bw >= 1, '二重線 上位層は空なら出さず、中身があれば下線つきで出す', r2);
			await sp2.ctx.close();
		} else {
			assert(!r.empty && r.display !== 'none' && r.bw >= 1, '二重線 Deck 単体の上位層（編成のタブ）は下線つきで出る（変えていない）', r);
		}
		await sp.ctx.close();
	});
}
