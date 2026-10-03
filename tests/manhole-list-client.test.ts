import assert from 'node:assert/strict';
import test from 'node:test';
import {
  API_MANHOLES_URL,
  STATIC_MANHOLES_URL,
  fetchAllManholes,
  pickManholesWithoutPhotos,
} from '../src/lib/manhole-list-client';
import type { SnapshotManhole } from '../src/lib/manhole-snapshot';

const manhole = (id: number, photoCount = 0) =>
  ({ id, title: `蓋${id}`, photo_count: photoCount }) as unknown as SnapshotManhole;

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const snapshot = (manholes: SnapshotManhole[]) => ({
  success: true,
  generated_at: '2026-10-03T00:00:00Z',
  total: manholes.length,
  with_photos: manholes.filter((m) => m.photo_count > 0).length,
  manholes,
});

function recorder(routes: Record<string, () => Promise<Response>>) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  };
  return { calls, fetchImpl };
}

test('静的スナップショットが読めれば /api/manholes を呼ばない', async () => {
  const { calls, fetchImpl } = recorder({
    [STATIC_MANHOLES_URL]: async () => ok(snapshot([manhole(1), manhole(3, 2), manhole(2)])),
  });
  const data = await fetchAllManholes(fetchImpl);
  assert.equal(data?.source, 'static');
  assert.deepEqual(calls, [STATIC_MANHOLES_URL]);
  // /api/manholes と同じ id 降順
  assert.deepEqual(data?.manholes.map((m) => m.id), [3, 2, 1]);
  assert.equal(data?.total, 3);
  assert.equal(data?.with_photos, 1);
});

for (const [label, staticRoute] of [
  ['HTTP エラー', async () => new Response('down', { status: 503 })],
  ['通信エラー', async () => { throw new TypeError('Failed to fetch'); }],
  ['success が false', async () => ok({ success: false, error: 'bake failed' })],
  ['manholes が配列でない', async () => ok({ success: true, manholes: null })],
  ['JSON でない', async () => new Response('<html>', { status: 200 })],
] as const) {
  test(`静的スナップショットが${label}なら /api/manholes に戻る`, async () => {
    const { calls, fetchImpl } = recorder({
      [STATIC_MANHOLES_URL]: staticRoute,
      [API_MANHOLES_URL]: async () => ok(snapshot([manhole(5)])),
    });
    const data = await fetchAllManholes(fetchImpl);
    assert.equal(data?.source, 'api');
    assert.deepEqual(calls, [STATIC_MANHOLES_URL, API_MANHOLES_URL]);
    assert.deepEqual(data?.manholes.map((m) => m.id), [5]);
  });
}

test('静的スナップショットが応答しなければタイムアウトして /api/manholes に戻る', async () => {
  const calls: string[] = [];
  const fetchImpl = (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url === API_MANHOLES_URL) return Promise.resolve(ok(snapshot([manhole(7)])));
    // abort されるまで返らない
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  };
  const started = Date.now();
  const data = await fetchAllManholes(fetchImpl);
  assert.equal(data?.source, 'api');
  assert.deepEqual(calls, [STATIC_MANHOLES_URL, API_MANHOLES_URL]);
  assert.ok(Date.now() - started < 5000);
});

test('両方とも取れなければ null', async () => {
  const { fetchImpl } = recorder({
    [STATIC_MANHOLES_URL]: async () => new Response('down', { status: 503 }),
    [API_MANHOLES_URL]: async () => new Response('down', { status: 503 }),
  });
  assert.equal(await fetchAllManholes(fetchImpl), null);
});

test('写真がない蓋を新しい順に limit 件（filter の後で slice）', () => {
  const list = [manhole(1), manhole(9, 3), manhole(4), manhole(8), manhole(2, 1), manhole(6)];
  assert.deepEqual(pickManholesWithoutPhotos(list, 3).map((m) => m.id), [8, 6, 4]);
  assert.deepEqual(pickManholesWithoutPhotos(list, 12).map((m) => m.id), [8, 6, 4, 1]);
});
