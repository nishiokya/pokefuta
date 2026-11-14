import type L from 'leaflet';
import { pokefutaEvents, type PokefutaEventParams } from '@/lib/analytics/gtag';

/**
 * 「経路案内」ボタンの行き先。開くのは場所の地図（ピン）で、道順は Google マップの「経路」から出してもらう。
 * 経路（maps/dir）を直接開くと、スマホでは現在地からのナビがすぐ始まり、下調べの人には大げさだった。
 * 図鑑（pokefuta-tracker）も同じ形にそろえている。
 */
export function googleMapsPlaceUrl(latitude: number | null | undefined, longitude: number | null | undefined): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/**
 * ポップアップは HTML 文字列なので React の onClick を付けられない。
 * 開いたときに `data-route-link` の要素へ計測を付ける。
 * ポップアップの DOM は開くたびに作り直されるので、二重に付くことはない。
 */
export function bindRouteLinkTracking(marker: L.Marker, params: () => PokefutaEventParams): void {
  marker.on('popupopen', (e: L.PopupEvent) => {
    const link = e.popup.getElement()?.querySelector('[data-route-link]');
    link?.addEventListener('click', () => pokefutaEvents.routeOpen(params()));
  });
}
