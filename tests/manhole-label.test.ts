import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPokemons,
  formatDistanceKm,
  landmarkLabel,
  manholeDisplayName,
  manholeHeading,
  manholeHeadingPlace,
  manholeLabel,
  manholeLocationLabel,
  manholePlaceLabel,
  municipalityLabel,
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
  assert.equal(manholeHeading(manhole128), '宮城県大河原のポケふた（チェリム・ラプラス）');
  assert.equal(manholeLabel(manhole128), '宮城県大河原のポケふた（チェリム・ラプラス）');
});

test('ポケモンが無いとき、見出しは括弧ごと落とす / カードは「ポケモン」を出す', () => {
  // 図鑑は h1 と関連カードで規則が違う。1本に畳むと見出しが
  // 「〜のポケふた（ポケモン）」になってしまうので分けている。
  const noPokemon = { prefecture: '宮城県', city: '大河原', pokemons: [] };
  assert.equal(manholeHeading(noPokemon), '宮城県大河原のポケふた');
  assert.equal(manholeLabel(noPokemon), '宮城県大河原のポケふた（ポケモン）');
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

// 図鑑（data.pokefuta.com）の地図の見出し・詳細ページの実測値（2026-09-23）。
const manhole273 = {
  prefecture: '愛知県',
  city: '豊橋',
  municipality: '豊橋',
  title: '愛知県/豊橋市',
  address: '愛知県豊橋市東七根町一の沢113-2',
  building: '道の駅とよはし',
  pokemons: ['スターミー', 'デンヂムシ'],
};

test('一覧の名前は図鑑の見出しと同じ「市区町村 施設名」— 「豊橋・道の駅とよはし」にしない', () => {
  assert.equal(manholeDisplayName(manhole273), '豊橋市 道の駅とよはし');
  assert.equal(
    manholeDisplayName({
      prefecture: '愛知県', city: '名古屋市中区', municipality: '名古屋市中区', title: '愛知県/名古屋市',
      building: '金シャチ横丁　宗春ゾーン（東門エリア）',
    }),
    '名古屋市中区 金シャチ横丁 宗春ゾーン（東門エリア）'
  );
});

test('施設名が無ければ title の「県/市」のまま', () => {
  assert.equal(
    manholeDisplayName({ prefecture: '岩手県', city: '宮古', municipality: '宮古', title: '岩手県/宮古市', building: null }),
    '岩手県/宮古市'
  );
  assert.equal(manholeDisplayName({ prefecture: '岩手県', municipality: '宮古' }), '岩手県/宮古');
  assert.equal(manholeDisplayName({}), 'ポケふた');
});

test('自治体名の接尾辞は住所 → title の順で補う', () => {
  assert.equal(municipalityLabel({ city: '豊橋', address: '愛知県豊橋市東七根町' }), '豊橋市');
  assert.equal(municipalityLabel({ city: '斜里', title: '北海道/斜里町' }), '斜里町');
  assert.equal(municipalityLabel({ city: '斜里' }), '');
});

test('施設名は全角スペースと先頭の自治体名を整える', () => {
  assert.equal(landmarkLabel({ building: '指宿警察署　指宿中央交番', city: '指宿', title: '鹿児島県/指宿市' }), '指宿警察署 指宿中央交番');
  assert.equal(landmarkLabel({ building: '指宿市 指宿図書館', city: '指宿', title: '鹿児島県/指宿市' }), '指宿図書館');
});

test('詳細の見出しは施設名入り、<title> 用は今の形のまま', () => {
  assert.equal(manholeHeadingPlace(manhole273), '愛知県豊橋 道の駅とよはしのポケふた');
  assert.equal(manholeHeading(manhole273), '愛知県豊橋 道の駅とよはしのポケふた（スターミー・デンヂムシ）');
  assert.equal(manholePlaceLabel(manhole273), '愛知県豊橋のポケふた');
  assert.equal(manholeHeadingPlace({ ...manhole273, building: '' }), '愛知県豊橋のポケふた');
});
