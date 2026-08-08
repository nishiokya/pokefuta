Report recent activity and health stats for the pokefuta app by calling the local API.

Steps:
1. Load env vars: `set -a && source .env.local && set +a`
2. Check if dev server is running: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/site-stats`
   - If not 200, report "Dev server not running at localhost:3000" and stop.
3. Fetch stats: `curl -s http://localhost:3000/api/site-stats`
   - This route proxies the daily snapshot from data.pokefuta.com through Next.js's
     fetch cache (revalidate 1h). On a freshly started dev server the FIRST request
     can serve a stale on-disk entry from `.next/cache/fetch-cache` while it
     revalidates in the background. Always fetch twice and use the second response.
4. Parse and display the result as a human-readable health report in this format:

```
=== Pokefuta Activity Report (YYYY-MM-DD HH:MM) ===

[Counts]
  Auth users (registered) : {auth_users}
  Active users (7d login) : {active_users_7d}
  App users (active)      : {users}   ← wrote at least once; diff = signup-only users
  Photos posted           : {posts} (公開: {public_posts}, 非公開: {private_posts})
  Manhole comments        : {manhole_comments}
  Manholes total          : {manholes}
  Manholes w/ photos      : {manholes_with_photos}

[Latest Activity]
  Latest photo posted : {latest_photo_at} (relative: e.g. "3 days ago")
  Latest user joined  : {latest_user_at} (relative)
  Latest visit logged : {latest_visit_at} (relative)

[Recent Posting Pace]
  Posts last  7 days : {posts_last_7d}
  Posts last 30 days : {posts_last_30d}

[Health]
  API response source : {source}  (baked = healthy, unavailable = snapshot fetch failed)
  Snapshot generated  : {generated_at} (relative)
```

5. Record the snapshot into Obsidian (always, on every invocation):
   `curl -s http://localhost:3000/api/site-stats | tools/log-site-stats-to-obsidian.sh`
   - Appends one row to `~/note/dev/pokefuta/log/pokefuta site-stats 推移.md`
     (created on first run). Override the path with `POKEFUTA_STATS_NOTE` if needed.
   - Keyed by the snapshot's `generated_at`, so re-running on the same daily bake
     overwrites that row instead of adding a duplicate.
   - Mention in one line whether the note was written, e.g.
     "Obsidian に記録: pokefuta site-stats 推移.md (snapshot 2026-08-05 06:49)".
   - If the script fails, report it but still show the report above.

Notes:
- Use `jq` to parse JSON if available, otherwise parse manually.
- Show `public_posts` and `private_posts` inline with Photos posted. If missing from response, show "N/A".
- Show `manhole_comments` count. If missing, show "N/A".
- If `latest_photo_at` is null, show "no photos yet".
- Flag any anomalies:
  - `posts_last_7d == 0` → "No new photos this week"
  - `source == "unavailable"` (503) → "WARNING: snapshot fetch failed"
  - `generated_at` older than ~48h → "NOTE: daily bake may have stopped" (check the
    bake job in the pokefuta-tracker repo, which publishes data.pokefuta.com)
- Keep the report concise and scannable.
