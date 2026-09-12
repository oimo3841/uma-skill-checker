/* ============================================================
 * 画像結合機能（スクロールキャプチャの縦結合＋複数人分の横結合）
 * ------------------------------------------------------------
 * exam.html / special.html の両方で使う共通ロジック。元は両ファイルに
 * ほぼ同一の実装が約700行ずつ重複しており、修正のたびに手動で両方へ
 * 反映する運用でズレるリスクがあったため、本ファイルに切り出した。
 * 各ファイル固有のUI組み立て（バナー描画・セット単位の結合処理など）は
 * 引き続き exam.html / special.html 側に残す。
 * OCRマッチング用の loadImage() は js/common.js のものをそのまま利用する
 * （同名関数の重複定義を避けるため、ここでは再定義しない）。
 * devGeometry は各HTML側で宣言されるグローバルな開発ログ配列を利用する。
 * 保存領域の読み書きは各HTML側の readStored() / writeStored()
 * （try/catch で包んだ小さな関数）をそのまま使う。
 * ============================================================ */

// このファイルの版。B節ルール4の3点一致（内部定数・各HTMLの ?v=・npm run test:verify）の対象。
// 中身を変更したらこの日付も更新すること。
const STITCH_JS_VERSION = '2026-09-12a';

// 画像結合用の簡易ログ。既存の開発ログ（devGeometry）に相乗りさせることで、
// 「開発ログを表示」チェックを入れれば結合処理の詳細も確認できるようにする。
function stitchLog(msg) {
	devGeometry.push('[画像結合] ' + msg);
}

function stitchImgToCanvas(img) {
	const c = document.createElement('canvas');
	c.width = img.naturalWidth;
	c.height = img.naturalHeight;
	const ctx = c.getContext('2d', { willReadFrequently: true });
	ctx.drawImage(img, 0, 0);
	return c;
}

// 【修正】左右端（キャラ切り替え用のナビ矢印など、明滅アニメーションする
// 装飾）だけの差分を「本文がスクロールしている」と誤検出しないよう、
// 比較対象を中央部（左右20%を除いた範囲）に限定する。本文のスクロールは
// 中央部を含む全幅で差分が出るが、ナビ矢印の明滅は左右端だけで中央部の
// 差分はゼロであることを実データで確認済み。
function stitchRowDiffSignal(canvasA, canvasB, sampleStep = 4) {
	const h = Math.min(canvasA.height, canvasB.height);
	const w = Math.min(canvasA.width, canvasB.width);
	const xStart = Math.floor(w * 0.2);
	const xEnd = Math.ceil(w * 0.8);
	const ctxA = canvasA.getContext('2d', { willReadFrequently: true });
	const ctxB = canvasB.getContext('2d', { willReadFrequently: true });
	const dataA = ctxA.getImageData(0, 0, w, h).data;
	const dataB = ctxB.getImageData(0, 0, w, h).data;
	const diff = new Float64Array(h);
	for (let y = 0; y < h; y++) {
		let sum = 0, cnt = 0;
		const rowOffset = y * w * 4;
		for (let x = xStart; x < xEnd; x += sampleStep) {
			const idx = rowOffset + x * 4;
			sum += Math.abs(dataA[idx] - dataB[idx]) + Math.abs(dataA[idx + 1] - dataB[idx + 1]) + Math.abs(dataA[idx + 2] - dataB[idx + 2]);
			cnt++;
		}
		diff[y] = sum / (cnt * 3);
	}
	return diff;
}

