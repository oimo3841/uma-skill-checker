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

const ALL_JS = ['special.html', 'uma-skill-deck.html', 'exam.html', 'index.html', 'card-event-input.html',
	'js/common.js', 'js/uma-skill-deck-core.js', 'js/uma-skill-deck.js', 'js/stitch.js', 'js/skillset-cards.js', 'js/skillset-ocr.js'];
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
	// Deck は帯のタブ（.uma-subtabs。C-54）が shell.css にあるので、55セッション目から shell も読む
	'uma-skill-deck.html': ['tokens', 'common', 'shell'],
	'css/styleguide.html': ['tokens', 'common'],
	// 作業用ページ（C-50）。ツール本体には組み込まないが、共通CSSを読むので同じ運用に載せる。
	'card-event-input.html': ['tokens', 'common'],
	// exam.html は 59セッション目（段1）から common.css も読む。ボタンを共通部品（.uma-btn）に
	// 置き換えるため。食い違うのは .glass-card の余白（狭い画面の 4px）だけで、それは exam の
	// <style> で戻してある（exam.html の <head> のコメント参照）
	'exam.html': ['tokens', 'common', 'shell'],
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
// 28セッション目（スキルセットOCR フェーズa コミット1）: tests/skillset/lib/ から js/ へ移した
// skillset-cards.js を、他の共有JSと同じ「定数と ?v= の3点一致」の運用に載せた。
// 読むのは special.html だけ（Deck 単体ページへの入口は後続フェーズ。そのとき JS の中から
// 動的に読む ?v= を走査対象に足す＝C-24 調査3）。
const skillsetVer = /SKILLSET_CARDS_JS_VERSION = '([^']+)'/.exec(read('js/skillset-cards.js'))[1];
// コミット2: 読み取りの本体 js/skillset-ocr.js も同じ運用（special.html だけが読む）。
const skillsetOcrVer = /SKILLSET_OCR_JS_VERSION = '([^']+)'/.exec(read('js/skillset-ocr.js'))[1];
console.log('     内部定数:  common.js=%s / core=%s / deck=%s / stitch=%s / skillset-cards=%s / skillset-ocr=%s / css=%s', commonVer, coreVer, deckVer, stitchVer, skillsetVer, skillsetOcrVer, cssVer);
for (const [p, pat, ver, name] of [
	['special.html', /js\/uma-skill-deck-core\.js\?v=([0-9a-z-]+)/g, coreVer, 'core.js'],
	['special.html', /js\/common\.js\?v=([0-9a-z-]+)/g, commonVer, 'common.js'],
	['exam.html', /js\/common\.js\?v=([0-9a-z-]+)/g, commonVer, 'common.js'],
	['special.html', /js\/stitch\.js\?v=([0-9a-z-]+)/g, stitchVer, 'stitch.js'],
	['exam.html', /js\/stitch\.js\?v=([0-9a-z-]+)/g, stitchVer, 'stitch.js'],
	['special.html', /js\/skillset-cards\.js\?v=([0-9a-z-]+)/g, skillsetVer, 'skillset-cards.js'],
	['special.html', /js\/skillset-ocr\.js\?v=([0-9a-z-]+)/g, skillsetOcrVer, 'skillset-ocr.js'],
	['uma-skill-deck.html', /js\/uma-skill-deck-core\.js\?v=([0-9a-z-]+)/g, coreVer, 'core.js'],
	['card-event-input.html', /js\/uma-skill-deck-core\.js\?v=([0-9a-z-]+)/g, coreVer, 'core.js'],
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
	['js/skillset-cards.js', skillsetVer, /SKILLSET_CARDS_JS_VERSION = '([^']+)'/],
	['js/skillset-ocr.js', skillsetOcrVer, /SKILLSET_OCR_JS_VERSION = '([^']+)'/],
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
	// 2026-09-15（43セッション目）: 閉じた丸ボタンの未読を「周りに並べて1周回る丸」から
	// 「右上に赤い丸1つ」へ変えたので #fab-orbit / data-orbit を消した（代わりに #fab-unseen-dot）。
	// commit が進んだので免除は空に戻した（下の 2026-09-11 の申し送りと同じ扱い）。
	// 2026-09-15: exam のヘッダーの見出しから可変の種数 #header-skill-count を消した
	// （見出しは「技能試験で有利な登録済み対象スキル」に。範囲を選べるようになって
	// 見出しの数が利用者の選択で変わるため。いまの種数は #step1-skill-badge と
	// #registry-skill-count が出す）。`ef37313` を push したので免除は空に戻す。
	// 2026-09-15: exam の「対象スキルのカスタム設定（追加・除外）」の一式
	// （#custom-skills-badge・#custom-add-textarea・#custom-add-status・#custom-added-list・
	//   #custom-remove-textarea・#custom-remove-status・#custom-removed-list）と、
	// 説明文の可変の種数 #step1-skill-count-inline を消した。1件ずつ足す／外す仕組みは
	// 「対象スキルの範囲」（既定／広げる／絞る）とシナリオ因子の個別選択に一本化した。
	// commit が進んだので免除は空に戻す（下の 2026-09-11 の申し送りと同じ扱い）。
	// 2026-09-11: 7〜16セッション目ぶんを push したので、ここまでの免除は空に戻した。
	// この検査は git show HEAD: と作業ツリーを比べるので、commit が進めば免除は要らなくなる。
	// 残しておくと「本当の事故でその id が消えた」ときに見逃す口になる。
	// 過去に何を消したかは commit メッセージと HANDOFF に残っている。
	// 例: special の Deck保存パネル（F-27）／旧UIの告知一式（C-16）／
	//     exam の #stitch-drawer・#result-drawer-copy-slot（C-18 追加修正⑤⑦）／
	//     core.js の data-usd-edge ほか（F-28）／
	//     special の #deck-ocr-entry・#deck-ocr-btn（スキルセットOCRの入口を core の編集画面へ移した。
	//     `083ad76`・F-43。commit が進んだので 2026-09-14 のコミット5で免除を消した）。
	// 2026-09-18（54セッション目）: special の Deck連携モードで、Step 1 の <details id="deck-roster"> を
	// ①のタブ（#step-tab-0 / #step-panel-0）に組み替えたので #deck-roster を消した（C-51 の11節①）。
	// 編成パネルの置き場 #deck-roster-panel はそのまま。`f718473` に commit したので免除は空に戻した。
	// 2026-09-18（55セッション目・C-53／C-54）: 親A／親Bセットを帯のタブにしたので「＋ 親Bセットも追加する」
	// （#setb-toggle-btn / #setb-toggle-label）を消した。core.js は、テンプレート一覧のラジオ（value="' + esc(t.templateId) + '"
	// が id の検査に引っかかっていたもの）と data-template-id、編成のタブの data-roster-id が、共有部品の帯のタブ
	// （data-tab-id）に置き換わって消えた。`d3332e8` に commit したので免除は空に戻した。
	// 2026-09-18（58セッション目・C-58）: 分類の印を金銀銅の★から競馬の印（◎○▲）へ変え、形を
	// core.js の tiers.markHtml() が返す SVG 1か所で決めるようにしたので、special.html から
	// data-tier の直書き（照合結果の表で ★ を出していた span）が消えた。印そのものは
	// core.js が同じ data-tier を付けて出すので、画面から無くなったわけではない。
	// 2026-09-18（61セッション目・C-62 の (4)）: 「αテスト」の赤いラベルを押して注記を開く形をやめ、
	// 注記を常時表示に戻したので、開閉のボタン #deck-roster-alpha-btn を消した。注記そのもの
	// （#deck-roster-alpha）は残っていて、hidden を外して常時出している。
	// 2026-09-19（62セッション目・C-63 の (3)）: ①の「?」（説明）を入口ごと削除したので
	// #deck-roster-help-btn と #deck-roster-help が消えた。中身は「選ぶと…得られるスキルが
	// 分かります」という、下の表を見れば分かることの言い換えだった。使い方は「使い方ガイド」にある。
	// （#deck-roster-alpha-btn は `748aa64` に commit したので免除から外した。）
	'special.html': ['data-tier', 'deck-roster-help-btn', 'deck-roster-help'],
	// 2026-09-19（64セッション目・段D）: exam のシナリオ因子を24種の個別選択から
	// **総括チェック1つ**（#scenario-factors-all）へ変えたので、開閉のパネル
	// （#scenario-factors-details）・選んだ件数のバッジ（#scenario-factors-badge）・
	// 「すべて解除」（#scenario-factors-clear）・24件の入れ物（#scenario-factor-list）が消えた。
	// 種数の #scenario-factors-count は新しいチェックの中に残っている。
	// `' + id + '` は、24件を組み立てていた文字列連結（id="' + id + '"）を
	// この検査が id と読んでいたもの（core.js の value="' + esc(...) + '" と同じ引っかかり方）。
	// `64fe133` に commit したので免除は空に戻した。
	// 2026-09-20（65セッション目・C-2c）: ②の B・C を**1行に畳んだ**ので、C-2a で入れた
	// 折りたたみの節（見出しのボタン data-usd-act="scope-toggle" と、中身の入れ物の
	// id="usd-scope-body-<key>"）が消えた。`' + bodyId + '` は、その id を組み立てていた
	// 文字列連結（id="' + bodyId + '"）をこの検査が id と読んでいたもの
	// （段D の `' + id + '` と同じ引っかかり方）。
	// チェックそのもの（data-usd-act="scope-check"）と節の入れ物（data-usd-scope-section）は残っている。
	// `ed0eaf2` に commit したので免除は空に戻した（残すと本当の事故を見逃す口になる）。
	// 2026-09-20（66セッション目・段F-0）: exam の「対象スキルの範囲」の箱の最下段にあった
	// #target-scope-note（「ここで選んだ内容はこのブラウザに保存され、次回も使われます。
	// 変えたあとは、もう一度判定してください。」）を消した。**3択とシナリオ因子の両方に
	// かかる注記**だったが、後半は refreshAfterTargetChange() のトーストが
	// 「結果が出ているときだけ」というより正確な条件で言っており、前半は次に開けば分かる
	// 性質の説明で、常時1行を使う価値が薄いという判断（おいもさん）。
	// `04225b6` に commit したので免除は空に戻した（残すと本当の事故を見逃す口になる）。
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
// card-event-input.html は 63セッション目（段2）に足した。作業用ページだが中身は素の JS で、
// 画面が2つになってスクリプトが伸びたので、他のページと同じく構文だけは見る
// （C-50 のときは ALL_JS には入れたが、この一覧に入れ忘れていた）。
for (const p of ['special.html', 'exam.html', 'uma-skill-deck.html', 'css/styleguide.html', 'card-event-input.html']) {
	const blocks = [...read(p).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
	console.log('     %s: <script>ブロック %d件', p, blocks.length);
	blocks.forEach((b, i) => {
		const fn = path.join(tmp, `${p.replace(/[\/.]/g, '_')}_${i}.js`);
		fs.writeFileSync(fn, b, 'utf8');
		const r = spawnSync(process.execPath, ['--check', fn], { encoding: 'utf8' });
		check(r.status === 0, `${p} の<script>#${i} が構文エラーなし`, (r.stderr || '').slice(0, 160));
	});
}
for (const p of ['js/uma-skill-deck-core.js', 'js/uma-skill-deck.js', 'js/common.js', 'js/stitch.js', 'js/skillset-cards.js', 'js/skillset-ocr.js']) {
	const r = spawnSync(process.execPath, ['--check', path.join(REPO_ROOT, p)], { encoding: 'utf8' });
	check(r.status === 0, p + ' が構文エラーなし', (r.stderr || '').slice(0, 160));
}
fs.rmSync(tmp, { recursive: true, force: true });

/* ------------------------------------------------------------
 * 5-2. special と exam で同じであるべき文言（59セッション目・段1）
 *
 * 結合の注記は、それまで special が「1人分が1枚だけならエラー」、exam が「枚数が多いほど
 * 時間がかかる」と、互いに相手の注意が抜けていた。両方に両方を書いて揃えたので、
 * **片方だけ直すと落ちる**ようにしておく（見た目の検査ではないのでここで見る）。
 * ------------------------------------------------------------ */
{
	const noteOf = (p) => {
		const m = /<p class="mt-1\.5 text-\[11px\] text-slate-400 text-center">(※画像結合は、[^<]*)<\/p>/.exec(read(p));
		return m ? m[1] : null;
	};
	const sp = noteOf('special.html');
	const ex = noteOf('exam.html');
	check(sp !== null && sp === ex, '結合の注記が special と exam で同じ文面', { special: sp, exam: ex });
	check(sp !== null && sp.includes('1枚だけのときはエラー') && sp.includes('時間がかかります'),
		'結合の注記に「1枚だけならエラー」と「枚数が多いほど時間がかかる」の両方がある', sp);
}

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

console.log('\n=== 7. 個人情報の混入（公開リポジトリ） ===');
// このリポジトリは公開で、GitHub Pages で配信している。22セッション目に全履歴を人手で監査して
// 混入0件を確認したが、人手では毎回はできないので機械化した。**ここが落ちたら push しない。**
// 実体は tests/privacy/check-privacy.mjs（npm run check:privacy で単体でも回せる）。
{
	const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'tests/privacy/check-privacy.mjs')], {
		cwd: REPO_ROOT, encoding: 'utf8',
	});
	// 走査の明細は、落ちたときだけ全部出す（通るときは要約の行だけで足りる）
	const out = (r.stdout || '').trimEnd();
	if (r.status === 0) out.split('\n').filter((l) => /^(\s{5}|\[OK\])/.test(l)).forEach((l) => console.log(l));
	else console.log(out);
	if (r.stderr) console.log(r.stderr.trimEnd());
	check(r.status === 0, '追跡中のファイルに個人情報の混入が無い');
}

