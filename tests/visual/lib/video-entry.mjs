// 動画の取り込みの小窓を開く（T98・C-285）。
// T98 から、③のタブの行の右端のボタン（#video-import-btn）は「動画モード」との切り替えになり、
// 小窓は動画モードのときにセットの中に出る「動画を選ぶ」（.video-pick-btn）から開く。
// 動画モードでなければ入口のボタンを押して動画モードにしてから、いま見ているセット（タブ）の「動画を選ぶ」を押す。
export async function openVideoSheet(page) {
	if (await page.evaluate(() => document.body.getAttribute('data-upload-mode') !== 'video')) await page.click('#video-import-btn');
	const sel = await page.evaluate(() => '#personset-' + PERSON_SETS[activePersonSet].id + '-wrap .video-pick-btn');
	await page.click(sel);
}

/** いま見ているセットの「動画を選ぶ」のセレクタ */
export function videoPickSelector(page) {
	return page.evaluate(() => '#personset-' + PERSON_SETS[activePersonSet].id + '-wrap .video-pick-btn');
}
