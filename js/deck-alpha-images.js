/* js/deck-alpha-images.js — Deck α の登録の画面へ、人ごとの結合画像を渡す部品（T126・決定 418。T119 の案1）。
 * UmaStar（special.html）・UmaExam（exam.html）・登録の画面（deck-alpha-register.html）が読む。
 *
 * ■ 渡し方
 *   - 結合のとき（送るときではない）に、1人分の画像（枠を描いたあとの Canvas）を JPEG にして、uma-deck とは別の IndexedDB に書く。
 *     送るときは今までどおり localStorage に JSON を書いてすぐ新しいタブを開く（非同期を挟まないので、ポップアップで止められない）。
 *   - 送る JSON の各人には印だけを入れる: img: { slot, token }。slot は「どのページの何人目か」（'star:0'〜'star:5'・'exam:0'〜'exam:5'）、
 *     token は「どの画像のファイルから作ったか」の印（tokenOf）。
 *   - 送る側は、結合したときのファイルと OCR の時点のファイルが同じときだけ印を入れる（OCR のあとに画像を入れ替えて結合し直すと、別の人の画像になるため）。
 *   - 登録の画面は slot で読み、書いてある token が印と同じときだけ出す（違えば・無ければ「結合画像はありません」）。
 *
 * ■ 古い画像を消す仕組み（メモリと容量を増やしすぎない）
 *   - 鍵は slot なので、1つのページで最大6件・全部で最大12件。結合のたびに同じ鍵へ上書きする（1件は実物で 119〜286KB。最大でも約3.5MB）。
 *   - 登録できたら、その送りで使った slot を消す。
 *   - 書いてから MAX_AGE_MS（3日）より古いものは、書くとき・登録の画面を開くときに消す。
 *   - 画像の Blob は IndexedDB にだけ持ち、ページの側は持ち続けない（登録の画面は今のタブの人の分だけ object URL を作る）。
 *
 * ■ 形: DB 'uma-deck-images'（版 1）・store 'shots'（keyPath 'slot'）
 *   { slot, token, blob（image/jpeg）, w, h, at（書いた時刻 ms） }
 * 失敗しても画像が出ないだけで、結合・送る・登録は今までどおり動く（例外は外へ出さない）。
 */
(function () {
	'use strict';
	const DECK_ALPHA_IMAGES_JS_VERSION = '2026-11-08a';
	const DB_NAME = 'uma-deck-images';
	const STORE = 'shots';
	const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
	const JPEG_QUALITY = 0.8;

	/* ---------- ファイルの印 ---------- */
	// 同じ File の参照なら同じ番号。ページを開くたびに違う頭（PAGE）を付けるので、前に開いたときの画像とは一致しない
	const PAGE = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	const ids = new WeakMap();
	let seq = 0;
	function idOf(f) {
		if (!f || (typeof f !== 'object' && typeof f !== 'function')) return 'x';
		if (!ids.has(f)) ids.set(f, ++seq);
		return ids.get(f);
	}
	/** 画像のファイルの並びの印（同じ File を同じ順に並べたときだけ同じ文字列）。空なら null */
	function tokenOf(files) {
		if (!files || !files.length) return null;
		return PAGE + '-' + Array.from(files, idOf).join('.');
	}

	/* ---------- IndexedDB ---------- */
	let dbP = null;
	function open() {
		if (dbP) return dbP;
		dbP = new Promise((resolve, reject) => {
			if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
			const req = indexedDB.open(DB_NAME, 1);
			req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' }); };
			req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); dbP = null; }; resolve(db); };
			req.onerror = () => reject(req.error);
			req.onblocked = () => reject(new Error('blocked'));
		});
		dbP.catch(() => { dbP = null; });
		return dbP;
	}
	function tx(mode, fn) {
		return open().then((db) => new Promise((resolve, reject) => {
			const t = db.transaction(STORE, mode);
			const st = t.objectStore(STORE);
			let out;
			try { out = fn(st); } catch (e) { reject(e); return; }
			t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
			t.onerror = () => reject(t.error);
			t.onabort = () => reject(t.error || new Error('abort'));
		}));
	}
	function sweepIn(st, now) {
		const req = st.openCursor();
		req.onsuccess = () => { const c = req.result; if (!c) return; const v = c.value; if (!v || !(v.at > now - MAX_AGE_MS)) c.delete(); c.continue(); };
	}

	/** 1人分の Canvas を JPEG にして slot へ書く。戻り値の Promise は成功で true・失敗で false（例外は出さない） */
	function save(slot, token, canvas) {
		if (!slot || !token || !canvas || typeof canvas.toBlob !== 'function') return Promise.resolve(false);
		const w = canvas.width, h = canvas.height;
		return new Promise((resolve) => {
			// toBlob は呼んだ時点の画素を写すので、このあと canvas に描き足されても画像は変わらない
			try { canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY); } catch (e) { resolve(null); }
		}).then((blob) => {
			if (!blob) return false;
			const now = Date.now();
			return tx('readwrite', (st) => { sweepIn(st, now); st.put({ slot, token, blob, w, h, at: now }); }).then(() => true);
		}).catch(() => false);
	}
	/** slot の記録（{ slot, token, blob, w, h, at }）。無い・読めないときは null */
	function load(slot) {
		if (!slot) return Promise.resolve(null);
		return tx('readonly', (st) => st.get(String(slot))).then((v) => v || null).catch(() => null);
	}
	/** slot を消す（登録できたあと） */
	function remove(slots) {
		const list = (slots || []).filter(Boolean).map(String);
		if (!list.length) return Promise.resolve();
		return tx('readwrite', (st) => { list.forEach((s) => st.delete(s)); }).catch(() => {});
	}
	/** 古いもの（MAX_AGE_MS より前に書いたもの）を消す */
	function sweep() {
		return tx('readwrite', (st) => { sweepIn(st, Date.now()); }).catch(() => {});
	}

	window.UmaDeckImages = { version: DECK_ALPHA_IMAGES_JS_VERSION, DB_NAME, STORE, MAX_AGE_MS, tokenOf, save, load, remove, sweep };
})();
