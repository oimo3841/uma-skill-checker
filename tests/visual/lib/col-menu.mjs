// ①の表の列見出しのクリック（C-187）。サポカの6列は、種別アイコンを押してメニューを開き、その中の「イベントを選ぶ」「並べ替え」を押す。
// 育成ウマ娘・シナリオの列は、今までどおり見出しのボタンを直接押す（key が card のときだけメニュー経由）。
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
