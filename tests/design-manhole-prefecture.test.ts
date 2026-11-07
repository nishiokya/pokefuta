import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDesignManholePrefectures } from '../src/lib/design-manhole-prefecture';
import { nearestPrefecture } from '../src/lib/prefectures';

const realFetch = globalThis.fetch;

function mockFetch(handler: (url: URL) => Promise<Response> | Response) {
  globalThis.fetch = ((input: RequestInfo | URL) => handler(new URL(String(input)))) as typeof fetch;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test('nearestPrefecture は県庁所在地の近さで選ぶ（県境では外れうる予備）', () => {
  assert.equal(nearestPrefecture(35.86, 139.65).name, '埼玉県');
  // 函館は札幌より青森市に近いので、近さだけだと青森になる（住所判定を正にする理由）
  assert.equal(nearestPrefecture(41.77, 140.73).name, '青森県');
});

test('国土地理院の市区町村コード先頭2桁で県を決める', async () => {
  mockFetch(() => Response.json({ results: { muniCd: '01202', lv01Nm: '' } }));
  const result = await resolveDesignManholePrefectures([
    { id: 'pref-test-hakodate', latitude: 41.77, longitude: 140.73 },
  ]);
  assert.deepEqual(result, { 'pref-test-hakodate': '北海道' });
});

test('先頭の0が落ちた4桁コードも県コードとして読む', async () => {
  mockFetch(() => Response.json({ results: { muniCd: '9201' } }));
  const result = await resolveDesignManholePrefectures([
    { id: 'pref-test-4digit', latitude: 36.56, longitude: 139.88 },
  ]);
  assert.deepEqual(result, { 'pref-test-4digit': '栃木県' });
});

test('引けない（海上・失敗）ときは近い県で埋める', async () => {
  mockFetch(() => Response.json({ results: null }));
  const result = await resolveDesignManholePrefectures([
    { id: 'pref-test-sea', latitude: 35.86, longitude: 139.65 },
  ]);
  assert.deepEqual(result, { 'pref-test-sea': '埼玉県' });
});

test('時間内に返らなければ待たずに近い県で返し、後から返った値は次回使う', async () => {
  let release: (() => void) | undefined;
  mockFetch(
    () =>
      new Promise<Response>((resolve) => {
        release = () => resolve(Response.json({ results: { muniCd: '07364' } }));
      })
  );
  const item = { id: 'pref-test-slow', latitude: 37.03, longitude: 140.39 };
  const first = await resolveDesignManholePrefectures([item], 20);
  assert.deepEqual(first, { 'pref-test-slow': '栃木県' });

  release?.();
  await new Promise((resolve) => setTimeout(resolve, 10));
  mockFetch(() => {
    throw new Error('キャッシュ済みなので問い合わせない');
  });
  const second = await resolveDesignManholePrefectures([item], 20);
  assert.deepEqual(second, { 'pref-test-slow': '福島県' });
});
