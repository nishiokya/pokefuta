
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, ArrowLeft, Camera, Navigation, Clock, History, Home, Trash2, Heart, Bookmark, User as UserIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Manhole } from '@/types/database';
import DeletePhotoModal from '@/components/DeletePhotoModal';

const MapComponent = dynamic(
  () => import('@/components/Map/MapComponent'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 bg-rpg-bgDark border-2 border-rpg-border flex items-center justify-center">
        <div className="font-pixelJp text-rpg-textGold">
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [photoReactions, setPhotoReactions] = useState<Map<string, PhotoSocial>>(new Map());

  const [manholeComments, setManholeComments] = useState<ManholeComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsSubmitting, setCommentsSubmitting] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newManholeComment, setNewManholeComment] = useState('');

  useEffect(() => {
    const manholeId = params.id;
    if (manholeId) {
      loadManholeDetail(manholeId as string);
      loadPhotos(manholeId as string);
      loadManholeComments(manholeId as string);
      loadCurrentUser();
    }
  }, [params.id]);

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
      const url = `https://www.google.com/maps/dir/?api=1&destination=${manhole.latitude},${manhole.longitude}`;
      window.open(url, '_blank');
    }
  };

  const handleDeleteClick = (photoId: string) => {
    setSelectedPhotoId(photoId);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPhotoId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/photo/${selectedPhotoId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 成功: 写真リストから削除
        const updatedPhotos = photos.filter(p => p.id !== selectedPhotoId);
        setPhotos(updatedPhotos);
        setDeleteModalOpen(false);
        setSelectedPhotoId(null);

        // 成功メッセージ
        if (updatedPhotos.length === 0) {
          alert('写真を削除しました。このマンホールの写真はすべて削除されました。');
        } else {
          alert('写真を削除しました');
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
      <div className="min-h-screen safe-area-inset bg-rpg-bgDark flex items-center justify-center">
        <div className="text-center">
          <div className="font-pixelJp text-rpg-textGold">
            読み込み中<span className="rpg-loading"></span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !manhole) {
    return (
      <div className="min-h-screen safe-area-inset bg-rpg-bgDark">
        {/* Header */}
        <div className="bg-rpg-bgDark border-b-4 border-rpg-border p-4">
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
              onClick={() => router.push('/')}
              className="rpg-button rpg-button-primary"
            >
              <span className="font-pixelJp">マップに戻る</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark pb-20">
      {/* Header */}
      <div className="bg-rpg-bgDark border-b-4 border-rpg-border p-4 sticky top-0 z-20">
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

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Main Info Card */}
        <div className="rpg-window">
          <h2 className="rpg-window-title text-base mb-4">
            {manhole.name || manhole.title || 'ポケふた'}
          </h2>

          <div className="space-y-3">
            <div className="flex items-center font-pixelJp text-sm text-rpg-textDark">
              <MapPin className="w-4 h-4 mr-2 text-rpg-blue" />
              <span>
                {manhole.prefecture} {manhole.city || manhole.municipality}
              </span>
            </div>

            {manhole.description && (
              <div className="font-pixelJp text-xs text-rpg-textDark bg-rpg-bgLight p-3 border-2 border-rpg-border">
                {manhole.description}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t-2 border-rpg-border">
              <div className="flex items-center">
                <div className={`w-3 h-3 border-2 border-rpg-border mr-2 ${manhole.is_visited ? 'bg-rpg-red' : 'bg-rpg-blue'}`}></div>
                <span className="font-pixelJp text-sm text-rpg-textDark font-bold">
                  {manhole.is_visited ? '訪問済み' : '未訪問'}
                </span>
              </div>

              {manhole.is_visited && manhole.last_visit && (
                <div className="flex items-center font-pixelJp text-xs text-rpg-textDark opacity-70">
                  <Clock className="w-3 h-3 mr-1" />
                  <span>{new Date(manhole.last_visit).toLocaleDateString('ja-JP')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pokemon Info */}
        {manhole.pokemons && manhole.pokemons.length > 0 && (
          <div className="rpg-window">
            <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-3">登場ポケモン</h3>
            <div className="flex flex-wrap gap-2">
              {manhole.pokemons.map((pokemon, index) => (
                <span
                  key={index}
                  className="bg-rpg-yellow px-2 py-1 border-2 border-rpg-border font-pixelJp text-xs text-rpg-textDark"
                >
                  {pokemon}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div className="rpg-window">
            <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-3">
              📸 ポケふた写真 ({photos.length}枚)
            </h3>
            <div className="space-y-4">
              {photos.map((photo) => {
                const isOwner = currentUserId && photo.visit?.user_id === currentUserId;
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
                    className="bg-rpg-bgDark border-2 border-rpg-border"
                  >
                    {/* Photo Image */}
                    <div className="relative aspect-square bg-rpg-bgDark overflow-hidden group">
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
                            errorDiv.className = 'error-placeholder absolute inset-0 bg-rpg-bgDark flex flex-col items-center justify-center border-2 border-rpg-border';
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

                      {/* Floating Overlay - Bottom */}
                        <div className="absolute bottom-0 left-0 right-0 z-10">
                        {/* Gradient Background */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent pointer-events-none"></div>

                        <div className="relative p-3">
                            {/* Meta Row (ユーザー名・撮影日) */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1 min-w-0">
                                <UserIcon className="w-4 h-4 text-white/90" />
                                <span className="font-pixelJp text-xs text-white/90 truncate drop-shadow">
                                  {getPhotoUserLabel(photo)}
                                </span>
                              </div>
                              {photo.visit?.shot_at && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <Clock className="w-4 h-4 text-white/90" />
                                  <span className="font-pixelJp text-xs text-white/90 drop-shadow">
                                    {new Date(photo.visit.shot_at).toLocaleDateString('ja-JP')}
                                  </span>
                                </div>
                              )}
                            </div>

                          {/* Comment Section (上部) - Instagram style */}
                          {photo.visit?.comment && (photo.visit?.is_public || (currentUserId && photo.visit?.user_id === currentUserId)) && (
                            <div className="mb-3 group/comment">
                              <p className="font-pixelJp text-xs text-white leading-relaxed line-clamp-2 group-hover/comment:line-clamp-none transition-all duration-200 drop-shadow-lg">
                                {photo.visit.comment}
                              </p>
                            </div>
                          )}

                          {/* Action Buttons (下部) */}
                          <div className="flex items-center justify-between">
                            {/* Left: Like & Bookmark Buttons */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleReaction(photo, 'like')}
                              className={`flex items-center gap-1 bg-black/50 backdrop-blur-sm border border-white/30 px-2 py-1 transition-colors ${
                                reactions.userLiked ? 'bg-rpg-red/80' : 'hover:bg-rpg-red/80'
                              }`}
                              title={reactions.userLiked ? 'いいね解除' : 'いいね'}
                            >
                              <Heart className={`w-4 h-4 ${reactions.userLiked ? 'fill-white' : ''} text-white`} />
                              <span className="font-pixel text-[10px] text-white">{reactions.likes}</span>
                            </button>
                            <button
                              onClick={() => handleReaction(photo, 'bookmark')}
                              className={`flex items-center gap-1 bg-black/50 backdrop-blur-sm border border-white/30 px-2 py-1 transition-colors ${
                                reactions.userBookmarked ? 'bg-rpg-blue/80' : 'hover:bg-rpg-blue/80'
                              }`}
                              title={reactions.userBookmarked ? 'ブックマーク解除' : 'ブックマーク'}
                            >
                              <Bookmark className={`w-4 h-4 ${reactions.userBookmarked ? 'fill-white' : ''} text-white`} />
                              <span className="font-pixel text-[10px] text-white">{reactions.bookmarks}</span>
                            </button>
                          </div>

                            {/* Right: Delete Button (only for owner) */}
                            {isOwner && (
                              <button
                                onClick={() => handleDeleteClick(photo.id)}
                                className="bg-rpg-red/80 backdrop-blur-sm border border-white/30 p-1.5 hover:bg-rpg-red transition-colors"
                                title="写真を削除"
                              >
                                <Trash2 className="w-4 h-4 text-white" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Photo Info (画像下) */}
                    <div className="p-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Comments */}
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
                <div key={comment.id} className="bg-rpg-bgDark border-2 border-rpg-border p-3 rounded">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-rpg-yellow border-2 border-rpg-border rounded-full flex items-center justify-center">
                      <span className="font-pixelJp text-xs text-rpg-textDark">{getCommentUserInitial(comment)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-pixelJp text-sm text-rpg-textGold font-bold truncate">{getCommentUserLabel(comment)}</span>
                        <span className="font-pixelJp text-xs text-rpg-bgLight opacity-70 flex-shrink-0">
                          {format(new Date(comment.created_at), 'M/d HH:mm', { locale: ja })}
                        </span>
                      </div>
                      <p className="font-pixelJp text-sm text-rpg-bgLight whitespace-pre-wrap break-words">{comment.content}</p>
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
            <form onSubmit={handleSubmitManholeComment} className="mt-4 pt-4 border-t-2 border-rpg-border">
              <div className="flex gap-2">
                <textarea
                  value={newManholeComment}
                  onChange={(e) => setNewManholeComment(e.target.value)}
                  placeholder="コメントを入力..."
                  className="flex-1 bg-rpg-bgLight border-2 border-rpg-border p-2 font-pixelJp text-sm text-rpg-textDark placeholder-rpg-textDark/50 resize-none focus:outline-none focus:border-rpg-yellow rounded"
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
            <div className="mt-4 pt-4 border-t-2 border-rpg-border">
              <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">ログインするとコメントを投稿できます</p>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="rpg-window">
          <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-3">地図</h3>
          <div className="h-64 border-2 border-rpg-border overflow-hidden">
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

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={openInMaps}
            className="rpg-button rpg-button-success flex items-center justify-center gap-2"
          >
            <Navigation className="w-4 h-4" />
            <span className="font-pixelJp text-xs">経路案内</span>
          </button>
          <button
            onClick={() => router.push('/upload')}
            className="rpg-button rpg-button-primary flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" />
            <span className="font-pixelJp text-xs">写真登録</span>
          </button>
        </div>

        {/* Additional Info */}
        <div className="rpg-window">
          <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-3">詳細情報</h3>
          <div className="space-y-2 font-pixelJp text-xs">
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
        </div>
      </div>

      {/* Bottom Navigation - RPG Style */}
      <nav className="nav-rpg">
        <div className="flex justify-around items-center max-w-md mx-auto py-2">
          <Link href="/" className="nav-rpg-item">
            <Home className="w-6 h-6 mb-1" />
            <span>ホーム</span>
          </Link>
          <Link href="/map" className="nav-rpg-item">
            <MapPin className="w-6 h-6 mb-1" />
            <span>マップ</span>
          </Link>
          <Link href="/nearby" className="nav-rpg-item">
            <Navigation className="w-6 h-6 mb-1" />
            <span>近く</span>
          </Link>
          <Link href="/upload" className="nav-rpg-item">
            <Camera className="w-6 h-6 mb-1" />
            <span>登録</span>
          </Link>
          <Link href="/visits" className="nav-rpg-item">
            <History className="w-6 h-6 mb-1" />
            <span>履歴</span>
          </Link>
        </div>
      </nav>

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