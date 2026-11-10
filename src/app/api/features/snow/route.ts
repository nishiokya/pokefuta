import { NextResponse } from 'next/server';
import { loadTaggedPhotos } from '@/lib/plush-photos';

export const revalidate = 600;

export async function GET() {
  const photos = await loadTaggedPhotos('snow');
  return NextResponse.json({
    success: true,
    count: photos.length,
    photos: photos.slice(0, 3).map((p) => ({ id: p.id })),
  }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } });
}
