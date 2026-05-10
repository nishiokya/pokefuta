-- ==========================================
-- Orphan Visit 修復マイグレーション
-- 作成日: 2026-05-10
-- 目的: visit テーブル内の orphan レコードを修復
--       (app_user に存在しない user_id を持つ visit)
-- ==========================================

-- 修復前に orphan visit の数を確認するログ
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.visit v
  WHERE v.user_id IS NOT NULL 
    AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id);
  
  RAISE NOTICE 'Before cleanup: % orphan visits found', orphan_count;
END $$;

-- ==========================================
-- ステップ 1: auth.users から orphan visit ユーザーを特定
-- ==========================================

-- 一時テーブル: orphan user リスト作成
CREATE TEMPORARY TABLE temp_orphan_users AS
SELECT DISTINCT v.user_id
FROM public.visit v
WHERE v.user_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id);

-- ==========================================
-- ステップ 2: app_user テーブルに不足ユーザーを作成
-- ==========================================

INSERT INTO public.app_user (auth_uid, display_name, email, created_at, updated_at)
SELECT DISTINCT
  tou.user_id,
  COALESCE(au.email, 'User')::TEXT as display_name,
  au.email,
  NOW(),
  NOW()
FROM temp_orphan_users tou
LEFT JOIN auth.users au ON tou.user_id = au.id
WHERE NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = tou.user_id)
ON CONFLICT (auth_uid) DO NOTHING;

-- ==========================================
-- ステップ 3: 修復完了の確認
-- ==========================================

DO $$
DECLARE
  remaining_orphans INTEGER;
  created_users INTEGER;
BEGIN
  -- 修復後の orphan visit 数を確認
  SELECT COUNT(*) INTO remaining_orphans
  FROM public.visit v
  WHERE v.user_id IS NOT NULL 
    AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id);
  
  -- 新規作成された app_user を確認
  SELECT COUNT(*) INTO created_users
  FROM temp_orphan_users;
  
  RAISE NOTICE 'Created % app_user records', created_users;
  RAISE NOTICE 'After cleanup: % remaining orphan visits', remaining_orphans;
  
  IF remaining_orphans > 0 THEN
    RAISE WARNING 'Warning: % orphan visits remain after cleanup', remaining_orphans;
  ELSE
    RAISE NOTICE 'Success: All orphan visits have been repaired!';
  END IF;
END $$;

-- ==========================================
-- ステップ 4: 検証クエリ（手動実行用）
-- ==========================================

-- 確認: orphan visit がなくなったか？
-- SELECT COUNT(*) as remaining_orphan_visits
-- FROM public.visit v
-- WHERE v.user_id IS NOT NULL 
--   AND NOT EXISTS (SELECT 1 FROM public.app_user u WHERE u.auth_uid = v.user_id);

-- 確認: 修復済みユーザーの visit 統計
-- SELECT 
--   u.id as app_user_id,
--   u.auth_uid,
--   u.display_name,
--   COUNT(v.id) as visit_count
-- FROM public.app_user u
-- LEFT JOIN public.visit v ON u.auth_uid = v.user_id
-- WHERE u.created_at > NOW() - INTERVAL '1 day'
-- GROUP BY u.id, u.auth_uid, u.display_name
-- ORDER BY COUNT(v.id) DESC;
