
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, ArrowLeft, Camera, Navigation, Clock, History } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Manhole } from '@/types/database';

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

        {/* Map */}
        <div className="rpg-window">
          <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-3">地図</h3>
          <div className="h-64 border-2 border-rpg-border overflow-hidden">
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
    </div>
  );
}