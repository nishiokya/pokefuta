import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { storage } from '@/lib/storage';
import { VISIT_COMMENT_MAX_LENGTH } from '@/lib/visit-tip';

/**
 * @swagger
 * /api/visits/{id}:
 *   patch:
 *     summary: 訪問記録の公開設定・ひとことを変更
 *     tags: [visits]
 *     description: 自分の訪問記録の is_public / comment を更新します（どちらか一方だけでもよい）。他人の記録は変更できません。
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 訪問記録ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_public:
 *                 type: boolean
 *                 description: true で公開、false で非公開
 *               comment:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 500
 *                 description: 次に来る人へのひとこと。空文字または null で消す
 *     responses:
 *       200:
 *         description: 更新成功
 *       400:
 *         description: 更新項目が無い、is_public が boolean でない、comment が文字列でないか500文字を超える
 *       401:
 *         description: 認証が必要
 *       403:
 *         description: 他人の訪問記録は変更できない
 *       404:
 *         description: 訪問記録が見つからない
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const visitId = params.id;

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Invalid JSON body'
      }, { status: 400 });
    }

    const payload = (body ?? {}) as { is_public?: unknown; comment?: unknown };
    const hasIsPublic = payload.is_public !== undefined;
    const hasComment = payload.comment !== undefined;

    if (!hasIsPublic && !hasComment) {
      return NextResponse.json({
        success: false,
        error: 'is_public or comment is required'
      }, { status: 400 });
    }

    if (hasIsPublic && typeof payload.is_public !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: 'is_public must be a boolean'
      }, { status: 400 });
    }

    // 「次に来る人へひとこと」を後から書く経路（投稿完了画面・蓋の詳細）。
    // 上限は投稿画面の textarea と同じ 500 文字。空文字は「消した」として null に落とす。
    let comment: string | null | undefined;
    if (hasComment) {
      if (payload.comment !== null && typeof payload.comment !== 'string') {
        return NextResponse.json({
          success: false,
          error: 'comment must be a string or null'
        }, { status: 400 });
      }
      const trimmed = typeof payload.comment === 'string' ? payload.comment.trim() : '';
      if (trimmed.length > VISIT_COMMENT_MAX_LENGTH) {
        return NextResponse.json({
          success: false,
          error: `comment must be at most ${VISIT_COMMENT_MAX_LENGTH} characters`
        }, { status: 400 });
      }
      comment = trimmed || null;
    }

    const { data: visit, error: visitError } = await supabase
      .from('visit')
      .select('id, user_id')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({
        success: false,
        error: 'Visit not found'
      }, { status: 404 });
    }

    if (visit.user_id !== session.user.id) {
      return NextResponse.json({
        success: false,
        error: 'Permission denied: You can only update your own visits'
      }, { status: 403 });
    }

    // visit には updated_at トリガーが無いので明示的に更新する。
    // RLS(users_update_own_visits) に加えて user_id でも絞り、DELETE と同じ多層防御にする。
    const { data: updated, error: updateError } = await supabase
      .from('visit')
      .update({
        ...(hasIsPublic ? { is_public: payload.is_public as boolean } : {}),
        ...(hasComment ? { comment } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', visitId)
      .eq('user_id', session.user.id)
      .select('id, is_public, comment')
      .single();

    if (updateError || !updated) {
      console.error('Error updating visit:', updateError);
      return NextResponse.json({
        success: false,
        error: 'Failed to update visit',
        details: updateError?.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      visit_id: updated.id,
      is_public: updated.is_public,
      comment: updated.comment
    });
  } catch (error: any) {
    console.error('Unexpected error updating visit visibility:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

// Delete a visit and all photos attached to it.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const visitId = params.id;

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    const { data: visit, error: visitError } = await supabase
      .from('visit')
      .select('id, user_id')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({
        success: false,
        error: 'Visit not found'
      }, { status: 404 });
    }

    if (visit.user_id !== session.user.id) {
      return NextResponse.json({
        success: false,
        error: 'Permission denied: You can only delete your own visits'
      }, { status: 403 });
    }

    const { data: visitPhotos, error: photosError } = await supabase
      .from('photo')
      .select('id, storage_key')
      .eq('visit_id', visitId);

    if (photosError) {
      console.error('Error fetching visit photos before delete:', photosError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch related photos',
        details: photosError.message
      }, { status: 500 });
    }

    const photosToDelete = visitPhotos || [];
    const deletedPhotoIds = photosToDelete.map((photo) => photo.id);

    for (const photo of photosToDelete) {
      try {
        if (storage.delete) {
          await storage.delete(photo.storage_key);
          console.log(`Deleted photo from storage: ${photo.storage_key}`);
        } else {
          console.warn('Storage adapter does not support delete operation');
        }
      } catch (storageError: any) {
        console.error('Error deleting photo from storage:', storageError);
        // Continue DB deletion even if the object has already gone missing.
      }
    }

    if (deletedPhotoIds.length > 0) {
      const { error: deletePhotosError } = await supabase
        .from('photo')
        .delete()
        .eq('visit_id', visitId);

      if (deletePhotosError) {
        console.error('Error deleting photos from database:', deletePhotosError);
        return NextResponse.json({
          success: false,
          error: 'Failed to delete photos from database',
          details: deletePhotosError.message
        }, { status: 500 });
      }
    }

    // visit_like / visit_comment / visit_bookmark are deleted by ON DELETE CASCADE.
    const { error: deleteVisitError } = await supabase
      .from('visit')
      .delete()
      .eq('id', visitId)
      .eq('user_id', session.user.id);

    if (deleteVisitError) {
      console.error('Error deleting visit from database:', deleteVisitError);
      return NextResponse.json({
        success: false,
        error: 'Failed to delete visit from database',
        details: deleteVisitError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Visit deleted successfully',
      visit_id: visitId,
      photo_ids: deletedPhotoIds,
      visit_deleted: true
    });
  } catch (error: any) {
    console.error('Unexpected error deleting visit:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
