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

export async function GET() {
  try {
    const routeClient = createRouteHandlerClient<Database>({ cookies });

    // Prefer RPC to avoid RLS issues (works for anon/auth when DB migration is applied)
    const { data: rpcData, error: rpcError } = await routeClient.rpc('get_site_stats');

    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as Partial<SiteStatsRow> | null;

    if (!rpcError && row) {
      const admin = supabaseAdmin as unknown as SupabaseClient<Database> | null;
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

      return NextResponse.json({
        success: true,
        users: toCount(row.total_users),
        posts: toCount(row.total_posts),
        manholes: toCount(row.total_manhole),
        manholes_with_photos: manholesWithPhotos,
        source: 'rpc',
      });
    }

    // Fallback (requires service role)
    const admin = supabaseAdmin as unknown as SupabaseClient<Database> | null;
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

      return NextResponse.json({
        success: true,
        users: userCount ?? 0,
        posts: postCount ?? 0,
        manholes: manholeCount ?? 0,
        manholes_with_photos: new Set(
          (photoManholes as Array<{ manhole_id: number | null }> | null)?.map(photo => photo.manhole_id) || []
        ).size,
        source: 'admin',
      });
    }

    return NextResponse.json({
      success: true,
      users: null,
      posts: null,
      manholes: null,
      manholes_with_photos: null,
      source: 'unavailable',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        users: null,
        posts: null,
        manholes: null,
        manholes_with_photos: null,
        error: 'Failed to get site statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
