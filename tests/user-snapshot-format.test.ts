import test from 'node:test';
import assert from 'node:assert/strict';
import {
  USER_SNAPSHOT_MAX_AGE_MS,
  USER_SNAPSHOT_VERSION,
  isSnapshotRev,
  normalizeSnapshotUserId,
  parseUserSnapshot,
  snapshotFromDb,
  snapshotRevToken,
  userSnapshotKey,
} from '../src/lib/user-snapshot-format.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-11-24T12:00:00Z');

const snapshot = (over: Record<string, unknown> = {}) => ({
  v: USER_SNAPSHOT_VERSION,
  generatedAt: new Date(NOW - 60_000).toISOString(),
  publicUserId: ID,
  rev: '3.1.7',
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
  // 版（rev）が無い・形が違うものは読まない（ロック方式のころの v1 の JSON・ロックも）
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot({ rev: undefined })), ID, NOW), null);
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot({ rev: 3 })), ID, NOW), null);
  assert.equal(parseUserSnapshot(JSON.stringify(snapshot({ rev: '3.1' })), ID, NOW), null);
  assert.equal(parseUserSnapshot(JSON.stringify({ ...snapshot(), v: 1 }), ID, NOW), null);
  assert.equal(parseUserSnapshot(JSON.stringify({ v: USER_SNAPSHOT_VERSION, lock: true, publicUserId: ID, holders: {} }), ID, NOW), null);
});

test('キーは公開ID（UUID）だけから作り、版で分ける', () => {
  assert.equal(userSnapshotKey(ID), `snapshots/users/v${USER_SNAPSHOT_VERSION}/${ID}.json`);
  assert.equal(normalizeSnapshotUserId(ID), ID);
  // 大文字の URL でも同じキーになる（書き込み後の作り直しから漏れない）
  assert.equal(normalizeSnapshotUserId(` ${ID.toUpperCase()} `), ID);
  assert.equal(normalizeSnapshotUserId('../x'), null);
  assert.equal(normalizeSnapshotUserId(`${ID}/x`), null);
});

test('版の形と OGP 用の表し方（キーに使える文字だけ・区切りの違う組は別の値）', () => {
  assert.ok(isSnapshotRev('0.0.0'));
  assert.ok(isSnapshotRev('12.3.45'));
  assert.equal(isSnapshotRev('12.3'), false);
  assert.equal(isSnapshotRev('1.2.3.4'), false);
  assert.equal(isSnapshotRev('-1.2.3'), false);
  assert.equal(isSnapshotRev(12), false);
  assert.equal(snapshotRevToken('12.3.45'), 'r12-3-45');
  assert.match(snapshotRevToken('12.3.45'), /^[A-Za-z0-9-]+$/);
  assert.notEqual(snapshotRevToken('1.23.45'), snapshotRevToken('12.3.45'));
});

test('DB の戻り値: NULL は利用者なし、形が違えば例外（黙って空のページにしない）', () => {
  const db = { rev: '3.1.7', profile: { display_name: 'テスト' }, avatarPhotoId: null, cards: [], progressRows: [], stats: { totalVisits: 0, prefectureCount: 0 }, counts: { designManhole: 0, plush: 0, snow: 0 } };
  const built = snapshotFromDb(db, ID, NOW);
  assert.equal(built?.rev, '3.1.7');
  assert.equal(built?.publicUserId, ID);
  assert.equal(built?.v, USER_SNAPSHOT_VERSION);
  // 作ったものはそのまま R2 から読める
  assert.ok(parseUserSnapshot(JSON.stringify(built), ID, NOW));
  assert.equal(snapshotFromDb(null, ID, NOW), null);
  assert.throws(() => snapshotFromDb({ ...db, rev: null }, ID, NOW));
  assert.throws(() => snapshotFromDb({ ...db, cards: null }, ID, NOW));
  // プロフィールの行が無いときは名前なしで出す
  assert.deepEqual(snapshotFromDb({ ...db, profile: null }, ID, NOW)?.profile, { display_name: null });
});
