import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { MAX_VISIT_LIKES_PER_REQUEST, parseVisitIds } from '@/lib/visit-likes';

export const dynamic = 'force-dynamic';

/** PostgREST の max_rows（supabase/config.toml）。いいねの行がこれを超えたらページを送る */
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

/**
 * 複数の訪問のいいね数と、ログイン中の人が押したかをまとめて返す。
 *
 * GET /api/visits/likes?ids=<visit id>,<visit id>,…（最大 MAX_VISIT_LIKES_PER_REQUEST 件）
 * → { success, likes: { "<visit id>": { likes, userLiked } } }
 *
 * 蓋の詳細ページは写真1枚ごとに /api/visits/{id}/social を呼んでいて、1回で Supabase へ
 * 4〜6本（訪問の確認・いいね/ブックマーク/コメントの件数・本人の状態）出ていた。
 * 2026-11-23 の edge_logs で 1日 約1万回 × 6本。画面が使うのはいいね数と本人の状態だけなので、
 * 見える訪問の確認といいねの行の2本にまとめる。見えない訪問（非公開で他人のもの）は返さない。
 * 本人の状態を含むのでクッキーを読み、応答は共有キャッシュさせない。
 */
export async function GET(request: NextRequest) {
  const ids = parseVisitIds(request.nextUrl.searchParams.get('ids'));
  if (ids.length === 0) {
    return NextResponse.json(
      { success: false, likes: {}, error: 'ids is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (ids.length > MAX_VISIT_LIKES_PER_REQUEST) {
    return NextResponse.json(
      { success: false, likes: {}, error: `ids must be ${MAX_VISIT_LIKES_PER_REQUEST} or fewer` },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const supabase = createRouteHandlerClient({ cookies });

    const [{ data: visits, error: visitError }, { data: { session } }] = await Promise.all([
      supabase.from('visit').select('id').in('id', ids),
      supabase.auth.getSession(),
    ]);
    if (visitError) throw new Error(visitError.message);

    const visibleIds = (visits ?? []).map((visit) => visit.id as string);
    const viewerId = session?.user?.id ?? null;
    const likes: Record<string, { likes: number; userLiked: boolean }> = {};
    for (const id of visibleIds) likes[id] = { likes: 0, userLiked: false };

    if (visibleIds.length > 0) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from('visit_like')
          .select('visit_id, user_id')
          .in('visit_id', visibleIds)
          .order('id', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          const entry = likes[row.visit_id as string];
          if (!entry) continue;
          entry.likes += 1;
          if (viewerId && row.user_id === viewerId) entry.userLiked = true;
        }
        if (!data || data.length < PAGE_SIZE) break;
      }
    }

    return NextResponse.json(
      { success: true, likes },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error: unknown) {
    console.error('Failed to load visit likes:', error);
    return NextResponse.json(
      { success: false, likes: {}, error: 'Failed to load visit likes' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
