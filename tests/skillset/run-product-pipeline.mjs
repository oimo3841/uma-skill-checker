// 製品と同じ経路（js/skillset-ocr.js をそのまま読む）で素材を通し、確定した正解と突き合わせる回帰テスト。
//
//   npm run skillset:product                                  … 既定は images/2026-09-11a（静止画4枚）
//   npm run skillset:product -- --set=20260912_3-full --kind=frames
//   npm run skillset:product -- --set=20260912_1-full --kind=frames --limit=20   … 先頭20枚だけ
//   npm run skillset:product -- --set=2026-09-11a --no-auto-accept                … 決定 B-2 のフラグを倒して測る
//   npm run skillset:product -- --set=2026-09-11a --ignore-quality                 … 画質ゲートを通さずに測る
//
// 見るもの（Step 0 報告 T2-5・T3-4 の数え方をそのまま回帰テストにしたもの）:
//   (1) 画面に無いスキルを取り込んだ枚数 … **0 でなければ失敗**（製品の出力は集合なので、これだけが本当の害）
//   (2) 覆えた種類 / 画面にある種類（マスター内の白だけで数える。金・マスター外は分母から外す）
//   (3) 確認に回る行数（自動採用されなかった review と、読みはあるが候補が無い none）
//   基準値（BASELINES）を持つセットは、(2) が基準を下回るか (3) が基準を上回れば失敗。
//
// 正解（truth/<セット>.json）は人が確認済みのものを使う。半解像度のセットは同じ収録の -full の正解で見る
// （--truth=<セット> で明示できる）。
//
// ハーネス（tests/skillset/lib/ocr.mjs）と違い、ここでは前処理も照合も **js/skillset-ocr.js の実装をそのまま**
// ブラウザの中で呼ぶ。ロジックの複製は持たない。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetsRoot, listFiles, relToAssets } from './lib/assets.mjs';
import { openOcr } from './lib/ocr.mjs';
import { fileToDataUrl } from './lib/browser.mjs';
import { loadMaster } from './lib/common-in-node.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

/**
 * 基準値（28セッション目・コミット2の実測。決定 B-2 の自動採用あり・画質ゲートあり）。
 * outside は常に 0 が条件。coverage は「これ以上」、review は「これ以下」で通す。
 * 数字を更新するときは、何を変えてどう動いたかを HANDOFF の C-24 に書くこと。
 */
const BASELINES = {
	// 白 49/52（取りこぼし: 連綿・存在感・末脚）・確認行き 2（「守在盛」「本瞞」）・画面に無いもの 0。
	// Step 0 報告の T2-5（集合の指標）と同じ数字。
	'2026-09-11a': { coverage: [49, 52], review: 2 },
	// 通常タブの無劣化フレーム21枚（--kind=frames）。白 39/40（取りこぼし: 綺羅星）・確認行き 7
	// （マスターに無い 気勢を上げて／立ち合い／アスリート魂 の読みと、バッジに隠れた読み）・画面に無いもの 0。
	// 約4分かかるので既定では回さない。
	'20260912_3-full': { coverage: [39, 40], review: 7 }
};

export async function runProductPipeline(opts) {
	const setName = opts.set;
	const kind = opts.kind || 'images';
	const truthName = opts.truth || setName;
	const dir = path.join(assetsRoot(), kind, setName);
	let files = listFiles(dir, ['.png', '.jpg', '.jpeg', '.webp']);
	if (!files.length) throw new Error(`${kind}/${setName} に画像がありません`);
	if (opts.limit) files = files.slice(0, opts.limit);

	const truthFile = path.join(assetsRoot(), 'truth', `${truthName}.json`);
	const truth = fs.existsSync(truthFile) ? JSON.parse(fs.readFileSync(truthFile, 'utf-8')) : null;
	const master = loadMaster();
	const masterNames = new Set(master.map((s) => s.name));

	const ocr = await openOcr({ psm: '7' });
	try {
		await ocr.page.evaluate((entries) => {
			window.__dict = window.SkillsetOcr.buildMasterDictionary(entries);
			window.__skillsetPerImage = [];
		}, master.map((s) => ({ id: String(s.id), name: s.name })));
		await ocr.page.evaluate((flags) => {
			window.SkillsetOcr.OPTIONS.AUTO_ACCEPT_NEAR_MATCH = !!flags.autoAccept;
		}, { autoAccept: !opts.noAutoAccept });

		console.log(`\n[${kind}/${setName}] ${files.length}枚 / 正解 ${truth ? relToAssets(truthFile) : '無し'} / 自動採用 ${opts.noAutoAccept ? 'OFF' : 'ON'} / 画質ゲート ${opts.ignoreQuality ? 'OFF' : 'ON'}`);
		for (const file of files) {
			const dataUrl = await fileToDataUrl(file);
			const line = await ocr.page.evaluate(async ([u, name, ignoreQuality]) => {
				const img = new Image();
				await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('画像を読めませんでした')); img.src = u; });
				const r = await window.SkillsetOcr.processImage(img, name, { worker: window.__worker, dict: window.__dict, ignoreQuality });
				window.__skillsetPerImage.push(r);
				return window.SkillsetOcr.formatImageLog(r);
			}, [dataUrl, path.basename(file), !!opts.ignoreQuality]);
			console.log('  ' + line);
		}
		const merged = await ocr.page.evaluate(() => {
			const m = window.SkillsetOcr.mergeSkillsetResults(window.__skillsetPerImage);
			const goldKinds = [];
			m.gold.byKey.forEach((cards, key) => goldKinds.push({ key, count: cards.length, raw: cards[0].raw }));
			return {
				rows: m.rows.map((r) => ({ raw: r.raw, norm: r.norm, kind: r.kind, matchedId: r.matchedId, matchedName: r.matchedName, distance: r.distance, autoAccepted: r.autoAccepted, reason: r.reason, candidates: r.candidates })),
				white: m.white,
				gold: { kinds: m.gold.kinds, cards: m.gold.cards, list: goldKinds },
				unknown: m.unknown,
				tabs: m.tabs,
				quality: m.quality,
				inkHeight: m.inkHeight
			};
		});
		return summarize(merged, truth, masterNames, setName, opts);
	} finally {
		await ocr.close();
	}
}

