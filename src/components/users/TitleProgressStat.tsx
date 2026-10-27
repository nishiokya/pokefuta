'use client';

import { useEffect, useState } from 'react';
import HeroStat from '@/components/users/HeroStat';
import { loadSharedRegularBadges } from '@/components/PosterRegularBadge';
import { titleProgress } from '@/components/users/title-progress';
import type { RegularTier } from '@/lib/regular-badges';

/**
 * 「訪問したポケふた」の欄。中身は titleProgress（OGP 画像と共用）。
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

  const { total, colors, note } = titleProgress(visited, totalManholes, awarded);
  return (
    <HeroStat
      id="title"
      label={['訪問した', 'ポケふた']}
      value={visited}
      total={total}
      colors={colors}
      note={note}
    />
  );
}
