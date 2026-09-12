// 保存済みのOCRの読み（reports/ocr-<セット>-<条件>.json）を、読み替えを足した正規化で
// **照合し直して**、採用の前後で同じ指標を測る。再OCRはしない。
//
// 指標（読み替え候補の採用判断の枠組み。2026-09-13・24セッション目においもさんと合意した優先順）:
//   1. **誤着地** … 一意に一致した（exact / viaMap ＝確認なしで取り込まれる）のに正解と違うカードの数。
//      **1件でも増える採用は却下。** 最優先の指標
//   2. 完全一致率 … exact（読みがそのまま一致）と、確認なしで取り込める率（exact＋viaMap）を分けて出す。
//      読み替えを足すと exact は増えず viaMap が増えるので、効き目は後者に出る
//   3. 確認に回る行 … 継ぎ合わせた列の1行（多数決の単位）のうち、確定しない行の数
//
// カード単位の指標は製品と同じ前処理の読み（sharp）だけで測る。行単位の多数決は build-truth.mjs と
// 同じく sharp と sharp-raw の両方の読みを使う（票の母数を揃えるため）。
//
// 速さのため、読みにその字（from）を含まないカードは判定が変わらないので再照合しない。

import fs from 'node:fs';
import path from 'node:path';
import { assetsRoot } from './assets.mjs';
import { common, loadMaster } from './common-in-node.mjs';
import { buildMatcher, isAutoAccepted } from './match.mjs';
import { combineReads } from '../run-ocr-crops.mjs';
import { voteOf, tallyRow } from '../build-truth.mjs';

// build-truth.mjs の DEFAULT_VOTE_THRESHOLD と同じ値（あちらは export していない）。変えるなら両方。
export const VOTE_THRESHOLD = 0.4;

/**
 * 候補（誤読字→正字）を、実際に CHAR_CONFUSION_MAP に足す項目へ展開する。
 *
 * **common.js の normalizeText は「読み替えマップ → 見た目の統一（HOMOGLYPH_MAP）」の順**でかける。
 * 一方、誤読の集計（tally-confusions）は統一**後**の字で突き合わせるので、候補の字は統一後の形になる
 * （例: OCRがカタカナの「ニ」と読んだものは統一で「二」になり、候補は「二→ー」と記録される）。
 * その候補を「二→ー」のまま足しても、マップは統一前の「ニ」を見るので当たらない（実測: 二→ー を足しても
 * 判定が1枚も変わらなかった）。統一で from に潰れる字をすべて同じ正字へ向ける項目に展開する
 * （二→ー なら ニ→ー と 二→ー）。
 */
export function expandExtra(extra) {
	const out = {};
	const H = common.HOMOGLYPH_MAP;
	for (const [from, to] of Object.entries(extra || {})) {
		out[from] = to;
		for (const [raw, unified] of Object.entries(H)) if (unified === from) out[raw] = to;
	}
	return out;
}

/**
 * 評価に使う材料を読む。人の確認済みの正解（confirmedBy 無し）を持つセットだけを対象にする。
 * 戻り値: { cards: [{ set, id, truth, readsSharp, readsAll }], rows: [{ set, index, ids, truth }] }
 */
export function loadCorpus(sets, { requireHuman = true } = {}) {
	const root = assetsRoot();
	const cards = [];
	const rows = [];
	const used = [];
	for (const set of sets) {
		const tf = path.join(root, 'truth', `${set}.json`);
		if (!fs.existsSync(tf)) { console.log(`※ truth/${set}.json が無いので飛ばします`); continue; }
		const truth = JSON.parse(fs.readFileSync(tf, 'utf-8'));
		const provisional = String(truth.confirmedBy || '').includes('claude') || String(truth.confirmedBy || '').includes('暫定');
		if (provisional && requireHuman) { console.log(`※ truth/${set}.json は暫定（確認前）なので飛ばします`); continue; }
		const nameById = new Map(truth.cards.filter((c) => c.skillName && (!provisional || c.decidedBy !== 'check')).map((c) => [c.id, c.skillName]));
		const read = (cond) => {
			const f = path.join(root, 'reports', `ocr-${set}-${cond}.json`);
			return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')).rows : [];
		};
		const sharp = new Map(read('sharp').map((r) => [r.id, r]));
		const raw = new Map(read('sharp-raw').map((r) => [r.id, r]));
		const byId = new Map();
		for (const [id, r] of sharp) {
			if (r.category === 'excluded') continue;
			const truthName = nameById.get(id);
			if (!truthName) continue;
			const readsSharp = (r.texts || [r.text]).filter((t) => t != null);
			const rr = raw.get(id);
			const readsAll = readsSharp.concat(rr ? (rr.texts || [rr.text]).filter((t) => t != null && !readsSharp.includes(t)) : []);
			const card = { set, id, truth: truthName, readsSharp, readsAll };
			cards.push(card);
			byId.set(id, card);
		}
		// 行（多数決の単位）は draft から取る（継ぎ合わせの結果。金の行は除く）
		const df = path.join(root, 'truth', `${set}.draft.json`);
		if (fs.existsSync(df)) {
			const draft = JSON.parse(fs.readFileSync(df, 'utf-8'));
			draft.rows.filter((r) => !r.gold).forEach((r) => {
				const ids = r.lavenderIds.filter((id) => byId.has(id));
				if (!ids.length) return;
				// 行の正解＝その行のカードの正解（確認済みなら全カード同じ名前）
				const names = [...new Set(ids.map((id) => byId.get(id).truth))];
				rows.push({ set, index: r.index, ids, truth: names.length === 1 ? names[0] : null });
			});
		}
		used.push(set);
	}
	return { cards, rows, sets: used };
}

