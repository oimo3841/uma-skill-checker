// select-blocks.mjs のバックテスト（2026-10-29）: 全体の test:visual の1回目の NG について、その作業の commit 範囲を道具に入れ、
// NG の塊を選べていたかを数える。選び方（select-blocks.mjs・block-sets.json）を変えたら回し直して、取りこぼしの数を見比べる。
//
//   node scripts/select-blocks-backtest.mjs                         … 既定（既存の tests/ の変更は見ない＝あとから直した期待値を当てにしない）
//   node scripts/select-blocks-backtest.mjs --with-tests             … 既存の tests/ の変更も入れる（参考。直した期待値の行で当たるので甘い）
//   node scripts/select-blocks-backtest.mjs --budget=15              … 残りの引数は select-blocks.mjs へそのまま渡す
//   node scripts/select-blocks-backtest.mjs --json=<path>            … 回ごとの結果を JSON で書く
//
// 事例は tests/visual/select-blocks-backtest.json（NG の塊の見出しは、実行したときのもの）。見出しの照合は、完全一致 → 先頭16文字の
// 前方一致 → （あとで見出しが変わった塊）base で同じ見出しの塊の「ファイルの中の順番」で head の塊を当てる、の順。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(REPO_ROOT, 'scripts', 'select-blocks.mjs');
const CASES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests', 'visual', 'select-blocks-backtest.json'), 'utf8')).cases;
const argv = process.argv.slice(2);
const jsonOut = (argv.find((a) => a.startsWith('--json=')) || '').slice('--json='.length) || null;
const withTests = argv.includes('--with-tests');
const pass = argv.filter((a) => !a.startsWith('--json=') && a !== '--with-tests');
if (!withTests) pass.push('--drop-modified-tests');

const runTool = (args) => execFileSync(process.execPath, [TOOL, ...args], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
function listOf(ref) {
	const rows = runTool(['--list', '--head=' + ref]).split('\n').filter(Boolean).map((l) => {
		const [no, t, loc] = l.split('\t');
		return { no: Number(no), title: t.replace(/…$/, ''), dyn: t.endsWith('…'), file: loc.replace(/:.*$/, '') };
	});
	const ord = new Map();
	rows.forEach((x) => { const n = (ord.get(x.file) || 0) + 1; ord.set(x.file, n); x.ord = n; });
	return rows;
}
function findIn(list, t) {
	const b = list.find((x) => (x.dyn ? t.startsWith(x.title) : x.title === t));
	if (b) return b;
	const p = t.slice(0, 16);
	const c = list.filter((x) => x.title.startsWith(p));
	return c.length === 1 ? c[0] : null;
}

const results = [];
let tn = 0, tc = 0;
for (const c of CASES) {
	const r = JSON.parse(runTool(['--base=' + c.base, '--head=' + c.head, '--quiet', '--json=-', ...pass]));
	const headList = listOf(c.head);
	let baseList = null;
	const find = (t, no) => {
		const b = findIn(headList, t);
		if (b) return b;
		if (!baseList) baseList = listOf(c.base);
		const ob = findIn(baseList, t) || baseList.find((x) => x.no === no && x.title.slice(0, 6) === t.slice(0, 6));
		return ob ? headList.find((x) => x.file === ob.file && x.ord === ob.ord) || null : null;
	};
	const chosen = new Map(r.selected.map((s) => [s.no, s]));
	const ng = c.ng.map((b) => { const m = find(b.title, b.no); return { title: b.title, matched: m ? m.no : null, selected: !!(m && chosen.has(m.no)), reasons: m && chosen.has(m.no) ? chosen.get(m.no).reasons : [] }; });
	const caught = ng.filter((x) => x.selected).length;
	tn += ng.length; tc += caught;
	const e = r.estimate || {};
	results.push({ id: c.id, base: c.base, head: c.head, stage: r.stage, full: r.full.length > 0, selected: r.selected.length, blockCount: r.blockCount, parallelSec: e.parallelSec, estimateSource: e.source, ng: ng.length, caught, missed: ng.filter((x) => !x.selected) });
	console.log(c.id + ': 段' + r.stage + (r.full.length ? '・全体' : '') + '・選んだ ' + r.selected.length + '/' + r.blockCount + '塊・見込み 並列 ' + (e.parallelSec != null ? (e.parallelSec / 60).toFixed(1) + '分' : '—') + '・NG ' + ng.length + ' のうち選べた ' + caught);
	for (const m of ng.filter((x) => !x.selected)) console.log('    取りこぼし: ' + m.title.slice(0, 70) + (m.matched ? '（#' + m.matched + '）' : '（見出しの照合なし）'));
}
console.log('合計: NG の塊 ' + tn + ' のうち選べた ' + tc + '・取りこぼし ' + (tn - tc) + (withTests ? '（既存の tests/ の変更も入れた・参考）' : ''));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
