import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BADGE_REGIONS,
  POKEMON_BADGE_MIN_MANHOLES,
  buildPokemonBadges,
  buildThemeBadges,
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

test('ポケモンバッジは設置が多いポケモンだけ、多い順。1枚に同じ名前が2回あっても1枚', () => {
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

test('テーマは蓋のハッシュタグごとに多い順。1枚に同じタグが2回あっても1枚', () => {
  const manholes = [
    { id: 1, prefecture: '北海道', pokemons: [], hashtags: ['#道の駅ポケふた', '#道の駅ポケふた'] },
    { id: 2, prefecture: '北海道', pokemons: [], hashtags: ['#道の駅ポケふた', '#離島ポケふた'] },
    { id: 3, prefecture: '北海道', pokemons: [], hashtags: null },
  ];
  assert.deepEqual(buildThemeBadges(manholes, new Set([2])), [
    { name: '#道の駅ポケふた', total: 2, visited: 1 },
    { name: '#離島ポケふた', total: 1, visited: 1 },
  ]);
});