console.log('\n=== 8. 恒久ルールの2か所の一致 ===');
// 恒久ルールは同じ全文が2か所にある（リポジトリ直下の CLAUDE.md と同期フォルダの CLAUDE-RULES.md）。
// 弱点は「2か所にあること」ではなく「コピーし忘れても誰も気づかないこと」なので、気づける形にした。
// 実体は tests/rules/check-rules-sync.mjs（npm run check:rules で単体でも回せる）。
// 警告どまりにするもの（改行コードだけの違い・同期フォルダが見えない・パス未設定）は
// あちら側で判断し、ここでは終了コードだけを見る。警告の行はそのまま出す。
{
	const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'tests/rules/check-rules-sync.mjs')], {
		cwd: REPO_ROOT, encoding: 'utf8',
	});
	const out = (r.stdout || '').trimEnd();
	for (const l of out.split('\n')) {
		if (/^=== /.test(l) || l === '') continue;
		if (l.startsWith('[警告] ')) warn(l.slice('[警告] '.length));
		else console.log(l);
	}
	if (r.stderr) console.log(r.stderr.trimEnd());
	// 終了コードは3値（0=一致を確認した / 1=落とす / 2=確かめられなかった）。
	// 2 のときに [OK] 一致 と出すと嘘になるので、言い方を分ける。
	if (r.status === 2) console.log('[--] 一致は確認できていない（上の警告のとおり。検査は落とさない）');
	else check(r.status === 0, 'CLAUDE.md と CLAUDE-RULES.md が同じ内容');
}

