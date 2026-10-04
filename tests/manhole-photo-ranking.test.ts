import assert from 'node:assert/strict';
import test from 'node:test';
import {
  orderManholePhotosChronologically,
  orderManholePhotosNewestFirst,
  orderManholePhotosForViewer,
  photoChronologyDate,
  rankManholePhotos,
} from '../src/lib/manhole-photo-ranking';

const photo = (
  id: string,
  options: {
    score?: number | null;
    qualityScore?: number | null;
    eligible?: boolean | null;
    isLandscape?: boolean;
    createdAt?: string;
    userId?: string;
    isPublic?: boolean;
    comment?: string | null;
    aiTags?: unknown;
  } = {}
) => ({
  id,
  created_at: options.createdAt ?? '2026-08-01T00:00:00.000Z',
  score: options.score,
  quality_score: options.qualityScore,
  quality_eligible: options.eligible,
  is_landscape: options.isLandscape,
  ai_tags: options.aiTags,
  visit: {
    user_id: options.userId ?? 'community',
    is_public: options.isPublic ?? true,
    comment: options.comment ?? null,
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

test('photo.quality_score from the DB ranks photos', () => {
  const ranked = rankManholePhotos([
    photo('unscored', { createdAt: '2026-09-26T00:00:00.000Z' }),
    photo('low', { qualityScore: 0.61, eligible: true }),
    photo('high', { qualityScore: 0.9, eligible: true }),
  ]);

  assert.deepEqual(ranked.map(({ id }) => id), ['high', 'low', 'unscored']);
});

test('photos judged ineligible go after unscored ones, even with a high score', () => {
  const ranked = rankManholePhotos([
    photo('clipped', { qualityScore: 0.93, eligible: false }),
    photo('unscored', { createdAt: '2026-09-26T00:00:00.000Z' }),
    photo('ok', { qualityScore: 0.55, eligible: true }),
    photo('blurry', { qualityScore: 0.4, eligible: false }),
  ]);

  assert.deepEqual(ranked.map(({ id }) => id), ['ok', 'unscored', 'clipped', 'blurry']);
});

test('a manhole whose photos are all ineligible still gets a representative', () => {
  const result = orderManholePhotosForViewer([
    photo('worse', { qualityScore: 0.3, eligible: false }),
    photo('better', { qualityScore: 0.5, eligible: false }),
  ], null);

  assert.equal(result.representativePhoto?.id, 'better');
});

test('a landscape never outranks a lid, even with a comment and higher score', () => {
  const photos = [
    photo('scenery', { isLandscape: true, qualityScore: 1, comment: '公園の入口です', userId: 'me' }),
    photo('lid', { qualityScore: 0.1 }),
  ];
  for (const viewer of [null, 'me']) {
    const result = orderManholePhotosForViewer(photos, viewer);
    assert.equal(result.representativePhoto?.id, 'lid');
    assert.deepEqual(result.orderedPhotos.map(p => p.id), ['lid', 'scenery']);
  }
});

test('landscape-only galleries stay visible without a representative or private-photo leak', () => {
  const photos = [
    photo('public-scenery', { isLandscape: true }),
    photo('private-scenery', { isLandscape: true, userId: 'me', isPublic: false }),
  ];
  const anonymous = orderManholePhotosForViewer(photos, null);
  assert.equal(anonymous.representativePhoto, null);
  assert.deepEqual(anonymous.orderedPhotos.map(p => p.id), ['public-scenery']);
  const owner = orderManholePhotosForViewer(photos, 'me');
  assert.equal(owner.representativePhoto, null);
  assert.equal(owner.orderedPhotos.length, 2);
  assert.equal(owner.myPhotos.length, 1);
});

test('a photo with a comment is representative even when others score higher', () => {
  const ranked = rankManholePhotos([
    photo('best-no-comment', { qualityScore: 0.92, eligible: true }),
    photo('commented-low', { qualityScore: 0.6, eligible: true, comment: '駅前の交差点にありました' }),
    photo('commented-high', { qualityScore: 0.8, eligible: true, comment: '公園の入口の横です' }),
    photo('second-no-comment', { qualityScore: 0.7, eligible: true }),
  ]);

  assert.deepEqual(
    ranked.map(({ id }) => id),
    ['commented-high', 'commented-low', 'best-no-comment', 'second-no-comment']
  );
});

test('junk comments do not jump the queue', () => {
  const ranked = rankManholePhotos([
    photo('junk', { qualityScore: 0.5, eligible: true, comment: '15' }),
    photo('best', { qualityScore: 0.9, eligible: true }),
  ]);

  assert.deepEqual(ranked.map(({ id }) => id), ['best', 'junk']);
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

test('the display date comes from the same judgement as the sort', () => {
  // 並びと表示を別々に実装すると、created_at で並べた写真の日付欄だけが空になる。
  // 表示側が撮影日と言い切れないケースを source で見分けられること。
  assert.deepEqual(photoChronologyDate(shot('shot', '2026-08-20T00:00:00Z', '2026-08-01T00:00:00Z')), {
    iso: '2026-08-20T00:00:00Z',
    time: Date.parse('2026-08-20T00:00:00Z'),
    source: 'shot',
  });
  assert.deepEqual(photoChronologyDate(shot('fallback', null, '2026-08-05T00:00:00Z')), {
    iso: '2026-08-05T00:00:00Z',
    time: Date.parse('2026-08-05T00:00:00Z'),
    source: 'upload',
  });
  assert.deepEqual(photoChronologyDate(shot('broken-shot-at', 'not-a-date', '2026-08-05T00:00:00Z')), {
    iso: '2026-08-05T00:00:00Z',
    time: Date.parse('2026-08-05T00:00:00Z'),
    source: 'upload',
  });
  assert.equal(photoChronologyDate(shot('undated', 'not-a-date', 'also-not-a-date')), null);
});

test('newest-first puts the latest shot first and keeps undated photos at the end', () => {
  const ordered = orderManholePhotosNewestFirst([
    shot('undated', 'not-a-date', 'also-not-a-date'),
    shot('aug11', '2026-08-11T00:00:00Z', '2026-08-24T00:00:00Z'),
    shot('aug30', '2026-08-30T00:00:00Z', '2026-08-30T00:00:00Z'),
    shot('y2024', '2024-07-13T00:00:00Z', '2026-08-13T00:00:00Z'),
  ]);

  assert.deepEqual(
    ordered.map(({ photo, index }) => [photo.id, index]),
    [['aug30', 2], ['aug11', 1], ['y2024', 3], ['undated', 0]]
  );
});

const CENTERED_FITS = { model: 'scene_attrs/1', scene: 'centered_clean', crop: [0.12, 0, 0.87, 1], lid_fits: true };

test('among scored candidates, a centered photo whose lid fits the square comes before a higher score', () => {
  const ranked = rankManholePhotos([
    photo('wide-high', { qualityScore: 0.84, aiTags: { model: 'scene_attrs/1', scene: 'wide_context' } }),
    photo('centered-fits', { qualityScore: 0.82, aiTags: CENTERED_FITS }),
  ]);
  assert.deepEqual(ranked.map((item) => item.id), ['centered-fits', 'wide-high']);
});

test('a centered close-up whose lid does not fit the square keeps the score order', () => {
  const ranked = rankManholePhotos([
    photo('wide-high', { qualityScore: 0.84, aiTags: { model: 'scene_attrs/1', scene: 'wide_context' } }),
    photo('closeup', { qualityScore: 0.82, aiTags: { ...CENTERED_FITS, lid_fits: false } }),
    photo('untagged', { qualityScore: 0.83 }),
  ]);
  assert.deepEqual(ranked.map((item) => item.id), ['wide-high', 'untagged', 'closeup']);
});

test('the centered preference does not jump over comments, unscored or ineligible tiers', () => {
  const ranked = rankManholePhotos([
    photo('centered-ineligible', { qualityScore: 0.9, eligible: false, aiTags: CENTERED_FITS }),
    photo('unscored', { createdAt: '2026-08-15T00:00:00.000Z' }),
    photo('commented', { qualityScore: 0.5, comment: '道の駅の入り口にありました' }),
    photo('centered', { qualityScore: 0.6, aiTags: CENTERED_FITS }),
  ]);
  assert.deepEqual(ranked.map((item) => item.id), ['commented', 'centered', 'unscored', 'centered-ineligible']);
});
