
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, ArrowLeft, Camera, Navigation, Clock, Trash2, Heart, Bookmark, User as UserIcon, Stamp, CircleDot, CheckCircle2, ChevronDown, Share2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Manhole } from '@/types/database';
import DeletePhotoModal from '@/components/DeletePhotoModal';
import BottomNav from '@/components/BottomNav';
import { formatDateJa } from '@/lib/date';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { openSharePanel, manholeShareText } from '@/lib/share';
import { SITE_NAME, OGP_IMAGE_URL } from '@/lib/constants';

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

interface PhotoSocial {
  likes: number;
  bookmarks: number;
  comments: number;
  userLiked: boolean;
  userBookmarked: boolean;
}

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
  const [photoReactions, setPhotoReactions] = useState<Map<string, PhotoSocial>>(new Map());

  const [manholeComments, setManholeComments] = useState<ManholeComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsSubmitting, setCommentsSubmitting] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newManholeComment, setNewManholeComment] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const {
    trackManholeDetailOpen,
    trackRouteOpen,
    trackVisitDelete,
    trackShareClick,
    trackShareX,
    trackShareLine,
    trackCopyLink,
  } = useAnalytics();

  // 共有パネルのクリーンアップ（コンポーネントアンマウント時）
  const sharePanelCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      sharePanelCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    const manholeId = params.id;
    if (manholeId) {
      loadManholeDetail(manholeId as string);
      loadPhotos(manholeId as string);
      loadManholeComments(manholeId as string);
      loadCurrentUser();
    }
  }, [params.id]);

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

      // Update OG / Twitter Card tags
      const updateMeta = (attr: 'property' | 'name', key: string, content: string) => {
        let meta = document.querySelector(`meta[${attr}="${key}"]`);
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute(attr, key);
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
      };

      const ogTitle = pokemonList
        ? `${manhole.prefecture}${municipality}のポケふた｜${pokemonList}`
        : `${manhole.prefecture}${municipality}のポケふた`;

      const ogDescription = pokemonList
        ? `${manhole.prefecture}${municipality}にある、${pokemonList}が描かれたポケモンマンホール。場所・写真・訪問記録を確認できます。`
        : `${manhole.prefecture}${municipality}にあるポケモンマンホール。場所・写真・訪問記録を確認できます。`;

      updateMeta('property', 'og:title', ogTitle);
      updateMeta('property', 'og:description', ogDescription);
      updateMeta('property', 'og:url', `https://pokefuta.com/manhole/${manhole.id}`);
      updateMeta('property', 'og:type', 'website');
      updateMeta('property', 'og:site_name', SITE_NAME);
      updateMeta('property', 'og:image', OGP_IMAGE_URL);
      updateMeta('name', 'twitter:card', 'summary_large_image');
      updateMeta('name', 'twitter:title', ogTitle);
      updateMeta('name', 'twitter:description', ogDescription);
      updateMeta('name', 'twitter:image', OGP_IMAGE_URL);

      // Add canonical link
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', `https://pokefuta.com/manhole/${manhole.id}`);

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
      // First try to get all manholes and find the specific one
      const response = await fetch('/api/manholes');
      if (response.ok) {
        const data = await response.json();
        const manholesList = data.manholes || [];
        const foundManhole = manholesList.find((m: Manhole) => m.id.toString() === id);

        if (foundManhole) {
          setManhole(foundManhole);
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

  const loadPhotos = async (id: string) => {
    try {
      const response = await fetch(`/api/image-upload?manhole_id=${id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.images) {
          setPhotos(data.images);
          // 各写真のソーシャル情報を読み込む（visitに集約）
          loadSocialForPhotos(data.images);
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

  const loadSocialForPhotos = async (photos: Photo[]) => {
    const reactionsMap = new Map<string, PhotoSocial>();

    for (const photo of photos) {
      const visitId = photo.visit?.id;
      if (!visitId) {
        reactionsMap.set(photo.id, {
          likes: 0,
          bookmarks: 0,
          comments: 0,
          userLiked: false,
          userBookmarked: false
        });
        continue;
      }
      try {
        const response = await fetch(`/api/visits/${visitId}/social`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            reactionsMap.set(photo.id, {
              likes: data.likes,
              bookmarks: data.bookmarks,
              comments: data.comments,
              userLiked: data.userLiked,
              userBookmarked: data.userBookmarked
            });
          }
        }
      } catch (err) {
        console.error(`Failed to load reactions for photo ${photo.id}:`, err);
      }
    }

    setPhotoReactions(reactionsMap);
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

  const handleShare = async () => {
    if (!manhole) return;

    const municipality = manhole.city || manhole.municipality || '場所未設定';
    const shareTitle = `${manhole.prefecture}${municipality}のポケふた`;
    const shareText = manholeShareText(`${manhole.prefecture}${municipality}`);
    const shareUrl = `https://pokefuta.com/manhole/${manhole.id}`;
    const trackParams = { manhole_id: manhole.id, prefecture: manhole.prefecture };

    trackShareClick(trackParams);

    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      } else {
        sharePanelCleanupRef.current?.();
        sharePanelCleanupRef.current = openSharePanel(shareText, shareUrl, {
          onShareX: () => trackShareX(trackParams),
          onShareLine: () => trackShareLine(trackParams),
          onCopyLink: () => trackCopyLink(trackParams),
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    }
  };

  const handleReaction = async (photo: Photo, reactionType: 'like' | 'bookmark') => {
    const visitId = photo.visit?.id;
    if (!visitId) return;

    try {
      const current = photoReactions.get(photo.id);
      const isOn = reactionType === 'like' ? !!current?.userLiked : !!current?.userBookmarked;
      const endpoint = reactionType === 'like'
        ? `/api/visits/${visitId}/like`
        : `/api/visits/${visitId}/bookmark`;

      const response = await fetch(endpoint, {
        method: isOn ? 'DELETE' : 'POST'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // ソーシャル情報を再読み込み
        const socialResponse = await fetch(`/api/visits/${visitId}/social`);
        if (!socialResponse.ok) return;
        const socialData = await socialResponse.json();
        if (!socialData.success) return;
        setPhotoReactions(prev => {
          const newMap = new Map(prev);
          newMap.set(photo.id, {
            likes: socialData.likes,
            bookmarks: socialData.bookmarks,
            comments: socialData.comments,
            userLiked: socialData.userLiked,
            userBookmarked: socialData.userBookmarked
          });
          return newMap;
        });
      } else if (response.status === 401) {
        alert('ログインが必要です');
      } else {
        console.error('Social action failed:', data);
      }
    } catch (error) {
      console.error('Error handling social action:', error);
    }
  };

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

  return (
    <div className="min-h-screen safe-area-inset bg-[#F6EEDC]">
      {/* Header */}
      <div className="bg-[#F6EEDC] border-b border-[#7B63A8]/20 p-4 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="rpg-button p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-pixelJp text-base text-rpg-yellow truncate" style={{
              textShadow: '2px 2px 0 #34495E'
            }}>
              {manhole.city || manhole.municipality}のポケふた
            </h1>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4 pb-32">
        {/* Visit Achievement Hero Card */}
        <div className="relative overflow-hidden rounded-lg border border-[#8C6A4A]/20 bg-[#FFF7E5] shadow-[0_12px_30px_rgba(95,68,42,0.13)]">
          <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(90deg,#8C6A4A_1px,transparent_1px),linear-gradient(#8C6A4A_1px,transparent_1px)] [background-size:18px_18px]" />

          <div className="relative">
            {/* Status Badge - Floating on top */}
            <div className="absolute top-4 right-4 z-10">
              <div className={`rounded-full px-3 py-1.5 border shadow-md ${
                manhole.is_visited
                  ? 'border-[#B5483C]/30 bg-[#F8D9C4]'
                  : 'border-[#8C6A4A]/25 bg-white/90 backdrop-blur'
              }`}>
                <span className={`font-pixelJp text-xs font-bold ${
                  manhole.is_visited ? 'text-[#B5483C]' : 'text-[#8C6A4A]'
                }`}>
                  {manhole.is_visited ? '✓ 訪問済み' : '未訪問'}
                </span>
              </div>
            </div>

            {/* Hero Photo Section */}
            {(() => {
              const userPhoto = photos.find(p => currentUserId && p.visit?.user_id === currentUserId);
              const mainPhoto = manhole.is_visited ? (userPhoto || photos[0]) : photos[0];

              return manhole.is_visited && mainPhoto ? (
                // Visited with photo - Large hero image
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={`/api/photo/${mainPhoto.id}?size=small`}
                    alt="訪問記念写真"
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.classList.add('bg-[#E9DEC9]');
                        parent.innerHTML = `
                          <div class="absolute inset-0 flex items-center justify-center">
                            <div class="text-center">
                              <svg class="w-16 h-16 text-[#8C6A4A] opacity-30 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                              </svg>
                              <p class="font-pixelJp text-xs text-[#8C6A4A]">写真を読み込めませんでした</p>
                            </div>
                          </div>
                        `;
                      }
                    }}
                  />
                  {/* Gradient overlay for text readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                  {/* Achievement badge */}
                  <div className="absolute bottom-4 right-4">
                    <div className="bg-[#D94D3F] border-2 border-white rounded-full p-2 shadow-lg">
                      <CheckCircle2 className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </div>
              ) : (
                // Unvisited or no photo - Stamp placeholder
                <div className="flex items-center justify-center py-12 bg-gradient-to-b from-[#F6EEDC] to-[#E9DEC9]">
                  <div className="flex h-32 w-32 rotate-[-8deg] items-center justify-center rounded-full border-4 border-[#B8AB96] text-center text-[#A39580] bg-white/50 shadow-lg">
                    <div>
                      <Stamp className="mx-auto h-10 w-10" />
                      <p className="mt-2 font-pixel text-xs leading-none">NEXT STAMP</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Info Section */}
            <div className="p-5">
              {/* Location & Title */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-[#B5483C]" />
                  <span className="font-pixelJp text-sm text-[#6A4D36] font-bold">
                    {manhole.prefecture} / {manhole.city || manhole.municipality}
                  </span>
                </div>
                <h2 className="font-pixelJp text-2xl font-bold text-[#4F3828] leading-tight mb-2">
                  {manhole.prefecture}{manhole.city || manhole.municipality}のポケふた
                </h2>
                {manhole.pokemons && manhole.pokemons.length > 0 && (
                  <p className="font-pixelJp text-sm text-[#6A4D36]">
                    {manhole.pokemons.join('・')}が描かれたポケモンマンホール
                  </p>
                )}
              </div>

              {/* Visit Date */}
              {manhole.is_visited && manhole.last_visit && (
                <div className="flex items-center gap-2 mb-4 p-3 rounded-md bg-white/60 border border-[#8C6A4A]/15">
                  <Clock className="w-4 h-4 text-[#B5483C]" />
                  <span className="font-pixelJp text-sm text-[#4F3828] font-bold">
                    訪問日: {new Date(manhole.last_visit).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              )}

              {/* Your Visit Comment (if exists) */}
              {(() => {
                const userPhoto = photos.find(p => currentUserId && p.visit?.user_id === currentUserId);
                return userPhoto?.visit?.comment ? (
                  <div className="mb-4 p-3 rounded-md bg-white/60 border border-[#8C6A4A]/15">
                    <p className="font-pixelJp text-sm text-[#4F3828] leading-relaxed">
                      {userPhoto.visit.comment}
                    </p>
                  </div>
                ) : null;
              })()}

              {/* Description */}
              {manhole.description && (
                <div className="mb-4 p-3 rounded-md bg-white/60 border border-[#8C6A4A]/15">
                  <p className="font-pixelJp text-xs text-[#4F3828] leading-relaxed">
                    {manhole.description}
                  </p>
                </div>
              )}

              {/* Call to Actions */}
              {manhole.is_visited ? (
                // Visited: Add more photos + Directions + Share
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => router.push(currentUserId ? '/upload' : '/login?redirect=/upload')}
                    className="rpg-button rpg-button-primary flex items-center justify-center gap-1 px-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span className="font-pixelJp text-xs">写真追加</span>
                  </button>
                  <button
                    onClick={openInMaps}
                    className="rpg-button rpg-button-success flex items-center justify-center gap-1 px-2"
                  >
                    <Navigation className="w-4 h-4" />
                    <span className="font-pixelJp text-xs">経路案内</span>
                  </button>
                  <button
                    onClick={handleShare}
                    className="rpg-button flex items-center justify-center gap-1 px-2 bg-white/70 border border-[#8C6A4A]/25 hover:bg-[#8C6A4A]/10"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="font-pixelJp text-xs">共有</span>
                  </button>
                </div>
              ) : (
                // Unvisited: Directions + Record visit/Login CTA + Share
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={openInMaps}
                    className="rpg-button rpg-button-success flex items-center justify-center gap-1 px-2"
                  >
                    <Navigation className="w-4 h-4" />
                    <span className="font-pixelJp text-xs">経路案内</span>
                  </button>
                  {currentUserId ? (
                    <button
                      onClick={() => router.push('/upload')}
                      className="rpg-button rpg-button-primary flex items-center justify-center gap-1 px-2"
                    >
                      <Camera className="w-4 h-4" />
                      <span className="font-pixelJp text-xs">訪問記録</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push('/login?redirect=/upload')}
                      className="rpg-button flex items-center justify-center gap-1 px-2 bg-white/70 border border-[#7B63A8] hover:bg-[#7B63A8]/5"
                    >
                      <Camera className="w-4 h-4 text-[#7B63A8]" />
                      <span className="font-pixelJp text-xs text-[#7B63A8]">ログインして記録</span>
                    </button>
                  )}
                  <button
                    onClick={handleShare}
                    className="rpg-button flex items-center justify-center gap-1 px-2 bg-white/70 border border-[#8C6A4A]/25 hover:bg-[#8C6A4A]/10"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="font-pixelJp text-xs">共有</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pokemon Info */}
        {manhole.pokemons && manhole.pokemons.length > 0 && (
          <div className="rpg-window">
            <h2 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-3">登場ポケモン</h2>
            <div className="flex flex-wrap gap-2">
              {manhole.pokemons.map((pokemon, index) => (
                <span
                  key={index}
                  className="bg-rpg-yellow px-2 py-1 border border-[#7B63A8]/15 font-pixelJp text-xs text-rpg-textDark"
                >
                  {pokemon}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Everyone's Photos - Only show if there are other people's photos */}
        {(() => {
          const othersPhotos = photos.filter(photo => !currentUserId || photo.visit?.user_id !== currentUserId);
          return othersPhotos.length > 0 ? (
            <div className="rpg-window">
              <h2 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-3">
                旅の写真 ({othersPhotos.length}枚)
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {othersPhotos.map((photo) => {
                  const reactions = photoReactions.get(photo.id) || {
                    likes: 0,
                    bookmarks: 0,
                    comments: 0,
                    userLiked: false,
                    userBookmarked: false
                  };

                  return (
                    <div
                      key={photo.id}
                      className="bg-[#F6EEDC] border border-[#7B63A8]/15 rounded-lg overflow-hidden"
                    >
                      {/* Photo Image */}
                      <div className="relative aspect-square bg-[#F6EEDC] overflow-hidden">
                        <img
                          src={`/api/photo/${photo.id}?size=small`}
                          alt="ポケふた写真"
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent && !parent.querySelector('.error-placeholder')) {
                              const errorDiv = document.createElement('div');
                              errorDiv.className = 'error-placeholder absolute inset-0 bg-[#F6EEDC] flex flex-col items-center justify-center border border-[#7B63A8]/15';
                              errorDiv.innerHTML = `
                                <svg class="w-12 h-12 text-rpg-textDark opacity-50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                </svg>
                                <span class="font-pixelJp text-[10px] text-rpg-textDark opacity-70 text-center px-2">画像が見つかりません</span>
                              `;
                              parent.appendChild(errorDiv);
                            }
                          }}
                        />

                        {/* Subtle overlay with user, date, and reactions */}
                        <div className="absolute bottom-0 left-0 right-0 z-10">
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent pointer-events-none"></div>
                          <div className="relative p-2">
                            {/* User and date info */}
                            <div className="flex items-center gap-1 mb-1">
                              <UserIcon className="w-3 h-3 text-white/80" />
                              <span className="font-pixelJp text-[10px] text-white/80 truncate drop-shadow">
                                {getPhotoUserLabel(photo)}
                              </span>
                            </div>
                            {photo.visit?.shot_at && (
                              <div className="flex items-center gap-1 mb-2">
                                <Clock className="w-3 h-3 text-white/80" />
                                <span className="font-pixelJp text-[10px] text-white/80 drop-shadow">
                                  {formatDateJa(photo.visit.shot_at)}
                                </span>
                              </div>
                            )}
                            {/* Like and Bookmark buttons */}
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleReaction(photo, 'like')}
                                className={`flex items-center gap-1 bg-black/50 backdrop-blur-sm border border-white/30 px-1.5 py-0.5 rounded transition-colors ${
                                  reactions.userLiked ? 'bg-rpg-red/80' : 'hover:bg-rpg-red/80'
                                }`}
                                title={reactions.userLiked ? 'いいね解除' : 'いいね'}
                              >
                                <Heart className={`w-3 h-3 ${reactions.userLiked ? 'fill-white' : ''} text-white`} />
                                <span className="font-pixel text-[9px] text-white">{reactions.likes}</span>
                              </button>
                              <button
                                onClick={() => handleReaction(photo, 'bookmark')}
                                className={`flex items-center gap-1 bg-black/50 backdrop-blur-sm border border-white/30 px-1.5 py-0.5 rounded transition-colors ${
                                  reactions.userBookmarked ? 'bg-rpg-blue/80' : 'hover:bg-rpg-blue/80'
                                }`}
                                title={reactions.userBookmarked ? 'ブックマーク解除' : 'ブックマーク'}
                              >
                                <Bookmark className={`w-3 h-3 ${reactions.userBookmarked ? 'fill-white' : ''} text-white`} />
                                <span className="font-pixel text-[9px] text-white">{reactions.bookmarks}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null;
        })()}

        {/* Comments - Hidden for stamp collection experience */}
        {false && (
          <div className="rpg-window">
            <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-3">コメント</h3>

            {commentsLoading ? (
              <div className="py-6 text-center">
                <span className="font-pixelJp text-sm text-rpg-textDark opacity-70">読み込み中...</span>
              </div>
            ) : manholeComments.length === 0 ? (
              <div className="py-6 text-center">
                <span className="font-pixelJp text-sm text-rpg-textDark opacity-70">まだコメントがありません</span>
              </div>
            ) : (
              <div className="space-y-3">
                {manholeComments.map((comment) => (
                  <div key={comment.id} className="bg-[#F6EEDC] border border-[#7B63A8]/15 p-3 rounded">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-rpg-yellow border border-[#7B63A8]/15 rounded-full flex items-center justify-center">
                        <span className="font-pixelJp text-xs text-rpg-textDark">{getCommentUserInitial(comment)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-pixelJp text-sm text-[#7B63A8] font-bold truncate">{getCommentUserLabel(comment)}</span>
                          <span className="font-pixelJp text-xs text-rpg-textDark opacity-60 flex-shrink-0">
                            {format(new Date(comment.created_at), 'M/d HH:mm', { locale: ja })}
                          </span>
                        </div>
                        <p className="font-pixelJp text-sm text-rpg-textDark whitespace-pre-wrap break-words">{comment.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {commentsError && (
              <div className="mt-3">
                <div className="bg-rpg-red/20 border-2 border-rpg-red p-2 rounded">
                  <p className="font-pixelJp text-xs text-rpg-red">{commentsError}</p>
                </div>
              </div>
            )}

            {currentUserId ? (
              <form onSubmit={handleSubmitManholeComment} className="mt-4 pt-4 border-t border-[#7B63A8]/15">
                <div className="flex gap-2">
                  <textarea
                    value={newManholeComment}
                    onChange={(e) => setNewManholeComment(e.target.value)}
                    placeholder="コメントを入力..."
                    className="flex-1 bg-white/70 border border-[#7B63A8]/15 p-2 font-pixelJp text-sm text-rpg-textDark placeholder-rpg-textDark/50 resize-none focus:outline-none focus:border-rpg-yellow rounded"
                    rows={2}
                    maxLength={1000}
                    disabled={commentsSubmitting}
                  />
                  <button
                    type="submit"
                    disabled={commentsSubmitting || !newManholeComment.trim()}
                    className="rpg-button rpg-button-success px-4 self-end disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="font-pixelJp text-xs">投稿</span>
                  </button>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="font-pixelJp text-xs text-rpg-textDark opacity-70">{newManholeComment.length}/1000</span>
                </div>
              </form>
            ) : (
              <div className="mt-4 pt-4 border-t border-[#7B63A8]/15">
                <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">ログインするとコメントを投稿できます</p>
              </div>
            )}
          </div>
        )}

        {/* Map */}
        <div className="rpg-window">
          <h2 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-3">場所</h2>
          <div className="h-64 border border-[#7B63A8]/15 overflow-hidden">
            <MapComponent
              center={{
                lat: manhole.latitude ?? 36.0,
                lng: manhole.longitude ?? 138.0
              }}
              manholes={[manhole]}
              onManholeClick={handleManholeClick}
              userLocation={null}
            />
          </div>
        </div>

        {/* Additional Info - Collapsible */}
        <div className="rpg-window">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between font-pixelJp text-sm font-bold text-rpg-textDark hover:text-[#7B63A8] transition-colors"
          >
            <h2 className="font-pixelJp text-sm font-bold">詳細データを見る</h2>
            <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </button>

          {showDetails && (
            <div className="mt-3 pt-3 border-t border-[#7B63A8]/15 space-y-2 font-pixelJp text-xs">
              <div className="flex justify-between text-rpg-textDark">
                <span className="opacity-70">ID</span>
                <span className="font-pixel">{manhole.id}</span>
              </div>
              <div className="flex justify-between text-rpg-textDark">
                <span className="opacity-70">緯度</span>
                <span className="font-pixel text-[10px]">{manhole.latitude?.toFixed(6)}</span>
              </div>
              <div className="flex justify-between text-rpg-textDark">
                <span className="opacity-70">経度</span>
                <span className="font-pixel text-[10px]">{manhole.longitude?.toFixed(6)}</span>
              </div>
              {manhole.detail_url && (
                <div className="flex justify-between items-center text-rpg-textDark">
                  <span className="opacity-70">詳細URL</span>
                  <a
                    href={manhole.detail_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rpg-blue underline truncate max-w-40"
                  >
                    公式情報
                  </a>
                </div>
              )}
              {manhole.created_at && (
                <div className="flex justify-between text-rpg-textDark">
                  <span className="opacity-70">作成日</span>
                  <span>{new Date(manhole.created_at).toLocaleDateString('ja-JP')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
