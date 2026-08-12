import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { loadPublicDisplayNameMap, loadPublicUserIdMap } from '@/lib/public-display-names';

/**
 * 蓋コメントの公開表現。
 *
 * **`user_id`（auth uid の生値）を含めないこと。** これがこの型の存在理由。
 * 以前は `select('*')` の結果をそのまま返していたため、蓋ページを開くだけで
 * コメント投稿者の auth uid が全員に配られていた。
 *
 * 「自分のコメントか」はクライアントで uid を突き合わせるのではなく、
 * サーバが計算した `is_own` で答える。uid をレスポンスに載せずに判定できる形。
 *
 * ---
 * **ただしこれで auth uid が隠れたわけではない。**
 *
 * baseline に `GRANT ALL ON manhole_comment TO anon` と
 * `public_select_manhole_comments USING (true)` が残っているので、
 * 公開 anon キーで `manhole_comment?select=user_id` を直接叩けば
 * 全投稿者の auth uid が取れる。**この型が塞ぐのはアプリのAPI経路だけで、
 * DB は開いたまま。** 「API 層はセキュリティ境界ではない」という
 * このリポジトリの前提は、ここでもそのまま当てはまる。
 *
 * 塞ぐには SECURITY DEFINER RPC を足す → 適用 → このファイルを切り替える →
 * デプロイ → `REVOKE SELECT (user_id)` の順が要る（列を剥がす前に、
 * 読まなくなっているコードが本番で動いている必要がある）。
 * 計画では `visit` の M2 と同じ contract フェーズ（Phase 5）にまとめてある。
 * `~/.claude/plans/seo-sns-ux-mutable-simon.md` §7 / §失敗する筋 7 を参照。
 */
export type PublicManholeComment = {
  id: string;
  manhole_id: number;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  is_own: boolean;
  user: {
    display_name: string | null;
    public_user_id: string | null;
  };
};

/**
 * `select('*')` を使わず列を名指しする。
 * 列を足したときに自動で公開面へ出ないようにするため（`photo.exif` の教訓）。
 */
export const MANHOLE_COMMENT_COLUMNS =
  'id, manhole_id, parent_comment_id, content, created_at, user_id';

type ManholeCommentRow = {
  id: string;
  manhole_id: number;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  user_id: string | null;
};

/**
 * DB の行を公開表現へ変換する。表示名と public_user_id の解決はここに閉じる。
 *
 * @param viewerUserId 閲覧者の auth uid（未ログインなら null）。`is_own` の判定にのみ使い、
 *                     レスポンスには載せない。
 */
export async function serializeManholeComments(
  supabase: SupabaseClient<Database>,
  rows: ManholeCommentRow[],
  viewerUserId: string | null
): Promise<PublicManholeComment[]> {
  const authUids = rows
    .map((row) => row.user_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const [displayNameByAuthUid, publicUserIdByAuthUid] = await Promise.all([
    loadPublicDisplayNameMap(supabase, authUids),
    loadPublicUserIdMap(supabase, authUids),
  ]);

  return rows.map((row) => {
    const uid = row.user_id;
    return {
      id: row.id,
      manhole_id: row.manhole_id,
      parent_comment_id: row.parent_comment_id ?? null,
      content: row.content,
      created_at: row.created_at,
      is_own: Boolean(uid && viewerUserId && uid === viewerUserId),
      user: {
        display_name: uid ? (displayNameByAuthUid.get(uid) ?? null) : null,
        public_user_id: uid ? (publicUserIdByAuthUid.get(uid) ?? null) : null,
      },
    };
  });
}
