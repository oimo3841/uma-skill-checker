# tests/skillset/ — スキルセット画面OCRの検証ハーネス（フェーズ0）

ゲームの「スキルセット詳細」画面のスクリーンショットから、カードの文字を切り出して
OCRし、445種のマスターに照合する。目的は2つ:

- (a) スキルセットOCR機能の設計材料（後続フェーズで製品に入れる）
- (b) `js/common.js` の文字混同マップ（`CHAR_CONFUSION_MAP`）を底上げする材料

**フェーズ0では製品ファイル（各HTML・`js/common.js`・`uma-skill-deck*.js`・CSS）を
一切変更しない。** ここにあるのはツールとテストだけ。

## 大事な線引き — 動画は検証専用

画面収録からフレームを抜く道具がここにあるが、**製品の入力は静止画のまま**。
動画対応を製品に入れることは決まっていない。理由:

- ブラウザで動画を扱うと、モーションブラー・フレーム選別・WebCodecs の対応状況
  （Safari/iOS は 26 以降）・HEVC の `.mov` を他環境で開けるか・スマホのメモリ、
  といった問題が一度に増える
- 一方この用途では、動画の最大の利点（画像結合が要らなくなる）が**そもそも効かない**。
  欲しいのは「スキルIDの集合」なので、各画像から完全に見えているカードだけを読み、
  全画像の結果を和集合にすれば済む
- 検証素材の収集に限れば動画が明確に有利（撮り漏れが原理的に起きない）。
  処理するのはローカルPCで、ブラウザではなく Node + Chrome なので上の問題が当たらない

**したがって、動画を扱うコードは `tests/` にだけ置き、製品ファイルからは参照しない。**

## 素材の置き場所（リポジトリの外）

ゲームのスクリーンショットは公開リポジトリに入れない（B節ルール8・10補足）。
素材はGoogleドライブの同期フォルダに置き、**そのパスはリポジトリのどのファイルにも書かない**。
次のどちらかで場所を教える:

1. 環境変数 `UMA_SKILLSET_ASSETS` に絶対パス
2. リポジトリ直下の `.skillset-assets.json`（`.gitignore` 済み）に `{"root": "<絶対パス>"}`

素材フォルダの構成:

```
<素材フォルダ>/
  images/<撮影セット名>/*.png     … おいもさんが置くスクリーンショット
  videos/<撮影セット名>/*.mp4     … おいもさんが置く画面収録
  frames/<撮影セット名>/          … 動画から抜いた鮮明なフレーム（生成物）
  frames-blurry/<撮影セット名>/   … ブレたフレーム＝実劣化サンプル（生成物）
  crops/<切り出し名>/             … カードの文字領域のPNGと index.json（生成物）
  truth/<セット名>.json           … 確定した正解。.draft.json は案、.overrides.json は目視で決めた分
  reference/skill-names.json      … 正解の案づくりに使うスキル名の辞書（名前だけ。内部IDは持たない）
  reports/                        … 集計結果
```

## 使い方

```bash
# 1. スクリーンショットからカードの文字領域を切り出す
node tests/skillset/run-extract-cards.mjs --set=2026-09-11a

# 2. 因子画面とスキルセット画面の「文字の高さ」を実測する（人工劣化の縮小率の根拠）
node tests/skillset/measure-text-height.mjs --factors="<因子画面の実画像のフォルダ>"

# 3. 正解の案づくりに使うスキル名の辞書を用意する（名前の列だけを取り出す）
node tests/skillset/build-name-lexicon.mjs --xlsx="<スキルリスト.xlsx>"

# 4. OCRして5分類に振り分ける（条件は lib/conditions.mjs）
node tests/skillset/run-ocr-crops.mjs --set=2026-09-11a                      # 全条件
node tests/skillset/run-ocr-crops.mjs --set=2026-09-11a --conditions=sharp   # 条件を指定

# 5. 正解の案と、確認用ページを作る
node tests/skillset/build-truth.mjs --set=2026-09-11a --write-truth
#    → reports/review-<セット>.html をブラウザで開いて確認・修正し、truth/<セット>.json に保存

# 6. 誤読を1文字ずつ集計し、読み替え候補を出す
node tests/skillset/tally-confusions.mjs --set=2026-09-11a

# 7. 読み替え候補を検査する（衝突＋手元のOCR結果の再照合）
node tests/skillset/check-confusion-candidates.mjs --from-report --min=8 --combined

# 8. 網羅状況（まだ撮っていないスキルの一覧）
node tests/skillset/report-coverage.mjs
```

動画（検証専用）:

```bash
node tests/skillset/extract-video-frames.mjs --set=2026-09-12a --probe   # 長さ・解像度・復号できるか
node tests/skillset/extract-video-frames.mjs --set=2026-09-12a --fps=12
node tests/skillset/run-extract-cards.mjs --kind=frames --set=2026-09-12a
node tests/skillset/run-extract-cards.mjs --kind=frames-blurry --set=2026-09-12a --out=2026-09-12a-blurry
node tests/skillset/build-blurry-truth.mjs --set=2026-09-12a             # 実劣化の正解と誤り検出
```

`probe-scrollbar.mjs` は、一覧の右端のスクロールバーのつまみを見つけられるかを
端末ごとに確かめるための道具。

## 仕組み

- **カードの切り出し** `lib/skillset-cards.js`
  ImageData を受け取って矩形を返すだけの純粋な関数の集まり。DOM も fetch も使わない
  （後続フェーズで製品にそのまま持ち込めるように）。座標の決め打ちをせず、
  カードの地の色の連結成分と、その幅・高さの**中央値**で「完全に見えているカード」を選ぶ。
  しきい値は `SkillsetCards.TUNING` に名前付きで置いてある。
- **ブラウザの使い方** `lib/browser.mjs` / `lib/ocr.mjs`
  Node には PNG デコーダも canvas も無いので、既存の tests/ocr と同じくヘッドレス
  ブラウザの中で処理する。OCR は `fixtures/ocr-host.html` を開き、special.html と
  同じ版の Tesseract.js（CDN）と `js/common.js` を読む。**照合ロジックは複製しない。**
- **Node から common.js を使う** `lib/common-in-node.mjs`
  `js/common.js` は読み込み時に関数と定数を定義するだけ（DOM に触るのは関数の中だけ）
  なので、`vm` で評価すればブラウザ無しで正規化・距離判定を呼べる。
  文字混同マップやしきい値をこのリポジトリで二重に持たないための仕組み。
- **製品と同じ前処理** `lib/ocr.mjs` の `__prepare`
  製品は「行の外接矩形で切る → `ROW_TARGET_HEIGHT`(56) まで拡大 → 白地に余白付きで並べる
  → `preprocessVariants()` の3変種をOCR」という順で読む。カード1枚＝1行なので、
  同じ手順を1行ぶんだけ行う。前処理なしとの差は `--conditions=sharp-raw,sharp` で測れる。

## ネットワークとブラウザ

- OCRエンジン（tesseract.js）と日本語辞書は CDN から取るため**ネットワーク接続が必要**。
- 動画の復号には、この環境では **Google Chrome**（`channel: 'chrome'`）が要る。
  受け取った iPhone の画面収録は HEVC(hvc1) で、Playwright 同梱の Chromium は
  proprietary codec を持たない。同梱 Chromium でも「読めた」ように見える
  （音声だけ読めて `loadeddata` が飛ぶ）ので、`videoWidth` が 0 かどうかで判定している。
- ffmpeg は使っていない（この環境に入っていないため）。
