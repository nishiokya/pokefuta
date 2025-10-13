'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MapPin, Camera, Navigation, History, Home } from 'lucide-react';
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

export default function MapPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitedManholes, setVisitedManholes] = useState<Manhole[]>([]);
  const [recentManholes, setRecentManholes] = useState<Manhole[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);

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
          if (data.authenticated === true) {
            console.log('User authenticated');
            setIsLoggedIn(true);
            setVisits(data.visits || []);

            const manholes = (data.visits || [])
              .map((visit: Visit) => visit.manhole)
              .filter((manhole: Manhole | undefined): manhole is Manhole => manhole !== undefined);
            setVisitedManholes(manholes);
          } else {
            console.log('User not authenticated - showing recent manholes');
            setIsLoggedIn(false);
            setVisits([]);
            setVisitedManholes([]);
            await loadRecentManholes();
          }
        }
      } else {
        console.log('API error - showing recent manholes');
        setIsLoggedIn(false);
        setVisits([]);
        setVisitedManholes([]);
        await loadRecentManholes();
      }
    } catch (error) {
      console.error('Failed to load visits:', error);
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
      const response = await fetch('/api/manholes?limit=100');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.manholes) {
          setRecentManholes(data.manholes);
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
        title={isLoggedIn ? "🗺️ 訪問マップ" : "🗺️ ポケふたマップ"}
        icon={<MapPin className="w-6 h-6" />}
      />

      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="font-pixelJp text-rpg-textGold">
                読み込み中<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rpg-window">
            <h2 className="rpg-window-title text-sm mb-4">
              {isLoggedIn ? '訪問マップ' : 'ポケふたマップ'}
            </h2>
            <div className="h-[70vh] border-2 border-rpg-border overflow-hidden">
              {userLocation && (
                <MapComponent
                  center={userLocation}
                  manholes={isLoggedIn ? visitedManholes : recentManholes}
                  onManholeClick={handleManholeClick}
                  userLocation={userLocation}
                />
              )}
            </div>
            <div className="mt-3 text-center">
              <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                {isLoggedIn
                  ? `${visitedManholes.length}件の訪問済みポケふたを表示中`
                  : `${recentManholes.length}件のポケふたを表示中`
                }
              </p>
            </div>
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
          <Link href="/map" className="nav-rpg-item active">
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
