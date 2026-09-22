import { NextResponse } from 'next/server';
import { fetchManholeSnapshot } from '@/lib/manhole-snapshot';
import { buildPrefectureCompletion } from '@/lib/prefecture-completion';

/**
 * 都道府県ごとの現地写真コンプリート状況。
 *
 * 蓋ごとの都道府県と photo_count を持っているのは data.pokefuta.com の日次
 * スナップショットだけなので、ここを唯一の入力にする（Supabase の manhole
 * テーブルは city 列すら持たない）。日次でよい理由は、この数字が「残り
 * N都道府県」という粒度で、1日で動くことがまずないため。トップの
 * 「写真が N 枚集まっています」のような現在形の数字は従来どおり
 * /api/site-stats（毎回 DB）が出す。
 *
 * force-dynamic が無いとビルド時に静的プリレンダーされ、Amplify では
 * デプロイ時点の値で凍結する（/api/site-stats と同じ事故）。
 */
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

export async function GET() {
  const snapshot = await fetchManholeSnapshot();
  if (!snapshot?.manholes) {
    // 取れない日は success:false を返し、呼び出し側は何も出さない。
    // 0件として描くと「残り0都道府県 = 全国達成」になってしまう。
    //
    // 成功応答を CDN に1時間持たせている以上、失敗側は明示的に no-store に
    // しないと 503 が同じだけキャッシュされ、スナップショットが復旧しても
    // トップが枚数表示のフォールバックのままになる（/api/site-stats と同じ）。
    return NextResponse.json(
      { success: false, error: 'snapshot_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const rollup = buildPrefectureCompletion(
    snapshot.manholes.map((manhole) => ({
      prefecture: manhole.prefecture,
      photo_count: manhole.photo_count,
    }))
  );

  return NextResponse.json(
    {
      success: true,
      generated_at: snapshot.generated_at,
      ...rollup,
    },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  );
}
