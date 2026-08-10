Report recent activity and health stats for the pokefuta app.

The point of this command is to see what the app is doing **now**. Query the live
database — do NOT report the daily snapshot as if it were current.

`https://data.pokefuta.com/api/site-stats.json` (and the local `/api/site-stats`
route that re-serves it) is baked once a day around 06:00 JST, so by evening it is
~17h stale and misses the entire day. On 2026-08-09 it was short by 53 photos and
17 registrations, and made a 14-minute-old signup look a day old. Use it only as a
fallback when the DB is unreachable, and label it as stale when you do.

Do NOT start the dev server and do NOT load `.env.local` — neither is needed.

Steps:
1. Get current counts from the live DB with the `supabase` MCP `execute_sql` tool
   (one aggregate query, negligible egress — the per-request-Supabase concern in
   `src/app/api/site-stats/route.ts` is about app traffic, not a daily admin query):

```sql
select
  (select count(*) from auth.users)                                              as auth_users,
  (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days') as active_users_7d,
  (select count(*) from public.app_user)                                         as app_users,
  (select count(*) from public.photo)                                            as posts,
  (select count(*) from public.photo p join public.visit v on v.id = p.visit_id where v.is_public)      as public_posts,
  (select count(*) from public.photo p join public.visit v on v.id = p.visit_id where not v.is_public)  as private_posts,
  (select count(*) from public.manhole_comment)                                  as manhole_comments,
  (select count(*) from public.manhole)                                          as manholes,
  (select count(distinct manhole_id) from public.photo)                          as manholes_with_photos,
  (select max(created_at) at time zone 'Asia/Tokyo' from public.photo)           as latest_photo_jst,
  (select max(created_at) at time zone 'Asia/Tokyo' from auth.users)             as latest_user_jst,
  (select max(created_at) at time zone 'Asia/Tokyo' from public.visit)           as latest_visit_jst,
  (select count(*) from public.photo where created_at > now() - interval '7 days')  as posts_last_7d,
  (select count(*) from public.photo where created_at > now() - interval '30 days') as posts_last_30d,
  -- デザインマンホール。2026-08-09 に投稿が2日間全滅したとき、ここを数えていなかったため
  -- 「ゼロ件が続いている」ことに気づけなかった。needs_review は人が見る画面が無く、
  -- この行が唯一のレビューキュー可視化になっている。
  (select count(*) from public.design_manhole)                                       as design_manholes,
  (select count(*) from public.design_manhole where status = 'needs_review')         as design_needs_review,
  (select count(*) from public.design_manhole where created_at > now() - interval '7 days') as design_posts_7d,
  (select max(created_at) at time zone 'Asia/Tokyo' from public.design_manhole)      as latest_design_jst;
```

   - If the DB is unreachable, fall back to
     `curl -sf https://data.pokefuta.com/api/site-stats.json` (mirror:
     `https://raw.githubusercontent.com/nishiokya/pokefuta-tracker/main/docs/api/site-stats.json`)
     and label every number "as of {generated_at}, N hours stale".
2. Parse and display the result as a human-readable health report in this format:

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
  Design manholes         : {design_manholes} (確認待ち: {design_needs_review})

[Latest Activity]
  Latest photo posted : {latest_photo_at} (relative: e.g. "3 days ago")
  Latest user joined  : {latest_user_at} (relative)
  Latest visit logged : {latest_visit_at} (relative)
  Latest design posted: {latest_design_jst} (relative)

[Recent Posting Pace]
  Posts last  7 days : {posts_last_7d}
  Posts last 30 days : {posts_last_30d}
  Design last 7 days : {design_posts_7d}

[Health]
  API response source : {source}  (baked = healthy, unavailable = snapshot fetch failed)
  Snapshot generated  : {generated_at} (relative)
```

3. Record the snapshot into Obsidian (always, on every invocation):
   `curl -sf https://data.pokefuta.com/api/site-stats.json | tools/log-site-stats-to-obsidian.sh`
   - Appends one row to `~/note/dev/pokefuta/log/pokefuta site-stats 推移.md`
     (created on first run). Override the path with `POKEFUTA_STATS_NOTE` if needed.
   - Keyed by the snapshot's `generated_at`, so re-running on the same daily bake
     overwrites that row instead of adding a duplicate.
   - Mention in one line whether the note was written, e.g.
     "Obsidian に記録: pokefuta site-stats 推移.md (snapshot 2026-08-05 06:49)".
   - If the script fails, report it but still show the report above.

Notes:
- Timestamps in the snapshot are UTC; display them in JST.
- Use `jq` to parse JSON if available, otherwise parse manually.
- Show `public_posts` and `private_posts` inline with Photos posted. If missing from response, show "N/A".
- Show `manhole_comments` count. If missing, show "N/A".
- If `latest_photo_at` is null, show "no photos yet".
- Flag any anomalies:
  - `posts_last_7d == 0` → "No new photos this week"
  - `design_posts_7d == 0` → "WARNING: デザインマンホール投稿がゼロ". 投稿は元々少ないので
    ゼロ自体は起こりうるが、2026-08-09 の障害（マイグレーション未適用で INSERT が全失敗）は
    まさにこの見え方だった。GA4 の `p_submission_failed` に `error_code` が出ていないか併せて見る
  - `design_needs_review > 0` → 確認待ちが滞留している。レビュー用の画面は存在しないので、
    ここで気づかないと放置される
  - `source == "unavailable"` → "WARNING: snapshot fetch failed"
  - `generated_at` older than ~48h → "NOTE: daily bake may have stopped" (check the
    bake job in the pokefuta-tracker repo, which publishes data.pokefuta.com)
- Keep the report concise and scannable.
