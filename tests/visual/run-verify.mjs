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
function check(cond, label, detail) {
	if (!cond) ok = false;
	console.log((cond ? '[OK] ' : '[NG] ') + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
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
const TARGETS = ['special.html', 'uma-skill-deck.html', 'js/uma-skill-deck-core.js', 'js/uma-skill-deck.js'];

console.log('=== 1. バージョン文字列の整合 ===');
const css = read('css/common.css');
const cssVer = /--common-css-version:\s*"([^"]+)"/.exec(css)[1];
check(!!cssVer, 'css/common.css に --common-css-version がある', cssVer);

for (const p of ['special.html', 'uma-skill-deck.html', 'css/styleguide.html']) {
	const q = [...read(p).matchAll(/common\.css\?v=([0-9a-z-]+)/g)].map((m) => m[1]);
	check(q.length === 1 && q[0] === cssVer, p + ' の ?v= が定数と一致', q);
}
for (const p of ['special.html', 'js/uma-skill-deck.js']) {
	const e = [...read(p).matchAll(/EXPECTED_COMMON_CSS_VERSION\s*=\s*'([^']+)'/g)].map((m) => m[1]);
	check(e.length === 1 && e[0] === cssVer, p + ' の EXPECTED_COMMON_CSS_VERSION が定数と一致', e);
}
const coreVer = /UMA_SKILL_DECK_CORE_JS_VERSION = '([^']+)'/.exec(read('js/uma-skill-deck-core.js'))[1];
const deckVer = /UMA_SKILL_DECK_JS_VERSION = '([^']+)'/.exec(read('js/uma-skill-deck.js'))[1];
const commonVer = /COMMON_JS_VERSION = '([^']+)'/.exec(read('js/common.js'))[1];
console.log('     内部定数:  common.js=%s / core=%s / deck=%s / css=%s', commonVer, coreVer, deckVer, cssVer);
for (const [p, pat, ver, name] of [
	['special.html', /js\/uma-skill-deck-core\.js\?v=([0-9a-z-]+)/g, coreVer, 'core.js'],
	['special.html', /js\/common\.js\?v=([0-9a-z-]+)/g, commonVer, 'common.js'],
	['uma-skill-deck.html', /js\/uma-skill-deck-core\.js\?v=([0-9a-z-]+)/g, coreVer, 'core.js'],
	['uma-skill-deck.html', /js\/uma-skill-deck\.js\?v=([0-9a-z-]+)/g, deckVer, 'deck.js'],
	// special.html の引き出しパネルが読む iframe。deck.js の版に合わせている値だが、
	// HTMLの <script src> と違って目に付きにくく、実際に取り残されたことがある。
	['special.html', /uma-skill-deck\.html\?v=([0-9a-z-]+)/g, deckVer, '引き出しiframe'],
]) {
	const q = [...read(p).matchAll(pat)].map((m) => m[1]);
	check(q.length === 1 && q[0] === ver, `${p} の ${name} の ?v= が ${ver}`, q);
}

console.log('\n=== 2. 変更してはいけないファイル ===');
for (const p of ['index.html', 'exam.html', 'js/common.js', 'js/stitch.js']) {
	const r = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', p], { cwd: REPO_ROOT });
	check(r.status === 0, p + ' が未変更');
}

/* 意図して消したセレクタ。ここに書いたものだけ「失われていない」検査を免除する。
   この検査は「事故で消した」を捕まえるためのものなので、意図的な削除は
   免除ではなく記録として1行ずつ残す（なぜ消えたのかを後から追えるようにする）。
   免除したものは実行のたびに [免除] として表示されるので、放置に気付ける。 */
const INTENTIONALLY_REMOVED = {
	'special.html': [
		// 12セッション目: Deck保存パネルをDeck側の「読み込む」導線に一本化して削除（F-27）
		'deck-save-wrap', 'deck-record-select', 'deck-new-record-name',
		'deck-assign-rows', 'deck-save-note', 'deck-save-btn',
		// 12セッション目: 引き出しが3つになり、背景の暗転を1枚（#drawer-backdrop）に集約した
		'deck-drawer-backdrop',
	],
	'js/uma-skill-deck-core.js': [
		// 13セッション目: 8軸すべてが常に見える形（1行 or 角丸ボタンの多段）にしたので、
		// タブバーの横スクロールと「最初へ/最後へ」ボタンごと不要になった（F-28）
		'data-usd-edge', 'data-more-left', 'data-more-right',
	],
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
for (const p of ['special.html', 'uma-skill-deck.html', 'css/styleguide.html']) {
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

console.log('\n=== 6. common.css の !important（詳細度で解決する方針） ===');
const imp = css.split('\n').filter((l) => /[a-z-]+\s*:[^;{}]*!important/.test(l)).map((l) => l.trim());
imp.forEach((l) => console.log('       ' + l));
check(imp.length <= 1, 'common.css の !important は prefers-reduced-motion の1件のみ', imp.length);

console.log('\n' + (ok ? '=== 総合: OK ===' : '=== 総合: NG（上の[NG]を確認） ==='));
process.exit(ok ? 0 : 1);
