#!/usr/bin/env bash
# /activity-check の site-stats JSON を Obsidian の推移ノートに1行記録する。
#
#   curl -s http://localhost:3000/api/site-stats | tools/log-site-stats-to-obsidian.sh
#
# スナップショットの generated_at をキーにしているので、同じスナップショットで
# 何度実行しても行は増えない（既存行を上書きする）。
set -euo pipefail

NOTE="${POKEFUTA_STATS_NOTE:-$HOME/note/dev/pokefuta/log/pokefuta site-stats 推移.md}"

json=$(cat)
if ! printf '%s' "$json" | jq -e '.generated_at' >/dev/null 2>&1; then
  echo "site-stats JSON が不正（generated_at なし）のため記録しませんでした" >&2
  exit 1
fi

jst() {
  if [ -z "$1" ] || [ "$1" = "null" ]; then
    echo "-"
  else
    # GNU date（k11/WSL）。macOS の BSD date には -d が無いので node へ落とす。
    # ここが "-" に落ちると gen_jst が行のキーなので、全スナップショットが
    # 同じ行に上書きされて推移が消える。壊れても静かなので必ず両対応にする。
    TZ=Asia/Tokyo date -d "$1" '+%Y-%m-%d %H:%M' 2>/dev/null \
      || node -e 'const d=new Date(process.argv[1]);if(isNaN(d)){console.log("-");process.exit(0)}console.log(new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d).replace("T"," "))' "$1" 2>/dev/null \
      || echo "-"
  fi
}

IFS=$'\t' read -r generated latest_photo auth active users posts pub priv comments manholes mwp p7 p30 source <<<"$(
  printf '%s' "$json" | jq -r '[
    .generated_at,
    (.latest_photo_at // "null"),
    .auth_users, .active_users_7d, .users, .posts,
    (.public_posts // "N/A"), (.private_posts // "N/A"), (.manhole_comments // "N/A"),
    .manholes, .manholes_with_photos,
    .posts_last_7d, .posts_last_30d, .source
  ] | @tsv'
)"

gen_jst=$(jst "$generated")
photo_jst=$(jst "$latest_photo")
now=$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M')
row="| ${now} | ${gen_jst} | ${auth} | ${active} | ${users} | ${posts} | ${pub} | ${priv} | ${comments} | ${mwp} / ${manholes} | ${p7} | ${p30} | ${photo_jst} | ${source} |"

mkdir -p "$(dirname "$NOTE")"
if [ ! -f "$NOTE" ]; then
  cat > "$NOTE" <<'EOF'
---
type: metrics
tags: [pokefuta, site-stats, activity-check]
---

# pokefuta site-stats 推移

`/activity-check`（Claude Code）実行のたびに1行記録される。
値は data.pokefuta.com の日次スナップショット（`baked`）で、ライブDBではない。
行のキーは snapshot 生成時刻なので、同じスナップショットを何度取っても行は増えない。

| 記録(JST) | snapshot(JST) | auth | 7dアクティブ | 書込ユーザー | 写真 | 公開 | 非公開 | コメント | 写真ありマンホール | 7d投稿 | 30d投稿 | 最新投稿(JST) | source |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
EOF
fi

tmp=$(mktemp)
awk -F'|' -v key="$gen_jst" -v row="$row" '
  {
    if ($0 ~ /^\|/ && NF > 3) {
      g = $3
      gsub(/^[ \t]+|[ \t]+$/, "", g)
      if (g == key) { print row; found = 1; next }
    }
    print
  }
  END { if (!found) print row }
' "$NOTE" > "$tmp"
mv "$tmp" "$NOTE"

echo "記録しました: ${NOTE} (snapshot ${gen_jst})"
