# Uma Tools デザイン基準の抽出（Phase 1）

対象：`special.html`（UmaStar OCR）／`uma-skill-deck.html`（UmaSkill Deck）
作成日：2026-09-10
本書は**抽出結果のみ**であり、実装は含まない。Phase 2 の設計はこの表を根拠にする。

---

## 0. 抽出方法（推測を含めないための手順）

| 手順 | 内容 |
|---|---|
| A | `<style>` ブロックをパースし、プロパティ別に値を集計 |
| B | `class` 属性のトークンを全抽出（HTML 2ファイル＋`uma-skill-deck-core.js`＋`uma-skill-deck.js` のテンプレート文字列も対象）、意味カテゴリ別に頻度集計 |
| C | Playwright + 実 CDN（Tailwind v4.1.11）で **7つの画面状態**を実際に描画し、全要素の `getComputedStyle` を採取。親要素の値と比較して「その要素が実際に指定した値」だけを計上 |
| D | Tailwind パレット156色をブラウザ上で実描画し、`computed値 → トークン名 → hex` の逆引き表を実測作成。直書き色との一致を機械照合 |
| E | 状態表現（hover / focus / active / disabled）を `document.styleSheets` から列挙 |

採取した画面状態：`special:default` / `special:results` / `deck:template-list` / `deck:template-editor` / `deck:skill-picker` / `deck:record-editor` / `deck:data`
（Deck は初期状態が空なので、テンプレート2件・比較シート1件・候補3人・★入力済みの代表データを流し込んで採取した）

### 前提として判明した構造

**CSS の所在は4箇所ある。**「HTMLの `<style>` を見れば分かる」構造になっていない。

| # | 場所 | 規模 | クラス接頭辞 |
|---|---|---|---|
| 1 | `special.html` の `<style>` | 28ルール | `.glass-card` `.result-table` `.deck-drawer-*` 等 |
| 2 | `uma-skill-deck.html` の `<style>` | 30ルール | `.tab-btn` `.list-card` `.deck-table` `.sum-badge` 等 |
| 3 | `js/uma-skill-deck-core.js` が `<head>` へ注入 | 約40ルール | `usd-` |
| 4 | `js/uma-skill-deck.js` が `<head>` へ注入 | 約12ルール | `ocr-` |

さらに、**デザイン語彙の大半は `<style>` ではなく Tailwind ユーティリティ**である（`class` 出現数：special.html 264／uma-skill-deck.html 55／core.js 105／deck.js 52）。
`css/common.css` を追加するだけでは何も変わらず、既存ユーティリティとの詳細度設計が Phase 2 の本体になる。

---

## 1. 全体所見（先に結論）

### 所見1：直書き色75件のうち48件が、隣に置かれた Tailwind v4 のパレットと一致しない

Tailwind v4 はパレットを `oklch` で再定義しており、**v3時代の hex 値とは微妙に違う**。
コード中の直書き hex は v3 世代の値のまま残っており、同じ役割の色が2種類並存している。

| 直書き値 | 隣で使われている v4 トークン | 差 | 役割 |
|---|---|---|---|
| `#4f46e5`（`.ocr-btn-primary`、`.deck-drawer-trigger`） | `indigo-600` = `#4f39f6`（`bg-indigo-600`） | 21 | **主ボタンの地色** |
| `#4338ca`（`.tab-active` `.sum-badge` `.usd-chip`） | `indigo-700` = `#432dd7` | 17 | 選択中の文字色 |
| `#15803d`（`:focus-visible` の輪郭、`.usd-paste-ok`） | `green-700` = `#008236` | 22 | 成功・フォーカス |
| `#16a34a`（`.drop-active`） | `green-600` = `#00a63e` | 25 | 操作中の強調 |
| `#64748b`（`.tab-btn` `.icon-btn` `.usd-*` 多数） | `slate-500` = `#62748e` | 4 | **補助文字** |
| `#334155` / `#475569` / `#94a3b8` / `#cbd5e1` | `slate-700` / `600` / `400` / `300` | 1〜5 | 文字・罫線 |
| `#b91c1c` `#92400e` `#b45309` `#fcd34d` | `red-800` `amber-800` `amber-700` `amber-300` | 13〜35 | 警告・エラー |

同一値で一致しているものも27件ある（`#e2e8f0`=slate-200、`#f1f5f9`=slate-100、`#eef2ff`=indigo-50 など、v3/v4 で変わらなかった色）。
つまり**「一部だけ揃っていて一部だけズレている」**状態であり、目視では発見できない。これが本作業で最初に潰すべき対象。

→ **判定：事故**。ただし後述の「独自の地色」（`#f4faf0` `#f5f6fb` 等）は意図的なので除く。

