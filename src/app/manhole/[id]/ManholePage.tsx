
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  MapPin, ArrowLeft, Camera, Navigation, Building2,
  Flag, Users, Trophy, Lock, Plus, Image as ImageIcon,
  Star, Sparkles,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { Manhole } from '@/types/database';
import DeletePhotoModal from '@/components/DeletePhotoModal';
import ShareButtons from '@/components/ShareButtons';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import PCShell from '@/components/PCShell';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { manholeShareText, photoShareText } from '@/lib/share';
import { SITE_URL } from '@/lib/constants';
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
  visit?: {
    id: string;
    user_id: string;
    display_name?: string | null;
    shot_at: string;
    created_at?: string;
    note?: string;
    comment?: string;
    is_public?: boolean;
  };
}

const getPhotoUserLabel = (photo: Photo) => {
  const name = photo.visit?.display_name;
  if (name && name.trim().length > 0) return name;
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

interface ManholeComment {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email?: string | null;
    display_name?: string | null;
  };
}

export default function ManholeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [manhole, setManhole] = useState<Manhole | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [prefectureDex, setPrefectureDex] = useState<{ current: number; total: number } | null>(null);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);

  const [manholeComments, setManholeComments] = useState<ManholeComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsSubmitting, setCommentsSubmitting] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newManholeComment, setNewManholeComment] = useState('');

  const { trackManholeDetailOpen, trackRouteOpen, trackVisitDelete } = useAnalytics();

  useEffect(() => {
    const manholeId = params.id;
    if (manholeId) {
      setSelectedPhotoIdx(0);
      loadManholeDetail(manholeId as string);
      loadPhotos(manholeId as string);
      loadManholeComments(manholeId as string);
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

  useEffect(() => {
    if (manhole) {
      const municipality = manhole.city || manhole.municipality || '場所未設定';
      const pokemonList = manhole.pokemons?.length > 0 ? manhole.pokemons.join('・') : '';

      document.title = pokemonList
        ? `${manhole.prefecture}${municipality}のポケふた｜${pokemonList}｜ポケふたマップ`
        : `${manhole.prefecture}${municipality}のポケふた｜ポケふたマップ`;

      const descriptionText = pokemonList
        ? `${manhole.prefecture}${municipality}にある、${pokemonList}が描かれたポケモンマンホール「ポケふた」の場所、写真、訪問記録を確認できます。経路案内や写真登録にも対応。`
        : `${manhole.prefecture}${municipality}にあるポケモンマンホール「ポケふた」の場所、写真、訪問記録を確認できます。`;

      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', descriptionText);

      const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'TouristAttraction',
        name: `${manhole.prefecture}${municipality}のポケふた`,
        description: pokemonList
          ? `${manhole.prefecture}${municipality}にある、${pokemonList}が描かれたポケモンマンホールです。`
          : `${manhole.prefecture}${municipality}にあるポケモンマンホールです。`,
        geo:
          manhole.latitude && manhole.longitude
            ? { '@type': 'GeoCoordinates', latitude: manhole.latitude, longitude: manhole.longitude }
            : undefined,
        url: `https://pokefuta.com/manhole/${manhole.id}`,
      };

      let script = document.querySelector('script[type="application/ld+json"]');
      if (!script) {
        script = document.createElement('script');
        script.setAttribute('type', 'application/ld+json');
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    }
  }, [manhole]);

  const getCommentUserLabel = (comment: ManholeComment) => {
    const name = comment.user.display_name;
    return name?.trim() || '名無し';
  };

  const getCommentUserInitial = (comment: ManholeComment) =>
    getCommentUserLabel(comment)?.[0]?.toUpperCase() || 'U';

  const loadCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user?.id) setCurrentUserId(data.user.id);
      }
    } catch (err) {
      console.error('Failed to load current user:', err);
    }
  };

  const loadManholeDetail = async (id: string) => {
    try {
      const response = await fetch('/api/manholes');
      if (response.ok) {
        const data = await response.json();
        const manholesList: Manhole[] = data.manholes || [];
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
    try {
      const response = await fetch(`/api/image-upload?manhole_id=${id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.images) setPhotos(data.images);
      }
    } catch (err) {
      console.error('Failed to load photos:', err);
    }
  };

  const loadManholeComments = async (id: string) => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const response = await fetch(`/api/manholes/${id}/comments?limit=50&offset=0`);
      const data = await response.json();
      if (response.ok && data.success) {
        setManholeComments(data.comments || []);
      } else {
        setCommentsError(data.error || 'コメントの読み込みに失敗しました');
      }
    } catch {
      setCommentsError('コメントの読み込み中にエラーが発生しました');
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSubmitManholeComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !newManholeComment.trim()) return;
    if (newManholeComment.length > 1000) {
      setCommentsError('コメントは1000文字以内で入力してください');
      return;
    }
    const manholeId = params.id;
    if (!manholeId) return;
    setCommentsSubmitting(true);
    setCommentsError(null);
    try {
      const response = await fetch(`/api/manholes/${manholeId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newManholeComment.trim() }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setManholeComments((prev) => [...prev, data.comment]);
        setNewManholeComment('');
      } else if (response.status === 401) {
        setCommentsError('ログインが必要です');
      } else {
        setCommentsError(data.error || 'コメントの投稿に失敗しました');
      }
    } catch {
      setCommentsError('コメントの投稿中にエラーが発生しました');
    } finally {
      setCommentsSubmitting(false);
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

  if (loading) {
    return (
      <div className="min-h-screen safe-area-inset bg-[#F6EEDC] flex items-center justify-center">
        <div className="font-pixelJp text-[#7B63A8]">
          読み込み中<span className="rpg-loading" />
        </div>
      </div>
    );
  }

  if (error || !manhole) {
    return (
      <div className="min-h-screen safe-area-inset bg-[#F6EEDC]">
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
  const myPhotos = isLoggedIn ? photos.filter((p) => p.visit?.user_id === currentUserId) : [];
  const commPhotos = photos.filter(
    (p) => p.visit?.is_public === true && (!isLoggedIn || p.visit?.user_id !== currentUserId)
  );
  const allDisplayPhotos = [...myPhotos, ...commPhotos];
  const photoState: 'none' | 'mine' | 'community' =
    photos.length === 0 ? 'none' : myPhotos.length > 0 ? 'mine' : 'community';
  const safeIdx = Math.min(selectedPhotoIdx, Math.max(0, allDisplayPhotos.length - 1));
  const featuredPhoto = allDisplayPhotos[safeIdx] ?? null;
  const municipality = manhole.city || manhole.municipality || '場所未設定';
  const titleBadges = getSortedTitles(manhole.titles);

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
            onClick={() => router.push('/upload')}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#ecccc1] bg-white py-3 font-pixelJp text-sm font-bold text-[#bf5640] transition-colors hover:bg-[#fdeae2]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            別の構図を追加する
          </button>
        ) : (
          <button
            type="button"
            onClick={() => router.push(isLoggedIn ? '/upload' : '/login?redirect=/upload')}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#bf5640] py-3 font-pixelJp text-sm font-bold text-white shadow-[0_2px_0_#a8462f] transition-colors hover:bg-[#a84b36]"
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

  // Rail wrapper: hidden on mobile so PCShell doesn't render it above the gallery.
  // PCShell's own hidden lg:block wrapper makes it appear only in the sticky right column.
  const promptCard = <div className="hidden lg:block">{promptCardContent}</div>;

  return (
    <div className="min-h-screen safe-area-inset bg-[#f1e8d4]">
      {/* Mobile header */}
      <div className="lg:hidden">
        <Header
          title={`${municipality}のポケふた`}
          actions={
            <button
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#2A2A2A] transition hover:bg-[#7B63A8]/10"
              aria-label="戻る"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          }
        />
      </div>

      <PCShell active="search" className="pb-32 pt-4 lg:pt-6" rail={promptCard}>
        <div className="flex flex-col gap-5 max-w-2xl lg:max-w-none">

          {/* ── Gallery ── */}
          {photoState === 'none' ? (
            <div
              className="relative overflow-hidden rounded-[18px] border-2 border-dashed border-[#cdbf9f]"
              style={{
                background: 'repeating-linear-gradient(135deg,#f3ecdc 0 12px,#ece2cd 12px 24px)',
                minHeight: 210,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div className="text-center">
                <div className="font-['Outfit'] text-[44px] font-black leading-none text-[#cdbb92]">0</div>
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
              {/* Featured */}
              <div
                className="relative overflow-hidden rounded-[18px] border border-[#e9dfc7] shadow-sm"
                style={{ height: 232 }}
              >
                {featuredPhoto && (
                  <img
                    src={`/api/photo/${featuredPhoto.id}?size=small`}
                    alt="ポケふた写真"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
                {/* top-left: community count */}
                <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[#e9dfc7] bg-white/95 px-2.5 py-1 font-pixelJp text-[11px] font-bold text-[#6f6657] shadow-sm">
                  <ImageIcon className="h-3 w-3" strokeWidth={2.2} />
                  みんなの写真 {commPhotos.length}枚
                </span>
                {/* top-right: mine / 未投稿
                    「あなたは未投稿」は photoState !== 'mine' の時だけ表示。
                    自分の写真があってもコミュニティ写真を選択中の場合は出さない。 */}
                {isLoggedIn && (
                  featuredPhoto?.visit?.user_id === currentUserId ? (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#1f9d63] bg-opacity-95 px-2.5 py-1 font-pixelJp text-[11px] font-bold text-white">
                      あなたの写真
                    </span>
                  ) : photoState !== 'mine' ? (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#bf5640] bg-opacity-95 px-2.5 py-1 font-pixelJp text-[11px] font-bold text-white">
                      あなたは未投稿
                    </span>
                  ) : null
                )}
                {/* caption — inline styles to prevent global CSS overrides */}
                {featuredPhoto && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '26px 13px 10px', background: 'linear-gradient(180deg,transparent,rgba(20,14,5,.62))', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                      {featuredPhoto.visit?.user_id === currentUserId
                        ? 'あなたの1枚'
                        : `@${getPhotoUserLabel(featuredPhoto)}`}
                    </span>
                    {featuredPhoto.visit?.shot_at && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'Outfit,sans-serif', opacity: 0.9 }}>
                        {formatPhotoDate(featuredPhoto.visit.shot_at)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Thumbnail strips */}
              <div className="flex flex-col gap-3">
                {/* Your photos */}
                {isLoggedIn && myPhotos.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <Camera className="h-3.5 w-3.5 text-[#6f6657]" strokeWidth={2.2} />
                      <span className="font-pixelJp text-[13px] font-bold">あなたの写真</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {myPhotos.map((p, i) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPhotoIdx(i)}
                          className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-[11px]"
                          style={{
                            border:
                              featuredPhoto?.id === p.id
                                ? '2.5px solid #bf5640'
                                : '2px solid #1f9d63',
                          }}
                        >
                          <img
                            src={`/api/photo/${p.id}?size=small`}
                            alt="あなたの写真"
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#1f9d63]">
                            <Camera className="h-2.5 w-2.5 text-white" strokeWidth={2.4} />
                          </span>
                          {/* delete button — only reachable here since myPhotos excludes commPhotos */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(p.id, p.visit?.id); }}
                            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60"
                            title="削除"
                            style={{ color: '#fff' }}
                          >
                            <span className="text-[9px] leading-none">×</span>
                          </button>
                        </button>
                      ))}
                      {/* add slot */}
                      <button
                        type="button"
                        onClick={() => router.push('/upload')}
                        className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[11px] border-2 border-dashed border-[#cdbf9f]"
                        style={{ background: 'repeating-linear-gradient(135deg,#f3ecdc 0 6px,#ece2cd 6px 12px)' }}
                      >
                        <Plus className="h-[18px] w-[18px] text-[#bf5640]" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Community photos */}
                <div>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-[#6f6657]" strokeWidth={2.2} />
                    <span className="font-pixelJp text-[13px] font-bold">みんなの写真</span>
                    <span className="font-['Outfit'] text-xs font-bold text-[#9b917e]">
                      {commPhotos.length}枚
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {commPhotos.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPhotoIdx(myPhotos.length + i)}
                        title={`@${getPhotoUserLabel(p)}`}
                        className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-[11px]"
                        style={{
                          border:
                            featuredPhoto?.id === p.id
                              ? '2.5px solid #bf5640'
                              : '1px solid #e9dfc7',
                        }}
                      >
                        <img
                          src={`/api/photo/${p.id}?size=small`}
                          alt={`@${getPhotoUserLabel(p)}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                    {/* add slot when no own photos */}
                    {(!isLoggedIn || myPhotos.length === 0) && (
                      <button
                        type="button"
                        onClick={() => router.push(isLoggedIn ? '/upload' : '/login?redirect=/upload')}
                        className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[11px] border-2 border-dashed border-[#cdbf9f]"
                        style={{ background: 'repeating-linear-gradient(135deg,#f3ecdc 0 6px,#ece2cd 6px 12px)' }}
                      >
                        {isLoggedIn ? (
                          <Plus className="h-[18px] w-[18px] text-[#bf5640]" strokeWidth={2.5} />
                        ) : (
                          <Lock className="h-4 w-4 text-[#bcae8e]" strokeWidth={2} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Title block ── */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 font-pixelJp text-xs font-semibold text-[#6f6657]">
              <MapPin className="h-3.5 w-3.5 text-[#bf5640]" strokeWidth={2.2} />
              {manhole.prefecture} / {municipality}
            </div>
            <h2 className="font-pixelJp text-xl font-bold leading-tight text-[#2c2a26]">
              {manhole.prefecture}{municipality}のポケふた
            </h2>
            {photoState === 'community' && isLoggedIn && (
              <p className="mt-1 font-pixelJp text-[13px] font-bold text-[#bf5640]">
                あなたの構図で塗り替える
              </p>
            )}
            {manhole.pokemons && manhole.pokemons.length > 0 && (
              <p className="mt-1.5 font-pixelJp text-sm leading-relaxed text-[#6f6657]">
                {manhole.pokemons.join('・')}が描かれたポケモンマンホール
              </p>
            )}
            {/* featured photo details */}
            {featuredPhoto && (() => {
              const isOwn = featuredPhoto.visit?.user_id === currentUserId;
              const note = featuredPhoto.visit?.note;
              const comment = featuredPhoto.visit?.comment;
              const shotAt = featuredPhoto.visit?.shot_at;
              const isPublic = featuredPhoto.visit?.is_public;
              const displayName = getPhotoUserLabel(featuredPhoto);
              return (
                <div className="mt-3 rounded-[12px] border border-[#e9dfc7] bg-[#fbf6ea] p-3 flex flex-col gap-2">
                  {/* meta row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {isOwn ? (
                      <span className="inline-flex items-center gap-1 font-pixelJp text-[11.5px] font-bold text-[#1f9d63]">
                        <Camera className="h-3 w-3" strokeWidth={2.2} />
                        あなたの投稿
                      </span>
                    ) : (
                      <span className="font-pixelJp text-[11.5px] font-bold text-[#6f6657]">
                        @{displayName}
                      </span>
                    )}
                    {shotAt && (
                      <span className="font-['Outfit'] text-[11px] text-[#9b917e]">
                        {formatPhotoDate(shotAt)}
                      </span>
                    )}
                    {isOwn && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-pixelJp text-[10px] font-bold"
                        style={{ background: isPublic === false ? '#f3e8dc' : '#e2f2e9', color: isPublic === false ? '#9a5c2a' : '#1f9d63' }}
                      >
                        {isPublic === false ? '非公開' : '公開中'}
                      </span>
                    )}
                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(featuredPhoto.id, featuredPhoto.visit?.id)}
                        className="ml-auto font-pixelJp text-[11px] font-bold text-[#bf5640] underline-offset-2 hover:underline"
                      >
                        この写真を削除
                      </button>
                    )}
                  </div>
                  {/* note (自分のみ) */}
                  {isOwn && note && (
                    <p className="font-pixelJp text-[12.5px] font-semibold leading-relaxed text-[#6f6657]">
                      📍 {note}
                    </p>
                  )}
                  {/* comment */}
                  {comment && (
                    <p className="font-pixelJp text-[12.5px] font-semibold leading-relaxed text-[#6f6657]">
                      {comment}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── PromptCard (SP only — lg:hidden) ── */}
          <div className="lg:hidden">{promptCardContent}</div>

          {/* ── Rarity pills ── */}
          {photoState === 'community' && isLoggedIn ? (
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeae2] px-2.5 py-1 font-pixelJp text-xs font-bold text-[#bf5640]">
                <Star className="h-3 w-3" strokeWidth={2} />夜・雪の構図はまだ無い
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ece9fb] px-2.5 py-1 font-pixelJp text-xs font-bold text-[#6a5fc4]">
                <Trophy className="h-3 w-3" strokeWidth={2} />ベスト写真を狙える
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e2f2e9] px-2.5 py-1 font-pixelJp text-xs font-bold text-[#1f9d63]">
                <Sparkles className="h-3 w-3" strokeWidth={2} />あなたの季節を残す
              </span>
            </div>
          ) : titleBadges.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {titleBadges.map((title, idx) => (
                <span
                  key={title.key}
                  className={`rounded-full px-2.5 py-1 font-pixelJp text-xs font-bold ${getTitlePillClass(idx)}`}
                >
                  {title.emoji || '★'} {title.label}
                </span>
              ))}
            </div>
          ) : null}

          <hr className="border-[#e9dfc7]" />

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
                {manhole.pokemons.map((pokemon, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#e9dfc7] bg-white px-3 py-1.5 font-pixelJp text-xs font-bold text-[#6f6657]"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f6e4b6] text-[10px]">
                      ◓
                    </span>
                    {pokemon}
                  </span>
                ))}
              </div>
            </div>
          )}

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
                  manholes={[manhole]}
                  onManholeClick={handleManholeClick}
                  userLocation={null}
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

          {/* ── Comments (preserved) ── */}
          {(manholeComments.length > 0 || currentUserId) && (
            <div>
              <h3 className="mb-3 font-pixelJp text-[13.5px] font-bold text-[#2c2a26]">コメント</h3>
              <div className="flex flex-col gap-3">
                {commentsLoading && (
                  <p className="font-pixelJp text-xs text-[#9b917e]">読み込み中…</p>
                )}
                {manholeComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="flex gap-3 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dfe7f3] font-pixelJp text-sm font-bold text-[#6f6657]">
                      {getCommentUserInitial(comment)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="font-pixelJp text-xs font-bold text-[#2c2a26]">
                          {getCommentUserLabel(comment)}
                        </span>
                        <span className="font-pixelJp text-[10px] text-[#9b917e]">
                          {new Date(comment.created_at).toLocaleDateString('ja-JP')}
                        </span>
                      </div>
                      <p className="font-pixelJp text-xs leading-relaxed text-[#6f6657]">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))}
                {currentUserId && (
                  <form onSubmit={handleSubmitManholeComment} className="flex gap-2">
                    <input
                      type="text"
                      value={newManholeComment}
                      onChange={(e) => setNewManholeComment(e.target.value)}
                      placeholder="コメントを追加…"
                      maxLength={1000}
                      className="flex-1 rounded-[12px] border border-[#e9dfc7] bg-white px-3 py-2 font-pixelJp text-xs text-[#2c2a26] placeholder:text-[#9b917e] focus:outline-none focus:ring-1 focus:ring-[#bf5640]"
                    />
                    <button
                      type="submit"
                      disabled={commentsSubmitting || !newManholeComment.trim()}
                      className="rounded-[12px] bg-[#bf5640] px-4 py-2 font-pixelJp text-xs font-bold text-white disabled:opacity-50"
                    >
                      投稿
                    </button>
                  </form>
                )}
                {commentsError && (
                  <p className="font-pixelJp text-xs text-[#bf5640]">{commentsError}</p>
                )}
              </div>
            </div>
          )}

        </div>
      </PCShell>

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
