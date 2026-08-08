-- Official Pokefuta proximity is a publication boundary, not only an API hint.
-- A BEFORE INSERT trigger recomputes the nearest active official manhole so a
-- direct PostgREST insert cannot publish a row within 50 metres.

ALTER TABLE public.design_manhole
  DROP CONSTRAINT IF EXISTS design_manhole_status_check;

ALTER TABLE public.design_manhole
  ADD CONSTRAINT design_manhole_status_check
  CHECK (status IN ('published', 'needs_review', 'hidden'));

ALTER TABLE public.design_manhole
  ADD COLUMN IF NOT EXISTS nearby_official_manhole_id INTEGER
    REFERENCES public.manhole(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nearby_official_manhole_distance_m INTEGER,
  ADD COLUMN IF NOT EXISTS nearby_official_manhole_confirmed_at TIMESTAMPTZ;

ALTER TABLE public.design_manhole
  DROP CONSTRAINT IF EXISTS design_manhole_nearby_distance_nonnegative;

ALTER TABLE public.design_manhole
  ADD CONSTRAINT design_manhole_nearby_distance_nonnegative
  CHECK (
    nearby_official_manhole_distance_m IS NULL
    OR nearby_official_manhole_distance_m >= 0
  );

CREATE OR REPLACE FUNCTION public.enforce_design_manhole_nearby_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  candidate_id INTEGER;
  candidate_distance_m DOUBLE PRECISION;
  submitted_location extensions.geography;
BEGIN
  submitted_location := extensions.ST_SetSRID(
    extensions.ST_MakePoint(NEW.longitude, NEW.latitude),
    4326
  )::extensions.geography;

  SELECT m.id, extensions.ST_Distance(m.location, submitted_location)
    INTO candidate_id, candidate_distance_m
  FROM public.manhole AS m
  WHERE m.is_active = TRUE
    AND extensions.ST_DWithin(m.location, submitted_location, 50)
  ORDER BY extensions.ST_Distance(m.location, submitted_location), m.id
  LIMIT 1;

  IF candidate_id IS NOT NULL THEN
    NEW.nearby_official_manhole_id := candidate_id;
    NEW.nearby_official_manhole_distance_m := ROUND(candidate_distance_m)::INTEGER;
    IF NEW.status = 'published' THEN
      NEW.status := 'needs_review';
    END IF;
  ELSE
    NEW.nearby_official_manhole_id := NULL;
    NEW.nearby_official_manhole_distance_m := NULL;
    NEW.nearby_official_manhole_confirmed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_design_manhole_nearby_review() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_design_manhole_nearby_review_on_insert
  ON public.design_manhole;
CREATE TRIGGER enforce_design_manhole_nearby_review_on_insert
  BEFORE INSERT ON public.design_manhole
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_design_manhole_nearby_review();

-- The trigger runs before this RLS WITH CHECK. A nearby row submitted as
-- published is rewritten to needs_review and is still persisted for moderation.
DROP POLICY IF EXISTS design_manhole_users_insert_own ON public.design_manhole;
CREATE POLICY design_manhole_users_insert_own ON public.design_manhole
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND status IN ('published', 'needs_review')
  );

GRANT SELECT (
  nearby_official_manhole_id,
  nearby_official_manhole_distance_m,
  nearby_official_manhole_confirmed_at
) ON public.design_manhole TO authenticated;

COMMENT ON COLUMN public.design_manhole.nearby_official_manhole_id IS
  'Nearest active official Pokefuta within 50m, recomputed by DB trigger.';
COMMENT ON COLUMN public.design_manhole.nearby_official_manhole_confirmed_at IS
  'User explicitly confirmed this is a different lid; row still requires review.';
