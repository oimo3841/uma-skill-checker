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
