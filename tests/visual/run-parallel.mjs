// test:visual を N 本（既定 3）の子プロセスに分けて同時に回し、結果を1本にまとめる起動用スクリプト。
//
//   npm run test:visual:parallel                 … 全体（N=3）
//   npm run test:visual:parallel -- --shards=4   … N=4
//   npm run test:visual:parallel -- --only=段11  … 残りの引数は各シャードへそのまま渡す（--only があるときは「全体」と名乗らない）
//
// ■ 動き
//   ・排他ロックを取る（lib/lock.mjs）。取れなければ何もせず非ゼロで終わる。**ロックは親（このプロセス）が持ち**、
//     子（run-smoke.mjs --shard=k/N）は環境変数 UMA_TEST_LOCK_PARENT を見て取らない。親が死んだら子も自分で終わる。
//   ・子は run-smoke.mjs --shard=k/N（k = 1..N）。塊は通し番号で割り振られる（(番号−1) mod N = k−1）。
//   ・各シャードの出力は output/scratch/parallel-<日時>-s<k>of<N>.log に全文を残す。画面には、60秒ごとの進み具合と、
//     最後に [NG] の行（シャード名つき）・シャードごとの結果・塊の時間のまとめを出す。
//   ・1つでも NG か異常終了（終了コードが0でも SHARD_SUMMARY が無い・シグナルで終了・塊の数が食い違う）があれば非ゼロで終わる。
//   ・**全体と名乗るのは、--only が無く、全シャードが完走し、回した塊の合計が塊の総数に等しいときだけ。**
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './lib/serve.mjs';
import { acquireOrExit } from './lib/lock.mjs';
import { timeStamp, timesFilePath, readRecords, formatSummary } from './lib/block-times.mjs';

const SMOKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-smoke.mjs');
const argv = process.argv.slice(2);
let N = 3;
const pass = [];
for (const a of argv) {
	const m = /^--shards=(\d+)$/.exec(a);
	if (m) N = Number(m[1]);
	else pass.push(a);
}
if (!(N >= 1 && N <= 8)) { console.error('--shards は 1〜8 で指定してください'); process.exit(2); }
if (pass.some((a) => a === '--list' || a.startsWith('--shard=') || a.startsWith('--times-stamp='))) {
	console.error('--list／--shard／--times-stamp は並列の起動側には渡せません（run-smoke.mjs を直接使ってください）');
	process.exit(2);
}
const hasOnly = pass.some((a) => a.startsWith('--only='));

acquireOrExit('npm run test:visual:parallel ' + argv.join(' ') + '（N=' + N + '・cwd: ' + process.cwd() + '）');

const stamp = timeStamp();
const startedAt = Date.now();
fs.mkdirSync(path.join(REPO_ROOT, 'output', 'scratch'), { recursive: true });
console.log('並列スモークテスト: N=' + N + (hasOnly ? '（' + pass.filter((a) => a.startsWith('--only=')).join(' ') + '）' : '（全塊）') + '・開始 ' + stamp);