// ヘッダー（ウマ娘詳細・ステータス・タブ）／フッター（継承元の帯グラフ・
// 閉じるボタン）の境界を、アップロードされた画像同士のピクセル差分から検出する。
// 解像度に依存せず、DMM版・スマホ版のどちらでも同じロジックで機能する。
function stitchDetectHeaderFooter(canvases, groupLabel, threshold = 5) {
	let headerEnd = Infinity;
	let footerStart = -Infinity;
	for (let i = 0; i < canvases.length - 1; i++) {
		const diff = stitchRowDiffSignal(canvases[i], canvases[i + 1]);
		let first = -1;
		for (let y = 0; y < diff.length; y++) {
			if (diff[y] > threshold) { first = y; break; }
		}
		if (first === -1) {
			stitchLog(groupLabel + ': 警告: 画像' + i + 'と画像' + (i + 1) + 'で差分が検出できませんでした（同一画像の可能性）');
			continue;
		}
		// 【修正】「一番下の差分行」をfooterStartにすると、本文より下にある
		// 固定UI（閉じるボタン等）を挟んだ先の、ぼやけた背景バナーの
		// わずかな変化（本文のスクロールとは無関係）まで拾ってしまうことが
		// 実データで確認された。本文は差分が途切れずに連続するはずなので、
		// headerEnd相当の位置から、一定長（100行）以上差分が途切れた
		// 最初の地点を「本文の終わり」とみなす。
		const quietRunLen = 100;
		let run = 0, quietStart = -1;
		for (let y = first; y < diff.length; y++) {
			if (diff[y] <= threshold) {
				run++;
				if (run >= quietRunLen) { quietStart = y - run + 1; break; }
			} else {
				run = 0;
			}
		}
		const last = (quietStart !== -1) ? quietStart - 1 : diff.length - 1;
		headerEnd = Math.min(headerEnd, first);
		footerStart = Math.max(footerStart, last + 1);
		stitchLog(groupLabel + ': 画像' + i + '-' + (i + 1) + '間の差分範囲: 行' + first + ' 〜 行' + last + (quietStart !== -1 ? '（以降は静止区間として除外）' : ''));
	}
	if (!isFinite(headerEnd) || !isFinite(footerStart)) {
		throw new Error('[' + groupLabel + '] 全画像が同一、またはヘッダー/フッター境界を検出できませんでした。');
	}
	return { headerEnd: headerEnd, footerStart: footerStart };
}

// 【新規】footerStartに、スクロール位置に関係なく全画像で同一に描画される
// 固定UI（「閉じる」ボタン等）が紛れ込むことがある。画像の一番下から
// 上に向かって走査し、「全画像で完全に同一な行」が続く範囲（＝固定UI）を
// 検出して、footerStartをその手前まで引き上げる。
function stitchTrimFixedFooterChrome(canvases, headerEnd, footerStart, groupLabel) {
	if (canvases.length < 2) return footerStart;
	const w = canvases[0].width;
	const fullH = canvases[0].height;
	const ctxs = canvases.map(c => c.getContext('2d', { willReadFrequently: true }));
	const minContent = headerEnd + 100;
	let y = fullH - 1;
	outer:
	while (y > minContent) {
		const rows = ctxs.map(ctx => ctx.getImageData(0, y, w, 1).data);
		for (let i = 1; i < rows.length; i++) {
			for (let x = 0; x < rows[0].length; x += 12) {
				if (Math.abs(rows[0][x] - rows[i][x]) > 4) break outer;
			}
		}
		y--;
	}
	const trimmed = Math.min(footerStart, y + 1);
	if (trimmed < footerStart) {
		stitchLog(groupLabel + ': footerStart内に全画像で同一の固定UI領域を検出。footerStartを' + footerStart + '→' + trimmed + 'に補正します。');
	}
	return trimmed;
}

// ── 画像の並び順と継ぎ目の推定 ──────────────────────────────
// 【全面差し替え 2026-09-12】
// 旧方式は「スクロールバーのつまみ位置で並び替え」＋「上画像の末尾から切り出した
// 固定長テンプレートを下画像上でスライドさせ、平均絶対差分(MAD)が最小の位置を
// 継ぎ目とする」だったが、実機スクリーンショット(test-images/20260910ライス,
// 20260911ルドルフ1, 20260911ルドルフ2)での検証で次の3点の欠陥が確認された。
//
//  (1) つまみの位置は並び順の根拠にならない。ライスの3枚は、本文を見れば
//      image6→image7→image8 の順なのに、つまみの上端は 1753 / 1832 / 1790 で、
//      一番下までスクロールした image8 のつまみだけが image7 より上に、しかも
//      短く(126px 対 146px)描かれていた。検出自体は「成功」するので、誤った
//      並び [0,2,1] をそのまま採用し、末尾のスキル5行が欠落していた。
//  (2) つまみを探す列の選び方も脆い。幅の75%から右へ走査して「1枚目でそれらしい
//      暗い縦線が見つかった最初の列」を採るため、ルドルフではつまみの角丸の先端が
//      わずかに写り込んだ列(x=1121)を掴み、他の画像には同じ列に何も無いので
//      並び替え自体を断念していた。
//  (3) 固定長テンプレート(150行)方式は、重なりが「テンプレート長+余白」=160行より
//      小さい継ぎ目を原理的に探索できない。ルドルフ1には重なり121行の継ぎ目があり、
//      探索範囲外なので誤った位置(217行)を採用してスキル1行が丸ごと消えていた。
//      さらにスキルパネルは行によらずほぼ同じ形なので、150行程度の窓では行ピッチ
//      (約97行)ごとにほぼ同値の谷ができ、正解と誤答の差が MAD 5.35 対 5.44 しか
//      無く、事実上区別できていなかった。
//
// 新方式は、重なり領域『全体』を突き合わせて「明らかに食い違う画素の割合」
// (badRate)が最小になるスクロール量を1px刻みで探す。領域全体を使うので判断材料が
// 桁違いに増え、実機3ケース8継ぎ目すべてで正解を当て、正解と次点の差が3.4〜23倍に
// 開くことを確認済み。平均差分ではなく「閾値を超えた画素の割合」なので、窓を広げる
// ほど値が下がり続ける(旧方式で問題になった)偏りも生じない。並び順も同じ尺度で決める。

