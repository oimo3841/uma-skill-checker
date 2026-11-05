// 動画の取り込みを始める（T106）。
// ③のタブの行の右端の「静止画｜動画」で動画モードにして、いま見ているセット（タブ）の「動画を選ぶ」を押す。押すとすぐファイルの選択が開く（小窓は T106 で無くした）。
// 戻り値: Playwright の FileChooser（開かなかったら null）
export async function pickVideo(page) {
	if (await page.evaluate(() => document.body.getAttribute('data-upload-mode') !== 'video')) await page.click('[data-upload-mode-btn="video"]');
	const sel = await videoPickSelector(page);
	const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click(sel)]);
	return chooser;
}

/** いま見ているセットの「動画を選ぶ」のセレクタ */
export function videoPickSelector(page) {
	return page.evaluate(() => '#personset-' + PERSON_SETS[activePersonSet].id + '-wrap .video-pick-btn');
}
