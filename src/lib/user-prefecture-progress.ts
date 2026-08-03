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
  /** 現時点で全枚数を訪問済みか */
  complete: boolean;
  /**
   * 過去に一度でも制覇が成立した日。成立後にポケふたが追加されても null に戻さない。
   * 「制覇したのに新設で剥奪される」と自慢の逆になるため、達成は履歴として保持する
   */
  earnedAt: string | null;
  /** 制覇成立時点でのその県の設置枚数。成立後に増えた分は含まない */
  earnedTotal: number;
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
  created_at: string | null;
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

/**
 * 「その時点で存在していたポケふたを全て訪問済みだった瞬間」があったかを判定し、
 * 最初にそれが成立した日時と、その時点の設置枚数を返す。
 *
 * 現在の枚数と訪問数を比べるだけだと、制覇後にポケふたが新設された県で
 * 制覇の事実そのものが消えてしまう(実際に初回一括投入422件のあと60件が追加されている)。
 * 制覇は履歴上の出来事なので、カタログの追加時刻(manhole.created_at)と
 * 各マンホールの初回訪問時刻から遡って復元する。
 *
 * 制覇が成立しうるのは訪問した瞬間だけなので、候補時刻は初回訪問時刻に限ってよい。
 */
function findEarnedCompletion(
  manholes: ManholeProgressRow[],
  firstVisitTimeByManhole: Map<number, number>,
  catalogBaselineTime: number
): { earnedAt: string | null; earnedTotal: number } {
  if (manholes.length === 0) return { earnedAt: null, earnedTotal: 0 };

  const createdTimes = manholes.map((manhole) => {
    const time = new Date(manhole.created_at || 0).getTime();
    // created_at が欠けている行は「最初から存在していた」とみなす
    if (Number.isNaN(time) || time <= 0) return 0;
    // 一括投入分の created_at は「DBに入れた日」であって設置日ではない。
    // これを設置時刻として扱うと、投入日より前に訪問していたユーザーが
    // 「当時0枚」と判定されて制覇を失うため、ベースライン以前は常に存在した扱いにする
    return time <= catalogBaselineTime ? 0 : time;
  });

  const visitTimes = manholes
    .map((manhole) => firstVisitTimeByManhole.get(manhole.id))
    .filter((time): time is number => typeof time === 'number' && time > 0)
    .sort((a, b) => a - b);

  if (visitTimes.length === 0) return { earnedAt: null, earnedTotal: 0 };

  for (const candidate of visitTimes) {
    let existing = 0;
    let visitedExisting = 0;
    manholes.forEach((manhole, index) => {
      if (createdTimes[index] > candidate) return;
      existing++;
      const visitedAt = firstVisitTimeByManhole.get(manhole.id);
      if (visitedAt && visitedAt <= candidate) visitedExisting++;
    });

    if (existing > 0 && visitedExisting >= existing) {
      return { earnedAt: new Date(candidate).toISOString(), earnedTotal: existing };
    }
  }

  return { earnedAt: null, earnedTotal: 0 };
}

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
        .select('id, title, prefecture, municipality, pokemons, created_at')
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
  // カタログ一括投入のタイムスタンプ。これ以前に作られた行は「元から存在した」扱いにする
  const catalogBaselineTime = manholeRows.reduce((min, manhole) => {
    const time = new Date(manhole.created_at || 0).getTime();
    if (Number.isNaN(time) || time <= 0) return min;
    return time < min ? time : min;
  }, Number.POSITIVE_INFINITY);

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

      const { earnedAt, earnedTotal } = findEarnedCompletion(
        manholesByPrefecture.get(name) || [],
        firstVisitTimeByManhole,
        catalogBaselineTime
      );

      return {
        name,
        total,
        visited,
        remaining: Math.max(total - visited, 0),
        rate,
        complete,
        earnedAt,
        earnedTotal,
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
      // バッジ棚は「獲得済みか」で並ぶ。新設で現在は未達でも、獲得済みは前に出す
      const aEarned = a.earnedAt ? 1 : 0;
      const bEarned = b.earnedAt ? 1 : 0;
      if (bEarned !== aEarned) return bEarned - aEarned;
      if (b.rate !== a.rate) return b.rate - a.rate;
      if (b.visited !== a.visited) return b.visited - a.visited;
      return a.name.localeCompare(b.name, 'ja');
    });

  // 棚に並ぶバッジ枚数と一致させるため、現在の達成状況ではなく獲得済みで数える
  const completedPrefectureCount = prefectures.filter((prefecture) => prefecture.earnedAt).length;
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
