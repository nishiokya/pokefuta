-- ログイン中ユーザーが自分の app_user.id を取得するための関数
-- ブラウザクライアントで app_user を直接 SELECT する代わりに使う
-- （RLS や JWT ヘッダーの問題を回避しつつ、auth.uid() で本人確認）

CREATE OR REPLACE FUNCTION get_my_app_user_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM app_user WHERE auth_uid = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_my_app_user_id() TO authenticated;