### 所見2：状態表現の量が両者で桁違い

| | 状態セレクタ数 | 操作要素数 | 内訳 |
|---|---|---|---|
| special | **40** | 28 | hover 25／focus 7／active 2／disabled 3／`:focus-visible` 1／表の行hover 1 |
| deck | **3** | 48 | hover 3 のみ（`.icon-btn` `.usd-icon-btn` `.usd-paste-cand`） |

Deck には **focus・focus-visible・active・disabled の定義が1つも無い**。操作要素は special より多い（48 対 28）。
special が持っている `:focus-visible { outline: 2px solid #15803d }` に相当するものも無く、ブラウザ既定に委ねている。

→ **判定：special 側が基準候補、deck 側は欠落**。共通化の効果が最も大きい層。

### 所見3：Deck は基本文字色を一度も指定していない

`uma-skill-deck.html` の `<body>` はクラスが `min-h-screen` のみで、文字色の指定が無い。
実測すると、Deck 全体の既定文字色は**ブラウザ既定の黒 `#000000`**であり、`text-slate-*` を明示した要素だけが灰系になる。
その結果：

- 二次ボタン（`＋ 候補` `表示する` `コピー` 等7個）の文字色が**黒**（special の同等ボタンは `slate-600`/`700`）
- 入力欄（`.usd-input`、`#record-name-input` 等）の文字色も**黒**
- `<select>` 3個は**スタイル指定が一切なく、ブラウザ素のまま**（`#record-new-template-select` は font-size 16px、角丸0、罫線なし）。隣に角丸12pxのインディゴ主ボタンが並ぶ

special は `<body class="... text-slate-800 ...">` で基準色を敷いている。

→ **判定：special 側が基準候補、deck 側は事故**。

---

## 2. 色

### 2-1. 文字色

実測（親からの継承分は除外。数値は要素数）

| special | | deck | |
|---|---|---|---|
| `white` | 22 | `slate-500` #62748e | 21 |
| `slate-500` #62748e | 21 | `#4338ca`（直書き） | 17 |
| `slate-700` #314158 | 15 | `#64748b`（直書き） | 10 |
| `slate-600` #45556c | 14 | `white` | 10 |
| `slate-400` #90a1b9 | 7 | `slate-700` #314158 | 6 |
| `slate-800` #1d293d | 6 | `slate-800` #1d293d | 4 |
| `amber-800` / `blue-800` / `red-800` | 各5 | `slate-400` #90a1b9 | 3 |
| `green-800` `slate-300` | 各4 | `slate-600` #45556c | 3 |
| （他 21種） | | `#334155` `#cbd5e1` `#3730a3` `#6366f1` `#475569`（直書き） | 各1〜2 |
| **計 30種** | | **計 14種** | |