const shards = [];
for (let k = 1; k <= N; k++) {
	const logPath = path.join(REPO_ROOT, 'output', 'scratch', 'parallel-' + stamp + '-s' + k + 'of' + N + '.log');
	const sh = { k, logPath, log: fs.createWriteStream(logPath), buf: '', ng: [], done: 0, summary: null, finalLine: '', code: null, signal: null, exited: false };
	sh.child = spawn(process.execPath, [SMOKE, '--shard=' + k + '/' + N, '--times-stamp=' + stamp, ...pass], {
		cwd: REPO_ROOT,
		env: { ...process.env, UMA_TEST_LOCK_PARENT: String(process.pid) },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const onData = (chunk) => {
		sh.log.write(chunk);
		sh.buf += chunk.toString('utf8');
		let i;
		while ((i = sh.buf.indexOf('\n')) !== -1) {
			const line = sh.buf.slice(0, i).replace(/\r$/, '');
			sh.buf = sh.buf.slice(i + 1);
			if (line.startsWith('[NG]')) sh.ng.push(line);
			else if (line.startsWith('[T] ')) sh.done++;
			else if (line.startsWith('SHARD_SUMMARY ')) { try { sh.summary = JSON.parse(line.slice('SHARD_SUMMARY '.length)); } catch (e) { /* 壊れた行は無視 */ } }
			else if (line.startsWith('=== スモークテスト')) sh.finalLine = line;
		}
	};
	sh.child.stdout.on('data', onData);
	sh.child.stderr.on('data', onData);
	sh.exitedP = new Promise((resolve) => {
		sh.child.on('exit', (code, signal) => { sh.code = code; sh.signal = signal; sh.exited = true; sh.log.end(); resolve(); });
		sh.child.on('error', (e) => { sh.code = -1; sh.exited = true; sh.finalLine = '起動できませんでした: ' + e.message; resolve(); });
	});
	shards.push(sh);
}

const killAll = () => shards.forEach((s) => { if (!s.exited) { try { s.child.kill(); } catch (e) { /* もう終わっている */ } } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killAll(); process.exit(130); });
process.on('exit', killAll);

const beat = setInterval(() => {
	const sec = Math.round((Date.now() - startedAt) / 1000);
	console.log('[進行 ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + '] ' + shards.map((s) => 's' + s.k + ': ' + s.done + '塊' + (s.exited ? '（終了）' : '') + '・NG' + s.ng.length).join('  '));
}, 60000);

await Promise.all(shards.map((s) => s.exitedP));
clearInterval(beat);
const wallSec = (Date.now() - startedAt) / 1000;

// ---- まとめ ----
console.log('\n=== 各シャードの結果 ===');
const problems = [];
shards.forEach((s) => {
	const sm = s.summary;
	const abnormal = s.signal !== null || s.code === null || (s.code !== 0 && s.code !== 1) || !sm;
	if (abnormal) problems.push('s' + s.k + ' が異常終了（終了コード ' + s.code + (s.signal ? '・シグナル ' + s.signal : '') + (sm ? '' : '・SHARD_SUMMARY なし') + '）。ログ: ' + path.relative(REPO_ROOT, s.logPath));
	console.log('s' + s.k + '/' + N + ': ' + (sm ? sm.ran + '塊・OK ' + sm.ok + '・NG ' + sm.fails + '・' + sm.wallSec + '秒' : '（結果なし）') + '・終了コード ' + s.code + (s.signal ? '・' + s.signal : '') + '  ' + s.finalLine);
});
const allNg = [];
shards.forEach((s) => s.ng.forEach((l) => allNg.push('[s' + s.k + '] ' + l)));
if (allNg.length > 0) { console.log('\n=== [NG] の行（' + allNg.length + '件） ==='); allNg.forEach((l) => console.log(l)); }

const sums = shards.map((s) => s.summary).filter(Boolean);
const totalBlocks = sums.length > 0 ? sums[0].blockCount : 0;
const sameCount = sums.every((x) => x.blockCount === totalBlocks);
const ranTotal = sums.reduce((a, x) => a + x.ran, 0);
const okTotal = sums.reduce((a, x) => a + x.ok, 0);
const failsTotal = sums.reduce((a, x) => a + x.fails, 0);
if (!sameCount) problems.push('シャードごとの塊の総数が食い違う: ' + sums.map((x) => x.blockCount).join(' / '));
if (sums.length === N && sameCount && !hasOnly && ranTotal !== totalBlocks) problems.push('回した塊の合計 ' + ranTotal + ' が総数 ' + totalBlocks + ' と合わない（塊が飛ばされたか、重複して回った）');
if (hasOnly && sums.length === N && ranTotal === 0) problems.push('--only に当たる塊が1つも無い');

const files = shards.map((s) => timesFilePath(REPO_ROOT, stamp, { k: s.k, n: N }));
const records = readRecords(files);
console.log('');
formatSummary(records, { wallSec, label: '並列 N=' + N + ' の合計' }).forEach((l) => console.log(l));
console.log('記録: ' + files.map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/')).join(' , '));

const complete = !hasOnly && problems.length === 0 && sums.length === N;
const ok = problems.length === 0 && failsTotal === 0 && allNg.length === 0;
problems.forEach((p) => console.log('[異常] ' + p));
const secText = Math.floor(wallSec / 60) + '分' + String(Math.round(wallSec % 60)).padStart(2, '0') + '秒（' + wallSec.toFixed(1) + '秒）';
const scope = complete ? '全体・N=' + N : (hasOnly ? totalBlocks + '塊中' + ranTotal + '塊のみ・N=' + N : '未完了・N=' + N);
console.log('\n=== 並列スモークテスト（' + scope + '・実時間 ' + secText + '）: ' + (ok ? '全項目OK（OK ' + okTotal + '件）' : (failsTotal + '件 NG' + (problems.length > 0 ? '・異常 ' + problems.length + '件' : ''))) + ' ===');
process.exit(ok ? 0 : 1);
