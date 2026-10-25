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
 *       special … uma-special-edition-notice
 *   ・小窓は1回の読み込みで1枚だけ（先に出す告知があるときは、次の読み込みで出す）
 * 足したのは、次の3点だけ:
 *   ・画像を載せられる（img/ の日付つきの名前。alt つき）
 *   ・URL に ?notice=force を付けると、既読でも出す（このときは既読を書かない。文面の確認用）
 *   ・ツール切替のメニューの「お知らせ」から、いつでも読み直せる
 *
 * このファイルは DOM を作るだけで、保存や開閉の処理は持たない（各ページの openUiNotice / closeUiNotice が持つ）。
 * 公開するグローバルは UmaAnnounce の1つだけ。
 * ============================================================ */
const ANNOUNCE_JS_VERSION = '2026-10-25a';

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
				lead: '新機能「効率を指定」モードを追加し、文面含め全体的な調整を行いました。',
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

	/* ---------- 新シナリオへの未対応の知らせ（暫定。段1a・2026-10-24。文面は 2026-10-25 に全面差し替え） ----------
	 * 新シナリオ（10月26日 12:00 開始）を含むゲームの更新に、ツールが対応するまでの断り。
	 * 既読の印は edition とは別のキー（uma-exam-scenario-notice / uma-special-scenario-notice）に ID を書く（ID は文面を差し替えても変えない）。
	 * 対応が済んだら on を false にする（入れ替えの commit で。履歴からも外れる）。
	 * {一覧} は、先行公開された育成ウマ娘・サポートカードを［二つ名］名前の形で並べたもの（データの今の値。文面には文字列として持つ）。 */
	const SCENARIO_LIST = '［陣風の花紺青］ダイワスカーレット・［いとどめでたき、まつりかな］吾妻・［Time of Departure］マヤノトップガン';
	const SCENARIO_PENDING = {
		on: true,
		id: 'scenario-pending-20261024',
		pages: ['exam', 'special'],
		heading: '新シナリオへの対応',
		lines: {
			special: [
				SCENARIO_LIST + 'のスキルは、ぱかライブTV’で先行公開された内容まで実装済みです。足りない内容は、10月26日 12:00 後に追加します。',
				SCENARIO_LIST + 'のスキルは、10月26日 12:00 後にOCR対象になります。',
			],
			exam: [
				SCENARIO_LIST + 'のスキルは、ぱかライブTV’で先行公開された内容まで実装済みです。足りない内容は、10月26日 12:00 後に追加します。',
				SCENARIO_LIST + 'のスキルは、10月26日 12:00 後にOCR対象になります。',
				'めろっぷ！【LTC】専用拡張モードの行の並びは、新シナリオに未対応です。10月26日 12:00 後に更新します。',
			],
		},
	};
	const SCENARIO_TITLE_ID = 'ui-notice-title-scenario';

	/* ---------- お知らせの履歴（日付つき。各ツールで新しい3件を見られる。2026-10-25） ----------
	 * 並びは新しい順（同じ日付は、この並び）。date は、そのお知らせを入れた commit の日付（日本時間）。
	 * pages＝どのツールに出すか。scenario は SCENARIO_PENDING.on が false になったら履歴から外れる（edition は ANNOUNCE.pages に従う）。
	 * 本文は、scenario・edition はこのファイルが作り、layout・target・alpha・catalog は各ページの HTML が持つ（ここは種類と日付だけ）。 */
	const HISTORY_MAX = 3;
	const NOTICE_LIST = [
		{ kind: 'scenario', date: '2026/10/24', pages: ['exam', 'special'], commit: '054dbee' },
		{ kind: 'edition', date: '2026/10/11', pages: ['exam'], commit: '05540a0' },
		{ kind: 'catalog', date: '2026/09/27', pages: ['special'], commit: '768840b' },
		{ kind: 'alpha', date: '2026/09/19', pages: ['special'], commit: '748aa64' },
		{ kind: 'target', date: '2026/09/15', pages: ['exam'], commit: 'e057ddc' },
		{ kind: 'layout', date: '2026/09/11', pages: ['exam', 'special'], commit: '9f8b97c（exam）／d9836e7（special）' },
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

	/** 小窓の中身（アイコン・見出し・各ツールの節）を root の中に作る。何度呼んでも同じ（作り直す）。 */
	function fill(root) {
		ensureStyle();
		root.textContent = '';
		// C-142（微調整4・E）: 見出し（「2nd Edition になりました」）とアイコンは出さない。読み上げの名前「お知らせ」は、見えない見出しで持つ
		// （各ページの小窓の aria-labelledby が TITLE_ID を指す）。小窓の最初の行は各ツールの節の見出し（「UmaExam OCR」）
		const h = el('h2', 'announce-sr', ANNOUNCE.label);
		h.id = TITLE_ID;
		root.appendChild(h);
		ANNOUNCE.sections.forEach(function (sec) {
			const s = el('section', 'announce-sec');
			s.appendChild(el('h3', 'announce-h', sec.heading));
			s.appendChild(el('p', 'announce-lead', sec.lead));
			if (sec.lines && sec.lines.length) {
				const ul = el('ul', 'announce-lines');
				sec.lines.forEach(function (t) { ul.appendChild(el('li', '', t)); });
				s.appendChild(ul);
			}
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
		ANNOUNCE: ANNOUNCE, TITLE_ID: TITLE_ID, fill: fill, isFor: isFor, isForced: isForced, version: ANNOUNCE_JS_VERSION,
		SCENARIO_PENDING: SCENARIO_PENDING, SCENARIO_TITLE_ID: SCENARIO_TITLE_ID, fillScenario: fillScenario, isScenarioFor: isScenarioFor,
		NOTICE_LIST: NOTICE_LIST, HISTORY_MAX: HISTORY_MAX, TOOL_NAME: TOOL_NAME, history: history, allKinds: allKinds, decorate: decorate, mountChrome: ensureChrome,
	};
})();
