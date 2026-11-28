import test from 'node:test';
import assert from 'node:assert/strict';
import { ownVisitNeedingTip, parseReviewTips, reviewTipBasis } from '../src/lib/review-tips.ts';

// 図鑑（pokefuta-tracker export_app_snapshot.py の attach_review_tips）が書く形
const snapshotManhole = {
  id: 28,
  review_tips: {
    tips: [
      { key: 'parking_yes', label: '🅿️ 駐車場あり', count: 2, latest: '2026-11' },
      { key: 'station', label: '🚉 駅から歩ける', count: 1, latest: '' },
    ],
    review_count: 7,
    missing: null,
  },
};

test('スナップショットの review_tips を読む', () => {
  assert.deepEqual(parseReviewTips(snapshotManhole), {
    tips: [
      { key: 'parking_yes', label: '🅿️ 駐車場あり', count: 2, latest: '2026-11' },
      { key: 'station', label: '🚉 駅から歩ける', count: 1, latest: '' },
    ],
    reviewCount: 7,
    missing: null,
  });
});

test('口コミ0件の蓋は駐車場の募集だけ', () => {
  const tips = parseReviewTips({ review_tips: { tips: [], review_count: 0, missing: 'parking' } });
  assert.deepEqual(tips, { tips: [], reviewCount: 0, missing: 'parking' });
});

test('review_tips が無い・形が違うときは null（チップも呼びかけも出さない）', () => {
  assert.equal(parseReviewTips({ id: 1 }), null);
  assert.equal(parseReviewTips(null), null);
  assert.equal(parseReviewTips({ review_tips: { tips: 'x', review_count: 1 } }), null);
  assert.equal(parseReviewTips({ review_tips: { tips: [], review_count: -1 } }), null);
});

test('壊れたチップだけを捨て、知らない missing は null にする', () => {
  const tips = parseReviewTips({
    review_tips: {
      tips: [
        { key: 'a', label: '', count: 1 },
        { key: 'b', label: 'B', count: 0 },
        { key: 'c', label: 'C', count: 2, latest: '2026/11' },
      ],
      review_count: 3,
      missing: 'toilet',
    },
  });
  assert.deepEqual(tips, { tips: [{ key: 'c', label: 'C', count: 2, latest: '' }], reviewCount: 3, missing: null });
});

test('根拠の表示', () => {
  assert.equal(reviewTipBasis({ key: 'x', label: 'X', count: 3, latest: '2026-11' }), '口コミ3件・2026/11');
  assert.equal(reviewTipBasis({ key: 'x', label: 'X', count: 1, latest: '' }), '口コミ1件');
});

test('ひとこと無しの自分の訪問（新しいもの）を選ぶ', () => {
  const photos = [
    { visit: { id: 'v-old', is_own: true, comment: '', shot_at: '2025-01-01T00:00:00Z' } },
    { visit: { id: 'v-new', is_own: true, comment: null, shot_at: '2026-05-01T00:00:00Z', is_public: false } },
    { visit: { id: 'v-new', is_own: true, comment: null, shot_at: '2026-05-01T00:00:00Z', is_public: false } },
    { visit: { id: 'v-done', is_own: true, comment: '駐車場あり', shot_at: '2026-09-01T00:00:00Z' } },
    { visit: { id: 'v-other', is_own: false, comment: '', shot_at: '2026-10-01T00:00:00Z' } },
  ];
  assert.deepEqual(ownVisitNeedingTip(photos), { visitId: 'v-new', isPublic: false });
});

test('自分の訪問が全部ひとこと付き・他人の写真だけなら null', () => {
  assert.equal(ownVisitNeedingTip([{ visit: { id: 'v', is_own: true, comment: '駅前' } }]), null);
  assert.equal(ownVisitNeedingTip([{ visit: { id: 'v', is_own: false, comment: '' } }]), null);
  assert.equal(ownVisitNeedingTip([{ visit: null }]), null);
});
