'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MapPin, Camera, Navigation, History, Home } from 'lucide-react';
import { Manhole } from '@/types/database';
import Header from '@/components/Header';

// 都道府県マスターデータ（都道府県コード、名称、中心座標）
const PREFECTURES = [
  { code: '01', name: '北海道', lat: 43.0642, lng: 141.3469, zoom: 7 },
  { code: '02', name: '青森県', lat: 40.8244, lng: 140.7400, zoom: 8 },
  { code: '03', name: '岩手県', lat: 39.7036, lng: 141.1527, zoom: 8 },
  { code: '04', name: '宮城県', lat: 38.2682, lng: 140.8719, zoom: 9 },
  { code: '05', name: '秋田県', lat: 39.7186, lng: 140.1024, zoom: 8 },
  { code: '06', name: '山形県', lat: 38.2404, lng: 140.3633, zoom: 9 },
  { code: '07', name: '福島県', lat: 37.7503, lng: 140.4676, zoom: 8 },
  { code: '08', name: '茨城県', lat: 36.3418, lng: 140.4468, zoom: 9 },
  { code: '09', name: '栃木県', lat: 36.5658, lng: 139.8836, zoom: 9 },
  { code: '10', name: '群馬県', lat: 36.3910, lng: 139.0605, zoom: 9 },
  { code: '11', name: '埼玉県', lat: 35.8569, lng: 139.6489, zoom: 10 },
  { code: '12', name: '千葉県', lat: 35.6051, lng: 140.1233, zoom: 9 },
  { code: '13', name: '東京都', lat: 35.6895, lng: 139.6917, zoom: 10 },
  { code: '14', name: '神奈川県', lat: 35.4478, lng: 139.6425, zoom: 10 },
  { code: '15', name: '新潟県', lat: 37.9022, lng: 139.0232, zoom: 8 },
  { code: '16', name: '富山県', lat: 36.6953, lng: 137.2113, zoom: 9 },
  { code: '17', name: '石川県', lat: 36.5946, lng: 136.6256, zoom: 9 },
  { code: '18', name: '福井県', lat: 36.0652, lng: 136.2216, zoom: 9 },
  { code: '19', name: '山梨県', lat: 35.6642, lng: 138.5684, zoom: 9 },
  { code: '20', name: '長野県', lat: 36.6513, lng: 138.1810, zoom: 8 },
  { code: '21', name: '岐阜県', lat: 35.3912, lng: 136.7223, zoom: 9 },
  { code: '22', name: '静岡県', lat: 34.9769, lng: 138.3831, zoom: 9 },
  { code: '23', name: '愛知県', lat: 35.1802, lng: 136.9066, zoom: 9 },
  { code: '24', name: '三重県', lat: 34.7303, lng: 136.5086, zoom: 9 },
  { code: '25', name: '滋賀県', lat: 35.0045, lng: 135.8686, zoom: 9 },
  { code: '26', name: '京都府', lat: 35.0211, lng: 135.7556, zoom: 9 },
  { code: '27', name: '大阪府', lat: 34.6863, lng: 135.5200, zoom: 10 },
  { code: '28', name: '兵庫県', lat: 34.6913, lng: 135.1830, zoom: 9 },
  { code: '29', name: '奈良県', lat: 34.6851, lng: 135.8050, zoom: 9 },
  { code: '30', name: '和歌山県', lat: 34.2261, lng: 135.1675, zoom: 9 },
  { code: '31', name: '鳥取県', lat: 35.5036, lng: 134.2383, zoom: 9 },
  { code: '32', name: '島根県', lat: 35.4723, lng: 133.0505, zoom: 9 },
  { code: '33', name: '岡山県', lat: 34.6617, lng: 133.9350, zoom: 9 },
  { code: '34', name: '広島県', lat: 34.3965, lng: 132.4596, zoom: 9 },
  { code: '35', name: '山口県', lat: 34.1861, lng: 131.4714, zoom: 9 },
  { code: '36', name: '徳島県', lat: 34.0658, lng: 134.5595, zoom: 9 },
  { code: '37', name: '香川県', lat: 34.3401, lng: 134.0434, zoom: 10 },
  { code: '38', name: '愛媛県', lat: 33.8416, lng: 132.7657, zoom: 9 },
  { code: '39', name: '高知県', lat: 33.5597, lng: 133.5311, zoom: 9 },
  { code: '40', name: '福岡県', lat: 33.6064, lng: 130.4181, zoom: 9 },
  { code: '41', name: '佐賀県', lat: 33.2494, lng: 130.2988, zoom: 9 },
  { code: '42', name: '長崎県', lat: 32.7503, lng: 129.8777, zoom: 9 },
  { code: '43', name: '熊本県', lat: 32.7898, lng: 130.7417, zoom: 9 },
  { code: '44', name: '大分県', lat: 33.2382, lng: 131.6126, zoom: 9 },
  { code: '45', name: '宮崎県', lat: 31.9111, lng: 131.4239, zoom: 9 },
  { code: '46', name: '鹿児島県', lat: 31.5602, lng: 130.5581, zoom: 8 },
  { code: '47', name: '沖縄県', lat: 26.2124, lng: 127.6809, zoom: 9 },
];

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

