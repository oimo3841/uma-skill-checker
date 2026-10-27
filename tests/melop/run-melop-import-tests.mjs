// めろっぷの新しい行の取り込みの道具（scripts/melop-import-rows.mjs・C-218）の検査（2026-10-27）。
//
//   node tests/melop/run-melop-import-tests.mjs [--list <melop-new-rows.json>]      （npm run test:melop-import）
//
// 確かめること:
//   (1) いまの data/ から 2026-10-26 に足した行（その commit の前に無く、効率の行を持つもの）を除いた「元」に、
//       その行から作った一覧（insertAfterId と group はいまのファイルの値から）を当てると、いまの2ファイルとバイト単位で一致する
//   (2) 同じ入力を2回回すと同じバイト列。取り込んだ結果にもう一度当てると、二重の取り込みで止まり何も書かない
//   (3) --list で渡したデータ側の一覧も、(1) の元に当てて一致する（渡さなければ飛ばす）
//   (4) exception・sheetValue の印の行は取り込まれ、報告の一覧に出る
//   (5) null の行・insertAfterId が無い行・重複の id・形の違いでは、終了コード 1 で止まり、何も書かない
// スキル名・ID は書かない（足した行は git の履歴と効率のファイルから決める）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(ROOT, 'scripts', 'melop-import-rows.mjs');
const OUT = path.join(ROOT, 'output', 'scratch', 'melop-import-tests');
const MELOP = 'melop-sheet-rows.json', EFF = 'skill-efficiency.json';
// めろっぷの行に新しいスキル7行と駿大祭シナリオを足した commit（2026-10-26・data 2026-10-26a）
const ADDED_COMMIT = 'c453edf';
const argList = (() => { const i = process.argv.indexOf('--list'); return i > 0 ? path.resolve(process.argv[i + 1]) : null; })();

let ok = 0, ng = 0;
const check = (cond, label, detail) => {
	if (cond) { ok++; console.log('  OK  ' + label); }
	else { ng++; console.log('  NG  ' + label + (detail ? '\n        ' + detail : '')); }
};
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const read = (p) => fs.readFileSync(p, 'utf8');
const cur = { melop: read(path.join(ROOT, 'data', MELOP)), eff: read(path.join(ROOT, 'data', EFF)) };
const NL = cur.melop.includes('\r\n') ? '\r\n' : '\n';
const curMelop = JSON.parse(cur.melop), curEff = JSON.parse(cur.eff);

/* ---- 2026-10-26 に足した行（その commit の前のファイルに無い id のうち、効率の行を持つもの） ---- */
const prevMelop = JSON.parse(execFileSync('git', ['show', ADDED_COMMIT + '^:data/' + MELOP], { cwd: ROOT, encoding: 'utf8' }));
const prevIds = new Set(prevMelop.rows.filter((r) => r.id).map((r) => r.id));
const effIds = new Set(curEff.entries.map((e) => e.skillId));
const addedIds = curMelop.rows.filter((r) => r.id && !prevIds.has(r.id) && effIds.has(r.id)).map((r) => r.id);
const added = new Set(addedIds);
console.log('2026-10-26 に足した行（効率の行を持つもの）: ' + addedIds.length + '行');

