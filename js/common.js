/**
 * common.js
 * ウマ娘スキル管理ツール群（index.html / special.html）で共有する共通ロジック。
 *
 * 設計方針:
 * - OCR照合のコアロジックは副作用のない関数の集合として保つ。
 * - 各ツール（index.html, special.html, exam.html）は自分自身の状態変数
 *   （skillList, detectedSkills, matchReasons など）を保持し、
 *   ここに定義された関数へ引数として渡し、戻り値を受け取って自分の状態に反映する。
 * - スキルリストの内容（特定の技名など）に関する決め打ち・ハードコードは行わない。
 *   どんなスキルリストが来ても汎用的に正しく動くことを前提に設計する。
 * - 唯一の例外として「照合対象スキル辞書」だけはこのファイルに置ける
 *   （末尾の「照合対象スキル辞書の注入」セクション参照）。ここに置くのは
 *   呼び出し元から渡された任意のスキル名リストであり、スキル名そのものは
 *   一切ソースに書かない。
 */

/* ============================================================
 * 定数
 * ============================================================ */
// このファイルの版。ツールの開発用ログの先頭に表示される。
// 「どの版の common.js がブラウザで実際に動いているか」を確認するための目印。
// 中身を変更したらこの日付も更新すること。
const COMMON_JS_VERSION = '2026-09-13a';

const MAX_SIDE_PX = 3000;
const CONF_THRESHOLD = 55;
const ROW_TARGET_HEIGHT = 56;
const DARK_LEVEL = 128;
const ADAPTIVE_BLOCK = 31;
const ADAPTIVE_C = 12;

// 2026-09-06b 追加 / 2026-09-12 見直し: 画質による事前足切り（下記「画質判定」セクション参照）
// のしきい値。
//
// X(旧Twitter)経由で再共有された画像や、「レシート因子メーカー」等で複数画像を結合した
// うえで再圧縮された画像は、文字のストロークが画素として失われており、CHAR_CONFUSION_MAP や
// allowedDistance をどれだけ調整しても構造的に精度が出ない（実機画像 HLCQGwlbYAAqGcD.jpg,
// 730×1931 で確認済み）。これらを「そもそも対象外の入力」として弾くのがこのしきい値の目的。
//
// 2026-09-12: 当初は「横幅900px未満なら足切り」としていたが、実機ケース
// test-images/20260912_シロエさんエル（765×1360）が丸ごと弾かれる誤検出を確認した。
// 追試の結果、900pxに「読める/読めない」の崖は無く、765pxの原寸を弾く一方で、
// それを900pxへ引き伸ばしただけの（情報量が増えていない）画像は通してしまっていた。
//
// 値を決め直すにあたり、DMM版の挙動を実機で確認した（2026-09-12）:
//   ・ウィンドウを変えると、ゲームは「その大きさで描き直す」。縮小ではない
//     （305px原寸は、968pxを305pxへ縮小したものより鮮明度が1.88倍高い）
//   ・UIはリフローしない。どの大きさでも同じ行数・同じ内容が写る
//     → このアプリに限り「横幅」はそのままスケールの代理指標として使える
//   ・Snipping Toolは物理画素を1:1で撮る（表示倍率200%環境で確認）
//
// そのうえで、実機の原寸スクリーンショットだけで測った結果が次のとおり。
// 因子タブ／--dict=deck の445種で照合／★は切り出した全12行ぶん:
//
//   幅        968  876  765(*)  619  490  342
//   名前      8/8  8/8  25/25   7/8  7/8  0/8
//   ★       12/12 12/12 25/25  12/12 11/12  -
//
//   (*) 765pxのみ別ウマ娘（シロエさんのエルコンドルパサー・因子25件）
//   619px/490px の欠落1件はいずれも「序盤巧者」で、行も★も正しく取れており
//   「序→傳/厚/蝉」「盤→盟/蝉」の文字誤読が原因。解像度の問題ではない。
//   490px では★が1件過少（マイルCS南部杯 ★3→★1）になり、ここから★が崩れ始める。
//   342px は行検出そのものが成立せず、全体OCRへフォールバックして壊滅する。
//
// 結論として、765px以上は完璧・700px未満は必ず何かを失う・342pxは崩壊。
// 推奨値は「完璧だった765px」と「欠落が出た619px」の間の700pxに、
// 足切りは「実用できた490px」と「崩壊した342px」の間の400pxに置く。
// 400〜490px と 619〜765px は未検証（実機サンプルが無い）。
//
// なお ★の誤りは2つのデータセットを通じて全件が過少方向で、逆向きは1件も出ていない。
// 過少判定は利用者から見えない誤りなので、警告文はこれに触れること。
//
// 注意: 縮小して作った画像で★を測ってはいけない。縮小はボケが上乗せされて★が潰れるため、
// 600pxの縮小画像は★3/8まで落ちるが、ほぼ同じ幅の619px原寸は★12/12で正しい。
// この取り違えで一度、推奨値を過大に見積もった。
const RECOMMENDED_BASE_WIDTH_PX = 700;
const MIN_BASE_WIDTH_PX = 400;
// 鮮明度スコア（ラプラシアン分散）は画素あたりのエッジ強度なので、同じ画像でも
// 縮小すると上がり拡大すると下がる（実測: 同一画像で 600px→1062 / 765px→1051 /
// 900px→345）。つまりこの値は「小さい画像の劣化」を検出する用途には使えず、
// 大きいのにぼやけている画像（拡大リサイズや強い再圧縮）を弾くためのものと考えること。
const MIN_SHARPNESS_SCORE = 120;

