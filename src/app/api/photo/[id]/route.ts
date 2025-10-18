import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { storage } from '@/lib/storage';

/**
 * @swagger
 * /api/photo/{id}:
 *   get:
 *     summary: 写真を取得
 *     tags: [photos]
 *     description: 写真のsigned URLにリダイレクトします。
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 写真ID
 *       - in: query
 *         name: size
 *         schema:
 *           type: string
 *           enum: [small, medium, large]
 *         description: サムネイルサイズ
 *     responses:
 *       307:
 *         description: Signed URLにリダイレクト
 *       404:
 *         description: 写真が見つかりません
 *   delete:
 *     summary: 写真を削除
 *     tags: [photos]
 *     description: 写真をR2ストレージとDBから削除します。自分の写真のみ削除可能。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 写真ID
 *     responses:
 *       200:
 *         description: 削除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 photo_id:
 *                   type: string
 *                   format: uuid
 *       401:
 *         description: 認証が必要
 *       403:
 *         description: 権限がありません（自分の写真ではない）
 *       404:
 *         description: 写真が見つかりません
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const photoId = params.id;
    const { searchParams } = new URL(request.url);
    const size = searchParams.get('size'); // 'small', 'medium', 'large', or null for original

    // Fetch photo metadata from database
    const { data: photo, error } = await supabase
      .from('photo')
      .select('*')
      .eq('id', photoId)
      .single();

    if (error || !photo) {
      return NextResponse.json({
        success: false,
        error: 'Photo not found'
      }, { status: 404 });
    }

    // Determine which storage key to use based on size
    let storageKey = photo.storage_key;

    // For now, we don't have separate thumbnails, so just use the main image
    // TODO: Generate and store thumbnails

    // Get signed URL from storage provider
    const signedUrl = await storage.getSignedUrl(storageKey, 3600); // 1 hour expiry

    // Redirect to the signed URL
    return NextResponse.redirect(signedUrl.url);

  } catch (error: any) {
    console.error('Error fetching photo:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch photo',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

// Delete a photo
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const photoId = params.id;

    // ✅ 1. 認証チェック
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    // ✅ 2. 写真のメタデータを取得し、所有者確認
    const { data: photo, error: fetchError } = await supabase
      .from('photo')
      .select(`
        *,
        visit:visit_id (
          id,
          user_id
        )
      `)
      .eq('id', photoId)
      .single();

    if (fetchError || !photo) {
      return NextResponse.json({
        success: false,
        error: 'Photo not found'
      }, { status: 404 });
    }

    // ✅ 3. 所有者チェック（visitのuser_idと一致するか確認）
    if (!photo.visit || (photo.visit as any).user_id !== session.user.id) {
      return NextResponse.json({
        success: false,
        error: 'Permission denied: You can only delete your own photos'
      }, { status: 403 });
    }

    // ✅ 4. R2から画像ファイルを削除
    try {
      if (storage.delete) {
        await storage.delete(photo.storage_key);
        console.log(`Deleted photo from storage: ${photo.storage_key}`);
      } else {
        console.warn('Storage adapter does not support delete operation');
      }
    } catch (storageError: any) {
      console.error('Error deleting photo from storage:', storageError);
      // ストレージ削除に失敗してもDB削除は続行
      // （ファイルが既に存在しない可能性もあるため）
    }

    // ✅ 5. データベースから写真レコードを削除
    const { error: deleteError } = await supabase
      .from('photo')
      .delete()
      .eq('id', photoId);

    if (deleteError) {
      console.error('Error deleting photo from database:', deleteError);
      return NextResponse.json({
        success: false,
        error: 'Failed to delete photo from database',
        details: deleteError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Photo deleted successfully',
      photo_id: photoId
    });

  } catch (error: any) {
    console.error('Unexpected error deleting photo:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
