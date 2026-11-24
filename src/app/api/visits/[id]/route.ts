import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { storage, photoObjectKeys } from '@/lib/storage';
import { VISIT_COMMENT_MAX_LENGTH } from '@/lib/visit-tip';
import { canOfferGift, giftUntilFor } from '@/lib/visit-gift';
import { lockOwnSnapshot, unlockOwnSnapshot } from '@/lib/user-snapshot';

/**
 * @swagger
 * /api/visits/{id}:
 *   patch:
 *     summary: 訪問記録の公開設定・ひとことを変更
 *     tags: [visits]
 *     description: 自分の訪問記録の is_public / comment / gift を更新します（どれか1つだけでもよい）。他人の記録は変更できません。
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
 *               gift:
 *                 type: boolean
 *                 description: true で「このポケふたのギフトを配れます」（期限は撮影日から10日）、false で外す
 *     responses:
 *       200:
 *         description: 更新成功
 *       400:
 *         description: 更新項目が無い、is_public / gift が boolean でない、comment が文字列でないか500文字を超える、撮影から10日を過ぎた・公式ポケふたでない記録に gift を付けようとした
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

    const payload = (body ?? {}) as { is_public?: unknown; comment?: unknown; gift?: unknown };
    const hasIsPublic = payload.is_public !== undefined;
    const hasComment = payload.comment !== undefined;
    const hasGift = payload.gift !== undefined;

    if (!hasIsPublic && !hasComment && !hasGift) {
      return NextResponse.json({
        success: false,
        error: 'is_public, comment or gift is required'
      }, { status: 400 });
    }

    if (hasGift && typeof payload.gift !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: 'gift must be a boolean'
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
      .select('id, user_id, manhole_id, shot_at')
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

    // 「このポケふたのギフトを配れます」。期限はサーバが撮影日から決める（クライアントの値は受けない）。
    // DB の CHECK（visit_gift_until_window）と同じ条件をここで先に見て、分かる言葉で断る。
    let giftUntil: string | null | undefined;
    if (hasGift) {
      if (payload.gift === true) {
        if (visit.manhole_id == null) {
          return NextResponse.json({
            success: false,
            code: 'gift_not_pokefuta',
            error: 'Gift can only be offered for an official pokefuta visit'
          }, { status: 400 });
        }
        const until = canOfferGift(visit.shot_at) ? giftUntilFor(visit.shot_at) : null;
        if (!until) {
          return NextResponse.json({
            success: false,
            code: 'gift_window_passed',
            error: 'Gift can only be offered within 10 days of the shot'
          }, { status: 400 });
        }
        giftUntil = until.toISOString();
      } else {
        giftUntil = null;
      }
    }

    // 公開スタンプ帳のスナップショット（R2）に書き込み中のロックを置く。置けなければ書き込まない
    // （ロックなしで非公開にすると、古い JSON が残り得る）。書き込みのあと unlockOwnSnapshot で作り直す
    const snapshotLock = await lockOwnSnapshot(supabase);
    if (!snapshotLock.ok) {
      return NextResponse.json({
        success: false,
        error: 'Temporarily unavailable. Please try again.'
      }, { status: 503 });
    }

    // visit には updated_at トリガーが無いので明示的に更新する。
    // RLS(users_update_own_visits) に加えて user_id でも絞り、DELETE と同じ多層防御にする。
    const { data: updated, error: updateError } = await supabase
      .from('visit')
      .update({
        ...(hasIsPublic ? { is_public: payload.is_public as boolean } : {}),
        ...(hasComment ? { comment } : {}),
        ...(hasGift ? { gift_until: giftUntil } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', visitId)
      .eq('user_id', session.user.id)
      .select('id, is_public, comment, gift_until')
      .single();

    if (updateError || !updated) {
      console.error('Error updating visit:', updateError);
      return NextResponse.json({
        success: false,
        error: 'Failed to update visit',
        details: updateError?.message
      }, { status: 500 });
    }

    // 公開スタンプ帳のスナップショット（R2）を今の DB から作り直す。非公開に戻した訪問を残さないため
    await unlockOwnSnapshot(snapshotLock, supabase);

    return NextResponse.json({
      success: true,
      visit_id: updated.id,
      is_public: updated.is_public,
      comment: updated.comment,
      gift_until: updated.gift_until ?? null
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

    // 公開スタンプ帳のスナップショット（R2）に書き込み中のロックを置く。置けなければ書き込まない
    // （ロックなしで非公開にすると、古い JSON が残り得る）。書き込みのあと unlockOwnSnapshot で作り直す
    const snapshotLock = await lockOwnSnapshot(supabase);
    if (!snapshotLock.ok) {
      return NextResponse.json({
        success: false,
        error: 'Temporarily unavailable. Please try again.'
      }, { status: 503 });
    }

    for (const photo of photosToDelete) {
      // サムネイルも消す。残すと CDN に残った ?size=small の転送先がまだ表示できる（#282）
      for (const key of photoObjectKeys(photo.storage_key)) {
        try {
          if (storage.delete) {
            await storage.delete(key);
            console.log(`Deleted photo from storage: ${key}`);
          } else {
            console.warn('Storage adapter does not support delete operation');
          }
        } catch (storageError: any) {
          console.error('Error deleting photo from storage:', storageError);
          // Continue DB deletion even if the object has already gone missing.
        }
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

    // 公開スタンプ帳のスナップショット（R2）を今の DB から作り直す。非公開に戻した訪問を残さないため
    await unlockOwnSnapshot(snapshotLock, supabase);

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
