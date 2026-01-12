import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/visits/{id}/social:
 *   get:
 *     summary: 訪問記録のソーシャル情報を取得
 *     tags: [social]
 *     description: いいね/ブックマーク/コメントの件数と、ログイン中ユーザーの状態（任意）を返します。
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 訪問記録のID
 *     responses:
 *       200:
 *         description: ソーシャル情報
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 likes:
 *                   type: integer
 *                 bookmarks:
 *                   type: integer
 *                 comments:
 *                   type: integer
 *                 userLiked:
 *                   type: boolean
 *                 userBookmarked:
 *                   type: boolean
 *       404:
 *         description: 訪問記録が見つかりません
 *       500:
 *         description: サーバーエラー
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const visitId = params.id;

    const { data: visit, error: visitError } = await supabase
      .from('visit')
      .select('id')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({
        success: false,
        error: 'Visit not found'
      }, { status: 404 });
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const [{ count: likeCount }, { count: bookmarkCount }, { count: commentCount }] = await Promise.all([
      supabase
        .from('visit_like')
        .select('*', { count: 'exact', head: true })
        .eq('visit_id', visitId),
      supabase
        .from('visit_bookmark')
        .select('*', { count: 'exact', head: true })
        .eq('visit_id', visitId),
      supabase
        .from('visit_comment')
        .select('*', { count: 'exact', head: true })
        .eq('visit_id', visitId),
    ]);

    let userLiked = false;
    let userBookmarked = false;

    if (userId) {
      const [userLike, userBookmark] = await Promise.all([
        supabase
          .from('visit_like')
          .select('id')
          .eq('visit_id', visitId)
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('visit_bookmark')
          .select('id')
          .eq('visit_id', visitId)
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      userLiked = !!userLike.data;
      userBookmarked = !!userBookmark.data;
    }

    return NextResponse.json({
      success: true,
      likes: likeCount || 0,
      bookmarks: bookmarkCount || 0,
      comments: commentCount || 0,
      userLiked,
      userBookmarked
    });

  } catch (error: any) {
    console.error('Unexpected error fetching visit social:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
