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

type CommentRow = {
  manhole_id: number | null;
  content: string | null;
  created_at: string | null;
};

/**
 * 蓋ごとの口コミ件数と、いちばん新しい1件（抜粋）を求める。
 * 空白だけの本文は件数には数えるが、抜粋には選ばない。
 */
export function summarizeManholeComments(rows: CommentRow[]): {
  counts: Map<number, number>;
  latest: Map<number, LatestManholeComment>;
} {
  const counts = new Map<number, number>();
  const latest = new Map<number, LatestManholeComment>();

  for (const row of rows) {
    const manholeId = row.manhole_id;
    if (typeof manholeId !== 'number') continue;
    counts.set(manholeId, (counts.get(manholeId) || 0) + 1);

    const content = (row.content ?? '').replace(/\s+/g, ' ').trim();
    if (!content || !row.created_at) continue;
    const createdAt = Date.parse(row.created_at);
    if (Number.isNaN(createdAt)) continue;
    const current = latest.get(manholeId);
    if (current && Date.parse(current.created_at) >= createdAt) continue;
    latest.set(manholeId, {
      content: truncate(content, LATEST_COMMENT_PREVIEW_CHARS),
      created_at: row.created_at,
    });
  }

  return { counts, latest };
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}
