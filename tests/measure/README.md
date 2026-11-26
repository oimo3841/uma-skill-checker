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
- ロック: 測りは重い。ほかの test:visual が動いていないことを確かめて回す（`pv.cjs` は 20 秒続けて空くまで待つ）。ロックを取る包み（`output/scratch/<作業>/locked.mjs` の形。`tests/visual/lib/lock.mjs` を使う）の中から回すときは `PV_LOCKED=1`。
- 選び方（`select-jobs.mjs`）: 変えたファイルの差から名前（クラス・id・ハイフンつきの語）を拾い、地図でその名前が見える組を選ぶ。special.html だけの変更は UmaStar の組だけ・exam.html だけは UmaExam の組だけ。css/tokens.css の変更は全部の組。各ページの代表の組（地図の reps）は毎回入れる。**push の前に1回だけ全部の組を測る。**
- 取りこぼしの確かめ: 全部の組の前後で差が出た組が、選んだ組にすべて入っているか（`compare.mjs --check`）。

## 待ち（waitFn）と失敗の記録（T219）

組の手順の `waitFn` は文字列で書く。**関数（`() => {…}`）なら `pv.cjs` が呼び、式ならその値を見る**（T219 より前は文字列をそのまま Playwright に渡していて関数が呼ばれず、待たずに進んでいた。T217-check-1）。

- 上限は手順の `waitMs`（無ければ 300秒）。上限に達したとき・条件が例外を投げたときは、**その組を失敗にする**（結果の `fail` と `failWidths`〔測るはずだった幅の全部〕。測った値は残さない。画面に「失敗 組の名前（幅 …）」と出し、残りの組は続ける。`compare.mjs` は「測れなかった組」に数える）。`pv.cjs` の終了コードは 0 のままなので、最後の行の「失敗 N」を見る。
- 条件に書く部品は、今の画面にあるもの。製品の変数（`stitchInProgress` など）の名前が変わると、条件が例外になって組が失敗する（黙って進まない）。

### 結合の10組が待つもの

10組の条件は同じ文字列（`jobs-base.json`）。次の3つがそろうまで待つ。

1. 処理中の印が下りた: `stitchInProgress`・`busyBtnId`（下の固定の欄の処理中のボタン）・UmaStar は `combinedInProgress` も。
2. 結合の結果の箱ができた: `#stitch-result-content` に子がある。
3. その中の画像（結合画像の `img`）がすべて読み込めた。

処理が終わったときに、結合の失敗の箱（`.stitch-err`）か OCR の失敗の欄（`#error-wrap`）が出ていたら、その場で失敗にする（失敗の画面は測らない）。

| 組 | 始める操作 | 待つ処理 | 待ったあとに開くもの（固定の秒数） |
|---|---|---|---|
| P-star-stitch | UmaStar `#stitch-btn`（OCR しない・3列） | 結合 | そのまま（引き出しの「結合画像」が自動で開く） |
| P-star-stitch-2col | 「2列」を選んで `#stitch-btn` | 結合（2列） | 同上 |
| P-star-stitch-set | `#stitch-btn` | 結合 | 「結合画像の設定」（`.stitch-set-btn`）を押す |
| P-star-stitch-setprod | 同上 | 結合 | 同上（今は P-star-stitch-set と手順が同じ。もとは見本の側の違い） |
| P-exam-stitch | UmaExam `#process-stitch-btn`（OCR＋結合） | OCR と結合 | `fabGoTo('stitch')` |
| P-exam-stitch-2col | `setStitchCols(2)` のあと `#process-stitch-btn` | OCR と結合（2列） | 同上 |
| P-exam-stitch-set | `#process-stitch-btn` | OCR と結合 | `fabGoTo('stitch')` →「結合画像の設定」を押す |
| P-exam-melop-result | めろっぷの拡張モードで `#process-stitch-btn` | OCR と結合（照合結果の表は結合の前にできる） | `fabGoTo('result')`（照合結果） |
| P-exam-melop-stitch | 同上 | OCR と結合 | `fabGoTo('stitch')` |
| P-exam-eff-stitch | 「効率で選ぶ」で `#process-stitch-btn` | OCR と結合 | `fabGoTo('stitch')` |

P-star-stitch と P-star-stitch-2col は、320px の測りに完了の知らせ「画像を結合しました」（約 2.5秒で消える）が入る（T219 の測りではライト・ダークの2回ずつで同じ）。時刻の境目にあるので、PC が遅いと入る・入らないが変わって 1〜2件の差になることがある。差がこの知らせだけなら揺れ。

### 画像の無い木

10組は `test-images/2026-09-15_3/` の png 6枚を使う（Git の管理外。worktree や `git archive` で取り出した木には README しか無い）。**測る前に、測る木へこのフォルダを写す。** 無いまま測ると、画像が 404 になって処理が失敗の画面で終わり、10組は「結合か OCR が失敗した画面」で失敗になる（以前は失敗の画面や途中の画面を黙って測っていた）。前と後を比べるときは、両方の木に同じ画像を置く。UmaExam の組の OCR は、エンジンを外から読み込むのでネットワークが要る。

## test:select とのつながり

`scripts/select-blocks.mjs` は、変えた入れ物のクラスが地図の `contains` にあれば、その中の部品の id も語として塊を探す（T212-H6 が `.eff-spare` を変えたとき、検査が id `eff-reset-btn` で測る微調整2B5 の取りこぼしの形）。見出し（帯）の角・影・幅を読む微調整2A1・2A2（blocks-20）は「寸法に敏感な塊」に入っている。
