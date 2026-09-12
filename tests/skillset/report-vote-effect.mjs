// 多数決の効き目を数字にする。
//
//   node tests/skillset/report-vote-effect.mjs --set=2026-09-11a
//   node tests/skillset/report-vote-effect.mjs --set=2026-09-11a --set=2026-09-12a
//
// 出すもの:
//   1. 確認行きの件数が、金の除外・多数決でどう減ったか
//   2. 得票率の分布（しきい値を決める根拠）
//   3. **得票率が高いのに正解と違う行**（確認を経ずに誤りが入るいちばん危険な形）
//
// 入力は build-truth.mjs が書いた truth/<セット>.draft.json と、あれば truth/<セット>.json。
// 出力: reports/vote-effect-<セット>.md

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { assetsRoot, assetsDir, relToAssets } from './lib/assets.mjs';

const BUCKETS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];

function argValues(name) {
	return process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
}

/**
 * 多数決を入れる前の「確認行き」の組数。
 * 19セッション目までの数え方に合わせる: 一意に一致したカードだけが確認不要で、
 * 同じ名前（名前が無ければ同じ読み）のカードを1組にまとめる。
 */
function countCheckGroupsBeforeVote(draft) {
	// 19セッション目の確認ページと同じ数え方: まず「一意に一致しなかったカード」だけを残し、
	// そのあと同じ名前（名前が無ければ同じ読み）でまとめて組を数える。
	const keys = new Set();
	draft.cards.forEach((c) => {
		if (c.gold) return; // 金は除外済みの数え方
		if (c.voteExact === true) return; // 一意に一致＝確認不要
		const name = c.vote || null;
		keys.add(name ? `name:${name}` : `reads:${(c.readings || []).join('')}`);
	});
	const goldRows = draft.rows.filter((r) => r.gold).length;
	// 金を除外する前は、金のカードも同じ表に並んでいた（種類のぶんだけ組が増える）
	return { withGold: keys.size + goldRows, withoutGold: keys.size, goldRows };
}

function histogram(rows) {
	const out = BUCKETS.slice(0, -1).map((lo, i) => ({ lo, hi: BUCKETS[i + 1], rows: [] }));
	rows.forEach((r) => {
		const s = r.share == null ? 0 : r.share;
		const b = out.find((x) => s >= x.lo && s < x.hi) || out[out.length - 1];
		b.rows.push(r);
	});
	return out;
}

