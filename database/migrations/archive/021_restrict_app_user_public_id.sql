-- migration 020 の `GRANT SELECT (id) ON app_user TO anon, authenticated;` は
-- 「公開訪問ページ用に app_user.id だけを読めるようにする」つもりだったが、
-- 列GRANTには行フィルタが無いため anon key で
-- `select id,auth_uid,display_name from app_user` を叩くと
-- 公開訪問が1件も無いユーザーを含む全ユーザーの id を列挙できてしまう
-- （PRレビュー指摘: critical, id 列挙による不特定多数のURL探索リスク）。
--
-- 修正方針:
--   1. 020 の列GRANTを取り消す。
--   2. 「公開(is_public=true)の訪問記録を1件以上持つユーザー」に限定して
--      auth_uid -> id を解決する SECURITY DEFINER 関数を用意し、
--      呼び出し元 (visits API / 写真エクスポート) はこの関数経由でのみ
--      public_user_id を解決する。

REVOKE SELECT (id) ON app_user FROM anon, authenticated;

CREATE OR REPLACE FUNCTION get_public_user_ids(p_auth_uids uuid[])
RETURNS TABLE (auth_uid uuid, public_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT au.auth_uid, au.id
  FROM app_user au
  WHERE au.auth_uid = ANY(p_auth_uids)
    AND EXISTS (
      SELECT 1 FROM visit v
      WHERE v.user_id = au.auth_uid AND v.is_public = true
    );
$$;

REVOKE ALL ON FUNCTION get_public_user_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_user_ids(uuid[]) TO anon, authenticated;
