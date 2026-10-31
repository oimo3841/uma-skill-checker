// ②の合計の行の「X種」「LvX」（T52・C-262 の (2)。押すたびに1つ増え、最大の次は最小に戻るボタン）を、指定の値にする。
// それまでの select の selectOption の代わり。el は data-usd-el（uniq-count・uniq-level・pt-parent-level）。scope は '#deck-template-panel ' のような接頭辞（末尾に空白）。
// 押すたびに描き直されるので、毎回ボタンを探し直す。値は data-value（数）で見る。最大6回押しても当たらなければ例外

export async function setBandStep(page, scope, el, value) {
	const sel = scope + '[data-usd-el="set-head"] [data-usd-el="' + el + '"]';
	for (let i = 0; i < 7; i++) {
		const cur = await page.getAttribute(sel, 'data-value');
		if (Number(cur) === Number(value)) return;
		await page.click(sel);
		await page.waitForTimeout(80);
	}
	throw new Error('setBandStep: ' + el + ' を ' + value + ' にできない');
}

/** 今の値（数）。部品が無ければ null */
export async function bandStepValue(page, scope, el) {
	const v = await page.getAttribute(scope + '[data-usd-el="set-head"] [data-usd-el="' + el + '"]', 'data-value').catch(() => null);
	return v === null ? null : Number(v);
}
