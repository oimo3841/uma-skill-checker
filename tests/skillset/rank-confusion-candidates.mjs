// 読み替え候補（CHAR_CONFUSION_MAP への追加）を、採用判断のために優先順に並べて3段に分ける。
//
//   node tests/skillset/rank-confusion-candidates.mjs \
//     --sets=20260912_1-full,20260912_2-full,20260912_3-full \
//     --candidates=1180x2556 --common-with=592x1280 [--min-count=3] [--tier1-min-skills=3] [--no-exam]
//
// **この道具は採用も実装もしない。** 材料を並べるだけ（js/common.js は変更しない。
// CHAR_CONFUSION_MAP への追加はおいもさんの承認後に別途）。
//
// 材料（候補ごと）:
//   - 置き換えの内容（誤読字→正字）／何種のスキルで起きたか（共通スキル・全体）／延べ回数
//   - 評価コーパス（人の確認済みの正解を持つセット）で、その字を読みに含むカードの枚数
//   - 採用した場合の見込み: 確認なしで取り込めるようになる枚数（＝新たに一意に一致）、
//     **誤着地（一意に一致したが誤り）の増減**、確認に回る行の増減
//   - 影響するスキルの名前の文字数（2文字以下があるか。短い名前は許容距離0なので1文字の誤読で
//     読めない扱いになり、読み替えでしか救えない）
//   - 衝突検査: 採用するとマスター445種（と exam.html の133種）の別々の名前が正規化後に同じになるか。
//     既存の読み替えとの食い違い（同じ字が別の字へ）も見る
//
// 3段:
//   第1段 … 衝突なし・誤着地が増えない・（共通スキル ≥ tier1-min-skills か、2文字以下のスキルを救う）・見込み ≥ 1枚
//   第2段 … 衝突なし・誤着地が増えない・共通スキル 2種以上・見込み ≥ 1枚（第1段に入らないもの）
//   第3段 … 衝突する／既存の読み替えと食い違う／誤着地が増える／1種でしか起きていない／見込み 0枚（採用見送り）
// 段ごとに「まとめて足した場合」も評価する（第1段だけ／第1段＋第2段）。
//
// 出力: reports/confusion-adoption-plan.md と .json（段ごとの map を持つ。evaluate-confusion-map.mjs --tier=1 が読む）

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetsRoot, assetsDir, relToAssets, REPO_ROOT } from './lib/assets.mjs';
import { common, normalizeWithExtraMap, loadMaster } from './lib/common-in-node.mjs';
import { loadCorpus, evaluate, diff, formatMetrics, expandExtra } from './lib/replay.mjs';

function argValue(name, fallback) {
	const hit = process.argv.filter((a) => a.startsWith(`--${name}=`)).pop();
	return hit ? hit.slice(name.length + 3) : fallback;
}

async function examSkillNames() {
	const { chromium } = await import('playwright');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto(pathToFileURL(path.join(REPO_ROOT, 'exam.html')).href, { waitUntil: 'load' });
		return await page.evaluate(() => EXAM_SKILL_LIST.map((s) => (typeof s === 'string' ? s : s.name)));
	} finally {
		await browser.close();
	}
}

/** 読み替えを足したとき、別々の名前が正規化後に同じ文字列に潰れないか（新たに生まれる衝突だけ）。 */
export function collisions(names, extra) {
	const before = new Map();
	const after = new Map();
	names.forEach((n) => {
		const b = common.normalizeText(n);
		const a = normalizeWithExtraMap(n, extra);
		if (!before.has(b)) before.set(b, []);
		before.get(b).push(n);
		if (!after.has(a)) after.set(a, []);
		after.get(a).push(n);
	});
	const out = [];
	for (const [key, list] of after) {
		const uniq = [...new Set(list)];
		if (uniq.length < 2) continue;
		const wasAlready = uniq.every((n) => (before.get(common.normalizeText(n)) || []).length > 1);
		if (!wasAlready) out.push({ normalized: key, names: uniq });
	}
	return out;
}

