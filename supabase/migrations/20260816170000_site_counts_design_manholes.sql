-- get_site_counts() に公開中のデザインマンホール数を足す。
--
-- トップのヒーロー文に枚数を出すため。数えるのは status = 'published' だけに限る。
-- design_manhole の RLS（design_manhole_public_select）は
-- `status = 'published' OR created_by = auth.uid()` なので、来訪者が一覧で見られるのは
-- published のみ。総数（needs_review / hidden を含む）を出すと、
-- 「26枚あります」と言いながら一覧に26枚しか無い、という食い違いになる。
--
-- RETURNS TABLE の列を足すには DROP が要る（CREATE OR REPLACE では返り値型を
-- 変更できない）。DROP と CREATE は同じマイグレーション＝同じトランザクション内で
-- 走るので、関数が消えている時間は事実上無い。仮に /api/site-stats が
-- その隙に呼んでも、スナップショットへ落ちるフォールバックがあるので画面は壊れない。
--
-- DROP で権限も消えるため、GRANT を明示的に貼り直している。

DROP FUNCTION IF EXISTS public.get_site_counts();

CREATE FUNCTION public.get_site_counts()
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
    (SELECT count(DISTINCT manhole_id) FROM public.photo)::bigint,
    (SELECT count(*) FROM public.app_user)::bigint,
    (SELECT count(*) FROM public.design_manhole WHERE status = 'published')::bigint;
$$;

ALTER FUNCTION public.get_site_counts() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_site_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO service_role;

COMMENT ON FUNCTION public.get_site_counts() IS
  'トップページ用のリアルタイム件数。集計値のみを返し、行は返さない。/api/site-stats が呼ぶ。';
