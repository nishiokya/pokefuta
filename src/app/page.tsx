'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MapPin, Camera, Navigation, History } from 'lucide-react';
import { Manhole } from '@/types/database';
import Header from '@/components/Header';

const MapComponent = dynamic(
  () => import('@/components/Map/MapComponent'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-rpg-bgDark">
        <div className="text-center">
          <div className="font-pixelJp text-rpg-textGold">
            読み込み中<span className="rpg-loading"></span>
          </div>
        </div>
      </div>
    )
  }
);

interface Visit {
  id: string;
  manhole_id: number;
  manhole?: Manhole;
  shot_at: string;
  photos: {
    id: string;
    storage_key: string;
  }[];
}

export default function HomePage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitedManholes, setVisitedManholes] = useState<Manhole[]>([]);
  const [recentManholes, setRecentManholes] = useState<Manhole[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalManholes, setTotalManholes] = useState(0);
  const [manholesWithPhotos, setManholesWithPhotos] = useState(0);

  useEffect(() => {
    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn('Location access denied:', error);
          setUserLocation({
            lat: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0'),
            lng: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0')
          });
        }
      );
    }

    loadVisits();
  }, []);

  const loadVisits = async () => {
    try {
      const response = await fetch('/api/visits');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // authenticatedフラグで明確に判定
          if (data.authenticated === true) {
            // ログイン済み
            console.log('User authenticated');
            setIsLoggedIn(true);
            setVisits(data.visits || []);

            // Extract visited manholes
            const manholes = (data.visits || [])
              .map((visit: Visit) => visit.manhole)
              .filter((manhole: Manhole | undefined): manhole is Manhole => manhole !== undefined);
            setVisitedManholes(manholes);
          } else {
            // 未ログイン - 最近のマンホールを表示
            console.log('User not authenticated - showing recent manholes');
            setIsLoggedIn(false);
            setVisits([]);
            setVisitedManholes([]);
            await loadRecentManholes();
          }
        }
      } else {
        // APIエラー - 最近のマンホールを表示
        console.log('API error - showing recent manholes');
        setIsLoggedIn(false);
        setVisits([]);
        setVisitedManholes([]);
        await loadRecentManholes();
      }
    } catch (error) {
      console.error('Failed to load visits:', error);
      // エラーの場合も最近のマンホールを表示
      setIsLoggedIn(false);
      setVisits([]);
      setVisitedManholes([]);
      await loadRecentManholes();
    } finally {
      setLoading(false);
    }
  };

  const loadRecentManholes = async () => {
    try {
      const response = await fetch('/api/manholes?limit=20');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.manholes) {
          setRecentManholes(data.manholes.slice(0, 10)); // 最新10件のみ表示
        }
        // 統計情報を取得
        if (data.total) {
          setTotalManholes(data.total);
        }
        if (data.with_photos) {
          setManholesWithPhotos(data.with_photos);
        }
      }
    } catch (error) {
      console.error('Failed to load recent manholes:', error);
    }
  };

  const handleManholeClick = (manhole: Manhole) => {
    window.location.href = `/manhole/${manhole.id}`;
  };

  return (
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark pb-20">
      <Header
        title={isLoggedIn ? "🏆 マイコレクション" : "🔍 ポケふた一覧"}
        icon={<MapPin className="w-6 h-6" />}
      />

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="font-pixelJp text-rpg-textGold">
                読み込み中<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <>
            {/* Stats & Welcome Message */}
            {isLoggedIn ? (
              <div className="rpg-window">
                <div className="flex gap-4 text-sm">
                  <div className="text-center flex-1">
                    <div className="font-pixel text-2xl text-rpg-yellow">{visitedManholes.length}</div>
                    <div className="font-pixelJp text-xs text-rpg-textDark">訪問済</div>
                  </div>
                  <div className="text-center flex-1">
                    <div className="font-pixel text-2xl text-rpg-blue">{visits.length}</div>
                    <div className="font-pixelJp text-xs text-rpg-textDark">記録</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rpg-window">
                <div className="text-center mb-4">
                  <h2 className="font-pixelJp text-lg text-rpg-textDark mb-3">
                    📸 ポケモンマンホール写真館
                  </h2>
                  <p className="font-pixelJp text-sm text-rpg-textDark leading-relaxed mb-4">
                    全国各地に設置されているポケモンマンホール「ポケふた」の写真を集めています。
                    あなたも見つけたポケふたの写真を登録して、みんなとシェアしませんか？
                  </p>
                </div>

                {/* 統計情報 */}
                <div className="flex gap-4 mb-4">
                  <div className="flex-1 text-center">
                    <div className="font-pixel text-3xl text-rpg-yellow">{totalManholes}</div>
                    <div className="font-pixelJp text-xs text-rpg-textDark">全マンホール</div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="font-pixel text-3xl text-rpg-blue">{manholesWithPhotos}</div>
                    <div className="font-pixelJp text-xs text-rpg-textDark">写真あり</div>
                  </div>
                </div>

                {/* CTA */}
                <div className="text-center">
                  <Link href="/login" className="rpg-button rpg-button-primary inline-block">
                    <span className="font-pixelJp">ログインして写真を登録</span>
                  </Link>
                  <p className="font-pixelJp text-xs text-rpg-textDark opacity-70 mt-3">
                    登録は無料です。訪問記録も管理できます！
                  </p>
                </div>
              </div>
            )}

            {/* Manholes Grid - 訪問済みまたは最近のマンホール */}
            {(isLoggedIn ? visitedManholes : recentManholes).length > 0 ? (
              <>
                <div className="rpg-window">
                  <h2 className="rpg-window-title text-sm mb-4">
                    {isLoggedIn ? '訪問したポケふた' : '最近のポケふた'}
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    {(isLoggedIn ? visitedManholes : recentManholes).map((manhole) => (
                      <div
                        key={manhole.id}
                        onClick={() => handleManholeClick(manhole)}
                        className="rpg-window p-3 cursor-pointer hover:bg-rpg-bgLight transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 bg-rpg-yellow border-2 border-rpg-border flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-5 h-5 text-rpg-textDark" />
                          </div>
                          <h3 className="font-pixelJp text-xs text-rpg-textDark font-bold line-clamp-2">
                            ID: {manhole.id}
                          </h3>
                        </div>
                        <div className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                          {manhole.municipality || manhole.prefecture}
                        </div>
                        {manhole.pokemons && manhole.pokemons.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {manhole.pokemons.slice(0, 2).map((pokemon, index) => (
                              <span
                                key={index}
                                className="bg-rpg-yellow px-1 py-0.5 border border-rpg-border font-pixelJp text-[10px] text-rpg-textDark"
                              >
                                {pokemon}
                              </span>
                            ))}
                            {manhole.pokemons.length > 2 && (
                              <span className="font-pixelJp text-[10px] text-rpg-textDark opacity-70">
                                +{manhole.pokemons.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Map */}
                <div className="rpg-window">
                  <h2 className="rpg-window-title text-sm mb-4">
                    {isLoggedIn ? '訪問マップ' : 'ポケふたマップ'}
                  </h2>
                  <div className="h-96 border-2 border-rpg-border overflow-hidden">
                    {userLocation && (
                      <MapComponent
                        center={userLocation}
                        manholes={isLoggedIn ? visitedManholes : recentManholes}
                        onManholeClick={handleManholeClick}
                        userLocation={userLocation}
                      />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rpg-window text-center py-12">
                <MapPin className="w-16 h-16 text-rpg-textDark opacity-50 mx-auto mb-4" />
                <h2 className="font-pixelJp text-lg text-rpg-textDark mb-2">
                  {isLoggedIn ? 'まだ訪問記録がありません' : 'ポケふたが見つかりません'}
                </h2>
                <p className="font-pixelJp text-sm text-rpg-textDark opacity-70 mb-6">
                  {isLoggedIn
                    ? 'ポケふたを見つけて写真を登録しよう!'
                    : 'ログインして訪問記録を登録しましょう'}
                </p>
                <button
                  onClick={() => window.location.href = isLoggedIn ? '/upload' : '/login'}
                  className="rpg-button rpg-button-primary"
                >
                  <span className="font-pixelJp">{isLoggedIn ? '写真を登録' : 'ログイン'}</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Navigation - RPG Style */}
      <nav className="nav-rpg">
        <div className="flex justify-around items-center max-w-md mx-auto py-2">
          <Link href="/" className="nav-rpg-item active">
            <MapPin className="w-6 h-6 mb-1" />
            <span>ホーム</span>
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