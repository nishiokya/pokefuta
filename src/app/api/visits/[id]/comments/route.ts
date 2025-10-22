import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

// Admin client for user lookup
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * @swagger
 * /api/visits/{id}/comments:
 *   get:
 *     summary: 訪問記録のコメント一覧を取得
 *     tags: [visits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 訪問記録ID
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
 *         description: コメント一覧
 *       404:
 *         description: 訪問記録が見つかりません
 */
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

    // 1. コメント一覧を取得
    const { data: comments, error, count } = await supabase
      .from('visit_comment')
      .select('*', { count: 'exact' })
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

    // 2. ユーザー情報を取得
    const userIds = [...new Set(comments?.map(c => c.user_id) || [])];

    // auth.users テーブルから直接ユーザー情報を取得
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();

    const usersMap = new Map(
      users?.users
        ?.filter(u => userIds.includes(u.id))
        .map(u => [u.id, { id: u.id, email: u.email || 'Unknown' }]) || []
    );

    // 3. コメントにユーザー情報を追加
    const commentsWithUsers = comments?.map(comment => ({
      ...comment,
      user: usersMap.get(comment.user_id) || { id: comment.user_id, email: 'Unknown' }
    })) || [];

    return NextResponse.json({
      success: true,
      comments: commentsWithUsers,
      total: count || 0,
      limit,
      offset
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

/**
 * @swagger
 * /api/visits/{id}/comments:
 *   post:
 *     summary: 訪問記録にコメントを投稿
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 1000
 *             required:
 *               - content
 *     responses:
 *       200:
 *         description: コメント投稿成功
 *       400:
 *         description: 不正なリクエスト
 *       401:
 *         description: 認証が必要
 *       404:
 *         description: 訪問記録が見つかりません
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

    const body = await request.json();
    const { content } = body;
    const visitId = params.id;

    // 2. 入力検証
    if (!content || typeof content !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Content is required'
      }, { status: 400 });
    }

    if (content.length > 1000) {
      return NextResponse.json({
        success: false,
        error: 'Content must be 1000 characters or less'
      }, { status: 400 });
    }

    // 3. 訪問記録の存在確認
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

    // 4. コメントを投稿
    const { data: comment, error: commentError } = await supabase
      .from('visit_comment')
      .insert({
        visit_id: visitId,
        user_id: session.user.id,
        content: content.trim()
      })
      .select()
      .single();

    if (commentError) {
      console.error('Error creating comment:', commentError);
      return NextResponse.json({
        success: false,
        error: 'Failed to create comment',
        details: commentError.message
      }, { status: 500 });
    }

    // 5. コメントにユーザー情報を追加
    const commentWithUser = {
      ...comment,
      user: {
        id: session.user.id,
        email: session.user.email
      }
    };

    return NextResponse.json({
      success: true,
      comment: commentWithUser
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
