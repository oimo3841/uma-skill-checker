// T216（B4）: 変えたファイルと、変えたクラス・id から、測る組（tests/measure/jobs-base.json の組）を選ぶ。
//   node tests/measure/select-jobs.mjs [--from=<rev>] [--to=<rev>] [--map=<地図>] [--out=<ファイル>] [--all]
//   既定: HEAD と作業ツリーの差。--from だけなら from と作業ツリー、--from と --to なら 2つの版の差。
// 選び方:
//   1. 製品のファイル（*.html・css/・js/）の差から、名前（クラス .x・id #x・ハイフンつきの語）を拾う。
//   2. 部品の地図（parts-map.json）で、その名前が画面に見える組を選ぶ（入れ物のクラスの中の id も、地図の contains から足す）。
//   3. 変えたファイルが special.html だけなら UmaStar の組だけ、exam.html だけなら UmaExam の組だけ。共通のファイルなら全ページ。
//   4. 各ページの代表の組（地図の reps）は、ページが当たるかぎり毎回入れる。
//   5. css/tokens.css の変更（色・大きさの値）は全部の組。名前がまったく拾えない差（コメントだけなど）は代表の組だけ。
//   push の前に1回だけ全部の組を測る（--all）。取りこぼしは compare.mjs の --check で確かめる。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const opt = (k) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };

/** git の差（製品のファイルだけ）から、変えたファイルと名前を拾う。 */
export function changedNames(from, to) {
	const args = ['diff', '-U0', '--no-color'];
	if (from) args.push(from); else args.push('HEAD');
	if (to) args.push(to);
	args.push('--', '*.html', 'css', 'js');
	const diff = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
	const files = new Set(); const names = new Set();
	let cur = null;
	for (const line of diff.split('\n')) {
		const m = /^\+\+\+ b\/(.+)$/.exec(line);
		if (m) { cur = m[1]; files.add(cur); continue; }
		if (/^--- /.test(line) || !/^[+-]/.test(line)) continue;
		const body = line.slice(1);
		for (const x of body.matchAll(/[.#]([A-Za-z_][\w-]*)/g)) names.add(x[0]);   // CSS のセレクタ・JS の '.x'
		for (const x of body.matchAll(/class\s*=\s*["']([^"']+)["']/g)) x[1].split(/\s+/).forEach((c) => c && names.add('.' + c));
		for (const x of body.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) names.add('#' + x[1]);
		for (const x of body.matchAll(/['"`]([A-Za-z][\w]*-[\w-]+)['"`]/g)) { names.add('.' + x[1]); names.add('#' + x[1]); }   // JS の中の id・クラスの名前
		for (const x of body.matchAll(/classList\.(?:add|remove|toggle|contains)\(([^)]*)\)/g)) for (const c of x[1].matchAll(/['"]([\w-]+)['"]/g)) names.add('.' + c[1]);
	}
	return { files: Array.from(files), names: Array.from(names) };
}

/** 選ぶ。map は parts-map.json の中身。 */
export function selectJobs(map, ch, opts = {}) {
	const jobNames = Object.keys(map.jobs);
	if (opts.all) return { jobs: jobNames, why: '全部の組（--all）', hit: [] };
	const files = ch.files;
	if (!files.length) return { jobs: [], why: '製品のファイルの差が無い（測らない）', hit: [] };
	const urls = new Set();
	for (const f of files) {
		if (f === 'special.html') urls.add('/special.html');
		else if (f === 'exam.html') urls.add('/exam.html');
		else if (f === 'card-event-input.html') urls.add('/card-event-input.html');
		else if (f === 'uma-skill-deck.html') urls.add('/uma-skill-deck.html');
		else if (/^deck-alpha/.test(f) || f === 'index.html') { /* 測りの組に無いページ */ }
		else { urls.add('*'); }   // css/・js/ は共通
	}
	const pageOk = (j) => urls.has('*') || urls.has(map.jobs[j].url);
	if (files.includes('css/tokens.css')) return { jobs: jobNames.filter((j) => map.jobs[j].url !== null), why: 'css/tokens.css（値のトークン）の差は全部の組', hit: [] };
	const idx = new Map(map.names.map((n, i) => [n, i]));
	const hit = ch.names.filter((n) => idx.has(n));
	const hitIdx = new Set(hit.map((n) => idx.get(n)));
	// 入れ物のクラス → 中の id（地図の contains）。地図に無い入れ物の中身は、組の部品に入れ物が見えているかで足りる
	const picked = new Set();
	for (const j of jobNames) {
		if (!pageOk(j)) continue;
		const p = map.jobs[j].p;
		if (p.some((i) => hitIdx.has(i))) picked.add(j);
	}
	for (const j of map.reps) if (map.jobs[j] && pageOk(j)) picked.add(j);
	return { jobs: jobNames.filter((j) => picked.has(j)), why: 'ファイル ' + files.join('・') + '／当たった名前 ' + hit.length + '個', hit };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const mapFile = opt('map') || path.join(HERE, 'parts-map.json');
	const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
	const ch = changedNames(opt('from'), opt('to'));
	const r = selectJobs(map, ch, { all: argv.includes('--all') });
	const total = Object.keys(map.jobs).length;
	console.log('変えたファイル:', ch.files.join(', ') || '（なし）');
	console.log('選んだ組:', r.jobs.length + ' / ' + total + '（' + r.why + '）');
	if (r.hit.length) console.log('当たった名前:', r.hit.slice(0, 30).join(' ') + (r.hit.length > 30 ? ' …' : ''));
	if (opt('out')) { fs.writeFileSync(opt('out'), r.jobs.join('\n') + '\n'); console.log('→', opt('out')); }
	else console.log(r.jobs.join(','));
}