const STITCH_DIFF_THRESHOLD = 24;      // この差(0-255階調)を超えた画素を「食い違い」と数える
const STITCH_MIN_OVERLAP = 60;         // これ未満しか重ならない継ぎ目は候補にしない
const STITCH_BAD_RATE_LIMIT = 0.03;    // 不一致率がこれ以上なら「継ぎ目として怪しい」
const STITCH_BAD_RATE_MARGIN = 2.0;    // 次点との比がこれ未満なら「決め手に欠ける」
const STITCH_SECOND_GUARD = 40;        // 次点を探すとき最良値の±この範囲は同じ谷とみなす

// 突き合わせに使う本文領域だけを、グレースケール1バイト/画素の平面に落としておく。
// 継ぎ目探索は同じ画素を何百回も読むので、getImageData を毎回呼ばないようにする。
function stitchContentPlane(canvas, headerEnd, footerStart, xStart, xEnd) {
	const w = xEnd - xStart;
	const h = footerStart - headerEnd;
	const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(xStart, headerEnd, w, h).data;
	const gray = new Uint8Array(w * h);
	for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
		gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
	}
	return { gray: gray, w: w, h: h };
}

// 下画像を d 行ぶんスクロールした位置として重ねたときの「食い違い画素の割合」を、
// d = 1 〜 (本文高さ - 最小重なり) について総当たりで求める。
// 重なりが白紙同士になる位置は、いくら一致していても根拠にならないので無効扱いにする。
function stitchScanShiftBadRates(planeTop, planeBottom, yStep, xStep) {
	const w = planeTop.w, h = planeTop.h;
	const A = planeTop.gray, B = planeBottom.gray;
	const maxShift = h - STITCH_MIN_OVERLAP;
	const rates = new Float64Array(maxShift + 1).fill(Infinity);
	for (let d = 1; d <= maxShift; d++) {
		const rows = h - d;
		let bad = 0, tot = 0, ink = 0;
		for (let y = 0; y < rows; y += yStep) {
			const ra = (y + d) * w, rb = y * w;
			for (let x = 0; x < w; x += xStep) {
				const a = A[ra + x], b = B[rb + x];
				if (a < 240 || b < 240) ink++;
				if (Math.abs(a - b) > STITCH_DIFF_THRESHOLD) bad++;
				tot++;
			}
		}
		if (tot === 0 || ink < tot * 0.05) continue;
		rates[d] = bad / tot;
	}
	return rates;
}

// 最良のスクロール量と、その確からしさ（不一致率そのものと、離れた位置の次点との比）。
function stitchMeasureSeam(planeTop, planeBottom, yStep, xStep) {
	const rates = stitchScanShiftBadRates(planeTop, planeBottom, yStep, xStep);
	let shift = -1, badRate = Infinity;
	for (let d = 1; d < rates.length; d++) {
		if (rates[d] < badRate) { badRate = rates[d]; shift = d; }
	}
	let secondBadRate = Infinity;
	for (let d = 1; d < rates.length; d++) {
		if (Math.abs(d - shift) > STITCH_SECOND_GUARD && rates[d] < secondBadRate) secondBadRate = rates[d];
	}
	const confident = shift > 0
		&& badRate < STITCH_BAD_RATE_LIMIT
		&& (!isFinite(secondBadRate) || secondBadRate / badRate >= STITCH_BAD_RATE_MARGIN);
	return {
		shift: shift,
		overlap: shift > 0 ? planeTop.h - shift : STITCH_MIN_OVERLAP,
		badRate: badRate,
		secondBadRate: secondBadRate,
		confident: confident,
	};
}

