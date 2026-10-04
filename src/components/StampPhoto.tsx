import { photoLidZoom, photoObjectPosition } from '@/lib/photo-ai-tags';

/**
 * マイ旅の「集めたスタンプ」の丸の中の写真。蓋の枠（ai_tags.lid）があれば蓋で丸をいっぱいにし、
 * 無ければ一覧の正方形の位置（ai_tags.crop）、それも無ければ真ん中で切る。
 * 親は aspect-square・overflow-hidden・rounded-full の枠にする（この部品が relative を足す）。
 */
export default function StampPhoto({ src, aiTags }: { src: string; aiTags?: unknown }) {
  const zoom = photoLidZoom(aiTags);
  if (zoom) {
    return (
      <span className="relative block h-full w-full">
        <img src={src} alt="" style={zoom} loading="lazy" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      style={{ objectPosition: photoObjectPosition(aiTags) }}
      loading="lazy"
    />
  );
}
