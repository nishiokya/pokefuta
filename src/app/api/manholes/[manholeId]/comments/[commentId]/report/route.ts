import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/manholes/{manholeId}/comments/{commentId}/report:
 *   post:
 *     summary: 蓋コメントを通報
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: 通報を受け付けた（既に通報済みでも 200）
 *       401:
 *         description: 認証が必要
 *       404:
 *         description: コメントが見つかりません
 */

export async function POST(
  request: NextRequest,
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

    let reason: string | null = null;
    try {
      const body = await request.json();
      const raw = body?.reason;
      if (typeof raw === 'string' && raw.trim() !== '') {
        reason = raw.trim().slice(0, 500);
      }
    } catch {
      // 本文なしの通報を許す。理由は任意。
    }

    // 存在しないコメントIDで滞留件数を膨らませられないようにする。
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

    // 自分のコメントは通報できない。UI では通報ボタンを出していないが、
    // **UI は境界ではない。** ここで弾かないと、自分で投稿して自分で通報するだけで
    // 運営が読むべき滞留件数をいくらでも水増しできる。
    // （通報の受け皿を作る目的が「読む」ことである以上、これは機能の否定にあたる）
    if ((comment as any).user_id === userId) {
      return NextResponse.json({
        success: false,
        error: 'You cannot report your own comment'
      }, { status: 403 });
    }

    // **`.select()` を付けないこと。** comment_report には SELECT ポリシーが無いので、
    // `INSERT ... RETURNING` は 42501 で落ちる（photo.exif で踏んだのと同じ形）。
    // 通報は書き込み専用で、返す値は無い。
    // tools/verify-comment-guardrails.sql の [5] がこの挙動を固定している。
    const { error: insertError } = await supabase
      .from('comment_report')
      .insert({
        comment_id: commentId,
        reporter_user_id: userId,
        reason,
      } as any);

    if (insertError) {
      // 23505 = 同じ人が同じコメントを再通報（部分ユニーク索引）。
      // 連打で滞留件数が膨らまないようにしてあるので、利用者にはエラーを見せない。
      if (insertError.code === '23505') {
        return NextResponse.json({
          success: true,
          message: 'Already reported',
          already_reported: true,
        });
      }

      console.error('Error creating comment report:', insertError);
      return NextResponse.json({
        success: false,
        error: 'Failed to report comment',
        details: insertError.message,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Report received',
      already_reported: false,
    });

  } catch (error: any) {
    console.error('Unexpected error reporting comment:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
