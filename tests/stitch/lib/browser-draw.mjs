/**
 * Playwright の page.evaluate() に渡して、ブラウザ内で実行する描画ロジック。
 * すべて素の Canvas 2D API のみを使い、exam.html 側のコードには依存しない
 * （生成するのはあくまで「スクロールキャプチャ風の合成テスト画像」であり、
 * アプリ本体のコードではない）。
 *
 * 色やしきい値は、exam.html の画像結合ロジック(stitchDetectHeaderFooter /
 * stitchEstimateOverlapByPixelMAD / stitchDetectFirstSkillPanelTop /
 * stitchFindTrailingCutY / stitchCheckStandardScreenshot 等)が実データに
 * 対して使う判定基準に合わせてある。
 *
 * この関数はソースごと文字列化して page.evaluate() に渡される
 * (Node側からもブラウザ側からも同じ関数を使えるようにするため)。
 */
export function makeSliceInPage({
	width,
	headerH,
	footerH,
	contentWindowH,
	rowH,
	rowMode, // 'unique' | 'uniform'
	scrollY,
	label,
	blankFrom, // masterの絶対Y。この行以降は真っ白(トリミング対象の余白)にする。nullなら無し
	scrollbar, // null | { first, span }  content領域内でのつまみの絶対位置(px)
}) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = headerH + contentWindowH + footerH;
	const ctx = canvas.getContext('2d');

	// --- 固定ヘッダー(全スライスで完全に同一のピクセル) ---
	ctx.fillStyle = 'rgb(250,250,252)';
	ctx.fillRect(0, 0, width, headerH);
	ctx.fillStyle = '#333333';
	ctx.font = 'bold 28px sans-serif';
	ctx.textBaseline = 'top';
	ctx.fillText('[header] ' + label, 20, 20);
	ctx.strokeStyle = 'rgb(220,220,220)';
	ctx.lineWidth = 2;
	ctx.strokeRect(1, 1, width - 2, headerH - 2);

	// --- スクロール領域(マスター座標 scrollY 〜 scrollY+contentWindowH を描画) ---
	ctx.save();
	ctx.translate(0, headerH);
	ctx.beginPath();
	ctx.rect(0, 0, width, contentWindowH);
	ctx.clip();
	ctx.translate(0, -scrollY);

	const rowFrom = Math.floor(scrollY / rowH);
	const rowTo = Math.ceil((scrollY + contentWindowH) / rowH);
	for (let r = rowFrom; r <= rowTo; r++) {
		const rowTopAbs = r * rowH;
		if (blankFrom != null && rowTopAbs >= blankFrom) {
			ctx.fillStyle = 'rgb(255,255,255)';
			ctx.fillRect(0, rowTopAbs, width, rowH);
			continue;
		}
		// 行の背景("ほぼ白"だが isBlankish(r>244,g>244,b>244) には絶対に
		// 該当しない色。意図しない箇所でのトリミング誤爆を防ぐため)。
		ctx.fillStyle = 'rgb(236,239,238)';
		ctx.fillRect(0, rowTopAbs, width, rowH);

		if (rowMode === 'unique') {
			// 【重要】ベタ塗りの矩形だけだと、正しい位置の前後数pxもほぼ同じ
			// 差分になり(平坦な谷)、MADベースの位置合わせが「一致度が低い」
			// と誤判定してしまう。実際のスキルアイコンにあるような細かい
			// テクスチャの代わりに、行(縦方向1px)ごとに疑似乱数の濃淡を重ね、
			// 縦方向のズレに対してMADが鋭く反応するようにする。周期性のある
			// パターンだと数px違いの位置でも偶然位相が揃ってしまうため、
			// 周期を持たないハッシュ由来のノイズを使う。
			for (let ty = 0; ty < rowH; ty++) {
				const yAbs = rowTopAbs + ty;
				let h = (yAbs ^ 0x9e3779b9) >>> 0;
				h = Math.imul(h, 0x85ebca6b);
				h ^= h >>> 13;
				h = Math.imul(h, 0xc2b2ae35);
				h ^= h >>> 16;
				const shade = 210 + ((h >>> 0) % 30); // 210-239 (isBlankishには該当しない)
				ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 2})`;
				ctx.fillRect(0, yAbs, width, 1);
			}

			const hue = (r * 47) % 360;
			ctx.fillStyle = `hsl(${hue}, 55%, 55%)`;
			ctx.fillRect(24, rowTopAbs + 15, 70, 80);
			ctx.fillStyle = '#1a1a1a';
			ctx.font = 'bold 56px sans-serif';
			ctx.textBaseline = 'top';
			ctx.fillText(String(r), 130, rowTopAbs + 22);
		} else {
			// uniform: 行ごとの見分けがつかない単調なパターン。実データで
			// 報告された「丸角パネル・星アイコンが行によらずほぼ同じ形」を模す。
			ctx.strokeStyle = 'rgb(210,213,212)';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(0, rowTopAbs + 4);
			ctx.lineTo(width, rowTopAbs + 4);
			ctx.stroke();
		}
	}

	ctx.restore();

	// スクロールバーはコンテンツ領域(ヘッダーの下)基準の相対Yで描く。
	// ヘッダー分のオフセットを足し忘れると、stitchDetectScrollbarOrder が
	// 見る範囲(headerEnd〜footerStart)からつまみがずれてしまう。
	if (scrollbar) {
		ctx.fillStyle = 'rgb(90,90,90)';
		ctx.fillRect(870, headerH + scrollbar.first, 6, scrollbar.span);
	}

	// --- 固定フッター(全スライスで完全に同一のピクセル) ---
	ctx.fillStyle = 'rgb(248,248,250)';
	ctx.fillRect(0, headerH + contentWindowH, width, footerH);
	ctx.fillStyle = '#555555';
	ctx.font = '22px sans-serif';
	ctx.textBaseline = 'top';
	ctx.fillText('[footer: 閉じる]', 20, headerH + contentWindowH + 20);

	return canvas.toDataURL('image/png');
}
