import { NextResponse } from 'next/server';
import { fetchSiteStatsSnapshot } from '@/lib/manhole-snapshot';

/**
 * サイト統計。
 *
 * data.pokefuta.com の静的スナップショット（bake-app-data.yml が日次生成）を
 * そのまま返す。リクエスト毎の Supabase 読み出し（旧実装では auth admin API の
 * 全ユーザー走査まで毎回行っていた）を排除するための構成。
 */
export async function GET() {
  const stats = await fetchSiteStatsSnapshot();

  if (stats) {
    return NextResponse.json(stats);
  }

  return NextResponse.json({
    success: true,
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
    source: 'unavailable',
  });
}
