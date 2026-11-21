import assert from 'node:assert/strict';
import test from 'node:test';
import { pickCoverPhotos, type CoverPhotoCandidate } from '../src/lib/manhole-cover-photos';

const photo = (
  id: string,
  manholeId: number | null,
  options: { qualityScore?: number; isLandscape?: boolean; createdAt?: string; comment?: string } = {}
): CoverPhotoCandidate => ({
  id,
  manhole_id: manholeId,
  created_at: options.createdAt ?? '2026-10-01T00:00:00Z',
  quality_score: options.qualityScore ?? null,
  is_landscape: options.isLandscape ?? false,
  visit: { comment: options.comment ?? null, is_public: true },
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

test('丸に切り抜く位置は ai_tags の lid・crop だけを返す', () => {
  const result = pickCoverPhotos([
    { ...photo('a', 1), ai_tags: { lid: [0.2, 0.2, 0.8, 0.8], crop: [0, 0.1, 1, 0.9], plush: true } },
    photo('b', 2),
  ]);
  assert.deepEqual(result['1'].lid_crop, { lid: [0.2, 0.2, 0.8, 0.8], crop: [0, 0.1, 1, 0.9] });
  assert.equal(result['2'].lid_crop, null);
});

test('丸い切り抜きでは、ひとこと付きでもスコアの高い写真を選ぶ（吹き出しが出ないので）', () => {
  const result = pickCoverPhotos([
    photo('commented', 1, { qualityScore: 0.5, comment: 'ぬいぐるみと一緒に撮りました！' }),
    photo('best', 1, { qualityScore: 0.9 }),
  ]);
  assert.equal(result['1'].photo_id, 'best');
});

test('バケツは蓋 id 100 枚ずつの固定の区切り', async () => {
  const { coverPhotoBucketOf, coverPhotoBucketRange, coverPhotoBucketsFor } = await import('../src/lib/manhole-cover-photos');
  assert.equal(coverPhotoBucketOf(1), 0);
  assert.equal(coverPhotoBucketOf(100), 0);
  assert.equal(coverPhotoBucketOf(101), 1);
  assert.deepEqual(coverPhotoBucketRange(4), { from: 401, to: 500 });
  assert.deepEqual(coverPhotoBucketsFor([404, 1, 405, 250, 0, -3, 1.5]), [0, 2, 4]);
});

test('列を絞って読んだ行から ai_tags を組み立て直し、選び方と切り抜きに使う', async () => {
  const { coverPhotoCandidateFromRow } = await import('../src/lib/manhole-cover-photos');
  const base = {
    manhole_id: 7, created_at: '2026-10-01T00:00:00Z', quality_score: null, quality_eligible: null, is_landscape: false,
    ai_scene: null, ai_lid_fits: null, ai_rep_score: null, ai_lid: null, ai_crop: null,
  };
  const plain = coverPhotoCandidateFromRow({ ...base, id: 'plain', quality_score: 0.9, created_at: '2026-10-09T00:00:00Z' });
  assert.equal(plain.ai_tags, null);
  const centered = coverPhotoCandidateFromRow({
    ...base, id: 'centered', quality_score: 0.5, ai_scene: 'centered_clean', ai_lid_fits: true, ai_lid: { x: 1 }, ai_crop: { y: 2 },
  });
  assert.deepEqual(centered.ai_tags, { scene: 'centered_clean', lid_fits: true, lid: { x: 1 }, crop: { y: 2 } });
  const result = pickCoverPhotos([plain, centered]);
  assert.equal(result['7'].photo_id, 'centered');
  assert.deepEqual(result['7'].lid_crop, { lid: { x: 1 }, crop: { y: 2 } });
});
