// 納品前チェック。目視ではなく機械で検証する。
//
//   npm run test:verify
//
// 検証対象は「実際に納品されるファイル」= リポジトリ実ファイル。
// 過去に、作業用のコピーを検証して古い版を納品する事故を繰り返したため、
// このスクリプトは常にリポジトリ実ファイルだけを見る。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { REPO_ROOT } from './lib/serve.mjs';

let ok = true;
const warnings = [];
function check(cond, label, detail) {
	if (!cond) ok = false;
	console.log((cond ? '[OK] ' : '[NG] ') + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
/** 検査は失敗させないが、見逃さないよう最後にもう一度まとめて出すもの */
function warn(label, detail) {
	warnings.push(label + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
	console.log('[警告] ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
function head(p) {
	const r = spawnSync('git', ['show', 'HEAD:' + p], { cwd: REPO_ROOT, encoding: 'utf8' });
	return r.status === 0 ? r.stdout : '';
}

/** class 属性に現れるトークン（テンプレート内の ${...} は除く） */
function classes(src) {
	const out = new Set();
	for (const m of src.matchAll(/class\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
		for (const t of (m[1] || m[2] || '').split(/\s+/)) {
			if (!t || t.includes('${') || ['+', "'", ':', '?'].includes(t)) continue;
			out.add(t);
		}
	}
	return out;
}
const ids = (s) => new Set([...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
	.concat([...s.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1])));
const datas = (s) => new Set([...s.matchAll(/\b(data-[a-z0-9-]+)/g)].map((m) => m[1]));

/** classList / className = で名指ししているクラス（そのページのJSでのみ危険） */
function grabLocal(sources) {
	const g = new Set();
	for (const s of sources) {
		for (const m of s.matchAll(/classList\.(?:add|remove|toggle|contains|replace)\(([^)]*)\)/g))
			for (const q of m[1].matchAll(/['"`]([^'"`]+)['"`]/g)) q[1].split(/\s+/).forEach((c) => g.add(c));
		for (const m of s.matchAll(/className\s*\+?=\s*['"`]([^'"`]*)['"`]/g))
			m[1].split(/\s+/).forEach((c) => g.add(c));
	}
	return g;
}
/** 文書全体を検索するセレクタ（ファイル横断で危険） */
function grabQuery(sources) {
	const g = new Set();
	for (const s of sources) {
		for (const m of s.matchAll(/(?:querySelector(?:All)?|matches|closest)\(\s*['"`]([^'"`]+)['"`]/g))
			for (const c of m[1].matchAll(/\.([A-Za-z_][\w-]*)/g)) g.add(c[1]);
		for (const m of s.matchAll(/getElementsByClassName\(\s*['"`]([^'"`]+)['"`]/g))
			m[1].split(/\s+/).forEach((c) => g.add(c));
	}
	return g;
}

const ALL_JS = ['special.html', 'uma-skill-deck.html', 'exam.html', 'index.html',
	'js/common.js', 'js/uma-skill-deck-core.js', 'js/uma-skill-deck.js', 'js/stitch.js'];
// 15セッション目: exam.html を「変更してはいけないファイル」から外し、
// special.html と同じくセレクタ資産・class・構文の検査対象に移した（第2段階の着手）。
const TARGETS = ['special.html', 'exam.html', 'uma-skill-deck.html', 'js/uma-skill-deck-core.js', 'js/uma-skill-deck.js'];

console.log('=== 1. バージョン文字列の整合 ===');
// 共通CSSは3ファイル（tokens / common / shell）で版は1つ。
// それぞれが :root に持つ印が同じ文字列であることと、各HTMLが読む分の ?v= が全部その値であることを見る。
const CSS_FILES = [
	['css/tokens.css', /--common-css-version:\s*"([^"]+)"/],
	['css/common.css', /--uma-components-css-version:\s*"([^"]+)"/],
	['css/shell.css', /--uma-shell-css-version:\s*"([^"]+)"/],
];
const css = read('css/common.css');
const cssVer = CSS_FILES[0][1].exec(read('css/tokens.css'))[1];
check(!!cssVer, 'css/tokens.css に --common-css-version がある', cssVer);
for (const [p, re] of CSS_FILES.slice(1)) {
	const m = re.exec(read(p));
	check(!!m && m[1] === cssVer, p + ' の版の印が tokens.css と一致', m && m[1]);
}

// どのページがどのファイルを読むか（レポート exam-ui-analysis.md A-5 の表）
const CSS_LINKS = {
	'special.html': ['tokens', 'common', 'shell'],
	'uma-skill-deck.html': ['tokens', 'common'],
	'css/styleguide.html': ['tokens', 'common'],
	// exam.html は共通部品（common.css）を読まない。読むと .glass-card の余白など既存の見た目が変わるため
	'exam.html': ['tokens', 'shell'],
};
for (const [p, files] of Object.entries(CSS_LINKS)) {
	const src = read(p);
	for (const f of ['tokens', 'common', 'shell']) {
		const q = [...src.matchAll(new RegExp(f + '\\.css\\?v=([0-9a-z-]+)', 'g'))].map((m) => m[1]);
		if (files.includes(f)) check(q.length === 1 && q[0] === cssVer, `${p} の ${f}.css の ?v= が定数と一致`, q);
		else check(q.length === 0, `${p} は ${f}.css を読まない`, q);
	}
}
for (const p of ['special.html', 'js/uma-skill-deck.js', 'exam.html']) {
	const e = [...read(p).matchAll(/EXPECTED_COMMON_CSS_VERSION\s*=\s*'([^']+)'/g)].map((m) => m[1]);
	check(e.length === 1 && e[0] === cssVer, p + ' の EXPECTED_COMMON_CSS_VERSION が定数と一致', e);
}
const coreVer = /UMA_SKILL_DECK_CORE_JS_VERSION = '([^']+)'/.exec(read('js/uma-skill-deck-core.js'))[1];
const deckVer = /UMA_SKILL_DECK_JS_VERSION = '([^']+)'/.exec(read('js/uma-skill-deck.js'))[1];
const commonVer = /COMMON_JS_VERSION = '([^']+)'/.exec(read('js/common.js'))[1];
// 21セッション目に追加。stitch.js は長らく ?v= が2か所に手書きで並ぶだけで、
// 内部の版定数も検査も無かった（ズレても誰も気づかない状態）。
// 結合画像のファイル名をこのファイルへ置いたのを機に、他と同じ運用へ載せた。
const stitchVer = /STITCH_JS_VERSION = '([^']+)'/.exec(read('js/stitch.js'))[1];
console.log('     内部定数:  common.js=%s / core=%s / deck=%s / stitch=%s / css=%s', commonVer, coreVer, deckVer, stitchVer, cssVer);
for (const [p, pat, ver, name] of [
	['special.html', /js\/uma-skill-deck-core\.js\?v=([0-9a-z-]+)/g, coreVer, 'core.js'],
	['special.html', /js\/common\.js\?v=([0-9a-z-]+)/g, commonVer, 'common.js'],
	['exam.html', /js\/common\.js\?v=([0-9a-z-]+)/g, commonVer, 'common.js'],
	['special.html', /js\/stitch\.js\?v=([0-9a-z-]+)/g, stitchVer, 'stitch.js'],
	['exam.html', /js\/stitch\.js\?v=([0-9a-z-]+)/g, stitchVer, 'stitch.js'],
	['uma-skill-deck.html', /js\/uma-skill-deck-core\.js\?v=([0-9a-z-]+)/g, coreVer, 'core.js'],
	['uma-skill-deck.html', /js\/uma-skill-deck\.js\?v=([0-9a-z-]+)/g, deckVer, 'deck.js'],
	// special.html の引き出しパネルが読む iframe。deck.js の版に合わせている値だが、
	// HTMLの <script src> と違って目に付きにくく、実際に取り残されたことがある。
	['special.html', /uma-skill-deck\.html\?v=([0-9a-z-]+)/g, deckVer, '引き出しiframe'],
	// exam.html の引き出しパネルが読む iframe（DECK_PAGE_URL）。同じ決まりで deck.js の版に合わせる。
	['exam.html', /uma-skill-deck\.html\?v=([0-9a-z-]+)/g, deckVer, '引き出しiframe'],
]) {
	const q = [...read(p).matchAll(pat)].map((m) => m[1]);
	check(q.length === 1 && q[0] === ver, `${p} の ${name} の ?v= が ${ver}`, q);
}

/* --- 凍結中のファイル。不一致でも落とさず、警告として必ず一覧に出す ---
   index.html は C-1 で更新終了・凍結。?v= の更新対象から外れ続けた結果、
   実体（common.js の定数）とのズレが誰にも見えないまま残っていた（18セッション目に発見）。
   凍結中でも「ズレていること」は毎回見えるようにしておく。 */
for (const [p, pat, ver, name] of [
	['index.html', /js\/common\.js\?v=([0-9a-z-]+)/g, commonVer, 'common.js'],
]) {
	const q = [...read(p).matchAll(pat)].map((m) => m[1]);
	if (q.length === 1 && q[0] === ver) console.log(`[OK] ${p}（凍結中）の ${name} の ?v= が ${ver}`);
	else warn(`${p}（凍結中）の ${name} の ?v= が定数と違う`, { 読込: q, 定数: ver, 備考: '凍結を解くとき／common.js を次に変えるときに一緒に直す（D節）' });
}

/* --- 版の日付と逆行の検査（18セッション目に追加） ---
   3点一致は「定数と ?v= が揃っているか」しか見ないので、
   uma-skill-deck.js を前日の日付のまま `2026-09-11e` と採番する誤りが素通りした。
   (A) 変更したファイルの版の日付が当日か … 警告のみ。日付をまたぐ作業（23時台に変更して
       0時過ぎに commit）で不当に落とさないため。警告が出たら理由を報告に書く。
   (B) 版が逆行していないか … こちらは失敗させる。 */
const VERSIONED = [
	['js/common.js', commonVer, /COMMON_JS_VERSION = '([^']+)'/],
	['js/uma-skill-deck-core.js', coreVer, /UMA_SKILL_DECK_CORE_JS_VERSION = '([^']+)'/],
	['js/uma-skill-deck.js', deckVer, /UMA_SKILL_DECK_JS_VERSION = '([^']+)'/],
	['js/stitch.js', stitchVer, /STITCH_JS_VERSION = '([^']+)'/],
	['css/tokens.css', cssVer, /--common-css-version:\s*"([^"]+)"/],
];
const today = new Date().toLocaleDateString('sv-SE');  // ローカル時刻の YYYY-MM-DD
console.log('     版の日付の検査: 今日は %s', today);
for (const [p, ver, pat] of VERSIONED) {
	const changed = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', p], { cwd: REPO_ROOT }).status !== 0;
	const date = /^(\d{4}-\d{2}-\d{2})/.exec(ver);
	// (A) 変更したファイルだけ、版の日付が当日かを見る
	if (changed) {
		if (date && date[1] === today) console.log(`[OK] ${p} は変更あり。版の日付が当日（${ver}）`);
		else warn(`${p} は変更あるのに版の日付が当日でない`, { 版: ver, 今日: today, 備考: '日付をまたいだ作業なら問題なし。そうでなければ版を振り直す' });
	}
	// (B) HEAD の版より下がっていないか（日付をまたいで前日の連番を進める誤りは (A) で拾う）
	const headSrc = head(p);
	const m = headSrc ? pat.exec(headSrc) : null;
	if (m) check(ver >= m[1], `${p} の版が HEAD から逆行していない`, { HEAD: m[1], 作業ツリー: ver });
}

