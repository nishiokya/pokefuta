import assert from 'node:assert/strict';
import test from 'node:test';
import { sortEarnedForChips } from '../src/components/users/PrefectureBadgeShelf';

test('チップは制覇したときの枚数の多い順（新設で今の達成率が下がった県も前に来る）', () => {
  const earned = [
    { name: '佐賀県', earnedTotal: 3 },
    { name: '福島県', earnedTotal: 43 },
    { name: '青森県', earnedTotal: 2 },
    { name: '高知県', earnedTotal: 18 },
  ];
  assert.deepEqual(sortEarnedForChips(earned).map((p) => p.name), ['福島県', '高知県', '佐賀県', '青森県']);
  // 元の配列は並べ替えない
  assert.equal(earned[0].name, '佐賀県');
});
