/**
 * common.js
 * ウマ娘スキル管理ツール群（index.html / special.html）で共有する共通ロジック。
 *
 * 設計方針:
 * - このファイルはグローバル状態を持たない（副作用のない関数の集合）。
 * - 各ツール（index.html, special.html）は自分自身の状態変数
 *   （skillList, detectedSkills, matchReasons など）を保持し、
 *   ここに定義された関数へ引数として渡し、戻り値を受け取って自分の状態に反映する。
 * - スキルリストの内容（特定の技名など）に関する決め打ち・ハードコードは行わない。
 *   どんなスキルリストが来ても汎用的に正しく動くことを前提に設計する。
 */

/* ============================================================
 * 定数
 * ============================================================ */
const MAX_SIDE_PX = 3000;
const CONF_THRESHOLD = 55;
const ROW_TARGET_HEIGHT = 56;
const DARK_LEVEL = 128;
const ADAPTIVE_BLOCK = 31;
const ADAPTIVE_C = 12;

const CHAR_CONFUSION_MAP = {
	'娩': '娘', '嫡': '娘', '棒': '枠', '桶': '枠', '狐': '狼', '颯': '狼', '貴': '覚', '緯': '線', '被': '神'
};
const HOMOGLYPH_MAP = {
	'◯': '○', '〇': '○', '◎': '○', '●': '○', '◉': '○', '0': '○', 'O': '○', 'o': '○', 'Q': '○', 'D': '○', '°': '○',
	'一': 'ー', '-': 'ー', '‐': 'ー', '–': 'ー', '—': 'ー', '−': 'ー', '~': 'ー', '_': 'ー', '|': 'ー', 'l': 'ー', 'I': 'ー',
	'カ': '力', 'ニ': '二', '口': 'ロ', '卜': 'ト', '夕': 'タ', '工': 'エ', '才': 'オ', '八': 'ハ', 'ヘ': 'へ', 'ベ': 'べ', 'ペ': 'ぺ', '刀': '力', '儿': 'ル', '厶': 'ム', '又': 'ス'
};

/* ============================================================
 * 文字正規化・距離判定
 * ============================================================ */
function normalizeText(input) {
	if (!input) return '';
	let s = String(input).normalize('NFKC');
	s = s.replace(/[\s　]/g, '');
	s = s.replace(/[★☆✦✧♪♫※・,.。、:：;；!！?？"'`()（）\[\]{}<>«»\\\/@#$%^&*+=]/g, '');
	let out = '';
	for (const ch of s) {
		let c = (CHAR_CONFUSION_MAP[ch] !== undefined) ? CHAR_CONFUSION_MAP[ch] : ch;
		c = (HOMOGLYPH_MAP[c] !== undefined) ? HOMOGLYPH_MAP[c] : c;
		out += c;
	}
	return out.replace(/ー{2,}/g, 'ー');
}

function levenshtein(a, b) {
	const la = a.length, lb = b.length;
	if (la === 0) return lb;
	if (lb === 0) return la;
	let prev = new Array(lb + 1), cur = new Array(lb + 1);
	for (let j = 0; j <= lb; j++) prev[j] = j;
	for (let i = 1; i <= la; i++) {
		cur[0] = i;
		const ca = a[i - 1];
		for (let j = 1; j <= lb; j++) {
			const cost = ca === b[j - 1] ? 0 : 1;
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
		}
		const tmp = prev; prev = cur; cur = tmp;
	}
	return prev[lb];
}

function allowedDistance(len) {
	if (len <= 3) return 0;
	if (len <= 5) return 1;
	if (len <= 9) return 2;
	return 3;
}

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
 * 画像読み込み・キャンバス変換
 * ============================================================ */
function loadImage(file) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
		img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
		img.src = url;
	});
}

function toBaseCanvas(img) {
	const longSide = Math.max(img.naturalWidth, img.naturalHeight);
	const scale = longSide > MAX_SIDE_PX ? (MAX_SIDE_PX / longSide) : 1;
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(img.naturalWidth * scale);
	canvas.height = Math.round(img.naturalHeight * scale);
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	return canvas;
}

function scaleCanvas(canvas, targetWidth) {
	const scale = Math.max(1, Math.min(3, targetWidth / canvas.width));
	const out = document.createElement('canvas');
	out.width = Math.round(canvas.width * scale);
	out.height = Math.round(canvas.height * scale);
	const ctx = out.getContext('2d');
	ctx.imageSmoothingEnabled = true;
