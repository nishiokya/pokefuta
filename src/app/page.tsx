'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Award,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Compass,
  Heart,
  MapPin,
  MessageCircle,
  Sparkles,
  Stamp,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateJa } from '@/lib/date';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { calculateDistance, isValidCoordinates } from '@/lib/location';

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
type JourneyTab = 'history' | 'unvisited';

type JourneyVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'title' | 'pokemons' | 'titles' | 'hashtags' | 'title_tags'> | null;
  shot_at: string;
  created_at?: string;
  photos: Array<{ id: string; thumbnail_url?: string; created_at?: string }>;
};

type JourneyManhole = Manhole & {
  name?: string;
  city?: string;
  distance?: number;
  is_visited?: boolean;
  last_visit?: string | null;
  photo_count?: number;
};

type PrefectureProgress = {
  name: string;
  total: number;
  visited: number;
  remaining: number;
  rate: number;
  unvisitedLatitude?: number;
  unvisitedLongitude?: number;
  distanceFromLatestKm?: number;
};

type PrefectureCandidate = PrefectureProgress & {
  label: '制覇済み' | '制覇目前' | '旅の続き' | '近くで行けそう';
};

const galleryTabs: Array<{ key: GalleryTab | 'prefectures'; label: string; mobileLabel: string }> = [
  { key: 'latest', label: '最新', mobileLabel: '最新' },
  { key: 'prefectures', label: 'ポケふたを探す', mobileLabel: '探す' },
];

const journeyTabs: Array<{ key: JourneyTab; label: string }> = [
  { key: 'history', label: '訪問履歴' },
  { key: 'unvisited', label: '未訪問' },
];

const getJourneyTabFromUrl = (): JourneyTab => {
  if (typeof window === 'undefined') return 'history';
  return new URLSearchParams(window.location.search).get('tab') === 'unvisited' ? 'unvisited' : 'history';
};

const updateJourneyTabUrl = (tab: JourneyTab, hash?: string) => {
  const url = new URL(window.location.href);
  if (tab === 'history') {
    url.searchParams.delete('tab');
  } else {
    url.searchParams.set('tab', tab);
  }
  url.hash = hash ? `#${hash}` : '';
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const getDisplayName = (session: any) => {
  const metadataName = session?.user?.user_metadata?.display_name;
  const emailName = session?.user?.email?.split('@')[0];
  return metadataName || emailName || 'タコさん';
};

const getMunicipality = (manhole?: Pick<Manhole, 'municipality'> & { city?: string }) =>
  manhole?.city || manhole?.municipality || '場所未設定';

const getManholeTitle = (manhole?: Pick<Manhole, 'title' | 'municipality'> & { name?: string; city?: string }) =>
  manhole?.name || manhole?.title || getMunicipality(manhole);

const getLatestVisit = (visits?: JourneyVisit[]) => visits?.[0];

const getLatestPhoto = (visits?: JourneyVisit[]) =>
  visits
    ?.flatMap((visit) =>
      visit.photos.map((photo) => ({
        ...photo,
        sortAt: photo.created_at || visit.shot_at,
      }))
    )
    .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime())[0];

