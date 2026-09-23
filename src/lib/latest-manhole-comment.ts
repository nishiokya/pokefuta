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
 * 最新の口コミを引く蓋の数の上限。蓋1つにつき1問い合わせになるので、
 * トップの1ページ（24件）に収まる数で打ち切る。
 */
export const LATEST_COMMENT_MAX_MANHOLES = 24;

type CommentRow = {
  content: string | null;
  created_at: string | null;
};

/**
 * 新しい順に並んだ1つの蓋の口コミから、抜粋を1件作る。空白だけの本文は飛ばす。
 *
 * 蓋をまたいで1回で取って JS 側で「最新」を選ぶ形にはしないこと。
 * PostgREST の max_rows（1000）で黙って切られ、古い部分集合から選んでしまう。
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
