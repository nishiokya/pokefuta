import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { storage } from '@/lib/storage';
import type { Database, ManholeTitle } from '@/types/database';

export type SharedPhoto = {
  id: string;
  storage_key: string;
  content_type: string;
  created_at: string;
  signed_url?: string;
  visit: {
    id: string;
    user_id: string;
    shot_at: string;
    comment: string | null;
    is_public: boolean;
  };
  manhole: {
    id: number;
    title: string;
    prefecture: string;
    municipality: string | null;
    pokemons: string[];
    titles: ManholeTitle[];
    hashtags: string[];
  };
};

function createShareSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSortedTitles(titles?: ManholeTitle[] | null): ManholeTitle[] {
  return [...(Array.isArray(titles) ? titles : [])].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );
}

export function getManholeLocationLabel(manhole: Pick<SharedPhoto['manhole'], 'prefecture' | 'municipality'>) {
  return `${manhole.prefecture}${manhole.municipality || ''}`;
}

export async function loadPublicSharedPhoto(
  photoId: string,
  options: { includeSignedUrl?: boolean } = {}
): Promise<SharedPhoto | null> {
  const supabase = createShareSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('photo')
    .select(`
      id,
      storage_key,
      content_type,
      created_at,
      visit:visit_id (
        id,
        user_id,
        shot_at,
        comment,
        is_public
      ),
      manhole:manhole_id (
        id,
        title,
        prefecture,
        municipality,
        pokemons,
        titles,
        hashtags
      )
    `)
    .eq('id', photoId)
    .single();

  if (error || !data) return null;

  const row = data as any;
  const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;
  const manhole = Array.isArray(row.manhole) ? row.manhole[0] : row.manhole;

  if (!visit?.is_public || !manhole) return null;

  const sharedPhoto: SharedPhoto = {
    id: row.id,
    storage_key: row.storage_key,
    content_type: row.content_type,
    created_at: row.created_at,
    visit: {
      id: visit.id,
      user_id: visit.user_id,
      shot_at: visit.shot_at,
      comment: visit.comment ?? null,
      is_public: visit.is_public,
    },
    manhole: {
      id: manhole.id,
      title: manhole.title,
      prefecture: manhole.prefecture,
      municipality: manhole.municipality,
      pokemons: Array.isArray(manhole.pokemons) ? manhole.pokemons : [],
      titles: getSortedTitles(manhole.titles),
      hashtags: Array.isArray(manhole.hashtags) ? manhole.hashtags : [],
    },
  };

  if (options.includeSignedUrl) {
    try {
      const signed = await storage.getSignedUrl(sharedPhoto.storage_key, 3600);
      sharedPhoto.signed_url = signed.url;
    } catch (error) {
      console.error('Failed to sign shared photo URL:', error);
    }
  }

  return sharedPhoto;
}
