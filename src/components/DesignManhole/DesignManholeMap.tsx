'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DesignManhole } from '@/types/database';
import { applyLeafletDefaultIcon } from '@/components/Map/leafletDefaultIcon';
import { bindRouteLinkTracking, googleMapsRouteUrl } from '@/components/Map/routeLink';

applyLeafletDefaultIcon();

const DEFAULT_CENTER = {
  lat: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0'),
  lng: parseFloat(process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0'),
};

interface DesignManholeMapProps {
  designManholes: DesignManhole[];
}

// 一覧ページ用の表示専用マップ（投稿のマーカー + サムネイル popup）
export default function DesignManholeMap({ designManholes }: DesignManholeMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

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

    markersLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (designManholes.length === 0) return;

    const escapeHtml = (text: string) =>
      text.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c] as string));

    designManholes.forEach((dm) => {
      const title = escapeHtml(dm.title || 'デザインマンホール');
      const marker = L.marker([dm.latitude, dm.longitude]);
      marker.bindPopup(
        `<div style="text-align:center;min-width:120px;">
          <img src="${dm.photo_url}" alt="${title}" style="max-width:150px;max-height:150px;border-radius:8px;" loading="lazy" />
          <div style="margin-top:4px;font-weight:bold;font-size:12px;">${title}</div>
          <a href="${googleMapsRouteUrl(dm.latitude, dm.longitude)}" target="_blank" rel="noopener noreferrer" data-route-link
            style="display:block;margin-top:6px;padding:6px 8px;border-radius:6px;background:#1f9d63;color:#fff;font-size:12px;font-weight:bold;text-decoration:none;">
            経路案内
          </a>
        </div>`
      );
      // manhole_id はキャラふたの id なので、デザインふたは surface だけで分ける
      bindRouteLinkTracking(marker, () => ({ surface: 'design_map_popup' }));
      marker.addTo(layer);
    });

    const bounds = L.latLngBounds(designManholes.map((dm) => [dm.latitude, dm.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [designManholes]);

  return <div ref={mapRef} className="h-72 w-full rounded-lg border border-[#7B63A8]/20 sm:h-96" />;
}
