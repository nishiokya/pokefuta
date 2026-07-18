-- 認証済みユーザーが自分自身の app_user 行を読めるようにする
-- （ホームページでの currentUserId 取得に必要）
-- anon ロールは引き続き直接アクセス不可（公開情報は get_public_user_info() 経由）

DROP POLICY IF EXISTS "users_select_own_app_user" ON app_user;
CREATE POLICY "users_select_own_app_user"
ON app_user FOR SELECT
USING (auth.uid() = auth_uid);
