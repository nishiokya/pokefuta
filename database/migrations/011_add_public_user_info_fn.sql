-- app_user テーブルには email 等のプライベートデータが含まれるため、
-- anon ロールに直接 SELECT を許可せず、公開プロフィールページに必要な最小限の列のみを
-- SECURITY DEFINER 関数で安全に公開する

DROP FUNCTION IF EXISTS get_public_user_info(uuid);

CREATE OR REPLACE FUNCTION get_public_user_info(p_user_id uuid)
RETURNS TABLE (auth_uid uuid, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.auth_uid, au.display_name
  FROM app_user au
  WHERE au.id = p_user_id;
$$;

-- anon と authenticated ロールに実行権限を付与
GRANT EXECUTE ON FUNCTION get_public_user_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_public_user_info(uuid) TO authenticated;
