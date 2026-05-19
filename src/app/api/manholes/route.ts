import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { extractCoordinatesFromWKB, calculateDistance } from '@/lib/location';

type ManholePhotoSummary = {
  count: number;
  latestPhotoUrl: string | null;
};

type ManholePhotoSummaryRow =
  Database['public']['Functions']['get_manhole_photo_summaries']['Returns'][number];

function encodeStorageKey(key: string) {
  return key.split('/').map(part => encodeURIComponent(part)).join('/');
}

function buildPublicStorageUrl(key: string | null) {
  if (!key) return null;

  const publicUrl = process.env.R2_PUBLIC_URL || process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET || 'image';

  if (!publicUrl) return null;

  const baseUrl = publicUrl.replace(/\/$/, '');
  const encodedKey = encodeStorageKey(key);

  if (baseUrl.includes('r2.cloudflarestorage.com')) {
    return `${baseUrl}/${bucket}/${encodedKey}`;
  }

  return `${baseUrl}/${encodedKey}`;
}

async function loadPhotoSummaries(
  supabase: ReturnType<typeof createRouteHandlerClient<Database>>,
  manholeIds: number[]
) {
  if (manholeIds.length === 0) {
    return new Map<number, ManholePhotoSummary>();
  }

  const { data, error } = await supabase.rpc('get_manhole_photo_summaries', {
    p_manhole_ids: manholeIds,
  });

  if (error) {
    console.error('Photo summary RPC error:', error);
    throw new Error(`Photo summary RPC failed: ${error.message}`);
  }

  const summaries = new Map<number, ManholePhotoSummary>();
  ((data || []) as ManholePhotoSummaryRow[]).forEach(summary => {
    const latestStorageKey =
      summary.latest_thumbnail_320 ||
      summary.latest_thumbnail_800 ||
      summary.latest_thumbnail_1600 ||
      summary.latest_storage_key;

    summaries.set(summary.manhole_id, {
      count: Number(summary.photo_count || 0),
      latestPhotoUrl: buildPublicStorageUrl(latestStorageKey),
    });
  });

  return summaries;
}

/**
 * @swagger
 * /api/manholes:
 *   get:
 *     summary: マンホール一覧を取得
 *     tags: [manholes]
 *     description: 全マンホール情報を取得します。位置情報を含みます。
 *     responses:
 *       200:
 *         description: マンホール一覧
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 manholes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Manhole'
 *                 count:
 *                   type: integer
 *                   description: マンホール総数
 *       500:
 *         description: サーバーエラー
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

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

    // ✅ ユーザーの認証状態を確認
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    try {
      // まず全体の統計情報を取得（軽量クエリ）
      const { count: totalCount, error: countError } = await supabase
        .from('manhole')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Count query error:', countError);
      }

      // 写真があるマンホールの数を取得（COUNT DISTINCT）
      const { data: photoCountData, error: photoCountError } = await supabase
        .rpc('count_manholes_with_photos' as any)
        .single();

      let photosCount = 0;
      if (!photoCountError && photoCountData) {
        photosCount = (photoCountData as any).count || 0;
      } else {
        // フォールバック: 全件取得
        const { data: photosData } = await supabase
          .from('photo')
          .select('manhole_id')
          .not('manhole_id', 'is', null);
        photosCount = new Set(photosData?.map(p => p.manhole_id) || []).size;
      }

      // ✅ ログインユーザーの訪問記録を取得
      let visitedManholeIds = new Set<number>();
      let visitedManholeData = new Map<number, { last_visit: string }>();

      if (userId) {
        const { data: visitsData } = await supabase
          .from('visit')
          .select('manhole_id, shot_at')
          .eq('user_id', userId)
          .not('manhole_id', 'is', null)
          .order('shot_at', { ascending: false });

        if (visitsData) {
          visitsData.forEach(visit => {
            if (visit.manhole_id) {
              visitedManholeIds.add(visit.manhole_id);
              // 最新の訪問日を保存
              if (!visitedManholeData.has(visit.manhole_id)) {
                visitedManholeData.set(visit.manhole_id, {
                  last_visit: visit.shot_at
                });
              }
            }
          });
        }
      }

      // 実際のマンホールデータを取得
      // ⚠️ nearby検索の場合はlimitを適用せず、全件取得してから距離でフィルタする
      let query = supabase.from('manhole').select('*');

      // nearby検索でない場合のみlimitを適用
      if (!isNearbySearch) {
        const actualLimit = Math.min(limit, 1000);
        query = query.order('id', { ascending: false }).limit(actualLimit);
      }

      const { data: allManholes, error: queryError } = await query;

      if (queryError) {
        console.error('Database query error:', queryError);
        throw new Error(`Database query failed: ${queryError.message}`);
      }

      if (!allManholes || allManholes.length === 0) {
        console.log('No manholes found in database');
        return NextResponse.json({
          success: true,
          manholes: [],
          total: totalCount || 0,
          with_photos: photosCount
        });
      }

      const manholeIds = allManholes.map(m => m.id);
      const photoSummaryByManholeId = await loadPhotoSummaries(supabase, manholeIds);

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

            const photoSummary = photoSummaryByManholeId.get(manhole.id);
            const isVisited = visitedManholeIds.has(manhole.id);
            const visitData = visitedManholeData.get(manhole.id);

            return {
              ...manhole,
              name: manhole.title || 'ポケふた',
              city: manhole.municipality || '',
              latitude: realCoords.lat,
              longitude: realCoords.lng,
              is_visited: isVisited,
              last_visit: visitData?.last_visit || null,
              photo_count: photoSummary?.count || 0,
              latest_photo_url: photoSummary?.latestPhotoUrl || null,
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
          total: totalCount || 0,
          with_photos: photosCount
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

          const photoSummary = photoSummaryByManholeId.get(manhole.id);
          const isVisited = visitedManholeIds.has(manhole.id);
          const visitData = visitedManholeData.get(manhole.id);

          return {
            ...manhole,
            name: manhole.title || 'ポケふた',
            city: manhole.municipality || '',
            latitude: realCoords.lat,
            longitude: realCoords.lng,
            is_visited: isVisited,
            last_visit: visitData?.last_visit || null,
            photo_count: photoSummary?.count || 0,
            latest_photo_url: photoSummary?.latestPhotoUrl || null
          };
        })
        .filter(manhole => manhole !== null)
        .filter(manhole => {
          if (visited === 'true') return manhole.is_visited;
          if (visited === 'false') return !manhole.is_visited;
          return true;
        });

      console.log(`Returning ${manholesWithCoordinates.length} manholes with coordinates`);
      return NextResponse.json({
        success: true,
        manholes: manholesWithCoordinates,
        total: totalCount || 0,
        with_photos: photosCount
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
