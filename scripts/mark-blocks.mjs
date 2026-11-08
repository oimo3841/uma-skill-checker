// 塊の印の一覧（tests/visual/block-marks.json）を作る・確かめる道具（T127・2026-11-09・決定 477）。
//
//   node scripts/mark-blocks.mjs            … 今の塊から自動の印を作り直して一覧を書く（人の手直し overrides はそのまま残す）
//   node scripts/mark-blocks.mjs --dry      … 書かずに、印の分布と人の目が要る塊だけを出す
//   node scripts/mark-blocks.mjs --check    … 書かずに、「一覧に無い塊」「一覧にだけある鍵」を出す（どちらかがあれば終了コード 1）
//   node scripts/mark-blocks.mjs --review   … 人の目が要る塊（印が決まらない・名前で分けられない assert が3割を超える）の一覧
//
// ■ 一覧の形
//   blocks:    自動の印。{ file, title（実行時の見出し）, ord（同じファイル・同じ見出しの中の順番）, marks, asserts, review? }
//   overrides: 人の手直し。{ file, title, ord, marks, why }。自動の印より先に効き、作り直しても残る
//   marks は V 見た目・A 動き・T 文章・S 保存データ・C 計算・データ の組（例 'VAT'）か、'*'（すべてに当たる）
// 一覧に無い塊（新しい塊・見出しを変えた塊）と印の無い塊は「すべてに当たる」扱い（test:select --purpose で絞らない）。
// 印の付け方は scripts/block-marks-lib.mjs。塊の中身・見出しは変えない（印は別ファイル）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './select-blocks.mjs';
import { MARKS_FILE, MARK_LETTERS, marksOfText, withOrd, loadMarks, keyOf } from './block-marks-lib.mjs';
import { loadWeights, weightLookup } from '../tests/visual/lib/shard-plan.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGV = process.argv.slice(2);
const REVIEW_SHARE = 0.3;   // 名前で分けられない assert がこれを超える塊は、人の目が要る

/** 今の塊（実行時の番号）と、それぞれの自動の印 */
export function currentBlocks() {
	const idx = buildIndex();
	const rows = withOrd(idx.blocks, (b) => (b.runtimeTitle != null ? b.runtimeTitle : b.title));
	const cache = new Map();   // 同じ行の範囲（繰り返しの写し）は同じ中身
	for (const r of rows) {
		const b = r.b;
		const ck = b.file + ':' + b.start;
		if (!cache.has(ck)) cache.set(ck, marksOfText(idx.files[b.file].lines.slice(b.start - 1, b.end).join('\n')));
		const m = cache.get(ck);
		r.no = b.no;
		r.auto = m;
		const why = [];
		if (m.marks === '*') why.push(m.asserts === 0 ? 'assert が無い' : '印が決まらない（健全性と分けられない assert だけ）');
		else if (m.unknownShare > REVIEW_SHARE) why.push('名前で分けられない assert が ' + Math.round(m.unknownShare * 100) + '%');
		r.review = why.join('・');
	}
	return { rows, numbering: idx.blocks.length && idx.blocks[0].runtimeTitle != null ? 'runtime' : 'static' };
}

/** 1行1項目の JSON（差分が読みやすいように） */
function serialize(doc) {
	const line = (o) => '  ' + JSON.stringify(o);
	const out = ['{'];
	for (const k of ['about', 'legend', 'generated', 'numbering', 'count']) out.push('"' + k + '": ' + JSON.stringify(doc[k]) + ',');
	out.push('"overrides": [');
	out.push(doc.overrides.map(line).join(',\n'));
	out.push('],');
	out.push('"blocks": [');
	out.push(doc.blocks.map(line).join(',\n'));
	out.push(']');
	out.push('}');
	return out.join('\n').replace(/\[\n\n\]/g, '[]') + '\n';
}

