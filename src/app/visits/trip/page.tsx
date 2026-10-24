'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PCShell from '@/components/PCShell';
import ProfileCard from '@/components/users/ProfileCard';
import TripDiary from '@/components/visits/TripDiary';
import VisitsSwitcher from '@/components/visits/VisitsSwitcher';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { pageTitle } from '@/lib/constants';

// スタンプ帳の「旅の記録」。以前の マイ旅（/my-trip、今は 308 でここへ転送）。
// コレクション（/visits）と違って未ログインの紹介画面は持たず、旧マイ旅と同じくログインへ送る。
export default function VisitsTripPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { trackView } = useAnalytics();

  useEffect(() => {
    document.title = pageTitle('旅の記録');
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const loggedIn = Boolean(session?.user);
        setIsLoggedIn(loggedIn);
        trackView('/visits/trip', '旅の記録', 'visits_trip', loggedIn);
        if (!loggedIn) router.replace('/login?redirect=/visits/trip');
      } catch {
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-content items-center justify-center bg-[#efe6cf]">
        <div className="font-pixelJp text-[#6A4D36]">読み込み中<span className="rpg-loading" /></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="min-h-content safe-area-body bg-[#efe6cf]">
      <PCShell className="pb-32 pt-4 lg:pt-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* 共有ボタンは出さない（旧マイ旅も無し）。ここで公開設定を変えても ProfileCard の共有件数は
              取り直されず、古い件数で共有してしまう。共有はコレクション（/visits）から */}
          <ProfileCard />
          <VisitsSwitcher current="trip" />
          <TripDiary />
        </div>
      </PCShell>
    </div>
  );
}
