import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/visits:
 *   get:
 *     summary: 訪問記録一覧を取得
 *     tags: [visits]
 *     description: 認証ユーザーの訪問記録一覧を取得します。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: prefecture
 *         schema:
 *           type: string
 *         description: 都道府県でフィルタ
 *       - in: query
 *         name: with_photos
 *         schema:
 *           type: boolean
 *         description: 写真付きのみ
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: 取得件数
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: オフセット
 *     responses:
 *       200:
 *         description: 訪問記録一覧
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 authenticated:
 *                   type: boolean
 *                 visits:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Visit'
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total_visits:
 *                       type: integer
 *                     total_photos:
 *                       type: integer
 *                     prefectures:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: 未認証（空の配列を返す）
 *   post:
 *     summary: 訪問記録を作成
 *     tags: [visits]
 *     description: 新しい訪問記録を作成します。
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shot_at
 *             properties:
 *               manhole_id:
 *                 type: integer
 *                 nullable: true
 *               shot_at:
 *                 type: string
 *                 format: date-time
 *               shot_location:
 *                 type: string
 *                 nullable: true
 *               note:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: 訪問記録作成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 visit:
 *                   $ref: '#/components/schemas/Visit'
 *       401:
 *         description: 認証が必要
 *       400:
 *         description: バリデーションエラー
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { searchParams } = new URL(request.url);

    // Optional filters
    const prefecture = searchParams.get('prefecture');
    const withPhotos = searchParams.get('with_photos');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get user (optional - for authenticated users)
    const { data: { session } } = await supabase.auth.getSession();
    const viewerUserId = session?.user?.id ?? null;

    // Build query
    let query;
    if (viewerUserId) {
      // ✅ ログイン時: 従来通り、自分の訪問記録のみ
      query = supabase
        .from('visit')
        .select(`
          *,
          manhole:manhole_id (
            id,
            title,
            prefecture,
            municipality,
            pokemons
          ),
          photos:photo (
            id,
            storage_key,
            content_type,
            file_size,
            width,
            height,
            created_at
          )
        `)
        .order('shot_at', { ascending: false })
        .range(offset, offset + limit - 1)
        .eq('user_id', viewerUserId);
    } else {
      // ✅ 未ログイン時: 公開(is_public=true)の訪問記録を返す（noteは返さない）
      query = supabase
        .from('visit')
        .select(`
          id,
          user_id,
          manhole_id,
          shot_at,
          shot_location,
          comment,
          is_public,
          created_at,
          updated_at,
          manhole:manhole_id (
            id,
            title,
            prefecture,
            municipality,
            pokemons
          ),
          photos:photo (
            id,
            storage_key,
            content_type,
            file_size,
            width,
            height,
            created_at
          )
        `)
        .order('shot_at', { ascending: false })
        .range(offset, offset + limit - 1)
        .eq('is_public', true);
    }

    if (prefecture) {
      // Note: This requires a join, handled by the query above
      // We'll filter on the client side or use a view
    }

    if (withPhotos === 'true') {
      // Only visits with photos - we'll filter this on the client side
      // or use a SQL function
    }

    const { data: visits, error } = await query;

    if (error) {
      console.error('Error fetching visits:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch visits',
        details: error.message
      }, { status: 500 });
    }

    // ✅ ソーシャル機能の情報を取得
    const visitIds = (visits || []).map(v => v.id);

    // いいね数とユーザーのいいね状態を取得
    const { data: likes } = await supabase
      .from('visit_like')
      .select('visit_id, user_id')
      .in('visit_id', visitIds);

    // コメント数を取得
    const { data: commentCounts } = await supabase
      .from('visit_comment')
      .select('visit_id')
      .in('visit_id', visitIds);

    // ユーザーのブックマーク状態を取得
    const { data: bookmarks } = viewerUserId
      ? await supabase
        .from('visit_bookmark')
        .select('visit_id')
        .eq('user_id', viewerUserId)
        .in('visit_id', visitIds)
      : { data: [] as any[] };

    // 各訪問記録のいいね数・コメント数・状態を集計
    const likesMap = new Map<string, { count: number; isLiked: boolean }>();
    const commentsMap = new Map<string, number>();
    const bookmarksSet = new Set<string>();

    visitIds.forEach(id => {
      likesMap.set(id, { count: 0, isLiked: false });
      commentsMap.set(id, 0);
    });

    (likes || []).forEach(like => {
      const current = likesMap.get(like.visit_id) || { count: 0, isLiked: false };
      current.count++;
      if (viewerUserId && like.user_id === viewerUserId) {
        current.isLiked = true;
      }
      likesMap.set(like.visit_id, current);
    });

    (commentCounts || []).forEach(comment => {
      const current = commentsMap.get(comment.visit_id) || 0;
      commentsMap.set(comment.visit_id, current + 1);
    });

    (bookmarks || []).forEach(bookmark => {
      bookmarksSet.add(bookmark.visit_id);
    });

    // Post-process data
    const processedVisits = (visits || []).map(visit => {
      const photos = Array.isArray(visit.photos) ? visit.photos : [];
      const likeInfo = likesMap.get(visit.id) || { count: 0, isLiked: false };
      const commentCount = commentsMap.get(visit.id) || 0;
      const isBookmarked = bookmarksSet.has(visit.id);

      return {
        id: visit.id,
        user_id: visit.user_id,
        manhole_id: visit.manhole_id,
        manhole: visit.manhole,
        shot_at: visit.shot_at,
        shot_location: visit.shot_location,
        note: visit.note,
        comment: visit.comment,
        is_public: visit.is_public,
        created_at: visit.created_at,
        updated_at: visit.updated_at,
        photos: photos.map((photo: any) => ({
          id: photo.id,
          storage_key: photo.storage_key,
          content_type: photo.content_type,
          file_size: photo.file_size,
          width: photo.width,
          height: photo.height,
          created_at: photo.created_at,
          // Generate URL based on storage key
          url: `/api/photo/${photo.id}`,
          thumbnail_url: `/api/photo/${photo.id}?size=small`
        })),
        // ✅ ソーシャル機能の情報
        likes_count: likeInfo.count,
        is_liked: likeInfo.isLiked,
        comments_count: commentCount,
        is_bookmarked: isBookmarked
      };
    });

    // Apply client-side filters if needed
    let filteredVisits = processedVisits;

    if (prefecture) {
      filteredVisits = filteredVisits.filter(
        (visit: any) => visit.manhole?.prefecture === prefecture
      );
    }

    if (withPhotos === 'true') {
      filteredVisits = filteredVisits.filter(
        (visit: any) => visit.photos.length > 0
      );
    }

    // Calculate stats
    const stats = {
      total_visits: filteredVisits.length,
      total_photos: filteredVisits.reduce(
        (sum: number, visit: any) => sum + visit.photos.length,
        0
      ),
      prefectures: Array.from(
        new Set(
          filteredVisits
            .map((visit: any) => visit.manhole?.prefecture)
            .filter(Boolean)
        )
      ),
      date_range: {
        first: filteredVisits.length > 0
          ? filteredVisits[filteredVisits.length - 1].shot_at
          : null,
        last: filteredVisits.length > 0
          ? filteredVisits[0].shot_at
          : null
      }
    };

    return NextResponse.json({
      success: true,
      authenticated: !!viewerUserId,
      visits: filteredVisits,
      stats,
      pagination: {
        limit,
        offset,
        total: filteredVisits.length
      }
    });

  } catch (error: any) {
    console.error('Unexpected error fetching visits:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

// Create a new visit
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const body = await request.json();
    const {
      manhole_id,
      shot_location,
      shot_at,
      note
      // Removed fields that don't exist in schema: with_family, tags, weather, rating
    } = body;

    // Validate required fields
    if (!shot_at) {
      return NextResponse.json({
        success: false,
        error: 'shot_at is required'
      }, { status: 400 });
    }

    // Create visit
    const { data: visit, error } = await supabase
      .from('visit')
      .insert({
        user_id: session.user.id,  // ✅ 必ず自分のID
        manhole_id: manhole_id || null,
        shot_location: shot_location || null,
        shot_at,
        note: note || null
        // Removed fields that don't exist in schema: with_family, tags, weather, rating
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating visit:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to create visit',
        details: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      visit
    });

  } catch (error: any) {
    console.error('Unexpected error creating visit:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
