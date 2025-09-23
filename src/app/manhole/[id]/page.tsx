
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MapPin, ArrowLeft, Camera, Navigation, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Manhole } from '@/types/database';

const MapComponent = dynamic(
  () => import('@/components/Map/MapComponent'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="loading-pokemon">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pokemon-red to-pokemon-blue loading-spin"></div>
        </div>
      </div>
    )
  }
);

export default function ManholeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [manhole, setManhole] = useState<Manhole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const manholeId = params.id;
    if (manholeId) {
      loadManholeDetail(manholeId as string);
    }
  }, [params.id]);

  const loadManholeDetail = async (id: string) => {
    try {
      // First try to get all manholes and find the specific one
      const response = await fetch('/api/manholes');
      if (response.ok) {
        const manholes = await response.json();
        const foundManhole = manholes.find((m: Manhole) => m.id.toString() === id);

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

  const handleManholeClick = (clickedManhole: Manhole) => {
    // Navigate to the clicked manhole's detail page
    router.push(`/manhole/${clickedManhole.id}`);
  };

  const openInMaps = () => {
    if (manhole) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${manhole.latitude},${manhole.longitude}`;
      window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen safe-area-inset bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-pokemon mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-pokemon-red to-pokemon-blue loading-spin mx-auto"></div>
          </div>
          <p className="text-pokemon-darkBlue font-semibold">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !manhole) {
    return (
      <div className="min-h-screen safe-area-inset bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-pokemon-red via-pokemon-blue to-pokemon-yellow p-4 text-white">
          <div className="container-pokemon">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => router.back()}
                className="btn-pokemon-secondary"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-shadow-pokemon">ポケふた詳細</h1>
            </div>
          </div>
        </div>

        {/* Error State */}
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-600 mb-2">エラー</h2>
            <p className="text-gray-500 mb-4">{error}</p>
            <button
              onClick={() => router.push('/map')}
              className="btn-pokemon"
            >
              マップに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen safe-area-inset bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-pokemon-red via-pokemon-blue to-pokemon-yellow p-4 text-white sticky top-0 z-20">
        <div className="container-pokemon">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => router.back()}
              className="btn-pokemon-secondary"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-shadow-pokemon">ポケふた詳細</h1>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Main Info Card */}
        <div className="card-pokemon p-6">
          <h2 className="text-2xl font-bold text-pokemon-darkBlue mb-4">
            {manhole.name || manhole.title || 'ポケふた'}
          </h2>

          <div className="space-y-3">
            <div className="flex items-center text-gray-700">
              <MapPin className="w-5 h-5 mr-3 text-pokemon-blue" />
              <span>
                {manhole.prefecture} {manhole.city || manhole.municipality}
                {manhole.address && ` - ${manhole.address}`}
              </span>
            </div>

            {manhole.description && (
              <div className="text-gray-600 bg-gray-50 p-3 rounded-lg">
                {manhole.description}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center">
                <div className={`w-4 h-4 rounded-full mr-3 ${manhole.is_visited ? 'bg-pokemon-red' : 'bg-pokemon-blue'}`}></div>
                <span className="font-semibold text-gray-700">
                  {manhole.is_visited ? '訪問済み' : '未訪問'}
                </span>
              </div>

              {manhole.is_visited && manhole.last_visit && (
                <div className="flex items-center text-sm text-gray-500">
                  <Clock className="w-4 h-4 mr-1" />
                  <span>{new Date(manhole.last_visit).toLocaleDateString('ja-JP')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pokemon Info */}
        {manhole.pokemons && manhole.pokemons.length > 0 && (
          <div className="card-pokemon p-6">
            <h3 className="text-lg font-bold text-pokemon-darkBlue mb-4">登場ポケモン</h3>
            <div className="flex flex-wrap gap-2">
              {manhole.pokemons.map((pokemon, index) => (
                <span key={index} className="badge-pokemon">
                  {pokemon}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Map */}
        <div className="card-pokemon p-6">
          <h3 className="text-lg font-bold text-pokemon-darkBlue mb-4">地図</h3>
          <div className="h-64 rounded-lg overflow-hidden">
            <MapComponent
              center={{ lat: manhole.latitude, lng: manhole.longitude }}
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
            className="btn-pokemon flex items-center justify-center"
          >
            <Navigation className="w-5 h-5 mr-2" />
            経路案内
          </button>
          <button
            onClick={() => router.push('/camera')}
            className="btn-pokemon-secondary flex items-center justify-center"
          >
            <Camera className="w-5 h-5 mr-2" />
            写真を撮る
          </button>
        </div>

        {/* Additional Info */}
        <div className="card-pokemon p-6">
          <h3 className="text-lg font-bold text-pokemon-darkBlue mb-4">詳細情報</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">ID</span>
              <span className="font-mono">{manhole.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">緯度</span>
              <span className="font-mono">{manhole.latitude?.toFixed(6)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">経度</span>
              <span className="font-mono">{manhole.longitude?.toFixed(6)}</span>
            </div>
            {manhole.detail_url && (
              <div className="flex justify-between">
                <span className="text-gray-600">詳細URL</span>
                <a
                  href={manhole.detail_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pokemon-blue underline truncate max-w-40"
                >
                  公式情報
                </a>
              </div>
            )}
            {manhole.created_at && (
              <div className="flex justify-between">
                <span className="text-gray-600">作成日</span>
                <span>{new Date(manhole.created_at).toLocaleDateString('ja-JP')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}