function main() {
	const { rows, numbering } = currentBlocks();
	const prev = loadMarks(REPO_ROOT);
	const overrides = (prev && prev.overrides) || [];
	const keys = new Set(rows.map((r) => r.key));

	if (ARGV.includes('--check')) {
		if (!prev) { console.log('[NG] ' + MARKS_FILE + ' が無い・読めない（node scripts/mark-blocks.mjs で作る）'); process.exit(1); }
		const listed = new Map((prev.blocks || []).map((e) => [keyOf(e.file, e.title, e.ord), e]));
		const missing = rows.filter((r) => !listed.has(r.key));
		const orphan = [...listed.values()].filter((e) => !keys.has(keyOf(e.file, e.title, e.ord)));
		const orphanOv = overrides.filter((o) => !keys.has(keyOf(o.file, o.title, o.ord)));
		const stale = rows.filter((r) => listed.has(r.key) && listed.get(r.key).marks !== r.auto.marks);
		console.log('=== 塊の印の一覧の確かめ（' + MARKS_FILE + '） ===');
		console.log('塊 ' + rows.length + '（番号は' + (numbering === 'runtime' ? '実行時の一覧' : '静的に数えたもの') + '）・一覧の自動の印 ' + listed.size + '・人の手直し ' + overrides.length);
		for (const r of missing) console.log('[NG] 一覧に無い塊（すべてに当たる扱い）: #' + r.no + ' ' + r.title.slice(0, 70) + '（' + path.basename(r.file) + (r.ord > 1 ? '・' + r.ord + '番目' : '') + '）');
		for (const e of orphan) console.log('[NG] 一覧にだけある鍵: ' + e.title.slice(0, 70) + '（' + path.basename(e.file) + (e.ord > 1 ? '・' + e.ord + '番目' : '') + '）');
		for (const o of orphanOv) console.log('[NG] 人の手直しにだけある鍵: ' + o.title.slice(0, 70) + '（' + path.basename(o.file) + '）');
		if (stale.length) console.log('[注意] 自動の印が今の塊の中身と違う ' + stale.length + '塊（作り直すと変わる。例 ' + stale.slice(0, 3).map((r) => '#' + r.no + ' ' + listed.get(r.key).marks + '→' + r.auto.marks).join('・') + '）');
		const bad = missing.length + orphan.length + orphanOv.length;
		console.log(bad === 0 ? '総合: OK（すべての塊が一覧に当たる）' : '総合: NG ' + bad + '件（node scripts/mark-blocks.mjs で作り直す。人の手直しの鍵は手で直す）');
		process.exit(bad === 0 ? 0 : 1);
	}

	// ---- 分布
	const dist = new Map();
	const nCount = new Map();
	for (const r of rows) {
		dist.set(r.auto.marks, (dist.get(r.auto.marks) || 0) + 1);
		const n = r.auto.marks === '*' ? 0 : r.auto.marks.length;
		nCount.set(n, (nCount.get(n) || 0) + 1);
	}
	const per = Object.fromEntries(MARK_LETTERS.map((k) => [k, rows.filter((r) => r.auto.marks === '*' || r.auto.marks.includes(k)).length]));
	const review = rows.filter((r) => r.review);
	const weights = loadWeights(REPO_ROOT);
	const look = weightLookup(weights);
	const secOf = (r) => { const w = look(r.title, false); return typeof w === 'number' ? w : null; };

	if (ARGV.includes('--review')) {
		console.log('人の目が要る塊 ' + review.length + '（自動の印のまま。手直しは overrides に書く）:');
		for (const r of review) console.log('#' + r.no + '\t' + r.auto.marks + '\t' + r.review + '\t' + r.title.slice(0, 80) + '\t' + path.basename(r.file));
		return;
	}
	console.log('=== 塊の印（' + MARKS_FILE + '） ===');
	console.log('塊 ' + rows.length + '（番号は' + (numbering === 'runtime' ? '実行時の一覧' : '静的に数えたもの') + '）・人の手直し ' + overrides.length);
	console.log('印の数ごとの塊: ' + [...nCount].sort((a, b) => a[0] - b[0]).map(([n, c]) => (n === 0 ? '*（すべて）' : n + 'つ') + ' ' + c).join('・'));
	console.log('印ごとの当たる塊（* を含む）: ' + MARK_LETTERS.map((k) => k + ' ' + per[k]).join('・'));
	console.log('多い組み合わせ: ' + [...dist].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => k + ' ' + c).join('・'));
	console.log('人の目が要る塊: ' + review.length + '（--review で一覧）');
	void secOf;
	if (ARGV.includes('--dry')) return;

	const doc = {
		about: '塊の印の一覧（T127・決定 477）。scripts/mark-blocks.mjs が自動で作る。人の手直しは overrides に書く（作り直しても残る）。鍵はファイル＋見出し（実行時）＋同じ見出しの中の順番。一覧に無い塊・印が * の塊は「すべてに当たる」。test:select --purpose が使う。',
		legend: { V: '見た目', A: '動き', T: '文章', S: '保存データ', C: '計算・データ', '*': 'すべてに当たる' },
		generated: new Date().toISOString().slice(0, 10),
		numbering,
		count: rows.length,
		overrides,
		blocks: rows.map((r) => {
			const e = { file: r.file, title: r.title, ord: r.ord, marks: r.auto.marks, asserts: r.auto.asserts };
			if (r.review) e.review = r.review;
			return e;
		}),
	};
	fs.writeFileSync(path.join(REPO_ROOT, MARKS_FILE), serialize(doc));
	console.log('書いた: ' + MARKS_FILE);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try { main(); } catch (e) { console.error('mark-blocks: ' + (e && e.stack ? e.stack : e)); process.exit(2); }
}
