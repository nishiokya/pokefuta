import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEARBY_RADIUS_KM,
  buildStatBadges,
  computeManholeStats,
  officialUrl,
} from '../src/lib/manhole-stats.ts';

// 128（宮城県大河原）を中心に、図鑑の実測バッジ
// 「宮城県 37枚 / 同じポケモン 38枚 / 30km以内に16件」と同じ数え方になることを見る。
const target = {
  id: 128,
  prefecture: '宮城県',
  city: '大河原',
  municipality: '大河原',
  pokemons: ['チェリム', 'ラプラス'],
  latitude: 38.0485032,
  longitude: 140.738089,
};

// 柴田(2.9km) / 村田(8.0km) は近傍、長崎は遠方。
const others = [
  { id: 129, prefecture: '宮城県', city: '柴田', municipality: '柴田', pokemons: ['フラベベ', 'ラプラス'], latitude: 38.0575, longitude: 140.7708 },
  { id: 130, prefecture: '宮城県', city: '村田', municipality: '村田', pokemons: ['ベロベルト', 'ラプラス'], latitude: 38.1178, longitude: 140.7228 },
  { id: 131, prefecture: '宮城県', city: '大河原', municipality: '大河原', pokemons: ['ピカチュウ'], latitude: 38.0486, longitude: 140.7381 },
  { id: 480, prefecture: '長崎県', city: '波佐見', municipality: '波佐見', pokemons: ['チェリム'], latitude: 33.1, longitude: 129.9 },
];
const all = [target, ...others];

test('都道府県と市区町村は自分を含めて数える', () => {
  const s = computeManholeStats(target, all);
  assert.equal(s.prefTotal, 4); // 128 + 柴田 + 村田 + 大河原もう1枚
  assert.equal(s.cityTotal, 2); // 128 + 131
});

test('同じポケモンと近傍は自分を除いて数える', () => {
  const s = computeManholeStats(target, all);
  // ラプラス: 129,130 ／ チェリム: 480 → 3枚（重複は1回だけ数える）
  assert.equal(s.samePokemonTotal, 3);
  // 129,130,131 が30km以内。長崎は圏外
  assert.equal(s.nearbyCount, 3);
});

test('緯度経度が無ければ近傍は0', () => {
  const s = computeManholeStats({ ...target, latitude: null, longitude: null }, all);
  assert.equal(s.nearbyCount, 0);
});

test('バッジの並びと文言', () => {
  const s = computeManholeStats(target, all);
  assert.deepEqual(buildStatBadges(target, s, []).map((b) => b.label), [
    '宮城県 4枚',
    '大河原 2枚',
    '同じポケモン 3枚',
    `${NEARBY_RADIUS_KM}km以内に3件`,
  ]);
});

test('市区町村が1枚ならそのバッジは出さない', () => {
  const alone = { ...target, city: '柴田田', municipality: '柴田田' };
  const s = computeManholeStats(alone, [alone, ...others]);
  assert.equal(s.cityTotal, 1);
  assert.ok(!buildStatBadges(alone, s, []).some((b) => b.key === 'city'));
});

test('称号と内容が重なるバッジは抑制する（図鑑 §2.3）', () => {
  const s = computeManholeStats(target, all);
  const t = (key: string) => [{ key, label: key, priority: 1, emoji: '', hashtag: '' }];

  assert.ok(!buildStatBadges(target, s, t('only_in_pref')).some((b) => b.key === 'pref'));
  assert.ok(!buildStatBadges(target, s, t('unique_pokemon')).some((b) => b.key === 'pref'));
  assert.ok(!buildStatBadges(target, s, t('lone')).some((b) => b.key === 'nearby'));
  // 無関係な称号では抑制しない
  assert.ok(buildStatBadges(target, s, t('rare_pokemon')).some((b) => b.key === 'pref'));
});

test('公式URLは local.pokemon.jp の https だけ通す', () => {
  assert.equal(
    officialUrl('https://local.pokemon.jp/manhole/desc/128/?is_modal=1'),
    'https://local.pokemon.jp/manhole/desc/128/?is_modal=1'
  );
  // 実データに5枚ある相対パス（長崎県の一部）
  assert.equal(officialUrl('/municipality/nagasaki/'), null);
  assert.equal(officialUrl('http://local.pokemon.jp/'), null);
  assert.equal(officialUrl('https://evil.example.com/local.pokemon.jp'), null);
  assert.equal(officialUrl('javascript:alert(1)'), null);
  assert.equal(officialUrl(''), null);
  assert.equal(officialUrl(null), null);
});