console.log('\n=== 2. 変更してはいけないファイル ===');
// 21セッション目: js/stitch.js の凍結を解いた（結合画像のファイル名をここに置いたため）。
// 代わりに §1 の3点一致の検査対象へ入れてある。js/common.js は凍結のまま
// （OCR・照合のレイヤーで役割が違ううえ、tests/skillset/ のハーネスが Node の vm で
//  そのまま評価しているので、localStorage に触るコードを持ち込まない）。
for (const p of ['index.html', 'js/common.js']) {
	const r = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', p], { cwd: REPO_ROOT });
	check(r.status === 0, p + ' が未変更');
}

/* 意図して消したセレクタ。ここに書いたものだけ「失われていない」検査を免除する。
   この検査は「事故で消した」を捕まえるためのものなので、意図的な削除は
   免除ではなく記録として1行ずつ残す（なぜ消えたのかを後から追えるようにする）。
   免除したものは実行のたびに [免除] として表示されるので、放置に気付ける。 */
const INTENTIONALLY_REMOVED = {
	// 2026-09-11: 7〜16セッション目ぶんを push したので、ここまでの免除は空に戻した。
	// この検査は git show HEAD: と作業ツリーを比べるので、commit が進めば免除は要らなくなる。
	// 残しておくと「本当の事故でその id が消えた」ときに見逃す口になる。
	// 過去に何を消したかは commit メッセージと HANDOFF に残っている。
	// 例: special の Deck保存パネル（F-27）／旧UIの告知一式（C-16）／
	//     exam の #stitch-drawer・#result-drawer-copy-slot（C-18 追加修正⑤⑦）／
	//     core.js の data-usd-edge ほか（F-28）。
};

