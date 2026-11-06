import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPublicAvatarPhotoId } from '../src/lib/public-avatars';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('同じ描画の間に頼まれた公開ID を30件ずつ1回のリクエストに束ね、同じ人は2度取りに行かない', async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const ids = new URL(url, 'http://x').searchParams.get('ids')!.split(',');
    return new Response(JSON.stringify({ avatars: Object.fromEntries(ids.map((i) => [i, i === id(1) ? 'photo-1' : null])) }));
  }) as typeof fetch;

  const results = await Promise.all(Array.from({ length: 31 }, (_, n) => loadPublicAvatarPhotoId(id(n))));
  assert.equal(calls.length, 2);
  assert.equal(results[1], 'photo-1');
  assert.equal(results[0], null);

  assert.equal(await loadPublicAvatarPhotoId(id(1).toUpperCase()), 'photo-1');
  assert.equal(calls.length, 2);
});

test('取れなかったときは null（人のマークのまま）', async () => {
  globalThis.fetch = (async () => new Response('x', { status: 500 })) as typeof fetch;
  assert.equal(await loadPublicAvatarPhotoId(id(99)), null);
});