const CHAR_CONFUSION_MAP = {
	'娩': '娘', '嫡': '娘', '棒': '枠', '桶': '枠', '狐': '狼', '颯': '狼', '貴': '覚', '緯': '線', '被': '神',
	// 2026-09-06 追加: 実機ログ「HRcRQWvbMAAE0Yc.jpg」の解析で見つかった誤読パターン。
	// 「時」⇔「春」は共に「日」を含み字形が近い。「量」⇔「重」「貸」⇔「賞」は
	// 「交流重賞〇」で確認された誤読で、いずれも他のスキル名にも登場しうる字のため
	// 個別の辞書登録ではなく汎用の文字混同マップ側に追加する。
	'時': '春', '量': '重', '貸': '賞',
	// 2026-09-06 追加: 実機ログ「ユニコン3-2.png」で「冬ウマ娘〇」が
	// 「キウマ娩〇」「きウマ媚〇」と誤読され、春/夏/秋/冬の4候補との
	// 距離1タイが解消できず判定漏れになっていたパターン。
	// 「冬」の字（夂の斜め線＋下の点2つ）がこのUIフォントの太字・丸ゴシックで
	// 潰れると「キ」「き」に寄って誤認識される。「媚」は「娘」と女偏＋
	// 右側の画数が近く誤認識されやすい（「娩」は既存エントリで対応済み）。
	'キ': '冬', 'き': '冬', '媚': '娘',
	// 2026-09-06 追加: 実機ログ（親結合画像.png）で「左回り○」「左回りの目覚め」が
	// いずれも「を回り〇」「を回りの目貴め」と誤読され、右/左（/小回り）との
	// 距離1タイが解消できず判定漏れ・曖昧未決になっていたパターン。同一画像内で
	// 2件とも「を」始まりの誤読が実際には「左」由来だったことを確認済み。
	// 「左」の縦棒＋横画の字形がこのUIフォントで潰れると「を」に寄って誤認識される。
	// リスク: 「右回り〇」側が逆に「を」に誤読された場合、本マッピングにより
	// 左に誤判定される可能性がある。右回り系の実機ログで悪影響が出ていないか要確認。
	'を': '左',
	// 2026-09-07 追加: 実機ログで「泥遊び〇」が「淑遽び〇」「淑還び〇」と誤読され、
	// 距離2（「泥」「遊」の2文字が同時に崩れる）となり許容距離1を超えて
	// 誤字候補どまりになっていたパターン。個別に確認できたのは「泥」「遊」の崩れだが、
	// 「遊」は他のスキル名にも登場しうる字のため、「泥」だけでなく「遊」側の対策も
	// 汎用の文字混同マップに追加する（「時→春」等の前例に倣う）。
	'淑': '泥', '遽': '遊', '還': '遊',
	// 2026-09-09 追加: 実機ログで「臨機応変」が「眼機応富」(信頼度64)、「臨機応要」(信頼度0)と
	// 誤読され、前者は距離2（「臨」「変」の2文字が同時に崩れる）で許容距離1を超え、
	// 後者は信頼度0のため距離判定に進む前に足切りされ、結果として未検出になっていたパターン。
	// 「臨」は左側の縦画＋右上の「臣」がこのUIフォントで潰れると「眼」（目偏＋艮）に寄り、
	// 「変」は「亦」＋「夂」の下部が潰れると「富」「要」に寄る。
	// 誤爆リスクの確認（2026-09-09時点）:
	//   - 「眼」を含むスキルはマスタ(uma-skill-deck-skills.json 439件)中「鋭い眼光」1件のみ。
	//     normalizeText() はスキル名側にも同じ変換を掛けるため「鋭い臨光」同士で突き合わされ、
	//     正規化後の衝突（別スキル同士が同一文字列になる）は439件・exam.html 133件とも0件。
	//   - 「富」「要」を含むスキル名はマスタ・exam.html固定リストのいずれにも存在しない。
	// 将来「富」「要」「眼」を含むスキルが追加され、かつ同じ位置に「変」「臨」を持つ別スキルが
	// 併存する場合は正規化後に衝突しうるので、マスタ更新時に再確認すること。
	'眼': '臨', '富': '変', '要': '変',
	// 2026-09-10 追加: 実機（special.html + UmaSkill Deckの439種辞書）で「連綿」が
	// 「連締」「連縄」と誤読され、未検出になっていたパターン。
	// tests/ocr のハーネスで再現済み（3枚中3回とも2文字目だけが崩れ、
	// 「連締」×2・「連縄」×1。1文字目の「連」は毎回正しく読めている）。
	// 「綿」「締」「縄」はいずれも糸偏＋右側が同程度の画数で、このUIフォントの
	// 太字・丸ゴシックで潰れると互いに寄る。
	// 2文字のスキル名は allowedDistance() が距離0（完全一致）を要求するため、
	// 1文字でも崩れると必ず落ちる。しきい値を距離1に緩める案も実測したが、
	// 「二刀流」の途中から読まれた「刀流」（正規化で「力流」）が「力業」に
	// 距離1で当たる誤検出が同じ画像で発生したため、しきい値ではなく
	// 文字混同マップ側で対処する（「時→春」等の前例に倣う）。
	// 誤爆リスクの確認（2026-09-10時点）:
	//   - 「締」「縄」を含むスキルはマスタ(uma-skill-deck-skills.json 439件)・
	//     exam.html固定リスト133件のいずれにも存在しない。
	//   - 「綿」を含むスキルは439件中「連綿」1件のみ。
	//     正規化後の衝突（別スキル同士が同一文字列になる）は439件・133件とも0件。
	'締': '綿', '縄': '綿',
	// 2026-09-13 追加（第1段・72候補／74項目）: スキルセット画面の画面収録（無劣化 1180x2556・3本・
	// 6,247枚。正解はおいもさんの確認済み）で、2種以上のスキルで起きた1文字の誤読のうち、
	// 衝突なし・誤着地なし・見込み1枚以上のもの（tests/skillset/rank-confusion-candidates.mjs の第1段）。
	// 採用前後の実測（tests/skillset/evaluate-confusion-map.mjs）:
	//   一意に一致したが誤り 0 → 0（4,473 → 5,084枚のうち）／確認なしで取り込める 71.6% → 81.4%／
	//   多数決で確定しない行 45 → 29（重なり1枚では 95 → 67）。
	// 誤爆リスクの確認: マスタ(uma-skill-deck-skills.json 445件)・exam.html 133件とも正規化後の衝突 0
	//   （npm run test:norm でも確認）。
	// 統一前の字も同じ正字へ向ける: normalizeText は「このマップ → HOMOGLYPH_MAP」の順なので、
	//   HOMOGLYPH_MAP で同じ字に潰れる字（ニ→二、ベ→べ）はここに並べて書く（二→ー なら ニ→ー も）。
	// 一覧と根拠は素材フォルダの reports/confusion-adoption-plan.md（採用の記録）。
	'瞞': '脚', // 3種／延べ29回（末脚・キレる脚・健脚）
	'駄': '駆', // 9種／延べ48回（先駆け・先行駆け引き・差し駆け引き・逃げ駆け引き・追込駆け引き・抜け駆け禁止 ほか3）
	'怠': '急', // 7種／延べ69回（急ぎ足・急浮上・大急ぎ・急発進・急襲・急降下 ほか1）
	'均': '歩', // 4種／延べ40回（素直な一歩・練達の一歩・会心の一歩・巨歩）
	'遡': '速', // 4種／延べ52回（アオハル点火・速・レースの真髄・速・直線加速・快速）
	'遠': '速', // 4種／延べ27回（アオハル点火・速・レースの真髄・速・コーナー加速○・快速）
	'道': '進', // 4種／延べ21回（進出開始・ひたむき前進・急発進・精進）
	'駒': '駆', // 3種／延べ20回（先行駆け引き・駆け降り・追駆）
	'抜': '歩', // 2種／延べ9回（会心の一歩・巨歩）
	'二': 'ー', 'ニ': 'ー', // 51種／延べ777回（アメリカンドリーム・スリップストリーム・コーナー巧者○・サンタアニタパークレース場○・ナイター○・スタミナイーター ほか45）
	'で': 'て', // 15種／延べ181回（気持ちを乗せて・想いを背負って・流れに任せて・気迫を込めて・鬼気迫って・覚悟を決めて ほか9）
	'じ': 'し', // 13種／延べ202回（淀みなし・抜かりなし・憂いなし・目くらまし・まき直し・お見通し ほか7）
	'縁': '線', // 12種／延べ74回（直線コース○・直線巧者・直線加速・直線回復・直線一気・マイル直線○ ほか6）
	'綴': '線', // 10種／延べ27回（直線コース○・直線加速・直線巧者・直線一気・短距離直線○・マイル直線○ ほか4）
	'ド': 'ト', // 10種／延べ115回（スリップストリーム・リスタート・スプリントギア・トリック（前）・ギアシフト・フルスロットル ほか4）
	'難': '離', // 9種／延べ185回（根幹距離○・短距離直線○・短距離コーナー○・中距離直線○・中距離コーナー○・長距離コーナー○ ほか3）
	'い': 'し', // 9種／延べ156回（淀みなし・抜かりなし・憂いなし・目くらまし・まき直し・まなざし ほか3）
	'ご': 'ー', // 8種／延べ28回（スリップストリーム・アメリカンドリーム・素直な一歩・コーナー加速○・スタミナイーター・譲れぬ一歩 ほか2）
	'性': '差', // 8種／延べ26回（差しためらい・差し切り体勢・外差し準備・差し焦り・差しけん制・差しコーナー○ ほか2）
	'巻': '差', // 7種／延べ38回（差し駆け引き・差しけん制・差しためらい・差し焦り・差しコーナー○・差し直線○ ほか1）
	'ぐ': 'く', // 6種／延べ128回（活路を拓く！・目くらまし・かく乱・気の向くままに・影より速く・轟く足音）
	'ァ': 'ア', // 6種／延べ41回（テンポアップ・ギアシフト・ホークアイ・ステップアップ・ヒートアップ・アメリカンドリーム）
	'劣': '勢', // 6種／延べ29回（攻めの姿勢・余勢を駆って・差し切り体勢・勢い任せ・逃げ切り体勢・気丈な姿勢）
	'び': '○', // 6種／延べ10回（秋ウマ娘○・冬ウマ娘○・春ウマ娘○・おひとり様○・短距離コーナー○・差しコーナー○）
	'緻': '線', // 6種／延べ9回（直線コース○・直線巧者・直線一気・中距離直線○・差し直線○・追込直線○）
	'す': 'ず', // 5種／延べ32回（向こう見ず・目にも留まらず・一歩ずつ前へ・なりふり構わず・労を惜しまず）
	'あ': 'ず', // 5種／延べ13回（脇目も振らず・目にも留まらず・後先恐れず・なりふり構わず・労を惜しまず）
	'炎': '熱', // 5種／延べ36回（熱狂的・込み上げる熱・溢れる情熱・むきだしの情熱・静かな熱）
	'悪': '差', // 5種／延べ6回（差しためらい・差し切り体勢・差しけん制・差しコーナー○・差しのコツ○）
	'破': '差', // 5種／延べ7回（差しためらい・差し切り体勢・差し焦り・差しのコツ○・光差す方へ）
	'麗': '離', // 4種／延べ39回（根幹距離○・非根幹距離○・長距離直線○・超長距離回復○）
	'が': 'か', // 4種／延べ43回（抜かりなし・確かな足取り・勝利に向かって・心惹かれて）
	'嬉': '娘', // 4種／延べ49回（秋ウマ娘○・夏ウマ娘○・春ウマ娘○・冬ウマ娘○）
	'翼': '離', // 4種／延べ33回（根幹距離○・中距離コーナー○・中距離直線○・長距離コーナー○）
	'膏': '勝', // 4種／延べ27回（真っ向勝負・逃げるが勝ち！・勝負を懸けて・勝負勘）
	'志': 'ず', // 4種／延べ11回（脇目も振らず・後先恐れず・目にも留まらず・なりふり構わず）
	'路': '踏', // 4種／延べ12回（踏み込み上手・影踏み・もう一踏ん張り・華麗な踏み込み）
	'目': '直', // 4種／延べ9回（素直な一歩・実直な走り・直線回復・直線一気）
	'患': '差', // 4種／延べ9回（差しためらい・差し切り体勢・差し直線○・差しのコツ○）
	'緩': '線', // 4種／延べ5回（長距離直線○・逃げ直線○・追込直線○・差し直線○）
	'べ': 'ぺ', 'ベ': 'ぺ', // 3種／延べ99回（ペースキープ・ペースアップ・マイペース）
	'隆': '降', // 3種／延べ63回（直滑降・駆け降り・急降下）
	'迷': '逃', // 3種／延べ26回（逃げ駆け引き・逃げ直線○・逃げ切り体勢）
	'逗': '返', // 3種／延べ46回（恩返し、召し上がれ・盛り返し・切り返し）
	'躇': '踏', // 3種／延べ37回（踏み込み上手・影踏み・もう一踏ん張り）
	'ゑ': '急', // 3種／延べ18回（急ぎ足・急浮上・大急ぎ）
	'蓬': '夢', // 3種／延べ82回（夢の再生方法・夢への挑戦・夢の途中）
	'謬': '護', // 3種／延べ22回（地の加護・陽の加護・海の加護）
	'逢': '返', // 3種／延べ23回（恩返し、召し上がれ・盛り返し・切り返し）
	'暇': '吸', // 3種／延べ15回（深呼吸・静かな呼吸・阿吽の呼吸）
	'た': '大', // 3種／延べ6回（大井レース場○・大きなリード・大急ぎ）
	'遍': '追', // 3種／延べ14回（追込ためらい・追込焦り・追込コーナー○）
	'登': '夢', // 3種／延べ13回（夢の再生方法・夢への挑戦・夢の途中）
	'バ': 'パ', // 3種／延べ12回（シンパシー・パス上手・パイオニア）
	'燦': '熱', // 3種／延べ4回（溢れる情熱・込み上げる熱・静かな熱）
	'ブ': 'プ', // 3種／延べ27回（リードキープ・アプローチ・猛プッシュ）
	'ち': 'も', // 3種／延べ111回（本気で休んで、もう一度・脇目も振らず・目にも留まらず）
	'切': '制', // 3種／延べ36回（追込けん制・先行けん制・自制心）
	'脈': '勝', // 3種／延べ32回（真っ向勝負・逃げるが勝ち！・勝負を懸けて）
	'星': '呼', // 3種／延べ17回（深呼吸・静かな呼吸・阿吽の呼吸）
	'踊': '踏', // 3種／延べ14回（踏み込み上手・もう一踏ん張り・華麗な踏み込み）
	'遺': '進', // 3種／延べ4回（進出開始・ひたむき前進・急発進）
	'譜': '護', // 3種／延べ35回（地の加護・陽の加護・海の加護）
	'愛': '意', // 3種／延べ33回（外枠得意○・内枠得意○・対抗意識○）
	'譚': '護', // 3種／延べ26回（地の加護・陽の加護・海の加護）
	'誌': '護', // 3種／延べ24回（陽の加護・地の加護・海の加護）
	'奴': '娘', // 3種／延べ23回（春ウマ娘○・夏ウマ娘○・冬ウマ娘○）
	'砥': '差', // 3種／延べ15回（外差し準備・差し切り体勢・差しけん制）
	'魁': '熱', // 3種／延べ12回（溢れる情熱・込み上げる熱・むきだしの情熱）
	'飾': '差', // 3種／延べ10回（差しコーナー○・差しけん制・差し直線○）
	'想': '髄', // 3種／延べ9回（レースの真髄・力・レースの真髄・速・レースの真髄・賢）
	'硝': '夢', // 3種／延べ3回（夢の再生方法・夢への挑戦・夢の途中）
};
const HOMOGLYPH_MAP = {
	'◯': '○', '〇': '○', '◎': '○', '●': '○', '◉': '○', '0': '○', 'O': '○', 'o': '○', 'Q': '○', 'D': '○', '°': '○',
	'一': 'ー', '-': 'ー', '‐': 'ー', '–': 'ー', '—': 'ー', '−': 'ー', '~': 'ー', '_': 'ー', '|': 'ー', 'l': 'ー', 'I': 'ー',
	'カ': '力', 'ニ': '二', '口': 'ロ', '卜': 'ト', '夕': 'タ', '工': 'エ', '才': 'オ', '八': 'ハ', 'ヘ': 'へ', 'ベ': 'べ', 'ペ': 'ぺ', '刀': '力', '儿': 'ル', '厶': 'ム', '又': 'ス'
};

