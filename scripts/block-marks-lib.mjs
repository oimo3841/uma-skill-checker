// 塊の印（tests/visual/block-marks.json）の共通の部品（T127・2026-11-09・決定 477）。
// scripts/mark-blocks.mjs（一覧を作る・--check）と scripts/select-blocks.mjs（--purpose で絞る）が使う。
//
// 印（1つの塊に複数可）:
//   V 見た目（寸法・位置・はみ出し・色）  A 動き（押す・開く・状態・焦点）  T 文章（文言・読み上げ名）
//   S 保存データ（localStorage・IndexedDB・次に開いたとき）  C 計算・データ（件数・合計・OCR の結果・ハッシュ）
//   * すべてに当たる（印が決まらない塊。一覧に無い塊・新しい塊も同じ扱い）
// 印は塊の assert(判定, 名前, …) の「名前」の語で決め、名前で決まらなければ判定の式の形で補う（T125 の下調べの分け方を固めたもの）。
// 塊の印は、その塊の assert の1割以上か2件以上に付いた印（assert が3件以下の塊は1件でも）。混ざった塊は分けない。
import fs from 'node:fs';
import path from 'node:path';

export const MARKS_FILE = 'tests/visual/block-marks.json';
export const MARK_LETTERS = ['V', 'A', 'T', 'S', 'C'];
export const MARK_NAMES = { V: '見た目', A: '動き', T: '文章', S: '保存データ', C: '計算・データ' };

