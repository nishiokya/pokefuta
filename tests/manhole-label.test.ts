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

// 図鑑（data.pokefuta.com）のスナップショットと詳細ページの実測値（2026-09-23）。
const manhole273 = {
  prefecture: '愛知県',
  city: '豊橋',
  municipality: '豊橋',
  title: '愛知県/豊橋市',
  building: '道の駅とよはし',
  name: '豊橋市 道の駅とよはし',
  pokemons: ['スターミー', 'デンヂムシ'],
};

test('一覧の名前はスナップショットの name をそのまま使う — 写真館で組み立て直さない', () => {
  assert.equal(manholeDisplayName(manhole273), '豊橋市 道の駅とよはし');
  // 同じ自治体で区別が要るものは図鑑が住所やポケモン名で区別済み。building から作り直すと崩れる
  assert.equal(
    manholeDisplayName({ title: '奈良県/斑鳩町', municipality: '斑鳩', building: null, name: '斑鳩町 興留7' }),
    '斑鳩町 興留7'
  );
});

test('name が無いときは title → 県/市 → ポケふた に落とす（暫定。図鑑の規則ではない）', () => {
  assert.equal(manholeDisplayName({ ...manhole273, name: null }), '愛知県/豊橋市');
  assert.equal(manholeDisplayName({ ...manhole273, name: '  ' }), '愛知県/豊橋市');
  assert.equal(manholeDisplayName({ prefecture: '岩手県', municipality: '宮古' }), '岩手県/宮古');
  assert.equal(manholeDisplayName({}), 'ポケふた');
});

test('施設名は全角スペースと先頭の自治体名を整える', () => {
  assert.equal(landmarkLabel({ building: '指宿警察署　指宿中央交番', city: '指宿' }), '指宿警察署 指宿中央交番');
  assert.equal(landmarkLabel({ building: '指宿市 指宿図書館', city: '指宿' }), '指宿図書館');
});

test('詳細の見出しは施設名入り、<title> 用は今の形のまま', () => {
  assert.equal(manholeHeadingPlace(manhole273), '愛知県豊橋 道の駅とよはしのポケふた');
  assert.equal(manholeHeading(manhole273), '愛知県豊橋 道の駅とよはしのポケふた（スターミー・デンヂムシ）');
  assert.equal(manholePlaceLabel(manhole273), '愛知県豊橋のポケふた');
  assert.equal(manholeHeadingPlace({ ...manhole273, building: '' }), '愛知県豊橋のポケふた');
});
