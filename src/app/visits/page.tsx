'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, Calendar, Camera, Navigation, History, Heart, MessageCircle, Send, Bookmark, Home } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Manhole } from '@/types/database';
import Header from '@/components/Header';

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
}

export default function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
              notes: visit.note
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
      <Header title="📚 ポケふたの記録" icon={<History className="w-6 h-6" />} />

      {/* Feed Container */}
      <div className="max-w-2xl mx-auto pb-20">
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
                          className={`relative ${visit.photos.length === 1 ? 'aspect-square' : 'aspect-square'} bg-rpg-bgDark overflow-hidden`}
                        >
                          <img
                            src={photo.thumbnail_url}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-full object-cover"
                            style={{ imageRendering: 'pixelated' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement!.innerHTML = `
                                <div class="w-full h-full bg-rpg-bgDark flex items-center justify-center border-2 border-rpg-border">
                                  <svg class="w-8 h-8 text-rpg-textDark opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                                  </svg>
                                </div>
                              `;
                            }}
                          />
                          {visit.photos.length > 4 && index === 3 && (
                            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                              <span className="font-pixel text-white text-xl">
                                +{visit.photos.length - 3}
                              </span>
                            </div>
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
                  <button className="flex items-center gap-1 hover:opacity-70">
                    <Heart className="w-5 h-5 text-rpg-red" />
                  </button>
                  <button className="flex items-center gap-1 hover:opacity-70">
                    <MessageCircle className="w-5 h-5 text-rpg-blue" />
                  </button>
                  <button className="flex items-center gap-1 hover:opacity-70">
                    <Send className="w-5 h-5 text-rpg-green" />
                  </button>
                  <div className="flex-1"></div>
                  <button className="hover:opacity-70">
                    <Bookmark className="w-5 h-5 text-rpg-yellow" />
                  </button>
                </div>

                {/* Info */}
                <div className="space-y-2">
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
          <Link href="/visits" className="nav-rpg-item active">
            <History className="w-6 h-6 mb-1" />
            <span>履歴</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}