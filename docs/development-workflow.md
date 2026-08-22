# Development workflow

この文書は、Mac・K11・Codex・Claude Codeで同じコードと知識を使い、安全かつ効率的に作業するための正本です。

## 基本方針

- 各マシンに基準 clone を1つ置く。
- 基準 clone の `main` は常に clean に保ち、直接編集しない。
- タスクごとに、最新の `origin/main` から専用 worktree とブランチを作る。
- 必須ルールとプロジェクト知識はGitで共有する。ローカル memory や過去のチャットだけを正本にしない。
- dirty、behind、diverged の状態を自動で stash・reset・上書きしない。作業を止めて内容を確認する。

## タスク開始前

基準 clone で次を実行する。

```bash
git status --short
git fetch origin --prune
git switch main
git merge --ff-only origin/main
git rev-list --left-right --count main...origin/main
```

開始条件:

- `git status --short` が空である。
- `main...origin/main` が `0 0` である。
- `AGENTS.md` と、タスクに関係する `docs/` の文書を確認した。

条件を満たさない場合は、新しい調査や実装を始めない。未コミット変更は所有者と目的を確認し、必要なら先に退避用ブランチへ保存する。

## タスク用 worktree

例:

```bash
git worktree add ../pokefuta-worktrees/<task-name> \
  -b codex/<task-name> origin/main
```

- 1タスクにつき1worktree・1ブランチを使う。
- ブランチ名は目的が分かる名前にする。
- 別タスクの未コミット変更をworktreeへ持ち込まない。
- Codexアプリのmanaged worktreeを使う場合も、作成前に基準 clone の `main` を更新する。
- `.env.local` など無視対象のローカル設定が必要なら、秘密をコミットせず `.worktreeinclude` の利用を検討する。

## Mac・K11間の引き継ぎ

- マシンを移る前に、作業ブランチをcommitしてpushする。未完成ならDraft PRを利用する。
- 次のマシンでは同じブランチをremoteから取得し、新しいworktreeで再開する。
- 調査結果、除外した仮説、残作業、確認コマンドはPR本文または `docs/inbox/` のhandoff文書に残す。
- ローカル memory、ローカル検索index、チャット履歴が別マシンにも存在するとは仮定しない。

## ナレッジの置き場所

| 内容 | 保存先 |
|---|---|
| 常に守る短い規則 | `AGENTS.md` |
| アーキテクチャ、計測仕様、運用手順 | `docs/` |
| 繰り返す調査・検証手順 | `.agents/skills/<name>/SKILL.md` と付属script |
| 個別障害の証拠とhandoff | `docs/inbox/YYYY-MM-DD-<topic>.md` またはPR |
| 個人的・全リポジトリ共通の好み | ローカル memory |

`AGENTS.md` を詳細な知識庫にしない。詳細は `docs/` に置き、`AGENTS.md` には参照条件と守るべき不変条件だけを書く。

## Codex budgetを抑える調査手順

1. `rg`、Git、テスト、DB/API用CLIなどのローカル処理で証拠を集める。
2. 大きなログ、JSON、diff、ブラウザsnapshotはローカルで絞り込み、必要な行と集計だけをモデルへ渡す。
3. 最初は必要十分な小さいモデル・reasoningで切り分け、未解決の複雑な判断だけ上位モデルへ渡す。
4. 長いチャットを継続する代わりに、1〜2KB程度のhandoffへ既知事実・除外済み仮説・次の一手をまとめ、新しいthreadで再開する。
5. Claude Codeからレビューを依頼するときは、会話全文ではなく次を渡す。
   - base/head SHA
   - 変更ファイルと `git diff --stat`
   - 期待する挙動
   - 既知の制約
   - 確認してほしい論点とテスト

## タスク終了時

- 必要なテスト、type-check、buildを実行する。
- 変更とhandoffをcommitしてpushする。
- PRに検証結果、未解決事項、運用上の注意を残す。
- worktreeを削除する前に、未コミット変更がなく、必要なcommitがremoteに存在することを確認する。
- タスクで得た再利用可能な知識を `AGENTS.md`、`docs/`、または `.agents/skills/` の適切な場所へ反映する。
