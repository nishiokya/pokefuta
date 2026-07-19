This command is retired. The export script has moved to the `pokefuta-tracker` repository.

Tell the user:

- `tools/export_latest_manhole_photos.py` は 2026-07-19 に `pokefuta-tracker` の `apps/scraper/export_latest_manhole_photos.py` へ移管された（tracker PR #352）
- 現在は tracker の GitHub Actions `import-manhole-photos.yml`（毎日 05:30 JST）が自動実行しており、手動エクスポートは不要
- 手動で実行したい場合は tracker リポジトリ側で行う:
  `cd ~/projects/pokefuta-tracker && set -a && source .env.local && set +a && python3 apps/scraper/export_latest_manhole_photos.py`

Do not attempt to run `tools/export_latest_manhole_photos.py` in this repository — the file no longer exists.
