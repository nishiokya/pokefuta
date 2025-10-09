'use client';

import { useState, useEffect } from 'react';
import { MapPin, Calendar, Camera, Filter, Grid, List, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Manhole } from '@/types/database';

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

type ViewMode = 'grid' | 'list';
type SortBy = 'date' | 'location' | 'name';
type FilterBy = 'all' | 'with-photos' | 'without-photos';

export default function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

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
          const apiVisits: Visit[] = data.visits.map((visit: any) => ({
            id: visit.id,
            manhole: {
              id: visit.manhole?.id || 0,
              title: visit.manhole?.title || 'Unknown Manhole',
              prefecture: visit.manhole?.prefecture || '',
              municipality: visit.manhole?.municipality || null,
              location: visit.manhole?.location || '',
              pokemons: visit.manhole?.pokemons || [],
              name: visit.manhole?.title,
              description: visit.note,
              city: visit.manhole?.municipality,
              created_at: visit.created_at,
              updated_at: visit.updated_at,
              detail_url: visit.manhole?.detail_url || null,
              prefecture_site_url: visit.manhole?.prefecture_site_url || null,
            },
            visited_at: visit.shot_at,
            photos: visit.photos.map((photo: any) => ({
              id: photo.id,
              url: photo.url,
              thumbnail_url: photo.thumbnail_url
            })),
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

  const filteredAndSortedVisits = () => {
    let filtered = visits;

    // Apply filter
    if (filterBy === 'with-photos') {
      filtered = filtered.filter(visit => visit.photos.length > 0);
    } else if (filterBy === 'without-photos') {
      filtered = filtered.filter(visit => visit.photos.length === 0);
    }

    // Apply prefecture filter
    if (selectedPrefecture !== 'all') {
      filtered = filtered.filter(visit => visit.manhole.prefecture === selectedPrefecture);
    }

    // Apply sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime();
        case 'location':
          return (a.manhole.prefecture || '').localeCompare(b.manhole.prefecture || '');
        case 'name':
          return (a.manhole.name || '').localeCompare(b.manhole.name || '');
        default:
          return 0;
      }
    });

    return filtered;
  };

  const getPrefectures = () => {
    const prefectures = Array.from(new Set(visits.map(v => v.manhole.prefecture).filter(Boolean)));
    return prefectures.sort();
  };

  const getStats = () => {
    const totalVisits = visits.length;
    const totalPhotos = visits.reduce((sum, visit) => sum + visit.photos.length, 0);
    const prefectures = new Set(visits.map(v => v.manhole.prefecture).filter(Boolean)).size;

    return { totalVisits, totalPhotos, prefectures };
  };

  const stats = getStats();
  const displayedVisits = filteredAndSortedVisits();

  if (loading) {
    return (
      <div className="min-h-screen safe-area-inset flex items-center justify-center">
        <div className="text-center">
          <div className="loading-pokemon mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-pokemon-red to-pokemon-blue loading-spin mx-auto"></div>
          </div>
          <p className="text-pokemon-darkBlue font-semibold">訪問履歴を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen safe-area-inset">
      {/* Header */}
      <div className="bg-gradient-to-r from-pokemon-red via-pokemon-blue to-pokemon-yellow p-4 text-white">
        <div className="container-pokemon">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Calendar className="w-6 h-6" />
              <h1 className="text-xl font-bold text-shadow-pokemon">訪問履歴</h1>
            </div>
            <button
              onClick={() => window.history.back()}
              className="btn-pokemon-secondary"
            >
              戻る
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="container-pokemon">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-pokemon-red">{stats.totalVisits}</div>
              <div className="text-sm text-gray-600">訪問数</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-pokemon-blue">{stats.totalPhotos}</div>
              <div className="text-sm text-gray-600">写真数</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-pokemon-yellow">{stats.prefectures}</div>
              <div className="text-sm text-gray-600">都道府県</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-50 border-b border-gray-200 p-4">
        <div className="container-pokemon">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-pokemon-blue text-white' : 'bg-white text-gray-600'}`}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-pokemon-blue text-white' : 'bg-white text-gray-600'}`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="btn-pokemon-secondary flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              フィルター
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="bg-white rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    並び順
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="input-pokemon w-full"
                  >
                    <option value="date">訪問日時</option>
                    <option value="location">都道府県</option>
                    <option value="name">マンホール名</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    写真フィルター
                  </label>
                  <select
                    value={filterBy}
                    onChange={(e) => setFilterBy(e.target.value as FilterBy)}
                    className="input-pokemon w-full"
                  >
                    <option value="all">すべて</option>
                    <option value="with-photos">写真あり</option>
                    <option value="without-photos">写真なし</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    都道府県
                  </label>
                  <select
                    value={selectedPrefecture}
                    onChange={(e) => setSelectedPrefecture(e.target.value)}
                    className="input-pokemon w-full"
                  >
                    <option value="all">すべて</option>
                    {getPrefectures().map(prefecture => (
                      <option key={prefecture} value={prefecture}>
                        {prefecture}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Visits */}
      <div className="container-pokemon py-6">
        {displayedVisits.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              訪問履歴がありません
            </h3>
            <p className="text-gray-500 mb-6">
              ポケふたを見つけて写真を撮影してみましょう！
            </p>
            <button
              onClick={() => window.location.href = '/map'}
              className="btn-pokemon"
            >
              マップを見る
            </button>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'space-y-4'}>
            {displayedVisits.map((visit) => (
              <div key={visit.id} className="visit-card">
                <div className={viewMode === 'grid' ? 'space-y-4' : 'flex gap-4'}>
                  {/* Photos */}
                  <div className={viewMode === 'grid' ? 'w-full' : 'flex-shrink-0 w-32'}>
                    {visit.photos.length > 0 ? (
                      <div className={`grid gap-1 ${viewMode === 'grid' ? 'grid-cols-2' : 'grid-cols-2'}`}>
                        {visit.photos.slice(0, 4).map((photo, index) => (
                          <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                            <img
                              src={photo.thumbnail_url}
                              alt={`Photo ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback if image fails to load
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.innerHTML = `
                                  <div class="w-full h-full bg-gradient-to-br from-pokemon-lightBlue to-pokemon-blue flex items-center justify-center">
                                    <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    </svg>
                                  </div>
                                `;
                              }}
                            />
                            {visit.photos.length > 4 && index === 3 && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <span className="text-white font-bold">
                                  +{visit.photos.length - 3}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                        <Camera className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="font-bold text-pokemon-darkBlue">
                        {visit.manhole.name || 'ポケふた'}
                      </h3>
                      <span className="badge-pokemon">
                        {visit.photos.length}枚
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>
                        {visit.manhole.prefecture} {visit.manhole.city}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {format(new Date(visit.visited_at), 'yyyy年M月d日 HH:mm', { locale: ja })}
                      </span>
                    </div>

                    {visit.manhole.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {visit.manhole.description}
                      </p>
                    )}

                    {visit.notes && (
                      <div className="bg-pokemon-lightBlue/30 rounded-lg p-3">
                        <p className="text-sm text-pokemon-darkBlue">
                          📝 {visit.notes}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => window.location.href = `/manhole/${visit.manhole.id}`}
                        className="btn-pokemon-secondary text-sm px-3 py-1"
                      >
                        詳細を見る
                      </button>
                      {visit.photos.length > 0 && (
                        <button
                          onClick={() => window.location.href = `/visit/${visit.id}/photos`}
                          className="btn-pokemon-secondary text-sm px-3 py-1"
                        >
                          写真を見る
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}