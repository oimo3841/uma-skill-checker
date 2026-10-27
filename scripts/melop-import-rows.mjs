// めろっぷの新しい行の一覧（データ側の melop-new-rows.json）を、data/melop-sheet-rows.json と data/skill-efficiency.json に差し込む道具（C-218・2026-10-27）。
//
// 一覧は行番号を持たない。各行の insertAfterId（直前の既存の独自ID）の直後に入れ、同じ insertAfterId の行は一覧の並びのとおりに続ける。
// そのあと melop-sheet-rows.json の行番号を先頭の行番号から振り直し、note の「（N〜M行目）」も直す。
// skill-efficiency.json には、めろっぷの行の順で直前にある効率の行の直後に入れる（並びは melop-sheet-rows.json の行の順）。
//
// 止まる（何も書かない。終了コード 1）とき:
//   - 一覧の形が違う（先頭・行のキーの過不足・型・category が melopNewRows でない・知らない要確認の印）
//   - score・sp・efficiency・group のどれかが null の行、または insertAfterId が null の行がある（案A。該当の行を出す）
//   - insertAfterId の行がツール側のファイルに無い／取り込む id がすでにある（二重の取り込み）／一覧の中で id が重なる
//   - いまのファイルの書式が、この道具の書き出しと同じでない（書き出すと関係ない行まで変わるため）
// 要確認の印（needsReview）があっても値と直前が決まる行は取り込み、報告に一覧で出す（おいもさんが確かめる）。
//
// 使い方:
//   node scripts/melop-import-rows.mjs <melop-new-rows.json> [--version <版>] [--data-dir <dir>] [--out-dir <dir>] [--report <json>]
//     --version   … 2つのファイルの dataVersion をこの版にする（省くと変えない。exam.html の EXAM_DATA_JSON_VERSIONS は手で合わせる）
//     --data-dir  … 読むフォルダ（既定 data/）。--out-dir … 書くフォルダ（既定は --data-dir と同じ）
//     --report    … 取り込んだ行・要確認の行・計算と違う効率の行を JSON で書く（検査用）
//   改行（CRLF／LF）はいまのファイルのまま。同じ入力からは同じバイト列になる。
//
// スキル名・ID をこのファイルに書かないこと（名前と ID は一覧とデータから読む）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MELOP_FILE = 'melop-sheet-rows.json';
const EFF_FILE = 'skill-efficiency.json';
const LIST_TOP_KEYS = ['dataVersion', 'category', 'note', 'rows'];
const LIST_ROW_KEYS = ['id', 'name', 'group', 'insertAfterId', 'score', 'sp', 'efficiency', 'needsReview'];
const LIST_CATEGORY = 'melopNewRows';
const REVIEW_FLAGS = ['exception', 'sheetValue', 'sp150', 'effectUnknown', 'spUnknown', 'noOrder', 'sheetMismatch'];
const VERSION_RE = /^\d{4}-\d{2}-\d{2}[a-z]$/;

function parseArgs(argv) {
	const o = { list: null, version: null, dataDir: path.join(ROOT, 'data'), outDir: null, report: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const val = () => { if (i + 1 >= argv.length) usage(a + ' の値が無い'); return argv[++i]; };
		if (a === '--version') o.version = val();
		else if (a === '--data-dir') o.dataDir = path.resolve(val());
		else if (a === '--out-dir') o.outDir = path.resolve(val());
		else if (a === '--report') o.report = path.resolve(val());
		else if (a.startsWith('--')) usage('知らない引数: ' + a);
		else if (o.list) usage('一覧のファイルは1つだけ');
		else o.list = path.resolve(a);
	}
	if (!o.list) usage('一覧のファイル（melop-new-rows.json）を指定する');
	if (o.version !== null && !VERSION_RE.test(o.version)) usage('--version は 2026-10-27a の形: ' + o.version);
	if (!o.outDir) o.outDir = o.dataDir;
	return o;
}
function usage(msg) {
	console.error('使い方の誤り: ' + msg);
	console.error('  node scripts/melop-import-rows.mjs <melop-new-rows.json> [--version <版>] [--data-dir <dir>] [--out-dir <dir>] [--report <json>]');
	process.exit(2);
}
function stop(title, lines) {
	console.error('止まった（何も書いていない）: ' + title);
	(lines || []).forEach((l) => console.error('  - ' + l));
	process.exit(1);
}