/* ============================================================
 * 文字正規化・距離判定
 * ============================================================ */
function normalizeText(input) {
	if (!input) return '';
	let s = String(input).normalize('NFKC');
	s = s.replace(/[\s　]/g, '');
	s = s.replace(/[★☆✦✧♪♫※・,.。、:：;；!！?？"'`()（）\[\]{}<>«»\\\/@#$%^&*+=]/g, '');
	let out = '';
	for (const ch of s) {
		let c = (CHAR_CONFUSION_MAP[ch] !== undefined) ? CHAR_CONFUSION_MAP[ch] : ch;
		c = (HOMOGLYPH_MAP[c] !== undefined) ? HOMOGLYPH_MAP[c] : c;
		out += c;
	}
	return out.replace(/ー{2,}/g, 'ー');
}

function levenshtein(a, b) {
	const la = a.length, lb = b.length;
	if (la === 0) return lb;
	if (lb === 0) return la;
	let prev = new Array(lb + 1), cur = new Array(lb + 1);
	for (let j = 0; j <= lb; j++) prev[j] = j;
	for (let i = 1; i <= la; i++) {
		cur[0] = i;
		const ca = a[i - 1];
		for (let j = 1; j <= lb; j++) {
			const cost = ca === b[j - 1] ? 0 : 1;
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
		}
		const tmp = prev; prev = cur; cur = tmp;
	}
	return prev[lb];
}

function allowedDistance(len) {
	// 3文字ちょうどのスキル名（例：「急降下」）はこれまで距離0（完全一致必須）
	// だったため、字形の近い1文字誤読（隆⇔降 など）だけで確定できないケースがあった。
	// 2文字以下はまだ誤爆リスクが高いので0のまま、3文字から緩和する。
	if (len <= 2) return 0;
	if (len <= 5) return 1;
	if (len <= 9) return 2;
	return 3;
}

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
 * 画像読み込み・キャンバス変換
 * ============================================================ */
function loadImage(file) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
		img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
		img.src = url;
	});
}

function toBaseCanvas(img) {
	const longSide = Math.max(img.naturalWidth, img.naturalHeight);
	const scale = longSide > MAX_SIDE_PX ? (MAX_SIDE_PX / longSide) : 1;
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(img.naturalWidth * scale);
	canvas.height = Math.round(img.naturalHeight * scale);
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
	return canvas;
}

function scaleCanvas(canvas, targetWidth) {
	const scale = Math.max(1, Math.min(3, targetWidth / canvas.width));
	const out = document.createElement('canvas');
	out.width = Math.round(canvas.width * scale);
	out.height = Math.round(canvas.height * scale);
	const ctx = out.getContext('2d');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(canvas, 0, 0, out.width, out.height);
	return out;
}

function getPixels(canvas) {
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/* ============================================================
 * 画像処理（グレースケール化・二値化・マスク処理）
 * ============================================================ */
function toGray(imageData) {
	const d = imageData.data;
	const n = imageData.width * imageData.height;
	const gray = new Uint8ClampedArray(n);
	for (let i = 0, p = 0; i < n; i++, p += 4) {
		gray[i] = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) | 0;
	}
	return gray;
}

/* ============================================================
 * 画質判定（低解像度・再圧縮画像の足切り）
 * ============================================================ */

/**
 * 簡易ラプラシアン分散によるシャープネス（鮮明度）スコア。
 * 値が小さいほど画像がぼやけている＝文字のストロークが潰れていることを示す。
 * 一般的な「ラプラシアンの分散でボケを検出する」手法の簡易実装で、
 * 3x3の代わりに上下左右4近傍のみを使う軽量版（画像全体を毎回舐めるため）。
 */
function sharpnessScore(gray, w, h) {
	if (w < 3 || h < 3) return 0;
	let sum = 0, sumSq = 0, n = 0;
	for (let y = 1; y < h - 1; y++) {
		const row = y * w, up = row - w, down = row + w;
		for (let x = 1; x < w - 1; x++) {
			const lap = 4 * gray[row + x] - gray[row + x - 1] - gray[row + x + 1] - gray[up + x] - gray[down + x];
			sum += lap;
			sumSq += lap * lap;
			n++;
		}
	}
	if (n === 0) return 0;
	const mean = sum / n;
	return sumSq / n - mean * mean;
}

/**
 * 画像がOCR対象として十分な品質かどうかを判定する。
 *
 * 背景: X(旧Twitter)での再共有や「レシート因子メーカー」等での複数画像結合を経た画像は、
 * 縮小・再圧縮により文字のストロークが画素として失われる。この劣化は行検出やOCRの
 * 前処理を工夫しても復元できない（＝情報自体が失われている）ため、辞書やしきい値の
 * チューニング対象ではなく、事前に弾くべき「対象外の入力」として扱う。
 *
 * 判定は2段階ある。
 *   - reasons（ok:false）… OCRを試みても結果が崩れる水準。呼び出し側はスキップする。
 *   - warnings（ok:true）… 推奨より低品質だが実測では読める水準。呼び出し側はOCRを
 *     実行する。ここを足切りにすると、765pxの直撮りスクリーンショットのような
 *     正当な入力まで弾いてしまう（上のしきい値の実測表を参照）。
 *
 * reasons / warnings は px 値を含む「開発ログ向けの事実」であって、そのまま利用者に
 * 見せる文ではない。利用者に見せる文は buildImageQualityNotice() が rejectKinds /
 * warnKinds から組み立てる（利用者にとって必要なのは px 値ではなく次に取るべき行動）。
 *
 * 戻り値: {
 *   ok, width, height, sharpness,
 *   reasons: string[], warnings: string[],      // 開発ログ用の詳細
 *   rejectKinds: string[], warnKinds: string[], // 'too-small' | 'blurry' | 'narrow'
 * }
 */
function assessImageQuality(baseCanvas) {
	const w = baseCanvas.width, h = baseCanvas.height;
	const reasons = [];
	const warnings = [];
	let sharpness = null;
	try {
		const imageData = getPixels(baseCanvas);
		const gray = toGray(imageData);
		sharpness = sharpnessScore(gray, w, h);
	} catch (err) {
		reasons.push('鮮明度の計測に失敗しました: ' + err);
	}
	const rejectKinds = [];
	const warnKinds = [];
	if (w < MIN_BASE_WIDTH_PX) {
		rejectKinds.push('too-small');
		reasons.push('画像の横幅が ' + w + 'px で、足切りの ' + MIN_BASE_WIDTH_PX + 'px を下回ります。');
	} else if (w < RECOMMENDED_BASE_WIDTH_PX) {
		warnKinds.push('narrow');
		warnings.push('画像の横幅が ' + w + 'px で、推奨の ' + RECOMMENDED_BASE_WIDTH_PX + 'px を下回ります。');
	}
	if (sharpness !== null && sharpness < MIN_SHARPNESS_SCORE) {
		rejectKinds.push('blurry');
		reasons.push('鮮明度スコアが ' + Math.round(sharpness) + ' で、目安の ' + MIN_SHARPNESS_SCORE + ' を下回ります。');
	}
	return {
		ok: reasons.length === 0, width: w, height: h, sharpness: sharpness,
		reasons: reasons, warnings: warnings,
		rejectKinds: rejectKinds, warnKinds: warnKinds
	};
}

/**
 * 画質チェックの結果から、利用者向けの通知文（黄色い警告帯の本文）を組み立てる純粋関数。
 * DOM には触らない。呼び出し側（exam.html / special.html）が textContent に入れる。
 *
 * 文面の決まり:
 *   1. 警告どまりの画像は、1枚ずつ書かずに枚数だけまとめて1回書く
 *      （画像ごとの横幅などの詳細は開発ログに出ているので、ここでは繰り返さない）
 *   2. 足切りした画像は「どれが駄目だったか」が分からないと直せないので、ファイル名を列挙する
 *   3. SNS・結合ツールの説明は、足切りがあるときだけ添える（警告どまりなら原因は
 *      ウィンドウの小ささなので、SNSの話を出すとかえって誤解を招く）
 *   4. 最後は必ず「次に何をすればよいか」で締める。DMM版はウィンドウを変えるとゲームが
 *      その大きさで描き直すため、ウィンドウを大きくするのがそのまま対策になる
 *      （スマホ版は機種依存で可変ではないので「パソコン版をお使いの場合は」と断る）
 *
 * @param {Array<{label:string,name:string,kinds:string[]}>} skipped 足切りしてOCRしなかった画像
 * @param {Array<{label:string,name:string,kinds:string[]}>} warned  警告つきでOCRした画像
 * @returns {string} 表示する本文。何も言うことがなければ空文字。
 */
