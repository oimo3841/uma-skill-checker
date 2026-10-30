// シャードの割り振り（並列の test:visual で、どの塊をどのシャードが回すか）。2026-10-30（検査の速度 打ち手①）。
//
// ■ 割り振り方
//   ・重みのファイル（tests/visual/block-weights.json。塊ごとの時間〔秒〕）が読めるときは、**時間で均す**:
//     重い塊から順に、いちばん軽いシャードへ入れる（LPT。同じ重さは番号の小さい順、同じ軽さはシャード番号の小さい順）。
//     重みの無い塊（新しく足した塊・見出しを変えた塊）は、重みのファイルの平均値で仮置きする。
//   ・重みのファイルが無い・読めない・中身が壊れているときは、**今までの剰余**（(番号−1) mod N = k−1）に戻る。
//   ・--only があるときは、当たる塊だけで均す（当たらない塊はどのシャードにも入れない）。
//   ・塊はシャードの中で番号の順に回る（割り振りが変わるだけで、回る順は変わらない）。塊は互いに独立（run-smoke.mjs の注記）。
// ■ 重みのファイルを作り直すとき: node scripts/update-block-weights.mjs（いちばん新しい全体の計器のログ block-times-*-sKof3.jsonl から）。
//   ファイルは tests/ に置く（output/ は追跡外で、新しいワークツリーには計器のログが無いため）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const WEIGHTS_REL = 'tests/visual/block-weights.json';

/**
 * 重みのファイルを読む。読めない・形が違うときは null（呼ぶ側は剰余に戻る）。
 * @returns {{ source: string, mean: number, byTitle: Map<string, number[]>, count: number } | null}
 */
export function loadWeights(repoRoot, rel = WEIGHTS_REL) {
	let j;
	try { j = JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8')); } catch (e) { return null; }
	if (!j || !Array.isArray(j.blocks) || j.blocks.length === 0) return null;
	const byTitle = new Map();
	let sum = 0, count = 0;
	for (const b of j.blocks) {
		if (!b || typeof b.title !== 'string' || !(typeof b.sec === 'number' && b.sec >= 0)) return null;
		if (!byTitle.has(b.title)) byTitle.set(b.title, []);
		byTitle.get(b.title).push(b.sec);
		sum += b.sec;
		count++;
	}
	return { source: String(j.source || ''), mean: sum / count, byTitle, count };
}

/**
 * 塊の重みを引く関数を返す。同じ見出しが複数あるときは、出てきた順に1つずつ当てる。
 * dynamic（見出しの先頭だけが分かる塊。scripts/select-blocks.mjs の静的な索引）は前方一致でも当てる。
 * 当たらなければ null（planShards が平均で仮置きする）。
 */
export function weightLookup(weights) {
	const used = new Map();
	return (title, dynamic = false) => {
		if (!weights) return null;
		let key = weights.byTitle.has(title) ? title : null;
		if (key == null && dynamic && title.length >= 6) {
			for (const t of weights.byTitle.keys()) if (t.startsWith(title)) { key = t; break; }
		}
		if (key == null) return null;
		const list = weights.byTitle.get(key);
		const i = used.get(key) || 0;
		used.set(key, i + 1);
		return list[Math.min(i, list.length - 1)];
	};
}

/** --only の1つの指定が塊に当たるか（数字だけの指定は番号にだけ当てる。run-smoke.mjs の block() と同じ規則） */
export function onlyMatches(only, no, title) {
	return only.length === 0 || only.some((t) => t === String(no) || (!/^\d+$/.test(t) && title.includes(t)));
}

/**
 * 割り振りを決める。
 * @param {{ no: number, w: number|null }[]} items  回す塊（w は重み〔秒〕。null は平均で仮置き）
 * @param {number} n  シャードの数
 * @param {{ mean: number } | null} weights  null なら剰余
 * @returns {{ mode: 'time'|'modulo', shardOf: Map<number, number>, loads: number[], unknown: number }}
 *   shardOf は 番号 → シャード（1..n）。loads は各シャードの重みの合計（剰余のときも、重みが分かれば足す）。
 */
export function planShards(items, n, weights) {
	const shardOf = new Map();
	const loads = new Array(n).fill(0);
	let unknown = 0;
	const wOf = (it) => {
		if (typeof it.w === 'number') return it.w;
		unknown++;
		return weights ? weights.mean : 0;
	};
	if (!weights) {
		for (const it of items) { const k = ((it.no - 1) % n) + 1; shardOf.set(it.no, k); loads[k - 1] += wOf(it); }
		return { mode: 'modulo', shardOf, loads, unknown };
	}
	const ws = items.map((it) => ({ no: it.no, w: wOf(it) }));
	ws.sort((a, b) => (b.w - a.w) || (a.no - b.no));
	for (const it of ws) {
		let best = 0;
		for (let k = 1; k < n; k++) if (loads[k] < loads[best] - 1e-9) best = k;
		loads[best] += it.w;
		shardOf.set(it.no, best + 1);
	}
	return { mode: 'time', shardOf, loads, unknown };
}

/**
 * run-smoke.mjs --list-json で、実行時の塊の一覧（番号・見出し）を取る。取れなければ null。
 * （塊は登録した順にその場で回るので、割り振りの前に全体の一覧を別の処理で取る。--list は検査を走らせず、ロックも取らない）
 */
export function listBlocks(smokePath, cwd) {
	try {
		const out = execFileSync(process.execPath, [smokePath, '--list-json'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
		const line = out.split('\n').find((l) => l.startsWith('BLOCK_LIST '));
		if (!line) return null;
		const list = JSON.parse(line.slice('BLOCK_LIST '.length));
		return Array.isArray(list) && list.length > 0 ? list : null;
	} catch (e) {
		return null;
	}
}

/**
 * 一覧・--only・重みから割り振りを作る（並列の起動側と、--shard 単独の実行で同じものを使う）。
 * @returns {{ mode, n, source, assign: Record<string, number>, titles: Record<string, string>, loads: number[], unknown: number, ran: number }}
 */
export function buildPlan(list, n, only, weights) {
	const look = weightLookup(weights);
	const items = [];
	const titles = {};
	for (const b of list) {
		// 重みの「出てきた順」をそろえるため、--only で外れる塊も引いておく
		const w = look(b.title);
		if (!onlyMatches(only, b.no, b.title)) continue;
		items.push({ no: b.no, w });
		titles[b.no] = b.title;
	}
	const p = planShards(items, n, weights);
	const assign = {};
	for (const [no, k] of p.shardOf) assign[no] = k;
	return { mode: p.mode, n, source: weights ? weights.source : null, assign, titles, loads: p.loads.map((x) => Math.round(x * 10) / 10), unknown: p.unknown, ran: items.length };
}
