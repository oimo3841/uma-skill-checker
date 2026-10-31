// 変更（git diff）から、test:visual で回す塊を選ぶ道具（恒久ルール22 の段1・段2 の「関係する塊」を出す。2026-10-29）。
//
//   npm run test:select                          … origin/main との分岐点 〜 作業ツリー（未 commit・追跡外を含む）の差から選ぶ
//   npm run test:select -- --base=<ref>          … 比べる元を変える（既定は origin/main。分岐点 merge-base を取る）
//   npm run test:select -- --base=A --head=B     … commit の範囲 A..B の差から選ぶ（作業ツリーは見ない。バックテスト用）
//   npm run test:select -- --json=<path>         … 結果を JSON でも書く（--json=- なら JSON だけを標準出力へ）
//   npm run test:select -- --no-core             … 「核」の塊を足さない（内訳を見るとき）
//   npm run test:select -- --list                … 静的に数えた塊の一覧（番号・見出し・ファイルと行）だけを出す
//   npm run test:select -- --check-sets          … tests/visual/block-sets.json の項目がそれぞれ1塊に当たるかだけを見る
//   npm run test:select -- --budget=15           … 見込み（並列 N=3）が15分に収まるよう、(2) だけで選んだ塊を当たりの弱い順に外す
//                                                  （段1・段2 の push の前は既定の出力が標準。見込みが15分を超えるときだけ使ってよい。恒久ルール22・2026-10-30）
//   npm run test:select -- --times=<フォルダ>     … 時間の見込みに使う計器のログ（block-times-*-sKof3.jsonl）を探す場所を足す
//   npm run test:select -- --drop-modified-tests … 既存の tests/ の変更を見ない（バックテスト用。あとから直した期待値を当てにしない）
//   npm run test:select -- --cap=20            … 1つの識別子が当たる塊がこれより多ければ「広すぎ」として使わない（既定 20。文言は --jp-cap=10）
//
// ■ 選び方（理由はすべて出す）
//   (1) 変えた tests/visual の塊: diff の行が入っている塊（塊の範囲＝その block( の行から次の block( の前まで）。
//       blocks-*.mjs の最初の塊より前（ファイル共通の準備）を変えたら、そのファイルの塊すべて。
//   (2) 識別子: 製品のファイル（tests/ 以外）の変えた行から、関数名（変えた行を囲む関数も）・ハイフンを含む語（CSS クラス・id・
//       data-usd-el の値・保存のキー）・camelCase の語（保存の項目名など）・大文字の定数・data のファイル名を取り出し（JS・DOM の標準の名前・版の ?v= の行・製品のファイル名は使わない）、
//       tests/visual の塊の本文で語として探す。逆に、塊の本文の文字列にある日本語（5文字以上の連なり）が、変えた行に含まれていれば当てる（文言の変更）。
//       tests/ の変えた行で宣言した関数・定数の名前も、ほかの塊での使用を探す。
//       当たる塊が --cap より多い語は「広すぎ」として使わない（一覧に出す。広い変更は段3 の全体と夜間の全体で拾う）。
//   (3) 「核」の塊（tests/visual/block-sets.json の core）。段2 以上（.html・.js・.css を変えた）のときだけ足す。
//   (4) data/ を変えたら「データに敏感な塊」（block-sets.json の dataSensitive）。
//   (5) 検査の土台（tests/visual/lib/・run-smoke.mjs の塊の外・run-parallel.mjs・package-lock.json）を変えたら「全体」と出す。
//   (6) 「寸法に敏感な塊」（block-sets.json の dimensionSensitive。列見出し・帯・入口の行の高さ・寸法・見た目を固定値で測る）。
//       段2 以上で、.css・画面の HTML（リポジトリ直下の *.html。版の付け替えとコメントだけなら除く）・帯や列見出しを作る関数（DIM_FUNCS）を変えたときだけ足す（2026-10-30）。
//   段3 と決まる変更（CSS トークンと共有の CSS・保存データの形と移行・凍結ファイル・検査の土台）と、段3 かもしれない変更
//   （core・2ページで共有の部品・保存の鍵）は、その旨を出す（中身で決めるのは人）。
//
// 塊の番号は、run-smoke.mjs と blocks-*.mjs の block( の並びから静的に数える（npm run test:visual -- --list と同じ番号。
// 実行して確かめるときは --list と見比べる）。番号は塊が増えるとずれるので、その時点の作業ツリー（または --head）の番号で出す。
// for (const x of [字面の配列]) の中の block( は要素の数だけ数える（T33・2026-10-31。字面でない繰り返しの中にあれば、標準エラーに注意を出す）。
// 消したファイル（git rm）は変えたファイルの一覧と段の見立てにだけ入れ、塊を探す対象から外す（T33）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadWeights, weightLookup, planShards } from '../tests/visual/lib/shard-plan.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VISUAL = 'tests/visual';
const SETS_FILE = VISUAL + '/block-sets.json';

