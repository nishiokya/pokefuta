
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MapPin, ArrowLeft, Navigation, Building2,
  Flag, Users, Trophy, Lock, Plus, Image as ImageIcon,
  Sparkles, ChevronUp, Eye, EyeOff, Heart,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { Manhole } from '@/types/database';
import DeletePhotoModal from '@/components/DeletePhotoModal';
import VisitVisibilityModal from '@/components/VisitVisibilityModal';
import ShareButtons from '@/components/ShareButtons';
import { useHeaderTitle } from '@/components/SiteChrome';
import PCShell from '@/components/PCShell';
import ManholeCommentThread from '@/components/comments/ManholeCommentThread';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { calculateDistance } from '@/lib/location';
import { orderManholePhotosForViewer } from '@/lib/manhole-photo-ranking';
import { manholeShareText, photoShareText } from '@/lib/share';
import { updateVisitVisibility, showVisibilityToast } from '@/lib/visit-visibility';
import { SITE_URL } from '@/lib/constants';
import {
  filterPokemons,
  formatDistanceKm,
  manholeLabel,
  manholePlaceLabel,
} from '@/lib/manhole-label';
import { prefectureDexUrl } from '@/lib/prefectureSlug';
import type { ManholeTitle } from '@/types/database';

const MapComponent = dynamic(
  () => import('@/components/Map/MapComponent'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[140px] bg-[#F6EEDC] border border-[#e9dfc7] flex items-center justify-center">
        <div className="font-pixelJp text-[#6f6657] text-sm">読み込み中…</div>
      </div>
    ),
  }
);

interface Photo {
  id: string;
  storage_key: string;
  content_type: string;
  created_at: string;
  // The scoring project can expose any of these during its rollout.
  // Keep ranking client-side compatible while unscored photos fall back to recency.
  score?: number | null;
  quality_score?: number | null;
  ranking_score?: number | null;
  visit?: {
    id: string;
    user_id: string;
    display_name?: string | null;
    public_user_id?: string | null;
    shot_at: string;
    created_at?: string;
    note?: string;
    comment?: string;
    is_public?: boolean;
  };
}

const getPhotoUserLabel = (photo: Photo) => {
  const name = photo.visit?.display_name;
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;
  const uid = photo.visit?.user_id;
  if (uid && uid.length >= 8) return `ユーザー:${uid.slice(0, 8)}`;
  return '名無しのトレーナー';
};

