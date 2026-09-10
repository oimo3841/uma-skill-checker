# Phase 3 提案の実施記録（第1弾）

種別：記録（2026-09-10）。この文書は後から書き換えない。
対象は [design-proposals-phase3.md](design-proposals-phase3.md) の提案のうち、承認された7件。

版数：`common.css 2026-09-10g` / `core.js 2026-09-10h` / `deck.js 2026-09-10i`（`common.js` は `2026-09-10a` のまま未変更）

## 実施したもの

| # | 提案 | 結果 |
|---|---|---|
| 2 | 回帰確認ハーネスをリポジトリに入れる | `tests/visual/` を新設。`npm run test:visual` / `test:verify` / `test:visual:capture` |
| 3 | `setFilter()` の `className` 全書き換えをやめる | `classList.toggle('active')` に変更。絞り込みが共通部品 `.uma-pill` になった |
| 8 | 同義クラスの二重定義を解消 | `.uma-list-row` に一本化。`.usd-panel` は `.glass-card` へ。クラス名は残したまま |
| 9 | 結果表の人物列のインライン `style` をやめる | クラス（`.person-col` ＋ 色相クラス）に移行。`HUE_HEX` を廃止 |
| 10 | UmaStar OCR のボタンを共通部品に寄せる | 12個を `.uma-btn` 系へ。共通部品に `--neutral` `--accent-outline` を追加 |
| 11 | 残った孤立値 `gap: 1px` の解消 | 2箇所を `--uma-sp-0-5`（2px）へ |
| 13 | 読み込み失敗の検出と再読み込みの案内 | Tailwind 未読込を検出して案内。あわせて `hidden` の保険を追加 |
| 15 | `docs/README.md` が空 | 文書を3種別（基準／記録／課題）に整理した索引を作成 |

保留：1（exam適用）・4（人物色の競合）・5（引き出しの見出し二重）・6（警告帯の共通化）・7（トースト/Undo）・12（モバイル最適化）・14（`index.html` のルート扱い）

## 変更の中身

### 共通部品の追加（`css/common.css`）

| 追加 | 内容 | なぜ |
|---|---|---|
| `--uma-glass-bg` / `--uma-glass-blur` | 半透明パネルの地とぼかし量 | `.glass-card` と `.usd-modal-panel` が同じ値を別々に持っていた |
| `.uma-list-row` / `--selectable` / `--selected` | 一覧の行 | `.list-card`（deck）と `.usd-list-card`（core.js）が完全同値の二重定義だった |
| `.uma-btn--neutral` | 無彩色の塗りボタン | 「解析する」「元に戻す」「まとめてコピー」のような、実行系だがツールの主役ではない操作。アクセントを使うと主要導線と競合する |
| `.uma-btn--accent-outline` | アクセント色の輪郭ボタン | 「画像を結合する」のように、主ボタンと同系統だが一段弱い扱いのもの |
| `html:not(.uma-tw-ready) .hidden` | Tailwind 未読込時だけ効く `hidden` の保険 | 遮断時に「隠れているべき要素が全部見える」状態を防ぐ |

### `special.html`

| 箇所 | 変更前 | 変更後 | なぜ |
|---|---|---|---|
| `setFilter()` | `className` を丸ごと再代入（2種の文字列） | `classList.toggle('active', ...)` | マークアップにクラスを足しても押した瞬間に消えるため、共通部品を使えなかった |
| 絞り込みボタン3個 | Tailwindユーティリティ直書き | `.uma-pill` / `.uma-pill.active` | Deck 側と同じ部品になった |
| 結果表の人物列 | `HUE_HEX` の値をインライン `style` で当てる | `.person-col` ＋ `.person-col-blue` / `-red`（CSS変数で色を渡す） | 「クラスでは優先度で負ける」という当時の前提が、カスケードレイヤーの性質により成立しなくなったため |
| ★合計列 | インライン `style` | `.person-total` | 同上 |
| 系統図のSVG | `stroke` に変数 | 変更なし | |
| ヘッダー3ボタン | ユーティリティ直書き | `.uma-btn--secondary` | |
| 「リストを解析する」 | `bg-slate-900` 直書き | `.uma-btn--neutral` | |
| 「クリア」 | ユーティリティ直書き | `.uma-btn--secondary` | |
| 「元に戻す」（Deck連携） | `bg-slate-900` 直書き | `.uma-btn--neutral` | |
| 「OCR処理を開始する」 | ユーティリティ直書き | `.uma-btn--primary --lg` | hover時の緑の影（`hover:shadow-green-200`）は失われた |
| 「画像を結合する」 | 白地＋緑の2px罫線 | `.uma-btn--accent-outline --lg` | 罫線が2px→1pxになった |
| 「まとめてコピー」 | `bg-blue-600` | `.uma-btn--neutral` | 青は人物色（親Aセット）と紛らわしかった |
| 「UmaSkill Deckに保存」 | `bg-indigo-600` 直書き | `.uma-btn--primary --lg .btn-deck-accent` | 藍は行き先を示すので残し、**共通部品のまま `--uma-accent` だけをその場で差し替える**形にした |
| 「UmaSkill Deck連携」 | ユーティリティ直書き | `.uma-btn--secondary .btn-deck-accent` | 同上 |
| 引き出しの「閉じる」 | ユーティリティ直書き | `.uma-btn--secondary` | |
| PNGダウンロードリンク（JS生成） | `className` に長いユーティリティ列 | `.uma-btn--primary` | |
| 「辞書をクリア」「セットをクリア」 | 下線付きの文字リンク | **変更なし** | 赤いhoverで「消える操作」を伝えており、共通部品にすると失われるため対象外にした |
| 「＋ 親Bセットも追加する」 | 破線の枠 | **変更なし** | 破線は「ここに足せる」ことを示す固有の表現 |
| 「ログをコピー」 | amber系 | **変更なし** | 開発用ログ（開発者向け）の中の要素で、amberの帯と一体になっている |

