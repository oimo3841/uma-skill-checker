// 追跡中の全ファイルを走査して、個人情報の混入を検出する。
//
//   npm run check:privacy        … 単体で回す
//   npm run test:verify          … 納品前チェックの §7 からも呼ばれる
//
// ■ なぜ要るか
//   このリポジトリは**公開**（GitHub Pages で配信中）。22セッション目に人手で全履歴を監査し、
//   混入は0件（コミットのメールアドレスを除く）と確認したが、人手の監査は毎回はできない。
//   **push を止められる形で機械化する**のがこのスクリプト。
//
// ■ 偽陽性を出さないための設計（ここが肝）
//   人手の監査では、部分一致に頼ったせいで `confu`（`CHAR_CONFUSION_MAP` 等）で164件、
//   `token`（デザイントークン）で457件の偽陽性が出た。**警告が出たら push を止める仕組みなので、
//   偽陽性が出る設計では機能しない**（狼少年になって誰も見なくなる）。そこで:
//
//   1. **ユーザー名・端末名・単語の部分一致は一切見ない。** 見るのは「その形でしか現れないもの」だけ。
//      具体的には、パスの区切り記号を含む形（`\Users\` `/home/`）、ドライブ文字＋`\`、
//      メールアドレスの `@` とTLD、素材フォルダの root パスの**完全一致**。
//   2. ドライブ文字は**直前が英数字・アンダースコアでないこと**を必須にする。
//      これが無いと `GOLD_MIN_G: 150` や `TAB_GREEN_MIN_G: 140` が `G:` として当たる（実測）。
//   3. それでも避けられない例外は **allowlist.json に理由つきで登録**する。黙って除外しない。
//      免除したものは実行のたびに [免除] として出るので、放置に気付ける。
//
// ■ 絶対パスをこのファイルに書かない（B節ルール「絶対パスを書かない」）
//   素材フォルダの root は `.skillset-assets.json`（.gitignore 済み・追跡対象外）から**実行時に読む**。
//   このファイルにも allowlist.json にも、実際のパスは1文字も書かない。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ALLOWLIST = path.join(__dirname, 'allowlist.json');

let ng = 0;
let exempted = 0;
const lines = [];
const say = (s) => { console.log(s); lines.push(s); };

/* ───────────────────────── 許可リスト ───────────────────────── */

const allow = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
for (const e of allow.exceptions || []) {
	if (!e.reason || !e.file || !e.rule || e.match === undefined) {
		console.error(`allowlist.json の exceptions に file / rule / match / reason が揃っていない項目があります: ${JSON.stringify(e)}`);
		process.exit(2);
	}
}

/**
 * 許可するメールアドレス。
 * **実アドレスをこのリポジトリに書かない**ため、コミットの author / committer に実際に
 * 使われているアドレスは git から実行時に取る（＝すでにコミットのメタデータとして公開済みで、
 * 公開されていて問題ないと判断済みのもの）。それ以外は allowlist.json に列挙する。
 */
