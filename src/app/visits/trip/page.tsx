'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import PCShell from '@/components/PCShell';
import ProfileCard from '@/components/users/ProfileCard';
import TripActivity from '@/components/visits/TripActivity';
import TripDiary, { type JourneyVisit } from '@/components/visits/TripDiary';
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
  // 訪問一覧はここで1回だけ取り、月別一覧（TripDiary）と月ごとの活動（TripActivity）に渡す
  const [visits, setVisits] = useState<JourneyVisit[]>([]);
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
        if (!loggedIn) {
          router.replace('/login?redirect=/visits/trip');
          return;
        }
        try {
          const res = await fetch('/api/visits?limit=1000&include_manhole_tags=true');
          const data = res.ok ? await res.json() : null;
          if (data?.success && Array.isArray(data.visits)) setVisits(data.visits);
        } catch {
          // 取れなければ「まだ訪問記録がありません」になる（旧マイ旅と同じ）
        }
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

  // PC は コレクション（/visits）と同じ「本文＋右レール360px」。切り替えで幅と位置が跳ばないように揃える
  // （以前は中央の max-w-2xl 1列で、PC だとコレクションと見た目が別物になっていた）。
  // PCShell の rail はスマホで本文より上に出るので使わず、スマホでは活動を一覧のすぐ上に置く
  return (
    <div className="min-h-content safe-area-body bg-[#efe6cf]">
      <PCShell className="pb-32 pt-4 lg:pt-6">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-[28px]">
          <div className="min-w-0 max-w-2xl space-y-5 lg:max-w-none">
            {/* 共有ボタンは出さない（旧マイ旅も無し）。ここで公開設定を変えても ProfileCard の共有件数は
                取り直されず、古い件数で共有してしまう。共有はコレクション（/visits）から */}
            {/* タブはスマホで一番上（スタンプ / 旅の記録 / バッジ） */}
            <VisitsSwitcher current="trip" />
            <ProfileCard />
            <TripActivity visits={visits} className="lg:hidden" />
            <TripDiary initialVisits={visits} />
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-[20px] flex flex-col gap-[14px]">
              <TripActivity visits={visits} />
              <Link href="/nearby" className="flex items-center justify-center gap-2 rounded-[14px] bg-[#bf5640] px-4 py-3 font-pixelJp text-sm font-bold text-white shadow-sm">
                <Camera className="h-4 w-4" />
                近くのポケふたを撮りに行く
              </Link>
            </div>
          </div>
        </div>
      </PCShell>
    </div>
  );
}
