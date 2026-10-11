import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type OwnVisitNoteRow = {
  visit_id: string;
  note: string | null;
};

/**
 * 呼び出した本人の visit の note（非公開メモ）を visit id → note で返す。
 *
 * **visit.note を select しないこと。** note は anon / authenticated に SELECT を
 * 渡さない（20261012110000）。公開訪問の note が誰でも読めていたため。
 * 本人の note は `get_own_visit_notes()`（auth.uid() に一致する行だけ返す）で読む。
 *
 * 他人の visit id を混ぜても、関数が本人の行だけに絞るので返らない。
 * 失敗しても一覧自体は壊さず、note 無しで返す（メモは補助情報）。
 */
export async function loadOwnVisitNotes(
  supabase: SupabaseClient<Database>,
  visitIds: string[]
): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  const ids = Array.from(new Set(visitIds.filter((id) => typeof id === 'string' && id.length > 0)));
  if (ids.length === 0) return notes;

  // 関数は1回に1000件まで見る
  for (let i = 0; i < ids.length; i += 1000) {
    const { data, error } = await supabase.rpc(
      'get_own_visit_notes' as never,
      { p_visit_ids: ids.slice(i, i + 1000) } as never
    );
    if (error) {
      console.warn('Failed to load own visit notes:', error);
      return notes;
    }
    ((data || []) as OwnVisitNoteRow[]).forEach((row) => {
      if (row?.visit_id && typeof row.note === 'string') notes.set(row.visit_id, row.note);
    });
  }
  return notes;
}
