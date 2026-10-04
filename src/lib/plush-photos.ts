import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { manholeDisplayName } from '@/lib/manhole-label';

/**
 * ぬいぐるみと一緒に撮った公開写真（photo.ai_tags.plush = true）。/photos/plush の一覧に使う。
 *
 * 判定は k11 の manhole-score（20261004100000_photo_ai_tags.sql）。anon キーで読むので、
 * 返るのは RLS が許す公開訪問の写真だけ。投稿者の情報（user_id など）は select しない。
 */
export type PlushPhoto = {
  id: string;
  createdAt: string;
  shotAt: string | null;
  manholeId: number;
  manholeName: string;
};

export const PLUSH_PAGE_LIMIT = 300;

export async function loadPlushPhotos(limit = PLUSH_PAGE_LIMIT): Promise<PlushPhoto[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return [];
  const supabase = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from('photo')
    .select(`
      id,
      created_at,
      ai_tags,
      visit:visit_id!inner (
        shot_at,
        is_public
      ),
      manhole:manhole_id (
        id,
        title,
        prefecture,
        municipality,
        building
      )
    `)
    .eq('visit.is_public', true)
    .eq('ai_tags->>plush', 'true')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) console.error('Failed to load plush photos:', error.message);
    return [];
  }

  return (data as any[])
    .map((row) => {
      const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;
      const manhole = Array.isArray(row.manhole) ? row.manhole[0] : row.manhole;
      if (!visit?.is_public || !manhole) return null;
      return {
        id: row.id,
        createdAt: row.created_at,
        shotAt: visit.shot_at ?? null,
        manholeId: manhole.id,
        manholeName: manholeDisplayName(manhole),
      } satisfies PlushPhoto;
    })
    .filter((p): p is PlushPhoto => p !== null);
}
