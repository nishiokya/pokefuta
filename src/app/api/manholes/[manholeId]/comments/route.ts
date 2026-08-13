import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { ensureAppUser } from '@/lib/auth/ensureAppUser';
import { getAuthUserDisplayName } from '@/lib/auth/displayName';
import {
  MANHOLE_COMMENT_COLUMNS,
  fetchManholeCommentPage,
  serializeOwnManholeComment,
} from '@/lib/manhole-comments';

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
 *         description: 取得件数（新しい順。表示側で昇順に戻すこと）
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
  { params }: { params: { manholeId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    // カーソル。この時刻・IDより「古い」ものを返す（新しい順の続き）。
    const beforeCreatedAt = searchParams.get('before_created_at');
    const beforeId = searchParams.get('before_id');

    const manholeId = Number(params.manholeId);
    if (!Number.isFinite(manholeId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid manhole id' },
        { status: 400 }
      );
    }

    // **新しい順に返す。** 以前は古い順で先頭 limit 件だったので、
    // クライアントが50件だけ取ると **51件目以降の新着が再読込のたびに消えていた**
    // （投稿直後はローカル state への append で見えるので気づきにくい）。
    // スレッドが育つほど新しい発言が誰にも見えなくなる、成功が失敗を生む形だった。
    // 表示は昇順に戻すが、それは描画側の仕事。ページングの起点は常に最新。
    //
    // **続きは offset ではなくカーソルで取る。** 新しい順のリストは先頭が動くので、
    // offset=50 を取りに行く間に新着が1件入ると、窓が1件ぶんずれて
    // **初回ページの最古コメントが再び返り、重複IDが state に積まれる**
    // （React の duplicate key と件数の不整合）。逆に消えれば1件飛ぶ。
    // (created_at, id) の組で「これより古いもの」を指定すれば、
    // 何件増減しても境界がずれない。
    //
    // **テーブルではなく `get_manhole_comments()` を読む（Phase 1c-b）。**
    // 直読みだと投稿者の auth uid を取ってきてサーバ側で捨てることになり、
    // 1c-c で列そのものを剥がした瞬間に 42501 で落ちる。RPC は
    // SECURITY DEFINER なので、列を剥がしたあとも動く。
    // カーソル・件数・表示名の解決は RPC の中に寄せてある。
    const { page, error } = await fetchManholeCommentPage(supabase, {
      manholeId,
      limit,
      offset,
      beforeCreatedAt,
      beforeId,
    });

    if (error || !page) {
      console.error('Error fetching manhole comments:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch comments',
          details: error?.message ?? 'Unknown error',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      comments: page.comments,
      // スレッド全体の件数。**カーソル付きの取得では返さない。**
      // RPC の thread_total はカーソルに依らずスレッド全体を数えるので、
      // 実は常に返して構わない（PostgREST の `count: 'exact'` がカーソル付きで
      // 「そのカーソルより古い件数」になる問題は無くなった）。
      // ただし 1c-b では**契約を変えない**。クライアントは初回の値を保持する作りで、
      // ここを変えると読み込み中の見出しの動きまで変わる。切り替えるなら
      // ManholeCommentThread の total 保持と一緒に、別の PR で。
      total: beforeCreatedAt ? null : page.threadTotal,
      // 続きの有無はこちらで答える。total からの引き算では判定しないこと。
      has_more: page.hasMore,
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
  { params }: { params: { manholeId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const manholeId = Number(params.manholeId);
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

    // app_user が無いと表示名が解決できず「名無し」のコメントになる。
    // visit 側の POST には元からあるのに、こちらだけ抜けていた。
    await ensureAppUser(supabase, userId, getAuthUserDisplayName(session.user));

    const { data: comment, error: commentError } = await supabase
      .from('manhole_comment')
      .insert({
        manhole_id: manholeId,
        user_id: userId,
        content: content.trim(),
        parent_comment_id: null,
      })
      .select(MANHOLE_COMMENT_COLUMNS)
      .single();

    if (commentError) {
      console.error('Error creating manhole comment:', commentError);

      // CHECK 制約違反（23514）＝ 長さ・空白のみ。利用者側の入力なので 400。
      //
      // 429 の分岐は置いていない。投稿レート制限は 1a で入れかけて外したので
      // （created_at がサーバー管理でなく迂回できるため）、現状 53400 を投げる経路が無い。
      // 入れ直すときは、トリガと同じ PR で 429 + 再試行時間 + p_comment_failed の
      // error_code='rate_limited' をセットにすること。**片方だけ先に置かない。**
      if (commentError.code === '23514') {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid content',
            message: 'コメントの内容を確認してください。',
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create comment',
          details: commentError.message,
        },
        { status: 500 }
      );
    }

    // 書いたのはセッションの本人だと分かっているので、行から user_id を読まない。
    const serialized = await serializeOwnManholeComment(
      supabase,
      comment as any,
      userId
    );

    return NextResponse.json({
      success: true,
      comment: serialized,
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
