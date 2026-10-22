// データ受け入れの「読むだけ」の点検（標準の受け入れ手順の2・6。ACCEPT-PROCEDURE.md）。
//   npm run accept:data -- <output/scratch の入力フォルダ名> [--no-catalog]
//   入力フォルダ名は output/scratch/ の下の名前（メインの作業フォルダにある入力も、worktree から探す）。絶対パスも可。
// リポジトリのデータ・版の表・HTML・テストは**書き換えない**（標準出力だけ。check:catalog にかけるための一時フォルダを
// output/scratch/ に作り、終わったら消す）。版の書き換え（apply）は含めない。
// 見るもの: (1) 入力の形（JSON として読める・版の形・category）と check:catalog と同じ関門 (2) 現行（git HEAD）との版の新旧
//   (3) 追加・変更・削除の件数 (4) 新しいキー (5) 除外リストに当たる id (6) 版の表（DATA_JSON_VERSIONS／EXAM_DATA_JSON_VERSIONS）と
//   core の版定数・3つの HTML の ?v= の現状 (7) 件数・版を固定していそうな検査の洗い出し（候補。偽陽性あり）
// スキル名・衣装名はここに書かない（恒久ルール1）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const NO_CATALOG = args.includes('--no-catalog');
const REF = (args.find((a) => a.startsWith('--ref=')) || '').slice('--ref='.length) || '';   // 比べる先の commit（既定は作業ツリー＝現行。受け入れ済みの状態を受け入れ前と比べたいときに指定）
const nameArg = args.find((a) => !a.startsWith('--'));
if (!nameArg) {
	console.log('使い方: npm run accept:data -- <output/scratch の入力フォルダ名> [--no-catalog]');
	process.exit(2);
}

const git = (a) => spawnSync('git', a, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 29 });
const headText = (rel) => { const r = git(['show', (REF || 'HEAD') + ':' + rel]); return r.status === 0 ? r.stdout : null; };
// 版の表・HTML・check-catalog のソース: --ref があればその commit から、無ければ作業ツリーから読む
const srcOf = (rel) => (REF ? headText(rel) : fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
const VER_RE = /^\d{4}-\d{2}-\d{2}[a-z]$/;
let ng = 0, warnN = 0;
const NG = (m) => { ng++; console.log('[NG] ' + m); };
const OK = (m) => console.log('[OK] ' + m);
const WARN = (m) => { warnN++; console.log('[警告] ' + m); };
const INFO = (m) => console.log('       ' + m);
const head = (s) => console.log('\n=== ' + s + ' ===');

/* ---- 入力フォルダを探す ---- */
function findInputDir(name) {
	if (path.isAbsolute(name)) return fs.existsSync(name) ? name : null;
	const cands = [path.join(REPO_ROOT, 'output/scratch', name)];
	const wl = git(['worktree', 'list', '--porcelain']);
	const m = /^worktree (.+)$/m.exec(wl.stdout || '');
	if (m) cands.push(path.join(m[1].trim(), 'output/scratch', name));
	return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isDirectory()) || null;
}
const inDir = findInputDir(nameArg);
head('入力');
if (!inDir) { NG('入力フォルダが見つからない: ' + nameArg + '（output/scratch/ の下。メインの作業フォルダ側も探した）'); process.exit(1); }
INFO('入力フォルダ: ' + inDir);
INFO('比べる先: ' + (REF ? 'git ' + REF + '（--ref。版の表・HTML・現行のデータもその commit から）' : '現行（git HEAD のデータ・作業ツリーの版の表と HTML）'));
const files = fs.readdirSync(inDir).filter((f) => fs.statSync(path.join(inDir, f)).isFile());
const jsonFiles = files.filter((f) => f.endsWith('.json'));
const others = files.filter((f) => !f.endsWith('.json'));
if (jsonFiles.length === 0) { NG('JSON のファイルが無い'); process.exit(1); }
INFO('JSON ' + jsonFiles.length + ' 本: ' + jsonFiles.join('・') + (others.length ? '／JSON でないファイル（対象外）: ' + others.join('・') : ''));