console.log('\n=== 3. セレクタ資産（id / data-*）の保全 ===');
for (const p of TARGETS) {
	const b = head(p), a = read(p);
	const allow = new Set(INTENTIONALLY_REMOVED[p] || []);
	// 免除リストは id と data-* の両方に効かせる。JSが生成するマークアップでは、
	// 部品ごと作り替えたときに id ではなく data-* が消えることのほうが多いため。
	const gone = [...ids(b)].filter((x) => !ids(a).has(x)).concat([...datas(b)].filter((x) => !datas(a).has(x)));
	const excused = gone.filter((x) => allow.has(x));
	const lostId = gone.filter((x) => !allow.has(x) && !x.startsWith('data-'));
	const lostData = gone.filter((x) => !allow.has(x) && x.startsWith('data-'));
	if (excused.length > 0) console.log('     [免除] ' + p + ' の意図的に消したセレクタ(' + excused.length + '): ' + excused.join(' '));
	check(lostId.length === 0, p + ' の id が1つも失われていない', lostId);
	check(lostData.length === 0, p + ' の data-* が1つも失われていない', lostData);
}

console.log('\n=== 4. 消したclassがJSに掴まれていないか ===');
// classList/className は「JSが既に参照を持つ要素」にしか作用しないので同ページ内のみ危険。
// querySelector 系は文書全体を探すのでファイル横断で危険。
const SIBLINGS = {
	'special.html': ['special.html', 'js/common.js', 'js/uma-skill-deck-core.js', 'js/stitch.js'],
	'exam.html': ['exam.html', 'js/common.js', 'js/stitch.js'],
	'uma-skill-deck.html': ['uma-skill-deck.html', 'js/uma-skill-deck.js', 'js/uma-skill-deck-core.js'],
	'js/uma-skill-deck-core.js': ['js/uma-skill-deck-core.js'],
	'js/uma-skill-deck.js': ['js/uma-skill-deck.js'],
};
const queryAll = grabQuery(ALL_JS.map(read));
for (const [p, sources] of Object.entries(SIBLINGS)) {
	const before = classes(head(p)), after = classes(read(p));
	const removed = [...before].filter((c) => !after.has(c));
	const local = grabLocal(sources.map(read));
	check(removed.filter((c) => local.has(c)).length === 0,
		p + ': 消したclassを同ページのJSが付け外ししていない', removed.filter((c) => local.has(c)));
	check(removed.filter((c) => queryAll.has(c)).length === 0,
		p + ': 消したclassが文書全体検索のセレクタに使われていない', removed.filter((c) => queryAll.has(c)));
	if (removed.length) console.log('     [参考] %s で消えたclass(%d): %s', p, removed.length, removed.sort().join(' '));
}

