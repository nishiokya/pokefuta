import { isMeaningfulVisitComment, normalizeVisitComment } from './visit-comment-quality';
import { toLatestCommentPreview } from './latest-manhole-comment';

/**
 * トップの「最近の口コミ」に並べる1件。
 *
 * 蓋の掲示板コメントと、写真に添えられたひとこと（visit.comment）を
 * 「いつ書かれたか」の同じ軸で混ぜ、蓋ごとに最新の1件だけを残す。
 * 同じ蓋が何枚も並ぶと、口コミが少ないうちは一覧が1つの蓋で埋まるため。
 */
export type RecentCommentKind = 'comment' | 'photo_note';

export type RecentCommentCandidate = {
  kind: RecentCommentKind;
  manhole_id: number;
  content: string;
  created_at: string;
  /** ひとことなら、その訪問の写真。掲示板コメントは後から蓋の写真で埋める */
  photo_id: string | null;
};

export type RecentCommentItem = {
  kind: RecentCommentKind;
  manhole_id: number;
  content: string;
  created_at: string;
  photo_id: string | null;
};

export const RECENT_COMMENTS_DEFAULT_LIMIT = 6;
export const RECENT_COMMENTS_MAX_LIMIT = 12;

/**
 * 候補を新しい順に並べ、蓋ごとに1件へ絞って `limit` 件返す。
 * 本文は抜粋にする。ひとことは読む価値の無いもの（数字だけ・テスト等）を落とす。
 */
export function pickRecentComments(
  candidates: RecentCommentCandidate[],
  limit: number
): RecentCommentItem[] {
  const usable = candidates
    .map((candidate) => {
      if (candidate.kind === 'photo_note' && !isMeaningfulVisitComment(candidate.content)) {
        return null;
      }
      const text = candidate.kind === 'photo_note'
        ? normalizeVisitComment(candidate.content)
        : candidate.content;
      const preview = toLatestCommentPreview([{ content: text, created_at: candidate.created_at }]);
      const time = Date.parse(candidate.created_at);
      if (!preview || Number.isNaN(time)) return null;
      return { ...candidate, content: preview.content, time };
    })
    .filter((candidate): candidate is RecentCommentCandidate & { time: number } => candidate !== null)
    .sort((a, b) => b.time - a.time);

  const seen = new Set<number>();
  const items: RecentCommentItem[] = [];
  for (const { time: _time, ...candidate } of usable) {
    if (seen.has(candidate.manhole_id)) continue;
    seen.add(candidate.manhole_id);
    items.push(candidate);
    if (items.length >= limit) break;
  }
  return items;
}

/** `?limit=` を 1〜上限に収める。数字でなければ既定値 */
export function parseRecentCommentsLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return RECENT_COMMENTS_DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), RECENT_COMMENTS_MAX_LIMIT);
}
