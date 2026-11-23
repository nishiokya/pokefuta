-- トップの投稿一覧に出す蓋のギフト配布状況。公開条件は get_manhole_gift_givers と揃える。
-- 1ページ分（最大24件）だけ受け取り、配布者の情報は返さない。
CREATE FUNCTION public.get_manhole_gift_availability(p_manhole_ids integer[])
RETURNS TABLE(manhole_id integer, available_until timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT v.manhole_id, max(v.gift_until)
  FROM public.visit v
  JOIN public.app_user au ON au.auth_uid = v.user_id
  WHERE v.manhole_id = ANY (p_manhole_ids[1:24])
    AND v.is_public = true
    AND v.gift_until > now()
    AND v.gift_until <= now() + interval '10 days'
    AND au.pokemon_go_friend_open = true
    AND au.pokemon_go_friend_code IS NOT NULL
  GROUP BY v.manhole_id;
$function$;

REVOKE ALL ON FUNCTION public.get_manhole_gift_availability(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_manhole_gift_availability(integer[]) TO anon, authenticated, service_role;
