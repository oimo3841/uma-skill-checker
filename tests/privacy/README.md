# tests/privacy/ — 個人情報の混入を機械で止める

このリポジトリは**公開**（GitHub Pages で配信中）。追跡中のファイルに、おいもさんの
端末のパスやメールアドレスが紛れ込んだまま push されるのを止めるための検査。

```bash
npm run check:privacy     # 単体で回す
npm run test:verify       # 納品前チェックの §7 からも呼ばれる（ここが落ちたら push しない）
```

## 何を見るか

| 規則 | 検出するもの |
|---|---|
| `win-users` | `\Users\` を含む Windows のパス |
| `win-drive` | `C:\`〜`Z:\` のドライブ文字 |
| `unix-users` | `/Users/`（`C:/Users/...` もここで当たる） |
| `unix-home` | `/home/` |
| `mydrive` | Google ドライブの同期フォルダ名 |
| `email` | メールアドレス（許可リストにあるものを除く） |
| `assets-root` | 素材フォルダの root パスそのもの（区切り文字と大小の違いは吸収する） |
| `assets-root-name` | 素材フォルダ名（root の末尾の要素） |

加えて、**`.skillset-assets.json` が追跡対象に入っていないこと**と、
**`.gitignore` にその除外規則があること**を確認する。

## コミットメッセージも見る

B節ルール11で、`tests/` 配下だけの変更は確認なしで push するようになった。
Claude Code が書いたコミットメッセージが**人の目を通らずに公開される**ので、
**push しようとしている範囲（`origin/main..HEAD`）のメッセージ全文**（件名＋本文＋トレーラ）を、
ファイルの中身と**同じ7規則**で検査する。メッセージ専用の規則は持たない（規則を増やすと偽陽性の設計が崩れる）。

```bash
node tests/privacy/check-privacy.mjs                 # 既定: origin/main..HEAD（これから push する範囲）
node tests/privacy/check-privacy.mjs --commits=all   # 全履歴。監査のやり直し用
node tests/privacy/check-privacy.mjs --commits=v1..HEAD
```

- `Co-Authored-By: … <noreply@anthropic.com>` のトレーラは、許可リストの noreply で通る。
- `origin/main` が無い環境（remote 未設定の clone）では範囲が決められないので、その旨を出して飛ばす（落とさない）。
- **未pushのコミットで検出したら、免除せず `git commit --amend` でメッセージを直す。**
  push 済みで直せないものだけ `allowlist.json` の `exceptions` に登録する。`file` は
  `"commit:<sha>"`（そのコミットだけ。sha の先頭7桁以上）か `"commit-message"`（どのコミットでも。
  検出文字列で照合）。push 済みなら sha は変わらない（`--force` を使わない運用）ので前者を使う。
- 導入時（24セッション目）、全履歴 236 件のメッセージに対して回した。22セッション目の人手の監査
  （`Handoffメモ/privacy-audit-2026-09-12.md` 追補-1・235件）の範囲は検出 0 件で一致。
  監査の後に積まれた 1 件（23セッション目の `6cc192a`）は、メッセージ本文が規則の名前として
  「マイドライブ」と書いていたので当たった（パスではない。push 済みなので `commit:<sha>` で免除）。
  **コミットメッセージには規則の名前（検出する文字列そのもの）を書かない。**

## 偽陽性を出さないための設計（ここを緩めない）

22セッション目の人手の監査では、部分一致に頼ったせいで `confu`（`CHAR_CONFUSION_MAP` 等）で
**164件**、`token`（デザイントークン）で**457件**の偽陽性が出た。
**警告が出たら push を止める仕組みなので、偽陽性が出る設計では機能しない**
（狼少年になって誰も見なくなる）。そのため:

1. **ユーザー名・端末名・単語の部分一致は一切見ない。** 見るのは「その形でしか現れないもの」だけ。
   パスの区切り記号を含む形、メールアドレスの `@` とTLD、root パスの完全一致。
2. **ドライブ文字は直前が英数字・アンダースコアでないことを必須にする。**
   これが無いと `GOLD_MIN_G: 150` や `TAB_GREEN_MIN_G: 140` が `G:` として当たる（実測）。
3. **例外は `allowlist.json` に理由つきで登録する。黙って除外しない。**
   免除したものは実行のたびに `[免除]` として出るので、放置に気付ける。

導入時、追跡中の**63ファイル全件に対して検出0件**を確認した。
同時に、次の形は**当たらない**ことも確認した:
`GOLD_MIN_G: 150` / `TUNING: SKILLSET_TUNING` / `CHAR_CONFUSION_MAP` / `tokens.css` /
`https://example.com/home-page/` / `playwright@1.47.0` / `sha512-…` / `{ a:/x/ }` /
`case 'x': /* … */` / `Uma Tools` / `Google Chrome`。

## 実際のパスをこのディレクトリに書かない

素材フォルダの root は、`tests/skillset/lib/assets.mjs` の `assetsRoot()` と同じ順序
（環境変数 `UMA_SKILLSET_ASSETS` → `.skillset-assets.json`）で**実行時に読む**。
`check-privacy.mjs` にも `allowlist.json` にも実際のパスは1文字も書かない。
検出したときも**値は出力しない**（`(素材フォルダの絶対パス)` とだけ出す）。

同じ理由で、**許可するメールアドレスのうち、コミットの author に使っているものは
git から実行時に取る**（`allowCommitAuthors`）。すでにコミットのメタデータとして公開済みで、
公開されていて問題ないと判断済みのものだけが対象になる。
`allowlist.json` に直接書いてあるのは、個人に結びつかない noreply の2件だけ。

## 自分自身の扱い

`check-privacy.mjs` と `allowlist.json` と `README.md`（このファイル）は、
**パスの形の検査だけ**対象外にしてある（検査の定義・免除の記録・説明そのものを持つので、
構造上必ず当たるため）。対象外にしていることは実行のたびに出力する（黙って除外しない）。
**メールアドレスと素材フォルダの root の検査は、この3ファイルにも等しく効く**
（「検査の中に実パスを書いてしまった」を捕まえるのがいちばん大事なので、そこは外さない）。