interface PrefectureCount {
  code: string;
  name: string;
  count: number;
  lat: number;
  lng: number;
  zoom: number;
}

export default function MapPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitedManholes, setVisitedManholes] = useState<Manhole[]>([]);
  const [recentManholes, setRecentManholes] = useState<Manhole[]>([]);
  const [allManholes, setAllManholes] = useState<Manhole[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(6);
  const [loading, setLoading] = useState(true);
  const [prefectureCounts, setPrefectureCounts] = useState<PrefectureCount[]>([]);

  useEffect(() => {
    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          setMapCenter(location);
        },
        (error) => {
          console.warn('Location access denied:', error);
          const defaultLocation = {
            lat: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0'),
            lng: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0')
          };
          setUserLocation(defaultLocation);
          setMapCenter(defaultLocation);
        }
      );
    }

    loadVisits();
  }, []);

  // マンホールデータが変更されたら都道府県ごとの集計を更新
  useEffect(() => {
    if (allManholes.length > 0) {
      calculatePrefectureCounts();
    }
  }, [allManholes]);

  const loadVisits = async () => {
    try {
      // 全マンホールデータを先に読み込む
      await loadRecentManholes();

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
          }
        }
      } else {
        console.log('API error - showing recent manholes');
        setIsLoggedIn(false);
        setVisits([]);
        setVisitedManholes([]);
      }
    } catch (error) {
      console.error('Failed to load visits:', error);
      setIsLoggedIn(false);
      setVisits([]);
      setVisitedManholes([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentManholes = async () => {
    try {
      const response = await fetch('/api/manholes');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.manholes) {
          setAllManholes(data.manholes);
          setRecentManholes(data.manholes.slice(0, 100));
        }
      }
    } catch (error) {
      console.error('Failed to load recent manholes:', error);
    }
  };

  const calculatePrefectureCounts = () => {
    const counts = new Map<string, number>();

    // 都道府県ごとにマンホール数を集計
    allManholes.forEach(manhole => {
      const prefecture = manhole.prefecture;
      counts.set(prefecture, (counts.get(prefecture) || 0) + 1);
    });

    // PREFECTURESと照合して結果を作成
    const result: PrefectureCount[] = PREFECTURES.map(pref => ({
      code: pref.code,
      name: pref.name,
      count: counts.get(pref.name) || 0,
      lat: pref.lat,
      lng: pref.lng,
      zoom: pref.zoom,
    })).filter(p => p.count > 0); // マンホールが存在する都道府県のみ

    setPrefectureCounts(result);
  };

  const handlePrefectureClick = (prefecture: PrefectureCount) => {
    setMapCenter({ lat: prefecture.lat, lng: prefecture.lng });
    setMapZoom(prefecture.zoom);
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

      <div className="max-w-2xl mx-auto p-4 space-y-4">
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

            {/* マップとリストのコンテナ */}
            <div className="relative">
              {/* マップ */}
              <div className="h-[70vh] border-2 border-rpg-border overflow-hidden">
                {mapCenter && (
                  <MapComponent
                    center={mapCenter}
                    manholes={isLoggedIn ? visitedManholes : recentManholes}
                    onManholeClick={handleManholeClick}
                    userLocation={userLocation}
                    zoom={mapZoom}
                  />
                )}
              </div>

              {/* 都道府県リスト（フロート） */}
              {prefectureCounts.length > 0 && (
                <div className="absolute top-4 right-4 w-64 max-h-[calc(70vh-2rem)] bg-rpg-bgLight border-2 border-rpg-border shadow-lg overflow-hidden z-10">
                  <div className="sticky top-0 bg-rpg-bgLight border-b-2 border-rpg-border p-2">
                    <h3 className="font-pixelJp text-xs text-rpg-textDark font-bold">
                      都道府県別 ({prefectureCounts.length})
                    </h3>
                  </div>
                  <div className="overflow-y-auto max-h-[calc(70vh-6rem)] p-2 space-y-1">
                    {prefectureCounts
                      .sort((a, b) => b.count - a.count)
                      .map((pref) => (
                        <button
                          key={pref.code}
                          onClick={() => handlePrefectureClick(pref)}
                          className="w-full rpg-button text-left p-2 hover:bg-rpg-yellow transition-colors"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-pixelJp text-xs text-rpg-textDark font-bold truncate">
                              {pref.name}
                            </span>
                            <span className="font-pixel text-xs text-rpg-blue ml-2">
                              {pref.count}
                            </span>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 text-center">
              <p className="font-pixelJp text-xs text-rpg-textDark opacity-70">
                {isLoggedIn
                  ? `${visitedManholes.length}件の訪問済みポケふたを表示中`
                  : `${allManholes.length}件のポケふたを表示中`
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
