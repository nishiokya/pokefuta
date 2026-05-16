'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Camera,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  Compass,
  Heart,
  MapPin,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  Stamp,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateJa } from '@/lib/date';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

type FeedVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'title' | 'pokemons'> | null;
  shot_at: string;
  created_at: string;
  shot_location?: string | null;
  photos: Array<{
    id: string;
    thumbnail_url?: string;
  }>;
  likes_count: number;
  comments_count: number;
};

type GalleryTab = 'latest';
type JourneyTab = 'unvisited' | 'nearby' | 'continue';

type JourneyVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'title' | 'pokemons'> | null;
  shot_at: string;
  photos: Array<{ id: string; thumbnail_url?: string }>;
};

type JourneyManhole = Manhole & {
  name?: string;
  city?: string;
  distance?: number;
  is_visited?: boolean;
  last_visit?: string | null;
};

type PrefectureProgress = {
  name: string;
  total: number;
  visited: number;
  remaining: number;
  rate: number;
};

const galleryTabs: Array<{ key: GalleryTab | 'prefectures'; label: string; mobileLabel: string }> = [
  { key: 'latest', label: '最新', mobileLabel: '最新' },
  { key: 'prefectures', label: '都道府県から探す', mobileLabel: '探す' },
];

const journeyTabs: Array<{ key: JourneyTab; label: string }> = [
  { key: 'unvisited', label: '未訪問' },
  { key: 'nearby', label: '近く' },
  { key: 'continue', label: '続き' },
];

const getDisplayName = (session: any) => {
  const metadataName = session?.user?.user_metadata?.display_name;
  const emailName = session?.user?.email?.split('@')[0];
  return metadataName || emailName || 'タコさん';
};

const getMunicipality = (manhole?: Pick<Manhole, 'municipality'> & { city?: string }) =>
  manhole?.city || manhole?.municipality || '場所未設定';

