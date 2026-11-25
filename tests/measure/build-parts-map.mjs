// T216（B4）: 測りの結果（--parts つき）から「部品の地図」tests/measure/parts-map.json を作る。
//   node tests/measure/build-parts-map.mjs <測りの結果.json>... [--out=tests/measure/parts-map.json]
// 地図: どの組（ページ・状態）の画面に、どのクラス（.x）・id（#x）が見えているか。クラス → その中の id（入れ物のクラスを変えたとき、中の部品の id を測る塊も選ぶため）。
// 複数の結果（ライト・ダーク）を渡すと、同じ名前の組の部品を合わせる。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith('--'));
const outArg = argv.find((a) => a.startsWith('--out='));
const OUT = outArg ? outArg.slice(6) : path.join(HERE, 'parts-map.json');
if (!files.length) { console.log('使い方: node tests/measure/build-parts-map.mjs <測りの結果.json>... [--out=…]'); process.exit(2); }

const jobsBase = JSON.parse(fs.readFileSync(path.join(HERE, 'jobs-base.json'), 'utf8')).jobs;
const urlOf = Object.fromEntries(jobsBase.map((j) => [j.name, j.url]));
urlOf['P-cei-top'] = urlOf['P-cei-open'] = urlOf['P-cei-chara'] = urlOf['P-cei-out'] = '/card-event-input.html';
urlOf['P-olddeck'] = '/uma-skill-deck.html';

const names = []; const idx = new Map();
const nid = (n) => { if (!idx.has(n)) { idx.set(n, names.length); names.push(n); } return idx.get(n); };
const jobs = {}; const contains = {};
for (const f of files) {
	const r = JSON.parse(fs.readFileSync(f, 'utf8'));
	for (const [job, v] of Object.entries(r)) {
		if (!v.parts) continue;
		const set = (jobs[job] = jobs[job] || { url: urlOf[job] || (/-rec-/.test(job) ? (/exam/.test(job) ? '/exam.html' : '/special.html') : null), s: new Set() });
		v.parts.classes.forEach((c) => set.s.add(nid('.' + c)));
		v.parts.ids.forEach((i) => set.s.add(nid('#' + i)));
		for (const [c, ids] of Object.entries(v.parts.contains || {})) { const t = (contains[nid('.' + c)] = contains[nid('.' + c)] || new Set()); ids.forEach((i) => t.add(nid('#' + i))); }
	}
}
const out = {
	about: 'T216: 測りの組ごとの「部品の地図」。names の番号で、組（jobs）に見えているクラス（.x）・id（#x）と、クラス → その中の id（contains）を持つ。tests/measure/select-jobs.mjs と scripts/select-blocks.mjs が読む。作り直しは build-parts-map.mjs（全部の組を --parts つきで測った結果から）。',
	generated: new Date().toISOString().slice(0, 10),
	reps: ['P-star-1', 'P-star-2', 'P-star-3', 'P-exam-1', 'P-exam-2', 'P-cei-top', 'P-olddeck'],
	names,
	jobs: Object.fromEntries(Object.entries(jobs).map(([k, v]) => [k, { url: v.url, p: Array.from(v.s).sort((a, b) => a - b) }])),
	contains: Object.fromEntries(Object.entries(contains).map(([k, v]) => [k, Array.from(v).sort((a, b) => a - b)]))
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('部品の地図:', Object.keys(out.jobs).length + '組・名前 ' + names.length + '・入れ物 ' + Object.keys(out.contains).length, '→', path.relative(ROOT, path.resolve(OUT)).replace(/\\/g, '/'), Math.round(fs.statSync(OUT).size / 1024) + 'KB');
