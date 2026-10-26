// ①の表の列見出しのクリック（C-187）。列のアイコンを押してメニューを開き、その中の「イベント/スキル」「ソート」を押す。
// 2026-10-26 から育成ウマ娘・シナリオの列もサポカと同じメニュー。メニューのボタンが無いとき（古い作りの写し）だけ、見出しのボタンを直接押す。
// scope は '#deck-roster-panel ' のような接頭辞（末尾に空白）

/** 列見出しのイベントのボタンを押した結果（イベントの小窓が開く）にする */
export async function clickEvents(page, scope, key) {
	const btn = await page.$(scope + '[data-usd-el="col-menu-btn"][data-member-key="' + key + '"]');
	if (btn) {
		await btn.click();
		await page.click('[data-usd-el="colmenu-events"]');
		return;
	}
	await page.click(scope + '[data-usd-act="events"][data-member-key="' + key + '"]');
}

/** 列見出しの並べ替え（じょうご）を押した結果にする */
export async function clickSort(page, scope, key) {
	const btn = await page.$(scope + '[data-usd-el="col-menu-btn"][data-member-key="' + key + '"]');
	if (btn) {
		await btn.click();
		await page.click('[data-usd-el="colmenu-sort"]');
		return;
	}
	await page.click(scope + '[data-usd-el="sort-btn"][data-member-key="' + key + '"]');
}
