import 'server-only';
import type { UserSnapshot } from '@/lib/user-snapshot-format';

// 公開スタンプ帳のステッカーの数（デザインマンホール・ぬいぐるみ・雪）。画面の一覧は件数で切れているので、
// 数は DB で全件を数えたものを公開スタンプ帳のスナップショット（src/lib/user-snapshot.ts）に入れてある。

export type PublicStickerCounts = { designManholeCount: number; plushCount: number; snowCount: number };

/** 公開IDの人の公開スタンプ帳に出すステッカーの数 */
export function publicStickerCountsFromSnapshot(snapshot: UserSnapshot): PublicStickerCounts {
  return {
    designManholeCount: snapshot.counts.designManhole,
    plushCount: snapshot.counts.plush,
    snowCount: snapshot.counts.snow,
  };
}
