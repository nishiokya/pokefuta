import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/manholes/{id}/comments:
 *   get:
 *     summary: マンホール共有コメント一覧取得
 *     tags: [social]
 *     description: 指定されたマンホールIDに紐づく共有コメント一覧を取得します。
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: マンホールID
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
 *       400:
 *         description: リクエストが不正
 *       500:
 *         description: サーバーエラー
 *   post:
 *     summary: マンホール共有コメントを追加
 *     tags: [social]
 *     description: 指定されたマンホールIDに共有コメントを追加します。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: マンホールID
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
 *         description: マンホールが見つかりません
 *       500:
 *         description: サーバーエラー
 */

// ==========================================
// GET /api/manholes/[id]/comments - コメント一覧取得
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

    const manholeId = Number(params.id);
    if (!Number.isFinite(manholeId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid manhole id' },
        { status: 400 }
      );
    }

    const { data: comments, error, count } = await supabase
      .from('manhole_comment')
      .select('*', { count: 'exact' })
      .eq('manhole_id', manholeId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching manhole comments:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch comments',
          details: error.message,
        },
        { status: 500 }
      );
    }

    const userIds = Array.from(
      new Set(
        (comments || [])
          .map((c: any) => c?.user_id)
          .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    const displayNameByAuthUid = new Map<string, string | null>();

    if (userIds.length > 0) {
      const { data: appUsers, error: appUserError } = await supabase
        .from('app_user')
        .select('auth_uid, display_name')
        .in('auth_uid', userIds);

      if (appUserError) {
        console.warn('Failed to load app_user for manhole comments:', appUserError);
      } else {
        (appUsers || []).forEach((u: any) => {
          if (u?.auth_uid) {
            displayNameByAuthUid.set(u.auth_uid, u.display_name ?? null);
          }
        });
      }
    }

    const enriched = (comments || []).map((c: any) => {
      const uid = c.user_id;
      const displayName = typeof uid === 'string' ? (displayNameByAuthUid.get(uid) ?? null) : null;
      return {
        ...c,
        user: {
          id: uid,
          display_name: displayName,
        },
      };
    });

    return NextResponse.json({
      success: true,
      comments: enriched,
      total: count || 0,
    });
  } catch (error: any) {
    console.error('Unexpected error fetching manhole comments:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Unexpected error',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ==========================================
// POST /api/manholes/[id]/comments - コメント追加
// ==========================================
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const manholeId = Number(params.id);
    if (!Number.isFinite(manholeId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid manhole id' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { content } = body ?? {};

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      );
    }

    if (content.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Content must be less than 1000 characters' },
        { status: 400 }
      );
    }

    const { data: manhole, error: manholeError } = await supabase
      .from('manhole')
      .select('id')
      .eq('id', manholeId)
      .single();

    if (manholeError || !manhole) {
      return NextResponse.json(
        { success: false, error: 'Manhole not found' },
        { status: 404 }
      );
    }

    const userId = session.user.id;

    const { data: comment, error: commentError } = await supabase
      .from('manhole_comment')
      .insert({
        manhole_id: manholeId,
        user_id: userId,
        content: content.trim(),
        parent_comment_id: null,
      })
      .select('*')
      .single();

    if (commentError) {
      console.error('Error creating manhole comment:', commentError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create comment',
          details: commentError.message,
        },
        { status: 500 }
      );
    }

    let displayName: string | null = null;
    try {
      const { data: appUser } = await supabase
        .from('app_user')
        .select('display_name')
        .eq('auth_uid', userId)
        .maybeSingle();
      if (appUser) {
        displayName = appUser.display_name ?? null;
      }
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      comment: {
        ...comment,
        user: {
          id: userId,
          display_name: displayName,
        },
      },
    });
  } catch (error: any) {
    console.error('Unexpected error creating manhole comment:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Unexpected error',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
