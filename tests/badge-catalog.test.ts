import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BADGE_REGIONS,
  POKEMON_BADGE_MIN_MANHOLES,
  buildPokemonBadges,
  THEME_BADGES,
  buildThemeBadges,
  pokemonBadgeManholeIds,
  buildPrefectureBadges,
} from '../src/lib/badge-catalog';
import { PREFECTURE_SLUGS } from '../src/lib/prefectureSlug';

const lid = (id: number, prefecture: string, pokemons: string[]) => ({ id, prefecture, pokemons });

test('6地方で47都道府県をちょうど1回ずつ持つ', () => {
  const listed = BADGE_REGIONS.flatMap(([, prefectures]) => prefectures);
  assert.equal(BADGE_REGIONS.length, 6);
  assert.deepEqual([...listed].sort(), Object.keys(PREFECTURE_SLUGS).sort());
});

test('都道府県バッジは設置のある県だけを地方ごとに北から並べ、訪問済みを数える', () => {
  const manholes = [lid(1, '沖縄県', []), lid(2, '北海道', []), lid(3, '北海道', []), lid(4, '青森県', [])];
  const groups = buildPrefectureBadges(manholes, new Set([2, 4]));
  assert.deepEqual(groups.map((g) => g.region), ['北海道・東北', '九州・沖縄']);
  assert.deepEqual(groups[0].prefectures, [
    { name: '北海道', total: 2, visited: 1 },
    { name: '青森県', total: 1, visited: 1 },
  ]);
  assert.deepEqual(groups[1].prefectures, [{ name: '沖縄県', total: 1, visited: 0 }]);
});

test('ポケモンバッジは3枚以上のポケモンだけ、多い順。1枚に同じ名前が2回あっても1枚', () => {
  const manholes = [
    ...Array.from({ length: POKEMON_BADGE_MIN_MANHOLES }, (_, i) => lid(i + 1, '北海道', ['ラッキー', 'ラッキー'])),
    ...Array.from({ length: POKEMON_BADGE_MIN_MANHOLES + 1 }, (_, i) => lid(i + 100, '北海道', ['ラプラス'])),
    lid(200, '北海道', ['ピカチュウ']),
  ];
  const badges = buildPokemonBadges(manholes, new Set([1, 100, 101]));
  assert.deepEqual(badges, [
    { name: 'ラプラス', total: POKEMON_BADGE_MIN_MANHOLES + 1, visited: 2 },
    { name: 'ラッキー', total: POKEMON_BADGE_MIN_MANHOLES, visited: 1 },
  ]);
});

test('ステッカーは対象の蓋を1枚でも訪問すればもらえる。蓋の無いステッカーは出さない', () => {
  const gundam = THEME_BADGES.find((b) => b.key === 'gundam')!.tag;
  const north = THEME_BADGES.find((b) => b.key === 'north')!.tag;
  const manholes = [
    { id: 1, prefecture: '北海道', pokemons: [], hashtags: [gundam] },
    { id: 2, prefecture: '北海道', pokemons: [], hashtags: [gundam, north] },
    { id: 3, prefecture: '北海道', pokemons: [], hashtags: null },
  ];
  const stickers = buildThemeBadges(manholes, new Set([1]));
  assert.deepEqual(
    stickers.map((s) => [s.key, s.total, s.visited, s.earned]),
    [['gundam', 2, 1, true], ['north', 1, 0, false]],
  );
});

test('ポケモンバッジのメダルは代表マンホール、代表がそのポケモンの蓋でなければ id の小さい蓋', () => {
  const manholes = [lid(5, '北海道', ['ラッキー']), lid(9, '北海道', ['ラッキー']), lid(7, '北海道', ['ラプラス'])];
  const ids = pokemonBadgeManholeIds(manholes, new Map([['ラッキー', 9], ['ラプラス', 99]]));
  assert.equal(ids.get('ラッキー'), 9);
  assert.equal(ids.get('ラプラス'), 7);
});
