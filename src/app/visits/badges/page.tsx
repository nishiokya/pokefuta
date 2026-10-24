'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PCShell from '@/components/PCShell';
import MyBadgesPanel from '@/components/visits/MyBadgesPanel';
import VisitsSwitcher from '@/components/visits/VisitsSwitcher';
import type { BadgeManhole } from '@/lib/badge-catalog';
import { fetchAllManholes } from '@/lib/manhole-list-client';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { pageTitle } from '@/lib/constants';

const VISITS_PAGE_SIZE = 1000;

type VisitRow = { is_public?: boolean; manhole?: { id?: number } | null };

type Loaded = {
  manholes: BadgeManhole[];
  visited: Set<number>;
  publicCount: number;
};

// スタンプ帳の「カード」タブ（スマホ）。トレーナーカード（称号・バッジ・ステッカー）。PC はスタンプ（/visits）の右レールに同じものが出る。
// 旅の記録と同じく、未ログインの紹介画面は持たずにログインへ送る。
export default function VisitsBadgesPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const { trackView } = useAnalytics();

  useEffect(() => {
    document.title = pageTitle('トレーナーカード');
    (async () => {
      try {
        const { data: { session } } = await createBrowserClient().auth.getSession();
        const loggedIn = Boolean(session?.user);
        trackView('/visits/badges', 'トレーナーカード', 'visits_badges', loggedIn);
        if (!loggedIn) {
          router.replace('/login?redirect=/visits/badges');
          return;
        }
        const list = await fetchAllManholes();
        const visited = new Set<number>();
        const publicIds = new Set<number>();
        // 新しい順に limit 件ずつ返るので、短いページが返るまで読む（再訪も1件に数えられる）
        for (let offset = 0; ; offset += VISITS_PAGE_SIZE) {
          const res = await fetch(`/api/visits?limit=${VISITS_PAGE_SIZE}&offset=${offset}`);
          if (!res.ok) break;
          const body = await res.json();
          const visits: VisitRow[] = body?.success && Array.isArray(body.visits) ? body.visits : [];
          for (const visit of visits) {
            const id = visit.manhole?.id;
            if (typeof id !== 'number') continue;
            visited.add(id);
            if (visit.is_public) publicIds.add(id);
          }
          if (visits.length < VISITS_PAGE_SIZE) break;
        }
        setLoaded({
          manholes: (list?.manholes ?? []).map((m) => ({
            id: m.id,
            prefecture: m.prefecture,
            pokemons: m.pokemons,
            hashtags: Array.isArray(m.hashtags) ? m.hashtags : null,
          })),
          visited,
          publicCount: publicIds.size,
        });
      } catch {
        // 取れなければ空のバッジ欄（0枚）として出す
        setLoaded({ manholes: [], visited: new Set(), publicCount: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-content safe-area-body bg-[#efe6cf]">
      <PCShell className="pb-32 pt-4 lg:pt-6">
        <div className="max-w-2xl space-y-5">
          <VisitsSwitcher current="badges" />
          {loading || !loaded ? (
            <div className="py-10 text-center font-pixelJp text-[#6A4D36]">読み込み中<span className="rpg-loading" /></div>
          ) : (
            <MyBadgesPanel {...loaded} />
          )}
        </div>
      </PCShell>
    </div>
  );
}
