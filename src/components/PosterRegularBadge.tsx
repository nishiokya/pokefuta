'use client';

import { useEffect, useState } from 'react';
import RegularBadge, { type RegularBadgeSize } from '@/components/RegularBadge';
import { loadOwnPublicUserId, loadOwnRegularTier } from '@/lib/own-regular-tier';
import { fetchRegularBadges, type RegularBadges, type RegularTier } from '@/lib/regular-badges';

/**
 * 投稿者名の横に出す称号（🏆 LEGEND〜🌱 ROOKIE の5段階）。公開ID を渡すだけで使える。
 *
 * ブラウザで data.pokefuta.com の regulars.json を読んで後から出す。サーバで組み立てるページに
 * 置いても SSR の仕事は増えない（src/lib/regular-badges.ts）。1ページに何個置いても
 * 取りに行くのは1回だけにするため、読み込みはモジュールで共有する。
 *
 * regulars.json は1日1回なので、ログイン中の本人の札だけはその場の枚数で上書きする
 * （src/lib/own-regular-tier.ts）。数えられなかったときは regulars.json の段のまま。
 */
let shared: Promise<RegularBadges> | null = null;
export const loadSharedRegularBadges = () => (shared ??= fetchRegularBadges());

export default function PosterRegularBadge({
  publicUserId,
  size = 'sm',
}: {
  publicUserId: string | null | undefined;
  size?: RegularBadgeSize;
}) {
  const [badges, setBadges] = useState<RegularBadges | null>(null);
  // 本人の札のときだけ入る。undefined は「本人ではない／まだ数えていない／数えられなかった」
  const [ownTier, setOwnTier] = useState<RegularTier | null | undefined>(undefined);

  useEffect(() => {
    if (!publicUserId) return;
    let cancelled = false;
    setOwnTier(undefined);
    loadSharedRegularBadges().then((loaded) => {
      if (!cancelled) setBadges(loaded);
    });
    loadOwnPublicUserId()
      .then((ownId) => (ownId === publicUserId ? loadOwnRegularTier(ownId) : undefined))
      .then((tier) => {
        if (!cancelled) setOwnTier(tier);
      });
    return () => {
      cancelled = true;
    };
  }, [publicUserId]);

  // 本人の段は regulars.json が来る前でも出してよい（どちらも同じ線で決めている）
  const tier = !publicUserId ? undefined : ownTier !== undefined ? ownTier : badges?.get(publicUserId);
  return tier ? <RegularBadge tier={tier} size={size} /> : null;
}
