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
 * **読み口は DB 側でも閉じた（Phase 1c）。**
 *
 * かつては baseline の `GRANT ALL ON manhole_comment TO anon` と
 * `public_select_manhole_comments USING (true)` が残っていたので、
 * 公開 anon キーで `manhole_comment?select=user_id` を直接叩けば
 * 全投稿者の auth uid が取れた。**API 層はセキュリティ境界ではない。**
 *
 * 一覧は `get_manhole_comments()`（SECURITY DEFINER）経由にしてあり、
 * このファイルはもう `user_id` を読まない。列そのものを剥がすのは 1c-c。
 * `~/.claude/plans/seo-sns-ux-mutable-simon.md` §Phase 1c を参照。
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
 *
 * **`user_id` を戻さないこと。** 1c-c で `manhole_comment` の SELECT を列名指しに
 * したあとは、この定数に `user_id` があるだけで投稿が 42501 で落ちる
 * （PostgREST は要求した列をそのまま権限検査に掛ける）。
 */
export const MANHOLE_COMMENT_COLUMNS =
  'id, manhole_id, parent_comment_id, content, created_at';

/** `get_manhole_comments()` の1行。auth uid は含まれない。 */
type ManholeCommentRpcRow = {
  id: string;
  manhole_id: number;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  is_own: boolean;
  display_name: string | null;
  public_user_id: string | null;
  thread_total: number;
};

/** POST の返却に使う、書き込み直後の行（RETURNING の結果）。 */
type InsertedManholeCommentRow = {
  id: string;
  manhole_id: number;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
};

/**
 * API が受け付ける1ページの上限。
 *
 * RPC 側の上限は has_more 判定の +1 込みで 101 なので、ここは 100 で頭打ちにする。
 * 以前は `parseInt` の結果をそのまま渡していたため、`?limit=99999` で
 * スレッド全件を1回で引けた（`NaN` も素通りしていた）。
 */
const MAX_PAGE_SIZE = 100;

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
}

function toPublicComment(row: ManholeCommentRpcRow): PublicManholeComment {
  return {
    id: row.id,
    manhole_id: row.manhole_id,
    parent_comment_id: row.parent_comment_id ?? null,
    content: row.content,
    created_at: row.created_at,
    is_own: Boolean(row.is_own),
    user: {
      display_name: row.display_name ?? null,
      public_user_id: row.public_user_id ?? null,
    },
  };
}

export type ManholeCommentPage = {
  comments: PublicManholeComment[];
  /** スレッド全体（親コメント）の件数。カーソルの有無に依らない。 */
  threadTotal: number;
  /** さらに古いコメントがあるか。総数からの引き算では判定しない。 */
  hasMore: boolean;
};

/**
 * スレッド1ページ分を読む。**テーブルではなく RPC を読む。**
 *
 * 表示名と公開IDの解決も RPC の中で済んでいるので、ここから
 * `loadPublicDisplayNameMap` / `loadPublicUserIdMap` は呼ばない
 * （呼ぶと同じ問い合わせを二重に投げることになる）。
 *
 * `has_more` は「1件多く読んで、実際に次があるかを直接答える」方式のまま。
 * total からの引き算にすると、取得の合間に増えた1件が差分として永久に残り
 * 「以前のコメントを見る（残り1）」が押しても消えないボタンになる。
 */
