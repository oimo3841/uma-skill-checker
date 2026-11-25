// T216（決定 912）: 決まりの一覧（tests/visual/design-spec.json）を読む道具。検査は期待値をここから読む。
// 値は製品から読まない（無人運用の型 7）。製品の CSS を読むのは scanRadii だけで、「決まりと違う宣言が無いか」を数えるため。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = path.resolve(HERE, '..', 'design-spec.json');

/** 決まりの一覧を読む。file を渡すと別の写し（わざと崩した写し）を読める。 */
export function loadSpec(file = process.env.UMA_DESIGN_SPEC || SPEC_PATH) {   // UMA_DESIGN_SPEC: わざと崩した写しを読ませる確かめ用（T216）
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 項目を引く（無ければ例外。検査が空の期待値で通るのを防ぐ）。 */
export function item(spec, id) {
	const it = spec.items[id];
	if (!it) throw new Error('決まりの一覧に項目が無い: ' + id);
	return it;
}

/** 項目の value を返す（'3px' など）。 */
export function value(spec, id) {
	const it = item(spec, id);
	if (it.value === undefined) throw new Error('決まりの一覧の項目に value が無い: ' + id);
	return it.value;
}

/** 項目の角の値を数（px）で返す。'3px' → 3。 */
export function px(spec, id) {
	const v = value(spec, id);
	const m = /^(\d+(?:\.\d+)?)px$/.exec(String(v));
	if (!m) throw new Error('px の値でない: ' + id + '=' + v);
	return Number(m[1]);
}

/** ↺ の置き場所など「どの端か」。 */
export function align(spec, id) { return value(spec, id).align; }

// ---------------------------------------------------------------------------
// 角の丸みの方針
// ---------------------------------------------------------------------------

/** 方針の切り替えが入っているか（false の間は、検査は製品に 3px を要求しない）。 */
export function cornerApplied(spec) { return spec.corner.applied === true; }

const FILES = ['css/shell.css', 'css/common.css', 'css/tokens.css', 'css/deck-alpha.css', 'special.html', 'exam.html', 'card-event-input.html', 'uma-skill-deck.html', 'deck-alpha.html', 'deck-alpha-register.html', 'js/uma-skill-deck-core.js', 'js/skill-result.js', 'js/pc-capture.js'];

const blank = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

function tokenPx(root) {
	const t = fs.readFileSync(path.join(root, 'css/tokens.css'), 'utf8');
	const map = {};
	for (const m of blank(t).matchAll(/(--uma-r-[a-z]+)\s*:\s*([^;]+);/g)) map[m[1]] = m[2].trim();
	return map;
}

/** 製品の CSS（と html・js の中の CSS の文字）から border-radius の宣言を拾う。 */
export function scanRadii(root, files = FILES) {
	const tokens = tokenPx(root);
	const out = [];
	for (const f of files) {
		const p = path.join(root, f);
		if (!fs.existsSync(p)) continue;
		const t = blank(fs.readFileSync(p, 'utf8'));
		for (const m of t.matchAll(/border-radius:\s*([^;}'"\n]+)/g)) {
			let raw = m[1].trim().replace(/\s*!important$/, '');
			let val = raw;
			// var(--uma-r-xx) と var(--uma-r-xx, 3px) を、トークンの値に置き換える（calc の中も）
			val = val.replace(/var\((--uma-r-[a-z]+)(?:\s*,\s*[^)]*)?\)/g, (all, name) => (tokens[name] !== undefined ? tokens[name] : all));
			val = val.replace(/calc\(\s*(\d+(?:\.\d+)?)px\s*-\s*(\d+(?:\.\d+)?)px\s*\)/g, (all, a, b) => (Number(a) - Number(b)) + 'px');
			const open = t.lastIndexOf('{', m.index);
			let sel = '';
			if (open >= 0) {
				const prev = Math.max(t.lastIndexOf('}', open), t.lastIndexOf(';', open), t.lastIndexOf('>', open));
				sel = t.slice(prev + 1, open).replace(/\s+/g, ' ').trim().slice(0, 160);
			}
			const line = t.slice(0, m.index).split('\n').length;
			out.push({ file: f, line, raw, value: val, selector: sel, kind: kindOf(val) });
		}
	}
	return out;
}

/** 'zero'・'round'（50%・999px 以上）・'px'（1 つの px）・'multi'（複数の値）・'other'。 */
export function kindOf(v) {
	const s = String(v).trim();
	if (s === '0' || /^0(px)?$/.test(s)) return 'zero';
	if (s === '50%' || /^9{3,}px$/.test(s) || /^\d{3,}px$/.test(s) && Number(s.replace('px', '')) >= 500) return 'round';
	if (/^\d+(?:\.\d+)?px$/.test(s)) return 'px';
	if (s === 'inherit') return 'inherit';
	if (/\s/.test(s) && /^[\d.px% ]+$/.test(s)) return 'multi';
	return 'other';
}

/** 複数の値（8px 0 0 8px など）が、0 と目標の値だけでできているか（片側だけ丸い部品）。 */
function multiIsTarget(v, target) {
	// 並べたボタンの端（目標 − 1px。ボタンの枠の内側の角）も目標の仲間として通す
	const inner = (parseFloat(target) - 1) + 'px';
	return String(v).trim().split(/\s+/).every((p) => /^0(px)?$/.test(p) || p === target || p === inner);
}

/** 例外のセレクタか（模式図の紙・小窓の中の模式図）。 */
/** カンマ区切りのセレクタの中に、そのセレクタ（そのまま）があるか。子孫（`#x .rc-tbl-wrap` など）は別の規則。 */
export function hasPart(selector, name) { return selector.split(',').map((s) => s.trim()).includes(name); }

export function isExceptionSelector(spec, selector) {
	const sheet = spec.corner.exceptions.sheet.selectors;
	if (sheet.some((s) => hasPart(selector, s))) return 'sheet';
	if (/\.stitch-wire(?!-sheet)|\.w2-/.test(selector)) return 'canvas-schema';
	return null;
}

/** 方針が「適用」のときの、決まりと違う宣言。未適用なら空（要求しない）。 */
export function cornerViolations(spec, scan) {
	if (!cornerApplied(spec)) return [];
	const target = spec.corner.target;
	return scan.filter((d) => {
		if (d.kind === 'round') return spec.corner.exceptions.round.enabled === false;   // 円・錠剤形は対象外（enabled:false は「例外を外した崩した写し」）
		if (d.kind === 'zero' || d.kind === 'inherit') return false;
		const ex = isExceptionSelector(spec, d.selector);
		if (ex === 'canvas-schema') return false;
		if ((spec.corner.staticScanIgnore || []).some((x) => d.file === x.file && hasPart(d.selector, x.selector))) return false;   // あとの規則が上書きしていると決めてある宣言（理由は一覧に書く）
		if (ex === 'sheet') return d.value !== spec.corner.exceptions.sheet.value;
		if (d.kind === 'multi') return !multiIsTarget(d.value, target);
		return d.kind !== 'px' || d.value !== target;
	});
}

/** 円・錠剤形の宣言をファイルごとに数える（一覧 roundDeclCounts と照らして、新しい円形が増えたら気づく）。 */
export function roundCounts(scan) {
	const c = {};
	for (const d of scan) if (d.kind === 'round') c[d.file] = (c[d.file] || 0) + 1;
	return c;
}

// ---------------------------------------------------------------------------
// 置き場所
// ---------------------------------------------------------------------------

const ALIGN_JA = { 'bottom-left': '左下', 'bottom-right': '右下' };
export function alignName(align) { return ALIGN_JA[align] || align; }

/**
 * 部品（box）が、決まりの置き場所（align）にあるか。ずれていれば理由、合っていれば null。
 * 左下＝左端が bar の左端 ±1.5・右下＝右端が bar の右端 ±1.5。panel を渡したときは、下端が panel の内側（+0.5）であることも見る。
 */
export function alignProblem(align, box, bar, panel) {
	if (align === 'bottom-left') { if (Math.abs(box.l - bar.l) > 1.5) return '左端がバーの左端にそろっていない'; }
	else if (align === 'bottom-right') { if (Math.abs(box.r - bar.r) > 1.5) return '右端がバーの右端にそろっていない'; }
	else throw new Error('知らない置き場所: ' + align);
	if (panel && box.b > panel.b + 0.5) return '下端がパネルの外';
	return null;
}
