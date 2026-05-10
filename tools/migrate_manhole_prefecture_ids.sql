-- ========================================
-- Helper: Populate prefecture_id and prefecture_code for existing data
-- ========================================
-- このスクリプトは、既存のマンホールデータに prefecture_id と prefecture_code を埋める
-- マイグレーション 006 実行後に実行してください

-- Step 1: Populate prefecture_id from prefecture table by name matching
UPDATE public.manhole m
SET prefecture_id = p.id
FROM public.prefecture p
WHERE m.prefecture = p.name AND m.prefecture_id IS NULL;

-- Step 2: Populate prefecture_code from prefecture table
UPDATE public.manhole m
SET prefecture_code = p.code
FROM public.prefecture p
WHERE m.prefecture_id = p.id AND m.prefecture_code IS NULL;

-- Step 3: Set region based on prefecture_code
UPDATE public.manhole SET region = '北海道' WHERE prefecture_code = '01' AND region IS NULL;
UPDATE public.manhole SET region = '東北' WHERE prefecture_code IN ('02', '03', '04', '05', '06', '07') AND region IS NULL;
UPDATE public.manhole SET region = '関東' WHERE prefecture_code IN ('08', '09', '10', '11', '12', '13', '14') AND region IS NULL;
UPDATE public.manhole SET region = '中部' WHERE prefecture_code IN ('15', '16', '17', '18', '19', '20', '21', '22', '23') AND region IS NULL;
UPDATE public.manhole SET region = '関西' WHERE prefecture_code IN ('24', '25', '26', '27', '28', '29', '30') AND region IS NULL;
UPDATE public.manhole SET region = '中国' WHERE prefecture_code IN ('31', '32', '33', '34', '35') AND region IS NULL;
UPDATE public.manhole SET region = '四国' WHERE prefecture_code IN ('36', '37', '38', '39') AND region IS NULL;
UPDATE public.manhole SET region = '九州沖縄' WHERE prefecture_code IN ('40', '41', '42', '43', '44', '45', '46', '47') AND region IS NULL;

-- Step 4: Verify the updates
SELECT 
  COUNT(*) as total,
  COUNT(prefecture_id) as prefecture_id_filled,
  COUNT(prefecture_code) as prefecture_code_filled,
  COUNT(region) as region_filled
FROM public.manhole;

-- Step 5: Display summary
SELECT 
  'Data Migration Summary' as step,
  COUNT(*) as count
FROM public.manhole
WHERE prefecture_id IS NOT NULL AND prefecture_code IS NOT NULL;
