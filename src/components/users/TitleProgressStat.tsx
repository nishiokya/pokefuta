'use client';

import { useEffect, useState } from 'react';
import HeroStat, { type NotePart, type RingColors } from '@/components/users/HeroStat';
import { loadSharedRegularBadges } from '@/components/PosterRegularBadge';
import {
  REGULAR_BADGE_ICON,
  REGULAR_BADGE_NAME,
  REGULAR_TIER_MIN_MANHOLES,
  regularTierForCount,
  type RegularTier,
} from '@/lib/regular-badges';

// 称号の札（RegularBadge）と同じ色味。輪は細いので札より一段濃くする
const TIER_RING: Record<RegularTier, RingColors> = {
  legend: ['#E879F9', '#FCD34D', '#38BDF8'],
  crown: ['#FCD34D', '#EAB308'],
  ranger: ['#7DD3FC', '#0EA5E9'],
  regular: ['#CBD5E1', '#64748B'],
  rookie: ['#BEF264', '#10B981'],
};

/**
 * 「訪問したポケふた」の欄。輪は今の称号の色で、次の称号までどこまで来たか（中は 枚数/次の線）。
 * LEGEND は上が無いので、全国のポケふたのうち何割かを LEGEND の色で。
 * 線を上げる前に届いた段（regulars.json）は据え置くので、ブラウザで読んでから高いほうにする。
 */
export default function TitleProgressStat({
  publicUserId,
  visited,
  totalManholes,
}: {
  publicUserId: string;
  visited: number;
  totalManholes: number;
}) {
  const [awarded, setAwarded] = useState<RegularTier | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSharedRegularBadges().then((badges) => {
      if (!cancelled) setAwarded(badges.get(publicUserId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [publicUserId]);

  const { current, next } = regularTierForCount(visited, awarded);
  const label = ['訪問した', 'ポケふた'];
  const colors = current ? TIER_RING[current] : undefined;
  const nowLabel = current ? `${REGULAR_BADGE_ICON[current]}${REGULAR_BADGE_NAME[current]}` : null;

  if (!next) {
    const remaining = Math.max(totalManholes - visited, 0);
    return (
      <HeroStat
        id="title"
        label={label}
        value={visited}
        total={totalManholes}
        colors={colors}
        note={[...(nowLabel ? [nowLabel] : []), remaining ? ['制覇まで', `あと${remaining}枚`] : '制覇！']}
      />
    );
  }

  const nextMin = REGULAR_TIER_MIN_MANHOLES[next];
  const toNext: NotePart = [`${REGULAR_BADGE_ICON[next]}${REGULAR_BADGE_NAME[next]}まで`, `あと${Math.max(nextMin - visited, 0)}枚`];
  return (
    <HeroStat
      id="title"
      label={label}
      value={visited}
      total={nextMin}
      colors={colors}
      note={nowLabel ? [nowLabel, toNext] : [toNext]}
    />
  );
}