const getManholeTags = (
  manhole?: Pick<Manhole, 'titles' | 'hashtags' | 'title_tags' | 'pokemons'> | null,
  max = 4
) => {
  const tags: string[] = [];
  const pushTag = (tag?: string | null) => {
    const normalized = tag?.replace(/^#/, '').trim();
    if (normalized && !tags.includes(normalized)) tags.push(normalized);
  };

  [...(Array.isArray(manhole?.titles) ? manhole!.titles : [])]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .forEach((title) => pushTag(`${title.emoji || ''}${title.label}`));
  (Array.isArray(manhole?.title_tags) ? manhole!.title_tags : []).forEach(pushTag);
  (Array.isArray(manhole?.hashtags) ? manhole!.hashtags : []).forEach(pushTag);
  (Array.isArray(manhole?.pokemons) ? manhole!.pokemons : []).forEach(pushTag);

  return tags.slice(0, max);
};

const hasCoordinates = (manhole?: Pick<JourneyManhole, 'latitude' | 'longitude'> | null) =>
  isValidCoordinates(manhole?.latitude, manhole?.longitude);

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
  const [journeyTab, setJourneyTab] = useState<JourneyTab>('history');
  const feedPerPage = 24;
  const { trackView, trackCollectionOpen, updateUserProperties } = useAnalytics();

  const selectJourneyTab = (tab: JourneyTab, hash?: string) => {
    setJourneyTab(tab);
    updateJourneyTabUrl(tab, hash);
    if (hash) {
      window.requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }));
    }
  };

  useEffect(() => {
    document.title = 'ポケふた写真館 - ポケふた訪問記録';
    trackView('/', 'ホーム', 'home');

    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const loggedIn = Boolean(session?.user);
        setIsLoggedIn(loggedIn);
        trackCollectionOpen({ is_logged_in: loggedIn });
        if (loggedIn && session?.user?.id) {
          setUserName(getDisplayName(session));
          updateUserProperties({ registered_user: true });
          setLoading(false);
          loadJourney();
          const { data: appUser } = await supabase
            .from('app_user')
            .select('id')
            .eq('auth_uid', session.user.id)
            .maybeSingle();
          setCurrentUserId(appUser?.id ?? null);
        }
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
    setJourneyTab(getJourneyTabFromUrl());

    const handlePopState = () => {
      setJourneyTab(getJourneyTabFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!loading && journeyTab === 'unvisited' && window.location.hash === '#journey-unvisited') {
      window.requestAnimationFrame(() => document.getElementById('journey-unvisited')?.scrollIntoView());
    }
  }, [journeyTab, loading]);

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
        fetch('/api/visits?limit=1000&include_manhole_tags=true'),
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
            `/api/manholes?lat=${latitude}&lng=${longitude}&radius=30&visited=false&limit=4`
          );
          if (!response.ok) {
            setNearbyStatus('unavailable');
            return;
          }
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

  const listedCountLabel = totalPosts && totalPosts > 0 ? `${totalPosts}枚以上` : '集計中';
  const totalFeedCount = totalPosts && totalPosts > 0 ? totalPosts : null;
  const totalPages = totalFeedCount ? Math.max(1, Math.ceil(totalFeedCount / feedPerPage)) : null;
  const canGoNext = totalPages ? currentPage < totalPages : feed.length === feedPerPage;
  const visibleFeed =
    canGoNext && sortedFeed.length >= 3 && sortedFeed.length % 3 !== 0
      ? sortedFeed.slice(0, sortedFeed.length - (sortedFeed.length % 3))
      : sortedFeed;
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
    visitsByManholeId.forEach((visits) => {
      visits.sort((a, b) => new Date(b.shot_at).getTime() - new Date(a.shot_at).getTime());
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
        address_norm: null,
        building: null,
        detail_url: null,
        prefecture_site_url: null,
        official_url: null,
        titles: manhole.titles || [],
        hashtags: manhole.hashtags || [],
        title_tags: manhole.title_tags || [],
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
    const visitedManholes = allJourneyManholes
      .filter((manhole) => visitsByManholeId.has(manhole.id))
      .sort((a, b) => {
        const aVisit = getLatestVisit(visitsByManholeId.get(a.id));
        const bVisit = getLatestVisit(visitsByManholeId.get(b.id));
        return new Date(bVisit?.shot_at || 0).getTime() - new Date(aVisit?.shot_at || 0).getTime();
      });

    const latestVisitedManhole = visitedManholes.find(hasCoordinates);
    const prefectureProgress: PrefectureProgress[] = Array.from(
      allJourneyManholes.reduce((map, manhole) => {
        const name = manhole.prefecture || '都道府県未設定';
        const current = map.get(name) || {
          totalIds: new Set<number>(),
          visitedIds: new Set<number>(),
          unvisitedLatitudeSum: 0,
          unvisitedLongitudeSum: 0,
          unvisitedCoordinateCount: 0,
        };
        current.totalIds.add(manhole.id);
        if (visitsByManholeId.has(manhole.id)) {
          current.visitedIds.add(manhole.id);
        } else if (hasCoordinates(manhole)) {
          current.unvisitedLatitudeSum += manhole.latitude!;
          current.unvisitedLongitudeSum += manhole.longitude!;
          current.unvisitedCoordinateCount += 1;
        }
        map.set(name, current);
        return map;
      }, new Map<string, {
        totalIds: Set<number>;
        visitedIds: Set<number>;
        unvisitedLatitudeSum: number;
        unvisitedLongitudeSum: number;
        unvisitedCoordinateCount: number;
      }>())
    )
      .map(([name, value]) => {
        const total = value.totalIds.size;
        const visited = value.visitedIds.size;
        const unvisitedLatitude =
          value.unvisitedCoordinateCount > 0 ? value.unvisitedLatitudeSum / value.unvisitedCoordinateCount : undefined;
        const unvisitedLongitude =
          value.unvisitedCoordinateCount > 0 ? value.unvisitedLongitudeSum / value.unvisitedCoordinateCount : undefined;
        const distanceFromLatestKm =
          latestVisitedManhole &&
          typeof unvisitedLatitude === 'number' &&
          typeof unvisitedLongitude === 'number'
            ? calculateDistance(
                latestVisitedManhole.latitude!,
                latestVisitedManhole.longitude!,
                unvisitedLatitude,
                unvisitedLongitude
              )
            : undefined;
        return {
          name,
          total,
          visited,
          remaining: Math.max(total - visited, 0),
          rate: total > 0 ? (visited / total) * 100 : 0,
          unvisitedLatitude,
          unvisitedLongitude,
          distanceFromLatestKm,
        };
      })
      .sort((a, b) => {
        const aNearComplete = a.remaining > 0 ? a.remaining : 999;
        const bNearComplete = b.remaining > 0 ? b.remaining : 999;
        if (aNearComplete !== bNearComplete) return aNearComplete - bNearComplete;
        if (b.visited !== a.visited) return b.visited - a.visited;
        return a.name.localeCompare(b.name, 'ja');
      });

    const nearbyIds = new Set<number>();
    const nearbyCandidates = nearbyUnvisited
      .filter((manhole) => !visitsByManholeId.has(manhole.id))
      .slice(0, 4)
      .map((manhole) => {
        nearbyIds.add(manhole.id);
        return manhole;
      });
    const recentCandidates = unvisitedManholes
      .filter((manhole) => !nearbyIds.has(manhole.id))
      .sort((a, b) => {
        const dateDiff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        return dateDiff !== 0 ? dateDiff : b.id - a.id;
      })
      .slice(0, 4);

    const completedPrefectures = prefectureProgress
      .filter((prefecture) => prefecture.total > 0 && prefecture.remaining === 0)
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return a.name.localeCompare(b.name, 'ja');
      });
    const unfinishedPrefectures = prefectureProgress.filter(
      (prefecture) => prefecture.total > 0 && prefecture.remaining > 0
    );
    const continuingPrefecture =
      unfinishedPrefectures
        .filter((prefecture) => prefecture.visited > 0)
        .sort((a, b) => {
          if (a.remaining !== b.remaining) return a.remaining - b.remaining;
          if (b.visited !== a.visited) return b.visited - a.visited;
          return a.name.localeCompare(b.name, 'ja');
        })[0] || null;
    const nextPrefectureCandidates: PrefectureCandidate[] = unfinishedPrefectures
      .map((prefecture) => {
        const isNearComplete = prefecture.visited > 0 && prefecture.remaining <= 3;
        const hasNearbySignal = typeof prefecture.distanceFromLatestKm === 'number';
        const label: PrefectureCandidate['label'] = isNearComplete
          ? '制覇目前'
          : hasNearbySignal
            ? '近くで行けそう'
            : '旅の続き';
        return { ...prefecture, label };
      })
      .sort((a, b) => {
        const aNearComplete = a.visited > 0 && a.remaining <= 3 ? 0 : 1;
        const bNearComplete = b.visited > 0 && b.remaining <= 3 ? 0 : 1;
        if (aNearComplete !== bNearComplete) return aNearComplete - bNearComplete;

        const aDistance = a.distanceFromLatestKm ?? Number.POSITIVE_INFINITY;
        const bDistance = b.distanceFromLatestKm ?? Number.POSITIVE_INFINITY;
        if (aDistance !== bDistance) return aDistance - bDistance;

        if (b.remaining !== a.remaining) return b.remaining - a.remaining;
        if (b.visited !== a.visited) return b.visited - a.visited;
        return a.name.localeCompare(b.name, 'ja');
      })
      .slice(0, 3);
    const progressByPrefecture = new Map(prefectureProgress.map((prefecture) => [prefecture.name, prefecture]));
    const usedUnvisitedCandidateIds = new Set(
      [...nearbyCandidates, ...recentCandidates].map((manhole) => manhole.id)
    );
    const journeyContinuationCandidates = unvisitedManholes
      .filter((manhole) => !usedUnvisitedCandidateIds.has(manhole.id))
      .sort((a, b) => {
        const aProgress = progressByPrefecture.get(a.prefecture || '都道府県未設定');
        const bProgress = progressByPrefecture.get(b.prefecture || '都道府県未設定');
        const aSameAsContinuing = continuingPrefecture && a.prefecture === continuingPrefecture.name ? 0 : 1;
        const bSameAsContinuing = continuingPrefecture && b.prefecture === continuingPrefecture.name ? 0 : 1;
        if (aSameAsContinuing !== bSameAsContinuing) return aSameAsContinuing - bSameAsContinuing;

        const aVisited = aProgress?.visited ?? 0;
        const bVisited = bProgress?.visited ?? 0;
        if (bVisited !== aVisited) return bVisited - aVisited;

        const aRemaining = aProgress?.remaining ?? Number.POSITIVE_INFINITY;
        const bRemaining = bProgress?.remaining ?? Number.POSITIVE_INFINITY;
        if (aRemaining !== bRemaining) return aRemaining - bRemaining;

        return `${a.prefecture}${getMunicipality(a)}${a.id}`.localeCompare(
          `${b.prefecture}${getMunicipality(b)}${b.id}`,
          'ja'
        );
      })
      .slice(0, 4);

    return {
      visitsByManholeId,
      visitedCount: visitsByManholeId.size,
      visitedManholes,
      completedPrefectures,
      continuingPrefecture,
      nextPrefectureCandidates,
      nearbyCandidates,
      recentCandidates,
      journeyContinuationCandidates,
    };
  }, [journeyVisits, journeyManholes, nearbyUnvisited]);

  const {
    visitsByManholeId,
    visitedCount,
    completedPrefectures,
    continuingPrefecture,
    nextPrefectureCandidates,
    visitedManholes,
    nearbyCandidates,
    recentCandidates,
    journeyContinuationCandidates,
  } = journeyData;
  const completionRate = knownTotalManholes ? (visitedCount / knownTotalManholes) * 100 : null;

  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-[#F6EEDC] text-[#2A2A2A]">
      <Header title="ポケふた写真館" />

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
                <section className="relative overflow-hidden rounded-[8px] border border-[#8C6A4A]/20 bg-[#FFF7E5] px-5 py-6 shadow-[0_10px_26px_rgba(95,68,42,0.12)] sm:px-8 sm:py-8">
                  <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
                  <div className="relative">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#B5483C]/25 bg-[#F8D9C4] px-3 py-1 text-xs font-bold text-[#B5483C]">
                      <Stamp className="h-3.5 w-3.5" />
                      まいたび
                    </div>
                    <h1 className="text-3xl font-extrabold leading-tight tracking-normal text-[#4F3828] sm:text-5xl">
                      {userName}のポケふた旅
                    </h1>

                    <div className="mt-5 rounded-[8px] border border-[#8C6A4A]/15 bg-white/70 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] sm:p-5">
                      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
                        <div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <p className="font-pixel text-3xl leading-none text-[#4F3828] sm:text-4xl">
                                {visitedCount} / {knownTotalManholes ?? '集計中'}
                              </p>
                              <p className="mt-2 text-xs font-extrabold text-[#6A4D36]">STAMPS</p>
                            </div>
                            <div className="rounded-[7px] border border-[#B5483C]/20 bg-[#FFF7E5] px-3 py-2">
                              <p className="text-[11px] font-extrabold text-[#6A4D36]">全国達成率</p>
                              <p className="mt-1 font-pixel text-2xl leading-none text-[#B5483C]">
                                {completionRate === null ? '--%' : `${completionRate.toFixed(1)}%`}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 h-4 overflow-hidden rounded-sm border border-[#8C6A4A]/20 bg-[#E4D4B8]">
                            <div
                              className="h-full bg-gradient-to-r from-[#8C6A4A] via-[#DDA63A] to-[#2C765E]"
                              style={{ width: `${Math.min(completionRate ?? 0, 100)}%` }}
                            />
                          </div>
                          <JourneyPrefectureOverview
                            completedPrefectures={completedPrefectures}
                            continuingPrefecture={continuingPrefecture}
                            userId={currentUserId}
                          />
                        </div>

                        <div>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-extrabold text-[#6A4D36]">次に狙いたい県</p>
                              <p className="mt-1 text-[11px] font-bold text-[#8C6A4A]">旅の続きにしやすい候補</p>
                            </div>
                            <Compass className="h-5 w-5 text-[#B5483C]" />
                          </div>
                          {nextPrefectureCandidates.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                              {nextPrefectureCandidates.map((prefecture) => (
                                <JourneyPrefectureStat
                                  key={prefecture.name}
                                  prefecture={prefecture}
                                  label={prefecture.label}
                                  userId={currentUserId}
                                />
                              ))}
                            </div>
                          ) : (
                            <JourneyCandidateNotice text="最初の訪問を記録すると、次の旅先候補がここに育っていきます。" />
                          )}
                          <Link
                            href="/nearby?tab=unvisited"
                            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[7px] bg-[#B5483C] px-5 py-3 text-sm font-extrabold text-white shadow-[0_6px_14px_rgba(181,72,60,0.22)] transition hover:bg-[#9F3D33] focus:outline-none focus:ring-2 focus:ring-[#DDA63A]"
                          >
                            <MapPin className="h-5 w-5" />
                            次のポケふたを探す
                          </Link>
                        </div>
                      </div>
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
                            onClick={() => selectJourneyTab(tab.key)}
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
                    </div>
                  </div>
                </section>

                {journeyTab === 'history' ? (
                  <section className="mt-6">
                    {visitedManholes.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
                        {visitedManholes.map((manhole) => (
                          <JourneyHistoryCard
                            key={manhole.id}
                            manhole={manhole}
                            visits={visitsByManholeId.get(manhole.id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <JourneyEmptyState
                        title="まだ訪問履歴がありません"
                        description="最初の訪問を記録すると、ここに写真つきの旅のアルバムが育っていきます。"
                        uploadHref={uploadHref}
                      />
                    )}
                  </section>
                ) : (
                  <section className="mt-6 space-y-6">
                    <JourneyCandidateSection
                      title="近くにある未訪問"
                      description="今いる場所から寄り道しやすい候補"
                      action={
                        <button
                          type="button"
                          onClick={loadNearbyUnvisited}
                          disabled={nearbyStatus === 'loading'}
                          className="min-h-[40px] rounded-[7px] border border-[#8C6A4A]/20 bg-white px-3 text-xs font-extrabold text-[#4F3828] transition hover:bg-[#F8D9C4] disabled:opacity-60"
                        >
                          {nearbyStatus === 'loading' ? '確認中...' : '近く候補を更新'}
                        </button>
                      }
                    >
                      {nearbyCandidates.length > 0 ? (
                        nearbyCandidates.map((manhole) => (
                          <JourneyUnvisitedCard key={manhole.id} manhole={manhole} badge="近くで行けそう" />
                        ))
                      ) : (
                        <JourneyCandidateNotice
                          text={nearbyStatus === 'unavailable' ? '位置情報が使えませんでした。最近追加の候補から探せます。' : '位置情報を使うと近くの未訪問を4件表示できます。'}
                        />
                      )}
                    </JourneyCandidateSection>

                    <JourneyCandidateSection title="最近できた未訪問" description="新しく追加されたポケふたから次の目的地を探す">
                      {recentCandidates.length > 0 ? (
                        recentCandidates.map((manhole) => (
                          <JourneyUnvisitedCard key={manhole.id} manhole={manhole} badge="NEW" />
                        ))
                      ) : (
                        <JourneyCandidateNotice text="最近追加された未訪問候補を準備中です。" />
                      )}
                    </JourneyCandidateSection>

                    <JourneyCandidateSection id="journey-unvisited" title="旅の続きを見る" description="新しい目的地を地図から探す前の候補">
                      {journeyContinuationCandidates.length > 0 ? (
                        journeyContinuationCandidates.map((manhole) => (
                          <JourneyUnvisitedCard key={manhole.id} manhole={manhole} badge="旅の続き" />
                        ))
                      ) : (
                        <JourneyCandidateNotice text="未訪問候補を準備中です。" />
                      )}
                    </JourneyCandidateSection>
                  </section>
                )}
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
                              href="/nearby?tab=all"
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
                        <span>旅の続きで投稿</span>
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

      {isLoggedIn && (
        <Link
          href={uploadHref}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#B5483C] px-5 py-4 text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(123,99,168,0.30)] transition hover:bg-[#9F3D33] sm:bottom-6 sm:right-6"
        >
          <Camera className="h-5 w-5" />
          訪問を記録
        </Link>
      )}

      <BottomNav />
    </div>
  );
}

function JourneyPrefectureOverview({
  completedPrefectures,
  continuingPrefecture,
  userId,
}: {
  completedPrefectures: PrefectureProgress[];
  continuingPrefecture: PrefectureProgress | null;
  userId: string | null;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-[#2C765E]">
          <Award className="h-4 w-4" />
          制覇済み
        </div>
        {completedPrefectures.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {completedPrefectures.slice(0, 8).map((prefecture) => (
              <JourneyPrefectureStat
                key={prefecture.name}
                prefecture={prefecture}
                label="制覇済み"
                userId={userId}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[7px] border border-dashed border-[#8C6A4A]/25 bg-[#FFF7E5] px-3 py-3 text-xs font-bold text-[#6A4D36]">
            はじめての県制覇まで、旅の記録を重ねていこう。
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-[#6A4D36]">
          <Compass className="h-4 w-4 text-[#8C6A4A]" />
          旅の続き
        </div>
        {continuingPrefecture ? (
          <JourneyPrefectureStat prefecture={continuingPrefecture} label="旅の続き" userId={userId} />
        ) : (
          <div className="rounded-[7px] border border-dashed border-[#8C6A4A]/25 bg-[#FFF7E5] px-3 py-3 text-xs font-bold text-[#6A4D36]">
            訪問を記録すると、続きにしたい県がここに出ます。
          </div>
        )}
      </div>
    </div>
  );
}

function JourneyPrefectureStat({
  prefecture,
  label,
  userId,
}: {
  prefecture: PrefectureProgress;
  label?: PrefectureCandidate['label'];
  userId?: string | null;
}) {
  const complete = prefecture.total > 0 && prefecture.remaining === 0;
  const displayLabel = label || (complete ? '制覇済み' : '旅の続き');
  const content = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-[#4F3828]">{prefecture.name}</p>
          <p className="mt-1 font-pixel text-sm leading-none text-[#B5483C]">
            {prefecture.visited} / {prefecture.total}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-extrabold ${
          complete
            ? 'bg-[#E6F4DD] text-[#2C765E]'
            : displayLabel === '制覇目前'
              ? 'bg-[#FFF0C7] text-[#8C6315]'
              : displayLabel === '近くで行けそう'
                ? 'bg-white text-[#B5483C]'
                : 'bg-[#EFE2CE] text-[#6A4D36]'
        }`}>
          {displayLabel}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm border border-[#8C6A4A]/10 bg-[#E4D4B8]">
        <div
          className={`h-full ${complete ? 'bg-[#2C765E]' : 'bg-[#8C6A4A]'}`}
          style={{ width: `${Math.min(prefecture.rate, 100)}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold text-[#6A4D36]">
        <span>{complete ? '制覇済み' : `あと${prefecture.remaining}枚`}</span>
        <span>{prefecture.rate.toFixed(0)}%</span>
      </div>
    </>
  );

  if (!userId) {
    return (
      <div className="rounded-[7px] border border-[#8C6A4A]/15 bg-[#FFF7E5] p-3 shadow-sm">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/users/${encodeURIComponent(userId)}/prefectures?prefecture=${encodeURIComponent(prefecture.name)}`}
      className="block rounded-[7px] border border-[#8C6A4A]/15 bg-[#FFF7E5] p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#DDA63A]"
      aria-label={`${prefecture.name}の達成状況を見る`}
    >
      {content}
    </Link>
  );
}

function JourneyHistoryCard({ manhole, visits }: { manhole: JourneyManhole; visits?: JourneyVisit[] }) {
  const latestVisit = getLatestVisit(visits);
  const latestPhoto = getLatestPhoto(visits);
  const visitCount = visits?.length ?? 0;
  const photoCount = visits?.reduce((count, visit) => count + visit.photos.length, 0) ?? 0;
  const tags = getManholeTags(manhole, 4);

  return (
    <Link
      href={`/manhole/${manhole.id}`}
      className="group overflow-hidden rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#DDA63A]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#E9DEC9]">
        {latestPhoto?.thumbnail_url ? (
          <img
            src={latestPhoto.thumbnail_url}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex h-24 w-24 rotate-[-8deg] items-center justify-center rounded-full border-4 border-[#D94D3F] bg-white/60 text-center text-[#D94D3F] shadow-[inset_0_2px_8px_rgba(181,72,60,0.12)]">
              <div>
                <CircleDot className="mx-auto h-7 w-7" />
                <p className="mt-1 font-pixel text-[10px] leading-none">POKEFUTA</p>
              </div>
            </div>
          </div>
        )}
        <div className="absolute left-2 top-2 rounded-[6px] bg-[#D94D3F] px-2 py-1 text-xs font-extrabold text-white shadow-sm">
          訪問済み
        </div>
        <div className="absolute bottom-2 right-2 flex gap-1">
          {photoCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs font-bold text-white">
              <Camera className="h-3.5 w-3.5" />
              {photoCount}
            </span>
          )}
          {visitCount > 1 && (
            <span className="rounded-full bg-[#4F3828] px-2 py-1 font-pixel text-xs text-white">
              x{visitCount}
            </span>
          )}
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-1 text-base font-extrabold text-[#4F3828]">{getMunicipality(manhole)}</p>
            <p className="mt-1 line-clamp-1 text-xs font-bold text-[#6A4D36]">{manhole.prefecture}</p>
          </div>
          {latestVisit && (
            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-[#B5483C]">
              {formatDateJa(latestVisit.shot_at)}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.length > 0 ? (
            tags.map((tag) => (
              <span key={tag} className="rounded-full border border-[#8C6A4A]/15 bg-white/80 px-2 py-1 text-[11px] font-bold text-[#6A4D36]">
                {tag}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-[#8C6A4A]/15 bg-white/80 px-2 py-1 text-[11px] font-bold text-[#6A4D36]">
              {getManholeTitle(manhole)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function JourneyCandidateSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div id={id}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#4F3828]">{title}</h2>
          <p className="mt-1 text-xs font-bold text-[#6A4D36]">{description}</p>
        </div>
        {action}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}

function JourneyUnvisitedCard({ manhole, badge }: { manhole: JourneyManhole; badge: string }) {
  const tags = getManholeTags(manhole, 3);

  return (
    <Link
      href={`/manhole/${manhole.id}`}
      className="group relative flex min-h-[210px] flex-col justify-between overflow-hidden rounded-[8px] border-2 border-dashed border-[#8C6A4A]/25 bg-[#E9DEC9] p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#DDA63A]"
    >
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="rounded-full bg-[#D5C8B3] px-2 py-1 text-[11px] font-extrabold text-[#7D715F]">
          未訪問
        </span>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-extrabold text-[#B5483C]">
          {typeof manhole.distance === 'number' ? `${manhole.distance.toFixed(1)}km` : badge}
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center py-4">
        <div className="flex h-20 w-20 rotate-[-8deg] items-center justify-center rounded-full border-4 border-[#B8AB96] text-center text-[#A39580]">
          <div>
            <Stamp className="mx-auto h-6 w-6" />
            <p className="mt-1 font-pixel text-[10px] leading-none">NEXT</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <p className="line-clamp-1 text-sm font-extrabold text-[#4F3828]">{getMunicipality(manhole)}</p>
        <p className="mt-1 line-clamp-1 text-xs font-bold text-[#6A4D36]">{manhole.prefecture}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {(tags.length > 0 ? tags : [getManholeTitle(manhole)]).slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-[#6A4D36]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

function JourneyCandidateNotice({ text }: { text: string }) {
  return (
    <div className="col-span-full rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] px-4 py-5 text-sm font-bold text-[#6A4D36] shadow-sm">
      {text}
    </div>
  );
}

function JourneyEmptyState({
  title,
  description,
  uploadHref,
}: {
  title: string;
  description: string;
  uploadHref: string;
}) {
  return (
    <div className="rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] px-5 py-10 text-center shadow-sm">
      <p className="text-base font-extrabold text-[#4F3828]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-relaxed text-[#6A4D36]">{description}</p>
      <Link
        href={uploadHref}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#B5483C] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#9F3D33]"
      >
        <Camera className="h-4 w-4" />
        訪問を記録
      </Link>
    </div>
  );
}
