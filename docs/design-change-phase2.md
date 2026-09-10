# Uma Tools デザイン統一（Phase 2）変更対応表

対象：`css/common.css`（新設）／`special.html`／`uma-skill-deck.html`／`js/uma-skill-deck-core.js`／`js/uma-skill-deck.js`
版数：`common.css 2026-09-10d` / `core.js 2026-09-10e` / `deck.js 2026-09-10f`（`common.js` は `2026-09-10a` のまま未変更）
作成日：2026-09-10。判断の根拠は [design-audit-phase1.md](design-audit-phase1.md) を参照。

---

## 0. 設計の土台：なぜ `!important` が要らないか

Tailwind v4 はユーティリティを `@layer utilities` に入れる。CSSのカスケードレイヤー規則では
**レイヤーに属さない指定がレイヤー付きより強い**ため、`common.css` の素のクラスセレクタは
Tailwind ユーティリティに勝つ。実測で確認済み。

読み込み順は次のようになり、そのまま三層構造になる。

```
css/common.css   … 共通の土台（レイヤー無し＝最強）
Tailwind CDN     … ユーティリティ（@layer utilities＝弱い）
各HTMLの<style>  … ページ固有の上書き（レイヤー無し・common.cssより後＝最強）
```

この性質から、次の2つが導かれる。

- **既存のユーティリティを削らなくても共通部品が効く。** 貼り付け量と事故率を抑えられる。
- **`common.css` に要素セレクタで装飾を書くと既存の見た目を一括で壊す。** 装飾はクラスセレクタで書き、要素セレクタは `body` の基本文字色など継承の起点だけに使う。

副作用として、共通部品が `display` を指定すると Tailwind の `hidden` や `hidden` 属性より強くなってしまう。
「hidden を付けたのに消えない」事故を防ぐため、`common.css` に詳細度で明示的に負かす1ルールを入れてある。

---

## 1. 何を、何から何に、なぜ

### 1-1. 全体（両ツール共通）

| 要素 | 変更前 | 変更後 | なぜ |
|---|---|---|---|
| 色の実値 | v3世代の直書きhexとv4パレットが混在（直書き75件中48件が不一致） | すべてv4パレットの実測値に統一。CSS側は `var(--uma-*)` 経由 | 同じ役割の色が2種類並存していた。目視では見つけられない類の不整合 |
| 基本文字色 | special=`slate-800` / Deck=**未指定（ブラウザ既定の黒）** | 両方 `--uma-text`（`slate-800` #1d293d） | Deckは基準色を一度も敷いていなかった。ボタン・入力欄の文字が黒だった |
| フォーカス表現 | special=緑の`:focus-visible` / Deck=**なし** | 共通で `:focus-visible`、輪郭色はツールのアクセント | Deckは操作要素が48個ありながらフォーカス表現がなかった |
| 動きの抑制 | special=`prefers-reduced-motion`あり / Deck=なし | 共通で対応 | 同上 |
| 文字サイズ | 10種（8px・11.6px・13px等を含む） | 6段（10/11/12/14/18/24px）＋行間をセットで固定 | 段に属さない外れ値を排除 |
| 12pxの行間 | special=16px / Deck=18px | **16px に統一** | 同じ大きさの文字の字送りが2種類あった |
| 余白の刻み | Deckに1/3/7/9pxの孤立値 | 4pxを単位とする刻み（2/4/6/8/10/12/14/16/20/24） | 孤立値を排除 |
| 角丸 | special 7種 / Deck 8種（3px・10pxを含む） | 6/8/12/16/ピル の4段＋ピル | 中間値を排除 |
| 影 | special 5段＋独自2種 / Deck 1段 | 3段（面／主ボタン／浮遊要素） | 使い分けの規則を明示 |
| 等幅フォント | 2種のスタックが併存 | `--uma-font-mono` の1本 | 同じ用途に2定義あった |

### 1-2. 共通部品（`css/common.css` に新設）

