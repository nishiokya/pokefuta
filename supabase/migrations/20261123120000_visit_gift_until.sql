-- visit.gift_until: 「このポケふたのギフトを配れます」の期限
--
-- 背景（2026-11-23）:
--
-- ポケふたは Pokémon GO のポケストップで、回すとその場所の写真付きギフトが手に入る。
-- 訪れた人が「ギフトを配れます」と印を付け、マンホール詳細で GO のトレーナーコードと
-- 一緒に並べる。受け取りたい人はコードをコピーしてフレンド申請する。
--
-- 決めたこと（ユーザー決定）:
--   - 印は訪問（visit）ごと。どのポケふたのギフトかに価値があるので、ユーザー単位にしない
--   - 期限は撮影日から10日。過ぎたら自然に消える（消すためのジョブは要らない）
--   - 公式ポケふた（manhole_id がある訪問）だけ
--   - 本人の申告。実際にストップを回したかは確かめない
--   - マンホール詳細に出すのは新しい順に5人まで。同じ人は最新の1件だけ
--   - トレーナーコードを公開（pokemon_go_friend_open）している人だけ出す
--
-- 書き込み: visit の UPDATE はテーブル単位の GRANT と RLS（本人の行だけ）のまま。
-- アプリは /api/visits/{id} の PATCH で gift_until = shot_at + 10日 を入れる。
-- PostgREST を直接叩いて遠い未来の期限を入れられないよう、CHECK で
-- 「撮影日から10日以内」を縛る。shot_at も本人が書き換えられるので、読み出し側
-- （get_manhole_gift_givers）でも「今から10日以内に切れるもの」だけに絞る。
--
-- 公開: gift_until は公開訪問なら誰に見えてもよい値なので SELECT を GRANT する
-- （visit の SELECT は列単位、20261012110000）。トレーナーコードは app_user にあって
-- anon から読めないので、一覧は SECURITY DEFINER の関数で組み立てる。
--
-- 適用順: このマイグレーションを先に本番へ当て、そのあとでアプリを出す。
-- 列が無いまま新しいアプリが gift_until を select すると、マンホール詳細の
-- 写真一覧が 42703 で落ちる。旧アプリは列を読まないのでそのまま動く。
--
-- ロールバック:
--   DROP FUNCTION IF EXISTS public.get_manhole_gift_givers(integer);
--   DROP INDEX IF EXISTS public.idx_visit_gift_until_manhole;
--   ALTER TABLE public.visit DROP CONSTRAINT IF EXISTS visit_gift_until_window;
--   ALTER TABLE public.visit DROP COLUMN IF EXISTS gift_until;

-- ---------------------------------------------------------------------------
-- 1. 列と制約
-- ---------------------------------------------------------------------------
ALTER TABLE public.visit
  ADD COLUMN gift_until timestamptz;

ALTER TABLE public.visit
  ADD CONSTRAINT visit_gift_until_window
  CHECK (
    gift_until IS NULL
    OR (manhole_id IS NOT NULL AND gift_until <= shot_at + interval '10 days')
  );

COMMENT ON COLUMN public.visit.gift_until IS
  '「このポケふたのギフトを配れます」の期限（本人の申告）。NULL は印なし。撮影日から10日まで。'
  ' マンホール詳細の get_manhole_gift_givers() が期限内の公開訪問だけを出す（2026-11-23）。';

GRANT SELECT (gift_until) ON public.visit TO anon, authenticated;

-- マンホール詳細で「期限内のもの」を引く。印の付いた行はごく一部なので部分索引にする。
CREATE INDEX idx_visit_gift_until_manhole
  ON public.visit (manhole_id, gift_until DESC)
  WHERE gift_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. マンホール詳細の「ギフトを配れる人」
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_manhole_gift_givers(p_manhole_id integer)
RETURNS TABLE(
  visit_id uuid,
  public_user_id uuid,
  display_name text,
  pokemon_go_friend_code text,
  pokemon_go_friend_note text,
  shot_at timestamptz,
  gift_until timestamptz,
  is_own boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  WITH latest AS (
    -- 同じ人がこの蓋を何度も投稿していても、出すのは最新の1件だけ
    SELECT DISTINCT ON (v.user_id)
      v.id, v.user_id, v.shot_at, v.gift_until,
      au.pokemon_go_friend_code, au.pokemon_go_friend_note
    FROM visit v
    JOIN app_user au ON au.auth_uid = v.user_id
    WHERE v.manhole_id = p_manhole_id
      AND v.is_public = true
      AND v.gift_until > now()
      AND v.gift_until <= now() + interval '10 days'
      AND au.pokemon_go_friend_open = true
      AND au.pokemon_go_friend_code IS NOT NULL
    ORDER BY v.user_id, v.shot_at DESC, v.id DESC
  ),
  top AS (
    SELECT * FROM latest ORDER BY shot_at DESC, id DESC LIMIT 5
  ),
  uids AS (
    SELECT COALESCE(array_agg(t.user_id), '{}'::uuid[]) AS arr FROM top t
  ),
  names AS (
    SELECT n.auth_uid, n.display_name
    FROM uids, LATERAL get_public_display_names(uids.arr) n
  ),
  ids AS (
    SELECT i.auth_uid, i.public_user_id
    FROM uids, LATERAL get_public_user_ids(uids.arr) i
  )
  SELECT
    t.id,
    ids.public_user_id,
    names.display_name,
    t.pokemon_go_friend_code,
    t.pokemon_go_friend_note,
    t.shot_at,
    t.gift_until,
    -- 「自分か」は uid を配らずにサーバが答える（get_manhole_comments と同じ）
    (auth.uid() IS NOT NULL AND t.user_id = auth.uid()) AS is_own
  FROM top t
  LEFT JOIN names ON names.auth_uid = t.user_id
  LEFT JOIN ids ON ids.auth_uid = t.user_id
  ORDER BY t.shot_at DESC, t.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_manhole_gift_givers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_manhole_gift_givers(integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_manhole_gift_givers(integer) IS
  'マンホール詳細の「このポケふたのギフトを配れる人」。期限内の公開訪問で、トレーナーコードを公開している人を'
  ' 撮影日の新しい順に5人まで（同じ人は最新の1件）。auth UID は返さず、本人かは is_own で答える（2026-11-23）。';