function stitchFormatSeam(r) {
	const pct = isFinite(r.badRate) ? (r.badRate * 100).toFixed(2) + '%' : '—';
	const second = isFinite(r.secondBadRate) ? (r.secondBadRate * 100).toFixed(2) + '%' : '—';
	return 'オーバーラップ=' + r.overlap + '行 (不一致率=' + pct + '/次点' + second + ', 信頼度' + (r.confident ? '高' : '低') + ')';
}

// 並び順を決める。アップロード順のまま全継ぎ目が十分確からしければ、それを採用する
// （ユーザーは普通スクロール順に選ぶので、無用な並び替えで壊さないため）。
// 怪しい継ぎ目がある場合だけ、全ての順序対を粗く評価して最良の並びを総当たりで探す。
function stitchResolveOrder(planes, groupLabel) {
	const n = planes.length;
	const asUploaded = [];
	for (let i = 0; i < n - 1; i++) asUploaded.push(stitchMeasureSeam(planes[i], planes[i + 1], 2, 3));
	if (asUploaded.every(s => s.confident)) {
		return { order: planes.map((p, i) => i), seams: asUploaded };
	}

	stitchLog(groupLabel + ': アップロード順では確からしくない継ぎ目があるため、並び順を探索します。');
	if (n > 7) {
		stitchLog(groupLabel + ': 画像が' + n + '枚と多いため並び順の総当たりは行わず、アップロード順を使用します。');
		return { order: planes.map((p, i) => i), seams: asUploaded };
	}

	// cost[i][j] = 画像jを画像iの真下に置いたときの不一致率（小さいほど繋がりが良い）
	const cost = [];
	for (let i = 0; i < n; i++) {
		cost.push([]);
		for (let j = 0; j < n; j++) {
			cost[i].push(i === j ? Infinity : stitchMeasureSeam(planes[i], planes[j], 6, 6).badRate);
		}
	}

	let bestOrder = planes.map((p, i) => i);
	let bestCost = Infinity;
	const used = new Array(n).fill(false);
	const cur = [];
	(function walk(sum) {
		if (sum >= bestCost) return;
		if (cur.length === n) { bestCost = sum; bestOrder = cur.slice(); return; }
		for (let i = 0; i < n; i++) {
			if (used[i]) continue;
			const add = cur.length === 0 ? 0 : cost[cur[cur.length - 1]][i];
			if (!isFinite(add)) continue;
			used[i] = true; cur.push(i);
			walk(sum + add);
			cur.pop(); used[i] = false;
		}
	})(0);

	if (bestOrder.join() === planes.map((p, i) => i).join()) {
		stitchLog(groupLabel + ': 探索の結果もアップロード順が最良でした。');
		return { order: bestOrder, seams: asUploaded };
	}
	stitchLog(groupLabel + ': 並び順を [' + bestOrder.join(', ') + '] に並び替えます。');
	const seams = [];
	for (let i = 0; i < n - 1; i++) seams.push(stitchMeasureSeam(planes[bestOrder[i]], planes[bestOrder[i + 1]], 2, 3));
	return { order: bestOrder, seams: seams };
}

// 標準的なスクリーンショットかどうかの簡易判定（実測済みDMM版・スマホ版の
// 解像度/アスペクト比のホワイトリスト方式）。結合済み画像や加工済み画像など、
// レンジ外の画像がアップロードされた場合は結合処理そのものを中止する。
const STITCH_KNOWN_SCREENSHOT_PROFILES = [
	{ label: 'DMM版(ブラウザ)相当', minWidth: 700, maxWidth: 1300, minAspect: 1.55, maxAspect: 1.95 },
	{ label: 'スマホ版相当', minWidth: 700, maxWidth: 1500, minAspect: 1.9, maxAspect: 2.5 }
];