| 部品 | 変更前 | 変更後 | なぜ |
|---|---|---|---|
| カード `.glass-card` | special=`rgba(255,255,255,.88)`＋緑がかった枠を`!important` / Deck=`rgba(255,255,255,.9)`＋`slate-200` / core.js=`.usd-panel`（3つ目の同義定義） | `rgba(255,255,255,.9)`＋`slate-200`＋角丸16pxに一本化。`!important` 廃止 | 同じ意図の定義が3箇所にあった（承認事項2） |
| カード内側余白 | special=20px/24px（`p-5 md:p-6`） / Deck=16px | **狭い画面16px／768px以上24px** に統一 | 承認事項3。狭い方に合わせた側をモバイルに、広い方をデスクトップに割り当て、モバイルの内容幅を減らさない |
| 主ボタン | special=緑・700・影あり / Deck=`indigo-600`・600・影なし / `.ocr-btn-primary`=`#4f46e5`・角丸10px・12px（3つ目の実装） | `.uma-btn--primary`（アクセント地・白文字・角丸12px・600・影1段）。大きい導線は `--lg`（14px・700） | 主ボタンの実装が3種類あり、藍が2色並んでいた |
| 二次ボタン | special=白地＋罫線＋影＋文字色指定 / Deck=罫線のみ・**文字色未指定（黒）**・影なし | `.uma-btn--secondary`（白地・`slate-200`罫線・`--uma-text-heading`・影1段） | Deck側は文字色が黒だった |
| アイコンボタン | Deck=`.icon-btn` / core.js=`.usd-icon-btn`（同値の二重定義） | `.uma-icon-btn` に一本化し、既存クラス名は残したまま併記 | 衝突回避のためだけに同じ定義が2つあった |
| 絞り込みピル | special=角丸8px矩形・選択時は`slate-900`反転 / Deck=完全なピル・選択時は淡い藍 | **special側の形に統一**（`.uma-pill` / `.uma-pill.active`） | 承認事項4。同じ機能が全く違う見た目だった |
| 入力欄 | special=角丸2種・余白4種・フォーカス一部のみ / Deck=文字色なし・フォーカスなし・`<select>`3個が素のまま | `.uma-input`（白地・`slate-200`・角丸8px・余白8/12・12px・フォーカスリングあり）。textareaのみ角丸12px | `<select>`が未整形で、隣の整形済みボタンと並んでいた |
| バッジ | 実装11種・パディング7通り | `.uma-badge`（＋`--accent` / `--warn`）に集約。既存の `.sum-badge` `.usd-chip` はトークン参照に統一 | 同じ見た目の部品が7通りの値を持っていた |

### 1-3. `special.html`（UmaStar OCR）

**この画面の操作フローと配置は一切変更していない。** 変更は色・寸法・版数の3種類のみ。

