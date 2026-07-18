-- /users/[userId]/visits の公開スタンプ帳機能で、既存のRLS/カラム権限に阻まれず
-- anon/authenticated ロールが app_user.id (公開URLキー) を直接SELECTできるようにする。
-- 検証: `select id,auth_uid,display_name from app_user` を anon key で叩くと
-- 42501 permission denied for table app_user (id列のみ権限不足) になることを確認済み。
-- display_name/auth_uid は既存権限で読めているため id 列のみ追加付与する。
GRANT SELECT (id) ON app_user TO anon, authenticated;
