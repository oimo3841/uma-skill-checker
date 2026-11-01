// スキル名の列見出しの並べ替え（T52・C-262 の (5)(6)）。4つのアイコン（回復・◎・緑・デバフ）と漏斗1つの範囲全体が入口で、押すと小窓
// 「回復／◎／緑／デバフでソート」「ソートしない」から1つを選ぶ（それまでは4つの漏斗のボタン data-usd-act="sort-tone" を押していた。文言は T58 で「ソート」に）。
// scope は '#deck-roster-panel ' のような接頭辞（末尾に空白）。tone は 'heal'・'circle'・'passive'・'debuff'、null／'' は「ソートしない」

export const TONE_ENTRY = '[data-usd-el="tone-sort-entry"]';

/** 入口を押して小窓を開き、tone を選ぶ（小窓は閉じ、表が描き直される） */
export async function pickToneSort(page, scope, tone) {
	await page.click(scope + TONE_ENTRY);
	await page.waitForTimeout(120);
	await page.click('[data-usd-el="info-pop"] [data-usd-el="tone-sort-pick"][data-tone="' + (tone || '') + '"]');
	await page.waitForTimeout(200);
}

/** 列見出しの4つの種類の状態: [{ tone, on }]（on＝その種類で並べている印のあるアイコン） */
export function toneStates(page, scope) {
	return page.evaluate((sc) => {
		const gh = document.querySelector(sc + '.usd-roster-gh--skill');
		if (!gh) return [];
		return Array.from(gh.querySelectorAll('.usd-roster-tone')).map((t) => ({ tone: t.getAttribute('data-tone'),
			on: !!t.querySelector('.usd-roster-toneicon--on') }));
	}, scope);
}
