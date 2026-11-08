-- 公開デザインマンホール自体を、投稿者プロフィールへのリンクの根拠にする。
-- get_public_user_ids は公開訪問・コメントだけを対象にするため、
-- デザインマンホールだけを投稿した人に NULL を返していた。
-- プロフィールは get_public_profile と同じ公開IDで参照し、auth_uid は返さない。
CREATE OR REPLACE FUNCTION public.get_design_manhole_submitter_public_id(p_design_manhole_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT au.id
  FROM design_manhole d
  JOIN app_user au ON au.auth_uid = d.created_by
  WHERE d.id = p_design_manhole_id
    AND d.status = 'published';
$function$;

REVOKE ALL ON FUNCTION public.get_design_manhole_submitter_public_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_design_manhole_submitter_public_id(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_design_manhole_submitter_public_id(uuid) IS
  '公開済みデザインマンホールの投稿者の公開ID。公開訪問・コメントの有無は問わない。'
  ' hidden・needs_review・投稿者プロフィールなしは NULL。auth_uid は返さない。';
