import test from 'node:test';
import assert from 'node:assert/strict';
import { sortCatalog } from '../src/lib/manhole-catalog-sort.ts';

test('都道府県・市区町村・id の順に並べ、NULL は最後（DB の order by と同じ）', () => {
  const rows = [
    { id: 3, prefecture: '北海道', municipality: '札幌市' },
    { id: 9, prefecture: null, municipality: null },
    { id: 2, prefecture: '北海道', municipality: null },
    { id: 5, prefecture: '青森県', municipality: '八戸市' },
    { id: 1, prefecture: '北海道', municipality: '札幌市' },
    { id: 4, prefecture: '北海道', municipality: '函館市' },
  ];
  assert.deepEqual(
    sortCatalog(rows).map((r) => r.id),
    [4, 1, 3, 2, 5, 9]
  );
});

test('元の配列は並べ替えない', () => {
  const rows = [
    { id: 2, prefecture: 'b', municipality: null },
    { id: 1, prefecture: 'a', municipality: null },
  ];
  sortCatalog(rows);
  assert.deepEqual(rows.map((r) => r.id), [2, 1]);
});
