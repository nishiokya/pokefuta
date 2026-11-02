import type L from 'leaflet';
import { pokefutaEvents, type PokefutaEventParams } from '@/lib/analytics/gtag';

/** Googleマップの経路案内（目的地だけ指定。出発地は端末の現在地になる） */
export function googleMapsRouteUrl(latitude: number | null | undefined, longitude: number | null | undefined): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
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
