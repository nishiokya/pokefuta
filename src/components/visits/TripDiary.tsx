'use client';

import { useEffect, useMemo, useState } from 'react';
import { Manhole } from '@/types/database';
import VisitPhotoCard from '@/components/VisitPhotoCard';
import VisitVisibilityModal from '@/components/VisitVisibilityModal';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { updateVisitVisibility, publishAllPrivateVisits, showVisibilityToast } from '@/lib/visit-visibility';
import { EyeOff } from 'lucide-react';
import { manholeHeadingPlace } from '@/lib/manhole-label';

/**
 * スタンプ帳の「旅の記録」（/visits/trip）の本文。訪問を月ごとに並べ、公開/非公開をここで切り替える。
 *
 * 以前は単独ページのマイ旅（/my-trip）だった。プロフィールカードと達成率のヘッダーが
 * スタンプ帳と二重になっていたので、中身（非公開バナーと月別の一覧）だけをここに移した。
 * 訪問一覧はこの部品が自分で1回だけ取る（ページ側では取らない）。
 */

type JourneyVisit = {
  id: string;
  manhole_id: number | null;
  manhole?: Pick<Manhole, 'id' | 'prefecture' | 'municipality' | 'building' | 'title' | 'pokemons' | 'titles' | 'hashtags' | 'title_tags'> & { city?: string } | null;
  shot_at: string;
  display_name?: string | null;
  is_public?: boolean;
  photos: Array<{ id: string; thumbnail_url?: string; is_landscape?: boolean }>;
};

const getMunicipality = (manhole?: JourneyVisit['manhole']) =>
  manhole?.city || manhole?.municipality || '場所未設定';

const getManholeTags = (manhole?: JourneyVisit['manhole'], max = 2): string[] => {
  if (!manhole) return [];
  const tags: string[] = [];
  const titles = Array.isArray(manhole.titles) ? manhole.titles : [];
  [...titles]
    .sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0))
    .forEach((t: any) => { if (t.label && !tags.includes(t.label)) tags.push(t.label); });
  (Array.isArray(manhole.pokemons) ? manhole.pokemons : [])
    .forEach((p) => { if (!tags.includes(p)) tags.push(p); });
  return tags.slice(0, max);
};