function stitchCheckStandardScreenshot(canvas) {
	const w = canvas.width, h = canvas.height;
	const aspect = h / w;
	for (const p of STITCH_KNOWN_SCREENSHOT_PROFILES) {
		if (w >= p.minWidth && w <= p.maxWidth && aspect >= p.minAspect && aspect <= p.maxAspect) {
			return { ok: true, profile: p.label };
		}
	}
	return { ok: false, profile: null, w: w, h: h, aspect: aspect };
}

// 「因子」バーや「継承元」ラベルなど、直前に何があっても関係なく、最初の
// 青いスキルパネル（スピード/根性等のカテゴリタグ）が実際に始まる行を直接
// 検出する。1枚目の画像にのみ適用する（2枚目以降は既に本文中のため不要）。
function stitchDetectFirstSkillPanelTop(canvas, headerEnd) {
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const w = canvas.width;
	const xSample = Math.floor(w * 0.3);
	const maxScan = Math.floor(w * 0.25);
	const data = ctx.getImageData(xSample, headerEnd, 1, maxScan).data;

	function isBluePanel(r, g, b) { return b > 200 && g > 140 && g < 220 && r < 120; }

	for (let y = 0; y < maxScan; y++) {
		const idx = y * 4;
		if (isBluePanel(data[idx], data[idx + 1], data[idx + 2])) {
			return headerEnd + y;
		}
	}
	return headerEnd;
}

// スキル一覧本体が終わった後に続く不要な領域（次のキャラクターの青枠、
// 「継承履歴」等の緑バー、「継承元」テキストのみの余白など）を検出し、
// その直前で打ち切るための行番号を返す。
function stitchFindTrailingCutY(canvas, searchStartY) {
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const w = canvas.width;
	const h = canvas.height;
	if (searchStartY >= h) return h;
	const xLeft = Math.floor(w * 0.3);
	const data = ctx.getImageData(xLeft, searchStartY, 1, h - searchStartY).data;

	function isBluePanel(r, g, b) { return b > 200 && g > 140 && g < 220 && r < 120; }
	function isGreenBar(r, g, b) { return g > 160 && r > 80 && r < 170 && b < 70; }
	function isBlankish(r, g, b) { return r > 244 && g > 244 && b > 244; }

	const blankThreshold = Math.round(w * 0.035);
	let blankRun = 0;
	const rows = data.length / 4;
	for (let y = 0; y < rows; y++) {
		const idx = y * 4;
		const r = data[idx], g = data[idx + 1], b = data[idx + 2];
		if (isBluePanel(r, g, b) || isGreenBar(r, g, b)) {
			return searchStartY + y;
		}
		if (isBlankish(r, g, b)) {
			blankRun++;
			if (blankRun >= blankThreshold) {
				return searchStartY + y - blankRun + 1;
			}
		} else {
			blankRun = 0;
		}
	}
	return h;
}

