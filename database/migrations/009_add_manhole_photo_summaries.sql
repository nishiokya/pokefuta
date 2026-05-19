-- ==========================================
-- ポケふた - マンホール別写真集計
-- ==========================================
-- 目的: /api/manholes でカード用の写真枚数と最新写真をDB側で集計する

CREATE OR REPLACE FUNCTION public.get_manhole_photo_summaries(p_manhole_ids INTEGER[])
RETURNS TABLE(
  manhole_id INTEGER,
  photo_count BIGINT,
  latest_photo_id UUID,
  latest_storage_key TEXT,
  latest_thumbnail_320 TEXT,
  latest_thumbnail_800 TEXT,
  latest_thumbnail_1600 TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered_photos AS (
    SELECT
      p.id,
      p.manhole_id,
      p.storage_key,
      p.thumbnail_320,
      p.thumbnail_800,
      p.thumbnail_1600,
      p.created_at
    FROM public.photo p
    WHERE p.manhole_id = ANY(p_manhole_ids)
  ),
  counts AS (
    SELECT
      fp.manhole_id,
      COUNT(*)::BIGINT AS photo_count
    FROM filtered_photos fp
    GROUP BY fp.manhole_id
  ),
  latest AS (
    SELECT DISTINCT ON (fp.manhole_id)
      fp.manhole_id,
      fp.id AS latest_photo_id,
      fp.storage_key AS latest_storage_key,
      fp.thumbnail_320 AS latest_thumbnail_320,
      fp.thumbnail_800 AS latest_thumbnail_800,
      fp.thumbnail_1600 AS latest_thumbnail_1600
    FROM filtered_photos fp
    ORDER BY fp.manhole_id, fp.created_at DESC, fp.id DESC
  )
  SELECT
    c.manhole_id,
    c.photo_count,
    l.latest_photo_id,
    l.latest_storage_key,
    l.latest_thumbnail_320,
    l.latest_thumbnail_800,
    l.latest_thumbnail_1600
  FROM counts c
  JOIN latest l ON l.manhole_id = c.manhole_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_manhole_photo_summaries(INTEGER[]) TO anon, authenticated;