async function main() {
	const sets = (argValue('sets', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
	if (!sets.length) throw new Error('--sets=<セット,...>（人の確認済みの正解を持つセット）を指定してください');
	const candLabel = argValue('candidates', '1180x2556');
	const commonLabel = argValue('common-with', '592x1280');
	const minCount = Number(argValue('min-count', '3'));
	const tier1MinSkills = Number(argValue('tier1-min-skills', '3'));
	const useExam = !process.argv.includes('--no-exam');
	const reportsDir = path.join(assetsRoot(), 'reports');

	const candRep = JSON.parse(fsSync.readFileSync(path.join(reportsDir, `confusions-${candLabel}.json`), 'utf-8'));
	const otherRep = fsSync.existsSync(path.join(reportsDir, `confusions-${commonLabel}.json`))
		? JSON.parse(fsSync.readFileSync(path.join(reportsDir, `confusions-${commonLabel}.json`), 'utf-8'))
		: null;
	const commonSkills = new Set(otherRep ? candRep.skills.filter((n) => otherRep.skills.includes(n)) : candRep.skills);

	const corpus = loadCorpus(sets);
	console.log(`評価コーパス: ${corpus.sets.join(', ')} … カード ${corpus.cards.length}枚・行 ${corpus.rows.length}`);
	const baseline = evaluate(corpus, {});
	console.log(`採用前: ${formatMetrics(baseline)}`);
	const master = loadMaster();
	const masterNames = master.map((s) => s.name);
	const lenOf = new Map(master.map((s) => [s.name, [...s.name].length]));
	let examNames = [];
	if (useExam) {
		try { examNames = await examSkillNames(); } catch (e) { console.log(`※ exam.html の133種を読めませんでした（${String(e.message).split('\n')[0]}）。マスターだけで検査します`); }
	}
	console.log(`候補の出どころ: confusions-${candLabel}.json（${candRep.skillCount}種）／共通スキル: ${commonLabel} と共通の ${commonSkills.size}種`);

	const candidates = candRep.substitutions
		.filter((s) => s.count >= minCount)
		.map((s) => ({ ...s, commonSkills: s.skills.filter((n) => commonSkills.has(n)) }));
	// 照合し直すのは、共通スキルで2種以上起きた候補と、**2文字以下のスキルで起きた候補**。
	// 後者は「その字がその名前にしか無い」ので1種でしか起きず、2種以上の基準では必ず第3段になるが、
	// 短い名前は許容距離が0で1文字の誤読で読めない扱いになる＝読み替えでしか救えないので、
	// 参考として見込みと衝突を付けて別枠に出す（採用の基準に入れるかはおいもさんが決める）。
	const isShort = (n) => (lenOf.get(n) || [...n].length) <= 2;
	const toReplay = candidates.filter((c) => c.commonSkills.length >= 2 || c.skills.some(isShort));
	console.log(`候補 ${candidates.length}件（延べ ${minCount}回以上）。うち共通スキルで2種以上、または2文字以下のスキルで起きた ${toReplay.length}件を照合し直します…`);

	const results = [];
	let done = 0;
	for (const c of candidates) {
		// 候補は統一後の字。実際に足す項目は統一前の字にも広げる（例: 二→ー なら ニ→ー も）
		const extra = expandExtra({ [c.from]: c.to });
		const entries = Object.entries(extra).map(([a, b]) => `${a}→${b}`);
		// 既存の読み替えとの食い違い: 展開した字のどれかが既に別の字へ向いていないか
		const conflicts = Object.keys(extra).filter((k) => common.CHAR_CONFUSION_MAP[k] !== undefined && common.CHAR_CONFUSION_MAP[k] !== c.to).map((k) => `${k}→${common.CHAR_CONFUSION_MAP[k]}`);
		const already = Object.keys(extra).every((k) => common.CHAR_CONFUSION_MAP[k] === c.to) ? c.to : null;
		const replay = c.commonSkills.length >= 2 || c.skills.some(isShort);
		const colMaster = replay ? collisions(masterNames, extra) : [];
		const colExam = replay && examNames.length ? collisions(examNames, extra) : [];
		const ev = replay ? evaluate(corpus, extra, baseline) : baseline;
		const d = replay ? diff(baseline, ev) : { autoRightDelta: 0, exactDelta: 0, autoWrongDelta: 0, checkDelta: 0, decidedWrongDelta: 0 };
		const fromChars = Object.keys(extra);
		const affectedCards = corpus.cards.filter((k) => k.readsSharp.some((t) => fromChars.some((ch) => String(t).includes(ch)))).length;
		const lens = c.skills.map((n) => lenOf.get(n) || [...n].length);
		const shortSkills = c.skills.filter((n) => (lenOf.get(n) || [...n].length) <= 2);
		const shortCommon = c.commonSkills.filter((n) => (lenOf.get(n) || [...n].length) <= 2);
		const reasons = [];
		if (conflicts.length) reasons.push(`既存の読み替えと食い違う（${conflicts.join('・')}）`);
		if (already) reasons.push('既にマップにある');
		if (colMaster.length) reasons.push(`マスターで衝突: ${colMaster.map((x) => x.names.join('／')).join('、')}`);
		if (colExam.length) reasons.push(`exam で衝突: ${colExam.map((x) => x.names.join('／')).join('、')}`);
		if (d.autoWrongDelta > 0) reasons.push(`誤着地が ${d.autoWrongDelta}件増える`);
		if (d.decidedWrongDelta > 0) reasons.push(`行の誤確定が ${d.decidedWrongDelta}件増える`);
		if (c.commonSkills.length <= 1) reasons.push(`共通スキルでは ${c.commonSkills.length}種でしか起きていない${replay ? '' : '（照合し直していない）'}`);
		if (replay && d.autoRightDelta <= 0 && !reasons.length) reasons.push('見込み 0枚（評価コーパスでは判定が変わらない）');
		let tier;
		if (reasons.length) tier = 3;
		else if (c.commonSkills.length >= tier1MinSkills || shortCommon.length) tier = 1;
		else tier = 2;
		results.push({
			from: c.from, to: c.to, entries, count: c.count, skillCount: c.skillCount, commonSkillCount: c.commonSkills.length,
			skills: c.skills, commonSkills: c.commonSkills, affectedCards, minLen: Math.min(...lens), shortSkills, shortCommon,
			already, collisionsMaster: colMaster, collisionsExam: colExam,
			gainAuto: d.autoRightDelta, gainExact: d.exactDelta, autoWrongDelta: d.autoWrongDelta, checkDelta: d.checkDelta, decidedWrongDelta: d.decidedWrongDelta,
			wrongs: replay ? ev.card.wrongs.filter((w) => !baseline.card.wrongs.some((b) => b.set === w.set && b.id === w.id)) : [],
			replayed: replay, tier, reasons
		});
		if (replay) { done++; if (done % 10 === 0) console.log(`  …${done}/${toReplay.length}  ${new Date().toTimeString().slice(0, 8)}`); }
	}
	// 並べ方: 段 → 2文字以下を救う → 共通種数 → 見込み枚数
	results.sort((a, b) => a.tier - b.tier || b.shortCommon.length - a.shortCommon.length || b.commonSkillCount - a.commonSkillCount || b.gainAuto - a.gainAuto || b.count - a.count);
	// 同じ字を別の字へ向ける候補どうし（例: 謬→護 と 謬→離）は両立しない。見込みの大きいほうを残し、他は第3段へ
	const seenFrom = new Map();
	results.forEach((r) => {
		if (r.tier === 3) return;
		const first = seenFrom.get(r.from);
		if (!first) { seenFrom.set(r.from, r); return; }
		r.tier = 3;
		r.reasons.push(`同じ字を別の字へ向ける候補（${first.from}→${first.to}・見込み +${first.gainAuto}）と両立しない`);
	});
	results.sort((a, b) => a.tier - b.tier || b.shortCommon.length - a.shortCommon.length || b.commonSkillCount - a.commonSkillCount || b.gainAuto - a.gainAuto || b.count - a.count);
	// 1件ずつは衝突しなくても、まとめて足すと衝突する組がある（実測: 二→ー と 三→ー で 無二／無三 が同じ文字列に潰れる）。
	// 段の中で優先順に1件ずつ足し、足すと衝突するものは第3段へ落とす（第2段は第1段の上に足す）。
	{
		const acc = {};
		for (const tier of [1, 2]) {
			results.filter((r) => r.tier === tier).forEach((r) => {
				const trial = expandExtra({ ...acc, [r.from]: r.to });
				const cm = collisions(masterNames, trial);
				const ce = examNames.length ? collisions(examNames, trial) : [];
				if (cm.length || ce.length) {
					r.tier = 3;
					r.reasons.push(`先に足した候補と合わせると衝突する（${[...cm, ...ce].map((x) => x.names.join('／')).join('、')}）`);
				} else acc[r.from] = r.to;
			});
		}
	}
	results.sort((a, b) => a.tier - b.tier || b.shortCommon.length - a.shortCommon.length || b.commonSkillCount - a.commonSkillCount || b.gainAuto - a.gainAuto || b.count - a.count);

	// 段ごとにまとめて足した場合（map は統一後の字で持ち、評価と衝突検査のときに展開する）
	const mapOf = (tiers) => Object.fromEntries(results.filter((r) => tiers.includes(r.tier)).map((r) => [r.from, r.to]));
	const cumulative = [];
	for (const [label, tiers] of [['第1段', [1]], ['第1段＋第2段', [1, 2]]]) {
		const map = mapOf(tiers);
		const ev = evaluate(corpus, map, baseline);
		const d = diff(baseline, ev);
		const expanded = expandExtra(map);
		cumulative.push({ label, tiers, size: Object.keys(map).length, map, entries: expanded, metrics: ev, delta: d, collisionsMaster: collisions(masterNames, expanded), collisionsExam: examNames.length ? collisions(examNames, expanded) : [] });
	}

	// 出力
	const pct = (x) => ((x / Math.max(1, corpus.cards.length)) * 100).toFixed(1) + '%';
	const auto = (e) => e.card.autoRight + e.card.autoWrong;
	const lines = [];
	lines.push('# 読み替え候補の採用判断の材料（優先順・3段）');
	lines.push('');
	lines.push(`生成: ${new Date().toISOString()}　**採用も実装もしていない**（js/common.js は無変更。追加はおいもさんの承認後）。`);
	lines.push('');
	lines.push(`- 評価コーパス（人の確認済みの正解）: ${corpus.sets.join('・')} … カード ${corpus.cards.length}枚・行 ${corpus.rows.length}（製品と同じ前処理の読みで判定）`);
	lines.push(`- 候補の出どころ: \`confusions-${candLabel}.json\`（${candRep.skillCount}種）。**共通スキル**＝${commonLabel} と共通の ${commonSkills.size}種（同じ土俵）。延べ ${minCount}回以上の候補 ${candidates.length}件を評価`);
	lines.push(`- 衝突検査: マスター ${masterNames.length}種${examNames.length ? `＋ exam.html ${examNames.length}種` : '（exam は未検査）'}`);
	lines.push('');
	lines.push('## 検証の枠組み（採用ごとに同じ指標を測る）');
	lines.push('');
	lines.push('| 指標 | 意味 | 採用の条件 |');
	lines.push('|---|---|---|');
	lines.push('| **誤着地** | 一意に一致した（確認なしで取り込まれる）のに正解と違うカード | **1件でも増えたら却下**（最優先） |');
	lines.push('| 完全一致率 | exact（読みがそのまま一致）と、確認なしで取り込める率（exact＋viaMap）。読み替えの効き目は後者に出る | 上がること |');
	lines.push('| 確認に回る行 | 多数決の単位（継ぎ合わせた列の1行）のうち確定しない行 | 減ること |');
	lines.push('');
	lines.push('採用ごとの再測定: `node tests/skillset/evaluate-confusion-map.mjs --sets=' + corpus.sets.join(',') + ' --map=誤=正,...`（または `--tier=1` / `--tier=1+2` でこの計画の map を読む）');
	lines.push('');
	lines.push(`**採用前:** ${formatMetrics(baseline)}`);
	lines.push('');
	lines.push('**候補の字と、実際に足す項目の違い:** `common.js` の正規化は「読み替えマップ → 見た目の統一（HOMOGLYPH_MAP: ニ→二・一→ー・ベ→べ など）」の順。誤読の集計は統一後の字で突き合わせるので、候補は統一後の字で出る（OCRがカタカナの「ニ」と読んだものは「二→ー」）。そのまま足しても効かない（実測: 二→ー を足しても判定が1枚も変わらなかった）ので、**統一で同じ字に潰れる字をすべて同じ正字へ向ける項目に展開**して評価している（「実際に足す項目」の列）。');
	lines.push('');
	lines.push('## 段ごとの見込み（まとめて足した場合）');
	lines.push('');
	lines.push('| 段 | 読み替えの数 | 誤着地 | 完全一致（exact） | 確認なしで取り込める | 確認に回る行 | 衝突 |');
	lines.push('|---|---|---|---|---|---|---|');
	lines.push(`| 採用前 | 0 | ${baseline.card.autoWrong} | ${baseline.card.exact}（${pct(baseline.card.exact)}） | ${auto(baseline)}（${pct(auto(baseline))}） | ${baseline.row.check} | — |`);
	cumulative.forEach((cu) => {
		const e = cu.metrics;
		lines.push(`| ${cu.label} | ${cu.size}（項目 ${Object.keys(cu.entries).length}） | **${e.card.autoWrong}**（${cu.delta.autoWrongDelta >= 0 ? '+' : ''}${cu.delta.autoWrongDelta}） | ${e.card.exact}（${pct(e.card.exact)}） | ${auto(e)}（${pct(auto(e))}・${cu.delta.autoDelta >= 0 ? '+' : ''}${cu.delta.autoDelta}） | ${e.row.check}（${cu.delta.checkDelta >= 0 ? '+' : ''}${cu.delta.checkDelta}） | マスター ${cu.collisionsMaster.length} / exam ${cu.collisionsExam.length} |`);
	});
	lines.push('');
	cumulative.forEach((cu) => {
		lines.push(`- ${cu.label} で実際に足す項目（${Object.keys(cu.entries).length}）: ${Object.entries(cu.entries).map(([a, b]) => `${a}→${b}`).join('・')}`);
		if (cu.collisionsMaster.length) lines.push(`  - 衝突（マスター）: ${cu.collisionsMaster.map((x) => x.names.join('／')).join('、')}`);
		if (cu.collisionsExam.length) lines.push(`  - 衝突（exam）: ${cu.collisionsExam.map((x) => x.names.join('／')).join('、')}`);
	});
	lines.push('');
	// 第3段のうち、2文字以下のスキルで起きたものは参考として別枠に出す（見込みと衝突を付けてある）
	const shortRescue = results.filter((r) => r.tier === 3 && r.replayed && r.shortSkills.length && !r.collisionsMaster.length && !r.collisionsExam.length && r.autoWrongDelta === 0 && r.gainAuto > 0)
		.sort((a, b) => b.gainAuto - a.gainAuto || b.count - a.count);
	lines.push('## 参考: 2文字以下のスキルを救う候補（第3段のうち衝突なし・誤着地が増えない・見込み ≥ 1枚）');
	lines.push('');
	lines.push('短い名前の誤読は「その字がその名前にしか無い」ので **1種でしか起きない**。2種以上の基準では必ず第3段になるが、2文字以下は許容距離 0 で1文字の誤読が「読めない」に落ちるため、**読み替えでしか救えない**。');
	lines.push('採用の基準に入れるか（1種のための読み替えを汎用のマップに足すか）はおいもさんが決める。もう1つの手は `allowedDistance` の緩和（`common.js`。別の論点）。');
	lines.push('');
	lines.push('| 候補 | 実際に足す項目 | 2文字以下のスキル | 起きたスキル（全体） | 延べ | 見込み（+枚） | 誤着地（増減） | 確認に回る行（増減） | 衝突 |');
	lines.push('|---|---|---|---|---|---|---|---|---|');
	shortRescue.forEach((r) => lines.push(`| ${r.from}→${r.to} | ${r.entries.join('・')} | **${r.shortSkills.join('・')}** | ${r.skills.join('・')} | ${r.count} | **+${r.gainAuto}** | ${r.autoWrongDelta >= 0 ? '+' : ''}${r.autoWrongDelta} | ${r.checkDelta >= 0 ? '+' : ''}${r.checkDelta} | なし |`));
	if (!shortRescue.length) lines.push('| （該当なし） | | | | | | | | |');
	lines.push('');
	{
		const map = Object.fromEntries(shortRescue.map((r) => [r.from, r.to]));
		if (Object.keys(map).length) {
			const ev = evaluate(corpus, map, baseline);
			const d = diff(baseline, ev);
			const expanded = expandExtra(map);
			const cm = collisions(masterNames, expanded);
			const ce = examNames.length ? collisions(examNames, expanded) : [];
			lines.push(`上の候補をまとめて足した場合（${Object.keys(map).length}件・項目 ${Object.keys(expanded).length}）: 誤着地 ${ev.card.autoWrong}（${d.autoWrongDelta >= 0 ? '+' : ''}${d.autoWrongDelta}）／確認なしで取り込める ${auto(ev)}（${pct(auto(ev))}・${d.autoDelta >= 0 ? '+' : ''}${d.autoDelta}）／確認に回る行 ${ev.row.check}（${d.checkDelta >= 0 ? '+' : ''}${d.checkDelta}）／衝突 マスター ${cm.length} / exam ${ce.length}${cm.length || ce.length ? `（${[...cm, ...ce].map((x) => x.names.join('／')).join('、')}）` : ''}`);
			lines.push('');
			cumulative.push({ label: '参考: 2文字以下を救う候補', tiers: [], size: Object.keys(map).length, map, entries: expanded, metrics: ev, delta: d, collisionsMaster: cm, collisionsExam: ce });
		}
	}
	const tierTitle = { 1: '第1段（種数が多い・衝突なし・短い名前を救う）', 2: '第2段（種数は少ないが衝突なし）', 3: '第3段（衝突・食い違い・誤着地・1種のみ・効果なし＝採用見送り）' };
	for (const t of [1, 2, 3]) {
		const list = results.filter((r) => r.tier === t);
		lines.push(`## ${tierTitle[t]} — ${list.length}件`);
		lines.push('');
		lines.push('| 候補 | 実際に足す項目 | 共通スキル（種） | 全体（種） | 延べ | 評価コーパスでその字を含むカード | 見込み: 確認なしで取り込める（+枚） | 誤着地（増減） | 確認に回る行（増減） | 最短の名前（文字） | 2文字以下のスキル | 衝突・見送りの理由 | 起きたスキル（共通） |');
		lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
		list.forEach((r) => {
			lines.push(`| ${r.from}→${r.to} | ${r.entries.join('・')} | **${r.commonSkillCount}** | ${r.skillCount} | ${r.count} | ${r.affectedCards} | **+${r.gainAuto}** | ${r.autoWrongDelta >= 0 ? '+' : ''}${r.autoWrongDelta} | ${r.checkDelta >= 0 ? '+' : ''}${r.checkDelta} | ${r.minLen} | ${r.shortSkills.length ? r.shortSkills.join('・') : '—'} | ${r.reasons.join('。') || '—'} | ${r.commonSkills.join('・')} |`);
		});
		lines.push('');
	}
	const mdFile = path.join(assetsDir('reports'), 'confusion-adoption-plan.md');
	await fs.writeFile(mdFile, lines.join('\n'), 'utf-8');
	const jsonFile = path.join(assetsDir('reports'), 'confusion-adoption-plan.json');
	await fs.writeFile(jsonFile, JSON.stringify({
		generatedAt: new Date().toISOString(), sets: corpus.sets, candidatesFrom: candLabel, commonWith: commonLabel, commonSkillCount: commonSkills.size, minCount, tier1MinSkills,
		baseline: { card: baseline.card, row: baseline.row },
		tiers: { 1: mapOf([1]), 2: mapOf([2]), short: Object.fromEntries(shortRescue.map((r) => [r.from, r.to])) },
		cumulative: cumulative.map((cu) => ({ label: cu.label, size: cu.size, map: cu.map, entries: cu.entries, card: cu.metrics.card, row: cu.metrics.row, delta: cu.delta, collisionsMaster: cu.collisionsMaster, collisionsExam: cu.collisionsExam })),
		candidates: results
	}, null, '\t'), 'utf-8');
	console.log(`\n第1段 ${results.filter((r) => r.tier === 1).length}件 / 第2段 ${results.filter((r) => r.tier === 2).length}件 / 第3段 ${results.filter((r) => r.tier === 3).length}件`);
	cumulative.forEach((cu) => console.log(`${cu.label}（${cu.size}件）: ${formatMetrics(cu.metrics)}  衝突 マスター ${cu.collisionsMaster.length} / exam ${cu.collisionsExam.length}`));
	console.log(`→ ${relToAssets(mdFile)}\n→ ${relToAssets(jsonFile)}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch((e) => {
		console.error(e.stack || e.message || e);
		process.exit(1);
	});
}
