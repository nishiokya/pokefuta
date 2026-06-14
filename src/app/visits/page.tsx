'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  Calendar,
  Camera,
  CheckCircle2,
  CircleDot,
  Heart,
  MapPin,
  Navigation,
  PlusCircle,
  Sparkles,
  Stamp,
  Target,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import PCShell from '@/components/PCShell';
import DeletePhotoModal from '@/components/DeletePhotoModal';
import ShareButtons from '@/components/ShareButtons';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { visitsShareText } from '@/lib/share';

interface Visit {
  id: string;
  manhole: Manhole;
  visited_at: string;
  photos: {
    id: string;
    url: string;
    thumbnail_url: string;
  }[];
  notes?: string;
  comment?: string;
  likes_count: number;
  is_liked: boolean;
  comments_count: number;
  is_bookmarked: boolean;
}

type SegmentTab = 'all' | 'prefectures' | 'pokemons' | 'features';

type VisitSummary = {
  count: number;
  latestVisit: Visit;
  hasPhotos: boolean;
};

type PrefectureProgress = {
  name: string;
  total: number;
  visited: number;
  remaining: number;
  rate: number;
  representativePhotoUrl: string | null;
};

type PokemonProgress = {
  pokemonName: string;
  totalManholes: number;
  visitedManholes: number;
  remaining: number;
  rate: number;
  representativePhotoUrl: string | null;
};

type HashtagProgress = {
  tag: string;
  total: number;
  visited: number;
  remaining: number;
  rate: number;
};

type NearCompleteItem = {
  kind: 'pref' | 'pokemon' | 'feature';
  label: string;
  remaining: number;
  visited: number;
  total: number;
  rate: number;
};

const TOTAL_MANHOLES = 470;

const KIND_COLOR: Record<NearCompleteItem['kind'], { badge: string; bar: string; bg: string }> = {
  pref:    { badge: '#9a6d05', bar: '#e2a015', bg: '#f6e4b6' },
  pokemon: { badge: '#9a6d05', bar: '#e2a015', bg: '#f6e4b6' },
  feature: { badge: '#1f9d63', bar: '#1f9d63', bg: '#e2f2e9' },
};

const segments: { id: SegmentTab; label: string }[] = [
  { id: 'all', label: 'ぜんぶ' },
  { id: 'prefectures', label: '都道府県' },
  { id: 'pokemons', label: 'ポケモン' },
  { id: 'features', label: '特徴' },
];

const formatVisitDate = (date: string, pattern = 'yyyy/MM/dd') => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '日付なし';
  return format(parsed, pattern, { locale: ja });
};

const getManholeName = (manhole: Manhole) => manhole.name || manhole.title || 'ポケふた';
const getMunicipality = (manhole: Manhole) => manhole.city || manhole.municipality || '場所未設定';