// 1人分の画像配列を縦結合し、結果Canvasを返す。
// ヘッダー/フッターは完全除外し、スキルパネル自体のみを出力する。
async function stitchOnePerson(files, groupLabel) {
	if (files.length === 0) return null;
	if (files.length === 1) {
		throw new Error('[' + groupLabel + '] 画像が1枚のみです。結合には2枚以上が必要なため処理を中止します。');
	}
	stitchLog(groupLabel + ': ' + files.length + '枚を読み込みます...');
	const imgs = [];
	for (const f of files) imgs.push(await loadImage(f));
	const canvases = imgs.map(stitchImgToCanvas);

	for (let i = 0; i < canvases.length; i++) {
		const check = stitchCheckStandardScreenshot(canvases[i]);
		if (!check.ok) {
			throw new Error('[' + groupLabel + '] 画像' + i + '(' + check.w + 'x' + check.h + ', 縦横比' + check.aspect.toFixed(2) + ')が標準的なスクリーンショットのサイズ範囲外です。結合済み画像や加工済み画像がアップロードされた可能性があるため処理を中止します。');
		}
	}

	const w0 = canvases[0].width;
	for (let i = 1; i < canvases.length; i++) {
		if (canvases[i].width !== w0) {
			throw new Error('[' + groupLabel + '] 画像の幅が一致していません（画像0: ' + w0 + 'px, 画像' + i + ': ' + canvases[i].width + 'px）。標準的なスクロールキャプチャではない可能性があるため中止します。');
		}
	}

	const hf = stitchDetectHeaderFooter(canvases, groupLabel);
	const headerEnd = hf.headerEnd;
	const footerStart = stitchTrimFixedFooterChrome(canvases, headerEnd, hf.footerStart, groupLabel);
	stitchLog(groupLabel + ': ヘッダー=行0〜' + (headerEnd - 1) + '(除外), スクロール領域=行' + headerEnd + '〜' + (footerStart - 1) + ', フッター=行' + footerStart + '〜' + (canvases[0].height - 1) + '(除外)');

	const marginX = Math.floor(w0 * 0.1);
	// 左右1割を除くのは、キャラ切り替え矢印やスクロールバーなど本文と一緒に
	// スクロールしない装飾を突き合わせから外すため。
	const planes = canvases.map(c => stitchContentPlane(c, headerEnd, footerStart, marginX, w0 - marginX));
	const resolved = stitchResolveOrder(planes, groupLabel);
	const canvasesForStitch = resolved.order.map(i => canvases[i]);
	stitchLog(groupLabel + ': 並び順 = [' + resolved.order.join(', ') + ']');

	const overlaps = [];
	// 検証用：低信頼度の継ぎ目を警告として集め、結合結果に添付する
	const warnings = [];
	for (let i = 0; i < resolved.seams.length; i++) {
		const r = resolved.seams[i];
		stitchLog(groupLabel + ': 画像' + i + '→' + (i + 1) + ': ' + stitchFormatSeam(r));
		if (!r.confident) {
			const rate = isFinite(r.badRate) ? '不一致率' + (r.badRate * 100).toFixed(1) + '%' : '測定不能';
			const warnMsg = groupLabel + ': 画像' + i + '→' + (i + 1) + 'の継ぎ目は一致度が低く(' + rate + ')、結合位置がズレている可能性があります。';
			stitchLog('⚠ ' + warnMsg);
			warnings.push(warnMsg);
		}
		overlaps.push(r.overlap);
	}

	const contentHeight = footerStart - headerEnd;
	let totalContentHeight = contentHeight;
	for (const ov of overlaps) totalContentHeight += (contentHeight - ov);

	const firstPanelTop = stitchDetectFirstSkillPanelTop(canvasesForStitch[0], headerEnd);
	const skipFirst = Math.max(0, firstPanelTop - headerEnd);

	const totalHeight = totalContentHeight - skipFirst;

	const out = document.createElement('canvas');
	out.width = w0;
	out.height = totalHeight;
	const octx = out.getContext('2d');

	let cursorY = 0;
	octx.drawImage(canvasesForStitch[0], 0, headerEnd + skipFirst, w0, contentHeight - skipFirst, 0, cursorY, w0, contentHeight - skipFirst);
	cursorY += (contentHeight - skipFirst);
	for (let i = 1; i < canvasesForStitch.length; i++) {
		const ov = overlaps[i - 1];
		const srcY = headerEnd + ov;
		const drawH = contentHeight - ov;
		octx.drawImage(canvasesForStitch[i], 0, srcY, w0, drawH, 0, cursorY, w0, drawH);
		cursorY += drawH;
	}

	const searchStartY = Math.round(w0 * 0.15);
	const cutY = stitchFindTrailingCutY(out, searchStartY);
	if (cutY < out.height) {
		const trimmed = document.createElement('canvas');
		trimmed.width = w0;
		trimmed.height = cutY;
		trimmed.getContext('2d').drawImage(out, 0, 0, w0, cutY, 0, 0, w0, cutY);
		trimmed._stitchWarnings = warnings;
		stitchLog(groupLabel + ': 縦結合完了(末尾トリミング後): ' + w0 + ' x ' + cutY);
		return trimmed;
	}

	out._stitchWarnings = warnings;
	stitchLog(groupLabel + ': 縦結合完了: ' + w0 + ' x ' + totalHeight);
	return out;
}

// 複数人分のCanvasを上端揃え・スケーリングなしで横結合する
function stitchConcatHorizontallyTopAligned(canvasList, gap) {
	gap = gap || 8;
	const totalWidth = canvasList.reduce((sum, c) => sum + c.width, 0) + gap * (canvasList.length - 1);
	const maxHeight = Math.max.apply(null, canvasList.map(c => c.height));
	const out = document.createElement('canvas');
	out.width = totalWidth;
	out.height = maxHeight;
	const ctx = out.getContext('2d');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, totalWidth, maxHeight);
	let cursorX = 0;
	for (const c of canvasList) {
		ctx.drawImage(c, cursorX, 0);
		cursorX += c.width + gap;
	}
	return out;
}

