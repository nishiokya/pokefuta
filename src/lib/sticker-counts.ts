import 'server-only';
import { loadUserSnapshot } from '@/lib/user-snapshot';

// 公開スタンプ帳のステッカーの数（デザインマンホール・ぬいぐるみ・雪）。画面の一覧は件数で切れているので、
// 数は DB で全件を数えたものを公開スタンプ帳のスナップショット（src/lib/user-snapshot.ts）に入れてある。
// 取れなければ 0（ステッカーが出ないだけ）

export type PublicStickerCounts = { designManholeCount: number; plushCount: number; snowCount: number };

/** 公開IDの人の公開スタンプ帳に出すステッカーの数 */
export async function loadPublicStickerCounts(publicUserId: string): Promise<PublicStickerCounts> {
  try {
    const snapshot = await loadUserSnapshot(publicUserId);
    return {
      designManholeCount: snapshot?.counts.designManhole ?? 0,
      plushCount: snapshot?.counts.plush ?? 0,
      snowCount: snapshot?.counts.snow ?? 0,
    };
  } catch (error) {
    console.warn('Failed to load sticker counts:', error);
    return { designManholeCount: 0, plushCount: 0, snowCount: 0 };
  }
}