console.log('\n=== 9. push の関門が効いているか ===');
// .githooks/pre-push が push のたびにルール11の条件を確かめる。ただし core.hooksPath は
// ローカル設定なので、clone し直すと黙って外れる（＝関門が消えても誰も気づかない）。
// ここで毎回見ることで、外れていれば検査のたびに分かる。設定は npm install が行う。
{
	const r = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: REPO_ROOT, encoding: 'utf8' });
	const hooksPath = (r.stdout || '').trim();
	check(hooksPath === '.githooks',
		'core.hooksPath が .githooks を指している（外れていたら npm install で直る）',
		hooksPath || '(未設定)');
	const hook = path.join(REPO_ROOT, '.githooks', 'pre-push');
	const exists = fs.existsSync(hook);
	check(exists, '.githooks/pre-push がある');
	if (exists) {
		const src = fs.readFileSync(hook, 'utf8');
		// 中身の検査はしない（フックの書き方は変わりうる）。空でないことと、
		// 関門の本体である test:verify を呼んでいることだけ見る。
		check(src.includes('test:verify'), '.githooks/pre-push が test:verify を呼んでいる');
	}
}

console.log('\n=== 10. 収録データ（catalog-data/）の形 ===');
// catalog-data/ の6ファイル（拡張スキル・育成ウマ娘・サポートカード・イベントスキル・シナリオ因子・遺伝子）は
// おいもさんが用意し、手でも書き足す。中の id は保存済みの比較シートが指す鍵なので、
// 形の崩れがそのまま利用者のデータの崩れになる。件数が多くて目では見切れないので機械で見る。
// 実体は tests/catalog/check-catalog.mjs（npm run check:catalog で単体でも回せる）。
{
	const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'tests/catalog/check-catalog.mjs')], {
		cwd: REPO_ROOT, encoding: 'utf8',
	});
	const out = (r.stdout || '').trimEnd();
	for (const l of out.split('\n')) {
		if (/^=== /.test(l) || l === '') continue;
		if (l.startsWith('[警告] ')) warn(l.slice('[警告] '.length));
		else if (/^\[NG\]/.test(l)) console.log(l);
		else if (/^\s{5}/.test(l)) console.log(l);
	}
	if (r.stderr) console.log(r.stderr.trimEnd());
	check(r.status === 0, 'catalog-data/ の6ファイルが決めた形どおり');
}

if (warnings.length > 0) {
	console.log('\n=== 警告（検査は落とさないが、放置しないこと。' + warnings.length + '件） ===');
	warnings.forEach((w) => console.log('  ・' + w));
}
console.log('\n' + (ok ? '=== 総合: OK ===' : '=== 総合: NG（上の[NG]を確認） ==='));
process.exit(ok ? 0 : 1);
