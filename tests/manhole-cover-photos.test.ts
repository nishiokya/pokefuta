import assert from 'node:assert/strict';
import test from 'node:test';
import { pickCoverPhotos, type CoverPhotoCandidate } from '../src/lib/manhole-cover-photos';

const photo = (
  id: string,
  manholeId: number | null,
  options: { qualityScore?: number; isLandscape?: boolean; createdAt?: string } = {}
): CoverPhotoCandidate => ({
  id,
  manhole_id: manholeId,
  created_at: options.createdAt ?? '2026-10-01T00:00:00Z',
  quality_score: options.qualityScore ?? null,
  is_landscape: options.isLandscape ?? false,
  visit: { comment: null, is_public: true },
});

test('蓋ごとに1枚、スコアの高い写真を選ぶ', () => {
  const result = pickCoverPhotos([
    photo('a', 404, { qualityScore: 0.4 }),
    photo('b', 404, { qualityScore: 0.9 }),
    photo('c', 405),
  ]);
  assert.deepEqual(Object.keys(result).sort(), ['404', '405']);
  assert.equal(result['404'].photo_id, 'b');
  assert.equal(result['404'].thumbnail_url, '/api/photo/b?size=small');
  assert.equal(result['405'].photo_id, 'c');
});

test('風景は蓋の写真より後ろ。風景しか無ければ風景を出す', () => {
  const result = pickCoverPhotos([
    photo('scenery', 1, { isLandscape: true, createdAt: '2026-10-05T00:00:00Z' }),
    photo('lid', 1, { createdAt: '2026-01-01T00:00:00Z' }),
    photo('only-scenery', 2, { isLandscape: true }),
  ]);
  assert.equal(result['1'].photo_id, 'lid');
  assert.equal(result['1'].is_landscape, false);
  assert.equal(result['2'].photo_id, 'only-scenery');
  assert.equal(result['2'].is_landscape, true);
});

test('蓋に紐付かない写真は無視する', () => {
  assert.deepEqual(pickCoverPhotos([photo('x', null)]), {});
});
