'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import PCShell from '@/components/PCShell';
import VisitPhotoCard from '@/components/VisitPhotoCard';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

const TOTAL_MANHOLES = 470;

type JourneyVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'building' | 'title' | 'pokemons' | 'titles' | 'hashtags' | 'title_tags'> & { city?: string } | null;
  shot_at: string;
  photos: Array<{ id: string; thumbnail_url?: string }>;
};

const getMunicipality = (manhole?: JourneyVisit['manhole']) =>
  manhole?.city || manhole?.municipality || '場所未設定';

const getManholeTags = (manhole?: JourneyVisit['manhole'], max = 2): string[] => {
  if (!manhole) return [];
  const tags: string[] = [];
  const titles = Array.isArray(manhole.titles) ? manhole.titles : [];
  [...titles]
    .sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0))
    .forEach((t: any) => { if (t.label && !tags.includes(t.label)) tags.push(t.label); });
  (Array.isArray(manhole.pokemons) ? manhole.pokemons : [])
    .forEach((p) => { if (!tags.includes(p)) tags.push(p); });
  return tags.slice(0, max);
};

export default function MyTripPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [visits, setVisits] = useState<JourneyVisit[]>([]);
  const { trackView } = useAnalytics();

  useEffect(() => {
    document.title = 'マイ旅 - ポケふたマップ';
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const loggedIn = Boolean(session?.user);
        setIsLoggedIn(loggedIn);
        trackView('/my-trip', 'マイ旅', 'mytrip', loggedIn);
        if (loggedIn) await loadVisits();
      } catch {
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadVisits = async () => {
    try {
      const res = await fetch('/api/visits?limit=1000&include_manhole_tags=true');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.visits)) setVisits(data.visits);
    } catch {
      // ignore
    }
  };

  const uniqueVisitedCount = useMemo(() => {
    const ids = new Set<number>();
    visits.forEach((v) => { const id = v.manhole?.id ?? v.manhole_id; if (id) ids.add(id); });
    return ids.size;
  }, [visits]);

  const { thisMonthCount, thisYearCount } = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const yr = `${now.getFullYear()}`;
    const seenM = new Set<string>();
    const seenY = new Set<string>();
    let mc = 0, yc = 0;
    visits.forEach((v) => {
      const id = v.manhole?.id ?? v.manhole_id;
      if (!id) return;
      const d = new Date(v.shot_at);
      if (isNaN(d.getTime())) return;
      const dYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const dYr = `${d.getFullYear()}`;
      const mk = `${id}-${dYm}`, yk = `${id}-${dYr}`;
      if (dYm === ym && !seenM.has(mk)) { mc++; seenM.add(mk); }
      if (dYr === yr && !seenY.has(yk)) { yc++; seenY.add(yk); }
    });
    return { thisMonthCount: mc, thisYearCount: yc };
  }, [visits]);

  // Dedup by manholeId × date, then group by month
  const visitsByMonth = useMemo(() => {
    const seen = new Set<string>();
    const groups = new Map<string, JourneyVisit[]>();
    const sorted = [...visits].sort(
      (a, b) => new Date(b.shot_at).getTime() - new Date(a.shot_at).getTime()
    );
    for (const visit of sorted) {
      const manholeId = visit.manhole?.id ?? visit.manhole_id;
      if (!manholeId) continue;
      const d = new Date(visit.shot_at);
      if (isNaN(d.getTime())) continue;
      const key = `${manholeId}-${d.toDateString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const monthKey = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      const group = groups.get(monthKey);
      if (group) group.push(visit);
      else groups.set(monthKey, [visit]);
    }
    return Array.from(groups.entries()).map(([label, vs]) => ({ label, visits: vs }));
  }, [visits]);

  const completionRate = (uniqueVisitedCount / TOTAL_MANHOLES) * 100;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efe6cf]">
        <div className="font-pixelJp text-[#6A4D36]">読み込み中<span className="rpg-loading" /></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    router.replace('/login?redirect=/my-trip');
    return null;
  }

  return (
    <div className="min-h-screen safe-area-inset bg-[#efe6cf]">
      <div className="lg:hidden">
        <Header title="マイ旅" />
      </div>

      <PCShell active="mytrip" className="pb-32 pt-4 lg:pt-6">
        <div className="space-y-6 max-w-2xl lg:max-w-none">

          {/* Slim PhotoDex header */}
          <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm">
            <p
              style={{ fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#c47e0f', marginBottom: 6, textTransform: 'uppercase' as const }}
            >
              PHOTO DEX
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1">
                <span style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 800, fontSize: 26, color: '#2c2a26', lineHeight: 1 }}>
                  {uniqueVisitedCount}
                </span>
                <span style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 600, fontSize: 14, color: '#9b917e' }}>
                  / {TOTAL_MANHOLES}
                </span>
              </div>
              <div className="text-right">
                {thisMonthCount > 0 && (
                  <div className="flex items-baseline gap-1">
                    <span style={{ fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', fontSize: 11, color: '#9b917e' }}>今月</span>
                    <span style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 800, fontSize: 20, color: '#bf5640' }}>+{thisMonthCount}</span>
                  </div>
                )}
                {thisYearCount > 0 && (
                  <p style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 11, color: '#9b917e' }}>今年 {thisYearCount}件</p>
                )}
              </div>
            </div>

            <div className="mt-2 h-[9px] overflow-hidden rounded-full bg-[#e9dfc7]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(completionRate, 100)}%`, background: 'linear-gradient(90deg,#e2a015,#bf5640)' }}
              />
            </div>

            <p
              className="mt-2 pt-2 border-t border-[#e9dfc7]"
              style={{ fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', fontSize: 11, color: '#9b917e' }}
            >
              達成率 全国 {uniqueVisitedCount}/{TOTAL_MANHOLES} ({completionRate.toFixed(0)}%)
            </p>
          </div>

          {/* Monthly diary */}
          {visitsByMonth.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-pixelJp text-sm text-[#8C6A4A]">まだ訪問記録がありません</p>
              <p className="mt-2 font-pixelJp text-xs text-[#8C6A4A]/70">
                近くのポケふたを探して最初の記録をしよう
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {visitsByMonth.map(({ label, visits: monthVisits }) => (
                <div key={label}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-pixelJp text-sm font-bold text-[#4F3828]" style={{ whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span className="rounded-full bg-[#e9dfc7] px-2 py-0.5 font-pixelJp text-xs text-[#6A4D36]">
                      {monthVisits.length}件
                    </span>
                    <hr className="flex-1 border-[#e9dfc7]" />
                  </div>
                  <div className="grid grid-cols-2 gap-[14px]">
                    {monthVisits.map((visit) => {
                      const manholeId = visit.manhole?.id ?? visit.manhole_id;
                      if (!manholeId) return null;
                      const municipality = getMunicipality(visit.manhole);
                      const title = `${visit.manhole?.prefecture ?? ''}${municipality}のポケふた`;
                      const d = new Date(visit.shot_at);
                      const dateStr = isNaN(d.getTime()) ? '' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                      return (
                        <VisitPhotoCard
                          key={`${manholeId}-${visit.shot_at}`}
                          manholeId={manholeId}
                          thumbnailUrl={visit.photos?.[0]?.thumbnail_url}
                          title={title}
                          date={dateStr}
                          tags={getManholeTags(visit.manhole, 2)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </PCShell>

      <BottomNav />
    </div>
  );
}