| 箇所 | 変更前 | 変更後 | なぜ |
|---|---|---|---|
| `<head>` | — | `css/common.css?v=2026-09-10d` を Tailwind より前に読み込み | 三層構造を成立させるため |
| `<style>` `:root` | — | アクセント変数6件（緑）を定義 | 共通部品がこの変数を見て色を決める |
| `.glass-card` `:focus-visible` `prefers-reduced-motion` | ページ内で定義 | `common.css` へ移設（ページからは削除） | 両ツールで同じ意図の定義だった |
| `.result-table` の色・余白・文字 | `#f1f5f9` `#475569` `#e2e8f0` `#f8fafc`（v3世代の直書き） | すべてトークン参照。ヘッダ文字 13px→12px | v4パレットとズレていた／13pxが段に属さない |
| `.found` | `#059669`（emerald-600 v3） | `--uma-success`（green-700 v4 `#008236`） | 同上 |
| `.not-found` | `#94a3b8` | `--uma-text-faint`（`#90a1b9`） | 同上 |
| `.drop-active` | `#16a34a` / `#f0fdf4` を **`!important` 付き**で指定 | `--uma-accent` / `--uma-accent-soft`。**`!important` を削除** | レイヤー規則により不要になった（§0） |
| `.dev-log` | `font-size: 0.725rem`（実測11.6px）・独自の等幅スタック | `--uma-fs-xs`（11px）・`--uma-font-mono` | 段に属さない値・等幅スタックの二重定義 |
| `.deck-drawer-trigger` | `#4f46e5` / hover `#4338ca`（v3世代） | `#4f39f6` / `#432dd7`（v4 indigo） | **緑ではなく藍のまま**にしてある。「押すとUmaSkill Deckへ行ける」ことを示す取っ手だから |
| `HUE_HEX`（結果表の人物列） | `#1e40af` `#93c5fd` `#bfdbfe` `rgba(59,130,246,.07)` 等（v3世代） | v4の実測値（`#193cb8` `#8ec5ff` `#bedbff` `rgba(43,127,255,.07)` 等） | 同じ「親Aの色」がバッジと表で違っていた |
| 「★合計」列のインライン色 | `#f1f5f9` `#334155` `#cbd5e1` | トークン参照 | 同上 |
| 系統図のSVG線 | `stroke="#cbd5e1"` | `stroke="var(--uma-border-strong)"` | 同上 |
| 「使い方ガイド」ボタン | `font-medium`（500） | `font-semibold`（600） | 横並び3ボタンで1つだけ細かった |
| `glass-card` の4要素 | `rounded-2xl border border-slate-200/80 p-5 md:p-6` を併記 | 面・罫線・角丸・余白は `common.css` が持つため、重複するユーティリティを削除 | 値の二重管理を残さない |
| `<script>` | — | `EXPECTED_COMMON_CSS_VERSION` と照合機構を追加。開発用ログに `common.css 版` を追記 | §5-2 |

### 1-4. `uma-skill-deck.html`（UmaSkill Deck）

DOM順序・id・`onclick`・文言は完全に保持したうえで、`<style>` を書き直し、共通部品クラスを併記した。

| 箇所 | 変更前 | 変更後 | なぜ |
|---|---|---|---|
| `<head>` | — | `css/common.css?v=2026-09-10d` を読み込み／`?v=` を core=e・deck=f に更新 | |
| `:root` | — | アクセント変数6件（藍）を定義 | |
| `.glass-card` `.icon-btn` `input[type=text]` の一括指定 | ページ内で定義 | 削除し、`common.css` の部品へ（要素に `uma-*` を併記） | 二重定義の解消。要素セレクタでの一括指定をやめた |
| `.tab-btn` / `.tab-active` | `#64748b` `#e2e8f0` `#eef2ff` `#4338ca` `#c7d2fe`（v3世代混在）・行間18px・hoverなし | トークン参照・行間16px・**hoverを追加**・地色を白に | 承認事項5。押せることが分かる表現がなかった |
| `.row-filter-btn` | 完全なピル・11px・選択時は淡い藍 | ルールを削除し、`uma-pill` を併記（角丸8px矩形・12px・選択時は反転） | 承認事項4 |
| `.list-card` `.deck-table` `.sticky-*` `.sum-badge` `.col-disabled` 他 | 直書きhex・1/3/7/9pxの余白 | すべてトークン参照 | |
| `.star-stepper button` | 8px文字・15×12px・角丸3px・hoverなし | 10px文字・16×14px・角丸6px・**hoverを追加** | 8pxは全体で最小の外れ値だった。文字を上げた分ボタンを広げ、タップ領域も少し改善 |
| `.cand-header` のチェックボックス | ブラウザ既定色 | `accent-color: var(--uma-accent)` | 選択状態がツールのアクセントと揃う |
| `#record-grid-wrap` のインライン枠線 | `#e2e8f0` / `.75rem` | `var(--uma-border)` / `var(--uma-r-lg)` | |
| `#name-reveal-tip` のインライン指定 | `#0f172a` 他の直書き | トークン参照 | |
| 各ボタン・入力欄・`<select>`・textarea | Tailwindユーティリティの寄せ集め | `uma-btn` / `uma-btn--primary` / `uma-btn--secondary` / `uma-input` を併記 | |
| `.hidden { display:none !important }` | ページ内で定義 | **そのまま残した**（後述） | |

