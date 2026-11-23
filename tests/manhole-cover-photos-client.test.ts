import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchCoverPhotos, resetCoverPhotoCacheForTest } from '../src/lib/manhole-cover-photos-client';

type Handler = (url: string) => unknown | null;

function stubFetch(handler: Handler) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const body = handler(url);
    if (body === null) return new Response('ng', { status: 500 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const snapshot = (manholes: unknown[]) => ({ success: true, total: manholes.length, with_photos: 0, manholes });

test('manholes.json に cover があれば、代表写真の API を呼ばない', async () => {
  resetCoverPhotoCacheForTest();
  const { calls, restore } = stubFetch((url) =>
    url.includes('/api/manholes.json')
      ? snapshot([{ id: 1, cover: { photo_id: 'p1', lid: null, crop: null } }, { id: 2 }])
      : null
  );
  try {
    const { photos, failedIds } = await fetchCoverPhotos([1, 2]);
    assert.deepEqual(Object.keys(photos), ['1']);
    assert.equal(photos['1'].photo_id, 'p1');
    assert.equal(failedIds.size, 0);
    assert.ok(!calls.some((u) => u.includes('/api/manholes/cover-photos')));
  } finally {
    restore();
  }
});

test('cover が載っていないスナップショットなら、今までのバケツ API に戻る', async () => {
  resetCoverPhotoCacheForTest();
  const { calls, restore } = stubFetch((url) => {
    if (url.includes('/api/manholes.json')) return snapshot([{ id: 1 }]);
    if (url.includes('/api/manholes/cover-photos?bucket=0')) {
      return { success: true, photos: { '1': { photo_id: 'p9', thumbnail_url: 'x', is_landscape: false, lid_crop: null } } };
    }
    return null;
  });
  try {
    const { photos } = await fetchCoverPhotos([1]);
    assert.equal(photos['1'].photo_id, 'p9');
    assert.ok(calls.some((u) => u.includes('/api/manholes/cover-photos?bucket=0')));
  } finally {
    restore();
  }
});

test('スナップショットが取れないときもバケツ API に戻り、次は取り直す', async () => {
  resetCoverPhotoCacheForTest();
  let snapshotUp = false;
  const { calls, restore } = stubFetch((url) => {
    if (url.includes('/api/manholes.json')) return snapshotUp ? snapshot([{ id: 1, cover: { photo_id: 'p1' } }]) : null;
    if (url.endsWith('/api/manholes')) return null;
    if (url.includes('/api/manholes/cover-photos')) return { success: true, photos: {} };
    return null;
  });
  try {
    await fetchCoverPhotos([1]);
    assert.ok(calls.some((u) => u.includes('/api/manholes/cover-photos')));
    snapshotUp = true;
    const { photos } = await fetchCoverPhotos([1]);
    assert.equal(photos['1']?.photo_id, 'p1');
  } finally {
    restore();
  }
});
