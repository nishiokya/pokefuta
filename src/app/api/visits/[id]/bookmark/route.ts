import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/visits/{id}/bookmark:
 *   post:
 *     summary: 訪問記録をブックマークに追加
 *     tags: [social]
 *     description: 指定された訪問記録をブックマークに追加します。すでにブックマーク済みの場合はエラーを返します。
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
 *         description: ブックマーク追加成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 bookmark:
 *                   type: object
 *       401:
 *         description: 認証が必要
 *       409:
 *         description: すでにブックマーク済み
 *       500:
 *         description: サーバーエラー
 *   delete:
 *     summary: 訪問記録のブックマークを削除
 *     tags: [social]
 *     description: 指定された訪問記録のブックマークを削除します。
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
 *         description: ブックマーク削除成功
 *       401:
 *         description: 認証が必要
 *       404:
 *         description: ブックマークが見つかりません
 *       500:
 *         description: サーバーエラー
 */

// ==========================================
// POST /api/visits/[id]/bookmark - ブックマーク追加
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

    // ✅ 3. すでにブックマーク済みかチェック
    const { data: existingBookmark } = await supabase
      .from('visit_bookmark')
      .select('id')
      .eq('visit_id', visitId)
      .eq('user_id', userId)
      .single();

    if (existingBookmark) {
      return NextResponse.json({
        success: false,
        error: 'Already bookmarked'
      }, { status: 409 });
    }

    // ✅ 4. ブックマークを追加
    const { data: bookmark, error: bookmarkError } = await supabase
      .from('visit_bookmark')
      .insert({
        visit_id: visitId,
        user_id: userId
      })
      .select()
      .single();

    if (bookmarkError) {
      console.error('Error creating bookmark:', bookmarkError);
      return NextResponse.json({
        success: false,
        error: 'Failed to create bookmark',
        details: bookmarkError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      bookmark
    });

  } catch (error: any) {
    console.error('Unexpected error creating bookmark:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

// ==========================================
// DELETE /api/visits/[id]/bookmark - ブックマーク削除
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

    // ✅ 2. ブックマークを削除
    const { error } = await supabase
      .from('visit_bookmark')
      .delete()
      .eq('visit_id', visitId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting bookmark:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to delete bookmark',
        details: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true
    });

  } catch (error: any) {
    console.error('Unexpected error deleting bookmark:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
