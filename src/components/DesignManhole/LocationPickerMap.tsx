'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { applyLeafletDefaultIcon } from '@/components/Map/leafletDefaultIcon';

applyLeafletDefaultIcon();

const DEFAULT_CENTER = {
  lat: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0'),
  lng: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0'),
};
const ZOOM_NO_PIN = 5;
const ZOOM_WITH_PIN = 16;

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

// 投稿フォーム用の位置ピッカー。クリックでピン設置、ドラッグで微調整、
// 「現在地を使う」ボタンで geolocation。controlled: 親の lat/lng に追従する。
export default function LocationPickerMap({ lat, lng, onChange }: LocationPickerMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Leaflet イベントハンドラから最新の onChange を呼ぶための ref
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const hasPin = lat != null && lng != null;
    const map = L.map(mapRef.current, {
      center: hasPin ? [lat!, lng!] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      zoom: hasPin ? ZOOM_WITH_PIN : ZOOM_NO_PIN,
      zoomControl: true,
      attributionControl: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
    // 初期化は一度だけ。初期座標は親からの props 反映 effect が引き受ける
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 親からの座標変更（EXIF抽出・現在地・クリック）をマーカーに反映
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (lat == null || lng == null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    if (!markerRef.current) {
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onChangeRef.current(pos.lat, pos.lng);
      });
      markerRef.current = marker;
      map.setView([lat, lng], ZOOM_WITH_PIN, { animate: true });
    } else {
      const current = markerRef.current.getLatLng();
      // ドラッグ由来の onChange が返ってきたときに setView し直さない
      if (Math.abs(current.lat - lat) > 1e-9 || Math.abs(current.lng - lng) > 1e-9) {
        markerRef.current.setLatLng([lat, lng]);
        map.setView([lat, lng], Math.max(map.getZoom(), ZOOM_WITH_PIN), { animate: true });
      }
    }
  }, [lat, lng]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('お使いのブラウザは位置情報に対応していません');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChangeRef.current(position.coords.latitude, position.coords.longitude);
      },
      () => {
        alert('現在地を取得できませんでした。位置情報の利用を許可してください');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative">
      <div ref={mapRef} className="h-72 w-full rounded-lg border border-[#7B63A8]/20 sm:h-80" />
      <button
        type="button"
        onClick={handleUseCurrentLocation}
        className="absolute right-2 top-2 z-[1000] rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#2A2A2A] shadow-md transition hover:bg-[#7B63A8]/10"
      >
        現在地を使う
      </button>
    </div>
  );
}
