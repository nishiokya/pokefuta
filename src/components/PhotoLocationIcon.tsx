import { MapPin, MapPinOff } from 'lucide-react';

/**
 * 写真に撮影位置（EXIF の GPS）があるかの印。visit.location_source（20261030120000）を出す。
 * 座標そのものは出さない。値が無い（旧 API の応答など）ときは何も出さない。
 */
export default function PhotoLocationIcon({
  source,
  tone = 'light',
}: {
  source?: 'gps' | 'none' | null;
  /** light: 明るい背景（一覧の帯）。dark: 写真に重ねる白文字 */
  tone?: 'light' | 'dark';
}) {
  if (source !== 'gps' && source !== 'none') return null;
  const hasGps = source === 'gps';
  const label = hasGps ? '位置情報あり' : '位置情報なし';
  const Icon = hasGps ? MapPin : MapPinOff;
  const color =
    tone === 'dark'
      ? hasGps ? 'text-white' : 'text-white/55'
      : hasGps ? 'text-[#1f9d63]' : 'text-[#b8ad97]';
  return (
    <span title={label} aria-label={label} role="img" className={`inline-flex shrink-0 items-center ${color}`}>
      <Icon className="h-3 w-3" strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}
