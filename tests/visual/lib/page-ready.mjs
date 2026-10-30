// ページの読み込み・再読み込みを「整った」条件で待つ共通の部品（2026-10-30・検査の速度 打ち手②a／②b）。
//
// それまでは openPage の goto と各塊の reload が waitUntil: 'networkidle'（通信が 500ms 途切れるまで待つ）で、
// 読み込みのたびに load のあと 0.4〜0.7秒待っていた（dev-speed-step0-report-20261029.md の (2)）。
// ここでは load のあと、次の条件がそろって2フレーム続くまで待つ:
//   (1) document.readyState が complete
//   (2) 通信中の fetch／XHR が0（本文を読み終えるまでを通信中と数える。下の READY_PROBE）
//   (3) 文書の画像がすべて読み終わっている（img.complete）
//   (4) Tailwind を読むページは、生成が済んだ印（html.uma-tw-ready）がある
// そのうえで、ページごとの条件（PAGE_RULES）と、お知らせの「出る・出ないが決まる」（lib/notice.mjs）を待つ。
// openPage の最後にあった固定の 200ms は無くした（②b）。
//
// 待つ側（waitPageReady）は、どの塊の page でも使える。fetch の数え方は読み込みの前に仕込む必要があるので、
// openPage と run-smoke.mjs の browser.newContext（どの context にも）で installReadyProbe を呼ぶ。
// 仕込まれていない page で reloadReady を呼んだときは、その場で仕込んでから再読み込みする（init script は次の読み込みから効く）。
import { waitNoticeSettled } from './notice.mjs';

/** ページの中で動く仕込み（読み込みの前に addInitScript で入れる）。2回入れても1回分だけ効く。 */
function READY_PROBE() {
	if (window.__pwReady) return;
	const st = window.__pwReady = { inflight: 0, frames: 0, lastMut: 0 };
	const done = () => { st.inflight = Math.max(0, st.inflight - 1); };
	const of = window.fetch;
	if (typeof of === 'function') {
		window.fetch = function () {
			st.inflight++;
			let p;
			try { p = of.apply(this, arguments); } catch (e) { done(); throw e; }
			// ヘッダーが届いた時点ではまだ本文を読んでいる。写しの本文を読み終えるまでを「通信中」と数える
			Promise.resolve(p).then((r) => (r && typeof r.clone === 'function' ? r.clone().arrayBuffer() : null)).catch(() => {}).then(done);
			return p;
		};
	}
	const X = window.XMLHttpRequest;
	if (typeof X === 'function') {
		const send = X.prototype.send;
		X.prototype.send = function () {
			st.inflight++;
			let counted = true;
			const fin = () => { if (counted) { counted = false; done(); } };
			this.addEventListener('loadend', fin);
			try { return send.apply(this, arguments); } catch (e) { fin(); throw e; }
		};
	}
	// 最後に DOM が変わった時刻（ページごとの条件「DOM が Q ms 変わらない」に使う）
	try {
		new MutationObserver(() => { st.lastMut = performance.now(); })
			.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
	} catch (e) { /* 観察できなくても、ほかの条件で待つ */ }
}

const installed = new WeakSet();
/** page か context に仕込みを入れる（読み込みの前に呼ぶ。同じものに2回入れない） */
export async function installReadyProbe(target) {
	if (installed.has(target)) return;
	installed.add(target);
	await target.addInitScript(READY_PROBE);
}

/**
 * ページごとの条件（URL のファイル名で引く）。quietMs: load のあと、DOM がこの時間（ms）変わらないこと。
 * 決めた理由は dev-speed-wait-report-20261030.md の「ページごとの整った条件」。実測（各ページ・整ったあと 1500ms の DOM の変化）:
 * 無負荷 12回・busy 24本 8回・busy 72本 8回のいずれも、4ページとも変化0回。Step 0 で Deck が後から変わったのは、
 * fetch をヘッダーが届いた時点で「終わり」と数えていたためと見る（本文を読み終えるまで数えると、Deck でも 0/8）。
 * Deck は Step 0 で後から変わった実績があるので、念のため「DOM が 100ms 変わらない」も足す（変化が無ければほぼ待たない）。
 */
export const PAGE_RULES = {
	'special.html': { quietMs: 0 },
	'exam.html': { quietMs: 0 },
	'uma-skill-deck.html': { quietMs: 100 },
	'card-event-input.html': { quietMs: 0 },
};
function ruleFor(url) {
	const m = /\/([^/?#]+\.html)(?:[?#]|$)/.exec(url || '');
	return (m && PAGE_RULES[m[1]]) || { quietMs: 0 };
}

/**
 * 読み込み（load まで済んだあと）から「整った」までを待つ。
 * @param {import('playwright').Page} page
 * @param {{ timeout?: number, notice?: boolean }} [opts] notice: お知らせの「出る・出ないが決まる」も待つ（既定 true）
 */
export async function waitPageReady(page, { timeout = 15000, notice = true } = {}) {
	const rule = ruleFor(page.url());
	await page.waitForFunction((quietMs) => {
		const st = window.__pwReady;
		let ok = document.readyState === 'complete';
		if (ok) {
			const needsTw = !!document.querySelector('script[src*="tailwindcss-browser"]');
			ok = !needsTw || document.documentElement.classList.contains('uma-tw-ready');
		}
		if (ok) for (const img of document.images) { if (!img.complete) { ok = false; break; } }
		if (!st) return ok;   // 仕込みの無いページ（自前の context の外など）は、通信の数えを見ない
		if (ok) ok = st.inflight === 0;
		if (ok && quietMs > 0) ok = performance.now() - st.lastMut >= quietMs;
		st.frames = ok ? st.frames + 1 : 0;
		return st.frames >= 2;
	}, rule.quietMs, { timeout, polling: 'raf' });
	if (notice) await waitNoticeSettled(page);
}

/** 再読み込みの時間を計器へ渡す口（run-smoke.mjs が設定する。待ちの部分の ms を渡す） */
let readyHook = null;
export function setReadyHook(fn) { readyHook = typeof fn === 'function' ? fn : null; }

/**
 * page.reload({ waitUntil: 'networkidle' }) の置き換え。load まで再読み込みし、waitPageReady で待つ。
 * @param {import('playwright').Page} page
 * @param {{ timeout?: number }} [opts] timeout: 再読み込み（load まで）の上限 ms
 */
export async function reloadReady(page, { timeout } = {}) {
	await installReadyProbe(page);
	await page.reload(timeout ? { waitUntil: 'load', timeout } : { waitUntil: 'load' });
	const t0 = performance.now();
	try {
		await waitPageReady(page);
	} finally {
		if (readyHook) readyHook({ kind: 'reload', waitMs: performance.now() - t0 });
	}
}
