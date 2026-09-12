// 因子画面とスキルセット画面で「文字の高さ」を同じ物差しで実測する。
// 人工劣化の縮小率を推測で決めないための計測（フェーズ0の指示4）。
//
//   node tests/skillset/measure-text-height.mjs --factors=<因子画像のフォルダ> [--set=2026-09-11a]
//
// 因子画面は js/common.js の detectSkillRows() で行を取り、各行の濃い画素の
// 縦の広がりを測る。スキルセット画面は切り出した文字領域に同じ測り方をする。
// 出力: reports/text-height.json と、標準出力の要約。

import fs from 'node:fs/promises';
import path from 'node:path';
import { assetsRoot, assetsDir, listFiles, relToAssets } from './lib/assets.mjs';
import { openOcr } from './lib/ocr.mjs';
import { fileToDataUrl } from './lib/browser.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

function median(a) {
	if (!a.length) return 0;
	const s = a.slice().sort((p, q) => p - q);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
	const factorsDir = argValue('factors', null);
	const setName = argValue('set', '2026-09-11a');
	if (!factorsDir) {
		console.error('--factors=<因子画面の実画像が入ったフォルダ> を指定してください');
		process.exit(1);
	}
	const factorFiles = listFiles(factorsDir, ['.png', '.jpg', '.jpeg', '.webp']);
	if (!factorFiles.length) {
		console.error(`因子画像が見つかりません: ${factorsDir}`);
		process.exit(1);
	}
	const cropFiles = listFiles(path.join(assetsRoot(), 'crops', setName), ['.png']).filter(
		(f) => !f.endsWith('-badge.png')
	);
	if (!cropFiles.length) {
		console.error(`切り出し画像がありません。先に run-extract-cards.mjs を実行してください（crops/${setName}）`);
		process.exit(1);
	}

	const ocr = await openOcr();
	const report = { generatedAt: new Date().toISOString(), factors: [], skillset: {}, ratio: null };
	try {
		console.log('[因子画面]');
		const factorInks = [];
		for (const f of factorFiles) {
			const res = await ocr.measureFactorRows(await fileToDataUrl(f));
			const inks = res.rows.map((r) => r.ink).filter((n) => n > 0);
			factorInks.push(...inks);
			console.log(
				`  ${path.basename(f)}  元 ${res.natural.w}x${res.natural.h} → 基準 ${res.baseWidth}x${res.baseHeight}  ` +
					`行 ${res.rows.length}  文字の高さ中央値 ${median(inks)}px`
			);
			report.factors.push({
				file: path.basename(f),
				natural: res.natural,
				base: { w: res.baseWidth, h: res.baseHeight },
				rows: res.rows.length,
				inkMedian: median(inks)
			});
		}
		const factorMedian = median(factorInks);
		console.log(`  → 因子画面の文字の高さ（全行の中央値）: ${factorMedian}px  n=${factorInks.length}`);

		console.log('[スキルセット画面]');
		const cropInks = [];
		for (const f of cropFiles) {
			cropInks.push(await ocr.inkHeight(await fileToDataUrl(f)));
		}
		const skillsetMedian = median(cropInks.filter((n) => n > 0));
		console.log(`  切り出し ${cropFiles.length}枚  文字の高さ中央値 ${skillsetMedian}px`);
		report.skillset = { set: setName, crops: cropFiles.length, inkMedian: skillsetMedian };

		const ratio = factorMedian && skillsetMedian ? factorMedian / skillsetMedian : null;
		report.ratio = ratio;
		report.factorInkMedian = factorMedian;
		console.log(
			`\n人工劣化の縮小率 = 因子 ${factorMedian}px / スキルセット ${skillsetMedian}px = ` +
				`${ratio ? ratio.toFixed(3) : '?'}`
		);
		const outFile = path.join(assetsDir('reports'), 'text-height.json');
		await fs.writeFile(outFile, JSON.stringify(report, null, '\t'), 'utf-8');
		console.log(`→ ${relToAssets(outFile)}`);
	} finally {
		await ocr.close();
	}
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
