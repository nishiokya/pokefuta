import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import { loadManholeDetail } from '@/lib/manhole-detail-payload';
import { parseManholeIdParam } from '@/lib/manhole-detail';

/**
 * ログイン中の利用者の訪問状態を1枚ぶんだけ引く。
 *
 * スナップショットの `is_visited` は**常に false の固定値**（匿名向けの形）。
 * 全件を返す `/api/manholes` は Supabase の訪問記録を重ねてから返しており、
 * 詳細ページの地図（`MapComponent`）はこの値でピンを描き分ける
 * （訪問済み＝ティールの✓／未訪問＝赤の?）。重ねないと、自分が撮った蓋なのに
 * 未訪問のピンが出る。全件取得をやめた分、ここで同じ重ね合わせをする。
 *
 * 全件版と違い manhole_id で絞れるので、引くのは1行だけ。
 */
async function loadVisitState(
  manholeId: number
): Promise<{ is_visited: boolean; last_visit: string | null }> {
  const fallback = { is_visited: false, last_visit: null };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('dummy')) return fallback;

  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return fallback;

    const { data } = await supabase
      .from('visit')
      .select('shot_at')
      .eq('user_id', userId)
      .eq('manhole_id', manholeId)
      .order('shot_at', { ascending: false })
      .limit(1);

    if (!data || data.length === 0) return fallback;
    return { is_visited: true, last_visit: data[0].shot_at ?? null };
  } catch (error) {
    // 訪問状態の重ね合わせに失敗しても匿名相当で返す（全件版と同じ扱い）
    console.error('Failed to overlay visit status:', error);
    return fallback;
  }
}

// スラッグ名は同じ階層の `comments` / `context-images` に合わせて `manholeId`。
// Next.js は同一パスで別名のスラッグを許さない（`[id]` にするとビルドが落ちる）。
/**
 * @swagger
 * /api/manholes/{manholeId}:
 *   get:
 *     summary: マンホール1枚と、その詳細ページに必要な派生値を取得
 *     tags: [manholes]
 *     description: >
 *       詳細ページ用の単体GET。蓋そのものに加えて、統計（都道府県内の枚数・同じ
 *       ポケモンの枚数・30km以内の件数）と、関連する蓋（次に寄れる／同じポケモン）を
 *       ラベル込みで返す。マスターデータは data.pokefuta.com の静的スナップショット
 *       （日次更新）から取得する。
 *     parameters:
 *       - in: path
 *         name: manholeId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: マンホール1枚 + 派生値 }
 *       400: { description: manholeId が整数でない }
 *       404: { description: 該当なし }
 *       503: { description: スナップショット取得失敗 }
 */

// 詳細ページの取得元。**全件を返す `/api/manholes` の代わり**にこれを使う。
//
// 以前は1枚見るために全482件・730KB を落としてから find で1件を探し、
// 近傍・同じポケモン・統計もクライアントで計算していた。全国分を運んで
// 1枚を表示していたことになる。ここで必要なぶんだけ返す。
export async function GET(
  _request: NextRequest,
  { params }: { params: { manholeId: string } }
) {
  try {
    // 判定はサーバ描画と共有する（`parseManholeIdParam`）。ここだけ厳しくすると、
    // サーバ描画が中身を出すのにこちらが 400 を返す食い違いが起きる。
    const manholeId = parseManholeIdParam(params.manholeId);
    if (manholeId === null) {
      return NextResponse.json(
        { error: 'manholeId must be a positive integer' },
        { status: 400 }
      );
    }

    // 素材の組み立てはサーバ描画と共有する（`loadManholeDetail`）。
    // ここで別に組み立てると、初期HTMLと再取得後で中身が食い違う余地ができる。
    //
    // スナップショットを引くのは中で1回だけ。ここで先に引いて 503 を判定してから
    // もう一度引く形にしていたが、1回目が成功して2回目が失敗すると
    // **「その蓋は存在しない」(404) と嘘をつく**。失敗の理由を返してもらって分岐する。
    const result = await loadManholeDetail(manholeId);
    if (!result.ok) {
      return result.reason === 'unavailable'
        ? NextResponse.json(
            { error: 'Manhole data is temporarily unavailable. Please try again later.' },
            { status: 503 }
          )
        : NextResponse.json({ error: 'Manhole not found' }, { status: 404 });
    }

    const { manhole, ...derived } = result.payload;
    const visitState = await loadVisitState(manholeId);

    return NextResponse.json({
      success: true,
      manhole: { ...manhole, ...visitState },
      ...derived,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
