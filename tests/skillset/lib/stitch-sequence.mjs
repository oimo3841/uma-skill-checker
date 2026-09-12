// 重なりのある複数の画像から「一覧に何が何行並んでいたか」を作る。
//
// なぜ要るか:
//   1. 撮り漏れの判定は「検出したカードの種類数（ラベンダー＋金の全色）vs 設定数 N/200」で行う。
//      ところが**金の地のカードはOCRにかけない**（継承できないスキルなので対象外）ため、
//      名前では画像をまたいだ重複を消せない。
//   2. 複数フレームの多数決の単位が要る。**単位は「継ぎ合わせた列の1行」**にする。
//      同じスクロール位置のフレーム群を単位にすると、同じスキルが一覧の別の位置にも
//      並ぶぶんを取りこぼす。
//
// やり方:
//   1画面に並ぶカードは一覧の並び順そのものなので、画像を撮った順に**列として継ぎ合わせる**。
//   隣り合う画像は重なっているので、前の画像の末尾と次の画像の先頭を**対応づけて**繋ぐ。
//   照合に使うのは「ラベンダーなら暫定の名前、金なら GOLD という記号」。
//   金どうしはどれでも一致してしまうが、一致の点数を低くし、重なり全体の点数で決めるので、
//   前後のラベンダーのカードが位置を決めてくれる。
//
//   ※ 画像は「撮った順＝スクロールした順」に並んでいることを前提にする。
//     静止画のセット（ファイル名順）と動画のフレーム（時刻順）はどちらもこれを満たす。

export const GOLD_KEY = ' GOLD';

// 格子の升どうしを比べる点数（stitchEntries）。
//   name     … 両方に名前があって一致した
//   gold     … 両方とも金（名前が無いので弱い一致）
//   unknown  … どちらかの名前が分からない（判定材料にしない）
//   mismatch … 両方に名前があって違う＝同じ升を別の名前に読んだ（読み違い。多数決の材料になる）
//   gap      … 片方にしか無い升（画面の端・バッジ・タップ演出に隠れて検出できなかった）
// 読み違いの罰は隙間2つぶん（-2）より軽い。升の対応は段のずれ k だけで決まるので、
// 「読み違い」と「1枚欠けて繰り上がった並び」を混同することはもう無い（stitchEntries の説明）。
const SCORE = { name: 3, gold: 1.5, unknown: 0, mismatch: -1.5, gap: -1 };

/**
 * 1画像ぶんのカードを、画面に並ぶ順（上から、左→右）に並べ替える。
 *
 * この画面のカードは**2列の格子**に並ぶ。`y` の差だけで並べ替えると、同じ段の左右が
 * 1px ずれているだけで左右が入れ替わる（実測: 同じ段で y=1694 と y=1695）。
 * 入れ替わると継ぎ目の対応づけが取れなくなるので、**まず段にまとめてから左→右**に並べる。
 * 段の許容差はカードの高さの中央値の半分（座標の決め打ちをしない）。
 */
function sortByPosition(cards) {
	const list = cards.slice().sort((a, b) => a.card.y - b.card.y);
	const hs = list.map((c) => c.card.h).sort((a, b) => a - b);
	const medianH = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
	const tol = Math.max(4, Math.round(medianH * 0.5));
	const out = [];
	let band = [];
	let bandIndex = 0;
	const flush = () => {
		band.sort((a, b) => a.card.x - b.card.x);
		band.forEach((c) => out.push({ card: c, band: bandIndex }));
		bandIndex++;
		band = [];
	};
	for (const c of list) {
		if (band.length && c.card.y - band[0].card.y > tol) flush();
		band.push(c);
	}
	if (band.length) flush();
	return out;
}

/**
 * 1画像ぶんのカードを、継ぎ合わせ用の項目の配列にする。
 * どのカードだったか（id・金かどうか）を持ち続ける。
 *
 * **段（band）は「見えているカードの段」ではなく「画面上の段」で数える。**
 * 隣り合う段の間隔（カードの高さ＋余白）の中央値で y の差を割って段の番号にするので、
 * 途中の段が丸ごと隠れて（バッジ・タップ演出）検出されなくても、その下の段の番号は飛ぶ。
 * 見えている順に番号を振ると、隠れた段のぶんだけ下の段が繰り上がり、格子の対応づけが1段ずれる。
 */
