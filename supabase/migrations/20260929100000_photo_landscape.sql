-- 投稿者による周辺風景の申告。既存写真は再分類しない。
ALTER TABLE public.photo ADD COLUMN is_landscape boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.photo.is_landscape IS
  '投稿者が選択した周辺の風景。品質採点とは独立し、蓋の代表画像と写真充足率から除外する。';
GRANT SELECT (is_landscape) ON public.photo TO anon, authenticated;

-- 公開訪問の境界は既存の base ビューのまま。写真種別だけを追加する。
CREATE OR REPLACE VIEW public.public_user_visit_card
WITH (security_invoker = false, security_barrier = true) AS
SELECT b.*, latest.id AS latest_photo_id,
  latest.created_at AS latest_photo_created_at,
  latest.is_landscape AS latest_photo_is_landscape
FROM public.public_user_visit_base b
LEFT JOIN LATERAL (
  SELECT p.id, p.created_at, p.is_landscape FROM public.photo p
  WHERE p.visit_id = b.id
  ORDER BY p.is_landscape ASC, p.created_at DESC NULLS LAST, p.id DESC
  LIMIT 1
) latest ON true;
REVOKE ALL ON public.public_user_visit_card FROM PUBLIC;
GRANT SELECT ON public.public_user_visit_card TO anon, authenticated, service_role;
COMMENT ON VIEW public.public_user_visit_card IS
  '公開訪問カード。蓋の写真を優先して最新1枚を返し、風景だけの場合は種別を明示する。';

-- 写真の公開範囲と投稿総数は従来どおり。蓋の充足だけ風景を除外する。
CREATE OR REPLACE FUNCTION public.get_site_counts()
RETURNS TABLE (
  manholes bigint, posts bigint, public_posts bigint,
  manholes_with_photos bigint, users bigint, design_manholes bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $$
  SELECT
    (SELECT count(*) FROM public.manhole)::bigint,
    (SELECT count(*) FROM public.photo)::bigint,
    (SELECT count(*) FROM public.photo p JOIN public.visit v ON v.id = p.visit_id
      WHERE v.is_public)::bigint,
    (SELECT count(DISTINCT p.manhole_id) FROM public.photo p
      JOIN public.visit v ON v.id = p.visit_id
      WHERE v.is_public AND NOT p.is_landscape)::bigint,
    (SELECT count(*) FROM public.app_user)::bigint,
    (SELECT count(*) FROM public.design_manhole WHERE status = 'published')::bigint;
$$;
ALTER FUNCTION public.get_site_counts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_site_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_site_counts() IS
  '投稿数は風景を含む。蓋の写真充足率は公開訪問に属する風景以外の写真で集計する。';

CREATE OR REPLACE FUNCTION public.get_public_prefecture_completion()
RETURNS TABLE (prefecture text, total bigint, with_photo bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $$
  SELECT m.prefecture, count(*)::bigint,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.photo p JOIN public.visit v ON v.id = p.visit_id
      WHERE p.manhole_id = m.id AND v.is_public AND NOT p.is_landscape
    ))::bigint
  FROM public.manhole m
  WHERE nullif(trim(m.prefecture), '') IS NOT NULL
  GROUP BY m.prefecture;
$$;
ALTER FUNCTION public.get_public_prefecture_completion() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_prefecture_completion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_prefecture_completion() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_public_prefecture_completion() IS
  '都道府県ごとの蓋の写真充足率。非公開写真・周辺風景を除き、行や識別子は返さない。';
