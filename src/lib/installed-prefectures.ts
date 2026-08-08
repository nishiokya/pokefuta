import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * PostgREST の1リクエスト上限（`supabase/config.toml` の `max_rows`）。
 * 超過分は **正常レスポンスのまま黙って切られる** ので、必ずページングする。
 */
const PAGE_SIZE = 1000;
/** 暴走ガード。1000件×50 = 50,000枚を超えることは当面ない */
const MAX_PAGES = 50;

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
 *
 * ⚠️ **`manhole.prefecture_id` ではなく県名で数えている。** 直感に反するが、
 * 実データでは `prefecture_id` のほうが欠けている（2026-08-09 時点で
 * 12行が NULL: 長野県6 / 長崎県5 / 石川県1）。とくに **長野県は全行 NULL**
 * なので、ID で数えると 42県ではなく41県になり、分母が1つ減って
 * 制覇が実際より簡単に成立してしまう。`prefecture_id` に外部キー制約は無く、
 * 両方が入っている行では県名と完全一致している（不一致0件）ので、
 * 現状は県名のほうが信頼できるキー。
 * `prefecture_id` の欠損を埋めたうえで NOT NULL + FK を張れたら ID 照合へ移行する。
 */
export async function loadInstalledPrefectureNames(
  supabase: SupabaseClient<any, any, any>
): Promise<Set<string>> {
  const names = new Set<string>();
  let received = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from('manhole')
      .select('prefecture')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const rows = data || [];
    received += rows.length;

    for (const row of rows as Array<{ prefecture: string | null }>) {
      const name = typeof row.prefecture === 'string' ? row.prefecture.trim() : '';
      if (name) names.add(name);
    }

    // 満たなければ最終ページ
    if (rows.length < PAGE_SIZE) {
      // 空の結果を「設置県ゼロ」として受理すると、分母0 → 残り0県 →
      // 「全部終わった」と誤表示される。取得失敗と区別できないので落とす
      if (received === 0 || names.size === 0) {
        throw new Error('manhole catalog returned no rows; refusing to treat as zero installed prefectures');
      }
      return names;
    }
  }

  throw new Error(`manhole catalog exceeded ${MAX_PAGES * PAGE_SIZE} rows; pagination guard hit`);
}
