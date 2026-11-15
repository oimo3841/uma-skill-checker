/**
 * OCR のエンジンの池（T185・決定 763〜765）。special.html・exam.html の OCR（processImages）が使う。
 * js/common.js・js/stitch.js（凍結）は変えない。スキルセットの OCR（js/skillset-ocr.js）は使わない。公開するグローバルは UmaOcrPool の1つだけ。
 *
 * - 池: tesseract.js のエンジン（Tesseract.createWorker。製品と同じ jpn・同じ設定）を N 本持つ。
 *   N はスマホ（OS で見る：iOS・iPadOS・Android。ポインターでは判定しない＝325）が 2、PC は論理コア 8 以上なら 3、それより少なければ 2（764）。
 *   作るのに失敗したエンジンは数えない（本数が1つ減る）。1本も作れなければ open() は null を返し、呼び出し元は今までの1本・順の読み方に戻る。
 * - 列: recognize(canvas) で積んだ画を、空いたエンジンが先頭から読む。呼び出し元が「人・画像・前処理」の順に並べ直せば、照合に渡す行は今までと同じになる。
 *   room() は列が 2×N 未満になるまで待つ（メモリを抑える）。
 * - 順に読む列（T185 の確かめ）: Tesseract は、同じエンジンで前に「画像全体」（行の検出に失敗した画を幅 1800 にしたもの）を読んでいると、次の「画像全体」の
 *   読みが少し変わる（test-images 17ケース・認識 232回で、変わったのはそれだけ。行を積んだ画・緑因子などの小さな画は、前に何を読んでいても同じ）。
 *   そこで「画像全体」は recognizeInOrder(canvas) で、1回の OCR の中では決まった1本のエンジンが積んだ順に読む（今までの1本で順に読んだときと同じ履歴）。
 *   そのエンジンは OCR が終わったら初期化し直す（initialize＋setParameters。次の回は新しいエンジンと同じ状態から読む）。
 * - 先に用意（765）: prewarm() で用意を始める（スクショは画像を選んだとき・動画と取り込みは組み立てが終わったとき）。ページを開いたときには呼ばない。
 *   読み終わっても閉じずに使い回し、ページを離れたとき（pagehide）・5分使わなかったときに閉じる。読み取りに失敗したエンジンは作り直す。
 * - 同時に2つの OCR は走らせない: open() は前の回が close() するまで待つ。用意の途中で open() したら、1本目の用意を待って続ける（残りは用意ができしだい加わる）。
 * - 自動の検査（navigator.webdriver）では、画像を入れただけでは用意しない（検査のたびにエンジンを読まないため）。configure({ prewarm: true }) で入れる。
 */
