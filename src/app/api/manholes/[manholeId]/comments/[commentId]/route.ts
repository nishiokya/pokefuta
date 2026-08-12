import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/manholes/{manholeId}/comments/{commentId}:
 *   delete:
 *     summary: 蓋コメントを削除（本人のみ）
 *     tags: [social]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: manholeId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 削除成功
 *       401:
 *         description: 認証が必要
 *       403:
 *         description: 他人のコメント
 *       404:
 *         description: コメントが見つかりません
 */

// 取り消せないコメント欄を目立たせるのは、確実に怒った利用者を1人作る施策。
// 蓋コメントは RLS 上は本人削除が許可済みなのに、DELETE の口だけが無かった。
// visit_comment 側（api/visits/[id]/comments/[commentId]）と同じ形にしてある。
export async function DELETE(
  _request: Request,
  { params }: { params: { manholeId: string; commentId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const userId = session.user.id;
    const { commentId } = params;

    const manholeId = Number(params.manholeId);
    if (!Number.isFinite(manholeId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid manhole id'
      }, { status: 400 });
    }

    const { data: comment, error: fetchError } = await supabase
      .from('manhole_comment')
      .select('id, user_id')
      .eq('id', commentId)
      .eq('manhole_id', manholeId)
      .single();

    if (fetchError || !comment) {
      return NextResponse.json({
        success: false,
        error: 'Comment not found'
      }, { status: 404 });
    }

    if ((comment as any).user_id !== userId) {
      return NextResponse.json({
        success: false,
        error: 'You can only delete your own comments'
      }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from('manhole_comment')
      .delete()
      .eq('id', commentId);

    if (deleteError) {
      console.error('Error deleting manhole comment:', deleteError);
      return NextResponse.json({
        success: false,
        error: 'Failed to delete comment',
        details: deleteError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Comment deleted successfully'
    });

  } catch (error: any) {
    console.error('Unexpected error deleting manhole comment:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
