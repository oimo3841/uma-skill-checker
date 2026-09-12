// 正解の案を作るための「スキル名の一覧（辞書）」を素材フォルダに用意する。
//
//   node tests/skillset/build-name-lexicon.mjs --xlsx="<スキルリスト.xlsx のパス>" [--sheet=1] [--column=D]
//
// なぜ要るか: スキルセット画面には、UmaSkill Deck のマスター445種に**無い**スキル
// （固有スキル・因子で継承できないスキルなど）も並ぶ。445種だけで照合すると、
// 正しく読めているのに「読めない」に分類され、文字精度の実測が歪む。
//
// **取り出すのはスキル名の列だけ。** スキルID・発動条件式などの内部データは読み捨てる
// （B節ルール8「公開データに内部データを直結させない」）。書き出し先も素材フォルダ
// （Gitの管理外）で、リポジトリには入れない。

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { assetsDir, relToAssets } from './lib/assets.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

/** .xlsx（zip）から必要なエントリだけを取り出す。外部ライブラリを増やさないための最小実装。 */
function readZipEntries(file, wanted) {
	const buf = fs.readFileSync(file);
	const out = new Map();
	// End of central directory を後ろから探す
	let eocd = -1;
	for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
	}
	if (eocd < 0) throw new Error('zipの終端が見つかりません');
	const count = buf.readUInt16LE(eocd + 10);
	let p = buf.readUInt32LE(eocd + 16);
	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('中央ディレクトリが壊れています');
		const method = buf.readUInt16LE(p + 10);
		const compSize = buf.readUInt32LE(p + 20);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		const localOff = buf.readUInt32LE(p + 42);
		const name = buf.toString('utf-8', p + 46, p + 46 + nameLen);
		p += 46 + nameLen + extraLen + commentLen;
		if (!wanted(name)) continue;
		const lnLen = buf.readUInt16LE(localOff + 26);
		const leLen = buf.readUInt16LE(localOff + 28);
		const start = localOff + 30 + lnLen + leLen;
		const raw = buf.subarray(start, start + compSize);
		out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
	}
	return out;
}

function decodeXml(s) {
	return s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

function sharedStrings(xml) {
	const out = [];
	for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
		out.push(decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
	}
	return out;
}

function columnValues(sheetXml, strings, column) {
	const out = [];
	const cellRe = new RegExp(`<c r="${column}(\\d+)"([^>]*)>([\\s\\S]*?)</c>`, 'g');
	for (const m of sheetXml.matchAll(cellRe)) {
		const v = /<v>([\s\S]*?)<\/v>/.exec(m[3]);
		if (!v) continue;
		out.push({ row: Number(m[1]), value: /t="s"/.test(m[2]) ? strings[Number(v[1])] : decodeXml(v[1]) });
	}
	return out;
}

function main() {
	const xlsx = argValue('xlsx', null);
	const sheet = argValue('sheet', '1');
	const column = argValue('column', 'D');
	if (!xlsx) {
		console.error('--xlsx="<スキルリスト.xlsx のパス>" を指定してください（パスはリポジトリに書かない）');
		process.exit(1);
	}
	const entries = readZipEntries(xlsx, (n) => n === 'xl/sharedStrings.xml' || n === `xl/worksheets/sheet${sheet}.xml`);
	const ss = entries.get('xl/sharedStrings.xml');
	const sh = entries.get(`xl/worksheets/sheet${sheet}.xml`);
	if (!ss || !sh) throw new Error('xlsx の中身を読めませんでした（sheet番号が違うかもしれません）');
	const strings = sharedStrings(ss.toString('utf-8'));
	const cells = columnValues(sh.toString('utf-8'), strings, column);
	// 見出し行（「スキル名」等）と空欄を除く。名前だけを残す。
	const names = [];
	const seen = new Set();
	cells.forEach((c) => {
		const v = String(c.value || '').trim();
		if (!v || v.includes('スキル名')) return;
		if (seen.has(v)) return;
		seen.add(v);
		names.push(v);
	});
	const outFile = path.join(assetsDir('reference'), 'skill-names.json');
	fs.writeFileSync(
		outFile,
		JSON.stringify(
			{
				note: 'スキル名だけを取り出した検証用の辞書。内部ID・発動条件式は意図的に含めない（B節ルール8）。リポジトリには置かない。',
				source: path.basename(xlsx),
				sheet,
				column,
				generatedAt: new Date().toISOString(),
				names
			},
			null,
			'\t'
		),
		'utf-8'
	);
	console.log(`スキル名 ${names.length}件を書き出しました → ${relToAssets(outFile)}`);
}

main();