/* いまのデータの書式（タブ字下げ・先頭の各キーが1行・オブジェクトの配列は1要素1行・数の配列は ", " 区切り・末尾改行1つ） */
function serialize(doc, NL) {
	const keys = Object.keys(doc);
	const out = ['{'];
	keys.forEach((k, i) => {
		const v = doc[k];
		const comma = i < keys.length - 1 ? ',' : '';
		if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
			out.push('\t' + JSON.stringify(k) + ': [');
			v.forEach((x, j) => out.push('\t\t' + JSON.stringify(x) + (j < v.length - 1 ? ',' : '')));
			out.push('\t]' + comma);
		} else if (Array.isArray(v)) {
			out.push('\t' + JSON.stringify(k) + ': [' + v.map((x) => JSON.stringify(x)).join(', ') + ']' + comma);
		} else {
			out.push('\t' + JSON.stringify(k) + ': ' + JSON.stringify(v) + comma);
		}
	});
	out.push('}');
	return out.join(NL) + NL;
}
function readData(dir, file) {
	const p = path.join(dir, file);
	if (!fs.existsSync(p)) stop('ファイルが無い', [p]);
	const text = fs.readFileSync(p, 'utf8');
	const NL = text.includes('\r\n') ? '\r\n' : '\n';
	let doc;
	try { doc = JSON.parse(text); } catch (e) { stop(file + ' が JSON として読めない', [e.message]); }
	if (serialize(doc, NL) !== text) stop(file + ' の書式が、この道具の書き出しと同じでない（書き出すと関係ない行まで変わる）', [p]);
	return { doc, NL };
}

const opt = parseArgs(process.argv.slice(2));

/* ---- 一覧の形 ---- */
let list;
try { list = JSON.parse(fs.readFileSync(opt.list, 'utf8').replace(/^﻿/, '')); } catch (e) { stop('一覧が読めない', [opt.list, e.message]); }
{
	const errs = [];
	if (!list || typeof list !== 'object' || Array.isArray(list)) stop('一覧の形が違う', ['先頭がオブジェクトでない']);
	const top = Object.keys(list);
	LIST_TOP_KEYS.filter((k) => !top.includes(k)).forEach((k) => errs.push('先頭に足りないキー: ' + k));
	top.filter((k) => !LIST_TOP_KEYS.includes(k)).forEach((k) => errs.push('先頭の知らないキー: ' + k));
	if (top.includes('category') && list.category !== LIST_CATEGORY) errs.push('category が ' + LIST_CATEGORY + ' でない: ' + JSON.stringify(list.category));
	if (top.includes('dataVersion') && typeof list.dataVersion !== 'string') errs.push('dataVersion が文字列でない');
	if (top.includes('note') && typeof list.note !== 'string') errs.push('note が文字列でない');
	if (top.includes('rows') && !Array.isArray(list.rows)) errs.push('rows が配列でない');
	if (errs.length) stop('一覧の形が違う', errs);
	list.rows.forEach((r, i) => {
		const w = 'rows[' + i + ']' + (r && typeof r.id === 'string' ? '（' + r.id + '）' : '');
		if (!r || typeof r !== 'object' || Array.isArray(r)) { errs.push(w + ': オブジェクトでない'); return; }
		const ks = Object.keys(r);
		LIST_ROW_KEYS.filter((k) => !ks.includes(k)).forEach((k) => errs.push(w + ': 足りないキー ' + k));
		ks.filter((k) => !LIST_ROW_KEYS.includes(k)).forEach((k) => errs.push(w + ': 知らないキー ' + k));
		if (typeof r.id !== 'string' || !r.id) errs.push(w + ': id が空か文字列でない');
		if (typeof r.name !== 'string' || !r.name) errs.push(w + ': name が空か文字列でない');
		if (r.group !== null && (typeof r.group !== 'string' || !r.group)) errs.push(w + ': group が文字列でも null でもない');
		if (r.insertAfterId !== null && (typeof r.insertAfterId !== 'string' || !r.insertAfterId)) errs.push(w + ': insertAfterId が文字列でも null でもない');
		if (r.score !== null && !Number.isInteger(r.score)) errs.push(w + ': score が整数でも null でもない');
		if (r.sp !== null && !(Number.isInteger(r.sp) && r.sp > 0)) errs.push(w + ': sp が正の整数でも null でもない');
		if (r.efficiency !== null && !(typeof r.efficiency === 'number' && Number.isFinite(r.efficiency) && Math.round(r.efficiency * 1000) / 1000 === r.efficiency)) errs.push(w + ': efficiency が小数第3位までの数でも null でもない');
		if (!Array.isArray(r.needsReview)) errs.push(w + ': needsReview が配列でない');
		else {
			r.needsReview.filter((f) => !REVIEW_FLAGS.includes(f)).forEach((f) => errs.push(w + ': 知らない要確認の印 ' + JSON.stringify(f)));
			if (new Set(r.needsReview).size !== r.needsReview.length) errs.push(w + ': 要確認の印が重なる');
		}
	});
	if (errs.length) stop('一覧の形が違う', errs);
}

