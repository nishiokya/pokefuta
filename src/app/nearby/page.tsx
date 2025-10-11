'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, Camera, Route, Map, History } from 'lucide-react';
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
}

export default function NearbyPage() {
  const [nearbyManholes, setNearbyManholes] = useState<ManholeWithDistance[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
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
      // Fetch nearby manholes
      const manholesResponse = await fetch(`/api/manholes?lat=${lat}&lng=${lng}&radius=${radius}&limit=100`);

      if (!manholesResponse.ok) {
        console.error('Failed to load nearby manholes');
        setLoading(false);
        return;
      }

      const allNearbyManholes = await manholesResponse.json();

      // Fetch visits to determine which manholes have been visited
      const visitsResponse = await fetch('/api/visits');
      let visitedManholeIds = new Set<number>();

      if (visitsResponse.ok) {
        const visitsData = await visitsResponse.json();
        if (visitsData.success && visitsData.visits) {
          // Collect all visited manhole IDs
          visitedManholeIds = new Set(
            visitsData.visits
              .map((visit: any) => visit.manhole_id)
              .filter((id: any) => id !== null)
          );
        }
      }

      // Filter out visited manholes and limit to 20
      const unvisitedManholes = allNearbyManholes
        .filter((manhole: ManholeWithDistance) => !visitedManholeIds.has(manhole.id))
        .slice(0, 20);

      setNearbyManholes(unvisitedManholes);
    } catch (error) {
      console.error('Failed to load nearby manholes:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDistance = (distance: number): string => {
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  };

  const openInMaps = (manhole: ManholeWithDistance) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${manhole.latitude},${manhole.longitude}`;
    window.open(url, '_blank');
  };

  const viewOnMap = (manhole: ManholeWithDistance) => {
    window.location.href = `/?center=${manhole.latitude},${manhole.longitude}&zoom=15`;
  };

  return (
    <div className="min-h-screen safe-area-inset bg-rpg-bgDark">
      <Header title="📍 近くのダンジョン" icon={<Navigation className="w-6 h-6" />} />

      {/* Controls */}
      <div className="p-4 max-w-2xl mx-auto">
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

        <div className="rpg-window mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="font-pixelJp text-sm text-rpg-textDark">検索範囲</label>
            <span className="font-pixel text-rpg-yellow">{radius}km</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full h-2 bg-rpg-bgDark border-2 border-rpg-border appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #F1C40F 0%, #F1C40F ${radius}%, #2C3E50 ${radius}%, #2C3E50 100%)`
            }}
          />
          <div className="flex justify-between font-pixelJp text-xs text-rpg-textDark opacity-70 mt-1">
            <span>1km</span>
            <span>100km</span>
          </div>
        </div>

        {locationError && (
          <div className="rpg-window mb-4 bg-rpg-red/20 border-rpg-red">
            <p className="font-pixelJp text-sm text-rpg-red">{locationError}</p>
          </div>
        )}

        {userLocation && (
          <div className="rpg-window mb-4">
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
                <Map className="w-4 h-4" />
                <span className="font-pixelJp">{showMap ? 'リスト表示' : 'マップ表示'}</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="font-pixelJp text-rpg-textGold">
              検索中<span className="rpg-loading"></span>
            </div>
          </div>
        </div>
      )}

      {/* Map View */}
      {!loading && showMap && userLocation && (
        <div className="px-4 mb-4 max-w-2xl mx-auto">
          <div className="rpg-window p-2">
            <div style={{ height: '400px' }}>
              <MapComponent
                center={userLocation}
                manholes={nearbyManholes}
                onManholeClick={(manhole) => {
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
        <div className="px-4 pb-20 max-w-2xl mx-auto">
          {nearbyManholes.length === 0 ? (
            <div className="text-center py-12">
              <div className="rpg-window">
                <MapPin className="w-12 h-12 text-rpg-textDark opacity-50 mx-auto mb-4" />
                <p className="font-pixelJp text-sm text-rpg-textDark mb-2">
                  近くに未訪問のポケふたが見つかりませんでした
                </p>
                <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                  検索範囲を広げてみてください
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {nearbyManholes.map((manhole) => (
                <div key={manhole.id} className="rpg-window">
                  <div className="flex justify-between items-start mb-3 pb-3 border-b-2 border-rpg-border">
                    <div className="flex-1">
                      <h3 className="font-pixelJp text-sm font-bold text-rpg-textDark mb-2">
                        {manhole.name || 'ポケふた'}
                      </h3>
                      <div className="flex items-center font-pixelJp text-xs text-rpg-textDark opacity-70 mb-2">
                        <MapPin className="w-3 h-3 mr-1" />
                        <span>{manhole.prefecture} {manhole.city}</span>
                      </div>
                      {manhole.description && (
                        <p className="font-pixelJp text-xs text-rpg-textDark mb-2 line-clamp-2">
                          {manhole.description}
                        </p>
                      )}
                      {manhole.pokemons && manhole.pokemons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
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
                    <div className="text-right ml-4">
                      <div className="font-pixel text-lg text-rpg-blue">
                        {formatDistance(manhole.distance)}
                      </div>
                      <div className="font-pixelJp text-xs text-rpg-textDark opacity-70">距離</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => viewOnMap(manhole)}
                      className="flex-1 rpg-button text-xs flex items-center justify-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      <span className="font-pixelJp">マップ</span>
                    </button>
                    <button
                      onClick={() => openInMaps(manhole)}
                      className="flex-1 rpg-button rpg-button-success text-xs flex items-center justify-center gap-1"
                    >
                      <Route className="w-3 h-3" />
                      <span className="font-pixelJp">経路</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Navigation - RPG Style */}
      <nav className="nav-rpg">
        <div className="flex justify-around items-center max-w-md mx-auto py-2">
          <Link href="/" className="nav-rpg-item">
            <MapPin className="w-6 h-6 mb-1" />
            <span>マップ</span>
          </Link>
          <Link href="/nearby" className="nav-rpg-item active">
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