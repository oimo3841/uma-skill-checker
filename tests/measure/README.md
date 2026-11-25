# 測りの道具（T216・B4）

デザインの直しの前後で、UmaStar・UmaExam などの画面を同じ道具で測って比べる。T212 の `pv9.cjs` などを tests/ に入れ、「変えた所に当たる組だけを測る」選び方を足した。

## 組と部品の地図

- 組（`jobs-base.json`）＝ UmaStar・UmaExam 124組。`mk-spec.mjs` が card-event-input 4組・旧 Deck 1組を足す（録画 8本は `--rec`・ライトだけ）。幅は 320・360・390・430・1280px、テーマはライト・ダーク。
- **部品の地図**（`parts-map.json`）＝組ごとに、画面に見えているクラス（`.x`）・id（`#x`）と、「クラス → その中にある id」（入れ物のクラスを変えたとき、中の部品を測る組・塊を選ぶため）。測りに `--parts` を付けると、`pv.cjs` が各幅の部品を集める。
- 地図の作り直し: 全部の組を `--parts` つきで測り、`node tests/measure/build-parts-map.mjs <結果.json>...`。部品が増える変更（新しい画面・状態）のあとに作り直す。

## 使い方（作業フォルダの根で）

```
node tests/measure/mk-spec.mjs <label> <light|dark> [--names=P-star-1,… | --names-file=<ファイル>] [--widths=390,1280] [--shots] [--rec] [--parts]
node tests/measure/pv.cjs output/scratch/measure/spec-<label>-<theme>.json output/scratch/measure/res-<label>-<theme>.json
node tests/measure/select-jobs.mjs [--from=<rev>] [--to=<rev>] [--out=<ファイル>] [--all]
node tests/measure/compare.mjs <前.json> <後.json> [--check=<選んだ組の一覧>]
```

- 別の版の木を測るとき: `git archive <rev> | tar -x -C <フォルダ>` して `PV_ROOT=<フォルダ>` を付ける。
- ロック: 測りは重い。ほかの test:visual が動いていないことを確かめて回す（`pv.cjs` は 20 秒続けて空くまで待つ）。ロックを取る包み（`output/scratch/t216/locked.mjs` の形）の中から回すときは `PV_LOCKED=1`。
- 選び方（`select-jobs.mjs`）: 変えたファイルの差から名前（クラス・id・ハイフンつきの語）を拾い、地図でその名前が見える組を選ぶ。special.html だけの変更は UmaStar の組だけ・exam.html だけは UmaExam の組だけ。css/tokens.css の変更は全部の組。各ページの代表の組（地図の reps）は毎回入れる。**push の前に1回だけ全部の組を測る。**
- 取りこぼしの確かめ: 全部の組の前後で差が出た組が、選んだ組にすべて入っているか（`compare.mjs --check`）。

## test:select とのつながり

`scripts/select-blocks.mjs` は、変えた入れ物のクラスが地図の `contains` にあれば、その中の部品の id も語として塊を探す（T212-H6 が `.eff-spare` を変えたとき、検査が id `eff-reset-btn` で測る微調整2B5 の取りこぼしの形）。見出し（帯）の角・影・幅を読む微調整2A1・2A2（blocks-20）は「寸法に敏感な塊」に入っている。
