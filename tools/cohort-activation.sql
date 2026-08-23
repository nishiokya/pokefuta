-- 北極星「新規の初回投稿 → 2回目」を週次で見るための集計。読み取り専用。
--
-- 使い方（本番の read-only 接続、または Supabase MCP から）:
--   psql "$DATABASE_URL" -f tools/cohort-activation.sql
--
-- ── 分母を間違えないための3つ ──────────────────────────────────
--
-- 1. **`app_user` を分母にしない。**
--    `app_user` の行は初回投稿時（`ensureAppUser`）に作られる。よって
--    「投稿しなかった人」は行が無く、分母から丸ごと消える。app_user を
--    分母にすると活性化率が 67% に見えるが、実際は 24% だった（2026-08-23 実測）。
--    分母は必ず `auth.users`。
--
-- 2. **アカウント未成立を除く。**
--    email 登録には `email_confirmed_at IS NULL`（確認メール未クリック）や
--    `last_sign_in_at IS NULL`（一度もサインインしていない）が混ざる。
--    2026-08 は 204件中 35件がこれで、含めると活性化率が 22.1%、
--    除くと 26.6% になる。**`signed_in` の側を正とする**。
--    raw の件数も並べて出すのは、この差が広がったら登録フロー自体が
--    壊れている合図だから。
--
-- 3. **GA4 の `p_signup_complete` を新規登録数として使わない。**
--    Google OAuth では「新規登録ボタンを押したか」を sessionStorage の
--    intent で判定している（`src/app/login/page.tsx`）。ログインボタンから
--    初回登録した人は `p_login_success` 側に出る。**登録数は必ずこのSQL（DB）が正。**
--    GA4 は「登録後にどこで詰まったか」を見るために使う。
--
-- ── 指標の定義 ────────────────────────────────────────────
--   signed_in  : サインインまで到達したアカウント（＝実質の分母）
--   posted     : visit を1件以上作った（初回投稿）
--   posted_7d  : 登録から7日以内に初回投稿した（コホート間で比べるならこちら。
--                直近のコホートはまだ時間が経っていないので act_pct は必ず低く出る）
--   returned   : 投稿した日が2日以上ある（＝2回目。同日の連投は1回と数える）
--
-- 更新時は Obsidian `dev/pokefuta/spec/2026-08-23 pokefuta フェーズ計画 v2（初回投稿→2回目）.md` も直すこと。

\echo '=== 月次コホート ==='

WITH s AS (
  SELECT
    u.id,
    date_trunc('month', u.created_at)::date AS cohort,
    u.created_at AS registered_at,
    (u.last_sign_in_at IS NOT NULL) AS signed_in,
    (SELECT min(v.created_at) FROM public.visit v WHERE v.user_id = u.id) AS first_post_at,
    (SELECT count(*) FROM public.visit v WHERE v.user_id = u.id) AS visits,
    (SELECT count(DISTINCT date(v.created_at AT TIME ZONE 'Asia/Tokyo'))
       FROM public.visit v WHERE v.user_id = u.id) AS post_days
  FROM auth.users u
)
SELECT
  cohort,
  count(*)                                         AS signups_raw,
  count(*) FILTER (WHERE signed_in)                AS signed_in,
  count(*) FILTER (WHERE visits > 0)               AS posted,
  round(100.0 * count(*) FILTER (WHERE visits > 0)
        / nullif(count(*) FILTER (WHERE signed_in), 0), 1) AS act_pct,
  count(*) FILTER (WHERE first_post_at IS NOT NULL
                     AND first_post_at < registered_at + interval '7 days') AS posted_7d,
  count(*) FILTER (WHERE post_days >= 2)           AS returned,
  round(100.0 * count(*) FILTER (WHERE post_days >= 2)
        / nullif(count(*) FILTER (WHERE visits > 0), 0), 1) AS ret_pct
FROM s
GROUP BY cohort
ORDER BY cohort;

\echo ''
\echo '=== 週次コホート（直近12週）==='

WITH s AS (
  SELECT
    u.id,
    date_trunc('week', u.created_at AT TIME ZONE 'Asia/Tokyo')::date AS cohort,
    u.created_at AS registered_at,
    (u.last_sign_in_at IS NOT NULL) AS signed_in,
    (SELECT min(v.created_at) FROM public.visit v WHERE v.user_id = u.id) AS first_post_at,
    (SELECT count(*) FROM public.visit v WHERE v.user_id = u.id) AS visits,
    (SELECT count(DISTINCT date(v.created_at AT TIME ZONE 'Asia/Tokyo'))
       FROM public.visit v WHERE v.user_id = u.id) AS post_days
  FROM auth.users u
  WHERE u.created_at >= now() - interval '12 weeks'
)
SELECT
  cohort,
  count(*)                                         AS signups_raw,
  count(*) FILTER (WHERE signed_in)                AS signed_in,
  count(*) FILTER (WHERE visits > 0)               AS posted,
  round(100.0 * count(*) FILTER (WHERE visits > 0)
        / nullif(count(*) FILTER (WHERE signed_in), 0), 1) AS act_pct,
  count(*) FILTER (WHERE first_post_at IS NOT NULL
                     AND first_post_at < registered_at + interval '7 days') AS posted_7d,
  count(*) FILTER (WHERE post_days >= 2)           AS returned
FROM s
GROUP BY cohort
ORDER BY cohort;

\echo ''
\echo '=== 未成立アカウントの内訳（登録フローが壊れていないかの見張り）==='

SELECT
  date_trunc('month', created_at)::date AS cohort,
  coalesce(raw_app_meta_data->>'provider', '?')     AS provider,
  count(*)                                          AS users,
  count(*) FILTER (WHERE email_confirmed_at IS NULL) AS unconfirmed,
  count(*) FILTER (WHERE last_sign_in_at IS NULL)    AS never_signed_in
FROM auth.users
WHERE created_at >= now() - interval '6 months'
GROUP BY 1, 2
ORDER BY 1, users DESC;
