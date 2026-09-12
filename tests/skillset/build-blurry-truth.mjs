// ブレたフレーム（実劣化サンプル）のカードに正解を付け、あわせて
// 「確認を経ずに誤ったスキルが入る」件数を数える。
//
//   node tests/skillset/build-blurry-truth.mjs --set=2026-09-12a
//
// ■ 正解の決め方と、その限界
//   同じカードを前処理の変種ごとに複数回読んでいる。そのうち**1つでも、
//   そのタブに実在するスキル名と完全に一致した**読みがあれば、それを正解とする。
//   （タブに何が入っているかは、鮮明フレーム側で確定済みの一覧を使う）
//   1回も一致しなかったカードには正解を付けない。
//   → **この正解の付け方は、読めたカードに偏る。** 実劣化の「完全一致率」を
//     この正解で測ると甘く出るので、率の比較には使わない。文字の誤りの集計に使う。
//
// ■ 偏りのない見方（こちらを率の比較に使う）
//   タブに入っているスキルの一覧が分かっているので、
//   **一意に一致した結果がその一覧に無ければ、正解を知らなくても「誤り」と断定できる。**
//   確認を経ずに誤ったスキルが入る危険を、偏りなしに数えられる。
//
// 出力: truth/<セット>-blurry.json と、標準出力の集計

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { assetsRoot, assetsDir, relToAssets } from './lib/assets.mjs';
import { loadMaster, normalizeWithoutConfusion } from './lib/common-in-node.mjs';
import { buildMatcher, isAutoAccepted } from './lib/match.mjs';
import { combineReads } from './run-ocr-crops.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
	const setName = argValue('set', '2026-09-12a');
	const blurrySet = `${setName}-blurry`;
	const root = assetsRoot();

	// タブごとに「そのタブに実在するスキル名」の一覧を作る。
	// --universe に別の撮影セットを足せる（同じスキルセットを静止画でも撮っている場合。
	// 動画だけでは読めなかった分が埋まり、一覧が完全になる）。
	const universeSets = [setName, ...String(argValue('universe', '')).split(',').map((s) => s.trim()).filter(Boolean)];
	const universeByTab = new Map();
	const completeTabs = new Set();
	for (const s of universeSets) {
		const file = path.join(root, 'truth', `${s}.json`);
		if (!fsSync.existsSync(file)) { console.log(`※ truth/${s}.json が無いので一覧に足せません`); continue; }
		const t = JSON.parse(await fs.readFile(file, 'utf-8'));
		t.cards.forEach((c) => {
			if (!c.skillName) return;
			const tab = c.tab || '不明';
			if (!universeByTab.has(tab)) universeByTab.set(tab, new Set());
			universeByTab.get(tab).add(c.skillName);
		});
		// 「読めた種類数＝設定数」が確認できたタブだけ、一覧が完全だとみなす
		(t.tabs || []).forEach((x) => { if (x.ok) completeTabs.add(x.tab); });
	}
	const allNames = new Set([...universeByTab.values()].flatMap((s) => [...s]));
	console.log(`一覧（${universeSets.join(' + ')}）: ${[...universeByTab].map(([t, s]) => `${t} ${s.size}種${completeTabs.has(t) ? '（設定数と一致＝完全）' : '（不完全）'}`).join(' / ')}`);

	const reportsDir = path.join(root, 'reports');
	const files = fsSync.readdirSync(reportsDir).filter((f) => f.startsWith(`ocr-${blurrySet}-`) && f.endsWith('.json'));
	if (!files.length) {
		console.error(`reports/ocr-${blurrySet}-*.json がありません（先に run-ocr-crops.mjs --set=${blurrySet}）`);
		process.exit(1);
	}
	const readsById = new Map();
	const tabById = new Map();
	for (const f of files) {
		const rep = JSON.parse(await fs.readFile(path.join(reportsDir, f), 'utf-8'));
		rep.rows.forEach((r) => {
			if (!readsById.has(r.id)) readsById.set(r.id, []);
			const list = readsById.get(r.id);
			(r.texts || [r.text]).forEach((t) => { if (!list.includes(t)) list.push(t); });
		});
	}
	// タブはカードの切り出し明細から取る
	const index = JSON.parse(await fs.readFile(path.join(root, 'crops', blurrySet, 'index.json'), 'utf-8'));
	index.images.forEach((im) => im.cards.forEach((c) => tabById.set(c.id, im.activeTab || '不明')));

	// 1) 読みの中に「そのタブに実在する名前と完全一致」があれば、それを正解にする
	const strictUniverse = new Map();
	allNames.forEach((n) => strictUniverse.set(normalizeWithoutConfusion(n), n));
	const master = loadMaster();
	const masterByName = new Map(master.map((s) => [s.name, s]));
	const cards = [];
	let decided = 0;
	for (const [id, texts] of readsById) {
		const tab = tabById.get(id) || '不明';
		const universe = universeByTab.get(tab);
		let name = null;
		if (!universe) { cards.push({ id, tab, skillName: null, skillId: null, inMaster: false, decidedBy: null }); continue; }
		for (const t of texts) {
			const hit = strictUniverse.get(normalizeWithoutConfusion(t));
			if (hit && universe.has(hit)) { name = hit; break; }
		}
		if (name) decided++;
		const inMaster = !!(name && masterByName.has(name));
		cards.push({
			id,
			tab,
			skillName: name,
			skillId: inMaster ? masterByName.get(name).id : null,
			inMaster,
			decidedBy: name ? 'consensus-exact（読みの中の完全一致。読めたカードに偏る）' : null
		});
	}
	console.log(`ブレたフレームのカード ${cards.length}枚のうち ${decided}枚に正解を付けられた（残りは正誤の対象外）`);

	// 2) 偏りのない誤り検出: 一意に一致した結果が、そのタブの一覧に無ければ誤り
	const matcher = buildMatcher(master);
	let autoAccepted = 0, outsideUniverse = 0;
	const wrongExamples = [];
	let skippedNoUniverse = 0;
	for (const [id, texts] of readsById) {
		const tab = tabById.get(id) || '不明';
		// 一覧が**完全だと確認できたタブ**だけを検査対象にする。
		// 不完全な一覧で見ると、まだ読めていないスキルに当たっただけで「誤り」と数えてしまう。
		if (!completeTabs.has(tab) || !universeByTab.has(tab)) { skippedNoUniverse++; continue; }
		const universe = universeByTab.get(tab);
		const { chosen } = combineReads(texts.map((t) => ({ text: t, confidence: 0 })), matcher);
		if (!isAutoAccepted(chosen.category) || !chosen.skill) continue;
		autoAccepted++;
		if (!universe.has(chosen.skill.name)) {
			outsideUniverse++;
			if (wrongExamples.length < 20) wrongExamples.push({ id, tab, matched: chosen.skill.name, texts });
		}
	}
	console.log(
		`一意に一致した ${autoAccepted}枚のうち、そのタブに存在しないスキルに当たった＝**確実に誤り** ${outsideUniverse}枚` +
			(skippedNoUniverse ? `（一覧が完全だと確認できていないタブの ${skippedNoUniverse}枚は検査の対象外）` : '')
	);
	wrongExamples.forEach((w) => console.log(`  ${w.id}（${w.tab}） → ${w.matched}   読み: ${JSON.stringify(w.texts)}`));

	const out = {
		set: blurrySet,
		kind: 'frames-blurry',
		confirmedBy: 'build-blurry-truth（読みの中の完全一致。暫定・読めたカードに偏る）',
		confirmedAt: new Date().toISOString(),
		universe: Object.fromEntries([...universeByTab].map(([t, s]) => [t, [...s]])),
		unbiasedCheck: { autoAccepted, outsideUniverse, examples: wrongExamples },
		cards
	};
	const outFile = path.join(assetsDir('truth'), `${blurrySet}.json`);
	await fs.writeFile(outFile, JSON.stringify(out, null, '\t'), 'utf-8');
	console.log(`→ ${relToAssets(outFile)}`);
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
