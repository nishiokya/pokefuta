import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { supabaseAdmin } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

type SiteStatsRow = {
  total_manhole: number | string | null;
  total_manholes_with_photos?: number | string | null;
  total_posts: number | string | null;
  total_users: number | string | null;
};

const toCount = (value: number | string | null | undefined) =>
  typeof value === 'number' ? value : Number(value ?? 0);

async function fetchActivityStats(admin: SupabaseClient<Database>) {
  const now = new Date();
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: latestPhoto },
    { data: latestUser },
    { data: latestVisit },
    { count: posts7d },
    { count: posts30d },
  ] = await Promise.all([
    admin.from('photo').select('created_at').order('created_at', { ascending: false }).limit(1),
    admin.from('app_user').select('created_at').order('created_at', { ascending: false }).limit(1),
    admin.from('visit').select('shot_at').order('shot_at', { ascending: false }).limit(1),
    admin.from('photo').select('id', { head: true, count: 'exact' }).gte('created_at', ago7d),
    admin.from('photo').select('id', { head: true, count: 'exact' }).gte('created_at', ago30d),
  ]);

  // auth.users の総件数 + 直近7日ログイン数を Admin Auth REST API から取得
  let auth_users: number | null = null;
  let active_users_7d: number | null = null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceRoleKey) {
    try {
      const ago7dDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const perPage = 1000;
      let page = 1;
      let activeCount = 0;
      let totalAuthUsers: number | null = null;

      while (true) {
        const res = await fetch(
          `${supabaseUrl}/auth/v1/admin/users?per_page=${perPage}&page=${page}`,
          { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
        );
        if (!res.ok) break;

        if (page === 1) {
          const totalCount = res.headers.get('x-total-count');
          totalAuthUsers = totalCount !== null ? parseInt(totalCount, 10) : null;
        }

        const json = await res.json();
        const users: Array<{ last_sign_in_at?: string | null }> = json.users ?? [];
        activeCount += users.filter(
          (u) => u.last_sign_in_at && new Date(u.last_sign_in_at) >= ago7dDate
        ).length;

        if (users.length < perPage) break;
        page++;
      }

      auth_users = totalAuthUsers;
      active_users_7d = activeCount;
    } catch {
      // non-critical
    }
  }

  return {
    latest_photo_at: (latestPhoto as Array<{ created_at: string }> | null)?.[0]?.created_at ?? null,
    latest_user_at: (latestUser as Array<{ created_at: string }> | null)?.[0]?.created_at ?? null,
    latest_visit_at: (latestVisit as Array<{ shot_at: string }> | null)?.[0]?.shot_at ?? null,
    posts_last_7d: posts7d ?? 0,
    posts_last_30d: posts30d ?? 0,
    auth_users,
    active_users_7d,
  };
}

export async function GET() {
  try {
    const routeClient = createRouteHandlerClient<Database>({ cookies });

    // Prefer RPC to avoid RLS issues (works for anon/auth when DB migration is applied)
    const { data: rpcData, error: rpcError } = await routeClient.rpc('get_site_stats');

    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as Partial<SiteStatsRow> | null;

    const admin = supabaseAdmin as unknown as SupabaseClient<Database> | null;

    if (!rpcError && row) {
      let manholesWithPhotos = toCount(row.total_manholes_with_photos);

      if (row.total_manholes_with_photos == null && admin) {
        const { data: photoManholes } = await admin
          .from('photo')
          .select('manhole_id')
          .not('manhole_id', 'is', null);

        manholesWithPhotos = new Set(
          (photoManholes as Array<{ manhole_id: number | null }> | null)?.map(photo => photo.manhole_id) || []
        ).size;
      }

      const activity = admin ? await fetchActivityStats(admin) : null;

      return NextResponse.json({
        success: true,
        users: toCount(row.total_users),
        posts: toCount(row.total_posts),
        manholes: toCount(row.total_manhole),
        manholes_with_photos: manholesWithPhotos,
        ...(activity ?? {}),
        source: 'rpc',
      });
    }

    // Fallback (requires service role)
    if (admin) {
      const [
        { count: userCount },
        { count: postCount },
        { count: manholeCount },
        { data: photoManholes },
      ] = await Promise.all([
        admin.from('app_user').select('id', { head: true, count: 'exact' }),
        admin.from('photo').select('id', { head: true, count: 'exact' }),
        admin.from('manhole').select('id', { head: true, count: 'exact' }),
        admin.from('photo').select('manhole_id').not('manhole_id', 'is', null),
      ]);

      const activity = await fetchActivityStats(admin);

      return NextResponse.json({
        success: true,
        users: userCount ?? 0,
        posts: postCount ?? 0,
        manholes: manholeCount ?? 0,
        manholes_with_photos: new Set(
          (photoManholes as Array<{ manhole_id: number | null }> | null)?.map(photo => photo.manhole_id) || []
        ).size,
        ...activity,
        source: 'admin',
      });
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
      source: 'unavailable',
    });
  } catch (error: unknown) {
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
        error: 'Failed to get site statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
