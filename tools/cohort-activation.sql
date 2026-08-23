-- 北極星「新規の初回投稿 → 2回目」を週次で見るための集計。読み取り専用。
--
-- 使い方（本番の read-only 接続）:
--   psql "$DATABASE_URL" -f tools/cohort-activation.sql
--
-- ⚠️ `\echo` は psql のメタコマンドなので、**このファイルを Supabase MCP や
--    SQL Editor にそのまま貼ると構文エラーになる**。psql 以外から流すときは
--    各 SELECT を個別に実行すること。
--
-- ── 分母を間違えないための3つ ──────────────────────────────────
--
-- 1. **`app_user` を分母にしない。**
--    `app_user` の行は登録時ではなく、**何らかの書き込み操作の時**に
--    `ensureAppUser` が作る（投稿・いいね・ブックマーク・訪問コメント・
--    蓋コメント・デザインふた投稿・画像アップロードの各APIから呼ばれる）。
--    よって「登録したが何もしなかった人」は行が無く、分母から丸ごと消える。
--    app_user を分母にすると活性化率が 67% に見えるが、実際は 26.6% だった
--    （2026-08 コホート・2026-08-23 実測）。分母は必ず `auth.users`。
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
--    初回登録した人は `p_login_success` 側に出る。email 側は
--    `supabase.auth.signUp()` の直後、確認メールより前に発火する。
--    **登録数は必ずこのSQL（DB）が正。** GA4 は「登録後にどこで詰まったか」に使う。
--
-- ── コホート間で比べるときの約束 ────────────────────────────────
--
--   act_pct    は「実行時点までに一度でも投稿したか」なので、**古いコホートほど
--              有利**に出る。コホート同士を比べるのには使わない（母集団の現況把握用）。
--   act_7d_pct は登録から7日経ったアカウントだけを分母にし、7日以内の初回投稿だけを
--              分子にする。**コホート間の比較はこちらだけを見る。**
--   mature     が false のコホートはまだ7日経っていない人を含む＝ act_7d_pct が未確定。
--
-- ── 指標の定義 ────────────────────────────────────────────
--   signed_in    : サインインまで到達したアカウント（＝実質の分母）
--   posted       : visit を1件以上作った（初回投稿）
--   posted_7d    : 登録から7日未満で初回投稿した（分母も7日経過済みに揃える）
--   returned     : 投稿した日が2日以上ある（＝2回目。同日の連投は1回と数える）
--
-- 更新時は Obsidian `dev/pokefuta/spec/2026-08-23 pokefuta フェーズ計画 v2（初回投稿→2回目）.md` も直すこと。

\echo '=== 月次コホート（JST）==='

WITH s AS (
  SELECT
    date_trunc('month', u.created_at AT TIME ZONE 'Asia/Tokyo')::date AS cohort,
    u.created_at AS registered_at,
    (u.last_sign_in_at IS NOT NULL) AS signed_in,
    -- 登録から7日経ったか（7日窓の分母を揃えるため）
    (u.created_at < now() - interval '7 days') AS matured,
    (SELECT min(v.created_at) FROM public.visit v WHERE v.user_id = u.id) AS first_post_at,
    (SELECT count(*) FROM public.visit v WHERE v.user_id = u.id) AS visits,
    (SELECT count(DISTINCT date(v.created_at AT TIME ZONE 'Asia/Tokyo'))
       FROM public.visit v WHERE v.user_id = u.id) AS post_days
  FROM auth.users u
)
SELECT
  cohort,
  bool_and(matured)                                AS mature,
  count(*)                                         AS signups_raw,
  count(*) FILTER (WHERE signed_in)                AS signed_in,
  count(*) FILTER (WHERE visits > 0)               AS posted,
  round(100.0 * count(*) FILTER (WHERE visits > 0)
        / nullif(count(*) FILTER (WHERE signed_in), 0), 1) AS act_pct,
  -- 7日窓: 分子も分母も「登録から7日経ったアカウント」だけで揃える
  count(*) FILTER (WHERE signed_in AND matured)    AS signed_in_7d,
  count(*) FILTER (WHERE signed_in AND matured
                     AND first_post_at < registered_at + interval '7 days') AS posted_7d,
  round(100.0 * count(*) FILTER (WHERE signed_in AND matured
                     AND first_post_at < registered_at + interval '7 days')
        / nullif(count(*) FILTER (WHERE signed_in AND matured), 0), 1) AS act_7d_pct,
  count(*) FILTER (WHERE post_days >= 2)           AS returned,
  round(100.0 * count(*) FILTER (WHERE post_days >= 2)
        / nullif(count(*) FILTER (WHERE visits > 0), 0), 1) AS ret_pct
FROM s
GROUP BY cohort
ORDER BY cohort;

\echo ''
\echo '=== 週次コホート（JST・直近12週。週境界で切るので途中の週は出ない）==='

WITH s AS (
  SELECT
    date_trunc('week', u.created_at AT TIME ZONE 'Asia/Tokyo')::date AS cohort,
    u.created_at AS registered_at,
    (u.last_sign_in_at IS NOT NULL) AS signed_in,
    (u.created_at < now() - interval '7 days') AS matured,
    (SELECT min(v.created_at) FROM public.visit v WHERE v.user_id = u.id) AS first_post_at,
    (SELECT count(*) FROM public.visit v WHERE v.user_id = u.id) AS visits,
    (SELECT count(DISTINCT date(v.created_at AT TIME ZONE 'Asia/Tokyo'))
       FROM public.visit v WHERE v.user_id = u.id) AS post_days
  FROM auth.users u
  -- ローリング12週にすると最古の週だけ途中から始まる不完全なコホートになるので、
  -- 週境界に揃えて切る。
  WHERE (u.created_at AT TIME ZONE 'Asia/Tokyo')
        >= date_trunc('week', (now() AT TIME ZONE 'Asia/Tokyo')) - interval '12 weeks'
)
SELECT
  cohort,
  bool_and(matured)                                AS mature,
  count(*)                                         AS signups_raw,
  count(*) FILTER (WHERE signed_in)                AS signed_in,
  count(*) FILTER (WHERE visits > 0)               AS posted,
  round(100.0 * count(*) FILTER (WHERE visits > 0)
        / nullif(count(*) FILTER (WHERE signed_in), 0), 1) AS act_pct,
  count(*) FILTER (WHERE signed_in AND matured)    AS signed_in_7d,
  count(*) FILTER (WHERE signed_in AND matured
                     AND first_post_at < registered_at + interval '7 days') AS posted_7d,
  round(100.0 * count(*) FILTER (WHERE signed_in AND matured
                     AND first_post_at < registered_at + interval '7 days')
        / nullif(count(*) FILTER (WHERE signed_in AND matured), 0), 1) AS act_7d_pct,
  count(*) FILTER (WHERE post_days >= 2)           AS returned
FROM s
GROUP BY cohort
ORDER BY cohort;

\echo ''
\echo '=== 未成立アカウントの内訳（登録フローが壊れていないかの見張り）==='

SELECT
  date_trunc('month', created_at AT TIME ZONE 'Asia/Tokyo')::date AS cohort,
  coalesce(raw_app_meta_data->>'provider', '?')      AS provider,
  count(*)                                           AS users,
  count(*) FILTER (WHERE email_confirmed_at IS NULL) AS unconfirmed,
  count(*) FILTER (WHERE last_sign_in_at IS NULL)    AS never_signed_in
FROM auth.users
WHERE created_at >= now() - interval '6 months'
GROUP BY 1, 2
ORDER BY 1, users DESC;
