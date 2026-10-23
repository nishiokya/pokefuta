import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// 都道府県数の集計: カード一覧よりゆるい上限で全件に近い形を見る（写真joinなし・軽量）
const PREFECTURE_SCAN_LIMIT = 2000;

export type PublicVisitStats = {
  totalVisits: number;
  prefectureCount: number;
};

/**
 * 公開スタンプ帳に出す「訪問スタンプ」と「都道府県」の数。
 *
 * 公開ページ（サーバー）と、本人のスタンプ帳(/visits)の共有文（ブラウザ）の両方で使う。
 * 共有文の数字が、リンク先の公開ページの数字と食い違わないよう、同じ公開ビューから同じ数え方で出す。
 * 本人の全記録（非公開も含む・マンホール単位で重複を除いた数）から数えると、公開ページとずれる。
 *
 * base（写真を含まないビュー）を使うのは性能ではなく保証のため。
 * 最新写真の相関サブクエリが列として存在しなければ、集計時に実行されようがない。
 */
export async function loadPublicVisitStats(
  client: SupabaseClient<Database>,
  publicUserId: string
): Promise<PublicVisitStats> {
  const [{ count, error: countError }, { data: prefectureRows, error: prefectureError }] = await Promise.all([
    client
      .from('public_user_visit_base')
      .select('id', { count: 'exact', head: true })
      .eq('public_user_id', publicUserId),
    client
      .from('public_user_visit_base')
      .select('manhole_prefecture')
      .eq('public_user_id', publicUserId)
      .limit(PREFECTURE_SCAN_LIMIT),
  ]);

  if (countError) throw new Error(countError.message);
  if (prefectureError) throw new Error(prefectureError.message);

  const prefectures = new Set<string>();
  ((prefectureRows || []) as unknown as { manhole_prefecture: string | null }[]).forEach((row) => {
    if (row.manhole_prefecture) prefectures.add(row.manhole_prefecture);
  });

  return { totalVisits: count ?? 0, prefectureCount: prefectures.size };
}
