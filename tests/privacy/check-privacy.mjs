// 追跡中の全ファイルと、push しようとしている範囲のコミットメッセージを走査して、
// 個人情報の混入を検出する。
//
//   npm run check:privacy        … 単体で回す
//   npm run test:verify          … 納品前チェックの §7 からも呼ばれる
//   node tests/privacy/check-privacy.mjs --commits=all
//                                … コミットメッセージの走査範囲を全履歴にする（監査のやり直し用）
//                                  既定は origin/main..HEAD（＝これから push する範囲）
//
// ■ コミットメッセージも見る理由
//   B節ルール11で、tests/ 配下だけの変更は確認なしで push するようになった。
//   Claude Code が書いたメッセージが人の目を通らずに公開されるので、ファイルの中身と
//   同じ規則でメッセージ全文（件名＋本文＋トレーラ）も検査する。メッセージ専用の規則は
//   持たない（規則を増やすと偽陽性の設計が崩れる）。
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

/**
 * 恒久ルールの正本（同期フォルダ側の CLAUDE-RULES.md）の絶対パス。無ければ null。
 * 探す順序は tests/rules/check-rules-sync.mjs の `resolveRulesFile()` と同じ。
 * あちらを import しないのは assetsRootOrNull() と同じ理由（実在の確認で例外を投げさせない）。
 */
function rulesFileOrNull() {
	const fromEnv = process.env.UMA_CLAUDE_RULES;
	if (fromEnv && fromEnv.trim()) return fromEnv.trim();
	const f = path.join(REPO_ROOT, '.claude-rules.json');
	if (!fs.existsSync(f)) return null;
	try {
		const j = JSON.parse(fs.readFileSync(f, 'utf8'));
		return j && j.rulesFile ? String(j.rulesFile) : null;
	} catch {
		return null;
	}
}

/**
 * 「リポジトリに書いてはいけない実パス」の一覧。値そのものは出力しない。
 * 素材フォルダと、恒久ルールの正本の置き場所の2つ。どちらも
 *   ・パスそのもの（区切りと大小の違いを吸収）
 *   ・その**フォルダ名**（それだけで置き場所が割れる名前）
 * を見る。ファイル名（CLAUDE-RULES.md）は秘密ではないので見ない。
 * この説明にフォルダ名の実例を書くと自分で検出するので、例は書かない。
 */
