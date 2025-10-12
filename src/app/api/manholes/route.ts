import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

// Helper function to extract coordinates from PostGIS WKB (Well-Known Binary) format
function extractCoordinatesFromWKB(wkbHex: string): { lat: number; lng: number } | null {
  if (!wkbHex || typeof wkbHex !== 'string') return null;

  try {
    // Remove any prefix like "0x" if present
    const cleanHex = wkbHex.startsWith('0x') ? wkbHex.slice(2) : wkbHex;

    // PostGIS WKB format varies, but we need at least 50 characters for POINT
    if (cleanHex.length < 50) return null;

    // Try different coordinate start positions for different WKB formats
    const possibleStarts = [42, 18, 34, 50]; // Various POINT WKB formats

    for (const coordStart of possibleStarts) {
      if (coordStart + 32 <= cleanHex.length) {
        try {
          // Extract longitude (8 bytes = 16 hex chars)
          const lngHex = cleanHex.substring(coordStart, coordStart + 16);
          // Extract latitude (next 8 bytes = 16 hex chars)
          const latHex = cleanHex.substring(coordStart + 16, coordStart + 32);

          // Ensure we have valid hex strings
          if (lngHex.length === 16 && latHex.length === 16) {
            // Convert hex to little-endian double
            const lngBuffer = Buffer.from(lngHex, 'hex');
            const latBuffer = Buffer.from(latHex, 'hex');

            const lng = lngBuffer.readDoubleLE(0);
            const lat = latBuffer.readDoubleLE(0);

            // Validate coordinates are reasonable
            if (lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
              return { lat, lng };
            }
          }
        } catch (parseError) {
          // Try next position
          continue;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing WKB:', error);
    return null;
  }
}

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Get query parameters
    const lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : null;
    const lng = searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : null;
    const radius = parseFloat(searchParams.get('radius') || '50'); // km, default 50km
    const limit = parseInt(searchParams.get('limit') || '500');
    const visited = searchParams.get('visited'); // 'true', 'false', or null for all

    // Validate radius (max 100km for performance)
    if (radius > 100) {
      return NextResponse.json(
        { error: 'Maximum radius is 100km' },
        { status: 400 }
      );
    }

    // Check if this is a nearby search (lat/lng provided)
    const isNearbySearch = lat !== null && lng !== null;

    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('dummy')) {
      console.error('Supabase is not configured properly');
      return NextResponse.json(
        { error: 'Database configuration error. Please check your Supabase settings.' },
        { status: 500 }
      );
    }

    const supabase = createRouteHandlerClient<Database>({ cookies });

    try {
      // Query all manholes from database
      const { data: allManholes, error: queryError } = await supabase
        .from('manhole')
        .select('*')
        .limit(1000);

      if (queryError) {
        console.error('Database query error:', queryError);
        throw new Error(`Database query failed: ${queryError.message}`);
      }

      if (!allManholes || allManholes.length === 0) {
        console.log('No manholes found in database');
        return NextResponse.json({
          success: true,
          manholes: [],
          total: 0,
          with_photos: 0
        });
      }

      // 写真があるマンホールのIDを取得
      const { data: photosData, error: photosError } = await supabase
        .from('photo')
        .select('manhole_id')
        .not('manhole_id', 'is', null);

      const manholesWithPhotosSet = new Set(
        photosData?.map(p => p.manhole_id) || []
      );

      if (isNearbySearch) {
        console.log(`Searching for manholes within ${radius}km of ${lat}, ${lng}`);

        // Process manholes and extract real coordinates from PostGIS location field
        const manholesWithDistance = allManholes
          .map(manhole => {
            const realCoords = extractCoordinatesFromWKB(manhole.location);

            if (!realCoords) {
              return null; // Skip manholes without extractable coordinates
            }

            const distance = calculateDistance(lat!, lng!, realCoords.lat, realCoords.lng);

            const hasPhotos = manholesWithPhotosSet.has(manhole.id);

            return {
              ...manhole,
              name: manhole.title || 'ポケふた',
              city: manhole.municipality || '',
              latitude: realCoords.lat,
              longitude: realCoords.lng,
              is_visited: false,
              last_visit: null,
              photo_count: hasPhotos ? 1 : 0,
              distance: distance
            };
          })
          .filter(manhole => manhole !== null)
          .filter(manhole => manhole.distance <= radius)
          .filter(manhole => {
            if (visited === 'true') return manhole.is_visited;
            if (visited === 'false') return !manhole.is_visited;
            return true;
          })
          .sort((a, b) => a.distance - b.distance)
          .slice(0, limit);

        console.log(`Found ${manholesWithDistance.length} nearby manholes`);
        return NextResponse.json({
          success: true,
          manholes: manholesWithDistance,
          total: allManholes.length,
          with_photos: manholesWithPhotosSet.size
        });
      }

      // Regular search for all manholes (no location filtering)
      console.log(`Processing ${allManholes.length} manholes from database`);

      const manholesWithCoordinates = allManholes
        .map(manhole => {
          const realCoords = extractCoordinatesFromWKB(manhole.location);

          if (!realCoords) {
            return null; // Skip manholes without extractable coordinates
          }

          const hasPhotos = manholesWithPhotosSet.has(manhole.id);

          return {
            ...manhole,
            name: manhole.title || 'ポケふた',
            city: manhole.municipality || '',
            latitude: realCoords.lat,
            longitude: realCoords.lng,
            is_visited: false,
            last_visit: null,
            photo_count: hasPhotos ? 1 : 0
          };
        })
        .filter(manhole => manhole !== null)
        .filter(manhole => {
          if (visited === 'true') return manhole.is_visited;
          if (visited === 'false') return !manhole.is_visited;
          return true;
        })
        .slice(0, limit);

      console.log(`Returning ${manholesWithCoordinates.length} manholes with coordinates`);
      return NextResponse.json({
        success: true,
        manholes: manholesWithCoordinates,
        total: allManholes.length,
        with_photos: manholesWithPhotosSet.size
      });

    } catch (dbError) {
      console.error('Database error:', (dbError as Error).message);
      return NextResponse.json(
        { error: 'Database query failed. Please try again later.' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const body = await request.json();

    const { title, prefecture, municipality, latitude, longitude, detail_url, pokemons } = body;

    if (!title || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Title, latitude, and longitude are required' },
        { status: 400 }
      );
    }

    const { data: manhole, error } = await supabase
      .from('manhole')
      .insert({
        title,
        prefecture,
        municipality,
        location: `POINT(${longitude} ${latitude})`,
        detail_url,
        pokemons,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating manhole:', error);
      return NextResponse.json(
        { error: 'Failed to create manhole' },
        { status: 500 }
      );
    }

    return NextResponse.json(manhole, { status: 201 });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}