function buildImageQualityNotice(skipped, warned) {
	skipped = skipped || [];
	warned = warned || [];
	if (skipped.length === 0 && warned.length === 0) return '';

	const blocks = [];
	const list = (items) => items.map((s) => '・' + s.label + ': ' + s.name).join('\n');
	const has = (s, kind) => (s.kinds || []).indexOf(kind) !== -1;

	const tooSmall = skipped.filter((s) => has(s, 'too-small'));
	// 「小さすぎ」と「ぼやけ」の両方に当たった画像は、小さすぎの側だけに数える（原因が重なるため）
	const blurry = skipped.filter((s) => has(s, 'blurry') && !has(s, 'too-small'));
	const other = skipped.filter((s) => !has(s, 'too-small') && !has(s, 'blurry'));

	if (tooSmall.length > 0) {
		blocks.push('次の画像は、ゲーム画面が小さすぎて読み取れませんでした。\n' + list(tooSmall));
	}
	if (blurry.length > 0) {
		blocks.push('次の画像は、ぼやけていて文字を読み取れませんでした。\n' + list(blurry));
	}
	if (other.length > 0) {
		blocks.push('次の画像は読み取れませんでした。\n' + list(other));
	}
	if (warned.length > 0) {
		blocks.push(
			'ゲーム画面が小さめに写っているため（' + warned.length + '枚）、スキル名や★の数を' +
			'取りこぼすことがあります。結果に抜けや★の数の誤りがないかご確認ください。'
		);
	}

	// 締めの一文。足切りがあったかどうかで、お願いの強さと SNS の説明の有無を変える。
	if (skipped.length > 0) {
		blocks.push(
			'パソコン版をお使いの場合は、ゲームのウィンドウを大きくしてから撮り直してください。\n' +
			'SNSに投稿した画像や、複数画像を結合するツールを通した画像も、小さくなって読み取れないことがあります。'
		);
	} else {
		blocks.push('パソコン版をお使いの場合は、ゲームのウィンドウを大きくしてから撮り直すと精度が上がります。');
	}
	return blocks.join('\n\n');
}

function greenMaskOf(imageData) {
	const d = imageData.data;
	const n = imageData.width * imageData.height;
	const mask = new Uint8Array(n);
	for (let i = 0, p = 0; i < n; i++, p += 4) {
		const r = d[p], g = d[p + 1], b = d[p + 2];
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		const delta = max - min;
		if (delta === 0 || max < 90) continue;
		if (delta / max < 0.35) continue;
		if (max !== g) continue;
		let h = 60 * (2 + (b - r) / delta);
		if (h >= 65 && h <= 170) mask[i] = 1;
	}
	return mask;
}

// スピード/根性/スタミナ等、継承元カテゴリ色として使われる「青」を検出するマスク。
// 固有スキル帯（緑）は必ずこの青帯の直後（1行分の隙間を挟んですぐ下）に来るため、
// 「青帯の直後に続く緑帯」という組み合わせを固有スキル帯の識別に利用する
// （detectSkillRows 内の固有スキル帯検出ロジックを参照）。
function blueMaskOf(imageData) {
	const d = imageData.data;
	const n = imageData.width * imageData.height;
	const mask = new Uint8Array(n);
	for (let i = 0, p = 0; i < n; i++, p += 4) {
		const r = d[p], g = d[p + 1], b = d[p + 2];
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		const delta = max - min;
		if (delta === 0 || max < 90) continue;
		if (delta / max < 0.35) continue;
		if (max !== b) continue;
		let h = 60 * (4 + (r - g) / delta);
		if (h >= 180 && h <= 250) mask[i] = 1;
	}
	return mask;
}

function darkMaskOf(gray, level) {
	const mask = new Uint8Array(gray.length);
	for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < level ? 1 : 0;
	return mask;
}

function rowCountsOf(mask, w, h) {
	const out = new Int32Array(h);
	for (let y = 0; y < h; y++) {
		let c = 0;
		const base = y * w;
		for (let x = 0; x < w; x++) c += mask[base + x];
		out[y] = c;
	}
	return out;
}

function colCountsOf(mask, w, yFrom, yTo) {
	const out = new Int32Array(w);
	for (let y = yFrom; y <= yTo; y++) {
		const base = y * w;
		for (let x = 0; x < w; x++) out[x] += mask[base + x];
	}
	return out;
}

function findRuns(counts, threshold, mergeGap, from, to) {
	const runs = [];
	let start = -1;
	for (let i = from; i < to; i++) {
		if (counts[i] >= threshold) { if (start < 0) start = i; }
		else if (start >= 0) { runs.push({ a: start, b: i - 1 }); start = -1; }
	}
	if (start >= 0) runs.push({ a: start, b: to - 1 });
	if (runs.length === 0) return runs;
	const merged = [runs[0]];
	for (let i = 1; i < runs.length; i++) {
		const last = merged[merged.length - 1];
		if (runs[i].a - last.b - 1 <= mergeGap) last.b = runs[i].b;
		else merged.push(runs[i]);
	}
	return merged;
}

function median(arr) {
	if (!arr.length) return 0;
	const s = arr.slice().sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}

function stretchContrast(gray) {
	const hist = new Int32Array(256);
	for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
	const total = gray.length;
	const lowCut = total * 0.02, highCut = total * 0.98;
	let acc = 0, lo = 0, hi = 255;
	for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lowCut) { lo = v; break; } }
	acc = 0;
	for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= highCut) { hi = v; break; } }
	if (hi <= lo) return gray;
	const scale = 255 / (hi - lo);
	const out = new Uint8ClampedArray(gray.length);
	for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - lo) * scale;
	return out;
}

function adaptiveThreshold(gray, w, h, block, C) {
	const iw = w + 1;
	const integral = new Float64Array(iw * (h + 1));
	for (let y = 0; y < h; y++) {
		let rowSum = 0;
		const gBase = y * w, iBase = (y + 1) * iw, iPrev = y * iw;
		for (let x = 0; x < w; x++) {
			rowSum += gray[gBase + x];
			integral[iBase + x + 1] = integral[iPrev + x + 1] + rowSum;
		}
	}
	const out = new Uint8ClampedArray(w * h);
	const r = block >> 1;
	for (let y = 0; y < h; y++) {
		const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
		const rowH = y1 - y0 + 1;
		const iTop = y0 * iw, iBot = (y1 + 1) * iw;
		const gBase = y * w;
		for (let x = 0; x < w; x++) {
			const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
			const count = rowH * (x1 - x0 + 1);
			const sum = integral[iBot + x1 + 1] - integral[iTop + x1 + 1] - integral[iBot + x0] + integral[iTop + x0];
			out[gBase + x] = (gray[gBase + x] > sum / count - C) ? 255 : 0;
		}
	}
	return out;
}

