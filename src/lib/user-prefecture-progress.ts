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
  /** 制覇が成立した日(=最後の1枚を初めて訪れた日)。未制覇なら null */
  completedAt: string | null;
  manholes: PublicPrefectureManhole[];
};

/**
 * ポケモン図鑑。ポケふたは78%が1枚しか設置されていないため「コンプリート」だと
 * 1枚訪問した瞬間に達成扱いになってしまう。分母を埋める指標ではなく
 * 「何種類に会えたか」という収集数の指標として扱う。
 */
export type PublicPokedex = {
  collected: number;
  total: number;
  rate: number;
  collectedNames: string[];
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
  /** ポケふたが1枚以上設置されている都道府県数。47ではない(未設置が5県ある) */
  totalPrefectureCount: number;
  visitedManholeCount: number;
  totalManholeCount: number;
  completionRate: number;
  pokedex: PublicPokedex;
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
  bio?: string | null;
  x_url?: string | null;
  instagram_url?: string | null;
};

export const FALLBACK_DISPLAY_NAME = 'トレーナー';
/**
 * 進捗の取得に失敗したときだけ使う表示用フォールバック。
 * ポケふたは47都道府県のうち42県にしか設置されていない(群馬・山梨・広島・熊本・大分が0枚)
 */
export const FALLBACK_INSTALLED_PREFECTURE_COUNT = 42;
const UNKNOWN_PREFECTURE = '都道府県未設定';

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
  const pokemonsByManhole = new Map<number, string[]>();
  const allPokemonNames = new Set<string>();

  manholeRows.forEach((manhole) => {
    const prefecture = manhole.prefecture || UNKNOWN_PREFECTURE;
    const ids = totalIdsByPrefecture.get(prefecture) || new Set<number>();
    ids.add(manhole.id);
    totalIdsByPrefecture.set(prefecture, ids);
    const list = manholesByPrefecture.get(prefecture) || [];
    list.push(manhole);
    manholesByPrefecture.set(prefecture, list);

    const pokemons = (Array.isArray(manhole.pokemons) ? manhole.pokemons : [])
      .map((name) => name?.trim())
      .filter((name): name is string => Boolean(name));
    pokemonsByManhole.set(manhole.id, pokemons);
    pokemons.forEach((name) => allPokemonNames.add(name));
  });

  // 分母は47ではなく「ポケふたが1枚以上ある都道府県数」。
  // 未設置県(群馬・山梨・広島・熊本・大分)を含めると誰も100%に到達できない
  const totalPrefectureCount = Array.from(totalIdsByPrefecture.keys()).filter(
    (name) => name !== UNKNOWN_PREFECTURE
  ).length;
  const totalPokemonCount = allPokemonNames.size;

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
      totalPrefectureCount,
      visitedManholeCount: 0,
      totalManholeCount: manholeRows.length,
      completionRate: 0,
      pokedex: { collected: 0, total: totalPokemonCount, rate: 0, collectedNames: [] },
    };
  }

  const visitedIdsByPrefecture = new Map<string, Set<number>>();
  const latestPublicPhotoIdByManhole = new Map<number, { photoId: string; sortTime: number }>();
  // 制覇日の算出用: そのマンホールを「初めて」訪れた時刻
  const firstVisitTimeByManhole = new Map<number, number>();

  ((visits || []) as unknown as VisitProgressRow[]).forEach((visit) => {
    if (typeof visit.manhole_id !== 'number') return;
    const manhole = Array.isArray(visit.manhole) ? visit.manhole[0] : visit.manhole;
    const prefecture = manhole?.prefecture || UNKNOWN_PREFECTURE;
    const ids = visitedIdsByPrefecture.get(prefecture) || new Set<number>();
    ids.add(visit.manhole_id);
    visitedIdsByPrefecture.set(prefecture, ids);

    const visitTime = getVisitSortTime(visit);
    if (visitTime > 0) {
      const currentFirst = firstVisitTimeByManhole.get(visit.manhole_id);
      if (currentFirst === undefined || visitTime < currentFirst) {
        firstVisitTimeByManhole.set(visit.manhole_id, visitTime);
      }
    }

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
      const complete = total > 0 && visited >= total;

      // 制覇日 = 県内の各マンホールの「初回訪問日」のうち最も遅い日
      // (=最後の1枚を埋めた日)。時刻が取れない訪問は無視する
      let completedAt: string | null = null;
      if (complete) {
        let latestFirstVisit = 0;
        for (const id of totalIds) {
          const firstVisit = firstVisitTimeByManhole.get(id);
          if (firstVisit && firstVisit > latestFirstVisit) latestFirstVisit = firstVisit;
        }
        completedAt = latestFirstVisit > 0 ? new Date(latestFirstVisit).toISOString() : null;
      }

      return {
        name,
        total,
        visited,
        remaining: Math.max(total - visited, 0),
        rate,
        complete,
        completedAt,
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
  const validVisitedManholeIds = Array.from(visitedManholeIds).filter((id) =>
    allManholeIds.has(id)
  );
  const validVisitedManholeCount = validVisitedManholeIds.length;

  const collectedPokemonNames = new Set<string>();
  validVisitedManholeIds.forEach((id) => {
    (pokemonsByManhole.get(id) || []).forEach((name) => collectedPokemonNames.add(name));
  });

  return {
    userId: trimmedUserId,
    displayName,
    prefectures,
    completedPrefectureCount,
    totalPrefectureCount,
    visitedManholeCount: validVisitedManholeCount,
    totalManholeCount,
    completionRate: toRate(validVisitedManholeCount, totalManholeCount),
    pokedex: {
      collected: collectedPokemonNames.size,
      total: totalPokemonCount,
      rate: toRate(collectedPokemonNames.size, totalPokemonCount),
      collectedNames: Array.from(collectedPokemonNames).sort((a, b) => a.localeCompare(b, 'ja')),
    },
  };
}

export const loadPublicUserPrefectureProgress = cache(loadPublicUserPrefectureProgressImpl);