/* ---- 版の表・core の版定数・HTML の ?v= ---- */
const coreSrc = srcOf('js/uma-skill-deck-core.js');
const examSrc = srcOf('exam.html');
const tableOf = (src) => Object.fromEntries([...src.matchAll(/'(data\/[a-z0-9-]+\.json)'\s*:\s*'(\d{4}-\d{2}-\d{2}[a-z])'/g)].map((m) => [m[1], m[2]]));
const coreTable = tableOf(coreSrc.slice(coreSrc.indexOf('DATA_JSON_VERSIONS'), coreSrc.indexOf('DATA_JSON_VERSIONS') + 6000));
const examTable = (() => { const m = /const EXAM_DATA_JSON_VERSIONS = \{([\s\S]*?)\};/.exec(examSrc); return m ? tableOf(m[1]) : {}; })();
const coreVer = (/UMA_SKILL_DECK_CORE_JS_VERSION\s*=\s*'([^']+)'/.exec(coreSrc) || [])[1];
const masterVerConst = (/MASTER_JSON_VERSION\s*=\s*'([^']+)'/.exec(coreSrc) || [])[1];
const htmlVers = ['special.html', 'uma-skill-deck.html', 'card-event-input.html'].map((f) => {
	const m = /uma-skill-deck-core\.js\?v=([^"']+)/.exec(srcOf(f));
	return [f, m ? m[1] : null];
});

/* ---- 除外リスト ---- */
const catalogSrc = srcOf('tests/catalog/check-catalog.mjs');
const removedBlock = /const INTENTIONALLY_REMOVED_IDS = new Set\(\[([\s\S]*?)\]\);/.exec(catalogSrc);
const removedIds = removedBlock ? [...removedBlock[1].matchAll(/'[A-Za-z]+:\s*([^']+)'/g)].map((m) => m[1].trim()) : [];

/* ---- テストの全ファイル（件数・版の固定の洗い出し用） ---- */
function walk(dir, out) {
	for (const n of fs.readdirSync(dir)) {
		const p = path.join(dir, n);
		const st = fs.statSync(p);
		if (st.isDirectory()) { if (n !== 'node_modules') walk(p, out); } else if (n.endsWith('.mjs')) out.push(p);
	}
	return out;
}
const testFiles = walk(path.join(REPO_ROOT, 'tests'), []).map((p) => ({ rel: path.relative(REPO_ROOT, p).replace(/\\/g, '/'), lines: fs.readFileSync(p, 'utf8').split(/\r?\n/) }));

/* ---- 1ファイルずつ ---- */
const rowKey = (it, i) => {
	if (it && typeof it === 'object') {
		for (const k of ['id', 'skillId', 'cardId', 'umaId', 'scenarioId', 'key', 'row']) if (it[k] !== undefined) {
			const rest = it.kind ? '|' + it.kind + '|' + (it.baseSkillId || '') : '';
			return String(it[k]) + rest;
		}
	}
	return '#' + i;
};
const arraysOf = (d) => Object.keys(d).filter((k) => Array.isArray(d[k]));
const summaries = [];
const accepted = [];   // { rel, file, newVer, curVer, count, curCount }
for (const f of jsonFiles) {
	const isMaster = f === 'uma-skill-deck-skills.json';
	const rel = isMaster ? f : 'data/' + f;
	head(f + '（現行: ' + rel + '）');
	let raw, nu;
	try { raw = fs.readFileSync(path.join(inDir, f), 'utf8'); nu = JSON.parse(raw); } catch (e) { NG('JSON として読めない: ' + e.message); continue; }
	OK('JSON として読める（' + Buffer.byteLength(raw) + ' バイト）');
	if (raw.includes('\r')) WARN('入力に CR（CRLF）が混じっている（index は LF。置くときは LF のまま）');
	const verKey = isMaster ? 'masterVersion' : 'dataVersion';
	const newVer = nu[verKey];
	if (!VER_RE.test(String(newVer))) NG(verKey + ' が「YYYY-MM-DD＋英小文字1字」の形でない: ' + String(newVer)); else OK(verKey + ' ' + newVer);
	const curText = headText(rel);
	if (curText === null) {
		WARN('現行（git HEAD）に ' + rel + ' が無い＝新ファイルの初回。ツール側の入口（core の表・読み込み・check-catalog の節）が先にあるか確かめる（無ければ受け入れではなく実装）');
		accepted.push({ rel, file: f, newVer, curVer: null, count: null, curCount: null });
		continue;
	}
	const cur = JSON.parse(curText);
	const curVer = cur[verKey];
	if (nu.category !== undefined || cur.category !== undefined) {
		if (nu.category !== cur.category) NG('category が現行と違う: ' + JSON.stringify(cur.category) + ' → ' + JSON.stringify(nu.category)); else OK('category は現行と同じ（' + nu.category + '）');
	}
	// 版の新旧
	const identical = JSON.stringify(cur) === JSON.stringify(nu);
	if (newVer === curVer) {
		if (identical) INFO('現行と同一（版も中身も同じ。受け入れるものは無い）'); else WARN('同じ版（' + newVer + '）で中身が違う。データ側が版を上げ忘れている');
	} else if (VER_RE.test(String(newVer)) && newVer < curVer) {
		WARN('入力の版が現行より古い: ' + curVer + ' → ' + newVer);
	} else if (VER_RE.test(String(newVer))) OK('版は新しい: ' + curVer + ' → ' + newVer);
	// 追加・変更・削除
	let mainCount = null, mainCurCount = null;
	for (const k of arraysOf(nu).concat(arraysOf(cur).filter((x) => !(x in nu)))) {
		const a = Array.isArray(cur[k]) ? cur[k] : [], b = Array.isArray(nu[k]) ? nu[k] : [];
		if (!Array.isArray(nu[k])) { WARN(k + ' が入力に無い（現行は配列 ' + a.length + ' 件）'); continue; }
		const am = new Map(a.map((it, i) => [rowKey(it, i), JSON.stringify(it)])), bm = new Map(b.map((it, i) => [rowKey(it, i), JSON.stringify(it)]));
		const added = [...bm.keys()].filter((x) => !am.has(x)), removed = [...am.keys()].filter((x) => !bm.has(x));
		const changed = [...bm.keys()].filter((x) => am.has(x) && am.get(x) !== bm.get(x));
		INFO(k + ': ' + a.length + ' → ' + b.length + '（追加 ' + added.length + '・変更 ' + changed.length + '・削除 ' + removed.length + (am.size !== a.length || bm.size !== b.length ? '・鍵の重複あり' : '') + '）');
		if (added.length) INFO('  追加の例: ' + added.slice(0, 8).join('、') + (added.length > 8 ? ' ほか' + (added.length - 8) + '件' : ''));
		if (changed.length) INFO('  変更の例: ' + changed.slice(0, 8).join('、') + (changed.length > 8 ? ' ほか' + (changed.length - 8) + '件' : ''));
		if (removed.length) WARN(k + ' に削除が ' + removed.length + ' 件: ' + removed.slice(0, 20).join('、') + (removed.length > 20 ? ' ほか' + (removed.length - 20) + '件' : '') + '（意図した除外だけが例外）');
		if (mainCount === null || b.length > mainCount) { mainCount = b.length; mainCurCount = a.length; }
		// 新しいキー
		const keysOf = (arr) => new Set(arr.flatMap((it) => (it && typeof it === 'object' && !Array.isArray(it) ? Object.keys(it) : [])));
		const nk = [...keysOf(b)].filter((x) => !keysOf(a).has(x));
		if (nk.length) WARN(k + ' に現行に無い項目名: ' + nk.join('・') + '（check:catalog の許可リストに無ければ NG になる。実装せず、おいもさんの承認を取る）');
		const only = Object.keys(nu).filter((x) => x !== verKey && !Array.isArray(nu[x]) && JSON.stringify(nu[x]) !== JSON.stringify(cur[x]));
		if (only.length && k === arraysOf(nu)[0]) INFO('配列以外で変わっている最上位の項目: ' + only.join('・'));
	}
	// 配列を持たない最上位の項目
	if (arraysOf(nu).length === 0) {
		const only = Object.keys(nu).filter((x) => x !== verKey && JSON.stringify(nu[x]) !== JSON.stringify(cur[x]));
		INFO('最上位の項目で変わっているもの: ' + (only.join('・') || 'なし'));
	}
	// 除外リスト
	const hit = removedIds.filter((id) => raw.includes('"' + id + '"'));
	if (hit.length) WARN('除外リストの id が入力に入っている: ' + hit.join('・') + '（意図した除外は戻さない。置く前に報告）');
	// 変えないはずの部分: 版を除いた他がすべて同じか
	const strip = (d) => { const o = JSON.parse(JSON.stringify(d)); delete o[verKey]; return o; };
	if (JSON.stringify(strip(cur)) === JSON.stringify(strip(nu)) && !identical) INFO('版だけが違う（中身は現行と同じ）');
	// 版の表
	const tbl = isMaster ? { v: masterVerConst, where: 'core の MASTER_JSON_VERSION' } : (rel in coreTable ? { v: coreTable[rel], where: 'core の DATA_JSON_VERSIONS' } : (rel in examTable ? { v: examTable[rel], where: 'exam.html の EXAM_DATA_JSON_VERSIONS' } : null));
	if (!tbl) WARN('版の表（core の DATA_JSON_VERSIONS／exam.html の EXAM_DATA_JSON_VERSIONS）に ' + rel + ' が無い');
	else if (tbl.v === newVer) OK('版の表（' + tbl.where + '）は入力の版と一致している（' + tbl.v + '）');
	else INFO('版の表（' + tbl.where + '）は ' + tbl.v + '。受け入れるときに ' + newVer + ' にする');
	if (tbl && curVer !== tbl.v) WARN('現行の版の表（' + tbl.v + '）が現行ファイルの版（' + curVer + '）と食い違っている');
	accepted.push({ rel, file: f, newVer, curVer, count: mainCount, curCount: mainCurCount });
}

/* ---- 3点一致・核の版 ---- */
head('core の版定数と 3つの HTML の ?v= の現状');
{
	const allSame = htmlVers.every(([, v]) => v === coreVer);
	if (allSame) OK('core の版定数 ' + coreVer + ' ＝ 3つの HTML の ?v=（' + htmlVers.map(([f]) => f).join('・') + '）'); else NG('食い違い: core ' + coreVer + '／' + htmlVers.map(([f, v]) => f + '=' + v).join('／'));
	const d = new Date(); const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
	const next = coreVer && coreVer.startsWith(today) ? today + String.fromCharCode(coreVer.charCodeAt(coreVer.length - 1) + 1) : today + 'a';
	INFO('受け入れるときの core の版の次の候補: ' + next + '（今日 ' + today + '。日付が変われば新しい日付の a から）');
}

/* ---- check:catalog と同じ関門を入力に当てる ---- */
head('check:catalog と同じ関門を入力に当てる（現行の data/ に入力を重ねた一時フォルダ）');
if (NO_CATALOG) INFO('--no-catalog のため省略');
else {
	const dataInputs = jsonFiles.filter((f) => f !== 'uma-skill-deck-skills.json');
	const tmpRel = 'output/scratch/.accept-data-tmp-' + process.pid;
	const tmpAbs = path.join(REPO_ROOT, tmpRel);
	try {
		fs.mkdirSync(tmpAbs, { recursive: true });
		for (const f of fs.readdirSync(path.join(REPO_ROOT, 'data'))) if (f.endsWith('.json')) fs.copyFileSync(path.join(REPO_ROOT, 'data', f), path.join(tmpAbs, f));
		dataInputs.forEach((f) => fs.copyFileSync(path.join(inDir, f), path.join(tmpAbs, f)));
		const r = spawnSync(process.execPath, ['tests/catalog/check-catalog.mjs', '--dir=' + tmpRel, '--baseline=data'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
		const out = (r.stdout || '') + (r.stderr || '');
		const lines = out.split(/\r?\n/);
		const nglines = lines.filter((l) => l.startsWith('[NG]'));
		const warnlines = lines.filter((l) => l.startsWith('[警告]'));
		const total = lines.filter((l) => l.includes('=== 総合')).pop() || '(総合の行が無い)';
		if (nglines.length === 0 && r.status === 0) OK('check:catalog と同じ関門: NG 0・警告 ' + warnlines.length + '件 ' + total.trim());
		else { NG('check:catalog と同じ関門: NG ' + nglines.length + '件 ' + total.trim()); nglines.slice(0, 15).forEach((l) => INFO(l.slice(0, 260))); }
		if (dataInputs.length < jsonFiles.length) INFO('マスター（uma-skill-deck-skills.json）は一時フォルダに重ねられない（検査は現行のマスターを読む）。マスターの検査は test:master');
		// 現行の data/ のままで出ている警告との差（入力で増えた警告だけを示す）
		const base = spawnSync(process.execPath, ['tests/catalog/check-catalog.mjs'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
		const baseWarn = new Set((base.stdout || '').split(/\r?\n/).filter((l) => l.startsWith('[警告]')));
		const added = warnlines.filter((l) => !baseWarn.has(l));
		if (added.length) added.slice(0, 10).forEach((l) => WARN('入力で増えた警告: ' + l.slice(0, 240))); else INFO('入力で増えた警告は無い（現行の data/ の警告と同じ）');
	} finally {
		fs.rmSync(tmpAbs, { recursive: true, force: true });
	}
}

/* ---- 件数・版を固定していそうな検査の洗い出し（候補） ---- */
head('件数・版を固定していそうな検査（候補。数字が別の意味で当たる偽陽性がある。直す前に意図した変化かを人が確かめる）');
for (const a of accepted) {
	const base = path.basename(a.rel, '.json');
	const nums = [...new Set([a.curCount, a.count].filter((n) => Number.isInteger(n) && n >= 20))];
	const vers = [a.curVer].filter(Boolean);
	const hits = [];
	for (const t of testFiles) {
		const mentions = t.lines.some((l) => l.includes(base));
		t.lines.forEach((l, i) => {
			vers.forEach((v) => { if (l.includes("'" + v + "'") || l.includes('?v=' + v)) hits.push(t.rel + ':' + (i + 1) + ' 版 ' + v); });
			if (mentions) nums.forEach((n) => { if (new RegExp('(?<![\\w.])' + n + '(?![\\w])').test(l)) hits.push(t.rel + ':' + (i + 1) + ' 数 ' + n); });
		});
	}
	// 固定リスト（遅延して読む data/ の一覧）は意味を持つ一覧なので、新ファイルの初回／読み方を変えたときの注意として別に示す
	const lazy = testFiles.flatMap((t) => t.lines.map((l, i) => ({ t, l, i }))).filter(({ l }) => l.includes('const 遅延 = [') && l.includes(a.rel));
	INFO(a.rel + '（件数 ' + (a.curCount ?? '-') + ' → ' + (a.count ?? '-') + '・現行の版 ' + (a.curVer || '-') + '）: ' + (hits.length ? hits.length + '件' : '候補なし'));
	hits.slice(0, 12).forEach((h) => INFO('  ' + h));
	if (hits.length > 12) INFO('  ほか ' + (hits.length - 12) + '件');
	lazy.forEach(({ t, i }) => INFO('  ' + t.rel + ':' + (i + 1) + ' 遅延して読む data/ の一覧に載っている（読み方を変えたら見る）'));
}

head('まとめ');
console.log((ng ? '[NG] ' : '[OK] ') + 'NG ' + ng + '件・警告 ' + warnN + '件（読むだけ。リポジトリは書き換えていない）');
process.exit(ng ? 1 : 0);
