import { NextResponse } from 'next/server';
import { FEATURE_CARD_CACHE_CONTROL } from '@/lib/feature-card-cache';
import { hasPlushClip } from '@/lib/photo-ai-tags';
import { loadPlushPhotos } from '@/lib/plush-photos';

// トップの特集カード用。ぬいぐるみの写真の新しい数枚と、特集ページにある枚数を返す。
// 判定は毎朝書かれるので、CDN に1時間置いてよい（FEATURE_CARD_CACHE_CONTROL）
export const revalidate = 3600;

export async function GET() {
  // 枚数は特集ページと同じ集合（蓋とぬいぐるみを切り抜ける写真だけ）、カードの3枚は新着
  // （スコア順だと同じ写真が出続け、新しい投稿が出ない）。新着も投稿者を順番に回してあるので3枚は別の人になりやすい
  const photos = (await loadPlushPhotos(undefined, 'recent')).filter((p) => hasPlushClip(p.aiTags));
  return NextResponse.json(
    {
      success: true,
      count: photos.length,
      // カードでも蓋とぬいぐるみを切り抜いて見せるので、切り抜きに要る枠だけを渡す
      photos: photos.slice(0, 3).map((p) => {
        const tags = (p.aiTags ?? {}) as Record<string, unknown>;
        return { id: p.id, manhole_name: p.manholeName, ai_tags: { crop: tags.crop, lid: tags.lid, plush_box: tags.plush_box } };
      }),
    },
    { headers: { 'Cache-Control': FEATURE_CARD_CACHE_CONTROL } },
  );
}