export default function TripDiary() {
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<JourneyVisit[]>([]);
  const [showPrivateOnly, setShowPrivateOnly] = useState(false);
  const [unpublishModalVisitId, setUnpublishModalVisitId] = useState<string | null>(null);
  const [visibilitySavingVisitId, setVisibilitySavingVisitId] = useState<string | null>(null);
  // 一括公開は「押す → 確認 → 実行」の2段。件数が大きい操作なので、単体の公開
  // （望ましい操作なので即時）とは分けて、取り消せる余地を1タップぶん残す。
  const [bulkPublishConfirming, setBulkPublishConfirming] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const { trackVisitVisibilityChange, trackPrivateVisitsBannerClick } = useAnalytics();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/visits?limit=1000&include_manhole_tags=true');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.visits)) setVisits(data.visits);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 非公開件数は dedup 前の生データから数える（dedup すると取りこぼす）
  const privateCount = useMemo(
    () => visits.filter((v) => v.is_public === false).length,
    [visits]
  );

  // 公開/非公開の切り替え。楽観更新し、失敗したら元に戻す。
  const applyVisitVisibility = async (visitId: string, nextIsPublic: boolean) => {
    setVisibilitySavingVisitId(visitId);
    const setLocal = (value: boolean) =>
      setVisits((prev) =>
        prev.map((v) => (v.id === visitId ? { ...v, is_public: value } : v))
      );

    setLocal(nextIsPublic);
    const ok = await updateVisitVisibility(visitId, nextIsPublic);

    if (ok) {
      // surface はマイ旅のころの値（my_trip / my_trip_bulk）のまま。同じ画面・同じ操作なので、
      // 名前を変えずに1本の系列として前後を見る（2026-10 に /my-trip → /visits/trip へ移した）
      trackVisitVisibilityChange({ is_public: nextIsPublic, surface: 'my_trip' });
      showVisibilityToast(nextIsPublic ? '公開しました' : '非公開にしました');
    } else {
      setLocal(!nextIsPublic);
      showVisibilityToast('公開設定の変更に失敗しました', false);
    }
    setVisibilitySavingVisitId(null);
  };

  // 非公開の記録をまとめて公開する。楽観更新せず、成功件数を受け取ってから反映する
  // （何件通ったかはサーバ側の実際の UPDATE 件数でしか分からない）。
  const handlePublishAll = async () => {
    if (bulkPublishing) return;
    setBulkPublishing(true);
    const published = await publishAllPrivateVisits();

    if (published === null) {
      showVisibilityToast('公開設定の変更に失敗しました', false);
    } else {
      setVisits((prev) =>
        prev.map((v) => (v.is_public === false ? { ...v, is_public: true } : v))
      );
      trackVisitVisibilityChange({
        is_public: true,
        surface: 'my_trip_bulk',
        visit_count: published,
      });
      showVisibilityToast(`${published}件を公開しました`);
      setShowPrivateOnly(false);
    }

    setBulkPublishing(false);
    setBulkPublishConfirming(false);
  };

  const handleVisibilityToggle = (visitId: string, currentIsPublic: boolean) => {
    if (visibilitySavingVisitId) return;
    // 公開は望ましい操作なので即時。非公開に戻すときだけ、何を失うかを確認する。
    if (currentIsPublic) {
      setUnpublishModalVisitId(visitId);
    } else {
      void applyVisitVisibility(visitId, true);
    }
  };

  // Dedup by manholeId × date, then group by month
  const visitsByMonth = useMemo(() => {
    const seen = new Set<string>();
    const groups = new Map<string, JourneyVisit[]>();
    const source = showPrivateOnly ? visits.filter((v) => v.is_public === false) : visits;
    const sorted = [...source].sort(
      (a, b) => new Date(b.shot_at).getTime() - new Date(a.shot_at).getTime()
    );
    for (const visit of sorted) {
      const manholeId = visit.manhole?.id ?? visit.manhole_id;
      if (!manholeId) continue;
      const d = new Date(visit.shot_at);
      if (isNaN(d.getTime())) continue;
      const key = `${manholeId}-${d.toDateString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const monthKey = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      const group = groups.get(monthKey);
      if (group) group.push(visit);
      else groups.set(monthKey, [visit]);
    }
    return Array.from(groups.entries()).map(([label, vs]) => ({ label, visits: vs }));
  }, [visits, showPrivateOnly]);

  if (loading) {
    return (
      <div className="py-16 text-center font-pixelJp text-sm text-[#6A4D36]">
        読み込み中<span className="rpg-loading" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 非公開の記録があることを知らせるバナー。
          絞り込み中は privateCount が 0 になっても出し続ける（最後の1件を公開した直後に
          「すべての記録を表示」ボタンごと消えて空リストで詰むのを防ぐ）。 */}
      {(privateCount > 0 || showPrivateOnly) && (
        <div className="space-y-3 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm">
          <div className="flex items-start gap-2.5">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-[#7B63A8]" strokeWidth={2.2} />
            <div className="min-w-0">
              <p className="font-pixelJp text-sm font-bold text-[#7B63A8]">
                {privateCount > 0
                  ? `非公開の記録が${privateCount}件あります`
                  : '非公開の記録はなくなりました'}
              </p>
              <p className="mt-1 font-pixelJp text-xs leading-relaxed text-[#8C6A4A]">
                {privateCount > 0
                  ? '公開すると、みんなのマンホール詳細ページとあなたの公開スタンプ帳に載ります。個人メモは公開されません。'
                  : 'すべての記録が公開されています。'}
              </p>
            </div>
          </div>
          {privateCount > 0 && (
            bulkPublishConfirming ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBulkPublishConfirming(false)}
                  disabled={bulkPublishing}
                  className="rounded-[10px] border border-[#e9dfc7] bg-[#efe6cf] px-4 py-2.5 font-pixelJp text-xs font-bold text-[#4F3828] disabled:opacity-60"
                >
                  やめる
                </button>
                <button
                  type="button"
                  onClick={() => void handlePublishAll()}
                  disabled={bulkPublishing}
                  className="rounded-[10px] border border-[#7B63A8] bg-[#7B63A8] px-4 py-2.5 font-pixelJp text-xs font-bold text-white disabled:opacity-60"
                >
                  {bulkPublishing ? '公開中...' : `${privateCount}件を公開する`}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBulkPublishConfirming(true)}
                className="w-full rounded-[10px] border border-[#7B63A8] bg-[#7B63A8] px-4 py-2.5 font-pixelJp text-xs font-bold text-white"
              >
                非公開の{privateCount}件をすべて公開する
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => {
              const next = !showPrivateOnly;
              setShowPrivateOnly(next);
              if (next) trackPrivateVisitsBannerClick({ private_count: privateCount });
            }}
            className="w-full rounded-[10px] border border-[#e9dfc7] bg-[#efe6cf] px-4 py-2.5 font-pixelJp text-xs font-bold text-[#4F3828]"
          >
            {showPrivateOnly ? 'すべての記録を表示' : '非公開の記録だけ表示する →'}
          </button>
        </div>
      )}

      {/* Monthly diary */}
      {visitsByMonth.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-pixelJp text-sm text-[#8C6A4A]">まだ訪問記録がありません</p>
          <p className="mt-2 font-pixelJp text-xs text-[#8C6A4A]/70">
            近くのポケふたを探して最初の記録をしよう
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {visitsByMonth.map(({ label, visits: monthVisits }) => (
            <div key={label}>
              <div className="mb-3 flex items-center gap-2">
                <span className="font-pixelJp text-sm font-bold text-[#4F3828]" style={{ whiteSpace: 'nowrap' }}>
                  {label}
                </span>
                <span className="rounded-full bg-[#e9dfc7] px-2 py-0.5 font-pixelJp text-xs text-[#6A4D36]">
                  {monthVisits.length}件
                </span>
                <hr className="flex-1 border-[#e9dfc7]" />
              </div>
              <div className="grid grid-cols-2 gap-[14px]">
                {monthVisits.map((visit) => {
                  const manholeId = visit.manhole?.id ?? visit.manhole_id;
                  if (!manholeId) return null;
                  const municipality = getMunicipality(visit.manhole);
                  // 詳細ページの h1 と同じ（施設名があれば「〈県〉〈市区町村〉 〈施設名〉のポケふた」）
                  const title = visit.manhole ? manholeHeadingPlace(visit.manhole) : `${municipality}のポケふた`;
                  const d = new Date(visit.shot_at);
                  const dateStr = isNaN(d.getTime()) ? '' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                  return (
                    <VisitPhotoCard
                      key={`${manholeId}-${visit.shot_at}`}
                      manholeId={manholeId}
                      thumbnailUrl={visit.photos?.[0]?.thumbnail_url}
                      isLandscape={visit.photos?.[0]?.is_landscape}
                      title={title}
                      date={dateStr}
                      posterName={visit.display_name}
                      isPublic={visit.is_public !== false}
                      isVisibilitySaving={visibilitySavingVisitId === visit.id}
                      onToggleVisibility={() =>
                        handleVisibilityToggle(visit.id, visit.is_public !== false)
                      }
                      tags={getManholeTags(visit.manhole, 2)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <VisitVisibilityModal
        isOpen={unpublishModalVisitId !== null}
        isSaving={visibilitySavingVisitId !== null}
        onCancel={() => setUnpublishModalVisitId(null)}
        onConfirm={async () => {
          const visitId = unpublishModalVisitId;
          if (!visitId) return;
          setUnpublishModalVisitId(null);
          await applyVisitVisibility(visitId, false);
        }}
      />
    </div>
  );
}
