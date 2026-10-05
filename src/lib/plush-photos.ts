import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { manholeDisplayName } from '@/lib/manhole-label';
import { loadPublicDisplayNameMap } from '@/lib/public-display-names';
import { interleaveByGroup } from '@/lib/interleave-by-group';

/**
 * ぬいぐるみと一緒に撮った公開写真（photo.ai_tags.plush = true）。/photos/plush の一覧に使う。
 * ぬいぐるみらしさ（plush_score）の高い順（または新しい順）に最大 limit 枚を取り、投稿者を1枚ずつ順番に回して並べ直す
 * （写真の多い人が上を埋めないように。plush_score はほとんどの写真で 0.99 以上なので、順位の意味は薄い）。
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
  /** フィードのタグ（幻・夜ふた・撮れたて…）を作るための入力。トップと同じ feedCardTags に渡す */
  visitId: string;
  pokemons: string[];
  posterName: string;
  /** 公開訪問を持つ投稿者の公開ID。無ければリンクしない */
  posterPublicId: string | null;
};

export const PLUSH_PAGE_LIMIT = 300;

/** order: 'score' = ぬいぐるみらしい順（特集ページ）、'recent' = 新しい順（トップの特集カード。新着が出るように） */
export async function loadPlushPhotos(
  limit = PLUSH_PAGE_LIMIT,
  order: 'score' | 'recent' = 'score',
): Promise<PlushPhoto[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return [];
  const supabase = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = supabase
    .from('photo')
    .select(`
      id,
      created_at,
      ai_tags,
      is_landscape,
      visit:visit_id!inner (
        id,
        user_id,
        shot_at,
        is_public
      ),
      manhole:manhole_id (
        id,
        title,
        prefecture,
        municipality,
        building,
        pokemons
      )
    `)
    .eq('visit.is_public', true)
    .eq('ai_tags->>plush', 'true');
  if (order === 'score') {
    // 上限で切る前に DB でスコア順に並べる（新しい順で切ってから並べると、古くてぬいぐるみらしい写真が漏れる）。
    // jsonb の数値どうしは数値として比べられる。同点は新しい順
    query = query.order('ai_tags->plush_score', { ascending: false, nullsFirst: false });
  }
  const { data, error } = await query
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

  // どちらの順でも投稿者を1枚ずつ順番に回す（トップの特集カードの3枚も同じ人で埋まらないように）
  const rows = interleaveByGroup(data as any[], (row) => (Array.isArray(row.visit) ? row.visit[0] : row.visit)?.user_id ?? null);

  return rows
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
        visitId: visit.id,
        pokemons: Array.isArray(manhole.pokemons) ? manhole.pokemons : [],
        posterName: names.get(visit.user_id)?.trim() || '名無しのトレーナー',
        posterPublicId: publicIds.get(visit.user_id) ?? null,
      } satisfies PlushPhoto;
    })
    .filter((p): p is PlushPhoto => p !== null);
}
