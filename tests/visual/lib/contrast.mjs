/* ============================================================
 * 画面上の文字のコントラスト比を走査する（C-134・ダークモード。dark-mode-step0.md §8-1 の2）
 *
 * 文字を直接持つ要素ごとに、文字の色と「有効な背景」（祖先の背景色を下から重ねたもの）を求めて
 * WCAG のコントラスト比を出す。基準は 4.5、大きい文字（24px 以上、または 18.66px 以上の太字）は 3.0。
 *
 * **背景を決められないもの**（祖先にグラデーション・画像の背景がある／文字の色が透明＝文字のグラデーション）は
 * 黙って通さず、別の一覧（undecided）に出す。
 * 押せない部品（disabled）の文字は WCAG の対象外なので、別の一覧（disabled）に分ける。
 * 色は canvas に塗って読み直すので、oklch・color(srgb …)・color-mix の結果もそのまま扱える。
 * ============================================================ */

/** page.evaluate に渡す関数。root（セレクタ。省略時は body）の中を走査する。 */
export function scanTextContrastInPage(rootSel) {
	const cv = document.createElement('canvas');
	cv.width = cv.height = 1;
	const cx = cv.getContext('2d', { willReadFrequently: true });
	const toRgba = (c) => {
		if (!c || c === 'transparent') return [0, 0, 0, 0];
		cx.clearRect(0, 0, 1, 1);
		cx.fillStyle = '#000';
		cx.fillStyle = c;
		cx.fillRect(0, 0, 1, 1);
		const d = cx.getImageData(0, 0, 1, 1).data;
		return [d[0], d[1], d[2], d[3] / 255];
	};
	const over = (top, bot) => {
		const a = top[3];
		return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1];
	};
	const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
	const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
	const label = (el) => {
		let s = el.tagName.toLowerCase();
		if (el.id) s += '#' + el.id;
		const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3);
		if (cls.length) s += '.' + cls.join('.');
		const da = el.getAttribute('data-usd-el') || el.getAttribute('data-usd-act');
		if (da) s += '[' + da + ']';
		return s;
	};
	/** 有効な背景。決められないときは null（理由を返す） */
	const effectiveBg = (el) => {
		const layers = [];
		let cover = 0;  // ここまでに重ねた面が下をどれだけ覆っているか（0〜1）
		for (let e = el; e; e = e.parentElement) {
			const cs = getComputedStyle(e);
			if (cs.backgroundImage && cs.backgroundImage !== 'none') {
				// 画像・グラデーションの背景。上に重なった面がほぼ覆っている（85% 以上。.glass-card の 88〜92% など）なら、
				// その要素の背景色（無ければ白）で代える（誤差は小さい）。覆っていなければ決められない
				if (cover >= 0.85) {
					const b = toRgba(cs.backgroundColor);
					layers.push(b[3] >= 0.999 ? b : [255, 255, 255, 1]);
					break;
				}
				return { why: 'bg-image', at: label(e) };
			}
			const bg = toRgba(cs.backgroundColor);
			cover = 1 - (1 - cover) * (1 - bg[3]);
			if (bg[3] > 0) layers.push(bg);
			if (bg[3] >= 0.999) break;
			if (e === document.documentElement) layers.push([255, 255, 255, 1]);  // キャンバスの既定は白
		}
		if (!layers.length) layers.push([255, 255, 255, 1]);
		let c = layers[layers.length - 1];
		if (c[3] < 0.999) c = over(c, [255, 255, 255, 1]);
		for (let i = layers.length - 2; i >= 0; i--) c = over(layers[i], c);
		return { c };
	};
	const root = rootSel ? document.querySelector(rootSel) : document.body;
	const bad = [], undecided = [], disabled = [];
	let checked = 0;
	if (!root) return { checked, bad, undecided, disabled, missing: true };
	const all = [root, ...root.querySelectorAll('*')];
	for (const el of all) {
		if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'svg'].includes(el.tagName)) continue;
		const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.nodeValue.trim()).map((n) => n.nodeValue.trim()).join(' ');
		if (!own) continue;
		const r = el.getBoundingClientRect();
		if (r.width < 1 || r.height < 1) continue;
		const cs = getComputedStyle(el);
		if (cs.visibility !== 'visible' || el.closest('[hidden]') || el.closest('[aria-hidden="true"]') && cs.display === 'none') continue;
		if (el.closest('svg')) continue;
		// 画面外へ追い出した写し（コピー元など）は見えないので数えない
		if (cs.clipPath && cs.clipPath !== 'none' && r.width <= 1.5) continue;
		let hiddenByAncestor = false;
		for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) { hiddenByAncestor = true; break; } }
		if (hiddenByAncestor) continue;
		const text = own.slice(0, 24);
		if (el.closest(':disabled, [aria-disabled="true"]')) { disabled.push({ el: label(el), text }); continue; }
		const fg = toRgba(cs.color);
		if (fg[3] === 0 || (cs.webkitBackgroundClip || cs.backgroundClip) === 'text') { undecided.push({ el: label(el), text, why: 'text-clip' }); continue; }
		const bg = effectiveBg(el);
		if (!bg.c) { undecided.push({ el: label(el), text, why: bg.why, at: bg.at }); continue; }
		const f = fg[3] < 1 ? over(fg, bg.c) : fg;
		const ratioV = ratio(f, bg.c);
		const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
		const large = size >= 24 || (size >= 18.66 && weight >= 700);
		const need = large ? 3 : 4.5;
		checked++;
		if (ratioV + 1e-9 < need) bad.push({ el: label(el), text, fg: hex(f), bg: hex(bg.c), ratio: Math.round(ratioV * 100) / 100, need });
	}
	return { checked, bad, undecided, disabled };
}

/** 一覧を見やすい1行ずつの文字列にする（報告用） */
export function formatContrast(list) {
	return list.map((x) => `${x.ratio}（要${x.need}） ${x.fg}/${x.bg} ${x.el}「${x.text}」`);
}
