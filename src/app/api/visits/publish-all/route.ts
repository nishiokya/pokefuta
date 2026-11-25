import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { cookies } from 'next/headers';
import { SNAPSHOT_LOCK_FAILED_CODE, lockOwnSnapshot, unlockOwnSnapshot, withOwnSnapshotUnlock } from '@/lib/user-snapshot';

/**
 * @swagger
 * /api/visits/publish-all:
 *   post:
 *     summary: 自分の非公開の訪問記録をまとめて公開する
 *     description: |
 *       ログインユーザー自身の `is_public = false` の訪問記録をすべて公開に変える。
 *       他人の記録は RLS と user_id の明示指定の二層で対象外。
 *     tags: [visits]
 *     responses:
 *       200:
 *         description: 公開した件数を返す（0件でも成功）
 *       401:
 *         description: 未認証
 */
async function handlePOST(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    // 公開スタンプ帳のスナップショット（R2）に書き込み中のロックを置く。置けなければ書き込まない
    // （ロックなしで非公開にすると、古い JSON が残り得る）。書き込みのあと unlockOwnSnapshot で作り直す
    const snapshotLock = await lockOwnSnapshot(supabase);
    if (!snapshotLock.ok) {
      return NextResponse.json({
        success: false,
        code: SNAPSHOT_LOCK_FAILED_CODE,
        error: 'Temporarily unavailable. Please try again.'
      }, { status: 503 });
    }

    // visit には updated_at トリガーが無いので明示的に更新する。
    // RLS(users_update_own_visits) に加えて user_id でも絞り、単体 PATCH と同じ多層防御にする。
    // is_public = false で絞るのは、既に公開済みの記録の updated_at を無意味に動かさないため。
    const { data: updated, error: updateError } = await supabase
      .from('visit')
      .update({ is_public: true, updated_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .eq('is_public', false)
      .select('id');

    if (updateError) {
      console.error('Error publishing all private visits:', updateError);
      return NextResponse.json({
        success: false,
        error: 'Failed to publish private visits',
        details: updateError.message
      }, { status: 500 });
    }

    // 公開スタンプ帳のスナップショット（R2）を今の DB から作り直す。非公開に戻した訪問を残さないため
    await unlockOwnSnapshot(snapshotLock);

    return NextResponse.json({
      success: true,
      published_count: updated?.length ?? 0
    });
  } catch (error: any) {
    console.error('Unexpected error publishing all private visits:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

// 書き込みが失敗・例外で終わっても、置いた公開スタンプ帳のロックを外す（src/lib/user-snapshot.ts）
export const POST = withOwnSnapshotUnlock(handlePOST);