| 区分 | 内容 | 理由 |
|---|---|---|
| **基準候補** | 本文 `slate-800`／補助 `slate-500`／さらに弱い注記 `slate-400`／見出し `slate-700` の4段 | 両ツールで同じ役割に同じトークンが使われており、意図をもって選ばれている |
| **要判断** | `slate-600` と `slate-700` の使い分け | 「見出し」と「ボタン文字」で混在。どちらかに寄せるべき |
| **要判断** | special の `green-900` / `green-800` / `green-700`（3段の緑文字） | ヘッダー内の階層表現。緑を文字色に使うのはヘッダー周りのみで、この局所性を規則化するか要判断 |
| **事故** | deck の `#64748b` / `#334155` / `#475569` / `#4338ca` | v4 パレットと数値が違う。**同じ画面内で `slate-500`(#62748e) と `#64748b` が同じ用途で併存**している |
| **事故** | deck の既定文字色が黒（未指定） | 所見3 |
| **事故** | `.dev-log` の `font-size: 0.725rem`（実測 11.6px） | 他のどの段にも属さない中途半端な値 |

### 2-2. 背景色

| special（40種） | deck（13種） |
|---|---|
| `white` 12／`green-600` 9／`slate-900` 8／`glass-card` rgba(255,255,255,**0.88**) 4／`green-100` 4／`blue-100` 4／`red-100` 4／`slate-100` 3／`amber-50` 3／`slate-200` 3／`blue-600` 3 ほか | `#eef2ff` 18／`white` 12／`indigo-600` 6／`glass-card` rgba(255,255,255,**0.9**) 6／`#f8fafc` 5／`slate-900` 2／`slate-50` 2／`#f1f5f9` 2／`#4f46e5` 1 ほか |

| 区分 | 内容 | 理由 |
|---|---|---|
| **基準候補** | 面＝`white`、沈めた面＝`slate-50`、選択中＝`indigo-50`(#eef2ff)、反転＝`slate-900` | 両者で一致。役割が明確 |
| **基準候補** | ページ地の「ごく淡い色面＋放射グラデーション」という作り | special（緑系 `#f4faf0`）と deck（藍系 `#f5f6fb`）で色相だけが違い、構造は同一。§6-1の「差別化する層」として既に成立している |
| **要判断** | `glass-card` の透過率 0.88（special）／0.9（deck）／`usd-panel` 0.9（core.js） | 3箇所に同じ意図の別定義。0.9 に寄せるのが自然だが、special は背景ストライプが透けるため見え方が変わる |
| **要判断** | special の `bg-*/40` `/50` `/70` `/80` `/95` といった透過付き背景（8種） | ニュアンスとしては効いているが、種類が多い。段数を決める必要がある |
| **事故** | Deck の主ボタン地色が `indigo-600`(#4f39f6) と `#4f46e5` の2種 | 同一画面（引き出しパネル）に両方が同時に出る。所見1 |
| **事故** | special の結果表の人物列の帯色（`#eff6ff` `#1e40af` 等）が**インラインstyleで直書き** | `special.html:1062` の `HUE_HEX`。コメントに「クラス指定では優先度で負ける」と明記されており、詳細度の敗北を回避するための回避策として固定化している |

### 2-3. 罫線色

| special（11種） | deck（3種） |
|---|---|
| `slate-200` 20／`green-100` 4／`amber-200` 4／`glass-card` rgba(187,224,163,.55) **!important** 4／`green-200` 3／`slate-700` 2／`slate-200/60` 2／`blue-200` 2／`slate-300` 2／`red-200` 2 | `#e2e8f0`（直書き）18／`slate-200`（v4トークン）17／`#c7d2fe` 5 |

| 区分 | 内容 | 理由 |
|---|---|---|
| **基準候補** | 既定の罫線＝`slate-200` | 両ツールで最頻。値も v3/v4 で一致していて事故がない |
| **要判断** | special の `glass-card` の枠が緑がかった半透明（`rgba(187,224,163,.55)`）で、しかも `!important` | 意図的なブランド表現だが、`!important` は Phase 2 の詳細度設計の障害になる |
| **要判断** | 状態色の枠（`amber-200` 警告／`red-200` エラー／`green-200` 進行中） | special のみに存在。deck には警告・エラーの枠表現が無い（`.ocr-warn` `#fcd34d` のみ） |

### 2-4. 人物・セット色（ステータス帯）

`special.html` は `PERSON_SETS` の `hue`（`blue` / `red`）から `bg-{hue}-600` `bg-{hue}-100` `text-{hue}-800` を**文字列連結で組み立てている**（`special.html:687, 1756`）。
結果表の列帯だけは `HUE_HEX` による直書きインラインstyle。

| 区分 | 内容 | 理由 |
|---|---|---|
| **基準候補** | 「セット＝色相、親＝濃い面に白文字、祖＝淡い面に濃い文字」という規則 | exam と共通の規則としてコード上に明記されており、意味を持っている |
| **要判断** | 緑がアクセントの画面に**青の統計カード**が並ぶこと（結果表の `blue-600` の数値と `blue-700` のラベル） | 人物色（青/赤）とツール色（緑）が同一視野で競合している |
| **事故** | 同じ人物色が「Tailwindクラス」と「HUE_HEXの直書き」の2系統で定義されている | `blue-800` は v4 では `#193cb8` だが `HUE_HEX` は `#1e40af`。同じ「親Aの色」が場所によって違う |

---

## 3. タイポグラフィ

### 3-1. フォントサイズ（実測px、数値は要素数）

| special | | deck | |
|---|---|---|---|
| 12px | 46 | 12px | 76 |
| 14px | 32 | 11px | 19 |
| 11px | 29 | 14px | 16 |
| 9px | 11 | 13px | 2 |
| 10px | 9 | **8px** | 2 |
| 13px | 5 | 18px | 1 |
| 24px | 4 | 10px | 1 |
| 16px | 2 | | |
| 30px | 1 | | |
| **11.6px** | 1 | | |
| **計10種** | | **計8種** | |

| 区分 | 内容 | 理由 |
|---|---|---|
| **基準候補** | 12px を基準、14px を1段上、11px を1段下とする3段 | 両ツールで上位3つが完全に一致（12 / 14 / 11）。これが事実上の本文スケール |
| **要判断** | 10px と 9px（special）／10px（deck） | バッジ・ラベル用の極小。2段は多い。1段に統合できるか |
| **要判断** | 見出し 18px（deck の h1）と 24px / 30px（special の h1・統計数値） | ツールの性格差（specialはランディング的なヘッダーを持つ）に由来。共通化するか差別化層に置くか |
| **要判断** | 13px（special の表ヘッダ 0.8125rem／deck の `.usd-row`） | 12と14の間。無くても成立する可能性 |
| **事故** | deck の **8px**（★ステッパーの▲▼ボタン） | 全体で最小。可読限界を下回る |
| **事故** | special の **11.6px**（`.dev-log` の 0.725rem） | 段に属さない値 |

### 3-2. 行間

同じ 12px の文字でも、**special では 16px、deck では 18px** の行間になる。
理由は、special が Tailwind の `text-xs`（`font-size` と `line-height` を同時に設定）を使うのに対し、deck の `.tab-btn` 等は CSS で `font-size` のみ指定し行間を既定（1.5）に任せているため。

| 区分 | 内容 |
|---|---|
| **要判断** | 12px の行間を 16px（Tailwind 準拠）に揃えるか 18px（読みやすさ優先）に揃えるか。ボタンの高さが変わるため、モバイル表示への影響確認が必要 |

### 3-3. 太さ

| special | deck |
|---|---|
| 700 / 56、500 / 32、600 / 25、800 / 5 | 600 / 81、700 / 6 |

| 区分 | 内容 | 理由 |
|---|---|---|
| **要判断** | special は 500・600・700 の3段を使い分け、deck は実質 600 の1段 | 同じ「ボタンの文字」が special では 500〜700 でばらつく（`font-medium` `font-semibold` `font-bold` が混在）。deck 側の 600 単一の方が整理されている |
| **事故** | special のボタン文字の太さが 500/600/700 と3種類ある（同じ階層のボタン間で） | 例：ツール切替 600、Deck連携 600、使い方ガイド **500**。3つ横並びのボタン群の中で1つだけ細い |

### 3-4. 字間・フォント種別

- `letter-spacing`：special は★セル `0.7px`、h1 `-0.75px`、小見出し `0.5px`、引き出しトリガー `0.88px` の4種。deck は指定なし。→ **要判断**（★セルの字間は可読性のための実務的な調整で、基準候補）
- 等幅フォント：special は2種類の定義が併存（`.dev-log` は `ui-monospace, SFMono-Regular, Menlo, monospace`、Tailwind の `font-mono` はより長いスタック）。→ **事故**（同じ用途に2定義）

---

## 4. 余白

### 4-1. 使われている距離値（px、実測の全種類）

| | 値 |
|---|---|
| special | 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 36, 40, 48 |
| deck | **1, 3, 7, 9**, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24 |

`padding` の組み合わせは special 28種／deck 相当数。主要なもの：

| 用途 | special | deck |
|---|---|---|
| カード内側 | 24px（`glass-card`）／16px | 16px（`glass-card` `usd-panel`） |
| 主ボタン | 14px / 16px | 8px / 16px、`.ocr-btn-primary` は 6px / 14px |
| 二次ボタン | 8px / 14px、10px / 14px | 8px / 12px |
| ピル型ボタン | 4px / 12px | 4px / 10px |
| 入力欄 | 10px〜14px（4種） | 8px / 12px |
| リスト行 | 8px / 12px | 12px / 16px（`.list-card`） |

| 区分 | 内容 | 理由 |
|---|---|---|
| **基準候補** | 4の倍数（4, 8, 12, 16, 24）を主軸とする刻み | 両ツールで最頻。Tailwind の spacing スケールとも一致する |
| **基準候補** | 6px・10px・14px（4の倍数の中間） | 数は少ないが、ボタンの上下パディングとして意図的に使われている。2段階の刻み（4刻み＋その中間）と見なせる |
| **要判断** | カード内側が 24px（special）と 16px（deck）で違う | ツールの情報密度の差に由来する可能性がある。「差別化する層」に置くか統一するか |
| **事故** | deck の 1px, 3px, 7px, 9px | ★ステッパー（`gap:1px`、`border-radius:3px`）、`.sum-badge`（`1px 7px`）、`.usd-pill`（`3px 9px`）。他のどこにも現れない孤立値 |
| **事故** | special のボタンのパディングが 8/14・10/14・10/20・6/12・4/12・14/16・12/16・8/16 と8種類ある | 同じ役割のボタンでも値が違う |

### 4-2. `gap`

special：8px(21) / 6px(14) / 12px(12) / 4px(2) / 16px(1) / 10px(1)
deck：8px / 6px / 12px / 4px / 3px / 1px

→ **基準候補**：4, 6, 8, 12 の4段。**事故**：deck の 1px, 3px。

---

## 5. 角丸

| special（7種） | | deck（8種） | |
|---|---|---|---|
| 12px | 35 | 12px | 27 |
| 完全な丸(`rounded-full`) | 23 | 999px | 18 |
| 8px | 11 | 8px | 9 |
| 16px | 8 | 16px | 6 |
| 4px | 7 | 完全な丸 | 3 |
| 6px | 5 | **10px** | 2 |
| 24px | 2 | **3px** | 2 |
| | | 6px | 1 |

| 区分 | 内容 | 理由 |
|---|---|---|
| **基準候補** | 12px を既定、8px を小さい要素、16px をカード、`999px`/`full` をピル | 両ツールで上位4つが一致。用途の対応も一致している |
| **要判断** | 4px（special のインラインバッジ）と 6px（special の STEP バッジ、deck のツールチップ） | 小さすぎる角丸が2段ある |
| **要判断** | 24px（special のヘッダー `rounded-3xl`） | ヘッダー限定。差別化層に置ける |
| **事故** | deck の 10px（`.ocr-btn-primary` `.ocr-btn-ghost` の `.625rem`） | 8px でも 12px でもない中間値。この2つのボタンのためだけに存在する |
| **事故** | deck の 3px（★ステッパー） | 孤立値 |
| **注記** | `rounded-full` の実測値は `3.35544e+07px`、CSS直書きは `999px` | 見た目は同じ。共通化の際はどちらかに統一する |

---

## 6. 影

| special（9種） | deck（1種） |
|---|---|
| `shadow-xs`(11) `shadow-md`(3) `shadow-2xl`(2) `shadow-xl`(1) `shadow-sm`(1) `shadow-none`(1)／`.deck-drawer-trigger` `-2px 0 12px rgba(15,23,42,.18)`／`.deck-drawer` `-8px 0 32px rgba(15,23,42,.25)` | `shadow-lg`(2) のみ（Undoボタンとトースト） |

| 区分 | 内容 | 理由 |
|---|---|---|
| **基準候補** | 「面の影は最小限（`shadow-xs`）、浮遊要素（トースト・ドロップダウン）だけ強い影」という使い分け | special の使い方は一貫している |
| **要判断** | 影の段数。special は実質5段、deck は1段 | 5段は多い。3段（xs / md / xl）に整理できるか |
| **事故** | `.deck-drawer-trigger` と `.deck-drawer` の影が独自定義 | 引き出しパネル専用。共通スケールに乗っていない |

---

## 7. 部品の形状パターン

### 7-1. ボタン（special 21種／deck 17種の形状が実在する）

代表的なものを役割別に並べる。**同じ役割で値が違う箇所を太字**にした。

| 役割 | special | deck |
|---|---|---|
| 主ボタン | `green-600` / 白文字 / r12 / p14·16 / 14px / **700** / 影あり | `indigo-600` / 白文字 / r12 / p8·16 / 14px / **600** / **影なし** |
| 主ボタン（別実装） | — | `.ocr-btn-primary` **`#4f46e5`** / **r10** / p6·14 / **12px** / 600 |
| 二次ボタン | 白 / **`slate-600`または`slate-700`** / 罫線`slate-200` / r12 / p8·14 / 12px / 500または600 / **影あり** | 罫線`slate-200` / r12 / p8·12 / 12px / 600 / **文字色未指定（黒）** / 影なし |
| 危険寄りの補助 | `amber-100` / `amber-800` / r8 | — |
| 絞り込みピル | r8 / p4·12 / 12px / 選択時 `slate-900`＋白文字 | **r999** / p4·10 / **11px** / 選択時 `indigo-50`＋`#4338ca` |
| アイコンボタン | Tailwind ユーティリティで個別指定 | `.icon-btn` / `.usd-icon-btn` p6 / r8 / `#64748b` / hover `#f1f5f9` |
| テキストリンク型 | 下線＋`slate-400`/`slate-500`、hover `red-600` | — |

| 区分 | 内容 |
|---|---|
| **基準候補** | 「主＝塗り、二次＝白地＋罫線、三次＝文字のみ」の3階層 |
| **要判断** | 主ボタンに影を付けるか（special あり／deck なし）、太さを 600 と 700 のどちらにするか |
| **要判断** | 絞り込みピルの形（角丸8pxの矩形 vs 完全なピル）と、選択状態の表現（反転 vs 淡いアクセント面）。**同じ「行の絞り込み」という機能が両ツールで全く違う見た目**になっている |
| **事故** | deck の二次ボタンの文字色が黒 |
| **事故** | `.ocr-btn-primary` が主ボタンの3つ目の実装（色も角丸もサイズも違う） |

### 7-2. 入力欄

| | special | deck |
|---|---|---|
| 地色 | 白（`#skill-list` のみ `slate-50/50`） | 白 |
| 罫線 | `slate-200` 1px | `slate-200` 1px（直書き `#e2e8f0`） |
| 角丸 | 8px または 12px（**2種**） | 8px、textarea は 12px |
| 内側余白 | 10px / 12px / 14px / 6px·12px·36px（**4種**） | 8px·12px |
| 文字サイズ | 12px または 14px | 14px（`.usd-input`）／12px |
| 文字色 | `slate-800` | **未指定（黒）** |
| フォーカス | `focus:border-green-500` `focus:ring-2 focus:ring-green-200`（一部の欄のみ） | **なし** |
| `<select>` | Tailwind クラスで矩形に整形済み | **3個が完全に素のまま** |

| 区分 | 内容 |
|---|---|
| **基準候補** | 白地＋`slate-200` 1px＋角丸8px |
| **要判断** | textarea だけ角丸12pxにするか |
| **事故** | deck の `<select>` 未整形、文字色未指定、フォーカス表現なし |
| **事故** | special でもフォーカスリングが付いている入力欄と付いていない入力欄がある |

### 7-3. バッジ・チップ

| 実装 | 形 |
|---|---|
| special `#skill-count-badge` | `green-100` / `green-800` / r999 / p4·10 / 12px / 600 |
| special STEPバッジ | `green-600` / 白 / r6 / p2·8 / 10px / 700 |
| special 「技能試験」タグ | `indigo-100` / `#432dd7` / r4 / p0·6 / 9px / 700 |
| special 人物バッジ | `{hue}-600`or`{hue}-100` / r999 / 9px / 700 |
| deck `.sum-badge` | `#eef2ff` / `#4338ca` / r999 / **p1·7** / 11px / 600 |
| deck `.usd-chip` | `#eef2ff` / `#4338ca` / r999 / p3·10 / 12px |
| deck `.usd-pill` | 白 / 罫線 / r999 / **p3·9** / 11px |
| deck `.usd-draft-badge` | `#fef3c7` / `#92400e` / r999 / p1·6 / 10px / 600 |

| 区分 | 内容 |
|---|---|
| **基準候補** | 「淡い面＋濃い文字＋完全なピル」という基本形 |
| **要判断** | 角丸4px・6pxの矩形バッジ（special）を残すか、全てピルに寄せるか |
| **事故** | パディングが 1·7 / 3·9 / 3·10 / 2·8 / 4·10 / 0·6 / 1·6 と7種類。同じ見た目の部品が7通りの値を持つ |

### 7-4. カード

| 実装 | 面 | 罫線 | 角丸 | 内側 |
|---|---|---|---|---|
| special `.glass-card` | rgba(255,255,255,**.88**) + blur(14px) | rgba(187,224,163,.55) **!important** | 16px | 24px |
| deck `.glass-card` | rgba(255,255,255,**.9**) + blur(14px) | `slate-200` | 16px | 16px |
| core.js `.usd-panel` | rgba(255,255,255,.9) + blur(14px) | `slate-200` | 16px | 16px |
| deck `.list-card` / core.js `.usd-list-card` | 白 | `#e2e8f0` | 12px | 12px·16px |

| 区分 | 内容 |
|---|---|
| **基準候補** | 「半透明白＋blur(14px)＋角丸16px」というカードの作り。3実装とも同じ意図 |
| **事故** | `.glass-card` が **special / deck で別定義**、さらに `.usd-panel` という3つ目の同義クラスが存在する。`.list-card` と `.usd-list-card` も完全同値の二重定義 |

---

## 8. 状態表現の棚卸

### 定義されている箇所

| 状態 | special | deck |
|---|---|---|
| hover | 25種（背景・文字・罫線・影） | 3種（`.icon-btn` `.usd-icon-btn` `.usd-paste-cand` の背景のみ） |
| focus | `focus:border-green-500` `focus:border-indigo-500` `focus:bg-white` `focus:ring-2` `focus:ring-green-200/500` `focus:outline-none` | **なし** |
| focus-visible | `:focus-visible { outline: 2px solid #15803d; offset 2px }`（全要素） | **なし** |
| active | `active:scale-98` `active:scale-99`（主要ボタン3個） | **なし** |
| disabled | `disabled:opacity-40` `disabled:cursor-not-allowed` `disabled:shadow-none`（主要ボタン3個） | **なし** |
| selected | `.drop-active`（ドロップ中）、フィルタボタンの class 付け替え | `.tab-active` `.row-filter-btn.active` `.usd-list-card.usd-selected` `.col-disabled` |
| 演出 | `transition-all` 19／`transition-colors` 8／`duration-300` 2、`prefers-reduced-motion` 対応あり | `transition-all` 1（トーストのみ）、`prefers-reduced-motion` 対応なし |

### 定義されていない箇所（＝ Phase 2 で埋める対象）

- deck の全ボタン（17形状）に hover が無い（アイコンボタン3種を除く）
- deck の全入力欄・`<select>`・textarea に focus 表現が無い
- deck に disabled 表現が無い（候補の無効化は `.col-disabled` の色替えのみで、これは意図的な設計。`<button disabled>` の表現は未定義）
- special でも、二次ボタン群（ツール切替・使い方ガイド等）に active / disabled の定義が無い
- 両ツールとも、`.tab-btn` `.row-filter-btn` の hover が未定義（選択状態はあるが、押せることが分かる表現がない）

| 区分 | 内容 |
|---|---|
| **基準候補** | special の `:focus-visible` を全ツール共通の基準にする（色はツールのアクセントに合わせる） |
| **基準候補** | `disabled` = 透明度40%＋`cursor: not-allowed` |
| **基準候補** | `active` = わずかな縮小（98〜99%）。ただし2種類あるので1つに決める |
| **要判断** | `transition` の対象と時間。special は `transition-all` が19箇所あり、レイアウト変化まで補間対象になっている |
| **事故** | deck に `prefers-reduced-motion` の配慮が無い（special にはある） |

---

## 9. special ↔ deck の差分対応表（Phase 2 で潰す全量）

| # | 項目 | special | deck | 判定 | Phase 2 の扱い |
|---|---|---|---|---|---|
| 1 | 基本文字色 | `slate-800` | **未指定（黒）** | 事故 | 共通トークンで統一 |
| 2 | 補助文字色 | `slate-500`(v4) | `slate-500`(v4) と `#64748b` が混在 | 事故 | 共通トークンで統一 |
| 3 | 主ボタンの地色 | `green-600` | `indigo-600` と `#4f46e5` が混在 | 事故 | 直書きを廃し、アクセント変数へ |
| 4 | 主ボタンの形 | r12 / p14·16 / 14px / 700 / 影あり | r12 / p8·16 / 14px / 600 / 影なし、別実装は r10 / 12px | 要判断 | 共通部品化 |
| 5 | 二次ボタンの形 | 白＋罫線＋影＋文字色指定 | 罫線のみ＋影なし＋文字色未指定 | 事故＋要判断 | 共通部品化 |
| 6 | 絞り込みピル | r8 矩形／選択時は反転（`slate-900`） | r999 ピル／選択時は淡いアクセント面 | 要判断 | どちらかに統一 |
| 7 | 入力欄 | 白／`slate-200`／r8〜12／p10〜14／文字色あり／一部フォーカスあり | 白／`slate-200`／r8／p8·12／**文字色なし・フォーカスなし** | 事故 | 共通部品化 |
| 8 | `<select>` | Tailwind で整形済み | **3個が素のまま** | 事故 | 共通部品化 |
| 9 | カード（glass-card） | rgba(.88)＋緑罫線 `!important` | rgba(.9)＋`slate-200` | 要判断 | 共通化。`!important` は詳細度設計で解消 |
| 10 | カードの内側余白 | 24px | 16px | 要判断 | 情報密度の差として残すか統一するか |
| 11 | リスト行 | （該当なし） | `.list-card` と `.usd-list-card` の二重定義 | 事故 | 共通部品化して一本化 |
| 12 | バッジ | 7種の実装／パディング5通り | 4種の実装／パディング4通り | 事故 | 共通部品化 |
| 13 | 角丸 | 4 / 6 / 8 / 12 / 16 / 24 / full | 3 / 6 / 8 / 10 / 12 / 16 / 999 | 要判断＋事故(3,10) | 4段＋ピルに整理 |
| 14 | 影 | 5段＋独自2種 | 1段 | 要判断 | 3段に整理 |
| 15 | 距離の刻み | 2,4,6,8,10,12,14,16,20,24,32,36,40,48 | 左記＋1,3,7,9 | 事故(1,3,7,9) | 共通スケールへ |
| 16 | 文字サイズ | 10種（9〜30px、11.6px含む） | 8種（8〜18px） | 要判断＋事故(8px, 11.6px) | 5〜6段に整理 |
| 17 | 12px の行間 | 16px | 18px | 要判断 | どちらかに統一 |
| 18 | 文字の太さ | 500 / 600 / 700 / 800 | 600 / 700 | 要判断 | 3段に整理 |
| 19 | hover | 25種 | 3種 | 欠落 | 共通部品側で一括付与 |
| 20 | focus / focus-visible | あり（緑） | **なし** | 欠落 | 共通化。色のみツール別 |
| 21 | active / disabled | あり | **なし** | 欠落 | 共通化 |
| 22 | `prefers-reduced-motion` | あり | なし | 欠落 | 共通化 |
| 23 | ページ地 | 緑系ストライプ＋放射 | 藍系放射 | 基準候補（差別化層） | 構造だけ共通化し、色相はツール別 |
| 24 | `.hidden` の定義 | Tailwind に依存 | 独自に `display:none !important` | 要判断 | 挙動が変わるため慎重に |
| 25 | 等幅フォント | 2種のスタックが併存 | Tailwind の `font-mono` | 事故 | 共通トークンへ |

---

## 10. 保護対象（セレクタ資産）

Phase 2 で改名・削除してはならないもの。機械抽出した実数：

| 種別 | 数 | 備考 |
|---|---|---|
| `id` | special 73／deck 31／core.js 3／deck.js 4 | 全て保護 |
| `data-*` 属性 | 20種 | `data-person` `data-skill-id` `data-cand-id` `data-usd-el` `data-usd-act` `data-ocr-el` `data-ocr-act` `data-row` `data-axis` `data-mode` `data-value` `data-template-id` ほか |
| **JS が名前で掴んでいるクラス** | **75種** | 下記の注意を参照 |

### 注意：Tailwind ユーティリティも掴まれている

「JS が掴んでいるクラス75種」には、以下のような**見た目用のユーティリティが多数含まれる**。これらは `classList.add/remove` による状態の切り替えや、JS で組み立てるマークアップの文字列に現れる。

```
bg-slate-900  bg-slate-100  text-white  text-slate-600  hover:bg-slate-200
font-medium  px-3  py-1  rounded-lg  cursor-pointer      ← 絞り込みボタンの選択切替（special.html:1230-1232）
bg-red-50  border-red-200  text-red-700  rounded-xl  p-4 ← エラー表示の組み立て（special.html:1465）
bg-amber-50  border-amber-200  text-amber-800           ← 警告表示の組み立て
bg-indigo-50  border-indigo-300  text-indigo-700        ← Deck連携モードの切替（special.html:1551, 1598）
drop-active  person-drop-zone  person-file-input  person-image-list
hidden  open  closing  opacity-0  translate-y-16  pointer-events-none
tab-active  row-filter-btn  row-zero  ocr-banner  usd-modal
```

→ **Phase 2 の作業ルール**：ユーティリティを共通部品クラスへ置き換える際は、この75種のリストに載っていないことを機械確認してから削除する。載っているものは残したまま共通クラスを併記する。

---

## 11. モバイル表示の現状値（§2-4 の下限確認用）

375px 幅での実測：

| | `scrollWidth` | `clientWidth` | 横スクロール |
|---|---|---|---|
| `special.html`（結果表を表示した状態） | 375 | 375 | なし |
| `uma-skill-deck.html`（比較シート編集を開いた状態） | 375 | 375 | なし |

→ Phase 2 の完了条件：**この2つが 375 = 375 のままであること**。

---

## 12. Phase 2 に持ち越す論点（承認時に判断が必要）

1. **v3系の直書き色を v4 パレットに寄せるか、逆にトークンとして固定するか。** 前者は48箇所の値が微妙に変わる（＝全画面の見た目が僅かに変わる）。後者は Tailwind ユーティリティ側と食い違ったままになる。**推奨は前者**（トークン化して v4 の値を正とする）。
2. **`glass-card` の透過率と枠色。** special の緑がかった枠（`!important` 付き）をアクセント変数として残すか、`slate-200` に統一するか。
3. **カード内側余白 24px / 16px。** 情報密度の差として意図的に残すか。
4. **絞り込みピルの形状。** special の矩形＋反転 と deck のピル＋淡色、どちらを共通形にするか。
5. **12px の行間 16px / 18px。** ボタン高さが変わるため、モバイル確認が必要。
6. **`.hidden` の扱い。** deck 独自定義（`!important` 付き）を共通化すると、Tailwind の `hidden` と競合する挙動が変わる可能性がある。

## 13. Phase 3 に回す候補（本フェーズで手を出さないもの）

- 結果表の人物列がインラインstyleで色を当てている構造（`HUE_HEX`）。詳細度の問題を根本解決するには DOM またはクラス設計の変更が要る
- 引き出しパネル内で「UmaSkill Deck」という見出しが二重に出る（パネルヘッダと iframe 内の h1）
- 緑がアクセントの画面に青の統計カードが並ぶ、人物色とツール色の競合
- `.list-card` / `.usd-list-card` のように、衝突回避のためだけに同じ定義が二重化している構造
- `<select>` の見た目をブラウザ既定に任せている箇所（Deck）
- deck の★ステッパー（8px文字・15×12pxのボタン）のタップ領域
