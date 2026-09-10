# 外観まわりの確認ハーネス

見た目を触ったときに「操作を壊していないか」「納品物として整合しているか」を、
目視ではなく機械で確認するための一式。Playwright で実際にページを描画して調べる。

## 使い方

```
npm run test:visual          # 機能スモークテスト（63項目）
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
- **比較シートの値タイルは「見た目そのものが操作」**なので、色と★の個数を機械で見張っている。
  ★の色は `css/common.css` の `--uma-star` / `--uma-star-empty` を参照していることまで確認する。
  生のhexを書き足すと値がズレても目視では気付けないため（F-19）。
  `opacity` が 1 のままであることも併せて見る（`position: sticky` を使うグリッド内で
  `opacity<1` を使うと重なり順が壊れるため）。
  なおタイルは `background-color` に transition を掛けている。値を変えた直後に
  `getComputedStyle` すると遷移前の色が返るので、**設定と読み取りは分けて待つこと。**
  同じ理由で、`page.click` の直後はカーソルが残るため hover 色を測ってしまう。
  平常時の色を測る前に `page.mouse.move(0, 0)` でカーソルを外す。

- **スキル名のフェードは文字数で決めていない**（フォントで実幅が変わるため）。
  `scrollWidth > clientWidth` の実測で `.is-truncated` を付けている。
  テストは「はみ出す名前だけに付いていること」を全行について突き合わせる。
  実測なので、フォントや `max-width` を変えると自動的に結果が変わる。

- **★の増減は Undo スタックに積んでいない**（仕様。`js/uma-skill-deck.js` の `setStar` のコメント参照）。
  スモークテストは「列削除→Undoで戻る」ことと「★のタップでは `undoCount()` が増えない」ことの
  両方を見ている。後者は、うっかり `pushUndo` を足すと削除のUndoが押し出される事故を防ぐため。

- **「手動修正済み」の赤枠は、原本値（`ocrCells`）と現在値（`cells`）のズレだけで決まる。**
  `lib/fixtures.mjs` は「候補 c_a だけをOCRに通し、うち2セルを食い違わせた」状態を仕込んでいる
  （`EDITED_CELLS` がその2セル）。テストは次を見ている:
  枠が付くのがその2セルだけであること、OCR未実施の列（c_b / c_c）には1つも付かないこと、
  値0でも原本値と違えば付くこと、元のOCR値に戻すと消えること、
  `ocrCells` を持たない古いデータでも付かず落ちないこと、列削除→Undoで原本値も一緒に戻ること。
  枠は `border` ではなく inset の `box-shadow` で描く（borderだとタイルの内寸が変わり★の位置がずれる）。
  **`applyStarAssignments` は既存の値を上書きするとき確認ダイアログを出す。**
  Playwright は既定でダイアログを打ち消すので、テストから呼ぶときは `window.confirm` を一時的に差し替える。

- **CSS Grid では「列の数」と「1行あたりに出すセルの数」が必ず一致していること。**
  食い違うとセルが1つずつ隣の列へ流れ込み、行が重なって見える。
  比較シートは候補0人のときだけ列構成が変わる（`repeat()` は0を受け付けないため
  `.deck-grid--no-cand` で列定義ごと差し替えている）。この分岐を踏む
  「候補を全員削除→0人」「そこから追加し直す」の2経路をテストで通している。
  目視では気付きにくく、実際に候補1人→0人で崩れた実績がある。

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

1. 版数の一致（`--common-css-version` / 各HTMLの `?v=` / `EXPECTED_COMMON_CSS_VERSION`）。
   special.html の**引き出しパネルの iframe `uma-skill-deck.html?v=`** も含む（deck.js の版に合わせる決まりだが、
   <script src> と違って目に付きにくく、実際に取り残されたことがある）
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
