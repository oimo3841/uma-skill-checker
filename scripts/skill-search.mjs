// マスターのスキル名を検索するだけの道具。
//
// 毎回 `node -e '...'` で書くとコマンド文字列が毎回変わり、Claude Code の権限プロンプトが
// そのたびに出る。確認の手順を固定ファイルに閉じ込めるためのもの（ハンドオフメモ D節）。
//
// 使い方:
//   node scripts/skill-search.mjs 闘                     … 部分一致
//   node scripts/skill-search.mjs 闘 無三 晋             … 複数の語をまとめて
//   node scripts/skill-search.mjs 健闘 --exact           … 完全一致の有無（ある/ない）
//   node scripts/skill-search.mjs 春ウマ娘○ --normalize  … normalizeText() を通した形でも照合
//   node scripts/skill-search.mjs 闘 --json              … 機械可読
//   node scripts/skill-search.mjs 闘 --master=<パス>     … 別のマスターを見るとき
//
// 検索語はすべて引数。スキル名をこのファイルに書かないこと。
// --normalize は js/common.js を Node の vm でそのまま読む（ハンドオフメモ F-38）。
// 「マスター側にも同じ正規化が掛かる」ことを確かめたいとき（文字混同マップを触るとき）に使う。
//
// 同じオプションを2回渡したときは後のものが勝つ（tests/ の各ハーネスと同じ約束）。

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

function usage(message) {
	if (message) console.log(`${message}\n`);
	console.log('使い方: node scripts/skill-search.mjs <検索語>... [--exact] [--normalize] [--master=<パス>] [--json]');
	console.log('  <検索語>     部分一致で探す（複数可）');
	console.log('  --exact      完全一致の有無だけを ある/ない で返す');
	console.log('  --normalize  js/common.js の normalizeText() を通した形でも照合する');
	console.log('  --master=    マスターのパス（既定 uma-skill-deck-skills.json）');
	console.log('  --json       JSONで出す');
	process.exit(1);
}

const terms = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (terms.length === 0) usage('検索語を1つ以上渡してください。');

const MASTER = argValue('master', 'uma-skill-deck-skills.json');
const EXACT = process.argv.includes('--exact');
const NORMALIZE = process.argv.includes('--normalize');
const AS_JSON = process.argv.includes('--json');

const masterPath = path.resolve(ROOT, MASTER);
if (!fs.existsSync(masterPath)) usage(`マスターが見つかりません: ${path.relative(ROOT, masterPath)}`);
const json = JSON.parse(fs.readFileSync(masterPath, 'utf-8'));
const names = (json.skills || json).map((s) => (s && s.name) || String(s));

// normalizeText は const 宣言なので vm のコンテキスト変数にならない。末尾で globalThis へ渡す。
let normalizeText = null;
if (NORMALIZE) {
	const src = fs.readFileSync(path.join(ROOT, 'js', 'common.js'), 'utf-8');
	const ctx = { window: {}, document: {}, navigator: {} };
	vm.createContext(ctx);
	vm.runInContext(src + '\n;globalThis.__normalizeText = normalizeText;', ctx, { filename: 'common.js' });
	normalizeText = ctx.__normalizeText;
}

const results = terms.map((term) => {
	const plain = EXACT ? names.filter((n) => n === term) : names.filter((n) => n.includes(term));
	let normalized = [];
	if (NORMALIZE) {
		const t = normalizeText(term);
		const hit = EXACT
			? names.filter((n) => normalizeText(n) === t)
			: names.filter((n) => normalizeText(n).includes(t));
		normalized = hit.filter((n) => !plain.includes(n)); // そのままでは当たらず、正規化で当たったものだけ
	}
	return { term, matches: plain, normalizedOnly: normalized };
});

if (AS_JSON) {
	console.log(JSON.stringify({ master: path.relative(ROOT, masterPath), count: names.length, exact: EXACT, normalize: NORMALIZE, results }, null, 2));
	process.exit(0);
}

// 検索語は日本語のことが多いので、見た目の幅で揃える（全角は2として数える）。
function displayWidth(s) {
	let w = 0;
	for (const ch of String(s)) {
		const c = ch.codePointAt(0);
		const wide =
			c >= 0x1100 &&
			(c <= 0x115f ||
				(c >= 0x2460 && c <= 0x24ff) ||
				(c >= 0x25a0 && c <= 0x26ff) ||
				(c >= 0x2e80 && c <= 0xa4cf) ||
				(c >= 0xac00 && c <= 0xd7a3) ||
				(c >= 0xf900 && c <= 0xfaff) ||
				(c >= 0xfe30 && c <= 0xfe6f) ||
				(c >= 0xff00 && c <= 0xff60) ||
				(c >= 0xffe0 && c <= 0xffe6));
		w += wide ? 2 : 1;
	}
	return w;
}

console.log(`マスター ${names.length}件（${path.relative(ROOT, masterPath)}）${EXACT ? '・完全一致' : '・部分一致'}${NORMALIZE ? '・正規化あり' : ''}`);
const width = Math.max(...terms.map((t) => displayWidth(t)));
for (const r of results) {
	const label = r.term + ' '.repeat(Math.max(0, width - displayWidth(r.term)));
	if (EXACT) {
		console.log(`${label} => ${r.matches.length > 0 ? 'ある' : 'ない'}`);
	} else {
		console.log(`${label} => ${r.matches.length}件: ${r.matches.join(' / ') || '(なし)'}`);
	}
	if (NORMALIZE && r.normalizedOnly.length > 0) {
		console.log(`${' '.repeat(width)}    （正規化後に一致）=> ${r.normalizedOnly.length}件: ${r.normalizedOnly.join(' / ')}`);
	}
}