(function () {
	'use strict';
	const OCR_POOL_JS_VERSION = '2026-11-15a';
	const PARAMS = { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' };
	const IDLE_MS = 5 * 60 * 1000;

	const cfg = {
		prewarm: !(typeof navigator !== 'undefined' && navigator.webdriver),
		size: null,        // 本数を決め打ちするとき（検査用）。null なら端末から決める
		idleMs: IDLE_MS
	};
	const st = {
		lib: null,         // エンジンを作った Tesseract（差し替えられたら作り直す）
		engines: [],       // { w, id, busy, broken, dirty（順に読む列を読んだ回。その回が終わったら初期化し直す） }
		nextId: 1,
		target: 0,         // 作ろうとした本数
		creating: 0,       // 作っている途中の本数
		firstReady: null,  // 1本目の用意（または全部の失敗）を待つ Promise
		prepT0: 0, prepMs: null,
		queue: [],         // { canvas, resolve, reject, sess }
		lane: [],          // 順に読む列（画像全体）。laneEngine だけが読む
		laneEngine: null,
		roomWaiters: [],
		session: null,     // 今の OCR の回
		sessionWait: Promise.resolve(),
		idleTimer: null,
		gen: 0,            // 閉じるたびに進める（閉じたあとに出来上がったエンジンを捨てる）
		log: []            // 出来事（検査・開発ログ用。最後の 50件）
	};
	function note(s) { st.log.push(s); if (st.log.length > 50) st.log.shift(); }
	const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

	/** 端末から本数を決める（764）。env を渡すと、その値で決める（検査用） */
	function sizeFor(env) {
		const nav = env || (typeof navigator !== 'undefined' ? navigator : {});
		const ua = nav.userAgent || '';
		const touch = nav.maxTouchPoints || 0;
		const cores = nav.hardwareConcurrency || 0;
		// iPadOS の Safari は「Macintosh」と名乗る。Mac に触れる画面は無いので、触れる点があれば iPad とみなす（OS の判定。ポインターの種類は見ない）
		const mobile = /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && touch > 1);
		if (mobile) return 2;
		return cores >= 8 ? 3 : 2;
	}
	function wantSize() { return cfg.size || sizeFor(); }

	function libNow() { return (typeof window !== 'undefined' && window.Tesseract) || null; }

	async function makeEngine(lib) {
		const w = await lib.createWorker();
		try {
			await w.loadLanguage('jpn');
			await w.initialize('jpn');
			await w.setParameters(PARAMS);
		} catch (e) {
			try { await w.terminate(); } catch (e2) { /* 閉じられなくてもよい */ }
			throw e;
		}
		return w;
	}

	function alive() { return st.engines.filter(e => !e.broken); }
	function waiting() { return st.queue.length + st.lane.length; }

	/** エンジンを1本作って池に入れる。失敗したら本数を1つ減らす */
	function addEngine(lib, gen) {
		st.creating++;
		return makeEngine(lib).then((w) => {
			st.creating--;
			if (gen !== st.gen || lib !== st.lib) { w.terminate().catch(() => {}); return false; }
			st.engines.push({ w, id: st.nextId++, busy: false, broken: false, dirty: false });
			if (st.prepMs === null) st.prepMs = now() - st.prepT0;
			note('エンジン ' + st.engines.length + '本目を用意');
			pump();
			return true;
		}, (e) => {
			st.creating--;
			if (gen === st.gen) { st.target = Math.max(0, st.target - 1); note('エンジンを作れなかった（本数を ' + st.target + ' に減らす）: ' + (e && e.message || e)); }
			failQueueIfEmpty();
			return false;
		});
	}

	/** 用意を始める（もう用意してあれば、足りない分だけ足す）。1本目の用意（または全部の失敗）で解ける Promise を返す */
	function ensure() {
		const lib = libNow();
		if (!lib || typeof lib.createWorker !== 'function') return Promise.resolve(false);
		if (st.lib && st.lib !== lib) closeAll('Tesseract が差し替えられた');
		else if (st.firstReady && alive().length === 0 && st.creating === 0) closeAll('使えるエンジンが残っていない');
		if (st.firstReady && st.lib === lib) return st.firstReady;
		st.lib = lib;
		const gen = st.gen;
		const n = wantSize();
		st.target = n;
		st.prepT0 = now();
		st.prepMs = null;
		note('用意を始める（' + n + '本）');
		// 1本目を作ってから残りを並べて作る（初めての日本語の辞書の取得を1回にする）
		st.firstReady = addEngine(lib, gen).then((ok) => {
			if (gen !== st.gen) return false;
			const rest = [];
			for (let i = 1; i < n; i++) rest.push(addEngine(lib, gen));
			if (ok) return true;
			return Promise.all(rest).then(() => alive().length > 0);
		});
		return st.firstReady;
	}

	/** 先に用意する（765）。画像を選んだとき・動画の組み立てが終わったときに呼ぶ。自動の検査では configure({ prewarm: true }) のときだけ */
	function prewarm(reason) {
		if (!cfg.prewarm) return false;
		note('先に用意: ' + (reason || ''));
		ensure();
		if (!st.session) armIdle();
		return true;
	}

	function armIdle() {
		if (st.idleTimer) clearTimeout(st.idleTimer);
		st.idleTimer = setTimeout(() => { st.idleTimer = null; if (!st.session) closeAll('5分使わなかった'); }, cfg.idleMs);
	}

	function closeAll(why) {
		st.gen++;
		if (st.idleTimer) { clearTimeout(st.idleTimer); st.idleTimer = null; }
		const es = st.engines;
		st.engines = [];
		st.laneEngine = null;
		st.firstReady = null;
		st.target = 0;
		st.prepMs = null;
		es.forEach(e => { try { e.w.terminate().catch(() => {}); } catch (err) { /* 閉じられなくてもよい */ } });
		if (es.length || why) note('閉じる: ' + (why || '') + '（' + es.length + '本）');
		failQueue(new Error('OCR のエンジンを閉じました'));
	}

	function failQueue(err) {
		const q = st.queue.concat(st.lane);
		st.queue = [];
		st.lane = [];
		q.forEach(j => j.reject(err));
		releaseRoom();
	}
	function failQueueIfEmpty() {
		if (alive().length === 0 && st.creating === 0 && waiting()) failQueue(new Error('OCR のエンジンがありません'));
	}

	function cap() { return 2 * Math.max(1, alive().length + st.creating); }
	function releaseRoom() {
		while (st.roomWaiters.length && waiting() < cap()) st.roomWaiters.shift()();
	}

	/** 順に読む列を読むエンジン（1回の OCR の中では変えない。壊れたら次の生きているエンジン） */
	function laneOwner() {
		const e = st.laneEngine;
		if (!e || e.broken || st.engines.indexOf(e) < 0) st.laneEngine = alive()[0] || null;
		return st.laneEngine;
	}

	function pump() {
		const owner = st.lane.length ? laneOwner() : null;
		for (const e of st.engines) {
			if (e.busy || e.broken) continue;
			// 前の回で順に読む列を読んだエンジンは、次に読む前に初期化し直す（この回の列の途中のエンジンはそのまま）
			if (e.dirty && e.dirty !== st.session) { refresh(e); continue; }
			let job = null;
			if (e === owner && st.lane.length) job = st.lane.shift();
			else if (st.queue.length) job = st.queue.shift();
			if (!job) continue;
			e.busy = true;
			if (job.ordered) e.dirty = job.sess || true;
			const t0 = now();
			const sess = job.sess;
			Promise.resolve().then(() => e.w.recognize(job.canvas)).then((r) => {
				if (sess) { sess.stats.recognize++; sess.stats.recognizeMs += now() - t0; if (job.ordered) sess.stats.ordered++; }
				job.resolve(r);
			}, (err) => {
				if (sess) sess.stats.failed++;
				job.reject(err);
				replaceEngine(e);
			}).finally(() => {
				e.busy = false;
				releaseRoom();
				pump();
			});
		}
		releaseRoom();
	}

	/** 読み取りに失敗したエンジンを閉じて作り直す（作れなければ本数が1つ減る） */
	function replaceEngine(e) {
		if (e.broken) return;
		e.broken = true;
		st.engines = st.engines.filter(x => x !== e);
		try { e.w.terminate().catch(() => {}); } catch (err) { /* 閉じられなくてもよい */ }
		note('読み取りに失敗したエンジンを作り直す');
		if (st.lib) addEngine(st.lib, st.gen);
	}

	/** 順に読む列を読んだエンジンを初期化し直す（次の回は新しいエンジンと同じ状態から読む）。終わるまでそのエンジンは読まない */
	function refresh(e) {
		e.busy = true;
		e.dirty = false;
		note('画像全体を読んだエンジンを初期化し直す');
		Promise.resolve().then(() => e.w.initialize('jpn')).then(() => e.w.setParameters(PARAMS)).then(() => {
			e.busy = false;
			pump();
		}, () => {
			e.busy = false;
			replaceEngine(e);
		});
	}

	function recognize(canvas, sess, ordered) {
		return new Promise((resolve, reject) => {
			if (alive().length === 0 && st.creating === 0) { reject(new Error('OCR のエンジンがありません')); return; }
			if (sess && sess.closed) { reject(new Error('OCR の回は終わっています')); return; }
			(ordered ? st.lane : st.queue).push({ canvas, resolve, reject, sess, ordered: !!ordered });
			pump();
		});
	}
	function room() {
		if (waiting() < cap()) return Promise.resolve();
		return new Promise((r) => st.roomWaiters.push(r));
	}

	/**
	 * OCR の1回を始める。前の回が終わるまで待ち、1本目のエンジンの用意を待つ。
	 * 戻り値: 回（{ worker(onPrepared), recognize, recognizeInOrder, room, size(), warm, waitMs, stats, close() }）。1本も作れなければ null（呼び出し元は今までの読み方に戻る）
	 * warm … 押した時点でエンジンが1本以上用意できていたか（先に用意が効いたか）
	 */
	async function open() {
		const prev = st.sessionWait;
		let release;
		st.sessionWait = new Promise((r) => { release = r; });
		await prev;
		if (st.idleTimer) { clearTimeout(st.idleTimer); st.idleTimer = null; }
		const lib = libNow();
		const warm = !!(st.lib === lib && alive().length > 0);
		const t0 = now();
		const ok = await ensure();
		if (!ok || alive().length === 0) {
			closeAll('1本も作れなかった');
			release();
			return null;
		}
		st.laneEngine = null;   // この回の順に読む列のエンジンは、最初に列を読むときに決める
		const sess = {
			warm,
			waitMs: now() - t0,
			stats: { recognize: 0, recognizeMs: 0, failed: 0, ordered: 0 },
			size() { return alive().length; },
			target() { return st.target; },
			recognize: (canvas) => recognize(canvas, sess, false),
			recognizeInOrder: (canvas) => recognize(canvas, sess, true),
			room,
			/** processPersonImages に渡す worker。prepared() は1人分の整え（主のスレッドの処理）が終わったときに呼ばれる */
			worker(onPrepared) { return { recognize: sess.recognize, recognizeInOrder: sess.recognizeInOrder, room, prepared: onPrepared || function () {} }; },
			closed: false,
			close() {
				if (sess.closed) return;
				sess.closed = true;
				if (st.session === sess) st.session = null;
				// 止まった回（途中で失敗した OCR）の、まだ読み始めていない頼みは捨てる（次の回を待たせない）
				const left = st.queue.concat(st.lane).filter(j => j.sess === sess);
				if (left.length) {
					st.queue = st.queue.filter(j => j.sess !== sess);
					st.lane = st.lane.filter(j => j.sess !== sess);
					left.forEach(j => j.reject(new Error('OCR の回は終わっています')));
					releaseRoom();
				}
				// 順に読む列を読んだエンジンは初期化し直す（pump が、空いているものはすぐ・読み途中のものは読み終わったときに行う）
				st.laneEngine = null;
				pump();
				armIdle();
				release();
			}
		};
		st.session = sess;
		return sess;
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('pagehide', () => closeAll('ページを離れた'));
		window.UmaOcrPool = {
			VERSION: OCR_POOL_JS_VERSION,
			PARAMS,
			sizeFor,
			prewarm,
			open,
			configure(o) { Object.assign(cfg, o || {}); },
			/** 検査・開発ログ用の今の様子 */
			state() {
				return {
					engines: alive().length, creating: st.creating, target: st.target, queue: st.queue.length, lane: st.lane.length,
					dirty: st.engines.filter(e => e.dirty).length, session: !!st.session, idle: !!st.idleTimer, idleMs: cfg.idleMs,
					prepMs: st.prepMs, prewarm: cfg.prewarm, log: st.log.slice()
				};
			},
			close(why) { closeAll(why || '呼び出し'); }
		};
	}
})();
