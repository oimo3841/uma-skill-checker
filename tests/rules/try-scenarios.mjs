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
	const repo = W('a-repo.md', BASE + '3. あとから足したルール\n');
	const rules = W('a-rules.md', BASE);
	results.push(show('(a) 2ファイルの内容が不一致', 'NG',
		runCheck({ repoFile: repo, env: { UMA_CLAUDE_RULES: rules }, configFile: path.join(tmp, 'none.json') })));
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
