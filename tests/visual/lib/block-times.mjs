// 塊ごとの時間の記録（計器）。test:visual の1行1塊の JSON（block-times-<日時>[-sKofN].jsonl）を書く・読む・まとめる。
//
//   1行の形: { no, title, sec, ok, ng, waitN, waitMs, openN, openMs, reloadN, gotoN, shard }
//     no       … 通し番号（run-smoke.mjs の block() が数える。--only／--shard の番号と同じ）
//     sec      … その塊の実時間（秒）
//     ok / ng  … その塊の間に数えた assert の OK／NG の件数（例外で止まった塊は ng に入らず、exception が true）
//     waitN/Ms … page.waitForTimeout の回数と、頼んだ待ちの合計ms（実際の待ちではなく指定値の合計）
//     openN/Ms … openPage（lib/fixtures.mjs）の回数と、その合計実時間ms
//     reloadN / gotoN … page.reload と page.goto の回数（goto は openPage の中のものも含む）
//     reloadMs … page.reload の合計実時間ms（reloadReady のあとの待ちも含む。2026-10-30 から。それより前の記録には無い）
//   計測だけで、挙動（待ち時間）は変えない。
import fs from 'node:fs';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');
/** 現地時間の YYYYMMDD-HHMMSS */
export function timeStamp(d = new Date()) {
	return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

export function timesFilePath(repoRoot, stamp, shard) {
	const suffix = shard ? '-s' + shard.k + 'of' + shard.n : '';
	return path.join(repoRoot, 'output', 'scratch', 'block-times-' + stamp + suffix + '.jsonl');
}

export function readRecords(files) {
	const out = [];
	for (const f of files) {
		let text = '';
		try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
		for (const line of text.split('\n')) {
			if (!line.trim()) continue;
			try { out.push(JSON.parse(line)); } catch (e) { /* 書きかけの最後の行 */ }
		}
	}
	return out;
}

const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const mmss = (sec) => Math.floor(sec / 60) + '分' + pad(Math.round(sec % 60)) + '秒';

/**
 * まとめの表示行を作る。records は読み込んだ行、wallSec はこの実行の実時間（秒）。
 * 並列のときは、塊の時間の合計（sum）が実時間（wall）より大きくなる。
 */
export function formatSummary(records, { wallSec, label = '' } = {}) {
	const lines = [];
	const sum = (k) => records.reduce((s, r) => s + (r[k] || 0), 0);
	const totalSec = sum('sec');
	lines.push('=== 塊の時間のまとめ' + (label ? '（' + label + '）' : '') + ' ===');
	lines.push('塊 ' + records.length + '個・実時間 ' + (wallSec != null ? mmss(wallSec) + '（' + f1(wallSec) + '秒）' : '—')
		+ '・塊の時間の合計 ' + mmss(totalSec) + '（' + f1(totalSec) + '秒）・OK ' + sum('ok') + '件');
	const waitSec = sum('waitMs') / 1000, openSec = sum('openMs') / 1000;
	const share = (x) => (totalSec > 0 ? f1((x / totalSec) * 100) + '%' : '—');
	lines.push('固定の待ち（waitForTimeout の指定値の合計）: ' + sum('waitN') + '回・' + f1(waitSec) + '秒（塊の時間の合計の ' + share(waitSec) + '）');
	const avgMs = (ms, n) => (n > 0 ? Math.round(ms / n) + 'ms' : '—');
	lines.push('ページの読み込み（openPage）: ' + sum('openN') + '回・' + f1(openSec) + '秒（' + share(openSec) + '・平均 ' + avgMs(sum('openMs'), sum('openN')) + '）／ reload ' + sum('reloadN') + '回'
		+ (records.some((r) => r.reloadMs != null) ? '・' + f1(sum('reloadMs') / 1000) + '秒（平均 ' + avgMs(sum('reloadMs'), sum('reloadN')) + '）' : '') + '・goto ' + sum('gotoN') + '回');
	const top = records.slice().sort((a, b) => b.sec - a.sec).slice(0, 20);
	const topSec = top.reduce((s, r) => s + r.sec, 0);
	lines.push('時間のかかる塊 上位' + top.length + '（合計 ' + f1(topSec) + '秒＝塊の時間の合計の ' + share(topSec) + '）:');
	top.forEach((r, i) => {
		lines.push('  ' + String(i + 1).padStart(2) + '. ' + f1(r.sec).padStart(6) + '秒 ' + share(r.sec).padStart(6) + '  #' + r.no + ' ' + r.title
			+ '  (OK' + r.ok + '・待ち' + r.waitN + '回/' + f1((r.waitMs || 0) / 1000) + '秒・読込' + r.openN + '回/' + f1((r.openMs || 0) / 1000) + '秒)');
	});
	return lines;
}
