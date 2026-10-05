'use client';

import { useEffect, useState } from 'react';
import RegularBadge from '@/components/RegularBadge';
import { fetchRegularBadges, type RegularTier } from '@/lib/regular-badges';

/**
 * 公開スタンプ帳の見出しに出す称号（👑 MASTER / EXPLORER）。
 *
 * ページ本体はサーバで組み立てているが、称号はブラウザで regulars.json を読んで後から出す。
 * サーバで取りに行くと Amplify の SSR 実行時間が延びるため（src/lib/regular-badges.ts）。
 */
export default function UserRegularBadge({ userId }: { userId: string }) {
  const [tier, setTier] = useState<RegularTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRegularBadges().then((badges) => {
      if (!cancelled) setTier(badges.get(userId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return tier ? <RegularBadge tier={tier} size="md" /> : null;
}
