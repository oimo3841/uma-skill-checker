// カード1枚のOCR結果をマスター445種に照合し、フェーズ0の5分類に振り分ける。
//
//   exact       … OCRの読みがそのまま（混同マップ抜きで）ただ1つに一致
//   viaMap      … 既存の文字混同マップで置き換えた結果、ただ1つに一致
//   ambiguous   … 距離1以上で当たる、または同点複数 → おいもさんの確認行き
//   unreadable  … テキストが空、または許容距離内に候補が無い
//
// exact と viaMap だけが「確認なしで取り込んでよい」＝Chatで決めたルール5。
// そのため exact/viaMap でありながら正解と違うもの（＝誤りが確認を経ずに入る）を
// 別に数える。これがいちばん危険な分類。
//
// 距離と許容距離は js/common.js のものをそのまま使う（複製しない）。
// ただし common.js の bestCandidate() は「長い行の一部にスキル名が含まれる」場合を
// 見るための窓付き距離を使う。カード1枚＝スキル名1つなので、ここでは窓を使わない
// 素の距離で見る（後続フェーズで製品に入れるときも同じ想定）。

import { common, normalizeWithoutConfusion, normalizeWithExtraMap } from './common-in-node.mjs';

/**
 * @param {object} [opts]
 * @param {(len:number)=>number} [opts.allowedDistance] 許容距離の差し替え（tests 専用。common.js の
 *   allowedDistance を緩めた場合の効き目を、common.js を変えずに見積もるため）
 */
export function buildMatcher(master, extraConfusion, opts = {}) {
	const allowedDistanceFn = opts.allowedDistance || common.allowedDistance;
	const entries = master.map((s) => ({
		id: s.id,
		name: s.name,
		strict: normalizeWithoutConfusion(s.name),
		full: extraConfusion ? normalizeWithExtraMap(s.name, extraConfusion) : common.normalizeText(s.name)
	}));
	const byStrict = new Map();
	const byFull = new Map();
	entries.forEach((e) => {
		if (e.strict) {
			if (!byStrict.has(e.strict)) byStrict.set(e.strict, []);
			byStrict.get(e.strict).push(e);
		}
		if (e.full) {
			if (!byFull.has(e.full)) byFull.set(e.full, []);
			byFull.get(e.full).push(e);
		}
	});

	function classify(rawText) {
		const text = String(rawText == null ? '' : rawText).trim();
		const out = { text, category: 'unreadable', reason: '', skill: null, candidates: [], distance: null };
		if (!text) {
			out.reason = '文字が取れなかった';
			return out;
		}
		const strict = normalizeWithoutConfusion(text);
		const full = extraConfusion ? normalizeWithExtraMap(text, extraConfusion) : common.normalizeText(text);
		out.normStrict = strict;
		out.normFull = full;

		const hitStrict = strict ? byStrict.get(strict) : null;
		if (hitStrict && hitStrict.length === 1) {
			out.category = 'exact';
			out.skill = hitStrict[0];
			out.distance = 0;
			return out;
		}
		const hitFull = full ? byFull.get(full) : null;
		if (hitFull && hitFull.length === 1) {
			out.category = hitStrict && hitStrict.length > 1 ? 'ambiguous' : 'viaMap';
			if (out.category === 'viaMap') {
				out.skill = hitFull[0];
				out.distance = 0;
				return out;
			}
		}
		if (hitFull && hitFull.length > 1) {
			out.category = 'ambiguous';
			out.reason = '正規化後に同じ文字列のスキルが複数ある';
			out.candidates = hitFull.map((e) => ({ id: e.id, name: e.name, distance: 0 }));
			out.distance = 0;
			return out;
		}

		let best = Infinity;
		const hits = [];
		entries.forEach((e) => {
			if (!e.full) return;
			const allowed = allowedDistanceFn(e.full.length);
			const d = common.levenshtein(full, e.full);
			if (d > allowed) return;
			hits.push({ id: e.id, name: e.name, distance: d });
			if (d < best) best = d;
		});
		if (!hits.length) {
			out.category = 'unreadable';
			out.reason = '許容距離内に候補が無い';
			return out;
		}
		const top = hits.filter((h) => h.distance === best).sort((a, b) => a.name.localeCompare(b.name));
		out.category = 'ambiguous';
		out.distance = best;
		out.candidates = hits.sort((a, b) => a.distance - b.distance).slice(0, 8);
		out.reason = top.length > 1 ? `距離${best}で同点${top.length}件` : `距離${best}（完全一致ではない）`;
		if (top.length === 1) out.skill = null; // 確認行き。自動では確定しない
		out.topCandidate = top[0];
		return out;
	}

	return { entries, classify };
}

/** 確認なしで取り込んでよい分類か。 */
export function isAutoAccepted(category) {
	return category === 'exact' || category === 'viaMap';
}

export const CATEGORY_LABELS = {
	exact: '完全一致',
	viaMap: '混同マップ経由で一意',
	ambiguous: '曖昧（確認行き）',
	unreadable: '読めない'
};
