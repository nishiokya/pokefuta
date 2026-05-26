-- email は auth.users 側で管理するため app_user から削除
ALTER TABLE app_user DROP COLUMN IF EXISTS email;
