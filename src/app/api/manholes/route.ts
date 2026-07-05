import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { calculateDistance } from '@/lib/location';
import {
  fetchManholeSnapshot,
  SnapshotManhole,
} from '@/lib/manhole-snapshot';

/**
 * @swagger
 * /api/manholes:
 *   get:
 *     summary: マンホール一覧を取得
 *     tags: [manholes]
 *     description: 全マンホール情報を取得します。位置情報を含みます。マスターデータは data.pokefuta.com の静的スナップショット（日次更新）から取得し、ログインユーザーの訪問状態のみ Supabase から合成します。
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
 *       503:
 *         description: スナップショット取得失敗
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
    const noPhotos = searchParams.get('no_photos') === 'true';

    // Validate radius (max 100km for performance)
    if (radius > 100) {
      return NextResponse.json(
        { error: 'Maximum radius is 100km' },
        { status: 400 }
      );
    }

    const isNearbySearch = lat !== null && lng !== null;

    // マスターデータは静的スナップショットから（Supabase は読まない）
    const snapshot = await fetchManholeSnapshot();
    if (!snapshot || !snapshot.manholes) {
      return NextResponse.json(
        { error: 'Manhole data is temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    // ✅ ログインユーザーの訪問記録だけを Supabase から取得（ユーザー単位の小データ）
    const visitedManholeIds = new Set<number>();
    const visitedManholeData = new Map<number, { last_visit: string }>();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('dummy')) {
      try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || null;

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
      } catch (visitError) {
        // 訪問状態の合成に失敗しても匿名相当のデータは返す
        console.error('Failed to overlay visit status:', visitError);
      }
    }

    const withVisitStatus = (manhole: SnapshotManhole) => ({
      ...manhole,
      is_visited: visitedManholeIds.has(manhole.id),
      last_visit: visitedManholeData.get(manhole.id)?.last_visit || null,
    });

    const matchesVisitedFilter = (manhole: { is_visited: boolean }) => {
      if (visited === 'true') return manhole.is_visited;
      if (visited === 'false') return !manhole.is_visited;
      return true;
    };

    if (isNearbySearch) {
      const manholesWithDistance = snapshot.manholes
        .map(manhole => ({
          ...withVisitStatus(manhole),
          distance: calculateDistance(lat!, lng!, manhole.latitude, manhole.longitude),
        }))
        .filter(manhole => manhole.distance <= radius)
        .filter(matchesVisitedFilter)
        .filter(manhole => !noPhotos || manhole.photo_count === 0)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

      return NextResponse.json({
        success: true,
        manholes: manholesWithDistance,
        total: snapshot.total,
        with_photos: snapshot.with_photos
      });
    }

    // 通常一覧: id 降順で limit 件（従来の DB クエリと同じ挙動）
    const actualLimit = Math.min(limit, 1000);
    const manholes = [...snapshot.manholes]
      .sort((a, b) => b.id - a.id)
      .slice(0, actualLimit)
      .map(withVisitStatus)
      .filter(matchesVisitedFilter)
      .filter(manhole => !noPhotos || manhole.photo_count === 0);

    return NextResponse.json({
      success: true,
      manholes,
      total: snapshot.total,
      with_photos: snapshot.with_photos
    });

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
    const supabase = createRouteHandlerClient({ cookies });
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
