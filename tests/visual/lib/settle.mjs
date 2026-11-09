// 操作のあとの「整った」を条件で待つ部品（2026-11-09・T148。検査の速度 (d)③〔C-233 の 4〕）。
//
// それまでの page.waitForTimeout(N)（押したあと・開いたあとの固定の待ち）の置き換え。次の条件がそろって2フレーム続くまで待つ:
//   (1) 通信中の fetch／XHR が0（lib/page-ready.mjs の仕込み window.__pwReady。仕込みの無い page では見ない）
//   (2) DOM が quietMs（既定 50ms）変わっていない（同じ仕込みの MutationObserver の最後の変化の時刻）
//   (3) 動いている有限のアニメーション・トランジションが無い（document.getAnimations()。無限に回るものは数えない）
//   (4) ページのスクロールの位置が前のフレームから動いていない
//   (5) 字体の読み込みが済んでいる（document.fonts.status）
// 上限（timeout）までにそろわなければ、例外にせず先へ進む（後の assert がそのときの状態で判定する。期待は変えない）。
// 「一定の時間なにも起きない」ことを確かめる待ち（長押しで開かない など）は、条件にできないので固定の待ちのまま使う。

let seq = 0;
export async function settle(page, { quietMs = 50, timeout = 5000 } = {}) {
	await page.waitForFunction(({ quietMs, id }) => {
		const st = window.__pwReady;
		let ok = true;
		if (st) {
			ok = st.inflight === 0 && performance.now() - (st.lastMut || 0) >= quietMs;
		}
		if (ok && document.fonts && document.fonts.status !== 'loaded') ok = false;
		if (ok && typeof document.getAnimations === 'function') {
			for (const a of document.getAnimations()) {
				if (a.playState !== 'running') continue;
				const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
				if (t && t.iterations === Infinity) continue;
				ok = false;
				break;
			}
		}
		const f = window.__pwSettle && window.__pwSettle.id === id ? window.__pwSettle : (window.__pwSettle = { id, n: 0, x: NaN, y: NaN });
		// (4) ページのスクロールの位置が前のフレームと同じ（なめらかなスクロール・位置の補正の途中で読まない）
		if (f.x !== scrollX || f.y !== scrollY) ok = false;
		f.x = scrollX; f.y = scrollY;
		f.n = ok ? f.n + 1 : 0;
		return f.n >= 2;
	}, { quietMs, id: ++seq }, { timeout, polling: 'raf' }).catch(() => {});
}