async function analyse(setName, lines) {
	const draftFile = path.join(assetsRoot(), 'truth', `${setName}.draft.json`);
	if (!fsSync.existsSync(draftFile)) {
		lines.push(`\n## ${setName}\n\n（truth/${setName}.draft.json がありません。先に build-truth.mjs を実行してください）`);
		return null;
	}
	const draft = JSON.parse(await fs.readFile(draftFile, 'utf-8'));
	const truthFile = path.join(assetsRoot(), 'truth', `${setName}.json`);
	const truthByCard = new Map();
	if (fsSync.existsSync(truthFile)) {
		const t = JSON.parse(await fs.readFile(truthFile, 'utf-8'));
		(t.cards || []).forEach((c) => { if (c.skillName) truthByCard.set(c.id, c.skillName); });
	}

	const before = countCheckGroupsBeforeVote(draft);
	const rows = draft.rows;
	const lav = rows.filter((r) => !r.gold);
	const check = rows.filter((r) => r.status === 'check');
	const voted = rows.filter((r) => r.status === 'voted');

	lines.push(`\n## ${setName}（カード ${draft.cards.length}枚 / 継ぎ合わせた列 ${rows.length}行）\n`);
	lines.push('### 確認行きの件数\n');
	lines.push('| 段階 | 単位 | 確認行き |');
	lines.push('|---|---|---|');
	lines.push(`| 金の除外なし・多数決なし | 組（同じ名前・同じ読みでまとめる） | ${before.withGold}（うち金 ${before.goldRows}） |`);
	lines.push(`| 金の除外あり・多数決なし | 組 | ${before.withoutGold} |`);
	lines.push(`| 金の除外あり・多数決あり | 行（継ぎ合わせた列の1行） | ${check.length} |`);
	lines.push('');
	lines.push(
		`多数決で確定 ${voted.length}行 / 目視で確定 ${rows.filter((r) => r.status === 'override').length}行 / ` +
			`対象外の金 ${rows.filter((r) => r.gold).length}行 / **要確認 ${check.length}行**（しきい値 ${draft.voteThreshold}）\n`
	);

	// --- 得票率の分布。正解と照らして、どの帯から誤りが出るかを見る ---
	const verdict = (r) => {
		if (!r.name) return 'noname';
		const truths = r.ids.map((id) => truthByCard.get(id)).filter(Boolean);
		if (!truths.length) return 'unknown';
		return truths.every((t) => t === r.name) ? 'agree' : 'disagree';
	};
	lines.push('### 得票率の分布（金の行を除く）\n');
	lines.push('しきい値を決めるための材料。「正解と違う」は truth/<セット>.json との比較。\n');
	lines.push('| 得票率 | 行数 | 正解と一致 | **正解と違う** | 正解不明 |');
	lines.push('|---|---|---|---|---|');
	const hist = histogram(lav);
	hist.forEach((b) => {
		const v = b.rows.map(verdict);
		const n = (k) => v.filter((x) => x === k).length;
		if (!b.rows.length) return;
		lines.push(
			`| ${Math.round(b.lo * 100)}–${Math.round(Math.min(b.hi, 1) * 100)}% | ${b.rows.length} | ${n('agree')} | ${n('disagree')} | ${n('unknown') + n('noname')} |`
		);
	});
	lines.push('');

	// --- しきい値の掃き出し ---
	lines.push('### しきい値ごとの結果（最多得票が単独＋完全一致の票が1つ以上、という条件は共通）\n');
	lines.push('| しきい値 | 確定する行 | うち正解と違う | 確認行き |');
	lines.push('|---|---|---|---|');
	const candidates = [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7];
	const sweep = [];
	candidates.forEach((th) => {
		const decidable = lav.filter((r) => r.status !== 'override' && !r.tied && r.topExactVotes > 0 && r.share >= th);
		const wrong = decidable.filter((r) => verdict(r) === 'disagree');
		const checks = lav.filter((r) => r.status !== 'override').length - decidable.length;
		sweep.push({ th, decided: decidable.length, wrong: wrong.length, check: checks });
		lines.push(`| ${th} | ${decidable.length} | ${wrong.length} | ${checks} |`);
	});
	lines.push('');

	// --- 得票率が高いのに正解と違う行 ---
	const wrongRows = lav
		.filter((r) => r.status === 'voted' && verdict(r) === 'disagree')
		.sort((a, b) => b.share - a.share);
	lines.push(`### 得票率が高いのに正解と違う行: **${wrongRows.length}件**\n`);
	if (!wrongRows.length) {
		lines.push('無し。確認を経ずに誤った正解が入った行は見つからなかった。\n');
	} else {
		lines.push('| 行 | 得票率 | 多数決の答え | 正解（truth） | 次点 |');
		lines.push('|---|---|---|---|---|');
		wrongRows.forEach((r) => {
			const truths = [...new Set(r.ids.map((id) => truthByCard.get(id)).filter(Boolean))];
			lines.push(
				`| ${r.index}（${r.ids.length}枚） | ${Math.round(r.share * 100)}% (${r.topVotes}/${r.reads}・完全一致${r.topExactVotes}) | ${r.name} | ${truths.join(' / ')} | ${r.runnerUp ? `${r.runnerUp.name} ${r.runnerUp.votes}票` : '—'} |`
			);
		});
		lines.push('');
	}
	return { setName, before, rows: rows.length, check: check.length, voted: voted.length, wrong: wrongRows.length, sweep };
}

async function main() {
	const sets = argValues('set');
	if (!sets.length) sets.push('2026-09-11a');
	const lines = ['# 多数決の効き目', '', `生成: ${new Date().toISOString()}`, ''];
	const results = [];
	for (const s of sets) {
		const r = await analyse(s, lines);
		if (r) results.push(r);
	}
	const file = path.join(assetsDir('reports'), `vote-effect-${sets.join('+')}.md`);
	await fs.writeFile(file, lines.join('\n') + '\n', 'utf-8');
	console.log(`→ ${relToAssets(file)}`);
	results.forEach((r) => {
		console.log(
			`${r.setName}: 確認行き ${r.before.withGold}組（金の除外なし）→ ${r.before.withoutGold}組（金の除外あり）→ ` +
				`${r.check}行（多数決あり） / 多数決で確定 ${r.voted}行 / 得票率が高いのに誤り ${r.wrong}件`
		);
	});
}

main().catch((e) => {
	console.error(e.stack || e.message || e);
	process.exit(1);
});
