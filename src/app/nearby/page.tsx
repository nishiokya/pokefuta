'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  CircleDot,
  Compass,
  ExternalLink,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Stamp,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import PCShell from '@/components/PCShell';
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

  const NUM = '"Outfit", system-ui, sans-serif';
  const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

  const displayManholes = activeTab === 'nearby' || activeTab === 'unvisited'
    ? nearbyManholes
    : filteredAllManholes;
  const nearestDistance = nearbyManholes[0]?.distance;

  const authNearbyRail = (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm">
        <p style={{ fontFamily: ROUND, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#c47e0f', textTransform: 'uppercase' as const, marginBottom: 10 }}>
          {activeTab === 'nearby' ? '近くのポケふた' : activeTab === 'unvisited' ? '未訪問' : '一覧'}
        </p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-[#e9dfc7]">
          {([
            ['発見', displayManholes.length, '#2c2a26'],
            activeTab === 'nearby' || activeTab === 'unvisited'
              ? ['範囲', `${radius}km`, '#6f6657']
              : ['総数', allManholes.length, '#6f6657'],
          ] as [string, string | number, string][]).map(([label, value, color]) => (
            <div key={label} className="bg-[#fffdf7] px-3 py-2.5 text-center">
              <p style={{ fontFamily: ROUND, fontSize: 10, color: '#9b917e', fontWeight: 700 }}>{label}</p>
              <p style={{ fontFamily: NUM, fontWeight: 800, fontSize: 20, color }}>{value}</p>
            </div>
          ))}
        </div>
        {(activeTab === 'nearby' || activeTab === 'unvisited') && nearestDistance !== undefined && (
          <p style={{ fontFamily: ROUND, fontSize: 11, color: '#9b917e', marginTop: 8 }}>
            最寄り {nearestDistance < 1 ? `${Math.round(nearestDistance * 1000)}m` : `${nearestDistance.toFixed(1)}km`}
          </p>
        )}
        {activeTab === 'all' && query && (
          <p style={{ fontFamily: ROUND, fontSize: 11, color: '#9b917e', marginTop: 8 }}>
            「{query}」で絞り込み中
          </p>
        )}
      </div>
      <Link
        href={uploadHref}
        className="flex items-center justify-center gap-2 rounded-[12px] bg-[#bf5640] px-4 py-3 font-pixelJp text-sm font-bold text-white shadow-sm"
      >
        <Camera className="h-4 w-4" />
        写真を投稿する
      </Link>
    </div>
  );

  const guestNearbyRail = (
    <div className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm space-y-3">
      <p className="font-bold text-sm text-[#7B63A8]">無料でポケふたスタンプ帳を作れます</p>
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs text-[#6B6B6B]">
        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#B5483C]" />行ったポケふたを記録</span>
        <span className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5 text-[#B5483C]" />写真で思い出を保存</span>
        <span className="flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5 text-[#B5483C]" />都道府県の達成状況</span>
        <span className="flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-[#B5483C]" />近くの未訪問を探せる</span>
      </div>
      <Link
        href="/login"
        className="flex items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-3 text-sm font-bold text-white shadow-[0_2px_0_#5f55b8] transition hover:bg-[#6A5299]"
      >
        <Stamp className="h-4 w-4" />
        スタンプ帳をはじめる
      </Link>
      <Link
        href="/nearby"
        className="flex items-center justify-center gap-2 rounded-lg border border-[#7B63A8]/30 bg-white px-4 py-2 text-sm font-bold text-[#7B63A8]"
      >
        <MapPin className="h-4 w-4" />
        近くのポケふたを見る
      </Link>
      <p className="text-right text-[11px] text-[#9B9B9B]">地図で探す → data.pokefuta.com</p>
    </div>
  );

  const nearbyRail = sessionChecked ? (isLoggedIn ? authNearbyRail : guestNearbyRail) : undefined;

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#efe6cf] text-[#2A2A2A]">
      <div className="lg:hidden">
        <Header title="ポケふたを探す" />
      </div>

      <PCShell active="search" className="pb-32 pt-3 lg:pt-6" rail={nearbyRail}>
      <main className="relative px-0 lg:px-0">
        <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-4 py-4 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-10 sm:py-10">
          <div className="relative max-w-3xl">
            {sessionChecked && !isLoggedIn ? (
              <>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-2.5 py-1 text-[11px] font-bold text-[#7B63A8] sm:mb-4 sm:px-3 sm:text-xs">
                  <Stamp className="h-3 w-3" />
                  ポケふたスタンプ帳
                </div>
                <h1 className="max-w-2xl text-2xl font-extrabold leading-tight tracking-normal sm:text-4xl">
                  ポケふた巡りを、あなただけのスタンプ帳に。
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-[#4A4A4A] sm:mt-3 sm:text-base">
                  旅先で見つけたポケふたを写真と一緒に記録。訪問済みの場所やみんなの投稿写真を見ながら、ポケふた巡りを楽しく残しましょう。
                </p>
                <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_#5f55b8] transition hover:bg-[#6A5299]"
                  >
                    <Stamp className="h-4 w-4" />
                    スタンプ帳をはじめる
                  </Link>
                  <Link
                    href="/nearby"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#7B63A8]/30 bg-white/80 px-4 py-2.5 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-white"
                  >
                    <MapPin className="h-4 w-4" />
                    近くのポケふたを見る
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-2.5 py-1 text-[11px] font-bold text-[#7B63A8] sm:mb-4 sm:px-3 sm:text-xs">
                  <Compass className="h-3.5 w-3.5" />
                  旅先で探す
                </div>
                <h1 className="max-w-2xl text-2xl font-extrabold leading-tight tracking-normal sm:text-5xl">
                  ポケふたを探す
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-snug sm:mt-4 sm:text-lg sm:leading-relaxed">
                  現在地の近くから、全国一覧まで。次に会いに行くポケふたをここで見つけよう。
                </p>
              </>
            )}
          </div>
        </section>

        {sessionChecked && !isLoggedIn && (
          <div className="mt-4 lg:hidden rounded-[8px] border border-[#7B63A8]/10 bg-white/70 px-4 py-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="font-bold text-sm text-[#7B63A8]">無料でポケふたスタンプ帳を作れます</p>
              <Link
                href="/login"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#7B63A8] px-3 py-2 text-xs font-bold text-white shadow-[0_2px_0_#5f55b8] transition hover:bg-[#6A5299]"
              >
                <Stamp className="h-3 w-3" />
                無料ではじめる
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[#6B6B6B]">
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#B5483C]" />行ったポケふたを記録</span>
              <span className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5 text-[#B5483C]" />写真で思い出を保存</span>
              <span className="flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5 text-[#B5483C]" />都道府県の達成状況</span>
              <span className="flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-[#B5483C]" />近くの未訪問を探せる</span>
            </div>
            <p className="text-right text-[11px] text-[#9B9B9B]">地図で探す → data.pokefuta.com</p>
          </div>
        )}

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
          <section id="nearby-controls" className="mt-3 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-3 shadow-sm sm:mt-5 sm:p-5">
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-2.5 sm:p-3">
                  <div className="text-lg font-extrabold leading-none text-[#7B63A8] sm:text-xl">{nearbyManholes.length}</div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#6B6B6B] sm:mt-1 sm:text-xs">発見</div>
                </div>
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-2.5 sm:p-3">
                  <div className="text-lg font-extrabold leading-none text-[#FF8F1F] sm:text-xl">{radius}km</div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#6B6B6B] sm:mt-1 sm:text-xs">範囲</div>
                </div>
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-2.5 sm:p-3">
                  <div className="text-lg font-extrabold leading-none text-[#2D846C] sm:text-xl">
                    {nearbyManholes.length > 0 ? formatDistance(nearbyManholes[0].distance) : '-'}
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#6B6B6B] sm:mt-1 sm:text-xs">最寄り</div>
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0 text-xs font-bold text-[#6B6B6B]">
                  <span>検索範囲</span>
                  <span className="ml-2 text-[#9B8D78]">1km - 100km</span>
                </div>
                <button
                  onClick={getCurrentLocationAndLoadManholes}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-[#7B63A8] shadow-sm ring-1 ring-[#7B63A8]/15 transition hover:bg-[#FFB347]/20 sm:gap-2 sm:px-4 sm:text-sm"
                  title="現在地を更新"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="sm:hidden">更新</span>
                  <span className="hidden sm:inline">現在地を更新</span>
                </button>
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

        <section className="mt-3 sm:mt-5">
          <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4">
            <div className="flex min-w-max gap-1.5 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB]/80 p-0.5 shadow-sm sm:min-w-0 sm:gap-2 sm:p-1">
              {visibleSearchTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className={`min-h-[44px] rounded-[7px] px-4 text-sm font-bold transition sm:px-5 ${
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
          <section className="mt-3 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-3 shadow-sm sm:mt-5 sm:p-5">
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
          <div className="flex items-center justify-center py-7 sm:py-10">
            <div className="text-center">
              <div className="font-bold text-[#7B63A8]">
                {activeTab === 'all' ? '全ポケふたを読み込み中' : '検索中'}<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {!(((activeTab === 'nearby' || activeTab === 'unvisited') && loading) || (activeTab === 'all' && allLoading)) && (
          <section className="mt-3 sm:mt-5">
            {(() => {
              const displayManholes =
                activeTab === 'all' ? filteredAllManholes :
                activeTab === 'unvisited' ? nearbyManholes.filter(m => !m.visit) :
                nearbyManholes;

              return displayManholes.length === 0 ? (
                <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-4 py-7 text-center shadow-sm sm:px-5 sm:py-10">
                  <MapPin className="mx-auto mb-2 h-9 w-9 text-[#7B63A8]/60 sm:mb-3 sm:h-10 sm:w-10" />
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
                <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {displayManholes.map((manhole) => (
                  <article
                    key={manhole.id}
                    className="cursor-pointer overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                    onClick={() => viewManholeDetail(manhole)}
                  >
                    <div className="bg-[#F6EEDC] p-1">
                      {manhole.visit?.photos && manhole.visit.photos.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1">
                          {manhole.visit.photos.slice(0, 3).map((photo: any) => (
                            <div
                              key={photo.id}
                              className="relative aspect-[4/3] overflow-hidden rounded-[6px] bg-white"
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
                      ) : (
                        <div className="flex aspect-[4/1] items-center justify-center rounded-[6px] bg-[#E9DEC9] sm:aspect-[3/1]">
                          <div className="flex flex-col items-center text-[#B8AB96]">
                            <CircleDot className="h-6 w-6 sm:h-8 sm:w-8" />
                            <p className="mt-1 font-pixel text-[9px] leading-none">POKEFUTA</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-3 sm:p-4">
                      <div className="mb-2 flex items-start justify-between gap-2 sm:mb-3 sm:gap-3">
                        <div className="min-w-0">
                          <h2 className="line-clamp-2 text-base font-extrabold leading-snug">
                            {manhole.prefecture}
                            {manhole.municipality || manhole.city || ''}{(manhole.municipality || manhole.city) && manhole.building && `・${manhole.building}`}
                          </h2>
                          <div className="mt-1 text-xs font-bold text-[#6B6B6B]">
                            ポケふた #{manhole.id}
                          </div>
                        </div>
                        {activeTab !== 'all' && (
                          <div className="shrink-0 rounded-[8px] bg-white px-2.5 py-1.5 text-right shadow-sm ring-1 ring-[#7B63A8]/15 sm:px-3 sm:py-2">
                            <div className="text-sm font-extrabold leading-none text-[#7B63A8] sm:text-base">
                              {manhole.distance !== undefined ? formatDistance(manhole.distance) : '-'}
                            </div>
                            <div className="mt-1 text-[10px] font-bold text-[#6B6B6B]">現在地から</div>
                          </div>
                        )}
                      </div>

                      {manhole.visit && (
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#2D846C]/10 px-3 py-1 text-xs font-bold text-[#2D846C] sm:mb-3">
                          <Camera className="h-3.5 w-3.5" />
                          訪問済み {formatDate(manhole.visit.shot_at)}
                        </div>
                      )}

                      {manhole.pokemons && manhole.pokemons.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1.5 sm:mb-4">
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
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
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

      </PCShell>

      <Link
        href={uploadHref}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-3 z-40 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#7B63A8] px-4 py-3 text-xs font-extrabold text-white shadow-[0_8px_18px_rgba(123,99,168,0.30)] transition hover:bg-[#6A5299] sm:bottom-6 sm:right-6 sm:gap-2 sm:px-5 sm:py-4 sm:text-sm"
      >
        <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
        写真を投稿
      </Link>

      <BottomNav />
    </div>
  );
}