const getManholeTitle = (manhole?: Pick<Manhole, 'title' | 'municipality'> & { name?: string; city?: string }) =>
  manhole?.name || manhole?.title || getMunicipality(manhole);

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('タコさん');
  const [loading, setLoading] = useState(true);
  const [totalManholes, setTotalManholes] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [feed, setFeed] = useState<FeedVisit[]>([]);
  const [journeyVisits, setJourneyVisits] = useState<JourneyVisit[]>([]);
  const [journeyManholes, setJourneyManholes] = useState<JourneyManhole[]>([]);
  const [nearbyUnvisited, setNearbyUnvisited] = useState<JourneyManhole[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const [manholesWithPhotos, setManholesWithPhotos] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<GalleryTab>('latest');
  const [journeyTab, setJourneyTab] = useState<JourneyTab>('unvisited');
  const feedPerPage = 24;
  const { trackView } = useAnalytics();

  useEffect(() => {
    // ページタイトル設定
    document.title = 'ポケふた写真館 - ポケふた訪問記録';

    // ✅ GA: ページビュー追跡
    trackView('/', 'ホーム', 'home');

    // ログイン状態はSupabase sessionで判定（APIは常に公開フィードを使う）
    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const loggedIn = Boolean(session?.user);
        setIsLoggedIn(loggedIn);
        if (loggedIn) {
          setUserName(getDisplayName(session));
          // ログイン済みユーザーの場合、loadingをfalseに設定
          setLoading(false);
          loadJourney();
        }
        // 未ログインユーザーの場合はloadFeed()でloadingがfalseになる
      } catch (error) {
        console.error('Session check error:', error);
        setIsLoggedIn(false);
        // エラー時もloadingをfalseに
        setLoading(false);
      }
    })();

    loadSiteStats();
  }, []);

  useEffect(() => {
    loadFeed();
  }, [currentPage]);

  const loadFeed = async () => {
    try {
      const offset = (currentPage - 1) * feedPerPage;
      const response = await fetch(
        `/api/visits?with_photos=true&limit=${feedPerPage}&offset=${offset}&order_by=created_at`,
        { credentials: 'omit' }
      );
      if (!response.ok) throw new Error('Failed to load feed');
      const data = await response.json();
      if (!data?.success) throw new Error('Feed response was not success');

      const visits: FeedVisit[] = Array.isArray(data.visits) ? data.visits : [];
      setFeed(visits);
    } catch (error) {
      console.error('Failed to load feed:', error);
      setFeed([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSiteStats = async () => {
    try {
      const response = await fetch('/api/site-stats');
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.success) return;
      // トップからユーザ数は基本的に外す（必要なら後で小さく出す）
      setTotalUsers(typeof data.users === 'number' ? data.users : null);
      setTotalPosts(typeof data.posts === 'number' ? data.posts : null);
      if (typeof data.manholes === 'number') setTotalManholes(data.manholes);
      setManholesWithPhotos(
        typeof data.manholes_with_photos === 'number' ? data.manholes_with_photos : null
      );
    } catch {
      // ignore
    }
  };

  const loadJourney = async () => {
    try {
      const [visitsResponse, manholesResponse] = await Promise.all([
        fetch('/api/visits?limit=1000'),
        fetch('/api/manholes?limit=1000'),
      ]);

      if (visitsResponse.ok) {
        const data = await visitsResponse.json();
        setJourneyVisits(Array.isArray(data.visits) ? data.visits : []);
      }

      if (manholesResponse.ok) {
        const data = await manholesResponse.json();
        const manholes: JourneyManhole[] = Array.isArray(data.manholes)
          ? data.manholes.map((manhole: any) => ({
              ...manhole,
              name: manhole.name || manhole.title,
              city: manhole.city || manhole.municipality,
            }))
          : [];
        setJourneyManholes(manholes);
        if (typeof data.total === 'number') setTotalManholes(data.total);
      }
    } catch (error) {
      console.error('Failed to load journey:', error);
    }
  };

  const loadNearbyUnvisited = async () => {
    if (!navigator.geolocation) {
      setNearbyStatus('unavailable');
      return;
    }

    setNearbyStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `/api/manholes?lat=${latitude}&lng=${longitude}&radius=30&visited=false&limit=3`
          );
          if (!response.ok) return;
          const data = await response.json();
          setNearbyUnvisited(Array.isArray(data.manholes) ? data.manholes : []);
          setNearbyStatus('ready');
        } catch (error) {
          console.error('Failed to load nearby unvisited:', error);
          setNearbyStatus('unavailable');
        }
      },
      () => setNearbyStatus('unavailable'),
      { maximumAge: 1000 * 60 * 10, timeout: 6000 }
    );
  };

  const sortedFeed = [...feed].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const visibleFeed =
    sortedFeed.length > 1 && sortedFeed.length % 2 === 1 ? sortedFeed.slice(0, -1) : sortedFeed;
  const listedCountLabel = totalPosts && totalPosts > 0 ? `${totalPosts}枚以上` : '集計中';
  const totalFeedCount = totalPosts && totalPosts > 0 ? totalPosts : null;
  const totalPages = totalFeedCount ? Math.max(1, Math.ceil(totalFeedCount / feedPerPage)) : null;
  const canGoNext = totalPages ? currentPage < totalPages : feed.length === feedPerPage;
  const showPagination = totalPages ? totalPages > 1 : currentPage > 1 || feed.length === feedPerPage;
  const uploadHref = isLoggedIn ? '/upload' : '/login?redirect=/upload';
  const knownTotalManholes = totalManholes > 0 ? totalManholes : null;

  const journeyData = useMemo(() => {
    const visitsByManholeId = new Map<number, JourneyVisit[]>();
    journeyVisits.forEach((visit) => {
      const manholeId = visit.manhole?.id ?? visit.manhole_id;
      if (!manholeId) return;
      const current = visitsByManholeId.get(manholeId) || [];
      current.push(visit);
      visitsByManholeId.set(manholeId, current);
    });

    const journeyManholesById = new Map(journeyManholes.map((manhole) => [manhole.id, manhole]));

    journeyVisits.forEach((visit) => {
      const manhole = visit.manhole;
      const manholeId = manhole?.id ?? visit.manhole_id;
      if (!manholeId || journeyManholesById.has(manholeId) || !manhole) return;
      journeyManholesById.set(manholeId, {
        id: manholeId,
        title: manhole.title || 'ポケふた',
        prefecture: manhole.prefecture || '',
        municipality: manhole.municipality || null,
        location: '',
        pokemons: manhole.pokemons || [],
        name: manhole.title || 'ポケふた',
        city: manhole.municipality || '',
        prefecture_id: null,
        prefecture_code: null,
        address: '',
        detail_url: null,
        prefecture_site_url: null,
        region: null,
        is_active: true,
        last_verified_at: '',
        data_source: null,
        created_at: '',
        updated_at: '',
      });
    });

    const allJourneyManholes = Array.from(journeyManholesById.values());
    const unvisitedManholes = allJourneyManholes
      .filter((manhole) => !visitsByManholeId.has(manhole.id))
      .sort((a, b) => `${a.prefecture}${getMunicipality(a)}${a.id}`.localeCompare(`${b.prefecture}${getMunicipality(b)}${b.id}`, 'ja'));

    const prefectureProgress: PrefectureProgress[] = Array.from(
      allJourneyManholes.reduce((map, manhole) => {
        const name = manhole.prefecture || '都道府県未設定';
        const current = map.get(name) || { totalIds: new Set<number>(), visitedIds: new Set<number>() };
        current.totalIds.add(manhole.id);
        if (visitsByManholeId.has(manhole.id)) current.visitedIds.add(manhole.id);
        map.set(name, current);
        return map;
      }, new Map<string, { totalIds: Set<number>; visitedIds: Set<number> }>())
    )
      .map(([name, value]) => {
        const total = value.totalIds.size;
        const visited = value.visitedIds.size;
        return {
          name,
          total,
          visited,
          remaining: Math.max(total - visited, 0),
          rate: total > 0 ? (visited / total) * 100 : 0,
        };
      })
      .sort((a, b) => {
        const aNearComplete = a.remaining > 0 ? a.remaining : 999;
        const bNearComplete = b.remaining > 0 ? b.remaining : 999;
        if (aNearComplete !== bNearComplete) return aNearComplete - bNearComplete;
        if (b.visited !== a.visited) return b.visited - a.visited;
        return a.name.localeCompare(b.name, 'ja');
      });

    const continuedManholes = allJourneyManholes
      .filter((manhole) => visitsByManholeId.has(manhole.id))
      .sort((a, b) => {
        const aVisit = visitsByManholeId.get(a.id)?.[0];
        const bVisit = visitsByManholeId.get(b.id)?.[0];
        return new Date(bVisit?.shot_at || 0).getTime() - new Date(aVisit?.shot_at || 0).getTime();
      });

    const collectionManholes =
      journeyTab === 'nearby'
        ? (nearbyUnvisited.length > 0 ? nearbyUnvisited : unvisitedManholes.slice(0, 6))
        : journeyTab === 'continue'
          ? [...continuedManholes.slice(0, 6), ...unvisitedManholes.slice(0, Math.max(0, 6 - continuedManholes.length))]
          : unvisitedManholes.slice(0, 6);

    return {
      visitsByManholeId,
      visitedCount: visitsByManholeId.size,
      unvisitedManholes,
      prefectureProgress,
      leadingPrefectures: prefectureProgress.filter((prefecture) => prefecture.visited > 0).slice(0, 3),
      nextPrefecture: prefectureProgress.find((prefecture) => prefecture.visited > 0 && prefecture.remaining > 0),
      completedPrefecture: prefectureProgress.find((prefecture) => prefecture.total > 0 && prefecture.remaining === 0),
      collectionManholes,
    };
  }, [journeyVisits, journeyManholes, nearbyUnvisited, journeyTab]);

  const {
    visitsByManholeId,
    visitedCount,
    unvisitedManholes,
    prefectureProgress,
    leadingPrefectures,
    nextPrefecture,
    completedPrefecture,
    collectionManholes,
  } = journeyData;
  const completionRate = knownTotalManholes ? (visitedCount / knownTotalManholes) * 100 : null;

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC] text-[#2A2A2A]">
      <header className="sticky top-0 z-50 border-b border-[#7B63A8]/20 bg-[#FFF8EB]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold" aria-label="ポケふた写真館">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#2A2A2A] bg-white shadow-sm">
              <span className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-[#E85046]" />
              <span className="absolute inset-x-0 top-1/2 h-[2px] bg-[#2A2A2A]" />
              <span className="relative h-3 w-3 rounded-full border-2 border-[#2A2A2A] bg-white" />
            </span>
            <span className="text-base sm:text-lg">ポケふた写真館</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/manholes"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#2A2A2A] transition hover:bg-[#7B63A8]/10"
              aria-label="検索"
              title="検索"
            >
              <Search className="h-5 w-5" />
            </Link>
            <Link
              href="/nearby"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#2A2A2A] transition hover:bg-[#7B63A8]/10"
              aria-label="絞り込み"
              title="絞り込み"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </Link>
            <Link
              href={uploadHref}
              className="hidden items-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299] sm:flex"
            >
              <Camera className="h-4 w-4" />
              写真を投稿
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-6 pt-5 sm:pt-8">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="font-bold text-[#7B63A8]">
                読み込み中<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <>
            {isLoggedIn ? (
              <>
                <section className="relative overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] px-5 py-6 shadow-[0_10px_26px_rgba(95,68,42,0.12)] sm:px-8">
                  <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
                  <div className="relative grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
                    <div>
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#B5483C]/25 bg-[#F8D9C4] px-3 py-1 text-xs font-bold text-[#B5483C]">
                        <Stamp className="h-3.5 w-3.5" />
                        次のスタンプを探そう
                      </div>
                      <h1 className="text-3xl font-extrabold leading-tight tracking-normal text-[#4F3828] sm:text-5xl">
                        {userName}のポケふた旅
                      </h1>

                      <div className="mt-5 max-w-2xl rounded-[8px] border border-[#8C6A4A]/15 bg-white/60 p-4">
                        <div className="mb-2 flex items-end justify-between gap-3">
                          <div>
                            <p className="font-pixel text-2xl text-[#4F3828]">
                              {visitedCount} / {knownTotalManholes ?? '集計中'} STAMPS
                            </p>
                            <p className="mt-1 text-xs font-bold text-[#6A4D36]">旅の進捗</p>
                          </div>
                          <p className="font-pixel text-xl text-[#B5483C]">
                            {completionRate === null ? '--%' : `${completionRate.toFixed(1)}%`}
                          </p>
                        </div>
                        <div className="h-4 overflow-hidden rounded-sm border border-[#8C6A4A]/20 bg-[#E4D4B8]">
                          <div
                            className="h-full bg-gradient-to-r from-[#D94D3F] via-[#F1B642] to-[#3F9D7D]"
                            style={{ width: `${Math.min(completionRate ?? 0, 100)}%` }}
                          />
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          {(leadingPrefectures.length > 0 ? leadingPrefectures : prefectureProgress.slice(0, 3)).map((prefecture) => (
                            <JourneyPrefectureStat key={prefecture.name} prefecture={prefecture} />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[8px] border border-[#8C6A4A]/15 bg-white/70 p-4">
                      <p className="flex items-center gap-2 text-sm font-extrabold text-[#4F3828]">
                        <Compass className="h-4 w-4 text-[#B5483C]" />
                        次のスタンプ候補
                      </p>
                      <div className="mt-3 space-y-2">
                        {(nearbyUnvisited.length > 0 ? nearbyUnvisited : unvisitedManholes.slice(0, 3)).map((manhole) => (
                          <Link
                            key={manhole.id}
                            href={`/manhole/${manhole.id}`}
                            className="flex items-center justify-between gap-3 rounded-[7px] border border-[#8C6A4A]/15 bg-[#FFF7E5] px-3 py-2 transition hover:bg-[#F8D9C4]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-[#4F3828]">{getMunicipality(manhole)}</span>
                              <span className="block truncate text-xs font-bold text-[#6A4D36]">{manhole.prefecture}</span>
                            </span>
                            <span className="shrink-0 font-pixel text-xs text-[#B5483C]">
                              {typeof manhole.distance === 'number' ? `${manhole.distance.toFixed(1)}km` : '未訪問'}
                            </span>
                          </Link>
                        ))}
                      </div>
                      {nearbyStatus !== 'ready' && (
                        <button
                          type="button"
                          onClick={loadNearbyUnvisited}
                          disabled={nearbyStatus === 'loading'}
                          className="mt-3 min-h-[40px] w-full rounded-[7px] border border-[#8C6A4A]/20 bg-white px-3 text-sm font-extrabold text-[#4F3828] transition hover:bg-[#F8D9C4] disabled:opacity-60"
                        >
                          {nearbyStatus === 'loading' ? '現在地を確認中...' : '近くの未訪問を表示'}
                        </button>
                      )}
                      {completedPrefecture ? (
                        <div className="mt-4 rounded-[7px] border border-[#3F9D7D]/25 bg-[#DFF1E9] px-3 py-2">
                          <p className="flex items-center gap-2 text-xs font-extrabold text-[#2C765E]">
                            <CheckCircle2 className="h-4 w-4" />
                            {completedPrefecture.name}コンプリート！
                          </p>
                        </div>
                      ) : nextPrefecture ? (
                        <div className="mt-4 rounded-[7px] border border-[#DDA63A]/30 bg-[#FFF0C7] px-3 py-2">
                          <p className="flex items-center gap-2 text-xs font-extrabold text-[#8C6315]">
                            <Award className="h-4 w-4" />
                            あと{nextPrefecture.remaining}枚で{nextPrefecture.name}制覇
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="mt-6">
                  <div className="-mx-4 overflow-x-auto px-4 pb-1">
                    <div className="flex min-w-max gap-2 rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5]/90 p-1 shadow-sm sm:min-w-0">
                      {journeyTabs.map((tab) => {
                        const isActive = journeyTab === tab.key;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setJourneyTab(tab.key)}
                            className={`min-h-[44px] rounded-[7px] px-5 text-sm font-bold transition ${
                              isActive
                                ? 'bg-[#4F3828] text-[#FFF7E5] shadow-sm'
                                : 'text-[#4F3828] hover:bg-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                      <Link
                        href="/visits"
                        className="flex min-h-[44px] items-center justify-center gap-2 rounded-[7px] px-5 text-sm font-bold text-[#4F3828] transition hover:bg-white"
                      >
                        スタンプ帳
                        <Stamp className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </section>

                <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5">
                  {collectionManholes.length > 0 ? (
                    collectionManholes.map((manhole) => (
                      <JourneyStampCard
                        key={manhole.id}
                        manhole={manhole}
                        visits={visitsByManholeId.get(manhole.id)}
                      />
                    ))
                  ) : (
                    <div className="col-span-full rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] px-5 py-10 text-center shadow-sm">
                      <p className="text-sm font-bold text-[#6A4D36]">次の候補を準備中です</p>
                      <Link
                        href="/nearby"
                        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#B5483C] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#9F3D33]"
                      >
                        <MapPin className="h-4 w-4" />
                        近くの未訪問を見る
                      </Link>
                    </div>
                  )}
                </section>
              </>
            ) : (
              <>
                <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-8 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-10 sm:py-12">
                  <div className="absolute right-6 top-7 hidden w-[300px] rotate-2 overflow-hidden rounded-[8px] border border-[#E2CFAE] bg-white p-2 shadow-lg lg:block xl:w-[360px]">
                    <img
                      src="/pokefuta_photo_gallery_mockup.svg"
                      alt=""
                      className="h-[220px] w-full rounded-[6px] object-cover object-left-top xl:h-[250px]"
                    />
                  </div>
                  <div className="relative max-w-3xl lg:max-w-[680px]">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
                      <Sparkles className="h-3.5 w-3.5" />
                      旅行スタンプ帳
                    </div>
                    <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-normal sm:text-5xl">
                      旅先で見つけたポケふたを記録しよう
                    </h1>
                    <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed sm:text-lg">
                      旅行やお出かけで出会ったポケふた写真をみんなでシェアしよう！
                    </p>

                    <div className="mt-7 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex items-center gap-3 rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-4 shadow-sm">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#7B63A8] shadow-sm">
                          <MapPin className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="text-xl font-extrabold leading-none">全国387自治体</div>
                          <div className="mt-1 text-xs font-bold text-[#6B6B6B]">に設置</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-[8px] border border-[#7B63A8]/15 bg-white/70 p-4 shadow-sm">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#FF8F1F] shadow-sm">
                          <Compass className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="text-xl font-extrabold leading-none">{listedCountLabel}</div>
                          <div className="mt-1 text-xs font-bold text-[#6B6B6B]">のポケふたを掲載</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="mt-6">
                  <div className="-mx-4 overflow-x-auto px-4 pb-1">
                    <div className="flex min-w-max gap-2 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB]/80 p-1 shadow-sm sm:min-w-0">
                      {galleryTabs.map((tab) => {
                        if (tab.key === 'prefectures') {
                          return (
                            <Link
                              key={tab.key}
                              href="/manholes"
                              className="flex min-h-[44px] items-center justify-center gap-2 rounded-[7px] px-5 text-sm font-bold text-[#2A2A2A] transition hover:bg-white"
                            >
                              <span className="hidden sm:inline">{tab.label}</span>
                              <span className="sm:hidden">{tab.mobileLabel}</span>
                              <MapPin className="h-4 w-4" />
                            </Link>
                          );
                        }

                        const isActive = activeTab === tab.key;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key as GalleryTab)}
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

                <section className="mt-6">
                  {visibleFeed.length === 0 ? (
                    <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-10 text-center shadow-sm">
                      <p className="text-sm font-bold text-[#6B6B6B]">
                        まだ投稿がありません
                      </p>
                      <Link
                        href={uploadHref}
                        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299]"
                      >
                        <Camera className="w-4 h-4" />
                        <span>ログインして投稿</span>
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5">
                      {visibleFeed.map((visit, index) => {
                        const photo = visit.photos?.[0];
                        const title = [visit.manhole?.prefecture, visit.manhole?.municipality]
                          .filter(Boolean)
                          .join(' ');
                        const locationLabel = title || visit.shot_location || '';
                        const manholeId = visit.manhole?.id ?? visit.manhole_id;
                        const canNavigate = Boolean(manholeId);
                        const to = canNavigate ? `/manhole/${manholeId}` : '';

                        const commonAriaLabel = `${locationLabel}、撮影 ${formatDateJa(visit.shot_at)}、いいね ${visit.likes_count}、コメント ${visit.comments_count}`;
                        const cardContent = (
                          <>
                            {photo?.thumbnail_url ? (
                              <img
                                src={photo.thumbnail_url}
                                alt=""
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-[#FFF8EB] text-[#7B63A8]">
                                <MapPin className="h-8 w-8 opacity-80" />
                              </div>
                            )}

                            {currentPage === 1 && index < 3 && (
                              <span className="absolute left-2 top-2 rounded-[6px] bg-[#7B63A8] px-2 py-1 text-xs font-extrabold text-white shadow-sm">
                                NEW
                              </span>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-14 text-white sm:p-4 sm:pt-20">
                              <div className="line-clamp-1 text-sm font-extrabold sm:text-base">
                                {locationLabel || 'ポケふた'}
                              </div>
                              <div className="mt-1 text-sm font-semibold">{formatDateJa(visit.shot_at)}</div>
                              <div className="mt-3 flex items-center gap-4 text-sm font-semibold">
                                <span className="inline-flex items-center gap-1">
                                  <Heart className="h-4 w-4" />
                                  {visit.likes_count}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <MessageCircle className="h-4 w-4" />
                                  {visit.comments_count}
                                </span>
                              </div>
                            </div>
                          </>
                        );

                        if (!canNavigate) {
                          return (
                            <div
                              key={visit.id}
                              className="group relative aspect-square overflow-hidden rounded-[8px] bg-[#FFF8EB] shadow-sm ring-1 ring-[#7B63A8]/15"
                              aria-label={commonAriaLabel}
                            >
                              {cardContent}
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={visit.id}
                            href={to}
                            className="group relative aspect-square overflow-hidden rounded-[8px] bg-[#FFF8EB] shadow-sm ring-1 ring-[#7B63A8]/15 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#FFB347]"
                            aria-label={commonAriaLabel}
                          >
                            {cardContent}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}

            <div className="sr-only" aria-live="polite">
              全ポケふた {totalManholes || 0}、写真あり {manholesWithPhotos ?? 0}、全投稿{' '}
              {totalPosts ?? 0}
              {/* ユーザ数はここに退避したい場合に使えるが、デフォルトでは表示しない */}
              {false && (
                <span>ユーザ {totalUsers ?? '—'}</span>
              )}
            </div>

            {/* Feed Pagination */}
            {!isLoggedIn && showPagination && (
              <div className="mt-7 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] p-3 shadow-sm">
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="flex min-h-11 items-center gap-1 rounded-lg bg-white px-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#FFB347]/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="前のページ"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    前へ
                  </button>

                  <div className="min-w-16 text-center text-sm font-bold text-[#6B6B6B]">
                    {totalPages ? `${currentPage} / ${totalPages}` : currentPage}
                  </div>

                  <button
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    disabled={!canGoNext}
                    className="flex min-h-11 items-center gap-1 rounded-lg bg-white px-3 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-[#FFB347]/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="次のページ"
                  >
                    次へ
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

          </>
        )}
      </main>

      <Link
        href={uploadHref}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-40 inline-flex items-center gap-2 rounded-full px-5 py-4 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(123,99,168,0.30)] transition sm:bottom-6 sm:right-6 ${
          isLoggedIn ? 'bg-[#B5483C] hover:bg-[#9F3D33]' : 'bg-[#7B63A8] hover:bg-[#6A5299]'
        }`}
      >
        <Camera className="h-5 w-5" />
        {isLoggedIn ? '訪問を記録' : '写真を投稿'}
      </Link>

      <BottomNav />
    </div>
  );
}

function JourneyPrefectureStat({ prefecture }: { prefecture: PrefectureProgress }) {
  return (
    <div className="rounded-[7px] border border-[#8C6A4A]/15 bg-[#FFF7E5] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-extrabold text-[#4F3828]">{prefecture.name}</p>
        <p className="shrink-0 font-pixel text-sm text-[#B5483C]">
          {prefecture.visited}/{prefecture.total}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-[#E4D4B8]">
        <div className="h-full bg-[#3F9D7D]" style={{ width: `${Math.min(prefecture.rate, 100)}%` }} />
      </div>
    </div>
  );
}

function JourneyStampCard({ manhole, visits }: { manhole: JourneyManhole; visits?: JourneyVisit[] }) {
  const isVisited = Boolean(visits?.length);
  const latestVisit = visits?.slice().sort((a, b) => new Date(b.shot_at).getTime() - new Date(a.shot_at).getTime())[0];
  const hasPhoto = Boolean(latestVisit?.photos?.length);

  return (
    <Link
      href={`/manhole/${manhole.id}`}
      className={`group relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-[8px] border-2 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
        isVisited
          ? 'border-[#B5483C]/40 bg-[#FFF7E5]'
          : 'border-dashed border-[#8C6A4A]/25 bg-[#E9DEC9]'
      }`}
    >
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="relative flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${
            isVisited ? 'bg-[#D94D3F] text-white' : 'bg-[#D5C8B3] text-[#7D715F]'
          }`}
        >
          {isVisited ? '訪問済み' : '未訪問'}
        </span>
        <span className="flex items-center gap-1">
          {hasPhoto && <Camera className="h-4 w-4 text-[#B5483C]" />}
          {visits && visits.length > 1 && (
            <span className="rounded-full bg-[#4F3828] px-1.5 py-0.5 font-pixel text-[10px] text-white">
              x{visits.length}
            </span>
          )}
          {!isVisited && typeof manhole.distance === 'number' && (
            <span className="font-pixel text-xs text-[#B5483C]">{manhole.distance.toFixed(1)}km</span>
          )}
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        <div
          className={`flex h-24 w-24 rotate-[-8deg] items-center justify-center rounded-full border-4 text-center ${
            isVisited
              ? 'border-[#D94D3F] bg-white/50 text-[#D94D3F] shadow-[inset_0_2px_8px_rgba(181,72,60,0.12)]'
              : 'border-[#B8AB96] text-[#A39580]'
          }`}
        >
          {isVisited ? (
            <div>
              <CircleDot className="mx-auto h-7 w-7" />
              <p className="mt-1 font-pixel text-[10px] leading-none">POKEFUTA</p>
            </div>
          ) : (
            <div>
              <Stamp className="mx-auto h-7 w-7" />
              <p className="mt-1 font-pixel text-[10px] leading-none">NEXT</p>
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <p className="line-clamp-1 text-sm font-extrabold text-[#4F3828]">{getMunicipality(manhole)}</p>
        <p className="mt-1 line-clamp-1 text-xs font-bold text-[#6A4D36]">{manhole.prefecture}</p>
        <p className="mt-2 line-clamp-1 text-xs font-bold text-[#8C6A4A]">
          {isVisited && latestVisit ? formatDateJa(latestVisit.shot_at) : getManholeTitle(manhole)}
        </p>
      </div>
    </Link>
  );
}
