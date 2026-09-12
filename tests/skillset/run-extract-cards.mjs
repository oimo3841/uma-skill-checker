// スキルセット画面のスクリーンショット（または動画から抜いたフレーム）から
// カードの文字領域を切り出す。
//
//   node tests/skillset/run-extract-cards.mjs                       … images/ の全セット
//   node tests/skillset/run-extract-cards.mjs --set=2026-09-11a     … セットを指定
//   node tests/skillset/run-extract-cards.mjs --kind=frames         … frames/ を対象に
//   node tests/skillset/run-extract-cards.mjs --no-crops            … 集計だけ（画像を書かない）
//
// 出力: 素材フォルダの crops/<セット>/ に文字領域のPNG、
//       crops/<セット>/index.json に切り出しの明細。

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetsRoot, assetsDir, listSets, listFiles, relToAssets } from './lib/assets.mjs';
import { openAnalyzer, fileToDataUrl, dataUrlToFile } from './lib/browser.mjs';

const TAB_LABELS = ['tab1', 'tab2', 'tab3']; // 位置だけ持つ。名前は画面を見た人が決める

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

export async function extractSet(analyzer, kind, setName, opts = {}) {
	const srcDir = path.join(assetsRoot(), kind, setName);
	const files = listFiles(srcDir, ['.png', '.jpg', '.jpeg', '.webp']);
	if (!files.length) return null;
	const outDir = opts.crops === false ? null : assetsDir('crops', opts.out || setName);
	const entries = [];
	for (const file of files) {
		const name = path.basename(file, path.extname(file));
		const dataUrl = await fileToDataUrl(file);
		const res = await analyzer.analyze(dataUrl, { crops: opts.crops !== false });
		const cards = [];
		for (let i = 0; i < res.cards.length; i++) {
			const c = res.cards[i];
			const id = `${name}-${String(i).padStart(2, '0')}`;
			if (outDir && c.cropDataUrl) await dataUrlToFile(c.cropDataUrl, path.join(outDir, `${id}.png`));
			cards.push({ id, card: c.card, text: c.text });
		}
		if (outDir && res.badgeDataUrl) await dataUrlToFile(res.badgeDataUrl, path.join(outDir, `${name}-badge.png`));
		entries.push({
			source: path.basename(file),
			kind,
			width: res.width,
			height: res.height,
			ms: res.ms,
			activeTab: res.activeTab ? TAB_LABELS[res.activeTab.index] : null,
			activeTabIndex: res.activeTab ? res.activeTab.index : null,
			badge: res.badge,
			cards
		});
		if (!opts.quiet) {
			console.log(
				`  ${path.basename(file)}  ${res.width}x${res.height}  カード ${cards.length}枚  ` +
					`タブ ${res.activeTab ? TAB_LABELS[res.activeTab.index] : '不明'}  ` +
					`バッジ ${res.badge ? 'あり' : 'なし'}  (${res.ms}ms)`
			);
		}
	}
	const index = { set: setName, kind, generatedAt: new Date().toISOString(), images: entries };
	if (outDir) {
		await fs.writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, '\t'), 'utf-8');
	}
	return index;
}

async function main() {
	const kind = argValue('kind', 'images');
	const only = argValue('set', null);
	// 同じ撮影セットから複数の切り出しを作るとき（鮮明フレームとブレたフレーム等）の出し分け
	const outName = argValue('out', null);
	const crops = !process.argv.includes('--no-crops');
	const sets = only ? [only] : listSets(kind);
	if (!sets.length) {
		console.error(`${kind}/ に撮影セットがありません（素材フォルダ: 環境変数か .skillset-assets.json で指定）`);
		process.exit(1);
	}
	const analyzer = await openAnalyzer();
	try {
		for (const setName of sets) {
			console.log(`\n[${kind}/${setName}]`);
			const index = await extractSet(analyzer, kind, setName, { crops, out: outName });
			if (!index) {
				console.log('  画像がありません');
				continue;
			}
			const total = index.images.reduce((n, e) => n + e.cards.length, 0);
			console.log(`  合計 ${total}枚のカードを切り出した`);
			if (crops) console.log(`  → ${relToAssets(assetsDir('crops', outName || setName))}/`);
		}
	} finally {
		await analyzer.close();
	}
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch((e) => {
		console.error(e.message || e);
		process.exit(1);
	});
}
