-- display_name は公開フィード/コメントで使う公開情報。
-- app_user を匿名SELECT可能にせず、呼び出し側が既に持っている auth_uid だけを解決する。
-- これにより匿名クライアントから全ユーザーの auth_uid/display_name を列挙できない。

DROP VIEW IF EXISTS public.app_user_public_profile;

CREATE OR REPLACE FUNCTION get_public_display_names(p_auth_uids uuid[])
RETURNS TABLE (auth_uid uuid, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT au.auth_uid, au.display_name
  FROM app_user au
  WHERE au.auth_uid = ANY(p_auth_uids)
    AND (
      au.auth_uid = auth.uid()
      OR EXISTS (
        SELECT 1 FROM visit v
        WHERE v.user_id = au.auth_uid AND v.is_public = true
      )
      OR EXISTS (
        SELECT 1 FROM visit_comment vc
        JOIN visit v ON v.id = vc.visit_id
        WHERE vc.user_id = au.auth_uid AND v.is_public = true
      )
    );

  IF to_regclass('public.manhole_comment') IS NOT NULL THEN
    RETURN QUERY EXECUTE $query$
      SELECT au.auth_uid, au.display_name
      FROM app_user au
      WHERE au.auth_uid = ANY($1)
        AND EXISTS (
          SELECT 1 FROM manhole_comment mc
          WHERE mc.user_id = au.auth_uid
        )
    $query$ USING p_auth_uids;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION get_public_display_names(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_display_names(uuid[]) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_visit_user_public
  ON visit(user_id, is_public);

CREATE INDEX IF NOT EXISTS idx_visit_comment_user_visit
  ON visit_comment(user_id, visit_id);

DO $$
BEGIN
  IF to_regclass('public.manhole_comment') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_manhole_comment_user_id
      ON manhole_comment(user_id);
  END IF;
END $$;
