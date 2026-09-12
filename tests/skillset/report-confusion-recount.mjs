// 読み替え候補を**条件（解像度）ごとに分けて**数え直す。
//
//   node tests/skillset/report-confusion-recount.mjs \
//     --group=1180x2556=2026-09-11a,2026-09-12a,2026-09-12a-blurry,20260912_1-full,20260912_2-full,20260912_3-full \
//     --group=592x1280=20260912_1,20260912_2,20260912_3
//   （--conditions=sharp-raw,sharp で読みの条件を絞れる。--min-skills=2 が既定）
//
// なぜ条件で分けるか（2026-09-13・24セッション目においもさんが決定）:
//   半解像度（592x1280）の収録は文字の高さが約11pxで、鮮明な画像とは化け方が違う。
//   混ぜると「どの条件で起きた読み替えか」が分からなくなる。**分けて持てば**、
//   半解像度でしか起きない化け方が、画質ゲート（MIN_BASE_WIDTH_PX / RECOMMENDED_BASE_WIDTH_PX）
//   のしきい値を決める材料になる。半解像度ぶんは除外せず、別の条件として保持する。
//
// 主指標はスキルの種類数（B節ルール13）。延べ回数は参考値。
// 読み替えの採用は445種網羅まで保留（既存方針）。ここでは数えるだけ。
//
// 出力: reports/confusion-candidates-by-condition.md と、条件ごとの reports/confusions-<条件>.json

import fs from 'node:fs/promises';
import path from 'node:path';
import { assetsDir, relToAssets } from './lib/assets.mjs';
import { tallyConfusions } from './tally-confusions.mjs';

function argValues(name) {
	return process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
}
function argValue(name, fallback) {
	const v = argValues(name);
	return v.length ? v[v.length - 1] : fallback;
}

