import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBulkPhotos,
  countNewManholes,
  findNearestManholeAnyDistance,
  jstDayKey,
} from '../src/lib/bulk-upload.ts';

// 1度の緯度 ≒ 111km。0.0001度 ≒ 11m
const A = { id: 1, latitude: 35.0, longitude: 135.0 };
const B = { id: 2, latitude: 35.1, longitude: 135.1 };
const manholes = [A, B];

const at = (iso: string) => new Date(iso);

test('日本時間の日付で区切る（UTC では前日でも JST の日付になる）', () => {
  assert.equal(jstDayKey(at('2026-03-08T16:30:00Z')), '2026-03-09');
  assert.equal(jstDayKey(at('2026-03-08T14:59:00Z')), '2026-03-08');
});

test('最寄りの蓋は距離の上限なしで返す', () => {
  const near = findNearestManholeAnyDistance(35.0011, 135.0, manholes);
  assert.equal(near?.manhole.id, 1);
  assert.ok(near && near.distanceM > 100 && near.distanceM < 140);
  assert.equal(findNearestManholeAnyDistance(35, 135, []), null);
});

test('GPS なし・50m 超・投稿できる写真に振り分け、蓋 × 日でまとめる', () => {
  const result = classifyBulkPhotos(
    [
      { id: 'p1', latitude: 35.0001, longitude: 135.0, shotAt: at('2026-03-09T05:00:00Z') },
      { id: 'p2', latitude: 35.0002, longitude: 135.0, shotAt: at('2026-03-09T04:59:00Z') },
      { id: 'p3', latitude: 35.0, longitude: 135.0, shotAt: at('2026-03-10T05:00:00Z') },
      { id: 'p4', latitude: 35.0011, longitude: 135.0, shotAt: at('2026-03-09T05:00:00Z') },
      { id: 'p5', shotAt: at('2026-03-09T05:00:00Z') },
    ],
    manholes,
    []
  );
  assert.deepEqual(result.noGps, ['p5']);
  assert.equal(result.far.length, 1);
  assert.equal(result.far[0].photoId, 'p4');
  assert.equal(result.far[0].nearest?.manhole.id, 1);

  assert.equal(result.groups.length, 2);
  const [first, second] = result.groups;
  // 撮影の古い順。グループ内も撮影順
  assert.equal(first.key, '1:2026-03-09');
  assert.deepEqual(first.photoIds, ['p2', 'p1']);
  assert.equal(first.firstShotAt.toISOString(), '2026-03-09T04:59:00.000Z');
  assert.equal(second.key, '1:2026-03-10');
  // 同じ蓋が2日あっても「初めて」は早い日だけ
  assert.equal(first.isNewManhole, true);
  assert.equal(second.isNewManhole, false);
  assert.equal(result.statusById.p1, 'ok');
  assert.equal(result.statusById.p4, 'far');
  assert.equal(result.statusById.p5, 'no_gps');
});

test('同じ蓋・同じ日（日本時間）の自分の訪問があれば投稿済みにし、写真を足す先を持つ', () => {
  const result = classifyBulkPhotos(
    [
      { id: 'p1', latitude: 35.0, longitude: 135.0, shotAt: at('2026-03-09T01:00:00Z') },
      { id: 'p2', latitude: 35.1, longitude: 135.1, shotAt: at('2026-03-09T02:00:00Z') },
    ],
    manholes,
    [
      // JST では 2026-03-09 09:30。UTC の日付は同じだが、日本時間で比べていることを見る
      { id: 'v-old', manhole_id: 1, shot_at: '2026-03-09T00:30:00Z' },
      // 別の日の訪問は「投稿済み」にしないが、蓋は「初めて」ではなくなる
      { id: 'v-other-day', manhole_id: 2, shot_at: '2026-03-01T00:00:00Z' },
    ]
  );
  const g1 = result.groups.find((g) => g.manhole.id === 1)!;
  const g2 = result.groups.find((g) => g.manhole.id === 2)!;
  assert.equal(g1.existingVisitId, 'v-old');
  assert.equal(result.statusById.p1, 'posted');
  assert.equal(g2.existingVisitId, null);
  assert.equal(result.statusById.p2, 'ok');
  assert.equal(g2.isNewManhole, false);
});

test('日本時間の日付またぎ: UTC で同じ日でも JST で別の日なら投稿済みにしない', () => {
  const result = classifyBulkPhotos(
    [{ id: 'p1', latitude: 35.0, longitude: 135.0, shotAt: at('2026-03-09T16:00:00Z') }], // JST 3/10 01:00
    manholes,
    [{ id: 'v1', manhole_id: 1, shot_at: '2026-03-09T01:00:00Z' }] // JST 3/9 10:00
  );
  assert.equal(result.groups[0].existingVisitId, null);
});

test('新しく集めた蓋は、送れた訪問だけで数える', () => {
  const { groups } = classifyBulkPhotos(
    [
      { id: 'p1', latitude: 35.0, longitude: 135.0, shotAt: at('2026-03-09T01:00:00Z') },
      { id: 'p2', latitude: 35.1, longitude: 135.1, shotAt: at('2026-03-09T02:00:00Z') },
    ],
    manholes,
    []
  );
  assert.equal(countNewManholes(groups, new Set(['1:2026-03-09', '2:2026-03-09'])), 2);
  assert.equal(countNewManholes(groups, new Set(['1:2026-03-09'])), 1);
});