const getSortedTitles = (titles?: ManholeTitle[] | null) =>
  [...(Array.isArray(titles) ? titles : [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

const getTopTitleHashtags = (titles?: ManholeTitle[] | null) =>
  getSortedTitles(titles)
    .slice(0, 2)
    .map((title) => title.hashtag)
    .filter((hashtag): hashtag is string => Boolean(hashtag));

const getTitlePillClass = (index: number) => {
  const classes = [
    'bg-[#fdeae2] text-[#bf5640]',
    'bg-[#ece9fb] text-[#6a5fc4]',
    'bg-[#e2f2e9] text-[#1f9d63]',
  ];
  return classes[index] || classes[0];
};

const formatPhotoDate = (shot_at: string) => {
  const d = new Date(shot_at);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

function PhotoLikeButton({
  visitId,
  isLoggedIn,
  loginHref,
  variant = 'default',
}: {
  visitId: string;
  isLoggedIn: boolean;
  loginHref: string;
  variant?: 'default' | 'gallery';
}) {
  const router = useRouter();
  const [likes, setLikes] = useState(0);
  const [userLiked, setUserLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/visits/${visitId}/social`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error('social fetch failed')))
      .then((data) => {
        if (!active) return;
        setLikes(Number(data.likes) || 0);
        setUserLiked(Boolean(data.userLiked));
      })
      .catch(() => {
        // いいね取得失敗で写真自体を壊さない。
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [visitId]);

  useEffect(() => {
    const syncLikeState = (event: Event) => {
      const detail = (event as CustomEvent<{ visitId: string; likes: number; userLiked: boolean }>).detail;
      if (detail?.visitId !== visitId) return;
      setLikes(detail.likes);
      setUserLiked(detail.userLiked);
    };
    window.addEventListener('pokefuta:photo-like', syncLikeState);
    return () => window.removeEventListener('pokefuta:photo-like', syncLikeState);
  }, [visitId]);

  const broadcastLikeState = (nextLikes: number, nextUserLiked: boolean) => {
    window.dispatchEvent(new CustomEvent('pokefuta:photo-like', {
      detail: { visitId, likes: nextLikes, userLiked: nextUserLiked },
    }));
  };

  const toggleLike = async () => {
    if (!isLoggedIn) {
      router.push(loginHref);
      return;
    }
    if (loading || saving) return;

    const previousLiked = userLiked;
    const previousLikes = likes;
    const nextLiked = !previousLiked;
    const nextLikes = Math.max(0, previousLikes + (nextLiked ? 1 : -1));
    setUserLiked(nextLiked);
    setLikes(nextLikes);
    broadcastLikeState(nextLikes, nextLiked);
    setSaving(true);

    try {
      const response = await fetch(`/api/visits/${visitId}/like`, {
        method: previousLiked ? 'DELETE' : 'POST',
      });
      if (response.status === 401) {
        setUserLiked(previousLiked);
        setLikes(previousLikes);
        broadcastLikeState(previousLikes, previousLiked);
        router.push(loginHref);
        return;
      }
      if (!response.ok) throw new Error('like toggle failed');
    } catch {
      setUserLiked(previousLiked);
      setLikes(previousLikes);
      broadcastLikeState(previousLikes, previousLiked);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void toggleLike();
      }}
      disabled={saving}
      aria-pressed={userLiked}
      aria-label={userLiked ? `いいねを取り消す（${likes}件）` : `いいねする（${likes}件）`}
      className={`inline-flex shrink-0 items-center rounded-full border font-bold backdrop-blur-sm transition-colors disabled:opacity-60 ${
        variant === 'gallery'
          ? 'min-h-8 min-w-8 justify-center gap-1 px-2 py-1 text-[10px] shadow-sm'
          : 'min-h-8 gap-1 px-2.5 py-1 text-[11px]'
      } ${
        userLiked
          ? 'border-[#f4a6a6] bg-white/95 text-[#c94b4b]'
          : 'border-white/40 bg-black/45 text-white hover:bg-black/60'
      }`}
    >
      <Heart className={`${variant === 'gallery' ? 'h-4 w-4' : 'h-3.5 w-3.5'} ${userLiked ? 'fill-current' : ''}`} strokeWidth={2.3} />
      <span>{loading ? '–' : likes}</span>
    </button>
  );
}

export default function ManholeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [manhole, setManhole] = useState<Manhole | null>(null);
  const [allManholes, setAllManholes] = useState<Manhole[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [prefectureDex, setPrefectureDex] = useState<{ current: number; total: number } | null>(null);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const photoRequestIdRef = useRef(0);

  const [unpublishModalVisitId, setUnpublishModalVisitId] = useState<string | null>(null);
  const [visibilitySavingVisitId, setVisibilitySavingVisitId] = useState<string | null>(null);

  const { trackManholeDetailOpen, trackRouteOpen, trackVisitDelete, trackVisitVisibilityChange } = useAnalytics();

  useEffect(() => {
    const manholeId = params.id;
    if (manholeId) {
      setSelectedPhotoIdx(0);
      setPhotoExpanded(false);
      loadManholeDetail(manholeId as string);
      loadPhotos(manholeId as string);
      loadCurrentUser();
    }
  }, [params.id]);

  useEffect(() => {
    if (manhole?.prefecture && prefectureDex?.total && currentUserId) {
      loadPrefectureVisited(manhole.prefecture, prefectureDex.total);
    }
  }, [manhole?.prefecture, prefectureDex?.total, currentUserId]);

  useEffect(() => {
    if (manhole) {
      trackManholeDetailOpen({
        manhole_id: manhole.id,
        prefecture: manhole.prefecture,
        pokemon_ids: manhole.pokemons?.join(','),
      });
    }
  }, [manhole?.id]);

  // title / meta description / JSON-LD はここでは触らない。
  // `page.tsx` の `generateMetadata` とサーバ描画の JSON-LD が唯一の出どころ。
  //
  // 以前はこの位置の useEffect が3点とも別ルールで上書きしており、クローラとOGPが
  // 見るサーバ側の値と、人が見るクライアント側の値が食い違っていた。しかも図鑑
  // （data.pokefuta.com）と形式が揃っていたのは**クライアント側だけ**で、揃っている
  // 方が検索エンジンには届いていなかった。JSON-LD に至っては JS を実行しない
  // クローラには1件も届いていない。

  const loadCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user?.id) setCurrentUserId(data.user.id);
      }
    } catch (err) {
      console.error('Failed to load current user:', err);
    } finally {
      // セッション取得は蓋の取得と別便なので、返るまでは「未ログイン」と区別する。
      // コメント欄はこれを見て、判定前にログインCTAを出さないようにしている。
      setAuthChecked(true);
    }
  };

  const loadManholeDetail = async (id: string) => {
    try {
      const response = await fetch('/api/manholes');
      if (response.ok) {
        const data = await response.json();
        const manholesList: Manhole[] = data.manholes || [];
        setAllManholes(manholesList);
        const foundManhole = manholesList.find((m: Manhole) => m.id.toString() === id);
        if (foundManhole) {
          setManhole(foundManhole);
          const prefTotal = manholesList.filter((m) => m.prefecture === foundManhole.prefecture).length;
          setPrefectureDex((prev) =>
            prev ? { ...prev, total: prefTotal } : { current: 0, total: prefTotal }
          );
        } else {
          setError('マンホールが見つかりませんでした');
        }
      } else {
        setError('データの取得に失敗しました');
      }
    } catch (err) {
      console.error('Failed to load manhole detail:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const loadPrefectureVisited = async (prefecture: string, total: number) => {
    try {
      const res = await fetch('/api/visits?limit=1000');
      if (!res.ok) return;
      const data = await res.json();
      const visits: Array<{ manhole?: { prefecture?: string; id?: number } }> = Array.isArray(data.visits)
        ? data.visits
        : [];
      const visitedIds = new Set<number>(
        visits
          .filter((v: any) => v.manhole?.prefecture === prefecture && v.manhole?.id)
          .map((v: any) => v.manhole.id as number)
      );
      setPrefectureDex({ current: visitedIds.size, total });
    } catch {
      // keep defaults
    }
  };

  const loadPhotos = async (id: string) => {
    const requestId = ++photoRequestIdRef.current;
    setPhotosLoading(true);
    setPhotoLoadError(false);
    try {
      const pageSize = 100;
      const loadedPhotos: Photo[] = [];
      let offset = 0;
      let total = 0;

      do {
        const response = await fetch(`/api/image-upload?manhole_id=${id}&limit=${pageSize}&offset=${offset}`);
        if (!response.ok) throw new Error('photo page fetch failed');
        const data = await response.json();
        if (!data.success || !Array.isArray(data.images)) throw new Error('invalid photo page');
        loadedPhotos.push(...data.images);
        total = Number(data.total) || loadedPhotos.length;
        offset += data.images.length;
        if (data.images.length === 0 && loadedPhotos.length < total) {
          throw new Error('photo pagination ended early');
        }
      } while (loadedPhotos.length < total);

      // ページ遷移中に前の蓋の写真で上書きしない。
      if (requestId === photoRequestIdRef.current) {
        setPhotos(loadedPhotos);
      }
    } catch (err) {
      console.error('Failed to load photos:', err);
      if (requestId === photoRequestIdRef.current) {
        setPhotos([]);
        setPhotoLoadError(true);
      }
    } finally {
      if (requestId === photoRequestIdRef.current) {
        setPhotosLoading(false);
      }
    }
  };

  const handleManholeClick = (clickedManhole: Manhole) => {
    router.push(`/manhole/${clickedManhole.id}`);
  };

  const openInMaps = () => {
    if (manhole?.latitude && manhole?.longitude) {
      trackRouteOpen({ manhole_id: manhole.id, prefecture: manhole.prefecture });
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${manhole.latitude},${manhole.longitude}`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  const handleDeleteClick = (photoId: string, visitId?: string) => {
    setSelectedPhotoId(photoId);
    setSelectedVisitId(visitId || null);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPhotoId || !selectedVisitId) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/visits/${selectedVisitId}`, { method: 'DELETE' });
      const data = await response.json();
      if (response.ok && data.success) {
        trackVisitDelete({ manhole_id: manhole?.id });
        const deletedIds = new Set<string>(data.photo_ids || [selectedPhotoId]);
        const updatedPhotos = photos.filter((p) => !deletedIds.has(p.id));
        setPhotos(updatedPhotos);
        setSelectedPhotoIdx(0);
        setDeleteModalOpen(false);
        setSelectedPhotoId(null);
        setSelectedVisitId(null);
        alert(
          data.visit_deleted
            ? updatedPhotos.length === 0
              ? '写真と訪問記録を削除しました。このマンホールの写真はすべて削除されました。'
              : '写真と訪問記録を削除しました'
            : updatedPhotos.length === 0
            ? '写真を削除しました。このマンホールの写真はすべて削除されました。'
            : '写真を削除しました'
        );
      } else {
        alert(`削除に失敗しました: ${data.error || '不明なエラー'}`);
      }
    } catch {
      alert('削除中にエラーが発生しました');
    } finally {
      setIsDeleting(false);
    }
  };

  // 公開/非公開の切り替え。楽観更新し、失敗したら元に戻す（visits ページの
  // handleLikeToggle と同じパターン）。
  const applyVisitVisibility = async (visitId: string, nextIsPublic: boolean) => {
    setVisibilitySavingVisitId(visitId);
    const setLocal = (value: boolean) =>
      setPhotos((prev) =>
        prev.map((p) =>
          p.visit?.id === visitId ? { ...p, visit: { ...p.visit, is_public: value } } : p
        )
      );

    setLocal(nextIsPublic);
    const ok = await updateVisitVisibility(visitId, nextIsPublic);

    if (ok) {
      trackVisitVisibilityChange({
        manhole_id: manhole?.id,
        is_public: nextIsPublic,
        surface: 'manhole_detail',
      });
      showVisibilityToast(nextIsPublic ? '公開しました' : '非公開にしました');
    } else {
      setLocal(!nextIsPublic);
      showVisibilityToast('公開設定の変更に失敗しました', false);
    }
    setVisibilitySavingVisitId(null);
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

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setSelectedPhotoId(null);
    setSelectedVisitId(null);
  };

  const sharePayload = useMemo(() => {
    if (!manhole) return null;
    const municipality = manhole.city || manhole.municipality || '場所未設定';
    const titleHashtags = getTopTitleHashtags(manhole.titles);
    const shareablePhoto = photos.find(
      (photo) => currentUserId && photo.visit?.user_id === currentUserId && photo.visit?.is_public === true
    );
    const pokemons = manhole.pokemons ?? [];
    const shareText = shareablePhoto
      ? photoShareText(`${manhole.prefecture}${municipality}`, titleHashtags, pokemons)
      : manholeShareText(`${manhole.prefecture}${municipality}`, pokemons);
    const shareUrl = shareablePhoto
      ? `${SITE_URL}/p/${shareablePhoto.id}`
      : `${SITE_URL}/manhole/${manhole.id}`;
    return { shareText, shareUrl, hashtags: titleHashtags, analyticsParams: { manhole_id: manhole.id, prefecture: manhole.prefecture } };
  }, [manhole, photos, currentUserId]);

  // 周辺・同ポケモンの回遊リスト
  const related = useMemo(() => {
    if (!manhole || allManholes.length === 0) {
      return { nearby: [] as Array<{ manhole: Manhole; distance: number }>, samePokemon: [] as Manhole[] };
    }
    const others = allManholes.filter((m) => m.id !== manhole.id);
    const nearby =
      manhole.latitude && manhole.longitude
        ? others
            .filter((m) => m.latitude && m.longitude)
            .map((m) => ({
              manhole: m,
              distance: calculateDistance(manhole.latitude!, manhole.longitude!, m.latitude!, m.longitude!),
            }))
            .filter((e) => e.distance <= 30)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 5)
        : [];
    const pokemonSet = new Set(manhole.pokemons ?? []);
    const samePokemon =
      pokemonSet.size > 0
        ? others.filter((m) => (m.pokemons ?? []).some((p) => pokemonSet.has(p))).slice(0, 6)
        : [];
    return { nearby, samePokemon };
  }, [manhole, allManholes]);

  const detailMapManholes = useMemo(() => manhole ? [manhole] : [], [manhole]);

  // 早期 return より前に呼ぶ（フックの呼び出し順を固定するため）
  useHeaderTitle(manhole ? `${manhole.city || manhole.municipality || '場所未設定'}のポケふた` : undefined);

  if (loading) {
    return (
      <div className="min-h-content safe-area-body bg-[#F6EEDC] flex items-center justify-center">
        <div className="font-pixelJp text-[#7B63A8]">
          読み込み中<span className="rpg-loading" />
        </div>
      </div>
    );
  }

  if (error || !manhole) {
    return (
      <div className="min-h-content safe-area-body bg-[#F6EEDC]">
        <div className="bg-[#F6EEDC] border-b border-[#7B63A8]/20 p-4">
          <button onClick={() => router.back()} className="rpg-button p-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center justify-center min-h-[60vh] p-4">
          <div className="rpg-window text-center">
            <MapPin className="w-16 h-16 text-rpg-textDark opacity-50 mx-auto mb-4" />
            <h2 className="font-pixelJp text-lg text-rpg-textDark mb-2">エラー</h2>
            <p className="font-pixelJp text-sm text-rpg-textDark opacity-70 mb-4">{error}</p>
            <button onClick={() => router.push('/nearby')} className="rpg-button rpg-button-primary">
              <span className="font-pixelJp">近くを探す</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived photo state ────────────────────────────────────────────
  const isLoggedIn = currentUserId !== null;
  const { myPhotos, orderedPhotos: allDisplayPhotos } = orderManholePhotosForViewer(
    photos,
    currentUserId
  );
  const photoState: 'none' | 'mine' | 'community' =
    photos.length === 0 ? 'none' : myPhotos.length > 0 ? 'mine' : 'community';
  const safeIdx = Math.min(selectedPhotoIdx, Math.max(0, allDisplayPhotos.length - 1));
  const featuredPhoto = allDisplayPhotos[safeIdx] ?? null;
  const galleryPreviewPhotos = allDisplayPhotos.slice(0, 3);
  const photoContributorCount = new Set(
    allDisplayPhotos.map((photo) => photo.visit?.user_id).filter(Boolean)
  ).size;
  const municipality = manhole.city || manhole.municipality || '場所未設定';
  const prefectureDexHref = prefectureDexUrl(manhole.prefecture);
  const titleBadges = getSortedTitles(manhole.titles);
  // h1 の括弧の中身。空なら括弧ごと出さない（図鑑の h1 と同じ規則。`manholeHeading()` 参照）
  const headingPokemons = filterPokemons(manhole.pokemons);

  const renderRelatedCards = (items: Array<{ manhole: Manhole; distance?: number }>) => (
    <div className="flex flex-col gap-2">
      {items.map(({ manhole: m, distance }) => (
        <button
          key={m.id}
          type="button"
          onClick={() => router.push(`/manhole/${m.id}`)}
          className="flex items-center gap-2 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] px-4 py-3 text-left shadow-sm transition-colors hover:bg-[#fbf6ea]"
        >
          <MapPin className="h-4 w-4 shrink-0 text-[#9b917e]" strokeWidth={2} />
          {/*
            **truncate を付けない。** ラベルの末尾にはその蓋を関連たらしめるポケモンが来る
            （「同じポケモンのポケふた」なら共通のポケモン）ので、1行に収めて省略すると
            肝心の語が消える。実測では 390px 端末で
            「宮城県仙台のポケふた（ウミディグダ・チョンチー・ホエルコ・」まで出て
            ラプラスが落ちていた。図鑑側も折り返しており、省略はしていない。
          */}
          <span className="min-w-0 flex-1 font-pixelJp text-xs font-bold leading-snug text-[#2c2a26]">
            {manholeLabel(m)}
          </span>
          {distance !== undefined && (
            <span className="shrink-0 font-['Outfit'] text-xs font-bold text-[#9b917e]">
              {formatDistanceKm(distance)}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  // ── PromptCard (two copies: SP inline + PC rail) ────────────────────
  // PCShell renders `rail` on mobile BEFORE children (above gallery).
  // To avoid that, wrap the rail in `hidden lg:block` to suppress mobile;
  // the inline copy (below title, `lg:hidden`) serves SP instead.
  const promptCardContent = (
    <div
      className="overflow-hidden rounded-[18px] shadow-sm"
      style={{
        border: photoState === 'mine' && isLoggedIn ? '1.5px solid #c7e6d3' : '1.5px solid #efd9a3',
        background: '#fffdf7',
      }}
    >
      {/* Ribbon */}
      <div
        className="flex items-center gap-2.5 px-[14px] py-[11px]"
        style={{
          background:
            photoState === 'mine' && isLoggedIn
              ? 'linear-gradient(100deg,#e2f2e9,#eaf6ee)'
              : 'linear-gradient(100deg,#fdeae2,#fdf1e6)',
        }}
      >
        {photoState === 'mine' && isLoggedIn ? (
          <Trophy className="h-4 w-4 shrink-0 text-[#1f9d63]" strokeWidth={2.2} />
        ) : photoState === 'none' ? (
          <Flag className="h-4 w-4 shrink-0 text-[#bf5640]" strokeWidth={2.4} />
        ) : (
          <ImageIcon className="h-4 w-4 shrink-0 text-[#bf5640]" strokeWidth={2.2} />
        )}
        <span
          className="min-w-0 flex-1 font-pixelJp text-[12.5px] font-bold"
          style={{ color: photoState === 'mine' && isLoggedIn ? '#1c6e49' : '#7d4536' }}
        >
          {photoState === 'none'
            ? 'まだ誰も投稿していない'
            : photoState === 'mine' && isLoggedIn
            ? 'あなたの記録済み'
            : isLoggedIn
            ? 'あなたはまだ未記録'
            : 'あなたの記録を残そう'}
        </span>
        {photoState === 'none' && (
          <span className="ml-auto flex shrink-0 items-baseline gap-1">
            <span className="font-['Outfit'] text-[15px] font-black text-[#9b917e]">0人</span>
            <span className="text-[#d6b8a8] text-sm">›</span>
            <span className="font-['Outfit'] text-[18px] font-black text-[#bf5640]">#1</span>
          </span>
        )}
        {photoState === 'mine' && isLoggedIn && prefectureDex && (
          <span className="ml-auto shrink-0 font-['Outfit'] text-[14px] font-black text-[#1f9d63]">
            {prefectureDex.current} / {prefectureDex.total} 達成
          </span>
        )}
        {photoState === 'community' && isLoggedIn && (
          <span className="ml-auto flex shrink-0 items-baseline gap-0.5">
            <span className="font-['Outfit'] text-[20px] font-black text-[#bf5640]">0</span>
            <span className="font-['Outfit'] text-xs font-bold text-[#9b917e]">/1 図鑑</span>
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-[11px] p-[14px]">
        {/* Heading */}
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]"
            style={{ background: photoState === 'mine' && isLoggedIn ? '#d6efdf' : '#fde2c2' }}
          >
            <Trophy
              className="h-4 w-4"
              style={{ color: photoState === 'mine' && isLoggedIn ? '#1f9d63' : '#b87d0a' }}
              strokeWidth={2.2}
            />
          </span>
          <span className="font-pixelJp text-[13.5px] font-bold">
            {photoState === 'mine' && isLoggedIn ? 'この場所はコンプリート' : '撮ると写真図鑑も埋まる'}
          </span>
        </div>

        {/* Dex */}
        {!isLoggedIn ? (
          <div className="flex items-center gap-2.5 rounded-[12px] border border-[#e9dfc7] bg-[#fbf6ea] p-[11px]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#ece9fb]">
              <Lock className="h-3.5 w-3.5 text-[#6a5fc4]" strokeWidth={2.1} />
            </span>
            <p className="font-pixelJp text-xs font-semibold leading-snug text-[#6f6657]">
              ログインすると<strong className="text-[#2c2a26]">あなたの写真図鑑</strong>に記録されます
            </p>
          </div>
        ) : photoState === 'mine' ? (
          <div className="flex items-center gap-3 rounded-[12px] border border-[#e9dfc7] bg-[#fbf6ea] p-[11px]">
            <div className="flex-1">
              <p className="font-pixelJp text-[11.5px] font-semibold text-[#6f6657]">
                {manhole.prefecture} 写真図鑑
              </p>
              <p className="font-['Outfit'] text-[18px] font-black leading-tight text-[#1f9d63]">
                {prefectureDex?.current ?? '?'}{' '}
                <span className="text-[13px] font-semibold text-[#9b917e]">
                  / {prefectureDex?.total ?? '?'}
                </span>
              </p>
            </div>
            <span className="flex items-center gap-1.5 font-pixelJp text-[11.5px] font-bold text-[#1f9d63]">
              <Trophy className="h-3.5 w-3.5" strokeWidth={2.2} />記録済み
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-[12px] border border-[#e9dfc7] bg-[#fbf6ea] p-[11px]">
            <div className="flex-1">
              <p className="font-pixelJp text-[11.5px] font-semibold text-[#6f6657]">
                {manhole.prefecture} 写真図鑑
              </p>
              <p className="font-['Outfit'] text-[18px] font-black leading-tight">
                {prefectureDex?.current ?? 0}
                <span className="text-[#9b917e] text-[13px]"> → </span>
                <span className="text-[#bf5640]">{(prefectureDex?.current ?? 0) + 1}</span>
                <span className="text-[13px] font-semibold text-[#9b917e]">
                  {' '}/ {prefectureDex?.total ?? '?'}
                </span>
              </p>
            </div>
            <div className="h-8 w-px bg-[#e9dfc7]" />
            <div className="text-center">
              <p className="font-['Outfit'] text-[20px] font-black leading-none text-[#1f9d63]">+1</p>
              <p className="mt-0.5 font-pixelJp text-[10px] font-semibold text-[#9b917e]">シリーズ進捗</p>
            </div>
          </div>
        )}

        {/* CTA */}
        {photoState === 'mine' && isLoggedIn ? (
          <button
            type="button"
            onClick={() => router.push(`/upload?manhole_id=${params.id}`)}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#ecccc1] bg-white py-3 font-pixelJp text-sm font-bold text-[#bf5640] transition-colors hover:bg-[#fdeae2]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            別の構図を追加する
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => router.push(isLoggedIn ? `/upload?manhole_id=${params.id}` : `/login?redirect=${encodeURIComponent(`/upload?manhole_id=${params.id}`)}`)}
              className={`flex w-full items-center justify-center gap-2 rounded-[14px] py-3 font-pixelJp text-sm font-bold transition-colors ${
                isLoggedIn
                  ? 'border border-[#ecccc1] bg-white text-[#bf5640] hover:bg-[#fdeae2]'
                  : 'bg-[#bf5640] text-white shadow-[0_2px_0_#a8462f] hover:opacity-90'
              }`}
            >
              {!isLoggedIn ? (
                <Lock className="h-4 w-4" strokeWidth={2} />
              ) : photoState === 'none' ? (
                <Flag className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              )}
              {!isLoggedIn
                ? photoState === 'none'
                  ? 'ログインして一番乗り'
                  : 'ログインして投稿する'
                : photoState === 'none'
                ? '一番乗りで投稿する'
                : 'あなたの1枚を加える'}
            </button>
            {isLoggedIn && (
              <p className="flex items-center gap-1.5 font-pixelJp text-[11px] leading-snug text-[#9b917e]">
                <Users className="h-3 w-3 shrink-0" strokeWidth={2} />
                ナビの「投稿」からいつでも追加できます
              </p>
            )}
          </>
        )}

        {/* Hints */}
        {photoState === 'mine' && isLoggedIn && (
          <p className="flex items-center gap-2 font-pixelJp text-[11.5px] leading-snug text-[#9b917e]">
            <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            季節や時間帯を変えた1枚が、この場所の魅力をもっと伝えます。
          </p>
        )}
        {!isLoggedIn && (
          <p className="flex items-center gap-1.5 font-pixelJp text-[11.5px] text-[#9b917e]">
            <Sparkles className="h-3 w-3 shrink-0" strokeWidth={2} />
            ログインは無料・30秒。スタンプ帳もそのまま使えます。
          </p>
        )}
      </div>
    </div>
  );

  // Every photo on this manhole, always visible — no "+N" gate, nobody's shot stays hidden.
  const allPhotosGrid = allDisplayPhotos.length > 1 ? (
    <div className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-pixelJp text-xs font-bold text-[#2c2a26]">すべての写真</span>
        <span className="font-['Outfit'] text-xs font-bold text-[#8b816f]">{allDisplayPhotos.length}枚</span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
        {allDisplayPhotos.map((photo, index) => (
          <div
            key={photo.id}
            className={`relative aspect-square overflow-hidden rounded-[10px] border-2 ${
              photoExpanded && featuredPhoto?.id === photo.id ? 'border-[#bf5640]' : 'border-transparent'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedPhotoIdx(index);
                setPhotoExpanded(true);
                requestAnimationFrame(() => {
                  document.getElementById('featured-manhole-photo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
              }}
              aria-label={`${index + 1}枚目、@${getPhotoUserLabel(photo)}さんの写真を表示`}
              className="block h-full w-full p-0"
            >
              <img
                src={`/api/photo/${photo.id}?size=small`}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
            {photo.visit?.id && (
              <span className="absolute right-1 top-1 z-10">
                <PhotoLikeButton
                  visitId={photo.visit.id}
                  isLoggedIn={isLoggedIn}
                  loginHref={`/login?redirect=${encodeURIComponent(`/manhole/${params.id}`)}`}
                  variant="gallery"
                />
              </span>
            )}
            <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 font-['Outfit'] text-[9px] font-bold text-white">
              {index + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  // Rail wrapper: hidden on mobile so PCShell doesn't render it above the gallery.
  // PCShell's own hidden lg:block wrapper makes it appear only in the sticky right column.
  const promptCard = !photosLoading && !photoLoadError && photoState === 'none'
    ? <div className="hidden lg:block">{promptCardContent}</div>
    : null;

  return (
    <div className="min-h-content safe-area-body bg-[#f1e8d4]">
      <PCShell className="pb-32 pt-3 lg:pt-6" rail={promptCard}>
        <div className="flex flex-col gap-5 max-w-2xl lg:max-w-none">
          {/* ── Gallery ── */}
          {photosLoading ? (
            <div className="flex h-[210px] items-center justify-center rounded-[16px] border border-[#e9dfc7] bg-[#ece2cd] lg:h-[360px] lg:rounded-[18px]">
              <span className="font-pixelJp text-sm font-bold text-[#8b816f]">
                写真を読み込み中<span className="rpg-loading" />
              </span>
            </div>
          ) : photoLoadError ? (
            <div className="flex h-[210px] flex-col items-center justify-center gap-3 rounded-[16px] border border-[#e9dfc7] bg-[#fffdf7] px-4 text-center lg:h-[360px] lg:rounded-[18px]">
              <p className="font-pixelJp text-sm font-bold text-[#6f6657]">写真を読み込めませんでした</p>
              <button
                type="button"
                onClick={() => loadPhotos(String(params.id))}
                className="rounded-full border border-[#d7c8a7] bg-white px-4 py-2 font-pixelJp text-xs font-bold text-[#6f6657]"
              >
                もう一度読み込む
              </button>
            </div>
          ) : photoState === 'none' ? (
            <div
              className="relative overflow-hidden rounded-[16px] lg:rounded-[18px] border-2 border-dashed border-[#cdbf9f] h-[210px] lg:h-[360px] flex items-center justify-center"
              style={{ background: 'repeating-linear-gradient(135deg,#f3ecdc 0 12px,#ece2cd 12px 24px)' }}
            >
              <div className="text-center">
                <div className="font-['Outfit'] text-[44px] lg:text-[72px] font-black leading-none text-[#cdbb92]">0</div>
                <div className="mt-2 font-pixelJp text-sm font-bold text-[#6f6657]">
                  この場所の写真はまだ0枚
                </div>
                <div className="mt-1 font-pixelJp text-xs font-bold text-[#bf5640]">
                  あなたが最初の記録者に
                </div>
              </div>
              <div className="absolute left-3 top-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ead9a8] bg-[rgba(255,247,229,0.94)] px-2.5 py-1 font-pixelJp text-[11px] font-bold text-[#9a6d05] shadow-sm">
                  <Flag className="h-3 w-3 text-[#bf8a17]" strokeWidth={2.4} />
                  一番乗りチャンス
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {photoExpanded && featuredPhoto ? (
                <>
                  <div
                    id="featured-manhole-photo"
                    className="relative block aspect-[3/4] w-full overflow-hidden rounded-[16px] border border-[#e9dfc7] bg-[#1c1a17] p-0 shadow-sm lg:aspect-auto lg:h-[72vh] lg:max-h-[760px] lg:rounded-[18px]"
                  >
                    <img
                      src={`/api/photo/${featuredPhoto.id}?size=large`}
                      alt={`@${getPhotoUserLabel(featuredPhoto)}さんのポケふた写真`}
                      className="h-full w-full object-contain"
                    />
                    {featuredPhoto.visit?.user_id === currentUserId && (
                      <span className="absolute right-3 top-3 rounded-full bg-[#1f9d63]/95 px-2.5 py-1 font-pixelJp text-[11px] font-bold text-white">
                        あなたの投稿
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPhotoExpanded(false)}
                      aria-label="写真一覧に戻る"
                      className="absolute left-3 top-3 z-10 inline-flex min-h-8 items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-pixelJp text-[11px] font-bold text-white backdrop-blur-sm"
                    >
                      <ChevronUp className="h-3 w-3" strokeWidth={2.6} />一覧に戻る
                    </button>
                    <div className="absolute inset-x-0 bottom-0 z-[1] flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-10 text-white">
                      {featuredPhoto.visit?.user_id !== currentUserId && featuredPhoto.visit?.public_user_id ? (
                        <Link
                          href={`/users/${encodeURIComponent(featuredPhoto.visit.public_user_id)}/visits`}
                          onClick={(event) => event.stopPropagation()}
                          className="min-w-0 truncate text-xs font-bold underline"
                        >
                          @{getPhotoUserLabel(featuredPhoto)}
                        </Link>
                      ) : (
                        <span className="min-w-0 truncate text-xs font-bold">@{getPhotoUserLabel(featuredPhoto)}</span>
                      )}
                      {featuredPhoto.visit?.shot_at && (
                        <span className="ml-auto shrink-0 font-['Outfit'] text-[11px] opacity-90">
                          {formatPhotoDate(featuredPhoto.visit.shot_at)}
                        </span>
                      )}
                      {featuredPhoto.visit?.id && (
                        <PhotoLikeButton
                          key={featuredPhoto.visit.id}
                          visitId={featuredPhoto.visit.id}
                          isLoggedIn={isLoggedIn}
                          loginHref={`/login?redirect=${encodeURIComponent(`/manhole/${params.id}`)}`}
                        />
                      )}
                      {featuredPhoto.visit?.user_id === currentUserId && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteClick(featuredPhoto.id, featuredPhoto.visit?.id);
                          }}
                          className="shrink-0 rounded-full bg-red-800/80 px-2.5 py-1 text-[11px] font-bold text-white"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : allDisplayPhotos.length === 1 ? (
                <button
                  type="button"
                  onClick={() => setPhotoExpanded(true)}
                  aria-label="写真を全体表示"
                  className="group relative block aspect-[4/3] w-full overflow-hidden rounded-[16px] border border-[#e9dfc7] bg-[#ece2cd] p-0 shadow-sm lg:aspect-square lg:rounded-[18px]"
                >
                  <img
                    src={`/api/photo/${allDisplayPhotos[0].id}?size=large`}
                    alt={`@${getPhotoUserLabel(allDisplayPhotos[0])}さんのポケふた写真`}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-12 text-left text-white">
                    <span className="min-w-0 truncate text-xs font-bold">@{getPhotoUserLabel(allDisplayPhotos[0])}</span>
                    {allDisplayPhotos[0].visit?.shot_at && (
                      <span className="ml-auto shrink-0 font-['Outfit'] text-[11px] opacity-90">
                        {formatPhotoDate(allDisplayPhotos[0].visit!.shot_at)}
                      </span>
                    )}
                  </div>
                </button>
              ) : (
                <div className="grid h-[250px] grid-cols-3 grid-rows-2 gap-2 lg:h-[420px]">
                  {galleryPreviewPhotos.map((photo, index) => {
                    const isRepresentative = index === 0;
                    const isOnlySecondary = galleryPreviewPhotos.length === 2 && index === 1;
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => {
                          setSelectedPhotoIdx(index);
                          setPhotoExpanded(true);
                        }}
                        aria-label={`@${getPhotoUserLabel(photo)}さんの写真を全体表示`}
                        className={`group relative overflow-hidden border border-[#e9dfc7] bg-[#ece2cd] p-0 shadow-sm ${
                          isRepresentative
                            ? 'col-span-2 row-span-2 rounded-l-[16px] lg:rounded-l-[18px]'
                            : `${isOnlySecondary ? 'row-span-2' : ''} rounded-r-[13px] lg:rounded-r-[15px]`
                        }`}
                      >
                        <img
                          src={`/api/photo/${photo.id}?size=${isRepresentative ? 'large' : 'small'}`}
                          alt={`@${getPhotoUserLabel(photo)}さんのポケふた写真`}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                          loading={isRepresentative ? 'eager' : 'lazy'}
                        />
                        {isRepresentative && (
                          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-[#e9dfc7] bg-white/95 px-2.5 py-1 font-pixelJp text-[11px] font-bold text-[#6f6657] shadow-sm">
                            <ImageIcon className="h-3 w-3" strokeWidth={2.2} />写真 {allDisplayPhotos.length}枚
                          </span>
                        )}
                        <span className="absolute inset-x-0 bottom-0 flex items-end gap-1 bg-gradient-to-t from-black/65 to-transparent px-2.5 pb-2 pt-8 text-left text-white">
                          <span className="min-w-0 flex-1 truncate text-[11px] font-bold lg:text-xs">
                            @{getPhotoUserLabel(photo)}
                          </span>
                          {photo.visit?.shot_at && (
                            <span className="shrink-0 font-['Outfit'] text-[10px] opacity-90 lg:text-[11px]">
                              {formatPhotoDate(photo.visit.shot_at)}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex min-w-0 items-center gap-1.5 font-pixelJp text-[11px] font-semibold text-[#8b816f]">
                  {photoContributorCount > 0 && <span>{photoContributorCount}人が撮影・</span>}
                  <span>全{allDisplayPhotos.length}枚</span>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(isLoggedIn ? `/upload?manhole_id=${params.id}` : `/login?redirect=${encodeURIComponent(`/upload?manhole_id=${params.id}`)}`)}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-pixelJp text-[11px] font-bold text-[#8b816f] transition-colors hover:bg-[#ece2cd] hover:text-[#bf5640]"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.4} />写真を追加
                </button>
              </div>

              {allPhotosGrid}
            </div>
          )}

          {/* ── Title block ── */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 font-pixelJp text-[12px] lg:text-[13px] font-semibold text-[#9b917e]">
              <MapPin className="h-3.5 w-3.5 text-[#9b917e]" strokeWidth={2.2} />
              {manhole.prefecture} / {municipality}
            </div>
            {/*
              ページの主見出し。図鑑と同じ「{都道府県}{市区町村}のポケふた（{ポケモン}）」。
              以前は h2 で、しかもページ全体に h1 が1つも無かった。ポケモン名は
              「{ポケモン}が描かれたポケモンマンホール」という別の段落に置いていたが、
              見出しへ入れたことで重複するので畳んだ。
              括弧の中だけ細くしているのは見た目の話で、テキストは図鑑の h1 と同一。
            */}
            <h1 className="font-pixelJp text-[21px] lg:text-[30px] font-black leading-tight text-[#2c2a26]">
              {manholePlaceLabel(manhole)}
              {headingPokemons.length > 0 && (
                <span className="font-bold text-[15px] lg:text-[20px] text-[#6f6657]">
                  （{headingPokemons.join('・')}）
                </span>
              )}
            </h1>
            {/* Featured photo detail — memo + isPublic(own) / comment(community) */}
            {featuredPhoto && (() => {
              const isOwn = featuredPhoto.visit?.user_id === currentUserId;
              const memo = (isOwn ? featuredPhoto.visit?.note : undefined) || featuredPhoto.visit?.comment;
              const isPublic = featuredPhoto.visit?.is_public;
              if (!memo && !isOwn) return null;
              return (
                <div className="mt-3 flex items-start gap-2.5 rounded-[12px] border border-[#e9dfc7] bg-[#fbf6ea] px-[13px] py-[11px]">
                  <Sparkles className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[#b87d0a]" strokeWidth={2.2} />
                  <div className="flex-1 min-w-0">
                    {memo && (
                      <p className="font-pixelJp text-[12.5px] font-semibold leading-relaxed text-[#6f6657]">{memo}</p>
                    )}
                    {isOwn && featuredPhoto.visit?.id && (() => {
                      const visitId = featuredPhoto.visit!.id;
                      const isPrivate = isPublic === false;
                      const saving = visibilitySavingVisitId === visitId;
                      return (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleVisibilityToggle(visitId, !isPrivate)}
                            disabled={saving}
                            aria-pressed={!isPrivate}
                            aria-label={isPrivate ? 'この記録を公開する' : 'この記録を非公開にする'}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-pixelJp text-[10px] font-bold disabled:opacity-50"
                            style={{ background: isPrivate ? '#f3e8dc' : '#e2f2e9', color: isPrivate ? '#9a5c2a' : '#1f9d63' }}
                          >
                            {isPrivate
                              ? <EyeOff className="h-[11px] w-[11px]" strokeWidth={2.4} />
                              : <Eye className="h-[11px] w-[11px]" strokeWidth={2.4} />}
                            {saving ? '変更中…' : isPrivate ? '非公開' : '公開中'}
                          </button>
                          <span className="font-pixelJp text-[10px] text-[#9b917e]">
                            {isPrivate
                              ? 'タップで公開 — みんなに見てもらえます'
                              : 'タップで公開設定を変更'}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Rarity pills ── */}
          {titleBadges.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {titleBadges.map((title, idx) => (
                <span
                  key={`${title.key}-${idx}`}
                  className={`rounded-full px-2.5 py-1 font-pixelJp text-xs font-bold ${getTitlePillClass(idx)}`}
                >
                  {title.emoji || '★'} {title.label}
                </span>
              ))}
            </div>
          ) : null}

          {/* ── PromptCard (SP only — lg:hidden) ── */}
          {!photosLoading && !photoLoadError && photoState === 'none' && <div className="lg:hidden">{promptCardContent}</div>}

          <hr className="border-[#e9dfc7]" />

          {/* ── Map ── */}
          <div>
            <h3 className="mb-3 flex items-center gap-1.5 font-pixelJp text-[13.5px] font-bold text-[#2c2a26]">
              <MapPin className="h-3.5 w-3.5 text-[#6f6657]" strokeWidth={2.2} />
              場所
            </h3>
            <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7]">
              <div className="h-[140px]">
                <MapComponent
                  center={{ lat: manhole.latitude ?? 36.0, lng: manhole.longitude ?? 138.0 }}
                  manholes={detailMapManholes}
                  onManholeClick={handleManholeClick}
                  userLocation={null}
                  zoom={16}
                  minHeight={140}
                />
              </div>
              <div className="border-t border-[#e9dfc7] bg-[#fffdf7] p-3">
                <button
                  onClick={openInMaps}
                  className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#1f9d63] py-2.5 font-pixelJp text-sm font-bold text-white transition-colors hover:bg-[#1a8a56]"
                >
                  <Navigation className="h-4 w-4" strokeWidth={2.4} />
                  経路案内
                </button>
              </div>
            </div>
          </div>

          {/* ── Building ── */}
          {manhole.building && (
            <div className="flex items-start gap-3 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#eef2f7]">
                <Building2 className="h-5 w-5 text-[#5b667b]" strokeWidth={2} />
              </span>
              <div>
                <p className="font-pixelJp text-[11px] font-bold text-[#9b917e]">建物・目印</p>
                <p className="mt-0.5 font-pixelJp text-sm font-bold leading-snug text-[#2c2a26]">
                  {manhole.building}
                </p>
              </div>
            </div>
          )}

          {/* ── Pokemon ── */}
          {manhole.pokemons && manhole.pokemons.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 font-pixelJp text-[13.5px] font-bold text-[#2c2a26]">
                <Sparkles className="h-3.5 w-3.5 text-[#6f6657]" strokeWidth={2.2} />
                登場ポケモン
              </h3>
              <div className="flex flex-wrap gap-2">
                {manhole.pokemons.map((pokemon) => (
                  <Link
                    key={pokemon}
                    href={`/manholes?q=${encodeURIComponent(pokemon)}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#e9dfc7] bg-white px-3 py-1.5 font-pixelJp text-xs font-bold text-[#6f6657] transition-colors hover:border-[#d7c8a7] hover:bg-[#fbf6ea] hover:text-[#bf5640]"
                    aria-label={`ポケふた図鑑で${pokemon}を見る`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f6e4b6] text-[10px]">
                      ◓
                    </span>
                    {pokemon}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/*
            ── Comments ──
            関連リンク3種とシェアの**上**に置く。以前は全1261行の最下部にあり、
            スクロールしきった人しか到達できなかった。ここは部屋の主コンテンツ。
          */}
          {manhole && (
            <ManholeCommentThread
              manholeId={manhole.id}
              isLoggedIn={authChecked ? currentUserId !== null : null}
              surface="manhole_detail"
            />
          )}

          {/* ── Nearby manholes ── */}
          {related.nearby.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 font-pixelJp text-[13.5px] font-bold text-[#2c2a26]">
                <Navigation className="h-3.5 w-3.5 text-[#6f6657]" strokeWidth={2.2} />
                次に寄れるポケふた
              </h3>
              {renderRelatedCards(related.nearby)}
            </div>
          )}

          {/* ── Same Pokemon ── */}
          {related.samePokemon.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 font-pixelJp text-[13.5px] font-bold text-[#2c2a26]">
                <Sparkles className="h-3.5 w-3.5 text-[#6f6657]" strokeWidth={2.2} />
                同じポケモンのポケふた
              </h3>
              {renderRelatedCards(related.samePokemon.map((m) => ({ manhole: m })))}
            </div>
          )}

          {/* ── Prefecture dex ──
              ラベルどおり図鑑（data.pokefuta.com）の都道府県ページへ直接送る。
              以前は写真館の `/manholes?q=` に送っていたが、写真が1枚も出ない
              クライアント描画の一覧で、ラベルの「図鑑」とも一致していなかった。 */}
          {prefectureDexHref && (
            <a
              href={prefectureDexHref}
              className="flex min-h-[48px] items-center gap-2.5 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] px-4 py-3 font-pixelJp text-xs font-bold text-[#6f6657] shadow-sm transition-colors hover:border-[#d7c8a7] hover:bg-[#fbf6ea] hover:text-[#bf5640]"
              aria-label={`ポケふた図鑑で${manhole.prefecture}を見る`}
            >
              <Flag className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              <span>ポケふた図鑑で{manhole.prefecture}を見る</span>
              <span className="ml-auto text-base" aria-hidden="true">›</span>
            </a>
          )}

          {/* ── Share ── */}
          {sharePayload && (
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 font-pixelJp text-[13.5px] font-bold text-[#2c2a26]">
                <Users className="h-3.5 w-3.5 text-[#6f6657]" strokeWidth={2.2} />
                このポケふたを共有
              </h3>
              <ShareButtons
                label=""
                shareText={sharePayload.shareText}
                shareUrl={sharePayload.shareUrl}
                hashtags={sharePayload.hashtags}
                analyticsParams={sharePayload.analyticsParams}
              />
            </div>
          )}

        </div>
      </PCShell>


      {selectedPhotoId && (
        <DeletePhotoModal
          isOpen={deleteModalOpen}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          isDeleting={isDeleting}
        />
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
