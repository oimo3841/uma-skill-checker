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
const ANNOUNCE_JS_VERSION = '2026-10-10a';

(function () {
	'use strict';

	/* ---------- 告知の定義（ここだけを直せば、両方のツールの文面・画像が変わる） ---------- */
	const ANNOUNCE = {
		id: '2026-10-10-2nd-edition',     // 告知の番号。既読の印の値。べつの告知を出すときは変える
		date: '2026-10-10',
		title: '2nd Edition になりました',
		sections: [
			{
				heading: 'UmaExam OCR',
				lead: '新機能「効率を指定」モードの追加にともない、2nd Edition に移行しました。',
				lines: [
					'評価点÷消費SPの「効率」で、対象スキルを4つの区間（銅・銀・金・虹）に分けます。',
					'蹄鉄をドラッグすると区間の境目が動き、バーの区間をタップすると、その区間を対象に入れる／外せます。',
					'結合画像には、区間ごとの検出数と合計評価点が入ります。',
				],
				images: [
					{ src: 'img/announce-eff-bar-2026-10-10.png', alt: '「効率を指定」の画面の一部。4つの区間に分けたバーと、その下に並ぶ4つの蹄鉄' },
					{ src: 'img/announce-eff-summary-2026-10-10.png', alt: '結合画像の一部。区間ごとの検出数と、合計評価点・合計評価点/合計SP' },
				],
			},
			{
				heading: 'UmaStar OCR',
				lead: 'UmaStar OCR も 2nd Edition に移行し、新機能を拡充しました。',
				lines: ['未完成の部分があるため、β版です。'],
				images: [],
			},
		],
	};

	// 見出しの id（小窓の読み上げの名前に使う）
	const TITLE_ID = 'ui-notice-title-edition';

	let styled = false;
	function ensureStyle() {
		if (styled || typeof document === 'undefined') return;
		styled = true;
		const css = [
			'.announce-sec { margin-top: var(--uma-sp-4); text-align: left; }',
			'.announce-sec:first-of-type { margin-top: var(--uma-sp-3); }',
			'.announce-h { margin: 0 0 var(--uma-sp-1); font-size: var(--uma-fs-sm); line-height: var(--uma-lh-sm); font-weight: 700; color: var(--uma-text-heading); }',
			'.announce-lead { margin: 0; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-md); color: var(--uma-text-heading); }',
			'.announce-lines { margin: var(--uma-sp-1-5) 0 0; padding: 0; list-style: none; }',
			'.announce-lines li { margin: 0; padding-left: 1em; text-indent: -1em; font-size: var(--uma-fs-sm); line-height: var(--uma-lh-md); color: var(--uma-text-muted); }',
			'.announce-lines li::before { content: "・"; }',
			// 画像は、ライトの見た目で作ってある（ダークでも違和感なく見えるよう、暗い面の上に縁取りをつける）
			'.announce-fig { margin: var(--uma-sp-2) 0 0; }',
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
		const icon = el('div', 'notice-icon');
		icon.setAttribute('aria-hidden', 'true');
		const i = document.createElement('i');
		i.setAttribute('data-lucide', 'sparkles');
		i.className = 'w-6 h-6';
		icon.appendChild(i);
		root.appendChild(icon);
		const h = el('h2', 'notice-title', ANNOUNCE.title);
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

	/** URL に ?notice=force が付いているか（文面の確認用。既読でも出し、既読は書かない） */
	function isForced() {
		try { return new URLSearchParams(location.search).get('notice') === 'force'; } catch (e) { return false; }
	}

	window.UmaAnnounce = { ANNOUNCE: ANNOUNCE, TITLE_ID: TITLE_ID, fill: fill, isForced: isForced, version: ANNOUNCE_JS_VERSION };
})();