/* ---- 値・直前が決まらない行（案A：1行でもあればファイルごと取り込まない） ---- */
{
	const bad = [];
	list.rows.forEach((r) => {
		const nulls = ['score', 'sp', 'efficiency', 'group', 'insertAfterId'].filter((k) => r[k] === null);
		if (nulls.length) bad.push(r.id + '（' + r.name + '）: ' + nulls.join('・') + ' が null' + (r.needsReview.length ? '。印 ' + r.needsReview.join('・') : ''));
	});
	if (bad.length) stop('値か直前が決まらない行がある（' + bad.length + '行）', bad);
}

/* ---- ツール側のファイルと突き合わせる ---- */
const melop = readData(opt.dataDir, MELOP_FILE);
const eff = readData(opt.dataDir, EFF_FILE);
const rows = melop.doc.rows;
const entries = eff.doc.entries;
if (!Array.isArray(rows) || !rows.length) stop(MELOP_FILE + ' に rows が無い');
if (!Array.isArray(entries)) stop(EFF_FILE + ' に entries が無い');
const FIRST = rows[0].row;
{
	const gaps = rows.filter((r, i) => r.row !== FIRST + i).slice(0, 5).map((r) => 'row ' + r.row + '（' + (rows.indexOf(r) + 1) + '行目の要素）');
	if (gaps.length) stop(MELOP_FILE + ' の行番号が先頭から連続していない', gaps);
}
{
	const errs = [];
	const melopIds = new Set(rows.filter((r) => r.id).map((r) => r.id));
	const effIds = new Set(entries.map((e) => e.skillId));
	const seen = new Set();
	list.rows.forEach((r) => {
		if (seen.has(r.id)) errs.push(r.id + '（' + r.name + '）: 一覧の中で id が重なる');
		seen.add(r.id);
		if (melopIds.has(r.id)) errs.push(r.id + '（' + r.name + '）: ' + MELOP_FILE + ' にすでにある（二重の取り込み）');
		if (effIds.has(r.id)) errs.push(r.id + '（' + r.name + '）: ' + EFF_FILE + ' にすでにある（二重の取り込み）');
		if (!melopIds.has(r.insertAfterId)) errs.push(r.id + '（' + r.name + '）: insertAfterId ' + r.insertAfterId + ' の行が ' + MELOP_FILE + ' に無い');
	});
	if (errs.length) stop('ツール側のファイルと合わない', errs);
}

/* ---- 差し込み ---- */
const byAfter = new Map();
list.rows.forEach((r) => { if (!byAfter.has(r.insertAfterId)) byAfter.set(r.insertAfterId, []); byAfter.get(r.insertAfterId).push(r); });
const newIds = new Set(list.rows.map((r) => r.id));
const merged = [];
rows.forEach((r) => {
	merged.push(r);
	(r.id && byAfter.get(r.id) || []).forEach((n) => merged.push({ row: 0, group: n.group, name: n.name, id: n.id }));
});
merged.forEach((r, i) => { r.row = FIRST + i; });
const LAST = FIRST + merged.length - 1;