### 1-5. `js/uma-skill-deck-core.js` / `js/uma-skill-deck.js`

§5-4 の許可範囲（クラス名の置き換えと版数検証）に限定した。ロジックには触れていない。

| 箇所 | 変更前 | 変更後 |
|---|---|---|
| core.js `CORE_STYLES`（約40ルール） | 直書きhex（`#64748b` `#4338ca` `#15803d` `#b91c1c` 等）と 1/3/9px の余白 | すべて `var(--uma-*)` 参照。`.usd-list-card` `.usd-row` に **hover を追加** |
| core.js のマークアップ文字列 | `usd-icon-btn` / `usd-input` / `px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold` 等 | `uma-icon-btn` / `uma-input` / `uma-btn uma-btn--primary` 等を併記・置換（既存の `usd-*` クラス名は保持） |
| core.js 貼り付け欄のインライン等幅指定 | `font-family:ui-monospace,...;font-size:12px` | `font-family:var(--uma-font-mono)` |
| deck.js `injectOcrHandoffStyles`（約12ルール） | `#4f46e5` `#3730a3` `#6366f1` `#fcd34d` 等の直書き | トークン参照。ボタン・入力欄の形は共通部品に委譲し、バナー固有の配置だけを残した |
| deck.js のマークアップ文字列 | `ocr-btn-primary` / `ocr-btn-ghost` / `ocr-select` / `ocr-label-input` / `icon-btn` | 共通部品クラスを併記（既存クラス名は保持） |
| 版数定数 | core=`2026-09-10b` / deck=`2026-09-10c` | core=`2026-09-10e` / deck=`2026-09-10f` |
| deck.js 起動処理 | 版表示は js と core のみ | `css` の版も表示し、`verifyCommonCssVersion()` で照合 |

---

## 2. 承認事項6（`.hidden`）について — 残すことにした

該当は `uma-skill-deck.html` の `<style>` 冒頭にあった1行 `.hidden { display: none !important; }` で、
Tailwind の `hidden` ユーティリティと同じ機能が二重に定義されている状態だった。

**結論：そのまま残す。** 理由は次の3点。

1. Deck の表示制御は `classList.add('hidden')` に依存している。CDN が読めなかった場合、この宣言が無いと
   隠れているべき要素（他タブの中身・編集画面）が**全部見えてしまう**。保険として機能している。
2. `common.css` へ移すと `special.html` にも `!important` 付きの `.hidden` が効くようになる。
   special には「Tailwindでは `.inline-flex` が `.hidden` より後に出力されるため hidden クラスでは隠れない」
   という実測に基づく回避策（`style.display` での切り替え）があり、前提を変えると挙動が変わりうる。
3. 消す必要がない。共通部品と `hidden` の衝突は、`common.css` 側に詳細度で負かす1ルールを入れて解決済み。

なお `special.html` 側は従来どおり Tailwind の `hidden` に依存したままで、こちらも変更していない。

---

## 3. 検証結果（§9 納品前チェック）

検証対象はリポジトリ実ファイル。すべて機械実行、目視確認なし。

| 項目 | 結果 |
|---|---|
| バージョン文字列の3点一致（内部定数・`?v=`・期待値） | OK（css=d / core=e / deck=f / common.js=a） |
| `index.html` / `exam.html` / `js/common.js` / `js/stitch.js` が未変更 | OK（`git diff --quiet`） |
| id が1つも失われていない（4ファイル） | OK |
| `data-*` が1つも失われていない（4ファイル） | OK |
| 消したclassを同ページのJSが付け外ししていない | OK |
| 消したclassが文書全体検索のセレクタに使われていない | OK |
| JSが掴むクラス名の集合が減っていない | OK |
| JS構文チェック（HTML埋め込み＋jsファイル4本） | OK |
| `common.css` の `!important` | 1件のみ（`prefers-reduced-motion` の `scroll-behavior`。標準的な書き方で、詳細度では代替できない） |

