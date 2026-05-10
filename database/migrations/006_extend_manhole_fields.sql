-- Migration: Extend Manhole Table with Normalized Fields
-- Description: Adds prefecture_id, prefecture_code, and metadata fields for optimization
-- This enables better integration with the prefecture badge system
-- Backward compatible: No breaking changes to existing data

-- ==========================================
-- 1. Add new columns to manhole table
-- ==========================================

ALTER TABLE IF EXISTS public.manhole
ADD COLUMN IF NOT EXISTS prefecture_id INTEGER REFERENCES public.prefecture(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS prefecture_code VARCHAR(2),
ADD COLUMN IF NOT EXISTS region TEXT,  -- e.g., '関東', '関西'
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS data_source TEXT,  -- e.g., 'pokefuta-scraper-v1.0'
ADD COLUMN IF NOT EXISTS address TEXT,  -- 詳細住所（例：東京都稲城市矢野口4015-1）
ADD COLUMN IF NOT EXISTS prefecture_site_url TEXT;  -- 都道府県の公式サイトURL

-- ==========================================
-- 2. Create indexes for performance
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_manhole_prefecture_id ON public.manhole(prefecture_id);
CREATE INDEX IF NOT EXISTS idx_manhole_prefecture_code ON public.manhole(prefecture_code);
CREATE INDEX IF NOT EXISTS idx_manhole_is_active ON public.manhole(is_active);
CREATE INDEX IF NOT EXISTS idx_manhole_region ON public.manhole(region);
CREATE INDEX IF NOT EXISTS idx_manhole_last_verified_at ON public.manhole(last_verified_at);
CREATE INDEX IF NOT EXISTS idx_manhole_address ON public.manhole(address);
CREATE INDEX IF NOT EXISTS idx_manhole_prefecture_site_url ON public.manhole(prefecture_site_url);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_manhole_prefecture_active ON public.manhole(prefecture_id, is_active);

-- ==========================================
-- 3. Update existing data
-- ==========================================

-- Populate prefecture_id from prefecture table by name matching
UPDATE public.manhole m
SET prefecture_id = p.id
FROM public.prefecture p
WHERE m.prefecture = p.name AND m.prefecture_id IS NULL;

-- Populate prefecture_code from prefecture table
UPDATE public.manhole m
SET prefecture_code = p.code
FROM public.prefecture p
WHERE m.prefecture_id = p.id AND m.prefecture_code IS NULL;

-- ==========================================
-- 4. Set region based on prefecture
-- ==========================================

-- Hokkaido region
UPDATE public.manhole SET region = '北海道' WHERE prefecture_code = '01';

-- Tohoku region
UPDATE public.manhole SET region = '東北' WHERE prefecture_code IN ('02', '03', '04', '05', '06', '07');

-- Kanto region
UPDATE public.manhole SET region = '関東' WHERE prefecture_code IN ('08', '09', '10', '11', '12', '13', '14');

-- Chubu region
UPDATE public.manhole SET region = '中部' WHERE prefecture_code IN ('15', '16', '17', '18', '19', '20', '21', '22', '23');

-- Kansai/Kinki region
UPDATE public.manhole SET region = '関西' WHERE prefecture_code IN ('24', '25', '26', '27', '28', '29', '30');

-- Chugoku region
UPDATE public.manhole SET region = '中国' WHERE prefecture_code IN ('31', '32', '33', '34', '35');

-- Shikoku region
UPDATE public.manhole SET region = '四国' WHERE prefecture_code IN ('36', '37', '38', '39');

-- Kyushu/Okinawa region
UPDATE public.manhole SET region = '九州沖縄' WHERE prefecture_code IN ('40', '41', '42', '43', '44', '45', '46', '47');

-- ==========================================
-- 5. Add comment/documentation
-- ==========================================

COMMENT ON COLUMN public.manhole.prefecture_id IS '都道府県 ID (prefecture テーブルへの外部キー)';
COMMENT ON COLUMN public.manhole.prefecture_code IS '都道府県コード (01-47)';
COMMENT ON COLUMN public.manhole.region IS '地域名 (北海道、東北、関東、中部、関西、中国、四国、九州沖縄)';
COMMENT ON COLUMN public.manhole.is_active IS 'アクティブフラグ (true: 存在、false: 廃止/休止)';
COMMENT ON COLUMN public.manhole.last_verified_at IS 'データが最後に確認された日時';
COMMENT ON COLUMN public.manhole.data_source IS 'データのソース/スクレイパーバージョン';
COMMENT ON COLUMN public.manhole.address IS '詳細住所 (例: 東京都稲城市矢野口4015-1)';
COMMENT ON COLUMN public.manhole.prefecture_site_url IS '都道府県の公式サイトURL';
