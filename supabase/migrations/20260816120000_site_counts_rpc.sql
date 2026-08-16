-- トップページの件数をリアルタイム化するための集計RPC。
--
-- 背景: /api/site-stats は data.pokefuta.com の日次スナップショットを再配信していた。
-- 日次 bake なので夕方には ~17h 古く、その日の投稿が丸ごと落ちる。
-- 「いま N 枚の写真が集まっています」が昨日の数字なのは、この文言の主旨と合わない。
--
-- 既存の get_site_stats() は manholes_with_photos を返さない。返り値の列を足すには
-- DROP が要る（CREATE OR REPLACE では返り値型を変更できない）ため、既存を触らずに
-- 新しい関数を足す。get_site_stats() はアプリからの呼び出しが無く、型定義に
-- 残っているだけなので、この移行で壊れる利用者はいない。
--
-- SECURITY DEFINER なのは photo / visit の RLS を跨いで「非公開も含めた総数」を
-- 数えるため。返すのは集計値だけで行は一切返さないので、個別の非公開データは漏れない。
-- STABLE 指定により同一トランザクション内での再評価も避けられる。

CREATE OR REPLACE FUNCTION public.get_site_counts()
RETURNS TABLE (
  manholes bigint,
  posts bigint,
  public_posts bigint,
  manholes_with_photos bigint,
  users bigint
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
    (SELECT count(*) FROM public.app_user)::bigint;
$$;

ALTER FUNCTION public.get_site_counts() OWNER TO postgres;

-- 未ログインのトップページからも呼ぶので anon に実行権を渡す。
-- PUBLIC への暗黙の EXECUTE は明示的に剥がしてから名指しで配る。
REVOKE ALL ON FUNCTION public.get_site_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_counts() TO service_role;

COMMENT ON FUNCTION public.get_site_counts() IS
  'トップページ用のリアルタイム件数。集計値のみを返し、行は返さない。/api/site-stats が呼ぶ。';
