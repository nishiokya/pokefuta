import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_AVATAR_TTL_MS, loadPublicAvatarPhotoId, setPublicAvatarPhotoId } from '../src/lib/public-avatars';

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

test('5分たったら取り直す（他の人が選び直したアイコンに追いつく）', async () => {
  let value = 'old';
  let calls = 0;
  globalThis.fetch = (async (url: string) => {
    calls += 1;
    const ids = new URL(url, 'http://x').searchParams.get('ids')!.split(',');
    return new Response(JSON.stringify({ avatars: Object.fromEntries(ids.map((i) => [i, value])) }));
  }) as typeof fetch;
  const t0 = 1_000_000;
  assert.equal(await loadPublicAvatarPhotoId(id(200), t0), 'old');
  value = 'new';
  assert.equal(await loadPublicAvatarPhotoId(id(200), t0 + 60_000), 'old');
  assert.equal(calls, 1);
  assert.equal(await loadPublicAvatarPhotoId(id(200), t0 + PUBLIC_AVATAR_TTL_MS + 1), 'new');
  assert.equal(calls, 2);
});

test('取得に失敗したときは覚えず、次に頼まれたら取り直す', async () => {
  let ok = false;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return ok
      ? new Response(JSON.stringify({ avatars: { [id(300)]: 'photo-300' } }))
      : new Response('x', { status: 503 });
  }) as typeof fetch;
  assert.equal(await loadPublicAvatarPhotoId(id(300)), null);
  ok = true;
  assert.equal(await loadPublicAvatarPhotoId(id(300)), 'photo-300');
  assert.equal(calls, 2);
});

test('本人が選び直したら、覚えている値をすぐ差し替える', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ avatars: { [id(400)]: 'before' } }));
  }) as typeof fetch;
  assert.equal(await loadPublicAvatarPhotoId(id(400)), 'before');
  setPublicAvatarPhotoId(id(400), 'after');
  assert.equal(await loadPublicAvatarPhotoId(id(400)), 'after');
  assert.equal(calls, 1);
});

test('サーバーで取れなかった人（avatars に入っていない）は覚えず、取れた人だけ覚える', async () => {
  let calls = 0;
  globalThis.fetch = (async (url: string) => {
    calls += 1;
    const ids = new URL(url, 'http://x').searchParams.get('ids')!.split(',');
    // 1回目は id(501) だけ取れない
    const avatars = Object.fromEntries(ids.filter((i) => calls > 1 || i !== id(501)).map((i) => [i, `p-${i.slice(-3)}`]));
    return new Response(JSON.stringify({ avatars }));
  }) as typeof fetch;
  const [a, b] = await Promise.all([loadPublicAvatarPhotoId(id(500)), loadPublicAvatarPhotoId(id(501))]);
  assert.equal(a, 'p-500');
  assert.equal(b, null);
  assert.equal(await loadPublicAvatarPhotoId(id(500)), 'p-500');
  assert.equal(calls, 1);
  assert.equal(await loadPublicAvatarPhotoId(id(501)), 'p-501');
  assert.equal(calls, 2);
});
