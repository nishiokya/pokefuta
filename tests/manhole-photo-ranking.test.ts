import assert from 'node:assert/strict';
import test from 'node:test';
import { orderManholePhotosForViewer, rankManholePhotos } from '../src/lib/manhole-photo-ranking';

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
