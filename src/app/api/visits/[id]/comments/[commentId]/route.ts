import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/visits/{id}/comments/{commentId}:
 *   delete:
 *     summary: コメントを削除
 *     tags: [social]
 *     description: 指定されたコメントを削除します。自分のコメントのみ削除可能です。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 訪問記録のID
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: コメントのID
 *     responses:
 *       200:
 *         description: コメント削除成功
 *       401:
 *         description: 認証が必要
 *       403:
 *         description: 削除権限がありません
 *       404:
 *         description: コメントが見つかりません
 *       500:
 *         description: サーバーエラー
 */

// ==========================================
// DELETE /api/visits/[id]/comments/[commentId] - コメント削除
// ==========================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // ✅ 1. 認証チェック
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const userId = session.user.id;
    const commentId = params.commentId;

    // ✅ 2. コメントの存在確認と所有者チェック
    const { data: comment, error: fetchError } = await supabase
      .from('visit_comment')
      .select('*')
      .eq('id', commentId)
      .single();

    if (fetchError || !comment) {
      return NextResponse.json({
        success: false,
        error: 'Comment not found'
      }, { status: 404 });
    }

    // ✅ 3. 所有者チェック
    if (comment.user_id !== userId) {
      return NextResponse.json({
        success: false,
        error: 'You can only delete your own comments'
      }, { status: 403 });
    }

    // ✅ 4. コメント削除
    const { error: deleteError } = await supabase
      .from('visit_comment')
      .delete()
      .eq('id', commentId);

    if (deleteError) {
      console.error('Error deleting comment:', deleteError);
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
    console.error('Unexpected error deleting comment:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
