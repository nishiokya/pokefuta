'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, Camera, Clock, Route, Map } from 'lucide-react';
import { Manhole } from '@/types/database';

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
  const [radius, setRadius] = useState(10); // Default 10km
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
      const response = await fetch(`/api/manholes?lat=${lat}&lng=${lng}&radius=${radius}&limit=20&visited=false`);
      if (response.ok) {
        const data = await response.json();
        setNearbyManholes(data);
      } else {
        console.error('Failed to load nearby manholes');
      }
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
    window.location.href = `/map?center=${manhole.latitude},${manhole.longitude}&zoom=15`;
  };

  return (
    <div className="min-h-screen safe-area-inset bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-pokemon-red via-pokemon-blue to-pokemon-yellow p-4 text-white">
        <div className="container-pokemon">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Navigation className="w-6 h-6" />
              <h1 className="text-xl font-bold text-shadow-pokemon">近くの未訪問ポケふた</h1>
            </div>
            <button
              onClick={getCurrentLocationAndLoadManholes}
              className="btn-pokemon-secondary"
              title="現在地を更新"
            >
              <MapPin className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4">
        <div className="card-pokemon p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-pokemon-darkBlue">検索範囲</label>
            <span className="text-pokemon-blue font-bold">{radius}km</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1km</span>
            <span>100km</span>
          </div>
        </div>

        {locationError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {locationError}
          </div>
        )}

        {userLocation && (
          <div className="card-pokemon p-3 mb-4">
            <div className="flex items-center justify-between text-sm mb-3">
              <div className="text-center">
                <div className="font-bold text-pokemon-darkBlue">{nearbyManholes.length}</div>
                <div className="text-gray-600">見つかった</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-pokemon-blue">{radius}km</div>
                <div className="text-gray-600">範囲内</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-pokemon-red">
                  {nearbyManholes.length > 0 ? formatDistance(nearbyManholes[0].distance) : '-'}
                </div>
                <div className="text-gray-600">最寄り</div>
              </div>
            </div>
            <button
              onClick={() => setShowMap(!showMap)}
              className={`w-full btn-pokemon-secondary text-sm py-2 flex items-center justify-center ${
                showMap ? 'bg-pokemon-yellow text-pokemon-darkBlue' : ''
              }`}
            >
              <Map className="w-4 h-4 mr-2" />
              {showMap ? 'リストを表示' : 'マップを表示'}
            </button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="loading-pokemon mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-pokemon-red to-pokemon-blue loading-spin mx-auto"></div>
            </div>
            <p className="text-pokemon-darkBlue font-semibold">近くのポケふたを検索中...</p>
          </div>
        </div>
      )}

      {/* Map View */}
      {!loading && showMap && userLocation && (
        <div className="px-4 mb-4">
          <div className="card-pokemon p-2">
            <div style={{ height: '400px' }}>
              <MapComponent
                center={userLocation}
                manholes={nearbyManholes}
                onManholeClick={(manhole) => {
                  // Show details in list view
                  setShowMap(false);
                  // Scroll to manhole in list (could be enhanced)
                }}
                userLocation={userLocation}
              />
            </div>
          </div>
        </div>
      )}

      {/* Manholes List */}
      {!loading && !showMap && (
        <div className="px-4 pb-20">
          {nearbyManholes.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">近くに未訪問のポケふたが見つかりませんでした</p>
              <p className="text-sm text-gray-500">検索範囲を広げてみてください</p>
            </div>
          ) : (
            <div className="space-y-4">
              {nearbyManholes.map((manhole) => (
                <div key={manhole.id} className="card-pokemon p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-pokemon-darkBlue mb-1">
                        {manhole.name || 'ポケふた'}
                      </h3>
                      <div className="flex items-center text-sm text-gray-600 mb-2">
                        <MapPin className="w-4 h-4 mr-1" />
                        <span>{manhole.prefecture} {manhole.city}</span>
                      </div>
                      {manhole.description && (
                        <p className="text-sm text-gray-700 mb-2">{manhole.description}</p>
                      )}
                      {manhole.pokemons && manhole.pokemons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {manhole.pokemons.map((pokemon, index) => (
                            <span key={index} className="badge-pokemon text-xs">
                              {pokemon}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <div className="font-bold text-pokemon-blue text-lg">
                        {formatDistance(manhole.distance)}
                      </div>
                      <div className="text-xs text-gray-500">距離</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => viewOnMap(manhole)}
                      className="flex-1 btn-pokemon-secondary text-sm py-2 flex items-center justify-center"
                    >
                      <MapPin className="w-4 h-4 mr-1" />
                      マップで見る
                    </button>
                    <button
                      onClick={() => openInMaps(manhole)}
                      className="flex-1 btn-pokemon text-sm py-2 flex items-center justify-center"
                    >
                      <Route className="w-4 h-4 mr-1" />
                      経路案内
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Camera Button */}
      <div className="fixed bottom-20 right-4 z-10">
        <button
          onClick={() => window.location.href = '/upload'}
          className="w-16 h-16 btn-pokemon rounded-full flex items-center justify-center shadow-pokemon-hover"
          title="写真をアップロード"
        >
          <Camera className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
}