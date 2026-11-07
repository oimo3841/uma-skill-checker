/* 結合画像の保存をスマホでは共有のシートにする（T122）。special.html・exam.html の「PNGをダウンロード」が使う。
 * スマホ（iOS・iPadOS・Android）で押すと、今のダウンロードの代わりに navigator.share で PNG のファイルを渡す。
 * PC（Windows・Mac・Linux）と、共有のシートが使えない端末は、今の <a download> のまま（何もしない）。
 *
 * - スマホかどうかは OS で分ける。タッチの有無や pointer: coarse では分けない（決定 325・419）。
 *   Windows の Chrome は navigator.share を持っているので、タッチパネル付きの Surface でシートを出さない。
 * - ファイル名と番号は js/stitch.js の stitchAttachSaveName が決める。click の受け手を止めない（stopPropagation しない）。
 *   stitchAttachSaveName の後に attach を呼ぶと、ここが動くときには link.download が番号を進めた後の名前になっている。
 * - 押した操作から離れた share は断られることがあるので、share までに非同期の処理を挟まない。
 *   href の data URL は手元にあるので、押したときにその場で File にする（読み直しも描き直しも要らない）。
 * - 長押しのメニュー（contextmenu）・ドラッグの保存は click が飛ばないので、ここを通らない。今のまま。
 */
(function () {
	'use strict';
	const STITCH_SHARE_JS_VERSION = '2026-11-07a';
	// 2度押しの2回目を捨てる間（シートが開くまでの間に押されたとき）。フラグにしないのは、share の結果が返らない端末でボタンが効かなくなるのを避けるため
	const DOUBLE_PRESS_MS = 1000;

	/** iOS・iPadOS・Android か。iPadOS の Safari は既定で Mac と同じ UA を名乗るので、MacIntel でタッチ点が複数あるものを iPad と見る（Mac にタッチの画面は無い）。 */
	function isMobileOs(nav) {
		if (/iPhone|iPad|iPod|Android/.test(String(nav.userAgent || ''))) return true;
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

	/** 保存のリンク（href が PNG の data URL）に付ける。stitchAttachSaveName の後に呼ぶ。 */
	function attach(link) {
		link.addEventListener('click', (e) => {
			const nav = navigator;
			if (!isMobileOs(nav) || !nav.share || !nav.canShare) return;
			if (performance.now() - lastShareAt < DOUBLE_PRESS_MS) { e.preventDefault(); return; }
			let file, shared;
			try {
				file = new File([dataUrlToPngBlob(link.href)], link.download, { type: 'image/png' });
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

	window.UmaStitchShare = Object.freeze({ version: STITCH_SHARE_JS_VERSION, isMobileOs, attach });
})();
