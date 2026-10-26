// シナリオの固定イベント（data/scenario-event-skills.json）の写しを、検査用に並べ替える（2026-10-26・駿大祭の受け入れ）。
//
// ツールが使うシナリオは先頭（entries[0]）の1件だけ。2026-10-26 に先頭を、イベントのスキルがまだ無い最新のシナリオ（events が空）にした。
// シナリオの固定イベントの計算・画面（列・小窓・選択・Pt・進化のパターンB）を確かめる検査は、それまでどおり
// **イベントを持つシナリオ**を先頭に置いた写しで見る（中身はファイルのまま。並びだけ変える。名前はここに書かない）。
// ツールが使うシナリオそのもの（実データの先頭）は、それを見る塊が実データのまま読む。

/** イベントを持つ最初のシナリオを先頭に並べ替えた写し（イベントを持つシナリオが無ければ、そのままの写し） */
export function withEventScenarioFirst(doc) {
	const entries = Array.isArray(doc && doc.entries) ? doc.entries : [];
	const i = entries.findIndex((e) => e && Array.isArray(e.events) && e.events.length > 0);
	if (i <= 0) return Object.assign({}, doc, { entries: entries.slice() });
	return Object.assign({}, doc, { entries: [entries[i]].concat(entries.slice(0, i), entries.slice(i + 1)) });
}
