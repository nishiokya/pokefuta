-- 写真館の件数を、実際に未ログインで見える公開写真だけに揃える。
--
-- public_posts は既に visit.is_public で絞っていたが、トップページが posts を
-- 表示していた。また manholes_with_photos は非公開写真だけの蓋も「写真あり」に
-- 数えていたため、公開写真館の残り枚数として不正確だった。

CREATE OR REPLACE FUNCTION public.get_site_counts()
RETURNS TABLE (
  manholes bigint,
  posts bigint,
  public_posts bigint,
  manholes_with_photos bigint,
  users bigint,
  design_manholes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*) FROM public.manhole)::bigint,
    (SELECT count(*) FROM public.photo)::bigint,
    (SELECT count(*)
       FROM public.photo p
       JOIN public.visit v ON v.id = p.visit_id
      WHERE v.is_public)::bigint,
    (SELECT count(DISTINCT p.manhole_id)
       FROM public.photo p
       JOIN public.visit v ON v.id = p.visit_id
      WHERE v.is_public)::bigint,
    (SELECT count(*) FROM public.app_user)::bigint,
    (SELECT count(*) FROM public.design_manhole WHERE status = 'published')::bigint;
$$;

ALTER FUNCTION public.get_site_counts() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_site_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO service_role;

COMMENT ON FUNCTION public.get_site_counts() IS
  'トップページ用のリアルタイム件数。公開写真館のカバレッジは visit.is_public=true の写真だけで集計する。';

CREATE OR REPLACE FUNCTION public.get_public_prefecture_completion()
RETURNS TABLE (
  prefecture text,
  total bigint,
  with_photo bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    m.prefecture,
    count(*)::bigint AS total,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
          FROM public.photo p
          JOIN public.visit v ON v.id = p.visit_id
         WHERE p.manhole_id = m.id
           AND v.is_public
      )
    )::bigint AS with_photo
  FROM public.manhole m
  WHERE nullif(trim(m.prefecture), '') IS NOT NULL
  GROUP BY m.prefecture;
$$;

ALTER FUNCTION public.get_public_prefecture_completion() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_public_prefecture_completion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_prefecture_completion() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_prefecture_completion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_prefecture_completion() TO service_role;

COMMENT ON FUNCTION public.get_public_prefecture_completion() IS
  '都道府県ごとのポケふた総数と公開写真がある蓋数。非公開の行や識別子は返さない。';
