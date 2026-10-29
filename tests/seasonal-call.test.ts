import assert from 'node:assert/strict';
import test from 'node:test';
import { activeSeasonalCall, type SeasonalCall } from '../src/lib/seasonal-call';

const calls: SeasonalCall[] = [{ key: 'a', icon: '🍁', name: '紅葉', until: '2026-12-10' }];

test('終わりの日（日本時間）の終わりまで出て、翌日から消える', () => {
  assert.equal(activeSeasonalCall(new Date('2026-10-30T00:00:00+09:00'), calls)?.key, 'a');
  assert.equal(activeSeasonalCall(new Date('2026-12-10T23:59:59+09:00'), calls)?.key, 'a');
  assert.equal(activeSeasonalCall(new Date('2026-12-11T00:00:00+09:00'), calls), null);
});

test('UTC では前日でも、日本時間の日付で数える', () => {
  // 2026-12-10 16:00 UTC = 日本時間 12-11 01:00
  assert.equal(activeSeasonalCall(new Date('2026-12-10T16:00:00Z'), calls), null);
});
