
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, ArrowLeft, Camera, Navigation, Clock, Building2 } from 'lucide-react';
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
      <div className="w-full h-64 bg-[#F6EEDC] border border-[#7B63A8]/15 flex items-center justify-center">
        <div className="font-pixelJp text-[#7B63A8]">
          読み込み中<span className="rpg-loading"></span>
        </div>
      </div>
    )
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
    comment?: string;  // 訪問コメント
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

  const [manholeComments, setManholeComments] = useState<ManholeComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsSubmitting, setCommentsSubmitting] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newManholeComment, setNewManholeComment] = useState('');
  const {
    trackManholeDetailOpen,
    trackRouteOpen,
    trackVisitDelete,
  } = useAnalytics();

  useEffect(() => {
    const manholeId = params.id;
    if (manholeId) {
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

  // マンホール詳細閲覧トラッキング
  useEffect(() => {
    if (manhole) {
      trackManholeDetailOpen({
        manhole_id: manhole.id,
        prefecture: manhole.prefecture,
        pokemon_ids: manhole.pokemons?.join(','),
      });
    }
  }, [manhole?.id]);

  // Update document title and meta tags
  useEffect(() => {
    if (manhole) {
      const municipality = manhole.city || manhole.municipality || '場所未設定';
      const pokemonList = manhole.pokemons && manhole.pokemons.length > 0
        ? manhole.pokemons.join('・')
        : '';

      // Update title
      const titleText = pokemonList
        ? `${manhole.prefecture}${municipality}のポケふた｜${pokemonList}｜ポケふたマップ`
        : `${manhole.prefecture}${municipality}のポケふた｜ポケふたマップ`;
      document.title = titleText;

      // Update meta description
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

      // Add JSON-LD structured data
      const structuredData = {
        "@context": "https://schema.org",
        "@type": "TouristAttraction",
        "name": `${manhole.prefecture}${municipality}のポケふた`,
        "description": pokemonList
          ? `${manhole.prefecture}${municipality}にある、${pokemonList}が描かれたポケモンマンホールです。`
          : `${manhole.prefecture}${municipality}にあるポケモンマンホールです。`,
        "geo": manhole.latitude && manhole.longitude ? {
          "@type": "GeoCoordinates",
          "latitude": manhole.latitude,
          "longitude": manhole.longitude
        } : undefined,
        "url": `https://pokefuta.com/manhole/${manhole.id}`
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
    if (name && name.trim().length > 0) return name;
    return '名無し';
  };

  const getCommentUserInitial = (comment: ManholeComment) => {
    const label = getCommentUserLabel(comment);
    return label?.[0]?.toUpperCase() || 'U';
  };

  const loadCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user?.id) {
          setCurrentUserId(data.user.id);
        }
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
          setPrefectureDex((prev) => prev ? { ...prev, total: prefTotal } : { current: 0, total: prefTotal });
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
      const visits: Array<{ manhole?: { prefecture?: string } }> = Array.isArray(data.visits) ? data.visits : [];
      const visited = new Set(
        visits
          .filter((v) => v.manhole?.prefecture === prefecture)
          .map((v) => v.manhole?.prefecture)
      ).size > 0
        ? visits.filter((v) => v.manhole?.prefecture === prefecture).length
        : 0;
      // dedup by manhole id
      const visitedManholeIds = new Set<number>(
        visits
          .filter((v: any) => v.manhole?.prefecture === prefecture && v.manhole?.id)
          .map((v: any) => v.manhole.id as number)
      );
      setPrefectureDex({ current: visitedManholeIds.size, total });
    } catch {
      // keep defaults
    }
  };

  const loadPhotos = async (id: string) => {
    try {
      const response = await fetch(`/api/image-upload?manhole_id=${id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.images) {
          setPhotos(data.images);
        }
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
    } catch (err) {
      console.error('Failed to load manhole comments:', err);
      setCommentsError('コメントの読み込み中にエラーが発生しました');
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSubmitManholeComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId) return;
    if (!newManholeComment.trim()) return;

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newManholeComment.trim(),
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        // APIが古い順（ascending）なので末尾に追加
        setManholeComments((prev) => [...prev, data.comment]);
        setNewManholeComment('');
      } else if (response.status === 401) {
        setCommentsError('ログインが必要です');
      } else {
        setCommentsError(data.error || 'コメントの投稿に失敗しました');
      }
    } catch (err) {
      console.error('Failed to post manhole comment:', err);
      setCommentsError('コメントの投稿中にエラーが発生しました');
    } finally {
      setCommentsSubmitting(false);
    }
  };

  const handleManholeClick = (clickedManhole: Manhole) => {
    // Navigate to the clicked manhole's detail page
    router.push(`/manhole/${clickedManhole.id}`);
  };

  const openInMaps = () => {
    if (manhole && manhole.latitude && manhole.longitude) {
      trackRouteOpen({ manhole_id: manhole.id, prefecture: manhole.prefecture });
      const url = `https://www.google.com/maps/dir/?api=1&destination=${manhole.latitude},${manhole.longitude}`;
      window.open(url, '_blank');
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
      const response = await fetch(`/api/visits/${selectedVisitId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        trackVisitDelete({ manhole_id: manhole?.id });
        // 成功: 写真リストから削除
        const deletedPhotoIds = new Set<string>(data.photo_ids || [selectedPhotoId]);
        const updatedPhotos = photos.filter(p => !deletedPhotoIds.has(p.id));
        setPhotos(updatedPhotos);
        setDeleteModalOpen(false);
        setSelectedPhotoId(null);
        setSelectedVisitId(null);

        // 成功メッセージ
        if (updatedPhotos.length === 0) {
          alert(data.visit_deleted ? '写真と訪問記録を削除しました。このマンホールの写真はすべて削除されました。' : '写真を削除しました。このマンホールの写真はすべて削除されました。');
        } else {
          alert(data.visit_deleted ? '写真と訪問記録を削除しました' : '写真を削除しました');
        }
      } else {
        // エラー
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
    return {
      shareText,
      shareUrl,
      hashtags: titleHashtags,
      analyticsParams: { manhole_id: manhole.id, prefecture: manhole.prefecture },
    };
  }, [manhole, photos, currentUserId]);


  if (loading) {
    return (
      <div className="min-h-screen safe-area-inset bg-[#F6EEDC] flex items-center justify-center">
        <div className="text-center">
          <div className="font-pixelJp text-[#7B63A8]">
            読み込み中<span className="rpg-loading"></span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !manhole) {
    return (
      <div className="min-h-screen safe-area-inset bg-[#F6EEDC]">
        {/* Header */}
        <div className="bg-[#F6EEDC] border-b border-[#7B63A8]/20 p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="rpg-button p-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="font-pixelJp text-base text-rpg-yellow" style={{
                textShadow: '2px 2px 0 #34495E'
              }}>ポケふた詳細</h1>
            </div>
          </div>
        </div>

        {/* Error State */}
        <div className="flex items-center justify-center min-h-[60vh] p-4">
          <div className="rpg-window text-center">
            <MapPin className="w-16 h-16 text-rpg-textDark opacity-50 mx-auto mb-4" />
            <h2 className="font-pixelJp text-lg text-rpg-textDark mb-2">エラー</h2>
            <p className="font-pixelJp text-sm text-rpg-textDark opacity-70 mb-4">{error}</p>
            <button
              onClick={() => router.push('/nearby')}
              className="rpg-button rpg-button-primary"
            >
              <span className="font-pixelJp">近くを探す</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const titleBadges = getSortedTitles(manhole.titles);

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC]">
      <div className="lg:hidden">
        <Header
          title={`${manhole.city || manhole.municipality}のポケふた`}
          actions={
            <button
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#2A2A2A] transition hover:bg-[#7B63A8]/10"
              aria-label="戻る"
              title="戻る"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          }
        />
      </div>

      <PCShell active="search" className="pb-32 pt-4 lg:pt-6">
      <div className="space-y-5 max-w-2xl lg:max-w-none">

        {/* PhotoPrompt Hero */}
        {(() => {
          const viewerPhoto = photos.find(p => currentUserId && p.visit?.user_id === currentUserId);
          const firstPublicPhoto = photos.find(p => p.visit?.is_public === true);
          const heroPhoto = viewerPhoto || firstPublicPhoto;
          const photoCount = photos.length;
          const viewerHasPhoto = Boolean(viewerPhoto);

          return (
            <div className="overflow-hidden rounded-[18px] border border-[#e9dfc7] bg-[#fffdf7] shadow-sm">
              {heroPhoto ? (
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={`/api/photo/${heroPhoto.id}?size=small`}
                    alt={viewerHasPhoto ? 'あなたの訪問写真' : '訪問写真'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  {viewerHasPhoto ? (
                    <div className="absolute top-3 right-3 rounded-full bg-[#1f9d63] px-3 py-1 font-pixelJp text-xs font-bold text-white">
                      ✓ 訪問済み
                    </div>
                  ) : (
                    <div className="absolute bottom-4 left-4">
                      <p className="font-pixelJp text-sm font-bold text-white drop-shadow">あなたの構図を加えよう</p>
                      <p className="font-pixelJp text-xs text-white/80">{photoCount}人が訪問</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative flex min-h-[188px] items-center justify-center bg-gradient-to-b from-[#efe6cf] to-[#e2d5be]">
                  <div className="text-center">
                    <div className="select-none font-pixel text-[72px] font-bold leading-none text-[#bf5640]/25">0</div>
                    <div className="mt-2 inline-block rounded-full bg-[#bf5640] px-3 py-1 font-pixelJp text-xs font-bold text-white shadow-sm">
                      一番乗りチャンス
                    </div>
                  </div>
                  <div className="absolute top-3 right-3 rounded-full border border-[#e9dfc7] bg-white/90 px-3 py-1 font-pixelJp text-xs font-bold text-[#8C6A4A] backdrop-blur-sm">
                    未訪問
                  </div>
                </div>
              )}

              <div className="p-5">
                <div className="mb-1 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#bf5640]" />
                  <span className="font-pixelJp text-xs text-[#6A4D36]">
                    {manhole.prefecture} / {manhole.city || manhole.municipality}
                  </span>
                </div>
                <h2 className="mb-1 font-pixelJp text-xl font-bold leading-tight text-[#4F3828]">
                  {manhole.prefecture}{manhole.city || manhole.municipality}のポケふた
                </h2>
                {manhole.pokemons && manhole.pokemons.length > 0 && (
                  <p className="mb-4 font-pixelJp text-sm text-[#6A4D36]">
                    {manhole.pokemons.join('・')}が描かれたポケモンマンホール
                  </p>
                )}

                {!viewerHasPhoto && (
                  <div className="mb-4 rounded-[14px] border border-[#e9dfc7] bg-[#efe6cf]/60 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-[8px] bg-[#fde2c2] px-2 py-0.5 font-pixelJp text-[10px] font-bold text-[#9a5a1e]">🏆 撮ると写真図鑑も埋まる</span>
                    </div>
                    {prefectureDex ? (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <p style={{ fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', fontSize: 11, color: '#6A4D36', fontWeight: 600 }}>
                            {manhole.prefecture} 写真図鑑
                          </p>
                          <p style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 800, fontSize: 18, lineHeight: 1.2, color: '#2c2a26' }}>
                            {prefectureDex.current}{' '}
                            <span style={{ color: '#c5b89e', fontSize: 14 }}>→</span>{' '}
                            <span style={{ color: '#bf5640' }}>{prefectureDex.current + 1}</span>
                            <span style={{ color: '#c5b89e', fontSize: 13, fontWeight: 600 }}> / {prefectureDex.total}</span>
                          </p>
                        </div>
                        <div style={{ width: 1, background: '#e9dfc7', alignSelf: 'stretch' }} />
                        <div className="text-center" style={{ minWidth: 48 }}>
                          <p style={{ fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 800, fontSize: 20, color: '#1f9d63', lineHeight: 1 }}>+1</p>
                          <p style={{ fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif', fontSize: 10, color: '#9b917e', fontWeight: 600, marginTop: 2 }}>シリーズ進捗</p>
                        </div>
                      </div>
                    ) : (
                      <p className="font-pixelJp text-xs text-[#6A4D36]">
                        撮ると写真図鑑が埋まります
                      </p>
                    )}
                  </div>
                )}

                {viewerHasPhoto && manhole.last_visit && (
                  <div className="mb-4 flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-[#bf5640]" />
                    <span className="font-pixelJp text-xs text-[#6A4D36]">
                      {new Date(manhole.last_visit).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                )}

                {(() => {
                  const userPhoto = photos.find(p => currentUserId && p.visit?.user_id === currentUserId);
                  return userPhoto?.visit?.comment ? (
                    <p className="mb-4 rounded-[14px] border border-[#e9dfc7] bg-[#efe6cf]/60 p-3 font-pixelJp text-sm leading-relaxed text-[#4F3828]">
                      {userPhoto.visit.comment}
                    </p>
                  ) : null;
                })()}

                {titleBadges.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {titleBadges.map((title, idx) => (
                      <span
                        key={title.key}
                        className={`rounded-full px-2.5 py-1 font-pixelJp text-xs font-bold ${getTitlePillClass(idx)}`}
                      >
                        {title.emoji || '★'} {title.label}
                      </span>
                    ))}
                  </div>
                )}

                {!viewerHasPhoto && (
                  <button
                    onClick={() => router.push(currentUserId ? '/upload' : '/login?redirect=/upload')}
                    className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#bf5640] py-3 font-pixelJp text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#a84b36]"
                  >
                    <Camera className="h-4 w-4" />
                    {photoCount === 0 ? '一番乗りで投稿する' : 'あなたの1枚を加える'}
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        <hr className="border-[#e9dfc7]" />

        {manhole.building && (
          <div className="flex items-start gap-3 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-[#bf5640]" />
            <div>
              <p className="mb-1 font-pixelJp text-[11px] font-bold text-[#8C6A4A]">建物・目印</p>
              <p className="font-pixelJp text-sm font-bold leading-relaxed text-[#4F3828]">{manhole.building}</p>
            </div>
          </div>
        )}

        {manhole.pokemons && manhole.pokemons.length > 0 && (
          <div>
            <h3 className="mb-3 font-pixelJp text-sm font-bold text-[#4F3828]">登場ポケモン</h3>
            <div className="flex flex-wrap gap-2">
              {manhole.pokemons.map((pokemon, index) => (
                <span
                  key={index}
                  className="rounded-full border border-[#e9dfc7] bg-white px-3 py-1 font-pixelJp text-xs font-bold text-[#4F3828]"
                >
                  {pokemon}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-3 font-pixelJp text-sm font-bold text-[#4F3828]">場所</h3>
          <div className="overflow-hidden rounded-[14px] border border-[#e9dfc7]">
            <div className="h-[130px]">
              <MapComponent
                center={{ lat: manhole.latitude ?? 36.0, lng: manhole.longitude ?? 138.0 }}
                manholes={[manhole]}
                onManholeClick={handleManholeClick}
                userLocation={null}
              />
            </div>
            <div className="border-t border-[#e9dfc7] p-3">
              <button
                onClick={openInMaps}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#1f9d63] bg-white py-2.5 font-pixelJp text-sm font-bold text-[#1f9d63] transition-colors hover:bg-[#1f9d63]/5"
              >
                <Navigation className="h-4 w-4" />
                経路案内
              </button>
            </div>
          </div>
        </div>

        {sharePayload && (
          <div>
            <h3 className="mb-3 font-pixelJp text-sm font-bold text-[#4F3828]">共有</h3>
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

      <BottomNav />

      {/* Delete Photo Modal */}
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
