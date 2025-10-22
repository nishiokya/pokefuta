import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/visits/{id}/comments:
 *   get:
 *     summary: 訪問記録のコメント一覧取得
 *     tags: [social]
 *     description: 指定された訪問記録のコメント一覧を取得します。
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 訪問記録のID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 取得件数
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: オフセット
 *     responses:
 *       200:
 *         description: コメント一覧取得成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 comments:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *       500:
 *         description: サーバーエラー
 *   post:
 *     summary: 訪問記録にコメントを追加
 *     tags: [social]
 *     description: 指定された訪問記録にコメントを追加します。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 訪問記録のID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 1000
 *                 description: コメント内容（最大1000文字）
 *     responses:
 *       200:
 *         description: コメント追加成功
 *       400:
 *         description: リクエストが不正
 *       401:
 *         description: 認証が必要
 *       404:
 *         description: 訪問記録が見つかりません
 *       500:
 *         description: サーバーエラー
 */

// ==========================================
// GET /api/visits/[id]/comments - コメント一覧取得
// ==========================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const visitId = params.id;

    // ✅ コメント一覧を取得
    const { data: comments, error, count } = await supabase
      .from('visit_comment')
      .select(`
        *,
        user:user_id (
          id,
          email
        )
      `, { count: 'exact' })
      .eq('visit_id', visitId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching comments:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch comments',
        details: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      comments: comments || [],
      total: count || 0
    });

  } catch (error: any) {
    console.error('Unexpected error fetching comments:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

// ==========================================
// POST /api/visits/[id]/comments - コメント追加
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

    const body = await request.json();
    const { content } = body;
    const visitId = params.id;
    const userId = session.user.id;

    // ✅ 2. 入力検証
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json({
        success: false,
        error: 'Content is required'
      }, { status: 400 });
    }

    if (content.length > 1000) {
      return NextResponse.json({
        success: false,
        error: 'Content must be less than 1000 characters'
      }, { status: 400 });
    }

    // ✅ 3. 訪問記録の存在確認
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

    // ✅ 4. コメントを追加
    const { data: comment, error: commentError } = await supabase
      .from('visit_comment')
      .insert({
        visit_id: visitId,
        user_id: userId,
        content: content.trim()
      })
      .select(`
        *,
        user:user_id (
          id,
          email
        )
      `)
      .single();

    if (commentError) {
      console.error('Error creating comment:', commentError);
      return NextResponse.json({
        success: false,
        error: 'Failed to create comment',
        details: commentError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      comment
    });

  } catch (error: any) {
    console.error('Unexpected error creating comment:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
