// 入力のページの「下書きの読み込み」（C-104）の仕込み。
//
// 本物の下書きのファイルは Git に入らない（公開しない）ので、**形だけを写した小さな仮の下書き**をここで組み立てる。
// **カード名・スキル名は書かない**（恒久ルール1）。カードとスキルは実データから id で拾い、名前もデータから引く。
// 検査の側で作る名前は2つだけ：
//   - 「一覧に無い名前」… 実在するスキル X の名前の末尾を1字落としたもの（X だけに部分一致し、どのスキル名とも一致しない）
//   - 「公開データに無いキャラクター」… どのカードにもいない名前（検査用と分かる名前）
// 仮の下書きは、ファイル選択の欄に Playwright の setInputFiles で渡す（ディスクには置かない）。
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './serve.mjs';

const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));

/**
 * 返すもの:
 *   draft(v) … 下書きのファイルの中身（v=2 は読み直し用：P2・P3 の中身を変え、P1 を外したもの）
 *   file     … 仮の support-card-event-skills.json（P4・P7 の行。status done）
 *   cards    … { P1…P7, U }  P1 形4つ／P2 一覧に無い名前とレベル無し／P3 目で確定／P4 ファイルにある（中身は違う）／
 *                             P5 スキルの無い下書き／P6 手の入力がある（下書きで置き換えない）／
 *                             P7 ファイルにある（中身は同じ）／U 公開データに無い
 *   charas   … { C1, C2, C3, CU }  C1 自身の行とグループの欄の行／C2 空／C3 グループの欄の行だけ／CU 公開データにいない
 *   S        … 使うスキルの id（S[0]〜S[9]）、X … 一覧に無い名前の元のスキル、unlisted … 一覧に無い名前
 *   group    … グループのカードの id
 */