function secretPaths() {
	const out = [];
	const add = (id, label, p, dir) => {
		if (!p) return;
		const variants = [...new Set([p, p.replace(/\\/g, '/'), p.replace(/\//g, '\\')])].map((s) => s.toLowerCase());
		const base = path.basename((dir || p).replace(/[\\/]+$/, '')).toLowerCase();
		out.push({ id, nameId: id + '-name', label, variants, base });
	};
	add('assets-root', '素材フォルダ', assetsRootOrNull(), null);
	const rules = rulesFileOrNull();
	add('rules-path', '恒久ルールの正本の置き場所', rules, rules ? path.dirname(rules) : null);
	return out;
}

/** 1つの本文から、秘密のパス／フォルダ名の混入を拾う。 */
function scanSecrets(text, src, push) {
	const lower = text.toLowerCase();
	for (const s of secrets) {
		if (s.variants.some((v) => lower.includes(v))) {
			const i = src.findIndex((l) => s.variants.some((v) => l.toLowerCase().includes(v)));
			push(s.id, `(${s.label}の絶対パス)`, i + 1, '(値は出力しない)');
		} else if (s.base && s.base.length >= 4 && lower.includes(s.base)) {
			const i = src.findIndex((l) => l.toLowerCase().includes(s.base));
			push(s.nameId, `(${s.label}のフォルダ名)`, i + 1, '(値は出力しない)');
		}
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

/**
 * コミットメッセージの免除。file は次のどちらか。
 *   "commit-message"   … どのコミットでも（検出文字列で照合。sha はリベースで変わるので使わない）
 *   "commit:<sha>"     … そのコミットだけ（sha の先頭一致・7桁以上）。**push 済みのコミットに限る**
 *                        （push 済みなら sha は変わらない。--force を使わない運用が前提）。
 *                        push 済みのメッセージは直せないので、免除の範囲を1件に絞るための形。
 */
function isExemptCommit(sha, rule, match) {
	return (allow.exceptions || []).some((e) => {
		if (e.rule !== rule || e.match !== match) return false;
		if (e.file === 'commit-message') return true;
		if (typeof e.file === 'string' && e.file.startsWith('commit:')) {
			const prefix = e.file.slice('commit:'.length).toLowerCase();
			return prefix.length >= 7 && sha.toLowerCase().startsWith(prefix);
		}
		return false;
	});
}

const files = trackedFiles();
const rules = pathRules();
const emails = allowedEmails();
// パスは区切り文字の違いと大文字小文字の違いを吸収して比べる（Windows のパスは大小を区別しない）
const secrets = secretPaths();

say('=== 個人情報の走査（追跡中のファイル ' + files.length + '件） ===');
say('     検査: ' + rules.map((r) => r.label).join(' / ') + ' / メールアドレス / '
	+ (secrets.length ? secrets.map((s) => s.label).join(' / ') : '（実パスの検査は設定が無いので省略）'));
const rootFrom = process.env.UMA_SKILLSET_ASSETS && process.env.UMA_SKILLSET_ASSETS.trim()
	? '環境変数 UMA_SKILLSET_ASSETS'
	: '.skillset-assets.json';
const rulesFrom = process.env.UMA_CLAUDE_RULES && process.env.UMA_CLAUDE_RULES.trim()
	? '環境変数 UMA_CLAUDE_RULES'
	: '.claude-rules.json';
say('     素材フォルダの root: ' + (secrets.some((s) => s.id === 'assets-root') ? `${rootFrom} から取得（値はここには出さない）` : '未設定のためこの検査は省略'));
say('     恒久ルールの正本: ' + (secrets.some((s) => s.id === 'rules-path') ? `${rulesFrom} から取得（値はここには出さない）` : '未設定のためこの検査は省略'));
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

	// 3) 書いてはいけない実パスそのもの／そのフォルダ名（全ファイル）
	scanSecrets(text, src, push);
}

say(`     走査 ${scanned}件 / バイナリのため飛ばした ${skippedBinary}件`);

/* ───────────────────────── コミットメッセージ ───────────────────────── */

/**
 * push しようとしている範囲（origin/main..HEAD）のコミットメッセージ全文を、
 * ファイルの中身と**同じ規則**で検査する。
 *
 * - 規則を増やさない。パスの形（5規則）・メールアドレス・素材フォルダの root の7規則をそのまま当てる。
 * - 自分自身の除外（SELF）は無い。メッセージには検査の定義が書かれることは無いので、全部見る。
 * - 免除は allowlist.json の exceptions に file を "commit-message"（どのコミットでも）か
 *   "commit:<sha>"（push 済みのそのコミットだけ）として登録する（isExemptCommit）。
 * - 範囲は --commits=<rev-range> で変えられる。"all" なら全履歴（`git log --all`）。
 *   origin/main が無い環境（remote 未設定の clone など）では範囲が決められないので、
 *   その旨を出して飛ばす（落とさない。追跡ファイルの検査は通っているため）。
 */
function commitRangeArg() {
	const hit = process.argv.filter((a) => a.startsWith('--commits=')).pop();
	return hit ? hit.slice('--commits='.length) : 'origin/main..HEAD';
}

function commitMessages(range) {
	const args = range === 'all' ? ['log', '--all'] : ['log', range];
	// %H と %B を制御文字で区切る。%B（メッセージ全文）は改行を含むので行では区切れない。
	const r = spawnSync('git', [...args, '--format=%H%x1f%B%x1e'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (r.status !== 0) return null;
	return String(r.stdout)
		.split('\x1e')
		.map((rec) => rec.replace(/^\n/, ''))
		.filter((rec) => rec.includes('\x1f'))
		.map((rec) => {
			const i = rec.indexOf('\x1f');
			return { sha: rec.slice(0, i), body: rec.slice(i + 1) };
		});
}

{
	const range = commitRangeArg();
	const rangeLabel = range === 'all' ? '全履歴（--all）' : range;
	let commits = null;
	let skipReason = null;
	if (range !== 'all' && /\.\./.test(range)) {
		// 範囲の両端が実在するかを先に確かめる（origin/main が無い clone・remote 未設定を想定）
		for (const ref of range.split('..').filter(Boolean)) {
			const v = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: REPO_ROOT, encoding: 'utf8' });
			if (v.status !== 0) { skipReason = `${ref} が無い`; break; }
		}
	}
	if (!skipReason) {
		commits = commitMessages(range);
		if (!commits) skipReason = 'git log に失敗した';
	}
	if (skipReason) {
		say(`=== コミットメッセージの走査（範囲 ${rangeLabel}）: 省略（${skipReason}） ===`);
	} else {
		say(`=== コミットメッセージの走査（範囲 ${rangeLabel}・${commits.length}件） ===`);
		for (const c of commits) {
			const where = `commit ${c.sha.slice(0, 7)} のメッセージ`;
			const src = c.body.split('\n');
			const push = (rule, match, lineNo, line) => {
				if (isExemptCommit(c.sha, rule, match)) { exempted++; say(`     [免除] ${where}:${lineNo} ${rule} ${JSON.stringify(match)}`); return; }
				hits.push({ file: where, line: lineNo, rule, match, text: line.trim().slice(0, 160) });
			};
			// 1) パスの形（ファイルの中身と同じ5規則。SELF の除外は無い）
			for (const rule of rules) {
				for (let i = 0; i < src.length; i++) {
					rule.re.lastIndex = 0;
					let m;
					while ((m = rule.re.exec(src[i])) !== null) push(rule.id, m[0], i + 1, src[i]);
				}
			}
			// 2) メールアドレス（許可リストにあるものは出さない。Co-Authored-By の noreply はここで通る）
			for (let i = 0; i < src.length; i++) {
				EMAIL_RE.lastIndex = 0;
				let m;
				while ((m = EMAIL_RE.exec(src[i])) !== null) {
					if (emails.has(m[0].toLowerCase())) continue;
					push('email', m[0], i + 1, src[i]);
				}
			}
			// 3) 書いてはいけない実パスそのもの／そのフォルダ名
			scanSecrets(c.body, src, push);
		}
		say(`     走査 ${commits.length}件（件名＋本文＋トレーラの全文）`);
	}
}

/* ───────────────────────── .skillset-assets.json が追跡されていないこと ───────────────────────── */

const tracked = new Set(files.map((f) => f.split(path.sep).join('/')));
// .gitignore の規則も見る（今は入っていなくても、将来 git add -f されると入ってしまうため）
const gi = fs.existsSync(path.join(REPO_ROOT, '.gitignore')) ? fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8') : '';
// 実パスを書いてあるローカル設定。どちらも追跡されていないこと・除外規則があることを見る。
for (const [cfg, what] of [
	['.skillset-assets.json', '素材フォルダの絶対パス'],
	['.claude-rules.json', '恒久ルールの正本の絶対パス'],
]) {
	if (tracked.has(cfg)) { ng++; say(`[NG] ${cfg} が追跡対象に入っている（${what}が公開される）`); }
	else say(`[OK] ${cfg} は追跡対象に入っていない`);
	if (gi.split('\n').some((l) => l.trim() === cfg)) say(`[OK] .gitignore に ${cfg} の除外規則がある`);
	else { ng++; say(`[NG] .gitignore に ${cfg} の除外規則が無い`); }
}

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
	say('     コミットメッセージの検出は、未pushなら免除せず git commit --amend でメッセージを直す。');
	say('     push 済みで直せないものだけ file を "commit:<sha>"（そのコミットだけ）にして免除する。');
}
if (exempted) say(`     免除 ${exempted}件（allowlist.json に理由つきで登録されているもの）`);

say('\n' + (ng === 0 ? '=== 個人情報の走査: OK ===' : '=== 個人情報の走査: NG ==='));
process.exit(ng === 0 ? 0 : 1);