/* ============================================================
 * 結合画像を保存するときのファイル名
 * ------------------------------------------------------------
 * 形式は `YYMMDD_NNN_指定名称`（例 260912_001_9月因子.png）。
 *   YYMMDD … 年月日の下2桁ずつ。**必ず現地時間で取る**
 *            （協定世界時で取ると日本の 00〜09時の保存が前日の日付になる）
 *   NNN    … その日の通し番号。3桁ゼロ埋め。999を超えたら桁が増える
 *   指定名称 … 利用者が入力した名前。空欄なら `260912_001`（末尾に区切りを残さない）
 *
 * 区切りはアンダーバー。指定名称の中のアンダーバーは置き換えないので、
 * **後から機械的に読み解くときは先頭2つのアンダーバーだけで区切る**こと。
 *
 * 置き場所について: 結合画像を保存するのは special.html と exam.html の2つだけで、
 * その2つが読む共有ファイルがこの stitch.js なので、ここに置いている。
 * js/common.js はOCR・照合のレイヤーで役割が違ううえ、
 * tests/skillset/ のハーネスが Node の vm でそのまま評価しているため、
 * localStorage に触るコードを持ち込まない。
 * ============================================================ */

// 通し番号は「全ツールで1つ」。ツールごとに分けると、special と exam が
// 同じ日にどちらも 001 を作ってしまう。保存領域は同一オリジンで共有される。
// 指定名称のほうはツールごとに別キー（special で入れた名前が exam で出てこないように）。
const STITCH_SEQ_STORAGE_KEY = 'uma-shared-save-seq';
const STITCH_NAME_MAX_LENGTH = 40;

// ファイル名に使えない文字。放っておくと保存に失敗するか、ブラウザが黙って
// アンダーバーへ置き換える（＝画面に出ている名前と実際のファイル名がずれる）。
// 先回りして全角へ置き換え、見た目を保ったまま安全な名前にする。
// Windowsの予約名（CON・PRN 等）は、先頭に必ず `YYMMDD_NNN` が付くので起こり得ない。
const STITCH_FULLWIDTH_MAP = {
	'/': '／', '\\': '＼', ':': '：', '*': '＊', '?': '？',
	'"': '”', '<': '＜', '>': '＞', '|': '｜'
};

/** 今日の YYMMDD。現地時間で取る（getFullYear/getMonth/getDate はブラウザの現地時間）。 */
function stitchTodayStamp(now) {
	const d = now || new Date();
	return String(d.getFullYear() % 100).padStart(2, '0')
		+ String(d.getMonth() + 1).padStart(2, '0')
		+ String(d.getDate()).padStart(2, '0');
}

/**
 * 入力欄に映す用の整形。使えない文字を全角へ置き換え、制御文字を落とし、長さを止める。
 * **前後の空白は削らない。** 打っている途中の「先行 」が即座に詰まると、
 * 続けて「A」を打てなくなるため。空白の始末はファイル名を作るときに行う。
 */
