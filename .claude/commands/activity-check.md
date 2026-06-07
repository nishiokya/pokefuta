Report recent activity and health stats for the pokefuta app by calling the local API.

Steps:
1. Load env vars: `set -a && source .env.local && set +a`
2. Check if dev server is running: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/site-stats`
   - If not 200, report "Dev server not running at localhost:3000" and stop.
3. Fetch stats: `curl -s http://localhost:3000/api/site-stats`
4. Parse and display the result as a human-readable health report in this format:

```
=== Pokefuta Activity Report (YYYY-MM-DD HH:MM) ===

[Counts]
  Auth users (registered) : {auth_users}
  Active users (7d login) : {active_users_7d}
  App users (active)      : {users}   ← wrote at least once; diff = signup-only users
  Photos posted           : {posts}
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
  API response source : {source}  (rpc = healthy, admin = RPC degraded, unavailable = DB unreachable)
```

Notes:
- Use `jq` to parse JSON if available, otherwise parse manually.
- If `latest_photo_at` is null, show "no photos yet".
- Flag any anomalies:
  - `posts_last_7d == 0` → "No new photos this week"
  - `source == "unavailable"` → "WARNING: DB unreachable"
  - `source == "admin"` → "NOTE: RPC function unavailable, using admin fallback"
- Keep the report concise and scannable.
