-- ==========================================
-- ポケふた - サイト全体の集計API拡張
-- ==========================================
-- 目的: 「画像ありマンホール数」を /api/site-stats に集約する

DROP FUNCTION IF EXISTS public.get_site_stats();

CREATE OR REPLACE FUNCTION public.get_site_stats()
RETURNS TABLE(
  total_manhole BIGINT,
  total_manholes_with_photos BIGINT,
  total_posts  BIGINT,
  total_users  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.manhole)::BIGINT,
    (SELECT COUNT(DISTINCT manhole_id) FROM public.photo WHERE manhole_id IS NOT NULL)::BIGINT,
    (SELECT COUNT(*) FROM public.photo)::BIGINT,
    (SELECT COUNT(*) FROM public.app_user)::BIGINT;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_stats() TO anon, authenticated;
