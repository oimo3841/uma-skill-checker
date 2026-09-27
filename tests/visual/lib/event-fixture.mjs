// サポートカードのイベントで得られるスキル（C-102）の仕込みデータ。
//
// 本物の data/support-card-event-skills.json はまだ行が0件なので、編成パネルの●・△を
// 確かめるには形の揃ったデータを仕込む必要がある。**カード名・スキル名は書かない**
// （恒久ルール1）。カードとスキルは実データから id で拾う:
//   - カードは support-cards.json の先頭5枚と最後の1枚
//   - スキルはマスターから、その6枚の練習ヒントに入っていないものを先頭から11個
// 同じデータを `check:catalog -- --dir=…` に通せば、この形が検査を通ることも確かめられる。
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './serve.mjs';

const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));

export function buildEventFixture() {
	const cards = read('data/support-cards.json').entries;
	const master = read('uma-skill-deck-skills.json').skills;
	const picked = [cards[cards.length - 1], cards[0], cards[1], cards[2], cards[3], cards[4]];
	const hinted = new Set(picked.flatMap((c) => (c.hintSkills || []).map((s) => s.skillId)));
	const S = master.filter((s) => !hinted.has(s.id)).slice(0, 11).map((s) => ({ skillId: s.id, name: s.name }));
	const ref = (i, lv) => ({ skillId: S[i].skillId, name: S[i].name, hintLevel: lv || 1 });
	const [A, B, C, D, E, F] = picked.map((c) => c.id);

	const entries = [
		// A: 選択肢の無い確定のイベント（最後の回に2つ。card-0559 の3回目と同じ形）→ S0・S1 は●
		{ cardId: A, status: 'done', chain: [
			{ step: 3, choices: [{ skills: [ref(0, 1), ref(1, 2)] }] }] },
		// B: 1回目は2択で、S4 だけ両方の選択肢に入っている → S2・S3 は△、S4 は●
		//    2回目は選択肢1つ・結果が3通り → 先頭（成功）の S5 は●、失敗側の S6・S7 は出ない
		{ cardId: B, status: 'done', chain: [
			{ step: 1, choices: [{ skills: [ref(2), ref(4)] }, { skills: [ref(3), ref(4)] }] },
			{ step: 2, choices: [{ results: [[ref(5, 3)], [ref(6, 2)], [ref(7, 1)]] }] }] },
		// C: 1回目は2択（上は成否あり・下はスキル無し）→ 成功の S8 は△、失敗の S9 は出ない
		//    3回目は確定で S2 → S2 は C の列では●（B の列では△のまま。全体では●）
		{ cardId: C, status: 'done', chain: [
			{ step: 1, choices: [{ results: [[ref(8)], [ref(9)]] }, { skills: [] }] },
			{ step: 3, choices: [{ skills: [ref(2)] }] }] },
		// D: シートから取り込んだまま → S10 は△
		{ cardId: D, status: 'seeded', unplaced: [{ skillId: S[10].skillId, name: S[10].name }] },
		// E: 見て回って無かった
		{ cardId: E, status: 'none' },
		// F: 行が無い（未確認）
	];
	return {
		doc: { dataVersion: '2026-09-27a', category: 'supportCardEventSkill', note: 'テスト用の仕込み', entries },
		cardIds: [A, B, C, D, E, F],
		S: S.map((s) => s.skillId),
		names: S.map((s) => s.name),
	};
}

/**
 * キャラクター共通のイベント（C-102 の区切り3）の仕込み。カードとキャラクターは実データから拾う:
 *   - G … グループのカード（isGroup が true の最初の1枚）
 *   - M … G のメンバーのうち、グループでないカードも持つ人（その1枚が N）。**代表者（先頭）は避ける**
 *         （代表者の名前だけで引いても当たってしまい、メンバー全員ぶんを見たことにならないため）
 *   - M2 … G のメンバーで、M とも代表者とも違う人
 *   - A … グループのメンバーにいないキャラクター C のカード（グループでない）
 * スキルは、これらのカードの練習ヒントにも連続イベントの仕込みにも入っていないものを使う。
 * 共通イベント:
 *   - C  … 確定で T0 → A の列に●
 *   - M  … 2択（T1／T2）と確定の T3 → T1・T2 は△、T3 は●。G と N の**両方の列**に出て、スキルは1行
 *   - M2 … 確定で T4 → G の列に●（代表者ではないメンバーの分が当たっている証拠）
 *   - 代表者 … 行を作らない（未入力）→ G は「共通イベント（代表者）」が未確認に出る
 *   - D  … 見て回って無かった（none）→ 何も出ず、未確認にも数えない
 */
export function buildCharacterFixture() {
	const cards = read('data/support-cards.json').entries;
	const master = read('uma-skill-deck-skills.json').skills;
	const G = cards.find((c) => c.isGroup === true);
	const solo = cards.filter((c) => c.isGroup === false);
	const members = G.groupMembers;
	const M = members.slice(1).find((n) => solo.some((c) => c.charaName === n));
	const N = solo.find((c) => c.charaName === M);
	const M2 = members.slice(1).find((n) => n !== M);
	const inAnyGroup = new Set(cards.filter((c) => c.isGroup).flatMap((c) => c.groupMembers));
	const A = solo.find((c) => !inAnyGroup.has(c.charaName));
	const Dcard = solo.find((c) => !inAnyGroup.has(c.charaName) && c.charaName !== A.charaName);
	const hinted = new Set([G, N, A, Dcard].flatMap((c) => (c.hintSkills || []).map((s) => s.skillId)));
	const avoid = new Set(buildEventFixture().S);
	const T = master.filter((s) => !hinted.has(s.id) && !avoid.has(s.id)).slice(0, 5).map((s) => ({ skillId: s.id, name: s.name }));
	const ref = (i, lv) => ({ skillId: T[i].skillId, name: T[i].name, hintLevel: lv || 1 });
	const entries = [
		{ charaName: A.charaName, status: 'done', events: [{ choices: [{ skills: [ref(0)] }] }] },
		{ charaName: M, status: 'done', events: [
			{ choices: [{ skills: [ref(1)] }, { skills: [ref(2)] }] },
			{ choices: [{ skills: [ref(3, 2)] }] }] },
		{ charaName: M2, status: 'done', events: [{ choices: [{ results: [[ref(4)], []] }] }] },
		{ charaName: Dcard.charaName, status: 'none' },
	];
	return {
		doc: { dataVersion: '2026-09-27a', category: 'characterEventSkill', note: 'テスト用の仕込み', entries },
		cardIds: [A.id, G.id, N.id, Dcard.id],
		group: { id: G.id, representative: members[0], members: members.slice() },
		M, M2, C: A.charaName, D: Dcard.charaName,
		T: T.map((s) => s.skillId),
	};
}