function grayToCanvas(gray, w, h) {
	const canvas = document.createElement('canvas');
	canvas.width = w; canvas.height = h;
	const ctx = canvas.getContext('2d');
	const img = ctx.createImageData(w, h);
	const d = img.data;
	for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
		d[p] = d[p + 1] = d[p + 2] = gray[i];
		d[p + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	return canvas;
}

function invertGray(gray) {
	const out = new Uint8ClampedArray(gray.length);
	for (let i = 0; i < gray.length; i++) out[i] = 255 - gray[i];
	return out;
}

/* ============================================================
 * スキル行検出・切り出し
 * ============================================================ */
function detectSkillRows(baseCanvas, diag) {
	const W = baseCanvas.width, H = baseCanvas.height;
	let imageData;
	try { imageData = getPixels(baseCanvas); }
	catch (err) { diag.push('画素の取得に失敗: ' + err); return null; }

	const green = greenMaskOf(imageData);
	const gRows = rowCountsOf(green, W, H);
	const greenBands = findRuns(gRows, Math.round(W * 0.12), 4, 0, H);
	const thickGreen = greenBands.filter(b => (b.b - b.a) >= H * 0.008);

	// --- 固有スキル帯（青帯の直後に続く緑帯）を基準にリスト範囲を決定 ---
	// 継承タブの有無、継承履歴バーの混入、キャラごとに異なる固有スキル名、
	// 3世代連結スクリーンショット等、画面バリエーションに関わらず、
	// 「スピード/根性等の青帯」→「固有スキル帯（緑）」という並びだけは
	// 継承UIである限り必ず1行分の隙間ですぐ下に続くという構造を利用する。
	const blue = blueMaskOf(imageData);
	const bRows = rowCountsOf(blue, W, H);
	const blueBands = findRuns(bRows, Math.round(W * 0.08), 4, 0, H)
		.filter(b => (b.b - b.a) >= H * 0.008);

	const gapLimit = Math.round(H * 0.02); // 実測16〜24px相当、余裕を見て2%

	// 固有スキル／因子のチップ、「継承」タブpillは左右いずれか1カラムや
	// 部分幅のみを占める帯（実測: 幅カバー率 約32〜50%）。
	// 一方、ステータス表ヘッダーや「継承履歴」区切りバーのような全幅バナーは
	// 幅カバー率が約91〜93%と際立って高く、青帯の直後や緑帯の末尾に来ることがあるため、
	// 位置関係だけを条件にすると誤って固有スキル帯・タブ境界と認識してしまう。
	// 全幅に近い帯は候補から除外し、この誤検出を防ぐ。
	const WIDE_BAND_COVERAGE_RATIO = 0.7;
	function isWideBand(g) {
		const colCounts = colCountsOf(green, W, g.a, g.b);
		let covered = 0;
		for (let x = 0; x < W; x++) { if (colCounts[x] > 0) covered++; }
		return (covered / W) > WIDE_BAND_COVERAGE_RATIO;
	}

	let wideBandExcluded = 0;
	const uniqueSkillBands = [];
	for (const bb of blueBands) {
		const hit = thickGreen.find(g => {
			if (g.a - bb.b < 0 || g.a - bb.b > gapLimit) return false;
			if (isWideBand(g)) { wideBandExcluded++; return false; }
			return true;
		});
		if (hit) uniqueSkillBands.push(hit);
	}
	if (wideBandExcluded > 0) {
		diag.push('全幅帯（ステータス表ヘッダー等）を固有スキル帯候補から除外: ' + wideBandExcluded + '件');
	}

	let listTop = 0, listBottom = H;
	if (uniqueSkillBands.length > 0) {
		const first = uniqueSkillBands[0];
		listTop = Math.min(H - 1, first.b + Math.round(H * 0.004));
		diag.push('固有スキル帯 ' + uniqueSkillBands.length + '件検出 / リスト上端 y=' + listTop);
		if (uniqueSkillBands.length > 1) {
			// 2件目以降は継承元（親・祖先）の固有スキル帯とみなし、
			// その手前でリストを打ち切ることで継承元の行が混入するのを防ぐ。
			listBottom = uniqueSkillBands[1].a - Math.round(H * 0.01);
			diag.push('継承元の固有スキル帯を検出 → リスト下端 y=' + listBottom + ' で打ち切り');
		}
	} else if (thickGreen.length > 0) {
		// フォールバック: 従来ロジック（最後の緑帯をタブ/境界とみなす）。
		// ただし「継承履歴」区切りバーのような全幅バナーがリスト末尾に写り込むと、
		// それが「最後の緑帯」として拾われ、タブpill（横幅カバー率 実測約32%）ではなく
		// 全幅バナー（同 約91%）を境界と誤認してしまう。固有スキル帯判定と同じ
		// 横幅カバー率フィルタで全幅バナーを除外し、残った中の最後の帯を使う。
		const narrowGreen = thickGreen.filter(g => !isWideBand(g));
		const candidates = narrowGreen.length > 0 ? narrowGreen : thickGreen;
		if (narrowGreen.length < thickGreen.length) {
			diag.push('全幅帯（継承履歴バー等）をタブ境界候補から除外: ' + (thickGreen.length - narrowGreen.length) + '件');
		}
		const tab = candidates[candidates.length - 1];
		listTop = Math.min(H - 1, tab.b + Math.round(H * 0.004));
		diag.push('固有スキル帯を検出できず → 従来ロジックにフォールバック');
		diag.push('緑帯 ' + thickGreen.length + '本 / タブ下端 y=' + tab.b + ' → リスト上端 y=' + listTop);
	} else {
		diag.push('緑帯を検出できず → 画像全体をリスト領域として扱う');
	}

	const gray = toGray(imageData);
	const dark = darkMaskOf(gray, DARK_LEVEL);
	const dRows = rowCountsOf(dark, W, H);
	const rowThreshold = Math.max(5, Math.round(W * 0.01));
	const rowMergeGap = Math.max(6, Math.round(H * 0.004));
	let bands = findRuns(dRows, rowThreshold, rowMergeGap, listTop, listBottom);
	diag.push('文字帯の候補 ' + bands.length + '本（しきい値 ' + rowThreshold + 'px / 結合gap ' + rowMergeGap + 'px）');

	if (bands.length < 3) { diag.push('文字帯が少なすぎるため中止'); return null; }

	const heights = bands.map(b => b.b - b.a + 1);
	const medH = median(heights);
	const before = bands.length;
	bands = bands.filter(b => {
		const h = b.b - b.a + 1;
		return h >= Math.max(8, medH * 0.55) && h <= medH * 2.0;
	});
	diag.push('高さフィルタ（中央値 ' + medH + 'px）: ' + before + ' → ' + bands.length + '本');
	if (bands.length < 3) { diag.push('フィルタ後の文字帯が少なすぎるため中止'); return null; }

	// ★アイコン（special.html の因子継承画面などで、スキル名の下に表示される★★★）は
	// 明るい金色だが、輪郭線部分がまれに「暗い文字」として誤検出され、
	// 本来1行のはずのスキル名の下にもう1本、実体のない「文字帯」が紛れ込むことがある。
	// これを放置すると行数が本来の約2倍に膨らみ、テキスト認識にもノイズが混入するため、
	// 「帯の中の金色ピクセル比率が高い」帯を ★アイコンの誤検出とみなして除外する。
	// 実測では、正規の文字帯は金色比率がほぼ0%、★の誤検出帯は4〜8%程度だったため、
	// 余裕を持って1.5%を閾値とする。
	// 注: 当初は「背が低い（medH比85%以下）」帯だけをこの判定対象にしていたが、
	// ★の誤検出帯の数が実文字帯と同程度〜それ以上になる画像では中央値自体が
	// ★帯側に引っ張られてしまい、高さによる事前選別が機能しないケースがあった。
	// 金色比率は実文字帯とほぼ完全に分離できる指標（0% 対 4〜8%）なので、
	// 高さに関わらず全ての帯に対して直接判定する。
	// index.html（★の出ない画面）ではそもそも金色ピクセルがほぼ存在しないため、
	// この処理は実質的に影響しない。
	const beforeStarFilter = bands.length;
	const gold = goldMaskOf(imageData);
	const goldRowCounts = rowCountsOf(gold, W, H);
	bands = bands.filter(b => {
		const h = b.b - b.a + 1;
		let goldCount = 0;
		for (let y = b.a; y <= b.b; y++) goldCount += goldRowCounts[y];
		const totalCount = h * W;
		const goldFrac = totalCount > 0 ? goldCount / totalCount : 0;
		return goldFrac <= 0.015;
	});
	if (bands.length !== beforeStarFilter) {
		diag.push('★アイコンの誤検出帯を除外: ' + beforeStarFilter + ' → ' + bands.length + '本');
	}
	if (bands.length < 3) { diag.push('フィルタ後の文字帯が少なすぎるため中止'); return null; }

	const gapThreshold = Math.max(18, Math.round(W * 0.03));
	const minBlockW = Math.max(10, Math.round(W * 0.02));
	const allBlocks = [];

	bands.forEach((band, bi) => {
		const cCounts = colCountsOf(dark, W, band.a, band.b);
		const runs = findRuns(cCounts, 1, gapThreshold, 0, W);
		runs.forEach(r => {
			if (r.b - r.a + 1 < minBlockW) return;
			allBlocks.push({ band: bi, x0: r.a, x1: r.b, y0: band.a, y1: band.b });
		});
	});

	diag.push('テキストの塊 ' + allBlocks.length + '個');
	if (allBlocks.length < 3) { diag.push('塊が少なすぎるため中止'); return null; }

	const tol = Math.max(12, Math.round(W * 0.02));
	const sorted = allBlocks.slice().sort((a, b) => a.x0 - b.x0);
	const clusters = [];
	let cur = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].x0 - cur[cur.length - 1].x0 <= tol) cur.push(sorted[i]);
		else { clusters.push(cur); cur = [sorted[i]]; }
	}
	clusters.push(cur);

	const columns = clusters.filter(c => c.length >= 3)
		.map(c => ({ x: median(c.map(b => b.x0)), members: c }))
		.sort((a, b) => a.x - b.x);

	if (columns.length === 0) { diag.push('列としてまとまる塊がないため中止'); return null; }
	diag.push('列 ' + columns.length + '本（左端 x=' + columns.map(c => c.x).join(', ') + '）');

	const rows = [];
	let dropped = 0;
	allBlocks.forEach(blk => {
		let hit = null;
		for (let i = 0; i < columns.length; i++) {
			if (Math.abs(blk.x0 - columns[i].x) <= tol * 1.5) { hit = i; break; }
		}
		if (hit === null) { dropped++; return; }
		const pad = 4;
		const x = Math.max(0, blk.x0 - pad);
		const y = Math.max(0, blk.y0 - pad);
		const w = Math.min(W - x, blk.x1 - blk.x0 + 1 + pad * 2);
		const h = Math.min(H - y, blk.y1 - blk.y0 + 1 + pad * 2);
		rows.push({ x: x, y: y, w: w, h: h, col: hit, band: blk.band });
	});

	diag.push('採用 ' + rows.length + '行 / 列外として除外 ' + dropped + '個');
	if (rows.length < 3) { diag.push('採用行が少なすぎるため中止'); return null; }

	rows.sort((a, b) => {
		if (a.band !== b.band) return a.band - b.band;
		return a.col - b.col;
	});

	return {
		rows: rows,
		columns: columns.length,
		listTop: listTop,
		// 以下2つは special.html の星カウント（★の数を数える処理）のために追加した情報。
		// index.html 側は参照しないため、既存動作には影響しない。
		bands: bands.map(b => ({ a: b.a, b: b.b })),
		columnXs: columns.map(c => c.x)
	};
}

function stackRows(baseCanvas, rows) {
	const scales = rows.map(r => Math.max(1, Math.min(4, ROW_TARGET_HEIGHT / r.h)));
	const widths = rows.map((r, i) => Math.round(r.w * scales[i]));
	const heights = rows.map((r, i) => Math.round(r.h * scales[i]));

	const gap = Math.round(ROW_TARGET_HEIGHT * 0.6);
	const padX = 30;
	const outW = Math.max(...widths) + padX * 2;
	let outH = gap;
	heights.forEach(h => { outH += h + gap; });

	const canvas = document.createElement('canvas');
	canvas.width = outW;
	canvas.height = outH;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#FFFFFF';
	ctx.fillRect(0, 0, outW, outH);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';

	let y = gap;
	rows.forEach((r, i) => {
		ctx.drawImage(baseCanvas, r.x, r.y, r.w, r.h, padX, y, widths[i], heights[i]);
		y += heights[i] + gap;
	});
	return canvas;
}

function preprocessVariants(canvas, multi) {
	const variants = [];
	try {
		const imageData = getPixels(canvas);
		const w = canvas.width, h = canvas.height;
		const gray = stretchContrast(toGray(imageData));
		const bin = adaptiveThreshold(gray, w, h, ADAPTIVE_BLOCK, ADAPTIVE_C);
		variants.push(grayToCanvas(bin, w, h));
		if (multi) {
			variants.push(grayToCanvas(invertGray(bin), w, h));
			variants.push(canvas);
		}
	} catch (err) {
		console.error('preprocess failed', err);
		return [canvas];
	}
	return variants.length ? variants : [canvas];
}

