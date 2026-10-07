/* ============================================================
 * Uma Tools の画面の色（ライト／ダーク）を決める（js/theme.js）
 *
 * special.html / exam.html / uma-skill-deck.html が <head> の先頭近くで**同期で**読む
 * （defer / async / module を付けない）。<html> に data-theme を付けるのを body の解析より前に
 * 済ませるので、ライトが一瞬見えてからダークに替わる、ということが起きない。
 * Deck の引き出し（iframe）も同じファイルを読み、保存値・OS の設定・storage イベントで自力で追従する
 * （親から渡す仕組みは要らない。dark-mode-step0.md §4-3）。
 *
 * 保存の鍵は uma-tools-theme。値は 'light' ／ 'dark'。**「自動」は鍵を持たない**（無い＝自動）。
 * 鍵は利用者が選ぶまで書かない。壊れた値（light／dark 以外）は自動として扱い、書き換えない。
 * localStorage が使えない環境（プライベートモードなど）でも落ちない（try/catch で自動に倒す）。
 * この鍵は Deck の書き出し・取り込み（umaSkillDeck:userData だけを扱う）には入らない。
 *
 * 版は THEME_JS_VERSION。読むページの ?v= と一致させる（tests/visual/run-verify.mjs が検査する）。
 * ============================================================ */
var THEME_JS_VERSION = '2026-10-08a';

(function () {
	'use strict';
	var KEY = 'uma-tools-theme';

	/* **OS の設定（prefers-color-scheme）に従うか。** ダークの色が全画面にそろうまでは false にしておく
	   （決定13）。false の間は、保存された light／dark があるときだけ属性を付け、無いとき（自動）は
	   何も付けない＝OS がダークでもライトのまま。切り替えの部品と一緒に true にする（段7）。 */
	var FOLLOW_OS = false;

	var root = document.documentElement;
	var media = null;
	try { media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { media = null; }

	/** 保存されている選択。'light' ／ 'dark' ／ 'auto'（鍵が無い・壊れた値・読めない） */
	function stored() {
		var v = null;
		try { v = window.localStorage.getItem(KEY); } catch (e) { v = null; }
		return (v === 'light' || v === 'dark') ? v : 'auto';
	}

	/** いま画面に当てる色。'light' ／ 'dark' ／ null（属性を付けない） */
	function resolve(mode) {
		if (mode === 'light' || mode === 'dark') return mode;
		if (!FOLLOW_OS) return null;
		return (media && media.matches) ? 'dark' : 'light';
	}

	function apply() {
		var t = resolve(stored());
		if (t) { if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t); }
		else if (root.hasAttribute('data-theme')) root.removeAttribute('data-theme');
		return t;
	}

	apply();

	// 他のタブ・引き出しの iframe で選び直したとき（storage イベントは書いた文書自身には届かない）
	try {
		window.addEventListener('storage', function (e) {
			if (e.key === KEY || e.key === null) apply();
		});
	} catch (e) {}
	// OS の設定が変わったとき（自動のときだけ意味がある）
	if (media && FOLLOW_OS) {
		var onChange = function () { if (stored() === 'auto') apply(); };
		if (media.addEventListener) media.addEventListener('change', onChange);
		else if (media.addListener) media.addListener(onChange);
	}

	window.UmaTheme = {
		version: THEME_JS_VERSION,
		followsOs: FOLLOW_OS,
		/** 利用者の選択（'auto' ／ 'light' ／ 'dark'） */
		get: stored,
		/** いま付いている色（'light' ／ 'dark'。属性が無いときは 'light'） */
		current: function () { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; },
		/** 選び直す。'auto' は鍵を消す。保存できなくても、この画面には当てる */
		set: function (mode) {
			if (mode !== 'light' && mode !== 'dark') mode = 'auto';
			try {
				if (mode === 'auto') window.localStorage.removeItem(KEY);
				else window.localStorage.setItem(KEY, mode);
			} catch (e) {}
			var t = resolve(mode);
			if (t) root.setAttribute('data-theme', t);
			else root.removeAttribute('data-theme');
			return t;
		},
	};
})();
