-- 自分が投稿したデザインマンホールの一覧（スタンプ帳 /visits/design-manholes 用）。
--
-- 今は自分の投稿だけを見る画面が無い。投稿者本人には、公開中（published）のほかに、
-- 近くに公式のポケふたがあって確認待ちの投稿（needs_review）と、公式のポケふたの訪問記録へ移した投稿
-- （hidden のうち、同じ storage_key の photo が本人の visit に付いているもの。20261110100000 / 20261110110000）を見せる。
-- 重複などで隠した hidden は出さない。
--
-- 移した先の訪問は hidden の行だけ引く（公開中・確認待ちでは photo を見ない。photo.storage_key には idx_photo_storage_key がある）。
-- 読むだけの関数を1つ足すだけで、表・既存の関数・権限は変えない。
-- created_by・exif・緯度経度は返さない。移した先の蓋は moved_manhole_id（公式の番号）で返す。
--
-- ロールバック:
--   DROP FUNCTION IF EXISTS public.get_own_design_manholes();

CREATE OR REPLACE FUNCTION public.get_own_design_manholes()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  status text,
  storage_key text,
  created_at timestamp with time zone,
  moved_manhole_id integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT d.id, d.title, d.description, d.status, d.storage_key, d.created_at, mv.manhole_id
  FROM public.design_manhole d
  LEFT JOIN LATERAL (
    SELECT v.manhole_id
    FROM public.photo p
    JOIN public.visit v ON v.id = p.visit_id
    WHERE d.status = 'hidden'
      AND p.storage_key = d.storage_key
      AND v.user_id = auth.uid()
    LIMIT 1
  ) mv ON true
  WHERE d.created_by = auth.uid()
    AND (
      d.status IN ('published', 'needs_review')
      OR (d.status = 'hidden' AND mv.manhole_id IS NOT NULL)
    )
  ORDER BY d.created_at DESC
  LIMIT 500;
$function$;

-- Supabase は新しい関数に anon の実行権限を自動で付け、REVOKE FROM PUBLIC では外れない。明示的に外す。
REVOKE ALL ON FUNCTION public.get_own_design_manholes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_own_design_manholes() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_own_design_manholes() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_own_design_manholes() IS
  '自分のデザインマンホール投稿（公開中・確認待ち・公式のポケふたの訪問記録へ移したもの）を新しい順に最大500件。created_by・exif・緯度経度は返さない。anon には渡さない。';
