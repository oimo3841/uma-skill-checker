// 網羅状況のレポート。
//
//   node tests/skillset/report-coverage.mjs
//
// 確定した正解（truth/*.json）に出てきたスキルと、UmaSkill Deck のマスター445種の差分を出す。
// おいもさんはこの一覧を見て、まだ撮っていないスキルをスキルセットに入れて撮影する。
//
// スキルセット画面にはマスターに無いスキル（固有スキルなど）も並ぶ。
// それは「445の網羅」とは別の話なので、混ぜずに分けて出す。
//
// 出力: reports/coverage.md と reports/coverage.json

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { assetsRoot, assetsDir, relToAssets } from './lib/assets.mjs';
import { loadMaster } from './lib/common-in-node.mjs';

function loadTruths() {
	const dir = path.join(assetsRoot(), 'truth');
	if (!fsSync.existsSync(dir)) return [];
	return fsSync
		.readdirSync(dir)
		.filter((f) => f.endsWith('.json') && !f.endsWith('.draft.json') && !f.endsWith('.overrides.json'))
		.map((f) => ({ file: f, json: JSON.parse(fsSync.readFileSync(path.join(dir, f), 'utf-8')) }));
}

async function main() {
	const master = loadMaster();
	const masterNames = new Set(master.map((s) => s.name));
	const truths = loadTruths();
	if (!truths.length) {
		console.error('truth/*.json がありません');
		process.exit(1);
	}

	const seen = new Map(); // スキル名 → 出てきたセット
	// **名前の候補はあるが確定していない**もの（暫定の正解で decidedBy が 'check' のカード）。
	// 多数決で決まらなかった行にも「最多得票の名前」は入っているが、それを「撮れた」と数えると
	// 網羅を水増しする。分けて出し、おいもさんの確認で確定したら seen に移る。
	const candidate = new Map();
	const provisional = [];
	truths.forEach((t) => {
		if (String(t.json.confirmedBy || '').includes('claude') || String(t.json.confirmedBy || '').includes('暫定')) {
			provisional.push(t.file);
		}
		(t.json.cards || []).forEach((c) => {
			if (!c.skillName) return;
			const confirmed = !c.decidedBy || c.decidedBy === 'voted' || c.decidedBy === 'override';
			const map = confirmed ? seen : candidate;
			if (!map.has(c.skillName)) map.set(c.skillName, new Set());
			map.get(c.skillName).add(t.json.set || t.file);
		});
	});

	const covered = [...seen.keys()].filter((n) => masterNames.has(n)).sort();
	const outsideMaster = [...seen.keys()].filter((n) => !masterNames.has(n)).sort();
	const candidateOnly = [...candidate.keys()].filter((n) => masterNames.has(n) && !seen.has(n)).sort();
	const missing = master.map((s) => s.name).filter((n) => !seen.has(n) && !candidate.has(n));

	console.log(`確定済み（暫定を含む）: ${seen.size}種`);
	console.log(`  うちマスター445種にあるもの: ${covered.length} / ${master.length}（${((covered.length / master.length) * 100).toFixed(1)}%）`);
	console.log(`  マスターに無いもの（固有スキル等。445の網羅とは別）: ${outsideMaster.length}`);
	console.log(`名前の候補はあるが未確定（要確認の行の最多得票）: ${candidateOnly.length}種`);
	console.log(`まだ撮れていないマスターのスキル（候補も無い）: ${missing.length}`);
	if (provisional.length) console.log(`※ 暫定の正解を含む: ${provisional.join(', ')}`);

	const lines = [];
	lines.push('# スキルセットOCR 検証素材の網羅状況');
	lines.push('');
	lines.push(`生成: ${new Date().toISOString()}`);
	lines.push('');
	lines.push(`- マスター（UmaSkill Deck）: **${master.length}種**`);
	lines.push(`- 正解が確定しているもの: **${covered.length}種**（${((covered.length / master.length) * 100).toFixed(1)}%）`);
	lines.push(`- 名前の候補はあるが未確定のもの（要確認の行の最多得票。確認で確定すれば上に移る）: **${candidateOnly.length}種**`);
	lines.push(`- まだ撮れていないもの（候補も無い）: **${missing.length}種**`);
	lines.push(`- スキルセット画面に出たが**マスターに無い**もの: ${outsideMaster.length}種（固有スキル等。445の網羅には数えない）`);
	if (provisional.length) {
		lines.push('');
		lines.push(`> ⚠ 次の正解ファイルはまだ**暫定**（おいもさんの確認前）です: ${provisional.join(' / ')}`);
	}
	lines.push('');
	lines.push('## まだ撮れていないスキル');
	lines.push('');
	lines.push('スキルセットに入れて撮影すると、この一覧が減ります。');
	lines.push('スキルセットに入れられないスキル（固有スキル等）がある場合は、その分は「未検証」のままになります。');
	lines.push('1タブ200種まで入るので、3セットほどで埋まる見込みです。');
	lines.push('');
	missing.forEach((n) => lines.push(`- [ ] ${n}`));
	lines.push('');
	lines.push('## 名前の候補はあるが未確定（要確認の行。おいもさんの確認待ち）');
	lines.push('');
	lines.push('多数決で決まらなかった行の最多得票の名前。読み違いの可能性があるので「撮れた」とは数えていない。');
	lines.push('`reports/review-<セット>.html` で確認して保存すると、確定済みへ移る。');
	lines.push('');
	candidateOnly.forEach((n) => lines.push(`- [ ] ${n}  <small>${[...candidate.get(n)].join(', ')}</small>`));
	lines.push('');
	lines.push('## 確定済み（マスターにあるもの）');
	lines.push('');
	covered.forEach((n) => lines.push(`- ${n}  <small>${[...seen.get(n)].join(', ')}</small>`));
	lines.push('');
	lines.push('## スキルセット画面に出たが、マスターに無いもの');
	lines.push('');
	lines.push('マスター（445種）は因子で継承できるスキルだけを持っています。');
	lines.push('スキルセット画面にはそれ以外も並ぶため、OCRの照合対象には入りません。');
	lines.push('');
	outsideMaster.forEach((n) => lines.push(`- ${n}  <small>${[...seen.get(n)].join(', ')}</small>`));

	const mdFile = path.join(assetsDir('reports'), 'coverage.md');
	await fs.writeFile(mdFile, lines.join('\n'), 'utf-8');
	const jsonFile = path.join(assetsDir('reports'), 'coverage.json');
	await fs.writeFile(
		jsonFile,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				masterCount: master.length,
				coveredCount: covered.length,
				candidateOnlyCount: candidateOnly.length,
				missingCount: missing.length,
				outsideMasterCount: outsideMaster.length,
				provisionalTruthFiles: provisional,
				covered,
				candidateOnly,
				missing,
				outsideMaster
			},
			null,
			'\t'
		),
		'utf-8'
	);
	console.log(`\n→ ${relToAssets(mdFile)}`);
	console.log(`→ ${relToAssets(jsonFile)}`);
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
