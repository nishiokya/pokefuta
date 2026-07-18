-- 既存 app_user.display_name が NULL/空のユーザーを auth.users の公開プロフィール名から補完する。
-- PR #179/#180 は今後の同期と公開読み取りを直したが、既存の NULL は残るため
-- 公開フィードで display_name が null のままになる。
-- email の @ 前は個人情報になり得るため公開表示名には使わない。
-- 優先順位は src/lib/auth/displayName.ts と揃える。

UPDATE public.app_user au
SET
  display_name = COALESCE(
    NULLIF(BTRIM(auth_user.raw_user_meta_data->>'display_name'), ''),
    NULLIF(BTRIM(auth_user.raw_user_meta_data->>'name'), ''),
    NULLIF(BTRIM(auth_user.raw_user_meta_data->>'full_name'), '')
  ),
  updated_at = NOW()
FROM auth.users auth_user
WHERE au.auth_uid = auth_user.id
  AND NULLIF(BTRIM(COALESCE(au.display_name, '')), '') IS NULL
  AND COALESCE(auth_user.is_anonymous, false) = false
  AND COALESCE(
    NULLIF(BTRIM(auth_user.raw_user_meta_data->>'display_name'), ''),
    NULLIF(BTRIM(auth_user.raw_user_meta_data->>'name'), ''),
    NULLIF(BTRIM(auth_user.raw_user_meta_data->>'full_name'), '')
  ) IS NOT NULL;
