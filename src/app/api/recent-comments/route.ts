import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  parseRecentCommentsLimit,
  pickRecentComments,
  type RecentCommentCandidate,
} from '@/lib/recent-comments';

/**
 * トップの「最近の口コミ」。蓋の掲示板コメントと写真のひとことを新しい順に混ぜ、
 * 蓋ごとに1件へ絞って返す。
 *
 * 公開情報だけを返すので anon で読む（ログイン中の本人の非公開訪問を混ぜない）。
 * manhole_comment は user_id を読めない（Phase 1c）ので、投稿者名は返さない。
 */
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

/**
 * 蓋ごとに1件へ絞る前に読む件数。同じ蓋への連投や、読む価値の無いひとこと
 * （数字だけ等）で候補が減っても、表示件数を満たせるだけの余裕を持たせる。
 * どちらも新しい順に取るので、切られるのは古い側だけ。
 */
const COMMENT_SCAN = 50;
const PHOTO_NOTE_SCAN = 100;

function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type PhotoRef = { id: string; created_at: string | null };

/** 訪問の写真のうち最初に上がった1枚。一覧の先頭写真と同じ選び方にそろえる */
function firstPhotoId(photos: PhotoRef[] | null | undefined): string | null {
  const sorted = [...(photos || [])].sort(
    (a, b) => Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? '')
  );
  return sorted[0]?.id ?? null;
}

export async function GET(request: NextRequest) {
  const limit = parseRecentCommentsLimit(request.nextUrl.searchParams.get('limit'));
  const supabase = createAnonClient();

  const [commentsResult, notesResult] = await Promise.all([
    supabase
      .from('manhole_comment')
      .select('manhole_id, content, created_at')
      .is('parent_comment_id', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(COMMENT_SCAN),
    supabase
      .from('visit')
      .select('manhole_id, comment, created_at, photos:photo!inner(id, created_at)')
      .eq('is_public', true)
      .not('manhole_id', 'is', null)
      .not('comment', 'is', null)
      .neq('comment', '')
      .order('created_at', { ascending: false })
      .limit(PHOTO_NOTE_SCAN),
  ]);

  if (commentsResult.error && notesResult.error) {
    console.error('Failed to load recent comments:', commentsResult.error, notesResult.error);
    return NextResponse.json(
      { success: false, error: 'Failed to load recent comments' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  // 片方だけ落ちたら、もう片方だけで返す（セクションが丸ごと消えるよりよい）
  if (commentsResult.error) console.warn('Failed to load manhole comments:', commentsResult.error);
  if (notesResult.error) console.warn('Failed to load photo notes:', notesResult.error);

  const candidates: RecentCommentCandidate[] = [];
  for (const row of (commentsResult.data as any[]) || []) {
    if (typeof row.manhole_id !== 'number') continue;
    candidates.push({
      kind: 'comment',
      manhole_id: row.manhole_id,
      content: row.content ?? '',
      created_at: row.created_at,
      photo_id: null,
    });
  }
  for (const row of (notesResult.data as any[]) || []) {
    if (typeof row.manhole_id !== 'number') continue;
    candidates.push({
      kind: 'photo_note',
      manhole_id: row.manhole_id,
      content: row.comment ?? '',
      // ひとことが書かれた日時は訪問の登録日時（visit-comment-quality と同じ軸）
      created_at: row.created_at,
      photo_id: firstPhotoId(row.photos),
    });
  }

  const picked = pickRecentComments(candidates, limit);
  const manholeIds = Array.from(new Set(picked.map((item) => item.manhole_id)));
  const needPhoto = Array.from(
    new Set(picked.filter((item) => !item.photo_id).map((item) => item.manhole_id))
  );

  const [manholesResult, photosResult] = await Promise.all([
    manholeIds.length > 0
      ? supabase
        .from('manhole')
        .select('id, title, prefecture, municipality, building')
        .in('id', manholeIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    // 掲示板コメントには写真が無いので、その蓋のいちばん新しい公開写真を添える
    needPhoto.length > 0
      ? supabase
        .from('visit')
        .select('manhole_id, created_at, photos:photo!inner(id, created_at)')
        .eq('is_public', true)
        .in('manhole_id', needPhoto)
        .order('created_at', { ascending: false })
        .limit(needPhoto.length * 10)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (manholesResult.error) {
    console.error('Failed to load manholes for recent comments:', manholesResult.error);
    return NextResponse.json(
      { success: false, error: 'Failed to load recent comments' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (photosResult.error) console.warn('Failed to load photos for recent comments:', photosResult.error);

  const manholeMap = new Map<number, any>(
    ((manholesResult.data as any[]) || []).map((manhole) => [manhole.id, manhole])
  );
  const fallbackPhoto = new Map<number, string>();
  for (const row of (photosResult.data as any[]) || []) {
    if (fallbackPhoto.has(row.manhole_id)) continue;
    const photoId = firstPhotoId(row.photos);
    if (photoId) fallbackPhoto.set(row.manhole_id, photoId);
  }

  const items = picked.flatMap((item) => {
    const manhole = manholeMap.get(item.manhole_id);
    // 蓋が消えている（非公開化など）ものは出さない
    if (!manhole) return [];
    const photoId = item.photo_id ?? fallbackPhoto.get(item.manhole_id) ?? null;
    return [{
      kind: item.kind,
      content: item.content,
      created_at: item.created_at,
      manhole: {
        id: manhole.id,
        title: manhole.title,
        prefecture: manhole.prefecture,
        municipality: manhole.municipality,
        building: manhole.building,
      },
      thumbnail_url: photoId ? `/api/photo/${photoId}?size=small` : null,
    }];
  });

  return NextResponse.json(
    { success: true, items },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  );
}
