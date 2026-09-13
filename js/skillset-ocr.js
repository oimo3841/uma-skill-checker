/**
 * skillset-ocr.js — 「スキルセット」画面のスクリーンショットからスキル名を読み取り、
 * マスター445種に照合して「白スキルの集合」を作る（スキルセットOCR・フェーズa）。
 *
 * 位置づけ（HANDOFF C-24「フェーズa の決定」）:
 * - 対象は「スキルセット」画面（超優先／優先／通常のタブと「設定数 N / 200」のバッジがある画面）。
 *   継承タブの因子画面とは別物で、そちらの読み取り（special.html の processPersonImages）とは経路を分ける。
 * - 今フェーズは**白スキル（ラベンダーの地＝マスターにある継承スキル）のみを検出するツール**。
 *   金スキルは OCR して名前まで取るが、**照合も取り込みもしない**（決定 A-4。対応表は後のフェーズ）。
 * - 金と白の区別は**背景色だけ**で行い、OCR の結果に依存させない（決定 A-5）。分類は OCR より前に終わっている。
 * - 継ぎ合わせは持ち込まない（決定 A-6）。白は名前の和集合で重複が消える。
 * - 設定数バッジは読むが、撮り漏れの判定には使わない（決定 A-7）。出すのは数の内訳だけ。
 * - 画質ゲートは既存の assessImageQuality()（400/700px）をそのまま使う（決定 B-1）。判定は toBaseCanvas 後の幅。
 * - 距離1以上の一意な一致は自動採用する（決定 B-2）。**OPTIONS.AUTO_ACCEPT_NEAR_MATCH で切れる。**
 * - 金の種類数は normalizeText 後の完全一致で重複を消して数える。生の読みは別に持つ（決定 B-3）。
 *
 * 依存（すべて js/common.js のトップレベルのグローバル。**common.js は変更していない**）:
 *   loadImage / toBaseCanvas / getPixels / assessImageQuality / ROW_TARGET_HEIGHT / preprocessVariants /
 *   normalizeText / buildSkillDictionary / bestCandidate / allowedDistance
 * および js/skillset-cards.js の SkillsetCards（カードの矩形と地の色）。
 *
 * 読み込み方: 素の <script>（classic script）。common.js と skillset-cards.js のあとに読む。
 * globalThis.SkillsetOcr に公開する。DOM に触るのは canvas の生成だけ（画面の要素は一切触らない）。
 *
 * 出力の行の形は uma-skill-deck-core.js の matchPastedSkillText() と揃えてある
 * （{ raw, norm, kind:'exact'|'review'|'none', matchedId, matchedName, candidates:[{id,name,distance}] }）。
 * 曖昧な行はこの形のまま Deck の貼り付けピッカーへ渡す（決定 A-8。core 側の口はコミット3）。
 */
const SKILLSET_OCR_JS_VERSION = '2026-09-13d';

