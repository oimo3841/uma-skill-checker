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
const ANNOUNCE_JS_VERSION = '2026-10-24a';

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

	/* ---------- 新シナリオへの未対応の知らせ（暫定。段1a・2026-10-24） ----------
	 * 新しいシナリオ「駿大祭（仮）」を含むゲームの更新（2026-10-26 12:00）に、ツールが対応するまでの断り。
	 * 既読の印は edition とは別のキー（uma-exam-scenario-notice / uma-special-scenario-notice）に ID を書く。
	 * 対応が済んだら on を false にする（入れ替えの commit で）。正式名称が分かったら intro の「駿大祭（仮）」を直す。
	 * 行番号は文字で直書きせず、めろっぷの行の並び（data/melop-sheet-rows.json）の最初と最後の行番号から出す（ROW_FIRST／ROW_LAST）。 */
	const SCENARIO_PENDING = {
		on: true,
		id: 'scenario-pending-20261024',
		pages: ['exam', 'special'],
		heading: '新しいシナリオへの対応について',
		intro: '10月26日 12:00 開始の新しいシナリオ「駿大祭（仮）」を含むゲームの更新に、このツールはまだ対応していません。',
		lines: {
			special: [
				'本育成（①）のシナリオの列は、これまでのシナリオのままです。',
				'新しいシナリオのシナリオ因子と専用のスキルは、まだ選べず、読み取りの対象にも入っていません。',
				'新しいサポートカード・育成ウマ娘・スキルは、分かっている範囲だけ先に入れています。足りない内容は、分かり次第追加します。',
				'対応が済んだら、この表示は外れます。',
			],
			exam: [
				'新しいシナリオのシナリオ因子と専用のスキルは、まだ選べず、読み取りの対象にも入っていません。',
				'めろっぷ！【LTC】専用拡張モードの行の並びは、新しいシナリオに未対応です。貼り付ける欄が {ROW_FIRST}〜{ROW_LAST} 行目のままか確かめてから貼ってください。',
				'新しいスキルは、分かっている範囲だけ先に入れています。足りない内容は、分かり次第追加します。',
				'対応が済んだら、この表示は外れます。',
			],
		},
		// exam の常時の1行（めろっぷの説明の下）
		melopAlways: '行の並びは新しいシナリオに未対応です。貼り付ける欄が {ROW_FIRST}〜{ROW_LAST} 行目のままか確かめてください。',
	};
	const SCENARIO_TITLE_ID = 'ui-notice-title-scenario';

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
			// 新シナリオの断りを、ほかの告知の下に並べるとき（線で区切る）
			'.announce-scenario--with { margin-top: var(--uma-sp-4); padding-top: var(--uma-sp-4); border-top: 1px solid var(--uma-border); }',
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

	/** めろっぷの行の並び（data/melop-sheet-rows.json を読んだ中身）から、最初と最後の行番号を出す。読めなければ null */
	function melopRowRange(json) {
		const rows = json && Array.isArray(json.rows) ? json.rows : [];
		const nums = rows.map(function (r) { return r && r.row; }).filter(function (n) { return typeof n === 'number' && isFinite(n); });
		if (!nums.length) return null;
		return { first: Math.min.apply(null, nums), last: Math.max.apply(null, nums) };
	}

	/** 文面の {ROW_FIRST}〜{ROW_LAST} を行番号に置き換える。range が無ければ null（その文は出さない） */
	function withRows(text, range) {
		if (text.indexOf('{ROW_') === -1) return text;
		if (!range) return null;
		return text.replace('{ROW_FIRST}', String(range.first)).replace('{ROW_LAST}', String(range.last));
	}

	/** exam の常時の1行の文面（range が無ければ null） */
	function melopAlwaysText(range) {
		return withRows(SCENARIO_PENDING.melopAlways, range);
	}

	/** 新シナリオの断りを、そのページに出すか（on かつ pages に含まれる） */
	function isScenarioFor(page) {
		return !!SCENARIO_PENDING.on && SCENARIO_PENDING.pages.indexOf(page) !== -1;
	}

	/** 新シナリオの断りの中身を root の中に作る（何度呼んでも同じ）。range は exam の行番号（無ければ行番号を含む文は出さない） */
	function fillScenario(root, page, range) {
		ensureStyle();
		root.textContent = '';
		const s = el('section', 'announce-sec');
		const h = el('h2', 'announce-h', SCENARIO_PENDING.heading);
		h.id = SCENARIO_TITLE_ID;
		s.appendChild(h);
		s.appendChild(el('p', 'announce-lead', SCENARIO_PENDING.intro));
		const ul = el('ul', 'announce-lines');
		(SCENARIO_PENDING.lines[page] || []).forEach(function (t) {
			const text = withRows(t, range);
			if (text !== null) ul.appendChild(el('li', '', text));
		});
		s.appendChild(ul);
		root.appendChild(s);
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
		melopRowRange: melopRowRange, melopAlwaysText: melopAlwaysText,
	};
})();
