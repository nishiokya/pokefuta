import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesManholeQuery } from '../src/lib/manhole-search';

const manhole = {
  title: '指宿市 JR指宿駅前',
  prefecture: '鹿児島県',
  municipality: '指宿市',
  city: '指宿',
  pokemons: ['イーブイ', 'Eevee'],
};

test('空の検索語はすべてに一致する', () => {
  assert.equal(matchesManholeQuery(manhole, ''), true);
  assert.equal(matchesManholeQuery(manhole, '   '), true);
});

test('名前・県・市区町村・ポケモン名のどれかに含まれれば一致する', () => {
  assert.equal(matchesManholeQuery(manhole, '駅前'), true);
  assert.equal(matchesManholeQuery(manhole, '鹿児島'), true);
  assert.equal(matchesManholeQuery(manhole, '指宿市'), true);
  assert.equal(matchesManholeQuery(manhole, 'イーブイ'), true);
});

test('英字は大文字小文字を区別しない', () => {
  assert.equal(matchesManholeQuery(manhole, 'eevee'), true);
});

test('どこにも含まれなければ一致しない', () => {
  assert.equal(matchesManholeQuery(manhole, 'ピカチュウ'), false);
});

test('ポケモンや市区町村が無い蓋でも落ちない', () => {
  assert.equal(
    matchesManholeQuery({ title: 'x', prefecture: '東京都', municipality: null, pokemons: [] }, '東京'),
    true,
  );
});
