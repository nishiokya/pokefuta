'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  Calendar,
  Camera,
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
import PCShell from '@/components/PCShell';
import LandscapePhotoBadge from '@/components/LandscapePhotoBadge';
import AiPhotoTags from '@/components/AiPhotoTags';
import StampPhoto from '@/components/StampPhoto';
import AiTagNote from '@/components/AiTagNote';
import { photoAiTags } from '@/lib/photo-ai-tags';
import DeletePhotoModal from '@/components/DeletePhotoModal';
import ShareButtons from '@/components/ShareButtons';
import ProfileCard from '@/components/users/ProfileCard';
import VisitsSwitcher from '@/components/visits/VisitsSwitcher';
import MyBadgesPanel from '@/components/visits/MyBadgesPanel';
import CollectionStampShelf from '@/components/visits/CollectionStampShelf';
import StickerStrip from '@/components/visits/StickerStrip';
import { pokemonDexUrl } from '@/lib/pokemonSlug';
import { buildThemeBadges, byCollected, pokemonBadgeManholeIds } from '@/lib/badge-catalog';
import { fetchPokemonRepresentatives } from '@/lib/pokemon-representatives';
import { fetchAllManholes } from '@/lib/manhole-list-client';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { visitsShareText } from '@/lib/share';
import { pageTitle } from '@/lib/constants';
import { manholeDisplayName } from '@/lib/manhole-label';

interface Visit {
  id: string;
  manhole: Manhole;
  visited_at: string;
  photos: {
    id: string;
    url: string;
    thumbnail_url: string;
    is_landscape?: boolean;
    ai_tags?: unknown;
  }[];
  notes?: string;
  comment?: string;
  is_public: boolean;
  likes_count: number;
  is_liked: boolean;
  comments_count: number;
  is_bookmarked: boolean;
}


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