function extractLines(data) {
	const lines = [];
	if (data && Array.isArray(data.lines) && data.lines.length) {
		data.lines.forEach(l => {
			if (l.text && l.text.trim()) lines.push({ text: l.text.trim(), conf: l.confidence });
		});
	} else if (data && data.text) {
		data.text.split(/\r?\n/).forEach(t => {
			if (t.trim()) lines.push({ text: t.trim(), conf: null });
		});
	}
	return lines;
}

/* ============================================================
 * 判定ロジック
 * ============================================================ */
function windowDistance(line, skill) {
	return levenshtein(line, skill);
}

/**
 * 1つのOCR行（正規化済み文字列）に対し、skillIndexの中から最良候補を選ぶ。
 * skillIndex: [{ raw: '元のスキル名', norm: '正規化済み文字列' }, ...]
 *
 * 同着タイ（複数のスキルが同じ距離・同じ長さで並ぶ）の場合はここでは決めず、
 * 並んだ候補を tied に入れて ok:false で返す。どう decide するかは呼び出し側
 * （matchAllSkills）が、行の位置情報など文字列以外の手がかりを使って判断する。
 *
 * 戻り値:
 *   null … 候補となるスキルが一つもない（skillIndexが空 等）
 *   { raw, dist, limit, ok: true }  … 確定採用できる候補が見つかった
 *   { raw, dist, limit, ok: false, reason, tied? } … 候補はあるが確定できない（しきい値超過 or 同点タイ）
 */
function bestCandidate(normLine, skillIndex) {
	const passing = [];
	let fallback = null;
	for (let i = 0; i < skillIndex.length; i++) {
		const raw = skillIndex[i].raw, norm = skillIndex[i].norm;
		if (!norm) continue;
		const d = windowDistance(normLine, norm);
		const limit = allowedDistance(norm.length);
		if (!fallback || d < fallback.dist) fallback = { raw: raw, dist: d, limit: limit };
		if (d <= limit) passing.push({ raw: raw, norm: norm, dist: d, limit: limit });
	}
	if (passing.length === 0) {
		if (!fallback) return null;
		return { raw: fallback.raw, dist: fallback.dist, limit: fallback.limit, ok: false, reason: '距離' + fallback.dist + ' > 許容' + fallback.limit };
	}
	passing.sort((a, b) => (a.dist - b.dist) || (b.norm.length - a.norm.length));
	const top = passing[0];
	const tied = passing.filter(p => p.dist === top.dist && p.norm.length === top.norm.length);
	if (tied.length > 1) {
		return { raw: top.raw, dist: top.dist, limit: top.limit, ok: false, reason: '曖昧', tied: tied.map(t => t.raw) };
	}
	return { raw: top.raw, dist: top.dist, limit: top.limit, ok: true };
}

/**
 * 2つのOCR行が「元画像の別々の行（別の項目）から来た」と断定できるかを判定する。
 *
 * rowKey は "画像番号:行番号" の形式で、同じ画像・同じ行から読まれた行（前処理違いの
 * 読み取り結果など）は同じ値になる。断定できないときは false を返す（＝安全側）。
 */
function isDifferentRow(a, b) {
	if (!a || !b || !a.rowKey || !b.rowKey) return false; // 位置情報がなければ断定しない
	if (a.rowKey === b.rowKey) return false;              // 同じ行の別の読み取り結果
	const imgA = String(a.rowKey).split(':')[0];
	const imgB = String(b.rowKey).split(':')[0];
	if (imgA === imgB) return true;                       // 同じ画像内の別の行 → 確実に別の項目
	// 別々の画像の場合、スクロールしながら撮ったスクショは重なっているため、
	// 同じ項目が両方に写っている可能性がある＝別物と断定できない。
	// ただし★の数が両方わかっていて食い違うなら、別の項目だと言える。
	// このとき、信用できない計測（画像最下段の行や、ありえない0個）は根拠に使わない。
	if (trustworthyStars(a) && trustworthyStars(b) && a.stars !== b.stars) return true;
	return false;
}

function trustworthyStars(line) {
	if (!line || line.stars === null || line.stars === undefined) return false;
	if (line.stars === 0) return false;           // ★0はありえない＝計測に失敗している
	return line.starsReliable !== false;
}

/**
 * 同着タイになった候補を、文字列以外の手がかりで1つに絞り込む（絞れなければ null）。
 *
 * 考え方：タイに含まれるスキルのうち「既に別の行で見つかっていると断定できる」ものは、
 * この行の正体ではありえないので候補から外す。残りが1つならそれを採用する。
 * 逆に、既に見つかっていても『この行自体の別の読み取り結果かもしれない』場合
 * （＝同じ行、または重なった別画像で★の数も一致する）は外さない。
 * これを外してしまうと、同じ項目を読み直しただけの行が、
 * 字面の近い別スキルとして過剰に検出されてしまう。
 *
 * diagEntries（配列）を渡すと、判定の途中経過を1件のオブジェクトとして追記する。
 * 「なぜ解決できた／できなかったか」を開発ログで確認できるようにするための引数で、
 * 判定結果そのものには一切影響しない（省略しても従来通り動作する）。
 *   { text, norm, rowKey, tied, source: 'resolveTiedCandidates',
 *     candidates: [{ raw, alreadyDetected, provablyOther, checks: [{ otherRowKey, thisRowKey, result }] }],
 *     survivors, resolved }
 */
function resolveTiedCandidates(tiedRaws, line, detectedSkills, skillSources, lines, diagEntries, norm) {
	const candidateDiags = [];
	const survivors = tiedRaws.filter(raw => {
		if (!detectedSkills.has(raw)) {
			candidateDiags.push({ raw: raw, alreadyDetected: false, provablyOther: false, checks: [] });
			return true;
		}
		const sources = skillSources[raw] || [];
		const checks = sources.map(i => {
			const other = lines[i];
			return {
				otherRowKey: other ? (other.rowKey || null) : null,
				thisRowKey: line ? (line.rowKey || null) : null,
				result: isDifferentRow(other, line)
			};
		});
		const provablyOther = checks.some(c => c.result);
		candidateDiags.push({ raw: raw, alreadyDetected: true, provablyOther: provablyOther, checks: checks });
		return !provablyOther;
	});
	const resolved = survivors.length === 1 ? survivors[0] : null;
	if (diagEntries) {
		diagEntries.push({
			text: line ? line.text : null,
			norm: norm || null,
			rowKey: line ? (line.rowKey || null) : null,
			tied: tiedRaws.slice(),
			source: 'resolveTiedCandidates',
			candidates: candidateDiags,
			survivors: survivors.slice(),
			resolved: resolved
		});
	}
	return resolved;
}

/**
 * OCRで得られた全行(lines)を、スキルリスト(skillIndex)と照合する。
 * グローバル変数には一切触れず、結果をまとめたオブジェクトを返す（純粋関数）。
 *
 * 引数:
 *   lines               … [{ text, conf }, ...]  extractLines() の出力を集約したもの
 *   skillList           … ['スキル名1', 'スキル名2', ...]  元の表記のリスト
 *   skillIndex          … [{ raw, norm }, ...]  skillList を正規化して付与したもの
 *   ocrErrorDictionary  … { '誤認識文字列': '正しいスキル名', ... }（空オブジェクトでも可）
 *
 * 戻り値:
 *   {
 *     detectedSkills: Set<string>,   // 検出済みスキル名（raw表記）の集合
 *     matchReasons:   { [rawSkillName]: string },  // 判定根拠の説明文
 *     skillSources:   { [rawSkillName]: [行index, ...] },  // 検出根拠になった行
 *     devTypo:    [...], devLowConf: [...], devOther: [...], devFuzzy: [...]  // デバッグ用の内訳
 *   }
 */
