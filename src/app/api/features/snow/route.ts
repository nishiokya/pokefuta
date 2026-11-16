import { NextResponse } from 'next/server';
import { featureCardCacheControl } from '@/lib/feature-card-cache';
import { interleaveByGroup } from '@/lib/interleave-by-group';
import { loadTaggedPhotos, sortByShotAtDesc } from '@/lib/plush-photos';

// ISR にしない。DB のタイムアウトで取れなかった 0 枚の結果が ISR キャッシュに残り、トップの特集が両方消えた（2026-11-16）。
// キャッシュは CloudFront への Cache-Control（featureCardCacheControl。0 枚はキャッシュしない）に任せる
export const dynamic = 'force-dynamic';

export async function GET() {
  // トップの特集カードの3枚も、特集ページと同じ撮影日の新しい順から取る。
  // 同じ訪問の写真は撮影日が並ぶので、訪問を1枚ずつ順番に回して3枚が1回の訪問で埋まらないようにする
  const photos = interleaveByGroup(sortByShotAtDesc(await loadTaggedPhotos('snow')), (p) => p.visitId);
  return NextResponse.json({
    success: true,
    count: photos.length,
    photos: photos.slice(0, 3).map((p) => ({ id: p.id })),
  }, { headers: { 'Cache-Control': featureCardCacheControl(photos.length) } });
}
