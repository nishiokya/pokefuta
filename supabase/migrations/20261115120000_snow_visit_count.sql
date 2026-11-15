-- 「雪ふた」ステッカー用の、雪が写った訪問の数。ぬいぐるみ（20261031120000_plush_visit_count.sql）と同じ形。
--
-- 画面の一覧は件数で切れているので、全件を DB で数える。
-- 判定は photo.ai_tags の snow（2026-11-14 までの写真は人の判定、以降は k11 の採点）。1訪問に複数写真があっても1回と数える。
-- 読むだけの関数を2つ足すだけで、表・既存の関数・権限は変えない。
--
-- ロールバック:
--   DROP FUNCTION IF EXISTS public.get_public_snow_visit_count(uuid);
--   DROP FUNCTION IF EXISTS public.get_own_snow_visit_count();

-- 1. 公開スタンプ帳: 公開ID(app_user.id)の人の、公開訪問のうち雪が写ったもの
CREATE OR REPLACE FUNCTION public.get_public_snow_visit_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT COUNT(*)::integer
  FROM public.visit v
  JOIN public.app_user au ON au.auth_uid = v.user_id
  WHERE au.id = p_user_id
    AND v.is_public = true
    AND EXISTS (
      SELECT 1 FROM public.photo p
      WHERE p.visit_id = v.id AND p.ai_tags ->> 'snow' = 'true'
    );
$function$;

REVOKE ALL ON FUNCTION public.get_public_snow_visit_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_snow_visit_count(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_snow_visit_count(uuid) IS
  '公開IDの人の公開訪問のうち、雪(ai_tags.snow)が写った訪問の数。auth_uid は返さない。';

-- 2. 自分のスタンプ帳: 自分の訪問（非公開も含む）のうち雪が写ったもの
CREATE OR REPLACE FUNCTION public.get_own_snow_visit_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT COUNT(*)::integer
  FROM public.visit v
  WHERE v.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.photo p
      WHERE p.visit_id = v.id AND p.ai_tags ->> 'snow' = 'true'
    );
$function$;

-- Supabase は新しい関数に anon の実行権限を自動で付け、REVOKE FROM PUBLIC では外れない。明示的に外す。
REVOKE ALL ON FUNCTION public.get_own_snow_visit_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_own_snow_visit_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_own_snow_visit_count() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_own_snow_visit_count() IS
  '自分の訪問のうち、雪(ai_tags.snow)が写った訪問の数。anon には渡さない。';
