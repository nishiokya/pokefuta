-- ==========================================
-- ポケふた - サイト全体の集計API用関数
-- ==========================================
-- 作成日: 2026-01-12
-- 目的: RLSの影響を受けずに「ユーザ数 / 全投稿数 / 全ポケふた数」を取得できるようにする

-- サイト全体の集計
CREATE OR REPLACE FUNCTION public.get_site_stats()
RETURNS TABLE(
  total_manhole BIGINT,
  total_posts  BIGINT,
  total_users  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.manhole)::BIGINT,
    (SELECT COUNT(*) FROM public.photo)::BIGINT,
    (SELECT COUNT(*) FROM public.app_user)::BIGINT;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_stats() TO anon, authenticated;
