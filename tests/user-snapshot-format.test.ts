import test from 'node:test';
import assert from 'node:assert/strict';
import {
  USER_SNAPSHOT_MAX_AGE_MS,
  USER_SNAPSHOT_VERSION,
  normalizeSnapshotUserId,
  parseUserSnapshot,
  userSnapshotKey,
} from '../src/lib/user-snapshot-format.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-11-24T12:00:00Z');

const snapshot = (over: Record<string, unknown> = {}) => ({
  v: USER_SNAPSHOT_VERSION,
  generatedAt: new Date(NOW - 60_000).toISOString(),
  publicUserId: ID,
  profile: { display_name: 'テスト' },
  avatarPhotoId: null,
  cards: [],
  progressRows: [],
  stats: { totalVisits: 0, prefectureCount: 0 },
  counts: { designManhole: 0, plush: 0, snow: 0 },
  ...over,
});

test('新しく正しい形なら読める', () => {
  assert.ok(parseUserSnapshot(JSON.stringify(snapshot()), ID, NOW));
});

test('寿命（1日）を過ぎたものは読まない（自動採点など、アプリを通らない変更を拾うため）', () => {
  const old = snapshot({ generatedAt: new Date(NOW - USER_SNAPSHOT_MAX_AGE_MS - 1).toISOString() });
  assert.equal(parseUserSnapshot(JSON.stringify(old), ID, NOW), null);
});

test('未来の時刻・壊れた時刻は読まない', () => {
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot({ generatedAt: new Date(NOW + 3_600_000).toISOString() })), ID, NOW), null);
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot({ generatedAt: 'x' })), ID, NOW), null);
});

test('別の人・別の版・壊れた JSON は読まない', () => {
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot()), '00000000-0000-4000-8000-000000000002', NOW), null);
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot({ v: USER_SNAPSHOT_VERSION + 1 })), ID, NOW), null);
  assert.equal(parseUserSnapshot('{', ID, NOW), null);
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot({ cards: null })), ID, NOW), null);
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot({ counts: { plush: 0 } })), ID, NOW), null);
  // 一部が欠けたもの・作り直せなかった印は読まない
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot({ missing: { cards: true } })), ID, NOW), null);
  assert.equal(parseUserSnapshot(JSON.stringify({ v: USER_SNAPSHOT_VERSION, tombstone: true, publicUserId: ID, at: new Date(NOW).toISOString() }), ID, NOW), null);
});

test('キーは公開ID（UUID）だけから作り、版で分ける', () => {
  assert.equal(userSnapshotKey(ID), `snapshots/users/v${USER_SNAPSHOT_VERSION}/${ID}.json`);
  assert.equal(normalizeSnapshotUserId(ID), ID);
  // 大文字の URL でも同じキーになる（書き込み後の作り直しから漏れない）
  assert.equal(normalizeSnapshotUserId(` ${ID.toUpperCase()} `), ID);
  assert.equal(normalizeSnapshotUserId('../x'), null);
  assert.equal(normalizeSnapshotUserId(`${ID}/x`), null);
});
