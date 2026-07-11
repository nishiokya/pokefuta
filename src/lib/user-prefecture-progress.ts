import 'server-only';
import { cache } from 'react';
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
  manholes: PublicPrefectureManhole[];
};

export type PublicPrefectureManhole = {
  id: number;
  title: string;
  prefecture: string;
  municipality: string | null;
  pokemons: string[];
  visited: boolean;
  latestPublicPhotoId: string | null;
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
  title: string | null;
  municipality: string | null;
  pokemons: string[] | null;
};

type VisitProgressRow = {
  manhole_id: number | null;
  shot_at: string | null;
  created_at: string | null;
  manhole?: {
    prefecture: string | null;
  } | Array<{
    prefecture: string | null;
  }> | null;
  photos?: Array<{
    id: string;
    created_at: string | null;
  }> | null;
};

export type AppUserProgressRow = {
  auth_uid: string;
  display_name: string | null;
};

export const FALLBACK_DISPLAY_NAME = 'トレーナー';
const JAPAN_PREFECTURE_COUNT = 47;

const toRate = (visited: number, total: number) => (total > 0 ? (visited / total) * 100 : 0);

const getVisitSortTime = (visit: Pick<VisitProgressRow, 'shot_at' | 'created_at'>) =>
  new Date(visit.shot_at || visit.created_at || 0).getTime();

export function createPublicReadClient(): SupabaseClient<Database> | null {
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

export function getProgressClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const hasUsableServiceRoleKey =
    serviceRoleKey.length > 100 && !serviceRoleKey.toLowerCase().includes('placeholder');

  return hasUsableServiceRoleKey ? supabaseAdmin : createPublicReadClient();
}

async function loadPublicUserPrefectureProgressImpl(
  userId: string
): Promise<PublicUserPrefectureProgress | null> {
  const supabase = getProgressClient();

  if (!supabase) {
    throw new Error('Supabase client is not configured');
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return null;

  const [userInfoResult, { data: manholes, error: manholesError }] =
    await Promise.all([
      supabase.rpc('get_public_user_info' as never, { p_user_id: trimmedUserId } as never),
      supabase
        .from('manhole')
        .select('id, title, prefecture, municipality, pokemons')
        .order('prefecture', { ascending: true })
        .order('municipality', { ascending: true })
        .order('id', { ascending: true }),
    ]);

  if (userInfoResult.error) {
    throw new Error(userInfoResult.error.message);
  }

  const appUserRow = (userInfoResult.data as AppUserProgressRow[] | null)?.[0] ?? null;
  if (!appUserRow) {
    return null;
  }

  if (manholesError) {
    throw new Error(manholesError.message);
  }

  const manholeRows = (manholes || []) as ManholeProgressRow[];
  const totalIdsByPrefecture = new Map<string, Set<number>>();
  const manholesByPrefecture = new Map<string, ManholeProgressRow[]>();

  manholeRows.forEach((manhole) => {
    const prefecture = manhole.prefecture || '都道府県未設定';
    const ids = totalIdsByPrefecture.get(prefecture) || new Set<number>();
    ids.add(manhole.id);
    totalIdsByPrefecture.set(prefecture, ids);
    const list = manholesByPrefecture.get(prefecture) || [];
    list.push(manhole);
    manholesByPrefecture.set(prefecture, list);
  });

  const displayName = appUserRow.display_name || FALLBACK_DISPLAY_NAME;

  const { data: visits, error: visitsError } = await supabase
    .from('visit')
    .select(`
      manhole_id,
      shot_at,
      created_at,
      manhole:manhole_id (
        prefecture
      ),
      photos:photo (
        id,
        created_at
      )
    `)
    .eq('user_id', appUserRow.auth_uid)
    .eq('is_public', true)
    .not('manhole_id', 'is', null);

  if (visitsError) {
    throw new Error(visitsError.message);
  }

  if (!visits || visits.length === 0) {
    return {
      userId: trimmedUserId,
      displayName,
      prefectures: [],
      completedPrefectureCount: 0,
      totalPrefectureCount: JAPAN_PREFECTURE_COUNT,
      visitedManholeCount: 0,
      totalManholeCount: manholeRows.length,
      completionRate: 0,
    };
  }

  const visitedIdsByPrefecture = new Map<string, Set<number>>();
  const latestPublicPhotoIdByManhole = new Map<number, { photoId: string; sortTime: number }>();

  ((visits || []) as unknown as VisitProgressRow[]).forEach((visit) => {
    if (typeof visit.manhole_id !== 'number') return;
    const manhole = Array.isArray(visit.manhole) ? visit.manhole[0] : visit.manhole;
    const prefecture = manhole?.prefecture || '都道府県未設定';
    const ids = visitedIdsByPrefecture.get(prefecture) || new Set<number>();
    ids.add(visit.manhole_id);
    visitedIdsByPrefecture.set(prefecture, ids);

    const photos = Array.isArray(visit.photos) ? visit.photos : [];
    const latestPhoto = photos
      .filter((photo) => photo.id)
      .sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      })[0];

    if (latestPhoto) {
      const sortTime = Math.max(
        getVisitSortTime(visit),
        new Date(latestPhoto.created_at || 0).getTime()
      );
      const current = latestPublicPhotoIdByManhole.get(visit.manhole_id);
      if (!current || sortTime > current.sortTime) {
        latestPublicPhotoIdByManhole.set(visit.manhole_id, {
          photoId: latestPhoto.id,
          sortTime,
        });
      }
    }
  });

  const prefectures = Array.from(totalIdsByPrefecture.entries())
    .map(([name, totalIds]) => {
      const visitedSet = visitedIdsByPrefecture.get(name);
      let visited = 0;
      if (visitedSet) {
        for (const id of visitedSet) {
          if (totalIds.has(id)) visited++;
        }
      }
      const total = totalIds.size;
      const rate = toRate(visited, total);

      return {
        name,
        total,
        visited,
        remaining: Math.max(total - visited, 0),
        rate,
        complete: total > 0 && visited >= total,
        manholes: (manholesByPrefecture.get(name) || [])
          .map((manhole) => ({
            id: manhole.id,
            title: manhole.title || `${name}${manhole.municipality || ''}`,
            prefecture: name,
            municipality: manhole.municipality,
            pokemons: Array.isArray(manhole.pokemons) ? manhole.pokemons : [],
            visited: visitedSet?.has(manhole.id) ?? false,
            latestPublicPhotoId: latestPublicPhotoIdByManhole.get(manhole.id)?.photoId || null,
          }))
          .sort((a, b) => {
            if (Number(b.visited) !== Number(a.visited)) return Number(b.visited) - Number(a.visited);
            return a.id - b.id;
          }),
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
    displayName,
    prefectures,
    completedPrefectureCount,
    totalPrefectureCount: JAPAN_PREFECTURE_COUNT,
    visitedManholeCount: validVisitedManholeCount,
    totalManholeCount,
    completionRate: toRate(validVisitedManholeCount, totalManholeCount),
  };
}

export const loadPublicUserPrefectureProgress = cache(loadPublicUserPrefectureProgressImpl);
