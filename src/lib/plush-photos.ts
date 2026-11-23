import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { manholeDisplayName } from '@/lib/manhole-label';
import { interleaveByGroup } from '@/lib/interleave-by-group';

/**
 * トップの特集カード用に、ぬいぐるみや雪景色の公開写真を読む。
 * ぬいぐるみらしさ（plush_score）の高い順または投稿の新しい順に最大 limit 枚を取り、必要なら投稿者を1枚ずつ順番に回して並べ直す
 * （写真の多い人が上を埋めないように。plush_score はほとんどの写真で 0.99 以上なので、順位の意味は薄い）。
 *
 * 判定は k11 の manhole-score（20261004100000_photo_ai_tags.sql）。anon キーで読むので、
 * 返るのは RLS が許す公開訪問の写真だけ。
 * auth の user_id は投稿者ごとの並べ替えにだけ使う。
 */
export type PlushPhoto = {
  id: string;
  aiTags: unknown;
  createdAt: string;
  shotAt: string | null;
  manholeName: string;
  visitId: string;
};

export const PLUSH_PAGE_LIMIT = 300;

/** 撮影日（無ければ投稿日）の新しい順。同じ日時は投稿の新しい順 */
export function sortByShotAtDesc(photos: PlushPhoto[]): PlushPhoto[] {
  const time = (value: string | null) => {
    const t = value ? Date.parse(value) : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  return [...photos].sort(
    (a, b) => time(b.shotAt ?? b.createdAt) - time(a.shotAt ?? a.createdAt) || time(b.createdAt) - time(a.createdAt),
  );
}

/**
 * order: 'score' = ぬいぐるみらしい順、'recent' = 投稿の新しい順。
 * interleave: 投稿者を1枚ずつ順番に回すか。
 */
export async function loadPlushPhotos(
  limit = PLUSH_PAGE_LIMIT,
  order: 'score' | 'recent' = 'score',
  interleave = true,
): Promise<PlushPhoto[]> {
  return loadTaggedPhotos('plush', limit, order, interleave);
}

/**
 * 公開写真だけをタグで抽出。投稿の新しい順で最大 limit 枚を返す（雪のカードは sortByShotAtDesc で撮影日順に並べ直す。
 * 上限で切ってから並べ直すので、雪が limit 枚を超えたら DB 側で撮影日順に切るように直すこと）。
 * 取れなかったときは空配列を返す（トップの特集カードの API 用。0 枚の応答はキャッシュさせない）。
 */
export async function loadTaggedPhotos(
  tag: 'plush' | 'snow',
  limit = PLUSH_PAGE_LIMIT,
  order: 'score' | 'recent' = 'recent',
  interleave = false,
): Promise<PlushPhoto[]> {
  try {
    return await fetchTaggedPhotos(tag, limit, order, interleave);
  } catch (error) {
    console.error('Failed to load plush photos:', error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchTaggedPhotos(
  tag: 'plush' | 'snow',
  limit = PLUSH_PAGE_LIMIT,
  order: 'score' | 'recent' = 'recent',
  interleave = false,
): Promise<PlushPhoto[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase URL / anon key is not set');
  const supabase = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = supabase
    .from('photo')
    .select(`
      id,
      created_at,
      ai_tags,
      visit:visit_id!inner (
        id,
        user_id,
        shot_at,
        is_public
      ),
      manhole:manhole_id (
        title,
        prefecture,
        municipality,
        building
      )
    `)
    .eq('visit.is_public', true)
    .eq(`ai_tags->>${tag}`, 'true');
  if (order === 'score') {
    // 上限で切る前に DB でスコア順に並べる（新しい順で切ってから並べると、古くてぬいぐるみらしい写真が漏れる）。
    // jsonb の数値どうしは数値として比べられる。同点は新しい順
    query = query.order('ai_tags->plush_score', { ascending: false, nullsFirst: false });
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No data');

  // 投稿者を1枚ずつ順番に回す（トップの特集カードの3枚も同じ人で埋まらないように）
  const rows = interleave
    ? interleaveByGroup(data as any[], (row) => (Array.isArray(row.visit) ? row.visit[0] : row.visit)?.user_id ?? null)
    : (data as any[]);

  return rows
    .map((row) => {
      const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;
      const manhole = Array.isArray(row.manhole) ? row.manhole[0] : row.manhole;
      if (!visit?.is_public || !manhole) return null;
      return {
        id: row.id,
        aiTags: row.ai_tags ?? null,
        createdAt: row.created_at,
        shotAt: visit.shot_at ?? null,
        manholeName: manholeDisplayName(manhole),
        visitId: visit.id,
      } satisfies PlushPhoto;
    })
    .filter((p): p is PlushPhoto => p !== null);
}
