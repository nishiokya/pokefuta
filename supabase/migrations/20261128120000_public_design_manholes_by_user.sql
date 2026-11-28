-- 公開スタンプ帳（/users/[userId]）に「投稿したデザインマンホール」を並べるための一覧。
--
-- 今は公開IDの人が公開したデザインマンホールの「枚数」（get_public_design_manhole_count、ステッカー用）しか取れない。
-- 公開IDから投稿者の auth_uid は引けないので、表から created_by で絞ることもできない。
-- 枚数と同じ条件（app_user.id = 公開ID、status = 'published'）で、カードに要る列だけを新しい順に返す。
--
-- 公開中（published）の行は /design-manholes の一覧と詳細ですでに誰でも見られ、投稿者の公開スタンプ帳へもリンクされている。
-- ここで新しく見えるようになるものは無い（その人の公開分を1か所に集めるだけ）。
-- created_by・storage_key・exif・緯度経度は返さない。
-- 読むだけの関数を1つ足すだけで、表・既存の関数・権限は変えない。
--
-- ロールバック:
--   DROP FUNCTION IF EXISTS public.get_public_design_manholes(uuid);

CREATE OR REPLACE FUNCTION public.get_public_design_manholes(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT d.id, d.title, d.description, d.created_at
  FROM public.design_manhole d
  JOIN public.app_user au ON au.auth_uid = d.created_by
  WHERE au.id = p_user_id
    AND d.status = 'published'
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT 60;
$function$;

REVOKE ALL ON FUNCTION public.get_public_design_manholes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_design_manholes(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_design_manholes(uuid) IS
  '公開IDの人が公開(published)したデザインマンホールを新しい順に最大60件（id・title・description・created_at）。'
  ' 公開スタンプ帳用。条件は get_public_design_manhole_count と同じ。created_by・storage_key・緯度経度は返さない。';