// ---------------------------------------------------------------- 引数
const ARGV = process.argv.slice(2);
const arg = (name) => { const a = ARGV.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
const BASE_ARG = arg('base') || 'origin/main';
const HEAD = arg('head');            // null なら作業ツリー
const JSON_OUT = arg('json');
const CAP = Number(arg('cap') || 20);
const BUDGET = arg('budget') ? Number(arg('budget')) : null;   // 分。並列 N=3 の見込みがこれに収まるよう、当たりの弱い塊から外す
const JP_CAP = Number(arg('jp-cap') || 10);   // 文言（日本語）の当たりの上限
const NO_CORE = ARGV.includes('--no-core');
const QUIET = ARGV.includes('--quiet');
const TIMES_DIR = arg('times');      // 計器のログ（block-times-*-sKof3.jsonl）を探すフォルダを足す

// ---------------------------------------------------------------- git と読み込み
function git(args, opts = {}) {
	return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', opts.quietErr ? 'ignore' : 'pipe'] });
}
const readCache = new Map();
/** --head のとき、tests/visual の .mjs をまとめて1回の git cat-file で読んでおく（1本ずつ git show すると遅い） */
function prefetchHead() {
	if (!HEAD) return;
	const names = git(['ls-tree', '--name-only', HEAD, VISUAL + '/']).split('\n').map((s) => s.trim()).filter((s) => /\.(mjs|json)$/.test(s));
	const out = execFileSync('git', ['cat-file', '--batch'], { cwd: REPO_ROOT, input: names.map((n) => HEAD + ':' + n).join('\n') + '\n', maxBuffer: 256 * 1024 * 1024 });
	let pos = 0;
	for (const n of names) {
		const nl = out.indexOf(10, pos);
		const header = out.slice(pos, nl).toString('utf8');
		pos = nl + 1;
		const m = /^\S+ blob (\d+)$/.exec(header);
		if (!m) { readCache.set(n, null); continue; }
		const size = Number(m[1]);
		readCache.set(n, out.slice(pos, pos + size).toString('utf8').replace(/\r\n/g, '\n'));
		pos += size + 1;
	}
}
/** HEAD 指定ならその commit の中身、無ければ作業ツリーの中身（無ければ null）。行末の CR は外す。 */
function readText(rel) {
	if (readCache.has(rel)) return readCache.get(rel);
	let t = null;
	try {
		t = HEAD ? git(['show', HEAD + ':' + rel], { quietErr: true }) : fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
	} catch (e) { t = null; }
	if (t != null) t = t.replace(/\r\n/g, '\n');
	readCache.set(rel, t);
	return t;
}

// ---------------------------------------------------------------- 塊の索引（静的）
const BLOCK_RE = /^\s*await block\(\s*/;
const REGISTER_RE = /^\s*await (register\w+)\(/;
/** block( の直後の文字列の見出しを読む。連結や ${} があれば prefix（前方一致で照合）。 */
function parseTitle(line) {
	const m = BLOCK_RE.exec(line);
	let i = m[0].length;
	const q = line[i];
	if (q !== '\'' && q !== '"' && q !== '`') return { title: '', dynamic: true };
	let out = '';
	i++;
	for (; i < line.length; i++) {
		const c = line[i];
		if (c === '\\') { const n = line[i + 1]; out += n === 'n' ? '\n' : n; i++; continue; }
		if (q === '`' && c === '$' && line[i + 1] === '{') return { title: out, dynamic: true };
		if (c === q) break;
		out += c;
	}
	const rest = line.slice(i + 1).trimStart();
	return { title: out, dynamic: rest.startsWith('+') };
}

const LOOP_LITERAL_RE = /^\s*for\s*\(\s*(?:const|let|var)\s+[\w$]+\s+of\s+\[(.*)\]\s*\)\s*\{?\s*$/;
const LOOP_ANY_RE = /^\s*(?:for|while)\s*\(/;
/** 配列の字面 [a, b, ...] の中身（角かっこの内側）の要素の数。引用符・かっこの中のカンマは数えない */
function countLiteralItems(inner) {
	let n = 0, depth = 0, q = null, any = false;
	for (let i = 0; i < inner.length; i++) {
		const c = inner[i];
		if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
		if (c === '\'' || c === '"' || c === '`') { q = c; any = true; continue; }
		if ('([{'.includes(c)) { depth++; any = true; continue; }
		if (')]}'.includes(c)) { depth--; continue; }
		if (c === ',' && depth === 0) { if (any) n++; any = false; continue; }
		if (c.trim()) any = true;
	}
	return n + (any ? 1 : 0);
}
/** block( の行（0始まり i）を囲む for (const x of [字面]) の回数の積。字面でない繰り返しの中なら1と数えて知らせる */
function loopTimes(lines, i) {
	let times = 1;
	let ind = indentOf(lines[i]);
	for (let k = i - 1; k >= 0 && ind > 0; k--) {
		const l = lines[k];
		if (!l.trim() || isComment(l)) continue;
		const li = indentOf(l);
		if (li >= ind) continue;
		ind = li;
		const m = LOOP_LITERAL_RE.exec(l);
		if (m) times *= Math.max(1, countLiteralItems(m[1]));
		else if (LOOP_ANY_RE.test(l)) {
			console.error('select-blocks: 注意: ' + (i + 1) + '行目の block( は字面でない繰り返し（' + (k + 1) + '行目）の中にあり、1つと数えた。番号は --list（実行時）と見比べる');
		}
	}
	return times;
}

/**
 * 塊の索引を作る。戻り値:
 *   blocks: [{ no, title, dynamic, file, start, end }]（start・end は1始まりの行。end を含む）
 *   files: { file: { lines, blockIdx: [blocks の添字], preambleEnd } }
 *   harness: run-smoke.mjs の塊の外の行の範囲（[from, to] の配列）
 */
let prefetched = false;
function buildIndex() {
	if (!prefetched) { prefetched = true; prefetchHead(); }
	const smokeRel = VISUAL + '/run-smoke.mjs';
	const smoke = readText(smokeRel);
	if (smoke == null) throw new Error(smokeRel + ' が読めない');
	const importMap = new Map();
	for (const m of smoke.matchAll(/import\s*\{\s*(register\w+)\s*\}\s*from\s*'\.\/([\w.-]+\.mjs)'/g)) importMap.set(m[1], VISUAL + '/' + m[2]);
	const files = {};
	const blocks = [];
	const fileLines = (rel) => {
		if (!files[rel]) {
			const t = readText(rel);
			if (t == null) throw new Error(rel + ' が読めない');
			const lines = t.split('\n');
			// 区切り＝block( の行と register の行
			const bounds = [];
			lines.forEach((l, i) => { if (BLOCK_RE.test(l) || (rel === smokeRel && REGISTER_RE.test(l))) bounds.push(i + 1); });
			files[rel] = { lines, bounds, blockIdx: [], preambleEnd: bounds.length ? bounds[0] - 1 : lines.length };
		}
		return files[rel];
	};
	const addBlocksOf = (rel, onlyLine) => {
		const f = fileLines(rel);
		f.lines.forEach((l, i) => {
			if (!BLOCK_RE.test(l)) return;
			if (onlyLine != null && i + 1 !== onlyLine) return;
			const start = i + 1;
			const nextB = f.bounds.find((b) => b > start);
			const end = nextB ? nextB - 1 : f.lines.length;
			const t = parseTitle(l);
			// T33: for (const x of [...]) の中の block( は、実行すると配列の要素の数だけ塊になる（blocks-74 のピン画面(1) は light・dark の2つ）。
			// 静的に1つと数えると、その後ろの番号が実行時（--list）より1つ小さくずれていた
			const times = loopTimes(f.lines, i);
			for (let r = 0; r < times; r++) {
				blocks.push({ no: blocks.length + 1, title: t.title, dynamic: t.dynamic || times > 1, file: rel, start, end });
				f.blockIdx.push(blocks.length - 1);
			}
		});
	};
	const sf = fileLines(smokeRel);
	// run-smoke.mjs を上から読み、block( はその場で、register は呼んだ位置で、そのファイルの塊を並べる
	let lastRegister = 0;
	sf.lines.forEach((l, i) => {
		if (BLOCK_RE.test(l)) addBlocksOf(smokeRel, i + 1);
		const r = REGISTER_RE.exec(l);
		if (r && importMap.has(r[1])) { addBlocksOf(importMap.get(r[1])); lastRegister = i + 1; }
	});
	// run-smoke.mjs の最後の塊の終わりは、次の区切り（register の行）の前まで。最後の register の後ろは検査の土台。
	const smokeBlocks = sf.blockIdx.map((k) => blocks[k]);
	const harness = [[1, sf.preambleEnd]];
	const lastEnd = smokeBlocks.length ? Math.max(...smokeBlocks.map((b) => b.end)) : sf.preambleEnd;
	if (lastRegister > 0) harness.push([Math.max(lastEnd, lastRegister) + 1, sf.lines.length]);
	return { blocks, files, harness, smokeRel };
}

// ---------------------------------------------------------------- diff
/** [{ file, status, hunks: [{ oldStart, oldCount, newStart, newCount, minus: [], plus: [] }] }] */
function readDiff(base) {
	const args = ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', base];
	if (HEAD) args.push(HEAD);
	const text = git(args).replace(/\r/g, '');
	const files = [];
	let cur = null, hunk = null;
	for (const line of text.split('\n')) {
		if (line.startsWith('diff --git ')) {
			const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
			cur = { file: m ? m[2] : line, status: 'M', hunks: [] };
			files.push(cur);
			hunk = null;
			continue;
		}
		if (!cur) continue;
		if (line.startsWith('new file mode')) { cur.status = 'A'; continue; }
		if (line.startsWith('deleted file mode')) { cur.status = 'D'; continue; }
		if (line.startsWith('Binary files')) { cur.binary = true; continue; }
		const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
		if (h) {
			hunk = { oldStart: +h[1], oldCount: h[2] == null ? 1 : +h[2], newStart: +h[3], newCount: h[4] == null ? 1 : +h[4], minus: [], plus: [] };
			cur.hunks.push(hunk);
			continue;
		}
		if (!hunk) continue;
		if (line.startsWith('+') && !line.startsWith('+++')) hunk.plus.push(line.slice(1));
		else if (line.startsWith('-') && !line.startsWith('---')) hunk.minus.push(line.slice(1));
	}
	// 作業ツリーのときは追跡外のファイルも「足したファイル」として入れる
	if (!HEAD) {
		const others = git(['ls-files', '--others', '--exclude-standard']).split('\n').map((s) => s.trim()).filter(Boolean);
		for (const rel of others) {
			let t = '';
			try { t = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { continue; }
			const lines = t.split('\n');
			files.push({ file: rel, status: 'A', untracked: true, hunks: [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: lines.length, minus: [], plus: lines }] });
		}
	}
	// バックテスト用: 既存の tests/ のファイルの変更（あとから直した期待値を含みうる）を外し、足したファイルだけ残す
	if (ARGV.includes('--drop-modified-tests')) return files.filter((f) => !(f.file.startsWith('tests/') && f.status === 'M'));
	return files;
}

// ---------------------------------------------------------------- 語の取り出し
const isComment = (l) => /^\s*(\/\/|\*|\/\*|<!--)/.test(l);
/** 行末の // コメントを落とす（引用符の数が偶数のところの // だけ。だいたいでよい） */
function stripTrailingComment(l) {
	let q = null;
	for (let i = 0; i < l.length - 1; i++) {
		const c = l[i];
		if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
		if (c === '\'' || c === '"' || c === '`') { q = c; continue; }
		if (c === '/' && l[i + 1] === '/' && (i === 0 || l[i - 1] !== ':')) return l.slice(0, i);
	}
	return l;
}
const HYPHEN_RE = /[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g;
const CAMEL_RE = /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g;
const CONST_RE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g;
const DECL_RES = [
	/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/,
	/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
	/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/,
	/^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/,
];
const NOT_FN = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'with']);
function declName(line) {
	for (const re of DECL_RES) { const m = re.exec(line); if (m && !NOT_FN.has(m[1])) return m[1]; }
	return null;
}
const indentOf = (l) => /^\s*/.exec(l)[0].replace(/\t/g, '    ').length;
/** 変えた行を囲む関数の名前（近い順に2つまで）。lines は変更後のファイルの行。 */
function enclosingFunctions(lines, lineNo) {
	const out = [];
	if (!lines.length) return out;   // 中身の無いファイル（消したファイルなど）
	let i = Math.min(Math.max(lineNo - 1, 0), lines.length - 1);
	// 変えた行（空行なら次の空でない行）の字下げ
	let j = i;
	while (j < lines.length && !lines[j].trim()) j++;
	let ind = j < lines.length ? indentOf(lines[j]) : 0;
	for (let k = i; k >= 0 && k > i - 3000 && out.length < 2; k--) {
		const l = lines[k];
		if (!l.trim()) continue;
		const n = declName(l);
		const li = indentOf(l);
		if (n && li < ind) { out.push(n); ind = li; }
		if (li === 0 && k < i) break;
	}
	return out;
}
// 日本語（ひらがな・カタカナ・漢字・全角英数）の5文字以上の連なり
const JP_RUN_RE = /[぀-ヿ㐀-鿿０-９Ａ-Ｚａ-ｚ々ー]{5,}/g;
const LITERAL_RE = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
// どこにでも出る語（JS・DOM の標準の名前、読み上げの属性など）。当てに使わない
const STOP_WORDS = new Set(('appendChild innerHTML outerHTML textContent innerText isArray setAttribute getAttribute removeAttribute hasAttribute toggleAttribute '
	+ 'querySelector querySelectorAll getElementById getElementsByClassName addEventListener removeEventListener dispatchEvent preventDefault stopPropagation '
	+ 'createElement createTextNode classList className dataset forEach insertBefore insertAdjacentHTML replaceChildren replaceWith parentNode parentElement '
	+ 'firstChild lastChild firstElementChild nextSibling previousSibling nextElementSibling offsetWidth offsetHeight offsetTop offsetLeft clientWidth clientHeight '
	+ 'scrollWidth scrollHeight scrollTop scrollLeft scrollIntoView getBoundingClientRect getComputedStyle requestAnimationFrame setTimeout clearTimeout '
	+ 'setInterval clearInterval toFixed toLocaleString localeCompare fromEntries startsWith endsWith includes indexOf lastIndexOf findIndex flatMap filter '
	+ 'reduce concat splice slice replace replaceAll split substring toLowerCase toUpperCase padStart padEnd hasOwnProperty defineProperty stringify '
	+ 'aria-expanded aria-label aria-hidden aria-pressed aria-controls aria-selected aria-current aria-describedby aria-live aria-modal data-lucide '
	+ 'createIcons console length push apply call bind build probe value values entries closest contains matches remove toggle focus click target '
	+ 'currentTarget checked disabled hidden innerWidth innerHeight matchMedia').split(/\s+/));

// ---------------------------------------------------------------- 段の見立て
// 段3 と決まる変更（STAGE3_FILES）と、段3 かもしれない変更（STAGE3_MAYBE。中身で人が決める）
const STAGE3_MAYBE = [
	[/^js\/uma-skill-deck-core\.js$/, 'core（計算を変えたなら段3。表示用の定数・文言だけなら段2）'],
	[/^js\/(stitch|announce)\.js$/, '2ページ（special・exam）で共有の部品'],
];
const STAGE3_FILES = [
	[/^css\/(tokens|common|shell)\.css$/, 'CSS トークン・共有の CSS'],
	[/^js\/common\.js$/, '凍結ファイル（js/common.js）'],
	[/^index\.html$/, '凍結ファイル（index.html）'],
	[/^tests\/visual\/lib\//, '検査の土台（tests/visual/lib/）'],
	[/^tests\/visual\/run-(parallel|smoke)\.mjs$/, '検査の土台（run-smoke.mjs の塊の外・run-parallel.mjs）'],
	[/^package(-lock)?\.json$/, 'package.json（依存・npm の入口）'],
];
const STORAGE_RE = /schemaVersion|migrat/;                                  // 保存データの形と移行 → 段3
const STORAGE_MAYBE_RE = /localStorage|sessionStorage|STORAGE_KEY|indexedDB/; // 保存の鍵に触れている → 段3 かもしれない
const FULL_FILES = [/^tests\/visual\/lib\//, /^tests\/visual\/run-parallel\.mjs$/, /^package-lock\.json$/];
// (6) 寸法に敏感な塊を足すきっかけ（段2 以上のときだけ）: .css・画面の HTML（リポジトリ直下の *.html。版の付け替えとコメントだけなら除く）・帯や列見出しを作る関数
const DIM_FILES = [/\.css$/, /^[^/]+\.html$/];
const DIM_FUNCS = new Set([
	'renderSetBar', 'renderSetHead', 'fitSetHead', 'renderRosterLink',   // セットの帯・②の合計の行
	'renderPalette', 'fitEntryHead', 'entryPickHtml',                    // ②の入口の行
	'evoBandHtml', 'fitBand',                                            // ①の帯
	'colHead',                                                           // ①の表・②の星取表の列見出し
	'syncStickyTop',                                                     // special のタイトルの行と帯の上に残る高さ
]);
// core の中の CSS（CORE_STYLES の文字列）はきっかけにしない（指示の範囲は .css のファイル。入れてもバックテストの数は同じだった。2026-10-30）
// test:visual 以外の検査（変えた場所 → npm の名前）
const OTHER_CHECKS = [
	[/^data\//, 'npm run check:catalog'],
	[/^(data\/(skill-evolutions|skill-requires)|tests\/evolution\/)/, 'npm run test:evolution'],
	[/^(uma-skill-deck-skills\.json|data\/extended-skills)/, 'npm run test:master'],
	[/^(js\/stitch\.js|tests\/stitch\/)/, 'npm run test:stitch'],
	[/^tests\/layout\//, 'npm run test:sheets'],
	[/^(tests\/melop\/|data\/melop-)/, 'npm run test:melop-import'],
	[/^tests\/catalog\//, 'npm run check:catalog'],
	[/^tests\/ocr\//, 'npm run test:ocr'],
	[/^tests\/rules\//, 'npm run check:rules'],
	[/^tests\/privacy\//, 'npm run check:privacy'],
];

// ---------------------------------------------------------------- 本体
export function main() {
	let base = BASE_ARG;
	if (!HEAD) {
		try { base = git(['merge-base', BASE_ARG, 'HEAD']).trim(); } catch (e) { /* そのまま */ }
	}
	const baseShort = git(['rev-parse', '--short', base]).trim();
	const idx = buildIndex();
	const diff = readDiff(base);
	// 一覧は今の方針なので、--head のときも作業ツリーのものを使う（無ければ --head の中のもの）
	const sets = (() => {
		let t = null;
		try { t = fs.readFileSync(path.join(REPO_ROOT, SETS_FILE), 'utf8'); } catch (e) { t = readText(SETS_FILE); }
		return t ? JSON.parse(t) : { core: [], dataSensitive: [] };
	})();

	const reasons = new Map();   // no -> [理由]
	const addReason = (no, why) => { if (!reasons.has(no)) reasons.set(no, []); const r = reasons.get(no); if (!r.includes(why)) r.push(why); };
	const score = new Map();     // no -> 当たりの強さ（(2) の理由ごとに 1/当たった塊の数 を足す。--budget で外す順）
	const addScore = (no, x) => score.set(no, (score.get(no) || 0) + x);
	const full = [];             // 全体が要る理由
	const stage3 = [];           // 段3 と決まる理由
	const stage3Maybe = [];      // 段3 かもしれない理由（人が中身で決める）
	let stage = 1;
	const otherChecks = new Set(['npm run test:verify']);
	const broad = [];            // 広すぎて使わなかった語
	const productText = [];      // 製品の変えた行（コメントを除く）。日本語の文言の照合に使う
	const dimWhy = [];           // 寸法に敏感な塊を足すきっかけ（段2 以上のときだけ足す）
	const tokens = new Map();    // 語 -> 出どころ（ファイル）
	const addToken = (t, from) => { if (t && t.length >= 5 && !STOP_WORDS.has(t) && !tokens.has(t)) tokens.set(t, from); };
	const changedFiles = [];

	// 繰り返しの中の塊（T33）は同じ行の範囲に複数の番号があるので、当たる塊をすべて返す
	const blocksAt = (rel, line) => {
		const f = idx.files[rel];
		if (!f) return [];
		return f.blockIdx.map((k) => idx.blocks[k]).filter((b) => line >= b.start && line <= b.end);
	};

	for (const fd of diff) {
		const rel = fd.file;
		changedFiles.push((fd.status || 'M') + ' ' + rel);
		for (const [re, check] of OTHER_CHECKS) if (re.test(rel)) otherChecks.add(check);
		for (const [re, why] of STAGE3_FILES) if (re.test(rel) && !(fd.status === 'A' && rel.startsWith('tests/'))) { stage3.push(why + ': ' + rel); }
		for (const [re, why] of STAGE3_MAYBE) if (re.test(rel)) { stage3Maybe.push(why + ': ' + rel); }
		// 検査の土台は「既存のファイルを変えた・消した」ときだけ全体（新しい部品のファイルを足しただけなら、使う塊は (1) と (2) で拾う）
		if (FULL_FILES.some((re) => re.test(rel)) && fd.status !== 'A') full.push('検査の土台を変えた: ' + rel);
		// 消したファイル（git rm。T33）は、変えたファイルの一覧と段の見立てにだけ入れ、塊を探す対象から外す
		// （変更後の中身が無い。以前は囲む関数を探すところで「reading 'trim'」で止まっていた。消した lab/ のモックの語で当たりが広がるのも避ける）
		if (fd.status === 'D') continue;

		// ---- tests/visual の塊のファイル
		if (rel.startsWith(VISUAL + '/') && idx.files[rel]) {
			const f = idx.files[rel];
			for (const h of fd.hunks) {
				const from = h.newStart, to = h.newCount > 0 ? h.newStart + h.newCount - 1 : h.newStart;
				for (let ln = from; ln <= to; ln++) {
					if (rel === idx.smokeRel && idx.harness.some(([a, b]) => ln >= a && ln <= b)) {
						// 塊の外: import や塊の回し方。register の import を足しただけ（新しい塊のファイル）は全体にしない
						const text = h.plus.concat(h.minus).join('\n');
						const onlyImports = h.plus.concat(h.minus).every((l) => !l.trim() || /^\s*(import \{ register\w+ \} from|await register\w+\(|\/\/)/.test(l));
						if (!onlyImports) { full.push('run-smoke.mjs の塊の外（検査の土台）を変えた: ' + ln + '行目付近'); stage3.push('検査の土台（run-smoke.mjs の塊の外）'); }
						void text;
						break;
					}
					if (rel !== idx.smokeRel && ln <= f.preambleEnd) {
						for (const k of f.blockIdx) addReason(idx.blocks[k].no, '(1) 塊のファイルの共通の準備を変えた: ' + path.basename(rel));
						break;
					}
					for (const b of blocksAt(rel, ln)) addReason(b.no, '(1) 塊の中を変えた: ' + path.basename(rel) + ':' + ln);
				}
				// tests の変えた行で宣言した名前は、ほかの塊での使用を探す
				for (const l of h.plus.concat(h.minus)) { const n = declName(l); if (n && n.length >= 5) addToken(n, rel + '（検査の部品）'); }
			}
			if (fd.status === 'A' && f.blockIdx.length === 0) { /* 塊の無いファイル */ }
			stage = Math.max(stage, 1);
			continue;
		}
		if (rel.startsWith('tests/') || rel.startsWith('scripts/') || rel.startsWith('docs/') || /\.md$/.test(rel)) continue;
		if (fd.binary) {
			addToken(path.basename(rel), rel);
			addToken(path.basename(rel).replace(/\.[^.]+$/, ''), rel);
			continue;
		}

		// ---- 製品のファイル
		const isData = rel.startsWith('data/') || rel === 'uma-skill-deck-skills.json';
		if (isData) {
			addToken(path.basename(rel), rel);
			addToken(path.basename(rel).replace(/\.json$/, ''), rel);
		} else {
			stage = Math.max(stage, /\.(html|js|css)$/.test(rel) ? 2 : 1);
			// 製品のファイル名（special.html・uma-skill-deck-core.js など）は語にしない（版の ?v= の行で毎回当たり、広すぎる）
		}
		const after = readText(rel);
		const afterLines = after ? after.split('\n') : [];
		// .css・画面の HTML は、版の付け替え（?v= ・-version）とコメントだけの変更では足さない
		const isVerLine = (l) => /\?v=\d{4}-\d{2}-\d{2}/.test(l) || /-version:\s*'?\d{4}-\d{2}-\d{2}/.test(l) || /_VERSION\s*=\s*'\d{4}-\d{2}-\d{2}/.test(l);
		if (!isData && DIM_FILES.some((re) => re.test(rel)) && fd.hunks.some((h) => h.plus.concat(h.minus).some((l) => l.trim() && !isComment(l) && !isVerLine(l)))) dimWhy.push((/\.css$/.test(rel) ? 'CSS' : '画面の HTML') + ': ' + rel);
		for (const h of fd.hunks) {
			if (isData) break;   // data の中身の語・文言は拾わない（ファイル名とデータに敏感な塊で拾う）
			const lines = h.plus.concat(h.minus);
			// 消したファイル（T33）は変更後の行が無いので、囲む関数は探さない（消した行の語は下で拾う）
			if (/\.(js|html|mjs)$/.test(rel) && afterLines.length > 0) {
				const at = h.newCount > 0 ? h.newStart : h.newStart + 1;
				const last = h.newCount > 0 ? h.newStart + h.newCount - 1 : at;
				for (const n of enclosingFunctions(afterLines, at)) addToken(n, rel + '（変えた行を囲む関数）');
				// 帯や列見出しを作る関数（変えた行の最初と最後を囲む関数・変えた行で宣言した関数）
				const fns = new Set([...enclosingFunctions(afterLines, at), ...enclosingFunctions(afterLines, last), ...lines.map(declName).filter(Boolean)]);
				for (const n of fns) if (DIM_FUNCS.has(n)) dimWhy.push('帯や列見出しを作る関数 ' + n + ': ' + rel);
			}
			for (const raw of lines) {
				if (STORAGE_RE.test(raw)) stage3.push('保存データの形・移行（' + raw.trim().slice(0, 60) + '）: ' + rel);
				else if (STORAGE_MAYBE_RE.test(raw)) stage3Maybe.push('保存の鍵（' + raw.trim().slice(0, 60) + '）: ' + rel);
				if (isComment(raw)) continue;
				if (/\?v=\d{4}-\d{2}-\d{2}/.test(raw) || /-version:\s*'?\d{4}-\d{2}-\d{2}/.test(raw)) continue;   // 版の付け替えの行
				const l = stripTrailingComment(raw);
				productText.push(l);
				const n = declName(l); if (n) addToken(n, rel);
				for (const m of l.matchAll(HYPHEN_RE)) addToken(m[0], rel);
				for (const m of l.matchAll(CAMEL_RE)) if (m[0].length >= 6) addToken(m[0], rel);
				for (const m of l.matchAll(CONST_RE)) addToken(m[0], rel);
			}
		}
		if (isData) otherChecks.add('npm run check:catalog');
	}
	if (diff.some((fd) => fd.file.startsWith('data/') || fd.file === 'uma-skill-deck-skills.json')) {
		for (const s of sets.dataSensitive || []) for (const b of matchSet(idx.blocks, s)) addReason(b.no, '(4) データに敏感な塊: ' + (s.why || s.title));
	}

	// ---- (2) 語を塊の本文で探す
	const blockText = idx.blocks.map((b) => idx.files[b.file].lines.slice(b.start - 1, b.end).join('\n'));
	// 語の索引（語＝英数字・_・$・- の連なり。'.usd-gh-menu' の usd-gh-menu、'a.fooBar(' の fooBar が1語）
	const wordIndex = new Map();
	blockText.forEach((t, k) => {
		for (const m of t.matchAll(/[A-Za-z0-9_$.-]+/g)) {
			// 「a.b.c」は a・b・c と「a.b.c」の両方で引けるように（data のファイル名 skill-pt.json も1語で引ける）
			const w = m[0];
			const parts = w.includes('.') ? [w, ...w.split('.')] : [w];
			for (let p of parts) {
				p = p.replace(/^-+|-+$/g, '');
				if (p.length < 5) continue;
				let s = wordIndex.get(p);
				if (!s) { s = new Set(); wordIndex.set(p, s); }
				s.add(k);
			}
		}
	});
	for (const [tok, from] of tokens) {
		const hits = [...(wordIndex.get(tok) || [])];
		if (hits.length === 0) continue;
		if (hits.length > CAP) { broad.push(tok + '（' + hits.length + '塊・' + from + '）'); continue; }
		for (const k of hits) { addReason(idx.blocks[k].no, '(2) 語 ' + tok + '（' + from + '）'); addScore(idx.blocks[k].no, 1 / hits.length); }
	}
	// ---- (2') 文言: 塊の文字列の日本語が、製品の変えた行に含まれる
	const changedJp = productText.join('\n');
	if (changedJp) {
		const fragHits = new Map();
		blockText.forEach((t, k) => {
			const seen = new Set();
			for (const lit of t.matchAll(LITERAL_RE)) for (const run of lit[0].matchAll(JP_RUN_RE)) seen.add(run[0]);
			for (const fr of seen) if (changedJp.includes(fr)) { if (!fragHits.has(fr)) fragHits.set(fr, []); fragHits.get(fr).push(k); }
		});
		for (const [fr, ks] of fragHits) {
			if (ks.length > JP_CAP) { broad.push('「' + fr + '」（' + ks.length + '塊・文言）'); continue; }
			for (const k of ks) { addReason(idx.blocks[k].no, '(2) 文言「' + fr + '」'); addScore(idx.blocks[k].no, 1 / ks.length); }
		}
	}
	// ---- (3) 核
	const selectedBeforeCore = new Set(reasons.keys());
	if (stage3.length > 0) stage = 3;
	if (full.length > 0) stage = 3;
	// 核は段2 以上（画面の処理・表示の作りを変えたとき）だけ足す。段1（データ・文言・検査だけ）は関係する塊だけ
	if (!NO_CORE && stage >= 2) for (const s of sets.core || []) for (const b of matchSet(idx.blocks, s)) addReason(b.no, '(3) 核: ' + (s.why || ''));
	// (6) 寸法に敏感な塊: 段2 以上で、.css・画面の HTML・帯や列見出しを作る関数・core の CSS を変えたとき
	const dimAdded = stage >= 2 && dimWhy.length > 0;
	if (dimAdded) for (const s of sets.dimensionSensitive || []) for (const b of matchSet(idx.blocks, s)) addReason(b.no, '(6) 寸法に敏感な塊: ' + (s.why || ''));

	let nos = [...reasons.keys()].sort((a, b) => a - b);
	// --budget: (1)(3)(4)(6) の塊は残し、(2) だけの塊を当たりの弱い順に外して、見込みを枠に収める（外した塊は一覧に出す。夜間の全体で拾う）
	const dropped = [];
	if (BUDGET != null) {
		const weak = nos.filter((no) => reasons.get(no).every((x) => x.startsWith('(2)'))).sort((a, b) => (score.get(a) || 0) - (score.get(b) || 0));
		const keep = new Set(nos);
		for (const no of weak) {
			const e = estimate(idx.blocks, [...keep]);
			if (!e.source || e.parallelSec <= BUDGET * 60) break;
			keep.delete(no);
			dropped.push({ no, title: idx.blocks[no - 1].title, score: Math.round((score.get(no) || 0) * 1000) / 1000 });
		}
		nos = nos.filter((no) => keep.has(no));
	}
	const est = estimate(idx.blocks, nos);
	const result = {
		base: base, baseShort, head: HEAD || '(作業ツリー)', blockCount: idx.blocks.length,
		changedFiles, stage, stage3: [...new Set(stage3)], stage3Maybe: [...new Set(stage3Maybe)], full: [...new Set(full)], otherChecks: [...otherChecks],
		selected: nos.map((no) => ({ no, title: idx.blocks[no - 1].title, reasons: reasons.get(no) })),
		selectedBeforeCore: [...selectedBeforeCore].sort((a, b) => a - b),
		dimensionSensitive: dimAdded ? [...new Set(dimWhy)] : [],
		broad, estimate: est, budget: BUDGET, dropped,
		only: nos.join(','),
	};
	if (JSON_OUT === '-') { process.stdout.write(JSON.stringify(result) + '\n'); return result; }   // --json=- は JSON だけを標準出力へ
	if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 1));
	if (!QUIET) printResult(result);
	return result;
}

/** block-sets.json の1項目（{ title, why }。title は見出しの先頭）に当たる塊 */
function matchSet(blocks, s) {
	return blocks.filter((b) => b.title === s.title || b.title.startsWith(s.title) || (b.dynamic && s.title.startsWith(b.title) && b.title.length >= 6));
}

// ---------------------------------------------------------------- 時間の見込み
/** 計器のログ（output/scratch/block-times-*.jsonl）のうち、いちばん新しい全体（3シャード）の塊ごとの時間から見込む */
let timesCache;
function estimate(blocks, nos) {
	if (timesCache === undefined) timesCache = loadTimes(blocks);
	return estimateWith(timesCache, blocks, nos);
}
function loadTimes(blocks) {
	const dirs = [path.join(REPO_ROOT, 'output', 'scratch')];
	try {
		const common = path.resolve(REPO_ROOT, git(['rev-parse', '--git-common-dir']).trim());
		const main = path.dirname(common);
		dirs.push(path.join(main, 'output', 'scratch'));
		// アプリの作るワークツリー（.claude/worktrees/*）の計器のログも見る（output/ は追跡外なので、新しいワークツリーには無い）
		try { for (const d of fs.readdirSync(path.join(main, '.claude', 'worktrees'))) dirs.push(path.join(main, '.claude', 'worktrees', d, 'output', 'scratch')); } catch (e) { /* なくてよい */ }
	} catch (e) { /* なくてよい */ }
	if (TIMES_DIR) dirs.unshift(TIMES_DIR);
	// 3シャードそろった記録を新しい順に見て、塊の数が今の8割以上ある最初のもの（＝全体の実行）を使う
	const cands = [];
	for (const d of dirs) {
		let names = [];
		try { names = fs.readdirSync(d); } catch (e) { continue; }
		const stamps = new Map();
		for (const n of names) { const m = /^block-times-(\d{8}-\d{6})-s(\d)of3\.jsonl$/.exec(n); if (m) { if (!stamps.has(m[1])) stamps.set(m[1], []); stamps.get(m[1]).push(path.join(d, n)); } }
		for (const [st, fs3] of stamps) if (fs3.length === 3) cands.push({ stamp: st, files: fs3 });
	}
	cands.sort((a, b) => b.stamp.localeCompare(a.stamp));
	let best = null;
	for (const c of cands) {
		const recs = c.files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean));
		if (recs.length >= blocks.length * 0.8) { best = { stamp: c.stamp, recs }; break; }
	}
	if (!best) return null;
	const secs = best.recs.map((r) => r.sec).sort((a, b) => a - b);
	return { stamp: best.stamp, recs: best.recs, byTitle: new Map(best.recs.map((r) => [r.title, r.sec])), median: secs[Math.floor(secs.length / 2)] };
}
/* 割り振りは並列の検査と同じ（tests/visual/lib/shard-plan.mjs。2026-10-30）: 重みのファイル tests/visual/block-weights.json が読めれば
 * 選んだ塊だけで時間で均し、読めなければ番号の剰余。各シャードの時間は計器のログの塊ごとの時間（無ければ重みのファイルの時間）で足す。 */
let weightsCache;
function estimateWith(times, blocks, nos) {
	if (weightsCache === undefined) weightsCache = loadWeights(REPO_ROOT);
	const weights = weightsCache;
	if (!times && !weights) return { source: null, note: '計器のログ（全体の3シャード）も重みのファイル（tests/visual/block-weights.json）も見つからない' };
	const byTitle = times ? times.byTitle : null;
	const median = times ? times.median : Math.round(weights.mean * 10) / 10;
	const look = weightLookup(weights);
	let unknown = 0;
	const secOf = (no, w) => {
		const b = blocks[no - 1];
		if (byTitle) {
			if (byTitle.has(b.title)) return byTitle.get(b.title);
			if (b.dynamic) { const r = times.recs.find((x) => x.title.startsWith(b.title)); if (r) return r.sec; }
		} else if (typeof w === 'number') return w;
		unknown++;
		return median;
	};
	const items = nos.map((no) => ({ no, w: look(blocks[no - 1].title, blocks[no - 1].dynamic) }));
	const plan = planShards(items, 3, weights);
	const shard = [0, 0, 0];
	let serial = 0;
	for (const it of items) { const s = secOf(it.no, it.w); serial += s; shard[plan.shardOf.get(it.no) - 1] += s; }
	const startup = 12;   // ブラウザとサーバの起動・まとめ（秒。おおよそ）
	return { source: (times ? 'block-times-' + times.stamp : '重みのファイル ' + weights.source) + '・割り振り ' + (plan.mode === 'time' ? '時間で均す' : '番号の剰余'),
		serialSec: Math.round(serial + startup), parallelSec: Math.round(Math.max(...shard) + startup), shardSec: shard.map(Math.round), unknownBlocks: unknown, medianSec: median, shardMode: plan.mode };
}

const mmss = (s) => Math.floor(s / 60) + '分' + String(Math.round(s % 60)).padStart(2, '0') + '秒';
function printResult(r) {
	const out = [];
	out.push('=== 回す塊の選び方（scripts/select-blocks.mjs） ===');
	out.push('差: ' + r.baseShort + ' … ' + r.head + '・変えたファイル ' + r.changedFiles.length + '本・塊は全部で ' + r.blockCount + '個');
	r.changedFiles.forEach((f) => out.push('  ' + f));
	out.push('');
	out.push('段の見立て: 段' + r.stage + (r.stage === 3 ? '（push の前に全体を1回。下の理由が「表示用の定数・文言だけ」なら段2 でよい。決めるのは人）' : r.stage === 2 ? '（関係する塊＋核。全体はしない）' : '（関係する塊。全体はしない）'));
	r.stage3.forEach((s) => out.push('  段3 の理由: ' + s));
	r.stage3Maybe.forEach((s) => out.push('  段3 かもしれない（中身で決める）: ' + s));
	if (r.dimensionSensitive.length > 0) {
		out.push('寸法に敏感な塊を足した（段2 以上で、次を変えた）:');
		r.dimensionSensitive.slice(0, 8).forEach((s) => out.push('  ' + s));
		if (r.dimensionSensitive.length > 8) out.push('  ほか ' + (r.dimensionSensitive.length - 8) + '件');
	}
	if (r.full.length > 0) {
		out.push('全体が要る（検査の土台を変えた）: npm run test:visual:parallel');
		r.full.forEach((s) => out.push('  ' + s));
	}
	out.push('');
	const e = r.estimate;
	out.push('選んだ塊: ' + r.selected.length + '個' + (e.source ? '・見込み 並列 N=3 で約 ' + mmss(e.parallelSec) + '（直列なら約 ' + mmss(e.serialSec) + '。塊ごとの時間は ' + e.source + (e.unknownBlocks ? '・記録の無い ' + e.unknownBlocks + '塊は中央値 ' + e.medianSec + '秒で仮置き' : '') + '）' : '・' + e.note));
	if (r.selected.length > 0) out.push('コマンド: npm run test:visual:parallel -- --only=' + r.only);
	if (r.budget != null) out.push('--budget=' + r.budget + '分: 当たりの弱い ' + r.dropped.length + '塊を外した（夜間の全体で拾う）' + (r.dropped.length ? ': ' + r.dropped.map((d) => '#' + d.no).join(' ') : ''));
	else if (e.source && e.parallelSec > 900) out.push('見込みが15分を超える。--budget=15 で当たりの弱い塊から外してよい（恒久ルール22。外した塊は夜間の全体で拾う）');
	out.push('');
	out.push('理由:');
	for (const s of r.selected) out.push('  #' + s.no + ' ' + s.title.slice(0, 60) + '\n      ← ' + s.reasons.slice(0, 4).join(' ／ ') + (s.reasons.length > 4 ? ' ／ ほか' + (s.reasons.length - 4) : ''));
	if (r.broad.length > 0) out.push('\n広すぎて使わなかった語（' + r.broad.length + '）: ' + r.broad.slice(0, 40).join('、') + (r.broad.length > 40 ? ' ほか' : ''));
	out.push('\nほかの検査: ' + r.otherChecks.join(' ／ '));
	console.log(out.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		if (ARGV.includes('--list')) {
			// 静的に数えた塊の番号・見出し・場所（npm run test:visual -- --list と見比べる用）
			for (const b of buildIndex().blocks) console.log(b.no + '\t' + b.title + (b.dynamic ? '…' : '') + '\t' + b.file + ':' + b.start + '-' + b.end);
		} else if (ARGV.includes('--check-sets')) {
			// block-sets.json の項目が、それぞれちょうど1塊に当たるか
			const blocks = buildIndex().blocks;
			const sets = JSON.parse(readText(SETS_FILE));
			let bad = 0;
			for (const key of ['core', 'dataSensitive', 'dimensionSensitive']) {
				for (const s of sets[key] || []) {
					const hit = matchSet(blocks, s);
					if (hit.length !== 1) { bad++; console.log('[NG] ' + key + ': 「' + s.title + '」は ' + hit.length + '塊に当たる' + (hit.length ? '（' + hit.map((b) => '#' + b.no).join(' ') + '）' : '')); }
				}
				console.log(key + ': ' + (sets[key] || []).length + '項目');
			}
			console.log(bad === 0 ? 'block-sets.json: すべて1塊に当たる' : 'block-sets.json: ' + bad + '件 直す');
			process.exit(bad === 0 ? 0 : 1);
		} else main();
	} catch (e) { console.error('select-blocks: ' + (e && e.message ? e.message : e)); process.exit(2); }
}
