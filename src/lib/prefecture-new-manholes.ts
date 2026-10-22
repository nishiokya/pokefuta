import type { PublicPrefectureProgress } from '@/lib/user-prefecture-progress';

/**
 * 制覇したあとに新しく増えて、まだ行っていない枚数。
 *
 * remaining だけを見ると、制覇後に本人が訪問を非公開にした県まで「新しいポケふた」と出てしまう。
 * 増えた枚数（total - earnedTotal）を上限にして、新設の分だけを数える。
 */
export function newUnvisitedSinceEarned(
  prefecture: Pick<PublicPrefectureProgress, 'earnedAt' | 'total' | 'earnedTotal' | 'remaining'>
): number {
  if (!prefecture.earnedAt) return 0;
  return Math.max(Math.min(prefecture.remaining, prefecture.total - prefecture.earnedTotal), 0);
}
