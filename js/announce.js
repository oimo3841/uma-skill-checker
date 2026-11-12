/* ============================================================
 * お知らせ（告知）の定義と、小窓の中身を作る部品
 * ------------------------------------------------------------
 * exam.html（UmaExam OCR）と special.html（UmaStar OCR）が読む。**文面・画像のパス・告知の番号（ID）・日付は、
 * すべてこのファイルの ANNOUNCE に書く**（後から文面を直すときは、ここだけを直す）。
 *
 * 出し方は、これまでの告知（画面の作りの告知・対象スキルの告知・改修中の断り・収録の告知）と同じ:
 *   ・各ページの #ui-notice の小窓に、中身だけ差し替えて出す（✕・OK・背景・Esc のどれで閉じても既読）
 *   ・既読の印は、ページごとのキーに「告知のID」を値として書く（ID を変えれば、もう一度出せる）
 *       exam    … uma-exam-edition-notice
 *       special … uma-special-edition-notice（結合画像のリニューアルのお知らせ〔STITCH〕は uma-special-stitch-notice）
 *   ・小窓は1回の読み込みで1枚だけ（先に出す告知があるときは、次の読み込みで出す）
 * 足したのは、次の3点だけ:
 *   ・画像を載せられる（img/ の日付つきの名前。alt つき）
 *   ・URL に ?notice=force を付けると、既読でも出す（このときは既読を書かない。文面の確認用）
 *   ・ツール切替のメニューの「お知らせ」から、いつでも読み直せる
 *
 * このファイルは DOM を作るだけで、保存や開閉の処理は持たない（各ページの openUiNotice / closeUiNotice が持つ）。
 * 公開するグローバルは UmaAnnounce の1つだけ。
 * ============================================================ */
const ANNOUNCE_JS_VERSION = '2026-11-12a';

