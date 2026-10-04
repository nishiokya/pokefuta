import { NextResponse } from 'next/server';
import { loadPlushPhotos } from '@/lib/plush-photos';

// トップの特集カード用。ぬいぐるみの写真の新しい数枚と、特集ページにある枚数を返す。
// 判定は毎朝書かれるので、CDN に数分置いてよい
export const revalidate = 600;

export async function GET() {
  // 枚数は特集ページと同じ集合、カードの3枚は新着（スコア順だと同じ写真が出続け、新しい投稿が出ない）
  const photos = await loadPlushPhotos(undefined, 'recent');
  return NextResponse.json(
    {
      success: true,
      count: photos.length,
      photos: photos.slice(0, 3).map((p) => ({ id: p.id, manhole_name: p.manholeName })),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  );
}
