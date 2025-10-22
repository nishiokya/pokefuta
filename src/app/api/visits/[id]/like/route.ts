import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/visits/{id}/like:
 *   post:
 *     summary: 訪問記録にいいねを追加
 *     tags: [visits]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 訪問記録ID
 *     responses:
 *       200:
 *         description: いいね追加成功
 *       401:
 *         description: 認証が必要
 *       404:
 *         description: 訪問記録が見つかりません
 *       409:
 *         description: すでにいいね済み
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // 1. 認証チェック
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const visitId = params.id;

    // 2. 訪問記録の存在確認
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

    // 3. すでにいいね済みかチェック
    const { data: existingLike } = await supabase
      .from('visit_like')
      .select('id')
      .eq('visit_id', visitId)
      .eq('user_id', session.user.id)
      .single();

    if (existingLike) {
      return NextResponse.json({
        success: false,
        error: 'Already liked'
      }, { status: 409 });
    }

    // 4. いいねを追加
    const { data: like, error: likeError } = await supabase
      .from('visit_like')
      .insert({
        visit_id: visitId,
        user_id: session.user.id
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

/**
 * @swagger
 * /api/visits/{id}/like:
 *   delete:
 *     summary: 訪問記録のいいねを削除
 *     tags: [visits]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 訪問記録ID
 *     responses:
 *       200:
 *         description: いいね削除成功
 *       401:
 *         description: 認証が必要
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // 1. 認証チェック
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const visitId = params.id;

    // 2. いいねを削除
    const { error: deleteError } = await supabase
      .from('visit_like')
      .delete()
      .eq('visit_id', visitId)
      .eq('user_id', session.user.id);

    if (deleteError) {
      console.error('Error deleting like:', deleteError);
      return NextResponse.json({
        success: false,
        error: 'Failed to delete like',
        details: deleteError.message
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
