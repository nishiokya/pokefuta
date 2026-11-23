import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarsFor, parseAvatarSnapshot } from '../src/lib/avatar-snapshot.ts';

const A = '08c2bb09-8aa0-44f7-8287-7b332a589f33';
const B = '20a8c7d7-4c81-4f17-aecf-c2b4e4f01170';
const P1 = 'fa6e34f7-116a-4805-86b4-5b3effda890b';

test('avatars.json を公開ID（小文字）→ 写真ID の組にする。形の違う行は捨てる', () => {
  const entries = parseAvatarSnapshot({
    success: true,
    generated_at: '2026-11-23T01:04:59+00:00',
    avatars: { [A.toUpperCase()]: P1, 'not-a-uuid': P1, [B]: 123, '': P1 },
  });
  assert.deepEqual(entries, [[A, P1]]);
});

test('success が無い・avatars が無いものは null（呼び出し側は RPC に戻る）', () => {
  assert.equal(parseAvatarSnapshot(null), null);
  assert.equal(parseAvatarSnapshot({ avatars: { [A]: P1 } }), null);
  assert.equal(parseAvatarSnapshot({ success: true }), null);
  assert.equal(parseAvatarSnapshot({ success: true, avatars: [] }), null);
});

test('0人（空・全部が形違い）も null。全員を未設定として覚えず RPC に戻す', () => {
  assert.equal(parseAvatarSnapshot({ success: true, avatars: {} }), null);
  assert.equal(parseAvatarSnapshot({ success: true, avatars: { 'not-a-uuid': P1 } }), null);
});

test('表に無い人は null（アイコン未設定）、大文字の公開ID でも引ける', () => {
  assert.deepEqual(avatarsFor([A.toUpperCase(), B], [[A, P1]]), { [A.toUpperCase()]: P1, [B]: null });
});
