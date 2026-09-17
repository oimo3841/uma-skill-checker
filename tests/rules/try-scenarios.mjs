// §8（check-rules-sync.mjs）が、各状況で想定どおり NG ／警告になるかを確かめる。
//
//   node tests/rules/try-scenarios.mjs
//
// **test:verify からは呼ばない。** 検査の中身を変えたときに手で回すもの。
// 本番の CLAUDE.md・CLAUDE-RULES.md には触れない。一時フォルダに作ったコピーと
// 一時的な設定を runCheck() に渡して再現し、最後に一時フォルダごと消す。
// 全ケースが想定どおりなら終了コード 0、1つでも違えば 1。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCheck } from './check-rules-sync.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-scenario-'));
const W = (name, body) => { const p = path.join(tmp, name); fs.writeFileSync(p, body, 'utf8'); return p; };

const BASE = ['# 恒久ルール（検証用のコピー）', '', '1. ひとつめ', '2. ふたつめ', ''].join('\n');

function show(title, expect, result) {
	const verdict = result.ok ? 'OK（落とさない）' : 'NG（落とす）';
	const warned = result.warnings.length ? `警告 ${result.warnings.length}件` : '警告なし';
	const hit = result.ok === (expect !== 'NG') && (expect !== '警告' || result.warnings.length > 0);
	console.log(`\n────────────────────────────────────────`);
	console.log(`■ ${title}`);
	console.log(`   期待: ${expect} / 実際: ${verdict}・${warned}  → ${hit ? '想定どおり' : '想定と違う'}`);
	result.lines.forEach((l) => console.log('   ' + l));
	return hit;
}

const results = [];

// (a) 中身が違う → NG
{
	const EXTRA = '3. あとから足したルール';
	const repo = W('a-repo.md', BASE + EXTRA + '\n');
	const rules = W('a-rules.md', BASE);
	const res = runCheck({ repoFile: repo, env: { UMA_CLAUDE_RULES: rules }, configFile: path.join(tmp, 'none.json') });
	results.push(show('(a) 2ファイルの内容が不一致', 'NG', res));

	// 不一致のときでも、2ファイルの本文は画面に出さない。出しているとルールの中身が
	// 検査ログに残る（以前は最初に違う行を80文字まで表示していた）。いまは行番号・行数・
	// 文字数だけなので、ダミーの本文の行が1つも混ざっていないことをここで機械的に見る。
	const out = res.lines.join('\n');
	const bodyLines = [...new Set([...BASE.split('\n'), EXTRA])].filter((l) => l.trim());
	const leaked = bodyLines.filter((l) => out.includes(l));
	const clean = leaked.length === 0;
	// 漏れた行そのものは出さない（出すとここが漏れ口になる）。件数だけ言う。
	console.log(`   本文の行が出ていないこと: ${clean ? '出ていない → 想定どおり' : `${leaked.length}件 出ている → 想定と違う`}`);
	results.push(clean);
}

// (b) 改行コードだけが違う → 警告（NG にはしない）
{
	const repo = W('b-repo.md', BASE.replace(/\n/g, '\r\n'));
	const rules = W('b-rules.md', BASE);
	results.push(show('(b) 改行コードだけが違う', '警告',
		runCheck({ repoFile: repo, env: { UMA_CLAUDE_RULES: rules }, configFile: path.join(tmp, 'none.json') })));
}

// (c) CLAUDE.md が無い → NG
{
	const rules = W('c-rules.md', BASE);
	results.push(show('(c) CLAUDE.md が無い', 'NG',
		runCheck({ repoFile: path.join(tmp, 'c-repo-does-not-exist.md'), env: { UMA_CLAUDE_RULES: rules }, configFile: path.join(tmp, 'none.json') })));
}

// (d) パスの設定が無い → 警告
{
	const repo = W('d-repo.md', BASE);
	results.push(show('(d) パスの設定が無い', '警告',
		runCheck({ repoFile: repo, env: {}, configFile: path.join(tmp, 'none.json') })));
}

// 参考：同期フォルダの根が見えない → 警告 / 根は見えるが正本が無い → NG
{
	const repo = W('e-repo.md', BASE);
	// 存在しないボリュームを指すパス。ドライブ文字と区切り記号を続けて直に書くと
	// check:privacy の「Windows のドライブ文字」の規則に当たるので、組み立てて作る。
	// check-privacy.mjs が自分の規則の文字列を分割して書いているのと同じ理由。
	// 免除で通すより、当たる形を書かないほうがよい。
	const bogusVolume = process.platform === 'win32'
		? ['Q:', 'nowhere', 'CLAUDE-RULES.md'].join(path.sep)
		: '/nowhere-volume/CLAUDE-RULES.md';
	results.push(show('(参考) 同期フォルダの根が見えない', '警告',
		runCheck({ repoFile: repo, env: { UMA_CLAUDE_RULES: bogusVolume }, configFile: path.join(tmp, 'none.json') })));
	results.push(show('(参考) 根は見えるが正本が無い', 'NG',
		runCheck({ repoFile: repo, env: { UMA_CLAUDE_RULES: path.join(tmp, 'e-missing.md') }, configFile: path.join(tmp, 'none.json') })));
}

// 参考：正本はあるのに読めない → NG。絶対パスを画面に出さないことも見る
{
	const repo = W('g-repo.md', BASE);
	// 「あるのに読めない」を作る。権限の細工は OS 差が大きいので、フォルダを指させる
	// （存在はするので existsSync は通り、readFileSync は必ず失敗する）。
	const asDir = path.join(tmp, 'g-rules-as-directory');
	fs.mkdirSync(asDir, { recursive: true });
	const res = runCheck({ repoFile: repo, env: { UMA_CLAUDE_RULES: asDir }, configFile: path.join(tmp, 'none.json') });
	results.push(show('(参考) 正本はあるのに読めない', 'NG', res));

	// 包まずに投げさせると Node の例外メッセージが絶対パスごと stderr に出る。
	// 伏せた名前と理由だけになっていることを、一時フォルダの実パスで機械的に見る。
	const out = res.lines.join('\n');
	const clean = !out.includes(tmp) && !out.includes(asDir);
	// 漏れていた場合もパスそのものは出さない（出すとここが漏れ口になる）。
	console.log(`   絶対パスが出ていないこと: ${clean ? '出ていない → 想定どおり' : '出ている → 想定と違う'}`);
	results.push(clean);
}

// 参考：一致しているとき
{
	const repo = W('f-repo.md', BASE);
	const rules = W('f-rules.md', BASE);
	results.push(show('(参考) 一致しているとき', 'OK',
		runCheck({ repoFile: repo, env: { UMA_CLAUDE_RULES: rules }, configFile: path.join(tmp, 'none.json') })));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n────────────────────────────────────────`);
console.log(`一時ファイルは削除した: ${tmp}`);
console.log(results.every(Boolean) ? '全ケース想定どおり' : '想定と違うケースがある');
process.exit(results.every(Boolean) ? 0 : 1);