/** 1枚の判定。戻り値: { category, skillName, ok, wrong, vote } */
function judge(card, matcher, reads) {
	const { chosen } = reads.length
		? combineReads(reads.map((t) => ({ text: t, confidence: 0 })), matcher)
		: { chosen: { category: 'unreadable', candidates: [] } };
	const auto = isAutoAccepted(chosen.category) && !!chosen.skill;
	return {
		category: chosen.category,
		skillName: chosen.skill ? chosen.skill.name : null,
		ok: auto && chosen.skill.name === card.truth,
		wrong: auto && chosen.skill.name !== card.truth,
		vote: voteOf(chosen)
	};
}

/**
 * 読み替え extra（{誤読字: 正字}）を足した状態で、コーパス全体の指標を出す。
 * baseline（extra 無し）を渡すと、その字を含まないカードは再照合せずに流用する。
 */
export function evaluate(corpus, extra, baseline) {
	const master = loadMaster();
	const expanded = expandExtra(extra);
	const raw = buildMatcher(master, Object.keys(expanded).length ? expanded : undefined);
	// 同じ読みは何十フレームにもわたって繰り返されるので、読みの文字列ごとに判定を覚える
	const memo = new Map();
	const matcher = { classify: (t) => { const k = String(t == null ? '' : t); if (!memo.has(k)) memo.set(k, raw.classify(k)); return memo.get(k); } };
	const fromChars = Object.keys(expanded);
	const touches = (reads) => !fromChars.length || reads.some((t) => fromChars.some((ch) => String(t).includes(ch)));
	const perCard = new Map();
	const perVote = new Map();
	corpus.cards.forEach((card) => {
		const key = `${card.set}/${card.id}`;
		if (baseline && !touches(card.readsAll)) {
			perCard.set(key, baseline.perCard.get(key));
			perVote.set(key, baseline.perVote.get(key));
			return;
		}
		perCard.set(key, judge(card, matcher, card.readsSharp));
		perVote.set(key, judge(card, matcher, card.readsAll).vote);
	});
	// カード単位
	const m = { cards: corpus.cards.length, exact: 0, viaMap: 0, ambiguous: 0, unreadable: 0, autoRight: 0, autoWrong: 0, wrongs: [] };
	corpus.cards.forEach((card) => {
		const j = perCard.get(`${card.set}/${card.id}`);
		m[j.category]++;
		if (j.ok) m.autoRight++;
		if (j.wrong) { m.autoWrong++; m.wrongs.push({ set: card.set, id: card.id, truth: card.truth, matched: j.skillName, reads: card.readsSharp.slice(0, 3) }); }
	});
	// 行単位（build-truth と同じ確定の条件）
	const r = { rows: corpus.rows.length, decided: 0, check: 0, decidedWrong: 0, decidedWrongs: [] };
	corpus.rows.forEach((row) => {
		const voteById = new Map();
		row.ids.forEach((id) => { const v = perVote.get(`${row.set}/${id}`); if (v) voteById.set(id, v); });
		const t = tallyRow(row.ids, voteById);
		const decided = !!t.top && !t.tied && t.top.exactVotes > 0 && t.share >= VOTE_THRESHOLD;
		if (decided) {
			r.decided++;
			if (row.truth && t.top.name !== row.truth) { r.decidedWrong++; r.decidedWrongs.push({ set: row.set, index: row.index, truth: row.truth, voted: t.top.name }); }
		} else r.check++;
	});
	return { extra: extra || {}, expanded, card: m, row: r, perCard, perVote };
}

/** 2つの評価の差分（採用の前後）。 */
export function diff(before, after) {
	return {
		autoWrongDelta: after.card.autoWrong - before.card.autoWrong,
		exactDelta: after.card.exact - before.card.exact,
		autoDelta: after.card.autoRight + after.card.autoWrong - (before.card.autoRight + before.card.autoWrong),
		autoRightDelta: after.card.autoRight - before.card.autoRight,
		checkDelta: after.row.check - before.row.check,
		decidedWrongDelta: after.row.decidedWrong - before.row.decidedWrong
	};
}

export function formatMetrics(e) {
	const c = e.card, r = e.row;
	const pct = (x) => ((x / Math.max(1, c.cards)) * 100).toFixed(1) + '%';
	return (
		`誤着地 **${c.autoWrong}** / ${c.autoRight + c.autoWrong}（確認なしで入るカード）  ` +
		`完全一致 ${c.exact}（${pct(c.exact)}）  確認なしで取り込める ${c.autoRight + c.autoWrong}（${pct(c.autoRight + c.autoWrong)}）  ` +
		`曖昧 ${c.ambiguous} / 読めない ${c.unreadable}  ｜  行: 確定 ${r.decided} / 確認に回る **${r.check}** / 確定したが誤り ${r.decidedWrong}`
	);
}