async function main() {
	const groups = argValues('group').map((g) => {
		const i = g.indexOf('=');
		if (i < 0) throw new Error(`--group は <条件名>=<セット,セット,...> の形で指定してください: ${g}`);
		return { label: g.slice(0, i), sets: g.slice(i + 1).split(',').map((s) => s.trim()).filter(Boolean) };
	});
	if (groups.length < 1) throw new Error('--group を1つ以上指定してください');
	const conditionsArg = argValue('conditions', null);
	const minSkills = Number(argValue('min-skills', '2'));

	const results = [];
	for (const g of groups) {
		const out = await tallyConfusions(g.sets, conditionsArg, { quiet: true });
		out.label = g.label;
		results.push(out);
		const f = path.join(assetsDir('reports'), `confusions-${g.label}.json`);
		await fs.writeFile(f, JSON.stringify(out, null, '\t'), 'utf-8');
		console.log(`[${g.label}] セット ${g.sets.join(', ')} / 対象カード ${out.cards}件 / 突き合わせた読み ${out.usedReads}件 → ${relToAssets(f)}`);
	}

	// 候補ごとに、条件別の種類数・延べ回数・スキルの集合をまとめる
	const labels = results.map((r) => r.label);
	// **同じ土俵**: 全条件で正解が確定している共通スキル。突き合わせの母数（確定した種数）は条件で
	// 大きく違い得る（実測: 1180x2556 が 418種・592x1280 が 216種）ので、全体の件数はそのまま
	// 多寡として比べられない。共通スキルに限った列を併記し、品質ゲートの材料にはそちらを使う。
	const common = new Set(results.length ? results[0].skills.filter((n) => results.every((r) => r.skills.includes(n))) : []);
	const byKey = new Map();
	results.forEach((r) => {
		r.substitutions.forEach((s) => {
			const k = `${s.from}→${s.to}`;
			if (!byKey.has(k)) byKey.set(k, { from: s.from, to: s.to, alreadyMapped: s.alreadyMapped, mappedTo: s.mappedTo, per: {}, union: new Set() });
			const e = byKey.get(k);
			const commonSkills = s.skills.filter((n) => common.has(n));
			e.per[r.label] = { skillCount: s.skillCount, count: s.count, skills: s.skills, commonCount: commonSkills.length, commonSkills };
			s.skills.forEach((n) => e.union.add(n));
		});
	});
	const rows = [...byKey.values()].map((e) => ({
		...e,
		unionCount: e.union.size,
		maxPer: Math.max(...labels.map((l) => (e.per[l] ? e.per[l].skillCount : 0))),
		maxCommon: Math.max(...labels.map((l) => (e.per[l] ? e.per[l].commonCount : 0)))
	}));
	const shown = rows.filter((e) => e.maxPer >= minSkills).sort((a, b) => b.unionCount - a.unionCount || b.maxPer - a.maxPer);
	const countOf = (e, l, field) => (e.per[l] ? e.per[l][field] : 0);
	const onlyIn = (label, field) =>
		rows.filter((e) => countOf(e, label, field) >= minSkills && labels.every((l) => l === label || countOf(e, l, field) === 0));
	const atLeast = (label, field) => rows.filter((e) => countOf(e, label, field) >= minSkills);

	const mapNote = (e) => (e.alreadyMapped ? '既にあり' : e.mappedTo ? `食い違い（既存は ${e.from}→${e.mappedTo}）` : '');
	const cell = (e, l) => (e.per[l] ? `**${e.per[l].skillCount}**種 / 延べ${e.per[l].count}` : '—');
	const cellCommon = (e, l) => (e.per[l] ? `${e.per[l].commonCount}種` : '—');
	const lines = [];
	lines.push('# 読み替え候補の数え直し（条件＝解像度ごと）');
	lines.push('');
	lines.push(`生成: ${new Date().toISOString()}`);
	lines.push('');
	lines.push('主指標は**スキルの種類数**（延べ回数は参考値）。**条件ごとに分けて**数えている。混ぜると「どの条件で起きた読み替えか」が分からなくなるため。');
	lines.push('半解像度でしか起きない化け方は、画質ゲート（`MIN_BASE_WIDTH_PX` / `RECOMMENDED_BASE_WIDTH_PX`）のしきい値を決める材料になる。');
	lines.push('**読み替えの採用は445種網羅まで保留**（既存方針）。ここでは数えるだけ。');
	lines.push('');
	lines.push('## 条件（母数）');
	lines.push('');
	lines.push('| 条件 | セット | 対象カード | **確定した種数** | 突き合わせた読み | かけ離れていて外した読み | 読みの条件ごとの完全一致 |');
	lines.push('|---|---|---|---|---|---|---|');
	results.forEach((r) => {
		const pc = Object.entries(r.perCondition).map(([k, v]) => `${k}: ${v.clean}/${v.reads}`).join('・');
		lines.push(`| ${r.label} | ${r.sets.join(', ')} | ${r.cards} | **${r.skillCount}** | ${r.usedReads} | ${r.skippedReads} | ${pc} |`);
	});
	lines.push('');
	lines.push(`**全条件で正解が確定している共通スキル: ${common.size}種。** 突き合わせの母数（確定した種数）が条件で違うと、「2種以上で起きる」候補の件数もそれに引きずられて**そのままでは多寡として比べられない**。同じ土俵で比べるときは、下の「共通スキルに限る」列を使う。`);
	lines.push('');
	lines.push('> ⚠ 正解が**暫定**（おいもさんの確認前）のセットでは、多数決で確定した行だけを正解として使っている。確認後に回し直すと数字が変わる。');
	lines.push('');
	lines.push('## 件数のまとめ（同じ土俵での比較）');
	lines.push('');
	lines.push(`| 数え方 | ${labels.join(' | ')} |`);
	lines.push(`|---|${labels.map(() => '---').join('|')}|`);
	lines.push(`| ${minSkills}種以上の候補（全体） | ${labels.map((l) => `${atLeast(l, 'skillCount').length}件（この条件のみ ${onlyIn(l, 'skillCount').length}）`).join(' | ')} |`);
	lines.push(`| 同・確定した種数あたり | ${labels.map((l, i) => `${((atLeast(l, 'skillCount').length / results[i].skillCount) * 100).toFixed(1)}件 / 100種`).join(' | ')} |`);
	lines.push(`| **共通 ${common.size}種に限った ${minSkills}種以上の候補** | ${labels.map((l) => `**${atLeast(l, 'commonCount').length}件**（この条件のみ ${onlyIn(l, 'commonCount').length}）`).join(' | ')} |`);
	lines.push(`| 同・種数あたり | ${labels.map((l) => `**${((atLeast(l, 'commonCount').length / Math.max(1, common.size)) * 100).toFixed(1)}件 / 100種**`).join(' | ')} |`);
	lines.push(`| 突き合わせた読みのうち完全に一致 | ${results.map((r) => { const pc = Object.values(r.perCondition).reduce((a, v) => ({ reads: a.reads + v.reads, clean: a.clean + v.clean, subs: a.subs + v.subs }), { reads: 0, clean: 0, subs: 0 }); return `${((pc.clean / Math.max(1, pc.reads)) * 100).toFixed(1)}%`; }).join(' | ')} |`);
	lines.push(`| 読み1件あたりの置き換え回数 | ${results.map((r) => { const pc = Object.values(r.perCondition).reduce((a, v) => ({ reads: a.reads + v.reads, subs: a.subs + v.subs }), { reads: 0, subs: 0 }); return (pc.subs / Math.max(1, pc.reads)).toFixed(2); }).join(' | ')} |`);
	lines.push('');
	lines.push(`## ${minSkills}種類以上のスキルで起きた読み替え（条件別）`);
	lines.push('');
	lines.push(`| 候補 | ${labels.join(' | ')} | 共通${common.size}種に限る: ${labels.join(' / ')} | 合計（種類の和集合） | 既存マップ | 起きたスキル（和集合） |`);
	lines.push(`|---|${labels.map(() => '---').join('|')}|---|---|---|---|`);
	shown.forEach((e) => {
		lines.push(`| ${e.from}→${e.to} | ${labels.map((l) => cell(e, l)).join(' | ')} | ${labels.map((l) => cellCommon(e, l)).join(' / ')} | **${e.unionCount}** | ${mapNote(e)} | ${[...e.union].join('・')} |`);
	});
	lines.push('');
	labels.forEach((l) => {
		const list = onlyIn(l, 'commonCount').sort((a, b) => b.per[l].commonCount - a.per[l].commonCount);
		lines.push(`## ${l} でしか起きていない読み替え（共通${common.size}種に限る・${minSkills}種以上・${list.length}件）`);
		lines.push('');
		lines.push('同じスキルを両方の条件で読んだうえで、この条件だけで起きたもの。品質ゲートの材料にはこちらを使う。');
		lines.push('');
		if (!list.length) lines.push('なし');
		list.forEach((e) => lines.push(`- ${e.from}→${e.to}  共通${e.per[l].commonCount}種（全体${e.per[l].skillCount}種 / 延べ${e.per[l].count}）${mapNote(e) ? `（${mapNote(e)}）` : ''}  <small>${e.per[l].commonSkills.join('・')}</small>`));
		lines.push('');
	});
	labels.forEach((l) => {
		const list = onlyIn(l, 'skillCount');
		lines.push(`## ${l} でしか起きていない読み替え（全体・${minSkills}種以上・${list.length}件）— 参考`);
		lines.push('');
		lines.push('母数の差を含む数字。もう一方の条件でそのスキルが確定していないだけのものが混ざる。');
		lines.push('');
		if (!list.length) lines.push('なし');
		list.forEach((e) => lines.push(`- ${e.from}→${e.to}  ${e.per[l].skillCount}種 / 延べ${e.per[l].count}${mapNote(e) ? `（${mapNote(e)}）` : ''}  <small>${e.per[l].skills.join('・')}</small>`));
		lines.push('');
	});
	lines.push('## 読み落とし・余計に読まれた字（条件別・上位10）');
	lines.push('');
	lines.push('1文字の置き換えでは直せないので、候補にはしない（`丿` は「！」の誤読、`ゞ` `】` は縁や光沢）。');
	lines.push('');
	results.forEach((r) => {
		lines.push(`- **${r.label}** 読み落とし: ${r.deletions.slice(0, 10).map((d) => `${d.char}${d.count}`).join(' / ')}`);
		lines.push(`- **${r.label}** 余計: ${r.insertions.slice(0, 10).map((d) => `${d.char}${d.count}`).join(' / ')}`);
	});
	const mdFile = path.join(assetsDir('reports'), 'confusion-candidates-by-condition.md');
	await fs.writeFile(mdFile, lines.join('\n'), 'utf-8');
	console.log(`\n候補 ${shown.length}件（${minSkills}種以上・全体）  共通スキル ${common.size}種`);
	labels.forEach((l) => console.log(`  ${l}: 全体 ${atLeast(l, 'skillCount').length}件（この条件のみ ${onlyIn(l, 'skillCount').length}） / 共通スキルに限る ${atLeast(l, 'commonCount').length}件（この条件のみ ${onlyIn(l, 'commonCount').length}）`));
	console.log(`→ ${relToAssets(mdFile)}`);
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