### 実測による確認

| 確認 | 結果 |
|---|---|
| DOM構造（要素数・タグ・id・親子関係）が7つの画面状態すべてで一致 | OK（special 295/451、deck 120/144/1929/2252/2252 が変更前後で完全一致） |
| 375px幅での横スクロール | 変更前後とも `scrollWidth = clientWidth = 375`（両ファイル） |
| 機能スモークテスト29項目 | 全項目OK（リスト解析・結果表描画・絞り込み・検索・引き出し開閉・ガイド開閉・親Bセット・タブ切替・シート編集・行フィルター・★増減・候補無効化・モーダル・エクスポート、両ページともコンソールエラー0） |
| 版ずれ警告の動作 | 古い版を配信した場合／読み込めない場合の両方で、`console.warn` とトーストが出ることを確認 |

### 実測で見つけて直した回帰

`.star-stepper button` に文字色を指定したところ、詳細度 (0,1,1) が `.col-disabled *` (0,1,0) を上回り、
**無効にした候補列の▲▼だけが有効列と同じ濃さで残る**状態になった。
変更前後の `getComputedStyle` 差分で検出し、色指定を外して解消。理由をコメントに残してある。

---

## 4. `exam.html` へ適用する際に判断が必要な箇所

| # | 論点 | 内容 |
|---|---|---|
| 1 | **アクセント色の衝突** | exam は現在 `indigo`。Deck と同じ色になり、「評価して比較する画面」との区別が付かない。exam 固有の色（例：`violet` / `sky`）を割り当てるか、Deck 側を動かすかの判断が要る。今回は両ツールとも `:root` の変数6件を差し替えるだけで色が変わる構造にしてある |
| 2 | **`.glass-card` の枠色** | exam の `.glass-card` も special と同様に独自の枠色を `!important` で指定していないか要確認。`common.css` を読み込んだ時点で面・罫線・角丸・余白が共通値に変わる |
| 3 | **カード内側余白** | exam のカードが `p-5 md:p-6` なら、`.glass-card` を付けている要素は自動的に 16/24px に変わる。ユーティリティ側の重複指定を消すかどうかを決める |
| 4 | **sp70緑カテゴリ・133スキル固定リスト固有の色** | exam 固有の概念に紐づく色（緑カテゴリのバッジ等）は共通トークンに含めていない。exam の `<style>` にページ固有として残すか、`--uma-*` の状態色に寄せるかを判断する |
| 5 | **人物色（青/赤）** | special と同じ `PERSON_SETS` の仕組みを持つ。`HUE_HEX` 相当の直書きが exam にもあれば、同じく v4 実測値へ置き換える必要がある |
| 6 | **絞り込みボタン** | exam にも `className` を丸ごと書き換える実装（exam.html:1892 付近）がある。`uma-pill` を付けても書き換えで消えるため、special と同じく**触らない**のが安全。共通化するなら JS 側の書き換えを直す必要がある（Phase 3 案件） |
| 7 | **`.hidden` の有無** | exam が Tailwind の `hidden` に依存しているか、独自宣言を持っているかを確認する。共通部品を付けた要素に `hidden` を併用する箇所があれば、`common.css` の衝突回避ルールが効く |
| 8 | **版数の照合** | exam にも `EXPECTED_COMMON_CSS_VERSION` と `verifyCommonCssVersion()` を入れる。special.html の実装をそのまま移植できる（`showToast` が同名で存在することを確認すること） |
| 9 | **`text-[11px]` 等の任意値** | exam は `text-[11px]` を JS から掴んでいる（exam.html:1005 他）。`--uma-fs-xs` へ寄せる場合、掴んでいる箇所を先に確認する |
| 10 | **13px の扱い** | special の表ヘッダを 12px に寄せた。exam に同じ 0.8125rem があれば同様に扱うか、exam だけ残すかを決める |
