#!/usr/bin/env bash
# ローカルDB用のマンホールシード（supabase/seed/02_manhole.sql）を
# data.pokefuta.com の最新 pokefuta.ndjson から再生成する。
# CLI のシード実行は search_path が空のため、PostGIS 関数はスキーマ修飾が必要。
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

python3 "$repo_root/tools/generate_manhole_sql.py" \
  | sed 's/ST_GeogFromText(/extensions.ST_GeogFromText(/g' \
  > "$repo_root/supabase/seed/02_manhole.sql"

echo "regenerated supabase/seed/02_manhole.sql ($(grep -c 'INSERT INTO' "$repo_root/supabase/seed/02_manhole.sql") manholes)"
echo "適用するには: npx supabase db reset"
