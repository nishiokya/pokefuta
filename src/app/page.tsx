'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  MapPin,
  Navigation,
  PlusCircle,
  Sparkles,
  Stamp,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import PCShell from '@/components/PCShell';
import StampBookMockup from '@/components/StampBookMockup';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDateJa } from '@/lib/date';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

type FeedVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'building' | 'title' | 'pokemons' | 'titles' | 'hashtags' | 'title_tags'> | null;
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

const TOTAL_MANHOLES = 470;

const galleryTabs: Array<{ key: GalleryTab; label: string }> = [
  { key: 'latest', label: 'みんなの投稿写真' },
  { key: 'rare', label: '写真が少ないポケふた' },
];

type JourneyVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'building' | 'title' | 'pokemons' | 'titles' | 'hashtags' | 'title_tags'> | null;
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

const getDisplayName = (session: any) => {
  const metadataName = session?.user?.user_metadata?.display_name;
  const emailName = session?.user?.email?.split('@')[0];
  return metadataName || emailName || 'タコさん';
};

const getMunicipality = (manhole?: Pick<Manhole, 'municipality'> & { city?: string }) =>
  manhole?.city || manhole?.municipality || '場所未設定';

const getManholeTitle = (manhole?: Pick<Manhole, 'title' | 'municipality'> & { name?: string; city?: string }) =>
  manhole?.name || manhole?.title || getMunicipality(manhole);

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
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('タコさん');
  const [loading, setLoading] = useState(true);
  const [totalManholes, setTotalManholes] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [feed, setFeed] = useState<FeedVisit[]>([]);
  const [journeyVisits, setJourneyVisits] = useState<JourneyVisit[]>([]);
  const [journeyManholes, setJourneyManholes] = useState<JourneyManhole[]>([]);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const [manholesWithPhotos, setManholesWithPhotos] = useState<number | null>(null);
  const [galleryTab, setGalleryTab] = useState<GalleryTab>('latest');
  const [rareManholes, setRareManholes] = useState<JourneyManhole[]>([]);
  const [rareLoaded, setRareLoaded] = useState(false);
  const [rareLoading, setRareLoading] = useState(false);
  const feedPerPage = 24;
  const { trackView, trackCollectionOpen, updateUserProperties } = useAnalytics();

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
          router.replace('/my-trip');
          return;
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

    const prefectureProgress = Array.from(
      allJourneyManholes.reduce((map, manhole) => {
        const name = manhole.prefecture || '都道府県未設定';
        const current = map.get(name) ?? { totalIds: new Set<number>(), visitedIds: new Set<number>() };
        current.totalIds.add(manhole.id);
        if (visitsByManholeId.has(manhole.id)) current.visitedIds.add(manhole.id);
        map.set(name, current);
        return map;
      }, new Map<string, { totalIds: Set<number>; visitedIds: Set<number> }>())
    ).map(([name, value]) => {
      const total = value.totalIds.size;
      const visited = value.visitedIds.size;
      return { name, total, visited, remaining: Math.max(total - visited, 0) };
    });

    const visitedPrefectureCount = prefectureProgress.filter((p) => p.visited > 0).length;
    const allPokemonSpecies = new Set<string>(allJourneyManholes.flatMap((m) => m.pokemons ?? []));
    journeyVisits.forEach((v) => (v.manhole?.pokemons ?? []).forEach((p) => allPokemonSpecies.add(p)));
    const visitedPokemonSpeciesSet = new Set<string>(journeyVisits.flatMap((v) => v.manhole?.pokemons ?? []));
    const nextAchievement = prefectureProgress
      .filter((p) => p.visited > 0 && p.remaining > 0)
      .reduce<{ name: string; visited: number; total: number; remaining: number } | null>(
        (best, p) => (!best || p.remaining < best.remaining) ? p : best,
        null
      );

    return {
      visitsByManholeId,
      visitedCount: visitsByManholeId.size,
      visitedPrefectureCount,
      visitedPokemonSpecies: visitedPokemonSpeciesSet.size,
      totalPokemonSpecies: allPokemonSpecies.size,
      nextAchievement,
    };
  }, [journeyVisits, journeyManholes]);

  const {
    visitedCount,
    visitedPrefectureCount,
    visitedPokemonSpecies,
    totalPokemonSpecies,
    nextAchievement,
  } = journeyData;
  const completionRate = (visitedCount / TOTAL_MANHOLES) * 100;

  const visitsByMonth = useMemo(() => {
    const groups = new Map<string, JourneyVisit[]>();
    const sorted = [...journeyVisits].sort(
      (a, b) => new Date(b.shot_at).getTime() - new Date(a.shot_at).getTime()
    );
    for (const visit of sorted) {
      const date = new Date(visit.shot_at);
      if (isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}年${date.getMonth() + 1}月`;
      const group = groups.get(key);
      if (group) group.push(visit);
      else groups.set(key, [visit]);
    }
    return Array.from(groups.entries()).map(([label, visits]) => ({ label, visits }));
  }, [journeyVisits]);

  const journeyRail = (
    <section className="relative overflow-hidden rounded-lg border border-[#8C6A4A]/20 bg-[#FFF7E5] p-3 shadow-[0_12px_30px_rgba(95,68,42,0.13)]">
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="relative">
        <p className="font-pixelJp text-[11px] font-bold text-[#9B5C2E]">POKEFUTA PASSPORT</p>
        <h1 className="font-pixelJp text-base font-bold text-[#4F3828]">{userName}のポケふた旅</h1>

        <div className="mt-3 h-3 overflow-hidden rounded-sm border border-[#8C6A4A]/25 bg-[#E4D4B8]">
          <div
            className="h-full rounded-sm bg-gradient-to-r from-[#D94D3F] via-[#F1B642] to-[#3F9D7D] transition-all"
            style={{ width: `${Math.min(completionRate, 100)}%` }}
          />
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-[#8C6A4A]/15 bg-white/55">
          <div className="grid grid-cols-3 divide-x divide-[#8C6A4A]/15">
            <div className="px-3 py-2 text-center">
              <p className="font-pixelJp text-[10px] font-bold text-[#8C6A4A]">全国</p>
              <p className="mt-0.5 font-pixel text-sm font-bold text-[#4F3828]">{visitedCount}<span className="text-[#8C6A4A]">/{TOTAL_MANHOLES}</span></p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="font-pixelJp text-[10px] font-bold text-[#8C6A4A]">都道府県</p>
              <p className="mt-0.5 font-pixel text-sm font-bold text-[#4F3828]">{visitedPrefectureCount}<span className="text-[#8C6A4A]">/47</span></p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="font-pixelJp text-[10px] font-bold text-[#8C6A4A]">ポケモン</p>
              <p className="mt-0.5 font-pixel text-sm font-bold text-[#4F3828]">{visitedPokemonSpecies}<span className="text-[#8C6A4A]">/{totalPokemonSpecies}</span></p>
            </div>
          </div>
          {nextAchievement && (
            <div className="flex items-center justify-between gap-3 border-t border-[#8C6A4A]/15 px-3 py-2">
              <p className="font-pixelJp text-[10px] font-bold text-[#9B5C2E]">🎯 次の達成</p>
              <div className="flex items-center gap-2">
                <p className="font-pixelJp text-xs font-bold text-[#4F3828]">{nextAchievement.name}</p>
                <p className="font-pixel text-xs text-[#6A4D36]">{nextAchievement.visited}/{nextAchievement.total}</p>
                <span className="rounded bg-[#F8D9C4] px-1.5 py-0.5 font-pixelJp text-[10px] font-bold text-[#B5483C]">あと{nextAchievement.remaining}枚</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/upload"
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-[#B5483C] px-2 font-pixelJp text-xs font-bold text-white"
          >
            <PlusCircle className="h-3.5 w-3.5 shrink-0" />
            訪問を記録
          </Link>
          <Link
            href="/visits"
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-[#8C6A4A]/25 bg-white px-2 font-pixelJp text-xs font-bold text-[#4F3828]"
          >
            <Stamp className="h-3.5 w-3.5 shrink-0" />
            スタンプ帳
          </Link>
          <Link
            href="/nearby"
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-[#8C6A4A]/25 bg-white px-2 font-pixelJp text-xs font-bold text-[#4F3828]"
          >
            <Navigation className="h-3.5 w-3.5 shrink-0" />
            近くを探す
          </Link>
        </div>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC] text-[#2A2A2A]">
      <div className="lg:hidden">
        <Header title="ポケふた写真館" />
      </div>

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

      {!loading && isLoggedIn && (
        <PCShell active="mytrip" rail={journeyRail} className="pb-[10rem] pt-5 sm:pt-8">
          <section>
            {visitsByMonth.length === 0 ? (
              <JourneyEmptyState
                title="まだ訪問履歴がありません"
                description="最初の訪問を記録すると、ここに写真つきの旅のアルバムが育っていきます。"
                uploadHref={uploadHref}
              />
            ) : (
              <div className="space-y-8">
                {visitsByMonth.map(({ label, visits }) => (
                  <VisitMonthGroup key={label} label={label} visits={visits} />
                ))}
              </div>
            )}
          </section>
        </PCShell>
      )}

      {!loading && !isLoggedIn && (
        <main className="mx-auto max-w-6xl px-4 pt-5 pb-6 sm:pt-8">
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
                        const locationLabel = visit.manhole?.building
                          ? [visit.manhole.municipality, visit.manhole.building].filter(Boolean).join('・')
                          : [visit.manhole?.prefecture, visit.manhole?.municipality].filter(Boolean).join(' ') || visit.shot_location || '';
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
        </main>
      )}

      {isLoggedIn && (
        <div className="fixed inset-x-0 bottom-[4.6rem] z-30 px-4 lg:hidden">
          <div className="mx-auto flex max-w-6xl gap-2 rounded-lg border border-[#8C6A4A]/20 bg-[#FFF7E5]/95 p-2 shadow-lg backdrop-blur">
            <Link href="/upload" className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md bg-[#B5483C] px-3 font-pixelJp text-xs font-bold text-white">
              <PlusCircle className="h-4 w-4" />
              訪問を記録
            </Link>
            <Link href="/visits" className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md border border-[#8C6A4A]/25 bg-white px-3 font-pixelJp text-xs font-bold text-[#4F3828]">
              <Stamp className="h-4 w-4" />
              スタンプ帳
            </Link>
          </div>
        </div>
      )}

      <BottomNav />
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
          {manhole.prefecture}{manhole.municipality ? ` ${manhole.municipality}` : ''}
        </p>
        {manhole.building && (
          <p className="line-clamp-1 text-xs font-bold text-[#6B6B6B]">{manhole.building}</p>
        )}
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

function VisitMonthGroup({ label, visits }: { label: string; visits: JourneyVisit[] }) {
  const photoVisits = visits.filter((v) => v.photos.length > 0);
  const noPhotoVisits = visits.filter((v) => v.photos.length === 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <p className="text-sm font-extrabold text-[#4F3828]">{label}</p>
        <span className="rounded-full bg-[#E9DEC9] px-2 py-0.5 text-xs font-bold text-[#6A4D36]">{visits.length}件</span>
      </div>
      {photoVisits.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photoVisits.map((visit) => (
            <VisitHistoryCard key={visit.id} visit={visit} hasPhoto />
          ))}
        </div>
      )}
      {noPhotoVisits.length > 0 && (
        <div className={`${photoVisits.length > 0 ? 'mt-3' : ''} space-y-2`}>
          {noPhotoVisits.map((visit) => (
            <VisitHistoryCard key={visit.id} visit={visit} hasPhoto={false} />
          ))}
        </div>
      )}
    </div>
  );
}

function VisitHistoryCard({ visit, hasPhoto }: { visit: JourneyVisit; hasPhoto: boolean }) {
  const photo = visit.photos[0];
  const manhole = visit.manhole;
  const manholeId = manhole?.id ?? visit.manhole_id;
  const location = manhole?.building
    ? [manhole.municipality, manhole.building].filter(Boolean).join('・')
    : [manhole?.prefecture, manhole?.municipality].filter(Boolean).join(' ') || 'ポケふた';
  const tags = getManholeTags(manhole, 3).map(safeTagLabel).filter(Boolean) as string[];

  if (!hasPhoto) {
    const compactContent = (
      <>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#B8AB96] bg-[#E9DEC9]">
          <Stamp className="h-4 w-4 text-[#A39580]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-extrabold text-[#4F3828]">{location}</p>
          <p className="text-xs font-bold text-[#B5483C]">{formatDateJa(visit.shot_at)}</p>
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.slice(0, 2).map((tag) => (
                <span key={tag} className="rounded-full border border-[#8C6A4A]/15 bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-[#6A4D36]">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </>
    );
    if (manholeId) {
      return (
        <Link
          href={`/manhole/${manholeId}`}
          className="flex items-center gap-3 rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] px-3 py-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#DDA63A]"
        >
          {compactContent}
        </Link>
      );
    }
    return (
      <div className="flex items-center gap-3 rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] px-3 py-2 shadow-sm">
        {compactContent}
      </div>
    );
  }

  const photoCardContent = (
    <>
      <div className="relative aspect-square overflow-hidden bg-[#E9DEC9]">
        {photo?.thumbnail_url ? (
          <img
            src={photo.thumbnail_url}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CircleDot className="h-8 w-8 text-[#B8AB96]" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 pt-8">
          <p className="line-clamp-1 text-xs font-extrabold text-white">{location}</p>
          <p className="text-[10px] font-bold text-white/80">{formatDateJa(visit.shot_at)}</p>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 p-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[#8C6A4A]/15 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[#6A4D36]">
              {tag}
            </span>
          ))}
        </div>
      )}
    </>
  );

  if (manholeId) {
    return (
      <Link
        href={`/manhole/${manholeId}`}
        className="group overflow-hidden rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#DDA63A]"
      >
        {photoCardContent}
      </Link>
    );
  }
  return (
    <div className="overflow-hidden rounded-[8px] border border-[#8C6A4A]/15 bg-[#FFF7E5] shadow-sm">
      {photoCardContent}
    </div>
  );
}