function matchAllSkills(lines, skillList, skillIndex, ocrErrorDictionary) {
	const detectedSkills = new Set();
	const matchReasons = {};
	// スキル名 → そのスキルを検出した根拠となった行のindex配列。
	// 「そのスキルの★はどの行のものか」を後から正確に引くために必ず記録する。
	const skillSources = {};
	const devTypo = [], devLowConf = [], devOther = [], devFuzzy = [];
	// 曖昧タイ（同着候補）の絞り込み過程を記録する。resolveTiedCandidates() 参照。
	const devAmbiguous = [];

	const normDictionary = {};
	Object.keys(ocrErrorDictionary || {}).forEach(k => {
		normDictionary[normalizeText(k)] = ocrErrorDictionary[k];
	});

	function addDetection(skill, lineIndex, reason) {
		if (!detectedSkills.has(skill)) matchReasons[skill] = reason;
		detectedSkills.add(skill);
		if (!skillSources[skill]) skillSources[skill] = [];
		skillSources[skill].push(lineIndex);
	}

	const seen = new Set();
	// 辞書・完全一致で確定できなかった行は、いったんここに貯めておく。
	// 曖昧タイの絞り込みが行の並び順に関係なく全行の確定結果を使えるようにするため、
	// あいまい判定は全行の辞書・完全一致が出揃った後に第2パスとしてまとめて行う。
	const pendingFuzzy = [];
	// rowKey → その行の正体が完全一致・辞書で確定済みかどうか
	const rowAssigned = {};

	lines.forEach((line, index) => {
		const norm = normalizeText(line.text);
		if (!norm || norm.length < 2) return;
		// 同じ文字列でも「元画像の別の行」から来たものは別々に扱う（★の計測値が異なるため）。
		// rowKey を持たない場合（index.html 側）は、これまで通り文字列だけで重複排除する。
		const seenKey = norm + ' ' + (line.rowKey || '');
		if (seen.has(seenKey)) return;
		seen.add(seenKey);

		if (normDictionary[norm]) {
			const target = normDictionary[norm];
			if (skillList.indexOf(target) !== -1) {
				addDetection(target, index, '辞書');
				if (line.rowKey) rowAssigned[line.rowKey] = true;
			}
			return;
		}

		// 部分一致（indexOf）で候補を集める。
		// 例えば「根幹距離○」と「非根幹距離○」のように、片方がもう片方の部分文字列に
		// なっているスキル名が同じスキルリストに存在すると、OCR行「非根幹距離○」に対して
		// 「根幹距離○」も誤って一致してしまう。これを避けるため、一致した候補同士を比較し、
		// 他の候補の正規化文字列に完全に含まれてしまう（＝より具体的な候補が別にある）ものは
		// 誤検出とみなして除外し、最も具体的な（長い）候補だけを採用する。
		const exactCandidates = [];
		for (let i = 0; i < skillIndex.length; i++) {
			const s = skillIndex[i];
			if (s.norm && norm.indexOf(s.norm) !== -1) exactCandidates.push(s);
		}
		if (exactCandidates.length > 0) {
			const exactHits = exactCandidates.filter(cand =>
				!exactCandidates.some(other => other !== cand && other.norm !== cand.norm && other.norm.indexOf(cand.norm) !== -1)
			);
			exactHits.forEach(s => addDetection(s.raw, index, '完全一致'));
			if (line.rowKey && exactHits.length > 0) rowAssigned[line.rowKey] = true;
			return;
		}

		if (line.conf !== null && line.conf !== undefined && line.conf < CONF_THRESHOLD) {
			devLowConf.push({ text: line.text, norm: norm, conf: line.conf });
			return;
		}

		pendingFuzzy.push({ line: line, norm: norm, index: index });
	});

	// 第2パス：あいまい一致（distance判定・曖昧タイの絞り込み）。
	// この時点で detectedSkills には全行の辞書・完全一致の結果が反映済み。
	const resolvedByText = {}; // 正規化文字列 → 曖昧タイから絞り込めたスキル名
	pendingFuzzy.forEach(({ line, norm, index }) => {
		// 元画像の同じ行が既に完全一致で確定している場合、この行はその行の
		// 「別の読み取り結果（誤読版）」にすぎない。別のスキルとして数えると
		// 字面の近い無関係なスキルを過剰検出してしまうため、ここで捨てる。
		if (line.rowKey && rowAssigned[line.rowKey]) return;

		let cand = bestCandidate(norm, skillIndex);
		if (cand && !cand.ok && cand.tied && cand.tied.length > 1) {
			// 同じ誤読文字列は同じスキルを指すはずなので、一度絞り込めた結果を使い回す。
			// （重なったスクショで同じ項目が何度も同じように誤読されるため）
			let picked = (resolvedByText[norm] && cand.tied.indexOf(resolvedByText[norm]) !== -1) ? resolvedByText[norm] : null;
			if (picked) {
				devAmbiguous.push({
					text: line.text, norm: norm, rowKey: line.rowKey || null,
					tied: cand.tied.slice(), source: 'キャッシュ再利用', candidates: [], survivors: [picked], resolved: picked
				});
			} else {
				picked = resolveTiedCandidates(cand.tied, line, detectedSkills, skillSources, lines, devAmbiguous, norm);
			}
			if (picked) {
				resolvedByText[norm] = picked;
				cand = { raw: picked, dist: cand.dist, limit: cand.limit, ok: true, reason: '曖昧→絞り込み' };
			}
		}

		if (cand && cand.ok) {
			addDetection(cand.raw, index, '推定（距離' + cand.dist + (cand.reason ? ' / ' + cand.reason : '') + '）');
			if (cand.dist > 0) {
				devFuzzy.push({ text: line.text, norm: norm, conf: line.conf, matched: cand.raw, dist: cand.dist });
			}
			return;
		}

		const entry = {
			text: line.text, norm: norm, conf: line.conf,
			best: cand ? cand.raw : null,
			dist: cand ? cand.dist : null,
			reason: cand ? cand.reason : '候補なし'
		};
		if (cand && cand.dist !== null && cand.dist <= cand.limit + 2) devTypo.push(entry);
		else devOther.push(entry);
	});

	return { detectedSkills, matchReasons, skillSources, devTypo, devLowConf, devOther, devFuzzy, devAmbiguous };
}

/* ============================================================
 * 星（★）検出 — special.html（因子継承の特化型ツール）専用
 *
 * ゲーム画面では、各スキル行の直下に「★★★」（0〜3個、達成分だけ金色）が
 * 表示される。星は明るい色（金色 or 背景とほぼ同化したグレー）のため、
 * 文字検出用の darkMaskOf には一切引っかからない。
 * そのため「金色ピクセルの検出」専用のマスクと、行と行の間（隙間）を
 * 星の探索エリアとして扱うロジックをここに追加する。
 *
 * これらの関数は index.html からは一切参照されない（追加のみ・既存動作に影響なし）。
 * ============================================================ */

function goldMaskOf(imageData) {
	const d = imageData.data;
	const n = imageData.width * imageData.height;
	const mask = new Uint8Array(n);
	for (let i = 0, p = 0; i < n; i++, p += 4) {
		const r = d[p], g = d[p + 1], b = d[p + 2];
		// 実機スクリーンショットで実測した金色★の色（おおよそ R255 G207-240 B37-125）に基づく判定。
		// 未達成の★（グレー、背景とほぼ同色）や他のUI装飾色（青・ピンク・緑のタブ等）は
		// R-B の差が小さいためここでは弾かれる。
		if (r > 200 && g > 140 && (r - b) > 60) mask[i] = 1;
	}
	return mask;
}

/**
 * 星の探索エリア（x0..x1, y0..y1）内にある「金色の塊」の個数を数える。
 * 星3つは横に並んで配置されており、間に隙間があるため、
 * 列方向（x軸）に金色ピクセルが存在するかどうかの真偽配列を作り、
 * 連続する true の区間（=1つの星）の数を数える。
 * アンチエイリアスによる小さな穴は mergeGap で埋めて1つの星として扱う。
 * 星は最大3個までなので、念のため3で頭打ちにする。
 */
function countGoldBlobs(mask, W, x0, x1, y0, y1) {
	x0 = Math.max(0, x0); x1 = Math.min(W, x1);
	if (x1 <= x0 || y1 <= y0) return 0;
	const colHas = new Uint8Array(x1 - x0);
	for (let y = y0; y < y1; y++) {
		const base = y * W;
		for (let x = x0; x < x1; x++) {
			if (mask[base + x]) colHas[x - x0] = 1;
		}
	}
	// 星と星の実際の間隔は実測で2px程度（≒falseが2列連続）であるのに対し、
	// 星1個の中のアンチエイリアシングによる穴は1px程度で収まることを実データで確認済み。
	// そのため、ここでは「falseが1列だけなら同じ星の続き」とみなし、2列以上は別の星として扱う。
	const mergeGap = 1;
	let count = 0;
	let inRun = false;
	let gapSinceRun = 0;
	for (let i = 0; i < colHas.length; i++) {
		if (colHas[i]) {
			if (!inRun) {
				// 直前の区間からの隙間が小さければ同じ星の続きとみなす
				if (gapSinceRun > 0 && gapSinceRun <= mergeGap && count > 0) {
					// 継続扱い（新しい星としてカウントしない）
				} else {
					count++;
				}
				inRun = true;
			}
			gapSinceRun = 0;
		} else {
			if (inRun) { inRun = false; gapSinceRun = 1; }
			else if (gapSinceRun > 0) gapSinceRun++;
		}
	}
	return Math.min(3, count);
}

/**
 * detectSkillRows() の結果（rows / bands / columnXs）をもとに、
 * 各行の直下（次の文字帯が始まる直前まで）を星の探索エリアとして、
 * 行ごとの★の数（0〜3）を計算する。
 *
 * 戻り値: rows と同じ順序・同じ長さの配列。要素は { stars: number, reliable: boolean }
 *
 * reliable=false は「★の領域を正しく囲えていない可能性がある計測」を意味する。
 * 画像の一番下の行は次の文字帯が存在しないため探索範囲の下端を決められず、
 * ★が画面外で切れていれば少なく、次の項目まで拾えば多く数えてしまう。
 * スクショは重ねて撮られており同じ項目が別画像にも写っているので、
 * 呼び出し側は reliable な計測を優先して採用する。
 */
function computeRowStarCounts(baseCanvas, detection) {
	const W = baseCanvas.width, H = baseCanvas.height;
	const imageData = getPixels(baseCanvas);
	const gold = goldMaskOf(imageData);
	const bands = detection.bands || [];
	const columnXs = detection.columnXs || [];

	// 文字帯どうしの隙間（＝★が描かれる帯）の標準的な高さを実測から求める。
	const gaps = [];
	for (let i = 0; i + 1 < bands.length; i++) gaps.push(bands[i + 1].a - bands[i].b);
	const medGap = gaps.length ? median(gaps) : 0;

	return detection.rows.map(row => {
		const band = bands[row.band];
		if (!band) return { stars: 0, reliable: false };
		const nextBand = bands[row.band + 1];
		const rowH = band.b - band.a + 1;
		const y0 = band.b + 1;
		let y1, reliable;
		if (nextBand) {
			y1 = nextBand.a - 1;
			reliable = true;
		} else {
			// 次の文字帯がない＝画像の最下段。標準的な隙間の高さで代用する
			// （従来は行高の4倍まで見ていたため、次の項目の★まで数えてしまうことがあった）。
			y1 = band.b + (medGap > 0 ? medGap : Math.round(rowH * 2));
			// 画像の高さには収まっていても、リスト表示枠の下端で★が切れていることがある
			// （実測でも最下段は★が1つも写らず0個と数えられた）。枠の下端は判別できないため、
			// 最下段は一律「不確か」とし、重ねて撮られた別スクショの計測を優先させる。
			reliable = false;
			if (y1 > H) y1 = H;
		}
		if (y1 <= y0) return { stars: 0, reliable: false };

		const colX = columnXs[row.col];
		const nextColX = columnXs[row.col + 1];
		const marginRight = Math.round(W * 0.03);
		const x0 = (colX !== undefined) ? colX : row.x;
		const x1 = (nextColX !== undefined) ? (nextColX - marginRight) : W;

		const stars = countGoldBlobs(gold, W, x0, x1, y0, y1);
		return { stars: stars, reliable: reliable };
	});
}

/**
 * stackRows() と同様に複数行を1枚の画像へ縦に積み重ねるが、
 * 積み重ね後の画像内で「どの行が縦方向のどの範囲(y0〜y1)にあるか」を
 * あわせて返す。OCR結果（行ごとのbbox）を、元のどの行（＝どの★カウント）に
 * 対応するかを後から突き合わせるために必要な情報。
 */
