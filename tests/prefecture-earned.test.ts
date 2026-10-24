import assert from 'node:assert/strict';
import test from 'node:test';
import { findEarnedCompletion } from '../src/lib/prefecture-earned';

const t = (day: number) => Date.UTC(2026, 0, day);
const iso = (day: number) => new Date(t(day)).toISOString();
// 一括投入（1日）より後に増えた蓋だけを「あとから増えた」と扱う
const CUTOFF = t(1);

test('全部回ると1回制覇。新しいポケふたが増えても制覇の日と枚数は残る', () => {
  const manholes = [
    { id: 1, created_at: iso(1) },
    { id: 2, created_at: iso(1) },
    { id: 3, created_at: iso(10) },
  ];
  const result = findEarnedCompletion(manholes, new Map([[1, t(2)], [2, t(3)]]), CUTOFF);
  assert.deepEqual(result, { earnedAt: iso(3), earnedTotal: 2, earnedCount: 1 });
});

test('増えた分まで回ってもう一度そろうと2回（金が2つ）', () => {
  const manholes = [
    { id: 1, created_at: iso(1) },
    { id: 2, created_at: iso(10) },
  ];
  const result = findEarnedCompletion(manholes, new Map([[1, t(2)], [2, t(12)]]), CUTOFF);
  assert.deepEqual(result, { earnedAt: iso(2), earnedTotal: 2, earnedCount: 2 });
});

test('増える前に現地で訪問していた蓋は、崩れずに1回のまま', () => {
  const manholes = [
    { id: 1, created_at: iso(1) },
    { id: 2, created_at: iso(10) },
  ];
  const result = findEarnedCompletion(manholes, new Map([[1, t(2)], [2, t(5)]]), CUTOFF);
  assert.equal(result.earnedCount, 1);
  assert.equal(result.earnedTotal, 2);
});

test('一度もそろっていなければ0回', () => {
  const manholes = [{ id: 1, created_at: iso(1) }, { id: 2, created_at: iso(1) }];
  assert.deepEqual(findEarnedCompletion(manholes, new Map([[1, t(2)]]), CUTOFF), { earnedAt: null, earnedTotal: 0, earnedCount: 0 });
});