console.log('\n=== 5. JS構文チェック ===');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'umacheck-'));
for (const p of ['special.html', 'exam.html', 'uma-skill-deck.html', 'css/styleguide.html']) {
	const blocks = [...read(p).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
	console.log('     %s: <script>ブロック %d件', p, blocks.length);
	blocks.forEach((b, i) => {
		const fn = path.join(tmp, `${p.replace(/[\/.]/g, '_')}_${i}.js`);
		fs.writeFileSync(fn, b, 'utf8');
		const r = spawnSync(process.execPath, ['--check', fn], { encoding: 'utf8' });
		check(r.status === 0, `${p} の<script>#${i} が構文エラーなし`, (r.stderr || '').slice(0, 160));
	});
}
for (const p of ['js/uma-skill-deck-core.js', 'js/uma-skill-deck.js', 'js/common.js', 'js/stitch.js']) {
	const r = spawnSync(process.execPath, ['--check', path.join(REPO_ROOT, p)], { encoding: 'utf8' });
	check(r.status === 0, p + ' が構文エラーなし', (r.stderr || '').slice(0, 160));
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n=== 6. 共通CSSの !important（詳細度で解決する方針） ===');
const impLines = (src) => src.split('\n').filter((l) => /[a-z-]+\s*:[^;{}]*!important/.test(l)).map((l) => l.trim());
const imp = impLines(css);
imp.forEach((l) => console.log('       ' + l));
check(imp.length <= 1, 'common.css の !important は prefers-reduced-motion の1件のみ', imp.length);
check(impLines(read('css/tokens.css')).length === 0, 'tokens.css に !important が無い');
// shell.css は display:flex を持つ箱を hidden 属性で確実に消すための [hidden] と、
// prefers-reduced-motion の中（transition / animation / transition-delay を止める）だけに限る（F-13）。
{
	const lines = read('css/shell.css').split('\n');
	let inReduce = false, depth = 0;
	const stray = [];
	for (const raw of lines) {
		const l = raw.trim();
		if (/^@media\s*\(prefers-reduced-motion/.test(l)) { inReduce = true; depth = 0; }
		if (inReduce) { depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length; }
		if (/[a-z-]+\s*:[^;{}]*!important/.test(l) && !/\[hidden\]/.test(l) && !inReduce) stray.push(l);
		if (inReduce && depth <= 0 && /\}/.test(l)) inReduce = false;
	}
	check(stray.length === 0, 'shell.css の !important は [hidden] と prefers-reduced-motion の中に限る', stray);
}

if (warnings.length > 0) {
	console.log('\n=== 警告（検査は落とさないが、放置しないこと。' + warnings.length + '件） ===');
	warnings.forEach((w) => console.log('  ・' + w));
}
console.log('\n' + (ok ? '=== 総合: OK ===' : '=== 総合: NG（上の[NG]を確認） ==='));
process.exit(ok ? 0 : 1);
