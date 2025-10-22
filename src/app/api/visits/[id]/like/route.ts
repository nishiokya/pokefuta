import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/visits/{id}/like:
 *   post:
 *     summary: 訪問記録にいいねを追加
 *     tags: [social]
 *     description: 指定された訪問記録にいいねを追加します。すでにいいねしている場合はエラーを返します。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 訪問記録のID
 *     responses:
 *       200:
 *         description: いいね追加成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 like:
 *                   type: object
 *       401:
 *         description: 認証が必要
 *       409:
 *         description: すでにいいね済み
 *       500:
 *         description: サーバーエラー
 *   delete:
 *     summary: 訪問記録のいいねを削除
 *     tags: [social]
 *     description: 指定された訪問記録のいいねを削除します。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 訪問記録のID
 *     responses:
 *       200:
 *         description: いいね削除成功
 *       401:
 *         description: 認証が必要
 *       404:
 *         description: いいねが見つかりません
 *       500:
 *         description: サーバーエラー
 */

// ==========================================
// POST /api/visits/[id]/like - いいね追加
// ==========================================
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const visitId = params.id;
    const userId = session.user.id;

    // ✅ 2. 訪問記録の存在確認
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

    // ✅ 3. すでにいいね済みかチェック
    const { data: existingLike } = await supabase
      .from('visit_like')
      .select('id')
      .eq('visit_id', visitId)
      .eq('user_id', userId)
      .single();

    if (existingLike) {
      return NextResponse.json({
        success: false,
        error: 'Already liked'
      }, { status: 409 });
    }

    // ✅ 4. いいねを追加
    const { data: like, error: likeError } = await supabase
      .from('visit_like')
      .insert({
        visit_id: visitId,
        user_id: userId
      })
      .select()
      .single();

    if (likeError) {
      console.error('Error creating like:', likeError);
      return NextResponse.json({
        success: false,
        error: 'Failed to create like',
        details: likeError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      like
    });

  } catch (error: any) {
    console.error('Unexpected error creating like:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

// ==========================================
// DELETE /api/visits/[id]/like - いいね削除
// ==========================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const visitId = params.id;
    const userId = session.user.id;

    // ✅ 2. いいねを削除
    const { error } = await supabase
      .from('visit_like')
      .delete()
      .eq('visit_id', visitId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting like:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to delete like',
        details: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true
    });

  } catch (error: any) {
    console.error('Unexpected error deleting like:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