// ---- assert の名前の語（label）と、判定の式の形（cond）
const RE = {
	H: /コンソール(の)?エラー|エラー0|エラーなし|横スクロール(なし|が出ない|しない)|pageerror/,
	V: /幅|高さ|\d+px|px|はみ出|収ま|色|コントラスト|塗り|枠|線|影|余白|すき間|隙間|間隔|間が|揃|そろ|並ぶ|並び|位置|上端|下端|左端|右端|中央|左寄せ|右寄せ|重な|見え|隠れ|太字|字の大きさ|字の太さ|行の高さ|画素|縮め|縮む|列目|折り返|改行|アイコン|ダーク|ライト|背景|地の|透明|角丸|下線|帯|画面の中|画面内|スクロール|sticky|固定され|1行|2行|段に|配置|寸法|大きさ|ずれ|同じ画|画像の|描/,
	A: /押す|押した|押せ|押すと|開く|開い|開か|閉じ|切り替|選ぶ|選ん|選べ|外れ|外す|戻る|戻す|戻し|出る|出ない|出す|消え|消す|焦点|フォーカス|Esc|ドラッグ|スワイプ|入力|追加|削除|読み取|取り込|動き|動く|状態|有効|無効|反応|タップ|クリック|キー|ショートカット|元に戻|やり直|遷移|移る|移動|始ま|止ま|待た|呼ば|呼ぶ|渡す|渡る|共有|ダウンロード|知らせ|お知らせ|出てくる|表示され|表示する|表示しない/,
	T: /文言|文が|文は|文の|表記|読み上げ|aria|見出し|ラベル|案内|名前|題|文字列|書き方|「[^」]{1,40}」と(出|書|なる|読)|と書|の文|語|表の文|直書き|ふりがな|呼び名/,
	S: /保存|localStorage|sessionStorage|IndexedDB|indexedDB|次に開|開き直|再読み込み|読み込み直|リロード|reload|残る|残す|残っ|書き込|書き戻|移行|schemaVersion|復元|下書き|記録/,
	C: /件数|合計|\d+件|\d+個|数が|数は|ハッシュ|hash|OCR の結果|検出|一致|計算|理論値|SP|PT|pt|点数|順位|並べ替え|ソート|重複|顔ぶれ|行が|行の数|行数|欠け|照合|完全一致|正規化|集計|割合|平均|最大|最小/,
};
const CODE = {
	V: /getBoundingClientRect|getComputedStyle|offsetWidth|offsetHeight|clientWidth|scrollWidth|\.width\b|\.height\b|\brgb\(|contrast|pixel|\.w\b|\.h\b|\.x\b|\.y\b|\.top\b|\.left\b|\.bottom\b|\.right\b|fontSize|fontWeight|lineHeight|color|bg\b|border/,
	T: /textContent|innerText|getAttribute\('aria-label'\)|\.label\b|\.text\b|\.aria\b|===\s*'[^']*[぀-ヿ㐀-鿿]/,
	S: /localStorage|sessionStorage|indexedDB|getItem|setItem|\.saved\b|stored|schemaVersion/,
	A: /\.click\(|\.focus\b|activeElement|\.open\b|\.checked\b|expanded|pressed|disabled/,
	C: /\.length\s*===\s*\d|\.total\b|\.sum\b|\.count\b|hash|\.every\(|\.ids?\b/,
};

/** 対応するかっこの位置（s[open] が開きかっこ）。引用符の中は数えない。見つからなければ -1 */
function closeOf(s, open) {
	let depth = 0, q = null;
	for (let i = open; i < s.length; i++) {
		const c = s[i];
		if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
		if (c === '\'' || c === '"' || c === '`') { q = c; continue; }
		if ('([{'.includes(c)) depth++;
		else if (')]}'.includes(c) && --depth === 0) return i;
	}
	return -1;
}
/** 最上位のカンマで分ける */
function splitArgs(s) {
	const out = []; let depth = 0, q = null, cur = '';
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (q) { cur += c; if (c === '\\') { cur += s[++i] || ''; continue; } if (c === q) q = null; continue; }
		if (c === '\'' || c === '"' || c === '`') { q = c; cur += c; continue; }
		if ('([{'.includes(c)) depth++;
		if (')]}'.includes(c)) depth--;
		if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
		cur += c;
	}
	out.push(cur);
	return out;
}

/** assert の名前（ログの [NG] の行でもよい）だけから種類を見立てる。H＝共通の健全性・?＝決まらない */
export function classifyLabel(label) {
	const out = new Set();
	if (RE.H.test(label)) { out.add('H'); return out; }
	for (const k of MARK_LETTERS) if (RE[k].test(label)) out.add(k);
	if (out.size === 0) out.add('?');
	return out;
}
/** assert( の中身（判定, 名前, …）から種類を見立てる */
function classifyAssert(argsText) {
	const args = splitArgs(argsText);
	const cond = args[0] || '';
	const label = args[1] || '';
	const out = new Set();
	if (RE.H.test(label)) { out.add('H'); return out; }
	for (const k of MARK_LETTERS) if (RE[k].test(label)) out.add(k);
	if (out.size === 0) for (const k of ['V', 'T', 'S', 'A', 'C']) if (CODE[k].test(cond)) out.add(k);
	if (out.size === 0) out.add('?');
	return out;
}

/** 塊の本文（文字列）の assert を数え、印を決める。戻り値 { marks: 'VAT' か '*', asserts, cnt, unknownShare } */
export function marksOfText(text) {
	const cnt = { V: 0, A: 0, T: 0, S: 0, C: 0, H: 0, '?': 0 };
	let asserts = 0;
	const re = /\bassert\(/g;
	let m;
	while ((m = re.exec(text))) {
		const open = m.index + m[0].length - 1;
		const close = closeOf(text, open);
		if (close < 0) continue;
		asserts++;
		for (const k of classifyAssert(text.slice(open + 1, close))) cnt[k]++;
		re.lastIndex = close;
	}
	const marks = MARK_LETTERS.filter((k) => cnt[k] >= 2 || (asserts > 0 && cnt[k] / asserts >= 0.1) || (asserts <= 3 && cnt[k] >= 1));
	return { marks: marks.length ? marks.join('') : '*', asserts, cnt, unknownShare: asserts ? cnt['?'] / asserts : 0 };
}

// ---- 一覧の鍵: ファイル＋見出し（＋同じファイル・同じ見出しの中の順番。1から）
export const keyOf = (file, title, ord) => file + '\n' + title + '\n' + (ord || 1);
/** 塊の配列（{ file, title（実行時の見出し）}）に、同じファイル・同じ見出しの中の順番 ord を付けて返す */
export function withOrd(blocks, titleOf = (b) => b.title) {
	const seen = new Map();
	return blocks.map((b) => {
		const k = b.file + '\n' + titleOf(b);
		const n = (seen.get(k) || 0) + 1;
		seen.set(k, n);
		return { b, file: b.file, title: titleOf(b), ord: n, key: keyOf(b.file, titleOf(b), n) };
	});
}

/** 一覧を読む（無い・読めなければ null） */
export function loadMarks(root) {
	try { return JSON.parse(fs.readFileSync(path.join(root, MARKS_FILE), 'utf8')); } catch (e) { return null; }
}
/**
 * 一覧から、鍵 → { marks, source: 'auto'|'manual', why } の表を作る。overrides（人の手直し）が自動の印より先。
 * 一覧に無い鍵は表に無い（使う側で「すべてに当たる」と読む）。
 */
export function marksTable(doc) {
	const t = new Map();
	if (!doc) return t;
	for (const e of doc.blocks || []) t.set(keyOf(e.file, e.title, e.ord), { marks: e.marks, source: 'auto', review: !!e.review });
	for (const o of doc.overrides || []) t.set(keyOf(o.file, o.title, o.ord), { marks: o.marks, source: 'manual', why: o.why || '' });
	return t;
}
/** 印が、回す印の集合（例 Set{'T','V'}）に当たるか。'*'・印の無い塊は当たる */
export function marksHit(marks, want) {
	if (!marks || marks === '*') return true;
	if (want.has('*')) return true;
	return [...marks].some((k) => want.has(k));
}