(function () {
	'use strict';

	/* ---------- 告知の定義（ここだけを直せば、両方のツールの文面・画像が変わる） ---------- */
	const ANNOUNCE = {
		id: '2026-10-11-exam-2nd-edition',  // 告知の番号。既読の印の値。べつの告知を出すときは変える（C-142 で文面を改めたので番号も改めた）
		date: '2026-10-11',
		label: 'お知らせ',                 // 小窓の読み上げの名前（見出しの文字は出さない。C-142・微調整4・E）
		pages: ['exam'],                   // どのページに出すか（'exam'＝exam.html・'special'＝special.html）。UmaStar の告知は完成後に足す
		sections: [
			{
				heading: 'UmaExam OCR',
				lead: '新機能「効率を指定」モードを追加し、全体の文面も見直しました。',  // C-260 の (b): 「含め」だけを直した（ID は据え置き）
				lines: [
					'評価点÷SPの「効率」で対象スキルを区別します。',
					'蹄鉄をドラッグして区間を調整、バーをタップすると区間が対象から外れます。',
					'結合画像には、検出数と、★の数に応じて補正された合計評価点が入ります。',
				],
				images: [
					{ src: 'img/announce-eff-bar-2026-10-11.png', alt: '「効率を指定」の画面の一部。バーの上の値（最小・境目・最大）と、4つの区間に分けたバー、その下に並ぶ4つの蹄鉄とリセットのボタン' },
					{ src: 'img/announce-eff-summary-2026-10-11.png', alt: '3人分の結合画像の帯の部分。人ごとの検出数、区間ごとの検出数、合計評価点/合計SPと合計評価点（★補正）' },
				],
			},
		],
	};

	/* ---------- 結合画像のリニューアルのお知らせ（C-260 の (c)・UmaStar だけ。2026-11-01） ----------
	 * 形は ANNOUNCE と同じ（中身は fill が作る）。ANNOUNCE と違い、節の見出しは隠さない（小窓の最初の行）。
	 * 画像は結合画像の全体を半分に縮めたもの。画像の代わりの説明文は付けない（alt=""。おいもさんの判断）。
	 * 既読の印は special の uma-special-stitch-notice に id を書く。 */
	const STITCH = {
		id: '2026-11-01-stitch-renewal',
		date: '2026-11-01',
		label: 'お知らせ',
		pages: ['special'],
		sections: [
			{
				heading: '結合画像のリニューアル',
				lead: '1枚の結合画像で、編成と因子をまとめて見られるようになりました。',
				lines: [],
				images: [
					{ src: 'img/announce-stitch-2026-11-01.png', alt: '' },
				],
			},
		],
	};
	const STITCH_TITLE_ID = 'ui-notice-title-stitch';

	/* ---------- 動画で取り込み（βテスト）のお知らせ（T182・UmaStar と UmaExam に1件ずつ。2026-11-12） ----------
	 * 形は STITCH と同じ（中身は fill が作る。節の見出しは隠さない＝小窓の最初の行）。文面はおいもさんの原文のまま（ページごと）。
	 * 箇条（lines）の「・」は .announce-lines li::before が付ける（文字には入れない）。tail は箇条の後ろの1文（UmaStar だけ）。
	 * 画像はページごとに1枚（おいもさんが用意したものを横 1100px に縮めた）。画像の代わりの説明文は付けない（alt=""。決定 724）。
	 * 既読の印は uma-special-video-notice／uma-exam-video-notice に id を書く（両ページで同じ id）。 */
	const VIDEO_ID = '2026-11-12-video-beta';
	const VIDEO_HEADING = '動画で取り込み（βテスト）';
	const VIDEO_LEAD = '動画から画像の結合と OCR ができるようになりました。';
	const VIDEO_LINES = [
		'録画済みの動画を選ぶと画像の結合が始まります。',
		'PC では、ゲームのウィンドウから直接取り込めます。',
		'DMM版の横画面にも対応しました。',
		'βテスト中の機能です。質と処理時間を改善中です。',
	];
	const VIDEO = {
		special: {
			id: VIDEO_ID,
			date: '2026-11-12',
			label: 'お知らせ',
			pages: ['special'],
			sections: [
				{
					heading: VIDEO_HEADING,
					lead: VIDEO_LEAD,
					lines: VIDEO_LINES,
					tail: 'レース欄に「レース指定なし／本育成編成なし」を追加しました。',
					images: [
						{ src: 'img/announce-video-star-2026-11-12.png', alt: '' },
					],
				},
			],
		},
		exam: {
			id: VIDEO_ID,
			date: '2026-11-12',
			label: 'お知らせ',
			pages: ['exam'],
			sections: [
				{
					heading: VIDEO_HEADING,
					lead: VIDEO_LEAD,
					lines: VIDEO_LINES,
					images: [
						{ src: 'img/announce-video-exam-2026-11-12.png', alt: '' },
					],
				},
			],
		},
	};
	const VIDEO_TITLE_ID = 'ui-notice-title-video';

	/* ---------- 新シナリオへの未対応の知らせ（暫定。段1a・2026-10-24。文面は 2026-10-25 に全面差し替え） ----------
	 * 新シナリオ（10月26日 12:00 開始）を含むゲームの更新に、ツールが対応するまでの断り。
	 * 既読の印は edition とは別のキー（uma-exam-scenario-notice / uma-special-scenario-notice）に ID を書く（ID は文面を差し替えても変えない）。
	 * 対応が済んだら on を false にする（入れ替えの commit で。履歴からも外れる）。
	 * 2026-10-26（駿大祭の受け入れ）: 箇条を入れ替えた。UmaStar・UmaExam ＝イベントのスキルが一部未対応のカード・衣装／UmaStar だけ ＝シナリオのイベントのスキル（①のシナリオの列）。
	 * 2026-10-26（新シナリオの仕上げ）: イベントのスキルと駿大祭のイベントを入れたので on を false にした（履歴からも外れる）。 */
	const SCENARIO_PENDING = {
		on: false,
		id: 'scenario-pending-20261024',
		pages: ['exam', 'special'],
		heading: '新シナリオへの対応',
		lines: {
			special: [
				'［いとどめでたき、まつりかな］吾妻・［Time of Departure］マヤノトップガン・［陣風の花紺青］ダイワスカーレットのイベントのスキルは、一部が未対応です。',
				'駿大祭シナリオのイベントのスキルは、未対応です。',
			],
			exam: [
				'［いとどめでたき、まつりかな］吾妻・［Time of Departure］マヤノトップガン・［陣風の花紺青］ダイワスカーレットのイベントのスキルは、一部が未対応です。',
			],
		},
	};
	const SCENARIO_TITLE_ID = 'ui-notice-title-scenario';

	/* ---------- お知らせの履歴（日付つき。各ツールで新しい3件を見られる。2026-10-25） ----------
	 * 並びは新しい順（同じ日付は、この並び）。date は、そのお知らせを入れた commit の日付（日本時間）。
	 * pages＝どのツールに出すか。scenario は SCENARIO_PENDING.on が false になったら履歴から外れる（edition は ANNOUNCE.pages に従う）。
	 * 本文は、stitch・scenario・edition とも、このファイルが作る。
	 * 2026-11-01（C-260 の (b)）: 古いお知らせ（catalog 09/27・alpha 09/19・target 09/15・layout 09/11）を外した（本文・既読の読み書きも各ページから外した）。
	 * 2026-11-12（T182）: 動画で取り込み（video）を両ツールの先頭に足した。video の行は1行で書く（検査が、この行だけを外した「足す前」の状態を作るため）。 */
	const HISTORY_MAX = 3;
	const NOTICE_LIST = [
		{ kind: 'video', date: '2026/11/12', pages: ['exam', 'special'], commit: 'T182' },
		{ kind: 'stitch', date: '2026/11/01', pages: ['special'], commit: 'T55' },
		{ kind: 'scenario', date: '2026/10/24', pages: ['exam', 'special'], commit: '054dbee' },
		{ kind: 'edition', date: '2026/10/11', pages: ['exam'], commit: '05540a0' },
	];
	const TOOL_NAME = { exam: 'UmaExam OCR', special: 'UmaStar OCR' };

	/** そのツールの履歴（新しい順・最大3件）。 [{ kind, date }] */
	function history(page) {
		return NOTICE_LIST.filter(function (n) {
			if (n.pages.indexOf(page) === -1) return false;
			if (n.kind === 'scenario') return !!SCENARIO_PENDING.on;
			if (n.kind === 'edition') return isFor(page);
			return true;
		}).slice(0, HISTORY_MAX).map(function (n) { return { kind: n.kind, date: n.date }; });
	}

	/* ---------- 自動で開くかどうか（C-260 の (a)・2026-10-31） ----------
	 * 日付は「読み込みのときに自動で開くか」だけに使う。‹ n / N › でめくれる件数は、自動で開いたときもメニューから開いたときも同じ（history の3件）。
	 * お知らせの日（NOTICE_LIST の date・日本時間）を0日目として、AUTO_OPEN_DAYS 日目まで自動で出す。
	 * 履歴の3件のうち、その範囲の中で未読のものがあれば、最新の1件で開く（履歴は新しい順なので、最新の1件も範囲の中）。
	 * 未読が範囲の外（古いもの）しか無ければ、自動では何も出さない（既読も書かない＝開いていないので）。
	 * ?notice=force は日付に関係なく最新の1件から開く（文面の確認用）。 */
	const AUTO_OPEN_DAYS = 30;
	const DAY_MS = 86400000;

	/** 日本時間の日付の通し番号（1970-01-01 を 0）。時刻の端数・夏時間が入らないよう、日付だけで数える */
	function jstDayNumber(ms) {
		return Math.floor((ms + 9 * 3600000) / DAY_MS);
	}

	/** お知らせの日（'YYYY/MM/DD'）から今日（日本時間）までの日数。お知らせの日が0。読めない日付は null */
	function noticeAgeDays(date, nowMs) {
		const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(String(date || ''));
		if (!m) return null;
		const day = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
		return jstDayNumber(nowMs === undefined ? Date.now() : nowMs) - day;
	}

	/** そのお知らせが、自動で出す範囲（0日目〜AUTO_OPEN_DAYS 日目）か。未来の日付も範囲に入れる */
	function isFresh(date, nowMs) {
		const age = noticeAgeDays(date, nowMs);
		return age !== null && age <= AUTO_OPEN_DAYS;
	}

	/** 読み込みのときに自動で開くお知らせの種類（無ければ null）。seen(kind) は各ページの既読の読み方 */
	function autoOpenKind(page, seen) {
		const hist = history(page);
		if (!hist.length) return null;
		if (isForced()) return hist[0].kind;
		const now = Date.now();
		return hist.some(function (h) { return isFresh(h.date, now) && !seen(h.kind); }) ? hist[0].kind : null;
	}

	/** そのツールの全お知らせの種類（履歴の外のものも含む。閉じたときに既読にする範囲） */
	function allKinds(page) {
		return NOTICE_LIST.filter(function (n) { return n.pages.indexOf(page) !== -1; }).map(function (n) { return n.kind; });
	}

	/** 小窓の上のツール名の右の日付と、本文と OK の間の ‹ n / N › の部品。dialog の中に、1回だけ作る（作り直さない） */
	function ensureChrome(dialog) {
		ensureStyle();
		let head = dialog.querySelector('.notice-head');
		if (head) return head.parentNode;
		const body = dialog.querySelector('.notice-body');
		const foot = dialog.querySelector('.notice-foot');
		head = el('div', 'notice-head');
		head.appendChild(el('span', 'notice-head-tool'));
		head.appendChild(el('span', 'notice-head-date'));
		body.insertBefore(head, body.firstChild);
		const pager = el('div', 'notice-pager');
		pager.setAttribute('role', 'group');
		pager.setAttribute('aria-label', 'お知らせの切り替え');
		const prev = el('button', 'notice-pager-btn', '‹');
		prev.type = 'button';
		prev.setAttribute('data-notice-nav', 'newer');
		prev.setAttribute('aria-label', '新しいお知らせ');
		const count = el('span', 'notice-pager-count');
		count.setAttribute('aria-live', 'polite');
		const next = el('button', 'notice-pager-btn', '›');
		next.type = 'button';
		next.setAttribute('data-notice-nav', 'older');
		next.setAttribute('aria-label', '古いお知らせ');
		pager.appendChild(prev); pager.appendChild(count); pager.appendChild(next);
		foot.insertBefore(pager, foot.firstChild);
		return dialog;
	}

	/** ツール名・日付・ n / N ・端のボタンを、いま出している告知（hist の中の位置 index）に合わせる。hist の外の告知（index が -1）では部品を隠す */
	function decorate(dialog, page, kind, hist) {
		ensureChrome(dialog);
		const index = hist.map(function (h) { return h.kind; }).indexOf(kind);
		const entry = NOTICE_LIST.filter(function (n) { return n.kind === kind && n.pages.indexOf(page) !== -1; })[0];
		dialog.querySelector('.notice-head-tool').textContent = TOOL_NAME[page] || '';
		dialog.querySelector('.notice-head-date').textContent = entry ? entry.date : '';
		const pager = dialog.querySelector('.notice-pager');
		pager.hidden = index === -1 || hist.length < 2;
		dialog.querySelector('.notice-pager-count').textContent = (index + 1) + ' / ' + hist.length;
		// 端では、その向きのボタンを見えなくする（場所は残す＝並びがずれない。押せない見た目のボタンを避ける）
		dialog.querySelector('[data-notice-nav="newer"]').style.visibility = index > 0 ? 'visible' : 'hidden';
		dialog.querySelector('[data-notice-nav="older"]').style.visibility = index !== -1 && index < hist.length - 1 ? 'visible' : 'hidden';
		return index;
	}

	// 見出しの id（小窓の読み上げの名前に使う）
	const TITLE_ID = 'ui-notice-title-edition';

	let styled = false;
	function ensureStyle() {
		if (styled || typeof document === 'undefined') return;
		styled = true;
		const css = [
			'.announce-sec { margin-top: var(--uma-sp-4); text-align: left; }',
			'.announce-sec:first-of-type { margin-top: 0; }',
			// 読み上げだけの見出し（見えない）
			'.announce-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }',
			'.announce-h { margin: 0 0 var(--uma-sp-1); font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; color: var(--uma-text-heading); }',
			'.announce-lead { margin: 0; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-md); color: var(--uma-text-heading); }',
			'.announce-lines { margin: var(--uma-sp-1-5) 0 0; padding: 0; list-style: none; }',
			'.announce-lines li { margin: 0; padding-left: 1em; text-indent: -1em; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-md); color: var(--uma-text-muted); }',
			'.announce-lines li::before { content: "・"; }',
			'.announce-tail { margin-top: var(--uma-sp-1-5); }',
			// 画像は、ライトの見た目で作ってある（ダークでも違和感なく見えるよう、暗い面の上に縁取りをつける）
			'.announce-fig { margin: var(--uma-sp-2) 0 0; }',
			// 小窓の上のツール名と日付・本文と OK の間の ‹ n / N ›（2026-10-25）
			'.notice-head { display: flex; align-items: baseline; gap: var(--uma-sp-2); margin: 0 0 var(--uma-sp-3); padding-right: 2.5rem; text-align: left; }',
			'.notice-head-tool { font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; color: var(--uma-text-heading); }',
			'.notice-head-date { font-size: 11px; line-height: var(--uma-lh-sm); color: var(--uma-text-muted); font-variant-numeric: tabular-nums; }',
			'.notice-pager { display: flex; align-items: center; justify-content: center; gap: var(--uma-sp-2); margin: 0 0 var(--uma-sp-2); }',
			'.notice-pager[hidden] { display: none; }',
			'.notice-pager-count { min-width: 3.5em; text-align: center; font-size: var(--uma-fs-sm); color: var(--uma-text-muted); font-variant-numeric: tabular-nums; }',
			'.notice-pager-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 36px; padding: 0; border: 0; border-radius: var(--uma-r-md); background: transparent; color: var(--uma-text-heading); font-size: 22px; line-height: 1; cursor: pointer; }',
			'.notice-pager-btn:hover { background: var(--uma-border); }',
			// 2nd Edition の本文の最初の見出し（ツール名）は、小窓の上のツール名と重なるので見せない（読み上げの名前は残る）
			'#ui-notice-body-edition .announce-sec > .announce-h:first-child { display: none; }',
			'.announce-fig img { display: block; width: 100%; height: auto; border: 1px solid var(--uma-border-strong); border-radius: var(--uma-r-md); background: #fff; }',
		].join('\n');
		const el = document.createElement('style');
		el.id = 'announce-style';
		el.textContent = css;
		document.head.appendChild(el);
	}

	function el(tag, cls, text) {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text !== undefined) e.textContent = text;
		return e;
	}

	/** 小窓の中身（読み上げの見出し・各節）を root の中に作る。何度呼んでも同じ（作り直す）。
	 *  def＝お知らせの定義（ANNOUNCE と同じ形。省くと ANNOUNCE）・titleId＝読み上げの見出しの id（省くと TITLE_ID）。 */
	function fill(root, def, titleId) {
		def = def || ANNOUNCE;
		ensureStyle();
		root.textContent = '';
		// C-142（微調整4・E）: 見出し（「2nd Edition になりました」）とアイコンは出さない。読み上げの名前「お知らせ」は、見えない見出しで持つ
		// （各ページの小窓の aria-labelledby が titleId を指す）。2nd Edition の小窓の最初の行は各ツールの節の見出し（「UmaExam OCR」）
		const h = el('h2', 'announce-sr', def.label);
		h.id = titleId || TITLE_ID;
		root.appendChild(h);
		def.sections.forEach(function (sec) {
			const s = el('section', 'announce-sec');
			s.appendChild(el('h3', 'announce-h', sec.heading));
			s.appendChild(el('p', 'announce-lead', sec.lead));
			if (sec.lines && sec.lines.length) {
				const ul = el('ul', 'announce-lines');
				sec.lines.forEach(function (t) { ul.appendChild(el('li', '', t)); });
				s.appendChild(ul);
			}
			// 箇条の後ろの1文（T182 の UmaStar の「レース欄に…」。本文と同じ形）
			if (sec.tail) s.appendChild(el('p', 'announce-lead announce-tail', sec.tail));
			(sec.images || []).forEach(function (im) {
				const fig = el('figure', 'announce-fig');
				const img = document.createElement('img');
				img.src = im.src;
				img.alt = im.alt;
				img.decoding = 'async';
				fig.appendChild(img);
				s.appendChild(fig);
			});
			root.appendChild(s);
		});
		if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
	}

	/** 新シナリオの知らせを、そのページに出すか（on かつ pages に含まれる） */
	function isScenarioFor(page) {
		return !!SCENARIO_PENDING.on && SCENARIO_PENDING.pages.indexOf(page) !== -1;
	}

	/** 新シナリオの知らせの中身を root の中に作る（何度呼んでも同じ） */
	function fillScenario(root, page) {
		ensureStyle();
		root.textContent = '';
		const sec = el('section', 'announce-sec');
		const h = el('h2', 'announce-h', SCENARIO_PENDING.heading);
		h.id = SCENARIO_TITLE_ID;
		sec.appendChild(h);
		const ul = el('ul', 'announce-lines');
		(SCENARIO_PENDING.lines[page] || []).forEach(function (t) { ul.appendChild(el('li', '', t)); });
		sec.appendChild(ul);
		root.appendChild(sec);
	}

	/** この告知を、そのページ（'exam'／'special'）に出すか（C-142・微調整4・E。定義の pages） */
	function isFor(page) {
		return (ANNOUNCE.pages || []).indexOf(page) !== -1;
	}

	/** URL に ?notice=force が付いているか（文面の確認用。既読でも出し、既読は書かない） */
	function isForced() {
		try { return new URLSearchParams(location.search).get('notice') === 'force'; } catch (e) { return false; }
	}

	window.UmaAnnounce = {
		ANNOUNCE: ANNOUNCE, TITLE_ID: TITLE_ID, STITCH: STITCH, STITCH_TITLE_ID: STITCH_TITLE_ID, VIDEO: VIDEO, VIDEO_TITLE_ID: VIDEO_TITLE_ID, fill: fill, isFor: isFor, isForced: isForced, version: ANNOUNCE_JS_VERSION,
		SCENARIO_PENDING: SCENARIO_PENDING, SCENARIO_TITLE_ID: SCENARIO_TITLE_ID, fillScenario: fillScenario, isScenarioFor: isScenarioFor,
		NOTICE_LIST: NOTICE_LIST, HISTORY_MAX: HISTORY_MAX, TOOL_NAME: TOOL_NAME, history: history, allKinds: allKinds, decorate: decorate, mountChrome: ensureChrome,
		AUTO_OPEN_DAYS: AUTO_OPEN_DAYS, noticeAgeDays: noticeAgeDays, isFresh: isFresh, autoOpenKind: autoOpenKind,
	};
})();
