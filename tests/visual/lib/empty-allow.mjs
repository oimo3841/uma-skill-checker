// 空の集まりで判定してよい所の一覧（T155・決定 622。仕掛けは lib/empty-probe.mjs）
//
// 1項目 = { title, file, line, why }
//   title: 塊の見出しに含まれる文字（空なら見出しを問わない）
//   file : 検査のファイル（tests/ から。空ならファイルを問わない）
//   line : 鳴った行の中身に含まれる文字（行番号は検査の直しでずれるので使わない。ページの中は evaluate に渡した関数の中の行）
//   why  : 空でよい理由
// 足すときは、その確かめが空でも「何かを確かめている」理由を書く（件数を別に見ている・仕様として空が真・入れ子の外側に中身がある、など）。
// 素通り（確かめの文が言っていることが1件も確かめられていない）なら、ここに足さずに検査を直す。
export const EMPTY_ALLOW = [
	// ---- (1) 読み取りの関数の中。判定は件数で別に見ていて、空が期待の場面（T149 の 2-3） ----
	{ title: 'C129B', file: 'tests/visual/blocks-15.mjs', line: 'raceDisabled: race.every(',
		why: '読み取りの関数の中。指定なしの場面ではレース条件の行が0件であることを race（件数）で別に確かめている' },
	{ title: '段3b', file: 'tests/visual/run-smoke.mjs', line: 'greyDisabled: grey.every(',
		why: '読み取りの関数の中。除外なしの場面ではグレーアウトが0件であることを grey（件数）で別に確かめている（2か所）' },
	// ---- (2) 計算・探索の中。仕様として空は真 ----
	{ title: 'オススメサポ④段11', file: 'tests/visual/blocks-12.mjs', line: 'Object.keys(tm).every(',
		why: '種類の指定なし（{}）は「どの種類の枚数も満たす」が仕様。256条件の打ち切りを数える計算の中' },
	{ title: 'サポカ外(', file: 'tests/visual/blocks-28.mjs', line: '(t.surface || []).every(',
		why: 'バ場のタグの無いスキルは、どのバ場にも当たる（仕様）。期待の母集団を作る計算の中（サポカ外(3)・(6) の2塊で同じ関数を使う）' },
	{ title: 'C-187(d3)', file: 'tests/visual/blocks-46.mjs', line: 'r.events.every((e) => e.memberKey !== m.key)',
		why: 'イベントを持たないカードを探す探索の中（空なら「持たない」が真で、それを探している）。見つかった件数は直後に確かめている' },
	{ title: 'T53', file: 'tests/visual/blocks-84.mjs', line: 'const groups = cardsData.filter((c) => c.isGroup === true)',
		why: 'グループのカードの被覆を作る計算の中（メンバーのスキルが無い場合を含めて組み立てる）。判定は組み立てたあとの件数・中身で見ている' },
	// ---- (3) 空でよい形（入れ子で外側に中身がある・件数も比べている・守りつき） ----
	{ title: '微調整2C1', file: 'tests/visual/blocks-20c.mjs', line: 'r.lines.slice(r.lines.length - ((fact ? r.F : 0) + (gene ? r.G : 0))).every(',
		why: '因子・遺伝子なしの場合は末尾の行が0行で正しい（fact・gene の組み合わせで切り替える。ありの場合は中身がある）' },
	{ title: '夜間4(3)', file: 'tests/visual/blocks-55.mjs', line: 'r.dim.every(',
		why: '条件外の行が無いカードの場合。条件外の行があるカードでは中身がある（同じ塊の別のカード）' },
	{ title: '夜間4(3)', file: 'tests/visual/blocks-55.mjs', line: 'r.dimLeft.every(',
		why: '左の選択肢に条件外が無いカードの場合。あるカードでは中身がある（同じ塊の別のカード）' },
	{ title: '夜間4(2)', file: 'tests/visual/blocks-55.mjs', line: 'r.toned.every(',
		why: '色の付く行が無い幅・テーマの場合。ほかの場合で中身がある（2か所）' },
	{ title: 'T42動画(3)', file: 'tests/visual/blocks-80.mjs', line: 'p.warn.every((w) => w.indexOf(p.label',
		why: '入れ子の内側。警告の無い人は0件で正しく、外側（人の一覧）と警告の合計（r.total >= 1）は別に確かめている' },
	{ title: 'T59', file: 'tests/visual/blocks-89.mjs', line: 'persons.every((p, i) => p.files.length === window.__before[i].length',
		why: '枠が空の人どうしの比べ（files が0件どうしで同じ）。件数も比べている' },
	{ title: 'T68', file: 'tests/visual/blocks-92.mjs', line: 'same: persons.every((p, i) => p.files.length === window.__before[i].length',
		why: '枠が空の人どうしの比べ（files が0件どうしで同じ）。件数も比べている' },
	{ title: 'T82', file: 'tests/visual/blocks-98.mjs', line: 'same: persons.every((p, i) => p.files.length === window.__before[i].length',
		why: '枠が空の人どうしの比べ（files が0件どうしで同じ）。件数も比べている' },
	{ title: 'T76', file: 'tests/visual/blocks-96.mjs', line: 's.cols.every((c) => c.thumbs.every(',
		why: '入れ子の内側。サムネイルの無い列は0件で正しく、外側の列と、列ごとのサムネイルの数は別に確かめている' },
	// ---- 子プロセス（今の仕掛けは子プロセスに入らないので鳴らない。T149 の試作では NODE_OPTIONS で入ったので鳴った） ----
	{ title: '', file: 'tests/catalog/check-catalog.mjs', line: "e.tags[k].every(isStr)",
		why: 'check:catalog の型の確かめ。タグの配列が空でも「文字列の配列」であることは正しい' }
];

// 案D（run-smoke.mjs の assert の [注意]）で、製品が意図して返す Infinity・NaN を出さない一覧（T155・決定 644）
// 1項目 = { title, key, why }
//   title: 確かめの見出し（assert の第2引数）に含まれる文字
//   key  : 詳細の中で Infinity などを持つキーの名前（配列の中なら、その配列を持つキーの名前）
//   why  : 意図した値である理由
// 見出しが当たっても、ほかのキーに Infinity などがあれば [注意] は出る。
export const NOTICE_ALLOW = [
	{ title: '結合画像の構成(6):', key: 'freeBelow',
		why: 'special.html のアイコンの範囲を見つける関数が、アイコンの下の空きに限りが無いときに Infinity を返す（意図した値。3件: 合成の画像・継承画面・自分の画面）' },
	{ title: 'T51(6):', key: 'room',
		why: '検査が「右の端に限りが無い」場合として stitchDrawPersonGenes に Infinity を渡し、製品がそれを room として返す（意図した値）' }
];
