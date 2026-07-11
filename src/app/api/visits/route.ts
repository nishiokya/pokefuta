import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
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
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);

    // Optional filters
    const prefecture = searchParams.get('prefecture');
    const withPhotos = searchParams.get('with_photos');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const orderByRaw = searchParams.get('order_by');
    const includeManholeTags = searchParams.get('include_manhole_tags') === 'true';
    const manholeTagFields = includeManholeTags
      ? `,
            titles,
            hashtags,
            title_tags`
      : '';

    // Default keeps existing behavior; home feed can override with order_by=created_at
    const orderBy: 'shot_at' | 'created_at' = orderByRaw === 'created_at' ? 'created_at' : 'shot_at';

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
            building,
            pokemons${manholeTagFields}
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
        .order(orderBy, { ascending: false })
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
            building,
            pokemons${manholeTagFields}
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
        .order(orderBy, { ascending: false })
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
    const manholeIds = Array.from(
      new Set(
        (visits || [])
          .map((visit: any) => visit.manhole_id)
          .filter((id: any): id is number => typeof id === 'number' && Number.isFinite(id))
      )
    );

    const uniqueUserIds = Array.from(
      new Set((visits || []).map((visit: any) => visit.user_id).filter(Boolean))
    );

    // いいね数・コメント数・ブックマーク状態・投稿者表示名は互いに独立なので並列取得
    const [
      { data: likes },
      { data: commentCounts },
      { data: manholeCommentCounts },
      { data: bookmarks },
      { data: appUsers },
    ] = await Promise.all([
      supabase
        .from('visit_like')
        .select('visit_id, user_id')
        .in('visit_id', visitIds),
      supabase
        .from('visit_comment')
        .select('visit_id')
        .in('visit_id', visitIds),
      manholeIds.length > 0
        ? supabase
          .from('manhole_comment')
          .select('manhole_id')
          .in('manhole_id', manholeIds)
          .is('parent_comment_id', null)
        : Promise.resolve({ data: [] as any[] }),
      viewerUserId
        ? supabase
          .from('visit_bookmark')
          .select('visit_id')
          .eq('user_id', viewerUserId)
          .in('visit_id', visitIds)
        : Promise.resolve({ data: [] as any[] }),
      uniqueUserIds.length > 0
        ? supabase
          .from('app_user')
          .select('id, auth_uid, display_name')
          .in('auth_uid', uniqueUserIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // 各訪問記録のいいね数・コメント数・状態を集計
    const likesMap = new Map<string, { count: number; isLiked: boolean }>();
    const commentsMap = new Map<string, number>();
    const manholeCommentsMap = new Map<number, number>();
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

    (manholeCommentCounts || []).forEach(comment => {
      const manholeId = comment.manhole_id;
      if (typeof manholeId !== 'number') return;
      const current = manholeCommentsMap.get(manholeId) || 0;
      manholeCommentsMap.set(manholeId, current + 1);
    });

    (bookmarks || []).forEach(bookmark => {
      bookmarksSet.add(bookmark.visit_id);
    });

    // Post-process data
    const processedVisits = (visits || []).map(visit => {
      const photos = Array.isArray(visit.photos) ? visit.photos : [];
      const likeInfo = likesMap.get(visit.id) || { count: 0, isLiked: false };
      const commentCount = commentsMap.get(visit.id) || 0;
      const manholeCommentCount = typeof visit.manhole_id === 'number'
        ? manholeCommentsMap.get(visit.manhole_id) || 0
        : 0;
      const isBookmarked = bookmarksSet.has(visit.id);

      return {
        id: visit.id,
        user_id: visit.user_id,
        manhole_id: visit.manhole_id,
        manhole: visit.manhole,
        shot_at: visit.shot_at,
        shot_location: visit.shot_location,
        // 未ログイン(anon)レスポンスは note を select していないため、
        // undefined にして JSON.stringify にキーごと落としてもらう（null だと
        // キー自体は残ってしまい "note フィールドを返さない" 要件を満たせない）
        note: 'note' in visit ? visit.note : undefined,
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
        manhole_comments_count: manholeCommentCount,
        is_bookmarked: isBookmarked
      };
    });

    // Enrich with poster display_name / public_user_id
    const displayNameMap = new Map<string, string | null>();
    const publicUserIdMap = new Map<string, string | null>();
    (appUsers || []).forEach((u: any) => {
      if (u?.auth_uid) {
        displayNameMap.set(u.auth_uid, u.display_name ?? null);
        publicUserIdMap.set(u.auth_uid, u.id ?? null);
      }
    });
    const enrichedVisits = processedVisits.map((v: any) => ({
      ...v,
      display_name: displayNameMap.get(v.user_id) ?? null,
      public_user_id: publicUserIdMap.get(v.user_id) ?? null,
    }));

    // Apply client-side filters if needed
    let filteredVisits = enrichedVisits;

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
    }, {
      headers: {
        // 匿名レスポンスは全員同一(is_liked/is_bookmarked 常に false)なので
        // CDN で共有キャッシュさせ、Lambda 起動ごと削減する。
        // ログイン時はユーザー固有のためキャッシュ禁止。
        'Cache-Control': viewerUserId
          ? 'private, no-store'
          : 'public, s-maxage=60, stale-while-revalidate=300',
      },
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
