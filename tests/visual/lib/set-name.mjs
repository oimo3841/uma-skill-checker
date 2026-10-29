// special の編成セットの名前の入力（C-235）。帯の ✎ をやめ、セット名を押して開く「編成セット」の小窓の中で入力する。
//   無題（新規）を選んでいるとき …「名前を付けてセットを保存」→ 入力欄・キャンセル・保存
//   保存済みを選んでいるとき     …「セット名を変更」→ 同じ囲み（今の名前が入っている）
// Enter＝保存。Esc とキャンセルは入力の部分だけを閉じる（小窓は開いたまま）。

export const SET_NAME_INPUT = '[data-usd-el="set-name-input"]';

/** セット名を押して小窓を開き、入力の囲みを開く（入力欄に focus が入る）。how は 'click'（既定）か 'tap' */
export async function openSetNameEdit(page, how = 'click') {
	const act = (sel) => (how === 'tap' ? page.tap(sel) : page.click(sel));
	await act('#deck-set-bar [data-usd-el="set-name"]');
	const save = await page.$('[data-usd-el="info-body"] [data-usd-el="set-save-open"]');
	await act(save ? '[data-usd-el="set-save-open"]' : '[data-usd-el="set-rename-open"]');
}

/** 今のセットに名前を付けて保存する（無題なら新しいセット、保存済みなら名前の変更）。Enter で確定する */
export async function saveSetName(page, name) {
	await openSetNameEdit(page);
	await page.fill(SET_NAME_INPUT, name);
	await page.keyboard.press('Enter');
}
