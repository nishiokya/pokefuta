'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, Camera, ExternalLink, Map as MapIcon, History, Home } from 'lucide-react';
import { Manhole } from '@/types/database';
import Header from '@/components/Header';

const MapComponent = dynamic(
  () => import('@/components/Map/MapComponent'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 flex items-center justify-center bg-gray-100 rounded-lg">
        <div className="loading-pokemon">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pokemon-red to-pokemon-blue loading-spin"></div>
        </div>
      </div>
    )
  }
);

interface ManholeWithDistance extends Manhole {
  distance: number;
  visit?: {
    id: string;
    shot_at: string;
    photos: Array<{
      id: string;
      storage_key: string;
      url?: string;
    }>;
  };
}

export default function NearbyPage() {
  const [nearbyManholes, setNearbyManholes] = useState<ManholeWithDistance[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [radius, setRadius] = useState(30); // Default 30km
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    getCurrentLocationAndLoadManholes();
  }, [radius]);

  const getCurrentLocationAndLoadManholes = () => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          setLocationError(null);
          loadNearbyManholes(location.lat, location.lng);
        },
        (error) => {
          console.error('Location access denied:', error);
          setLocationError('位置情報の取得に失敗しました。設定で位置情報の使用を許可してください。');
          // Use default location (Japan center) for demo
          const defaultLocation = {
            lat: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0'),
            lng: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0')
          };
          setUserLocation(defaultLocation);
          loadNearbyManholes(defaultLocation.lat, defaultLocation.lng);
        }
      );
    } else {
      setLocationError('このブラウザは位置情報をサポートしていません。');
      setLoading(false);
    }
  };

  const loadNearbyManholes = async (lat: number, lng: number) => {
    try {
      setDataError(null);
      console.log(`Loading manholes near ${lat}, ${lng} with radius ${radius}km`);

      // Fetch nearby manholes
      const manholesResponse = await fetch(`/api/manholes?lat=${lat}&lng=${lng}&radius=${radius}&limit=100`);

      if (!manholesResponse.ok) {
        const errorText = await manholesResponse.text();
        console.error('Failed to load nearby manholes:', errorText);
        setDataError(`マンホールデータの取得に失敗しました: ${manholesResponse.status}`);
        setLoading(false);
        return;
      }

      const manholesData = await manholesResponse.json();
      console.log('Manholes response:', manholesData);

      // Handle new API format
      const allNearbyManholes = manholesData.manholes || [];
      console.log(`Loaded ${allNearbyManholes.length} nearby manholes`);

      if (!Array.isArray(allNearbyManholes)) {
        console.error('Invalid response format:', manholesData);
        setDataError('マンホールデータの形式が不正です');
        setLoading(false);
        return;
      }

      // Fetch visits to get visit information
      const visitsResponse = await fetch('/api/visits');
      const visitsByManholeId = new Map<number, any>();

      if (visitsResponse.ok) {
        const visitsData = await visitsResponse.json();
        console.log('Visits data:', visitsData);
        if (visitsData.success && visitsData.visits) {
          // Create map of manhole_id -> latest visit
          visitsData.visits.forEach((visit: any) => {
            if (visit.manhole_id) {
              // Keep only the latest visit for each manhole
              const existing = visitsByManholeId.get(visit.manhole_id);
              if (!existing || new Date(visit.shot_at) > new Date(existing.shot_at)) {
                visitsByManholeId.set(visit.manhole_id, visit);
              }
            }
          });
          console.log(`Found ${visitsByManholeId.size} visited manholes`);
        }
      }

      // Add visit information to manholes and limit to 50
      const manholesWithVisits = allNearbyManholes
        .map((manhole: any) => ({
          ...manhole,
          visit: visitsByManholeId.get(manhole.id)
        }))
        .slice(0, 50);

      console.log(`Setting ${manholesWithVisits.length} manholes with visit info`);
      setNearbyManholes(manholesWithVisits);
    } catch (error) {
      console.error('Failed to load nearby manholes:', error);
      setDataError(`データの読み込みに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setLoading(false);
    }
  };

  const formatDistance = (distance: number | undefined): string => {
    if (distance === undefined || isNaN(distance)) {
      return '-';
    }
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  const openInMaps = (manhole: ManholeWithDistance, event: React.MouseEvent) => {
    event.stopPropagation(); // 親要素のクリックイベントを防ぐ
    const url = `https://www.google.com/maps/dir/?api=1&destination=${manhole.latitude},${manhole.longitude}`;
    window.open(url, '_blank');
  };

  const viewManholeDetail = (manhole: ManholeWithDistance) => {
    window.location.href = `/manhole/${manhole.id}`;
  };

  return (
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark pb-20">
      <Header title="📍 近くのポケふた" icon={<Navigation className="w-6 h-6" />} />

      {/* Controls */}
      <div className="p-2 max-w-2xl mx-auto">
        <div className="flex justify-end mb-2">
          <button
            onClick={getCurrentLocationAndLoadManholes}
            className="rpg-button text-xs py-2 px-3 flex items-center gap-2"
            title="現在地を更新"
          >
            <MapPin className="w-4 h-4" />
            現在地更新
          </button>
        </div>

        <div className="rpg-window mb-2">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-rpg-textDark">検索範囲</label>
            <span className="font-bold text-rpg-yellow">{radius}km</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full h-2 bg-rpg-bgDark border-2 border-rpg-border appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #F1C40F 0%, #F1C40F ${radius}%, #E0E0E0 ${radius}%, #E0E0E0 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1km</span>
            <span>100km</span>
          </div>
        </div>

        {locationError && (
          <div className="rpg-window mb-2 bg-red-50 border-red-300">
            <p className="text-sm text-red-600">{locationError}</p>
          </div>
        )}

        {dataError && (
          <div className="rpg-window mb-2 bg-red-50 border-red-300">
            <p className="text-sm text-red-600">{dataError}</p>
          </div>
        )}

        {userLocation && (
          <div className="rpg-window mb-2">
            <div className="rpg-status mb-3">
              <div className="rpg-stat-item">
                <div className="rpg-stat-value">{nearbyManholes.length}</div>
                <div className="rpg-stat-label">発見</div>
              </div>
              <div className="rpg-stat-item">
                <div className="rpg-stat-value">{radius}</div>
                <div className="rpg-stat-label">範囲km</div>
              </div>
              <div className="rpg-stat-item">
                <div className="rpg-stat-value">
                  {nearbyManholes.length > 0 ? formatDistance(nearbyManholes[0].distance) : '-'}
                </div>
                <div className="rpg-stat-label">最寄り</div>
              </div>
            </div>
            <button
              onClick={() => setShowMap(!showMap)}
              className={`w-full rpg-button text-sm ${showMap ? 'rpg-button-primary' : ''}`}
            >
              <div className="flex items-center justify-center gap-2">
                <MapIcon className="w-4 h-4" />
                <span>{showMap ? 'リスト表示' : 'マップ表示'}</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="font-pixelJp text-rpg-textGold">
              検索中<span className="rpg-loading"></span>
            </div>
          </div>
        </div>
      )}

      {/* Map View */}
      {!loading && showMap && userLocation && (
        <div className="px-2 mb-2 max-w-2xl mx-auto">
          <div className="rpg-window p-2">
            <div style={{ height: '400px' }}>
              <MapComponent
                center={userLocation}
                manholes={nearbyManholes}
                onManholeClick={() => {
                  setShowMap(false);
                }}
                userLocation={userLocation}
              />
            </div>
          </div>
        </div>
      )}

      {/* Manholes List */}
      {!loading && !showMap && (
        <div className="px-2 pb-16 max-w-2xl mx-auto">
          {nearbyManholes.length === 0 ? (
            <div className="text-center py-8">
              <div className="rpg-window">
                <MapPin className="w-10 h-10 text-rpg-textDark opacity-50 mx-auto mb-3" />
                <p className="font-pixelJp text-sm text-rpg-textDark mb-1">
                  近くにポケふたが見つかりませんでした
                </p>
                <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                  検索範囲を広げてみてください
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {nearbyManholes.map((manhole) => (
                <div
                  key={manhole.id}
                  className={`rpg-window cursor-pointer hover:bg-rpg-bgLight transition-colors ${manhole.visit ? 'border-rpg-green' : ''}`}
                  onClick={() => viewManholeDetail(manhole)}
                >
                  {/* Header with location and distance */}
                  <div className="flex justify-between items-start mb-3 pb-2 border-b-2 border-rpg-border">
                    <div className="flex-1">
                      <h3 className="font-pixelJp text-sm text-rpg-textDark font-bold mb-1">
                        {manhole.prefecture}{manhole.municipality || manhole.city || ''}({manhole.id})
                      </h3>
                      {manhole.visit && (
                        <div className="flex items-center gap-1 text-xs text-rpg-green">
                          <Camera className="w-3 h-3" />
                          <span className="font-pixelJp">訪問済み</span>
                          <span className="font-pixelJp opacity-70">
                            {formatDate(manhole.visit.shot_at)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-pixel text-base text-rpg-blue">
                          {manhole.distance !== undefined ? formatDistance(manhole.distance) : '-'}
                        </div>
                      </div>
                      <button
                        onClick={(e) => openInMaps(manhole, e)}
                        className="rpg-button p-2 hover:bg-rpg-yellow transition-colors"
                        title="Google Mapsで経路を表示"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 訪問済みの場合、写真を表示 */}
                  {manhole.visit && manhole.visit.photos && manhole.visit.photos.length > 0 && (
                    <div className="mb-3">
                      <div className="grid grid-cols-3 gap-2">
                        {manhole.visit.photos.slice(0, 3).map((photo: any) => (
                          <div
                            key={photo.id}
                            className="relative aspect-square bg-rpg-bgDark border-2 border-rpg-border overflow-hidden"
                          >
                            <img
                              src={photo.url || `/api/image-upload?key=${photo.storage_key}`}
                              alt="ポケふた写真"
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ))}
                      </div>
                      {manhole.visit.photos.length > 3 && (
                        <p className="font-pixelJp text-xs text-rpg-textDark opacity-70 mt-1 text-center">
                          +{manhole.visit.photos.length - 3} 枚
                        </p>
                      )}
                    </div>
                  )}

                  {/* Pokemon tags */}
                  {manhole.pokemons && manhole.pokemons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {manhole.pokemons.slice(0, 3).map((pokemon, index) => (
                        <span
                          key={index}
                          className="bg-rpg-yellow px-2 py-1 border-2 border-rpg-border font-pixelJp text-xs text-rpg-textDark"
                        >
                          {pokemon}
                        </span>
                      ))}
                      {manhole.pokemons.length > 3 && (
                        <span className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                          +{manhole.pokemons.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Navigation - RPG Style */}
      <nav className="nav-rpg">
        <div className="flex justify-around items-center max-w-md mx-auto py-1">
          <Link href="/" className="nav-rpg-item">
            <Home className="w-5 h-5 mb-0.5" />
            <span>ホーム</span>
          </Link>
          <Link href="/map" className="nav-rpg-item">
            <MapPin className="w-5 h-5 mb-0.5" />
            <span>マップ</span>
          </Link>
          <Link href="/nearby" className="nav-rpg-item active">
            <Navigation className="w-5 h-5 mb-0.5" />
            <span>近く</span>
          </Link>
          <Link href="/upload" className="nav-rpg-item">
            <Camera className="w-5 h-5 mb-0.5" />
            <span>登録</span>
          </Link>
          <Link href="/visits" className="nav-rpg-item">
            <History className="w-5 h-5 mb-0.5" />
            <span>履歴</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}