### `uma-skill-deck.html` / `js/uma-skill-deck-core.js` / `js/uma-skill-deck.js`

| 箇所 | 変更 |
|---|---|
| `.list-card` の定義 | 削除。`deck.js` のマークアップに `uma-list-row` を併記 |
| `.usd-list-card` 系の定義（5ルール） | 削除。`core.js` のマークアップに `uma-list-row` / `--selectable` / `--selected` を併記 |
| `.usd-panel` の定義 | 削除。テンプレート編集パネルに `glass-card` を併記（面・罫線・角丸・余白が共通値になった） |
| `.usd-modal-panel` | 地とぼかしをトークン参照に |
| `.star-stepper` / `.cand-header` の `gap: 1px` | `var(--uma-sp-0-5)`（2px） |
| `.hidden` の宣言 | 残置。コメントに `common.css` 側の保険との関係を明記 |
| `deck.js` | Tailwind 読み込み検出を追加 |

### 読み込み失敗時の挙動（提案13）

Tailwind v4 は `:root` にテーマ変数（`--spacing` など）を定義する。これの有無で読み込みの成否が判定できる。

- 成功 → `<html>` に `.uma-tw-ready` を付ける。`common.css` の保険は無効になり、既存の挙動は一切変わらない
- 失敗（0.8秒間隔で5回試して駄目な場合）→ `console.warn` とトーストで案内する

```
表示に必要な外部ファイルを読み込めませんでした。ページを再読み込みしてください。
広告ブロッカーや社内ネットワークが cdnjs.cloudflare.com を遮断している場合は、許可設定が必要です。
```

**`.hidden` を `common.css` に無条件で置くことは避けた。** `special.html` に
`class="... hidden sm:inline"`（狭い画面では隠し、広い画面で表示する）という要素があり、
無条件の `.hidden` を足すと**常に隠れてしまう**ことを実測で確認したため。
`html:not(.uma-tw-ready)` で限定することで、通常時は一切効かない保険にしてある。

## 検証結果

| 項目 | 結果 |
|---|---|
| `npm run test:verify`（納品前チェック） | 総合OK。版数3点一致、`index.html`/`exam.html`/`common.js`/`stitch.js` 未変更、id・`data-*` の消失0件、消したclassのJS参照なし、JS構文OK、`common.css` の `!important` は1件のみ |
| `npm run test:visual`（機能スモークテスト） | 33項目すべてOK。両ページともコンソールエラー0 |
| DOM構造の一致（7画面状態） | 要素数・タグ・id・親子関係すべて一致 |
| 375px の横スクロール | 両ページとも `scrollWidth = clientWidth = 375` |
| 版ずれ警告 | 検出して警告が出ることをテストで確認 |
| CDN遮断時 | 案内が出ること、`hidden` の保険が効くことをテストで確認 |

### 検証で見つけて直したもの

`run-verify.mjs` が「`special.html` から消したクラス `inline-flex` / `hover:bg-green-700` を
同ページのJSが名指ししている」と報告した。調べると、JS が生成する PNG ダウンロードリンクが
`className` に同じユーティリティ列を持っていただけの誤検知だったが、
**そのリンク自体が共通部品に寄せるべき対象**だったため、あわせて `.uma-btn--primary` にした。
