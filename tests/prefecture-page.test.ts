import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrefectureOverview,
  resolvePrefectureParam,
  type PrefectureManholeInput,
} from '../src/lib/prefecture-page';

function manhole(
  id: number,
  prefecture: string,
  photoCount: number,
  extra: Partial<PrefectureManholeInput> = {}
): PrefectureManholeInput {
  return {
    id,
    prefecture,
    photo_count: photoCount,
    latitude: 31.9,
    longitude: 131.4,
    ...extra,
  };
}

test('日本語の都道府県名をそのまま受ける', () => {
  assert.equal(resolvePrefectureParam('宮崎県'), '宮崎県');
  assert.equal(resolvePrefectureParam('北海道'), '北海道');
});

test('図鑑と同じローマ字 slug でも引ける', () => {
  assert.equal(resolvePrefectureParam('miyazaki'), '宮崎県');
  assert.equal(resolvePrefectureParam('HOKKAIDO'), '北海道');
});

test('多重エンコードされた URL でも拾う', () => {
  assert.equal(resolvePrefectureParam(encodeURIComponent('宮崎県')), '宮崎県');
});

test('都道府県でない値は null（404 にする）', () => {
  assert.equal(resolvePrefectureParam('宮崎'), null);
  assert.equal(resolvePrefectureParam(''), null);
  assert.equal(resolvePrefectureParam('%E3%81%82%'), null);
});

test('写真がない蓋を先に、市区町村ごとにまとめて並べる', () => {
  const overview = buildPrefectureOverview(
    [
      manhole(3, '宮崎県', 0, { municipality: '延岡市' }),
      manhole(1, '宮崎県', 2, { municipality: '宮崎市' }),
      manhole(2, '宮崎県', 0, { municipality: '宮崎市' }),
      manhole(9, '鹿児島県', 0, { municipality: '鹿児島市' }),
    ],
    '宮崎県'
  );

  assert.ok(overview);
  assert.equal(overview.total, 3);
  assert.equal(overview.withPhoto, 1);
  assert.equal(overview.missing, 2);
  assert.equal(overview.coverage, 33);
  assert.equal(overview.isComplete, false);
  // 延岡市 → 宮崎市 の五十音順。他県の蓋は混ざらない
  assert.deepEqual(
    overview.missingManholes.map((entry) => entry.id),
    [3, 2]
  );
  assert.deepEqual(
    overview.photographedManholes.map((entry) => entry.id),
    [1]
  );
});

test('市区町村が無い蓋は後ろに寄せる', () => {
  const overview = buildPrefectureOverview(
    [
      manhole(1, '宮崎県', 0, { municipality: null, building: '空港ビル' }),
      manhole(2, '宮崎県', 0, { municipality: '日南市' }),
    ],
    '宮崎県'
  );

  assert.deepEqual(overview?.missingManholes.map((entry) => entry.id), [2, 1]);
});

test('全部に写真がある県はコンプリート', () => {
  const overview = buildPrefectureOverview(
    [manhole(1, '徳島県', 1), manhole(2, '徳島県', 3)],
    '徳島県'
  );

  assert.equal(overview?.isComplete, true);
  assert.equal(overview?.missing, 0);
  assert.equal(overview?.coverage, 100);
});

test('蓋が1枚も無い県は null（空ページを 200 で返さない）', () => {
  const overview = buildPrefectureOverview([manhole(1, '宮崎県', 0)], '福井県');
  assert.equal(overview, null);
});

test('地図の中心は県内の蓋の中点。県庁所在地ではない', () => {
  const overview = buildPrefectureOverview(
    [
      manhole(1, '宮崎県', 0, { latitude: 31.0, longitude: 131.0 }),
      manhole(2, '宮崎県', 0, { latitude: 32.0, longitude: 131.4 }),
    ],
    '宮崎県'
  );

  assert.deepEqual(overview?.center, { lat: 31.5, lng: 131.2 });
});

test('座標を持たない蓋しか無ければ中心は null', () => {
  const overview = buildPrefectureOverview(
    [manhole(1, '宮崎県', 0, { latitude: null, longitude: null })],
    '宮崎県'
  );

  assert.equal(overview?.center, null);
});

test('地図のズームは蓋の散らばりから決める（県ごとの固定値にしない）', () => {
  // 1つの市に固まっている県
  const tight = buildPrefectureOverview(
    [
      manhole(1, '香川県', 0, { latitude: 34.34, longitude: 134.04 }),
      manhole(2, '香川県', 0, { latitude: 34.36, longitude: 134.06 }),
    ],
    '香川県'
  );
  // 端から端まで散っている県
  const wide = buildPrefectureOverview(
    [
      manhole(1, '北海道', 0, { latitude: 41.8, longitude: 140.7 }),
      manhole(2, '北海道', 0, { latitude: 45.4, longitude: 141.7 }),
    ],
    '北海道'
  );

  assert.ok((tight?.mapZoom ?? 0) > (wide?.mapZoom ?? 0));
  assert.equal(wide?.mapZoom, 7);
  assert.equal(tight?.mapZoom, 11);
});