function stackRowsWithMeta(baseCanvas, rows) {
	const scales = rows.map(r => Math.max(1, Math.min(4, ROW_TARGET_HEIGHT / r.h)));
	const widths = rows.map((r, i) => Math.round(r.w * scales[i]));
	const heights = rows.map((r, i) => Math.round(r.h * scales[i]));

	const gap = Math.round(ROW_TARGET_HEIGHT * 0.6);
	const padX = 30;
	const outW = Math.max(...widths) + padX * 2;
	let outH = gap;
	heights.forEach(h => { outH += h + gap; });

	const canvas = document.createElement('canvas');
	canvas.width = outW;
	canvas.height = outH;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#FFFFFF';
	ctx.fillRect(0, 0, outW, outH);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';

	const placements = [];
	let y = gap;
	rows.forEach((r, i) => {
		ctx.drawImage(baseCanvas, r.x, r.y, r.w, r.h, padX, y, widths[i], heights[i]);
		placements.push({ rowIndex: i, y0: y, y1: y + heights[i] });
		y += heights[i] + gap;
	});
	return { canvas: canvas, placements: placements };
}

/**
 * Tesseract.js の recognize() 結果から、行テキストと行のbbox（縦方向の位置）を抽出する。
 * bboxが取得できない行は y0=y1=null とし、星カウントとの突き合わせができないものとして扱う。
 */
function extractLinesWithBBox(data) {
	const lines = [];
	if (data && Array.isArray(data.lines) && data.lines.length) {
		data.lines.forEach(l => {
			if (l.text && l.text.trim()) {
				const bbox = l.bbox || null;
				lines.push({
					text: l.text.trim(),
					conf: l.confidence,
					y0: bbox ? bbox.y0 : null,
					y1: bbox ? bbox.y1 : null
				});
			}
		});
	}
	return lines;
}

/**
 * stackRowsWithMeta() で作った合成画像をOCRした結果（extractLinesWithBBoxの出力）を、
 * 各行の placements（=どの元行がどのy範囲に配置されたか）と突き合わせ、
 * 「そのOCR行が何個の★を持つ行だったか」を求める。
 * bboxの中心yに最も近い placement を採用する（多少のズレに対してロバストにするため）。
 *
 * imageKey: 画像ごとに一意な文字列（":" を含めないこと）。
 *   これと行番号から rowKey（"画像:行"）を作り、「どのOCR行が元画像のどの行から
 *   来たか」を判定ロジック側でも使えるようにする。前処理を変えて同じ画像を
 *   読み直した結果は同じ rowKey になる。
 *
 * 戻り値: lines と同じ順序・同じ長さの配列。
 *   要素は { ...元のline, stars: number|null, starsReliable: boolean, rowKey: string|null }
 */
function attachStarsToLines(lines, placements, rowStarCounts, imageKey) {
	return lines.map(line => {
		if (line.y0 === null || line.y1 === null || !placements.length) {
			return Object.assign({}, line, { stars: null, starsReliable: false, rowKey: null });
		}
		const centerY = (line.y0 + line.y1) / 2;
		let best = null, bestDist = Infinity;
		placements.forEach(p => {
			const pCenter = (p.y0 + p.y1) / 2;
			const dist = Math.abs(centerY - pCenter);
			if (dist < bestDist) { bestDist = dist; best = p; }
		});
		const info = (best && rowStarCounts[best.rowIndex]) ? rowStarCounts[best.rowIndex] : null;
		return Object.assign({}, line, {
			stars: info ? info.stars : null,
			starsReliable: info ? (info.reliable !== false) : false,
			rowKey: best ? (String(imageKey === undefined ? '' : imageKey) + ':' + best.rowIndex) : null
		});
	});
}

/**
 * あるスキルを検出した根拠の行（複数ありうる）から、★の数を1つに決める。
 *
 * 同じ項目はスクショの重なりや前処理違いで何度も読まれるため、計測値も複数得られる。
 * 探索範囲を正しく囲えた計測（reliable）を優先し、その中の最頻値を採用する。
 * 同数で並んだ場合は、次の項目の★まで数えてしまう方向の誤りを避けるため小さい方を採る。
 */
function pickStarsFromSources(sourceIndexes, lines) {
	const obs = [];
	(sourceIndexes || []).forEach(i => {
		const l = lines[i];
		if (!l || l.stars === null || l.stars === undefined) return;
		// ★0 はゲーム上ありえない（★が0個の因子はスキル名自体が表示されない）。
		// 0と出た計測は、★が画面外で切れている等の失敗なので採用しない。
		if (l.stars === 0) return;
		obs.push(l);
	});
	if (obs.length === 0) return null;
	const reliable = obs.filter(o => o.starsReliable !== false);
	const pool = reliable.length > 0 ? reliable : obs;

	const counts = {};
	pool.forEach(o => { counts[o.stars] = (counts[o.stars] || 0) + 1; });
	let bestValue = null, bestCount = -1;
	Object.keys(counts).map(Number).sort((a, b) => a - b).forEach(v => {
		if (counts[v] > bestCount) { bestCount = counts[v]; bestValue = v; }
	});
	return bestValue;
}

/**
 * matchAllSkills() の★対応版。ロジックの大枠（正規化・辞書・完全一致・あいまい一致）は
 * matchAllSkills と同一だが、マッチしたスキルに対して「そのOCR行に紐づく★の数」も記録する。
 *
 * 引数の lines は attachStarsToLines() の出力（各要素が { text, conf, stars } を持つ）。
 *
 * 戻り値: matchAllSkills の戻り値に加えて、
 *   skillStars: { [rawSkillName]: number|null }  … 検出できたスキルの★の数
 */
function matchAllSkillsWithStars(lines, skillList, skillIndex, ocrErrorDictionary) {
	const base = matchAllSkills(lines, skillList, skillIndex, ocrErrorDictionary);
	const skillStars = {};

	// ★は「そのスキルを検出した根拠の行」から取る。
	// 以前はここで行を距離計算により探し直していたが、それでは
	// 例えば「中距離コーナー○」の★を、字面が1文字違いの
	//「短距離コーナー○」の行から取ってしまうことがあった。
	// 判定時に記録済みの skillSources を使えば、その取り違えは起こらない。
	base.detectedSkills.forEach(skillName => {
		skillStars[skillName] = pickStarsFromSources(base.skillSources[skillName], lines);
	});

	return Object.assign({}, base, { skillStars: skillStars });
}


/* ============================================================
 * 照合対象スキル辞書の注入（ツール非依存の汎用インターフェース）
 *
 * 従来、照合対象のスキルは各ツールが画面のテキストエリアから作って
 * matchAllSkills() に毎回渡していた。ここではそれに加えて、
 * 「外部（別ツール・外部JSON）で用意したスキル名リストを辞書として注入する」
 * 経路を用意する。
 *
 * 重要:
 * - このAPIは特定のツール・特定のデータソース専用にしない。受け取るのは
 *   あくまで「スキル名の配列」で、それがどこから来たか（UmaSkill Deckの
 *   テンプレート／技能試験の固定リスト／手入力）をこのファイルは知らない。
 * - スキル名そのものはこのファイルに一切書かない（B節ルール1）。
 * ============================================================ */

/**
 * 任意のスキルマスターJSONを取得する（汎用）。
 *
 * URLも中身もこのファイルに決め打ちしない。呼び出し元がURLを渡す。
 * 期待するのは `{ masterVersion, skills: [{ id, name, ... }] }` 形式だが、
 * 検証はせずそのまま返す（スキーマの解釈は呼び出し元の責任）。
 *
 * options.cacheBust … true なら ?t=<現在時刻> を付けてキャッシュを回避する
 */
async function fetchSkillMasterJson(url, options) {
	const opts = options || {};
	const finalUrl = opts.cacheBust ? (url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now()) : url;
	const res = await fetch(finalUrl);
	if (!res.ok) throw new Error('HTTP ' + res.status);
	return await res.json();
}

/**
 * スキル名の配列から、照合に使う辞書 { list, index } を作る。
 *
 * list  … matchAllSkills() の skillList 引数に渡すもの（元の表記のまま）
 * index … 同じく skillIndex 引数に渡すもの（[{ raw, norm }]）
 *
 * 正規化後に同じ文字列になるスキル名は、あいまい一致で不必要な「同着タイ」を
 * 生むだけなので、最初の1件だけを残して取り除く。
 */
function buildSkillDictionary(skillNames) {
	const list = [];
	const index = [];
	const seenNorm = new Set();
	(skillNames || []).forEach(name => {
		const raw = String(name == null ? '' : name).trim();
		if (!raw) return;
		const norm = normalizeText(raw);
		if (!norm || seenNorm.has(norm)) return;
		seenNorm.add(norm);
		list.push(raw);
		index.push({ raw: raw, norm: norm });
	});
	return { list: list, index: index };
}

// 現在注入されている照合対象辞書。null なら「注入されていない」。
// 呼び出し元が明示的に渡してくる場合はそちらが常に優先されるため、
// この変数がツールの既定動作を書き換えてしまうことはない。
let activeSkillDictionary = null;

function setActiveSkillDictionary(dictionary) {
	activeSkillDictionary = dictionary || null;
	return activeSkillDictionary;
}

function getActiveSkillDictionary() {
	return activeSkillDictionary;
}

function clearActiveSkillDictionary() {
	activeSkillDictionary = null;
}

/**
 * 注入された（あるいは引数で渡された）辞書を使って★付き照合を行う入口。
 *
 * matchAllSkillsWithStars() の薄いラッパーで、照合ロジック自体は一切変えない。
 * dictionary を省略すると setActiveSkillDictionary() で注入済みの辞書を使う。
 */
function matchAllSkillsWithStarsUsingDictionary(lines, ocrErrorDictionary, dictionary) {
	const dict = dictionary || activeSkillDictionary;
	if (!dict) throw new Error('照合対象のスキル辞書が設定されていません');
	return matchAllSkillsWithStars(lines, dict.list, dict.index, ocrErrorDictionary);
}
