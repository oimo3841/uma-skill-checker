// 新しい Deck（α版）の縮小の列の名前に使う、衣装ごとの略称のファイルを作る（T88・C-275 の 7・8）。
// 使い方: node scripts/build-deck-abbrev.mjs <略称の CSV> [--check]
//   CSV は「衣装ID」と「リスト用略称（5文字以内）」の列を読む（ほかの列は読まない）。
//   書き出し先は data/deck-alpha/uma-abbrev.json（ツール側のデータ。data/training-umamusume.json には列を足さない）。
//   --check は書き出さずに確かめるだけ。
// 確かめること: 全衣装（data/training-umamusume.json の entries）に略称があるか・5文字以内か・別の衣装と同じ略称になっていないか。
// 外れたものは一覧で出す（略称が無い衣装は、ページの側でキャラ名の頭5文字を代わりに出す）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--'));
const checkOnly = args.includes('--check');
if (!csvPath) { console.error('使い方: node scripts/build-deck-abbrev.mjs <略称の CSV> [--check]'); process.exit(2); }

const MAX = 5;
const OUT = path.join(root, 'data', 'deck-alpha', 'uma-abbrev.json');

/** 引用符つきの列にも対応した CSV の読み（改行を含む列は無い前提） */
function parseCsv(text) {
	const rows = [];
	for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
		if (!line.trim()) continue;
		const out = []; let cur = '', q = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
			else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
		}
		out.push(cur); rows.push(out);
	}
	return rows;
}

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const head = rows.shift();
const iId = head.indexOf('衣装ID'), iAb = head.findIndex((h) => h.startsWith('リスト用略称'));
if (iId < 0 || iAb < 0) { console.error('列が見つからない: 衣装ID / リスト用略称', head); process.exit(2); }

const uma = JSON.parse(fs.readFileSync(path.join(root, 'data', 'training-umamusume.json'), 'utf8'));
const known = new Map(uma.entries.map((u) => [u.id, u]));
const len = (s) => Array.from(s).length;

const csvMap = new Map(); const csvDup = [], unknownId = [];
for (const r of rows) {
	const id = (r[iId] || '').trim(), ab = (r[iAb] || '').trim();
	if (!id) continue;
	if (csvMap.has(id)) { csvDup.push(id); continue; }
	if (!known.has(id)) unknownId.push(id);
	csvMap.set(id, ab);
}

const missing = [], tooLong = [], entries = [];
for (const u of uma.entries) {
	const ab = csvMap.get(u.id);
	if (!ab) { missing.push(u); continue; }
	if (len(ab) > MAX) { tooLong.push({ u, ab }); continue; }
	entries.push({ id: u.id, abbr: ab });
}
const byAb = new Map();
entries.forEach((e) => (byAb.get(e.abbr) || byAb.set(e.abbr, []).get(e.abbr)).push(e.id));
const dupAb = [...byAb].filter(([, ids]) => ids.length > 1);

const label = (u) => u.id + ' ［' + u.title + '］' + u.charaName;
console.log('衣装 %d 件（data/training-umamusume.json %s）・CSV の行 %d 件', uma.entries.length, uma.dataVersion, csvMap.size);
console.log('略称あり（5文字以内）: %d 件', entries.length);
console.log('略称が無い: %d 件%s', missing.length, missing.length ? '\n  ' + missing.map((u) => label(u) + ' → 代わりに「' + Array.from(u.charaName).slice(0, MAX).join('') + '」').join('\n  ') : '');
console.log('5文字を超える: %d 件%s', tooLong.length, tooLong.length ? '\n  ' + tooLong.map((x) => label(x.u) + '「' + x.ab + '」（' + len(x.ab) + '文字）').join('\n  ') : '');
console.log('別の衣装と同じ略称: %d 組%s', dupAb.length, dupAb.length ? '\n  ' + dupAb.map(([ab, ids]) => '「' + ab + '」 ' + ids.map((id) => label(known.get(id))).join(' ／ ')).join('\n  ') : '');
if (csvDup.length) console.log('CSV で2回出る衣装ID: %s', csvDup.join('・'));
if (unknownId.length) console.log('CSV にあって衣装の一覧に無い ID: %s', unknownId.join('・'));

if (checkOnly) process.exit(0);
// 5文字を超えるものは入れない（ページの側でキャラ名の頭5文字を出す）。同じ略称のものは、そのまま入れる（列の見出しの title に正式な名前が出る）
const today = new Date().toLocaleDateString('sv-SE');
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
let ver = today + 'a';
if (prev && prev.dataVersion && prev.dataVersion.startsWith(today)) {
	const same = JSON.stringify(prev.entries) === JSON.stringify(entries);
	ver = same ? prev.dataVersion : today + String.fromCharCode(prev.dataVersion.charCodeAt(10) + 1);
}
const out = { dataVersion: ver, category: 'deckCostumeAbbrev', trainingVersion: uma.dataVersion, maxLength: MAX,
	note: '新しい Deck（α版）の縮小の列の名前に使う、衣装ごとの略称（5文字まで）。scripts/build-deck-abbrev.mjs が作る（手で直さない）。無い衣装はキャラ名の頭5文字を出す。',
	entries };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, '\t') + '\n', 'utf8');
console.log('書き出し: %s（%s・%d 件）', path.relative(root, OUT), ver, entries.length);
