-- トップに掲載する配布中のポケふた。公開条件は詳細・投稿一覧のギフト欄と揃える。
CREATE FUNCTION public.get_home_gift_manholes()
RETURNS TABLE(
  id integer,
  title text,
  prefecture text,
  municipality text,
  building text,
  photo_id uuid,
  available_until timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  WITH per_manhole AS (
    SELECT DISTINCT ON (v.manhole_id)
      v.manhole_id, v.id AS visit_id, v.gift_until, v.shot_at
    FROM public.visit v
    JOIN public.app_user au ON au.auth_uid = v.user_id
    JOIN public.manhole m ON m.id = v.manhole_id AND m.is_active = true
    WHERE v.is_public = true
      AND v.gift_until > now()
      AND v.gift_until <= now() + interval '10 days'
      AND au.pokemon_go_friend_open = true
      AND au.pokemon_go_friend_code IS NOT NULL
    ORDER BY v.manhole_id, v.gift_until DESC, v.shot_at DESC, v.id DESC
  ),
  featured AS (
    SELECT * FROM per_manhole
    ORDER BY shot_at DESC, manhole_id
    LIMIT 6
  )
  SELECT m.id, m.title::text, m.prefecture::text, m.municipality::text, m.building::text,
    (
      SELECT p.id
      FROM public.photo p
      WHERE p.visit_id = f.visit_id AND p.manhole_id = m.id AND p.is_landscape IS NOT TRUE
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 1
    ),
    f.gift_until
  FROM featured f
  JOIN public.manhole m ON m.id = f.manhole_id
  ORDER BY f.shot_at DESC, f.manhole_id;
$function$;

REVOKE ALL ON FUNCTION public.get_home_gift_manholes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_home_gift_manholes() TO anon, authenticated, service_role;
