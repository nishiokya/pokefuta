import assert from 'node:assert/strict';
import test from 'node:test';
import {
  orderManholePhotosChronologically,
  orderManholePhotosForViewer,
  rankManholePhotos,
} from '../src/lib/manhole-photo-ranking';

const photo = (
  id: string,
  options: { score?: number | null; createdAt?: string; userId?: string; isPublic?: boolean } = {}
) => ({
  id,
  created_at: options.createdAt ?? '2026-08-01T00:00:00.000Z',
  score: options.score,
  visit: {
    user_id: options.userId ?? 'community',
    is_public: options.isPublic ?? true,
  },
});

test('scored photos rank ahead of unscored photos, then by score', () => {
  const ranked = rankManholePhotos([
    photo('unscored', { createdAt: '2026-08-15T00:00:00.000Z' }),
    photo('lower', { score: 42 }),
    photo('higher', { score: 88 }),
  ]);

  assert.deepEqual(ranked.map(({ id }) => id), ['higher', 'lower', 'unscored']);
});

test('equal or missing scores fall back to newest photo first', () => {
  const ranked = rankManholePhotos([
    photo('old', { score: 50, createdAt: '2026-08-01T00:00:00.000Z' }),
    photo('new', { score: 50, createdAt: '2026-08-10T00:00:00.000Z' }),
  ]);

  assert.deepEqual(ranked.map(({ id }) => id), ['new', 'old']);
});

test('a logged-in viewer sees their highest-ranked photo as representative', () => {
  const result = orderManholePhotosForViewer([
    photo('global-best', { score: 99, userId: 'other' }),
    photo('mine-low', { score: 20, userId: 'me' }),
    photo('mine-high', { score: 60, userId: 'me' }),
  ], 'me');

  assert.equal(result.representativePhoto?.id, 'mine-high');
  assert.deepEqual(result.orderedPhotos.map(({ id }) => id), ['mine-high', 'global-best', 'mine-low']);
});

test('logged-out viewers use the global score leader and cannot see private photos', () => {
  const result = orderManholePhotosForViewer([
    photo('public', { score: 70, userId: 'other' }),
    photo('private', { score: 100, userId: 'other', isPublic: false }),
  ], null);

  assert.deepEqual(result.orderedPhotos.map(({ id }) => id), ['public']);
  assert.equal(result.representativePhoto?.id, 'public');
});

// ── 撮影日の古い順（詳細ページの「すべての写真」） ─────────────────────

const shot = (id: string, shotAt: string | null, createdAt: string) => ({
  id,
  created_at: createdAt,
  visit: { user_id: 'community', is_public: true, shot_at: shotAt },
});

test('chronological order uses shot_at, not upload time', () => {
  // manhole/82 の実データ。8/11 に撮って 8/24 に上げた1枚が、created_at 順だと
  // 8/19 撮影より新しい扱いになって時系列が壊れていた。
  const ordered = orderManholePhotosChronologically([
    shot('aug30', '2026-08-30T04:48:32Z', '2026-08-30T04:48:58Z'),
    shot('aug28', '2026-08-28T00:00:00Z', '2026-08-28T00:00:00Z'),
    shot('aug11', '2026-08-11T00:00:00Z', '2026-08-24T00:00:00Z'),
    shot('aug19', '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'),
    shot('y2024', '2024-07-13T00:00:00Z', '2026-08-13T00:00:00Z'),
  ]);

  assert.deepEqual(
    ordered.map(({ photo }) => photo.id),
    ['y2024', 'aug11', 'aug19', 'aug28', 'aug30']
  );
});

test('chronological order carries the original index so the lightbox still opens the right photo', () => {
  const ordered = orderManholePhotosChronologically([
    shot('newest', '2026-08-30T00:00:00Z', '2026-08-30T00:00:00Z'),
    shot('oldest', '2024-07-13T00:00:00Z', '2026-08-13T00:00:00Z'),
  ]);

  assert.deepEqual(ordered.map(({ photo, index }) => [photo.id, index]), [
    ['oldest', 1],
    ['newest', 0],
  ]);
});

test('photos without a usable shot_at fall back to upload time', () => {
  const ordered = orderManholePhotosChronologically([
    shot('no-shot-at', null, '2026-08-05T00:00:00Z'),
    shot('shot-later', '2026-08-20T00:00:00Z', '2026-08-01T00:00:00Z'),
  ]);

  assert.deepEqual(ordered.map(({ photo }) => photo.id), ['no-shot-at', 'shot-later']);
});

test('undated photos sink to the end instead of posing as the oldest', () => {
  const ordered = orderManholePhotosChronologically([
    shot('undated', 'not-a-date', 'also-not-a-date'),
    shot('dated', '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z'),
  ]);

  assert.deepEqual(ordered.map(({ photo }) => photo.id), ['dated', 'undated']);
});
