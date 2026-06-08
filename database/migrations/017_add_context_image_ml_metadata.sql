-- Add ML classifier, detection, and annotation metadata to iOS context images.

ALTER TABLE public.photo_context_image
  ADD COLUMN IF NOT EXISTS manhole_classifier_label TEXT,
  ADD COLUMN IF NOT EXISTS manhole_classifier_confidence DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS manhole_detection_result JSONB,
  ADD COLUMN IF NOT EXISTS overlay_quality_grade TEXT,
  ADD COLUMN IF NOT EXISTS annotation_manhole_label TEXT,
  ADD COLUMN IF NOT EXISTS annotation_shot_context_label public.shot_context_label;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photo_context_image_manhole_classifier_label'
  ) THEN
    ALTER TABLE public.photo_context_image
      ADD CONSTRAINT photo_context_image_manhole_classifier_label
      CHECK (manhole_classifier_label IS NULL OR manhole_classifier_label IN ('manhole', 'not_manhole'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photo_context_image_manhole_classifier_confidence'
  ) THEN
    ALTER TABLE public.photo_context_image
      ADD CONSTRAINT photo_context_image_manhole_classifier_confidence
      CHECK (
        manhole_classifier_confidence IS NULL
        OR (manhole_classifier_confidence >= 0 AND manhole_classifier_confidence <= 1)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photo_context_image_overlay_quality_grade'
  ) THEN
    ALTER TABLE public.photo_context_image
      ADD CONSTRAINT photo_context_image_overlay_quality_grade
      CHECK (overlay_quality_grade IS NULL OR overlay_quality_grade IN ('p', 'e', 'g', 'f', 'b'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photo_context_image_annotation_manhole_label'
  ) THEN
    ALTER TABLE public.photo_context_image
      ADD CONSTRAINT photo_context_image_annotation_manhole_label
      CHECK (annotation_manhole_label IS NULL OR annotation_manhole_label IN ('manhole', 'not_manhole'));
  END IF;
END $$;
