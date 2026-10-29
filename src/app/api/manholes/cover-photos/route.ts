import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { pickCoverPhotos, type CoverPhotoCandidate } from '@/lib/manhole-cover-photos';

// クッキーを読まない（#275）と静的ルート扱いになり、ビルド時の結果で固まりうる
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** 1回に受け付ける蓋の数。/nearby は最大 50 件を並べる */
const MAX_IDS = 100;
/** PostgREST の max_rows（supabase/config.toml）。1回の応答はこれ以上返らないのでページを送る */
const PAGE_SIZE = 1000;
/** ページ送りの上限。蓋100件ぶんの公開写真なら1〜2ページで済む */
const MAX_PAGES = 10;

/**
 * 蓋ごとの代表写真（公開訪問のみ）を返す。
 *
 * /nearby は今まで「見ている人自身の訪問」の写真しか出せず、まだ行っていない蓋は
 * 写真があってもプレースホルダーになっていた。ここで公開写真から1枚選んで埋める。
 * 選び方は詳細ページの代表写真と同じ rankManholePhotos。
 *
 * GET /api/manholes/cover-photos?ids=404,405,407
 * → { success, photos: { "404": { photo_id, thumbnail_url, is_landscape, lid_crop } } }
 *
 * 誰の写真かは返さない（photo の id だけ）。
 */
export async function GET(request: NextRequest) {
  const ids = Array.from(
    new Set(
      (request.nextUrl.searchParams.get('ids') || '')
        .split(',')
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ success: true, photos: {} });
  }

  try {
    // 共有キャッシュする応答なのでクッキーを読まない（anon.ts 参照）
    const supabase = createAnonClient();
    const rows: CoverPhotoCandidate[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from('photo')
        .select(`
          id,
          manhole_id,
          created_at,
          quality_score,
          quality_eligible,
          is_landscape,
          ai_tags,
          visit:visit_id!inner (
            comment,
            is_public
          )
        `)
        .in('manhole_id', ids)
        .eq('visit.is_public', true)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) {
        throw new Error(error.message);
      }
      rows.push(...((data ?? []) as unknown as CoverPhotoCandidate[]));
      if (!data || data.length < PAGE_SIZE) break;
    }

    const photos = pickCoverPhotos(rows);

    return NextResponse.json(
      { success: true, photos },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error: unknown) {
    console.error('Failed to get manhole cover photos:', error);
    return NextResponse.json(
      { success: false, photos: {}, error: 'Failed to get manhole cover photos' },
      { status: 500 }
    );
  }
}