function allowedEmails() {
	const set = new Set((allow.allowedEmails || []).map((x) => String(x.address).toLowerCase()));
	if (allow.allowCommitAuthors !== false) {
		const r = spawnSync('git', ['log', '--all', '--format=%ae%n%ce'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
		if (r.status === 0) String(r.stdout).split('\n').forEach((a) => { if (a.trim()) set.add(a.trim().toLowerCase()); });
		const c = spawnSync('git', ['config', 'user.email'], { cwd: REPO_ROOT, encoding: 'utf8' });
		if (c.status === 0 && c.stdout.trim()) set.add(c.stdout.trim().toLowerCase());
	}
	return set;
}

/* ───────────────────────── 検査するもの ───────────────────────── */

/**
 * 素材フォルダの root。無ければその検査だけ飛ばす（新しく clone した環境・CI を想定）。
 * 探す順序は tests/skillset/lib/assets.mjs の `assetsRoot()` と同じ（環境変数 → 設定ファイル）。
 * あちらを import しないのは、あちらがフォルダの実在まで確かめて例外を投げるため
 * （素材フォルダが無い環境でも、この検査だけは回せるようにしておきたい）。
 */
function assetsRootOrNull() {
	const fromEnv = process.env.UMA_SKILLSET_ASSETS;
	if (fromEnv && fromEnv.trim()) return fromEnv.trim();
	const f = path.join(REPO_ROOT, '.skillset-assets.json');
	if (!fs.existsSync(f)) return null;
	try {
		const j = JSON.parse(fs.readFileSync(f, 'utf8'));
		return j && j.root ? String(j.root) : null;
	} catch {
		return null;
	}
}

/** パスの形でしか現れない並び。単語の部分一致は入れない。 */
function pathRules() {
	// 「マイドライブ」はこのファイル自身に書くと自分で検出してしまうので、分割して組み立てる。
	const myDrive = '\u30DE\u30A4' + '\u30C9\u30E9\u30A4\u30D6'; // マイドライブ
	return [
		{
			id: 'win-users',
			label: 'Windows のユーザーフォルダ（\\Users\\）',
			re: new RegExp('\\\\' + 'Users' + '\\\\', 'g'),
		},
		{
			id: 'win-drive',
			label: 'Windows のドライブ文字（X:\\）',
			// 直前が英数字・アンダースコアでないことを必須にする。
			// これが無いと `GOLD_MIN_G: 150` の `G:` のような定数名が当たる（実測で誤検出した）。
			re: new RegExp('(?<![A-Za-z0-9_])[A-Za-z]:' + '\\\\', 'g'),
		},
		{
			id: 'unix-users',
			label: 'Unix/macOS のユーザーフォルダ（/Users/）',
			// Windows 側の `C:/Users/...` もこの形で引っかかる
			re: /\/Users\//g,
		},
		{
			id: 'unix-home',
			label: 'Unix のホーム（/home/）',
			re: /\/home\//g,
		},
		{
			id: 'mydrive',
			label: 'Google ドライブの同期フォルダ名',
			re: new RegExp(myDrive, 'g'),
		},
	];
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * この検査自身のファイルは、**パスの形の検査だけ**対象外にする。
 * パターンの定義そのもの（`check-privacy.mjs`）、その免除の記録（`allowlist.json`）、
 * 何を見ているかの説明（`README.md`）を持つため、構造上必ず当たるから。
 *
 * **メールアドレスと素材フォルダの root の検査は、この3ファイルにも等しく効かせる**
 * （「検査の中に実パスを書いてしまった」を捕まえるのがいちばん大事なので、そこは外さない）。
 * 対象外にしていることは実行のたびに出力する（黙って除外しない）。
 */
const SELF = new Set([
	'tests/privacy/check-privacy.mjs',
	'tests/privacy/allowlist.json',
	'tests/privacy/README.md',
]);

/* ───────────────────────── 走査 ───────────────────────── */

function trackedFiles() {
	const r = spawnSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (r.status !== 0) {
		console.error('git ls-files に失敗しました。リポジトリの中で実行してください。');
		process.exit(2);
	}
	return r.stdout.split('\0').filter(Boolean);
}

function isExempt(file, rule, match) {
	return (allow.exceptions || []).some((e) => e.file === file && e.rule === rule && e.match === match);
}

const files = trackedFiles();
const rules = pathRules();
const emails = allowedEmails();
const root = assetsRootOrNull();
// root は区切り文字の違いと大文字小文字の違いを吸収して比べる（Windows のパスは大小を区別しない）
const rootVariants = root
	? [...new Set([root, root.replace(/\\/g, '/'), root.replace(/\//g, '\\')])].map((s) => s.toLowerCase())
	: [];
const rootBase = root ? path.basename(root.replace(/[\\/]+$/, '')).toLowerCase() : null;

say('=== 個人情報の走査（追跡中のファイル ' + files.length + '件） ===');
say('     検査: ' + rules.map((r) => r.label).join(' / ') + ' / メールアドレス / 素材フォルダの root');
const rootFrom = process.env.UMA_SKILLSET_ASSETS && process.env.UMA_SKILLSET_ASSETS.trim()
	? '環境変数 UMA_SKILLSET_ASSETS'
	: '.skillset-assets.json';
say('     素材フォルダの root: ' + (root ? `${rootFrom} から取得（値はここには出さない）` : '未設定のためこの検査は省略'));
say('     パスの形の検査だけ対象外: ' + [...SELF].join(' / '));
say('       （検査の定義・免除の記録・説明そのものなので構造上必ず当たる。メールアドレスと root の検査は効かせている）');

const hits = [];
let scanned = 0;
let skippedBinary = 0;

for (const file of files) {
	const abs = path.join(REPO_ROOT, file);
	if (!fs.existsSync(abs)) continue; // 追跡されているが作業ツリーに無い（削除途中）
	const buf = fs.readFileSync(abs);
	if (buf.includes(0)) { skippedBinary++; continue; }
	const text = buf.toString('utf8');
	scanned++;
	const self = SELF.has(file.split(path.sep).join('/'));
	const src = text.split('\n');

	const push = (rule, match, lineNo, line) => {
		if (isExempt(file, rule, match)) { exempted++; say(`     [免除] ${file}:${lineNo} ${rule} ${JSON.stringify(match)}`); return; }
		hits.push({ file, line: lineNo, rule, match, text: line.trim().slice(0, 160) });
	};

	// 1) パスの形（自分自身の2ファイルは対象外。理由は SELF の説明）
	if (!self) {
		for (const rule of rules) {
			for (let i = 0; i < src.length; i++) {
				rule.re.lastIndex = 0;
				let m;
				while ((m = rule.re.exec(src[i])) !== null) push(rule.id, m[0], i + 1, src[i]);
			}
		}
	}

	// 2) メールアドレス（全ファイル。許可リストにあるものは出さない）
	for (let i = 0; i < src.length; i++) {
		EMAIL_RE.lastIndex = 0;
		let m;
		while ((m = EMAIL_RE.exec(src[i])) !== null) {
			if (emails.has(m[0].toLowerCase())) continue;
			push('email', m[0], i + 1, src[i]);
		}
	}

	// 3) 素材フォルダの root そのもの（全ファイル）
	if (rootVariants.length) {
		const lower = text.toLowerCase();
		if (rootVariants.some((v) => lower.includes(v))) {
			const i = src.findIndex((l) => rootVariants.some((v) => l.toLowerCase().includes(v)));
			push('assets-root', '(素材フォルダの絶対パス)', i + 1, '(値は出力しない)');
		} else if (rootBase && rootBase.length >= 4 && lower.includes(rootBase)) {
			const i = src.findIndex((l) => l.toLowerCase().includes(rootBase));
			push('assets-root-name', '(素材フォルダ名)', i + 1, '(値は出力しない)');
		}
	}
}

say(`     走査 ${scanned}件 / バイナリのため飛ばした ${skippedBinary}件`);

/* ───────────────────────── .skillset-assets.json が追跡されていないこと ───────────────────────── */

const tracked = new Set(files.map((f) => f.split(path.sep).join('/')));
const configTracked = tracked.has('.skillset-assets.json');
if (configTracked) {
	ng++;
	say('[NG] .skillset-assets.json が追跡対象に入っている（素材フォルダの絶対パスが公開される）');
} else {
	say('[OK] .skillset-assets.json は追跡対象に入っていない');
}
// .gitignore に規則があることも見る（今は入っていなくても、将来 git add -f されると入ってしまうため）
const gi = fs.existsSync(path.join(REPO_ROOT, '.gitignore')) ? fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8') : '';
const ignoredByRule = gi.split('\n').some((l) => l.trim() === '.skillset-assets.json');
if (ignoredByRule) say('[OK] .gitignore に .skillset-assets.json の除外規則がある');
else { ng++; say('[NG] .gitignore に .skillset-assets.json の除外規則が無い'); }

/* ───────────────────────── 結果 ───────────────────────── */

if (hits.length === 0) {
	say('[OK] 個人情報の混入は検出されなかった（0件）');
} else {
	ng++;
	say(`[NG] 個人情報の疑いを ${hits.length}件 検出した`);
	for (const h of hits) {
		say(`       ${h.file}:${h.line}  [${h.rule}]  ${JSON.stringify(h.match)}`);
		say(`         | ${h.text}`);
	}
	say('     誤検出なら tests/privacy/allowlist.json の exceptions に');
	say('     { "file": ..., "rule": ..., "match": ..., "reason": ... } を理由つきで足す。');
}
if (exempted) say(`     免除 ${exempted}件（allowlist.json に理由つきで登録されているもの）`);

say('\n' + (ng === 0 ? '=== 個人情報の走査: OK ===' : '=== 個人情報の走査: NG ==='));
process.exit(ng === 0 ? 0 : 1);