export async function fetchManholeCommentPage(
  supabase: SupabaseClient<Database>,
  params: {
    manholeId: number;
    limit: number;
    offset?: number;
    beforeCreatedAt?: string | null;
    beforeId?: string | null;
  }
): Promise<{ page: ManholeCommentPage | null; error: { message: string } | null }> {
  const limit = clampLimit(params.limit);

  const { data, error } = await supabase.rpc('get_manhole_comments' as never, {
    p_manhole_id: params.manholeId,
    // has_more を判定するため1件多く読む。RPC 側の上限（101）はこの +1 込み。
    p_limit: limit + 1,
    p_offset: Math.max(params.offset ?? 0, 0),
    p_before_created_at: params.beforeCreatedAt ?? null,
    p_before_id: params.beforeId ?? null,
  } as never);

  if (error) {
    return { page: null, error };
  }

  const rows = ((data || []) as ManholeCommentRpcRow[]);
  const hasMore = rows.length > limit;
  const offset = Math.max(params.offset ?? 0, 0);

  // `thread_total` は行に乗って返るので、**0件のページでは受け取れない**。
  //
  // `offset=0`（カーソル無し）で0件なら、スレッド自体が空なので 0 で正しい。
  // だが **`offset` が末尾を越えた場合も0件**になり、そこで 0 を返すと
  // 「コメントはあるのに見出しが 0 件」になる。以前の `count: 'exact'` は
  // この場合でも実数を返していたので、黙った退行になる（codex レビューの指摘）。
  //
  // その1点だけ数え直す。`offset > 0` かつ0件、という稀な組み合わせに限るので、
  // 大多数を占める「コメントの無い蓋の初回ページ」に追加の問い合わせは出ない。
  // 数えるのに読むのは `id` だけ（`user_id` は読まない）。
  let threadTotal = Number(rows[0]?.thread_total ?? 0);
  if (rows.length === 0 && offset > 0) {
    const { count, error: countError } = await supabase
      .from('manhole_comment')
      .select('id', { count: 'exact', head: true })
      .eq('manhole_id', params.manholeId)
      .is('parent_comment_id', null);

    if (countError) {
      return { page: null, error: countError };
    }
    threadTotal = count ?? 0;
  }

  return {
    page: {
      comments: rows.slice(0, limit).map(toPublicComment),
      threadTotal,
      hasMore,
    },
    error: null,
  };
}

/**
 * 投稿直後の1件を公開表現にする。
 *
 * **投稿者の uid は行から読まない。** 書いたのはセッションの本人だと分かっているので、
 * `authorUserId` を受け取って解決する。`is_own` は定義上つねに真。
 * （一覧と違って RPC を通さないのは、書き込み直後の1件をスレッド検索で拾い直すのが
 *   無駄だから。読む列に `user_id` が無ければ 1c-c の目的は達している）
 */
export async function serializeOwnManholeComment(
  supabase: SupabaseClient<Database>,
  row: InsertedManholeCommentRow,
  authorUserId: string
): Promise<PublicManholeComment> {
  const [displayNameByAuthUid, publicUserIdByAuthUid] = await Promise.all([
    loadPublicDisplayNameMap(supabase, [authorUserId]),
    loadPublicUserIdMap(supabase, [authorUserId]),
  ]);

  return {
    id: row.id,
    manhole_id: row.manhole_id,
    parent_comment_id: row.parent_comment_id ?? null,
    content: row.content,
    created_at: row.created_at,
    is_own: true,
    user: {
      display_name: displayNameByAuthUid.get(authorUserId) ?? null,
      public_user_id: publicUserIdByAuthUid.get(authorUserId) ?? null,
    },
  };
}

/**
 * そのコメントが呼び出し元本人のものか。
 *
 * `manhole_comment.user_id` を読んで突き合わせない。
 * RLS はすでに「自分のものしか消せない」を強制しているので、この判定は
 * **403 と 404 を区別して返すためだけ**にある（UI の文言のため）。
 * 判定は SECURITY DEFINER の `is_own_manhole_comment` に閉じてあり、
 * 呼び出し側に user_id の SELECT 権限が無くても動く。
 */
export async function isOwnManholeComment(
  supabase: SupabaseClient<Database>,
  commentId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_own_manhole_comment' as never, {
    p_comment_id: commentId,
  } as never);

  if (error) {
    console.error('Failed to evaluate is_own_manhole_comment:', error);
    // 判定できないときは「自分のものではない」に倒す。
    // 消させない/通報させないほうが、他人のコメントを消せるより安全。
    return false;
  }

  return data === true;
}
