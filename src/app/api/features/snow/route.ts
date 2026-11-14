import { NextResponse } from 'next/server';
import { loadTaggedPhotos, sortByShotAtDesc } from '@/lib/plush-photos';

export const revalidate = 600;

export async function GET() {
  // トップの特集カードの3枚も、特集ページと同じ撮影日の新しい順から取る
  const photos = sortByShotAtDesc(await loadTaggedPhotos('snow'));
  return NextResponse.json({
    success: true,
    count: photos.length,
    photos: photos.slice(0, 3).map((p) => ({ id: p.id })),
  }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } });
}
