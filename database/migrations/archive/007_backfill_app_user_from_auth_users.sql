-- ==========================================
-- Migration: 既存 auth.users から app_user を一括作成
-- ファイル名: 007_backfill_app_user_from_auth_users.sql
-- 作成日: 2026-05-10
-- 目的: PR #51 マージ前に、既存認証ユーザーの app_user レコードを作成
-- ==========================================

-- ==========================================
-- ステップ 1: 作成対象の数を確認
-- ==========================================

DO $$
DECLARE
  count_to_create INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_to_create
  FROM auth.users au
  WHERE NOT EXISTS (
    SELECT 1 FROM public.app_user pu 
    WHERE pu.auth_uid = au.id
  )
  AND au.email_confirmed_at IS NOT NULL
  AND NOT au.is_anonymous;
  
  RAISE NOTICE 'Found % auth users without corresponding app_user', count_to_create;
END $$;

-- ==========================================
-- ステップ 2: app_user を一括作成
-- ==========================================

INSERT INTO public.app_user (auth_uid, display_name, created_at, updated_at)
SELECT 
  au.id as auth_uid,
  COALESCE(
    au.raw_user_meta_data->>'display_name',
    SPLIT_PART(au.email, '@', 1)  -- email の @前の部分を display_name とする
  ) as display_name,
  NOW() as created_at,
  NOW() as updated_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_user pu 
  WHERE pu.auth_uid = au.id
)
AND au.email_confirmed_at IS NOT NULL
AND NOT au.is_anonymous
ON CONFLICT (auth_uid) DO NOTHING;

-- ==========================================
-- ステップ 3: 作成完了の確認
-- ==========================================

DO $$
DECLARE
  remaining_orphans INTEGER;
  total_app_users INTEGER;
BEGIN
  -- 作成後の orphan auth.users 数
  SELECT COUNT(*) INTO remaining_orphans
  FROM auth.users au
  WHERE NOT EXISTS (
    SELECT 1 FROM public.app_user pu 
    WHERE pu.auth_uid = au.id
  )
  AND au.email_confirmed_at IS NOT NULL
  AND NOT au.is_anonymous;
  
  -- 総 app_user 数
  SELECT COUNT(*) INTO total_app_users
  FROM public.app_user;
  
  RAISE NOTICE 'Created app_users for auth users. Total app_users: %', total_app_users;
  
  IF remaining_orphans > 0 THEN
    RAISE WARNING 'Warning: % auth users still without app_user', remaining_orphans;
  ELSE
    RAISE NOTICE 'Success: All verified auth users now have app_user records!';
  END IF;
END $$;

-- ==========================================
-- ステップ 4: データ一貫性チェック（手動実行用）
-- ==========================================

-- 確認: 作成されたレコード例
-- SELECT * FROM public.app_user 
-- WHERE created_at > NOW() - INTERVAL '1 hour'
-- LIMIT 10;

-- 確認: 対応関係の確認
-- SELECT 
--   au.id,
--   au.email,
--   pu.id as app_user_id,
--   pu.display_name
-- FROM auth.users au
-- LEFT JOIN public.app_user pu ON au.id = pu.auth_uid
-- WHERE au.email_confirmed_at IS NOT NULL
-- AND NOT au.is_anonymous
-- ORDER BY au.created_at DESC
-- LIMIT 20;
