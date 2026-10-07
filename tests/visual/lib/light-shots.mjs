/* ============================================================
 * 「ライトは1ピクセルも変わらない」を確かめるためのフルページPNG（C-134・決定12）
 *
 * special（①②③）・exam・Deck を 375px と 1280px で、引き出しを開いた場面も含めて撮る。
 * 基準は output/dark-base/base/（.gitignore 済み）。変更の前の commit の作業ツリーから同じ関数で撮り、
 * 変更の後と**バイト比較**する（描画が決定的なので足りる。2回撮って全部一致することを確かめてある）。
 *
 * 版の文字列（2026-10-08a など）は画面に出る箇所があるので、撮る前に固定の文字へ置き換える
 * （版を上げただけで画素が変わるのを除く。引き出しの iframe の中も同じ）。
 * ============================================================ */

export const LIGHT_SCENES = (() => {
	const out = [];
	for (const w of [375, 1280]) {
		for (const tab of ['0', '1', '2']) out.push({ name: `special-${w}-tab${tab}`, file: 'special.html', w, tab });
		out.push({ name: `exam-${w}`, file: 'exam.html', w });
		out.push({ name: `deck-${w}`, file: 'uma-skill-deck.html', w });
	}
	out.push({ name: 'special-375-deckdrawer', file: 'special.html', w: 375, tab: '1', act: 'deck', viewportOnly: true });
	out.push({ name: 'exam-375-deckdrawer', file: 'exam.html', w: 375, act: 'deck', viewportOnly: true });
	out.push({ name: 'special-1280-deckdrawer', file: 'special.html', w: 1280, tab: '1', act: 'deck', viewportOnly: true });
	// exam の結果の表（親A・親Bの人物色・★合計の列。JS がインラインの style で色を当てる）
	out.push({ name: 'exam-375-results', file: 'exam.html', w: 375, act: 'examResults', viewportOnly: true });
	out.push({ name: 'exam-1280-results', file: 'exam.html', w: 1280, act: 'examResults', viewportOnly: true });
	return out;
})();

/** 1場面を撮って PNG のバイト列を返す。theme は 'light'（鍵を書かない）／'dark'。 */
export async function captureScene(browser, base, s, userData, theme = 'light') {
	const ctx = await browser.newContext({ viewport: { width: s.w, height: 800 } });
	const page = await ctx.newPage();
	await page.addInitScript(({ d, tab, theme }) => {
		try {
			if (!sessionStorage.getItem('__fx')) {
				sessionStorage.setItem('__fx', '1');
				localStorage.setItem('umaSkillDeck:userData', JSON.stringify(d));
				if (tab) localStorage.setItem('umaSkillDeck:stepTab', tab);
				if (theme !== 'light') localStorage.setItem('uma-tools-theme', theme);
			}
		} catch (e) {}
	}, { d: userData, tab: s.tab || null, theme });
	await page.route('**/data/scenario-event-skills.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8',
		body: JSON.stringify({ dataVersion: '2026-10-03a', category: 'scenarioEventSkills', note: 'test', entries: [] }) }));
	await page.goto(base + '/' + s.file, { waitUntil: 'networkidle', timeout: 60000 });
	await page.waitForFunction(() => document.readyState === 'complete' && (!document.querySelector('script[src*="tailwindcss-browser"]') || document.documentElement.classList.contains('uma-tw-ready')), null, { timeout: 15000 });
	await page.waitForTimeout(1500);
	for (const sel of ['[data-act="notice-ok"]', '#ui-notice-ok']) if (await page.isVisible(sel).catch(() => false)) { await page.click(sel); await page.waitForTimeout(400); }
	if (s.act === 'deck') { await page.evaluate(() => fabGoTo('deck')); await page.waitForTimeout(2500); }
	if (s.act === 'examResults') {
		await page.evaluate(() => {
			const mk = (names, offset) => matchAllSkillsWithStars(names.map((n, i) => ({ text: n, stars: ((i + offset) % 3) + 1, starsReliable: i !== 4, rowKey: 'r' + i })), skillList, skillIndex, {});
			personResults = PERSON_LABELS.map(() => null);
			personResults[0] = mk(skillList, 0);
			personResults[3] = mk(skillList.slice(0, 20), 1);
			renderResults();
			fabGoTo('result');
		});
		await page.waitForTimeout(800);
		await page.evaluate(() => { const t = document.querySelector('#result-drawer .result-table'); if (t) t.scrollIntoView({ block: 'start' }); });
		await page.waitForTimeout(1500);
	}
	await page.evaluate(() => {
		const re = /20\d\d-\d\d-\d\d[a-z]/g;
		const docs = [document];
		document.querySelectorAll('iframe').forEach((f) => { try { if (f.contentDocument && f.contentDocument.body) docs.push(f.contentDocument); } catch (e) {} });
		for (const d of docs) {
			const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
			for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(re, 'VER');
		}
	});
	await page.mouse.move(0, 0);
	const buf = await page.screenshot({ fullPage: !s.viewportOnly, animations: 'disabled', caret: 'hide' });
	await ctx.close();
	return buf;
}
