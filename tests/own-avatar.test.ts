import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOwnAvatarPhotoId, notifyOwnAvatarChanged } from '../src/lib/own-avatar';

test('別の人にログインし直したら、前の人のアイコンを使わず取り直す', async () => {
  let current = 'photo-a';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ photoId: current }));
  }) as typeof fetch;

  assert.equal(await loadOwnAvatarPhotoId('user-a'), 'photo-a');
  assert.equal(await loadOwnAvatarPhotoId('user-a'), 'photo-a');
  assert.equal(calls, 1);

  current = 'photo-b';
  assert.equal(await loadOwnAvatarPhotoId('user-b'), 'photo-b');
  assert.equal(calls, 2);
  // ID が分からない画面（null）は今の人の値を使う
  assert.equal(await loadOwnAvatarPhotoId(null), 'photo-b');
  assert.equal(calls, 2);
});

test('選び直しは今の人の値として覚える', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ photoId: 'old' }))) as typeof fetch;
  assert.equal(await loadOwnAvatarPhotoId('user-c'), 'old');
  notifyOwnAvatarChanged('new');
  assert.equal(await loadOwnAvatarPhotoId('user-c'), 'new');
});

test('取れなかったときは undefined（未設定の null と分ける）', async () => {
  globalThis.fetch = (async () => new Response('x', { status: 500 })) as typeof fetch;
  assert.equal(await loadOwnAvatarPhotoId('user-d'), undefined);
});
