'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, Calendar, Camera, Navigation, History, Heart, Bookmark, Home, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';
import DeletePhotoModal from '@/components/DeletePhotoModal';

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

export default function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // ページタイトル設定
    document.title = '訪問履歴 - ポケふた訪問記録';

    loadVisits();
  }, []);

  const loadVisits = async () => {
    try {
      // Fetch visits from the API
      const response = await fetch('/api/visits');
      if (response.ok) {
        const data = await response.json();

        if (data.success && data.visits) {
          // Transform API response to match our Visit interface
          // Filter out visits without manhole data
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
                thumbnail_url: photo.thumbnail_url
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
    } catch (error) {
      console.error('Failed to load visits:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortedVisits = [...visits].sort((a, b) =>
    new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime()
  );

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
        // 成功: 写真リストから削除し、写真がなくなったvisitは非表示
        const updatedVisits = visits
          .map(visit => ({
            ...visit,
            photos: visit.photos.filter(p => p.id !== selectedPhotoId)
          }))
          .filter(visit => visit.photos.length > 0); // 写真が0枚になったvisitを除外

        setVisits(updatedVisits);
        setDeleteModalOpen(false);
        setSelectedPhotoId(null);

        // 成功メッセージ（オプション）
        alert('写真を削除しました');
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

  const handleLikeToggle = async (visitId: string) => {
    const visit = visits.find(v => v.id === visitId);
    if (!visit) return;

    const isLiked = visit.is_liked;
    const method = isLiked ? 'DELETE' : 'POST';

    // Optimistic update
    setVisits(prevVisits => prevVisits.map(v =>
      v.id === visitId
        ? {
            ...v,
            is_liked: !isLiked,
            likes_count: isLiked ? v.likes_count - 1 : v.likes_count + 1
          }
        : v
    ));

    try {
      const response = await fetch(`/api/visits/${visitId}/like`, {
        method,
      });

      if (!response.ok) {
        // Revert on error
        setVisits(prevVisits => prevVisits.map(v =>
          v.id === visitId
            ? {
                ...v,
                is_liked: isLiked,
                likes_count: isLiked ? v.likes_count + 1 : v.likes_count - 1
              }
            : v
        ));
        console.error('Failed to toggle like');
      }
    } catch (error) {
      // Revert on error
      setVisits(prevVisits => prevVisits.map(v =>
        v.id === visitId
          ? {
              ...v,
              is_liked: isLiked,
              likes_count: isLiked ? v.likes_count + 1 : v.likes_count - 1
            }
          : v
      ));
      console.error('Error toggling like:', error);
    }
  };

  const handleBookmarkToggle = async (visitId: string) => {
    const visit = visits.find(v => v.id === visitId);
    if (!visit) return;

    const isBookmarked = visit.is_bookmarked;
    const method = isBookmarked ? 'DELETE' : 'POST';

    // Optimistic update
    setVisits(prevVisits => prevVisits.map(v =>
      v.id === visitId
        ? { ...v, is_bookmarked: !isBookmarked }
        : v
    ));

    try {
      const response = await fetch(`/api/visits/${visitId}/bookmark`, {
        method,
      });

      if (!response.ok) {
        // Revert on error
        setVisits(prevVisits => prevVisits.map(v =>
          v.id === visitId
            ? { ...v, is_bookmarked: isBookmarked }
            : v
        ));
        console.error('Failed to toggle bookmark');
      }
    } catch (error) {
      // Revert on error
      setVisits(prevVisits => prevVisits.map(v =>
        v.id === visitId
          ? { ...v, is_bookmarked: isBookmarked }
          : v
      ));
      console.error('Error toggling bookmark:', error);
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

  return (
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark">
      {/* Feed Container */}
      <div className="max-w-2xl mx-auto pb-nav-safe">
        {sortedVisits.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="rpg-window">
              <Camera className="w-16 h-16 mx-auto mb-4 text-rpg-textDark opacity-50" />
              <h3 className="font-pixelJp text-lg text-rpg-textDark mb-2">
                まだ冒険の記録がありません
              </h3>
              <p className="font-pixelJp text-sm text-rpg-textDark mb-6">
                ポケふたを見つけて、冒険を始めよう！
              </p>
              <button
                onClick={() => window.location.href = '/'}
                className="rpg-button rpg-button-primary"
              >
                マップを見る
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {sortedVisits.map((visit) => (
              <div key={visit.id} className="rpg-window">
                {/* Header */}
                <div className="flex items-center gap-3 mb-3 pb-3 border-b-2 border-rpg-border">
                  <div className="w-10 h-10 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-rpg-textDark" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-pixelJp text-sm text-rpg-textDark font-bold">
                      {visit.manhole.name || 'ポケふた'}
                    </h3>
                    <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                      {visit.manhole.prefecture} {visit.manhole.city}
                    </p>
                  </div>
                </div>

                {/* Photos */}
                {visit.photos.length > 0 ? (
                  <div className="mb-3 -mx-rpg-2">
                    <div className={`grid gap-1 ${visit.photos.length === 1 ? 'grid-cols-1' : visit.photos.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                      {visit.photos.slice(0, 4).map((photo, index) => (
                        <div
                          key={photo.id}
                          className={`relative ${visit.photos.length === 1 ? 'aspect-square' : 'aspect-square'} bg-rpg-bgDark overflow-hidden group border-2 border-rpg-border`}
                        >
                          <img
                            src={photo.thumbnail_url}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-full object-cover"
                            style={{ imageRendering: 'pixelated' }}
                            onError={(e) => {
                              // 画像読み込みエラー時の表示
                              const target = e.currentTarget;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent && !parent.querySelector('.error-placeholder')) {
                                const errorDiv = document.createElement('div');
                                errorDiv.className = 'error-placeholder absolute inset-0 bg-rpg-bgDark flex flex-col items-center justify-center';
                                errorDiv.innerHTML = `
                                  <svg class="w-8 h-8 text-rpg-textDark opacity-50 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                  </svg>
                                  <span class="font-pixelJp text-[10px] text-rpg-textDark opacity-70 text-center px-2">画像なし</span>
                                `;
                                parent.appendChild(errorDiv);
                              }
                            }}
                          />
                          {visit.photos.length > 4 && index === 3 && (
                            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                              <span className="font-pixel text-white text-xl">
                                +{visit.photos.length - 3}
                              </span>
                            </div>
                          )}
                          {/* Delete button - shows on hover (always display regardless of image load status) */}
                          {visit.photos.length <= 4 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(photo.id);
                              }}
                              className="absolute top-2 right-2 bg-rpg-red border-2 border-rpg-border p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-20"
                              title="写真を削除"
                            >
                              <Trash2 className="w-3 h-3 text-white" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 -mx-rpg-2">
                    <div className="aspect-video bg-rpg-bgDark border-2 border-rpg-border flex items-center justify-center">
                      <Camera className="w-12 h-12 text-rpg-textDark opacity-30" />
                    </div>
                  </div>
                )}

                {/* Actions (Instagram-like) */}
                <div className="flex items-center gap-4 mb-3 pb-3 border-b-2 border-rpg-border">
                  <button
                    onClick={() => handleLikeToggle(visit.id)}
                    className="flex items-center gap-1 hover:opacity-70 transition-opacity"
                  >
                    <Heart
                      className={`w-5 h-5 ${visit.is_liked ? 'fill-rpg-red text-rpg-red' : 'text-rpg-red'}`}
                    />
                    {visit.likes_count > 0 && (
                      <span className="font-pixel text-xs text-rpg-textDark">
                        {visit.likes_count}
                      </span>
                    )}
                  </button>
                  <div className="flex-1"></div>
                  <button
                    onClick={() => handleBookmarkToggle(visit.id)}
                    className="hover:opacity-70 transition-opacity"
                  >
                    <Bookmark
                      className={`w-5 h-5 ${visit.is_bookmarked ? 'fill-rpg-yellow text-rpg-yellow' : 'text-rpg-yellow'}`}
                    />
                  </button>
                </div>

                {/* Info */}
                <div className="space-y-2">
                  {visit.likes_count > 0 && (
                    <div className="font-pixelJp text-sm text-rpg-textDark">
                      <span className="font-bold">{visit.likes_count}人</span>がいいねしました
                    </div>
                  )}

                  {visit.comment && (
                    <p className="font-pixelJp text-sm text-rpg-textDark">
                      {visit.comment}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-xs text-rpg-yellow">
                      {visit.photos.length}
                    </span>
                    <span className="font-pixelJp text-xs text-rpg-textDark">
                      枚の写真
                    </span>
                  </div>

                  {visit.notes && (
                    <p className="font-pixelJp text-sm text-rpg-textDark">
                      <span className="font-bold">メモ:</span> {visit.notes}
                    </p>
                  )}

                  {visit.manhole.pokemons && visit.manhole.pokemons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {visit.manhole.pokemons.slice(0, 5).map((pokemon, index) => (
                        <span
                          key={index}
                          className="bg-rpg-yellow px-2 py-1 border-2 border-rpg-border font-pixelJp text-xs text-rpg-textDark"
                        >
                          {pokemon}
                        </span>
                      ))}
                      {visit.manhole.pokemons.length > 5 && (
                        <span className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                          +{visit.manhole.pokemons.length - 5}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Calendar className="w-4 h-4 text-rpg-textDark opacity-70" />
                    <span className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                      {format(new Date(visit.visited_at), 'yyyy/MM/dd HH:mm', { locale: ja })}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => window.location.href = `/manhole/${visit.manhole.id}`}
                      className="rpg-button text-xs flex-1"
                    >
                      詳細
                    </button>
                    {visit.photos.length > 0 && (
                      <button
                        onClick={() => window.location.href = `/visit/${visit.id}/photos`}
                        className="rpg-button rpg-button-success text-xs flex-1"
                      >
                        写真
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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