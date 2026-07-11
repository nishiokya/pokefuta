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
  totalVisits: number;
  prefectureCount: number;
  visits: PublicVisit[];
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
  const { data: visits, error: visitsError } = await supabase
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
    .limit(VISIT_LIMIT);

  if (visitsError) {
    throw new Error(visitsError.message);
  }

  const visitRows = ((visits || []) as unknown as VisitPublicRow[]);

  const prefectureSet = new Set<string>();
  const publicVisits: PublicVisit[] = visitRows.map((visit) => {
    const manhole = Array.isArray(visit.manhole) ? visit.manhole[0] : visit.manhole;
    if (manhole?.prefecture) {
      prefectureSet.add(manhole.prefecture);
    }
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

  return {
    userId: trimmedUserId,
    displayName,
    totalVisits: publicVisits.length,
    prefectureCount: prefectureSet.size,
    visits: publicVisits,
  };
}

export const loadPublicUserVisits = cache(loadPublicUserVisitsImpl);