export function toEntries(cards, nameOf) {
	const sorted = sortByPosition(cards);
	// 段の y（各段の先頭カードの y）から、段の間隔の中央値を出す
	const bandY = [];
	sorted.forEach((e) => { if (bandY[e.band] == null) bandY[e.band] = e.card.card.y; });
	const steps = [];
	for (let i = 1; i < bandY.length; i++) steps.push(bandY[i] - bandY[i - 1]);
	const pitch = steps.length ? steps.slice().sort((a, b) => a - b)[Math.floor(steps.length / 2)] : 0;
	const bandOf = (b) => (pitch > 0 ? Math.round((bandY[b] - bandY[0]) / pitch) : b);
	return sorted.map(({ card: c, band }) => ({
		id: c.id,
		gold: c.kind === 'gold',
		// 格子の何列目か。左の列の左端はカード1枚の幅よりずっと内側にある
		// （実測: 幅 531 に対し 左 x=53〜68 / 右 x=597〜598）ので、幅で割れば列が出る。
		side: c.card.w > 0 ? Math.round(c.card.x / c.card.w) : 0,
		band: bandOf(band),
		key: c.kind === 'gold' ? GOLD_KEY : nameOf(c.id) || null
	}));
}

function pairScore(a, b) {
	if (a.key == null || b.key == null) return SCORE.unknown; // 名前が分からない側は判定材料にしない
	if (a.key !== b.key) return SCORE.mismatch;
	return a.key === GOLD_KEY ? SCORE.gold : SCORE.name;
}

function newRow(entry, grid) {
	return { key: entry.key, side: entry.side, grid, ids: [entry.id], goldCount: entry.gold ? 1 : 0, total: 1 };
}

function absorb(row, entry) {
	row.ids.push(entry.id);
	row.total++;
	if (entry.gold) row.goldCount++;
	// 前の画像で名前が分からなかった行は、後の画像で分かった名前で埋める
	if (row.key == null && entry.key != null) row.key = entry.key;
	return row;
}

/**
 * `toEntries` の結果を継ぎ合わせ、**1行ごとにどのカードが重なったか**を返す。
 * 戻り値: { rows, overlaps, gaps }
 *   rows[i] = { key, side, grid, ids: [...], goldCount, total }
 *     key       … その行の暫定の名前（金なら GOLD_KEY、未確定なら null）
 *     grid/side … 一覧の格子の何段目・どちらの列か（一覧の並び順そのもの）
 *     ids       … その行に重なったカードのID。多数決の母数になる
 *     goldCount … そのうち金と判定された枚数
 *   overlaps … 継ぎ目ごとに、名前どうしが一致した個数
 *   gaps     … 重なりが1つも見つからなかった継ぎ目の数。撮り漏れの疑い
 *
 * ■ 対応づけは「列の並び」ではなく「2列の格子の平行移動」で決める（24セッション目に変更）
 *   一覧は2列の格子に流し込まれるだけで組み替わらないので、隣り合う画像の対応は
 *   **段の番号のずれ k がただ1つ**決まれば全部決まる（画像側の (段, 列) → 一覧側の (段+k, 列)）。
 *   以前は1次元の列にほどいて編集距離のDPで合わせていたが、それだと**片方の列で1枚だけ
 *   検出できなかったとき**（1180x2556 の実測: タップ演出の光る輪が「アオハル点火・賢」の右のカード
 *   を隠した）、その列の下のカードが1段繰り上がって前の画像と同じ長さで並び、「読み違い」として
 *   別のカードと同じ行にまとめられた（通常タブ 43種が 45行になり、賢と夢の途中の票が1行に混ざった）。
 *   格子で持てば、隠れたカードは**穴**になるだけで下のカードの位置は動かない。
 *   側（side）の食い違いも起こり得ない（同じ格子の升だけを比べる）。
 *
 *   k の候補は「画像の全部が新しい段」から「画像の先頭が一覧の先頭」までの全部を試し、
 *   升ごとの点数（名前の一致 +3 / 金どうし +1.5 / どちらかが未確定 0 / 名前の食い違い -1.5 /
 *   片方にしか無い升 -1）の合計がいちばん高い k を採る。同点なら直前の画像の k に近いほう
 *   （連続するフレームは大きくは動かない）。合計が 0 以下なら重なり無しとして末尾に足す（gaps）。
 *   撮影は上下どちらにスクロールしてもよいので、k が減る向きも許す。
 */
