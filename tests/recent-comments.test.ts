import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECENT_COMMENTS_DEFAULT_LIMIT,
  RECENT_COMMENTS_MAX_LIMIT,
  parseRecentCommentsLimit,
  pickRecentComments,
  type RecentCommentCandidate,
} from '../src/lib/recent-comments';

const c = (overrides: Partial<RecentCommentCandidate>): RecentCommentCandidate => ({
  kind: 'comment',
  manhole_id: 1,
  content: '駐車場は無料でした',
  created_at: '2026-09-01T00:00:00+00:00',
  photo_id: null,
  ...overrides,
});

test('掲示板コメントとひとことを新しい順に混ぜる', () => {
  const items = pickRecentComments([
    c({ manhole_id: 1, created_at: '2026-09-01T00:00:00+00:00' }),
    c({ kind: 'photo_note', manhole_id: 2, content: '道の駅の入り口にありました', created_at: '2026-09-10T00:00:00+00:00', photo_id: 'p2' }),
    c({ manhole_id: 3, created_at: '2026-09-05T00:00:00+00:00' }),
  ], 6);
  assert.deepEqual(items.map((item) => item.manhole_id), [2, 3, 1]);
  assert.equal(items[0].photo_id, 'p2');
});

test('同じ蓋は最新の1件だけ', () => {
  const items = pickRecentComments([
    c({ manhole_id: 1, content: '古いコメントです', created_at: '2026-09-01T00:00:00+00:00' }),
    c({ kind: 'photo_note', manhole_id: 1, content: '新しいひとことです', created_at: '2026-09-02T00:00:00+00:00' }),
  ], 6);
  assert.equal(items.length, 1);
  assert.equal(items[0].content, '新しいひとことです');
});

test('読む価値の無いひとことは落とすが、掲示板コメントは短くても残す', () => {
  const items = pickRecentComments([
    c({ kind: 'photo_note', manhole_id: 1, content: '15', created_at: '2026-09-03T00:00:00+00:00' }),
    c({ kind: 'photo_note', manhole_id: 2, content: '投稿テスト', created_at: '2026-09-02T00:00:00+00:00' }),
    c({ kind: 'comment', manhole_id: 3, content: 'かわいい', created_at: '2026-09-01T00:00:00+00:00' }),
  ], 6);
  assert.deepEqual(items.map((item) => item.manhole_id), [3]);
});

test('件数で打ち切る', () => {
  const candidates = Array.from({ length: 10 }, (_, i) =>
    c({ manhole_id: i + 1, created_at: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00+00:00` })
  );
  assert.deepEqual(pickRecentComments(candidates, 3).map((item) => item.manhole_id), [10, 9, 8]);
});

test('limit は 1〜上限に収める', () => {
  assert.equal(parseRecentCommentsLimit(null), RECENT_COMMENTS_DEFAULT_LIMIT);
  assert.equal(parseRecentCommentsLimit('abc'), RECENT_COMMENTS_DEFAULT_LIMIT);
  assert.equal(parseRecentCommentsLimit('0'), 1);
  assert.equal(parseRecentCommentsLimit('999'), RECENT_COMMENTS_MAX_LIMIT);
  assert.equal(parseRecentCommentsLimit('4'), 4);
});
