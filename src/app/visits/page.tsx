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
  Stamp,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import DeletePhotoModal from '@/components/DeletePhotoModal';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

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

type PassportTab = 'stamps' | 'prefectures' | 'unvisited';

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
};

const tabs: { id: PassportTab; label: string }[] = [
  { id: 'stamps', label: 'スタンプ帳' },
  { id: 'prefectures', label: '都道府県' },
  { id: 'unvisited', label: '未訪問' },
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
  const [activeTab, setActiveTab] = useState<PassportTab>('stamps');
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { trackView } = useAnalytics();

  useEffect(() => {
    document.title = 'ポケふた訪問パスポート - ポケふた訪問記録';
    trackView('/visits', 'ポケふた訪問パスポート', 'visits');
    loadPassport();
  }, []);

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
  const completionRate = totalManholes ? (visitedManholesCount / totalManholes) * 100 : null;

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
    const progress = new Map<string, { totalIds: Set<number>; visitedIds: Set<number> }>();

    passportManholes.forEach((manhole) => {
      const prefecture = manhole.prefecture || '都道府県未設定';
      const current = progress.get(prefecture) || { totalIds: new Set<number>(), visitedIds: new Set<number>() };
      current.totalIds.add(manhole.id);

      if (visitSummaryByManholeId.has(manhole.id)) {
        current.visitedIds.add(manhole.id);
      }

      progress.set(prefecture, current);
    });

    return Array.from(progress.entries())
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
        if (b.visited !== a.visited) return b.visited - a.visited;
        if (b.rate !== a.rate) return b.rate - a.rate;
        return a.name.localeCompare(b.name, 'ja');
      });
  }, [passportManholes, visitSummaryByManholeId]);

  const leadingPrefecture = prefectureProgress.find((prefecture) => prefecture.visited > 0) || prefectureProgress[0];
  const unvisitedManholes = passportManholes.filter((manhole) => !visitSummaryByManholeId.has(manhole.id));
  const recentMilestone = Math.floor(visitedManholesCount / 10) * 10;

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

  return (
    <div className="min-h-screen safe-area-inset bg-[#F3E7CC]">
      <div className="max-w-3xl mx-auto pb-[10rem]">
        <div className="p-4 space-y-4">
          <section className="relative overflow-hidden rounded-lg border border-[#8C6A4A]/20 bg-[#FFF7E5] p-4 shadow-[0_12px_30px_rgba(95,68,42,0.13)]">
            <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-pixelJp text-[11px] font-bold text-[#9B5C2E]">POKEFUTA PASSPORT</p>
                  <h1 className="mt-1 font-pixelJp text-xl font-bold text-[#4F3828]">
                    ポケふた訪問パスポート
                  </h1>
                </div>
                <div className="shrink-0 rounded-lg border border-[#B65A4B]/30 bg-[#F8D9C4] px-3 py-2 text-center">
                  <p className="font-pixel text-2xl leading-none text-[#B5483C]">{visitedManholesCount}</p>
                  <p className="font-pixelJp text-[10px] font-bold text-[#6A4D36]">STAMPS</p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-end justify-between">
                  <div>
                    <p className="font-pixel text-2xl text-[#4F3828]">
                      {visitedManholesCount} / {totalManholes ?? '集計中'}
                    </p>
                    <p className="font-pixelJp text-xs text-[#6A4D36]">訪問済みスタンプ</p>
                  </div>
                  <p className="font-pixel text-xl text-[#B5483C]">
                    {completionRate === null ? '--%' : `${completionRate.toFixed(1)}%`}
                  </p>
                </div>
                <div className="h-4 overflow-hidden rounded-sm border border-[#8C6A4A]/25 bg-[#E4D4B8]">
                  <div
                    className="h-full rounded-sm bg-gradient-to-r from-[#D94D3F] via-[#F1B642] to-[#3F9D7D] transition-all"
                    style={{ width: `${Math.min(completionRate ?? 0, 100)}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryStat label="達成率" value={completionRate === null ? '--%' : `${completionRate.toFixed(1)}%`} />
                <SummaryStat label="訪問自治体" value={`${visitedMunicipalityCount}`} />
                <SummaryStat label="写真つき" value={`${visits.filter((visit) => visit.photos.length > 0).length}`} />
                <SummaryStat
                  label="先頭の県"
                  value={leadingPrefecture ? `${leadingPrefecture.name} ${leadingPrefecture.visited}/${leadingPrefecture.total}` : '-'}
                  compact
                />
              </div>

              {visitedManholesCount > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <AchievementBadge label="NEW STAMP" active={visitedManholesCount === 1} />
                  {recentMilestone >= 10 && <AchievementBadge label={`${recentMilestone} STAMPS達成`} active />}
                  {prefectureProgress.some((prefecture) => prefecture.total > 0 && prefecture.remaining === 0) && (
                    <AchievementBadge label="都道府県コンプリート" active />
                  )}
                </div>
              )}
            </div>
          </section>

          {prefectureProgress.some((prefecture) => prefecture.visited > 0) && (
            <section className="grid gap-3 sm:grid-cols-3">
              {prefectureProgress
                .filter((prefecture) => prefecture.visited > 0)
                .slice(0, 3)
                .map((prefecture) => (
                  <PrefectureMiniCard key={prefecture.name} prefecture={prefecture} />
                ))}
            </section>
          )}

          <nav className="sticky top-2 z-20 -mx-1 rounded-lg border border-[#8C6A4A]/15 bg-[#FFF7E5]/95 p-1 shadow-sm backdrop-blur">
            <div className="grid grid-cols-4 gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[38px] rounded-md px-2 text-center font-pixelJp text-[11px] font-bold transition-colors sm:text-xs ${
                    activeTab === tab.id
                      ? 'bg-[#4F3828] text-[#FFF7E5]'
                      : 'text-[#6A4D36] hover:bg-[#EAD9B8]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {sortedVisits.length === 0 ? (
            <EmptyPassport />
          ) : (
            <>
              {activeTab === 'stamps' && (
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {passportManholes.slice(0, 60).map((manhole) => (
                    <StampCard
                      key={manhole.id}
                      manhole={manhole}
                      summary={visitSummaryByManholeId.get(manhole.id)}
                    />
                  ))}
                </section>
              )}

              {activeTab === 'prefectures' && (
                <section className="grid gap-3 sm:grid-cols-2">
                  {prefectureProgress.map((prefecture) => (
                    <PrefectureProgressCard key={prefecture.name} prefecture={prefecture} />
                  ))}
                </section>
              )}

              {activeTab === 'unvisited' && (
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {unvisitedManholes.slice(0, 60).map((manhole) => (
                    <StampCard key={manhole.id} manhole={manhole} />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[4.6rem] z-30 px-4">
        <div className="mx-auto flex max-w-3xl gap-2 rounded-lg border border-[#8C6A4A]/20 bg-[#FFF7E5]/95 p-2 shadow-lg backdrop-blur">
          <Link href="/upload" className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md bg-[#B5483C] px-3 font-pixelJp text-xs font-bold text-white">
            <PlusCircle className="h-4 w-4" />
            訪問を記録
          </Link>
          <Link href="/nearby" className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md border border-[#8C6A4A]/25 bg-white px-3 font-pixelJp text-xs font-bold text-[#4F3828]">
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-pixelJp text-base font-bold text-[#4F3828]">{prefecture.name}</h2>
          <p className="mt-1 font-pixelJp text-xs text-[#6A4D36]">
            {complete ? '制覇済み' : `あと${prefecture.remaining}件`}
          </p>
        </div>
        <div className={`rounded-md px-3 py-2 text-center ${complete ? 'bg-[#DFF1E9]' : 'bg-[#F8D9C4]'}`}>
          <p className="font-pixel text-xl leading-none text-[#4F3828]">{prefecture.visited}/{prefecture.total}</p>
          <p className="font-pixelJp text-[10px] font-bold text-[#6A4D36]">{prefecture.rate.toFixed(0)}%</p>
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

function StampCard({ manhole, summary }: { manhole: Manhole; summary?: VisitSummary }) {
  const isVisited = Boolean(summary);

  return (
    <Link
      href={`/manhole/${manhole.id}`}
      className={`relative flex aspect-[4/5] flex-col justify-between rounded-lg border-2 p-3 shadow-sm transition-transform hover:-translate-y-0.5 ${
        isVisited
          ? 'border-[#B5483C]/45 bg-[#FFF7E5]'
          : 'border-dashed border-[#8C6A4A]/25 bg-[#E9DEC9]/75'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-1 font-pixelJp text-[10px] font-bold ${
          isVisited ? 'bg-[#D94D3F] text-white' : 'bg-[#D5C8B3] text-[#7D715F]'
        }`}>
          {isVisited ? '済' : '未訪問'}
        </span>
        <div className="flex items-center gap-1">
          {summary?.hasPhotos && <Camera className="h-4 w-4 text-[#B5483C]" />}
          {summary && summary.count > 1 && (
            <span className="rounded-full bg-[#4F3828] px-1.5 py-0.5 font-pixel text-[10px] text-white">
              x{summary.count}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        {isVisited ? (
          <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-[#D94D3F] bg-[#E9DEC9] shadow-[inset_0_2px_8px_rgba(181,72,60,0.18)]">
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
                <CircleDot className="h-8 w-8 text-[#4F3828]/70" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-20 w-20 rotate-[-8deg] items-center justify-center rounded-full border-4 border-[#B8AB96] text-center text-[#A39580]">
            <div>
              <Stamp className="mx-auto h-6 w-6" />
              <p className="mt-1 font-pixel text-[10px] leading-none">NEXT</p>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="line-clamp-2 font-pixelJp text-sm font-bold leading-tight text-[#4F3828]">
          {getMunicipality(manhole)}
        </p>
        <p className="mt-1 truncate font-pixelJp text-[11px] text-[#6A4D36]">{manhole.prefecture}</p>
        {summary && (
          <p className="mt-2 font-pixel text-xs text-[#B5483C]">{formatVisitDate(summary.latestVisit.visited_at, 'yyyy/M')}</p>
        )}
      </div>
    </Link>
  );
}

function RecentVisitCard({
  visit,
  onDeleteClick,
  onLikeToggle,
  onBookmarkToggle,
}: {
  visit: Visit;
  onDeleteClick: (photoId: string, visitId: string) => void;
  onLikeToggle: (visitId: string) => void;
  onBookmarkToggle: (visitId: string) => void;
}) {
  return (
    <article className="rounded-lg border border-[#8C6A4A]/15 bg-[#FFF7E5] p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3 border-b border-[#8C6A4A]/15 pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F8D9C4]">
          <MapPin className="h-5 w-5 text-[#B5483C]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-pixelJp text-sm font-bold text-[#4F3828]">
            {getManholeName(visit.manhole)}
          </h3>
          <p className="font-pixelJp text-xs text-[#6A4D36]">
            {visit.manhole.prefecture} {getMunicipality(visit.manhole)}
          </p>
        </div>
      </div>

      {visit.photos.length > 0 ? (
        <div className="mb-3 grid grid-cols-2 gap-1">
          {visit.photos.slice(0, 4).map((photo, index) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-md border border-[#8C6A4A]/15 bg-[#E9DEC9]">
              <img
                src={photo.thumbnail_url}
                alt={`Photo ${index + 1}`}
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              {visit.photos.length > 4 && index === 3 && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/65">
                  <span className="font-pixel text-xl text-white">+{visit.photos.length - 3}</span>
                </div>
              )}
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteClick(photo.id, visit.id);
                }}
                className="absolute right-2 top-2 z-20 rounded-md bg-[#B5483C] p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                title="写真を削除"
              >
                <Trash2 className="h-3 w-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-3 flex aspect-video items-center justify-center rounded-md border border-[#8C6A4A]/15 bg-[#E9DEC9]">
          <Camera className="h-10 w-10 text-[#8C6A4A]/40" />
        </div>
      )}

      <div className="mb-3 flex items-center gap-4 border-b border-[#8C6A4A]/15 pb-3">
        <button onClick={() => onLikeToggle(visit.id)} className="flex items-center gap-1 hover:opacity-75">
          <Heart className={`h-5 w-5 ${visit.is_liked ? 'fill-[#B5483C] text-[#B5483C]' : 'text-[#B5483C]'}`} />
          {visit.likes_count > 0 && <span className="font-pixel text-xs text-[#4F3828]">{visit.likes_count}</span>}
        </button>
        <button onClick={() => onBookmarkToggle(visit.id)} className="hover:opacity-75">
          <Bookmark className={`h-5 w-5 ${visit.is_bookmarked ? 'fill-[#DDA63A] text-[#DDA63A]' : 'text-[#DDA63A]'}`} />
        </button>
      </div>

      <div className="space-y-2">
        {visit.comment && <p className="font-pixelJp text-sm text-[#4F3828]">{visit.comment}</p>}
        {visit.notes && (
          <p className="font-pixelJp text-sm text-[#4F3828]">
            <span className="font-bold">メモ:</span> {visit.notes}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Calendar className="h-4 w-4 text-[#8C6A4A]" />
          <span className="font-pixelJp text-xs text-[#6A4D36]">
            {formatVisitDate(visit.visited_at, 'yyyy/MM/dd HH:mm')}
          </span>
        </div>
        <Link href={`/manhole/${visit.manhole.id}`} className="mt-2 inline-flex min-h-[38px] items-center rounded-md border border-[#8C6A4A]/25 bg-white px-4 font-pixelJp text-xs font-bold text-[#4F3828]">
          詳細を見る
        </Link>
      </div>
    </article>
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
