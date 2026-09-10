# 外観まわりの確認ハーネス

見た目を触ったときに「操作を壊していないか」「納品物として整合しているか」を、
目視ではなく機械で確認するための一式。Playwright で実際にページを描画して調べる。

## 使い方

```
npm run test:visual          # 機能スモークテスト（33項目）
npm run test:verify          # 納品前チェック（版数・セレクタ資産・構文）
npm run test:visual:capture -- before            # 変更前のスクリーンショット
npm run test:visual:capture -- after --compare   # 変更後＋前後比較画像
```

スクリーンショットの出力先は `output/visual/` で、`.gitignore` 済み。

## なぜ必要か

- **UmaSkill Deck は保存データが無いと画面がほぼ空**になる。空の画面を見ても、
  比較シートやテンプレート編集が壊れていないかは分からない。
  `lib/fixtures.mjs` が代表データ（テンプレート2件・比較シート1件・候補3人・★入力済み）を仕込む。
- **UmaStar OCR は画像を通さないと結果表が出ない。** OCRを回さずに済むよう、
  合成した「OCRの行」を**本物の照合関数**に通して結果を作る。表示だけの張りぼてにはしない。
- **外観の変更で壊れるのは、たいてい JS がクラスを付け外ししている箇所**。
  絞り込みボタン・タブ・無効列・hidden の付け外しを重点的に通している。

## 各スクリプト

| ファイル | 役割 |
|---|---|
| `lib/serve.mjs` | テスト用の静的サーバ。`file://` だと JSON の fetch が CORS で落ちるため |
| `lib/fixtures.mjs` | 代表データと、ページを開く／結果表を作るヘルパー |
| `run-smoke.mjs` | 機能スモークテスト。版ずれ警告とCDN遮断時の案内が出ることも確認する |
| `run-verify.mjs` | 納品前チェック。**リポジトリ実ファイルだけ**を見る |
| `run-capture.mjs` | スクリーンショットと前後比較画像 |

## run-verify.mjs が見ているもの

1. 版数の3点一致（`--common-css-version` / 各HTMLの `?v=` / `EXPECTED_COMMON_CSS_VERSION`）
2. 変更してはいけないファイル（`index.html` / `exam.html` / `js/common.js` / `js/stitch.js`）が未変更か
3. `id` と `data-*` が1つも失われていないか（HEAD と比較）
4. 消した class を JS が名前で掴んでいないか
   - `classList` / `className=` … そのページの JS でのみ危険
   - `querySelector` 系 … 文書全体を探すのでファイル横断で危険
5. JS の構文（HTML埋め込みの `<script>` も抽出して確認）
6. `common.css` に `!important` が増えていないか（詳細度で解決する方針のため）

4 で名前が挙がったものは、**必ず実物を見て判断すること**。
JS が自分で作った要素に同じクラスを付けているだけ、という誤検知もある。

## 注意

- `run-verify.mjs` は `git show HEAD:` で変更前と比較する。**コミット後に走らせても意味がない**（差分が消える）。
- Playwright のブラウザが未取得なら `npx playwright install chromium` が必要。
