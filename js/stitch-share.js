/* 結合画像の保存を iPhone・iPad では共有のシートにする（T122・T147）。special.html・exam.html の「PNGをダウンロード」が使う。
 * iOS・iPadOS で押すと、今のダウンロードの代わりに navigator.share で PNG のファイルを渡す（シートの「画像を保存」で写真に入る）。
 * Android（T147・C-351。共有のシートに保存の項目が無いことが多く、ダウンロードならギャラリーに出る）と
 * PC（Windows・Mac・Linux）と、共有のシートが使えない端末は、元の <a download> のまま（何もしない）。
 *
 * - 端末は OS で分ける。タッチの有無や pointer: coarse では分けない（決定 325・419）。
 *   Windows の Chrome は navigator.share を持っているので、タッチパネル付きの Surface でシートを出さない。
 * - ファイル名と番号は js/stitch.js の stitchAttachSaveName が決める。click の受け手を止めない（stopPropagation しない）。
 *   stitchAttachSaveName の後に attach を呼ぶと、ここが動くときには link.download が番号を進めた後の名前になっている。
 * - 押した操作から離れた share は断られることがあるので、share までに非同期の処理を挟まない。
 *   PNG は手元にあるので、押したときにその場で File にする（読み直しも描き直しも要らない）。
 *   special.html は結合画像を Blob の object URL で持つ（T133）ので、attach の2つ目の引数で Blob を渡す（押したときに呼んで受け取る）。
 *   渡さないとき（exam.html）は、今までどおり href の data URL から作る。
 * - 長押しのメニュー（contextmenu）・ドラッグの保存は click が飛ばないので、ここを通らない。今のまま。
 */
(function () {
	'use strict';
	const STITCH_SHARE_JS_VERSION = '2026-11-09a';
	// 2度押しの2回目を捨てる間（シートが開くまでの間に押されたとき）。フラグにしないのは、share の結果が返らない端末でボタンが効かなくなるのを避けるため
	const DOUBLE_PRESS_MS = 1000;

	/** iOS・iPadOS か（Android は含めない。T147）。iPadOS の Safari は既定で Mac と同じ UA を名乗るので、MacIntel でタッチ点が複数あるものを iPad と見る（Mac にタッチの画面は無い）。 */
	function isIosOrIpadOs(nav) {
		if (/iPhone|iPad|iPod/.test(String(nav.userAgent || ''))) return true;
		return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
	}

	function dataUrlToPngBlob(url) {
		const bin = atob(url.slice(url.indexOf(',') + 1));
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return new Blob([bytes], { type: 'image/png' });
	}

	/** シートを出せなかったときの今のダウンロード。保存のリンク自身を押し直すと番号がもう1つ進むので、別の a で行う。 */
	function downloadNow(url, name) {
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	let lastShareAt = -Infinity;

	/** 保存のリンクに付ける。stitchAttachSaveName の後に呼ぶ。
	 *  getBlob … PNG の Blob を返す関数（href が object URL のとき。T133）。無ければ href の PNG の data URL から作る。 */
	function attach(link, getBlob) {
		link.addEventListener('click', (e) => {
			const nav = navigator;
			if (!isIosOrIpadOs(nav) ||!nav.share || !nav.canShare) return;
			if (performance.now() - lastShareAt < DOUBLE_PRESS_MS) { e.preventDefault(); return; }
			let file, shared;
			try {
				const blob = typeof getBlob === 'function' ? getBlob() : null;
				if (!blob && !/^data:/.test(link.href)) return;   // PNG が手元に無ければ今のダウンロードのまま
				file = new File([blob || dataUrlToPngBlob(link.href)], link.download, { type: 'image/png' });
				if (!nav.canShare({ files: [file] })) return;
				shared = nav.share({ files: [file] });
			} catch (err) {
				return; // ここで止まったら今のダウンロードのまま（preventDefault の前）
			}
			e.preventDefault();
			lastShareAt = performance.now();
			Promise.resolve(shared).catch((err) => {
				// 閉じただけ（AbortError）・すでに開いている（InvalidStateError）は何も出さない。それ以外（断られたなど）は今のダウンロードに戻る
				const name = err && err.name;
				if (name !== 'AbortError' && name !== 'InvalidStateError') downloadNow(link.href, file.name);
			});
		});
	}

	window.UmaStitchShare = Object.freeze({ version: STITCH_SHARE_JS_VERSION, isIosOrIpadOs, attach });
})();