const TOTAL_MANHOLES = 482;

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
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sampleVisits, setSampleVisits] = useState<Array<{ id: string; thumbnail_url: string | null; location: string; is_landscape?: boolean; ai_tags?: unknown }>>([]);
  const { trackView, trackPassportOpen } = useAnalytics();

  useEffect(() => {
    document.title = pageTitle('スタンプ帳');
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
      const [data, visitsRes] = await Promise.all([
        fetchAllManholes(),
        fetch('/api/visits?with_photos=true&limit=6&order_by=created_at', { credentials: 'omit' }),
      ]);
      if (data) {
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
              is_landscape: v.photos?.[0]?.is_landscape,
              ai_tags: v.photos?.[0]?.ai_tags,
              location: v.manhole ? manholeDisplayName(v.manhole) : 'ポケふた',
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
      const [visitsResponse, data] = await Promise.all([
        fetch('/api/visits?limit=1000'),
        fetchAllManholes(),
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
                is_landscape: photo.is_landscape,
                ai_tags: photo.ai_tags,
              })) || [],
              notes: visit.note,
              comment: visit.comment,
              is_public: visit.is_public !== false,
              likes_count: visit.likes_count || 0,
              is_liked: visit.is_liked || false,
              comments_count: visit.comments_count || 0,
              is_bookmarked: visit.is_bookmarked || false,
            }));

          setVisits(apiVisits);
        }
      }

      if (data) {
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
  // バッジ（PC の右レール）用。都道府県・ポケモン（とスタンプの下のステッカー）は非公開も含めた訪問、称号は公開の訪問で数える
  const visitedManholeIds = useMemo(() => new Set(visitSummaryByManholeId.keys()), [visitSummaryByManholeId]);
  const publicVisitedManholeCount = useMemo(
    () => new Set(visits.filter((v) => v.is_public).map((v) => v.manhole.id)).size,
    [visits],
  );
  const [representatives, setRepresentatives] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    let cancelled = false;
    fetchPokemonRepresentatives().then((loaded) => {
      if (!cancelled) setRepresentatives(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const privateVisitCount = useMemo(() => visits.filter((v) => !v.is_public).length, [visits]);
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

  // ポケモンのメダルの絵は右のポケモンバッジと同じ蓋にそろえる
  const stickers = useMemo(() => buildThemeBadges(passportManholes, visitedManholeIds), [passportManholes, visitedManholeIds]);
  const pokemonMedalIds = useMemo(
    () => pokemonBadgeManholeIds(passportManholes, representatives),
    [passportManholes, representatives]
  );

  const visitedManholesForDex = useMemo(
    () => passportManholes
      .filter((m) => visitSummaryByManholeId.has(m.id))
      .map((m) => ({
        id: m.id,
        name: getManholeName(m),
        thumbUrl: visitSummaryByManholeId.get(m.id)?.latestVisit.photos[0]?.thumbnail_url ?? null,
        // 蓋で丸をいっぱいにする位置（ai_tags.lid / crop）。StampPhoto が使う
        aiTags: visitSummaryByManholeId.get(m.id)?.latestVisit.photos[0]?.ai_tags,
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

  // TODO: handleDeleteClick は定義済みだが visits ページに削除ボタンが未配置。
  // VisitPhotoCard に削除導線を追加する際にここを呼ぶ。
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
      <div className="min-h-content safe-area-body bg-[#F3E7CC] flex items-center justify-center">
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
          href="/login"
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
      <div className="min-h-content safe-area-body bg-[#F3E7CC] pb-nav-safe">

        <PCShell rail={unAuthRail} className="pb-32 pt-5 lg:pt-6">
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
                    <span className="font-pixel text-2xl font-extrabold text-[#7B63A8]">{totalManholes ?? '482'}</span>
                    <span className="ml-1 text-xs font-bold text-[#9B9B9B]">全国のポケふた</span>
                  </div>
                  <div>
                    <span className="font-pixel text-2xl font-extrabold text-[#2C765E]">{prefectureCount ?? '42'}</span>
                    <span className="ml-1 text-xs font-bold text-[#9B9B9B]">都道府県</span>
                  </div>
                  <div>
                    <span className="font-pixel text-2xl font-extrabold text-[#FFB347]">{pokemonCount ?? '549'}</span>
                    <span className="ml-1 text-xs font-bold text-[#9B9B9B]">種類のポケモン</span>
                  </div>
                </div>

                {/* CTA Buttons */}
                <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
                  <Link
                    href="/login"
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
                  80<span className="text-[11px] font-bold text-[#C0B8D0]">/{totalManholes ?? '482'}</span>
                </p>
              </div>
              <div className="rounded-lg bg-[#EDFAF5] px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-[#9B9B9B]">都道府県</p>
                <p className="font-pixel text-xl font-extrabold text-[#2C765E]">
                  10<span className="text-[11px] font-bold text-[#A8D5C4]">/{prefectureCount ?? '42'}</span>
                </p>
              </div>
              <div className="rounded-lg bg-[#FFF8EB] px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-[#9B9B9B]">ポケモン</p>
                <p className="font-pixel text-xl font-extrabold text-[#C87C2A]">
                  104<span className="text-[11px] font-bold text-[#D4BC8A]">/{pokemonCount ?? '549'}</span>
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
                      <div className="flex flex-wrap gap-0.5">
                        <LandscapePhotoBadge isLandscape={sv.is_landscape} />
                        <AiPhotoTags photo={sv} compact />
                      </div>
                      <p className="line-clamp-1 text-[9px] font-bold text-white">{sv.location}</p>
                    </div>
                  </div>
                ))}
              </div>
              <AiTagNote className="mt-2" show={sampleVisits.slice(0, 6).some((sv) => photoAiTags(sv).length > 0)} />
              <p className="mt-3 text-center text-xs text-[#6A4D36]">
                登録すると、あなたの旅写真もここに残せます
              </p>
            </section>
          )}
        </main>
        </PCShell>

      </div>
    );
  }

  const badgePanel = (
    <MyBadgesPanel
      manholes={passportManholes}
      visited={visitedManholeIds}
      publicCount={publicVisitedManholeCount}
    />
  );

  // 左（スマホは「スタンプ」タブ）は集めたスタンプと、都道府県・ポケモンのメダル一覧。
  // PC の右レールは称号とバッジの数（スマホは「バッジ」タブ = /visits/badges）。
  // PCShell の rail はスマホで本文より上に出るので使わず、旅の記録（/visits/trip）と同じ組み方にする
  return (
    <div className="min-h-content safe-area-body bg-[#efe6cf]">

      <PCShell className="pb-32 pt-4 lg:pt-6">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-[28px]">
        <div className="min-w-0 max-w-2xl space-y-5 lg:max-w-none">

          {/* スタンプ / 旅の記録 / バッジ。スマホは一番上に置く（旅の記録は /visits/trip、バッジは /visits/badges） */}
          {isLoggedIn && <VisitsSwitcher current="collection" />}
          {isLoggedIn && (
            <Link href="/visits/map" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#e9dfc7] bg-[#fffdf7] px-4 py-2 font-pixelJp text-xs font-bold text-[#7B63A8]">
              <MapPin className="h-4 w-4" /> 訪問マップ（訪問済み・未訪問）
            </Link>
          )}

          {/* トレーナー情報 — プロフィール編集は /profile に置き、公開ページには置かない */}
          {isLoggedIn && (
            <ProfileCard showShare />
          )}

          {/* 公開設定は旅の記録にしかないので、非公開があるときだけここで知らせる。
              件数は取得できた範囲（limit=1000）の訪問記録の数で、重複をまとめる前のもの */}
          {privateVisitCount > 0 && (
            <Link
              href="/visits/trip"
              className="flex items-center justify-between gap-2 rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7] px-4 py-2.5 font-pixelJp text-xs font-bold text-[#7B63A8]"
            >
              <span>非公開の記録が{privateVisitCount}件あります。公開スタンプ帳には出ません</span>
              <span className="shrink-0">公開設定 →</span>
            </Link>
          )}

          {/* PhotoDex サマリーヘッダー（v3 A案: 二極ヘッダー） */}
          <DexSummaryCard
            got={visitedManholesCount}
            total={TOTAL_MANHOLES}
            completionRate={completionRate}
            remain={TOTAL_MANHOLES - visitedManholesCount}
            pref={{ cur: visitedPrefectureCount, total: 47 }}
            poke={{ cur: visitedPokemonSpecies, total: totalPokemonSpecies }}
            feat={{ cur: visitedFeaturesCount, total: totalAllHashtags }}
          />

          {sortedVisits.length === 0 ? (
            <EmptyPassport />
          ) : (
            <div className="space-y-5">
            {/* 図鑑の壁（DexWall） */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-pixelJp text-sm font-bold text-[#4F3828]">集めたポケモンマンホールのスタンプ</h2>
                <span className="font-pixelJp text-xs text-[#8C6A4A]">すべて見る {visitedManholesCount} ›</span>
              </div>
              <div className="grid grid-cols-8 gap-[7px]">
                {visitedManholesForDex.slice(0, 48).map(({ id, thumbUrl, aiTags }) => (
                  <Link
                    key={id}
                    href={`/manhole/${id}`}
                    className="aspect-square overflow-hidden rounded-full border-2 border-[#bf5640]/40 bg-[#e9dfc7]"
                  >
                    {thumbUrl ? (
                      <StampPhoto src={thumbUrl} aiTags={aiTags} />
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
              {/* ステッカーはスタンプの下に貼る（右レールのカードはやめた） */}
              <div className="mt-3">
                <StickerStrip stickers={stickers} showLocked />
              </div>
            </div>

            {/* 都道府県・ポケモンのバッジ（金・銀・銅）。都道府県は多くても47件なので先に出し、100種を超えるポケモンは最初の2段だけにする */}
            <div id="badges" className="scroll-mt-20 space-y-6">
            <CollectionStampShelf
              title="都道府県バッジ"
              items={prefectureProgress.filter((p) => p.visited > 0 && p.name !== '都道府県未設定')
                .map((p) => ({
                  name: p.name,
                  label: p.name === '北海道' ? p.name : p.name.replace(/[都府県]$/, ''),
                  visited: p.visited,
                  total: p.total,
                }))
                .sort(byCollected)}
            />
            <CollectionStampShelf
              title="ポケモンバッジ"
              initialCount={16}
              items={pokemonProgress.filter((p) => p.visitedManholes > 0)
                .map((p) => ({
                  name: p.pokemonName,
                  visited: p.visitedManholes,
                  total: p.totalManholes,
                  manholeId: pokemonMedalIds.get(p.pokemonName),
                  href: pokemonDexUrl(p.pokemonName),
                }))
                .sort(byCollected)}
            />
            </div>
            </div>
          )}
        </div>
        {isLoggedIn && (
          <div className="hidden lg:block">
            <div className="sticky top-[20px] flex flex-col gap-[14px]">
              {badgePanel}
            </div>
          </div>
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


      {selectedPhotoId && (
        <DeletePhotoModal
          isOpen={deleteModalOpen}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          isDeleting={isDeleting}
        />
      )}
    </div>
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
          {manholeDisplayName(manhole)}
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
