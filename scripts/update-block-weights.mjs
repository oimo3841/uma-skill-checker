// シャードの割り振りの重み（tests/visual/block-weights.json）を、全体の実行の計器のログから作り直す（2026-10-30・検査の速度 打ち手①）。
//
//   node scripts/update-block-weights.mjs                    … いちばん新しい全体（3シャードそろい・塊の数が今の8割以上）から
//   node scripts/update-block-weights.mjs --stamp=YYYYMMDD-HHMMSS   … その回の記録から
//   node scripts/update-block-weights.mjs --times=<フォルダ> … 計器のログを探す場所を足す
//   node scripts/update-block-weights.mjs --check            … 書かずに、今のファイルとの差（塊の数・重みの合計）だけを出す
//
// 探す場所: このワークツリーの output/scratch/、メインの作業フォルダの output/scratch/、.claude/worktrees/*/output/scratch/
// （output/ は追跡外なので、新しいワークツリーには計器のログが無い。だから重みは tests/ のファイルに置く）。
// 例外で止まった塊（exception）の時間は途中までなので使わない（その塊は重みのファイルに入れず、割り振りでは平均で仮置きになる）。
// 重みは塊の見出しで引く（番号は塊を足すとずれるため。no は目安として残す）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_REL = 'tests/visual/block-weights.json';
const ARGV = process.argv.slice(2);
const arg = (name) => { const a = ARGV.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
const STAMP = arg('stamp');
const TIMES_DIR = arg('times');
const CHECK = ARGV.includes('--check');

function dirs() {
	const out = [];
	if (TIMES_DIR) out.push(path.resolve(TIMES_DIR));
	out.push(path.join(REPO_ROOT, 'output', 'scratch'));
	try {
		const common = path.resolve(REPO_ROOT, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim());
		const main = path.dirname(common);
		out.push(path.join(main, 'output', 'scratch'));
		try { for (const d of fs.readdirSync(path.join(main, '.claude', 'worktrees'))) out.push(path.join(main, '.claude', 'worktrees', d, 'output', 'scratch')); } catch (e) { /* なくてよい */ }
	} catch (e) { /* なくてよい */ }
	return [...new Set(out)];
}

function readJsonl(f) {
	return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}

const cands = [];
for (const d of dirs()) {
	let names = [];
	try { names = fs.readdirSync(d); } catch (e) { continue; }
	const stamps = new Map();
	for (const n of names) {
		const m = /^block-times-(\d{8}-\d{6})-s(\d)of(\d)\.jsonl$/.exec(n);
		if (!m) continue;
		const key = m[1] + '/' + m[3];
		if (!stamps.has(key)) stamps.set(key, { stamp: m[1], n: Number(m[3]), files: [], dir: d });
		stamps.get(key).files.push(path.join(d, n));
	}
	for (const c of stamps.values()) if (c.files.length === c.n) cands.push(c);
}
cands.sort((a, b) => b.stamp.localeCompare(a.stamp));

// 今の塊の数（--list-json）。全体の記録かどうかの目安（8割以上）に使う
let nowCount = 0;
try {
	const out = execFileSync(process.execPath, [path.join(REPO_ROOT, 'tests', 'visual', 'run-smoke.mjs'), '--list-json'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
	const line = out.split('\n').find((l) => l.startsWith('BLOCK_LIST '));
	if (line) nowCount = JSON.parse(line.slice('BLOCK_LIST '.length)).length;
} catch (e) { /* 数えられなければ目安なし */ }

let best = null;
for (const c of cands) {
	if (STAMP && c.stamp !== STAMP) continue;
	const recs = c.files.flatMap(readJsonl);
	if (!STAMP && nowCount > 0 && recs.length < nowCount * 0.8) continue;
	best = { ...c, recs };
	break;
}
if (!best) {
	console.error('使える全体の計器のログ（block-times-*-sKofN.jsonl がシャード分そろったもの' + (STAMP ? '・' + STAMP : '') + '）が見つからない');
	process.exit(1);
}

const recs = best.recs.slice().sort((a, b) => a.no - b.no);
const used = recs.filter((r) => !r.exception && typeof r.sec === 'number');
const skipped = recs.length - used.length;
const doc = {
	_note: 'シャードの割り振りの重み（塊ごとの時間・秒）。tests/visual/lib/shard-plan.mjs が見出しで引き、重い塊から軽いシャードへ入れて均す。無い塊は平均で仮置き、このファイルが無い・読めないときは番号の剰余。作り直しは node scripts/update-block-weights.mjs（いちばん新しい全体の計器のログから）。',
	source: 'block-times-' + best.stamp + '（N=' + best.n + '）',
	blocks: used.map((r) => ({ no: r.no, title: r.title, sec: r.sec })),
};
const sum = used.reduce((s, r) => s + r.sec, 0);
console.log('元: ' + doc.source + '（' + path.relative(REPO_ROOT, best.dir).split(path.sep).join('/') + '）・' + used.length + '塊（例外で止まった ' + skipped + '塊は入れない）・合計 ' + Math.round(sum) + '秒・平均 ' + (sum / used.length).toFixed(1) + '秒' + (nowCount ? '・今の塊 ' + nowCount + '個' : ''));

const outPath = path.join(REPO_ROOT, OUT_REL);
let prev = null;
try { prev = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (e) { /* 初めて */ }
if (prev) console.log('今のファイル: ' + prev.source + '・' + (prev.blocks || []).length + '塊');
if (CHECK) process.exit(0);
// 1塊1行（差分を読みやすくする）
const body = '{\n'
	+ '\t"_note": ' + JSON.stringify(doc._note) + ',\n'
	+ '\t"source": ' + JSON.stringify(doc.source) + ',\n'
	+ '\t"blocks": [\n' + doc.blocks.map((b) => '\t\t' + JSON.stringify(b)).join(',\n') + '\n\t]\n}\n';
fs.writeFileSync(outPath, body);
console.log('書いた: ' + OUT_REL);
