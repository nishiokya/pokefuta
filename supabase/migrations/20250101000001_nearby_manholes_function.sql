-- Create function to find nearby manholes using PostGIS
CREATE OR REPLACE FUNCTION get_nearby_manholes(
  search_lat DOUBLE PRECISION,
  search_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 10,
  max_results INTEGER DEFAULT 50
)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  prefecture TEXT,
  municipality TEXT,
  location GEOGRAPHY,
  pokemons TEXT[],
  detail_url TEXT,
  prefecture_site_url TEXT,
  source_last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_km DOUBLE PRECISION,
  name TEXT,
  description TEXT,
  city TEXT,
  address TEXT,
  is_visited BOOLEAN,
  last_visit TIMESTAMPTZ,
  photo_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.title,
    m.prefecture,
    m.municipality,
    m.location,
    m.pokemons,
    m.detail_url,
    m.prefecture_site_url,
    m.source_last_checked,
    m.created_at,
    m.updated_at,
    ST_Y(m.location::geometry) as latitude,
    ST_X(m.location::geometry) as longitude,
    (ST_Distance(
      m.location,
      ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography
    ) / 1000)::DOUBLE PRECISION as distance_km,
    m.title as name,
    ''::TEXT as description,
    COALESCE(m.municipality, '')::TEXT as city,
    ''::TEXT as address,
    false as is_visited,
    null::TIMESTAMPTZ as last_visit,
    0 as photo_count
  FROM manhole m
  WHERE ST_DWithin(
    m.location,
    ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography,
    radius_km * 1000
  )
  ORDER BY distance_km ASC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;