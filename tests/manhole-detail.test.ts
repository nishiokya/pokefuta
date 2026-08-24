import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEARBY_LIMIT,
  SAME_POKEMON_LIMIT,
  buildManholeDetail,
} from '../src/lib/manhole-detail.ts';

const target = {
  id: 128,
  prefecture: '宮城県',
  city: '大河原',
  municipality: '大河原',
  pokemons: ['チェリム', 'ラプラス'],
  latitude: 38.0485032,
  longitude: 140.738089,
  titles: [],
};

const near = (id: number, city: string, pokemons: string[], lat: number, lng: number) => ({
  id, prefecture: '宮城県', city, municipality: city, pokemons, latitude: lat, longitude: lng, titles: [],
});

const others = [
  near(129, '柴田', ['フラベベ', 'ラプラス'], 38.0575, 140.7708),
  near(130, '村田', ['ベロベルト', 'ラプラス'], 38.1178, 140.7228),
  near(131, '角田', ['ラティアス', 'ラプラス'], 37.9769, 140.7806),
  // 30km圏外・ポケモンも重ならない
  { id: 480, prefecture: '長崎県', city: '波佐見', municipality: '波佐見', pokemons: ['カイロス'], latitude: 33.1, longitude: 129.9, titles: [] },
];

test('近傍は距離順・ラベル込みで返る', () => {
  const d = buildManholeDetail(target, [target, ...others]);
  assert.deepEqual(d.nearby.map((n) => n.id), [129, 130, 131]);
  assert.equal(d.nearby[0].label, '宮城県柴田のポケふた（フラベベ・ラプラス）');
  // 距離は昇順
  const ds = d.nearby.map((n) => n.distanceKm!);
  assert.deepEqual([...ds].sort((a, b) => a - b), ds);
  // 圏外は入らない
  assert.ok(!d.nearby.some((n) => n.id === 480));
});

test('同じポケモンはラベル込み、自分は入らない', () => {
  const d = buildManholeDetail(target, [target, ...others]);
  // id 降順。旧実装が `/api/manholes` の id 降順リストを slice していたのと同じ並び
  assert.deepEqual(d.samePokemon.map((n) => n.id), [131, 130, 129]);
  assert.ok(!d.samePokemon.some((n) => n.id === 128));
  assert.ok(!d.samePokemon.some((n) => n.id === 480));
  // 関連の理由になっているポケモンがラベルに残っている
  assert.ok(d.samePokemon.every((n) => n.label.includes('ラプラス')));
});

test('件数の上限は図鑑に合わせる', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    near(1000 + i, `市${i}`, ['ラプラス'], 38.05 + i * 0.001, 140.74)
  );
  const d = buildManholeDetail(target, [target, ...many]);
  assert.equal(d.nearby.length, NEARBY_LIMIT);
  assert.equal(d.samePokemon.length, SAME_POKEMON_LIMIT);
});

test('緯度経度が無ければ近傍は空', () => {
  const d = buildManholeDetail({ ...target, latitude: null, longitude: null }, [target, ...others]);
  assert.deepEqual(d.nearby, []);
  // 同じポケモンは座標に依存しないので残る
  assert.ok(d.samePokemon.length > 0);
});

test('入力の並び順が変わっても結果は変わらない', () => {
  // 候補の並びは呼び出し側（スナップショットの生成順）に依存させない。
  // 生成側が `order=id.desc` をやめただけで、出る10件が黙って入れ替わるのを防ぐ。
  const many = Array.from({ length: 20 }, (_, i) =>
    near(200 + i, `市${i}`, ['ラプラス'], 38.05 + i * 0.002, 140.74)
  );
  const asc = buildManholeDetail(target, [target, ...many]);
  const desc = buildManholeDetail(target, [target, ...[...many].reverse()]);
  const shuffled = buildManholeDetail(target, [...many.slice(7), target, ...many.slice(0, 7)]);

  assert.deepEqual(asc.samePokemon, desc.samePokemon);
  assert.deepEqual(asc.samePokemon, shuffled.samePokemon);
  assert.deepEqual(asc.nearby, desc.nearby);
  assert.deepEqual(asc.nearby, shuffled.nearby);
  // 旧実装（/api/manholes の id 降順リストを slice）と同じ並び
  assert.deepEqual(asc.samePokemon.map((n) => n.id), [219, 218, 217, 216, 215, 214, 213, 212, 211, 210]);
});

test('統計とバッジも一緒に返る', () => {
  const d = buildManholeDetail(target, [target, ...others]);
  assert.equal(d.stats.prefTotal, 4);
  assert.equal(d.stats.samePokemonTotal, 3);
  assert.ok(d.statBadges.some((b) => b.key === 'pref'));
});
