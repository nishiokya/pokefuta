'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MapPin, Camera, Navigation, History } from 'lucide-react';
import { Manhole } from '@/types/database';
import BottomNav from '@/components/BottomNav';

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

export default function HomePage() {
  const [manholes, setManholes] = useState<Manhole[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ページタイトル設定
    document.title = 'マンホール一覧 - ポケふた訪問記録';

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
          // Default to Japan center
          setUserLocation({
            lat: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0'),
            lng: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0')
          });
        }
      );
    }

    // Load manhole data
    loadManholes();
  }, []);

  const loadManholes = async () => {
    try {
      const response = await fetch('/api/manholes');
      if (response.ok) {
        const data = await response.json();
        setManholes(data);
      }
    } catch (error) {
      console.error('Failed to load manholes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManholeClick = (manhole: Manhole) => {
    window.location.href = `/manhole/${manhole.id}`;
  };

  const centerOnUser = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('Failed to get location:', error);
        }
      );
    }
  };
  return (
    <div className="min-h-screen safe-area-inset pb-nav-safe bg-rpg-bgDark">
      {/* Map Container */}
      <div className="relative" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Location Button */}
        <button
          onClick={centerOnUser}
          className="absolute top-4 right-4 z-20 rpg-button p-3 shadow-rpg"
          title="現在地に移動"
        >
          <Navigation className="w-5 h-5" />
        </button>

        <div className="absolute inset-0">
          {userLocation && (
            <MapComponent
              center={userLocation}
              manholes={manholes}
              onManholeClick={handleManholeClick}
              userLocation={userLocation}
            />
          )}
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-rpg-bgDark/90 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="text-center">
              <div className="font-pixelJp text-rpg-textGold mb-4">
                読み込み中<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {/* Stats Overlay - RPG Style */}
        <div className="absolute top-4 left-4 z-10">
          <div className="rpg-window p-3">
            <div className="flex gap-4 text-sm">
              <div className="text-center">
                <div className="font-pixel text-lg text-rpg-yellow">{manholes.length}</div>
                <div className="font-pixelJp text-xs text-rpg-textDark">総数</div>
              </div>
              <div className="text-center">
                <div className="font-pixel text-lg text-rpg-red">
                  {manholes.filter(m => m.is_visited).length}
                </div>
                <div className="font-pixelJp text-xs text-rpg-textDark">訪問済</div>
              </div>
              <div className="text-center">
                <div className="font-pixel text-lg text-rpg-blue">
                  {manholes.filter(m => !m.is_visited).length}
                </div>
                <div className="font-pixelJp text-xs text-rpg-textDark">未訪問</div>
              </div>
            </div>
          </div>
        </div>

        {/* Camera Button - RPG Style */}
        <div className="absolute bottom-4 right-4 z-10">
          <button
            onClick={() => window.location.href = '/upload'}
            className="rpg-button rpg-button-primary p-4 shadow-rpg"
            title="写真を登録"
          >
            <Camera className="w-6 h-6" />
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}