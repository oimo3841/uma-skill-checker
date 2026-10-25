// test:visual / test:visual:parallel の排他ロック。
//
// 同時に走らせてよい test:visual は1本だけ（並列の1回分＝N本の子プロセスを1本と数える）。
// 二重に起動すると負荷で検査が揺れる（F-69）ので、起動時にロックを取り、取れなければ何もせず非ゼロで終わる。
//
//   ・ロックのファイルは os.tmpdir() の下の uma-test-visual.lock（ワークツリーごとに分かれないよう、リポジトリの外の絶対パス）。
//   ・中身は JSON: { pid, startedAt, command }。
//   ・PID が生きていれば、後から起動したほうは拒否される。PID が死んでいれば（強制終了のあと）引き継ぐ。
//   ・終了時（正常・例外・Ctrl-C・SIGTERM）に必ず解除する。解除するのは、中身の PID が自分のときだけ。
//   ・並列の親が起動した子（環境変数 UMA_TEST_LOCK_PARENT が付く）は、親が持っているのでロックを取らない。
//
// 既知の限界: (1) PID の使い回し（死んだ検査の PID を別のプロセスが偶然使っていると「生きている」と見える）。
// (2) 死んだロックの引き継ぎ中に別の起動が重なる狭い窓。どちらも手でロックのファイルを消せば解消する。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// UMA_TEST_LOCK_PATH は自己検査（lock-selftest.mjs）が本物のロックを触らないための上書き。通常は使わない
export const LOCK_PATH = process.env.UMA_TEST_LOCK_PATH || path.join(os.tmpdir(), 'uma-test-visual.lock');

export function isAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try { process.kill(pid, 0); return true; } catch (e) { return !!e && e.code === 'EPERM'; }
}

function readHolder(p) {
	try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

/** 他の検査が実行中の表示（日本語1行）。 */
export function describeHolder(h) {
	if (!h) return '（ロックの中身を読めません）';
	return 'PID ' + h.pid + '・開始 ' + h.startedAt + '・コマンド ' + h.command;
}

/**
 * ロックを取る。取れたら { ok: true, release() }、取れなければ { ok: false, holder }。
 * 親（並列の起動側）が持っているときは { ok: true, inherited: true } を返し、何もしない。
 */
export function acquireLock(command, lockPath = LOCK_PATH) {
	if (process.env.UMA_TEST_LOCK_PARENT && lockPath === LOCK_PATH) return { ok: true, inherited: true, release() {} };
	const info = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), command });
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const fd = fs.openSync(lockPath, 'wx');
			fs.writeSync(fd, info);
			fs.closeSync(fd);
			return { ok: true, inherited: false, release: installRelease(lockPath) };
		} catch (e) {
			if (e.code !== 'EEXIST') throw e;
			let cur = readHolder(lockPath);
			if (!cur) {
				// 作った直後で中身がまだ書かれていないことがある。少し待って読み直し、それでも読めず古いときだけ死んだ扱いにする
				const until = Date.now() + 150;
				while (Date.now() < until) { /* 短い待ち（同期） */ }
				cur = readHolder(lockPath);
				if (!cur) {
					let age = Infinity;
					try { age = Date.now() - fs.statSync(lockPath).mtimeMs; } catch (e2) { continue; }
					if (age < 5000) return { ok: false, holder: null };
				}
			}
			if (cur && cur.pid !== process.pid && isAlive(cur.pid)) return { ok: false, holder: cur };
			try { fs.unlinkSync(lockPath); } catch (e3) { /* 先に消された */ }
		}
	}
	return { ok: false, holder: readHolder(lockPath) };
}

function installRelease(lockPath) {
	let done = false;
	const release = () => {
		if (done) return;
		done = true;
		try {
			const cur = readHolder(lockPath);
			if (cur && cur.pid === process.pid) fs.unlinkSync(lockPath);
		} catch (e) { /* 解除できなくても、次の起動が PID の死活で引き継ぐ */ }
	};
	process.on('exit', release);
	for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
		try { process.on(sig, () => { release(); process.exit(130); }); } catch (e) { /* その OS に無いシグナル */ }
	}
	return release;
}

/**
 * ロックを取れなかったときの表示を出して終了する。取れたら release を返す。
 * list など、検査を走らせない起動では呼ばない。
 */
export function acquireOrExit(command) {
	const r = acquireLock(command);
	if (r.ok) return r.release;
	console.error('別の検査が実行中です。何もせず終了します。');
	console.error('  ' + describeHolder(r.holder));
	console.error('  （ロック: ' + LOCK_PATH + '。実行中でないのに残っているときは、そのファイルを消してください）');
	process.exit(2);
}
