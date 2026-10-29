// special の②の4つの入口（条件で検索・緑スキル・テキストで検索・スクショで追加）を押す（C-235）。
// 入口は行に無く、入口の行の右端の虫眼鏡（data-usd-act="entry-search"）を押して開く小窓に縦に並ぶ。
// 1つを押すと小窓が閉じて、今までと同じ画面（検索の一覧・テキストの入力・スクショの小窓）が開く。

export const ENTRY_SEARCH_BTN = '#deck-template-panel [data-usd-act="entry-search"]';
/** 小窓の中の入口（act は editor-pick / editor-pick-passive / editor-pick-text / editor-pick-screenshot） */
export const entryItem = (act) => '[data-usd-el="entry-search-list"] [data-usd-act="' + act + '"]';

/** 虫眼鏡 → 小窓の入口。how は 'click'（既定）か 'tap' */
export async function pickEntry(page, act, how = 'click') {
	if (how === 'tap') {
		await page.tap(ENTRY_SEARCH_BTN);
		await page.tap(entryItem(act));
		return;
	}
	await page.click(ENTRY_SEARCH_BTN);
	await page.click(entryItem(act));
}

/** 虫眼鏡の小窓を開いて、入口のボタンの情報（並び・名前・アイコン・件数のバッジ）を読み、小窓を閉じる */
export async function readEntryItems(page) {
	await page.click(ENTRY_SEARCH_BTN);
	const items = await page.evaluate(() => Array.from(document.querySelectorAll('[data-usd-el="entry-search-list"] > button')).map((b) => {
		const i = b.querySelector('[data-lucide], svg[data-lucide], svg.lucide');
		const badge = b.querySelector('[data-usd-el="passive-added"]');
		return { act: b.getAttribute('data-usd-act'), text: b.textContent.trim(), icon: i ? (i.getAttribute('data-lucide') || (i.getAttribute('class') || '')) : null,
			badge: badge ? { hidden: badge.hidden, text: badge.textContent } : null };
	}));
	await page.keyboard.press('Escape');
	return items;
}
