import { NextResponse } from 'next/server';
import { fetchSiteStatsSnapshot } from '@/lib/manhole-snapshot';

/**
 * サイト統計。
 *
 * data.pokefuta.com の静的スナップショット（bake-app-data.yml が日次生成）を
 * そのまま返す。リクエスト毎の Supabase 読み出し（旧実装では auth admin API の
 * 全ユーザー走査まで毎回行っていた）を排除するための構成。
 *
 * force-dynamic が無いとこのルートはビルド時に静的プリレンダーされ、
 * Amplify では ISR 再検証が効かないためデプロイ時点の値で凍結する
 * （日次 bake が反映されず古い統計を返し続ける）。ルート自体を毎回実行し、
 * 鮮度は内側の fetch の revalidate（1時間）に任せる。Supabase は読まないので
 * egress は増えない。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = await fetchSiteStatsSnapshot();

  if (stats) {
    return NextResponse.json(stats);
  }

  // 他 API と同様、取得失敗は success: false + 5xx で返す
  return NextResponse.json(
    {
      success: false,
      users: null,
      auth_users: null,
      active_users_7d: null,
      posts: null,
      manholes: null,
      manholes_with_photos: null,
      latest_photo_at: null,
      latest_user_at: null,
      latest_visit_at: null,
      posts_last_7d: null,
      posts_last_30d: null,
      manhole_comments: null,
      public_posts: null,
      private_posts: null,
      error: 'Site statistics snapshot is unavailable',
      source: 'unavailable',
    },
    { status: 503 }
  );
}
