-- Add optional context images attached to manholes.
-- These images are uploaded by the iOS app and keep Shot Context Classifier output.
-- They intentionally do not reference visit/photo records, so this migration does
-- not affect existing post visibility, post deletion, or photo deletion behavior.
--
-- Before running this migration in production, take a Supabase database backup:
-- 1. Open Supabase Dashboard > Project > Database > Backups.
-- 2. Confirm the latest automatic backup is recent enough for rollback.
-- 3. If Point-in-Time Recovery is enabled, note the current timestamp.
-- 4. For an extra manual export, run:
--    supabase db dump --db-url "$SUPABASE_DB_URL" -f backups/pre_015_photo_context_images.sql
-- 5. Verify the dump file exists and is non-empty before applying this migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shot_context_label') THEN
    CREATE TYPE public.shot_context_label AS ENUM (
      'centered_clean',
      'selfie_with_manhole',
      'wide_context',
      'signage_info',
      'partial_occluded',
      'not_relevant',
      'low_quality'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.photo_context_image (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  manhole_id INTEGER NOT NULL REFERENCES public.manhole(id) ON DELETE CASCADE,

  storage_provider TEXT NOT NULL DEFAULT 'r2',
  storage_key TEXT NOT NULL UNIQUE,

  original_name TEXT,
  content_type TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  sha256 TEXT,
  exif JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  shot_context_label public.shot_context_label,
  shot_context_confidence DOUBLE PRECISION,
  shot_context_confidences JSONB,

  source_platform TEXT NOT NULL DEFAULT 'ios',
  app_version TEXT,
  device_model TEXT,

  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photo_context_image_ios_only'
  ) THEN
    ALTER TABLE public.photo_context_image
      ADD CONSTRAINT photo_context_image_ios_only
      CHECK (source_platform = 'ios');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photo_context_image_content_type'
  ) THEN
    ALTER TABLE public.photo_context_image
      ADD CONSTRAINT photo_context_image_content_type
      CHECK (content_type IN ('image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photo_context_image_file_size'
  ) THEN
    ALTER TABLE public.photo_context_image
      ADD CONSTRAINT photo_context_image_file_size
      CHECK (file_size IS NULL OR file_size <= 10485760);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_photo_context_image_manhole_id
  ON public.photo_context_image(manhole_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_photo_context_image_created_by
  ON public.photo_context_image(created_by);

DROP TRIGGER IF EXISTS update_photo_context_image_updated_at ON public.photo_context_image;
CREATE TRIGGER update_photo_context_image_updated_at
  BEFORE UPDATE ON public.photo_context_image
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.photo_context_image ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_photo_context_images" ON public.photo_context_image;
CREATE POLICY "users_select_own_photo_context_images"
ON public.photo_context_image FOR SELECT
USING (created_by = auth.uid());

DROP POLICY IF EXISTS "users_insert_own_ios_photo_context_images" ON public.photo_context_image;
CREATE POLICY "users_insert_own_ios_photo_context_images"
ON public.photo_context_image FOR INSERT
WITH CHECK (
  source_platform = 'ios'
  AND created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.manhole m
    WHERE m.id = photo_context_image.manhole_id
  )
);

DROP POLICY IF EXISTS "users_update_own_photo_context_images" ON public.photo_context_image;
CREATE POLICY "users_update_own_photo_context_images"
ON public.photo_context_image FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (
  created_by = auth.uid()
  AND source_platform = 'ios'
);

DROP POLICY IF EXISTS "users_delete_own_photo_context_images" ON public.photo_context_image;
CREATE POLICY "users_delete_own_photo_context_images"
ON public.photo_context_image FOR DELETE
USING (created_by = auth.uid());