(function (global) {
	'use strict';

	/** 動作の切り替え。名前付きで持ち、判断の理由を横に書く。 */
	var OPTIONS = {
		// 決定 B-2: 許容距離内で一意に当たった行（距離1〜2）を、確認なしで採用するか。
		// 28セッション目の測定では製品の規則で 9,609枚中 誤着地 0 だったので true。
		// ただしその正解は同じOCRの読みから作った案を人が確認したもので、完全に独立ではない。
		// **利用者の撮り方のスクリーンショット（素材B）で再測定して誤着地が1件でも出たら false に倒す**
		// （距離1以上をすべて確認行きにする＝Step 0 報告の (ii)）。切り替えはこの1つで済む。
		AUTO_ACCEPT_NEAR_MATCH: true,
		// 「設定数 N / 200」のバッジを読むときの拡大率（フェーズ0のハーネスと同じ）
		BADGE_SCALE: 2,
		// カード1枚＝1行なので、Tesseract の psm は 7（1行）。因子画面の 6（段組）とは違う
		PSM: '7',
		// preprocessVariants(canvas, multi) の multi。3変種（二値化／反転／原画）を全部読む＝製品の因子OCRと同じ
		MULTI_VARIANTS: true,
		// 30セッション目: 3変種すべてが空文字（symbols 0）だった白カードだけ、この psm で読み直す。
		// 「連綿」「一匹狼」は切り出しが鮮明でも Tesseract のレイアウト解析（psm 7／6／8／11）が行ごと捨てて
		// 何も返さない。レイアウト解析を省く psm 13 だけが文字を返す（「遣綿」「一匹翼」＝距離1の誤読）。
		// 読み直しの結果は**照合に当たった（確定または自動採用）ときだけ採用**し、当たらなければ
		// 「読めなかった」のまま（psm 13 はゴミを返しやすいので、ゴミの行を確認行きに増やさない）。
		// 白だけ。金は照合先が無いので、ゴミがそのまま種類数に乗る。'' にすると読み直しをしない。
		EMPTY_READ_FALLBACK_PSM: '13'
	};

	/* ============================================================
	 * 辞書（マスター445種）
	 * ============================================================ */

	/**
	 * マスター445種の辞書を作る。
	 * @param {Array<{id:string,name:string}>} entries  UmaSkillDeckCore.getSkillEntries(全ID) の戻り値など
	 * @returns {{ list:string[], index:Array<{raw,norm}>, idByNorm:Map, nameById:Map, size:number }}
	 *
	 * **special.html の因子OCRが使う setActiveSkillDictionary() には触らない**（Step 0 報告 T3-2 案A）。
	 * 因子OCRの辞書は「対象スキルセットの名前」の部分集合で、こちらはマスター全体。混ぜない。
	 * 辞書はローカルに持ち、bestCandidate() に明示的に渡す。
	 */
	function buildMasterDictionary(entries) {
		var names = [];
		var idByNorm = new Map();
		var nameById = new Map();
		(entries || []).forEach(function (e) {
			if (!e || e.id == null) return;
			var name = String(e.name == null ? '' : e.name).trim();
			if (!name) return;
			var norm = normalizeText(name);
			if (!norm) return;
			// 正規化後に同じ文字列になる名前はマスターに無い前提（tests/ocr/check-normalization.mjs が見ている）。
			// 万一あっても最初の1つだけを残す＝ buildSkillDictionary() と同じ振る舞い。
			if (idByNorm.has(norm)) return;
			idByNorm.set(norm, String(e.id));
			nameById.set(String(e.id), name);
			names.push(name);
		});
		var dict = buildSkillDictionary(names); // common.js（純粋関数）
		return { list: dict.list, index: dict.index, idByNorm: idByNorm, nameById: nameById, size: dict.list.length };
	}

	/* ============================================================
	 * 前処理（common.js の stackRows() と同じ倍率の決め方を、カード1枚ぶんだけ行う）
	 * ============================================================ */

	/**
	 * 文字（濃い画素）の縦の広がり＝「文字の高さ」。
	 * 決定 B-1: 画質の崖（ROW_TARGET_HEIGHT 56 ÷ 拡大上限 4 ＝ 14px）に対して、実際に何 px で読んだかを
	 * 開発ログに残すために測る。14〜23px の間が未測定なので材料を溜める。
	 * 測り方はフェーズ0のハーネス（tests/skillset/lib/ocr.mjs の __inkHeight）と同じ。
	 */
	function inkHeight(canvas) {
		var w = canvas.width, h = canvas.height;
		if (!w || !h) return 0;
		var d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
		var need = Math.max(2, Math.round(w * 0.01));
		var top = -1, bottom = -1;
		for (var y = 0; y < h; y++) {
			var n = 0;
			for (var x = 0; x < w; x++) {
				var p = (y * w + x) * 4;
				var gray = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
				if (gray < 128) n++;
			}
			if (n >= need) { if (top < 0) top = y; bottom = y; }
		}
		return top < 0 ? 0 : bottom - top + 1;
	}

	/**
	 * 文字の外接矩形で切り直し → ROW_TARGET_HEIGHT まで拡大（**上限4倍**）→ 白地に余白。
	 * common.js の stackRows() / stackRowsWithMeta() が因子画面の各行に行っているのと同じ倍率の決め方
	 * （`Math.max(1, Math.min(4, ROW_TARGET_HEIGHT / rh))`）を、カード1枚ぶんだけ行う。
	 * 余白（padX 30・上下 gap ＝ ROW_TARGET_HEIGHT×0.6）も stackRows() と同じ。
	 * 4倍の上限があるので、文字の高さが 14px を下回ると目標の 56px に届かない（＝画質の崖）。
	 */
	function tightenAndScale(canvas) {
		var w = canvas.width, h = canvas.height;
		if (!w || !h) return canvas;
		var d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
		var x0 = w, x1 = -1, y0 = h, y1 = -1;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				var p = (y * w + x) * 4;
				var gray = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
				if (gray < 128) {
					if (x < x0) x0 = x;
					if (x > x1) x1 = x;
					if (y < y0) y0 = y;
					if (y > y1) y1 = y;
				}
			}
		}
		if (x1 < 0) return canvas; // 文字が見つからない
		var pad = 4; // common.js の detectSkillRows() が行の外接矩形に付ける余白と同じ
		var rx = Math.max(0, x0 - pad), ry = Math.max(0, y0 - pad);
		var rw = Math.min(w - rx, x1 - x0 + 1 + pad * 2), rh = Math.min(h - ry, y1 - y0 + 1 + pad * 2);
		var scale = Math.max(1, Math.min(4, ROW_TARGET_HEIGHT / rh));
		var padX = 30, gap = Math.round(ROW_TARGET_HEIGHT * 0.6);
		var out = document.createElement('canvas');
		out.width = Math.round(rw * scale) + padX * 2;
		out.height = Math.round(rh * scale) + gap * 2;
		var ctx = out.getContext('2d');
		ctx.fillStyle = '#FFFFFF';
		ctx.fillRect(0, 0, out.width, out.height);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(canvas, rx, ry, rw, rh, padX, gap, Math.round(rw * scale), Math.round(rh * scale));
		return out;
	}

	/** 矩形を小さな canvas に切り出す（scale 倍）。大きい元画像を手放すために使う。 */
	function cropToCanvas(src, rect, scale) {
		var s = scale || 1;
		var out = document.createElement('canvas');
		out.width = Math.max(1, Math.round(rect.w * s));
		out.height = Math.max(1, Math.round(rect.h * s));
		var ctx = out.getContext('2d');
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, out.width, out.height);
		return out;
	}

	/** canvas の裏の画素を手放す（参照を落とすだけより早く解放される）。 */
	function releaseCanvas(canvas) {
		if (canvas && canvas.width) { canvas.width = 0; canvas.height = 0; }
	}

	/* ============================================================
	 * 画像1枚の解析（画質ゲート → カードの矩形と地の色 → 切り出し）
	 * ============================================================ */

	/**
	 * assessImageQuality() の結果を、この画面の入口向けに読み替える。
	 *
	 * 決定 B-1 で使うと決めたのは**幅**の 400/700（'too-small' で拒否・'narrow' で警告）。
	 * 鮮明度（'blurry'・MIN_SHARPNESS_SCORE 120）は因子画面向けに置かれたもので、
	 * common.js のコメントにあるとおり「大きいのにぼやけている画像（拡大リサイズや強い再圧縮）を弾く」ための値。
	 * ところがスキルセット画面は地の広い平坦なラベンダーが画面の大半を占めるので、
	 * **端末の原寸（1179x2556）でも鮮明度が 118〜131 と、しきい値 120 の上下すれすれ**に出る
	 * （28セッション目・コミット2の実測: 添付4枚のうち image0.png が 118 で拒否された）。
	 * 幅の判定と違って、この値はこの画面に対する実測の裏付けが無い。
	 * → **この画面では鮮明度を拒否にも警告にも使わない**（おいもさんの決定・2026-09-13）。
	 *   利用者向けの表示には一切出さず、数値は開発ログ（formatImageLog）にだけ残す。common.js は変えない。
	 *   理由: スマホ7枚中5枚が 120 未満（114〜118）＝正常な画像の7割で警告が出ることになり、
	 *   利用者に「この警告は無視してよい」と学習させてしまう。将来ほんとうに危ない画像で警告を出しても効かなくなる。
	 *   しきい値の見直しは、実際に手ぶれ・劣化した素材が手に入ってから。
	 *   `original` に assessImageQuality() の生の結果を残す（開発ログ用）。
	 */
	function adaptQualityForSkillset(q) {
		// **幅による事前の警告（'narrow'・400〜700px）も出さない**（おいもさんの決定・2026-09-13。B-1 の変更）。
		//   B-1 の原案は「400未満は拒否、400〜700は警告つきで通す」だったが、DMM 版の実測で 700px 未満の5水準
		//   （683／618／577／536／492px）すべてに 'narrow' が出る一方、それらは白を 88〜94% 読めていた。
		//   正常に読めている画像で警告が出続けると利用者は警告を無視するようになり、将来ほんとうに危ない画像で
		//   警告を出しても効かなくなる（鮮明度と同じ構図）。逆に、幅ゲートは弾きたいもの（スマホの半解像度 592px＝
		//   実際に崩れる）を弾けない（400〜700 は警告どまりで通るため）。DMM 577px は通したい・スマホ 592px は
		//   弾きたい、を幅だけでは区別できない＝鳴ってほしくないところで鳴り、鳴ってほしいところで止められない状態だった。
		//   → 400px 未満の**拒否は残す**（文字高 8px 相当で完全一致 6〜9% しか読めない実測があるため）。
		//     警告の代わりに、B-1 で決めてある**「読めなかった N 枚」の事後報告**を本命の対策にする。
		//     幅の数値は鮮明度と同じく開発ログ（formatImageLog）に残す。common.js は変えない。
		var rejectKinds = (q.rejectKinds || []).filter(function (k) { return k !== 'blurry'; });
		var warnKinds = (q.warnKinds || []).filter(function (k) { return k !== 'blurry' && k !== 'narrow'; });
		var reasons = (q.reasons || []).filter(function (s) { return s.indexOf('鮮明度') === -1; });
		var warnings = (q.warnings || []).filter(function (s) { return s.indexOf('鮮明度') === -1 && s.indexOf('推奨') === -1; });
		return {
			ok: rejectKinds.length === 0, width: q.width, height: q.height, sharpness: q.sharpness,
			reasons: reasons, warnings: warnings, rejectKinds: rejectKinds, warnKinds: warnKinds,
			original: q
		};
	}

	/**
	 * SkillsetCards.detectActiveTab() は「緑の帯が無い」「カードが無くて位置の物差しが作れない」の
	 * どちらでも null を返す。ここで理由を分けて { index, reason } にする（Step 0 報告 T5-4）。
	 * タブが分からなくても処理は止めない。白の和集合にタブの情報は要らず、内訳の表に「タブ不明」の行が増えるだけ。
	 */
	function resolveActiveTab(activeTab, cardCount) {
		if (activeTab && typeof activeTab.index === 'number') return { index: activeTab.index, reason: null };
		return { index: null, reason: cardCount > 0 ? 'no-green-band' : 'no-cards' };
	}

	/**
	 * 読み込み済みの1枚（HTMLImageElement）を解析し、OCR に渡す小さな切り出しだけを返す。
	 * **戻るときには大きい canvas も ImageData も手放している**（1179x2556 の RGBA は約12MB／枚。
	 * 切り出しは1枚あたり数MBで済むので、複数枚を先に全部切り出してから OCR を始められる）。
	 *
	 * @returns {{
	 *   name, width, height, natural:{w,h},
	 *   quality: assessImageQuality() の戻り値（ok:false なら cards は空）,
	 *   tab: {index, reason}, badgeCanvas: HTMLCanvasElement|null,
	 *   cards: Array<{ kind, card, text, canvas }>, kindCounts: {lavender, gold, unknown},
	 *   ms
	 * }}
	 */
	function analyzeSkillsetImage(img, name, opts) {
		var o = opts || {};
		var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
		// 決定 B-5: toBaseCanvas() の長辺3000px超の縮小はそのまま通す（因子OCRと同じ経路。メモリも下がる）。
		var base = toBaseCanvas(img);
		var out = {
			name: name || '',
			width: base.width, height: base.height,
			natural: { w: img.naturalWidth, h: img.naturalHeight },
			quality: null, tab: { index: null, reason: 'no-cards' }, badgeCanvas: null,
			cards: [], kindCounts: { lavender: 0, gold: 0, unknown: 0 }, ms: 0
		};
		// 決定 B-1: 画質ゲートは既存の 400/700 をそのまま。**判定は縮小後の幅**（base の幅）で行う。
		out.quality = adaptQualityForSkillset(assessImageQuality(base));
		if (!out.quality.ok && !o.ignoreQuality) {
			releaseCanvas(base);
			out.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
			return out;
		}
		var imageData = getPixels(base);
		var screen = global.SkillsetCards.analyzeScreen(imageData, o.tuning);
		imageData = null; // 以後は使わない。大きいので早めに手放す
		out.tab = resolveActiveTab(screen.activeTab, screen.cards.length);
		if (screen.badgeText) out.badgeCanvas = cropToCanvas(base, screen.badgeText, OPTIONS.BADGE_SCALE);
		screen.cards.forEach(function (c) {
			var kind = c.kind === 'lavender' || c.kind === 'gold' ? c.kind : 'unknown';
			out.kindCounts[kind]++;
			out.cards.push({
				kind: kind,
				card: c.card,
				text: c.text,
				kindRatios: c.kindRatios || null,
				// 'unknown' は OCR にかけないので切り出しも持たない（決定 B-6）
				canvas: kind === 'unknown' ? null : cropToCanvas(base, c.text, 1)
			});
		});
		releaseCanvas(base);
		out.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
		return out;
	}

	/* ============================================================
	 * 照合（1枚のカード＝スキル名1つ）
	 * ============================================================ */

	/**
	 * OCR の読み1つをマスターに照合し、貼り付けピッカーと同じ形の行にする（純粋関数）。
	 *
	 * 製品の因子OCRと同じく common.js の normalizeText() → bestCandidate() を使う。
	 * matchAllSkills() は使わない（誤字辞書・★・行をまたぐ同着の絞り込みなど、
	 * 因子画面の複数行を前提にした仕組みで、カード1枚の用途では空回りするか判定が変わる）。
	 *
	 * kind の決め方:
	 *   'exact'  … 距離0で一意（OCRの読みがそのまま、または混同マップ経由でただ1つに一致）→ 確認なしで採用
	 *   'review' … 距離1以上で一意（autoAccepted は OPTIONS.AUTO_ACCEPT_NEAR_MATCH に従う）、または同点複数
	 *   'none'   … 読みが空、または許容距離内に候補が無い
	 *
	 * 'review' で autoAccepted:true の行は、ピッカーで「完全一致ではない行（内容をご確認ください）」として
	 * 上部に並び、チェックが入った状態で出る（決定 B-2 の見せ方＝既存の usd-paste-approx）。
	 */
	function classifyCardRead(text, dict, opts) {
		var o = opts || OPTIONS;
		var raw = String(text == null ? '' : text).trim();
		var row = { raw: raw, norm: '', kind: 'none', matchedId: null, matchedName: null, candidates: [], distance: null, autoAccepted: false, reason: '' };
		if (!raw) { row.reason = '文字が取れなかった'; return row; }
		var norm = normalizeText(raw);
		row.norm = norm;
		if (!norm) { row.reason = '正規化すると空になった'; return row; }
		var best = bestCandidate(norm, dict.index); // common.js。窓は無い（素の Levenshtein）
		if (!best) { row.reason = '辞書が空'; return row; }
		var idOf = function (rawName) { return dict.idByNorm.get(normalizeText(rawName)) || null; };
		if (best.ok) {
			row.matchedId = idOf(best.raw);
			row.matchedName = best.raw;
			row.distance = best.dist;
			if (best.dist === 0) {
				row.kind = 'exact';
			} else {
				row.kind = 'review';
				row.autoAccepted = !!o.AUTO_ACCEPT_NEAR_MATCH;
				row.reason = '距離' + best.dist + '（完全一致ではない）';
			}
			row.candidates = nearCandidates(norm, dict, best.dist);
			return row;
		}
		if (best.tied && best.tied.length > 1) {
			row.kind = 'review';
			row.distance = best.dist;
			row.reason = '距離' + best.dist + 'で同点' + best.tied.length + '件';
			row.candidates = best.tied.map(function (name) { return { id: idOf(name), name: name, distance: best.dist }; });
			return row;
		}
		row.kind = 'none';
		row.distance = best.dist;
		row.reason = best.reason || ('距離' + best.dist + ' > 許容' + best.limit);
		// 許容距離の外だが、いちばん近かった名前は開発ログのために残す（候補としては出さない）
		row.nearest = { id: idOf(best.raw), name: best.raw, distance: best.dist };
		return row;
	}

	/** 許容距離内の候補を距離順に集める（選び直しのチップ用）。先頭は最良候補。 */
	function nearCandidates(norm, dict, bestDist) {
		var hits = [];
		for (var i = 0; i < dict.index.length; i++) {
			var e = dict.index[i];
			if (!e.norm) continue;
			var d = levenshtein(norm, e.norm);
			if (d > allowedDistance(e.norm.length)) continue;
			hits.push({ id: dict.idByNorm.get(e.norm) || null, name: e.raw, distance: d });
		}
		hits.sort(function (a, b) { return (a.distance - b.distance) || (b.name.length - a.name.length) || a.name.localeCompare(b.name, 'ja'); });
		return hits.slice(0, 8);
	}

	var KIND_RANK = { exact: 0, review: 1, none: 2 };

	/**
	 * 前処理の変種ごとの行を1つにまとめる（フェーズ0のハーネス combineReads() と同じ考え方）。
	 * 変種どうしが**別々のスキルに一意に当たった**ときは確定させず、両方を候補にして確認へ回す。
	 * それ以外は exact > review > none、同じなら距離が小さいもの、さらに同じなら信頼度が高いものを採る。
	 */
	function combineCardReads(rows) {
		if (!rows.length) return classifyCardRead('', { index: [], idByNorm: new Map() });
		var decided = rows.filter(function (r) { return r.matchedId && (r.kind === 'exact' || (r.kind === 'review' && r.autoAccepted)); });
		var ids = {};
		decided.forEach(function (r) { ids[r.matchedId] = r; });
		if (Object.keys(ids).length > 1) {
			var first = decided[0];
			return {
				raw: first.raw, norm: first.norm, kind: 'review', matchedId: null, matchedName: null,
				distance: first.distance, autoAccepted: false,
				reason: '前処理の変種ごとに別のスキルへ一意に当たった',
				candidates: Object.keys(ids).map(function (id) { return { id: id, name: ids[id].matchedName, distance: ids[id].distance }; }),
				reads: rows.map(function (r) { return { raw: r.raw, kind: r.kind, matchedName: r.matchedName, distance: r.distance, confidence: r.confidence }; })
			};
		}
		var sorted = rows.slice().sort(function (a, b) {
			var ra = KIND_RANK[a.kind] + (a.kind === 'review' && a.autoAccepted ? -0.5 : 0);
			var rb = KIND_RANK[b.kind] + (b.kind === 'review' && b.autoAccepted ? -0.5 : 0);
			if (ra !== rb) return ra - rb;
			var da = a.distance == null ? 99 : a.distance, db = b.distance == null ? 99 : b.distance;
			if (da !== db) return da - db;
			return (b.confidence || 0) - (a.confidence || 0);
		});
		var top = sorted[0];
		top.reads = rows.map(function (r) { return { raw: r.raw, kind: r.kind, matchedName: r.matchedName, distance: r.distance, confidence: r.confidence }; });
		return top;
	}

	/* ============================================================
	 * OCR
	 * ============================================================ */

	async function recognizeText(worker, canvas) {
		var res = await worker.recognize(canvas);
		var data = (res && res.data) || {};
		var text = String(data.text || '').replace(/\s+/g, ' ').trim();
		return { text: text, confidence: typeof data.confidence === 'number' ? data.confidence : null };
	}

	/** 変種を順に OCR する（失敗した変種は空の読みにして止めない）。 */
	async function recognizeVariants(worker, variants) {
		var reads = [];
		for (var v = 0; v < variants.length; v++) {
			try { reads.push(await recognizeText(worker, variants[v])); }
			catch (err) { reads.push({ text: '', confidence: null, error: String(err) }); }
		}
		return reads;
	}

	/**
	 * psm を一時的に切り替えて変種を読み直し、必ず元の psm に戻す（OPTIONS.EMPTY_READ_FALLBACK_PSM）。
	 * 戻せなかったときは以降の読みが狂うので、戻す側の失敗はそのまま投げる。
	 */
	async function recognizeVariantsWithPsm(worker, variants, psm, restorePsm) {
		await worker.setParameters({ tessedit_pageseg_mode: psm });
		try { return await recognizeVariants(worker, variants); }
		finally { await worker.setParameters({ tessedit_pageseg_mode: restorePsm }); }
	}

	/** 照合に当たった行か（確定、または決定 B-2 の自動採用）。 */
	function isDecidedRow(row) {
		return !!row.matchedId && (row.kind === 'exact' || (row.kind === 'review' && row.autoAccepted));
	}

	/**
	 * 切り出したカードを OCR して行にする。
	 * - lavender … 前処理（tightenAndScale → preprocessVariants）→ 変種ごとに OCR → 照合 → combineCardReads
	 * - gold     … 同じ前処理と OCR をするが**照合しない**。生の読みを持つだけ（決定 A-4／B-3）
	 * - unknown  … OCR しない（決定 B-6）
	 * 各行に文字の高さ（inkHeight）を付ける（決定 B-1。開発ログ用）。
	 *
	 * @param worker  Tesseract.js のワーカー（呼び出し側が作り、呼び出し側が terminate する）
	 * @param cards   analyzeSkillsetImage().cards
	 * @param dict    buildMasterDictionary() の戻り値
	 * @param opts    { onProgress(done,total), options }
	 * @returns {Promise<{ white: Array<行>, gold: Array<{raw,normKey,confidence,reads,inkHeight}>, unknown: number }>}
	 */
	async function readSkillsetCards(worker, cards, dict, opts) {
		var o = opts || {};
		var options = o.options || OPTIONS;
		var out = { white: [], gold: [], unknown: 0 };
		var total = cards.length, done = 0;
		for (var i = 0; i < cards.length; i++) {
			var c = cards[i];
			if (c.kind === 'unknown' || !c.canvas) { out.unknown++; done++; continue; }
			var ink = inkHeight(c.canvas);
			var prepared = tightenAndScale(c.canvas);
			var variants = preprocessVariants(prepared, options.MULTI_VARIANTS); // common.js
			var reads = await recognizeVariants(worker, variants);
			if (c.kind === 'gold') {
				// 照合しない。いちばん信頼度の高い非空の読みを代表にし、全部の読みも残す
				var nonEmpty = reads.filter(function (r) { return r.text; }).sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); });
				var rep = nonEmpty[0] || { text: '', confidence: null };
				out.gold.push({
					raw: rep.text,
					normKey: rep.text ? normalizeText(rep.text) : '', // 種類数を数えるためだけの鍵（決定 B-3）
					confidence: rep.confidence,
					reads: reads,
					inkHeight: ink,
					card: c.card
				});
			} else {
				var rows = reads.map(function (r) {
					var row = classifyCardRead(r.text, dict, options);
					row.confidence = r.confidence;
					return row;
				});
				var row = combineCardReads(rows);
				// 3変種すべてが空（レイアウト解析が行ごと捨てた）なら psm を変えて読み直す。
				// 当たったときだけ差し替える。当たらなければ元の行（読めなかった）のまま、読み直しの読みだけ開発ログ用に残す。
				var fallbackPsm = options.EMPTY_READ_FALLBACK_PSM;
				if (fallbackPsm && reads.every(function (r) { return !r.text; })) {
					var fbReads = await recognizeVariantsWithPsm(worker, variants, fallbackPsm, options.PSM);
					var fbRow = combineCardReads(fbReads.map(function (r) {
						var fr = classifyCardRead(r.text, dict, options);
						fr.confidence = r.confidence;
						return fr;
					}));
					if (isDecidedRow(fbRow)) {
						row = fbRow;
						row.reason = (row.reason ? row.reason + '。' : '') + 'psm' + fallbackPsm + 'で読み直して当たった';
					}
					row.fallback = { psm: fallbackPsm, adopted: isDecidedRow(fbRow), reads: fbReads.map(function (r) { return { raw: r.text, confidence: r.confidence }; }) };
				}
				row.cardKind = 'lavender';
				row.inkHeight = ink;
				row.card = c.card;
				out.white.push(row);
			}
			done++;
			if (o.onProgress) o.onProgress(done, total);
		}
		return out;
	}

	/**
	 * 「設定数 N / 200」のバッジを読む。読めなければ count:null を返すだけで止めない（決定 A-7）。
	 * 丸数字（⑥①）や全角数字で読まれることが多いので NFKC で潰してから拾う。
	 * ⑳ は NFKC で "20" に開くため、"⑳0" が "200" になる（フェーズ0のハーネス readBadgeCount と同じ）。
	 */
	async function readBadgeCount(worker, badgeCanvas) {
		if (!badgeCanvas) return { count: null, capacity: null, raw: '' };
		var r;
		try { r = await recognizeText(worker, badgeCanvas); }
		catch (err) { return { count: null, capacity: null, raw: '', error: String(err) }; }
		var m = /(\d{1,3})\s*[/／]\s*(\d{2,3})/.exec(String(r.text).normalize('NFKC'));
		if (m) return { count: Number(m[1]), capacity: Number(m[2]), raw: r.text };
		return { count: null, capacity: null, raw: r.text };
	}

	/* ============================================================
	 * 集約（複数枚 → 白の集合・金の種類数・タブごとの内訳）
	 * ============================================================ */

	/**
	 * @param perImage Array<{ name, quality, tab, kindCounts, badge:{count,capacity,raw}, white:[行], gold:[…], unknown:number, inkHeights? }>
	 * @returns {{
	 *   rows: Array<行>            … 白。ピッカーへ渡す（同じスキルは1行に。確定行を優先）
	 *   white: { accepted:number, review:number, unreadable:number, ids:string[] }
	 *   gold:  { kinds:number, cards:number, byKey:Map<normKey, Array<読み>>, raw:Array<読み> }
	 *   unknown: number
	 *   tabs:  Array<{ index, label, images, detected, lavender, gold, unknown, badgeCount, badgeCounts }>
	 *   quality: { skipped:[{name,kinds}], warned:[{name,kinds}] }
	 *   inkHeight: { median, min, max, n }
	 * }}
	 */
	function mergeSkillsetResults(perImage) {
		var byId = new Map();     // 白。スキルID → 代表の行
		var byNorm = new Map();   // 白のうち ID が決まっていない行。正規化文字列 → 行
		var unreadable = 0;
		var goldByKey = new Map();
		var goldRaw = [];
		var unknown = 0;
		var tabs = new Map();
		var skipped = [], warned = [];
		var inks = [];

		var rank = function (r) {
			if (r.kind === 'exact') return 0;
			if (r.kind === 'review' && r.autoAccepted) return 1 + (r.distance || 0) * 0.1;
			if (r.kind === 'review') return 3;
			return 4;
		};

		perImage.forEach(function (im) {
			var q = im.quality || { ok: true, rejectKinds: [], warnKinds: [] };
			if (!q.ok) { skipped.push({ name: im.name, kinds: q.rejectKinds || [] }); }
			else if (q.warnKinds && q.warnKinds.length) { warned.push({ name: im.name, kinds: q.warnKinds }); }

			var tabKey = im.tab && typeof im.tab.index === 'number' ? String(im.tab.index) : 'unknown';
			if (!tabs.has(tabKey)) tabs.set(tabKey, { index: tabKey === 'unknown' ? null : Number(tabKey), images: 0, detected: 0, lavender: 0, gold: 0, unknown: 0, badgeCount: null, badgeCounts: [] });
			var t = tabs.get(tabKey);
			t.images++;
			var kc = im.kindCounts || { lavender: 0, gold: 0, unknown: 0 };
			t.lavender += kc.lavender || 0;
			t.gold += kc.gold || 0;
			t.unknown += kc.unknown || 0;
			t.detected += (kc.lavender || 0) + (kc.gold || 0) + (kc.unknown || 0);
			if (im.badge && typeof im.badge.count === 'number') {
				t.badgeCounts.push(im.badge.count);
				if (t.badgeCount == null) t.badgeCount = im.badge.count;
			}

			(im.white || []).forEach(function (r) {
				if (typeof r.inkHeight === 'number' && r.inkHeight > 0) inks.push(r.inkHeight);
				if (!r.norm) { unreadable++; return; }
				if (r.matchedId) {
					var prev = byId.get(r.matchedId);
					if (!prev || rank(r) < rank(prev)) byId.set(r.matchedId, r);
				} else {
					var p2 = byNorm.get(r.norm);
					if (!p2 || rank(r) < rank(p2)) byNorm.set(r.norm, r);
				}
			});
			(im.gold || []).forEach(function (g) {
				if (typeof g.inkHeight === 'number' && g.inkHeight > 0) inks.push(g.inkHeight);
				goldRaw.push(g);
				if (!g.normKey) return; // 読めなかった金は種類数に入れない（数えようが無い）
				if (!goldByKey.has(g.normKey)) goldByKey.set(g.normKey, []);
				goldByKey.get(g.normKey).push(g);
			});
			unknown += im.unknown || kc.unknown || 0;
		});

		// ID が決まっていない行のうち、同じスキルが別の画像で確定していたものは落とす
		// （候補の中に確定済みのIDしか無い同点行など）。それ以外はそのまま確認へ。
		var rows = [];
		byId.forEach(function (r) { rows.push(r); });
		byNorm.forEach(function (r) {
			var allDecided = r.candidates.length > 0 && r.candidates.every(function (c) { return c.id && byId.has(c.id); });
			if (!allDecided) rows.push(r);
		});
		rows.sort(function (a, b) { return rank(a) - rank(b) || (a.matchedName || a.raw).localeCompare(b.matchedName || b.raw, 'ja'); });

		var accepted = rows.filter(function (r) { return r.kind === 'exact' || (r.kind === 'review' && r.autoAccepted); });
		var review = rows.filter(function (r) { return !(r.kind === 'exact' || (r.kind === 'review' && r.autoAccepted)); });

		var tabList = [];
		tabs.forEach(function (t) { tabList.push(t); });
		tabList.sort(function (a, b) { return (a.index == null ? 99 : a.index) - (b.index == null ? 99 : b.index); });

		inks.sort(function (a, b) { return a - b; });
		return {
			rows: rows,
			white: { accepted: accepted.length, review: review.length, unreadable: unreadable, ids: accepted.map(function (r) { return r.matchedId; }) },
			gold: { kinds: goldByKey.size, cards: goldRaw.length, byKey: goldByKey, raw: goldRaw },
			unknown: unknown,
			tabs: tabList,
			quality: { skipped: skipped, warned: warned },
			inkHeight: inks.length ? { median: inks[inks.length >> 1], min: inks[0], max: inks[inks.length - 1], n: inks.length } : { median: null, min: null, max: null, n: 0 }
		};
	}

	/* ============================================================
	 * 通し（画像1枚 → 解析＋OCR／複数枚 → 集約）
	 * ============================================================ */

	/**
	 * 読み込み済みの1枚を最後まで処理する（解析 → OCR → バッジ）。
	 * 解析が終わった時点で大きい画像は手放しているので、複数枚をこれで順に回しても
	 * 同時に持つのは切り出し（小さい canvas）だけになる。
	 */
	async function processImage(img, name, ctx) {
		var c = ctx || {};
		var an = analyzeSkillsetImage(img, name, c);
		var result = {
			name: an.name, width: an.width, height: an.height, natural: an.natural, ms: an.ms,
			quality: an.quality, tab: an.tab, kindCounts: an.kindCounts,
			badge: { count: null, capacity: null, raw: '' }, white: [], gold: [], unknown: 0
		};
		if (!an.quality.ok && !c.ignoreQuality) return result;
		var read = await readSkillsetCards(c.worker, an.cards, c.dict, { onProgress: c.onCardProgress, options: c.options });
		result.white = read.white;
		result.gold = read.gold;
		result.unknown = read.unknown;
		result.badge = await readBadgeCount(c.worker, an.badgeCanvas);
		// 切り出しの canvas はここで手放す（行には読みと矩形だけが残る）
		an.cards.forEach(function (card) { releaseCanvas(card.canvas); });
		releaseCanvas(an.badgeCanvas);
		return result;
	}

	/**
	 * File の配列を最後まで処理して集約する（special.html からの入口。コミット4で呼ぶ）。
	 * @param files   File[]
	 * @param ctx     { worker, dict, onProgress(step, info), options, ignoreQuality }
	 *                worker は呼び出し側が作る（因子OCRと同じ手順: createWorker → loadLanguage('jpn') → initialize('jpn')）。
	 *                ここで psm を 7 に設定する。**終わったら呼び出し側が必ず terminate() する**（因子OCRと同じ規律）。
	 */
	async function runSkillsetOcr(files, ctx) {
		var c = ctx || {};
		if (!c.worker) throw new Error('worker が要ります');
		if (!c.dict) throw new Error('dict（buildMasterDictionary の戻り値）が要ります');
		var options = c.options || OPTIONS;
		await c.worker.setParameters({ tessedit_pageseg_mode: options.PSM, preserve_interword_spaces: '1', user_defined_dpi: '300' });
		var perImage = [];
		var log = [];
		for (var i = 0; i < files.length; i++) {
			var file = files[i];
			if (c.onProgress) c.onProgress('image', { index: i, total: files.length, name: file.name });
			var img;
			try { img = await loadImage(file); } // common.js
			catch (err) {
				log.push('[skip] ' + file.name + ': 画像を読めませんでした ' + err);
				perImage.push({ name: file.name, quality: { ok: false, rejectKinds: ['unreadable-file'], warnKinds: [], reasons: [String(err)], warnings: [] }, tab: { index: null, reason: 'no-cards' }, kindCounts: { lavender: 0, gold: 0, unknown: 0 }, badge: { count: null }, white: [], gold: [], unknown: 0 });
				continue;
			}
			var r = await processImage(img, file.name, {
				worker: c.worker, dict: c.dict, options: options, ignoreQuality: c.ignoreQuality, tuning: c.tuning,
				onCardProgress: c.onProgress ? function (done, total) { c.onProgress('card', { index: i, total: files.length, name: file.name, done: done, cards: total }); } : null
			});
			perImage.push(r);
			log.push(formatImageLog(r));
		}
		var merged = mergeSkillsetResults(perImage);
		merged.perImage = perImage;
		merged.log = log;
		return merged;
	}

	/** 開発ログ向けの1枚ぶんの要約（px 値・文字の高さ・タブ・バッジ・内訳）。利用者向けの文ではない。 */
	function formatImageLog(r) {
		var q = r.quality || {};
		var inks = (r.white || []).concat(r.gold || []).map(function (x) { return x.inkHeight; }).filter(function (v) { return typeof v === 'number' && v > 0; }).sort(function (a, b) { return a - b; });
		var kc = r.kindCounts || {};
		var fallbacks = (r.white || []).map(function (x) { return x.fallback; }).filter(Boolean);
		var parts = [
			r.name + ' ' + r.width + 'x' + r.height + (r.natural && (r.natural.w !== r.width) ? '（原寸 ' + r.natural.w + 'x' + r.natural.h + '）' : ''),
			'画質 ' + (q.ok ? 'OK' : 'NG') + (q.rejectKinds && q.rejectKinds.length ? ' 拒否=' + q.rejectKinds.join(',') : '') + (q.warnKinds && q.warnKinds.length ? ' 警告=' + q.warnKinds.join(',') : '') + (typeof q.sharpness === 'number' ? ' 鮮明度=' + Math.round(q.sharpness) : ''),
			'タブ ' + (r.tab && typeof r.tab.index === 'number' ? (r.tab.index + 1) : ('不明:' + (r.tab && r.tab.reason))),
			'バッジ ' + (r.badge && typeof r.badge.count === 'number' ? r.badge.count + '/' + r.badge.capacity : ('読めず' + (r.badge && r.badge.raw ? '「' + r.badge.raw + '」' : ''))),
			'カード 白' + (kc.lavender || 0) + ' 金' + (kc.gold || 0) + ' 不明' + (kc.unknown || 0),
			'読み直し ' + fallbacks.length + '枚' + (fallbacks.length ? '（当たり' + fallbacks.filter(function (f) { return f.adopted; }).length + '。' + fallbacks.map(function (f) { return f.reads.map(function (r) { return '「' + r.raw + '」'; }).join(''); }).join(' ') + '）' : ''),
			'文字高 ' + (inks.length ? '中央値' + inks[inks.length >> 1] + 'px（' + inks[0] + '〜' + inks[inks.length - 1] + '）' : '—'),
			r.ms + 'ms'
		];
		return parts.join(' / ');
	}

	global.SkillsetOcr = {
		VERSION: SKILLSET_OCR_JS_VERSION,
		OPTIONS: OPTIONS,
		buildMasterDictionary: buildMasterDictionary,
		inkHeight: inkHeight,
		tightenAndScale: tightenAndScale,
		resolveActiveTab: resolveActiveTab,
		adaptQualityForSkillset: adaptQualityForSkillset,
		analyzeSkillsetImage: analyzeSkillsetImage,
		classifyCardRead: classifyCardRead,
		combineCardReads: combineCardReads,
		readSkillsetCards: readSkillsetCards,
		readBadgeCount: readBadgeCount,
		mergeSkillsetResults: mergeSkillsetResults,
		processImage: processImage,
		runSkillsetOcr: runSkillsetOcr,
		formatImageLog: formatImageLog
	};
})(typeof globalThis !== 'undefined' ? globalThis : this);
