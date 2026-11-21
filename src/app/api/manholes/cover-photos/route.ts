import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import {
  coverPhotoBucketRange,
  coverPhotoCandidateFromRow,
  pickCoverPhotos,
  type CoverPhotoRow,
} from '@/lib/manhole-cover-photos';

// クッキーを読まない（#275）と静的ルート扱いになり、ビルド時の結果で固まりうる
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** PostgREST の max_rows（supabase/config.toml）。1回の応答はこれ以上返らないのでページを送る */
const PAGE_SIZE = 1000;
/** ページ送りの上限。蓋100枚ぶんの公開写真で数千行。打ち切ったら警告を出す */
const MAX_PAGES = 20;
/** バケツ番号の上限。蓋 id は 1000 未満（2026-11 時点で約500枚）。余裕を見て 50 */
const MAX_BUCKET = 50;

/**
 * 代表写真は数時間遅れても困らない（新しい写真が代表に上がるのが遅れるだけ）ので長めに持たせる。
 * 写真が非公開に切り替わっても、画像そのものは /api/photo/{id} が公開か確かめて配るので、
 * ここが古くても非公開の画像は出ない（丸がプレースホルダーになるだけ）。
 */
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400';

/**
 * 蓋ごとの代表写真（公開訪問のみ）を、蓋 id の固定の区切り（バケツ）単位で返す。
 *
 * GET /api/manholes/cover-photos?bucket=4  （蓋 id 401〜500）
 * → { success, photos: { "404": { photo_id, thumbnail_url, is_landscape, lid_crop } } }
 *
 * URL を固定の数本に絞って CDN で共有するための形。呼び出しは fetchCoverPhotos（クライアント側）経由。
 * 選び方は詳細ページの代表写真と同じ rankManholePhotos（ひとこと付きを先にする決まりだけ外す。pickCoverPhotos）。
 * 誰の写真かは返さない（photo の id だけ）。
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('bucket');
  const bucket = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(bucket) || bucket < 0 || bucket > MAX_BUCKET) {
    return NextResponse.json(
      { success: false, photos: {}, error: 'bucket is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const { from, to } = coverPhotoBucketRange(bucket);

  try {
    // 共有キャッシュする応答なのでクッキーを読まない（anon.ts 参照）
    const supabase = createAnonClient();
    const rows: CoverPhotoRow[] = [];
    let truncated = true;
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
          ai_scene:ai_tags->>scene,
          ai_lid_fits:ai_tags->lid_fits,
          ai_rep_score:ai_tags->rep_score,
          ai_lid:ai_tags->lid,
          ai_crop:ai_tags->crop,
          visit:visit_id!inner ( is_public )
        `)
        .gte('manhole_id', from)
        .lte('manhole_id', to)
        .eq('visit.is_public', true)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) {
        throw new Error(error.message);
      }
      rows.push(...((data ?? []) as unknown as CoverPhotoRow[]));
      if (!data || data.length < PAGE_SIZE) {
        truncated = false;
        break;
      }
    }
    if (truncated) {
      console.warn(`cover-photos: bucket ${bucket} hit MAX_PAGES (${MAX_PAGES * PAGE_SIZE} rows); older photos were skipped`);
    }

    const photos = pickCoverPhotos(rows.map(coverPhotoCandidateFromRow));

    return NextResponse.json(
      { success: true, photos },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (error: unknown) {
    console.error('Failed to get manhole cover photos:', error);
    return NextResponse.json(
      { success: false, photos: {}, error: 'Failed to get manhole cover photos' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
