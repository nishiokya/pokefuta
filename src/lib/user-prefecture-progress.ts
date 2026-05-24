import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/client';
import type { Database } from '@/types/database';

export type PublicPrefectureProgress = {
  name: string;
  total: number;
  visited: number;
  remaining: number;
  rate: number;
  complete: boolean;
};

export type PublicUserPrefectureProgress = {
  userId: string;
  displayName: string;
  prefectures: PublicPrefectureProgress[];
  completedPrefectureCount: number;
  totalPrefectureCount: number;
  visitedManholeCount: number;
  totalManholeCount: number;
  completionRate: number;
};

type ManholeProgressRow = {
  id: number;
  prefecture: string | null;
};

type VisitProgressRow = {
  manhole_id: number | null;
  manhole?: {
    prefecture: string | null;
  } | Array<{
    prefecture: string | null;
  }> | null;
};

type AppUserProgressRow = {
  display_name: string | null;
};

const FALLBACK_DISPLAY_NAME = 'トレーナー';

const toRate = (visited: number, total: number) => (total > 0 ? (visited / total) * 100 : 0);

function createPublicReadClient(): SupabaseClient<Database> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) return null;

  return createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getProgressClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const hasUsableServiceRoleKey =
    serviceRoleKey.length > 100 && !serviceRoleKey.toLowerCase().includes('placeholder');

  return hasUsableServiceRoleKey ? supabaseAdmin : createPublicReadClient();
}

export async function loadPublicUserPrefectureProgress(
  userId: string
): Promise<PublicUserPrefectureProgress | null> {
  const supabase = getProgressClient();

  if (!supabase) {
    throw new Error('Supabase client is not configured');
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return null;

  const [{ data: appUser, error: appUserError }, { data: manholes, error: manholesError }] =
    await Promise.all([
      supabase
        .from('app_user')
        .select('auth_uid, display_name')
        .eq('auth_uid', trimmedUserId)
        .maybeSingle(),
      supabase
        .from('manhole')
        .select('id, prefecture')
        .order('prefecture', { ascending: true }),
    ]);

  if (appUserError) {
    throw new Error(appUserError.message);
  }

  if (!appUser) {
    return null;
  }

  const appUserRow = appUser as unknown as AppUserProgressRow;

  if (manholesError) {
    throw new Error(manholesError.message);
  }

  const manholeRows = (manholes || []) as ManholeProgressRow[];
  const totalIdsByPrefecture = new Map<string, Set<number>>();

  manholeRows.forEach((manhole) => {
    const prefecture = manhole.prefecture || '都道府県未設定';
    const ids = totalIdsByPrefecture.get(prefecture) || new Set<number>();
    ids.add(manhole.id);
    totalIdsByPrefecture.set(prefecture, ids);
  });

  const { data: visits, error: visitsError } = await supabase
    .from('visit')
    .select(`
      manhole_id,
      manhole:manhole_id (
        prefecture
      )
    `)
    .eq('user_id', trimmedUserId)
    .eq('is_public', true)
    .not('manhole_id', 'is', null);

  if (visitsError) {
    throw new Error(visitsError.message);
  }

  const visitedIdsByPrefecture = new Map<string, Set<number>>();

  ((visits || []) as unknown as VisitProgressRow[]).forEach((visit) => {
    if (typeof visit.manhole_id !== 'number') return;
    const manhole = Array.isArray(visit.manhole) ? visit.manhole[0] : visit.manhole;
    const prefecture = manhole?.prefecture || '都道府県未設定';
    const ids = visitedIdsByPrefecture.get(prefecture) || new Set<number>();
    ids.add(visit.manhole_id);
    visitedIdsByPrefecture.set(prefecture, ids);
  });

  const prefectures = Array.from(totalIdsByPrefecture.entries())
    .map(([name, totalIds]) => {
      const total = totalIds.size;
      const visited = Array.from(visitedIdsByPrefecture.get(name) || []).filter((id) =>
        totalIds.has(id)
      ).length;
      const rate = toRate(visited, total);

      return {
        name,
        total,
        visited,
        remaining: Math.max(total - visited, 0),
        rate,
        complete: total > 0 && visited >= total,
      };
    })
    .sort((a, b) => {
      if (Number(b.complete) !== Number(a.complete)) return Number(b.complete) - Number(a.complete);
      if (b.rate !== a.rate) return b.rate - a.rate;
      if (b.visited !== a.visited) return b.visited - a.visited;
      return a.name.localeCompare(b.name, 'ja');
    });

  const completedPrefectureCount = prefectures.filter((prefecture) => prefecture.complete).length;
  const totalManholeCount = manholeRows.length;
  const allManholeIds = new Set(manholeRows.map((manhole) => manhole.id));
  const visitedManholeIds = new Set(
    Array.from(visitedIdsByPrefecture.values()).flatMap((ids) => Array.from(ids))
  );
  const validVisitedManholeCount = Array.from(visitedManholeIds).filter((id) =>
    allManholeIds.has(id)
  ).length;

  return {
    userId: trimmedUserId,
    displayName: appUserRow.display_name || FALLBACK_DISPLAY_NAME,
    prefectures,
    completedPrefectureCount,
    totalPrefectureCount: prefectures.filter((prefecture) => prefecture.total > 0).length,
    visitedManholeCount: validVisitedManholeCount,
    totalManholeCount,
    completionRate: toRate(validVisitedManholeCount, totalManholeCount),
  };
}
