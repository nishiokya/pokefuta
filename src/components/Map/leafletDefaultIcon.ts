import L from 'leaflet';

// Fix for default markers in Leaflet
// （バンドラ経由だとデフォルトアイコンのURL解決が壊れるため CDN を明示する。
//   Map系コンポーネントは import 時にこれを一度だけ呼ぶ）
let applied = false;

export function applyLeafletDefaultIcon() {
  if (applied) return;
  applied = true;
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}
