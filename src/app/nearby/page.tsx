'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  Compass,
  ExternalLink,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

interface ManholeWithDistance extends Manhole {
  distance?: number;
  visit?: {
    id: string;
    shot_at: string;
    photos: Array<{
      id: string;
      storage_key: string;
      url?: string;
    }>;
  };
}

type SearchTab = 'nearby' | 'all' | 'unvisited';

const searchTabs: Array<{ key: SearchTab; label: string }> = [
  { key: 'nearby', label: '近く' },
  { key: 'all', label: '一覧' },
  { key: 'unvisited', label: '未訪問' },
];

export default function NearbyPage() {
  const [nearbyManholes, setNearbyManholes] = useState<ManholeWithDistance[]>([]);
  const [allManholes, setAllManholes] = useState<ManholeWithDistance[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [allLoading, setAllLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [radius, setRadius] = useState(30);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('nearby');
  const [query, setQuery] = useState('');
  const { trackSearch, trackNearbyOpen, trackGeolocationEnable } = useAnalytics();
  const uploadHref = isLoggedIn ? '/upload' : '/login?redirect=/upload';

  useEffect(() => {
    document.title = 'ポケふたを探す - ポケふた訪問記録';
    trackNearbyOpen();

    const tab = new URLSearchParams(window.location.search).get('tab');
    const initialTab: SearchTab = tab === 'all' || tab === 'unvisited' ? tab : 'nearby';
    setActiveTab(initialTab);
    loadAllManholes();

    (async () => {
      let loggedIn = false;
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        loggedIn = Boolean(session?.user);
        setIsLoggedIn(loggedIn);
      } catch {
        setIsLoggedIn(false);
      } finally {
        setSessionChecked(true);
      }

      if (initialTab === 'all') {
        setLoading(false);
        return;
      }

      if (initialTab === 'unvisited' && !loggedIn) {
        setActiveTab('all');
        setLoading(false);
        return;
      }

      getCurrentLocationAndLoadManholes();
    })();
  }, []);

  useEffect(() => {
    if (sessionChecked && !isLoggedIn && activeTab === 'unvisited') {
      setActiveTab('all');
    }
  }, [activeTab, isLoggedIn, sessionChecked]);

  useEffect(() => {
    if (!sessionChecked || activeTab === 'all') return;
    if (activeTab === 'unvisited' && !isLoggedIn) return;
    if (!userLocation) return;
    loadNearbyManholes(userLocation.lat, userLocation.lng);
  }, [radius]);

  const loadAllManholes = async () => {
    try {
      setAllLoading(true);
      const manholesResponse = await fetch('/api/manholes?limit=1000');
      if (!manholesResponse.ok) {
        console.error('Failed to load all manholes');
        setAllLoading(false);
        return;
      }

      const manholesData = await manholesResponse.json();
      const manholes = manholesData.manholes || [];

      // Fetch all visits with a high limit to ensure we get all visits
      const visitsResponse = await fetch('/api/visits?limit=10000');
      const visitsByManholeId = new Map<number, any>();

      if (visitsResponse.ok) {
        const visitsData = await visitsResponse.json();
        if (visitsData.success && visitsData.visits) {
          visitsData.visits.forEach((visit: any) => {
            if (visit.manhole_id) {
              const existing = visitsByManholeId.get(visit.manhole_id);
              if (!existing || new Date(visit.shot_at) > new Date(existing.shot_at)) {
                visitsByManholeId.set(visit.manhole_id, visit);
              }
            }
          });
        }
      }

      const manholesWithVisits = manholes.map((manhole: any) => ({
        ...manhole,
        distance: undefined, // Don't show distance for "all" tab
        visit: visitsByManholeId.get(manhole.id)
      }));

      setAllManholes(manholesWithVisits);
    } catch (error) {
      console.error('Failed to load all manholes:', error);
    } finally {
      setAllLoading(false);
    }
  };

  const getCurrentLocationAndLoadManholes = () => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          trackGeolocationEnable();
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          setLocationError(null);
          loadNearbyManholes(location.lat, location.lng);
        },
        (error) => {
          console.error('Location access denied:', error);
          setLocationError('位置情報の取得に失敗しました。設定で位置情報の使用を許可してください。');
          const defaultLocation = {
            lat: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0'),
            lng: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0')
          };
          setUserLocation(defaultLocation);
          loadNearbyManholes(defaultLocation.lat, defaultLocation.lng);
        }
      );
    } else {
      setLocationError('このブラウザは位置情報をサポートしていません。');
      setLoading(false);
    }
  };

  const loadNearbyManholes = async (lat: number, lng: number) => {
    try {
      setDataError(null);
      console.log(`Loading manholes near ${lat}, ${lng} with radius ${radius}km`);

      const manholesResponse = await fetch(`/api/manholes?lat=${lat}&lng=${lng}&radius=${radius}&limit=100`);

      if (!manholesResponse.ok) {
        const errorText = await manholesResponse.text();
        console.error('Failed to load nearby manholes:', errorText);
        setDataError(`マンホールデータの取得に失敗しました: ${manholesResponse.status}`);
        setLoading(false);
        return;
      }

      const manholesData = await manholesResponse.json();
      console.log('Manholes response:', manholesData);

      const allNearbyManholes = manholesData.manholes || [];
      console.log(`Loaded ${allNearbyManholes.length} nearby manholes`);

      if (!Array.isArray(allNearbyManholes)) {
        console.error('Invalid response format:', manholesData);
        setDataError('マンホールデータの形式が不正です');
        setLoading(false);
        return;
      }

      const visitsResponse = await fetch('/api/visits');
      const visitsByManholeId = new Map<number, any>();

      if (visitsResponse.ok) {
        const visitsData = await visitsResponse.json();
        console.log('Visits data:', visitsData);
        if (visitsData.success && visitsData.visits) {
          visitsData.visits.forEach((visit: any) => {
            if (visit.manhole_id) {
              const existing = visitsByManholeId.get(visit.manhole_id);
              if (!existing || new Date(visit.shot_at) > new Date(existing.shot_at)) {
                visitsByManholeId.set(visit.manhole_id, visit);
              }
            }
          });
          console.log(`Found ${visitsByManholeId.size} visited manholes`);
        }
      }

      const manholesWithVisits = allNearbyManholes
        .map((manhole: any) => ({
          ...manhole,
          visit: visitsByManholeId.get(manhole.id)
        }))
        .slice(0, 50);

      console.log(`Setting ${manholesWithVisits.length} manholes with visit info`);
      setNearbyManholes(manholesWithVisits);
      trackSearch(`radius:${radius}km`, manholesWithVisits.length);
    } catch (error) {
      console.error('Failed to load nearby manholes:', error);
      setDataError(`データの読み込みに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setLoading(false);
    }
  };

  const formatDistance = (distance: number | undefined): string => {
    if (distance === undefined || isNaN(distance)) {
      return '-';
    }
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  const openInMaps = (manhole: ManholeWithDistance, event: React.MouseEvent) => {
    event.stopPropagation();
    const url = `https://www.google.com/maps/dir/?api=1&destination=${manhole.latitude},${manhole.longitude}`;
    window.open(url, '_blank');
  };

  const viewManholeDetail = (manhole: ManholeWithDistance) => {
    window.location.href = `/manhole/${manhole.id}`;
  };

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
    if ((tab === 'nearby' || tab === 'unvisited') && !userLocation && nearbyManholes.length === 0) {
      getCurrentLocationAndLoadManholes();
    }
  };

  const visibleSearchTabs = searchTabs.filter((tab) => isLoggedIn || tab.key !== 'unvisited');

  const filteredAllManholes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allManholes;

    return allManholes.filter((manhole) => {
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
  }, [allManholes, query]);

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC] text-[#2A2A2A]">
      <Header title="ポケふたを探す" />

      <main className="relative mx-auto max-w-6xl px-4 pb-6 pt-5 sm:pt-8">
        <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-7 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-10 sm:py-10">
          <div className="relative max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
              <Compass className="h-3.5 w-3.5" />
              旅先で探す
            </div>
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-normal sm:text-5xl">
              ポケふたを探す
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed sm:text-lg">
              現在地の近くから、全国一覧まで。次に会いに行くポケふたをここで見つけよう。
            </p>
          </div>
        </section>

        {locationError && (
          <div className="mt-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
            <p className="text-sm font-bold text-red-700">{locationError}</p>
          </div>
        )}

        {dataError && (
          <div className="mt-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
            <p className="text-sm font-bold text-red-700">{dataError}</p>
          </div>
        )}

        {userLocation && (
          <section id="nearby-controls" className="mt-5 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-4 shadow-sm sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-3">
                  <div className="text-xl font-extrabold leading-none text-[#7B63A8]">{nearbyManholes.length}</div>
                  <div className="mt-1 text-xs font-bold text-[#6B6B6B]">発見</div>
                </div>
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-3">
                  <div className="text-xl font-extrabold leading-none text-[#FF8F1F]">{radius}km</div>
                  <div className="mt-1 text-xs font-bold text-[#6B6B6B]">範囲</div>
                </div>
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-3">
                  <div className="text-xl font-extrabold leading-none text-[#2D846C]">
                    {nearbyManholes.length > 0 ? formatDistance(nearbyManholes[0].distance) : '-'}
                  </div>
                  <div className="mt-1 text-xs font-bold text-[#6B6B6B]">最寄り</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={getCurrentLocationAndLoadManholes}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-[#7B63A8] shadow-sm ring-1 ring-[#7B63A8]/15 transition hover:bg-[#FFB347]/20 lg:flex-none"
                  title="現在地を更新"
                >
                  <RefreshCw className="h-4 w-4" />
                  現在地を更新
                </button>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-[#6B6B6B]">
                <span>検索範囲</span>
                <span>1km - 100km</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#E2CFAE]"
                style={{
                  background: `linear-gradient(to right, #FFB347 0%, #FFB347 ${radius}%, #E2CFAE ${radius}%, #E2CFAE 100%)`
                }}
              />
            </div>
          </section>
        )}

        <section className="mt-5">
          <div className="-mx-4 overflow-x-auto px-4 pb-1">
            <div className="flex min-w-max gap-2 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB]/80 p-1 shadow-sm sm:min-w-0">
              {visibleSearchTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className={`min-h-[44px] rounded-[7px] px-5 text-sm font-bold transition ${
                      isActive
                        ? 'bg-[#7B63A8] text-white shadow-sm'
                        : 'text-[#2A2A2A] hover:bg-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {activeTab === 'all' && (
          <section className="mt-5 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-4 shadow-sm sm:p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7B63A8]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="地域名・ポケモン名で検索"
                  className="min-h-[44px] w-full rounded-lg border border-[#7B63A8]/15 bg-white/80 py-2 pl-10 pr-3 text-sm font-bold outline-none focus:border-[#7B63A8]"
                  placeholder="地域名・ポケモン名で検索"
                />
              </label>
              <div className="grid grid-cols-2 gap-3 sm:min-w-[15rem]">
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-3">
                  <div className="text-xl font-extrabold leading-none text-[#7B63A8]">{allManholes.length}</div>
                  <div className="mt-1 text-xs font-bold text-[#6B6B6B]">総数</div>
                </div>
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-3">
                  <div className="text-xl font-extrabold leading-none text-[#2D846C]">{filteredAllManholes.length}</div>
                  <div className="mt-1 text-xs font-bold text-[#6B6B6B]">表示中</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {(((activeTab === 'nearby' || activeTab === 'unvisited') && loading) || (activeTab === 'all' && allLoading)) && (
          <div className="flex items-center justify-center py-10">
            <div className="text-center">
              <div className="font-bold text-[#7B63A8]">
                {activeTab === 'all' ? '全ポケふたを読み込み中' : '検索中'}<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {!(((activeTab === 'nearby' || activeTab === 'unvisited') && loading) || (activeTab === 'all' && allLoading)) && (
          <section className="mt-5">
            {(() => {
              const displayManholes =
                activeTab === 'all' ? filteredAllManholes :
                activeTab === 'unvisited' ? nearbyManholes.filter(m => !m.visit) :
                nearbyManholes;

              return displayManholes.length === 0 ? (
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-10 text-center shadow-sm">
                  <MapPin className="mx-auto mb-3 h-10 w-10 text-[#7B63A8]/60" />
                  <p className="text-sm font-bold text-[#2A2A2A]">
                    {activeTab === 'unvisited'
                      ? '近くに未訪問のポケふたが見つかりませんでした'
                      : activeTab === 'all'
                      ? 'ポケふたが見つかりませんでした'
                      : '近くにポケふたが見つかりませんでした'}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#6B6B6B]">
                    {activeTab === 'nearby' && '検索範囲を広げてみてください'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {displayManholes.map((manhole) => (
                  <article
                    key={manhole.id}
                    className="cursor-pointer overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                    onClick={() => viewManholeDetail(manhole)}
                  >
                    {manhole.visit && manhole.visit.photos && manhole.visit.photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-1 bg-[#F6EEDC] p-1">
                        {manhole.visit.photos.slice(0, 3).map((photo: any) => (
                          <div
                            key={photo.id}
                            className="relative aspect-square overflow-hidden rounded-[6px] bg-white"
                          >
                            <img
                              src={photo.url || `/api/image-upload?key=${photo.storage_key}`}
                              alt="ポケふた写真"
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="line-clamp-2 text-base font-extrabold leading-snug">
                            {manhole.prefecture}
                            {manhole.municipality || manhole.city || ''}
                          </h2>
                          <div className="mt-1 text-xs font-bold text-[#6B6B6B]">
                            ポケふた #{manhole.id}
                          </div>
                        </div>
                        {activeTab !== 'all' && (
                          <div className="shrink-0 rounded-[8px] bg-white px-3 py-2 text-right shadow-sm ring-1 ring-[#7B63A8]/15">
                            <div className="text-base font-extrabold leading-none text-[#7B63A8]">
                              {manhole.distance !== undefined ? formatDistance(manhole.distance) : '-'}
                            </div>
                            <div className="mt-1 text-[10px] font-bold text-[#6B6B6B]">現在地から</div>
                          </div>
                        )}
                      </div>

                      {manhole.visit && (
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#2D846C]/10 px-3 py-1 text-xs font-bold text-[#2D846C]">
                          <Camera className="h-3.5 w-3.5" />
                          訪問済み {formatDate(manhole.visit.shot_at)}
                        </div>
                      )}

                      {manhole.pokemons && manhole.pokemons.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-1.5">
                          {manhole.pokemons.slice(0, 3).map((pokemon, index) => (
                            <span
                              key={index}
                              className="rounded-full bg-[#FFB347]/25 px-2.5 py-1 text-xs font-bold text-[#2A2A2A]"
                            >
                              {pokemon}
                            </span>
                          ))}
                          {manhole.pokemons.length > 3 && (
                            <span className="px-1 py-1 text-xs font-bold text-[#6B6B6B]">
                              +{manhole.pokemons.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      <button
                        onClick={(e) => openInMaps(manhole, e)}
                        className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
                        title="Google Mapsで経路を表示"
                      >
                        <Navigation className="h-4 w-4" />
                        経路を見る
                        <ExternalLink className="h-4 w-4" />
                      </button>

                      {manhole.visit && manhole.visit.photos && manhole.visit.photos.length > 3 && (
                        <p className="mt-2 text-center text-xs font-bold text-[#6B6B6B]">
                          +{manhole.visit.photos.length - 3} 枚
                        </p>
                      )}
                    </div>
                  </article>
                  ))}
                </div>
              );
            })()}
          </section>
        )}
      </main>

      <Link
        href={uploadHref}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#7B63A8] px-5 py-4 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(123,99,168,0.30)] transition hover:bg-[#6A5299] sm:bottom-6 sm:right-6"
      >
        <Camera className="h-5 w-5" />
        写真を投稿
      </Link>

      <BottomNav />
    </div>
  );
}