const effOut = entries.slice();
const effPos = (id) => effOut.findIndex((e) => e.skillId === id);
list.rows.forEach((n) => {
	// めろっぷの行の順で、この行より前にあって効率の行を持つもののうち、いちばん近いものの直後
	const at = merged.findIndex((r) => r.id === n.id);
	let k = -1;
	for (let j = at - 1; j >= 0 && k < 0; j--) if (merged[j].id) k = effPos(merged[j].id);
	effOut.splice(k + 1, 0, { skillId: n.id, score: n.score, sp: n.sp, efficiency: n.efficiency });
});

const melopDoc = Object.assign({}, melop.doc, { rows: merged });
const effDoc = Object.assign({}, eff.doc, { entries: effOut });
const RANGE_RE = /（(\d+)〜(\d+)行目）/;
let noteFixed = false;
if (typeof melopDoc.note === 'string' && RANGE_RE.test(melopDoc.note)) {
	melopDoc.note = melopDoc.note.replace(RANGE_RE, '（' + FIRST + '〜' + LAST + '行目）');
	noteFixed = true;
}
if (opt.version) { melopDoc.dataVersion = opt.version; effDoc.dataVersion = opt.version; }

/* ---- 報告（書く前に作る） ---- */
const inserted = list.rows.map((n) => ({ id: n.id, name: n.name, row: merged.find((r) => r.id === n.id).row, insertAfterId: n.insertAfterId, needsReview: n.needsReview.slice() }));
const review = inserted.filter((x) => x.needsReview.length);
const effDiff = list.rows.filter((n) => Math.round(n.score * 1000 / n.sp) / 1000 !== n.efficiency)
	.map((n) => ({ id: n.id, name: n.name, score: n.score, sp: n.sp, efficiency: n.efficiency, calc: Math.round(n.score * 1000 / n.sp) / 1000 }));

const melopText = serialize(melopDoc, melop.NL);
const effText = serialize(effDoc, eff.NL);
fs.mkdirSync(opt.outDir, { recursive: true });
fs.writeFileSync(path.join(opt.outDir, MELOP_FILE), melopText);
fs.writeFileSync(path.join(opt.outDir, EFF_FILE), effText);
if (opt.report) {
	fs.mkdirSync(path.dirname(opt.report), { recursive: true });
	fs.writeFileSync(opt.report, JSON.stringify({ listVersion: list.dataVersion, firstRow: FIRST, lastRow: LAST, rowCount: merged.length, inserted, review, effDiff }, null, '\t') + '\n');
}

console.log('一覧 ' + list.dataVersion + '・' + list.rows.length + '行を取り込んだ → ' + path.relative(ROOT, opt.outDir).replace(/\\/g, '/') + '/（改行 ' + (melop.NL === '\r\n' ? 'CRLF' : 'LF') + ' のまま）');
inserted.forEach((x) => console.log('  ' + x.row + '行目 ' + x.name + '（' + x.id + '・直前 ' + x.insertAfterId + '）' + (x.needsReview.length ? ' 要確認: ' + x.needsReview.join('・') : '')));
console.log('行番号 ' + FIRST + '〜' + LAST + '（' + merged.length + '行）' + (noteFixed ? '。note の範囲も直した' : '。note に「（N〜M行目）」が無いので直していない'));
console.log('dataVersion: ' + (opt.version ? opt.version + ' にした' : '変えていない（--version で上げる）'));
if (review.length) {
	console.log('要確認の行（' + review.length + '行。取り込んだので、シートで確かめる）:');
	review.forEach((x) => console.log('  ' + x.row + '行目 ' + x.name + '（' + x.id + '）: ' + x.needsReview.join('・')));
}
if (effDiff.length) {
	console.log('効率が 評価点÷消費sp の丸めと違う行（' + effDiff.length + '行。check:catalog §14 の EFF_ROUNDING_EXEMPT に理由を足すか、値を直す）:');
	effDiff.forEach((x) => console.log('  ' + x.name + '（' + x.id + '）: ' + x.score + '÷' + x.sp + ' → 計算 ' + x.calc + '／一覧 ' + x.efficiency));
}
console.log('あと: exam.html の EXAM_DATA_JSON_VERSIONS（2本）と check:catalog の MELOP_LAST_ROW（→ ' + LAST + '）を合わせ、check:catalog・test:verify を回す');
