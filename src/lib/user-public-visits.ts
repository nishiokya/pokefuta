import 'server-only';
import { cache } from 'react';
import {
  AppUserProgressRow,
  FALLBACK_DISPLAY_NAME,
  getProgressClient,
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
  totalVisits: number;
  prefectureCount: number;
  visits: PublicVisit[];
  isTruncated: boolean;
};

type VisitPublicRow = {
  id: string;
  manhole_id: number | null;
  shot_at: string | null;
  comment: string | null;
  created_at: string | null;
  manhole?: {
    id: number;
    title: string | null;
    prefecture: string | null;
    municipality: string | null;
    pokemons: string[] | null;
  } | Array<{
    id: number;
    title: string | null;
    prefecture: string | null;
    municipality: string | null;
    pokemons: string[] | null;
  }> | null;
  photos?: Array<{ id: string }> | null;
};

const VISIT_LIMIT = 500;
// prefectureCount 集計用: カード一覧よりゆるい上限で全件に近い形を見る（写真joinなし・軽量）
const PREFECTURE_SCAN_LIMIT = 2000;

type PrefectureScanRow = {
  manhole?: { prefecture: string | null } | Array<{ prefecture: string | null }> | null;
};

async function loadPublicUserVisitsImpl(userId: string): Promise<PublicUserVisits | null> {
  const supabase = getProgressClient();

  if (!supabase) {
    throw new Error('Supabase client is not configured');
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return null;

  const { data: userInfo, error: userInfoError } = await supabase.rpc(
    'get_public_user_info' as never,
    { p_user_id: trimmedUserId } as never
  );

  if (userInfoError) {
    throw new Error(userInfoError.message);
  }

  const appUserRow = (userInfo as AppUserProgressRow[] | null)?.[0] ?? null;
  if (!appUserRow) {
    return null;
  }

  const displayName = appUserRow.display_name || FALLBACK_DISPLAY_NAME;

  // NOTE: note カラムは非公開情報のため絶対にSELECTしない
  // カード一覧(500件上限)・正確な総数(head count)・都道府県数集計(写真joinなしの軽量スキャン)を並列取得。
  // 500件上限だけで totalVisits/prefectureCount を計算すると、公開訪問が500件を超える
  // ユーザーで数値が実態より小さく出てしまうため、別クエリで正確な値を出す。
  const [
    { data: visits, error: visitsError },
    { count: totalCount, error: totalCountError },
    { data: prefectureRows, error: prefectureScanError },
  ] = await Promise.all([
    supabase
      .from('visit')
      .select(`
        id,
        manhole_id,
        shot_at,
        comment,
        created_at,
        manhole:manhole_id (
          id,
          title,
          prefecture,
          municipality,
          pokemons
        ),
        photos:photo (
          id
        )
      `)
      .eq('user_id', appUserRow.auth_uid)
      .eq('is_public', true)
      .order('shot_at', { ascending: false })
      .limit(VISIT_LIMIT)
      // select 側のエイリアス(photos:photo)に対する modifier は
      // PostgREST 上ではエイリアス名で参照する（テーブル実名の 'photo' ではない）
      .limit(1, { referencedTable: 'photos' }),
    supabase
      .from('visit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', appUserRow.auth_uid)
      .eq('is_public', true),
    supabase
      .from('visit')
      .select(`
        manhole:manhole_id (
          prefecture
        )
      `)
      .eq('user_id', appUserRow.auth_uid)
      .eq('is_public', true)
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
    const manhole = Array.isArray(row.manhole) ? row.manhole[0] : row.manhole;
    if (manhole?.prefecture) {
      prefectureSet.add(manhole.prefecture);
    }
  });

  const publicVisits: PublicVisit[] = visitRows.map((visit) => {
    const manhole = Array.isArray(visit.manhole) ? visit.manhole[0] : visit.manhole;
    const photos = Array.isArray(visit.photos) ? visit.photos : [];

    return {
      id: visit.id,
      manholeId: visit.manhole_id,
      shotAt: visit.shot_at,
      comment: visit.comment,
      createdAt: visit.created_at,
      manhole: manhole
        ? {
            id: manhole.id,
            title: manhole.title,
            prefecture: manhole.prefecture,
            municipality: manhole.municipality,
            pokemons: Array.isArray(manhole.pokemons) ? manhole.pokemons : [],
          }
        : null,
      photoIds: photos.map((photo) => photo.id).filter(Boolean),
    };
  });

  const totalVisits = totalCount ?? publicVisits.length;

  return {
    userId: trimmedUserId,
    displayName,
    bio: appUserRow.bio || null,
    xUrl: appUserRow.x_url || null,
    instagramUrl: appUserRow.instagram_url || null,
    totalVisits,
    prefectureCount: prefectureSet.size,
    visits: publicVisits,
    isTruncated: totalVisits > publicVisits.length,
  };
}

export const loadPublicUserVisits = cache(loadPublicUserVisitsImpl);
