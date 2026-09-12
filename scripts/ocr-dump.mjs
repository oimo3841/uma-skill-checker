// OCRハーネス（tests/ocr/run-ocr-tests.mjs）の結果を読んで並べるだけの道具。
//
// 毎回 `node -e '...'` で書くとコマンド文字列が毎回変わり、Claude Code の権限プロンプトが
// そのたびに出る。確認の手順を固定ファイルに閉じ込めるためのもの（ハンドオフメモ D節）。
//
// 使い方:
//   node scripts/ocr-dump.mjs 20260913-1                     … rawLines を全部出す
//   node scripts/ocr-dump.mjs 20260913-1 20260913-3          … 複数のケースをまとめて
//   node scripts/ocr-dump.mjs 20260913-3 --from=96           … 96行目以降
//   node scripts/ocr-dump.mjs 20260913-3 --from=-48          … 末尾48行（負数は末尾から）
//   node scripts/ocr-dump.mjs 20260913-3 --from=96 --limit=10
//   node scripts/ocr-dump.mjs 20260913-3 --detected          … 検出スキル一覧に切り替え
//   node scripts/ocr-dump.mjs 20260913-3 --json              … 機械可読（他の道具へ繋ぐとき）
//   node scripts/ocr-dump.mjs <ケース> --dir=output/ocr-old  … 置き場所を変えるとき
//
// ケース名・開始行はすべて引数。スキル名やケース名をこのファイルに書かないこと
// （書くと「その素材専用の道具」になり、次の素材で嘘をつく）。
//
// 同じオプションを2回渡したときは後のものが勝つ（tests/ の各ハーネスと同じ約束）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

function usage(message) {
	if (message) console.log(`${message}\n`);
	console.log('使い方: node scripts/ocr-dump.mjs <ケース名>... [--from=N] [--limit=N] [--detected] [--json] [--dir=<パス>]');
	console.log('  <ケース名>  output/ocr/<ケース名>/result.json を読む（日付フォルダ名をそのまま渡す）');
	console.log('  --from=N    開始行（0始まり・既定0）。負数は末尾から（--from=-48 で最後の48行）');
	console.log('  --limit=N   出力する行数（既定は最後まで）');
	console.log('  --detected  rawLines ではなく検出スキル一覧を出す');
	console.log('  --json      JSONで出す');
	console.log('  --dir=      result.json の置き場所（既定 output/ocr）');
	process.exit(1);
}

// 日本語を含む幅を見た目で揃える（全角は2、半角は1として数える）。
// ○（U+25CB）★（U+2605）♪（U+266A）はこの画面のスキル名に必ず出てくるうえ、
// 日本語フォントでは全角幅で描かれるので、幅2の側に入れる（入れないと表がずれる）。
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

function padEndWide(s, n) {
	return String(s) + ' '.repeat(Math.max(0, n - displayWidth(s)));
}

const cases = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (cases.length === 0) usage('ケース名を1つ以上渡してください。');

const DIR = argValue('dir', path.join('output', 'ocr'));
const AS_JSON = process.argv.includes('--json');
const DETECTED = process.argv.includes('--detected');
const fromArg = Number(argValue('from', '0'));
const limitArg = argValue('limit', null);
if (Number.isNaN(fromArg)) usage('--from= には数値を渡してください。');
if (limitArg !== null && Number.isNaN(Number(limitArg))) usage('--limit= には数値を渡してください。');

const out = [];
let failed = 0;

for (const name of cases) {
	const file = path.resolve(ROOT, DIR, name, 'result.json');
	if (!fs.existsSync(file)) {
		console.log(`[見つかりません] ${path.relative(ROOT, file)}`);
		failed++;
		continue;
	}
	const j = JSON.parse(fs.readFileSync(file, 'utf-8'));
	const rawLines = j.rawLines || [];
	const detected = j.detected || [];

	const header = {
		case: name,
		rawLines: rawLines.length,
		dictSize: j.dictSize ?? null,
		detected: detected.length,
		skipped: Array.isArray(j.skipped) ? j.skipped.length : j.skipped ?? null,
		stitchError: j.stitchError || null,
		ocrError: j.ocrError || null,
	};

	if (DETECTED) {
		if (AS_JSON) out.push({ ...header, detectedSkills: detected });
		else {
			console.log(`=== ${name} : rawLines ${header.rawLines} / 辞書 ${header.dictSize}件 / 検出 ${header.detected}件`);
			console.log(detected.map((d) => `${d.name}(★${d.stars})`).join(' / ') || '(なし)');
			console.log('');
		}
		continue;
	}

	const start = fromArg < 0 ? Math.max(0, rawLines.length + fromArg) : Math.min(fromArg, rawLines.length);
	const end = limitArg === null ? rawLines.length : Math.min(rawLines.length, start + Number(limitArg));
	const slice = rawLines.slice(start, end).map((r, i) => ({
		index: start + i,
		text: r.text,
		norm: r.norm,
		stars: r.stars,
	}));

	if (AS_JSON) {
		out.push({ ...header, from: start, to: end, rows: slice });
		continue;
	}

	console.log(
		`=== ${name} : rawLines ${header.rawLines} / 辞書 ${header.dictSize}件 / 検出 ${header.detected}件` +
			(header.skipped !== null ? ` / skipped ${header.skipped}` : '') +
			(start !== 0 || end !== rawLines.length ? `  （${start}〜${end - 1} 行を表示）` : '')
	);
	if (header.stitchError) console.log(`    [結合エラー] ${header.stitchError}`);
	if (header.ocrError) console.log(`    [OCRエラー] ${header.ocrError}`);
	const textWidth = Math.max(10, ...slice.map((r) => displayWidth(r.text)));
	const normWidth = Math.max(10, ...slice.map((r) => displayWidth(r.norm)));
	for (const r of slice) {
		console.log(`${String(r.index).padStart(4)}  ${padEndWide(r.text, textWidth)}  ->  ${padEndWide(r.norm, normWidth)}  ★${r.stars}`);
	}
	console.log('');
}

if (AS_JSON) console.log(JSON.stringify(out, null, 2));
process.exit(failed > 0 ? 1 : 0);
