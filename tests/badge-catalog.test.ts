import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BADGE_REGIONS,
  badgeRank,
  badgeRankThresholds,
  buildDesignManholeSticker,
  buildPlushSticker,
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

test('ポケモンバッジは1枚のポケモンも含めて全種類、多い順。1枚に同じ名前が2回あっても1枚', () => {
  const manholes = [
    ...Array.from({ length: 3 }, (_, i) => lid(i + 1, '北海道', ['ラッキー', 'ラッキー'])),
    ...Array.from({ length: 4 }, (_, i) => lid(i + 100, '北海道', ['ラプラス'])),
    lid(200, '北海道', ['ピカチュウ']),
  ];
  const badges = buildPokemonBadges(manholes, new Set([1, 100, 101]));
  assert.deepEqual(badges, [
    { name: 'ラプラス', total: 4, visited: 2 },
    { name: 'ラッキー', total: 3, visited: 1 },
    { name: 'ピカチュウ', total: 1, visited: 0 },
  ]);
});

test('バッジの段は 1/3 で銅・2/3 で銀・全部で金（切り捨て、少なくとも1枚）', () => {
  // 岐阜県（5枚）は 1枚で銅・3枚で銀・5枚で金
  assert.deepEqual(badgeRankThresholds(5), { bronze: 1, silver: 3, gold: 5 });
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((v) => badgeRank(v, 5)), [null, 'bronze', 'bronze', 'silver', 'silver', 'gold']);
  assert.deepEqual(badgeRankThresholds(50), { bronze: 16, silver: 33, gold: 50 });
  assert.equal(badgeRank(15, 50), null);
  assert.equal(badgeRank(42, 50), 'silver');
  // 1枚しかなければ1枚で金。2枚なら1枚で銀
  assert.equal(badgeRank(1, 1), 'gold');
  assert.equal(badgeRank(1, 2), 'silver');
  assert.equal(badgeRank(0, 0), null);
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

test('デザインふたステッカーは公開した投稿が1枚以上でもらえ、2枚目からは枚数を添える', () => {
  const none = buildDesignManholeSticker(0);
  assert.equal(none.earned, false);
  assert.equal(none.name, 'デザインふた投稿');
  assert.equal(buildDesignManholeSticker(1).earned, true);
  assert.equal(buildDesignManholeSticker(1).name, 'デザインふた投稿');
  assert.equal(buildDesignManholeSticker(3).name, 'デザインふた投稿 ×3');
  // 壊れた値はまだ扱い
  assert.equal(buildDesignManholeSticker(Number.NaN).earned, false);
  assert.equal(buildDesignManholeSticker(-2).earned, false);
});

test('ぬいぐるみステッカーはぬいぐるみが写った訪問が1回でもあればもらえ、2回目から回数を添える', () => {
  assert.equal(buildPlushSticker(0).earned, false);
  assert.equal(buildPlushSticker(1).earned, true);
  assert.equal(buildPlushSticker(1).name, 'ぬいぐるみと一緒');
  assert.equal(buildPlushSticker(4).name, 'ぬいぐるみと一緒 ×4');
  assert.equal(buildPlushSticker(Number.NaN).earned, false);
});
