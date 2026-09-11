# docs／設計文書の索引

このディレクトリの文書は**性質が3種類**あり、扱い方が違う。
どれが「今の正」なのかを取り違えると事故になるため、種別を明示する。

| 種別 | 扱い |
|---|---|
| **基準** | 常に現在の状態を表す。実装を変えたらこの文書も更新する |
| **記録** | ある時点の判断とその理由。**後から書き換えない**。現在の姿とは限らない |
| **課題** | 未処理のもの。消化したら該当項目を落とすか、状態を更新する |

## 一覧

| 文書 | 種別 | 時点 | 内容 |
|---|---|---|---|
| [design-audit-phase1.md](design-audit-phase1.md) | 記録 | 2026-09-10（統一作業の**前**） | special / deck から実測で抽出したデザインの現状と、基準候補・要判断・事故の3分類。**変更前の姿**なので、現在の値としては読まないこと |
| [design-change-phase2.md](design-change-phase2.md) | 記録 | 2026-09-10 | 何を・何から何に・なぜ変えたかの対応表。カスケードレイヤーの前提、`.hidden` を残した理由、exam 適用時の申し送り10件 |
| [design-change-phase3.md](design-change-phase3.md) | 記録 | 2026-09-10 | Phase 3 提案のうち承認された7件の実施記録。共通部品の追加、絞り込みの実装変更、人物列のクラス化、読み込み失敗時の案内 |
| [design-proposals-phase3.md](design-proposals-phase3.md) | 課題 | 2026-09-10 | 追加改善の提案15件（優先度順）。着手・保留の状態はこの文書側で更新する |

## デザインの「今の正」はどこにあるか

文書ではなく**コードにある**。

| 知りたいこと | 見る場所 |
|---|---|
| 使ってよい色・余白・文字サイズ・角丸・影 | [`css/tokens.css`](../css/tokens.css) の `:root`。値の隣に用途をコメントしてある |
| 共通部品（ボタン・入力欄・バッジ・カード） | [`css/common.css`](../css/common.css) |
| 画面の骨格（ステップのタブ・FAB・引き出し・ダイアログ） | [`css/shell.css`](../css/shell.css)。special.html と exam.html が読む |
| 共通部品の見た目と状態（hover / focus / disabled / selected） | [`css/styleguide.html`](../css/styleguide.html) をブラウザで開く。`tokens.css` と `common.css` だけを読み込む確認専用ファイル |
| ツールごとの差別化（アクセント色） | 各HTMLの `<style>` にある `:root` の6変数 |
| 壊していないかの確認方法 | [`tests/visual/README.md`](../../tests/visual/README.md) |

## 運用

- **記録は書き換えない。** 状況が変わったら新しい文書を足し、この索引の「時点」で新旧を示す。
- **基準（`tokens.css` / `common.css` / `shell.css` / `styleguide.html`）は更新する。** 版は3ファイルで1つ。
  `tokens.css` の `--common-css-version`・`common.css` の `--uma-components-css-version`・`shell.css` の
  `--uma-shell-css-version` を同じ文字列に上げ、各HTMLの `?v=`（読む分すべて）と `EXPECTED_COMMON_CSS_VERSION` も
  揃える（`npm run test:verify` が一致を確認する）。
- **課題は消化したら更新する。** 提案文書を「やり残しの唯一の置き場」にしておくと、
  別セッションで再開したときに何が残っているかが分かる。
