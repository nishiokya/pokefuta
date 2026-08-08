import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ポケふたが1枚以上設置されている都道府県の名前。
 *
 * 進捗・制覇の分母は必ずこれを使う。`prefecture` テーブルは47行あるが、
 * 群馬・山梨・広島・熊本・大分にはポケふたが1枚も無い（実データで42県）。
 * 47を分母にすると **制覇バッジが永久に成立せず**、残り一覧に
 * 「行っても何も無い県」が並ぶ。
 *
 * 分母の数え方は公開スタンプ帳の `totalPrefectureCount`
 * （`user-prefecture-progress.ts`）と揃えてある。
 */
export async function loadInstalledPrefectureNames(
  supabase: SupabaseClient<any, any, any>
): Promise<Set<string>> {
  const { data, error } = await supabase.from('manhole').select('prefecture');

  if (error) throw new Error(error.message);

  return new Set(
    (data || [])
      .map((row: { prefecture: string | null }) => row.prefecture)
      .filter((name: string | null): name is string => Boolean(name))
  );
}