function stitchSanitizeSaveNameInput(raw) {
	if (!raw) return '';
	let s = String(raw);
	s = s.replace(/[\u0000-\u001f\u007f]/g, '');
	s = s.replace(/[\/\\:*?"<>|]/g, (c) => STITCH_FULLWIDTH_MAP[c]);
	if (s.length > STITCH_NAME_MAX_LENGTH) s = s.slice(0, STITCH_NAME_MAX_LENGTH);
	return s;
}

/**
 * ファイル名に入れる用の整形。上の整形に加えて、前後の空白と末尾のピリオドを落とす。
 * Windows は末尾の空白・ピリオドを黙って落とすので、こちらで先に始末しておく。
 */
function stitchSanitizeSaveName(raw) {
	let s = stitchSanitizeSaveNameInput(raw);
	s = s.replace(/^[\s　]+/, '');
	s = s.replace(/[\s　.．]+$/, '');
	return s;
}

/** `260912_001_9月因子` を組み立てる（拡張子は付けない）。名前が空なら `260912_001`。 */
function stitchFormatSaveName(stamp, seq, rawName) {
	const name = stitchSanitizeSaveName(rawName);
	// 999 を超えたら4桁へ伸ばす。padStart は長い文字列を切らないので、これだけで足りる。
	// 桁が揃わなくなるより「番号が飛ばない・止まらない」ことを優先する。
	const num = String(seq).padStart(3, '0');
	return stamp + '_' + num + (name ? '_' + name : '');
}

/** 保存済みの {date, n}。読めない・壊れている・形が違うときは null。 */
function stitchReadSaveSeq() {
	try {
		const raw = readStored(STITCH_SEQ_STORAGE_KEY);
		if (!raw) return null;
		const rec = JSON.parse(raw);
		if (!rec || typeof rec.date !== 'string') return null;
		if (typeof rec.n !== 'number' || !isFinite(rec.n) || rec.n < 1) return null;
		return rec;
	} catch (e) {
		return null;
	}
}

/**
 * 次に使う番号を「消費せずに」返す。
 * 日付が変わっていれば 001 に戻る。判定は押した瞬間の突き合わせだけで足りるので、
 * 日付の変化を見張るタイマーは要らない（画面を開きっぱなしでも正しく戻る）。
 */
function stitchPeekSaveSeq(stamp) {
	const today = stamp || stitchTodayStamp();
	const rec = stitchReadSaveSeq();
	return (rec && rec.date === today) ? rec.n + 1 : 1;
}

/** 次に使う番号を返し、同時に書き戻す（＝1つ進める）。 */
function stitchConsumeSaveSeq(stamp) {
	const today = stamp || stitchTodayStamp();
	const seq = stitchPeekSaveSeq(today);
	writeStored(STITCH_SEQ_STORAGE_KEY, JSON.stringify({ date: today, n: seq }));
	return seq;
}

/**
 * 保存リンクにファイル名を付ける。getRawName() は指定名称を返す関数。
 *
 * download 属性が読まれるのは「押した瞬間」ではなく「ダウンロードが始まる瞬間」で、
 * **長押しの『リンク先を保存』やドラッグでの保存では click が飛ばない**
 * （Chromium で実測: 右クリック＝長押し相当では pointerdown / mousedown /
 *   auxclick / contextmenu、ドラッグでは pointerdown / mousedown / dragstart。
 *   いずれも click は飛ばない）。
 *
 * そこで、**どの保存経路でも必ず最初に飛ぶ pointerdown で名前を入れ直す**
 * （peek＝番号は消費しない）。そのうえで、
 *   - click        … 通常の保存。番号を1つ進める
 *   - contextmenu  … 長押し／右クリックからの保存。番号を1つ進める
 *   - dragstart    … ドラッグでの保存。番号を1つ進める
 * とする。番号を進めたあとは入れ直さない（メニューを開いたまま入れ替わると、
 * 実際に保存されるファイルの名前が変わってしまうため）。次の操作の
 * pointerdown で入れ直されるので、それで足りる。
 *
 * メニューを開いて何も選ばずに閉じた場合は番号が1つ飛ぶが、
 * 番号が飛ぶことより同じ名前が2回出るほうが困るので、この向きに倒している。
 */
function stitchAttachSaveName(link, getRawName) {
	function nameNow(seq) {
		return stitchFormatSaveName(stitchTodayStamp(), seq, getRawName()) + '.png';
	}
	function peek() { link.download = nameNow(stitchPeekSaveSeq()); }
	function consume() { link.download = nameNow(stitchConsumeSaveSeq()); }

	peek();
	link.addEventListener('pointerdown', peek);
	link.addEventListener('click', consume);
	link.addEventListener('contextmenu', consume);
	link.addEventListener('dragstart', consume);
	// 名前の欄が変わったときに呼び直せるようにしておく（stitchRefreshSaveNames）
	link._stitchRefreshSaveName = peek;
	return peek;
}

/** 指定名称の欄が変わったときに、並んでいる保存リンクの名前を一斉に入れ直す。 */
function stitchRefreshSaveNames(container) {
	if (!container) return;
	const links = container.querySelectorAll('a[download]');
	for (const a of links) {
		if (typeof a._stitchRefreshSaveName === 'function') a._stitchRefreshSaveName();
	}
}
