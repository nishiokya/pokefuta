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
  MapPin,
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
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'title' | 'pokemons' | 'titles' | 'hashtags' | 'title_tags'> | null;
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

type GalleryTab = 'latest' | 'rare';
type JourneyTab = 'history' | 'unvisited';

const galleryTabs: Array<{ key: GalleryTab; label: string }> = [
  { key: 'latest', label: 'みんなの投稿写真' },
  { key: 'rare', label: '写真が少ないポケふた' },
];

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

const INTERNAL_TAG_LABELS: Record<string, string> = {
  unique_pokemon: '✨ このポケモンは全国でここだけ',
  rare_pokemon: '🗾 レアポケふた',
};

const safeTagLabel = (tag: string): string | null => {
  if (INTERNAL_TAG_LABELS[tag]) return INTERNAL_TAG_LABELS[tag];
  if (/^[a-z][a-z0-9_]{2,}$/.test(tag)) return null;
  return tag;
};

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
  const [galleryTab, setGalleryTab] = useState<GalleryTab>('latest');
  const [rareManholes, setRareManholes] = useState<JourneyManhole[]>([]);
  const [rareLoaded, setRareLoaded] = useState(false);
  const [rareLoading, setRareLoading] = useState(false);
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

    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const loggedIn = Boolean(session?.user);
        setIsLoggedIn(loggedIn);
        trackView('/', 'ポケふた写真館', 'gallery_index', loggedIn);
        trackCollectionOpen({ is_logged_in: loggedIn });
        if (loggedIn && session?.user?.id) {
          setUserName(getDisplayName(session));
          updateUserProperties({ registered_user: true });
          setLoading(false);
          loadJourney();
          const { data: myAppUserId } = await supabase
            .rpc('get_my_app_user_id' as never);
          setCurrentUserId((myAppUserId as string | null) ?? null);
        }
      } catch (error) {
        console.error('Session check error:', error);
        setIsLoggedIn(false);
        trackView('/', 'ポケふた写真館', 'gallery_index', false);
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
        `/api/visits?with_photos=true&limit=${feedPerPage}&offset=${offset}&order_by=created_at&include_manhole_tags=true`,
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

  const loadRareManholes = async () => {
    if (rareLoaded || rareLoading) return;
    setRareLoading(true);
    try {
      const response = await fetch('/api/manholes?no_photos=true&limit=500', { credentials: 'omit' });
      if (!response.ok) throw new Error('Failed to load rare manholes');
      const data = await response.json();
      const manholes: JourneyManhole[] = Array.isArray(data.manholes)
        ? data.manholes.sort((a: JourneyManhole, b: JourneyManhole) =>
            `${a.prefecture}${a.municipality ?? ''}`.localeCompare(
              `${b.prefecture}${b.municipality ?? ''}`, 'ja'
            )
          )
        : [];
      setRareManholes(manholes);
      setRareLoaded(true);
    } catch {
      setRareLoaded(true);
    } finally {
      setRareLoading(false);
    }
  };

  const selectGalleryTab = (tab: GalleryTab) => {
    setGalleryTab(tab);
    if (tab === 'rare') loadRareManholes();
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
                <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-4 py-3 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-8 sm:py-7">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="relative max-w-3xl">
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
                        <Sparkles className="h-3.5 w-3.5" />
                        ポケふたスタンプ帳
                      </div>
                      <h1 className="max-w-2xl text-2xl font-extrabold leading-tight tracking-normal sm:text-5xl">
                        ポケふた巡りを、あなただけのスタンプ帳に。
                      </h1>
                      <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-[#4A4A4A] sm:mt-4 sm:text-lg">
                        旅先で見つけたポケふたを写真と一緒に記録。訪問済みの場所やみんなの投稿写真を見ながら、ポケふた巡りを楽しく残しましょう。
                      </p>

                      {knownTotalManholes != null && knownTotalManholes > 0 && (
                        <p className="mt-2 hidden text-xs font-bold text-[#9B9B9B] sm:block">
                          全国{knownTotalManholes}枚以上のポケふたに対応
                          {totalPosts && totalPosts > 0 ? ` · 投稿写真${totalPosts}枚以上` : ''}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2 sm:mt-3">
                        <Link
                          href="/login"
                          className="inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299] sm:py-2.5"
                        >
                          <Stamp className="h-4 w-4" />
                          スタンプ帳をはじめる
                        </Link>
                        <Link
                          href="/nearby"
                          className="inline-flex items-center gap-2 rounded-lg border border-[#7B63A8]/30 bg-white/80 px-4 py-2 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-white sm:py-2.5"
                        >
                          <MapPin className="h-4 w-4" />
                          近くのポケふたを見る
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setGalleryTab('latest');
                            requestAnimationFrame(() =>
                              document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth' })
                            );
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-[#7B63A8]/30 bg-white/80 px-4 py-2 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-white sm:py-2.5"
                        >
                          <Camera className="h-4 w-4" />
                          みんなの写真を見る
                        </button>
                      </div>
                    </div>

                    <div className="hidden rotate-2 overflow-hidden rounded-[8px] border border-[#E2CFAE] bg-white p-2 shadow-lg lg:block">
                      <StampBookMockup />
                    </div>
                  </div>
                </section>

                <section className="mt-4 rounded-[8px] border border-[#7B63A8]/15 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#7B63A8]">無料でポケふたスタンプ帳を作れます</p>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs font-bold text-[#4A4A4A]">
                          <span>📍 行ったポケふたを記録</span>
                          <span>📸 写真で思い出を保存</span>
                          <span>🗾 都道府県の達成状況</span>
                          <span>🔍 近くの未訪問を探せる</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <Link
                          href="/login"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#7B63A8] px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299] whitespace-nowrap"
                        >
                          <Stamp className="h-3.5 w-3.5" />
                          無料ではじめる
                        </Link>
                        <a href="https://data.pokefuta.com" className="text-[10px] text-[#9B9B9B] underline hover:text-[#7B63A8]" target="_blank" rel="noopener noreferrer">
                          地図で探す → data.pokefuta.com
                        </a>
                      </div>
                    </div>
                </section>

                <section className="mt-4 sm:mt-5">
                  <div className="-mx-4 overflow-x-auto px-4 pb-1">
                    <div role="tablist" className="flex min-w-max gap-2 rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB]/80 p-1 shadow-sm sm:min-w-0">
                      {galleryTabs.map((tab) => {
                        const isActive = galleryTab === tab.key;
                        return (
                          <button
                            key={tab.key}
                            role="tab"
                            aria-selected={isActive}
                            type="button"
                            onClick={() => selectGalleryTab(tab.key)}
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

                {galleryTab === 'rare' && (
                  <section className="mt-6">
                    {rareLoading ? (
                      <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-10 text-center shadow-sm">
                        <p className="text-sm font-bold text-[#6B6B6B]">読み込み中…</p>
                      </div>
                    ) : rareManholes.length === 0 ? (
                      <div className="rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-5 py-10 text-center shadow-sm">
                        <p className="text-sm font-bold text-[#6B6B6B]">レアなポケふたが見つかりませんでした</p>
                      </div>
                    ) : (
                      <>
                        <p className="mb-3 text-xs font-bold text-[#6B6B6B]">
                          まだ誰も記録していないポケふた（{rareManholes.length}件）
                        </p>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5">
                          {rareManholes.map((manhole) => (
                            <RareManholeCard key={manhole.id} manhole={manhole} />
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                )}

                <section id="gallery" className="mt-6" style={{ display: galleryTab === 'latest' ? undefined : 'none' }}>
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

                        const commonAriaLabel = `${locationLabel}、撮影 ${formatDateJa(visit.shot_at)}`;
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
                              {(() => {
                                const tags = getManholeTags(visit.manhole, 2)
                                  .map(safeTagLabel)
                                  .filter(Boolean) as string[];
                                return tags.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {tags.map((tag) => (
                                      <span key={tag} className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                ) : null;
                              })()}
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
            {!isLoggedIn && galleryTab === 'latest' && showPagination && (
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

const MOCKUP_STAMPS = [
  { src: '/mockup/s1.jpeg', name: 'ルギア' },
  { src: '/mockup/s2.jpeg', name: 'ホエルオー' },
  { src: '/mockup/s3.jpeg', name: 'ロコン' },
];

const PREFECTURE_GRID: Array<{ short: string; state: 'complete' | 'partial' | 'empty'; title: string }> = [
  { short: '北海', state: 'complete', title: '北海道 制覇済み' },
  { short: '青森', state: 'complete', title: '青森県 制覇済み' },
  { short: '岩手', state: 'partial', title: '岩手県 訪問済み' },
  { short: '宮城', state: 'complete', title: '宮城県 制覇済み' },
  { short: '秋田', state: 'partial', title: '秋田県 訪問済み' },
  { short: '山形', state: 'empty', title: '山形県 未訪問' },
  { short: '福島', state: 'partial', title: '福島県 訪問済み' },
  { short: '茨城', state: 'partial', title: '茨城県 訪問済み' },
  { short: '栃木', state: 'empty', title: '栃木県 未訪問' },
  { short: '群馬', state: 'empty', title: '群馬県 未訪問' },
  { short: '埼玉', state: 'complete', title: '埼玉県 制覇済み' },
  { short: '千葉', state: 'complete', title: '千葉県 制覇済み' },
  { short: '東京', state: 'complete', title: '東京都 制覇済み' },
  { short: '神奈', state: 'complete', title: '神奈川県 制覇済み' },
  { short: '新潟', state: 'partial', title: '新潟県 訪問済み' },
  { short: '富山', state: 'empty', title: '富山県 未訪問' },
  { short: '石川', state: 'partial', title: '石川県 訪問済み' },
  { short: '福井', state: 'empty', title: '福井県 未訪問' },
  { short: '山梨', state: 'empty', title: '山梨県 未訪問' },
  { short: '長野', state: 'partial', title: '長野県 訪問済み' },
  { short: '岐阜', state: 'partial', title: '岐阜県 訪問済み' },
  { short: '静岡', state: 'complete', title: '静岡県 制覇済み' },
  { short: '愛知', state: 'complete', title: '愛知県 制覇済み' },
  { short: '三重', state: 'partial', title: '三重県 訪問済み' },
  { short: '滋賀', state: 'empty', title: '滋賀県 未訪問' },
  { short: '京都', state: 'complete', title: '京都府 制覇済み' },
  { short: '大阪', state: 'complete', title: '大阪府 制覇済み' },
  { short: '兵庫', state: 'complete', title: '兵庫県 制覇済み' },
  { short: '奈良', state: 'partial', title: '奈良県 訪問済み' },
  { short: '和歌', state: 'empty', title: '和歌山県 未訪問' },
  { short: '鳥取', state: 'empty', title: '鳥取県 未訪問' },
  { short: '島根', state: 'empty', title: '島根県 未訪問' },
  { short: '岡山', state: 'partial', title: '岡山県 訪問済み' },
  { short: '広島', state: 'complete', title: '広島県 制覇済み' },
  { short: '山口', state: 'partial', title: '山口県 訪問済み' },
  { short: '徳島', state: 'empty', title: '徳島県 未訪問' },
  { short: '香川', state: 'partial', title: '香川県 訪問済み' },
  { short: '愛媛', state: 'empty', title: '愛媛県 未訪問' },
  { short: '高知', state: 'empty', title: '高知県 未訪問' },
  { short: '福岡', state: 'complete', title: '福岡県 制覇済み' },
  { short: '佐賀', state: 'partial', title: '佐賀県 訪問済み' },
  { short: '長崎', state: 'partial', title: '長崎県 訪問済み' },
  { short: '熊本', state: 'partial', title: '熊本県 訪問済み' },
  { short: '大分', state: 'empty', title: '大分県 未訪問' },
  { short: '宮崎', state: 'empty', title: '宮崎県 未訪問' },
  { short: '鹿児', state: 'partial', title: '鹿児島県 訪問済み' },
  { short: '沖縄', state: 'complete', title: '沖縄県 制覇済み' },
];

const PREFECTURE_STATE_CLASS = {
  complete: 'bg-[#7B63A8] text-white',
  partial: 'bg-[#DDD0F5] text-[#7B63A8]',
  empty: 'bg-[#F0EEF5] text-[#C0B8D0]',
} as const;

function StampBookMockup() {
  return (
    <div className="overflow-hidden rounded-[10px] border-2 border-[#C9B8E8] bg-[#FFFDF7] text-xs">
      {/* Passport header */}
      <div className="flex items-center justify-between bg-[#7B63A8] px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-white">
          <Stamp className="h-3.5 w-3.5" />
          ポケふたパスポート
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[#FFB347] px-2 py-0.5 text-[9px] font-extrabold text-white">
          <Award className="h-2.5 w-2.5" />
          355達成!
        </div>
      </div>

      <div className="space-y-1.5 p-2.5">
        {/* 全国 + 都道府県コンプ + ポケモンコンプ 横並び */}
        <div className="flex gap-2 border-b border-dashed border-[#DDD0F5] pb-1.5">
          <div className="flex-1">
            <div className="text-[9px] font-bold text-[#9B9B9B]">全国</div>
            <div className="text-xl font-extrabold leading-tight text-[#7B63A8]">
              355<span className="ml-0.5 text-[9px] font-bold text-[#9B9B9B]">/470</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[9px] font-bold text-[#9B9B9B]">都道府県</div>
            <div className="text-xl font-extrabold leading-tight text-[#2C765E]">
              15<span className="ml-0.5 text-[9px] font-bold text-[#9B9B9B]">/47</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[9px] font-bold text-[#9B9B9B]">ポケモン</div>
            <div className="text-xl font-extrabold leading-tight text-[#FFB347]">
              42<span className="ml-0.5 text-[9px] font-bold text-[#9B9B9B]">/151</span>
            </div>
          </div>
        </div>

        {/* Recent 3 stamps with real photos */}
        <div>
          <div className="mb-0.5 text-[9px] font-extrabold text-[#6B6B6B]">最近集めたポケふた</div>
          <div className="flex gap-1">
            {MOCKUP_STAMPS.slice(0, 3).map(({ src, name }) => (
              <div key={src} className="flex flex-1 flex-col items-center gap-0.5">
                <div className="mx-auto h-[52px] w-[52px] overflow-hidden rounded-full border-2 border-[#7B63A8] shadow-sm">
                  <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </div>
                <span className="text-center text-[7px] font-bold leading-tight text-[#7B63A8]">{name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 都道府県達成 Grid */}
        <div className="border-t border-dashed border-[#DDD0F5] pt-2">
          <div className="mb-1 text-[9px] font-extrabold text-[#6B6B6B]">都道府県達成</div>
          <div className="flex flex-wrap gap-0.5">
            {PREFECTURE_GRID.map(({ short, state, title }) => (
              <div
                key={short}
                title={title}
                className={`rounded-sm px-[3px] py-[1px] text-[7px] font-bold leading-tight ${PREFECTURE_STATE_CLASS[state]}`}
              >
                {short}
              </div>
            ))}
          </div>
        </div>
      </div>
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

function RareManholeCard({ manhole }: { manhole: JourneyManhole }) {
  const tags = getManholeTags(manhole, 3);

  return (
    <Link
      href={`/manhole/${manhole.id}`}
      className="group relative flex min-h-[200px] flex-col justify-between overflow-hidden rounded-[8px] border-2 border-dashed border-[#7B63A8]/30 bg-[#F5F0FF] p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#FFB347]"
    >
      <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(90deg,#7B63A8_1px,transparent_1px),linear-gradient(#7B63A8_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="rounded-full bg-[#7B63A8]/15 px-2 py-1 text-[11px] font-extrabold text-[#7B63A8]">
          ✨ レアなポケふた
        </span>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-extrabold text-[#6B6B6B]">
          🗺️ 未踏の地
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center py-3">
        <div className="flex h-16 w-16 rotate-[-8deg] items-center justify-center rounded-full border-4 border-[#7B63A8]/30 text-[#7B63A8]/60">
          <MapPin className="h-7 w-7" />
        </div>
      </div>

      <div className="relative">
        <p className="line-clamp-1 text-sm font-extrabold text-[#2A2A2A]">
          {[manhole.prefecture, manhole.municipality].filter(Boolean).join(' ')}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {(tags.length > 0 ? tags : [getManholeTitle(manhole)])
            .map(safeTagLabel)
            .filter(Boolean)
            .slice(0, 3)
            .map((tag) => (
              <span key={tag!} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[#7B63A8]">
                {tag}
              </span>
            ))}
        </div>
      </div>
    </Link>
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
