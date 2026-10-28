import type { NotePart, RingColors } from '@/components/users/HeroStat';
import {
  REGULAR_BADGE_ICON,
  REGULAR_BADGE_NAME,
  REGULAR_TIER_MIN_MANHOLES,
  regularTierForCount,
  type RegularTier,
} from '@/lib/regular-badges';

// 称号の札（RegularBadge）と同じ色味。輪は細いので札より一段濃くする
export const TIER_RING: Record<RegularTier, RingColors> = {
  legend: ['#E879F9', '#FCD34D', '#38BDF8'],
  crown: ['#FCD34D', '#EAB308'],
  ranger: ['#7DD3FC', '#0EA5E9'],
  regular: ['#CBD5E1', '#64748B'],
  rookie: ['#BEF264', '#10B981'],
};

/**
 * 「訪問したポケふた」の欄の中身。輪は今の称号の色で、次の称号までどこまで来たか（中は 枚数/次の線）。
 * LEGEND は上が無いので、全国のポケふたのうち何割かを LEGEND の色で。
 * 画面（TitleProgressStat）と OGP 画像で共用する。
 */
export function titleProgress(visited: number, totalManholes: number) {
  const { current, next } = regularTierForCount(visited);
  const colors = current ? TIER_RING[current] : undefined;
  const nowLabel = current ? `${REGULAR_BADGE_ICON[current]}${REGULAR_BADGE_NAME[current]}` : null;

  if (!next) {
    const remaining = Math.max(totalManholes - visited, 0);
    const note: NotePart[] = [...(nowLabel ? [nowLabel] : []), remaining ? ['制覇まで', `あと${remaining}枚`] : '制覇！'];
    return { current, total: totalManholes, colors, note };
  }

  const nextMin = REGULAR_TIER_MIN_MANHOLES[next];
  const toNext: NotePart = [`${REGULAR_BADGE_ICON[next]}${REGULAR_BADGE_NAME[next]}まで`, `あと${Math.max(nextMin - visited, 0)}枚`];
  return { current, total: nextMin, colors, note: nowLabel ? [nowLabel, toNext] : [toNext] };
}
