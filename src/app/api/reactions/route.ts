import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

/**
 * @swagger
 * /api/reactions:
 *   get:
 *     summary: リアクション情報を取得
 *     tags: [reactions]
 *     parameters:
 *       - in: query
 *         name: photo_id
 *         schema:
 *           type: string
 *         description: 写真ID
 *     responses:
 *       200:
 *         description: リアクション情報
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { searchParams } = new URL(request.url);
    const photoId = searchParams.get('photo_id');

    if (!photoId) {
      return NextResponse.json({
        success: false,
        error: 'photo_id is required'
      }, { status: 400 });
    }

    // ログインユーザーを取得（任意）
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // いいね数を取得
    const { count: likeCount } = await supabase
      .from('reaction')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', 'photo')
      .eq('target_id', photoId)
      .eq('reaction_type', 'like');

    // ブックマーク数を取得
    const { count: bookmarkCount } = await supabase
      .from('reaction')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', 'photo')
      .eq('target_id', photoId)
      .eq('reaction_type', 'bookmark');

    // ユーザーのリアクション状態を取得
    let userLiked = false;
    let userBookmarked = false;

    if (userId) {
      const { data: userReactions } = await supabase
        .from('reaction')
        .select('reaction_type')
        .eq('target_type', 'photo')
        .eq('target_id', photoId)
        .eq('user_id', userId);

      if (userReactions) {
        userLiked = userReactions.some(r => r.reaction_type === 'like');
        userBookmarked = userReactions.some(r => r.reaction_type === 'bookmark');
      }
    }

    return NextResponse.json({
      success: true,
      likes: likeCount || 0,
      bookmarks: bookmarkCount || 0,
      userLiked,
      userBookmarked
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error?.message
    }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/reactions:
 *   post:
 *     summary: リアクションを追加/削除
 *     tags: [reactions]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               photo_id:
 *                 type: string
 *               reaction_type:
 *                 type: string
 *                 enum: [like, bookmark]
 *     responses:
 *       200:
 *         description: リアクション成功
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // 認証チェック
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const body = await request.json();
    const { photo_id, reaction_type } = body;

    if (!photo_id || !reaction_type) {
      return NextResponse.json({
        success: false,
        error: 'photo_id and reaction_type are required'
      }, { status: 400 });
    }

    if (!['like', 'bookmark'].includes(reaction_type)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid reaction_type. Must be "like" or "bookmark"'
      }, { status: 400 });
    }

    const userId = session.user.id;

    // 既存のリアクションをチェック
    const { data: existingReaction } = await supabase
      .from('reaction')
      .select('id')
      .eq('user_id', userId)
      .eq('target_type', 'photo')
      .eq('target_id', photo_id)
      .eq('reaction_type', reaction_type)
      .single();

    if (existingReaction) {
      // 既にリアクション済み → 削除（トグル）
      const { error: deleteError } = await supabase
        .from('reaction')
        .delete()
        .eq('id', existingReaction.id);

      if (deleteError) {
        console.error('Delete reaction error:', deleteError);
        return NextResponse.json({
          success: false,
          error: 'Failed to remove reaction',
          details: deleteError.message
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        action: 'removed',
        reaction_type
      });
    } else {
      // 新規リアクション → 追加
      const { error: insertError } = await supabase
        .from('reaction')
        .insert({
          user_id: userId,
          target_type: 'photo',
          target_id: photo_id,
          reaction_type
        });

      if (insertError) {
        console.error('Insert reaction error:', insertError);
        return NextResponse.json({
          success: false,
          error: 'Failed to add reaction',
          details: insertError.message
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        action: 'added',
        reaction_type
      });
    }

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error?.message
    }, { status: 500 });
  }
}