export function buildDraftFixture() {
	const cards = read('data/support-cards.json').entries;
	const master = read('uma-skill-deck-skills.json').skills;
	const ext = read('data/extended-skills.json').entries;
	const allNames = master.map((s) => s.name).concat(ext.map((e) => e.name));

	// 「SSR だけ」が既定で効くので、グループでない SSR のカードを使う（後ろから。ほかの検査と重ならないように）
	const ssr = cards.filter((c) => c.rarity === 'SSR' && c.isGroup === false).reverse();
	const [P1, P2, P3, P4, P5, P6, P7] = ssr.slice(0, 7).map((c) => c.id);
	const maxNo = Math.max(...cards.map((c) => Number(String(c.id).replace(/^card-/, '')) || 0));
	const U = 'card-' + String(maxNo + 1).padStart(4, '0');
	const group = cards.find((c) => c.isGroup === true);

	// スキル：マスターから、名前の一部で1件に絞れるもの
	const unique = (n) => allNames.filter((x) => x.includes(n)).length === 1;
	const S = master.filter((s) => unique(s.name)).slice(0, 10).map((s) => s.id);
	const nameOf = (id) => master.find((s) => s.id === id).name;
	// 一覧に無い名前：末尾を1字落として、X だけに部分一致し、どの名前とも一致しないもの
	const X = master.find((s) => s.name.length >= 4 && !S.includes(s.id)
		&& allNames.filter((n) => n.includes(s.name.slice(0, -1))).length === 1 && !allNames.includes(s.name.slice(0, -1)));
	const unlisted = X.name.slice(0, -1);
	const ref = (i, lv) => ({ skillId: S[i], name: nameOf(S[i]), hintLevel: lv === undefined ? 1 : lv });

	// キャラクター：グループのメンバーで、グループでないカードも持つ人（C1）・持たない人は使わない
	const solo = cards.filter((c) => c.isGroup === false);
	const soloNames = new Set(solo.map((c) => c.charaName));
	const C1 = group.groupMembers.find((n) => soloNames.has(n));
	const C2 = solo.find((c) => c.charaName !== C1).charaName;
	const C3 = solo.find((c) => c.charaName !== C1 && c.charaName !== C2).charaName;
	const CU = '（検査用）公開データにいないキャラクター';

	const draft = (v) => {
		const chains = [];
		if (v !== 2) {
			// P1: 確定・選択肢で分かれる・結果で分かれる・選択肢の中の成否 の4つの形
			chains.push({ cardId: P1, chain: [
				{ step: 1, choices: [{ skills: [ref(0)] }] },
				{ step: 2, choices: [{ skills: [ref(1)] }, { skills: [] }] },
				{ step: 3, choices: [{ results: [[ref(2, 3)], [ref(2, 2)]] }] },
				{ step: 4, choices: [{ results: [[ref(3)], []] }, { skills: [ref(4)] }] }] });
		}
		// P2: 一覧に無い名前（Lv2）と、レベルの無いスキル。v=2 では3回目にスキルを足した形
		chains.push({ cardId: P2, chain: [
			{ step: 1, choices: [{ skills: [{ skillId: null, name: unlisted, hintLevel: 2 }] }] },
			{ step: 2, choices: [{ skills: [ref(5, null)] }] }].concat(v === 2 ? [{ step: 3, choices: [{ skills: [ref(9)] }] }] : []) });
		// P3: 目で確定するもの。v=2 では中身を変える（手を入れていないので置き換わる）
		chains.push({ cardId: P3, eyeCheck: ['(3) 検査用の目で確定の文'], chain: [
			{ step: 1, choices: [{ skills: [ref(v === 2 ? 8 : 6)] }] }] });
		// P4: ファイルにあるカード（ファイルは S7・下書きは S8）→ 下書きで上書きして「下書き（未確認）」
		chains.push({ cardId: P4, chain: [{ step: 1, choices: [{ skills: [ref(8)] }] }] });
		// P5: スキルの無い下書き → 下書きが無いのと同じ
		chains.push({ cardId: P5, chain: [{ step: 1, choices: [{ skills: [] }] }] });
		// P6: 手の入力がある → 置き換えない
		chains.push({ cardId: P6, chain: [{ step: 1, choices: [{ skills: [ref(9)] }] }] });
		// P7: ファイルの行と下書きが同じ中身（card-0559 と同じ場合）→ 下書き（未確認）にし、起動時の後片付けで消えない
		chains.push({ cardId: P7, chain: [{ step: 2, choices: [{ skills: [ref(1)] }, { skills: [] }] }] });
		// U: 公開データに無いカード → 飛ばす
		chains.push({ cardId: U, chain: [{ step: 1, choices: [{ skills: [ref(0)] }] }] });
		const common = [
			{ charaName: C1, events: [{ choices: [{ skills: [ref(0)] }, { skills: [] }] }] },
			{ charaName: C1, viaCardId: group.id, events: [{ choices: [{ skills: [ref(1)] }] }] },
			{ charaName: C2, events: [] },
			{ charaName: C3, viaCardId: group.id, events: [{ choices: [{ skills: [ref(2)] }] }] },
			{ charaName: CU, events: [{ choices: [{ skills: [ref(3)] }] }] },
		];
		return { note: '検査用の仮の下書き', chains, common, ignored: '許可していない項目（読まれないこと）' };
	};
	const file = {
		dataVersion: '2026-09-29a', category: 'supportCardEventSkill', note: '検査用の仕込み',
		entries: [
			{ cardId: P4, status: 'done', chain: [{ step: 1, choices: [{ skills: [{ skillId: S[7], name: nameOf(S[7]), hintLevel: 1 }] }] }] },
			{ cardId: P7, status: 'done', chain: [{ step: 2, choices: [{ skills: [ref(1)] }, { skills: [] }] }] },
		],
	};
	return { draft, file, cards: { P1, P2, P3, P4, P5, P6, P7, U }, charas: { C1, C2, C3, CU }, S, X: { id: X.id, name: X.name }, unlisted, group: group.id, nameOf };
}
