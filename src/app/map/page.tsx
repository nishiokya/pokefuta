'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { LocateFixed, MapPin, X } from 'lucide-react';
import { Manhole } from '@/types/database';
import { fetchAllManholes } from '@/lib/manhole-list-client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { createBrowserClient } from '@/lib/supabase/client';
import { pageTitle } from '@/lib/constants';
import PCShell from '@/components/PCShell';
import VisitsSwitcher from '@/components/visits/VisitsSwitcher';

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
      <div className="w-full h-full flex items-center justify-center bg-[#F6EEDC]">
        <div className="text-center">
          <div className="font-pixelJp text-[#7B63A8]">
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
  const [allManholes, setAllManholes] = useState<Manhole[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  // デフォルトの中心座標（日本の中心付近）
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0'),
    lng: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0')
  });
  const [mapZoom, setMapZoom] = useState<number>(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 押したピン（地図の下にカードで出す）と、県で絞るシート（スマホ）
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [prefSheetOpen, setPrefSheetOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [visitFilter, setVisitFilter] = useState<'all' | 'unvisited' | 'visited'>('all');
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [prefectureSortOrder, setPrefectureSortOrder] = useState<'code' | 'count'>('code');
  const { trackFilterApply } = useAnalytics();

  // シートを開いたら中へフォーカスを移し、Tab はシート内で回し、Escape で閉じ、閉じたらボタンへ戻す
  useEffect(() => {
    if (!prefSheetOpen) return;
    const trigger = sheetTriggerRef.current;
    const focusables = () =>
      Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPrefSheetOpen(false);
      } else if (e.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, [prefSheetOpen]);

  useEffect(() => {
    // ページタイトル設定
    document.title = pageTitle('ポケふたマップ');

    loadVisits();
  }, []);

  const prefectureCounts = useMemo(() => PREFECTURES.map(pref => ({
    ...pref,
    count: allManholes.filter(manhole => manhole.prefecture === pref.name).length,
  })), [allManholes]);

  const loadVisits = async () => {
    try {
      const data = await fetchAllManholes();
      if (!data) throw new Error('manholes unavailable');
      setAllManholes((data.manholes as unknown as Manhole[]).filter(m =>
        Number.isFinite(m.latitude) && Number.isFinite(m.longitude)
      ));

      const supabase = createBrowserClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.user) return;

      // 既定の100件で切ると、古い記録が未訪問になってしまう。全ページを読む。
      const ownVisits: Visit[] = [];
      const limit = 500;
      for (let offset = 0; ; offset += limit) {
        const response = await fetch(`/api/visits?limit=${limit}&offset=${offset}`);
        if (!response.ok) throw new Error('visits unavailable');
        const page = await response.json();
        if (!page.success || page.authenticated !== true || !Array.isArray(page.visits)) {
          throw new Error('visits unavailable');
        }
        ownVisits.push(...page.visits);
        if (page.visits.length < limit) break;
      }
      setVisits(ownVisits);
      setIsLoggedIn(true);
    } catch {
      // 取得失敗を「全部未訪問」として表示しない。
      setError('マップを読み込めませんでした。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  const visitedManholes = useMemo(() => {
    const visitedIds = new Set(visits.map(visit => visit.manhole_id));
    return allManholes.map(manhole => ({
      ...manhole,
      is_visited: visitedIds.has(manhole.id),
    }));
  }, [allManholes, visits]);

  // 絞り込みはログイン中だけ（未ログインは訪問状況が無い）
  const shownManholes = useMemo(() => {
    if (!isLoggedIn || visitFilter === 'all') return visitedManholes;
    return visitedManholes.filter((m) => (visitFilter === 'visited' ? m.is_visited : !m.is_visited));
  }, [isLoggedIn, visitFilter, visitedManholes]);

  // 現在地が分かったら、いちばん近い未訪問（絞り込みに関係なく）
  const nearestUnvisited = useMemo(() => {
    if (!isLoggedIn || !userLocation) return null;
    const rad = Math.PI / 180;
    let best: { manhole: (typeof visitedManholes)[number]; km: number } | null = null;
    for (const m of visitedManholes) {
      if (m.is_visited || m.latitude == null || m.longitude == null) continue;
      const dLat = (m.latitude - userLocation.lat) * rad;
      const dLng = (m.longitude - userLocation.lng) * rad;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(userLocation.lat * rad) * Math.cos(m.latitude * rad) * Math.sin(dLng / 2) ** 2;
      const km = 12742 * Math.asin(Math.sqrt(h));
      if (!best || km < best.km) best = { manhole: m, km };
    }
    return best;
  }, [isLoggedIn, userLocation, visitedManholes]);

  const selected = useMemo(
    () => (selectedId == null ? null : visitedManholes.find((m) => m.id === selectedId) ?? null),
    [selectedId, visitedManholes],
  );

  const handlePrefectureClick = (prefecture: PrefectureCount) => {
    setMapCenter({ lat: prefecture.lat, lng: prefecture.lng });
    setMapZoom(prefecture.zoom);
    setPrefSheetOpen(false);

    // ✅ GA: 都道府県フィルタリングイベント追跡
    trackFilterApply('prefecture', prefecture.name, prefecture.count);
  };

  // ピンは押しても移動しない。地図の位置とズームを残したまま、下のカードで見せる
  const handleManholeClick = (manhole: { id: number }) => {
    setSelectedId(manhole.id);
  };

  // 許可の確認はこのボタンを押したときだけ出す（開いた瞬間には出さない）
  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLocationNote('この端末では現在地を取得できません');
      return;
    }
    setLocating(true);
    setLocationNote(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserLocation(location);
        setMapCenter(location);
        setMapZoom(12);
        setRecenterKey((k) => k + 1);
        setLocating(false);
      },
      () => {
        setLocationNote('現在地を取得できませんでした。ブラウザの位置情報の許可を確認してください');
        setLocating(false);
      },
    );
  };

  const prefectureList = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-pixelJp text-xs font-bold text-[#4F3828]">
          都道府県（{prefectureCounts.filter((p) => p.count > 0).length}/47）
        </h3>
        <div className="flex gap-1">
          {([['code', 'コード順'], ['count', '数順']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPrefectureSortOrder(key)}
              aria-pressed={prefectureSortOrder === key}
              className={`min-h-[32px] rounded-md px-2.5 font-pixelJp text-[11px] font-bold ${
                prefectureSortOrder === key ? 'bg-[#7B63A8] text-white' : 'bg-[#efe6cf] text-[#6A4D36]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[...prefectureCounts]
          .sort((a, b) => (prefectureSortOrder === 'code' ? parseInt(a.code) - parseInt(b.code) : b.count - a.count))
          .map((pref) => {
            const hasManhole = pref.count > 0;
            return (
              <button
                key={pref.code}
                onClick={() => hasManhole && handlePrefectureClick(pref)}
                disabled={!hasManhole}
                className={`flex min-h-[40px] items-center justify-between gap-1 rounded-lg border px-2 font-pixelJp text-xs ${
                  hasManhole ? 'border-[#e9dfc7] bg-white text-[#4F3828] active:bg-[#efe6cf]' : 'border-transparent bg-[#efe6cf]/50 text-[#6A4D36]/40'
                }`}
              >
                <span className="truncate font-bold">{pref.name.replace(/[県府都]$/, '')}</span>
                <span className="shrink-0 text-[#7B63A8]">{hasManhole ? pref.count : '-'}</span>
              </button>
            );
          })}
      </div>
    </div>
  );

  return (
    <div className="min-h-content safe-area-body bg-[#efe6cf]">

      <PCShell className="pb-32 pt-4 lg:pt-6">
        {/* PC は スタンプ・旅の記録と同じ「本文1fr＋右レール360」。県のリストは地図に重ねず右レールへ。
            スマホは地図が主役なので、県のリストはボタンで開くシートにする */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-[28px]">
          <div className="min-w-0 space-y-4">
            {/* ログイン中は スタンプ帳のタブ（/visits/map はその一つ）。未ログインの公開マップには出さない */}
            {isLoggedIn && (
              <div className="max-w-2xl lg:max-w-none">
                <VisitsSwitcher current="map" />
              </div>
            )}

            {loading ? (
              <div className="py-12 text-center font-pixelJp text-[#7B63A8]">
                読み込み中<span className="rpg-loading"></span>
              </div>
            ) : error ? (
              <div role="alert" className="space-y-3 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4">
                <p>{error}</p>
                <button onClick={() => window.location.reload()} className="rounded border px-4 py-2">再読み込み</button>
              </div>
            ) : (
              <div className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4">
                <h2 className="mb-2 font-pixelJp text-sm font-bold text-[#4F3828]">
                  {isLoggedIn ? '訪問マップ' : 'ポケふたマップ'}
                </h2>

                {/*
                  ここだけ PhraseText を使わない。長い文を句で割らない代わりに、スマホ幅(390px)では
                  2行が3行に増える。地図が本体の画面で説明文が1行伸びるほうが、PCで「ます。」が孤立するより損。
                */}
                <p className="mb-3 font-pixelJp text-xs text-[#6A4D36]">
                  {isLoggedIn
                    ? '訪問済み/未訪問を色で表示します。ピンをタップすると下にカードが出ます。'
                    : '全国のポケふたを表示します。ログインすると自分の訪問済み・未訪問を確認できます。'}
                </p>

                {!isLoggedIn && <Link href="/login?redirect=/visits/map" className="mb-3 inline-block underline">ログインして訪問状況を見る</Link>}

                {isLoggedIn && (
                  <div role="group" aria-label="表示する蓋" className="mb-3 flex gap-1 rounded-[10px] bg-[#efe6cf] p-1">
                    {([['all', 'すべて'], ['unvisited', '未訪問'], ['visited', '訪問済み']] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setVisitFilter(key)}
                        aria-pressed={visitFilter === key}
                        className={`min-h-[36px] flex-1 rounded-[8px] font-pixelJp text-xs font-bold ${
                          visitFilter === key ? 'bg-[#7B63A8] text-white' : 'text-[#6A4D36]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <div className="h-[60vh] overflow-hidden rounded-lg border border-[#7B63A8]/15 lg:h-[70vh]">
                    {mapCenter && (
                      <MapComponent
                        center={mapCenter}
                        manholes={shownManholes}
                        onManholeClick={handleManholeClick}
                        userLocation={userLocation}
                        zoom={mapZoom}
                        plainMarker={!isLoggedIn}
                        popup={false}
                        recenterKey={recenterKey}
                        minHeight={0}
                      />
                    )}
                  </div>

                  {/* 地図の上は最小限（現在地と、スマホの県ボタン）。左上は Leaflet のズームなので右上に置く。z は Leaflet のペイン(〜1000)より上 */}
                  <div className="absolute right-2 top-2 z-[1000] flex flex-col items-end gap-2">
                    <button
                      onClick={handleLocate}
                      disabled={locating}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#7B63A8]/20 bg-white/95 px-3 font-pixelJp text-xs font-bold text-[#7B63A8] shadow disabled:opacity-60"
                    >
                      <LocateFixed className="h-4 w-4" /> {locating ? '取得中…' : '現在地'}
                    </button>
                    <button
                      ref={sheetTriggerRef}
                      onClick={() => setPrefSheetOpen(true)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#7B63A8]/20 bg-white/95 px-3 font-pixelJp text-xs font-bold text-[#7B63A8] shadow lg:hidden"
                    >
                      <MapPin className="h-4 w-4" /> 県で絞る
                    </button>
                  </div>
                </div>

                {locationNote && <p role="status" className="mt-2 font-pixelJp text-xs text-[#bf5640]">{locationNote}</p>}

                {nearestUnvisited && (
                  <div className="mt-3 rounded-[12px] border border-[#bf5640]/30 bg-[#bf5640]/5 p-3">
                    <p className="font-pixelJp text-[11px] font-bold text-[#bf5640]">いちばん近い未訪問</p>
                    <p className="mt-0.5 truncate font-pixelJp text-sm font-bold text-[#4F3828]">
                      {nearestUnvisited.manhole.name || nearestUnvisited.manhole.title || 'ポケふた'}
                      <span className="ml-2 text-xs font-normal text-[#6A4D36]">
                        {nearestUnvisited.km < 1 ? `${Math.round(nearestUnvisited.km * 1000)}m` : `${nearestUnvisited.km.toFixed(1)}km`}
                      </span>
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          const m = nearestUnvisited.manhole;
                          if (m.latitude == null || m.longitude == null) return;
                          // 「訪問済み」で絞っていると、行き先のピンが地図に無い
                          if (visitFilter === 'visited') setVisitFilter('all');
                          setSelectedId(m.id);
                          setMapCenter({ lat: m.latitude, lng: m.longitude });
                          setMapZoom(15);
                          setRecenterKey((k) => k + 1);
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#7B63A8]/30 bg-white px-3 font-pixelJp text-xs font-bold text-[#7B63A8]"
                      >
                        <MapPin className="h-4 w-4" /> 地図で見る
                      </button>
                      {/* /nearby は30km圏の検索で、この蓋が圏外だと出ない。行き先を確実に開けるよう詳細へ */}
                      <Link href={`/manhole/${nearestUnvisited.manhole.id}`} className="inline-flex min-h-[40px] items-center rounded-lg bg-[#bf5640] px-3 font-pixelJp text-xs font-bold text-white">
                        詳細を見る
                      </Link>
                    </div>
                  </div>
                )}

                {/* 押したピンのカード。地図の位置は動かさない。詳細へは「詳細を見る」から */}
                {selected && (
                  <div className="mt-3 flex items-start justify-between gap-3 rounded-[12px] border border-[#e9dfc7] bg-white p-3">
                    <div className="min-w-0">
                      <p className="truncate font-pixelJp text-sm font-bold text-[#4F3828]">{selected.name || selected.title || 'ポケふた'}</p>
                      <p className="mt-0.5 font-pixelJp text-xs text-[#6A4D36]">
                        {selected.prefecture} {selected.city || selected.municipality || ''}
                      </p>
                      {isLoggedIn && (
                        <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 font-pixelJp text-[11px] font-bold ${
                          selected.is_visited ? 'bg-[#4ecdc4]/20 text-[#1f7a73]' : 'bg-[#ff6b6b]/15 text-[#b43c3c]'
                        }`}>
                          {selected.is_visited ? '✓ 訪問済み' : '? 未訪問'}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Link href={`/manhole/${selected.id}`} className="inline-flex min-h-[40px] items-center rounded-lg bg-[#7B63A8] px-3 font-pixelJp text-xs font-bold text-white">
                        詳細を見る
                      </Link>
                      <button onClick={() => setSelectedId(null)} aria-label="カードを閉じる" className="inline-flex h-10 w-10 items-center justify-center text-[#6A4D36]">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 text-center">
                  <p className="font-pixelJp text-xs text-[#6A4D36]">
                    {isLoggedIn
                      ? `全${visitedManholes.length}件（訪問済み: ${visitedManholes.filter((m) => m.is_visited).length}件）${visitFilter === 'all' ? '' : ` ／ 地図に${shownManholes.length}件`}`
                      : `全${visitedManholes.length}件のポケふたを表示中`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* PC: 県のリストは右レール */}
          {!loading && !error && prefectureCounts.length > 0 && (
            <div className="hidden lg:block">
              <div className="sticky top-[20px] rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4">{prefectureList}</div>
            </div>
          )}
        </div>
      </PCShell>

      {/* スマホ: 県で絞るシート */}
      {prefSheetOpen && (
        <div className="fixed inset-0 z-[2000] lg:hidden" role="dialog" aria-modal="true" aria-label="都道府県で絞る">
          <button aria-label="閉じる" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={() => setPrefSheetOpen(false)} />
          <div ref={sheetRef} className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-[18px] bg-[#fffdf7] p-4 pb-8">
            <div className="mb-2 flex justify-end">
              <button onClick={() => setPrefSheetOpen(false)} aria-label="閉じる" className="inline-flex h-10 w-10 items-center justify-center text-[#6A4D36]">
                <X className="h-4 w-4" />
              </button>
            </div>
            {prefectureList}
          </div>
        </div>
      )}
    </div>
  );
}
