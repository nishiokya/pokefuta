import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { manholeDisplayName } from '@/lib/manhole-label';
import { loadPublicDisplayNameMap } from '@/lib/public-display-names';

/**
 * ぬいぐるみと一緒に撮った公開写真（photo.ai_tags.plush = true）。/photos/plush の一覧に使う。
 * 新しい順に最大 limit 枚を取り、ぬいぐるみらしさ（plush_score）の高い順に並べて返す。
 *
 * 判定は k11 の manhole-score（20261004100000_photo_ai_tags.sql）。anon キーで読むので、
 * 返るのは RLS が許す公開訪問の写真だけ。
 * 投稿者は公開名と公開ID（app_user.id、/users/<id>/visits）だけを返す。auth の user_id は
 * 名前と公開IDを引くためだけに使い、戻り値には入れない（蓋詳細の /api/image-upload と同じ RPC）。
 */
export type PlushPhoto = {
  id: string;
  aiTags: unknown;
  isLandscape: boolean;
  /** ぬいぐるみらしさ 0..1（k11 の分類器）。並べ替えに使う */
  plushScore: number;
  createdAt: string;
  shotAt: string | null;
  manholeId: number;
  manholeName: string;
  posterName: string;
  /** 公開訪問を持つ投稿者の公開ID。無ければリンクしない */
  posterPublicId: string | null;
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
      is_landscape,
      visit:visit_id!inner (
        user_id,
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

  const authUids = Array.from(new Set((data as any[])
    .map((row) => (Array.isArray(row.visit) ? row.visit[0] : row.visit)?.user_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)));
  const [names, publicIds] = await Promise.all([
    loadPublicDisplayNameMap(supabase, authUids),
    supabase
      .rpc('get_public_user_ids' as never, { p_auth_uids: authUids } as never)
      .then(
        (result: any) => {
          const map = new Map<string, string | null>();
          if (result?.error) {
            console.warn('Failed to load public_user_id for plush photos:', result.error);
          } else {
            ((result?.data as any[]) || []).forEach((r: any) => {
              if (r?.auth_uid) map.set(r.auth_uid, r.public_user_id ?? null);
            });
          }
          return map;
        },
        () => new Map<string, string | null>(),
      ),
  ]);

  return (data as any[])
    .map((row) => {
      const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;
      const manhole = Array.isArray(row.manhole) ? row.manhole[0] : row.manhole;
      if (!visit?.is_public || !manhole) return null;
      return {
        id: row.id,
        aiTags: row.ai_tags ?? null,
        isLandscape: row.is_landscape === true,
        plushScore: typeof row.ai_tags?.plush_score === 'number' ? row.ai_tags.plush_score : 0,
        createdAt: row.created_at,
        shotAt: visit.shot_at ?? null,
        manholeId: manhole.id,
        manholeName: manholeDisplayName(manhole),
        posterName: names.get(visit.user_id)?.trim() || '名無しのトレーナー',
        posterPublicId: publicIds.get(visit.user_id) ?? null,
      } satisfies PlushPhoto;
    })
    .filter((p): p is PlushPhoto => p !== null)
    // ぬいぐるみらしさの高い順。同点は新しい順（取得は新しい順なので安定ソートで保たれる）
    .sort((a, b) => b.plushScore - a.plushScore);
}
