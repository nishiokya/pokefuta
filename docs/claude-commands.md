# Claude Code スラッシュコマンド

このプロジェクトで使える Claude Code のカスタムスラッシュコマンド一覧です。
コマンド定義は `.claude/commands/` に置かれています。

---

## `/export-photos`（廃止）

**定義ファイル:** `.claude/commands/export-photos.md`

エクスポートスクリプトは 2026-07-19 に `pokefuta-tracker` リポジトリの
`apps/scraper/export_latest_manhole_photos.py` へ移管されました（tracker PR #352）。

現在は tracker 側の GitHub Actions `import-manhole-photos.yml`（毎日 05:30 JST）が
Supabase からの取得〜写真取込〜デプロイまでを自動実行しており、
このリポジトリでの手動エクスポートと手動コピーは不要です。

手動で実行したい場合は tracker リポジトリ側で行ってください。