/* ---- 元（いまのファイルからその行を除き、行番号と note の範囲を詰めたもの）。道具とは別に、行の文字列のまま作る ---- */
function makeBase(drop) {
	const mLines = cur.melop.split(NL);
	let n = curMelop.rows[0].row;
	const mOut = mLines.filter((l) => { const m = l.match(/"id":"([^"]+)"/); return !(m && l.trim().startsWith('{"row":') && drop.has(m[1])); })
		.map((l) => (l.trim().startsWith('{"row":') ? l.replace(/^(\t\t\{"row":)\d+/, (s, p) => p + (n++)) : l));
	const last = n - 1;
	const melopText = mOut.join(NL).replace(/（(\d+)〜(\d+)行目）/, (s, a) => '（' + a + '〜' + last + '行目）');
	const effText = cur.eff.split(NL).filter((l) => { const m = l.match(/^\t\t\{"skillId":"([^"]+)"/); return !(m && drop.has(m[1])); }).join(NL);
	return { melopText, effText };
}
function writeBase(dir, base) {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, MELOP), base.melopText);
	fs.writeFileSync(path.join(dir, EFF), base.effText);
}
/* ---- いまのファイルから作る一覧（insertAfterId は、除いた行より前で、除いていない・id のある、いちばん近い行） ---- */
function makeList(ids) {
	const rows = [];
	curMelop.rows.forEach((r, i) => {
		if (!r.id || !ids.has(r.id)) return;
		let after = null;
		for (let j = i - 1; j >= 0 && after === null; j--) { const p = curMelop.rows[j]; if (p.id && !ids.has(p.id)) after = p.id; }
		const e = curEff.entries.find((x) => x.skillId === r.id);
		rows.push({ id: r.id, name: r.name, group: r.group, insertAfterId: after, score: e.score, sp: e.sp, efficiency: e.efficiency, needsReview: [] });
	});
	return { dataVersion: '2026-10-27-test', category: 'melopNewRows', note: '検査用（いまのファイルから作った一覧）', rows };
}
let seq = 0;
function run(list, dataDir, extra) {
	const tag = 'run' + (++seq);
	const listPath = path.join(OUT, tag + '-list.json');
	if (typeof list === 'string') fs.copyFileSync(list, listPath); else fs.writeFileSync(listPath, JSON.stringify(list, null, '\t') + '\n');
	const outDir = path.join(OUT, tag + '-out');
	const report = path.join(OUT, tag + '-report.json');
	const r = spawnSync(process.execPath, [TOOL, listPath, '--data-dir', dataDir, '--out-dir', outDir, '--report', report].concat(extra || []), { encoding: 'utf8' });
	const files = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
	return { code: r.status, stdout: r.stdout, stderr: r.stderr, outDir, files, report: fs.existsSync(report) ? JSON.parse(read(report)) : null,
		read: (f) => read(path.join(outDir, f)) };
}
const sameFiles = (res) => res.code === 0 && res.read(MELOP) === cur.melop && res.read(EFF) === cur.eff;

const base = makeBase(added);
const baseDir = path.join(OUT, 'base');
writeBase(baseDir, base);
const list = makeList(added);

console.log('\n(1) 元にいまの行から作った一覧を当てると、いまのファイルとバイト単位で一致');
check(addedIds.length === 7, '足した行の数が 7（検査が空振りでない）', '実際 ' + addedIds.length);
check(list.rows.every((r) => r.insertAfterId), '一覧のすべての行に insertAfterId がある');
check(new Set(list.rows.map((r) => r.insertAfterId)).size === 3, '直前の既存の行は3か所（同じ直前に続けて入れる行がある）', [...new Set(list.rows.map((r) => r.insertAfterId))].length + 'か所');
check(base.melopText !== cur.melop && base.effText !== cur.eff, '元はいまのファイルと違う');
const r1 = run(list, baseDir);
check(r1.code === 0, '道具が終了コード 0', r1.stderr);
check(r1.code === 0 && r1.read(MELOP) === cur.melop, MELOP + ' がバイト単位で一致');
check(r1.code === 0 && r1.read(EFF) === cur.eff, EFF + ' がバイト単位で一致');
check(r1.report && r1.report.lastRow === curMelop.rows[curMelop.rows.length - 1].row && r1.report.firstRow === curMelop.rows[0].row, '報告の行番号の範囲がいまのファイルと同じ');
check(r1.report && r1.report.review.length === 0, '印の無い一覧では要確認の行が0');

console.log('\n(2) 2回回して同じ結果・二重の取り込みは止まる');
const r2 = run(list, baseDir);
check(r2.code === 0 && r1.read(MELOP) === r2.read(MELOP) && r1.read(EFF) === r2.read(EFF), '同じ入力で2回とも同じバイト列');
const r3 = run(list, r1.outDir, []);
check(r3.code === 1, '取り込んだ結果にもう一度当てると止まる（終了コード 1）', 'code ' + r3.code);
check(/二重の取り込み/.test(r3.stderr), '止まった理由が二重の取り込み');
check(r1.read(MELOP) === cur.melop, '止まったとき、読んだフォルダのファイルは変わらない');
// --version は2ファイルの dataVersion だけを変える
const r4 = run(list, baseDir, ['--version', '2099-01-01a']);
check(r4.code === 0 && JSON.parse(r4.read(MELOP)).dataVersion === '2099-01-01a' && JSON.parse(r4.read(EFF)).dataVersion === '2099-01-01a', '--version で2ファイルの dataVersion が変わる');
check(r4.code === 0 && r4.read(MELOP).replace(/"dataVersion": "[^"]+"/, '') === cur.melop.replace(/"dataVersion": "[^"]+"/, ''), '--version で変わるのは dataVersion の行だけ');

console.log('\n(3) データ側の一覧（--list）');
if (!argList) console.log('  飛ばした（--list で melop-new-rows.json を渡すと当てる）');
else if (!fs.existsSync(argList)) { check(false, 'データ側の一覧がある', argList); }
else {
	const ext = JSON.parse(read(argList));
	const extIds = new Set(ext.rows.map((r) => r.id));
	const extBase = makeBase(extIds);
	const extDir = path.join(OUT, 'base-ext');
	writeBase(extDir, extBase);
	const rx = run(argList, extDir);
	check(rx.code === 0, 'データ側の一覧を道具が受け入れる', rx.stderr);
	check(sameFiles(rx), 'データ側の一覧を当てると、いまの2ファイルとバイト単位で一致');
	if (rx.code === 0 && !sameFiles(rx)) {
		const a = rx.read(MELOP).split(NL), b = cur.melop.split(NL);
		const d = a.map((l, i) => (l !== b[i] ? (i + 1) + '行目: ' + l + ' ／ いま: ' + b[i] : null)).filter(Boolean).slice(0, 5);
		console.log('        違い（' + MELOP + '）: ' + d.join('\n        '));
	}
}

console.log('\n(4) exception・sheetValue の印の行は取り込み、報告に出す');
{
	const flagged = JSON.parse(JSON.stringify(list));
	flagged.rows[0].needsReview = ['exception'];
	flagged.rows[flagged.rows.length - 1].needsReview = ['sheetValue', 'noOrder'];
	const r = run(flagged, baseDir);
	check(sameFiles(r), '印があっても取り込み、いまのファイルと一致（印はファイルに書かない）');
	const rv = r.report ? r.report.review : [];
	check(rv.length === 2, '報告の要確認の行が2', JSON.stringify(rv));
	check(rv.some((x) => x.id === flagged.rows[0].id && x.needsReview.join() === 'exception'), 'exception の行が報告に出る');
	check(rv.some((x) => x.id === flagged.rows[flagged.rows.length - 1].id && x.needsReview.join() === 'sheetValue,noOrder'), 'sheetValue の行が報告に出る');
	check(/要確認の行（2行/.test(r.stdout), '標準出力にも要確認の一覧が出る');
	// シートの値の効率（評価点÷消費sp の丸めと違う）の行は、報告の effDiff に出る
	//（いまのファイルにもシートの値の行があるので、計算どおりの行を1つ選んでずらし、その行が増えることを見る）
	const sv = JSON.parse(JSON.stringify(list));
	const calc = (x) => Math.round(x.score * 1000 / x.sp) / 1000;
	const k = sv.rows.findIndex((x) => calc(x) === x.efficiency);
	sv.rows[k].efficiency = Math.round((sv.rows[k].efficiency + 0.002) * 1000) / 1000;
	sv.rows[k].needsReview = ['sheetValue'];
	const rs = run(sv, baseDir);
	const before = r1.report.effDiff.map((x) => x.id);
	check(k >= 0 && !before.includes(sv.rows[k].id), '計算どおりの効率の行がある（検査が空振りでない）');
	check(rs.code === 0 && rs.report.effDiff.length === before.length + 1 && rs.report.effDiff.some((x) => x.id === sv.rows[k].id && x.efficiency === sv.rows[k].efficiency), '計算と違う効率の行が報告の effDiff に出る');
}

console.log('\n(5) 止まる場合（終了コード 1・何も書かない）');
const variants = [];
const mut = (label, f) => { const l = JSON.parse(JSON.stringify(list)); f(l); variants.push([label, l]); };
['score', 'sp', 'efficiency', 'group'].forEach((k) => mut(k + ' が null の行', (l) => { l.rows[1][k] = null; l.rows[1].needsReview = ['effectUnknown']; }));
mut('insertAfterId が null の行', (l) => { l.rows[2].insertAfterId = null; l.rows[2].needsReview = ['noOrder']; });
mut('insertAfterId の行がツール側に無い', (l) => { l.rows[0].insertAfterId = 'not-in-tool-file'; });
mut('insertAfterId が一覧の中の新しい行', (l) => { l.rows[1].insertAfterId = l.rows[0].id; });
mut('取り込む id がすでにある', (l) => { l.rows[0].id = curMelop.rows.find((r) => r.id && !added.has(r.id)).id; });
mut('一覧の中で id が重なる', (l) => { l.rows[1].id = l.rows[0].id; });
mut('行に足りないキー', (l) => { delete l.rows[0].needsReview; });
mut('行に知らないキー', (l) => { l.rows[0].row = 1; });
mut('先頭に足りないキー', (l) => { delete l.note; });
mut('先頭に知らないキー', (l) => { l.entries = []; });
mut('category が違う', (l) => { l.category = 'melopSheetRows'; });
mut('知らない要確認の印', (l) => { l.rows[0].needsReview = ['unknownFlag']; });
mut('efficiency が小数第4位', (l) => { l.rows[0].efficiency = 3.5481; });
variants.forEach(([label, l]) => {
	const r = run(l, baseDir);
	check(r.code === 1 && r.files.length === 0 && !r.report, label + ' → 止まる・何も書かない', 'code ' + r.code + '・書いたファイル ' + r.files.join(',') + '・' + r.stderr.split('\n')[0]);
});
{
	// null の行が1つあれば、ほかの行も取り込まない。止まったときは該当の行を出す
	const l = JSON.parse(JSON.stringify(list));
	l.rows[3].score = null; l.rows[3].efficiency = null;
	const r = run(l, baseDir);
	check(r.code === 1 && r.stderr.includes(l.rows[3].id) && r.stderr.includes('score・efficiency が null'), 'null の行の id と null のキーが報告に出る', r.stderr);
}
{
	// 書式が違う（行番号が飛んでいる）ファイルには書かない
	const badDir = path.join(OUT, 'base-gap');
	writeBase(badDir, { melopText: base.melopText.replace(/(\t\t\{"row":)(\d+)(,"group")/, (s, a, n, b) => a + (Number(n) + 1) + b), effText: base.effText });
	const r = run(list, badDir);
	check(r.code === 1 && r.files.length === 0, '行番号が連続していないファイルでは止まる');
	const fmtDir = path.join(OUT, 'base-format');
	writeBase(fmtDir, { melopText: base.melopText.replace('\t"rows": [', '\t"rows" : ['), effText: base.effText });
	const rf = run(list, fmtDir);
	check(rf.code === 1 && rf.files.length === 0 && /書式/.test(rf.stderr), '書式が道具の書き出しと違うファイルでは止まる');
}

console.log('\n合計: OK ' + ok + '・NG ' + ng);
console.log(ng ? '総合: NG' : '総合: OK');
process.exit(ng ? 1 : 0);
