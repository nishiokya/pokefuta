import 'server-only';
import { cache } from 'react';
import {
  FALLBACK_DISPLAY_NAME,
  getPublicCatalogClient,
  getPublicProfileClient,
  type PublicProfileRow,
} from '@/lib/user-prefecture-progress';

export type PublicVisitManhole = {
  id: number;
  title: string | null;
  prefecture: string | null;
  municipality: string | null;
  pokemons: string[];
};

export type PublicVisit = {
  id: string;
  manholeId: number | null;
  shotAt: string | null;
  comment: string | null;
  createdAt: string | null;
  manhole: PublicVisitManhole | null;
  photoIds: string[];
};

export type PublicUserVisits = {
  userId: string;
  displayName: string;
  bio: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
  // 募集スイッチが OFF のユーザーでは常に null。出し分けは get_public_user_info() 側で行う
  pokemonGoFriendCode: string | null;
  pokemonGoFriendNote: string | null;
  totalVisits: number;
  prefectureCount: number;
  visits: PublicVisit[];
  isTruncated: boolean;
};

/** public_user_visit_card の行。ビューは平坦なので埋め込みの配列/オブジェクト分岐が要らない */
type VisitPublicRow = {
  id: string;
  manhole_id: number | null;
  shot_at: string | null;
  comment: string | null;
  created_at: string | null;
  manhole_title: string | null;
  manhole_prefecture: string | null;
  manhole_municipality: string | null;
  manhole_pokemons: string[] | null;
  latest_photo_id: string | null;
};

const VISIT_LIMIT = 500;
// prefectureCount 集計用: カード一覧よりゆるい上限で全件に近い形を見る（写真joinなし・軽量）
const PREFECTURE_SCAN_LIMIT = 2000;

type PrefectureScanRow = {
  manhole_prefecture: string | null;
};

async function loadPublicUserVisitsImpl(userId: string): Promise<PublicUserVisits | null> {
  // プロフィールは常に取り直し、一覧・集計はキャッシュに載せる（§キャッシュ戦略）
  const profileClient = getPublicProfileClient();
  const listClient = getPublicCatalogClient();

  if (!profileClient || !listClient) {
    throw new Error('Supabase client is not configured');
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return null;

  const { data: userInfo, error: userInfoError } = await profileClient.rpc(
    'get_public_profile' as never,
    { p_user_id: trimmedUserId } as never
  );

  if (userInfoError) {
    throw new Error(userInfoError.message);
  }

  const appUserRow = (userInfo as PublicProfileRow[] | null)?.[0] ?? null;
  if (!appUserRow) {
    return null;
  }

  const displayName = appUserRow.display_name || FALLBACK_DISPLAY_NAME;

  // 公開IDで直接引く。auth_uid は使わない。
  // note / shot_location はビューの列に無いので、うっかり選ぶこと自体ができない。
  //
  // カード一覧(500件上限)・正確な総数(head count)・都道府県数集計を並列取得。
  // 500件上限だけで totalVisits/prefectureCount を計算すると、公開訪問が500件を超える
  // ユーザーで数値が実態より小さく出てしまうため、別クエリで正確な値を出す。
  //
  // 集計2本が base（写真を含まないビュー）なのは性能ではなく保証のため。
  // 最新写真の相関サブクエリが列として存在しなければ、集計時に実行されようがない。
  const [
    { data: visits, error: visitsError },
    { count: totalCount, error: totalCountError },
    { data: prefectureRows, error: prefectureScanError },
  ] = await Promise.all([
    listClient
      .from('public_user_visit_card')
      .select(
        'id, manhole_id, shot_at, comment, created_at,' +
        ' manhole_title, manhole_prefecture, manhole_municipality, manhole_pokemons,' +
        ' latest_photo_id'
      )
      .eq('public_user_id', trimmedUserId)
      .order('shot_at', { ascending: false })
      .limit(VISIT_LIMIT),
    listClient
      .from('public_user_visit_base')
      .select('id', { count: 'exact', head: true })
      .eq('public_user_id', trimmedUserId),
    listClient
      .from('public_user_visit_base')
      .select('manhole_prefecture')
      .eq('public_user_id', trimmedUserId)
      .limit(PREFECTURE_SCAN_LIMIT),
  ]);

  if (visitsError) {
    throw new Error(visitsError.message);
  }
  if (totalCountError) {
    throw new Error(totalCountError.message);
  }
  if (prefectureScanError) {
    throw new Error(prefectureScanError.message);
  }

  const visitRows = ((visits || []) as unknown as VisitPublicRow[]);

  const prefectureSet = new Set<string>();
  ((prefectureRows || []) as unknown as PrefectureScanRow[]).forEach((row) => {
    if (row.manhole_prefecture) {
      prefectureSet.add(row.manhole_prefecture);
    }
  });

  const publicVisits: PublicVisit[] = visitRows.map((visit) => ({
    id: visit.id,
    manholeId: visit.manhole_id,
    shotAt: visit.shot_at,
    comment: visit.comment,
    createdAt: visit.created_at,
    // manhole_id が無い訪問はビューでも LEFT JOIN なので全列 null になる
    manhole: visit.manhole_id === null
      ? null
      : {
          id: visit.manhole_id,
          title: visit.manhole_title,
          prefecture: visit.manhole_prefecture,
          municipality: visit.manhole_municipality,
          pokemons: Array.isArray(visit.manhole_pokemons) ? visit.manhole_pokemons : [],
        },
    photoIds: visit.latest_photo_id ? [visit.latest_photo_id] : [],
  }));

  const totalVisits = totalCount ?? publicVisits.length;

  return {
    userId: trimmedUserId,
    displayName,
    bio: appUserRow.bio || null,
    xUrl: appUserRow.x_url || null,
    instagramUrl: appUserRow.instagram_url || null,
    pokemonGoFriendCode: appUserRow.pokemon_go_friend_code || null,
    pokemonGoFriendNote: appUserRow.pokemon_go_friend_note || null,
    totalVisits,
    prefectureCount: prefectureSet.size,
    visits: publicVisits,
    isTruncated: totalVisits > publicVisits.length,
  };
}

export const loadPublicUserVisits = cache(loadPublicUserVisitsImpl);
