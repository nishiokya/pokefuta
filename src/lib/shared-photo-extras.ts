import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchSnapshotNames } from '@/lib/manhole-snapshot';
import { loadPublicDisplayNameMap } from '@/lib/public-display-names';
import type { SharedPhoto } from '@/lib/shared-photo';

/**
 * 写真の個別ページ（/p/[photoId]）に足す情報。どれも取れなければ空で返し、ページは出す。
 *
 * - 蓋の表示名: 図鑑のスナップショットの `name`（蓋詳細の見出しと同じ正本）
 * - 投稿者: 公開名と公開ID（app_user.id）。auth の user_id は戻り値に入れない
 * - いいね数: visit_like の件数（蓋詳細・トップと同じく訪問単位）
 * - 同じ蓋の他の公開写真: 新しい順に最大 OTHER_PHOTO_LIMIT 枚と総数
 */
export type SharedPhotoExtras = {
  manholeName: string | null;
  posterName: string;
  posterPublicId: string | null;
  likesCount: number;
  otherPhotos: Array<{ id: string; shotAt: string | null; isLandscape: boolean }>;
  otherCount: number;
};

export const OTHER_PHOTO_LIMIT = 8;

export async function loadSharedPhotoExtras(
  supabase: SupabaseClient<Database>,
  photo: SharedPhoto,
): Promise<SharedPhotoExtras> {
  const uid = photo.visit.user_id;
  const [names, displayNames, publicIds, likes, others] = await Promise.all([
    fetchSnapshotNames().catch(() => new Map<number, string>()),
    loadPublicDisplayNameMap(supabase, [uid]).catch(() => new Map<string, string | null>()),
    supabase
      .rpc('get_public_user_ids' as never, { p_auth_uids: [uid] } as never)
      .then((r: any) => (r?.error ? [] : (r?.data as any[]) || []), () => []),
    supabase
      .from('visit_like')
      .select('visit_id', { count: 'exact', head: true })
      .eq('visit_id', photo.visit.id)
      .then((r) => (r.error ? 0 : r.count ?? 0), () => 0),
    supabase
      .from('photo')
      .select('id, created_at, is_landscape, visit:visit_id!inner ( shot_at, is_public )', { count: 'exact' })
      .eq('manhole_id', photo.manhole.id)
      .eq('visit.is_public', true)
      .neq('id', photo.id)
      .order('created_at', { ascending: false })
      .limit(OTHER_PHOTO_LIMIT)
      .then((r) => r, () => ({ data: null, count: 0, error: true })),
  ]);

  const publicRow = (publicIds as any[]).find((row) => row?.auth_uid === uid);
  const otherRows = ((others as any).data as any[] | null) ?? [];

  return {
    manholeName: names.get(photo.manhole.id) ?? null,
    posterName: displayNames.get(uid)?.trim() || '名無しのトレーナー',
    posterPublicId: publicRow?.public_user_id ?? null,
    likesCount: likes as number,
    otherPhotos: otherRows.map((row) => {
      const visit = Array.isArray(row.visit) ? row.visit[0] : row.visit;
      return { id: row.id, shotAt: visit?.shot_at ?? row.created_at ?? null, isLandscape: row.is_landscape === true };
    }),
    otherCount: (others as any).count ?? otherRows.length,
  };
}
