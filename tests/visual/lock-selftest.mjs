// 排他ロック（lib/lock.mjs）の自己検査。ブラウザは使わない。本物のロック（os.tmpdir()/uma-test-visual.lock）は触らず、
// 一時ファイルのパスを UMA_TEST_LOCK_PATH で渡して確かめる。
//
//   node tests/visual/lock-selftest.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCK = path.join(os.tmpdir(), 'uma-lock-selftest-' + process.pid + '.lock');
process.env.UMA_TEST_LOCK_PATH = LOCK;
const { acquireLock, isAlive } = await import('./lib/lock.mjs');

let fails = 0;
const check = (cond, label, extra) => { if (!cond) fails++; console.log((cond ? '[OK] ' : '[NG] ') + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
const cleanup = () => { try { fs.unlinkSync(LOCK); } catch (e) { /* 無い */ } };
cleanup();

// 子プロセス: 同じロックのパスで取ろうとして、結果を1行で返す
const child = (mode) => {
	const code = "process.env.UMA_TEST_LOCK_PATH=" + JSON.stringify(LOCK) + ";"
		+ "const m=await import(" + JSON.stringify(new URL('./lib/lock.mjs', import.meta.url).href) + ");"
		+ "const r=m.acquireLock('child');console.log(JSON.stringify({ok:r.ok,holder:r.holder?r.holder.pid:null}));"
		+ (mode === 'hold-then-exit-hard' ? "process.kill(process.pid,'SIGKILL');" : "");
	return spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
};

const a = acquireLock('selftest');
check(a.ok === true && fs.existsSync(LOCK), '1本目はロックを取れる');
const held = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
check(held.pid === process.pid && typeof held.startedAt === 'string' && held.command === 'selftest', 'ロックの中身は PID・開始時刻・コマンド', held);

const r2 = JSON.parse(child('try').stdout.trim());
check(r2.ok === false && r2.holder === process.pid, '2本目（別プロセス）は拒否され、持ち主の PID が分かる', r2);

a.release();
check(!fs.existsSync(LOCK), '解除するとファイルが消える');

// 強制終了のあと: 取ったまま SIGKILL で死ぬプロセスを作り、ロックが残っていても次が引き継げること
const dead = spawnSync(process.execPath, ['--input-type=module', '-e',
	"process.env.UMA_TEST_LOCK_PATH=" + JSON.stringify(LOCK) + ";const m=await import(" + JSON.stringify(new URL('./lib/lock.mjs', import.meta.url).href) + ");"
	+ "const r=m.acquireLock('victim');console.log(process.pid);process.kill(process.pid,'SIGKILL');"], { encoding: 'utf8' });
const deadPid = Number(String(dead.stdout).trim());
check(fs.existsSync(LOCK) && JSON.parse(fs.readFileSync(LOCK, 'utf8')).pid === deadPid, '強制終了（SIGKILL）したプロセスのロックは残る', { deadPid });
check(!isAlive(deadPid), 'その PID は死んでいる');
const b = acquireLock('after-kill');
check(b.ok === true && JSON.parse(fs.readFileSync(LOCK, 'utf8')).pid === process.pid, '死んだ PID のロックは引き継げる');
b.release();

// 壊れた中身: 作ったばかり（5秒未満）なら拒否、古ければ引き継ぐ
fs.writeFileSync(LOCK, '');
const c1 = acquireLock('fresh-empty');
check(c1.ok === false, '作ったばかりで中身が空のロックは拒否する（書き込み中かもしれない）');
const old = new Date(Date.now() - 60000);
fs.utimesSync(LOCK, old, old);
const c2 = acquireLock('old-empty');
check(c2.ok === true, '古くて中身が空のロックは引き継げる');
c2.release();

// 並列の子（UMA_TEST_LOCK_PARENT）は取らない
const code = "process.env.UMA_TEST_LOCK_PARENT='1';const m=await import(" + JSON.stringify(new URL('./lib/lock.mjs', import.meta.url).href) + ");const r=m.acquireLock('x',m.LOCK_PATH);console.log(JSON.stringify({ok:r.ok,inherited:!!r.inherited}));";
const parentHeld = acquireLock('parent');
const r3 = JSON.parse(spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, UMA_TEST_LOCK_PATH: LOCK } }).stdout.trim());
check(r3.ok === true && r3.inherited === true, '親が持っているとき、子（UMA_TEST_LOCK_PARENT）はロックを取らずに進める', r3);
parentHeld.release();
cleanup();

console.log('\n=== ロックの自己検査: ' + (fails === 0 ? '全項目OK' : fails + '件 NG') + ' ===');
process.exit(fails === 0 ? 0 : 1);
