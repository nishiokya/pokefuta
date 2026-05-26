# Claude Code スラッシュコマンド

このプロジェクトで使える Claude Code のカスタムスラッシュコマンド一覧です。
コマンド定義は `.claude/commands/` に置かれています。

---

## `/export-photos`

**定義ファイル:** `.claude/commands/export-photos.md`

Supabase の `photo` テーブルからマンホールIDごとの最新公開写真を取得し、
`public/data/latest-manhole-photos.json` を生成します。

### 何をするか

1. `.env.local` から環境変数を読み込む
2. `tools/export_latest_manhole_photos.py` を実行する
3. 取得件数とファイルパスを表示する
4. 生成された JSON の先頭数行（`generated_at`・`count`）を表示して確認する

### 前提条件

`.env.local` に以下が設定されていること。

| 変数 | 必須 | 備考 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 必須 | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 推奨 | 公開写真のみ取得するため anon key で足りる |
| `SUPABASE_SERVICE_ROLE_KEY` | 任意 | 設定されていれば優先使用。`placeholder_*` の場合は無視される |
| `R2_PUBLIC_URL` | 必須 | 画像 URL のベース（例: `https://xxxxx.r2.cloudflarestorage.com`） |
| `R2_BUCKET` | 必須 | R2 バケット名（例: `image`） |

### 出力

```
public/data/latest-manhole-photos.json
```

スキーマの詳細は [`tools/README.md`](../tools/README.md) を参照してください。

### 使い方

Claude Code のチャット欄で入力するだけです。

```
/export-photos
```

生成した JSON は `pokefuta-tracker` リポジトリに手動でコピーして使用します。