export function stitchEntries(sequences) {
	const cells = new Map(); // `${grid}:${side}` → row
	const cellKey = (grid, side) => `${grid}:${side}`;
	const overlaps = [];
	let gaps = 0;
	let maxGrid = -1;
	let prevK = 0;
	sequences.forEach((seq) => {
		if (!seq.length) return;
		const maxBand = Math.max(...seq.map((e) => e.band));
		if (maxGrid < 0) {
			seq.forEach((e) => cells.set(cellKey(e.band, e.side), newRow(e, e.band)));
			maxGrid = maxBand;
			prevK = 0;
			return;
		}
		let best = null;
		for (let k = 0; k <= maxGrid + 1; k++) {
			let score = 0;
			let matched = 0;
			const covered = new Set();
			seq.forEach((e) => {
				const g = e.band + k;
				const row = cells.get(cellKey(g, e.side));
				if (row) {
					covered.add(row);
					const s = pairScore(row, e);
					score += s;
					if (row.key != null && row.key === e.key && e.key !== GOLD_KEY) matched++;
				} else if (g <= maxGrid) {
					score += SCORE.gap; // 一覧側に無い升に画像のカードがある（以前は隠れていた升）
				}
			});
			// 画像が覆う範囲（段 k〜k+maxBand）にある一覧側の行で、画像に相手がいないもの
			for (const row of cells.values()) {
				if (row.grid >= k && row.grid <= k + maxBand && !covered.has(row)) score += SCORE.gap;
			}
			const better = !best || score > best.score || (score === best.score && Math.abs(k - prevK) < Math.abs(best.k - prevK));
			if (better) best = { k, score, matched };
		}
		let k;
		if (!best || best.score <= 0) {
			gaps++;
			overlaps.push(0);
			k = maxGrid + 1; // 重なりが見つからない → 末尾に新しい段として足す
		} else {
			overlaps.push(best.matched);
			k = best.k;
		}
		seq.forEach((e) => {
			const g = e.band + k;
			const row = cells.get(cellKey(g, e.side));
			if (row) absorb(row, e);
			else cells.set(cellKey(g, e.side), newRow(e, g));
			if (g > maxGrid) maxGrid = g;
		});
		prevK = k;
	});
	const rows = [...cells.values()].sort((a, b) => a.grid - b.grid || a.side - b.side);
	return { rows, overlaps, gaps };
}

/**
 * 同じ名前になった行を1行にまとめる。
 *
 * なぜ要るか: 継ぎ目で重なりが見つからなかったとき（タブを切り替えた直後など）、
 * 同じ一覧の項目が2行に割れることがある。すると種類数が水増しされ、多数決の票も割れる。
 * **1つのタブの一覧に同じスキルは2つ並ばない**ので、同じ名前の行は同じ項目とみなしてよい。
 * 金の行（名前が無い）と未確定の行はまとめない。
 */
export function mergeDuplicateRows(rows) {
	const byKey = new Map();
	const out = [];
	rows.forEach((r) => {
		if (r.key == null || r.key === GOLD_KEY) { out.push(r); return; }
		const first = byKey.get(r.key);
		if (!first) { byKey.set(r.key, r); out.push(r); return; }
		first.ids.push(...r.ids);
		first.total += r.total;
		first.goldCount += r.goldCount;
	});
	return out;
}
