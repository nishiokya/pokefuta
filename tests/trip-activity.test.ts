import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupTripVisits, monthlyTripActivity, tripActivityLevel } from '../src/lib/trip-activity';

// 月の区切りはローカル時刻なので、テストの時刻も日本時間の昼にしてタイムゾーンに左右されないようにする
const v = (manhole_id: number | null, shot_at: string) => ({ manhole_id, shot_at });

test('同じ蓋を同じ日に複数回記録しても1件に数える', () => {
  const visits = [
    v(1, '2026-03-10T12:00:00+09:00'),
    v(1, '2026-03-10T13:00:00+09:00'),
    v(1, '2026-03-11T12:00:00+09:00'),
    v(2, '2026-03-10T12:00:00+09:00'),
  ];
  assert.equal(dedupTripVisits(visits).length, 3);
});

test('蓋の無い記録と日付の読めない記録は数えない', () => {
  const visits = [v(null, '2026-03-10T12:00:00+09:00'), v(1, 'not-a-date')];
  assert.deepEqual(monthlyTripActivity(visits), []);
});

test('年は新しい順、記録のない年も間を詰めずに出す', () => {
  const years = monthlyTripActivity([
    v(1, '2024-07-15T12:00:00+09:00'),
    v(2, '2026-03-15T12:00:00+09:00'),
    v(3, '2026-03-16T12:00:00+09:00'),
  ]);
  assert.deepEqual(years.map((y) => y.year), [2026, 2025, 2024]);
  assert.equal(years[0].months[2], 2);
  assert.equal(years[0].total, 2);
  assert.equal(years[1].total, 0);
  assert.equal(years[2].months[6], 1);
});

test('濃さは 0 / 1〜3 / 4〜9 / 10以上 の4段', () => {
  assert.deepEqual([0, 1, 3, 4, 9, 10, 42].map(tripActivityLevel), [0, 1, 1, 2, 2, 3, 3]);
});
