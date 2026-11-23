import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAnonClient } from '@/lib/supabase/anon';
import { storage } from '@/lib/storage';
import type { Database, ManholeTitle } from '@/types/database';

export type SharedPhoto = {
  id: string;
  storage_key: string;
  content_type: string;
  created_at: string;
  is_landscape: boolean;
  ai_tags: unknown;
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
    building: string | null;
    address: string | null;
    pokemons: string[];
    titles: ManholeTitle[];
    hashtags: string[];
  };
};

// 公開写真しか返さないので anon だけで読む。以前は service role → anon の順に試していたが、
// 本番では service role の呼び出しが毎回 401 になり、1回の表示で無駄なリクエストが2本出ていた（2026-11-23）。
function createShareSupabaseClients(): SupabaseClient<Database>[] {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return [];
  return [createAnonClient()];
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
  const clients = createShareSupabaseClients();

  for (const supabase of clients) {
    const { data, error } = await supabase
      .from('photo')
      .select(`
        id,
        storage_key,
        content_type,
        created_at,
        is_landscape,
        ai_tags,
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
          building,
          address,
          pokemons,
          titles,
          hashtags
        )
      `)
      .eq('id', photoId)
      .single();

    if (error || !data) continue;

    const row = data as any;
    const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;
    const manhole = Array.isArray(row.manhole) ? row.manhole[0] : row.manhole;

    if (!visit?.is_public || !manhole) continue;

    const sharedPhoto: SharedPhoto = {
      id: row.id,
      storage_key: row.storage_key,
      content_type: row.content_type,
      created_at: row.created_at,
      is_landscape: row.is_landscape === true,
      ai_tags: row.ai_tags ?? null,
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
        building: manhole.building ?? null,
        address: manhole.address ?? null,
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

  return null;
}
