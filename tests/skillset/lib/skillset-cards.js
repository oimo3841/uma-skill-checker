/**
 * skillset-cards.js — 「スキルセット詳細」画面のスクリーンショットから
 * スキルカードの矩形と、その中の文字領域を取り出す。
 *
 * 設計方針（フェーズ0の指示より）:
 * - **純粋な関数の集合**。DOM も fetch も使わず、ImageData 形（{ data, width, height } の
 *   RGBA 配列）を受け取って矩形を返すだけ。後続フェーズで製品（ブラウザ）へそのまま持ち込める。
 * - 座標の決め打ちをしない。カードの地の色から連結成分を取り、幅・高さの**中央値**を基準に
 *   「完全に見えているカード」だけを選ぶ。端末や解像度が変わっても比率で効くようにする。
 * - しきい値はすべて SKILLSET_TUNING に名前付きで置く（端末差の調整用）。
 * - スキル名そのものはこのファイルに一切書かない（B節ルール1）。
 *
 * 読み込み方: 素の <script>（classic script）。globalThis.SkillsetCards に公開する。
 * 現在は tests/skillset/ の検証ツールからのみ使う。製品ファイルからは参照していない。
 */
(function (global) {
	'use strict';

	// しきい値。基準値は 1179x2556 の iPhone スクリーンショットでの実測。
	// 画素数に依存する値はすべて画像の幅・高さ・面積に対する比率で持つ。
	var SKILLSET_TUNING = {
		// カードの地（ラベンダー）
		LAVENDER_B_MINUS_R: 8,
		LAVENDER_MIN_R: 140,
		LAVENDER_MIN_B: 180,
		// カードの地（金スキル）。カード内の金アイコンもここに入るが、
		// クロージングでカード本体と繋がるので分けなくてよい。
		GOLD_MIN_R: 220,
		GOLD_MIN_G: 150,
		GOLD_MAX_B: 190,
		GOLD_MIN_R_MINUS_B: 50,
		// 地のマスクを閉じるカーネル（正方形の一辺）
		CARD_CLOSE_KERNEL: 5,
		// カード候補とみなす外接矩形の大きさ（画像の幅・高さに対する比）
		CARD_MIN_W_RATIO: 0.30,
		CARD_MAX_W_RATIO: 0.55,
		CARD_MIN_H_RATIO: 0.015,
		CARD_MAX_H_RATIO: 0.06,
		// 「完全なカード」判定。候補の幅・高さの中央値からの許容ずれ
		FULL_W_TOL: 0.03,
		FULL_H_TOL: 0.08,
		// 「設定数」バッジの地の色
		BADGE_RGB: [109, 104, 126],
		BADGE_TOL: 14,
		BADGE_CLOSE_KERNEL: 15,
		BADGE_MIN_AREA_RATIO: 0.0009, // 画像面積比（1179x2556 で約 2700px）
		// カード内で文字が載っている帯（カード高さに対する比）。
		// バッジに隠されているかの判定はこの帯だけで見る。枠全体で見ると
		// 下端が数pxかすっただけのカードまで落ちてしまう。
		TEXT_BAND_TOP: 0.20,
		TEXT_BAND_BOTTOM: 0.80,
		// 切り出す文字領域（カードの幅・高さに対する比）
		TEXT_CROP_LEFT: 0.15, // アイコンぶん
		TEXT_CROP_RIGHT: 0.023,
		TEXT_CROP_TOP: 0.085,
		TEXT_CROP_BOTTOM: 0.125,
		// 上部タブの緑（選択中のタブ）
		TAB_GREEN_MIN_G: 140,
		TAB_GREEN_G_MINUS_R: 25,
		TAB_GREEN_G_MINUS_B: 60,
		TAB_MIN_W_RATIO: 0.18,
		TAB_MAX_W_RATIO: 0.34,
		TAB_MIN_H_RATIO: 0.010,
		TAB_MAX_H_RATIO: 0.030,
		TAB_COUNT: 3,
		// カードの地が金かどうかの判定。アイコン（左端）を外した帯で、
		// 金の画素とラベンダーの画素のどちらが多いかを見る。
		// 金のカードは継承できないスキル（進化・金・◎）なので、OCRにかけず「対象外」にする。
		KIND_SCAN_LEFT: 0.15, // アイコンぶんを外す
		KIND_SCAN_TOP: 0.15,
		KIND_SCAN_BOTTOM: 0.85,
		KIND_GOLD_MIN_RATIO: 0.2, // 帯の画素のうち、金がこの割合を超えたら金のカード
		// スクロールバー（右端）
		SCROLLBAR_X_FROM: 0.93,
		SCROLLBAR_X_TO: 0.985,
		// 一覧の上端〜下端。ここを狭くすると、つまみが窓の外へ出たときに見失う
		SCROLLBAR_Y_FROM: 0.22,
		SCROLLBAR_Y_TO: 0.76,
		SCROLLBAR_MIN_SD: 20,
		SCROLLBAR_MIN_THUMB_RATIO: 0.01
	};

	/* ---------- 画素ユーティリティ ---------- */

	function maskFrom(img, test) {
		var w = img.width, h = img.height, d = img.data;
		var m = new Uint8Array(w * h);
		for (var i = 0, p = 0; i < m.length; i++, p += 4) {
			if (test(d[p], d[p + 1], d[p + 2])) m[i] = 1;
		}
		return m;
	}

	// 正方形カーネルの膨張／収縮。横・縦に分けて行う（結果は正方形カーネルと同じ）。
	function dilate(m, w, h, k) {
		var r = (k - 1) >> 1;
		var tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
		var x, y, i, v, row;
		for (y = 0; y < h; y++) {
			row = y * w;
			for (x = 0; x < w; x++) {
				v = 0;
				for (i = -r; i <= r; i++) {
					var xx = x + i;
					if (xx >= 0 && xx < w && m[row + xx]) { v = 1; break; }
				}
				tmp[row + x] = v;
			}
		}
		for (x = 0; x < w; x++) {
			for (y = 0; y < h; y++) {
				v = 0;
				for (i = -r; i <= r; i++) {
					var yy = y + i;
					if (yy >= 0 && yy < h && tmp[yy * w + x]) { v = 1; break; }
				}
				out[y * w + x] = v;
			}
		}
		return out;
	}

	function erode(m, w, h, k) {
		var inv = new Uint8Array(w * h);
		for (var i = 0; i < inv.length; i++) inv[i] = m[i] ? 0 : 1;
		var d = dilate(inv, w, h, k);
		var out = new Uint8Array(w * h);
		for (i = 0; i < out.length; i++) out[i] = d[i] ? 0 : 1;
		return out;
	}

	function close(m, w, h, k) {
		return erode(dilate(m, w, h, k), w, h, k);
	}

	/** 連結成分（4近傍）の外接矩形と面積。 */
	function components(m, w, h) {
		var seen = new Uint8Array(w * h);
		var stack = new Int32Array(w * h);
		var out = [];
		for (var s = 0; s < m.length; s++) {
			if (!m[s] || seen[s]) continue;
			var top = 0;
			stack[top++] = s;
			seen[s] = 1;
			var minX = w, maxX = -1, minY = h, maxY = -1, area = 0;
			while (top > 0) {
				var i = stack[--top];
				var x = i % w, y = (i - x) / w;
				area++;
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
				if (x > 0 && m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
				if (x < w - 1 && m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
				if (y > 0 && m[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[top++] = i - w; }
				if (y < h - 1 && m[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[top++] = i + w; }
			}
			out.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area: area });
		}
		return out;
	}

	function median(values) {
		if (!values.length) return 0;
		var a = values.slice().sort(function (p, q) { return p - q; });
		var mid = a.length >> 1;
		return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
	}

	function overlaps(a, b) {
		return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
	}

	/* ---------- カード ---------- */

	/** カード候補の外接矩形（上端で切れたものやボタンも含む）。 */
	function detectCards(img, tuning) {
		var T = tuning || SKILLSET_TUNING;
		var W = img.width, H = img.height;
		var m = maskFrom(img, function (r, g, b) {
			var lav = (b - r > T.LAVENDER_B_MINUS_R) && r > T.LAVENDER_MIN_R && b > T.LAVENDER_MIN_B;
			var gold = r > T.GOLD_MIN_R && g > T.GOLD_MIN_G && b < T.GOLD_MAX_B && (r - b) > T.GOLD_MIN_R_MINUS_B;
			return lav || gold;
		});
		m = close(m, W, H, T.CARD_CLOSE_KERNEL);
		return components(m, W, H)
			.filter(function (c) {
				return c.w > W * T.CARD_MIN_W_RATIO && c.w < W * T.CARD_MAX_W_RATIO &&
					c.h > H * T.CARD_MIN_H_RATIO && c.h < H * T.CARD_MAX_H_RATIO;
			})
			.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
	}

	/** 「設定数 N / 200」バッジの外接矩形。見つからなければ null。 */
	function detectBadge(img, tuning) {
		var T = tuning || SKILLSET_TUNING;
		var W = img.width, H = img.height;
		var c0 = T.BADGE_RGB[0], c1 = T.BADGE_RGB[1], c2 = T.BADGE_RGB[2], tol = T.BADGE_TOL;
		var m = maskFrom(img, function (r, g, b) {
			return Math.abs(r - c0) < tol && Math.abs(g - c1) < tol && Math.abs(b - c2) < tol;
		});
		m = close(m, W, H, T.BADGE_CLOSE_KERNEL);
		var minArea = W * H * T.BADGE_MIN_AREA_RATIO;
		var best = null;
		components(m, W, H).forEach(function (c) {
			if (c.area < minArea) return;
			if (!best || c.area > best.area) best = c;
		});
		return best;
	}

	/**
	 * カードの地が金かラベンダーかを返す（'gold' / 'lavender'）。
	 *
	 * マスター445種は**継承スキルだけ**が対象で、進化スキル・金スキル・◎（○の強化版）は
	 * 仕様上そこに入らない。それらは画面上で金の地のカードになるので、**色だけでOCR前に外せる。**
	 * アイコンは金のカードでもラベンダーのカードでも金色なので、左端のアイコンぶんは見ない。
	 */
	function classifyCardKind(img, rect, tuning) {
		var T = tuning || SKILLSET_TUNING;
		var W = img.width, d = img.data;
		var x0 = rect.x + Math.round(rect.w * T.KIND_SCAN_LEFT);
		var x1 = rect.x + rect.w;
		var y0 = rect.y + Math.round(rect.h * T.KIND_SCAN_TOP);
		var y1 = rect.y + Math.round(rect.h * T.KIND_SCAN_BOTTOM);
		var gold = 0, lav = 0, total = 0;
		for (var y = y0; y < y1; y++) {
			for (var x = x0; x < x1; x++) {
				var p = (y * W + x) * 4;
				var r = d[p], g = d[p + 1], b = d[p + 2];
				total++;
				if (r > T.GOLD_MIN_R && g > T.GOLD_MIN_G && b < T.GOLD_MAX_B && (r - b) > T.GOLD_MIN_R_MINUS_B) gold++;
				else if ((b - r > T.LAVENDER_B_MINUS_R) && r > T.LAVENDER_MIN_R && b > T.LAVENDER_MIN_B) lav++;
			}
		}
		return {
			kind: total > 0 && gold / total > T.KIND_GOLD_MIN_RATIO ? 'gold' : 'lavender',
			goldRatio: total > 0 ? gold / total : 0,
			lavenderRatio: total > 0 ? lav / total : 0
		};
	}

	/**
	 * 完全に見えていて、かつ文字がバッジに隠れていないカードを返す。
	 * 戻り値: [{ card:{x,y,w,h}, text:{x,y,w,h}, kind:'gold'|'lavender', goldRatio }]
	 */
	function detectFullCards(img, tuning) {
		var T = tuning || SKILLSET_TUNING;
		var boxes = detectCards(img, T);
		if (!boxes.length) return [];
		var mw = median(boxes.map(function (c) { return c.w; }));
		var mh = median(boxes.map(function (c) { return c.h; }));
		var badge = detectBadge(img, T);
		var out = [];
		boxes.forEach(function (c) {
			// 上端で切れたカード・下部のボタン（コピー／閉じる）を落とす
			if (Math.abs(c.w - mw) >= mw * T.FULL_W_TOL) return;
			if (Math.abs(c.h - mh) >= mh * T.FULL_H_TOL) return;
			var band = {
				x: c.x, w: c.w,
				y: c.y + Math.round(c.h * T.TEXT_BAND_TOP),
				h: Math.round(c.h * (T.TEXT_BAND_BOTTOM - T.TEXT_BAND_TOP))
			};
			// 枠は完全に見えているのに文字だけバッジに隠れている場合がある
			if (badge && overlaps(band, badge)) return;
			var kind = classifyCardKind(img, c, T);
			out.push({
				card: { x: c.x, y: c.y, w: c.w, h: c.h },
				kind: kind.kind,
				goldRatio: kind.goldRatio,
				text: {
					x: c.x + Math.round(c.w * T.TEXT_CROP_LEFT),
					y: c.y + Math.round(c.h * T.TEXT_CROP_TOP),
					w: c.w - Math.round(c.w * T.TEXT_CROP_LEFT) - Math.round(c.w * T.TEXT_CROP_RIGHT),
					h: c.h - Math.round(c.h * T.TEXT_CROP_TOP) - Math.round(c.h * T.TEXT_CROP_BOTTOM)
				}
			});
		});
		return out;
	}

	/* ---------- 上部タブ ---------- */

	/**
	 * 選択中（緑）のタブの位置を返す。
	 * { index: 0..2, box: {...} } / 判別できなければ null。
	 * タブの段は「いちばん上のカードより上」にある緑の帯で、幅がカード1枚ぶんに近い。
	 * 画面上端の見出し帯（全幅）や右上の共有ボタン（小さい）は大きさで外れる。
	 * どのタブが何という名前かはこの関数では決めない（呼び出し側が位置で解釈する）。
	 */
	function detectActiveTab(img, cards, tuning) {
		var T = tuning || SKILLSET_TUNING;
		var W = img.width, H = img.height;
		var m = maskFrom(img, function (r, g, b) {
			return g > T.TAB_GREEN_MIN_G && (g - r) > T.TAB_GREEN_G_MINUS_R && (g - b) > T.TAB_GREEN_G_MINUS_B;
		});
		m = close(m, W, H, T.CARD_CLOSE_KERNEL);
		var topCardY = cards && cards.length ? Math.min.apply(null, cards.map(function (c) { return c.card.y; })) : H;
		var hit = null;
		components(m, W, H).forEach(function (c) {
			if (c.y + c.h > topCardY) return; // カードより下（カード内の緑アイコンなど）
			if (c.w < W * T.TAB_MIN_W_RATIO || c.w > W * T.TAB_MAX_W_RATIO) return;
			if (c.h < H * T.TAB_MIN_H_RATIO || c.h > H * T.TAB_MAX_H_RATIO) return;
			if (!hit || c.y > hit.y) hit = c; // タブの段は見出し帯より下
		});
		if (!hit || !cards || !cards.length) return null;
		// タブの段はカードの並びとほぼ同じ幅に広がっている。カードの左右端を物差しにする。
		var left = Math.min.apply(null, cards.map(function (c) { return c.card.x; }));
		var right = Math.max.apply(null, cards.map(function (c) { return c.card.x + c.card.w; }));
		var span = (right - left) / T.TAB_COUNT;
		if (span <= 0) return null;
		var center = hit.x + hit.w / 2;
		var index = Math.floor((center - left) / span);
		if (index < 0) index = 0;
		if (index > T.TAB_COUNT - 1) index = T.TAB_COUNT - 1;
		return { index: index, box: { x: hit.x, y: hit.y, w: hit.w, h: hit.h } };
	}

	/* ---------- スクロールバー ---------- */

	/**
	 * 一覧の右端にあるスクロールバーの「つまみ」の位置を返す。
	 * { x, y0, y1, trackY0, trackY1, ratio } / 見つからなければ null。
	 * ratio は 0（先頭）〜1（末尾）。
	 *
	 * 動画からフレームを選ぶとき、フレーム間の縦ずれを画の相関で求めようとすると、
	 * 一覧が約90px周期の繰り返しなので「1行ぶんずれた位置」に誤って合う。
	 * つまみの位置は周期性がなく、1枚のフレームだけで絶対位置が分かるので確実。
	 *
	 * 列の決め打ちはしない。右端付近で「縦方向のばらつきがいちばん大きい列」を
	 * スクロールバーとみなす（つまみと軌道で明るさが大きく違うため）。
	 */
	function detectScrollThumb(img, tuning) {
		var T = tuning || SKILLSET_TUNING;
		var W = img.width, H = img.height, d = img.data;
		var xFrom = Math.round(W * T.SCROLLBAR_X_FROM), xTo = Math.round(W * T.SCROLLBAR_X_TO);
		var yFrom = Math.round(H * T.SCROLLBAR_Y_FROM), yTo = Math.round(H * T.SCROLLBAR_Y_TO);
		var bestX = -1, bestSd = -1, bestCol = null;
		for (var x = xFrom; x < xTo; x++) {
			var vals = [], sum = 0;
			for (var y = yFrom; y < yTo; y++) {
				var p = (y * W + x) * 4;
				var g = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
				vals.push(g);
				sum += g;
			}
			var mean = sum / vals.length, acc = 0;
			for (var i = 0; i < vals.length; i++) acc += (vals[i] - mean) * (vals[i] - mean);
			var sd = Math.sqrt(acc / vals.length);
			if (sd > bestSd) { bestSd = sd; bestX = x; bestCol = vals; }
		}
		if (bestX < 0 || bestSd < T.SCROLLBAR_MIN_SD) return null;
		// つまみは軌道より暗い。列の中央値を境にして、いちばん長い「暗い連なり」を探す。
		var sorted = bestCol.slice().sort(function (a, b) { return a - b; });
		var mid = sorted[sorted.length >> 1];
		var lo = sorted[0], hi = sorted[sorted.length - 1];
		var level = mid - (mid - lo) * 0.4;
		var best = null, cur = null;
		for (var k = 0; k < bestCol.length; k++) {
			if (bestCol[k] <= level) {
				if (!cur) cur = { a: k, b: k };
				else cur.b = k;
			} else if (cur) {
				if (!best || cur.b - cur.a > best.b - best.a) best = cur;
				cur = null;
			}
		}
		if (cur && (!best || cur.b - cur.a > best.b - best.a)) best = cur;
		if (!best) return null;
		var y0 = yFrom + best.a, y1 = yFrom + best.b;
		var len = y1 - y0 + 1;
		if (len < H * T.SCROLLBAR_MIN_THUMB_RATIO) return null;
		var room = (yTo - yFrom) - len;
		return {
			x: bestX,
			y0: y0,
			y1: y1,
			trackY0: yFrom,
			trackY1: yTo,
			sd: bestSd,
			span: hi - lo,
			ratio: room > 0 ? (y0 - yFrom) / room : 0
		};
	}

	/**
	 * 画面ぜんぶをまとめて読む入口。
	 * { cards: [...], badge: {...}|null, badgeText: {x,y,w,h}|null, activeTab: {...}|null }
	 * badgeText は「設定数 N / 200」の数字を読ませるための領域（バッジの右寄り）。
	 */
	function analyzeScreen(img, tuning) {
		var T = tuning || SKILLSET_TUNING;
		var cards = detectFullCards(img, T);
		var badge = detectBadge(img, T);
		return {
			cards: cards,
			badge: badge ? { x: badge.x, y: badge.y, w: badge.w, h: badge.h } : null,
			badgeText: badge ? { x: badge.x, y: badge.y, w: badge.w, h: badge.h } : null,
			activeTab: detectActiveTab(img, cards, T)
		};
	}

	global.SkillsetCards = {
		TUNING: SKILLSET_TUNING,
		detectCards: detectCards,
		detectBadge: detectBadge,
		detectFullCards: detectFullCards,
		detectActiveTab: detectActiveTab,
		detectScrollThumb: detectScrollThumb,
		classifyCardKind: classifyCardKind,
		analyzeScreen: analyzeScreen,
		_internal: { maskFrom: maskFrom, close: close, components: components, median: median }
	};
})(typeof globalThis !== 'undefined' ? globalThis : this);