export default function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [manholes, setManholes] = useState<Manhole[]>([]);
  const [totalManholes, setTotalManholes] = useState<number | null>(null);
  const [segmentTab, setSegmentTab] = useState<SegmentTab>('all');
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sampleVisits, setSampleVisits] = useState<Array<{ id: string; thumbnail_url: string | null; location: string }>>([]);
  const { trackView, trackPassportOpen } = useAnalytics();

  useEffect(() => {
    document.title = 'スタンプ帳 - ポケふたマップ';
    trackPassportOpen();
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const loggedIn = Boolean(session?.user);
      setIsLoggedIn(loggedIn);
      trackView('/visits', 'ポケふた訪問パスポート', 'visits', loggedIn);

      if (loggedIn) {
        loadPassport();
      } else {
        // Load only basic manhole data for preview
        loadManholesOnly();
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsLoggedIn(false);
      trackView('/visits', 'ポケふた訪問パスポート', 'visits', false);
      loadManholesOnly();
    }
  };

  const loadManholesOnly = async () => {
    try {
      const [manholesRes, visitsRes] = await Promise.all([
        fetch('/api/manholes?limit=1000'),
        fetch('/api/visits?with_photos=true&limit=6&order_by=created_at', { credentials: 'omit' }),
      ]);
      if (manholesRes.ok) {
        const data = await manholesRes.json();
        const apiManholes: Manhole[] = Array.isArray(data.manholes)
          ? data.manholes.map((manhole: any) => ({
              ...manhole,
              name: manhole.name || manhole.title,
              city: manhole.city || manhole.municipality,
            }))
          : [];
        setManholes(apiManholes);
        setTotalManholes(typeof data.total === 'number' ? data.total : apiManholes.length || null);
      }
      if (visitsRes.ok) {
        const data = await visitsRes.json();
        if (data.success && Array.isArray(data.visits)) {
          setSampleVisits(
            data.visits.map((v: any) => ({
              id: v.id,
              thumbnail_url: v.photos?.[0]?.thumbnail_url ?? null,
              location: v.manhole?.building
                ? [v.manhole.municipality, v.manhole.building].filter(Boolean).join('・')
                : [v.manhole?.prefecture, v.manhole?.municipality].filter(Boolean).join(' ') || 'ポケふた',
            }))
          );
        }
      }
    } catch (error) {
      console.error('Failed to load manholes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPassport = async () => {
    try {
      const [visitsResponse, manholesResponse] = await Promise.all([
        fetch('/api/visits?limit=1000'),
        fetch('/api/manholes?limit=1000'),
      ]);

      if (visitsResponse.ok) {
        const data = await visitsResponse.json();

        if (data.success && data.visits) {
          const apiVisits: Visit[] = data.visits
            .filter((visit: any) => visit.manhole && visit.manhole.id)
            .map((visit: any) => ({
              id: visit.id,
              manhole: {
                id: visit.manhole.id,
                title: visit.manhole.title || 'ポケふた',
                prefecture: visit.manhole.prefecture || '',
                municipality: visit.manhole.municipality || null,
                location: visit.manhole.location || '',
                pokemons: visit.manhole.pokemons || [],
                name: visit.manhole.title,
                description: visit.note,
                city: visit.manhole.municipality,
                created_at: visit.created_at,
                updated_at: visit.updated_at,
                detail_url: visit.manhole.detail_url || null,
                prefecture_site_url: visit.manhole.prefecture_site_url || null,
              },
              visited_at: visit.shot_at,
              photos: visit.photos?.map((photo: any) => ({
                id: photo.id,
                url: photo.url,
                thumbnail_url: photo.thumbnail_url,
              })) || [],
              notes: visit.note,
              comment: visit.comment,
              likes_count: visit.likes_count || 0,
              is_liked: visit.is_liked || false,
              comments_count: visit.comments_count || 0,
              is_bookmarked: visit.is_bookmarked || false,
            }));

          setVisits(apiVisits);
        }
      }

      if (manholesResponse.ok) {
        const data = await manholesResponse.json();
        const apiManholes: Manhole[] = Array.isArray(data.manholes)
          ? data.manholes.map((manhole: any) => ({
              ...manhole,
              name: manhole.name || manhole.title,
              city: manhole.city || manhole.municipality,
            }))
          : [];

        setManholes(apiManholes);
        setTotalManholes(typeof data.total === 'number' ? data.total : apiManholes.length || null);
      }
    } catch (error) {
      console.error('Failed to load passport:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortedVisits = useMemo(
    () => [...visits].sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime()),
    [visits]
  );

  const visitSummaryByManholeId = useMemo(() => {
    const summary = new Map<number, VisitSummary>();

    sortedVisits.forEach((visit) => {
      const manholeId = visit.manhole?.id;
      if (typeof manholeId !== 'number') return;

      const current = summary.get(manholeId);
      summary.set(manholeId, {
        count: (current?.count || 0) + 1,
        latestVisit: current?.latestVisit || visit,
        hasPhotos: Boolean(current?.hasPhotos || visit.photos.length > 0),
      });
    });

    return summary;
  }, [sortedVisits]);

  const visitedManholesCount = visitSummaryByManholeId.size;
  const completionRate = (visitedManholesCount / TOTAL_MANHOLES) * 100;

  const visitedMunicipalityCount = useMemo(() => {
    return new Set(
      visits
        .map((visit) => {
          const prefecture = visit.manhole?.prefecture?.trim();
          const municipality = getMunicipality(visit.manhole).trim();
          return prefecture && municipality ? `${prefecture}-${municipality}` : null;
        })
        .filter((value): value is string => Boolean(value))
    ).size;
  }, [visits]);

  const passportManholes = useMemo(() => {
    const byId = new Map<number, Manhole>();

    manholes.forEach((manhole) => {
      byId.set(manhole.id, manhole);
    });

    visits.forEach((visit) => {
      if (!byId.has(visit.manhole.id)) {
        byId.set(visit.manhole.id, visit.manhole);
      }
    });

    return Array.from(byId.values()).sort((a, b) => {
      const aSummary = visitSummaryByManholeId.get(a.id);
      const bSummary = visitSummaryByManholeId.get(b.id);

      if (aSummary && bSummary) {
        return new Date(bSummary.latestVisit.visited_at).getTime() - new Date(aSummary.latestVisit.visited_at).getTime();
      }

      if (aSummary) return -1;
      if (bSummary) return 1;

      return `${a.prefecture}${getMunicipality(a)}${a.id}`.localeCompare(`${b.prefecture}${getMunicipality(b)}${b.id}`, 'ja');
    });
  }, [manholes, visits, visitSummaryByManholeId]);

  const prefectureProgress = useMemo<PrefectureProgress[]>(() => {
    const progress = new Map<string, { totalIds: Set<number>; visitedIds: Set<number>; representativeManholeId: number | null }>();

    passportManholes.forEach((manhole) => {
      const prefecture = manhole.prefecture || '都道府県未設定';
      const current = progress.get(prefecture) || { totalIds: new Set<number>(), visitedIds: new Set<number>(), representativeManholeId: null };
      current.totalIds.add(manhole.id);

      if (visitSummaryByManholeId.has(manhole.id)) {
        current.visitedIds.add(manhole.id);
        if (current.representativeManholeId === null) {
          current.representativeManholeId = manhole.id;
        }
      }

      progress.set(prefecture, current);
    });

    return Array.from(progress.entries())
      .map(([name, value]) => {
        const total = value.totalIds.size;
        const visited = value.visitedIds.size;
        const representativePhotoUrl = value.representativeManholeId !== null
          ? (visitSummaryByManholeId.get(value.representativeManholeId)?.latestVisit.photos[0]?.thumbnail_url ?? null)
          : null;
        return {
          name,
          total,
          visited,
          remaining: Math.max(total - visited, 0),
          rate: total > 0 ? (visited / total) * 100 : 0,
          representativePhotoUrl,
        };
      })
      .sort((a, b) => {
        if (b.visited !== a.visited) return b.visited - a.visited;
        if (b.rate !== a.rate) return b.rate - a.rate;
        return a.name.localeCompare(b.name, 'ja');
      });
  }, [passportManholes, visitSummaryByManholeId]);

  const pokemonProgress = useMemo<PokemonProgress[]>(() => {
    const progress = new Map<string, {
      totalIds: Set<number>;
      visitedIds: Set<number>;
      bestVisitedManhole: { id: number; pokemonCount: number } | null;
    }>();

    passportManholes.forEach((manhole) => {
      (manhole.pokemons ?? []).forEach((pokemonName) => {
        const current = progress.get(pokemonName) ?? { totalIds: new Set<number>(), visitedIds: new Set<number>(), bestVisitedManhole: null };
        current.totalIds.add(manhole.id);
        if (visitSummaryByManholeId.has(manhole.id)) {
          current.visitedIds.add(manhole.id);
          const pokemonCount = (manhole.pokemons ?? []).length;
          if (!current.bestVisitedManhole || pokemonCount < current.bestVisitedManhole.pokemonCount) {
            current.bestVisitedManhole = { id: manhole.id, pokemonCount };
          }
        }
        progress.set(pokemonName, current);
      });
    });

    return Array.from(progress.entries())
      .map(([pokemonName, value]) => {
        const totalManholes = value.totalIds.size;
        const visitedManholes = value.visitedIds.size;
        const representativePhotoUrl = value.bestVisitedManhole
          ? (visitSummaryByManholeId.get(value.bestVisitedManhole.id)?.latestVisit.photos[0]?.thumbnail_url ?? null)
          : null;
        return {
          pokemonName,
          totalManholes,
          visitedManholes,
          remaining: Math.max(totalManholes - visitedManholes, 0),
          rate: totalManholes > 0 ? (visitedManholes / totalManholes) * 100 : 0,
          representativePhotoUrl,
        };
      })
      .sort((a, b) => {
        const aV = a.visitedManholes > 0 ? 0 : 1;
        const bV = b.visitedManholes > 0 ? 0 : 1;
        if (aV !== bV) return aV - bV;
        if (a.remaining !== b.remaining) return a.remaining - b.remaining;
        if (b.visitedManholes !== a.visitedManholes) return b.visitedManholes - a.visitedManholes;
        if (b.totalManholes !== a.totalManholes) return b.totalManholes - a.totalManholes;
        return a.pokemonName.localeCompare(b.pokemonName, 'ja');
      });
  }, [passportManholes, visitSummaryByManholeId]);

  const visitedPokemonSpecies = pokemonProgress.filter((p) => p.visitedManholes > 0).length;
  const totalPokemonSpecies = pokemonProgress.length;
  const pokemonCompletionRate = totalPokemonSpecies > 0 ? (visitedPokemonSpecies / totalPokemonSpecies) * 100 : 0;

  const [hashtagProgress, totalAllHashtags] = useMemo<[HashtagProgress[], number]>(() => {
    const progress = new Map<string, { totalIds: Set<number>; visitedIds: Set<number> }>();
    passportManholes.forEach((manhole) => {
      const tags = [...(manhole.hashtags ?? [])];
      tags.forEach((tag) => {
        if (!tag) return;
        const current = progress.get(tag) ?? { totalIds: new Set<number>(), visitedIds: new Set<number>() };
        current.totalIds.add(manhole.id);
        if (visitSummaryByManholeId.has(manhole.id)) current.visitedIds.add(manhole.id);
        progress.set(tag, current);
      });
    });
    const items = Array.from(progress.entries())
      .map(([tag, v]) => ({
        tag,
        total: v.totalIds.size,
        visited: v.visitedIds.size,
        remaining: v.totalIds.size - v.visitedIds.size,
        rate: v.totalIds.size > 0 ? (v.visitedIds.size / v.totalIds.size) * 100 : 0,
      }))
      .filter((h) => h.visited > 0)
      .sort((a, b) => a.remaining - b.remaining || b.visited - a.visited);
    return [items, progress.size];
  }, [passportManholes, visitSummaryByManholeId]);

  const nextAchievementPrefecture = prefectureProgress
    .filter((p) => p.visited > 0 && p.remaining > 0)
    .reduce<PrefectureProgress | null>((best, p) => (!best || p.remaining < best.remaining) ? p : best, null);

  const nearCompletePrefectures = useMemo(
    () => prefectureProgress.filter((p) => p.visited > 0 && p.remaining > 0 && p.remaining <= 3)
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, 5),
    [prefectureProgress]
  );

  const nearCompleteAll = useMemo<NearCompleteItem[]>(() => {
    const items: NearCompleteItem[] = [
      ...nearCompletePrefectures.map((p) => ({
        kind: 'pref' as const,
        label: `${p.name}完成`,
        remaining: p.remaining,
        visited: p.visited,
        total: p.total,
        rate: p.rate,
      })),
      ...pokemonProgress
        .filter((p) => p.visitedManholes > 0 && p.remaining > 0 && p.remaining <= 3)
        .slice(0, 3)
        .map((p) => ({
          kind: 'pokemon' as const,
          label: `${p.pokemonName}完成`,
          remaining: p.remaining,
          visited: p.visitedManholes,
          total: p.totalManholes,
          rate: p.rate,
        })),
      ...hashtagProgress
        .filter((h) => h.remaining > 0 && h.remaining <= 2)
        .slice(0, 2)
        .map((h) => ({
          kind: 'feature' as const,
          label: `${h.tag}制覇`,
          remaining: h.remaining,
          visited: h.visited,
          total: h.total,
          rate: h.rate,
        })),
    ];
    return items.sort((a, b) => a.remaining - b.remaining).slice(0, 8);
  }, [nearCompletePrefectures, pokemonProgress, hashtagProgress]);

  const visitedManholesForDex = useMemo(
    () => passportManholes
      .filter((m) => visitSummaryByManholeId.has(m.id))
      .map((m) => ({
        id: m.id,
        name: getManholeName(m),
        thumbUrl: visitSummaryByManholeId.get(m.id)?.latestVisit.photos[0]?.thumbnail_url ?? null,
      })),
    [passportManholes, visitSummaryByManholeId]
  );

  const thisMonthVisitedCount = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const seen = new Set<number>();
    sortedVisits.forEach((v) => {
      const d = new Date(v.visited_at);
      if (isNaN(d.getTime())) return;
      const vym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (vym === ym) seen.add(v.manhole.id);
    });
    return seen.size;
  }, [sortedVisits]);

  const visitedPrefectureCount = prefectureProgress.filter((p) => p.visited > 0).length;
  const visitedFeaturesCount = hashtagProgress.length;

  const handleDeleteClick = (photoId: string, visitId: string) => {
    setSelectedPhotoId(photoId);
    setSelectedVisitId(visitId);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPhotoId || !selectedVisitId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/visits/${selectedVisitId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const deletedPhotoIds = new Set<string>(data.photo_ids || [selectedPhotoId]);
        const deletedVisitId = data.visit_id;
        const updatedVisits = visits
          .filter((visit) => visit.id !== deletedVisitId)
          .map((visit) => ({
            ...visit,
            photos: visit.photos.filter((photo) => !deletedPhotoIds.has(photo.id)),
          }));

        setVisits(updatedVisits);
        setDeleteModalOpen(false);
        setSelectedPhotoId(null);
        setSelectedVisitId(null);
        alert(data.visit_deleted ? '写真と訪問記録を削除しました' : '写真を削除しました');
      } else {
        console.error('Failed to delete photo:', data);
        alert(`削除に失敗しました: ${data.error || '不明なエラー'}`);
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('削除中にエラーが発生しました');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setSelectedPhotoId(null);
    setSelectedVisitId(null);
  };

  const handleLikeToggle = async (visitId: string) => {
    const visit = visits.find((target) => target.id === visitId);
    if (!visit) return;

    const isLiked = visit.is_liked;
    const method = isLiked ? 'DELETE' : 'POST';

    setVisits((prevVisits) => prevVisits.map((target) =>
      target.id === visitId
        ? {
            ...target,
            is_liked: !isLiked,
            likes_count: isLiked ? target.likes_count - 1 : target.likes_count + 1,
          }
        : target
    ));

    try {
      const response = await fetch(`/api/visits/${visitId}/like`, { method });

      if (!response.ok) {
        setVisits((prevVisits) => prevVisits.map((target) =>
          target.id === visitId
            ? {
                ...target,
                is_liked: isLiked,
                likes_count: isLiked ? target.likes_count + 1 : target.likes_count - 1,
              }
            : target
        ));
        console.error('Failed to toggle like');
      }
    } catch (error) {
      setVisits((prevVisits) => prevVisits.map((target) =>
        target.id === visitId
          ? {
              ...target,
              is_liked: isLiked,
              likes_count: isLiked ? target.likes_count + 1 : target.likes_count - 1,
            }
          : target
      ));
      console.error('Error toggling like:', error);
    }
  };

  const handleBookmarkToggle = async (visitId: string) => {
    const visit = visits.find((target) => target.id === visitId);
    if (!visit) return;

    const isBookmarked = visit.is_bookmarked;
    const method = isBookmarked ? 'DELETE' : 'POST';

    setVisits((prevVisits) => prevVisits.map((target) =>
      target.id === visitId ? { ...target, is_bookmarked: !isBookmarked } : target
    ));

    try {
      const response = await fetch(`/api/visits/${visitId}/bookmark`, { method });

      if (!response.ok) {
        setVisits((prevVisits) => prevVisits.map((target) =>
          target.id === visitId ? { ...target, is_bookmarked: isBookmarked } : target
        ));
        console.error('Failed to toggle bookmark');
      }
    } catch (error) {
      setVisits((prevVisits) => prevVisits.map((target) =>
        target.id === visitId ? { ...target, is_bookmarked: isBookmarked } : target
      ));
      console.error('Error toggling bookmark:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen safe-area-inset bg-[#F3E7CC] flex items-center justify-center">
        <div className="text-center">
          <div className="font-pixelJp text-[#6A4D36]">
            パスポート準備中<span className="rpg-loading"></span>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated preview mode
  if (!isLoggedIn) {
    const prefectureCount = manholes.length > 0
      ? new Set(manholes.map((m) => m.prefecture).filter(Boolean)).size
      : null;
    const pokemonCount = manholes.length > 0
      ? new Set(manholes.flatMap((m) => m.pokemons ?? [])).size
      : null;

    const unAuthRail = (
      <div className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm space-y-3">
        <p className="font-bold text-sm text-[#7B63A8]">あなた専用のスタンプ帳を無料で作れます</p>
        <Link
          href="/signup"
          className="flex items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-3 text-sm font-bold text-white shadow-[0_2px_0_#5f55b8] transition hover:bg-[#6A5299]"
        >
          <Stamp className="h-4 w-4" /> 無料でスタンプ帳を作る
        </Link>
        <Link
          href="/nearby"
          className="flex items-center justify-center gap-2 rounded-lg border border-[#7B63A8]/30 bg-white px-4 py-2 text-sm font-bold text-[#7B63A8]"
        >
          <MapPin className="h-4 w-4" /> 近くのポケふたを探す
        </Link>
      </div>
    );

    return (
      <div className="min-h-screen safe-area-inset bg-[#F3E7CC] pb-nav-safe">
        <div className="lg:hidden">
          <Header title="スタンプ帳" />
        </div>

        <PCShell active="stamp" rail={unAuthRail} className="pb-32 pt-5 lg:pt-6">
        <main className="space-y-4">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-[8px] border border-[#7B63A8]/15 bg-[#FFF8EB] px-4 py-3 shadow-[0_8px_24px_rgba(123,99,168,0.10)] sm:px-8 sm:py-7">
            <div className="relative max-w-3xl">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-3 py-1 text-xs font-bold text-[#7B63A8]">
                  <Sparkles className="h-3.5 w-3.5" />
                  ポケふたスタンプ帳
                </div>
                <h1 className="max-w-2xl text-2xl font-extrabold leading-tight tracking-normal sm:text-4xl">
                  ポケふた訪問パスポート
                </h1>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[#4A4A4A] sm:mt-3 sm:text-base">
                  あなた専用のスタンプ帳を無料で作れます
                </p>

                {/* Stats row */}
                <div className="mt-3 flex flex-wrap gap-4 sm:mt-4">
                  <div>
                    <span className="font-pixel text-2xl font-extrabold text-[#7B63A8]">{totalManholes ?? '470'}</span>
                    <span className="ml-1 text-xs font-bold text-[#9B9B9B]">全国のポケふた</span>
                  </div>
                  <div>
                    <span className="font-pixel text-2xl font-extrabold text-[#2C765E]">{prefectureCount ?? '41'}</span>
                    <span className="ml-1 text-xs font-bold text-[#9B9B9B]">都道府県</span>
                  </div>
                  <div>
                    <span className="font-pixel text-2xl font-extrabold text-[#FFB347]">{pokemonCount ?? '534'}</span>
                    <span className="ml-1 text-xs font-bold text-[#9B9B9B]">種類のポケモン</span>
                  </div>
                </div>

                {/* CTA Buttons */}
                <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#6A5299] sm:py-2.5"
                  >
                    <Stamp className="h-4 w-4" />
                    無料でスタンプ帳を作る
                  </Link>
                  <Link
                    href="/nearby"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#7B63A8]/30 bg-white/80 px-4 py-2 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-white sm:py-2.5"
                  >
                    <MapPin className="h-4 w-4" />
                    近くのポケふたを探す
                  </Link>
                </div>
              </div>
          </section>

          {/* 旅を続けると… モックカード */}
          <section className="rounded-[8px] border border-[#7B63A8]/15 bg-white/80 px-4 py-4 shadow-sm sm:px-6">
            <p className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-[#9B9B9B]">
              旅を続けると…
              <span className="rounded border border-[#D8CCAE] px-1.5 py-0.5 text-[10px] font-bold text-[#9B9B9B] normal-case tracking-normal">例</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-[#F5F0FF] px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-[#9B9B9B]">全国</p>
                <p className="font-pixel text-xl font-extrabold text-[#7B63A8]">
                  80<span className="text-[11px] font-bold text-[#C0B8D0]">/{totalManholes ?? '470'}</span>
                </p>
              </div>
              <div className="rounded-lg bg-[#EDFAF5] px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-[#9B9B9B]">都道府県</p>
                <p className="font-pixel text-xl font-extrabold text-[#2C765E]">
                  10<span className="text-[11px] font-bold text-[#A8D5C4]">/{prefectureCount ?? '41'}</span>
                </p>
              </div>
              <div className="rounded-lg bg-[#FFF8EB] px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-[#9B9B9B]">ポケモン</p>
                <p className="font-pixel text-xl font-extrabold text-[#C87C2A]">
                  104<span className="text-[11px] font-bold text-[#D4BC8A]">/{pokemonCount ?? '534'}</span>
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#DDD0F5] px-2.5 py-1 text-xs font-bold text-[#7B63A8]">
                <Stamp className="h-3 w-3" />
                岐阜県 あと2枚で制覇
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#DDD0F5] px-2.5 py-1 text-xs font-bold text-[#7B63A8]">
                <Stamp className="h-3 w-3" />
                ニンフィア 4/6 収集中
              </span>
            </div>
          </section>

          {/* 旅写真プレビュー */}
          {sampleVisits.length > 0 && (
            <section className="rounded-[8px] border border-[#8C6A4A]/15 bg-white/70 p-4">
              <h3 className="mb-3 font-pixelJp text-sm font-bold text-[#4F3828]">みんなの旅写真</h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {sampleVisits.slice(0, 6).map((sv) => (
                  <div
                    key={sv.id}
                    className="relative aspect-square overflow-hidden rounded-lg border border-[#8C6A4A]/20 bg-[#E9DEC9]"
                  >
                    {sv.thumbnail_url ? (
                      <img
                        src={sv.thumbnail_url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Stamp className="h-6 w-6 text-[#B8AB96]" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                      <p className="line-clamp-1 text-[9px] font-bold text-white">{sv.location}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-[#6A4D36]">
                登録すると、あなたの旅写真もここに残せます
              </p>
            </section>
          )}
        </main>
        </PCShell>

        <BottomNav />
      </div>
    );
  }

  const visitsRail = (
    <div className="space-y-3">
      {/* PHOTO DEX — collection dashboard (A案: 二極ヘッダー) */}
      <DexSummaryCard
        got={visitedManholesCount}
        total={TOTAL_MANHOLES}
        completionRate={completionRate}
        remain={TOTAL_MANHOLES - visitedManholesCount}
        pref={{ cur: visitedPrefectureCount, total: 47 }}
        poke={{ cur: visitedPokemonSpecies, total: totalPokemonSpecies }}
        feat={{ cur: visitedFeaturesCount, total: totalAllHashtags }}
      />

      {/* Mini stamp wall (6-column × 4 rows = 24 cells) */}
      {visitedManholesForDex.length > 0 && (
        <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-3 shadow-sm">
          <p style={{ fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', fontSize: 10, fontWeight: 800, color: '#6A4D36', marginBottom: 8 }}>集めたスタンプ</p>
          <div className="grid grid-cols-6 gap-[5px]">
            {visitedManholesForDex.slice(0, 24).map(({ id, name, thumbUrl }) => (
              <Link key={id} href={`/manhole/${id}`} aria-label={name} className="aspect-square overflow-hidden rounded-full border-2 border-[#bf5640]/40 bg-[#e9dfc7]">
                {thumbUrl
                  ? <img src={thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : <div aria-hidden="true" className="h-full w-full bg-[radial-gradient(circle,#6F6658_0_18%,#B9AA91_19%_29%,#6F6658_30%_33%,#D7C9AF_34%_48%,#8B7D67_49%_52%,#CFC0A5_53%)]" />}
              </Link>
            ))}
          </div>
          {visitedManholesCount > 24 && (
            <p className="mt-2 text-center font-pixelJp text-[10px] text-[#8C6A4A]">すべて見る {visitedManholesCount} ›</p>
          )}
        </div>
      )}

      {/* Near-complete items */}
      {nearCompleteAll.length > 0 && (
        <div className="space-y-2">
          {nearCompleteAll.slice(0, 4).map((item) => (
            <NearCompleteCard key={`${item.kind}-${item.label}`} item={item} variant="compact" />
          ))}
        </div>
      )}

      {/* CTA */}
      <Link href="/nearby" className="flex items-center justify-center gap-2 rounded-[14px] bg-[#bf5640] px-4 py-3 font-pixelJp text-sm font-bold text-white shadow-sm">
        <Camera className="h-4 w-4" />
        近くのポケふたを撮りに行く
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen safe-area-inset bg-[#efe6cf]">
      <div className="lg:hidden">
        <Header title="スタンプ帳" />
      </div>

      <PCShell active="stamp" rail={isLoggedIn ? visitsRail : undefined} className="pb-32 pt-4 lg:pt-6">
        <div className="space-y-5 max-w-2xl lg:max-w-none">

          {/* PhotoDex サマリーヘッダー（v3 A案: 二極ヘッダー） SP only — PC is in rail */}
          <DexSummaryCard
            got={visitedManholesCount}
            total={TOTAL_MANHOLES}
            completionRate={completionRate}
            remain={TOTAL_MANHOLES - visitedManholesCount}
            pref={{ cur: visitedPrefectureCount, total: 47 }}
            poke={{ cur: visitedPokemonSpecies, total: totalPokemonSpecies }}
            feat={{ cur: visitedFeaturesCount, total: totalAllHashtags }}
            className="lg:hidden"
          />

          {/* セグメントタブ */}
          <nav className="flex gap-1.5 rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7] p-1">
            {segments.map((seg) => (
              <button
                key={seg.id}
                type="button"
                onClick={() => setSegmentTab(seg.id)}
                className={`flex-1 min-h-[36px] rounded-[9px] font-pixelJp text-xs font-bold transition-colors ${
                  segmentTab === seg.id
                    ? 'bg-[#4F3828] text-white'
                    : 'text-[#6A4D36] hover:bg-[#e9dfc7]'
                }`}
              >
                {seg.label}
              </button>
            ))}
          </nav>

          {sortedVisits.length === 0 && segmentTab === 'all' ? (
            <EmptyPassport />
          ) : (
            <>
              {/* ぜんぶ タブ */}
              {segmentTab === 'all' && (
                <div className="space-y-5">
                  {/* 図鑑の壁（DexWall） */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">集めたスタンプ</h2>
                      <span className="font-pixelJp text-xs text-[#8C6A4A]">すべて見る {visitedManholesCount} ›</span>
                    </div>
                    <div className="grid grid-cols-8 gap-[7px]">
                      {visitedManholesForDex.slice(0, 48).map(({ id, thumbUrl }) => (
                        <Link
                          key={id}
                          href={`/manhole/${id}`}
                          className="aspect-square overflow-hidden rounded-full border-2 border-[#bf5640]/40 bg-[#e9dfc7]"
                        >
                          {thumbUrl ? (
                            <img src={thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <div className="h-full w-full bg-[radial-gradient(circle,#6F6658_0_18%,#B9AA91_19%_29%,#6F6658_30%_33%,#D7C9AF_34%_48%,#8B7D67_49%_52%,#CFC0A5_53%)]" />
                          )}
                        </Link>
                      ))}
                      {/* 空き枠（次の目標） */}
                      {Array.from({ length: Math.min(3, Math.max(0, 8 - (visitedManholesForDex.length % 8 || 8))) }).map((_, i) => (
                        <Link
                          key={`empty-${i}`}
                          href="/nearby"
                          className="aspect-square rounded-full border-2 border-dashed border-[#8C6A4A]/30 bg-[#efe6cf] flex items-center justify-center"
                        >
                          <Camera className="h-3 w-3 text-[#8C6A4A]/50" />
                        </Link>
                      ))}
                    </div>
                  </div>

                  {/* コンプリート目前（都道府県・ポケモン・特徴 混在） */}
                  {nearCompleteAll.length > 0 && (
                    <div>
                      <h2 className="mb-2 font-pixelJp text-sm font-bold text-[#4F3828]">🏆 コンプリート目前</h2>
                      <div className="-mx-1 overflow-x-auto px-1 pb-1">
                        <div className="flex gap-3" style={{ width: 'max-content' }}>
                          {nearCompleteAll.map((item) => (
                            <NearCompleteCard key={`${item.kind}-${item.label}`} item={item} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 都道府県コレクション（サマリー） */}
                  {prefectureProgress.filter((p) => p.visited > 0).length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">都道府県コレクション</h2>
                        <button type="button" onClick={() => setSegmentTab('prefectures')} className="font-pixelJp text-xs text-[#8C6A4A]">
                          47都道府県 ›
                        </button>
                      </div>
                      <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7]">
                        {prefectureProgress.filter((p) => p.visited > 0).slice(0, 6).map((p, i, arr) => (
                          <div key={p.name} className={`px-4 py-2.5 ${i < arr.length - 1 ? 'border-b border-[#e9dfc7]' : ''}`}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-pixelJp text-sm font-bold text-[#4F3828] truncate">{p.name}</span>
                              <span
                                style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 700, fontSize: 13 }}
                                className={p.remaining === 0 ? 'text-[#1f9d63]' : 'text-[#8C6A4A]'}
                              >
                                {p.visited}/{p.total}
                              </span>
                            </div>
                            <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[#e9dfc7]">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${p.rate.toFixed(0)}%`, background: p.remaining === 0 ? '#1f9d63' : 'linear-gradient(90deg,#e2a015,#bf5640)' }}
                              />
                            </div>
                          </div>
                        ))}
                        {prefectureProgress.filter((p) => p.visited > 0).length > 6 && (
                          <button type="button" onClick={() => setSegmentTab('prefectures')} className="w-full py-2.5 font-pixelJp text-xs text-[#8C6A4A] hover:bg-[#e9dfc7]/50">
                            あと{prefectureProgress.filter((p) => p.visited > 0).length - 6}件を見る ›
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ポケモンコレクション（サマリー）— 塗り円形トークン */}
                  {visitedPokemonSpecies > 0 && (
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">ポケモンコレクション</h2>
                        <button type="button" onClick={() => setSegmentTab('pokemons')} className="font-pixelJp text-xs text-[#8C6A4A]">
                          {totalPokemonSpecies}匹 ›
                        </button>
                      </div>
                      <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] px-4 py-3">
                        <div className="flex gap-3 justify-around">
                          {pokemonProgress.filter((p) => p.visitedManholes > 0).slice(0, 4).map((p) => {
                            const done = p.remaining === 0;
                            return (
                              <div key={p.pokemonName} className="flex flex-col items-center gap-1.5" style={{ width: 60 }}>
                                <div style={{ width: 52, height: 52, borderRadius: 999, padding: 3, background: done ? '#1f9d63' : '#e9dfc7', display: 'grid', placeItems: 'center' }}>
                                  <div style={{ width: '100%', height: '100%', borderRadius: 999, overflow: 'hidden', background: 'radial-gradient(circle, #6F6658 0% 18%, #B9AA91 19% 29%, #6F6658 30% 33%, #D7C9AF 34% 48%, #8B7D67 49% 52%, #CFC0A5 53%)', border: `1px solid ${done ? '#bfe6cf' : '#e9dfc7'}`, opacity: done ? 1 : 0.45, filter: done ? 'none' : 'grayscale(.5)' }} />
                                </div>
                                <span className="font-pixelJp text-center leading-tight" style={{ fontSize: 10, fontWeight: 700, color: '#6A4D36' }}>{p.pokemonName}</span>
                                <span style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 800, fontSize: 11, color: done ? '#1f9d63' : '#9b917e' }}>
                                  {done ? 'コンプ' : `${p.visitedManholes}/${p.totalManholes}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 特徴コレクション（サマリー） */}
                  {hashtagProgress.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">特徴コレクション</h2>
                        <button type="button" onClick={() => setSegmentTab('features')} className="font-pixelJp text-xs text-[#8C6A4A]">
                          すべて ›
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {hashtagProgress.slice(0, 8).map((h) => {
                          const near = h.remaining > 0 && h.remaining <= 2;
                          return (
                            <span
                              key={h.tag}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 7,
                                background: near ? '#f6e4b6' : '#fffdf7',
                                border: `1px solid ${near ? '#ecd9a8' : '#e9dfc7'}`,
                                borderRadius: 999,
                                padding: '7px 12px',
                                fontSize: 12,
                                fontWeight: 700,
                                color: near ? '#9a6d05' : '#6A4D36',
                              }}
                            >
                              {h.tag}
                              <span style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 800, fontSize: 11, color: near ? '#9a6d05' : '#9b917e' }}>
                                {h.visited}/{h.total}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 都道府県 全件タブ */}
              {segmentTab === 'prefectures' && (() => {
                const complete = prefectureProgress.filter((p) => p.visited > 0 && p.remaining === 0);
                const inProgress = prefectureProgress.filter((p) => p.visited > 0 && p.remaining > 0);
                return (
                  <div className="space-y-4">
                    {complete.length > 0 && (
                      <div>
                        <p className="mb-2 font-pixelJp text-xs font-bold text-[#8C6A4A]">達成済み</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {complete.map((p) => <PrefectureProgressCard key={p.name} prefecture={p} />)}
                        </div>
                      </div>
                    )}
                    {inProgress.length > 0 && (
                      <div>
                        <p className={`mb-2 font-pixelJp text-xs font-bold text-[#8C6A4A] ${complete.length > 0 ? 'mt-2' : ''}`}>進行中</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {inProgress.map((p) => <PrefectureProgressCard key={p.name} prefecture={p} />)}
                        </div>
                      </div>
                    )}
                    {prefectureProgress.filter((p) => p.visited === 0).length > 0 && (
                      <p className="font-pixelJp text-xs text-[#8C6A4A]/70">
                        未着手 {prefectureProgress.filter((p) => p.visited === 0).length}都道府県
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* 特徴 全件タブ */}
              {segmentTab === 'features' && (
                <div className="space-y-4">
                  {hashtagProgress.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="font-pixelJp text-sm text-[#8C6A4A]">まだ特徴コレクションはありません</p>
                    </div>
                  ) : (
                    <>
                      {hashtagProgress.filter((h) => h.remaining === 0).length > 0 && (
                        <div>
                          <p className="mb-2 font-pixelJp text-xs font-bold text-[#1f9d63]">制覇済み</p>
                          <div className="flex flex-wrap gap-2">
                            {hashtagProgress.filter((h) => h.remaining === 0).map((h) => (
                              <span key={h.tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#e2f2e9', border: '1px solid #bfe6cf', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#1f9d63' }}>
                                ✓ {h.tag}
                                <span style={{ fontFamily: '"Outfit"', fontWeight: 800, fontSize: 11 }}>{h.visited}/{h.total}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {hashtagProgress.filter((h) => h.remaining > 0 && h.remaining <= 2).length > 0 && (
                        <div>
                          <p className="mb-2 font-pixelJp text-xs font-bold text-[#9a6d05]">目前</p>
                          <div className="flex flex-wrap gap-2">
                            {hashtagProgress.filter((h) => h.remaining > 0 && h.remaining <= 2).map((h) => (
                              <span key={h.tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#f6e4b6', border: '1px solid #ecd9a8', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#9a6d05' }}>
                                あと{h.remaining} {h.tag}
                                <span style={{ fontFamily: '"Outfit"', fontWeight: 800, fontSize: 11 }}>{h.visited}/{h.total}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {hashtagProgress.filter((h) => h.remaining > 2).length > 0 && (
                        <div>
                          <p className="mb-2 font-pixelJp text-xs font-bold text-[#8C6A4A]">進行中</p>
                          <div className="flex flex-wrap gap-2">
                            {hashtagProgress.filter((h) => h.remaining > 2).map((h) => (
                              <span key={h.tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fffdf7', border: '1px solid #e9dfc7', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#6A4D36' }}>
                                {h.tag}
                                <span style={{ fontFamily: '"Outfit"', fontWeight: 800, fontSize: 11, color: '#9b917e' }}>{h.visited}/{h.total}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ポケモン 全件タブ */}
              {segmentTab === 'pokemons' && (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <p style={{ fontFamily: '"M PLUS Rounded 1c"', fontSize: 10, color: '#9b917e', fontWeight: 700 }}>達成済み</p>
                        <p style={{ fontFamily: '"Outfit"', fontWeight: 800, fontSize: 18, color: '#1f9d63' }}>{visitedPokemonSpecies}</p>
                        <p style={{ fontFamily: '"M PLUS Rounded 1c"', fontSize: 10, color: '#9b917e' }}>種</p>
                      </div>
                      <div className="text-center">
                        <p style={{ fontFamily: '"M PLUS Rounded 1c"', fontSize: 10, color: '#9b917e', fontWeight: 700 }}>全ポケモン</p>
                        <p style={{ fontFamily: '"Outfit"', fontWeight: 800, fontSize: 18, color: '#2c2a26' }}>{totalPokemonSpecies}</p>
                        <p style={{ fontFamily: '"M PLUS Rounded 1c"', fontSize: 10, color: '#9b917e' }}>種</p>
                      </div>
                      <div className="text-center">
                        <p style={{ fontFamily: '"M PLUS Rounded 1c"', fontSize: 10, color: '#9b917e', fontWeight: 700 }}>達成率</p>
                        <p style={{ fontFamily: '"Outfit"', fontWeight: 800, fontSize: 18, color: '#2c2a26' }}>{pokemonCompletionRate.toFixed(0)}%</p>
                      </div>
                    </div>
                  </div>

                  {visitedPokemonSpecies === 0 ? (
                    <div className="py-8 text-center">
                      <p className="font-pixelJp text-sm text-[#8C6A4A]">まだポケモン達成はありません</p>
                    </div>
                  ) : (
                    (() => {
                      type Group = { label: string; items: PokemonProgress[] };
                      const groups: Group[] = [];
                      pokemonProgress.filter((p) => p.visitedManholes > 0).forEach((pokemon) => {
                        const label = pokemon.remaining === 0 ? 'コンプリート済み'
                          : pokemon.remaining <= 3 ? `あと${pokemon.remaining}枚`
                          : '進行中';
                        const last = groups[groups.length - 1];
                        if (!last || last.label !== label) groups.push({ label, items: [pokemon] });
                        else last.items.push(pokemon);
                      });
                      return (
                        <div className="space-y-4">
                          {groups.map((group) => (
                            <div key={group.label}>
                              <p className="mb-2 font-pixelJp text-xs font-bold text-[#8C6A4A]">{group.label}</p>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {group.items.map((pokemon) => (
                                  <PokemonProgressCard key={pokemon.pokemonName} pokemon={pokemon} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </PCShell>

      <div className="fixed inset-x-0 bottom-[4.6rem] z-30 px-4 lg:hidden">
        <div className="mx-auto flex max-w-3xl gap-2 rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7]/95 p-2 shadow-lg backdrop-blur">
          <Link href="/upload" className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#bf5640] px-3 font-pixelJp text-xs font-bold text-white">
            <PlusCircle className="h-4 w-4" />
            訪問を記録
          </Link>
          <Link href="/nearby" className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[10px] border border-[#e9dfc7] bg-white px-3 font-pixelJp text-xs font-bold text-[#4F3828]">
            <Navigation className="h-4 w-4" />
            近くの未訪問
          </Link>
        </div>
      </div>

      <BottomNav />

      {selectedPhotoId && (
        <DeletePhotoModal
          isOpen={deleteModalOpen}
          photoId={selectedPhotoId}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

function SummaryStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-md border border-[#8C6A4A]/15 bg-white/55 px-3 py-2">
      <p className="font-pixelJp text-[10px] font-bold text-[#8C6A4A]">{label}</p>
      <p className={`mt-1 font-pixelJp font-bold text-[#4F3828] ${compact ? 'text-xs' : 'text-lg'}`}>{value}</p>
    </div>
  );
}

function AchievementBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`rounded-full border px-3 py-1 font-pixelJp text-[10px] font-bold ${
      active
        ? 'border-[#B5483C]/30 bg-[#F8D9C4] text-[#B5483C]'
        : 'border-[#8C6A4A]/20 bg-white/50 text-[#8C6A4A]'
    }`}>
      {label}
    </span>
  );
}

function PrefectureMiniCard({ prefecture }: { prefecture: PrefectureProgress }) {
  return (
    <div className="rounded-lg border border-[#8C6A4A]/15 bg-[#FFF7E5] p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-pixelJp text-sm font-bold text-[#4F3828]">{prefecture.name}</p>
        <p className="font-pixel text-sm text-[#B5483C]">{prefecture.visited}/{prefecture.total}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-[#E4D4B8]">
        <div className="h-full bg-[#3F9D7D]" style={{ width: `${Math.min(prefecture.rate, 100)}%` }} />
      </div>
    </div>
  );
}

function PrefectureProgressCard({ prefecture }: { prefecture: PrefectureProgress }) {
  const complete = prefecture.total > 0 && prefecture.remaining === 0;

  return (
    <article className="rounded-lg border border-[#8C6A4A]/15 bg-[#FFF7E5] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {prefecture.representativePhotoUrl && (
          <img
            src={prefecture.representativePhotoUrl}
            alt={prefecture.name}
            loading="lazy"
            className="h-14 w-14 flex-shrink-0 rounded-md object-cover"
          />
        )}
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-pixelJp text-base font-bold text-[#4F3828]">{prefecture.name}</h2>
            <p className="mt-1 font-pixelJp text-xs text-[#6A4D36]">
              {complete ? '制覇済み' : `あと${prefecture.remaining}件`}
            </p>
          </div>
          <div className={`flex-shrink-0 rounded-md px-3 py-2 text-center ${complete ? 'bg-[#DFF1E9]' : 'bg-[#F8D9C4]'}`}>
            <p className="font-pixel text-xl leading-none text-[#4F3828]">{prefecture.visited}/{prefecture.total}</p>
            <p className="font-pixelJp text-[10px] font-bold text-[#6A4D36]">{prefecture.rate.toFixed(0)}%</p>
          </div>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-sm border border-[#8C6A4A]/15 bg-[#E4D4B8]">
        <div
          className={`h-full ${complete ? 'bg-[#3F9D7D]' : 'bg-[#D94D3F]'}`}
          style={{ width: `${Math.min(prefecture.rate, 100)}%` }}
        />
      </div>
      {complete && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-[#3F9D7D]/25 bg-[#DFF1E9] px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-[#2C765E]" />
          <p className="font-pixelJp text-xs font-bold text-[#2C765E]">都道府県コンプリート</p>
        </div>
      )}
    </article>
  );
}

function PokemonProgressCard({ pokemon }: { pokemon: PokemonProgress }) {
  const complete = pokemon.totalManholes > 0 && pokemon.remaining === 0;

  return (
    <article className="rounded-lg border border-[#8C6A4A]/15 bg-[#FFF7E5] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {pokemon.representativePhotoUrl && (
          <img
            src={pokemon.representativePhotoUrl}
            alt={pokemon.pokemonName}
            loading="lazy"
            className="h-14 w-14 flex-shrink-0 rounded-md object-cover"
          />
        )}
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-pixelJp text-base font-bold text-[#4F3828]">{pokemon.pokemonName}</h2>
            <p className="mt-1 font-pixelJp text-xs text-[#6A4D36]">
              {complete ? '制覇済み' : `あと${pokemon.remaining}件`}
            </p>
          </div>
          <div className={`flex-shrink-0 rounded-md px-3 py-2 text-center ${complete ? 'bg-[#DFF1E9]' : 'bg-[#F8D9C4]'}`}>
            <p className="font-pixel text-xl leading-none text-[#4F3828]">{pokemon.visitedManholes}/{pokemon.totalManholes}</p>
            <p className="font-pixelJp text-[10px] font-bold text-[#6A4D36]">{pokemon.rate.toFixed(0)}%</p>
          </div>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-sm border border-[#8C6A4A]/15 bg-[#E4D4B8]">
        <div
          className={`h-full ${complete ? 'bg-[#3F9D7D]' : 'bg-[#D94D3F]'}`}
          style={{ width: `${Math.min(pokemon.rate, 100)}%` }}
        />
      </div>
      {complete && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-[#3F9D7D]/25 bg-[#DFF1E9] px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-[#2C765E]" />
          <p className="font-pixelJp text-xs font-bold text-[#2C765E]">ポケモンコンプリート</p>
        </div>
      )}
    </article>
  );
}

function StampCard({ manhole, summary }: { manhole: Manhole; summary?: VisitSummary }) {
  const isVisited = Boolean(summary);

  return (
    <Link
      href={`/manhole/${manhole.id}`}
      className={`relative flex aspect-[4/5] flex-col justify-between rounded-md border-2 p-1.5 shadow-sm transition-transform hover:-translate-y-0.5 ${
        isVisited
          ? 'border-[#B5483C]/45 bg-[#FFF7E5]'
          : 'border-dashed border-[#8C6A4A]/25 bg-[#E9DEC9]/75'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-1 py-0.5 font-pixelJp text-[8px] font-bold leading-none ${
          isVisited ? 'bg-[#D94D3F] text-white' : 'bg-[#D5C8B3] text-[#7D715F]'
        }`}>
          {isVisited ? '済' : '未'}
        </span>
        <div className="flex items-center gap-0.5">
          {summary?.hasPhotos && <Camera className="h-3 w-3 text-[#B5483C]" />}
          {summary && summary.count > 1 && (
            <span className="rounded-full bg-[#4F3828] px-1 py-0.5 font-pixel text-[7px] leading-none text-white">
              x{summary.count}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        {isVisited ? (
          <div className="relative aspect-square w-3/4 overflow-hidden rounded-full border-[3px] border-[#D94D3F] bg-[#E9DEC9] shadow-[inset_0_2px_8px_rgba(181,72,60,0.18)]">
            {summary?.latestVisit.photos[0]?.thumbnail_url ? (
              <img
                src={summary.latestVisit.photos[0].thumbnail_url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle,#6F6658_0_18%,#B9AA91_19%_29%,#6F6658_30%_33%,#D7C9AF_34%_48%,#8B7D67_49%_52%,#CFC0A5_53%)]">
                <CircleDot className="h-4 w-4 text-[#4F3828]/70" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex aspect-square w-3/4 rotate-[-8deg] items-center justify-center rounded-full border-[3px] border-[#B8AB96] text-center text-[#A39580]">
            <div>
              <Stamp className="mx-auto h-4 w-4" />
              <p className="font-pixel text-[7px] leading-none">NEXT</p>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="truncate font-pixelJp text-[9px] font-bold leading-tight text-[#4F3828]">
          {getMunicipality(manhole)}{manhole.building && `・${manhole.building}`}
        </p>
        {summary && (
          <p className="font-pixel text-[8px] text-[#B5483C]">{formatVisitDate(summary.latestVisit.visited_at, 'yyyy/M')}</p>
        )}
      </div>
    </Link>
  );
}

function EmptyPassport() {
  return (
    <section className="rounded-lg border border-[#8C6A4A]/15 bg-[#FFF7E5] p-8 text-center shadow-sm">
      <Stamp className="mx-auto mb-4 h-14 w-14 text-[#8C6A4A]/45" />
      <h2 className="font-pixelJp text-lg font-bold text-[#4F3828]">まだスタンプがありません</h2>
      <p className="mx-auto mt-3 max-w-sm font-pixelJp text-sm leading-6 text-[#6A4D36]">
        最初のポケふたを記録すると、ここに旅の達成記録がたまっていきます。
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/nearby" className="rounded-md bg-[#B5483C] px-4 py-3 font-pixelJp text-xs font-bold text-white">
          近くを探す
        </Link>
      </div>
    </section>
  );
}

function AxisStats({
  pref,
  poke,
  feat,
}: {
  pref: { cur: number; total: number };
  poke: { cur: number; total: number };
  feat: { cur: number; total: number };
}) {
  const items = [
    { icon: <MapPin className="h-3 w-3" />, label: '都道府県', cur: pref.cur, total: pref.total },
    { icon: <Target className="h-3 w-3" />, label: 'ポケモン', cur: poke.cur, total: poke.total },
    { icon: <Sparkles className="h-3 w-3" />, label: '特徴', cur: feat.cur, total: feat.total },
  ];
  return (
    <div className="flex overflow-hidden rounded-[12px] border border-[#e9dfc7] bg-[#fbf6ea]">
      {items.map((s, i) => (
        <div
          key={s.label}
          className="flex flex-1 flex-col items-center py-[9px] px-1 text-center"
          style={{ borderLeft: i ? '1px solid #e9dfc7' : 'none' }}
        >
          <div className="flex items-center justify-center gap-1 text-[#9b917e]">
            {s.icon}
            <span style={{ fontSize: 10.5, fontWeight: 700 }}>{s.label}</span>
          </div>
          <div style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 800, fontSize: 15, marginTop: 3, color: '#2c2a26', lineHeight: 1 }}>
            {s.cur}<span style={{ color: '#9b917e', fontSize: 11, fontWeight: 600 }}>/{s.total}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DexSummaryCard({
  got,
  total,
  completionRate,
  remain,
  pref,
  poke,
  feat,
  className,
}: {
  got: number;
  total: number;
  completionRate: number;
  remain: number;
  pref: { cur: number; total: number };
  poke: { cur: number; total: number };
  feat: { cur: number; total: number };
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] shadow-sm${className ? ` ${className}` : ''}`}
      style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 11 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#c47e0f', textTransform: 'uppercase' as const }}>
            PHOTO DEX
          </p>
          <div style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 800, fontSize: 34, lineHeight: 1, marginTop: 5, color: '#2c2a26' }}>
            {got}<span style={{ fontSize: 18, color: '#9b917e' }}>/{total}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 800, fontSize: 30, lineHeight: 1, color: '#bf5640' }}>
            {completionRate.toFixed(0)}<span style={{ fontSize: 16 }}>%</span>
          </div>
          <div style={{ fontSize: 11, color: '#9b917e', fontWeight: 600, marginTop: 3 }}>完成率</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="flex-1 h-[9px] overflow-hidden rounded-full bg-[#e9dfc7]">
          <div className="h-full rounded-full" style={{ width: `${Math.min(completionRate, 100)}%`, background: 'linear-gradient(90deg,#e2a015,#bf5640)' }} />
        </div>
        <span style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontSize: 11.5, color: '#9b917e', fontWeight: 700, flex: '0 0 auto' }}>あと{remain}</span>
      </div>
      <AxisStats pref={pref} poke={poke} feat={feat} />
    </div>
  );
}

function NearCompleteCard({ item, variant = 'card' }: { item: NearCompleteItem; variant?: 'compact' | 'card' }) {
  const color = KIND_COLOR[item.kind];
  if (variant === 'compact') {
    return (
      <div className="overflow-hidden rounded-[14px] border border-[#efd9a3] bg-[#fffdf7] p-3 shadow-sm">
        <span style={{ fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', fontSize: 11, fontWeight: 800, color: color.badge }}>
          🏆 あと{item.remaining}でコンプ
        </span>
        <p className="font-pixelJp text-sm font-bold text-[#4F3828] mt-0.5 truncate">{item.label}</p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e9dfc7]">
          <div className="h-full rounded-full" style={{ width: `${item.rate.toFixed(0)}%`, background: color.bar }} />
        </div>
        <p style={{ fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', fontSize: 10, color: '#9b917e', marginTop: 3 }}>
          {item.visited}/{item.total}
        </p>
      </div>
    );
  }
  return (
    <div className="w-40 shrink-0 rounded-[14px] border border-[#efd9a3] bg-[#fffdf7] p-3 shadow-sm">
      <div className="flex items-center gap-1 mb-1">
        <span
          style={{
            fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif',
            fontWeight: 800,
            fontSize: 11,
            borderRadius: 999,
            padding: '3px 8px',
            background: color.bg,
            color: color.badge,
            whiteSpace: 'nowrap' as const,
          }}
        >
          あと{item.remaining}
        </span>
      </div>
      <p className="font-pixelJp text-sm font-bold text-[#4F3828] truncate">{item.label}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9dfc7]">
        <div
          className="h-full rounded-full"
          style={{ width: `${item.rate.toFixed(0)}%`, background: color.bar }}
        />
      </div>
      <p className="mt-1 font-pixelJp text-[10px] text-[#8C6A4A]">{item.visited}/{item.total}</p>
      <Link
        href="/nearby"
        className="mt-2 flex items-center justify-center gap-1 rounded-[8px] bg-[#bf5640] px-2 py-1.5 font-pixelJp text-[10px] font-bold text-white"
      >
        <Camera className="h-3 w-3" />
        次を撮る
      </Link>
    </div>
  );
}
