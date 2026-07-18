-- Migration: Add manhole title/share metadata
-- Description: Stores upstream title badges and share metadata from pokefuta.ndjson

ALTER TABLE IF EXISTS public.manhole
ADD COLUMN IF NOT EXISTS address_norm TEXT,
ADD COLUMN IF NOT EXISTS building TEXT,
ADD COLUMN IF NOT EXISTS official_url TEXT,
ADD COLUMN IF NOT EXISTS titles JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS hashtags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS title_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_manhole_titles_gin ON public.manhole USING GIN(titles);
CREATE INDEX IF NOT EXISTS idx_manhole_title_tags_gin ON public.manhole USING GIN(title_tags);
CREATE INDEX IF NOT EXISTS idx_manhole_official_url ON public.manhole(official_url);

COMMENT ON COLUMN public.manhole.address_norm IS '正規化済み住所（pokefuta.ndjson / manhole title metadata 由来）';
COMMENT ON COLUMN public.manhole.building IS '設置場所の建物・目印（pokefuta.ndjson 由来）';
COMMENT ON COLUMN public.manhole.official_url IS '公式案内URL（pokefuta.ndjson 由来）';
COMMENT ON COLUMN public.manhole.titles IS 'SNS/詳細表示用の称号タグ配列（upstream generated titles）';
COMMENT ON COLUMN public.manhole.hashtags IS '称号由来の共有用ハッシュタグ（#付き）';
COMMENT ON COLUMN public.manhole.title_tags IS '称号キー配列（検索・絞り込み用）';
