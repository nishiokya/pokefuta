import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyArea } from '../src/lib/nearby-area.ts';

test('最寄りの蓋から地域を推定し、近い順に県の図鑑リンクを出す', () => {
  const result = nearbyArea([
    { prefecture: '岐阜県', municipality: '各務原', distance: 26.5 },
    { prefecture: '愛知県', municipality: '名古屋', distance: 4.6 },
    { prefecture: '三重県', municipality: '桑名', distance: 23.9 },
    { prefecture: '愛知県', municipality: '瀬戸', distance: 15.6 },
  ]);
  assert.equal(result.areaLabel, '愛知県名古屋');
  assert.deepEqual(
    result.prefectures.map((p) => p.name),
    ['愛知県', '三重県', '岐阜県']
  );
  assert.equal(result.prefectures[0].dexUrl, 'https://data.pokefuta.com/prefectures/aichi/');
});

test('最寄りが遠いときは地域を言い切らない。県のリンクは出す', () => {
  const result = nearbyArea([{ prefecture: '北海道', municipality: '札幌', distance: 42 }]);
  assert.equal(result.areaLabel, null);
  assert.deepEqual(result.prefectures.map((p) => p.name), ['北海道']);
});

test('県は最大3つ。距離の無い蓋は使わない', () => {
  const result = nearbyArea([
    { prefecture: '東京都', distance: 1 },
    { prefecture: '神奈川県', distance: 2 },
    { prefecture: '埼玉県', distance: 3 },
    { prefecture: '千葉県', distance: 4 },
    { prefecture: '茨城県' },
  ]);
  assert.deepEqual(result.prefectures.map((p) => p.name), ['東京都', '神奈川県', '埼玉県']);
});

test('空なら何も出さない', () => {
  assert.deepEqual(nearbyArea([]), { areaLabel: null, prefectures: [] });
});
