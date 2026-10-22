// ②への追加の知らせ（段F1・C-190。消えない・×つき・role=status）の読み取り。
// 出ていなければ null。出ていれば { visible, text, role, label, w, h, box } を返す（label・w・h は×のボタンの aria-label と押せる範囲）。

/** 知らせの状態を読む */
export const noticeOf = (page) => page.evaluate(() => {
	const el = document.querySelector('[data-usd-el="add-notice"]');
	if (!el) return null;
	const x = el.querySelector('[data-usd-el="add-notice-close"]');
	const xr = x ? x.getBoundingClientRect() : null;
	const rc = el.getBoundingClientRect();
	const t = el.querySelector('[data-usd-el="add-notice-text"]');
	return {
		visible: !el.hidden && getComputedStyle(el).display !== 'none' && rc.width > 0 && rc.height > 0,
		text: t ? t.textContent : null, role: el.getAttribute('role'), label: x ? x.getAttribute('aria-label') : null,
		w: xr ? Math.round(xr.width) : null, h: xr ? Math.round(xr.height) : null,
		box: { l: rc.left, r: rc.right, t: rc.top, b: rc.bottom }, vw: window.innerWidth, vh: window.innerHeight
	};
});

/** 出ている知らせの文（出ていなければ null） */
export const noticeText = async (page) => { const n = await noticeOf(page); return n && n.visible ? n.text : null; };
