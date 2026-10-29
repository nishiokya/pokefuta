-- 「ぬいぐるみと一緒」ステッカー用の、ぬいぐるみが写った訪問の数。
--
-- 画面の一覧は公開側が最新500件・自分側が最新1000件で切れているため、そこから数えると
-- 訪問の多い人は古い分が落ち、ステッカーが消えたり回数が少なく出たりする。全件をDBで数える。
-- 判定は photo.ai_tags の plush（k11 の採点が書く）。1訪問に複数写真があっても1回と数える。

-- 1. 公開スタンプ帳: 公開ID(app_user.id)の人の、公開訪問のうちぬいぐるみが写ったもの
CREATE OR REPLACE FUNCTION public.get_public_plush_visit_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM visit v
  JOIN app_user au ON au.auth_uid = v.user_id
  WHERE au.id = p_user_id
    AND v.is_public = true
    AND EXISTS (
      SELECT 1 FROM photo p
      WHERE p.visit_id = v.id AND p.ai_tags ->> 'plush' = 'true'
    );
$function$;

REVOKE ALL ON FUNCTION public.get_public_plush_visit_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_plush_visit_count(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_plush_visit_count(uuid) IS
  '公開IDの人の公開訪問のうち、ぬいぐるみ(ai_tags.plush)が写った訪問の数。auth_uid は返さない。';

-- 2. 自分のスタンプ帳: 自分の訪問（非公開も含む）のうちぬいぐるみが写ったもの
CREATE OR REPLACE FUNCTION public.get_own_plush_visit_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM visit v
  WHERE v.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM photo p
      WHERE p.visit_id = v.id AND p.ai_tags ->> 'plush' = 'true'
    );
$function$;

-- Supabase は新しい関数に anon の実行権限を自動で付け、REVOKE FROM PUBLIC では外れない。
-- 明示的に外す（auth.uid() が無い anon に渡す意味がない）。
REVOKE ALL ON FUNCTION public.get_own_plush_visit_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_own_plush_visit_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_own_plush_visit_count() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_own_plush_visit_count() IS
  '自分の訪問のうち、ぬいぐるみ(ai_tags.plush)が写った訪問の数。anon には渡さない。';