function summarize(m, truth, masterNames, setName, opts) {
	const accepted = m.rows.filter((r) => r.kind === 'exact' || (r.kind === 'review' && r.autoAccepted));
	const review = m.rows.filter((r) => !(r.kind === 'exact' || (r.kind === 'review' && r.autoAccepted)));
	let fails = 0;
	const check = (cond, label, extra) => { if (!cond) fails++; console.log((cond ? '[OK] ' : '[NG] ') + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };

	console.log(`  画質: 拒否 ${m.quality.skipped.length}枚 / 警告 ${m.quality.warned.length}枚` +
		(m.quality.skipped.length ? ' 拒否=' + m.quality.skipped.map((s) => `${s.name}(${s.kinds.join(',')})`).join(' ') : ''));
	console.log(`  内訳: ` + m.tabs.map((t) => `タブ${t.index == null ? '不明' : t.index + 1}: 画像${t.images} 検出${t.detected}（白${t.lavender} 金${t.gold} 不明${t.unknown}）設定数${t.badgeCount == null ? '読めず' : t.badgeCount}`).join(' / '));
	console.log(`  白: 確認なしで採用 ${m.white.accepted}種 / 確認行き ${m.white.review}行 / 読めない ${m.white.unreadable}枚`);
	console.log(`  金: ${m.gold.kinds}種（${m.gold.cards}枚）` + (m.gold.list.length ? ' … ' + m.gold.list.map((g) => g.raw).slice(0, 12).join(' / ') : '') + ` / 地の色が不明 ${m.unknown}枚`);
	console.log(`  文字の高さ: 中央値 ${m.inkHeight.median}px（${m.inkHeight.min}〜${m.inkHeight.max}・${m.inkHeight.n}枚）`);
	if (review.length) console.log('  確認行き: ' + review.map((r) => `「${r.raw}」${r.reason}${r.candidates.length ? '→' + r.candidates.slice(0, 3).map((c) => c.name).join('|') : ''}`).join(' ／ '));

	if (!truth) {
		console.log('  正解が無いので突き合わせは省略');
		return { fails, m };
	}
	const onScreen = new Set((truth.cards || []).map((c) => c.skillName).filter(Boolean));
	const onScreenWhite = new Set([...onScreen].filter((n) => masterNames.has(n)));
	const got = new Set(accepted.map((r) => r.matchedName));
	const outside = [...got].filter((n) => !onScreen.has(n));
	const covered = [...got].filter((n) => onScreenWhite.has(n));
	const missing = [...onScreenWhite].filter((n) => !got.has(n));
	const notWhite = [...onScreen].filter((n) => !masterNames.has(n));
	console.log(`  正解: 画面にある ${onScreen.size}種（マスター内 ${onScreenWhite.size}・マスター外 ${notWhite.length}${notWhite.length ? '＝' + notWhite.slice(0, 8).join('/') : ''}）`);
	console.log(`  (2) 覆えた種類 ${covered.length} / ${onScreenWhite.size}（${((covered.length / Math.max(1, onScreenWhite.size)) * 100).toFixed(1)}%）` + (missing.length ? ' 取りこぼし: ' + missing.join(' / ') : ''));
	console.log(`  (3) 確認に回る行 ${review.length}`);
	check(outside.length === 0, `(1) 画面に無いスキルを取り込んでいない`, outside.length ? outside : 0);
	const base = BASELINES[setName];
	if (base && !opts.noAutoAccept && !opts.ignoreQuality && !opts.limit) {
		check(covered.length >= base.coverage[0] && onScreenWhite.size === base.coverage[1], `(2) 覆えた種類が基準（${base.coverage[0]}/${base.coverage[1]}）以上`, [covered.length, onScreenWhite.size]);
		check(review.length <= base.review, `(3) 確認に回る行が基準（${base.review}）以下`, review.length);
	} else {
		console.log('  （基準値は無い、または条件を変えているので比較は省略）');
	}
	return { fails, m, outside, covered, onScreenWhite, review };
}

async function main() {
	const opts = {
		set: argValue('set', '2026-09-11a'),
		kind: argValue('kind', 'images'),
		truth: argValue('truth', null),
		limit: Number(argValue('limit', 0)) || 0,
		noAutoAccept: process.argv.includes('--no-auto-accept'),
		ignoreQuality: process.argv.includes('--ignore-quality')
	};
	const r = await runProductPipeline(opts);
	console.log(r.fails ? `\n=== 製品経路の回帰: NG（${r.fails}件） ===` : '\n=== 製品経路の回帰: OK ===');
	process.exit(r.fails ? 1 : 0);
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch((e) => {
		console.error(e.stack || e.message || e);
		process.exit(1);
	});
}
