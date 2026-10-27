// exam.html の EXAM_REGISTRY_DISPLAY_ORDER（①の「一覧を確認する」の表示の並び）を、data/skill-display-order.json から作り直す道具。
//
// exam は core を読まず file:// でも動く決まりなので、並びを実行時に読まず、一覧に出る名前（133種・広げる5種・
// シナリオ因子・遺伝子）をこの順で埋め込んでいる（C-216・2026-10-27）。並びのファイルを受け入れ直したときに回す。
// 食い違いは test:norm が知らせる（tests/ocr/check-normalization.mjs）。
//
// 使い方:
//   node scripts/gen-exam-display-order.mjs           … exam.html の配列を書き換える（改行 CRLF を保つ）
//   node scripts/gen-exam-display-order.mjs --check   … 書き換えずに、いまの配列と同じかだけを見る（違えば終了コード 1）
//
// スキル名をこのファイルに書かないこと（名前は exam.html とデータから読む）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const EXAM = path.join(ROOT, 'exam.html');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const html = fs.readFileSync(EXAM, 'utf8');
const NL = html.includes('\r\n') ? '\r\n' : '\n';
const block = (name) => {
	const i = html.indexOf('const ' + name + ' = [');
	if (i < 0) throw new Error('exam.html に ' + name + ' が無い');
	return html.slice(i, html.indexOf('];', i));
};
const pairs = (name) => [...block(name).matchAll(/\{ id: '([^']+)', name: '([^']+)' \}/g)].map((m) => ({ id: m[1], name: m[2] }));
const names = (name) => [...block(name).matchAll(/^\s*(?:'([^']+)'|"([^"]+)"),?\s*$/gm)].map((m) => m[1] || m[2]);
const idOfName = (list, n, what) => {
	const e = list.find((x) => x.name === n);
	if (!e) throw new Error(what + ' に無い名前: ' + n);
	return e.id;
};

const sf = readJson('data/scenario-inheritance-factors.json').entries;
const ap = readJson('data/aptitude-genes.json').entries;
const items = pairs('EXAM_SKILL_LIST').concat(pairs('EXPANDED_EXTRA_SKILL_LIST'),
	names('SCENARIO_INHERITANCE_FACTORS').map((n) => ({ id: idOfName(sf, n, 'シナリオ因子'), name: n })),
	names('APTITUDE_GENES').map((n) => ({ id: idOfName(ap, n, '遺伝子'), name: n })));
const order = readJson('data/skill-display-order.json');
const pos = new Map(order.entries.map((e, i) => [e.id, i]));
const missing = items.filter((x) => !pos.has(x.id));
if (missing.length) throw new Error('並びのファイルに無い id: ' + missing.map((x) => x.id + '（' + x.name + '）').join(' / '));
items.sort((a, b) => pos.get(a.id) - pos.get(b.id));

const quote = (n) => (n.indexOf("'") === -1 ? "'" + n + "'" : JSON.stringify(n));
const lines = [];
for (let i = 0; i < items.length; i += 6) lines.push('\t\t\t' + items.slice(i, i + 6).map((x) => quote(x.name)).join(', ') + ',');
lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
const body = lines.join(NL);

const head = '\t\tconst EXAM_REGISTRY_DISPLAY_ORDER = [' + NL;
const at = html.indexOf(head);
const end = at < 0 ? -1 : html.indexOf(NL + '\t\t];', at);
if (at < 0 || end < 0) throw new Error('exam.html に EXAM_REGISTRY_DISPLAY_ORDER の配列が無い');
const current = html.slice(at + head.length, end);
const same = current === body;
console.log('並びのファイル ' + order.dataVersion + '・一覧に出る名前 ' + items.length + '件・exam.html の配列は' + (same ? '同じ' : '違う'));
if (CHECK) process.exit(same ? 0 : 1);
if (!same) {
	fs.writeFileSync(EXAM, html.slice(0, at + head.length) + body + html.slice(end));
	console.log('exam.html を書き換えた（改行 ' + (NL === '\r\n' ? 'CRLF' : 'LF') + ' のまま）。test:norm で確かめること');
}
