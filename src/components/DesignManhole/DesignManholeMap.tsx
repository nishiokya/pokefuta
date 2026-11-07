'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DesignManhole } from '@/types/database';
import { applyLeafletDefaultIcon } from '@/components/Map/leafletDefaultIcon';
import { bindRouteLinkTracking, googleMapsPlaceUrl } from '@/components/Map/routeLink';
import { PREFECTURES } from '@/lib/prefectures';

applyLeafletDefaultIcon();

const DEFAULT_CENTER = {
  lat: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0'),
  lng: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0'),
};

// 図鑑の地図と同じく、この倍率以下は県ごとの枚数、拡大するとピンを出す
const PREFECTURE_OVERVIEW_MAX_ZOOM = 6;
// 県の丸を押したときの寄り方（1枚だけの県で寄りすぎないよう上限も置く）
const PREFECTURE_FOCUS_MAX_ZOOM = 13;

const PREFECTURE_BY_NAME = new Map(PREFECTURES.map((pref) => [pref.name, pref]));

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));

interface DesignManholeMapProps {
  designManholes: DesignManhole[];
  /**
   * 投稿 ID → 都道府県名（サーバーで緯度経度から引いたもの）。渡したときだけ、
   * 引いた倍率で県ごとの枚数を出す（一覧用）。詳細ページは渡さずピンだけ
   */
  prefectureById?: Record<string, string>;
}

// 一覧ページ用の表示専用マップ。引いているときは県ごとの枚数、拡大すると投稿のピン + サムネイル popup
export default function DesignManholeMap({ designManholes, prefectureById }: DesignManholeMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const prefectureLayerRef = useRef<L.LayerGroup | null>(null);
  const overviewEnabledRef = useRef(Boolean(prefectureById));
  overviewEnabledRef.current = Boolean(prefectureById);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    markersLayerRef.current = L.layerGroup();
    prefectureLayerRef.current = L.layerGroup();

    const refreshLayers = () => {
      const markers = markersLayerRef.current;
      const prefectures = prefectureLayerRef.current;
      if (!markers || !prefectures) return;
      const showOverview = overviewEnabledRef.current && map.getZoom() <= PREFECTURE_OVERVIEW_MAX_ZOOM;
      const [show, hide] = showOverview ? [prefectures, markers] : [markers, prefectures];
      if (map.hasLayer(hide)) map.removeLayer(hide);
      if (!map.hasLayer(show)) show.addTo(map);
    };
    map.on('zoomend', refreshLayers);
    refreshLayers();

    return () => {
      map.off('zoomend', refreshLayers);
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
      prefectureLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    const prefectureLayer = prefectureLayerRef.current;
    if (!map || !layer || !prefectureLayer) return;

    layer.clearLayers();
    prefectureLayer.clearLayers();

    if (designManholes.length === 0) return;

    const bounds = L.latLngBounds(designManholes.map((dm) => [dm.latitude, dm.longitude]));

    designManholes.forEach((dm) => {
      const title = escapeHtml(dm.title || 'デザインマンホール');
      const marker = L.marker([dm.latitude, dm.longitude]);
      marker.bindPopup(
        `<div style="text-align:center;min-width:120px;">
          <img src="${dm.photo_url}" alt="${title}" style="max-width:150px;max-height:150px;border-radius:8px;" loading="lazy" />
          <div style="margin-top:4px;font-weight:bold;font-size:12px;">${title}</div>
          <a href="${googleMapsPlaceUrl(dm.latitude, dm.longitude)}" target="_blank" rel="noopener noreferrer" data-route-link
            style="display:block;margin-top:6px;padding:6px 8px;border-radius:6px;background:#1f9d63;color:#fff;font-size:12px;font-weight:bold;text-decoration:none;">
            経路案内
          </a>
        </div>`
      );
      // manhole_id はキャラふたの id なので、デザインふたは surface だけで分ける
      bindRouteLinkTracking(marker, () => ({ surface: 'design_map_popup' }));
      marker.addTo(layer);
    });

    if (!prefectureById) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      return;
    }

    // 県ごとの枚数の丸。位置は図鑑と同じく県庁所在地（引けない県名は投稿の平均位置）
    const byPrefecture = new Map<string, DesignManhole[]>();
    designManholes.forEach((dm) => {
      const prefecture = prefectureById[dm.id] || '不明';
      const list = byPrefecture.get(prefecture);
      if (list) list.push(dm);
      else byPrefecture.set(prefecture, [dm]);
    });

    byPrefecture.forEach((items, prefecture) => {
      const pref = PREFECTURE_BY_NAME.get(prefecture);
      const center: L.LatLngExpression = pref
        ? [pref.lat, pref.lng]
        : [
            items.reduce((sum, dm) => sum + dm.latitude, 0) / items.length,
            items.reduce((sum, dm) => sum + dm.longitude, 0) / items.length,
          ];
      const shortName = prefecture === '北海道' ? prefecture : prefecture.replace(/[都府県]$/, '');
      const icon = L.divIcon({
        className: '',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        html: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,255,255,.94);background:radial-gradient(circle at 35% 30%,#9374c8,#624095 76%);color:#fff;box-shadow:0 4px 12px rgba(67,38,111,.32);font-weight:800;white-space:nowrap;cursor:pointer;">
          <span style="max-width:38px;overflow:hidden;font-size:9px;line-height:1;">${escapeHtml(shortName)}</span>
          <span style="margin-top:2px;font-size:14px;line-height:1;">${items.length}</span>
        </div>`,
      });
      const marker = L.marker(center, { icon, title: `${prefecture}: ${items.length}枚`, keyboard: true });
      marker.on('click', () => {
        const prefBounds = L.latLngBounds(items.map((dm) => [dm.latitude, dm.longitude]));
        const zoom = Math.min(
          PREFECTURE_FOCUS_MAX_ZOOM,
          Math.max(PREFECTURE_OVERVIEW_MAX_ZOOM + 1, map.getBoundsZoom(prefBounds, false, L.point(40, 40)))
        );
        map.setView(prefBounds.getCenter(), zoom);
      });
      marker.addTo(prefectureLayer);
    });

    // 初期表示は県ごとの枚数（全国が入る倍率に収める）
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: PREFECTURE_OVERVIEW_MAX_ZOOM });
  }, [designManholes, prefectureById]);

  return <div ref={mapRef} className="h-72 w-full rounded-lg border border-[#7B63A8]/20 sm:h-96" />;
}
