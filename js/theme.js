/* ============================================================
 * Uma Tools の画面の色（ライト／ダーク）を決める（js/theme.js）
 *
 * special.html / exam.html / uma-skill-deck.html / css/styleguide.html が <head> の先頭近くで**同期で**読む
 * （defer / async / module を付けない）。<html> に data-theme を付けるのを body の解析より前に
 * 済ませるので、ライトが一瞬見えてからダークに替わる、ということが起きない。
 * Deck の引き出し（iframe）も同じファイルを読み、保存値・OS の設定・storage イベントで自力で追従する
 * （親から渡す仕組みは要らない。dark-mode-step0.md §4-3）。
 *
 * 保存の鍵は uma-tools-theme。値は 'light' ／ 'dark'。**「自動」は鍵を持たない**（無い＝自動）。
 * 鍵は利用者が選ぶまで書かない。壊れた値（light／dark 以外）は自動として扱い、書き換えない。
 * localStorage が使えない環境（プライベートモードなど）でも落ちない（読めなければ自動。選んだものはその画面の中だけ覚える）。
 * この鍵は Deck の書き出し・取り込み（umaSkillDeck:userData だけを扱う）には入らない。
 *
 * <html data-theme> は**常に 'light' か 'dark' のどちらか**（属性が無い状態を作らない。§4-1）。
 * 自動のときは OS の設定（prefers-color-scheme）に従い、OS の設定が変わったら付け替える。
 *
 * 切り替えの部品（special／exam の「？」の小窓の「画面の色」の行・スタイルガイド）は、
 * [data-uma-theme-picker] の中の [data-theme-choice="auto|light|dark"] のボタン。このファイルが付け外しまで面倒を見る。
 *
 * 版は THEME_JS_VERSION。読むページの ?v= と一致させる（tests/visual/run-verify.mjs が検査する）。
 * ============================================================ */
var THEME_JS_VERSION = '2026-10-08b';

(function () {
	'use strict';
	var KEY = 'uma-tools-theme';

	/* **OS の設定（prefers-color-scheme）に従うか。** 段1〜6 の間は false で止めていた（決定13）。
	   段7（2026-10-08・C-135）で、切り替えの部品と同じ commit で true にした。 */
	var FOLLOW_OS = true;

	var root = document.documentElement;
	var media = null;
	try { media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { media = null; }
	// localStorage が使えないときに、この画面の中だけ覚えておく選択
	var memo = null;

	/** 保存されている選択。'light' ／ 'dark' ／ 'auto'（鍵が無い・壊れた値・読めない） */
	function stored() {
		var v = null;
		try { v = window.localStorage.getItem(KEY); } catch (e) { v = memo; }
		return (v === 'light' || v === 'dark') ? v : 'auto';
	}

	/** いま画面に当てる色。'light' ／ 'dark' ／ null（属性を付けない＝OS の追従を止めているときの自動） */
	function resolve(mode) {
		if (mode === 'light' || mode === 'dark') return mode;
		if (!FOLLOW_OS) return null;
		return (media && media.matches) ? 'dark' : 'light';
	}

	function setAttr(t) {
		if (t) { if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t); }
		else if (root.hasAttribute('data-theme')) root.removeAttribute('data-theme');
	}

	function apply() {
		var t = resolve(stored());
		setAttr(t);
		syncPickers();
		return t;
	}

	/* ---- 切り替えの部品 ---- */
	function pickers() {
		return document.querySelectorAll ? document.querySelectorAll('[data-uma-theme-picker]') : [];
	}
	/** 選ばれているボタンを示す（aria-checked と、キーボードで最初に止まる1つ＝tabindex） */
	function syncPickers() {
		var mode = stored();
		var list = pickers();
		for (var i = 0; i < list.length; i++) {
			var btns = list[i].querySelectorAll('[data-theme-choice]');
			for (var j = 0; j < btns.length; j++) {
				var on = btns[j].getAttribute('data-theme-choice') === mode;
				btns[j].setAttribute('aria-checked', on ? 'true' : 'false');
				btns[j].tabIndex = on ? 0 : -1;
			}
		}
	}
	function initPickers() {
		var list = pickers();
		for (var i = 0; i < list.length; i++) {
			var box = list[i];
			if (box.getAttribute('data-uma-theme-ready')) continue;
			box.setAttribute('data-uma-theme-ready', '1');
			box.addEventListener('click', function (e) {
				var b = e.target.closest ? e.target.closest('[data-theme-choice]') : null;
				if (b) api.set(b.getAttribute('data-theme-choice'));
			});
			// 左右（上下）の矢印キーで隣へ移って、そのまま選ぶ（radiogroup の決まり）
			box.addEventListener('keydown', function (e) {
				var k = e.key;
				if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
				var btns = Array.prototype.slice.call(this.querySelectorAll('[data-theme-choice]'));
				var at = btns.indexOf(document.activeElement);
				if (at < 0) return;
				e.preventDefault();
				var next = btns[(at + ((k === 'ArrowRight' || k === 'ArrowDown') ? 1 : btns.length - 1)) % btns.length];
				api.set(next.getAttribute('data-theme-choice'));
				next.focus();
			});
		}
		syncPickers();
	}

	apply();

	// 他のタブ・引き出しの iframe で選び直したとき（storage イベントは書いた文書自身には届かない）
	try {
		window.addEventListener('storage', function (e) {
			if (e.key === KEY || e.key === null) apply();
		});
	} catch (e) {}
	// OS の設定が変わったとき（自動のときだけ付け替える）
	if (media && FOLLOW_OS) {
		var onChange = function () { if (stored() === 'auto') apply(); };
		if (media.addEventListener) media.addEventListener('change', onChange);
		else if (media.addListener) media.addListener(onChange);
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPickers);
	else initPickers();

	var api = {
		version: THEME_JS_VERSION,
		followsOs: FOLLOW_OS,
		/** 利用者の選択（'auto' ／ 'light' ／ 'dark'） */
		get: stored,
		/** いま付いている色（'light' ／ 'dark'） */
		current: function () { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; },
		/** 選び直す。'auto' は鍵を消す。保存できなくても、この画面には当てる */
		set: function (mode) {
			if (mode !== 'light' && mode !== 'dark') mode = 'auto';
			memo = mode === 'auto' ? null : mode;
			try {
				if (mode === 'auto') window.localStorage.removeItem(KEY);
				else window.localStorage.setItem(KEY, mode);
			} catch (e) {}
			var t = resolve(mode);
			setAttr(t);
			syncPickers();
			return t;
		},
		/** あとから足した切り替えの部品をつなぐ */
		initPickers: initPickers,
	};
	window.UmaTheme = api;
})();
