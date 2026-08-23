import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPokemons,
  formatDistanceKm,
  manholeLabel,
  manholeLocationLabel,
  manholePlaceLabel,
  pokemonMetaLabel,
  pokemonText,
} from '../src/lib/manhole-label.ts';

// 図鑑（data.pokefuta.com/manholes/128/）の実測値。写真館の表示がここからズレたら落とす。
const manhole128 = {
  prefecture: '宮城県',
  city: '大河原',
  municipality: '大河原',
  pokemons: ['チェリム', 'ラプラス'],
  title: '宮城県/大河原町',
};

test('見出しラベルは図鑑の h1 と同一', () => {
  assert.equal(manholeLocationLabel(manhole128), '宮城県大河原');
  assert.equal(manholePlaceLabel(manhole128), '宮城県大河原のポケふた');
  assert.equal(manholeLabel(manhole128), '宮城県大河原のポケふた（チェリム・ラプラス）');
});

test('ポケモン名は省略しない — 省略すると共通ポケモンが消える', () => {
  // 128（チェリム・ラプラス）の「同じポケモンのポケふた」に出る蓋。
  // 3件で切っていた頃はラプラスが落ち、なぜ関連なのか読み取れなかった。
  const sendai = {
    prefecture: '宮城県',
    city: '仙台',
    municipality: '仙台',
    pokemons: ['ウミディグダ', 'チョンチー', 'ホエルコ', 'ラプラス'],
  };
  const label = manholeLabel(sendai);
  assert.equal(label, '宮城県仙台のポケふた（ウミディグダ・チョンチー・ホエルコ・ラプラス）');
  assert.ok(label.includes('ラプラス'));
});

test('OGP用の短縮形だけは3件＋ほか', () => {
  assert.equal(pokemonMetaLabel(['A', 'B', 'C']), 'A・B・C');
  assert.equal(pokemonMetaLabel(['A', 'B', 'C', 'D']), 'A・B・C ほか');
});

test('ポケモン名の配列に混ざる非ポケモンを落とす', () => {
  assert.deepEqual(filterPokemons(['ラプラス', '', '  ', 'ローカルActs 宮城']), ['ラプラス']);
  assert.equal(pokemonText([]), 'ポケモン');
  assert.equal(pokemonText(null), 'ポケモン');
});

test('city が無ければ municipality、どちらも無ければ title', () => {
  assert.equal(
    manholePlaceLabel({ prefecture: '宮城県', city: null, municipality: '大河原' }),
    '宮城県大河原のポケふた'
  );
  assert.equal(
    manholePlaceLabel({ prefecture: null, city: null, municipality: null, title: '宮城県/大河原町' }),
    '宮城県/大河原町のポケふた'
  );
});

test('距離は常に小数1桁 — 図鑑と同じ丸め', () => {
  // 128 → 角田。図鑑は 10.7 km、写真館は Math.round で 11 km と出ていた。
  assert.equal(formatDistanceKm(10.72), '10.7 km');
  assert.equal(formatDistanceKm(2.94), '2.9 km');
  assert.equal(formatDistanceKm(8), '8.0 km');
});
