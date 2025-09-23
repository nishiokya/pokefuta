import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

// Helper functions to extract coordinates from PostGIS format
function extractLatFromLocation(location: string): number | undefined {
  if (!location) return undefined;
  const match = location.match(/POINT\(([^\s]+)\s+([^\s]+)\)/);
  return match ? parseFloat(match[2]) : undefined;
}

function extractLngFromLocation(location: string): number | undefined {
  if (!location) return undefined;
  const match = location.match(/POINT\(([^\s]+)\s+([^\s]+)\)/);
  return match ? parseFloat(match[1]) : undefined;
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

// Helper function to get estimated coordinates based on location
function getEstimatedCoordinates(prefecture: string, municipality: string): { lat: number; lng: number } {
  if (municipality?.includes('名古屋')) {
    return { lat: 35.1815, lng: 136.9066 };
  } else if (municipality?.includes('東京') || prefecture === '東京都') {
    return { lat: 35.6762, lng: 139.6503 };
  } else if (municipality?.includes('大阪') || prefecture === '大阪府') {
    return { lat: 34.6937, lng: 135.5023 };
  } else if (municipality?.includes('横浜') || prefecture === '神奈川県') {
    return { lat: 35.4437, lng: 139.6380 };
  } else if (municipality?.includes('札幌') || prefecture === '北海道') {
    return { lat: 43.0642, lng: 141.3469 };
  } else if (municipality?.includes('福岡') || prefecture === '福岡県') {
    return { lat: 33.5904, lng: 130.4017 };
  } else if (prefecture === '宮城県') {
    return { lat: 38.2682, lng: 140.8694 };
  } else if (prefecture === '岩手県') {
    return { lat: 39.7036, lng: 141.1527 };
  } else if (prefecture === '鹿児島県') {
    return { lat: 31.5966, lng: 130.5571 };
  } else if (prefecture === '香川県') {
    return { lat: 34.3401, lng: 134.0438 };
  } else if (prefecture === '三重県') {
    return { lat: 34.7303, lng: 136.5087 };
  } else if (prefecture === '京都府') {
    return { lat: 35.0116, lng: 135.7681 };
  } else if (prefecture === '佐賀県') {
    return { lat: 33.2494, lng: 130.2989 };
  } else if (prefecture === '兵庫県') {
    return { lat: 34.6913, lng: 135.1830 };
  }

  // Default to central Japan
  return { lat: 35.0, lng: 137.0 };
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
      // Return error if Supabase is not configured
      console.error('Supabase is not configured properly');
      return NextResponse.json(
        { error: 'Database configuration error. Please check your Supabase settings.' },
        { status: 500 }
      );
    }

    const supabase = createRouteHandlerClient<Database>({ cookies });

    try {
      if (isNearbySearch) {
        // Use PostGIS for nearby search
        console.log(`Searching for manholes within ${radius}km of ${lat}, ${lng}`);


        // Use direct PostGIS functions with Supabase
        const { data: nearbyManholes, error: nearbyError } = await supabase
          .rpc('get_nearby_manholes', {
            search_lat: lat,
            search_lng: lng,
            radius_km: radius,
            max_results: limit
          });

        if (nearbyError) {
          console.log('PostGIS function failed, using coordinate estimation fallback:', nearbyError.message);
          throw new Error('PostGIS function failed');
        }

        if (nearbyManholes && nearbyManholes.length > 0) {
          console.log(`Found ${nearbyManholes.length} nearby manholes using PostGIS`);

          const formattedManholes = nearbyManholes
            .map((manhole: any) => ({
              ...manhole,
              name: manhole.title || 'ポケふた',
              description: manhole.description || '',
              city: manhole.municipality || '',
              address: manhole.address || '',
              is_visited: false,
              last_visit: null,
              photo_count: 0,
              distance: manhole.distance_km
            }))
            .filter((manhole: any) => {
              if (visited === 'true') return manhole.is_visited;
              if (visited === 'false') return !manhole.is_visited;
              return true;
            });

          return NextResponse.json(formattedManholes);
        }

        throw new Error('No nearby manholes found');
      }

      // Regular search for all manholes
      console.log('Fetching manholes from database...');

      const { data: allManholes, error: queryError } = await supabase
        .from('manhole')
        .select('*')
        .limit(500);

      if (queryError) {
        console.error('Database query error:', queryError);
        throw new Error(`Database query failed: ${queryError.message}`);
      }

      if (allManholes && allManholes.length > 0) {
        console.log(`Processing ${allManholes.length} manholes from database`);

        // Process manholes and add coordinates
        const manholesWithCoordinates = allManholes
          .map(manhole => {
            // Get estimated coordinates based on location
            const coords = getEstimatedCoordinates(manhole.prefecture, manhole.municipality || '');

            return {
              ...manhole,
              name: manhole.title || 'ポケふた',
              description: manhole.description || '',
              city: manhole.municipality || '',
              address: manhole.address || '',
              latitude: coords.lat,
              longitude: coords.lng,
              is_visited: false,
              last_visit: null,
              photo_count: 0
            };
          });

        // Apply visited filter to database results
        let filteredManholes = manholesWithCoordinates;
        if (visited === 'true') {
          filteredManholes = manholesWithCoordinates.filter(m => m.is_visited);
        } else if (visited === 'false') {
          filteredManholes = manholesWithCoordinates.filter(m => !m.is_visited);
        }

        console.log(`Returning ${filteredManholes.length} manholes with coordinates`);
        return NextResponse.json(filteredManholes);
      }

      // If table is empty, return empty array
      console.log('Manhole table is empty');
      return NextResponse.json([]);

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

    // Validate required fields
    const {
      name,
      description,
      prefecture,
      city,
      address,
      latitude,
      longitude,
      source_url
    } = body;

    if (!name || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Name, latitude, and longitude are required' },
        { status: 400 }
      );
    }

    // Insert new manhole
    const { data: manhole, error } = await supabase
      .from('manhole')
      .insert({
        name,
        description,
        prefecture,
        city,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        source_url,
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