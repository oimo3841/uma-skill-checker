# tests/ocr/ — OCR 自動テストハーネス

`exam.html` / `special.html` をヘッドレスブラウザで開き、中の `processPersonImages()` と
`matchAllSkillsWithStars()` をそのまま呼び出す(ロジックの複製はしていないので、
HTML側や `js/common.js` の修正がそのままテスト結果に反映される)。

テスト画像は画像結合ハーネスと同じ `test-images/` を使う。1サブフォルダ = 1人分。
構成ルールは `test-images/README.md` を参照。

## 実行方法

```bash
npm run test:ocr                              # exam.html / 組み込み133種（--dict=exam が既定）/ 元画像
npm run test:ocr -- --stitched                # 先に stitchOnePerson() で結合してからOCR
npm run test:ocr -- --page=special            # special.html を対象にする
npm run test:ocr -- --dict=exam               # exam.html の組み込み133種を照合辞書に（npm script の既定）
npm run test:ocr -- --dict=deck               # uma-skill-deck-skills.json の全スキルを照合辞書に
npm run test:ocr -- --dict=page               # ページ側が起動時に持つ skillList をそのまま照合辞書に
npm run test:ocr -- --dict=連綿,存在感        # 指定したスキル名だけを照合辞書に
npm run test:ocr -- --expect=連綿             # 検出されるべきスキルを指定して合否判定（未検出なら exit 1）
npm run test:ocr -- --errdict=連締=連綿       # special.html の「読み替え辞書」と同じ補正を効かせる
```

オプションは組み合わせられる。同じオプションを2回渡したときは**後のものが勝つ**ので、
npm script が付けている既定の `--dict=exam` はコマンドラインで上書きできる。
実機で報告された取りこぼしを再現する例:

```bash
npm run test:ocr -- --page=special --dict=deck --expect=連綿
```

`--dict=exam` を既定にしている理由: exam.html の既定が新UI（UmaSkill Deck から対象スキルセットを
選ぶ）になると、`file://` ではマスターが読めず、ページ側の `skillList` が空か組み込みサンプル3件に
なる。その状態で「ページ既定」を使うと**テストが黙って別の対象で走る**ため、技能試験の133種で
照合したいことを常に明示する（`--dict=exam` は実際に exam.html を開いて `EXAM_SKILL_LIST` から
名前を取り出す。ソースを正規表現で拾ってはいない）。

初回のみ `npm install` と `npx playwright install chromium` が必要。
OCRエンジン(tesseract.js)と日本語辞書は CDN から取得するため**ネットワーク接続が必要**。

## 文字正規化の安全確認

```bash
npm run test:norm
```

`js/common.js` の `CHAR_CONFUSION_MAP` / `HOMOGLYPH_MAP` は、OCRの読み取り結果だけでなく
**スキル名そのものにも**適用される。誤読対策のつもりで足した1文字が別々のスキル名を
同じ文字列に潰すと恒久的な誤検出になるため、マップに追記したとき・スキルマスタを
更新したときは必ずこれを走らせる（衝突があれば exit 1）。

## 出力

コンソールに検出スキル・★・診断ログ・エラーを表示し、
`output/ocr/<ケース名>/` に以下を保存する。

- `result.json` … 検出スキル一覧、★、**OCRが実際に読んだ生テキスト(`rawLines`)**、
  スキップ理由、診断ログ、ページ内エラー
- `*.png` … OCRエンジンに実際に渡した整形画像(行を切り出して積み直したもの)

`--expect` で未検出があった場合は、その名前に近いOCR生行を自動で並べて表示する。
「読めていないのか、読めているが照合で弾かれているのか」がここで切り分けられる。

## 判定の見方

- `npm run test:ocr` の既定の照合対象は `exam.html` の `EXAM_SKILL_LIST` の**133種のみ**（`--dict=exam`）。
  `--dict=deck` を付けると `uma-skill-deck-skills.json` の全件（445種）になる。
  画像に写っていても辞書に無いもの(レース名・因子・シナリオ因子など)は
  検出されなくて正常。取りこぼしを数えるときは、まず正解リストを辞書で
  絞り込んでから比較すること。
- `--stitched` の結果が素の結果より少ない場合、原因はOCRではなく画像結合側にある
  可能性が高い。`npm run test:stitch` の結合結果画像と突き合わせて確認する。
- 2文字のスキル名は `allowedDistance()`(js/common.js)が距離0＝完全一致を要求するため、
  1文字でも誤読すると検出されない。`result.json` の `rawLines` に誤読文字列が
  出ていれば、`--errdict` で読み替えが効くかを確認できる。
