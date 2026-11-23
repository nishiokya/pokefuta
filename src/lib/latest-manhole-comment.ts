/**
 * トップのフィードでカードにマウスを乗せたときに見せる「最新の口コミ」。
 *
 * 投稿者は載せない。表示名を引くには manhole_comment の user_id が要るが、
 * その列は anon / authenticated から読めない（Phase 1c）。名前を出したくなったら
 * `get_manhole_comments()` 側で解決すること。user_id を select に戻さない。
 */
export type LatestManholeComment = {
  content: string;
  created_at: string;
};

/** カードに収まる長さで切る。全文は蓋ページで読める。 */
export const LATEST_COMMENT_PREVIEW_CHARS = 80;

/**
 * 1つの蓋について何件さかのぼって読むか。
 * 最新が空白だけの投稿だったときに、次の1件へ落とすための余裕。
 */
export const LATEST_COMMENT_LOOKBACK = 3;

/**
 * 最新の口コミを引く蓋の数の上限。トップの1ページ（24件）に収まる数で打ち切る。
 */
export const LATEST_COMMENT_MAX_MANHOLES = 24;

/**
 * 蓋をまたいでまとめて読むときの行数の上限（PostgREST の max_rows 1000 より十分小さく）。
 * 2026-11-23 時点で口コミは全体で 29件なので、ふつうは対象の蓋の口コミが全部入る。
 */
export const LATEST_COMMENT_BATCH_LIMIT = 200;

type CommentRow = {
  content: string | null;
  created_at: string | null;
};

type ManholeCommentRow = CommentRow & { manhole_id: number | null };

/**
 * 蓋をまたいで新しい順にまとめて読んだ口コミから、蓋ごとの抜粋を作る。
 *
 * 以前は蓋1つにつき1問い合わせ（1ページで最大24本）で、1日 約3,900本 Supabase へ出ていた。
 * まとめて読むと上限で切られうるが、行は**全体で新しい順**なので、1件でも取れた蓋は
 * その蓋の新しいものから順に入っている。上限に届いた（truncated）ときに抜粋を作れなかった蓋だけ
 * `refetch` に返し、呼び出し側が蓋ごとに読み直す。上限に届かなければ対象の蓋の口コミは全部取れている。
 */
export function pickLatestComments(
  rowsNewestFirst: ManholeCommentRow[],
  manholeIds: number[],
  truncated: boolean
): { previews: Map<number, LatestManholeComment | null>; refetch: number[] } {
  const byManhole = new Map<number, CommentRow[]>();
  for (const row of rowsNewestFirst) {
    if (typeof row.manhole_id !== 'number') continue;
    const list = byManhole.get(row.manhole_id) ?? [];
    list.push(row);
    byManhole.set(row.manhole_id, list);
  }
  const previews = new Map<number, LatestManholeComment | null>();
  const refetch: number[] = [];
  for (const id of manholeIds) {
    // 蓋ごとに読む経路（従来・読み直し）と同じく、新しい LOOKBACK 件だけを見る（経路で結果を変えない）
    const preview = toLatestCommentPreview((byManhole.get(id) ?? []).slice(0, LATEST_COMMENT_LOOKBACK));
    if (preview || !truncated) previews.set(id, preview);
    else refetch.push(id);
  }
  return { previews, refetch };
}

/**
 * 新しい順に並んだ1つの蓋の口コミから、抜粋を1件作る。空白だけの本文は飛ばす。
 *
 * 蓋をまたいで1回で取るときは、上限で切られたかを見て `pickLatestComments` を通すこと。
 * 切られたことに気づかずに JS 側で「最新」を選ぶと、古い部分集合から選んでしまう。
 */
export function toLatestCommentPreview(rowsNewestFirst: CommentRow[]): LatestManholeComment | null {
  for (const row of rowsNewestFirst) {
    const content = (row.content ?? '').replace(/\s+/g, ' ').trim();
    if (!content || !row.created_at) continue;
    return {
      content: truncate(content, LATEST_COMMENT_PREVIEW_CHARS),
      created_at: row.created_at,
    };
  }
  return null;
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}
