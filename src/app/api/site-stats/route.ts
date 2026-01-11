import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';
import { supabaseAdmin } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

type SiteStatsRow = {
  total_manhole: number | string | null;
  total_posts: number | string | null;
  total_users: number | string | null;
};

export async function GET() {
  try {
    const routeClient = createRouteHandlerClient<Database>({ cookies });

    // Prefer RPC to avoid RLS issues (works for anon/auth when DB migration is applied)
    const { data: rpcData, error: rpcError } = await routeClient.rpc('get_site_stats');

    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as Partial<SiteStatsRow> | null;

    if (!rpcError && row) {
      return NextResponse.json({
        success: true,
        users: typeof row.total_users === 'number' ? row.total_users : Number(row.total_users ?? 0),
        posts: typeof row.total_posts === 'number' ? row.total_posts : Number(row.total_posts ?? 0),
        manholes: typeof row.total_manhole === 'number' ? row.total_manhole : Number(row.total_manhole ?? 0),
        source: 'rpc',
      });
    }

    // Fallback (requires service role)
    const admin = supabaseAdmin as unknown as SupabaseClient<Database> | null;
    if (admin) {
      const [{ count: userCount }, { count: postCount }] = await Promise.all([
        admin.from('app_user').select('id', { head: true, count: 'exact' }),
        admin.from('photo').select('id', { head: true, count: 'exact' }),
      ]);

      return NextResponse.json({
        success: true,
        users: userCount ?? 0,
        posts: postCount ?? 0,
        source: 'admin',
      });
    }

    return NextResponse.json({
      success: true,
      users: null,
      posts: null,
      source: 'unavailable',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        users: null,
        posts: null,
        error: 'Failed to get site statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
