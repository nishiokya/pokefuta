'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, MapPin, Search } from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

export default function ManholesPage() {
  const [manholes, setManholes] = useState<Manhole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [query, setQuery] = useState('');
  const { trackPrefectureOpen } = useAnalytics();
  const lastTrackedPrefecture = useRef<string | null>(null);

  useEffect(() => {
    document.title = 'ポケふた一覧 - ポケふた訪問記録';

    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setIsLoggedIn(Boolean(session?.user));
      } catch {
        setIsLoggedIn(false);
      }
    })();

    loadManholes();
  }, []);

  const loadManholes = async () => {
    try {
      const response = await fetch('/api/manholes');
      if (!response.ok) return;
      const data = await response.json();
      const list = Array.isArray(data?.manholes) ? data.manholes : Array.isArray(data) ? data : [];
      setManholes(list);
    } catch (error) {
      console.error('Failed to load manholes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredManholes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return manholes;

    return manholes.filter((manhole) => {
      const target = [
        manhole.title,
        manhole.prefecture,
        manhole.municipality,
        manhole.city,
        ...(manhole.pokemons || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return target.includes(normalized);
    });
  }, [manholes, query]);

  // クエリが都道府県に絞り込まれた場合にトラッキング
  useEffect(() => {
    if (filteredManholes.length === 0 || !query.trim()) return;
    const prefectures = new Set(filteredManholes.map((m) => m.prefecture).filter(Boolean));
    if (prefectures.size === 1) {
      const prefecture = [...prefectures][0] as string;
      if (prefecture !== lastTrackedPrefecture.current) {
        lastTrackedPrefecture.current = prefecture;
        trackPrefectureOpen({ prefecture });
      }
    }
  }, [filteredManholes, query]);

  const uploadHref = isLoggedIn ? '/upload' : '/login?redirect=/upload';
  const prefectureCount = new Set(manholes.map((manhole) => manhole.prefecture).filter(Boolean)).size;

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC] text-[#2A2A2A]">
      <main className="mx-auto max-w-6xl px-4 pb-6 pt-5 sm:pt-8">
        <section className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-7 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-10 sm:py-10">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
              <MapPin className="h-3.5 w-3.5" />
              都道府県から探す
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-normal sm:text-5xl">
              ポケふた一覧
            </h1>
            <p className="mt-4 text-base font-medium leading-relaxed sm:text-lg">
              地域や登場ポケモンから、旅先で見たいポケふたを探そう。
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7B63A8]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-[#7B63A8]/15 bg-white/80 py-2 pl-10 pr-3 text-sm font-bold outline-none focus:border-[#7B63A8]"
                placeholder="地域名・ポケモン名で検索"
              />
            </label>
            <Link
              href={uploadHref}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
            >
              <Camera className="h-4 w-4" />
              写真を投稿
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-3">
              <div className="text-xl font-extrabold leading-none text-[#7B63A8]">{manholes.length}</div>
              <div className="mt-1 text-xs font-bold text-[#6B6B6B]">総数</div>
            </div>
            <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-3">
              <div className="text-xl font-extrabold leading-none text-[#FF8F1F]">{prefectureCount}</div>
              <div className="mt-1 text-xs font-bold text-[#6B6B6B]">都道府県</div>
            </div>
            <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-3">
              <div className="text-xl font-extrabold leading-none text-[#2D846C]">{filteredManholes.length}</div>
              <div className="mt-1 text-xs font-bold text-[#6B6B6B]">表示中</div>
            </div>
          </div>
        </section>

        <section className="mt-5">
          {loading ? (
            <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-10 text-center font-bold text-[#7B63A8] shadow-sm">
              読み込み中<span className="rpg-loading"></span>
            </div>
          ) : filteredManholes.length === 0 ? (
            <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-10 text-center shadow-sm">
              <p className="text-sm font-bold text-[#6B6B6B]">該当するポケふたがありません</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredManholes.map((manhole) => (
                <Link
                  key={manhole.id}
                  href={`/manhole/${manhole.id}`}
                  className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 text-base font-extrabold leading-snug">
                        {manhole.title || `${manhole.prefecture || ''}${manhole.municipality || manhole.city || ''}`}
                      </h2>
                      <p className="mt-1 text-xs font-bold text-[#6B6B6B]">
                        {manhole.prefecture} {manhole.municipality || manhole.city || ''}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-[8px] bg-white px-3 py-2 text-sm font-extrabold text-[#7B63A8] shadow-sm ring-1 ring-[#7B63A8]/15">
                      #{manhole.id}
                    </span>
                  </div>

                  {manhole.pokemons && manhole.pokemons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {manhole.pokemons.slice(0, 4).map((pokemon, index) => (
                        <span
                          key={`${manhole.id}-${pokemon}-${index}`}
                          className="rounded-full bg-[#FFB347]/25 px-2.5 py-1 text-xs font-bold text-[#2A2A2A]"
                        >
                          {pokemon}
                        </span>
                      ))}
                      {manhole.pokemons.length > 4 && (
                        <span className="px-1 py-1 text-xs font-bold text-[#6B6B6B]">
                          +{manhole.pokemons.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
