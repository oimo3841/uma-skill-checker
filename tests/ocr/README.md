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
npm run test:ocr -- --dict=deck+catalog       # 上の辞書に「追加カタログ」（data/*.json）を足す
npm run test:ocr -- --dict=deck+catalog --no-catalog-exact-only  # 追加カタログの後段の絞り込みを外す（調査用）
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

## 追加カタログ（シナリオ因子など）の照合

シナリオ因子のように「445種のマスターには載らないが、因子画面には出るもの」は
`data/*.json` に別カテゴリとして置いてある（C-29）。辞書名の末尾に **`+catalog`** を
付けると、そのフォルダの全カテゴリの名前を辞書に足す（ファイル名は列挙していないので、
カテゴリが増えればそのまま増える）。

**製品と同じ判定にするため、後段の絞り込みを既定で掛ける。** `exam.html` は照合のあと
`applyScenarioFactorStrictMatch()` で、次のどちらかを満たすものだけに絞る（C-43）。

1. どれかの行にその名前が**そのまま入っている**（完全一致）
2. どれかの行が、カタログの中で**その名前にだけ**距離1以内で近い（同じ距離で2つ以上並んだら採らない）

シナリオ名どうしは1〜2文字しか違わず（**24種の最小距離は2**）、あいまい一致にそのまま任せると
互いに化けるため。許す「ずれ」の上限は**カタログから計算する**（`floor(最小距離/2)`、さらに1で頭打ち）。
ハーネスも同じ式・同じ判定を掛け、落ちたぶんを `後段の完全一致で落ちた追加カタログ` として
表示する（`result.json` の `catalogDropped`。`catalogMinDistance` / `catalogNearLimit` も残る）。
**製品側とハーネス側で判定が二重に書いてあるので、片方を変えたらもう片方も直すこと。**

`--no-catalog-exact-only` を付けると絞り込みを外せる。「あいまい一致ではどこまで届いているか」を
見るための調査用で、**製品の挙動ではない**。

出力の `うち追加カタログ(N件)` は、検出スキルのうちカタログ由来のものの一覧
（`result.json` の `catalogDetected`）。スキルの検出結果には影響しない。

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
  画像に写っていても辞書に無いもの(レース名・適性因子など)は
  検出されなくて正常。取りこぼしを数えるときは、まず正解リストを辞書で
  絞り込んでから比較すること。
  **シナリオ因子は `+catalog` を付ければ照合できる**（付けないと、写っていても出ない。
  47セッション目に、これを忘れて「取りこぼしは無い」と報告した取り違えがあった）。
- `--stitched` の結果が素の結果より少ない場合、原因はOCRではなく画像結合側にある
  可能性が高い。`npm run test:stitch` の結合結果画像と突き合わせて確認する。
- 2文字のスキル名は `allowedDistance()`(js/common.js)が距離0＝完全一致を要求するため、
  1文字でも誤読すると検出されない。`result.json` の `rawLines` に誤読文字列が
  出ていれば、`--errdict` で読み替えが効くかを確認できる。
