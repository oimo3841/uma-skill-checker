// 文字正規化（js/common.js の CHAR_CONFUSION_MAP / HOMOGLYPH_MAP）の安全確認。
//
// これらのマップは normalizeText() を通じて「OCRの読み取り結果」だけでなく
// 「スキル名そのもの」にも適用される。そのため、誤読対策のつもりで足した1文字が
// 別々のスキル名を同じ文字列に潰してしまうと、恒久的な誤検出になる。
//
// CHAR_CONFUSION_MAP に追記したとき、およびスキルマスタ(uma-skill-deck-skills.json)を
// 更新したときは必ずこれを走らせること。common.js の各エントリのコメントにある
// 「マスタ更新時に再確認すること」を自動化したもの。
//
// 使い方:
//   npm run test:norm
//
// 衝突が1件でもあれば exit 1。

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const master = JSON.parse(await fs.readFile(path.join(ROOT, 'uma-skill-deck-skills.json'), 'utf-8'));
const deckNames = (master.skills || master).map((s) => s.name);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(ROOT, 'exam.html')).href, { waitUntil: 'load' });

const report = await page.evaluate((deckNames) => {
	function collisionsIn(names) {
		const byNorm = {};
		names.forEach((n) => {
			const k = normalizeText(n);
			(byNorm[k] = byNorm[k] || []).push(n);
		});
		return Object.keys(byNorm)
			.filter((k) => new Set(byNorm[k]).size > 1)
			.map((k) => ({ norm: k, names: Array.from(new Set(byNorm[k])) }));
	}

	// スキル名の中に実際に現れるマップのキー = 「スキル名側も書き換わる」危険なエントリ。
	function riskyKeys(names) {
		const joined = names.join('');
		const hits = [];
		[['CHAR_CONFUSION_MAP', CHAR_CONFUSION_MAP], ['HOMOGLYPH_MAP', HOMOGLYPH_MAP]].forEach(([label, map]) => {
			Object.keys(map).forEach((k) => {
				if (joined.indexOf(k) !== -1) hits.push({ map: label, from: k, to: map[k] });
			});
		});
		return hits;
	}

	return {
		version: COMMON_JS_VERSION,
		deck: {
			size: deckNames.length,
			collisions: collisionsIn(deckNames),
			risky: riskyKeys(deckNames),
		},
		exam: {
			size: EXAM_SKILL_LIST.length,
			collisions: collisionsIn(EXAM_SKILL_LIST),
			risky: riskyKeys(EXAM_SKILL_LIST),
		},
	};
}, deckNames);

await browser.close();

console.log(`common.js 版: ${report.version}\n`);

let failed = 0;
for (const [label, r] of [
	['uma-skill-deck-skills.json', report.deck],
	['exam.html EXAM_SKILL_LIST', report.exam],
]) {
	console.log(`■ ${label} (${r.size}件)`);
	if (r.collisions.length === 0) {
		console.log('  ✓ 正規化後の衝突なし');
	} else {
		failed += r.collisions.length;
		console.log(`  ✗ 正規化後に同一文字列になるスキルが ${r.collisions.length} 組あります:`);
		for (const c of r.collisions) console.log(`    "${c.norm}" ← ${c.names.join(' / ')}`);
	}
	console.log(`  スキル名側も書き換わるマップのキー: ${r.risky.length}件`);
	for (const k of r.risky) console.log(`    ${k.map}: ${k.from} → ${k.to}`);
	console.log('');
}

if (failed > 0) {
	console.log('CHAR_CONFUSION_MAP の追記、またはスキルマスタの更新で衝突が発生しています。');
	process.exitCode = 1;
}
