'use client';

import { useEffect, useState } from 'react';
import RegularBadge from '@/components/RegularBadge';
import { fetchRegularBadges, type RegularBadges } from '@/lib/regular-badges';

/**
 * 投稿者名の横に出す称号（👑 MASTER / EXPLORER / 🌱 ROOKIE）。公開ID を渡すだけで使える。
 *
 * ブラウザで data.pokefuta.com の regulars.json を読んで後から出す。サーバで組み立てるページに
 * 置いても SSR の仕事は増えない（src/lib/regular-badges.ts）。1ページに何個置いても
 * 取りに行くのは1回だけにするため、読み込みはモジュールで共有する。
 */
let shared: Promise<RegularBadges> | null = null;
const loadShared = () => (shared ??= fetchRegularBadges());

export default function PosterRegularBadge({
  publicUserId,
  size = 'sm',
}: {
  publicUserId: string | null | undefined;
  size?: 'sm' | 'md';
}) {
  const [badges, setBadges] = useState<RegularBadges | null>(null);

  useEffect(() => {
    if (!publicUserId) return;
    let cancelled = false;
    loadShared().then((loaded) => {
      if (!cancelled) setBadges(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [publicUserId]);

  const tier = publicUserId ? badges?.get(publicUserId) : undefined;
  return tier ? <RegularBadge tier={tier} size={size} /> : null;
}
