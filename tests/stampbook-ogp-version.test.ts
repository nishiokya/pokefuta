import test from 'node:test';
import assert from 'node:assert/strict';
import { STAMPBOOK_OGP_TEMPLATE_VERSION, stampbookOgpVersion } from '../src/lib/stampbook-ogp-version.ts';

const base = () => ({
  snapshotRev: '12.3.45',
  totalVisits: 12,
  prefectureCount: 3,
  displayName: 'ポケふた太郎',
  visits: [
    { createdAt: '2026-11-01T00:00:00Z', shotAt: '2026-10-30T00:00:00Z', photoIds: ['p1', 'p2'] },
    { createdAt: '2026-10-01T00:00:00Z', shotAt: null, photoIds: [] },
  ],
});

test('同じ入力なら同じバージョン（テンプレート版で始まり、R2 キーに使える文字だけ）', () => {
  const v = stampbookOgpVersion(base());
  assert.equal(v, stampbookOgpVersion(base()));
  assert.ok(v.startsWith(`${STAMPBOOK_OGP_TEMPLATE_VERSION}-`));
  assert.match(v, /^[A-Za-z0-9-]+$/);
});

test('DB の版（rev）が変わるとバージョンが変わる（ドットはキーに使える形にする）', () => {
  const data = base();
  data.snapshotRev = '12.3.46';
  assert.notEqual(stampbookOgpVersion(data), stampbookOgpVersion(base()));
  assert.ok(stampbookOgpVersion(base()).includes('-r12-3-45-'));
  // rev の区切りを変えただけの別の組が同じ印にならない
  data.snapshotRev = '1.23.45';
  assert.notEqual(stampbookOgpVersion(data), stampbookOgpVersion(base()));
});

test('代表写真が変わるとバージョンが変わる', () => {
  const data = base();
  data.visits[1].photoIds = ['p3'];
  assert.notEqual(stampbookOgpVersion(data), stampbookOgpVersion(base()));
});

test('表示名が変わるとバージョンが変わる', () => {
  const data = base();
  data.displayName = '別の名前';
  assert.notEqual(stampbookOgpVersion(data), stampbookOgpVersion(base()));
});
