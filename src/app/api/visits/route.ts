import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { loadPublicDisplayNameMap } from '@/lib/public-display-names';
import { fetchSnapshotNames, withSnapshotName } from '@/lib/manhole-snapshot';
import {
  LATEST_COMMENT_LOOKBACK,
  LATEST_COMMENT_MAX_MANHOLES,
  toLatestCommentPreview,
  type LatestManholeComment,
} from '@/lib/latest-manhole-comment';

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
    // 蓋1つにつき1問い合わせ増えるので、トップのフィードだけが明示して求める
    const withLatestComment = searchParams.get('with_latest_comment') === 'true';
    const manholeTagFields = includeManholeTags
      ? `,
            titles,
            hashtags,
            title_tags`
      : '';

    // Default keeps existing behavior; home feed can override with order_by=created_at
    const orderBy: 'shot_at' | 'created_at' = orderByRaw === 'created_at' ? 'created_at' : 'shot_at';

    // 都道府県の絞り込みは **range() より前** に効かせる。
    //
    // 以前はここに中身の無い `if (prefecture) {}` があり、実際の絞り込みは
    // ページングで切り出した後の配列に対して行われていた。つまり
    // `?prefecture=宮崎県&limit=12` は「全国の最新12件のうち宮崎県のもの」しか
    // 返さず、県内に投稿が何十件あっても 0 件になるのが普通だった。
    // （`/api/manholes` の `no_photos` が踏んだのと同じ形。）
    //
    // 埋め込みを `!inner` にすると PostgREST が join して絞ってくれる。指定が
    // 無いときは今までどおり外部結合のままにする。`!inner` を常時付けると、
    // manhole_id が無い訪問記録が一覧から黙って消える。
    const manholeEmbed = prefecture ? 'manhole:manhole_id!inner' : 'manhole:manhole_id';

    // `with_photos=true` も同じ理由で join 側に寄せる。これも後段の配列 filter
    // だけだったので、`?with_photos=true&limit=12` が返すのは「最新12件のうち
    // 写真があったもの」で、12件を下回るのが当たり前だった（トップのフィードが
    // まさにこの形で、ページごとに枚数が揃わない）。写真が1枚も無い訪問記録を
    // join で落とせば、limit の意味が「写真つきをN件」になる。
    const photoEmbed = withPhotos === 'true' ? 'photos:photo!inner' : 'photos:photo';

    // 蓋の表示名は図鑑のスナップショットの name を正本にする（Supabase の manhole には無い）。
    // Supabase の問い合わせと並行して取りに行く（上限つき。時間切れなら title に落ちる）
    const snapshotNamesPromise = fetchSnapshotNames();

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
          ${manholeEmbed} (
            id,
            title,
            prefecture,
            municipality,
            building,
            pokemons${manholeTagFields}
          ),
          ${photoEmbed} (
            id,
            storage_key,
            content_type,
            file_size,
            width,
            height,
            created_at
          )
        `)
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
          ${manholeEmbed} (
            id,
            title,
            prefecture,
            municipality,
            building,
            pokemons${manholeTagFields}
          ),
          ${photoEmbed} (
            id,
            storage_key,
            content_type,
            file_size,
            width,
            height,
            created_at
          )
        `)
        .eq('is_public', true);
    }

    // フィルタは order/range より先。supabase-js は order() を呼んだ時点で
    // TransformBuilder になり、そこから先は eq() を生やせない。
    if (prefecture) {
      query = query.eq('manhole.prefecture', prefecture);
    }

    const { data: visits, error } = await query
      .order(orderBy, { ascending: false })
      .range(offset, offset + limit - 1);

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
      { data: manholeCommentStats },
      latestManholeCommentEntries,
      { data: bookmarks },
      displayNameMap,
      publicUserIdsResult,
    ] = await Promise.all([
      supabase
        .from('visit_like')
        .select('visit_id, user_id')
        .in('visit_id', visitIds),
      supabase
        .from('visit_comment')
        .select('visit_id')
        .in('visit_id', visitIds),
      // 件数は集計ビューから取る。行を全部持ってきて数えると、蓋の口コミが
      // 合計で max_rows（1000）を超えたところで黙って切られて少なく出る。
      // ビューは型定義に無いので any で通す。
      manholeIds.length > 0
        ? (supabase as any)
          .from('manhole_comment_stats')
          .select('manhole_id, comment_count')
          .in('manhole_id', manholeIds)
        : Promise.resolve({ data: [] as any[] }),
      withLatestComment
        ? Promise.all(
          manholeIds.slice(0, LATEST_COMMENT_MAX_MANHOLES).map(async (manholeId) => {
            const { data, error } = await supabase
              .from('manhole_comment')
              .select('content, created_at')
              .eq('manhole_id', manholeId)
              .is('parent_comment_id', null)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .limit(LATEST_COMMENT_LOOKBACK);
            if (error) {
              // 抜粋は飾り。取れなくても一覧は返す
              console.warn('Failed to load latest manhole comment:', manholeId, error);
              return [manholeId, null] as const;
            }
            return [manholeId, toLatestCommentPreview(data || [])] as const;
          })
        )
        : Promise.resolve([] as Array<readonly [number, LatestManholeComment | null]>),
      viewerUserId
        ? supabase
          .from('visit_bookmark')
          .select('visit_id')
          .eq('user_id', viewerUserId)
          .in('visit_id', visitIds)
        : Promise.resolve({ data: [] as any[] }),
      loadPublicDisplayNameMap(supabase, uniqueUserIds),
      // ✅ public_user_id は「公開訪問を持つユーザー」限定のRPCで解決する
      // (app_user.id への直接SELECT権限は削除済み。RPC自体が存在しなくても
      // エンドポイント全体を落とさないよう、失敗時はログのみで空扱いにする)
      uniqueUserIds.length > 0
        ? supabase
          .rpc('get_public_user_ids' as never, { p_auth_uids: uniqueUserIds } as never)
          .then(
            (result: any) => result,
            (err: any) => ({ data: null, error: err })
          )
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    // 各訪問記録のいいね数・コメント数・状態を集計
    const likesMap = new Map<string, { count: number; isLiked: boolean }>();
    const commentsMap = new Map<string, number>();
    const manholeCommentsMap = new Map<number, number>();
    ((manholeCommentStats as any[]) || []).forEach((row: any) => {
      if (typeof row?.manhole_id !== 'number') return;
      manholeCommentsMap.set(row.manhole_id, Number(row.comment_count) || 0);
    });
    const latestManholeCommentMap = new Map(latestManholeCommentEntries);
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

    const snapshotNames = await snapshotNamesPromise;

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
        manhole: withSnapshotName(visit.manhole as any, snapshotNames),
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
        latest_manhole_comment: typeof visit.manhole_id === 'number'
          ? latestManholeCommentMap.get(visit.manhole_id) ?? null
          : null,
        is_bookmarked: isBookmarked
      };
    });

    // Enrich with poster display_name / public_user_id
    const publicUserIdMap = new Map<string, string | null>();
    if (publicUserIdsResult?.error) {
      // RPC未適用/失敗時もエンドポイント自体は壊さず、public_user_id は null 扱いにする
      console.warn('Failed to load public_user_id via get_public_user_ids RPC:', publicUserIdsResult.error);
    }
    ((publicUserIdsResult?.data as any[]) || []).forEach((row: any) => {
      if (row?.auth_uid) {
        publicUserIdMap.set(row.auth_uid, row.public_user_id ?? null);
      }
    });
    const enrichedVisits = processedVisits.map((v: any) => ({
      ...v,
      display_name: displayNameMap.get(v.user_id) ?? null,
      public_user_id: publicUserIdMap.get(v.user_id) ?? null,
    }));

    // Apply client-side filters if needed
    let filteredVisits = enrichedVisits;

    // 絞り込み自体はクエリ側（!inner + eq）で済んでいる。ここは保険。
    // 埋め込みの形が変わって join が効かなくなったときに、県外の投稿が
    // 都道府県ページへ黙って混ざるより、0件になって気付ける方がよい。
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
